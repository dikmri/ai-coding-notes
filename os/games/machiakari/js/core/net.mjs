// つながりの計算: 道に面しているか、電気・水道・下水の行き渡り、施設の届く範囲、車の経路
import { idx, BLD } from './city.mjs';
import { ROADS } from './defs.mjs';

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// 電気は建物と区画から、2マス以内の建物と区画と電線へ伝わる（1マスの道なら飛び越える）
const D12 = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// 区画が使える道（小道と大通り）から3マス以内のマスに、いちばん近い道のマスを入れる。道のマスは自分自身。なければ -1
export function computeAccess(s, depth = 3) {
  const N = s.N, n = N * N, acc = new Int32Array(n).fill(-1), dist = new Uint8Array(n);
  const q = new Int32Array(n);
  let h = 0, t = 0;
  for (let k = 0; k < n; k++) if (s.road[k] && ROADS[s.road[k]].zoneAccess) { acc[k] = k; q[t++] = k; }
  while (h < t) {
    const k = q[h++], i = k % N, j = (k - i) / N;
    if (dist[k] >= depth) continue;
    for (const [di, dj] of D4) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const m = b * N + a;
      if (acc[m] !== -1 || s.road[m] || s.terrain[m] === 1) continue;
      acc[m] = acc[k]; dist[m] = dist[k] + 1; q[t++] = m;
    }
  }
  return acc;
}

// 道のつながりごとに番号を振る（道でないマスは -1）
export function roadComponents(s) {
  const N = s.N, n = N * N, comp = new Int32Array(n).fill(-1), q = new Int32Array(n);
  let count = 0;
  for (let k0 = 0; k0 < n; k0++) {
    if (!s.road[k0] || comp[k0] !== -1) continue;
    let h = 0, t = 0;
    q[t++] = k0; comp[k0] = count;
    while (h < t) {
      const k = q[h++], i = k % N, j = (k - i) / N;
      for (const [di, dj] of D4) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const m = b * N + a;
        if (s.road[m] && comp[m] === -1) { comp[m] = count; q[t++] = m; }
      }
    }
    count++;
  }
  return { comp, count };
}

const conducts = (s, k) => s.pw[k] || s.zone[k] || s.svc[k] || (s.bld[k] && s.bld[k] !== BLD.RUBBLE);

// 電気: plants = [{ tiles: [マス], cap }]。発電所から近い順に配り、足りなくなったら残りは停電。
// priority（1 のマス）は公共の施設で、ほかより先に配る
export function flowPower(s, plants, usage, priority = null) {
  const N = s.N, n = N * N, on = new Uint8Array(n), seen = new Int32Array(n).fill(-1), q = new Int32Array(n);
  let demand = 0, supply = 0, served = 0;
  for (let k = 0; k < n; k++) demand += usage[k];
  // 発電所どうしがつながっているかを調べ、つながりごとにまとめて配る
  let group = 0;
  for (const p of plants) {
    if (p.tiles.some((k) => seen[k] !== -1)) continue;
    let h = 0, t = 0, cap = 0;
    for (const k of p.tiles) { seen[k] = group; q[t++] = k; }
    // 広がりを調べる（つながったほかの発電所も同じ群に入る）
    while (h < t) {
      const k = q[h++], i = k % N, j = (k - i) / N;
      for (const [di, dj] of D12) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const m = b * N + a;
        if (seen[m] !== -1 || !conducts(s, m)) continue;
        seen[m] = group; q[t++] = m;
      }
    }
    for (const pl of plants) if (pl.tiles.some((k) => seen[k] === group)) cap += pl.cap;
    supply += cap;
    // 幅優先で見つけた順（発電所に近い順）に配る。公共の施設を先に
    let left = cap;
    for (let pass = priority ? 0 : 1; pass < 2; pass++) {
      for (let x = 0; x < t; x++) {
        const k = q[x], u = usage[k];
        if (on[k] || (pass === 0 && !priority[k])) continue;
        if (u <= left + 1e-9) { on[k] = 1; left -= u; served += u; }
      }
    }
    group++;
  }
  return { on, supply, demand, served };
}

// 水道と下水: 管は道の下を通る。sources = [{ road: 道のマス, cap }]。道で近い順に配る
export function flowRoadUtility(s, access, sources, usage) {
  const N = s.N, n = N * N, on = new Uint8Array(n);
  const rd = new Int32Array(n).fill(-1), q = new Int32Array(n);
  let h = 0, t = 0, demand = 0, supply = 0;
  for (let k = 0; k < n; k++) demand += usage[k];
  const caps = [];
  // 道のつながりごとに供給量を足す
  const { comp } = roadComponents(s);
  for (const src of sources) {
    if (src.road < 0 || comp[src.road] < 0) continue;
    caps[comp[src.road]] = (caps[comp[src.road]] || 0) + src.cap;
    supply += src.cap;
    if (rd[src.road] === -1) { rd[src.road] = 0; q[t++] = src.road; }
  }
  while (h < t) {
    const k = q[h++], i = k % N, j = (k - i) / N;
    for (const [di, dj] of D4) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const m = b * N + a;
      if (!s.road[m] || rd[m] !== -1) continue;
      rd[m] = rd[k] + 1; q[t++] = m;
    }
  }
  // 使う所を、つながっている道の近い順に並べて配る
  const users = [];
  for (let k = 0; k < n; k++) if (usage[k] > 0 && access[k] >= 0 && rd[access[k]] >= 0) users.push(k);
  users.sort((x, y) => rd[access[x]] - rd[access[y]]);
  const left = caps.slice();
  for (const k of users) {
    const c = comp[access[k]];
    if (usage[k] <= (left[c] || 0) + 1e-9) { on[k] = 1; left[c] -= usage[k]; }
  }
  return { on, supply, demand };
}

