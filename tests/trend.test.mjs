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

// jj（Jujutsu）の自動の付け替え
const JJ = 'tr-20261120-jj-auto-rebase';
const jj = () => trendCore(JJ, ['one', 'resolved', 'rebaseLine', 'prefixLen', 'session', 'act', 'byDesc', 'conflicts', 'isEmpty', 'graphRows', 'TOUR', 'hex']);

test('jj: 行は「子 + 新しい親 − 古い親」で付け替え、両方が別の値に変えた行だけが衝突になる', () => {
  const J = jj();
  const plain = (m) => JSON.parse(JSON.stringify(m));
  // 子が変えていない行は、新しい親の値になる
  assert.deepEqual(plain(J.rebaseLine(J.one('a'), J.one('b'), J.one('a'))), { adds: ['b'], removes: [] });
  // 親が変えていない行は、子の値のまま
  assert.deepEqual(plain(J.rebaseLine(J.one('c'), J.one('a'), J.one('a'))), { adds: ['c'], removes: [] });
  // 両方が同じ値に変えたら衝突しない
  assert.deepEqual(plain(J.rebaseLine(J.one('x'), J.one('x'), J.one('a'))), { adds: ['x'], removes: [] });
  // 両方が別の値に変えたら衝突（足す項2つ、引く項1つ。先頭は子の値）
  const m = J.rebaseLine(J.one('c'), J.one('b'), J.one('a'));
  assert.equal(J.resolved(m), false);
  assert.deepEqual(plain(m), { adds: ['c', 'b'], removes: ['a'] });
  // 衝突した親の上へ、その行を変えていない子を付け替えると、子も同じ衝突を持つ
  assert.deepEqual(plain(J.rebaseLine(J.one('a'), m, J.one('a'))), plain(m));
  // 衝突したままの子を元の親へ戻すと、衝突が消える
  assert.deepEqual(plain(J.rebaseLine(m, J.one('a'), J.one('b'))), { adds: ['c'], removes: [] });
});

test('jj: 書き換えても change ID は同じで、コミット ID だけが変わる。main は変えられない。空の @ は離れると捨てられる', () => {
  const J = jj();
  const S = J.session();
  const wc = S.repo.wc, c0 = S.repo.changes[wc].commit;
  assert.ok(J.act(S, { op: 'snap', file: 'main.py', line: 1, text: 'x' }).ok);
  assert.equal(S.repo.wc, wc);
  assert.notEqual(S.repo.changes[wc].commit, c0);
  assert.equal(S.repo.changes[wc].evo.length, 2);
  assert.equal(J.act(S, { op: 'snap', file: 'main.py', line: 1, text: 'x' }).ok, false, '同じ中身なら記録しない');
  const bad = J.act(S, { op: 'edit', id: S.repo.main });
  assert.equal(bad.ok, false);
  assert.match(bad.out[0], /immutable/);
  assert.equal(J.act(S, { op: 'describe', id: S.repo.main, text: 'y' }).ok, false);
  J.act(S, { op: 'new' });
  const empty = S.repo.wc;
  assert.ok(J.isEmpty(S.repo, S.repo.changes[empty]));
  assert.ok(J.act(S, { op: 'new', id: S.repo.main }).ok);
  assert.equal(S.repo.changes[empty], undefined, '空で説明も無い @ は捨てられる');
  assert.ok(S.repo.changes[wc], '中身のある変更は残る');
});

test('jj: undo と redo と op restore は操作の記録の上を行き来する', () => {
  const J = jj();
  const S = J.session();
  const desc = () => S.repo.changes[S.repo.wc].desc;
  J.act(S, { op: 'describe', text: 'a' });
  J.act(S, { op: 'describe', text: 'b' });
  assert.equal(desc(), 'b');
  assert.ok(J.act(S, { op: 'undo' }).ok);
  assert.equal(desc(), 'a');
  assert.ok(J.act(S, { op: 'undo' }).ok);
  assert.equal(desc(), '');
  assert.equal(J.act(S, { op: 'undo' }).ok, false);
  assert.ok(J.act(S, { op: 'redo' }).ok);
  assert.equal(desc(), 'a');
  // undo の後に別の操作をすると、redo はできない
  J.act(S, { op: 'describe', text: 'c' });
  assert.equal(J.act(S, { op: 'redo' }).ok, false);
  // op restore で最初の状態に戻せる。それも1つの操作として残る
  const n = S.hist.ops.length;
  assert.ok(J.act(S, { op: 'restore', i: 0 }).ok);
  assert.equal(desc(), '');
  assert.equal(S.hist.ops.length, n + 1);
  assert.equal(new Set(S.hist.ops.map((o) => o.id)).size, S.hist.ops.length, '操作の ID は重ならない');
});

test('jj: 区別できる最短の頭の文字と、枝分かれしたグラフの列', () => {
  const J = jj();
  assert.equal(J.prefixLen(['kpq', 'kxy', 'royx'], 'kpq'), 2);
  assert.equal(J.prefixLen(['kpq', 'kxy', 'royx'], 'royx'), 1);
  assert.equal(J.prefixLen(['abc', 'abd'], 'abc'), 3);
  assert.match(J.hex('jj', 12), /^[0-9a-f]{12}$/);
  const S = J.session();
  J.act(S, { op: 'describe', text: 'a' });
  J.act(S, { op: 'new', id: S.repo.main });
  const rows = J.graphRows(S.repo);
  assert.deepEqual(Array.from(rows, (x) => x.col), [0, 1, 0]);
  assert.equal(rows[0].id, S.repo.wc);
  assert.equal(rows[2].id, S.repo.main);
});

test('jj: 記事の流れで、税率を直すと上の変更が衝突し、squash で解け、undo・redo・rebase で一本になる', () => {
  const J = jj();
  const S = J.session();
  const res = J.TOUR.map((st) => J.act(S, st));
  res.forEach((r, i) => assert.ok(r.ok, `${i}: ${r.cmd} ${r.out.join(' ')}`));
  // 税率を直した手順: 上に重なった2つを付け替え、「送料を足す」だけが衝突する
  const k = J.TOUR.findIndex((s) => s.op === 'snap' && s.text === '    return round(n * 108)');
  assert.match(res[k].out.join('\n'), /2 個/);
  assert.match(res[k].out.join('\n'), /衝突した変更/);
  // 前の空の @ が自動で捨てられた
  assert.ok(res.some((r) => r.out.some((o) => o.includes('自動で捨てた'))));
  // 最後は一本道: main ← 税込み ← 使い方 ← 送料 ← @、衝突は無い
  const r = S.repo, chain = [];
  for (let c = r.changes[r.wc]; c; c = r.changes[c.parent]) chain.push(c.desc || '@');
  assert.deepEqual(chain, ['@', '送料を足す', '使い方を書く', '税込みにする', '値段の計算を作る']);
  assert.equal(Object.keys(r.changes).length, 5);
  for (const c of Object.values(r.changes)) assert.equal(J.conflicts(c.tree), 0, c.desc);
  const ship = r.changes[J.byDesc(r, '送料を足す')];
  assert.equal(ship.tree['main.py'][1].adds[0], '    return round(n * 108) + 500');
  assert.equal(ship.tree['README.md'][1].adds[0], 'price(n) は n 個の税込みの値段を返す');
  assert.ok(J.graphRows(r).every((x) => x.col === 0));
  // undo で戻した手順の直後は、まだ衝突が残っていた
  const S2 = J.session();
  const u = J.TOUR.findIndex((s) => s.op === 'undo');
  J.TOUR.slice(0, u + 1).forEach((st) => J.act(S2, st));
  assert.equal(J.conflicts(S2.repo.changes[J.byDesc(S2.repo, '送料を足す')].tree), 1);
});

// 一般化リーマン予想の零点（ディリクレの L 関数）
const GRH = 'tr-20261121-grh-zeros';
function grh() {
  return trendCore(GRH, ['makeFn', 'lfun', 'lgamma', 'hardyZ', 'refineZero', 'countZeros', 'mangoldt', 'constTerm', 'psiStep', 'psiWave']);
}
// Z(t) を刻み step で調べ、符号が変わる所の零点を返す
function zerosUpTo(G, f, T, step = 0.1) {
  const out = [];
  let a = 0.05, za = G.hardyZ(a, f)[0];
  for (let i = 1; a + step <= T; i++) {
    const b = 0.05 + i * step, zb = G.hardyZ(b, f)[0];
    if (za * zb < 0) out.push(G.refineZero(f, a, b, za, zb));
    a = b; za = zb;
  }
  return out;
}

test('GRH: 指標の値と偶奇。対応しない法は例外', () => {
  const G = grh();
  assert.deepEqual(Array.from(G.makeFn(5).chi), [0, 1, -1, -1, 1]);
  assert.deepEqual(Array.from(G.makeFn(4).chi), [0, 1, 0, -1]);
  assert.deepEqual([1, 3, 4, 5, 7, 11, 13].map((q) => G.makeFn(q).kappa), [0, 1, 1, 0, 1, 1, 0]);
  assert.throws(() => G.makeFn(6));
  assert.throws(() => G.makeFn(9));
});

test('GRH: L 関数と log Γ の値が、知られている値と合う', () => {
  const G = grh();
  const z = G.makeFn(1), c4 = G.makeFn(4), c3 = G.makeFn(3);
  assert.ok(near(G.lfun([0.5, 0], z)[0], -1.4603545088095868, 1e-10));
  assert.ok(near(G.lfun([2, 0], z)[0], Math.PI ** 2 / 6, 1e-12));
  assert.ok(near(G.lfun([0, 0], z)[0], -0.5, 1e-12));
  assert.ok(near(G.lfun([0, 0], c4)[0], 0.5, 1e-12));
  assert.ok(near(G.lfun([0, 0], c3)[0], 1 / 3, 1e-12));
  assert.ok(near(G.lfun([1.5, 0], c4)[0], 0.8645026534612020, 1e-10));   // β(3/2)
  const lg = G.lgamma([1, 1]);
  assert.ok(near(lg[0], -0.6509231993018563, 1e-12) && near(lg[1], -0.3016403204675331, 1e-12));
  assert.ok(near(G.lgamma([0.5, 0])[0], Math.log(Math.sqrt(Math.PI)), 1e-12));
});

test('GRH: Z(t) は実数で、零点が知られている値と 10 桁合う', () => {
  const G = grh();
  for (const q of [1, 3, 4, 5, 7, 11, 13]) {
    const f = G.makeFn(q);
    for (const t of [3.3, 17.7, 42.1, 99.9]) assert.ok(Math.abs(G.hardyZ(t, f)[1]) < 1e-8, `q=${q} t=${t}`);
  }
  const zeta = zerosUpTo(G, G.makeFn(1), 50);
  const want = [14.134725141734693, 21.022039638771555, 25.010857580145688, 30.424876125859513, 32.935061587739189,
    37.586178158825671, 40.918719012147495, 43.327073280914999, 48.005150881167159, 49.773832477672302];
  assert.equal(zeta.length, want.length);
  zeta.forEach((g, i) => assert.ok(near(g, want[i], 1e-8), `ζ ${i}: ${g}`));
  const c4 = zerosUpTo(G, G.makeFn(4), 13.5);
  [6.020948904697597, 10.243770304166555, 12.988098012312424].forEach((w, i) => assert.ok(near(c4[i], w, 1e-8), `χ4 ${i}: ${c4[i]}`));
  assert.ok(near(zerosUpTo(G, G.makeFn(3), 9)[0], 8.039737155681468, 1e-8));
});

test('GRH: 偏角の原理の数は整数になり、臨界線の上の零点の数と同じ', () => {
  const G = grh();
  assert.ok(near(G.countZeros(G.makeFn(1), 50), 10, 1e-6));
  assert.ok(near(G.countZeros(G.makeFn(4), 20), 5, 1e-6));
  for (const q of [1, 5, 13]) {
    const f = G.makeFn(q), n = G.countZeros(f, 60.3);
    assert.ok(Math.abs(n - Math.round(n)) < 1e-6, `q=${q}: ${n}`);
    assert.equal(zerosUpTo(G, f, 60.3).length, Math.round(n), `q=${q}`);
  }
});

test('GRH: Λ(n)、明示公式の定数、零点の波の和が素数の階段に近づく', () => {
  const G = grh();
  const lam = G.mangoldt(100);
  assert.ok(near(lam[8], Math.log(2)) && near(lam[9], Math.log(3)) && near(lam[97], Math.log(97)));
  assert.equal(lam[6], 0);
  assert.equal(lam[1], 0);
  // L'/L(0, χ4) = −log 4 + 2 log(Γ(1/4) / Γ(3/4))
  assert.ok(near(G.constTerm(G.makeFn(4)), -Math.log(4) + 2 * Math.log(3.6256099082219083 / 1.2254167024651776), 1e-7));
  assert.ok(near(G.constTerm(G.makeFn(1)), Math.log(2 * Math.PI)));
  for (const q of [1, 3, 5]) {
    const f = G.makeFn(q), gam = zerosUpTo(G, f, 100), c0 = G.constTerm(f);
    // 階段の段の真ん中では、零点を多く使った波の和が階段に近い。零点を使わないと遠い
    let far = 0;
    for (const x of [10.5, 20.5, 30.5]) {
      const want = G.psiStep(x, f, lam);
      assert.ok(Math.abs(G.psiWave(x, f, gam, gam.length, c0) - want) < 0.45, `q=${q} x=${x}`);
      far = Math.max(far, Math.abs(G.psiWave(x, f, gam, 0, c0) - want));
    }
    assert.ok(far > 0.5, `q=${q}`);
    // 広い範囲で平均すると、差はほぼ 0（定数の項が正しい）
    let s = 0, n = 0;
    for (let x = 3.01; x < 40; x += 0.037) { s += G.psiStep(x, f, lam) - G.psiWave(x, f, gam, gam.length, c0); n++; }
    assert.ok(Math.abs(s / n) < 0.03, `q=${q} 平均 ${s / n}`);
  }
});

// ---- skiplist と B+ 木（Valkey 9.2 の sorted set） ----
const VALKEY = 'tr-20261121-skiplist-btree';
const valkey = () => trendCore(VALKEY, ['rng', 'makeKeys', 'skipNew', 'skipInsert', 'skipRanks', 'skipSearch', 'skipHas', 'skipBytes',
  'btNew', 'btInsert', 'btLevels', 'btSearch', 'btHas', 'btFill', 'btBytes', 'sampleAvg', 'fish']);
function buildBoth(X, n, F, ord, seed) {
  const r = X.rng(seed);
  const keys = X.makeKeys(n, ord, r);
  const sl = X.skipNew(), bt = X.btNew(F);
  for (const k of keys) { X.skipInsert(sl, k, r); assert.equal(X.btInsert(bt, k), true); }
  return { sl, bt, nodes: X.skipRanks(sl), levels: X.btLevels(bt) };
}

test('skiplist と B+ 木: どちらも全部の値を小さい順に持ち、全部を見つける', () => {
  const X = valkey();
  for (const [n, F, ord] of [[1, 4, 'seq'], [61, 4, 'rand'], [500, 8, 'seq'], [2000, 16, 'rand'], [3721, 61, 'rand'], [3721, 61, 'seq']]) {
    const tag = `n=${n} F=${F} ${ord}`;
    const { sl, bt, nodes, levels } = buildBoth(X, n, F, ord, n * 7 + F);
    const want = Array.from({ length: n }, (_, i) => i);
    assert.deepEqual(Array.from(nodes, (x) => x.key), want, tag);
    assert.deepEqual(Array.from(nodes, (x) => x.rank), want, tag);
    // 葉はすべて同じ深さにあり、並べると 0〜n−1 になる。どのノードも F を超えない
    const leaves = levels[levels.length - 1];
    assert.ok(leaves.every((x) => x.leaf), tag);
    assert.ok(levels.slice(0, -1).every((row) => row.every((x) => !x.leaf)), tag);
    assert.deepEqual(Array.from(leaves.flatMap((x) => x.keys)), want, tag);
    for (const row of levels) {
      for (const x of row) {
        if (x.leaf) assert.ok(x.keys.length >= 1 && x.keys.length <= F, tag);
        else {
          assert.ok(x.kids.length >= 1 && x.kids.length <= F, tag);
          assert.equal(x.keys.length, x.kids.length - 1, tag);
          assert.equal(x.lo, x.kids[0].lo, tag);
          assert.equal(x.hi, x.kids[x.kids.length - 1].hi, tag);
        }
      }
    }
    assert.equal(bt.n, n, tag);
    assert.equal(bt.depth, levels.length, tag);
    for (let k = 0; k < n; k++) {
      const a = X.skipSearch(sl, k), b = X.btSearch(bt, k);
      assert.ok(a.found && b.found && X.skipHas(sl, k) && X.btHas(bt, k), `${tag} k=${k}`);
      assert.equal(b.reads, levels.length, tag);
      assert.ok(a.reads >= 2 && a.reads <= a.cmps + 1, tag);
    }
    assert.equal(X.skipHas(sl, n), false, tag);
    assert.equal(X.btHas(bt, -1), false, tag);
    assert.equal(X.btSearch(bt, n + 5).found, false, tag);
    assert.equal(X.btInsert(bt, 0), false, `${tag} 同じ値は入れない`);
  }
});

test('B+ 木: 小さい順に入れると葉が満杯で並び、ばらばらだと 7 割ほど。メモリの見積もりも記事に近い', () => {
  const X = valkey();
  const seq = buildBoth(X, 3721, 61, 'seq', 1);
  const leaves = seq.levels[seq.levels.length - 1];
  assert.equal(leaves.length, 61);
  assert.equal(seq.levels.length, 2);
  assert.equal(X.btFill(seq.levels, 61), 1);
  const rnd = buildBoth(X, 20000, 61, 'rand', 2);
  const fill = X.btFill(rnd.levels, 61);
  assert.ok(fill > 0.6 && fill < 0.8, `ばらばら ${fill}`);
  // 並べるための分: skiplist は約 37 バイト、B+ 木は約 17 バイト（小さい順）と約 20 バイト（ばらばら）
  const sb = X.skipBytes(rnd.nodes);
  assert.ok(sb.avgLv > 1.28 && sb.avgLv < 1.39, `平均の段 ${sb.avgLv}`);
  assert.ok(Math.abs(sb.bytes - (16 + 16 * sb.avgLv)) < 1e-9);
  const bSeq = X.btBytes(seq.levels, 3721, 61), bRnd = X.btBytes(rnd.levels, 20000, 61);
  assert.ok(bSeq > 16 && bSeq < 17.5, `小さい順 ${bSeq}`);
  assert.ok(bRnd > bSeq + 2 && bRnd < bSeq + 6, `ばらばら ${bRnd}`);
  assert.ok(sb.bytes - bRnd > 14, '差は 20 バイトほど');
});

test('B+ 木は skiplist より読む塊がずっと少なく、比べる回数の差は小さい', () => {
  const X = valkey();
  const { sl, bt } = buildBoth(X, 3721, 61, 'rand', 3);
  const A = X.sampleAvg(sl, bt, 3721, 400, X.rng(99));
  assert.ok(A.br >= 2 && A.br <= 3, `B+ 木 ${A.br}`);
  assert.ok(A.sr > 12 && A.sr < 30, `skiplist ${A.sr}`);
  assert.ok(A.sr / A.br > 4, '塊の数は 4 倍より大きく違う');
  assert.ok(A.sc / A.bc < 2.5, `比べた回数 ${A.sc} と ${A.bc}`);
});

test('目当ての近くを広げる横軸: 両端は 0 と 1、目当ては元の位置、途中は単調に増える', () => {
  const { fish } = valkey();
  for (const [c, n] of [[0.5, 61], [30.5, 61], [60.5, 61], [12345.5, 100000], [0, 10], [10, 10]]) {
    assert.ok(Math.abs(fish(0, c, n, 1) - 0) < 1e-12, `c=${c}`);
    assert.ok(Math.abs(fish(n, c, n, 1) - 1) < 1e-12, `c=${c}`);
    assert.ok(Math.abs(fish(c, c, n, 1) - c / n) < 1e-12, `c=${c}`);
    let prev = -1;
    for (let i = 0; i <= 400; i++) {
      const v = fish(n * i / 400, c, n, 1);
      assert.ok(Number.isFinite(v) && v >= prev - 1e-12, `c=${c} i=${i}`);
      prev = v;
    }
  }
  // 目当てのすぐ隣は、ふつうの横軸より大きく離れる
  const n = 100000, c = 50000.5;
  assert.ok(fish(c + 1, c, n, 1) - fish(c, c, n, 1) > 100 / n);
  assert.equal(fish(5, 3, 0, 1), 0);
});

const INETS = 'tr-20261121-interaction-nets';

test('interaction nets: 式を読んで値を出し、読めない式は断る', () => {
  const { parseExpr, evalTree, showTree } = trendCore(INETS, ['parseExpr', 'evalTree', 'showTree']);
  assert.equal(evalTree(parseExpr('2+3')), 5);
  assert.equal(evalTree(parseExpr('2 × 3 + 4')), 10);
  assert.equal(evalTree(parseExpr('(1+2)*(2+2)')), 12);
  assert.equal(evalTree(parseExpr('２＋３')), 5);
  assert.equal(showTree(parseExpr('(1+2)*(2+2)')), '(1 + 2) × (2 + 2)');
  assert.equal(showTree(parseExpr('1+(2+3)')), '1 + (2 + 3)');
  assert.equal(showTree(parseExpr('1+2+3')), '1 + 2 + 3');
  for (const bad of ['', '2+', 'abc', '(1+2', '21', '9*9', '2**3', '1+2)']) assert.throws(() => parseExpr(bad), bad);
});

