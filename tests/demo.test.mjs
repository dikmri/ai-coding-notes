// メガデモ（容量制限）のテスト: バイト数の数え方と、どのデモも上限に収まっていること
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sandbox);
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const [, f] of html.matchAll(/<script src="(entries\/[^"]+)"/g)) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), sandbox, { filename: f });
const D = sandbox.dekiru;
D.finalize();

test('UTF-8 のバイト数: 英数字1、アクセント付き2、ひらがな3、絵文字4', () => {
  assert.equal(D.utf8Bytes(''), 0);
  assert.equal(D.utf8Bytes('a'), 1);
  assert.equal(D.utf8Bytes('é'), 2);
  assert.equal(D.utf8Bytes('あ'), 3);
  assert.equal(D.utf8Bytes('😀'), 4);
  assert.equal(D.utf8Bytes('<canvas id=c>'), 13);
});

test('1ファイルにまとめる: HTML・CSS・JS の順で、無い部分は書かない', () => {
  assert.equal(D.miniHtml({ html: '<canvas id=c>', js: 'x=1' }), '<canvas id=c><script>x=1</script>');
  assert.equal(D.miniHtml({ html: '<p>', css: 'p{}', js: 'y=2' }), '<p><style>p{}</style><script>y=2</script>');
  assert.equal(D.miniHtml({ html: '<b>' }), '<b>');
});

test('メガデモは10本あり、どれも決めた上限（256・1024・4096 バイト）に収まる', () => {
  const demos = D.entries.filter((e) => e.c === 'demo' && e.size);   // 行数で制限する「20 行」の作品（tests/short20.test.mjs）は数えない
  assert.equal(demos.length, 10);
  for (const e of demos) {
    assert.ok([256, 1024, 4096].includes(e.size), `${e.id}: size`);
    const n = D.utf8Bytes(D.miniHtml(e));
    assert.ok(n <= e.size, `${e.id}: ${n} / ${e.size} バイト`);
    assert.equal(typeof e.js, 'string', `${e.id}: js は数えた文字そのままの文字列で持つ`);
  }
});
