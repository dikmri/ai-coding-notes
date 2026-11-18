// 速度計とラップタイマー（第 3 部で少しずつ作る）

// ---- 値と変数 ----
const metersPerSecond = 25; // 秒速 25 メートル（変わらない値は const）
const kmh = metersPerSecond * 3.6; // 時速に直す
console.log('秒速', metersPerSecond, 'メートルは、時速', kmh, 'キロメートル');

let laps = 0; // 周回の数（変わる値は let）
laps = laps + 1;
laps = laps + 1;
console.log('周回', laps);

// ---- 関数: 秒速（メートル毎秒）を、時速（キロメートル毎時）に直す ----
export function toKmh(metersPerSecond) {
  return metersPerSecond * 3.6;
}
console.log('ゲンさんの車のいちばん速い速さは、時速', toKmh(47.5), 'キロメートル');

// ---- もし〜なら: 時速から、変速の段を決める（ゲンさんの車は 5 段） ----
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
console.log('時速 60 キロメートルは', gearFor(60), '速');

// ---- 何度も: 周回の時間（ミリ秒）の並びから、いちばん短いものを探す ----
export function bestLap(laps) {
  let best = Infinity;
  for (const time of laps) {
    if (time < best) {
      best = time;
    }
  }
  return best;
}
const lapTimes = [83456, 81002, 82500];
console.log('最速の周回は', bestLap(lapTimes), 'ミリ秒');
