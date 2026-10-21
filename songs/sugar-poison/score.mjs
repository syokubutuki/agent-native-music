// 「シュガシュガポイズン」 — electro dance-pop in the manner of DECO*27-style vocal synth pop
// (164 BPM, C# minor, four-on-the-floor, bouncing synth bass, offbeat supersaw stabs, a repeating pluck
// riff). Melody, lyrics and progression are original.

export const meta = {
  title: 'シュガシュガポイズン',
  version: 2,
  bpm: 164,
  key: 'C# minor',
  // v2: voice moved into its measured sweet spot (speech centre F4; melody E4–D#5) and sung legato
  voice: { style: 3008, name: '春日部つむぎ', styleName: 'ノーマル' },
  tuning: { mode: 'soft', keep: 0.5, smooth: 3 },
};

// v2 vocals are phrase-based: [startSixteenth, tokens] inside the section, free to cross bar lines.
// Tokens: "lyric:pitch:sixteenths", "-n" rest, "~:pitch:n" melisma (hold the vowel onto a new pitch), "|" visual bar.
const fill = (template, words) => {
  const syl = words.replace(/\s+/g, '').match(/[ぁ-ゖ][ゃゅょぁぃぅぇぉ]?/g);
  let i = 0;
  const out = template.replace(/\$/g, () => syl[i++] ?? '?');
  if (i !== syl.length || out.includes('?')) throw new Error(`"${words}" has ${syl.length} morae, template wants ${i}`);
  return out;
};
const line = (at, template, words) => [at, fill(template, words)];

// chorus lines (2 bars each) — hook "あまい あまい", 9 morae per line, ~3 syllables/s
const C_HOOK = 'あ:A4:2 ま:B4:2 い:C#5:6 ~:B4:2 あ:A4:2 ま:B4:2 | い:B4:6 ~:A4:2 $:G#4:2 $:A4:2 $:B4:2 -2';
const C_MELT = 'と:D#5:2 け:C#5:2 て:B4:4 ~:G#4:2 -2 と:B4:2 け:C#5:2 | て:B4:4 き:G#4:2 え:E4:4 ~:F#4:2 る:G#4:4';
const C_END = 'ぬ:B4:2 れ:B4:2 て:D#5:6 ~:C#5:2 -2 わ:B4:2 | た:G#4:2 し:B4:2 の:C#5:2 も:B4:2 の:G#4:8';
const chorus8 = (o) => [line(o, C_HOOK, 'ゆめに'), [o + 32, C_MELT], line(o + 64, C_HOOK, 'どくに'), [o + 96, C_END]];
const CHORUS = [...chorus8(0), ...chorus8(128)];

// verse lines (2 bars each; low and sparse, ~2.3 syllables/s)
const V = {
  a8: '-2 $:E4:2 $:E4:2 $:G#4:2 $:G#4:2 $:B4:4 ~:G#4:2 | $:A4:2 $:G#4:2 $:E4:8 -4',
  a7: '-2 $:E4:2 $:E4:2 $:G#4:2 $:G#4:2 $:B4:4 $:G#4:2 | $:A4:4 ~:G#4:2 ~:E4:6 -4',
  b7: '-2 $:E4:2 $:E4:2 $:G#4:2 $:B4:4 ~:A4:2 -2 | $:F#4:2 $:A4:2 $:B4:8 -4',
  b8: '-2 $:E4:2 $:G#4:2 $:B4:2 $:B4:2 $:C#5:4 $:B4:2 | $:A4:4 $:F#4:8 -4',
  b4: '-4 $:G#4:4 $:B4:4 $:B4:4 | $:A4:6 ~:G#4:2 ~:F#4:4 -4',
  ne: '-2 $:G#4:4 $:E4:2 $:G#4:2 $:B4:2 $:B4:2 $:C#5:2 | $:B4:2 $:A4:4 ~:G#4:2 -8',
};
const VERSE1 = [
  line(0, V.a8, 'まよなかの まどに'), line(32, V.b7, 'なまえを なぞる'),
  line(64, V.a7, 'やさしい ふりが'), line(96, V.b8, 'いちばん こわいの'),
  line(128, V.a7, 'ぬるい こたえわ'), line(160, V.b4, 'いらない'),
  line(192, V.ne, 'ねえ ふかく ふかく'), line(224, V.b4, 'しずめて'),
];
const VERSE2 = [
  line(0, V.a7, 'しろい くびすじ'), line(32, V.b7, 'ゆびで なぞるの'),
  line(64, V.a7, 'あかい しずくが'), line(96, V.b8, 'おちて きえるまで'),
];
const PRE = [
  [0, '-2 と:C#5:2 け:B4:2 て:A4:6 ~:G#4:2 -2 | と:B4:2 け:A4:2 て:G#4:8 -4'],
  [32, '-2 と:C#5:2 け:B4:2 て:A4:4 ゆ:B4:2 く:C#5:2 -2 | の:D#5:8 ~:C#5:4 -4'],
  [64, '-2 ゆ:A4:2 め:A4:2 と:C#5:4 う:C#5:2 つ:B4:2 つ:A4:2 | の:B4:8 ~:A4:4 -4'],
  [96, '-4 ぜ:C#5:2 ん:C#5:2 ぶ:B4:4 あ:A4:2 げ:B4:2 | る:C#5:4 か:D#5:4 ら:D#5:4 -4'],
];
const BRIDGE = [
  [0, '-2 ゆ:C#5:2 ら:B4:2 ゆ:A4:2 ら:B4:2 ゆ:C#5:4 れ:B4:2 | て:A4:8 ~:G#4:4 -4'],
  [32, '-2 そ:A4:2 れ:A4:2 で:C#5:2 も:C#5:4 ほ:B4:2 し:A4:2 | い:G#4:4 の:C5:8 -4'],
];
const POST = [line(0, C_HOOK, 'ゆめに'), line(64, C_HOOK, 'ゆめに')];
const OUTRO = [[20, 'も:B4:4 う:A4:4 い:G#4:2 ち:A4:2 ど:G#4:8']];

