// 「ふたりの音」探索: つむぎ × ずんだもん の短い試作（各 20 小節 ≈ 41 秒）を、方向ごとに並べて聴き比べる。
// 場面は「あまやどり」（雨の日、軒下で二人が雨がやむのを待つ）。どの試作も同じ伴奏・同じ構成・同じ音量
// （produce の master が -11 dB RMS にそろえる）で、グループごとに 1 つの要素だけを変える。
//
// 構成: intro 2 小節（Dmaj7 | E）→ a 8 小節 → b 8 小節（Aadd9 Dmaj7 Aadd9 Dmaj7 F#m7 Dmaj7 E E）→ end 2 小節（Dmaj7 | Aadd9）
// 128 BPM・A メジャー。声は測定済みの音域内: つむぎ C#4–A4、ずんだもん A4–D#5（はう F4–D#5、ニア C#4–C#5）。
// 音は 8 分中心（4 = 4 分音符は capForTalk が 8 分 + 休符にする）。
//
// 輪唱は「4 度上・1 小節遅れ」で成り立つように和音を選んだ: A→D は 4 度上の和音なので、つむぎの
// {E4 F#4 G#4 A4} の旋律を 5 半音上げたずんだもんの {A4 B4 C#5 D5} が、1 小節後の和音にそのまま乗る。

const BPM = 128;
const PROG = ['Aadd9', 'Dmaj7', 'Aadd9', 'Dmaj7', 'F#m7', 'Dmaj7', 'E', 'E'];

import { transpose, harmonyBelow } from '../../src/song/tokens.mjs';

export { transpose, harmonyBelow };
const shift = (phrases, by) => phrases.map(([at, text, flag]) => (flag ? [at + by, text, flag] : [at + by, text]));

// ---- the base call-and-response (交互): つむぎ asks in one bar, ずんだもん answers in the next ------
const BASE_A = {
  a: [
    [0, 'あ:E4:2 め:F#4:2 が:A4:2 ふ:G#4:2 る:F#4:2 ね:E4:4'],
    [32, 'の:E4:2 き:E4:2 し:F#4:2 た:A4:2 え:G#4:4'],
    [64, 'し:A4:2 と:G#4:2 し:F#4:2 と:E4:2 ふ:F#4:2 る:A4:2 よ:E4:2'],
    [96, 'と:E4:2 な:F#4:2 り:G#4:2 に:A4:2 お:G#4:2 い:F#4:2 で:E4:2'],
  ],
  z: [
    [16, 'か:A4:2 さ:B4:2 な:C#5:2 い:B4:2 の:A4:2 だ:A4:4'],
    [48, 'は:B4:2 し:C#5:2 る:B4:2 の:A4:2 だ:A4:4'],
    [80, 'さ:A4:2 む:B4:2 い:C#5:2 の:B4:2 だ:A4:4'],
    [112, 'ぬ:B4:2 く:B4:2 ぬ:C#5:2 く:B4:2 な:A4:2 の:B4:2 だ:B4:4'],
  ],
};
const BASE_B = {
  a: [
    [0, 'み:E4:2 ず:F#4:2 た:A4:2 ま:G#4:2 り:E4:4'],
    [32, 'ゆ:A4:2 ら:G#4:2 ゆ:F#4:2 ら:E4:2 ゆ:F#4:2 れ:G#4:2 て:A4:2'],
    [64, 'あ:A4:2 め:A4:2 や:G#4:2 む:F#4:2 か:E4:2 な:F#4:4'],
    [96, 'に:E4:2 じ:F#4:2 で:G#4:2 る:A4:2 か:G#4:2 な:E4:4'],
  ],
  z: [
    [16, 'か:A4:2 え:B4:2 る:C#5:2 い:D5:2 る:C#5:2 の:B4:2 だ:A4:2'],
    [48, 'チャ:C#5:2 プ:B4:2 チャ:C#5:2 プ:B4:2 な:A4:2 の:B4:2 だ:A4:2'],
    [80, 'ま:A4:2 だ:A4:2 ま:B4:2 だ:B4:2 な:C#5:2 の:B4:2 だ:A4:2'],
    [112, 'で:B4:2 た:C#5:2 ら:B4:2 い:A4:2 い:B4:2 の:C#5:2 だ:B4:2'],
  ],
};
const END_TSUMUGI = 'ふ:E4:2 た:F#4:2 り:G#4:2 で:A4:2';
const END_ZUNDA = 'あ:C#5:2 ま:B4:2 や:A4:2 ど:B4:2 り:A4:4';
const BASE_END = { a: [[0, END_TSUMUGI]], z: [[8, END_ZUNDA]] };
const BASE_VOCAL = { a: BASE_A, b: BASE_B, end: BASE_END };

