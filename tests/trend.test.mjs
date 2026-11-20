// 「今日の話題を再現」まわりのテスト（日付の差・並び順・検査の決まり）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function load(extra = '') {
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sandbox);
  if (extra) vm.runInContext(extra, sandbox);
  return sandbox.dekiru;
}

test('日付の差: 同じ日は0、前の日は1、月や年をまたいでも数える', () => {
  const D = load();
  assert.equal(D.daysBetween('2026-11-17', '2026-11-17'), 0);
  assert.equal(D.daysBetween('2026-11-16', '2026-11-17'), 1);
  assert.equal(D.daysBetween('2026-10-31', '2026-11-01'), 1);
  assert.equal(D.daysBetween('2025-12-31', '2026-01-02'), 2);
  assert.equal(D.daysBetween('2026-11-18', '2026-11-17'), -1);
});

test('話題の分類は先頭にあり、新しい日付の項目ほど前に並ぶ', () => {
  const D = load(`
    dekiru.add({ id: 'shape-a', c: 'shape', t: 'a', y: 'あ', tags: ['x', 'y'], d: '12345678' });
    dekiru.add({ id: 'tr-20261115-old', c: 'trend', date: '2026-11-15', t: 'old', y: 'お', tags: ['x', 'y'], d: '12345678' });
    dekiru.add({ id: 'tr-20261117-new', c: 'trend', date: '2026-11-17', t: 'new', y: 'に', tags: ['x', 'y'], d: '12345678' });
    dekiru.finalize();`);
  assert.equal(D.cats[0].id, 'trend');
  assert.deepEqual(Array.from(D.entries, (e) => e.id), ['tr-20261117-new', 'tr-20261115-old', 'shape-a']);
});

// 項目の core() を取り出して、単独で呼べるようにする
function trendCore(id, names) {
  const D = load(readFileSync(join(ROOT, 'entries/trend.js'), 'utf8'));
  D.finalize();
  const e = D.entries.find((x) => x.id === id);
  if (!e || !e.core) throw new Error('core がありません: ' + id);
  const ctx = vm.createContext({});
  vm.runInContext(D.src(e.core) + `\n;globalThis.__x = { ${names.join(', ')} };`, ctx);
  return ctx.__x;
}
const RUPERT = 'tr-20261117-rupert-passage';
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('通り抜け: 正多面体の頂点と辺の数、頂点は半径1の球の上', () => {
  const { solid, edgesOf } = trendCore(RUPERT, ['solid', 'edgesOf']);
  const want = { cube: [8, 12], octa: [6, 12], tetra: [4, 6], dodeca: [20, 30], icosa: [12, 30] };
  for (const [name, [nv, ne]] of Object.entries(want)) {
    const v = solid(name);
    assert.equal(v.length, nv, name);
    assert.equal(edgesOf(v).length, ne, name);
    for (const p of v) assert.ok(near(Math.hypot(p[0], p[1], p[2]), 1), name);
  }
  assert.throws(() => solid('sphere'));
});

test('通り抜け: 四元数から作った回転の行列は、長さと直角を保つ', () => {
  const { randomQuat, quatToMat, seeded } = trendCore(RUPERT, ['randomQuat', 'quatToMat', 'seeded']);
  const rand = seeded(7);
  for (let n = 0; n < 20; n++) {
    const m = quatToMat(randomQuat(rand));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const dot = m[i][0] * m[j][0] + m[i][1] * m[j][1] + m[i][2] * m[j][2];
      assert.ok(near(dot, i === j ? 1 : 0, 1e-9));
    }
  }
});

test('通り抜け: 凸包は内側の点と一直線上の点を外し、左回りに並べる', () => {
  const { hull } = trendCore(RUPERT, ['hull']);
  const h = hull([[0, 0], [2, 0], [1, 0], [2, 2], [0, 2], [1, 1]]);
  // 別の vm で作った配列なので、JSON で複製してから比べる
  assert.deepEqual(JSON.parse(JSON.stringify(h)), [[0, 0], [2, 0], [2, 2], [0, 2]]);
});

test('通り抜け: すき間は、内側なら正、はみ出すと負、辺の上なら0', () => {
  const { fitMargin, spareScale } = trendCore(RUPERT, ['fitMargin', 'spareScale']);
  const sq = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  assert.ok(near(fitMargin(sq, [[0, 0], [0.5, 0.25]]), 0.5));
  assert.ok(near(fitMargin(sq, [[1.2, 0]]), -0.2));
  assert.ok(near(fitMargin(sq, [[1, 0]]), 0));
  // 半分の大きさの正方形は、ちょうど2倍まで大きくできる
  assert.ok(near(spareScale(sq, sq.map(([a, b]) => [a / 2, b / 2])), 2, 1e-6));
});

test('通り抜け: 同じ向きの立方体どうしは影がぴったり重なり、通らない', () => {
  const { solid, passMargin, randomQuat, seeded } = trendCore(RUPERT, ['solid', 'passMargin', 'randomQuat', 'seeded']);
  const v = solid('cube'), q = randomQuat(seeded(3));
  assert.ok(passMargin(v, { qo: q, qi: q, t: [0, 0] }) <= 1e-9);
});

test('通り抜け: 対角線の向きから見た立方体の影（六角形）に、少し回した正方形の影が収まる', () => {
  const { solid, passMargin, quatAxis, quatMul } = trendCore(RUPERT, ['solid', 'passMargin', 'quatAxis', 'quatMul']);
  const v = solid('cube');
  // (1,1,1) の向きを z に重ねる回転
  const d = [1, 1, 1].map((a) => a / Math.sqrt(3)), axis = [d[1], -d[0], 0];
  const qo = quatAxis(axis, Math.acos(d[2]));
  let best = -Infinity;
  for (let deg = 0; deg < 90; deg += 1) best = Math.max(best, passMargin(v, { qo, qi: quatMul(quatAxis([0, 0, 1], (deg * Math.PI) / 180), [1, 0, 0, 0]), t: [0, 0] }));
  assert.ok(best > 0.02, `best=${best}`);
});

test('通り抜け: 山登り法は立方体と正八面体が通る向きを見つける', () => {
  const { solid, freshState, climb, seeded, shadow, spareScale } = trendCore(RUPERT, ['solid', 'freshState', 'climb', 'seeded', 'shadow', 'spareScale']);
  for (const name of ['cube', 'octa']) {
    const v = solid(name), rand = seeded(2);
    let s = freshState(v, rand), n = 0;
    while (!s.done && n < 50000) { s = climb(v, s, rand); n++; }
    assert.ok(s.done && s.m > 0, `${name}: n=${n} m=${s.m}`);
    assert.ok(spareScale(shadow(v, s.qo, [0, 0]), shadow(v, s.qi, s.t)) > 1.01, name);
  }
});

