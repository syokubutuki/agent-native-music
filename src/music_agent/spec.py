"""Song specification loading.

A song is a directory with `song.yaml` plus optional included files
(harmony.yaml, melody.yaml, arrangement.yaml, mix.yaml ...). Overlays
(candidate variations, human-directed tweaks) are deep-merged on top.

Time references used throughout the spec:
    "drop:0"      -> section 'drop', bar 0 (0-based), beat 0
    "drop:2.5"    -> section 'drop', bar 2 + half a bar
    "drop:end"    -> end of section 'drop'
    "build:3|2"   -> section 'build', bar 3, beat 2 (0-based beat inside bar)
    12            -> absolute bar 12 (number)
"""
from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class SpecError(ValueError):
    pass


def deep_merge(base: Any, over: Any) -> Any:
    """Merge `over` into `base` (returns new object). Dicts merge recursively;
    lists and scalars are replaced. A dict value {'__replace__': X} replaces
    wholesale; a value of None deletes the key."""
    if isinstance(base, dict) and isinstance(over, dict):
        if "__replace__" in over:
            return copy.deepcopy(over["__replace__"])
        out = copy.deepcopy(base)
        for k, v in over.items():
            if v is None:
                out.pop(k, None)
            elif k in out:
                out[k] = deep_merge(out[k], v)
            else:
                out[k] = copy.deepcopy(v)
        return out
    return copy.deepcopy(over)


def _load_yaml(path: Path) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except FileNotFoundError as e:
        raise SpecError(f"Spec file not found: {path}") from e
    if not isinstance(data, dict):
        raise SpecError(f"{path}: top level must be a mapping")
    return data


@dataclass
class SongSpec:
    path: Path  # path to song.yaml
    data: dict  # fully resolved (includes + overlays merged)
    source_files: list[Path] = field(default_factory=list)

    @property
    def song_dir(self) -> Path:
        return self.path.parent

    @property
    def id(self) -> str:
        return str(self.data.get("id", self.song_dir.name))

    def section(self, name: str) -> dict:
        for s in self.data["sections"]:
            if s["name"] == name:
                return s
        raise SpecError(f"Unknown section '{name}'. Sections: {[s['name'] for s in self.data['sections']]}")

    def content_hash(self) -> str:
        blob = json.dumps(self.data, sort_keys=True, default=str).encode()
        return hashlib.sha256(blob).hexdigest()[:16]


REQUIRED_TOP = ["tempo", "key", "sections"]


def load_song(path: str | Path, overlays: list[str | Path] | None = None) -> SongSpec:
    p = Path(path).resolve()
    if p.is_dir():
        p = p / "song.yaml"
    root = _load_yaml(p)
    files = [p]
    data: dict = {}
    for _, rel in (root.get("include") or {}).items():
        inc = p.parent / rel
        data = deep_merge(data, _load_yaml(inc))
        files.append(inc)
    data = deep_merge(data, {k: v for k, v in root.items() if k != "include"})
    for ov in overlays or []:
        ovp = Path(ov)
        data = deep_merge(data, _load_yaml(ovp))
        files.append(ovp)
    for k in REQUIRED_TOP:
        if k not in data:
            raise SpecError(f"{p}: missing required key '{k}'")
    names = [s.get("name") for s in data["sections"]]
    if len(set(names)) != len(names):
        raise SpecError(f"Duplicate section names: {names}")
    for s in data["sections"]:
        if "bars" not in s or int(s["bars"]) <= 0:
            raise SpecError(f"Section {s.get('name')} needs positive 'bars'")
    return SongSpec(p, data, files)


def resolve_instrument_path(ref: str, song_dir: Path | None = None) -> Path:
    """'lead/supersaw' -> instruments/lead/supersaw.yaml (song-local first)."""
    cands = []
    if song_dir is not None:
        cands.append(song_dir / "instruments" / f"{ref}.yaml")
    cands.append(PROJECT_ROOT / "instruments" / f"{ref}.yaml")
    for c in cands:
        if c.exists():
            return c
    raise SpecError(f"Instrument patch '{ref}' not found (looked in {[str(c) for c in cands]})")


def load_instrument(ref: str, song_dir: Path | None = None, overrides: dict | None = None) -> tuple[dict, Path]:
    path = resolve_instrument_path(ref, song_dir)
    patch = _load_yaml(path)
    if "extends" in patch:
        parent, _ = load_instrument(patch.pop("extends"), song_dir)
        patch = deep_merge(parent, patch)
    if overrides:
        patch = deep_merge(patch, overrides)
    return patch, path


class Timeline:
    """Maps section-relative references to absolute beats."""

    def __init__(self, sections: list[dict], beats_per_bar: int):
        self.bpb = beats_per_bar
        self.starts: dict[str, int] = {}
        self.bars: dict[str, int] = {}
        bar = 0
        for s in sections:
            self.starts[s["name"]] = bar
            self.bars[s["name"]] = int(s["bars"])
            bar += int(s["bars"])
        self.total_bars = bar

    def bar_of(self, section: str) -> int:
        if section not in self.starts:
            raise SpecError(f"Unknown section '{section}' in time reference")
        return self.starts[section]

    def beat(self, ref: Any) -> float:
        if isinstance(ref, (int, float)):
            return float(ref) * self.bpb
        s = str(ref).strip()
        if ":" not in s:
            try:
                return float(s) * self.bpb
            except ValueError as e:
                raise SpecError(f"Bad time reference '{ref}'") from e
        sec, _, pos = s.partition(":")
        start = self.bar_of(sec)
        if pos == "end":
            return (start + self.bars[sec]) * self.bpb
        beat_in_bar = 0.0
        if "|" in pos:
            pos, _, b = pos.partition("|")
            beat_in_bar = float(b)
        return (start + float(pos)) * self.bpb + beat_in_bar
