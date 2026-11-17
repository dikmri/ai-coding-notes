// 画面キャプチャの計算（切り抜く四角、プレビューの倍率、四隅のつまみ、保存の名前、画面共有の誤りの文）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../os/js/core/capture.mjs';

test('四角: 2点から、向きをそろえた四角', () => {
  assert.deepEqual(K.normRect(50, 40, 10, 20), { x: 10, y: 20, w: 40, h: 20 });
  assert.deepEqual(K.normRect(10, 20, 10, 20), { x: 10, y: 20, w: 0, h: 0 });
});

test('四角: 画像の内に収め、整数にする', () => {
  assert.deepEqual(K.clampRect({ x: -5, y: 10.6, w: 50, h: 300 }, 40, 100), { x: 0, y: 11, w: 40, h: 89 });
  assert.equal(K.clampRect({ x: 500, y: 0, w: 10, h: 10 }, 40, 100), null); // 外にはみ出したものは無し
});

test('倍率: プレビューの上の四角を、画像の画素の四角に直す', () => {
  assert.deepEqual(K.toImageRect({ x: 10, y: 20, w: 100, h: 50 }, 0.5), { x: 20, y: 40, w: 200, h: 100 });
});

test('四隅のつまみ: 引いた分だけ大きさを変え、小さくなりすぎない', () => {
  const r = { x: 10, y: 10, w: 100, h: 80 };
  assert.deepEqual(K.resizeRect(r, 'br', 20, 10), { x: 10, y: 10, w: 120, h: 90 });
  assert.deepEqual(K.resizeRect(r, 'tl', 20, 10), { x: 30, y: 20, w: 80, h: 70 });
  assert.deepEqual(K.resizeRect(r, 'tr', -200, 0, 8), { x: 10, y: 10, w: 8, h: 80 });
  assert.deepEqual(K.resizeRect(r, 'bl', 0, -500, 8), { x: 10, y: 10, w: 100, h: 8 });
});

test('保存の名前: 撮った日時から', () => {
  assert.equal(K.defaultName(new Date(2026, 10, 17, 9, 5, 7)), '画面 2026-11-17 09-05-07.png');
});

test('画面共有の誤り: 取り消し・使えないときの文（壊れずに次にできることを案内する）', () => {
  assert.match(K.errorText({ name: 'NotAllowedError' }), /取り消されました/);
  assert.match(K.errorText({ name: 'NotSupportedError' }), /画面共有で撮れません/);
  assert.match(K.errorText({ name: 'X', message: 'y' }), /撮れませんでした/);
});
