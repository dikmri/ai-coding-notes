// 車の動き（物理）。上から見た平面で、前輪 2 本と後輪 2 本をそれぞれ 1 本にまとめた「自転車モデル」で計算する。
// 単位は m・kg・秒・ラジアン。向きの決まりは core/math.js と同じ（北が 0、右に曲がると増える）。
//
// 車の速さは、車から見た「前向きの速さ」と「右向きの速さ」に分けて持つ。
// 曲がるときに車が少し横に滑る様子（ドリフトやスピン）は、この右向きの速さで表れる。

import { approach, clamp, degToRad, lerp } from '../core/math.js';

export const GRAVITY = 9.81; // m/s²
const AIR_DENSITY = 1.2; // kg/m³
const MIN_SLIP_SPEED = 2; // 横すべりの角度を計算するときの、前向きの速さの下限 m/s（止まりかけで角度が暴れないように）
const STEER_RETURN_SPEED = 1.5; // ハンドルを離したとき、まっすぐに戻る速さは切る速さの何倍か
const REVERSE_MAX_SPEED = 25 / 3.6; // 後退の最高速度 m/s
const STOP_SPEED = 0.5; // これより遅ければ「止まっている」とみなす m/s
const ROAD = { grip: 1, rollingResistance: 1 };

// 車を作る。spec は車のデータ（car.json の physics）。x・z・heading は置く場所と向き
export function createCar(spec, { x = 0, z = 0, heading = 0 } = {}) {
  return {
    spec,
    x, z, heading,
    forwardSpeed: 0, // 車から見た前向きの速さ m/s
    sideSpeed: 0, // 車から見た右向きの速さ m/s
    yawRate: 0, // 向きが変わる速さ rad/s（右回りが正）
    steerAngle: 0, // 前輪の切れ角 rad（右が正）
    gear: 1, // 1 からが前進、-1 が後退
    engineRpm: spec.engine.idleRpm,
    shiftTimer: 0, // 変速中の残り時間（秒）。この間はエンジンの力が車輪に伝わらない
    throttle: 0, brake: 0, // 実際に効いているアクセルとブレーキ（0〜1）
    forwardAcceleration: 0, sideAcceleration: 0, // 加速度 m/s²（車体の傾きと、荷重の移動に使う）
    frontSlip: 0, rearSlip: 0, // タイヤがどれだけ滑っているか（0〜1）。煙と音に使う
    frontLoad: 0, rearLoad: 0, // 前輪と後輪にかかる重さ N
  };
}

// 時速（km/h）。後退は負
export const speedKmh = (car) => car.forwardSpeed * 3.6;

