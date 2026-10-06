// 楽譜データ (anm-score/1) の検証。web/player.template.html の読み込み仕様と対応させる。
export const FORMAT = 'anm-score/1';
export const PITCHED = ['epiano', 'pluck', 'pad', 'bass'];
export const DRUMS = ['kick', 'snare', 'hat'];
const PITCH_RE = /^[A-G][#b]?-?\d$/;

export function validateScore(s) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!s || typeof s !== 'object') return ['score must be an object'];
  if (s.format !== FORMAT) err(`format must be "${FORMAT}"`);
  for (const k of ['id', 'title']) if (typeof s[k] !== 'string' || !s[k]) err(`${k} must be a non-empty string`);
  if (!Number.isInteger(s.version) || s.version < 1) err('version must be a positive integer');
  if (!(s.bpm >= 30 && s.bpm <= 200)) err('bpm must be 30..200');
  if (!(s.swing >= 0 && s.swing <= 1)) err('swing must be 0..1');
  if (!Number.isInteger(s.beatsPerBar) || s.beatsPerBar < 1) err('beatsPerBar must be a positive integer');
  if (!Number.isInteger(s.bars) || s.bars < 1) err('bars must be a positive integer');
  const total = s.beatsPerBar * s.bars;
  if (!Array.isArray(s.chords)) err('chords must be an array');
  else s.chords.forEach((c, i) => {
    if (!(c.beat >= 0 && c.beat < total) || typeof c.label !== 'string') err(`chords[${i}] invalid`);
  });
  if (!Array.isArray(s.tracks) || s.tracks.length === 0) return [...errors, 'tracks must be a non-empty array'];
  s.tracks.forEach((t, ti) => {
    const at = `tracks[${ti}]`;
    const drum = DRUMS.includes(t.instrument);
    if (!drum && !PITCHED.includes(t.instrument)) err(`${at}.instrument unknown: ${t.instrument}`);
    if (typeof t.name !== 'string' || !t.name) err(`${at}.name required`);
    if (!(t.gain >= 0 && t.gain <= 1.5)) err(`${at}.gain must be 0..1.5`);
    if (!Array.isArray(t.notes)) return err(`${at}.notes must be an array`);
    t.notes.forEach((n, ni) => {
      const [beat, dur, pitch, vel] = Array.isArray(n) ? n : [];
      const w = `${at}.notes[${ni}]`;
      if (!(beat >= 0 && beat < total)) err(`${w} beat out of range`);
      else if (Math.abs(beat * 12 - Math.round(beat * 12)) > 1e-9) err(`${w} beat must be a multiple of 1/12`);
      if (!(dur > 0)) err(`${w} dur must be > 0`);
      if (!(vel >= 0 && vel <= 1)) err(`${w} vel must be 0..1`);
      if (drum ? pitch !== '-' : !PITCH_RE.test(pitch ?? '')) err(`${w} pitch invalid: ${pitch}`);
    });
  });
  return errors;
}
