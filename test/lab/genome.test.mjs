import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/lab/rng.mjs';
import { randomGenome, mutateGenome, crossover, validateGenome } from '../../src/lab/genome.mjs';

test('rng is reproducible from a seed', () => {
  const a = createRng(123);
  const b = createRng(123);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  assert.notEqual(createRng(1).next(), createRng(2).next());
});

test('random, mutated and crossed genomes always validate', () => {
  for (let seed = 0; seed < 300; seed++) {
    const rng = createRng(seed);
    const a = randomGenome(rng);
    const b = randomGenome(rng);
    validateGenome(a);
    validateGenome(b);
    let child = crossover(a, b, rng);
    validateGenome(child);
    for (let i = 0; i < 5; i++) {
      child = mutateGenome(child, rng, rng.uniform(0, 1));
      validateGenome(child);
    }
    validateGenome(mutateGenome(a, rng, 1));
  }
});

test('mutation does not modify its input', () => {
  const rng = createRng(9);
  const g = randomGenome(rng);
  const before = JSON.stringify(g);
  mutateGenome(g, rng, 1);
  crossover(g, randomGenome(rng), rng);
  assert.equal(JSON.stringify(g), before);
});

test('mutation with strength 0 keeps the sound parameters', () => {
  const g = randomGenome(createRng(5));
  const m = mutateGenome(g, createRng(6), 0);
  assert.deepEqual({ ...m, meta: null }, { ...g, meta: null });
});

test('validateGenome rejects out-of-range and malformed genomes', () => {
  const g = randomGenome(createRng(1));
  const bad = (mutate) => {
    const copy = structuredClone(g);
    mutate(copy);
    return copy;
  };
  assert.throws(() => validateGenome(bad((x) => (x.version = 99))), /version/);
  assert.throws(() => validateGenome(bad((x) => (x.voices = []))), /voices/);
  assert.throws(() => validateGenome(bad((x) => (x.voices[0].gain = 5))), /gain/);
  assert.throws(() => validateGenome(bad((x) => (x.voices[0].type = 'piano'))), /type/);
  assert.throws(() => validateGenome(bad((x) => (x.voices[0].pulses = x.voices[0].steps + 1))), /pulses/);
  assert.throws(() => validateGenome(bad((x) => (x.master.delayMs = Number.NaN))), /delayMs/);
  assert.throws(() => validateGenome(bad((x) => (x.break.kind = 'explode'))), /kind/);
});