// 車を dt 秒進める。
// input: { throttle: 0〜1, brake: 0〜1, steer: -1（左）〜1（右）, handbrake: true/false }
// surface: 路面。{ grip: 滑りにくさの倍率, rollingResistance: 転がりにくさの倍率, grade: 車の前向きの勾配（上りが正。0.1 は 10%） }
export function stepCar(car, input, dt, surface = ROAD) {
  const spec = car.spec;
  const mass = spec.massKg;
  const wheelBase = spec.wheelBaseM;
  const a = spec.cgToFrontAxleM; // 重心から前輪まで
  const b = wheelBase - a; // 重心から後輪まで

  /* 1. 前進と後退、アクセルとブレーキの向きを決める */
  const pedals = choosePedals(car, input);
  car.throttle = pedals.throttle;
  car.brake = pedals.brake;

  /* 2. ハンドル。速いほど切れる角度を小さくし（steerHalfSpeedKmh の速さで半分）、決まった速さで少しずつ切る。
        キーボードは「押すといっぱいに切る」なので、速いときに切りすぎてスピンしないようにするため */
  const speedFactor = 1 / (1 + Math.abs(speedKmh(car)) / spec.steerHalfSpeedKmh);
  const targetSteer = clamp(input.steer, -1, 1) * degToRad(spec.maxSteerDeg) * speedFactor;
  const steerSpeed = degToRad(spec.steerSpeedDegPerSec) * (Math.abs(targetSteer) < Math.abs(car.steerAngle) ? STEER_RETURN_SPEED : 1);
  car.steerAngle = approach(car.steerAngle, targetSteer, steerSpeed * dt);

  /* 3. 前輪と後輪にかかる重さ。加速すると後ろへ、ブレーキで前へ移る */
  const weight = mass * GRAVITY;
  const loadShift = (mass * car.forwardAcceleration * spec.cgHeightM) / wheelBase;
  const frontLoad = Math.max(0, (weight * b) / wheelBase - loadShift);
  const rearLoad = Math.max(0, (weight * a) / wheelBase + loadShift);
  car.frontLoad = frontLoad;
  car.rearLoad = rearLoad;
  const grip = spec.tireGrip * surface.grip;
  const frontGripForce = grip * frontLoad;
  const rearGripForce = grip * rearLoad * spec.rearGripBias; // 後輪を少し強くして、まっすぐ安定する車にする

  /* 4. エンジンと変速 */
  updateGearbox(car, dt);
  const driveForce = engineDriveForce(car);

  /* 5. 前後の力（駆動とブレーキ）。ABS のように、タイヤが止まりきらない範囲に抑える */
  const direction = Math.sign(car.forwardSpeed);
  const brakeForce = car.brake * spec.brakeForceN;
  let frontLongitudinal = spec.drive === 'rear' ? 0 : driveForce;
  let rearLongitudinal = spec.drive === 'rear' ? driveForce : 0;
  const frontBrake = Math.min(brakeForce * spec.brakeFrontShare, frontGripForce * 0.95);
  let rearBrake = Math.min(brakeForce * (1 - spec.brakeFrontShare), rearGripForce * 0.95);
  // サイドブレーキは後輪を強く止める。横に使える力が減るので、後ろが外へ滑り出す
  if (input.handbrake && Math.abs(car.forwardSpeed) > STOP_SPEED) rearBrake = rearGripForce * spec.handbrakeLock;
  frontLongitudinal = clamp(frontLongitudinal, -frontGripForce, frontGripForce);
  rearLongitudinal = clamp(rearLongitudinal, -rearGripForce, rearGripForce);

  /* 6. 横の力。タイヤの向きと、タイヤが実際に進む向きの差（横すべりの角度）から決まる */
  const slipSpeed = Math.max(Math.abs(car.forwardSpeed), MIN_SLIP_SPEED);
  const frontSideVelocity = car.sideSpeed + car.yawRate * a;
  const rearSideVelocity = car.sideSpeed - car.yawRate * b;
  const frontSlipAngle = Math.atan2(frontSideVelocity, slipSpeed) - car.steerAngle * (direction || 1);
  const rearSlipAngle = Math.atan2(rearSideVelocity, slipSpeed);
  // ブレーキと駆動で使った分だけ、横に使える力が減る（摩擦円）
  const frontSideLimit = Math.sqrt(Math.max(0, frontGripForce ** 2 - (frontLongitudinal + frontBrake) ** 2));
  const rearSideLimit = Math.sqrt(Math.max(0, rearGripForce ** 2 - (rearLongitudinal + rearBrake) ** 2));
  let frontSide = -tireSideForce(frontSlipAngle, frontSideLimit, spec);
  let rearSide = -tireSideForce(rearSlipAngle, rearSideLimit, spec);
  // 1 回の計算で、タイヤの横の滑りを打ち消しすぎないようにする（刻みが粗くても揺れないように）。
  // 前輪は切れているので、タイヤの向きに直角な速さで考える
  const frontSlideSpeed = Math.abs(frontSideVelocity * Math.cos(car.steerAngle) - car.forwardSpeed * Math.sin(car.steerAngle));
  const frontLimit = ((mass * b) / wheelBase) * frontSlideSpeed / dt;
  const rearLimit = ((mass * a) / wheelBase) * Math.abs(rearSideVelocity) / dt;
  frontSide = clamp(frontSide, -frontLimit, frontLimit);
  rearSide = clamp(rearSide, -rearLimit, rearLimit);
  car.frontSlip = slipAmount(frontSlipAngle, spec) || (driveForce > frontGripForce ? 1 : 0);
  car.rearSlip = input.handbrake && Math.abs(car.forwardSpeed) > 3 ? 1 : slipAmount(rearSlipAngle, spec);

  /* 7. 力を合わせる（車から見た前向きと右向き）。前輪の力は、切れ角の分だけ向きが変わる */
  const cos = Math.cos(car.steerAngle), sin = Math.sin(car.steerAngle);
  const grade = surface.grade ?? 0;
  const slopeForce = -weight * (grade / Math.sqrt(1 + grade * grade)); // 坂で重力が後ろへ引く力（下りでは前へ押す）
  const forwardForce = frontLongitudinal * cos - frontSide * sin + rearLongitudinal + slopeForce;
  const sideForce = frontLongitudinal * sin + frontSide * cos + rearSide;
  const yawTorque = a * (frontSide * cos + frontLongitudinal * sin) - b * rearSide;

  /* 8. 速さを進める。空気と転がりとブレーキの抵抗は、速さの向きを逆にしない範囲で効かせる */
  const forwardAcceleration = forwardForce / mass + car.yawRate * car.sideSpeed;
  const sideAcceleration = sideForce / mass - car.yawRate * car.forwardSpeed;
  const drag = 0.5 * AIR_DENSITY * spec.dragAreaM2 * car.forwardSpeed ** 2;
  const rolling = spec.rollingResistance * surface.rollingResistance * weight;
  const resist = (drag + rolling + frontBrake + rearBrake) / mass;
  let forwardSpeed = car.forwardSpeed + forwardAcceleration * dt;
  forwardSpeed = applyResistance(forwardSpeed, resist * dt);
  // 乗っている人が感じる加速度（回る車の上で見た速さの変化ではなく、力 ÷ 重さ）
  const feltForward = (forwardSpeed - car.forwardSpeed) / dt - car.yawRate * car.sideSpeed;
  car.forwardAcceleration = lerp(car.forwardAcceleration, feltForward, 0.1);
  car.sideAcceleration = lerp(car.sideAcceleration, sideForce / mass, 0.1);
  car.forwardSpeed = forwardSpeed;
  car.sideSpeed += sideAcceleration * dt;
  car.yawRate += (yawTorque / spec.yawInertiaKgM2) * dt;

  /* 9. とても遅いときは、タイヤが向いた方へ素直に進む動き（滑らない動き）に寄せる */
  const lowSpeed = clamp(1 - Math.abs(car.forwardSpeed) / 1.5, 0, 1);
  if (lowSpeed > 0) {
    const rollingYawRate = (car.forwardSpeed * Math.tan(car.steerAngle)) / wheelBase;
    car.yawRate = lerp(car.yawRate, rollingYawRate, lowSpeed);
    car.sideSpeed *= 1 - lowSpeed * 0.5;
  }

  /* 10. 位置と向きを進める */
  const sinH = Math.sin(car.heading), cosH = Math.cos(car.heading);
  car.x += (car.forwardSpeed * sinH + car.sideSpeed * cosH) * dt;
  car.z += (car.forwardSpeed * cosH - car.sideSpeed * sinH) * dt;
  car.heading += car.yawRate * dt;

  /* 11. エンジンの回転数 */
  car.engineRpm = engineRpmFor(car);
}

