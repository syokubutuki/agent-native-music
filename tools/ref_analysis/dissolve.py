"""Timing-dissolution profile: per-window onset regularity vs a fixed grid.
python dissolve.py <wav> <t0> <t1> <bpm> [--win 2]
"""
import sys, numpy as np, librosa, soundfile as sf
a = sys.argv; wav, t0, t1, bpm = a[1], float(a[2]), float(a[3]), float(a[4])
win = float(a[a.index("--win") + 1]) if "--win" in a else 2.0
x, sr = sf.read(wav, always_2d=True, dtype="float32")
seg = librosa.resample(x[int(t0*sr):int(t1*sr)].mean(axis=1), orig_sr=sr, target_sr=22050); sr = 22050
hop = 128
S = np.abs(librosa.stft(seg, n_fft=2048, hop_length=hop))
oenv = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S), sr=sr)
on = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=hop)
ot = t0 + librosa.frames_to_time(on, sr=sr, hop_length=hop); ost = oenv[on]
cent = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
flat = librosa.feature.spectral_flatness(S=S)[0]
tf = t0 + librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)
sub = 60.0 / bpm / 4
# estimate grid phase on whole segment
best, off = -1, 0
for o in np.linspace(0, sub, 24, endpoint=False):
    d = (ot - t0 - o) % sub; d = np.minimum(d, sub - d) / sub
    v = (d < 0.15).mean() if len(d) else 0
    if v > best: best, off = v, o
print(f"grid 16th={sub*1000:.1f}ms  phase={off*1000:.1f}ms  on-grid frac={best:.2f}")
print("  t     n  ioi_cv  grid_dev  strong  cent_mean cent_sd  flat")
for s in np.arange(t0, t1, win):
    m = (ot >= s) & (ot < s + win); mf = (tf >= s) & (tf < s + win)
    o = ot[m]; d = (o - t0 - off) % sub; d = np.minimum(d, sub - d) / sub
    ioi = np.diff(o)
    print(f"{s:6.1f} {m.sum():3d}  {ioi.std()/ioi.mean() if len(ioi)>2 else float('nan'):5.2f}   {d.mean() if len(d) else float('nan'):5.2f}    {int((ost[m]>3).sum()):3d}    {cent[mf].mean():6.0f}  {cent[mf].std():6.0f}  {flat[mf].mean():.3f}")
