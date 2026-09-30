# Render report — track_001_v003

- song: `track_001` | key F# minor | 128 BPM | 4 sections | 43.8s
- git: `b5d33a4848` (dirty) | spec hash `d611639ce43c8d81` | seed 1001

## Layer 1 — rule checks
- **WARN** `range` 1 notes outside topline range G3-F5 (e.g. F#5 at beat 73.5) _topline_
- **INFO** `melody.nonchord_strong` E5 held 0.75 beats on strong beat over F#m (tension) _lead@beat56_
- **INFO** `melody.nonchord_strong` B4 held 1 beats on strong beat over Dmaj7 (tension) _topline@beat50_
- **INFO** `melody.nonchord_strong` E5 held 1 beats on strong beat over F#m (tension) _topline@beat58_
- **INFO** `melody.nonchord_strong` B4 held 1 beats on strong beat over Dmaj7 (tension) _topline@beat66_
- **INFO** `melody.nonchord_strong` E5 held 0.5 beats on strong beat over F#m (tension) _topline@beat73_
- **INFO** `melody.nonchord_strong` E5 held 1 beats on strong beat over F#m (tension) _topline@beat75_
- **INFO** `motif.ok` Motifs repeated+transformed: ['a'] (uses: {'a': 10, 'frag': 2}) _melody_

## Layer 2 — acoustic diagnostics (not a quality score)

| metric | value |
|---|---|
| lufs_integrated | -10.56 |
| true_peak_dbtp | -1.04 |
| peak_dbfs | -1.05 |
| rms_dbfs | -11.77 |
| crest_db | 10.72 |
| side_to_mid_db | -12.98 |
| lr_correlation | 0.90 |
| master gain into limiter (dB) | 2.10 |
| limiter max gain reduction (dB) | 4.47 |

### Sections

| section | energy tgt | LUFS | centroid Hz | rolloff Hz | onsets/s | side/mid dB | side/mid >300 Hz | sub | low | lowmid | highmid | high |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| intro | 0.3 | -12.5 | 861 | 1560 | 2.9 | -10.2 | -7.6 | 0.008 | 0.585 | 0.404 | 0.003 | 0.000 |
| build | 0.6 | -10.5 | 2043 | 4058 | 4.9 | -12.9 | -7.4 | 0.177 | 0.567 | 0.221 | 0.022 | 0.012 |
| drop | 1.0 | -9.2 | 2556 | 5971 | 3.3 | -16.2 | -6.5 | 0.499 | 0.412 | 0.079 | 0.009 | 0.002 |
| end | 0.4 | -10.7 | 3400 | 7772 | 0.0 | -7.4 | -5.3 | 0.140 | 0.339 | 0.415 | 0.093 | 0.012 |

### Section contrast
- intro → build: ΔLUFS 2.0, Δcentroid 1181 Hz, Δonsets/s 2.1, Δwidth -2.7 dB (>300 Hz: 0.2 dB)
- build → drop: ΔLUFS 1.2, Δcentroid 514 Hz, Δonsets/s -1.7, Δwidth -3.3 dB (>300 Hz: 0.9 dB)
- drop → end: ΔLUFS -1.5, Δcentroid 844 Hz, Δonsets/s -3.3, Δwidth 8.8 dB (>300 Hz: 1.1 dB)

### Loudness by bar (LUFS)

0:-16 1:-15 2:-15 3:-15 4:-12 5:-12 6:-10 7:-10 8:-11 9:-10 10:-10 11:-11 12:-9 13:-9 14:-9 15:-9 16:-9 17:-9 18:-9 19:-9 20:-10 21:-11 22:-30 23:–

### Stem diagnostics
- kick_bass: low_overlap_ratio=0.342, kick_to_bass_low_db=7.973
- lead_presence: lead_to_rest_1k5k_db=3.179, active_fraction=0.416
- low_end_stereo: side_to_mid_db=-32.746, lr_correlation=0.999

### Tonality
- declared: F# minor (rank 1); estimate: F# minor (0.79), C# minor (0.72), A major (0.64)

## Layer 3 / 4
Critic reviews go to `critiques/`, human A/B choices to `feedback/preferences.jsonl`.

![overview](overview.png)