test('interaction nets: 小さな式の書き換えの回数', () => {
  const { parseExpr, runAll } = trendCore(INETS, ['parseExpr', 'runAll']);
  const n = (s) => runAll(parseExpr(s), 'fifo', {}).interactions;
  assert.equal(n('0+3'), 1);   // ＋ と 0 だけ
  assert.equal(n('1+1'), 2);   // ＋ と +1、＋ と 0
  assert.equal(n('3+4'), 4);   // 1つ目の数の +1 の数と、最後の 0
  assert.equal(n('0*5'), 7);   // × と 0、ε が +1 を5つと 0 を消す
});

test('interaction nets: どの順番で書き換えても、答えと書き換えの回数は同じ', () => {
  const { parseExpr, evalTree, runAll } = trendCore(INETS, ['parseExpr', 'evalTree', 'runAll']);
  for (const s of ['0+3', '1+1', '2*2', '0*5', '5*0', '2*3+3*2', '(1+2)*(2+2)', '3*3*3', '4*(0+1)*2', '(2*3)*(1+2)+3*3']) {
    const t = parseExpr(s), want = evalTree(t);
    const base = runAll(t, 'fifo', {});
    assert.equal(base.value, want, s);
    assert.equal(base.steps, base.interactions, s);
    assert.equal(base.nodes, want + 2, s);   // 最後は 答・+1 の列・0 だけが残る
    const par = runAll(t, 'par', {});
    const tiles = [1, 2, 4, 16].map((k) => runAll(t, 'tiles', { k }));
    const rands = [1, 2, 3].map((seed) => runAll(t, 'rand', { seed }));
    for (const r of [par, ...tiles, ...rands]) {
      assert.equal(r.value, want, s);
      assert.equal(r.interactions, base.interactions, s);
      assert.equal(r.nodes, want + 2, s);
    }
    assert.equal(tiles[0].steps, base.interactions, s);   // タイル 1 枚は1つずつと同じ
    for (const r of tiles) assert.ok(r.steps >= par.steps && r.steps <= base.interactions, s);
  }
});

test('interaction nets: 同時に書き換える組は節点を共有せず、答えは上から先に出てくる', () => {
  const { parseExpr, makeRunner, decode } = trendCore(INETS, ['parseExpr', 'makeRunner', 'decode']);
  const R = makeRunner(parseExpr('(2*3)*(1+2)+3*3'), 'par', {});
  let most = 0;
  while (!R.done()) {
    const did = R.step(), seen = new Set();
    for (const d of did) {
      assert.ok(!seen.has(d.a) && !seen.has(d.b));
      seen.add(d.a); seen.add(d.b);
    }
    most = Math.max(most, did.length);
  }
  assert.ok(most >= 3);
  const Q = makeRunner(parseExpr('3+4'), 'fifo', {});
  Q.step();
  const p = decode(Q.net);
  assert.equal(p.v, 1);
  assert.equal(p.done, false);
});

test('interaction nets: タイルは隣からしか仕事をもらえない', () => {
  const { parseExpr, makeRunner } = trendCore(INETS, ['parseExpr', 'makeRunner']);
  const R = makeRunner(parseExpr('2*3+3*2+(1+1)*(2+2)'), 'tiles', { k: 16 });
  assert.deepEqual(Array.from(R.nb(0)).sort((a, b) => a - b), [1, 4]);
  assert.deepEqual(Array.from(R.nb(5)).sort((a, b) => a - b), [1, 4, 6, 9]);
  assert.ok(R.pending() >= 3);
  const first = R.step();
  // 最初の仕事は全部タイル 0 にあるので、1手目に動けるのはタイル 0 とその隣の 1 と 4 だけ
  assert.ok(first.length <= 3);
  for (const d of first) assert.ok([0, 1, 4].includes(d.tile));
  assert.equal(first.find((d) => d.tile === 0).how, 'own');
  assert.equal(R.tiles.length, 16);
});

// ---- 量子化のビット配分（LookAtMyQuant） ----
const MQ = 'tr-20261122-mixed-quant';
const MQ_NAMES = ['rng', 'makeSpiral', 'initNet', 'cloneNet', 'makeActs', 'forward', 'makeTrainer', 'makePieces', 'pieceBits', 'quantize', 'applyPlan', 'planBits', 'fullBits', 'weightCount', 'compare', 'damageMeter', 'damageTable', 'allocate'];

test('量子化: 0 ビットは全部 0、段の数は 2^b 以下、ビットを増やすと誤差は増えない', () => {
  const { quantize, rng } = trendCore(MQ, MQ_NAMES);
  const r = rng(5);
  const vals = Float64Array.from({ length: 32 }, () => (r() - 0.5) * 3);
  const z = quantize(vals, 0);
  assert.ok(z.q.every((x) => x === 0));
  assert.ok(near(z.mse, vals.reduce((s, x) => s + x * x, 0) / 32));
  let prev = Infinity;
  const amax = Math.max(...vals.map(Math.abs));
  for (const b of [1, 2, 3, 4, 6, 8]) {
    const { q, mse } = quantize(vals, b);
    assert.ok(new Set(q).size <= 2 ** b, `${b} ビット`);
    assert.ok(q.every((x) => Math.abs(x) <= amax + 1e-12), `${b} ビット`);
    assert.ok(mse <= prev + 1e-15, `${b} ビット`);
    prev = mse;
  }
  assert.ok(prev < 1e-4);
  assert.equal(quantize(new Float64Array(4), 3).mse, 0);
});

test('量子化: 部品は 32 個ずつ 69 個で、どの重みもちょうど1回ずつ入る。大きさの数え方', () => {
  const { initNet, makePieces, planBits, fullBits, weightCount, pieceBits } = trendCore(MQ, MQ_NAMES);
  const net = initNet(1);
  const pcs = makePieces(net);
  assert.equal(pcs.length, 69);
  assert.ok(pcs.every((p) => p.idx.length === 32));
  net.forEach((L, l) => {
    const seen = new Int32Array(L.W.length);
    for (const p of pcs) if (p.layer === l) for (const i of p.idx) seen[i]++;
    assert.ok(seen.every((c) => c === 1), `層 ${l}`);
  });
  assert.equal(weightCount(net), 2208);
  assert.equal(fullBits(net), (2208 + 99) * 16);
  assert.equal(pieceBits(32, 0), 0);
  assert.equal(pieceBits(32, 3), 32 * 3 + 16);
  for (const b of [1, 2, 3, 4]) assert.equal(planBits(net, pcs, pcs.map(() => b)), 2208 * (b + 0.5) + 99 * 16);
});

test('量子化: 配分の動的計画法は、総当たりと同じ最小の悪化を予算の中で見つける', () => {
  const { allocate, rng } = trendCore(MQ, MQ_NAMES);
  const r = rng(11);
  const opts = [0, 1, 2, 4];
  for (let trial = 0; trial < 30; trial++) {
    const N = 4;
    const table = Array.from({ length: N }, () => {
      let d = 1 + r() * 3;
      return Float64Array.from(opts, () => (d *= 0.2 + r() * 0.6));
    });
    const costs = table.map(() => opts.map((b) => (b ? 32 * b + 16 : 0)));
    const allowed = opts.map((b) => trial % 3 !== 0 || b > 0);
    const budget = Math.floor(r() * 600);
    let best = Infinity;
    const rec = (i, used, dmg) => {
      if (used > budget) return;
      if (i === N) { best = Math.min(best, dmg); return; }
      opts.forEach((_, k) => { if (allowed[k]) rec(i + 1, used + costs[i][k], dmg + table[i][k]); });
    };
    rec(0, 0, 0);
    const a = allocate(table, costs, budget, allowed);
    if (best === Infinity) { assert.equal(a, null); continue; }
    assert.ok(near(a.predicted, best), `試し ${trial}`);
    let used = 0, dmg = 0;
    a.choice.forEach((k, i) => { assert.ok(allowed[k]); used += costs[i][k]; dmg += table[i][k]; });
    assert.ok(used <= budget);
    assert.equal(used, a.bits);
    assert.ok(near(dmg, a.predicted));
  }
  assert.equal(allocate([Float64Array.of(1)], [[16]], -5), null);
  assert.throws(() => allocate([Float64Array.of(1)], [[10]], 100));
});

test('量子化: 悪化の測り方（後ろだけ計算し直す）は、部品を1つ量子化して全部流した KL と一致する', () => {
  const { initNet, makeSpiral, makePieces, damageMeter, quantize, cloneNet, compare } = trendCore(MQ, MQ_NAMES);
  const net = initNet(3);
  const calib = makeSpiral(4, 10);
  const pcs = makePieces(net);
  const bits = [0, 1, 3];
  const m = damageMeter(net, pcs, calib, bits);
  for (const pi of [0, 1, 2, 40, 67, 68]) {
    m.measure(pi);
    const pc = pcs[pi];
    bits.forEach((b, bi) => {
      const vals = Float64Array.from(pc.idx, (i) => net[pc.layer].W[i]);
      const qn = cloneNet(net);
      const { q } = quantize(vals, b);
      pc.idx.forEach((wi, k) => { qn[pc.layer].W[wi] = q[k]; });
      assert.ok(near(m.table[pi][bi], compare(net, qn, calib).kl, 1e-9), `部品 ${pi}・${b} ビット`);
    });
  }
});

test('量子化: 学習すると見分けられるようになり、同じ大きさなら配分した方が元に近い', () => {
  const { initNet, makeSpiral, makeTrainer, makePieces, damageTable, applyPlan, planBits, fullBits, weightCount, pieceBits, allocate, compare } = trendCore(MQ, MQ_NAMES);
  const train = makeSpiral(1, 120), test = makeSpiral(1001, 120);
  const net = initNet(1);
  const tr = makeTrainer(net, train, 1);
  const first = tr.step(50, 0.01);
  while (tr.t < 1600) tr.step(50, tr.t < 1000 ? 0.01 : 0.003);
  const last = tr.step(1, 0.003);
  assert.ok(last < first);
  assert.ok(compare(net, net, test).acc > 0.95);
  const BITS = [0, 1, 2, 3, 4, 6, 8];
  const pcs = makePieces(net);
  const { table } = damageTable(net, pcs, train, BITS);
  const costs = pcs.map((p) => BITS.map((b) => pieceBits(p.idx.length, b)));
  const fixed = fullBits(net) - weightCount(net) * 16;
  for (const b of [1, 2, 3]) {
    const uplan = pcs.map(() => b);
    const ubits = planBits(net, pcs, uplan);
    const a = allocate(table, costs, ubits - fixed);
    const plan = Array.from(a.choice, (k) => BITS[k]);
    assert.ok(planBits(net, pcs, plan) <= ubits);
    const u = compare(net, applyPlan(net, pcs, uplan), test);
    const al = compare(net, applyPlan(net, pcs, plan), test);
    assert.ok(al.kl < u.kl, `${b} ビット`);
    assert.ok(al.acc >= u.acc, `${b} ビット`);
  }
});

// ---- モデル検査（tr-20261122-model-check） ----
const MC = 'tr-20261122-model-check';

test('モデル検査: 直したチケット販売は、記事の TLC と同じ 29 通りの状態（作った状態 55）で、違反も行き詰まりもない', () => {
  const { SPECS, explore } = trendCore(MC, ['SPECS', 'explore']);
  const g = explore(SPECS.ticket, 'fix');
  assert.equal(g.nodes.length, 29);
  assert.equal(g.generated, 55);
  assert.equal(g.bad.length, 0);
  assert.equal(g.stuck.length, 0);
  // 全員が終わった状態では、売れた枚数はちょうど 2 枚
  for (const i of g.ends) assert.equal(g.nodes[i].sold, 2);
});

test('モデル検査: 元のチケット販売は、3 人が確認してから 3 人が確定する 6 手で 3 枚売れる', () => {
  const { SPECS, explore, pathTo } = trendCore(MC, ['SPECS', 'explore', 'pathTo']);
  const g = explore(SPECS.ticket, 'bug');
  assert.ok(g.bad.length > 0);
  const p = pathTo(g, g.bad[0]);
  assert.equal(p.length - 1, 6);
  const last = g.nodes[p[p.length - 1]];
  assert.equal(last.sold, 3);
  assert.equal(last.stock, -1);
  // 幅優先なので、最初に見つけた違反がいちばん短い
  for (const i of g.bad) assert.ok(g.depth[i] >= g.depth[g.bad[0]]);
});

test('モデル検査: 手順は最初の状態から 1 手ずつ、実際にある操作でつながる', () => {
  const { SPECS, explore, pathTo } = trendCore(MC, ['SPECS', 'explore', 'pathTo']);
  for (const [name, sp] of Object.entries(SPECS)) {
    for (const v of sp.versions) {
      const g = explore(sp, v.id);
      const has = new Set(g.edges.map(([a, b]) => a + '>' + b));
      for (let i = 0; i < g.nodes.length; i++) {
        const p = pathTo(g, i);
        assert.equal(p[0], 0, `${name}/${v.id}`);
        assert.equal(p.length - 1, g.depth[i], `${name}/${v.id}`);
        for (let k = 0; k + 1 < p.length; k++) assert.ok(has.has(p[k] + '>' + p[k + 1]), `${name}/${v.id}`);
      }
    }
  }
});

test('モデル検査: 送金は、読んでから書くと合計が 100 円から変わり、1 回で足し引きすると変わらない', () => {
  const { SPECS, explore } = trendCore(MC, ['SPECS', 'explore']);
  const bug = explore(SPECS.bank, 'bug');
  const sums = new Set(bug.bad.map((i) => bug.nodes[i].x + bug.nodes[i].y));
  assert.ok(bug.bad.length > 0);
  assert.ok(!sums.has(100));
  assert.ok(sums.has(130) && sums.has(50));   // 増えることも、減ることもある
  const fix = explore(SPECS.bank, 'fix');
  assert.equal(fix.bad.length, 0);
  assert.equal(fix.ends.length, 1);
  const end = fix.nodes[fix.ends[0]];
  assert.deepEqual([end.x, end.y], [20, 80]);
});

test('モデル検査: 部屋の札は、見てから立てると 2 人とも入れ、立ててから見ると行き詰まり、ピーターソンの方法はどちらも無い', () => {
  const { SPECS, explore, pathTo } = trendCore(MC, ['SPECS', 'explore', 'pathTo']);
  const look = explore(SPECS.room, 'look');
  assert.ok(look.bad.length > 0);
  assert.equal(look.stuck.length, 0);
  assert.equal(pathTo(look, look.bad[0]).length - 1, 4);
  const flag = explore(SPECS.room, 'flag');
  assert.equal(flag.bad.length, 0);
  assert.ok(flag.stuck.length > 0);
  assert.equal(pathTo(flag, flag.stuck[0]).length - 1, 2);
  const pet = explore(SPECS.room, 'peterson');
  assert.equal(pet.bad.length, 0);
  assert.equal(pet.stuck.length, 0);
});

test('モデル検査: ランダムな実行は、同じ種なら同じ手順になり、通った状態は全部を調べた状態に含まれる', () => {
  const { SPECS, explore, simulate } = trendCore(MC, ['SPECS', 'explore', 'simulate']);
  const sig = (r) => r.kind + '|' + r.t + '|' + r.trace.map((x) => x.act).join('/');
  for (const [name, sp] of Object.entries(SPECS)) {
    for (const v of sp.versions) {
      const a = simulate(sp, v.id, 7, 50, sp.steps), b = simulate(sp, v.id, 7, 50, sp.steps);
      assert.equal(sig(a), sig(b), `${name}/${v.id}`);
      const g = explore(sp, v.id);
      for (const k of a.seen) assert.ok(g.index.has(k), `${name}/${v.id}`);
      // 違反の無い書き方では、ランダムでも違反は出ない
      if (!g.bad.length && !g.stuck.length) assert.equal(a.kind, 'ok', `${name}/${v.id}`);
    }
  }
  // 元のチケット販売は、200 本のうちどこかで違反が見つかる
  assert.equal(simulate(SPECS.ticket, 'bug', 1, 200, SPECS.ticket.steps).kind, 'bad');
});

// パンに塗って具を載せる（Sandwich Simulator）
const SANDWICH = 'tr-20261122-spread-stack';
const SW_NAMES = ['KNIFE', 'breadPoly', 'makeGrid', 'stroke', 'takeFromPot', 'coverage', 'SHAPES', 'samplesOf', 'posed', 'convexHull', 'inHull', 'judge', 'settle', 'inPoly'];
const swTotal = (G, K) => G.t.reduce((s, v) => s + v, 0) + K.load;

test('塗る: 塗っても、空のナイフでならしても、パンとナイフの塗り物の合計は変わらない', () => {
  const X = trendCore(SANDWICH, SW_NAMES);
  const G = X.makeGrid(2, X.breadPoly(5)), K = { load: 0, r: 0, g: 0, b: 0 };
  assert.equal(X.takeFromPot(K, [1, 0.8, 0.4]), X.KNIFE.full);
  const before = swTotal(G, K);
  X.stroke(G, K, 90, 80, 310, 84);
  X.stroke(G, K, 310, 120, 90, 124);
  X.stroke(G, K, 200, 50, 205, 250);
  K.load = 0;   // ナイフを空にして（量を捨てたので、合計を取り直す）
  const empty = swTotal(G, K);
  for (let y = 70; y < 250; y += 15) X.stroke(G, K, 80, y, 320, y + 3);
  assert.ok(Math.abs(swTotal(G, K) - empty) / empty < 1e-6);
  assert.ok(before > empty);
});

test('塗る: 量が減るほど薄く塗り、止まっていると塗れない', () => {
  const X = trendCore(SANDWICH, SW_NAMES);
  const G = X.makeGrid(2, null), K = { load: 0, r: 0, g: 0, b: 0 };
  X.takeFromPot(K, [1, 1, 1]);
  assert.equal(X.stroke(G, K, 150, 150, 150, 150), 0);
  assert.equal(G.t.reduce((s, v) => s + v, 0), 0);
  const at = (x, y) => G.t[Math.floor((y - G.oy) / G.cell) * G.w + Math.floor((x - G.ox) / G.cell)];
  let prev = K.load;
  for (let x = 70; x < 330; x += 2) {
    X.stroke(G, K, x, 150, x + 2, 150);
    assert.ok(K.load <= prev + 1e-9);   // 何も無いパンの上では、ナイフの量は増えない
    prev = K.load;
  }
  assert.ok(at(80, 150) > at(320, 150) + 0.1, `${at(80, 150)} > ${at(320, 150)}`);
  assert.ok(at(320, 150) > 0);
});

test('塗る: 空のナイフで厚い所をなでると、塗り物が先へ伸びて山が低くなる。色も運ばれる', () => {
  const X = trendCore(SANDWICH, SW_NAMES);
  const G = X.makeGrid(2, null), K = { load: 0, r: 0, g: 0, b: 0 };
  const idx = (x, y) => Math.floor((y - G.oy) / G.cell) * G.w + Math.floor((x - G.ox) / G.cell);
  for (let x = 140; x < 160; x += 2) for (let y = 140; y < 160; y += 2) { const k = idx(x, y); G.t[k] = 3; G.r[k] = 0.7; G.g[k] = 0.1; G.b[k] = 0.1; }
  const total = swTotal(G, K);
  for (let x = 130; x < 250; x += 2) X.stroke(G, K, x, 150, x + 2, 150);
  assert.ok(G.t[idx(150, 150)] < 3);
  // 山（x が 140〜160）の外の、まだ何も無かった所まで伸びる
  assert.ok(G.t[idx(175, 150)] > 0.05);
  assert.ok(Math.abs(G.r[idx(175, 150)] - 0.7) < 1e-5);
  assert.ok(Math.abs(swTotal(G, K) - total) / total < 1e-6);
});

test('塗る: 耳の外と、具に隠れたマスには塗れない。壺から取ると量に応じて色が混ざる', () => {
  const X = trendCore(SANDWICH, SW_NAMES);
  const G = X.makeGrid(2, X.breadPoly(5)), K = { load: 0, r: 0, g: 0, b: 0 };
  for (let k = 0; k < G.cover.length; k += 7) G.cover[k] = 1;
  X.takeFromPot(K, [1, 1, 1]);
  for (let y = 40; y < 270; y += 8) X.stroke(G, K, 60, y, 340, y);
  for (let k = 0; k < G.t.length; k++) if (!G.mask[k] || G.cover[k]) assert.equal(G.t[k], 0);
  const K2 = { load: 3500, r: 1, g: 1, b: 1 };
  assert.equal(X.takeFromPot(K2, [0, 0, 0], 7000), 3500);
  assert.equal(K2.load, 7000);
  assert.ok(Math.abs(K2.r - 0.5) < 1e-12);
  assert.equal(X.takeFromPot(K2, [0, 0, 0], 7000), 0);
});

test('具: 凸包は外側の点だけを左回りに返し、内側の判定は辺からの距離を見る', () => {
  const X = trendCore(SANDWICH, SW_NAMES);
  const pts = [];
  for (let x = 0; x <= 2; x++) for (let y = 0; y <= 2; y++) pts.push([x * 10, y * 10]);
  const H = X.convexHull(pts);
  assert.equal(H.length, 4);
  // 中心 (10, 10) から 4 つの辺までは、どれも 10
  assert.ok(X.inHull(H, 10, 10, 9.9));
  assert.ok(!X.inHull(H, 10, 10, 10.1));
  assert.ok(!X.inHull(H, 21, 10));
  assert.ok(!X.inHull(X.convexHull([[0, 0], [5, 5], [10, 10]]), 5, 5));   // 一直線の点は面にならない
});

