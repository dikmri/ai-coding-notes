// 本棚の計算（ZIP の目録、OPF と目次、相対パス、XHTML と CSS の消毒、しおりと位置の形、ページの向き、見本の本）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../os/js/core/books.mjs';
import { SAMPLES } from '../os/js/core/books-samples.mjs';
import { zipStore } from '../os/js/core/workshop.mjs';

const enc = new TextEncoder();
const u8 = (s) => enc.encode(s);
async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const zipBlob = (entries) => new Blob([zipStore(entries)]);

/* ---------- ZIP ---------- */
test('ZIP: 中央の目録を読み、そのまま入れた項目と deflate の項目の両方を取り出す', async () => {
  const big = 'あいうえお'.repeat(400);
  const blob = zipBlob([
    { name: 'mimetype', data: u8('application/epub+zip') },
    { name: 'OEBPS/本文.xhtml', data: u8(big), deflated: await deflate(u8(big)) },
  ]);
  const zip = await K.openZip(blob);
  assert.deepEqual(zip.names(), ['mimetype', 'OEBPS/本文.xhtml']);
  assert.equal(zip.has('OEBPS/本文.xhtml'), true);
  assert.equal(zip.has('nothing'), false);
  assert.equal(await zip.text('mimetype'), 'application/epub+zip');
  assert.equal(await zip.text('OEBPS/本文.xhtml'), big);
  assert.equal(zip.size('OEBPS/本文.xhtml'), u8(big).length);
  await assert.rejects(() => zip.bytes('nothing'), /見つかりません/);
});

test('ZIP: ZIP でないものと、壊れたものは日本語の誤りにする', async () => {
  await assert.rejects(() => K.openZip(new Blob([u8('これは ZIP ではありません')])), /ZIP/);
  const good = zipStore([{ name: 'a.txt', data: u8('abc') }]);
  const broken = good.slice(0, good.length - 30); // 中央の目録の途中で切る
  await assert.rejects(() => K.openZip(new Blob([broken])), /ZIP/);
});

test('ZIP: 書いてある大きさより大きく広がる項目（圧縮爆弾）と、CRC の合わない項目は読まない', async () => {
  const huge = new Uint8Array(200000).fill(65);
  const lie = zipBlob([{ name: 'bomb.txt', data: new Uint8Array(10), deflated: await deflate(huge) }]);
  const z1 = await K.openZip(lie);
  await assert.rejects(() => z1.bytes('bomb.txt'), /大きさ|壊れ/);
  const raw = zipStore([{ name: 'a.txt', data: u8('hello') }]);
  raw[30 + 5] ^= 0xff; // 中身の 1 文字を書き換える（CRC が合わなくなる）
  const z2 = await K.openZip(new Blob([raw]));
  await assert.rejects(() => z2.bytes('a.txt'), /壊れ/);
});

