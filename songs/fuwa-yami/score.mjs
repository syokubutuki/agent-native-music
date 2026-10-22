// 「ふわ ふわ ふわ。」〈やみ〉 — the dark variant: two little ghosts floating over their old town at night.
// Nobody answers, there are white flowers, a bell calls from far away; they hold hands and drift on.
// Same tune as the other variants (songs/fuwa-fuwa-fuwa/frame.mjs), leaning on B minor, darker and wetter.
import { buildSong } from '../fuwa-fuwa-fuwa/frame.mjs';

export const { meta, sections, lyrics } = buildSong({
  title: 'やみ',
  version: 1,
  mood: 'dark',
  lyrics: {
    verse1: [
      'からだが かるい', 'とんでるのだ', 'かげが みえない', 'ふしぎなのだ',
      'まどの おく', 'だれか ないてるの', 'しろい おはな', 'だれの なのだ',
      'へんじが ないの', 'つめたいのだ', 'てを つなご', 'ずっと にぎるのだ',
      'よるに しずむ', 'ほしが きえた', 'おいでって', 'いこう',
    ],
    chorus: ['とおくまで', 'かえりみち きえた', 'よるに とけてく', 'それでも いいのだ', 'ふたり ならんで'],
    verse2: ['さむい ひ なのだ', 'しろい ひかり', 'そこから なにも', 'おぼえてない', 'つむぎわ いたのだ', 'ずっと いたよ', 'よかったのだ', 'いこう'],
    bridge: ['かねの おと', 'かねの おと', 'とおくから', 'とおくから', 'わたしたちを', 'よんでるのだ', 'てを はなさないで'],
    outro: ['よあけの まえに', 'きえても いいのだ', 'ふたりなら'],
  },
});
