// ゲームのループ（固定の時間刻み）。
// 計算（update）はいつも同じ時間の刻み（1/60 秒）で進め、描く（draw）のは画面の書き換えごとに 1 回。
// 画面の書き換えの速さ（60 回・144 回など）が違っても、車の動きは同じになる。

export const STEP_SECONDS = 1 / 60;
const MAX_STEPS = 5; // 遅れたときに、1 回でまとめて進める刻みの上限（止まった後に飛ばないように）

export function startLoop(update, draw) {
  let last = performance.now();
  let stored = 0; // まだ進めていない時間（秒）
  function frame(now) {
    stored += (now - last) / 1000;
    last = now;
    let steps = 0;
    while (stored >= STEP_SECONDS && steps < MAX_STEPS) {
      update(STEP_SECONDS);
      stored -= STEP_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS) stored = 0;
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
