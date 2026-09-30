# EXPERIMENT_LOG

各エントリ: hypothesis / change / result / metrics / subjective / decision (keep|reject) / next action。
主観欄の「聴取なし・推定」は Claude/Critic が音を聴けないことを示す。人間の聴取結果は `feedback/preferences.jsonl` と本ログに追記する。

---

## EXP-000 パイプライン疎通（test_minimal）

- hypothesis: YAML spec → Score → MIDI → 内蔵シンセ → ミックス → WAV → 解析が CLI 一発で決定論的に動く。
- change: エンジン v0.1 実装（ARCHITECTURE.md）。
- result: `songs/test_minimal`（4 小節）で 3.6 秒。同一入力の再レンダでビット一致（`test_full_pipeline_render`）。
- metrics: −11.1 LUFS（目標 −11）、true peak −1.04 dBTP、clip 0。
- subjective: —（技術確認のみ）
- decision: keep
- next: track_001 を書く。

## EXP-001 track_001 v001 — 初稿（ベースライン）

- hypothesis: MUSIC_SPEC の原理（共通音アンカーの motif、A A' A'' B、偽終止で Drop 着地、音域上昇、gap、サイドチェイン）で
  30〜45 秒の Intro→Build→Drop→End が成立する。
- change: `songs/track_001/*` 初稿（commit b5d33a4）。
- result: 41.9 秒、16 トラック、702 ノート。レンダ 33 秒。
- metrics (render `track_001_v001`):
  - −9.17 LUFS / −1.04 dBTP / clip 0。**リミッタ最大 GR 7.4 dB**（潰しすぎ）。
  - セクション LUFS: intro −10.0 / build −9.0 / drop −8.5 / end −9.5 → **build→drop が +0.4 LU しかない**（Layer 1 warn）。
  - 小節ラウドネス: intro 後半（bar 4–7）で既に −8 LUFS ＝ drop と同じ。サブベースの全音符が支配。
  - 帯域比（drop）: sub 0.38 / low 0.49 / lowmid 0.12 / highmid 0.011 / high 0.002 → 極端に低域寄り。
  - kick/bass 重なり 0.25（OK）、lead 1–5 kHz 存在感 +1.2 dB（OK）、低域相関 1.0（OK）。
  - 調推定（修正後の解析器, D-008）: C# minor > A major > **F# minor（3 位）**。
- subjective: 聴取なし・推定。スペクトログラムでは drop の高域が build 末尾より暗い。
- decision: baseline として keep（比較の基準）。
- next: 独立 Critic によるレビュー → 改訂（EXP-002）。

## EXP-002 track_001 v002 — 批評ループ 1 周目（critiques/track_001_v001.md を反映）

- hypothesis（Critic C1–C10 を Claude が取捨）:
  - C1 Drop 頭が導音 E#5 から半音 **下**（E5）に落ちるので失速に聞こえる → 上行解決 F#5 に、頂点を A5（拍頭、motif の輪郭を維持）に。
  - C2 伴奏の最上声が旋律以上の時間が長い（intro 83%, drop 62%）→ pad/chords の range 上限を A4、intro pluck の −12 を撤廃、lead に 2.5 kHz +2 dB。
  - C3 エネルギーが平坦（intro 後半 ≒ build ≒ drop）→ intro のベースは最後 2 小節だけ、build はオフビートベース禁止・最終小節は完全な真空。
  - C4 1 小節リズムの反復過多 → drop bar 1 を保持音の「問い」に。**修正採用**: Critic 案（G#4 保持）は bar 3 の「答え」と同じ終止音になるので、問いは B4（E の 5 度、開いた終止）で止める。intro 前半は motif の頭 3 音だけ提示。
  - C5 ベースが F#1 に落ちて上行を裏切る → range [G#1, G2]。
  - C6 drop が暗い → lead/chords のカットオフ、リバーブ/ディレイの LP を開く。
  - C7 drop で広がらない → pad/chords の width、build 末で pad を狭めて drop で開く。
  - C8 リミッター GR 7.4 dB → target −10.5 LUFS。
  - C9 エンディング 1 小節が重い → 2 小節、ベース半小節、impact を弱く。エンジンに **小節をまたぐタイ** と **同一コードの結合** を追加（汎用機能）。
  - C10 topline の頂点が短い → bar 6 を伸ばす。
  - 追加（D-008）: キックの基音を F#1（46.2 Hz）に調律。
