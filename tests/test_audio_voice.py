"""Audio-file playback (`audio` content, `type: sample`) and VOICEVOX voice clips (T-017)."""
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import numpy as np
import pytest
import soundfile as sf
import yaml

from music_agent.composition.realize import realize
from music_agent.rendering.instruments import render_patch
from music_agent.score import Note
from music_agent.spec import SpecError, load_song
from music_agent.voice.voicevox import FPS, Engine, build_request, clip_status, generate, sing_notes

SR = 44100


def _song(tmp_path, extra: dict) -> object:
    data = {"id": "t", "tempo": 120, "key": "C major", "time_signature": [4, 4], "seed": 1,
            "sections": [{"name": "a", "bars": 2}],
            "harmony": {"sections": {"a": ["C", "G"]}},
            "melody": {"parts": {"v": {"base": "C4", "sections": {"a": [{"bar": 0, "notes": "1:4 r:4 3:4 5:4"},
                                                                       {"bar": 1, "notes": "5:16"}]}}}}}
    data.update(extra)
    (tmp_path / "song.yaml").write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")
    return load_song(tmp_path)


def _click_file(path, sr=SR, n=SR, at=1000):
    x = np.zeros(n)
    x[at] = 1.0
    sf.write(path, x, sr)


def test_audio_event_is_placed_with_offset_and_length(tmp_path):
    _click_file(tmp_path / "click.wav", at=SR // 4)          # click 0.25 s into the file
    spec = _song(tmp_path, {"arrangement": {"tracks": {"sfx": {
        "instrument": "fx/sample_player",
        "content": {"type": "audio", "events": [{"at": "a:1", "file": "click.wav", "offset": 0.1, "beats": 1,
                                                 "fade_in": 0.0, "fade_out": 0.0}]}}}}})
    score = realize(spec)
    tr = score.track("sfx")
    assert tr.kind == "audio" and len(tr.notes) == 1 and tr.notes[0].start == 4.0
    n = 4 * SR
    out = render_patch({"type": "sample"}, tr, score, SR, n, 0, tmp_path)
    peak = int(np.argmax(np.abs(out[0])))
    assert abs(peak - (2 * SR + int(0.15 * SR))) <= 2        # bar 1 = 2 s at 120 BPM; 0.25 - 0.1 s offset
    assert out[:, 2 * SR + SR // 2 + 10:].max() == 0          # cut after 1 beat (0.5 s)


def test_audio_resamples_and_defaults_to_file_end(tmp_path):
    _click_file(tmp_path / "c22.wav", sr=22050, n=22050, at=11025)  # 0.5 s into a 1 s file
    spec = _song(tmp_path, {"arrangement": {"tracks": {"sfx": {
        "instrument": "fx/sample_player",
        "content": {"type": "audio", "events": [{"at": "a:0", "file": "c22.wav", "fade_out": 0.0}]}}}}})
    score = realize(spec)
    assert abs(score.track("sfx").notes[0].dur - 2.0) < 1e-6   # 1 s = 2 beats
    out = render_patch({"type": "sample"}, score.track("sfx"), score, SR, 2 * SR, 0, tmp_path)
    assert abs(int(np.argmax(np.abs(out[0]))) - SR // 2) <= 3


def test_audio_tracks_are_not_written_to_midi(tmp_path):
    from music_agent.midi.io import read_midi, write_midi

    _click_file(tmp_path / "click.wav")
    spec = _song(tmp_path, {"arrangement": {"tracks": {"sfx": {
        "instrument": "fx/sample_player", "content": {"type": "audio", "events": [{"at": "a:0", "file": "click.wav"}]}}}}})
    p = write_midi(realize(spec), tmp_path / "x.mid")
    assert "sfx" not in read_midi(p)


def test_sing_notes_frames_rests_and_lyrics():
    notes = [Note(60, 0.0, 1.0, 0.8), Note(64, 2.0, 1.0, 0.8), Note(67, 3.0, 4.0, 0.8)]
    vv, lead = sing_notes(notes, 120, ["ら", "り", "る"], transpose=-12, lead=0.5, tail=0.5)
    assert vv[0]["key"] is None and vv[0]["lyric"] == ""
    assert [v["key"] for v in vv] == [None, 48, None, 52, 55, None]   # gap between notes 1 and 2 is a rest
    total = 0.5 + (7.0 * 0.5) + 0.5
    assert sum(v["frame_length"] for v in vv) == round(total * FPS)
    assert lead == 0.5
    with pytest.raises(SpecError):
        sing_notes(notes, 120, ["ら", "り"])


def _voice_spec(tmp_path):
    return _song(tmp_path, {"voice": {"clips": {
        "v1": {"kind": "sing", "speaker": 3008, "part": "v", "section": "a", "bars": [0, 2], "lyrics": "ら り る れ"},
        "t1": {"kind": "talk", "speaker": 3, "text": "ぷはっ", "at": "a:1|2", "pre": 0.2, "speed": 2.0}}},
        "arrangement": {"tracks": {"vox": {"instrument": "fx/sample_player",
                                           "content": {"type": "voice", "clips": ["v1", "t1"]}}}}})


class _Stub(BaseHTTPRequestHandler):
    calls: list = []

    def _send(self, body: bytes, ctype="application/json"):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/version"):
            self._send(b'"0.0.test"')
        elif self.path.startswith("/speakers"):
            self._send(json.dumps([{"name": "ずんだもん", "styles": [{"id": 3}]}]).encode())
        else:
            self._send(json.dumps([{"name": "春日部つむぎ", "styles": [{"id": 3008}]}]).encode())

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0)
        _Stub.calls.append((self.path, body))
        if "query" in self.path:
            self._send(b'{"volumeScale": 1.0}')
        else:
            buf = io.BytesIO()
            sf.write(buf, np.full(24000, 0.1), 24000, format="WAV")
            self._send(buf.getvalue(), "audio/wav")

    def log_message(self, *a):
        pass


@pytest.fixture
def stub_engine():
    srv = HTTPServer(("127.0.0.1", 0), _Stub)
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    _Stub.calls = []
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def test_voice_generate_cache_and_placement(tmp_path, stub_engine):
    spec = _voice_spec(tmp_path)
    assert dict(clip_status(spec)) == {"v1": "missing", "t1": "missing"}
    assert realize(spec).track("vox").notes == []              # not generated yet: skipped, no error

    res = generate(spec, url=stub_engine, log=lambda *a: None)
    assert sorted(res) == [("t1", "generated"), ("v1", "generated")]
    meta = json.loads((tmp_path / "voice" / "v1.json").read_text(encoding="utf-8"))
    assert meta["credit"] == "VOICEVOX:春日部つむぎ" and meta["start_beat"] == 0.0
    paths = [c[0] for c in _Stub.calls]
    assert any(p.startswith("/sing_frame_audio_query?speaker=6000") for p in paths)
    assert any(p.startswith("/frame_synthesis?speaker=3008") for p in paths)

    assert sorted(generate(spec, url=stub_engine, log=lambda *a: None)) == [("t1", "cached"), ("v1", "cached")]
    assert dict(clip_status(spec)) == {"v1": "ok", "t1": "ok"}

    notes = realize(spec).track("vox").notes
    sing, talk = notes
    assert sing.start == 0.0 and abs(sing.params["offset"] - 0.5) < 1e-9   # lead rest clipped at song start
    assert abs(talk.start - (6.0 - 0.1 / 0.5)) < 1e-9                      # at a:1|2, minus pre/speed (0.1 s)


def test_voice_request_changes_make_clip_stale(tmp_path, stub_engine):
    spec = _voice_spec(tmp_path)
    generate(spec, url=stub_engine, log=lambda *a: None)
    spec.data["voice"]["clips"]["v1"]["lyrics"] = "ま み む め"
    assert dict(clip_status(spec))["v1"] == "stale"
    req, _ = build_request(spec.data, "v1")
    assert [n["lyric"] for n in req["notes"] if n["key"] is not None] == ["ま", "み", "む", "め"]


def test_engine_unreachable_raises_oserror():
    with pytest.raises(OSError):
        Engine("http://127.0.0.1:9", timeout=2).version()