const MUT = 'tr-20261118-mutation-test';
const MUT_NAMES = ['parse', 'run', 'listMutants', 'mutatedSource', 'judge', 'findWitness', 'score', 'SAMPLES'];
const sample = (X, key) => X.SAMPLES.find((s) => s.key === key);
const testsOf = (s) => s.tests.map(([args, expect]) => ({ args, expect, on: true }));
const judgeAll = (X, fn, tests, equiv = new Set()) => X.listMutants(fn).map((m) => {
  const r = X.judge(fn, m, tests);
  return equiv.has(m.id) && r.status === 'survived' ? { ...r, status: 'equiv' } : r;
});

test('変異: 関数を読んで、JavaScript と同じ答えを返す', () => {
  const X = trendCore(MUT, MUT_NAMES);
  const leap = X.parse(sample(X, 'leap').code);
  assert.deepEqual([2000, 1900, 2024, 2023].map((y) => X.run(leap, [y])), [true, false, true, false]);
  const ship = X.parse(sample(X, 'ship').code);
  assert.equal(X.run(ship, [2999, true]), 300);
  assert.equal(X.run(ship, [3000, true]), 0);
  assert.equal(X.run(ship, [999, false]), 500);
  assert.equal(X.run(X.parse(sample(X, 'gap').code), [2, 7]), 5);
  // 演算子の強さ、否定、三項演算子、かっこ
  const f = X.parse('function f(x) { if (!(x > 5)) { return 1 + 2 * x === 7 && !false; } return x % 2 === 0 ? -x : x - 1; }');
  assert.equal(X.run(f, [3]), true);
  assert.equal(X.run(f, [8]), -8);
  assert.equal(X.run(f, [9]), 8);
});

test('変異: 読めないコードは、行の番号つきで知らせる', () => {
  const X = trendCore(MUT, MUT_NAMES);
  assert.throws(() => X.parse('function f(x) {\n  return y;\n}'), /2 行目.*「y」は引数にありません/);
  assert.throws(() => X.parse('function f(x) { let a = 1; return a; }'), /if \(条件\) return 値;/);
  assert.throws(() => X.parse('function f(x) { return x # 1; }'), /読めない文字「#」/);
});

test('変異: 演算子・真偽・条件を1か所ずつ書き換えた変異を作る', () => {
  const X = trendCore(MUT, MUT_NAMES);
  const count = (key) => X.listMutants(X.parse(sample(X, key).code)).length;
  assert.equal(count('leap'), 12);
  assert.equal(count('ship'), 13);
  assert.equal(count('gap'), 6);
  const ship = X.parse(sample(X, 'ship').code);
  const m = X.listMutants(ship).find((x) => x.from === '>=' && x.to === '>');
  assert.equal(m.kind, '境界');
  assert.equal(m.line, 2);
  assert.match(X.mutatedSource(ship.src, m), /member && price > 3000\)/);
});

test('変異: 最初のテストでは、うるう年の変異が半分生き残る', () => {
  const X = trendCore(MUT, MUT_NAMES);
  const s = sample(X, 'leap'), fn = X.parse(s.code);
  const sc = X.score(judgeAll(X, fn, testsOf(s)));
  assert.deepEqual([sc.killed, sc.survived, sc.equiv, sc.pct], [6, 6, 0, 50]);
  // 外したテストは数えない
  const off = testsOf(s).map((t) => ({ ...t, on: false }));
  assert.equal(X.score(judgeAll(X, fn, off)).killed, 0);
});

test('変異: 倒す入力は境界の値から探し、等価の変異では見つからない', () => {
  const X = trendCore(MUT, MUT_NAMES);
  const s = sample(X, 'ship'), fn = X.parse(s.code);
  const m = X.listMutants(fn).find((x) => x.from === '>=' && x.to === '>');
  const w = X.findWitness(fn, m, s.domain);
  assert.deepEqual(JSON.parse(JSON.stringify(w)), { args: [3000, true], expect: 0, got: 300 });
  const g = sample(X, 'gap'), gf = X.parse(g.code);
  const eq = X.listMutants(gf).find((x) => x.from === '>' && x.to === '>=');
  assert.equal(X.findWitness(gf, eq, g.domain), null);
});

test('変異: 見つけた入力をテストに足していくと、等価の変異を除いて全部倒せる', () => {
  const X = trendCore(MUT, MUT_NAMES);
  for (const s of X.SAMPLES) {
    const fn = X.parse(s.code), tests = testsOf(s), equiv = new Set();
    for (const m of X.listMutants(fn)) {
      if (X.judge(fn, m, tests).status === 'killed') continue;
      const w = X.findWitness(fn, m, s.domain);
      if (w) tests.push({ args: w.args, expect: w.expect, on: true });
      else equiv.add(m.id);
    }
    const sc = X.score(judgeAll(X, fn, tests, equiv));
    assert.equal(sc.pct, 100, s.key);
    assert.equal(sc.equiv, s.key === 'gap' ? 1 : 0, s.key);
  }
});

const ROMER = 'tr-20261118-romer-light';
const ROMER_NAMES = ['distAU', 'observable', 'seenAt', 'simulate', 'solve', 'fitLight', 'lateMin', 'speedKms', 'dateOf', 'LIGHT_DAY_PER_AU', 'IO_SYN', 'HALF'];
const THREE_YEARS = 365.25 * 3;
const noDelay = (f) => !(f.s > 2 * f.se && f.s * 1440 > 0.05);

