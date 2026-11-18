// 峠のゲーム（第 4 部で少しずつ作る）

import { startLoop } from './loop.js';
import { keys } from './input.js';
import { createCar, updateCar } from './car.js';
import { COURSE, isOnRoad, progressOf } from './course.js';
import { drawWorld } from './draw.js';

const START_X = COURSE[0][0];
const START_Y = COURSE[0][1] - 3; // スタートの線の 3 m 先（線の真上は、最初と最後の線分の両方に近く、進み具合が決まらない）

const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d');
const speedOutput = document.querySelector('#speed');
const lapOutput = document.querySelector('#lap');
const timeOutput = document.querySelector('#time');
const bestOutput = document.querySelector('#best');

const state = {
  car: createCar(START_X, START_Y, 0),
  time: 0, // 走り始めてからの時間（秒）
  lapStartedAt: 0,
  lapTimes: [],
  progress: 0,
  passedHalf: false, // 半周を過ぎたか（スタートの線の近くを行ったり来たりしても周回にしないため）
};

// 秒を「分:秒.ミリ秒」の文字にする
function formatSeconds(seconds) {
  // 先にミリ秒の整数へ丸める（59.9996 秒を「0:60.000」ではなく「1:00.000」にするため）
  const ms = Math.round(seconds * 1000);
  const minutes = Math.floor(ms / 60000);
  const rest = (ms - minutes * 60000) / 1000;
  return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`;
}

// 周回: 進み具合が、点の数の近くから 0 の近くへ戻ったら、スタートの線を越えた
function countLap() {
  const before = state.progress;
  const after = progressOf(COURSE, state.car.x, state.car.y);
  state.progress = after;
  if (after > COURSE.length * 0.4 && after < COURSE.length * 0.6) state.passedHalf = true; // コースの真ん中あたりを通った
  const crossedStart = before > COURSE.length - 2 && after < 2;
  if (crossedStart && state.passedHalf) {
    state.lapTimes.push(state.time - state.lapStartedAt);
    state.lapStartedAt = state.time;
    state.passedHalf = false;
    bestOutput.textContent = formatSeconds(Math.min(...state.lapTimes));
  }
}

function update(seconds) {
  const onRoad = isOnRoad(COURSE, state.car.x, state.car.y);
  updateCar(state.car, keys, seconds, onRoad);
  state.time += seconds;
  countLap();
}

function draw() {
  drawWorld(context, COURSE, state.car);
  speedOutput.textContent = Math.round(state.car.speed * 3.6);
  lapOutput.textContent = state.lapTimes.length + 1;
  timeOutput.textContent = formatSeconds(state.time);
}

startLoop(update, draw);

// 答え合わせのために、状態を外から読めるようにしておく
window.course = { state };
