"""Synthesis, mixing, analysis and full-pipeline tests (audio level)."""
import json

import numpy as np
import pytest
import soundfile as sf

from music_agent.analysis.features import analyze, key_estimate
from music_agent.mixing.automation import curve_array, duck_envelope
from music_agent.mixing.effects import make_reverb_ir, note_value_to_sec
from music_agent.synthesis.dsp import limiter, osc, svf, true_peak_db
from music_agent.synthesis.drums import render_hit
from music_agent.synthesis.subtractive import adsr, render_note

SR = 44100


def test_saw_is_bandlimited_and_pitched():
    f = np.full(SR, 440.0)
    x = osc("saw", f, SR)
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    assert abs(freqs[np.argmax(spec)] - 440) < 2
    # aliasing: energy between harmonics well below the harmonic peaks
    assert np.max(np.abs(x)) < 1.2


def test_svf_lowpass_attenuates_highs():
    rng = np.random.default_rng(0)
    x = rng.uniform(-1, 1, SR)
    y = svf(x, 500.0, SR, "lowpass", slope=24)
    X, Y = np.abs(np.fft.rfft(x)), np.abs(np.fft.rfft(y))
    fr = np.fft.rfftfreq(SR, 1 / SR)
    hi = fr > 5000
    assert Y[hi].mean() < X[hi].mean() * 0.01


def test_adsr_shape():
    e = adsr(SR, SR // 2, SR, 0.01, 0.1, 0.5, 0.2)
    assert e[0] == 0 and abs(e.max() - 1) < 0.02
    assert abs(e[SR // 2 - 1] - 0.5) < 0.02
    assert e[-1] < 0.01


def test_render_note_is_deterministic():
    patch = {"oscillators": [{"wave": "saw", "unison": 5, "detune": 0.2}, {"wave": "noise", "level": 0.1}],
             "filter": {"cutoff": 2000, "env_amount": 2}}
    a = render_note(patch, 69, 0.5, 0.8, SR, np.random.default_rng(5))
    b = render_note(patch, 69, 0.5, 0.8, SR, np.random.default_rng(5))
    assert a.shape[0] == 2 and np.array_equal(a, b)
    assert np.max(np.abs(a)) > 0.05


@pytest.mark.parametrize("model", ["kick", "clap", "snare", "hat", "crash", "riser", "impact", "reverse_crash", "downlifter"])
def test_drum_models_render(model):
    x = render_hit({"model": model}, 0.9, SR, np.random.default_rng(1), 1.0)
    assert x.shape[0] == 2 and x.shape[1] > 100
    assert np.all(np.isfinite(x)) and np.max(np.abs(x)) > 1e-3


def test_limiter_respects_ceiling():
    t = np.arange(SR) / SR
    x = np.stack([np.sin(2 * np.pi * 100 * t) * 3, np.sin(2 * np.pi * 150 * t) * 2.5])
    y, g = limiter(x, SR, -1.0)
    assert true_peak_db(y) <= -0.9
    assert g.min() < 0.5


def test_duck_envelope_and_curves():
    g = duck_envelope([0.5, 1.0], SR * 2, SR, 0.8, 0.3)
    assert abs(g[int(0.5 * SR)] - 0.2) < 0.02 and g[int(0.45 * SR)] == 1.0
    c = curve_array([(0, 100.0), (4, 1600.0)], "exp", SR * 2, SR, 0.5)
    assert abs(c[SR] - 400) < 5  # geometric midpoint at 2 beats
    step = curve_array([(0, 1.0), (2, 1.0), (2, 5.0)], "linear", 2 * SR, SR, 0.5)
    assert step[SR - 10] == 1.0 and step[SR + 10] == 5.0  # instant jump at beat 2


def test_reverb_ir_and_note_values():
    ir = make_reverb_ir(SR, 2.0, seed=3)
    assert ir.shape[0] == 2 and np.isfinite(ir).all()
    assert np.array_equal(ir, make_reverb_ir(SR, 2.0, seed=3))
    assert abs(note_value_to_sec("3/16", 120) - 0.375) < 1e-9
    assert abs(note_value_to_sec("1/8.", 120) - 0.375) < 1e-9


def test_key_estimate_from_profile():
    # chroma of an A-minor triad-heavy signal
    ch = np.zeros(12)
    ch[[9, 0, 4]] = [1.0, 0.7, 0.8]
    ch[[2, 7, 11, 5]] = 0.3
    top = key_estimate(ch)[0][0]
    assert top in ("A minor", "C major")


def test_full_pipeline_render(tmp_path):
    from music_agent.rendering.pipeline import render_song
    from music_agent.spec import PROJECT_ROOT

    res = render_song(PROJECT_ROOT / "songs/test_minimal", out_root=tmp_path, render_id="t1", preview=False, quiet=True)
    for f in ("mix.wav", "song.mid", "score.json", "manifest.json", "analysis.json", "report.md", "resolved_spec.yaml"):
        assert (res.out_dir / f).exists(), f
    x, sr = sf.read(res.wav)
    assert sr == 44100 and x.shape[1] == 2
    g = res.analysis["global"]
    assert g["clipped_samples"] == 0 and g["true_peak_dbtp"] <= -0.9
    assert abs(g["lufs_integrated"] - (-11.0)) < 0.6
    assert not [f for f in res.findings if f["level"] == "error"]
    man = json.loads((res.out_dir / "manifest.json").read_text())
    assert man["seed"] == 7 and "songs/test_minimal/song.yaml" in man["source_files"]
    assert "instruments/keys/glass_pluck.yaml" in man["source_files"]
    # reproducibility: identical audio on re-render
    res2 = render_song(PROJECT_ROOT / "songs/test_minimal", out_root=tmp_path, render_id="t2", preview=False, quiet=True)
    y, _ = sf.read(res2.wav)
    assert np.array_equal(x, y)
