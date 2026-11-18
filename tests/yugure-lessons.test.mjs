// 講座の第 4 部の完成形（lessons/final/game）の、画面に関係しない計算
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, createCar, updateCar } from '../os/course/yugure/lessons/final/game/car.js';
import { COURSE, ROAD_WIDTH, courseLength, distanceToSegment, isOnRoad, nearestOnCourse, progressOf } from '../os/course/yugure/lessons/final/game/course.js';

const STEP = 1 / 60;

test('アクセルだけで 0〜100 km/h は約 10.4 秒（ゲンさんのハッチバックと同じ）', () => {
  const car = createCar(0, 0, 0);
  let t = 0;
  while (car.speed * 3.6 < 100) { updateCar(car, { up: true }, STEP, true); t += STEP; }
  assert.ok(Math.abs(t - 10.4) < 0.3, `${t.toFixed(2)} 秒`);
});

test('線分までの距離: 真ん中の横は垂直の距離、端より外は端までの距離', () => {
  assert.equal(distanceToSegment(5, 3, 0, 0, 10, 0).distance, 3);
  assert.equal(distanceToSegment(-4, 3, 0, 0, 10, 0).distance, 5);
});

test('コース: 1 周は 900〜1300 m。スタートの点は道の上、道の幅の外は道の外', () => {
  const length = courseLength(COURSE);
  assert.ok(length > 900 && length < 1300, `${length}`);
  assert.equal(isOnRoad(COURSE, 0, 0), true);
  assert.equal(isOnRoad(COURSE, ROAD_WIDTH, -40), false);
  assert.equal(nearestOnCourse(COURSE, 0, -45).index, 0);
});

// 道に沿って、いちばん近い所から distance m 先の点
function pointAhead(x, y, distance) {
  const hit = nearestOnCourse(COURSE, x, y);
  let i = hit.index, [ax, ay] = COURSE[i], [bx, by] = COURSE[(i + 1) % COURSE.length];
  let px = ax + (bx - ax) * hit.t, py = ay + (by - ay) * hit.t, left = distance;
  for (;;) {
    const rest = Math.hypot(bx - px, by - py);
    if (rest >= left) return [px + ((bx - px) / rest) * left, py + ((by - py) / rest) * left];
    left -= rest; i = (i + 1) % COURSE.length; [px, py] = [bx, by]; [bx, by] = COURSE[(i + 1) % COURSE.length];
  }
}

test('簡単な自動運転（道に沿って 12 m 先を目指し、曲がり角の手前で減速）で、道から外れずに 1 周できる', () => {
  const car = createCar(COURSE[0][0], COURSE[0][1] - 3, 0);
  let laps = 0, before = 0, half = false, offRoad = 0, t = 0;
  while (laps < 1 && t < 300) {
    const target = pointAhead(car.x, car.y, 12);
    const want = Math.atan2(target[0] - car.x, -(target[1] - car.y));
    let diff = want - car.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const onRoad = isOnRoad(COURSE, car.x, car.y);
    if (!onRoad) offRoad++;
    // 40 m 先の向きの差が大きければ、手前から遅くする
    const far = pointAhead(car.x, car.y, 40);
    const farDiff = Math.abs(Math.atan2(Math.sin(Math.atan2(far[0] - car.x, -(far[1] - car.y)) - car.heading), Math.cos(Math.atan2(far[0] - car.x, -(far[1] - car.y)) - car.heading)));
    const slow = Math.abs(diff) > 0.35 || farDiff > 0.5 ? 11 : farDiff > 0.25 ? 17 : 28;
    updateCar(car, { up: car.speed < slow, down: car.speed > slow + 3, left: diff < -0.03, right: diff > 0.03 }, STEP, onRoad);
    const p = progressOf(COURSE, car.x, car.y);
    if (p > COURSE.length * 0.4 && p < COURSE.length * 0.6) half = true;
    if (half && before > COURSE.length - 2 && p < 2) laps++;
    before = p;
    t += STEP;
  }
  assert.equal(laps, 1, `1 周できなかった（${t.toFixed(1)} 秒）`);
  assert.ok(offRoad / (t / STEP) < 0.05, `道の外にいた割合 ${(offRoad / (t / STEP)).toFixed(3)}`);
});