test('光の速さ: イオが影に入る間隔、1天文単位を光が進む時間、地球と木星の距離', () => {
  const X = trendCore(ROMER, ROMER_NAMES);
  assert.ok(near(X.IO_SYN, 1.76986, 1e-4));
  assert.ok(near(X.LIGHT_DAY_PER_AU * 1440, 8.3167, 1e-3));
  assert.ok(near(X.HALF * 24, 1.15, 0.01));
  let lo = Infinity, hi = -Infinity;
  for (let d = 0; d <= 400; d += 0.5) { const v = X.distAU(d); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  assert.ok(near(lo, 4.2026, 0.01) && near(hi, 6.2026, 0.01), `${lo} ${hi}`);
  assert.deepEqual({ ...X.dateOf(0) }, { y: 1676, m: 1, d: 1 });
  assert.deepEqual({ ...X.dateOf(366) }, { y: 1677, m: 1, d: 1 }); // 1676年はうるう年
});

test('光の速さ: 見える時刻は、距離 × 1天文単位あたりの遅れだけ遅れる', () => {
  const X = trendCore(ROMER, ROMER_NAMES);
  assert.equal(X.seenAt(100, 0), 100);
  const lag = X.LIGHT_DAY_PER_AU, o = X.seenAt(100, lag);
  assert.ok(near(o - 100, X.distAU(o, 100) * lag, 1e-9));
  assert.ok((o - 100) * 1440 > 30 && (o - 100) * 1440 < 55);
});

test('光の速さ: 近づく時期は影に入る瞬間、遠ざかる時期は影から出る瞬間を、観測できる時期だけ記録する', () => {
  const X = trendCore(ROMER, ROMER_NAMES);
  const obs = X.simulate({ days: THREE_YEARS, lag: X.LIGHT_DAY_PER_AU, seed: 4 });
  assert.ok(obs.length > 200);
  for (const q of obs) {
    assert.ok(X.observable(q.o));
    const a = X.distAU(q.o + 3), b = X.distAU(q.o - 3);
    if (Math.abs(a - b) > 1e-3) assert.equal(q.sg, a < b ? -1 : 1);
  }
  // 種が同じなら、光の速さを変えても晴れる夜はほぼ同じ（観測できる時期の境目だけ違ってよい）
  const half = X.simulate({ days: THREE_YEARS, lag: X.LIGHT_DAY_PER_AU * 2, seed: 4 });
  const ks = new Set(obs.map((q) => q.k));
  assert.ok(half.filter((q) => !ks.has(q.k)).length <= 2);
});

test('光の速さ: 誤差がなければ、当てはめた式から光の速さがほぼぴったり出る', () => {
  const X = trendCore(ROMER, ROMER_NAMES);
  for (const [k, want] of [[1, 299792.458], [0.5, 149896.229], [2, 599584.916]]) {
    const f = X.fitLight(X.simulate({ days: THREE_YEARS, lag: X.LIGHT_DAY_PER_AU / k, seed: 1 }));
    assert.ok(Math.abs(X.speedKms(f.s) / want - 1) < 0.002, `${k}: ${X.speedKms(f.s)}`);
    assert.ok(near(f.P, X.IO_SYN, 1e-6));
    assert.ok(near(f.h, X.HALF, 1e-4));
    for (const q of X.simulate({ days: 300, lag: X.LIGHT_DAY_PER_AU / k, seed: 1 })) {
      assert.ok(near(X.lateMin(q, f), f.s * (q.D - f.dMean) * 1440, 0.01));
    }
  }
});

test('光の速さ: 時計の誤差が±1分なら3年分で数%以内、光が一瞬なら遅れは見えない', () => {
  const X = trendCore(ROMER, ROMER_NAMES);
  for (const seed of [1, 2, 3]) {
    const f = X.fitLight(X.simulate({ days: THREE_YEARS, lag: X.LIGHT_DAY_PER_AU, noiseMin: 1, seed }));
    assert.ok(Math.abs(X.speedKms(f.s) / 299792.458 - 1) < 0.05, `${seed}: ${X.speedKms(f.s)}`);
    assert.ok(f.se > 0 && !noDelay(f));
    const g = X.fitLight(X.simulate({ days: THREE_YEARS, lag: 0, noiseMin: 1, seed }));
    assert.ok(noDelay(g), `${seed}: ${g.s} ± ${g.se}`);
  }
});

test('光の速さ: 観測が少ないうちや距離がほとんど変わらないうちは求めず、解けない式は null', () => {
  const X = trendCore(ROMER, ROMER_NAMES);
  const obs = X.simulate({ days: THREE_YEARS, lag: X.LIGHT_DAY_PER_AU, seed: 1 });
  assert.equal(X.fitLight(obs.slice(0, 5)), null);
  const close = obs.filter((q) => q.o > 180 && q.o < 215);
  assert.ok(close.length >= 6);
  assert.equal(X.fitLight(close), null);
  assert.equal(X.solve([[1, 2], [2, 4]], [3, 6]), null);
  assert.deepEqual(Array.from(X.solve([[0, 1], [2, 0]], [3, 4])), [2, 3]);
  assert.equal(X.speedKms(0), Infinity);
});

// シグナル（Solid 2.0 の反応の仕組み）
const SOLID = 'tr-20261118-solid-signals';
const tick = () => new Promise((r) => setImmediate(r));

test('シグナル: 道が2本ある所でも1回だけ計算し、同じ値になった所から先へは伝えない', () => {
  const { createGraph } = trendCore(SOLID, ['createGraph']);
  const G = createGraph({ schedule() {} });
  const a = G.signal('a', 1);
  const dbl = G.memo('dbl', () => G.get(a) * 2);
  const inc = G.memo('inc', () => G.get(a) + 1);
  const sum = G.memo('sum', () => G.get(dbl) + G.get(inc));
  const odd = G.memo('odd', () => G.get(a) % 2);
  const label = G.memo('label', () => 'odd' + G.get(odd));
  const seen = [];
  const eff = G.effect('e', () => { seen.push(G.get(sum) + '/' + G.get(label)); });
  G.flush();
  assert.deepEqual(seen, ['4/odd1']);
  G.set(a, 3); G.flush();
  assert.deepEqual(seen, ['4/odd1', '10/odd1']);
  assert.equal(sum.runs, 2);
  assert.equal(odd.runs, 2);
  assert.equal(label.runs, 1);
  // 続けて2回書き込んでも、エフェクトは1回だけ走る
  G.set(a, 4); G.set(a, 5); G.flush();
  assert.equal(eff.runs, 3);
  assert.equal(seen.at(-1), '16/odd1');
  // 同じ値を書いても何も起きない
  assert.equal(G.set(a, 5), false);
  G.flush();
  assert.equal(eff.runs, 3);
  assert.throws(() => G.set(sum, 1));
});

test('シグナル: 読んだ値だけを覚え、今読んでいない値が変わっても計算しない', () => {
  const { createGraph } = trendCore(SOLID, ['createGraph']);
  const G = createGraph({ schedule() {} });
  const on = G.signal('on', false), x = G.signal('x', 1);
  const m = G.memo('m', () => (G.get(on) ? G.get(x) * 10 : 0));
  const eff = G.effect('e', () => G.get(m));
  G.flush();
  assert.deepEqual(Array.from(m.sources, (s) => s.name), ['on']);
  G.set(x, 2); G.flush();
  assert.equal(m.runs, 1);
  assert.equal(eff.runs, 1);
  G.set(on, true); G.flush();
  assert.equal(m.value, 20);
  assert.deepEqual(Array.from(m.sources, (s) => s.name), ['on', 'x']);
  G.set(x, 3); G.flush();
  assert.equal(m.value, 30);
  assert.equal(eff.runs, 3);
});

test('シグナル: Promise を返す計算は、いちばん新しい問い合わせの答えだけを使う', async () => {
  const { createGraph, buildShop, SHIP } = trendCore(SOLID, ['createGraph', 'buildShop', 'SHIP']);
  const asks = [];
  const drops = [];
  const G = createGraph({ schedule() {}, onEvent(e) { if (e.type === 'drop') drops.push(e.value); } });
  const s = buildShop(G, (area) => new Promise((ok) => asks.push(() => ok(SHIP[area]))));
  const seen = [];
  G.effect('画面', () => { const t = G.get(s.total); seen.push(t + (G.isPending(s.ship) ? '…' : '')); });
  G.flush();
  assert.deepEqual(seen, ['null…']);
  assert.equal(asks.length, 1);
  // 答えが来る前に配送先を変えると、問い合わせ直す
  G.set(s.area, 'hokkaido'); G.flush();
  assert.equal(asks.length, 2);
  asks[0](); await tick();
  assert.deepEqual(drops, [SHIP.honshu]);
  assert.equal(s.ship.value, undefined);
  asks[1](); await tick(); G.flush();
  assert.equal(s.ship.value, SHIP.hokkaido);
  assert.equal(seen.at(-1), String(3600 + 360 + SHIP.hokkaido));
  // 送料無料かどうかが変わらなければ、送料は問い合わせ直さない
  G.set(s.qty, 2); G.flush();
  assert.equal(asks.length, 2);
  assert.equal(seen.at(-1), String(2400 + 240 + SHIP.hokkaido));
  // 割引後が 5,000 円以上なら送料は 0 円。そのあと配送先を変えても、送料は計算し直さない
  G.set(s.qty, 9); G.flush();
  assert.equal(seen.at(-1), String(10800 + 1080));
  const runs = s.ship.runs;
  G.set(s.area, 'okinawa'); G.flush();
  assert.equal(s.ship.runs, runs);
  assert.equal(asks.length, 2);
});

test('シグナル: 待っている間に送料無料になったら、届いた古い答えは捨てる', async () => {
  const { createGraph, buildShop, SHIP } = trendCore(SOLID, ['createGraph', 'buildShop', 'SHIP']);
  const asks = [];
  let drops = 0;
  const G = createGraph({ schedule() {}, onEvent(e) { if (e.type === 'drop') drops++; } });
  const s = buildShop(G, (area) => new Promise((ok) => asks.push(() => ok(SHIP[area]))));
  let busy = null;
  G.effect('画面', () => { G.get(s.total); busy = G.isPending(s.ship); });
  G.flush();
  assert.equal(busy, true);
  G.set(s.qty, 9); G.flush();
  assert.equal(busy, false);
  assert.equal(s.total.value, 10800 + 1080);
  asks[0](); await tick(); G.flush();
  assert.equal(drops, 1);
  assert.equal(s.ship.value, 0);
});

// ── 部分評価（2026-11-19） ──
const PEVAL = 'tr-20261119-partial-eval';
const PE_NAMES = ['evaluate', 'specialize', 'emitJS', 'assemble', 'describe', 'POW', 'INTERP', 'MACHINE'];
const compile = (fns, entry, emitJS) => new Function(emitJS(fns, entry) + '\nreturn ' + entry + ';')();

test('部分評価: べき乗の n を先に決めると、x だけを受け取る1つの関数になり、答えは変わらない', () => {
  const { evaluate, specialize, emitJS, POW } = trendCore(PEVAL, PE_NAMES);
  for (const n of [0, 1, 2, 5, 10, 13]) {
    const r = specialize(POW, 'pow', { n });
    const fin = r.stages.at(-1).fns;
    assert.deepEqual(Array.from(r.params), ['x']);
    assert.deepEqual(Object.keys(fin), [r.entry], 'n=' + n);
    const js = emitJS(fin, r.entry);
    assert.ok(!/\bn\b/.test(js), js);
    const f = compile(fin, r.entry, emitJS);
    for (const x of [0, 1, 2, 3, -2]) {
      assert.equal(evaluate(POW, 'pow', [x, n]).value, x ** n);
      assert.equal(evaluate(fin, r.entry, [x]).value, x ** n);
      assert.equal(f(x), x ** n);
    }
  }
});

test('部分評価: x を先に決めて n を後で渡すときは、n で回る関数が残る', () => {
  const { evaluate, specialize, POW } = trendCore(PEVAL, PE_NAMES);
  const r = specialize(POW, 'pow', { x: 3 });
  assert.deepEqual(Array.from(r.params), ['n']);
  for (const st of r.stages) for (let n = 0; n <= 9; n++) assert.equal(evaluate(st.fns, r.entry, [n]).value, 3 ** n);
});

test('部分評価: インタプリタに命令の列を渡すと、命令を読む処理が消えたコードが出来る（第一の二村射影）', () => {
  const { evaluate, specialize, emitJS, assemble, INTERP, MACHINE } = trendCore(PEVAL, PE_NAMES);
  const REF = {
    fact: (n) => { let a = 1; for (let i = 2; i <= n; i++) a *= i; return a; },
    fib: (n) => { let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; },
    sum: (n) => n * (n + 1) / 2,
    pow2: (n) => 2 ** n,
  };
  assert.deepEqual(Object.keys(MACHINE).sort(), Object.keys(REF).sort());
  for (const [key, ref] of Object.entries(REF)) {
    const P = assemble(MACHINE[key].code);
    const r = specialize(INTERP, 'main', { p: P });
    const fin = r.stages.at(-1).fns;
    assert.deepEqual(Array.from(r.params), ['n'], key);
    assert.ok(Object.keys(fin).length <= 2, key + ': ' + Object.keys(fin));
    const js = emitJS(fin, r.entry);
    assert.ok(!/\b(p|pc|op|get|put)\b/.test(js), key + '\n' + js);
    const f = compile(fin, r.entry, emitJS);
    for (let n = 0; n <= 15; n++) {
      const a = evaluate(INTERP, 'main', [P, n]);
      const b = evaluate(fin, r.entry, [n]);
      assert.equal(a.value, ref(n), key + ' n=' + n);
      assert.equal(b.value, ref(n), key + ' n=' + n);
      assert.equal(f(n), ref(n), key + ' n=' + n);
      if (n >= 3) assert.ok(b.steps * 3 < a.steps, `${key} n=${n}: ${b.steps} / ${a.steps}`);
    }
    // 途中の形も、同じ答えを返すプログラムになっている
    for (const st of r.stages) assert.equal(evaluate(st.fns, r.entry, [7]).value, ref(7), key + ' ' + st.label);
  }
});

test('部分評価: 階乗のループは a と n だけを受け取り、使わないレジスタは引数から消える', () => {
  const { specialize, assemble, INTERP, MACHINE } = trendCore(PEVAL, PE_NAMES);
  const r = specialize(INTERP, 'main', { p: assemble(MACHINE.fact.code) });
  const fin = r.stages.at(-1).fns;
  const loop = Object.keys(fin).find((f) => f !== r.entry);
  assert.equal(loop, 'run_1');
  assert.deepEqual(Array.from(fin[loop].params), ['a', 'n']);
  // 作った直後は、命令や呼び出しの組ごとに関数がたくさんある
  assert.ok(Object.keys(r.stages[0].fns).length > 6);
  assert.equal(r.made, Object.keys(r.stages[0].fns).length);
});

test('部分評価: 命令の説明は、レジスタの名前と行き先で書く', () => {
  const { describe } = trendCore(PEVAL, PE_NAMES);
  assert.equal(describe(['SET', 'a', 1]), 'a ← 1');
  assert.equal(describe(['MUL', 'a', 'n']), 'a ← a × n');
  assert.equal(describe(['JZ', 'n', 5]), 'n が 0 なら 5 番へ');
  assert.equal(describe(['RET', 'a']), 'a を答えにする');
});

test('部分評価: 終わらない計算・範囲の外を読む命令の列・増え続ける静的な値はエラーにする', () => {
  const { evaluate, specialize, assemble, INTERP } = trendCore(PEVAL, PE_NAMES);
  // 0 番へ戻り続ける（入力に関係なく止まらない）
  assert.throws(() => evaluate(INTERP, 'main', [assemble([['JMP', 0]]), 3]), /深すぎ|回を超え/);
  // RET の無い命令の列は、最後の命令の次を読もうとする
  assert.throws(() => specialize(INTERP, 'main', { p: assemble([['DEC', 'n']]) }), /範囲の外/);
  assert.throws(() => assemble([['NOP']]), /知らない命令/);
  // 先に分かる値が呼び出しのたびに増えると、作る関数が限りなく増える
  const grow = { f: { params: ['k', 'x'], body: { k: 'call', f: 'f', args: [{ k: 'op', o: '+', a: { k: 'var', n: 'k' }, b: { k: 'num', v: 1 } }, { k: 'var', n: 'x' }] } } };
  assert.throws(() => specialize(grow, 'f', { k: 0 }), /関数が/);
});

const H2 = 'tr-20261119-h2-window-underflow';
const H2_NAMES = ['MAX', 'INIT', 's64', 'newConn', 'queueData', 'sendQueued', 'cancelStream', 'windowUpdate'];

test('送信枠: 元の書き方では、取り消しで上限を超えたあと確かめが通り、符号付きで負になる', () => {
  const { MAX, s64, newConn, queueData, cancelStream, windowUpdate } = trendCore(H2, H2_NAMES);
  let r = queueData(newConn());
  assert.equal(r.kind, 'ok');
  assert.equal(r.len, 16384n);
  assert.equal(r.conn.sw, 49151n);
  r = windowUpdate(r.conn, MAX - r.conn.sw, 1n, 'old');
  assert.equal(r.kind, 'ok');
  assert.equal(r.conn.sw, MAX);
  r = cancelStream(r.conn, 'old');
  assert.equal(r.kind, 'over');
  assert.equal(r.conn.sw, MAX + 16384n);
  // 上限 − 枠 = −16384 が、符号なしでは 2^64 − 16384 になって確かめを通る
  r = windowUpdate(r.conn, MAX, 1n, 'old');
  assert.equal(r.kind, 'ok');
  assert.equal(r.pass, true);
  assert.equal(r.room, (1n << 64n) - 16384n);
  assert.equal(r.conn.sw, 4294983678n);
  r = windowUpdate(r.conn, MAX, 6442450944n, 'old');
  assert.equal(r.kind, 'ok');
  assert.equal(r.accepted, 6442450944n);
  assert.equal(r.conn.sw, 13835058053134696446n);
  assert.equal(s64(r.conn.sw), -4611686020574855170n);
  r = queueData(r.conn);
  assert.equal(r.kind, 'negative');
  assert.ok(r.len < 0n);
});

test('送信枠: 直した書き方では、返すときに上限で止め、超える WINDOW_UPDATE で接続を閉じる', () => {
  const { MAX, newConn, queueData, sendQueued, cancelStream, windowUpdate } = trendCore(H2, H2_NAMES);
  let c = queueData(newConn()).conn;
  c = windowUpdate(c, MAX - c.sw, 1n, 'new').conn;
  let r = cancelStream(c, 'new');
  assert.equal(r.kind, 'capped');
  assert.equal(r.conn.sw, MAX);
  r = windowUpdate(r.conn, MAX, 1n, 'new');
  assert.equal(r.kind, 'rejected');
  assert.equal(r.pass, false);
  assert.equal(r.conn.closed, true);
  assert.equal(windowUpdate(r.conn, 1n, 1n, 'new').kind, 'closed');
  assert.equal(queueData(r.conn).kind, 'closed');
  assert.equal(sendQueued(r.conn).kind, 'closed');
});

test('送信枠: 相手が自分の数えた枠に合わせて増やすなら、元の書き方でも上限を超えない', () => {
  const { MAX, INIT, newConn, queueData, sendQueued, cancelStream, windowUpdate } = trendCore(H2, H2_NAMES);
  let c = queueData(newConn()).conn;
  // 相手はまだ何も受け取っていないので、自分の側の枠は INIT のまま
  c = windowUpdate(c, MAX - INIT, 1n, 'old').conn;
  const r = cancelStream(c, 'old');
  assert.equal(r.kind, 'ok');
  assert.equal(r.conn.sw, MAX);
  // 送り終えた分は返さない
  const s = sendQueued(queueData(newConn()).conn);
  assert.equal(s.amount, 16384n);
  assert.equal(cancelStream(s.conn, 'old').back, 0n);
  // 1,000,000 ずつ 100 万回増やすと、2147 回目までが通り、次で接続を閉じる
  const u = windowUpdate(newConn(), 1000000n, 1000000n, 'old');
  assert.equal(u.kind, 'rejected');
  assert.equal(u.accepted, 2147n);
  assert.throws(() => windowUpdate(newConn(), 0n, 1n, 'old'));
  assert.throws(() => windowUpdate(newConn(), MAX + 1n, 1n, 'old'));
});

test('送信枠: まとめた計算は、1回ずつ確かめたときと同じ答えになる（2^64 で一回りする所も）', () => {
  const { MAX, windowUpdate } = trendCore(H2, H2_NAMES);
  const T = 1n << 64n;
  const slow = (sw, inc, times, mode) => {
    let acc = 0n;
    for (let i = 0n; i < times; i++) {
      const room = mode === 'old' ? BigInt.asUintN(64, MAX - sw) : MAX - sw;
      if (inc > room) return { sw, acc, closed: true };
      sw = BigInt.asUintN(64, sw + inc);
      acc++;
    }
    return { sw, acc, closed: false };
  };
  const starts = [0n, 65535n, MAX - 5n, MAX, MAX + 1n, MAX + 16384n, T - 3n * MAX, T - MAX - 7n, T - 1n];
  const incs = [1n, 65535n, 1000000007n, MAX];
  for (const mode of ['old', 'new']) {
    for (const sw0 of starts) {
      if (mode === 'new' && sw0 > MAX) continue;
      for (const inc of incs) {
        for (const times of [1n, 2n, 5n, 13n]) {
          const want = slow(sw0, inc, times, mode);
          const got = windowUpdate({ sw: sw0, queued: 0n, sent: 0n, closed: false }, inc, times, mode);
          const at = `${mode} sw=${sw0} inc=${inc} times=${times}`;
          assert.equal(got.conn.sw, want.sw, at);
          assert.equal(got.accepted, want.acc, at);
          assert.equal(got.conn.closed, want.closed, at);
        }
      }
    }
  }
});

// 大文字にすると長くなる文字で、領域を1バイト越えて書く（Ruby の ß の脆弱性）
const UPC = 'tr-20261119-upcase-overflow';
const UPC_NAMES = ['SHARP_S', 'SLACK', 'NEIGHBOR', 'toLatin1', 'upcaseAll', 'simulate', 'utf8Len', 'cpLen', 'measure', 'caseInfo'];
const sharps = (k, pre = []) => [...pre, ...Array(k).fill(0xDF)];

test('大文字の変換: ISO-8859-1 で大文字にする。ß は SS、ª º µ ÿ ÷ と ISO-8859-1 に無い文字はそのまま', () => {
  const { toLatin1, upcaseAll } = trendCore(UPC, UPC_NAMES);
  const { bytes, bad } = toLatin1('Straße àªºµÿ÷ あ');
  assert.equal(bad, 1);
  assert.equal(String.fromCharCode(...upcaseAll(bytes)), 'STRASSE Àªºµÿ÷ ?');
});

test('大文字の変換: ß が 21 個だと、元の書き方は2バイト目を領域の外に書き、直した書き方はその手前で止める', () => {
  const { simulate, SLACK, NEIGHBOR } = trendCore(UPC, UPC_NAMES);
  const old = simulate(sharps(21), 'old');
  assert.equal(old.cap, 21 + SLACK);
  assert.equal(old.overflow.length, 1);
  assert.equal(old.overflow[0].pos, old.cap);
  assert.equal(old.overflow[0].before, NEIGHBOR[0]);
  assert.equal(old.overflow[0].byte, 0x53);
  assert.equal(old.used, old.cap + 1);
  assert.equal(old.mem[old.cap], 0x53);
  const fixed = simulate(sharps(21), 'new');
  assert.equal(fixed.overflow.length, 0);
  assert.equal(fixed.end, 'room');
  assert.equal(fixed.consumed, 20);
  assert.equal(fixed.used, 40);
  assert.equal(fixed.mem[fixed.cap], NEIGHBOR[0]);
  assert.throws(() => simulate([], 'other'));
});

test('大文字の変換: ß が 20 個・22 個ならあふれず、23 個や a + ß 21 個ならあふれる', () => {
  const { simulate } = trendCore(UPC, UPC_NAMES);
  const s20 = simulate(sharps(20), 'old');
  assert.equal(s20.overflow.length, 0);
  assert.equal(s20.end, 'done');
  const s22 = simulate(sharps(22), 'old');
  assert.equal(s22.overflow.length, 0);
  assert.equal(s22.end, 'full');
  assert.equal(s22.consumed, 21);
  assert.equal(simulate(sharps(23), 'old').overflow.length, 1);
  assert.equal(simulate(sharps(21, [0x61]), 'old').overflow.length, 1);
  assert.equal(simulate([], 'old').end, 'done');
});

test('大文字の変換: どんな入力でも、元の書き方があふれるのは1バイトまでで、直した書き方は領域の中だけに書く', () => {
  const { simulate, upcaseAll } = trendCore(UPC, UPC_NAMES);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const head = (sim) => Array.from(sim.steps.flatMap((s) => s.writes.map((w) => w.byte)));
  let seen = 0;
  for (let t = 0; t < 500; t++) {
    const n = Math.floor(rnd() * 41);
    const bytes = Array.from({ length: n }, () => (rnd() < 0.75 ? 0xDF : 0x61));
    const o = simulate(bytes, 'old'), w = simulate(bytes, 'new');
    const all = Array.from(upcaseAll(bytes));
    assert.ok(o.overflow.length <= 1);
    assert.equal(w.overflow.length, 0);
    assert.ok(w.used <= w.cap);
    // 書いた分は、全体を大文字にした結果の先頭と同じ
    assert.deepEqual(head(o), all.slice(0, o.used));
    assert.deepEqual(head(w), all.slice(0, w.used));
    // あふれるのは ß が 21 個以上のときだけ
    if (o.overflow.length) { seen++; assert.ok(bytes.filter((b) => b === 0xDF).length >= 21); }
  }
  assert.ok(seen > 0);
});

test('大文字の変換: toUpperCase と toLowerCase で、文字の数や UTF-8 のバイト数が変わる文字を分ける', () => {
  const { caseInfo, measure } = trendCore(UPC, UPC_NAMES);
  const kinds = (cp) => { const r = caseInfo(cp); return r ? Array.from(r.kinds) : []; };
  assert.deepEqual(kinds(0xDF), ['upMore']);       // ß → SS
  assert.deepEqual(kinds(0xFB01), ['upMore']);     // ﬁ → FI
  assert.deepEqual(kinds(0x23F), ['upBytes']);     // ȿ（2バイト）→ Ȿ（3バイト）
  assert.deepEqual(kinds(0x131), ['upFewer']);     // ı → I
  assert.deepEqual(kinds(0x130), ['lowMore']);     // İ → i と結合用の点
  assert.deepEqual(kinds(0x23A), ['lowBytes']);    // Ⱥ → ⱥ
  assert.deepEqual(kinds(0x212A), ['lowFewer']);   // ケルビンの記号 → k
  assert.equal(caseInfo(0x41), null);              // A → a は長さが同じ
  assert.equal(caseInfo(0x3042), null);            // あ は変わらない
  assert.equal(caseInfo(0xD800), null);            // サロゲートは飛ばす
  const m = measure('aß😀');
  assert.equal(m.units, 4);
  assert.equal(m.cps, 3);
  assert.equal(m.bytes, 1 + 2 + 4);
});

const ZINE = 'tr-20261120-one-sheet-zine';
const ZINE_NAMES = ['cycle', 'inspect', 'impose', 'pageMatrix', 'apply', 'GAP', 'H', 'END'];
const plain = (x) => JSON.parse(JSON.stringify(x));

test('折り本: 真ん中の2マスを切った紙は8マスの輪になり、表紙から右へ一周する', () => {
  const { cycle } = trendCore(ZINE, ZINE_NAMES);
  const loop = plain(cycle(4));
  assert.deepEqual(loop, [[1, 1], [1, 2], [1, 3], [0, 3], [0, 2], [0, 1], [0, 0], [1, 0]]);
  // 輪で隣り合う2マスは、紙の上でも隣にあり、切っていない辺でつながっている
  for (let i = 0; i < loop.length; i++) {
    const [r1, c1] = loop[i], [r2, c2] = loop[(i + 1) % loop.length];
    assert.equal(Math.abs(r1 - r2) + Math.abs(c1 - c2), 1);
    if (r1 !== r2) assert.ok(c1 === 0 || c1 === 3, '上下でつながるのは切っていない端の列だけ');
  }
  assert.equal(cycle(4, []), null);            // 切らないと3方向につながるマスができる
  assert.equal(cycle(4, [0, 1, 2, 3]), null);  // 全部切ると上下の2枚に分かれる
  assert.equal(cycle(4, [1]), null);
  assert.equal(cycle(6).length, 12);           // 横6マスなら12ページの輪
});

test('折り本: 切り込みの長さごとに、紙の分かれ方と分かれ道を数える', () => {
  const { inspect } = trendCore(ZINE, ZINE_NAMES);
  assert.deepEqual(plain(inspect(4, [1, 2])), { parts: 1, branch: 0, ends: 0 });
  assert.deepEqual(plain(inspect(4, [])), { parts: 1, branch: 4, ends: 0 });
  assert.deepEqual(plain(inspect(4, [0, 1, 2, 3])), { parts: 2, branch: 0, ends: 4 });
});

test('折り本: 面付けは元の記事の図と同じ。上の段は逆さま、右綴じは左右が入れ替わる', () => {
  const { impose } = trendCore(ZINE, ZINE_NAMES);
  const grid = (binding) => {
    const g = [[], []];
    for (const p of impose(binding)) {
      g[p.row][p.col] = p.name;
      assert.equal(p.rot, p.row === 0 ? 180 : 0);
    }
    return plain(g);
  };
  assert.deepEqual(grid('left'), [['6', '5', '4', '3'], ['裏表紙', '表紙', '1', '2']]);
  assert.deepEqual(grid('right'), [['3', '4', '5', '6'], ['2', '1', '表紙', '裏表紙']]);
});

test('折り本: 折る途中も、輪で隣り合う面の辺は離れない', () => {
  const { pageMatrix, apply, GAP, H } = trendCore(ZINE, ZINE_NAMES);
  const corners = [[0, 0, 0], [1, 0, 0], [0, H, 0], [1, H, 0]];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const binding of ['left', 'right']) {
    for (let k = 0; k < 8; k++) {
      const n = (k + 1) % 8;
      // 広げた紙の上で重なる角の組（共有する辺の両端）を探す
      const pairs = [];
      for (const a of corners) for (const b of corners) {
        if (dist(apply(pageMatrix(k, 0, binding), a), apply(pageMatrix(n, 0, binding), b)) < 1e-9) pairs.push([a, b]);
      }
      assert.equal(pairs.length, 2, `${binding} ${k}-${n}`);
      for (const T of [0.3, 0.7, 1, 1.4, 1.8, 2, 2.5, 3, 3.5, 4.2, 5.5, 7]) {
        for (const [a, b] of pairs) {
          const d = dist(apply(pageMatrix(k, T, binding), a), apply(pageMatrix(n, T, binding), b));
          assert.ok(d <= 2.5 * GAP, `${binding} ${k}-${n} T=${T} 離れた距離 ${d}`);
        }
      }
    }
  }
});

