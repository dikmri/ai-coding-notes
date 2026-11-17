// 交通: 車の1台1台を道の上で動かす。日本の道なので左側通行。
// ・前の車との間を空けて走る（間が詰まると速さを落とし、止まる）
// ・信号のある交差点では、赤なら停止線の手前で止まる。信号のない交差点は、中が空くまで待つ
// ・道のマスごとの混み具合（density）をため、経路を探すときに混んだ道を避ける
// ・どこへ向かう車か（通勤・買い物・配送・観光）は、街の人口と働き口から決める（spawnTrips）
import { ROADS } from './defs.mjs';
import { findPath, manhattan } from './net.mjs';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // 0 東 1 南 2 西 3 北（i を東、j を南とみる）
export const KINDS = {
  car: { len: 0.3, speed: 1 },
  taxi: { len: 0.3, speed: 1.05 },
  truck: { len: 0.44, speed: 0.85 },
  bus: { len: 0.5, speed: 0.8 },
  fire: { len: 0.42, speed: 1.25 },
  police: { len: 0.3, speed: 1.15 },
  ambulance: { len: 0.36, speed: 1.2 },
};
export const BASE_SPEED = 2; // 小道でのマス/秒（速さ1の時）
const GAP0 = 0.07, HEADWAY = 0.45, ACCEL = 2.6, SIGNAL_PERIOD = 9;

// 時刻ごとの移動の割合（1日の合計が 1）。commute は朝と夕方の山、shop は昼から夜、freight は昼間
const SHAPES = {
  commute: [0.2, 0.1, 0.1, 0.1, 0.3, 1.0, 3.2, 7.5, 9.0, 4.2, 1.6, 1.4, 1.8, 1.6, 1.5, 2.0, 3.6, 7.2, 8.4, 4.5, 2.4, 1.4, 0.8, 0.4],
  shop: [0.3, 0.1, 0.1, 0.1, 0.1, 0.2, 0.5, 1.0, 1.6, 2.6, 3.6, 4.6, 5.2, 4.8, 4.6, 4.8, 5.2, 5.8, 6.2, 5.6, 4.4, 3.0, 1.6, 0.8],
  freight: [0.6, 0.4, 0.4, 0.5, 0.9, 1.8, 3.0, 4.0, 4.6, 4.8, 4.8, 4.6, 4.2, 4.6, 4.6, 4.4, 4.0, 3.2, 2.2, 1.6, 1.2, 1.0, 0.8, 0.7],
};
const NORM = Object.fromEntries(Object.entries(SHAPES).map(([k, a]) => [k, a.reduce((x, y) => x + y, 0)]));
export function tripShare(hour, kind = 'commute') {
  const a = SHAPES[kind], h = ((hour % 24) + 24) % 24, i = Math.floor(h), f = h - i;
  return (a[i] * (1 - f) + a[(i + 1) % 24] * f) / NORM[kind];
}

export function makeTraffic(s) {
  const n = s.N * s.N;
  return { N: s.N, vehicles: [], density: new Float32Array(n), occ: new Uint16Array(n), deg: new Uint8Array(n), signal: new Uint8Array(n), rev: -1, time: 0, arrived: 0, failed: 0, stuck: 0, flow: 1, nextId: 1, forceSignal: null, tripTimes: 0, tripCount: 0, avgTrip: 15, acc: {} };
}

// 交差点（3方向以上につながる道のマス）と信号の場所を、地図が変わったときだけ数えなおす
function refreshJunctions(tr, s) {
  if (tr.rev === s.rev) return;
  tr.rev = s.rev;
  const N = s.N;
  for (let k = 0; k < N * N; k++) {
    tr.deg[k] = 0; tr.signal[k] = 0;
    if (!s.road[k]) continue;
    const i = k % N, j = (k - i) / N;
    let d = 0, big = s.road[k] >= 2;
    for (const [di, dj] of DIRS) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const m = b * N + a;
      if (s.road[m]) { d++; if (s.road[m] >= 2) big = true; }
    }
    tr.deg[k] = d;
    if (d === 4 || (d === 3 && big)) tr.signal[k] = 1;
  }
}

