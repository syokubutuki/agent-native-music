// 歌詞の「韻の濃さ」を数える。使い方: node tools/rhyme.mjs songs/xxx.json
// 母音(あいうえお、ん)の列にして、行どうしの語尾の一致(踏み韻)と、行の中のくり返し(内部韻)を見る。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROWS = { あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o' };
const COL = 'あいうえお', LINES = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'やいゆえよ', 'らりるれろ', 'わいうえを', 'がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ', 'ぁぃぅぇぉ'];
const V = 'aiueo';
const table = { ん: 'N' };
for (const row of LINES) [...row].forEach((c, i) => { table[c] ??= V[i]; });
table['や'] = 'a'; table['ゆ'] = 'u'; table['よ'] = 'o'; table['ゃ'] = 'a'; table['ゅ'] = 'u'; table['ょ'] = 'o';

export const hira = (x) => x.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export function morae(text) { // 小さい ゃゅょ は直前の音とひとつにする
  const out = [];
  for (const c of hira(text).replace(/[\s、。!?]/g, '')) {
    if ('ゃゅょ'.includes(c) && out.length) out[out.length - 1] += c; else out.push(c);
  }
  return out;
}
export const vowels = (text) => morae(text).map((m) => table[m.slice(-1)] ?? '?').join('');
const suffixLen = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; };
export function analyze(lines) {
  const vs = lines.map(vowels);
  const ends = vs.slice(1).map((v, i) => suffixLen(vs[i], v));
  const inner = vs.map((v) => { const seen = new Map(); let rep = 0; for (let i = 0; i + 3 <= v.length; i++) { const g = v.slice(i, i + 3); if (seen.has(g)) rep++; seen.set(g, 1); } return rep / Math.max(1, v.length - 2); });
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return { vowels: vs, endMatch: avg(ends), innerRepeat: avg(inner), perLine: lines.map((l, i) => ({ text: l, endWithPrev: i ? ends[i - 1] : null, inner: Math.round(inner[i] * 100) / 100 })) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const song = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const r = analyze(song.lyrics.map((l) => l.text));
  console.log(`${song.title}: 語尾の一致(平均) ${r.endMatch.toFixed(2)} / 行内のくり返し ${r.innerRepeat.toFixed(2)}`);
  for (const l of r.perLine) console.log(`  末尾一致 ${l.endWithPrev ?? '-'}  行内 ${l.inner}  ${l.text}`);
}
