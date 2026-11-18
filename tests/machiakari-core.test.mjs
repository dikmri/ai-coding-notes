// 街づくりゲーム「街あかり」の計算の部分（地図・道具・電気と水道・届く範囲・経路・需要・地価・成長・予算・交通・保存）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../os/games/machiakari/js/core/rng.mjs';
import * as C from '../os/games/machiakari/js/core/city.mjs';
import * as E from '../os/games/machiakari/js/core/edit.mjs';
import * as Net from '../os/games/machiakari/js/core/net.mjs';
import { computeDemand } from '../os/games/machiakari/js/core/demand.mjs';
import * as F from '../os/games/machiakari/js/core/fields.mjs';
import * as G from '../os/games/machiakari/js/core/growth.mjs';
import * as B from '../os/games/machiakari/js/core/budget.mjs';
import * as M from '../os/games/machiakari/js/core/milestones.mjs';
import * as T from '../os/games/machiakari/js/core/traffic.mjs';
import * as S from '../os/games/machiakari/js/core/sim.mjs';
import * as Sv from '../os/games/machiakari/js/core/save.mjs';
import { SVC, ROADS } from '../os/games/machiakari/js/core/defs.mjs';

const id = (s, i, j) => C.idx(s.N, i, j);
// 何もない平らな土地。すべて解放し、お金はたっぷり
function blank(n = 20, funds = 1e6) { const s = C.blankCity(n); s.funds = funds; s.unlockAll = true; return s; }

test('乱数: 同じ種なら同じ並び。状態を戻すと同じ続きになる', () => {
  const a = makeRng(42), b = makeRng(42);
  const xs = Array.from({ length: 5 }, () => a.next());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b.next()));
  for (const v of xs) assert.ok(v >= 0 && v < 1);
  const st = a.state, n1 = a.next(); a.state = st;
  assert.equal(a.next(), n1);
});

test('地図: 同じ種なら同じ地形。川の地図には水があり、外へつながる道が端から伸びている', () => {
  const a = C.createCity({ size: 48, seed: 7, terrain: 'river' }), b = C.createCity({ size: 48, seed: 7, terrain: 'river' });
  assert.deepEqual([...a.terrain], [...b.terrain]);
  const water = a.terrain.reduce((n, v) => n + (v === 1), 0);
  assert.ok(water > 48 && water < 48 * 48 * 0.4, '水は少しだけ: ' + water);
  // 外への道: 地図の端の道路のマスがある
  const edge = [];
  for (let k = 0; k < 48; k++) for (const [i, j] of [[0, k], [47, k], [k, 0], [k, 47]]) if (a.road[id(a, i, j)]) edge.push([i, j]);
  assert.ok(edge.length >= 1);
  assert.ok(a.road.reduce((n, v) => n + (v > 0), 0) >= 8, '外への道は何マスか続く');
});

test('道具: 道は L 字に引ける。費用を払い、水の上は橋になって高くなる', () => {
  assert.deepEqual(E.linePath([0, 0], [3, 2]), [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2]]);
  assert.deepEqual(E.linePath([2, 5], [2, 3]), [[2, 5], [2, 4], [2, 3]]);
  const s = blank(10, 1000);
  const r = E.apply(s, { kind: 'road', road: 1 }, [0, 0], [4, 0]);
  assert.ok(r.ok);
  assert.equal(r.cost, ROADS[1].cost * 5);
  assert.equal(s.funds, 1000 - r.cost);
  s.terrain[id(s, 0, 2)] = 1;
  const land = E.plan(s, { kind: 'road', road: 1 }, [1, 2], [1, 2]).cost, bridge = E.plan(s, { kind: 'road', road: 1 }, [0, 2], [0, 2]).cost;
  assert.ok(bridge > land * 2, `橋 ${bridge} 陸 ${land}`);
  // 小道を大通りに広げるときは差額だけ
  const up = E.plan(s, { kind: 'road', road: 2 }, [0, 0], [0, 0]).cost;
  assert.equal(up, ROADS[2].cost - ROADS[1].cost);
});

