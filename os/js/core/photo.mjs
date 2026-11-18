// 写真の現像の計算。画面には触らない（テストは tests/os-photo.test.mjs）。
// ・調整の設定（つまみの範囲、既定、検証）と .fdev（調整の設定のファイル）の読み書き
// ・1 画素の現像の式（developInto）。WebGL2 のシェーダー（FRAG_SRC）は、この式と同じ順番・同じ数で書く。
//   WebGL2 が無いときは、renderCPU が同じ式で 1 画素ずつ計算する（2D の代わりの処理）
// ・色温度と色かぶりの行列（プランクの軌跡の白から、ブラッドフォードの変換で 6504K の白へ合わせる）
// ・トーンカーブ（単調な 3 次の補間。Fritsch–Carlson の方法で行き過ぎを防ぐ）
// ・切り抜きと回転の座標（出力の画素 → 元の画素のアフィン変換）、ヒストグラム、見本（プリセット）
import { basename } from './path.mjs';

/* ---------- つまみと設定 ---------- */
// 値はどれも「0 が何もしない」。露出は段（+1 で光が 2 倍）、ほかは -100〜100
export const SLIDERS = [
  { id: 'exposure', name: '露出', min: -3, max: 3, step: 0.01, group: 'light', hint: '全体の明るさです。+1 で光が 2 倍になります。' },
  { id: 'contrast', name: 'コントラスト', min: -100, max: 100, step: 1, group: 'light', hint: '明るい所と暗い所の差です。' },
  { id: 'highlights', name: '明るい所', min: -100, max: 100, step: 1, group: 'light', hint: '空など明るい所だけを暗く（左）または明るく（右）します。' },
  { id: 'shadows', name: '暗い所', min: -100, max: 100, step: 1, group: 'light', hint: '影など暗い所だけを明るく（右）または暗く（左）します。' },
  { id: 'whites', name: '白の点', min: -100, max: 100, step: 1, group: 'light', hint: '右へ動かすと、明るい所が白に近づきます。' },
  { id: 'blacks', name: '黒の点', min: -100, max: 100, step: 1, group: 'light', hint: '左へ動かすと、暗い所が黒に近づきます。右へ動かすと黒が浮きます。' },
  { id: 'temp', name: '色温度', min: -100, max: 100, step: 1, group: 'color', hint: '右へ動かすと暖かい色（黄色）、左へ動かすと冷たい色（青）になります。' },
  { id: 'tint', name: '色かぶり', min: -100, max: 100, step: 1, group: 'color', hint: '右へ動かすと赤紫に、左へ動かすと緑になります。' },
  { id: 'vibrance', name: '自然な彩度', min: -100, max: 100, step: 1, group: 'color', hint: '地味な色を強く、鮮やかな色を弱く変えます。肌の色が派手になりにくい彩度です。' },
  { id: 'saturation', name: '彩度', min: -100, max: 100, step: 1, group: 'color', hint: 'すべての色の鮮やかさです。-100 で灰色になります。' },
  { id: 'sharpen', name: 'シャープ', min: 0, max: 100, step: 1, group: 'finish', hint: '輪郭の明るさの差を広げて、くっきりさせます。' },
  { id: 'vignette', name: '周辺を暗くする', min: -100, max: 100, step: 1, group: 'finish', hint: '右へ動かすと四隅が暗く、左へ動かすと四隅が明るくなります。' },
];
export const ANGLE = { id: 'angle', name: '水平を直す', min: -45, max: 45, step: 0.1 };
export const ASPECTS = [
  { id: 'free', name: '自由' }, { id: 'orig', name: '元の比率' }, { id: '1:1', name: '1:1（正方形）' },
  { id: '4:3', name: '4:3' }, { id: '3:4', name: '3:4（縦）' }, { id: '3:2', name: '3:2' }, { id: '2:3', name: '2:3（縦）' },
  { id: '16:9', name: '16:9' }, { id: '9:16', name: '9:16（縦）' },
];
const SWAP_ASPECT = { '4:3': '3:4', '3:4': '4:3', '3:2': '2:3', '2:3': '3:2', '16:9': '9:16', '9:16': '16:9' };
export const CURVE_MAX_POINTS = 16;
export const CURVE_MIN_GAP = 0.02;
export const MIN_CROP = 0.02;
const FULL = { x: 0, y: 0, w: 1, h: 1 };
const GEOMETRY_KEYS = ['crop', 'aspect', 'angle', 'rot', 'flip'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const round = (v, k) => Math.round(v * k) / k;
const r6 = (v) => round(v, 1e6);
const stepRound = (v, step) => (step >= 1 ? Math.round(v) : round(v, Math.round(1 / step)));

export function defaults() {
  const s = {};
  for (const d of SLIDERS) s[d.id] = 0;
  return { ...s, mono: false, curve: [[0, 0], [1, 1]], crop: { ...FULL }, aspect: 'free', angle: 0, rot: 0, flip: false };
}

// 曲線の点: 2〜16 個、x は 0〜1 で左から右へ、隣と CURVE_MIN_GAP 以上離れていること。そうでなければ null
function cleanCurve(c) {
  if (!Array.isArray(c) || c.length < 2 || c.length > CURVE_MAX_POINTS) return null;
  const out = [];
  for (const p of c) {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
    const x = round(clamp01(p[0]), 1e4), y = round(clamp01(p[1]), 1e4);
    if (out.length && x - out[out.length - 1][0] < CURVE_MIN_GAP - 1e-9) return null;
    out.push([x, y]);
  }
  return out;
}
function cleanCrop(c) {
  if (!c || typeof c !== 'object' || !['x', 'y', 'w', 'h'].every((k) => typeof c[k] === 'number' && Number.isFinite(c[k]))) return { ...FULL };
  if (c.w <= 0 || c.h <= 0) return { ...FULL };
  const w = clamp(c.w, MIN_CROP, 1), h = clamp(c.h, MIN_CROP, 1);
  return { x: r6(clamp(c.x, 0, 1 - w)), y: r6(clamp(c.y, 0, 1 - h)), w: r6(w), h: r6(h) };
}
// 外から来た設定（.fdev、見本）を、範囲の内の正しい形にする。足りない値は既定、壊れた値は既定に戻す
export function normalize(src) {
  const o = src && typeof src === 'object' ? src : {}, s = defaults();
  for (const d of SLIDERS) {
    const v = typeof o[d.id] === 'number' ? o[d.id] : Number.NaN;
    s[d.id] = Number.isFinite(v) ? stepRound(clamp(v, d.min, d.max), d.step) : 0;
  }
  s.mono = o.mono === true;
  s.curve = cleanCurve(o.curve) || [[0, 0], [1, 1]];
  s.crop = cleanCrop(o.crop);
  s.aspect = ASPECTS.some((a) => a.id === o.aspect) ? o.aspect : 'free';
  s.angle = typeof o.angle === 'number' && Number.isFinite(o.angle) ? stepRound(clamp(o.angle, ANGLE.min, ANGLE.max), ANGLE.step) : 0;
  s.rot = Number.isInteger(o.rot) && o.rot >= 0 && o.rot <= 3 ? o.rot : 0;
  s.flip = o.flip === true;
  return s;
}
export const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
// 色の設定だけ（切り抜きと回転を除く）。見本に使う
export function toneOnly(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) if (!GEOMETRY_KEYS.includes(k)) out[k] = k === 'curve' ? v.map((p) => [...p]) : v;
  return out;
}

