// Small transforms on vocal token strings ("lyric:pitch:sixteenths ..."): transpose a line, or derive a
// diatonic harmony from it. Pure data helpers — the music itself stays in the song files.

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const toMidi = (p) => {
  const m = /^([A-G]#?)(\d)$/.exec(p);
  return NAMES.indexOf(m[1]) + 12 * (Number(m[2]) + 1);
};
const toName = (k) => `${NAMES[k % 12]}${Math.floor(k / 12) - 1}`;
export const mapNotes = (text, fn) => text.replace(/(\S+?):([A-G]#?\d):(\d+)/g, (_, l, p, n) => `${l}:${toName(fn(toMidi(p)))}:${n}`);
export const transpose = (text, semis) => mapNotes(text, (k) => k + semis);

export const A_MAJOR = [9, 11, 1, 2, 4, 6, 8];
const stepDown = (k, steps, scale) => {
  let x = k;
  for (let s = 0; s < steps; s++) do x--; while (!scale.includes(x % 12));
  return x;
};
// A diatonic third below; a sixth below where the third would rise above the low voice's top (maxPitch).
export const harmonyBelow = (text, { maxPitch = 'A4', scale = A_MAJOR } = {}) =>
  mapNotes(text, (k) => (stepDown(k, 2, scale) <= toMidi(maxPitch) ? stepDown(k, 2, scale) : stepDown(k, 5, scale)));
