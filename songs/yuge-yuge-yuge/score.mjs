// 「ゆげ ゆげ ゆげ。」 — お風呂の歌。探索「ふたりの音」の評価から組み立てた 1 曲（specs/song-yuge-yuge-yuge.md）。
//
// ユーザーのメモ（ゆめごこち ★5）:「お風呂で歌っているみたい。心地よい鼻歌から、歌詞の無い楽器のメロディ、そこに
// ずんだが加わって、桶をたたく音やお風呂を沸かすボタンのピッという音など、音が自然に加わって音楽を形作っていく」。
// → しずくと「ピッ」だけの浴室 → つむぎの鼻歌 → トイピアノが同じ節を言葉なしで → 桶が鳴りはじめ、ずんだもんが「ざぶん」と入る
// → 1 語ずつ交互（★5）にウクレレ（★5）が加わって踊れる → さわり「ゆげ ゆげ ゆげ。」にこだまと 3 度（★4）
// → 間奏はピッとしずくが旋律になる → 最後は 3 度で重なって最後の 1 音だけユニゾン（★4）→ 鼻歌としずくに戻る。
// 音響は「ゆめごこち」（深いリバーブ・ゆっくり深いトレモロ）。ウクレレだけはリバーブとトレモロに入れず、ノリを前に出す。
//
// 声は測定済みの音域内（つむぎ C#4–A4、ずんだもん A4–D#5）。無声化しやすい「無声子音＋い/う」（し・ふ・く・す・つ…）は
// ずんだもんの言葉では避けた（探索の「1 語ずつ交互」で 9–13 dB 沈んだ音）。鼻歌の「ふ」は検査で問題なし。

import { harmonyBelow, transpose } from '../../src/song/tokens.mjs';

const BPM = 128;

export const meta = {
  title: 'ゆげ ゆげ ゆげ。',
  version: 1,
  bpm: BPM,
  key: 'A major',
  vocalMode: 'talk',
  singers: {
    a: { name: '春日部つむぎ', talkStyle: 8, singStyle: 3008, pan: -0.2, heta: { bias: -15, timingMs: 15 } },
    z: { name: 'ずんだもん', talkStyle: 3, singStyle: 3003, pan: 0.2, heta: { bias: 10, highBias: 25, highKey: 73, timingMs: -15 } },
  },
  voice: { style: 3008, name: '春日部つむぎ・ずんだもん', styleName: 'トーク歌唱' },
  // 「ゆめごこち」の音響（explore-duo の fluffy-3）に、お風呂の音（しずく・桶・ピッ）とトイピアノを同じ浴室に入れる
  mix: {
    stemDb: { clap: -25, shaker: -34, lightKick: -17, bell: -27, guide: -35, uke: -23, toyPiano: -23, drip: -27, bucket: -23, beep: -31 },
    tremolo: { stems: ['vibes', 'bell', 'guide', 'pad'], rateHz: BPM / 120, depth: 0.8 },
    chorus: { stems: ['pad', 'vibes', 'bell'], delayMs: 18, depthMs: 7, rateHz: 0.35, mix: 0.7 },
    vocalChorus: { delayMs: 14, depthMs: 4, rateHz: 0.3, mix: 0.4 },
    vocalReverb: 1.1,
    vocalRoom: 0.95,
    vocalDamp: 0.65,
    vocalPredelayMs: 60,
    instReverb: 1.0,
    instRoom: 0.95,
    instDamp: 0.5,
    reverbStems: ['vibes', 'bell', 'pad', 'toyPiano', 'drip', 'bucket', 'beep'],
    airDb: -5,
  },
};

const CH = {
  rock: ['Aadd9', 'Dmaj7'], // ゆらゆら: I と IV を 1 小節ずつ
  verse: ['Dmaj7', 'E', 'C#m7', 'F#m7'],
  hook: ['Aadd9', 'E', 'F#m7', 'Dmaj7'],
  tile: ['Bm7', 'E'],
  end: ['Dmaj7', 'E', 'Aadd9', 'Aadd9'],
};

// ---- 浴室: しずく（A のペンタトニックに調律）とパネルの「ピッ」 ------------------------------------------
const DRIPS_SPARSE = [[6, 'x:E6:2'], [27, 'x:A5:2'], [44, 'x:C#6:2'], [58, 'x:F#6:2']]; // 4 小節に 4 粒、拍に乗らない
const dripsLoose = (bars) => Array.from({ length: bars / 4 }, (_, k) => DRIPS_SPARSE.map(([at, t]) => [at + 64 * k, t])).flat();
// 後半: しずくが 8 分の裏に乗って刻みになる
const dripsOnBeat = (bars) => Array.from({ length: bars }, (_, b) => [[b * 16 + 2, 'x:E6:2'], [b * 16 + 10, b % 2 ? 'x:C#6:2' : 'x:A5:2']]).flat();

