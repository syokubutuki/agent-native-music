"""Project model. A project is plain JSON so agents can read, diff and patch it.

Time is measured in beats (float, quarter note = 1.0). Pitch is MIDI note number.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from pathlib import Path

SCHEMA_VERSION = 1


@dataclass
class Note:
    pitch: int          # 0-127
    start: float        # beats
    duration: float     # beats
    velocity: int = 90  # 1-127

    def validate(self) -> None:
        if not 0 <= self.pitch <= 127:
            raise ValueError(f"pitch out of range: {self.pitch}")
        if not 1 <= self.velocity <= 127:
            raise ValueError(f"velocity out of range: {self.velocity}")
        if self.start < 0 or self.duration <= 0:
            raise ValueError(f"bad timing: start={self.start} duration={self.duration}")


@dataclass
class Track:
    name: str
    program: int = 0      # GM program 0-127
    channel: int = 0      # 0-15 (9 = drums)
    notes: list[Note] = field(default_factory=list)


@dataclass
class Project:
    title: str = "Untitled"
    tempo: float = 120.0
    time_signature: tuple[int, int] = (4, 4)
    tracks: list[Track] = field(default_factory=list)
    version: int = SCHEMA_VERSION

    def track(self, name: str) -> Track:
        for t in self.tracks:
            if t.name == name:
                return t
        raise KeyError(f"no such track: {name}")

    def to_dict(self) -> dict:
        d = asdict(self)
        d["time_signature"] = list(self.time_signature)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Project":
        tracks = [
            Track(t["name"], t.get("program", 0), t.get("channel", 0),
                  [Note(**n) for n in t.get("notes", [])])
            for t in d.get("tracks", [])
        ]
        return cls(d.get("title", "Untitled"), d.get("tempo", 120.0),
                   tuple(d.get("time_signature", (4, 4))), tracks,
                   d.get("version", SCHEMA_VERSION))

    def save(self, path: str | Path) -> None:
        # Stable key order + indent => clean git diffs.
        Path(path).write_text(json.dumps(self.to_dict(), indent=2) + "\n")

    @classmethod
    def load(cls, path: str | Path) -> "Project":
        return cls.from_dict(json.loads(Path(path).read_text()))
