"""Scan a whole track for sustained lead/vocal tones and describe each:
note, length, stability, preceding interval, stereo width, and tail (reverb) after release.
python longtones.py <wav> <out.json> [--min 0.7]
"""
import sys, json, numpy as np, librosa, soundfile as sf
a = sys.argv; wav, outp = a[1], a[2]
mn = float(a[a.index("--min") + 1]) if "--min" in a else 0.7
x, sr = sf.read(wav, always_2d=True, dtype="float32")
L, R = x[:, 0], x[:, -1]
mid = (L + R) / 2
m = librosa.resample(mid, orig_sr=sr, target_sr=22050); SR = 22050
h = librosa.effects.harmonic(m, margin=4.0)
hop = 256
f0, vf, vp = librosa.pyin(h, fmin=100, fmax=1400, sr=SR, frame_length=2048, hop_length=hop)
t = librosa.frames_to_time(np.arange(len(f0)), sr=SR, hop_length=hop)
rms = librosa.feature.rms(y=m, frame_length=2048, hop_length=hop)[0]
rdb = 20 * np.log10(np.maximum(rms, 1e-9))
# width per frame at 44.1k
hop44 = int(hop * sr / SR)
def width_at(ti):
    i = int(ti * sr); s = (L[i:i+4096] - R[i:i+4096]) / 2; mm = (L[i:i+4096] + R[i:i+4096]) / 2
    return float(np.sqrt((s**2).mean() + 1e-12) / np.sqrt((mm**2).mean() + 1e-12))
midi = librosa.hz_to_midi(f0)
notes = []; cur = None; last_note = None
for i, (ti, mi, pi) in enumerate(zip(t, midi, vp)):
    ok = (not np.isnan(mi)) and pi > 0.3
    if ok and cur and abs(mi - cur["med"]) < 1.2:
        cur["v"].append(mi); cur["i1"] = i; cur["med"] = float(np.median(cur["v"]))
    else:
        if cur:
            cur["len"] = t[cur["i1"]] - t[cur["i0"]]
            if cur["len"] >= 0.25:
                last = notes[-1] if notes else None
                notes.append(cur)
        cur = dict(i0=i, i1=i, v=[mi], med=float(mi)) if ok else None
res = []
for k, n in enumerate(notes):
    if n["len"] < mn: continue
    i0, i1 = n["i0"], n["i1"]
    prev = notes[k-1] if k else None
    def rms_at(sec):
        j = min(len(rdb) - 1, i1 + int(sec * SR / hop)); return float(rdb[j])
    res.append(dict(t0=round(float(t[i0]), 2), t1=round(float(t[i1]), 2), len=round(float(n["len"]), 2),
                    note=librosa.midi_to_note(int(round(n["med"]))), midi=round(n["med"], 1),
                    sd_cents=round(float(np.std(n["v"]) * 100), 0),
                    prev_note=(librosa.midi_to_note(int(round(prev["med"]))) if prev else None),
                    leap_semitones=(round(n["med"] - prev["med"], 1) if prev else None),
                    gap_before=(round(float(t[i0] - t[prev["i1"]]), 2) if prev else None),
                    width=round(width_at(t[i0] + n["len"] / 2), 2),
                    rms_end=round(float(rdb[i1]), 1), tail_0p5=round(rms_at(0.5), 1), tail_1p0=round(rms_at(1.0), 1), tail_2p0=round(rms_at(2.0), 1)))
json.dump(res, open(outp, "w"), indent=1)
for r in res: print(r)
