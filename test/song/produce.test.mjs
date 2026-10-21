import test from 'node:test';
import assert from 'node:assert/strict';
import { chord, voicing, parseBar, parsePhrases, arrange, sectionLevels } from '../../src/song/produce.mjs';
import { vowelOf, softTune } from '../../src/song/voicevox.mjs';
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

test('vocals stay in C# minor and inside the measured sweet spot of the voice (E4-D#5)', () => {
  const scale = new Set([1, 3, 4, 6, 8, 9, 11, 0]); // C# natural minor + B# (leading tone in the bridge)
  const { vocals } = arrange(sections);
  for (const v of vocals) {
    assert.equal(v.notes.reduce((a, n) => a + n.beats, 0), v.bars * 4, `${v.name} fills its section`);
    for (const n of v.notes) {
      if (n.key == null) continue;
      assert.ok(scale.has(n.key % 12), `${v.name}: ${n.lyric} ${n.key}`);
      assert.ok(n.key >= 64 && n.key <= 75, `${v.name}: ${n.lyric} ${n.key} outside E4-D#5`);
    }
  }
  assert.throws(() => parseBar('あ:A4:3'), /sixteenths/);
});

test('phrases may cross bar lines, melisma holds the vowel, overlaps are rejected', () => {
  const notes = parsePhrases([[14, 'ま:A4:4 ~:B4:2'], [24, 'ん:C5:2 ~:D5:2']], 2);
  assert.deepEqual(notes.map((n) => [n.lyric, n.beats * 4]), [['', 14], ['ま', 4], ['あ', 2], ['', 4], ['ん', 2], ['ん', 2], ['', 4]]);
  assert.throws(() => parsePhrases([[0, 'あ:A4:8'], [4, 'い:A4:2']], 1), /overlaps/);
  assert.throws(() => parsePhrases([[12, 'あ:A4:8']], 1), /past the section end/);
  assert.equal(vowelOf('しゅ'), 'う');
  assert.equal(vowelOf('ぜ'), 'え');
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
  assert.equal(meta.voice.style, 3008);
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

test('softTune centres notes on target and keeps part of the movement', () => {
  const score = { notes: [{ key: null, frame_length: 1 }, { key: 69, frame_length: 6 }] };
  const query = { f0: [0, 430, 450, 430, 450, 430, 450] }; // wobbling around ~440 but centred low/high
  const out = softTune(query, score, () => 440, { keep: 0.5, smooth: 0 });
  const med = [...out.f0.slice(1)].sort((a, b) => a - b)[3];
  assert.ok(Math.abs(1200 * Math.log2(med / 440)) < 25);
  const spread = Math.max(...out.f0.slice(1)) / Math.min(...out.f0.slice(1));
  assert.ok(spread > 1.01 && spread < 450 / 430); // movement kept but reduced
  assert.equal(out.f0[0], 0);
});
