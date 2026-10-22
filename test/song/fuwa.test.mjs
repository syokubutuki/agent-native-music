import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange, capForTalk, splitPhrases, parseTokens } from '../../src/song/produce.mjs';
import { poyonVoice } from '../../src/song/synth.mjs';
import { morae, tokens, BPM } from '../../songs/fuwa-fuwa-fuwa/frame.mjs';
import * as ame from '../../songs/ame-ame-ame/score.mjs';

const VARIANTS = {
  yuki: await import('../../songs/fuwa-fuwa-fuwa/score.mjs'),
  yami: await import('../../songs/fuwa-yami/score.mjs'),
  kenka: await import('../../songs/fuwa-kenka/score.mjs'),
  sanpo: await import('../../songs/fuwa-sanpo/score.mjs'),
};
const R = { a: [61, 69], z: [69, 75] }; // つむぎ C#4–A4, ずんだもん A4–D#5 (steady-note test)

test('fuwa v2: talk voices at the あめ tempo or a little faster, one group of lyric variants', () => {
  assert.ok(BPM >= ame.meta.bpm && BPM <= 140, `tempo ${BPM}`);
  const titles = new Set();
  for (const [k, s] of Object.entries(VARIANTS)) {
    assert.equal(s.meta.vocalMode, 'talk', k);
    assert.equal(s.meta.bpm, BPM, k);
    assert.equal(s.meta.group, 'ふわ ふわ ふわ。', k);
    titles.add(s.meta.title);
    const bars = s.sections.reduce((a, x) => a + x.bars, 0);
    const sec = (bars * 4 * 60) / s.meta.bpm;
    assert.ok(sec > 160 && sec < 200, `${k}: ${sec.toFixed(0)} s`);
  }
  assert.equal(titles.size, 4);
  assert.equal(VARIANTS.yami.meta.key, 'B minor');
  assert.ok(VARIANTS.kenka.sections.some((x) => x.chords.includes('Gm6')), 'discord flickers in the harmony');
});

test('fuwa v2: each voice stays in its measured range, bars add up, no staged asides', () => {
  for (const [k, s] of Object.entries(VARIANTS)) {
    const { vocals, says } = arrange(s.sections);
    assert.equal(says.length, 0, k);
    for (const v of vocals) {
      assert.equal(v.notes.reduce((a, n) => a + n.beats, 0), v.bars * 4);
      for (const n of v.notes) if (n.key != null) assert.ok(!n.wild && n.key >= R[v.singer][0] && n.key <= R[v.singer][1], `${k} ${v.name} ${n.lyric}${n.key}`);
    }
  }
});

test('fuwa v2: phrases move in 8ths (0.23 s) — nothing held, nothing rushed, no lone notes', () => {
  for (const [k, s] of Object.entries(VARIANTS)) {
    for (const v of arrange(s.sections).vocals) {
      for (const ph of splitPhrases(capForTalk(v.notes, s.meta.bpm))) {
        assert.ok(ph.notes.length >= 2, `${k} ${v.name}@${ph.beat}`);
        for (const n of ph.notes) assert.equal(n.beats, 0.5, `${k} ${v.name}@${ph.beat} ${n.lyric}`);
      }
    }
  }
});

test('fuwa v2: the variants are one tune — same notes, different words', () => {
  const tune = (s) => arrange(s.sections).vocals.map((v) => `${v.name}:${v.notes.map((n) => n.key ?? '-').join(',')}`);
  const yuki = tune(VARIANTS.yuki);
  for (const k of ['yami', 'kenka']) assert.deepEqual(tune(VARIANTS[k]), yuki, k);
  // さんぽ re-shapes two bridge slots for its words and is otherwise the same
  const diff = tune(VARIANTS.sanpo).filter((x, i) => x !== yuki[i]);
  assert.deepEqual(diff.map((x) => x.split(':')[0]).sort(), ['bridge-a', 'bridge-z']);
  const words = (s) => arrange(s.sections).vocals.find((v) => v.name === 'verse1-a').notes.map((n) => n.lyric).join('');
  assert.equal(new Set(Object.values(VARIANTS).map(words)).size, 4);
});