const dirOf = (N, a, b) => { const d = b - a; return d === 1 ? 0 : d === N ? 1 : d === -1 ? 2 : 3; };

// 信号: 周期の前半は東西（軸0）、後半は南北（軸1）が青。間に全部が赤の短い時間を入れる
export function signalGreen(tr, k, axis) {
  if (tr.forceSignal) return tr.forceSignal(k, axis);
  const off = ((k * 2654435761) >>> 0) % 1000 / 1000 * SIGNAL_PERIOD;
  const t = (tr.time + off) % SIGNAL_PERIOD, half = SIGNAL_PERIOD / 2;
  if (axis === 0) return t < half - 0.6;
  return t >= half && t < SIGNAL_PERIOD - 0.6;
}
// 描画用: 交差点の信号の色（軸ごと） 'g' 'y' 'r'
export function signalColor(tr, k, axis) {
  if (signalGreen(tr, k, axis)) return 'g';
  const off = ((k * 2654435761) >>> 0) % 1000 / 1000 * SIGNAL_PERIOD;
  const t = (tr.time + off) % SIGNAL_PERIOD, half = SIGNAL_PERIOD / 2;
  if (axis === 0 && t >= half - 0.6 && t < half) return 'y';
  if (axis === 1 && t >= SIGNAL_PERIOD - 0.6) return 'y';
  return 'r';
}

export function addVehicle(tr, path, kind = 'car', extra = {}) {
  const v = { id: tr.nextId++, path, s: 0, v: 0, kind, len: KINDS[kind].len, lane: 0, wait: 0, age: 0, people: 1, hue: (tr.nextId * 47) % 360, ...extra };
  tr.vehicles.push(v);
  return v;
}

const laneCount = (s, k) => (s.road[k] ? ROADS[s.road[k]].lanes : 1);
// 車線の位置（道の中心から左へのずれ。マスの幅を 1 とする）。外側の車線が 0
export function laneOffset(road, lane) {
  if (road === 1) return 0.2;
  return lane === 0 ? 0.33 : 0.15;
}

