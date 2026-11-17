// 建物・木・地面の絵をコードで描き、拡大率ごとに作り置きする（毎コマ描くと重いため）。
// 建物は「昼の絵」「宵の絵（窓の明かりが多い）」「深夜の絵（明かりが少ない）」の3枚を作り、時刻に合わせて重ねる。
// 投影は図鑑の「昼と夜がめぐるアイソメトリックの街」と同じ: マス (i, j) の上の角が (i − j)·幅/2, (i + j)·高さ/2
import { makeRng } from './core/rng.mjs';
import { ZONES } from './core/defs.mjs';

export const TW0 = 64, TH0 = 32; // 拡大率 1 のマスの幅と高さ（画面の点）
let SC = 1;
const cache = new Map();
export function setScale(sc) { if (Math.abs(sc - SC) > 1e-6) { cache.clear(); SC = sc; } }
export const cacheSize = () => cache.size;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
export const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// 面の色。night のときは暗く青みがかった色にする
function col(c, f = 1, night = false, a = 1) {
  let r = c[0] * f, g = c[1] * f, b = c[2] * f;
  if (night) { r = r * 0.2 + 10; g = g * 0.22 + 12; b = b * 0.3 + 30; }
  return a < 1 ? `rgba(${r | 0},${g | 0},${b | 0},${a})` : `rgb(${r | 0},${g | 0},${b | 0})`;
}
function poly(g, pts, fill) { g.beginPath(); pts.forEach((p, n) => (n ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = fill; g.fill(); }
function line(g, a, b, color, w) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.strokeStyle = color; g.lineWidth = w; g.stroke(); }

// 絵を1枚作る。n はマスの数（1 か 2）、H は一番高い所（拡大率 1 の点）。draw(g, P, s, meta)
function sprite(key, n, H, draw) {
  let sp = cache.get(key);
  if (sp) return sp;
  const s = SC, TW = TW0 * s, TH = TH0 * s, pad = 6 * s;
  const w = n * TW + pad * 2, oy = H * s + pad + 12 * s, h = oy + n * TH + pad;
  const c = canvas(w, h), g = c.getContext('2d'), ox = w / 2;
  const P = (i, j, z = 0) => [ox + ((i - j) * TW) / 2, oy + ((i + j) * TH) / 2 - z * s];
  const meta = { smoke: [], lights: [] };
  draw(g, P, s, meta);
  sp = { img: c, ox, oy, smoke: meta.smoke.map(([x, y]) => [x - ox, y - oy]), lights: meta.lights.map(([x, y, c2]) => [x - ox, y - oy, c2]) };
  cache.set(key, sp);
  return sp;
}

// 箱（直方体）。見える面は、手前左（+j の面）、手前右（+i の面）、上
function box(g, P, i0, j0, i1, j1, z0, z1, c, night, top) {
  poly(g, [P(i0, j1, z0), P(i1, j1, z0), P(i1, j1, z1), P(i0, j1, z1)], col(c, 0.84, night));
  poly(g, [P(i1, j1, z0), P(i1, j0, z0), P(i1, j0, z1), P(i1, j1, z1)], col(c, 0.66, night));
  poly(g, [P(i0, j0, z1), P(i1, j0, z1), P(i1, j1, z1), P(i0, j1, z1)], col(top || c, 1.02, night));
}
// 窓。face 'L' は手前左の面（j = j1）、'R' は手前右の面（i = i1）。mode = { night, lit: 明かりの割合, warm: 色 }
function windows(g, P, face, i0, j0, i1, j1, z0, z1, floorH, perTile, rnd, mode) {
  const len = face === 'L' ? i1 - i0 : j1 - j0, cols = Math.max(1, Math.round(len * perTile));
  const floors = Math.max(1, Math.floor((z1 - z0) / floorH));
  for (let f = 0; f < floors; f++) {
    const zb = z0 + f * floorH + floorH * 0.32, zt = zb + floorH * 0.42;
    for (let c = 0; c < cols; c++) {
      const u0 = (c + 0.22) / cols, u1 = (c + 0.78) / cols;
      const q = face === 'L'
        ? [P(i0 + len * u0, j1, zb), P(i0 + len * u1, j1, zb), P(i0 + len * u1, j1, zt), P(i0 + len * u0, j1, zt)]
        : [P(i1, j1 - len * u0, zb), P(i1, j1 - len * u1, zb), P(i1, j1 - len * u1, zt), P(i1, j1 - len * u0, zt)];
      const r = rnd.next();
      if (mode.night) {
        if (r < mode.lit) { const w = mode.warm || [255, 214, 120], v = 0.82 + rnd.next() * 0.18; poly(g, q, `rgba(${w[0] * v | 0},${w[1] * v | 0},${w[2] * v | 0},0.95)`); }
        else poly(g, q, 'rgba(8,10,24,0.6)');
      } else poly(g, q, face === 'L' ? 'rgba(52,74,104,0.62)' : 'rgba(36,52,80,0.66)');
    }
  }
}
// 切妻の屋根。ridge は 'i'（i の向きに棟）か 'j'
function gable(g, P, i0, j0, i1, j1, z, rh, roof, wall, night, ridge) {
  const o = 0.05;
  if (ridge === 'i') {
    const jm = (j0 + j1) / 2;
    poly(g, [P(i0 - o, jm, z + rh), P(i1 + o, jm, z + rh), P(i1 + o, j0 - o, z - 1), P(i0 - o, j0 - o, z - 1)], col(roof, 0.78, night));
    poly(g, [P(i1, j0, z), P(i1, j1, z), P(i1, jm, z + rh)], col(wall, 0.66, night));
    poly(g, [P(i0 - o, j1 + o, z - 1), P(i1 + o, j1 + o, z - 1), P(i1 + o, jm, z + rh), P(i0 - o, jm, z + rh)], col(roof, 1, night));
  } else {
    const im = (i0 + i1) / 2;
    poly(g, [P(im, j0 - o, z + rh), P(im, j1 + o, z + rh), P(i0 - o, j1 + o, z - 1), P(i0 - o, j0 - o, z - 1)], col(roof, 0.86, night));
    poly(g, [P(i0, j1, z), P(i1, j1, z), P(im, j1, z + rh)], col(wall, 0.84, night));
    poly(g, [P(i1 + o, j0 - o, z - 1), P(i1 + o, j1 + o, z - 1), P(im, j1 + o, z + rh), P(im, j0 - o, z + rh)], col(roof, 0.72, night));
  }
}
function tree(g, P, i, j, size, c, night, s) {
  const [x, y] = P(i, j, 0), r = size * s;
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x + r * 0.3, y, r * 0.9, r * 0.45, 0, 0, 7); g.fill();
  g.fillStyle = col([96, 70, 50], 1, night); g.fillRect(x - r * 0.12, y - r * 0.9, r * 0.24, r * 0.9);
  g.fillStyle = col(c, 0.8, night); g.beginPath(); g.arc(x, y - r * 1.25, r * 0.85, 0, 7); g.fill();
  g.fillStyle = col(c, 1.05, night); g.beginPath(); g.arc(x - r * 0.25, y - r * 1.45, r * 0.55, 0, 7); g.fill();
}
const WALLS = ['#f2e6d0', '#e9d6c4', '#dfe8ee', '#f4ead9', '#e6dccb', '#d9e4d6', '#f0dccf', '#e3e0f0'].map(rgb);
const ROOFS = ['#b5524a', '#5a6b8c', '#4f7a5e', '#8a5a3c', '#3f4a5c', '#a86b3f', '#6b4e78', '#2f6f7a'].map(rgb);
const CONC = ['#c9c4bb', '#b8bcc4', '#d3c9b8', '#aeb6bf', '#c4b9ad', '#bfc6c9'].map(rgb);
const AWN = ['#e85b5b', '#3d8fe0', '#f2b134', '#33b38a', '#c05fd6', '#ff7f50'].map(rgb);
const GLASS = ['#6fa8c8', '#7b9cc4', '#5f9fa8', '#8aa7bf', '#6a8fb8'].map(rgb);
const TREE = ['#4f9a4a', '#3f8a52', '#5aa65a', '#6b9e3f', '#3d7f47'].map(rgb);

