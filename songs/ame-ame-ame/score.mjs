// 「あめ あめ あめ。」 — yuru-kawaii talk-voice duet (歌うソフトウェアトーク), after the spirit of
// インゲン「カニ カニ カニ。」 (two sisters' call-and-response, a deadpan triple-word hook, a slack cute
// mood). Words, melody and arrangement are original. Candy (飴) falls from a pink sky; ずんだもん wants
// all of it, つむぎ warns about cavities — the "sweet poison" of the earlier drafts, made cute.
//
// Talk voices sing well only in their measured ranges (steady-note test): つむぎ C#4–A4, ずんだもん A4–D#5,
// so つむぎ takes the low line and ずんだもん the high one. Notes over ~0.24 s are split into "ー" morae.

export const meta = {
  title: 'あめ あめ あめ。',
  version: 1,
  bpm: 128,
  key: 'A major',
  vocalMode: 'talk',
  singers: {
    a: { name: '春日部つむぎ', talkStyle: 8, singStyle: 3008, pan: -0.2 },
    z: { name: 'ずんだもん', talkStyle: 3, singStyle: 3003, pan: 0.2 },
  },
  voice: { style: 3008, name: '春日部つむぎ・ずんだもん', styleName: 'トーク歌唱' },
};

// ---- chorus (8 bars): ずんだもん's deadpan hook, つむぎ answers, both sing the sweet line ----
const chorus = (o) => ({
  z: [
    [o + 0, 'あ:C#5:2 め:A4:2 あ:C#5:2 め:A4:2 あ:C#5:2 め:A4:2'],
    [o + 32, 'あ:C#5:2 ま:C#5:2 い:A4:2 -2 あ:B4:2 ま:B4:2 い:A4:2 -2 | あ:A4:2 め:A4:2'],
    [o + 64, 'あ:C#5:2 め:A4:2 あ:C#5:2 め:A4:2 あ:C#5:2 め:A4:2'],
    [o + 96, 'ぜ:C#5:2 ん:C#5:2 ぶ:A4:2 -2 ほ:B4:2 し:B4:2 い:C#5:2 の:B4:2 | だ:A4:4'],
  ],
  a: [
    [o + 18, 'ふ:E4:2 り:F#4:2 だ:G#4:2 し:A4:2 た:E4:4'],
    [o + 32, 'あ:A4:2 ま:A4:2 い:F#4:2 -2 あ:G#4:2 ま:G#4:2 い:F#4:2 -2 | あ:F#4:2 め:F#4:2'],
    [o + 82, 'こ:E4:2 ろ:E4:2 こ:F#4:2 ろ:F#4:2 こ:G#4:2 ろ:A4:2 ん:E4:2'],
    [o + 114, 'む:E4:2 し:E4:2 ば:F#4:2 に:E4:2 な:F#4:2 る:E4:2 よ:C#4:2'],
  ],
});
const twice = (f) => {
  const x = f(0);
  const y = f(128);
  return { z: [...x.z, ...y.z], a: [...x.a, ...y.a] };
};
const CHORUS = twice(chorus);

