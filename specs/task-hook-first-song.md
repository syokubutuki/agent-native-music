# 次のタスク: フック先行で新曲をつくる（別セッション用）

このファイルを新しいセッションにそのまま渡す。

## 準備
- ブランチ `claude/nice-gauss-7h9iph` で作業する（PR はユーザーに頼まれるまで作らない）。
- まず `.claude/skills/talk-duet-song/SKILL.md` を読む。好み・没案・測定済みの声域・無声化の罠・覚えやすさの方法・試聴ページのマージ手順が書いてある。
- VOICEVOX: `scripts/voicevox-install.sh`（初回）→ `scripts/voicevox-up.sh`（毎回のレンダー前）。
- `src/song/presets.mjs` の `yuruDuetMeta` / `DUET_SINGERS` / `DUET_SECTION` / `floatingMix` を使う。見本は `songs/ame-ame-ame/score.mjs`。

## 1. フック候補
- 「あめ あめ あめ。」型（畳語×3 +「。」）の 2 小節フックを 6〜8 個。やわらかく、かわいく、明るい調。速い詰め込みはしない。
- 声域: ずんだもん talk A4–D#5、つむぎ talk C#4–A4。
- 避ける: ぽとり、ふわり、ちょうだい、句頭の む/う/ひ/つ/は。「ふわ ふわ ふわ。」は別セッションで作成済みなので使わない。
- 各候補を 8 小節程度のループ（フック＋掛け合いの返し）にして `--mode talk --heta none` ＋ floating mix で書き出す。talk QA のフォールバックは 0 にする。
- 試聴ページ https://claude.ai/artifact/91zKwk9wYWHvS5j6xYTkGj に新しいグループとして載せる。最新版を read してから `scripts/merge-page.py` でマージし、他セッションのクリップは上書きしない。
- ユーザーに「一度聴いて、翌日まだ覚えているフックを書く」翌日テストを頼み、選ばれるのを待つ。

## 2. 選ばれたフックで曲を組む
- サビのフックは崩さない。Aメロ・ブリッジは旋律をアクセントに沿わせる。`node bin/song.mjs analyze songs/<dir> --hook <かな>` で確認し、Aメロの一致率 75% 以上を目安にする。
- サビの各行のあとにオルゴールのこだまを入れる（あめの `CHORUS_ECHO` と同じ）。アウトロはイントロに戻って繰り返せる形にする。
- v5 の要素を守る: 掛け合い、talk の音痴感（heta none）、ふわっとした残響とトレモロ。台詞や演出の場面は入れない。
- `node bin/song.mjs produce songs/<dir> --mode talk --heta none` で書き出し、`npm test` を通し、マージ手順で試聴ページに載せる。
- `specs/song-<name>.md` に仕様と analyze の結果を書き、新しくわかったことはスキルに足して、commit / push する。

## 完了の条件
フックが選ばれ、約 3 分の曲が試聴ページで「あめ あめ あめ。」の隣に並び、テストが通って push されていること。