// ペダルの意味を決める。止まっているときに S を押し続けると後退に入り、後退中は S がアクセル、W がブレーキになる
function choosePedals(car, input) {
  const forwardPedal = clamp(input.throttle, 0, 1);
  const backPedal = clamp(input.brake, 0, 1);
  const stopped = Math.abs(car.forwardSpeed) < STOP_SPEED;
  if (stopped && backPedal > 0 && forwardPedal === 0) car.gear = -1;
  if (stopped && forwardPedal > 0 && car.gear < 0) car.gear = 1;
  if (car.gear < 0) return { throttle: backPedal, brake: forwardPedal };
  return { throttle: forwardPedal, brake: backPedal };
}

// 自動の変速。回転数が上がりすぎたら上のギアへ、下がりすぎたら下のギアへ
function updateGearbox(car, dt) {
  const { gearbox } = car.spec;
  if (car.shiftTimer > 0) {
    car.shiftTimer = Math.max(0, car.shiftTimer - dt);
    return;
  }
  if (car.gear < 1) return;
  const rpm = wheelRpm(car) * gearbox.ratios[car.gear - 1] * gearbox.finalDrive;
  if (rpm > gearbox.upshiftRpm && car.gear < gearbox.ratios.length) {
    car.gear++;
    car.shiftTimer = gearbox.shiftTimeS;
  } else if (rpm < gearbox.downshiftRpm && car.gear > 1) {
    car.gear--;
    car.shiftTimer = gearbox.shiftTimeS * 0.6;
  }
}

