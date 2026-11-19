// 三面図からドット絵の立体を作る計算（tools/lib/stack.mjs）と、項目 3d-stack-girl の core（データを板に戻す・板の重ね方）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { deflateRawSync } from 'node:zlib';
import { fillHoles, runsOf, bandRow, sliceEllipses, insideEllipse, viewFor, medianCut, nearest, normalAt, shellOf, splitLimbs, isSkin, isHair, splitHairEdges, hairClass } from '../tools/lib/stack.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sb);
vm.runInContext(readFileSync(join(ROOT, 'entries/3d-more.js'), 'utf8'), sb, { filename: 'entries/3d-more.js' });
const e = sb.dekiru.entries.find((x) => x.id === '3d-stack-girl');
const ctx = vm.createContext({ Math, Uint8Array, Uint8ClampedArray, Int32Array, Array, Object, Number, JSON, Promise, Response, Blob, DecompressionStream, atob: (s) => Buffer.from(s, 'base64').toString('binary') });
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

test('横の髪を分ける: 端から体の色が 6 画素続く所までを髪の部分にする（すき間の背景や線は数えずに進む）', () => {
  // h: 髪、.: 背景の色（すき間）、d: 線、s: 肌、w: 白いシャツ
  const row = 'hh....hhhhdhh.hhhssssssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwssssssshhhhh..hh';
  const cls = (x) => ({ h: 'in', s: 'stop', w: 'stop' })[row[x]] || 'neutral';
  const r = splitHairEdges([[0, row.length - 1]], cls);
  assert.deepEqual(r[0], [0, 16, 'hair'], '左の髪');
  assert.deepEqual(r[r.length - 1], [row.length - 9, row.length - 1, 'hair'], '右の髪');
  assert.deepEqual(r[1], [17, row.length - 10], '真ん中（肌と服）');
  assert.deepEqual(splitHairEdges([[0, 9]], () => 'in'), [[0, 9]], '全部が髪なら分けない');
  assert.equal(hairClass(150, 120, 105), 'in'); assert.equal(hairClass(250, 248, 250), 'stop'); assert.equal(hairClass(175, 175, 175), 'neutral');
});

test('断面: 横の髪（hair）の区間は、奥行きの半径を幅の 1.2 倍までにし、背中側に寄せる', () => {
  const s = sliceEllipses([[0, 9, 'hair'], [10, 59]], [[0, 79]]);
  assert.equal(s[0].rz, 6, '髪'); assert.equal(s[0].cz, 6, '髪は後ろ側（z の小さい側）に寄せる');
  assert.equal(s[1].rz, 40, '胴');
});

