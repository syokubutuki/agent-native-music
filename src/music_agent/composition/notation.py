"""Compact, LLM-editable notations.

Melodic note strings (motifs / phrases)
---------------------------------------
Whitespace separated tokens `PITCH:LEN[!|?]`:

    "7:3 5:3 3:4 4:2 5:4"     scale degrees with lengths in grid steps
    "7#:3"                    raised 7th (e.g. E# in F# minor)
    "3b:2"                    lowered 3rd
    "E5:4"                    absolute pitch name
    "r:2"                     rest
    "8:16!"                   accent (velocity 1.0);  "?" = ghost (0.6)

Degrees are 1-based relative to the part's `base` note (degree 1).
8 = one octave above 1, 0 = the 7th below, -1 = the 6th below.
Default grid is 16 steps per bar (16th notes in 4/4).

Rhythm pattern strings (drums, bass, chords, arps)
--------------------------------------------------
One string = one bar; its length is the grid (16 -> 16ths, 32 -> 32nds).
Spaces are ignored so "x... x... x... x..." is fine.

    X  accent hit (1.0)      x  normal hit (0.85)     o  ghost hit (0.55)
    u  octave-up hit (bass)  U  accented octave-up
    -  hold previous note    .  rest
"""
from __future__ import annotations

import re
from dataclasses import dataclass, replace

from ..theory import Key, parse_pitch

DEFAULT_VEL = 0.85
_TOKEN_RE = re.compile(r"^(r|-?\d+[#b]?|[A-Ga-g][#b]?-?\d+):(\d+(?:\.\d+)?)([!?]?)$")


@dataclass
class MNote:
    """Motif note before placement: degree-based or absolute."""
    start: float  # grid steps from phrase start
    length: float  # grid steps
    deg: int | None = None
    alter: int = 0
    midi: int | None = None
    vel: float = DEFAULT_VEL

    def resolve(self, key: Key, base: int) -> int:
        if self.midi is not None:
            return self.midi
        return key.degree_to_midi(self.deg, self.alter, base)


def _parse_pitch_token(p: str) -> tuple[int | None, int, int | None]:
    if p[0].isalpha():
        return None, 0, parse_pitch(p[0].upper() + p[1:])
    alter = 0
    if p.endswith("#"):
        alter, p = 1, p[:-1]
    elif p.endswith("b"):
        alter, p = -1, p[:-1]
    return int(p), alter, None


def parse_notes(text: str, start: float = 0.0) -> list[MNote]:
    notes: list[MNote] = []
    pos = start
    for tok in str(text).split():
        m = _TOKEN_RE.match(tok)
        if not m:
            raise ValueError(f"Bad note token '{tok}' in '{text}'. Expected e.g. '5:3', '7#:2', 'E5:4', 'r:2'")
        p, length, mark = m.groups()
        length = float(length)
        if p != "r":
            deg, alter, midi = _parse_pitch_token(p)
            vel = 1.0 if mark == "!" else 0.6 if mark == "?" else DEFAULT_VEL
            notes.append(MNote(pos, length, deg, alter, midi, vel))
        pos += length
    return notes


def notes_end(notes: list[MNote]) -> float:
    return max((n.start + n.length for n in notes), default=0.0)


def parse_pitch_value(v) -> tuple[int | None, int, int | None]:
    return _parse_pitch_token(str(v))


# ------------------------------------------------------------- transforms


