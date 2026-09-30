import pytest

from music_agent.composition.notation import apply_ops, notes_end, parse_notes, parse_pattern, pattern_for_bar
from music_agent.theory import parse_key, parse_pitch, pitch_name

KEY = parse_key("F# minor")
BASE = parse_pitch("F#4")


def pitches(notes):
    return [pitch_name(n.resolve(KEY, BASE)) for n in notes]


def test_parse_notes_positions_and_rests():
    ns = parse_notes("7:3 5:3 r:2 E5:4! 7#:2?")
    assert [n.start for n in ns] == [0, 3, 8, 12]
    assert notes_end(ns) == 14
    assert pitches(ns) == ["E5", "C#5", "E5", "F5"]  # E#5 is spelled F5 (same MIDI note)
    assert ns[2].vel == 1.0 and ns[3].vel == 0.6


def test_bad_token_message():
    with pytest.raises(ValueError, match="Bad note token"):
        parse_notes("7-3")


def test_transpose_keep_anchor():
    a = parse_notes("7:3 5:3 3:4 4:2 5:4")
    out = apply_ops(a, [{"transpose": -1, "keep": [0]}], KEY, BASE)
    assert pitches(out) == ["E5", "B4", "G#4", "A4", "B4"]
    assert pitches(a) == ["E5", "C#5", "A4", "B4", "C#5"]  # original untouched


def test_set_octave_take_append_rhythm():
    a = parse_notes("7:3 5:3 3:4 4:2 5:4")
    out = apply_ops(a, [{"set": {3: 4, 4: 7}}], KEY, BASE)
    assert pitches(out)[3:] == ["B4", "E5"]
    assert pitches(apply_ops(a, [{"octave": 1}], KEY, BASE))[0] == "E6"
    frag = apply_ops(a, [{"take": [0, 3]}, {"append": "8:2"}], KEY, BASE)
    assert pitches(frag) == ["E5", "C#5", "A4", "F#5"] and frag[-1].start == 10
    rh = apply_ops(a, [{"rhythm": "4 4 4 2 2"}], KEY, BASE)
    assert [n.start for n in rh] == [0, 4, 8, 12, 14]


def test_invert_reverse():
    a = parse_notes("1:4 3:4 5:4")
    inv = apply_ops(a, [{"invert": 3}], KEY, BASE)
    assert pitches(inv) == ["C#5", "A4", "F#4"]
    rev = apply_ops(a, [{"reverse": True}], KEY, BASE)
    assert pitches(rev) == ["C#5", "A4", "F#4"] and [n.start for n in rev] == [0, 4, 8]


def test_patterns():
    hits, grid = parse_pattern("x--- ..o. X... u-..")
    assert grid == 16
    assert [(h.step, h.length) for h in hits] == [(0, 4), (6, 1), (8, 1), (12, 2)]
    assert hits[3].octave_up and hits[2].vel == 1.0
    spec = {"0-1": "x...", "3": "..x.", "default": "...."}
    assert pattern_for_bar(spec, 1) == "x..."
    assert pattern_for_bar(spec, 3) == "..x."
    assert pattern_for_bar(spec, 2) == "...."
    assert pattern_for_bar(["a", "b"], 3) == "b"
    with pytest.raises(ValueError):
        parse_pattern("x?..")