/* ---------- 色の変換 ---------- */
export const LUMA = [0.2126, 0.7152, 0.0722];
export const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
// GLSL の smoothstep と同じ（a < b）
export function smoothstep(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

const mul3 = (a, b) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; return o; };
const mul3v = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
// 線形の sRGB ⇔ XYZ（D65）と、ブラッドフォードの錐体の応答
const RGB2XYZ = [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041];
const XYZ2RGB = inv3(RGB2XYZ);
const BRAD = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
const BRAD_INV = inv3(BRAD);

// 黒体（プランクの軌跡）の色度 xy。Kim らの 3 次式（1667K〜25000K）
export function planckXY(T) {
  T = clamp(T, 1667, 25000);
  const t = 1e3 / T, x = T <= 4000 ? -0.2661239 * t ** 3 - 0.2343589 * t * t + 0.8776956 * t + 0.17991 : -3.0258469 * t ** 3 + 2.1070379 * t * t + 0.2226347 * t + 0.24039;
  const y = T <= 2222 ? -1.1063814 * x ** 3 - 1.3481102 * x * x + 2.18555832 * x - 0.20219683
    : T <= 4000 ? -0.9549476 * x ** 3 - 1.37418593 * x * x + 2.09137015 * x - 0.16748867
      : 3.081758 * x ** 3 - 5.8733867 * x * x + 3.75112997 * x - 0.37001483;
  return [x, y];
}
const xyToUv = ([x, y]) => { const d = -2 * x + 12 * y + 3; return [(4 * x) / d, (6 * y) / d]; };
const uvToXy = ([u, v]) => { const d = 2 * u - 8 * v + 4; return [(3 * u) / d, (2 * v) / d]; };
const xyToXYZ = ([x, y]) => [x / y, 1, (1 - x - y) / y];
// 写真を撮ったときの光の白（と見なす色）。色温度を右へ動かすほど青い光と見なし、それを白に戻すので暖かくなる。
// 色温度はミレッド（100 万 / K）で等しい歩幅に分け、色かぶりは CIE 1960 uv で軌跡に直角に（+ は緑の側へ）ずらす
export function whiteXY(temp, tint) {
  const T = 1e6 / Math.max(40, 1e6 / 6504 - temp * 0.9);
  const a = xyToUv(planckXY(T)), b = xyToUv(planckXY(T * 1.01));
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let nu = -(b[1] - a[1]) / len, nv = (b[0] - a[0]) / len;
  if (nv < 0) { nu = -nu; nv = -nv; }
  const duv = (tint / 100) * 0.02;
  return uvToXy([a[0] + nu * duv, a[1] + nv * duv]);
}
// 色温度と色かぶりの 3×3 の行列（行ごとに並べる）。線形の sRGB にかける。0 と 0 では単位行列
export function wbMatrix(temp, tint) {
  if (!temp && !tint) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const src = mul3v(BRAD, xyToXYZ(whiteXY(temp, tint))), dst = mul3v(BRAD, xyToXYZ(whiteXY(0, 0)));
  const D = [dst[0] / src[0], 0, 0, 0, dst[1] / src[1], 0, 0, 0, dst[2] / src[2]];
  return mul3(XYZ2RGB, mul3(BRAD_INV, mul3(D, mul3(BRAD, RGB2XYZ))));
}

