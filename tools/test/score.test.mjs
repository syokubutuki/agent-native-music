import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateScore } from '../lib/score.mjs';
import { buildPlayer } from '../build-player.mjs';
import { toMusicXml } from '../export-musicxml.mjs';

const songs = readdirSync(new URL('../../songs/', import.meta.url)).filter((f) => f.endsWith('.json'));
const template = readFileSync(new URL('../../web/player.template.html', import.meta.url), 'utf8');
const load = (f) => JSON.parse(readFileSync(new URL(`../../songs/${f}`, import.meta.url), 'utf8'));

test('every song in songs/ is a valid score', () => {
  assert.ok(songs.length > 0);
  for (const f of songs) assert.deepEqual(validateScore(load(f)), [], f);
});

test('song versions are unique per id', () => {
  const keys = songs.map((f) => { const s = load(f); return `${s.id}@${s.version}`; });
  assert.equal(new Set(keys).size, keys.length);
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
  const html = buildPlayer([song], template);
  assert.ok(!html.includes('__SONG_JSON__'));
  assert.ok(!html.includes('</script><b>'));
  assert.throws(() => buildPlayer([{ ...song, bpm: 1 }], template), /invalid score/);
  assert.throws(() => buildPlayer([], template), /non-empty/);
});

const vocalSongs = songs.map(load).filter((x) => x.tracks.some((t) => t.vocal));

test('vocal rules are enforced', () => {
  const song = structuredClone(vocalSongs[0]);
  const v = song.tracks.find((t) => t.vocal);
  v.notes[0][4] = 'abc';
  v.notes[1][0] = v.notes[0][0];
  const errs = validateScore(song).join('\n');
  assert.match(errs, /1 mora in hiragana/);
  assert.match(errs, /overlaps/);
  const cross = structuredClone(vocalSongs[0]);
  cross.tracks.find((t) => t.vocal).notes[0][0] = 3.5;
  cross.tracks.find((t) => t.vocal).notes[0][1] = 1;
  assert.match(validateScore(cross).join('\n'), /crosses a bar line/);
});

test('MusicXML export: every measure is full, every sung note carries one lyric', () => {
  assert.ok(vocalSongs.length >= 1);
  for (const song of vocalSongs) {
    const xml = toMusicXml(song);
    const measures = xml.match(/<measure [\s\S]*?<\/measure>/g);
    assert.equal(measures.length, song.bars);
    for (const m of measures) {
      const sum = [...m.matchAll(/<duration>(\d+)<\/duration>/g)].reduce((a, x) => a + Number(x[1]), 0);
      assert.equal(sum, song.beatsPerBar * 12, 'measure length');
    }
    const sung = song.tracks.find((t) => t.vocal).notes.length;
    assert.equal((xml.match(/<lyric /g) || []).length, sung);
    assert.equal((xml.match(/<pitch>/g) || []).length, sung);
    assert.match(xml, new RegExp(`<sound tempo="${song.bpm}"/>`));
  }
});

test('every lyric line in a song is the lyric of notes that start at that line', () => {
  for (const song of vocalSongs) {
    const v = song.tracks.find((t) => t.vocal);
    const hira = (x) => x.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
    const joined = hira(song.lyrics.map((l) => l.text.replace(/\s/g, '')).join(''));
    const sung = [...v.notes].sort((a, b) => a[0] - b[0]).map((n) => n[4]).join('');
    assert.equal(sung, joined, song.id);
  }
});

test('rhyme analysis: vowels and shared endings', async () => {
  const { vowels, analyze, morae } = await import('../rhyme.mjs');
  assert.equal(vowels('べつに'), 'eui');
  assert.deepEqual(morae('ひゃくじゅう'), ['ひゃ', 'く', 'じゅ', 'う']);
  const r = analyze(['きにしてない', 'きたいしてない', 'だけど']);
  assert.ok(r.perLine[1].endWithPrev >= 3);
});
