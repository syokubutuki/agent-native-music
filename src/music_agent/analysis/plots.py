"""Diagnostic plots (PNG) so agents without ears can *see* the render:
spectrogram with section boundaries, per-bar loudness, band share per section,
and a piano-roll of the score."""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from scipy.signal import stft  # noqa: E402

from ..score import Score  # noqa: E402
from .features import BANDS  # noqa: E402


def _section_lines(ax, score: Score, spb: float):
    for s in score.sections:
        ax.axvline(s.start_beat * spb, color="w", lw=0.8, ls="--", alpha=0.8)
        ax.text(s.start_beat * spb + 0.2, 0.97, s.name, transform=ax.get_xaxis_transform(), color="w",
                fontsize=8, va="top", bbox=dict(fc="k", alpha=0.4, lw=0))


def overview(x: np.ndarray, sr: int, score: Score, analysis: dict, path: Path) -> Path:
    spb = score.sec_per_beat()
    fig, axes = plt.subplots(4, 1, figsize=(13, 13), gridspec_kw={"height_ratios": [3, 2.2, 1.2, 1.4]})
    # spectrogram (log frequency)
    mono = x.mean(axis=0)
    f, t, Z = stft(mono, sr, nperseg=4096, noverlap=4096 - 1024)
    S = 20 * np.log10(np.abs(Z) + 1e-9)
    ax = axes[0]
    # resample onto a log-frequency grid and draw as an image (fast)
    fl = np.geomspace(30, sr / 2, 256)
    Sl = np.stack([np.interp(fl, f, S[:, j]) for j in range(S.shape[1])], axis=1)
    ax.imshow(Sl, origin="lower", aspect="auto", cmap="magma", vmin=S.max() - 90, vmax=S.max(),
              extent=[t[0], t[-1], 0, len(fl)])
    ticks = [50, 100, 200, 500, 1000, 2000, 5000, 10000]
    ax.set_yticks([np.searchsorted(fl, v) for v in ticks], [f"{v:g}" for v in ticks])
    ax.set_ylabel("Hz")
    ax.set_title(f"{score.song_id} — spectrogram")
    _section_lines(ax, score, spb)
    # piano roll
    ax = axes[1]
    colors = plt.cm.tab20(np.linspace(0, 1, max(2, len(score.tracks))))
    for i, tr in enumerate(score.tracks):
        if tr.kind in ("drums", "fx"):
            continue
        for n in tr.notes:
            ax.add_patch(plt.Rectangle((n.start * spb, n.pitch - 0.4), n.dur * spb, 0.8, color=colors[i],
                                       alpha=0.35 + 0.6 * n.vel, lw=0))
        ax.plot([], [], color=colors[i], label=tr.name, lw=6)
    pitches = [n.pitch for tr in score.tracks if tr.kind not in ("drums", "fx") for n in tr.notes]
    if pitches:
        ax.set_ylim(min(pitches) - 2, max(pitches) + 2)
    ax.set_xlim(0, x.shape[1] / sr)
    for s in score.sections:
        ax.axvline(s.start_beat * spb, color="k", lw=0.8, ls="--")
    for c in score.chords:
        ax.text(c.start * spb, 1.01, c.symbol, transform=ax.get_xaxis_transform(), fontsize=6.5, rotation=0)
    ax.set_ylabel("MIDI pitch")
    ax.legend(loc="upper left", fontsize=7, ncol=6)
    # loudness per bar
    ax = axes[2]
    bars = analysis["bars"]
    bl = [b["lufs"] if b["lufs"] is not None else np.nan for b in bars]
    ax.bar([b["bar"] for b in bars], np.array(bl) + 40, color="tab:blue", bottom=-40)
    ax.set_ylim(-40, 0)
    ax.set_ylabel("LUFS / bar")
    ax.set_xlabel("bar")
    for s in score.sections:
        ax.axvline(s.start_bar - 0.5, color="k", lw=0.8, ls="--")
    # band share per section
    ax = axes[3]
    secs = analysis["sections"]
    bottom = np.zeros(len(secs))
    for bi, b in enumerate(BANDS):
        vals = np.array([s.get("band_share", {}).get(b, 0) for s in secs])
        ax.bar([s["name"] for s in secs], vals, bottom=bottom, label=b)
        bottom += vals
    ax.set_ylabel("band energy share")
    ax.legend(fontsize=7, ncol=5)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=80)
    plt.close(fig)
    return path