/* ---------- 調整の式 ---------- */
// 設定から、式に入れる数をまとめる。名前はシェーダーの uniform と同じ
export function uniforms(s) {
  return {
    uWB: wbMatrix(s.temp, s.tint),
    uGain: 2 ** s.exposure,
    uSh: (s.shadows / 100) * 1.3,
    uHi: (s.highlights / 100) * 0.7,
    uBp: (-s.blacks / 100) * 0.2,
    uWp: 1 - (s.whites / 100) * 0.2,
    uK: 2 ** ((s.contrast / 100) * 1.2),
    uSat: s.saturation / 100,
    uVib: s.vibrance / 100,
    uVig: (s.vignette / 100) * 0.8,
    uSharp: (s.sharpen / 100) * 2,
    uMono: !!s.mono,
  };
}
const lutAt = (lut, x) => {
  const n = lut.length - 1, p = clamp01(x) * n;
  let i = Math.floor(p);
  if (i >= n) i = n - 1;
  return lut[i] + (lut[i + 1] - lut[i]) * (p - i);
};
// 1 画素を現像する。r, g, b は sRGB の 0〜1。ux, uy は出力の中の位置（0〜1、周辺を暗くするのに使う）。
// 順番: 線形の光で色温度・露出 → sRGB に戻して明るい所と暗い所 → 白と黒の点 → コントラスト → トーンカーブ → 彩度 → 白黒 → 周辺
export function developInto(out, r, g, b, u, lut, ux, uy) {
  const M = u.uWB, lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  let R = toSrgb(Math.max((M[0] * lr + M[1] * lg + M[2] * lb) * u.uGain, 0));
  let G = toSrgb(Math.max((M[3] * lr + M[4] * lg + M[5] * lb) * u.uGain, 0));
  let B = toSrgb(Math.max((M[6] * lr + M[7] * lg + M[8] * lb) * u.uGain, 0));
  // 明るい所と暗い所: 明るさ L に応じた倍率（色合いは変えない。黒は黒のまま）
  let L = LUMA[0] * R + LUMA[1] * G + LUMA[2] * B;
  const k = 2 ** (u.uSh * (1 - smoothstep(0, 0.6, L)) + u.uHi * smoothstep(0.35, 1, L));
  R *= k; G *= k; B *= k;
  // 白と黒の点
  const span = u.uWp - u.uBp;
  R = (R - u.uBp) / span; G = (G - u.uBp) / span; B = (B - u.uBp) / span;
  // コントラスト: 0.5 を中心にした S の字 x^k / (x^k + (1-x)^k)
  R = clamp01(R); G = clamp01(G); B = clamp01(B);
  const K = u.uK;
  R = R ** K / (R ** K + (1 - R) ** K); G = G ** K / (G ** K + (1 - G) ** K); B = B ** K / (B ** K + (1 - B) ** K);
  // トーンカーブ（256 の表を直線でつなぐ）
  R = lutAt(lut, R); G = lutAt(lut, G); B = lutAt(lut, B);
  // 彩度と自然な彩度（自然な彩度は、もとの鮮やかさが低いほど強くかける）
  L = LUMA[0] * R + LUMA[1] * G + LUMA[2] * B;
  const ch = Math.max(R, G, B) - Math.min(R, G, B), f = (1 + u.uSat) * (1 + u.uVib * (1 - ch));
  R = L + (R - L) * f; G = L + (G - L) * f; B = L + (B - L) * f;
  if (u.uMono) { const m = LUMA[0] * R + LUMA[1] * G + LUMA[2] * B; R = m; G = m; B = m; }
  // 周辺: 真ん中から四隅（d = 1）へ向かって暗く
  const dx = (ux - 0.5) * 2, dy = (uy - 0.5) * 2, d = Math.sqrt(dx * dx + dy * dy) * Math.SQRT1_2, v = 1 - u.uVig * smoothstep(0.25, 1, d);
  out[0] = clamp01(R * v); out[1] = clamp01(G * v); out[2] = clamp01(B * v);
  return out;
}
export function developPixel(r, g, b, u, lut, ux = 0.5, uy = 0.5) { return [...developInto([0, 0, 0], r, g, b, u, lut, ux, uy)]; }

