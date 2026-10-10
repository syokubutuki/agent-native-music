#!/usr/bin/env node
// sound-lab CLI: generate clips, rate them by ear, evolve the favourites.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createRng, seedFromTime } from '../src/lab/rng.mjs';
import {
  randomGenome,
  mutateGenome,
  crossover,
  validateGenome,
  describeGenome,
  DEFAULT_DURATION_SEC,
} from '../src/lab/genome.mjs';
import {
  nextGeneration,
  clipId,
  saveClip,
  loadGenome,
  listClips,
  appendRating,
  loadRatings,
  writeWav,
  genomePath,
} from '../src/lab/store.mjs';
import { buildPage, importRatings } from '../src/lab/page.mjs';

const USAGE = `usage: node bin/lab.mjs <command> [options]

commands:
  new     [--count 8] [--duration 30] [--seed N]                     random new generation
  evolve  [--count 8] [--top 3 | --parents id,id] [--strength 0.3] [--duration s] [--seed N]
                                                                    next generation from rated favourites
  rate    <id> <1-5> [note...]                                      record a rating (latest wins)
  list    [--gen N] [--rated] [--top N]                             show clips and ratings
  render  <id | genome.json> [--duration s] [--out path]            re-render (e.g. longer)
  page    [--out dir] [--format mp3|wav]                            build the listening page (default <labDir>/site)
  import  <ratings.json>                                            merge ratings saved on the page into ratings.jsonl

common: --dir <labDir>  (default ./lab, or $LAB_DIR)`;

const OPTIONS = {
  dir: { type: 'string' },
  count: { type: 'string' },
  duration: { type: 'string' },
  seed: { type: 'string' },
  top: { type: 'string' },
  parents: { type: 'string' },
  strength: { type: 'string' },
  gen: { type: 'string' },
  rated: { type: 'boolean' },
  out: { type: 'string' },
  format: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

function fail(msg) {
  console.error(`[lab] ${msg}`);
  process.exit(1);
}

function numOpt(value, name, { int = false, min = -Infinity, max = Infinity } = {}) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || (int && !Number.isInteger(n)) || n < min || n > max) {
    fail(`--${name} must be ${int ? 'an integer' : 'a number'} in [${min}, ${max}] (got ${value})`);
  }
  return n;
}

function rel(file) {
  const r = path.relative(process.cwd(), file);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : file;
}

function cmdNew(dir, opts) {
  const count = numOpt(opts.count, 'count', { int: true, min: 1, max: 100 }) ?? 8;
  const durationSec = numOpt(opts.duration, 'duration', { min: 0.1, max: 3600 }) ?? DEFAULT_DURATION_SEC;
  const seed = numOpt(opts.seed, 'seed', { int: true, min: 0, max: 0xffffffff }) ?? seedFromTime();
  const rng = createRng(seed);
  const gen = nextGeneration(dir);
  console.log(`[lab] generation ${gen} (seed ${seed})`);
  for (let i = 1; i <= count; i++) {
    const id = clipId(gen, i);
    const genome = validateGenome(
      randomGenome(rng, { durationSec, meta: { id, generation: gen, parents: [], strength: 0 } }),
    );
    const { wav } = saveClip(dir, genome);
    console.log(`  ${id}  ${describeGenome(genome).padEnd(53)} ${rel(wav)}`);
  }
}

function pickParents(dir, opts) {
  if (opts.parents) {
    const ids = opts.parents.split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) fail('--parents is empty');
    return ids.map((id) => ({ id, genome: loadGenome(dir, id) }));
  }
  const top = numOpt(opts.top, 'top', { int: true, min: 1, max: 100 }) ?? 3;
  const ratings = [...loadRatings(dir).values()];
  if (!ratings.length) fail('no ratings yet: listen to some clips and run `lab rate <id> <1-5>` first');
  ratings.sort((a, b) => b.score - a.score || (a.at < b.at ? 1 : -1));
  return ratings.slice(0, top).map((r) => ({ id: r.id, genome: loadGenome(dir, r.id) }));
}

function cmdEvolve(dir, opts) {
  const count = numOpt(opts.count, 'count', { int: true, min: 1, max: 100 }) ?? 8;
  const strength = numOpt(opts.strength, 'strength', { min: 0, max: 1 }) ?? 0.3;
  const durationSec = numOpt(opts.duration, 'duration', { min: 0.1, max: 3600 });
  const seed = numOpt(opts.seed, 'seed', { int: true, min: 0, max: 0xffffffff }) ?? seedFromTime();
  const parents = pickParents(dir, opts);
  const rng = createRng(seed);
  const gen = nextGeneration(dir);
  console.log(`[lab] generation ${gen} from ${parents.map((p) => p.id).join(', ')} (strength ${strength}, seed ${seed})`);
  for (let i = 1; i <= count; i++) {
    const a = rng.pick(parents);
    const others = parents.filter((p) => p !== a);
    const b = others.length && rng.chance(0.5) ? rng.pick(others) : null;
    const base = b ? crossover(a.genome, b.genome, rng) : a.genome;
    const id = clipId(gen, i);
    const child = mutateGenome(base, rng, strength);
    if (durationSec !== undefined) child.durationSec = durationSec;
    child.meta = { id, generation: gen, parents: b ? [a.id, b.id] : [a.id], strength };
    validateGenome(child);
    const { wav } = saveClip(dir, child);
    console.log(`  ${id}  <- ${child.meta.parents.join('+').padEnd(18)} ${describeGenome(child).padEnd(53)} ${rel(wav)}`);
  }
}

