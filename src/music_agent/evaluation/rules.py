"""Layer 1 evaluation: hard constraints and rule-based diagnostics.

These catch *defects* (clipping, silence, range errors, harmonic clashes,
missing sections). Passing them says nothing about musical quality.
Each finding: {id, level: error|warn|info, message, where}.
"""
from __future__ import annotations

from ..composition.realize import chord_at
from ..score import Score
from ..theory import pitch_name

ROLE_RANGES = {  # MIDI inclusive
    "lead": (60, 96),
    "topline": (55, 77),  # G3..F5: comfortable for most vocal ranges combined
    "harmony": (45, 88),
    "texture": (40, 100),
    "bass": (24, 55),
}


def _f(fid, level, msg, where=""):
    return {"id": fid, "level": level, "message": msg, "where": where}


def symbolic_checks(score: Score, spec_data: dict) -> list[dict]:
    out = []
    spb = score.sec_per_beat()
    # sections present / non-empty
    for s in score.sections:
        active = [t.name for t in score.tracks if not t.mute and any(s.start_beat <= n.start < s.end_beat for n in t.notes)]
        if not active:
            out.append(_f("section.empty", "error", f"Section '{s.name}' has no notes", s.name))
    # duration
    tgt = (spec_data.get("target") or {}).get("duration_sec")
    dur = score.total_beats * spb + float(spec_data.get("tail_sec", 0))
    if tgt and not (tgt[0] <= dur <= tgt[1]):
        out.append(_f("duration.target", "warn", f"Duration {dur:.1f}s outside target {tgt}", "song"))
    for t in score.tracks:
        if t.role in ROLE_RANGES and t.notes:
            lo, hi = ROLE_RANGES[t.role]
            bad = [n for n in t.notes if not lo <= n.pitch <= hi]
            if bad:
                out.append(_f("range", "warn", f"{len(bad)} notes outside {t.role} range "
                              f"{pitch_name(lo)}-{pitch_name(hi)} (e.g. {pitch_name(bad[0].pitch)} at beat {bad[0].start:g})", t.name))
        if t.role in ("lead", "topline"):
            out += _melody_harmony(score, t)
            out += _leaps(t)
        if t.role == "bass":
            out += _bass_roots(score, t)
    if not score.chords:
        out.append(_f("harmony.missing", "error", "No chords defined", "harmony"))
    out += _motif_usage(spec_data)
    return out


def _melody_harmony(score: Score, t) -> list[dict]:
    out = []
    for n in t.notes:
        on_strong = abs(n.start - round(n.start)) < 1e-6
        if not on_strong or n.dur < 0.5:
            continue
        ce = chord_at(score.chords, n.start)
        if ce is None:
            continue
        pc = n.pitch % 12
        root = ce.pcs[0]
        if pc in ce.pcs or (pc - root) % 12 == 2:  # chord tone or added 9th
            continue
        semitone_clash = any((pc - c) % 12 in (1, 11) for c in ce.pcs)
        level = "warn" if semitone_clash else "info"
        out.append(_f("melody.nonchord_strong", level,
                      f"{pitch_name(n.pitch)} held {n.dur:g} beats on strong beat over {ce.symbol}"
                      + (" (semitone clash)" if semitone_clash else " (tension)"), f"{t.name}@beat{n.start:g}"))
    return out


def _leaps(t) -> list[dict]:
    out = []
    for a, b in zip(t.notes, t.notes[1:]):
        if b.start - (a.start + a.dur) > 2:  # phrase boundary
            continue
        if abs(b.pitch - a.pitch) > 12:
            out.append(_f("melody.leap", "warn", f"Leap {pitch_name(a.pitch)}->{pitch_name(b.pitch)} > octave",
                          f"{t.name}@beat{b.start:g}"))
    return out


def _bass_roots(score: Score, t) -> list[dict]:
    out = []
    for n in t.notes:
        ce = chord_at(score.chords, n.start)
        if ce and n.pitch % 12 not in (ce.bass_pc, ce.pcs[0]):
            out.append(_f("bass.nonroot", "info", f"Bass {pitch_name(n.pitch)} is not root/bass of {ce.symbol}",
                          f"{t.name}@beat{n.start:g}"))
    return out


