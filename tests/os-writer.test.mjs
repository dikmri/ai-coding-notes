// 文書（ワープロ）の計算のテスト: 開くときの消毒、Markdown とテキストへの変換、文字数の数え方、
// 検索、保存の形（.fdoc）の作り方と検証、HTML の書き出し
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../os/js/core/writer.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* ---------- 消毒 ---------- */
test('消毒: script と style は中身ごと消える', () => {
  assert.equal(W.sanitize('<p>a</p><script>alert(1)</script><style>p{color:red}</style><p>b</p>'), '<p>a</p><p>b</p>');
  // script の中の文字は HTML として読まない（中に書いた要素が出てこない）
  assert.equal(W.sanitize('<script>"</p><img src=x onerror=alert(1)>"</script><p>ok</p>'), '<p>ok</p>');
  assert.equal(W.sanitize('<SCRIPT type="module">x</SCRIPT ><p>ok</p>'), '<p>ok</p>');
});

test('消毒: on で始まる属性・id・class・data- は落ちる', () => {
  assert.equal(W.sanitize('<p onclick="alert(1)" id="a" class="b" data-x="1">x</p>'), '<p>x</p>');
  assert.equal(W.sanitize('<p ONMOUSEOVER=alert(1)>x</p>'), '<p>x</p>');
});

test('消毒: javascript: のリンクは文字だけ残る（リンクの要素は持たない）', () => {
  assert.equal(W.sanitize('<p><a href="javascript:alert(1)">押す</a></p>'), '<p>押す</p>');
  assert.equal(W.sanitize('<p><a href="https://example.com/">外</a></p>'), '<p>外</p>');
});

test('消毒: 画像は data: の画像だけ。外の URL・javascript:・onerror は落ちる', () => {
  assert.equal(W.sanitize(`<p><img src="${PNG}" alt="点" onerror="alert(1)"></p>`), `<p><img src="${PNG}" alt="点"></p>`);
  assert.equal(W.sanitize('<p>a<img src="https://example.com/x.png">b</p>'), '<p>ab</p>');
  assert.equal(W.sanitize('<p>a<img src="javascript:alert(1)">b</p>'), '<p>ab</p>');
  assert.equal(W.sanitize('<p>a<img src="data:text/html;base64,PHNjcmlwdD4=">b</p>'), '<p>ab</p>');
  assert.equal(W.sanitize('<p><img src=x onerror=alert(1)></p>'), '<p><br></p>');
});

test('消毒: 画面の中で使う blob: の画像は、呼んだ側が許したものだけ残す', () => {
  const ok = (src) => src === 'blob:http://127.0.0.1/abc';
  assert.equal(W.sanitize('<p><img src="blob:http://127.0.0.1/abc"></p>', { imageSrc: ok }), '<p><img src="blob:http://127.0.0.1/abc"></p>');
  assert.equal(W.sanitize('<p>a<img src="blob:http://127.0.0.1/zzz"></p>', { imageSrc: ok }), '<p>a</p>');
  assert.equal(W.sanitize('<p>a<img src="blob:http://127.0.0.1/abc"></p>'), '<p>a</p>');
  // 許す関数があっても、javascript: は通さない
  assert.equal(W.sanitize('<p>a<img src="javascript:alert(1)"></p>', { imageSrc: () => true }), '<p>a</p>');
});

test('消毒: 画面で使う決まり（残す style の性質）を出す', () => {
  assert.deepEqual(W.STYLE_PROPS.span, ['color', 'background-color']);
  assert.deepEqual(W.STYLE_PROPS.p, ['text-align']);
  assert.ok(W.ALLOWED.includes('strong') && !W.ALLOWED.includes('script') && !W.ALLOWED.includes('a'));
});

test('消毒: 画像の幅は % か px の数だけ残し、範囲に収める', () => {
  assert.equal(W.sanitize(`<p><img src="${PNG}" style="width: 50%; position:fixed"></p>`), `<p><img src="${PNG}" style="width:50%"></p>`);
  assert.equal(W.sanitize(`<p><img src="${PNG}" style="width:500%"></p>`), `<p><img src="${PNG}" style="width:100%"></p>`);
  assert.equal(W.sanitize(`<p><img src="${PNG}" style="width:expression(alert(1))"></p>`), `<p><img src="${PNG}"></p>`);
});