// ---- つむぎの鼻歌（2 小節ずつ、間をたっぷり）-----------------------------------------------------------
const HUM_1 = 'ふ:E4:2 ん:E4:2 ふ:F#4:2 ん:F#4:2 ふ:A4:2 ふ:G#4:2 ~:F#4:2 ん:E4:4';
const HUM_2 = 'ふ:A4:2 ん:G#4:2 ふ:F#4:2 ん:E4:2 ふ:F#4:2 ふ:A4:2 ~:G#4:2 ん:F#4:4';
const HUM_3 = 'ふ:A4:2 ん:G#4:2 ふ:F#4:2 ん:E4:2 ふ:C#4:2 ふ:E4:2 ~:E4:2 ん:E4:4';
// hummed under the breath: 2.5 dB under the sung lines, so the bathroom is heard around it
const SOFT = { gain: 0.75 };
const HUM = { a: [[0, HUM_1, SOFT], [32, HUM_2, SOFT], [64, HUM_1, SOFT], [96, HUM_3, SOFT]] };

// ---- トイピアノが節を言葉なしで（さわりの形を先取り）、つむぎが「ふふーん」と相づち ------------------------
const TOY_CALL = 'x:C#6:2 x:A5:2 -2 x:C#6:2 x:A5:2 -2 x:C#6:2 x:A5:2 | x:B5:2 x:C#6:2 x:B5:2 x:A5:2 x:F#5:4';
const TOY_LINE = [[0, TOY_CALL], [64, TOY_CALL]];
const TOY_HUM = { a: [[38, 'ふ:E4:2 ふ:F#4:2 ~:E4:2 ん:E4:4', SOFT], [102, 'ふ:F#4:2 ふ:G#4:2 ~:A4:2 ん:A4:4', SOFT]] };

// ---- ずんだもんが入ってくる（フレーズ単位の問いと返事）----------------------------------------------------
const ENTER = {
  z: [
    [0, 'ざ:A4:2 ぶ:B4:2 ん:C#5:2 な:B4:2 の:A4:2 だ:A4:4'],
    [36, 'あ:B4:2 わ:C#5:2 あ:B4:2 わ:A4:2 な:B4:2 の:C#5:2 だ:B4:2'],
    [64, 'あ:A4:2 わ:B4:2 で:C#5:2 あ:B4:2 ら:A4:2 う:B4:2 の:A4:2 だ:A4:2'],
    [98, 'め:C#5:2 お:B4:2 と:A4:2 じ:B4:2 る:C#5:2 の:B4:2 だ:A4:2'],
    [116, 'せ:A4:2 え:A4:2 の:C#5:4'],
  ],
  a: [
    [16, 'お:E4:2 ゆ:F#4:2 が:G#4:2 こ:A4:2 ぼ:G#4:2 れ:F#4:2 た:E4:4'],
    [52, 'ほ:A4:2 わ:G#4:2 ほ:F#4:2 わ:E4:2 だ:F#4:2 ね:E4:2'],
    [82, 'め:E4:2 に:F#4:2 は:G#4:2 い:A4:2 る:G#4:2 よ:E4:4'],
    [116, 'せ:E4:2 え:E4:2 の:A4:4'],
  ],
};

// ---- 1 語ずつ交互（半小節ごとに言葉を渡す）＋ウクレレ ---------------------------------------------------
const VERSE = {
  a: [
    [0, 'あ:F#4:2 わ:A4:2 お:F#4:2'],
    [16, 'あ:E4:2 わ:G#4:2 が:F#4:2'],
    [32, 'お:E4:2 で:G#4:2 こ:E4:2 に:E4:2'],
    [48, 'か:A4:2 ん:A4:2 む:G#4:2 り:F#4:2'],
    [64, 'に:F#4:2 あ:A4:2 う:F#4:2 ね:E4:2'],
    [80, 'お:E4:2 な:F#4:2 じ:A4:2'],
    [96, 'ゆ:E4:2 げ:G#4:2 が:E4:2'],
    [112, 'て:A4:2 ん:A4:2 じょ:G#4:2 う:F#4:2'],
  ],
  z: [
    [6, 'た:A4:2 て:B4:2 る:C#5:2 の:B4:2 だ:A4:2'],
    [22, 'も:B4:2 こ:C#5:2 も:B4:2 こ:B4:2'],
    [40, 'の:B4:2 せ:C#5:2 る:B4:2'],
    [56, 'な:A4:2 の:B4:2 だ:C#5:2'],
    [72, 'お:A4:2 う:B4:2 さ:C#5:2 ま:B4:2'],
    [88, 'な:B4:2 の:C#5:2 だ:B4:2'],
    [102, 'の:B4:2 ぼ:C#5:2 る:B4:2 の:A4:2 だ:B4:2'],
    [120, 'ま:A4:2 で:C#5:2'],
  ],
};