// ---- 輪唱（カノン）: ずんだもんがつむぎの旋律を 4 度上・1 小節遅れで追いかける -------------------
const ROUND = [
  // section a (bars 0-7), section b (bars 8-14); every bar is one line of the round
  'し:A4:2 と:A4:2 し:G#4:2 と:F#4:2 し:E4:2 と:E4:2 し:F#4:2 と:A4:2',
  'あ:F#4:2 め:A4:2 の:F#4:2 お:E4:2 と:E4:4',
  'の:E4:2 き:F#4:2 し:A4:2 た:A4:2 で:G#4:2 ふ:F#4:2 た:E4:2 り:E4:2',
  'あ:E4:2 ま:E4:2 や:G#4:2 ど:E4:2 り:E4:4',
  'チャ:A4:2 プ:G#4:2 チャ:A4:2 プ:G#4:2 チャ:F#4:2 プ:E4:2 チャ:F#4:2 プ:A4:2',
  'み:F#4:2 ず:A4:2 た:A4:2 ま:F#4:2 り:F#4:4',
  'あ:G#4:2 め:G#4:2 が:F#4:2 や:E4:2 む:F#4:2 か:G#4:2 な:G#4:4',
  'ま:E4:2 だ:G#4:2 か:F#4:2 な:E4:4',
  'と:A4:2 な:A4:2 り:G#4:2 に:F#4:2 こ:E4:2 し:E4:2 か:F#4:2 け:A4:2',
  'み:F#4:2 ず:A4:2 の:F#4:2 お:E4:2 と:E4:4',
  'し:E4:2 と:F#4:2 し:A4:2 と:A4:2 し:G#4:2 と:F#4:2 し:E4:2 と:E4:2',
  'あ:E4:2 め:E4:2 の:G#4:2 お:E4:2 と:E4:4',
  'ふ:A4:2 た:G#4:2 り:A4:2 で:G#4:2 い:F#4:2 る:E4:2 と:F#4:2 ね:A4:2',
  'あ:F#4:2 た:A4:2 た:A4:2 か:F#4:2 い:F#4:4',
  'の:G#4:2 ん:G#4:2 び:F#4:2 り:E4:2 ま:F#4:2 と:G#4:2 う:G#4:4',
];
// 16-bar body phrases (absolute 16th positions) -> { a: {...}, b: {...} } split at bar 8
function splitBody(body) {
  const out = { a: { a: [], z: [] }, b: { a: [], z: [] } };
  for (const singer of ['a', 'z']) {
    for (const [at, text, flag] of body[singer]) {
      const half = at < 128 ? 'a' : 'b';
      const p = [half === 'a' ? at : at - 128, text];
      if (flag) p.push(flag);
      out[half][singer].push(p);
    }
  }
  return out;
}
const ROUND_BODY = splitBody({
  a: ROUND.map((line, bar) => [bar * 16, line]),
  z: ROUND.map((line, bar) => [(bar + 1) * 16, transpose(line, 5)]),
});

