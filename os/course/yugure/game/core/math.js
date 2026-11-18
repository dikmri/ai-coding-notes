// 3D の計算に使う数・ベクトル・行列の部品。
//
// 座標の決まり（このゲーム全体で同じ）
//   x は右（東）、y は上、z は前（北）。地図を上から見ると、x が右、z が上になる。
//   向き（heading）は方位と同じで、北（+z）が 0、東（+x）が π/2。右に曲がると増える。
//
// ベクトルは [x, y, z] の配列で表す。
// 行列は 16 個の数を並べた Float32Array で、列ごとに並べる（WebGPU のシェーダー WGSL と同じ並び）。
// どの関数も、渡された値を書き換えず、新しい値を返す。

/* ---------- 数 ---------- */

// value を min 以上 max 以下に収める
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// a から b へ、t の割合（0〜1）だけ進んだ値
export const lerp = (a, b, t) => a + (b - a) * t;

// edge0 から edge1 の間で、0 から 1 へなめらかに変わる値
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export const degToRad = (degrees) => (degrees * Math.PI) / 180;
export const radToDeg = (radians) => (radians * 180) / Math.PI;

// 角度を -π より大きく π 以下の範囲にそろえる
export function wrapAngle(angle) {
  const turn = Math.PI * 2;
  let a = angle % turn;
  if (a <= -Math.PI) a += turn;
  if (a > Math.PI) a -= turn;
  return a;
}

// current を target へ近づける。1 回に動く量は maxDelta まで
export function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/* ---------- ベクトル ---------- */

export const vec3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (v) => Math.hypot(v[0], v[1], v[2]);
export const distance = (a, b) => length(subtract(a, b));
export const lerpVec3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// 外積。a と b の両方に直角なベクトル
export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// 長さを 1 にしたベクトル。長さ 0 のときは [0, 0, 0]
export function normalize(v) {
  const len = length(v);
  return len > 0 ? scale(v, 1 / len) : [0, 0, 0];
}

/* ---------- 行列（4×4、列ごとの並び） ---------- */
// m[列 * 4 + 行] が「行 行目、列 列目」の数。点 p を動かすときは m × p の順にかける。

export function identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

// a × b。b の動きを先に、a の動きを後に行う行列になる
export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function translation(x, y, z) {
  const m = identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

export function scaling(x, y, z) {
  const m = identity();
  m[0] = x; m[5] = y; m[10] = z;
  return m;
}

// y 軸のまわりに回す。正の角度で、上から見て右回り（北から東へ）
export function rotationY(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const m = identity();
  m[0] = c; m[2] = -s;
  m[8] = s; m[10] = c;
  return m;
}

// x 軸のまわりに回す。正の角度で、前が下がる（うつむく）
export function rotationX(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const m = identity();
  m[5] = c; m[6] = s;
  m[9] = -s; m[10] = c;
  return m;
}

// z 軸のまわりに回す。正の角度で、前から見て左回り（右側が上がる）
export function rotationZ(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const m = identity();
  m[0] = c; m[1] = s;
  m[4] = -s; m[5] = c;
  return m;
}

// 透視投影。遠くの物ほど小さく見えるようにする。WebGPU の奥行きは 0（手前の面）から 1（奥の面）
export function perspective(fovYRadians, aspect, near, far) {
  const yScale = 1 / Math.tan(fovYRadians / 2);
  const m = new Float32Array(16);
  m[0] = yScale / aspect;
  m[5] = yScale;
  m[10] = far / (far - near);
  m[11] = 1;
  m[14] = (-near * far) / (far - near);
  return m;
}

// カメラの行列。eye（カメラの位置）から target（見る点）を向き、up（上の向き）を上にする
export function lookAt(eye, target, up = [0, 1, 0]) {
  const forward = normalize(subtract(target, eye));
  const right = normalize(cross(up, forward));
  const cameraUp = cross(forward, right);
  const m = new Float32Array(16);
  m[0] = right[0]; m[4] = right[1]; m[8] = right[2];
  m[1] = cameraUp[0]; m[5] = cameraUp[1]; m[9] = cameraUp[2];
  m[2] = forward[0]; m[6] = forward[1]; m[10] = forward[2];
  m[12] = -dot(right, eye);
  m[13] = -dot(cameraUp, eye);
  m[14] = -dot(forward, eye);
  m[15] = 1;
  return m;
}

// 行列で点を動かす。w で割るので、透視投影の行列にも使える
export function transformPoint(m, p) {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [x / w, y / w, z / w];
}
