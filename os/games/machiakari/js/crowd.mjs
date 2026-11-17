// 歩く人: 見えている範囲だけで動かす（画面の外の人は数だけ街の計算で数えている）。
// 人を出す場所と量は、建物に住む人・働く人の数と時刻、実際の歩きと地下鉄の移動（sim.walkFrom）から決める
import { findPath } from './core/net.mjs';
import { tripShare, DIRS, dirOf } from './core/traffic.mjs';
import { BLD } from './core/city.mjs';
import { CLASS_OF, SVC_BY_ID } from './core/defs.mjs';

const CLOTHES = ['#e85b5b', '#3d6fd0', '#f2b134', '#33a37a', '#f4f4f4', '#2c2c34', '#c05fd6', '#ff8f50', '#6b8f9e', '#d8c39a', '#8c4b6b', '#4b7c4b'];
const SKIN = ['#f1c9a5', '#e0ac85', '#c98e68', '#f5d6b8'];
export const MAX_PEDS = 260;

export function makeCrowd() { return { peds: [], acc: 0, seed: 1 }; }
const rnd = (c) => { c.seed = (c.seed * 16807) % 2147483647; return c.seed / 2147483647; };

// view = { i0, i1, j0, j1 }（見えているマスの範囲）
export function stepCrowd(c, sim, view, dt, hour) {
  const s = sim.s, N = s.N, d = sim.d;
  // 動かす
  for (let x = c.peds.length - 1; x >= 0; x--) {
    const p = c.peds[x];
    p.t += dt;
    if (p.park) {
      // 公園や広場をぶらぶら歩く
      p.wait -= dt;
      if (p.wait <= 0) { p.ti = p.pi + 0.15 + rnd(c) * 0.7; p.tj = p.pj + 0.15 + rnd(c) * 0.7; p.wait = 2 + rnd(c) * 4; }
      const dx = p.ti - p.i, dy = p.tj - p.j, L = Math.hypot(dx, dy);
      if (L > 0.02) { const m = Math.min(L, p.speed * 0.6 * dt); p.i += (dx / L) * m; p.j += (dy / L) * m; p.moving = true; } else p.moving = false;
      if (p.t > p.life) c.peds.splice(x, 1);
      continue;
    }
    p.s += p.speed * dt;
    p.moving = true;
    if (p.s >= p.path.length - 1 || !s.road[p.path[Math.min(p.path.length - 1, Math.floor(p.s))]]) { c.peds.splice(x, 1); continue; }
    const pos = pose(s, p);
    p.i = pos.i; p.j = pos.j;
    if (p.i < view.i0 - 6 || p.i > view.i1 + 6 || p.j < view.j0 - 6 || p.j > view.j1 + 6) c.peds.splice(x, 1);
  }
  // 出す: 見えている建物の人の数と時刻から、見えている範囲に歩く人の目標の数を決める
  if (!sim.model) return;
  const night = hour < 5 || hour >= 23;
  const rate = (tripShare(hour, 'commute') * 0.6 + tripShare(hour, 'shop') * 0.9) * 24; // 平均を 1 とした時刻の倍率
  let occSum = 0;
  const cands = [];
  const i0 = Math.max(0, Math.floor(view.i0)), i1 = Math.min(N - 1, Math.ceil(view.i1)), j0 = Math.max(0, Math.floor(view.j0)), j1 = Math.min(N - 1, Math.ceil(view.j1));
  if ((i1 - i0) * (j1 - j0) > 2600) return; // 遠くから見ているときは出さない
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * N + i;
    if (s.bld[k] === BLD.BUILT && s.occ[k] && d.access[k] >= 0) { occSum += s.occ[k]; cands.push(k); }
    else if (s.svc[k] && s.anchor[k] === k) { const def = SVC_BY_ID[s.svc[k]]; if (def.park || def.key === 'metro') cands.push(k); }
  }
  const target = Math.min(MAX_PEDS, Math.round(occSum * 0.05 * rate * (night ? 0.4 : 1)) + 6);
  c.acc += dt * Math.max(0, target - c.peds.length) * 0.35;
  let budget = 6;
  while (c.acc >= 1 && budget-- > 0 && cands.length) {
    c.acc -= 1;
    // 実際に歩いて出かけた人の家を優先して使う
    let from = -1;
    if (sim.walkFrom.length && rnd(c) < 0.5) { const k = sim.walkFrom[Math.floor(rnd(c) * sim.walkFrom.length)], ki = k % N, kj = (k - ki) / N; if (ki >= i0 && ki <= i1 && kj >= j0 && kj <= j1) from = k; }
    if (from < 0) from = cands[Math.floor(rnd(c) * cands.length)];
    spawnFrom(c, sim, from, cands, hour);
  }
}

