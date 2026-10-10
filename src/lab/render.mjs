// Genome -> stereo Float32 audio. Pure and deterministic: same genome + options => identical samples.

import { createRng } from './rng.mjs';
import { createSvf, dcBlock, peak, rms, scale, fadeEdges } from './dsp.mjs';
import { energyAt } from './form.mjs';

const TWO_PI = Math.PI * 2;
const MAX_NOTE_SEC = 4;
const TARGET_PEAK = 0.89; // about -1 dBFS
// Loudness ceiling so clips are compared by ear on content, not volume (louder always sounds "better").
const TARGET_RMS = 10 ** (-16 / 20);
const BYTEBEAT_REF_HZ = 110;
// v2: quiet passages keep at least 30% loudness, and a soft limiter lets the clip reach TARGET_RMS
// without one transient dictating the level (up to +12 dB over plain peak normalization).
const DYNAMICS_DEPTH = 0.7;
const LIMIT_KNEE = 0.6;
const MAX_LIMIT_BOOST = 4;

export function euclid(steps, pulses, rotate) {
  const pattern = [];
  for (let i = 0; i < steps; i++) {
    const j = (i + rotate) % steps;
    pattern.push((j * pulses) % steps < pulses); // Bresenham form: first pulse on step 0
  }
  return pattern;
}

export function degreeToHz(tuning, degree, octave, sampleRate) {
  const base = tuning.type === 'edo' ? tuning.baseHz * 2 ** (degree / tuning.divisions) : tuning.baseHz * (degree + 1);
  return Math.min(sampleRate * 0.45, Math.max(20, base * 2 ** octave));
}

function breakWindow(genome, durationSec) {
  const start = genome.break.at * durationSec;
  return { start, end: start + genome.break.length * durationSec, kind: genome.break.kind };
}

// v2: a voice fades in as energy crosses its `entry` threshold (entry 0 = always present).
export function entryActivity(e, entry) {
  if (entry <= 0) return 1;
  return Math.min(1, Math.max(0, (e - entry) / 0.1 + 0.5));
}

// v2: how many of the voice's degrees the melody may use at energy e.
export function degreesInUse(count, pitchCoupling, e) {
  const open = pitchCoupling >= 0 ? 1 + (e - 1) * pitchCoupling : 1 + (1 - e - 1) * -pitchCoupling;
  return Math.max(1, Math.ceil(count * open));
}

// v2: fold fundamentals down by octaves so they sit under a third of the brightness ceiling.
export function foldUnder(freq, limitHz) {
  let f = freq;
  while (f > limitHz && f / 2 >= 20) f /= 2;
  return f;
}

// The rule layer: euclidean pattern on a per-voice clock, pitch walks `degrees` with `stride`.
// The break bends exactly one of those rules for a window of time on the target voice.
// With a v2 `form`, the energy curve additionally thins/fills steps, opens or closes the melody,
// bends the tempo and sets each note's loudness and brightness. Without one, this is exactly v1.
export function scheduleVoice(voice, { tuning, durationSec, sampleRate, brk, targeted, form = null, rng = null }) {
  const pattern = euclid(voice.steps, voice.pulses, voice.rotate);
  const events = [];
  let t = 0;
  let step = 0;
  let noteCount = 0;
  while (t < durationSec) {
    const inBreak = targeted && t >= brk.start && t < brk.end;
    const kind = inBreak ? brk.kind : null;
    let idx = step % voice.steps;
    if (kind === 'reverse') idx = voice.steps - 1 - idx;
    let on = kind === 'freeze' || pattern[idx];
    const e = form ? energyAt(form, t / durationSec) : 1;
    const activity = form ? entryActivity(e, voice.entry) : 1;
    if (form) {
      const h = rng.next(); // drawn every step so the stream stays aligned across energy changes
      if (kind !== 'freeze') {
        on = pattern[idx] ? h < Math.min(1, 0.2 + e) : h < form.fill * Math.max(0, (e - 0.6) / 0.4);
        if (pattern[idx] && noteCount === 0) on = true; // the first hit always sounds: no all-silent voices
      }
      if (activity <= 0) on = false;
    }
    if (on) {
      const used = form ? degreesInUse(voice.degrees.length, form.pitchCoupling, e) : voice.degrees.length;
      const degree = voice.degrees[(noteCount * voice.stride) % used];
      const freq = degreeToHz(tuning, degree, voice.octave, sampleRate);
      if (form) {
        events.push({
          time: t,
          freq: foldUnder(freq, form.ceilingHz / 3),
          amp: (1 - DYNAMICS_DEPTH * form.dynamics * (1 - e)) * activity,
          bright: 1 - form.brightCoupling * (1 - e),
          ceiling: form.ceilingHz,
        });
      } else {
        events.push({ time: t, freq });
      }
      if (kind !== 'freeze') noteCount++;
    }
    const bend = form ? 2 ** (-form.tempoBend * (e - 0.5)) : 1;
    // Round to the nanosecond so repeated float addition cannot drift steps across window edges.
    t = Math.round((t + (voice.stepMs / 1000) * (kind === 'double' ? 0.5 : 1) * bend) * 1e9) / 1e9;
    step++;
  }
  return events;
}

