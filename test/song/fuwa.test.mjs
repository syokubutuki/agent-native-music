import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange, capForTalk, splitPhrases, parseTokens } from '../../src/song/produce.mjs';
import { sections, meta } from '../../songs/fuwa-fuwa-fuwa/score.mjs';
import * as ame from '../../songs/ame-ame-ame/score.mjs';

test('fuwa: a different song from あめ — slow lullaby tempo, another key, talk voices', () => {
  assert.equal(meta.vocalMode, 'talk');
  assert.ok(meta.bpm >= 80 && meta.bpm <= 90, `lullaby tempo, got ${meta.bpm}`);
  assert.notEqual(meta.key, ame.meta.key);
  assert.equal(meta.mix.tremolo.rateHz, meta.bpm / 60, 'tremolo locked to the quarter note');
  const bars = sections.reduce((a, s) => a + s.bars, 0);
  const sec = (bars * 4 * 60) / meta.bpm;
  assert.ok(sec > 150 && sec < 200, `about three minutes, got ${sec.toFixed(0)} s`);
  assert.deepEqual(sections.map((s) => s.name), ['intro', 'verse1', 'chorus1', 'inter', 'verse2', 'chorus2', 'bridge', 'chorus3', 'outro']);
});

test('fuwa: each voice stays inside its measured range and every bar adds up', () => {
  const R = { a: [61, 69], z: [69, 75] }; // つむぎ C#4–A4, ずんだもん A4–D#5
  const { vocals, says } = arrange(sections);
  assert.equal(says.length, 0, 'no spoken asides');
  for (const v of vocals) {
    assert.equal(v.notes.reduce((a, n) => a + n.beats, 0), v.bars * 4);
    for (const n of v.notes) {
      if (n.key == null) continue;
      assert.ok(!n.wild, `${v.name}: no staged wrong notes`);
      assert.ok(n.key >= R[v.singer][0] && n.key <= R[v.singer][1], `${v.name} ${n.lyric}${n.key}`);
    }
  }
  // the two singers carry a duet: both sing in every vocal section
  for (const name of ['verse1', 'chorus1', 'verse2', 'chorus2', 'bridge', 'chorus3', 'outro']) {
    assert.deepEqual(vocals.filter((v) => v.name.startsWith(`${name}-`)).map((v) => v.singer).sort(), ['a', 'z'], name);
  }
});

test('fuwa: phrases move in 8ths, never held or rushed (talk voices fade when held, blur when fast)', () => {
  const { vocals } = arrange(sections);
  for (const v of vocals) {
    for (const ph of splitPhrases(capForTalk(v.notes, meta.bpm))) {
      assert.ok(ph.notes.length >= 2, `${v.name}@${ph.beat}: lone notes go weak`);
      ph.notes.forEach((n, i) => assert.equal(n.beats, 0.5, `${v.name}@${ph.beat} note ${i} (${n.lyric}) is not an 8th`));
    }
  }
});

test('fuwa: the hook is ずんだもん\'s three puffs, answered by つむぎ, opening every chorus', () => {
  const { vocals } = arrange(sections);
  for (const name of ['chorus1', 'chorus2', 'chorus3']) {
    const z = splitPhrases(vocals.find((v) => v.name === `${name}-z`).notes);
    assert.deepEqual(z.slice(0, 3).map((p) => [p.beat, p.notes.map((n) => n.lyric).join('')]), [[0, 'ふわ'], [1.5, 'ふわ'], [3, 'ふわ']]);
  }
  // last chorus: つむぎ doubles the puffs a sixth below
  const a3 = splitPhrases(vocals.find((v) => v.name === 'chorus3-a').notes);
  assert.equal(a3[0].notes.map((n) => n.lyric).join(''), 'ふわ');
});

test('capForTalk at slow tempos keeps 8ths whole and phrases unbroken', () => {
  const notes = parseTokens('ふ:D5:2 わ:B4:2 ゆ:A4:2 き:B4:4');
  const out = capForTalk(notes, 86);
  assert.deepEqual(out.map((n) => [n.lyric, n.beats * 4]), [['ふ', 2], ['わ', 2], ['ゆ', 2], ['き', 2], ['', 2]]);
  assert.equal(splitPhrases(out).length, 1);
});

test('lullaby kit: heartbeat light kick and a hushed shaker, no claps', () => {
  const { tracks } = arrange([{ name: 'c', bars: 1, chords: ['Gmaj7'], drums: 'nenne', bass: 'sway', bassSynth: 'round' }]);
  assert.deepEqual(tracks.lightKick.map((e) => e.beat), [0]);
  assert.equal(tracks.kick.length, 0);
  assert.equal(tracks.clap.length, 0);
  assert.equal(tracks.shaker.length, 8);
  assert.ok(tracks.shaker.every((e) => e.vel < 0.5));
  assert.deepEqual(tracks.roundBass.map((e) => [e.beat, e.midi - tracks.roundBass[0].midi]), [[0, 0], [2, 12]]);
});
