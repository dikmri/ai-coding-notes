// 同じファイルやフォルダを開いている窓を探す計算のテスト（窓を二重に開かないため）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findWindow, openKey } from '../os/js/core/winfind.mjs';

const W = (app, path, id) => ({ id, app, args: path === undefined ? {} : { path } });

test('同じアプリで同じパスを開いている窓を見つける', () => {
  const a = W('notepad', '/ドキュメント/日記.txt', 'w1'), b = W('notepad', '/ドキュメント/メモ.txt', 'w2');
  assert.equal(findWindow([a, b], 'notepad', '/ドキュメント/メモ.txt'), b);
});

test('パスの書き方が違っても同じ場所なら同じ窓とみなす', () => {
  const a = W('filer', '/ドキュメント', 'w1');
  assert.equal(findWindow([a], 'filer', '/ドキュメント/'), a);
  assert.equal(findWindow([a], 'filer', '//ドキュメント/./'), a);
  assert.equal(findWindow([W('filer', '/', 'w2')], 'filer', '/').id, 'w2');
});

test('アプリが違えば同じパスでも別の窓として扱う', () => {
  const a = W('notepad', '/音楽/曲.sng', 'w1');
  assert.equal(findWindow([a], 'synth', '/音楽/曲.sng'), null);
});

test('名前のない窓（パスが無い窓）とは重ならない', () => {
  const untitled = W('notepad', undefined, 'w1');
  assert.equal(findWindow([untitled], 'notepad', '/ドキュメント/無題.txt'), null);
  assert.equal(findWindow([untitled], 'notepad', ''), null);
  assert.equal(findWindow([untitled], 'notepad', undefined), null);
});

test('途中でパスが変わった窓は、変わった後のパスで見つかる', () => {
  const a = W('filer', '/', 'w1');
  a.args = { ...a.args, path: '/画像' };
  assert.equal(findWindow([a], 'filer', '/'), null);
  assert.equal(findWindow([a], 'filer', '/画像'), a);
});

test('同じ場所の窓が複数あれば、渡された並びの先のものを選ぶ', () => {
  const top = W('filer', '/', 'top'), back = W('filer', '/', 'back');
  assert.equal(findWindow([top, back], 'filer', '/'), top);
});

test('開いている途中の重複を防ぐための鍵は、アプリと正規化したパスで決まる', () => {
  assert.equal(openKey('filer', '/ゴミ箱/'), openKey('filer', '/ゴミ箱'));
  assert.notEqual(openKey('filer', '/ゴミ箱'), openKey('notepad', '/ゴミ箱'));
  assert.equal(openKey('notepad', ''), null);
});
