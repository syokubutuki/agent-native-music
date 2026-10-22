"""Instrument backends: turn a Track's notes into a stereo stem.

Backends (patch `type`):
    subtractive  built-in polyphonic synth (synthesis/subtractive.py)
    layered      several inline patches summed: layers: [{<patch>, gain_db, transpose}]
    drum / fx    synthesised drum hits and transition FX (synthesis/drums.py)
    sample       plays audio files given per note (`audio` / `voice` content: params file, offset,
                 rate, fade_in, fade_out, gain_db); mono files become centred stereo
    vst3         external VST3 instrument hosted through Pedalboard (see vst3.py)

A patch may carry `fx:` — an insert chain (mixing/effects.py) that belongs
to the sound itself (e.g. chorus on a pad), applied before the mixer.
"""
from __future__ import annotations

from fractions import Fraction
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from ..composition.realize import stable_seed
from ..mixing.effects import apply_chain
from ..score import Score, Track
from ..spec import deep_merge, load_instrument, resolve_asset
from ..synthesis.dsp import db_to_amp
from ..synthesis.drums import render_hit
from ..synthesis.subtractive import render_note


def _add(buf: np.ndarray, x: np.ndarray, start: int) -> None:
    if start >= buf.shape[1]:
        return
    end = min(buf.shape[1], start + x.shape[1])
    buf[:, start:end] += x[:, : end - start]


def _render_subtractive(patch, track, score, sr, n, seed):
    buf = np.zeros((2, n))
    spb = score.sec_per_beat()
    tr = int(patch.get("transpose", 0))
    for i, note in enumerate(track.notes):
        rng = np.random.default_rng(stable_seed(seed, track.name, i, note.pitch))
        x = render_note(patch, note.pitch + tr, note.dur * spb, note.vel, sr, rng,
                        float(note.params.get("pitch_offset", 0.0)))
        _add(buf, x, int(round(note.start * spb * sr)))
    return buf


def _render_drum(patch, track, score, sr, n, seed):
    buf = np.zeros((2, n))
    spb = score.sec_per_beat()
    choke = bool(patch.get("choke", False))
    starts = [int(round(nt.start * spb * sr)) for nt in track.notes]
    for i, note in enumerate(track.notes):
        rng = np.random.default_rng(stable_seed(seed, track.name, i))
        x = render_hit(patch, note.vel, sr, rng, note.dur * spb, float(note.params.get("pitch_offset", 0.0)))
        if choke and i + 1 < len(starts):  # e.g. open hat cut by the next hit
            maxlen = starts[i + 1] - starts[i]
            if x.shape[1] > maxlen > 0:
                fade = np.minimum(1, (maxlen - np.arange(maxlen)) / (0.004 * sr))
                x = x[:, :maxlen] * fade
        _add(buf, x, starts[i])
    return buf


def _load_resampled(path: Path, sr: int, rate: float) -> np.ndarray:
    """Whole file as (2, n) at `sr`, sped up by `rate` (pitch follows, like tape)."""
    x, fsr = sf.read(str(path), always_2d=True, dtype="float64")
    x = x.T
    x = np.vstack([x[0], x[0]]) if x.shape[0] == 1 else x[:2]
    ratio = Fraction(sr) / Fraction(fsr * rate).limit_denominator(100000)
    ratio = ratio.limit_denominator(2000)
    if ratio != 1:
        x = resample_poly(x, ratio.numerator, ratio.denominator, axis=1)
    return x


def _render_sample(patch, track, score, sr, n, song_dir):
    buf = np.zeros((2, n))
    spb = score.sec_per_beat()
    cache: dict[tuple, np.ndarray] = {}
    pg = float(db_to_amp(patch.get("gain_db", 0.0)))
    for note in track.notes:
        p = note.params
        rate = float(p.get("rate", 1.0))
        f = resolve_asset(p["file"], song_dir)
        key = (str(f), rate)
        if key not in cache:
            cache[key] = _load_resampled(f, sr, rate)
        y = cache[key]
        off = int(round(float(p.get("offset", 0.0)) * sr / rate))
        length = int(round(note.dur * spb * sr))
        seg = y[:, off:off + length].copy()
        m = seg.shape[1]
        if m == 0:
            continue
        fi = min(m, max(1, int(float(p.get("fade_in", 0.005)) * sr)))
        fo = min(m, max(1, int(float(p.get("fade_out", 0.05)) * sr)))
        seg[:, :fi] *= np.linspace(0, 1, fi)
        seg[:, m - fo:] *= np.linspace(1, 0, fo)
        g = pg * float(db_to_amp(p.get("gain_db", 0.0))) * note.vel
        _add(buf, seg * g, int(round(note.start * spb * sr)))
    return buf


def render_patch(patch: dict, track: Track, score: Score, sr: int, n: int, seed: int, song_dir: Path | None):
    typ = patch.get("type", "subtractive")
    if typ == "subtractive":
        out = _render_subtractive(patch, track, score, sr, n, seed)
    elif typ == "layered":
        out = np.zeros((2, n))
        for j, layer in enumerate(patch.get("layers", [])):
            lp = dict(layer)
            if "extends" in lp:
                base, _ = load_instrument(lp.pop("extends"), song_dir)
                lp = deep_merge(base, lp)
            lp.setdefault("type", "subtractive")
            g = 10 ** (float(lp.pop("layer_gain_db", 0.0)) / 20)
            out += g * render_patch(lp, track, score, sr, n, stable_seed(seed, "layer", j), song_dir)
    elif typ == "sample":
        out = _render_sample(patch, track, score, sr, n, song_dir)
    elif typ in ("drum", "fx"):
        out = _render_drum(patch, track, score, sr, n, seed)
    elif typ == "vst3":
        from .vst3 import render_vst3
        out = render_vst3(patch, track, score, sr, n)
    else:
        raise ValueError(f"Unknown instrument type '{typ}'")
    return apply_chain(out, sr, patch.get("fx"), score.tempo, stable_seed(seed, track.name, "fx"))


def render_track(track: Track, score: Score, sr: int, n: int, seed: int, song_dir: Path | None,
                 overrides: dict | None = None) -> tuple[np.ndarray, Path]:
    patch, path = load_instrument(track.instrument, song_dir, overrides)
    return render_patch(patch, track, score, sr, n, seed, song_dir), path
