// Score (sections of chords, patterns and vocal bars) -> stems -> mixed song.

import { createBus, kick, clap, hat, riser, impact, bass, supersaw, pluck } from './synth.mjs';
import { reverb, pingPong, sidechainCurve, applyGain, eq, compress, levelTo, mixInto, master } from './fx.mjs';
import { toScore, singQuery, frameSynthesis, hardTune, softTune, midiHz, vowelOf } from './voicevox.mjs';
import { pitchToMidi } from './notes.mjs';
import { loadWav } from './mix.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Chord symbol -> pitch classes (root first) and bass root MIDI note.
const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
export function chord(symbol) {
  const m = /^([A-G]#?)(m?)$/.exec(symbol);
  if (!m) throw new Error(`unknown chord ${symbol}`);
  const root = PC[m[1]];
  const pcs = [root, (root + (m[2] ? 3 : 4)) % 12, (root + 7) % 12];
  const bassRoot = 28 + ((root - 4 + 12) % 12); // E1..D#2
  return { pcs, bassRoot };
}
const above = (pc, floor) => floor + ((pc - floor) % 12 + 12) % 12;
export function voicing(symbol, floor = 56) {
  return chord(symbol).pcs.map((pc) => above(pc, floor)).sort((a, b) => a - b);
}
function riffTones(symbol) {
  const { pcs } = chord(symbol);
  const r = above(pcs[0], 56);
  const t = r + ((pcs[1] - pcs[0] + 12) % 12);
  const f = r + ((pcs[2] - pcs[0] + 12) % 12);
  return [null, r, t, f, r + 12, t + 12];
}

const steps = (list) => new Set(list);
const RIFF = { 0: [3, 2], 2: [4, 1], 3: [3, 1], 5: [1, 1], 7: [2, 1], 8: [3, 2], 10: [4, 1], 12: [5, 1], 13: [4, 1], 15: [2, 1] };
const BASS = {
  chorus: 'R-OR-.O.R-OR.OO.',
  verse: 'R--.R-.OR--.R.O.',
  pre: 'R.R.R.R.R.R.R.R.',
  long: 'R---------------',
};

// Drum hits for one bar: returns {kick:[step], clap:[[step,vel]], hat:[[step,vel,open]]}.
function drumBar(style, barIndex, bars) {
  const last = barIndex === bars - 1;
  const four = [0, 4, 8, 12];
  const out = { kick: [], clap: [], hat: [] };
  const eighthHats = (down, off) => [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, s % 4 === 2 ? off : down, false]);
  const roll = () => Array.from({ length: 16 }, (_, s) => [s, 0.25 + 0.75 * (s / 15)]);
  switch (style) {
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
  const t = { kick: [], clap: [], hat: [], bass: [], stab: [], pad: [], pluck: [], riser: [], impact: [] };
  const vocals = [];
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
      if (sec.riff || sec.riffLow) {
        const tones = riffTones(sym);
        for (const [s, [idx, len]] of Object.entries(RIFF)) {
          t.pluck.push({ beat: at + Number(s) / 4, beats: len / 4 - 0.03, midi: tones[idx] + (sec.riffLow ? -12 : 0), vel: sec.riffLow ? 0.55 : 0.9, pan: Number(s) % 2 ? 0.25 : -0.25 });
        }
      }
    }
    if (sec.vocal) {
      const notes = sec.phrases ? parsePhrases(sec.vocal, sec.bars) : sec.vocal.flatMap(parseBar);
      vocals.push({ name: sec.name, startBeat: start, bars: sec.bars, double: !!sec.double, notes });
    }
    bar0 += sec.bars;
  }
  return { tracks: t, vocals, totalBeats: bar0 * 4 };
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
    bar += sec.bars;
  }
  return g;
}

const STEM_DB = { kick: -12, clap: -20, hat: -28, bass: -15, stab: -21, pad: -26, pluck: -21, riser: -27, impact: -23 };