/* ---------- トーンカーブ ---------- */
function tangents(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  // Fritsch–Carlson: 傾きが大きすぎると区間の中で行き過ぎるので、3 の円の内へ縮める
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return m;
}
// 曲線の高さ（単調な 3 次のエルミート補間）。端の点より外は、端の点の高さ
export function curveAt(points, x, m = null) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]), n = points.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  m = m || tangents(xs, ys);
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
  const y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  return clamp01(y);
}
export function curveLUT(points, n = 256) {
  const m = tangents(points.map((p) => p[0]), points.map((p) => p[1])), lut = new Float32Array(n);
  for (let i = 0; i < n; i++) lut[i] = curveAt(points, i / (n - 1), m);
  return lut;
}
export function addCurvePoint(points, x, y) {
  if (points.length >= CURVE_MAX_POINTS || x <= points[0][0] || x >= points[points.length - 1][0]) return null;
  if (points.some((p) => Math.abs(p[0] - x) < CURVE_MIN_GAP)) return null;
  const p = [round(clamp01(x), 1e4), round(clamp01(y), 1e4)], out = [...points.map((q) => [...q]), p].sort((a, b) => a[0] - b[0]);
  return { points: out, index: out.indexOf(p) };
}
// 点を動かす。x は左右の点を越えない（端の点は 0〜1 の内）、y は 0〜1
export function moveCurvePoint(points, i, x, y) {
  const lo = i === 0 ? 0 : points[i - 1][0] + CURVE_MIN_GAP, hi = i === points.length - 1 ? 1 : points[i + 1][0] - CURVE_MIN_GAP;
  const out = points.map((q) => [...q]);
  out[i] = [round(clamp(x, lo, hi), 1e4), round(clamp01(y), 1e4)];
  return out;
}
export function removeCurvePoint(points, i) {
  if (i <= 0 || i >= points.length - 1) return points.map((q) => [...q]);
  return points.filter((_, k) => k !== i).map((q) => [...q]);
}

/* ---------- 切り抜きと回転の座標 ----------
   元の画像（sw×sh）→ 90° ずつ回す（rot、右回り）→ 左右反転（flip）＝「向きをそろえた画像」（W×H）
   → 真ん中を中心に angle 度回す（水平を直す。正の値で右回り）＝ 画面に出す画像。切り抜き（crop）はこの画像の 0〜1 の四角 */
