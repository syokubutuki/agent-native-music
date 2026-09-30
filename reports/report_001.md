# 報告 001 — 最初の大きな作業単位（2026-09-30）

## 現在の状態

- 汎用エンジン v0.1 が動作。`python -m music_agent render songs/track_001` 一発で
  YAML → Score → MIDI → 内蔵シンセ → ミックス → WAV/MP3 → 解析 → レポート（manifest 付き・ビット再現）。
- ベンチマーク作品 track_001（F# minor, 128 BPM, 約 44 秒, Intro 8 → Build 4 → Drop 8 → End 2 小節）は **v005 が本線**。
- 批評ループ（generate → render → analyze → **独立 Critic** → revise → render）を **2 周** 実施（v001 → v003 → v005）。
- 候補探索: motif 変奏 5 候補（人間の選択待ち）、ミックス方式 5 案をバッチ比較。

## 作成したもの

- ドキュメント: CLAUDE.md, AGENTS.md, PROJECT_SPEC.md, ARCHITECTURE.md, MUSIC_SPEC.md, EVALUATION.md, EXPERIMENT_LOG.md, DECISIONS.md, README.md
- エンジン `src/music_agent/`: 音楽理論・ボイシング探索、YAML 記法（度数トークン + motif ops、リズム文字列、小節跨ぎタイ）、
  realize、MIDI 入出力、PolyBLEP/SVF 減算シンセ、合成ドラム/FX、ミキサー（group/return/automation/テンポ同期サイドチェイン/true-peak リミッタ/LUFS 目標）、
  Layer 1 ルール、Layer 2 解析 + 図、候補生成・バッチ・選好記録、VST3 バックエンド（未実機）、プロバナンス
- テスト 47 件（`python -m pytest -q`）
- 楽曲: `songs/track_001/`（harmony / melody / arrangement / mix / overlays）、`songs/test_minimal/`
- 音色: `instruments/`（supersaw lead, glass pluck, warm pad, saw chords, sub/saw bass, kick/clap/snare/hat/crash, riser/impact/reverse crash, vocal sketch）
- 批評: `critiques/track_001_v001.md`, `critiques/track_001_v003.md`（固定テンプレート `critiques/CRITIC_PROMPT.md`）
- Codex タスク: `tasks/codex/`（完了 T-001〜007、未着手 T-010〜016）

## 実際に動作確認したもの

- 全 47 テスト通過（MIDI 往復一致、同一入力の再レンダでビット一致、LUFS/true peak 目標、候補の seed 再現など）。
- track_001 v001〜v005 のレンダ（各 約 30 秒）、全版を同一解析器で再解析して比較。
- 候補バッチ 3 つ（mix_limiter_b001/b002, melody_motif_a_b001）。
- **未確認**: Windows 上での実行、VST3 実機（プラグインを取得できず）、Codex（このセッションに無い）。

## 現在の音楽制作パイプライン

```
songs/<id>/*.yaml (+overlays) → realize → Score ─┬→ song.mid
                                                 └→ instruments (builtin synth / drums / vst3) → stems
   → mixer (strip → group → return → master comp → limiter → −10.5 LUFS / −1 dBTP) → mix.wav / mix.mp3
   → Layer1 rules + Layer2 analysis → report.md / overview.png / manifest.json
   → Critic subagent (critiques/*.md) → Claude が取捨・YAML 改訂 → 再レンダ
   → candidates / batch → SHEET.md → 人間 A/B → feedback/preferences.jsonl
```

## 技術的な問題

1. VST3 は実装のみ・未検証（D-004, T-010）。
2. ボイシングがトラック単位で独立 → pad/chords 間の衝突は range で回避中（T-015）。
3. kick/bass 重なり指標が曲全体の 1 値で原因箇所が分からない（T-016）。
4. レンダ 約 30 秒/回。128 候補探索には遅い（T-012）。
5. 解析器のバグを 3 件修正済み: 調推定のキック汚染（D-008）、全帯域の幅指標がサブに支配される、候補制約が絶対値判定だった。

## 音質上の問題

1. **高域（空気感）不足**: drop の 6 kHz 以上が lowmid 比 −15.6 dB（目安 −14 dB 以上）。持続的に空気帯域を担う音源が無い。
2. **内蔵シンセの限界（推定）**: supersaw/pad は PolyBLEP + 1 系統フィルタ + コーラス。商用シンセのような
   ウェーブテーブル、複数フィルタ、モジュレーション行列、高品位なユニゾン位相処理は無い。ここが最終的な音質ボトルネックになる可能性が高い
   → 聴取で確認後、Surge XT（無料・OSS）を lead から差し替え検証（T-010）。
3. キックとベースのバランス（キックが 30–150 Hz で 9.7 dB 上）は聴取判断が必要。
4. リバーブは合成 IR。自然さは聴取で確認が必要。

## Codexへ委譲した作業

- このクラウドセッションには Codex CLI も認証も無いため、実行による委譲はできていない（D-007）。
- 7 項目仕様で書いたタスク: 完了 7 件（Claude が代行、"executed by: claude" 記録）、未着手 7 件:
  T-010 Surge XT 実機検証 / T-011 Windows スモーク / T-012 性能 / T-013 シンセパラメータのオートメーション /
  T-014 段階探索 / T-015 トラック間共有ボイシング / T-016 kick/bass 区間別診断。

## 次に改善するボトルネック

1. **人間の聴取結果**（最優先）: 数値上の目標はほぼ満たしたが、音楽として成立しているかは聴かないと分からない。
2. 音色の品質（上記 1, 2）: 空気帯域の音源（shimmer 層 / 高域の持続テクスチャ）と、lead の VST 差し替え比較。
3. drop 後半 4 小節のリズムの単調さ（Critic v003-C4 の一部、未対応）と topline の頂点（v001-C10 未達）。

## 人間の判断が必要なこと

1. **v001 と v005 の比較**（`renders/track_001/track_001_v001/mix.mp3` と `track_001_v005/mix.mp3`）: 改訂は良くなったか。
2. **motif 候補の選択**（`candidates/track_001/melody_motif_a_b001/cand_00〜04/mix.mp3`、drop のみ）。
3. **方向性**: 「もっと暗く / もっと透明感 / ドロップが弱い」などの一言。
4. （任意）マスターのソフトクリップ案 `candidates/track_001/mix_limiter_b001/cand_02` が歪んで聞こえるか。
5. 将来の有料ソフト検討は、上記の聴取で内蔵シンセが明確なボトルネックと分かった場合のみ提案する（現時点では不要）。
