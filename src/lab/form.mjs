// v2 macro form: a piecewise energy curve over the whole clip, plus how strongly energy drives
// density, melody, brightness, tempo and loudness. Scalar ranges live in params.mjs (FORM_SPEC).

import {
  FORM_SPEC,
  FORM_SHAPES,
  FORM_MIN_POINTS,
  FORM_MAX_POINTS,
  FORM_MIN_GAP,
  randomFields,
  mutateFields,
  validateFields,
} from './params.mjs';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function randomPoints(rng) {
  const n = rng.int(FORM_MIN_POINTS, FORM_MAX_POINTS - 1);
  const inner = [];
  while (inner.length < n - 2) {
    const t = rng.uniform(FORM_MIN_GAP, 1 - FORM_MIN_GAP);
    if ([0, 1, ...inner].every((u) => Math.abs(u - t) >= FORM_MIN_GAP)) inner.push(t);
  }
  return [0, ...inner.sort((a, b) => a - b), 1].map((t) => ({ t, e: rng.next(), shape: rng.pick(FORM_SHAPES) }));
}

export function randomForm(rng) {
  return { points: randomPoints(rng), ...randomFields(FORM_SPEC, rng) };
}

function mutatePoints(points, rng, s) {
  const out = points.map((p) => ({ ...p }));
  for (let i = 0; i < out.length; i++) {
    if (rng.chance(s)) out[i].e = clamp01(out[i].e + rng.gaussian() * s * 0.5);
    if (rng.chance(s * 0.3)) out[i].shape = rng.pick(FORM_SHAPES);
    if (i > 0 && i < out.length - 1 && rng.chance(s)) {
      const lo = out[i - 1].t + FORM_MIN_GAP;
      const hi = out[i + 1].t - FORM_MIN_GAP;
      if (hi > lo) out[i].t = Math.min(hi, Math.max(lo, out[i].t + rng.gaussian() * s * 0.15));
    }
  }
  if (out.length < FORM_MAX_POINTS && rng.chance(s * 0.2)) {
    // Split the widest segment.
    let w = 1;
    for (let i = 2; i < out.length; i++) if (out[i].t - out[i - 1].t > out[w].t - out[w - 1].t) w = i;
    if (out[w].t - out[w - 1].t >= 2 * FORM_MIN_GAP) {
      const t = (out[w - 1].t + out[w].t) / 2;
      out.splice(w, 0, { t, e: rng.next(), shape: rng.pick(FORM_SHAPES) });
    }
  }
  if (out.length > FORM_MIN_POINTS && rng.chance(s * 0.2)) out.splice(rng.int(1, out.length - 2), 1);
  return out;
}

export function mutateForm(form, rng, s) {
  return { ...mutateFields(FORM_SPEC, form, rng, s), points: mutatePoints(form.points, rng, s) };
}

export function validateForm(form, path = 'genome.form') {
  validateFields(FORM_SPEC, form, path);
  const pts = form.points;
  if (!Array.isArray(pts) || pts.length < FORM_MIN_POINTS || pts.length > FORM_MAX_POINTS) {
    throw new Error(`${path}.points: must have ${FORM_MIN_POINTS}..${FORM_MAX_POINTS} points`);
  }
  pts.forEach((p, i) => {
    const pp = `${path}.points[${i}]`;
    if (!p || typeof p.t !== 'number' || !Number.isFinite(p.t)) throw new Error(`${pp}.t: must be a finite number`);
    if (typeof p.e !== 'number' || !(p.e >= 0 && p.e <= 1)) throw new Error(`${pp}.e: must be in [0, 1]`);
    if (!FORM_SHAPES.includes(p.shape)) throw new Error(`${pp}.shape: must be one of ${FORM_SHAPES.join('|')}`);
    if (i > 0 && p.t - pts[i - 1].t < FORM_MIN_GAP - 1e-9) {
      throw new Error(`${pp}.t: points must increase by at least ${FORM_MIN_GAP}`);
    }
  });
  if (pts[0].t !== 0 || pts[pts.length - 1].t !== 1) throw new Error(`${path}.points: must start at t=0 and end at t=1`);
}

// Energy in [0,1] at normalized time x in [0,1].
export function energyAt(form, x) {
  const pts = form.points;
  if (x <= 0) return pts[0].e;
  if (x >= 1) return pts[pts.length - 1].e;
  let i = 1;
  while (pts[i].t < x) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const u = (x - a.t) / (b.t - a.t);
  const shaped = b.shape === 'exp' ? u * u * u : b.shape === 'jump' ? (u >= 1 ? 1 : 0) : u;
  return clamp01(a.e + (b.e - a.e) * shaped);
}

const BARS = '▁▂▃▄▅▆▇█';

export function formSparkline(form, width = 8) {
  let s = '';
  for (let i = 0; i < width; i++) {
    const e = energyAt(form, (i + 0.5) / width);
    s += BARS[Math.min(BARS.length - 1, Math.floor(e * BARS.length))];
  }
  return s;
}
