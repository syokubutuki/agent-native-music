#!/usr/bin/env node
// Song CLI: renders the parts of a song folder (songs/<name>/song.json) and lists them for the listening page.

import fs from 'node:fs';
import path from 'node:path';
import { parseNotes } from '../src/song/notes.mjs';
import { toScore, singQuery, frameSynthesis, hardTune, midiHz } from '../src/song/voicevox.mjs';
import { songGenome } from '../src/song/arrange.mjs';
import { loadWav, mixVocal, finish } from '../src/song/mix.mjs';
import { render } from '../src/lab/render.mjs';
import { encodeWav } from '../src/lab/wav.mjs';

const SR = 44100;
const F2 = 87.30705785825097;

const USAGE = `usage: node bin/song.mjs <command> <songDir>

commands:
  voices <songDir>   sing the audition phrase with every candidate voice (needs a running VOICEVOX engine)
  chorus <songDir>   fast hard-tuned chorus over a grid-locked bed, once per candidate voice`;

function fail(msg) {
  console.error(`[song] ${msg}`);
  process.exit(1);
}

// page.json is shared by every command: replace this group's items, keep the others.
export function updatePageManifest(songDir, group, items) {
  const file = path.join(songDir, 'page.json');
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  fs.writeFileSync(file, JSON.stringify([...items, ...prev.filter((i) => i.group !== group)], null, 2) + '\n');
}

async function cmdVoices(songDir) {
  const song = JSON.parse(fs.readFileSync(path.join(songDir, 'song.json'), 'utf8'));
  const { audition } = song;
  const notes = parseNotes(audition.notes);
  // The phrase is written on the 180 grid but sung half-time, so the score runs at bpm/2 in quarter beats.
  const score = toScore(notes.map((n) => ({ ...n, beats: n.beats })), song.bpm / 2, { leadBeats: 0.5 });
  const query = await singQuery(score);
  const outDir = path.join(songDir, 'voices');
  fs.mkdirSync(outDir, { recursive: true });
  const items = [];
  for (const [i, v] of audition.voices.entries()) {
    const wav = path.join(outDir, `${v.id}.wav`);
    fs.writeFileSync(wav, await frameSynthesis(query, v.style));
    items.push({
      id: v.id,
      group: audition.group,
      label: String(i + 1).padStart(2, '0'),
      title: `${v.name}（${v.styleName}）`,
      desc: `VOICEVOX:${v.name} · style ${v.style} · ${audition.note}`,
      wav: path.relative(songDir, wav),
      durationSec: query.f0.length / (24000 / 256),
    });
    console.log(`[song] ${v.id}  ${v.name}（${v.styleName}）`);
  }
  updatePageManifest(songDir, audition.group, items);
}

function loadSong(songDir) {
  return JSON.parse(fs.readFileSync(path.join(songDir, 'song.json'), 'utf8'));
}

function seedGenome(songDir, song) {
  return JSON.parse(fs.readFileSync(path.resolve(songDir, '..', '..', song.seed), 'utf8'));
}

// Chorus energy: flat and high, like the seed's long plateau.
const CHORUS_POINTS = [
  { t: 0, e: 0.9, shape: 'linear' },
  { t: 0.5, e: 0.9, shape: 'linear' },
  { t: 1, e: 0.9, shape: 'linear' },
];

async function cmdChorus(songDir) {
  const song = loadSong(songDir);
  const { chorus } = song;
  const notes = parseNotes(chorus.notes);
  const leadBeats = 1; // one beat of bed before the voice comes in
  const score = toScore(notes, song.bpm, { leadBeats });
  const durationSec = ((leadBeats + chorus.bars * 4) * 60) / song.bpm;
  const outDir = path.join(songDir, 'chorus');
  fs.mkdirSync(outDir, { recursive: true });

  const bedGenome = songGenome(seedGenome(songDir, song), {
    bpm: song.bpm,
    durationSec,
    points: CHORUS_POINTS,
    tuning12: { baseHz: F2 },
  });
  const bed = render(bedGenome, { sampleRate: SR });
  const bedWav = path.join(outDir, 'bed.wav');
  fs.writeFileSync(bedWav, encodeWav(finish({ ...bed, left: bed.left.slice(), right: bed.right.slice() }, { targetDb: -16 })));
  const items = [{
    id: 'c-bed', group: chorus.group, label: '00', title: '伴奏のみ（g0003-01 を 180 BPM・12 平均律に固定）',
    desc: 'サビのエネルギー 0.9 で一定', wav: path.relative(songDir, bedWav), durationSec,
  }];

  const query = hardTune(await singQuery(score), score, (i) => midiHz(score.notes[i].key), { glide: 1 });
  for (const [i, v] of song.audition.voices.entries()) {
    const dry = path.join(outDir, `${v.id}-dry.wav`);
    fs.writeFileSync(dry, await frameSynthesis(query, v.style));
    const vocal = loadWav(dry, SR).channels[0];
    const mix = finish(mixVocal({ left: bed.left, right: bed.right }, vocal, { sampleRate: SR }));
    const wav = path.join(outDir, `c-${v.id.slice(2)}.wav`);
    fs.writeFileSync(wav, encodeWav(mix));
    items.push({
      id: `c-${v.id.slice(2)}`, group: chorus.group, label: String(i + 1).padStart(2, '0'),
      title: `${v.name}（${v.styleName}）`, desc: `VOICEVOX:${v.name} · ${chorus.note}`,
      wav: path.relative(songDir, wav), durationSec,
    });
    console.log(`[song] c-${v.id.slice(2)}  ${v.name}（${v.styleName}）`);
  }
  updatePageManifest(songDir, chorus.group, items);
}

const [command, songDir] = process.argv.slice(2);
if (!command || !songDir) {
  console.log(USAGE);
  process.exit(command ? 1 : 0);
}
try {
  if (command === 'voices') await cmdVoices(path.resolve(songDir));
  else if (command === 'chorus') await cmdChorus(path.resolve(songDir));
  else fail(`unknown command: ${command}\n\n${USAGE}`);
} catch (err) {
  fail(err.message);
}
