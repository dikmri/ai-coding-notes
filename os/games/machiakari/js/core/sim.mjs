// 街の時間を進める: 電気と水と届く範囲を計算しなおし、需要に応じて建物を建て、月末に予算を締める。
// 1か月を TICKS_PER_MONTH 回の見回り（tick）に分ける。advance は実時間を受け取り、時刻と車も進める
import { makeRng } from './rng.mjs';
import { BLD, edgeRoads } from './city.mjs';
import { ZONES, SVC_BY_ID, USE, CLASS_OF, DAY_SECONDS, MONTH_SECONDS } from './defs.mjs';
import { computeAccess, flowPower, flowRoadUtility, coverage, findPath, manhattan } from './net.mjs';
import { computeDemand } from './demand.mjs';
import { computeFields } from './fields.mjs';
import { growChance, targetLevel, abandonChance, capacity } from './growth.mjs';
import { taxIncome, expenses } from './budget.mjs';
import { MILESTONES, milestoneIndex, GOALS } from './milestones.mjs';
import { makeTraffic, spawnTrips, stepTraffic, addVehicle } from './traffic.mjs';
import { hasPolicy, anyPolicy } from './policy.mjs';
import { svcTiles } from './edit.mjs';

export const TICKS_PER_MONTH = 30;
// 道にいる車の数の目安に使う「1回の移動の時間」（時間）。画面の車は1台で何人か（k）を運び、道を走る速さも見た目に合わせて遅いので、
// 現実の移動時間よりは短めにして、ほどよく作った道の網が朝夕の山に 7〜8 割の流れで回る量にしている
export const REAL_TRIP_H = 0.35;
// 困りごとの印（prob の各ビット）
export const PROB = { POWER: 1, WATER: 2, SEWER: 4, ROAD: 8, REACH: 16, POLLUTION: 32, CRIME: 64, FIRE: 128 };

export function createSim(s, opts = {}) {
  const n = s.N * s.N;
  const sim = {
    s, opts: { maxVehicles: 450, ...opts }, rng: makeRng(s.rng || opts.seed || 1),
    tr: makeTraffic(s), d: {}, tickInMonth: 0,
    unreach: new Uint8Array(n), probTicks: new Uint16Array(n), prob: new Uint8Array(n), happy: new Float32Array(n),
    demand: { R: 30, C: 10, I: 30, O: -20 }, stats: emptyStats(), msgs: [], cool: {}, fx: [], listeners: [],
    walkFrom: [], wind: 0.8, lastBudget: null, profitStreak: 0, model: null,
  };
  recompute(sim);
  buildTripModel(sim);
  return sim;
}
function emptyStats() {
  return { residents: 0, jobs: { C: 0, I: 0, O: 0 }, employed: 0, unemployed: 0, workforce: 0, power: { supply: 0, demand: 0 }, water: { supply: 0, demand: 0 }, sewer: { supply: 0, demand: 0 }, happiness: 60, lv: 0, pol: 0, crime: 0, edu: 0, tourists: 0, walks: 0, metro: 0, cars: 0, buildings: 0, abandoned: 0 };
}
export const monthIndex = (s) => s.time.year * 12 + s.time.month - 1;

function say(sim, key, text, kind = 'info', at = -1, coolMonths = 3) {
  const mi = monthIndex(sim.s);
  if (key && sim.cool[key] !== undefined && mi - sim.cool[key] < coolMonths) return;
  if (key) sim.cool[key] = mi;
  const m = { when: `${sim.s.time.year}年${sim.s.time.month}月`, text, kind, at };
  sim.msgs.push(m);
  if (sim.msgs.length > 80) sim.msgs.shift();
  for (const f of sim.listeners) f(m);
}

// 施設が使う道のマス（施設のマスのどれかが道に面していればよい）
function svcRoad(s, access, k) { for (const t of svcTiles(s, k)) if (access[t] >= 0) return access[t]; return -1; }
const budgetF = (s, key) => Math.max(0.5, Math.min(1.5, (s.budgets[key] ?? 100) / 100));

