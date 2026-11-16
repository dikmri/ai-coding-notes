// Chrome を動かす部分のうち、計算だけのもの（キーの名前の読み取り、座標の変換、移動してよい URL）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyInfo, parseCombo, toPixel, sameOrigin } from '../tools/lib/cdp.mjs';

test('キー: 名前の言い換えを受け付け、Windows のキーの番号を返す', () => {
  assert.deepEqual(keyInfo('enter'), { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' });
  assert.deepEqual(keyInfo('Esc'), { key: 'Escape', code: 'Escape', keyCode: 27 });
  assert.deepEqual(keyInfo('z'), { key: 'z', code: 'KeyZ', keyCode: 90, text: 'z' });
  assert.deepEqual(keyInfo('5'), { key: '5', code: 'Digit5', keyCode: 53, text: '5' });
  assert.deepEqual(keyInfo('F2'), { key: 'F2', code: 'F2', keyCode: 113 });
  assert.deepEqual(keyInfo('ArrowLeft'), { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 });
  assert.deepEqual(keyInfo('space'), { key: ' ', code: 'Space', keyCode: 32, text: ' ' });
});

test('キーの組み合わせ: Control+A や ["ctrl","shift","s"] を、修飾キーの印と本体に分ける', () => {
  assert.deepEqual(parseCombo('Control+A'), { modifiers: 2, mods: ['Control'], main: 'a' });
  assert.deepEqual(parseCombo(['ctrl', 'shift', 'S']), { modifiers: 10, mods: ['Control', 'Shift'], main: 's' });
  assert.deepEqual(parseCombo('Alt'), { modifiers: 1, mods: ['Alt'], main: null });
});

test('座標: 0〜999 の値を画面の画素にする', () => {
  assert.equal(toPixel(500, 1280), 640);
  assert.equal(toPixel(999, 800), 799);
  assert.equal(toPixel(0, 800), 0);
});

test('移動してよい URL: 始めの URL と同じ場所（scheme・ホスト・ポート）だけ', () => {
  assert.equal(sameOrigin('http://localhost:8769/os/?shot', 'http://localhost:8769/'), true);
  assert.equal(sameOrigin('http://localhost:8769/os/', 'http://localhost:8765/'), false);
  assert.equal(sameOrigin('http://localhost:8769/os/', 'https://example.com/'), false);
  assert.equal(sameOrigin('http://localhost:8769/os/', 'これは URL ではない'), false);
});
