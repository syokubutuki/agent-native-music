"""Spec -> Score -> MIDI round trip, on inline test specs and on the real songs."""
from pathlib import Path

import pytest
import yaml

from music_agent.composition.realize import realize
from music_agent.midi.io import read_markers, read_midi, write_midi
from music_agent.spec import PROJECT_ROOT, SpecError, Timeline, deep_merge, load_song
from music_agent.theory import parse_pitch

SPEC = {
    "id": "t", "tempo": 120, "key": "A minor", "seed": 3,
    "sections": [{"name": "a", "bars": 2}, {"name": "b", "bars": 1}],
    "harmony": {"sections": {"a": ["Am", "F G"], "b": ["E"]}},
    "melody": {"motifs": {"m": "5:4 3:4 1:8"},
               "parts": {"lead": {"base": "A4", "sections": {
                   "a": [{"bar": 0, "motif": "m"}, {"bar": 1, "motif": "m", "ops": [{"transpose": 1}]}],
                   "b": [{"bar": 0, "notes": "7#:16"}]}}}},
    "arrangement": {"tracks": {
        "lead": {"instrument": "keys/glass_pluck", "role": "lead", "content": {"type": "melody", "part": "lead"}},
        "pad": {"instrument": "pad/warm_pad", "content": {"type": "chords", "range": ["E3", "E5"], "voices": 3,
                                                         "patterns": {"a": "x---------------", "b": "x-------x-------"}}},
        "bass": {"instrument": "bass/sub_saw_bass", "role": "bass",
                 "content": {"type": "bass", "range": ["E1", "D#2"], "patterns": {"a": "x...x...x...x...", "b": "u..."}}},
        "kick": {"instrument": "drums/kick_main", "content": {"type": "drums", "patterns": {"b": "x...x...x...x..."},
                                                             "ramp": {"b": {"vel": [0.5, 1.0]}}}},
        "sweep": {"instrument": "fx/riser", "content": {"type": "fx", "events": [{"at": "a:1", "until": "b:0"}]}},
    }},
}


@pytest.fixture
def spec_dir(tmp_path):
    d = tmp_path / "song"
    d.mkdir()
    (d / "song.yaml").write_text(yaml.safe_dump(SPEC))
    return d


def test_realize_structure(spec_dir):
    score = realize(load_song(spec_dir))
    assert score.total_beats == 12
    assert [c.symbol for c in score.chords] == ["Am", "F", "G", "E"]
    assert [c.start for c in score.chords] == [0, 4, 6, 8]
    lead = score.track("lead").notes
    assert [n.pitch for n in lead[:3]] == [parse_pitch("E5"), parse_pitch("C5"), parse_pitch("A4")]
    assert lead[3].pitch == parse_pitch("F5") and lead[3].start == 4.0  # diatonic transpose +1
    assert lead[-1].pitch == parse_pitch("G#5")  # raised 7th
    bass = score.track("bass").notes
    assert bass[0].pitch == parse_pitch("A1")
    assert bass[-1].start == 8.0 and bass[-1].pitch == parse_pitch("E2")  # 'u' = octave up from E1
    kick = score.track("kick").notes
    assert len(kick) == 4 and kick[0].vel < kick[-1].vel  # velocity ramp
    sweep = score.track("sweep").notes[0]
    assert sweep.start == 4.0 and sweep.dur == 4.0
    assert score.track("kick").midi_channel == 9


def test_bass_follows_chord_roots(spec_dir):
    score = realize(load_song(spec_dir))
    roots = {"Am": 9, "F": 5, "G": 7, "E": 4}
    from music_agent.composition.realize import chord_at
    for n in score.track("bass").notes:
        assert n.pitch % 12 == roots[chord_at(score.chords, n.start).symbol]


def test_midi_roundtrip(spec_dir, tmp_path):
    score = realize(load_song(spec_dir))
    p = write_midi(score, tmp_path / "x.mid")
    back = read_midi(p)
    for tr in score.tracks:
        got = back[tr.name]
        assert len(got) == len(tr.notes), tr.name
        for a, b in zip(sorted(tr.notes, key=lambda n: (n.start, n.pitch)), got):
            assert a.pitch == b.pitch
            assert abs(a.start - b.start) < 1e-3 and abs(a.dur - b.dur) < 1e-3
            assert abs(round(a.vel * 127) - round(b.vel * 127)) <= 1
    markers = [t for _, t in read_markers(p)]
    assert "section:a" in markers and "chord:E" in markers


def test_timeline_refs():
    tl = Timeline([{"name": "intro", "bars": 8}, {"name": "drop", "bars": 8}], 4)
    assert tl.beat("drop:0") == 32
    assert tl.beat("drop:end") == 64
    assert tl.beat("intro:2.5") == 10
    assert tl.beat("drop:1|2") == 38
    assert tl.beat(3) == 12
    with pytest.raises(SpecError):
        tl.beat("nope:0")


def test_overlay_merge(spec_dir, tmp_path):
    ov = tmp_path / "ov.yaml"
    ov.write_text(yaml.safe_dump({"melody": {"motifs": {"m": "1:16"}}, "tempo": 100}))
    s = load_song(spec_dir, [ov])
    assert s.data["tempo"] == 100
    assert s.data["melody"]["motifs"]["m"] == "1:16"
    assert s.data["melody"]["parts"]["lead"]["base"] == "A4"  # untouched branch kept
    assert deep_merge({"a": {"b": 1, "c": 2}}, {"a": {"c": None}}) == {"a": {"b": 1}}


def test_harmony_bar_count_validated(spec_dir):
    bad = dict(SPEC, harmony={"sections": {"a": ["Am"], "b": ["E"]}})
    (spec_dir / "song.yaml").write_text(yaml.safe_dump(bad))
    with pytest.raises(SpecError, match="bar entries"):
        realize(load_song(spec_dir))


@pytest.mark.parametrize("song", ["songs/test_minimal", "songs/track_001"])
def test_real_songs_realize_and_roundtrip(song, tmp_path):
    spec = load_song(PROJECT_ROOT / song)
    score = realize(spec)
    assert score.tracks and score.chords
    back = read_midi(write_midi(score, tmp_path / "s.mid"))
    assert sum(len(v) for v in back.values()) == sum(len(t.notes) for t in score.tracks)
