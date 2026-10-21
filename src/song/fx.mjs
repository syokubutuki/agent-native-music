// Mix effects for produced songs. All functions work in place on Float32Arrays or return new buses.

import { createSvf, peak, rms } from '../lab/dsp.mjs';

// Freeverb (Jezar): 8 parallel damped combs + 4 series allpasses per channel, right channel offset.
const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS = [556, 441, 341, 225];
const SPREAD = 23;

export function reverb(bus, { sr, room = 0.82, damp = 0.35, wet = 1 } = {}) {
  const scaleT = sr / 44100;
  const out = { left: new Float32Array(bus.left.length), right: new Float32Array(bus.left.length) };
  for (const [ch, offset] of [['left', 0], ['right', SPREAD]]) {
    const combs = COMBS.map((n) => ({ buf: new Float32Array(Math.round((n + offset) * scaleT)), i: 0, store: 0 }));
    const aps = ALLPASS.map((n) => ({ buf: new Float32Array(Math.round((n + offset) * scaleT)), i: 0 }));
    const dst = out[ch];
    for (let s = 0; s < bus.left.length; s++) {
      const x = (bus.left[s] + bus.right[s]) * 0.015; // freeverb's fixed input gain, mono in
      let y = 0;
      for (const c of combs) {
        const o = c.buf[c.i];
        c.store = o * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * room;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      for (const a of aps) {
        const b = a.buf[a.i];
        a.buf[a.i] = y + b * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = b - y;
      }
      dst[s] = y * wet;
    }
  }
  return out;
}

// Ping-pong delay; time in beats (0.75 = dotted 8th). Lowpass in the loop keeps repeats dark.
export function pingPong(bus, { sr, bpm, beats = 0.75, feedback = 0.38, cutoff = 3500 } = {}) {
  const d = Math.max(1, Math.round((beats * 60 * sr) / bpm));
  const n = bus.left.length;
  const out = { left: new Float32Array(n), right: new Float32Array(n) };
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  const lpl = createSvf('lp', cutoff, 0.7, sr);
  const lpr = createSvf('lp', cutoff, 0.7, sr);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const dl = bl[p];
    const dr = br[p];
    const mono = (bus.left[i] + bus.right[i]) * 0.5;
    bl[p] = lpl(mono + dr * feedback);
    br[p] = lpr(dl * feedback);
    p = (p + 1) % d;
    out.left[i] = dl;
    out.right[i] = dr;
  }
  return out;
}

// Gain curve that dips after each kick: the "pumping" of dance music.
export function sidechainCurve(total, kickBeats, { sr, bpm, depth = 0.6, releaseMs = 140, attackMs = 4 }) {
  const g = new Float32Array(total).fill(1);
  const rel = (releaseMs / 1000) * sr;
  const att = (attackMs / 1000) * sr;
  for (const b of kickBeats) {
    const s0 = Math.round((b * 60 * sr) / bpm);
    for (let n = 0; n < rel * 5 && s0 + n < total; n++) {
      const shape = n < att ? n / att : 1;
      const dip = depth * shape * Math.exp(-Math.max(0, n - att) / rel);
      if (s0 + n >= 0) g[s0 + n] = Math.min(g[s0 + n], 1 - dip);
    }
  }
  return g;
}

export function applyGain(bus, curve) {
  for (let i = 0; i < bus.left.length; i++) {
    bus.left[i] *= curve[i];
    bus.right[i] *= curve[i];
  }
  return bus;
}

