# T-017 音声素材の再生（環境音）と VOICEVOX 声トラック

## 目的
楽曲に (1) 実録音の環境音（CC0 等のライセンス付き素材）と (2) VOICEVOX で生成した歌声・セリフを、
YAML 記述だけで時間位置に置けるようにする。人間のフィードバック（track_002: 「声がない」「実際の環境音を拾ってきて適切に加えた方が場面が想像される」）への対応。

## 背景・設計判断
- **音声ファイルも Score の Note として扱う**（Score が唯一の共通ソースという原則を維持）。
  Note.params に `file / offset / fade_in / fade_out / gain_db / rate` を持たせ、新しいパッチ型 `type: sample` が再生する。
  MIDI には書き出さない（params は MIDI で表現できず、ノート 60 の羅列は誤解を招く）。
- **素材は `assets/` に置き、ライセンスとクレジットを `assets/**/sources.yaml` で機械可読に管理**する。
  ファイルは FLAC（可逆）でコミット（数 MB 規模）。manifest の source_files に素材ファイルの hash も記録する。
- **VOICEVOX は render 時に呼ばない。** 別コマンド `music_agent voice` が VOICEVOX エンジン（HTTP, 既定 127.0.0.1:50021）に
  問い合わせて `songs/<id>/voice/<clip>.wav` と `<clip>.json`（メタ: 種別、話者、要求 hash、エンジン版、配置位置、頭出しオフセット）を生成し、
  これをコミットする。render はキャッシュ済み WAV を `type: sample` で鳴らすだけ → VOICEVOX の無い環境でも再現可能。
  要求 hash が同じならスキップ（`--force` で再生成）。
- 歌（sing）は **melody パートの実現済みノート（humanize 前）** から VOICEVOX の楽譜（frame 単位, 93.75 fps）を作る。
  旋律を二重管理しない。歌詞は空白区切りで 1 ノート 1 モーラ（拍）。数が合わなければエラー。
  ノート間の隙間は休符、先頭・末尾に休符（既定 0.5 s）。frame は累積時刻から丸めてドリフトを防ぐ。
  配置は「最初のノートの拍 − 先頭休符長」から再生（子音は VOICEVOX が拍の前に置くので母音が拍に乗る）。
- セリフ（talk）は `at`（発話開始の拍位置）に置く。`prePhonemeLength` 分だけ前から再生。
- 生成前（WAV が無い）でも render は止めない: そのクリップを飛ばし警告を出す。
- 却下案: (a) render 時に VOICEVOX を叩く → エンジン依存で再現性が壊れる。(b) 歌の旋律を voice.yaml に別記 → 旋律の二重管理。

## 変更対象
- `src/music_agent/spec.py`: `resolve_asset(path, song_dir)`（曲ディレクトリ → プロジェクトルートの順）。
- `src/music_agent/composition/realize.py`: content type `audio`（events: at, file, offset, beats|until|省略=ファイル末尾まで, fade_in, fade_out, gain_db, vel, rate）と
  `voice`（clips: [名前]、`songs/<id>/voice/<名前>.json` を読む）。
- `src/music_agent/rendering/instruments.py`: パッチ型 `sample`（読み込み・モノ→ステレオ・リサンプル・オフセット・フェード・ゲイン）。
- `src/music_agent/voice/voicevox.py`（新規）: 楽譜変換（純関数）、HTTP クライアント、生成とキャッシュ。
- `src/music_agent/cli.py`: `voice` サブコマンド（`--clip`, `--force`, `--url`）。
- `src/music_agent/rendering/pipeline.py`: 素材ファイルを manifest に含める。
- `src/music_agent/midi/io.py`: kind `audio` / `voice` のトラックは書き出さない。
- `src/music_agent/analysis/features.py`: 調推定の「音程のあるステム」から `audio` / `voice` を除外。
- `instruments/fx/sample_player.yaml`: `type: sample`。
- `tests/test_audio_voice.py`（新規）。

## 制約
- 既存の曲（track_001, test_minimal）の出力を変えない。
- 乱数を使わない（sample 再生は決定論的）。

## 受け入れ条件
- [ ] audio イベントが指定拍に、指定オフセット・長さ・フェードで鳴る（テストでサンプル位置を検証）。
- [ ] 異なるサンプルレートの素材がリサンプルされる。
- [ ] sing 変換: frame 長の総和 = 丸めた総時間、隙間に休符、歌詞数不一致でエラー。
- [ ] voice メタ JSON から正しい拍位置にノートが作られ、WAV が無いクリップは飛ばされる。
- [ ] スタブ HTTP サーバに対して `voice` 生成が WAV と JSON を書き、2 回目はキャッシュでスキップ。
- [ ] manifest に素材ファイルの hash が入る。

## 検証コマンド（すべて成功させること）
```
python -m pytest -q
python -m music_agent render songs/test_minimal --no-preview
python -m music_agent render songs/track_002 --no-preview
```

## 結果
- executed by: claude（Codex はこのクラウド環境で使用不可, D-010）
- 検証: `python -m pytest -q` 54 passed（新規 `tests/test_audio_voice.py` 7 件: 配置・オフセット・長さ・リサンプル・MIDI 除外・歌の frame 変換・スタブ HTTP での生成/キャッシュ/stale 検出・エンジン不達）。
  `render songs/test_minimal` 既存どおり（既知の意図的 warn 1 件のみ）、`render songs/track_002` → v008（error/warn 0、manifest に素材 7 件の hash）。
- 未検証: 実際の VOICEVOX エンジンでの生成（このセッションでは実行が権限で止められた, D-012）。API の形は VOICEVOX 0.25.2 の
  `/sing_frame_audio_query` → `/frame_synthesis`、`/audio_query` → `/synthesis` に合わせてある。
