// Instruments for produced songs: drums, bass, supersaw chords, pluck lead, FX.
// Every instrument renders note events into stereo Float32 buffers at a fixed sample rate.
// Events: { beat, beats, midi, vel } — times in quarter-note beats of the song's BPM.

import { createRng } from '../lab/rng.mjs';
import { createSvf } from '../lab/dsp.mjs';

const TAU = Math.PI * 2;
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// PolyBLEP keeps saws and squares from aliasing into harsh highs.
function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}
const saw = (p, dt) => 2 * p - 1 - blep(p, dt);
const square = (p, dt) => (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);

export function createBus(total) {
  return { left: new Float32Array(total), right: new Float32Array(total) };
}

function place(ctx, ev) {
  return Math.round((ev.beat * 60 * ctx.sr) / ctx.bpm);
}
function lengthOf(ctx, beats) {
  return Math.round((beats * 60 * ctx.sr) / ctx.bpm);
}

// Equal-power pan into a bus.
function add(bus, i, x, pan = 0) {
  if (i < 0 || i >= bus.left.length) return;
  const a = ((pan + 1) * Math.PI) / 4;
  bus.left[i] += x * Math.cos(a) * Math.SQRT2;
  bus.right[i] += x * Math.sin(a) * Math.SQRT2;
}

// --- drums ------------------------------------------------------------------------------------

export function kick(ctx, events, bus) {
  const len = Math.round(0.45 * ctx.sr);
  for (const ev of events) {
    const s0 = place(ctx, ev);
    let ph = 0;
    for (let n = 0; n < len; n++) {
      const t = n / ctx.sr;
      const f = 44 + 120 * Math.exp(-t / 0.032);
      ph += (TAU * f) / ctx.sr;
      const amp = Math.min(1, t / 0.0015) * Math.exp(-t / 0.2);
      const click = n < 0.003 * ctx.sr ? (1 - n / (0.003 * ctx.sr)) * 0.4 : 0;
      add(bus, s0 + n, Math.tanh(1.6 * (Math.sin(ph) * amp + click)) * (ev.vel ?? 1));
    }
  }
}

export function clap(ctx, events, bus, seed = 11) {
  const rng = createRng(seed);
  const len = Math.round(0.35 * ctx.sr);
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const bp = createSvf('bp', 1400, 1.1, ctx.sr);
    const lp = createSvf('lp', 7000, 0.7, ctx.sr);
    let ph = 0;
    for (let n = 0; n < len; n++) {
      const t = n / ctx.sr;
      // three quick slaps then a short room tail
      let env = 0;
      for (const o of [0, 0.011, 0.022]) if (t >= o) env = Math.max(env, Math.exp(-(t - o) / 0.006));
      env = Math.max(env, 0.55 * Math.exp(-Math.max(0, t - 0.022) / 0.11) * (t >= 0.022 ? 1 : 0));
      ph += (TAU * 190) / ctx.sr;
      const body = Math.sin(ph) * Math.exp(-t / 0.05) * 0.35;
      add(bus, s0 + n, (lp(bp(rng.uniform(-1, 1))) * 2.2 * env + body) * (ev.vel ?? 1));
    }
  }
}

export function hat(ctx, events, bus, seed = 23) {
  const rng = createRng(seed);
  for (const ev of events) {
    const open = ev.open;
    const len = Math.round((open ? 0.32 : 0.06) * ctx.sr);
    const s0 = place(ctx, ev);
    const hp = createSvf('hp', 7500, 0.8, ctx.sr);
    const lp = createSvf('lp', 12500, 0.7, ctx.sr); // keep the top soft: no piercing highs
    for (let n = 0; n < len; n++) {
      const t = n / ctx.sr;
      const env = Math.exp(-t / (open ? 0.11 : 0.018));
      add(bus, s0 + n, lp(hp(rng.uniform(-1, 1))) * env * (ev.vel ?? 1), ev.pan ?? 0.15);
    }
  }
}

