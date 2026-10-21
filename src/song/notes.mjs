// Melody notation used in song files: [lyric, pitch, sixteenths]. pitch is like "A4", "Bb4", "C#5";
// an empty lyric with pitch null is a rest. Durations are counted in 16ths of the song's BPM grid.

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchToMidi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad pitch name: ${name}`);
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export function parseNotes(list) {
  return list.map(([lyric, pitch, sixteenths], i) => {
    if (!Number.isFinite(sixteenths) || sixteenths <= 0) throw new Error(`note ${i}: duration must be > 0`);
    if (pitch === null) return { key: null, lyric: '', beats: sixteenths / 4 };
    if (typeof lyric !== 'string' || !lyric) throw new Error(`note ${i}: lyric required`);
    return { key: pitchToMidi(pitch), lyric, beats: sixteenths / 4 };
  });
}
