from types import SimpleNamespace

import numpy as np
import pytest

from music_agent.candidates.generate import melodic_diagnostics, motif_candidates, motif_to_str
from music_agent.composition.notation import parse_notes
from music_agent.evaluation import preferences
from music_agent.evaluation.rules import _melody_harmony, audio_checks
from music_agent.rendering.vst3 import notes_to_midi_messages, render_vst3
from music_agent.score import ChordEvent, Note, Score, SectionInfo, Track
from music_agent.spec import PROJECT_ROOT


def _score(notes, chords):
    return Score("t", 120, 4, "C major", [SectionInfo("a", 0, 1, 0.5, 0, 4)], chords,
                 [Track("lead", "melody", "x", notes, "lead")], 4)


def test_melody_clash_detection():
    ce = [ChordEvent(0, 4, "C", [0, 4, 7], 0)]
    sc = _score([Note(61, 0, 1, 0.8), Note(62, 1, 1, 0.8), Note(64, 2, 1, 0.8), Note(65, 2.5, 0.25, 0.8)], ce)
    f = _melody_harmony(sc, sc.tracks[0])
    ids = [(x["level"], x["where"]) for x in f]
    assert ("warn", "lead@beat0") in ids  # C# over C: semitone clash
    assert all("beat1" not in w for _, w in ids)  # D = added 9th, allowed
    assert all("beat2.5" not in w for _, w in ids)  # short off-beat passing note ignored


def test_audio_checks_flag_clipping_and_silence():
    an = {"global": {"clipped_samples": 10, "true_peak_dbtp": 0.3, "dc_offset": 0.0},
          "bars": [{"bar": 0, "rms_dbfs": -80.0}],
          "sections": [], "stems": {"kick_bass": {"low_overlap_ratio": 0.6}}}
    sc = _score([], [])
    ids = {f["id"] for f in audio_checks(an, sc, {})}
    assert {"audio.clipping", "audio.true_peak", "audio.silence", "mix.kick_bass_overlap"} <= ids


def test_preferences_roundtrip(tmp_path):
    p = tmp_path / "prefs.jsonl"
    preferences.record(["a", "b", "c"], "b", "melody", {"sound": "c"}, "more air", {"batch": "x"}, path=p)
    preferences.record(["a", "b"], "a", "energy", path=p)
    recs = preferences.load(p)
    assert len(recs) == 2 and recs[0]["aspects"] == {"sound": "c"}
    pairs = preferences.pairwise(recs)
    assert ("b", "a", "melody") in pairs and ("b", "c", "melody") in pairs and ("a", "b", "energy") in pairs
    assert preferences.win_counts(recs)["b"] == {"wins": 2, "losses": 1}
    with pytest.raises(ValueError):
        preferences.record(["a"], "z", path=p)


def test_motif_candidates_are_valid_and_seeded():
    c1 = motif_candidates(PROJECT_ROOT / "songs/track_001", "a", 4, seed=11)
    c2 = motif_candidates(PROJECT_ROOT / "songs/track_001", "a", 4, seed=11)
    assert [c["motif"] for c in c1] == [c["motif"] for c in c2]
    assert c1[0]["ops"] == ["original"]
    assert len({c["motif"] for c in c1}) == len(c1)
    for c in c1[1:]:
        parse_notes(c["motif"])  # parseable
        assert c["overlay"]["melody"]["motifs"]["a"] == c["motif"]


def test_motif_to_str_roundtrip():
    s = "7:3 5:3 r:2 3#:4 E5:4"
    assert motif_to_str(parse_notes(s)) == s


def test_melodic_diagnostics():
    d = melodic_diagnostics([60, 62, 64, 72, 74])
    assert d["range"] == 14 and d["unrecovered_leaps"] == 1


def test_vst3_backend_with_mock_plugin():
    class FakePlugin:
        def __init__(self):
            self.cutoff = 0.0
            self.calls = []

        def __call__(self, msgs, duration, sample_rate, num_channels, reset):
            self.calls.append(msgs)
            return np.ones((num_channels, int(duration * sample_rate)), dtype=np.float32) * 0.1

    tr = Track("lead", "melody", "x", [Note(60, 0, 1, 1.0), Note(64, 1, 1, 0.5)])
    sc = Score("t", 120, 4, "C major", [], [], [tr], 4)
    msgs = notes_to_midi_messages(tr, sc)
    assert [m.type for m in msgs] == ["note_on", "note_off", "note_on", "note_off"]
    assert abs(msgs[2].time - 0.5) < 1e-9
    plug = FakePlugin()
    out = render_vst3({"params": {"cutoff": 0.7}, "gain_db": 0}, tr, sc, 1000, 2000, plugin=plug)
    assert out.shape == (2, 2000) and plug.cutoff == 0.7 and len(plug.calls) == 1
