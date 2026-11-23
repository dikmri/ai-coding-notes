// 主人公の全身（32×32 × 13 コマ、右向き、足元は y = 31）。
// 0-5 走る / 6-7 立つ / 8 話す / 9-10 跳ぶ / 11 よろける / 12 倒れる
// 手足は関節の角度から線で描く（角度は真下が 0、前（右）が正）。高さは約 27 画素（Frostwind の縮尺で 1.75 m）。
const rad = (a) => (a * Math.PI) / 180;
const vec = (len, a) => [len * Math.sin(rad(a)), len * Math.cos(rad(a))];

// 1 本の手足: 付け根 (x, y)、上の長さ・角度、下の長さ・曲げ（上から後ろへ曲げる角度）
function limb(d, x, y, l1, a1, l2, bend, c, size) {
  const [dx1, dy1] = vec(l1, a1), [dx2, dy2] = vec(l2, a1 - bend);
  const kx = x + dx1, ky = y + dy1, fx = kx + dx2, fy = ky + dy2;
  d.line(x, y, kx, ky, c, size).line(kx, ky, fx, fy, c, size);
  return [fx, fy];
}
function shoe(d, x, y, near) {
  d.rect(x - 1, Math.min(31, y) - 1, 4, 2, near ? 'white' : 'gray2');
  d.px(x + 2, Math.min(31, y), near ? 'gray2' : 'gray1');
}
const HEAD = [
  '..HHHHH.',
  '.HHHHHHH',
  'HHHHHHHh',
  'HHHHSSSH',
  'HHHSSSES',
  'HHSSSSSS',
  '.HSSSSSm',
  '..SSSS..',
];
function head(d, x, y, { mouth = 'n', eye = 'o' } = {}) {
  const rows = HEAD.map((r) => r.replace('m', mouth === 'o' ? 'M' : 'S').replace('E', eye === 'x' ? 'X' : eye === 'h' ? 'S' : 'E'));
  d.rows(Math.round(x) - 4, Math.round(y) - 7, rows, { H: 'shade0', h: 'shade2', S: 'skin3', E: 'ink', M: 'red1', X: 'ink' });
  d.px(Math.round(x) - 1, Math.round(y) - 3, 'skin2'); // 耳
  if (eye === 'h') d.px(Math.round(x) + 2, Math.round(y) - 3, 'ink');
}
function torso(d, sx, sy, hx, hy) {
  d.poly([[sx - 3, sy], [sx + 2, sy], [hx + 2, hy], [hx - 3, hy]], 'red2');
  d.line(sx - 3, sy, hx - 3, hy, 'red1');
  d.line(sx + 2, sy + 1, hx + 2, hy - 1, 'white'); // 前のファスナーと中の白い T シャツ
  d.px(sx + 1, sy, 'red3');
}

// 1 コマ: pose = { hip: [x, y], lean, legs: [[近い太もも, 曲げ], [遠い太もも, 曲げ]], arms: [[近い上腕, 曲げ], [遠い上腕, 曲げ]], mouth, eye }
function figure(d, p) {
  const [hx, hy] = p.hip, sx = hx + (p.lean || 0), sy = hy - 9;
  const [[nt, nb], [ft, fb]] = p.legs, [[na, nab], [fa, fab]] = p.arms;
  // 遠い側（暗い色）
  limb(d, sx - 1, sy + 1, 4, fa, 4, -fab, 'red1', 2);
  const ff = limb(d, hx - 1, hy, 6, ft, 6, fb, 'blu0', 3);
  shoe(d, ff[0], ff[1] + 1, false);
  torso(d, sx, sy, hx, hy);
  const nf = limb(d, hx, hy, 6, nt, 6, nb, 'blu1', 3);
  shoe(d, nf[0], nf[1] + 1, true);
  // 腕を上げたコマは頭の後に描く（頭に隠れないように）
  const raised = Math.abs(na) > 100;
  if (!raised) { const nh = limb(d, sx, sy + 1, 4, na, 4, -nab, 'red2', 2); d.px(nh[0], nh[1] + 1, 'skin3'); }
  head(d, sx + 1, sy - 1, p);
  if (raised) { const nh = limb(d, sx + 1, sy + 1, 5, na, 4, -nab, 'red2', 2); d.rect(nh[0] - 1, nh[1] - 1, 2, 2, 'skin3'); }
}

const RUN = [[35, 15], [15, 30], [-15, 20], [-38, 70], [-5, 110], [28, 60]];
export function make(d) {
  for (let i = 0; i < 6; i++) {
    const near = RUN[i], far = RUN[(i + 3) % 6];
    const bob = i === 1 || i === 4 ? 1 : i === 2 || i === 5 ? -1 : 0;
    figure(d.frame(i), { hip: [15, 19 + bob], lean: 2, legs: [near, far], arms: [[-far[0] * 1.1, 80], [-near[0] * 1.1, 80]] });
  }
  figure(d.frame(6), { hip: [16, 19], lean: 0, legs: [[6, 4], [-6, 4]], arms: [[-6, 10], [6, 10]], eye: 'h' });
  figure(d.frame(7), { hip: [16, 20], lean: 0, legs: [[8, 14], [-8, 14]], arms: [[-3, 16], [3, 16]], eye: 'h' });
  figure(d.frame(8), { hip: [16, 19], lean: 1, legs: [[6, 4], [-6, 4]], arms: [[150, 40], [8, 15]], mouth: 'o' });
  figure(d.frame(9), { hip: [16, 15], lean: 1, legs: [[60, 110], [40, 100]], arms: [[165, 20], [-165, 20]], mouth: 'o' });
  figure(d.frame(10), { hip: [16, 16], lean: 1, legs: [[20, 30], [-25, 40]], arms: [[150, 10], [-150, 10]], mouth: 'o' });
  figure(d.frame(11), { hip: [14, 19], lean: 5, legs: [[30, 20], [-30, 50]], arms: [[110, 30], [70, 50]], mouth: 'o', eye: 'x' });
  // 倒れる: 横になった体（頭が右、足が左）
  const f = d.frame(12);
  f.rect(4, 27, 9, 3, 'blu1').rect(4, 30, 9, 1, 'blu0').rect(1, 27, 3, 2, 'white').rect(1, 29, 3, 2, 'gray2');
  f.rect(13, 26, 10, 5, 'red2').line(13, 30, 22, 30, 'red1').line(14, 26, 22, 26, 'red3');
  f.line(16, 25, 12, 22, 'red2', 2).line(20, 31, 25, 31, 'red1', 2).px(11, 21, 'skin3');
  f.rows(23, 24, ['.HHHH...', 'HHHHHHH.', 'HHHHHSSS', 'HHHSSXSS', '.HSSSSSM', '..SSSSS.'].map((r) => r), { H: 'shade0', S: 'skin3', X: 'ink', M: 'red1' });
  for (let i = 0; i < 13; i++) d.frame(i).outline('ink', { connectivity: 4 });
}
export const asset = { name: 'hero', w: 32, h: 32, frames: 13, make };
