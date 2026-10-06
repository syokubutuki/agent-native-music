# sound-lab MVP: ゲノム → WAV → 評価 → 変異 の最小ループ

## 目的
奇妙な電子音のクリップを大量に生成し、人間の耳で評価し、評価の高いものを親に次の世代を作る
進化的ループを、依存ゼロの Node.js だけで回せるようにする。

## 背景・設計判断
- **良さの判定役は人間の耳**。機械は「速く大量に作る・正確に再現する・変異させる」に徹する。
- **外部シンセ（SuperCollider / Csound）は使わない**。Node で 1 サンプルずつ DSP を計算し WAV を直接書く。
  導入不要・Windows/クラウド共通・JIT でサンプル単位ループが速い・フィードバック/bytebeat のような
  「部品の枠外」の音が書きやすい・波形をユニットテストできる、が理由。後で外部バックエンドを足せるよう
  「ゲノム(JSON) → render() → Float32 ステレオ → WAV」と層を分ける。
- **完全決定的**: 同じゲノム（+ 同じ duration / sampleRate）からは常にビット同一の WAV が出る。
  乱数は genome.seed から作るシード付き PRNG のみ（`Math.random` 禁止）。`meta` は音に影響しない。
- **パラメータ範囲は 1 か所の表（params.mjs）に集約**し、ランダム生成・変異・検証が同じ表を使う。
- 音楽的な骨格（前回の議論より）: 強い内部ルール（ユークリッドリズム × 声部ごとに違う周期によるポリメーター、
  degrees をストライドで巡る音高規則、非平均律）、反復、そして 1 回の「規則の破れ」(break)。
- 不採用: 12 平均律 / 4/4 グリッド / MIDI 出力 / サンプル音源（ありふれた音に寄るため）。

## ゲノム（version 1）
```jsonc
{
  "version": 1,
  "seed": 123456789,            // uint32。ノイズ等の乱数源
  "durationSec": 20,
  "sampleRate": 44100,
  "tuning": { "type": "edo", "divisions": 13, "baseHz": 55 },   // type: edo | harmonic
  "voices": [ /* 1〜6 個 */ ],
  "break": { "at": 0.6, "length": 0.15, "kind": "reverse", "voice": 1 },
  "master": { "delayMs": 375, "delayFeedback": 0.5, "delayMix": 0.3, "drive": 2 },
  "meta": { "id": "g0001-01", "generation": 1, "parents": [], "strength": 0 }   // 音に無関係
}
```
声部共通: `type`(fm|feedback|bytebeat|noise), `gain`, `pan`, `stepMs`, `steps`, `pulses`(≤steps), `rotate`(<steps),
`degrees`(int 配列), `stride`, `octave`, `attackMs`, `decayMs`。
型固有: fm=`ratio,index,indexDecay,modFeedback` / feedback=`loopGain,damp,drive,exciteMs` /
bytebeat=`formula(0..5),a,b,c,rate` / noise=`filter(lp|bp|hp),cutoffMul,q`。
正確な範囲は `src/lab/params.mjs` の表を正とする。

break.kind: `freeze`（音高が止まり全ステップ発音）/ `reverse`（ステップ順逆行）/ `double`（ステップ長半分）/
`solo`（対象声部以外をミュート、10ms フェード）。対象は `voice % voices.length`。

## 変更対象
- `src/lab/rng.mjs` : シード付き PRNG（mulberry32）、uniform / int / pick / gaussian / chance / fork
- `src/lab/params.mjs` : パラメータ表と randomize / mutate / validate の汎用処理
- `src/lab/genome.mjs` : randomGenome / mutateGenome / crossover / validateGenome / normalize
- `src/lab/dsp.mjs` : SVF フィルタ、DC ブロック、ソフトクリップ等の部品
- `src/lab/render.mjs` : ゲノム → `{ left, right, sampleRate }`（スケジューリング・各声部・ミックス・マスター）
- `src/lab/wav.mjs` : 16bit PCM ステレオ WAV エンコード
- `src/lab/store.mjs` : lab ディレクトリ（世代フォルダ・ratings.jsonl）の読み書き
- `bin/lab.mjs` : CLI
- `test/lab/*.test.mjs` : テスト
- `package.json` : `lab`, `test` スクリプト / `.gitignore` : WAV と renders を除外 / `README.md` : 使い方

## CLI
```
node bin/lab.mjs new     [--count 8] [--duration 20] [--seed N]          ランダムな新世代
node bin/lab.mjs evolve  [--count 8] [--top 3 | --parents id,id] [--strength 0.3] [--seed N]
node bin/lab.mjs rate    <id> <1-5> [メモ...]                            ratings.jsonl に追記（最新が有効）
node bin/lab.mjs list    [--gen N] [--rated] [--top N]
node bin/lab.mjs render  <id | genome.json> [--duration s] [--out path]  長尺化・再書き出し
共通: --dir <labDir>（既定 ./lab、環境変数 LAB_DIR）
```
- 世代フォルダ `lab/gen-0001/`、クリップ ID `g0001-01`、`<id>.json` と `<id>.wav` を並べて置く。
- evolve: 子ごとに親を 1 体または 2 体（交叉）選び、変異。`meta.parents` に系譜を残す。評価が 1 件もなければエラー。
- 各コマンドは書いたファイルのパスを表示する。

## 制約
- 依存パッケージを追加しない（Node 18+ 標準のみ）。`tools/` は変更しない。
- 出力はクリップしない（ピーク -1 dBFS 以下、かつ RMS -16 dBFS 以下にそろえる。音量差で評価が偏らないため）、NaN を出さない、両端に短いフェード。
- 20 秒・6 声部のクリップが普通の PC で数秒以内に書き出せること。

## 受け入れ条件
- [ ] 同一ゲノムの 2 回の render が完全一致し、WAV のバイト列も一致する
- [ ] randomGenome / mutateGenome / crossover の出力が常に validateGenome を通る（多数シードで検査）
- [ ] 出力に NaN がなく、ピーク ≤ 1、無音でない
- [ ] WAV ヘッダ（RIFF / fmt / data サイズ、ch=2、16bit）が正しい
- [ ] CLI スモーク: new → rate → evolve → list → render が一時ディレクトリで通る

## 検証コマンド（すべて成功させること）
```
npm test
npm run test:tools
node bin/lab.mjs new --count 2 --duration 3 --dir "$TMPDIR/labcheck"
```
