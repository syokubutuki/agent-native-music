"""VOICEVOX voice clips: sung phrases and spoken lines, generated once and cached.

Spec (songs/<id>/voice.yaml, included as `voice:`):

    voice:
      url: http://127.0.0.1:50021        # VOICEVOX engine (app or engine); overridable with --url
      sing_teacher: 6000                  # style that turns the score into pitch/phonemes (VOICEVOX default)
      clips:
        ts_a1:   {kind: sing, speaker: 3008, part: tsumugi, section: a, bars: [0, 4], transpose: -12,
                  lyrics: "わ しゃ わ しゃ ね ..."}           # one mora per realised note
        zd_puha: {kind: talk, speaker: 3, text: "ぷはーっ！", at: "rinse:3|1",
                  speed: 1.0, pitch: 0.0, intonation: 1.0, volume: 1.0, pre: 0.1, post: 0.1}

`python -m music_agent voice songs/<id>` writes songs/<id>/voice/<clip>.wav + <clip>.json and skips
clips whose request hash is unchanged. Rendering never calls VOICEVOX: it plays the cached WAVs
(arrangement content `type: voice`), so a render is reproducible without the engine.

Sung clips are built from the melody part's realised notes (not humanized), so the melody is
written once. Credits required by the voice libraries are stored in each clip's JSON (`credit`).
"""
from __future__ import annotations

import hashlib
import json
import urllib.parse
import urllib.request
from pathlib import Path

from ..score import Note
from ..spec import SongSpec, SpecError, Timeline
from ..theory import parse_key

FPS = 93.75  # VOICEVOX singing frame rate
DEFAULT_URL = "http://127.0.0.1:50021"


def sing_notes(notes: list[Note], tempo: float, lyrics: list[str], transpose: int = 0,
               lead: float = 0.5, tail: float = 0.5) -> tuple[list[dict], float]:
    """Realised notes -> VOICEVOX score notes. Returns (notes, lead_sec).

    Frames are rounded from cumulative times so long phrases do not drift.
    Gaps become rests; a rest of `lead` seconds precedes the first note."""
    if not notes:
        raise SpecError("sing clip has no notes in the given section/bars")
    if len(lyrics) != len(notes):
        raise SpecError(f"sing clip has {len(notes)} notes but {len(lyrics)} lyric morae: {' '.join(lyrics)}")
    spb = 60.0 / tempo
    origin = notes[0].start * spb - lead
    out: list[dict] = []
    frame = 0

    def add(end_sec: float, key, lyric: str) -> None:
        nonlocal frame
        end = round(end_sec * FPS)
        if end - frame <= 0:
            if key is None:
                return
            raise SpecError(f"note '{lyric}' is shorter than one VOICEVOX frame")
        out.append({"key": key, "frame_length": end - frame, "lyric": lyric})
        frame = end

    cur = 0.0
    for n, ly in zip(notes, lyrics):
        s, e = n.start * spb - origin, (n.start + n.dur) * spb - origin
        if s - cur > 1e-6:
            add(s, None, "")
        add(e, int(n.pitch) + int(transpose), ly)
        cur = e
    add(cur + tail, None, "")
    return out, lead


