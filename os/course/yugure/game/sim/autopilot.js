// 自動運転。デモの走行と、決まった運転での性能の測定に使う。
// ハンドル: コースの中心の線の少し先の点を目指して切る（ピュアパシュートという一般的な方法）。
// アクセルとブレーキ: この先のカーブの曲がり具合から「出してよい速さ」を求め、それに合わせる。

import { clamp, degToRad, wrapAngle } from '../core/math.js';
import { GRAVITY, speedKmh } from './car-physics.js';
import { sampleAt } from './course.js';

const LOOK_AHEAD_MIN_M = 7; // ハンドルで目指す点の距離（最小）
const LOOK_AHEAD_PER_SPEED = 0.45; // 速さ 1 m/s あたり、目指す点を何 m 遠くするか
const PLAN_DISTANCE_M = 140; // 速さを決めるために、何 m 先まで見るか
const PLAN_STEP_M = 4;

// caution: 慎重さ（1 でタイヤの限界まで使う。0.8 なら 8 割）
export function autopilotInput(race, { caution = 0.8 } = {}) {
  const { car, course, location } = race;
  const spec = car.spec;
  const speed = Math.max(0, car.forwardSpeed);

  // ハンドル
  const lookAhead = LOOK_AHEAD_MIN_M + speed * LOOK_AHEAD_PER_SPEED;
  const target = sampleAt(course, location.s + lookAhead);
  const dx = target.x - car.x, dz = target.z - car.z;
  const angle = wrapAngle(Math.atan2(dx, dz) - car.heading); // 目指す点が、車の向きから何ラジアン右か
  const curvature = (2 * Math.sin(angle)) / Math.hypot(dx, dz);
  const wheelAngle = Math.atan(curvature * spec.wheelBaseM);
  const maxWheelAngle = degToRad(spec.maxSteerDeg) / (1 + speedKmh(car) / spec.steerHalfSpeedKmh);
  const steer = clamp(wheelAngle / maxWheelAngle, -1, 1);

  // 速さ
  const grip = spec.tireGrip * GRAVITY * caution;
  let allowed = Infinity;
  for (let d = 0; d <= PLAN_DISTANCE_M; d += PLAN_STEP_M) {
    const a = sampleAt(course, location.s + d), b = sampleAt(course, location.s + d + 8);
    const bend = Math.abs(wrapAngle(b.heading - a.heading)) / 8; // 1 m あたりの曲がり（曲率）
    const cornerSpeed = bend > 1e-4 ? Math.sqrt(grip / bend) : Infinity;
    allowed = Math.min(allowed, Math.sqrt(cornerSpeed ** 2 + 2 * grip * 0.8 * d)); // そこまでにブレーキで落とせる速さ
  }
  const throttle = speed < allowed - 1 ? 1 : speed < allowed ? 0.3 : 0;
  const brake = speed > allowed + 2 ? clamp((speed - allowed) / 6, 0.2, 1) : 0;
  return { throttle, brake, steer, handbrake: false };
}
