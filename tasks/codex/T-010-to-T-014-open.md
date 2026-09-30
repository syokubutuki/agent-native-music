# Open tasks for Codex

## T-010 Validate VST3 backend with Surge XT on Windows
- 目的: 内蔵シンセが音質ボトルネックになった場合に、トラック単位で高品質な無料シンセへ差し替えられることを実証する。
- 背景: DECISIONS.md D-004。`rendering/vst3.py` は実装済みだがクラウドでは実機なし（モックテストのみ）。
- 入力: Surge XT 1.3.x VST3（GPLv3, https://surge-synthesizer.github.io/）を `C:/Program Files/Common Files/VST3/` に導入。
- 出力:
  1. `instruments/lead/surge_supersaw.yaml`（`type: vst3`, `plugin`, `params` はパラメータ ID で記述、GUI 不使用）。
  2. `python -m music_agent vst-params <plugin>` の出力を `experiments/surge_params.txt` に保存。
  3. `songs/track_001/overlays/lead_surge.yaml`（lead だけ差し替え）。
  4. DECISIONS.md に結果（パラメータ ID の安定性、preset 読込、描画時間、決定論）を追記。
- 制約: GUI を開かない。preset はファイル、値は ID で。乱数を持つプラグインは決定論性を必ず記録。
- 完了条件: `python -m music_agent render songs/track_001 --overlay songs/track_001/overlays/lead_surge.yaml` が成功し、
  2 回のレンダで WAV がビット一致する（しない場合は差分の大きさと原因を記録）。
- テスト方法: `pytest -q`（既存）+ 上記 2 回レンダの `numpy.array_equal`。
- 状態: open

## T-011 Windows smoke test + install notes
- 目的: 本番環境（Windows ノート）でパイプラインが動くことの確認。
- 出力: README.md の Windows 手順の検証結果、問題があれば修正 PR。`reports/windows_smoke.md`（Python/ffmpeg 版、所要時間）。
- 完了条件: `pip install -e .[dev]`、`pytest -q` 全通過、`render songs/track_001` の WAV がクラウド版と同一 LUFS（±0.05）。
  ビット一致しない場合は最大サンプル差を記録（BLAS/numba 差の許容範囲を決めるため）。
- 状態: open

## T-012 Synthesis performance
- 目的: 候補探索（128 候補）を現実的な時間にする。現状 track_001 フル 1 本 ~30 秒。
- 背景: `synthesis/subtractive.py` はノートごとに unison ボイス数だけ PolyBLEP 配列を生成し（numpy の一時配列が多い）、
  L/R で SVF を 1 回ずつ通す。プロファイルを取ってから手を付けること（sys 時間が大きい = 確保/解放コストの疑い）。
- 出力: プロファイル結果（`reports/perf_T012.md`）、オシレータ生成の numba 化または一時配列削減、トラック単位の並列化（joblib, seed 不変）。
- 制約: 出力のビット一致は不要だが、差の最大値 < −90 dBFS、LUFS 差 < 0.01。
- 完了条件: track_001 レンダ時間が 50% 以下、全テスト通過。
- 状態: open

## T-013 Per-note synth parameter automation
- 目的: 「ビルドで lead の音色自体が開く」（トラック LPF ではなくシンセのフィルタ env 量・detune・unison 幅）を表現。
- 出力: automation target `<track>.synth.<param-path>`（例 `lead.synth.filter.cutoff`）。ノート開始時刻の値をパッチへ適用。
- 完了条件: YAML から指定でき、レンダ結果で該当区間の centroid が単調変化（テスト）。
- 状態: open

## T-014 Staged search 128 → 32 → 8 → 3
- 目的: システム安定後の大規模探索（PROJECT_SPEC §16）。
- 出力: `candidates` に `--stages 128,32,8,3`。Stage1 記号のみ（Layer 1 足切り + 旋律診断の多様性確保）、
  Stage2 drop のみ低コストレンダ + Layer 2、Stage3 Critic（別エージェント）用の比較資料、Stage4 人間 A/B シート。
- 制約: 単一重み付きスコアで選抜しない。各段は「足切り + 多様性（特徴空間で距離の離れたものを残す）」。
- 状態: open（Phase 8。人間の A/B データが溜まってから）

## T-015 Shared / bass-anchored chord voicing across tracks
- 目的: 同じ和声を担う複数トラック（pad, chords）が別々に探索され、同時に短 2 度を鳴らす問題（critique v003-C5）を構造的に防ぐ。
- 背景: `theory.voice_chord` はトラック単位。track_001 では range 下限の調整で回避したが恒久策ではない。
- 出力: chords content に `voicing_group: <name>`（同名トラックは同一ボイシングを共有、または上下に分担）と
  `root_in_bass: true`（最低音をコードの bass に固定）。`evaluation/rules.py` にトラック間の短 2 度検出（warn）。
- 完了条件: track_001 の range を [C#3, A4] に戻しても drop 頭の短 2 度が 0。
- テスト方法: 2 トラックが同じ voicing_group を持つ spec で、同時発音の短 2 度 = 0、最低音 pc = コードの bass。
- 状態: open

## T-016 kick/bass overlap diagnostics per section
- 目的: `low_overlap_ratio` が曲全体で 1 値のため、どの区間・どのノートが衝突しているか分からない（EXP-006）。
- 出力: analysis の stems.kick_bass にセクション別・小節別の overlap と上位 5 衝突箇所（beat）。report.md に表示。
- 完了条件: track_001 v005 で区間別の値が出て、最大区間が特定できる。
- 状態: open
