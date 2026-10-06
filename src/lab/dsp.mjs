// Small DSP building blocks. All stateful pieces are plain closures so voices can own their own state.

// Topology-preserving state-variable filter (Zavalishin); stays stable up to near Nyquist.
export function createSvf(mode, cutoffHz, q, sampleRate) {
  const g = Math.tan((Math.PI * Math.min(cutoffHz, sampleRate * 0.45)) / sampleRate);
  const k = 1 / q;
  const a1 = 1 / (1 + g * (g + k));
  const a2 = g * a1;
  const a3 = g * a2;
  let ic1 = 0;
  let ic2 = 0;
  return (v0) => {
    const v3 = v0 - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    if (mode === 'lp') return v2;
    if (mode === 'bp') return v1 * k; // unity gain at the resonant peak
    return v0 - k * v1 - v2;
  };
}

export function dcBlock(buf, r = 0.995) {
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = x - x1 + r * y1;
    x1 = x;
    y1 = y;
    buf[i] = y;
  }
}

export function peak(...bufs) {
  let p = 0;
  for (const b of bufs) for (let i = 0; i < b.length; i++) p = Math.max(p, Math.abs(b[i]));
  return p;
}

export function rms(...bufs) {
  let sum = 0;
  let count = 0;
  for (const b of bufs) {
    for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
    count += b.length;
  }
  return Math.sqrt(sum / Math.max(1, count));
}

export function scale(buf, gain) {
  for (let i = 0; i < buf.length; i++) buf[i] *= gain;
}

export function fadeEdges(buf, fadeSamples) {
  const n = Math.min(fadeSamples, Math.floor(buf.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    buf[i] *= g;
    buf[buf.length - 1 - i] *= g;
  }
}
