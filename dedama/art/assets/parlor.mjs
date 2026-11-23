// 店の中（384×216）。台選びの背景。台そのものは machines の絵をゲームが x = 12 + 60i、y = 34 に置く。
export function make(d) {
  // 天井と照明
  d.rect(0, 0, 384, 22, 'shade0');
  for (let x = 8; x < 384; x += 48) d.rect(x, 3, 32, 4, 'gold3').rect(x + 2, 7, 28, 1, 'gold1');
  d.rect(0, 12, 384, 2, 'shade2');
  // 壁（台の後ろ）と柱
  d.rect(0, 22, 384, 118, 'shade1');
  for (let y = 24; y < 140; y += 6) d.rect(0, y, 384, 1, 'shade0');
  d.rect(0, 28, 10, 112, 'gray0').rect(374, 28, 10, 112, 'gray0').rect(2, 28, 2, 112, 'gray1').rect(376, 28, 2, 112, 'gray1');
  // 台の上のデータカウンター（赤い数字の小窓）
  for (let i = 0; i < 6; i++) {
    const x = 12 + i * 60;
    d.rect(x + 12, 14, 36, 14, 'gray0').rect(x + 13, 15, 34, 12, 'ink');
    for (let k = 0; k < 4; k++) d.rect(x + 16 + k * 7, 17, 5, 8, 'red0').rect(x + 17 + k * 7, 18, 3, 1, 'red3').rect(x + 17 + k * 7, 21, 3, 1, 'red3').rect(x + 17 + k * 7, 24, 3, 1, 'red3');
    d.rect(x + 28, 28, 4, 6, 'gray0');
  }
  // 台の島の下の台座
  d.rect(8, 136, 368, 8, 'brn1').rect(8, 136, 368, 2, 'brn2');
  // じゅうたん（菱形の模様）
  d.rect(0, 144, 384, 72, 'red1');
  for (let y = 148; y < 216; y += 12) for (let x = (y / 12) % 2 ? 6 : 0; x < 384; x += 12) d.poly([[x + 6, y - 3], [x + 9, y], [x + 6, y + 3], [x + 3, y]], 'red2').px(x + 6, y, 'gold1');
  for (let y = 154; y < 216; y += 12) d.rect(0, y, 384, 1, 'red0');
  // 丸い椅子
  for (let i = 0; i < 6; i++) {
    const x = 12 + i * 60 + 18;
    d.rect(x + 10, 142, 4, 10, 'gray2').oval(x + 2, 150, 20, 6, 'gray0');
    d.oval(x, 136, 24, 9, 'shade2').oval(x + 2, 137, 20, 5, 'red2').line(x + 5, 138, x + 15, 138, 'red3');
  }
}
export const asset = { name: 'parlor', w: 384, h: 216, make, preview: 2 };