// ---- さわり「ゆげ ゆげ ゆげ。」: ずんだもんの淡々とした 3 回、つむぎが 4 度下でこだまを返し、後半は 3 度で重なる ----
const YUGE = 'ゆ:C#5:2 げ:A4:2 ゆ:C#5:2 げ:A4:2 ゆ:C#5:2 げ:A4:2';
const MADO = 'ま:C#5:2 ど:B4:2 が:A4:2 ぼ:B4:2 ん:B4:2 や:C#5:2 り:A4:4';
const NOBOSE = 'の:C#5:2 ぼ:B4:2 せ:A4:2 そ:B4:2 う:C#5:2 な:B4:2 の:A4:2 だ:A4:4';
const below = (t) => harmonyBelow(t, { maxPitch: 'A4' });
const echo = (at) => [at, transpose('ゆ:C#5:2 げ:A4:2', -5), { gain: 0.7 }]; // the last ゆげ, a fourth down, softer
const HOOK = {
  z: [[0, YUGE], [32, MADO], [64, YUGE], [96, NOBOSE]],
  a: [
    echo(13),
    [20, 'ほ:G#4:2 わ:F#4:2 ほ:E4:2 わ:E4:2'],
    [32, below(MADO)],
    echo(77),
    [84, 'ぬ:G#4:2 く:F#4:2 ぬ:E4:2 く:E4:2'],
    [96, below(NOBOSE)],
  ],
};
// 2 回目: こだまの代わりに最初から 3 度で重なる
const HOOK2 = {
  z: [[0, YUGE], [32, MADO], [64, YUGE], [96, NOBOSE]],
  a: [[0, below(YUGE)], [20, 'ほ:G#4:2 わ:F#4:2 ほ:E4:2 わ:E4:2'], [32, below(MADO)], [64, below(YUGE)], [84, 'ぬ:G#4:2 く:F#4:2 ぬ:E4:2 く:E4:2'], [96, below(NOBOSE)]],
};

// ---- 間奏: ピッとしずくがさわりの形を弾く、つむぎが鼻歌で少し ---------------------------------------------
const TILE_BEEP = [[0, 'x:C#6:2 x:A5:2 x:C#6:2 x:A5:2 x:C#6:2 x:A5:2'], [32, 'x:C#6:2 x:A5:2 x:C#6:2 x:A5:2 x:C#6:2 x:B5:2 -2 x:A5:4']];
const TILE_HUM = { a: [[20, 'ふ:G#4:2 ん:F#4:2 ふ:E4:2 ん:E4:2', SOFT], [52, 'ふ:G#4:2 ん:A4:2 ふ:G#4:2 ん:F#4:2', SOFT]] };

// ---- おわり: 「あがろうか」「まだ はいるのだ」→ 二人で「ゆげ ゆげ ゆげ。」を 3 度で、最後の 1 音だけ同じ音 ---------
const LAST_Z = 'ゆ:C#5:2 げ:A4:2 ゆ:C#5:2 げ:A4:2 ゆ:C#5:2 げ:A4:4';
const LAST_A = `${below('ゆ:C#5:2 げ:A4:2 ゆ:C#5:2 げ:A4:2 ゆ:C#5:2')} げ:A4:4`; // the last げ: both on A4
const END = {
  a: [[0, 'あ:E4:2 が:F#4:2 ろ:A4:2 う:G#4:2 か:E4:4'], [32, LAST_A]],
  z: [[14, 'ま:A4:2 だ:B4:2 は:C#5:2 い:B4:2 る:A4:2 の:B4:2 だ:A4:2'], [32, LAST_Z]],
};
const OUTRO = { a: [[8, HUM_1, SOFT]] };