test('fuwa v2: every chorus opens with ずんだもん\'s three puffs; つむぎ doubles them in the last', () => {
  for (const [k, s] of Object.entries(VARIANTS)) {
    const { vocals } = arrange(s.sections);
    for (const name of ['chorus1', 'chorus2', 'chorus3']) {
      const z = splitPhrases(vocals.find((v) => v.name === `${name}-z`).notes);
      assert.deepEqual(z.slice(0, 3).map((p) => [p.beat, p.notes.map((n) => n.lyric).join('')]), [[0, 'ふわ'], [1.5, 'ふわ'], [3, 'ふわ']], `${k} ${name}`);
    }
    assert.equal(splitPhrases(vocals.find((v) => v.name === 'chorus3-a').notes)[0].notes.map((n) => n.lyric).join(''), 'ふわ', k);
    assert.notEqual(splitPhrases(vocals.find((v) => v.name === 'chorus1-a').notes)[0].notes.map((n) => n.lyric).join(''), 'ふわ', k);
  }
});

test('fuwa frame: morae join small kana, and a lyric must fit its notes', () => {
  assert.deepEqual(morae('ちょっぴり ちくり'), ['ちょ', 'っ', 'ぴ', 'り', 'ち', 'く', 'り']);
  assert.equal(tokens('D5 B4 - D5 A4:4', 'ふわ ふわ', 't'), 'ふ:D5:2 わ:B4:2 -2 ふ:D5:2 わ:A4:4');
  assert.throws(() => tokens('D5 B4', 'ふわふ', 't'), /3 morae for 2 notes/);
});

test('ぽよん: the jelly tone falls into its note from above, then settles', () => {
  const sr = 44100;
  const f = 440;
  const y = poyonVoice(sr, f, { len: Math.round(0.4 * sr), depth: 7 });
  const rate = (a, b) => {
    let z = 0;
    for (let i = Math.round(a * sr) + 1; i < Math.round(b * sr); i++) if (y[i - 1] <= 0 && y[i] > 0) z++;
    return z / (b - a);
  };
  assert.ok(rate(0.001, 0.02) > f * 1.1, 'starts above the note');
  assert.ok(Math.abs(rate(0.2, 0.35) / f - 1) < 0.05, 'lands on the note');
});

test('ぽよん arrangement: jelly comp, root–octave hops, and a ball that bounces faster at the end', () => {
  const { tracks } = arrange([{ name: 'c', bars: 2, chords: ['Gmaj7'], drums: 'none', comp: 'poyon', bass: 'hop', bassSynth: 'poyon', ball: true }]);
  assert.equal(tracks.poyon.length, 12);
  assert.deepEqual(tracks.poyonBass.slice(0, 2).map((e) => e.midi - tracks.poyonBass[0].midi), [0, 12]);
  const balls = tracks.toy.filter((e) => e.kind === 'ball').map((e) => e.beat);
  const gaps = balls.slice(1).map((b, i) => b - balls[i]);
  assert.ok(gaps.every((g, i) => i === 0 || g <= gaps[i - 1]), `bounces speed up: ${gaps}`);
  assert.equal(balls.at(-1), 8 - 0.25);
});

test('capForTalk at slow tempos keeps 8ths whole and phrases unbroken', () => {
  const out = capForTalk(parseTokens('ふ:D5:2 わ:B4:2 ゆ:A4:2 き:B4:4'), 86);
  assert.deepEqual(out.map((n) => [n.lyric, n.beats * 4]), [['ふ', 2], ['わ', 2], ['ゆ', 2], ['き', 2], ['', 2]]);
  assert.equal(splitPhrases(out).length, 1);
});

test('lullaby kit: heartbeat light kick and a hushed shaker, no claps', () => {
  const { tracks } = arrange([{ name: 'c', bars: 1, chords: ['Gmaj7'], drums: 'nenne', bass: 'sway', bassSynth: 'round' }]);
  assert.deepEqual(tracks.lightKick.map((e) => e.beat), [0]);
  assert.equal(tracks.kick.length + tracks.clap.length, 0);
  assert.ok(tracks.shaker.length === 8 && tracks.shaker.every((e) => e.vel < 0.5));
  assert.deepEqual(tracks.roundBass.map((e) => [e.beat, e.midi - tracks.roundBass[0].midi]), [[0, 0], [2, 12]]);
});
