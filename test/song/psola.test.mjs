import test from 'node:test';
import assert from 'node:assert/strict';
import { correctPitch, trackPitch } from '../../src/song/psola.mjs';

// A crude voice: pulse train through two formant resonators, gliding 400 -> 470 Hz over one second.
function voice(sr) {
  const n = sr;
  const x = new Float32Array(n);
  const res = [[700, 0.97], [1200, 0.96]].map(([f, r]) => ({ a1: -2 * r * Math.cos((2 * Math.PI * f) / sr), a2: r * r, y1: 0, y2: 0 }));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += (400 + 70 * (i / n)) / sr;
    let s = 0;
    if (ph >= 1) {
      ph -= 1;
      s = 1;
    }
    for (const r of res) {
      const y = s - r.a1 * r.y1 - r.a2 * r.y2;
      r.y2 = r.y1;
      r.y1 = y;
      s = y;
    }
    x[i] = s * 0.05;
  }
  return x;
}

const cents = (f0, hz) => Array.from(f0).slice(20, -20).filter((f) => f > 0).map((f) => 1200 * Math.log2(f / hz));

test('PSOLA pins a gliding voice to the target pitch and keeps its level', () => {
  const sr = 24000;
  const x = voice(sr);
  for (const hz of [440, 523.25, 392]) {
    const y = correctPitch(x, sr, () => hz);
    assert.equal(y.length, x.length);
    const before = cents(trackPitch(x, sr, () => hz).f0, hz);
    const after = cents(trackPitch(y, sr, () => hz).f0, hz);
    const spread = (v) => Math.max(...v) - Math.min(...v);
    assert.ok(spread(before) > 150, `fixture glides (${spread(before)})`);
    assert.ok(spread(after) < 40, `pinned (${spread(after)} cents)`);
    const mean = after.reduce((a, b) => a + b, 0) / after.length;
    assert.ok(Math.abs(mean) < 10, `on pitch (${mean} cents)`);
    let ex = 0, ey = 0;
    for (let i = 0; i < x.length; i++) {
      ex += x[i] ** 2;
      ey += y[i] ** 2;
    }
    assert.ok(ey / ex > 0.8 && ey / ex < 1.2, `level kept (${ey / ex})`);
  }
});

test('unvoiced or untargeted audio passes through untouched', () => {
  const sr = 24000;
  const x = voice(sr);
  assert.deepEqual(correctPitch(x, sr, () => 0), x);
});
