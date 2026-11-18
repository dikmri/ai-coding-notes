// 数式で動く作品（アトラクターの光の雲・複素関数の色の地図・クラドニ図形・円の掛け算）の core のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sb);
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const [, f] of html.matchAll(/<script src="(entries\/[^"]+)"/g)) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), sb, { filename: f });
const load = (id, names) => {
  const e = sb.dekiru.entries.find((x) => x.id === id);
  assert.ok(e, `項目 ${id} がない`);
  const ctx = vm.createContext({});
  vm.runInContext(sb.dekiru.src(e.core) + `\n;globalThis.__x = { ${names.join(', ')} };`, ctx);
  return ctx.__x;
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('アトラクター: クリフォードの式 x ← sin(a·y) + c·cos(a·x)、y ← sin(b·x) + d·cos(b·y)', () => {
  const A = load('mt-clifford', ['clifford', 'toneMap', 'palette']);
  const p = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 };
  const [x, y] = A.clifford(p, 0.5, -0.3);
  assert.ok(near(x, Math.sin(-1.4 * -0.3) + Math.cos(-1.4 * 0.5)) && near(y, Math.sin(1.6 * 0.5) + 0.7 * Math.cos(1.6 * -0.3)));
  // どこから始めても、点は |x| ≤ 1 + |c|、|y| ≤ 1 + |d| の箱から出ない
  let q = [0.1, 0.1];
  for (let i = 0; i < 1000; i++) { q = A.clifford(p, q[0], q[1]); assert.ok(Math.abs(q[0]) <= 2 && Math.abs(q[1]) <= 1.7); }
});

test('アトラクター: 光の濃さは 0 から 1 へ単調に増え、色は 0〜1 に収まる', () => {
  const A = load('mt-clifford', ['clifford', 'toneMap', 'palette']);
  assert.equal(A.toneMap(0, 100), 0);
  assert.ok(near(A.toneMap(100, 100), 1));
  assert.ok(A.toneMap(5, 100) < A.toneMap(20, 100));
  assert.ok(A.toneMap(5, 100) > 5 / 100, '暗い所を持ち上げていない（対数にしていない）');
  for (let t = 0; t <= 1; t += 0.05) for (const v of A.palette(t)) assert.ok(v >= 0 && v <= 1, `${t}: ${v}`);
});

test('色の地図: 零点で 0、極の近くで大きく、偏角は 0〜1 の色の向きにする', () => {
  const Z = load('mt-domain-coloring', ['evalF', 'hueOf', 'cmul', 'cdiv']);
  const roots = [[0.5, 0], [-0.5, 0.3]], poles = [[0, -0.6]];
  assert.ok(Math.hypot(...Z.evalF([0.5, 0], roots, poles)) < 1e-12);
  assert.ok(Math.hypot(...Z.evalF([0, -0.6 + 1e-6], roots, poles)) > 1e4);
  // f(z) = (z − r1)(z − r2) / (z − p1) をそのまま計算した値と同じ
  const z = [0.2, 0.7], want = Z.cdiv(Z.cmul([z[0] - 0.5, z[1]], [z[0] + 0.5, z[1] - 0.3]), [z[0], z[1] + 0.6]);
  const got = Z.evalF(z, roots, poles);
  assert.ok(near(got[0], want[0]) && near(got[1], want[1]));
  assert.ok(near(Z.hueOf([1, 0]), 0) && near(Z.hueOf([0, 1]), 0.25) && near(Z.hueOf([-1, 0]), 0.5) && near(Z.hueOf([0, -1]), 0.75));
});

test('クラドニ図形: 振動の形は n と m を入れ替えると符号が逆になり、対角線の上は必ず節（振れない）', () => {
  const K = load('mt-chladni', ['chladni', 'sandStep']);
  for (const [x, y] of [[0.1, 0.7], [0.33, 0.9], [0.6, 0.2]]) assert.ok(near(K.chladni(3, 5, x, y), -K.chladni(5, 3, x, y)));
  for (const s of [0, 0.17, 0.5, 0.83, 1]) assert.ok(Math.abs(K.chladni(2, 5, s, s)) < 1e-12);
});

test('クラドニ図形: 砂は振れの大きい所ほど大きく跳ね、繰り返すと節の近くに集まる', () => {
  const K = load('mt-chladni', ['chladni', 'sandStep']);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const sand = Array.from({ length: 400 }, () => [rnd(), rnd()]);
  const meanAmp = () => sand.reduce((s, [x, y]) => s + Math.abs(K.chladni(2, 3, x, y)), 0) / sand.length;
  const before = meanAmp();
  for (let k = 0; k < 600; k++) for (const p of sand) { const q = K.sandStep(p, 2, 3, rnd, 0.02); p[0] = q[0]; p[1] = q[1]; }
  assert.ok(meanAmp() < before * 0.3, `節に集まっていない: ${before.toFixed(3)} → ${meanAmp().toFixed(3)}`);
  assert.ok(sand.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1), '板から落ちた');
});

test('円の掛け算: 点 i は点 k×i（N で割った余り）と結ばれ、整数の k では尖りが k−1 個の曲線になる', () => {
  const T = load('mt-times-table', ['chord', 'cusps']);
  assert.deepEqual([...T.chord(7, 2, 200)].map((v) => +v.toFixed(9)), [7, 14]);
  assert.deepEqual([...T.chord(150, 2, 200)].map((v) => +v.toFixed(9)), [150, 100]);
  assert.ok(near(T.chord(10, 2.5, 200)[1], 25));
  assert.equal(T.cusps(2), 1);   // カージオイド
  assert.equal(T.cusps(3), 2);   // ネフロイド
  assert.equal(T.cusps(2.5), null, '整数でない k は閉じた曲線にならない');
});
