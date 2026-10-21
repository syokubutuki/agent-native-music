import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseNotes, pitchToMidi } from '../../src/song/notes.mjs';
import { toScore, hardTune, frameNoteIndex, midiHz, FRAME_RATE } from '../../src/song/voicevox.mjs';
import { quantizeStep, to12edo, songGenome, sixteenthMs } from '../../src/song/arrange.mjs';

test('pitch names and note parsing', () => {
  assert.equal(pitchToMidi('A4'), 69);
  assert.equal(pitchToMidi('Bb4'), 70);
  assert.equal(pitchToMidi('C#5'), 73);
  assert.throws(() => pitchToMidi('H2'), /bad pitch/);
  assert.deepEqual(parseNotes([['あ', 'A4', 2], ['', null, 1]]), [
    { key: 69, lyric: 'あ', beats: 0.5 },
    { key: null, lyric: '', beats: 0.25 },
  ]);
});

test('score frames follow absolute time, so 16ths at 180 BPM never drift', () => {
  const notes = Array.from({ length: 96 }, () => ({ key: 69, lyric: 'ら', beats: 0.25 }));
  const score = toScore(notes, 180, { leadBeats: 1 });
  assert.equal(score.notes[0].key, null); // engine requires a leading rest
  const sung = score.notes.slice(1, -1).reduce((a, n) => a + n.frame_length, 0);
  assert.equal(sung, Math.round((1 + 24) * (60 / 180) * FRAME_RATE) - Math.round(1 * (60 / 180) * FRAME_RATE));
  assert.ok(score.notes.slice(1, -1).every((n) => n.frame_length === 7 || n.frame_length === 8));
});

test('hardTune pins voiced frames to the note target', () => {
  const score = { notes: [{ key: null, frame_length: 2 }, { key: 69, frame_length: 3 }, { key: 72, frame_length: 3 }] };
  const query = { f0: [0, 0, 430, 445, 441, 520, 530, 0] };
  const tuned = hardTune(query, score, (i) => midiHz(score.notes[i].key), { glide: 0 });
  assert.deepEqual(frameNoteIndex(query, score), [0, 0, 1, 1, 1, 2, 2, 2]);
  assert.deepEqual(tuned.f0.map((f) => Math.round(f)), [0, 0, 440, 440, 440, 523, 523, 0]);
});

test('song genome locks steps to the grid and retunes to the mode', () => {
  assert.equal(quantizeStep(81.7, 180), sixteenthMs(180));
  assert.equal(quantizeStep(536, 180), 6 * sixteenthMs(180));
  const seed = JSON.parse(fs.readFileSync(new URL('../../lab/gen-0003/g0003-01.json', import.meta.url), 'utf8'));
  const g = songGenome(seed, { bpm: 180, durationSec: 4, points: [{ t: 0, e: 1, shape: 'linear' }, { t: 1, e: 1, shape: 'linear' }], tuning12: { baseHz: 87.31 } });
  assert.equal(g.form.tempoBend, 0);
  assert.equal(g.tuning.divisions, 12);
  const allowed = new Set([0, 2, 4, 5, 7, 9, 11]);
  for (const v of g.voices) {
    assert.ok(Number.isInteger(Math.round((v.stepMs / sixteenthMs(180)) * 1e9) / 1e9));
    for (const d of v.degrees) assert.ok(allowed.has(d % 12), `degree ${d} outside the mode`);
  }
  assert.equal(seed.tuning.divisions, 11); // seed untouched
  assert.deepEqual(to12edo(seed, {}).voices[2].degrees, [16, 19, 2, 9]);
});