function cmdRate(dir, positionals) {
  const [id, scoreArg, ...noteParts] = positionals;
  if (!id || scoreArg === undefined) fail('usage: lab rate <id> <1-5> [note...]');
  const score = Number(scoreArg);
  if (!Number.isInteger(score) || score < 1 || score > 5) fail(`score must be an integer 1-5 (got ${scoreArg})`);
  if (!fs.existsSync(genomePath(dir, id))) fail(`no such clip: ${id}`);
  const entry = { id, score, note: noteParts.join(' '), at: new Date().toISOString() };
  appendRating(dir, entry);
  console.log(`[lab] ${id} = ${score}${entry.note ? `  "${entry.note}"` : ''}`);
}

function cmdList(dir, opts) {
  const gen = numOpt(opts.gen, 'gen', { int: true, min: 1 });
  const top = numOpt(opts.top, 'top', { int: true, min: 1 });
  const ratings = loadRatings(dir);
  let clips = listClips(dir).map((c) => ({ ...c, rating: ratings.get(c.id) }));
  if (gen !== undefined) clips = clips.filter((c) => c.gen === gen);
  if (opts.rated || top !== undefined) clips = clips.filter((c) => c.rating);
  if (top !== undefined) clips = clips.sort((a, b) => b.rating.score - a.rating.score).slice(0, top);
  if (!clips.length) {
    console.log('[lab] no clips');
    return;
  }
  for (const c of clips) {
    const score = c.rating ? `★${c.rating.score}` : '  -';
    const parents = c.genome.meta?.parents?.length ? `<- ${c.genome.meta.parents.join('+')}` : '';
    const note = c.rating?.note ? `"${c.rating.note}"` : '';
    console.log(`${c.id}  ${score}  ${describeGenome(c.genome).padEnd(53)} ${parents.padEnd(21)} ${note}`.trimEnd());
  }
}

function cmdRender(dir, positionals, opts) {
  const [target] = positionals;
  if (!target) fail('usage: lab render <id | genome.json> [--duration s] [--out path]');
  const genome = target.endsWith('.json') ? JSON.parse(fs.readFileSync(target, 'utf8')) : loadGenome(dir, target);
  try {
    validateGenome(genome);
  } catch (err) {
    fail(`invalid genome: ${err.message}`);
  }
  const durationSec = numOpt(opts.duration, 'duration', { min: 0.1, max: 3600 }) ?? genome.durationSec;
  const name = genome.meta?.id ?? path.basename(target, '.json');
  const out = opts.out ?? path.join(dir, 'renders', `${name}-${durationSec}s.wav`);
  const started = Date.now();
  writeWav(out, genome, { durationSec });
  console.log(`[lab] ${rel(out)}  (${durationSec}s, ${((Date.now() - started) / 1000).toFixed(1)}s to render)`);
}

function cmdPage(dir, opts) {
  const format = opts.format ?? 'mp3';
  if (!['mp3', 'wav'].includes(format)) fail(`--format must be mp3 or wav (got ${format})`);
  const { index, clips } = buildPage(dir, { outDir: opts.out ? path.resolve(opts.out) : undefined, format });
  console.log(`[lab] ${rel(index)}  (${clips.length} clips, ${format})`);
}

function cmdImport(dir, positionals) {
  const [file] = positionals;
  if (!file) fail('usage: lab import <ratings.json>');
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  const known = new Set(listClips(dir).map((c) => c.id));
  const added = importRatings(dir, input, known);
  for (const r of added) console.log(`[lab] ${r.id} = ${r.score}${r.note ? `  "${r.note}"` : ''}`);
  console.log(`[lab] imported ${added.length} rating(s)`);
}

function main() {
  let parsed;
  try {
    parsed = parseArgs({ args: process.argv.slice(2), options: OPTIONS, allowPositionals: true });
  } catch (err) {
    fail(`${err.message}\n\n${USAGE}`);
  }
  const { values: opts, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (opts.help || !command) {
    console.log(USAGE);
    return;
  }
  const dir = path.resolve(opts.dir ?? process.env.LAB_DIR ?? 'lab');
  try {
    switch (command) {
      case 'new':
        return cmdNew(dir, opts);
      case 'evolve':
        return cmdEvolve(dir, opts);
      case 'rate':
        return cmdRate(dir, rest);
      case 'list':
        return cmdList(dir, opts);
      case 'render':
        return cmdRender(dir, rest, opts);
      case 'page':
        return cmdPage(dir, opts);
      case 'import':
        return cmdImport(dir, rest);
      default:
        fail(`unknown command: ${command}\n\n${USAGE}`);
    }
  } catch (err) {
    fail(err.message);
  }
}

main();
