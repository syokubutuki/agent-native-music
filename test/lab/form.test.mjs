import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRng } from '../../src/lab/rng.mjs';
import { energyAt, randomForm, mutateForm, validateForm, formSparkline } from '../../src/lab/form.mjs';
import { randomGenome, randomVoice, mutateGenome, crossover, validateGenome } from '../../src/lab/genome.mjs';
import { render, scheduleVoice, degreesInUse } from '../../src/lab/render.mjs';
import { createSvf } from '../../src/lab/dsp.mjs';
import { encodeWav } from '../../src/lab/wav.mjs';

const V1 = JSON.parse(fs.readFileSync(new URL('./fixtures/v1-genome.json', import.meta.url), 'utf8'));
const pts = (...list) => list.map(([t, e, shape = 'linear']) => ({ t, e, shape }));
const flatForm = (e, extra = {}) => ({
  points: pts([0, e], [0.5, e], [1, e]),
  fill: 0,
  pitchCoupling: 0,
  brightCoupling: 0,
  tempoBend: 0,
  dynamics: 0,
  ceilingHz: 5000,
  ...extra,
});

test('v1 genomes render exactly as before v2 existed', () => {
  // Hash captured from the v1 renderer before the form code was added.
  const wav = encodeWav(render(V1, { durationSec: 1, sampleRate: 22050 }));
  assert.equal(
    crypto.createHash('sha256').update(wav).digest('hex'),
    '78b4f3301484d9327910199d9fb4d5d782b19a73677213abeafacb10acfae0db',
  );
  validateGenome(V1);
});

test('v1 parents are upgraded to valid v2 children', () => {
  for (let seed = 0; seed < 100; seed++) {
    const rng = createRng(seed);
    const m = mutateGenome(V1, rng, rng.next());
    assert.equal(m.version, 2);
    validateGenome(m);
    assert.ok(m.voices.some((v) => v.entry === 0));
    const c = crossover(V1, randomGenome(rng), rng);
    assert.equal(c.version, 2);
    validateGenome(c);
    validateGenome(mutateGenome(c, rng, 1));
  }
  assert.equal(V1.version, 1); // input untouched
});

test('energyAt follows the curve shapes and stays in [0,1]', () => {
  const form = { points: pts([0, 0.2], [0.5, 0.2, 'jump'], [0.6, 1, 'jump'], [1, 0, 'exp']) };
  assert.equal(energyAt(form, 0), 0.2);
  assert.equal(energyAt(form, 1), 0);
  assert.equal(energyAt(form, 0.55), 0.2); // jump holds the previous value...
  assert.equal(energyAt(form, 0.6), 1); // ...until the segment end
  assert.ok(energyAt(form, 0.7) > 0.9); // exp: slow start of the fall
  const lin = { points: pts([0, 0], [1, 1]) };
  assert.equal(energyAt(lin, 0.25), 0.25);
  const rng = createRng(4);
  for (let i = 0; i < 200; i++) {
    let f = randomForm(rng);
    f = mutateForm(f, rng, rng.next());
    validateForm(f);
    for (let x = 0; x <= 1; x += 0.01) {
      const e = energyAt(f, x);
      assert.ok(e >= 0 && e <= 1);
    }
    assert.equal(formSparkline(f).length, 8);
  }
});

test('validateForm rejects malformed curves', () => {
  const ok = flatForm(0.5);
  validateForm(ok);
  assert.throws(() => validateForm({ ...ok, points: pts([0.1, 0], [0.5, 1], [1, 0]) }), /start at t=0/);
  assert.throws(() => validateForm({ ...ok, points: pts([0, 0], [0.5, 1], [0.49, 0], [1, 0]) }), /increase/);
  assert.throws(() => validateForm({ ...ok, points: pts([0, 0], [1, 2], [1, 0]) }), /\.e/);
  assert.throws(() => validateForm({ ...ok, points: pts([0, 0], [1, 1]) }), /points/);
  assert.throws(() => validateForm({ ...ok, ceilingHz: 20000 }), /ceilingHz/);
});

