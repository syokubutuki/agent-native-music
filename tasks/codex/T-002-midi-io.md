# T-002 MIDI export/import with round-trip tests

- 目的: 楽曲状態（Score）を標準 MIDI として書き出し、DAW での最終確認・外部音源・将来のボーカル制作へ受け渡せるようにする。
  MIDI と WAV が同じ Score から作られることを保証する。
- 背景: Score は `src/music_agent/score.py`（Note: pitch/start[beat]/dur[beat]/vel[0..1]）。トラックは名前・MIDI ch を持ち、
  ドラムは ch 9（GM）。セクションとコードも DAW で見えると人間の確認が楽になる。
- 入力: `Score`（realize 済）。
- 出力: `src/music_agent/midi/io.py` — `write_midi(score, path)`（Type-1, PPQ 960, track0 に tempo/拍子/section・chord marker,
  各トラック名付き）、`read_midi(path) -> {track: [Note]}`、`read_markers(path)`。CLI `python -m music_agent midi <song> -o x.mid`。
- 制約: 同一ピッチの連続ノートで note_off が note_on より先に並ぶこと。0 長ノートを作らない。mido のみ使用。
- 完了条件: 書き出し → 再読込でノート数・音高・開始・長さ（±1 tick）・ベロシティ（±1）が一致。テンポ変更は現状 1 つ（将来拡張）。
- テスト方法: `tests/test_realize_midi.py::test_midi_roundtrip`（複数トラック・ドラム ch・コード marker）、
  実曲 2 つでノート総数一致 `test_real_songs_realize_and_roundtrip`。`python -m pytest -q`。
- 状態: done (executed by: claude, commit: b5d33a4)
