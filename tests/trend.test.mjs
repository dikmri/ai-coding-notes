// 「今日の話題を再現」まわりのテスト（日付の差・並び順・検査の決まり）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function load(extra = '') {
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sandbox);
  if (extra) vm.runInContext(extra, sandbox);
  return sandbox.dekiru;
}

test('日付の差: 同じ日は0、前の日は1、月や年をまたいでも数える', () => {
  const D = load();
  assert.equal(D.daysBetween('2026-11-17', '2026-11-17'), 0);
  assert.equal(D.daysBetween('2026-11-16', '2026-11-17'), 1);
  assert.equal(D.daysBetween('2026-10-31', '2026-11-01'), 1);
  assert.equal(D.daysBetween('2025-12-31', '2026-01-02'), 2);
  assert.equal(D.daysBetween('2026-11-18', '2026-11-17'), -1);
});

test('話題の分類は先頭にあり、新しい日付の項目ほど前に並ぶ', () => {
  const D = load(`
    dekiru.add({ id: 'shape-a', c: 'shape', t: 'a', y: 'あ', tags: ['x', 'y'], d: '12345678' });
    dekiru.add({ id: 'tr-20261115-old', c: 'trend', date: '2026-11-15', t: 'old', y: 'お', tags: ['x', 'y'], d: '12345678' });
    dekiru.add({ id: 'tr-20261117-new', c: 'trend', date: '2026-11-17', t: 'new', y: 'に', tags: ['x', 'y'], d: '12345678' });
    dekiru.finalize();`);
  assert.equal(D.cats[0].id, 'trend');
  assert.deepEqual(Array.from(D.entries, (e) => e.id), ['tr-20261117-new', 'tr-20261115-old', 'shape-a']);
});