// Noise sweep that rises over its length (build-ups).
export function riser(ctx, events, bus, seed = 31) {
  const rng = createRng(seed);
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const len = lengthOf(ctx, ev.beats);
    let st1 = 0;
    let st2 = 0;
    for (let n = 0; n < len; n++) {
      const u = n / len;
      const f = 300 * (9000 / 300) ** u;
      const g = Math.tan((Math.PI * Math.min(f, ctx.sr * 0.45)) / ctx.sr);
      const k = 1 / 3;
      const a1 = 1 / (1 + g * (g + k));
      const v0 = rng.uniform(-1, 1);
      const v3 = v0 - st2;
      const v1 = a1 * st1 + g * a1 * v3;
      const v2 = st2 + g * a1 * st1 + g * g * a1 * v3;
      st1 = 2 * v1 - st1;
      st2 = 2 * v2 - st2;
      const amp = u ** 2 * (ev.vel ?? 1);
      add(bus, s0 + n, v1 * k * amp * 1.5, Math.sin(u * TAU * 3) * 0.5);
    }
  }
}

// Low boom + filtered noise for section downbeats.
export function impact(ctx, events, bus, seed = 37) {
  const rng = createRng(seed);
  const len = Math.round(1.6 * ctx.sr);
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const lp = createSvf('lp', 2500, 0.7, ctx.sr);
    let ph = 0;
    for (let n = 0; n < len; n++) {
      const t = n / ctx.sr;
      ph += (TAU * (38 + 60 * Math.exp(-t / 0.08))) / ctx.sr;
      const boom = Math.sin(ph) * Math.exp(-t / 0.5);
      const air = lp(rng.uniform(-1, 1)) * Math.exp(-t / 0.35) * 0.5;
      add(bus, s0 + n, (boom + air) * (ev.vel ?? 1));
    }
  }
}

// --- tonal ------------------------------------------------------------------------------------

function adsr(n, gateLen, a, d, s, r) {
  if (n < gateLen) {
    if (n < a) return n / a;
    return s + (1 - s) * Math.exp(-(n - a) / d);
  }
  const atGate = gateLen < a ? gateLen / a : s + (1 - s) * Math.exp(-(gateLen - a) / d);
  return atGate * Math.exp(-(n - gateLen) / r);
}

// Funky mono bass: two saws + sub, plucked lowpass.
export function bass(ctx, events, bus) {
  const sr = ctx.sr;
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const gate = lengthOf(ctx, ev.beats);
    const len = gate + Math.round(0.08 * sr);
    const f = mtof(ev.midi);
    const lp = createSvf('lp', 400, 1.4, sr);
    let p1 = 0;
    let p2 = 0.3;
    let ps = 0;
    const dt1 = f / sr;
    const dt2 = (f * 1.006) / sr;
    // cutoff changes per sample: rebuild filter coefficients cheaply every 32 samples
    let filt = lp;
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      if (n % 32 === 0) {
        const cut = 180 + 2200 * Math.exp(-t / 0.07) * (ev.vel ?? 1);
        filt = retune(filt, 'lp', cut, 1.4, sr);
      }
      p1 = (p1 + dt1) % 1;
      p2 = (p2 + dt2) % 1;
      ps = (ps + dt1) % 1;
      const raw = 0.5 * saw(p1, dt1) + 0.5 * saw(p2, dt2);
      const env = adsr(n, gate, 0.002 * sr, 0.12 * sr, 0.75, 0.03 * sr);
      const y = Math.tanh(1.3 * (filt(raw) * 0.9 + Math.sin(ps * TAU) * 0.6)) * env * (ev.vel ?? 1);
      add(bus, s0 + n, y);
    }
  }
}

// SVF whose coefficients can move while keeping its state.
function retune(prev, mode, cutoffHz, q, sr) {
  const state = prev.__state ?? { ic1: 0, ic2: 0 };
  const g = Math.tan((Math.PI * Math.min(cutoffHz, sr * 0.45)) / sr);
  const k = 1 / q;
  const a1 = 1 / (1 + g * (g + k));
  const a2 = g * a1;
  const a3 = g * a2;
  const fn = (v0) => {
    const v3 = v0 - state.ic2;
    const v1 = a1 * state.ic1 + a2 * v3;
    const v2 = state.ic2 + a2 * state.ic1 + a3 * v3;
    state.ic1 = 2 * v1 - state.ic1;
    state.ic2 = 2 * v2 - state.ic2;
    return mode === 'lp' ? v2 : mode === 'bp' ? v1 : v0 - k * v1 - v2;
  };
  fn.__state = state;
  return fn;
}

