// Score (sections of chords, patterns and vocal bars) -> stems -> mixed song.

import { createBus, kick, clap, hat, riser, impact, bass, supersaw, pluck, bell, chip, toy, snare, futureChords } from './synth.mjs';
import { reverb, pingPong, sidechainCurve, applyGain, eq, compress, levelTo, mixInto, master } from './fx.mjs';
import { toScore, singQuery, frameSynthesis, hardTune, softTune, midiHz, vowelOf } from './voicevox.mjs';
import { pitchToMidi } from './notes.mjs';
import { createSvf } from '../lab/dsp.mjs';
import { loadWav } from './mix.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Chord symbol -> pitch classes (root first) and bass root MIDI note.
const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
// Extensions (semitones above the root) by suffix; the triad always comes first.
const EXT = { '': [], maj7: [11], 7: [10], m7: [10], m9: [10, 14], add9: [14], 6: [9], m6: [9] };
export function chord(symbol) {
  const m = /^([A-G]#?)(m(?!aj))?(maj7|m9|m7|add9|7|6)?$/.exec(symbol);
  if (!m) throw new Error(`unknown chord ${symbol}`);
  const root = PC[m[1]];
  const minor = !!m[2] || (m[3] ?? '').startsWith('m') && m[3] !== 'maj7';
  const pcs = [root, (root + (minor ? 3 : 4)) % 12, (root + 7) % 12, ...EXT[m[3] ?? ''].map((e) => (root + e) % 12)];
  const bassRoot = 28 + ((root - 4 + 12) % 12); // E1..D#2
  return { pcs, bassRoot };
}
const above = (pc, floor) => floor + ((pc - floor) % 12 + 12) % 12;
// Close triad above G#3, extensions stacked above the triad so 7ths/9ths ring open instead of clustering.
export function voicing(symbol, floor = 56) {
  const { pcs } = chord(symbol);
  const triad = pcs.slice(0, 3).map((pc) => above(pc, floor)).sort((a, b) => a - b);
  const top = triad[triad.length - 1];
  return [...triad, ...pcs.slice(3).map((pc) => above(pc, top + 1))];
}
function riffTones(symbol) {
  const { pcs } = chord(symbol);
  const r = above(pcs[0], 56);
  const t = r + ((pcs[1] - pcs[0] + 12) % 12);
  const f = r + ((pcs[2] - pcs[0] + 12) % 12);
  return [null, r, t, f, r + 12, t + 12];
}

// Toy accents per bar: [step, kind, vel]. Placed in gaps so they read as playful asides, not a beat.
const TOYS = {
  verse: (b) => (b % 2 === 1 ? [[14, 'pop', 0.6]] : []),
  chorus: (b) => (b % 4 === 3 ? [[14, 'squeak', 0.8]] : b % 4 === 1 ? [[15, 'pop', 0.7]] : []),
  drop: (b, bars) => (b === 0 ? [[0, 'sparkle', 1]] : b % 2 === 1 ? [[14, 'squeak', 0.9], [7, 'pop', 0.6]] : [[7, 'pop', 0.6]]),
  outro: (b, bars) => (b === bars - 1 ? [[8, 'sparkle', 1]] : []),
};
const RIFF = { 0: [3, 2], 2: [4, 1], 3: [3, 1], 5: [1, 1], 7: [2, 1], 8: [3, 2], 10: [4, 1], 12: [5, 1], 13: [4, 1], 15: [2, 1] };
const BASS = {
  drop: 'R-------O---R-O-',
  chorus: 'R-OR-.O.R-OR.OO.',
  verse: 'R--.R-.OR--.R.O.',
  pre: 'R.R.R.R.R.R.R.R.',
  long: 'R---------------',
};

// Drum hits for one bar: returns {kick:[step], clap:[[step,vel]], hat:[[step,vel,open]]}.
function drumBar(style, barIndex, bars) {
  const last = barIndex === bars - 1;
  const four = [0, 4, 8, 12];
  const out = { kick: [], clap: [], hat: [], snare: [] };
  const eighthHats = (down, off) => [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, s % 4 === 2 ? off : down, false]);
  const roll = () => Array.from({ length: 16 }, (_, s) => [s, 0.25 + 0.75 * (s / 15)]);
  switch (style) {
    case 'none':
      break;
    case 'drop': // half-time: kick on 1 and the "and" of 3, snare on 3, roll into the next bar at the end
      out.kick = [0, 10];
      out.snare = last ? [[8, 1], [12, 0.6], [13, 0.7], [14, 0.85], [15, 1]] : [[8, 1]];
      out.hat = eighthHats(0.25, 0.5);
      break;
    case 'intro':
      out.hat = eighthHats(0.3, 0.6);
      if (barIndex >= 4) out.kick = four;
      if (barIndex >= 4) out.clap = [[4, 0.8], [12, 0.8]];
      if (last) out.clap.push([14, 0.6], [15, 0.8]);
      break;
    case 'verse':
      out.kick = four;
      out.clap = [[4, 0.9], [12, 0.9]];
      out.hat = eighthHats(0.3, 0.65);
      break;
    case 'pre':
      out.kick = last ? [0, 4] : four;
      out.clap = last ? roll() : [[4, 0.9], [12, 0.9]];
      out.hat = Array.from({ length: 16 }, (_, s) => [s, s % 2 ? 0.3 : 0.5, false]);
      break;
    case 'chorus':
      out.kick = four;
      out.clap = [[4, 1], [12, 1]];
      if (last) out.clap.push([14, 0.6], [15, 0.8]);
      out.hat = Array.from({ length: 16 }, (_, s) => (s % 4 === 2 ? [s, 0.55, true] : [s, 0.28, false]));
      break;
    case 'bridge':
      if (barIndex < 4) {
        out.kick = [0];
        out.clap = [[8, 0.8]];
        out.hat = eighthHats(0.2, 0.4);
      } else {
        out.kick = last ? [0, 4] : four;
        out.clap = last ? roll() : barIndex === bars - 2 ? [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, 0.7]) : [[4, 0.9], [12, 0.9]];
        out.hat = Array.from({ length: 16 }, (_, s) => [s, 0.3, false]);
      }
      break;
    case 'outro':
      if (last) out.kick = [0];
      else {
        out.kick = four;
        out.clap = [[4, 1], [12, 1]];
        out.hat = eighthHats(0.3, 0.6);
      }
      break;
    default:
      throw new Error(`unknown drum style ${style}`);
  }
  return out;
}

