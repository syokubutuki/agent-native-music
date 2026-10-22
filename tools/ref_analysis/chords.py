"""Per-window chord template matching + bass-note estimate for a time range.
python chords.py <wav> <t0> <t1> [--win 0.5] [--bass]
"""
import sys
import numpy as np
import librosa
import soundfile as sf

NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
TEMPL = {
    "": [0, 4, 7], "m": [0, 3, 7], "maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10], "7": [0, 4, 7, 10],
    "sus4": [0, 5, 7], "sus2": [0, 2, 7], "add9": [0, 2, 4, 7], "m9": [0, 2, 3, 7, 10], "dim": [0, 3, 6],
    "mM7": [0, 3, 7, 11], "6": [0, 4, 7, 9], "m6": [0, 3, 7, 9],
}


def templates():
    out = []
    for root in range(12):
        for name, iv in TEMPL.items():
            v = np.zeros(12)
            for i in iv:
                v[(root + i) % 12] = 1.0
            v[root] += 0.3  # weight root slightly
            out.append((f"{NOTES[root]}{name}", v / np.linalg.norm(v)))
    return out


def main():
    a = sys.argv
    wav, t0, t1 = a[1], float(a[2]), float(a[3])
    win = float(a[a.index("--win") + 1]) if "--win" in a else 0.5
    x, sr = sf.read(wav, always_2d=True, dtype="float32")
    seg = x[int(t0 * sr):int(t1 * sr)].mean(axis=1)
    y = librosa.resample(seg, orig_sr=sr, target_sr=22050)
    sr = 22050
    h = librosa.effects.harmonic(y, margin=3.0)
    hop = 512
    C = librosa.feature.chroma_cqt(y=h, sr=sr, hop_length=hop, bins_per_octave=36)
    # bass chroma: CQT limited to 40-200 Hz
    cq = np.abs(librosa.cqt(h, sr=sr, hop_length=hop, fmin=librosa.note_to_hz("E1"), n_bins=36, bins_per_octave=12))
    n = min(C.shape[1], cq.shape[1]); C, cq = C[:, :n], cq[:, :n]
    T = templates()
    t = librosa.frames_to_time(np.arange(C.shape[1]), sr=sr, hop_length=hop) + t0
    for s in np.arange(t0, t1, win):
        m = (t >= s) & (t < s + win)
        if not m.any():
            continue
        c = C[:, m].mean(axis=1)
        c = c / (np.linalg.norm(c) + 1e-9)
        scores = sorted(((float(c @ v), n) for n, v in T), reverse=True)[:3]
        b = cq[:, m].mean(axis=1)
        bass = librosa.midi_to_note(int(librosa.note_to_midi("E1")) + int(b.argmax()))
        strong = [NOTES[i] for i in np.argsort(c)[::-1][:4]]
        print(f"{s:7.2f}  bass={bass:4s}  top={strong}  chords={[(n, round(v, 2)) for v, n in scores]}")


if __name__ == "__main__":
    main()
