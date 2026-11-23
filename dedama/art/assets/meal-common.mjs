// 晩ごはんの場面で共通の部品（208×136 の絵の中で使う）
// 座った主人公（右向き、頭の中心が (x, y)）。mood: joy | happy | flat | sad | despair、arm: rest | cup | up | hold
export function sitter(d, x, y, { mood = 'flat', arm = 'rest', hunch = 0, seat = null } = {}) {
  const pale = mood === 'despair';
  const S = pale ? 'pale1' : 'skin3', S2 = pale ? 'pale0' : 'skin2';
  const hx = x + hunch, hy = y + hunch;
  // 座った脚と椅子（seat は床の高さ）
  if (seat) {
    d.rect(x - 4, y + 32, 10, seat - y - 36, 'gray1').rect(x - 10, y + 30, 22, 3, 'shade2').rect(x - 8, seat - 4, 18, 4, 'gray0');
    d.line(x - 6, y + 29, x + 12, y + 30, 'blu1', 5).line(x + 13, y + 31, x + 14, seat - 4, 'blu1', 4).rect(x + 12, seat - 4, 7, 3, 'white');
  }
  // 体（赤いジャージ）
  d.poly([[x - 9, y + 9], [x + 7, y + 9], [x + 10, y + 30], [x - 11, y + 30]], 'red2');
  d.poly([[x - 9, y + 9], [x - 3, y + 9], [x - 5, y + 30], [x - 11, y + 30]], 'red1');
  d.line(x + 5, y + 10, x + 7, y + 29, 'white');
  d.rect(x - 1, y + 6, 6, 4, S2);
  // 腕
  if (arm === 'cup' || arm === 'hold') d.line(x + 2, y + 13, x + 12, y + 20, 'red2', 3).line(x + 12, y + 20, x + 17, y + 15, 'red2', 3).rect(x + 16, y + 12, 3, 3, S);
  else if (arm === 'up') d.line(x + 2, y + 12, x + 12, y + 6, 'red2', 3).line(x + 12, y + 6, x + 15, y - 4, 'red2', 3).rect(x + 14, y - 7, 3, 3, S);
  else d.line(x + 2, y + 13, x + 9, y + 24, 'red2', 3).line(x + 9, y + 24, x + 16, y + 24, 'red2', 3).rect(x + 16, y + 23, 3, 2, S);
  // 頭
  d.oval(hx - 7, hy - 8, 15, 15, S).oval(hx - 7, hy - 7, 6, 12, S2).oval(hx - 6, hy - 7, 7, 12, S);
  d.poly([[hx - 8, hy + 1], [hx - 9, hy - 5], [hx - 5, hy - 10], [hx + 1, hy - 11], [hx + 6, hy - 9], [hx + 8, hy - 5], [hx + 4, hy - 6], [hx, hy - 4], [hx - 4, hy - 5], [hx - 6, hy + 2]], 'shade0');
  d.poly([[hx - 4, hy - 10], [hx - 6, hy - 13], [hx - 1, hy - 11]], 'shade0').poly([[hx + 3, hy - 10], [hx + 6, hy - 13], [hx + 6, hy - 9]], 'shade0');
  d.px(hx - 5, hy, S2);
  const ex = hx + 2, ey = hy - 1;
  if (mood === 'joy') { d.rows(ex - 2, ey - 1, ['.I...I.', 'I.I.I.I'], { I: 'ink' }); d.rows(hx, hy + 2, ['IIIIII', 'IWWWWI', 'IRRRRI', '.IIII.'], { I: 'ink', W: 'white', R: 'red3' }); d.rect(hx - 2, hy + 1, 2, 1, 'pnk0').rect(hx + 6, hy + 1, 2, 1, 'pnk0'); }
  else if (mood === 'happy') { d.rows(ex - 1, ey, ['.I..I.', 'I.II.I'], { I: 'ink' }); d.rows(hx + 1, hy + 3, ['IIII', '.II.'], { I: 'ink' }); d.px(hx - 1, hy + 2, 'pnk1'); }
  else if (mood === 'flat') { d.px(ex, ey, 'ink').px(ex + 3, ey, 'ink').line(hx + 2, hy + 4, hx + 4, hy + 4, 'skin1'); }
  else if (mood === 'sad') { d.rows(ex - 1, ey - 2, ['I....I', '.I..I.', '......', '.I..I.'], { I: 'ink' }); d.rows(hx + 1, hy + 4, ['.II.', 'I..I'], { I: 'skin0' }); d.px(hx + 6, hy - 4, 'blu3').px(hx + 6, hy - 3, 'blu4'); }
  else if (mood === 'despair') { d.rows(ex - 1, ey - 1, ['.I..I.', 'IWI.IWI'.slice(0, 6), '.I..I.'], { I: 'gray0', W: 'white' }); d.oval(hx + 2, hy + 3, 3, 3, 'ink'); for (let k = 0; k < 4; k++) d.line(hx - 3 + k * 3, hy - 7, hx - 3 + k * 3, hy - 4, 'blu1'); }
}