// 電気・水道・下水・届く範囲・公害と地価を計算しなおす
export function recompute(sim) {
  const s = sim.s, N = s.N, n = N * N, d = sim.d;
  const access = computeAccess(s);
  const pUse = new Float32Array(n), wUse = new Float32Array(n);
  const plants = [], waters = [], sewers = [], cov = { fire: [], police: [], health: [], transit: [], school: [], high: [], univ: [] };
  const hour = s.time.tod / 60, daylight = hour >= 6.5 && hour < 18.5;
  const svcs = [];
  for (let k = 0; k < n; k++) {
    if (s.svc[k]) {
      const def = SVC_BY_ID[s.svc[k]];
      if (s.anchor[k] !== k) continue;
      const tiles = svcTiles(s, k);
      if (def.power) {
        let cap = def.power * (0.4 + 0.6 * budgetF(s, 'power'));
        if (def.key === 'wind') cap *= sim.wind;
        if (def.key === 'solar') cap *= daylight ? 1 : 0.3;
        plants.push({ tiles, cap });
      } else { for (const t of tiles) pUse[t] = USE.power.svc; svcs.push([k, def, tiles]); }
      continue;
    }
    const cls = CLASS_OF(s.zone[k]);
    if (!cls) continue;
    if (s.bld[k] === BLD.BUILT) {
      pUse[k] = s.occ[k] * USE.power[cls] * (hasPolicy(s, k, 'saveEnergy') ? 0.8 : 1);
      wUse[k] = s.occ[k] * USE.water[cls] * (hasPolicy(s, k, 'saveWater') ? 0.8 : 1);
    } else if (s.bld[k] === BLD.BUILDING) { pUse[k] = 0.5; wUse[k] = 0.3; }
  }
  const prio = new Uint8Array(n);
  for (const [, , tiles] of svcs) for (const t of tiles) prio[t] = 1;
  const power = flowPower(s, plants, pUse, prio);
  // 施設は電気が来ていないと働かない（公園は電気がなくてもよい）
  for (const [k, def, tiles] of svcs) {
    if (!def.park && !tiles.some((t) => power.on[t])) continue;
    const road = svcRoad(s, access, k);
    if (def.water) waters.push({ road, cap: def.water * (0.4 + 0.6 * budgetF(s, 'water')) });
    if (def.sewer) sewers.push({ road, cap: def.sewer * (0.4 + 0.6 * budgetF(s, 'water')) });
    if (def.cover) {
      const b = budgetF(s, def.budget), src = { road, radius: Math.round(def.radius * (0.6 + 0.4 * b)), strength: (def.strength ?? 1) * (0.6 + 0.4 * b) };
      if (def.cover === 'edu') cov[def.key].push(src); else cov[def.cover].push(src);
    }
  }
  const water = flowRoadUtility(s, access, waters, wUse);
  const sewer = flowRoadUtility(s, access, sewers, wUse);
  const C = {};
  for (const key of Object.keys(cov)) C[key] = coverage(s, cov[key], access);
  const edu = new Float32Array(n);
  for (let k = 0; k < n; k++) edu[k] = Math.min(1, C.school[k] + C.high[k] + C.univ[k]);
  C.edu = edu;
  const fields = computeFields(s, { cov: C, traffic: sim.tr.density, access, unemployment: sim.stats.workforce ? sim.stats.unemployed / sim.stats.workforce : 0 });
  Object.assign(d, { access, power, water, sewer, cov: C, ...fields, pUse, wUse });
  sim.stats.power = { supply: power.supply, demand: power.demand };
  sim.stats.water = { supply: water.supply, demand: water.demand };
  sim.stats.sewer = { supply: sewer.supply, demand: sewer.demand };
}