test('折り本: 広げた紙ではどの面も手前を向き、めくると読む順番の見開きが見える', () => {
  const { pageMatrix, impose, apply, H, END } = trendCore(ZINE, ZINE_NAMES);
  const NAMES = ['表紙', '1', '2', '3', '4', '5', '6', '裏表紙'];
  for (const binding of ['left', 'right']) {
    for (const p of impose(binding)) {
      const m = pageMatrix(p.page, 0, binding);
      assert.ok(m[10] > 0.999, '刷った面が手前');
      const c = apply(m, [0.5, H / 2, 0]);
      assert.ok(Math.abs(c[0] - (p.col - 1.5)) < 1e-9 && Math.abs(c[1] - (p.row === 1 ? -H / 2 : H / 2)) < 1e-9);
    }
    // 見開きの左と右で、手前を向いた面のうち一番上（z が大きい）にある面を見る
    const seen = (T) => {
      const side = { left: null, right: null };
      const best = { left: -Infinity, right: -Infinity };
      for (let k = 0; k < 8; k++) {
        const m = pageMatrix(k, T, binding);
        if (m[10] < 0.9) continue;
        const c = apply(m, [0.5, H / 2, 0]);
        const s = c[0] < 0 ? 'left' : 'right';
        if (c[2] > best[s]) { best[s] = c[2]; side[s] = NAMES[k]; }
      }
      return binding === 'left' ? [side.left, side.right] : [side.right, side.left];
    };
    // 左綴じは [左, 右]、右綴じは [右, 左] の順に、読む順番どおりに並ぶ
    assert.deepEqual(seen(3), [null, '表紙'], binding);
    assert.deepEqual(seen(4), ['1', '2'], binding);
    assert.deepEqual(seen(5), ['3', '4'], binding);
    assert.deepEqual(seen(6), ['5', '6'], binding);
    assert.deepEqual(seen(END), ['裏表紙', null], binding);
  }
});

