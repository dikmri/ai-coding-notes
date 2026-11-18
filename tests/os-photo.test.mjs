// 写真の現像の計算（os/js/core/photo.mjs）のテスト。
// 色の変換、調整の式（露出・コントラスト・明るい所と暗い所・白と黒の点・色温度と色かぶり・彩度・白黒・周辺）、
// トーンカーブ（単調な 3 次の補間）、切り抜きと回転の座標、ヒストグラム、.fdev の検証、見本（プリセット）を確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../os/js/core/photo.mjs';

const near = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} と ${b} の差が ${eps} より大きい`);
const lumaOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// 1 画素を現像する（周辺の位置は真ん中）
function dev(rgb, patch = {}, uv = [0.5, 0.5]) {
  const s = { ...F.defaults(), ...patch };
  return F.developPixel(rgb[0], rgb[1], rgb[2], F.uniforms(s), F.curveLUT(s.curve), uv[0], uv[1]);
}
const COLORS = [[0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5], [0.8, 0.3, 0.1], [0.1, 0.4, 0.9], [0.02, 0.05, 0.03]];

test('色の変換: sRGB と線形の光を行き来すると元に戻る', () => {
  for (let i = 0; i <= 20; i++) { const v = i / 20; near(F.toSrgb(F.toLinear(v)), v, 1e-9); }
  near(F.toLinear(0.5), 0.2140, 1e-4);
  near(F.toSrgb(0.18), 0.4614, 1e-4);
});

test('既定の設定: どの色も変わらない', () => {
  for (const c of COLORS) { const o = dev(c); for (let k = 0; k < 3; k++) near(o[k], c[k], 1e-6, `色 ${c}`); }
});

test('色温度の行列: 0 と 0 では単位行列。プランクの軌跡は 6504K で白に近い', () => {
  const m = F.wbMatrix(0, 0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) near(m[r * 3 + c], r === c ? 1 : 0, 1e-6);
  const [x, y] = F.planckXY(6504);
  near(x, 0.3135, 0.002); near(y, 0.3237, 0.002);
});

test('色温度: 上げると灰色が暖かく（赤が青より強く）、下げると冷たくなる', () => {
  const warm = dev([0.5, 0.5, 0.5], { temp: 50 }), cool = dev([0.5, 0.5, 0.5], { temp: -50 });
  assert.ok(warm[0] > warm[2] + 0.03, `暖かい: ${warm}`);
  assert.ok(cool[2] > cool[0] + 0.03, `冷たい: ${cool}`);
});

test('色かぶり: 上げると灰色が赤紫に（緑が赤と青より弱く）、下げると緑になる', () => {
  const mag = dev([0.5, 0.5, 0.5], { tint: 60 }), grn = dev([0.5, 0.5, 0.5], { tint: -60 });
  assert.ok(mag[1] < mag[0] - 0.01 && mag[1] < mag[2] - 0.01, `赤紫: ${mag}`);
  assert.ok(grn[1] > grn[0] + 0.01 && grn[1] > grn[2] + 0.01, `緑: ${grn}`);
});

test('露出: +1 で線形の光が 2 倍になる。黒は黒のまま', () => {
  const o = dev([0.5, 0.5, 0.5], { exposure: 1 });
  near(o[0], F.toSrgb(F.toLinear(0.5) * 2), 1e-6);
  assert.deepEqual(dev([0, 0, 0], { exposure: 2 }), [0, 0, 0]);
  assert.ok(dev([0.5, 0.5, 0.5], { exposure: -1 })[0] < 0.5);
});

test('コントラスト: 真ん中の 0.5 は動かず、暗い所はより暗く、明るい所はより明るく', () => {
  near(dev([0.5, 0.5, 0.5], { contrast: 70 })[0], 0.5, 1e-6); // 曲線の表は 32 ビットの小数なので 1e-6 まで
  assert.ok(dev([0.25, 0.25, 0.25], { contrast: 70 })[0] < 0.25);
  assert.ok(dev([0.75, 0.75, 0.75], { contrast: 70 })[0] > 0.75);
  assert.ok(dev([0.25, 0.25, 0.25], { contrast: -70 })[0] > 0.25); // 下げると平らに
});

test('明るい所と暗い所: 明るい所を下げると明るい画素だけ暗く、暗い所を上げると暗い画素だけ明るく。黒は黒のまま', () => {
  const hi = dev([0.9, 0.9, 0.9], { highlights: -80 }), loKeep = dev([0.1, 0.1, 0.1], { highlights: -80 });
  assert.ok(hi[0] < 0.85, `明るい所: ${hi}`);
  near(loKeep[0], 0.1, 0.005, '暗い画素は変わらない');
  const sh = dev([0.1, 0.1, 0.1], { shadows: 80 }), hiKeep = dev([0.95, 0.95, 0.95], { shadows: 80 });
  assert.ok(sh[0] > 0.15, `暗い所: ${sh}`);
  near(hiKeep[0], 0.95, 0.005, '明るい画素は変わらない');
  assert.deepEqual(dev([0, 0, 0], { shadows: 100 }), [0, 0, 0]);
});

test('明るい所と暗い所: どの強さでも明るさの順番が入れ替わらない（単調）', () => {
  for (const patch of [{ highlights: -100 }, { highlights: 100 }, { shadows: 100 }, { shadows: -100 }, { highlights: -100, exposure: 1.5 }]) {
    let prev = -1;
    for (let i = 0; i <= 200; i++) { const v = dev([i / 200, i / 200, i / 200], patch)[0]; assert.ok(v >= prev - 1e-9, `${JSON.stringify(patch)} の ${i}`); prev = v; }
  }
});

test('白と黒の点: 白を上げると明るい所が白に近づき、黒を下げると暗い所が黒に近づく', () => {
  assert.ok(dev([0.85, 0.85, 0.85], { whites: 60 })[0] > 0.9);
  assert.ok(dev([0.12, 0.12, 0.12], { blacks: -60 })[0] < 0.08);
  assert.ok(dev([0, 0, 0], { blacks: 60 })[0] > 0.05); // 黒を上げると黒が浮く（色あせ）
});

test('彩度と自然な彩度: 彩度 -100 で灰色。自然な彩度は鮮やかな色より地味な色を強く上げる', () => {
  const g = dev([0.8, 0.3, 0.1], { saturation: -100 });
  near(g[0], g[1], 1e-9); near(g[1], g[2], 1e-9);
  const spread = (c) => Math.max(...c) - Math.min(...c);
  const dull = [0.55, 0.5, 0.45], vivid = [0.9, 0.2, 0.1];
  const gainDull = spread(dev(dull, { vibrance: 60 })) / spread(dull), gainVivid = spread(dev(vivid, { vibrance: 60 })) / spread(vivid);
  assert.ok(gainDull > gainVivid && gainVivid >= 1, `地味 ${gainDull} 鮮やか ${gainVivid}`);
});

test('白黒: どの色も R=G=B になる', () => {
  for (const c of COLORS) { const o = dev(c, { mono: true, temp: 30, saturation: 40 }); near(o[0], o[1], 1e-12); near(o[1], o[2], 1e-12); }
});

test('周辺を暗くする: 真ん中は変わらず、角は暗くなる。負の値では角が明るくなる', () => {
  const c = [0.6, 0.6, 0.6];
  near(dev(c, { vignette: 80 }, [0.5, 0.5])[0], 0.6, 1e-6);
  assert.ok(dev(c, { vignette: 80 }, [0, 0])[0] < 0.4);
  assert.ok(dev(c, { vignette: -80 }, [1, 1])[0] > 0.7);
});

test('トーンカーブ: 直線は何もしない。点を通り、単調な点の並びなら行き過ぎない', () => {
  const id = F.curveLUT([[0, 0], [1, 1]]);
  assert.equal(id.length, 256);
  for (let i = 0; i < 256; i++) near(id[i], i / 255, 1e-6);
  const pts = [[0, 0], [0.25, 0.1], [0.5, 0.5], [0.6, 0.95], [1, 1]];
  const lut = F.curveLUT(pts);
  for (let i = 1; i < 256; i++) assert.ok(lut[i] >= lut[i - 1] - 1e-9, `${i} で下がった`);
  for (const v of lut) assert.ok(v >= 0 && v <= 1);
  near(F.curveAt(pts, 0.25), 0.1, 1e-9); near(F.curveAt(pts, 0.6), 0.95, 1e-9);
  // 端の点より外は、端の点の高さ
  const lifted = F.curveLUT([[0.1, 0.2], [0.9, 0.8]]);
  near(lifted[0], 0.2, 1e-6); near(lifted[255], 0.8, 1e-6);
});

test('トーンカーブ: 曲線を通すと、表の値どおりに明るさが変わる', () => {
  const o = dev([0.5, 0.5, 0.5], { curve: [[0, 0], [0.5, 0.7], [1, 1]] });
  near(o[0], 0.7, 0.002);
});

test('トーンカーブの点: 足す・動かす・消す（端の点は消せず、隣の点を越えない）', () => {
  let pts = [[0, 0], [1, 1]];
  const r = F.addCurvePoint(pts, 0.4, 0.6);
  assert.deepEqual(r.points, [[0, 0], [0.4, 0.6], [1, 1]]); assert.equal(r.index, 1);
  assert.equal(F.addCurvePoint(r.points, 0.405, 0.2), null); // 近すぎる所には足さない
  pts = F.moveCurvePoint(r.points, 1, 1.5, -2); // 右の点を越えず、0〜1 に収まる
  assert.ok(pts[1][0] < 1 && pts[1][0] > 0.9 && pts[1][1] === 0);
  assert.deepEqual(F.removeCurvePoint(pts, 0), pts); // 端は消せない
  assert.deepEqual(F.removeCurvePoint(pts, 1), [[0, 0], [1, 1]]);
});

test('座標: 何もしないときは、出力の画素の中心が元の画素の中心に重なる', () => {
  const s = F.defaults();
  assert.deepEqual(F.outputSize(s, 40, 30), { w: 40, h: 30 });
  const M = F.geometryMatrix(s, 40, 30, 40, 30);
  assert.deepEqual(F.applyMatrix(M, 0.5, 0.5).map((v) => +v.toFixed(9)), [0.5, 0.5]);
  assert.deepEqual(F.applyMatrix(M, 39.5, 29.5).map((v) => +v.toFixed(9)), [39.5, 29.5]);
});

test('座標: 右に 90° 回すと縦横が入れ替わり、出力の左上は元の左下になる。左右反転は左右が入れ替わる', () => {
  const s = { ...F.defaults(), rot: 1 };
  assert.deepEqual(F.outputSize(s, 40, 30), { w: 30, h: 40 });
  const M = F.geometryMatrix(s, 40, 30, 30, 40);
  assert.deepEqual(F.applyMatrix(M, 0.5, 0.5).map((v) => +v.toFixed(9)), [0.5, 29.5]);
  const f = F.geometryMatrix({ ...F.defaults(), flip: true }, 40, 30, 40, 30);
  assert.deepEqual(F.applyMatrix(f, 0.5, 0.5).map((v) => +v.toFixed(9)), [39.5, 0.5]);
  const r3 = F.geometryMatrix({ ...F.defaults(), rot: 3 }, 40, 30, 30, 40);
  assert.deepEqual(F.applyMatrix(r3, 0.5, 0.5).map((v) => +v.toFixed(9)), [39.5, 0.5]); // 左に 90°: 出力の左上は元の右上
});

test('座標: 切り抜きは出力の大きさと位置になる。半分の大きさで描くと 2 倍の歩幅で元を読む', () => {
  const s = { ...F.defaults(), crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } };
  assert.deepEqual(F.outputSize(s, 40, 30), { w: 20, h: 15 });
  assert.deepEqual(F.outputSize(s, 40, 30, { full: true }), { w: 40, h: 30 });
  const M = F.geometryMatrix(s, 40, 30, 20, 15);
  assert.deepEqual(F.applyMatrix(M, 0.5, 0.5).map((v) => +v.toFixed(9)), [10.5, 15.5]);
  const half = F.geometryMatrix(s, 40, 30, 10, 7.5);
  assert.deepEqual(F.applyMatrix(half, 1, 1).map((v) => +v.toFixed(9)), [12, 17]);
});

test('水平を直す回転: 出力の真ん中は元の真ん中。切り抜きの四隅が回した画像の内に収まるように縮める', () => {
  const s = { ...F.defaults(), angle: 10 };
  const M = F.geometryMatrix(s, 400, 300, 400, 300);
  assert.deepEqual(F.applyMatrix(M, 200, 150).map((v) => +v.toFixed(6)), [200, 150]);
  assert.equal(F.cropInside({ x: 0, y: 0, w: 1, h: 1 }, 400, 300, 10), false);
  const fit = F.fitCrop({ x: 0, y: 0, w: 1, h: 1 }, 400, 300, 10);
  assert.ok(F.cropInside(fit, 400, 300, 10));
  assert.ok(fit.w > 0.7 && fit.w < 0.95, `幅 ${fit.w}`);
  near(fit.w * 400 / (fit.h * 300), 400 / 300, 1e-6, '比率は保つ');
  near(fit.x + fit.w / 2, 0.5, 1e-9); near(fit.y + fit.h / 2, 0.5, 1e-9);
  assert.equal(F.cropInside({ x: 0, y: 0, w: 1, h: 1 }, 400, 300, 0), true);
});

test('切り抜きの移動と大きさ: 外へはみ出す動きは、内に収まる所で止まる', () => {
  const prev = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
  const moved = F.constrainCrop(prev, { x: 0.7, y: 0.1, w: 0.5, h: 0.5 }, 400, 300, 0);
  near(moved.x, 0.5, 1e-3); near(moved.y, 0.1, 1e-9);
  const big = F.resizeCrop(prev, 'br', 0.2, 0.1, null);
  assert.deepEqual(big, { x: 0.1, y: 0.1, w: 0.7, h: 0.6 });
  const tl = F.resizeCrop(prev, 'tl', 0.1, 0.1, null);
  assert.deepEqual(tl, { x: 0.2, y: 0.2, w: 0.4, h: 0.4 });
  // 比率を固定すると、画素の縦横の比が保たれる（400×300 の画像で 1:1）
  const sq = F.resizeCrop({ x: 0.1, y: 0.1, w: 0.3, h: 0.4 }, 'br', 0.15, 0.01, 1, 400, 300);
  near(sq.w * 400, sq.h * 300, 1e-6);
});

test('比率: 1:1 と 16:9 と元の比率の切り抜き（真ん中に、なるべく大きく）', () => {
  const sq = F.aspectCrop({ x: 0, y: 0, w: 1, h: 1 }, '1:1', 400, 300, 0);
  near(sq.w * 400, sq.h * 300, 1e-6); near(sq.h, 1, 1e-9); near(sq.x, 0.125, 1e-9);
  const wide = F.aspectCrop({ x: 0, y: 0, w: 1, h: 1 }, '16:9', 400, 300, 0);
  near((wide.w * 400) / (wide.h * 300), 16 / 9, 1e-6); near(wide.w, 1, 1e-9);
  const orig = F.aspectCrop(sq, 'orig', 400, 300, 0);
  near((orig.w * 400) / (orig.h * 300), 4 / 3, 1e-6);
  assert.deepEqual(F.aspectCrop(sq, 'free', 400, 300, 0), sq);
  assert.equal(F.aspectRatioOf('3:2', 400, 300), 1.5);
  assert.equal(F.aspectRatioOf('free', 400, 300), null);
});

test('90° 回すと切り抜きも一緒に回り、4 回で元に戻る。左右反転は 2 回で戻り、傾きの向きが逆になる', () => {
  const s0 = { ...F.defaults(), crop: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, angle: 5, aspect: '4:3' };
  let s = s0;
  s = F.rotateSettings(s, 1);
  assert.equal(s.rot, 1); assert.equal(s.aspect, '3:4');
  assert.deepEqual(s.crop, { x: 0.4, y: 0.1, w: 0.4, h: 0.3 });
  for (let i = 0; i < 3; i++) s = F.rotateSettings(s, 1);
  assert.deepEqual(s.crop, s0.crop); assert.equal(s.rot, 0); assert.equal(s.aspect, '4:3');
  assert.deepEqual(F.rotateSettings(F.rotateSettings(s0, 1), -1).crop, s0.crop);
  const f = F.flipSettings(s0);
  assert.equal(f.flip, true); assert.equal(f.angle, -5); near(f.crop.x, 0.6, 1e-9);
  assert.deepEqual(F.flipSettings(f).crop, s0.crop);
});

test('CPU の処理: 元の大きさのまま、何もしないなら同じ画素。白黒は R=G=B。シャープで縁の差が広がる', () => {
  const w = 8, h = 4, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; data.set(x < 4 ? [40, 90, 160, 255] : [200, 150, 60, 255], i); }
  const src = { width: w, height: h, data };
  const same = F.renderCPU(src, F.defaults(), w, h);
  assert.deepEqual([...same.data], [...data]);
  const mono = F.renderCPU(src, { ...F.defaults(), mono: true }, w, h).data;
  for (let i = 0; i < mono.length; i += 4) { assert.equal(mono[i], mono[i + 1]); assert.equal(mono[i + 1], mono[i + 2]); }
  const sharp = F.renderCPU(src, { ...F.defaults(), sharpen: 100 }, w, h).data;
  const at = (d, x) => d[(1 * w + x) * 4];
  assert.ok(at(sharp, 3) < at(same.data, 3) && at(sharp, 4) > at(same.data, 4), '縁の両側の差が広がる');
  const rot = F.renderCPU(src, { ...F.defaults(), rot: 1 }, h, w);
  assert.equal(rot.width, 4); assert.equal(rot.height, 8);
});

test('ヒストグラム: 明るさと RGB の数、白飛びと黒つぶれの割合。透明な画素は数えない', () => {
  const d = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 10, 10, 10, 0]);
  const h = F.histogram(d);
  assert.equal(h.total, 3);
  assert.equal(h.r[255], 2); assert.equal(h.g[0], 2); assert.equal(h.l[255], 1); assert.equal(h.l[54], 1); assert.equal(h.l[0], 1);
  near(h.clipHi, 1 / 3, 1e-9); near(h.clipLo, 1 / 3, 1e-9);
});

test('.fdev: 画像の横に置く名前。書いたものを読むと同じ設定に戻る', () => {
  assert.equal(F.fdevPathFor('/画像/海.jpg'), '/画像/海.jpg.fdev');
  assert.equal(F.sourceOfFdevPath('/画像/海.jpg.fdev'), '/画像/海.jpg');
  const s = { ...F.defaults(), exposure: 0.75, temp: -20, mono: true, curve: [[0, 0.1], [0.5, 0.6], [1, 1]], crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, angle: 3.5, rot: 2, flip: true, aspect: '1:1' };
  const text = F.fdevText('/画像/海.jpg', s);
  const back = F.parseFdev(text);
  assert.equal(back.source, '/画像/海.jpg');
  assert.deepEqual(back.settings, F.normalize(s));
  assert.ok(F.same(back.settings, s));
});

test('.fdev の検証: 壊れたもの・違う形式は分かる言葉で断る。範囲の外の値は収める', () => {
  assert.throws(() => F.parseFdev('{'), /JSON/);
  assert.throws(() => F.parseFdev('{"format":"other"}'), /写真の現像の設定ではありません/);
  assert.throws(() => F.parseFdev(JSON.stringify({ format: F.FDEV_FORMAT, version: 99, source: '/a.jpg', settings: {} })), /新しい版/);
  assert.throws(() => F.parseFdev(JSON.stringify({ format: F.FDEV_FORMAT, version: 1, settings: {} })), /元の画像/);
  const r = F.parseFdev(JSON.stringify({ format: F.FDEV_FORMAT, version: 1, source: '/a.jpg', settings: { exposure: 99, contrast: 'x', curve: [[0.5, 2], [0.5, 0.1]], crop: { x: -1, y: 0, w: 5, h: 0 }, rot: 7, angle: 90 } }));
  assert.equal(r.settings.exposure, 3); assert.equal(r.settings.contrast, 0);
  assert.equal(r.settings.rot, 0); assert.equal(r.settings.angle, 45);
  assert.deepEqual(r.settings.curve, [[0, 0], [1, 1]]); // 壊れた曲線は直線に戻す
  assert.deepEqual(r.settings.crop, { x: 0, y: 0, w: 1, h: 1 });
});

test('見本（プリセット）: 色の設定だけを変え、切り抜きと回転は保つ。白黒の見本は白黒になる', () => {
  assert.ok(F.PRESETS.length >= 4);
  const cur = { ...F.defaults(), crop: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, rot: 1, exposure: 1 };
  const mono = F.PRESETS.find((p) => p.id === 'mono');
  const out = F.applyPreset(cur, mono);
  assert.equal(out.mono, true); assert.deepEqual(out.crop, cur.crop); assert.equal(out.rot, 1); assert.equal(out.exposure, 0);
  for (const p of F.PRESETS) assert.ok(F.same(F.normalize(F.applyPreset(F.defaults(), p)), F.applyPreset(F.defaults(), p)), p.name + ' は範囲の内');
  assert.deepEqual(F.toneOnly(cur).crop, undefined);
  const list = F.normalizePresets([{ name: '私の', settings: { exposure: 0.5 } }, { name: '', settings: {} }, 'x', { name: 'a'.repeat(50), settings: { temp: 500 } }]);
  assert.equal(list.length, 2); assert.equal(list[0].settings.exposure, 0.5); assert.equal(list[1].name.length, 24); assert.equal(list[1].settings.temp, 100);
});

test('書き出しの名前と形式', () => {
  assert.equal(F.exportName('/画像/海.jpg', 'png'), '海-現像.png');
  assert.equal(F.exportName('/画像/a.b.webp', 'jpeg'), 'a.b-現像.jpg');
  assert.equal(F.EXPORT_TYPES.webp.mime, 'image/webp');
});

test('大きさを枠に合わせる（拡大はしない）', () => {
  assert.deepEqual(F.fitSize(1200, 800, 600, 600), { w: 600, h: 400 });
  assert.deepEqual(F.fitSize(100, 50, 600, 600), { w: 100, h: 50 });
});

test('シェーダー: 調整の式と同じ名前の値を使う（JS と GLSL の取り違えを防ぐ）', () => {
  const u = F.uniforms(F.defaults());
  for (const k of ['uGain', 'uSh', 'uHi', 'uBp', 'uWp', 'uK', 'uSat', 'uVib', 'uVig', 'uSharp', 'uMono', 'uWB']) {
    assert.ok(k in u, k + ' が uniforms に無い');
    assert.match(F.FRAG_SRC, new RegExp('\\b' + k + '\\b'), k + ' がシェーダーに無い');
  }
  assert.match(F.FRAG_SRC, /smoothstep\(0\.0, 0\.6, L\)/); // 暗い所の重み（JS と同じ範囲）
  assert.match(F.FRAG_SRC, /smoothstep\(0\.35, 1\.0, L\)/); // 明るい所の重み
  assert.match(F.FRAG_SRC, /smoothstep\(0\.25, 1\.0, d\)/); // 周辺の重み
});