- result (`track_001_v002`): 43.8 秒。Layer 1 の energy_order 警告が解消。
- metrics: intro/build/drop/end LUFS −12.0/−10.5/−9.5/−10.7（intro→drop +2.5, build→drop +1.0）。
  lead 存在感 +1.2 → **+3.7 dB**。crest 9.1 → 10.7 dB。**リミッター GR 6.2 dB（未達）**。
  調推定 **F# minor 1 位**（v001 は 3 位）。drop 高域比 0.002（未達）。
- subjective: 聴取なし・推定。スペクトログラムで intro 後半のキックの胴（46 Hz）が残っており、drop のサブ到来を弱めている。
- decision: keep。
- next: キックを drop までサブ無しに、リミッター対策を候補比較で決める（EXP-003）。

## EXP-003 track_001 v003 — キックの帯域設計とリミッター対策

- hypothesis A（Claude 追加仮説）: intro/build のキックは LPF でも胴鳴りが残る。HPF で細くし、drop:0 で初めてサブを開けば
  「到達」が帯域として生まれる。
- hypothesis B: GR 過多はキックのトランジェントが原因。limiter 前のピーク制御で GR ≤ 5 dB にできる。
- change: `kick.hpf` オートメーション（intro 160 Hz → build 70 Hz → drop 20 Hz）、hat +3 dB / ohat +2 dB。
  リミッター対策はバッチで比較:

  | batch / cand | 内容 | GR dB | crest | kick/bass overlap | 判定 |
  |---|---|---|---|---|---|
  | b001/cand_00 | 現状 | 7.05 | 11.1 | – | 潰しすぎ |
  | b001/cand_01 | キック soft clip 0.35 | 4.13 | 10.7 | **0.41（警告）** | 重なり悪化 |
  | b001/cand_02 | マスター soft clip | 0.06 | 11.0 | – | 数値は最良だが、saturate 実装は小信号で +6.6 dB の強い曲線 → 全体に歪みの恐れ。**数値で選ばない**、人間 A/B 候補として保留 |
  | b002/cand_00 | キック soft clip 0.22 | **4.47** | 10.7 | **0.34** | 採用 |
  | b002/cand_01 | clip 0.35 + ベースの深い duck | 4.02 | 10.7 | 0.41 | 不採用。原因は設定ミス: shape 3 は回復が速い曲線（gain = 1 − depth·(1−t)^shape）なので duck の総量はむしろ減っていた。指標は正常 |
- result (`track_001_v003`):
  - 帯域: sub 比 intro **0.008** / build 0.18 / drop **0.50** — サブは drop で初めて解放される。
  - LUFS intro/build/drop/end −12.5/−10.5/−9.2/−10.7（intro→drop **+3.3**、build→drop +1.2）。GR **4.47 dB**。調推定 F# minor 1 位。
  - 幅（新指標 >300 Hz, 全版を同じ解析器で再解析）: build −7.4 → drop −6.5 dB（+0.9）。旧指標（全帯域）はモノのサブ増加で
    「狭くなった」と誤判定していた → 解析器を修正。
- subjective: 聴取なし・推定。
- decision: keep。
- next: 2 周目 Critic（critiques/track_001_v003.md）、motif 候補の人間 A/B。未達: build→drop +2 LU、drop の高域（透明感）、幅 +2 dB。

## EXP-004 motif a の候補生成（Phase 6, `candidates/track_001/melody_motif_a_b001/`）

- hypothesis: 名前付き演算子（anchor / neighbor / rhythm / contour / tail）による motif 変奏は、phrase 構造（A' A'' B と op）を保ったまま
  曲全体で一貫したメロディ候補になる。
- change: `candidates --motif a --n 5 --seed 7 --sections drop`。
- 失敗と修正（記録）: 初回は候補 1 つ（原型）しか残らず。原因 1: 原型に既にある topline 音域警告を「候補の違反」と数えていた。
  原因 2: 「回復しない跳躍 > 2」を絶対値で判定していたが、原型自体が小節境界の跳躍で 4〜5 回ある。→ いずれも **原型との相対比較** に修正。
