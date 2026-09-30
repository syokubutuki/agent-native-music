"""End-to-end render: spec -> score -> MIDI -> stems -> mix -> WAV -> analysis -> report.

Output directory (renders/<song_id>/<render_id>/):
    mix.wav            24-bit master
    mix.mp3            listening preview (if ffmpeg is available)
    song.mid           the exact notes that were rendered
    score.json         realised score (IR)
    resolved_spec.yaml fully merged spec (includes + overlays)
    manifest.json      provenance (git commit, file hashes, seed, lib versions, command)
    analysis.json      Layer 2 diagnostics
    findings.json      Layer 1 rule results
    report.md          human/agent readable summary
    overview.png       spectrogram + piano roll + loudness + band shares
    stems/*.wav        optional post-fader stems (--stems)
"""
from __future__ import annotations

import copy
import json
import shutil
import subprocess
import time
from dataclasses import dataclass, field, replace
from pathlib import Path

import numpy as np
import soundfile as sf
import yaml

from ..analysis.features import analyze
from ..analysis.plots import overview
from ..analysis.report import write_report
from ..composition.realize import realize
from ..evaluation.rules import audio_checks, summarize, symbolic_checks
from ..midi.io import write_midi
from ..mixing.mixer import mix
from ..score import Score
from ..provenance import manifest, next_render_id
from ..spec import PROJECT_ROOT, load_song
from .instruments import render_track


def crop_score(score: Score, secs: list) -> Score:
    """View of `score` restricted to consecutive sections, re-based to time 0."""
    off, end = secs[0].start_beat, secs[-1].end_beat
    bar_off = secs[0].start_bar
    v = copy.deepcopy(score)
    v.sections = [replace(s, start_beat=s.start_beat - off, end_beat=s.end_beat - off, start_bar=s.start_bar - bar_off)
                  for s in secs]
    v.chords = [replace(c, start=c.start - off) for c in score.chords if off <= c.start < end]
    for t in v.tracks:
        t.notes = [replace(nt, start=nt.start - off) for nt in t.notes if off <= nt.start < end]
    v.total_beats = end - off
    return v


@dataclass
class RenderResult:
    render_id: str
    out_dir: Path
    wav: Path
    analysis: dict
    findings: list[dict]
    timings: dict = field(default_factory=dict)


def render_song(song: str | Path, overlays: list[str | Path] | None = None, out_root: Path | None = None,
                label: str | None = None, render_id: str | None = None, stems: bool = False,
                preview: bool = True, crop_sections: list[str] | None = None, quiet: bool = False) -> RenderResult:
    t0 = time.time()
    timings = {}
    spec = load_song(song, overlays)
    data = spec.data
    sr = int(data.get("sample_rate", 44100))
    seed = int(data.get("seed", 0))
    score = realize(spec)
    timings["realize"] = time.time() - t0

    out_root = Path(out_root) if out_root else PROJECT_ROOT / "renders" / spec.id
    rid = render_id or next_render_id(out_root, spec.id, label)
    out = out_root / rid
    out.mkdir(parents=True, exist_ok=True)

    write_midi(score, out / "song.mid")
    (out / "score.json").write_text(json.dumps(score.to_dict(), indent=1))
    (out / "resolved_spec.yaml").write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True))

    tail = float(data.get("tail_sec", 2.0))
    n = int((score.total_beats * score.sec_per_beat() + tail) * sr)
    stem_audio: dict[str, np.ndarray] = {}
    patch_files: list[Path] = []
    t1 = time.time()
    inst_over = (data.get("instrument_overrides") or {})
    for tr in score.tracks:
        if not tr.notes:
            continue
        audio, pfile = render_track(tr, score, sr, n, seed, spec.song_dir, inst_over.get(tr.name))
        stem_audio[tr.name] = audio
        patch_files.append(pfile)
        if not quiet:
            print(f"  rendered {tr.name:<12} {len(tr.notes):4d} notes  ({pfile.relative_to(PROJECT_ROOT) if pfile.is_relative_to(PROJECT_ROOT) else pfile})")
    timings["synthesis"] = time.time() - t1
    t2 = time.time()
    mres = mix(score, stem_audio, data.get("mix") or {}, sr, seed)
    x = mres.master
    # gentle fade at the very end of the tail
    fade = int(min(tail, 1.5) * sr)
    if fade > 0:
        x[:, -fade:] *= np.linspace(1, 0, fade) ** 2
    timings["mix"] = time.time() - t2

    if crop_sections:
        secs = [s for s in score.sections if s.name in crop_sections]
        a = int(secs[0].start_beat * score.sec_per_beat() * sr)
        b = int(secs[-1].end_beat * score.sec_per_beat() * sr) + (int(tail * sr) if secs[-1] is score.sections[-1] else 0)
        x = x[:, a:b]
        view = crop_score(score, secs)
    else:
        view = score

    wav = out / "mix.wav"
    sf.write(wav, x.T, sr, subtype="PCM_24")
    if stems:
        (out / "stems").mkdir(exist_ok=True)
        for k, v in mres.post_fader.items():
            sf.write(out / "stems" / f"{k}.wav", v.T.astype(np.float32), sr, subtype="FLOAT")
    if preview and shutil.which("ffmpeg"):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "192k",
                        str(out / "mix.mp3")], check=False)

    t3 = time.time()
    analysis = analyze(x, sr, view, None if crop_sections else mres.post_fader, score.key)
    findings = symbolic_checks(score, data) + audio_checks(analysis, view, data)
    timings["analysis"] = time.time() - t3
    (out / "analysis.json").write_text(json.dumps(analysis, indent=1))
    (out / "findings.json").write_text(json.dumps(findings, indent=1))
    mixinfo = {"pre_limiter_lufs": mres.pre_limiter_lufs, "master_gain_db": mres.master_gain_db,
               "limiter_max_gr_db": mres.limiter_max_gr_db, "final_lufs": mres.final_lufs,
               "final_true_peak_db": mres.final_true_peak_db}
    timings["total"] = time.time() - t0
    man = manifest(spec, rid, spec.source_files + sorted(set(patch_files)), seed,
                   extra={"overlays": [str(o) for o in overlays or []], "sample_rate": sr, "mix": mixinfo,
                          "timings_sec": {k: round(v, 2) for k, v in timings.items()},
                          "findings_summary": summarize(findings), "crop_sections": crop_sections})
    (out / "manifest.json").write_text(json.dumps(man, indent=1))
    try:
        overview(x, sr, view, analysis, out / "overview.png")
    except Exception as e:  # plotting must never break a render
        print(f"  (plot failed: {e})")
    (out / "report.md").write_text(write_report(rid, view, analysis, findings, mixinfo, man))
    return RenderResult(rid, out, wav, analysis, findings, timings)