export function stepTraffic(tr, s, dt) {
  refreshJunctions(tr, s);
  tr.time += dt;
  const N = s.N, V = tr.vehicles;
  // 道の区間（出るマス・向き・車線）ごとに車をまとめる
  const buckets = new Map();
  tr.occ.fill(0);
  for (let x = V.length - 1; x >= 0; x--) {
    const v = V[x], m = Math.floor(v.s), a = v.path[m], b = v.path[m + 1];
    if (b === undefined || !s.road[a] || !s.road[b]) { if (b === undefined) continue; V.splice(x, 1); continue; } // 道が消えた
    const lane = Math.min(v.lane, laneCount(s, a) - 1);
    v.key = ((a * 4 + dirOf(N, a, b)) << 1) | lane;
    let list = buckets.get(v.key);
    if (!list) buckets.set(v.key, (list = []));
    list.push(v);
    tr.occ[v.path[Math.min(v.path.length - 1, Math.round(v.s))]]++;
  }
  for (const list of buckets.values()) list.sort((p, q) => q.s % 1 - p.s % 1);
  let flowSum = 0, flowN = 0;
  for (const list of buckets.values()) {
    for (let x = 0; x < list.length; x++) {
      const v = list[x], m = Math.floor(v.s), f = v.s - m, a = v.path[m], b = v.path[m + 1];
      const R = ROADS[s.road[a]], vmax = BASE_SPEED * Math.min(R.speed, ROADS[s.road[b]].speed * 1.2) * KINDS[v.kind].speed;
      // 前の車までの間（自分の前のバンパーから前の車の後ろのバンパーまで）
      let gap = Infinity;
      if (x > 0) { const L = list[x - 1]; gap = (Math.floor(v.s) + (L.s % 1) - L.len / 2) - (v.s + v.len / 2); }
      else if (m + 2 < v.path.length) {
        const c = v.path[m + 2], lane = Math.min(v.lane, laneCount(s, b) - 1);
        const next = buckets.get(((b * 4 + dirOf(N, b, c)) << 1) | lane);
        if (next && next.length) { const L = next[next.length - 1]; gap = (m + 1 + (L.s % 1) - L.len / 2) - (v.s + v.len / 2); }
      }
      // 交差点の手前（区間の半分の所が停止線）
      if (f < 0.5 && tr.deg[b] >= 3 && m + 1 < v.path.length - 1) {
        const axis = dirOf(N, a, b) & 1;
        let stop = false;
        if (tr.signal[b] || tr.forceSignal) stop = !signalGreen(tr, b, axis);
        else stop = tr.occ[b] >= 2;
        if (v.kind === 'fire' || v.kind === 'ambulance' || v.kind === 'police' && v.siren) stop = stop && tr.occ[b] >= 2;
        if (v.wait > 12) stop = false; // 長く待ったら進む（行き詰まりを防ぐ）
        if (stop) { const g2 = m + 0.5 - 0.04 - (v.s + v.len / 2); if (g2 < gap) { gap = g2; v.sig = g2 < 0.6; } else v.sig = false; } else v.sig = false;
      } else v.sig = false;
      // 信号待ちの列に並んでいる車も、信号待ちとみなす
      if (!v.sig && x > 0 && list[x - 1].sig && gap < 0.6) v.sig = true;
      const safe = Math.max(0, (gap - GAP0) / HEADWAY);
      const target = Math.min(vmax, safe);
      v.v = target < v.v ? target : Math.min(target, v.v + ACCEL * dt);
      let ds = v.v * dt;
      if (gap !== Infinity) ds = Math.min(ds, Math.max(0, gap - GAP0 * 0.5));
      v.s += ds;
      v.age += dt;
      v.wait = v.v < 0.05 ? v.wait + dt : 0;
      // 交通の流れ: 赤信号の前で待っている車は数えない（信号待ちは渋滞ではない）
      if (!v.sig) { flowSum += vmax > 0 ? v.v / vmax : 1; flowN++; }
    }
  }
  // 着いた車、行き詰まった車を外す
  for (let x = V.length - 1; x >= 0; x--) {
    const v = V[x];
    if (v.s >= v.path.length - 1) { V.splice(x, 1); tr.arrived++; tr.tripTimes += v.age; tr.tripCount++; tr.avgTrip += (v.age - tr.avgTrip) * 0.03; if (v.onArrive) v.onArrive(v); continue; }
    // 止まったまま、または空いた道の3倍以上の時間がかかっている車は、あきらめて消える（行き詰まりを残さない）
    if (v.wait > 45 || v.age > 25 + (v.path.length / BASE_SPEED) * 3) { V.splice(x, 1); tr.stuck++; tr.avgTrip += (v.age - tr.avgTrip) * 0.03; }
  }
  // 混み具合: 今いる台数 ÷ 道の受け入れ量（両方向）を、ゆっくり追いかける
  const k = Math.min(1, dt * 0.5);
  for (let t = 0; t < N * N; t++) {
    if (!s.road[t]) { tr.density[t] = 0; continue; }
    const R = ROADS[s.road[t]], target = tr.occ[t] / (R.cap * R.lanes * 2);
    tr.density[t] += (target - tr.density[t]) * k;
  }
  if (flowN) tr.flow += (flowSum / flowN - tr.flow) * Math.min(1, dt * 0.3);
  else tr.flow += (1 - tr.flow) * Math.min(1, dt * 0.3);
}

