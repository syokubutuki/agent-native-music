import test from 'node:test';
import assert from 'node:assert/strict';
import { splitForTalk } from '../../src/song/talksing.mjs';
import { capForTalk, splitPhrases, talkQa, arrange, parseTokens } from '../../src/song/produce.mjs';
import { encodeWav } from '../../src/lab/wav.mjs';
import { sections, meta } from '../../songs/ame-ame-ame/score.mjs';

test('long notes become ー continuation morae; melismas continue the vowel', () => {
  const notes = parseTokens('あ:A4:2 め:A4:8 ~:B4:2');
  const out = splitForTalk(notes, 128); // 8 sixteenths at 128 BPM = 0.94 s -> 4 morae
  assert.deepEqual(out.map((n) => n.lyric), ['あ', 'め', 'ー', 'ー', 'ー', 'ー']);
  assert.equal(out.reduce((a, n) => a + n.beats, 0), notes.reduce((a, n) => a + n.beats, 0));
});

test('capForTalk clips held notes and keeps the bar length', () => {
  const notes = parseTokens('あ:A4:2 め:A4:8');
  const out = capForTalk(notes, 128, 0.3);
  assert.deepEqual(out.map((n) => [n.lyric, n.beats * 4]), [['あ', 2], ['め', 2], ['', 6]]);
  assert.equal(out.reduce((a, n) => a + n.beats, 0), 2.5);
});

test('splitPhrases finds sung runs and their start beats', () => {
  const ph = splitPhrases(parseTokens('-2 あ:A4:2 め:A4:2 -4 ね:B4:2'));
  assert.deepEqual(ph.map((p) => [p.beat, p.notes.length]), [[0.5, 2], [2.5, 1]]);
});

test('talkQa passes steady voiced notes and flags a collapsed one', () => {
  const sr = 24000;
  const bpm = 120;
  const notes = parseTokens('あ:A4:2 い:A4:2 う:A4:2');
  const make = (collapseThird) => {
    const len = Math.round(sr * 0.1 + sr * 0.75);
    const x = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const inThird = t > 0.1 + 0.5 && t < 0.1 + 0.75;
      x[i] = 0.3 * Math.sin(2 * Math.PI * 440 * t) * (collapseThird && inThird ? 0.0005 : 1);
    }
    return encodeWav({ left: x, right: x, sampleRate: sr });
  };
  assert.deepEqual(talkQa(make(false), notes, bpm, 0.1), { ok: true });
  // the third note is the phrase end: judged on its first half, where it has collapsed
  const bad = talkQa(make(true), notes, bpm, 0.1);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /う/);
});

test('duet stays inside each talk voice\'s measured range', () => {
  const R = { a: [61, 69], z: [69, 75] }; // つむぎ C#4–A4, ずんだもん A4–D#5 (steady-note test)
  const { vocals } = arrange(sections);
  assert.ok(vocals.length > 0);
  for (const v of vocals) {
    assert.equal(v.notes.reduce((a, n) => a + n.beats, 0), v.bars * 4);
    for (const n of v.notes) if (n.key != null) assert.ok(n.key >= R[v.singer][0] && n.key <= R[v.singer][1], `${v.name} ${n.lyric}${n.key}`);
  }
  assert.equal(meta.vocalMode, 'talk');
});
