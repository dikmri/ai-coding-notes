// 店の前の通り（384×216）。昼の絵を描き、夜はパレットだけを替えて書き出す（CyberSprite はパレット番号で絵を持つので、色の置き換えだけで済む）。
// 大きさは Frostwind の縮尺（1.70 m = 26 画素、1 m ≈ 15 画素）。店の名前と、のぼりの文字はゲームが上から描く。
import { PALETTE, nightPalette } from '../lib.mjs';

export function make(d) {
  // 空
  d.rect(0, 0, 384, 40, 'sky0').rect(0, 40, 384, 40, 'sky1').rect(0, 80, 384, 96, 'sky2');
  d.dither(0, 38, 384, 4, 'sky1', 0).dither(0, 78, 384, 4, 'sky2', 0);
  for (const [x, y, w] of [[20, 18, 40], [96, 28, 28], [318, 14, 46]]) d.oval(x, y, w, 10, 'pale2').oval(x + 6, y - 4, w * 0.6, 10, 'pale2').rect(x + 4, y + 7, w - 8, 2, 'pale1');
  // 左の建物（事務所の入った雑居ビル）
  d.rect(0, 60, 92, 118, 'gray1').rect(0, 60, 92, 3, 'gray2').rect(88, 60, 4, 118, 'gray0');
  for (let y = 70; y < 160; y += 18) for (let x = 6; x < 84; x += 16) d.rect(x, y, 11, 11, 'win').rect(x, y, 11, 1, 'gray0').px(x + 2, y + 2, 'white').rect(x + 5, y, 1, 11, 'gray1');
  d.rect(30, 158, 30, 18, 'shade1').rect(32, 160, 26, 16, 'win').rect(44, 160, 2, 16, 'gray1');
  // 電柱と電線
  d.rect(140, 30, 4, 148, 'brn1').rect(136, 40, 12, 2, 'brn0').rect(137, 52, 10, 2, 'brn0');
  d.line(0, 44, 140, 41, 'shade1').line(144, 41, 384, 47, 'shade1').line(0, 55, 140, 53, 'shade1').line(144, 53, 384, 59, 'shade1');
  // 街灯（灯りは夜に光る色）
  d.rect(110, 106, 3, 70, 'gray0').rect(110, 104, 14, 3, 'gray0').rect(120, 106, 8, 4, 'gray1').rect(121, 110, 6, 2, 'gold3');
  // 自販機
  d.rect(94, 138, 18, 38, 'blu1').rect(95, 139, 16, 36, 'blu2').rect(96, 141, 14, 12, 'win');
  for (let i = 0; i < 4; i++) d.rect(97 + i * 3, 143, 2, 4, ['red2', 'org2', 'grn2', 'gold2'][i]).rect(97 + i * 3, 148, 2, 4, ['gold2', 'red2', 'org2', 'grn2'][i]);
  d.rect(97, 155, 12, 2, 'gray3').rect(100, 166, 8, 5, 'shade0').rect(96, 159, 2, 2, 'red3');
  // 店（ドル箱会館）
  const BX = 150, BW = 212;
  d.rect(BX, 30, BW, 146, 'gray3').rect(BX, 30, BW, 3, 'white').rect(BX + BW - 4, 30, 4, 146, 'gray2');
  for (let x = BX + 8; x < BX + BW - 8; x += 12) d.rect(x, 66, 1, 52, 'gray2');
  // 看板（名前はゲームが描く）と電球
  d.rect(BX + 8, 34, BW - 16, 30, 'gold1').rect(BX + 10, 36, BW - 20, 26, 'red1').rect(BX + 12, 38, BW - 24, 22, 'red2');
  for (let x = BX + 10; x < BX + BW - 10; x += 4) d.px(x, 35, 'gold2').px(x + 2, 62, 'gold2');
  for (let y = 37; y < 62; y += 4) d.px(BX + 9, y, 'gold2').px(BX + BW - 10, y, 'gold2');
  // 窓（中の台が見える）
  d.rect(BX + 10, 72, BW - 20, 42, 'gray1').rect(BX + 12, 74, BW - 24, 38, 'win');
  for (let x = BX + 16; x < BX + BW - 16; x += 14) {
    d.rect(x, 82, 10, 26, 'blu1').rect(x + 2, 86, 6, 6, ['pnk0', 'gold2', 'blu3', 'grn3'][((x - BX) / 14) % 4 | 0]).rect(x + 1, 102, 8, 3, 'gray2');
  }
  d.line(BX + 14, 74, BX + 34, 112, 'white').line(BX + 20, 74, BX + 40, 112, 'pale2').line(BX + 120, 74, BX + 140, 112, 'pale2');
  // ネオンの線
  d.line(BX + 6, 68, BX + BW - 6, 68, 'pnk0').line(BX + 6, 116, BX + BW - 6, 116, 'blu3');
  // ひさしと入り口の枠
  d.rect(208, 118, 84, 12, 'red1');
  for (let x = 208; x < 292; x += 8) d.rect(x, 118, 4, 12, 'white');
  d.rect(206, 129, 88, 2, 'red0').rect(222, 130, 56, 46, 'gold1').rect(224, 131, 52, 45, 'gold0');
  // のぼり（文字はゲームが描く）
  for (const [x, c] of [[194, 'red2'], [298, 'blu2']]) d.rect(x, 116, 2, 60, 'gray2').rect(x + 2, 118, 10, 46, c).rect(x + 2, 118, 10, 2, 'white').rect(x + 4, 121, 6, 40, 'white');
  // 自転車置き場
  for (const x of [160, 176]) { d.oval(x, 166, 9, 9, 'shade1', false).oval(x + 11, 166, 9, 9, 'shade1', false).line(x + 4, 170, x + 10, 164, 'red1').line(x + 10, 164, x + 15, 170, 'red1').line(x + 9, 164, x + 13, 164, 'shade1'); }
  // 歩道・縁石・道路
  d.rect(0, 176, 384, 24, 'gray2');
  for (let x = 0; x < 384; x += 16) d.rect(x, 176, 1, 24, 'gray1');
  d.rect(0, 187, 384, 1, 'gray1').rect(0, 196, 384, 4, 'gray3').rect(0, 199, 384, 1, 'gray1');
  d.rect(0, 200, 384, 16, 'shade1');
  for (let x = 4; x < 384; x += 32) d.rect(x, 208, 16, 2, 'gray2');
}
export const asset = { name: 'street', w: 384, h: 216, make, palettes: [['street', PALETTE], ['street-night', nightPalette()]], preview: 2 };
