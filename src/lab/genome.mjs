import {
  VOICE_TYPES,
  VOICE_COMMON,
  VOICE_SPECIFIC,
  TUNING_TYPES,
  TUNING_SPECS,
  BREAK_SPEC,
  MASTER_SPEC,
  MAX_VOICES,
  VOICE_FORM,
  randomFields,
  mutateFields,
  validateFields,
} from './params.mjs';
import { randomForm, mutateForm, validateForm, formSparkline } from './form.mjs';

// v1: static loop + one break. v2 adds `form` (energy curve) and per-voice `entry`.
// v1 genomes still validate and render exactly as before; mutate/crossover upgrade them to v2.
export const GENOME_VERSION = 2;
export const SUPPORTED_VERSIONS = [1, 2];
export const DEFAULT_DURATION_SEC = 30;
export const DEFAULT_SAMPLE_RATE = 44100;

// Keep pattern parameters consistent with each other (pulses <= steps, rotate < steps).
export function normalizeVoice(voice) {
  const v = { ...voice };
  v.pulses = Math.min(v.pulses, v.steps);
  v.rotate = Math.min(v.rotate, v.steps - 1);
  return v;
}

export function randomVoice(rng, type = rng.pick(VOICE_TYPES)) {
  return normalizeVoice({
    type,
    ...randomFields(VOICE_COMMON, rng),
    ...randomFields(VOICE_SPECIFIC[type], rng),
    ...randomFields(VOICE_FORM, rng),
  });
}

// The earliest-entering voice always starts at 0 so the clip never opens on silence by construction.
function normalizeEntries(voices) {
  const min = Math.min(...voices.map((v) => v.entry));
  return voices.map((v) => (v.entry === min ? { ...v, entry: 0 } : v));
}

export function upgradeGenome(g, rng) {
  if (g.version !== 1) return g;
  return {
    ...g,
    version: 2,
    voices: normalizeEntries(g.voices.map((v) => ({ ...v, ...randomFields(VOICE_FORM, rng) }))),
    form: randomForm(rng),
  };
}

function randomTuning(rng, type = rng.pick(TUNING_TYPES)) {
  return { type, ...randomFields(TUNING_SPECS[type], rng) };
}

export function randomGenome(rng, opts = {}) {
  const voiceCount = rng.int(2, 4);
  return {
    version: GENOME_VERSION,
    seed: rng.uint32(),
    durationSec: opts.durationSec ?? DEFAULT_DURATION_SEC,
    sampleRate: opts.sampleRate ?? DEFAULT_SAMPLE_RATE,
    tuning: randomTuning(rng),
    voices: normalizeEntries(Array.from({ length: voiceCount }, () => randomVoice(rng))),
    break: randomFields(BREAK_SPEC, rng),
    master: randomFields(MASTER_SPEC, rng),
    form: randomForm(rng),
    meta: { ...(opts.meta ?? {}) },
  };
}

function mutateVoice(voice, rng, strength) {
  // Occasionally switch synthesis type entirely: keep the rhythmic/pitch skeleton, re-roll the timbre.
  if (rng.chance(strength * 0.15)) {
    const type = rng.pick(VOICE_TYPES.filter((t) => t !== voice.type));
    const common = Object.fromEntries(Object.keys(VOICE_COMMON).map((k) => [k, voice[k]]));
    return normalizeVoice({ type, ...common, ...randomFields(VOICE_SPECIFIC[type], rng), entry: voice.entry });
  }
  const common = mutateFields(VOICE_COMMON, voice, rng, strength);
  const specific = mutateFields(VOICE_SPECIFIC[voice.type], voice, rng, strength);
  const entry = mutateFields(VOICE_FORM, voice, rng, strength);
  return normalizeVoice({ ...voice, ...common, ...specific, ...entry, type: voice.type });
}