// 住む人の満足（0〜100）
function happyAt(sim, k) {
  const s = sim.s, d = sim.d, c = d.cov;
  let h = 52 + 9 * Math.min(1, c.health[k]) + 7 * Math.min(1, c.police[k]) + 6 * Math.min(1, c.edu[k]) + 4 * Math.min(1, c.fire[k]);
  h += d.park[k] * 0.25 + d.lv[k] * 0.12 - d.pol[k] * 0.35 - d.noise[k] * 0.15 - d.crime[k] * 0.25;
  if (!d.power.on[k]) h -= 25;
  if (!d.water.on[k]) h -= 18;
  if (!d.sewer.on[k]) h -= 12;
  if (sim.unreach[k]) h -= 8;
  h -= Math.max(0, s.taxes.R - 9) * 2.2;
  if (hasPolicy(s, k, 'smokeFree')) h += 3;
  if (hasPolicy(s, k, 'bikeLanes')) h += 2;
  if (hasPolicy(s, k, 'saveEnergy')) h -= 2;
  if (hasPolicy(s, k, 'saveWater')) h -= 2;
  return Math.max(0, Math.min(100, h));
}

// 移動の元と先の一覧（重み付き）を作る
export function buildTripModel(sim) {
  const s = sim.s, N = s.N, d = sim.d, st = sim.stats;
  const lists = { homes: [], jobs: [], shops: [], inds: [] };
  for (let k = 0; k < N * N; k++) {
    if (s.bld[k] !== BLD.BUILT || !s.occ[k] || d.access[k] < 0) continue;
    const cls = CLASS_OF(s.zone[k]);
    if (cls === 'R') lists.homes.push(k);
    else { lists.jobs.push(k); if (cls === 'C') lists.shops.push(k); if (cls === 'I') lists.inds.push(k); }
  }
  const pack = (arr) => {
    const tiles = Int32Array.from(arr), road = Int32Array.from(arr, (k) => d.access[k]), cum = new Float64Array(arr.length);
    let t = 0;
    arr.forEach((k, x) => { t += s.occ[k]; cum[x] = t; });
    return { tiles, road, cum };
  };
  const m = { homes: pack(lists.homes), jobs: pack(lists.jobs), shops: pack(lists.shops), inds: pack(lists.inds) };
  m.edges = edgeRoads(s);
  m.employed = st.employed; m.residents = st.residents; m.tourists = st.tourists; m.industry = st.jobs.I;
  m.inCommuters = Math.max(0, Math.min(st.jobs.C + st.jobs.I + st.jobs.O - st.workforce, st.workforce * 0.5 + 40)) * (m.edges.length ? 1 : 0);
  m.transit = d.cov.transit;
  m.nightlife = anyPolicy(s, 'nightlife');
  m.walkMax = anyPolicy(s, 'bikeLanes') ? 7 : 4;
  m.cap = sim.opts.maxVehicles;
  if (anyPolicy(s, 'heavyBan')) { m.truckBan = new Uint8Array(N * N); for (let k = 0; k < N * N; k++) if (s.road[k] && hasPolicy(s, k, 'heavyBan')) m.truckBan[k] = 1; }
  // 画面の車は、見た目に合わせてゆっくり走るので、1回の移動にゲームの中で約2時間かかる。
  // そのまま出すと道にいる台数が現実の何倍にもなるので、現実の移動時間（REAL_TRIP_H）との比で出す数を減らす。
  // さらに一番混む時間に上限の台数に収まるよう、1台が何人ぶんか（k）を決める
  // avgTrip は最近の移動の時間（実時間の秒）を追いかける平均（traffic.mjs）。
  // まだ移動が少ないうちは、家と職場の組を何組か選んで、道のりから見積もる（初めの朝に車を出しすぎないように）
  const tr = sim.tr;
  if (tr.tripCount < 30 && m.homes.tiles.length && m.jobs.tiles.length) {
    let sum = 0;
    for (let x = 0; x < 40; x++) sum += manhattan(N, m.homes.road[sim.rng.int(0, m.homes.tiles.length - 1)], m.jobs.road[sim.rng.int(0, m.jobs.tiles.length - 1)]);
    tr.avgTrip = (sum / 40 / 1.8) * 1.6 + 3;
  }
  const avgH = Math.max(0.2, (tr.avgTrip || 15) / (DAY_SECONDS / 24));
  const daily = m.employed * 2 + m.inCommuters * 2 + m.residents * 0.35 + m.tourists + m.industry * 0.25;
  m.spawnScale = Math.min(1, REAL_TRIP_H / avgH);
  m.k = Math.max(1, Math.ceil((daily * 0.1 * REAL_TRIP_H) / Math.max(1, m.cap * 0.85)));
  sim.model = m;
  return m;
}

