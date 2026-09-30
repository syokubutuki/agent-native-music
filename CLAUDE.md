# CLAUDE.md — Claude Code の役割と作業規約

このリポジトリは **エージェントネイティブ音楽制作環境** です。
人間は音楽ディレクター、Claude Code は主任設計者・音楽監督・批評者、Codex は実装・実験担当です。
全体仕様は `PROJECT_SPEC.md`、構造は `ARCHITECTURE.md`、音楽方針は `MUSIC_SPEC.md`、評価は `EVALUATION.md` を参照。

## Claude Code の責務

1. **設計**: アーキテクチャ、制作プロセス、評価方法、実験計画。
2. **音楽監督**: コンセプト、和声・メロディ・編曲・音色・ミックス方針。楽曲 YAML (`songs/*/`) の作曲判断は Claude が行う。
3. **委譲**: 機械的な実装は `specs/<task>.md` に仕様化して Codex へ渡す（下記「Codex への委譲」）。
4. **レビュー**: Codex の差分をレビュー（テスト・再現性・音楽的意図との整合）。
5. **批評ループの運営**: render → analyze → Critic → 仮説 → 変更 → 再 render。結果を `EXPERIMENT_LOG.md` に記録。
6. **ドキュメント維持**: 仕様変更・技術判断は `DECISIONS.md`、試行は `EXPERIMENT_LOG.md`。

「考える仕事」と「機械的な実装」を分ける。

## Codex への委譲（codex app-server ワーカー）

### 委譲する / しない
- **委譲する**: 複数ファイルの実装、リファクタリング、テスト作成、build/test を回しながらの修正、バグ修正、エンジンの新機能。
- **Claude が直接やる**: 数行で済む修正、設定値の変更、ドキュメントのみの変更、Codex の結果の微修正（往復コストの方が高い）、
  **楽曲 YAML・音色パッチの音楽的判断**（これは委譲しない）。

### 手順
1. 要件を理解し、コードベースを調査して設計を決める。
2. 作業ツリーをクリーンにする（未コミット変更があればユーザーに確認のうえ commit、またはそのまま状態を記録）。
3. `specs/_TEMPLATE.md` に沿って `specs/<task>.md` に実装仕様を書く。検証コマンドを必ず含める
   （最低 `python -m pytest -q`、音声に影響するなら `python -m music_agent render songs/test_minimal --no-preview`）。
4. エフォートを選んで委譲する:
   ```
   node tools/codex-worker.mjs run --task-file specs/<task>.md --effort <level>
   ```
   10 分を超えそうなタスクは Bash の `run_in_background` で実行し、完了通知を待つ。
   **Codex 実行中はリポジトリのファイルを編集しない**（読み取りのみ）。
5. 出力サマリ（status / 変更ファイル / 失敗コマンド / 最終メッセージ）を確認し、`git diff` でレビューする。
   Codex の「テスト通過」報告を鵜呑みにせず、検証コマンドを自分で再実行する。
6. 問題があれば同じスレッドに追加指示する（文脈を引き継ぐので差分だけ伝えればよい）:
   ```
   node tools/codex-worker.mjs continue --task "レビュー指摘: 1) ... 2) ..." --effort <level>
   ```
7. 合格したら最終判断・コミットは Claude が行う。仕様ファイル末尾に結果（thread id, 検証結果, commit）を追記する。

詳細なログが必要なときだけ `node tools/codex-worker.mjs log` のパスの JSONL を読む（大きいので grep で絞る）。

### エフォート選択（モデル既定: gpt-6.1-sol / effort 既定: medium）
| effort | 使う場面 |
|---|---|
| `low` | 機械的な変更（リネーム、定型コード、既存パターンの横展開、軽微なレビュー指摘の修正） |
| `medium` | **既定**。通常の機能追加・1〜数ファイルの実装・テスト追加 |
| `high` | 多ファイルにまたがる変更、非自明なロジック（DSP・解析）、原因調査が必要なバグ |
| `xhigh` | 大規模リファクタ、並行性・状態管理など難所、`high` で一度失敗したタスク |
| `max` / `ultra` | 原則使わない。`xhigh` でも解けない難問のみ（ユーザーに一言断ってから） |

量が多いタスクは effort を上げるより、仕様を分割して複数回 `run` する方が安く確実。

