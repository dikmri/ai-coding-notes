// 音楽プレーヤーの再生の一覧（.m3u の読み書き、次の曲の決め方、順番を混ぜる、並べ替え）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../os/js/core/playlist.mjs';

test('.m3u を読む: # の行と空の行を飛ばし、相対のパスは一覧のあるフォルダから読む', () => {
  const t = '#EXTM3U\r\n/音楽/a.wav\r\nb.sng\n../画像/x.wav\n\n  /音楽/c.mp3  \n';
  assert.deepEqual(L.parseM3U(t, '/音楽'), ['/音楽/a.wav', '/音楽/b.sng', '/画像/x.wav', '/音楽/c.mp3']);
});

test('.m3u を書く: 先頭に #EXTM3U、1行に1つのパス', () => {
  assert.equal(L.toM3U(['/音楽/a.wav', '/音楽/b.sng']), '#EXTM3U\n/音楽/a.wav\n/音楽/b.sng\n');
});

test('鳴らせるファイル: 音のファイルとシンセの曲。大文字の拡張子も', () => {
  assert.ok(L.isPlayable('a.WAV') && L.isPlayable('b.mp3') && L.isPlayable('c.sng') && L.isPlayable('d.ogg'));
  assert.ok(!L.isPlayable('e.txt') && !L.isPlayable('f.png') && !L.isPlayable('g'));
});

test('曲が終わったとき: くり返しなしは最後で止まる、全部は先頭へ、1曲は同じ曲', () => {
  const s = { order: [0, 1, 2], index: 2, repeat: 'none' };
  assert.equal(L.afterEnd(s), -1);
  assert.equal(L.afterEnd({ ...s, repeat: 'all' }), 0);
  assert.equal(L.afterEnd({ ...s, repeat: 'one' }), 2);
  assert.equal(L.afterEnd({ ...s, index: 0 }), 1);
  assert.equal(L.afterEnd({ order: [], index: -1, repeat: 'all' }), -1);
});

test('前・次のボタン: 順番どおりに動き、端では反対の端へ回る。混ぜた順番にも従う', () => {
  assert.equal(L.step({ order: [0, 1, 2], index: 2 }, 1), 0);
  assert.equal(L.step({ order: [0, 1, 2], index: 0 }, -1), 2);
  assert.equal(L.step({ order: [2, 0, 1], index: 2 }, 1), 0);
  assert.equal(L.step({ order: [], index: -1 }, 1), -1);
});

test('順番を混ぜる: 今の曲を先頭にして、ほかは全部1回ずつ', () => {
  let seed = 7; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const o = L.shuffleOrder(6, 3, rng);
  assert.equal(o[0], 3);
  assert.deepEqual([...o].sort(), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(L.shuffleOrder(3, -1, rng).sort(), [0, 1, 2]);
});

test('並べ替え: 上へ・下へ。端では動かない。動かしたあとの位置を返す', () => {
  assert.deepEqual(L.moveItem(['a', 'b', 'c'], 2, -1), { list: ['a', 'c', 'b'], to: 1 });
  assert.deepEqual(L.moveItem(['a', 'b', 'c'], 0, -1), { list: ['a', 'b', 'c'], to: 0 });
  assert.deepEqual(L.moveItem(['a', 'b', 'c'], 2, 1), { list: ['a', 'b', 'c'], to: 2 });
});