def apply_ops(notes: list[MNote], ops: list[dict] | None, key: Key, base: int) -> list[MNote]:
    """Apply motif transformation operators in order.

    transpose: n        diatonic shift (keep: [indices] to hold anchor notes)
    set: {i: pitch}     replace pitch of note i (degree token or pitch name)
    octave: n           shift by octaves
    take: [a, b]        keep notes a..b-1 (fragmentation)
    append: "tokens"    add notes after the current end
    rhythm: "3 3 4"     re-time notes with new lengths (pitches kept)
    invert: deg         diatonic mirror around degree `deg`
    reverse: true       retrograde (pitch order reversed, rhythm kept)
    offset: steps       shift in time
    vel: factor         velocity scale
    accent: [indices]   set velocity 1.0 for indices
    """
    out = [replace(n) for n in notes]
    for op in ops or []:
        if not isinstance(op, dict) or len(op) == 0:
            raise ValueError(f"Bad op {op!r}")
        if "transpose" in op:
            keep = set(op.get("keep", []))
            steps = int(op["transpose"])
            for i, n in enumerate(out):
                if i in keep:
                    continue
                if n.deg is not None:
                    n.deg += steps
                    n.alter = 0
                else:
                    d, a = key.midi_to_degree(n.midi, base)
                    n.deg, n.alter, n.midi = d + steps, 0, None
        elif "set" in op:
            for idx, val in op["set"].items():
                idx = int(idx)
                if idx >= len(out) or idx < -len(out):
                    raise ValueError(f"set index {idx} out of range for {len(out)} notes")
                d, a, m = parse_pitch_value(val)
                out[idx].deg, out[idx].alter, out[idx].midi = d, a, m
        elif "octave" in op:
            for n in out:
                if n.deg is not None:
                    n.deg += 7 * int(op["octave"])
                else:
                    n.midi += 12 * int(op["octave"])
        elif "take" in op:
            a, b = op["take"]
            out = out[a:b]
        elif "append" in op:
            out = out + parse_notes(op["append"], start=notes_end(out))
        elif "rhythm" in op:
            lens = [float(x) for x in str(op["rhythm"]).split()]
            if len(lens) != len(out):
                raise ValueError(f"rhythm has {len(lens)} lengths for {len(out)} notes")
            pos = out[0].start if out else 0.0
            for n, ln in zip(out, lens):
                n.start, n.length = pos, ln
                pos += ln
        elif "invert" in op:
            pivot = int(op["invert"])
            for n in out:
                if n.deg is None:
                    n.deg, n.alter = key.midi_to_degree(n.midi, base)
                    n.midi = None
                n.deg = 2 * pivot - n.deg
                n.alter = 0
        elif "reverse" in op:
            pitches = [(n.deg, n.alter, n.midi) for n in out][::-1]
            for n, (d, a, m) in zip(out, pitches):
                n.deg, n.alter, n.midi = d, a, m
        elif "offset" in op:
            for n in out:
                n.start += float(op["offset"])
        elif "vel" in op:
            for n in out:
                n.vel = max(0.05, min(1.0, n.vel * float(op["vel"])))
        elif "accent" in op:
            for i in op["accent"]:
                out[int(i)].vel = 1.0
        else:
            raise ValueError(f"Unknown op {op!r}")
    return out


# ---------------------------------------------------------------- patterns


@dataclass
class Hit:
    step: float
    length: float
    vel: float
    octave_up: bool = False


_HIT_VEL = {"X": 1.0, "x": 0.85, "o": 0.55, "u": 0.85, "U": 1.0}


def parse_pattern(text: str) -> tuple[list[Hit], int]:
    """Returns (hits, grid). Lengths extend through '-' characters."""
    s = str(text).replace(" ", "").replace("|", "")
    hits: list[Hit] = []
    for i, ch in enumerate(s):
        if ch in _HIT_VEL:
            hits.append(Hit(i, 1, _HIT_VEL[ch], ch in "uU"))
        elif ch == "-":
            if hits:
                hits[-1].length += 1
        elif ch == ".":
            pass
        else:
            raise ValueError(f"Bad pattern char '{ch}' in '{text}' (use X x o u U - .)")
    return hits, len(s)


def pattern_for_bar(spec, bar_index: int) -> str | None:
    """Pattern spec may be a string (every bar), a list (cycled per bar), or a
    dict with 'default' and bar keys ('3', '0-2', '4,6')."""
    if spec is None:
        return None
    if isinstance(spec, str):
        return spec
    if isinstance(spec, list):
        return spec[bar_index % len(spec)] if spec else None
    if isinstance(spec, dict):
        for k, v in spec.items():
            if k == "default":
                continue
            for part in str(k).split(","):
                part = part.strip()
                if "-" in part:
                    a, b = part.split("-")
                    if int(a) <= bar_index <= int(b):
                        return v
                elif part.isdigit() and int(part) == bar_index:
                    return v
        return spec.get("default")
    raise ValueError(f"Bad pattern spec {spec!r}")
