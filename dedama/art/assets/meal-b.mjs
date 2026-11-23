// 晩ごはん B（±15,000 円未満）: 家でカップラーメン。畳の部屋、ちゃぶ台、テレビの青い光。
import { sitter } from './meal-common.mjs';

export function make(d) {
  // 壁と窓（夜）
  d.rect(0, 0, 208, 136, 'shade2');
  d.rect(0, 0, 208, 4, 'brn1');
  d.rect(12, 14, 56, 40, 'brn1').rect(15, 17, 50, 34, 'night1').rect(39, 17, 2, 34, 'brn1').rect(15, 33, 50, 2, 'brn1');
  d.oval(48, 21, 9, 9, 'gold3').oval(50, 21, 9, 9, 'night1');
  for (const [x, y] of [[20, 22], [28, 40], [56, 44], [24, 46]]) d.px(x, y, 'gray3');
  // 壁の時計 23:12
  d.oval(150, 10, 20, 20, 'gray3').oval(152, 12, 16, 16, 'white').line(160, 20, 160, 14, 'ink').line(160, 20, 163, 21, 'ink');
  // 畳
  d.rect(0, 92, 208, 44, 'brn3');
  for (let x = 0; x < 208; x += 52) d.rect(x, 92, 2, 44, 'gold0');
  d.rect(0, 112, 208, 1, 'gold0');
  for (let y = 95; y < 136; y += 3) d.line(0, y, 208, y, 'gold1');
  // テレビ（右手前、青い光）
  d.rect(176, 52, 32, 26, 'ink').rect(178, 54, 28, 20, 'blu2').rect(180, 56, 10, 6, 'blu3').rect(186, 78, 12, 3, 'shade0');
  d.sparse(150, 82, 26, 40, 'blu1');
  // 主人公（ちゃぶ台の向こう）
  sitter(d, 96, 62, { mood: 'flat', arm: 'hold' });
  // ちゃぶ台とカップラーメン
  d.oval(48, 84, 110, 22, 'brn2').oval(50, 85, 106, 18, 'brn3').rect(60, 96, 6, 22, 'brn1').rect(140, 96, 6, 22, 'brn1');
  d.rect(100, 72, 18, 16, 'white').rect(100, 76, 18, 4, 'red2').rect(102, 72, 14, 2, 'gray2').rect(101, 86, 16, 2, 'gray3');
  d.poly([[100, 72], [92, 64], [97, 63], [104, 71]], 'gray3');
  d.line(110, 60, 124, 74, 'brn1').line(111, 60, 125, 74, 'brn0'); // 割りばし
  for (const x of [104, 110, 115]) { d.line(x, 70, x - 2, 64, 'steam').line(x - 2, 64, x + 1, 58, 'steam').line(x + 1, 58, x - 1, 52, 'steam'); }
  // 置きっぱなしのチラシ
  d.rect(26, 120, 22, 12, 'white').rect(28, 122, 18, 3, 'red2').rect(28, 127, 12, 1, 'gray1');
}
export const asset = { name: 'meal-b', w: 208, h: 136, make };
