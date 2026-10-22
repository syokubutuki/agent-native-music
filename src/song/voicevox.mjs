// Thin client for the VOICEVOX engine's singing API (engine >= 0.16, verified on 0.25.2).
// Flow: score (notes with MIDI key, frame length, kana lyric) -> /sing_frame_audio_query with the
// "sing" teacher style (expression: f0, volume, phoneme timing) -> optional f0 edits -> /frame_synthesis
// with any "frame_decode" style (the voice). Frames are 256 samples at 24 kHz = 93.75 frames/s.

export const DEFAULT_ENGINE = process.env.VOICEVOX_URL ?? 'http://127.0.0.1:50021';
export const TEACHER_STYLE = 6000; // 波音リツ (sing)
export const FRAME_RATE = 24000 / 256;

async function post(engine, path, params, body, retry = 1) {
  const url = `${engine}${path}?${new URLSearchParams(params)}`;
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch (err) {
    if (retry > 0) return post(engine, path, params, body, retry - 1); // dropped keep-alive socket: try once more
    throw err;
  }
  if (!res.ok) throw new Error(`VOICEVOX ${path} ${res.status}: ${await res.text()}`);
  return res;
}

export async function singers(engine = DEFAULT_ENGINE) {
  const res = await fetch(`${engine}/singers`);
  if (!res.ok) throw new Error(`VOICEVOX /singers ${res.status}`);
  return res.json();
}

// notes: [{ key: midi|null, beats, lyric }] -> engine score. Frame boundaries are rounded from absolute
// time so rounding never accumulates drift against the instrumental grid. VOICEVOX requires a leading rest.
export function toScore(notes, bpm, { leadBeats = 1 } = {}) {
  const secPerBeat = 60 / bpm;
  const out = [];
  let t = 0;
  const push = (key, beats, lyric) => {
    const a = Math.round(t * secPerBeat * FRAME_RATE);
    t += beats;
    const b = Math.round(t * secPerBeat * FRAME_RATE);
    out.push({ key, frame_length: Math.max(1, b - a), lyric });
  };
  push(null, leadBeats, '');
  for (const n of notes) push(n.key ?? null, n.beats, n.key == null ? '' : n.lyric);
  push(null, 1, '');
  return { notes: out };
}

export async function singQuery(score, { engine = DEFAULT_ENGINE, teacher = TEACHER_STYLE } = {}) {
  return (await post(engine, '/sing_frame_audio_query', { speaker: teacher }, score)).json();
}

export async function frameSynthesis(query, speaker, { engine = DEFAULT_ENGINE } = {}) {
  return Buffer.from(await (await post(engine, '/frame_synthesis', { speaker }, query)).arrayBuffer());
}

// Per-frame index of the score note each frame belongs to (phonemes carry frame_length; their note_id
// is null in some engine versions, so notes are tracked by walking the score in order instead).
export function frameNoteIndex(query, score) {
  const idx = [];
  let note = 0;
  let left = score.notes[0].frame_length;
  for (let f = 0; f < query.f0.length; f++) {
    while (left <= 0 && note < score.notes.length - 1) left = score.notes[++note].frame_length;
    idx.push(note);
    left--;
  }
  return idx;
}

// Retune sung notes: ratio(noteIndex) returns the multiplier to apply to that note's f0 (1 = unchanged).
// Multiplying keeps the teacher's vibrato and glides while moving the pitch centre.
export function retuneF0(query, score, ratio) {
  const idx = frameNoteIndex(query, score);
  return { ...query, f0: query.f0.map((f, i) => (f > 0 ? f * ratio(idx[i]) : f)) };
}

// Machine-tight pitch: every voiced frame sits exactly on its note's target (no vibrato, no scoops),
// with a `glide`-frame ramp between notes. hz(noteIndex) gives the target frequency.
export function hardTune(query, score, hz, { glide = 1 } = {}) {
  const idx = frameNoteIndex(query, score);
  const f0 = query.f0.map((f, i) => (f > 0 && score.notes[idx[i]].key != null ? hz(idx[i]) : f));
  if (glide > 0) {
    for (let i = 1; i < f0.length; i++) {
      if (idx[i] !== idx[i - 1] && f0[i] > 0 && f0[i - 1] > 0) {
        const from = f0[i - 1];
        const to = f0[i];
        for (let k = 0; k < glide && i + k < f0.length && f0[i + k] > 0; k++) f0[i + k] = from + ((to - from) * (k + 1)) / (glide + 1);
      }
    }
  }
  return { ...query, f0 };
}

export const midiHz = (key) => 440 * 2 ** ((key - 69) / 12);

// Smooth tuning: centre each note on its target but keep `keep` (0..1) of the teacher's own movement
// around that note (vibrato, scoops), then glide between notes with a log-domain one-pole of
// `smooth` frames. keep 0 + smooth 0 is hardTune; keep ~0.5 + smooth ~3 sings legato.
export function softTune(query, score, hz, { keep = 0.5, smooth = 3 } = {}) {
  const idx = frameNoteIndex(query, score);
  const medians = new Map();
  query.f0.forEach((f, i) => {
    if (f > 0 && score.notes[idx[i]].key != null) {
      if (!medians.has(idx[i])) medians.set(idx[i], []);
      medians.get(idx[i]).push(f);
    }
  });
  for (const [k, list] of medians) medians.set(k, list.sort((a, b) => a - b)[list.length >> 1]);
  const target = query.f0.map((f, i) =>
    f > 0 && medians.has(idx[i]) ? Math.log(hz(idx[i])) + keep * (Math.log(f) - Math.log(medians.get(idx[i]))) : null,
  );
  const a = smooth > 0 ? Math.exp(-1 / smooth) : 0;
  let state = null;
  const f0 = query.f0.map((f, i) => {
    if (target[i] == null) {
      if (f <= 0) state = null; // unvoiced gap: restart the glide
      return f;
    }
    state = state == null ? target[i] : a * state + (1 - a) * target[i];
    return Math.exp(state);
  });
  return { ...query, f0 };
}

// Vowel kana for a mora, used to extend a syllable across notes (melisma).
const VOWEL_ROWS = {
  あ: 'あかさたなはまやらわがざだばぱぁゃ', い: 'いきしちにひみりぎじぢびぴぃ', う: 'うくすつぬふむゆるぐずづぶぷぅゅ',
  え: 'えけせてねへめれげぜでべぺぇ', お: 'おこそとのほもよろをごぞどぼぽぉょ',
};
export function vowelOf(mora) {
  if (mora.endsWith('ん')) return 'ん';
  const last = mora[mora.length - 1];
  for (const [v, row] of Object.entries(VOWEL_ROWS)) if (row.includes(last)) return v;
  throw new Error(`no vowel for ${mora}`);
}