const ZRAM = 'tr-20261120-zram-compress';
const zram = () => trendCore(ZRAM, ['PAGE', 'HUGE', 'compress', 'decompress', 'sequences', 'sameFill', 'makePage', 'PROFILES', 'createSim', 'openTab', 'touchTab', 'stats']);
// 別の realm の Uint8Array どうしでも比べられるように、ふつうの配列にする
const bytes = (a) => Array.from(a);
const roundTrip = (Z, src) => bytes(Z.decompress(Z.compress(src), src.length));

test('zram: 手で作った LZ4 の列を展開する（距離より長い写しは、書いたばかりのバイトを写す）', () => {
  const Z = zram();
  // 印 0x38 = そのまま3バイト・写し 8+4 = 12 バイト、距離 3。印 0x50 = 最後にそのまま5バイト
  const block = Uint8Array.from([0x38, 97, 98, 99, 3, 0, 0x50, 97, 98, 99, 97, 98]);
  assert.equal(String.fromCharCode(...Z.decompress(block, 20)), 'abcabcabcabcabcabcab');
  assert.throws(() => Z.decompress(block, 21));                          // 大きさが合わない
  assert.throws(() => Z.decompress(Uint8Array.from([0x10, 97, 9, 0, 0x00]), 9)); // 書いた量より遠い距離
});

