// システム モニタの計算（フォルダごとの使用量、大きいファイル、1秒あたりの描き直し、窓の状態）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../os/js/core/monitor.mjs';

const E = [
  { path: '/画像', kind: 'dir', size: 0 }, { path: '/画像/海.png', kind: 'file', size: 3000 }, { path: '/画像/空/雲.png', kind: 'file', size: 1000 },
  { path: '/音楽', kind: 'dir', size: 0 }, { path: '/音楽/曲.wav', kind: 'file', size: 9000 },
  { path: '/ドキュメント', kind: 'dir', size: 0 }, { path: '/メモ.txt', kind: 'file', size: 50 },
];

test('フォルダごとの使用量: 一番上のフォルダごとに合計し、大きい順。一番上のファイルは別にまとめる', () => {
  assert.deepEqual(M.folderUsage(E), [
    { name: '音楽', path: '/音楽', bytes: 9000, files: 1 },
    { name: '画像', path: '/画像', bytes: 4000, files: 2 },
    { name: '（一番上のファイル）', path: '/', bytes: 50, files: 1 },
    { name: 'ドキュメント', path: '/ドキュメント', bytes: 0, files: 0 },
  ]);
});

test('大きいファイル: 大きい順に n 個', () => {
  assert.deepEqual(M.largest(E, 2).map((e) => e.path), ['/音楽/曲.wav', '/画像/海.png']);
  assert.equal(M.largest([], 5).length, 0);
});

test('割合: 全体に対する百分率（0 で割らない）。帯の幅は小さくても 1%', () => {
  assert.equal(M.percent(25, 100), 25);
  assert.equal(M.percent(1, 3), 33.3);
  assert.equal(M.percent(5, 0), 0);
  assert.equal(M.barWidth(1, 100000), 1);
  assert.equal(M.barWidth(0, 100), 0);
});

test('描き直しの回数: 直前の1秒に描いた回数。古い時刻は捨てる', () => {
  const f = M.fpsCounter();
  for (let t = 0; t <= 1000; t += 20) f.tick(t); // 20ms ごと = 50 回/秒
  assert.equal(f.fps(1000), 50);
  assert.equal(f.fps(3000), 0);
});

test('記録の並び: 決まった数を超えたら古いものから捨てる', () => {
  let a = [];
  for (let i = 0; i < 70; i++) a = M.pushSample(a, i, 60);
  assert.equal(a.length, 60);
  assert.equal(a[0], 10);
  assert.equal(a.at(-1), 69);
});

test('窓の状態: 最小化・最大化・手前・ふつう', () => {
  assert.equal(M.winState({ min: true, max: false }, false), '最小化');
  assert.equal(M.winState({ min: false, max: true }, true), '最大化（手前）');
  assert.equal(M.winState({ min: false, max: false }, true), '手前');
  assert.equal(M.winState({ min: false, max: false }, false), 'ふつう');
});
