import tempfile
import unittest
from pathlib import Path

from anm import Project, ops, midi


class CoreTests(unittest.TestCase):
    def make(self):
        p = Project(title="t", tempo=100)
        ops.add_track(p, "piano", program=0)
        ops.add_notes(p, "piano", [
            {"pitch": "C4", "start": 0, "duration": 1},
            {"pitch": "E4", "start": 1, "duration": 1, "velocity": 100},
        ])
        return p

    def test_note_names(self):
        self.assertEqual(ops.note_name_to_midi("C4"), 60)
        self.assertEqual(ops.note_name_to_midi("F#3"), 54)
        self.assertEqual(ops.note_name_to_midi("Bb2"), 46)

    def test_roundtrip(self):
        p = self.make()
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "p.json"
            p.save(f)
            self.assertEqual(Project.load(f).to_dict(), p.to_dict())

    def test_describe_and_transpose(self):
        p = self.make()
        ops.transpose(p, "piano", 12)
        d = ops.describe(p)
        self.assertEqual(d["tracks"][0]["pitch_range"], [72, 76])
        self.assertAlmostEqual(d["length_seconds"], 2 * 60 / 100)

    def test_validation(self):
        p = self.make()
        with self.assertRaises(ValueError):
            ops.add_notes(p, "piano", [{"pitch": 200, "start": 0, "duration": 1}])
        with self.assertRaises(KeyError):
            ops.add_notes(p, "nope", [])

    def test_midi_deterministic_and_wellformed(self):
        a, b = midi.to_bytes(self.make()), midi.to_bytes(self.make())
        self.assertEqual(a, b)
        self.assertTrue(a.startswith(b"MThd"))
        self.assertEqual(a.count(b"MTrk"), 2)


if __name__ == "__main__":
    unittest.main()