/* ---------- 相対パス ---------- */
test('相対パス: 本の中のファイルの場所を解き、外の住所と ZIP の外へ出るものは null', () => {
  const r = (b, h) => K.resolveHref(b, h);
  assert.deepEqual(r('OEBPS/text/c1.xhtml', 'c2.xhtml#s1'), { path: 'OEBPS/text/c2.xhtml', fragment: 's1' });
  assert.deepEqual(r('OEBPS/text/c1.xhtml', '../images/a%20b.png'), { path: 'OEBPS/images/a b.png', fragment: '' });
  assert.deepEqual(r('OEBPS/text/c1.xhtml', '#note'), { path: 'OEBPS/text/c1.xhtml', fragment: 'note' });
  assert.deepEqual(r('OEBPS/text/c1.xhtml', './x/./y.css'), { path: 'OEBPS/text/x/y.css', fragment: '' });
  assert.deepEqual(r('OEBPS/content.opf', '/OEBPS/a.xhtml'), { path: 'OEBPS/a.xhtml', fragment: '' });
  assert.deepEqual(r('c.xhtml', 'd.xhtml?x=1'), { path: 'd.xhtml', fragment: '' });
  assert.equal(r('OEBPS/c1.xhtml', '../../etc/passwd'), null);
  for (const bad of ['http://example.com/a.png', 'https://x/y', '//evil.example/a.css', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:image/png;base64,AA', 'file:///C:/a', 'mailto:a@b', '']) {
    assert.equal(r('OEBPS/c1.xhtml', bad), null, bad);
  }
  assert.equal(K.externalHref('https://example.com/a?b#c'), 'https://example.com/a?b#c');
  assert.equal(K.externalHref('mailto:a@example.com'), 'mailto:a@example.com');
  assert.equal(K.externalHref(' java\tscript:alert(1)'), null);
  assert.equal(K.externalHref('c2.xhtml'), null);
});

/* ---------- XML ---------- */
test('XML: 要素・属性・文字の参照・CDATA・コメント・名前空間の接頭辞を読む', () => {
  const doc = K.parseXml(`<?xml version="1.0"?><!DOCTYPE html [<!ENTITY x "y">]><!-- c --><a:root xmlns:a="u" b='1 > 0' c="&lt;&amp;&#x41;&#66;&quot;"><p>A &amp; B&nbsp;<![CDATA[<raw>]]></p><br/><img src="x"></a:root>`);
  const root = doc.children.find((n) => n.type === 'el');
  assert.equal(root.name, 'a:root');
  assert.equal(K.localName(root.name), 'root');
  assert.equal(root.attrs.b, '1 > 0');
  assert.equal(root.attrs.c, '<&AB"');
  const p = root.children[0];
  assert.equal(K.textOf(p), 'A & B\u00a0<raw>');
  assert.deepEqual(root.children.map((n) => n.name), ['p', 'br', 'img']);
});

test('XML: 閉じ忘れや余計な閉じタグがあっても止まらずに読む', () => {
  const doc = K.parseXml('<body><p>一<b>二</p><p>三</i></p></body>');
  const body = doc.children[0];
  assert.equal(body.children.length, 2);
  assert.equal(K.textOf(body), '一二三');
});

/* ---------- OPF と目次 ---------- */
const CONTAINER = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
const OPF3 = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="ja">
 <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="uid">urn:uuid:1234</dc:identifier>
  <dc:title>  雨の本  </dc:title>
  <dc:creator>山田 花子</dc:creator><dc:creator>鈴木 一郎</dc:creator>
  <dc:language>ja</dc:language>
 </metadata>
 <manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  <item id="cov" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
  <item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/>
  <item id="c2" href="text/c%202.xhtml" media-type="application/xhtml+xml"/>
 </manifest>
 <spine toc="ncx" page-progression-direction="rtl"><itemref idref="c1"/><itemref idref="c2" linear="no"/><itemref idref="missing"/></spine>
</package>`;

test('OPF: container.xml から OPF の場所、OPF から題名・著者・言語・表紙・並び・目次の場所を読む', () => {
  assert.equal(K.parseContainer(CONTAINER), 'OEBPS/content.opf');
  assert.throws(() => K.parseContainer('<container/>'), /OPF/);
  const o = K.parseOpf(OPF3, 'OEBPS/content.opf');
  assert.equal(o.title, '雨の本');
  assert.deepEqual(o.creators, ['山田 花子', '鈴木 一郎']);
  assert.equal(o.author, '山田 花子、鈴木 一郎');
  assert.equal(o.language, 'ja');
  assert.equal(o.identifier, 'urn:uuid:1234');
  assert.equal(o.ppd, 'rtl');
  assert.equal(o.cover, 'OEBPS/images/cover.jpg');
  assert.equal(o.nav, 'OEBPS/nav.xhtml');
  assert.equal(o.ncx, 'OEBPS/toc.ncx');
  assert.deepEqual(o.spine.map((s) => [s.path, s.linear]), [['OEBPS/text/c1.xhtml', true], ['OEBPS/text/c 2.xhtml', false]]);
  assert.equal(o.types['OEBPS/images/cover.jpg'], 'image/jpeg');
});

test('OPF: EPUB 2 の表紙（meta name="cover"）と、題名が無いときの代わり', () => {
  const opf2 = `<package version="2.0"><metadata><meta name="cover" content="img1"/></metadata><manifest><item id="img1" href="cov.png" media-type="image/png"/><item id="t" href="t.html" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="t"/></spine></package>`;
  const o = K.parseOpf(opf2, 'content.opf');
  assert.equal(o.cover, 'cov.png');
  assert.equal(o.title, '');
  assert.equal(o.ppd, '');
  assert.deepEqual(o.spine.map((s) => s.path), ['t.html']);
});

test('目次: nav.xhtml の入れ子の ol と、toc.ncx の navPoint を、深さ付きの平らな並びにする', () => {
  const nav = `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
    <nav epub:type="landmarks"><ol><li><a href="text/c1.xhtml">本文</a></li></ol></nav>
    <nav epub:type="toc"><h1>目次</h1><ol>
      <li><a href="text/c1.xhtml">第一章 <span>坂</span></a><ol><li><a href="text/c1.xhtml#s2">二の節</a></li></ol></li>
      <li><span>見出しだけ</span><ol><li><a href="text/c%202.xhtml">第二章</a></li></ol></li>
      <li><a href="http://example.com/">外のリンク</a></li>
    </ol></nav></body></html>`;
  assert.deepEqual(K.parseNav(nav, 'OEBPS/nav.xhtml'), [
    { label: '第一章 坂', path: 'OEBPS/text/c1.xhtml', fragment: '', depth: 0 },
    { label: '二の節', path: 'OEBPS/text/c1.xhtml', fragment: 's2', depth: 1 },
    { label: '見出しだけ', path: '', fragment: '', depth: 0 },
    { label: '第二章', path: 'OEBPS/text/c 2.xhtml', fragment: '', depth: 1 },
  ]);
  const ncx = `<ncx><navMap><navPoint id="a"><navLabel><text>一</text></navLabel><content src="t/a.html"/><navPoint id="b"><navLabel><text>一の一</text></navLabel><content src="t/a.html#x"/></navPoint></navPoint><navPoint id="c"><navLabel><text>二</text></navLabel><content src="t/b.html"/></navPoint></navMap></ncx>`;
  assert.deepEqual(K.parseNcx(ncx, 'OEBPS/toc.ncx'), [
    { label: '一', path: 'OEBPS/t/a.html', fragment: '', depth: 0 },
    { label: '一の一', path: 'OEBPS/t/a.html', fragment: 'x', depth: 1 },
    { label: '二', path: 'OEBPS/t/b.html', fragment: '', depth: 0 },
  ]);
});

test('本を読む: ZIP から container → OPF → 目次（nav が無ければ ncx）→ 章の大きさまでまとめる', async () => {
  const ncx = `<ncx><navMap><navPoint><navLabel><text>一章</text></navLabel><content src="text/c1.xhtml"/></navPoint></navMap></ncx>`;
  const opf = OPF3.replace('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '');
  const zip = await K.openZip(zipBlob([
    { name: 'mimetype', data: u8('application/epub+zip') },
    { name: 'META-INF/container.xml', data: u8(CONTAINER) },
    { name: 'OEBPS/content.opf', data: u8(opf) },
    { name: 'OEBPS/toc.ncx', data: u8(ncx) },
    { name: 'OEBPS/text/c1.xhtml', data: u8('<html><body><p>一</p></body></html>') },
    { name: 'OEBPS/text/c 2.xhtml', data: u8('<html><body><p>二二二二</p></body></html>') },
  ]));
  const b = await K.readBook(zip);
  assert.equal(b.title, '雨の本');
  assert.deepEqual(b.toc, [{ label: '一章', path: 'OEBPS/text/c1.xhtml', fragment: '', depth: 0 }]);
  assert.equal(b.spine.length, 2);
  assert.ok(b.spine[1].size > b.spine[0].size);
  assert.equal(b.cover, null); // 表紙のファイルが ZIP に無い
  assert.equal(b.drm, false);
  await assert.rejects(async () => K.readBook(await K.openZip(zipBlob([{ name: 'x.txt', data: u8('x') }]))), /container\.xml/);
});

/* ---------- XHTML の消毒 ---------- */
const BAD = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja" class="vrtl"><head>
<title>悪い章</title>
<meta http-equiv="refresh" content="0;url=http://evil.example/"/>
<base href="http://evil.example/"/>
<link rel="stylesheet" href="../style/book.css"/>
<link rel="stylesheet" href="http://evil.example/x.css"/>
<style>p { color: red; background: url(http://evil.example/bg.png); }</style>
<script>parent.pwned = 1</script>
</head><body class="main" onload="parent.pwned=2">
<h1 id="top" onclick="parent.pwned=3" style="color: blue; background-image: url('http://evil.example/a.png')">題</h1>
<p>A &lt;b&gt; <ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby></p>
<img src="../images/pic.png" alt="絵" onerror="parent.pwned=4" srcset="http://evil.example/2x.png 2x"/>
<img src="http://evil.example/track.png" alt="外の絵"/>
<a href="javascript:parent.pwned=5">悪いリンク</a>
<a href="c2.xhtml#n1">次の章へ</a> <a href="https://example.com/">外へ</a> <a href="#top">上へ</a>
<iframe src="http://evil.example/"></iframe><object data="x.swf">中身</object><form action="http://evil.example/"><input name="q"/></form>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><script>parent.pwned=6</script><image xlink:href="../images/pic.png" width="10" height="10"/><foreignObject><p>x</p></foreignObject><rect width="5" height="5" fill="url(http://evil.example/p.svg#g)" onload="parent.pwned=7"/></svg>
<font color="red">赤</font>
<math><mi>x</mi></math>
<template><p>t</p></template>
<noscript><img src="http://evil.example/ns.png"/></noscript>
</body></html>`;

function sanitizeBad() {
  const want = [];
  const res = K.sanitizeXhtml(BAD, { path: 'OEBPS/text/c1.xhtml', resource: (p) => { want.push(p); return p === 'OEBPS/images/pic.png' ? 'blob:http://127.0.0.1/pic' : null; } });
  return { res, want };
}

test('消毒: script・on〜 の属性・javascript: の URL・外への読み込みを全部落とす', () => {
  const { res } = sanitizeBad();
  const h = res.html;
  for (const bad of ['<script', 'onload', 'onclick', 'onerror', 'javascript:', 'evil.example', '<iframe', '<object', '<form', '<input', 'foreignObject', 'srcset', '<meta', '<base', '<template', '<noscript', 'pwned']) {
    assert.ok(!h.toLowerCase().includes(bad.toLowerCase()), `${bad} が残っている: ${h}`);
  }
});

test('消毒: 本の中の画像は渡した URL に、リンクは data 属性に、ルビと文字はそのまま残す', () => {
  const { res, want } = sanitizeBad();
  const h = res.html;
  assert.ok(want.includes('OEBPS/images/pic.png'));
  assert.match(h, /<img src="blob:http:\/\/127\.0\.0\.1\/pic" alt="絵">/);
  assert.match(h, /<image href="blob:http:\/\/127\.0\.0\.1\/pic" width="10" height="10"><\/image>/);
  assert.match(h, /<ruby>漢字<rp>\(<\/rp><rt>かんじ<\/rt><rp>\)<\/rp><\/ruby>/);
  assert.match(h, /A &lt;b&gt;/);
  assert.match(h, /<a href="#" data-bk-href="OEBPS\/text\/c2\.xhtml#n1">次の章へ<\/a>/);
  assert.match(h, /<a href="#" data-bk-ext="https:\/\/example\.com\/">外へ<\/a>/);
  assert.match(h, /<a href="#" data-bk-href="OEBPS\/text\/c1\.xhtml#top">上へ<\/a>/);
  assert.match(h, /<a>悪いリンク<\/a>/);
  assert.match(h, /<h1 id="top" style="color: blue">題<\/h1>/);
  assert.match(h, /赤/); // font は中身だけ残す
  assert.ok(!/<font/.test(h));
  assert.match(h, /<math><mi>x<\/mi><\/math>/);
  assert.match(h, /<rect width="5" height="5"><\/rect>/); // 外を指す fill は落とす
  assert.ok(!h.includes('外の絵')); // 外の画像は要素ごと落とす
});

test('消毒: html と body の言語・クラス、本の CSS の場所、head の style を取り出す', () => {
  const { res } = sanitizeBad();
  assert.equal(res.lang, 'ja');
  assert.equal(res.htmlClass, 'vrtl');
  assert.equal(res.bodyClass, 'main');
  assert.equal(res.title, '悪い章');
  assert.deepEqual(res.styles, ['OEBPS/style/book.css']);
  assert.equal(res.inlineCss.length, 1);
  assert.match(res.inlineCss[0], /color: red/);
});

test('消毒: 文字と属性の値は必ず逃がす（引用符や < で外へ出られない）', () => {
  const r = K.sanitizeXhtml('<html><body><p title="a&quot; onmouseover=&quot;x" class="&lt;b&gt;">&lt;/p&gt;&lt;script&gt;</p></body></html>', { path: 'a.xhtml', resource: () => null });
  assert.equal(r.html, '<p title="a&quot; onmouseover=&quot;x" class="&lt;b&gt;">&lt;/p&gt;&lt;script&gt;</p>');
});

/* ---------- CSS の消毒 ---------- */
test('CSS の消毒: @import・外の url()・position: fixed・expression などを落とし、本の中の url() は渡した URL にする', () => {
  const css = `@charset "utf-8";
@import url("http://evil.example/a.css");
@import "b.css";
/* コメント url(http://evil.example/c.png) */
html { -epub-writing-mode: vertical-rl; writing-mode: vertical-rl; }
.a { background: url(http://evil.example/x.png) no-repeat; color: #333; }
.b { background-image: url("../images/bg.png"); position: fixed; top: 0; }
.c { width: expression(alert(1)); behavior: url(x.htc); -moz-binding: url(x.xml#y); }
.d { background: u\\72l(http://evil.example/e.png); content: "\\201C"; }
.e { list-style-image: url(data:image/png;base64,AAAA); cursor: url(../images/c.cur), auto; }
.tcy { -epub-text-combine: horizontal; }
@font-face { font-family: "本の字"; src: url(../fonts/a.woff2) format("woff2"), url(http://evil.example/f.woff); }
@media (min-width: 100px) { .f { position: sticky; color: green; } }
@page { margin: 0; }
@namespace epub "http://www.idpf.org/2007/ops";
.g{color:blue}`;
  const out = K.sanitizeCss(css, { path: 'OEBPS/style/book.css', resource: (p) => (['OEBPS/images/bg.png', 'OEBPS/fonts/a.woff2'].includes(p) ? `blob:x/${p.split('/').pop()}` : null) });
  for (const bad of ['@import', 'evil.example', 'fixed', 'sticky', 'expression', 'behavior', 'binding', '\\72', '@page', 'c.cur', '/*']) {
    assert.ok(!out.includes(bad), `${bad} が残っている:\n${out}`);
  }
  assert.match(out, /html \{ writing-mode: vertical-rl; writing-mode: vertical-rl; \}/);
  assert.match(out, /\.a \{ color: #333; \}/);
  assert.match(out, /\.b \{ background-image: url\("blob:x\/bg\.png"\); top: 0; \}/);
  assert.match(out, /content: "\\201C"/);
  assert.match(out, /list-style-image: url\("data:image\/png;base64,AAAA"\)/);
  assert.match(out, /\.tcy \{ text-combine-upright: all; \}/);
  assert.match(out, /@font-face \{ font-family: "本の字"; \}/); // 外の字が混ざった src は丸ごと落とす
  assert.match(out, /@media \(min-width: 100px\) \{\n\.f \{ color: green; \}\n\}/);
  assert.match(out, /\.g \{ color: blue; \}/);
});

test('CSS の消毒: style 属性の宣言だけを消毒する', () => {
  assert.equal(K.sanitizeStyleAttr('color: red; position:fixed; background:url(http://x/y)', { path: 'a.xhtml', resource: () => null }), 'color: red');
  assert.equal(K.sanitizeStyleAttr('', { path: 'a.xhtml', resource: () => null }), '');
});

/* ---------- しおりと位置の形 ---------- */
test('保存の形: 壊れた中身は既定に戻し、範囲の外の数は丸め、形の合わないしおりと位置は捨てる', () => {
  const d = K.normalizeState(null);
  assert.equal(d.version, 1);
  assert.deepEqual(d.prefs, K.DEFAULT_PREFS);
  assert.deepEqual(d.books, {});
  const s = K.normalizeState({
    prefs: { fontSize: 999, lineHeight: 'x', margin: 'huge', font: 'gothic', theme: 'night', bookCss: false, view: 'list', sort: 'title', flow: 'vertical', extra: 1 },
    books: {
      'id:a': { pos: { path: 'OEBPS/c1.xhtml', progress: 1.5 }, last: 100, marks: [
        { id: 'm1', path: 'OEBPS/c1.xhtml', progress: 0.5, label: 'ここ', time: 5 },
        { id: 'm2', path: 42, progress: 0.1 },
        { id: 'm3', path: 'OEBPS/c2.xhtml', progress: -3, label: 'x'.repeat(500), time: 6 },
      ] },
      'id:b': { pos: { path: '', progress: 0.2 }, marks: 'no' },
      'id:c': 'broken',
    },
  });
  assert.equal(s.prefs.fontSize, K.LIMITS.fontSize[1]);
  assert.equal(s.prefs.lineHeight, K.DEFAULT_PREFS.lineHeight);
  assert.equal(s.prefs.margin, K.DEFAULT_PREFS.margin);
  assert.equal(s.prefs.font, 'gothic');
  assert.equal(s.prefs.theme, 'night');
  assert.equal(s.prefs.bookCss, false);
  assert.equal(s.prefs.flow, 'vertical');
  assert.equal('extra' in s.prefs, false);
  assert.deepEqual(s.books['id:a'].pos, { path: 'OEBPS/c1.xhtml', progress: 1 });
  assert.deepEqual(s.books['id:a'].marks.map((m) => m.id), ['m1', 'm3']);
  assert.equal(s.books['id:a'].marks[1].progress, 0);
  assert.equal(s.books['id:a'].marks[1].label.length, 120);
  assert.equal(s.books['id:b'].pos, null);
  assert.deepEqual(s.books['id:b'].marks, []);
  assert.equal('id:c' in s.books, false);
  assert.equal(K.validMark({ id: 'x', path: 'a', progress: 0.3, label: '', time: 1 }), true);
  assert.equal(K.validMark({ id: 'x', path: 'a', progress: NaN }), false);
});

test('しおり: 足すと本の中の順に並び、同じ位置は二重にしない。消すと無くなる', () => {
  const order = ['a.xhtml', 'b.xhtml'];
  let marks = [];
  marks = K.addMark(marks, { id: '1', path: 'b.xhtml', progress: 0.2, label: 'B', time: 1 }, order);
  marks = K.addMark(marks, { id: '2', path: 'a.xhtml', progress: 0.9, label: 'A', time: 2 }, order);
  marks = K.addMark(marks, { id: '3', path: 'b.xhtml', progress: 0.2, label: 'B2', time: 3 }, order);
  assert.deepEqual(marks.map((m) => m.id), ['2', '1']);
  marks = K.removeMark(marks, '2');
  assert.deepEqual(marks.map((m) => m.id), ['1']);
});

test('本の鍵: 識別子と題名があればそれで、無ければファイルの場所で', () => {
  assert.equal(K.bookKey({ identifier: 'urn:x', title: 'T' }, '/本/a.epub'), 'id:urn:x|T');
  assert.equal(K.bookKey({ identifier: '', title: 'T' }, '/本/a.epub'), 'path:/本/a.epub');
});

/* ---------- ページの向き ---------- */
test('ページ: 横書きは → が次、縦書き（右から左）は ← が次。PageDown・Space・↓ はどちらも次', () => {
  const ltr = (k, o) => K.pageKeyAction(k, false, o);
  const rtl = (k, o) => K.pageKeyAction(k, true, o);
  assert.equal(ltr('ArrowRight'), 'next');
  assert.equal(ltr('ArrowLeft'), 'prev');
  assert.equal(rtl('ArrowLeft'), 'next');
  assert.equal(rtl('ArrowRight'), 'prev');
  for (const f of [ltr, rtl]) {
    assert.equal(f('PageDown'), 'next'); assert.equal(f(' '), 'next'); assert.equal(f('ArrowDown'), 'next');
    assert.equal(f('PageUp'), 'prev'); assert.equal(f(' ', { shift: true }), 'prev'); assert.equal(f('ArrowUp'), 'prev');
    assert.equal(f('Home'), 'first'); assert.equal(f('End'), 'last');
    assert.equal(f('a'), null);
    assert.equal(f('ArrowRight', { ctrl: true }), null); // 修飾キー付きは OS とブラウザに任せる
  }
  assert.equal(K.clickAction(10, 600, false), 'prev');
  assert.equal(K.clickAction(590, 600, false), 'next');
  assert.equal(K.clickAction(10, 600, true), 'next');
  assert.equal(K.clickAction(590, 600, true), 'prev');
});

test('ページ: 章の中の割合とページ番号を行き来でき、本全体の進み具合は章の大きさで重みを付ける', () => {
  assert.equal(K.progressAt(0, 5), 0);
  assert.equal(K.progressAt(4, 5), 1);
  assert.equal(K.progressAt(0, 1), 0);
  for (const pages of [1, 2, 3, 7, 50]) for (let p = 0; p < pages; p++) assert.equal(K.pageAt(K.progressAt(p, pages), pages), p);
  assert.equal(K.pageAt(0.5, 3), 1);
  assert.equal(K.pageAt(2, 3), 2);
  assert.equal(K.pageAt(-1, 3), 0);
  assert.equal(K.bookProgress([100, 300], 0, 0), 0);
  assert.equal(K.bookProgress([100, 300], 0, 1), 0.25);
  assert.equal(K.bookProgress([100, 300], 1, 0.5), 0.625);
  assert.equal(K.bookProgress([100, 300], 1, 1), 1);
  assert.equal(K.bookProgress([], 0, 0), 0);
});

/* ---------- 並べ替えと探す ---------- */
test('本棚: 題名・著者・最近読んだ順に並べ、ひらがなとカタカナ、全角と半角を区別せずに探す', () => {
  const list = [
    { path: '/本/1.epub', title: 'ゆうぐれ', author: '佐藤', last: 0 },
    { path: '/本/2.epub', title: 'あさやけ', author: '伊藤', last: 300 },
    { path: '/本/3.epub', title: 'Ｂｏｏｋ 10', author: 'うえだ', last: 100 },
    { path: '/本/4.epub', title: 'Book 9', author: 'うえだ', last: 0 },
  ];
  assert.deepEqual(K.sortBooks(list, 'title').map((b) => b.path), ['/本/4.epub', '/本/3.epub', '/本/2.epub', '/本/1.epub']);
  assert.deepEqual(K.sortBooks(list, 'recent').map((b) => b.path), ['/本/2.epub', '/本/3.epub', '/本/4.epub', '/本/1.epub']);
  assert.deepEqual(K.sortBooks(list, 'author').map((b) => b.author), ['うえだ', 'うえだ', '伊藤', '佐藤']);
  assert.notEqual(K.sortBooks(list, 'title'), list); // 元の並びは変えない
  assert.deepEqual(K.filterBooks(list, 'ユウグレ').map((b) => b.path), ['/本/1.epub']);
  assert.deepEqual(K.filterBooks(list, 'book').map((b) => b.path), ['/本/3.epub', '/本/4.epub']);
  assert.deepEqual(K.filterBooks(list, 'ウエダ').length, 2);
  assert.equal(K.filterBooks(list, '  ').length, 4);
});

/* ---------- 見本の本 ---------- */
test('見本の本: EPUB の形で作り、読み直すと題名・向き・目次・表紙・ルビが揃っている', async () => {
  assert.equal(SAMPLES.length, 2);
  const books = [];
  for (const s of SAMPLES) {
    const bytes = await K.makeEpub(s, { deflate });
    const zip = await K.openZip(new Blob([bytes]));
    assert.equal(zip.names()[0], 'mimetype');
    assert.equal(await zip.text('mimetype'), 'application/epub+zip');
    const b = await K.readBook(zip);
    assert.equal(b.title, s.title);
    assert.equal(b.author, s.author);
    assert.ok(b.cover && zip.has(b.cover), '表紙がある');
    assert.equal(b.toc.length, s.chapters.length);
    assert.equal(b.spine.length, s.chapters.length);
    for (const it of b.spine) {
      const r = K.sanitizeXhtml(await zip.text(it.path), { path: it.path, resource: (p) => (zip.has(p) ? 'blob:ok' : null) });
      assert.ok(r.html.length > 200, '章に本文がある');
      assert.ok(!r.html.includes('blob:ok') || r.html.includes('src="blob:ok"'), '画像は本の中のもの');
    }
    books.push({ b, zip });
  }
  const [guide, story] = books;
  assert.equal(guide.b.ppd, 'ltr');
  assert.equal(story.b.ppd, 'rtl');
  assert.equal(story.b.language, 'ja');
  const first = await story.zip.text(story.b.spine[0].path);
  assert.match(K.sanitizeXhtml(first, { path: story.b.spine[0].path, resource: () => null }).html, /<ruby>[^<]+<rp>（<\/rp><rt>[^<]+<\/rt><rp>）<\/rp><\/ruby>/);
  const css = await story.zip.text(story.b.spine[0].path.replace(/text\/.*$/, 'style.css'));
  assert.match(K.sanitizeCss(css, { path: 'OEBPS/style.css', resource: () => null }), /writing-mode: vertical-rl/);
});
