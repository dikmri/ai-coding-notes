// 自動ドア（48×44 × 3）: 0 閉まる 1 半分 2 開く。ガラスの奥に店の中（赤いじゅうたんと台の光）が見える。
function inside(d) {
  d.rect(0, 0, 48, 44, 'shade0').rect(0, 0, 48, 6, 'gold3').rect(0, 6, 48, 2, 'gold1');
  for (let x = 2; x < 48; x += 9) { d.rect(x, 12, 7, 20, 'shade2').rect(x + 1, 14, 5, 5, ['pnk0', 'gold2', 'blu3', 'grn3', 'org2', 'pur2'][(x / 9) | 0]).rect(x + 1, 21, 5, 2, 'gray2'); }
  d.rect(0, 32, 48, 12, 'red1');
  for (let x = 0; x < 48; x += 6) d.px(x + 3, 36, 'gold1').px(x, 40, 'gold1');
}
function panel(d, x, w) {
  if (w <= 0) return;
  d.rect(x, 0, w, 44, 'gray2').rect(x + 1, 1, Math.max(0, w - 2), 42, 'gray3');
  if (w > 4) {
    d.dither(x + 2, 2, w - 4, 40, 'blu1', 0);
    d.line(x + 3, 30, x + Math.min(w - 3, 12), 6, 'white');
    if (w > 14) d.line(x + 8, 36, x + Math.min(w - 3, 17), 18, 'blu4');
    d.rect(x + (x < 24 ? w - 4 : 2), 18, 2, 10, 'gray1');
  }
}
export function make(d) {
  [0, 10, 21].forEach((open, i) => {
    d.frame(i);
    inside(d);
    panel(d, 0 - open, 24); panel(d, 24 + open, 24);
    d.rect(0, 0, 48, 1, 'gray1').rect(23 - open, 0, 1, 44, open ? 'gray1' : 'gray0');
  });
}
export const asset = { name: 'doors', w: 48, h: 44, frames: 3, make };
