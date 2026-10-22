// 「ふわ ふわ ふわ。」〈さんぽ〉 — nothing but two close sisters on a spring walk: a butterfly, dandelion
// fluff flying off, the bakery, sharing buns, a long sunset shadow, "same again tomorrow".
// Same tune as the other variants (songs/fuwa-fuwa-fuwa/frame.mjs).
import { buildSong } from '../fuwa-fuwa-fuwa/frame.mjs';

export const { meta, sections, lyrics } = buildSong({
  title: 'さんぽ',
  version: 1,
  mood: 'bright',
  lyrics: {
    verse1: [
      'おさんぽ びより', 'まってたのだ', 'はるの かぜだね', 'はなの かおり',
      'みて ちょうちょ', 'まって ほしいのだ', 'ころばないで', 'へいきなのだ',
      'たんぽぽの みち', 'わたげなのだ', 'ふいてみて', 'とんでいったのだ',
      'どこへ いくの', 'ないしょなのだ', 'おいかけよ', 'せえの',
    ],
    chorus: ['わたげ とぶ', 'てくてく のんびり', 'かぜと あそぶよ', 'つむぎと いくのだ', 'てを つないでね'],
    verse2: ['ぱんの においだ', 'かって いこう', 'くりいむなのだ', 'わたしわ ちょこ', 'わけっこ するのだ', 'はい どうぞね', 'おいしいのだ', 'せえの'],
    bridge: ['ゆうやけだ', 'ゆうやけだ', 'ながい かげ', 'ながい かげ', 'また いこうね', 'やくそくなのだ', 'だいすき だいすき'],
    outro: ['おうち かえろう', 'おなか すいたのだ', 'また あした'],
  },
  // 「やくそくなのだ」 needs one more note than the echo slot has; つむぎ's second 「い」 of 「だいすき」
  // went breathy on G4 (talk QA), so it moves up to A4
  overrides: { bridge: { 5: { z: 'A4 C#5 B4 A4 B4 C#5 A4:4' }, 6: { a: 'G4 G4 F#4 G4 A4 A4 F#4 E4:4' } } },
});
