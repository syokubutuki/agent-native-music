"""Expand a SongSpec (harmony / melody / arrangement YAML) into a Score.

This is where musical *intent* (motifs, ops, chord symbols, patterns)
becomes explicit notes. It is deterministic given the spec and its seed.
"""
from __future__ import annotations

import zlib

import numpy as np

from ..score import ChordEvent, Note, Score, SectionInfo, Track
from ..spec import SongSpec, SpecError, Timeline
from ..theory import Key, nearest_in_range, parse_chord, parse_key, parse_pitch, voice_chord
from .notation import MNote, apply_ops, notes_end, parse_notes, parse_pattern, pattern_for_bar

GM_DRUMS = {"kick": 36, "snare": 38, "clap": 39, "hat": 42, "closed_hat": 42, "open_hat": 46,
            "crash": 49, "ride": 51, "tom": 45, "perc": 56, "shaker": 70, "snare_roll": 38}


def stable_seed(*parts) -> int:
    return zlib.crc32("|".join(str(p) for p in parts).encode()) & 0x7FFFFFFF


# ---------------------------------------------------------------- harmony


def realize_harmony(data: dict, tl: Timeline, key: Key) -> list[ChordEvent]:
    harm = data.get("harmony") or {}
    progs = harm.get("progressions") or {}
    events: list[ChordEvent] = []
    for sec in data["sections"]:
        name = sec["name"]
        entry = (harm.get("sections") or {}).get(name)
        if entry is None:
            continue
        if isinstance(entry, dict):
            if "progression" in entry:
                base = progs[entry["progression"]]
                bars = list(base) * int(entry.get("repeat", 1))
            else:
                bars = entry.get("chords", [])
        else:
            bars = entry
        if len(bars) != tl.bars[name]:
            raise SpecError(f"harmony.{name}: {len(bars)} bar entries for a {tl.bars[name]}-bar section")
        for i, bar_entry in enumerate(bars):
            bar_start = (tl.bar_of(name) + i) * tl.bpb
            symbols = str(bar_entry).split()
            dur = tl.bpb / len(symbols)
            for j, sym in enumerate(symbols):
                ch = parse_chord(sym, key)
                events.append(ChordEvent(bar_start + j * dur, dur, sym, ch.pcs, ch.bass))
    return events


def chord_at(chords: list[ChordEvent], beat: float) -> ChordEvent | None:
    cur = None
    for c in chords:
        if c.start <= beat + 1e-9:
            cur = c
        else:
            break
    if cur is not None and beat < cur.start + cur.dur + 1e-9:
        return cur
    return cur


# ----------------------------------------------------------------- melody


def _motif_notes(motifs: dict, name: str) -> tuple[list[MNote], int | None]:
    if name not in motifs:
        raise SpecError(f"Unknown motif '{name}'. Known: {sorted(motifs)}")
    m = motifs[name]
    if isinstance(m, str):
        return parse_notes(m), None
    notes = parse_notes(m["notes"])
    return notes, m.get("grid")


def realize_melody_part(data: dict, part: str, tl: Timeline, key: Key) -> list[Note]:
    mel = data.get("melody") or {}
    parts = mel.get("parts") or {}
    motifs = mel.get("motifs") or {}
    if part not in parts:
        raise SpecError(f"Unknown melody part '{part}'. Known: {sorted(parts)}")
    pspec = parts[part]
    base = parse_pitch(pspec.get("base", "C4"))
    grid = int(pspec.get("grid", 16))
    out: list[Note] = []
    for sec_name, phrases in (pspec.get("sections") or {}).items():
        sec_bar = tl.bar_of(sec_name)
        for ph in phrases:
            g = grid
            if "motif" in ph:
                notes, mg = _motif_notes(motifs, ph["motif"])
                g = mg or grid
            elif "notes" in ph:
                notes = parse_notes(ph["notes"])
            else:
                raise SpecError(f"melody.{part}.{sec_name}: phrase needs 'motif' or 'notes': {ph}")
            notes = apply_ops(notes, ph.get("ops"), key, base)
            steps_per_beat = g / tl.bpb
            reps = int(ph.get("repeat", 1))
            every = float(ph.get("every", notes_end(notes)))
            start_beat = (sec_bar + float(ph.get("bar", 0))) * tl.bpb + float(ph.get("beat", 0))
            for r in range(reps):
                for n in notes:
                    pitch = n.resolve(key, base)
                    out.append(Note(pitch, start_beat + (n.start + r * every) / steps_per_beat,
                                    n.length / steps_per_beat, n.vel))
    out.sort(key=lambda n: (n.start, n.pitch))
    return out


