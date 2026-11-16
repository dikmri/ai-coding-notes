// 撮影用の入口（?shot=...）の読み取りのテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShot } from '../os/js/core/shot.mjs';

test('撮影用の入口: shot が無ければ null（ふつうの起動）', () => {
  assert.equal(parseShot(''), null);
  assert.equal(parseShot('?a=1'), null);
});

test('撮影用の入口: 値が無ければデスクトップだけ', () => {
  assert.deepEqual(parseShot('?shot'), []);
  assert.deepEqual(parseShot('?shot='), []);
});

test('撮影用の入口: アプリ名、アプリ:パス、パスだけ、を順に読む', () => {
  assert.deepEqual(parseShot('?shot=synth,modeler:/モデル/見本のロケット.lpm,/ドキュメント/はじめに.txt'), [
    { app: 'synth', path: null },
    { app: 'modeler', path: '/モデル/見本のロケット.lpm' },
    { app: null, path: '/ドキュメント/はじめに.txt' },
  ]);
});

test('撮影用の入口: URL の符号化された日本語も読み、空の項目と知らないアプリは捨てる', () => {
  const q = '?shot=' + encodeURIComponent('notepad:/ドキュメント/はじめに.txt') + ',,unknown,settings';
  assert.deepEqual(parseShot(q, ['notepad', 'settings']), [
    { app: 'notepad', path: '/ドキュメント/はじめに.txt' },
    { app: 'settings', path: null },
  ]);
});