function envelopeAt(n, attack, decay) {
  return n < attack ? n / attack : Math.exp(-(n - attack) / decay);
}

// Note fields beyond `freq` exist only for v2 events: amp (loudness), bright (0..1), ceiling (Hz).
// v1 events lack them and every renderer then takes exactly the v1 arithmetic path.

function renderFm(voice, out, start, len, note, sr, attack, decay) {
  const { freq, amp = 1 } = note;
  // Carson's rule: keep the highest significant sideband (f + (index+1)·f·ratio) under the ceiling.
  const baseIndex = note.ceiling
    ? Math.min(voice.index * note.bright, Math.max(0, note.ceiling / (freq * voice.ratio) - 1 - 1 / voice.ratio))
    : voice.index;
  const incC = (TWO_PI * freq) / sr;
  const incM = (TWO_PI * freq * voice.ratio) / sr;
  let pc = 0;
  let pm = 0;
  let prevM = 0;
  for (let n = 0; n < len; n++) {
    const env = envelopeAt(n, attack, decay);
    const index = baseIndex * (1 - voice.indexDecay + voice.indexDecay * env);
    const m = Math.sin(pm + voice.modFeedback * prevM);
    prevM = m;
    out[start + n] += Math.sin(pc + index * m) * env * amp;
    pc += incC;
    pm += incM;
    if (pc > TWO_PI) pc -= TWO_PI;
    if (pm > TWO_PI) pm -= TWO_PI;
  }
}

// Plucked delay loop with a damped lowpass and tanh inside the loop.
function renderFeedback(voice, out, start, len, note, sr, attack, decay, rng) {
  const { freq, amp = 1 } = note;
  const size = Math.max(2, Math.round(sr / freq));
  const loop = new Float32Array(size);
  const excite = Math.max(1, Math.round((voice.exciteMs / 1000) * sr));
  const { loopGain, damp } = voice;
  const drive = note.ceiling ? 1 + (voice.drive - 1) * note.bright : voice.drive;
  let z = 0;
  let p = 0;
  for (let n = 0; n < len; n++) {
    z = (1 - damp) * loop[p] + damp * z;
    const x = loopGain * z + (n < excite ? rng.uniform(-1, 1) : 0);
    const y = Math.tanh(drive * x);
    loop[p] = y / drive;
    p = (p + 1) % size;
    out[start + n] += y * envelopeAt(n, attack, decay) * amp;
  }
}

const BYTEBEAT = [
  (t, a, b) => (t * a) & (t >> b),
  (t, a, b, c) => ((t * a) & (t >> b)) | (t >> c),
  (t, a, b, c) => t * (((t >> c) | (t >> b)) & a),
  (t, a, b, c) => ((t >> b) | (t * a)) ^ (t >> c),
  (t, a, b, c) => (t * a) ^ (t >> b) ^ (t >> c),
  (t, a, b, c) => (t * (a + ((t >> c) & 7))) & (t >> b),
];

// Integer-counter formulas, sample-and-held at `rate`, sped up or slowed down by the note's pitch.
function renderBytebeat(voice, out, start, len, note, sr, attack, decay) {
  const { freq, amp = 1 } = note;
  const fn = BYTEBEAT[voice.formula];
  const inc = (voice.rate * (freq / BYTEBEAT_REF_HZ)) / sr;
  let tt = Math.round((start / sr) * voice.rate);
  for (let n = 0; n < len; n++) {
    const v = fn(Math.floor(tt) | 0, voice.a, voice.b, voice.c) & 255;
    out[start + n] += (v / 127.5 - 1) * envelopeAt(n, attack, decay) * amp;
    tt += inc;
  }
}

function renderNoise(voice, out, start, len, note, sr, attack, decay, rng) {
  const { freq, amp = 1 } = note;
  const cutoff = note.ceiling
    ? Math.min(freq * voice.cutoffMul * (0.25 + 0.75 * note.bright), note.ceiling)
    : freq * voice.cutoffMul;
  const filter = createSvf(voice.filter, cutoff, voice.q, sr);
  const makeup = voice.filter === 'bp' ? 1 : 1 / Math.sqrt(voice.q);
  for (let n = 0; n < len; n++) {
    out[start + n] += filter(rng.uniform(-1, 1)) * makeup * envelopeAt(n, attack, decay) * amp;
  }
}

const RENDERERS = { fm: renderFm, feedback: renderFeedback, bytebeat: renderBytebeat, noise: renderNoise };

