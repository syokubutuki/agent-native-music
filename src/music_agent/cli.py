"""Command line interface.

    python -m music_agent render songs/track_001 [--overlay o.yaml] [--label x] [--stems] [--sections drop]
    python -m music_agent check  songs/track_001          # realise + Layer-1 symbolic checks, no audio
    python -m music_agent midi   songs/track_001 -o out.mid
    python -m music_agent candidates songs/track_001 --motif a --n 5 --seed 7 [--sections drop]
    python -m music_agent batch  songs/track_001 o1.yaml o2.yaml --name sound_b001 [--sections drop]
    python -m music_agent prefer --comparison cand_00 cand_01 --preferred cand_01 --reason melody
    python -m music_agent vst-params "C:/Program Files/Common Files/VST3/Surge XT.vst3"
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .spec import PROJECT_ROOT


def _cmd_render(a):
    from .rendering.pipeline import render_song

    res = render_song(a.song, a.overlay, label=a.label, stems=a.stems, preview=not a.no_preview,
                      crop_sections=a.sections)
    g = res.analysis["global"]
    counts = {lv: sum(f["level"] == lv for f in res.findings) for lv in ("error", "warn", "info")}
    print(f"\n{res.render_id}: {g['duration_sec']:.1f}s  LUFS {g['lufs_integrated']:.1f}  TP {g['true_peak_dbtp']:.2f} dBTP  "
          f"findings {counts}  ({res.timings['total']:.1f}s)")
    print(f"-> {res.out_dir.relative_to(PROJECT_ROOT) if res.out_dir.is_relative_to(PROJECT_ROOT) else res.out_dir}/report.md")
    for f in res.findings:
        if f["level"] != "info":
            print(f"   [{f['level']}] {f['id']}: {f['message']} ({f['where']})")
    return 1 if counts["error"] else 0


def _cmd_check(a):
    from .composition.realize import realize
    from .evaluation.rules import symbolic_checks
    from .spec import load_song

    spec = load_song(a.song, a.overlay)
    score = realize(spec)
    print(f"{spec.id}: {len(score.sections)} sections, {len(score.chords)} chords, "
          f"{sum(len(t.notes) for t in score.tracks)} notes in {len(score.tracks)} tracks, "
          f"{score.total_beats * score.sec_per_beat():.1f}s")
    fs = symbolic_checks(score, spec.data)
    for f in fs:
        print(f"  [{f['level']}] {f['id']}: {f['message']} ({f['where']})")
    return 1 if any(f["level"] == "error" for f in fs) else 0


def _cmd_midi(a):
    from .composition.realize import realize
    from .midi.io import write_midi
    from .spec import load_song

    spec = load_song(a.song, a.overlay)
    p = write_midi(realize(spec), a.output or f"{spec.id}.mid")
    print(p)
    return 0


def _cmd_candidates(a):
    from .candidates.generate import motif_candidates, render_batch, write_overlays

    cands = motif_candidates(a.song, a.motif, a.n, a.seed, part=a.part)
    song_id = Path(a.song).name if Path(a.song).is_dir() else Path(a.song).parent.name
    bdir = PROJECT_ROOT / "candidates" / song_id / (a.name or f"motif_{a.motif}_s{a.seed}")
    paths = write_overlays(cands, bdir)
    print(f"{len(cands)} candidates -> {bdir}")
    if a.no_render:
        for c in cands:
            print(f"  {c['motif']:<30} {c['ops']}")
        return 0
    descs = [{"motif": c["motif"], "ops": "+".join(c["ops"])} for c in cands]
    sheet = render_batch(a.song, [p if c["overlay"] else None for p, c in zip(paths, cands)], bdir, a.sections, descs)
    print(f"sheet: {sheet}")
    return 0


def _cmd_batch(a):
    from .candidates.generate import render_batch

    song_id = Path(a.song).name if Path(a.song).is_dir() else Path(a.song).parent.name
    bdir = PROJECT_ROOT / "candidates" / song_id / a.name
    descs = [{"overlay": Path(o).name} for o in a.overlays]
    print(render_batch(a.song, [Path(o) for o in a.overlays], bdir, a.sections, descs))
    return 0


def _cmd_analyze(a):
    """Re-run analysis + Layer-1 audio checks on an existing render directory
    (uses stems/ when present). Useful after improving the analysers."""
    import soundfile as sf
    import yaml

    from .analysis.features import analyze
    from .analysis.plots import overview
    from .evaluation.rules import audio_checks, symbolic_checks
    from .score import score_from_dict

    d = Path(a.render_dir)
    score = score_from_dict(json.loads((d / "score.json").read_text()))
    data = yaml.safe_load((d / "resolved_spec.yaml").read_text())
    x, sr = sf.read(d / "mix.wav", always_2d=True)
    stems = None
    if (d / "stems").exists():
        stems = {p.stem: sf.read(p, always_2d=True)[0].T for p in sorted((d / "stems").glob("*.wav"))}
    an = analyze(x.T, sr, score, stems, score.key)
    fs = symbolic_checks(score, data) + audio_checks(an, score, data)
    (d / "analysis.json").write_text(json.dumps(an, indent=1))
    (d / "findings.json").write_text(json.dumps(fs, indent=1))
    overview(x.T, sr, score, an, d / "overview.png")
    if (d / "manifest.json").exists():
        from .analysis.report import write_report

        man = json.loads((d / "manifest.json").read_text())
        (d / "report.md").write_text(write_report(d.name, score, an, fs, man.get("mix", {}), man))
    ton = an.get("tonality", {})
    print(f"LUFS {an['global']['lufs_integrated']:.2f}  key estimate {ton.get('top_keys')}  "
          f"declared rank {ton.get('declared_rank')} ({an.get('tonality_source')})")
    for f in fs:
        if f["level"] != "info":
            print(f"   [{f['level']}] {f['id']}: {f['message']} ({f['where']})")
    return 0


def _cmd_prefer(a):
    from .evaluation.preferences import record

    ctx = dict(kv.split("=", 1) for kv in a.context or [])
    aspects = dict(kv.split("=", 1) for kv in a.aspect or [])
    rec = record(a.comparison, a.preferred, a.reason or "", aspects, a.note or "", ctx)
    print(json.dumps(rec, ensure_ascii=False))
    return 0


def _cmd_vst_params(a):
    from .rendering.vst3 import list_params

    for k, v in list_params(a.plugin).items():
        print(f"{k}: {v}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="music_agent", description="Agent-native music production engine")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("render", help="spec -> MIDI -> audio -> analysis report")
    r.add_argument("song")
    r.add_argument("--overlay", action="append", default=[])
    r.add_argument("--label")
    r.add_argument("--stems", action="store_true")
    r.add_argument("--no-preview", action="store_true")
    r.add_argument("--sections", nargs="+", help="crop output to these consecutive sections")
    r.set_defaults(fn=_cmd_render)

    c = sub.add_parser("check", help="realise the score and run symbolic Layer-1 checks")
    c.add_argument("song")
    c.add_argument("--overlay", action="append", default=[])
    c.set_defaults(fn=_cmd_check)

    m = sub.add_parser("midi", help="export MIDI only")
    m.add_argument("song")
    m.add_argument("-o", "--output")
    m.add_argument("--overlay", action="append", default=[])
    m.set_defaults(fn=_cmd_midi)

    cd = sub.add_parser("candidates", help="generate + render motif variations")
    cd.add_argument("song")
    cd.add_argument("--motif", required=True)
    cd.add_argument("--part", default="lead")
    cd.add_argument("--n", type=int, default=5)
    cd.add_argument("--seed", type=int, default=1)
    cd.add_argument("--name")
    cd.add_argument("--sections", nargs="+")
    cd.add_argument("--no-render", action="store_true")
    cd.set_defaults(fn=_cmd_candidates)

    b = sub.add_parser("batch", help="render several overlays side by side")
    b.add_argument("song")
    b.add_argument("overlays", nargs="+")
    b.add_argument("--name", required=True)
    b.add_argument("--sections", nargs="+")
    b.set_defaults(fn=_cmd_batch)

    an = sub.add_parser("analyze", help="re-analyse an existing render directory")
    an.add_argument("render_dir")
    an.set_defaults(fn=_cmd_analyze)

    p = sub.add_parser("prefer", help="record a human A/B(/C) choice")
    p.add_argument("--comparison", nargs="+", required=True)
    p.add_argument("--preferred")
    p.add_argument("--reason")
    p.add_argument("--aspect", nargs="*", help="aspect=id pairs, e.g. melody=cand_01 sound=cand_03")
    p.add_argument("--note")
    p.add_argument("--context", nargs="*", help="key=value pairs")
    p.set_defaults(fn=_cmd_prefer)

    v = sub.add_parser("vst-params", help="list automatable parameter IDs of a VST3 plugin")
    v.add_argument("plugin")
    v.set_defaults(fn=_cmd_vst_params)

    a = ap.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
