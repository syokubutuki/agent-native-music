// 使い方: node tools/export-musicxml.mjs songs/xxx.json [出力先ディレクトリ(既定 exports/musicxml)]
// 歌のパート(vocal: true)を MusicXML にして、NEUTRINO などの歌声合成ソフトに渡せる形で書き出す。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScore } from './lib/score.mjs';

const DIV = 12; // divisions per quarter note (= ticks per beat in the player)
const TYPES = { 48: 'whole', 36: 'half', 24: 'half', 18: 'quarter', 12: 'quarter', 9: 'eighth', 6: 'eighth', 3: '16th' };
const DOTTED = new Set([36, 18, 9]);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function noteXml(dur, pitch, lyric) {
  const type = TYPES[dur] ? `<type>${TYPES[dur]}</type>${DOTTED.has(dur) ? '<dot/>' : ''}` : '';
  if (!pitch) return `<note><rest/><duration>${dur}</duration><voice>1</voice>${type}</note>`;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(pitch);
  const alter = m[2] === '#' ? '<alter>1</alter>' : m[2] === 'b' ? '<alter>-1</alter>' : '';
  return `<note><pitch><step>${m[1]}</step>${alter}<octave>${m[3]}</octave></pitch><duration>${dur}</duration><voice>1</voice>${type}`
    + `<lyric number="1"><syllabic>single</syllabic><text>${esc(lyric)}</text></lyric></note>`;
}

export function toMusicXml(song, track = song.tracks.find((t) => t.vocal)) {
  if (!track) throw new Error('no vocal track (set "vocal": true on a lead track)');
  const errors = validateScore(song);
  if (errors.length) throw new Error('invalid score:\n- ' + errors.join('\n- '));
  const barTicks = song.beatsPerBar * DIV;
  const notes = [...track.notes].sort((a, b) => a[0] - b[0]).map(([beat, dur, pitch, , lyric]) => ({ s: Math.round(beat * DIV), d: Math.round(dur * DIV), pitch, lyric }));
  const measures = [];
  for (let b = 0; b < song.bars; b++) {
    const lo = b * barTicks, hi = lo + barTicks;
    let pos = lo, body = '';
    for (const n of notes.filter((x) => x.s >= lo && x.s < hi)) {
      if (n.s > pos) body += noteXml(n.s - pos, null);
      body += noteXml(n.d, n.pitch, n.lyric);
      pos = n.s + n.d;
    }
    if (pos < hi) body += noteXml(hi - pos, null);
    const head = b === 0
      ? `<attributes><divisions>${DIV}</divisions><key><fifths>0</fifths></key><time><beats>${song.beatsPerBar}</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`
        + `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${song.bpm}</per-minute></metronome></direction-type><sound tempo="${song.bpm}"/></direction>`
      : '';
    measures.push(`<measure number="${b + 1}">${head}${body}</measure>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1"><work><work-title>${esc(song.title)}</work-title></work>
<part-list><score-part id="P1"><part-name>${esc(track.name)}</part-name></score-part></part-list>
<part id="P1">
${measures.join('\n')}
</part>
</score-partwise>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const songPath = resolve(process.argv[2] ?? '');
  const song = JSON.parse(readFileSync(songPath, 'utf8'));
  const outDir = resolve(process.argv[3] ?? resolve(root, 'exports/musicxml'));
  mkdirSync(outDir, { recursive: true });
  const vocals = song.tracks.filter((t) => t.vocal);
  vocals.forEach((tk, i) => {
    const out = resolve(outDir, basename(songPath, '.json') + (i ? `-part${i + 1}` : '') + '.musicxml');
    writeFileSync(out, toMusicXml(song, tk));
    console.log('wrote', out, `(${tk.name})`);
  });
}
