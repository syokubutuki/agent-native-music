// Turns a lab genome into a song-ready one: steps locked to the BPM grid, no tempo bend, optional
// retuning from N-EDO to 12-EDO snapped to the song's mode, and a caller-supplied energy curve.

const PHRYGIAN_A_FROM_F = [0, 2, 4, 5, 7, 9, 11]; // pitch classes of A phrygian measured from F

export function sixteenthMs(bpm) {
  return 60000 / bpm / 4;
}

// Nearest whole number of 16ths (at least 1), kept inside the lab's stepMs range [40, 600].
export function quantizeStep(stepMs, bpm) {
  const s = sixteenthMs(bpm);
  let n = Math.max(1, Math.round(stepMs / s));
  while (n * s > 600 && n > 1) n--;
  return n * s;
}

function snapToScale(deg12, scale) {
  const pc = ((deg12 % 12) + 12) % 12;
  let best = scale[0];
  for (const c of scale) if (Math.abs(c - pc) < Math.abs(best - pc)) best = c; // ties keep the lower
  return deg12 - pc + best;
}

// 11-EDO (or any N-EDO) degrees -> 12-EDO degrees over a 12-EDO base, snapped to the scale.
export function to12edo(genome, { baseHz, scale = PHRYGIAN_A_FROM_F } = {}) {
  const { divisions } = genome.tuning;
  const voices = genome.voices.map((v) => ({
    ...v,
    degrees: v.degrees.map((d) => Math.min(23, Math.max(0, snapToScale(Math.round((d * 12) / divisions), scale)))),
  }));
  return { ...genome, tuning: { type: 'edo', divisions: 12, baseHz: baseHz ?? genome.tuning.baseHz }, voices };
}

export function songGenome(seed, { bpm, durationSec, points, tuning12 = null }) {
  let g = structuredClone(seed);
  g.voices = g.voices.map((v) => ({ ...v, stepMs: quantizeStep(v.stepMs, bpm) }));
  if (tuning12) g = to12edo(g, tuning12);
  g.durationSec = durationSec;
  g.form = { ...g.form, tempoBend: 0, points };
  return g;
}
