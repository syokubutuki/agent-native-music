# T-001, T-003 – T-007 (completed foundation tasks)

## T-001 Composition spec loader + realizer
- 目的: 楽曲内容をコードから分離し、LLM が安全に編集できる YAML から決定論的に Score を得る。
- 背景: ARCHITECTURE.md「楽曲表現モデル」。記法は `composition/notation.py` の docstring。
- 入力: `songs/<id>/song.yaml` + include（harmony/melody/arrangement/mix）+ overlays。
- 出力: `spec.py`（load_song, deep_merge, Timeline 参照 `"drop:2|1"`）、`composition/realize.py`（harmony, melody ops, chords/arp/bass/drums/fx, automation, humanize）。
- 制約: seed は `stable_seed`。エラーは修正方法を含める（例: bar 数不一致、音域不足）。
- 完了条件: 2 曲が realize でき、bar 数・コード位置・度数変換・ops・ベース根音追従・ramp がテストで検証される。
- テスト方法: `tests/test_realize_midi.py`, `tests/test_notation.py`, `tests/test_theory.py`。
- 状態: done (executed by: claude)

## T-003 Built-in subtractive synth + drums/FX
- 目的: 無料・決定論・CLI 制御の音源で最初の作品を成立させる（GM 音源に頼らない）。
- 入力: パッチ YAML（schema は `synthesis/subtractive.py` / `synthesis/drums.py` の docstring）。
- 出力: PolyBLEP オシレータ、TPT-SVF（numba, 時変）、ADSR、unison/spread、vibrato、drive、layered パッチ、合成ドラム 5 種 + FX 4 種。
- 制約: `(2, n)` float64、seed 経由の乱数のみ。
- 完了条件: 帯域制限（saw の基音一致）、フィルタ減衰、ADSR 形状、決定論、全ドラムモデルが有限値で鳴る。
- テスト方法: `tests/test_dsp_render.py`。
- 状態: done (executed by: claude)

## T-004 Mixer
- 目的: 編曲意図（ビルドの HPF、サイドチェインの呼吸、送り）とラウドネス目標をデータで表現。
- 出力: `mixing/mixer.py`, `mixing/automation.py`, `mixing/effects.py`, `synthesis/dsp.limiter`。
- 完了条件: true peak ≤ 天井、LUFS 目標 ±0.6、同時刻 2 点でオートメーションがジャンプ、ducking の深さ一致。
- テスト方法: `test_limiter_respects_ceiling`, `test_duck_envelope_and_curves`, `test_full_pipeline_render`。
- 状態: done (executed by: claude)

## T-005 Analysis + report + plot
- 目的: 聴けないエージェントが欠陥と変化を把握するための Layer 2 診断。
- 出力: `analysis/features.py`, `analysis/report.py`, `analysis/plots.py`, CLI `analyze`（既存レンダの再解析）。
- 完了条件: report.md に全体・セクション・コントラスト・小節ラウドネス・ステム診断・調推定。PNG 生成失敗でレンダを落とさない。
- 状態: done (executed by: claude)

## T-006 Layer 1 rules
- 出力: `evaluation/rules.py`（EVALUATION.md の表）。
- テスト方法: `tests/test_evaluation.py::test_melody_clash_detection`, `test_audio_checks_flag_clipping_and_silence`。
- 状態: done (executed by: claude)

## T-007 Candidates / batch / preferences
- 出力: `candidates/generate.py`（名前付き motif 演算子 + ハード制約 + seed）、CLI `candidates` / `batch` / `prefer`、
  `evaluation/preferences.py`（JSONL, pairwise 展開）。
- 完了条件: 同 seed で同候補、候補が構文的に正しくコード衝突なし、SHEET.md 生成、選好記録の往復。
- テスト方法: `tests/test_evaluation.py`。
- 状態: done (executed by: claude)