// 光り方の組: day 昼、eve 宵（多く灯る）、late 深夜（少し）
const LIT = { eve: { R: 0.72, C: 0.92, I: 0.35, O: 0.7 }, late: { R: 0.16, C: 0.45, I: 0.3, O: 0.12 } };
const WARM = { R: [255, 210, 120], C: [255, 236, 190], I: [255, 190, 110], O: [200, 230, 255] };

// 区画に建った建物の絵。light は 'day' 'eve' 'late'
export function building(zone, lvl, vari, light, abandoned = false) {
  const key = `b${zone}|${lvl}|${vari & 7}|${light}|${abandoned ? 1 : 0}`;
  const night = light !== 'day', Z = ZONES[zone], cls = Z.cls;
  const rnd = makeRng(1 + (vari & 7) * 977 + zone * 131 + lvl * 17);
  const v = (vari & 7);
  const litP = abandoned ? 0 : night ? LIT[light][cls] : 0;
  const mode = { night, lit: litP, warm: WARM[cls] };
  const gray = (c) => (abandoned ? [c[0] * 0.55 + 50, c[1] * 0.55 + 50, c[2] * 0.55 + 50] : c);
  if (cls === 'R' && zone === 1) {
    const wall = gray(WALLS[v]), roof = gray(ROOFS[(v * 3 + lvl) % 8]), ridge = v & 1 ? 'i' : 'j';
    const H = lvl === 1 ? 10 : 17, rh = lvl === 1 ? 7 : 9;
    return sprite(key, 1, H + rh + 8, (g, P, s) => {
      const m = lvl === 1 ? 0.24 : 0.16;
      if (lvl === 3) { box(g, P, 0.08, 0.08, 0.92, 0.2, 0, 3, [80, 140, 80], night); tree(g, P, 0.2, 0.82, 6, TREE[v % 5], night, s); }
      box(g, P, m, m, 1 - m, 1 - m, 0, H, wall, night);
      windows(g, P, 'L', m, m, 1 - m, 1 - m, 0, H, 8.5, 2.6, rnd, mode);
      windows(g, P, 'R', m, m, 1 - m, 1 - m, 0, H, 8.5, 2.6, rnd, mode);
      gable(g, P, m, m, 1 - m, 1 - m, H, rh, roof, wall, night, ridge);
      if (lvl >= 2) box(g, P, 1 - m - 0.14, m + 0.1, 1 - m - 0.06, m + 0.18, H + rh * 0.4, H + rh + 3, [120, 100, 90], night);
    });
  }
  if (cls === 'R') {
    const c = gray(CONC[v % 6]), H = [38, 64, 100][lvl - 1] * (0.88 + rnd.next() * 0.24);
    return sprite(key, 1, H + 16, (g, P) => {
      const m = 0.12;
      box(g, P, m, m, 1 - m, 1 - m, 0, H, c, night);
      windows(g, P, 'L', m, m, 1 - m, 1 - m, 2, H, 8, 4, rnd, mode);
      windows(g, P, 'R', m, m, 1 - m, 1 - m, 2, H, 8, 4, rnd, mode);
      // ベランダの線
      for (let z = 8; z < H - 2; z += 8) line(g, P(m, 1 - m, z), P(1 - m, 1 - m, z), col([250, 250, 250], 0.95, night, 0.7), Math.max(1, SC));
      box(g, P, 0.3, 0.3, 0.55, 0.55, H, H + 6, [150, 150, 150], night);
      if (lvl === 3) box(g, P, 0.62, 0.25, 0.78, 0.41, H, H + 10, [170, 120, 90], night);
    });
  }
  if (cls === 'C' && zone === 3) {
    const wall = gray(WALLS[(v + 3) % 8]), awn = gray(AWN[v % 6]), H = [12, 20, 25][lvl - 1];
    return sprite(key, 1, H + 18, (g, P, s, meta) => {
      const m = lvl === 3 ? 0.07 : 0.14;
      box(g, P, m, m, 1 - m, 1 - m, 0, H, wall, night);
      windows(g, P, 'L', m, m, 1 - m, 1 - m, 0, H, H > 14 ? 9 : 12, 2.2, rnd, { ...mode, lit: night ? 0.95 : 0 });
      windows(g, P, 'R', m, m, 1 - m, 1 - m, 0, H, H > 14 ? 9 : 12, 2.2, rnd, { ...mode, lit: night ? 0.95 : 0 });
      // 日よけ（手前左の面から張り出す）
      const za = 7, o = 0.12;
      poly(g, [P(m, 1 - m, za + 3), P(1 - m, 1 - m, za + 3), P(1 - m, 1 - m + o, za), P(m, 1 - m + o, za)], col(awn, 1, night));
      for (let x = 0; x < 6; x += 2) poly(g, [P(m + (1 - 2 * m) * x / 6, 1 - m, za + 3), P(m + (1 - 2 * m) * (x + 1) / 6, 1 - m, za + 3), P(m + (1 - 2 * m) * (x + 1) / 6, 1 - m + o, za), P(m + (1 - 2 * m) * x / 6, 1 - m + o, za)], col([255, 255, 255], 0.95, night, 0.75));
      // 屋上の看板
      const sc = night ? (abandoned ? [40, 40, 50] : awn.map((x) => Math.min(255, x * 1.2 + 40))) : awn;
      poly(g, [P(m + 0.15, 1 - m - 0.05, H), P(1 - m - 0.15, 1 - m - 0.05, H), P(1 - m - 0.15, 1 - m - 0.05, H + 7), P(m + 0.15, 1 - m - 0.05, H + 7)], night ? `rgb(${sc.join(',')})` : col(sc, 1));
      if (night && !abandoned) { const [x, y] = P(0.5, 1 - m - 0.05, H + 3.5); meta.lights.push([x, y, `rgb(${sc.join(',')})`]); }
    });
  }
  if (cls === 'C') {
    const c = gray(GLASS[v % 5].map((x, i) => x * 0.6 + [210, 200, 190][i] * 0.4)), H = [44, 76, 118][lvl - 1] * (0.9 + rnd.next() * 0.2);
    const neon = gray(AWN[(v + 2) % 6]);
    return sprite(key, 1, H + 20, (g, P, s, meta) => {
      const m = 0.1;
      box(g, P, m, m, 1 - m, 1 - m, 0, 14, gray([220, 210, 200]), night);
      windows(g, P, 'L', m, m, 1 - m, 1 - m, 0, 14, 14, 2, rnd, { ...mode, lit: night ? 0.95 : 0 });
      const t = 0.16;
      box(g, P, t, t, 1 - t, 1 - t, 14, H, c, night);
      windows(g, P, 'L', t, t, 1 - t, 1 - t, 14, H, 8, 4, rnd, mode);
      windows(g, P, 'R', t, t, 1 - t, 1 - t, 14, H, 8, 4, rnd, mode);
      // 看板: 半分の建物は縦長の袖看板（壁から突き出す）、残りは屋上の看板。夜は光る
      const lit = night && !abandoned;
      const signCol = lit ? `rgb(${neon.map((x) => Math.min(255, x * 0.75 + 70)).join(',')})` : col(neon, 0.95);
      if (v % 2 === 0) {
        const j0 = 1 - t - 0.06, zb = Math.max(16, H * 0.3), zh = Math.min(30, H * 0.4);
        poly(g, [P(1 - t, j0, zb), P(1 - t + 0.13, j0, zb), P(1 - t + 0.13, j0, zb + zh), P(1 - t, j0, zb + zh)], signCol);
        for (let q = 0; q < 3; q++) poly(g, [P(1 - t + 0.04, j0, zb + 4 + q * zh / 3.4), P(1 - t + 0.09, j0, zb + 4 + q * zh / 3.4), P(1 - t + 0.09, j0, zb + 4 + q * zh / 3.4 + zh / 6), P(1 - t + 0.04, j0, zb + 4 + q * zh / 3.4 + zh / 6)], lit ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.7)');
        if (lit) { const [x, y] = P(1 - t + 0.07, j0, zb + zh / 2); meta.lights.push([x, y, `rgb(${neon.join(',')})`]); }
      } else if (lvl < 3) {
        poly(g, [P(0.3, 0.52, H), P(0.72, 0.52, H), P(0.72, 0.52, H + 11), P(0.3, 0.52, H + 11)], signCol);
        line(g, P(0.36, 0.52, H), P(0.36, 0.52, H - 1), col([90, 90, 90], 1, night), Math.max(1, SC));
        if (lit) { const [x, y] = P(0.51, 0.52, H + 5.5); meta.lights.push([x, y, `rgb(${neon.join(',')})`]); }
      }
      if (lvl === 3) { box(g, P, 0.26, 0.26, 0.74, 0.74, H, H + 10, c, night); poly(g, [P(0.26, 0.74, H + 8), P(0.74, 0.74, H + 8), P(0.74, 0.74, H + 10), P(0.26, 0.74, H + 10)], lit ? '#7ff3ff' : '#d9eef5'); }
    });
  }
  if (cls === 'I') {
    const c = gray(CONC[(v + 2) % 6]), roof = gray([[150, 90, 70], [90, 110, 130], [120, 120, 110]][v % 3]);
    return sprite(key, 1, 56, (g, P, s, meta) => {
      if (lvl === 1) {
        box(g, P, 0.1, 0.12, 0.9, 0.88, 0, 12, c, night);
        // のこぎり屋根
        for (let k = 0; k < 3; k++) { const a = 0.1 + k * 0.8 / 3, b = a + 0.8 / 3; poly(g, [P(a, 0.12, 12), P(a, 0.88, 12), P(b, 0.88, 19), P(b, 0.12, 19)], col(roof, 0.9, night)); poly(g, [P(b, 0.88, 12), P(b, 0.88, 19), P(b, 0.12, 19), P(b, 0.12, 12)], col([200, 210, 220], 0.75, night)); }
        windows(g, P, 'L', 0.1, 0.12, 0.9, 0.88, 0, 12, 12, 2, rnd, mode);
        box(g, P, 0.72, 0.18, 0.84, 0.3, 0, 40, [170, 80, 70], night);
        for (let z = 8; z < 40; z += 10) box(g, P, 0.72, 0.18, 0.84, 0.3, z, z + 4, [235, 235, 235], night);
        meta.smoke.push(P(0.78, 0.24, 41));
      } else if (lvl === 2) {
        box(g, P, 0.08, 0.1, 0.62, 0.9, 0, 18, c, night);
        windows(g, P, 'L', 0.08, 0.1, 0.62, 0.9, 0, 18, 9, 2.5, rnd, mode);
        windows(g, P, 'R', 0.08, 0.1, 0.62, 0.9, 0, 18, 9, 2.5, rnd, mode);
        for (const [ci, cj] of [[0.78, 0.3], [0.78, 0.7]]) { box(g, P, ci - 0.12, cj - 0.12, ci + 0.12, cj + 0.12, 0, 15, [210, 215, 220], night, [235, 240, 245]); }
        box(g, P, 0.3, 0.2, 0.4, 0.3, 18, 34, [130, 130, 130], night);
        meta.smoke.push(P(0.35, 0.25, 35));
      } else {
        box(g, P, 0.08, 0.08, 0.92, 0.92, 0, 20, gray([160, 175, 190]), night);
        windows(g, P, 'L', 0.08, 0.08, 0.92, 0.92, 0, 20, 10, 3, rnd, mode);
        windows(g, P, 'R', 0.08, 0.08, 0.92, 0.92, 0, 20, 10, 3, rnd, mode);
        for (let k = 0; k < 3; k++) poly(g, [P(0.18 + k * 0.22, 0.2, 21), P(0.36 + k * 0.22, 0.2, 21), P(0.36 + k * 0.22, 0.8, 23), P(0.18 + k * 0.22, 0.8, 23)], col([40, 60, 110], 1, night));
        box(g, P, 0.8, 0.12, 0.88, 0.2, 20, 30, [200, 200, 200], night);
        meta.smoke.push(P(0.84, 0.16, 31));
      }
    });
  }
  // オフィス: ガラスの塔
  const c = gray(GLASS[v % 5]), H = [56, 96, 150][lvl - 1] * (0.9 + rnd.next() * 0.2);
  return sprite(key, 1, H + 30, (g, P, s, meta) => {
    const m = 0.12;
    box(g, P, m, m, 1 - m, 1 - m, 0, H, c, night, c.map((x) => x * 0.8));
    windows(g, P, 'L', m, m, 1 - m, 1 - m, 3, H, 6.5, 5, rnd, { ...mode, warm: [215, 235, 255] });
    windows(g, P, 'R', m, m, 1 - m, 1 - m, 3, H, 6.5, 5, rnd, { ...mode, warm: [215, 235, 255] });
    // 縦のすじ
    for (let k = 1; k < 4; k++) line(g, P(m + (1 - 2 * m) * k / 4, 1 - m, 0), P(m + (1 - 2 * m) * k / 4, 1 - m, H), col([230, 240, 250], 0.9, night, 0.35), Math.max(1, SC * 0.8));
    if (lvl >= 2) box(g, P, 0.3, 0.3, 0.7, 0.7, H, H + 8, c, night);
    if (lvl === 3) { line(g, P(0.5, 0.5, H + 8), P(0.5, 0.5, H + 28), col([200, 200, 210], 1, night), Math.max(1, SC * 1.5)); meta.lights.push([...P(0.5, 0.5, H + 28), '#ff4040']); }
  });
}

