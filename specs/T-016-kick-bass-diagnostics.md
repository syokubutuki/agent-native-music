# T-016 kick/bass 重なり診断の区間別化

## 目的
`analysis.stems.kick_bass.low_overlap_ratio` は曲全体で 1 値のため、どの区間・どの拍で衝突しているか分からない。
セクション別・小節別の値と上位衝突箇所を出し、音楽監督（Claude）が YAML のどこを直せばよいか特定できるようにする。

## 背景・設計判断
- 現行実装: `src/music_agent/analysis/features.py::stem_diagnostics`。kick と bass の post-fader ステムを 30–150 Hz で帯域通過し、
  10 ms フレームの RMS 包絡 `ke`, `be` を作る。kick が最大値の 25% を超えるフレームを「kick 発音中」とし、
  `sum(min(ke, be)[kick発音中]) / sum(be)` を overlap とする。この定義は変えない（過去レンダとの比較のため）。
- track_001 v005〜v007 で 0.39（しきい値 0.35 の警告）が続いているが、ベースを上げ下げしても値がほぼ動かず、原因箇所が不明（EXPERIMENT_LOG EXP-006）。
- 区間の定義は Score の sections（拍）→ 秒 → フレーム。フレーム長は既存と同じ 441 サンプル。

## 変更対象
- `src/music_agent/analysis/features.py`: `stem_diagnostics` の `kick_bass` に以下を追加（既存キーは維持）
  - `by_section`: `{section_name: {"overlap": float, "bass_energy_share": float}}`（bass_energy_share = その区間の bass 低域エネルギー / 全体）
  - `by_bar`: `[{"bar": int, "overlap": float}]`（bass エネルギーがゼロの小節は overlap = null）
  - `worst`: overlap 寄与（min(ke,be) の和）が大きい上位 5 箇所 `[{"beat": float, "bar": int, "contribution": float}]`（拍は 1/4 拍に丸め、近接 0.25 拍以内は統合）
- `stem_diagnostics` のシグネチャに sections 情報が要るなら `score` から取る（既に引数にある）。
- `src/music_agent/analysis/report.py`: Stem diagnostics 節に、区間別 overlap の表と worst 5 を表示。
- `tests/test_evaluation.py` もしくは新規 `tests/test_stem_diagnostics.py`: 合成信号でのテスト。

## 制約
- 既存の出力キー・値を変えない（`low_overlap_ratio` と `kick_to_bass_low_db` は同一値のまま）。
- numpy/scipy のみ。決定論（乱数不要）。
- 楽曲 YAML・音色パッチは変更しない。スコープ外の変更をしない。コミットしない。

## 受け入れ条件
- [ ] 合成テスト: 2 セクション（各 2 小節, 120 BPM）。セクション A は kick と bass が同じ拍に重なる、セクション B は bass がオフビートのみ
      → `by_section["A"]["overlap"] > by_section["B"]["overlap"]`、`worst` の全要素が A 内の拍。
- [ ] `python -m music_agent analyze renders/track_001/track_001_v007` が成功し、report.md に区間別表と worst 5 が出る
      （WAV/stems が無い環境ではこの項目はスキップしてよい。その旨を報告）。
- [ ] 全体の `low_overlap_ratio` が変更前と同一。

## 検証コマンド（すべて成功させること）
```
python -m pytest -q
python -m music_agent render songs/test_minimal --no-preview
```

---
状態: open（2026-09-30 作成。Codex 委譲待ち — クラウド環境は api.openai.com が 403、DECISIONS D-010）
