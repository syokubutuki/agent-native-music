// 「ふわ ふわ ふわ。」〈ゆき〉 v2 — the first-snow day of v1 (lullaby, 86 BPM) moved onto the shared
// bouncy 132 BPM frame: snow outside, a snowman, cocoa, then the snowy night. Lyric variants of the same
// tune: songs/fuwa-yami (dark), songs/fuwa-kenka (discord flickers), songs/fuwa-sanpo (a walk).
import { buildSong } from './frame.mjs';

export const { meta, sections, lyrics } = buildSong({
  title: 'ゆき',
  version: 2,
  mood: 'bright',
  lyrics: {
    verse1: [
      'みてみて おそと', 'どうしたのだ', 'しろい はなびら', 'ゆき ふるのだ',
      'あそぼうよ', 'ゆきだるま なのだ', 'おおきくして', 'ころがすのだ',
      'てぶくろ ぬれた', 'つめたいのだ', 'かえろっか', 'ここあが いいのだ',
      'よぞらに ゆき', 'きれいなのだ', 'ねえ きいて', 'せえの',
    ],
    chorus: ['ゆきが ふる', 'まっしろ まっしろ', 'まちが ねむるよ', 'ぬくぬく するのだ', 'おやすみ なさい'],
    verse2: ['かまくらなのだ', 'なかで あそぼ', 'おもち やくのだ', 'たのしみだね', 'まだ おきてるのだ', 'めを とじてね', 'じゃあ ねるのだ', 'せえの'],
    bridge: ['ゆめの なか', 'ゆめの なか', 'そらを とぶ', 'そらを とぶ', 'ゆきの のはら', 'ゆきの のはら', 'おなじ ゆめ みよう'],
    outro: ['いい ゆめ みてね', 'つむぎも みるのだ', 'おやすみね'],
  },
});
