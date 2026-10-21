#!/usr/bin/env node
// Song CLI: renders the parts of a song folder (songs/<name>/song.json) and lists them for the listening page.

import fs from 'node:fs';
import path from 'node:path';
import { parseNotes } from '../src/song/notes.mjs';
import { toScore, singQuery, frameSynthesis } from '../src/song/voicevox.mjs';

const USAGE = `usage: node bin/song.mjs <command> <songDir>

commands:
  voices <songDir>   sing the audition phrase with every candidate voice (needs a running VOICEVOX engine)`;

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

const [command, songDir] = process.argv.slice(2);
if (!command || !songDir) {
  console.log(USAGE);
  process.exit(command ? 1 : 0);
}
try {
  if (command === 'voices') await cmdVoices(path.resolve(songDir));
  else fail(`unknown command: ${command}\n\n${USAGE}`);
} catch (err) {
  fail(err.message);
}