const DETUNE = [-0.11, -0.055, 0, 0.055, 0.11]; // semitones
const SPREAD = [-0.8, -0.4, 0, 0.4, 0.8];

// Supersaw chords. kind 'stab' (short, bright, offbeat pumps) or 'pad' (slow, darker, sustained).
export function supersaw(ctx, events, bus, { kind = 'stab', seed = 41 } = {}) {
  const sr = ctx.sr;
  const rng = createRng(seed);
  const stab = kind === 'stab';
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const gate = lengthOf(ctx, ev.beats);
    const rel = (stab ? 0.09 : 0.45) * sr;
    const len = gate + Math.round(rel * 5);
    const osc = DETUNE.map((d, i) => ({ p: rng.next(), dt: mtof(ev.midi + d) / sr, pan: SPREAD[i] }));
    let fl = createSvf('lp', 1000, 0.8, sr);
    let fr = createSvf('lp', 1000, 0.8, sr);
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      if (n % 32 === 0) {
        const cut = stab ? 1600 + 3600 * Math.exp(-t / 0.08) : 2200;
        fl = retune(fl, 'lp', cut, 0.8, sr);
        fr = retune(fr, 'lp', cut, 0.8, sr);
      }
      let l = 0;
      let r = 0;
      for (const o of osc) {
        o.p = (o.p + o.dt) % 1;
        const v = saw(o.p, o.dt);
        const a = ((o.pan + 1) * Math.PI) / 4;
        l += v * Math.cos(a);
        r += v * Math.sin(a);
      }
      const env = stab ? adsr(n, gate, 0.003 * sr, 0.12 * sr, 0.35, rel) : adsr(n, gate, 0.18 * sr, 0.6 * sr, 0.8, rel);
      const g = (env * (ev.vel ?? 1)) / 3;
      const i = s0 + n;
      if (i >= bus.left.length) break;
      bus.left[i] += fl(l) * g;
      bus.right[i] += fr(r) * g;
    }
  }
}

// Pluck lead for the instrumental riff: square + saw through a fast-closing lowpass.
export function pluck(ctx, events, bus) {
  const sr = ctx.sr;
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const gate = lengthOf(ctx, ev.beats);
    const len = gate + Math.round(0.25 * sr);
    const f = mtof(ev.midi);
    const dt = f / sr;
    let p = 0;
    let p2 = 0.5;
    let filt = createSvf('lp', 3000, 1.2, sr);
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      if (n % 32 === 0) filt = retune(filt, 'lp', 700 + 5200 * Math.exp(-t / 0.09), 1.6, sr);
      p = (p + dt) % 1;
      p2 = (p2 + dt * 2.003) % 1;
      const raw = 0.6 * square(p, dt) + 0.4 * saw(p2, dt * 2.003);
      const env = adsr(n, gate, 0.001 * sr, 0.16 * sr, 0.2, 0.06 * sr);
      add(bus, s0 + n, filt(raw) * env * 0.8 * (ev.vel ?? 1), ev.pan ?? 0);
    }
  }
}

// --- kawaii layer --------------------------------------------------------------------------------

// Music-box / glockenspiel bell: two-operator FM with a decaying index, softened above 6 kHz.
export function bell(ctx, events, bus) {
  const sr = ctx.sr;
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const len = Math.round(0.9 * sr);
    const f = mtof(ev.midi);
    const lp = createSvf('lp', 6000, 0.7, sr);
    let pc = 0;
    let pm = 0;
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      const index = 2.2 * Math.exp(-t / 0.06);
      pm += (TAU * f * 3.5) / sr;
      pc += (TAU * f) / sr;
      const y = Math.sin(pc + index * Math.sin(pm)) * Math.exp(-t / 0.28) * Math.min(1, t / 0.001);
      add(bus, s0 + n, lp(y) * (ev.vel ?? 1), ev.pan ?? 0);
    }
  }
}

