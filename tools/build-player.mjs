// 使い方: node tools/build-player.mjs [songs/xxx.json] → dist/player.html
// 楽譜 JSON をテンプレートに埋め込んだ単一 HTML を作る (Artifact として公開する用)。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScore } from './lib/score.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = '__SONG_JSON__';

export function buildPlayer(song, template) {
  const errors = validateScore(song);
  if (errors.length) throw new Error('invalid score:\n- ' + errors.join('\n- '));
  if (!template.includes(TOKEN)) throw new Error(`template lacks ${TOKEN}`);
  const json = JSON.stringify(song).replace(/</g, '\\u003c');
  return template.split(TOKEN).join(json);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const songPath = resolve(root, process.argv[2] ?? 'songs/lofi-rain-v1.json');
  const song = JSON.parse(readFileSync(songPath, 'utf8'));
  const html = buildPlayer(song, readFileSync(resolve(root, 'web/player.template.html'), 'utf8'));
  const out = resolve(root, 'dist/player.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`built ${out} (${html.length} bytes) from ${songPath}`);
}
