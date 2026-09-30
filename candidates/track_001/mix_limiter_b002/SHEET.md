# Candidate batch — mix_limiter_b002

song: `songs/track_001`  crop: full

Listen to each `cand_XX/mix.mp3`, then record a choice, e.g.:

```
python -m music_agent prefer --comparison cand_00 cand_01 --preferred cand_01 --reason melody --context batch=mix_limiter_b002
```

| id | description | L1 errors | L1 warns | LUFS |
|---|---|---|---|---|
| cand_00 |  | 0 | 1 | -10.6 |
| cand_01 |  | 0 | 2 | -10.6 |