// Tokens: "lyric:pitch:sixteenths", "-n" rest, "~:pitch:n" holds the previous syllable's vowel on a new
// pitch (melisma), "|" is an optional visual bar line.
export function parseTokens(text) {
  const notes = [];
  let lastLyric = null;
  for (const tok of text.trim().split(/\s+/)) {
    if (tok === '|') continue;
    if (tok.startsWith('-')) {
      notes.push({ key: null, lyric: '', beats: Number(tok.slice(1)) / 4 });
      continue;
    }
    const [lyric, pitch, n] = tok.split(':');
    if (!pitch || !Number(n)) throw new Error(`bad token: ${tok}`);
    const sung = lyric === '~' ? (lastLyric ? vowelOf(lastLyric) : null) : lyric;
    if (!sung) throw new Error(`melisma with nothing to hold: ${text}`);
    notes.push({ key: pitchToMidi(pitch), lyric: sung, beats: Number(n) / 4 });
    lastLyric = sung;
  }
  return notes;
}

export function parseBar(bar) {
  const notes = parseTokens(bar);
  const total = notes.reduce((a, n) => a + n.beats, 0);
  if (Math.abs(total - 4) > 1e-9) throw new Error(`bar is ${total * 4}/16 sixteenths: ${bar}`);
  return notes;
}

