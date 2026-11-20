// node --test ui/core.test.mjs で実行する。値は Rust の taskcore のテストと同じ。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, ScrollBench, sampleText, sampleDone, group } from './core.js';

test('見本の本文が Rust 版と同じ', () => {
  assert.equal(sampleText(0), '00001 企画書を作る');
  assert.equal(sampleText(9), '00010 見積もりを見直す');
  assert.equal(sampleText(9999), '10000 設計図を見直す');
  assert.deepEqual([0, 1, 2].map(sampleDone), [false, false, true]);
});

test('桁区切り', () => {
  assert.deepEqual([0, 999, 10000, 1234567].map(group), ['0', '999', '10,000', '1,234,567']);
});

test('1万件を作ると件数と番号が合う', () => {
  const s = new Store();
  s.generate(10000);
  assert.deepEqual(s.counts(), { total: 10000, active: 6667, done: 3333 });
  assert.equal(s.tasks[9999].text, '10000 設計図を見直す');
  s.generate(1);
  assert.equal(s.tasks[10000].text, '10001 企画書を送る');
});

test('追加は前後の空白を除いて先頭へ、空は足さない', () => {
  const s = new Store();
  s.generate(2);
  assert.equal(s.add('   '), null);
  assert.equal(s.add('  牛乳を買う '), 3);
  assert.equal(s.tasks[0].text, '牛乳を買う');
  assert.equal(s.counts().total, 3);
});

test('完了の切り替えと削除', () => {
  const s = new Store();
  s.generate(3);
  assert.equal(s.toggle(1), true);
  assert.equal(s.toggle(1), false);
  assert.equal(s.toggle(99), null);
  assert.equal(s.remove(2), true);
  assert.equal(s.remove(2), false);
  assert.deepEqual(s.tasks.map((t) => t.id), [1, 3]);
});

test('語と状態で絞り込む', () => {
  const s = new Store();
  s.generate(10000);
  assert.equal(s.filter('資料', 'all').length, 1250);
  assert.equal(s.filter('', 'done').length, 3333);
  assert.equal(s.filter('存在しない語', 'all').length, 0);
  const t = new Store();
  t.add('Buy Milk');
  t.add('call bob');
  assert.deepEqual(t.filter('MILK', 'all'), [1]);
});

test('完了を消す・すべて消す', () => {
  const s = new Store();
  s.generate(9);
  assert.equal(s.clearDone(), 3);
  assert.equal(s.clear(), 6);
  s.generate(1);
  assert.equal(s.tasks[0].text, '00001 企画書を作る');
});

test('自動スクロールは待ち・スクロール・終わりの順', () => {
  const b = new ScrollBench(5);
  assert.equal(b.tick(0.5).kind, 'wait');
  const s1 = b.tick(1.004);
  assert.equal(s1.first, true);
  assert.ok(Math.abs(s1.offset - 12) < 1e-6);
  assert.deepEqual(b.tick(1.5), { kind: 'scroll', offset: 1500, first: false });
  const f = b.tick(6.1);
  assert.equal(f.kind, 'finished');
  assert.equal(f.frames, 2);
  assert.ok(Math.abs(f.secs - 5.096) < 1e-9);
  assert.ok(Math.abs(f.maxGapMs - 4600) < 0.5);
  assert.equal(b.tick(7).kind, 'idle');
});
