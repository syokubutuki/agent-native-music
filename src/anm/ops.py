"""Editing operations. Pure functions over Project: the single API surface that
both the CLI and the MCP server expose. Every op validates its input and returns
a small, human/agent-readable result dict."""
from __future__ import annotations

import re

from .model import Note, Project, Track

_NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note_name_to_midi(name: str) -> int:
    """'C4' -> 60, 'F#3' -> 54, 'Bb2' -> 46. Middle C = C4."""
    m = re.fullmatch(r"([A-Ga-g])([#b]?)(-?\d)", name.strip())
    if not m:
        raise ValueError(f"bad note name: {name!r}")
    letter, acc, octave = m.groups()
    pc = _NAMES[letter.upper()] + {"#": 1, "b": -1, "": 0}[acc]
    return (int(octave) + 1) * 12 + pc


def _pitch(p: int | str) -> int:
    return p if isinstance(p, int) else note_name_to_midi(p)


def set_tempo(project: Project, bpm: float) -> dict:
    if not 20 <= bpm <= 400:
        raise ValueError("tempo must be 20-400 bpm")
    project.tempo = bpm
    return {"tempo": bpm}


def add_track(project: Project, name: str, program: int = 0, channel: int | None = None) -> dict:
    if any(t.name == name for t in project.tracks):
        raise ValueError(f"track exists: {name}")
    if channel is None:
        used = {t.channel for t in project.tracks}
        channel = next(c for c in range(16) if c not in used and c != 9)
    project.tracks.append(Track(name, program, channel))
    return {"track": name, "program": program, "channel": channel}


def add_notes(project: Project, track: str, notes: list[dict]) -> dict:
    """notes: [{pitch: 60|'C4', start: 0, duration: 1, velocity?: 90}]"""
    t = project.track(track)
    new = []
    for n in notes:
        note = Note(_pitch(n["pitch"]), float(n["start"]), float(n["duration"]),
                    int(n.get("velocity", 90)))
        note.validate()
        new.append(note)
    t.notes.extend(new)
    t.notes.sort(key=lambda x: (x.start, x.pitch))
    return {"track": track, "added": len(new), "total": len(t.notes)}


def transpose(project: Project, track: str, semitones: int) -> dict:
    t = project.track(track)
    for n in t.notes:
        n.pitch += semitones
        n.validate()
    return {"track": track, "semitones": semitones}


def clear_track(project: Project, track: str) -> dict:
    t = project.track(track)
    n = len(t.notes)
    t.notes.clear()
    return {"track": track, "removed": n}


def describe(project: Project) -> dict:
    """Compact summary so an agent can 'see' the project without dumping every note."""
    beats = 0.0
    tracks = []
    for t in project.tracks:
        end = max((n.start + n.duration for n in t.notes), default=0.0)
        beats = max(beats, end)
        tracks.append({
            "name": t.name, "program": t.program, "channel": t.channel,
            "notes": len(t.notes),
            "pitch_range": [min(n.pitch for n in t.notes), max(n.pitch for n in t.notes)] if t.notes else None,
            "length_beats": end,
        })
    bpb = project.time_signature[0]
    return {
        "title": project.title, "tempo": project.tempo,
        "time_signature": list(project.time_signature),
        "length_beats": beats, "length_bars": beats / bpb,
        "length_seconds": beats * 60.0 / project.tempo,
        "tracks": tracks,
    }
