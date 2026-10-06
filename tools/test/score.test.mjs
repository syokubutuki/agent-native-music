import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateScore } from '../lib/score.mjs';
import { buildPlayer } from '../build-player.mjs';

const songs = readdirSync(new URL('../../songs/', import.meta.url)).filter((f) => f.endsWith('.json'));
const template = readFileSync(new URL('../../web/player.template.html', import.meta.url), 'utf8');
const load = (f) => JSON.parse(readFileSync(new URL(`../../songs/${f}`, import.meta.url), 'utf8'));

test('every song in songs/ is a valid score', () => {
  assert.ok(songs.length > 0);
  for (const f of songs) assert.deepEqual(validateScore(load(f)), [], f);
});

test('validateScore rejects bad scores', () => {
  const good = load(songs[0]);
  const bad = structuredClone(good);
  bad.tracks[0].notes[0][2] = 'H9';
  bad.tracks[0].instrument = 'banjo';
  bad.bpm = 5;
  const errs = validateScore(bad).join('\n');
  assert.match(errs, /pitch invalid/);
  assert.match(errs, /instrument unknown/);
  assert.match(errs, /bpm/);
  const off = structuredClone(good);
  off.tracks[0].notes[0][0] = 0.1;
  assert.match(validateScore(off).join('\n'), /multiple of 1\/12/);
});

test('buildPlayer embeds the score and refuses invalid input', () => {
  const song = load(songs[0]);
  song.title = '</script><b>x';
  const html = buildPlayer(song, template);
  assert.ok(!html.includes('__SONG_JSON__'));
  assert.ok(!html.includes('</script><b>'));
  assert.throws(() => buildPlayer({ ...song, bpm: 1 }, template), /invalid score/);
});
