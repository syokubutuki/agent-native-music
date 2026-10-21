// Pitch correction that keeps the voice's timbre: TD-PSOLA (time-domain pitch-synchronous overlap-add).
// Each glottal period of the input is cut out with a two-period Hann window around its pitch mark and
// laid down again at the spacing of the *target* pitch. The spectral envelope (formants: who is speaking)
// travels inside each grain, so the voice keeps its character while its pitch is pinned to the notes.
//
// targetHz(t) gives the wanted pitch at time t (seconds), or 0 where nothing should be corrected; it also
// guides pitch detection, so the detector only searches near the expected note.

function nccf(x, start, win, lag) {
  let s = 0, e1 = 0, e2 = 0;
  for (let i = 0; i < win; i++) {
    const a = x[start + i];
    const b = x[start + i + lag];
    s += a * b;
    e1 += a * a;
    e2 += b * b;
  }
  return s / Math.sqrt(e1 * e2 + 1e-12);
}

// Pitch track every `hop` samples: { f0: Float32Array (0 = unvoiced), hop }.
export function trackPitch(x, sr, targetHz, { hopSec = 0.005, minR = 0.55 } = {}) {
  const hop = Math.round(hopSec * sr);
  const n = Math.floor(x.length / hop);
  const f0 = new Float32Array(n);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  for (let k = 0; k < n; k++) {
    const g = targetHz((k * hop) / sr);
    if (!(g > 0)) continue;
    const minLag = Math.max(2, Math.floor(sr / (g * 1.45)));
    const maxLag = Math.ceil(sr / (g / 1.45));
    const win = Math.min(maxLag * 2, Math.round(0.03 * sr));
    const start = k * hop - (win >> 1);
    if (start < 0 || start + win + maxLag + 1 >= x.length) continue;
    let e = 0;
    for (let i = 0; i < win; i++) e += x[start + i] ** 2;
    if (Math.sqrt(e / win) < peak * 0.01) continue;
    let best = -1, bl = 0;
    const r = [];
    for (let lag = minLag; lag <= maxLag + 1; lag++) {
      const v = nccf(x, start, win, lag);
      r[lag] = v;
      if (lag <= maxLag && v > best) { best = v; bl = lag; }
    }
    if (best < minR) continue;
    // parabolic interpolation for sub-sample period
    const a = r[bl - 1] ?? best, c = r[bl + 1] ?? best;
    const d = a - 2 * best + c;
    const lag = d < 0 ? bl + (0.5 * (a - c)) / d : bl;
    f0[k] = sr / lag;
  }
  // median-of-3 to remove single-frame octave slips
  const out = Float32Array.from(f0);
  for (let k = 1; k + 1 < n; k++) {
    if (f0[k - 1] > 0 && f0[k] > 0 && f0[k + 1] > 0) out[k] = [f0[k - 1], f0[k], f0[k + 1]].sort((p, q) => p - q)[1];
  }
  return { f0: out, hop };
}

// Analysis pitch marks inside voiced runs: one per period, snapped to the waveform peak of that period.
function pitchMarks(x, sr, f0, hop) {
  const runs = [];
  let k = 0;
  while (k < f0.length) {
    if (!(f0[k] > 0)) {
      k++;
      continue;
    }
    let end = k;
    while (end < f0.length && f0[end] > 0) end++;
    const s1 = Math.min(x.length - 1, end * hop);
    const run = [];
    let cursor = k * hop;
    while (cursor < s1) {
      const fr = f0[Math.min(f0.length - 1, Math.floor(cursor / hop))] || f0[k];
      const P = Math.max(2, Math.round(sr / fr));
      const hi = Math.min(s1, cursor + P);
      let m = cursor;
      let mv = -Infinity;
      for (let i = cursor; i < hi; i++) if (x[i] > mv) { mv = x[i]; m = i; }
      if (run.length && m - run[run.length - 1].at < P * 0.5) m = run[run.length - 1].at + P;
      if (m >= s1) break;
      run.push({ at: m, period: P });
      cursor = m + Math.round(P * 0.5);
    }
    runs.push(run);
    k = end;
  }
  return runs;
}

// Returns a new Float32Array of the same length with voiced runs re-pitched to targetHz.
export function correctPitch(x, sr, targetHz, { fadeSec = 0.004 } = {}) {
  const { f0, hop } = trackPitch(x, sr, targetHz);
  const runs = pitchMarks(x, sr, f0, hop);
  const y = Float32Array.from(x);
  const fade = Math.max(1, Math.round(fadeSec * sr));
  for (const run of runs) {
    if (run.length < 3) continue;
    const s0 = run[0].at;
    const s1 = run[run.length - 1].at;
    const len = s1 - s0;
    if (len <= 0) continue;
    const out = new Float32Array(len + 1);
    const wsum = new Float32Array(len + 1);
    let ai = 0;
    // synthesis marks advance by the exact (fractional) target period so the pitch does not round flat
    for (let tf = s0; tf < s1; ) {
      const ts = Math.round(tf);
      while (ai + 1 < run.length && Math.abs(run[ai + 1].at - ts) <= Math.abs(run[ai].at - ts)) ai++;
      const { at, period } = run[ai];
      for (let i = -period; i <= period; i++) {
        const src = at + i;
        const dst = ts - s0 + i;
        if (src < 0 || src >= x.length || dst < 0 || dst > len) continue;
        const w = 0.5 + 0.5 * Math.cos((Math.PI * i) / period);
        out[dst] += x[src] * w;
        wsum[dst] += w;
      }
      const g = targetHz(ts / sr);
      tf += Math.max(2, g > 0 ? sr / g : period);
    }
    for (let i = 0; i <= len; i++) {
      // standard TD-PSOLA sums the grains as they are (two-period Hann windows at one-period spacing
      // add up to 1); only true gaps, which large downward shifts would leave, fall back to the input
      const v = wsum[i] > 0.25 ? out[i] : x[s0 + i];
      // crossfade into and out of the corrected run
      const edge = Math.min(i, len - i);
      const m = edge >= fade ? 1 : edge / fade;
      y[s0 + i] = v * m + x[s0 + i] * (1 - m);
    }
  }
  return y;
}
