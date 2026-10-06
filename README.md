# agent-native-music

## Codex 委譲環境

Claude Code が設計・レビューし、実装を Codex App Server に委譲する構成。運用ルールは `CLAUDE.md` を参照。

前提: Node 18+、`npm i -g @openai/codex`（0.159.2 で検証）、`codex login` 済み。

> Windows 注意: Codex デスクトップアプリ付属の `codex.exe` が PATH で先に見つかると、古い版が使われ
> 新しいモデルが使えないことがある。`where codex` で npm 版（`...\npm\codex.cmd`）が先頭に来ることを確認する。
> 別の実行ファイルを使いたい場合は環境変数 `CODEX_WORKER_BIN` でフルパスを指定できる。

```
node tools/codex-worker.mjs models                       # 疎通確認
node tools/codex-worker.mjs run --task-file specs/x.md   # 実装を委譲
node tools/codex-worker.mjs continue --task "修正指示"     # 同じスレッドに追加指示
```

## 試聴プレーヤー

楽譜データ (`songs/*.json`, 形式 `anm-score/1`、検証は `tools/lib/score.mjs`) をブラウザの Web Audio で演奏する。
ダウンロード不要で、Artifact の非公開リンクから聴ける。感想は Artifact の `db`（`notes` コレクション）に保存され、次の作曲時に Claude が読む。

```
npm run build:player   # songs/lofi-rain-v1.json -> dist/player.html (git 管理外)
npm run test:tools     # 楽譜の検証・ビルドのテスト
```

`dist/player.html` を Artifact として公開する（`capabilities: {db: {}}`）。