export const orientedSize = (w, h, rot) => (rot & 1 ? { w: h, h: w } : { w, h });
export function outputSize(s, sw, sh, { full = false } = {}) {
  const o = orientedSize(sw, sh, s.rot), c = full ? FULL : s.crop;
  return { w: Math.max(1, Math.round(c.w * o.w)), h: Math.max(1, Math.round(c.h * o.h)) };
}
// アフィン変換 [a, b, c, d, e, f]: x' = a x + b y + c、y' = d x + e y + f
export const applyMatrix = (m, x, y) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
const compose = (B, A) => [B[0] * A[0] + B[1] * A[3], B[0] * A[1] + B[1] * A[4], B[0] * A[2] + B[1] * A[5] + B[2], B[3] * A[0] + B[4] * A[3], B[3] * A[1] + B[4] * A[4], B[3] * A[2] + B[4] * A[5] + B[5]];
const unrotate = (rot, sw, sh) => [[1, 0, 0, 0, 1, 0], [0, 1, 0, -1, 0, sh], [-1, 0, sw, 0, -1, sh], [0, -1, sw, 1, 0, 0]][rot];
function unstraighten(angle, W, H) {
  const t = (-angle * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t), cx = W / 2, cy = H / 2;
  return [cs, -sn, cx - cs * cx + sn * cy, sn, cs, cy - sn * cx - cs * cy];
}
// 出力の画素の座標（outW×outH。画素の中心は +0.5）から、元の画像の画素の座標へのアフィン変換
export function geometryMatrix(s, sw, sh, outW, outH, { full = false } = {}) {
  const { w: W, h: H } = orientedSize(sw, sh, s.rot), c = full ? FULL : s.crop;
  const toFrame = [(c.w * W) / outW, 0, c.x * W, 0, (c.h * H) / outH, c.y * H];
  const unflip = s.flip ? [-1, 0, W, 0, 1, 0] : [1, 0, 0, 0, 1, 0];
  return compose(unrotate(s.rot, sw, sh), compose(unflip, compose(unstraighten(s.angle, W, H), toFrame)));
}
// 画面に出す画像（W×H）の点 (px, py) が、回した画像の内にあるか
export function insideRotated(px, py, W, H, angle, eps = 1e-3) {
  const [x, y] = applyMatrix(unstraighten(angle, W, H), px, py);
  return x >= -eps && y >= -eps && x <= W + eps && y <= H + eps;
}
export function cropInside(c, W, H, angle) {
  if (c.x < -1e-9 || c.y < -1e-9 || c.x + c.w > 1 + 1e-9 || c.y + c.h > 1 + 1e-9) return false;
  return [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]].every(([u, v]) => insideRotated(u * W, v * H, W, H, angle));
}
const lerpRect = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });
// prev（内にある）から next へ向かって、内に収まるいちばん遠い所
function furthest(prev, next, W, H, angle) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (cropInside(lerpRect(prev, next, m), W, H, angle)) lo = m; else hi = m; }
  return lerpRect(prev, next, lo);
}
// 回したときに四隅がはみ出す切り抜きを、比率を保ったまま画像の真ん中へ向かって縮める
export function fitCrop(c, W, H, angle) {
  if (cropInside(c, W, H, angle)) return { ...c };
  return furthest({ x: 0.5, y: 0.5, w: 0, h: 0 }, c, W, H, angle);
}
// 動かす・大きさを変える: はみ出す動きは、内に収まる所で止める
export function constrainCrop(prev, next, W, H, angle) {
  if (cropInside(next, W, H, angle)) return { ...next };
  return furthest(prev, next, W, H, angle);
}
export function aspectRatioOf(id, W, H) {
  if (id === 'orig') return W / H;
  const m = /^(\d+):(\d+)$/.exec(id || '');
  return m ? +m[1] / +m[2] : null;
}
// 比率を選んだとき: 今の切り抜きの真ん中を中心に、その比率でなるべく大きく
export function aspectCrop(c, id, W, H, angle) {
  const ratio = aspectRatioOf(id, W, H);
  if (!ratio) return { ...c };
  let w = 1, h = 1;
  if (ratio >= W / H) h = W / ratio / H; else w = (ratio * H) / W;
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  const r = { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
  const f = fitCrop(r, W, H, angle);
  return { x: r6(f.x), y: r6(f.y), w: r6(f.w), h: r6(f.h) };
}
// 四隅のつまみ（tl tr bl br）で大きさを変える。dx, dy は 0〜1 の単位。ratio（画素の幅 / 高さ）があれば比率を保つ
export function resizeCrop(c, handle, dx, dy, ratio, W = 1, H = 1) {
  let x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h;
  const left = handle.includes('l'), top = handle.includes('t');
  if (left) x1 = Math.min(x1 + dx, x2 - MIN_CROP); else x2 = Math.max(x2 + dx, x1 + MIN_CROP);
  if (top) y1 = Math.min(y1 + dy, y2 - MIN_CROP); else y2 = Math.max(y2 + dy, y1 + MIN_CROP);
  let w = x2 - x1, h = y2 - y1;
  if (ratio) {
    if (Math.abs(dx * W) >= Math.abs(dy * H)) h = (w * W) / ratio / H; else w = (h * H * ratio) / W;
    if (left) x1 = x2 - w;
    if (top) y1 = y2 - h;
  }
  return { x: r6(x1), y: r6(y1), w: r6(w), h: r6(h) };
}
// 画面に出す画像ごと 90° 回す（dir = 1 で右回り）。切り抜きも一緒に回し、縦横の比率の選択も入れ替える
export function rotateSettings(s, dir) {
  const c = s.crop, cw = dir > 0;
  const crop = cw ? { x: r6(1 - c.y - c.h), y: c.x, w: c.h, h: c.w } : { x: c.y, y: r6(1 - c.x - c.w), w: c.h, h: c.w };
  // 左右反転しているときは、元の画像を逆向きに回すと、画面では同じ向きに回る
  const rot = (s.rot + (s.flip ? -dir : dir) + 4) % 4;
  return { ...s, rot, crop, aspect: SWAP_ASPECT[s.aspect] || s.aspect };
}
export function flipSettings(s) {
  const c = s.crop;
  return { ...s, flip: !s.flip, angle: s.angle ? -s.angle : 0, crop: { ...c, x: r6(1 - c.x - c.w) } };
}
export function fitSize(w, h, maxW, maxH) {
  const k = Math.min(1, maxW / w, maxH / h);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/* ---------- 2D の代わりの処理（WebGL2 が無いとき） ---------- */
// 双線形の読み取り（GPU の LINEAR と同じく、画素の中心は +0.5、端は端の画素を伸ばす）。out は 0〜1 の RGBA
export function sampleBilinear(img, x, y, out) {
  const w = img.width, h = img.height, d = img.data, fx = x - 0.5, fy = y - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const xa = clamp(x0, 0, w - 1), xb = clamp(x0 + 1, 0, w - 1), ya = clamp(y0, 0, h - 1), yb = clamp(y0 + 1, 0, h - 1);
  const i00 = (ya * w + xa) * 4, i10 = (ya * w + xb) * 4, i01 = (yb * w + xa) * 4, i11 = (yb * w + xb) * 4;
  for (let k = 0; k < 4; k++) out[k] = ((d[i00 + k] * (1 - tx) + d[i10 + k] * tx) * (1 - ty) + (d[i01 + k] * (1 - tx) + d[i11 + k] * tx) * ty) / 255;
  return out;
}
// 画像（{ width, height, data: RGBA }）を、設定どおりに outW×outH で現像する。
// opts: full（切り抜かずに全体）、bypass（色を変えない＝元の色）、split（0〜1。これより左は元の色）
export function renderCPU(src, s, outW, outH, opts = {}) {
  const M = geometryMatrix(s, src.width, src.height, outW, outH, opts), u = uniforms(s), lut = curveLUT(s.curve);
  const out = new Uint8ClampedArray(outW * outH * 4), c = [0, 0, 0, 0], n = [0, 0, 0, 0], o = [0, 0, 0];
  const sw = src.width, sh = src.height, split = opts.split >= 0 ? opts.split * outW : -1;
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const px = ox + 0.5, py = oy + 0.5, sx = M[0] * px + M[1] * py + M[2], sy = M[3] * px + M[4] * py + M[5];
      if (sx < 0 || sy < 0 || sx > sw || sy > sh) continue; // 回した画像の外は透明
      sampleBilinear(src, sx, sy, c);
      let r = c[0], g = c[1], b = c[2];
      if (!opts.bypass && px >= split) {
        if (u.uSharp > 0) {
          // シャープ: 上下左右の平均との差を足す（アンシャープマスク）
          let ar = 0, ag = 0, ab = 0;
          for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { sampleBilinear(src, sx + ddx, sy + ddy, n); ar += n[0]; ag += n[1]; ab += n[2]; }
          r = clamp01(r + u.uSharp * (r - ar * 0.25)); g = clamp01(g + u.uSharp * (g - ag * 0.25)); b = clamp01(b + u.uSharp * (b - ab * 0.25));
        }
        developInto(o, r, g, b, u, lut, px / outW, py / outH);
        r = o[0]; g = o[1]; b = o[2];
      }
      const i = (oy * outW + ox) * 4;
      out[i] = r * 255; out[i + 1] = g * 255; out[i + 2] = b * 255; out[i + 3] = c[3] * 255;
    }
  }
  return { width: outW, height: outH, data: out };
}