function spawnFrom(c, sim, from, cands, hour) {
  const s = sim.s, N = s.N, d = sim.d;
  const look = () => ({ color: CLOTHES[Math.floor(rnd(c) * CLOTHES.length)], skin: SKIN[Math.floor(rnd(c) * SKIN.length)], small: rnd(c) < 0.12, bag: rnd(c) < 0.3 });
  if (s.svc[from]) {
    const def = SVC_BY_ID[s.svc[from]];
    if (def.park) {
      // 公園や広場の中で過ごす人
      const fi = from % N, fj = (from - fi) / N, n = def.size;
      for (let q = 0; q < (def.key === 'plaza' ? 3 : 2); q++) {
        const pi = fi + Math.floor(rnd(c) * n), pj = fj + Math.floor(rnd(c) * n);
        c.peds.push({ park: true, pi, pj, i: pi + rnd(c), j: pj + rnd(c), ti: pi + 0.5, tj: pj + 0.5, wait: 0, t: 0, life: 15 + rnd(c) * 25, speed: 0.3 + rnd(c) * 0.2, ...look() });
      }
      return;
    }
  }
  const a = d.access[from];
  if (a < 0) return;
  // 行き先: 近くの店・公園・駅・家（建物の種類と時刻で選ぶ）
  const cls = CLASS_OF(s.zone[from]);
  let best = -1, bestSc = -1;
  for (let t = 0; t < 6; t++) {
    const k = cands[Math.floor(rnd(c) * cands.length)];
    if (k === from) continue;
    const b = d.access[k] >= 0 ? d.access[k] : -1;
    if (b < 0) continue;
    const kc = CLASS_OF(s.zone[k]), def = s.svc[k] ? SVC_BY_ID[s.svc[k]] : null;
    let w = 1;
    if (cls === 'R' && (kc === 'C' || def)) w = 3;
    if (cls === 'R' && hour >= 7 && hour < 10 && def && def.key === 'metro') w = 5;
    if (cls !== 'R' && kc === 'R' && hour >= 17) w = 3;
    const dist = Math.abs((k % N) - (from % N)) + Math.abs(Math.floor(k / N) - Math.floor(from / N));
    const sc = (w * rnd(c)) / (1 + dist / 4);
    if (dist <= 9 && sc > bestSc) { bestSc = sc; best = b; }
  }
  if (best < 0 || best === a) return;
  const path = findPath(s, a, best);
  if (!path || path.length < 2 || path.length > 18) return;
  c.peds.push({ path, s: 0, side: rnd(c) < 0.5 ? 1 : -1, speed: 0.32 + rnd(c) * 0.22, t: rnd(c) * 3, i: 0, j: 0, ...look() });
}

// 歩道の上の位置（道の中心から 0.43 だけ横へ。交差点では横断歩道を渡る）
function pose(s, p) {
  const N = s.N, m = Math.min(Math.floor(p.s), p.path.length - 2), f = p.s - m, a = p.path[m], b = p.path[m + 1];
  const ai = a % N, aj = (a - ai) / N, bi = b % N, bj = (b - bi) / N;
  const [di, dj] = DIRS[dirOf(N, a, b)];
  let lx = dj * p.side, ly = -di * p.side;
  if (f > 0.5 && m + 2 < p.path.length) {
    const c2 = p.path[m + 2], [ei, ej] = DIRS[dirOf(N, b, c2)], w = (f - 0.5) * 2;
    lx = lx * (1 - w) + ej * p.side * w; ly = ly * (1 - w) - ei * p.side * w;
  }
  return { i: ai + 0.5 + (bi - ai) * f + lx * 0.43, j: aj + 0.5 + (bj - aj) * f + ly * 0.43 };
}
