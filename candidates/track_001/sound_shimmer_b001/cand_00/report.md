# Render report — cand_00

- song: `track_001` | key F# minor | 128 BPM | 4 sections | 43.8s
- git: `fe3d64d983` (dirty) | spec hash `865f6a25aeb406c1` | seed 1001

## Layer 1 — rule checks
- **WARN** `mix.kick_bass_overlap` Kick/bass low-band overlap 0.39 _kick,bass_
- **INFO** `melody.nonchord_strong` B4 held 1 beats on strong beat over F#m (tension) _lead@beat50_
- **INFO** `melody.nonchord_strong` B4 held 1 beats on strong beat over Dmaj7 (tension) _lead@beat58_
- **INFO** `melody.nonchord_strong` E5 held 0.5 beats on strong beat over F#m (tension) _lead@beat64_
- **INFO** `melody.nonchord_strong` B4 held 1 beats on strong beat over F#m (tension) _lead@beat66_
- **INFO** `melody.nonchord_strong` E5 held 1 beats on strong beat over Bm7 (tension) _lead@beat74_
- **INFO** `melody.nonchord_strong` E5 held 1.5 beats on strong beat over Bm7 (tension) _topline@beat73_
- **INFO** `motif.ok` Motifs repeated+transformed: ['a'] (uses: {'a': 5, 'frag': 2}) _melody_

## Layer 2 — acoustic diagnostics (not a quality score)

| metric | value |
|---|---|
| lufs_integrated | -10.68 |
| true_peak_dbtp | -1.04 |
| peak_dbfs | -1.05 |
| rms_dbfs | -12.11 |
| crest_db | 11.06 |
| side_to_mid_db | -11.56 |
| lr_correlation | 0.87 |
| master gain into limiter (dB) | 0.50 |
| limiter max gain reduction (dB) | 4.83 |

### Sections

| section | energy tgt | LUFS | centroid Hz | rolloff Hz | onsets/s | side/mid dB | side/mid >300 Hz | sub | low | lowmid | highmid | high |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| intro | 0.3 | -14.3 | 1112 | 1740 | 2.3 | -8.4 | -6.8 | 0.002 | 0.481 | 0.512 | 0.004 | 0.000 |
| build | 0.6 | -10.3 | 2114 | 4047 | 4.0 | -13.3 | -8.2 | 0.133 | 0.603 | 0.234 | 0.020 | 0.009 |
| drop | 1.0 | -8.9 | 3049 | 7564 | 4.1 | -13.2 | -4.7 | 0.475 | 0.400 | 0.109 | 0.012 | 0.003 |
| end | 0.4 | -10.7 | 3702 | 8669 | 0.0 | -6.3 | -4.1 | 0.154 | 0.310 | 0.451 | 0.073 | 0.012 |

### Section contrast
- intro → build: ΔLUFS 4.0, Δcentroid 1002 Hz, Δonsets/s 1.7, Δwidth -4.9 dB (>300 Hz: -1.3 dB)
- build → drop: ΔLUFS 1.5, Δcentroid 935 Hz, Δonsets/s 0.1, Δwidth 0.1 dB (>300 Hz: 3.5 dB)
- drop → end: ΔLUFS -1.8, Δcentroid 654 Hz, Δonsets/s -4.1, Δwidth 6.9 dB (>300 Hz: 0.6 dB)

### Loudness by bar (LUFS)

0:-18 1:-17 2:-17 3:-18 4:-13 5:-13 6:-12 7:-13 8:-9 9:-10 10:-10 11:-12 12:-9 13:-9 14:-9 15:-9 16:-9 17:-9 18:-9 19:-9 20:-10 21:-12 22:-30 23:–

### Stem diagnostics
- kick_bass: low_overlap_ratio=0.393, kick_to_bass_low_db=9.701
- lead_presence: lead_to_rest_1k5k_db=3.331, active_fraction=0.421
- low_end_stereo: side_to_mid_db=-29.205, lr_correlation=0.998

### Tonality
- declared: F# minor (rank 1); estimate: F# minor (0.86), C# minor (0.70), A major (0.68)

## Layer 3 / 4
Critic reviews go to `critiques/`, human A/B choices to `feedback/preferences.jsonl`.

![overview](overview.png)
