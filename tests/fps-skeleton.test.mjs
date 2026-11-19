// 図鑑の項目「箱だけで作る FPS の骨組み」（entries/game.js の game-fps-skeleton）の core（動きと当たりの計算）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sb);
vm.runInContext(readFileSync(join(ROOT, 'entries/game.js'), 'utf8'), sb, { filename: 'entries/game.js' });
const e = sb.dekiru.entries.find((x) => x.id === 'game-fps-skeleton');
const ctx = vm.createContext({ Math, Float32Array, Array, Object, Number, JSON });
vm.runInContext(sb.dekiru.src(e.core) + '\n;globalThis.__x = FP;', ctx);
const FP = ctx.__x, P = FP.P;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} と ${b} の差が ${tol} を超える`);
const floor = { min: [-50, -1, -50], max: [50, 0, 50] };
const run = (boxes, st, input, n) => { for (let i = 0; i < n; i++) FP.tick(st, input, boxes); return st; };

test('当たり（掃引）: 体の大きさだけ箱を太らせ、足もとの点の移動として最初に当たる割合と面の向きを返す', () => {
  const wall = { min: [2, 0, -5], max: [3, 3, 5] };
  // 足もと x=0 から x=4 へ。体の半分の幅 0.4 だけ手前の x=1.6 で当たる → 割合 0.4
  const h = FP.trace([floor, wall], [0, 0.01, 0], [4, 0.01, 0], false);
  near(h.t, 1.6 / 4, 1e-6, '割合');
  assert.deepEqual([...h.n], [-1, 0, 0]);
  // 当たらない移動は 1
  assert.equal(FP.trace([wall], [0, 0.5, 0], [0, 0.5, 3], false).t, 1);
});

test('摩擦: 速さから「速さと止まる目安の大きい方 × 摩擦 × 時間」を引く。止まる目安より遅いときは一定の量で止まる', () => {
  const v = [5, 0, 0]; FP.friction(v, 0.1);
  near(v[0], 5 - 5 * P.FRICTION * 0.1, 1e-9, '速いとき');
  const w = [0.5, 0, 0]; FP.friction(w, 0.1);
  near(w[0], Math.max(0, 0.5 - P.STOP * P.FRICTION * 0.1), 1e-9, '遅いとき（0 で止まる）');
});

test('加速: 向きの速さが目標に届くまで足す。空中では目標を小さな上限で抑えるが、加速の量は地上と同じ（横へ曲がりながら速くなれる）', () => {
  const v = [0, 0, 0]; FP.accelerate(v, [0, 0, 1], P.SPEED, P.ACCEL, 1);
  near(v[2], P.SPEED, 1e-9, '1 秒で目標の速さで止まる');
  // 空中: 進む向きと直角に入力すると、上限 AIR_CAP までは足せる
  const a = [P.SPEED, 0, 0]; FP.accelerate(a, [0, 0, 1], P.SPEED, P.ACCEL, P.TICK, P.AIR_CAP);
  near(a[2], Math.min(P.AIR_CAP, P.ACCEL * P.SPEED * P.TICK), 1e-9, '空中の 1 コマ');
  assert.ok(Math.hypot(a[0], a[2]) > P.SPEED, '合わせた速さは地上の上限を超える');
});

test('跳ぶ: 決めた高さまで上がって戻る（重力を半分ずつ前後に当てるので、高さがコマの刻みでずれない）', () => {
  const st = FP.spawn([0, 0, 0]);
  run([floor], st, {}, 5);
  let top = 0;
  FP.tick(st, { jump: true }, [floor]);
  for (let i = 0; i < 240; i++) { FP.tick(st, {}, [floor]); top = Math.max(top, st.p[1]); }
  near(top, P.JUMP_H, 0.02, '最も高い所');
  near(st.p[1], 0, 1e-6, '床に戻る'); assert.ok(st.ground);
});

test('段差: 段差の上限より低い段は歩いて上がり、高い段は上がれない', () => {
  const low = { min: [1, 0, -5], max: [6, P.STEP * 0.8, 5] }, high = { min: [1, 0, -5], max: [6, P.STEP * 1.5, 5] };
  const a = run([floor, low], FP.spawn([0, 0, 0]), { fwd: 1, yaw: Math.PI / 2 }, 120);
  assert.ok(a.p[0] > 2 && Math.abs(a.p[1] - P.STEP * 0.8) < 1e-3, `低い段に上がる ${a.p}`);
  const b = run([floor, high], FP.spawn([0, 0, 0]), { fwd: 1, yaw: Math.PI / 2 }, 120);
  assert.ok(b.p[0] < 0.61 && b.p[1] < 1e-3, `高い段で止まる ${b.p}`);
});

test('壁に斜めに当たると、壁に沿う向きの速さが残る（滑る）', () => {
  const wall = { min: [1, 0, -50], max: [2, 3, 50] };
  const st = run([floor, wall], FP.spawn([0, 0, 0]), { fwd: 1, yaw: Math.PI / 4 }, 120);   // 右前（+x と +z の間）へ
  assert.ok(st.p[0] <= 1 - P.HALF + 1e-3, '壁を抜けない');
  assert.ok(st.p[2] > 2, `壁に沿って進む ${st.p}`);
});

test('しゃがむ: 背が低くなり、低い天井の下では立てない。上が空けば立つ', () => {
  const ceil = { min: [-2, 1.3, -2], max: [2, 2, 2] };
  const st = run([floor, ceil], FP.spawn([0, 0, 0]), { crouch: true }, 10);
  assert.ok(st.crouch); near(FP.height(st), P.CROUCH_H, 1e-9);
  run([floor, ceil], st, {}, 10);
  assert.ok(st.crouch, '天井の下では立てない');
  run([floor], st, {}, 10);
  assert.ok(!st.crouch, '天井がなければ立つ');
});

test('同じ入力なら同じ結果（固定の刻みで計算するので、描くコマの速さに左右されない）', () => {
  const wall = { min: [3, 0, -1], max: [4, 2, 1] }, input = { fwd: 1, side: 0.5, yaw: 1.1, jump: true };
  const a = run([floor, wall], FP.spawn([0, 0, 0]), input, 300), b = run([floor, wall], FP.spawn([0, 0, 0]), input, 300);
  assert.deepEqual([...a.p], [...b.p]);
});

test('撃つ（光線）: いちばん近い箱の番号と距離を返す', () => {
  const boxes = [floor, { min: [-1, 0, 5], max: [1, 2, 6] }, { min: [-1, 0, 9], max: [1, 2, 10] }];
  const r = FP.rayBoxes(boxes, [0, 1, 0], [0, 0, 1], 100);
  assert.equal(r.i, 1); near(r.t, 5, 1e-9);
  assert.equal(FP.rayBoxes(boxes, [0, 1, 0], [0, 1, 0], 100).i, -1, '上へは当たらない');
});
