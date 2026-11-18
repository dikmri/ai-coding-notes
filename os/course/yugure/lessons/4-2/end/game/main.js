// 峠のゲーム（第 4 部で少しずつ作る）

import { startLoop } from './loop.js';

const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d');

// 車の状態: 画面の上の位置（画素）と、上へ進む速さ（画素毎秒）
const state = {
  x: 480,
  y: 520,
  speed: 120,
};

// 計算: 時間 seconds だけ進める。画面の上の端を越えたら、下の端へ戻す
function update(seconds) {
  state.y -= state.speed * seconds;
  if (state.y < -40) state.y = canvas.height;
}

// 描く: 毎回、草から描き直す
function draw() {
  context.fillStyle = '#3f5a33';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#6b6560';
  context.fillRect(440, 0, 80, canvas.height);
  context.fillStyle = '#c8582a';
  context.fillRect(state.x - 10, state.y - 20, 20, 40);
}

startLoop(update, draw);

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { state };
