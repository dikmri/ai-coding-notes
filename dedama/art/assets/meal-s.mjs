// 晩ごはん S（+50,000 円以上）: 高級寿司屋。着物の女性 2 人のお酌、板前さん、金箔の壁。金粉はゲームが pixelfx の gold-dust を重ねる。
import { sitter, hostess } from './meal-common.mjs';

export function make(d) {
  // 金箔の壁と柱
  d.rect(0, 0, 208, 80, 'gold1');
  for (let x = 0; x < 208; x += 20) for (let y = 0; y < 64; y += 16) d.rect(x + 1, y + 1, 18, 14, (x / 20 + y / 16) % 2 ? 'gold2' : 'gold1').px(x + 3, y + 3, 'gold3');
  d.rect(0, 0, 208, 6, 'brn0').rect(0, 6, 208, 2, 'brn1');
  for (const x of [0, 100, 200]) d.rect(x, 8, 8, 72, 'brn1').rect(x + 1, 8, 2, 72, 'brn2');
  // のれん
  d.rect(10, 8, 40, 18, 'blu1');
  for (let x = 10; x < 50; x += 10) d.rect(x + 9, 8, 1, 18, 'blu0');
  d.oval(24, 11, 12, 12, 'white').oval(27, 14, 6, 6, 'blu1');
  // 板前さん（カウンターの奥）
  d.rect(146, 36, 30, 40, 'white').rect(146, 36, 6, 40, 'gray3').line(160, 38, 166, 52, 'gray3');
  d.oval(152, 20, 18, 18, 'skin3').rect(150, 18, 22, 5, 'white').rect(150, 21, 22, 2, 'blu2');
  d.rows(156, 27, ['I...I', '.....', '.III.'], { I: 'ink' });
  d.line(170, 46, 180, 56, 'white', 3).rect(179, 55, 3, 3, 'skin3');
  // ネタケース
  d.rect(92, 58, 116, 18, 'gray2').rect(94, 60, 112, 14, 'blu4');
  d.dither(94, 60, 112, 14, 'white', 1);
  for (let i = 0; i < 7; i++) d.rect(98 + i * 15, 66, 11, 6, ['org2', 'red2', 'white', 'red3', 'gold2', 'org1', 'pnk1'][i]).line(98 + i * 15, 68, 108 + i * 15, 66, 'white');
  // カウンター
  d.rect(0, 76, 208, 8, 'brn3').rect(0, 76, 208, 1, 'gold3').rect(0, 83, 208, 1, 'brn2');
  d.rect(0, 84, 208, 52, 'brn2');
  for (let x = 6; x < 208; x += 13) d.line(x, 86, x + 3, 135, 'brn1');
  d.rect(0, 124, 208, 12, 'brn1');
  // 寿司下駄とにぎり
  d.rect(96, 79, 48, 4, 'brn1').rect(96, 78, 48, 1, 'brn2');
  for (let i = 0; i < 5; i++) {
    const x = 99 + i * 9;
    d.rect(x, 76, 7, 3, 'white').rect(x, 74, 7, 3, ['org2', 'red2', 'gold2', 'red3', 'org2'][i]).px(x + 1, 74, 'white');
    if (i === 2) d.rect(x + 3, 74, 1, 3, 'ink');
  }
  // 女性（左がお酌、右は寄りそって接客）
  hostess(d, 34, 62, { kimono: 'pnk1', pattern: 'pnk0', obi: 'gold2', facing: 1, pour: true, floor: 126 });
  hostess(d, 124, 64, { kimono: 'pur1', pattern: 'pur2', obi: 'gold2', facing: -1, floor: 126 });
  // 主人公
  sitter(d, 74, 66, { mood: 'joy', arm: 'cup', seat: 126 });
  d.rect(89, 74, 5, 4, 'white').rect(90, 74, 3, 1, 'blu4'); // おちょこ
  // 床と光（床は人より先に描く）
  for (const [x, y] of [[60, 20], [118, 10], [196, 40], [20, 44]]) d.px(x, y, 'white').px(x - 1, y, 'gold3').px(x + 1, y, 'gold3').px(x, y - 1, 'gold3').px(x, y + 1, 'gold3');
}
export const asset = { name: 'meal-s', w: 208, h: 136, make };
