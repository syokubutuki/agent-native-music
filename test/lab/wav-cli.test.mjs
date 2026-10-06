import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodeWav } from '../../src/lab/wav.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'lab.mjs');

test('WAV header describes 16-bit stereo PCM', () => {
  const left = new Float32Array([0, 1, -1, 0.5]);
  const right = new Float32Array([0, -1, 1, 2]);
  const buf = encodeWav({ left, right, sampleRate: 22050 });
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.readUInt32LE(4), buf.length - 8);
  assert.equal(buf.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(buf.readUInt16LE(20), 1);
  assert.equal(buf.readUInt16LE(22), 2);
  assert.equal(buf.readUInt32LE(24), 22050);
  assert.equal(buf.readUInt32LE(28), 22050 * 4);
  assert.equal(buf.readUInt16LE(32), 4);
  assert.equal(buf.readUInt16LE(34), 16);
  assert.equal(buf.toString('ascii', 36, 40), 'data');
  assert.equal(buf.readUInt32LE(40), 16);
  assert.equal(buf.readInt16LE(44 + 4), 32767);
  assert.equal(buf.readInt16LE(44 + 6), -32768);
  assert.equal(buf.readInt16LE(44 + 14), 32767); // clamped
});

test('CLI: new -> rate -> evolve -> list -> render', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-'));
  const run = (...args) => execFileSync(process.execPath, [CLI, ...args, '--dir', dir], { encoding: 'utf8' });
  try {
    run('new', '--count', '3', '--duration', '0.5', '--seed', '1');
    for (const id of ['g0001-01', 'g0001-02', 'g0001-03']) {
      assert.ok(fs.existsSync(path.join(dir, 'gen-0001', `${id}.json`)));
      assert.ok(fs.existsSync(path.join(dir, 'gen-0001', `${id}.wav`)));
    }
    assert.throws(() => run('evolve'), /no ratings/);
    run('rate', 'g0001-02', '5', 'metallic', 'stutter');
    run('rate', 'g0001-03', '2');
    run('rate', 'g0001-03', '4'); // latest rating wins
    assert.throws(() => run('rate', 'g0001-09', '3'), /no such clip/);
    assert.throws(() => run('rate', 'g0001-01', '7'), /1-5/);

    run('evolve', '--count', '2', '--top', '2', '--seed', '2');
    const child = JSON.parse(fs.readFileSync(path.join(dir, 'gen-0002', 'g0002-01.json'), 'utf8'));
    assert.equal(child.meta.generation, 2);
    assert.ok(child.meta.parents.every((p) => ['g0001-02', 'g0001-03'].includes(p)));

    const list = run('list', '--rated');
    assert.match(list, /g0001-02\s+★5/);
    assert.match(list, /g0001-03\s+★4/);
    assert.doesNotMatch(list, /g0001-01/);
    assert.match(list, /"metallic stutter"/);

    const out = path.join(dir, 'long.wav');
    run('render', 'g0001-02', '--duration', '1', '--out', out);
    const wav = fs.readFileSync(out);
    assert.equal(wav.readUInt32LE(40), wav.readUInt32LE(24) * 4 * 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: identical seeds produce identical clips', () => {
  const dirs = [0, 1].map(() => fs.mkdtempSync(path.join(os.tmpdir(), 'lab-')));
  try {
    for (const dir of dirs) {
      execFileSync(process.execPath, [CLI, 'new', '--count', '1', '--duration', '0.5', '--seed', '99', '--dir', dir]);
    }
    const [a, b] = dirs.map((d) => fs.readFileSync(path.join(d, 'gen-0001', 'g0001-01.wav')));
    assert.ok(a.equals(b));
  } finally {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
});