const base = { pad: true, phrases: true, duet: true };
export const sections = [
  { ...base, name: 'bath', level: [0.75, 0.85], bars: 4, chords: CH.rock, drums: 'none', duet: false,
    lines: [{ synth: 'beep', phrases: [[0, 'x:B6:1 -1 x:B6:1']], vel: 0.8 }, { synth: 'drip', phrases: dripsLoose(4), vel: 0.7 }] },
  { ...base, name: 'hum', level: [0.65, 0.7], bars: 8, chords: CH.rock, drums: 'none', comp: 'vibes', vocal: HUM,
    lines: [{ synth: 'drip', phrases: dripsLoose(8), vel: 0.6 }] },
  { ...base, name: 'toy', level: [0.8, 0.85], bars: 8, chords: CH.rock, drums: 'none', comp: 'vibes', bass: 'bounce', bassSynth: 'round', bassFrom: 4, vocal: TOY_HUM,
    lines: [{ synth: 'toyPiano', phrases: TOY_LINE, vel: 0.7, pan: 0.15 }, { synth: 'drip', phrases: dripsLoose(8), vel: 0.6 }, { synth: 'bucket', phrases: [[68, 'x:C5:2'], [100, 'x:C5:2']], vel: 0.8 }] },
  { ...base, name: 'enter', level: [0.8, 0.85], bars: 8, chords: CH.verse, drums: 'bathLight', comp: 'vibes', bass: 'bounce', bassSynth: 'round', guide: true, vocal: ENTER,
    lines: [{ synth: 'drip', phrases: dripsLoose(8), vel: 0.55 }] },
  { ...base, name: 'verse', level: [0.9, 0.9], bars: 8, chords: CH.verse, drums: 'bath', comp: ['vibes', 'uke'], bass: 'bounce', bassSynth: 'round', guide: true, vocal: VERSE,
    lines: [{ synth: 'drip', phrases: dripsOnBeat(8), vel: 0.45 }] },
  { ...base, name: 'hook', level: [1, 1], bars: 8, chords: CH.hook, drums: 'bath', comp: ['vibes', 'uke'], bass: 'bounce', bassSynth: 'round', guide: true, bells: 'arp', vocal: HOOK,
    lines: [{ synth: 'drip', phrases: dripsOnBeat(8), vel: 0.45 }] },
  { ...base, name: 'tile', level: [0.9, 0.9], bars: 4, chords: CH.tile, drums: 'bath', comp: 'uke', bass: 'bounce', bassSynth: 'round', vocal: TILE_HUM,
    lines: [{ synth: 'beep', phrases: TILE_BEEP, vel: 0.8 }, { synth: 'toyPiano', phrases: [[16, 'x:E5:2 x:F#5:2 x:A5:4'], [48, 'x:E5:2 x:F#5:2 x:B5:4']], vel: 0.6 }, { synth: 'drip', phrases: dripsOnBeat(4), vel: 0.5 }] },
  { ...base, name: 'hook2', level: [1, 1], bars: 8, chords: CH.hook, drums: 'bath', comp: ['vibes', 'uke'], bass: 'bounce', bassSynth: 'round', guide: true, bells: 'arp', vocal: HOOK2,
    lines: [{ synth: 'drip', phrases: dripsOnBeat(8), vel: 0.45 }, { synth: 'toyPiano', phrases: [[0, TOY_CALL]], vel: 0.5 }] },
  { ...base, name: 'end', level: [0.9, 0.8], bars: 4, chords: CH.end, drums: 'bathLight', comp: 'vibes', bass: 'bounce', bassSynth: 'round', guide: true, vocal: END,
    lines: [{ synth: 'drip', phrases: dripsLoose(4), vel: 0.55 }] },
  { ...base, name: 'outro', level: [0.7, 0.45], bars: 4, chords: CH.rock, drums: 'none', comp: 'vibes', vocal: OUTRO,
    lines: [{ synth: 'drip', phrases: dripsLoose(4), vel: 0.6 }, { synth: 'beep', phrases: [[60, 'x:B6:1']], vel: 0.7 }] },
];

export const lyrics = {
  hum: '(つ) ふんふん ふふーん …',
  toy: '(トイピアノ) ― (つ) ふふーん',
  enter: '(ず) ざぶん なのだ　(つ) おゆが こぼれた / (ず) あわあわ なのだ　(つ) ほわほわ だね / (ず) あわで あらうのだ　(つ) めに はいるよ / (ず) めを とじるのだ / (ふたり) せーの',
  verse: '(つ) あわを (ず) たてるのだ / (つ) あわが (ず) もこもこ / (つ) おでこに (ず) のせる / (つ) かんむり (ず) なのだ / (つ) にあうね (ず) おうさま / (つ) おなじ (ず) なのだ / (つ) ゆげが (ず) のぼるのだ / (つ) てんじょう (ず) まで',
  hook: '(ず) ゆげ ゆげ ゆげ。　(つ) ゆげ … ほわほわ / (ふたり) まどが ぼんやり / (ず) ゆげ ゆげ ゆげ。　(つ) ゆげ … ぬくぬく / (ふたり) のぼせ そうなのだ',
  end: '(つ) あがろうか　(ず) まだ はいるのだ / (ふたり) ゆげ ゆげ ゆげ。',
};
