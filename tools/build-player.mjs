// 使い方: node tools/build-player.mjs [songs/a.json songs/b.json ...] → dist/player.html
// 引数なしなら songs/*.json すべて(版の聴き比べ用)。楽譜 JSON をテンプレートに埋め込んだ単一 HTML を作る。
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScore } from './lib/score.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = '__SONG_JSON__';

export function buildPlayer(songs, template) {
  if (!Array.isArray(songs) || songs.length === 0) throw new Error('songs must be a non-empty array');
  for (const song of songs) {
    const errors = validateScore(song);
    if (errors.length) throw new Error(`invalid score ${song?.id}@v${song?.version}:\n- ` + errors.join('\n- '));
  }
  if (!template.includes(TOKEN)) throw new Error(`template lacks ${TOKEN}`);
  const json = JSON.stringify(songs).replace(/</g, '\\u003c');
  return template.split(TOKEN).join(json);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const paths = (args.length ? args : readdirSync(resolve(root, 'songs')).filter((f) => f.endsWith('.json')).sort().map((f) => `songs/${f}`)).map((f) => resolve(root, f));
  const songs = paths.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const html = buildPlayer(songs, readFileSync(resolve(root, 'web/player.template.html'), 'utf8'));
  const out = resolve(root, 'dist/player.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`built ${out} (${html.length} bytes) from ${paths.length} song(s)`);
}