// 建設中: 骨組みと足場、小さなクレーン
export function construction(zone, vari, light) {
  const night = light !== 'day', key = `c${zone}|${vari & 3}|${night ? 1 : 0}`;
  const tall = zone === 2 || zone === 4 || zone === 6;
  return sprite(key, 1, tall ? 60 : 30, (g, P, s, meta) => {
    poly(g, [P(0.1, 0.1), P(0.9, 0.1), P(0.9, 0.9), P(0.1, 0.9)], col([170, 150, 120], 1, night));
    const H = tall ? 28 : 10;
    box(g, P, 0.18, 0.18, 0.82, 0.82, 0, 4, [190, 190, 185], night);
    for (const [i, j] of [[0.2, 0.8], [0.8, 0.8], [0.8, 0.2]]) line(g, P(i, j, 4), P(i, j, H), col([230, 180, 60], 1, night), Math.max(1, SC));
    for (let z = 8; z <= H; z += 8) { line(g, P(0.2, 0.8, z), P(0.8, 0.8, z), col([230, 180, 60], 1, night), Math.max(1, SC)); line(g, P(0.8, 0.8, z), P(0.8, 0.2, z), col([230, 180, 60], 1, night), Math.max(1, SC)); }
    if (tall) {
      line(g, P(0.3, 0.3, 0), P(0.3, 0.3, H + 22), col([240, 200, 40], 1, night), Math.max(1.5, SC * 1.6));
      line(g, P(0.05, 0.3, H + 22), P(0.9, 0.3, H + 22), col([240, 200, 40], 1, night), Math.max(1.5, SC * 1.6));
      if (night) meta.lights.push([...P(0.9, 0.3, H + 22), '#ff4040']);
    }
  });
}
export function rubble(light) {
  const night = light !== 'day';
  return sprite(`rub|${night ? 1 : 0}`, 1, 8, (g, P) => {
    poly(g, [P(0.1, 0.1), P(0.9, 0.1), P(0.9, 0.9), P(0.1, 0.9)], col([60, 55, 52], 1, night));
    const r = makeRng(7);
    for (let k = 0; k < 9; k++) { const i = 0.2 + r.next() * 0.6, j = 0.2 + r.next() * 0.6; box(g, P, i, j, i + 0.08, j + 0.08, 0, 2 + r.next() * 4, [90, 80, 75], night); }
  });
}
// 森のマス（木 1〜3 本）
export function trees(n, vari, light) {
  const night = light !== 'day', key = `t${n}|${vari & 7}|${night ? 1 : 0}`;
  return sprite(key, 1, 30, (g, P, s) => {
    const r = makeRng(3 + (vari & 7) * 13 + n);
    const spots = [[0.3, 0.35], [0.7, 0.4], [0.45, 0.72], [0.75, 0.78], [0.25, 0.8]];
    const k = n === 1 ? 2 : n === 2 ? 3 : 5;
    const pts = spots.slice(0, k).map(([i, j]) => [i + (r.next() - 0.5) * 0.12, j + (r.next() - 0.5) * 0.12]).sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (const [i, j] of pts) tree(g, P, i, j, 6 + r.next() * 4, TREE[r.int(0, 4)], night, s);
  });
}

