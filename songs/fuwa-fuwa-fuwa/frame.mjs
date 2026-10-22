// 「ふわ ふわ ふわ。」 v2 frame: one melody and one bouncy ("ぽよん ぽよん") arrangement, shared by every
// lyric variant (〈ゆき〉〈やみ〉〈けんか〉〈さんぽ〉) — a 替え歌 set, so the variants differ in words (and,
// for the dark one, in harmony and colour) while the tune stays the same to compare them by.
//
// 132 BPM: an 8th is 0.23 s, inside the talk voices' steady length, so they sound like the two of them
// talking (v1 at 86 BPM stretched every syllable past it). D major: つむぎ D4–A4 (C#4 as a leading tone),
// ずんだもん A4–D5, inside the measured ranges (C#4–A4 / A4–D#5).
//
// A slot is { who: 'a' | 'z' | 'both', at: 16th inside the section, a/z: pitches }. Pitches are
// "F#4 E4 A4:4" (8ths unless ":n" sixteenths are given; "-" is an 8th rest). A variant gives one kana
// string per slot; its morae must match the slot's notes (small ゃゅょぁぃぅぇぉ join the mora before).

export const BPM = 132;
const SMALL = new Set('ゃゅょぁぃぅぇぉ');
export function morae(text) {
  const out = [];
  for (const ch of text.replace(/[\s、。]/g, '')) {
    if (SMALL.has(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

// the puffs bounce up (B4 -> D5) and land on the third (B4 -> A4): a ball, not a sigh. Falling puffs
// (D5 -> B4) left ずんだもん's 「ふ」 22 dB under the 「わ」 at 132 BPM (talk QA).
const HOOK_Z = 'B4 D5 - B4 D5 - B4 A4';
const HOOK_A = 'D4 F#4 - D4 F#4 - D4 C#4'; // a sixth below, for the last chorus and the outro
export const HOOK = 'ふわ ふわ ふわ';

export const SLOTS = {
  verse1: [
    { who: 'a', at: 2, a: 'F#4 F#4 E4 F#4 A4 G4 F#4:4' },
    { who: 'z', at: 20, z: 'B4 B4 A4 B4 D5 B4:4' },
    { who: 'a', at: 34, a: 'D4 E4 G4 G4 F#4 D4 E4:4' },
    { who: 'z', at: 52, z: 'A4 A4 B4 C#5 B4 A4:4' },
    { who: 'a', at: 66, a: 'A4 F#4 E4 F#4 D4:4' },
    { who: 'z', at: 82, z: 'B4 B4 D5 C#5 B4 A4 B4 B4:4' },
    { who: 'a', at: 100, a: 'G4 F#4 E4 D4 E4 F#4:4' },
    { who: 'z', at: 116, z: 'C#5 C#5 B4 A4 B4 C#5' },
    { who: 'a', at: 130, a: 'E4 G4 F#4 E4 G4 F#4 E4:4' },
    { who: 'z', at: 148, z: 'A4 C#5 B4 A4 C#5 A4:4' },
    { who: 'a', at: 162, a: 'D4 E4 F#4 G4 A4:4' },
    { who: 'z', at: 178, z: 'A4 B4 C#5 B4 A4 B4 C#5 B4:4' },
    { who: 'a', at: 196, a: 'G4 G4 F#4 E4 G4 F#4:4' },
    { who: 'z', at: 212, z: 'C#5 C#5 B4 A4 B4 C#5:4' },
    { who: 'a', at: 226, a: 'F#4 G4 A4 G4 F#4' },
    { who: 'both', at: 236, z: 'A4 A4 C#5:4', a: 'E4 E4 A4:4' },
  ],
  // 8 bars, sung twice per chorus
  chorus: [
    { who: 'z', at: 0, z: HOOK_Z, fixed: HOOK },
    { who: 'a', at: 18, a: 'E4 E4 F#4 A4 E4:4' },
    { who: 'both', at: 34, z: 'A4 C#5 C#5 A4 C#5 C#5 A4 B4:4', a: 'F#4 A4 A4 F#4 A4 A4 F#4 F#4:4' },
    { who: 'z', at: 64, z: HOOK_Z, fixed: HOOK },
    { who: 'a', at: 82, a: 'E4 E4 F#4 F#4 G4 A4 E4' },
    { who: 'z', at: 96, z: 'A4 A4 B4 D5 C#5 B4 A4 A4:4' },
    { who: 'a', at: 114, a: 'F#4 F#4 E4 D4 E4 F#4 D4' },
  ],
  verse2: [
    { who: 'z', at: 2, z: 'A4 A4 B4 D5 C#5 B4 A4:4' },
    { who: 'a', at: 20, a: 'F#4 F#4 D4 F#4 A4 F#4:4' },
    { who: 'z', at: 36, z: 'B4 B4 A4 B4 D5 B4 A4:4' },
    { who: 'a', at: 52, a: 'E4 E4 C#4 E4 F#4 E4:4' },
    { who: 'z', at: 66, z: 'B4 B4 A4 B4 D5 C#5 B4 A4:4' },
    { who: 'a', at: 84, a: 'A4 A4 F#4 E4 F#4 A4:4' },
    { who: 'z', at: 98, z: 'B4 B4 A4 B4 D5 B4' },
    { who: 'both', at: 112, z: 'A4 A4 C#5:4', a: 'E4 E4 A4:4' },
  ],
  bridge: [
    { who: 'a', at: 0, a: 'D4 F#4 E4 D4 F#4:4' },
    { who: 'z', at: 16, z: 'A4 C#5 B4 A4 C#5:4' },
    { who: 'a', at: 32, a: 'D4 E4 F#4 G4 D4:4' },
    { who: 'z', at: 48, z: 'A4 B4 C#5 D5 A4:4' },
    { who: 'a', at: 64, a: 'E4 G4 F#4 E4 G4 E4:4' },
    { who: 'z', at: 80, z: 'A4 C#5 B4 A4 C#5 A4:4' },
    { who: 'both', at: 98, z: 'B4 B4 A4 B4 D5 B4 A4 A4:4', a: 'G4 G4 F#4 G4 A4 G4 F#4 E4:4' },
  ],
  outro: [
    { who: 'both', at: 0, z: HOOK_Z, a: HOOK_A, fixed: HOOK },
    { who: 'a', at: 18, a: 'E4 F#4 A4 F#4 E4 E4 C#4:4' },
    { who: 'z', at: 36, z: 'B4 B4 A4 B4 D5 B4 A4 B4:4' },
    { who: 'both', at: 64, z: HOOK_Z, a: HOOK_A, fixed: HOOK },
    { who: 'both', at: 98, z: 'A4 B4 D5 C#5 D5:4', a: 'F#4 G4 A4 A4 F#4:4' },
  ],
};

// pitches + kana -> the engine's token string ("ふ:D5:2 わ:B4:2 -2 …")
export function tokens(pitches, text, where) {
  const ps = pitches.trim().split(/\s+/);
  const ms = morae(text);
  const notes = ps.filter((p) => p !== '-');
  if (notes.length !== ms.length) throw new Error(`${where}: "${text}" has ${ms.length} morae for ${notes.length} notes`);
  let i = 0;
  return ps.map((p) => {
    if (p === '-') return '-2';
    const [pitch, n = '2'] = p.split(':');
    return `${ms[i++]}:${pitch}:${n}`;
  }).join(' ');
}

// slots + one lyric per slot (or the slot's fixed hook) -> { a: phrases, z: phrases }, offset by o.
// overrides: { index: { a?: pitches, z?: pitches } } lets a variant re-shape one slot's tune for its words.
function fill(name, lines, { o = 0, harmonyHook = false, overrides = {} } = {}) {
  const out = { a: [], z: [] };
  let k = 0;
  SLOTS[name].forEach((slot, i) => {
    const text = slot.fixed ?? lines[k++];
    if (text == null) throw new Error(`${name}: missing lyric for slot ${i}`);
    const ov = overrides[i] ?? {};
    for (const who of slot.who === 'both' ? ['z', 'a'] : [slot.who]) out[who].push([o + slot.at, tokens(ov[who] ?? slot[who], text, `${name}[${i}]`)]);
    if (harmonyHook && slot.fixed && slot.who === 'z') out.a.push([o + slot.at, tokens(HOOK_A, text, `${name}[${i}]`)]);
  });
  if (k !== lines.length) throw new Error(`${name}: ${lines.length} lyrics for ${k} slots`);
  for (const who of ['a', 'z']) out[who].sort((p, q) => p[0] - q[0]);
  return out;
}
const join = (x, y) => ({ a: [...x.a, ...y.a], z: [...x.z, ...y.z] });

const CHORDS = {
  bright: {
    chorus: ['Gmaj7', 'A', 'F#m7', 'Bm7', 'Em7', 'A', 'Dmaj7', 'Dmaj7'],
    verse1: ['Dmaj7', 'Bm7', 'Gmaj7', 'A', 'Dmaj7', 'Bm7', 'Gmaj7', 'A', 'Em7', 'F#m7', 'Gmaj7', 'A', 'Em7', 'F#m7', 'Gmaj7', 'A'],
    verse2: ['Dmaj7', 'Bm7', 'Gmaj7', 'A', 'Em7', 'F#m7', 'Gmaj7', 'A'],
    inter: ['Gmaj7', 'A', 'Gmaj7', 'A'],
    bridge: ['Bm7', 'F#m7', 'Gmaj7', 'Dmaj7', 'Em7', 'F#m7', 'Gmaj7', 'A'],
    outro: ['Gmaj7', 'A', 'F#m7', 'Bm7', 'Em7', 'A', 'Dadd9', 'Dadd9'],
  },
  // the same tune leaning on B minor: D -> Gmaj7/Bm7, A -> F#m7, ending on Bm9
  dark: {
    chorus: ['Gmaj7', 'Em7', 'F#m7', 'Bm7', 'Em7', 'F#m7', 'Bm7', 'Bm7'],
    verse1: ['Gmaj7', 'Bm7', 'Em7', 'F#m7', 'Gmaj7', 'Bm7', 'Em7', 'F#m7', 'Em7', 'F#m7', 'Gmaj7', 'F#m7', 'Em7', 'F#m7', 'Gmaj7', 'F#m7'],
    verse2: ['Gmaj7', 'Bm7', 'Em7', 'F#m7', 'Em7', 'F#m7', 'Gmaj7', 'F#m7'],
    inter: ['Gmaj7', 'F#m7', 'Gmaj7', 'F#m7'],
    bridge: ['Bm7', 'F#m7', 'Gmaj7', 'Dmaj7', 'Em7', 'F#m7', 'Gmaj7', 'F#m7'],
    outro: ['Gmaj7', 'Em7', 'F#m7', 'Bm7', 'Em7', 'F#m7', 'Bm9', 'Bm9'],
  },
};

const BOX_HOOK = 'x:B5:2 x:D6:2 -2 x:B5:2 x:D6:2 -2 x:B5:2 x:A5:2';
const BOX = `${BOX_HOOK} | -2 x:E5:2 x:E5:2 x:F#5:2 x:A5:2 x:E5:4 -2`;

// variant: { key, title, version, mood: 'bright' | 'dark', chords?: { section: [..] } (per-bar overrides),
//   lyrics: { verse1, chorus, verse2, bridge, outro }, overrides?: { section: { slot: {a?, z?} } } }
export function buildSong(variant) {
  const dark = variant.mood === 'dark';
  const ch = { ...CHORDS[dark ? 'dark' : 'bright'], ...(variant.chords ?? {}) };
  const L = variant.lyrics;
  const ov = variant.overrides ?? {};
  const chorus = (harmonyHook) => join(fill('chorus', L.chorus, { harmonyHook, overrides: ov.chorus }), fill('chorus', L.chorus, { o: 128, harmonyHook, overrides: ov.chorus }));
  const meta = {
    title: `ふわ ふわ ふわ。〈${variant.title}〉`,
    group: 'ふわ ふわ ふわ。',
    version: variant.version,
    bpm: BPM,
    key: dark ? 'B minor' : 'D major',
    vocalMode: 'talk',
    singers: {
      a: { name: '春日部つむぎ', talkStyle: 8, singStyle: 3008, pan: -0.2, heta: { bias: -15, timingMs: 15 } },
      z: { name: 'ずんだもん', talkStyle: 3, singStyle: 3003, pan: 0.2, heta: { bias: 10, highBias: 25, highKey: 73, timingMs: -15 } },
    },
    voice: { style: 3008, name: '春日部つむぎ・ずんだもん', styleName: 'トーク歌唱' },
    // "ぽよん ぽよん": jelly comp and bass, pads that swell back after every kick (pump), a music box
    // with a quarter-note wobble, a long soft reverb so the bounces blur into each other.
    mix: {
      stemDb: { poyon: -22, poyonBass: -16, clap: -27, shaker: -34, lightKick: -17, bell: -27, guide: -34, pad: -25, toy: -28 },
      tremolo: { stems: ['bell', 'guide'], rateHz: BPM / 60, depth: 0.45 },
      chorus: { stems: ['pad', 'poyon'], delayMs: 16, depthMs: 4, rateHz: 0.5, mix: 0.3 },
      vocalChorus: { delayMs: 12, depthMs: 2, rateHz: 0.35, mix: 0.18 },
      vocalReverb: dark ? 0.62 : 0.5,
      vocalRoom: dark ? 0.9 : 0.86,
      vocalDamp: 0.55,
      vocalPredelayMs: 35,
      instReverb: dark ? 0.55 : 0.42,
      instRoom: 0.88,
      instDamp: 0.5,
      reverbStems: ['poyon', 'bell', 'pad'],
      airDb: dark ? -5 : -2.5,
    },
  };
  const base = { comp: 'poyon', bass: 'bounce', bassSynth: 'poyon', phrases: true, duet: true, guide: true, pad: true, toys: dark ? undefined : 'poyon' };
  const verseDrums = dark ? 'nenne' : 'yuruVerse';
  const chorusDrums = dark ? 'yuruBreak' : 'yuruChorus';
  const sections = [
    { ...base, name: 'intro', level: [0.75, 0.85], bars: 8, chords: ch.chorus, drums: 'yuruBreak', bellPhrases: [[0, BOX], [64, BOX]], ball: true, duet: false },
    { ...base, name: 'verse1', level: [0.8, 0.85], bars: 16, chords: ch.verse1, drums: verseDrums, vocal: fill('verse1', L.verse1, { overrides: ov.verse1 }) },
    { ...base, name: 'chorus1', level: [1, 1], bars: 16, chords: ch.chorus, drums: chorusDrums, bass: 'hop', bells: 'arp', vocal: chorus(false) },
    { ...base, name: 'inter', level: [0.85, 0.85], bars: 4, chords: ch.inter, drums: 'yuruBreak', bellPhrases: [[0, BOX]], ball: true, duet: false },
    { ...base, name: 'verse2', level: [0.8, 0.85], bars: 8, chords: ch.verse2, drums: verseDrums, vocal: fill('verse2', L.verse2, { overrides: ov.verse2 }) },
    { ...base, name: 'chorus2', level: [1, 1], bars: 16, chords: ch.chorus, drums: chorusDrums, bass: 'hop', bells: 'arp', vocal: chorus(false) },
    { ...base, name: 'bridge', level: [0.75, 0.85], bars: 8, chords: ch.bridge, drums: 'yuruBreak', bass: 'long', bells: 'arp', ball: true, vocal: fill('bridge', L.bridge, { overrides: ov.bridge }) },
    { ...base, name: 'chorus3', level: [1, 1], bars: 16, chords: ch.chorus, drums: chorusDrums, bass: 'hop', bells: 'arp', vocal: chorus(true) },
    { ...base, name: 'outro', level: [0.85, 0.6], bars: 8, chords: ch.outro, drums: 'none', bass: undefined, toys: 'outro', bellPhrases: [[112, BOX_HOOK]], vocal: fill('outro', L.outro, { overrides: ov.outro }) },
  ];
  return { meta, sections, lyrics: L };
}
