import pytest

from music_agent.theory import (
    nearest_in_range,
    parse_chord,
    parse_key,
    parse_pitch,
    pitch_name,
    voice_chord,
)


def test_parse_pitch_roundtrip():
    assert parse_pitch("C4") == 60
    assert parse_pitch("F#4") == 66
    assert parse_pitch("Bb2") == 46
    assert parse_pitch("E#5") == 77  # enharmonic F5
    for m in range(21, 109):
        assert parse_pitch(pitch_name(m)) == m


def test_parse_key_variants():
    for txt in ("F# minor", "F#minor", "F#m", "f# minor".capitalize().replace("F#", "F#")):
        k = parse_key(txt)
        assert k.tonic == 6 and k.mode == "minor"
    assert parse_key("A major").mode == "major"
    with pytest.raises(ValueError):
        parse_key("H major")


def test_degrees_f_sharp_minor():
    k = parse_key("F# minor")
    base = parse_pitch("F#4")
    names = [pitch_name(k.degree_to_midi(d, 0, base)) for d in range(1, 9)]
    assert names == ["F#4", "G#4", "A4", "B4", "C#5", "D5", "E5", "F#5"]
    assert k.degree_to_midi(0, 0, base) == parse_pitch("E4")
    assert k.degree_to_midi(7, 1, base) == parse_pitch("E#5")
    assert k.midi_to_degree(parse_pitch("C#5"), base) == (5, 0)


def test_chord_symbols_and_roman():
    k = parse_key("F# minor")
    assert parse_chord("Dmaj7").pcs == [2, 6, 9, 1]
    assert parse_chord("C#m7").pcs == [1, 4, 8, 11]
    assert parse_chord("E/G#").bass == 8
    assert parse_chord("VI", k).pcs == parse_chord("D").pcs
    assert parse_chord("i", k).pcs == parse_chord("F#m").pcs
    assert parse_chord("iv7", k).pcs == parse_chord("Bm7").pcs
    with pytest.raises(ValueError):
        parse_chord("Dxyz")


def test_voicing_in_range_complete_and_smooth():
    lo, hi = parse_pitch("F#3"), parse_pitch("E5")
    prev = None
    for sym in ["Dmaj7", "E", "F#m", "C#m7", "Dmaj7"]:
        ch = parse_chord(sym)
        v = voice_chord(ch, lo, hi, 4, prev)
        assert all(lo <= p <= hi for p in v)
        assert list(v) == sorted(v)
        minor = "m" in sym and "maj" not in sym
        assert (ch.root + (3 if minor else 4)) % 12 in {p % 12 for p in v}  # third present
        if prev:
            assert sum(abs(a - b) for a, b in zip(prev, v)) <= 12  # voice leading, not jumps
        prev = v


def test_voicing_impossible_range_raises_clear_error():
    with pytest.raises(ValueError, match="widen the range"):
        voice_chord(parse_chord("E"), parse_pitch("A3"), parse_pitch("A4"), 4)


def test_nearest_in_range():
    assert nearest_in_range(6, 30, 41, None) == 30
    assert nearest_in_range(2, 30, 41, 40) == 38
