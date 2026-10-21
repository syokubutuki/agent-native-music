"""Web プレーヤー用楽曲 (anm-score/1 JSON) の歌パートを VOICEVOX で歌声 WAV にする。

前提: VOICEVOX ENGINE が起動していること（例）
    docker run -d -p 50021:50021 voicevox/voicevox_engine:cpu-ubuntu24.04-0.25.2

使い方:
    python tools/voicevox_sing.py songs_web/scores.json songs_web/voices.yaml --out renders/web_vocals

voices.yaml の形式（曲 id・版・トラック番号ごとに声を決める。音楽的判断はこのファイル側に置く）:
    utsuranai-v1-p0: {style: 3002, octave: 0, volume: 1.0}

出力 WAV は曲の元テンポで beat 0 = 0 秒から始まる（プレーヤーの startVocals の前提と同じ）。
ノートの開始はプレーヤーと同じスウィング（8分裏 swing/6 拍、16分裏 swing/12 拍）で遅らせる。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import subprocess
import urllib.request

import yaml

ENGINE = "http://localhost:50021"
SING_TEACHER = 6000  # 歌唱の音高・音素長を決める歌唱用スタイル（波音リツ）
FPS = 24000 / 256    # VOICEVOX のフレームレート
TPB = 12
MIN_REST = 0.08  # 秒。これより短い休符は作らない
_STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(name: str) -> int:
    n, rest = _STEP[name[0]], name[1:]
    while rest and rest[0] in "#b":
        n += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    return n + 12 * (int(rest) + 1)


def swing_delay(beat: float, swing: float) -> float:
    m = round(beat * TPB) % TPB
    if m == 6:
        return swing / 6
    if m % 6 == 3:
        return swing / 12
    return 0.0


def build_score(song: dict, track: dict, octave: int) -> dict:
    spb = 60 / song["bpm"]
    events = []
    for beat, dur, pitch, _vel, *lyric in sorted(track["notes"], key=lambda n: n[0]):
        sw = song.get("swing", 0)
        start, stop = (beat + swing_delay(beat, sw)) * spb, (beat + dur + swing_delay(beat + dur, sw)) * spb
        events.append([start, stop, midi(pitch) + 12 * octave, lyric[0] if lyric else "ら"])
    for a, b in zip(events, events[1:]):
        # 次の音に食い込む分は切る（単旋律）。ごく短い隙間は前の音を伸ばしてつなぐ:
        # 子音は直前の休符から時間を借りるため、数フレームの休符があるとエンジンが失敗する
        a[1] = b[0] if b[0] - a[1] < MIN_REST else min(a[1], b[0])
    end = song["bars"] * song["beatsPerBar"] * spb

    notes, cur = [], 0  # cur: フレーム位置。境界を丸めて積み上げ、累積ずれを出さない
    def push(key, until, lyric):
        nonlocal cur
        f = round(until * FPS)
        if f > cur:
            notes.append({"key": key, "frame_length": f - cur, "lyric": lyric})
            cur = f
    for start, stop, key, lyric in events:
        push(None, start, "")
        push(key, stop, lyric)
    push(None, end, "")
    if notes[0]["key"] is not None:  # 先頭は休符である必要がある
        raise ValueError("score must start with a rest")
    return {"notes": notes}


def post(path: str, body: dict) -> bytes:
    req = urllib.request.Request(ENGINE + path, json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("scores")
    ap.add_argument("voices")
    ap.add_argument("--out", default="renders/web_vocals")
    ap.add_argument("--only", help="この key だけ作る（例: utsuranai-v1-p0）")
    a = ap.parse_args()
    songs = {f'{s["id"]}-v{s["version"]}': s for s in json.loads(pathlib.Path(a.scores).read_text())}
    voices = yaml.safe_load(pathlib.Path(a.voices).read_text())
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for key, v in voices.items():
        if a.only and key != a.only:
            continue
        sid, part = key.rsplit("-p", 1)
        song = songs[sid]
        score = build_score(song, song["tracks"][int(part)], v.get("octave", 0))
        query = json.loads(post(f"/sing_frame_audio_query?speaker={SING_TEACHER}", score))
        query["volumeScale"] = v.get("volume", 1.0)
        query["outputSamplingRate"] = 48000
        wav = post(f"/frame_synthesis?speaker={v['style']}", query)
        path = out / f"{key}.wav"
        path.write_bytes(wav)
        # Artifact の assets は WAV を受け付けないため、プレーヤーの「ページに保存」と同じ webm/opus も作る
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-c:a", "libopus", "-b:a", "128k",
                        str(path.with_suffix(".webm"))], check=True)
        manifest[key] = {"style": v["style"], "sha256": hashlib.sha256(wav).hexdigest(), "notes": len(score["notes"])}
        print(key, v["style"], f"{len(wav) / 1e6:.1f}MB")
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