// 1回の見回り
export function tick(sim) {
  const s = sim.s, N = s.N, n = N * N, rng = sim.rng;
  recompute(sim);
  const d = sim.d, st = sim.stats;
  // 今の住人と働き口を数える
  let residents = 0, jobsC = 0, jobsI = 0, jobsO = 0, hSum = 0, lvSum = 0, polSum = 0, crimeSum = 0, eduSum = 0, built = 0, abandoned = 0;
  for (let k = 0; k < n; k++) {
    if (s.bld[k] === BLD.ABANDONED) abandoned++;
    if (s.bld[k] !== BLD.BUILT) continue;
    built++;
    const cls = CLASS_OF(s.zone[k]), o = s.occ[k];
    if (cls === 'R') { residents += o; const h = happyAt(sim, k); sim.happy[k] = h; hSum += h * o; lvSum += d.lv[k] * o; polSum += d.pol[k] * o; crimeSum += d.crime[k] * o; eduSum += d.cov.edu[k] * o; }
    else if (cls === 'C') jobsC += o; else if (cls === 'I') jobsI += o; else if (cls === 'O') jobsO += o;
  }
  // 観光客: 公園と名所に集まる。夜の街の政策で増える
  let tourists = 0;
  for (let k = 0; k < n; k++) if (s.svc[k] && s.anchor[k] === k) { const key = SVC_BY_ID[s.svc[k]].key; tourists += key === 'landmark' ? 600 : key === 'bigpark' ? 40 : key === 'plaza' ? 12 : 0; }
  if (anyPolicy(s, 'nightlife')) tourists = tourists * 1.3 + jobsC * 0.05;
  const happiness = residents ? hSum / residents : 60;
  const dem = computeDemand({ residents, jobs: { C: jobsC, I: jobsI, O: jobsO }, edu: residents ? eduSum / residents : 0, taxes: s.taxes, happiness, tourists, bonus: { C: anyPolicy(s, 'nightlife') ? 8 : 0 } });
  // 需要はゆっくり動かす（急に跳ねない）
  for (const c of ['R', 'C', 'I', 'O']) sim.demand[c] += (dem[c] - sim.demand[c]) * 0.35;
  const totalJobs = jobsC + jobsI + jobsO, workforce = dem.workforce;
  const inC = sim.model ? sim.model.inCommuters : 0;
  const fill = totalJobs ? Math.min(1, (workforce + inC) / totalJobs) : 1;
  Object.assign(st, { residents, jobs: { C: jobsC, I: jobsI, O: jobsO }, workforce, employed: Math.min(workforce, totalJobs), unemployed: dem.unemployed, happiness, tourists, fill,
    lv: residents ? lvSum / residents : 0, pol: residents ? polSum / residents : 0, crime: residents ? crimeSum / residents : 0, edu: residents ? eduSum / residents : 0, buildings: built, abandoned });

  // 区画の見回り: 建つ、建ち上がる、人が入る、水準が変わる、空き家になる、燃える
  const fireOn = s.flags.disasters !== false;
  for (let k = 0; k < n; k++) {
    if (sim.unreach[k]) sim.unreach[k]--;
    const z = s.zone[k];
    if (!z) { sim.prob[k] = s.svc[k] && s.anchor[k] === k ? svcProblems(sim, k) : 0; continue; }
    const cls = ZONES[z].cls, b = s.bld[k];
    const acc = d.access[k] >= 0, pw = !!d.power.on[k], wa = !!d.water.on[k], sw = !!d.sewer.on[k];
    let prob = 0;
    if (b === BLD.BUILT || b === BLD.BUILDING) {
      if (!pw) prob |= PROB.POWER;
      if (!wa) prob |= PROB.WATER;
      if (!sw) prob |= PROB.SEWER;
      if (!acc) prob |= PROB.ROAD;
      if (sim.unreach[k]) prob |= PROB.REACH;
      if (cls === 'R' && d.pol[k] > 45) prob |= PROB.POLLUTION;
      if (d.crime[k] > 60) prob |= PROB.CRIME;
    }
    if (s.burn[k]) prob |= PROB.FIRE;
    sim.prob[k] = prob;
    sim.probTicks[k] = prob & (PROB.POWER | PROB.WATER | PROB.SEWER | PROB.ROAD | PROB.REACH) ? Math.min(65000, sim.probTicks[k] + 1) : 0;
    if (s.burn[k]) { burnStep(sim, k); continue; }
    const dm = sim.demand[cls];
    if (b === BLD.NONE) {
      if (rng.next() < growChance({ demand: dm, lv: d.lv[k], access: acc, power: pw, pol: cls === 'R' ? d.pol[k] : 0 }) * 0.12) {
        s.bld[k] = BLD.BUILDING; s.age[k] = 0; s.lvl[k] = 1; s.occ[k] = 0; s.trees[k] = 0; s.vari[k] = rng.int(0, 255); s.rev++;
      }
    } else if (b === BLD.BUILDING) {
      if (++s.age[k] >= 6 + (s.vari[k] & 3)) { s.bld[k] = BLD.BUILT; s.age[k] = 0; s.occ[k] = Math.max(1, Math.round(capacity(z, s.lvl[k]) * 0.4)); s.rev++; sim.fx.push({ k, type: 'built', t: 0 }); }
    } else if (b === BLD.BUILT) {
      s.age[k] = Math.min(65000, s.age[k] + 1);
      const cap = capacity(z, s.lvl[k]);
      // 人や働き手が入る（需要が低いと少しずつ出ていく）
      if (dm > -10 && s.occ[k] < cap && rng.next() < 0.5) s.occ[k] = Math.min(cap, s.occ[k] + Math.max(1, Math.round(cap * 0.15)));
      else if (dm < -40 && s.occ[k] > 1 && rng.next() < 0.08) s.occ[k]--;
      const tgt = targetLevel(cls, { lv: d.lv[k], happy: cls === 'R' ? sim.happy[k] : 60, edu: d.cov.edu[k], water: wa, sewer: sw, heightLimit: hasPolicy(s, k, 'heightLimit') });
      if (tgt > s.lvl[k] && s.occ[k] >= cap * 0.8 && rng.next() < 0.035) { s.lvl[k]++; s.vari[k] = rng.int(0, 255); s.rev++; sim.fx.push({ k, type: 'levelup', t: 0 }); }
      else if (tgt < s.lvl[k] && rng.next() < 0.01) { s.lvl[k]--; s.occ[k] = Math.min(s.occ[k], capacity(z, s.lvl[k])); s.rev++; }
      const months = sim.probTicks[k] / TICKS_PER_MONTH;
      if (rng.next() < abandonChance({ power: pw, water: wa, sewer: sw, happy: cls === 'R' ? sim.happy[k] : 50, demand: dm, months, crime: d.crime[k] }) / TICKS_PER_MONTH) {
        s.bld[k] = BLD.ABANDONED; s.occ[k] = 0; s.age[k] = 0; s.rev++;
        say(sim, 'abandon', `${ZONES[z].name}の建物が空き家になりました。${!pw ? '電気' : !wa ? '水' : !sw ? '下水' : '暮らしやすさ'}が足りないようです。`, 'warn', k, 2);
      }
      if (fireOn && rng.next() < 0.00001 * (cls === 'I' ? 3 : 1) * (1 - 0.85 * Math.min(1, d.cov.fire[k]))) ignite(sim, k);
    } else if (b === BLD.ABANDONED) {
      if (++s.age[k] > 60) { s.bld[k] = BLD.NONE; s.age[k] = 0; s.rev++; }
    } else if (b === BLD.RUBBLE) {
      if (++s.age[k] > 20) { s.bld[k] = BLD.NONE; s.age[k] = 0; s.rev++; }
    }
  }
  buildTripModel(sim);
  // 歩きと地下鉄の利用者（見えている所に人を歩かせるのは描画の側）
  sim.tickInMonth++;
  if (sim.tickInMonth >= TICKS_PER_MONTH) { sim.tickInMonth = 0; s.time.mprog = Math.max(0, s.time.mprog - 1); monthly(sim); }
  s.rng = rng.state;
}