// Phrase-based vocals: [[startSixteenth, tokens], ...] placed freely inside the section — phrases may
// cross bar lines and take whatever length their words need. Gaps become rests.
export function parsePhrases(phrases, bars) {
  const total = bars * 16;
  const notes = [];
  let at = 0;
  for (const [start, text] of phrases) {
    if (start < at) throw new Error(`phrase at ${start} overlaps the previous one (ends ${at}): ${text}`);
    if (start > at) notes.push({ key: null, lyric: '', beats: (start - at) / 4 });
    const ns = parseTokens(text);
    notes.push(...ns);
    at = start + ns.reduce((a, n) => a + n.beats * 4, 0);
    if (at > total) throw new Error(`phrase runs past the section end (${at} > ${total}): ${text}`);
  }
  if (at < total) notes.push({ key: null, lyric: '', beats: (total - at) / 4 });
  return notes;
}

// Everything except the vocal, as note events in beats.
export function arrange(sections) {
  const t = { kick: [], clap: [], hat: [], snare: [], bass: [], stab: [], pad: [], pluck: [], riser: [], impact: [], bell: [], chip: [], toy: [], future: [] };
  const vocals = [];
  const chops = [];
  let bar0 = 0;
  for (const sec of sections) {
    const start = bar0 * 4;
    if (sec.impact) t.impact.push({ beat: start, vel: 1 });
    if (sec.riser) t.riser.push({ beat: start + (sec.bars - 2) * 4, beats: 8, vel: 1 });
    if (sec.riserLast) t.riser.push({ beat: start + (sec.bars - sec.riserLast) * 4, beats: sec.riserLast * 4, vel: 1 });
    for (let b = 0; b < sec.bars; b++) {
      const at = start + b * 4;
      const sym = sec.chords[b % sec.chords.length];
      const { bassRoot } = chord(sym);
      const d = drumBar(sec.drums, b, sec.bars);
      for (const s of d.kick) t.kick.push({ beat: at + s / 4, vel: 1 });
      for (const [s, vel] of d.clap) t.clap.push({ beat: at + s / 4, vel });
      for (const [s, vel, open] of d.hat) t.hat.push({ beat: at + s / 4, vel, open });
      for (const [s, vel] of d.snare) t.snare.push({ beat: at + s / 4, vel });
      const v0 = voicing(sym);
      if (sec.bells === 'arp') {
        const up = v0.map((x) => x + 12);
        [0, 2, 1, 3, 2, 1, 3, 2].forEach((k, j) => t.bell.push({ beat: at + (2 * j) / 4, midi: up[k % up.length], vel: 0.5, pan: j % 2 ? 0.35 : -0.35 }));
      }
      if (sec.future) {
        for (const [s, len] of [[0, 3], [3, 3], [6, 2], [10, 2], [12, 3]]) {
          for (const midi of [...v0, v0[0] + 12]) t.future.push({ beat: at + s / 4, beats: len / 4 - 0.03, midi, vel: 0.85, bend: s === 0 && b % 2 === 0 ? 2 : 0, bendBeats: 0.5 });
        }
      }
      for (const [s, kind, vel] of TOYS[sec.toys]?.(b, sec.bars) ?? []) t.toy.push({ beat: at + s / 4, kind, vel });
      if (sec.bass && b >= (sec.bassFrom ?? 0)) {
        const pat = BASS[sec.bass];
        for (let s = 0; s < 16; s++) {
          const c = pat[s];
          if (c !== 'R' && c !== 'O') continue;
          let len = 1;
          while (s + len < 16 && pat[s + len] === '-') len++;
          t.bass.push({ beat: at + s / 4, beats: len / 4 - 0.02, midi: bassRoot + (c === 'O' ? 12 : 0), vel: c === 'O' ? 0.8 : 0.95 });
        }
      }
      const v = voicing(sym);
      if (sec.stabs) {
        const hits = sec.drums === 'pre' ? [0, 2, 4, 6, 8, 10, 12, 14] : [2, 6, 10, 14];
        for (const s of hits) for (const midi of [...v, v[0] + 12]) t.stab.push({ beat: at + s / 4, beats: 0.2, midi, vel: 0.9 });
      }
      if (sec.pad) for (const midi of [...v, v[0] - 12]) t.pad.push({ beat: at, beats: 3.9, midi, vel: 0.7 });
      if ((sec.riff || sec.riffLow) && b >= (sec.riffFrom ?? 0)) {
        const tones = riffTones(sym);
        const voice = sec.riffSynth === 'chip' ? t.chip : t.pluck;
        const shift = sec.riffLow ? -12 : sec.riffSynth === 'chip' ? 12 : 0;
        for (const [s, [idx, len]] of Object.entries(RIFF)) {
          voice.push({ beat: at + Number(s) / 4, beats: len / 4 - 0.03, midi: tones[idx] + shift, vel: sec.riffLow ? 0.55 : 0.9, pan: Number(s) % 2 ? 0.25 : -0.25 });
        }
      }
    }
    if (sec.vocal) {
      const notes = sec.phrases ? parsePhrases(sec.vocal, sec.bars) : sec.vocal.flatMap(parseBar);
      vocals.push({ name: sec.name, startBeat: start, bars: sec.bars, double: !!sec.double, notes });
    }
    if (sec.chops) chops.push({ name: sec.name, startBeat: start, bars: sec.bars, notes: parsePhrases(sec.chops, sec.bars) });
    // music-box melody lines (same token syntax as vocals; only pitches and lengths matter)
    if (sec.bellPhrases) {
      let beat = start;
      for (const n of parsePhrases(sec.bellPhrases, sec.bars)) {
        if (n.key != null) t.bell.push({ beat, midi: n.key, vel: 0.8 });
        beat += n.beats;
      }
    }
    bar0 += sec.bars;
  }
  return { tracks: t, vocals, chops, totalBeats: bar0 * 4 };
}