// 着物の女性（お酌と接客の姿。頭の中心が (x, y)、facing: 1 右向き / -1 左向き）
export function hostess(d, x, y, { kimono = 'pnk1', pattern = 'pnk0', obi = 'gold2', facing = 1, pour = false, floor = null } = {}) {
  const f = facing;
  // 着物
  const bottom = floor ?? y + 34;
  d.poly([[x - 8, y + 9], [x + 8, y + 9], [x + 12, bottom], [x - 12, bottom]], kimono);
  if (floor) { d.line(x - 12, bottom - 1, x + 12, bottom - 1, pattern); for (let yy = y + 40; yy < bottom - 4; yy += 9) d.px(x - 5 + ((yy / 9) % 3) * 4, yy, pattern).px(x - 4 + ((yy / 9) % 3) * 4, yy, pattern); }
  d.poly([[x - 1, y + 8], [x + 3 * f, y + 8], [x + 1, y + 16], [x - 2 * f, y + 16]], 'white'); // 衿
  d.rect(x - 9, y + 17, 19, 5, obi).line(x - 9, y + 19, x + 9, y + 19, 'gold1');
  for (const [dx, dy] of [[-6, 25], [4, 28], [-2, 31], [7, 23]]) d.px(x + dx, y + dy, pattern).px(x + dx + 1, y + dy, pattern);
  // 腕（お酌は徳利を持って前へ）
  if (pour) {
    d.line(x + 3 * f, y + 12, x + 14 * f, y + 14, kimono, 3);
    d.rect(x + (f > 0 ? 14 : -18), y + 7, 5, 9, 'white').rect(x + (f > 0 ? 15 : -17), y + 5, 3, 2, 'white').rect(x + (f > 0 ? 14 : -18), y + 10, 5, 1, 'blu1');
    d.px(x + (f > 0 ? 19 : -19), y + 15, 'blu4').px(x + (f > 0 ? 20 : -20), y + 17, 'blu4'); // 注ぐ酒
  } else d.line(x - 4, y + 15, x + 5, y + 15, kimono, 3).rect(x - 1, y + 14, 4, 3, 'skin4');
  // 頭（日本髪をまとめた形）
  d.oval(x - 6, y - 6, 13, 14, 'skin4').oval(x - 7, y - 10, 15, 9, 'ink').oval(x - 4, y - 15, 9, 7, 'ink');
  d.rect(x - 7 * f - (f > 0 ? 0 : 1), y - 5, 2, 9, 'ink');
  d.px(x + 4, y - 13, 'gold2').px(x + 5, y - 14, 'red3').px(x - 3, y - 12, 'gold2'); // かんざし
  // 顔（目を細めた笑顔）
  d.rows(x - 2 + f, y, ['I..I', '....', '.RR.'], { I: 'ink', R: 'red2' });
  d.px(x - 3 + f, y + 2, 'pnk1').px(x + 4 + f, y + 2, 'pnk1');
}