test('道具: 区画は水や道の上に塗れない。お金が足りないと何もしない', () => {
  const s = blank(10, 1e6);
  E.apply(s, { kind: 'road', road: 1 }, [0, 3], [9, 3]);
  s.terrain[id(s, 5, 5)] = 1;
  const r = E.apply(s, { kind: 'zone', zone: 1 }, [0, 2], [9, 5]);
  assert.ok(r.ok);
  assert.equal(s.zone[id(s, 4, 3)], 0, '道の上は塗らない');
  assert.equal(s.zone[id(s, 5, 5)], 0, '水の上は塗らない');
  assert.equal(s.zone[id(s, 4, 4)], 1);
  const poor = blank(10, 5);
  const p = E.apply(poor, { kind: 'svc', key: 'coal' }, [2, 2], [2, 2]);
  assert.equal(p.ok, false);
  assert.match(p.reason, /足り/);
  assert.equal(poor.svc[id(poor, 2, 2)], 0);
});

test('道具: 施設は大きさのぶんの土地を使う。揚水ポンプは水辺にしか置けない。ブルドーザーで消せる', () => {
  const s = blank(12);
  assert.ok(E.apply(s, { kind: 'svc', key: 'coal' }, [3, 3], [3, 3]).ok);
  for (const [i, j] of [[3, 3], [4, 3], [3, 4], [4, 4]]) assert.equal(s.svc[id(s, i, j)], SVC.coal.id);
  assert.equal(s.anchor[id(s, 4, 4)], id(s, 3, 3));
  assert.equal(E.apply(s, { kind: 'svc', key: 'tower' }, [4, 4], [4, 4]).ok, false, '重ねて置けない');
  assert.equal(E.apply(s, { kind: 'svc', key: 'pump' }, [8, 8], [8, 8]).ok, false);
  s.terrain[id(s, 9, 8)] = 1;
  assert.ok(E.apply(s, { kind: 'svc', key: 'pump' }, [8, 8], [8, 8]).ok);
  // 2×2 の1マスを消すと全体が消える
  assert.ok(E.apply(s, { kind: 'bulldoze' }, [4, 4], [4, 4]).ok);
  for (const [i, j] of [[3, 3], [4, 3], [3, 4], [4, 4]]) assert.equal(s.svc[id(s, i, j)], 0);
});

test('つながり: 区画は道から3マスまでなら道に面している（高速道路は数えない）', () => {
  const s = blank(12);
  E.apply(s, { kind: 'road', road: 1 }, [0, 0], [11, 0]);
  const a = Net.computeAccess(s);
  assert.equal(a[id(s, 5, 3)], id(s, 5, 0));
  assert.equal(a[id(s, 5, 4)], -1);
  const h = blank(12);
  E.apply(h, { kind: 'road', road: 3 }, [0, 0], [11, 0]);
  assert.equal(Net.computeAccess(h)[id(h, 5, 1)], -1);
});