// ---- verses: つむぎ wonders, ずんだもん answers with 〜なのだ ----
const VERSE1 = {
  a: [
    [2, 'ま:F#4:2 ど:F#4:2 を:E4:2 あ:F#4:2 け:A4:2 た:G#4:2 ら:E4:4'],
    [22, 'そ:E4:2 ら:F#4:2 が:G#4:2 ぴ:A4:2 ん:A4:2 く:E4:4'],
    [66, 'て:E4:2 の:F#4:2 ひ:G#4:2 ら:A4:2 に:G#4:2 こ:E4:1 ろ:E4:1 ん:C#4:4'],
    [104, 'も:E4:2 う:F#4:2 ひ:G#4:2 と:A4:2 つ:G#4:2 こ:E4:1 ろ:E4:1 ん:C#4:4'],
    [146, 'ね:A4:2 え:G#4:2 こ:F#4:2 れ:E4:2 ゆ:F#4:2 め:G#4:2 か:A4:2 な:A4:4'],
    [194, 'ほ:E4:2 ほ:F#4:2 が:G#4:2 と:A4:2 け:G#4:2 そ:F#4:2 う:E4:4'],
    [236, 'せ:E4:2 え:E4:2 の:A4:4'],
  ],
  z: [
    [38, 'な:A4:2 に:B4:2 か:C#5:2 ふ:B4:2 る:A4:2 の:B4:2 だ:A4:4'],
    [84, 'い:A4:2 ち:A4:2 ご:B4:2 あ:C#5:2 じ:C#5:2 な:B4:2 の:A4:2 だ:B4:4'],
    [122, 'め:A4:2 ろ:A4:2 ん:B4:2 あ:C#5:2 じ:C#5:2 な:B4:2 の:A4:2 だ:B4:4'],
    [168, 'ゆ:A4:2 め:B4:2 で:C#5:2 も:B4:2 い:A4:2 い:B4:2 の:C#5:2 だ:A4:4'],
    [216, 'ほ:A4:2 ほ:B4:2 が:C#5:2 お:B4:2 ち:A4:2 そ:B4:2 う:C#5:4'],
    [236, 'せ:A4:2 え:A4:2 の:C#5:4'],
  ],
};
const VERSE2 = {
  a: [
    [2, 'ぼ:E4:2 う:F#4:2 し:G#4:2 に:A4:2 い:G#4:2 れ:F#4:2 よ:E4:2 う:E4:2'],
    [40, 'あ:E4:2 た:F#4:2 ま:A4:4 い:G#4:2 い:F#4:2 ね:E4:4'],
    [80, 'ゆ:E4:2 う:F#4:2 が:G#4:2 た:A4:2 ま:G#4:2 で:E4:4'],
    [120, 'せ:E4:2 え:E4:2 の:A4:4'],
  ],
  z: [
    [20, 'か:A4:2 さ:A4:2 を:B4:2 さ:C#5:2 か:B4:2 さ:A4:2 に:B4:4'],
    [60, 'そ:A4:2 う:B4:2 な:C#5:2 の:B4:2 だ:A4:4'],
    [98, 'ひ:A4:2 ろ:A4:2 い:B4:2 あ:C#5:2 つ:B4:2 め:A4:2 る:B4:2 の:C#5:2 だ:A4:4'],
    [120, 'せ:A4:2 え:A4:2 の:C#5:4'],
  ],
};
// ---- bridge: a little argument over one candy, settled by sharing ----
const BRIDGE = {
  a: [
    [0, 'ね:A4:2 え:G#4:2 ず:F#4:2 ん:F#4:2 だ:E4:2 も:F#4:2 ん:E4:4'],
    [40, 'ひ:E4:2 と:F#4:2 つ:G#4:4 わ:A4:2 け:G#4:2 て:F#4:4'],
    [84, 'え:F#4:4 え:E4:4'],
    [112, 'は:E4:2 ん:E4:2 ぶ:F#4:2 ん:G#4:2 こ:A4:6'],
  ],
  z: [
    [20, 'な:B4:2 ん:B4:2 な:A4:2 の:B4:2 だ:C#5:4'],
    [64, 'だ:C#5:2 め:C#5:2 な:B4:2 の:A4:2 だ:A4:2'],
    [96, 'じょ:A4:2 う:B4:2 だ:C#5:2 ん:B4:2 な:A4:2 の:B4:2 だ:A4:2'],
    [112, 'は:A4:2 ん:A4:2 ぶ:B4:2 ん:B4:2 こ:C#5:6'],
  ],
};
// ---- outro: the hook slowed down, then 「ごちそうさま」 ----
const OUTRO = {
  z: [
    [0, 'あ:C#5:2 め:A4:2 -4 あ:C#5:2 め:A4:2 -4 | あ:C#5:2 め:A4:2'],
    [40, 'お:A4:2 な:B4:2 か:C#5:2 ま:B4:2 ん:A4:2 ぷ:A4:2 く:B4:2 な:C#5:2 の:B4:2 だ:A4:6'],
  ],
  a: [
    [0, 'あ:A4:2 め:E4:2 -4 あ:A4:2 め:E4:2 -4 | あ:A4:2 め:E4:2'],
    [68, 'ご:E4:2 ち:F#4:2 そ:G#4:2 う:A4:2 さ:G#4:2 ま:E4:6'],
  ],
};

