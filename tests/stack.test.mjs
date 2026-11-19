// 三面図からドット絵の立体を作る計算（tools/lib/stack.mjs）と、項目 3d-stack-girl の core（データを板に戻す・板の重ね方）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { fillHoles, runsOf, bandRow, sliceEllipses, insideEllipse, viewFor, medianCut, nearest, rle, normalAt } from '../tools/lib/stack.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sb);
vm.runInContext(readFileSync(join(ROOT, 'entries/3d-more.js'), 'utf8'), sb, { filename: 'entries/3d-more.js' });
const e = sb.dekiru.entries.find((x) => x.id === '3d-stack-girl');
const ctx = vm.createContext({ Math, Uint8Array, Uint8ClampedArray, Array, Object, Number, JSON, atob: (s) => Buffer.from(s, 'base64').toString('binary') });
vm.runInContext(sb.dekiru.src(e.core) + '\n;globalThis.__x = SK;', ctx);
const SK = ctx.__x;

test('穴埋め: 外とつながっていない背景だけを埋める（口の開いたへこみは残す）', () => {
  // 5×5: 真ん中に穴のある輪と、右下に口の開いたへこみ
  const m = Uint8Array.from([
    0, 0, 0, 0, 0,
    0, 1, 1, 1, 0,
    0, 1, 0, 1, 0,
    0, 1, 1, 1, 0,
    0, 0, 0, 0, 0]);
  const f = fillHoles(m, 5, 5);
  assert.equal(f[12], 1, '穴は埋まる');
  assert.equal(f[0], 0, '外は残る');
  const u = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 0, 1]);   // 3×3。真ん中の穴は、下の真ん中を通って外へ開いている
  assert.equal(fillHoles(u, 3, 3)[4], 0, '口の開いたへこみは埋めない');
});

test('区間: 1 が続く所を [始め, 終わり] で返す。帯の行は、帯のどの行かで 1 なら 1', () => {
  assert.deepEqual(runsOf(Uint8Array.from([0, 1, 1, 0, 1, 0, 1, 1])), [[1, 2], [4, 4], [6, 7]]);
  assert.deepEqual(runsOf(Uint8Array.from([0, 0])), []);
  const m = Uint8Array.from([1, 0, 0, 0, 0, 1]);   // 3×2
  assert.deepEqual([...bandRow(m, 3, 0, 2, 0, 1)], [1, 0, 1]);
});

test('断面: 正面と横の区間の組から楕円を作る。細い区間（腕）は丸い断面にする', () => {
  const s = sliceEllipses([[0, 3], [10, 29], [36, 39]], [[0, 15]]);
  assert.equal(s.length, 3);
  const body = s[1], arm = s[0];
  assert.deepEqual([body.cx, body.rx, body.cz, body.rz], [20, 10, 8, 8]);
  assert.equal(arm.rx, 2); assert.equal(arm.rz, 2, '腕の奥行きの半径は幅の半分');
  assert.equal(arm.cz, 8, '腕の奥行きの中心は横の外形の中心');
});

test('楕円の中か: 入る楕円の中で中心にいちばん近いものを選び、外向きの向きを返す', () => {
  const list = [{ cx: 0, cz: 0, rx: 4, rz: 2 }, { cx: 10, cz: 0, rx: 2, rz: 2 }];
  assert.equal(insideEllipse(list, 6, 0), null);
  const r = insideEllipse(list, 2, 1);
  assert.equal(r.e, list[0]); assert.equal(r.u, 0.5); assert.equal(r.v, 0.5);
});

test('楕円の形の指数: 指数を大きくすると、楕円の角の外にあった点も入る（腕が胴に触れる所を削らない）', () => {
  const list = [{ cx: 0, cz: 0, rx: 4, rz: 4 }];
  assert.equal(insideEllipse(list, 3.4, 3.0), null, '楕円では外');
  assert.ok(insideEllipse(list, 3.4, 3.0, 4), '指数 4 では中');
});

test('面の向き: 詰まった半分の空間の境目では、空いている側を向く', () => {
  const occ = (i, k, j) => (k < 0 ? 1 : 0);   // z が負の側が詰まっている
  const n = normalAt(occ, 0, -1, 0, 2);
  assert.ok(n[2] > 0 && n[0] === 0 && n[1] === 0, JSON.stringify(n));
});

test('色を取る絵: 前寄りなら正面、後ろ寄りなら後ろ、右（+x）なら左の横顔の絵、左なら右の横顔の絵', () => {
  assert.equal(viewFor(0.1, 0.9), 'front');
  assert.equal(viewFor(0.1, -0.9), 'back');
  assert.equal(viewFor(0.9, 0.2), 'left');
  assert.equal(viewFor(-0.9, 0.2), 'right');
});

test('色の数を減らす: 離れた 2 組の色は 2 色に分かれ、それぞれの平均になる', () => {
  const pal = medianCut([[0, 0, 0], [10, 0, 0], [200, 200, 200], [210, 200, 200]], 2);
  assert.equal(pal.length, 2);
  assert.deepEqual(pal.map((c) => c[0]).sort((a, b) => a - b), [5, 205]);
  assert.equal(nearest(pal, [190, 190, 190]), pal.findIndex((c) => c[0] === 205));
});

test('圧縮と戻し: [回数, 値] の組にしたものを、項目の core で元の並びに戻せる（255 より長い並びも）', () => {
  const src = new Uint8Array(700); src.fill(3, 0, 300); src.fill(7, 300, 301); src.fill(0, 301);
  const enc = rle(src);
  assert.equal(enc.length % 2, 0);
  const b64 = Buffer.from(enc).toString('base64');
  assert.deepEqual([...SK.unrle(b64, src.length)], [...src]);
});

test('板の重ね方: 見下ろす角度が大きいほど、板は縦につぶれず、1 枚ごとの上下のずれは小さい', () => {
  const lo = SK.layerStep(20 * Math.PI / 180), hi = SK.layerStep(60 * Math.PI / 180);
  assert.ok(lo.dy > hi.dy, '上下のずれ');
  assert.ok(lo.squash < hi.squash, 'つぶれ方');
  assert.ok(lo.dy <= 1 && hi.dy <= 1, '1 枚ごとのずれは 1 画素以下（すき間ができない）');
  // 見下ろす角度は下限と上限で止まる（下からは見ない）
  assert.equal(SK.clampElev(-1), SK.ELEV_MIN); assert.equal(SK.clampElev(3), SK.ELEV_MAX);
  assert.ok(SK.ELEV_MIN > 0);
});
