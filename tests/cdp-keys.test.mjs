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

test('ドラッグの引数: 出発点と行き先の言い換え（x・from_x・destination_x・target_x・drop_x・to_x）を読む。足りなければ null', () => {
  const imp = (a) => import('../tools/lib/cdp.mjs').then((m) => m.dragArgs(a));
  return Promise.all([
    imp({ start_x: 1, start_y: 2, end_x: 3, end_y: 4 }).then((r) => assert.deepEqual(r, [1, 2, 3, 4])),
    imp({ x: 1, y: 2, destination_x: 3, destination_y: 4 }).then((r) => assert.deepEqual(r, [1, 2, 3, 4])),
    imp({ from_x: 1, from_y: 2, to_x: 3, to_y: 4 }).then((r) => assert.deepEqual(r, [1, 2, 3, 4])),
    imp({ x: 1, y: 2, target_x: 3, target_y: 4 }).then((r) => assert.deepEqual(r, [1, 2, 3, 4])),
    imp({ x: 1, y: 2, drop_x: 0, drop_y: 4 }).then((r) => assert.deepEqual(r, [1, 2, 0, 4])),
    imp({ x: 1, y: 2 }).then((r) => assert.equal(r, null)),
  ]);
});

test('キーの組み合わせ: 「+」そのものと、修飾キーを別に送る形（Gemini の press_key）', async () => {
  const { withModifiers, typedText } = await import('../tools/lib/cdp.mjs');
  assert.equal(parseCombo('+').main, '+');
  assert.deepEqual(parseCombo('Shift++'), { modifiers: 8, mods: ['Shift'], main: '+' });
  assert.deepEqual(parseCombo(withModifiers('a', ['Control'])), { modifiers: 2, mods: ['Control'], main: 'a' });
  assert.equal(parseCombo(withModifiers('+', ['Shift'])).main, '+');
  assert.equal(withModifiers('Enter'), 'Enter');
  // 修飾キーの欄がないときの「Control+z」は、区切って読む（配列に包むと1つの知らないキーになっていた）
  assert.deepEqual(parseCombo(withModifiers('Control+z')), { modifiers: 2, mods: ['Control'], main: 'z' });
  assert.deepEqual(parseCombo(withModifiers('Shift+a', ['Control'])), { modifiers: 10, mods: ['Control', 'Shift'], main: 'a' });
  // 打たれる文字: Ctrl などが付けば打たない。Shift と英字は大文字
  assert.equal(typedText('a', ['Control']), null);
  assert.equal(typedText('u', ['Shift']), 'U');
  assert.equal(typedText('+', ['Shift']), '+');
  assert.equal(typedText('5', []), '5');
  assert.equal(typedText('ArrowLeft', []), null);
});