- result: 5 候補（original, 連打で閉じる, アンカー伸長 6-2-3-3-2, 均等 3-3-3-3-4, 下で閉じる 2-4-2-4-4）。
- subjective: 人間の聴取待ち（SHEET.md）。
- next: `python -m music_agent prefer ...` で選択を記録 → 選ばれた motif を本線へ。

## EXP-005 track_001 v004 — 批評ループ 2 周目（critiques/track_001_v003.md を反映）

- 検証（Critic による v001 指摘の達成判定）: C1/C5/C9 達成、C8 ほぼ達成、C2/C3/C4 部分達成、C6/C7/C10 未達。
  後退: 全帯域幅指標、lead 存在感（v003 のキッククリップで −0.6 dB）、kick/bass 重なり、低域ステレオ、intro→drop の音域上昇（+13 → +1.4 半音）。
- hypothesis（全 8 件採用）:
  - C1 **マスターのバスコンプ（−14 dB, 2:1）が最も大きい区間ほど潰し、アレンジで作った「溜め・真空・解放」を消していた**
    （pre-master では drop−build +2.25 dB、bar 11 −5.3 dB あったのに、出力では +1.13 / −0.14）→ 閾値 −6 dB / 1.6:1。
  - C2 偽終止が聞こえない（bar 11 にベースの C# 無し、drop 頭の最低音が C#3/D3 の半音）→ bar 11 に HPF したベース C#2（サブの真空は維持）、drop 1 拍目に D2。
  - C3 キックが支配的（キック単体 −5.8 LUFS vs 他の総和 −10.2）→ kick −2.5 dB + 3 kHz −4 dB、bass +1 dB。
  - C4 intro が drop の 3 小節を完全先取り → intro は上向きターンとピックアップを出さない（情報の温存）、A5 頂点を 1.5 拍。
  - C5 pad と chords が別々にボイシングされ drop 頭で短 2 度 ×2 → range 下限を D3 に（Critic がエンジンをメモリ上で試算済み）。
  - C6 intro bar 7 が build より大きい → intro のベースを撤去（build 頭から）。
  - C7 透明感不足は LPF ではなく空気帯域の音源不足（v001-C6 の仮説は外れ）→ music グループに 7 kHz high shelf +3 dB、reverb damping 0.35。
  - C8 幅の演出が pad だけ → music グループ全体の width を build 末で 0.6 → drop 1.15、lead width 1.2。
- metrics (v003 → v004): bar11−build −0.14 → **−2.90**、drop−build +1.23 → **+1.70**、intro→drop +3.26 → **+6.08**、GR 4.47 → **4.31**、
  幅(>300 Hz) drop−build +1.28 → **+3.66**、high−lowmid −16.9 → −15.4、lead 3.18 → 3.55、overlap 0.342 → 0.358（警告）。
- 新たに発見（ステム別の小節ラウドネス調査）: **build bar 8 だけ −8.9 LUFS と突出**。原因はベースの音色で、saw 層の
  `unison: 2, detune: 0.06` が約 0.25 Hz のうなり（4 秒周期）を生み、全音符ベースが位相次第で ±6 dB 揺れていた。
  → これまでの全版でベースの音量が小節ごとに不安定だった可能性。
- decision: keep（v005 でベース修正）。

## EXP-006 track_001 v005 — ベースのうなり修正

- hypothesis: ベースの saw を単一オシレータにすれば小節間の音量揺れが消える。
- change: `bass/sub_saw_bass` saw 層 unison 2 → 1、layer gain +3 dB（1 声分の補償）。
- result: build の小節ラウドネス −10.4 / −9.9 / −10.5 / −11.8 と平坦化。drop 全小節 −8.8〜−9.1。
- metrics: section LUFS intro −14.0 / build −10.6 / drop −8.8 / end −11.0（intro→drop +5.2, build→drop **+1.8**）、GR 4.95 dB、crest 11.1 dB、
  TP −1.04 dBTP、幅(>300 Hz) drop−build +3.56 dB / drop−bar11 +2.88 dB、lead 存在感 +3.5 dB、high−lowmid −15.6 dB。
  調推定 C# minor 0.780 / **F# minor 0.774（2 位）** — 差は 0.006。bar 11 の C# ベースと loop 内の C#m7 による。
