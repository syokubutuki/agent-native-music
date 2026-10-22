// Presets: the settings behind songs the user loved, so new songs start from the same sound.
//
// YURU_DUET — 「あめ あめ あめ。」 v5, the reference for the つむぎ × ずんだもん talk-voice duet
// (user: 「非常に完成度が高い。何回も聞きたくなる単純だがかわいらしさ、中毒性、独自性がある」).
// Spread these into a song's meta / sections and override only what the new song needs.

// The two voices: talk styles sing (vocalMode 'talk'); singStyle is only the fallback when a phrase
// fails the talk QA. Measured talk ranges: つむぎ C#4–A4 (low line), ずんだもん A4–D#5 (high line).
// heta = each singer's own way of being off, used with --heta: bias cents everywhere, highBias at or
// above highKey, timingMs (+ = late, - = early). Measured response of the talk engine to such nudges:
// つむぎ ≈1.0x for small (≤40 c) and ≈1.6x for large ones, ずんだもん ≈0.5x — see the duet skill.
export const DUET_SINGERS = {
  a: { name: '春日部つむぎ', talkStyle: 8, singStyle: 3008, pan: -0.2, heta: { bias: -15, timingMs: 15 } }, // shy: a bit flat, a bit late
  z: { name: 'ずんだもん', talkStyle: 3, singStyle: 3003, pan: 0.2, heta: { bias: 10, highBias: 25, highKey: 73, timingMs: -15 } }, // bold: sharp up high, rushes
};

// "ほわんほわん": vibraphone comping with a tempo-locked tremolo (one wobble per beat), chorus on pad and
// vibes, a lightly chorused voice in a deep, soft, pre-delayed reverb, quiet percussion, rounded top.
export function floatingMix(bpm) {
  return {
    stemDb: { clap: -25, shaker: -33, lightKick: -16, bell: -27, guide: -34 },
    tremolo: { stems: ['vibes', 'bell', 'guide'], rateHz: bpm / 60, depth: 0.5 },
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
}

// Section defaults: vibraphone comping, round bouncing bass, pad, phrase-based duet vocals, and the
// quiet music-box guide that doubles the written melody an octave up.
export const DUET_SECTION = { comp: 'vibes', bass: 'bounce', bassSynth: 'round', phrases: true, duet: true, guide: true, pad: true };

export function yuruDuetMeta({ title, version = 1, bpm = 128, key = 'A major' }) {
  return {
    title,
    version,
    bpm,
    key,
    vocalMode: 'talk',
    singers: DUET_SINGERS,
    voice: { style: 3008, name: '春日部つむぎ・ずんだもん', styleName: 'トーク歌唱' },
    mix: floatingMix(bpm),
  };
}
