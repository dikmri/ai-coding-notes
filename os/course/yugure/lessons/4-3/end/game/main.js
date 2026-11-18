// 峠のゲーム（第 4 部で少しずつ作る）

import { startLoop } from './loop.js';
import { keys } from './input.js';
import { CAR, createCar, updateCar } from './car.js';

const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d');
const SCALE = 6; // 1 メートルを何画素で描くか

const state = {
  car: createCar(0, 0, 0), // 画面の真ん中から、北を向いて
};

function update(seconds) {
  updateCar(state.car, keys, seconds);
}

function draw() {
  context.fillStyle = '#3f5a33';
  context.fillRect(0, 0, canvas.width, canvas.height);
  // 画面の真ん中を、世界の位置 (0, 0) にし、1 メートルを SCALE 画素で描く
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale(SCALE, SCALE);
  drawCar(context, state.car);
  context.restore();
}

// 車: 向きの分だけ回した四角と、前の窓
function drawCar(context, car) {
  context.save();
  context.translate(car.x, car.y);
  context.rotate(car.heading);
  context.fillStyle = '#c8582a';
  context.fillRect(-CAR.WIDTH / 2, -CAR.LENGTH / 2, CAR.WIDTH, CAR.LENGTH);
  context.fillStyle = '#1d1a24';
  context.fillRect(-CAR.WIDTH / 2 + 0.2, -CAR.LENGTH / 2 + 0.6, CAR.WIDTH - 0.4, 0.8);
  context.restore();
}

startLoop(update, draw);

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { state };
