"""Candidate generation and batch rendering for A/B/C comparison.

Two entry points:

* `motif_candidates` — structured (not random-note) variations of one motif.
  Each candidate is a chain of named operators applied to the motif; the
  rest of the song (phrase ops, answers, cadences) is unchanged, so every
  candidate is a coherent whole melody. Hard constraints reject candidates
  that clash with the harmony on strong beats or break melodic hygiene.
* `render_batch` — render any list of overlay YAMLs (melody, sound, mix...)
  into one batch directory with a comparison sheet for the human.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

import numpy as np
import yaml

from ..composition.notation import MNote, parse_notes
from ..composition.realize import realize, stable_seed
from ..evaluation.rules import symbolic_checks
from ..spec import PROJECT_ROOT, deep_merge, load_song

RHYTHMS_5 = ["3 3 4 2 4", "3 3 2 4 4", "2 2 3 3 6", "4 2 2 4 4", "3 3 3 3 4", "3 3 4 4 2", "6 2 3 3 2", "2 4 2 4 4"]


def motif_to_str(notes: list[MNote]) -> str:
    toks = []
    pos = 0.0
    for n in notes:
        if n.start > pos:
            toks.append(f"r:{n.start - pos:g}")
        if n.midi is not None:
            from ..theory import pitch_name
            p = pitch_name(n.midi)
        else:
            p = f"{n.deg}{'#' if n.alter == 1 else 'b' if n.alter == -1 else ''}"
        mark = "!" if n.vel >= 0.99 else "?" if n.vel <= 0.6 else ""
        toks.append(f"{p}:{n.length:g}{mark}")
        pos = n.start + n.length
    return " ".join(toks)


# ----------------------------------------------------------------- operators


def op_anchor(notes, rng):
    n = copy.deepcopy(notes)
    n[0].deg += int(rng.choice([-2, -1, 1, 2]))
    return n, "anchor"


def op_neighbor(notes, rng):
    n = copy.deepcopy(notes)
    i = int(rng.integers(1, len(n)))
    n[i].deg += int(rng.choice([-1, 1]))
    return n, f"neighbor[{i}]"


def op_rhythm(notes, rng):
    n = copy.deepcopy(notes)
    opts = [r for r in RHYTHMS_5 if len(r.split()) == len(n)]
    if not opts:
        return n, "rhythm(none)"
    r = opts[int(rng.integers(len(opts)))]
    pos = n[0].start
    for note, ln in zip(n, r.split()):
        note.start, note.length = pos, float(ln)
        pos += float(ln)
    return n, f"rhythm({r})"


def op_contour(notes, rng):
    n = copy.deepcopy(notes)
    pivot = n[0].deg
    for note in n[1:]:
        note.deg = 2 * pivot - note.deg - 7 if rng.random() < 0.5 else note.deg
    return n, "contour"


def op_tail_leap(notes, rng):
    n = copy.deepcopy(notes)
    n[-1].deg += int(rng.choice([2, 3, -2]))
    return n, "tail"


OPERATORS = [op_anchor, op_neighbor, op_rhythm, op_contour, op_tail_leap]


def melodic_diagnostics(pitches: list[int]) -> dict:
    iv = np.diff(pitches)
    steps = np.mean(np.abs(iv) <= 2) if len(iv) else 1.0
    unrecovered = 0
    for a, b in zip(iv, iv[1:]):
        if abs(a) >= 5 and not (np.sign(b) == -np.sign(a) and abs(b) <= 4):
            unrecovered += 1
    return {"range": int(max(pitches) - min(pitches)), "distinct": len(set(pitches)),
            "step_ratio": float(steps), "unrecovered_leaps": unrecovered}


def motif_candidates(song: str | Path, motif: str, n: int, seed: int, part: str = "lead",
                     max_ops: int = 2, include_original: bool = True) -> list[dict]:
    spec = load_song(song)
    motifs = spec.data["melody"]["motifs"]
    src = motifs[motif] if isinstance(motifs[motif], str) else motifs[motif]["notes"]
    base_notes = parse_notes(src)
    rng = np.random.default_rng(seed)
    out, seen = [], set()
    if include_original:
        out.append({"motif": src, "ops": ["original"], "overlay": {}})
        seen.add(motif_to_str(base_notes))
    attempts = 0
    while len(out) < n and attempts < n * 60:
        attempts += 1
        notes, lineage = base_notes, []
        for _ in range(int(rng.integers(1, max_ops + 1))):
            op = OPERATORS[int(rng.integers(len(OPERATORS)))]
            notes, name = op(notes, rng)
            lineage.append(name)
        s = motif_to_str(notes)
        if s in seen:
            continue
        overlay = {"melody": {"motifs": {motif: s}}}
        trial = copy.deepcopy(spec)
        trial.data = deep_merge(spec.data, overlay)
        try:
            score = realize(trial)
        except Exception:
            continue
        findings = [f for f in symbolic_checks(score, trial.data) if f["level"] in ("error", "warn")
                    and f["id"].startswith(("melody", "range"))]
        lead = [x for t in score.tracks if t.name == part for x in t.notes]
        diag = melodic_diagnostics([x.pitch for x in lead]) if lead else {}
        if findings or diag.get("unrecovered_leaps", 0) > 2 or diag.get("range", 0) > 16:
            continue
        seen.add(s)
        out.append({"motif": s, "ops": lineage, "overlay": overlay, "diagnostics": diag})
    return out


def render_batch(song: str | Path, overlays: list[Path], batch_dir: Path, crop_sections: list[str] | None = None,
                 descriptions: list[dict] | None = None) -> Path:
    from ..rendering.pipeline import render_song

    batch_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for i, ov in enumerate(overlays):
        cid = f"cand_{i:02d}"
        res = render_song(song, [ov] if ov else None, out_root=batch_dir, render_id=cid, crop_sections=crop_sections,
                          quiet=True)
        errs = sum(f["level"] == "error" for f in res.findings)
        warns = sum(f["level"] == "warn" for f in res.findings)
        g = res.analysis["global"]
        desc = (descriptions or [{}] * len(overlays))[i]
        rows.append((cid, desc, errs, warns, g.get("lufs_integrated")))
        print(f"  {cid}: errors={errs} warns={warns}  {desc.get('motif', '')}")
    L = [f"# Candidate batch — {batch_dir.name}", "", f"song: `{song}`  crop: {crop_sections or 'full'}", "",
         "Listen to each `cand_XX/mix.mp3`, then record a choice, e.g.:", "",
         "```", f"python -m music_agent prefer --comparison {' '.join(r[0] for r in rows)} "
         f"--preferred cand_01 --reason melody --context batch={batch_dir.name}", "```", "",
         "| id | description | L1 errors | L1 warns | LUFS |", "|---|---|---|---|---|"]
    for cid, desc, e, w, lufs in rows:
        d = "; ".join(f"{k}={v}" for k, v in desc.items() if k != "overlay")
        L.append(f"| {cid} | {d} | {e} | {w} | {lufs:.1f} |" if lufs is not None else f"| {cid} | {d} | {e} | {w} | – |")
    (batch_dir / "SHEET.md").write_text("\n".join(L) + "\n")
    return batch_dir / "SHEET.md"


def write_overlays(cands: list[dict], batch_dir: Path) -> list[Path]:
    batch_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, c in enumerate(cands):
        p = batch_dir / f"overlay_{i:02d}.yaml"
        p.write_text(yaml.safe_dump(c["overlay"] or {"_note": "original"}, sort_keys=False))
        paths.append(p)
    (batch_dir / "candidates.json").write_text(json.dumps(cands, indent=1))
    return paths
