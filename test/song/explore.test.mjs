import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sketches, transpose, harmonyBelow } from '../../songs/explore-duo/sketches.mjs';
import { arrange, parsePhrases, capForTalk } from '../../src/song/produce.mjs';
import { createBus, toyPiano, kalimba, celesta, harp, uke, rain } from '../../src/song/synth.mjs';
import { tape } from '../../src/song/fx.mjs';
import { buildPage } from '../../src/lab/page.mjs';
import { encodeWav } from '../../src/lab/wav.mjs';
import { pitchToMidi } from '../../src/song/notes.mjs';

const RANGE = { // measured usable talk-voice ranges (specs/song-ame-ame-ame.md)
  春日部つむぎ: ['C#4', 'A4'],
  ずんだもん: ['A4', 'D#5'],
  琴詠ニア: ['C#4', 'C#5'],
  雨晴はう: ['F4', 'D#5'],
};
const byId = Object.fromEntries(sketches.map((s) => [s.id, s]));
const vocalSections = (sk) => sk.score.sections.filter((s) => s.vocal);

test('every sketch is 20 bars (41.25 s with the tail) at 128 BPM and has unique ids', () => {
  assert.equal(new Set(sketches.map((s) => s.id)).size, sketches.length);
  for (const sk of sketches) {
    assert.equal(sk.score.sections.reduce((a, s) => a + s.bars, 0), 20, sk.id);
    assert.equal(sk.score.meta.bpm, 128);
    assert.ok(sk.title && sk.desc && sk.group && sk.label, sk.id);
  }
});

test('voices stay in their measured ranges, notes are eighths or shorter after the talk cap', () => {
  for (const sk of sketches) {
    const { vocals } = arrange(sk.score.sections);
    for (const v of vocals) {
      const name = sk.score.meta.singers[v.singer].name;
      let [lo, hi] = RANGE[name].map(pitchToMidi);
      if (sk.id === 'form-unison' && v.name === 'end-z') lo -= 1; // the documented G#4 of the unison ending
      for (const n of v.notes.filter((x) => x.key != null)) {
        assert.ok(n.key >= lo && n.key <= hi, `${sk.id} ${v.name} ${name}: ${n.lyric} ${n.key}`);
        assert.ok(n.beats <= 1, `${sk.id} ${v.name}: ${n.lyric} is ${n.beats} beats`);
      }
      for (const n of capForTalk(v.notes, 128).filter((x) => x.key != null)) assert.ok((n.beats * 60) / 128 <= 0.3);
    }
  }
});

test('the round: ずんだもん sings つむぎ\'s line a fourth up, one bar later', () => {
  const { vocals } = arrange(byId['form-round'].score.sections);
  const timeline = (singer) => {
    const out = [];
    for (const v of vocals.filter((x) => x.singer === singer && x.name !== `end-${singer}`)) {
      let beat = v.startBeat;
      for (const n of v.notes) {
        if (n.key != null) out.push([beat, n.key, n.lyric]);
        beat += n.beats;
      }
    }
    return out;
  };
  const a = timeline('a');
  const z = timeline('z');
  assert.equal(a.length, z.length);
  a.forEach(([beat, key, lyric], i) => assert.deepEqual(z[i], [beat + 4, key + 5, lyric]));
});

test('harmony helper: diatonic thirds below, sixths where the third leaves the low range', () => {
  assert.equal(harmonyBelow('あ:C#5:2 め:B4:2 が:A4:2 ふ:D5:2'), 'あ:A4:2 め:G#4:2 が:F#4:2 ふ:F#4:2');
  assert.equal(transpose('し:E4:2 と:A4:4', 5), 'し:A4:2 と:D5:4');
  const third = vocalSections(byId['form-third']);
  const base = vocalSections(byId['form-alt']);
  third.forEach((sec, i) => assert.deepEqual(sec.vocal.z, base[i].vocal.z)); // ずんだもん unchanged
});

