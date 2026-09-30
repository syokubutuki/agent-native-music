"""Synthesised drums and transition FX (no samples required).

Drum patch (type: drum):
    model: kick | clap | snare | hat | crash
    ...model params (see DEFAULTS)
FX patch (type: fx):
    model: riser | impact | reverse_crash | downlifter
Per-note params: pitch_offset (semitones) for snare rolls etc.
"""
from __future__ import annotations

import numpy as np

from .dsp import db_to_amp, soft_clip, svf

DEFAULTS = {
    "kick": {"f_start": 180.0, "f_end": 47.0, "pitch_decay": 0.04, "decay": 0.42, "hold": 0.03,
             "click_level": 0.25, "click_freq": 3500.0, "drive": 0.35, "length": 0.6},
    "clap": {"bursts": 4, "spacing": 0.009, "freq": 1300.0, "q": 1.2, "tail": 0.16, "width": 0.3,
             "length": 0.45, "body_hp": 500.0},
    "snare": {"tone_freq": 190.0, "tone_level": 0.5, "tone_decay": 0.07, "noise_decay": 0.16,
              "noise_hp": 1200.0, "noise_lp": 9000.0, "length": 0.35},
    "hat": {"decay": 0.045, "hp": 7500.0, "metal": 0.5, "length": 0.12, "width": 0.2},
    "crash": {"decay": 1.8, "hp": 3500.0, "lp": 13000.0, "metal": 0.3, "length": 3.0, "width": 0.9},
    "riser": {"f_lo": 250.0, "f_hi": 9000.0, "q": 1.4, "curve": 2.0, "tone_level": 0.0, "width": 0.8},
    "impact": {"f_start": 90.0, "f_end": 32.0, "decay": 1.2, "noise_level": 0.5, "noise_decay": 1.5,
               "length": 3.0, "width": 0.7},
    "reverse_crash": {"hp": 3000.0, "lp": 14000.0, "curve": 3.0, "width": 0.9},
    "downlifter": {"f_hi": 7000.0, "f_lo": 200.0, "q": 1.2, "width": 0.8},
}


def _p(patch: dict, model: str) -> dict:
    return {**DEFAULTS.get(model, {}), **patch}


def _metal(n: int, sr: int, base: float = 1.0) -> np.ndarray:
    """Inharmonic square cluster (classic drum-machine cymbal)."""
    t = np.arange(n) / sr
    freqs = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) * base
    return sum(np.sign(np.sin(2 * np.pi * f * t + i)) for i, f in enumerate(freqs)) / 6.0


def _stereo(mono_l: np.ndarray, mono_r: np.ndarray, width: float) -> np.ndarray:
    m = 0.5 * (mono_l + mono_r)
    s = 0.5 * (mono_l - mono_r) * width
    return np.stack([m + s, m - s])


def kick(p, vel, sr, rng, po):
    n = int(p["length"] * sr)
    t = np.arange(n) / sr
    f = p["f_end"] * 2 ** (po / 12) + (p["f_start"] - p["f_end"]) * np.exp(-t / p["pitch_decay"])
    ph = 2 * np.pi * np.cumsum(f) / sr
    body = np.sin(ph)
    env = np.where(t < p["hold"], 1.0, np.exp(-(t - p["hold"]) / (p["decay"] / 4)))
    click = svf(rng.uniform(-1, 1, n), p["click_freq"], sr, "bandpass", 0.9) * np.exp(-t / 0.004)
    x = body * env + p["click_level"] * click * 3
    x = soft_clip(x * 0.9, p["drive"])
    x *= np.minimum(1, (n - np.arange(n)) / (0.01 * sr))  # de-click end
    return np.stack([x, x])


def clap(p, vel, sr, rng, po):
    n = int(p["length"] * sr)
    t = np.arange(n) / sr
    env = np.zeros(n)
    for b in range(int(p["bursts"])):
        t0 = b * p["spacing"]
        m = t >= t0
        dec = 0.004 if b < p["bursts"] - 1 else p["tail"] / 4
        env[m] += np.exp(-(t[m] - t0) / dec) * (0.8 if b < p["bursts"] - 1 else 1.0)
    f = p["freq"] * 2 ** (po / 12)
    l = svf(rng.uniform(-1, 1, n), f, sr, "bandpass", p["q"])
    r = svf(rng.uniform(-1, 1, n), f * 1.05, sr, "bandpass", p["q"])
    l, r = svf(l, p["body_hp"], sr, "highpass"), svf(r, p["body_hp"], sr, "highpass")
    return _stereo(l * env * 2.5, r * env * 2.5, p["width"])


def snare(p, vel, sr, rng, po):
    n = int(p["length"] * sr)
    t = np.arange(n) / sr
    k = 2 ** (po / 12)
    tone = np.sin(2 * np.pi * p["tone_freq"] * k * t) * np.exp(-t / p["tone_decay"]) * p["tone_level"]
    nz = rng.uniform(-1, 1, n)
    nz = svf(svf(nz, p["noise_hp"] * k, sr, "highpass"), p["noise_lp"], sr, "lowpass")
    x = tone + nz * np.exp(-t / (p["noise_decay"] / 3)) * 0.9
    return np.stack([x, x])


