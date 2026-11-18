// 峠のゲーム（第 4 部で少しずつ作る）

import { startLoop } from './loop.js';
import { keys } from './input.js';
import { createCar, updateCar } from './car.js';
import { COURSE } from './course.js';
import { drawWorld } from './draw.js';

const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d');
const START_X = COURSE[0][0];
const START_Y = COURSE[0][1] - 3; // スタートの線の 3 m 先

const state = {
  car: createCar(START_X, START_Y, 0),
};

function update(seconds) {
  updateCar(state.car, keys, seconds);
}

function draw() {
  drawWorld(context, COURSE, state.car);
}

startLoop(update, draw);

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { state };
