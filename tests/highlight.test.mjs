// コード色分けのテスト。文字が1つも失われず、HTMLとして安全であることを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { highlight } = require('../js/highlight.js');

const unescape = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

const SAMPLES = {
  html: ['<b class="x">&amp;</b>', '<!-- c -->\n<input disabled value=\'a<b\'>', 'text only & <'],
  css: ['a{color:red}', '/* c */ .x::before { content: "<>"; --v: 3px }', '@media (width > 3px) { a { b: c } }'],
  js: ['const a = "x"; // c', 'let t = `a${b}c` /* x */ + 1.5e3', 'if (a < b && c > d) return /re[/]g.test(s)', "x = '<script>'"],
};

test('highlight: 元の文字列を完全に保つ', () => {
  for (const [lang, list] of Object.entries(SAMPLES)) {
    for (const src of list) assert.equal(unescape(highlight(src, lang)), src, `${lang}: ${src}`);
  }
});

test('highlight: < と & をエスケープする', () => {
  const out = highlight('<b>&</b>', 'html');
  assert.ok(!out.includes('<b>'));
  assert.ok(out.includes('&lt;'));
  assert.ok(out.includes('&amp;'));
});

test('highlight: 種類ごとに色の印を付ける', () => {
  const js = highlight('const a = "x"; // c', 'js');
  assert.ok(js.includes('<span class="k">const</span>'));
  assert.ok(js.includes('<span class="s">"x"</span>'));
  assert.ok(js.includes('<span class="c">// c</span>'));
  assert.ok(highlight('a{color:red}', 'css').includes('<span class="p">color</span>'));
  assert.ok(highlight('<div id="a">', 'html').includes('<span class="t">div</span>'));
});
