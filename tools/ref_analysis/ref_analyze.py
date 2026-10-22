"""Reference-track analysis for listening-preference research.

Usage:
  python ref_analyze.py overview <wav> <outdir> [--name N]
  python ref_analyze.py segment  <wav> <outdir> <t0> <t1> [--name N] [--bpm B]

Produces: features.npz, summary.json, overview.png (overview) or
          seg_<t0>-<t1>.json / .png (segment, fine resolution).
No musical content is hard-coded; this is a measurement tool only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import librosa
import librosa.display
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import soundfile as sf
from scipy import signal

SR = 22050
HOP = 512
BANDS = {"sub": (20, 60), "low": (60, 250), "lowmid": (250, 2000), "highmid": (2000, 6000), "high": (6000, 11000)}


def load(path: str):
    x, sr = sf.read(path, always_2d=True, dtype="float32")
    if sr != 44100:
        x = librosa.resample(x.T, orig_sr=sr, target_sr=44100).T
        sr = 44100
    mono = librosa.resample(x.mean(axis=1), orig_sr=sr, target_sr=SR)
    return x, sr, mono


def db(a, floor=-90.0):
    return np.maximum(20 * np.log10(np.maximum(a, 1e-9)), floor)


def frame_features(mono: np.ndarray, x44: np.ndarray, sr44: int, hop: int = HOP) -> dict:
    S = np.abs(librosa.stft(mono, n_fft=2048, hop_length=hop)) ** 2
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    rms = librosa.feature.rms(S=np.sqrt(S), frame_length=2048, hop_length=hop)[0]
    cent = librosa.feature.spectral_centroid(S=np.sqrt(S), sr=SR)[0]
    flat = librosa.feature.spectral_flatness(S=np.sqrt(S))[0]
    roll = librosa.feature.spectral_rolloff(S=np.sqrt(S), sr=SR, roll_percent=0.85)[0]
    onset_env = librosa.onset.onset_strength(S=librosa.power_to_db(S), sr=SR)
    total = S.sum(axis=0) + 1e-12
    bands = {}
    for k, (lo, hi) in BANDS.items():
        m = (freqs >= lo) & (freqs < hi)
        bands[k] = S[m].sum(axis=0) / total
    # harmonic / percussive ratio
    H, P = librosa.decompose.hpss(np.sqrt(S))
    hp_ratio = (H ** 2).sum(axis=0) / ((P ** 2).sum(axis=0) + 1e-12)
    # stereo width at 44.1k, frame aligned to 22.05k hop (hop*2 samples)
    hop44 = hop * 2
    n = len(rms)
    L, R = x44[:, 0], x44[:, min(1, x44.shape[1] - 1)]
    mid, side = (L + R) / 2, (L - R) / 2
    width = np.zeros(n)
    corr = np.zeros(n)
    for i in range(n):
        a, b = i * hop44, i * hop44 + 2048 * 2
        m, s = mid[a:b], side[a:b]
        l_, r_ = L[a:b], R[a:b]
        if len(m) < 64:
            break
        width[i] = np.sqrt((s ** 2).mean() + 1e-12) / np.sqrt((m ** 2).mean() + 1e-12)
        d = np.sqrt((l_ ** 2).sum() * (r_ ** 2).sum()) + 1e-12
        corr[i] = (l_ * r_).sum() / d
    chroma = librosa.feature.chroma_cqt(y=mono, sr=SR, hop_length=hop)
    t = librosa.frames_to_time(np.arange(n), sr=SR, hop_length=hop)
    return dict(t=t, rms_db=db(rms), centroid=cent, flatness=flat, rolloff=roll, onset_env=onset_env,
                hp_ratio=hp_ratio, width=width, corr=corr, chroma=chroma, **{f"band_{k}": v for k, v in bands.items()})


KK_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def key_estimate(chroma: np.ndarray, top=3):
    prof = chroma.mean(axis=1)
    out = []
    for i in range(12):
        out.append((f"{NOTES[i]} major", float(np.corrcoef(np.roll(KK_MAJ, i), prof)[0, 1])))
        out.append((f"{NOTES[i]} minor", float(np.corrcoef(np.roll(KK_MIN, i), prof)[0, 1])))
    return sorted(out, key=lambda z: -z[1])[:top]


def tempo_info(mono: np.ndarray) -> dict:
    """Tempo without the numba beat tracker (segfaults with this numpy)."""
    oenv = librosa.onset.onset_strength(y=mono, sr=SR, hop_length=HOP)
    tg = librosa.feature.tempogram(onset_envelope=oenv, sr=SR, hop_length=HOP, win_length=384)
    tempo = float(librosa.feature.tempo(onset_envelope=oenv, sr=SR, hop_length=HOP, aggregate=np.median)[0])
    # local tempo every ~4.5 s (frame) -> stability
    freqs = librosa.tempo_frequencies(tg.shape[0], sr=SR, hop_length=HOP)
    valid = (freqs >= 50) & (freqs <= 220)
    loc = freqs[valid][tg[valid].argmax(axis=0)]
    # phase of a fixed grid
    beat = 60.0 / tempo
    bf = beat * SR / HOP
    best, best_off = -1, 0
    for off in np.linspace(0, bf, 32, endpoint=False):
        idx = np.round(np.arange(off, len(oenv), bf)).astype(int)
        v = oenv[idx[idx < len(oenv)]].sum()
        if v > best:
            best, best_off = v, off
    bt = librosa.frames_to_time(np.arange(best_off, len(oenv), bf), sr=SR, hop_length=HOP)
    return dict(bpm=tempo, beat_times=bt.tolist(), ibi_cv=float(np.std(loc) / np.mean(loc)),
                local_tempo_p10_p90=[float(np.percentile(loc, 10)), float(np.percentile(loc, 90))])


def structure(mono: np.ndarray, k: int = 10):
    """Rough section boundaries from MFCC+chroma agglomerative clustering."""
    mf = librosa.feature.mfcc(y=mono, sr=SR, hop_length=HOP, n_mfcc=13)
    ch = librosa.feature.chroma_cqt(y=mono, sr=SR, hop_length=HOP)
    X = np.vstack([librosa.util.normalize(mf, axis=1), ch])
    # smooth with 2s window
    X = signal.medfilt(X, kernel_size=(1, 2 * int(2 * SR / HOP) // 2 + 1))
    bounds = librosa.segment.agglomerative(X, k)
    return librosa.frames_to_time(bounds, sr=SR, hop_length=HOP).tolist()


def overview(wav: str, outdir: str, name: str):
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    x44, sr44, mono = load(wav)
    F = frame_features(mono, x44, sr44)
    tmp = tempo_info(mono)
    dur = len(mono) / SR
    # silence / low-level stats
    r = F["rms_db"]
    summary = dict(
        name=name, duration_s=dur, bpm=tmp["bpm"], ibi_cv=tmp["ibi_cv"],
        key_top3=key_estimate(F["chroma"]),
        rms_db_mean=float(r.mean()), rms_db_p95=float(np.percentile(r, 95)), rms_db_p5=float(np.percentile(r, 5)),
        dynamic_range_p95_p5=float(np.percentile(r, 95) - np.percentile(r, 5)),
        silence_ratio_lt_m50=float((r < -50).mean()),
        centroid_mean=float(F["centroid"].mean()), width_mean=float(F["width"].mean()), corr_mean=float(F["corr"].mean()),
        bands_mean={k: float(F[f"band_{k}"].mean()) for k in BANDS},
        onsets_per_s=float(len(librosa.onset.onset_detect(onset_envelope=F["onset_env"], sr=SR, hop_length=HOP)) / dur),
        sections=structure(mono),
    )
    np.savez_compressed(out / "features.npz", **{k: v for k, v in F.items()})
    (out / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    plot_overview(F, mono, summary, out / "overview.png")
    return summary


def plot_overview(F, mono, summary, path):
    t = F["t"]
    fig, axes = plt.subplots(7, 1, figsize=(16, 18), sharex=True)
    ax = axes[0]
    ax.plot(t, F["rms_db"], lw=0.6)
    ax.set_ylabel("RMS dB")
    ax.set_title(f"{summary['name']}  bpm~{summary['bpm']:.1f}  key~{summary['key_top3'][0][0]}  dur {summary['duration_s']:.0f}s")
    for s in summary["sections"]:
        for a in axes:
            a.axvline(s, color="k", alpha=0.15, lw=0.8)
    axes[1].plot(t, F["centroid"], lw=0.6, color="C1"); axes[1].set_ylabel("centroid Hz")
    axes[2].plot(t, F["onset_env"], lw=0.5, color="C2"); axes[2].set_ylabel("onset str")
    for k in BANDS:
        axes[3].plot(t, F[f"band_{k}"], lw=0.6, label=k)
    axes[3].legend(ncol=5, fontsize=7); axes[3].set_ylabel("band ratio")
    axes[4].plot(t, F["width"], lw=0.6, color="C4"); axes[4].set_ylabel("width S/M")
    axes[4].plot(t, F["corr"], lw=0.6, color="C5", alpha=0.6)
    axes[5].plot(t, np.log10(F["hp_ratio"] + 1e-6), lw=0.6, color="C6"); axes[5].set_ylabel("log10 H/P")
    axes[5].plot(t, F["flatness"] * 10, lw=0.5, color="C7", alpha=0.6)
    D = librosa.amplitude_to_db(np.abs(librosa.stft(mono, n_fft=2048, hop_length=HOP)), ref=np.max)
    librosa.display.specshow(D, sr=SR, hop_length=HOP, x_axis="time", y_axis="log", ax=axes[6], cmap="magma")
    axes[6].set_ylabel("spec")
    axes[6].set_xlabel("time (s)")
    plt.tight_layout()
    fig.savefig(path, dpi=80)
    plt.close(fig)


# ---------------------------------------------------------------- segment ---

def vocal_pitch(x44: np.ndarray, sr44: int, t0: float, t1: float):
    """Rough lead/vocal pitch: mid channel, harmonic part, pyin. Returns (t, f0_hz, voiced_prob)."""
    a, b = int(t0 * sr44), int(t1 * sr44)
    mid = x44[a:b].mean(axis=1)
    m = librosa.resample(mid, orig_sr=sr44, target_sr=SR)
    h = librosa.effects.harmonic(m, margin=4.0)
    f0, vflag, vprob = librosa.pyin(h, fmin=80, fmax=1200, sr=SR, frame_length=2048, hop_length=256)
    t = t0 + librosa.frames_to_time(np.arange(len(f0)), sr=SR, hop_length=256)
    return t, f0, vprob


def sustained_notes(t, f0, vprob, min_len=0.35, cents_tol=70):
    """Find stretches where pitch stays within tolerance -> 'long tones'."""
    notes = []
    cur = None
    for ti, fi, pi in zip(t, f0, vprob):
        ok = (not np.isnan(fi)) and pi > 0.5
        if ok:
            midi = librosa.hz_to_midi(fi)
            if cur and abs(midi - cur["midi_med"]) * 100 < cents_tol:
                cur["vals"].append(midi); cur["t1"] = ti
                cur["midi_med"] = float(np.median(cur["vals"]))
            else:
                if cur and cur["t1"] - cur["t0"] >= min_len:
                    notes.append(cur)
                cur = dict(t0=ti, t1=ti, vals=[midi], midi_med=float(midi))
        else:
            if cur and cur["t1"] - cur["t0"] >= min_len:
                notes.append(cur)
            cur = None
    if cur and cur["t1"] - cur["t0"] >= min_len:
        notes.append(cur)
    for n in notes:
        v = np.array(n["vals"])
        n["len"] = round(n["t1"] - n["t0"], 2)
        n["note"] = librosa.midi_to_note(int(round(n["midi_med"])))
        n["pitch_sd_cents"] = round(float(v.std() * 100), 1)
        del n["vals"]
    return notes


def decay_after(mono_rms_db, t, onset_t, horizon=1.5):
    """Reverb/decay proxy: dB drop over `horizon` s after an onset peak."""
    i0 = np.searchsorted(t, onset_t)
    i1 = np.searchsorted(t, onset_t + horizon)
    if i1 >= len(t):
        return None
    return float(mono_rms_db[i0] - mono_rms_db[i1])


def segment(wav: str, outdir: str, t0: float, t1: float, name: str, bpm: float | None):
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    x44, sr44, mono = load(wav)
    a, b = int(t0 * SR), int(t1 * SR)
    seg = mono[a:b]
    hop = 128  # ~5.8 ms
    F = frame_features(seg, x44[int(t0 * sr44):int(t1 * sr44)], sr44, hop=hop)
    F["t"] = F["t"] + t0
    on_frames = librosa.onset.onset_detect(onset_envelope=F["onset_env"], sr=SR, hop_length=hop, backtrack=False)
    on_t = t0 + librosa.frames_to_time(on_frames, sr=SR, hop_length=hop)
    on_strength = F["onset_env"][on_frames]
    # timing deviation against a fixed grid if bpm given
    timing = None
    if bpm:
        beat = 60.0 / bpm
        sub = beat / 4
        dev = ((on_t - t0) % sub)
        dev = np.minimum(dev, sub - dev) / sub  # 0 = on 16th grid, 0.5 = max off
        timing = dict(grid_16th_s=sub, mean_dev_frac=float(dev.mean()) if len(dev) else None,
                      dev_per_onset=[round(float(d), 3) for d in dev])
    ioi = np.diff(on_t)
    tp, f0, vp = vocal_pitch(x44, sr44, t0, t1)
    notes = sustained_notes(tp, f0, vp)
    # per-0.5s summary table
    rows = []
    step = 0.5
    for s in np.arange(t0, t1, step):
        m = (F["t"] >= s) & (F["t"] < s + step)
        if not m.any():
            continue
        mo = (on_t >= s) & (on_t < s + step)
        rows.append(dict(t=round(float(s), 2), rms_db=round(float(F["rms_db"][m].mean()), 1),
                         cent=int(F["centroid"][m].mean()), flat=round(float(F["flatness"][m].mean()), 3),
                         width=round(float(F["width"][m].mean()), 2), corr=round(float(F["corr"][m].mean()), 2),
                         hp=round(float(np.log10(F["hp_ratio"][m].mean() + 1e-6)), 2),
                         onsets=int(mo.sum()), on_max=round(float(on_strength[mo].max()), 1) if mo.any() else 0.0,
                         sub=round(float(F["band_sub"][m].mean()), 3), low=round(float(F["band_low"][m].mean()), 3),
                         lowmid=round(float(F["band_lowmid"][m].mean()), 3), highmid=round(float(F["band_highmid"][m].mean()), 3),
                         high=round(float(F["band_high"][m].mean()), 3)))
    res = dict(name=name, t0=t0, t1=t1, bpm=bpm, n_onsets=len(on_t), onset_times=[round(float(v), 3) for v in on_t],
               onset_strength=[round(float(v), 1) for v in on_strength],
               ioi_mean=float(ioi.mean()) if len(ioi) else None, ioi_cv=float(ioi.std() / ioi.mean()) if len(ioi) > 2 else None,
               timing=timing, sustained_notes=notes, rows=rows,
               key_top3=key_estimate(F["chroma"]))
    tag = f"seg_{t0:.1f}-{t1:.1f}"
    (out / f"{tag}.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
    # plot
    fig, axes = plt.subplots(6, 1, figsize=(16, 16), sharex=True)
    axes[0].plot(F["t"], F["rms_db"], lw=0.7); axes[0].set_ylabel("RMS dB"); axes[0].set_title(f"{name} {t0}-{t1}s")
    for ot in on_t:
        axes[0].axvline(ot, color="r", alpha=0.25, lw=0.6)
    axes[1].plot(F["t"], F["onset_env"], lw=0.6, color="C2"); axes[1].set_ylabel("onset")
    axes[2].plot(tp, librosa.hz_to_midi(f0), ".", ms=2, color="C3"); axes[2].set_ylabel("pitch (midi)")
    for n in notes:
        axes[2].plot([n["t0"], n["t1"]], [n["midi_med"]] * 2, color="k", lw=2, alpha=0.6)
    axes[3].plot(F["t"], F["centroid"], lw=0.6, color="C1"); axes[3].set_ylabel("centroid")
    axes[3].plot(F["t"], F["flatness"] * 20000, lw=0.5, color="C7", alpha=0.5)
    axes[4].plot(F["t"], F["width"], lw=0.6, color="C4"); axes[4].plot(F["t"], F["corr"], lw=0.6, color="C5", alpha=0.6); axes[4].set_ylabel("width/corr")
    D = librosa.amplitude_to_db(np.abs(librosa.stft(seg, n_fft=2048, hop_length=hop)), ref=np.max)
    tt = t0 + librosa.frames_to_time(np.arange(D.shape[1]), sr=SR, hop_length=hop)
    librosa.display.specshow(D, sr=SR, x_coords=tt, x_axis="time", y_axis="log", ax=axes[5], cmap="magma")
    axes[5].set_xlim(t0, t1)
    plt.tight_layout(); fig.savefig(out / f"{tag}.png", dpi=80); plt.close(fig)
    return res


if __name__ == "__main__":
    args = sys.argv[1:]
    mode = args[0]
    name = "ref"
    bpm = None
    if "--name" in args:
        name = args[args.index("--name") + 1]
    if "--bpm" in args:
        bpm = float(args[args.index("--bpm") + 1])
    if mode == "overview":
        s = overview(args[1], args[2], name)
        print(json.dumps({k: v for k, v in s.items() if k != "sections"}, ensure_ascii=False))
        print("sections:", [round(v, 1) for v in s["sections"]])
    elif mode == "segment":
        r = segment(args[1], args[2], float(args[3]), float(args[4]), name, bpm)
        print(json.dumps({k: r[k] for k in ("n_onsets", "ioi_mean", "ioi_cv", "key_top3")}, ensure_ascii=False))
        print("timing:", r["timing"] and r["timing"]["mean_dev_frac"])
        for n in r["sustained_notes"]:
            print("  long tone", n)
        for row in r["rows"]:
            print("  ", row)
