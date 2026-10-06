import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/lab/rng.mjs';
import { randomGenome, randomVoice } from '../../src/lab/genome.mjs';
import { VOICE_TYPES, BREAK_KINDS } from '../../src/lab/params.mjs';
import { render, euclid, scheduleVoice } from '../../src/lab/render.mjs';
import { encodeWav } from '../../src/lab/wav.mjs';

const OPTS = { durationSec: 1.5, sampleRate: 22050 };

function checkAudio({ left, right }) {
  let pk = 0;
  let energy = 0;
  for (const buf of [left, right]) {
    for (let i = 0; i < buf.length; i++) {
      assert.ok(Number.isFinite(buf[i]), `non-finite sample at ${i}`);
      pk = Math.max(pk, Math.abs(buf[i]));
      energy += buf[i] * buf[i];
    }
  }
  assert.ok(pk <= 1, `peak ${pk} > 1`);
  assert.ok(energy > 0, 'silent output');
}

test('render is deterministic down to the WAV bytes', () => {
  const g = randomGenome(createRng(77));
  const a = encodeWav(render(g, OPTS));
  const b = encodeWav(render(structuredClone(g), OPTS));
  assert.ok(a.equals(b));
  const other = { ...g, seed: (g.seed + 1) >>> 0 };
  assert.equal(render(other, OPTS).left.length, render(g, OPTS).left.length);
});

test('every voice type and break kind renders finite, bounded, non-silent audio', () => {
  const rng = createRng(3);
  for (const type of VOICE_TYPES) {
    for (const kind of BREAK_KINDS) {
      const g = randomGenome(rng);
      g.voices = [randomVoice(rng, type), randomVoice(rng, type)];
      g.voices.forEach((v) => (v.pulses = v.steps)); // guarantee notes inside a short clip
      g.break = { ...g.break, kind, at: 0.4, length: 0.3 };
      checkAudio(render(g, OPTS));
    }
  }
});

test('many random genomes render cleanly', () => {
  for (let seed = 100; seed < 130; seed++) checkAudio(render(randomGenome(createRng(seed)), { ...OPTS, durationSec: 0.6 }));
});

test('euclid distributes pulses evenly and rotates', () => {
  assert.deepEqual(euclid(8, 3, 0), [true, false, false, true, false, false, true, false]);
  assert.deepEqual(euclid(4, 4, 0), [true, true, true, true]);
  assert.deepEqual(euclid(5, 0, 0), [false, false, false, false, false]);
  const base = euclid(8, 3, 0);
  assert.deepEqual(euclid(8, 3, 1), [...base.slice(1), base[0]]);
});

test('break rules bend the schedule of the targeted voice', () => {
  const voice = { ...randomVoice(createRng(1), 'fm'), stepMs: 100, steps: 4, pulses: 1, rotate: 0, degrees: [0, 5, 9], stride: 1 };
  const tuning = { type: 'edo', divisions: 12, baseHz: 110 };
  const ctx = { tuning, durationSec: 2, sampleRate: 44100, brk: { start: 1, end: 1.5, kind: 'freeze' } };
  const plain = scheduleVoice(voice, { ...ctx, targeted: false });
  const frozen = scheduleVoice(voice, { ...ctx, targeted: true });
  assert.equal(plain.length, 5);
  const inside = frozen.filter((e) => e.time >= 1 && e.time < 1.5);
  assert.equal(inside.length, 5); // every step sounds
  assert.equal(new Set(inside.map((e) => e.freq)).size, 1); // and the pitch stops moving
  const doubled = scheduleVoice(voice, { ...ctx, brk: { ...ctx.brk, kind: 'double' }, targeted: true });
  assert.ok(doubled.length > plain.length);
});
