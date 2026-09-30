# EXPERIMENT_LOG

各エントリ: hypothesis / change / result / metrics / subjective / decision (keep|reject) / next action。
主観欄の「聴取なし・推定」は Claude/Critic が音を聴けないことを示す。人間の聴取結果は `feedback/preferences.jsonl` と本ログに追記する。

---

## EXP-000 パイプライン疎通（test_minimal）

- hypothesis: YAML spec → Score → MIDI → 内蔵シンセ → ミックス → WAV → 解析が CLI 一発で決定論的に動く。
- change: エンジン v0.1 実装（ARCHITECTURE.md）。
- result: `songs/test_minimal`（4 小節）で 3.6 秒。同一入力の再レンダでビット一致（`test_full_pipeline_render`）。
- metrics: −11.1 LUFS（目標 −11）、true peak −1.04 dBTP、clip 0。
- subjective: —（技術確認のみ）
- decision: keep
- next: track_001 を書く。

## EXP-001 track_001 v001 — 初稿（ベースライン）

- hypothesis: MUSIC_SPEC の原理（共通音アンカーの motif、A A' A'' B、偽終止で Drop 着地、音域上昇、gap、サイドチェイン）で
  30〜45 秒の Intro→Build→Drop→End が成立する。
- change: `songs/track_001/*` 初稿（commit b5d33a4）。
- result: 41.9 秒、16 トラック、702 ノート。レンダ 33 秒。
- metrics (render `track_001_v001`):
  - −9.17 LUFS / −1.04 dBTP / clip 0。**リミッタ最大 GR 7.4 dB**（潰しすぎ）。
  - セクション LUFS: intro −10.0 / build −9.0 / drop −8.5 / end −9.5 → **build→drop が +0.4 LU しかない**（Layer 1 warn）。
  - 小節ラウドネス: intro 後半（bar 4–7）で既に −8 LUFS ＝ drop と同じ。サブベースの全音符が支配。
  - 帯域比（drop）: sub 0.38 / low 0.49 / lowmid 0.12 / highmid 0.011 / high 0.002 → 極端に低域寄り。
  - kick/bass 重なり 0.25（OK）、lead 1–5 kHz 存在感 +1.2 dB（OK）、低域相関 1.0（OK）。
  - 調推定（修正後の解析器, D-008）: C# minor > A major > **F# minor（3 位）**。
- subjective: 聴取なし・推定。スペクトログラムでは drop の高域が build 末尾より暗い。
- decision: baseline として keep（比較の基準）。
- next: 独立 Critic によるレビュー → 改訂（EXP-002）。
