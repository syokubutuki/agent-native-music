# Render report — cand_01

- song: `track_001` | key F# minor | 128 BPM | 1 sections | 15.0s
- git: `7d65286cd7` (dirty) | spec hash `59d9ae4ad6ff89ff` | seed 1001

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
| lufs_integrated | -9.23 |
| true_peak_dbtp | -1.04 |
| peak_dbfs | -1.05 |
| rms_dbfs | -9.42 |
| crest_db | 8.37 |
| side_to_mid_db | -16.21 |
| lr_correlation | 0.95 |
| master gain into limiter (dB) | 2.11 |
| limiter max gain reduction (dB) | 4.48 |

### Sections

| section | energy tgt | LUFS | centroid Hz | rolloff Hz | onsets/s | side/mid dB | side/mid >300 Hz | sub | low | lowmid | highmid | high |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| drop | 1.0 | -9.2 | 2549 | 5947 | 3.3 | -16.2 | -6.5 | 0.498 | 0.413 | 0.079 | 0.008 | 0.002 |

### Section contrast

### Loudness by bar (LUFS)

0:-9 1:-9 2:-9 3:-9 4:-9 5:-9 6:-9 7:-9

### Tonality
- declared: F# minor (rank 3); estimate: A major (0.67), C# minor (0.59), F# minor (0.58)

## Layer 3 / 4
Critic reviews go to `critiques/`, human A/B choices to `feedback/preferences.jsonl`.

![overview](overview.png)