test('具: 重心の下に支えがあれば残り、無ければ支えと反対へ滑り、支えが 1 つも無ければ片付ける', () => {
  const X = trendCore(SANDWICH, SW_NAMES);
  const sq = X.SHAPES.cheese(), pts = X.samplesOf(sq, 3);
  const r = (f) => X.judge(pts, pts.map(([x]) => f(x)));
  assert.equal(r(() => true).kind, 'stay');
  assert.equal(r(() => true).frac, 1);
  assert.equal(r((x) => x < 6).kind, 'stay');
  const s = r((x) => x < -3);
  assert.equal(s.kind, 'slide');
  assert.ok(s.dir[0] > 0.99);
  assert.equal(r((x) => x < 0).kind, 'slide');   // ちょうど半分では、重心が支えの縁に乗るので残れない
  assert.equal(r(() => false).kind, 'gone');
  for (const [k, f] of Object.entries(X.SHAPES)) {
    const P = f();
    assert.ok(X.inPoly(P, 0, 0), k);
    assert.ok(X.samplesOf(P, 3).length > P.length, k);
  }
});

test('具: 下の具から順に判定し、支えていた具が落ちると上の具も落ちる', () => {
  const X = trendCore(SANDWICH, SW_NAMES);
  const sq = X.SHAPES.cheese(), L = { poly: sq, pts: X.samplesOf(sq, 3) };
  const onBread = (x) => x < 100;   // x が 100 より左だけがパン
  const A = X.posed(L, 90, 0, 0), B = X.posed(L, 105, 0, 0), Aout = X.posed(L, 135, 0, 0);
  assert.deepEqual(X.settle([A, B], onBread).map((q) => q.kind), ['stay', 'stay']);
  assert.deepEqual(X.settle([B], onBread).map((q) => q.kind), ['slide']);
  assert.deepEqual(X.settle([Aout, B], onBread).map((q) => q.kind), ['gone', 'slide']);
  // 回しても、置いた所と形は変わらない（重心は同じ）
  const R = X.posed(L, 50, 60, 0.7);
  const c = R.pts.reduce((s, p) => [s[0] + p[0] / R.pts.length, s[1] + p[1] / R.pts.length], [0, 0]);
  assert.ok(Math.hypot(c[0] - 50, c[1] - 60) < 1e-9);
});

test('パン: 耳の内側の輪郭は外側の内側にあり、パン全体がマス目の範囲に入る', () => {
  const X = trendCore(SANDWICH, SW_NAMES);
  const outer = X.breadPoly(0), inner = X.breadPoly(9), G = X.makeGrid(2, X.breadPoly(5));
  for (const [x, y] of inner) assert.ok(X.inPoly(outer, x, y));
  assert.ok(X.inPoly(outer, 200, 150));
  assert.ok(!X.inPoly(outer, 20, 20));
  for (const [x, y] of outer) {
    assert.ok(x > G.ox && x < G.ox + G.w * G.cell && y > G.oy && y < G.oy + G.h * G.cell);
  }
});

// 次の文字を当てる力と圧縮（Perplexity and Intelligence）
const PERP = 'tr-20261123-perplexity-compress';
const PP_NAMES = ['MAX_ORDER', 'charsOf', 'train', 'alphabetOf', 'usedOrder', 'prob', 'dist', 'evaluate', 'lossCurve', 'topK', 'cumFreq', 'encode', 'decode', 'randomLetters'];
const PP_JA = '朝は晴れ。気温は八度で、少し寒い。昼から雲が出て、夕方に小雨が降った。駅まで歩いて、パンを買って帰った。\n朝はくもり。気温は十度で、風が強い。昼は晴れて、少し暖かくなった。駅まで自転車で行って、本を借りて帰った。\n朝は雨。気温は九度で、とても寒い。昼も雨が続いて、夕方にやんだ。家で本を読んで、夜にパンを焼いた。';
const PP_JA_TEST = '朝はくもり。気温は九度で、少し寒い。昼から雨が降って、夕方にやんだ。駅まで歩いて、本を借りて帰った。';

test('当てる: 手で計算した Witten–Bell の確率と一致する', () => {
  const X = trendCore(PERP, PP_NAMES);
  const m = X.train(X.charsOf('abab'), 2);
  // 0 文字の文脈: a が 2 回・b が 2 回・種類は 2 → (2 + 2 × 1/2) ÷ (4 + 2) = 1/2
  assert.ok(near(X.prob(m, ['a'], 0, 0, 'a', 2), 0.5));
  // 「a」の後: b が 2 回・種類は 1 → b は (2 + 1 × 1/2) ÷ 3、a は (0 + 1 × 1/2) ÷ 3
  assert.ok(near(X.prob(m, ['a', 'x'], 1, 1, 'b', 2), 2.5 / 3));
  assert.ok(near(X.prob(m, ['a', 'x'], 1, 1, 'a', 2), 0.5 / 3));
  // 学習が空なら、一覧の文字は全部同じ確率
  const empty = X.train([], 3);
  assert.ok(near(X.prob(empty, ['x', 'y'], 2, 3, 'q', 5), 1 / 5));
  assert.equal(X.usedOrder(empty, ['x'], 1, 3), -1);
});

test('当てる: 全部の文字の確率は合計 1 で、1 文字ずつ求めた確率と同じ', () => {
  const X = trendCore(PERP, PP_NAMES);
  const tr = X.charsOf(PP_JA), te = X.charsOf(PP_JA_TEST);
  const m = X.train(tr, X.MAX_ORDER), A = X.alphabetOf(tr, te);
  for (const order of [0, 1, 3, 6]) {
    for (const i of [0, 1, 5, 20, te.length - 1]) {
      const p = X.dist(m, te, i, order, A);
      assert.ok(near(p.reduce((s, v) => s + v, 0), 1, 1e-9), `order ${order} i ${i}`);
      for (const j of [0, 7, A.length - 1]) assert.ok(near(p[j], X.prob(m, te, i, order, A[j], A.length), 1e-12));
    }
  }
  // 上位の予想は確率の高い順
  const top = X.topK(X.dist(m, te, 3, 2, A), A, 5);
  for (let k = 1; k < top.length; k++) assert.ok(top[k - 1].p >= top[k].p);
});

test('当てる: 文脈を長くすると学習に使った文の損失は下がり続け、使わなかった文との差が開く', () => {
  const X = trendCore(PERP, PP_NAMES);
  const tr = X.charsOf(PP_JA), te = X.charsOf(PP_JA_TEST);
  const m = X.train(tr, X.MAX_ORDER), K = X.alphabetOf(tr, te).length;
  const a = X.lossCurve(m, tr, K, X.MAX_ORDER), b = X.lossCurve(m, te, K, X.MAX_ORDER);
  for (let k = 1; k < a.length; k++) assert.ok(a[k] <= a[k - 1] + 1e-12, `学習用 ${k}`);
  assert.ok(b[2] < b[0]);
  assert.ok(a[6] < b[6]);
  // パープレキシティは e の損失乗、ビットは損失 ÷ ln 2
  const ev = X.evaluate(m, te, 2, K);
  assert.ok(near(ev.ppl, Math.exp(ev.loss)) && near(ev.bpc, ev.loss / Math.LN2));
  assert.ok(near(ev.totalBits, ev.bits.reduce((s, v) => s + v, 0), 1e-6));
});

test('圧縮: 算術符号は元に戻せて、大きさは損失から計算した値に近い', () => {
  const X = trendCore(PERP, PP_NAMES);
  const L = 'abcdefghijklmnopqrstuvwxyz';
  const cases = [
    [X.charsOf(PP_JA), X.charsOf(PP_JA_TEST)],
    [X.charsOf('the cat sat on the mat. the dog sat on the log. '), X.charsOf('the cat sat on the log. the dog sat.')],
    [X.charsOf(X.randomLetters(7, 600, L)), X.charsOf(X.randomLetters(11, 200, L))],
    [[], X.charsOf('xyz')],
    [X.charsOf('abc'), []],
  ];
  for (const [tr, te] of cases) {
    const m = X.train(tr, X.MAX_ORDER), A = X.alphabetOf(tr, te);
    for (let order = 0; order <= X.MAX_ORDER; order++) {
      const enc = X.encode(m, te, order, A);
      assert.equal(X.decode(m, enc.bytes, order, A).join(''), te.join(''), `order ${order}`);
      assert.equal(enc.bytes.length, Math.ceil(enc.bits / 8));
      const ideal = X.evaluate(m, te, order, Math.max(1, A.length)).totalBits;
      // 32 ビットの文字数・終わりの 2 ビットと、度数に直したときのずれ（1 文字あたり 0.1 ビットまで）
      assert.ok(enc.bits - 32 <= ideal + 0.1 * te.length + 4, `order ${order}: ${enc.bits - 32} > ${ideal}`);
      assert.ok(enc.bits - 32 >= ideal - 1, `order ${order}`);
    }
  }
});

test('圧縮: でたらめな英字は当てようがなく、約 26 個から選ぶのと同じ。文脈を長くするとかえって悪くなる', () => {
  const X = trendCore(PERP, PP_NAMES);
  const L = 'abcdefghijklmnopqrstuvwxyz';
  assert.equal(X.randomLetters(3, 50, L), X.randomLetters(3, 50, L));
  assert.notEqual(X.randomLetters(3, 50, L), X.randomLetters(4, 50, L));
  assert.match(X.randomLetters(3, 500, L), /^[a-z]{500}$/);
  const tr = X.charsOf(X.randomLetters(7, 1200, L)), te = X.charsOf(X.randomLetters(11, 300, L));
  const m = X.train(tr, X.MAX_ORDER), K = X.alphabetOf(tr, te).length;
  const e0 = X.evaluate(m, te, 0, K), e3 = X.evaluate(m, te, 3, K);
  assert.ok(e0.ppl > 20 && e0.ppl < 32, `order 0: ${e0.ppl}`);
  // 1 回しか出なかった文脈に引っぱられる（学習用の文を覚えただけで、当てる力は上がらない）
  assert.ok(e3.loss > e0.loss, `order 3: ${e3.ppl}`);
});

test('圧縮: 度数はどの文字も 1 以上で合計は上限以下。種類が多すぎると止める', () => {
  const X = trendCore(PERP, PP_NAMES);
  const p = new Float64Array([0.999999, 0.000001, 0]);
  const cum = X.cumFreq(p, 65536);
  for (let j = 0; j < 3; j++) assert.ok(cum[j + 1] - cum[j] >= 1);
  assert.ok(cum[3] <= 65536);
  assert.throws(() => X.cumFreq(new Float64Array(40000).fill(1 / 40000), 65536));
  assert.deepEqual(Array.from(X.charsOf('a\r\nb\rc')), ['a', '\n', 'b', '\n', 'c']);
  assert.deepEqual(Array.from(X.charsOf('😀a')), ['😀', 'a']);
});

// ---- 時刻合わせ（NTP）: tr-20261123-ntp-offset ----
const NTP = 'tr-20261123-ntp-offset';
const NTP_NAMES = ['offsetDelay', 'pickBest', 'rng', 'netSample', 'makeSim', 'poll', 'rms', 'FILTER', 'KP', 'STEP_MS'];
// 回線の様子を決めて1回ずつ問い合わせる
function ntpRun(X, mode, p, n, e0 = 25, seed = 1) {
  const s = X.makeSim(e0), r = X.rng(seed), out = [];
  for (let i = 0; i < n; i++) out.push(X.poll(s, { ...p, mode }, X.netSample(p, r)));
  return { s, out };
}

test('時刻合わせ: 行きと帰りが同じなら θ は本当のずれ。違うと（行き − 帰り）÷ 2 だけ外れる', () => {
  const X = trendCore(NTP, NTP_NAMES);
  // 自分の時計が 30 ms 進んでいる。行き 10 ms、相手の処理 1 ms、帰り 10 ms
  const e = 30, T1 = 1000;
  let m = X.offsetDelay(T1 + e, T1 + 10, T1 + 11, T1 + 21 + e);
  assert.ok(near(m.offset, -30) && near(m.delay, 20));
  // 行き 16 ms、帰り 4 ms（往復は同じ 20 ms）: θ は 6 ms 外れる
  m = X.offsetDelay(T1 + e, T1 + 16, T1 + 17, T1 + 21 + e);
  assert.ok(near(m.offset, -30 + 6) && near(m.delay, 20));
});

test('時刻合わせ: 往復が一番短い回を選び、同じ長さなら新しい方', () => {
  const X = trendCore(NTP, NTP_NAMES);
  assert.equal(X.pickBest([]), -1);
  assert.equal(X.pickBest([{ delay: 30 }, { delay: 22 }, { delay: 40 }]), 1);
  assert.equal(X.pickBest([{ delay: 22 }, { delay: 30 }, { delay: 22 }]), 2);
});

test('時刻合わせ: 回線の様子は種で決まり、混雑が無ければ片道は base ± 差 ÷ 2', () => {
  const X = trendCore(NTP, NTP_NAMES);
  const p = { base: 12, asym: 6, jitter: 10 };
  const a = X.rng(5), b = X.rng(5);
  for (let i = 0; i < 50; i++) {
    const u = X.netSample(p, a), v = X.netSample(p, b);
    assert.deepEqual({ ...u }, { ...v });
    assert.ok(u.df >= 15 - 1e-9 && u.db >= 9 - 1e-9 && u.proc > 0 && u.proc < 0.31);
  }
  const q = X.netSample({ base: 12, asym: 6, jitter: 0 }, X.rng(1));
  assert.ok(near(q.df, 15) && near(q.db, 9));
});

test('時刻合わせ: そのまま足すやり方では、直した後のずれが θ の誤差と同じになる', () => {
  const X = trendCore(NTP, NTP_NAMES);
  const { s, out } = ntpRun(X, 'step', { ppm: 80, jitter: 12, asym: 0, base: 12, tau: 16 }, 50);
  for (const o of out) {
    assert.ok(near(o.after, o.err, 1e-6));
    assert.ok(near(o.err, (o.df - o.db) / 2, 1e-6));
  }
  assert.equal(s.f, 0);
  // 混雑が無いと、待っている間のくるいの分（80 ppm × 16 秒 = 1.28 ms）だけ毎回ずれる
  const q = ntpRun(X, 'step', { ppm: 80, jitter: 0, asym: 0, base: 12, tau: 16 }, 20).out;
  for (const o of q.slice(1)) assert.ok(near(o.before, 1.28, 1e-6) && near(o.after, 0, 1e-6));
});

test('時刻合わせ: NTP 風は進み方のくるいを打ち消してずれを 0 に寄せる。行きと帰りに差があると、その半分で止まる', () => {
  const X = trendCore(NTP, NTP_NAMES);
  let r = ntpRun(X, 'ntp', { ppm: 100, jitter: 0, asym: 0, base: 12, tau: 16 }, 200);
  assert.ok(Math.abs(r.s.e) < 0.01, `e = ${r.s.e}`);
  assert.ok(Math.abs(r.s.f + 100) < 0.5, `f = ${r.s.f}`);
  r = ntpRun(X, 'ntp', { ppm: -150, jitter: 0, asym: 10, base: 12, tau: 16 }, 200);
  // 時計は 5 ms 進んだまま。それでも測ったずれは 0 に見える
  assert.ok(Math.abs(r.s.e - 5) < 0.01, `e = ${r.s.e}`);
  assert.ok(Math.abs(r.out[r.out.length - 1].offset) < 0.01);
});

test('時刻合わせ: 混雑があると、NTP 風の方がそのまま足すより本当のずれが小さい', () => {
  const X = trendCore(NTP, NTP_NAMES);
  for (const seed of [1, 2, 3]) {
    const p = { ppm: 80, jitter: 12, asym: 0, base: 12, tau: 16 };
    const n = ntpRun(X, 'ntp', p, 400, 25, seed).out.slice(100).map((o) => o.before);
    const s = ntpRun(X, 'step', p, 400, 25, seed).out.slice(100).map((o) => o.before);
    assert.ok(X.rms(n) * 2.5 < X.rms(s), `seed ${seed}: ${X.rms(n)} / ${X.rms(s)}`);
  }
  assert.equal(X.rms([]), 0);
  assert.ok(near(X.rms([3, -4]), Math.sqrt(12.5)));
});

test('時刻合わせ: 同じ回の θ は2度使わず、最初に大きくずれていたら一度に合わせる', () => {
  const X = trendCore(NTP, NTP_NAMES);
  const p = { mode: 'ntp', ppm: 0, jitter: 0, asym: 0, base: 12, tau: 16 };
  const s = X.makeSim(10);
  const a = X.poll(s, p, { df: 12, db: 12, proc: 0.1 });
  assert.equal(a.usedId, 0);
  assert.ok(near(a.after, 10 - X.KP * 10));
  // 次は往復が長い。一番短いのは使い済みの 0 番なので、時計は動かさない
  // （進み方の直しは続くので、待っている間に f × 16 秒の分だけは動く）
  const b = X.poll(s, p, { df: 30, db: 12, proc: 0.1 });
  assert.equal(b.usedId, -1);
  assert.equal(b.bestId, 0);
  assert.equal(b.adj, 0);
  assert.ok(near(b.after, b.before) && near(b.before, a.after + s.f * 1e-3 * 16));
  // 8 回より前の回は比べる対象から外れる
  for (let i = 0; i < X.FILTER; i++) X.poll(s, p, { df: 20, db: 20, proc: 0.1 });
  assert.ok(s.samples.length === X.FILTER && s.samples.every((x) => x.id > 1));
  // 最初の回で 500 ms ずれていたら一度に合わせる（誤差は（行き − 帰り）÷ 2）
  const big = X.makeSim(500);
  const c = X.poll(big, p, { df: 14, db: 10, proc: 0.1 });
  assert.ok(near(c.after, 2) && Math.abs(c.offset) > X.STEP_MS);
});

// ---- 小さな街（Small SF）: tr-20261123-mini-city ----
const CITY = 'tr-20261123-mini-city';
const CITY_NAMES = ['signalAt', 'canStop', 'idm', 'demand', 'dayOfYear', 'solarHour', 'sunPosition', 'sunVector', 'lightState', 'project', 'rayOrigin', 'streetDist', 'makeWorld', 'buildTown', 'castRay', 'shadowAt', 'makeTraffic', 'posOnLink', 'addCar', 'stepTraffic', 'CYCLE', 'SIG', 'GROUND', 'CELL', 'GN', 'IDM', 'SF'];
// 建物が1つだけの街
function oneBox(X, x0, x1, y0, y1, h) {
  const H = new Float32Array(X.GN * X.GN).fill(X.GROUND), M = new Int32Array(X.GN * X.GN);
  for (let y = y0 / X.CELL; y < y1 / X.CELL; y++) for (let x = x0 / X.CELL; x < x1 / X.CELL; x++) { H[y * X.GN + x] = h; M[y * X.GN + x] = 1; }
  return X.makeWorld(H, M, [null, { id: 1, h }], []);
}

test('小さな街: 信号は2つの向きが同時に青や黄にならず、黄色のあとに全方向が赤の間がある', () => {
  const X = trendCore(CITY, CITY_NAMES);
  assert.equal(X.CYCLE, 25);
  let allRed = 0, prev = null;
  const changes = [];
  for (let i = 0; i < 2500; i++) {
    const t = i * 0.01, s = X.signalAt(t, 0);
    assert.ok(s.ns === 'r' || s.ew === 'r', 't=' + t);
    if (s.ns === 'r' && s.ew === 'r') allRed++;
    const k = s.ns + s.ew;
    if (k !== prev) { changes.push(k); prev = k; }
  }
  assert.deepEqual(changes, ['gr', 'yr', 'rr', 'rg', 'ry', 'rr']);
  assert.ok(near(allRed * 0.01, 2 * X.SIG.red, 0.02));
  // ずらし off を足すと同じ順で時間がずれる。負の時刻でも同じ
  assert.deepEqual({ ...X.signalAt(3, 10) }, { ...X.signalAt(13, 0) });
  assert.deepEqual({ ...X.signalAt(-1, 0) }, { ...X.signalAt(24, 0) });
});

test('小さな街: 止まれるかの判定と、IDM の加速', () => {
  const X = trendCore(CITY, CITY_NAMES);
  // 速さ 2、減速 2 なら止まるのに 1 要る
  assert.equal(X.canStop(2, 1, 2), true);
  assert.equal(X.canStop(2, 0.99, 2), false);
  const P = X.IDM;
  assert.ok(X.idm(0, P.v0, Infinity, 0, P) > 0);                   // 前が空いていれば発進する
  assert.ok(near(X.idm(P.v0, P.v0, Infinity, 0, P), 0));             // 望む速さなら加速しない
  assert.ok(X.idm(2, P.v0, 0.5, 2, P) < -P.b);                       // 止まった車がすぐ前なら強く減速する
  assert.ok(near(X.idm(0, P.v0, P.s0, 0, P), 0));                    // 間隔 s0 で止まったまま
  assert.ok(X.idm(0, P.v0, P.s0 * 0.9, 0, P) < 0);
});

test('小さな街: 車の量は朝 8 時と夕方 5 時半に多く、夜中に一番少ない', () => {
  const X = trendCore(CITY, CITY_NAMES);
  const v = (h) => X.demand(h);
  assert.ok(v(8) > v(6) && v(8) > v(11));
  assert.ok(v(17.5) > v(15) && v(17.5) > v(20));
  assert.ok(v(17.5) > v(8));
  let lo = 1, at = 0;
  for (let h = 0; h < 24; h += 0.25) if (v(h) < lo) { lo = v(h); at = h; }
  assert.ok(at >= 2 && at <= 5, '一番少ないのは ' + at + ' 時');
  assert.ok(near(v(25), v(1)) && near(v(-1), v(23)));
  for (let h = 0; h < 24; h += 0.5) assert.ok(v(h) > 0 && v(h) <= 1);
});

