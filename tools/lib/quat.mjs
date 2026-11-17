// 回転を表す四元数 [x, y, z, w] と、3 つの数の向きの計算（動きの付け替えで使う）
export const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
export const normalize = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };
export const normalize3 = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const fromAxis = (ax, ang) => { const a = normalize3(ax), s = Math.sin(ang / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)]; };
export function rotate(q, v) {
  const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
const AXIS = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
// BVH の角度（度）: 書かれた順に回転を掛ける（例: Z・X・Y なら Z 回転 × X 回転 × Y 回転）
export function fromEuler(order, degs) {
  let q = [0, 0, 0, 1];
  order.forEach((a, i) => { q = mul(q, fromAxis(AXIS[a], degs[i] * Math.PI / 180)); });
  return q;
}
export function toMat3(q) {
  const [x, y, z, w] = q;
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
}
// 四元数から Z・X・Y の順の角度（度）へ（R = Rz・Rx・Ry の式から逆に解く）
export function toEuler(order, q) {
  if (order.join('') !== 'ZXY') throw new Error('Z・X・Y の順だけに対応しています');
  const R = toMat3(q), b = Math.asin(Math.max(-1, Math.min(1, R[2][1])));
  return [Math.atan2(-R[0][1], R[1][1]), b, Math.atan2(-R[2][0], R[2][2])].map((v) => v * 180 / Math.PI);
}
// 向き a を向き b へ、いちばん小さく回す回転
export function fromTo(a, b) {
  a = normalize3(a); b = normalize3(b);
  const d = dot3(a, b);
  if (d < -0.999999) { let ax = cross([1, 0, 0], a); if (Math.hypot(...ax) < 1e-6) ax = cross([0, 1, 0], a); return fromAxis(ax, Math.PI); }
  return normalize([...cross(a, b), 1 + d]);
}
// x・y・z 軸をそれぞれ与えた 3 本の向きへ移す回転（3 本は互いに直角で長さ 1）
export function fromBasis(x, y, z) {
  const m00 = x[0], m11 = y[1], m22 = z[2], tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s]; }
  return normalize(q);
}
