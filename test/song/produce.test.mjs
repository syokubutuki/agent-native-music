import test from 'node:test';
import assert from 'node:assert/strict';
import { chord, voicing, parseBar, arrange, sectionLevels } from '../../src/song/produce.mjs';
import { sections, meta } from '../../songs/sugar-poison/score.mjs';
import { createBus, kick, bass, supersaw, pluck } from '../../src/song/synth.mjs';

test('chords: triads, bass roots in E1..D#2, voicings above G#3', () => {
  assert.deepEqual(chord('C#m').pcs, [1, 4, 8]);
  assert.deepEqual(chord('G#').pcs, [8, 0, 3]);
  assert.equal(chord('C#m').bassRoot, 37);
  assert.equal(chord('E').bassRoot, 28);
  for (const s of ['A', 'B', 'G#m', 'C#m', 'E', 'F#m', 'G#']) {
    const v = voicing(s);
    assert.equal(v.length, 3);
    assert.ok(v.every((m) => m >= 56 && m < 68));
    assert.deepEqual(new Set(v.map((m) => m % 12)), new Set(chord(s).pcs));
  }
});

test('every vocal bar of the score is exactly one bar and sings only in C# minor', () => {
  const scale = new Set([1, 3, 4, 6, 8, 9, 11, 0]); // C# natural minor + B# (leading tone in the bridge)
  for (const sec of sections) {
    for (const bar of sec.vocal ?? []) for (const n of parseBar(bar)) if (n.key != null) assert.ok(scale.has(n.key % 12), `${sec.name}: ${bar}`);
  }
  assert.throws(() => parseBar('あ:A4:3'), /sixteenths/);
});

test('arrangement covers the whole song with events on the grid', () => {
  const { tracks, vocals, totalBeats } = arrange(sections);
  assert.equal(totalBeats, sections.reduce((a, s) => a + s.bars, 0) * 4);
  for (const [name, evs] of Object.entries(tracks)) {
    assert.ok(evs.length > 0, `${name} has events`);
    for (const e of evs) assert.ok(e.beat >= 0 && e.beat < totalBeats, `${name} beat ${e.beat}`);
  }
  assert.ok(tracks.kick.every((e) => Number.isInteger(e.beat))); // four-on-the-floor on the beat
  assert.equal(vocals.length, sections.filter((s) => s.vocal).length);
  assert.equal(meta.bpm, 164);
});

test('section levels ramp within sections', () => {
  const g = sectionLevels([{ bars: 1, level: [0.5, 1] }, { bars: 1 }], 1000, { sr: 1000 * (164 / 60) / 8, bpm: 164 });
  assert.ok(g[0] === 0.5 && g[499] > 0.99 && g[500] === 1 && g[999] === 1);
});

test('instruments render finite, non-silent audio', () => {
  const ctx = { sr: 22050, bpm: 164 };
  const ev = [{ beat: 0, beats: 1, midi: 49, vel: 1 }];
  for (const fn of [kick, bass, pluck, (c, e, b) => supersaw(c, e, b, { kind: 'stab' }), (c, e, b) => supersaw(c, e, b, { kind: 'pad' })]) {
    const bus = createBus(22050);
    fn(ctx, ev, bus);
    let e = 0;
    for (const x of bus.left) {
      assert.ok(Number.isFinite(x));
      e += x * x;
    }
    assert.ok(e > 0);
  }
});
