// 「ふわ ふわ ふわ。」 — a winter-night lullaby for the talk-voice duet (歌うソフトウェアトーク), the
// second song after 「あめ あめ あめ。」. The first snow falls; つむぎ and ずんだもん lay out their futons,
// listen to the snow, plan tomorrow's snowman and drift off. Words, melody and arrangement are original.
//
// Talk voices sing well only in their measured ranges (steady-note test): つむぎ C#4–A4, ずんだもん A4–D#5.
// In D major that is つむぎ D4–A4 (C#4 as a leading tone) and ずんだもん A4–D5: both have the tonic.
// At 86 BPM an 8th is 0.35 s, a little past the voices' steady length; talksing splits it into two
// morae ("ふ ー") and every phrase stays in 8ths, so nothing is held long enough to fade.

export const meta = {
  title: 'ふわ ふわ ふわ。',
  version: 1,
  bpm: 86,
  key: 'D major',
  vocalMode: 'talk',
  singers: {
    a: { name: '春日部つむぎ', talkStyle: 8, singStyle: 3008, pan: -0.2, heta: { bias: -15, timingMs: 15 } },
    z: { name: 'ずんだもん', talkStyle: 3, singStyle: 3003, pan: 0.2, heta: { bias: 10, highBias: 25, highKey: 73, timingMs: -15 } },
  },
  voice: { style: 3008, name: '春日部つむぎ・ずんだもん', styleName: 'トーク歌唱' },
  // softer and wider than あめ: a quarter-note tremolo at 86 BPM (1.43 Hz) is a slow "ほわん ほわん",
  // longer and darker reverbs (a snowy night), the music box a little forward, a heartbeat kick.
  mix: {
    stemDb: { lightKick: -23, shaker: -37, bell: -25, guide: -34, vibes: -22, pad: -24, roundBass: -18, toy: -31 },
    tremolo: { stems: ['vibes', 'bell', 'guide'], rateHz: 86 / 60, depth: 0.55 },
    chorus: { stems: ['pad', 'vibes'], delayMs: 18, depthMs: 6, rateHz: 0.4, mix: 0.45 },
    vocalChorus: { delayMs: 12, depthMs: 2, rateHz: 0.3, mix: 0.2 },
    vocalReverb: 0.6,
    vocalRoom: 0.9,
    vocalDamp: 0.6,
    vocalPredelayMs: 40,
    instReverb: 0.55,
    instRoom: 0.9,
    instDamp: 0.55,
    reverbStems: ['vibes', 'bell', 'pad'],
    airDb: -3.5,
  },
};

// ---- chorus (8 bars): ずんだもん's snow puffs, つむぎ answers, both wrap up ----
// The hook is three separate puffs, "ふわ。ふわ。ふわ。" (4+2 / 4+2 / 4 sixteenths): the rocking lilt
// of a cradle, and every puff trails off like a falling flake.
const HOOK_Z = 'ふ:D5:2 わ:B4:2 -2 ふ:D5:2 わ:B4:2 -2 ふ:D5:2 わ:A4:2';
const HOOK_A = 'ふ:F#4:2 わ:D4:2 -2 ふ:F#4:2 わ:D4:2 -2 ふ:F#4:2 わ:C#4:2'; // a sixth below, for the last chorus
const chorus = (o, { harmony = false } = {}) => ({
  z: [
    [o + 0, HOOK_Z],
    [o + 34, 'ふ:B4:2 と:B4:2 ん:A4:2 に:B4:2 く:D5:2 る:B4:2 ま:B4:2 る:A4:4'],
    [o + 64, HOOK_Z],
    [o + 96, 'ぽ:B4:2 か:B4:2 ぽ:A4:2 か:B4:2 な:D5:2 の:B4:2 だ:A4:4'],
  ],
  a: [
    ...(harmony ? [[o + 0, HOOK_A]] : []),
    [o + 18, 'ゆ:F#4:2 き:E4:2 が:F#4:2 ふ:A4:2 る:F#4:4'],
    [o + 34, 'ふ:G4:2 と:G4:2 ん:F#4:2 に:G4:2 く:A4:2 る:G4:2 ま:G4:2 る:F#4:4'],
    ...(harmony ? [[o + 64, HOOK_A]] : []),
    [o + 82, 'ま:F#4:2 ち:E4:2 が:F#4:2 ね:A4:2 む:A4:2 る:F#4:4'],
    [o + 114, 'お:E4:2 や:F#4:2 す:E4:2 み:C#4:4'],
  ],
});