// ---- こだま返し: つむぎの言葉の終わりを、ずんだもんが 4 度上で 2 回、だんだん小さく返す ----------
// (the second, quieter echo starts after a rest so it stays its own phrase)
const echo = (at, text, tail2) => [
  [at, text, { gain: 0.7 }],
  [at + (tail2 ? 10 : 8), tail2 ?? text, { gain: 0.4 }],
];
const ECHO_BODY = splitBody({
  a: [...BASE_A.a, ...shift(BASE_B.a, 128)],
  z: [
    ...echo(16, 'ふ:C#5:2 る:B4:2 ね:A4:2'),
    ...echo(48, 'の:A4:2 き:A4:2 し:B4:2 た:D5:2', 'し:B4:2 た:D5:2'),
    ...echo(80, 'ふ:B4:2 る:D5:2 よ:A4:2'),
    ...echo(112, 'お:C#5:2 い:B4:2 で:A4:2'),
    ...echo(144, 'た:D5:2 ま:C#5:2 り:A4:2'),
    ...echo(176, 'ゆ:B4:2 れ:C#5:2 て:D5:2'),
    ...echo(208, 'や:C#5:2 む:B4:2 か:A4:2 な:B4:2', 'か:A4:2 な:B4:2'),
    ...echo(240, 'で:C#5:2 る:D5:2 か:C#5:2 な:A4:2', 'か:C#5:2 な:A4:2'),
  ],
});

// ---- 3 度のハモり: ずんだもんの返事に、つむぎが 3 度下（音域を外れるところは 6 度下）で重なる ----
const withHarmony = (sec) => ({ a: [...sec.a, ...sec.z.map(([at, t]) => [at, harmonyBelow(t)])].sort((p, q) => p[0] - q[0]), z: sec.z });
const HARMONY_VOCAL = { a: withHarmony(BASE_A), b: withHarmony(BASE_B), end: { a: [[0, `${END_TSUMUGI} ${harmonyBelow(END_ZUNDA)}`]], z: [[8, END_ZUNDA]] } };

// ---- 1 語ずつ交互: 半小節ごとに言葉を渡しあう -----------------------------------------------------
const HOCKET_BODY = splitBody({
  a: [
    [0, 'あ:E4:2 め:F#4:2 が:A4:2'], [16, 'か:F#4:2 さ:A4:2'], [32, 'は:E4:2 し:F#4:2 ろ:A4:2 う:G#4:2'], [48, 'や:F#4:2 す:A4:2 も:F#4:2 う:E4:2'],
    [64, 'し:A4:2 と:G#4:2 し:F#4:2 と:E4:2'], [80, 'と:E4:2 な:F#4:2 り:A4:2'], [96, 'ぬ:G#4:2 く:F#4:2 ぬ:E4:2 く:F#4:2'], [112, 'だ:F#4:2 ね:E4:2'],
    [128, 'み:E4:2 ず:F#4:2 た:A4:2 ま:G#4:2 り:E4:2'], [144, 'と:F#4:2 ん:A4:2 だ:F#4:2'], [160, 'ゆ:A4:2 ら:G#4:2 ゆ:F#4:2 ら:E4:2'], [176, 'チャ:A4:2 プ:F#4:2 チャ:A4:2 プ:F#4:2'],
    [192, 'あ:A4:2 め:G#4:2'], [208, 'ま:F#4:2 だ:E4:2'], [224, 'に:E4:2 じ:G#4:2'], [240, 'で:E4:2 た:F#4:2 ら:G#4:2'],
  ],
  z: [
    [8, 'ふ:C#5:2 る:B4:2 ね:A4:2'], [22, 'な:B4:2 い:C#5:2 の:B4:2 だ:A4:2'], [40, 'の:C#5:2 き:B4:2 し:A4:2 た:B4:2'], [56, 'よ:A4:2 い:B4:2 の:C#5:2 だ:A4:2'],
    [72, 'さ:A4:2 む:B4:2 い:C#5:2'], [88, 'く:B4:2 る:C#5:2 の:B4:2 だ:A4:2'], [104, 'ほ:B4:2 か:C#5:2 ほ:B4:2 か:A4:2'], [118, 'な:A4:2 の:B4:2 だ:B4:2'],
    [138, 'か:C#5:2 え:B4:2 る:A4:2'], [152, 'チャ:C#5:2 プ:B4:2 ン:A4:2'], [168, 'ゆ:B4:2 れ:C#5:2 る:A4:2'], [184, 'な:B4:2 の:C#5:2 だ:A4:2'],
    [198, 'や:C#5:2 む:B4:2 か:A4:2 な:B4:2'], [212, 'ま:A4:2 だ:B4:2 な:C#5:2 の:B4:2 だ:A4:2'], [230, 'で:B4:2 る:C#5:2 か:B4:2 な:A4:2'], [246, 'み:B4:2 た:C#5:2 い:B4:2 の:A4:2 だ:B4:2'],
  ],
});

