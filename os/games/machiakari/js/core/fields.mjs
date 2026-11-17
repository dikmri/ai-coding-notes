// 街に広がる値: 公害・騒音・地価・犯罪。発生源を置いてから、ぼかして周りへ広げる
import { BLD } from './city.mjs';
import { ZONES, ROADS, SVC_BY_ID, CLASS_OF } from './defs.mjs';
import { hasPolicy } from './policy.mjs';

// 箱型のぼかし（縦と横に分けて passes 回）。端は内側の値だけで平均する
export function blur(src, N, r = 1, passes = 2) {
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let sum = 0, n = 0;
      for (let d = -r; d <= r; d++) { const x = i + d; if (x >= 0 && x < N) { sum += a[j * N + x]; n++; } }
      b[j * N + i] = sum / n;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let sum = 0, n = 0;
      for (let d = -r; d <= r; d++) { const y = j + d; if (y >= 0 && y < N) { sum += b[y * N + i]; n++; } }
      a[j * N + i] = sum / n;
    }
  }
  return a;
}

const clamp100 = (v) => (v < 0 ? 0 : v > 100 ? 100 : v);

// d = { cov: { fire, police, health, edu, transit }, traffic: 道の混み具合, access, unemployment }
export function computeFields(s, d = {}) {
  const N = s.N, n = N * N, cov = d.cov || {}, traffic = d.traffic || new Float32Array(n);
  const polSrc = new Float32Array(n), noiseSrc = new Float32Array(n), waterSrc = new Float32Array(n), crimeSrc = new Float32Array(n), park = new Float32Array(n);
  const parks = [];
  for (let k = 0; k < n; k++) {
    if (s.terrain[k] === 1) waterSrc[k] = 100;
    if (s.road[k]) {
      const R = ROADS[s.road[k]], t = traffic[k];
      noiseSrc[k] += R.noise * (0.4 + Math.min(2, t)) * (hasPolicy(s, k, 'heavyBan') ? 0.7 : 1);
      polSrc[k] += Math.min(2, t) * 8;
    }
    if (s.svc[k]) {
      const def = SVC_BY_ID[s.svc[k]];
      if (def.pollution) polSrc[k] += def.pollution;
      if (def.noise) noiseSrc[k] += def.noise;
      if (def.park && s.anchor[k] === k) parks.push([k, def]);
    }
    if (s.bld[k] === BLD.BUILT || s.bld[k] === BLD.ABANDONED) {
      const z = ZONES[s.zone[k]];
      if (!z) continue;
      if (z.cls === 'I') { polSrc[k] += z.pollution[(s.lvl[k] || 1) - 1] * (hasPolicy(s, k, 'greenIndustry') ? 0.5 : 1); noiseSrc[k] += 14; }
      if (z.cls === 'C') noiseSrc[k] += s.zone[k] === 4 ? 8 : 3;
      if (hasPolicy(s, k, 'nightlife') && z.cls === 'C') noiseSrc[k] += 6;
      // 犯罪の起こりやすさ: 人が多いほど、空き家ほど
      crimeSrc[k] = s.occ[k] * 0.9 + (s.bld[k] === BLD.ABANDONED ? 30 : 0);
    }
  }
  // 公園の効果（円の中で弱まる）
  for (const [k, def] of parks) {
    const ci = k % N + (def.size - 1) / 2, cj = Math.floor(k / N) + (def.size - 1) / 2, R = def.parkR;
    for (let j = Math.max(0, Math.floor(cj - R)); j <= Math.min(N - 1, Math.ceil(cj + R)); j++) for (let i = Math.max(0, Math.floor(ci - R)); i <= Math.min(N - 1, Math.ceil(ci + R)); i++) {
      const dd = Math.hypot(i - ci, j - cj);
      if (dd <= R) park[j * N + i] += def.park * (1 - dd / (R + 1));
    }
  }
  const pol = blur(polSrc, N, 2, 3), noise = blur(noiseSrc, N, 1, 2), water = blur(waterSrc, N, 2, 2);
  const crimeB = blur(crimeSrc, N, 1, 2);
  const lv = new Float32Array(n), crime = new Float32Array(n);
  const un = d.unemployment || 0;
  for (let k = 0; k < n; k++) {
    // 森は空気をきれいにする
    pol[k] = clamp100(pol[k] * 2.2 * (1 - 0.15 * s.trees[k]) - park[k] * 0.15);
    noise[k] = clamp100(noise[k] * 1.6);
    const police = Math.min(1, cov.police ? cov.police[k] : 0);
    crime[k] = clamp100(crimeB[k] * (1 - 0.75 * police) * (hasPolicy(s, k, 'patrol') ? 0.7 : 1) * (0.7 + un * 2.5));
    let v = 24 + Math.min(16, water[k] * 0.5) + park[k];
    v += 4 * ((cov.fire ? Math.min(1, cov.fire[k]) : 0) + police + (cov.health ? Math.min(1.4, cov.health[k]) : 0) + (cov.edu ? Math.min(1.5, cov.edu[k]) : 0));
    if (cov.transit && cov.transit[k] > 0) v += 6;
    if (d.access && d.access[k] >= 0) v += 5;
    if (hasPolicy(s, k, 'heightLimit')) v += 6;
    v -= pol[k] * 0.5 + noise[k] * 0.25 + crime[k] * 0.2;
    lv[k] = clamp100(v);
  }
  return { pol, noise, lv, crime, park };
}

export { CLASS_OF };
