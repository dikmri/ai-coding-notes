// ウェブブラウザの読む表示（百科事典）の消毒を、OS の中で画面なしの Chrome で確かめる（音は出さない）。
// 本物の wikipedia へは送らず、Chrome の通信の横取り（Fetch.enable）で作り物の記事を返す。
// 確かめること: Sanitizer API（Document.parseHTML）の道で読めて、代わりの道（DOMParser）へ回らないこと。
//              script・on〜 の属性・style・iframe が残らず、見出し・段落・表・リンクが残ること。
// 使い方: 先に node tools/serve.mjs 8799 を動かしてから、node tools/browser-read-check.mjs [番号=8799]
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8799;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'browser-read-check');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ARTICLE = `<!DOCTYPE html><html><head><title>記事</title><style>body{color:red}</style><script>window.__pwned=1</script></head>
<body><section><h2 id="a">夕暮れの峠</h2><p onclick="window.__pwned=2">峠は<b>夕方</b>に赤く見えます。<a href="./峠">峠</a></p>
<table><tr><th>高さ</th><td>44 m</td></tr></table><iframe src="https://example.com/"></iframe><img src="x" onerror="window.__pwned=3"><div><span>包みの中</span></div></section></body></html>`;

// 記録のファイルは前の実行の行も持つので、この実行で書かれた所（始めの大きさより後ろ）だけを見る
const LOG = join(ROOT, 'logs', 'app.log');
const logStart = existsSync(LOG) ? readFileSync(LOG).length : 0;
const page = await openBrowser({ width: 1280, height: 800, profile: join(ROOT, 'runtime', 'browser-read-profile') });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info ? ' ' + info : ''}`); };
const waitSel = async (sel, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await ev(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(150); } return false; };
let intercepted = 0;
page.on((m) => {
  if (m.method !== 'Fetch.requestPaused') return;
  intercepted++;
  page.send('Fetch.fulfillRequest', {
    requestId: m.params.requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }, { name: 'Access-Control-Allow-Origin', value: '*' }],
    body: Buffer.from(ARTICLE, 'utf8').toString('base64'),
  }).catch(() => {});
});
try {
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*wikipedia.org*' }] });
  await page.navigate(URL0 + '?shot');
  await waitSel('#desk:not([hidden]) .desk-icon', 20000);
  await sleep(500);
  await ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
  await page.navigate(URL0 + '?shot=browser');
  ok('ブラウザが開く', await waitSel('.app-browser [data-addr]', 20000));
  ok('この Chrome に Document.parseHTML がある', await ev("return typeof Document.parseHTML === 'function'"));
  await ev(`const a = document.querySelector('.app-browser [data-addr]'); a.focus(); a.value = 'arcadia://wiki/ja/夕暮れの峠'; a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true;`);
  ok('百科事典の読む表示に記事が入る', await waitSel('.app-browser [data-body] h2', 15000));
  await sleep(500);
  ok('記事の取り寄せは横取りした（本物の wikipedia へ送っていない）', intercepted > 0, `${intercepted} 回`);
  const body = await ev("const b = document.querySelector('.app-browser [data-body]'); return b ? b.innerHTML : ''");
  ok('見出し・段落・太字・表が残る', /<h2[^>]*>夕暮れの峠<\/h2>/.test(body) && /<b>夕方<\/b>/.test(body) && /<table>/.test(body) && /44 m/.test(body), body.slice(0, 120));
  ok('div と span は中身だけが残る', body.includes('包みの中') && !/<div|<span/.test(body));
  ok('script・style・iframe・on〜 の属性・id が残らない', !/<script|<style|<iframe|onclick|onerror|id="a"/.test(body));
  ok('リンクは OS のブラウザの中で開く形になる', /class="bw-link"/.test(body) && /data-go=/.test(body));
  ok('記事の中のスクリプトは動いていない', (await ev('return window.__pwned || 0')) === 0);
  const log = existsSync(LOG) ? readFileSync(LOG).subarray(logStart).toString('utf8') : '';
  ok('記録のファイルに、この実行のブラウザの記録がある', /browser\./.test(log));
  ok('代わりの道（DOMParser）へ回っていない', !/browser\.sanitize.*fallback/.test(log));
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 2).join(' | '));
  writeFileSync(join(OUT, '01-wiki.png'), Buffer.from(await page.screenshot(), 'base64'));
} catch (e) {
  ok('途中で止まらない', false, e.message);
} finally {
  await ev("const fs = await import('./js/fs.mjs'); await fs.wipe(); localStorage.clear(); return true;").catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'browser-read-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
