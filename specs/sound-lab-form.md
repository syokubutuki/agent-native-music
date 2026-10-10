# sound-lab v2: 展開（エネルギー曲線）と明るさの天井

## 目的
20 秒の静的なループではなく「圧縮 → 爆発 → 膨張 → 収束」のような**時間方向の展開**をゲノムに持たせ、
進化の対象にする。同時に、評価で一貫して嫌われた「高すぎる・明るすぎる音」が生まれにくくする。

## 背景（第 1・2 世代の評価から）
- 高評価のメモは「ここから何か始まりそう」「どんな広がりをするか気になる」「爆発して膨張して収束」
  「さっと音が引いてから、ふっと軽やかなメロディが始まりそう」と、**この先の展開への予感**に集中している。
  v1 は一定密度のループ + break 1 回で、展開を作る仕組みがない。
- ★1「音が高い」4 本はすべて同じ FM 声部（gain 0.6, index > 10, ratio 2.3〜3.2）を継いでいた。
  原因は基音ではなく **FM の側帯波・ハイパスノイズ・歪みによる倍音の明るさ**。
- 好まれたのは低〜中域の「カサカサ・シャカシャカ」（長い励振の feedback 声部、低い lp/bp ノイズ）。

## 設計
### 後方互換
- `version: 2` を導入。**v1 ゲノムは従来とビット同一に鳴る**（`form` がなければ v1 の処理経路）。
- v1 を `mutateGenome` / `crossover` に通すと v2 に昇格（ランダムな `form` と各声部の `entry` を付与）。
- `randomGenome` は v2 を出す。

### form（ゲノム直下）
```jsonc
"form": {
  "points": [ {"t":0,"e":0.1,"shape":"linear"}, {"t":0.55,"e":0.2,"shape":"exp"}, {"t":0.6,"e":1,"shape":"jump"}, {"t":1,"e":0.3,"shape":"linear"} ],
  "fill": 0.3,            // 0..0.6   高エネルギー時にパターン外のステップも鳴らす量
  "pitchCoupling": 0.7,   // -1..1    +: エネルギーが高いほど旋律が開く / -: 低いほど開く（音が引いた所で旋律）
  "brightCoupling": 0.6,  // 0..1     エネルギーが低いほど暗く（FM index・ノイズ cutoff・弦の歪み）
  "tempoBend": 0.3,       // -1..1    +: 高エネルギーで速く（×0.71〜×1.41）
  "dynamics": 0.6,        // 0..1     エネルギーが低いほど音量を下げる量
  "ceilingHz": 3000       // 1500..5000 (log) 明るさの天井
}
```
- `points`: 3〜7 点。`t[0]=0`, `t[last]=1`, 狭義単調増加（最小間隔 0.03）、`e ∈ [0,1]`。
  `shape` は「その点で終わる区間」の形: `linear` / `exp`（u³: ゆっくり溜めて一気に）/ `jump`（前の値を保持し区間末で跳ぶ）。
- 各声部に `entry ∈ [0, 0.9]`: エネルギーが entry を超えると入ってくる（±0.05 で滑らかに）。
  最小 entry の声部は 0 に正規化（常に何かが鳴る）。

### ステップごとの適用（x = t / duration, e = energy(x)）
- ステップ長 × `2^(−tempoBend·(e−0.5))`
- パターン上のステップは確率 `min(1, 0.2+e)` で鳴る（ただし各声部の最初の打点は必ず鳴る） / パターン外は `fill·max(0,(e−0.6)/0.4)` で鳴る
  （声部ごとの専用シード付き乱数。ノイズ用乱数とは別系統）
- 旋律: `open = pc≥0 ? lerp(1,e,pc) : lerp(1,1−e,−pc)`、使う degrees 数 `max(1, ceil(len·open))`
- 音量 × `(1 − 0.7·dynamics·(1−e)) · activity(entry)`（最も静かでも 30% は残す）、明るさ `b = 1 − brightCoupling·(1−e)`

### 明るさの天井（v2 のみ）
- 基音は `ceilingHz/3` を超えたらオクターブ下に折り返す
- FM: 実効 index = `min(index·b, ceilingHz/(f·ratio) − 1 − 1/ratio)`（Carson 則で側帯波を天井内に）、0 未満は 0
- noise: cutoff = `min(f·cutoffMul·(0.25+0.75b), ceilingHz)`
- feedback: drive = `1 + (drive−1)·b`
- マスター出力（歪みの後）に 4 次ローパス（SVF×2, Q 0.707）を `ceilingHz` で
- 正規化（v2 のみ）: RMS -16 dBFS を目標に、ピーク正規化より最大 +12 dB まで持ち上げ、
  knee 0.6 のソフトリミッターでピークを 0.89 以下に収める（一瞬の強音で全体が小さくならないように）

### CLI
- `new` の既定長を 30 秒に。`evolve --duration <s>` で子の長さを指定可能（省略時は親を継承）。
- `describeGenome` にエネルギー曲線のミニグラフ（▁▂▃▄▅▆▇█ × 8）を追加。

## 変更対象
`src/lab/params.mjs`（form のスカラー範囲・entry）、`src/lab/form.mjs`（新規: points の生成/変異/検証、energyAt）、
`src/lab/genome.mjs`（v2・昇格・検証）、`src/lab/render.mjs`、`bin/lab.mjs`、`test/lab/*`、`README.md`

## 制約
- 依存追加なし。v1 ゲノムの出力を変えない（ゴールデンハッシュで検証）。

## 受け入れ条件
- [ ] v1 フィクスチャの描画 SHA-256 が変更前と一致
- [ ] random / mutate / crossover（v1 親を含む）が常に v2 として validate を通る
- [ ] energyAt: 端点一致、jump は区間末まで前の値を保持、常に [0,1]
- [ ] 低エネルギーでは発音数が減り、entry の高い声部は鳴らない、pitchCoupling=1 & e=0 で単音
- [ ] 天井: 明るい FM 声部で、ceiling×1.5 以上の帯域のエネルギー比が v1 相当より大きく下がる
- [ ] 既存テストすべて通過

## 検証コマンド
```
npm test
npm run test:tools
node bin/lab.mjs new --count 2 --duration 3 --dir "$TMPDIR/labcheck2"
```
