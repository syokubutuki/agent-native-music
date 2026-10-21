#!/usr/bin/env python3
"""楽譜データ(songs/*.json)の歌のパートを、あなたのPCで動いている VOICEVOX エンジンに歌わせて WAV にする。

使い方(VOICEVOX を起動しておく。エンジンは既定で http://127.0.0.1:50021):
  python tools/voicevox-sing.py --list                                   # 歌えるキャラクターと style の一覧
  python tools/voicevox-sing.py songs/sketch-j-utsuranai-v1.json         # 1つめの歌のパート → WAV
  python tools/voicevox-sing.py songs/sketch-j-utsuranai-v1.json --track 1   # 2つめ(合いの手)

標準ライブラリだけで動く(pip install は不要)。VOICEVOX の「ソング」機能が入った版(エンジン 0.20 以降)が必要。
出力した WAV は、試聴ページの「歌声を重ねる」で選ぶ。キャラクターごとの利用規約とクレジット表記は、使う人が確認すること。
"""
import argparse, json, struct, sys, urllib.error, urllib.request, wave
from pathlib import Path

FPS = 24000 / 256  # VOICEVOX の歌は 1 フレーム = 256 サンプル(24kHz) = 93.75 フレーム/秒
SEMI = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi(name: str) -> int:
    m = name[0], name[1:-1], int(name[-1])
    return 12 * (m[2] + 1) + SEMI[m[0]] + (1 if m[1] == '#' else -1 if m[1] == 'b' else 0)


def hira_to_kata(s: str) -> str:
    return ''.join(chr(ord(c) + 0x60) if 'ぁ' <= c <= 'ゖ' else c for c in s)


def vocal_tracks(song):
    return [t for t in song['tracks'] if t.get('vocal')]


def build_score(song, track, transpose=0, katakana=False):
    """歌のパートを VOICEVOX の Score にする。最初は休符(key=None, lyric='')で始める。
    拍→フレームは「累積の位置を丸める」ことで、音が重なったりずれが溜まったりしないようにする。"""
    sec_per_beat = 60.0 / song['bpm']
    fr = lambda beats: int(round(beats * sec_per_beat * FPS))
    notes_in = sorted(track['notes'], key=lambda n: n[0])
    out, cursor = [], 0
    for n in notes_in:
        beat, dur, pitch, _vel, lyric = (n + [None] * 5)[:5]
        start, end = fr(beat), fr(beat + dur)
        if end <= start:
            end = start + 1
        if start > cursor:
            out.append({'key': None, 'frame_length': start - cursor, 'lyric': ''})
        elif start < cursor:  # 丸めで食い込んだぶんは前の音を削らず、この音を詰める
            start = cursor
            if end <= start:
                end = start + 1
        out.append({'key': midi(pitch) + transpose, 'frame_length': end - start, 'lyric': hira_to_kata(lyric) if katakana else lyric})
        cursor = end
    total = fr(song['bars'] * song['beatsPerBar'])
    if total > cursor:
        out.append({'key': None, 'frame_length': total - cursor, 'lyric': ''})
    if not out or out[0]['key'] is not None:
        out.insert(0, {'key': None, 'frame_length': 1, 'lyric': ''})  # 先頭は必ず休符
    return {'notes': out}


def call(base, path, *, method='GET', body=None, params=None):
    url = base.rstrip('/') + path + ('?' + '&'.join(f'{k}={v}' for k, v in params.items()) if params else '')
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={'Content-Type': 'application/json'} if data else {})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.read(), r.headers.get('Content-Type', '')
    except urllib.error.HTTPError as e:
        sys.exit(f'エンジンがエラーを返しました: {method} {path} -> {e.code}\n{e.read().decode("utf-8", "replace")[:800]}')
    except urllib.error.URLError as e:
        sys.exit(f'VOICEVOX エンジンに接続できません({base})。VOICEVOX を起動してから、もう一度実行してください。\n{e}')


def list_singers(base):
    raw, _ = call(base, '/singers')
    return json.loads(raw)


def pick_styles(singers, want_query, want_synth, name=None):
    """/singers の style から、sing_frame_audio_query 用と frame_synthesis 用の id を選ぶ。type の値はエンジンの版で違うことがあるので、見つからなければ一覧を出して終わる。"""
    q_types, s_types = ('singing_teacher', 'sing'), ('frame_decode', 'sing')
    q = s = None
    for sp in singers:
        if name and name not in sp.get('name', ''):
            continue
        for st in sp.get('styles', []):
            if q is None and st.get('type') in q_types:
                q = st['id']
            if s is None and st.get('type') in s_types:
                s = st['id']
    return want_query if want_query is not None else q, want_synth if want_synth is not None else s


def write_wav(path, wav_bytes):
    Path(path).write_bytes(wav_bytes)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('song', nargs='?', help='楽譜データ(songs/xxx.json)')
    ap.add_argument('--track', type=int, default=0, help='歌のパートの番号(0 から。既定 0)')
    ap.add_argument('--engine', default='http://127.0.0.1:50021')
    ap.add_argument('--list', action='store_true', help='歌えるキャラクターと style を一覧にして終わる')
    ap.add_argument('--singer', help='キャラクター名の一部(自動で style を選ぶとき)')
    ap.add_argument('--query-speaker', type=int, help='sing_frame_audio_query に使う style id')
    ap.add_argument('--speaker', type=int, help='frame_synthesis に使う style id')
    ap.add_argument('--transpose', type=int, default=0, help='半音単位で移調(声の音域に合わせる。例: -12)')
    ap.add_argument('--katakana', action='store_true', help='歌詞をカタカナで送る(ひらがなでエラーになるとき)')
    ap.add_argument('--out', help='出力の WAV(既定: dist/voicevox/<曲>-p<番号>.wav)')
    a = ap.parse_args(argv)

    if a.list:
        for sp in list_singers(a.engine):
            print(sp.get('name'), [(st.get('name'), st.get('id'), st.get('type')) for st in sp.get('styles', [])])
        return 0
    if not a.song:
        ap.error('楽譜データ(songs/xxx.json)を指定してください')
    song = json.loads(Path(a.song).read_text(encoding='utf-8'))
    vts = vocal_tracks(song)
    if a.track >= len(vts):
        sys.exit(f'歌のパートは {len(vts)} 個です(--track は 0〜{len(vts) - 1})')
    track = vts[a.track]
    score = build_score(song, track, a.transpose, a.katakana)
    qid, sid = pick_styles(list_singers(a.engine) if (a.query_speaker is None or a.speaker is None) else [], a.query_speaker, a.speaker, a.singer)
    if qid is None or sid is None:
        sys.exit('歌える style を自動で選べませんでした。`--list` で一覧を見て、--query-speaker と --speaker に id を指定してください。')
    print(f'{song["title"]} / {track["name"]} / 音符 {sum(1 for n in score["notes"] if n["key"] is not None)} 個 / style 問い合わせ {qid}・合成 {sid}')
    raw, _ = call(a.engine, '/sing_frame_audio_query', method='POST', body=score, params={'speaker': qid})
    query = json.loads(raw)
    wav, _ = call(a.engine, '/frame_synthesis', method='POST', body=query, params={'speaker': sid})
    out = a.out or str(Path('dist/voicevox') / f'{Path(a.song).stem}-p{a.track}.wav')
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    write_wav(out, wav)
    print('書き出しました:', out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
