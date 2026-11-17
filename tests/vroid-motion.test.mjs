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
vm.runInContext(sb.dekiru.src(e.core) + '\n;globalThis.__x = { sampleClip, springStep, qslerp, qrot, qaxis };', ctx);
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