test('電気: 発電所から建物と区画と電線を伝わる。足りないと遠いところから止まる', () => {
  const s = blank(20);
  // 0..9 列に住宅の区画を1行、5 列目に1マスの道（建物は道を2マスまで飛び越えて伝わる）
  E.apply(s, { kind: 'zone', zone: 1 }, [0, 0], [9, 0]);
  E.apply(s, { kind: 'road', road: 1 }, [5, 0], [5, 0]);
  // 離れた所（列 15..19）の区画には電気が来ない
  E.apply(s, { kind: 'zone', zone: 1 }, [15, 0], [19, 0]);
  const usage = new Float32Array(s.N * s.N);
  for (let i = 0; i < 10; i++) usage[id(s, i, 0)] = 10;
  const plants = [{ tiles: [id(s, 0, 0)], cap: 1000 }];
  let f = Net.flowPower(s, plants, usage);
  assert.equal(f.on[id(s, 9, 0)], 1, '道を飛び越えて届く');
  assert.equal(f.on[id(s, 15, 0)], 0);
  // 電線で結ぶと届く
  E.apply(s, { kind: 'power' }, [10, 1], [14, 1]);
  f = Net.flowPower(s, plants, usage);
  assert.equal(f.on[id(s, 15, 0)], 1);
  // 発電量 35 に対して 1 マス 10 → 発電所に近い 3 マスだけ点く
  f = Net.flowPower(s, [{ tiles: [id(s, 0, 0)], cap: 35 }], usage);
  assert.equal(f.on[id(s, 0, 0)] + f.on[id(s, 1, 0)] + f.on[id(s, 2, 0)], 3);
  assert.equal(f.on[id(s, 9, 0)], 0);
  assert.equal(f.demand, 100);
});

test('電気: 足りないときは、遠くても公共の施設へ先に配る（給水塔が止まって街じゅうの水が止まらないように）', () => {
  const s = blank(20);
  E.apply(s, { kind: 'zone', zone: 1 }, [0, 0], [9, 0]);
  const usage = new Float32Array(s.N * s.N);
  for (let i = 0; i < 10; i++) usage[id(s, i, 0)] = 10;
  const prio = new Uint8Array(s.N * s.N);
  prio[id(s, 9, 0)] = 1; // 一番遠いマスが施設
  const f = Net.flowPower(s, [{ tiles: [id(s, 0, 0)], cap: 35 }], usage, prio);
  assert.equal(f.on[id(s, 9, 0)], 1, '遠い施設に電気が来る');
  assert.equal(f.on[id(s, 0, 0)] + f.on[id(s, 1, 0)] + f.on[id(s, 2, 0)], 2, '残りは近い順');
});

test('水道: 水は道の下の管を通る。道がつながっていない区画には来ない', () => {
  const s = blank(16);
  E.apply(s, { kind: 'road', road: 1 }, [0, 5], [9, 5]);
  E.apply(s, { kind: 'road', road: 1 }, [12, 5], [15, 5]);
  E.apply(s, { kind: 'zone', zone: 1 }, [0, 6], [15, 6]);
  const access = Net.computeAccess(s), usage = new Float32Array(s.N * s.N);
  for (let i = 0; i < 16; i++) usage[id(s, i, 6)] = 5;
  const r = Net.flowRoadUtility(s, access, [{ road: id(s, 0, 5), cap: 1000 }], usage);
  assert.equal(r.on[id(s, 3, 6)], 1);
  assert.equal(r.on[id(s, 13, 6)], 0);
});

test('届く範囲: 道の上の道のりで弱まり、半径の外には届かない', () => {
  const s = blank(30);
  E.apply(s, { kind: 'road', road: 1 }, [0, 0], [29, 0]);
  E.apply(s, { kind: 'zone', zone: 1 }, [0, 1], [29, 1]);
  const access = Net.computeAccess(s);
  const cov = Net.coverage(s, [{ road: id(s, 0, 0), radius: 10, strength: 1 }], access);
  assert.ok(cov[id(s, 1, 1)] > cov[id(s, 6, 1)]);
  assert.ok(cov[id(s, 6, 1)] > 0);
  assert.equal(cov[id(s, 15, 1)], 0);
});

