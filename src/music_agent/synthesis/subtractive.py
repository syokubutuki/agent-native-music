"""Built-in polyphonic subtractive synthesizer ("builtin" backend).

Patch format (instruments/*.yaml, type: subtractive):

    oscillators:            # summed per voice
      - {wave: saw, unison: 7, detune: 0.25, spread: 0.9, level: 1.0, octave: 0, semi: 0}
      - {wave: sine, level: 0.5, octave: -1}
      - {wave: noise, level: 0.02}
    filter:  {mode: lowpass, cutoff: 6000, q: 0.9, slope: 24, env_amount: 2.0,
              keytrack: 0.5, vel_amount: 1.0}       # env_amount / vel_amount in octaves
    amp_env:    {a: 0.005, d: 0.3, s: 0.8, r: 0.3}   # seconds / sustain level
    filter_env: {a: 0.001, d: 0.4, s: 0.2, r: 0.3}
    pitch_env:  {amount: 0, decay: 0.05}             # semitones, seconds
    vibrato:    {rate: 5.5, depth: 0.1, delay: 0.3}  # Hz, semitones, seconds
    drive: 0.0            # post-filter saturation 0..1
    gate: 1.0             # note length multiplier (articulation)
    velocity_sens: 0.6    # 0 = velocity ignored for amplitude
    gain_db: 0
    mono: false           # stereo unison spread when false; forced mono output when true

Every random choice (unison phases, noise) is seeded from the song seed,
the track name and the note index, so renders are bit-reproducible.
"""
from __future__ import annotations

import numpy as np

from ..theory import midi_to_hz
from .dsp import db_to_amp, osc, soft_clip, svf


def adsr(n_total: int, n_gate: int, sr: int, a: float, d: float, s: float, r: float,
         curve: float = 4.0) -> np.ndarray:
    """ADSR with exponential decay/release. n_gate = samples until note-off."""
    env = np.zeros(n_total)
    na = max(1, int(a * sr))
    nd = max(1, int(d * sr))
    t = np.arange(n_total)
    # attack (slightly convex)
    m = t < na
    env[m] = (t[m] / na) ** 0.8
    # decay toward sustain
    m = (t >= na)
    td = (t[m] - na) / nd
    env[m] = s + (1 - s) * np.exp(-curve * td)
    # release from the level at note-off
    if n_gate < n_total:
        lvl = env[min(n_gate, n_total - 1)] if n_gate > 0 else 0.0
        if n_gate < na:
            lvl = (n_gate / na) ** 0.8
        nr = max(1, int(r * sr))
        tr = (t[n_gate:] - n_gate) / nr
        env[n_gate:] = lvl * np.exp(-curve * 1.5 * tr)
    return env


def _unison_offsets(n: int, detune: float) -> np.ndarray:
    """Symmetric detune offsets in semitones, denser near the centre
    (supersaw-like distribution)."""
    if n <= 1:
        return np.zeros(1)
    x = np.linspace(-1, 1, n)
    return np.sign(x) * np.abs(x) ** 1.4 * detune


def render_note(patch: dict, pitch: int, dur_sec: float, vel: float, sr: int, rng: np.random.Generator,
                pitch_offset: float = 0.0) -> np.ndarray:
    """Render one note to a stereo buffer (2, n) including its release tail."""
    amp_env = patch.get("amp_env", {})
    rel = float(amp_env.get("r", 0.2))
    gate = float(patch.get("gate", 1.0))
    n_gate = max(1, int(dur_sec * gate * sr))
    n = n_gate + int(rel * sr * 1.2) + 16
    t = np.arange(n) / sr

    # pitch modulation (semitones)
    semis = np.full(n, float(pitch) + pitch_offset)
    pe = patch.get("pitch_env") or {}
    if pe.get("amount"):
        semis += float(pe["amount"]) * np.exp(-t / max(float(pe.get("decay", 0.05)), 1e-4))
    vib = patch.get("vibrato") or {}
    if vib.get("depth"):
        delay = float(vib.get("delay", 0.2))
        ramp = np.clip((t - delay) / 0.25, 0, 1)
        semis += float(vib["depth"]) * ramp * np.sin(2 * np.pi * float(vib.get("rate", 5.5)) * t
                                                    + rng.uniform(0, 2 * np.pi))

    left = np.zeros(n)
    right = np.zeros(n)
    mono_out = bool(patch.get("mono", False))
    for o in patch.get("oscillators", [{"wave": "saw"}]):
        wave = o.get("wave", "saw")
        level = float(o.get("level", 1.0))
        if level == 0:
            continue
        if wave == "noise":
            nz = rng.uniform(-1, 1, (2, n)) * level
            left += nz[0]
            right += nz[1] if not mono_out else nz[0]
            continue
        base = semis + 12 * float(o.get("octave", 0)) + float(o.get("semi", 0)) + float(o.get("fine", 0)) / 100
        uni = int(o.get("unison", 1))
        offs = _unison_offsets(uni, float(o.get("detune", 0.2)))
        spread = float(o.get("spread", 0.8))
        # alternate sides so pitch offset and pan position are decorrelated
        pans = (spread * np.linspace(-1, 1, uni) * np.where(np.arange(uni) % 2 == 0, 1, -1)
                if uni > 1 else np.zeros(1))
        vnorm = 1.0 / np.sqrt(uni)
        rand_phase = bool(o.get("random_phase", uni > 1))
        for k in range(uni):
            freq = midi_to_hz(base + offs[k])
            ph0 = rng.uniform(0, 1) if rand_phase else 0.0
            sig = osc(wave, freq, sr, ph0, float(o.get("pw", 0.5))) * level * vnorm
            th = (pans[k] + 1) * np.pi / 4
            left += sig * np.cos(th)
            right += sig * np.sin(th)
    if mono_out:
        m = 0.5 * (left + right)
        left, right = m, m

    # filter
    f = patch.get("filter")
    if f and f.get("mode", "lowpass") != "none":
        fe = patch.get("filter_env", {})
        fenv = adsr(n, n_gate, sr, float(fe.get("a", 0.001)), float(fe.get("d", 0.3)),
                    float(fe.get("s", 0.0)), float(fe.get("r", 0.3)))
        cutoff = float(f.get("cutoff", 4000))
        octs = (float(f.get("env_amount", 0.0)) * fenv
                + float(f.get("keytrack", 0.0)) * (pitch - 60) / 12.0
                + float(f.get("vel_amount", 0.0)) * (vel - 0.8))
        cut = np.clip(cutoff * 2.0 ** octs, 20, sr * 0.45)
        mode = f.get("mode", "lowpass")
        q = float(f.get("q", 0.8))
        slope = int(f.get("slope", 12))
        left = svf(left, cut, sr, mode, q, slope)
        right = svf(right, cut, sr, mode, q, slope)

    drive = float(patch.get("drive", 0.0))
    if drive > 0:
        left, right = soft_clip(left * 0.5, drive), soft_clip(right * 0.5, drive)

    env = adsr(n, n_gate, sr, float(amp_env.get("a", 0.005)), float(amp_env.get("d", 0.2)),
               float(amp_env.get("s", 0.8)), rel)
    vs = float(patch.get("velocity_sens", 0.6))
    amp = (1 - vs + vs * vel) * float(db_to_amp(patch.get("gain_db", 0.0)))
    return np.stack([left * env * amp, right * env * amp])
