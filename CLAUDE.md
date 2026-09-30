# CLAUDE.md

## 役割分担: Claude = 設計・レビュー、Codex = 実装

このリポジトリでは実装作業を Codex (codex app-server) に委譲する。Claude Code は
要件分析・コードベース調査・設計・タスク分解・仕様作成・レビュー・最終判断を担う。

### 委譲する / しない
- **委譲する**: 複数ファイルの実装、リファクタリング、テスト作成、build/lint/typecheck を回しながらの修正、バグ修正。
- **Claude が直接やる**: 数行で済む修正、設定値の変更、ドキュメントのみの変更、Codex の結果の微修正（往復コストの方が高い）。

### 手順
1. 要件を理解し、コードベースを調査して設計を決める。
2. 作業ツリーをクリーンにする（未コミット変更があればユーザーに確認のうえ commit、またはそのまま状態を記録）。
3. `specs/_TEMPLATE.md` に沿って `specs/<task>.md` に実装仕様を書く。検証コマンドを必ず含める。
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
7. 合格したら最終判断・コミットは Claude が行う。

詳細なログが必要なときだけ `node tools/codex-worker.mjs log` のパスの JSONL を読む（大きいので grep で絞る）。

### エフォート選択（モデル: `.codex-worker/config.local.json` の `model`、未指定ならアカウント既定 / effort 既定: medium）
| effort | 使う場面 |
|---|---|
| `low` | 機械的な変更（リネーム、定型コード、既存パターンの横展開、軽微なレビュー指摘の修正） |
| `medium` | **既定**。通常の機能追加・1〜数ファイルの実装・テスト追加 |
| `high` | 多ファイルにまたがる変更、非自明なロジック、原因調査が必要なバグ |
| `xhigh` | 大規模リファクタ、並行性・状態管理など難所、`high` で一度失敗したタスク |
| `max` / `ultra` | 原則使わない。`xhigh` でも解けない難問のみ（ユーザーに一言断ってから） |

量が多いタスクは effort を上げるより、仕様を分割して複数回 `run` する方が安く確実。

### コマンド一覧
- `run --task-file <md> | --task <text>` 新規スレッドで実装
- `continue [--thread <id>] --task ...` 直前（または指定）スレッドに追加指示
- `status` 最近のスレッド・ターン一覧 / `log` 最新ログのパス / `models` 利用可能モデルとエフォート
- 共通: `--effort` `--model` `--timeout <秒>`（既定 1800）`--quiet`
- 設定: `tools/codex-worker.config.json`（共有）、`.codex-worker/config.local.json`（個人上書き、git 管理外。使えるモデルはアカウントごとに異なるので `model` はここで指定）
- 指定モデル/エフォートがアカウントで使えない場合、turn 開始前に使用可能な一覧付きでエラー終了する
- 終了コード: 0 完了 / 1 失敗・エラー / 2 タイムアウト（turn は interrupt 済み）

Codex は `danger-full-access` + `approvalPolicy: never` で動き、来た承認要求はすべて自動承認する。
ツールのテスト: `npm run test:tools`