test('小さな街: 太陽の位置（夏至の正午と、サンフランシスコの 11 月 23 日）', () => {
  const X = trendCore(CITY, CITY_NAMES);
  assert.equal(X.dayOfYear(2026, 1, 1), 1);
  assert.equal(X.dayOfYear(2026, 11, 23), 327);
  assert.equal(X.dayOfYear(2024, 3, 1), 61);
  // 夏至（172 日目）の太陽の正午: 高さは 90 − 緯度 + 23.44、方角は真南
  const s = X.sunPosition(172, 12, 37.77);
  assert.ok(near(s.alt, 90 - 37.77 + 23.44, 0.05), String(s.alt));
  assert.ok(near(s.az, 180, 0.01));
  // 午前は東寄り、午後は西寄り、真夜中は地平線の下
  assert.ok(X.sunPosition(172, 9, 37.77).az < 180 && X.sunPosition(172, 15, 37.77).az > 180);
  assert.ok(X.sunPosition(172, 0, 37.77).alt < 0);
  // サンフランシスコの 11 月 23 日、時計の 12 時（UTC 20 時）: 太陽はほぼ南で、高さは約 31 度
  const doy = 327, sh = X.solarHour(20, X.SF.lon, doy);
  assert.ok(near(sh, 12.05, 0.05), String(sh));
  const n = X.sunPosition(doy, sh, X.SF.lat);
  assert.ok(n.alt > 30 && n.alt < 33 && Math.abs(n.az - 180) < 3, JSON.stringify(n));
  // 7 時（UTC 15 時）はまだ低く、17 時（翌日の UTC 1 時）は沈んでいる
  assert.ok(X.sunPosition(doy, X.solarHour(15, X.SF.lon, doy), X.SF.lat).alt < 3);
  assert.ok(X.sunPosition(doy, X.solarHour(25, X.SF.lon, doy), X.SF.lat).alt < 0);
  // 太陽の方向は単位ベクトル。光の状態は、夜は夜の度合い 1、昼は 0
  const L = Array.from(X.sunVector(30, 135));
  assert.ok(near(Math.hypot(...L), 1) && L[0] > 0 && L[1] < 0 && near(L[2], 0.5));
  assert.equal(X.lightState(-20, 0).night, 1);
  assert.equal(X.lightState(-20, 0).up, false);
  assert.equal(X.lightState(40, 180).night, 0);
  assert.equal(X.lightState(40, 180).up, true);
});

test('小さな街: 視線は手前の地面にそのまま当たり、建物の奥の地面は建物に隠れる', () => {
  const X = trendCore(CITY, CITY_NAMES);
  const W = oneBox(X, 20, 22, 20, 22, 5);
  const hit = {};
  // 建物の手前（南西）の地面
  let p = X.project(19, 19, X.GROUND);
  X.castRay(W, p.sx, p.sy, hit);
  assert.equal(hit.kind, 0);
  assert.equal(hit.n, 0);
  assert.ok(near(hit.x, 19, 1e-6) && near(hit.y, 19, 1e-6) && near(hit.h, X.GROUND, 1e-6));
  // 建物の奥（北東）の地面: 先に建物に当たる
  p = X.project(23, 23, X.GROUND);
  X.castRay(W, p.sx, p.sy, hit);
  assert.equal(W.M[hit.id], 1);
  // 地面までの距離より当たった物の方が近い。だからそこに置いた車は隠れる
  const o = Array.from(X.rayOrigin(p.sx, p.sy, W.top));
  assert.ok(hit.t < (o[2] - X.GROUND) * Math.SQRT2 - 0.5);
  // 西向きの壁の真ん中
  p = X.project(20, 21.2, 2);
  X.castRay(W, p.sx, p.sy, hit);
  assert.equal(hit.n, 1);
  assert.ok(near(hit.x, 20, 1e-6) && near(hit.y, 21.2, 1e-6) && near(hit.h, 2, 1e-6));
  // 陸の外は海（高さ 0）
  p = X.project(-3, 10, 0);
  X.castRay(W, p.sx, p.sy, hit);
  assert.equal(hit.kind, 3);
  assert.ok(near(hit.h, 0, 1e-6));
});

test('小さな街: 建物の影は太陽と反対の側にでき、太陽が高いと短くなる', () => {
  const X = trendCore(CITY, CITY_NAMES);
  const W = oneBox(X, 20, 22, 20, 22, 5);
  const g = X.GROUND + 0.01;
  const east = Array.from(X.sunVector(20, 90));   // 東の低い太陽
  assert.equal(X.shadowAt(W, 18.5, 21, g, east), true);    // 建物の西
  assert.equal(X.shadowAt(W, 23.5, 21, g, east), false);   // 建物の東
  assert.equal(X.shadowAt(W, 18.5, 25, g, east), false);   // 建物から外れた所
  // 高さ 4.7 の建物の影の長さは 4.7 ÷ tan(太陽の高さ)。20 度なら約 12.9、60 度なら約 2.7
  assert.equal(X.shadowAt(W, 10, 21, g, east), true);
  const high = Array.from(X.sunVector(60, 90));
  assert.equal(X.shadowAt(W, 18, 21, g, high), true);
  assert.equal(X.shadowAt(W, 16.5, 21, g, high), false);
  // 屋根の上は影にならない
  assert.equal(X.shadowAt(W, 21, 21, 5.01, east), false);
});

test('小さな街: 通りと歩道には建物が無く、建物は街区の中だけに建つ', () => {
  const X = trendCore(CITY, CITY_NAMES);
  const W = X.buildTown(20261123);
  let n = 0;
  for (let iy = 0; iy < X.GN; iy++) for (let ix = 0; ix < X.GN; ix++) {
    const x = (ix + 0.5) * X.CELL, y = (iy + 0.5) * X.CELL, i = iy * X.GN + ix;
    if (X.streetDist(x) < 1.5 || X.streetDist(y) < 1.5) { assert.ok(near(W.H[i], X.GROUND, 1e-6)); assert.equal(W.M[i], 0); }
    if (W.M[i] > 0) { n++; assert.ok(W.H[i] > X.GROUND + 1); }
  }
  assert.ok(n > 1000, String(n));
  assert.ok(W.buildings.length > 30 && W.maxH > 6 && W.top > W.maxH, String(W.maxH));
  // 木の幹は車道に立てない
  for (const t of W.trees) assert.ok(!(X.streetDist(t.x) < 1 || X.streetDist(t.y) < 1), t.x + ',' + t.y);
  // 同じ種なら同じ街になる
  assert.deepEqual(Array.from(X.buildTown(20261123).H), Array.from(W.H));
});

test('小さな街: 道はとぎれずにつながり、交差点ではまっすぐと右折に分かれる', () => {
  const X = trendCore(CITY, CITY_NAMES);
  const sim = X.makeTraffic(1);
  const roads = sim.links.filter((L) => L.kind === 'road'), moves = sim.links.filter((L) => L.kind === 'move');
  assert.equal(roads.length, 4 * 5 * 6);
  assert.equal(moves.length, 25 * 4 * 2);
  assert.equal(sim.entries.length, 20);
  const a = {}, b = {};
  for (const L of sim.links) {
    for (const nid of L.next) {
      const N = sim.links[nid];
      X.posOnLink(L, L.len, a);
      X.posOnLink(N, 0, b);
      assert.ok(near(a.x, b.x, 1e-6) && near(a.y, b.y, 1e-6), L.id + '→' + nid);
      assert.ok(Math.abs(Math.sin(a.th - b.th)) < 1e-6 && Math.cos(a.th - b.th) > 0);
    }
    if (L.kind === 'road' && !L.exit) assert.equal(L.next.length, 2);
    if (L.kind === 'move') assert.equal(L.merge.length, 1);
  }
  // 右折は右へ: 東へ向かう車は南へ曲がる
  const east = roads.find((L) => L.dx === 1 && L.node === 12);
  const turn = sim.links[east.next[1]];
  assert.ok(turn.turn);
  X.posOnLink(turn, turn.len, b);
  assert.ok(near(Math.cos(b.th), 0, 1e-6) && Math.sin(b.th) < 0);
});

test('小さな街: 赤信号では止まる線の手前で止まり、青になったら交差点へ入る', () => {
  const X = trendCore(CITY, CITY_NAMES);
  const sim = X.makeTraffic(2);
  sim.max = 0;
  const node = 12, L = sim.links.find((q) => q.kind === 'road' && q.dx === 1 && q.node === node);
  sim.nodes[node].off = 0;   // 0〜12.5 秒は南北の番で、東西は赤
  const c = X.addCar(sim, L.id, 0, 2.4, 'car');
  for (let i = 0; i < 30 * 10; i++) X.stepTraffic(sim, 1 / 30, 12);
  assert.equal(c.link, L.id);
  assert.ok(c.s > L.len - 0.4 && c.s < L.len && c.v < 0.05, JSON.stringify({ s: c.s, len: L.len, v: c.v }));
  for (let i = 0; i < 30 * 6; i++) X.stepTraffic(sim, 1 / 30, 12);
  assert.notEqual(c.link, L.id);
  assert.equal(sim.redRuns, 0);
});

test('小さな街: 夕方の混む時刻に 2 分動かしても、同じ道の車は重ならず、赤で交差点へ入る車もいない', () => {
  const X = trendCore(CITY, CITY_NAMES);
  const sim = X.makeTraffic(5);
  sim.max = 120;
  let most = 0;
  for (let i = 0; i < 30 * 120; i++) {
    X.stepTraffic(sim, 1 / 30, 17.5);
    for (const L of sim.links) for (let k = 1; k < L.cars.length; k++) {
      const p = L.cars[k - 1], q = L.cars[k];
      assert.ok(q.s - p.s - (p.len + q.len) / 2 > -0.02, 'link ' + L.id + ' t=' + sim.t.toFixed(2));
    }
    most = Math.max(most, sim.cars.length);
  }
  assert.ok(most > 80, String(most));
  assert.equal(sim.redRuns, 0);
  for (const c of sim.cars) assert.ok(c.v >= 0 && c.v < X.IDM.v0 * 1.2);
});

// ---- 小さなブラウザエンジン（Ladybird のアルファ版）----
const ENGINE = 'tr-20261124-tiny-engine';
const ENGINE_NAMES = ['parseHTML', 'parseCSS', 'parseSelector', 'matchSel', 'styleTree', 'layoutDoc', 'paintList', 'collapseMargins', 'UA_CSS'];
// 偽の文字: 1 文字 10px、上の高さ 12px・下の深さ 4px
const FAKE_M = { width: (font, t) => [...t].length * 10, metrics: () => ({ asc: 12, desc: 4 }) };
let engineX = null;
function engine(html, css = '', width = 200, M = FAKE_M) {
  const X = engineX || (engineX = trendCore(ENGINE, ENGINE_NAMES));
  const pr = X.parseHTML(html);
  X.styleTree(pr.root, [X.parseCSS(X.UA_CSS, 'ua'), X.parseCSS(css, 'author')], {});
  const L = X.layoutDoc(pr.root, width, M);
  const all = [];
  const walk = (n) => { for (const k of n.children) if (k.type === 'el') { all.push(k); walk(k); } };
  walk(pr.root);
  const byId = (id) => all.find((e) => e.attrs.id === id);
  return { X, pr, L, byId, box: (id) => L.C.byNode.get(byId(id)) };
}
const lineTexts = (b) => b.lines.map((L) => L.runs.map((r) => r.text).join(''));

test('小さなエンジン: p の中で div が始まると先に p を閉じ、li は前の li を閉じる', () => {
  const { pr } = engine('<p>a<div>b</div><ul><li>1<li>2</ul>');
  const tags = pr.root.children.filter((k) => k.type === 'el').map((k) => k.tag);
  assert.equal(tags.join(','), 'p,div,ul');
  const ul = pr.root.children.find((k) => k.tag === 'ul');
  assert.equal(ul.children.filter((k) => k.type === 'el').map((k) => k.tag).join(','), 'li,li');
  assert.equal(pr.notes.fixes, 3);
});

test('小さなエンジン: 文字参照を戻し、class・id・style 以外の属性と知らない要素を記録する', () => {
  const { pr } = engine('<p class="x" onclick="evil()" id=q>&lt;b&gt; &amp; &#x41;&#66;&nbsp;</p><foo>z</foo><img src="a.png">');
  const [p, foo, img] = pr.root.children;
  assert.equal(p.children[0].text, '<b> & AB' + String.fromCharCode(160));
  assert.equal(p.attrs.class, 'x');
  assert.equal(p.attrs.id, 'q');
  assert.equal(p.attrs.onclick, undefined);
  assert.ok(pr.notes.attrs.has('onclick'));
  assert.equal(foo.tag, 'span');
  assert.equal(foo.orig, 'foo');
  assert.equal(img.tag, '#skip');
});

test('小さなエンジン: 選択子の詳しさ、子と子孫の違い、扱えない規則は捨てる', () => {
  const { X, byId } = engine('<div id=a><section><p id=deep>x</p></section><p id=kid>y</p></div>');
  assert.equal(X.parseSelector('#main p.note:first-child').spec.join(','), '1,2,1');
  assert.equal(X.parseSelector('a:hover'), null);
  assert.equal(X.parseSelector('div + p'), null);
  const child = X.parseSelector('div > p'), desc = X.parseSelector('div p');
  assert.equal(X.matchSel(byId('kid'), child), true);
  assert.equal(X.matchSel(byId('deep'), child), false);
  assert.equal(X.matchSel(byId('deep'), desc), true);
  const r = X.parseCSS('@media (min-width: 1px) { p { color: red } } p, q:hover { color: blue } div > p { color: green }', 'author');
  assert.equal(r.rules.length, 1);
  assert.equal(r.bad.length, 2);
});

test('小さなエンジン: 詳しさ・style 属性・!important の順で値が決まり、読めない値は次の候補を使う', () => {
  const css = 'p { color: #555; } .note { color: red; } #main p { color: blue; } .imp { color: purple !important; } p.w { width: 50px; } p.w { width: oops; }';
  const { byId } = engine('<div id="main"><p id=a class="note">1</p><p id=b class="note" style="color: green">2</p><p id=c class="note imp" style="color: green">3</p><p id=d class="w">4</p></div>', css);
  assert.equal(byId('a').cs.color, 'blue');
  assert.equal(byId('b').cs.color, 'green');
  assert.equal(byId('c').cs.color, 'purple');
  assert.equal(byId('d').cs.width.px, 50);
});

test('小さなエンジン: em と smaller は親の文字の大きさから、bolder は親の太さから決まる。枠の幅は整数の画素にする', () => {
  const { byId } = engine('<div><p id=p>x<b id=b>y</b><small id=s>z</small></p></div><h1>t<b id=hb>u</b></h1><p id=t1 style="border:0.5px solid">a</p><p id=t2 style="border:2.7px solid">b</p><p id=t3 style="border-width:3px">c</p>', 'div { font-size: 20px } p { font-size: 1.5em; margin: 1em 0 }');
  assert.equal(byId('p').cs['font-size'], 30);
  assert.equal(byId('p').cs['margin-top'].px, 30);
  assert.ok(Math.abs(byId('s').cs['font-size'] - 25) < 1e-9);
  assert.equal(byId('b').cs['font-weight'], 700);
  assert.equal(byId('hb').cs['font-weight'], 900);
  assert.equal(byId('t1').cs['border-top-width'], 1);
  assert.equal(byId('t2').cs['border-left-width'], 2);
  assert.equal(byId('t3').cs['border-top-width'], 0);   // 線の種類が none なので幅は 0
});

test('小さなエンジン: 隣り合う上下の余白は大きい方だけ使い、負の余白は足す', () => {
  const { X, box } = engine('<div id=a style="margin-bottom:30px;height:10px"></div><div id=b style="margin-top:20px;height:10px"></div><div id=c style="margin-top:-12px;height:10px"></div>');
  assert.equal(box('a').y, 0);
  assert.equal(box('b').y, 40);
  assert.equal(box('c').y, 38);
  assert.equal(X.collapseMargins([30, 20, -5, -12]), 18);
});

test('小さなエンジン: 親に上の枠も内側の余白もないと子の余白が親の外へ出る。内側の余白か flow-root で止まる', () => {
  let r = engine('<div id=w style="margin-top:10px"><p id=c style="margin-top:24px;height:5px"></p></div>');
  assert.equal(r.box('w').y, 24);
  assert.equal(r.box('c').y, 24);
  assert.equal(r.box('w').h, 5);
  r = engine('<div id=w style="margin-top:10px;padding-top:1px"><p id=c style="margin-top:24px;height:5px"></p></div>');
  assert.equal(r.box('w').y, 10);
  assert.equal(r.box('c').y, 35);
  r = engine('<div id=w style="margin-top:10px;display:flow-root"><p id=c style="margin-top:24px;height:5px"></p></div>');
  assert.equal(r.box('w').y, 10);
  assert.equal(r.box('c').y, 34);
});

test('小さなエンジン: 中身のない箱は上と下の余白が重なって通り抜ける', () => {
  const { box } = engine('<div id=a style="height:10px;margin-bottom:10px"></div><div id=e style="margin:20px 0 28px"></div><div id=b style="height:10px;margin-top:8px"></div>');
  assert.equal(box('e').h, 0);
  assert.equal(box('e').y, 30);   // 下に枠があるとしたときの位置: 10 + 重なった余白 max(10, 20)
  assert.equal(box('b').y, 38);
});

test('小さなエンジン: 幅の決まった箱は左右の auto の余白で寄せ、max-width で幅を抑える', () => {
  const { box } = engine('<div id=a style="width:100px;margin:0 auto;height:1px"></div><div id=b style="max-width:50px;margin-left:auto;height:1px"></div>', '', 300);
  assert.equal(box('a').x, 100);
  assert.equal(box('b').x, 250);
  assert.equal(box('b').w, 50);
});

test('小さなエンジン: 英語は空白で折り返し、行の高さは文字の上下に行の高さとの差の半分を足す', () => {
  const { box } = engine('<p id=p style="margin:0">aaa bbb ccc</p>', '', 75);
  const b = box('p');
  assert.equal(lineTexts(b).join('|'), 'aaa bbb|ccc');
  assert.equal(b.lines[0].h, 24);
  assert.equal(b.lines[0].base, 16);
  assert.equal(b.h, 48);
});

test('小さなエンジン: 塊の幅は文字の並びの先頭から測るので、隣の文字との詰め具合が行の幅に入る', () => {
  // 偽の字形: 「V」と空白が並ぶと 2px 詰まる。1 つずつ足すと 50px、続けて測ると 48px
  const KERN_M = { width: (font, t) => [...t].length * 10 - 2 * (t.split('V ').length - 1), metrics: () => ({ asc: 12, desc: 4 }) };
  const { box } = engine('<p id=p style="margin:0">AV AV</p>', '', 48, KERN_M);
  assert.equal(lineTexts(box('p')).join('|'), 'AV AV');
  assert.equal(box('p').lines[0].w, 48);
});

test('小さなエンジン: 日本語は1文字ずつ区切るが、「、」や閉じかっこを行の頭に、開きかっこを行の終わりに置かない', () => {
  let r = engine('<p id=p style="margin:0">あいう、えお</p>', '', 30);
  assert.equal(lineTexts(r.box('p')).join('|'), 'あい|う、え|お');
  r = engine('<p id=p style="margin:0">「あいう」</p>', '', 20);
  assert.equal(lineTexts(r.box('p')).join('|'), '「あ|い|う」');
});

test('小さなエンジン: 行の終わりの全角の閉じかっこは、そのままでは入らないときだけ半分の幅にする', () => {
  let r = engine('<p id=p style="margin:0">あいう）</p>', '', 35);
  assert.equal(lineTexts(r.box('p')).join('|'), 'あいう）');
  assert.equal(r.box('p').lines[0].w, 35);
  r = engine('<p id=p style="margin:0">あいう）</p>', '', 50);
  assert.equal(r.box('p').lines[0].w, 40);
});

test('小さなエンジン: 前の記号と並んで詰まった開きかっこは、行の頭に来ると元の幅に戻る', () => {
  // 偽の字形: 「。「」と並ぶと 5px 詰まる（「「」が半分になる）
  const PAIR_M = { width: (font, t) => [...t].length * 10 - 5 * (t.split('。「').length - 1), metrics: () => ({ asc: 12, desc: 4 }) };
  const { box } = engine('<p id=p style="margin:0">あ。「い</p>', '', 25, PAIR_M);
  assert.equal(lineTexts(box('p')).join('|'), 'あ。|「い');
  assert.equal(box('p').lines[1].w, 20);
});

test('小さなエンジン: text-align で行の左の位置が変わる', () => {
  const { box } = engine('<p id=c style="margin:0;text-align:center">abc</p><p id=r style="margin:0;text-align:right">abc</p>', '', 100);
  assert.equal(box('c').lines[0].runs[0].x, 35);
  assert.equal(box('r').lines[0].runs[0].x, 70);
});

test('小さなエンジン: 2 行にまたがる inline の箱は 2 つに分かれ、左の枠は最初、右の枠は最後にだけ付く', () => {
  const { L, byId } = engine('<p id=p style="margin:0">aa <span id=s style="padding:0 5px;border:1px solid red">bb cc</span></p>', '', 60);
  const fr = L.C.frags.get(byId('s'));
  assert.equal(fr.length, 2);
  assert.equal(fr[0].x, 30);
  assert.equal(fr[0].w, 26);
  assert.equal(fr[0].first, true);
  assert.equal(fr[0].last, false);
  assert.equal(fr[1].x, 0);
  assert.equal(fr[1].w, 26);
  assert.equal(fr[1].last, true);
  assert.equal(fr[1].y, 27);
  assert.equal(fr[0].h, 18);
});