function svcProblems(sim, k) {
  const s = sim.s, d = sim.d, def = SVC_BY_ID[s.svc[k]];
  let p = 0;
  if (!def.power && !def.park && !svcTiles(s, k).some((t) => d.power.on[t])) p |= PROB.POWER;
  if (!svcTiles(s, k).some((t) => d.access[t] >= 0) && !def.park) p |= PROB.ROAD;
  return p;
}

// 火事: 消防署が届けば消防車が向かい、着くと消える。届かなければ燃え尽きて、隣へ広がることもある
function ignite(sim, k) {
  const s = sim.s;
  if (s.burn[k]) return;
  s.burn[k] = 1;
  sim.fx.push({ k, type: 'fire', t: 0 });
  // 知らせは月に1回まで（大きな街では火事がよく起きるので）
  const truck = dispatch(sim, k, 'fire', () => { if (s.burn[k]) { s.burn[k] = 0; s.rev++; say(sim, 'fireout', '消防車が火事を消しました。', 'good', k, 1); } });
  say(sim, 'fire', truck ? '火事です。消防車が向かっています。' : '火事です。消防署が届かない場所なので、燃え広がるかもしれません。', 'bad', k, 1);
  s.rev++;
}
function burnStep(sim, k) {
  const s = sim.s, N = s.N, rng = sim.rng;
  s.burn[k] = Math.min(250, s.burn[k] + 1);
  if (s.burn[k] > 12) {
    s.burn[k] = 0; s.bld[k] = BLD.RUBBLE; s.occ[k] = 0; s.age[k] = 0; s.rev++;
    return;
  }
  if (sim.d.cov.fire[k] > 0.1) return;
  const i = k % N, j = (k - i) / N;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const a = i + di, b = j + dj;
    if (a < 0 || b < 0 || a >= N || b >= N) continue;
    const m = b * N + a;
    if (s.bld[m] === BLD.BUILT && !s.burn[m] && rng.next() < 0.06) { s.burn[m] = 1; s.rev++; }
  }
}
// 一番近い施設（消防署など）から車を出す
function dispatch(sim, k, kind, onArrive) {
  const s = sim.s, d = sim.d, key = { fire: 'fire', police: 'police', ambulance: 'clinic' }[kind], to = d.access[k];
  if (to < 0) return null;
  let best = null;
  for (let t = 0; t < s.N * s.N; t++) {
    if (!s.svc[t] || s.anchor[t] !== t) continue;
    const def = SVC_BY_ID[s.svc[t]];
    if (def.key !== key && !(kind === 'ambulance' && def.key === 'hospital')) continue;
    const road = svcRoad(s, d.access, t);
    if (road < 0) continue;
    const path = findPath(s, road, to, { cong: sim.tr.density });
    if (path && path.length <= def.radius * 2.2 && (!best || path.length < best.length)) best = path;
  }
  if (!best) return null;
  if (best.length < 2) { onArrive(); return { arrived: true }; }
  const v = addVehicle(sim.tr, best, kind, { siren: true, onArrive });
  return v;
}