// Chiptune lead: 25% pulse with delayed vibrato and a short slide into each note.
export function chip(ctx, events, bus) {
  const sr = ctx.sr;
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const gate = lengthOf(ctx, ev.beats);
    const len = gate + Math.round(0.05 * sr);
    const f = mtof(ev.midi);
    const lp = createSvf('lp', 5200, 0.7, sr);
    let p = 0;
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      const slide = 2 ** ((-0.6 * Math.exp(-t / 0.018)) / 12);
      const vib = t > 0.09 ? 2 ** ((0.25 * Math.sin(TAU * 6 * t)) / 12) : 1;
      const dt = (f * slide * vib) / sr;
      p = (p + dt) % 1;
      const pulse = (p < 0.25 ? 1 : -1) + blep(p, dt) - blep((p + 0.75) % 1, dt);
      const env = n < gate ? Math.min(1, n / (0.002 * sr)) : Math.exp(-(n - gate) / (0.012 * sr));
      add(bus, s0 + n, lp(pulse) * 0.5 * env * (ev.vel ?? 1), ev.pan ?? 0);
    }
  }
}

// Toy noises: 'squeak' (rubber toy), 'pop' (bubble), 'sparkle' (two coin blips).
export function toy(ctx, events, bus) {
  const sr = ctx.sr;
  for (const ev of events) {
    const s0 = place(ctx, ev);
    let ph = 0;
    if (ev.kind === 'squeak') {
      const len = Math.round(0.16 * sr);
      for (let n = 0; n < len; n++) {
        const t = n / sr;
        const f = 900 + 1300 * Math.min(1, t / 0.06) + 120 * Math.sin(TAU * 38 * t);
        ph += (TAU * f) / sr;
        const env = Math.min(1, t / 0.004) * Math.exp(-t / 0.07);
        add(bus, s0 + n, (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * env * (ev.vel ?? 1), ev.pan ?? 0.3);
      }
    } else if (ev.kind === 'pop') {
      const len = Math.round(0.07 * sr);
      for (let n = 0; n < len; n++) {
        const t = n / sr;
        ph += (TAU * (350 + 1100 * (t / 0.07))) / sr;
        add(bus, s0 + n, Math.sin(ph) * Math.exp(-t / 0.018) * (ev.vel ?? 1), ev.pan ?? -0.3);
      }
    } else {
      for (const [o, f] of [[0, 1568], [0.07, 2093]]) {
        const start = s0 + Math.round(o * sr);
        const len = Math.round(0.12 * sr);
        let p = 0;
        for (let n = 0; n < len; n++) {
          const t = n / sr;
          p = (p + f / sr) % 1;
          add(bus, start + n, (p < 0.5 ? 1 : -1) * 0.35 * Math.exp(-t / 0.05) * (ev.vel ?? 1), ev.pan ?? 0.4);
        }
      }
    }
  }
}

// Snappy snare: tuned body + bright noise, for the half-time drop.
export function snare(ctx, events, bus, seed = 53) {
  const rng = createRng(seed);
  const len = Math.round(0.28 * ctx.sr);
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const bp = createSvf('bp', 2600, 0.7, ctx.sr);
    let ph = 0;
    for (let n = 0; n < len; n++) {
      const t = n / ctx.sr;
      ph += (TAU * (210 + 60 * Math.exp(-t / 0.01))) / ctx.sr;
      const body = Math.sin(ph) * Math.exp(-t / 0.045);
      const noise = bp(rng.uniform(-1, 1)) * 2 * Math.exp(-t / 0.07);
      add(bus, s0 + n, Math.tanh(1.4 * (0.7 * body + noise)) * (ev.vel ?? 1));
    }
  }
}

