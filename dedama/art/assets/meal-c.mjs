// 晩ごはん C（−40,000 円まで）: 裸電球の下のもやし炒め。空の財布、丸を付けた給料日。
import { sitter } from './meal-common.mjs';

export function make(d) {
  d.rect(0, 0, 208, 136, 'shade0');
  // 裸電球と、照らされた輪
  d.oval(44, 20, 120, 110, 'shade1').oval(64, 34, 80, 80, 'shade2');
  d.line(104, 0, 104, 14, 'gray0').rect(101, 14, 7, 4, 'gray1').oval(100, 17, 9, 10, 'gold3').px(103, 20, 'white');
  // カレンダー（給料日に赤丸、あと 9 日）
  d.rect(150, 20, 34, 30, 'gray3').rect(150, 20, 34, 6, 'red1');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) d.px(154 + c * 5, 30 + r * 5, 'gray1');
  d.oval(170, 41, 7, 6, 'red2', false);
  // 主人公（背中を丸めて）
  sitter(d, 104, 56, { mood: 'sad', arm: 'hold', hunch: 2 });
  // 机ともやし
  d.rect(30, 90, 148, 46, 'brn0').rect(30, 90, 148, 3, 'brn1');
  d.oval(84, 82, 40, 12, 'gray3').oval(86, 83, 36, 8, 'white');
  for (let k = 0; k < 22; k++) { const x = 90 + ((k * 23) % 28), y = 84 + ((k * 7) % 5); d.line(x, y, x + 3, y + 1, k % 6 ? 'gray3' : 'grn3'); }
  d.rect(136, 76, 9, 14, 'blu4').rect(137, 78, 7, 11, 'pale2'); // 水
  // 空の財布
  d.rect(46, 98, 24, 14, 'brn1').rect(46, 98, 24, 3, 'brn2').rect(50, 101, 16, 8, 'brn0');
  d.rows(52, 102, ['....', '.I.I', '....'], { I: 'gray0' });
}
export const asset = { name: 'meal-c', w: 208, h: 136, make };
