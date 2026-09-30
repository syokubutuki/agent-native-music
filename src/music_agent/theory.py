"""Music theory primitives: pitches, keys, scales, chords, voicing.

Everything here is pure and deterministic. Pitches are MIDI note numbers
(C4 = 60). Pitch classes are ints 0..11 (C = 0).
"""
from __future__ import annotations

import itertools
import re
from dataclasses import dataclass, field

NOTE_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],  # natural minor / aeolian
    "harmonic_minor": [0, 2, 3, 5, 7, 8, 11],
    "melodic_minor": [0, 2, 3, 5, 7, 9, 11],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "phrygian": [0, 1, 3, 5, 7, 8, 10],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
}

# Chord quality suffix -> intervals above root (semitones).
CHORD_QUALITIES = {
    "": [0, 4, 7],
    "maj": [0, 4, 7],
    "m": [0, 3, 7],
    "min": [0, 3, 7],
    "dim": [0, 3, 6],
    "aug": [0, 4, 8],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
    "5": [0, 7],
    "6": [0, 4, 7, 9],
    "m6": [0, 3, 7, 9],
    "7": [0, 4, 7, 10],
    "maj7": [0, 4, 7, 11],
    "m7": [0, 3, 7, 10],
    "mmaj7": [0, 3, 7, 11],
    "m7b5": [0, 3, 6, 10],
    "dim7": [0, 3, 6, 9],
    "7sus4": [0, 5, 7, 10],
    "add9": [0, 4, 7, 14],
    "madd9": [0, 3, 7, 14],
    "9": [0, 4, 7, 10, 14],
    "maj9": [0, 4, 7, 11, 14],
    "m9": [0, 3, 7, 10, 14],
    "m11": [0, 3, 7, 10, 14, 17],
}

_PITCH_RE = re.compile(r"^([A-Ga-g])([#b]*)(-?\d+)$")
_PC_RE = re.compile(r"^([A-G])([#b]*)")
_ROMAN_RE = re.compile(r"^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$")
_ROMAN_VAL = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7}


def parse_pitch(name: str | int) -> int:
    """'C#5' -> 73, 'Eb3' -> 51, 'E#5' -> 77. Ints pass through."""
    if isinstance(name, int):
        return name
    m = _PITCH_RE.match(name.strip())
    if not m:
        raise ValueError(f"Cannot parse pitch '{name}' (expected e.g. 'F#4', 'Bb2')")
    letter, acc, octv = m.groups()
    pc = NOTE_PC[letter.upper()] + acc.count("#") - acc.count("b")
    return (int(octv) + 1) * 12 + pc


def pitch_name(midi: int, flats: bool = False) -> str:
    names = FLAT_NAMES if flats else SHARP_NAMES
    return f"{names[midi % 12]}{midi // 12 - 1}"


def parse_pc(name: str) -> int:
    m = _PC_RE.match(name)
    if not m:
        raise ValueError(f"Cannot parse pitch class '{name}'")
    letter, acc = m.groups()
    return (NOTE_PC[letter] + acc.count("#") - acc.count("b")) % 12


def midi_to_hz(midi):
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


@dataclass(frozen=True)
class Key:
    tonic: int  # pitch class
    mode: str  # key of SCALES

    @property
    def scale(self) -> list[int]:
        return SCALES[self.mode]

    @property
    def pcs(self) -> set[int]:
        return {(self.tonic + s) % 12 for s in self.scale}

    def degree_to_midi(self, degree: int, alter: int = 0, base: int = 60) -> int:
        """Scale degree (1-based, may exceed 7 or be <= 0) -> MIDI.

        `base` is the MIDI note of degree 1 in the reference octave.
        degree 8 is one octave above degree 1, degree 0 is the 7th degree below.
        """
        idx = degree - 1
        octv, step = divmod(idx, 7)
        return base + octv * 12 + self.scale[step] + alter

    def midi_to_degree(self, midi: int, base: int) -> tuple[int, int]:
        """Inverse of degree_to_midi (nearest diatonic degree + alteration)."""
        rel = midi - base
        octv, semis = divmod(rel, 12)
        best = min(range(7), key=lambda i: (abs(self.scale[i] - semis), self.scale[i] > semis))
        return octv * 7 + best + 1, semis - self.scale[best]

    def __str__(self) -> str:
        return f"{SHARP_NAMES[self.tonic]} {self.mode}"


def parse_key(text: str) -> Key:
    """'F# minor', 'F#minor', 'F#m', 'A major', 'D dorian'."""
    t = text.strip().replace("_", " ")
    m = _PC_RE.match(t)
    if not m:
        raise ValueError(f"Cannot parse key '{text}'")
    tonic = parse_pc(t)
    rest = t[m.end():].strip().lower()
    aliases = {"": "major", "m": "minor", "min": "minor", "maj": "major", "aeolian": "minor", "ionian": "major"}
    mode = aliases.get(rest, rest.replace(" ", "_"))
    if mode not in SCALES:
        raise ValueError(f"Unknown mode '{rest}' in key '{text}'. Known: {sorted(SCALES)}")
    return Key(tonic, mode)


