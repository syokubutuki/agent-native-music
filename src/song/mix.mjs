// Mixing helpers for songs: load/resample audio, process the vocal, duck the bed under it, finish.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { decodeWav } from '../lab/wav.mjs';
import { createSvf, peak, rms, scale } from '../lab/dsp.mjs';

export function loadWav(file, sampleRate) {
  let buf = fs.readFileSync(file);
  if (decodeWav(buf).sampleRate !== sampleRate) {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'song-')), 'r.wav');
    const res = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-ar', String(sampleRate), '-c:a', 'pcm_s16le', tmp], { encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`ffmpeg resample failed: ${res.stderr || res.error?.message}`);
    buf = fs.readFileSync(tmp);
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
  return decodeWav(buf);
}

// Follower used for ducking: fast attack, slower release.
function envelope(x, sr, attackMs = 5, releaseMs = 120) {
  const a = Math.exp(-1 / ((attackMs / 1000) * sr));
  const r = Math.exp(-1 / ((releaseMs / 1000) * sr));
  const out = new Float32Array(x.length);
  let e = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    e = v > e ? a * e + (1 - a) * v : r * e + (1 - r) * v;
    out[i] = e;
  }
  return out;
}

// Lay a mono vocal (starting at offset seconds) over a stereo bed. The vocal is high-passed, brought to a
// fixed level, and the bed dips by up to `duck` while the voice sounds.
export function mixVocal(bed, vocal, { sampleRate, offsetSec = 0, vocalDb = -14, bedDb = -19, duck = 0.45 }) {
  const n = bed.left.length;
  const v = new Float32Array(n);
  const hp = createSvf('hp', 140, Math.SQRT1_2, sampleRate);
  const off = Math.round(offsetSec * sampleRate);
  for (let i = 0; i < vocal.length && i + off < n; i++) if (i + off >= 0) v[i + off] = hp(vocal[i]);
  const vr = rms(v.filter((x) => x !== 0));
  if (vr > 0) scale(v, 10 ** (vocalDb / 20) / vr);
  const br = rms(bed.left, bed.right);
  const bedGain = br > 0 ? 10 ** (bedDb / 20) / br : 1;
  const env = envelope(v, sampleRate);
  const envPeak = Math.max(1e-9, peak(env));
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const g = bedGain * (1 - duck * Math.min(1, env[i] / (envPeak * 0.5)));
    left[i] = bed.left[i] * g + v[i];
    right[i] = bed.right[i] * g + v[i];
  }
  return { left, right, sampleRate };
}

// Final level: soft knee above 0.6, ceiling 0.89, after bringing the mix to about -14 dBFS RMS.
export function finish(mix, { targetDb = -14 } = {}) {
  const { left, right } = mix;
  const r = rms(left, right);
  if (r > 0) {
    scale(left, 10 ** (targetDb / 20) / r);
    scale(right, 10 ** (targetDb / 20) / r);
  }
  for (const buf of [left, right]) {
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i];
      const ax = Math.abs(x);
      if (ax > 0.6) buf[i] = Math.sign(x) * (0.6 + 0.29 * Math.tanh((ax - 0.6) / 0.29));
    }
  }
  return mix;
}