test('消毒: style は決まった性質と値だけ残す', () => {
  assert.equal(W.sanitize('<p style="text-align:center; color:red">x</p>'), '<p style="text-align:center">x</p>');
  assert.equal(W.sanitize('<p style="text-align:url(javascript:1)">x</p>'), '<p>x</p>');
  assert.equal(W.sanitize('<p><span style="color:#ff0000;background-color:rgb(255, 255, 0);font-size:90px">x</span></p>'),
    '<p><span style="color:#ff0000;background-color:rgb(255, 255, 0)">x</span></p>');
  // 色の値に別の性質や URL を混ぜても残らない
  assert.equal(W.sanitize('<p><span style="color: red; background: url(https://e.com/a)">x</span></p>'), '<p><span style="color:red">x</span></p>');
  assert.equal(W.sanitize('<p><span style="color:#12345">x</span></p>'), '<p>x</p>');
  // 何も残らない span は外す
  assert.equal(W.sanitize('<p><span>a</span><span class="x">b</span></p>'), '<p>ab</p>');
});

test('消毒: 同じ意味の要素はそろえる（b→strong、i→em、strike・del→s、h4〜h6→h3）', () => {
  assert.equal(W.sanitize('<p><b>a</b><i>b</i><strike>c</strike><del>d</del></p>'), '<p><strong>a</strong><em>b</em><s>c</s><s>d</s></p>');
  assert.equal(W.sanitize('<h5>見出し</h5>'), '<h3>見出し</h3>');
});

test('消毒: 一番外の文字は段落に入れる。div は段落にする', () => {
  assert.equal(W.sanitize('こんにちは<b>世界</b>'), '<p>こんにちは<strong>世界</strong></p>');
  assert.equal(W.sanitize('<div>一</div><div>二</div>'), '<p>一</p><p>二</p>');
  assert.equal(W.sanitize('<div><p>a</p><p>b</p></div>'), '<p>a</p><p>b</p>');
  assert.equal(W.sanitize(''), '<p><br></p>');
});

test('消毒: 空の段落と表のマスには <br> を入れる（書ける場所を残す）', () => {
  assert.equal(W.sanitize('<p></p><h1></h1>'), '<p><br></p><h1><br></h1>');
  assert.equal(W.sanitize('<table><tr><td></td><td>x</td></tr></table>'), '<table><tbody><tr><td><br></td><td>x</td></tr></tbody></table>');
});