// Per-section instrument level ramps (sections give level: [start, end], default [1, 1]) — the song's
// dynamics live in the arrangement, not in the master compressor.
export function sectionLevels(sections, total, { sr, bpm }) {
  const g = new Float32Array(total).fill(1);
  let bar = 0;
  for (const sec of sections) {
    const [a, b] = sec.level ?? [1, 1];
    const s0 = Math.round((bar * 4 * 60 * sr) / bpm);
    const s1 = Math.min(total, Math.round(((bar + sec.bars) * 4 * 60 * sr) / bpm));
    for (let i = s0; i < s1; i++) g[i] = a + ((b - a) * (i - s0)) / (s1 - s0);
    if (sec.stopLastBeat) {
      // everything but the voice drops out for the final beat (5 ms fades) — a playful breath before the chorus
      const stop = Math.round(((bar + sec.bars) * 4 - 1) * (60 / bpm) * sr);
      const fade = Math.round(0.005 * sr);
      for (let i = stop - fade; i < s1; i++) g[i] *= i < stop ? (stop - i) / fade : i > s1 - fade ? (i - (s1 - fade)) / fade : 0;
    }
    bar += sec.bars;
  }
  return g;
}

const STEM_DB = { kick: -12, clap: -20, hat: -28, bass: -15, stab: -21, pad: -26, pluck: -21, riser: -27, impact: -23, snare: -19, bell: -25, chip: -23, toy: -27, future: -19 };

