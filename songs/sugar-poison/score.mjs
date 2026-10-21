// 「シュガシュガポイズン」 — electro dance-pop in the manner of DECO*27-style vocal synth pop
// (164 BPM, C# minor, four-on-the-floor, bouncing synth bass, offbeat supersaw stabs, a repeating pluck
// riff, machine-tight vocal). Melody, lyrics and progression are original.
//
// Vocal bars: tokens "lyric:pitch:sixteenths" or "-n" (rest of n sixteenths); every bar sums to 16.

export const meta = {
  title: 'シュガシュガポイズン',
  bpm: 164,
  key: 'C# minor',
  voice: { style: 3043, name: '櫻歌ミコ', styleName: 'ノーマル' },
};

const V = {
  // verse template: 7-mora bars over C#m / E, 7 over A, 6 over B (bar 4), 5 over B (bar 8)
  v7a: (l) => `-2 ${l[0]}:G#4:1 ${l[1]}:G#4:1 ${l[2]}:G#4:2 ${l[3]}:B4:2 ${l[4]}:G#4:1 ${l[5]}:E4:1 ${l[6]}:G#4:4 -2`,
  v7b: (l) => `-2 ${l[0]}:A4:1 ${l[1]}:A4:1 ${l[2]}:C#5:2 ${l[3]}:B4:2 ${l[4]}:A4:1 ${l[5]}:G#4:1 ${l[6]}:E4:4 -2`,
  v6: (l) => `-2 ${l[0]}:F#4:1 ${l[1]}:F#4:1 ${l[2]}:B4:2 ${l[3]}:A4:2 ${l[4]}:G#4:2 ${l[5]}:F#4:4 -2`,
  v5: (l) => `-2 ${l[0]}:F#4:2 ${l[1]}:B4:2 ${l[2]}:A4:2 ${l[3]}:G#4:2 ${l[4]}:F#4:4 -2`,
};
const morae = (s) => s.match(/[ぁ-ゖー][ゃゅょぁぃぅぇぉ]?/g);

// Sung kana: the particle は is written わ so it is pronounced as sung.
const verse = (lines) => [V.v7a(morae(lines[0])), V.v7b(morae(lines[1])), V.v7a(morae(lines[2])), morae(lines[3]).length === 6 ? V.v6(morae(lines[3])) : V.v5(morae(lines[3]))];

const CHORUS = [
  'しゅ:E5:1 が:E5:1 しゅ:E5:1 が:C#5:1 ぽ:E5:2 い:F#5:1 ず:E5:1 ん:C#5:4 -4',
  'ひ:D#5:2 と:D#5:1 く:E5:1 ち:F#5:2 ど:E5:2 う:D#5:4 -4',
  'あ:D#5:1 ま:D#5:1 く:E5:2 て:D#5:2 に:B4:1 が:B4:1 く:C#5:2 て:B4:2 -4',
  'と:G#4:2 ま:B4:2 れ:C#5:2 な:E5:2 い:C#5:4 -4',
  'しゅ:E5:1 が:E5:1 しゅ:E5:1 が:C#5:1 ぽ:E5:2 い:F#5:1 ず:E5:1 ん:C#5:4 -4',
  'も:F#5:2 う:F#5:2 い:E5:1 -1 か:D#5:2 い:B4:4 -4',
  'き:B4:1 み:B4:1 の:D#5:2 さ:E5:2 い:F#5:2 ご:E5:2 ま:D#5:2 で:B4:2 -2',
  'わ:F#5:2 た:E5:2 し:D#5:2 の:C#5:2 も:D#5:2 の:C#5:4 -2',
];

const PRE = [
  'と:A4:2 け:A4:2 て:C#5:2 -2 と:A4:2 け:A4:2 て:C#5:2 -2',
  'と:B4:2 け:B4:2 て:D#5:2 く:B4:2 ま:C#5:2 で:B4:4 -2',
  'ね:E5:2 -2 ね:E5:2 -2 ね:E5:2 -2 -4',
  'め:D#5:1 を:D#5:1 そ:F#5:2 ら:E5:2 さ:D#5:2 な:D#5:2 い:B4:2 で:B4:2 -2',
  'あ:A4:2 ま:A4:2 く:C#5:2 -2 あ:A4:2 ま:A4:2 く:C#5:2 -2',
  'あ:B4:2 ま:B4:2 く:D#5:2 て:B4:2 ど:C#5:2 く:B4:4 -2',
  'ね:E5:2 -2 ね:E5:2 -2 ね:E5:2 -2 -4',
  'ぜ:F#5:1 ん:F#5:1 ぶ:F#5:2 あ:E5:1 げ:E5:1 る:D#5:2 か:D#5:2 ら:B4:2 -4',
];

