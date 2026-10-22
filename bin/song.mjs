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
  produce <songDir> [--mode talk|talkhard|sing|hard] [--heta none|weak|mid|strong]
                     render a produced song from <songDir>/score.mjs: full mix + instrumental (needs VOICEVOX).
                     --mode overrides how the voices sing (talk voices / talk voices pitch-pinned / singing voices / singing pinned)
  explore <songDir> [--only id,id]
                     render the short comparison sketches of <songDir>/sketches.mjs (one file per sketch, same
                     loudness), measure them into <songDir>/measure.json and list them on the page`;

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

const HETA_LABEL = { none: '外れ方そのまま', weak: '音痴 弱', mid: '音痴 中', strong: '音痴 強' };

async function cmdProduce(songDir, vocalMode, heta) {
  if (heta && !HETA_LABEL[heta]) fail(`--heta must be none, weak, mid or strong (got ${heta})`);
  if (vocalMode && !MODE_LABEL[vocalMode]) fail(`--mode must be talk, talkhard, sing or hard (got ${vocalMode})`);
  const { pathToFileURL } = await import('node:url');
  const { produce } = await import('../src/song/produce.mjs');
  const score = await import(pathToFileURL(path.join(songDir, 'score.mjs')).href);
  const outDir = path.join(songDir, 'out');
  const work = path.join(outDir, 'work');
  fs.mkdirSync(work, { recursive: true });
  const t0 = Date.now();
  const res = await produce(score, { voiceStyle: score.meta.voice.style, workDir: work, vocalMode, heta: heta && heta !== 'none' ? heta : null, log: (m) => console.log(`[song] ${m}`) });
  const version = `${score.meta.version ?? 1}${vocalMode ? `-${vocalMode}` : ''}${heta ? `-${heta}` : ''}`;
  const modeNote = `${vocalMode ? `・${MODE_LABEL[vocalMode]}` : ''}${heta ? `・${HETA_LABEL[heta]}` : ''}`;
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
...((vocalMode && vocalMode !== 'talk') || (heta && heta !== 'none') ? [] : [ // the instrumental is the same for every vocal mode: list it once
    { id: `${path.basename(songDir)}-v${version}-inst`, group, label: `v${version}`, title: 'インスト（歌なし）',
      desc: `${score.meta.bpm} BPM · ${score.meta.key}`, wav: path.relative(songDir, files.instrumental), durationSec: res.durationSec },
    ]),
    ...older,
  ]);
  console.log(`[song] ${path.relative(process.cwd(), files.full)}  (${res.durationSec.toFixed(1)}s, peak ${res.full.peak.toFixed(2)}, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

// Energy shares of a mix in five bands (crossover lowpasses at 200 / 800 / 3000 / 8000 Hz, two biquads each).
async function bandShares(bus, sr) {
  const { biquad } = await import('../src/song/fx.mjs');
  const mono = new Float32Array(bus.left.length);
  for (let i = 0; i < mono.length; i++) mono[i] = (bus.left[i] + bus.right[i]) / 2;
  const energy = (x) => x.reduce((a, v) => a + v * v, 0);
  const below = (f) => {
    const a = biquad('lowpass', f, { sr });
    const b = biquad('lowpass', f, { sr });
    return energy(mono.map((v) => b(a(v))));
  };
  const total = energy(mono) || 1;
  const cuts = [200, 800, 3000, 8000].map(below);
  const edges = [0, ...cuts, total];
  const names = ['low', 'lowMid', 'mid', 'presence', 'air'];
  return Object.fromEntries(names.map((n, i) => [n, Math.round((1000 * Math.max(0, edges[i + 1] - edges[i])) / total) / 10]));
}

async function cmdExplore(songDir, only) {
  const { pathToFileURL } = await import('node:url');
  const { produce } = await import('../src/song/produce.mjs');
  const { sketches } = await import(pathToFileURL(path.join(songDir, 'sketches.mjs')).href);
  const outDir = path.join(songDir, 'out');
  const work = path.join(outDir, 'work');
  fs.mkdirSync(work, { recursive: true });
  const want = only ? new Set(only.split(',')) : null;
  const measureFile = path.join(songDir, 'measure.json');
  const measures = fs.existsSync(measureFile) ? JSON.parse(fs.readFileSync(measureFile, 'utf8')) : {};
  const done = new Map(); // identical scores (the per-group references) are rendered once
  for (const sk of sketches) {
    if (want && !want.has(sk.id)) continue;
    const key = JSON.stringify(sk.score);
    const wav = path.join(outDir, `${sk.id}.wav`);
    const t0 = Date.now();
    if (done.has(key)) {
      fs.copyFileSync(done.get(key).wav, wav);
      measures[sk.id] = { ...done.get(key).m, sameAs: done.get(key).id };
    } else {
      const res = await produce(sk.score, { voiceStyle: sk.score.meta.voice.style, workDir: work, log: (m) => (m.startsWith('stem') ? null : console.log(`[song] ${sk.id}: ${m}`)) });
      fs.writeFileSync(wav, encodeWav(res.full));
      const m = { durationSec: Math.round(res.durationSec * 100) / 100, peak: Math.round(res.full.peak * 100) / 100, ...res.stats, bands: await bandShares(res.full, res.sr) };
      measures[sk.id] = m;
      done.set(key, { wav, m, id: sk.id });
    }
    console.log(`[song] ${sk.id}  ${JSON.stringify(measures[sk.id])}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  fs.writeFileSync(measureFile, JSON.stringify(measures, null, 2) + '\n');
  // page: every sketch whose audio exists, grouped by direction, in the order of sketches.mjs
  const items = sketches
    .filter((sk) => fs.existsSync(path.join(outDir, `${sk.id}.wav`)))
    .map((sk) => ({ id: `duo-${sk.id}`, group: sk.group, label: sk.label, title: sk.title, desc: sk.desc, wav: `out/${sk.id}.wav`, durationSec: measures[sk.id]?.durationSec }));
  fs.writeFileSync(path.join(songDir, 'page.json'), JSON.stringify(items, null, 2) + '\n');
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
    const opt = (name) => {
      const i = process.argv.indexOf(name);
      return i > 0 ? process.argv[i + 1] : undefined;
    };
    await cmdProduce(path.resolve(songDir), opt('--mode'), opt('--heta'));
  }
  else if (command === 'explore') {
    const i = process.argv.indexOf('--only');
    await cmdExplore(path.resolve(songDir), i > 0 ? process.argv[i + 1] : undefined);
  }
  else fail(`unknown command: ${command}\n\n${USAGE}`);
} catch (err) {
  fail(err.message);
}