test('小さなエンジン: block の背景を全部塗ってから、行の中身（inline の背景と文字）を描く', () => {
  const { X, L } = engine('<div style="background:#eee;padding:4px"><p style="background:#fcc">x <b style="background:#ff0">y</b></p></div>');
  const list = X.paintList(L);
  assert.equal(list.map((c) => c.op).join(','), 'rect,rect,rect,text,text');
  assert.equal(list[0].color, '#eee');
  assert.equal(list[2].color, '#ff0');
});

// ---- トラックパッドの振動で話す Nospeaker の仕組み ----
const HAPTIC = 'tr-20261124-haptic-voice';
const hv = () => trendCore(HAPTIC, ['kanaToMora', 'planSpeech', 'synthesize', 'levinson', 'autocorr', 'polyRoots', 'pitchOf', 'analyse', 'planMotor', 'renderMotor', 'spectrogram', 'median', 'rng']);

test('振動で話す: かなを拍に分ける（拗音・促音・長音・カタカナ・読めない字）', () => {
  const { kanaToMora } = hv();
  const r = kanaToMora('きゃっと、カー漢。');
  assert.deepEqual(Array.from(r.morae, (m) => m.c + (m.v || '')), ['kya', 'Q', 'to', 'P', 'ka', 'L', 'P']);
  assert.deepEqual(Array.from(r.skipped), ['漢']);
  assert.equal(r.morae[3].end, '、');
  assert.deepEqual(Array.from(kanaToMora('しゃ ちゅ にょ ふぁ').morae, (m) => m.c + m.v), ['sha', 'chu', 'nyo', 'fa']);
});

test('振動で話す: レビンソン・ダービンの方法で、2 次の自己回帰の係数を取り戻す', () => {
  const { levinson, autocorr, rng } = hv();
  const R = rng(5), n = 20000, x = new Float64Array(n);
  for (let i = 2; i < n; i++) x[i] = 1.3 * x[i - 1] - 0.6 * x[i - 2] + (R() - 0.5);
  const { a } = levinson(autocorr(x, 2), 2);
  assert.ok(Math.abs(a[1] + 1.3) < 0.03, String(a[1]));
  assert.ok(Math.abs(a[2] - 0.6) < 0.03, String(a[2]));
});

test('振動で話す: 多項式の根を全部求める（実数の根と複素数の根）', () => {
  const { polyRoots } = hv();
  // (z − 0.5)(z² − 0.6z + 0.73) の根は 0.5 と 0.3 ± 0.8i
  const roots = polyRoots([1, -1.1, 1.03, -0.365]).map((z) => [z.re, z.im]).sort((p, q) => p[1] - q[1]);
  const want = [[0.3, -0.8], [0.5, 0], [0.3, 0.8]];
  roots.forEach((z, i) => assert.ok(Math.hypot(z[0] - want[i][0], z[1] - want[i][1]) < 1e-9, JSON.stringify(z)));
});

test('振動で話す: 規則で合成した母音を分析すると、設計した共鳴と声の高さが出る', () => {
  const { kanaToMora, planSpeech, synthesize, analyse, median } = hv();
  const want = { 'あ': [750, 1200], 'い': [300, 2250], 'う': [340, 1350], 'え': [480, 1900], 'お': [480, 850] };
  for (const [v, [f1, f2]] of Object.entries(want)) {
    const wav = synthesize(planSpeech(kanaToMora(v + 'ーーー').morae, { f0: 120 }), 16000);
    const fr = analyse(wav, 16000).frames.filter((f) => f.voiced && f.level > 0.5);
    assert.ok(fr.length > 30, v);
    const m1 = median(fr.map((f) => f.F[0])), m2 = median(fr.map((f) => f.F[1])), p = median(fr.map((f) => f.f0));
    assert.ok(Math.abs(m1 - f1) < f1 * 0.12, `${v} F1 ${m1}`);
    assert.ok(Math.abs(m2 - f2) < f2 * 0.08, `${v} F2 ${m2}`);
    assert.ok(p > 100 && p < 140, `${v} f0 ${p}`);
  }
});

test('振動で話す: 声の高さは周期の 2 倍のずれを選ばない', () => {
  const { pitchOf } = hv();
  const x = new Float64Array(400);
  for (let i = 0; i < 400; i++) x[i] = Math.sin(2 * Math.PI * 125 * i / 16000) + 0.6 * Math.sin(2 * Math.PI * 250 * i / 16000 + 1);
  const r = pitchOf(x, 16000);
  assert.ok(Math.abs(r.f0 - 125) < 1.5, String(r.f0));
  assert.ok(r.r > 0.9);
});

test('振動で話す: 有声は声の周期ごと、無声は 4 ms ごとに命令を出し、強さの合計は 1', () => {
  const { planMotor } = hv();
  const fr = (t, o) => ({ t, level: 0.8, voiced: false, f0: 0, F: [700, 1200, 2600], A: [3, 1, 0.5], ...o });
  const frames = [];
  for (let i = 0; i < 30; i++) frames.push(fr(0.0125 + i * 0.01, i < 10 ? { voiced: true, f0: 125 } : i < 20 ? {} : { level: 0 }));
  const { acts } = planMotor({ hop: 0.01, dur: 0.31, frames }, { tones: 2 });
  const voice = acts.filter((a) => a.kind === 'voice'), hiss = acts.filter((a) => a.kind === 'hiss');
  assert.ok(voice.length >= 12 && voice.length <= 14, String(voice.length));
  for (const a of voice) {
    assert.ok(Math.abs(a.dur - 0.008) < 1e-12);
    assert.deepEqual(Array.from(a.tones, (q) => q.hz), [700, 1200]);
    assert.ok(Math.abs(a.tones[0].amp + a.tones[1].amp - 1) < 1e-12);
    assert.ok(Math.abs(a.tones[1].amp / a.tones[0].amp - 1.8 / 3) < 1e-12);   // F2 は 1.8 倍して配る
  }
  assert.ok(hiss.length >= 23 && hiss.length <= 27, String(hiss.length));
  for (const a of hiss) {
    assert.equal(a.tones.length, 3);
    for (const q of a.tones) assert.ok(q.hz >= 2700 && q.hz <= 4300);
  }
  assert.ok(acts.every((a) => a.t < 0.215));   // 音の無いフレームでは命令を出さない
  assert.equal(planMotor({ hop: 0.01, dur: 0.31, frames }, { tones: 1 }).acts.filter((a) => a.kind === 'voice')[0].tones.length, 1);
  assert.equal(planMotor({ hop: 0.01, dur: 0.31, frames }, { hiss: false }).acts.filter((a) => a.kind === 'hiss').length, 0);
});

test('振動で話す: 鳴らし直すと命令の始まりで位相が 0 に戻り、鳴らし直さないと続く', () => {
  const { renderMotor } = hv();
  const plan = { total: 0.02, acts: [0, 0.008].map((t) => ({ t, dur: 0.008, level: 1, kind: 'voice', tones: [{ hz: 700, amp: 1 }] })) };
  const sr = 16000, i0 = 128, w = 2 * Math.PI * 700 / sr;
  const a = renderMotor(plan, sr, { restart: true }), b = renderMotor(plan, sr, { restart: false });
  assert.ok(Math.abs(a[i0]) < 1e-6 && Math.abs(a[i0 + 1] - Math.sin(w)) < 1e-6);
  assert.ok(Math.abs(b[i0] - Math.sin(w * i0)) < 1e-6);
  assert.ok(Math.max(...a.map(Math.abs)) <= 1 + 1e-9);
});

test('振動で話す: 周波数の図で 1 kHz の正弦波は 1 kHz の列が一番強い', () => {
  const { spectrogram } = hv();
  const x = new Float32Array(4000);
  for (let i = 0; i < x.length; i++) x[i] = Math.sin(2 * Math.PI * 1000 * i / 16000);
  const sp = spectrogram(x, 16000, 4500);
  assert.equal(sp.bins, 144);
  let best = 0;
  for (let b = 0; b < sp.bins; b++) if (sp.db[b] > sp.db[best]) best = b;
  assert.equal(best, 32);
});

// ---- unkernel の考え方（RISC-V のプログラムを真似て、カーネルは JavaScript のまま動かす） ----
const UNK = 'tr-20261125-unkernel-syscall';
const uk = () => trendCore(UNK, ['assemble', 'newMachine', 'run', 'kernelImage', 'build', 'runToEnd', 'disasm', 'PROGRAMS', 'ULO']);
// 作ったプログラムを最後まで動かし、レジスタと書いた文字を返す
function ukRun(U, src, emu, pointer) {
  const out = [], frames = [];
  const dev = {
    write: (b) => { for (const v of b) out.push(v); },
    present: (px, w, h) => frames.push({ w, h, px: Uint8Array.from(px) }),
    pointer: () => pointer || { x: 0, y: 0, b: 0 },
  };
  const m = U.newMachine(U.assemble(src, U.ULO), emu ? U.kernelImage() : null, 7);
  for (let k = 0; k < 100 && !m.halted && !frames.length; k++) { U.run(m, 1e6, dev); m.waiting = false; }
  return { m, out, frames };
}

test('unkernel: 組み立て器が RISC-V の決まりどおりの機械語を作る', () => {
  const U = uk();
  const p = U.assemble('_start:\n  addi a0, zero, 172\n  sw ra, 28(sp)\n  lui t6, 0x10000\n  ecall\n  mret\n  li t0, 0xff4a3a2b\n  beq a0, a1, _start\n', 0x1000);
  const w = Array.from(p.words, (x) => x.word);
  assert.deepEqual(w.slice(0, 5), [0x0ac00513, 0x00112e23, 0x10000fb7, 0x00000073, 0x30200073]);
  assert.equal(w.length, 8, 'li の大きな値は lui と addi の 2 つになる');
  assert.equal(U.disasm(w[7], p.words[7].addr), 'beq a0, a1, 0x00001000');
  assert.throws(() => U.assemble('_start:\n  foo a0\n', 0x1000), /2 行/);
  for (const nm of Object.keys(U.PROGRAMS)) {
    for (const x of U.build(nm).words) assert.ok(!U.disasm(x.word, x.addr).startsWith('.word'), nm + ' の命令を読み戻せる');
  }
});

test('unkernel: li の大きな値・掛け算・割り算・0 で割る', () => {
  const U = uk();
  const src = `_start:
  li s0, 0xff4a3a2b
  li t0, -7
  li t1, 2
  div s1, t0, t1
  rem s2, t0, t1
  divu s3, t0, t1
  li t2, 0
  div s4, t0, t2
  remu s5, t0, t2
  li t3, 100000
  mul s6, t3, t3
  mulhu s7, t3, t3
  li a7, 93
  ecall
`;
  const { m } = ukRun(U, src, false);
  assert.equal(m.x[8], 0xff4a3a2b | 0);
  assert.equal(m.x[9], -3);
  assert.equal(m.x[18], -1);
  assert.equal(m.x[19], 0x7ffffffc);
  assert.equal(m.x[20], -1);
  assert.equal(m.x[21], -7);
  assert.equal(m.x[22], (1e10 % 2 ** 32) | 0);
  assert.equal(m.x[23], Math.floor(1e10 / 2 ** 32));
});

test('unkernel: 2 つのカーネルで、書く文字と利用者の命令の数が同じになる', () => {
  const U = uk();
  for (const nm of ['hello', 'bench']) {
    const a = U.runToEnd(nm, false), b = U.runToEnd(nm, true);
    assert.equal(a.text, b.text);
    assert.equal(a.m.user, b.m.user);
    assert.equal(a.m.sys, b.m.sys);
    assert.equal(a.m.kern, 0, 'そのままのカーネルは命令を真似ない');
    assert.ok(b.m.kern > 0);
  }
  const b = U.runToEnd('bench', true);
  assert.match(b.text, /getpid を 20000 回呼びました（返った番号の合計 20000）/);
  assert.equal(b.m.sys, 20004);
  assert.equal(Math.round(b.m.kern / b.m.sys), 71, 'getpid 1 回で真似る命令は約 71 個');
  assert.ok(b.m.kern > 14 * b.m.user);
});

test('unkernel: 真似るカーネルもレジスタを壊さず、同じ誤りの番号を返す', () => {
  const U = uk();
  const src = `_start:
  li s2, 12345
  li t3, 777
  li a0, 1
  li a1, 0x10
  li a2, 4
  li a7, 64
  ecall
  mv s0, a0
  li a7, 999
  ecall
  mv s1, a0
  li a0, 0x2000
  li a1, 0
  li a2, 4
  li a7, 0x400
  ecall
  mv s3, a0
  li a0, 0x3fff0
  li a1, 16
  li a2, 16
  li a7, 0x400
  ecall
  mv s4, a0
  li a7, 93
  li a0, 3
  ecall
`;
  for (const emu of [false, true]) {
    const { m } = ukRun(U, src, emu);
    assert.equal(m.code, 3);
    assert.deepEqual([m.x[8], m.x[9], m.x[19], m.x[20]], [-14, -38, -22, -14], emu ? '真似る' : 'そのまま');
    assert.equal(m.x[18], 12345);
    assert.equal(m.x[28], 777);
  }
});

test('unkernel: 0 番地を読むとカーネルが止める', () => {
  const U = uk();
  for (const emu of [false, true]) {
    const r = U.runToEnd('crash', emu);
    assert.match(r.text, /0 番地を読んでみます/);
    assert.match(r.m.fault, /Segmentation fault（0x00000000 番地を読もう/);
  }
});

test('unkernel: eyes の黒目がマウスの方へ動き、2 つのカーネルで同じ絵になる', () => {
  const U = uk();
  const at =(f, x, y) => { const i = (y * f.w + x) * 4; return f.px[i] | (f.px[i + 1] << 8) | (f.px[i + 2] << 16) | (f.px[i + 3] << 24); };
  const shot = (emu, pointer) => {
    const out = [], frames = [];
    const dev = { write: (b) => out.push(...b), present: (px, w, h) => frames.push({ w, h, px: Uint8Array.from(px) }), pointer: () => pointer };
    const m = U.newMachine(U.build('eyes'), emu ? U.kernelImage() : null, 3);
    for (let k = 0; k < 10 && !frames.length; k++) U.run(m, 1e6, dev);
    return frames[0];
  };
  const PUPIL = 0xff2a2420 | 0, WHITE = 0xffeaf4f7 | 0, HOT = 0xff3a46d8 | 0, BG = 0xff4a3a2b | 0;
  const right = shot(false, { x: 900, y: 36, b: 0 });
  assert.equal(right.w, 120);
  assert.equal(right.h, 72);
  assert.equal(at(right, 33 + 16, 36), PUPIL, '右を見る');
  assert.equal(at(right, 33 - 16, 36), WHITE);
  assert.equal(at(right, 0, 0), BG);
  const up = shot(true, { x: 87, y: -500, b: 1 });
  assert.equal(at(up, 87, 36 - 16), HOT, '上を見て、押している間は赤い');
  assert.equal(at(up, 87, 36 + 16), WHITE);
  assert.deepEqual(Array.from(shot(true, { x: 900, y: 36, b: 0 }).px), Array.from(right.px));
});

// ---- 行列の掛け算を少ない回数で（tr-20261125-matmul-rank） ----
const MATMUL = 'tr-20261125-matmul-rank';
const MM_NAMES = ['seeded', 'mmTensor', 'strassen', 'mulPlain', 'mulWith', 'usedCount', 'countAdds', 'algText', 'wrongCells',
  'runStart', 'matPlain', 'matStrassen', 'multCount', 'maxDiff', 'omegaFrom', 'omegaRect', 'lowerBound'];

test('行列の積: 表の 1 のマスは m·k·n 個で、Strassen の 7 回は表と整数として一致する', () => {
  const { mmTensor, strassen, wrongCells, usedCount, countAdds } = trendCore(MATMUL, MM_NAMES);
  const t = mmTensor(2, 2, 2);
  assert.equal(t.T.reduce((s, v) => s + v, 0), 8);
  assert.equal(t.nz.length, 24);
  assert.equal(mmTensor(2, 3, 4).T.reduce((s, v) => s + v, 0), 24);
  const st = strassen();
  assert.equal(wrongCells(t, st), 0);
  assert.equal(usedCount(st), 7);
  assert.equal(countAdds(st), 18);
  // 係数を 1 つ変えると一致しなくなる
  const bad = { ...st, U: st.U.slice() };
  bad.U[0] = 0;
  assert.ok(wrongCells(t, bad) > 0);
});

test('行列の積: Strassen で掛けた答えは、そのまま掛けた答えと整数で一致し、掛け算は 7 回', () => {
  const { strassen, mulWith, mulPlain, seeded } = trendCore(MATMUL, MM_NAMES);
  const st = strassen();
  const rand = seeded(5);
  const ri = () => Math.floor(rand() * 41) - 20;
  for (let n = 0; n < 50; n++) {
    const A = [ri(), ri(), ri(), ri()], B = [ri(), ri(), ri(), ri()];
    const res = mulWith(st, A, B);
    assert.deepEqual(Array.from(res.C), Array.from(mulPlain(A, B, 2, 2, 2)));
    assert.equal(res.mults, 7);
  }
});

test('行列の積: 式の文字は M1 = (A11 + A22)·(B11 + B22) の形になる', () => {
  const { strassen, algText } = trendCore(MATMUL, MM_NAMES);
  const tx = algText(strassen());
  assert.equal(tx.prods.length, 7);
  assert.equal(tx.prods[0].text, '(A11 + A22)·(B11 + B22)');
  assert.equal(tx.prods[1].text, '(A21 + A22)·B11');
  assert.equal(tx.prods[3].text, 'A22·(−B11 + B21)');
  assert.equal(tx.outs[0].text, 'M1 + M4 − M5 + M7');
  assert.equal(tx.outs[3].text, 'M1 − M2 + M3 + M6');
});

test('行列の積: 交互最小二乗法は 2×2 を 7 回で掛けるやり方を見つけ、丸めた係数は −1・0・1 で表と一致する', () => {
  const { mmTensor, runStart, wrongCells, usedCount } = trendCore(MATMUL, MM_NAMES);
  const ten = mmTensor(2, 2, 2);
  let exact = null, seed = 1;
  for (; seed <= 16 && !exact; seed++) {
    const st = runStart(ten, 7, seed, 2000);
    if (st.result === 'exact') exact = st.exact;
  }
  assert.ok(exact, '種 1〜16 のどれかで正確なやり方が見つかる');
  assert.equal(wrongCells(ten, exact), 0);
  assert.equal(usedCount(exact), 7);
  for (const v of [...exact.U, ...exact.V, ...exact.W]) assert.ok(v === -1 || v === 0 || v === 1);
});

test('行列の積: 2×2 を 6 回では、どの始めも誤差が 0 に近づかない', () => {
  const { mmTensor, runStart } = trendCore(MATMUL, MM_NAMES);
  const ten = mmTensor(2, 2, 2);
  for (let seed = 1; seed <= 6; seed++) {
    const st = runStart(ten, 6, seed, 2000);
    assert.equal(st.result, 'stuck');
    assert.ok(st.err > 0.1, '種 ' + seed + ' の誤差 ' + st.err);
  }
});

test('行列の積: 大きな行列の Strassen はそのまま掛けた答えと合い、掛け算の回数は 1 段ごとに 7/8 倍', () => {
  const { matPlain, matStrassen, multCount, maxDiff, seeded } = trendCore(MATMUL, MM_NAMES);
  const rand = seeded(11), n = 64;
  const A = new Float64Array(n * n), B = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) { A[i] = rand() * 2 - 1; B[i] = rand() * 2 - 1; }
  assert.ok(maxDiff(matPlain(A, B, n), matStrassen(A, B, n, 8)) < 1e-9);
  assert.equal(multCount(64, 64), 262144);
  assert.equal(multCount(64, 8), 343 * 512);
  // 奇数になったらそのまま掛ける
  assert.equal(multCount(6, 1), 7 * 27);
});

test('行列の積: 指数の式と、論文の下界 n^{9/4} の切り上げ', () => {
  const { omegaFrom, omegaRect, lowerBound } = trendCore(MATMUL, MM_NAMES);
  assert.ok(near(omegaFrom(2, 7), Math.log2(7)));
  assert.ok(near(omegaRect(2, 2, 2, 7), Math.log2(7)));
  // Bini ほかの 2×2 と 2×3 の 10 回から出る指数 2.7799
  assert.ok(near(omegaRect(2, 2, 3, 10), 2.7799, 1e-4));
  assert.equal(lowerBound(2), 5);
  assert.equal(lowerBound(3), 12);
  assert.equal(lowerBound(4), 23);
  assert.equal(lowerBound(16), 512);
  assert.equal(lowerBound(81), 19683);
});

const CLICK = 'tr-20261125-click-synth';
const CK_NAMES = ['rng', 'KINDS', 'synthClick', 'centroid', 'contactTime', 'softness'];

test('ボタンの音: 同じ種なら同じ乱数の列、値は 0 以上 1 未満', () => {
  const { rng } = trendCore(CLICK, CK_NAMES);
  const a = rng(42), b = rng(42), c = rng(43);
  const xa = Array.from({ length: 50 }, a), xb = Array.from({ length: 50 }, b), xc = Array.from({ length: 50 }, c);
  assert.deepEqual(xa, xb);
  assert.notDeepEqual(xa, xc);
  for (const x of xa) assert.ok(x >= 0 && x < 1);
});

test('ボタンの音: 硬さから当たりの長さ、高い響きほど硬さの影響を受ける', () => {
  const { contactTime, softness } = trendCore(CLICK, CK_NAMES);
  assert.ok(near(contactTime(0), 0.0016));
  assert.ok(near(contactTime(1), 0.00016));
  assert.ok(near(contactTime(2), 0.00016), '1 より大きい硬さは 1 として扱う');
  assert.equal(softness(0, 0.001), 1);
  assert.ok(near(softness(1000, 0.001), 0.5));
  assert.ok(softness(4000, 0.001) < softness(1000, 0.001));
});

