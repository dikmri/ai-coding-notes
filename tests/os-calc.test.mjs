// 電卓の計算（式の評価、表示の整え方、キーを押したときの状態の移り変わり）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../os/js/core/calc.mjs';

const val = (e) => { const r = C.evaluate(e); assert.equal(r.ok, true, `${e} → ${JSON.stringify(r)}`); return r.value; };
const keys = (seq, s = C.initial()) => { for (const k of seq) s = C.press(s, k).state; return s; };

test('式: 四則演算の順番と括弧と符号', () => {
  assert.equal(val('(12+8)*3'), 60);
  assert.equal(val('2+3*4'), 14);
  assert.equal(val('(2+3)*4'), 20);
  assert.equal(val('-3*-2'), 6);
  assert.equal(val('10/4'), 2.5);
  assert.equal(val('-(2+3)'), -5);
});

test('式: パーセントは 1/100。足し算と引き算では、左の数の何パーセントかを足し引きする', () => {
  assert.equal(val('50%'), 0.5);
  assert.equal(val('200+10%'), 220);
  assert.equal(val('200-10%'), 180);
  assert.equal(val('200*10%'), 20);
});

test('式: 0 で割るとき、式が途中のときは、理由つきで失敗を返す', () => {
  assert.deepEqual(C.evaluate('1/0'), { ok: false, error: 'zero' });
  assert.deepEqual(C.evaluate('2+'), { ok: false, error: 'syntax' });
  assert.deepEqual(C.evaluate('(1+2'), { ok: false, error: 'syntax' });
  assert.deepEqual(C.evaluate('1..2'), { ok: false, error: 'syntax' });
  assert.deepEqual(C.evaluate(''), { ok: false, error: 'syntax' });
});

test('表示: 小数の誤差を丸め、大きい数と小さい数は指数で書く', () => {
  assert.equal(C.format(0.1 + 0.2), '0.3');
  assert.equal(C.format(1 / 3), '0.333333333333');
  assert.equal(C.format(-0), '0');
  assert.equal(C.format(1e20), '1e+20');
  assert.equal(C.format(1.5e-8), '1.5e-8');
  assert.equal(C.group('1234567.891'), '1,234,567.891');
  assert.equal(C.group('-1234'), '-1,234');
  assert.equal(C.pretty('12*3-4/2'), '12×3−4÷2');
});

test('キー: 数字と演算子で式を作り、= で答えを出す。答えのあとの演算子は答えから続ける', () => {
  let s = keys(['1', '2', '+', '8']);
  assert.equal(s.expr, '12+8');
  const r = C.press(s, '=');
  assert.equal(r.event, 'eval');
  assert.deepEqual(r.done, { expr: '12+8', value: 20 });
  s = keys(['*', '2', '='], r.state);
  assert.equal(s.last, 40);
  s = keys(['5'], s);
  assert.equal(s.expr, '5'); // 答えのあとの数字は新しい式
});

test('キー: 演算子を続けて押すと置き換える。ただし掛け算・割り算・括弧のあとの - は符号', () => {
  assert.equal(keys(['1', '2', '+', '*']).expr, '12*');
  assert.equal(keys(['1', '2', '*', '-']).expr, '12*-');
  assert.equal(keys(['(', '-', '3']).expr, '(-3');
  assert.equal(keys(['+']).expr, '0+'); // 何もないときは 0 から
});

test('キー: 小数点は1つの数に1回まで。先頭の小数点は 0. にする', () => {
  assert.equal(keys(['.', '5']).expr, '0.5');
  assert.equal(keys(['1', '.', '2', '.']).expr, '1.2');
  assert.equal(keys(['1', '+', '.']).expr, '1+0.');
});

test('キー: Backspace で1文字消し、Escape で全部消す。誤りのあとは次のキーで戻る', () => {
  assert.equal(keys(['1', '2', 'Backspace']).expr, '1');
  assert.deepEqual(keys(['1', '+', '2', 'Escape']), C.initial());
  const e = C.press(keys(['1', '/', '0']), '=');
  assert.equal(e.event, 'error');
  assert.equal(e.state.error, 'zero');
  const s = C.press(e.state, '7').state;
  assert.equal(s.error, null);
  assert.equal(s.expr, '7');
});

test('キー: ± は最後の数の符号を変え、もう一度押すと戻す。答えのあとは答えの符号を変える', () => {
  assert.equal(keys(['1', '2', '+', '8', 'neg']).expr, '12+(-8)');
  assert.equal(keys(['1', '2', '+', '8', 'neg', 'neg']).expr, '12+8');
  assert.equal(keys(['5', '=', 'neg']).expr, '(-5)');
  assert.equal(keys(['neg']).expr, '');
});

test('値を入れる: 計算テープの答えを、式の続きか新しい式として入れる', () => {
  assert.equal(C.insertValue(C.initial(), 42).expr, '42');
  assert.equal(C.insertValue(keys(['1', '+']), 42).expr, '1+42');
  assert.equal(C.insertValue(keys(['1', '+']), -3).expr, '1+(-3)');
  assert.equal(C.insertValue(keys(['7', '=']), 9).expr, '9');
  assert.equal(C.insertValue(keys(['1', '2']), 9).expr, '9'); // 数のすぐあとには置き換える
});

test('計算テープの書き出し: 1行に1つの式と答え', () => {
  const t = C.tapeToText([{ expr: '12+8', value: 20 }, { expr: '20*2', value: 40 }], '2026-11-17 09:00');
  assert.equal(t, '電卓の計算テープ（2026-11-17 09:00）\n\n12＋8 = 20\n20×2 = 40\n');
});