const BRIDGE = [
  'ほ:C#5:4 し:B4:2 い:A4:2 の:B4:4 わ:C#5:4',
  'ぜ:E5:4 ん:E5:4 ぶ:C#5:8',
  'の:C#5:2 こ:C#5:2 さ:A4:2 ず:C#5:2 ぜ:E5:2 ん:E5:2 ぶ:F#5:4',
  'ね:D#5:4 え:C5:4 -8',
];

const REST = '-16';
const HOOK = CHORUS[0];

// Chord cycles (one chord per bar).
const CH = { chorus: ['A', 'B', 'G#m', 'C#m'], verse: ['C#m', 'A', 'E', 'B'], pre: ['F#m', 'G#m', 'A', 'B'], bridge: ['A', 'A', 'F#m', 'G#'] };

export const sections = [
  { name: 'intro', level: [0.55, 0.8], bars: 8, chords: CH.chorus, drums: 'intro', bass: 'chorus', bassFrom: 4, stabs: false, pad: true, riff: true },
  { name: 'verse1', level: [0.6, 0.65], bars: 16, chords: CH.verse, drums: 'verse', bass: 'verse', pad: true,
    vocal: [...verse(['よるのまんなか', 'くちびるひとつ', 'あかいまばたき', 'あいずにして']),
            ...verse(['やさしいふりが', 'いちばんこわい', 'ぬるいこたえわ', 'いらないの']),
            ...verse(['しろいゆびさき', 'ほどいたらもう', 'あまいにおいに', 'しずんでくの']),
            ...verse(['だいじょうぶだと', 'わらうふりして', 'ほんとわぜんぶ', 'みえてるの'])] },
  { name: 'pre1', level: [0.7, 0.95], bars: 8, chords: CH.pre, drums: 'pre', bass: 'pre', stabs: true, riser: true, vocal: PRE },
  { name: 'chorus1', level: [1, 1], bars: 16, chords: CH.chorus, drums: 'chorus', bass: 'chorus', stabs: true, pad: true, riffLow: true, impact: true, double: true, vocal: [...CHORUS, ...CHORUS] },
  { name: 'post1', level: [1, 1], bars: 8, chords: CH.chorus, drums: 'chorus', bass: 'chorus', stabs: true, riff: true, vocal: [HOOK, REST, REST, REST, HOOK, REST, REST, REST] },
  { name: 'verse2', level: [0.62, 0.66], bars: 8, chords: CH.verse, drums: 'verse', bass: 'verse', pad: true,
    vocal: [...verse(['くびすじなぞる', 'ゆびのさきまで', 'かんだあとまで', 'あいしてるの']),
            ...verse(['にげてもむだよ', 'よるわながいの', 'あさがくるまで', 'はなさない'])] },
  { name: 'pre2', level: [0.7, 0.95], bars: 8, chords: CH.pre, drums: 'pre', bass: 'pre', stabs: true, riser: true, vocal: PRE },
  { name: 'chorus2', level: [1, 1], bars: 16, chords: CH.chorus, drums: 'chorus', bass: 'chorus', stabs: true, pad: true, riffLow: true, impact: true, double: true, vocal: [...CHORUS, ...CHORUS] },
  { name: 'bridge', level: [0.45, 0.9], bars: 8, chords: CH.bridge, drums: 'bridge', bass: 'long', pad: true, riserLast: 4, vocal: [...BRIDGE, REST, REST, REST, REST] },
  { name: 'chorus3', level: [1, 1], bars: 16, chords: CH.chorus, drums: 'chorus', bass: 'chorus', stabs: true, pad: true, riff: true, impact: true, double: true, vocal: [...CHORUS, ...CHORUS] },
  { name: 'outro', level: [0.9, 0.6], bars: 4, chords: CH.chorus, drums: 'outro', bass: 'chorus', riff: true, pad: true, vocal: [REST, CHORUS[5], REST, REST] },
];

export const lyrics = {
  verse1: 'よるのまんなか くちびるひとつ / あかいまばたき あいずにして / やさしいふりが いちばんこわい / ぬるいこたえは いらないの / しろいゆびさき ほどいたらもう / あまいにおいに しずんでくの / だいじょうぶだと わらうふりして / ほんとはぜんぶ みえてるの',
  pre: 'とけて とけて とけてくまで / ね ね ね めをそらさないで / あまく あまく あまくてどく / ね ね ね ぜんぶあげるから',
  chorus: 'シュガシュガ ポイズン ひとくちどう / あまくて にがくて とまれない / シュガシュガ ポイズン もういっかい / きみのさいごまで わたしのもの',
  verse2: 'くびすじなぞる ゆびのさきまで / かんだあとまで あいしてるの / にげてもむだよ よるはながいの / あさがくるまで はなさない',
  bridge: 'ほしいのは ぜんぶ / のこさず ぜんぶ / ねえ',
  outro: 'もういっかい',
};