// 施設の届く範囲: sources = [{ road, radius, strength }]。道の上の道のりで弱まる。返す値は 0〜（strength の最大）
export function coverage(s, sources, access) {
  const N = s.N, n = N * N, road = new Float32Array(n), out = new Float32Array(n);
  const d = new Int32Array(n), q = new Int32Array(n);
  for (const src of sources) {
    if (src.road < 0) continue;
    d.fill(-1);
    let h = 0, t = 0;
    d[src.road] = 0; q[t++] = src.road;
    const st = src.strength ?? 1, R = src.radius;
    while (h < t) {
      const k = q[h++], v = st * (1 - d[k] / R);
      if (v > road[k]) road[k] = v;
      if (d[k] + 1 >= R) continue;
      const i = k % N, j = (k - i) / N;
      for (const [di, dj] of D4) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const m = b * N + a;
        if (!s.road[m] || d[m] !== -1) continue;
        d[m] = d[k] + 1; q[t++] = m;
      }
    }
  }
  for (let k = 0; k < n; k++) if (access[k] >= 0) out[k] = road[access[k]];
  return out;
}

// 経路（A*）。道のマスの番号の並びを返す。opt.cong は混み具合（0〜）、opt.extra(k) は足す費用
let buf = null;
function buffers(n) {
  if (!buf || buf.n !== n) buf = { n, g: new Float64Array(n), from: new Int32Array(n), stamp: new Int32Array(n), shut: new Int32Array(n), gen: 0, hk: new Int32Array(n * 4), hf: new Float64Array(n * 4) };
  return buf;
}
export function stepCost(s, m, opt) {
  const R = ROADS[s.road[m]];
  let c = 1 / R.speed;
  if (opt && opt.cong) c *= 1 + 3 * Math.min(2, opt.cong[m]);
  if (opt && opt.extra) c += opt.extra(m);
  return c;
}
export function findPath(s, from, to, opt) {
  if (from < 0 || to < 0 || !s.road[from] || !s.road[to]) return null;
  if (from === to) return Int32Array.of(from);
  const N = s.N, B = buffers(N * N), gen = ++B.gen;
  const ti = to % N, tj = (to - ti) / N, H = 1 / ROADS[3].speed;
  const hOf = (k) => { const i = k % N, j = (k - i) / N; return (Math.abs(i - ti) + Math.abs(j - tj)) * H; };
  let size = 0;
  const push = (k, f) => {
    let x = size++;
    while (x > 0) { const p = (x - 1) >> 1; if (B.hf[p] <= f) break; B.hk[x] = B.hk[p]; B.hf[x] = B.hf[p]; x = p; }
    B.hk[x] = k; B.hf[x] = f;
  };
  const pop = () => {
    const top = B.hk[0], lk = B.hk[--size], lf = B.hf[size];
    let x = 0;
    for (;;) {
      let c = 2 * x + 1;
      if (c >= size) break;
      if (c + 1 < size && B.hf[c + 1] < B.hf[c]) c++;
      if (B.hf[c] >= lf) break;
      B.hk[x] = B.hk[c]; B.hf[x] = B.hf[c]; x = c;
    }
    B.hk[x] = lk; B.hf[x] = lf;
    return top;
  };
  B.stamp[from] = gen; B.g[from] = 0; B.from[from] = -1;
  push(from, hOf(from));
  while (size > 0) {
    if (size >= B.hk.length - 4) break;
    const k = pop();
    if (B.shut[k] === gen) continue;
    B.shut[k] = gen;
    if (k === to) {
      const path = [];
      for (let x = to; x !== -1; x = B.from[x]) path.push(x);
      return Int32Array.from(path.reverse());
    }
    const i = k % N, j = (k - i) / N;
    for (const [di, dj] of D4) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const m = b * N + a;
      if (!s.road[m] || B.shut[m] === gen) continue;
      const g = B.g[k] + stepCost(s, m, opt);
      if (B.stamp[m] === gen && g >= B.g[m]) continue;
      B.stamp[m] = gen; B.g[m] = g; B.from[m] = k;
      push(m, g + hOf(m));
    }
  }
  return null;
}

// 地図の上での i,j の差（道のりの見積もり）
export const manhattan = (N, a, b) => Math.abs((a % N) - (b % N)) + Math.abs(Math.floor(a / N) - Math.floor(b / N));
export { idx };
