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
  chorus <songDir>   fast hard-tuned chorus over a grid-locked bed, once per candidate voice
  produce <songDir> [--mode talk|talkhard|sing|hard]
                     render a produced song from <songDir>/score.mjs: full mix + instrumental (needs VOICEVOX).
                     --mode overrides how the voices sing (talk voices / talk voices pitch-pinned / singing voices / singing pinned)`;

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
  const once = parseNotes(chorus.notes);
  const notes = Array.from({ length: chorus.repeat ?? 1 }, () => once).flat(); // hear it loop
  const bars = chorus.bars * (chorus.repeat ?? 1);
  const leadBeats = 1; // one beat of bed before the voice comes in
  const outDir = path.join(songDir, 'chorus');
  fs.mkdirSync(outDir, { recursive: true });
  const voices = chorus.voices.map((id) => song.audition.voices.find((v) => v.id === id));
  const items = [];
  for (const bpm of chorus.tempos ?? [song.bpm]) {
    const score = toScore(notes, bpm, { leadBeats });
    const durationSec = ((leadBeats + bars * 4 + 2) * 60) / bpm; // two beats of tail
    const bed = render(songGenome(seedGenome(songDir, song), { bpm, durationSec, points: CHORUS_POINTS, tuning12: { baseHz: F2 } }), { sampleRate: SR });
    const bedWav = path.join(outDir, `bed-${bpm}.wav`);
    fs.writeFileSync(bedWav, encodeWav(finish({ left: bed.left.slice(), right: bed.right.slice(), sampleRate: SR }, { targetDb: -16 })));
    items.push({ id: `c${bpm}-bed`, group: chorus.group, label: `${bpm}`, title: `伴奏のみ · ${bpm} BPM`, desc: 'g0003-01 を拍に固定・12 平均律 A フリジア', wav: path.relative(songDir, bedWav), durationSec });
    const query = hardTune(await singQuery(score), score, (i) => midiHz(score.notes[i].key), { glide: 2 });
    for (const v of voices) {
      const dry = path.join(outDir, `${bpm}-${v.id}-dry.wav`);
      fs.writeFileSync(dry, await frameSynthesis(query, v.style));
      const mix = finish(mixVocal({ left: bed.left, right: bed.right }, loadWav(dry, SR).channels[0], { sampleRate: SR }));
      const id = `c${bpm}-${v.id.slice(2)}`;
      const wav = path.join(outDir, `${id}.wav`);
      fs.writeFileSync(wav, encodeWav(mix));
      items.push({ id, group: chorus.group, label: `${bpm}`, title: `${v.name}（${v.styleName}） · ${bpm} BPM`, desc: `VOICEVOX:${v.name} · ${chorus.note}`, wav: path.relative(songDir, wav), durationSec });
      console.log(`[song] ${id}`);
    }
  }
  updatePageManifest(songDir, chorus.group, items);
}

const MODE_LABEL = { talk: '読み上げ方式', talkhard: '読み上げ方式・機械的', sing: '歌唱方式', hard: '歌唱方式・機械的' };

async function cmdProduce(songDir, vocalMode) {
  if (vocalMode && !MODE_LABEL[vocalMode]) fail(`--mode must be talk, talkhard, sing or hard (got ${vocalMode})`);
  const { pathToFileURL } = await import('node:url');
  const { produce } = await import('../src/song/produce.mjs');
  const score = await import(pathToFileURL(path.join(songDir, 'score.mjs')).href);
  const outDir = path.join(songDir, 'out');
  const work = path.join(outDir, 'work');
  fs.mkdirSync(work, { recursive: true });
  const t0 = Date.now();
  const res = await produce(score, { voiceStyle: score.meta.voice.style, workDir: work, vocalMode, log: (m) => console.log(`[song] ${m}`) });
  const version = `${score.meta.version ?? 1}${vocalMode ? `-${vocalMode}` : ''}`;
  const modeNote = vocalMode ? `・${MODE_LABEL[vocalMode]}` : '';
  const group = `${score.meta.title}`;
  const files = { full: path.join(outDir, `full-v${version}.wav`), instrumental: path.join(outDir, `inst-v${version}.wav`) };
  fs.writeFileSync(files.full, encodeWav(res.full));
  fs.writeFileSync(files.instrumental, encodeWav(res.instrumental));
  const v = score.meta.voice;
  // keep earlier versions on the page for comparison; newest first
  const manifest = path.join(songDir, 'page.json');
  const mine = new Set([`${path.basename(songDir)}-v${version}`, `${path.basename(songDir)}-v${version}-inst`]);
  const older = fs.existsSync(manifest)
    ? JSON.parse(fs.readFileSync(manifest, 'utf8')).filter((i) => i.group === group && !mine.has(i.id))
    : [];
  updatePageManifest(songDir, group, [
    { id: `${path.basename(songDir)}-v${version}`, group, label: `v${version}`, title: `${score.meta.title}（v${score.meta.version ?? 1}${modeNote}）`,
      desc: `${score.meta.bpm} BPM · ${score.meta.key} · VOICEVOX:${v.name}（${v.styleName}）`, wav: path.relative(songDir, files.full), durationSec: res.durationSec },
...(vocalMode && vocalMode !== 'talk' ? [] : [ // the instrumental is the same for every vocal mode: list it once
    { id: `${path.basename(songDir)}-v${version}-inst`, group, label: `v${version}`, title: 'インスト（歌なし）',
      desc: `${score.meta.bpm} BPM · ${score.meta.key}`, wav: path.relative(songDir, files.instrumental), durationSec: res.durationSec },
    ]),
    ...older,
  ]);
  console.log(`[song] ${path.relative(process.cwd(), files.full)}  (${res.durationSec.toFixed(1)}s, peak ${res.full.peak.toFixed(2)}, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

const [command, songDir] = process.argv.slice(2);
if (!command || !songDir) {
  console.log(USAGE);
  process.exit(command ? 1 : 0);
}
try {
  if (command === 'voices') await cmdVoices(path.resolve(songDir));
  else if (command === 'chorus') await cmdChorus(path.resolve(songDir));
  else if (command === 'produce') {
    const i = process.argv.indexOf('--mode');
    await cmdProduce(path.resolve(songDir), i > 0 ? process.argv[i + 1] : undefined);
  }
  else fail(`unknown command: ${command}\n\n${USAGE}`);
} catch (err) {
  fail(err.message);
}
