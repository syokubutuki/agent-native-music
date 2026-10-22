# DECISIONS — 技術選定と失敗の記録

形式: Attempt / Result / Decision / Reason。黙って方式を切り替えない。

---

## D-001 中核合成: 自作 numpy/numba 減算シンセ（VST ではなく）

- 必要: CLI から完全制御でき、決定論的で、Windows/Linux 同一出力の音源。
- 代替: FluidSynth + SF2（GM 音色は最終品質に不適、表現力が低い）、Csound / SuperCollider（強力だが別言語ランタイム・
  Windows 導入手順が増え、LLM が編集するパラメータ面が大きい）、VST3（最高音質の可能性、ただし GUI 前提のものが多く、
  このコンテナでは入手不可 → D-004）。
- 自動操作性: すべて YAML パラメータ。ライセンス: 自作（依存は BSD/MIT/GPLv3(Pedalboard)）。
- Windows: numpy/scipy/numba/pedalboard/soundfile すべて公式 wheel あり。CPU: 42 秒曲で ~20 秒。
- 再現性: seed 付き乱数のみ → ビット一致（テスト済）。
- Decision: 初期は内蔵シンセで完成させ、音質ボトルネックが特定できたらトラック単位で VST に差し替える。

## D-002 エフェクト: Pedalboard 内蔵 + 自作 reverb/delay

- Attempt: Pedalboard の `Reverb`（Freeverb）を検討。
- Result: 未採用（Freeverb は金属的で、decay の周波数依存を制御できない。テンポ同期もない）。
- Decision: EQ/Compressor/Chorus/Phaser は Pedalboard（JUCE 実装・決定論・Windows wheel）。
  Reverb は seed 付き合成 IR（帯域別 decay + early reflections）を FFT 畳み込み、Delay はテンポ同期 ping-pong を自作。
- Reason: 音質と、テンポ同期・決定論・パラメータの意味の明快さ。

## D-003 サイドチェイン: 検出器型コンプではなくテンポ同期 volume shaper

- Reason: kick のノート onset（Score）から直接エンベロープを作るため、決定論・位相ずれなし・パラメータ（depth, release[拍], shape）が
  音楽的単位で書ける。EDM の実務でも shaper 系が主流。

## D-004 VST3 ホスト: Pedalboard `load_plugin`（実装済・未実機検証）

- Attempt: Surge XT（GPLv3、全パラメータ公開、Linux/Windows VST3）を GitHub Releases から取得して検証。
- Result: クラウドコンテナのプロキシが github.com releases を 403 で拒否。apt にも無し。**実機検証できず。**
- Decision: バックエンド（preset / raw_state / parameter ID / MIDI 入力）を実装し、モックでテスト。
  Windows 環境で T-010 として Codex が Surge XT で実機検証する。
- 評価予定項目: パラメータ ID の安定性、preset 読込、オフライン描画の決定論（同一入力でビット一致か）、描画速度。
- 候補順位: Surge XT（無料・OSS・自動化に最適）→ Vital（無料版、プリセットは JSON で編集可能だが Pedalboard での
  パラメータ公開状況を要確認）→ 有料（ボトルネック特定後に人間へ提案）。

## D-005 解析: librosa 非依存（numpy/scipy/pyloudnorm）

- Reason: 依存を減らし（librosa は numba/sklearn 等が重い）、特徴量定義を自前で明示。LUFS は ITU-R BS.1770 準拠の pyloudnorm。
- librosa は optional extra として残す（将来の beat/onset 高度化用）。

## D-006 楽曲フォーマット: YAML + コンパクト記法

- 代替: MIDI を正本にする（LLM が安全に差分編集できない）、JSON（コメント不可）、music21 / ABC（抽象度が合わず op が書けない）。
- Decision: YAML。旋律は度数トークン（`7:3 5:3 3:4`）と motif ops、リズムは 1 小節 1 文字列パターン。
- Reason: LLM の編集単位（1 行 = 1 フレーズ）と音楽の意味単位を一致させる。移調・再和声化が度数で自然に書ける。

## D-007 Codex 不在（このクラウドセッション）

