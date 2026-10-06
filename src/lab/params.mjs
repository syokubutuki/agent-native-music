// Single source of truth for every genome parameter range.
// randomize / mutate / validate all read these tables, so a range changes in exactly one place.

const num = (min, max, opts = {}) => ({ kind: 'num', min, max, log: !!opts.log });
const int = (min, max) => ({ kind: 'int', min, max });
const oneOf = (...values) => ({ kind: 'enum', values });
const intArray = (min, max, minLen, maxLen) => ({ kind: 'intArray', min, max, minLen, maxLen });

export const VOICE_TYPES = ['fm', 'feedback', 'bytebeat', 'noise'];
export const BREAK_KINDS = ['freeze', 'reverse', 'double', 'solo'];
export const TUNING_TYPES = ['edo', 'harmonic'];
export const MAX_VOICES = 6;
export const BYTEBEAT_FORMULAS = 6;

export const VOICE_COMMON = {
  gain: num(0.05, 0.6),
  pan: num(-1, 1),
  stepMs: num(40, 600, { log: true }),
  steps: int(3, 16),
  pulses: int(1, 16), // clamped to <= steps by normalizeVoice
  rotate: int(0, 15), // clamped to < steps by normalizeVoice
  degrees: intArray(0, 23, 1, 8),
  stride: int(1, 5),
  octave: int(-2, 2),
  attackMs: num(1, 200, { log: true }),
  decayMs: num(20, 2000, { log: true }),
};

export const VOICE_SPECIFIC = {
  fm: {
    ratio: num(0.25, 8, { log: true }),
    index: num(0, 12),
    indexDecay: num(0, 1),
    modFeedback: num(0, 0.9),
  },
  feedback: {
    loopGain: num(0.8, 0.999),
    damp: num(0, 0.95),
    drive: num(1, 8, { log: true }),
    exciteMs: num(1, 40, { log: true }),
  },
  bytebeat: {
    formula: int(0, BYTEBEAT_FORMULAS - 1),
    a: int(1, 16),
    b: int(1, 16),
    c: int(1, 16),
    rate: num(2000, 16000, { log: true }),
  },
  noise: {
    filter: oneOf('lp', 'bp', 'hp'),
    cutoffMul: num(0.5, 16, { log: true }),
    q: num(0.5, 20, { log: true }),
  },
};

export const TUNING_SPECS = {
  edo: { divisions: int(5, 31), baseHz: num(40, 400, { log: true }) },
  harmonic: { baseHz: num(30, 200, { log: true }) },
};

export const BREAK_SPEC = {
  at: num(0.4, 0.9),
  length: num(0.05, 0.3),
  kind: oneOf(...BREAK_KINDS),
  voice: int(0, MAX_VOICES - 1),
};

export const MASTER_SPEC = {
  delayMs: num(50, 1200, { log: true }),
  delayFeedback: num(0, 0.85),
  delayMix: num(0, 0.6),
  drive: num(1, 6, { log: true }),
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function randomValue(spec, rng) {
  switch (spec.kind) {
    case 'num':
      return spec.log
        ? Math.exp(rng.uniform(Math.log(spec.min), Math.log(spec.max)))
        : rng.uniform(spec.min, spec.max);
    case 'int':
      return rng.int(spec.min, spec.max);
    case 'enum':
      return rng.pick(spec.values);
    case 'intArray': {
      const len = rng.int(spec.minLen, spec.maxLen);
      return Array.from({ length: len }, () => rng.int(spec.min, spec.max));
    }
    default:
      throw new Error(`unknown spec kind: ${spec.kind}`);
  }
}

// strength 0..1: probability of touching a field and the size of the nudge.
export function mutateValue(spec, value, rng, strength) {
  switch (spec.kind) {
    case 'num': {
      const sigma = strength * 0.5;
      if (spec.log) {
        const span = Math.log(spec.max) - Math.log(spec.min);
        return clamp(Math.exp(Math.log(value) + rng.gaussian() * sigma * span), spec.min, spec.max);
      }
      return clamp(value + rng.gaussian() * sigma * (spec.max - spec.min), spec.min, spec.max);
    }
    case 'int': {
      const span = spec.max - spec.min;
      const step = Math.round(rng.gaussian() * Math.max(1, strength * span * 0.5));
      return clamp(value + (step === 0 ? (rng.chance(0.5) ? 1 : -1) : step), spec.min, spec.max);
    }
    case 'enum':
      return rng.pick(spec.values.filter((v) => v !== value).concat(spec.values.length === 1 ? [value] : []));
    case 'intArray': {
      const out = value.slice();
      const op = rng.int(0, 2);
      if (op === 0 && out.length < spec.maxLen) out.splice(rng.int(0, out.length), 0, rng.int(spec.min, spec.max));
      else if (op === 1 && out.length > spec.minLen) out.splice(rng.int(0, out.length - 1), 1);
      else out[rng.int(0, out.length - 1)] = rng.int(spec.min, spec.max);
      return out;
    }
    default:
      throw new Error(`unknown spec kind: ${spec.kind}`);
  }
}

export function validateValue(spec, value, path) {
  const fail = (msg) => {
    throw new Error(`${path}: ${msg} (got ${JSON.stringify(value)})`);
  };
  switch (spec.kind) {
    case 'num':
      if (typeof value !== 'number' || !Number.isFinite(value)) fail('must be a finite number');
      if (value < spec.min || value > spec.max) fail(`must be in [${spec.min}, ${spec.max}]`);
      return;
    case 'int':
      if (!Number.isInteger(value)) fail('must be an integer');
      if (value < spec.min || value > spec.max) fail(`must be in [${spec.min}, ${spec.max}]`);
      return;
    case 'enum':
      if (!spec.values.includes(value)) fail(`must be one of ${spec.values.join('|')}`);
      return;
    case 'intArray':
      if (!Array.isArray(value)) fail('must be an array');
      if (value.length < spec.minLen || value.length > spec.maxLen) {
        fail(`length must be in [${spec.minLen}, ${spec.maxLen}]`);
      }
      value.forEach((v, i) => validateValue({ kind: 'int', min: spec.min, max: spec.max }, v, `${path}[${i}]`));
      return;
    default:
      throw new Error(`unknown spec kind: ${spec.kind}`);
  }
}

export function randomFields(specMap, rng) {
  const out = {};
  for (const [key, spec] of Object.entries(specMap)) out[key] = randomValue(spec, rng);
  return out;
}

export function mutateFields(specMap, obj, rng, strength) {
  const out = { ...obj };
  for (const [key, spec] of Object.entries(specMap)) {
    if (rng.chance(strength)) out[key] = mutateValue(spec, obj[key], rng, strength);
  }
  return out;
}

export function validateFields(specMap, obj, path) {
  if (!obj || typeof obj !== 'object') throw new Error(`${path}: must be an object`);
  for (const [key, spec] of Object.entries(specMap)) validateValue(spec, obj[key], `${path}.${key}`);
}