// Chord cycles (one chord per bar).
const CH = { chorus: ['A', 'B', 'G#m', 'C#m'], verse: ['C#m', 'A', 'E', 'B'], pre: ['F#m', 'G#m', 'A', 'B'], bridge: ['A', 'A', 'F#m', 'G#'] };

export const sections = [
  { name: 'intro', level: [0.55, 0.8], bars: 8, chords: CH.chorus, drums: 'intro', bass: 'chorus', bassFrom: 4, stabs: false, pad: true, riff: true },
  { name: 'verse1', level: [0.6, 0.65], bars: 16, chords: CH.verse, drums: 'verse', bass: 'verse', pad: true, phrases: true, vocal: VERSE1 },
  { name: 'pre1', level: [0.7, 0.95], bars: 8, chords: CH.pre, drums: 'pre', bass: 'pre', stabs: true, riser: true, phrases: true, vocal: PRE },
  { name: 'chorus1', level: [1, 1], bars: 16, chords: CH.chorus, drums: 'chorus', bass: 'chorus', stabs: true, pad: true, riffLow: true, impact: true, double: true, phrases: true, vocal: CHORUS },
  { name: 'post1', level: [1, 1], bars: 8, chords: CH.chorus, drums: 'chorus', bass: 'chorus', stabs: true, riff: true, phrases: true, vocal: POST },
  { name: 'verse2', level: [0.62, 0.66], bars: 8, chords: CH.verse, drums: 'verse', bass: 'verse', pad: true, phrases: true, vocal: VERSE2 },
  { name: 'pre2', level: [0.7, 0.95], bars: 8, chords: CH.pre, drums: 'pre', bass: 'pre', stabs: true, riser: true, phrases: true, vocal: PRE },
  { name: 'chorus2', level: [1, 1], bars: 16, chords: CH.chorus, drums: 'chorus', bass: 'chorus', stabs: true, pad: true, riffLow: true, impact: true, double: true, phrases: true, vocal: CHORUS },
  { name: 'bridge', level: [0.45, 0.9], bars: 8, chords: CH.bridge, drums: 'bridge', bass: 'long', pad: true, riserLast: 4, phrases: true, vocal: BRIDGE },
  { name: 'chorus3', level: [1, 1], bars: 16, chords: CH.chorus, drums: 'chorus', bass: 'chorus', stabs: true, pad: true, riff: true, impact: true, double: true, phrases: true, vocal: CHORUS },
  { name: 'outro', level: [0.9, 0.6], bars: 4, chords: CH.chorus, drums: 'outro', bass: 'chorus', riff: true, pad: true, phrases: true, vocal: OUTRO },
];

export const lyrics = {
  verse1: 'まよなかの まどに / なまえを なぞる / やさしい ふりが / いちばん こわいの / ぬるい こたえは / いらない / ねえ ふかく ふかく / しずめて',
  pre: 'とけて とけて / とけて ゆくの / ゆめと うつつの / ぜんぶ あげるから',
  chorus: 'あまい あまい ゆめに / とけて とけて きえる / あまい あまい どくに / ぬれて わたしのもの',
  verse2: 'しろい くびすじ / ゆびで なぞるの / あかい しずくが / おちて きえるまで',
  bridge: 'ゆらゆら ゆれて / それでも ほしいの',
  outro: 'もう いちど',
};
