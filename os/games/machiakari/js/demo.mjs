// 題名の画面の見本の街: 道の格子に区画を塗り、中心ほど高い建物を建てた状態から始める
import { createCity, idx, BLD } from './core/city.mjs';
import { apply } from './core/edit.mjs';
import { capacity } from './core/growth.mjs';
import { makeRng } from './core/rng.mjs';

export function demoCity(seed = 3) {
  const N = 44, s = createCity({ size: N, seed, terrain: 'river', name: '見本', funds: 1e9 });
  s.unlockAll = true;
  const rng = makeRng(seed);
  const road = (a, b, t) => apply(s, { kind: 'road', road: t }, a, b);
  // 川の東側は使わず、西側に格子の街を作る
  const W = 24;
  for (let x = 2; x <= W; x += 6) road([x, 4], [x, N - 5], x === 14 ? 2 : 1);
  for (let y = 4; y <= N - 5; y += 6) road([2, y], [W, y], y === s.entry.j - (s.entry.j % 6) + 4 ? 2 : 1);
  road([0, s.entry.j], [W, s.entry.j], 2);
  const cx = 13, cy = s.entry.j;
  for (let j = 3; j < N - 3; j++) for (let i = 1; i < W + 2; i++) {
    const k = idx(N, i, j);
    if (s.road[k] || s.terrain[k] === 1) continue;
    const d = Math.hypot(i - cx, j - cy);
    let z = d < 6 ? (rng.next() < 0.5 ? 4 : 6) : d < 11 ? (rng.next() < 0.6 ? 2 : 3) : d < 17 ? 1 : (rng.next() < 0.5 ? 5 : 1);
    if (rng.next() < 0.06) continue;
    s.zone[k] = z; s.trees[k] = 0;
    s.bld[k] = BLD.BUILT;
    s.lvl[k] = d < 6 ? 3 : d < 11 ? 1 + rng.int(1, 2) : rng.int(1, 3);
    s.occ[k] = capacity(z, s.lvl[k]);
    s.vari[k] = rng.int(0, 255);
  }
  const svc = (key, i, j) => apply(s, { kind: 'svc', key }, [i, j], [i, j]);
  svc('park', 9, 9); svc('plaza', 15, s.entry.j + 1); svc('fire', 7, 21); svc('police', 19, 15); svc('school', 21, 27); svc('clinic', 5, 27);
  svc('coal', 18, 36); svc('tower', 3, 9); svc('sewer2', 21, 6); svc('wind', 25, 12); svc('wind', 25, 14);
  s.time.tod = 16 * 60;
  s.rev++;
  return s;
}