test('within a group only the named thing changes', () => {
  const base = byId['form-alt'].score;
  const strip = (score, keys) => JSON.parse(JSON.stringify(score, (k, v) => (keys.includes(k) ? undefined : v)));
  for (const id of ['timbre-vibes', 'fluffy-1', 'heta-none', 'voices-tz']) assert.deepEqual(byId[id].score, base, id);
  for (const id of ['timbre-toypiano', 'timbre-kalimba', 'timbre-celesta', 'timbre-harp', 'timbre-uke']) {
    assert.deepEqual(strip(byId[id].score, ['comp', 'tremolo', 'chorus', 'reverbStems']), strip(base, ['comp', 'tremolo', 'chorus', 'reverbStems']), id);
    assert.ok(byId[id].score.meta.mix.reverbStems.includes(byId[id].score.sections[1].comp), id); // same treatment as the vibes had
  }
  for (const id of ['fluffy-0', 'fluffy-2', 'fluffy-3', 'timbre-tape']) assert.deepEqual(strip(byId[id].score, ['mix']), strip(base, ['mix']), id);
  for (const id of ['heta-mid', 'heta-warmup', 'heta-zunda']) assert.deepEqual(strip(byId[id].score, ['heta']), strip(base, ['heta']), id);
  for (const sk of sketches.filter((s) => s.group === byId['form-alt'].group)) assert.deepEqual(strip(sk.score, ['vocal']), strip(base, ['vocal']), sk.id);
});

test('はう sings 〜のね where ずんだもん sang 〜のだ, keeping every note', () => {
  const zu = vocalSections(byId['voices-tz']);
  const ha = vocalSections(byId['voices-th']);
  zu.forEach((sec, i) => {
    const a = sec.vocal.z.map(([, t]) => t).join(' ');
    const b = ha[i].vocal.z.map(([, t]) => t).join(' ');
    assert.equal(b, a.replace(/(の:\S+ )だ:/g, '$1ね:'));
  });
});

test('echo phrases carry their gain and stay off the guide melody; section heta reaches the vocals', () => {
  const notes = parsePhrases([[0, 'あ:A4:2'], [4, 'め:B4:2', { gain: 0.4 }]], 1);
  assert.equal(notes.find((n) => n.lyric === 'め').gain, 0.4);
  assert.equal(notes.find((n) => n.lyric === 'あ').gain, undefined);
  const echo = arrange(byId['form-echo'].score.sections);
  const alt = arrange(byId['form-alt'].score.sections);
  assert.ok(echo.tracks.guide.length < alt.tracks.guide.length);
  const zuda = arrange(byId['heta-zunda'].score.sections).vocals;
  assert.deepEqual(zuda.map((v) => [v.name, v.heta]), [['a-a', 'weak'], ['a-z', 'strong'], ['b-a', 'weak'], ['b-z', 'strong'], ['end-a', 'weak'], ['end-z', 'strong']]);
  const warm = arrange(byId['heta-warmup'].score.sections).vocals;
  assert.deepEqual(warm.map((v) => v.heta), ['strong', 'strong', 'weak', 'weak', 'none', 'none']);
});

test('comping patterns: one event set per bar in each instrument idiom; rain is a single long event', () => {
  const count = (id, track) => arrange(byId[id].score.sections).tracks[track].length;
  assert.equal(count('timbre-kalimba', 'kalimba'), 20 * 6);
  assert.equal(count('timbre-uke', 'uke'), 20 * 6 * 4);
  assert.ok(count('timbre-harp', 'harp') >= 20 * 7);
  assert.equal(count('timbre-vibes', 'kalimba'), 0);
  const r = arrange(byId['timbre-rain'].score.sections).tracks.rain;
  assert.deepEqual(r.map((e) => [e.beat, e.beats]), [[0, 88]]);
});

// zero-crossing pitch over [a, b] seconds of a mono signal
function hzOf(x, sr, a, b) {
  const c = [];
  for (let i = Math.round(a * sr) + 1; i < Math.round(b * sr); i++) if (x[i - 1] < 0 && x[i] >= 0) c.push(i - 1 + x[i - 1] / (x[i - 1] - x[i]));
  return ((c.length - 1) * sr) / (c[c.length - 1] - c[0]);
}

// autocorrelation pitch near an expected frequency (plucked strings cross zero several times a period)
function hzNear(x, sr, a, b, want) {
  const i0 = Math.round(a * sr);
  const len = Math.round((b - a) * sr);
  const score = (lag) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += x[i0 + i] * x[i0 + i + lag];
    return s;
  };
  const p = sr / want;
  let best = 0;
  let lagBest = 0;
  for (let lag = Math.floor(p * 0.8); lag <= Math.ceil(p * 1.25); lag++) {
    const s = score(lag);
    if (s > best) [best, lagBest] = [s, lag];
  }
  const [l, c, r] = [score(lagBest - 1), best, score(lagBest + 1)];
  return sr / (lagBest + (0.5 * (l - r)) / (l - 2 * c + r));
}

