# Candidate batch — melody_motif_a_b001

song: `songs/track_001`  crop: ['drop']

Listen to each `cand_XX/mix.mp3`, then record a choice, e.g.:

```
python -m music_agent prefer --comparison cand_00 cand_01 cand_02 cand_03 cand_04 --preferred cand_01 --reason melody --context batch=melody_motif_a_b001
```

| id | description | L1 errors | L1 warns | LUFS |
|---|---|---|---|---|
| cand_00 | motif=7:3 5:3 3:4 4:2 5:4; ops=original | 0 | 1 | -9.2 |
| cand_01 | motif=7:3 5:3 3:4 3:2 3:4; ops=contour+neighbor[4] | 0 | 1 | -9.2 |
| cand_02 | motif=7:6 5:2 3:3 4:3 5:2; ops=rhythm(6 2 3 3 2) | 0 | 1 | -9.2 |
| cand_03 | motif=7:3 5:3 3:3 4:3 5:4; ops=rhythm(4 2 2 4 4)+rhythm(3 3 3 3 4) | 0 | 1 | -9.2 |
| cand_04 | motif=7:2 5:4 3:2 4:4 3:4; ops=rhythm(2 4 2 4 4)+tail | 0 | 1 | -9.2 |
