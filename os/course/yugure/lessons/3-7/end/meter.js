// 速度計とラップタイマー。
// 速度計: アクセルとブレーキ（ボタンかキー）で速さを変え、時速と変速の段を表示する。

// ---- 速さの計算（画面に関係しない、ただの計算）----
const ACCELERATION = 4; // 1 秒に増える速さ（メートル毎秒）
const BRAKING = 9; // 1 秒に減る速さ（メートル毎秒）
const MAX_SPEED = 47.5; // いちばん速い速さ（メートル毎秒）。時速 171 km

// 秒速（メートル毎秒）を、時速（キロメートル毎時）に直す
export function toKmh(metersPerSecond) {
  return metersPerSecond * 3.6;
}

// 時速から、変速の段を決める（ゲンさんの車は 5 段）
export function gearFor(kmh) {
  if (kmh < 20) {
    return 1;
  } else if (kmh < 45) {
    return 2;
  } else if (kmh < 75) {
    return 3;
  } else if (kmh < 110) {
    return 4;
  }
  return 5;
}

// 周回の時間（ミリ秒）の並びから、いちばん短いものを探す
export function bestLap(laps) {
  let best = Infinity;
  for (const time of laps) {
    if (time < best) {
      best = time;
    }
  }
  return best;
}

// ---- 車の状態 ----
const car = {
  name: 'ゲンさんのハッチバック',
  speed: 0, // メートル毎秒
  accelerating: false,
  braking: false,
};

// ---- 画面の部品 ----
const speedOutput = document.querySelector('#speed');
const gearOutput = document.querySelector('#gear');

// ボタン: 押している間だけアクセル・ブレーキ
function holdButton(button, key) {
  button.addEventListener('pointerdown', () => { car[key] = true; });
  button.addEventListener('pointerup', () => { car[key] = false; });
  button.addEventListener('pointerleave', () => { car[key] = false; });
}
holdButton(document.querySelector('#accelerate'), 'accelerating');
holdButton(document.querySelector('#brake'), 'braking');

// キー: 押している間だけアクセル・ブレーキ
document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowUp') car.accelerating = true;
  if (event.key === 'ArrowDown') car.braking = true;
});
document.addEventListener('keyup', (event) => {
  if (event.key === 'ArrowUp') car.accelerating = false;
  if (event.key === 'ArrowDown') car.braking = false;
});

// ---- 毎回の更新（画面を描き直すたびに呼ばれる）----
let lastTime = performance.now();
function update(now) {
  const seconds = (now - lastTime) / 1000;
  lastTime = now;
  if (car.accelerating) car.speed += ACCELERATION * seconds;
  if (car.braking) car.speed -= BRAKING * seconds;
  car.speed = Math.min(Math.max(car.speed, 0), MAX_SPEED);

  const kmh = toKmh(car.speed);
  speedOutput.textContent = Math.round(kmh);
  gearOutput.textContent = gearFor(kmh);
  requestAnimationFrame(update);
}
requestAnimationFrame(update);

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { car };
