# 試聴ページ: ダウンロードせずに聴いて、その場で評価する

## 目的
チャットに WAV を送って番号で評価を返す運用をやめ、ブラウザ上で「聴く・★をつける・時刻つきメモを書く」を
1 画面で完結させる。評価は Claude が読み取れる場所に保存し、評価 → 取り込み → 次世代 → 再公開を短くする。

## 設計
- `lab page`: 全世代のクリップを 1 枚の HTML（`src/lab/page/template.html` にデータを埋め込み）と MP3（ffmpeg, 128kbps）に書き出す。
  クリップごとに 160 区間の音量エンベロープと v2 のエネルギー曲線の点を埋め込む。台帳の評価も初期値として埋め込む。
- 公開は claude.ai Artifact（capabilities: `db`）。評価は `ratings/<clipId>` = `{score|null, note, updatedAt}`。
  ページは db の内容で台帳の初期値を上書き表示する。★は押すと即保存、メモは入力停止 1.2 秒後か離脱時に保存。
- UI: 世代切り替え、カードごとに再生ボタン・波形+曲線（クリックでシーク）・★5 段（「聴きたくない」〜「続きが気になる」）・
  メモ欄・「⏱ 現在時刻をメモに入れる」。連続再生、キーボード（Space / 1–5 / J K / T）。ライト/ダーク両対応、スマホ幅対応。
- `lab import <file.json>`: db から書き出した評価を、score か note が変わったものだけ `ratings.jsonl` に追記（冪等）。
  score が空の行（メモだけの下書き）は取り込まない。未知の ID・範囲外の score はエラー。

## 検証コマンド
```
npm test
npm run test:tools
node bin/lab.mjs page --format wav --dir "$TMPDIR/labcheck2"
```
