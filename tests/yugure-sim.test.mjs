// 講座「夕暮れ峠をもう一度」の完成版の、ブラウザを使わない部品のテスト（数学・乱数・ループ・コース・車の動き）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../os/course/yugure/game/core/math.js';
import { createRandom } from '../os/course/yugure/game/core/random.js';
import { createStepper } from '../os/course/yugure/game/core/loop.js';
import { buildCourse, catmullRom, distanceAhead, locate, sampleAt } from '../os/course/yugure/game/sim/course.js';
import { createCar, speedKmh, stepCar } from '../os/course/yugure/game/sim/car-physics.js';

const GAME = new URL('../os/course/yugure/game/', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, GAME), 'utf8'));
const near = (actual, expected, tolerance, label = '') => assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} は ${expected} ± ${tolerance} の外`);

/* ---------- 数学 ---------- */

test('rotationY は北（+z）を、正の角度で東（+x）へ回す', () => {
  const p = M.transformPoint(M.rotationY(Math.PI / 2), [0, 0, 1]);
  near(p[0], 1, 1e-6); near(p[2], 0, 1e-6);
});

test('lookAt はカメラの位置を原点へ、見る点を前（+z）へ移す', () => {
  const view = M.lookAt([10, 5, -20], [10, 5, 30]);
  const eye = M.transformPoint(view, [10, 5, -20]);
  const target = M.transformPoint(view, [10, 5, 30]);
  near(M.length(eye), 0, 1e-5);
  near(target[0], 0, 1e-5); near(target[1], 0, 1e-5); near(target[2], 50, 1e-4);
});

test('perspective は手前の面を奥行き 0、奥の面を 1 にする', () => {
  const p = M.perspective(M.degToRad(60), 16 / 9, 0.5, 2000);
  near(M.transformPoint(p, [0, 0, 0.5])[2], 0, 1e-6);
  near(M.transformPoint(p, [0, 0, 2000])[2], 1, 1e-6);
});

test('multiply は「後の行列 × 先の行列」の順に効く', () => {
  const m = M.multiply(M.translation(5, 0, 0), M.rotationY(Math.PI / 2));
  const p = M.transformPoint(m, [0, 0, 1]); // 先に回して (1,0,0)、次に動かして (6,0,0)
  near(p[0], 6, 1e-6); near(p[2], 0, 1e-6);
});

test('wrapAngle と approach', () => {
  near(M.wrapAngle(3 * Math.PI), Math.PI, 1e-9);
  near(M.wrapAngle(-Math.PI / 2 - 2 * Math.PI), -Math.PI / 2, 1e-9);
  assert.equal(M.approach(0, 10, 3), 3);
  assert.equal(M.approach(9, 10, 3), 10);
  assert.equal(M.approach(0, -10, 3), -3);
});

/* ---------- 乱数・ループ ---------- */

test('同じ種の乱数は同じ並びになり、0 以上 1 未満に収まる', () => {
  const a = createRandom(42), b = createRandom(42), c = createRandom(43);
  const listA = Array.from({ length: 1000 }, () => a.next());
  const listB = Array.from({ length: 1000 }, () => b.next());
  assert.deepEqual(listA, listB);
  assert.notDeepEqual(listA.slice(0, 5), Array.from({ length: 5 }, () => c.next()));
  assert.ok(listA.every((v) => v >= 0 && v < 1));
});

test('固定の時間刻み: 経った時間を刻みの回数と余りに分ける', () => {
  const stepper = createStepper(1 / 120);
  let r = stepper.advance(1 / 60);
  assert.equal(r.steps, 2); near(r.alpha, 0, 1e-9);
  r = stepper.advance(0.01);
  assert.equal(r.steps, 1); near(r.alpha, 0.2, 1e-6);
  stepper.reset();
  r = stepper.advance(10); // 長く止まっていても 0.25 秒分までしか進めない
  assert.equal(r.steps, 30);
});

/* ---------- コース ---------- */

// 半径 100 m の円を、北から右回り（北 → 東 → 南 → 西）に回るコース
const circleData = {
  name: '円',
  points: Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    return { x: 100 * Math.sin(angle), z: 100 * Math.cos(angle), height: 0, width: 10 };
  }),
};

test('Catmull-Rom の曲線は、つなぐ点の上を通る', () => {
  const p = [[0, 0, 0, 9], [10, 0, 1, 9], [20, 5, 2, 9], [30, 5, 3, 9]];
  assert.deepEqual(catmullRom(...p, 0).map((v) => +v.toFixed(9)), p[1]);
  assert.deepEqual(catmullRom(...p, 1).map((v) => +v.toFixed(9)), p[2]);
});

test('円のコースの長さは円周とほぼ同じで、1 周すると始めの点に戻る', () => {
  const course = buildCourse(circleData);
  near(course.length, 2 * Math.PI * 100, 2 * Math.PI * 100 * 0.005, '長さ');
  const start = sampleAt(course, 0), end = sampleAt(course, course.length);
  near(start.x, end.x, 1e-6); near(start.z, end.z, 1e-6);
  near(start.dirX, 1, 0.01, '北の点では東を向く');
});

test('locate: 中心の線の上は横のずれ 0、内側（進む向きの右）へ 3 m は +3', () => {
  const course = buildCourse(circleData);
  const onLine = locate(course, 0, 100);
  near(onLine.lateral, 0, 0.05); near(Math.min(onLine.s, course.length - onLine.s), 0, 0.5);
  const inside = locate(course, 0, 97);
  near(inside.lateral, 3, 0.05);
  const east = locate(course, 104, 0); // 東の点の外側 4 m
  near(east.lateral, -4, 0.05); near(east.s, course.length / 4, 1);
});

test('locate: 前回の場所を手がかりに探しても、遠くへ移ったときは全体から探し直す', () => {
  const course = buildCourse(circleData);
  const first = locate(course, 0, 100);
  const far = locate(course, 0, -100, first.index);
  near(far.s, course.length / 2, 1);
});

test('distanceAhead は 1 周の境目をまたいでも前向きの差を返す', () => {
  const course = buildCourse(circleData);
  near(distanceAhead(course, course.length - 5, 3), 8, 1e-9);
  near(distanceAhead(course, 3, course.length - 5), -8, 1e-9);
});

/* ---------- 車の動き ---------- */

const carSpec = readJson('data/cars/gen-hatch.json').physics;
const DT = 1 / 120;
const drive = (car, input, seconds, each = () => {}) => {
  for (let t = 0; t < seconds; t += DT) {
    stepCar(car, typeof input === 'function' ? input(car, t) : input, DT);
    each(car, t);
  }
};
const FULL = { throttle: 1, brake: 0, steer: 0, handbrake: false };
const COAST = { throttle: 0, brake: 0, steer: 0, handbrake: false };

test('全開で 0〜100 km/h は 9〜16 秒', () => {
  const car = createCar(carSpec);
  let time = null;
  drive(car, FULL, 30, (c, t) => { if (time === null && speedKmh(c) >= 100) time = t; });
  assert.ok(time !== null && time > 9 && time < 16, `0〜100 km/h が ${time} 秒`);
});

test('全開を続けると最高速度は 150〜185 km/h で、5 速まで上がり、回転は上限を超えない', () => {
  const car = createCar(carSpec);
  let maxRpm = 0;
  drive(car, FULL, 90, (c) => { maxRpm = Math.max(maxRpm, c.engineRpm); });
  const top = speedKmh(car);
  assert.ok(top > 150 && top < 185, `最高速度 ${top}`);
  assert.equal(car.gear, 5);
  assert.ok(maxRpm <= carSpec.engine.redlineRpm);
});

test('100 km/h から全力のブレーキで、33〜50 m で止まる', () => {
  const car = createCar(carSpec);
  car.forwardSpeed = 100 / 3.6; car.gear = 3;
  const startZ = car.z;
  for (let i = 0; i < 120 * 10 && car.forwardSpeed > 0; i++) stepCar(car, { throttle: 0, brake: 1, steer: 0, handbrake: false }, DT);
  const distance = car.z - startZ;
  assert.ok(distance > 33 && distance < 50, `止まるまで ${distance} m`);
  near(car.x, 0, 0.01, 'まっすぐ止まる');
});

test('右に切ると右へ、左に切ると同じだけ左へ曲がる', () => {
  const right = createCar(carSpec), left = createCar(carSpec);
  for (const c of [right, left]) { c.forwardSpeed = 50 / 3.6; c.gear = 2; }
  const hold = (steer) => (c) => ({ throttle: speedKmh(c) < 50 ? 0.4 : 0, brake: 0, steer, handbrake: false });
  drive(right, hold(0.4), 3);
  drive(left, hold(-0.4), 3);
  assert.ok(right.heading > 0.5, `右の向き ${right.heading}`);
  near(left.heading, -right.heading, 1e-6, '左右対称');
  assert.ok(right.x > 0 && left.x < 0);
});

test('全開でハンドルをいっぱいに切っても、横の加速度はタイヤの限界（約 1 G）を大きく超えない', () => {
  const car = createCar(carSpec);
  car.forwardSpeed = 80 / 3.6; car.gear = 3;
  let maxSide = 0;
  drive(car, { throttle: 0.5, brake: 0, steer: 1, handbrake: false }, 4, (c) => { maxSide = Math.max(maxSide, Math.abs(c.sideAcceleration)); });
  assert.ok(maxSide < carSpec.tireGrip * 9.81 * 1.2, `横の加速度 ${maxSide}`);
  assert.ok(maxSide > 5, `ちゃんと曲がる ${maxSide}`);
});

test('止まった状態で S を押し続けると後退し、後退の速さは 25 km/h ほどで頭打ちになる', () => {
  const car = createCar(carSpec);
  drive(car, { throttle: 0, brake: 1, steer: 0, handbrake: false }, 8);
  assert.equal(car.gear, -1);
  assert.ok(speedKmh(car) < -10 && speedKmh(car) > -27, `後退の速さ ${speedKmh(car)}`);
  drive(car, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 4); // W でブレーキをかけ、止まったら前進へ
  assert.ok(car.gear >= 1, `ギア ${car.gear}`);
  assert.ok(speedKmh(car) > 0);
});

test('サイドブレーキを引いて曲がると、引かないときより向きが大きく変わる（後ろが滑る）', () => {
  const turn = (handbrake) => {
    const car = createCar(carSpec);
    car.forwardSpeed = 60 / 3.6; car.gear = 2;
    drive(car, { throttle: 0, brake: 0, steer: 0.5, handbrake }, 1.2);
    return { heading: car.heading, rearSlip: car.rearSlip };
  };
  const normal = turn(false), sliding = turn(true);
  assert.ok(sliding.heading > normal.heading * 1.2, `引く ${sliding.heading} / 引かない ${normal.heading}`);
});

test('でたらめな操作を 2 分続けても、値が壊れず、速さもあり得る範囲に収まる', () => {
  const random = createRandom(7);
  const car = createCar(carSpec);
  let input = COAST;
  drive(car, (c, t) => {
    if (Math.floor(t * 4) !== Math.floor((t - DT) * 4)) input = { throttle: random.next() < 0.6 ? 1 : 0, brake: random.next() < 0.2 ? 1 : 0, steer: random.range(-1, 1), handbrake: random.next() < 0.1 };
    return input;
  }, 120, (c) => {
    for (const key of ['x', 'z', 'heading', 'forwardSpeed', 'sideSpeed', 'yawRate', 'engineRpm']) assert.ok(Number.isFinite(c[key]), key);
    assert.ok(Math.hypot(c.forwardSpeed, c.sideSpeed) < 60);
  });
});