test('ボタンの音: 同じ種なら同じ波、種が違えば違う波。長さ・当たりの数・大きさの上限を守る', () => {
  const { KINDS, synthClick } = trendCore(CLICK, CK_NAMES);
  for (const kind of Object.keys(KINDS)) {
    for (const phase of ['down', 'up']) {
      const o = { sr: 48000, kind, phase, seed: 9, vary: 0.7 };
      const a = synthClick(o), b = synthClick(o), c = synthClick({ ...o, seed: 10 });
      assert.deepEqual(Array.from(a.data), Array.from(b.data), kind + phase);
      assert.notDeepEqual(Array.from(a.data), Array.from(c.data), kind + phase);
      assert.equal(a.data.length, Math.round(a.dur * 48000));
      assert.ok(a.dur > 0.01 && a.dur <= 0.6 + 1e-9);
      assert.equal(a.events.length, KINDS[kind][phase].length);
      for (let i = 1; i < a.events.length; i++) assert.ok(a.events[i] > a.events[i - 1]);
      let mx = 0;
      for (const x of a.data) { assert.ok(Number.isFinite(x)); mx = Math.max(mx, Math.abs(x)); }
      assert.ok(mx <= 1 && near(mx, a.peak, 1e-6));
    }
  }
});

test('ボタンの音: ばらつき 0 の押す音は一番大きい所が 0.6 にそろい、最後は十分に小さくなる', () => {
  const { KINDS, synthClick } = trendCore(CLICK, CK_NAMES);
  for (const kind of Object.keys(KINDS)) {
    for (const opt of [{}, { size: 0.6, hard: 0, ring: 2.5 }, { size: 1.6, hard: 1, ring: 0.4 }]) {
      const r = synthClick({ sr: 44100, kind, phase: 'down', seed: 7, vary: 0, ...opt });
      assert.ok(near(r.peak, 0.6, 1e-6), kind + ' ' + r.peak);
      const tail = r.data.subarray(Math.floor(r.data.length * 0.95));
      let tm = 0;
      for (const x of tail) tm = Math.max(tm, Math.abs(x));
      assert.ok(tm < 0.02, kind + ' の最後の 5% が ' + tm);
    }
  }
});

test('ボタンの音: 音の中心の高さは、正弦波ならその周波数。硬いほど高く、大きいほど低い', () => {
  const { synthClick, centroid } = trendCore(CLICK, CK_NAMES);
  const sr = 48000, s = new Float32Array(2048), two = new Float32Array(2048);
  for (let i = 0; i < s.length; i++) {
    s[i] = Math.sin((2 * Math.PI * 3000 * i) / sr);
    two[i] = Math.sin((2 * Math.PI * 1500 * i) / sr) + Math.sin((2 * Math.PI * 4500 * i) / sr);
  }
  assert.ok(Math.abs(centroid(s, sr) - 3000) < 30);
  assert.ok(Math.abs(centroid(two, sr) - 3000) < 60);
  assert.equal(centroid(new Float32Array(4), sr), 0);
  const c = (o) => centroid(synthClick({ sr, kind: 'key', phase: 'down', seed: 3, vary: 0, ...o }).data, sr);
  assert.ok(c({ hard: 0 }) < c({ hard: 1 }));
  assert.ok(c({ size: 1.6 }) < c({ size: 0.6 }));
});

const LEQ = 'tr-20261126-loudness-eq';
const LQ_NAMES = ['frameSize', 'riseRate', 'riseSeconds', 'loudnessOf', 'targetGain', 'fft', 'equalize', 'lookahead', 'limit', 'rmsDb', 'spread'];
// 決まった乱数（線形合同法）で、実効値 rms のおおよそ正規分布の雑音を作る
function lqNoise(n, rms, seed) {
  let s = seed >>> 0;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < 12; k++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      sum += s / 4294967296;
    }
    a[i] = (sum - 6) * rms;
  }
  return a;
}

test('音量の均一化: 調べる長さと、戻りの速さごとの時定数（r = 4 で約 4.6 秒）', () => {
  const { frameSize, riseSeconds } = trendCore(LEQ, LQ_NAMES);
  assert.equal(frameSize(44100), 512);
  assert.equal(frameSize(48000), 512);
  assert.equal(frameSize(96000), 1024);
  assert.equal(frameSize(16000), 256);
  assert.ok(Math.abs(riseSeconds(48000, 4) - 4.6) < 0.05);
  assert.ok(Math.abs(riseSeconds(44100, 4) - 4.6) < 0.05);
  for (let r = 2; r < 7; r++) assert.ok(riseSeconds(48000, r) < riseSeconds(48000, r + 1));
  assert.ok(riseSeconds(48000, 2) < 0.2);
});

test('音量の均一化: FFT は素直な離散フーリエ変換と同じ値を返す', () => {
  const { fft } = trendCore(LEQ, LQ_NAMES);
  const n = 16, x = lqNoise(n, 1, 5), re = Float64Array.from(x), im = new Float64Array(n);
  fft(re, im);
  for (let k = 0; k < n; k++) {
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      a += x[i] * Math.cos((2 * Math.PI * k * i) / n);
      b -= x[i] * Math.sin((2 * Math.PI * k * i) / n);
    }
    assert.ok(near(re[k], a, 1e-9) && near(im[k], b, 1e-9), 'k=' + k);
  }
});

test('音量の均一化: 目標のゲインは L = 1300 で 1 倍、小さい音は最大 10 倍、L が 2 倍なら 2^−1.6 倍', () => {
  const { targetGain, loudnessOf } = trendCore(LEQ, LQ_NAMES);
  assert.ok(near(targetGain(1300), 1, 1e-12));
  assert.equal(targetGain(1), 10);
  assert.equal(targetGain(0), 10);
  assert.ok(near(targetGain(2600), Math.pow(2, -1.6), 1e-12));
  assert.ok(loudnessOf(new Float64Array(25)) < 1e-6);
});

test('音量の均一化: 小さい音はゆっくり持ち上げ、大きな音が来たらすぐ下げる', () => {
  const { equalize, targetGain } = trendCore(LEQ, LQ_NAMES);
  const fs = 48000;
  const quiet = lqNoise(fs * 6, 0.003, 1), loud = lqNoise(fs * 2, 0.3, 2);
  const x = new Float32Array(quiet.length + loud.length);
  x.set(quiet, 0);
  x.set(loud, quiet.length);
  const r = equalize([x], fs, 4);
  const at = (t) => r.gains[Math.floor((t * fs) / r.hop)];
  // 時定数 4.6 秒で 10 倍へ近づく: 1 秒後は 1 + 9·(1 − e^(−1/4.6)) ≈ 2.8
  assert.ok(at(1) > 2.3 && at(1) < 3.3, '1 秒後 ' + at(1));
  assert.ok(at(1) < at(3) && at(3) < at(5.9));
  // 大きい音だけの最初のブロックで、その目標まで一度に下がる
  const k0 = (6 * fs) / r.hop;
  assert.ok(r.gains[k0] < 1.2, '下がったゲイン ' + r.gains[k0]);
  assert.ok(near(r.gains[k0], targetGain(r.loud[k0]), 1e-6));
  assert.ok(r.loud[k0] > r.loud[100] * 5);
  // 出力は、入力に前のブロックから今のブロックへ直線でつないだゲインをかけたもの
  const j = Math.floor(7 * fs) + 77, k = Math.floor(j / r.hop);
  const want = x[j] * (r.gains[k - 1] + ((r.gains[k] - r.gains[k - 1]) * (j - k * r.hop)) / r.hop);
  assert.ok(near(r.out[0][j], want, 1e-6));
});

test('音量の均一化: 戻りが速いほど、小さい所と大きい所の差が縮まる', () => {
  const { equalize, spread } = trendCore(LEQ, LQ_NAMES);
  const fs = 48000, seg = fs * 3, x = new Float32Array(seg * 6);
  for (let s = 0; s < 6; s++) x.set(lqNoise(seg, s % 2 ? 0.3 : 0.01, 11 + s), s * seg);
  const before = spread([x], fs);
  const fast = spread(equalize([x], fs, 2).out, fs), slow = spread(equalize([x], fs, 6).out, fs);
  assert.ok(before > 25, '元 ' + before);
  assert.ok(fast < before - 10, '速い ' + fast);
  assert.ok(fast < slow, '速い ' + fast + ' 遅い ' + slow);
});

test('音量の均一化: リミッターは出口を 0.99 以下に抑え、小さい所はそのまま通す', () => {
  const { limit, lookahead } = trendCore(LEQ, LQ_NAMES);
  const fs = 48000, n = fs * 3;
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / fs, amp = t < 1 ? 0.2 : t < 2 ? 1.6 : 0.2;
    a[i] = amp * Math.sin(2 * Math.PI * 1800 * t);
    b[i] = a[i] * 0.5;
  }
  const orig = Float32Array.from(a);
  const gain = limit([a, b], fs);
  let pk = 0;
  for (const v of a) pk = Math.max(pk, Math.abs(v));
  assert.ok(pk <= 0.99, '山 ' + pk);
  // 大きい音より先読みの長さ以上前は、何も変えない
  const La = lookahead(fs);
  for (let i = 0; i < fs - La - 1; i++) assert.equal(a[i], orig[i]);
  // 大きい所では約 0.985/1.6 まで下げ、2 チャンネルで同じゲインを使う
  const m = Math.floor(1.5 * fs);
  assert.ok(Math.abs(gain[m] - 0.985 / 1.6) < 0.01, 'ゲイン ' + gain[m]);
  assert.ok(near(b[m], a[m] * 0.5, 1e-6));
  // 小さくなったら戻り、最後は 1 倍
  assert.equal(gain[n - 1], 1);
  // 不規則な強い山でも 0.99 を超えない
  const z = lqNoise(fs, 0.8, 9);
  for (let i = 0; i < z.length; i += 997) z[i] *= 4;
  limit([z], fs);
  let zp = 0;
  for (const v of z) zp = Math.max(zp, Math.abs(v));
  assert.ok(zp <= 0.99, '山 ' + zp);
});

test('音量の均一化: 区間の実効値は、振幅 A の正弦波なら 20·log10(A/√2) dB。2 チャンネルはまとめて数える', () => {
  const { rmsDb } = trendCore(LEQ, LQ_NAMES);
  const fs = 8000, x = new Float32Array(fs * 2), y = new Float32Array(fs * 2);
  for (let i = 0; i < x.length; i++) {
    x[i] = (i < fs ? 0.1 : 1) * Math.sin((2 * Math.PI * 400 * i) / fs);
    y[i] = 0;
  }
  assert.ok(Math.abs(rmsDb([x], fs, 0, 1) - 20 * Math.log10(0.1 / Math.SQRT2)) < 0.01);
  assert.ok(Math.abs(rmsDb([x], fs, 1, 2) - 20 * Math.log10(1 / Math.SQRT2)) < 0.01);
  // 片方が無音なら、力は半分（−3 dB）
  assert.ok(Math.abs(rmsDb([x, y], fs, 1, 2) - (20 * Math.log10(1 / Math.SQRT2) - 10 * Math.log10(2))) < 0.01);
  // 範囲の外や長さ 0 は −∞
  assert.equal(rmsDb([x], fs, 3, 4), -Infinity);
  assert.equal(rmsDb([x], fs, 1, 1), -Infinity);
});

test('音量の均一化: 散らばりは 0.4 秒ごとの大きさの上位 10% と下位 10% の差で、無音は数えない', () => {
  const { spread } = trendCore(LEQ, LQ_NAMES);
  const fs = 8000, half = fs * 10, x = new Float32Array(half * 2);
  for (let i = 0; i < x.length; i++) x[i] = (i < half ? 0.01 : 0.316) * Math.SQRT2 * Math.sin((2 * Math.PI * 440 * i) / fs);
  assert.ok(Math.abs(spread([x], fs) - 30) < 0.2, '差 ' + spread([x], fs));
  assert.equal(spread([new Float32Array(fs * 4)], fs), 0);
  assert.ok(spread([x.subarray(half)], fs) < 0.1);
  // ref を渡すと、元の音で無音（−50 dB 未満）だった所は、持ち上がっても数えない
  const src = new Float32Array(fs * 12), out = new Float32Array(fs * 12);
  for (let i = 0; i < src.length; i++) {
    const t = i / fs, s = Math.SQRT2 * Math.sin((2 * Math.PI * 440 * i) / fs);
    src[i] = (t < 4 ? 0.001 : t < 8 ? 0.01 : 0.316) * s;
    out[i] = src[i] * (t < 8 ? 10 : 1);
  }
  assert.ok(Math.abs(spread([src], fs) - 30) < 0.2);
  assert.ok(spread([out], fs) > 25, '無音だった所も数えると差が残る');
  assert.ok(Math.abs(spread([out], fs, 0.4, [src]) - 10) < 0.2, '同じ区間なら −20 dB と −10 dB の差');
});

const SCTL = 'tr-20261126-scroll-controller';
const SC_NAMES = ['rateOf', 'nextTick', 'frameOf', 'finest', 'speedOf', 'recenter', 'dialOf', 'rotAxis', 'mul3', 'apply3', 'orth', 'rollBy'];

test('スクロールのコントローラー: 読んだ回数はまとめた分も数え、新しい位置は 1 つ前と違う回だけ数える', () => {
  const { rateOf } = trendCore(SCTL, SC_NAMES);
  const s = [
    { t: 100, x: 0, y: 0, n: 1 }, // 窓の外（1 つ前の値としては使う）
    { t: 600, x: 0, y: 0, n: 1 },
    { t: 700, x: 1, y: 0, n: 3 },
    { t: 800, x: 1, y: 0, n: 1 },
    { t: 900, x: 1, y: 2, n: 1 },
    { t: 1200, x: 5, y: 5, n: 1 }, // 窓より後
  ];
  const q = rateOf(s, 1000, 500);
  assert.equal(q.reads, (1 + 3 + 1 + 1) * 2);
  assert.equal(q.changes, 2 * 2);
  const empty = rateOf([], 1000, 1000);
  assert.deepEqual([empty.reads, empty.changes], [0, 0]);
  // 先頭の 1 つは比べる相手が無いので、変わった回に数えない
  assert.equal(rateOf([{ t: 10, x: 3, y: 3 }], 100, 1000).changes, 0);
  assert.equal(rateOf([{ t: 10, x: 3, y: 3 }], 100, 1000).reads, 1);
});

test('スクロールのコントローラー: 次に読む時刻は描画の拍を div 等分した位置にそろい、0.25 ms より近すぎる時は次へ送る', () => {
  const { nextTick } = trendCore(SCTL, SC_NAMES);
  assert.equal(nextTick(10, 0, 16, 2), 16);
  assert.equal(nextTick(16, 0, 16, 2), 24);
  assert.equal(nextTick(7.9, 0, 16, 2), 16);
  assert.equal(nextTick(3, 0, 16, 1), 16);
  // 拍の時刻 base が今より後でも、base からさかのぼった刻みの上に乗る
  assert.equal(nextTick(100, 110, 10, 2), 105);
  // 120 Hz の画面（8.33 ms）を 2 回に分けると 4.17 ms おき
  const t = nextTick(1000, 1000, 1000 / 120, 2);
  assert.ok(Math.abs(t - (1000 + 1000 / 240)) < 1e-9);
  // おかしな値では 16 ms 後
  assert.equal(nextTick(50, NaN, 16, 2), 66);
  assert.equal(nextTick(50, 0, 0, 2), 66);
});

test('スクロールのコントローラー: 1 拍の長さは間隔の中央値で、止まっていた間の長い間隔に引っぱられない', () => {
  const { frameOf } = trendCore(SCTL, SC_NAMES);
  assert.equal(frameOf([16, 17, 16, 400, 16]), 16);
  assert.equal(frameOf([8, 9]), 8.5);
  assert.ok(Math.abs(frameOf([]) - 1000 / 60) < 1e-9);
  assert.ok(Math.abs(frameOf([500, 1]) - 1000 / 60) < 1e-9);
});

test('スクロールのコントローラー: 細かさは隣どうしの 0 でない差の最小、速さは最初と最後の読みから', () => {
  const { finest, speedOf } = trendCore(SCTL, SC_NAMES);
  assert.equal(finest([0, 1, 3, 3, 3.25, 5]), 0.25);
  assert.equal(finest([2, 2, 2]), 0);
  assert.equal(finest([]), 0);
  const s = [{ t: 0, x: 0, y: 0 }, { t: 50, x: 3, y: 4 }, { t: 100, x: 6, y: 8 }];
  assert.ok(Math.abs(speedOf(s, 100, 200) - 100) < 1e-9);
  assert.ok(Math.abs(speedOf(s, 100, 60) - 100) < 1e-9);
  assert.equal(speedOf(s, 100, 10), 0); // 1 つしか入らない
  assert.equal(speedOf([], 100, 100), 0);
});

test('スクロールのコントローラー: 端に近いときだけ真ん中へ戻し、目盛りは近い方へ丸めて範囲に収める', () => {
  const { recenter, dialOf } = trendCore(SCTL, SC_NAMES);
  assert.equal(recenter(500, 40000, 6000), 20000);
  assert.equal(recenter(39000, 40000, 6000), 20000);
  assert.equal(recenter(12345, 40000, 6000), 12345);
  assert.equal(recenter(10, 100, 60), 10, '領域が小さすぎる時は戻さない');
  let q = dialOf(0, 80, 21, -135, 135);
  assert.deepEqual([q.idx, q.angle], [0, -135]);
  q = dialOf(1600, 80, 21, -135, 135);
  assert.deepEqual([q.idx, q.angle], [20, 135]);
  q = dialOf(130, 80, 21, -135, 135);
  assert.equal(q.idx, 2);
  assert.ok(Math.abs(q.angle - (-135 + 1.625 * 13.5)) < 1e-9);
  // 跳ね返りで範囲の外に出ても、目盛りは端に収め、角度はそのまま出す
  q = dialOf(-40, 80, 21, -135, 135);
  assert.equal(q.idx, 0);
  assert.ok(q.angle < -135);
  assert.equal(dialOf(9999, 80, 21, -135, 135).idx, 20);
});

