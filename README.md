# agent-native-music

エージェントが **作曲 → 編曲 → 音色設計 → レンダリング → 音響解析 → 音楽的批評 → 改良** を反復できる、
人間向け DAW を中心に据えない音楽制作環境。人間は音楽ディレクター（方向性と候補選択）に集中する。

- 仕様: [PROJECT_SPEC.md](PROJECT_SPEC.md) / 構造: [ARCHITECTURE.md](ARCHITECTURE.md) / 音楽方針: [MUSIC_SPEC.md](MUSIC_SPEC.md)
- 評価: [EVALUATION.md](EVALUATION.md) / 実験: [EXPERIMENT_LOG.md](EXPERIMENT_LOG.md) / 技術判断: [DECISIONS.md](DECISIONS.md)
- 役割: [CLAUDE.md](CLAUDE.md)（設計・音楽監督・批評）/ [AGENTS.md](AGENTS.md)（Codex: 実装・実験・検証）/ [tasks/codex/](tasks/codex/)

## セットアップ

Windows（本番想定）:
```powershell
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
# 任意: mp3 プレビュー用に ffmpeg を PATH に（winget install Gyan.FFmpeg）
python -m pytest -q
```
macOS / Linux: 同様（`python3 -m venv .venv && . .venv/bin/activate`）。

## 使い方

```bash
# 楽曲 YAML を検査（記号レベル、数秒）
python -m music_agent check songs/track_001

# レンダ: spec → MIDI → 合成 → ミックス → WAV/MP3 → 解析 → report.md
python -m music_agent render songs/track_001 --stems
#   → renders/track_001/track_001_vNNN/{mix.wav, mix.mp3, song.mid, report.md, overview.png, manifest.json, ...}

# 変更案（overlay）を当てて比較用にレンダ
python -m music_agent render songs/track_001 --overlay songs/track_001/overlays/topline_audition.yaml --label topline

# メロディ候補（motif 変奏）を生成して drop だけレンダ → candidates/.../SHEET.md
python -m music_agent candidates songs/track_001 --motif a --n 5 --seed 7 --sections drop

# 人間の選択を記録（将来の嗜好学習用）
python -m music_agent prefer --comparison cand_00 cand_02 cand_04 --preferred cand_02 --reason melody --note "もっと透明感"
```

## 楽曲の書き方（抜粋）

```yaml
# melody.yaml — 度数(F# minor: 1=F# … 7=E, 8=F#↑, 7#=E#) : 長さ(16分)
melody:
  motifs:
    a: "7:3 5:3 3:4 4:2 5:4"
  parts:
    lead:
      base: F#4
      sections:
        drop:
          - {bar: 0, motif: a}
          - {bar: 1, motif: a, ops: [{transpose: -1, keep: [0]}]}   # アンカー保持の下降系列
# arrangement.yaml — 1 文字列 = 1 小節
    kick: {instrument: drums/kick_main, content: {type: drums, patterns: {drop: "x...x...x...x..."}}}
```

## 現在の成果物

- `songs/track_001` — ベンチマーク作品（F# minor, 128 BPM, 約 42 秒, Intro→Build→Drop→End）。
- 最新レンダと批評は [EXPERIMENT_LOG.md](EXPERIMENT_LOG.md) を参照（各 `renders/track_001/*/mix.mp3` で試聴可能）。

WAV は git 管理外（manifest.json の commit・hash・seed から `render` で再生成できる）。
