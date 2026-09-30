"""Realised score: the engine's intermediate representation.

A Score is what the composition spec (YAML) expands into. It is fully
explicit (absolute beats, MIDI pitches) and is the single source for both
MIDI export and audio rendering, so the MIDI file and the WAV can never
disagree about the notes.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Note:
    pitch: int  # MIDI note number
    start: float  # beats from song start
    dur: float  # beats
    vel: float  # 0..1
    params: dict[str, float] = field(default_factory=dict)  # per-note extras (e.g. drum pitch offset)


@dataclass
class ChordEvent:
    start: float
    dur: float
    symbol: str
    pcs: list[int]
    bass_pc: int


@dataclass
class SectionInfo:
    name: str
    start_bar: int
    bars: int
    energy: float
    start_beat: float
    end_beat: float


@dataclass
class Track:
    name: str
    kind: str  # melody | chords | bass | arp | drums | fx
    instrument: str  # patch reference (instruments/<...>.yaml without suffix)
    notes: list[Note] = field(default_factory=list)
    role: str = ""  # musical role tag: lead, topline, harmony, bass, rhythm, texture, fx
    midi_channel: int = 0
    mute: bool = False


@dataclass
class Score:
    song_id: str
    tempo: float
    beats_per_bar: int
    key: str
    sections: list[SectionInfo]
    chords: list[ChordEvent]
    tracks: list[Track]
    total_beats: float
    automation: list[dict[str, Any]] = field(default_factory=list)  # resolved: {target, points:[(beat, value)], curve}

    def sec_per_beat(self) -> float:
        return 60.0 / self.tempo

    def beat_to_sec(self, beat: float) -> float:
        return beat * 60.0 / self.tempo

    def track(self, name: str) -> Track:
        for t in self.tracks:
            if t.name == name:
                return t
        raise KeyError(name)

    def section_at(self, beat: float) -> SectionInfo | None:
        for s in self.sections:
            if s.start_beat <= beat < s.end_beat:
                return s
        return None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def score_from_dict(d: dict[str, Any]) -> Score:
    """Inverse of Score.to_dict (used to re-analyse an existing render)."""
    return Score(
        song_id=d["song_id"], tempo=d["tempo"], beats_per_bar=d["beats_per_bar"], key=d["key"],
        sections=[SectionInfo(**s) for s in d["sections"]],
        chords=[ChordEvent(**c) for c in d["chords"]],
        tracks=[Track(**{**t, "notes": [Note(**n) for n in t["notes"]]}) for t in d["tracks"]],
        total_beats=d["total_beats"],
        automation=[{**a, "points": [tuple(p) for p in a["points"]]} for a in d.get("automation", [])],
    )
