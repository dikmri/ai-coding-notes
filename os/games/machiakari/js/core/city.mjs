// 街の土台: マスの配列（地形・木・道・区画・建物・施設）と、新しい街の地形づくり
import { hash2, makeRng } from './rng.mjs';
import { BUDGETS } from './defs.mjs';

export const idx = (N, i, j) => j * N + i;
export const inside = (N, i, j) => i >= 0 && j >= 0 && i < N && j < N;
// 建物の状態（bld）: 0 なし、1 建物、2 建設中、3 空き家、4 焼け跡
export const BLD = { NONE: 0, BUILT: 1, BUILDING: 2, ABANDONED: 3, RUBBLE: 4 };

// 保存する配列の名前と型。ここにない値は毎回計算しなおす
export const LAYERS = {
  terrain: Uint8Array, trees: Uint8Array, road: Uint8Array, zone: Uint8Array, bld: Uint8Array, lvl: Uint8Array,
  occ: Uint16Array, svc: Uint8Array, anchor: Int32Array, pw: Uint8Array, dist: Uint8Array, vari: Uint8Array, age: Uint16Array, burn: Uint8Array,
};

export function blankCity(N = 64) {
  const s = { v: 1, N, seed: 1, name: '新しい街', terrainType: 'flat' };
  for (const [k, T] of Object.entries(LAYERS)) s[k] = new T(N * N);
  s.anchor.fill(-1);
  for (let k = 0; k < N * N; k++) s.vari[k] = (k * 2654435761) >>> 24;
  s.funds = 20000;
  s.taxes = { R: 9, C: 9, I: 9, O: 9 };
  s.budgets = Object.fromEntries(Object.keys(BUDGETS).map((k) => [k, 100]));
  s.loans = [];
  s.policies = { 0: [] };
  s.districts = [];
  s.milestone = 0;
  s.time = { year: 2027, month: 4, mprog: 0, tod: 6 * 60 + 30 };
  s.rng = 1;
  s.entry = null;
  s.history = [];
  s.flags = { disasters: true };
  s.goals = {};
  s.rev = 0;
  return s;
}

// なめらかなノイズ（格子の値を補間）。0〜1
function noise(i, j, scale, seed) {
  const x = i / scale, y = j / scale, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (i, j, seed) => noise(i, j, 12, seed) * 0.6 + noise(i, j, 5, seed + 17) * 0.3 + noise(i, j, 2.5, seed + 31) * 0.1;

// terrain: 'river'（川が流れる）'lake'（湖）'coast'（海辺）'flat'（平ら）
export function createCity({ size = 80, seed = 1, terrain = 'river', name = '新しい街', funds = 20000 } = {}) {
  const N = size, s = blankCity(N);
  Object.assign(s, { seed, name, terrainType: terrain, funds, rng: (seed * 9301 + 49297) >>> 0 || 1 });
  const rng = makeRng(seed);
  const water = (i, j) => { s.terrain[idx(N, i, j)] = 1; };
  if (terrain === 'river') {
    const phase = rng.next() * 6.28, base = N * (0.6 + rng.next() * 0.08);
    for (let j = 0; j < N; j++) {
      const c = base + Math.sin(j * 0.11 + phase) * N * 0.07 + (fbm(0, j, seed) - 0.5) * 6;
      const w = 1.4 + fbm(j, 3, seed + 5) * 1.6;
      for (let i = Math.floor(c - w); i <= Math.ceil(c + w); i++) if (inside(N, i, j) && Math.abs(i - c) <= w) water(i, j);
    }
    // 川沿いの小さな池
    const pi = Math.floor(base - N * 0.18), pj = Math.floor(N * (0.2 + rng.next() * 0.6));
    for (let j = pj - 3; j <= pj + 3; j++) for (let i = pi - 3; i <= pi + 3; i++) if (inside(N, i, j) && Math.hypot(i - pi, j - pj) < 2.2 + fbm(i, j, seed + 9) * 1.5) water(i, j);
  } else if (terrain === 'lake') {
    const ci = N * 0.66, cj = N * 0.36, r = N * 0.15;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (Math.hypot(i - ci, j - cj) < r * (0.75 + fbm(i, j, seed) * 0.6)) water(i, j);
  } else if (terrain === 'coast') {
    for (let j = 0; j < N; j++) { const edge = N * 0.78 + (fbm(3, j, seed) - 0.5) * N * 0.18; for (let i = Math.floor(edge); i < N; i++) water(i, j); }
  }
  // 森
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = idx(N, i, j);
    if (s.terrain[k]) continue;
    const t = fbm(i, j, seed + 101);
    if (t > 0.6) s.trees[k] = t > 0.7 ? 3 : t > 0.65 ? 2 : 1;
  }
  // 外へつながる大通り（西の端から）。道のマスと、その両側の木は払っておく
  const j0 = Math.floor(N / 2), len = Math.round(N * 0.28);
  s.entry = { i: 0, j: j0, len };
  for (let i = 0; i < len; i++) {
    const k = idx(N, i, j0);
    s.terrain[k] = 0; s.trees[k] = 0; s.road[k] = 2;
    for (const dj of [-2, -1, 1, 2]) if (inside(N, i, j0 + dj)) { s.trees[idx(N, i, j0 + dj)] = 0; s.terrain[idx(N, i, j0 + dj)] = 0; }
  }
  return s;
}

// 地図の端にある道（外とのつながり）
export function edgeRoads(s) {
  const N = s.N, out = [];
  for (let k = 0; k < N; k++) for (const [i, j] of [[0, k], [N - 1, k], [k, 0], [k, N - 1]]) { const t = idx(N, i, j); if (s.road[t] && !out.includes(t)) out.push(t); }
  return out;
}
