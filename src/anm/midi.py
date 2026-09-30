"""Dependency-free Standard MIDI File (format 1) writer. Deterministic output."""
from __future__ import annotations

from pathlib import Path

from .model import Project

PPQ = 480


def _vlq(n: int) -> bytes:
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def _chunk(tag: bytes, data: bytes) -> bytes:
    return tag + len(data).to_bytes(4, "big") + data


def _track(events: list[tuple[int, int, bytes]]) -> bytes:
    # (tick, order, bytes); order puts note-offs before note-ons at same tick.
    events.sort(key=lambda e: (e[0], e[1]))
    out, last = bytearray(), 0
    for tick, _, data in events:
        out += _vlq(tick - last) + data
        last = tick
    out += _vlq(0) + b"\xff\x2f\x00"
    return _chunk(b"MTrk", bytes(out))


def to_bytes(project: Project) -> bytes:
    tempo = int(60_000_000 / project.tempo)
    num, den = project.time_signature
    meta = [
        (0, 0, b"\xff\x51\x03" + tempo.to_bytes(3, "big")),
        (0, 0, b"\xff\x58\x04" + bytes([num, den.bit_length() - 1, 24, 8])),
    ]
    chunks = [_track(meta)]
    for t in project.tracks:
        name = t.name.encode()
        ev = [(0, 0, b"\xff\x03" + _vlq(len(name)) + name),
              (0, 1, bytes([0xC0 | t.channel, t.program]))]
        for n in t.notes:
            on, off = round(n.start * PPQ), round((n.start + n.duration) * PPQ)
            ev.append((on, 3, bytes([0x90 | t.channel, n.pitch, n.velocity])))
            ev.append((off, 2, bytes([0x80 | t.channel, n.pitch, 0])))
        chunks.append(_track(ev))
    header = _chunk(b"MThd", (1).to_bytes(2, "big") + len(chunks).to_bytes(2, "big") + PPQ.to_bytes(2, "big"))
    return header + b"".join(chunks)


def export(project: Project, path: str | Path) -> int:
    data = to_bytes(project)
    Path(path).write_bytes(data)
    return len(data)
