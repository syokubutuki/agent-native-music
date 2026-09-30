# AGENTS.md — Codex（実装・実験・検証担当）向けガイド

あなた（Codex）はこのプロジェクトの **実装・実験・検証担当** です。
設計判断・音楽判断は Claude Code（主任設計者/音楽監督）が行い、タスクは `tasks/codex/T-xxx-*.md` で渡されます。

## タスク仕様の形式（必ずこの 7 項目）

```markdown
# T-xxx <タイトル>
- 目的:        何のために（音楽的・システム的な理由）
- 背景:        関連ファイル、既存の設計、過去の失敗
- 入力:        読むファイル / データ / 仕様
- 出力:        作る・変更するファイル、CLI、フォーマット
- 制約:        守るべき設計原則（下記）、性能、依存追加の可否
- 完了条件:    具体的・検証可能な条件
- テスト方法:  pytest のケース、実行コマンド、期待値
- 状態:        open | in-progress | done (executed by: codex|claude, commit: ...)
```

仕様が曖昧なら、実装前に仮定を task ファイル末尾に追記してから進めること。

## 設計原則（違反する変更はレビューで差し戻されます）

1. **音楽内容をコードに書かない。** 音符・コード・パターン・音色値は `songs/` と `instruments/` の YAML に置く。
   エンジンは汎用機能（新しい op、新しいパターン記号、新しいエフェクト型）として追加する。
2. **決定論。** 乱数は `composition.realize.stable_seed(...)` から作った `np.random.default_rng` のみ。
   Python の `hash()`・時刻・グローバル乱数は禁止。同じ spec + commit → ビット一致の WAV（テストあり）。
3. **プロバナンス。** 新しい入力ファイル（パッチ、IR、プリセット）を使うなら manifest の `source_files` に入るようにする。
4. **CLI から完結。** GUI 操作・手作業前提の機能は作らない。VST は preset / raw_state / parameter ID / MIDI で制御する。
5. **クロスプラットフォーム（Windows 本番）。** `pathlib`、UTF-8 明示、シェル依存なし。ffmpeg は任意機能扱い。
6. **CPU 前提。** GPU・巨大モデルを中核にしない。40 秒の曲のフルレンダは 1 分以内を目安に保つ。
7. **依存追加は理由を書く。** `DECISIONS.md` に 必要性 / 代替 / 自動操作性 / ライセンス / Windows / CPU / 再現性。

## コード規約

- Python ≥ 3.10、型ヒント、`from __future__ import annotations`。
- ステレオ信号は `(2, n)` の float64 numpy 配列。サンプル単位ループは numba (`@njit(cache=True)`) で。
- 新しい YAML キーはモジュール docstring にスキーマ例を書く（LLM が読んで編集できるように）。
- エラーメッセージは「何が悪く、どう直すか」を書く（例: `widen the range or reduce voices`）。

## 検証

```bash
pip install -e .[dev]
python -m pytest -q
python -m music_agent render songs/test_minimal --no-preview   # スモーク（数秒）
```

音声に影響する変更では、`songs/track_001` を render して `report.md` の Layer 1 に新たな error がないこと、
LUFS / true peak が目標内であることを確認し、差分をタスクファイルに記録すること。
「エラーなく動いた」は完了ではない — 完了条件を満たしたことを示すこと。

## やってはいけないこと

- `songs/*/` の音楽内容（メロディ・和声・構成）を独断で変える（タスクで指示された場合を除く）。
- テストを消す・skip して通す。
- `renders/` の WAV を手で編集・差し替える。
