"""Automation curves and sidechain envelopes.

Automation entries (arrangement.yaml -> automation):

    - target: pluck.lpf              # <track|group|return|master>.<param>
      curve: exp                     # linear | exp (log-domain, use for Hz) | step
      points: [["intro:0", 700], ["build:end", 12000]]

Supported params: gain_db, lpf, hpf, pan, width, send.<return-name> (dB).
Two points at the same time create an instant jump.
"""
from __future__ import annotations

import numpy as np


def curve_array(points: list[tuple[float, float]], curve: str, n: int, sr: int, sec_per_beat: float) -> np.ndarray:
    pts = sorted(points, key=lambda p: p[0])
    xs = np.array([p[0] * sec_per_beat * sr for p in pts], dtype=np.float64)
    ys = np.array([p[1] for p in pts], dtype=np.float64)
    # separate coincident points so np.interp yields a jump
    for i in range(1, len(xs)):
        if xs[i] <= xs[i - 1]:
            xs[i] = xs[i - 1] + 1.0
    t = np.arange(n, dtype=np.float64)
    if curve == "step":
        idx = np.clip(np.searchsorted(xs, t, side="right") - 1, 0, len(ys) - 1)
        return ys[idx]
    if curve == "exp":
        if np.any(ys <= 0):
            raise ValueError("exp automation needs positive values")
        return np.exp(np.interp(t, xs, np.log(ys)))
    return np.interp(t, xs, ys)


def targets_for(automation: list[dict], owner: str) -> dict[str, dict]:
    """{param: automation-entry} for one owner (track/group/return/master)."""
    out = {}
    for a in automation:
        own, _, param = a["target"].partition(".")
        if own == owner:
            out[param] = a
    return out


def duck_envelope(onsets_sec: list[float], n: int, sr: int, depth: float, release_sec: float,
                  attack_ms: float = 3.0, shape: float = 2.0) -> np.ndarray:
    """Volume-shaper style sidechain: gain dips to (1-depth) at each onset and
    recovers along a power curve over `release_sec`. Deterministic and
    tempo-locked (the common EDM technique), no detector needed."""
    g = np.ones(n)
    if depth <= 0 or not onsets_sec:
        return g
    na = max(1, int(attack_ms / 1000 * sr))
    nr = max(1, int(release_sec * sr))
    rel = 1.0 - depth * (1.0 - (np.arange(nr) / nr)) ** shape
    att = np.linspace(1.0, 1.0 - depth, na)
    for t0 in onsets_sec:
        s = int(round(t0 * sr))
        a0 = max(0, s - na)
        seg = att[na - (s - a0):]
        g[a0:s] = np.minimum(g[a0:s], seg[: s - a0]) if s > a0 else g[a0:s]
        e = min(n, s + nr)
        if s < n:
            g[s:e] = np.minimum(g[s:e], rel[: e - s])
    return g