// music box: the hook an octave up (token syntax; lyrics are ignored)
const BOX = 'x:C#6:2 x:A5:2 x:C#6:2 x:A5:2 x:C#6:2 x:A5:2 -4 | x:A5:2 x:B5:2 x:C#6:2 x:B5:2 x:A5:4 -4';
const INTRO_BOX = [[0, BOX], [64, BOX]];
const OUTRO_BOX = [[96, BOX]];

const CH = {
  chorus: ['Aadd9', 'E', 'F#m7', 'Dmaj7'],
  verse: ['Dmaj7', 'E', 'C#m7', 'F#m7'],
  bridge: ['Bm7', 'E', 'C#m7', 'F#m7'],
  outro: ['Dmaj7', 'E', 'Aadd9', 'Aadd9'],
};

const base = { comp: 'marimba', bass: 'bounce', bassSynth: 'round', phrases: true, duet: true };
export const sections = [
  { ...base, name: 'intro', level: [0.7, 0.85], bars: 8, chords: CH.chorus, drums: 'yuruBreak', toys: 'verse', bellPhrases: INTRO_BOX, whistle: 'up', duet: false },
  { ...base, name: 'verse1', level: [0.75, 0.8], bars: 16, chords: CH.verse, drums: 'yuruVerse', toys: 'verse', vocal: VERSE1 },
  { ...base, name: 'chorus1', level: [1, 1], bars: 16, chords: CH.chorus, drums: 'yuruChorus', pad: true, bells: 'arp', toys: 'chorus', vocal: CHORUS },
  { ...base, name: 'inter', level: [0.9, 0.9], bars: 4, chords: CH.chorus, drums: 'yuruBreak', riff: true, riffSynth: 'chip', toys: 'drop', whistle: 'down', duet: false },
  { ...base, name: 'verse2', level: [0.75, 0.8], bars: 8, chords: CH.verse, drums: 'yuruVerse', toys: 'verse', vocal: VERSE2 },
  { ...base, name: 'chorus2', level: [1, 1], bars: 16, chords: CH.chorus, drums: 'yuruChorus', pad: true, bells: 'arp', toys: 'chorus', vocal: CHORUS },
  { ...base, name: 'bridge', level: [0.7, 0.8], bars: 8, chords: CH.bridge, drums: 'yuruBreak', pad: true, toys: 'verse', whistle: 'up', vocal: BRIDGE },
  { ...base, name: 'chorus3', level: [1, 1], bars: 16, chords: CH.chorus, drums: 'yuruChorus', pad: true, bells: 'arp', riff: true, riffSynth: 'chip', toys: 'chorus', vocal: CHORUS },
  { ...base, name: 'outro', level: [0.8, 0.6], bars: 8, chords: CH.outro, drums: 'none', bass: undefined, pad: true, toys: 'outro', bellPhrases: OUTRO_BOX, vocal: OUTRO },
];

export const lyrics = {
  verse1: '(つ) まどを あけたら / そらが ぴんく　(ず) なにか ふるのだ / (つ) てのひらに ころん　(ず) いちご あじ なのだ / (つ) もう ひとつ ころん　(ず) めろん あじ なのだ / (つ) ねえ これ ゆめかな　(ず) ゆめでも いいのだ / (つ) ほほが とけそう　(ず) ほほが おちそう / (ふたり) せーの',
  chorus: '(ず) あめ あめ あめ。　(つ) ふりだした / (ふたり) あまい あまい あめ / (ず) あめ あめ あめ。　(つ) ころころ ころん / (ず) ぜんぶ ほしいのだ　(つ) むしばに なるよ',
  verse2: '(つ) ぼうしに いれよう　(ず) かさを さかさに / (つ) あたま いいね　(ず) そうなのだ / (つ) ゆうがたまで　(ず) ひろいあつめるのだ / (ふたり) せーの',
  bridge: '(つ) ねえ ずんだもん　(ず) なんなのだ / (つ) ひとつ わけて　(ず) だめなのだ / (つ) えー　(ず) じょうだんなのだ / (ふたり) はんぶんこ',
  outro: '(ふたり) あめ あめ あめ。 / (ず) おなか まんぷく なのだ　(つ) ごちそうさま',
};