// Future-bass chord chops: supersaw voices that start `bend` semitones flat and slide up, with a
// quick swell attack — the "wobbly, rising" chord hits of the genre.
export function futureChords(ctx, events, bus, seed = 47) {
  const sr = ctx.sr;
  const rng = createRng(seed);
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const gate = lengthOf(ctx, ev.beats);
    const len = gate + Math.round(0.12 * sr);
    const bendLen = lengthOf(ctx, ev.bendBeats ?? 0.25);
    const osc = DETUNE.map((d, i) => ({ p: rng.next(), d, pan: SPREAD[i] }));
    const fl = createSvf('lp', 3800, 0.9, sr);
    const fr = createSvf('lp', 3800, 0.9, sr);
    for (let n = 0; n < len; n++) {
      const bend = ev.bend ? ev.bend * Math.max(0, 1 - n / bendLen) ** 2 : 0;
      let l = 0;
      let r = 0;
      for (const o of osc) {
        const dt = mtof(ev.midi + o.d - bend) / sr;
        o.p = (o.p + dt) % 1;
        const v = saw(o.p, dt);
        const a = ((o.pan + 1) * Math.PI) / 4;
        l += v * Math.cos(a);
        r += v * Math.sin(a);
      }
      const env = n < gate ? Math.min(1, n / (0.012 * sr)) : Math.exp(-(n - gate) / (0.03 * sr));
      const g = (env * (ev.vel ?? 1)) / 3;
      const i = s0 + n;
      if (i >= bus.left.length) break;
      bus.left[i] += fl(l) * g;
      bus.right[i] += fr(r) * g;
    }
  }
}

// --- yuru-kawaii pop layer ----------------------------------------------------------------------

// Marimba: modal partials of a struck bar (1, 3.99, 10.7) with a soft mallet; short and woody.
export function marimba(ctx, events, bus) {
  const sr = ctx.sr;
  const partials = [[1, 1, 0.5], [3.99, 0.35, 0.12], [10.7, 0.12, 0.04]]; // ratio, amp, decay s
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const len = Math.round(0.6 * sr);
    const f = mtof(ev.midi);
    const phases = partials.map(() => 0);
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      let y = 0;
      partials.forEach(([r, a, d], k) => {
        if (f * r > sr * 0.45) return;
        phases[k] += (TAU * f * r) / sr;
        y += Math.sin(phases[k]) * a * Math.exp(-t / d);
      });
      add(bus, s0 + n, y * Math.min(1, t / 0.0015) * (ev.vel ?? 1), ev.pan ?? 0);
    }
  }
}

// Round bouncy bass: sine + a little triangle, short pluck — a "boing" rather than a growl.
export function roundBass(ctx, events, bus) {
  const sr = ctx.sr;
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const gate = lengthOf(ctx, ev.beats);
    const len = gate + Math.round(0.04 * sr);
    const f = mtof(ev.midi);
    let p = 0;
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      const bend = 2 ** ((0.7 * Math.exp(-t / 0.015)) / 12); // tiny downward "boing" into the note
      p = (p + (f * bend) / sr) % 1;
      const tri = 1 - 4 * Math.abs(p - 0.5);
      const y = Math.sin(TAU * p) * 0.85 + tri * 0.25;
      const env = (n < gate ? Math.exp(-t / 0.35) : Math.exp(-gate / sr / 0.35) * Math.exp(-(n - gate) / (0.01 * sr))) * Math.min(1, t / 0.002);
      add(bus, s0 + n, Math.tanh(1.2 * y) * env * (ev.vel ?? 1));
    }
  }
}

// Shaker: band-passed noise with a soft swell, alternating sides.
export function shaker(ctx, events, bus, seed = 61) {
  const rng = createRng(seed);
  const sr = ctx.sr;
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const len = Math.round(0.07 * sr);
    const bp = createSvf('bp', 6500, 0.9, sr);
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      const env = Math.min(1, t / 0.012) * Math.exp(-t / 0.025);
      add(bus, s0 + n, bp(rng.uniform(-1, 1)) * env * (ev.vel ?? 1), ev.pan ?? 0);
    }
  }
}

