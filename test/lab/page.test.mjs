import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRatings } from '../../src/lab/store.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'lab.mjs');

function withLab(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-page-'));
  const run = (...args) => execFileSync(process.execPath, [CLI, ...args, '--dir', dir], { encoding: 'utf8' });
  try {
    run('new', '--count', '2', '--duration', '0.5', '--seed', '3');
    return fn(dir, run);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('page embeds every clip with audio, envelope and form, and stays script-safe', () => {
  withLab((dir, run) => {
    run('rate', 'g0001-02', '4', '</script><b>x');
    run('page', '--format', 'wav', '--songs', path.join(dir, 'no-songs'));
    const html = fs.readFileSync(path.join(dir, 'site', 'index.html'), 'utf8');
    assert.ok(html.startsWith('<title>'));
    assert.ok(!html.includes('__LAB_DATA__'));
    const json = html.match(/<script type="application\/json" id="lab-data">([\s\S]*?)<\/script>/)[1];
    assert.ok(!json.includes('</script>'));
    const data = JSON.parse(json);
    assert.deepEqual(data.clips.map((c) => c.id), ['g0001-01', 'g0001-02']);
    for (const c of data.clips) {
      assert.ok(fs.existsSync(path.join(dir, 'site', c.audio)));
      assert.equal(c.env.length, 160);
      assert.ok(Math.max(...c.env) === 1);
      assert.ok(Array.isArray(c.form) && c.form.length >= 3);
    }
    assert.deepEqual(data.clips[1].rating, { score: 4, note: '</script><b>x' });
  });
});

test('import appends only changed ratings and rejects bad rows', () => {
  withLab((dir, run) => {
    run('rate', 'g0001-01', '3', 'same');
    const file = path.join(dir, 'in.json');
    fs.writeFileSync(file, JSON.stringify([
      { id: 'g0001-01', score: 3, note: 'same', updatedAt: '2026-10-10T00:00:00Z' }, // unchanged -> skipped
      { id: 'g0001-02', score: 5, note: ' [0:12] 良い ', updatedAt: '2026-10-10T00:01:00Z' },
      { id: 'g0001-01', score: null, note: 'draft only' }, // no score -> skipped
    ]));
    assert.match(run('import', file), /imported 1 rating/);
    assert.match(run('import', file), /imported 0 rating/); // idempotent
    const r = loadRatings(dir);
    assert.equal(r.get('g0001-02').score, 5);
    assert.equal(r.get('g0001-02').note, '[0:12] 良い');
    assert.equal(r.get('g0001-01').note, 'same');

    fs.writeFileSync(file, JSON.stringify({ 'g0009-01': { score: 2 } }));
    assert.throws(() => run('import', file), /unknown clip id/);
    fs.writeFileSync(file, JSON.stringify({ 'g0001-01': { score: 9 } }));
    assert.throws(() => run('import', file), /1-5/);
  });
});

test('page --reuse keeps published entries for song renders that are not on disk', () => {
  withLab((dir, run) => {
    const songs = path.join(dir, 'songs');
    fs.mkdirSync(path.join(songs, 'old'), { recursive: true });
    fs.writeFileSync(path.join(songs, 'old', 'page.json'), JSON.stringify([
      { id: 'old-v1', group: '古い曲', label: 'v1', title: '古い曲 v1', desc: 'x', wav: 'out/full-v1.wav', durationSec: 3 },
    ]));
    assert.throws(() => run('page', '--format', 'wav', '--songs', songs), /missing audio for old-v1/);
    const published = path.join(dir, 'published.html');
    const prev = { id: 'old-v1', group: '古い曲', audio: 'audio/old-v1.mp3', env: [0.5, 1], rating: null, form: null };
    fs.writeFileSync(published, `<p><script type="application/json" id="lab-data">${JSON.stringify({ groups: ['古い曲'], clips: [prev] })}</script>`);
    run('page', '--format', 'wav', '--songs', songs, '--reuse', published);
    const html = fs.readFileSync(path.join(dir, 'site', 'index.html'), 'utf8');
    const data = JSON.parse(html.match(/id="lab-data">([\s\S]*?)<\/script>/)[1]);
    const old = data.clips.find((c) => c.id === 'old-v1');
    assert.equal(old.audio, 'audio/old-v1.mp3');
    assert.deepEqual(old.env, [0.5, 1]);
    assert.equal(old.title, '古い曲 v1');
    assert.ok(!fs.existsSync(path.join(dir, 'site', 'audio', 'old-v1.wav')));
    // the published group order is kept; groups new since then (the lab generation) go first
    assert.deepEqual(data.groups, ['第1世代', '古い曲']);
    assert.deepEqual(data.clips.map((c) => c.group), ['第1世代', '第1世代', '古い曲']);
  });
});
