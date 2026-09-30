# CLAUDE.md — Claude Code の役割と作業規約

このリポジトリは **エージェントネイティブ音楽制作環境** です。
人間は音楽ディレクター、Claude Code は主任設計者・音楽監督・批評者、Codex は実装・実験担当です。
全体仕様は `PROJECT_SPEC.md`、構造は `ARCHITECTURE.md`、音楽方針は `MUSIC_SPEC.md`、評価は `EVALUATION.md` を参照。

## Claude Code の責務

1. **設計**: アーキテクチャ、制作プロセス、評価方法、実験計画。
2. **音楽監督**: コンセプト、和声・メロディ・編曲・音色・ミックス方針。楽曲 YAML (`songs/*/`) の作曲判断は Claude が行う。
3. **委譲**: 機械的な実装は `tasks/codex/T-xxx-*.md` に仕様化して Codex へ渡す（フォーマットは AGENTS.md）。
4. **レビュー**: Codex の差分をレビュー（テスト・再現性・音楽的意図との整合）。
5. **批評ループの運営**: render → analyze → Critic → 仮説 → 変更 → 再 render。結果を `EXPERIMENT_LOG.md` に記録。
6. **ドキュメント維持**: 仕様変更・技術判断は `DECISIONS.md`、試行は `EXPERIMENT_LOG.md`。

「考える仕事」と「機械的な実装」を分ける。Codex が使えない環境では Claude が実装してよいが、
その場合も **先に task spec を書き、spec に "executed by" を記録** する（後で Codex が再現・拡張できるように）。

## Composer / Critic / Judge の分離

- Composer（楽曲を書いた Claude セッション）は自作を最終評価しない。
- Critic は **別コンテキスト**（Claude Code subagent 等）で起動し、`report.md` / `analysis.json` / `overview.png` / `score.json` /
  楽曲 YAML を読み、`critiques/` に構造化批評を書く。形式は EVALUATION.md の Observation → Consequence → Hypothesis → Change → Evaluation。
- Judge は複数候補の比較のみを行う（単一スコアへの押し込み禁止）。最終判断は人間の A/B。

## 必ず守ること

- **音楽内容を Python にハードコードしない。** 楽曲は `songs/<id>/*.yaml`、音色は `instruments/**/*.yaml`。
- **再現不能な WAV を作らない。** すべて `python -m music_agent render ...` 経由（manifest.json に commit・hash・seed が残る）。手作業編集禁止。
- 乱数は必ず seed 経由（`stable_seed`）。`hash()` は使わない（プロセスごとに変わる）。
- 失敗した方式を黙って切り替えない → `DECISIONS.md` に Attempt / Result / Decision / Reason。
- 「WAV が出た」は完成ではない。技術デモと作品を区別する（PROJECT_SPEC.md の完了条件）。
- 音響特徴量を品質そのものと取り違えない。Layer 1/2 は欠陥検出と比較の補助。
- 人間に聞くのは: 有料ソフト購入、大きな方向転換、候補選択、美的嗜好、将来構造に大きく影響する同程度の技術選択。細かい技術判断は自律的に決める。

## よく使うコマンド

```bash
pip install -e .[dev]                                   # 依存 (numpy scipy numba pedalboard soundfile mido pyloudnorm pyyaml matplotlib)
python -m pytest -q                                      # テスト
python -m music_agent check  songs/track_001             # 記号レベル検査のみ（数秒）
python -m music_agent render songs/track_001 --stems     # フルレンダ + 解析 + レポート
python -m music_agent render songs/track_001 --sections drop   # ドロップだけ切り出し
python -m music_agent analyze renders/track_001/<id>     # 既存レンダの再解析（解析器改善後）
python -m music_agent candidates songs/track_001 --motif a --n 5 --seed 7 --sections drop
python -m music_agent batch songs/track_001 a.yaml b.yaml --name sound_b001
python -m music_agent prefer --comparison cand_00 cand_01 --preferred cand_01 --reason melody
```

## 批評ループ 1 周の手順

1. `render` → `renders/<song>/<id>/report.md` と `overview.png` を確認。
2. Critic subagent を起動（プロンプト雛形: `critiques/CRITIC_PROMPT.md`）。出力 `critiques/<render_id>.md`。
3. Claude が仮説を選別（音楽的優先順位: 自然さ > メロディ > 和声/リズム > 音色 > 編曲 > ミックス > 独自性）。
4. YAML / パッチを変更し再 render。指標と主観の両方で比較。
5. `EXPERIMENT_LOG.md` に hypothesis / change / result / metrics / subjective / keep|reject / next を記録。
6. 聴取判断が必要な分岐は候補として人間に提示（A/B/C）。

## 聴けないことについて

Claude は音を聴けない。代わりに (a) 記号レベル（score.json / MIDI）、(b) 音響診断、(c) スペクトログラム画像を読む。
主観評価欄には「聴取なし・推定」と明記し、最終的な美的判断は人間の聴取に委ねる。
