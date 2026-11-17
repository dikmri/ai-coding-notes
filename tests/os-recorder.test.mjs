// 音声レコーダーの計算（切れ端をつなぐ、音の大きさと色、波形の縮め方、保存の名前）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../os/js/core/recorder.mjs';

test('切れ端をつなぐ: 順番どおりに1本にする', () => {
  const out = R.joinChunks([new Float32Array([1, 2]), new Float32Array([]), new Float32Array([3])]);
  assert.deepEqual([...out], [1, 2, 3]);
  assert.equal(R.joinChunks([]).length, 0);
});

test('音の大きさ: いちばん大きい振れ幅と、色（ふつう・大きめ・音割れ）', () => {
  assert.equal(R.peak(new Float32Array([0.125, -0.75, 0.25])), 0.75); // Float32 で正しく表せる値を使う
  assert.equal(R.peak(new Float32Array([])), 0);
  assert.equal(R.levelKind(0.3), 'ok');
  assert.equal(R.levelKind(0.75), 'loud');
  assert.equal(R.levelKind(0.99), 'clip');
});

test('波形: n 個の区間ごとの最小と最大', () => {
  const d = new Float32Array([0, 1, -1, 0.5, 0.25, -0.25, 0, 0]);
  assert.deepEqual(R.waveBins(d, 4), [[0, 1], [-1, 0.5], [-0.25, 0.25], [0, 0]]);
  assert.equal(R.waveBins(new Float32Array([]), 3).length, 3);
  // 標本が区間より少ないときは、空けずに同じ標本を引き延ばす（描いた波形に穴が空かないように）
  assert.deepEqual(R.waveBins(new Float32Array([0.5]), 2), [[0.5, 0.5], [0.5, 0.5]]);
});

test('長さ: 標本の数と標本化の周波数から秒', () => {
  assert.equal(R.seconds(48000, 48000), 1);
  assert.equal(R.seconds(0, 44100), 0);
});

test('保存の名前: 録音した日時から', () => {
  assert.equal(R.defaultName(new Date(2026, 10, 17, 9, 5, 7)), '録音 2026-11-17 09-05-07.wav');
});

test('許可の誤り: 名前から、何が起きたかとどうすればよいかの文', () => {
  assert.match(R.errorText({ name: 'NotAllowedError' }), /許可/);
  assert.match(R.errorText({ name: 'NotFoundError' }), /見つかりません/);
  assert.match(R.errorText({ name: 'NotReadableError' }), /ほかのアプリ/);
  assert.match(R.errorText({ name: 'SomethingElse', message: 'x' }), /録音を始められませんでした/);
});
