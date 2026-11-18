// 固定の時間刻みのゲームループ。
//
// 画面を描き直す回数（requestAnimationFrame が呼ばれる回数）は、機械によって 1 秒に 60 回だったり 144 回だったりする。
// その回数に合わせて車を動かすと、速い画面の機械ほど結果が変わってしまう。
// そこで、車の計算はいつも同じ刻み（たとえば 1/120 秒）で進め、描くときに「刻みの何割まで進んだか」（alpha）を渡す。

// 経った時間をためて、刻みの何回分になったかを数える係
export function createStepper(stepSeconds, maxFrameSeconds = 0.25) {
  let accumulatedSeconds = 0;
  return {
    // elapsedSeconds 経ったときに、計算を何回進めるか（steps）と、余りの割合（alpha）を返す。
    // 画面が長く止まったとき（別のタブを見ていたときなど）は maxFrameSeconds までしか進めない
    advance(elapsedSeconds) {
      accumulatedSeconds += clampTime(elapsedSeconds, maxFrameSeconds);
      let steps = 0;
      while (accumulatedSeconds >= stepSeconds) {
        accumulatedSeconds -= stepSeconds;
        steps++;
      }
      return { steps, alpha: accumulatedSeconds / stepSeconds };
    },
    reset() {
      accumulatedSeconds = 0;
    },
  };
}

function clampTime(seconds, maxSeconds) {
  if (!(seconds > 0)) return 0;
  return Math.min(seconds, maxSeconds);
}

// ループを始める。update(stepSeconds) は計算、render(alpha) は描画。止めるときは返り値の stop() を呼ぶ
export function startLoop({ stepSeconds, update, render }) {
  const stepper = createStepper(stepSeconds);
  let lastTime = performance.now();
  let frameId = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    const { steps, alpha } = stepper.advance((now - lastTime) / 1000);
    lastTime = now;
    for (let i = 0; i < steps; i++) update(stepSeconds);
    render(alpha);
    frameId = requestAnimationFrame(frame);
  }

  frameId = requestAnimationFrame(frame);
  return {
    stop() {
      running = false;
      cancelAnimationFrame(frameId);
    },
  };
}
