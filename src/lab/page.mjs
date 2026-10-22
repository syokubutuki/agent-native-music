// Builds the listening page: one HTML file with the clip list baked in, plus compressed audio next to it.
// Ratings typed on the page live in the page's own store; `lab import` brings them back into ratings.jsonl.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listClips, loadRatings, writeWav, appendRating } from './store.mjs';
import { describeGenome } from './genome.mjs';
import { decodeWav } from './wav.mjs';

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'page', 'template.html');
const ENVELOPE_BINS = 160;

// RMS loudness per bin (all channels), normalized to the loudest bin.
export function wavEnvelope(file, bins = ENVELOPE_BINS) {
  const { channels } = decodeWav(fs.readFileSync(file));
  const frames = channels[0].length;
  const out = new Array(bins).fill(0);
  const per = Math.max(1, Math.floor(frames / bins));
  for (let b = 0; b < bins; b++) {
    let sum = 0;
    const start = b * per;
    const end = Math.min(frames, start + per);
    for (let i = start; i < end; i++) for (const ch of channels) sum += ch[i] * ch[i];
    out[b] = end > start ? Math.sqrt(sum / ((end - start) * channels.length)) : 0;
  }
  const max = Math.max(...out, 1e-9);
  return out.map((v) => Math.round((v / max) * 100) / 100);
}

export function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

function encodeAudio(wav, outFile, format) {
  if (fs.existsSync(outFile) && fs.statSync(outFile).mtimeMs >= fs.statSync(wav).mtimeMs) return;
  if (format === 'wav') {
    fs.copyFileSync(wav, outFile);
    return;
  }
  const res = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', outFile], {
    encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error(`ffmpeg failed for ${wav}: ${res.stderr || res.error?.message}`);
}

// Extra page items from songs: each `<songsDir>/<song>/page.json` lists
// [{id, group, label, title, desc, wav (relative to the song dir), durationSec, form?}].
function songItems(songsDir) {
  if (!songsDir || !fs.existsSync(songsDir)) return [];
  // newest work first: songs ordered by their most recently written audio (audio missing here counts as
  // oldest), then by folder name
  const songs = [];
  for (const name of fs.readdirSync(songsDir).sort()) {
    const manifest = path.join(songsDir, name, 'page.json');
    if (!fs.existsSync(manifest)) continue;
    const list = JSON.parse(fs.readFileSync(manifest, 'utf8')).map((item) => ({ ...item, wav: path.join(songsDir, name, item.wav) }));
    const newest = Math.max(0, ...list.map((i) => (fs.existsSync(i.wav) ? fs.statSync(i.wav).mtimeMs : 0)));
    songs.push({ name, list, newest });
  }
  songs.sort((a, b) => b.newest - a.newest || a.name.localeCompare(b.name));
  return songs.flatMap((s) => s.list);
}

// The clip list baked into a built page (its lab-data script), or null.
export function readPageData(html) {
  const m = /<script type="application\/json" id="lab-data">([\s\S]*?)<\/script>/.exec(html);
  return m ? JSON.parse(m[1]) : null;
}

// previous: the HTML of an already published page. A clip whose audio is not on this machine (song renders
// are not in git) is carried over from it as published — same audio path and envelope — and clips this
// machine does not know at all are kept as they are, so a fresh session can rebuild the page and upload
// only its new audio.
export function buildPage(dir, { outDir = path.join(dir, 'site'), format = 'mp3', songsDir, previous } = {}) {
  if (format === 'mp3' && !hasFfmpeg()) throw new Error('ffmpeg not found: install it, or use --format wav');
  const audioDir = path.join(outDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  const ratings = loadRatings(dir);
  const short = (id) => id.replace(/^g0*(\d+)-0*(\d+)$/, '$1-$2');
  const labClips = listClips(dir).map(({ id, gen, genome, wav }) => {
    if (!fs.existsSync(wav)) writeWav(wav, genome);
    const parents = genome.meta?.parents ?? [];
    return {
      id,
      group: `第${gen}世代`,
      label: id.split('-')[1],
      title: `${id} · ${parents.length ? `← ${parents.map(short).join(' + ')}` : 'ランダム生成'}`,
      desc: describeGenome(genome),
      durationSec: genome.durationSec,
      wav,
      form: genome.form ? genome.form.points : null,
    };
  });
  const extra = songItems(songsDir);
  const newestFirst = labClips.sort((a, b) => Number(b.id.slice(1, 5)) - Number(a.id.slice(1, 5)) || a.id.localeCompare(b.id));
  const before = new Map((previous ? readPageData(previous)?.clips ?? [] : []).map((c) => [c.id, c]));
  const carried = [];
  const clips = [...extra, ...newestFirst].map(({ wav, ...item }) => {
    if (!fs.existsSync(wav)) {
      const old = before.get(item.id);
      if (!old || !old.audio.endsWith(`.${format}`)) throw new Error(`missing audio for ${item.id}: ${wav}`);
      carried.push(item.id);
      const r = ratings.get(item.id);
      return { ...old, ...item, audio: old.audio, env: old.env, rating: r ? { score: r.score, note: r.note ?? '' } : old.rating ?? null };
    }
    const audioName = `${item.id}.${format}`;
    encodeAudio(wav, path.join(audioDir, audioName), format);
    const r = ratings.get(item.id);
    return {
      form: null,
      ...item,
      audio: `audio/${audioName}`,
      env: wavEnvelope(wav),
      rating: r ? { score: r.score, note: r.note ?? '' } : null,
    };
  });
  // Clips only the previous page has (published from another branch or session) are kept too, placed just
  // before the first carried-over clip, so republishing from here never drops someone else's work.
  const here = new Set(clips.map((c) => c.id));
  const foreign = [...before.values()].filter((c) => !here.has(c.id));
  if (foreign.length) {
    const at = clips.findIndex((c) => carried.includes(c.id));
    clips.splice(at < 0 ? clips.length : at, 0, ...foreign);
    carried.push(...foreign.map((c) => c.id));
  }
  // `<` escaped so clip data can never close the script tag it lives in.
  // Groups in first-appearance order: song work first, then lab generations newest first.
  const groups = [...new Set(clips.map((c) => c.group))];
  const json = JSON.stringify({ builtAt: new Date().toISOString(), groups, clips }).replace(/</g, '\\u003c');
  const html = fs.readFileSync(TEMPLATE, 'utf8').replace('__LAB_DATA__', () => json);
  const index = path.join(outDir, 'index.html');
  fs.writeFileSync(index, html);
  return { index, audioDir, clips, carried };
}

// Accepts the page store's ratings as [{id, score, note, updatedAt}] (or {id: {...}}) and appends
// only entries whose score or note differ from the ledger's latest. Returns what was appended.
export function importRatings(dir, input, knownIds) {
  const rows = Array.isArray(input) ? input : Object.entries(input).map(([id, v]) => ({ id, ...v }));
  const current = loadRatings(dir);
  const added = [];
  for (const row of rows) {
    const { id } = row;
    if (!knownIds.has(id)) throw new Error(`unknown clip id in import: ${id}`);
    const score = row.score;
    if (score === null || score === undefined) continue; // cleared or note-only drafts stay on the page
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error(`${id}: score must be an integer 1-5`);
    const note = typeof row.note === 'string' ? row.note.trim() : '';
    const prev = current.get(id);
    if (prev && prev.score === score && (prev.note ?? '') === note) continue;
    const entry = { id, score, note, at: row.updatedAt ?? new Date().toISOString() };
    appendRating(dir, entry);
    added.push(entry);
  }
  return added;
}
