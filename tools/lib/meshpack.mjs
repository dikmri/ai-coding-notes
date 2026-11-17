// 3D のデータを小さな整数に詰めて、1つのバイト列（base64 の文字列）にまとめる計算。
// 変換の道具（tools/vrm2js.mjs）とテストで使う。ブラウザで戻す計算は、データを使う項目のコードに同じ式で書いてある。
//
// - 位置: 全体を囲む箱の中を 0〜65535 に分けて Uint16 に（誤差は箱の幅の 1/65535 の半分まで）
// - 法線: 八面体に写して 2 つの Int8 に（向きの誤差は 1 度ほど）
// - UV: 範囲の中を 0〜65535 に分けて Uint16 に
// - 骨の重み: 4 つの合計がちょうど 255 になる Uint8 に
// - 表情の差分: 動く頂点だけを、番号と Int16 の組で持つ

export function quantizePositions(p) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i++) { const k = i % 3; if (p[i] < min[k]) min[k] = p[i]; if (p[i] > max[k]) max[k] = p[i]; }
  const q = new Uint16Array(p.length);
  for (let i = 0; i < p.length; i++) { const k = i % 3, w = max[k] - min[k]; q[i] = w > 0 ? Math.round((p[i] - min[k]) / w * 65535) : 0; }
  return { q, min, max };
}
export function dequantizePositions(q, min, max) {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) { const k = i % 3; out[i] = min[k] + q[i] / 65535 * (max[k] - min[k]); }
  return out;
}

export function quantizeUV(uv) {
  const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
  for (let i = 0; i < uv.length; i++) { const k = i % 2; if (uv[i] < min[k]) min[k] = uv[i]; if (uv[i] > max[k]) max[k] = uv[i]; }
  const q = new Uint16Array(uv.length);
  for (let i = 0; i < uv.length; i++) { const k = i % 2, w = max[k] - min[k]; q[i] = w > 0 ? Math.round((uv[i] - min[k]) / w * 65535) : 0; }
  return { q, min, max };
}
export const dequantizeUV = (q, min, max) => Float32Array.from(q, (v, i) => min[i % 2] + v / 65535 * (max[i % 2] - min[i % 2]));

// 八面体への写し方（octahedral encoding）: 単位ベクトルを |x|+|y|+|z| で割って八面体に乗せ、下半分を上に折り返す
export function octEncode(n) {
  const out = new Int8Array(n.length / 3 * 2);
  for (let i = 0, j = 0; i < n.length; i += 3, j += 2) {
    let x = n[i], y = n[i + 1]; const z = n[i + 2], s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
    x /= s; y /= s;
    if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1); y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1); }
    out[j] = Math.round(x * 127); out[j + 1] = Math.round(y * 127);
  }
  return out;
}
export function octDecode(e) {
  const out = new Float32Array(e.length / 2 * 3);
  for (let i = 0, j = 0; i < e.length; i += 2, j += 3) {
    let x = e[i] / 127, y = e[i + 1] / 127; const z = 1 - Math.abs(x) - Math.abs(y);
    if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1); y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1); }
    const l = Math.hypot(x, y, z) || 1; out[j] = x / l; out[j + 1] = y / l; out[j + 2] = z / l;
  }
  return out;
}

// 4 つの重みを、合計がちょうど 255 の整数に。切り捨てで足りない分は、端数の大きい順に 1 ずつ足す
export function packWeights(w) {
  const out = new Uint8Array(w.length);
  for (let v = 0; v < w.length; v += 4) {
    const s = w[v] + w[v + 1] + w[v + 2] + w[v + 3];
    if (!(s > 0)) { out[v] = 255; continue; }
    const f = [0, 1, 2, 3].map((k) => w[v + k] / s * 255), base = f.map(Math.floor);
    let rest = 255 - base.reduce((a, b) => a + b, 0);
    for (const k of [0, 1, 2, 3].sort((a, b) => (f[b] - base[b]) - (f[a] - base[a]))) { if (rest <= 0) break; base[k]++; rest--; }
    out.set(base, v);
  }
  return out;
}

// 表情の差分（頂点ごとの xyz の移動）: eps より大きく動く頂点だけを残す
export function packMorph(d, eps) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  const scale = m > 0 ? m / 32767 : 1, idx = [], q = [];
  for (let v = 0; v < d.length / 3; v++) {
    const x = d[v * 3], y = d[v * 3 + 1], z = d[v * 3 + 2];
    if (Math.abs(x) <= eps && Math.abs(y) <= eps && Math.abs(z) <= eps) continue;
    idx.push(v); q.push(Math.round(x / scale), Math.round(y / scale), Math.round(z / scale));
  }
  return { idx: Uint16Array.from(idx), d: Int16Array.from(q), scale };
}
export function unpackMorph(m, count) {
  const out = new Float32Array(count * 3);
  for (let k = 0; k < m.idx.length; k++) for (let c = 0; c < 3; c++) out[m.idx[k] * 3 + c] = m.d[k * 3 + c] * m.scale;
  return out;
}

// いくつもの型付き配列を、4 バイトの境目にそろえて1つのバイト列に並べる
const TYPES = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Float32Array };
export class Pack {
  constructor() { this.parts = []; this.size = 0; }
  add(a) {
    this.size = (this.size + 3) & ~3;
    const r = { o: this.size, n: a.length, t: a.constructor.name };
    this.parts.push([this.size, new Uint8Array(a.buffer, a.byteOffset, a.byteLength).slice()]);
    this.size += a.byteLength;
    return r;
  }
  bytes() { const out = new Uint8Array((this.size + 3) & ~3); for (const [o, b] of this.parts) out.set(b, o); return out; }
}
export const view = (bytes, r) => new TYPES[r.t](bytes.buffer, bytes.byteOffset + r.o, r.n);

export const toBase64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
export const fromBase64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
