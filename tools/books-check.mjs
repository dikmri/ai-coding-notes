// 本棚（os/js/apps/books.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// 見本の本を作って並ぶ・一覧と探すと並べ替え・横書きと縦書きの本のページめくり（縦書きは ← が次）・目次で飛ぶ・本の中のリンク・
// しおり・表示の設定・閉じて開き直すと読んだ位置から・「本を足す」で取り込む・悪い EPUB を開いても何も動かず外へも読みに行かない。
// 確かめ専用の Chrome のプロファイル（runtime/books-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8804 を動かしてから、node tools/books-check.mjs [番号=8804]
//   画面の写真は build/books-check/、結果は logs/books-check.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';
import * as K from '../os/js/core/books.mjs';
import { SAMPLES } from '../os/js/core/books-samples.mjs';
import { zipStore } from '../os/js/core/workshop.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8804;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'books-check');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 確かめに使う EPUB を作る（取り込みの見本と、悪い本） ---------- */
const enc = new TextEncoder();
async function deflate(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); }
const importPath = join(OUT, '取り込みの確かめ.epub');
writeFileSync(importPath, await K.makeEpub({ ...SAMPLES[0], id: 'urn:arcadia:books:check-import', title: '取り込みの確かめ', author: '確かめ係' }, { deflate }));
const junkPath = join(OUT, '壊れた本.epub');
writeFileSync(junkPath, enc.encode('これは EPUB ではありません'));
const EVIL = `http://127.0.0.1:${PORT}/__evil`;
const badXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja"><head><title>悪い章</title>
<meta http-equiv="refresh" content="0;url=${EVIL}/refresh"/>
<base href="${EVIL}/"/>
<link rel="stylesheet" href="../style.css"/>
<link rel="stylesheet" href="${EVIL}/link.css"/>
<script>parent.__pwned = 'head'; top.__pwned = 'head';</script>
<style>@import url("${EVIL}/import2.css"); body { background: url(${EVIL}/bg2.png); }</style>
</head><body onload="parent.__pwned='onload'">
<h1 onclick="parent.__pwned='click'">悪い本の確かめ</h1>
<p>この本には、スクリプトと外への読み込みが仕込んであります。何も起きなければ正しく止まっています。</p>
<img src="${EVIL}/track.png" alt="外の画像"/>
<img src="../images/missing.png" onerror="parent.__pwned='onerror'" alt="無い画像"/>
<img src="/__evil/root.png" alt="根からの画像"/>
<p style="background-image: url('${EVIL}/style-attr.png'); position: fixed">固定の段落</p>
<p><a id="jslink" href="javascript:parent.__pwned='js'">押しても何も起きないリンク</a> <a href="${EVIL}/page">外のリンク</a></p>
<iframe src="${EVIL}/frame"></iframe><object data="${EVIL}/obj.swf">オブジェクト</object><embed src="${EVIL}/emb"/>
<form action="${EVIL}/form"><input name="q" value="x"/><button>送る</button></form>
<video src="${EVIL}/v.mp4" poster="${EVIL}/poster.png"></video><audio src="${EVIL}/a.mp3"></audio>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="40" height="40"><script>parent.__pwned='svg'</script><image xlink:href="${EVIL}/svgimg.png" width="40" height="40"/><use href="${EVIL}/sprite.svg#a"/><animate attributeName="href" to="javascript:parent.__pwned=1"/><rect width="20" height="20" fill="url(${EVIL}/fill.svg#g)"/></svg>
<math><maction actiontype="statusline"><mtext>x</mtext><mtext>y</mtext></maction></math>
<noscript><img src="${EVIL}/noscript.png"/></noscript><template><img src="${EVIL}/tpl.png"/></template>
<p>最後の段落です。</p>
</body></html>`;
const badCss = `@import url("${EVIL}/import.css");
body { background: url(${EVIL}/bg.png); }
p { position: fixed; color: #333; }
@font-face { font-family: x; src: url(${EVIL}/font.woff); }
h1 { background: u\\72l(${EVIL}/escaped.png); }`;
const badCover = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><script>parent.__pwned='cover'</script><rect width="300" height="450" fill="#ff5c97"/><image href="${EVIL}/cover.png" width="300" height="450"/><text x="20" y="200" font-size="40">悪い本</text></svg>`;
const OPF = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="u"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="u">urn:arcadia:books:check-evil</dc:identifier><dc:title>悪い本</dc:title><dc:creator>確かめ係</dc:creator><dc:language>ja</dc:language></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cov" href="images/cover.svg" media-type="image/svg+xml" properties="cover-image"/><item id="css" href="style.css" media-type="text/css"/><item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="c1"/></spine></package>`;
const NAV = `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/c1.xhtml">悪い章</a></li><li><a href="javascript:parent.__pwned='toc'">悪い目次</a></li></ol></nav></body></html>`;
const evilPath = join(OUT, '悪い本.epub');
writeFileSync(evilPath, zipStore([
  { name: 'mimetype', data: enc.encode('application/epub+zip') },
  { name: 'META-INF/container.xml', data: enc.encode('<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>') },
  { name: 'OEBPS/content.opf', data: enc.encode(OPF) },
  { name: 'OEBPS/nav.xhtml', data: enc.encode(NAV) },
  { name: 'OEBPS/style.css', data: enc.encode(badCss) },
  { name: 'OEBPS/images/cover.svg', data: enc.encode(badCover) },
  { name: 'OEBPS/text/c1.xhtml', data: enc.encode(badXhtml) },
]));

/* ---------- Chrome ---------- */
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'books-profile') });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info: String(info) }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info ? ' ' + info : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
const center = async (sel) => JSON.parse(await ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'null'; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2])`));
const waitTrue = async (js, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await ev(js)) return true; await sleep(150); } return false; };
const waitSel = (sel, ms) => waitTrue(`return !!document.querySelector(${JSON.stringify(sel)})`, ms);
async function click(sel, wait = 300, opts = {}) {
  if (!(await waitSel(sel))) throw new Error('見つからない: ' + sel);
  const r = await center(sel);
  await page.click(r[0], r[1], opts);
  await sleep(wait);
}
const answer = (value) => click(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 500);
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
const B = (js) => ev(`const w = document.querySelector('.window.app-books'); return ${js}`);
const status = () => B("w.querySelector('.status-field[data-status]').textContent");
// 状態の帯の「3 / 12 ページ（2 / 5 章）」を読む
async function where() {
  const t = await B("w.querySelector('.status-field[data-page]').textContent");
  const m = /(\d+) \/ (\d+) ページ（(\d+) \/ (\d+) 章）/.exec(t || '');
  return m ? { page: +m[1], pages: +m[2], ch: +m[3], chs: +m[4], text: t } : { page: 0, pages: 0, ch: 0, chs: 0, text: t };
}
const frameJs = (js) => B(`(() => { const d = w.querySelector('[data-frame]').contentDocument; return ${js}; })()`);
const focusStage = () => B("(w.querySelector('[data-stage]').focus(), true)");
async function waitPage(pred, ms = 8000) { for (let t = 0; t < ms; t += 150) { const p = await where(); if (pred(p)) return p; await sleep(150); } return where(); }
async function key(k, wait = 350) { await page.key(k); await sleep(wait); }
async function setFiles(path) {
  const { root } = await page.send('DOM.getDocument', { depth: 1 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.window.app-books input[data-file]' });
  await page.send('DOM.setFileInputFiles', { nodeId, files: [path] });
}

// 外への通信と CSP の違反を記録する
const requests = [], cspLogs = [];
await page.send('Network.enable');
await page.send('Log.enable');
page.on((m) => {
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  if (m.method === 'Log.entryAdded' && /Content Security Policy|Refused/i.test(m.params.entry.text)) cspLogs.push(m.params.entry.text);
});

try {
  await page.navigate(URL0 + '?shot');
  // 起動の途中で空にすると、起動の続きの見本の書き込みが残ることがある。デスクトップのアイコンが並ぶのを待ってから空にする
  await waitSel('#desk:not([hidden]) .desk-icon', 20000);
  await sleep(500);
  await wipe();
  await page.navigate(URL0 + '?shot=books');
  ok('?shot=books で本棚の窓が開く', await waitSel('.window.app-books [data-books]', 20000));
  ok('本棚が空なら「本を足す」と「見本の本を作る」の案内が出る', await waitTrue("const e = document.querySelector('.app-books [data-empty]'); return e && !e.hidden && e.textContent.includes('見本の本を作る')"));
  await sleep(400);
  await shot('01-empty');

  // 見本の本を作る
  await click('.app-books [data-empty] [data-a="samples"]', 600);
  ok('見本の本を作ると 2 冊が本棚に並ぶ', await waitTrue("return document.querySelectorAll('.app-books .bk-item').length === 2"));
  const titles = await B("[...w.querySelectorAll('.bk-title')].map((t) => t.textContent).join('|')");
  ok('2 冊の題名（本棚のはじめかた・しおり坂の古本屋）', titles.includes('本棚のはじめかた') && titles.includes('しおり坂の古本屋'), titles);
  ok('表紙の画像が出る（blob の URL）', await waitTrue("return [...document.querySelectorAll('.app-books .bk-cover img')].filter((i) => i.complete && i.naturalWidth > 0 && i.src.startsWith('blob:')).length === 2"));
  ok('見本の本は /本 に EPUB のファイルとして入る', await ev("const fs = await import('./js/fs.mjs'); return (await fs.list('/本')).filter((e) => e.name.endsWith('.epub')).length === 2"));
  await sleep(300);
  await shot('02-shelf');

  // 一覧、探す、並べ替え
  await click('.app-books .bk-view[data-view="list"]', 400);
  ok('一覧に切り替わる', await B("w.querySelector('[data-books]').classList.contains('bk-list')"));
  await shot('03-list');
  await click('.app-books .bk-view[data-view="grid"]', 300);
  await click('.app-books [data-q]', 100);
  await page.typeText('シオリ');
  await sleep(400);
  ok('カタカナで探しても、ひらがなの題名が見つかる', (await B("[...w.querySelectorAll('.bk-title')].map((t) => t.textContent).join('|')")) === 'しおり坂の古本屋');
  await B("(() => { const i = w.querySelector('[data-q]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
  await B("(() => { const s = w.querySelector('[data-sort]'); s.value = 'author'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()");
  await sleep(300);
  ok('著者の順に並べ替わる（Future OS 図書係 → 坂上 あかり）', (await B("[...w.querySelectorAll('.bk-author')].map((t) => t.textContent).join('|')")) === 'Future OS 図書係|坂上 あかり');
  await click('.app-books .bk-item[data-path="/本/本棚のはじめかた.epub"]', 300);
  await key('ArrowRight', 300);
  ok('本棚で → を押すと、右隣の本が選ばれてフォーカスが移る', await B("document.activeElement?.dataset.path === '/本/しおり坂の古本屋.epub' && w.querySelector('.bk-item[aria-selected=\"true\"]').dataset.path === '/本/しおり坂の古本屋.epub'"));
  await key('ArrowLeft', 300);

  // 横書きの本を開く
  await click('.app-books .bk-item[data-path="/本/本棚のはじめかた.epub"]', 200, { count: 2 });
  ok('案内の本が開く', await waitTrue("const w = document.querySelector('.window.app-books'); return !w.querySelector('[data-reader]').hidden && /ページ/.test(w.querySelector('.status-field[data-page]').textContent)"));
  await sleep(600);
  ok('横書きで表示する（html に bk-h）', await frameJs("d.documentElement.classList.contains('bk-h')"));
  ok('iframe はスクリプトを許さない sandbox で、CSP の meta が付く', await B("(() => { const f = w.querySelector('[data-frame]'); return f.getAttribute('sandbox') === 'allow-same-origin' && /script-src 'none'/.test(f.contentDocument.querySelector('meta[http-equiv]')?.content || ''); })()"));
  let p = await where();
  ok('1 章の 1 ページ目から始まる', p.page === 1 && p.ch === 1 && p.chs === 5, p.text);
  ok('両側のボタン: 右が次のページ', (await B("w.querySelectorAll('.bk-turn')[1].getAttribute('aria-label')")) === '次のページ');
  await shot('04-guide');
  await focusStage();
  const pages1 = p.pages;
  for (let i = 0; i < pages1; i++) await key('ArrowRight', 300);
  p = await waitPage((x) => x.ch === 2);
  ok('横書きの本で → を押していくと次の章へ進む', p.ch === 2 && p.page === 1, p.text);
  await key('ArrowLeft', 500);
  p = await where();
  ok('← で前の章の最後のページへ戻る', p.ch === 1 && p.page === p.pages, p.text);
  await key('PageDown', 500);
  p = await where();
  ok('PageDown で次へ', p.ch === 2 && p.page === 1, p.text);
  const st = await center('.app-books [data-stage]');
  const box = JSON.parse(await B("JSON.stringify((() => { const r = w.querySelector('[data-stage]').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })())"));
  const before = await where();
  await page.click(box[0] + box[2] * 0.85, st[1]); await sleep(500);
  const afterR = await where();
  ok('ページの右の半分を押すと次へ', afterR.page === before.page + 1 || afterR.ch === before.ch + 1, `${before.text} → ${afterR.text}`);
  await page.click(box[0] + box[2] * 0.15, st[1]); await sleep(500);
  ok('左の半分を押すと前へ', (await where()).text === before.text, (await where()).text);
  await page.wheel(st[0], st[1], 0, 120); await sleep(500);
  ok('ホイールを下へ回すと次へ', (await where()).text === afterR.text, (await where()).text);

  // 目次
  await click('.app-books [data-a="panel"][data-panel="toc"]', 500);
  ok('目次の欄に 5 つの章が並ぶ', (await B("w.querySelectorAll('[data-side-body] [data-toc]').length")) === 5);
  await click('.app-books [data-side-body] [data-toc="2"]', 900);
  await waitPage((x) => x.ch === 3);
  ok('3 章の本の中の画像（SVG）が blob の URL で出る', await waitTrue("const d = document.querySelector('.window.app-books [data-frame]').contentDocument; const im = [...d.images].find((i) => i.src.startsWith('blob:')); return !!im && im.complete && im.naturalWidth > 0", 5000));
  ok('3 章の表（colspan 付き）が残る', (await frameJs("d.querySelectorAll('table td[colspan=\"2\"]').length")) === 2);
  for (let i = 0; i < 4 && !(await frameJs("(() => { const im = d.images[0]; if (!im) return false; const r = im.getBoundingClientRect(); return r.left >= 0 && r.right <= d.documentElement.clientWidth; })()")); i++) { await focusStage(); await key('ArrowRight', 400); }
  await shot('05a-figure');
  await click('.app-books [data-side-body] [data-toc="3"]', 800);
  p = await waitPage((x) => x.ch === 4);
  ok('目次の「目次としおり」を押すと 4 章へ飛ぶ', p.ch === 4 && p.page === 1 && (await B("w.querySelector('.status-field[data-chapter]').textContent")) === '目次としおり', p.text);
  await shot('05-toc');
  // 本の中のリンク（4 章 → 2 章の「本を外す」の節）
  const linkPage = await frameJs("(() => { const a = d.querySelector('a[data-bk-href]'); return a ? a.getAttribute('data-bk-href') : ''; })()");
  ok('本の中のリンクは data-bk-href になる', linkPage === 'OEBPS/text/c2.xhtml#remove', linkPage);
  await frameJs("(() => { const a = d.querySelector('a[data-bk-href]'); const pg = Math.floor((a.getBoundingClientRect().left - d.body.getBoundingClientRect().left) / d.documentElement.clientWidth); return pg; })()").then(async (pg) => { for (let i = 0; i < pg; i++) { await focusStage(); await key('ArrowRight', 300); } });
  await frameJs("(d.querySelector('a[data-bk-href]').click(), true)");
  p = await waitPage((x) => x.ch === 2);
  ok('リンクを押すと 2 章の「本を外す」のあるページへ移る', p.ch === 2 && (await frameJs("(() => { const h = d.getElementById('remove').getBoundingClientRect(); return h.left >= 0 && h.right <= d.documentElement.clientWidth; })()")), p.text);

  // しおり
  await click('.app-books [data-a="panel"][data-panel="marks"]', 400);
  ok('しおりの欄は、最初は空の案内', (await B("w.querySelector('[data-side-body]').textContent")).includes('しおりはまだありません'));
  await click('.app-books [data-side-body] [data-a="mark"]', 500);
  const markAt = await where();
  ok('「このページに挟む」でしおりが 1 つ並ぶ', (await B("w.querySelectorAll('[data-side-body] [data-mark-go]').length")) === 1, await B("w.querySelector('[data-side-body] .bk-mark-label')?.textContent"));
  await focusStage();
  await key('End', 600); // 章の最後のページへ
  await key('PageDown', 600);
  ok('しおりのあとで別のページへ動く', (await where()).text !== markAt.text, (await where()).text);
  await click('.app-books [data-side-body] [data-mark-go]', 800);
  ok('しおりを押すと挟んだページへ戻る', (await where()).text === markAt.text, (await where()).text);
  await shot('06-marks');
  await click('.app-books [data-side-body] [data-mark-del]', 400);
  ok('「外す」でしおりが消える', (await B("w.querySelectorAll('[data-side-body] [data-mark-go]').length")) === 0);
  await click('.app-books [data-side-body] [data-a="mark"]', 400); // 開き直しの確かめのために、もう一度挟む
  const keptMark = await where();

  // 表示の設定
  await click('.app-books [data-a="panel"][data-panel="settings"]', 400);
  const pagesBefore = (await where()).pages;
  await B("(() => { const r = w.querySelector('[data-pref=\"fontSize\"]'); r.value = 160; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); return true; })()");
  await sleep(700);
  const pagesBig = (await where()).pages;
  ok('文字を大きくするとページが増える', pagesBig > pagesBefore, `${pagesBefore} → ${pagesBig}`);
  await click('.app-books [data-side-body] input[data-pref="theme"][value="night"]', 700);
  ok('地の色を「夜」にするとページの地が暗くなる', (await frameJs("getComputedStyle(d.documentElement).backgroundColor")) === 'rgb(23, 19, 31)', await frameJs("getComputedStyle(d.documentElement).backgroundColor"));
  await click('.app-books [data-side-body] input[data-pref="font"][value="gothic"]', 600);
  ok('書体を「ゴシック」にすると本文の書体が変わる', /Gothic|sans-serif/.test(await frameJs("getComputedStyle(d.querySelector('p')).fontFamily")));
  await shot('07-settings-night');
  await click('.app-books [data-side-body] input[data-pref="bookCss"]', 900);
  ok('本の CSS を外すと、本の CSS の link が無くなる', (await frameJs("d.querySelectorAll('link[rel=stylesheet]').length")) === 0);
  await click('.app-books [data-side-body] [data-a="resetprefs"]', 900);
  ok('「最初の設定に戻す」で白の地・本の CSS あり', (await frameJs("getComputedStyle(d.documentElement).backgroundColor")) === 'rgb(255, 255, 255)' && (await frameJs("d.querySelectorAll('link[rel=stylesheet]').length")) > 0);
  ok('設定を戻しても、しおりの位置の章にいる', (await where()).ch === keptMark.ch, (await where()).text);

  // 本棚へ戻ると、進み具合が出る
  await click('.app-books [data-reader] [data-a="shelf"]', 800);
  ok('本棚へ戻ると、案内の本に読んだ割合が出る', /\d+% 読みました/.test(await B("w.querySelector('.bk-item[data-path=\"/本/本棚のはじめかた.epub\"] .bk-note').textContent")), await B("w.querySelector('.bk-item[data-path=\"/本/本棚のはじめかた.epub\"] .bk-note').textContent"));

  // 縦書きの本
  await click('.app-books .bk-item[data-path="/本/しおり坂の古本屋.epub"]', 200, { count: 2 });
  await waitTrue("const w = document.querySelector('.window.app-books'); return /しおり坂/.test(w.querySelector('[data-booktitle]').textContent) && /ページ/.test(w.querySelector('.status-field[data-page]').textContent)");
  await sleep(800);
  ok('縦書きで表示する（html に bk-v、writing-mode: vertical-rl）', (await frameJs("d.documentElement.classList.contains('bk-v') && getComputedStyle(d.body).writingMode")) === 'vertical-rl');
  ok('ルビ（ruby と rt）が出る', (await frameJs("d.querySelectorAll('ruby rt').length")) >= 2 && (await frameJs("d.querySelector('rt').getBoundingClientRect().width")) > 0);
  ok('両側のボタン: 縦書きでは左が次のページ', (await B("w.querySelectorAll('.bk-turn')[0].getAttribute('aria-label')")) === '次のページ');
  p = await where();
  ok('縦書きの本は 1 章が 2 ページ以上ある', p.pages >= 2, p.text);
  await shot('08-story-vertical');
  await focusStage();
  await key('ArrowLeft', 500);
  p = await where();
  ok('縦書きでは ← が次のページ', p.page === 2 && p.ch === 1, p.text);
  ok('2 ページ目は、1 ページ目の続きの文が上に来る（段が下へずれる）', (await frameJs("d.body.style.transform")).startsWith('translateY(-'), await frameJs("d.body.style.transform"));
  await shot('09-story-page2');
  await key('ArrowRight', 500);
  p = await where();
  ok('縦書きでは → が前のページ', p.page === 1 && p.ch === 1, p.text);
  const st2 = await center('.app-books [data-stage]');
  const box2 = JSON.parse(await B("JSON.stringify((() => { const r = w.querySelector('[data-stage]').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })())"));
  await page.click(box2[0] + box2[2] * 0.15, st2[1]); await sleep(500);
  ok('縦書きでは左の半分を押すと次へ', (await where()).page === 2, (await where()).text);
  for (let i = 0; i < 12 && (await where()).ch < 2; i++) { await focusStage(); await key('ArrowLeft', 350); }
  await key('ArrowLeft', 500);
  const storyAt = await where();
  ok('← を続けると 2 章へ進む', storyAt.ch === 2 && storyAt.page === 2, storyAt.text);
  await sleep(1000); // 保存（0.7 秒後）を待つ

  // 閉じて開き直す
  await click('.window.app-books .title-bar-controls button.close', 800);
  ok('窓を閉じられる', !(await ev("return !!document.querySelector('.window.app-books')")));
  const saved = await ev("const fs = await import('./js/fs.mjs'); return JSON.stringify(await fs.readJSON('/システム/本棚.json'))");
  ok('読んだ位置としおりが /システム/本棚.json に残る', /しおり坂|sample-story/.test(saved) && /"marks":\[\{/.test(saved), saved.slice(0, 160));
  await ev("const shell = await import('./js/shell.mjs'); await shell.launch('books'); return true;");
  await waitTrue("return document.querySelectorAll('.app-books .bk-item').length === 2");
  ok('開き直すと、並べ替えの設定（著者の順）が残る', (await B("w.querySelector('[data-sort]').value")) === 'author');
  await B("(() => { const s = w.querySelector('[data-sort]'); s.value = 'recent'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()");
  await sleep(300);
  ok('最近読んだ順にすると、最後に読んだ縦書きの本が先頭', (await B("w.querySelector('.bk-item .bk-title').textContent")) === 'しおり坂の古本屋');
  await click('.app-books .bk-item[data-path="/本/しおり坂の古本屋.epub"]', 200, { count: 2 });
  await waitTrue("const w = document.querySelector('.window.app-books'); return /ページ/.test(w.querySelector('.status-field[data-page]').textContent)");
  await sleep(800);
  p = await where();
  // 窓の大きさや横の欄の有無でページの数は変わるので、章と、章の中の割合（0〜1）で比べる
  const fracBefore = K.progressAt(storyAt.page - 1, storyAt.pages);
  ok('縦書きの本を開き直すと、読んだ位置（同じ章の同じ割合のページ）から始まる', p.ch === storyAt.ch && p.page - 1 === K.pageAt(fracBefore, p.pages), `${storyAt.text} → ${p.text}`);
  ok('状態の帯に「前に読んだ所から」と進み具合', /前に読んだ所/.test(await status()) && /進み具合 \d+%/.test(await B("w.querySelector('.status-field[data-pct]').textContent")), await status());
  await click('.app-books [data-reader] [data-a="shelf"]', 600);
  await click('.app-books .bk-item[data-path="/本/本棚のはじめかた.epub"]', 200, { count: 2 });
  await waitTrue("const w = document.querySelector('.window.app-books'); return /本棚のはじめかた/.test(w.querySelector('[data-booktitle]').textContent) && /ページ/.test(w.querySelector('.status-field[data-page]').textContent)");
  await sleep(800);
  p = await where();
  ok('案内の本も、閉じる前の位置（しおりを挟んだ章）から始まる', p.ch === keptMark.ch, `${keptMark.text} → ${p.text}`);
  await click('.app-books [data-a="panel"][data-panel="marks"]', 400);
  ok('開き直しても、しおりが残っている', (await B("w.querySelectorAll('[data-side-body] [data-mark-go]').length")) === 1);
  await click('.app-books [data-reader] [data-a="shelf"]', 600);

  // 本を足す（パソコンのファイルを選ぶ）
  await setFiles(importPath);
  ok('「本を足す」でパソコンの EPUB を取り込む', await waitTrue("return [...document.querySelectorAll('.app-books .bk-title')].some((t) => t.textContent === '取り込みの確かめ')"));
  ok('取り込んだ本は /本 に入る', await ev("const fs = await import('./js/fs.mjs'); return await fs.exists('/本/取り込みの確かめ.epub')"));
  await setFiles(junkPath);
  ok('EPUB でないファイルは足さずに知らせる', await waitTrue("const d = document.querySelector('dialog.msgbox[open]'); return !!d && d.textContent.includes('壊れた本.epub')"));
  await shot('10-junk');
  await answer('OK');

  // 悪い EPUB
  await ev("window.__pwned = undefined; return true;");
  const reqBefore = requests.length;
  await setFiles(evilPath);
  ok('悪い本も、形が正しければ本棚に並ぶ', await waitTrue("return [...document.querySelectorAll('.app-books .bk-title')].some((t) => t.textContent === '悪い本')"));
  await sleep(500);
  await click('.app-books .bk-item[data-path="/本/悪い本.epub"]', 200, { count: 2 });
  await waitTrue("const w = document.querySelector('.window.app-books'); return /悪い本/.test(w.querySelector('[data-booktitle]').textContent) && /ページ/.test(w.querySelector('.status-field[data-page]').textContent)");
  await sleep(1500);
  await shot('11-evil');
  ok('悪い本の文字は表示される', (await frameJs("d.body.textContent")).includes('最後の段落です。'));
  ok('script・iframe・object・embed・form・video・audio・noscript・template・use・animate が残らない', (await frameJs("d.querySelectorAll('script, iframe, object, embed, form, input, button, video, audio, noscript, template, use, animate, maction, base, meta[http-equiv=refresh]').length")) === 0);
  ok('on〜 の属性と javascript: の URL が残らない', (await frameJs("[...d.querySelectorAll('*')].some((el) => [...el.attributes].some((a) => /^on/i.test(a.name) || /javascript:/i.test(a.value)))")) === false);
  ok('本の外へのリンクは data-bk-ext に入り、href は # だけ', (await frameJs("[...d.querySelectorAll('a[data-bk-ext]')].every((a) => a.getAttribute('href') === '#')")) === true && (await frameJs("d.querySelectorAll('a[data-bk-ext]').length")) === 1);
  ok('外を指す src・href・url() が残らない（外へのリンクの data-bk-ext は除く）', !/__evil|127\.0\.0\.1:\d+\/__/.test(await frameJs("d.documentElement.outerHTML.replace(/ data-bk-ext=\"[^\"]*\"/g, '') +[...d.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join(''); } catch { return ''; } }).join('')")));
  ok('position: fixed は落ちる', (await frameJs("[...d.querySelectorAll('p')].every((p) => getComputedStyle(p).position !== 'fixed')")) === true);
  await frameJs("(d.getElementById('jslink').click(), d.querySelector('h1').click(), true)");
  await sleep(800);
  ok('javascript: のリンクや on〜 を押しても、何も動かない', (await ev("return window.__pwned === undefined")) === true, await ev("return String(window.__pwned)"));
  ok('iframe は srcdoc のまま（meta refresh で移らない）', (await B("w.querySelector('[data-frame]').contentWindow.location.href")) === 'about:srcdoc');
  const evilReq = requests.slice(reqBefore).filter((u) => /__evil|evil\.example/.test(u));
  ok('外へ読みに行かない（__evil への通信が 0 件）', evilReq.length === 0, evilReq.slice(0, 3).join(' '));
  ok('CSP の違反が出ない（消毒の段階で全部落ちている）', cspLogs.length === 0, cspLogs.slice(0, 2).join(' | '));
  await focusStage();
  await key('Escape', 800);
  ok('Esc で本棚へ戻る', await B("!w.querySelector('[data-shelf]').hidden && w.querySelector('[data-reader]').hidden"));

  // 撮影用の入口から、本を直接開く（ファイルを開く命令の形）
  await page.navigate(URL0 + '?shot=books:/本/しおり坂の古本屋.epub');
  ok('?shot=books:/本/しおり坂の古本屋.epub で、その本の読む画面が直接開く', await waitTrue("const w = document.querySelector('.window.app-books'); return !!w && !w.querySelector('[data-reader]').hidden && /しおり坂/.test(w.querySelector('[data-booktitle]').textContent) && /ページ/.test(w.querySelector('.status-field[data-page]').textContent)", 20000));
  await sleep(800);
  await shot('12-direct-open');
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'books-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