// 描画用: 車の位置（マスの座標、小数）と向き
export function vehiclePose(s, v) {
  const N = s.N, m = Math.min(Math.floor(v.s), v.path.length - 2), f = v.s - m, a = v.path[m], b = v.path[m + 1];
  const ai = a % N, aj = (a - ai) / N, bi = b % N, bj = (b - bi) / N;
  const d = dirOf(N, a, b), [di, dj] = DIRS[d];
  let i = ai + 0.5 + (bi - ai) * f, j = aj + 0.5 + (bj - aj) * f;
  // 左側の車線へずらす。曲がる所では次の区間の向きへなめらかに移す
  const lane = Math.min(v.lane, laneCount(s, a) - 1), off = laneOffset(s.road[f < 0.5 ? a : b], lane);
  let lx = dj, ly = -di;
  let hx = di, hy = dj;
  if (f > 0.5 && m + 2 < v.path.length) {
    const c = v.path[m + 2], d2 = dirOf(N, b, c);
    if (d2 !== d) {
      const w = (f - 0.5) * 2, [ei, ej] = DIRS[d2];
      lx = lx * (1 - w) + ej * w; ly = ly * (1 - w) - ei * w;
      hx = hx * (1 - w) + ei * w; hy = hy * (1 - w) + ej * w;
    }
  }
  i += lx * off; j += ly * off;
  return { i, j, hx, hy, dir: d };
}

