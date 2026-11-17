// 時計とタイマーの計算（時間の表示、タイマー、ストップウォッチ、針の角度、CSV）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../os/js/core/clock.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('時間の表示: 分と秒、1時間を超えたら時も。百分の一秒は切り捨て', () => {
  assert.equal(K.fmt(0), '00:00');
  assert.equal(K.fmt(61_000), '01:01');
  assert.equal(K.fmt(3_725_000), '1:02:05');
  assert.equal(K.fmt(1_239, { cs: true }), '00:01.23');
  assert.equal(K.fmt(-500), '00:00');
  assert.equal(K.fmtLeft(400), '00:01'); // 残り時間は切り上げ（0.4 秒残りは 1 秒と見せる）
  assert.equal(K.fmtLeft(0), '00:00');
});

test('長さの入力: 分と秒から、0〜99分59秒の範囲のミリ秒にする', () => {
  assert.equal(K.duration(3, 0), 180_000);
  assert.equal(K.duration('1', '30'), 90_000);
  assert.equal(K.duration(0, 75), 75_000);
  assert.equal(K.duration(-1, 'x'), 0);
  assert.equal(K.duration(200, 0), 5_999_000);
});

test('タイマー: 始める・止める・続ける・戻す。残りは時刻から計算する', () => {
  let t = K.timer(5_000);
  assert.equal(K.timerLeft(t, 1000), 5_000);
  t = K.timerStart(t, 1000);
  assert.equal(K.timerLeft(t, 3500), 2_500);
  t = K.timerPause(t, 3500);
  assert.equal(t.running, false);
  assert.equal(K.timerLeft(t, 99_999), 2_500);
  t = K.timerStart(t, 10_000);
  assert.equal(K.timerLeft(t, 12_000), 500);
  assert.equal(K.timerLeft(t, 20_000), 0);
  assert.equal(K.timerDone(t, 12_500), true);
  t = K.timerReset(t);
  assert.equal(K.timerLeft(t, 0), 5_000);
  assert.equal(t.running, false);
});

test('ストップウォッチ: 止めた間は数えない。ラップは前のラップからの時間と合計', () => {
  let s = K.stopwatch();
  s = K.swStart(s, 1000);
  assert.equal(K.swElapsed(s, 2500), 1500);
  s = K.swLap(s, 2500);
  s = K.swStop(s, 3000);
  assert.equal(K.swElapsed(s, 9000), 2000);
  s = K.swStart(s, 10_000);
  s = K.swLap(s, 11_000);
  assert.deepEqual(s.laps, [{ n: 1, lap: 1500, total: 1500 }, { n: 2, lap: 1500, total: 3000 }]);
  assert.equal(K.swElapsed(K.swReset(s), 50_000), 0);
});

test('ラップの CSV: 見出しの行と、番号・ラップ・経過', () => {
  const csv = K.lapsToCsv([{ n: 1, lap: 1500, total: 1500 }, { n: 2, lap: 61_230, total: 62_730 }]);
  assert.equal(csv, '番号,ラップ,経過\n1,00:01.50,00:01.50\n2,01:01.23,01:02.73\n');
});

test('針の角度: 12時が 0。秒針と分針はなめらかに進む', () => {
  const h = K.hands(new Date(2026, 10, 17, 3, 30, 15, 500));
  assert.ok(near(h.s, (15.5 / 60) * 2 * Math.PI));
  assert.ok(near(h.m, ((30 + 15.5 / 60) / 60) * 2 * Math.PI));
  assert.ok(near(h.h, ((3 + 30.258333333333333 / 60) / 12) * 2 * Math.PI, 1e-6));
  assert.ok(near(K.hands(new Date(2026, 0, 1, 12, 0, 0)).h, 0));
});