/* ---------- ヒストグラム ---------- */
// 明るさ（L）と R・G・B の 256 段の数。透明な画素は数えない。clipHi / clipLo は真っ白・真っ黒の画素の割合
export function histogram(data, step = 1) {
  const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    if (data[i + 3] === 0) continue;
    const R = data[i], G = data[i + 1], B = data[i + 2];
    r[R]++; g[G]++; b[B]++; l[Math.round(LUMA[0] * R + LUMA[1] * G + LUMA[2] * B)]++;
    total++;
  }
  return { r, g, b, l, total, clipHi: total ? l[255] / total : 0, clipLo: total ? l[0] / total : 0 };
}

/* ---------- .fdev（調整の設定のファイル） ---------- */
export const FDEV_FORMAT = 'future-os-photo-develop';
export const FDEV_VERSION = 1;
export const FDEV_EXT = '.fdev';
// 元の画像の名前のうしろに .fdev を付ける（海.jpg → 海.jpg.fdev）。同じ名前の JPEG と PNG があっても混ざらない
export const fdevPathFor = (path) => path + FDEV_EXT;
export const sourceOfFdevPath = (path) => (path.toLowerCase().endsWith(FDEV_EXT) ? path.slice(0, -FDEV_EXT.length) : null);
export function fdevText(source, s) {
  return JSON.stringify({ format: FDEV_FORMAT, version: FDEV_VERSION, app: '写真の現像', source, settings: normalize(s) }, null, 2);
}
export function parseFdev(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error('設定のファイルが JSON として読めません。'); }
  if (!o || typeof o !== 'object' || o.format !== FDEV_FORMAT) throw new Error('写真の現像の設定ではありません。');
  if (typeof o.version !== 'number' || o.version > FDEV_VERSION) throw new Error('新しい版の写真の現像で作った設定なので、読めません。');
  if (typeof o.source !== 'string' || !o.source.startsWith('/')) throw new Error('元の画像の場所が書かれていません。');
  return { source: o.source, settings: normalize(o.settings) };
}

