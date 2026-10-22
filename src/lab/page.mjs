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
  const items = [];
  for (const name of fs.readdirSync(songsDir).sort()) {
    const manifest = path.join(songsDir, name, 'page.json');
    if (!fs.existsSync(manifest)) continue;
    for (const item of JSON.parse(fs.readFileSync(manifest, 'utf8'))) {
      items.push({ ...item, wav: path.join(songsDir, name, item.wav) });
    }
  }
  return items;
}

// The clip list baked into a built page (the published one, for `reuse`).
export function readPageData(file) {
  const m = fs.readFileSync(file, 'utf8').match(/<script type="application\/json" id="lab-data">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`no lab-data in ${file}`);
  return JSON.parse(m[1]);
}

// reuse: a previously published index.html. Song items whose WAV is not on this machine (renders are
// not committed) keep that page's entry — same audio path and envelope — so a fresh checkout can add
// new songs to the page without re-rendering every old version; only the new MP3s need uploading.
export function buildPage(dir, { outDir = path.join(dir, 'site'), format = 'mp3', songsDir, reuse } = {}) {
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
  const previous = new Map((reuse ? readPageData(reuse).clips : []).map((c) => [c.id, c]));
  const clips = [...extra, ...newestFirst].map(({ wav, ...item }) => {
    if (!fs.existsSync(wav)) {
      const prev = previous.get(item.id);
      if (!prev) throw new Error(`missing audio for ${item.id}: ${wav}`);
      const r = ratings.get(item.id);
      return { ...prev, ...item, audio: prev.audio, env: prev.env, rating: r ? { score: r.score, note: r.note ?? '' } : prev.rating ?? null };
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
  // `<` escaped so clip data can never close the script tag it lives in.
  // Groups in first-appearance order: song work first, then lab generations newest first.
  // With reuse, groups keep the published page's order and groups new since then go on top; inside a
  // group, clips that were not on the published page come first.
  let groups = [...new Set(clips.map((c) => c.group))];
  if (reuse) {
    const before = readPageData(reuse).groups ?? [];
    groups = [...groups.filter((g) => !before.includes(g)), ...before.filter((g) => groups.includes(g))];
    clips.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || previous.has(a.id) - previous.has(b.id));
  }
  const json = JSON.stringify({ builtAt: new Date().toISOString(), groups, clips }).replace(/</g, '\\u003c');
  const html = fs.readFileSync(TEMPLATE, 'utf8').replace('__LAB_DATA__', () => json);
  const index = path.join(outDir, 'index.html');
  fs.writeFileSync(index, html);
  return { index, audioDir, clips };
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