def hat(p, vel, sr, rng, po):
    n = int(p["length"] * sr)
    t = np.arange(n) / sr
    l = rng.uniform(-1, 1, n) * (1 - p["metal"]) + _metal(n, sr, 2 ** (po / 12) * 1.4) * p["metal"]
    r = rng.uniform(-1, 1, n) * (1 - p["metal"]) + _metal(n, sr, 2 ** (po / 12) * 1.41) * p["metal"]
    env = np.exp(-t / (p["decay"] / 2.5))
    l = svf(l, p["hp"], sr, "highpass", 0.7, 24) * env
    r = svf(r, p["hp"], sr, "highpass", 0.7, 24) * env
    return _stereo(l, r, p["width"])


def crash(p, vel, sr, rng, po):
    n = int(p["length"] * sr)
    t = np.arange(n) / sr
    env = np.exp(-t / (p["decay"] / 3)) * (1 - np.exp(-t / 0.002))
    chans = []
    for i in range(2):
        x = rng.uniform(-1, 1, n) * (1 - p["metal"]) + _metal(n, sr, 1.7 + 0.03 * i) * p["metal"]
        x = svf(svf(x, p["hp"], sr, "highpass", 0.7, 24), p["lp"], sr, "lowpass")
        chans.append(x * env)
    return _stereo(chans[0], chans[1], p["width"])


def riser(p, vel, sr, rng, dur):
    n = int(dur * sr)
    t = np.linspace(0, 1, n)
    f = p["f_lo"] * (p["f_hi"] / p["f_lo"]) ** (t ** p.get("sweep_curve", 1.3))
    env = t ** p["curve"]
    chans = [svf(rng.uniform(-1, 1, n), f, sr, "bandpass", p["q"]) * env * 2.2 for _ in range(2)]
    if p.get("tone_level", 0):
        from .dsp import osc
        base = 110.0 * 2 ** (np.linspace(0, float(p.get("tone_octaves", 2)), n))
        tone = sum(osc("saw", base * 2 ** (d / 1200), sr, rng.uniform()) for d in (-12, 0, 12)) / 3
        tone = svf(tone, f * 1.5, sr, "lowpass") * env * p["tone_level"]
        chans = [c + tone for c in chans]
    fade = np.minimum(1, (n - np.arange(n)) / (0.005 * sr))
    return _stereo(chans[0] * fade, chans[1] * fade, p["width"])


def downlifter(p, vel, sr, rng, dur):
    n = int(dur * sr)
    t = np.linspace(0, 1, n)
    f = p["f_hi"] * (p["f_lo"] / p["f_hi"]) ** t
    env = (1 - t) ** 2
    chans = [svf(rng.uniform(-1, 1, n), f, sr, "bandpass", p["q"]) * env * 2.0 for _ in range(2)]
    return _stereo(chans[0], chans[1], p["width"])


def impact(p, vel, sr, rng, dur):
    n = int(p["length"] * sr)
    t = np.arange(n) / sr
    f = p["f_end"] + (p["f_start"] - p["f_end"]) * np.exp(-t / 0.25)
    sub = np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-t / (p["decay"] / 3))
    chans = []
    for _ in range(2):
        nz = svf(rng.uniform(-1, 1, n), 2500 * np.exp(-t / 0.6) + 200, sr, "lowpass", 0.8)
        chans.append(sub + nz * np.exp(-t / (p["noise_decay"] / 4)) * p["noise_level"])
    return _stereo(chans[0], chans[1], p["width"])


def reverse_crash(p, vel, sr, rng, dur):
    n = int(dur * sr)
    t = np.linspace(0, 1, n)
    chans = []
    for _ in range(2):
        x = svf(svf(rng.uniform(-1, 1, n), p["hp"], sr, "highpass", 0.7, 24), p["lp"], sr, "lowpass")
        chans.append(x * t ** p["curve"])
    fade = np.minimum(1, (n - np.arange(n)) / (0.003 * sr))
    return _stereo(chans[0] * fade, chans[1] * fade, p["width"])


HIT_MODELS = {"kick": kick, "clap": clap, "snare": snare, "hat": hat, "crash": crash}
SPAN_MODELS = {"riser": riser, "downlifter": downlifter, "impact": impact, "reverse_crash": reverse_crash}


def render_hit(patch: dict, vel: float, sr: int, rng: np.random.Generator, dur_sec: float,
               pitch_offset: float = 0.0) -> np.ndarray:
    model = patch.get("model")
    p = _p(patch, model)
    if model in HIT_MODELS:
        x = HIT_MODELS[model](p, vel, sr, rng, pitch_offset)
    elif model in SPAN_MODELS:
        x = SPAN_MODELS[model](p, vel, sr, rng, dur_sec)
    else:
        raise ValueError(f"Unknown drum/fx model '{model}'. Known: {sorted(HIT_MODELS) + sorted(SPAN_MODELS)}")
    vs = float(patch.get("velocity_sens", 0.8))
    return x * (1 - vs + vs * vel) * float(db_to_amp(patch.get("gain_db", 0.0)))
