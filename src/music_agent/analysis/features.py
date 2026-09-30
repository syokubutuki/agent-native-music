"""Audio feature extraction for diagnostics (NOT a quality score).

Everything is computed with numpy/scipy (+ pyloudnorm) so results are
identical across platforms. Features are grouped:

    global      loudness, peaks, crest, clipping
    sections    per-section loudness, spectrum, width, onset density, chroma
    bars        per-bar loudness progression (energy curve)
    contrast    deltas between consecutive sections
    stems       kick/bass overlap, lead audibility, low-end mono compatibility
"""
from __future__ import annotations

import numpy as np
import pyloudnorm as pyln
from scipy.signal import stft

from ..score import Score
from ..synthesis.dsp import amp_to_db, true_peak_db

BANDS = {"sub": (20, 60), "low": (60, 250), "lowmid": (250, 2000), "highmid": (2000, 6000), "high": (6000, 20000)}

# Krumhansl-Kessler key profiles
_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
_PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _spec(mono: np.ndarray, sr: int, nfft: int = 4096, hop: int = 1024):
    f, _, Z = stft(mono, sr, nperseg=nfft, noverlap=nfft - hop, boundary=None, padded=False)
    return f, np.abs(Z)


def spectral_stats(mono: np.ndarray, sr: int) -> dict:
    if len(mono) < 4096:
        return {}
    f, S = _spec(mono, sr)
    P = S ** 2
    # centroid / bandwidth / rolloff on the magnitude spectrum (librosa convention)
    mag = S.sum(axis=0) + 1e-12
    centroid = (f[:, None] * S).sum(axis=0) / mag
    bw = np.sqrt((((f[:, None] - centroid[None, :]) ** 2) * S).sum(axis=0) / mag)
    cum = np.cumsum(S, axis=0) / mag
    rolloff = f[np.argmax(cum >= 0.85, axis=0)]
    tot = P.sum(axis=0) + 1e-12
    w = tot / tot.sum()  # energy-weighted averages over frames (silence does not dominate)
    bands = {}
    band_total = P.sum()
    for name, (lo, hi) in BANDS.items():
        m = (f >= lo) & (f < hi)
        bands[name] = float(P[m].sum() / (band_total + 1e-12))
    # spectral flux onset density
    flux = np.maximum(0, np.diff(np.log1p(S * 100), axis=1)).sum(axis=0)
    thr = np.median(flux) + 1.5 * np.std(flux)
    peaks = (flux[1:-1] > thr) & (flux[1:-1] >= flux[:-2]) & (flux[1:-1] >= flux[2:])
    dur = len(mono) / sr
    # chroma: fold 80 Hz - 5 kHz magnitude bins onto pitch classes
    # (magnitude, not power, so the sub-bass does not dominate)
    m = (f >= 80) & (f <= 5000)
    pcs = (np.round(12 * np.log2(f[m] / 440.0)) + 9) % 12
    chroma = np.zeros(12)
    e = S[m].sum(axis=1)
    for pc in range(12):
        chroma[pc] = e[pcs == pc].sum()
    chroma = chroma / (chroma.sum() + 1e-12)
    return {
        "centroid_hz": float((centroid * w).sum()),
        "bandwidth_hz": float((bw * w).sum()),
        "rolloff85_hz": float((rolloff * w).sum()),
        "band_share": bands,
        "onsets_per_sec": float(peaks.sum() / dur),
        "chroma": [float(c) for c in chroma],
    }


def key_estimate(chroma: np.ndarray) -> list[tuple[str, float]]:
    scores = []
    for t in range(12):
        for name, prof in (("major", _MAJ), ("minor", _MIN)):
            r = np.corrcoef(chroma, np.roll(prof, t))[0, 1]
            scores.append((f"{_PC[t]} {name}", float(r)))
    return sorted(scores, key=lambda s: -s[1])