- 未達・判断保留（Claude の判断）:
  - bar 11 の音量落差 −1.3 LU（Critic 基準 −3 LU）: スネアロールとライザーの頂点の小節なので音量の落差までは求めない。
    **サブ帯域の真空（lowmid 比 −40 dB）は達成**しており、これ以上は指標への過適合と判断。聴取で確認する。
  - kick/bass 重なり 0.39（警告、しきい値 0.35）、kick/bass 低域比 9.7 dB（Critic 目安 4〜6）: ベースを上げても比はほぼ動かない
    （キック中心の指標）。音量バランスは聴取判断が必要。解析器の区間別内訳を T-016 に。
  - 高域 −15.6 dB（Critic 目安 −14）。
- subjective: 聴取なし・推定。
- decision: **本線 = v005**。
- next: 人間の聴取（v001 と v005 の比較、motif 候補の選択）→ 選好に基づき次の周回。

## HUMAN-001 人間の聴取フィードバック（2026-09-30, feedback/preferences.jsonl）

- v001 vs v005 → **v005**。「v005 の改訂で音の広がり、明瞭感、爽快感が良くなっている」（aspects: width / clarity / exhilaration）。
- motif 候補 melody_motif_a_b001 → **cand_04**（`7:2 5:4 3:2 4:4 3:4` = E C# A B A、下で閉じる）。「変わり種でよい」。
- 方向性: **「もっと陰鬱に、しかし透明感もほしい」**。
- 解釈（Claude）: v005 で評価された広がり・明瞭感・爽快感は保持する。陰鬱さは **和声・旋律・音域** で作り、音をこもらせない。
  透明感は **音色の上端（澄んだ高域層・明るく長い残響）と、マスキングの少なさ** で担う。

## EXP-007 track_001 v006 — 「陰鬱 × 透明感」

- hypothesis:
  1. VI–VII–i–v（上昇・救い）→ **ラメント**（ベース F#–E–D–C# 下降、i – v/5 – VI – V）で陰鬱さが出る。drop の着地を偽終止 V→VI から
     **V→i**（短調主和音へ落ちる）に替えると、救いのない重さになる。後半の VI を iv（Bm7）に替えて頂点前を最も暗く。
  2. cand_04（下で閉じる motif）をラメントに再適合: A→G# の倚音（C#m/E 上の b6→5）、Bm7 上の 11th/9th。
  3. 透明感: 旋律の上に純音系のシマー層（sine unison + triangle, 遅い立ち上がり, 長いリバーブ送り）、pad の胴を暗く（cutoff 1400→1000）、
     リバーブ 3.2→4.2 s / predelay 25→40 ms。
- change: harmony.yaml / melody.yaml 全面改訂、`instruments/pad/air_shimmer.yaml` 新規、arrangement に shimmer トラック。
- result: Layer 1 の記号警告 0（topline の音域警告も解消）。
- metrics (v005 → v006): 調推定 C# minor 0.780（F# minor 2 位）→ **F# minor 0.831（1 位）**。drop highmid−lowmid −9.7 → −8.7 dB、
  high−lowmid −15.6 → −15.5 dB（変化なし）。**lead 存在感 3.53 → 2.21 dB（後退）**。
- 診断: シマー（F#5–C#7）が lead と同じ 1–5 kHz にかぶり旋律をマスク。6 kHz 以上はほとんど増えない。
- decision: 和声・旋律は keep。シマーは要修正（EXP-008）。

## EXP-008 track_001 v007 — シマー層の配置

- hypothesis: シマーを lead の音域より上へ移し、息成分（ノイズ + 6 kHz shelf）を足せば、lead を隠さずに空気感が出る。
- 比較（batch `sound_shimmer_b001`, drop）:

  | cand | 内容 | lead 存在感 | high−lowmid |
  |---|---|---|---|
  | cand_00 | S1: range C#6–D7, −13 dB, 息成分 | 3.33 dB | −15.3 dB |
  | cand_01 | S2: シマーなし | **4.60 dB** | −15.3 dB |

  → drop ではシマーは 6 kHz 以上をほぼ増やさず、lead だけを 1.3 dB 削る。
- change（Claude の判断）: シマーは **lead が鳴らない区間（intro 後半・build・end）だけ**。drop は明瞭さ優先。
  drop にも入れる案は `overlays/shimmer_in_drop.yaml` として人間の A/B に残す。
