"""voicevox-sing.py の確認。本物のエンジンの代わりに、手元で動く擬似エンジンに送って、楽譜の組み立てと通信の形を調べる。
(本物の VOICEVOX での動作は、このテストでは確かめていない。)"""
import importlib.util, io, json, struct, sys, tempfile, threading, unittest, wave
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('vv', ROOT / 'tools' / 'voicevox-sing.py')
vv = importlib.util.module_from_spec(spec); spec.loader.exec_module(vv)
SEEN = {}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, body, ctype='application/json'):
        self.send_response(200); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == '/singers':
            self._send(json.dumps([{'name': 'テスト', 'styles': [{'name': 'a', 'id': 6000, 'type': 'singing_teacher'}, {'name': 'b', 'id': 3000, 'type': 'frame_decode'}]}]).encode())
        else: self._send(b'"0.0"')
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])) or b'null')
        if self.path.startswith('/sing_frame_audio_query'):
            SEEN['query'] = (self.path, body)
            self._send(json.dumps({'f0': [0.0], 'volume': [0.0], 'phonemes': [], 'volumeScale': 1.0, 'outputSamplingRate': 24000, 'outputStereo': False}).encode())
        else:
            SEEN['synth'] = (self.path, body)
            buf = io.BytesIO(); w = wave.open(buf, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(struct.pack('<h', 0) * 240); w.close()
            self._send(buf.getvalue(), 'audio/wav')


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(('127.0.0.1', 0), H); cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.srv.shutdown()

    def song(self):
        return json.loads((ROOT / 'songs' / 'sketch-j-utsuranai-v1.json').read_text(encoding='utf-8'))

    def test_score_shape(self):
        s = self.song(); tr = vv.vocal_tracks(s)[0]
        sc = vv.build_score(s, tr)
        notes = sc['notes']
        self.assertIsNone(notes[0]['key']); self.assertEqual(notes[0]['lyric'], '')          # 先頭は休符
        total = round(s['bars'] * s['beatsPerBar'] * 60 / s['bpm'] * vv.FPS)
        self.assertEqual(sum(n['frame_length'] for n in notes), total)                          # 曲の長さに一致
        sung = [n for n in notes if n['key'] is not None]
        self.assertEqual(len(sung), len(tr['notes']))
        self.assertTrue(all(isinstance(n['key'], int) and n['frame_length'] >= 1 for n in sung))
        self.assertEqual(''.join(n['lyric'] for n in sung), ''.join(n[4] for n in sorted(tr['notes'], key=lambda x: x[0])))
        self.assertEqual(vv.build_score(s, tr, transpose=-12)['notes'][1]['key'], sung[0]['key'] - 12)
        kata = vv.build_score(s, tr, katakana=True)['notes']
        self.assertTrue(all(('ァ' <= c <= 'ヶ') for n in kata if n['key'] is not None for c in n['lyric']))

    def test_end_to_end_with_mock_engine(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / 'x.wav'
            rc = vv.main([str(ROOT / 'songs' / 'sketch-j-utsuranai-v1.json'), '--engine', f'http://127.0.0.1:{self.port}', '--out', str(out)])
            self.assertEqual(rc, 0)
            with wave.open(str(out)) as w: self.assertEqual(w.getframerate(), 24000)
        self.assertIn('speaker=6000', SEEN['query'][0]); self.assertIn('speaker=3000', SEEN['synth'][0])
        self.assertIn('notes', SEEN['query'][1]); self.assertIn('f0', SEEN['synth'][1])

    def test_second_track_is_the_adlib(self):
        s = self.song(); vts = vv.vocal_tracks(s)
        self.assertGreaterEqual(len(vts), 2)
        sc = vv.build_score(s, vts[1])
        self.assertEqual(sum(1 for n in sc['notes'] if n['key'] is not None), len(vts[1]['notes']))


if __name__ == '__main__':
    unittest.main()