// Light kick: higher, shorter, rounder than the dance kick.
export function lightKick(ctx, events, bus) {
  const len = Math.round(0.22 * ctx.sr);
  for (const ev of events) {
    const s0 = place(ctx, ev);
    let ph = 0;
    for (let n = 0; n < len; n++) {
      const t = n / ctx.sr;
      ph += (TAU * (62 + 90 * Math.exp(-t / 0.02))) / ctx.sr;
      add(bus, s0 + n, Math.sin(ph) * Math.min(1, t / 0.001) * Math.exp(-t / 0.09) * (ev.vel ?? 1));
    }
  }
}

// Slide whistle: a breathy sine gliding up (or down) over the event length — the cartoon transition.
export function slideWhistle(ctx, events, bus, seed = 67) {
  const rng = createRng(seed);
  const sr = ctx.sr;
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const len = lengthOf(ctx, ev.beats);
    const [from, to] = ev.down ? [1400, 500] : [500, 1500];
    const lp = createSvf('lp', 3000, 0.7, sr);
    let ph = 0;
    for (let n = 0; n < len; n++) {
      const u = n / len;
      const f = from * (to / from) ** (u * u) * (1 + 0.01 * Math.sin(TAU * 7 * (n / sr)));
      ph += (TAU * f) / sr;
      const env = Math.min(1, n / (0.02 * sr)) * Math.min(1, (len - n) / (0.03 * sr));
      add(bus, s0 + n, (Math.sin(ph) + lp(rng.uniform(-1, 1)) * 0.15) * env * (ev.vel ?? 1), 0.2);
    }
  }
}

// Vibraphone: metal bar partials (1 and 4) with a long, soft ring; the tremolo is added at the mix.
export function vibes(ctx, events, bus) {
  const sr = ctx.sr;
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const len = Math.round(2.2 * sr);
    const f = mtof(ev.midi);
    let p1 = 0;
    let p2 = 0;
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      p1 += (TAU * f) / sr;
      p2 += (TAU * f * 4) / sr;
      const y = Math.sin(p1) * Math.exp(-t / 1.1) + 0.18 * Math.sin(p2) * Math.exp(-t / 0.18);
      add(bus, s0 + n, y * Math.min(1, t / 0.004) * (ev.vel ?? 1), ev.pan ?? 0);
    }
  }
}

// --- explore-duo: more small, soft "toy" colours ----------------------------------------------------

// Modal struck/plucked bar: [ratio, amp, decaySec] partials, a soft attack and an optional seeded
// detune per note (toys are never quite in tune). Shared by toy piano, kalimba and celesta.
function modal(ctx, events, bus, { partials, attackSec, lenSec, detuneCents = 0, thunk = 0, seed = 71 }) {
  const sr = ctx.sr;
  const rng = createRng(seed);
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const len = Math.round(lenSec * sr);
    const f = mtof(ev.midi) * 2 ** ((detuneCents * rng.uniform(-1, 1)) / 1200);
    const phases = partials.map(() => rng.next() * 0.1);
    const lp = createSvf('lp', 900, 0.7, sr);
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      let y = 0;
      partials.forEach(([r, a, d], k) => {
        if (f * r > sr * 0.45) return;
        phases[k] += (TAU * f * r) / sr;
        y += Math.sin(phases[k]) * a * Math.exp(-t / d);
      });
      y *= Math.min(1, t / attackSec);
      if (thunk && t < 0.03) y += lp(rng.uniform(-1, 1)) * thunk * Math.exp(-t / 0.008); // the hammer's knock
      add(bus, s0 + n, y * (ev.vel ?? 1), ev.pan ?? 0);
    }
  }
}

// Toy piano: hammered metal rods (clamped-free bar partials 1 : 6.27 : 17.55), a wooden knock, slightly
// out of tune note to note.
export function toyPiano(ctx, events, bus) {
  modal(ctx, events, bus, { partials: [[1, 1, 0.9], [2, 0.12, 0.25], [6.27, 0.32, 0.09], [17.55, 0.07, 0.025]], attackSec: 0.0008, lenSec: 1.6, detuneCents: 9, thunk: 0.35, seed: 73 });
}

// Kalimba: a thumb-plucked tine — round fundamental with a long ring and a quick high "tink" (~5.9x).
export function kalimba(ctx, events, bus) {
  modal(ctx, events, bus, { partials: [[1, 1, 1.1], [3, 0.05, 0.2], [5.93, 0.28, 0.07]], attackSec: 0.003, lenSec: 2.2, detuneCents: 4, seed: 79 });
}

