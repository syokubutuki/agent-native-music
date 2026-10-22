# tools/ref_analysis — 参照曲の音響解析（嗜好研究用）

`research/preference_principles_v1.md` の数値はここで計測した。音楽内容は一切ハードコードしない計測ツール。
対象音源はリポジトリに含めない（各自で取得して任意のディレクトリに置く）。

```bash
pip install librosa matplotlib soundfile          # 本体の依存に加えて
export OMP_NUM_THREADS=1 NUMBA_NUM_THREADS=1       # 並列にすると librosa/numba が落ちることがある

# 1) 曲全体の概観: features.npz / summary.json / overview.png（RMS, centroid, onset, 帯域比, 幅/相関, H/P, スペクトログラム）
python tools/ref_analysis/ref_analyze.py overview path/to/song.wav out/song --name song

# 2) 区間の精密解析（hop 5.8 ms）: seg_<t0>-<t1>.json / .png。--bpm を与えると 16 分グリッドからの乖離も出す
python tools/ref_analysis/ref_analyze.py segment path/to/song.wav out/song 86 96 --name song --bpm 123

# 3) 窓ごとのコード推定（クロマ→テンプレート照合）とベース音。ミックス全体からの推定なので「目安」
python tools/ref_analysis/chords.py path/to/song.wav 84 120 --win 1.0

# 4) 崩壊プロファイル: 窓ごとの onset 数 / IOI 変動係数 / グリッド乖離 / centroid 分散 / flatness
python tools/ref_analysis/dissolve.py path/to/song.wav 70 92 123 --win 1

# 5) 長音スキャン: 曲全体から持続音（既定 ≥ 0.7 s）を抽出し、直前音からの跳躍・幅・残響テールを記録
python tools/ref_analysis/longtones.py path/to/song.wav out/song/longtones.json --min 0.6
```

既知の制約
- `librosa.beat.beat_track`（numba）がこの環境の numpy で segfault するため、テンポは tempogram から推定し、ビート位相は固定グリッドの最良位相で代用。
- pyin はミックス全体の harmonic 成分に対して走らせるので、ボーカルがベース・パッドに負ける曲では声を追えない（Grief, 愛しているんだ で失敗）。
  声ステムがある自作曲ではそのまま使える。
- `segment` の `rows` は 0.5 s 窓の平均。JSON には onset 時刻リストも入る（リポジトリ保存版では削除済み）。

将来は `python -m music_agent reference ...` として本体に統合する（`tasks/codex/` T-017 候補）。
