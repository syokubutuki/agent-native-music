# ARCHITECTURE

## 基本思想

音楽制作状態そのものを **構造化データ（YAML）** として持ち、エンジンは汎用の変換器として振る舞う。
DAW の GUI やプロジェクトファイルは中核に置かない。エージェントの通常サイクルは CLI で完結する。

```
songs/<id>/*.yaml ──load+merge(overlays)──▶ SongSpec
      │                                         │ realize (決定論, seed)
      │                                         ▼
      │                                       Score (IR: 絶対拍・MIDI音高・コード・セクション・オートメーション)
      │                                         │───────────────▶ song.mid (Type-1 SMF, markers)
instruments/**/*.yaml ──▶ Instrument backends   │
   subtractive | layered | drum | fx | vst3     ▼
                                              stems (2,n) per track
                                                │ Mixer: track strip → groups → returns → master → loudness/limiter
                                                ▼
                                              mix.wav (+mp3)
                                                │ analysis (Layer 2) + rules (Layer 1)
                                                ▼
                                   analysis.json / findings.json / report.md / overview.png / manifest.json
                                                │
                                   Critic (Layer 3, 別エージェント) → critiques/*.md
                                   Human A/B (Layer 4) → feedback/preferences.jsonl
```

Score は MIDI と音声レンダの **唯一の共通ソース**。したがって MIDI と WAV の内容は食い違わない。

## ディレクトリ

| パス | 内容 |
|---|---|
| `songs/<id>/song.yaml` | メタ（tempo, key, seed, sections, target）と include |
| `songs/<id>/harmony.yaml` | セクション毎のコード（1 小節 1 エントリ、`"A B"` で分割、ローマ数字可） |
| `songs/<id>/melody.yaml` | motifs（度数記法）と parts（lead / pluck / topline …）の phrase + ops |
| `songs/<id>/arrangement.yaml` | tracks（どの楽器がどの内容をどこで）、パターン、automation |
| `songs/<id>/mix.yaml` | track strip、groups、returns（reverb/delay）、master |
| `songs/<id>/overlays/` | 差分 YAML（候補・試聴用）。`--overlay` で deep-merge |
| `instruments/<category>/*.yaml` | 音色パッチ（`extends` で継承可）。曲ローカル `songs/<id>/instruments/` が優先 |
| `src/music_agent/` | エンジン（下表） |
| `renders/<song>/<render_id>/` | レンダ成果物（WAV は git 管理外・再生成可能、他はコミット） |
| `candidates/<song>/<batch>/` | 候補バッチ（overlay, 各レンダ, SHEET.md） |
| `critiques/` | Critic の構造化批評 |
| `feedback/preferences.jsonl` | 人間の A/B 選択履歴（追記のみ） |
| `experiments/` | 実験の補助データ |
| `tasks/codex/` | Codex への委譲タスク仕様 |
| `reports/` | 横断レポート（フェーズ報告など） |

## エンジン モジュール

| モジュール | 責務 |
|---|---|
| `theory.py` | 音高・調・スケール度数・コード記号/ローマ数字・ボイシング探索（声部進行コスト最小化） |
| `spec.py` | YAML 読込、include/overlay の deep-merge、時間参照 `"drop:2|1"` の解決、パッチ解決 |
| `composition/notation.py` | 記法: 旋律トークン `7:3 5:3 7#:2 r:2 E5:4!`、リズムパターン `x-.oXu`、motif ops |
| `composition/realize.py` | spec → Score（harmony / melody / chords / arp / bass / drums / fx / automation, humanize） |
| `midi/io.py` | Score ↔ SMF（セクション/コードを marker で埋め込み） |
| `synthesis/dsp.py` | PolyBLEP オシレータ、TPT-SVF（numba, 時変カットオフ）、true-peak リミッタ |
| `synthesis/subtractive.py` | ポリフォニック減算シンセ（unison/detune/spread、filter env、vibrato、drive） |
| `synthesis/drums.py` | 合成ドラム（kick/clap/snare/hat/crash）と遷移 FX（riser/impact/reverse crash/downlifter） |
| `rendering/instruments.py` | パッチ type → バックエンド振り分け、パッチ内 insert FX |
| `rendering/vst3.py` | Pedalboard 経由 VST3（preset / raw_state / parameter ID / MIDI） |
| `mixing/effects.py` | EQ・comp・chorus・phaser（Pedalboard 内蔵）、reverb（合成 IR 畳み込み）、テンポ同期 ping-pong delay |
| `mixing/automation.py` | オートメーション曲線（linear/exp/step, 同時刻 2 点でジャンプ）、テンポ同期サイドチェイン |
| `mixing/mixer.py` | strip（filter→chain→sidechain→gain/width/pan→sends）、groups、returns、master、ラウドネス合わせ |
| `analysis/features.py` | Layer 2 特徴量（全体/セクション/小節/コントラスト/ステム診断/調推定） |
| `analysis/plots.py` | overview.png（スペクトログラム、ピアノロール、小節ラウドネス、帯域比） |
| `evaluation/rules.py` | Layer 1 ルール（記号: 音域・強拍の非和声音・跳躍・ベース根音・motif 使用 / 音声: clip・無音・DC・エネルギー順・マスキング） |
| `evaluation/preferences.py` | Layer 4 A/B 記録、pairwise 展開 |
| `candidates/generate.py` | motif 変奏（名前付き演算子 + ハード制約）、overlay バッチレンダ、比較シート |
| `rendering/pipeline.py` | 一連の実行と成果物書き出し |
| `provenance.py` | manifest（git commit/dirty、全入力ファイル hash、seed、ライブラリ版、コマンド、処理時間） |

