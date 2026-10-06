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