// 車輪の回転数（1 分あたり）
const wheelRpm = (car) => (Math.abs(car.forwardSpeed) / (2 * Math.PI * car.spec.wheelRadiusM)) * 60;

const gearRatio = (car) => {
  const { gearbox } = car.spec;
  return (car.gear < 0 ? gearbox.reverseRatio : gearbox.ratios[car.gear - 1]) * gearbox.finalDrive;
};

// エンジンの回転数。発進のときはクラッチを滑らせて、アクセルに合わせて回転を上げる
function engineRpmFor(car) {
  const { engine } = car.spec;
  const fromWheels = wheelRpm(car) * gearRatio(car);
  const launch = engine.idleRpm + car.throttle * engine.launchRpmRise;
  return clamp(Math.max(fromWheels, car.shiftTimer > 0 ? 0 : launch), engine.idleRpm, engine.redlineRpm);
}

// 回転数のときのエンジンの力（トルク N·m）。torqueCurve の点の間を直線でつなぐ
export function engineTorque(engine, rpm) {
  const curve = engine.torqueCurve;
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i][0]) {
      const [r0, t0] = curve[i - 1], [r1, t1] = curve[i];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return curve[curve.length - 1][1];
}

// 駆動輪を押す力 N（後退のときは負）。アクセルを離すとエンジンブレーキで負になる
function engineDriveForce(car) {
  const { engine, gearbox, wheelRadiusM } = car.spec;
  if (car.shiftTimer > 0) return 0;
  const rpm = engineRpmFor(car);
  const sign = car.gear < 0 ? -1 : 1;
  const toWheel = (gearRatio(car) * gearbox.efficiency) / wheelRadiusM;
  if (car.throttle > 0) {
    if (rpm >= engine.redlineRpm) return 0; // 回転の上限で力を切る
    if (car.gear < 0 && -car.forwardSpeed > REVERSE_MAX_SPEED) return 0;
    return sign * car.throttle * engineTorque(engine, rpm) * toWheel;
  }
  if (Math.abs(car.forwardSpeed) < STOP_SPEED) return 0;
  return -Math.sign(car.forwardSpeed) * engine.brakingTorqueNm * (rpm / engine.redlineRpm) * toWheel;
}

// タイヤの横の力 N。マジックフォーミュラ（Pacejka の式）を簡単にした形:
//   力 = 上限 × sin(C × atan(B × 横すべりの角度))
// 角度が小さいうちは角度に比例して増え、ある角度で最大になり、それより滑ると少し減る
export function tireSideForce(slipAngle, limit, spec) {
  return limit * Math.sin(spec.tireShape * Math.atan(spec.tireStiffness * slipAngle));
}

// 横の力が最大になる角度。これを超えて滑っているほど 1 に近づく
function slipAmount(slipAngle, spec) {
  const peak = Math.tan(Math.PI / (2 * spec.tireShape)) / spec.tireStiffness;
  return clamp((Math.abs(slipAngle) / peak - 0.8) * 2, 0, 1);
}

// 抵抗で速さを減らす。減らしすぎて向きが逆になるときは 0 で止める
function applyResistance(speed, amount) {
  if (Math.abs(speed) <= amount) return 0;
  return speed - Math.sign(speed) * amount;
}