// ---- 最後だけユニゾン: 最後の「ふたりで あまやどり」だけ二人が同じ音で（重なる A4 のまわり）-------
const UNISON_LINE = 'ふ:A4:2 た:A4:2 り:G#4:2 で:A4:2 あ:A4:2 ま:A4:2 や:G#4:2 ど:A4:2 り:A4:4';
const UNISON_END = { a: [[0, UNISON_LINE]], z: [[0, UNISON_LINE]] };

// ---- the shared accompaniment -------------------------------------------------------------------
const MIX = {
  stemDb: { clap: -25, shaker: -33, lightKick: -16, bell: -27, guide: -34 },
  tremolo: { stems: ['vibes', 'bell', 'guide'], rateHz: BPM / 60, depth: 0.5 },
  chorus: { stems: ['pad', 'vibes'], delayMs: 16, depthMs: 5, rateHz: 0.5, mix: 0.4 },
  vocalChorus: { delayMs: 12, depthMs: 2, rateHz: 0.35, mix: 0.18 },
  vocalReverb: 0.5,
  vocalRoom: 0.88,
  vocalDamp: 0.55,
  vocalPredelayMs: 35,
  instReverb: 0.45,
  instRoom: 0.88,
  instDamp: 0.5,
  reverbStems: ['vibes', 'bell', 'pad'],
  airDb: -2.5,
};
const SINGERS = {
  tsumugi: { name: '春日部つむぎ', talkStyle: 8, singStyle: 3008, pan: -0.2, heta: { bias: -15, timingMs: 15 } },
  zunda: { name: 'ずんだもん', talkStyle: 3, singStyle: 3003, pan: 0.2, heta: { bias: 10, highBias: 25, highKey: 73, timingMs: -15 } },
  nia: { name: '琴詠ニア', talkStyle: 74, singStyle: 3074, pan: -0.2, heta: { bias: -10, timingMs: 10 } },
  hau: { name: '雨晴はう', talkStyle: 10, singStyle: 3010, pan: 0.2, heta: { bias: 5, timingMs: -10 } },
};
const INTRO_BOX = [[0, 'x:E5:2 x:F#5:2 x:A5:2 x:G#5:2 x:F#5:2 x:E5:4 -2 | x:A5:2 x:B5:2 x:C#6:2 x:B5:2 x:A5:4']];