// RBJ biquad (peaking / lowshelf / highshelf / highpass / lowpass).
export function biquad(type, f, { sr, q = 0.707, gainDb = 0 }) {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * f) / sr;
  const cs = Math.cos(w);
  const sn = Math.sin(w);
  const alpha = sn / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peak') {
    [b0, b1, b2, a0, a1, a2] = [1 + alpha * A, -2 * cs, 1 - alpha * A, 1 + alpha / A, -2 * cs, 1 - alpha / A];
  } else if (type === 'lowshelf' || type === 'highshelf') {
    const sq = 2 * Math.sqrt(A) * alpha;
    const s = type === 'lowshelf' ? 1 : -1;
    b0 = A * (A + 1 - s * (A - 1) * cs + sq);
    b1 = 2 * s * A * (A - 1 - s * (A + 1) * cs);
    b2 = A * (A + 1 - s * (A - 1) * cs - sq);
    a0 = A + 1 + s * (A - 1) * cs + sq;
    a1 = -2 * s * (A - 1 + s * (A + 1) * cs);
    a2 = A + 1 + s * (A - 1) * cs - sq;
  } else if (type === 'highpass') {
    [b0, b1, b2, a0, a1, a2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + alpha, -2 * cs, 1 - alpha];
  } else {
    [b0, b1, b2, a0, a1, a2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + alpha, -2 * cs, 1 - alpha];
  }
  const c = [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

export function eq(bus, bands, sr) {
  for (const ch of ['left', 'right']) {
    const fs = bands.map(([type, f, opts]) => biquad(type, f, { sr, ...opts }));
    const buf = bus[ch];
    for (let i = 0; i < buf.length; i++) {
      let x = buf[i];
      for (const f of fs) x = f(x);
      buf[i] = x;
    }
  }
  return bus;
}

// Feed-forward compressor on the stereo-linked peak envelope.
export function compress(bus, { sr, thresholdDb = -18, ratio = 4, attackMs = 5, releaseMs = 80, makeupDb = 0 }) {
  const a = Math.exp(-1 / ((attackMs / 1000) * sr));
  const r = Math.exp(-1 / ((releaseMs / 1000) * sr));
  const thr = 10 ** (thresholdDb / 20);
  const makeup = 10 ** (makeupDb / 20);
  let env = 0;
  for (let i = 0; i < bus.left.length; i++) {
    const x = Math.max(Math.abs(bus.left[i]), Math.abs(bus.right[i]));
    env = x > env ? a * env + (1 - a) * x : r * env + (1 - r) * x;
    let g = 1;
    if (env > thr) g = (thr * (env / thr) ** (1 / ratio)) / env;
    bus.left[i] *= g * makeup;
    bus.right[i] *= g * makeup;
  }
  return bus;
}

// Scale a bus so its RMS over non-silent samples hits targetDb.
export function levelTo(bus, targetDb) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < bus.left.length; i++) {
    const e = (bus.left[i] ** 2 + bus.right[i] ** 2) / 2;
    if (e > 1e-8) {
      sum += e;
      count++;
    }
  }
  if (!count) return bus;
  const g = 10 ** (targetDb / 20) / Math.sqrt(sum / count);
  for (let i = 0; i < bus.left.length; i++) {
    bus.left[i] *= g;
    bus.right[i] *= g;
  }
  return bus;
}

export function mixInto(dst, src, gain = 1) {
  for (let i = 0; i < dst.left.length && i < src.left.length; i++) {
    dst.left[i] += src.left[i] * gain;
    dst.right[i] += src.right[i] * gain;
  }
  return dst;
}

// Master: glue compression, then a soft clipper/limiter so the ceiling stays at -1 dBFS.
export function master(bus, { sr, targetDb = -11 }) {
  compress(bus, { sr, thresholdDb: -10, ratio: 1.5, attackMs: 15, releaseMs: 150 });
  const r = rms(bus.left, bus.right);
  if (r > 0) {
    const g = 10 ** (targetDb / 20) / r;
    for (let i = 0; i < bus.left.length; i++) {
      bus.left[i] *= g;
      bus.right[i] *= g;
    }
  }
  const knee = 0.55;
  const room = 0.89 - knee;
  for (const buf of [bus.left, bus.right]) {
    for (let i = 0; i < buf.length; i++) {
      const ax = Math.abs(buf[i]);
      if (ax > knee) buf[i] = Math.sign(buf[i]) * (knee + room * Math.tanh((ax - knee) / room));
    }
  }
  return { ...bus, peak: peak(bus.left, bus.right) };
}