- metrics (`track_001_v007`): lead 存在感 **4.12 dB**（初めて Critic 目標 ≥ 4 を達成）、調推定 **F# minor 0.861**（最も強い主和音中心）、
  section LUFS intro −14.3 / build −10.3 / drop −8.9 / end −10.6、GR 4.9 dB。
- subjective: 聴取なし・推定。
- decision: **本線 = v007**。
- next: 3 周目 Critic（critiques/track_001_v007.md）、人間の聴取。

## EXP-009 track_001 v008/v009 — 批評ループ 3 周目（critiques/track_001_v007.md）

- Critic の判定: v007 は「陰鬱だが透明」を部分的にしか実現していない。陰鬱さは和声記号の上にしかなく（drop のグルーヴ・音域・スペクトルは
  v005 のままか明るい）、透明感は分離（lead 存在感・調の明確さ）では達成、上端の空気層では未達（シマーの実エネルギーは 1–2 kHz）。
  回帰 2 件: drop bar 15/19 の後半 2 拍で pad/chords が無音、build 頭が大きく build→drop が 1.4 LU。
- 採用（本線）:
  - C1 分割和音 `C#sus4 C#` の小節で pad/chords/shimmer を再発音。
  - C2 `C#m/E` → **`F#m7/E`**（古典的ラメントの 2 番目: 上 3 声 A C# F# を保持し最低声だけ F#→E→D と下降）、intro 後半にサブ無しベース。
  - C3 旋律に短調の b6: drop 頂点の後 A5 F#5 **D5** C#5、intro bar 3 **D5** C#5 A4（ため息の初出と回収）。
  - C5 シマー再設計: C#7–A7（基音 2.2–3.5 kHz）、triangle 0.35 / 息ノイズ 0.15、HPF 2.5 kHz、8 kHz shelf +6 dB、−13 dB。
  - C6 シマーは build 後半から、build 冒頭の pluck を弱く。C8 前半: intro bar 5 を drop bar 13 と重複しない形に。
  - Claude 追加（v009）: build 冒頭が大きい原因は **曲で最初のサブが bar 8 で鳴ること** → ベースの HPF を build 終わりまで維持
    （サブはキック同様 drop で初めて届く、v003 の原理に揃える）。lead +0.5 dB（C2/C3 後に存在感 3.88 dB へ低下したため）。
- metrics (v007 → v009):

  | 指標 | v007 | v009 | Critic 基準 |
  |---|---|---|---|
  | build→drop ΔLUFS | 1.39 | **2.24** | ≥ 1.7 ✓ |
  | bar 8 LUFS | −9.4 | **−11.1** | ≤ −10.3 ✓ |
  | lead 存在感 | 4.12 | **4.38** | ≥ 4.4（ほぼ）|
  | 調推定 F# minor | 0.861 | **0.902** | 維持 ✓ |
  | シマー 6–20 kHz / 1–2 kHz | −22.1 / −0.3 dB | **−9.8 / −37.9 dB**（v008） | ≥ −10 / ≤ −10 ✓ |
  | intro の >6 kHz 比 | 0.0004 | 0.0026（v008） | ≥ 0.005 ✗（改善） |
  | 旋律の D 比 | 0.000 | 0.025 | ≥ 0.05 ✗（1 か所のみ） |
  | 幅 >300 Hz drop−build | +2.8 | **+3.7** dB | ≥ 2 ✓ |
  | limiter GR | 4.82 | 5.35 dB | ≤ 5（わずかに超過） |
- 候補（人間の A/B、batch `direction_gloom_b001`, 全曲）:

  | cand | 内容 | 数値上の差 |
  |---|---|---|
  | cand_00 | v009 そのまま | — |
  | cand_01 | drop 前半ハーフタイム（clap 3 拍目のみ・ohat なし、bar 16 で通常グルーヴ）(C4) | onsets 3.9→3.7、音量差なし |
  | cand_02 | リバーブ 3.4 s / predelay 60 ms、pad 送り −12 (C7) | ほぼなし |
  | cand_03 | drop 後半頭を Dmaj7/F#（cand_04 選択時の和音の色）(C8) | ほぼなし |
  | cand_04 | 再設計シマーを drop にも | **lead 存在感 4.38 → 3.47 dB** |

  → 4 つとも数値でほとんど区別できない＝聴取でしか決められない分岐。Claude は数値で選ばない。
- subjective: 聴取なし・推定。
- decision: **本線 = v009**。候補は人間の選択待ち。