// ---- verse 1 (12 bars): the first snow, futons side by side, listening ----
const VERSE1 = {
  a: [
    [2, 'ま:F#4:2 ど:E4:2 を:D4:2 み:E4:2 て:F#4:4'],
    [34, 'そ:D4:2 ら:E4:2 か:F#4:2 ら:A4:2 し:A4:2 ろ:G4:2 い:F#4:2 は:G4:2 な:D4:4'],
    [96, 'お:D4:2 ふ:E4:2 と:F#4:2 ん:F#4:2 な:G4:2 ら:A4:2 べ:G4:2 て:E4:4'],
    [136, 'み:F#4:2 み:F#4:2 を:E4:2 す:F#4:2 ま:A4:2 せ:G4:2 て:F#4:4'],
  ],
  z: [
    [18, 'な:B4:2 ん:B4:2 な:A4:2 の:B4:2 だ:D5:4'],
    [56, 'ゆ:A4:2 き:B4:2 な:D5:2 の:C#5:2 だ:B4:4'],
    [72, 'は:B4:2 つ:C#5:2 ゆ:D5:2 き:C#5:2 な:B4:2 の:A4:2 だ:B4:4'],
    [116, 'ぬ:A4:2 く:A4:2 ぬ:B4:2 く:C#5:2 な:B4:2 の:A4:2 だ:A4:4'],
    [154, 'な:A4:2 に:B4:2 か:D5:2 き:C#5:2 こ:B4:2 え:B4:2 る:A4:2 の:B4:2 だ:B4:4'],
  ],
};

// ---- verse 2 (8 bars): tomorrow's snowman — so, sleep now ----
const VERSE2 = {
  z: [
    [2, 'あ:A4:2 し:A4:2 た:B4:2 わ:C#5:2 ゆ:D5:2 き:C#5:2 だ:B4:2 る:A4:2 ま:B4:4'],
    [48, 'そ:A4:2 り:B4:2 に:D5:2 も:D5:2 の:B4:2 り:A4:2 た:A4:2 い:B4:4'],
    [90, 'ま:B4:2 だ:B4:2 ね:B4:2 な:A4:2 い:D5:2 の:B4:2 だ:B4:4'],
  ],
  a: [
    [24, 'お:D4:2 お:E4:2 き:F#4:2 く:G4:2 つ:F#4:2 く:E4:2 ろ:D4:2 う:D4:4'],
    [68, 'じゃ:F#4:2 あ:F#4:2 も:E4:2 う:F#4:2 ね:A4:2 よ:F#4:2 う:E4:2 ね:D4:4'],
    [108, 'め:D4:2 を:E4:2 と:F#4:2 じ:E4:2 て:C#4:4'],
  ],
};

// ---- bridge (8 bars): こだま返し — つむぎ sings a line of the dream, ずんだもん echoes it higher;
// then both, in thirds: 「おなじ ゆめ みよう」 ----
const BRIDGE = {
  a: [
    [0, 'ゆ:D4:2 め:F#4:2 の:E4:2 な:D4:2 か:F#4:4'],
    [32, 'そ:F#4:2 ら:F#4:2 を:E4:2 と:F#4:2 ぶ:D4:4'],
    [64, 'ゆ:E4:2 き:G4:2 の:F#4:2 は:E4:2 ら:G4:4'],
    [98, 'お:G4:2 な:G4:2 じ:F#4:2 ゆ:G4:2 め:A4:2 み:G4:2 よ:F#4:2 う:E4:4'],
  ],
  z: [
    [16, 'ゆ:A4:2 め:C#5:2 の:B4:2 な:A4:2 か:C#5:4'],
    [48, 'そ:A4:2 ら:A4:2 を:C#5:2 と:D5:2 ぶ:A4:4'],
    [80, 'ゆ:A4:2 き:C#5:2 の:B4:2 は:A4:2 ら:C#5:4'],
    [98, 'お:B4:2 な:B4:2 じ:A4:2 ゆ:B4:2 め:D5:2 み:B4:2 よ:A4:2 う:A4:4'],
  ],
};

// ---- outro (6 bars): the puffs once more in sixths, then good night ----
const OUTRO = {
  z: [
    [0, HOOK_Z],
    [42, 'お:B4:2 や:B4:2 す:A4:2 み:A4:2 な:B4:2 の:A4:2 だ:A4:4'],
  ],
  a: [
    [0, HOOK_A],
    [18, 'お:E4:2 や:F#4:2 す:A4:2 み:F#4:2 ね:E4:2 ず:E4:2 ん:D4:2 だ:E4:2 も:D4:2 ん:D4:4'],
  ],
};