def _motif_usage(spec_data: dict) -> list[dict]:
    parts = ((spec_data.get("melody") or {}).get("parts") or {})
    uses: dict[str, list[bool]] = {}
    for p in parts.values():
        for phrases in (p.get("sections") or {}).values():
            for ph in phrases:
                if "motif" in ph:
                    uses.setdefault(ph["motif"], []).append(bool(ph.get("ops")))
    if not uses:
        return [_f("motif.none", "warn", "No motif-based phrases: melody is not built from a motif", "melody")]
    good = [m for m, u in uses.items() if len(u) >= 2 and any(u)]
    if not good:
        return [_f("motif.untransformed", "warn", "No motif is both repeated and transformed", "melody")]
    return [_f("motif.ok", "info", f"Motifs repeated+transformed: {good} (uses: { {m: len(u) for m, u in uses.items()} })", "melody")]


def audio_checks(analysis: dict, score: Score, spec_data: dict) -> list[dict]:
    out = []
    g = analysis["global"]
    ceiling = float(((spec_data.get("mix") or {}).get("master") or {}).get("ceiling_db", -1.0))
    if g["clipped_samples"] > 0:
        out.append(_f("audio.clipping", "error", f"{g['clipped_samples']} clipped samples", "master"))
    if g["true_peak_dbtp"] > ceiling + 0.2:
        out.append(_f("audio.true_peak", "error", f"True peak {g['true_peak_dbtp']:.2f} dBTP > ceiling {ceiling}", "master"))
    if abs(g["dc_offset"]) > 0.005:
        out.append(_f("audio.dc", "warn", f"DC offset {g['dc_offset']:.4f}", "master"))
    song_bars = int(score.total_beats / score.beats_per_bar)
    for b in analysis["bars"][:song_bars]:
        if b["rms_dbfs"] < -60:
            out.append(_f("audio.silence", "error", f"Bar {b['bar']} is silent ({b['rms_dbfs']:.1f} dBFS)", f"bar{b['bar']}"))
    secs = [s for s in analysis["sections"] if s.get("lufs") is not None]
    for i, a in enumerate(secs):
        for b in secs[i + 1:]:
            de = b["energy_target"] - a["energy_target"]
            dl = b["lufs"] - a["lufs"]
            if abs(de) >= 0.3 and (dl * de <= 0 or abs(dl) < 1.0):
                out.append(_f("arrangement.energy_order", "warn",
                              f"Energy target {a['name']}={a['energy_target']} vs {b['name']}={b['energy_target']} "
                              f"but loudness {a['lufs']:.1f} vs {b['lufs']:.1f} LUFS", f"{a['name']}->{b['name']}"))
    for s in analysis["sections"]:
        bs = s.get("band_share") or {}
        if bs.get("high", 0) > 0.22:
            out.append(_f("mix.harsh_high", "warn", f"High band (>6k) share {bs['high']:.2f} in {s['name']}", s["name"]))
        if s.get("centroid_hz", 0) > 4500:
            out.append(_f("mix.bright", "warn", f"Spectral centroid {s['centroid_hz']:.0f} Hz in {s['name']}", s["name"]))
    st = analysis.get("stems") or {}
    kb = st.get("kick_bass")
    if kb and kb["low_overlap_ratio"] > 0.35:
        out.append(_f("mix.kick_bass_overlap", "warn", f"Kick/bass low-band overlap {kb['low_overlap_ratio']:.2f}", "kick,bass"))
    lp = st.get("lead_presence")
    if lp and lp["lead_to_rest_1k5k_db"] < -3:
        out.append(_f("mix.lead_buried", "warn", f"Lead is {lp['lead_to_rest_1k5k_db']:.1f} dB vs rest in 1-5 kHz", "lead"))
    le = st.get("low_end_stereo")
    if le and le["lr_correlation"] < 0.6:
        out.append(_f("mix.low_end_phase", "warn", f"Low end (<150 Hz) L/R correlation {le['lr_correlation']:.2f}", "master"))
    ton = analysis.get("tonality") or {}
    if ton.get("declared_rank") and ton["declared_rank"] > 3:
        out.append(_f("tonality.mismatch", "warn", f"Declared key ranks #{ton['declared_rank']} in chroma estimate "
                      f"(top: {ton['top_keys'][0][0]})", "song"))
    return out


def summarize(findings: list[dict]) -> dict:
    c = {"error": 0, "warn": 0, "info": 0}
    for f in findings:
        c[f["level"]] += 1
    return c