test('スクロールのコントローラー: トラックボールは手前の点を指と同じ向きに r 分の d ラジアン回し、行列は回転のまま保つ', () => {
  const { rollBy, apply3, mul3, orth, rotAxis } = trendCore(SCTL, SC_NAMES);
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  // 右へ 10 px、半径 10 px なら 1 ラジアン右へ
  assert.ok(close(apply3(rollBy(I, 10, 0, 10), [0, 0, 1]), [Math.sin(1), 0, Math.cos(1)]));
  // 下へ動かすと手前の点は下（+y）へ
  assert.ok(close(apply3(rollBy(I, 0, 10, 10), [0, 0, 1]), [0, Math.sin(1), Math.cos(1)]));
  // 動かさなければそのまま
  assert.equal(rollBy(I, 0, 0, 10), I);
  // 半径 r の円周の長さだけ動かすと 1 周して戻る
  let M = I;
  for (let i = 0; i < 100; i++) M = rollBy(M, (2 * Math.PI * 30) / 100, 0, 30);
  assert.ok(close(apply3(M, [0, 0, 1]), [0, 0, 1]));
  // いろいろな向きに 2000 回回しても、行と列は長さ 1 で直交し、行列式は 1
  M = I;
  for (let i = 0; i < 2000; i++) M = rollBy(M, Math.sin(i) * 7, Math.cos(i * 1.3) * 5, 40);
  const T = [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
  assert.ok(close(mul3(M, T), I));
  const det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
  assert.ok(Math.abs(det - 1) < 1e-9);
  // orth はゆがんだ行列を回転に戻し、回転にはほとんど手を加えない
  const R = rotAxis(1, 2, 3, 0.7);
  assert.ok(close(orth(R), R));
  const bent = R.map((v, i) => v + (i % 4 === 0 ? 1e-3 : 0));
  const O = orth(bent), OT = [O[0], O[3], O[6], O[1], O[4], O[7], O[2], O[5], O[8]];
  assert.ok(close(mul3(O, OT), I));
});

// ---- 二次ふるい法（2026-11-26） ----
const QSID = 'tr-20261126-quadratic-sieve';
const QS_NAMES = ['bmod', 'powmod', 'gcd', 'isqrt', 'iroot', 'perfectPower', 'isPrime', 'seeded', 'semiprime', 'primesUpTo', 'sqrtModN',
  'limbsOf', 'modSmall', 'qsParams', 'qsStart', 'qsPoly', 'qsEnough', 'qsRelations', 'buildMatrix', 'elimCols', 'dependencies', 'trySquare',
  'qsSplit', 'rhoStart', 'rhoSteps', 'tdStart', 'tdSteps', 'log10L', 'METHODS', 'crossDigits'];

test('二次ふるい法: 素数の判定・整数の平方根と累乗根・累乗の見分け', () => {
  const { isPrime, isqrt, iroot, perfectPower } = trendCore(QSID, QS_NAMES);
  for (const p of [2n, 3n, 97n, 7919n, 2n ** 61n - 1n, 2n ** 89n - 1n, 10n ** 18n + 3n]) assert.equal(isPrime(p), true, String(p));
  // 561 と 41041 はカーマイケル数（フェルマーの判定はすり抜ける）
  for (const n of [0n, 1n, 4n, 561n, 41041n, 3215031751n, (2n ** 61n - 1n) * (2n ** 31n - 1n), 10n ** 18n + 1n]) assert.equal(isPrime(n), false, String(n));
  assert.equal(isqrt(10n ** 40n), 10n ** 20n);
  assert.equal(isqrt(10n ** 40n - 1n), 10n ** 20n - 1n);
  assert.equal(isqrt(99n), 9n);
  assert.equal(iroot(10n ** 30n + 5n, 3), 10n ** 10n);
  assert.equal(iroot(10n ** 30n - 1n, 3), 10n ** 10n - 1n);
  const pp = perfectPower(3n ** 40n);
  assert.deepEqual([pp.r ** BigInt(pp.k), pp.k >= 2], [3n ** 40n, true]);
  assert.equal(perfectPower(12345678901234567n), null);
  assert.equal(perfectPower(2n ** 61n - 1n), null);
});

test('二次ふるい法: 小さな数の道具（平方根・2^24 ごとの桁での余り）', () => {
  const { sqrtModN, primesUpTo, limbsOf, modSmall, powmod } = trendCore(QSID, QS_NAMES);
  const N = 123456789012345678901234567890123n, L = limbsOf(N);
  for (const p of primesUpTo(3000).slice(1)) {
    assert.equal(modSmall(L, p), Number(N % BigInt(p)), String(p));
    // 平方剰余のときだけ平方根を求め、2 乗すると戻る（p ≡ 1 (mod 8) の素数も含む）
    const n = modSmall(L, p);
    if (n === 0 || Number(powmod(BigInt(n), BigInt((p - 1) / 2), BigInt(p))) !== 1) continue;
    const t = sqrtModN(n, p);
    assert.equal((t * t) % p, n, String(p));
  }
});

test('二次ふるい法: 種を決めた N はちょうどその桁数の 2 つの素数の積で、同じ種なら同じ N', () => {
  const { semiprime, seeded, isPrime } = trendCore(QSID, QS_NAMES);
  for (const d of [12, 20, 31, 40]) {
    const s = semiprime(d, seeded(d));
    assert.equal(String(s.N).length, d);
    assert.equal(s.p * s.q, s.N);
    assert.ok(isPrime(s.p) && isPrime(s.q) && s.p < s.q);
    assert.equal(semiprime(d, seeded(d)).N, s.N);
  }
});

test('二次ふるい法: 2 を法とした消去で見つけた行の組は、足すと全部 0 になる', () => {
  const { buildMatrix, elimCols, dependencies, seeded } = trendCore(QSID, QS_NAMES);
  const rand = seeded(3), cols = 40, rels = [];
  for (let i = 0; i < 50; i++) {
    const ex = [];
    for (let j = 0; j < cols; j++) if (rand() < 0.15) ex.push(j, 1 + Math.floor(rand() * 3));
    rels.push({ ex });
  }
  const mx = buildMatrix(rels, cols);
  assert.equal(elimCols(mx, 10), false);
  assert.equal(elimCols(mx, cols), true);
  const deps = dependencies(mx);
  // 行が列より 10 多いので、組は 10 本以上ある
  assert.ok(deps.length >= 10);
  for (const idx of deps) {
    const par = new Array(cols).fill(0);
    for (const i of idx) for (let k = 0; k < rels[i].ex.length; k += 2) par[rels[i].ex[k]] ^= rels[i].ex[k + 1] & 1;
    assert.ok(idx.length > 0 && par.every((v) => v === 0));
  }
});

test('二次ふるい法: 20〜36 桁の 2 つの素数の積を分け、X² ≡ Y² (mod N) になっている', () => {
  const { semiprime, seeded, qsSplit } = trendCore(QSID, QS_NAMES);
  for (const d of [20, 26, 36]) {
    const s = semiprime(d, seeded(100 + d));
    const r = qsSplit(s.N);
    assert.ok(r.d === s.p || r.d === s.q, `${d} 桁`);
    assert.equal((r.sq.X * r.sq.X - r.sq.Y * r.sq.Y) % s.N, 0n);
    // 指数はすべて偶数で、選んだ式は 2 本以上
    assert.ok(r.sq.cnt.every((e) => e % 2 === 0) && r.idx.length >= 2);
    assert.ok(r.st.full.length + r.st.combined.length >= r.st.need);
  }
});

test('二次ふるい法: 多項式ごとの値 Q(x) は、ふるいで印を付けた素数で本当に割り切れる', () => {
  const { semiprime, seeded, qsStart, qsPoly } = trendCore(QSID, QS_NAMES);
  const s = semiprime(30, seeded(9)), st = qsStart(s.N);
  for (let k = 0; k < 5; k++) {
    qsPoly(st);
    const { a, b, c } = st.last.poly;
    // a·Q(x) = (a x + b)² − N
    assert.equal(a * c, b * b - s.N);
    for (let i = 2; i < 60; i++) {
      const x = BigInt(st.R1[i]), Q = (a * x + 2n * b) * x + c;
      assert.equal(Q % st.PB[i], 0n);
    }
  }
  // 集めた式は X² ≡ q² Q(x) (mod N) を満たし、Q(x) は指数の通りに素因数分解されている
  for (const r of st.full.slice(0, 20)) {
    let v = 1n;
    for (let k = 0; k < r.ex.length; k += 2) v *= (r.ex[k] === 0 ? -1n : st.PB[r.ex[k]]) ** BigInt(r.ex[k + 1]);
    assert.equal(v, r.Q);
    assert.equal((r.X * r.X - r.sq * r.sq * r.Q) % s.N, 0n);
  }
});

test('二次ふるい法: ρ 法と割り算で小さな因数を見つける', () => {
  const { rhoStart, rhoSteps, tdStart, tdSteps } = trendCore(QSID, QS_NAMES);
  let st = rhoStart(10403n), d = 0n;
  while (!d) d = rhoSteps(st, 50);
  assert.ok(d === 101n || d === 103n);
  st = rhoStart(1000000016000000063n);
  d = 0n;
  while (!d) d = rhoSteps(st, 5000);
  assert.ok(d === 1000000007n || d === 1000000009n);
  const t = tdStart(1009n * 1000000007n);
  assert.equal(tdSteps(t, 10), 0n);
  assert.equal(tdSteps(t, 1000), 1009n);
});

test('二次ふるい法: 計算量の式の値と、入れ替わる桁数', () => {
  const { log10L, METHODS, crossDigits } = trendCore(QSID, QS_NAMES);
  const f = Object.fromEntries(METHODS.map((m) => [m.id, m.f]));
  // L[1, c] は N^c なので、10 を底とした対数は c × 桁数
  assert.ok(Math.abs(log10L(100, 1, 0.5) - 50) < 1e-9);
  assert.ok(Math.abs(f.td(100) - 50) < 1e-9 && Math.abs(f.rho(100) - 25) < 1e-9);
  // 100 桁の二次ふるい法の式は √(ln N · ln ln N) / ln 10 ≈ 15.37
  assert.ok(Math.abs(f.qs(100) - 15.3695) < 1e-3);
  const a = crossDigits(f.paper, f.td), b = crossDigits(f.paper, f.qs), c = crossDigits(f.nfs, f.qs);
  assert.ok(a > 13000 && a < 14500, String(a));
  assert.ok(b > 1e13 && b < 3e13, String(b));
  assert.ok(c > 100 && c < 150, String(c));
  // 入れ替わった後は大小が逆になる
  assert.ok(f.paper(a * 0.9) > f.td(a * 0.9) && f.paper(a * 1.1) < f.td(a * 1.1));
  // 論文の上限と数体ふるい法は、同じ 1/3 の形なので入れ替わらない
  assert.ok(Number.isNaN(crossDigits(f.paper, f.nfs)));
});

// ---- パーマネントと行列式（VP ≠ VNP） ----
const PDID = 'tr-20261127-permanent-det';
const PD_NAMES = ['NUM', 'BIG', 'counting', 'detBerkowitz', 'countsBerkowitz', 'permRyser', 'countsRyser', 'leibniz', 'detBareiss',
  'allPerms', 'inversions', 'matchings', 'polyaGood', 'polyaAll', 'grenet', 'grenetMatrix', 'grenetCover',
  'berkowitzF64', 'ryserF64', 'runSync', 'seeded', 'factorial', 'lowerLog10'];
function randomIntMatrix(rand, n, lo, hi) {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => BigInt(lo + Math.floor(rand() * (hi - lo + 1)))));
}

test('パーマネントと行列式: 知られた値（1 2 3 / 4 5 6 / 7 8 9 は行列式 0、パーマネント 450。全部 1 のパーマネントは n!）', () => {
  const X = trendCore(PDID, PD_NAMES);
  const A = [[1n, 2n, 3n], [4n, 5n, 6n], [7n, 8n, 9n]];
  assert.equal(X.detBerkowitz(A, X.BIG), 0n);
  assert.equal(X.detBareiss(A), 0n);
  assert.equal(X.permRyser(A, X.BIG), 450n);
  for (let n = 1; n <= 7; n++) {
    const J = Array.from({ length: n }, () => new Array(n).fill(1));
    assert.equal(X.permRyser(J, X.NUM), X.factorial(n));
    assert.equal(X.detBerkowitz(J, X.NUM), n === 1 ? 1 : 0);
  }
  assert.equal(X.detBerkowitz([], X.BIG), 1n);
  assert.equal(X.permRyser([], X.BIG), 1n);
});

test('パーマネントと行列式: Berkowitz・Bareiss・定義どおりの行列式、Ryser と定義どおりのパーマネント、Float64 版が一致する', () => {
  const X = trendCore(PDID, PD_NAMES);
  const rand = X.seeded(11);
  for (let n = 1; n <= 7; n++) {
    for (let t = 0; t < 6; t++) {
      const A = randomIntMatrix(rand, n, -4, 4);
      const pair = X.leibniz(A, X.BIG), d = pair[0], p = pair[1];
      assert.equal(X.detBerkowitz(A, X.BIG), d, `n=${n}`);
      assert.equal(X.detBareiss(A), d, `n=${n}`);
      assert.equal(X.permRyser(A, X.BIG), p, `n=${n}`);
      const F = A.map((r) => r.map(Number));
      assert.equal(X.runSync(X.berkowitzF64(F)), Number(d), `n=${n}`);
      assert.equal(X.runSync(X.ryserF64(F, 3)), Number(p), `n=${n}`);
    }
  }
  // 先頭に 0 があって行を入れ替える場合
  const Z = [[0n, 2n, 1n], [0n, 0n, 3n], [5n, 1n, 4n]];
  assert.equal(X.detBareiss(Z), X.leibniz(Z, X.BIG)[0]);
});

test('パーマネントと行列式: 数える入れ物で数えた回数が式と同じ', () => {
  const X = trendCore(PDID, PD_NAMES);
  for (let n = 1; n <= 8; n++) {
    const J = Array.from({ length: n }, () => new Array(n).fill(1));
    let R = X.counting();
    X.detBerkowitz(J, R);
    const b = X.countsBerkowitz(n);
    assert.deepEqual([R.c.add, R.c.mul], [b.add, b.mul], `Berkowitz n=${n}`);
    R = X.counting();
    X.permRyser(J, R);
    const r = X.countsRyser(n);
    assert.deepEqual([R.c.add, R.c.mul], [r.add, r.mul], `Ryser n=${n}`);
    R = X.counting();
    X.leibniz(J, R);
    const f = X.factorial(n);
    assert.deepEqual([R.c.add, R.c.mul], [2 * (f - 1), f * (n - 1)], `定義どおり n=${n}`);
  }
  // Berkowitz はおよそ n⁴/2、Ryser は (2ⁿ − 1)·2n
  const b30 = X.countsBerkowitz(30);
  assert.ok(Math.abs((b30.add + b30.mul) / (30 ** 4 / 2) - 1) < 0.15);
  const r20 = X.countsRyser(20);
  assert.equal(r20.add + r20.mul, (2 ** 20 - 1) * 40);
  // 下限の形 2^((log₂ n)^(4/3)) は n = 2^64 で n⁴ と等しくなる
  assert.ok(Math.abs(X.lowerLog10(2 ** 64) - 4 * 64 * Math.log10(2)) < 1e-6);
});

test('完全マッチング: 偶数 + 奇数がパーマネント、偶数 − 奇数が行列式', () => {
  const X = trendCore(PDID, PD_NAMES);
  const A = [[1, 1, 0, 1], [1, 1, 1, 0], [0, 1, 1, 1], [1, 0, 1, 1]];
  const m = X.matchings(A), odd = m.filter((x) => x.odd).length, even = m.length - odd;
  assert.deepEqual([even, odd], [3, 6]);
  const pair = X.leibniz(A, X.NUM);
  assert.deepEqual([pair[0], pair[1]], [even - odd, even + odd]);
  assert.equal(X.allPerms(5).length, 120);
  assert.equal(X.inversions([2, 1, 0]), 3);
  assert.equal(X.matchings([[1, 0], [0, 0]]).length, 0);
});

test('符号の付け替え: 2×2 は合わせられるが、3×3 は 512 通りのどれでも 5 個まで', () => {
  const X = trendCore(PDID, PD_NAMES);
  const h2 = X.polyaAll(2);
  assert.equal(h2.reduce((a, b) => a + b, 0), 16);
  assert.ok(h2[2] > 0);
  assert.equal(X.polyaGood([[1, -1], [1, 1]]), 2);
  const h3 = X.polyaAll(3);
  assert.equal(h3.reduce((a, b) => a + b, 0), 512);
  assert.equal(h3[6], 0);
  assert.ok(h3[5] > 0);
  // 6 個の項の符号の積はいつも −1 なので、合う数はいつも奇数
  for (let k = 0; k <= 6; k += 2) assert.equal(h3[k], 0, `k=${k}`);
});

test('Grenet の作り方: 2ⁿ − 1 行の行列式がパーマネントと一致し、道 1 本が置換行列 1 つになる', () => {
  const X = trendCore(PDID, PD_NAMES);
  const rand = X.seeded(5);
  for (let n = 1; n <= 5; n++) {
    const g = X.grenet(n);
    assert.equal(g.size, 2 ** n - 1);
    assert.equal(g.cells.length, n * 2 ** (n - 1) + 2 ** n - 2);
    const seen = new Set(g.cells.map((e) => e.r * 64 + e.c));
    assert.equal(seen.size, g.cells.length, '同じマスに 2 つ入れない');
    for (let t = 0; t < 4; t++) {
      const A = randomIntMatrix(rand, n, -3, 3);
      assert.equal(X.detBareiss(X.grenetMatrix(g, A, X.BIG)), X.permRyser(A, X.BIG), `n=${n}`);
    }
    if (n <= 4) {
      for (const p of X.allPerms(n)) {
        const cover = X.grenetCover(g, p);
        assert.equal(cover.length, g.size);
        assert.equal(new Set(cover.map((c) => c[0])).size, g.size);
        assert.equal(new Set(cover.map((c) => c[1])).size, g.size);
        for (const [r, c] of cover) assert.ok(seen.has(r * 64 + c), '使う成分は 0 でない');
      }
    }
  }
});

// ---- Adaptive Dark Mode（明るさだけ反転して自動で暗くする） ----
const ADID = 'tr-20261127-adaptive-dark';
const AD_NAMES = ['parseColor', 'toHex', 'toCss', 'luma', 'contrast', 'over', 'average', 'setLuma', 'invertLuma', 'isLight',
  'lumaMatrix', 'invertHueMatrix', 'applyMatrix', 'invertHue', 'fitContrast', 'adaptBackground', 'adaptText', 'adaptLine',
  'classifyPixels', 'lightShare', 'mapColors', 'colorsIn', 'oklch', 'rgba'];
const rgbOf = (c) => [c.r, c.g, c.b, c.a];

test('色の読み取り: getComputedStyle の形と #rrggbb と transparent を読む', () => {
  const X = trendCore(ADID, AD_NAMES);
  assert.deepEqual(rgbOf(X.parseColor('rgb(255, 0, 51)')), [1, 0, 0.2, 1]);
  assert.deepEqual(rgbOf(X.parseColor('rgba(0, 0, 0, 0.5)')), [0, 0, 0, 0.5]);
  assert.deepEqual(rgbOf(X.parseColor('rgb(255 255 255 / 25%)')), [1, 1, 1, 0.25]);
  assert.deepEqual(rgbOf(X.parseColor('color(srgb 0.5 0.25 1)')), [0.5, 0.25, 1, 1]);
  assert.equal(X.toHex(X.parseColor('#2563eb')), '#2563eb');
  assert.equal(X.parseColor('transparent').a, 0);
  assert.equal(X.parseColor('none'), null);
  assert.equal(X.parseColor('url(#a)'), null);
  assert.equal(X.toCss(X.rgba(1, 0, 0, 0.5)), 'rgb(255 0 0 / 0.5)');
});

test('コントラスト比: 白と黒で 21、同じ色で 1、#767676 と白で 4.54', () => {
  const X = trendCore(ADID, AD_NAMES);
  const W = X.rgba(1, 1, 1), K = X.rgba(0, 0, 0);
  assert.ok(near(X.contrast(W, K), 21, 1e-9));
  assert.ok(near(X.contrast(K, W), 21, 1e-9));
  assert.ok(near(X.contrast(W, W), 1, 1e-12));
  // #767676 は白に対して 4.54:1（4.5:1 にぎりぎり届く灰色として知られる値）
  assert.ok(near(X.contrast(X.parseColor('#767676'), W), 4.54, 0.01));
  // 半分透明な黒を白に重ねると (0.5, 0.5, 0.5)
  assert.deepEqual(rgbOf(X.over(X.rgba(0, 0, 0, 0.5), W)), [0.5, 0.5, 0.5, 1]);
});

test('明るさだけの反転: 白は 0.08、黒は 0.92 になり、色の成分の向きは変わらない', () => {
  const X = trendCore(ADID, AD_NAMES);
  assert.ok(near(X.luma(X.invertLuma(X.rgba(1, 1, 1))), 0.08, 1e-12));
  assert.ok(near(X.luma(X.invertLuma(X.rgba(0, 0, 0))), 0.92, 1e-12));
  for (const hex of ['#f2c200', '#e6f4ff', '#d0342c', '#2e7d32', '#2563eb', '#fff8d6', '#808080']) {
    const c = X.parseColor(hex), t = X.invertLuma(c), y = X.luma(c);
    // 明るさは 0.92 − 0.84 Y′ になる
    assert.ok(near(X.luma(t), 0.92 - 0.84 * y, 1e-9), hex);
    // 0〜1 に収まる
    for (const v of rgbOf(t)) assert.ok(v >= 0 && v <= 1, hex);
    // 色の成分 (R − Y′, G − Y′, B − Y′) は同じ向きで、長さだけが縮む（k は 0〜1）
    const d0 = [c.r - y, c.g - y, c.b - y], ty = X.luma(t), d1 = [t.r - ty, t.g - ty, t.b - ty];
    const len = Math.hypot(...d0);
    if (len > 1e-9) {
      const k = (d0[0] * d1[0] + d0[1] * d1[1] + d0[2] * d1[2]) / (len * len);
      assert.ok(k > -1e-9 && k <= 1 + 1e-9, hex);
      for (let i = 0; i < 3; i++) assert.ok(near(d1[i], k * d0[i], 1e-9), hex);
    }
  }
  // 明るい色だけを明るい背景とみなす（しきい値 0.55）
  assert.equal(X.isLight(X.parseColor('#ffffff')), true);
  assert.equal(X.isLight(X.parseColor('#1f3a5f')), false);
  assert.equal(X.adaptBackground(X.parseColor('#1f3a5f')).why, '暗い背景なのでそのまま');
});

test('行列: 明るさだけの反転は行列を掛けた値と同じ。単純な反転の行列とほぼ同じ形', () => {
  const X = trendCore(ADID, AD_NAMES);
  const M = X.lumaMatrix();
  // はみ出さない色では、行列の計算と setLuma の計算が一致する
  for (const c of [X.rgba(0.5, 0.5, 0.5), X.rgba(0.55, 0.5, 0.45), X.rgba(1, 1, 1), X.rgba(0, 0, 0)]) {
    const a = X.applyMatrix(M, c), b = X.invertLuma(c);
    for (let i = 0; i < 3; i++) assert.ok(near(rgbOf(a)[i], rgbOf(b)[i], 1e-9));
  }
  // invert(1) hue-rotate(180deg): 白は黒に、黒は白に、灰色は反対の灰色になる
  assert.deepEqual(rgbOf(X.invertHue(X.rgba(1, 1, 1))).map((v) => Math.round(v * 1000)), [0, 0, 0, 1000]);
  assert.deepEqual(rgbOf(X.invertHue(X.rgba(0, 0, 0))).map((v) => Math.round(v * 1000)), [1000, 1000, 1000, 1000]);
  const g = X.invertHue(X.rgba(0.3, 0.3, 0.3));
  for (const v of [g.r, g.g, g.b]) assert.ok(near(v, 0.7, 1e-9));
  // 範囲を 0〜1 にした行列と、単純な反転の行列は、どの成分も 0.005 以内
  const Z = X.lumaMatrix(0, 1), I = X.invertHueMatrix(180);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) assert.ok(Math.abs(Z[i][j] - I[i][j]) < 0.005, i + ',' + j);
});

