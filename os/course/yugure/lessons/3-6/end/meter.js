// 速度計とラップタイマー。

// ---- 速さの計算（画面に関係しない、ただの計算）----

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
};

// ---- 画面の部品 ----
const speedOutput = document.querySelector('#speed');
const gearOutput = document.querySelector('#gear');
const SPEED_STEP = 5; // ボタン 1 回で変わる速さ（メートル毎秒）

// 今の速さを、画面に書く
function show() {
  const kmh = toKmh(car.speed);
  speedOutput.textContent = Math.round(kmh);
  gearOutput.textContent = gearFor(kmh);
}

document.querySelector('#accelerate').addEventListener('click', () => {
  car.speed = car.speed + SPEED_STEP;
  show();
});
document.querySelector('#brake').addEventListener('click', () => {
  car.speed = Math.max(car.speed - SPEED_STEP, 0);
  show();
});
show();

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { car };
