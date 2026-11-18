// レースの計算をまとめて 1 刻み進める係。2D の画面でも 3D の画面でも、この同じ計算を使う。
// 車の動き（car-physics.js）・コースの上の場所（course.js）・周回（lap.js）をつなぎ、
// 路面（道か草地か）と、ガードレールに当たったときの動きを受け持つ。

import { createCar, stepCar, speedKmh } from './car-physics.js';
import { locate, sampleAt } from './course.js';
import { createLapCounter, startLapCounter, updateLapCounter } from './lap.js';

const CURB_WIDTH_M = 1.2; // 道の端の縁石の幅。ここまでは道と同じ
const BARRIER_GAP_M = 6; // 道の端からガードレールまでの距離
const BARRIER_BOUNCE = 0.25; // ガードレールに当たったとき、はね返る強さ（0〜1）
const BARRIER_SCRUB = 0.9; // ガードレールにこすったとき、残る速さの割合
const START_BEHIND_LINE_M = 12; // スタートの線の何 m 手前に車を置くか
const ROAD = { grip: 1, rollingResistance: 1 };
const GRASS = { grip: 0.65, rollingResistance: 6 };

export function createRace(course, carSpec) {
  const race = {
    course,
    car: null,
    location: null, // 車がコースのどこにいるか（locate の結果）
    surface: 'road', // 'road' か 'grass'
    lapCounter: createLapCounter(),
    time: 0, // スタートからの秒数
    started: false,
    barrierHits: 0,
    events: [], // この刻みで起きた出来事
  };
  race.car = createCar(carSpec);
  placeCarOnTrack(race, course.length - START_BEHIND_LINE_M);
  return race;
}

// 車を、道のり s の道の中央に、進む向きで止めて置く
export function placeCarOnTrack(race, s) {
  const here = sampleAt(race.course, s);
  const car = race.car;
  Object.assign(car, { x: here.x, z: here.z, heading: here.heading, forwardSpeed: 0, sideSpeed: 0, yawRate: 0, steerAngle: 0, gear: 1, shiftTimer: 0 });
  race.location = locate(race.course, car.x, car.z);
}

// スタートの合図
export function startRace(race) {
  race.started = true;
  race.time = 0;
  startLapCounter(race.lapCounter, race.location.s, 0);
  race.events.push({ type: 'start' });
}

// R キー: いま走っている場所の道の中央へ戻す
export function resetCar(race) {
  placeCarOnTrack(race, race.location.s);
  race.events.push({ type: 'reset', s: race.location.s });
}

// 1 刻み進める。input は stepCar と同じ形。起きた出来事は race.events に入る（呼ぶ側が読んで空にする）
export function stepRace(race, input, dt) {
  const { car, course } = race;
  // スタート前はペダルを効かせない（ブレーキを押し続けると後退に入るので、ペダルは離した扱いにする）
  const controls = race.started ? input : { throttle: 0, brake: 0, steer: input.steer, handbrake: false };

  const edge = race.location.width / 2 + CURB_WIDTH_M;
  const onGrass = Math.abs(race.location.lateral) > edge;
  stepCar(car, controls, dt, { ...(onGrass ? GRASS : ROAD), grade: gradeAlongCar(race) });

  race.location = locate(course, car.x, car.z, race.location.index);
  keepInsideBarrier(race);
  updateSurface(race);

  if (race.started) {
    race.time += dt;
    const lap = updateLapCounter(race.lapCounter, race.location.s, course.length, race.time);
    if (lap) race.events.push({ type: 'lap', ...lap });
  }
}

// 車の向きに沿った道の勾配（上りが正）。道の向きと車の向きが違えば、そのぶん小さくなる
function gradeAlongCar(race) {
  const { course, location, car } = race;
  const ahead = sampleAt(course, location.s + 2), behind = sampleAt(course, location.s - 2);
  const roadGrade = (ahead.height - behind.height) / 4;
  return roadGrade * Math.cos(car.heading - location.heading);
}

function updateSurface(race) {
  const surface = Math.abs(race.location.lateral) > race.location.width / 2 + CURB_WIDTH_M ? 'grass' : 'road';
  if (surface !== race.surface) race.events.push({ type: 'surface', surface, speedKmh: Math.round(speedKmh(race.car)) });
  race.surface = surface;
}

// ガードレールより外へ出たら、線の上へ押し戻し、外向きの速さを打ち消す
function keepInsideBarrier(race) {
  const { car, location } = race;
  const limit = location.width / 2 + BARRIER_GAP_M;
  const over = Math.abs(location.lateral) - limit;
  if (over <= 0) return;

  const here = sampleAt(race.course, location.s);
  const side = Math.sign(location.lateral); // +1 は右のガードレール、-1 は左
  const outX = here.rightX * side, outZ = here.rightZ * side; // 外へ向かう向き
  car.x -= outX * over;
  car.z -= outZ * over;

  // 速さを地面の向き（東西・南北）に直して、外向きの分を打ち消す
  const sinH = Math.sin(car.heading), cosH = Math.cos(car.heading);
  let vx = car.forwardSpeed * sinH + car.sideSpeed * cosH;
  let vz = car.forwardSpeed * cosH - car.sideSpeed * sinH;
  const outward = vx * outX + vz * outZ;
  if (outward > 0) {
    vx -= outX * outward * (1 + BARRIER_BOUNCE);
    vz -= outZ * outward * (1 + BARRIER_BOUNCE);
    vx *= BARRIER_SCRUB;
    vz *= BARRIER_SCRUB;
    car.yawRate *= 0.5;
    if (outward > 1) {
      race.barrierHits++;
      race.events.push({ type: 'barrier', impactKmh: Math.round(outward * 3.6) });
    }
  }
  car.forwardSpeed = vx * sinH + vz * cosH;
  car.sideSpeed = vx * cosH - vz * sinH;
  race.location = locate(race.course, car.x, car.z, location.index);
}
