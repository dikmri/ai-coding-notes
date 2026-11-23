// 晩ごはん D（−40,000 円以下、逆万発）: 閉まった店の前のベンチで、パチンコ屋でもらった飴を 1 つ。雨はゲームが pixelfx の rain を重ねる。
import { sitter } from './meal-common.mjs';

export function make(d) {
  d.rect(0, 0, 208, 136, 'night0');
  // 閉まったシャッターと、半分消えた看板
  d.rect(20, 8, 168, 20, 'red0').rect(22, 10, 164, 16, 'shade1');
  for (let x = 30; x < 180; x += 16) d.rect(x, 14, 10, 8, x % 32 ? 'pnk0' : 'pur0');
  d.rect(20, 28, 168, 70, 'shutter');
  for (let y = 30; y < 98; y += 4) d.rect(20, y, 168, 1, 'gray0');
  d.rect(96, 88, 16, 3, 'gray0');
  // 歩道（濡れて光る）
  d.rect(0, 98, 208, 38, 'shade1');
  for (let x = 0; x < 208; x += 20) d.rect(x, 98, 1, 38, 'shade0');
  d.rect(30, 116, 40, 2, 'pale0').rect(130, 124, 50, 2, 'pale0').rect(120, 108, 24, 1, 'pnk0');
  // 街灯の光
  d.sparse(128, 30, 50, 68, 'pale0');
  d.rect(176, 10, 3, 88, 'gray0').rect(166, 8, 14, 3, 'gray0').rect(166, 11, 8, 3, 'gold3');
  // ベンチ
  d.rect(60, 86, 96, 5, 'brn1').rect(60, 86, 96, 1, 'brn2').rect(66, 91, 4, 14, 'gray0').rect(146, 91, 4, 14, 'gray0');
  d.rect(60, 72, 96, 4, 'brn1').rect(64, 76, 3, 10, 'gray0').rect(149, 76, 3, 10, 'gray0');
  // 主人公（ひとり）と飴
  sitter(d, 104, 56, { mood: 'despair', arm: 'hold', hunch: 3 });
  d.rect(120, 66, 5, 5, 'pnk0').rect(121, 67, 2, 2, 'pnk1').poly([[119, 68], [116, 65], [116, 71]], 'white').poly([[126, 68], [129, 65], [129, 71]], 'white');
  // 足もとの水たまりと、通りすがりの猫
  d.oval(84, 116, 40, 6, 'night1').line(90, 118, 116, 118, 'pale1');
  d.rows(176, 104, ['.I...I...', '.IIIII...', 'IIWIWII..', 'IIIIIII..', '.IIIIIIII', '.I.I.I.I.'], { I: 'ink', W: 'gold2' });
}
export const asset = { name: 'meal-d', w: 208, h: 136, make };