function schedule(voice, form, durationSec = 20) {
  return scheduleVoice(voice, {
    tuning: { type: 'edo', divisions: 12, baseHz: 110 },
    durationSec,
    sampleRate: 44100,
    brk: { start: 999, end: 999, kind: 'freeze' },
    targeted: false,
    form,
    rng: createRng(1),
  });
}

test('energy drives density, entry, melody and tempo', () => {
  const voice = {
    ...randomVoice(createRng(2), 'fm'),
    stepMs: 100, steps: 8, pulses: 4, rotate: 0, degrees: [0, 3, 7, 10], stride: 1, octave: 0, entry: 0,
  };
  const low = schedule(voice, flatForm(0));
  const high = schedule(voice, flatForm(1));
  assert.equal(high.length, 100); // every pattern hit at full energy
  assert.ok(low.length < high.length * 0.35, `low energy should thin the pattern (${low.length})`);

  const filled = schedule(voice, flatForm(1, { fill: 0.6 }));
  assert.ok(filled.length > high.length + 40); // off-pattern steps join

  assert.equal(schedule({ ...voice, entry: 0.5 }, flatForm(0.3)).length, 0); // not entered yet
  assert.ok(schedule({ ...voice, entry: 0.5 }, flatForm(0.8)).length > 0);

  const closed = schedule(voice, flatForm(0, { pitchCoupling: 1 }));
  assert.equal(new Set(closed.map((e) => e.freq)).size, 1); // energy 0 + coupling 1 = single pitch
  const open = schedule(voice, flatForm(0, { pitchCoupling: -1 }));
  assert.equal(new Set(open.map((e) => e.freq)).size, 4); // negative coupling: melody opens when quiet
  assert.equal(degreesInUse(4, 0.5, 0.5), 3);

  const fast = schedule(voice, flatForm(1, { tempoBend: 1 }));
  assert.ok(fast.length > high.length * 1.3); // positive bend speeds up at high energy

  const dyn = schedule(voice, flatForm(0.2, { dynamics: 1 }));
  assert.ok(dyn.every((e) => Math.abs(e.amp - (1 - 0.7 * 0.8)) < 1e-9)); // quiet, but never below 30%
});

function highBandRatio({ left }, sampleRate, hz) {
  const hp = createSvf('hp', hz, Math.SQRT1_2, sampleRate);
  const hp2 = createSvf('hp', hz, Math.SQRT1_2, sampleRate);
  let hi = 0;
  let all = 0;
  for (let i = 0; i < left.length; i++) {
    const h = hp2(hp(left[i]));
    hi += h * h;
    all += left[i] * left[i];
  }
  return hi / all;
}

test('brightness ceiling removes most energy above it', () => {
  const rng = createRng(11);
  const v1 = randomGenome(rng);
  v1.version = 1;
  delete v1.form;
  v1.voices = [{
    ...randomVoice(rng, 'fm'),
    gain: 0.6, stepMs: 60, steps: 4, pulses: 4, rotate: 0, degrees: [12], octave: 1, ratio: 2.32, index: 11, indexDecay: 0,
  }];
  delete v1.voices[0].entry;
  validateGenome(v1);
  const v2 = { ...structuredClone(v1), version: 2, form: flatForm(1, { ceilingHz: 2000 }) };
  v2.voices[0].entry = 0;
  validateGenome(v2);
  const opts = { durationSec: 1, sampleRate: 44100 };
  const before = highBandRatio(render(v1, opts), 44100, 3000);
  const after = highBandRatio(render(v2, opts), 44100, 3000);
  assert.ok(before > 0.2, `fixture should be bright (${before})`);
  assert.ok(after < before / 20, `ceiling should cut highs (${before} -> ${after})`);
});
