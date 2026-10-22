// "ボイロ" singing: make VOICEVOX *talk* voices sing by taking the engine's own reading of the lyric
// (/audio_query) and overwriting every mora's pitch and length with the score. This keeps the speech
// timbre and its slightly stiff, cute charm — the sound of talk-software songs (歌うソフトウェアトーク).

import { DEFAULT_ENGINE } from './voicevox.mjs';

async function call(engine, path, params, body, retry = 1) {
  let res;
  try {
    res = await fetch(`${engine}${path}?${new URLSearchParams(params)}`, {
      method: 'POST',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // the engine drops idle keep-alive sockets; a request that lands on one fails once and succeeds again
    if (retry > 0) return call(engine, path, params, body, retry - 1);
    throw err;
  }
  if (!res.ok) throw new Error(`VOICEVOX ${path} ${res.status}: ${await res.text()}`);
  return res;
}

const ln = (hz) => Math.log(hz);
const midiHz = (k) => 440 * 2 ** ((k - 69) / 12);

// notes: one phrase without rests, [{ key, lyric (one mora of kana), beats }].
// Returns { query, leadSec } where the first vowel onset lands leadSec into the rendered audio.
// Talk voices are trained on short spoken vowels: past ~0.25 s a held vowel turns breathy and fades
// (measured: 234 ms notes stay within -20..-30 dB, 469 ms notes drop to -36..-43 dB). So long notes are
// split into "ー" continuation morae of at most MAX_MORA_SEC at the same pitch, and a note that only
// repeats the previous vowel (a melisma from the score) is sung as "ー" too.
const MAX_MORA_SEC = 0.24;
export function splitForTalk(notes, bpm) {
  const out = [];
  for (const [i, n] of notes.entries()) {
    const sec = (n.beats * 60) / bpm;
    const parts = Math.max(1, Math.ceil(sec / MAX_MORA_SEC - 1e-9));
    const continuation = i > 0 && n.melisma === true;
    for (let p = 0; p < parts; p++) {
      out.push({ ...n, lyric: p === 0 && !continuation ? n.lyric : 'ー', beats: n.beats / parts, src: i });
    }
  }
  return out;
}

// offsetsCents[i] nudges the sung pitch of score note i (all of its morae) — used to shape how far
// off-key each note lands ("controlled 音痴").
export async function talkQuery(phrase, { bpm, style, engine = DEFAULT_ENGINE, offsetsCents = null }) {
  const notes = splitForTalk(phrase, bpm);
  const text = notes.map((n) => n.lyric).join('');
  const q = await (await call(engine, '/audio_query', { text, speaker: style })).json();
  const moras = q.accent_phrases.flatMap((ap) => [...ap.moras, ...(ap.pause_mora ? [] : [])]);
  if (moras.length !== notes.length) {
    throw new Error(`talk reading of "${text}" has ${moras.length} morae for ${notes.length} notes: ${moras.map((m) => m.text).join('/')}`);
  }
  for (const ap of q.accent_phrases) ap.pause_mora = null; // the score decides where breaths go
  const spb = 60 / bpm;
  moras.forEach((m, i) => {
    const n = notes[i];
    const next = moras[i + 1];
    const slot = n.beats * spb;
    const nextCons = next?.consonant ? Math.min(next.consonant_length ?? 0.05, 0.08) : 0;
    if (m.consonant) m.consonant_length = Math.min(m.consonant_length ?? 0.05, 0.08);
    m.vowel = m.vowel.toLowerCase(); // no devoiced vowels: every mora carries its note
    m.vowel_length = Math.max(0.03, slot - nextCons);
    m.pitch = ln(midiHz(n.key) * 2 ** ((offsetsCents?.[n.src] ?? 0) / 1200));
  });
  const firstCons = moras[0].consonant ? moras[0].consonant_length : 0;
  q.prePhonemeLength = 0.1;
  q.postPhonemeLength = 0.1;
  q.speedScale = 1;
  q.intonationScale = 1;
  q.pitchScale = 0;
  q.outputSamplingRate = 24000;
  return { query: q, leadSec: q.prePhonemeLength + firstCons };
}

export async function talkSynthesis(query, style, { engine = DEFAULT_ENGINE } = {}) {
  return Buffer.from(await (await call(engine, '/synthesis', { speaker: style }, query)).arrayBuffer());
}

// A spoken line: the engine's own natural reading (no pitch or timing from a score) — the asides
// between sung lines ("えへへ", "おしい") that make the singing sound like singing by contrast.
export async function speakQuery(text, { style, engine = DEFAULT_ENGINE }) {
  const q = await (await call(engine, '/audio_query', { text, speaker: style })).json();
  q.prePhonemeLength = 0.05;
  q.postPhonemeLength = 0.1;
  q.outputSamplingRate = 24000;
  return q;
}