test('zram: どの種類のページも、圧縮して展開すると1バイトも違わずに戻る', () => {
  const Z = zram();
  for (const kind of ['text', 'json', 'heap', 'media', 'zero']) {
    for (let seed = 1; seed <= 5; seed++) {
      const p = Z.makePage(kind, seed);
      assert.equal(p.length, Z.PAGE);
      assert.deepEqual(roundTrip(Z, p), bytes(p), `${kind} ${seed}`);
    }
  }
});

test('zram: 長さを延ばすバイト（15 以上、270 以上）と、短い入力', () => {
  const Z = zram();
  const r = (n) => Uint8Array.from({ length: n }, (_, i) => (Math.imul(i + 1, 2654435761) >>> 24));
  const cases = [new Uint8Array(0), Uint8Array.of(7), new Uint8Array(12).fill(97), new Uint8Array(13).fill(97), r(300), new Uint8Array(1000).fill(5), r(5000)];
  for (const src of cases) assert.deepEqual(roundTrip(Z, src), bytes(src), `長さ ${src.length}`);
  assert.deepEqual(bytes(Z.compress(new Uint8Array(0))), [0]);
  // 1000 バイトの同じ値は、そのまま1バイト + 長い写し1回になる
  const seqs = Z.sequences(Z.compress(new Uint8Array(1000).fill(5)));
  assert.equal(seqs[0].lit, 1);
  assert.equal(seqs[0].off, 1);
  assert.equal(seqs[0].len, 1000 - 1 - 5);
});

