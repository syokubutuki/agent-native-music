import test from 'node:test';
import assert from 'node:assert/strict';
import { meta, sections } from '../../songs/yuge-yuge-yuge/score.mjs';
import { arrange, capForTalk } from '../../src/song/produce.mjs';
import { createBus, drip, bucket, beep } from '../../src/song/synth.mjs';
import { harmonyBelow, transpose } from '../../src/song/tokens.mjs';

const RANGE = { a: [61, 69], z: [69, 75] }; // つむぎ C#4–A4, ずんだもん A4–D#5
const { tracks, vocals, totalBeats } = arrange(sections);
const sec = (name) => {
  let bar = 0;
  for (const s of sections) {
    if (s.name === name) return { from: bar * 4, to: (bar + s.bars) * 4 };
    bar += s.bars;
  }
  throw new Error(name);
};
const within = (events, name) => events.filter((e) => e.beat >= sec(name).from && e.beat < sec(name).to);

test('64 bars at 128 BPM (2:00), talk voices in range, eighths capped under 0.3 s', () => {
  assert.equal(totalBeats, 64 * 4);
  assert.equal(meta.bpm, 128);
  for (const v of vocals) {
    for (const n of v.notes.filter((x) => x.key != null)) {
      assert.ok(n.key >= RANGE[v.singer][0] && n.key <= RANGE[v.singer][1], `${v.name}: ${n.lyric} ${n.key}`);
      assert.ok(n.beats <= 1, `${v.name}: ${n.lyric}`);
    }
    for (const n of capForTalk(v.notes, meta.bpm).filter((x) => x.key != null)) assert.ok((n.beats * 60) / meta.bpm <= 0.3);
  }
});

test('the sound builds up: bathroom first, then hum, toy piano, ずんだもん, then the band', () => {
  const singers = (name) => new Set(vocals.filter((v) => v.name.startsWith(`${name}-`) && v.notes.some((n) => n.key != null)).map((v) => v.singer));
  assert.equal(vocals.filter((v) => v.name.startsWith('bath-')).length, 0);
  assert.deepEqual([...singers('hum')], ['a']);
  assert.deepEqual([...singers('toy')], ['a']);
  assert.ok(singers('enter').has('z'));
  assert.ok(within(tracks.beep, 'bath').length >= 2 && within(tracks.drip, 'bath').length > 0);
  assert.ok(within(tracks.toyPiano, 'toy').length > 0 && within(tracks.toyPiano, 'hum').length === 0);
  assert.equal(within(tracks.uke, 'enter').length, 0);
  assert.ok(within(tracks.uke, 'verse').length > 0);
  assert.equal(within(tracks.lightKick, 'toy').length, 0);
  assert.ok(within(tracks.lightKick, 'verse').length > 0 && within(tracks.bucket, 'verse').length >= 16);
  assert.ok(!meta.mix.reverbStems.includes('uke') && !meta.mix.tremolo.stems.includes('uke')); // the groove stays dry
});

test('hook: ずんだもん\'s deadpan ゆげ x3, an echo a fourth down, then thirds; the song ends on one shared A4', () => {
  const z = vocals.find((v) => v.name === 'hook-z').notes.filter((n) => n.key != null);
  assert.deepEqual(z.slice(0, 6).map((n) => n.lyric).join(''), 'ゆげゆげゆげ');
  assert.equal(transpose('ゆ:C#5:2 げ:A4:2', -5), 'ゆ:G#4:2 げ:E4:2');
  assert.equal(harmonyBelow('ゆ:C#5:2 げ:A4:2 ま:B4:2'), 'ゆ:A4:2 げ:F#4:2 ま:G#4:2');
  const echo = vocals.find((v) => v.name === 'hook-a').notes.filter((n) => n.gain === 0.7);
  assert.deepEqual(echo.map((n) => n.lyric), ['ゆ', 'げ', 'ゆ', 'げ']);
  const last = (s) => vocals.find((v) => v.name === `end-${s}`).notes.filter((n) => n.key != null).at(-1);
  assert.equal(last('a').key, 69);
  assert.equal(last('z').key, 69);
});

test('bath sounds: tuned drips, a knock, a beep — finite and deterministic', () => {
  const ctx = { sr: 22050, bpm: 128 };
  for (const fn of [drip, bucket, beep]) {
    const a = createBus(ctx.sr);
    const b = createBus(ctx.sr);
    fn(ctx, [{ beat: 0, midi: 84, vel: 1 }], a);
    fn(ctx, [{ beat: 0, midi: 84, vel: 1 }], b);
    assert.deepEqual(a.left, b.left);
    const peak = a.left.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    assert.ok(peak > 0.1 && peak < 3, `${fn.name} ${peak}`);
  }
});