// 施設の絵
export function service(key, light, vari = 0) {
  const night = light !== 'day', sk = `s${key}|${night ? 1 : 0}`;
  const rnd = makeRng(11 + key.length * 7);
  const mode = { night, lit: night ? 0.8 : 0, warm: [255, 225, 160] };
  const win = (g, P, i0, j0, i1, j1, z0, z1, fh = 9, per = 3) => { windows(g, P, 'L', i0, j0, i1, j1, z0, z1, fh, per, rnd, mode); windows(g, P, 'R', i0, j0, i1, j1, z0, z1, fh, per, rnd, mode); };
  const lawn = (g, P, n) => poly(g, [P(0.04, 0.04), P(n - 0.04, 0.04), P(n - 0.04, n - 0.04), P(0.04, n - 0.04)], col([110, 170, 90], 1, night));
  const pave = (g, P, n, c = [196, 190, 178]) => poly(g, [P(0.04, 0.04), P(n - 0.04, 0.04), P(n - 0.04, n - 0.04), P(0.04, n - 0.04)], col(c, 1, night));
  switch (key) {
    case 'coal': return sprite(sk, 2, 96, (g, P, s, meta) => {
      pave(g, P, 2, [150, 145, 140]);
      poly(g, [P(0.2, 1.3), P(0.8, 1.3), P(0.8, 1.85), P(0.2, 1.85)], col([40, 38, 40], 1, night));
      box(g, P, 0.15, 0.2, 1.3, 1.1, 0, 30, [168, 92, 76], night);
      win(g, P, 0.15, 0.2, 1.3, 1.1, 4, 28, 12, 3);
      box(g, P, 1.3, 0.3, 1.85, 1.0, 0, 18, [150, 150, 155], night);
      for (const [ci, cj] of [[1.45, 1.35], [1.7, 1.65]]) {
        box(g, P, ci - 0.12, cj - 0.12, ci + 0.12, cj + 0.12, 0, 84, [190, 190, 190], night);
        for (let z = 60; z < 84; z += 10) box(g, P, ci - 0.121, cj - 0.121, ci + 0.121, cj + 0.121, z, z + 5, [200, 60, 50], night);
        meta.smoke.push(P(ci, cj, 86));
        if (night) meta.lights.push([...P(ci, cj, 85), '#ff3030']);
      }
    });
    case 'solar': return sprite(sk, 2, 20, (g, P) => {
      lawn(g, P, 2);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
        const i0 = 0.12 + c * 0.9, j0 = 0.15 + r * 0.44;
        poly(g, [P(i0, j0, 6), P(i0 + 0.78, j0, 6), P(i0 + 0.78, j0 + 0.3, 2), P(i0, j0 + 0.3, 2)], col([40, 70, 140], 1, night));
        line(g, P(i0, j0 + 0.15, 4), P(i0 + 0.78, j0 + 0.15, 4), col([150, 180, 230], 1, night, 0.6), Math.max(1, SC * 0.6));
      }
    });
    case 'tower': return sprite(sk, 1, 50, (g, P, s, meta) => {
      lawn(g, P, 1);
      for (const [i, j] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) line(g, P(i, j, 0), P(0.5 + (i - 0.5) * 0.6, 0.5 + (j - 0.5) * 0.6, 30), col([120, 120, 130], 1, night), Math.max(1, SC * 1.2));
      box(g, P, 0.27, 0.27, 0.73, 0.73, 30, 44, [120, 180, 220], night, [170, 210, 235]);
      poly(g, [P(0.27, 0.27, 44), P(0.73, 0.27, 44), P(0.5, 0.5, 50), P(0.27, 0.73, 44)], col([90, 140, 180], 1, night));
      if (night) meta.lights.push([...P(0.5, 0.5, 50), '#ff3030']);
    });
    case 'pump': return sprite(sk, 1, 24, (g, P) => {
      pave(g, P, 1);
      box(g, P, 0.15, 0.15, 0.7, 0.75, 0, 14, [200, 210, 220], night, [90, 130, 170]);
      win(g, P, 0.15, 0.15, 0.7, 0.75, 2, 14, 12, 2);
      box(g, P, 0.7, 0.4, 0.98, 0.5, 2, 6, [80, 120, 160], night);
    });
    case 'sewer': case 'sewer2': {
      const n = key === 'sewer' ? 1 : 2;
      return sprite(sk, n, 20, (g, P) => {
        pave(g, P, n, [170, 168, 160]);
        const tanks = n === 1 ? [[0.35, 0.4, 0.22]] : [[0.45, 0.45, 0.3], [1.35, 0.45, 0.3], [0.45, 1.3, 0.3]];
        for (const [i, j, r] of tanks) {
          const [x, y] = P(i, j, 6), w = r * TW0 * SC * 0.72, h = w / 2;
          g.fillStyle = col([150, 150, 150], 0.8, night); g.fillRect(x - w, y, w * 2, 6 * SC);
          g.fillStyle = col([160, 160, 160], 1, night); g.beginPath(); g.ellipse(x, y + 6 * SC, w, h, 0, 0, 7); g.fill();
          g.fillStyle = col([150, 150, 150], 0.9, night); g.beginPath(); g.ellipse(x, y, w, h, 0, 0, 7); g.fill();
          g.fillStyle = col([90, 130, 110], 1, night); g.beginPath(); g.ellipse(x, y, w * 0.85, h * 0.85, 0, 0, 7); g.fill();
        }
        const bi = n === 1 ? 0.62 : 1.2, bj = n === 1 ? 0.55 : 1.15;
        box(g, P, bi, bj, bi + (n === 1 ? 0.3 : 0.65), bj + (n === 1 ? 0.35 : 0.7), 0, 12, [200, 195, 185], night);
        win(g, P, bi, bj, bi + (n === 1 ? 0.3 : 0.65), bj + (n === 1 ? 0.35 : 0.7), 2, 12, 10, 2);
      });
    }
    case 'fire': case 'police': case 'clinic': {
      const c = key === 'fire' ? [200, 60, 50] : key === 'police' ? [60, 80, 140] : [235, 238, 240];
      return sprite(sk, 1, 40, (g, P, s, meta) => {
        pave(g, P, 1);
        box(g, P, 0.12, 0.14, 0.88, 0.86, 0, 18, c, night, key === 'clinic' ? [210, 220, 220] : undefined);
        if (key === 'fire') {
          for (const a of [0.2, 0.52]) poly(g, [P(a, 0.86, 0), P(a + 0.26, 0.86, 0), P(a + 0.26, 0.86, 10), P(a, 0.86, 10)], col([240, 240, 230], 1, night));
          box(g, P, 0.66, 0.16, 0.86, 0.36, 18, 34, c, night);
          if (night) meta.lights.push([...P(0.76, 0.26, 35), '#ff5040']);
        } else if (key === 'police') {
          win(g, P, 0.12, 0.14, 0.88, 0.86, 2, 18, 8, 3);
          box(g, P, 0.4, 0.4, 0.6, 0.6, 18, 21, [230, 230, 240], night);
          if (night) meta.lights.push([...P(0.5, 0.5, 22), '#4080ff']);
        } else {
          win(g, P, 0.12, 0.14, 0.88, 0.86, 2, 18, 8, 3);
          const [x, y] = P(0.5, 0.86, 13), w = 4 * SC;
          g.fillStyle = night ? '#6dffa0' : '#2fae5f'; g.fillRect(x - w * 1.5, y - w / 2, w * 3, w); g.fillRect(x - w / 2, y - w * 1.5, w, w * 3);
          if (night) meta.lights.push([x, y, '#6dffa0']);
        }
      });
    }
    case 'hospital': return sprite(sk, 2, 70, (g, P, s, meta) => {
      pave(g, P, 2);
      box(g, P, 0.15, 0.2, 1.85, 1.0, 0, 18, [236, 238, 240], night);
      win(g, P, 0.15, 0.2, 1.85, 1.0, 2, 18, 8, 3);
      box(g, P, 0.3, 1.0, 1.2, 1.8, 0, 54, [230, 235, 240], night);
      win(g, P, 0.3, 1.0, 1.2, 1.8, 2, 54, 8, 3);
      poly(g, [P(0.45, 1.15, 54.5), P(1.05, 1.15, 54.5), P(1.05, 1.65, 54.5), P(0.45, 1.65, 54.5)], col([90, 170, 110], 1, night));
      const [x, y] = P(1.2, 1.4, 44), w = 5 * SC;
      g.fillStyle = night ? '#6dffa0' : '#2fae5f'; g.fillRect(x - w * 1.5, y - w / 2, w * 3, w); g.fillRect(x - w / 2, y - w * 1.5, w, w * 3);
      if (night) meta.lights.push([x, y, '#6dffa0']);
    });
    case 'school': case 'high': case 'univ': {
      const n = key === 'school' ? 1 : 2;
      return sprite(sk, n, key === 'univ' ? 56 : 34, (g, P, s, meta) => {
        lawn(g, P, n);
        if (n === 2) poly(g, [P(1.05, 0.15), P(1.85, 0.15), P(1.85, 1.0), P(1.05, 1.0)], col([196, 140, 100], 1, night));
        const c = key === 'univ' ? [205, 190, 170] : [236, 222, 190];
        const i1 = n === 1 ? 0.88 : 1.0, j1 = n === 1 ? 0.62 : 1.85;
        box(g, P, 0.12, 0.15, i1, j1, 0, 20, c, night);
        win(g, P, 0.12, 0.15, i1, j1, 2, 20, 9, 3);
        box(g, P, 0.4, j1 - 0.3, 0.6, j1, 20, 30, c, night);
        const [x, y] = P(0.5, j1, 26);
        g.fillStyle = col([250, 250, 250], 1, night); g.beginPath(); g.arc(x, y, 3 * SC, 0, 7); g.fill();
        if (key === 'univ') { const [dx, dy] = P(0.56, 1.0, 30); g.fillStyle = col([110, 160, 150], 1, night); g.beginPath(); g.ellipse(dx, dy, 14 * SC, 12 * SC, 0, Math.PI, 0); g.fill(); }
        if (n === 1) { tree(g, P, 0.3, 0.85, 5, TREE[1], night, SC); tree(g, P, 0.75, 0.82, 5, TREE[2], night, SC); }
        void meta;
      });
    }
    case 'park': return sprite(sk, 1, 24, (g, P, s) => {
      lawn(g, P, 1);
      poly(g, [P(0.45, 0.04), P(0.55, 0.04), P(0.55, 0.96), P(0.45, 0.96)], col([214, 200, 170], 1, night));
      box(g, P, 0.62, 0.55, 0.8, 0.62, 0, 2.5, [150, 100, 70], night);
      for (const [i, j, r] of [[0.25, 0.3, 7], [0.78, 0.25, 6], [0.25, 0.78, 6]]) tree(g, P, i, j, r, TREE[(i * 10) % 5 | 0], night, s);
    });
    case 'plaza': return sprite(sk, 1, 24, (g, P, s, meta) => {
      pave(g, P, 1, [222, 214, 196]);
      const [x, y] = P(0.5, 0.5, 0), w = 14 * SC;
      g.fillStyle = col([170, 170, 175], 1, night); g.beginPath(); g.ellipse(x, y, w, w / 2, 0, 0, 7); g.fill();
      g.fillStyle = col([100, 170, 220], 1, night); g.beginPath(); g.ellipse(x, y, w * 0.8, w * 0.4, 0, 0, 7); g.fill();
      box(g, P, 0.46, 0.46, 0.54, 0.54, 0, 8, [200, 200, 205], night);
      meta.lights.push([x, y - 9 * SC, 'fountain']);
      for (const [i, j] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) tree(g, P, i, j, 4, TREE[2], night, s);
    });
    case 'bigpark': return sprite(sk, 2, 30, (g, P, s) => {
      lawn(g, P, 2);
      const [x, y] = P(1.2, 1.1, 0), w = 34 * SC;
      g.fillStyle = col([70, 140, 190], 1, night); g.beginPath(); g.ellipse(x, y, w, w / 2.1, 0, 0, 7); g.fill();
      g.strokeStyle = col([214, 200, 170], 1, night); g.lineWidth = 3 * SC; g.beginPath(); g.ellipse(x, y, w * 1.25, w / 1.75, 0, 0, 7); g.stroke();
      const r = makeRng(19);
      for (let k = 0; k < 11; k++) { const i = 0.15 + r.next() * 1.7, j = 0.15 + r.next() * 1.7; if (Math.hypot(i - 1.2, (j - 1.1) * 1) < 0.65) continue; tree(g, P, i, j, 5 + r.next() * 4, TREE[r.int(0, 4)], night, s); }
    });
    case 'metro': return sprite(sk, 1, 26, (g, P, s, meta) => {
      pave(g, P, 1, [200, 200, 205]);
      box(g, P, 0.25, 0.3, 0.75, 0.7, 0, 10, [180, 190, 200], night, [70, 110, 170]);
      poly(g, [P(0.3, 0.7, 0), P(0.7, 0.7, 0), P(0.7, 0.7, 7), P(0.3, 0.7, 7)], 'rgba(10,15,30,0.85)');
      const [x, y] = P(0.82, 0.82, 16), r = 4.5 * SC;
      line(g, P(0.82, 0.82, 0), P(0.82, 0.82, 12), col([120, 120, 130], 1, night), Math.max(1, SC));
      g.fillStyle = night ? '#7fd0ff' : '#2a6fd0'; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.fill();
      g.fillStyle = '#fff'; g.fillRect(x - r * 0.4, y - r * 0.15, r * 0.8, r * 0.3);
      if (night) meta.lights.push([x, y, '#7fd0ff']);
    });
    case 'landmark': return sprite(sk, 1, 190, (g, P, s, meta) => {
      pave(g, P, 1, [214, 206, 190]);
      box(g, P, 0.2, 0.2, 0.8, 0.8, 0, 10, [200, 195, 185], night);
      for (let k = 0; k < 6; k++) { const z = 10 + k * 24, w = 0.22 - k * 0.025; box(g, P, 0.5 - w, 0.5 - w, 0.5 + w, 0.5 + w, z, z + 24, [235 - k * 6, 230 - k * 4, 220], night); }
      box(g, P, 0.3, 0.3, 0.7, 0.7, 120, 132, [80, 170, 200], night, [230, 240, 245]);
      line(g, P(0.5, 0.5, 154), P(0.5, 0.5, 186), col([220, 220, 230], 1, night), Math.max(1, SC * 1.5));
      meta.lights.push([...P(0.5, 0.5, 126), night ? '#ffe9a0' : 'none']);
      meta.lights.push([...P(0.5, 0.5, 186), '#ff4040']);
    });
    case 'wind': return sprite(sk, 1, 6, (g, P) => {
      lawn(g, P, 1);
      box(g, P, 0.4, 0.4, 0.6, 0.6, 0, 2, [190, 190, 190], night);
    });
    default: return sprite(sk, 1, 20, (g, P) => box(g, P, 0.2, 0.2, 0.8, 0.8, 0, 12, [200, 100, 200], night));
  }
}

