// 主人公の顔（48×48 × 6 表情）: 0 ふつう（眠そう）1 まばたき 2 喜ぶ 3 脳汁 4 落ちこむ 5 絶望
// 少し右を向いた顔。髪はぼさぼさ、無精ひげ、赤いジャージ。
const SKIN = { base: 'skin3', shade: 'skin2', deep: 'skin1', light: 'skin4' };
const PALE = { base: 'pale1', shade: 'pale0', deep: 'gray0', light: 'pale2' };

function face(d, kind) {
  const k = kind === 'despair' ? PALE : SKIN;
  // 肩とジャージ
  d.poly([[4, 47], [8, 39], [17, 35], [31, 35], [40, 39], [44, 47]], 'red2');
  d.poly([[4, 47], [8, 39], [14, 36], [12, 47]], 'red1');
  d.poly([[20, 35], [28, 35], [26, 42], [22, 42]], 'white');
  d.line(24, 42, 24, 47, 'gray2').line(23, 42, 23, 47, 'white');
  d.line(9, 40, 13, 47, 'white'); // 袖の白い線
  d.rect(20, 31, 9, 5, k.shade); // 首
  // 頭
  d.oval(11, 7, 27, 28, k.base);
  d.oval(11, 9, 10, 24, k.shade);
  d.oval(13, 9, 10, 22, k.base);
  d.oval(8, 17, 6, 8, k.shade).px(10, 20, k.deep).px(10, 21, k.deep); // 耳
  // 無精ひげ（あごの網掛け）
  if (kind !== 'despair') for (let y = 28; y < 34; y++) for (let x = 17; x < 34; x++) if (((x + y) & 1) === 0 && (x - 25) ** 2 / 64 + (y - 27) ** 2 / 49 < 1) d.px(x, y, k.shade);
  // 髪（ぼさぼさ）
  d.poly([[9, 19], [8, 11], [12, 5], [18, 2], [27, 2], [34, 5], [39, 10], [39, 15], [35, 12], [30, 12], [26, 9], [22, 12], [17, 12], [13, 16], [12, 22]], 'shade0');
  d.poly([[14, 4], [11, 0], [19, 3]], 'shade0').poly([[26, 3], [30, 0], [31, 5]], 'shade0').poly([[35, 6], [41, 5], [38, 10]], 'shade0');
  d.line(18, 4, 26, 3, 'shade2').line(28, 5, 33, 7, 'shade2');
  // 鼻と口のまわり
  d.px(31, 24, k.shade).px(31, 25, k.shade).px(30, 25, k.deep);
}
function eyes(d, kind) {
  const L = 18, R = 27, Y = 19;
  const both = (rows, legend) => { d.rows(L, Y, rows, legend); d.rows(R, Y, rows, legend); };
  if (kind === 'normal') {
    both(['IIIII', 'WPPW.', '.....'], { I: 'ink', W: 'white', P: 'ink' });
    d.line(L, Y + 3, L + 3, Y + 3, 'skin2').line(R, Y + 3, R + 3, Y + 3, 'skin2'); // くま
    d.line(L, Y - 3, L + 4, Y - 3, 'shade0').line(R, Y - 3, R + 4, Y - 3, 'shade0');
  } else if (kind === 'blink') {
    both(['.....', 'IIIII', '.....'], { I: 'ink' });
    d.line(L, Y - 3, L + 4, Y - 3, 'shade0').line(R, Y - 3, R + 4, Y - 3, 'shade0');
  } else if (kind === 'happy') {
    both(['.III.', 'I...I', '.....'], { I: 'ink' });
    d.line(L, Y - 4, L + 4, Y - 5, 'shade0').line(R, Y - 5, R + 4, Y - 4, 'shade0');
    d.rect(L - 2, Y + 4, 3, 2, 'pnk1').rect(R + 4, Y + 4, 3, 2, 'pnk1');
  } else if (kind === 'joy') {
    // 脳汁: 目が金の星
    const star = ['..G..', '.GGG.', 'GGWGG', '.GGG.', '..G..'];
    d.rows(L - 1, Y - 2, star, { G: 'gold2', W: 'white' }).rows(R, Y - 2, star, { G: 'gold2', W: 'white' });
    d.line(L - 1, Y - 6, L + 4, Y - 7, 'shade0').line(R, Y - 7, R + 5, Y - 6, 'shade0');
    d.rect(L - 3, Y + 4, 4, 2, 'pnk0').rect(R + 4, Y + 4, 4, 2, 'pnk0');
  } else if (kind === 'sad') {
    both(['IIII.', 'WPPW.', '.....'], { I: 'ink', W: 'white', P: 'ink' });
    d.line(L, Y - 3, L + 4, Y - 5, 'shade0').line(R, Y - 5, R + 4, Y - 3, 'shade0'); // 八の字の眉
    d.line(R + 1, Y + 2, R + 1, Y + 7, 'blu3').px(R + 1, Y + 8, 'blu4'); // 涙
  } else if (kind === 'despair') {
    both(['.III.', 'IWWWI', '.III.'], { I: 'gray0', W: 'white' });
    for (let x = 16; x < 34; x += 3) d.line(x, 8, x, 14, 'blu1'); // 青い縦線
  }
}
function mouth(d, kind) {
  const x = 22, y = 28;
  if (kind === 'normal' || kind === 'blink') d.line(x + 1, y, x + 5, y, 'skin1');
  else if (kind === 'happy') d.rows(x, y - 1, ['IIIIIII', '.IRRRI.', '..III..'], { I: 'ink', R: 'red3' });
  else if (kind === 'joy') d.rows(x - 1, y - 2, ['IIIIIIIII', 'IWWWWWWWI', 'IRRRRRRRI', '.IRRPPRI.', '..IIIII..'], { I: 'ink', W: 'white', R: 'red1', P: 'red3' });
  else if (kind === 'sad') d.rows(x, y, ['.II.II.', 'I..I..I'], { I: 'skin0' });
  else if (kind === 'despair') d.oval(x + 1, y - 2, 6, 6, 'ink');
}
function extras(d, kind) {
  if (kind === 'joy') {
    for (const [x, y] of [[4, 6], [42, 14], [6, 30], [43, 30]]) d.px(x, y, 'gold3').px(x - 1, y, 'gold2').px(x + 1, y, 'gold2').px(x, y - 1, 'gold2').px(x, y + 1, 'gold2');
    d.rows(38, 15, ['.B.', 'BBB', 'BWB', '.B.'], { B: 'blu3', W: 'white' }); // 汗
  }
  if (kind === 'despair') {
    // 口から抜ける魂
    d.rows(26, 14, [
      '.............WWWW.',
      '............WWWWWW',
      '...........WWIWWIW',
      '...........WWWWWWW',
      '............WWWWW.',
      '..........WWWWW...',
      '........WWWW......',
      '......WWW.........',
      '....WWW...........',
      '...WW.............',
      '..WW..............',
      '..W...............',
      '..W...............',
      '.W................',
    ], { W: 'white', I: 'gray1' });
  }
}

const KINDS = ['normal', 'blink', 'happy', 'joy', 'sad', 'despair'];
export function make(d) {
  KINDS.forEach((kind, i) => {
    d.frame(i);
    face(d, kind); eyes(d, kind); mouth(d, kind); extras(d, kind);
    d.outline('ink', { connectivity: 4 });
  });
}
export const asset = { name: 'bust', w: 48, h: 48, frames: 6, make };
