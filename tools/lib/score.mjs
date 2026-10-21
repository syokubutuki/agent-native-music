// 楽譜データ (anm-score/1) の検証。web/player.template.html の読み込み仕様と対応させる。
export const FORMAT = 'anm-score/1';
export const PITCHED = ['epiano', 'pluck', 'pad', 'airpad', 'bell', 'bass', 'lead', 'sub808', 'stab'];
export const PITCHLESS = ['kick', 'snare', 'hat', 'riser', 'clap', 'ohat']; // pitch は '-' を書く
const PITCH_RE = /^[A-G][#b]?-?\d$/;

export function validateScore(s) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!s || typeof s !== 'object') return ['score must be an object'];
  if (s.format !== FORMAT) err(`format must be "${FORMAT}"`);
  for (const k of ['id', 'title']) if (typeof s[k] !== 'string' || !s[k]) err(`${k} must be a non-empty string`);
  if (s.sidechain !== undefined && typeof s.sidechain !== 'boolean') err('sidechain must be a boolean');
  if (s.order !== undefined && typeof s.order !== 'number') err('order must be a number');
  if (s.changes !== undefined && typeof s.changes !== 'string') err('changes must be a string');
  if (!Number.isInteger(s.version) || s.version < 1) err('version must be a positive integer');
  if (!(s.bpm >= 30 && s.bpm <= 200)) err('bpm must be 30..200');
  if (!(s.swing >= 0 && s.swing <= 1)) err('swing must be 0..1');
  if (!Number.isInteger(s.beatsPerBar) || s.beatsPerBar < 1) err('beatsPerBar must be a positive integer');
  if (!Number.isInteger(s.bars) || s.bars < 1) err('bars must be a positive integer');
  const total = s.beatsPerBar * s.bars;
  if (s.sections !== undefined) {
    if (!Array.isArray(s.sections)) err('sections must be an array');
    else s.sections.forEach((c, i) => {
      if (!Number.isInteger(c?.bar) || c.bar < 0 || c.bar >= s.bars || typeof c.label !== 'string' || !c.label) err(`sections[${i}] invalid`);
    });
  }
  if (s.lyrics !== undefined) {
    if (!Array.isArray(s.lyrics)) err('lyrics must be an array');
    else s.lyrics.forEach((l, i) => {
      if (!(l?.beat >= 0 && l.beat < s.beatsPerBar * s.bars) || typeof l.text !== 'string' || !l.text) err(`lyrics[${i}] invalid`);
    });
  }
  if (!Array.isArray(s.chords)) err('chords must be an array');
  else s.chords.forEach((c, i) => {
    if (!(c.beat >= 0 && c.beat < total) || typeof c.label !== 'string') err(`chords[${i}] invalid`);
  });
  if (!Array.isArray(s.tracks) || s.tracks.length === 0) return [...errors, 'tracks must be a non-empty array'];
  s.tracks.forEach((t, ti) => {
    const at = `tracks[${ti}]`;
    const drum = PITCHLESS.includes(t.instrument);
    if (!drum && !PITCHED.includes(t.instrument)) err(`${at}.instrument unknown: ${t.instrument}`);
    if (typeof t.name !== 'string' || !t.name) err(`${at}.name required`);
    if (!(t.gain >= 0 && t.gain <= 1.5)) err(`${at}.gain must be 0..1.5`);
    if (!Array.isArray(t.notes)) return err(`${at}.notes must be an array`);
    if (t.vocal) {
      if (t.instrument !== 'lead') err(`${at}: vocal track must use instrument "lead"`);
      checkVocal(t, s, at, err);
    }
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

// 歌のパート(vocal: true)は歌声合成ソフトへ渡すため、単旋律・小節をまたがない・1音1モーラ(ひらがな)に限る
const MORA_RE = /^[ぁ-ゖ]{1,3}$/;
function checkVocal(t, s, at, err) {
  const bar = s.beatsPerBar;
  let prevEnd = -1;
  [...t.notes].sort((a, b) => a[0] - b[0]).forEach((n) => {
    const [beat, dur, , , lyric] = n;
    const w = `${at} vocal note @${beat}`;
    if (typeof lyric !== 'string' || !MORA_RE.test(lyric)) err(`${w}: lyric must be 1 mora in hiragana (got ${lyric})`);
    else if (lyric === 'っ') err(`${w}: avoid standalone っ`);
    if (beat < prevEnd - 1e-9) err(`${w}: overlaps the previous note`);
    if (Math.floor((beat + 1e-9) / bar) !== Math.floor((beat + dur - 1e-9) / bar)) err(`${w}: crosses a bar line`);
    prevEnd = beat + dur;
  });
}