test('消毒: 閉じ忘れと、要らない閉じタグを直す', () => {
  assert.equal(W.sanitize('<p>a<p>b'), '<p>a</p><p>b</p>');
  assert.equal(W.sanitize('<ul><li>a<li>b</ul>'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(W.sanitize('<p>a</strong></em>b</p>'), '<p>ab</p>');
  assert.equal(W.sanitize('<p><strong>a<em>b</p>'), '<p><strong>a<em>b</em></strong></p>');
});

test('消毒: 引用やマスの中で段落と文字が混ざったら、文字も段落に入れる。空の飾りは消す', () => {
  assert.equal(W.sanitize('<blockquote>前<p>段落</p></blockquote>'), '<blockquote><p>前</p><p>段落</p></blockquote>');
  assert.equal(W.sanitize('<blockquote>文だけ</blockquote>'), '<blockquote>文だけ</blockquote>');
  assert.equal(W.sanitize('<ul><li>親<ul><li>子</li></ul></li></ul>'), '<ul><li>親<ul><li>子</li></ul></li></ul>');
  assert.equal(W.sanitize('<p><strong></strong>x<em> </em></p>'), '<p>x<em> </em></p>');
  assert.equal(W.sanitize('<p> \n </p>'), '<p><br></p>');
});

test('消毒: 列の外の li は段落に、表の外の tr・td は中身だけにする', () => {
  assert.equal(W.sanitize('<li>a</li>'), '<p>a</p>');
  assert.equal(W.sanitize('<td>a</td>'), '<p>a</p>');
});

test('消毒: 文字の中の記号は逃がし、文字参照は読む', () => {
  assert.equal(W.sanitize('<p>a &lt;b&gt; &amp; &quot;c&quot; &#x3042;&#12354;&nbsp;</p>'), '<p>a &lt;b&gt; &amp; "c" ああ\u00A0</p>');
  assert.equal(W.sanitize('<p>1 < 2 > 0</p>'), '<p>1 &lt; 2 &gt; 0</p>');
  assert.equal(W.sanitize('<p title="a&quot;b">x</p>'), '<p>x</p>');
});

test('消毒: コメント・doctype・svg・iframe・form の部品は残らない', () => {
  assert.equal(W.sanitize('<!doctype html><!-- <script>x</script> --><p>a</p>'), '<p>a</p>');
  assert.equal(W.sanitize('<p>a<svg><script>alert(1)</script></svg>b</p>'), '<p>ab</p>');
  assert.equal(W.sanitize('<iframe src="https://e.com"></iframe><p>a</p>'), '<p>a</p>');
  assert.equal(W.sanitize('<p>a<input value="x" onfocus="alert(1)" autofocus>b<textarea><p>c</p></textarea></p>'), '<p>ab</p>');
});

test('消毒: 2 回かけても同じ（消毒した結果は安定している）', () => {
  const once = W.sanitize(W.SAMPLE_HTML);
  assert.equal(W.sanitize(once), once);
  assert.equal(once, W.SAMPLE_HTML);
});

test('消毒: とても深い入れ子でも止まらない', () => {
  const deep = '<span>'.repeat(5000) + 'x' + '</span>'.repeat(5000);
  assert.equal(W.sanitize(deep), '<p>x</p>');
  const deepB = '<strong>'.repeat(3000) + 'y';
  assert.match(W.sanitize(deepB), /y/);
});

/* ---------- Markdown ---------- */
test('Markdown: 見出し・段落・太字・斜体・取り消し線・コード', () => {
  const md = W.toMarkdown('<h1>題</h1><h2>章</h2><h3>節</h3><p>これは<strong>太字</strong>と<em>斜体</em>と<s>線</s>と<code>a`b</code>です。</p>');
  assert.equal(md, '# 題\n\n## 章\n\n### 節\n\nこれは**太字**と*斜体*と~~線~~と``a`b``です。\n');
});

test('Markdown: 箇条書きと番号付き', () => {
  assert.equal(W.toMarkdown('<ul><li>一</li><li>二</li></ul><ol><li>甲</li><li>乙</li></ol>'), '- 一\n- 二\n\n1. 甲\n2. 乙\n');
  assert.equal(W.toMarkdown('<ul><li>親<ul><li>子</li></ul></li></ul>'), '- 親\n  - 子\n');
});

test('Markdown: 表は 1 行目を見出しの行にし、| を逃がす', () => {
  const md = W.toMarkdown('<table><tbody><tr><td>キー</td><td>働き</td></tr><tr><td>a|b</td><td><strong>太</strong></td></tr></tbody></table>');
  assert.equal(md, '| キー | 働き |\n| --- | --- |\n| a\\|b | **太** |\n');
});

test('Markdown: 引用・区切り線・コードの段落・改行', () => {
  assert.equal(W.toMarkdown('<blockquote>引用の文<br>次の行</blockquote><hr><pre>let a = 1;\nlet b = 2;</pre>'),
    '> 引用の文  \n> 次の行\n\n---\n\n```\nlet a = 1;\nlet b = 2;\n```\n');
  assert.equal(W.toMarkdown('<pre>```\nx</pre>'), '````\n```\nx\n````\n');
});

test('Markdown: 記号は逃がし、強調の内側の空白は外へ出す', () => {
  assert.equal(W.toMarkdown('<p># 見出しではない *星* [括弧]</p>'), '\\# 見出しではない \\*星\\* \\[括弧\\]\n');
  assert.equal(W.toMarkdown('<p>1. 番号ではない</p>'), '1\\. 番号ではない\n');
  assert.equal(W.toMarkdown('<p>a<strong> b </strong>c</p>'), 'a **b** c\n');
  assert.equal(W.toMarkdown('<p><strong></strong>x</p>'), 'x\n');
});

test('Markdown: 画像は data: のまま、下線は <u>、色は文字だけ', () => {
  assert.equal(W.toMarkdown(`<p><img src="${PNG}" alt="点"></p>`), `![点](${PNG})\n`);
  assert.equal(W.toMarkdown('<p><u>下</u><span style="color:red">赤</span><mark>蛍</mark></p>'), '<u>下</u>赤蛍\n');
});

/* ---------- テキスト ---------- */
test('テキスト: 段落ごとに 1 行。箇条書きと表も文字にする', () => {
  assert.equal(W.toText('<h1>題</h1><p>本文<br>二行目</p><ul><li>一</li></ul><ol><li>甲</li></ol><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table><hr><p><br></p>'),
    '題\n本文\n二行目\n・一\n1. 甲\na\tb\n――――――――\n\n');
});

test('段落の文字の一覧: 段落・見出し・項目・マスごと', () => {
  assert.deepEqual(W.blockTexts('<h1>題</h1><p>a<strong>b</strong></p><ul><li>c</li></ul><table><tbody><tr><td>d</td></tr></tbody></table><p><br></p>'), ['題', 'ab', 'c', 'd', '']);
});

/* ---------- 文字数 ---------- */
test('文字数: 改行は数えず、空白を除く数も出す。段落は文字のあるものだけ', () => {
  assert.deepEqual(W.countText(['あい う', 'ab\tc', '', '\u3000']), { chars: 9, noSpace: 6, paragraphs: 2 });
  assert.deepEqual(W.countText(['一\n二']), { chars: 2, noSpace: 2, paragraphs: 1 });
});

test('文字数: 絵文字や結合した文字は 1 文字として数える', () => {
  assert.deepEqual(W.countText(['👍🏽が', '\u304B\u3099']), { chars: 3, noSpace: 3, paragraphs: 2 });
});

/* ---------- 検索 ---------- */
test('検索: 見つかった位置の一覧。大文字と小文字は既定で区別しない', () => {
  assert.deepEqual(W.findAll('Abc abc ABC', 'abc'), [[0, 3], [4, 7], [8, 11]]);
  assert.deepEqual(W.findAll('Abc abc ABC', 'abc', { caseSensitive: true }), [[4, 7]]);
  assert.deepEqual(W.findAll('ああああ', 'ああ'), [[0, 2], [2, 4]]);
  assert.deepEqual(W.findAll('abc', ''), []);
});

/* ---------- 保存の形 ---------- */
test('.fdoc: 作って読み直すと同じ中身と設定に戻る', () => {
  const text = W.makeFdoc({ html: '<h1>題</h1><p>本文</p>', settings: { writing: 'vertical', fontSize: 12, lineHeight: 2 } });
  const j = JSON.parse(text);
  assert.equal(j.format, 'future-os-fdoc');
  assert.equal(j.version, 1);
  assert.deepEqual(W.parseFdoc(text), { html: '<h1>題</h1><p>本文</p>', settings: { writing: 'vertical', fontSize: 12, lineHeight: 2 } });
});

test('.fdoc: 開くときに中身を消毒する', () => {
  const bad = JSON.stringify({ format: 'future-os-fdoc', version: 1, settings: {}, html: '<p onclick="x()">a</p><script>alert(1)</script><img src="https://e.com/a.png" onerror="alert(2)">' });
  assert.deepEqual(W.parseFdoc(bad), { html: '<p>a</p>', settings: W.DEFAULT_SETTINGS });
});

test('.fdoc: 設定の値は範囲に収め、知らない値は既定にする', () => {
  assert.deepEqual(W.normalizeSettings({ writing: 'diagonal', fontSize: 99, lineHeight: 0.2, extra: 1 }), { writing: 'horizontal', fontSize: 20, lineHeight: 1.2 });
  assert.deepEqual(W.normalizeSettings({ fontSize: '12', lineHeight: 'x' }), { ...W.DEFAULT_SETTINGS, fontSize: 12 });
  assert.deepEqual(W.normalizeSettings(null), W.DEFAULT_SETTINGS);
});

test('.fdoc: 形の違うファイルは分かる言葉の誤りにする', () => {
  assert.throws(() => W.parseFdoc('これは JSON ではない'), /文書のファイルとして読めません/);
  assert.throws(() => W.parseFdoc('{"format":"future-os-lpm","version":1}'), /文書のファイルではありません/);
  assert.throws(() => W.parseFdoc('{"format":"future-os-fdoc","version":9,"html":""}'), /新しい版/);
  assert.throws(() => W.parseFdoc('{"format":"future-os-fdoc","version":1,"html":5}'), /本文がありません/);
});

/* ---------- HTML の書き出し ---------- */
test('HTML の書き出し: 1 つのファイルに、紙の大きさと印刷の決まりと本文を入れる', () => {
  const h = W.buildHtml({ title: '<題>', html: '<p>本文</p>', settings: { writing: 'vertical', fontSize: 12, lineHeight: 2 } });
  assert.match(h, /^<!doctype html>/);
  assert.match(h, /<html lang="ja">/);
  assert.match(h, /<title>&lt;題&gt;<\/title>/);
  assert.match(h, /@page\s*\{\s*size:\s*A4 portrait/);
  assert.match(h, /writing-mode:\s*vertical-rl/);
  assert.match(h, /font-size:\s*12pt/);
  assert.match(h, /<body>\s*<p>本文<\/p>\s*<\/body>/);
  assert.doesNotMatch(W.buildHtml({ title: 'a', html: '<p>x</p>', settings: {} }), /vertical-rl/);
});

test('HTML の書き出し: 本文も消毒してから入れる', () => {
  assert.doesNotMatch(W.buildHtml({ title: 'a', html: '<p>x</p><script>alert(1)</script>', settings: {} }), /<script/);
});

test('見本の文書: 見出し・箇条書き・表・引用を含み、消毒しても変わらない', () => {
  assert.match(W.SAMPLE_HTML, /<h1>/);
  assert.match(W.SAMPLE_HTML, /<ul>/);
  assert.match(W.SAMPLE_HTML, /<table>/);
  assert.match(W.SAMPLE_HTML, /<blockquote>/);
});
