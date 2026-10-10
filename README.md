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

## sound-lab: 生成 → 視聴 → 評価 → 変異

奇妙な電子音のクリップを大量に作り、耳で選んで育てる進化的ループ。依存ゼロ（Node 18+ のみ）で、
ゲノム（JSON）から 1 サンプルずつ DSP を計算して WAV を直接書き出す。設計は `specs/sound-lab-mvp.md`。

```
npm run lab -- new --count 8                 # ランダムな第 1 世代（lab/gen-0001/*.wav）
npm run lab -- rate g0001-03 5 金属っぽい揺れが良い   # 聴いて ★1〜5 とメモ
npm run lab -- evolve --top 3                # 評価上位を親に次の世代（交叉 + 変異）
npm run lab -- evolve --parents g0002-04,g0002-07 --strength 0.15   # 親を指名・小さく変異
npm run lab -- list --rated                  # 評価済み一覧（系譜つき）
npm run lab -- render g0003-02 --duration 180  # 気に入ったものを長尺で書き出し（lab/renders/）
```

- 同じゲノムからは常にビット同一の音が出る（`--seed` で世代全体も再現可能）。
- `--strength` は 0〜1。小さいほど親に近い。迷ったら 0.3、詰めるときは 0.1〜0.15。
- 評価ログ `lab/ratings.jsonl` とゲノム JSON は小さいのでコミット推奨（好みの記録になる）。WAV は git 管理外。
- 音色は fm / feedback（歪んだ弦ループ）/ bytebeat / noise の 4 種、調律は N 平均律か倍音列、
  リズムは声部ごとに周期の違うユークリッドリズム、途中で 1 回だけ規則が破れる（freeze / reverse / double / solo）。
- **v2（`specs/sound-lab-form.md`）**: ゲノムにエネルギー曲線 `form` が付き、時間とともに密度・旋律の開閉・明るさ・
  テンポ・音量・声部の出入りが変わる（`list` の ▁▃█▅ がその曲線）。明るさの天井 `ceilingHz` で痛い高域を抑える。
  v1 ゲノムはそのまま同じ音で鳴り、`evolve` に通すと v2 に昇格する。`evolve --duration 40` で子の長さを変えられる。
