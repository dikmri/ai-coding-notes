// 「夕暮れの浅瀬で手を振るキャラ」の core（背景と同じカメラの写し方・海風を受ける揺れもの）のテスト
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
const e = sb.dekiru.entries.find((x) => x.id === '3d-vroid-shore');
assert.ok(e, '項目 3d-vroid-shore がない');
const ctx = vm.createContext({});
vm.runInContext(sb.dekiru.src(e.core) + '\n;globalThis.__x = { toScreen, springStep, HZ, CH };', ctx);
const C = ctx.__x;

// 背景のシェーダーが画面の点から床の位置を求める式（entries の bgProg と同じ）
const floorAt = (p, cam) => { const z = C.CH / (C.HZ - p[1]); return [-p[0] * z + cam[0], z + cam[2]]; };

test('写し方: 床の上の点は、背景が同じ画面の位置に描く床の点と一致する（足が地面に乗る）', () => {
  for (const cam of [[0, C.CH, 0], [0.4, C.CH, 2.5], [-1.2, C.CH, -3]]) {
    for (const w of [[0, 0, 4], [0.7, 0, 3.2], [-1.5, 0, 9]]) {
      const g = floorAt(C.toScreen(w, cam), cam);
      assert.ok(Math.abs(g[0] - w[0]) < 1e-9 && Math.abs(g[1] - w[2]) < 1e-9, `${w} → ${g}`);
    }
  }
});

test('写し方: 画面の右は世界の -X、カメラの高さの点は水平線に乗る', () => {
  const cam = [0, C.CH, 0];
  assert.ok(C.toScreen([-1, C.CH, 5], cam)[0] > 0);
  assert.ok(Math.abs(C.toScreen([3, C.CH, 7], cam)[1] - C.HZ) < 1e-12);
});

test('海風: 外からの力の向きへ先端がなびき、長さは保たれる', () => {
  const base = { len: 0.3, stiff: 0.5, grav: 0, gdir: [0, -1, 0], drag: 0.4, hit: 0.01 };
  const calm = { ...base, cur: null, prev: null }, windy = { ...base, cur: null, prev: null };
  for (let i = 0; i < 60; i++) {
    C.springStep(calm, [0, 0, 0], [0, -1, 0], 1 / 30, []);
    C.springStep(windy, [0, 0, 0], [0, -1, 0], 1 / 30, [], [1, 0, 0]);
  }
  assert.ok(Math.abs(calm.cur[0]) < 1e-9, `風がないのに横へ動いた: ${calm.cur}`);
  assert.ok(windy.cur[0] > 0.05, `風の向きへなびいていない: ${windy.cur}`);
  assert.ok(Math.abs(Math.hypot(...windy.cur) - 0.3) < 1e-6);
});
