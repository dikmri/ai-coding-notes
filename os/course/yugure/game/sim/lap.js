// 周回の数え方。
// スタートの線（道のり s = 0）を前向きに越えたら 1 周。
// ただし、コースの半分の地点を前向きに通ってからでないと数えない（線の近くを行ったり来たりしても周回にならないように）。

export function createLapCounter() {
  return {
    lap: 0, // 走り終えた周の数
    lastS: null, // 前回の道のり
    passedHalfway: false, // この周で、半分の地点を通ったか
    lapStartTime: 0, // この周を始めた時刻（秒）
    lastLapTime: null, // 前の周の時間（秒）
    bestLapTime: null, // いちばん速かった周の時間（秒）
  };
}

// 周回の数えを始める（スタートの合図のとき）
export function startLapCounter(counter, s, time) {
  counter.lastS = s;
  counter.passedHalfway = false;
  counter.lapStartTime = time;
}

// 今の道のり s と時刻 time を渡す。1 周したときは { lap, lapTime, best } を、それ以外は null を返す
export function updateLapCounter(counter, s, courseLength, time) {
  if (counter.lastS === null) return null;
  const half = courseLength / 2;
  const previous = counter.lastS;
  counter.lastS = s;
  const jump = Math.abs(s - previous);

  if (previous < half && s >= half && jump < courseLength / 4) counter.passedHalfway = true;
  if (previous >= half && s < half && jump < courseLength / 4) counter.passedHalfway = false; // 半分の地点を逆向きに戻った

  const crossedStartForward = previous > courseLength * 0.75 && s < courseLength * 0.25;
  if (!crossedStartForward || !counter.passedHalfway) return null;

  const lapTime = time - counter.lapStartTime;
  counter.lap++;
  counter.lastLapTime = lapTime;
  counter.bestLapTime = counter.bestLapTime === null ? lapTime : Math.min(counter.bestLapTime, lapTime);
  counter.lapStartTime = time;
  counter.passedHalfway = false;
  return { lap: counter.lap, lapTime, best: counter.bestLapTime };
}