// One sketch's score. opts: vocal {a, b, end}, comp, rain, mix (overrides), singers {a, z}, heta per section.
function score(opts = {}) {
  const vocal = opts.vocal ?? BASE_VOCAL;
  const comp = opts.comp ?? 'vibes';
  const swap = (list) => list.map((s) => (s === 'vibes' ? comp : s));
  const base = { ...MIX, ...(opts.mix ?? {}) };
  const mix = {
    ...base,
    ...(base.tremolo ? { tremolo: { ...base.tremolo, stems: swap(base.tremolo.stems) } } : {}),
    ...(base.chorus ? { chorus: { ...base.chorus, stems: swap(base.chorus.stems) } } : {}),
    reverbStems: swap(base.reverbStems),
  };
  for (const k of Object.keys(mix)) if (mix[k] === null) delete mix[k];
  const singers = { a: SINGERS[opts.singers?.a ?? 'tsumugi'], z: SINGERS[opts.singers?.z ?? 'zunda'] };
  const heta = opts.heta ?? {};
  const sec = { comp, bass: 'bounce', bassSynth: 'round', phrases: true, duet: true, guide: true, pad: true };
  return {
    meta: {
      title: 'ふたりの音（あまやどり）',
      version: 1,
      bpm: BPM,
      key: 'A major',
      vocalMode: 'talk',
      singers,
      voice: { style: singers.a.singStyle, name: `${singers.a.name}・${singers.z.name}`, styleName: 'トーク歌唱' },
      mix,
    },
    sections: [
      { ...sec, name: 'intro', level: [0.75, 0.8], bars: 2, chords: ['Dmaj7', 'E'], drums: 'yuruBreak', bellPhrases: INTRO_BOX, duet: false, ...(opts.rain ? { rain: opts.rain, rainBars: 22 } : {}) },
      { ...sec, name: 'a', level: [0.85, 0.85], bars: 8, chords: PROG, drums: 'yuruVerse', toys: 'verse', vocal: vocal.a, heta: heta.a },
      { ...sec, name: 'b', level: [0.95, 0.95], bars: 8, chords: PROG, drums: 'yuruVerse', toys: 'verse', vocal: vocal.b, heta: heta.b },
      { ...sec, name: 'end', level: [0.85, 0.6], bars: 2, chords: ['Dmaj7', 'Aadd9'], drums: 'none', bass: undefined, toys: 'outro', vocal: vocal.end, heta: heta.end },
    ],
  };
}

// はう sings the high part: ずんだもん's 「〜のだ」 becomes 「〜のね」 (same morae, her own way of talking)
const nanoNe = (vocal) => {
  const fix = (sec) => ({ ...sec, z: sec.z.map(([at, t, f]) => [at, t.replace(/(の:\S+ )だ:/g, '$1ね:'), ...(f ? [f] : [])]) });
  return { a: fix(vocal.a), b: fix(vocal.b), end: fix(vocal.end) };
};

const G = {
  form: 'ふたりの音 · 掛け合いの型',
  timbre: 'ふたりの音 · 音色',
  fluffy: 'ふたりの音 · ほわんほわん',
  heta: 'ふたりの音 · 音痴の量',
  voices: 'ふたりの音 · 声の組み合わせ',
};
const BASE_NOTE = '交互（1 小節ずつ問いと返事）· ビブラフォン · v5 の音響 · 音痴そのまま';