test('zram: LZ4 の終わりの決まり（最後の5バイトはそのまま、最後の写しは終わりの12バイトより前で始める）', () => {
  const Z = zram();
  const inputs = [Z.makePage('text', 2), Z.makePage('json', 3), Z.makePage('heap', 4), new Uint8Array(1000).fill(5), new Uint8Array(40).fill(1)];
  for (const src of inputs) {
    const n = src.length, seqs = Z.sequences(Z.compress(src));
    let pos = 0;
    for (const q of seqs) {
      pos += q.lit;
      if (!q.len) continue;
      assert.ok(pos <= n - 12, `写しの始まり ${pos} / ${n}`);
      assert.ok(pos + q.len <= n - 5, `写しの終わり ${pos + q.len} / ${n}`);
      pos += q.len;
    }
    assert.equal(pos, n);
    assert.equal(seqs[seqs.length - 1].len, 0);
  }
});

test('zram: 0 だけのページは同じ値と分かり、画像のページは縮まず、文章は 2 倍以上縮む', () => {
  const Z = zram();
  const zero = Z.makePage('zero', 1);
  assert.equal(Z.sameFill(zero), 0);
  assert.equal(Z.sameFill(new Uint8Array(Z.PAGE).fill(7)), 7);
  zero[Z.PAGE - 1] = 1;
  assert.equal(Z.sameFill(zero), -1);
  assert.ok(Z.compress(Z.makePage('media', 1)).length > Z.HUGE);
  for (const kind of ['text', 'json']) assert.ok(Z.compress(Z.makePage(kind, 1)).length * 2 < Z.PAGE, kind);
});

