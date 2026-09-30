"""Effect processors, all parameter-driven from YAML.

Effect chain entries are dicts with a `type`:

    {type: highpass, freq: 120, slope: 24}          {type: lowpass, freq: 9000}
    {type: peak, freq: 3000, gain_db: -2, q: 1.0}   {type: lowshelf|highshelf, freq, gain_db}
    {type: compressor, threshold_db: -18, ratio: 3, attack_ms: 10, release_ms: 120, makeup_db: 2}
    {type: chorus, rate_hz: 0.6, depth: 0.25, delay_ms: 8, feedback: 0.0, mix: 0.35}
    {type: phaser, rate_hz: 0.3, depth: 0.5, mix: 0.3}
    {type: saturate, drive: 0.3, mix: 1.0}
    {type: width, amount: 1.3}                      (M/S width, 0 = mono)
    {type: gain, db: -3}
    {type: delay, time: "3/16", feedback: 0.35, mix: 0.25, pingpong: true, hp: 300, lp: 6000}
    {type: reverb, decay: 2.8, predelay_ms: 20, damping: 0.5, mix: 0.3, hp: 250, lp: 9000, width: 1.0}

Static EQ / compressor / chorus / phaser use Spotify Pedalboard's built-in
processors (deterministic, cross-platform). Reverb and delay are custom so
they are tempo-aware, seedable and identical on every OS.
"""
from __future__ import annotations

from fractions import Fraction

import numpy as np
import pedalboard as pb
from scipy.signal import butter, fftconvolve, sosfilt

from ..synthesis.dsp import db_to_amp, soft_clip, svf_stereo


def note_value_to_sec(v, tempo: float) -> float:
    """'3/16' (of a whole note), '1/8.', 0.375 (seconds if float)."""
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    dotted = s.endswith(".")
    s = s.rstrip(".")
    frac = Fraction(s)
    beats = float(frac) * 4 * (1.5 if dotted else 1.0)
    return beats * 60.0 / tempo


def _pb(x: np.ndarray, sr: int, plugin) -> np.ndarray:
    return plugin(x.astype(np.float32), sr, reset=True).astype(np.float64)


def make_reverb_ir(sr: int, decay: float = 2.5, damping: float = 0.5, predelay_ms: float = 15.0,
                   width: float = 1.0, seed: int = 0, early: float = 0.3) -> np.ndarray:
    """Synthetic stereo impulse response: decorrelated noise with
    frequency-dependent exponential decay (highs die faster) + early taps."""
    rng = np.random.default_rng(seed)
    n = int(sr * decay * 1.1)
    t = np.arange(n) / sr
    bands = [(None, 400, decay * 1.15), (400, 3000, decay), (3000, None, decay * max(0.15, 1 - damping))]
    irs = []
    for ch in range(2):
        nz = rng.standard_normal(n)
        ir = np.zeros(n)
        for lo, hi, rt in bands:
            if lo is None:
                sos = butter(2, hi, "lowpass", fs=sr, output="sos")
            elif hi is None:
                sos = butter(2, lo, "highpass", fs=sr, output="sos")
            else:
                sos = butter(2, [lo, hi], "bandpass", fs=sr, output="sos")
            ir += sosfilt(sos, nz) * 10 ** (-3 * t / rt)
        ir *= 1 - np.exp(-t / 0.012)  # diffuse build-up
        # sparse early reflections
        for k in range(8):
            pos = int(sr * rng.uniform(0.004, 0.045))
            if pos < n:
                ir[pos] += rng.uniform(-1, 1) * early * 3
        irs.append(ir)
    irs = np.stack(irs)
    m = 0.5 * (irs[0] + irs[1])
    s = 0.5 * (irs[0] - irs[1]) * width
    irs = np.stack([m + s, m - s])
    irs /= np.sqrt(np.sum(irs ** 2) / 2) + 1e-12
    pre = int(sr * predelay_ms / 1000)
    return np.pad(irs, ((0, 0), (pre, 0)))


def reverb(x: np.ndarray, sr: int, p: dict, seed: int) -> np.ndarray:
    inp = x
    if p.get("hp"):
        inp = svf_stereo(inp, float(p["hp"]), sr, "highpass")
    if p.get("lp"):
        inp = svf_stereo(inp, float(p["lp"]), sr, "lowpass")
    ir = make_reverb_ir(sr, float(p.get("decay", 2.5)), float(p.get("damping", 0.5)),
                        float(p.get("predelay_ms", 15)), float(p.get("width", 1.0)), seed)
    mono_in = 0.5 * (inp[0] + inp[1])
    side_in = 0.5 * (inp[0] - inp[1])
    wl = fftconvolve(mono_in + side_in, ir[0])[: x.shape[1]]
    wr = fftconvolve(mono_in - side_in, ir[1])[: x.shape[1]]
    wet = np.stack([wl, wr]) * float(p.get("level", 0.5))
    mix = float(p.get("mix", 1.0))
    return x * (1 - mix) + wet * mix if mix < 1.0 else wet


