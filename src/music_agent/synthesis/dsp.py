"""Low-level DSP kernels (numba-accelerated, deterministic).

All signals are float64 numpy arrays. Stereo buffers are shaped (2, n).
"""
from __future__ import annotations

import math

import numpy as np
from numba import njit


def db_to_amp(db):
    return 10.0 ** (np.asarray(db, dtype=np.float64) / 20.0)


def amp_to_db(a, floor=-120.0):
    return np.maximum(20.0 * np.log10(np.maximum(np.abs(a), 1e-12)), floor)


def pan_gains(pan: float) -> tuple[float, float]:
    """Equal-power pan, pan in [-1, 1]."""
    th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return float(np.cos(th)), float(np.sin(th))


# ------------------------------------------------------------ oscillators


def polyblep(t: np.ndarray, dt: np.ndarray) -> np.ndarray:
    """Vectorised PolyBLEP residual for phase t in [0,1) and increment dt."""
    out = np.zeros_like(t)
    m1 = t < dt
    x = t[m1] / dt[m1]
    out[m1] = x + x - x * x - 1.0
    m2 = t > 1.0 - dt
    x = (t[m2] - 1.0) / dt[m2]
    out[m2] = x * x + x + x + 1.0
    return out


def phase_from_freq(freq: np.ndarray, sr: int, phase0: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    inc = freq / sr
    ph = (phase0 + np.cumsum(inc) - inc[0]) % 1.0
    return ph, inc


def osc(wave: str, freq: np.ndarray, sr: int, phase0: float = 0.0, pw: float = 0.5,
        rng: np.random.Generator | None = None) -> np.ndarray:
    if wave == "noise":
        r = rng if rng is not None else np.random.default_rng(0)
        return r.uniform(-1, 1, len(freq))
    ph, dt = phase_from_freq(freq, sr, phase0)
    dt = np.clip(dt, 1e-7, 0.5)
    if wave == "sine":
        return np.sin(2 * np.pi * ph)
    if wave == "saw":
        return 2.0 * ph - 1.0 - polyblep(ph, dt)
    if wave in ("square", "pulse"):
        sq = np.where(ph < pw, 1.0, -1.0)
        sq += polyblep(ph, dt)
        sq -= polyblep((ph + (1.0 - pw)) % 1.0, dt)
        return sq
    if wave == "triangle":
        return 1.0 - 4.0 * np.abs(ph - 0.5)  # naive; low aliasing for triangle
    raise ValueError(f"Unknown waveform '{wave}' (sine|saw|square|pulse|triangle|noise)")


# ---------------------------------------------------------------- filters


@njit(cache=True, fastmath=False)
def _svf(x, cutoff, q, sr, mode):
    """Topology-preserving SVF (Simper). mode 0=LP 1=HP 2=BP 3=notch.
    `cutoff` is per-sample; q is resonance quality (0.5..20)."""
    n = x.shape[0]
    y = np.empty(n)
    ic1 = 0.0
    ic2 = 0.0
    k = 1.0 / q
    nyq = sr * 0.49
    for i in range(n):
        fc = cutoff[i]
        if fc > nyq:
            fc = nyq
        if fc < 10.0:
            fc = 10.0
        g = math.tan(math.pi * fc / sr)
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        v0 = x[i]
        v3 = v0 - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == 0:
            y[i] = v2
        elif mode == 1:
            y[i] = v0 - k * v1 - v2
        elif mode == 2:
            y[i] = v1
        else:
            y[i] = v0 - k * v1
    return y


_MODES = {"lowpass": 0, "lp": 0, "highpass": 1, "hp": 1, "bandpass": 2, "bp": 2, "notch": 3}


def svf(x: np.ndarray, cutoff, sr: int, mode: str = "lowpass", q: float = 0.707, slope: int = 12) -> np.ndarray:
    """Time-varying SVF. `cutoff` scalar or per-sample array. slope 12 or 24 dB/oct."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), x.shape).copy()
    m = _MODES[mode]
    y = _svf(np.ascontiguousarray(x, dtype=np.float64), c, float(q), float(sr), m)
    if slope == 24:
        y = _svf(y, c, 0.707 if m in (0, 1) else float(q), float(sr), m)
    return y


def svf_stereo(x: np.ndarray, cutoff, sr: int, mode="lowpass", q=0.707, slope=12) -> np.ndarray:
    return np.stack([svf(x[0], cutoff, sr, mode, q, slope), svf(x[1], cutoff, sr, mode, q, slope)])


# ---------------------------------------------------------------- dynamics


@njit(cache=True)
def _limiter_gain(peak_env, ceiling, lookahead, release_coef):
    n = peak_env.shape[0]
    req = np.empty(n)
    for i in range(n):
        p = peak_env[i]
        req[i] = ceiling / p if p > ceiling else 1.0
    # look-ahead minimum over req[i : i+lookahead] (so gain is already down when
    # the peak arrives). Monotonic deque, O(n).
    mn = np.empty(n)
    dq = np.empty(n, dtype=np.int64)
    head = 0
    tail = 0
    nxt = 0
    for i in range(n):
        end = min(i + lookahead, n)
        while nxt < end:
            while tail > head and req[dq[tail - 1]] >= req[nxt]:
                tail -= 1
            dq[tail] = nxt
            tail += 1
            nxt += 1
        while dq[head] < i:
            head += 1
        mn[i] = min(req[dq[head]], 1.0)
    # exponential release (instant attack on the held minimum)
    r = np.empty(n)
    cur = 1.0
    for i in range(n):
        t = mn[i]
        if t < cur:
            cur = t
        else:
            cur = t + (cur - t) * release_coef
        r[i] = cur
    # attack smoothing: trailing moving average over the look-ahead window.
    # Values inside the window before a peak are all <= the peak's requirement,
    # so the averaged gain still satisfies the ceiling at the peak.
    g = np.empty(n)
    acc = 0.0
    for i in range(n):
        acc += r[i]
        if i >= lookahead:
            acc -= r[i - lookahead]
            g[i] = acc / lookahead
        else:
            g[i] = (acc + (lookahead - i - 1) * 1.0) / lookahead
            if g[i] > r[i] and r[i] < 1.0:
                g[i] = r[i]
    return g


def peak_envelope(x: np.ndarray, oversample: int = 4) -> np.ndarray:
    """Per-sample inter-sample (true) peak estimate across channels."""
    from scipy.signal import resample_poly

    if oversample <= 1:
        return np.max(np.abs(x), axis=0)
    n = x.shape[1]
    pk = np.zeros(n)
    for ch in x:
        up = np.abs(resample_poly(ch, oversample, 1))[: n * oversample]
        if up.shape[0] < n * oversample:
            up = np.pad(up, (0, n * oversample - up.shape[0]))
        np.maximum(pk, up.reshape(n, oversample).max(axis=1), out=pk)
    return pk


def limiter(x: np.ndarray, sr: int, ceiling_db: float = -1.0, lookahead_ms: float = 5.0,
            release_ms: float = 80.0, oversample: int = 4, peak_env: np.ndarray | None = None,
            input_gain: float = 1.0) -> tuple[np.ndarray, np.ndarray]:
    """Stereo look-ahead peak limiter with true-peak estimation.

    Returns (limited signal, gain curve). The signal is delayed by nothing:
    the gain curve anticipates peaks, so timing is preserved. `peak_env` may be
    precomputed for `x` (it scales linearly with `input_gain`), which makes
    repeated calls during loudness matching cheap.
    """
    ceiling = float(db_to_amp(ceiling_db))
    pk = (peak_env if peak_env is not None else peak_envelope(x, oversample)) * input_gain
    la = max(1, int(sr * lookahead_ms / 1000))
    rc = math.exp(-1.0 / (sr * release_ms / 1000))
    g = _limiter_gain(pk.astype(np.float64), ceiling * 0.995, la, rc)
    return x * (g * input_gain)[None, :], g


def true_peak_db(x: np.ndarray, oversample: int = 4) -> float:
    from scipy.signal import resample_poly

    if x.ndim == 1:
        x = x[None, :]
    up = np.stack([resample_poly(ch, oversample, 1) for ch in x])
    return float(amp_to_db(np.max(np.abs(up))))


def soft_clip(x: np.ndarray, drive: float) -> np.ndarray:
    if drive <= 0:
        return x
    k = 1.0 + 9.0 * drive
    return np.tanh(k * x) / np.tanh(k)


def one_pole_smooth(x: np.ndarray, sr: int, ms: float) -> np.ndarray:
    from scipy.signal import lfilter

    a = math.exp(-1.0 / (sr * ms / 1000.0))
    return lfilter([1 - a], [1, -a], x)