// Celesta: felt hammer on a steel plate over a wooden resonator — almost a sine, a little 2nd and 4th.
export function celesta(ctx, events, bus) {
  modal(ctx, events, bus, { partials: [[1, 1, 0.8], [2, 0.18, 0.35], [4, 0.05, 0.12]], attackSec: 0.004, lenSec: 1.8, seed: 83 });
}

// Karplus–Strong string: a noise burst circulating in a tuned delay loop with an averaging lowpass.
// Tuned exactly with a first-order allpass for the fractional part of the period.
function ksString(ctx, events, bus, { decay, bright, lenSec, seed }) {
  const sr = ctx.sr;
  const rng = createRng(seed);
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const period = sr / mtof(ev.midi);
    let N = Math.floor(period - 0.5 - 0.1);
    const d = period - N - 0.5; // 0.1 .. 1.1
    const c = (1 - d) / (1 + d);
    const buf = new Float32Array(N);
    const exc = createSvf('lp', 600 + 7000 * bright, 0.7, sr);
    for (let i = 0; i < N; i++) buf[i] = exc(rng.uniform(-1, 1));
    let mean = 0;
    for (const v of buf) mean += v / N;
    for (let i = 0; i < N; i++) buf[i] -= mean;
    const len = Math.round(lenSec * sr);
    const fb = decay ** (1 / mtof(ev.midi)); // per-period loss -> about `decay` of level after one second
    let prev = 0;
    let apIn = 0;
    let apOut = 0;
    let p = 0;
    for (let n = 0; n < len; n++) {
      const x = buf[p];
      const avg = 0.5 * (x + prev);
      prev = x;
      const y = c * avg + apIn - c * apOut; // allpass
      apIn = avg;
      apOut = y;
      buf[p] = y * fb;
      p = (p + 1) % N;
      const fade = Math.min(1, (len - n) / (0.02 * sr));
      add(bus, s0 + n, x * fade * (ev.vel ?? 1), ev.pan ?? 0);
    }
  }
}

// Harp: long, warm nylon/gut string.
export function harp(ctx, events, bus) {
  ksString(ctx, events, bus, { decay: 0.25, bright: 0.35, lenSec: 3, seed: 89 });
}

// Ukulele-ish pluck: brighter and shorter, the small-body "pon".
export function uke(ctx, events, bus) {
  ksString(ctx, events, bus, { decay: 0.04, bright: 0.6, lenSec: 1.2, seed: 97 });
}

// Rain on the eaves: a soft band-passed hiss plus random drops (short gliding sine "plips", some low
// "pots" on the roof), seeded so the same score always rains the same way. Event: { beat, beats, vel }.
export function rain(ctx, events, bus, seed = 101) {
  const sr = ctx.sr;
  const rng = createRng(seed);
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const len = lengthOf(ctx, ev.beats);
    const hp = createSvf('hp', 500, 0.7, sr);
    const lp = createSvf('lp', 3800, 0.6, sr);
    const hp2 = createSvf('hp', 500, 0.7, sr);
    const lp2 = createSvf('lp', 3800, 0.6, sr);
    const fadeIn = 1.5 * sr;
    const fadeOut = 1.5 * sr;
    for (let n = 0; n < len; n++) {
      const env = Math.min(1, n / fadeIn, (len - n) / fadeOut) * 0.22;
      const i = s0 + n;
      if (i >= bus.left.length) break;
      bus.left[i] += lp(hp(rng.uniform(-1, 1))) * env * (ev.vel ?? 1);
      bus.right[i] += lp2(hp2(rng.uniform(-1, 1))) * env * (ev.vel ?? 1);
    }
    // drops: Poisson, about 9 per second
    let t = 0;
    while (true) {
      t += -Math.log(1 - rng.next()) / 9;
      const at = Math.round(t * sr);
      if (at >= len - 0.1 * sr) break;
      const low = rng.next() < 0.25;
      const f0 = low ? rng.uniform(500, 900) : rng.uniform(1500, 3800);
      const glide = low ? 0.8 : rng.uniform(1.15, 1.5);
      const dur = low ? 0.05 : rng.uniform(0.012, 0.03);
      const amp = (low ? 0.35 : rng.uniform(0.08, 0.3)) * Math.min(1, at / fadeIn, (len - at) / fadeOut);
      const pan = rng.uniform(-0.8, 0.8);
      const dl = Math.round(dur * sr * 3);
      let ph = 0;
      for (let n = 0; n < dl; n++) {
        const u = n / sr;
        ph += (TAU * f0 * glide ** (u / dur)) / sr;
        add(bus, s0 + at + n, Math.sin(ph) * Math.min(1, u / 0.001) * Math.exp(-u / (dur * 0.5)) * amp * (ev.vel ?? 1), pan);
      }
    }
  }
}