test('経路: 最短の道を探し、混んだ道は避ける。つながっていなければ null', () => {
  const s = blank(12);
  // 上の道と下の道の2本の通り道（0,0)→(10,0) と 迂回 (0,0)→(0,4)→(10,4)→(10,0)
  E.apply(s, { kind: 'road', road: 1 }, [0, 0], [10, 0]);
  E.apply(s, { kind: 'road', road: 1 }, [0, 0], [0, 4]);
  E.apply(s, { kind: 'road', road: 1 }, [0, 4], [10, 4]);
  E.apply(s, { kind: 'road', road: 1 }, [10, 4], [10, 0]);
  const p = Net.findPath(s, id(s, 0, 0), id(s, 10, 0));
  assert.equal(p.length, 11);
  const cong = new Float32Array(s.N * s.N);
  for (let i = 1; i < 10; i++) cong[id(s, i, 0)] = 1;
  const q = Net.findPath(s, id(s, 0, 0), id(s, 10, 0), { cong });
  assert.ok(q.length > 11, '混んだ道を避けて遠回りする');
  E.apply(s, { kind: 'road', road: 1 }, [11, 11], [11, 11]);
  assert.equal(Net.findPath(s, id(s, 0, 0), id(s, 11, 11)), null);
});

test('需要: 空の街は住宅と工業を求める。仕事がなければ住宅の需要は下がり、税を上げると下がる', () => {
  const base = { residents: 0, jobs: { C: 0, I: 0, O: 0 }, edu: 0, taxes: { R: 9, C: 9, I: 9, O: 9 }, happiness: 60, tourists: 0 };
  const d0 = computeDemand(base);
  assert.ok(d0.R > 20 && d0.I > 20, JSON.stringify(d0));
  const jobless = computeDemand({ ...base, residents: 2000, jobs: { C: 20, I: 20, O: 0 } });
  assert.ok(jobless.R < 0, '仕事がないと人は来ない');
  assert.ok(jobless.C > 30 && jobless.I > 30, JSON.stringify(jobless));
  const jobby = computeDemand({ ...base, residents: 200, jobs: { C: 300, I: 600, O: 0 } });
  assert.ok(jobby.R > 60 && jobby.I < 0, JSON.stringify(jobby));
  const taxed = computeDemand({ ...base, taxes: { R: 18, C: 18, I: 18, O: 18 } });
  assert.ok(taxed.R < d0.R - 20 && taxed.I < d0.I - 20);
  const big = computeDemand({ ...base, residents: 1e6, jobs: { C: 0, I: 0, O: 0 } });
  for (const k of ['R', 'C', 'I', 'O']) assert.ok(big[k] >= -100 && big[k] <= 100, k);
});

test('地価と公害: 工場の近くは汚れて地価が下がり、公園の近くは上がる', () => {
  const s = blank(30);
  E.apply(s, { kind: 'road', road: 1 }, [0, 10], [29, 10]);
  E.apply(s, { kind: 'zone', zone: 5 }, [2, 11], [4, 13]);
  for (let j = 11; j <= 13; j++) for (let i = 2; i <= 4; i++) { const k = id(s, i, j); s.bld[k] = 1; s.lvl[k] = 1; s.occ[k] = 8; }
  E.apply(s, { kind: 'svc', key: 'park' }, [25, 11], [25, 11]);
  const f = F.computeFields(s, { cov: {}, traffic: new Float32Array(s.N * s.N) });
  assert.ok(f.pol[id(s, 3, 12)] > f.pol[id(s, 12, 12)]);
  assert.ok(f.pol[id(s, 12, 12)] >= f.pol[id(s, 25, 12)]);
  assert.ok(f.lv[id(s, 24, 12)] > f.lv[id(s, 5, 12)] + 10, `公園のそば ${f.lv[id(s, 24, 12)]} 工場のそば ${f.lv[id(s, 5, 12)]}`);
});

