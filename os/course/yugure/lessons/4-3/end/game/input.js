// キーボード: 押されているキーを覚えておく。ゲームは毎回の計算でこれを読む
export const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
};

const NAMES = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

document.addEventListener('keydown', (event) => {
  const name = NAMES[event.key];
  if (name) {
    keys[name] = true;
    event.preventDefault(); // 矢印キーでページが動かないように
  }
});

document.addEventListener('keyup', (event) => {
  const name = NAMES[event.key];
  if (name) keys[name] = false;
});
