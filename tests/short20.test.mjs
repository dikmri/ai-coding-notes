// 「20 行のコード」の作品の決まりを確かめる
// 数えるのは、図鑑の HTML・CSS・JavaScript の欄に表示される文字（空の行は数えない）。1 行は 120 文字まで、コメントは書かない
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sb);
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const [, f] of html.matchAll(/<script src="(entries\/[^"]+)"/g)) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), sb, { filename: f });
const D = sb.dekiru, list = D.entries.filter((e) => e.tags.includes('20行'));
const lines = (e) => [D.src(e.html), D.src(e.css), D.src(e.js)].join('\n').split('\n').filter((l) => l.trim());

test('20 行の作品は 10 本あり、どれもメガデモの分類に入っている', () => {
  assert.equal(list.length, 10, list.map((e) => e.id).join(' '));
  for (const e of list) assert.equal(e.c, 'demo', e.id);
});

test('20 行の作品: HTML・CSS・JavaScript を合わせて 20 行以内、1 行は 120 文字まで', () => {
  for (const e of list) {
    const L = lines(e);
    assert.ok(L.length <= 20, `${e.id}: ${L.length} 行`);
    for (const [i, l] of L.entries()) assert.ok([...l].length <= 120, `${e.id} の ${i + 1} 行目が ${[...l].length} 文字: ${l.slice(0, 60)}…`);
  }
});

test('20 行の作品: コメントで説明を書かず（説明は説明文に書く）、止めるか鳴らすボタンがある', () => {
  for (const e of list) {
    assert.ok(!lines(e).some((l) => /^\s*\/\/|\/\*/.test(l)), `${e.id}: コメントがある`);
    assert.match(D.src(e.html), /<button/, `${e.id}: ボタンがない`);
  }
});