## 楽曲表現モデル（仕様 §13 との対応）

| 領域 | 表現 |
|---|---|
| Harmony | key / scale（`key: F# minor`）、chord 記号・ローマ数字、inversion/voicing（`range` と `voices` から探索、声部進行最小化）、harmonic rhythm（小節分割 `"C#sus4 C#"`）、tension（maj7/add9 等の品質） |
| Melody | pitch（度数 + 変化記号 / 絶対音名）、rhythm（16 分グリッド長）、motif（名前付き）、repetition / variation（ops: transpose+keep, set, invert, reverse, take, append, rhythm, octave）、register（part `base`, track `transpose`）、phrase / cadence（phrase ごとの `notes`） |
| Arrangement | section（bars, energy 目標）、instrumentation（tracks と `sections` フィルタ）、density（パターン）、transition（riser, reverse crash, impact, gap）、build（snare roll の vel/pitch ramp、HPF sweep） |
| Sound design | oscillator（saw/square/pulse/triangle/sine/noise）、unison/detune/spread、envelope（amp/filter/pitch）、filter（LP/HP/BP, 12/24 dB, keytrack, vel）、modulation（vibrato）、distortion（drive/saturate）、reverb/delay（insert or send） |
| Mixing | gain / pan / width、EQ（HP/LP/peak/shelf）、compression、sidechain（テンポ同期 volume shaper）、group bus、returns、master comp、true-peak limiter、LUFS 目標 |
| Automation | `<owner>.<param>`: gain_db, lpf, hpf, pan, width, send.<return> — owner は track / group / return / master |

## 再現性

- すべての乱数は `stable_seed(song_seed, track, note_index, …)`（CRC32）で生成 → 同一入力でビット一致（テスト済）。
- `manifest.json` に git commit と dirty フラグ、使用した全 YAML（曲・overlay・パッチ）の SHA-256、seed、ライブラリ版、コマンドライン。
- `resolved_spec.yaml` に merge 後の完全な spec を保存（overlay 適用結果も残る）。
- WAV は git 管理外。`python -m music_agent render <song>` を該当 commit で実行すれば再生成できる。
- 既知の再現性リスク: numba/numpy/pedalboard のバージョン差による浮動小数点差（manifest に版を記録）。

## 性能（クラウドコンテナ 4 vCPU 実測）

- track_001（42 秒、16 トラック、700 ノート）: 合成 ~20 秒、ミックス+解析 ~10 秒。
- numba の初回 JIT は `cache=True` でディスクキャッシュされる。
- ボトルネックは unison ボイス毎のフィルタ処理（ノート×ボイス×チャンネル）。必要なら T-012（ボイス合算後フィルタ・並列化）。

## 拡張ポイント

- **フル尺化**: sections を増やすだけ（breakdown, drop2, outro）。motif ops とパターン辞書は長尺でも同じ。
- **ボーカル**: `topline` パートは独立しており MIDI に出力済み。将来は歌詞（syllable）フィールドと、
  AI 歌唱 / 人間ボーカル用のガイド（MIDI + click + key/tempo）書き出しを追加する。
- **VST**: パッチ `type: vst3` を足すだけで任意トラックを外部音源に差し替え（D-004）。
- **嗜好学習**: preferences.jsonl（pairwise）→ Bradley–Terry / Bayesian preference → 候補生成の事前分布へ（EVALUATION.md）。
- **段階探索**: `candidates` の生成器を拡張し 128→32→8→3（Layer 1 で足切り → Layer 2 多様性 → Critic → 人間）。