// ---- どこからどこへ動くか（街の人口と働き口から） ----
// model = { homes, jobs, shops, inds, edges, transit, tourists, employed, residents, walkMax, k }
// homes などは { tiles: Int32Array（建物のマス）, road: Int32Array（その道のマス）, cum: Float64Array（重みの累積） }
export function pickWeighted(list, r) {
  if (!list || !list.tiles.length) return -1;
  const total = list.cum[list.cum.length - 1], x = r * total;
  let lo = 0, hi = list.cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list.cum[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}
// 近くの行き先を選びやすくする（遠いほど選ばれにくい。候補を何個か引いて、近いものを確率で選ぶ）
function pickNear(list, fromRoad, N, rng, tries = 4) {
  let best = -1, bestScore = -1;
  for (let t = 0; t < tries; t++) {
    const x = pickWeighted(list, rng.next());
    if (x < 0) return -1;
    const d = manhattan(N, fromRoad, list.road[x]);
    const sc = rng.next() / (1 + d / 10);
    if (sc > bestScore) { bestScore = sc; best = x; }
  }
  return best;
}

// 1日の移動の量（人の数）。people/台 の k を決めるのに使う
export function dailyTrips(m) {
  return { commute: m.employed * 2 + m.inCommuters * 2, shop: m.residents * 0.35 + m.tourists, freight: m.industry * 0.25 };
}

// dtHours の間に始まる移動を作る。車で動くものは経路を探して車を出し、歩きと地下鉄は数だけ数える。
// 戻り値: { cars, walks, metro, failed: [建物のマス] }
export function spawnTrips(tr, s, m, hour, dtHours, rng, opt = {}) {
  const out = { cars: 0, walks: 0, metro: 0, failed: [], walkFrom: [] };
  if (!m || !m.homes.tiles.length) return out;
  const N = s.N, trips = dailyTrips(m), maxPaths = opt.maxPaths ?? 10;
  let paths = 0;
  const night = hour < 5 || hour >= 22;
  const kinds = [
    ['commute', trips.commute, tripShare(hour, 'commute')],
    ['shop', trips.shop * (m.nightlife && night ? 1.6 : 1), tripShare(hour, 'shop')],
    ['freight', trips.freight, tripShare(hour, 'freight')],
  ];
  for (const [kind, perDay, share] of kinds) {
    tr.acc[kind] = (tr.acc[kind] || 0) + (perDay * share * dtHours * (m.spawnScale ?? 1)) / m.k;
    while (tr.acc[kind] >= 1) {
      tr.acc[kind] -= 1;
      if (tr.vehicles.length >= m.cap || paths >= maxPaths) { tr.acc[kind] = Math.min(tr.acc[kind], 3); break; }
      let from = -1, to = -1, fromB = -1, toB = -1, vk = 'car';
      if (kind === 'commute') {
        // 朝は家から職場へ、昼から夜は職場から家へ。人手が足りない分は街の外から通ってくる
        const outsider = m.edges.length && rng.next() < m.inCommuters / Math.max(1, m.employed + m.inCommuters);
        const h = pickWeighted(m.homes, rng.next()), j = outsider ? pickWeighted(m.jobs, rng.next()) : pickNear(m.jobs, m.homes.road[h], N, rng);
        if (j < 0) continue;
        const home = outsider ? rng.pick(m.edges) : m.homes.road[h], work = m.jobs.road[j];
        if (hour < 13) { from = home; to = work; fromB = outsider ? -1 : m.homes.tiles[h]; toB = m.jobs.tiles[j]; }
        else { from = work; to = home; fromB = m.jobs.tiles[j]; toB = outsider ? -1 : m.homes.tiles[h]; }
        if (rng.next() < (night ? 0.25 : 0.05)) vk = 'taxi';
      } else if (kind === 'shop') {
        const tourist = m.edges.length && rng.next() < m.tourists / Math.max(1, trips.shop);
        const h = pickWeighted(m.homes, rng.next()), c = pickNear(m.shops.tiles.length ? m.shops : m.jobs, tourist ? m.edges[0] : m.homes.road[h], N, rng);
        if (c < 0) continue;
        const list = m.shops.tiles.length ? m.shops : m.jobs;
        const go = hour < 15 || rng.next() < 0.5;
        const home = tourist ? rng.pick(m.edges) : m.homes.road[h];
        from = go ? home : list.road[c]; to = go ? list.road[c] : home;
        fromB = go ? (tourist ? -1 : m.homes.tiles[h]) : list.tiles[c]; toB = go ? list.tiles[c] : (tourist ? -1 : m.homes.tiles[h]);
        if (night && rng.next() < 0.2) vk = 'taxi';
      } else {
        // 配送: 工場から店へ、または街の外へ（輸出）。店がなければ外から運び込む
        const i = pickWeighted(m.inds, rng.next());
        if (i < 0) continue;
        vk = 'truck';
        if (m.shops.tiles.length && rng.next() < 0.55) { const c = pickNear(m.shops, m.inds.road[i], N, rng); from = m.inds.road[i]; to = m.shops.road[c]; fromB = m.inds.tiles[i]; toB = m.shops.tiles[c]; }
        else if (m.edges.length) { from = m.inds.road[i]; to = rng.pick(m.edges); fromB = m.inds.tiles[i]; }
        else continue;
      }
      if (from < 0 || to < 0 || from === to) continue;
      const dist = manhattan(N, from, to);
      // 近い移動は歩き（政策で歩く距離が伸びる）。駅の近くどうしは地下鉄
      if (vk !== 'truck' && dist <= m.walkMax) { out.walks++; if (fromB >= 0) out.walkFrom.push(fromB); continue; }
      if (vk !== 'truck' && m.transit && fromB >= 0 && toB >= 0 && m.transit[fromB] > 0 && m.transit[toB] > 0 && dist > 5) { out.metro++; if (fromB >= 0) out.walkFrom.push(fromB); continue; }
      paths++;
      const path = findPath(s, from, to, { cong: tr.density, extra: vk === 'truck' && m.truckBan ? (t) => (m.truckBan[t] ? 6 : 0) : null });
      if (!path || path.length < 2) { tr.failed++; if (fromB >= 0) out.failed.push(fromB); if (toB >= 0) out.failed.push(toB); continue; }
      const v = addVehicle(tr, path, vk, { people: m.k, purpose: kind });
      v.lane = laneCount(s, path[0]) > 1 && rng.next() < 0.5 ? 1 : 0;
      out.cars++;
    }
  }
  return out;
}
export { DIRS, dirOf };