- Attempt: `codex` CLI の確認。
- Result: 未インストール、OpenAI 認証情報なし。
- Decision: 委譲すべきタスクは `tasks/codex/` に 7 項目仕様で記述し、Claude が "executed by: claude" として実装。
  レビュー観点（再現性・テスト・YAML 分離）は同じ基準を適用。Windows 環境では未着手タスクを Codex が実行する。

## D-008 解析バグ: 調推定がキックに汚染（修正済）

- Attempt: ミックス全体のパワースペクトルからクロマ → Krumhansl プロファイル相関。
- Result: track_001 v001 で宣言キー F# minor が 13 位（推定 D minor）。原因: キック（49 Hz ≈ G1 へのピッチスイープ）と
  サブベースがパワーを支配。
- Decision: クロマは **ピッチ楽器ステムの和** から、80 Hz–5 kHz の **振幅** スペクトルで計算。修正後 F# minor は 3 位
  （1 位 C# minor）— これは楽曲側の特徴（トニック到達が 21 小節中 3 小節）として Critic に回す。
- 副次: キックの基音が曲のキーに合っていない（49 Hz ≈ G）→ 音色側の課題として記録。

## D-009 ffmpeg

- apt で導入（6.1.1）。用途は mp3 プレビューのみ（任意）。無い環境では WAV だけ出る。

## D-010 Codex App Server ワーカーの導入とクラウドでの制約

- 人間が main に `tools/codex-worker.mjs`（codex app-server を JSON-RPC で駆動）と `specs/` テンプレートを追加（PR #1）。
  作業ブランチへマージし、CLAUDE.md の委譲手順・AGENTS.md の受け取り形式を `specs/` + ワーカーに統一。`tasks/codex/` はバックログ扱い。
- Attempt: クラウドコンテナで `npm i -g @openai/codex@0.159.2` → `node tools/codex-worker.mjs run --task "Reply OK" --model gpt-5.5`。
- Result: CLI 導入・app-server 起動・モデル一覧は成功。turn は **`api.openai.com` への CONNECT がネットワークポリシーで 403**、
  再接続を繰り返し 90 秒でタイムアウト。加えて `codex login status` = Not logged in。
- Decision: このクラウドセッションでは実装を Claude が代行し、仕様は `specs/` に書いて `executed by: claude` を記録する。
  人間の Windows 環境、または (a) 環境のネットワーク許可に `api.openai.com` を追加し (b) 認証情報を環境変数で渡したクラウド環境で Codex に委譲する。
- Reason: 委譲の仕組みは整ったが、このコンテナの外向き通信と認証の 2 点が不足。

## D-011 参照曲の嗜好分析（research/）と解析ツールの置き場

- 目的: ユーザーが挙げた参照作品 16 件から「何に反応しているか」を抽出し、`research/preference_principles_v1.md` に設計原則（P-01〜P-12）として固定。
- Attempt: yt-dlp で音源取得 → librosa ベースの計測（`tools/ref_analysis/`）→ 図と JSON を `research/reference_analysis/` に保存。
- Result: niconico 7/8 本は取得可（1 本は非公開）。**YouTube はこのクラウド環境からは bot 判定で取得不可**（cookie が要る）。
  → gloomy / 花火 / Snowing / ルカ 3 曲 / シュガーバインは記述と知識ベースの仮説のみ（要 Windows 側での取得・再計測）。
- Decision:
  - 参照曲の音源はリポジトリに入れない（著作物・サイズ）。解析結果（縮小 PNG と要約 JSON、合計 ≈ 4 MB）のみ保存。
  - 計測ツールは本体パッケージに入れず `tools/ref_analysis/` に置く。本体の解析（`analysis/features.py`）は D-005 どおり librosa 非依存を維持。
    統合は `python -m music_agent reference` として Codex 委譲候補（T-017）。
  - 嗜好原則は既存 `MUSIC_SPEC.md` の P1–P13（メロディック EDM の原理）と **別系統** として管理する。両者はジャンル的にかなり異なるため、
    track_001 路線の継続か新曲開始かは人間の判断待ち（preference_principles_v1.md §4）。
- Reason: 作曲判断の根拠を再現可能な計測に紐づける。聴けない Claude の推定であることを全箇所に明記し、人間の時刻指定で検証する前提。