test('文字の色: 足りるときは変えず、足りないときは反転し、それでも足りなければ 4.5:1 まで動かす', () => {
  const X = trendCore(ADID, AD_NAMES);
  const dark = X.invertLuma(X.rgba(1, 1, 1));
  const white = X.rgba(1, 1, 1);
  const keep = X.adaptText(white, X.parseColor('#1f3a5f'), 4.5);
  assert.equal(keep.to.r, 1);
  assert.ok(keep.why.startsWith('そのまま'));
  for (const hex of ['#000000', '#1b2733', '#d0342c', '#2e7d32', '#2563eb', '#5c4a00', '#767676']) {
    const c = X.parseColor(hex), r = X.adaptText(c, dark, 4.5);
    assert.ok(X.contrast(r.to, dark) >= 4.5 - 1e-9, hex);
  }
  // fitContrast は、足りる中でいちばん元に近い明るさを選ぶ（少しでも暗くすると足りない）
  const bg = X.parseColor('#20252c'), fg = X.parseColor('#3a5a8a');
  const f = X.fitContrast(fg, bg, 4.5);
  assert.ok(X.contrast(f, bg) >= 4.5 - 1e-9);
  assert.ok(X.contrast(X.setLuma(f, X.luma(f) - 0.01), bg) < 4.5);
  // 明るい背景の上では、暗い方へ動かす
  const f2 = X.fitContrast(X.parseColor('#9aa4b0'), white, 4.5);
  assert.ok(X.contrast(f2, white) >= 4.5 - 1e-9);
  assert.ok(X.luma(f2) < X.luma(X.parseColor('#9aa4b0')));
  // 枠の線: 明るい線は反転、暗い線でも差が残ればそのまま
  assert.equal(X.adaptLine(X.parseColor('#e3e6ea'), white, dark).why, '明るい線なので明るさを反転');
  assert.equal(X.adaptLine(X.parseColor('#2563eb'), white, dark).why, '暗い線で、背景との差が残るのでそのまま');
});

test('画像の判定: 白黒のロゴ・写真・透明な画像を見分ける', () => {
  const X = trendCore(ADID, AD_NAMES);
  const img = (n, fn) => {
    const d = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) d.set(fn(i), i * 4);
    return d;
  };
  // 白い地に黒い印（端に少しだけ中間の灰色）
  const logo = img(1000, (i) => (i < 300 ? [17, 17, 17, 255] : i < 340 ? [128, 128, 128, 255] : [255, 255, 255, 255]));
  assert.equal(X.classifyPixels(logo).kind, 'logo');
  // 色の付いた画素が多いもの
  const photo = img(1000, (i) => [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256, 255]);
  assert.equal(X.classifyPixels(photo).kind, 'photo');
  // 灰色でも中間の明るさばかりなら写真（白黒の写真）
  const grayPhoto = img(1000, (i) => {
    const v = 40 + (i % 180);
    return [v, v, v, 255];
  });
  assert.equal(X.classifyPixels(grayPhoto).kind, 'photo');
  // 透明な地に黒い印だけでもロゴ
  const clear = img(1000, (i) => (i < 200 ? [0, 0, 0, 255] : [0, 0, 0, 0]));
  assert.equal(X.classifyPixels(clear).kind, 'logo');
  assert.equal(X.classifyPixels(img(10, () => [0, 0, 0, 0])).kind, 'empty');
  // 真っ白なだけの画像は反転しない
  assert.equal(X.classifyPixels(img(100, () => [255, 255, 255, 255])).kind, 'photo');
});

test('ページの判定とグラデーション: 明るい所が半分以上なら明るいページ。色の点だけ置き換える', () => {
  const X = trendCore(ADID, AD_NAMES);
  const W = X.rgba(1, 1, 1), K = X.rgba(0.1, 0.1, 0.1);
  assert.equal(X.lightShare([W, W, K]).light, true);
  assert.equal(X.lightShare([W, K, K]).light, false);
  assert.equal(X.lightShare([X.rgba(1, 1, 1, 0)]).n, 0);
  const g = 'linear-gradient(135deg, rgb(230, 244, 255) 0%, rgba(31, 58, 95, 0.5) 100%)';
  assert.equal(X.colorsIn(g).length, 2);
  const out = X.mapColors(g, (c) => X.adaptBackground(c).to);
  assert.ok(out.startsWith('linear-gradient(135deg, #'));
  assert.ok(out.includes('rgb(31 58 95 / 0.5) 100%'), '暗い色の点はそのまま');
  assert.deepEqual(rgbOf(X.average([X.rgba(1, 0, 0, 1), X.rgba(0, 0, 1, 1)])), [0.5, 0, 0.5, 1]);
  // 色合いの角度: 灰色は彩度がほぼ 0、黄色は 90° あたり
  assert.ok(X.oklch(X.rgba(0.5, 0.5, 0.5)).C < 1e-6);
  assert.ok(Math.abs(X.oklch(X.parseColor('#f2c200')).h - 92) < 10);
});

// ---- 詐欺メールの見えない文字（tr-20261127-invisible-chars） ----
const INVIS = 'tr-20261127-invisible-chars';

test('見えない文字: 文字参照を 1 枚ずつはがし、2 枚目が要れば二重の符号化', () => {
  const { decodeOnce, peel, isNested, findHidden } = trendCore(INVIS, ['decodeOnce', 'peel', 'isNested', 'findHidden']);
  assert.equal(decodeOnce('営&#xfeff;業&#8205;所'), '営\uFEFF業\u200D所');
  assert.equal(decodeOnce('&amp;#x200b;'), '&#x200b;');
  assert.equal(decodeOnce('&ZeroWidthSpace;&shy;&unknown;&amp'), '\u200B\u00AD&unknown;&amp');
  assert.equal(decodeOnce('&#0;&#x110000;&#xD800;'), '\uFFFD\uFFFD\uFFFD');
  assert.equal(Array.from(peel('&amp;amp;#x200b;')).join('|'), '&amp;amp;#x200b;|&amp;#x200b;|&#x200b;|\u200B');
  assert.equal(peel('ふつうの文').length, 1);
  assert.equal(isNested('a&#x200b;b'), false);
  assert.equal(isNested('a&amp;#x200b;b'), true);
  assert.equal(isNested('?from=mail&amp;id=27'), false);
  // 見えない文字が出た層で止める
  const f = findHidden('パス&amp;#x200b;ワード', 'article');
  assert.equal(f.hit, true);
  assert.equal(f.depth, 2);
  assert.equal(findHidden('ふつう', 'article').hit, false);
});

test('見えない文字: 種類と、絵文字・漢字の異体字として残す文字', () => {
  const { invisInfo, hiddenIn, stripInvisible } = trendCore(INVIS, ['invisInfo', 'hiddenIn', 'stripInvisible']);
  assert.equal(invisInfo(0x41), null);
  assert.equal(invisInfo(0x2800), null);   // 点字の空白は既定で無視する文字ではない
  assert.equal(invisInfo(0x3000), null);
  assert.equal(invisInfo(0x200B).short, 'ZWSP');
  assert.equal(invisInfo(0x202E).kind, 'bidi');
  assert.equal(invisInfo(0xFE0F).short, 'VS16');
  assert.equal(invisInfo(0xE0100).short, 'VS17');
  assert.equal(invisInfo(0xE0041).short, 'A');
  assert.equal(invisInfo(0x3164).kind, 'fill');
  assert.equal(invisInfo(0x00AD).short, 'SHY');
  const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
  const flag = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
  const s = '営\u200B業所' + family + '❤\uFE0F' + flag + '葛\u{E0100}';
  assert.equal(hiddenIn(s, 'diAll').length, 1 + 2 + 1 + 6 + 1);
  assert.equal(hiddenIn(s, 'di').length, 1);
  assert.equal(hiddenIn(s, 'article').length, 3);   // 記事の範囲は家族の絵文字の ZWJ にも当たる
  assert.equal(stripInvisible(s), '営業所' + family + '❤\uFE0F' + flag + '葛\u{E0100}');
  assert.equal(stripInvisible('a\u00ADb\u3164c\uFFA0'), 'abc');
  // 肌の色の付いた絵文字の ZWJ と、数字の後の異体字セレクタも残す
  assert.equal(hiddenIn('\u{1F469}\u{1F3FD}\u200D\u{1F4BB} 1\uFE0F⃣', 'di').length, 0);
  // 文字の間の ZWJ と、旗の無いタグ文字は残さない
  assert.equal(hiddenIn('あ\u200Dい\u{E0041}', 'di').length, 2);
});

test('見えない文字: 画面の並び順・正規化・タグ文字', () => {
  const { visualOrder, normalizeText, tagText, toTags } = trendCore(INVIS, ['visualOrder', 'normalizeText', 'tagText', 'toTags']);
  assert.equal(visualOrder('請求書_\u202Efdp.exe'), '請求書_exe.pdf');
  assert.equal(visualOrder('a\u202Ecba\u202Cd'), 'aabcd');
  assert.equal(visualOrder('\u202Eルーモトナミ'), 'ミナトモール');
  assert.equal(visualOrder('x\u202Ea\u{1F468}\u200D\u{1F469}b'), 'xb\u{1F468}\u200D\u{1F469}a');   // 絵文字の合成は崩さない
  assert.equal(visualOrder('上\u202Eba\n下'), '上ab\n下');   // 改行で区間が終わる
  assert.equal(normalizeText('\u202Eルーモトナミ'), 'ミナトモール');
  assert.equal(normalizeText('ﾊﾙｶｾﾞ銀行'), 'ハルカゼ銀行');
  assert.equal(normalizeText('配送営&#xfeff;業所&amp;#x200d;'), '配送営業所');
  assert.equal(normalizeText('Ｍｉｎａｔｏ'), 'Minato');
  assert.equal(Array.from(tagText('ok' + toTags('safe') + '!' + toTags('x'))).join('|'), 'safe|x');
  assert.equal(tagText('\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}').length, 0);
});

test('見えない文字: URL を分解してドメインを取り出す', () => {
  const { splitUrl, underDomain, impersonated } = trendCore(INVIS, ['splitUrl', 'underDomain', 'impersonated']);
  const p1 = splitUrl('https://parcel-redeliver.test/18HMSa.minatomall.example');
  assert.equal(p1.host, 'parcel-redeliver.test');
  assert.equal(p1.rest, '/18HMSa.minatomall.example');
  const p2 = splitUrl('https://harukaze-bank.example@login-check.test/reset');
  assert.equal(p2.user, 'harukaze-bank.example');
  assert.equal(p2.host, 'login-check.test');
  const p3 = splitUrl('HTTPS:\\\\Yamabiko-Unyu.example.parcel-check.test:8443\\redelivery?x=1');
  assert.equal(p3.scheme, 'https');
  assert.equal(p3.host, 'yamabiko-unyu.example.parcel-check.test');
  assert.equal(p3.port, '8443');
  assert.equal(p3.rest, '\\redelivery?x=1');
  assert.equal(splitUrl('https://a.example#x@b.test').host, 'a.example');
  assert.equal(splitUrl('https://a.example/x@b.test').host, 'a.example');
  assert.equal(splitUrl('https://u:p@a@b.test/').host, 'b.test');
  assert.equal(splitUrl('mailto:x@y.test').host, '');
  assert.equal(splitUrl('こんにちは'), null);
  assert.ok(underDomain('www.minatomall.example', 'minatomall.example'));
  assert.ok(underDomain('minatomall.example', 'minatomall.example'));
  assert.ok(!underDomain('minatomall.example.parcel-check.test', 'minatomall.example'));
  assert.ok(!underDomain('evilminatomall.example', 'minatomall.example'));
  assert.equal(impersonated('ミナトモール', ['https://parcel-redeliver.test/minatomall.example']).length, 1);
  assert.equal(impersonated('ミナトモール', ['https://www.minatomall.example/sale']).length, 0);
  assert.equal(impersonated('ミナトモール', []).length, 0);   // リンクが無いメールは記事の決まりでは調べない
});

test('見えない文字: 5 通の判定（詐欺の 4 通は怪しい、本物は問題なし）', () => {
  const { sampleMails, judgeMail } = trendCore(INVIS, ['sampleMails', 'judgeMail']);
  const rs = Array.from(sampleMails(), (m) => judgeMail(m));
  assert.equal(rs.map((r) => r.suspicious).join(','), 'true,true,true,true,false');
  const [a, b, c, d, e] = rs;
  assert.equal([a.from.hit, a.subject.hit, a.nested.html, a.brands.length].join(','), 'false,true,false,1');
  assert.equal([b.from.hit, b.subject.hit, b.nested.html, b.brands.length].join(','), 'true,true,false,1');
  assert.equal([c.from.hit, c.subject.hit, c.nested.html, c.brands.length].join(','), 'false,false,true,1');   // ソフトハイフンは記事の範囲の外
  assert.equal([d.from.hit, d.subject.hit, d.nested.html, d.brands.length, d.tags.length].join(','), 'false,false,false,1,1');
  assert.equal([e.from.hit, e.subject.hit, e.nested.html, e.named.length, e.brands.length].join(','), 'false,false,false,1,0');
  // 単語の検索: 元の文字列では当たらず、正規化すると当たる
  const word = (r, w) => r.words.find((x) => x.w === w);
  assert.equal([word(a, '営業所').raw, word(a, '営業所').norm].join(','), 'false,true');
  assert.equal([word(b, 'ミナトモール').raw, word(b, 'ミナトモール').norm].join(','), 'false,true');
  assert.equal([word(c, 'パスワード').raw, word(c, 'パスワード').norm, word(c, 'ハルカゼ銀行').norm].join(','), 'false,true,true');
  assert.equal([word(d, '還付金').raw].join(','), 'true');
  // 本物のメールの絵文字は数えるが、残す文字なので di には入らない
  assert.equal([e.count.article, e.count.diAll, e.count.di].join(','), '2,3,0');
  assert.ok(d.count.diAll > 60 && d.count.article === 0);
  assert.match(d.tags[0], /^AI assistant: /);
});

const BOUNCE = 'tr-20261128-bounce-market';

test('玉の市場: LMSR の値段と代金（和は 1、左右 1 株ずつでちょうど 1 点、胴元の損は b·ln 2 まで）', () => {
  const { lmsrCost, priceL, buyCost } = trendCore(BOUNCE, ['lmsrCost', 'priceL', 'buyCost']);
  assert.equal(priceL(0, 0, 4), 0.5);
  assert.ok(near(priceL(3, 1, 4) + priceL(1, 3, 4), 1, 1e-12));
  assert.ok(near(buyCost(0, 0, 4, 'L', 1), 4 * Math.log((Math.exp(0.25) + 1) / 2), 1e-12));
  assert.ok(near(buyCost(0, 0, 4, 'L', 1) + buyCost(1, 0, 4, 'R', 1), 1, 1e-12));
  assert.ok(near(buyCost(2, 5, 4, 'L', 3), lmsrCost(5, 5, 4) - lmsrCost(2, 5, 4), 1e-12));
  assert.ok(priceL(1, 0, 4) > 0.5 && priceL(0, 1, 4) < 0.5);
  // 大きな数でもあふれない
  assert.ok(Number.isFinite(lmsrCost(5000, 0, 4)) && near(priceL(5000, 0, 4), 1));
  // どんな順に買われても、胴元の損（払う最大の点数 − 受け取った代金）は b·ln 2 を超えない
  for (const pattern of ['LLLLLLLLLLLLLLLLLLLL', 'LRLRRRLLRLRRRRLLLRLR', 'RRRRRRRRRRLLLLLLLLLLL']) {
    let qL = 0, qR = 0, got = 0;
    for (const side of pattern) {
      got += buyCost(qL, qR, 4, side, 1);
      if (side === 'L') qL++; else qR++;
    }
    assert.ok(Math.max(qL, qR) - got <= 4 * Math.LN2 + 1e-9, pattern);
  }
});

test('玉の市場: 同じ開始位置なら同じ道、10⁻⁹ px ずらすと多くの玉で着く位置が変わる', () => {
  const { makeBoard, makeBall, runToEnd, startOf } = trendCore(BOUNCE, ['makeBoard', 'makeBall', 'runToEnd', 'startOf']);
  const B = makeBoard();
  // 壁とピンのすき間、ピンどうしのすき間は玉の直径より広い（挟まらない）
  for (const row of B.rows) {
    assert.ok(row.xs[0] - B.P > 2 * B.R && B.W - row.xs[row.xs.length - 1] - B.P > 2 * B.R);
    for (let i = 1; i < row.xs.length; i++) assert.ok(row.xs[i] - row.xs[i - 1] - 2 * B.P > 2 * B.R);
  }
  let moved = 0;
  for (let i = 1; i <= 40; i++) {
    const x = startOf(B, i);
    assert.ok(x > B.W / 2 - 40 && x < B.W / 2 + 40);
    const a = runToEnd(B, makeBall(B, x)), b = runToEnd(B, makeBall(B, x));
    assert.equal([a.x, a.t, a.side, a.hits].join(','), [b.x, b.t, b.side, b.hits].join(','));
    assert.ok(a.t < B.LIMIT && a.x >= B.R && a.x <= B.W - B.R);
    assert.equal(a.side, a.x < B.W / 2 ? 'L' : 'R');
    const c = runToEnd(B, makeBall(B, x + 1e-9));
    if (Math.abs(c.x - a.x) > 1) moved++;
  }
  assert.equal(moved, 28);
});

test('玉の市場: 誤差 0 の雲は本物と同じ側だけ、AI の決まり', () => {
  const { makeBoard, makeBall, runToEnd, cloudOf, startOf, aiChoice } = trendCore(BOUNCE, ['makeBoard', 'makeBall', 'runToEnd', 'cloudOf', 'startOf', 'aiChoice']);
  const B = makeBoard();
  for (let i = 1; i <= 5; i++) {
    const s = makeBall(B, startOf(B, i));
    const side = runToEnd(B, s).side;
    const c = cloudOf(B, s, 6, 0, 1, 3);
    assert.equal(c.pL, side === 'L' ? 1 : 0);
    assert.equal(c.paths.length, 6);
  }
  assert.equal(aiChoice('cheap', { pL: 0.2 }, 0), 'L');
  assert.equal(aiChoice('cheap', { pL: 0.8 }, 0), 'R');
  assert.equal(aiChoice('cheap', { pL: 0.2 }, 0.9), '');
  assert.equal(aiChoice('pos', { off: -10, pL: 0.5 }, 0), 'L');
  assert.equal(aiChoice('pos', { off: -10, pL: 0.9 }, 0), '');
  assert.equal(aiChoice('pos', { off: 3, pL: 0.5 }, 0), '');
  assert.equal(aiChoice('trend', { pL: 0.6, dP: 0.05 }, 0), 'L');
  assert.equal(aiChoice('trend', { pL: 0.4, dP: -0.05 }, 0), 'R');
  assert.equal(aiChoice('cloud', { pL: 0.5, cloudP: 0.8 }, 0.99), 'L');
  assert.equal(aiChoice('cloud', { pL: 0.5, cloudP: 0.2 }, 0.99), 'R');
  assert.equal(aiChoice('cloud', { pL: 0.5, cloudP: 0.55 }, 0), '');
});

test('玉の市場: 1 回の勝負は種で決まり、点数は胴元と参加者の間で増えも減りもしない', () => {
  const { makeBoard, playRound, makeRound, roundBuy, roundStep, summarize } = trendCore(BOUNCE, ['makeBoard', 'playRound', 'makeRound', 'roundBuy', 'roundStep', 'summarize']);
  const B = makeBoard();
  const mk = () => [{ id: 'pos', rule: 'pos', bal: 100 }, { id: 'cheap', rule: 'cheap', bal: 100 }, { id: 'trend', rule: 'trend', bal: 100 }, { id: 'rand', rule: 'rand', bal: 100 }];
  const t1 = mk(), t2 = mk();
  const a = playRound(B, { seed: 7, sigma: 0.5, traders: t1, cloudN: 8, cloudEvery: false });
  const b = playRound(B, { seed: 7, sigma: 0.5, traders: t2, cloudN: 8, cloudEvery: false });
  assert.equal([a.side, a.closeP, a.closeCloud, a.maker, a.t].join(','), [b.side, b.closeP, b.closeCloud, b.maker, b.t].join(','));
  assert.ok(a.closeT > 0 && a.closeT < a.t);
  const sumProfit = Object.values(a.profit).reduce((x, y) => x + y, 0);
  assert.ok(near(sumProfit + a.maker, 0, 1e-9));
  assert.ok(near(t1.reduce((x, t) => x + t.bal, 0) + a.maker, 400, 1e-9));
  // 締め切った後は買えない。残高が足りなくても買えない
  const R = makeRound(B, { seed: 7, startX: 180.3, sigma: 0.5, traders: [{ id: 'me', rule: '', bal: 10 }, { id: 'poor', rule: '', bal: 0.1 }], cloudN: 4, cloudEvery: false });
  const [me, poor] = R.traders;
  assert.ok(roundBuy(R, me, 'L', 1) > 0.5);
  assert.equal(roundBuy(R, poor, 'R', 1), 0);
  assert.equal([R.qL, R.qR, R.hold.me.L, R.hold.poor.R].join(','), '1,0,1,0');
  while (R.open) roundStep(R);
  assert.equal(roundBuy(R, me, 'L', 1), 0);
  while (R.phase !== 'done') roundStep(R);
  assert.ok(near(me.bal, 10 - R.hold.me.paid + R.hold.me[R.side], 1e-12));
  // まとめ
  const S = summarize([
    { side: 'L', closeP: 0.8, closeCloud: 1, startLeft: true, maker: -1, profit: { x: 1 } },
    { side: 'R', closeP: 0.3, closeCloud: 0, startLeft: true, maker: 0.5, profit: { x: -0.5 } },
  ]);
  assert.ok(near(S.brierM, 0.065, 1e-12) && S.brierC === 0);
  assert.equal([S.n, S.left, S.startSide, S.maker, S.profit.x].join(','), '2,1,1,-0.5,0.5');
  assert.equal([S.binsM[8].join(' '), S.binsM[3].join(' '), S.binsC[9].join(' '), S.binsC[0].join(' ')].join(','), '1 0.8 1,1 0.3 0,1 1 1,1 0 0');
});
