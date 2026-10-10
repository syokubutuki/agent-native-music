// Builds the listening page: one HTML file with the clip list baked in, plus compressed audio next to it.
// Ratings typed on the page live in the page's own store; `lab import` brings them back into ratings.jsonl.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listClips, loadRatings, writeWav, appendRating } from './store.mjs';
import { describeGenome } from './genome.mjs';

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'page', 'template.html');
const ENVELOPE_BINS = 160;

// RMS loudness per bin, normalized to the loudest bin, from a 16-bit stereo WAV written by wav.mjs.
export function wavEnvelope(file, bins = ENVELOPE_BINS) {
  const buf = fs.readFileSync(file);
  const frames = (buf.length - 44) >> 2;
  const out = new Array(bins).fill(0);
  const per = Math.max(1, Math.floor(frames / bins));
  for (let b = 0; b < bins; b++) {
    let sum = 0;
    const start = b * per;
    const end = Math.min(frames, start + per);
    for (let i = start; i < end; i++) {
      const l = buf.readInt16LE(44 + i * 4) / 32768;
      const r = buf.readInt16LE(46 + i * 4) / 32768;
      sum += (l * l + r * r) / 2;
    }
    out[b] = end > start ? Math.sqrt(sum / (end - start)) : 0;
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

export function buildPage(dir, { outDir = path.join(dir, 'site'), format = 'mp3' } = {}) {
  if (format === 'mp3' && !hasFfmpeg()) throw new Error('ffmpeg not found: install it, or use --format wav');
  const audioDir = path.join(outDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  const ratings = loadRatings(dir);
  const clips = listClips(dir).map(({ id, gen, genome, wav }) => {
    if (!fs.existsSync(wav)) writeWav(wav, genome);
    const audioName = `${id}.${format}`;
    encodeAudio(wav, path.join(audioDir, audioName), format);
    const r = ratings.get(id);
    return {
      id,
      gen,
      parents: genome.meta?.parents ?? [],
      desc: describeGenome(genome),
      durationSec: genome.durationSec,
      audio: `audio/${audioName}`,
      env: wavEnvelope(wav),
      form: genome.form ? genome.form.points : null,
      rating: r ? { score: r.score, note: r.note ?? '' } : null,
    };
  });
  // `<` escaped so clip data can never close the script tag it lives in.
  const json = JSON.stringify({ builtAt: new Date().toISOString(), clips }).replace(/</g, '\\u003c');
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