export async function produce(score, { sr = 44100, engine, voiceStyle, workDir, log = () => {} } = {}) {
  const { bpm } = score.meta;
  const tuning = score.meta.tuning ?? { mode: 'hard' };
  const { tracks, vocals, totalBeats } = arrange(score.sections);
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

  const kickBeats = tracks.kick.map((e) => e.beat);
  const pump = (depth) => sidechainCurve(total, kickBeats, { sr, bpm, depth });
  eq(stems.bass, [['highpass', 30, {}], ['peak', 900, { q: 1, gainDb: 2 }]], sr);
  eq(stems.pad, [['highpass', 180, {}]], sr);
  // carve the vocal's presence band out of the chord layers
  eq(stems.pad, [['peak', 2500, { q: 0.8, gainDb: -3 }]], sr);
  eq(stems.stab, [['highpass', 160, {}], ['peak', 2500, { q: 0.8, gainDb: -3 }], ['highshelf', 8000, { gainDb: -3 }]], sr);
  eq(stems.pluck, [['highpass', 200, {}]], sr);
  for (const [name, db] of Object.entries(STEM_DB)) levelTo(stems[name], db);
  applyGain(stems.bass, pump(0.45));
  applyGain(stems.stab, pump(0.6));
  applyGain(stems.pad, pump(0.75));
  applyGain(stems.pluck, pump(0.25));

  // vocal: one VOICEVOX render per section, hard-tuned main + natural double in choruses
  const vocal = createBus(total);
  const double = createBus(total);
  const lead = 1;
  for (const sec of vocals) {
    const score = toScore(sec.notes, bpm, { leadBeats: lead });
    const qkey = crypto.createHash('sha1').update(JSON.stringify(score)).digest('hex').slice(0, 16);
    const qfile = `${workDir}/query-${qkey}.json`;
    const query = fs.existsSync(qfile) ? JSON.parse(fs.readFileSync(qfile, 'utf8')) : await singQuery(score, { engine });
    fs.writeFileSync(qfile, JSON.stringify(query));
    const hz = (i) => midiHz(score.notes[i].key);
    const tuned = tuning.mode === 'hard' ? hardTune(query, score, hz, { glide: 2 }) : softTune(query, score, hz, tuning);
    const offset = Math.round(((sec.startBeat - lead) * 60 * sr) / bpm);
    const put = async (q, bus, { delay = 0, gain = 1, side = 0 }) => {
      // cache by query + voice so re-mixing does not re-sing
      const key = crypto.createHash('sha1').update(JSON.stringify([q, voiceStyle])).digest('hex').slice(0, 16);
      const file = `${workDir}/vocal-${sec.name}-${key}.wav`;
      if (!fs.existsSync(file)) fs.writeFileSync(file, await frameSynthesis(q, voiceStyle, { engine }));
      const mono = loadWav(file, sr).channels[0];
      const d = Math.round((delay / 1000) * sr);
      for (let i = 0; i < mono.length; i++) {
        const j = offset + i + d;
        if (j < 0 || j >= total) continue;
        if (side <= 0) bus.left[j] += mono[i] * gain;
        if (side >= 0) bus.right[j] += mono[i] * gain;
      }
    };
    await put(tuned, vocal, {});
    if (sec.double) {
      await put(query, double, { side: -1 });
      await put(query, double, { side: 1, delay: 11 });
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

  // sends: instrument and vocal reverbs are separate so the instrumental carries no vocal tail
  const instSend = createBus(total);
  mixInto(instSend, stems.stab, 0.6);
  mixInto(instSend, stems.pluck, 0.6);
  mixInto(instSend, stems.clap, 0.5);
  const instVerb = reverb(instSend, { sr, room: 0.8, damp: 0.4 });
  const voxVerb = reverb(vocal, { sr, room: 0.82, damp: 0.45 });
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