function monthly(sim) {
  const s = sim.s, st = sim.stats;
  const inc = taxIncome(s), fill = st.fill ?? 1;
  // 働き手が足りない分、商業と工業とオフィスの税収は減る
  const income = { ...inc, C: inc.C * fill, I: inc.I * fill, O: inc.O * fill };
  income.total = income.R + income.C + income.I + income.O;
  const exp = expenses(s, st.residents);
  const net = income.total - exp.total;
  s.funds = Math.round(s.funds + net);
  for (const l of s.loans) l.left--;
  const done = s.loans.filter((l) => l.left <= 0);
  s.loans = s.loans.filter((l) => l.left > 0);
  for (const l of done) say(sim, null, `融資（${l.amount.toLocaleString('ja-JP')} 万円）を返し終えました。`, 'good');
  sim.lastBudget = { income, exp, net };
  sim.profitStreak = net >= 0 ? sim.profitStreak + 1 : 0;
  // 暦を進める
  s.time.month++;
  if (s.time.month > 12) { s.time.month = 1; s.time.year++; }
  sim.wind = 0.45 + sim.rng.next() * 0.8;
  s.history.push({ y: s.time.year, m: s.time.month, pop: st.residents, funds: s.funds, income: Math.round(income.total), expense: Math.round(exp.total), R: Math.round(sim.demand.R), C: Math.round(sim.demand.C), I: Math.round(sim.demand.I), flow: Math.round(sim.tr.flow * 100), happy: Math.round(st.happiness), jobs: st.jobs.C + st.jobs.I + st.jobs.O });
  if (s.history.length > 360) s.history.shift();
  // マイルストーン
  const mi = milestoneIndex(st.residents);
  while (mi > s.milestone) {
    s.milestone++;
    const M = MILESTONES[s.milestone];
    s.funds += M.reward;
    say(sim, null, `「${M.title}」になりました（人口 ${M.pop.toLocaleString('ja-JP')} 人）。お祝いに ${M.reward.toLocaleString('ja-JP')} 万円。新しい道具が使えます。`, 'good');
    sim.fx.push({ type: 'milestone', stage: s.milestone, t: 0 });
  }
  // 目標
  st.metroMonth = st.metro - (sim.metroMark || 0); sim.metroMark = st.metro;
  for (const g of GOALS) {
    if (s.goals[g.key]) continue;
    if (g.check(st, sim)) { s.goals[g.key] = `${s.time.year}年${s.time.month}月`; s.funds += g.reward; say(sim, null, `目標「${g.name}」を達成しました。${g.reward.toLocaleString('ja-JP')} 万円を受け取りました。`, 'good'); sim.fx.push({ type: 'goal', key: g.key, t: 0 }); }
  }
  advise(sim, net);
}

