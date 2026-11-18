// 講座「夕暮れ峠をもう一度」の完成版: 周回の数え方とレースの計算のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCourse } from '../os/course/yugure/game/sim/course.js';
import { createCar, speedKmh, stepCar } from '../os/course/yugure/game/sim/car-physics.js';
import { createLapCounter, startLapCounter, updateLapCounter } from '../os/course/yugure/game/sim/lap.js';
import { createRace, resetCar, startRace, stepRace } from '../os/course/yugure/game/sim/race.js';
import { autopilotInput } from '../os/course/yugure/game/sim/autopilot.js';

const GAME = new URL('../os/course/yugure/game/', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, GAME), 'utf8'));
const carSpec = readJson('data/cars/gen-hatch.json').physics;
const course = buildCourse(readJson('data/courses/yugure-touge.json'));
const DT = 1 / 120;

/* ---------- 周回 ---------- */

// 道のりを少しずつ動かして、周回の数えに渡す
function run(counter, from, to, length, startTime = 0) {
  const results = [];
  const step = Math.sign(to - from) * 2;
  let time = startTime;
  for (let s = from; step > 0 ? s <= to : s >= to; s += step) {
    time += 0.1;
    const r = updateLapCounter(counter, ((s % length) + length) % length, length, time);
    if (r) results.push(r);
  }
  return results;
}

test('半分の地点を通ってからスタートの線を越えると 1 周', () => {
  const counter = createLapCounter();
  startLapCounter(counter, 990, 0);
  const laps = run(counter, 990, 2010, 1000);
  assert.equal(laps.length, 1);
  assert.equal(laps[0].lap, 1);
  assert.ok(laps[0].lapTime > 0);
});

test('スタートの線の近くを行ったり来たりしても周回にならない', () => {
  const counter = createLapCounter();
  startLapCounter(counter, 990, 0);
  assert.equal(run(counter, 990, 1020, 1000).length, 0);
  assert.equal(run(counter, 1020, 980, 1000).length, 0);
  assert.equal(run(counter, 980, 1030, 1000).length, 0);
});

test('半分の地点を過ぎてから逆走して戻っても周回にならない', () => {
  const counter = createLapCounter();
  startLapCounter(counter, 10, 0);
  run(counter, 10, 600, 1000); // 半分（500）を通る
  run(counter, 600, -10, 1000); // 逆走してスタートの線の手前まで戻る
  assert.equal(run(counter, -10, 20, 1000).length, 0);
});

test('2 周目の時間は、1 周目を終えた時刻から数える', () => {
  const counter = createLapCounter();
  startLapCounter(counter, 990, 0);
  const laps = run(counter, 990, 3010, 1000);
  assert.equal(laps.length, 2);
  assert.ok(Math.abs(laps[1].lapTime - 50) < 0.5, `2 周目 ${laps[1].lapTime}`); // 2 m を 0.1 秒、1000 m は 50 秒
  assert.equal(counter.bestLapTime, Math.min(laps[0].lapTime, laps[1].lapTime));
});

/* ---------- 坂 ---------- */

test('10% の上り坂では、重力の分（9.81 × sin θ ≈ 0.98 m/s²）だけ平らな道より速く遅くなる', () => {
  const flat = createCar(carSpec), uphill = createCar(carSpec);
  for (const c of [flat, uphill]) { c.forwardSpeed = 60 / 3.6; c.gear = 3; }
  for (let i = 0; i < 120 * 3; i++) {
    stepCar(flat, { throttle: 0, brake: 0, steer: 0, handbrake: false }, DT, { grip: 1, rollingResistance: 1, grade: 0 });
    stepCar(uphill, { throttle: 0, brake: 0, steer: 0, handbrake: false }, DT, { grip: 1, rollingResistance: 1, grade: 0.1 });
  }
  const expected = 9.81 * (0.1 / Math.sqrt(1.01)) * 3 * 3.6; // 3 秒で約 10.5 km/h
  const difference = speedKmh(flat) - speedKmh(uphill);
  assert.ok(Math.abs(difference - expected) < 1.5, `差 ${difference.toFixed(2)} km/h（見込み ${expected.toFixed(2)}）`);
});

/* ---------- レース ---------- */

test('スタートの合図の前は、アクセルを踏んでも動かない', () => {
  const race = createRace(course, carSpec);
  const x = race.car.x, z = race.car.z;
  for (let i = 0; i < 240; i++) stepRace(race, { throttle: 1, brake: 0, steer: 0, handbrake: false }, DT);
  assert.ok(Math.hypot(race.car.x - x, race.car.z - z) < 0.01);
});

test('自動運転で夕暮れ峠を 1 周でき、草地にもガードレールにも触れない', () => {
  const race = createRace(course, carSpec);
  startRace(race);
  const events = [];
  for (let i = 0; i < 120 * 200 && race.lapCounter.lap < 1; i++) {
    stepRace(race, autopilotInput(race), DT);
    events.push(...race.events);
    race.events.length = 0;
  }
  const lap = events.find((e) => e.type === 'lap');
  assert.ok(lap, '1 周しない');
  assert.ok(lap.lapTime > 50 && lap.lapTime < 120, `1 周 ${lap.lapTime.toFixed(1)} 秒`);
  assert.deepEqual(events.filter((e) => e.type === 'surface'), [], '草地に出た');
  assert.equal(race.barrierHits, 0);
});

test('まっすぐ道から外れて走っても、ガードレールより外へは出ない', () => {
  const race = createRace(course, carSpec);
  startRace(race);
  let maxOut = 0;
  const events = [];
  for (let i = 0; i < 120 * 20; i++) {
    stepRace(race, { throttle: 1, brake: 0, steer: 0.35, handbrake: false }, DT);
    events.push(...race.events);
    race.events.length = 0;
    maxOut = Math.max(maxOut, Math.abs(race.location.lateral) - race.location.width / 2);
  }
  assert.ok(maxOut <= 6.05, `道の端から ${maxOut.toFixed(2)} m`);
  assert.ok(events.some((e) => e.type === 'barrier'), 'ガードレールに当たっていない');
  assert.ok(events.some((e) => e.type === 'surface' && e.surface === 'grass'));
});

test('R で、今いる場所の道の中央へ、止まった状態で戻る', () => {
  const race = createRace(course, carSpec);
  startRace(race);
  for (let i = 0; i < 120 * 6; i++) stepRace(race, { throttle: 1, brake: 0, steer: 0.4, handbrake: false }, DT);
  resetCar(race);
  assert.ok(Math.abs(race.location.lateral) < 0.05);
  assert.equal(race.car.forwardSpeed, 0);
  assert.ok(race.events.some((e) => e.type === 'reset'));
});