test('断面: 種類の付いた区間は、横の外形のいちばん太い区間とだけ組にする（胸のふくらみの前に髪を置かない）', () => {
  const s = sliceEllipses([[0, 9, 'hair'], [10, 49]], [[0, 39], [45, 54]]);
  assert.equal(s.filter((e) => e.rx === 5).length, 1, '髪は 1 つだけ');
  assert.equal(s.filter((e) => e.cz === 20 && e.rx === 20).length, 1, '胴と本体');
  const bust = s.find((e) => e.cz === 50);
  assert.ok(bust && bust.rx === 20, '胴とふくらみ（幅は本体の奥行きの 1.1 倍 = 22 まで）');
  const wide = sliceEllipses([[0, 99]], [[0, 39], [45, 54]]).find((e) => e.cz === 50);
  assert.equal(wide.rx, 22, '広い区間とふくらみの組は、幅を 22 に抑える');
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

test('腕を分ける: 区間の端の細い肌の部分を、別の区間にする（輪郭の線は飛ばす）。全部が肌の区間（脚）は分けない', () => {
  // 0: 輪郭、1〜4: 肌、5〜24: 髪と服、25: 内側の輪郭、26〜28: 肌、29: 外側の輪郭。分けた腕には、外側の輪郭と肌を入れる（左右とも）
  const skin = new Set([1, 2, 3, 4, 26, 27, 28]);
  assert.deepEqual(splitLimbs([[0, 29]], (x) => skin.has(x)), [[0, 4, 'limb'], [5, 25], [26, 29, 'limb']]);
  assert.deepEqual(splitLimbs([[0, 9]], () => true), [[0, 9]], '全部が肌');
  assert.deepEqual(splitLimbs([[0, 29]], () => false), [[0, 29]], '肌がない');
  assert.ok(isSkin(245, 222, 212) && !isSkin(245, 245, 247) && !isSkin(150, 120, 105), '肌・白・茶色');
  assert.ok(isHair(150, 120, 105) && !isHair(245, 222, 212) && !isHair(245, 245, 247) && !isHair(30, 50, 110), '髪・肌・白・紺');
  // 真ん中の条件: 真ん中が肌（顔）の区間は分けない
  assert.deepEqual(splitLimbs([[0, 29]], (x) => skin.has(x), { center: (x) => !skin.has(x) && x !== 14 }), [[0, 29]]);
  // 筋の線（合わない画素が 2 つ）を挟んだ髪も、tol 2 なら 1 つの部分として分ける
  const hair = new Set([1, 2, 3, 4, 7, 8, 9]);
  assert.deepEqual(splitLimbs([[0, 39]], (x) => hair.has(x), { kind: 'hair', tol: 2 }), [[0, 9, 'hair'], [10, 39]]);
  assert.deepEqual(splitLimbs([[0, 39]], (x) => hair.has(x), { kind: 'hair', tol: 1 }), [[0, 4, 'hair'], [5, 39]], 'tol 1 では線の手前まで');
  // 分けた区間（種類付き）は、もう一度は分けない
  assert.deepEqual(splitLimbs([[0, 4, 'limb']], () => true), [[0, 4, 'limb']]);
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

test('圧縮と戻し: deflate（raw）で縮めたものを、項目の core で元の並びに戻せる', async () => {
  const src = new Uint8Array(5000); src.fill(3, 0, 300); src.fill(7, 300, 301); for (let i = 2000; i < 2100; i++) src[i] = i % 250;
  const b64 = deflateRawSync(src, { level: 9 }).toString('base64');
  const out = await SK.inflate(b64, src.length);
  assert.deepEqual([...out], [...src]);
});

test('殻: 詰まった箱から、表面と、同じ段で表面の隣だけを残す（中は空ける）', () => {
  const W = 7, D = 7, H = 3, vox = new Uint8Array(W * D * H).fill(5);
  const keep = shellOf(vox, W, D, H);
  const at = (i, k, j) => keep[(j * D + k) * W + i];
  assert.equal(at(3, 3, 0), 1, '下の面は表面');
  assert.equal(at(0, 3, 1), 1, '横の面は表面');
  assert.equal(at(1, 3, 1), 1, '表面の隣（厚さ 2）');
  assert.equal(at(3, 3, 1), 0, '真ん中は空ける');
});

test('段の埋め戻し: 外とつながらない空き（殻の中）だけを、いちばん近い殻の色で埋める。脚の間のような外へ開いた空きは埋めない', () => {
  // 7×5 の段: 左は輪（中が空き）、右は口の開いた形
  const W = 7, D = 5, L = Uint8Array.from([
    1, 1, 1, 0, 2, 0, 2,
    1, 0, 1, 0, 2, 0, 2,
    3, 0, 1, 0, 2, 0, 2,
    1, 1, 1, 0, 2, 2, 2,
    0, 0, 0, 0, 0, 0, 0]);
  const f = SK.fillLayer(L, W, D);
  assert.equal(f[1 * W + 1], 1, '輪の中は、隣の殻の色');
  assert.ok([1, 3].includes(f[2 * W + 1]), '輪の中は、隣の殻のどれかの色');
  assert.equal(f[1 * W + 5], 0, '上へ開いた空きは埋めない');
  assert.equal(f[0 * W + 3], 0, '形の間は埋めない');
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