test('zram: zram なしでは5つ目のタブで一番古いタブが閉じられる', () => {
  const Z = zram();
  const s = Z.createSim(64, 0);
  for (let i = 0; i < 4; i++) Z.openTab(s, Z.PROFILES[i]);
  assert.equal(Z.stats(s).free, 0);
  assert.equal(Z.stats(s).killed, 0);
  Z.openTab(s, Z.PROFILES[4]);
  assert.deepEqual(Array.from(s.tabs, (t) => t.alive), [false, true, true, true, true]);
  assert.equal(Z.stats(s).stored, 0);
});

test('zram: RAM と同じ大きさの zram なら6つ、2倍なら8つまで閉じずに開ける', () => {
  const Z = zram();
  for (const [zcap, fit] of [[64, 6], [128, 8]]) {
    const s = Z.createSim(64, zcap);
    for (let i = 0; i < fit; i++) Z.openTab(s, Z.PROFILES[i % Z.PROFILES.length]);
    const st = Z.stats(s);
    assert.equal(st.alive, fit, `zram ${zcap}`);
    assert.ok(st.ram + st.pool <= 64);
    assert.ok(st.ratio > 1.5, `圧縮率 ${st.ratio}`);
    Z.openTab(s, Z.PROFILES[fit % Z.PROFILES.length]);
    assert.equal(s.tabs[0].alive, false, `zram ${zcap} で ${fit + 1} 個目`);
  }
});

test('zram: 古いタブへ切り替えると全部 RAM に戻り、展開した中身は元と同じ', () => {
  const Z = zram();
  const s = Z.createSim(64, 64);
  for (let i = 0; i < 6; i++) Z.openTab(s, Z.PROFILES[i]);
  assert.ok(s.tabs[0].pages.some((p) => p.where === 'zram'));
  assert.equal(Z.touchTab(s, s.tabs[0]), true);
  assert.ok(s.tabs[0].pages.every((p) => p.where === 'ram'));
  assert.ok(s.ev.in > 0);
  assert.equal(s.ev.ok, s.ev.in);
  assert.equal(s.n.ok, s.n.in);
});

test('zram: でたらめに開いたり切り替えたりしても、RAM と zram の枠を超えず、数が合う', () => {
  const Z = zram();
  for (const zcap of [0, 32, 64, 128]) {
    const s = Z.createSim(64, zcap);
    let r = 12345 + zcap;
    const rand = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let step = 0; step < 60; step++) {
      const alive = s.tabs.filter((t) => t.alive);
      if (alive.length && rand() < 0.45) Z.touchTab(s, alive[(rand() * alive.length) | 0]);
      else Z.openTab(s, Z.PROFILES[(rand() * Z.PROFILES.length) | 0]);
      const st = Z.stats(s);
      assert.ok(st.ram + st.pool <= 64, `zram ${zcap} 手順 ${step}`);
      assert.ok(st.stored <= zcap);
      const live = s.tabs.filter((t) => t.alive).flatMap((t) => t.pages);
      assert.equal(live.filter((p) => p.where === 'ram').length, st.ram);
      assert.equal(live.filter((p) => p.where === 'zram').length, st.stored);
      assert.equal(live.reduce((a, p) => a + (p.z ? p.z.size : 0), 0), st.compr);
    }
    assert.equal(s.n.ok, s.n.in);
  }
});