// The sketches: id, group, title, what changed, and the score. Group members differ in one thing only.
export const sketches = [
  // 掛け合いの型（伴奏・音色・音響は共通）
  { id: 'form-alt', group: G.form, label: '交互', title: '交互（基準）', desc: 'つむぎが 1 小節で問い、ずんだもんが次の小節で返す', score: score() },
  { id: 'form-round', group: G.form, label: '輪唱', title: '輪唱（カノン）', desc: 'ずんだもんがつむぎの旋律を 4 度上・1 小節遅れで追いかける。同じ言葉が重なる', score: score({ vocal: { ...ROUND_BODY, end: BASE_END } }) },
  { id: 'form-echo', group: G.form, label: 'こだま', title: 'こだま返し', desc: 'つむぎの言葉の終わりを、ずんだもんが 4 度上で 2 回、小さくなりながら返す（-3 dB → -8 dB）', score: score({ vocal: { ...ECHO_BODY, end: BASE_END } }) },
  { id: 'form-third', group: G.form, label: '3度', title: '3 度のハモり', desc: 'ずんだもんの返事に、つむぎが 3 度下で重なる（音域を外れる D5 の下だけ 6 度）', score: score({ vocal: HARMONY_VOCAL }) },
  { id: 'form-hocket', group: G.form, label: '1語ずつ', title: '1 語ずつ交互', desc: '半小節ごとに言葉を渡しあう（あめが / ふるね / かさ / ないのだ …）', score: score({ vocal: { ...HOCKET_BODY, end: BASE_END } }) },
  { id: 'form-unison', group: G.form, label: 'ユニゾン', title: '最後だけユニゾン', desc: '交互のまま、最後の「ふたりで あまやどり」だけ二人が同じ音で歌う（A4 のまわり。ずんだもんの G#4 は測定音域の 1 半音下）', score: score({ vocal: { ...BASE_VOCAL, end: UNISON_END } }) },

  // 音色（歌は「交互」、ビブラフォンの役を差し替え。トレモロ・コーラス・リバーブのかけ方は同じ）
  { id: 'timbre-vibes', group: G.timbre, label: 'ビブラフォン', title: 'ビブラフォン（基準）', desc: BASE_NOTE, score: score() },
  { id: 'timbre-toypiano', group: G.timbre, label: 'トイピアノ', title: 'トイピアノ', desc: '金属棒の音（倍音 1 : 6.27 : 17.55）と木のコツン、1 音ごとに少し調子はずれ。1・3 拍目の和音を 1 オクターブ上で', score: score({ comp: 'toyPiano' }) },
  { id: 'timbre-kalimba', group: G.timbre, label: 'カリンバ', title: 'カリンバ', desc: '親指ではじく金属の舌（倍音 5.93 の「チン」）。3+3+2 の分散和音', score: score({ comp: 'kalimba' }) },
  { id: 'timbre-celesta', group: G.timbre, label: 'チェレスタ', title: 'チェレスタ', desc: 'ほぼ正弦波に 2・4 倍音を少し。1・3 拍目の和音を 1 オクターブ上で', score: score({ comp: 'celesta' }) },
  { id: 'timbre-harp', group: G.timbre, label: 'ハープ', title: 'ハープ', desc: 'Karplus–Strong の弦。1 拍目に下からのアルペジオ、3 拍目に軽く', score: score({ comp: 'harp' }) },
  { id: 'timbre-uke', group: G.timbre, label: 'ウクレレ', title: 'ウクレレ風プラック', desc: '短く明るい弦。ダウン・ダウンアップ・アップダウンアップのストローク', score: score({ comp: 'uke' }) },
  { id: 'timbre-rain', group: G.timbre, label: '雨音', title: '雨音を足す', desc: 'ビブラフォンのまま、軒先の雨（さーっという音と、ぽつ・ぴちゃの粒、毎秒約 9 粒）を全体に敷く（ビブラフォンより 5 dB 小さく）', score: score({ rain: 1, mix: { stemDb: { ...MIX.stemDb, rain: -26 } } }) },
  { id: 'timbre-tape', group: G.timbre, label: 'テープ', title: 'テープの揺れ', desc: 'ビブラフォンのまま、伴奏だけに wow（0.55 Hz ±9 セント）と flutter（6.5 Hz ±2.5 セント）。声は揺らさない', score: score({ mix: { tape: { wowHz: 0.55, wowCents: 9, flutterHz: 6.5, flutterCents: 2.5 } } }) },

  // ほわんほわんの度合い（歌・伴奏は基準と同じ。トレモロ・コーラス・リバーブだけ）
  { id: 'fluffy-0', group: G.fluffy, label: 'さっぱり', title: 'さっぱり', desc: 'トレモロ・コーラスなし、リバーブ少なめ（声 0.2 / 伴奏 0.2、room 0.75）', score: score({ mix: { tremolo: null, chorus: null, vocalChorus: null, vocalReverb: 0.2, vocalRoom: 0.75, vocalPredelayMs: 20, instReverb: 0.2, instRoom: 0.75 } }) },
  { id: 'fluffy-1', group: G.fluffy, label: 'v5', title: 'v5 と同じ（基準）', desc: 'トレモロ 2.13 Hz 深さ 0.5、コーラス 0.4、声のリバーブ 0.5（room 0.88）', score: score() },
  { id: 'fluffy-2', group: G.fluffy, label: 'ふかめ', title: 'ふかめ', desc: 'トレモロ深さ 0.7（パッドにも）、コーラス 0.55、声のコーラス 0.3、リバーブ 声 0.8 / 伴奏 0.7（room 0.92）', score: score({ mix: { tremolo: { stems: ['vibes', 'bell', 'guide', 'pad'], rateHz: BPM / 60, depth: 0.7 }, chorus: { stems: ['pad', 'vibes', 'bell'], delayMs: 16, depthMs: 6, rateHz: 0.45, mix: 0.55 }, vocalChorus: { delayMs: 12, depthMs: 3, rateHz: 0.35, mix: 0.3 }, vocalReverb: 0.8, vocalRoom: 0.92, vocalDamp: 0.6, vocalPredelayMs: 45, instReverb: 0.7, instRoom: 0.92 } }) },
  { id: 'fluffy-3', group: G.fluffy, label: 'ゆめごこち', title: 'ゆめごこち', desc: 'トレモロを 2 分音符（1.07 Hz）で深さ 0.8、コーラス 0.7、声のコーラス 0.4、リバーブ 声 1.1 / 伴奏 1.0（room 0.95）、高域 -5 dB', score: score({ mix: { tremolo: { stems: ['vibes', 'bell', 'guide', 'pad'], rateHz: BPM / 120, depth: 0.8 }, chorus: { stems: ['pad', 'vibes', 'bell'], delayMs: 18, depthMs: 7, rateHz: 0.35, mix: 0.7 }, vocalChorus: { delayMs: 14, depthMs: 4, rateHz: 0.3, mix: 0.4 }, vocalReverb: 1.1, vocalRoom: 0.95, vocalDamp: 0.65, vocalPredelayMs: 60, instReverb: 1.0, instRoom: 0.95, airDb: -5 } }) },

  // 音痴の量（セクションごと・キャラごとに変える）
  { id: 'heta-none', group: G.heta, label: 'そのまま', title: '外れ方そのまま（基準）', desc: '読み上げ声の外れ方を整えない', score: score() },
  { id: 'heta-mid', group: G.heta, label: '中', title: '音痴 中（全体）', desc: '--heta mid と同じ（ずれ ×0.75、±60 セントまで + キャラの癖）', score: score({ heta: { a: 'mid', b: 'mid', end: 'mid' } }) },
  { id: 'heta-warmup', group: G.heta, label: 'だんだん', title: 'だんだん慣れてくる', desc: '前半 強 → 後半 弱 → 最後の「ふたりで あまやどり」はそのまま', score: score({ heta: { a: 'strong', b: 'weak', end: 'none' } }) },
  { id: 'heta-zunda', group: G.heta, label: 'ずんだ強', title: 'ずんだもんだけ強め', desc: 'つむぎ 弱・ずんだもん 強（自信家ほど外れる）', score: score({ heta: { a: { a: 'weak', z: 'strong' }, b: { a: 'weak', z: 'strong' }, end: { a: 'weak', z: 'strong' } } }) },

  // ほかの読み上げ声との組み合わせ（下の声 / 上の声、旋律は同じ）
  { id: 'voices-tz', group: G.voices, label: 'つむぎ×ずんだ', title: 'つむぎ × ずんだもん（基準）', desc: BASE_NOTE, score: score() },
  { id: 'voices-nz', group: G.voices, label: 'ニア×ずんだ', title: '琴詠ニア × ずんだもん', desc: 'つむぎの代わりにニア（測定音域 C#4–C#5）', score: score({ singers: { a: 'nia' } }) },
  { id: 'voices-th', group: G.voices, label: 'つむぎ×はう', title: 'つむぎ × 雨晴はう', desc: 'ずんだもんの代わりにはう（F4–D#5）。「〜のだ」は「〜のね」に', score: score({ singers: { z: 'hau' }, vocal: nanoNe(BASE_VOCAL) }) },
  { id: 'voices-nh', group: G.voices, label: 'ニア×はう', title: '琴詠ニア × 雨晴はう', desc: '二人とも入れ替え。「〜のだ」は「〜のね」に', score: score({ singers: { a: 'nia', z: 'hau' }, vocal: nanoNe(BASE_VOCAL) }) },
];
