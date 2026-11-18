// 「VRoid のキャラを人の動きで動かす」の core（動きのコマの間のつなぎ方・揺れもの）のテスト
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
const e = sb.dekiru.entries.find((x) => x.id === '3d-vroid-motion');
const ctx = vm.createContext({});
vm.runInContext(sb.dekiru.src(e.core) + '\n;globalThis.__x = { sampleClip, springStep, qslerp, qrot, qaxis, lookAtMap, eyeAngles };', ctx);
const C = ctx.__x;
const near = (a, b, eps = 1e-4) => a.every((v, i) => Math.abs(v - b[i]) < eps);

test('動きのコマの間: 両端は元のコマ、真ん中は回転の中間（腰の位置は直線でつなぐ）', () => {
  const q0 = [0, 0, 0, 1], q1 = C.qaxis([0, 0, 1], Math.PI / 2);
  const rot = Int16Array.from([...q0, ...q1].map((v) => Math.round(v * 32767))), hips = Float32Array.from([0, 1, 0, 2, 1, 0]);
  const clip = { frames: 2, fps: 10 };
  assert.ok(near(C.sampleClip(clip, rot, hips, 0).rot[0], q0));
  const mid = C.sampleClip(clip, rot, hips, 0.05);
  assert.ok(near(C.qrot(mid.rot[0], [1, 0, 0]), [Math.SQRT1_2, Math.SQRT1_2, 0], 1e-3), JSON.stringify(mid.rot[0]));
  assert.ok(near(mid.hips, [1, 1, 0]));
});

test('揺れもの: 先端までの長さを保ち、重さで下へ動く', () => {
  const s = { len: 0.2, stiff: 0, grav: 1, gdir: [0, -1, 0], drag: 0.4, hit: 0.01, cur: null, prev: null };
  for (let i = 0; i < 30; i++) C.springStep(s, [0, 0, 0], [1, 0, 0], 1 / 30, []);
  assert.ok(Math.abs(Math.hypot(...s.cur) - 0.2) < 1e-6);
  assert.ok(s.cur[1] < -0.05, `下がっていない: ${s.cur}`);
});

test('揺れもの: 当たり判定の球の中には入らない', () => {
  const s = { len: 0.2, stiff: 0, grav: 3, gdir: [0, -1, 0], drag: 0.4, hit: 0.01, cur: null, prev: null };
  const ball = [{ p: [0.15, -0.1, 0], r: 0.08 }];
  for (let i = 0; i < 60; i++) C.springStep(s, [0, 0, 0], [1, 0, 0], 1 / 30, ball);
  const d = Math.hypot(s.cur[0] - 0.15, s.cur[1] + 0.1, s.cur[2]);
  assert.ok(d >= 0.09 - 1e-6, `球に入った: ${d}`);
});

// VRoid の AvatarSample_B の VRM に書かれている視線の縮め方（firstPerson の lookAt）
const LA = {
  horizontalInner: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 90, yRange: 8 }, horizontalOuter: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 90, yRange: 12 },
  verticalDown: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 90, yRange: 10 }, verticalUp: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 90, yRange: 10 },
};
const deg = Math.PI / 180;

test('視線の縮め方: VRM の曲線で、視線の角度（xRange まで）を目の骨の角度（yRange まで）に縮める', () => {
  assert.ok(Math.abs(C.lookAtMap(45, LA.verticalUp) - 5) < 1e-9);
  assert.ok(Math.abs(C.lookAtMap(120, LA.verticalUp) - 10) < 1e-9, 'xRange を超えたら yRange で止まる');
  assert.equal(C.lookAtMap(0, LA.horizontalOuter), 0);
  // 曲線が直線でないとき（ゆっくり始まる曲線: 両端の接線 0）は、3 分の 1 の角度で 3 分の 1 より小さい（10 × 0.259）
  assert.ok(Math.abs(C.lookAtMap(30, { curve: [0, 0, 0, 0, 1, 1, 0, 0], xRange: 90, yRange: 10 }) - 10 * (3 / 9 - 2 / 27)) < 1e-9);
});

test('目線: 頭から見て正面なら回さず、上は verticalUp、左右は目ごとに外側・内側の縮め方を使う（VRM 0.x の顔は -Z）', () => {
  assert.deepEqual([...C.eyeAngles([0, 0, -1], 'left', LA)].map((v) => Math.abs(v)), [0, 0]);
  // 30 度上 → 10 × 30 / 90 = 3.33 度
  const up = C.eyeAngles([0, Math.sin(30 * deg), -Math.cos(30 * deg)], 'left', LA);
  assert.ok(Math.abs(up[1] - 10 / 3 * deg) < 1e-9 && Math.abs(up[0]) < 1e-12, JSON.stringify(up));
  // キャラの左（-X）へ 45 度: 左目には外側（12 → 6 度）、右目には内側（8 → 4 度）。向きは + （+Y 軸まわりで -Z が -X へ回る）
  const v = [-Math.sin(45 * deg), 0, -Math.cos(45 * deg)];
  assert.ok(Math.abs(C.eyeAngles(v, 'left', LA)[0] - 6 * deg) < 1e-9);
  assert.ok(Math.abs(C.eyeAngles(v, 'right', LA)[0] - 4 * deg) < 1e-9);
  // 後ろ（顔から 90 度より外）にあっても、目は yRange までしか回らない（白目にならない）
  const back = C.eyeAngles([0.2, -0.3, 0.9], 'left', LA);
  assert.ok(Math.abs(back[0]) <= 12 * deg + 1e-12 && Math.abs(back[1]) <= 10 * deg + 1e-12, JSON.stringify(back));
});
