"""Standard MIDI File export / import for a Score.

Type-1 SMF: track 0 carries tempo, time signature, key, section markers and
chord markers; one MIDI track per Score track (named). Beats are quantised to
`ppq` ticks. Per-note `params` are not representable in MIDI and are dropped.
"""
from __future__ import annotations

from pathlib import Path

import mido

from ..score import Note, Score

PPQ = 960


def _ticks(beat: float) -> int:
    return int(round(beat * PPQ))


def _vel(v: float) -> int:
    return max(1, min(127, int(round(v * 127))))


def write_midi(score: Score, path: str | Path) -> Path:
    mid = mido.MidiFile(type=1, ticks_per_beat=PPQ)
    meta = mido.MidiTrack()
    mid.tracks.append(meta)
    meta.append(mido.MetaMessage("track_name", name=score.song_id, time=0))
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(score.tempo), time=0))
    meta.append(mido.MetaMessage("time_signature", numerator=score.beats_per_bar, denominator=4, time=0))
    events = [(_ticks(s.start_beat), f"section:{s.name}") for s in score.sections]
    events += [(_ticks(c.start), f"chord:{c.symbol}") for c in score.chords]
    events.sort()
    last = 0
    for t, text in events:
        meta.append(mido.MetaMessage("marker", text=text, time=t - last))
        last = t
    meta.append(mido.MetaMessage("end_of_track", time=max(0, _ticks(score.total_beats) - last)))

    for tr in score.tracks:
        mt = mido.MidiTrack()
        mid.tracks.append(mt)
        mt.append(mido.MetaMessage("track_name", name=tr.name, time=0))
        msgs = []
        for n in tr.notes:
            on, off = _ticks(n.start), _ticks(n.start + n.dur)
            if off <= on:
                off = on + 1
            # note_off sorts before note_on at the same tick (re-triggered pitches)
            msgs.append((on, 1, mido.Message("note_on", note=n.pitch, velocity=_vel(n.vel), channel=tr.midi_channel)))
            msgs.append((off, 0, mido.Message("note_off", note=n.pitch, velocity=0, channel=tr.midi_channel)))
        msgs.sort(key=lambda x: (x[0], x[1], x[2].note))
        last = 0
        for t, _, m in msgs:
            mt.append(m.copy(time=t - last))
            last = t
        mt.append(mido.MetaMessage("end_of_track", time=0))
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    mid.save(str(p))
    return p


def read_midi(path: str | Path) -> dict[str, list[Note]]:
    """Returns {track_name: [Note]} with beats (tempo-independent)."""
    mid = mido.MidiFile(str(path))
    out: dict[str, list[Note]] = {}
    for tr in mid.tracks[1:]:
        name = None
        t = 0
        active: dict[tuple[int, int], list[tuple[int, int]]] = {}
        notes: list[Note] = []
        for m in tr:
            t += m.time
            if m.type == "track_name":
                name = m.name
            elif m.type == "note_on" and m.velocity > 0:
                active.setdefault((m.channel, m.note), []).append((t, m.velocity))
            elif m.type in ("note_off", "note_on"):
                stack = active.get((m.channel, m.note))
                if stack:
                    st, vel = stack.pop(0)
                    notes.append(Note(m.note, st / mid.ticks_per_beat, (t - st) / mid.ticks_per_beat, vel / 127))
        notes.sort(key=lambda n: (n.start, n.pitch))
        out[name or f"track{len(out)}"] = notes
    return out


def read_markers(path: str | Path) -> list[tuple[float, str]]:
    mid = mido.MidiFile(str(path))
    t = 0
    out = []
    for m in mid.tracks[0]:
        t += m.time
        if m.type == "marker":
            out.append((t / mid.ticks_per_beat, m.text))
    return out