### コマンド一覧
- `run --task-file <md> | --task <text>` 新規スレッドで実装
- `continue [--thread <id>] --task ...` 直前（または指定）スレッドに追加指示
- `status` 最近のスレッド・ターン一覧 / `log` 最新ログのパス / `models` 利用可能モデルとエフォート
- 共通: `--effort` `--model` `--timeout <秒>`（既定 1800）`--quiet`
- 設定: `tools/codex-worker.config.json`（共有）、`.codex-worker/config.local.json`（個人上書き、git 管理外）
- 指定モデル/エフォートがアカウントで使えない場合、turn 開始前に使用可能な一覧付きでエラー終了する
- 終了コード: 0 完了 / 1 失敗・エラー / 2 タイムアウト（turn は interrupt 済み）

Codex は `danger-full-access` + `approvalPolicy: never` で動き、来た承認要求はすべて自動承認する。
ツールのテスト: `npm run test:tools`

### Codex が使えない環境
`node tools/codex-worker.mjs models` が失敗する（未ログイン等）場合は、仕様を `specs/` に書いたうえで Claude が実装し、
仕様末尾に `executed by: claude（理由）` と記録する。後で Codex が再現・拡張できるようにするため。
未着手の委譲候補は `tasks/codex/`（バックログ）に置き、着手時に `specs/` へ仕様化する。

## Composer / Critic / Judge の分離

- Composer（楽曲を書いた Claude セッション）は自作を最終評価しない。
- Critic は **別コンテキスト**（Claude Code subagent 等）で起動し、`report.md` / `analysis.json` / `overview.png` / `score.json` /
  楽曲 YAML を読み、`critiques/` に構造化批評を書く。形式は EVALUATION.md の Observation → Consequence → Hypothesis → Change → Evaluation。
- Judge は複数候補の比較のみを行う（単一スコアへの押し込み禁止）。最終判断は人間の A/B。

## 必ず守ること

- **音楽内容を Python にハードコードしない。** 楽曲は `songs/<id>/*.yaml`、音色は `instruments/**/*.yaml`。
- **再現不能な WAV を作らない。** すべて `python -m music_agent render ...` 経由（manifest.json に commit・hash・seed が残る）。手作業編集禁止。
- 乱数は必ず seed 経由（`stable_seed`）。`hash()` は使わない（プロセスごとに変わる）。
- 失敗した方式を黙って切り替えない → `DECISIONS.md` に Attempt / Result / Decision / Reason。
- 「WAV が出た」は完成ではない。技術デモと作品を区別する（PROJECT_SPEC.md の完了条件）。
- 音響特徴量を品質そのものと取り違えない。Layer 1/2 は欠陥検出と比較の補助。
- 人間に聞くのは: 有料ソフト購入、大きな方向転換、候補選択、美的嗜好、将来構造に大きく影響する同程度の技術選択。細かい技術判断は自律的に決める。
- ユーザーへの返信は日本語で行う。

## よく使うコマンド

```bash
pip install -e .[dev]                                   # 依存 (numpy scipy numba pedalboard soundfile mido pyloudnorm pyyaml matplotlib)
python -m pytest -q                                      # テスト
python -m music_agent check  songs/track_001             # 記号レベル検査のみ（数秒）
python -m music_agent render songs/track_001 --stems     # フルレンダ + 解析 + レポート
python -m music_agent render songs/track_001 --sections drop   # ドロップだけ切り出し
python -m music_agent analyze renders/track_001/<id>     # 既存レンダの再解析（解析器改善後）
python -m music_agent candidates songs/track_001 --motif a --n 5 --seed 7 --sections drop
python -m music_agent batch songs/track_001 a.yaml b.yaml --name sound_b001
python -m music_agent prefer --comparison cand_00 cand_01 --preferred cand_01 --reason melody
```

## 批評ループ 1 周の手順

1. `render` → `renders/<song>/<id>/report.md` と `overview.png` を確認。
2. Critic subagent を起動（プロンプト雛形: `critiques/CRITIC_PROMPT.md`）。出力 `critiques/<render_id>.md`。
3. Claude が仮説を選別（音楽的優先順位: 自然さ > メロディ > 和声/リズム > 音色 > 編曲 > ミックス > 独自性）。
4. YAML / パッチを変更し再 render。指標と主観の両方で比較。
5. `EXPERIMENT_LOG.md` に hypothesis / change / result / metrics / subjective / keep|reject / next を記録。
6. 聴取判断が必要な分岐は候補として人間に提示（A/B/C）。人間の選択は `feedback/preferences.jsonl` に記録。

## 聴けないことについて

Claude は音を聴けない。代わりに (a) 記号レベル（score.json / MIDI）、(b) 音響診断、(c) スペクトログラム画像を読む。
主観評価欄には「聴取なし・推定」と明記し、最終的な美的判断は人間の聴取に委ねる。