test('成長: 道がなければ建たない。電気がなくても建つが（建ってから困りごとの印が出る）、建ちにくい。需要が高いほど建ちやすい', () => {
  const ok = { demand: 50, lv: 50, access: true, power: true, pol: 0 };
  assert.equal(G.growChance({ ...ok, access: false }), 0);
  assert.ok(G.growChance({ ...ok, power: false }) > 0);
  assert.ok(G.growChance({ ...ok, power: false }) < G.growChance(ok));
  assert.ok(G.growChance({ ...ok, demand: 80 }) > G.growChance({ ...ok, demand: 20 }));
  assert.equal(G.growChance({ ...ok, demand: -20 }), 0);
  assert.equal(G.targetLevel('R', { lv: 20, happy: 50, edu: 0, water: true, sewer: true }), 1);
  assert.ok(G.targetLevel('R', { lv: 80, happy: 80, edu: 0.8, water: true, sewer: true }) === 3);
  assert.equal(G.targetLevel('R', { lv: 80, happy: 80, edu: 0.8, water: false, sewer: true }), 1, '水がないと水準は上がらない');
  assert.ok(G.capacity(2, 3) > G.capacity(1, 3), '高密度は人が多い');
});

test('予算: 税を上げると収入が増える。施設の予算を半分にすると維持費も半分。融資の返済は元金より多い', () => {
  const s = blank(10);
  for (let i = 0; i < 5; i++) { const k = id(s, i, 0); s.zone[k] = 1; s.bld[k] = 1; s.lvl[k] = 1; s.occ[k] = 10; }
  const lo = B.taxIncome(s).total;
  s.taxes.R = 18;
  const hi = B.taxIncome(s).total;
  assert.ok(hi > lo * 1.8 && lo > 0, `${lo} → ${hi}`);
  E.apply(s, { kind: 'svc', key: 'fire' }, [5, 5], [5, 5]);
  const full = B.expenses(s).services;
  s.budgets.fire = 50;
  assert.ok(Math.abs(B.expenses(s).services - full / 2) < 1e-6);
  const pay = B.loanPayment(10000, 0.06, 24);
  assert.ok(pay * 24 > 10000 && pay * 24 < 10000 * 1.1, String(pay));
});

test('マイルストーン: 人口で段階が上がり、道具が解放される', () => {
  assert.equal(M.milestoneIndex(0), 0);
  const i = M.milestoneIndex(1e6);
  assert.equal(i, M.MILESTONES.length - 1);
  const s = C.blankCity(10);
  assert.equal(M.isUnlocked(s, 'road:1'), true);
  assert.equal(M.isUnlocked(s, 'road:3'), false);
  s.milestone = M.MILESTONES.length - 1;
  assert.equal(M.isUnlocked(s, 'road:3'), true);
  const s2 = C.blankCity(10);
  assert.equal(E.apply(s2, { kind: 'road', road: 3 }, [0, 0], [3, 0]).ok, false, 'まだ解放されていない道具は使えない');
});

test('交通: 朝と夕方に通勤が多く、深夜は少ない。1日の割合の合計は 1', () => {
  let sum = 0;
  for (let h = 0; h < 24; h++) sum += T.tripShare(h, 'commute');
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(T.tripShare(8, 'commute') > T.tripShare(13, 'commute') * 1.5);
  assert.ok(T.tripShare(18, 'commute') > T.tripShare(3, 'commute') * 5);
});

test('交通: 赤信号で止まり、後ろの車は前の車にぶつからずに並ぶ', () => {
  const s = blank(20);
  // 横の大通りと縦の大通りの交差点 (10,5)
  E.apply(s, { kind: 'road', road: 2 }, [0, 5], [19, 5]);
  E.apply(s, { kind: 'road', road: 2 }, [10, 0], [10, 12]);
  const tr = T.makeTraffic(s);
  const path = Net.findPath(s, id(s, 0, 5), id(s, 19, 5));
  const a = T.addVehicle(tr, path, 'car'), b = T.addVehicle(tr, path, 'car');
  a.s = 6; b.s = 4; a.lane = b.lane = 0;
  // 横向き（i の向き）を赤にする
  tr.forceSignal = (k, axis) => axis !== 0;
  for (let n = 0; n < 600; n++) T.stepTraffic(tr, s, 1 / 60);
  assert.ok(a.s < 10 - 0.2, '交差点の手前で止まる: ' + a.s);
  assert.ok(a.s > 8.5, '停止線の近くまでは進む: ' + a.s);
  assert.ok(b.s < a.s - 0.25, `後ろの車は前の車との間をあける: a=${a.s} b=${b.s}`);
  // 青にすると通り抜ける
  tr.forceSignal = () => true;
  for (let n = 0; n < 900; n++) T.stepTraffic(tr, s, 1 / 60);
  assert.equal(tr.vehicles.length, 0, '2台とも着いて消える');
  assert.equal(tr.arrived, 2);
});