# ------------------------------------------------------------ arrangement


def _section_iter(data: dict, tl: Timeline, only: list[str] | None):
    for sec in data["sections"]:
        if only and sec["name"] not in only:
            continue
        yield sec["name"], tl.bar_of(sec["name"]), tl.bars[sec["name"]]


def _pattern_hits(patterns: dict, sec_name: str, bar_idx: int):
    spec = (patterns or {}).get(sec_name)
    pat = pattern_for_bar(spec, bar_idx)
    if not pat:
        return [], 16
    return parse_pattern(pat)


def realize_chords(content: dict, data: dict, tl: Timeline, chords: list[ChordEvent], only) -> list[Note]:
    low, high = (parse_pitch(x) for x in content.get("range", ["F3", "E5"]))
    nvoices = int(content.get("voices", 4))
    out: list[Note] = []
    prev = None
    cache: dict[tuple, tuple] = {}
    for sec_name, bar0, nbars in _section_iter(data, tl, only):
        for b in range(nbars):
            hits, grid = _pattern_hits(content.get("patterns"), sec_name, b)
            spb = grid / tl.bpb
            for h in hits:
                beat = (bar0 + b) * tl.bpb + h.step / spb
                ce = chord_at(chords, beat)
                if ce is None:
                    continue
                ck = (ce.symbol, ce.start)
                if ck not in cache:
                    ch = parse_chord(ce.symbol, parse_key(data["key"]))
                    cache[ck] = voice_chord(ch, low, high, nvoices, prev)
                    prev = cache[ck]
                v = cache[ck]
                # Do not let a held chord ring past the chord change.
                dur = min(h.length / spb, ce.start + ce.dur - beat) if content.get("clip_to_chord", True) else h.length / spb
                for p in v:
                    out.append(Note(p, beat, max(dur, 0.05), h.vel))
    return out


def realize_arp(content: dict, data: dict, tl: Timeline, chords: list[ChordEvent], only) -> list[Note]:
    low, high = (parse_pitch(x) for x in content.get("range", ["F4", "F5"]))
    nvoices = int(content.get("voices", 4))
    order = [int(x) for x in str(content.get("order", "0 1 2 3")).split()]
    key = parse_key(data["key"])
    out: list[Note] = []
    prev = None
    for sec_name, bar0, nbars in _section_iter(data, tl, only):
        for b in range(nbars):
            hits, grid = _pattern_hits(content.get("patterns"), sec_name, b)
            spb = grid / tl.bpb
            idx = 0
            last_sym = None
            for h in hits:
                beat = (bar0 + b) * tl.bpb + h.step / spb
                ce = chord_at(chords, beat)
                if ce is None:
                    continue
                if ce.symbol != last_sym:
                    v = voice_chord(parse_chord(ce.symbol, key), low, high, nvoices, prev)
                    prev, last_sym = v, ce.symbol
                o = order[idx % len(order)]
                idx += 1
                octv, i = divmod(o, len(v))
                out.append(Note(v[i] + 12 * octv, beat, h.length / spb, h.vel))
    return out


def realize_bass(content: dict, data: dict, tl: Timeline, chords: list[ChordEvent], only) -> list[Note]:
    low, high = (parse_pitch(x) for x in content.get("range", ["E1", "D#2"]))
    out: list[Note] = []
    prev = None
    for sec_name, bar0, nbars in _section_iter(data, tl, only):
        for b in range(nbars):
            hits, grid = _pattern_hits(content.get("patterns"), sec_name, b)
            spb = grid / tl.bpb
            for h in hits:
                beat = (bar0 + b) * tl.bpb + h.step / spb
                ce = chord_at(chords, beat)
                if ce is None:
                    continue
                root = nearest_in_range(ce.bass_pc, low, high, prev)
                prev = root
                dur = h.length / spb
                if content.get("clip_to_chord", True):
                    dur = min(dur, ce.start + ce.dur - beat)
                out.append(Note(root + (12 if h.octave_up else 0), beat, max(dur, 0.05), h.vel))
    return out


