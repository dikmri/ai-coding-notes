// 起動の演出の計算だけを集めたもの（描画も音も使わない）。tests/os-boot-math.test.mjs で確かめている。
// 場面の秒数は Gemini 4 Carbon の設計書（build/gemini/design-spec.json の boot）に合わせている。

// 7場面の境目（ミリ秒）。0〜1100 光の線と点検 / 〜2800 市松の床と柱 / 〜4600 夕陽 / 〜6800 3D の図形 /
// 〜8900 水晶と虹の光 / 〜11400 題字 / 〜13000 進み具合と光の輪
export const SCENES = [0, 1100, 2800, 4600, 6800, 8900, 11400, 13000];

export function phaseAt(ms) {
  if (ms <= 0) return { i: 0, k: 0 };
  for (let i = 0; i < SCENES.length - 1; i++) {
    if (ms < SCENES[i + 1]) return { i, k: (ms - SCENES[i]) / (SCENES[i + 1] - SCENES[i]) };
  }
  return { i: SCENES.length - 2, k: 1, done: true };
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
// a から b までの間で 0 から 1 へ進む値
export const ramp = (ms, a, b) => clamp01((ms - a) / (b - a));
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
// 終わりの手前で少し行き過ぎて戻る（ばねのような着地）
export function easeOutBack(t, s = 1.70158) {
  const c3 = s + 1;
  return 1 + c3 * (t - 1) ** 3 + s * (t - 1) ** 2;
}

// 4×4 のベイヤーの網点。256色の時代の、ざらついた色の段差を作る
export const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
// 0〜1 の値を levels 段に分け、(x, y) の網点のしきい値で、上と下のどちらの段にするかを決める。戻り値は段の番号
export function ditherLevel(v, x, y, levels) {
  const s = clamp01(v) * (levels - 1);
  const lo = Math.floor(s), f = s - lo;
  const th = (BAYER4[y & 3][x & 3] + 0.5) / 16;
  return Math.min(levels - 1, lo + (f > th ? 1 : 0));
}

// 正二十面体（頂点は長さ 1）
export function icosahedron() {
  const p = (1 + Math.sqrt(5)) / 2, n = Math.hypot(1, p);
  const raw = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]];
  const v = raw.map((a) => a.map((c) => c / n));
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { v, f };
}

export function rotY([x, y, z], a) { const c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, y, -x * s + z * c]; }
export function rotX([x, y, z], a) { const c = Math.cos(a), s = Math.sin(a); return [x, y * c - z * s, y * s + z * c]; }
export function rotZ([x, y, z], a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c, z]; }
// カメラは原点で +z を向く。上が +y。戻り値は [画面の x, 画面の y, 大きさの倍率]
export function project([x, y, z], { cx, cy, f }) {
  const s = f / z;
  return [cx + x * s, cy - y * s, s];
}

// 始まり（start ミリ秒）から、1文字 per ミリ秒ずつ打った文字列
export function typed(text, ms, start, per) {
  if (ms < start) return '';
  return text.slice(0, Math.min(text.length, Math.floor((ms - start) / per)));
}