test('交通: 車が多い道は混雑の値が上がる', () => {
  const s = blank(20);
  E.apply(s, { kind: 'road', road: 1 }, [0, 5], [19, 5]);
  const tr = T.makeTraffic(s);
  const path = Net.findPath(s, id(s, 0, 5), id(s, 19, 5));
  for (let n = 0; n < 12; n++) { const v = T.addVehicle(tr, path, 'car'); v.s = n * 0.3; }
  for (let n = 0; n < 120; n++) T.stepTraffic(tr, s, 1 / 60);
  const busy = tr.density[id(s, 2, 5)], empty = tr.density[id(s, 15, 5)];
  assert.ok(busy > empty, `${busy} > ${empty}`);
});

test('保存: 書き出して読み込むと同じ街になる', () => {
  const s = C.createCity({ size: 32, seed: 5, terrain: 'lake' });
  E.apply(s, { kind: 'zone', zone: 1 }, [10, 10], [12, 12]);
  s.policies[0] = ['saveEnergy'];
  const t = Sv.deserialize(Sv.serialize(s));
  for (const k of ['terrain', 'road', 'zone', 'svc', 'trees', 'anchor']) assert.deepEqual([...t[k]], [...s[k]], k);
  assert.equal(t.funds, s.funds);
  assert.deepEqual(t.policies, s.policies);
  assert.throws(() => Sv.deserialize('{"v":999}'), /版/);
});

// 遊び方の筋道が回るか: 道・区画・発電所・給水塔・下水処理場を置いて 2 年回すと、人が住み、お金が残る
test('通し: 最初の街を作って2年回すと、人口が増え、赤字で破産しない', () => {
  const s = C.createCity({ size: 48, seed: 11, terrain: 'flat', funds: 20000 });
  const r = (a, b, road = 1) => assert.ok(E.apply(s, { kind: 'road', road }, a, b).ok, `道 ${a}→${b}`);
  const row = s.entry.j;
  r([s.entry.i, row], [40, row]);
  for (const x of [20, 28, 36]) r([x, row - 10], [x, row + 10]);
  r([20, row - 10], [36, row - 10]); r([20, row + 10], [36, row + 10]);
  const z = (zone, a, b) => assert.ok(E.apply(s, { kind: 'zone', zone }, a, b).ok);
  z(1, [21, row - 9], [27, row - 1]); z(1, [29, row - 9], [35, row - 1]);
  z(3, [21, row + 1], [27, row + 3]);
  z(5, [29, row + 1], [35, row + 9]);
  const svc = (key, at) => assert.ok(E.apply(s, { kind: 'svc', key }, at, at).ok, key);
  svc('coal', [37, row + 4]);
  svc('tower', [19, row - 3]);
  svc('sewer', [37, row - 4]);
  const sim = S.createSim(s, { seed: 1 });
  const months = [];
  for (let m = 0; m < 24; m++) { for (let d = 0; d < S.TICKS_PER_MONTH; d++) S.tick(sim); months.push({ pop: sim.stats.residents, funds: s.funds }); }
  const last = months.at(-1);
  assert.ok(last.pop > 400, '人口 ' + JSON.stringify(months.filter((_, i) => i % 4 === 3)));
  assert.ok(last.funds > 0, 'お金 ' + last.funds);
  assert.ok(sim.stats.jobs.I > 0 && sim.stats.jobs.C > 0);
});