function renderVoice(voice, events, total, sr, rng) {
  const out = new Float32Array(total);
  const attack = Math.max(1, (voice.attackMs / 1000) * sr);
  const decay = Math.max(1, (voice.decayMs / 1000) * sr);
  const noteLen = Math.min(Math.round(attack + 5 * decay), Math.round(MAX_NOTE_SEC * sr));
  const render = RENDERERS[voice.type];
  for (const ev of events) {
    const start = Math.round(ev.time * sr);
    const len = Math.min(noteLen, total - start);
    if (len > 0) render(voice, out, start, len, ev, sr, attack, decay, rng);
  }
  dcBlock(out);
  return out;
}

// Gain curve for a voice that is muted during a `solo` break (10 ms ramps to avoid clicks).
function soloGate(n, sr, brk) {
  const t = n / sr;
  const ramp = 0.01;
  if (t <= brk.start - ramp || t >= brk.end + ramp) return 1;
  if (t >= brk.start && t <= brk.end) return 0;
  return t < brk.start ? (brk.start - t) / ramp : (t - brk.end) / ramp;
}

function applyMaster(left, right, master, sr) {
  const size = Math.max(1, Math.round((master.delayMs / 1000) * sr));
  const bufL = new Float32Array(size);
  const bufR = new Float32Array(size);
  const norm = Math.tanh(master.drive);
  let p = 0;
  for (let n = 0; n < left.length; n++) {
    const dL = bufL[p];
    const dR = bufR[p];
    // Cross-fed (ping-pong) delay with saturation in the loop.
    bufL[p] = Math.tanh(left[n] + master.delayFeedback * dR);
    bufR[p] = Math.tanh(right[n] + master.delayFeedback * dL);
    p = (p + 1) % size;
    left[n] = Math.tanh(master.drive * (left[n] + master.delayMix * dL)) / norm;
    right[n] = Math.tanh(master.drive * (right[n] + master.delayMix * dR)) / norm;
  }
}

// Linear below the knee, tanh-shaped above it; never exceeds TARGET_PEAK.
function softLimit(buf) {
  const room = TARGET_PEAK - LIMIT_KNEE;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const ax = Math.abs(x);
    if (ax > LIMIT_KNEE) buf[i] = Math.sign(x) * (LIMIT_KNEE + room * Math.tanh((ax - LIMIT_KNEE) / room));
  }
}

export function render(genome, opts = {}) {
  const sampleRate = opts.sampleRate ?? genome.sampleRate;
  const durationSec = opts.durationSec ?? genome.durationSec;
  const total = Math.max(1, Math.round(durationSec * sampleRate));
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  const brk = breakWindow(genome, durationSec);
  const target = genome.break.voice % genome.voices.length;

  const form = genome.version >= 2 ? genome.form : null;

  genome.voices.forEach((voice, vi) => {
    const rng = createRng((genome.seed ^ Math.imul(vi + 1, 0x9e3779b9)) >>> 0);
    const events = scheduleVoice(voice, {
      tuning: genome.tuning,
      durationSec,
      sampleRate,
      brk,
      targeted: vi === target && brk.kind !== 'solo',
      form,
      // Separate stream from the noise rng so step decisions don't shift the timbre (and v1 stays intact).
      rng: form ? createRng((genome.seed ^ Math.imul(vi + 1, 0x85ebca6b) ^ 0x5bd1e995) >>> 0) : null,
    });
    const mono = renderVoice(voice, events, total, sampleRate, rng);
    const angle = ((voice.pan + 1) * Math.PI) / 4;
    const gl = Math.cos(angle) * voice.gain;
    const gr = Math.sin(angle) * voice.gain;
    const gated = brk.kind === 'solo' && vi !== target;
    for (let n = 0; n < total; n++) {
      const s = gated ? mono[n] * soloGate(n, sampleRate, brk) : mono[n];
      left[n] += s * gl;
      right[n] += s * gr;
    }
  });

  applyMaster(left, right, genome.master, sampleRate);
  if (form) {
    // Brightness ceiling after the master drive, which would otherwise regrow the highs: 4-pole lowpass.
    for (const buf of [left, right]) {
      const a = createSvf('lp', form.ceilingHz, Math.SQRT1_2, sampleRate);
      const b = createSvf('lp', form.ceilingHz, Math.SQRT1_2, sampleRate);
      for (let i = 0; i < buf.length; i++) buf[i] = b(a(buf[i]));
    }
  }
  dcBlock(left);
  dcBlock(right);
  const p = peak(left, right);
  if (p > 1e-9 && form) {
    const gain = Math.min(MAX_LIMIT_BOOST * (TARGET_PEAK / p), TARGET_RMS / rms(left, right));
    scale(left, gain);
    scale(right, gain);
    softLimit(left);
    softLimit(right);
  } else if (p > 1e-9) {
    const gain = Math.min(TARGET_PEAK / p, TARGET_RMS / rms(left, right));
    scale(left, gain);
    scale(right, gain);
  }
  const fade = Math.round(0.02 * sampleRate);
  fadeEdges(left, fade);
  fadeEdges(right, fade);
  return { left, right, sampleRate };
}
