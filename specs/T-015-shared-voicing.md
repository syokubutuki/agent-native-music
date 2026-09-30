# T-015 トラック間で共有するボイシングと根音固定

## 目的
同じ和声を担う複数トラック（pad と chords など）がボイシングを別々に探索し、同時に短 2 度を鳴らす問題（critique v003-C5）を
構造的に防ぐ。また「最低音をコードのベース音に固定する」指定を可能にする。

## 背景・設計判断
- 現行: `src/music_agent/composition/realize.py::realize_chords` がトラックごとに `theory.voice_chord(chord, low, high, n, prev)` を呼ぶ。
  prev（直前ボイシング）はトラック内でのみ引き継がれる。track_001 では pad/chords の range 下限を D3 にそろえて回避しているが恒久策ではない。
- 採用案: chords content に 2 つの任意キーを追加する。
  1. `voicing_group: <name>` — 同じ名前のトラックは、同じコードイベント（symbol, start）に対して **同一のボイシング** を使う
     （グループ内で最初に realize されたトラックの range/voices で探索し、他のトラックは自分の range に入る音だけを使う。入らない場合はオクターブ移動で range 内へ）。
  2. `root_in_bass: true` — 探索候補を「最低音のピッチクラス = コードの bass（スラッシュコードならその音）」に限定する。候補が無ければ現行動作にフォールバックし、
     Layer 1 に info を出す。
- 不採用: トラック間で衝突を事後修正する方式（音楽的な意図が YAML から読めなくなるため）。
- Layer 1 追加: 同時に鳴る和声トラック間（role: harmony）の短 2 度を warn（`harmony.cross_track_clash`）。

## 変更対象
- `src/music_agent/theory.py`: `voice_chord` に `bass_pc: int | None` 引数（root_in_bass 用）。
- `src/music_agent/composition/realize.py`: `realize` でグループ共有キャッシュを渡す。`realize_chords` で `voicing_group` / `root_in_bass` を解釈。
- `src/music_agent/evaluation/rules.py`: `harmony.cross_track_clash`。
- `src/music_agent/composition/notation.py` または realize のモジュール docstring: 新キーのスキーマ例。
- `tests/test_realize_midi.py`, `tests/test_theory.py`: テスト追加。

## 制約
- 新キーを指定しない既存の曲の出力（score.json の音）は **変わらない**こと（track_001 / test_minimal で確認）。
- 決定論。楽曲 YAML（songs/）は変更しない。コミットしない。

## 受け入れ条件
- [ ] 2 トラックが同じ `voicing_group` を持つ spec で、同一コードイベントの音高集合が一致（range 内に移した後）し、同時発音の短 2 度 = 0。
- [ ] `root_in_bass: true` で、全コードイベントの最低音のピッチクラス = コードの bass（`C#m/E` なら E）。
- [ ] 新キー無しの track_001 と test_minimal で、realize 結果（全ノート）が変更前と完全一致（テストで比較）。
- [ ] Layer 1 `harmony.cross_track_clash` がわざと衝突させた spec で warn を出す。

## 検証コマンド（すべて成功させること）
```
python -m pytest -q
python -m music_agent check songs/track_001
python -m music_agent render songs/test_minimal --no-preview
```

---
状態: open（2026-09-30 作成。Codex 委譲待ち — DECISIONS D-010）
