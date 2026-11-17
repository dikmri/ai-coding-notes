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