test('new instruments sound, stay finite, and the Karplus–Strong strings are in tune', () => {
  const ctx = { sr: 44100, bpm: 120 };
  for (const fn of [toyPiano, kalimba, celesta, harp, uke]) {
    const bus = createBus(ctx.sr * 2);
    fn(ctx, [{ beat: 0, midi: 69, vel: 0.8 }], bus);
    let peak = 0;
    for (const v of bus.left) {
      assert.ok(Number.isFinite(v));
      peak = Math.max(peak, Math.abs(v));
    }
    assert.ok(peak > 0.05 && peak < 4, `${fn.name} peak ${peak}`);
  }
  for (const [fn, midi] of [[harp, 57], [harp, 69], [uke, 64], [uke, 76]]) {
    const bus = createBus(ctx.sr);
    fn(ctx, [{ beat: 0, midi, vel: 1 }], bus);
    const want = 440 * 2 ** ((midi - 69) / 12);
    const cents = 1200 * Math.log2(hzNear(bus.left, ctx.sr, 0.15, 0.45, want) / want);
    assert.ok(Math.abs(cents) < 5, `${fn.name} ${midi}: ${cents.toFixed(1)} cents`);
  }
});

test('rain is seeded (same score, same rain) and mostly quiet hiss', () => {
  const ctx = { sr: 22050, bpm: 120 };
  const make = () => {
    const bus = createBus(ctx.sr * 4);
    rain(ctx, [{ beat: 0, beats: 8, vel: 1 }], bus);
    return bus;
  };
  const a = make();
  const b = make();
  assert.deepEqual(a.left, b.left);
  let e = 0;
  for (const v of a.left) e += v * v;
  const rms = Math.sqrt(e / a.left.length);
  assert.ok(rms > 0.01 && rms < 0.3, `rain rms ${rms}`);
});

test('tape wow/flutter swings a steady tone by about the asked cents and keeps length', () => {
  const sr = 22050;
  const n = sr * 4;
  const bus = createBus(n);
  for (let i = 0; i < n; i++) bus.left[i] = bus.right[i] = Math.sin((2 * Math.PI * 440 * i) / sr);
  tape(bus, { sr, wowHz: 0.55, wowCents: 9, flutterHz: 6.5, flutterCents: 2.5 });
  assert.equal(bus.left.length, n);
  const dev = [];
  for (let t = 0.2; t + 0.05 < 3.9; t += 0.025) dev.push(1200 * Math.log2(hzOf(bus.left, sr, t, t + 0.05) / 440));
  const max = Math.max(...dev.map(Math.abs));
  assert.ok(max > 5 && max < 16, `max deviation ${max.toFixed(1)} cents`);
  assert.ok(Math.abs(dev.reduce((a, v) => a + v, 0) / dev.length) < 3); // no lasting detune
});

test('page carries clips whose audio is missing here over from the previously published page', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-prev-'));
  try {
    const songs = path.join(dir, 'songs');
    fs.mkdirSync(path.join(songs, 'old'), { recursive: true });
    fs.mkdirSync(path.join(songs, 'new', 'out'), { recursive: true });
    fs.writeFileSync(path.join(songs, 'old', 'page.json'), JSON.stringify([{ id: 'old-1', group: 'Old', label: 'v1', title: 'old', desc: '', wav: 'out/gone.wav', durationSec: 9 }]));
    fs.writeFileSync(path.join(songs, 'new', 'page.json'), JSON.stringify([{ id: 'new-1', group: 'New', label: 'a', title: 'new', desc: '', wav: 'out/a.wav', durationSec: 0.1 }]));
    const x = new Float32Array(2205).map((_, i) => Math.sin(i / 5) * 0.3);
    fs.writeFileSync(path.join(songs, 'new', 'out', 'a.wav'), encodeWav({ left: x, right: x, sampleRate: 22050 }));
    const lab = path.join(dir, 'lab');
    fs.mkdirSync(lab);
    assert.throws(() => buildPage(lab, { format: 'wav', songsDir: songs }), /missing audio for old-1/);
    const oldClip = { id: 'old-1', group: 'Old', label: 'v1', title: 'old', desc: '', durationSec: 9, audio: 'audio/old-1.wav', env: [0.5, 1], rating: null, form: null };
    const previous = `<p>x</p><script type="application/json" id="lab-data">${JSON.stringify({ groups: ['Old'], clips: [oldClip] })}</script>`;
    const { clips, carried } = buildPage(lab, { format: 'wav', songsDir: songs, previous });
    assert.deepEqual(carried, ['old-1']);
    assert.deepEqual(clips.map((c) => c.id), ['new-1', 'old-1']);
    assert.deepEqual(clips[1].env, [0.5, 1]);
    assert.equal(clips[1].audio, 'audio/old-1.wav');
    assert.throws(() => buildPage(lab, { format: 'mp3', songsDir: songs, previous }), /missing audio for old-1|ffmpeg/); // wrong format: not carried
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
