// 車の動き（画面に関係しない、ただの計算）。
// 位置は メートル、向き（heading）は北が 0 で右回りが正の角度（ラジアン）。画面の上が北。
// 前へ進む向きは (sin(向き), -cos(向き))。画面の y は下が正なので、北へ進むと y が減る。

export const CAR = {
  ACCELERATION: 4, // アクセルを踏んだときに増える速さ（メートル毎秒毎秒）。速くなるほど減る
  MAX_SPEED: 47.5, // いちばん速い速さ（メートル毎秒。時速 171 km）
  TURN_RATE: 1.5, // ハンドルをいっぱいに切ったときに、1 秒で回る角度（ラジアン）
  LENGTH: 4.1, // 車の長さ（メートル）
  WIDTH: 1.7,
};

export function createCar(x, y, heading) {
  return { x, y, heading, speed: 0 };
}

// 時間 seconds だけ車を進める。input は { up, left, right }
export function updateCar(car, input, seconds) {
  // 速さ: アクセルは速くなるほど効きにくい（いちばん速い速さに近づくと 0 になる）
  if (input.up) car.speed += CAR.ACCELERATION * (1 - car.speed / CAR.MAX_SPEED) * seconds;

  // 向き: 右へ切ると角度が増え、左へ切ると減る
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  car.heading += steer * CAR.TURN_RATE * seconds;

  // 位置: 向いている方へ、速さ × 時間だけ進む
  car.x += Math.sin(car.heading) * car.speed * seconds;
  car.y -= Math.cos(car.heading) * car.speed * seconds;
  return car;
}