export function mutateGenome(parent, rng, strength = 0.3) {
  const genome = upgradeGenome(parent, rng);
  const s = Math.min(1, Math.max(0, strength));
  let voices = genome.voices.map((v) => mutateVoice(v, rng, s));
  if (voices.length < MAX_VOICES && rng.chance(s * 0.2)) voices.push(randomVoice(rng));
  if (voices.length > 1 && rng.chance(s * 0.2)) voices.splice(rng.int(0, voices.length - 1), 1);

  let tuning;
  if (rng.chance(s * 0.1)) tuning = randomTuning(rng);
  else tuning = { ...mutateFields(TUNING_SPECS[genome.tuning.type], genome.tuning, rng, s), type: genome.tuning.type };

  return {
    ...genome,
    seed: rng.chance(s * 0.2) ? rng.uint32() : genome.seed,
    tuning,
    voices: normalizeEntries(voices),
    break: mutateFields(BREAK_SPEC, genome.break, rng, s),
    master: mutateFields(MASTER_SPEC, genome.master, rng, s),
    form: mutateForm(genome.form, rng, s),
    meta: { ...genome.meta },
  };
}

// Child takes voices drawn from both parents; global settings come from one of them.
export function crossover(parentA, parentB, rng) {
  const a = upgradeGenome(parentA, rng);
  const b = upgradeGenome(parentB, rng);
  const pool = [...a.voices, ...b.voices];
  const lo = Math.min(a.voices.length, b.voices.length);
  const hi = Math.min(MAX_VOICES, Math.max(a.voices.length, b.voices.length));
  const count = rng.int(lo, hi);
  const voices = [];
  const taken = new Set();
  while (voices.length < count) {
    const i = rng.int(0, pool.length - 1);
    if (taken.has(i)) continue;
    taken.add(i);
    voices.push({ ...pool[i], degrees: pool[i].degrees.slice() });
  }
  const base = rng.chance(0.5) ? a : b;
  const other = base === a ? b : a;
  return {
    ...base,
    seed: rng.chance(0.5) ? a.seed : b.seed,
    tuning: { ...base.tuning },
    voices: normalizeEntries(voices),
    break: { ...(rng.chance(0.5) ? base : other).break },
    master: { ...(rng.chance(0.5) ? base : other).master },
    form: structuredClone((rng.chance(0.5) ? base : other).form),
    meta: {},
  };
}

export function validateGenome(g) {
  if (!g || typeof g !== 'object') throw new Error('genome: must be an object');
  if (!SUPPORTED_VERSIONS.includes(g.version)) {
    throw new Error(`genome.version: expected one of ${SUPPORTED_VERSIONS.join(', ')}, got ${g.version}`);
  }
  if (!Number.isInteger(g.seed) || g.seed < 0 || g.seed > 0xffffffff) throw new Error('genome.seed: must be a uint32');
  if (typeof g.durationSec !== 'number' || !(g.durationSec > 0) || g.durationSec > 3600) {
    throw new Error('genome.durationSec: must be in (0, 3600]');
  }
  if (!Number.isInteger(g.sampleRate) || g.sampleRate < 8000 || g.sampleRate > 192000) {
    throw new Error('genome.sampleRate: must be an integer in [8000, 192000]');
  }
  if (!g.tuning || !TUNING_TYPES.includes(g.tuning.type)) {
    throw new Error(`genome.tuning.type: must be one of ${TUNING_TYPES.join('|')}`);
  }
  validateFields(TUNING_SPECS[g.tuning.type], g.tuning, 'genome.tuning');
  if (!Array.isArray(g.voices) || g.voices.length < 1 || g.voices.length > MAX_VOICES) {
    throw new Error(`genome.voices: must have 1..${MAX_VOICES} voices`);
  }
  g.voices.forEach((v, i) => {
    const path = `genome.voices[${i}]`;
    if (!v || !VOICE_TYPES.includes(v.type)) throw new Error(`${path}.type: must be one of ${VOICE_TYPES.join('|')}`);
    validateFields(VOICE_COMMON, v, path);
    validateFields(VOICE_SPECIFIC[v.type], v, path);
    if (v.pulses > v.steps) throw new Error(`${path}.pulses: must be <= steps`);
    if (v.rotate >= v.steps) throw new Error(`${path}.rotate: must be < steps`);
    if (g.version >= 2) validateFields(VOICE_FORM, v, path);
  });
  if (g.version >= 2) validateForm(g.form);
  validateFields(BREAK_SPEC, g.break, 'genome.break');
  validateFields(MASTER_SPEC, g.master, 'genome.master');
  return g;
}

export function describeGenome(g) {
  const tuning = g.tuning.type === 'edo' ? `${g.tuning.divisions}edo` : 'harm';
  const form = g.form ? `${formSparkline(g.form)} ` : '';
  return `${form}${tuning} ${g.voices.map((v) => v.type).join('+')} break:${g.break.kind}`;
}