def realize_drums(content: dict, data: dict, tl: Timeline, name: str, only) -> list[Note]:
    voice = content.get("voice", name)
    pitch = int(content.get("midi_note", GM_DRUMS.get(voice, 60)))
    ramps = content.get("ramp") or {}
    out: list[Note] = []
    for sec_name, bar0, nbars in _section_iter(data, tl, only):
        ramp = ramps.get(sec_name) or {}
        sec_len = nbars * tl.bpb
        for b in range(nbars):
            hits, grid = _pattern_hits(content.get("patterns"), sec_name, b)
            spb = grid / tl.bpb
            for h in hits:
                beat = (bar0 + b) * tl.bpb + h.step / spb
                frac = (beat - bar0 * tl.bpb) / sec_len
                vel = h.vel
                params = {}
                if "vel" in ramp:
                    a, z = ramp["vel"]
                    vel *= a + (z - a) * frac
                if "pitch" in ramp:
                    a, z = ramp["pitch"]
                    params["pitch_offset"] = a + (z - a) * frac
                out.append(Note(pitch, beat, h.length / spb, float(np.clip(vel, 0.02, 1.0)), params))
    return out


def realize_fx(content: dict, tl: Timeline) -> list[Note]:
    out = []
    for ev in content.get("events", []):
        s = tl.beat(ev["at"])
        e = tl.beat(ev["until"]) if "until" in ev else s + float(ev.get("beats", 4))
        out.append(Note(int(ev.get("pitch", 60)), s, e - s, float(ev.get("vel", 0.85)), dict(ev.get("params", {}))))
    return out


def _humanize(notes: list[Note], hz: dict | None, seed: int, spb_sec: float) -> None:
    if not hz:
        return
    rng = np.random.default_rng(seed)
    t = float(hz.get("timing_ms", 0)) / 1000.0 / spb_sec
    v = float(hz.get("vel", 0))
    for n in notes:
        if t:
            n.start = max(0.0, n.start + rng.normal(0, t))
        if v:
            n.vel = float(np.clip(n.vel + rng.normal(0, v), 0.05, 1.0))


def realize(spec: SongSpec) -> Score:
    data = spec.data
    ts = data.get("time_signature", [4, 4])
    bpb = int(ts[0]) * 4 // int(ts[1])
    tl = Timeline(data["sections"], bpb)
    key = parse_key(data["key"])
    seed = int(data.get("seed", 0))
    chords = realize_harmony(data, tl, key)
    sections = []
    for s in data["sections"]:
        sb = tl.bar_of(s["name"])
        sections.append(SectionInfo(s["name"], sb, int(s["bars"]), float(s.get("energy", 0.5)),
                                    sb * bpb, (sb + int(s["bars"])) * bpb))
    arr = data.get("arrangement") or {}
    tracks: list[Track] = []
    channel = 0
    for name, t in (arr.get("tracks") or {}).items():
        content = t.get("content") or {}
        ctype = content.get("type")
        only = t.get("sections")
        if ctype == "melody":
            notes = realize_melody_part(data, content.get("part", name), tl, key)
            if only:
                notes = [n for n in notes if (s := tl_section(sections, n.start)) and s in only]
            tr = content.get("transpose", 0)
            for n in notes:
                shift = tr.get(tl_section(sections, n.start), 0) if isinstance(tr, dict) else tr
                n.pitch += int(shift)
        elif ctype == "chords":
            notes = realize_chords(content, data, tl, chords, only)
        elif ctype == "arp":
            notes = realize_arp(content, data, tl, chords, only)
        elif ctype == "bass":
            notes = realize_bass(content, data, tl, chords, only)
        elif ctype == "drums":
            notes = realize_drums(content, data, tl, name, only)
        elif ctype == "fx":
            notes = realize_fx(content, tl)
        else:
            raise SpecError(f"Track '{name}': unknown content type '{ctype}'")
        _humanize(notes, t.get("humanize"), stable_seed(seed, name), 60.0 / float(data["tempo"]))
        if ctype == "drums":
            ch = 9
        else:
            ch = channel if channel != 9 else channel + 1
            channel = ch + 1
        tracks.append(Track(name, ctype, t.get("instrument", ""), notes, t.get("role", ""), ch % 16,
                            bool(t.get("mute", False))))
    automation = []
    for a in arr.get("automation") or []:
        pts = [(tl.beat(p[0]), float(p[1])) for p in a["points"]]
        automation.append({"target": a["target"], "points": pts, "curve": a.get("curve", "linear")})
    total_beats = tl.total_bars * bpb
    return Score(spec.id, float(data["tempo"]), bpb, str(key), sections, chords, tracks, total_beats, automation)


def tl_section(sections: list[SectionInfo], beat: float) -> str | None:
    for s in sections:
        if s.start_beat - 1e-6 <= beat < s.end_beat - 1e-6:
            return s.name
    return None
