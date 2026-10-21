// 16-bit PCM stereo WAV encoder.

export function encodeWav({ left, right, sampleRate }) {
  const channels = 2;
  const bytesPerSample = 2;
  const frames = left.length;
  const dataSize = frames * channels * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buf.writeUInt16LE(channels * bytesPerSample, 32);
  buf.writeUInt16LE(bytesPerSample * 8, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    buf.writeInt16LE(toInt16(left[i]), o);
    buf.writeInt16LE(toInt16(right[i]), o + 2);
    o += 4;
  }
  return buf;
}

function toInt16(x) {
  const v = Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));
  return Math.round(v < 0 ? v * 32768 : v * 32767);
}

// Minimal PCM WAV reader (16-bit or 32-bit float, any channel count); skips non-data chunks.
export function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let p = 12;
  let fmt = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === 'fmt ') {
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data before fmt');
      const bytes = fmt.bits / 8;
      const end = Math.min(buf.length, body + size);
      const frames = Math.floor((end - body) / (bytes * fmt.channels));
      const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < fmt.channels; c++) {
          const o = body + (i * fmt.channels + c) * bytes;
          channels[c][i] = fmt.format === 3 && fmt.bits === 32 ? buf.readFloatLE(o) : fmt.bits === 16 ? buf.readInt16LE(o) / 32768 : 0;
        }
      }
      if (fmt.bits !== 16 && !(fmt.format === 3 && fmt.bits === 32)) throw new Error(`unsupported WAV: format ${fmt.format}, ${fmt.bits}-bit`);
      return { sampleRate: fmt.sampleRate, channels };
    }
    p = body + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}