// music box: the hook and つむぎ's answer two octaves up (token syntax; lyrics are ignored)
const BOX_HOOK = 'x:D6:2 x:B5:2 -2 x:D6:2 x:B5:2 -2 x:D6:2 x:A5:2';
const BOX = `${BOX_HOOK} | -2 x:F#5:2 x:E5:2 x:F#5:2 x:A5:2 x:F#5:4 -2`;
const INTRO_BOX = [[0, BOX], [32, BOX]];
const VERSE1_BOX = [[176, BOX_HOOK]]; // what they hear before the chorus answers
const INTER_BOX = [[0, BOX]];
const OUTRO_BOX = [[64, BOX_HOOK]];

const CH = {
  intro: ['Gmaj7', 'F#m7', 'Em7', 'A'],
  verse1: ['Dmaj7', 'Gmaj7', 'Dmaj7', 'Gmaj7', 'Bm7', 'Em7', 'Gmaj7', 'A', 'Dmaj7', 'Bm7', 'Em7', 'A'],
  verse2: ['Dmaj7', 'Gmaj7', 'Dmaj7', 'Gmaj7', 'Bm7', 'Em7', 'Gmaj7', 'A'],
  // IV–iii–ii–I: the roots step down like a slow sinking into sleep
  chorus: ['Gmaj7', 'F#m7', 'Em7', 'Dadd9', 'Gmaj7', 'F#m7', 'Em7', 'A'],
  inter: ['Gmaj7', 'A'],
  bridge: ['Bm7', 'F#m7', 'Gmaj7', 'Dmaj7', 'Em7', 'F#m7', 'Gmaj7', 'A'],
  outro: ['Gmaj7', 'A', 'Dmaj7', 'Bm7', 'Gmaj7', 'Dadd9'],
};

const base = { comp: 'vibes', bassSynth: 'round', phrases: true, duet: true, guide: true, pad: true, toys: 'snow', drums: 'none' };
export const sections = [
  { ...base, name: 'intro', level: [0.85, 0.95], bars: 4, chords: CH.intro, bass: 'long', bellPhrases: INTRO_BOX, duet: false },
  { ...base, name: 'verse1', level: [0.75, 0.8], bars: 12, chords: CH.verse1, bass: 'long', vocal: VERSE1, bellPhrases: VERSE1_BOX },
  { ...base, name: 'chorus1', level: [0.95, 0.95], bars: 8, chords: CH.chorus, drums: 'nenne', bass: 'sway', bells: 'arp', vocal: chorus(0) },
  { ...base, name: 'inter', level: [0.8, 0.8], bars: 2, chords: CH.inter, bass: 'long', bellPhrases: INTER_BOX, duet: false },
  { ...base, name: 'verse2', level: [0.75, 0.8], bars: 8, chords: CH.verse2, bass: 'long', vocal: VERSE2 },
  { ...base, name: 'chorus2', level: [0.95, 0.95], bars: 8, chords: CH.chorus, drums: 'nenne', bass: 'sway', bells: 'arp', vocal: chorus(0) },
  { ...base, name: 'bridge', level: [0.7, 0.8], bars: 8, chords: CH.bridge, bass: 'long', bells: 'arp', vocal: BRIDGE },
  { ...base, name: 'chorus3', level: [1, 1], bars: 8, chords: CH.chorus, drums: 'nenne', bass: 'sway', bells: 'arp', vocal: chorus(0, { harmony: true }) },
  { ...base, name: 'outro', level: [0.8, 0.5], bars: 6, chords: CH.outro, toys: 'outro', bellPhrases: OUTRO_BOX, vocal: OUTRO },
];

export const lyrics = {
  verse1: '(つ) まどを みて　(ず) なんなのだ / (つ) そらから しろい はな　(ず) ゆきなのだ はつゆき なのだ / (つ) おふとん ならべて　(ず) ぬくぬく なのだ / (つ) みみを すませて　(ず) なにか きこえるのだ',
  chorus: '(ず) ふわ。ふわ。ふわ。　(つ) ゆきが ふる / (ふたり) ふとんに くるまる / (ず) ふわ。ふわ。ふわ。　(つ) まちが ねむる / (ず) ぽかぽか なのだ　(つ) おやすみ',
  verse2: '(ず) あしたわ ゆきだるま　(つ) おおきく つくろう / (ず) そりにも のりたい　(つ) じゃあ もう ねようね / (ず) まだ ねないのだ　(つ) めを とじて',
  bridge: '(つ) ゆめの なか　(ず) ゆめの なか / (つ) そらを とぶ　(ず) そらを とぶ / (つ) ゆきの はら　(ず) ゆきの はら / (ふたり) おなじ ゆめ みよう',
  chorus3: '(ふたり) ふわ。ふわ。ふわ。（つむぎが 6 度下で重ねる）ほかは chorus と同じ',
  outro: '(ふたり) ふわ。ふわ。ふわ。 / (つ) おやすみね ずんだもん　(ず) おやすみ なのだ',
};
