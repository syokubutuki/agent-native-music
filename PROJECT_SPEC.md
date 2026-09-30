# PROJECT_SPEC — エージェントネイティブ音楽制作環境

## 目的

コードとエージェントを使うことで、人間が DAW で行う試行錯誤以上の探索を行い、**高品質な音楽へ到達できるか**を検証する。
制作系そのものは手段。技術的に美しくても音楽が悪ければ失敗、単純でも改善ループが回り品質が上がり続ければ成功。

```
Human intent → Music Director → Composition candidates → Arrangement → Sound design → Render
            → Audio analysis → Critic → Judge → Human preference → Next generation
```

人間は作業者ではなく **音楽ディレクター**（方向性、候補選択、「もっと暗く」「ドロップが弱い」程度のフィードバック）。
ノート打ち込み・ノブ操作・手動 EQ は前提にしない。

## 優先順位

```
Musical quality > Iteration speed > Agent controllability > Reproducibility > Automation > Architectural elegance
```
ただし再現性を犠牲にした手作業には逃げない。品質の順序は:
自然さ → メロディの強さ → 和声とリズム → 音色 → 編曲と展開 → ミックス → その後に独自性。

## ジャンル

メロディ最重視の、哀愁・透明感・広がりを持つエレクトロニック（Progressive House / Melodic EDM / Electro House / Future Bass の要素）。
特定アーティスト・楽曲・メロディ・音色の模倣は禁止。既存作品は抽象原理（記憶性、緊張と解放、音域配置、密度変化、エネルギー設計）の研究にのみ使う。
原理の分解は `MUSIC_SPEC.md`。

## 最初のベンチマーク: track_001（30〜45 秒）

一曲専用の使い捨てコードは禁止。**汎用エンジンを作りながら、その性能評価・改善対象として 1 曲目を育てる。**

### 完了条件

Composition
- [ ] 明確な motif が存在し、最低 1 回変形される（A, A', A'', B）
- [ ] コードとメロディが論理的に関係（強拍の非和声音は意図されたテンションのみ）
- [ ] bass が和声を支える / drums がエネルギー設計に寄与

Arrangement
- [ ] 2 つ以上の明確に異なる状態、緊張 → 解放
- [ ] 音数・音域・スペクトルの変化（Layer 2 の section contrast で確認）

Sound
- [ ] 仮 GM 音源ではない（内蔵シンセ or VST のパッチ設計）
- [ ] リードが中心として成立、bass が薄すぎない、高域が耳障りでない

Mix
- [ ] clipping なし（true peak ≤ −1 dBTP）、極端な masking なし
- [ ] kick/bass 衝突を確認（stem 診断）、lead が埋もれていない

Reproducibility
- [ ] `python -m music_agent render songs/track_001` 一発で再生成、manifest で由来追跡

**最終条件: 人間が聴いて「続きを聴きたい」と思える 30〜45 秒。** これは人間の聴取でしか確認できない。

## フェーズ

| Phase | 内容 | 状態 |
|---|---|---|
| 0 | 環境調査 | done（下記「環境」） |
| 1 | 基盤ドキュメント | done |
| 2 | spec → MIDI → instrument → WAV（CLI） | done |
| 3 | melody / chords / bass / drums の独立トラック | done |
| 4 | 自動音響解析レポート | done |
| 5 | 最初の作品 track_001 | v005（人間の聴取待ち） |
| 6 | 候補探索（motif 変奏、overlay バッチ、A/B シート） | done（motif a × 5, ミックス 5 案） |
| 7 | 批評ループ（generate→render→analyze→critic→revise→render） | 2 周完了（v001→v003→v005） |
| 8 | 128→32→8→3 の段階探索、嗜好学習、フル尺拡張、ボーカル接続 | 未着手 |

## 環境（Phase 0 調査結果と仮定）

- **本番想定**: Windows ノート PC（内蔵 GPU のみ、CPU 前提）、Python、ffmpeg、VST3 導入可、Claude Code と Codex が同じディレクトリを操作。
- **今回の開発セッション実環境**: Claude Code on the web のクラウドコンテナ（Ubuntu 24.04, Python 3.11, 4 vCPU, 15 GB RAM）。
  ffmpeg は apt で導入。**Windows ではない**ため、Windows 固有の確認（VST3 パス、ASIO 等）は未実施。
- **VST3**: コンテナ内にプラグインなし。GitHub Releases へのダウンロードがプロキシで拒否（403）され Surge XT 等を試験できず。
  → VST3 バックエンドは実装済み・モックテストのみ（DECISIONS.md D-004）。
- **Codex**: このセッションには Codex CLI も OpenAI 認証も無い。委譲タスクは `tasks/codex/` に仕様化し、
  実装は Claude が代行して "executed by: claude" と記録（D-007）。Windows 環境では Codex がそのまま引き継げる。

## 仮定（実装を止めないために置いたもの）

1. サンプルレート 44.1 kHz、24-bit WAV、ラウドネス目標 −9 LUFS integrated / −1 dBTP（EDM のストリーミング前マスターとして妥当な帯）。
2. 初期音源は内蔵減算シンセ + 合成ドラム（サンプル不要・完全決定論）。音質ボトルネック特定後に VST（Surge XT → 必要なら Vital / 有料）を検討。
3. 楽曲フォーマットは YAML（コメント可・LLM が安全に差分編集可）。MIDI は出力（相互運用）であり正本ではない。
4. トップライン（将来のボーカル）は独立パートとして作曲し、MIDI に含めるがミックスではミュート（試聴用 overlay あり）。