/* ---------- 見本（プリセット） ---------- */
export const PRESETS = [
  { id: 'dusk', name: '夕暮れ', settings: { temp: 35, tint: 8, vibrance: 25, contrast: 10, highlights: -20, shadows: 10, vignette: 25 } },
  { id: 'faded', name: '色あせ', settings: { contrast: -20, blacks: 30, saturation: -30, temp: 10, curve: [[0, 0.1], [0.5, 0.52], [1, 0.94]] } },
  { id: 'crisp', name: 'くっきり', settings: { contrast: 30, vibrance: 30, sharpen: 40, shadows: 15, highlights: -15, whites: 10, blacks: -10 } },
  { id: 'mono', name: '白黒', settings: { mono: true, contrast: 25, curve: [[0, 0], [0.25, 0.2], [0.75, 0.82], [1, 1]] } },
  { id: 'mist', name: '朝もや', settings: { temp: -25, tint: -5, exposure: 0.2, contrast: -10, saturation: -15, highlights: -10, blacks: 15 } },
  { id: 'lagoon', name: '南の海', settings: { temp: -10, vibrance: 45, saturation: 10, contrast: 15, whites: 10, shadows: 10 } },
];
// 見本をかける: 色の設定は見本の値（書いていない値は 0）、切り抜きと回転は今のまま
export function applyPreset(cur, preset) {
  const base = defaults(), t = preset.settings || {};
  const out = { ...base, ...Object.fromEntries(Object.entries(t).filter(([k]) => !GEOMETRY_KEYS.includes(k))) };
  out.curve = (t.curve || base.curve).map((p) => [...p]);
  for (const k of GEOMETRY_KEYS) out[k] = k === 'crop' ? { ...cur.crop } : cur[k];
  return out;
}
// 利用者が保存した見本の一覧を検証する（名前は 1〜24 文字、設定は範囲の内へ）
export function normalizePresets(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p && typeof p === 'object' && typeof p.name === 'string' && p.name.trim())
    .slice(0, 40).map((p) => ({ name: p.name.trim().slice(0, 24), settings: toneOnly(normalize(p.settings)) }));
}

