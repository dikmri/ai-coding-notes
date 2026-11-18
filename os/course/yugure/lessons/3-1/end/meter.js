// 速度計とラップタイマー（第 3 部で少しずつ作る）

// ---- 値と変数 ----
const metersPerSecond = 25; // 秒速 25 メートル（変わらない値は const）
const kmh = metersPerSecond * 3.6; // 時速に直す
console.log('秒速', metersPerSecond, 'メートルは、時速', kmh, 'キロメートル');

let laps = 0; // 周回の数（変わる値は let）
laps = laps + 1;
laps = laps + 1;
console.log('周回', laps);