def _clip_notes(data: dict, clip: dict) -> list[Note]:
    from ..composition.realize import realize_melody_part

    ts = data.get("time_signature", [4, 4])
    tl = Timeline(data["sections"], int(ts[0]) * 4 // int(ts[1]))
    notes = realize_melody_part(data, clip["part"], tl, parse_key(data["key"]))
    b0, b1 = clip.get("bars", [0, tl.bars[clip["section"]]])
    lo = (tl.bar_of(clip["section"]) + int(b0)) * tl.bpb
    hi = (tl.bar_of(clip["section"]) + int(b1)) * tl.bpb
    return [n for n in notes if lo - 1e-9 <= n.start < hi - 1e-9]


def build_request(data: dict, name: str) -> tuple[dict, dict]:
    """(request, extra meta) for one clip. The request is what gets hashed."""
    vs = data.get("voice") or {}
    clip = (vs.get("clips") or {}).get(name)
    if clip is None:
        raise SpecError(f"voice clip '{name}' is not defined under voice.clips")
    kind = clip.get("kind", "sing")
    if kind == "sing":
        notes = _clip_notes(data, clip)
        vv, lead = sing_notes(notes, float(data["tempo"]), str(clip["lyrics"]).split(),
                              int(clip.get("transpose", 0)), float(clip.get("lead", 0.5)), float(clip.get("tail", 0.5)))
        req = {"kind": "sing", "teacher": int(clip.get("teacher", vs.get("sing_teacher", 6000))),
               "speaker": int(clip["speaker"]), "notes": vv, "query": clip.get("query") or {}}
        return req, {"start_beat": notes[0].start, "lead_sec": lead}
    if kind == "talk":
        q = {"speedScale": float(clip.get("speed", 1.0)), "pitchScale": float(clip.get("pitch", 0.0)),
             "intonationScale": float(clip.get("intonation", 1.0)), "volumeScale": float(clip.get("volume", 1.0)),
             "prePhonemeLength": float(clip.get("pre", 0.1)), "postPhonemeLength": float(clip.get("post", 0.1))}
        req = {"kind": "talk", "speaker": int(clip["speaker"]), "text": str(clip["text"]), "query": q}
        # VOICEVOX applies speedScale to the leading silence too
        return req, {"lead_sec": q["prePhonemeLength"] / q["speedScale"]}
    raise SpecError(f"voice clip '{name}': kind must be sing or talk, got '{kind}'")


def request_hash(req: dict) -> str:
    return hashlib.sha256(json.dumps(req, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


class Engine:
    """Minimal VOICEVOX HTTP client (localhost; bypasses any proxy)."""

    def __init__(self, url: str = DEFAULT_URL, timeout: float = 300.0):
        self.url = url.rstrip("/")
        self.timeout = timeout
        self._op = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def _call(self, method: str, path: str, params: dict | None = None, body=None) -> bytes:
        q = ("?" + urllib.parse.urlencode(params)) if params else ""
        data = json.dumps(body, ensure_ascii=False).encode() if body is not None else (b"" if method == "POST" else None)
        req = urllib.request.Request(self.url + path + q, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        with self._op.open(req, timeout=self.timeout) as r:
            return r.read()

    def version(self) -> str:
        return json.loads(self._call("GET", "/version"))

    def style_names(self) -> dict[int, str]:
        out = {}
        for path in ("/speakers", "/singers"):
            try:
                for sp in json.loads(self._call("GET", path)):
                    for st in sp.get("styles", []):
                        out[int(st["id"])] = sp["name"]
            except OSError:
                pass
        return out

    def synthesize(self, req: dict) -> bytes:
        if req["kind"] == "sing":
            q = json.loads(self._call("POST", "/sing_frame_audio_query", {"speaker": req["teacher"]},
                                      {"notes": req["notes"]}))
            q.update(req.get("query") or {})
            return self._call("POST", "/frame_synthesis", {"speaker": req["speaker"]}, q)
        q = json.loads(self._call("POST", "/audio_query", {"text": req["text"], "speaker": req["speaker"]}))
        q.update(req["query"])
        return self._call("POST", "/synthesis", {"speaker": req["speaker"]}, q)


def clip_status(spec: SongSpec) -> list[tuple[str, str]]:
    """[(clip, 'ok' | 'missing' | 'stale')] without contacting the engine."""
    out = []
    for name in ((spec.data.get("voice") or {}).get("clips") or {}):
        meta_p = spec.song_dir / "voice" / f"{name}.json"
        if not (meta_p.exists() and meta_p.with_suffix(".wav").exists()):
            out.append((name, "missing"))
            continue
        req, _ = build_request(spec.data, name)
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        out.append((name, "ok" if meta.get("request_hash") == request_hash(req) else "stale"))
    return out


def generate(spec: SongSpec, names: list[str] | None = None, url: str | None = None, force: bool = False,
             engine: Engine | None = None, log=print) -> list[tuple[str, str]]:
    vs = spec.data.get("voice") or {}
    clips = vs.get("clips") or {}
    names = names or list(clips)
    eng = engine or Engine(url or vs.get("url", DEFAULT_URL))
    version = eng.version()
    names_by_style = eng.style_names()
    out_dir = spec.song_dir / "voice"
    out_dir.mkdir(exist_ok=True)
    results = []
    for name in names:
        req, extra = build_request(spec.data, name)
        h = request_hash(req)
        meta_p, wav_p = out_dir / f"{name}.json", out_dir / f"{name}.wav"
        if not force and meta_p.exists() and wav_p.exists():
            if json.loads(meta_p.read_text(encoding="utf-8")).get("request_hash") == h:
                results.append((name, "cached"))
                log(f"  {name:<14} cached")
                continue
        wav = eng.synthesize(req)
        wav_p.write_bytes(wav)
        who = names_by_style.get(req["speaker"])
        meta = {"name": name, "kind": req["kind"], "speaker": req["speaker"], "request_hash": h,
                "engine": "VOICEVOX", "engine_version": version, "credit": f"VOICEVOX:{who}" if who else "VOICEVOX",
                **extra, "request": req}
        meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        results.append((name, "generated"))
        log(f"  {name:<14} generated ({meta['credit']})")
    return results
