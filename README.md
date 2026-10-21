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

## 歌のパートを歌声ソフトに渡す

`vocal: true` の `lead` トラック(1音1モーラのひらがな、単旋律、小節をまたがない)を MusicXML に書き出す。NEUTRINO など MusicXML を読める歌声合成ソフトに渡すための形式。

```
node tools/export-musicxml.mjs songs/sketch-f-betsuni-v1.json   # -> exports/musicxml/*.musicxml
```

書き出したファイルは `exports/musicxml/` にコミットしてある。歌声にした WAV は試聴ページに取り込む予定(未実装)。

## 声を付ける(VOICEVOX / NEUTRINO)
- VOICEVOX: `tools/voicevox-sing.py` を自分のPCで実行する。手順は `docs/voicevox-howto.md`。
- NEUTRINO: 規約上クラウドでは動かさず、手元で使う。手順は `docs/neutrino-howto.md`。