// --- bath sounds (「ゆげ ゆげ ゆげ。」): things in a tiled bathroom that slowly become the band ----------

// Drip ("ぴちょん"): a drop hitting water — a sine that rises into its (tuned) pitch over ~20 ms and dies
// fast, with a small second blip; the room reverb makes the rest.
export function drip(ctx, events, bus) {
  const sr = ctx.sr;
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const f = mtof(ev.midi ?? 88);
    for (const [o, ratio, amp] of [[0, 1, 1], [0.045, 1.5, 0.25]]) {
      const start = s0 + Math.round(o * sr);
      const len = Math.round(0.12 * sr);
      let ph = 0;
      for (let n = 0; n < len; n++) {
        const t = n / sr;
        const glide = 0.62 + 0.38 * Math.min(1, t / 0.02) ** 0.6;
        ph += (TAU * f * ratio * glide) / sr;
        add(bus, start + n, Math.sin(ph) * Math.min(1, t / 0.0008) * Math.exp(-t / 0.035) * amp * (ev.vel ?? 1), ev.pan ?? 0);
      }
    }
  }
}

// Bath bucket on tile ("カコン"): a plastic knock — click plus two short body modes. midi tunes the body
// (default 72 ~ 523 Hz); the long "コーン" comes from the room reverb.
export function bucket(ctx, events, bus, seed = 103) {
  const sr = ctx.sr;
  const rng = createRng(seed);
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const f = mtof(ev.midi ?? 72);
    const len = Math.round(0.35 * sr);
    const bp = createSvf('bp', 2400, 1.2, sr);
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      p1 += (TAU * f) / sr;
      p2 += (TAU * f * 2.63) / sr;
      p3 += (TAU * f * 4.1) / sr;
      const body = Math.sin(p1) * Math.exp(-t / 0.09) + 0.45 * Math.sin(p2) * Math.exp(-t / 0.05) + 0.2 * Math.sin(p3) * Math.exp(-t / 0.025);
      const click = t < 0.012 ? bp(rng.uniform(-1, 1)) * 1.6 * Math.exp(-t / 0.003) : 0;
      add(bus, s0 + n, (body * Math.min(1, t / 0.0005) + click) * (ev.vel ?? 1), ev.pan ?? 0.15);
    }
  }
}

// Control-panel beep ("ピッ"): a clean sine with a hint of square, 90 ms (beats sets a longer "ピー").
export function beep(ctx, events, bus) {
  const sr = ctx.sr;
  for (const ev of events) {
    const s0 = place(ctx, ev);
    const f = mtof(ev.midi ?? 95);
    const gate = Math.round((ev.beats ? (ev.beats * 60) / ctx.bpm : 0.09) * sr);
    const len = gate + Math.round(0.01 * sr);
    let p = 0;
    for (let n = 0; n < len; n++) {
      p = (p + f / sr) % 1;
      const env = Math.min(1, n / (0.002 * sr), n < gate ? 1 : 1 - (n - gate) / (0.01 * sr));
      add(bus, s0 + n, (Math.sin(TAU * p) * 0.85 + (p < 0.5 ? 0.15 : -0.15)) * env * (ev.vel ?? 1), ev.pan ?? -0.1);
    }
  }
}