def stereo_stats(x: np.ndarray, sr: int | None = None) -> dict:
    m = 0.5 * (x[0] + x[1])
    s = 0.5 * (x[0] - x[1])
    em, es = np.sum(m ** 2) + 1e-12, np.sum(s ** 2)
    corr = float(np.sum(x[0] * x[1]) / (np.sqrt(np.sum(x[0] ** 2) * np.sum(x[1] ** 2)) + 1e-12))
    out = {"side_to_mid_db": float(10 * np.log10(es / em + 1e-12)), "lr_correlation": corr}
    if sr is not None and x.shape[1] > 1024:
        # Width above 300 Hz: the full-band ratio is dominated by the (mono) sub
        # and reports "narrower" whenever the bass gets louder.
        from scipy.signal import butter, sosfilt

        sos = butter(4, 300, "highpass", fs=sr, output="sos")
        h = sosfilt(sos, x, axis=-1)
        hm, hs = 0.5 * (h[0] + h[1]), 0.5 * (h[0] - h[1])
        out["side_to_mid_300_db"] = float(10 * np.log10((np.sum(hs ** 2) + 1e-12) / (np.sum(hm ** 2) + 1e-12)))
    return out


def _lufs(meter, x: np.ndarray) -> float | None:
    if x.shape[1] < int(0.45 * meter.rate):
        return None
    v = meter.integrated_loudness(x.T)
    return float(v) if np.isfinite(v) else None


def _band_env(x: np.ndarray, sr: int, lo: float, hi: float, frame: int = 441) -> np.ndarray:
    from scipy.signal import butter, sosfilt

    sos = butter(4, [lo, hi], "bandpass", fs=sr, output="sos")
    y = sosfilt(sos, x.mean(axis=0))
    nfr = len(y) // frame
    return np.sqrt((y[: nfr * frame].reshape(nfr, frame) ** 2).mean(axis=1))


def stem_diagnostics(score: Score, post_fader: dict[str, np.ndarray], sr: int) -> dict:
    out: dict = {}
    kick = post_fader.get("kick")
    bass = post_fader.get("bass")
    if kick is not None and bass is not None:
        ke, be = _band_env(kick, sr, 30, 150), _band_env(bass, sr, 30, 150)
        kt = ke > 0.25 * ke.max() if ke.max() > 0 else np.zeros_like(ke, bool)
        overlap = float(np.sum(np.minimum(ke, be)[kt]) / (np.sum(be) + 1e-12))
        out["kick_bass"] = {
            "low_overlap_ratio": overlap,  # share of bass low-band energy colliding with kick hits
            "kick_to_bass_low_db": float(20 * np.log10((ke.mean() + 1e-12) / (be.mean() + 1e-12))),
        }
    lead_names = [t.name for t in score.tracks if t.role == "lead" and t.name in post_fader]
    if lead_names:
        lead = sum(post_fader[n] for n in lead_names)
        rest = sum(v for k, v in post_fader.items() if k not in lead_names)
        le, re = _band_env(lead, sr, 1000, 5000), _band_env(rest, sr, 1000, 5000)
        active = le > 0.1 * le.max() if le.max() > 0 else np.zeros_like(le, bool)
        if active.any():
            out["lead_presence"] = {
                "lead_to_rest_1k5k_db": float(20 * np.log10((le[active].mean() + 1e-12) / (re[active].mean() + 1e-12))),
                "active_fraction": float(active.mean()),
            }
    low = {}
    from scipy.signal import butter, sosfilt

    mix = sum(post_fader.values()) if post_fader else None
    if mix is not None:
        sos = butter(4, 150, "lowpass", fs=sr, output="sos")
        lo = sosfilt(sos, mix, axis=-1)
        low = stereo_stats(lo)
        out["low_end_stereo"] = low
    return out