@dataclass(frozen=True)
class Chord:
    symbol: str
    root: int  # pitch class
    intervals: tuple[int, ...]
    bass: int  # pitch class of lowest note (slash chords)

    @property
    def pcs(self) -> list[int]:
        return [(self.root + i) % 12 for i in self.intervals]

    @property
    def core_pcs(self) -> set[int]:
        """Root/third/fifth-ish tones that are safe on strong beats."""
        return {(self.root + i) % 12 for i in self.intervals if i % 12 in (0, 3, 4, 5, 7, 2)}


def _chord_from_parts(symbol: str, root: int, quality: str, bass_txt: str | None) -> Chord:
    q = quality
    if q not in CHORD_QUALITIES:
        raise ValueError(f"Unknown chord quality '{q}' in '{symbol}'. Known: {sorted(CHORD_QUALITIES)}")
    bass = parse_pc(bass_txt) if bass_txt else root
    return Chord(symbol, root, tuple(CHORD_QUALITIES[q]), bass)


def parse_chord(symbol: str, key: Key | None = None) -> Chord:
    """Chord symbols ('Dmaj7', 'C#m7', 'E/G#', 'C#sus4') or roman numerals
    relative to `key` ('VI', 'VII', 'i', 'iv7', 'V', 'bVII')."""
    s = symbol.strip()
    main, _, bass_txt = s.partition("/")
    if main and main[0] in "ABCDEFG":
        m = _PC_RE.match(main)
        root = parse_pc(main)
        return _chord_from_parts(s, root, main[m.end():], bass_txt or None)
    rm = _ROMAN_RE.match(main)
    if rm and key is not None:
        acc, numeral, suffix = rm.groups()
        deg = _ROMAN_VAL[numeral.lower()]
        root = (key.tonic + key.scale[deg - 1] + (1 if acc == "#" else -1 if acc == "b" else 0)) % 12
        minor = numeral.islower()
        if suffix in ("", "7", "9", "6", "add9") and minor:
            quality = {"": "m", "7": "m7", "9": "m9", "6": "m6", "add9": "madd9"}[suffix]
        elif suffix == "o":
            quality = "dim"
        else:
            quality = suffix
        bass = None
        if bass_txt:
            bass = bass_txt
        return _chord_from_parts(s, root, quality, bass)
    raise ValueError(f"Cannot parse chord '{symbol}' (roman numerals need a key)")


# ---------------------------------------------------------------- voicing


def _tone_weights(chord: Chord) -> dict[int, float]:
    """Penalty for omitting each chord tone from a voicing."""
    w = {}
    for iv in chord.intervals:
        pc = (chord.root + iv) % 12
        r = iv % 12
        if r == 0:
            w[pc] = 3.0  # root
        elif r in (3, 4, 2, 5):
            w[pc] = max(w.get(pc, 0), 10.0)  # third / sus tone defines the chord
        elif r == 7:
            w[pc] = max(w.get(pc, 0), 0.5)  # fifth is the most expendable
        else:
            w[pc] = max(w.get(pc, 0), 2.0)  # 6ths, 7ths, 9ths: colour
    return w


def _candidate_voicings(chord: Chord, low: int, high: int, n: int, max_span: int = 19):
    """All n-note voicings in range (with a completeness penalty)."""
    weights = _tone_weights(chord)
    pool = [m for m in range(low, high + 1) if m % 12 in weights]
    need_distinct = min(n, len(weights), 3)
    out = []
    for combo in itertools.combinations(pool, n):
        if combo[-1] - combo[0] > max_span:
            continue
        pcs = {m % 12 for m in combo}
        if len(pcs) < need_distinct:
            continue
        missing = sum(w for pc, w in weights.items() if pc not in pcs)
        if missing >= 10:  # no third / sus tone
            continue
        out.append((combo, missing))
    return out


def voice_chord(chord: Chord, low: int, high: int, n: int = 4, prev: tuple[int, ...] | None = None,
                center: int | None = None) -> tuple[int, ...]:
    """Choose a voicing of `chord` with `n` notes in [low, high].

    Minimises voice movement from `prev` (voice leading); without `prev`
    it prefers voicings centred near `center`. Penalises omitted chord tones,
    muddy close intervals in the low register and exposed minor seconds.
    """
    cands = _candidate_voicings(chord, low, high, n)
    if not cands:
        raise ValueError(f"No voicing for {chord.symbol} in range {pitch_name(low)}-{pitch_name(high)} "
                         f"with {n} voices (widen the range or reduce voices)")
    ctr = center if center is not None else (low + high) // 2

    def cost(item) -> float:
        v, missing = item
        c = missing * 1.5
        if prev is not None and len(prev) == len(v):
            c += sum(abs(a - b) for a, b in zip(sorted(prev), v))
        else:
            c += abs(sum(v) / len(v) - ctr) * 0.5
        for a, b in zip(v, v[1:]):
            if b - a <= 2 and a < 52:  # seconds below E3 are muddy
                c += 6
            if b - a == 1:  # exposed minor seconds are harsh in pads
                c += 3
        if len(set(m % 12 for m in v)) < len(v):  # doubling costs a little
            c += 0.5
        return c

    return min(cands, key=cost)[0]


def nearest_in_range(pc: int, low: int, high: int, prev: int | None) -> int:
    """MIDI note with pitch class `pc` in [low, high] closest to `prev` (or lowest)."""
    options = [m for m in range(low, high + 1) if m % 12 == pc]
    if not options:
        raise ValueError(f"No pitch class {pc} in range {low}-{high}")
    if prev is None:
        return options[0]
    return min(options, key=lambda m: (abs(m - prev), m))
