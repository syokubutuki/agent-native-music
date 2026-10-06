// On-disk layout of a lab:
//   <dir>/gen-0001/g0001-01.json   genome
//   <dir>/gen-0001/g0001-01.wav    rendered clip
//   <dir>/ratings.jsonl            {id, score, note, at} per line; the latest line for an id wins
//   <dir>/renders/                 longer re-renders

import fs from 'node:fs';
import path from 'node:path';
import { render } from './render.mjs';
import { encodeWav } from './wav.mjs';

const GEN_RE = /^gen-(\d{4,})$/;
const ID_RE = /^g(\d{4,})-(\d{2,})$/;

export function genDirName(gen) {
  return `gen-${String(gen).padStart(4, '0')}`;
}

export function clipId(gen, index) {
  return `g${String(gen).padStart(4, '0')}-${String(index).padStart(2, '0')}`;
}

export function listGenerations(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((name) => GEN_RE.exec(name))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

export function nextGeneration(dir) {
  const gens = listGenerations(dir);
  return gens.length ? gens[gens.length - 1] + 1 : 1;
}

export function genomePath(dir, id) {
  const m = ID_RE.exec(id);
  if (!m) throw new Error(`invalid clip id: ${id} (expected like g0001-01)`);
  return path.join(dir, genDirName(Number(m[1])), `${id}.json`);
}

export function loadGenome(dir, id) {
  const file = genomePath(dir, id);
  if (!fs.existsSync(file)) throw new Error(`no such clip: ${id} (${file})`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function listClips(dir) {
  const clips = [];
  for (const gen of listGenerations(dir)) {
    const gdir = path.join(dir, genDirName(gen));
    for (const name of fs.readdirSync(gdir).sort()) {
      if (!name.endsWith('.json')) continue;
      const genome = JSON.parse(fs.readFileSync(path.join(gdir, name), 'utf8'));
      const id = name.slice(0, -5);
      clips.push({ id, gen, genome, wav: path.join(gdir, `${id}.wav`) });
    }
  }
  return clips;
}

export function writeWav(file, genome, opts) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodeWav(render(genome, opts)));
  return file;
}

export function saveClip(dir, genome) {
  const { id, generation } = genome.meta;
  const gdir = path.join(dir, genDirName(generation));
  fs.mkdirSync(gdir, { recursive: true });
  const json = path.join(gdir, `${id}.json`);
  fs.writeFileSync(json, JSON.stringify(genome, null, 2) + '\n');
  const wav = writeWav(path.join(gdir, `${id}.wav`), genome);
  return { json, wav };
}

function ratingsPath(dir) {
  return path.join(dir, 'ratings.jsonl');
}

export function appendRating(dir, entry) {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(ratingsPath(dir), JSON.stringify(entry) + '\n');
}

// Map id -> latest rating entry.
export function loadRatings(dir) {
  const file = ratingsPath(dir);
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    map.set(entry.id, entry);
  }
  return map;
}