/* ---------- 書き出し ---------- */
export const EXPORT_TYPES = {
  jpeg: { mime: 'image/jpeg', ext: '.jpg', name: 'JPEG' },
  png: { mime: 'image/png', ext: '.png', name: 'PNG' },
  webp: { mime: 'image/webp', ext: '.webp', name: 'WebP' },
};
export const exportName = (path, fmt) => basename(path).replace(/\.[^.]+$/, '') + '-現像' + EXPORT_TYPES[fmt].ext;

// 見本の写真を描くときの、同じ種から同じ並びが出る乱数
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- WebGL2 のシェーダー（developInto・renderCPU と同じ式） ---------- */
export const VERT_SRC = `#version 300 es
void main() {
  // 頂点の番号だけで、画面全体を覆う三角形を作る（頂点のデータは使わない）
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
export const FRAG_SRC = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uSrc;   // 元の画像（sRGB の値のまま。線形にはシェーダーの中で直す）
uniform sampler2D uLut;   // トーンカーブの表（R32F、256×1）
uniform vec2 uSrcSize;
uniform vec3 uMx, uMy;    // 出力の画素 → 元の画素（geometryMatrix）
uniform vec2 uOutSize;
uniform vec3 uFrag;       // 出力の座標 = (uFrag.x + gl_FragCoord.x, uFrag.y + uFrag.z * gl_FragCoord.y)
uniform mat3 uWB;
uniform float uGain, uSh, uHi, uBp, uWp, uK, uSat, uVib, uVig, uSharp, uSplit;
uniform bool uMono, uBypass;
out vec4 outColor;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 toLinear(vec3 c) { return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, vec3(lessThanEqual(c, vec3(0.04045)))); }
vec3 toSrgb(vec3 c) { return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
float curve(float x) {
  float p = clamp(x, 0.0, 1.0) * 255.0;
  int i = min(int(floor(p)), 254);
  float a = texelFetch(uLut, ivec2(i, 0), 0).r, b = texelFetch(uLut, ivec2(i + 1, 0), 0).r;
  return a + (b - a) * (p - float(i));
}
vec3 develop(vec3 c, vec2 uv) {
  vec3 s = toSrgb(max(uWB * toLinear(c) * uGain, 0.0));
  float L = dot(s, LUMA);
  s *= exp2(uSh * (1.0 - smoothstep(0.0, 0.6, L)) + uHi * smoothstep(0.35, 1.0, L));
  s = (s - uBp) / (uWp - uBp);
  vec3 x = clamp(s, 0.0, 1.0), xk = pow(x, vec3(uK));
  s = xk / (xk + pow(1.0 - x, vec3(uK)));
  s = vec3(curve(s.r), curve(s.g), curve(s.b));
  L = dot(s, LUMA);
  float ch = max(s.r, max(s.g, s.b)) - min(s.r, min(s.g, s.b));
  s = L + (s - L) * ((1.0 + uSat) * (1.0 + uVib * (1.0 - ch)));
  if (uMono) s = vec3(dot(s, LUMA));
  float d = length((uv - 0.5) * 2.0) * 0.70710678;
  s *= 1.0 - uVig * smoothstep(0.25, 1.0, d);
  return clamp(s, 0.0, 1.0);
}
vec4 tex(vec2 p) { return texture(uSrc, p / uSrcSize); }
void main() {
  vec2 o = vec2(uFrag.x + gl_FragCoord.x, uFrag.y + uFrag.z * gl_FragCoord.y);
  vec2 p = vec2(dot(uMx, vec3(o, 1.0)), dot(uMy, vec3(o, 1.0)));
  if (p.x < 0.0 || p.y < 0.0 || p.x > uSrcSize.x || p.y > uSrcSize.y) { outColor = vec4(0.0); return; }
  vec4 c4 = tex(p);
  vec3 c = c4.rgb;
  if (!uBypass && o.x >= uSplit * uOutSize.x) {
    if (uSharp > 0.0) {
      vec3 n = tex(p + vec2(1.0, 0.0)).rgb + tex(p - vec2(1.0, 0.0)).rgb + tex(p + vec2(0.0, 1.0)).rgb + tex(p - vec2(0.0, 1.0)).rgb;
      c = clamp(c + uSharp * (c - n * 0.25), 0.0, 1.0);
    }
    c = develop(c, o / uOutSize);
  }
  outColor = vec4(c * c4.a, c4.a); // canvas は乗算済みのアルファで描く
}`;