def delay(x: np.ndarray, sr: int, p: dict, tempo: float) -> np.ndarray:
    d = int(note_value_to_sec(p.get("time", "3/16"), tempo) * sr)
    fb = float(p.get("feedback", 0.35))
    taps = int(p.get("taps", 8))
    ping = bool(p.get("pingpong", True))
    hp, lp = float(p.get("hp", 250)), float(p.get("lp", 7000))
    sos = np.vstack([butter(1, hp, "highpass", fs=sr, output="sos"), butter(1, lp, "lowpass", fs=sr, output="sos")])
    n = x.shape[1]
    wet = np.zeros_like(x)
    cur = 0.5 * (x[0] + x[1]) if ping else x.copy()
    for k in range(1, taps + 1):
        cur = sosfilt(sos, cur, axis=-1)
        g = fb ** (k - 1)
        if g < 1e-3:
            break
        off = d * k
        if off >= n:
            break
        if ping:
            ch = (k - 1) % 2
            wet[ch, off:] += cur[: n - off] * g
        else:
            wet[:, off:] += cur[:, : n - off] * g
    mix = float(p.get("mix", 1.0))
    return x * (1 - mix) + wet * mix if mix < 1.0 else wet


def width(x: np.ndarray, amount) -> np.ndarray:
    m = 0.5 * (x[0] + x[1])
    s = 0.5 * (x[0] - x[1]) * amount
    return np.stack([m + s, m - s])


def apply_effect(x: np.ndarray, sr: int, fx: dict, tempo: float, seed: int = 0) -> np.ndarray:
    t = fx.get("type")
    if fx.get("bypass"):
        return x
    if t in ("highpass", "lowpass"):
        return svf_stereo(x, float(fx["freq"]), sr, t, float(fx.get("q", 0.707)), int(fx.get("slope", 12)))
    if t == "peak":
        return _pb(x, sr, pb.PeakFilter(float(fx["freq"]), float(fx.get("gain_db", 0)), float(fx.get("q", 1.0))))
    if t == "lowshelf":
        return _pb(x, sr, pb.LowShelfFilter(float(fx["freq"]), float(fx.get("gain_db", 0)), float(fx.get("q", 0.707))))
    if t == "highshelf":
        return _pb(x, sr, pb.HighShelfFilter(float(fx["freq"]), float(fx.get("gain_db", 0)), float(fx.get("q", 0.707))))
    if t == "compressor":
        y = _pb(x, sr, pb.Compressor(float(fx.get("threshold_db", -18)), float(fx.get("ratio", 3)),
                                      float(fx.get("attack_ms", 10)), float(fx.get("release_ms", 120))))
        return y * float(db_to_amp(fx.get("makeup_db", 0)))
    if t == "chorus":
        y = _pb(x, sr, pb.Chorus(float(fx.get("rate_hz", 0.6)), float(fx.get("depth", 0.25)),
                                  float(fx.get("delay_ms", 8)), float(fx.get("feedback", 0.0)), 1.0))
        mix = float(fx.get("mix", 0.35))
        return x * (1 - mix) + y * mix
    if t == "phaser":
        y = _pb(x, sr, pb.Phaser(float(fx.get("rate_hz", 0.3)), float(fx.get("depth", 0.5)),
                                  float(fx.get("centre_hz", 1300)), float(fx.get("feedback", 0.0)), 1.0))
        mix = float(fx.get("mix", 0.3))
        return x * (1 - mix) + y * mix
    if t == "saturate":
        mix = float(fx.get("mix", 1.0))
        return x * (1 - mix) + soft_clip(x, float(fx.get("drive", 0.3))) * mix
    if t == "width":
        return width(x, float(fx.get("amount", 1.0)))
    if t == "gain":
        return x * float(db_to_amp(fx.get("db", 0)))
    if t == "delay":
        return delay(x, sr, fx, tempo)
    if t == "reverb":
        return reverb(x, sr, fx, seed)
    raise ValueError(f"Unknown effect type '{t}'")


def apply_chain(x: np.ndarray, sr: int, chain: list[dict] | None, tempo: float, seed: int = 0) -> np.ndarray:
    for i, fx in enumerate(chain or []):
        x = apply_effect(x, sr, fx, tempo, seed + i)
    return x