// ---- 地面 ----
// mask は4方向の隣（1 東 +i、2 南 +j、4 西 −i、8 北 −j）
export function ground(kind, opt = {}) {
  const key = `g${kind}|${opt.mask ?? ''}|${opt.road ?? ''}|${opt.zone ?? ''}|${opt.v ?? ''}|${opt.shore ?? ''}`;
  let sp = cache.get(key);
  if (sp) return sp;
  const s = SC, TW = TW0 * s, TH = TH0 * s, pad = 2 * s;
  const deep = kind === 'bridge' ? 10 * s : 0;
  const c = canvas(TW + pad * 2, TH + pad * 2 + deep), g = c.getContext('2d');
  const ox = TW / 2 + pad, oy = pad;
  const P = (i, j, z = 0) => [ox + ((i - j) * TW) / 2, oy + ((i + j) * TH) / 2 - z * s];
  const diamond = (fill, e = 0) => poly(g, [P(e, e), P(1 - e, e), P(1 - e, 1 - e), P(e, 1 - e)], fill);
  const v = opt.v || 0;
  if (kind === 'grass' || kind === 'zone') {
    const base = [[118, 178, 92], [112, 172, 88], [124, 182, 96], [116, 174, 90]][v & 3];
    diamond(col(base));
    // 草のむら
    const r = makeRng(5 + v);
    g.fillStyle = 'rgba(70,130,60,0.25)';
    for (let k = 0; k < 4; k++) { const [x, y] = P(0.15 + r.next() * 0.7, 0.15 + r.next() * 0.7); g.fillRect(x, y, 2 * s, 1 * s); }
    if (opt.shore) {
      // 水に面した側は砂浜
      const sand = col([226, 208, 160]);
      if (opt.shore & 1) poly(g, [P(0.82, 0), P(1, 0), P(1, 1), P(0.82, 1)], sand);
      if (opt.shore & 2) poly(g, [P(0, 0.82), P(1, 0.82), P(1, 1), P(0, 1)], sand);
      if (opt.shore & 4) poly(g, [P(0, 0), P(0.18, 0), P(0.18, 1), P(0, 1)], sand);
      if (opt.shore & 8) poly(g, [P(0, 0), P(1, 0), P(1, 0.18), P(0, 0.18)], sand);
    }
    if (kind === 'zone') {
      const zc = rgb(ZONES[opt.zone].color);
      diamond(`rgba(${zc.join(',')},0.28)`, 0.06);
      g.strokeStyle = `rgba(${zc.join(',')},0.9)`; g.lineWidth = Math.max(1, 1.2 * s); g.setLineDash([3 * s, 2 * s]);
      g.beginPath(); [P(0.1, 0.1), P(0.9, 0.1), P(0.9, 0.9), P(0.1, 0.9)].forEach((p, n) => (n ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); g.stroke(); g.setLineDash([]);
    }
  } else if (kind === 'lot') {
    // 建物の建った区画の地面（区画の色の細い縁）
    diamond(col([150, 160, 130]));
    const zc = rgb(ZONES[opt.zone].color);
    g.strokeStyle = `rgba(${zc.join(',')},0.55)`; g.lineWidth = Math.max(1, s);
    g.beginPath(); [P(0.04, 0.04), P(0.96, 0.04), P(0.96, 0.96), P(0.04, 0.96)].forEach((p, n) => (n ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); g.stroke();
  } else if (kind === 'water') {
    diamond(col([[64, 132, 196], [60, 128, 192], [68, 136, 200], [62, 130, 194]][v & 3]));
    const m = opt.mask || 0; // 隣が陸の側に白い波
    g.strokeStyle = 'rgba(235,245,255,0.55)'; g.lineWidth = Math.max(1, 1.2 * s);
    const edges = [[1, P(1, 0), P(1, 1)], [2, P(0, 1), P(1, 1)], [4, P(0, 0), P(0, 1)], [8, P(0, 0), P(1, 0)]];
    for (const [bit, a, b] of edges) if (m & bit) { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
  } else if (kind === 'road' || kind === 'bridge') {
    const m = opt.mask || 0, rt = opt.road;
    if (kind === 'bridge') {
      diamond(col([64, 132, 196]));
      poly(g, [P(0, 1), P(1, 1), P(1, 1, -10), P(0, 1, -10)], 'rgba(0,0,0,0.25)');
    }
    const asphalt = rt === 3 ? [104, 106, 112] : rt === 2 ? [84, 86, 92] : [92, 94, 98];
    // 歩道（道が続かない側の縁）
    diamond(col(kind === 'bridge' ? [150, 150, 150] : [196, 192, 184]));
    const e = rt === 1 ? 0.12 : 0.06;
    const i0 = m & 4 ? 0 : e, i1 = m & 1 ? 1 : 1 - e, j0 = m & 8 ? 0 : e, j1 = m & 2 ? 1 : 1 - e;
    poly(g, [P(i0, j0), P(i1, j0), P(i1, j1), P(i0, j1)], col(asphalt));
    // 交差点の真ん中にも舗装を広げる
    poly(g, [P(e, e), P(1 - e, e), P(1 - e, 1 - e), P(e, 1 - e)], col(asphalt));
    const along = (m & 5) && !(m & 10) ? 'i' : (m & 10) && !(m & 5) ? 'j' : (m & 5) && (m & 10) ? 'x' : 'i';
    const deg = [1, 2, 4, 8].filter((b) => m & b).length;
    g.lineWidth = Math.max(1, (rt >= 2 ? 1.3 : 1) * s);
    const mark = (a, b, color, dash) => { g.strokeStyle = color; g.setLineDash(dash ? [3 * s, 3 * s] : []); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); g.setLineDash([]); };
    if (deg <= 2) {
      // 中央線（直線は向きに沿って、曲がり角は中心まで）
      const c = rt === 1 ? 'rgba(255,255,255,0.75)' : 'rgba(255,205,60,0.95)';
      const half = (bit) => ({ 1: [P(0.5, 0.5), P(1, 0.5)], 2: [P(0.5, 0.5), P(0.5, 1)], 4: [P(0, 0.5), P(0.5, 0.5)], 8: [P(0.5, 0), P(0.5, 0.5)] }[bit]);
      for (const bit of [1, 2, 4, 8]) if (m & bit) { const [a, b] = half(bit); mark(a, b, c, rt === 1); }
      if (rt >= 2 && along !== 'x') {
        // 車線の境の点線
        for (const off of [0.3, 0.7]) {
          if (along === 'i') mark(P(0, off), P(1, off), 'rgba(255,255,255,0.6)', true);
          else mark(P(off, 0), P(off, 1), 'rgba(255,255,255,0.6)', true);
        }
      }
    } else {
      // 交差点の横断歩道
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (const bit of [1, 2, 4, 8]) {
        if (!(m & bit)) continue;
        for (let k = 0; k < 4; k++) {
          const u = 0.22 + k * 0.16;
          const q = bit === 1 ? [P(0.86, u), P(0.96, u), P(0.96, u + 0.08), P(0.86, u + 0.08)] : bit === 4 ? [P(0.04, u), P(0.14, u), P(0.14, u + 0.08), P(0.04, u + 0.08)] : bit === 2 ? [P(u, 0.86), P(u + 0.08, 0.86), P(u + 0.08, 0.96), P(u, 0.96)] : [P(u, 0.04), P(u + 0.08, 0.04), P(u + 0.08, 0.14), P(u, 0.14)];
          poly(g, q, 'rgba(255,255,255,0.75)');
        }
      }
    }
    if (rt === 3) { g.strokeStyle = 'rgba(230,230,230,0.9)'; g.lineWidth = Math.max(1, 1.5 * s); if (!(m & 8)) { g.beginPath(); g.moveTo(...P(0, 0.03)); g.lineTo(...P(1, 0.03)); g.stroke(); } if (!(m & 2)) { g.beginPath(); g.moveTo(...P(0, 0.97)); g.lineTo(...P(1, 0.97)); g.stroke(); } }
    if (kind === 'bridge') { g.strokeStyle = 'rgba(240,240,240,0.9)'; g.lineWidth = Math.max(1, 1.5 * s); for (const [bit, a, b] of [[8, P(0, 0.02, 2), P(1, 0.02, 2)], [2, P(0, 0.98, 2), P(1, 0.98, 2)], [4, P(0.02, 0, 2), P(0.02, 1, 2)], [1, P(0.98, 0, 2), P(0.98, 1, 2)]]) if (!(m & bit)) { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); } }
  } else if (kind === 'dirt') {
    diamond(col([168, 150, 116]));
  }
  sp = { img: c, ox, oy };
  cache.set(key, sp);
  return sp;
}

// 夜の街灯の光だまり（加算で重ねる）
export function glow(color = '255,210,140', size = 1) {
  const key = `glow|${color}|${size}`;
  let sp = cache.get(key);
  if (sp) return sp;
  const r = 34 * SC * size, c = canvas(r * 2, r * 2), g = c.getContext('2d');
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, `rgba(${color},0.55)`); gr.addColorStop(0.4, `rgba(${color},0.18)`); gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
  sp = { img: c, ox: r, oy: r };
  cache.set(key, sp);
  return sp;
}