// 月ごとの知らせ（困っていること、伸ばせること）
function advise(sim, net) {
  const s = sim.s, st = sim.stats, dm = sim.demand;
  // 届いていない建物の数（足りないのではなく、つながっていない）
  let noPow = 0, noWater = 0, noSewer = 0, farLots = 0;
  for (let k = 0; k < s.N * s.N; k++) {
    const p = sim.prob[k];
    if (p & PROB.POWER) noPow++; if (p & PROB.WATER) noWater++; if (p & PROB.SEWER) noSewer++;
    if (s.zone[k] && !s.bld[k] && sim.d.access[k] < 0) farLots++;
  }
  let svcNoPow = 0;
  for (let k = 0; k < s.N * s.N; k++) if (s.svc[k] && s.anchor[k] === k && (sim.prob[k] & PROB.POWER)) svcNoPow++;
  if (svcNoPow) say(sim, 'svcpower', `電気の来ていない施設が ${svcNoPow} か所あり、働いていません。区画のそばに置くか、送電線（道具 5）でつなぎましょう。`, 'warn', -1, 2);
  if (noPow > 4 && st.power.supply === 0) say(sim, 'nopower', `電気の来ない建物が ${noPow} 軒あります。発電所（道具 5）を置きましょう。`, 'warn', -1, 2);
  else if (noPow > 4 && st.power.demand <= st.power.supply) say(sim, 'powerline', `電気の届いていない建物が ${noPow} 軒あります。電気は建物と区画を2マスまでしか飛べません。発電所から送電線（道具 5）を引きましょう。`, 'warn', -1, 2);
  if (noWater > 4 && st.water.supply === 0) say(sim, 'nowater', `水の来ない建物が ${noWater} 軒あります。給水塔（道具 6）を道に面して置きましょう。`, 'warn', -1, 2);
  if (noSewer > 4 && st.sewer.supply === 0) say(sim, 'nosewer', `下水の流れない建物が ${noSewer} 軒あります。下水処理場（道具 6）を道に面して置きましょう。`, 'warn', -1, 2);
  if (farLots > 12) say(sim, 'farlots', `道から遠い区画が ${farLots} マスあります。建物が建つのは、道から3マスまでの区画です。`, 'info', -1, 6);
  if (st.power.demand > st.power.supply + 0.5) say(sim, 'power', `電気が足りません（使う量 ${Math.round(st.power.demand)}、作る量 ${Math.round(st.power.supply)}）。発電所を増やしましょう。`, 'warn');
  if (st.water.demand > st.water.supply + 0.5) say(sim, 'water', `水が足りません（使う量 ${Math.round(st.water.demand)}、送れる量 ${Math.round(st.water.supply)}）。給水塔か揚水ポンプ場を増やしましょう。`, 'warn');
  if (st.sewer.demand > st.sewer.supply + 0.5) say(sim, 'sewer', `下水があふれています（${Math.round(st.sewer.demand)} / ${Math.round(st.sewer.supply)}）。下水処理場を増やしましょう。`, 'warn');
  if (net < 0 && s.funds < 3000) say(sim, 'debt', `赤字です（月に ${Math.round(-net).toLocaleString('ja-JP')} 万円）。税を少し上げるか、施設の予算を見直しましょう。`, 'bad', -1, 2);
  if (s.funds < 0) say(sim, 'broke', 'お金が尽きました。融資を受けるか、税を上げてください。マイナスの間は新しく建てられません。', 'bad', -1, 2);
  if (sim.tr.flow < 0.5 && sim.tr.vehicles.length > 60) say(sim, 'traffic', `渋滞がひどくなっています（交通の流れ ${Math.round(sim.tr.flow * 100)}%）。大通りや別の道、地下鉄を考えましょう。`, 'warn', -1, 4);
  if (dm.R > 60) say(sim, 'demR', '住宅の需要が高まっています。住宅の区画を増やしましょう。', 'info', -1, 6);
  if (dm.C > 60) say(sim, 'demC', 'お店が足りません。商業の区画を増やしましょう。', 'info', -1, 6);
  if (dm.I > 60) say(sim, 'demI', '工場の働き口を求める声があります。工業の区画を増やしましょう。', 'info', -1, 6);
  if (st.residents > 600 && st.pol > 30) say(sim, 'pol', '住宅地の空気が汚れています。工場から離すか、森や公園を置きましょう。', 'warn', -1, 6);
  if (st.residents > 800 && st.crime > 35) say(sim, 'crime', '犯罪が増えています。警察署を置きましょう。', 'warn', -1, 6);
  if (sim.tr.failedRecent > 10) say(sim, 'reach', '行き先にたどり着けない人がいます。道がつながっているか確かめましょう。', 'warn', -1, 4);
  sim.tr.failedRecent = 0;
}

// 実時間（速さを掛けた秒）だけ進める。時刻・暦・車・人の移動
export function advance(sim, dt) {
  const s = sim.s, t = s.time;
  t.tod = (t.tod + (dt * 1440) / DAY_SECONDS) % 1440;
  t.mprog += dt / MONTH_SECONDS;
  let guard = 0;
  while (t.mprog * TICKS_PER_MONTH >= sim.tickInMonth + 1 && guard++ < 6) tick(sim);
  const hour = t.tod / 60;
  const before = sim.tr.failed;
  const r = spawnTrips(sim.tr, s, sim.model, hour, (dt * 24) / DAY_SECONDS, sim.rng, { maxPaths: 8 });
  sim.tr.failedRecent = (sim.tr.failedRecent || 0) + (sim.tr.failed - before);
  for (const k of r.failed) sim.unreach[k] = 45;
  sim.stats.walks += r.walks; sim.stats.metro += r.metro; sim.stats.cars += r.cars;
  for (const k of r.walkFrom) { sim.walkFrom.push(k); if (sim.walkFrom.length > 400) sim.walkFrom.shift(); }
  stepTraffic(sim.tr, s, dt);
}
