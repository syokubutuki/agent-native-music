# agent-native-music

## Codex 委譲環境

Claude Code が設計・レビューし、実装を Codex App Server に委譲する構成。運用ルールは `CLAUDE.md` を参照。

前提: Node 18+、`npm i -g @openai/codex`（0.159.2 で検証）、`codex login` 済み。

```
node tools/codex-worker.mjs models                       # 疎通確認
node tools/codex-worker.mjs run --task-file specs/x.md   # 実装を委譲
node tools/codex-worker.mjs continue --task "修正指示"     # 同じスレッドに追加指示
```