def analyze(x: np.ndarray, sr: int, score: Score, post_fader: dict[str, np.ndarray] | None = None,
            declared_key: str | None = None) -> dict:
    meter = pyln.Meter(sr)
    mono = x.mean(axis=0)
    peak = float(np.max(np.abs(x)))
    rms = float(np.sqrt(np.mean(x ** 2)))
    lufs = _lufs(meter, x)
    res: dict = {
        "global": {
            "duration_sec": x.shape[1] / sr,
            "peak_dbfs": float(amp_to_db(peak)),
            "true_peak_dbtp": true_peak_db(x),
            "rms_dbfs": float(amp_to_db(rms)),
            "lufs_integrated": lufs,
            "crest_db": float(amp_to_db(peak) - amp_to_db(rms)),
            "clipped_samples": int(np.sum(np.abs(x) >= 0.9999)),
            "dc_offset": float(np.mean(mono)),
            **stereo_stats(x, sr),
        }
    }
    spb = score.sec_per_beat()
    secs = []
    chroma_all = np.zeros(12)
    for s in score.sections:
        a, b = int(s.start_beat * spb * sr), int(s.end_beat * spb * sr)
        seg = x[:, a:b]
        st = spectral_stats(seg.mean(axis=0), sr)
        if st:
            chroma_all += np.array(st["chroma"]) * np.sum(seg ** 2)
        secs.append({"name": s.name, "start_sec": a / sr, "end_sec": b / sr, "energy_target": s.energy,
                     "lufs": _lufs(meter, seg), "rms_dbfs": float(amp_to_db(np.sqrt(np.mean(seg ** 2)))),
                     **stereo_stats(seg, sr), **st})
    res["sections"] = secs
    # bar-level loudness progression
    bars = []
    bar_len = score.beats_per_bar * spb
    nb = int(np.ceil(x.shape[1] / sr / bar_len))
    for i in range(nb):
        a, b = int(i * bar_len * sr), min(x.shape[1], int((i + 1) * bar_len * sr))
        seg = x[:, a:b]
        bars.append({"bar": i, "lufs": _lufs(meter, seg), "rms_dbfs": float(amp_to_db(np.sqrt(np.mean(seg ** 2) + 1e-20)))})
    res["bars"] = bars
    # section contrast
    contrast = []
    for p, q in zip(secs, secs[1:]):
        d = {"from": p["name"], "to": q["name"]}
        if p.get("lufs") is not None and q.get("lufs") is not None:
            d["lufs_delta"] = q["lufs"] - p["lufs"]
        for k in ("centroid_hz", "onsets_per_sec", "side_to_mid_db", "side_to_mid_300_db"):
            if k in p and k in q:
                d[f"{k}_delta"] = q[k] - p[k]
        if "band_share" in p and "band_share" in q:
            d["band_share_delta"] = {b: q["band_share"][b] - p["band_share"][b] for b in BANDS}
        contrast.append(d)
    res["contrast"] = contrast
    # Tonality from pitched stems only: drums (kick pitch sweeps, noise) pollute chroma.
    pitched = [t.name for t in score.tracks if t.kind not in ("drums", "fx")]
    if post_fader and any(k in post_fader for k in pitched):
        tonal = sum(post_fader[k] for k in pitched if k in post_fader)
        st = spectral_stats(tonal.mean(axis=0), sr)
        chroma_all = np.array(st["chroma"]) if st else chroma_all
        res["tonality_source"] = "pitched stems"
    else:
        res["tonality_source"] = "full mix"
    if chroma_all.sum() > 0:
        ch = chroma_all / chroma_all.sum()
        ranking = key_estimate(ch)
        res["tonality"] = {"chroma": [float(c) for c in ch], "top_keys": ranking[:3]}
        if declared_key:
            names = [k for k, _ in ranking]
            dk = declared_key.replace("minor", "minor").strip()
            res["tonality"]["declared"] = dk
            res["tonality"]["declared_rank"] = names.index(dk) + 1 if dk in names else None
    if post_fader:
        res["stems"] = stem_diagnostics(score, post_fader, sr)
    return res
