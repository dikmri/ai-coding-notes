// 晩ごはん A（+15,000 円以上）: 焼肉。網の上の肉、ジョッキのビール、赤ちょうちん。
import { sitter } from './meal-common.mjs';

export function make(d) {
  // 板張りの壁とお品書き
  d.rect(0, 0, 208, 136, 'brn1');
  for (let x = 0; x < 208; x += 12) d.rect(x, 0, 1, 90, 'brn0');
  for (let i = 0; i < 9; i++) d.rect(8 + i * 14, 8, 10, 26, 'gray3').rect(9 + i * 14, 9, 8, 24, 'white').line(13 + i * 14, 12, 13 + i * 14, 29, 'ink').rect(12 + i * 14, 30, 3, 2, 'red2');
  // 赤ちょうちん
  d.oval(164, 6, 26, 32, 'red2').oval(168, 10, 8, 22, 'red3').rect(170, 4, 14, 3, 'ink').rect(170, 36, 14, 3, 'ink');
  d.line(166, 14, 188, 14, 'red1').line(165, 22, 189, 22, 'red1').line(166, 30, 188, 30, 'red1');
  // 排気のダクト
  d.rect(86, 0, 30, 30, 'gray1').rect(88, 0, 4, 30, 'gray2').rect(80, 30, 42, 8, 'gray0').rect(80, 30, 42, 2, 'gray2');
  // 机と七輪の網
  d.rect(0, 84, 208, 52, 'brn0').rect(0, 84, 208, 4, 'brn2').rect(0, 88, 208, 2, 'brn1');
  d.oval(62, 70, 80, 26, 'gray0').oval(64, 72, 76, 22, 'ink');
  for (let k = 0; k < 18; k++) d.px(70 + ((k * 37) % 62), 76 + ((k * 13) % 14), k % 3 ? 'red2' : 'org2');
  for (let x = 68; x < 138; x += 6) d.line(x, 73, x, 92, 'gray1');
  for (let y = 75; y < 92; y += 5) d.line(66, y, 138, y, 'gray1');
  // 肉（さしの入ったロース・カルビ）
  for (const [x, y, c] of [[74, 74, 'red2'], [94, 78, 'red3'], [114, 73, 'red2'], [84, 84, 'brn2'], [108, 85, 'red3']]) d.oval(x, y, 16, 8, c).line(x + 3, y + 3, x + 11, y + 5, 'pnk1').px(x + 6, y + 2, 'white');
  // 煙
  for (const [x, y, w] of [[80, 50, 14], [100, 40, 18], [118, 54, 12], [92, 30, 10]]) d.oval(x, y, w, w * 0.8, 'steam').oval(x + 2, y + 2, w * 0.5, w * 0.4, 'white');
  // 皿とたれ
  d.oval(30, 92, 24, 9, 'white').oval(33, 94, 18, 5, 'gray3').oval(36, 95, 8, 3, 'brn1');
  // 主人公とビール
  sitter(d, 168, 60, { mood: 'happy', arm: 'up' });
  d.rect(177, 40, 10, 14, 'gold2').rect(177, 40, 10, 3, 'white').rect(187, 44, 3, 7, 'gray3').rect(179, 45, 2, 7, 'gold3');
}
export const asset = { name: 'meal-a', w: 208, h: 136, make };
