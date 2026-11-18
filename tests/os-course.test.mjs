// 講座の窓の、画面に関係しない計算（os/js/core/course.mjs）
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeState, renderMarkdown, lineDiff, checkerScript, captureScript } from '../os/js/core/course.mjs';

const lessons = [
  { id: 'a', start: { 'index.html': 'A0' }, end: { 'index.html': 'A1' } },
  { id: 'b', start: { 'img/x.svg': 'X' }, end: { 'index.html': 'B1', 'style.css': 'S' } },
  { id: 'c', start: {}, end: { 'style.css': 'S2' } },
];

test('課の始めは「前の課の終わり + この課の始めのファイル」、終わりはそこに「終わりのファイル」を重ねる', () => {
  assert.deepEqual(composeState(lessons, 0, 'start'), { 'index.html': 'A0' });
  assert.deepEqual(composeState(lessons, 0, 'end'), { 'index.html': 'A1' });
  assert.deepEqual(composeState(lessons, 1, 'start'), { 'index.html': 'A1', 'img/x.svg': 'X' });
  assert.deepEqual(composeState(lessons, 2, 'end'), { 'index.html': 'B1', 'img/x.svg': 'X', 'style.css': 'S2' });
});

test('課の文（Markdown の一部）を HTML にする。HTML の文字はそのまま見せる', () => {
  const html = renderMarkdown('## 目標\n\n**看板**を立てます。`<h1>` を使います。\n\n- 1 つめ\n- 2 つめ\n\n```html\n<p>a & b</p>\n```\n\n| キー | 動き |\n|---|---|\n| ↑ | アクセル |\n\n> ゲンさん「頼んだよ」');
  assert.ok(html.includes('<h2>目標</h2>'), html);
  assert.ok(html.includes('<strong>看板</strong>'), html);
  assert.ok(html.includes('<code>&lt;h1&gt;</code>'), html);
  assert.ok(html.includes('<ul><li>1 つめ</li><li>2 つめ</li></ul>'), html);
  assert.ok(html.includes('<pre class="code" data-lang="html"><code>&lt;p&gt;a &amp; b&lt;/p&gt;</code></pre>'), html);
  assert.ok(html.includes('<table><thead><tr><th>キー</th><th>動き</th></tr></thead><tbody><tr><td>↑</td><td>アクセル</td></tr></tbody></table>'), html);
  assert.ok(html.includes('<blockquote><p>ゲンさん「頼んだよ」</p></blockquote>'), html);
  assert.ok(!html.includes('<script'));
});

test('行の違い: 同じ行・消えた行・足した行を、元の順に並べる', () => {
  const diff = lineDiff('a\nb\nc', 'a\nB\nc\nd');
  assert.deepEqual(diff.map((d) => `${d.type}:${d.text}`), ['same:a', 'remove:b', 'add:B', 'same:c', 'add:d']);
});

test('確かめのスクリプト: 確かめの文と、課のファイルの中身を埋め込み、</script> を壊さない', () => {
  const script = checkerScript([{ label: 'h1', code: "return $('h1') !== null;" }], '/プロジェクト/夕暮れ峠', { 'a.js': 'x = "</script>";' });
  assert.ok(script.startsWith('<script type="module">') && script.endsWith('</script>'));
  assert.equal(script.match(/<\/script>/g).length, 1, '途中に </script> があると、そこでスクリプトが終わってしまう');
  assert.ok(script.includes('yugure-check'));
  assert.ok(captureScript().includes('__courseLogs'));
});

test('「:::answer」から「:::」までは、開くと見える答えの箱になる', () => {
  const html = renderMarkdown('### 1. 色を変える\n\n:::answer\n```css\nh1 { color: red; }\n```\n:::\n\nつぎ');
  assert.ok(html.includes('<details class="answer"><summary>答えを見る</summary>'), html);
  assert.ok(html.includes('h1 { color: red; }') && html.includes('</details>'), html);
  assert.ok(html.trim().endsWith('<p>つぎ</p>'), html);
});