export async function produce(score, { sr = 44100, engine, voiceStyle, workDir, log = () => {} } = {}) {
  const { bpm } = score.meta;
  const tuning = score.meta.tuning ?? { mode: 'hard' };
  const { tracks, vocals, chops: arrangeChops, totalBeats } = arrange(score.sections);
  const total = Math.round(((totalBeats + 8) * 60 * sr) / bpm); // two bars of tail
  const ctx = { sr, bpm };
  const stems = {};
  const render = (name, fn) => {
    const bus = createBus(total);
    fn(bus);
    stems[name] = bus;
    log(`stem ${name}`);
  };
  render('kick', (b) => kick(ctx, tracks.kick, b));
  render('clap', (b) => clap(ctx, tracks.clap, b));
  render('hat', (b) => hat(ctx, tracks.hat, b));
  render('bass', (b) => bass(ctx, tracks.bass, b));
  render('stab', (b) => supersaw(ctx, tracks.stab, b, { kind: 'stab' }));
  render('pad', (b) => supersaw(ctx, tracks.pad, b, { kind: 'pad', seed: 43 }));
  render('pluck', (b) => pluck(ctx, tracks.pluck, b));
  render('riser', (b) => riser(ctx, tracks.riser, b));
  render('impact', (b) => impact(ctx, tracks.impact, b));
  render('snare', (b) => snare(ctx, tracks.snare, b));
  render('bell', (b) => bell(ctx, tracks.bell, b));
  render('chip', (b) => chip(ctx, tracks.chip, b));
  render('toy', (b) => toy(ctx, tracks.toy, b));
  render('future', (b) => futureChords(ctx, tracks.future, b));

  const kickBeats = tracks.kick.map((e) => e.beat);
  const pump = (depth) => sidechainCurve(total, kickBeats, { sr, bpm, depth });
  eq(stems.bass, [['highpass', 30, {}], ['peak', 900, { q: 1, gainDb: 2 }]], sr);
  eq(stems.pad, [['highpass', 180, {}]], sr);
  // carve the vocal's presence band out of the chord layers
  eq(stems.pad, [['peak', 2500, { q: 0.8, gainDb: -3 }]], sr);
  eq(stems.stab, [['highpass', 160, {}], ['peak', 2500, { q: 0.8, gainDb: -3 }], ['highshelf', 8000, { gainDb: -3 }]], sr);
  eq(stems.pluck, [['highpass', 200, {}]], sr);
  for (const [name, db] of Object.entries(STEM_DB)) if (stems[name]) levelTo(stems[name], db);
  applyGain(stems.bass, pump(0.45));
  applyGain(stems.stab, pump(0.6));
  applyGain(stems.pad, pump(0.75));
  applyGain(stems.pluck, pump(0.25));
  applyGain(stems.future, pump(0.5));
  eq(stems.future, [['highpass', 170, {}], ['peak', 2500, { q: 0.8, gainDb: -3 }]], sr);

  // VOICEVOX calls are cached on disk by request, so re-mixing never re-sings.
  const hash = (x) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16);
  const cachedQuery = async (sc) => {
    const file = `${workDir}/query-${hash(sc)}.json`;
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const q = await singQuery(sc, { engine });
    fs.writeFileSync(file, JSON.stringify(q));
    return q;
  };
  const sing = async (q, name) => {
    const file = `${workDir}/vocal-${name}-${hash([q, voiceStyle])}.wav`;
    if (!fs.existsSync(file)) fs.writeFileSync(file, await frameSynthesis(q, voiceStyle, { engine }));
    return loadWav(file, sr).channels[0];
  };

  // vocal: one render per section; tuned main + natural (teacher-pitch) double in choruses
  const vocal = createBus(total);
  const double = createBus(total);
  const lead = 1;
  for (const sec of vocals) {
    const sc = toScore(sec.notes, bpm, { leadBeats: lead });
    const query = await cachedQuery(sc);
    const hz = (i) => midiHz(sc.notes[i].key);
    const tuned = tuning.mode === 'hard' ? hardTune(query, sc, hz, { glide: 2 }) : softTune(query, sc, hz, tuning);
    const offset = Math.round(((sec.startBeat - lead) * 60 * sr) / bpm);
    const put = (mono, bus, { delay = 0, side = 0 } = {}) => {
      const d = Math.round((delay / 1000) * sr);
      for (let i = 0; i < mono.length; i++) {
        const j = offset + i + d;
        if (j < 0 || j >= total) continue;
        if (side <= 0) bus.left[j] += mono[i];
        if (side >= 0) bus.right[j] += mono[i];
      }
    };
    put(await sing(tuned, sec.name), vocal);
    if (sec.double) {
      const nat = await sing(query, `${sec.name}-double`);
      put(nat, double, { side: -1 });
      put(nat, double, { side: 1, delay: 11 });
    }
    log(`vocal ${sec.name}`);
  }
  for (const v of [vocal, double]) {
    eq(v, [['highpass', 150, {}], ['peak', 3000, { q: 1, gainDb: 3 }], ['highshelf', 9000, { gainDb: -2 }]], sr);
    compress(v, { sr, thresholdDb: -22, ratio: 3, attackMs: 4, releaseMs: 90 });
  }
  levelTo(vocal, -10);
  levelTo(double, -18);
  stems.vocal = vocal;
  stems.double = double;

  // vocal chops: sung an octave low at half speed, then played back at double speed —
  // up an octave with shifted formants (the cute "chipmunk" chop of kawaii future bass)
  const chopBus = createBus(total);
  for (const sec of arrangeChops) {
    const slow = sec.notes.map((n) => ({ ...n, key: n.key == null ? null : n.key - 12, beats: n.beats * 2 }));
    const score = toScore(slow, bpm, { leadBeats: lead });
    const q = softTune(await cachedQuery(score), score, (i) => midiHz(score.notes[i].key), { keep: 0.2, smooth: 1 });
    const mono = await sing(q, `chop-${sec.name}`);
    const offset = Math.round(((sec.startBeat - lead / 2) * 60 * sr) / bpm);
    const lpf = createSvf('lp', 9000, 0.7, sr);
    const pre = mono.map((x) => lpf(x));
    for (let j = 0; j * 2 + 1 < pre.length; j++) {
      const k = offset + j;
      if (k < 0 || k >= total) continue;
      const x = (pre[2 * j] + pre[2 * j + 1]) / 2;
      chopBus.left[k] += x;
      chopBus.right[k] += x;
    }
    log(`chops ${sec.name}`);
  }
  eq(chopBus, [['highpass', 250, {}]], sr);
  compress(chopBus, { sr, thresholdDb: -22, ratio: 3 });
  levelTo(chopBus, -17);
  stems.chops = chopBus;

  // sends: instrument and vocal reverbs are separate so the instrumental carries no vocal tail
  const instSend = createBus(total);
  mixInto(instSend, stems.stab, 0.6);
  mixInto(instSend, stems.pluck, 0.6);
  mixInto(instSend, stems.clap, 0.5);
  const instVerb = reverb(instSend, { sr, room: 0.8, damp: 0.4 });
  const voxSend = createBus(total);
  mixInto(voxSend, vocal);
  mixInto(voxSend, chopBus, 0.8);
  mixInto(voxSend, stems.bell, 0.7);
  const voxVerb = reverb(voxSend, { sr, room: 0.82, damp: 0.45 });
  const dlySend = createBus(total);
  mixInto(dlySend, vocal, 1);
  mixInto(dlySend, stems.pluck, 0.8);
  const dly = pingPong(dlySend, { sr, bpm, beats: 0.75, feedback: 0.35 });
  log('fx');

  const instrumental = createBus(total);
  for (const name of Object.keys(STEM_DB)) mixInto(instrumental, stems[name]);
  mixInto(instrumental, instVerb, 0.3);
  applyGain(instrumental, sectionLevels(score.sections, total, { sr, bpm }));
  const full = createBus(total);
  mixInto(full, instrumental);
  mixInto(full, vocal);
  mixInto(full, double);
  mixInto(full, chopBus);
  mixInto(full, voxVerb, 0.3);
  mixInto(full, dly, 0.16);
  const inst = createBus(total);
  mixInto(inst, instrumental);
  return {
    sr,
    durationSec: total / sr,
    full: { ...master(full, { sr, targetDb: -11 }), sampleRate: sr },
    instrumental: { ...master(inst, { sr, targetDb: -12 }), sampleRate: sr },
    stems,
  };
}
