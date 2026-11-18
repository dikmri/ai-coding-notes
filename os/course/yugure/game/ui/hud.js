// 画面に重ねる表示（速度計・ギア・回転数・周回の時間・知らせ）。HTML の要素の文字と幅を書き換える。

// 秒を「分:秒.百分の一秒」の文字にする（例: 83.456 → "1:23.45"）
export function formatLapTime(seconds) {
  if (seconds === null || seconds === undefined) return '-:--.--';
  const totalHundredths = Math.floor(seconds * 100);
  const minutes = Math.floor(totalHundredths / 6000);
  const rest = totalHundredths % 6000;
  const secs = Math.floor(rest / 100), hundredths = rest % 100;
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function createHud(root) {
  const find = (name) => root.querySelector(`[data-hud="${name}"]`);
  const parts = {
    speed: find('speed'), gear: find('gear'), rpm: find('rpm'),
    lap: find('lap'), time: find('time'), last: find('last'), best: find('best'),
    message: find('message'),
  };
  let messageTimer = 0;

  return {
    // race と車の値から表示を書き換える
    update(race, redlineRpm) {
      const car = race.car;
      parts.speed.textContent = Math.round(Math.abs(car.forwardSpeed) * 3.6);
      parts.gear.textContent = car.gear < 0 ? 'R' : String(car.gear);
      parts.rpm.style.setProperty('--rpm', (car.engineRpm / redlineRpm).toFixed(3));
      const counter = race.lapCounter;
      parts.lap.textContent = race.started ? counter.lap + 1 : 1;
      parts.time.textContent = formatLapTime(race.started ? race.time - counter.lapStartTime : 0);
      parts.last.textContent = formatLapTime(counter.lastLapTime);
      parts.best.textContent = formatLapTime(counter.bestLapTime);
    },
    // 画面の中央に知らせを出す。seconds 秒たつと消える（0 なら消えない）
    showMessage(text, seconds = 2) {
      parts.message.textContent = text;
      parts.message.hidden = !text;
      messageTimer = seconds;
    },
    // 時間を進めて、知らせを消す
    tick(dt) {
      if (messageTimer <= 0) return;
      messageTimer -= dt;
      if (messageTimer <= 0) parts.message.hidden = true;
    },
  };
}
