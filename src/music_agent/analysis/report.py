"""Markdown report for a render: what the critic reads first."""
from __future__ import annotations

from ..score import Score


def _fmt(v, nd=1):
    if v is None:
        return "–"
    if isinstance(v, float):
        return f"{v:.{nd}f}"
    return str(v)


def write_report(render_id: str, score: Score, analysis: dict, findings: list[dict], mixinfo: dict,
                 manifest: dict) -> str:
    g = analysis["global"]
    L = [f"# Render report — {render_id}", ""]
    L.append(f"- song: `{score.song_id}` | key {score.key} | {score.tempo:g} BPM | "
             f"{len(score.sections)} sections | {g['duration_sec']:.1f}s")
    L.append(f"- git: `{manifest.get('git', {}).get('commit', '?')[:10]}`"
             f"{' (dirty)' if manifest.get('git', {}).get('dirty') else ''} | spec hash `{manifest.get('spec_hash')}` | seed {manifest.get('seed')}")
    L.append("")
    L.append("## Layer 1 — rule checks")
    order = {"error": 0, "warn": 1, "info": 2}
    if not findings:
        L.append("No findings.")
    for f in sorted(findings, key=lambda f: order[f["level"]]):
        L.append(f"- **{f['level'].upper()}** `{f['id']}` {f['message']} _{f['where']}_")
    L.append("")
    L.append("## Layer 2 — acoustic diagnostics (not a quality score)")
    L.append("")
    L.append("| metric | value |")
    L.append("|---|---|")
    for k in ("lufs_integrated", "true_peak_dbtp", "peak_dbfs", "rms_dbfs", "crest_db", "side_to_mid_db", "lr_correlation"):
        L.append(f"| {k} | {_fmt(g.get(k), 2)} |")
    L.append(f"| master gain into limiter (dB) | {_fmt(mixinfo.get('master_gain_db'), 2)} |")
    L.append(f"| limiter max gain reduction (dB) | {_fmt(mixinfo.get('limiter_max_gr_db'), 2)} |")
    L.append("")
    L.append("### Sections")
    L.append("")
    L.append("| section | energy tgt | LUFS | centroid Hz | rolloff Hz | onsets/s | side/mid dB | sub | low | lowmid | highmid | high |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for s in analysis["sections"]:
        bs = s.get("band_share", {})
        L.append(f"| {s['name']} | {s['energy_target']} | {_fmt(s.get('lufs'))} | {_fmt(s.get('centroid_hz'), 0)} | "
                 f"{_fmt(s.get('rolloff85_hz'), 0)} | {_fmt(s.get('onsets_per_sec'))} | {_fmt(s.get('side_to_mid_db'))} | "
                 + " | ".join(_fmt(bs.get(b), 3) for b in ("sub", "low", "lowmid", "highmid", "high")) + " |")
    L.append("")
    L.append("### Section contrast")
    for c in analysis["contrast"]:
        L.append(f"- {c['from']} → {c['to']}: ΔLUFS {_fmt(c.get('lufs_delta'))}, Δcentroid {_fmt(c.get('centroid_hz_delta'), 0)} Hz, "
                 f"Δonsets/s {_fmt(c.get('onsets_per_sec_delta'))}, Δwidth {_fmt(c.get('side_to_mid_db_delta'))} dB")
    L.append("")
    L.append("### Loudness by bar (LUFS)")
    L.append("")
    L.append(" ".join(f"{b['bar']}:{_fmt(b['lufs'], 0)}" for b in analysis["bars"]))
    L.append("")
    st = analysis.get("stems") or {}
    if st:
        L.append("### Stem diagnostics")
        for k, v in st.items():
            L.append(f"- {k}: " + ", ".join(f"{kk}={_fmt(vv, 3)}" for kk, vv in v.items()))
        L.append("")
    ton = analysis.get("tonality")
    if ton:
        L.append(f"### Tonality\n- declared: {ton.get('declared')} (rank {ton.get('declared_rank')}); "
                 f"estimate: " + ", ".join(f"{k} ({r:.2f})" for k, r in ton["top_keys"]))
        L.append("")
    L.append("## Layer 3 / 4")
    L.append("Critic reviews go to `critiques/`, human A/B choices to `feedback/preferences.jsonl`.")
    L.append("")
    L.append("![overview](overview.png)")
    return "\n".join(L) + "\n"
