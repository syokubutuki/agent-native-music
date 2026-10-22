// 「ふわ ふわ ふわ。」〈けんか〉 — sweet on the surface, 不和 (ふわ) flickering underneath: one pudding,
// ずんだもん takes the bigger half, つむぎ smiles a bit too much. The hook doubles as "不和 不和 不和。".
// Same tune as the other variants; two sour chords (Gm6, borrowed from D minor) where the sting lands.
import { buildSong } from '../fuwa-fuwa-fuwa/frame.mjs';

export const { meta, sections, lyrics } = buildSong({
  title: 'けんか',
  version: 1,
  mood: 'bright',
  chords: {
    // 「そう だと いいね」 and 「そうですか」 land on Gm6
    chorus: ['Gmaj7', 'A', 'F#m7', 'Bm7', 'Em7', 'A', 'Dmaj7', 'Gm6'],
    verse1: ['Dmaj7', 'Bm7', 'Gmaj7', 'A', 'Dmaj7', 'Bm7', 'Gmaj7', 'A', 'Em7', 'F#m7', 'Gmaj7', 'A', 'Em7', 'F#m7', 'Gm6', 'A'],
  },
  lyrics: {
    verse1: [
      'おやつの じかん', 'ぷりんなのだ', 'ひとつだけ だね', 'はんぶんこ だ',
      'ありがとう', 'こっちが ぼくのだ', 'おおきい ほう', 'おなじなのだ',
      'ふうん そうだね', 'おいしいのだ', 'よかったね', 'ひとくち いるのだ',
      'いらないかな', 'おこったのだ', 'そうですか', 'せえの',
    ],
    chorus: ['なかよしね', 'にこにこ にこにこ', 'ちょっぴり ちくり', 'なかよしなのだよ', 'そう だと いいね'],
    verse2: ['かるた するのだ', 'また それ なの', 'ぼくが かつのだ', 'いつも そうね', 'つむぎ よわいのだ', 'てかげんだよ', 'まけおしみだ', 'せえの'],
    bridge: ['いつだって', 'なんなのだ', 'がまんして', 'どうしてだ', 'いえない こと', 'ごめんなのだ', 'はんぶんこ しよう'],
    outro: ['つぎわ わたしね', 'かんがえとくのだ', 'なかよしね'],
  },
});
