// Memorability report for a duet score: how often the hook is heard, how fast the words go, the range,
// leaps, and how well each phrase's melody follows Japanese pitch accent (VOICEVOX's own reading).
// Accent agreement matters for talk-voice songs: lines whose tune rises and falls with the words sound
// spoken — the "two of them chatting" feel — and are easier to take in.

import { arrange, splitPhrases } from './produce.mjs';
import { DEFAULT_ENGINE } from './voicevox.mjs';

// Tokyo-type accent: High/Low per mora of each accent phrase (accent = mora where the fall happens; 0 = flat).
export function accentHL(accentPhrases) {
  const hl = [];
  for (const ap of accentPhrases) {
    ap.moras.forEach((_, i) => {
      const k = i + 1;
      hl.push(ap.accent === 1 ? (k === 1 ? 1 : 0) : k === 1 ? 0 : ap.accent === 0 || k <= ap.accent ? 1 : 0);
    });
  }
  return hl;
}

// Agreement between accent moves (L->H, H->L) and the melody's direction at the same place.
export function accentAgreement(hl, keys) {
  let agree = 0;
  let total = 0;
  const marks = [];
  for (let i = 1; i < hl.length && i < keys.length; i++) {
    const acc = Math.sign(hl[i] - hl[i - 1]);
    if (acc === 0) {
      marks.push('·');
      continue;
    }
    total++;
    const ok = Math.sign(keys[i] - keys[i - 1]) === acc;
    if (ok) agree++;
    marks.push(ok ? '○' : '×');
  }
  return { agree, total, marks: marks.join('') };
}

export async function analyzeScore(score, { engine = DEFAULT_ENGINE, hook = null, accentStyle = 8 } = {}) {
  const { bpm } = score.meta;
  const { vocals, tracks } = arrange(score.sections);
  const phrases = [];
  for (const v of vocals) {
    for (const ph of splitPhrases(v.notes)) {
      const notes = ph.notes.filter((n) => !n.wild);
      if (!notes.length) continue;
      phrases.push({ singer: v.singer, section: v.name, beat: v.startBeat + ph.beat, text: notes.map((n) => n.lyric).join(''), notes });
    }
  }
  // accent per distinct text (one engine call each)
  const accentCache = new Map();
  for (const p of phrases) {
    if (!accentCache.has(p.text)) {
      const res = await fetch(`${engine}/audio_query?speaker=${accentStyle}&text=${encodeURIComponent(p.text)}`, { method: 'POST' });
      const q = await res.json();
      accentCache.set(p.text, accentHL(q.accent_phrases));
    }
    const hl = accentCache.get(p.text);
    p.accent = hl.length === p.notes.length ? accentAgreement(hl, p.notes.map((n) => n.key)) : null;
    p.hl = hl.map((h) => (h ? 'H' : 'L')).join('');
  }
  const totals = phrases.reduce((a, p) => (p.accent ? { agree: a.agree + p.accent.agree, total: a.total + p.accent.total } : a), { agree: 0, total: 0 });
  const range = {};
  for (const p of phrases) {
    for (const n of p.notes) {
      const r = (range[p.singer] ??= [99, 0]);
      r[0] = Math.min(r[0], n.key);
      r[1] = Math.max(r[1], n.key);
    }
  }
  const leaps = phrases.flatMap((p) => p.notes.slice(1).map((n, i) => Math.abs(n.key - p.notes[i].key)));
  const sectionRates = {};
  for (const v of vocals) {
    const sung = v.notes.filter((n) => n.key != null && !n.wild).length;
    const sec = v.name.replace(/-[az]$/, '');
    const secs = (v.bars * 4 * 60) / bpm;
    sectionRates[sec] = (sectionRates[sec] ?? 0) + sung / secs;
  }
  const hookSung = hook ? phrases.filter((p) => p.text.includes(hook)).length : null;
  return {
    phrases,
    accent: { ...totals, rate: totals.total ? totals.agree / totals.total : null },
    range,
    leaps: { steps: leaps.filter((d) => d <= 2).length, skips: leaps.filter((d) => d > 2 && d <= 4).length, leaps: leaps.filter((d) => d > 4).length },
    syllablesPerSec: sectionRates,
    hookSung,
    musicBoxNotes: tracks.bell.length,
  };
}
