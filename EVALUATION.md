# EVALUATION — 評価設計

最終判断を単一スコアに押し込まない。評価は **hard constraints / diagnostics / qualitative critique / pairwise comparison** の組み合わせ。

## 役割の分離

| 役割 | 担当 | 仕事 | 禁止 |
|---|---|---|---|
| Composer | 楽曲を書いた Claude セッション | 生成・改訂 | 自作の最終評価 |
| Critic | 別コンテキストの Claude subagent（将来: 別モデル） | 欠点の発見（`critiques/<render_id>.md`） | 褒めるだけ、曖昧な文、総合点 |
| Judge | 別コンテキスト | 複数候補の比較（どれが何の点で優れるか） | 重み付き総合点 |
| Human | 音楽ディレクター | A/B/C 選択、方向性 | — |

Critic 起動プロンプトは `critiques/CRITIC_PROMPT.md`（再現性のため固定テンプレート）。

## Layer 1 — ルールベース（`evaluation/rules.py`）

error（直す必須）と warn / info（判断材料）。

| id | 内容 |
|---|---|
| `section.empty` (error) | 音のないセクション |
| `harmony.missing` (error) | コード未定義 |
| `audio.clipping` / `audio.true_peak` (error) | クリップ、true peak > 天井 + 0.2 dB |
| `audio.silence` (error) | 曲中の無音小節（< −60 dBFS） |
| `duration.target` | 目標尺外 |
| `range` | 役割別音域外（lead C4–C7, topline G3–F5, bass C1–G3 …） |
| `melody.nonchord_strong` | 強拍・1/2 拍以上の非和声音。半音衝突は warn、その他テンションは info |
| `melody.leap` | オクターブ超の跳躍 |
| `bass.nonroot` (info) | ベースが根音/指定ベースでない |
| `motif.*` | motif が反復かつ変形されているか |
| `arrangement.energy_order` | energy 目標差 ≥ 0.3 のセクション間でラウドネス差が逆転 or < 1 LU |
| `mix.harsh_high` / `mix.bright` | 高域比 > 0.22 / centroid > 4.5 kHz |
| `mix.kick_bass_overlap` | kick ヒット時のベース低域エネルギー比 > 0.35 |
| `mix.lead_buried` | lead が 1–5 kHz で他より −3 dB 未満 |
| `mix.low_end_phase` | 150 Hz 以下 L/R 相関 < 0.6 |
| `tonality.mismatch` | 宣言キーがクロマ推定で 4 位以下 |

## Layer 2 — 音響診断（`analysis/features.py`）

**品質そのものではない。** 異常検出・比較・診断の補助。

- 全体: LUFS integrated（BS.1770）、true peak（4x オーバーサンプル）、peak、RMS、crest、clip 数、DC、side/mid、L/R 相関。
- セクション別: LUFS、spectral centroid / bandwidth / rolloff85（振幅スペクトル）、帯域エネルギー比（sub 20–60, low 60–250,
  lowmid 250–2k, highmid 2–6k, high 6–20k）、onset 密度（spectral flux）、stereo width、chroma。
- 小節別ラウドネス（エネルギー曲線 / loudness progression）。
- セクション間コントラスト（ΔLUFS, Δcentroid, Δonsets, Δwidth, Δ帯域比）。
- ステム診断: kick/bass 低域重なり、lead の 1–5 kHz 存在感、低域のステレオ相関。
- 調性: ピッチ楽器ステムのクロマ → Krumhansl–Kessler 相関の上位キー、宣言キーの順位。
- 可視化: overview.png（Critic は画像を読める）。

## Layer 3 — 音楽構造批評（Critic）

各指摘は必ず:

```
Observation → Musical consequence → Hypothesis → Proposed change → How to evaluate
```

観点: melody / harmony / rhythm / arrangement / repetition / contrast / tension-release / memorability / sound / mix。
各指摘に severity・confidence・「聴取が必要か」を付ける（Critic は聴けない）。
最後に「次の改訂の最優先 3 点」と「守るべき長所」を書く。

## Layer 4 — 人間の A/B

- `candidates/<song>/<batch>/SHEET.md` から聴き比べ、`python -m music_agent prefer ...` で `feedback/preferences.jsonl` に追記。
- 形式: `{comparison, preferred, reason, aspects{melody:…, sound:…}, note, context}`。「メロディは B、音色は C」は aspects で表す。
- 将来: pairwise 展開（`preferences.pairwise`）→ Bradley–Terry / Thurstone / Bayesian preference（Gaussian process on
  candidate features）→ 候補生成の事前分布・Judge の参考。**学習結果は候補の並べ替えに使い、生成を単一目的関数で最適化しない。**

## 評価の罠（やらないこと）

- `score = melody*0.4 + loudness*0.2 + …` のような重み付き総合点を目的関数にしない（数値的に正しく音楽的に退屈な作品へ収束する）。
- ラウドネスを上げれば良い、centroid を上げれば明るい、という短絡。Layer 2 は「変化があるか」「異常がないか」を見る。
- 自作自評価。Composer の自己評価は記録しても判断材料にしない。
- 聴取なしの断定。Claude/Critic の主観欄には「聴取なし・推定」と明記。

## 実験記録

すべての主要試行は `EXPERIMENT_LOG.md` に: hypothesis / change / result / metrics / subjective / keep|reject / next action。
