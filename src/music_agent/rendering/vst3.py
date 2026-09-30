"""VST3 instrument backend via Spotify Pedalboard (experimental).

Patch example (instruments/lead/surge_lead.yaml):

    type: vst3
    plugin: "C:/Program Files/Common Files/VST3/Surge XT.vst3"   # or env var / relative path
    preset: presets/surge_lead.vstpreset    # optional, loaded with load_preset()
    state: presets/surge_lead.state.bin     # optional raw plugin state (raw_state)
    params: {a_filter_1_cutoff: 0.62}       # parameter-ID -> value (Pedalboard attribute names)
    tail_sec: 2.0

Design constraints (see DECISIONS.md, D-004): the agent must never need the
plugin GUI. Everything is set via preset file / raw state / parameter IDs,
and MIDI is fed programmatically. `music-agent vst-params <plugin>` lists the
automatable parameter IDs so they can be written into YAML.

Not exercised in the cloud dev container (no VST3 binaries available there);
covered by a mock-based unit test only.
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np

from ..score import Score, Track

_CACHE: dict[str, object] = {}


def _load(path: str):
    import pedalboard

    p = os.path.expandvars(path)
    if p not in _CACHE:
        _CACHE[p] = pedalboard.load_plugin(p)
    return _CACHE[p]


def list_params(path: str) -> dict[str, str]:
    plug = _load(path)
    return {k: repr(v) for k, v in plug.parameters.items()}


def notes_to_midi_messages(track: Track, score: Score) -> list:
    import mido

    spb = score.sec_per_beat()
    evs = []
    for n in track.notes:
        on = n.start * spb
        off = (n.start + n.dur) * spb
        v = max(1, min(127, int(round(n.vel * 127))))
        evs.append((off, 0, mido.Message("note_off", note=n.pitch, velocity=0, time=off)))
        evs.append((on, 1, mido.Message("note_on", note=n.pitch, velocity=v, time=on)))
    evs.sort(key=lambda e: (e[0], e[1]))
    return [e[2] for e in evs]


def render_vst3(patch: dict, track: Track, score: Score, sr: int, n: int, plugin=None) -> np.ndarray:
    plug = plugin if plugin is not None else _load(patch["plugin"])
    if patch.get("state"):
        plug.raw_state = Path(patch["state"]).read_bytes()
    if patch.get("preset"):
        plug.load_preset(str(patch["preset"]))
    for k, v in (patch.get("params") or {}).items():
        setattr(plug, k, v)
    msgs = notes_to_midi_messages(track, score)
    out = plug(msgs, duration=n / sr, sample_rate=sr, num_channels=2, reset=True)
    out = np.asarray(out, dtype=np.float64)
    if out.ndim == 1:
        out = np.stack([out, out])
    if out.shape[1] < n:
        out = np.pad(out, ((0, 0), (0, n - out.shape[1])))
    return out[:, :n] * 10 ** (float(patch.get("gain_db", 0)) / 20)
