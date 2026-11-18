// 文書（os/js/apps/writer.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// 見本の文書 → 文字を打つ → 見出し・太字・斜体・色・揃え・箇条書き・区切り線 → 元に戻す・やり直し → 表（行と列を足す・消す）
// → 画像（入れる・つまみで大きさを変える）→ 悪い HTML の貼り付け → 検索と置換 → 縦書き → 保存 → HTML・Markdown・テキストの書き出し
// → パソコンへ書き出す → 印刷 → 閉じて開き直す → 悪い .fdoc と壊れた .fdoc を開く。
// 確かめ専用の Chrome のプロファイル（runtime/writer-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8796 を動かしてから、node tools/writer-check.mjs [番号=8796]
//   画面の写真は build/writer-check/、結果は logs/writer-check.json
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8796;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'writer-check');
const DL = join(OUT, 'downloads');
rmSync(DL, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'writer-profile') });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info ? ' ' + info : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
// いちばん手前（最後に開いた）文書の窓と、その本文
const WIN = "[...document.querySelectorAll('.app-writer')].at(-1)";
const PAGE = `${WIN}.querySelector('.wr-page')`;
const P = (js) => ev(`const w = ${WIN}, page = w.querySelector('.wr-page'); ${js}`);
const centerOf = async (expr) => JSON.parse(await ev(`const el = ${expr}; if (!el) return 'null'; el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]);`));
const waitJs = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await ev(`return !!(${expr})`)) return true; await sleep(150); } return false; };
const waitSel = (sel, ms) => waitJs(`document.querySelector(${JSON.stringify(sel)})`, ms);
async function clickJs(expr, wait = 300) {
  if (!(await waitJs(expr, 8000))) throw new Error('見つからない: ' + expr);
  const c = await centerOf(expr);
  await page.click(c[0], c[1]);
  await sleep(wait);
}
const click = (sel, wait) => clickJs(`document.querySelector(${JSON.stringify(sel)})`, wait);
const tool = (cmd, wait = 300) => clickJs(`${WIN}.querySelector('[data-cmd="${cmd}"]')`, wait);
// メニューを本物のマウスの操作で選ぶ。labels は、たどる項目の見出しの先頭の文字（最後の 1 つを押す）
async function menu(title, ...labels) {
  await clickJs(`[...${WIN}.querySelectorAll('.menu-title')].find((t) => t.textContent.trim().startsWith(${JSON.stringify(title)}))`, 250);
  for (let i = 0; i < labels.length; i++) {
    const expr = `[...${WIN}.querySelectorAll('.menu-title.open .menu-item')].find((m) => m.offsetParent !== null && m.querySelector(':scope > .label').textContent.trim().startsWith(${JSON.stringify(labels[i])}))`;
    if (i < labels.length - 1) { const c = await centerOf(expr); if (!c) throw new Error('メニューに無い: ' + labels[i]); await page.move(c[0], c[1]); await sleep(450); }
    else await clickJs(expr, 450);
  }
}
// 開く・保存の箱に名前を入れて決める（上書きの確認には「はい」）
async function answerFile(name) {
  if (!(await waitSel('dialog.file-dlg[open]', 8000))) throw new Error('ファイルの箱が出ない');
  await ev(`document.querySelector('dialog.file-dlg[open] #fdName').value = ${JSON.stringify(name)}; return 1;`);
  await click('dialog.file-dlg[open] [data-ok]', 700);
  if (await ev("return !!document.querySelector('dialog.msgbox[open]')")) await click('dialog.msgbox[open] button[data-close="はい"]', 600);
}
// 本文の中の文字を選ぶ（end を付けると、その文字の後ろにカーソルを置く）
const selectText = (needle, caret = null) => P(`const tw = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const i = n.data.indexOf(${JSON.stringify(needle)}); if (i < 0) continue; page.focus();
    const a = ${caret === 'start' ? 'i' : caret === 'end' ? `i + ${needle.length}` : 'i'}, b = ${caret === 'start' ? 'i' : `i + ${needle.length}`};
    getSelection().setBaseAndExtent(n, a, n, b); return true; } return false;`);
const html = () => P('return page.innerHTML');
const fsText = (p) => ev(`const fs = await import('./js/fs.mjs'); try { return await fs.readText(${JSON.stringify(p)}); } catch { return null; }`);
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");

try {
  await page.raw('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
  await page.navigate(URL0 + '?shot');
  await wipe();
  await page.navigate(URL0 + '?shot=writer');
  ok('文書の窓が ?shot=writer で開く', await waitSel('.app-writer .wr-page h1', 20000));
  await sleep(900);
  ok('初めて開くと見本の文書が出る', (await P("return page.querySelector('h1').textContent")) === '「文書」へようこそ');
  ok('見本の文書に表・引用・箇条書きがある', await P("return !!page.querySelector('table') && !!page.querySelector('blockquote') && !!page.querySelector('ul')"));
  const status0 = await P("return [...w.querySelectorAll('.status-bar .status-field')].map((f) => f.textContent)");
  ok('状態の帯に案内と文字数と段落の数が出る', /見本の文書/.test(status0[0]) && /\d+ 文字（空白を除く \d+）/.test(status0[1]) && /段落 \d+/.test(status0[2]), status0.slice(0, 3).join(' | '));
  ok('アイコンが窓の題名の横に出る', await P("return w.querySelector('.title-bar-icon').getAttribute('src') === 'icons/writer.svg' && w.querySelector('.title-bar-icon').naturalWidth === 32"));
  await shot('01-sample');

  // ---- 白紙にして打つ ----
  // 見出しを押して本文に入り、メニューの「すべて選択」で全部を選んで消す
  const pc = await centerOf(`${PAGE}.querySelector('h1')`);
  await page.click(pc[0], pc[1]);
  ok('本文を押すと、本文に焦点が移る', await P('return document.activeElement === page'));
  await menu('編集', 'すべて選択');
  await page.key('Backspace'); await sleep(300);
  ok('すべて選択して消すと、空の塊が 1 つ残る', await P("return page.children.length === 1 && page.textContent === ''"), await P('return page.innerHTML'));
  await page.key('Control+Alt+0'); await sleep(300);
  ok('Ctrl+Alt+0 で本文の段落になる', (await P('return page.innerHTML')) === '<p><br></p>', await P('return page.innerHTML'));
  await page.typeText('夕暮れの報告'); await page.key('Enter');
  await page.typeText('今日は峠の道を歩きました。とても大事な一日でした。'); await page.key('Enter');
  await page.typeText('次の段落です。'); await page.key('Enter');
  await page.typeText('箇条書きにする行');
  await sleep(1500);
  const blocks = await P("return [...page.children].map((c) => c.localName + ':' + c.textContent).join(' / ')");
  ok('打った文字が段落になる（ページの直下は段落だけ）', /^p:夕暮れの報告 \/ p:今日は/.test(blocks) && !(await P("return !!page.querySelector(':scope > div, :scope > br')")), blocks);
  ok('名前のない文書は下書きとして残る', await ev("return Object.keys(localStorage).some((k) => k.startsWith('fos-writer-draft-') && localStorage.getItem(k).includes('夕暮れの報告'))"));
  ok('題名に変更の印（*）が付く', /^\*無題 - 文書$/.test(await P("return w.querySelector('.title-bar-text').textContent")));

  // ---- 見出し・太字・元に戻す・やり直し・斜体・色 ----
  await selectText('夕暮れ', 'start');
  await page.key('Control+Alt+1'); await sleep(300);
  ok('Ctrl+Alt+1 で見出し 1 になる', (await P("return page.querySelector('h1')?.textContent")) === '夕暮れの報告');
  ok('段落の種類の選び箱が「見出し 1」になる', (await P("return w.querySelector('[data-block]').value")) === 'h1');
  await selectText('大事な');
  await page.key('Control+b'); await sleep(300);
  ok('Ctrl+B で選んだ文字が太字になる', (await P("return page.querySelector('strong')?.textContent")) === '大事な');
  ok('太字のボタンが押された状態になる', (await P("return w.querySelector('[data-cmd=\"bold\"]').getAttribute('aria-pressed')")) === 'true');
  await page.key('Control+z'); await sleep(300);
  ok('Ctrl+Z で太字が外れる（元に戻す）', !(await P("return !!page.querySelector('strong')")));
  await page.key('Control+y'); await sleep(300);
  ok('Ctrl+Y で太字に戻る（やり直し）', (await P("return page.querySelector('strong')?.textContent")) === '大事な');
  await selectText('峠');
  await tool('italic');
  ok('道具の帯の「斜」で斜体になる', (await P("return page.querySelector('em')?.textContent")) === '峠');
  await selectText('一日');
  await menu('書式', '文字の色', '赤');
  ok('メニューの「文字の色」→「赤」で色が付く', /^rgb\(211, 47, 47\)$/.test(await P("return [...page.querySelectorAll('span')].find((s) => s.textContent === '一日')?.style.color || ''")));
  await selectText('道を歩');
  await menu('書式', '蛍光ペン', '黄');
  ok('蛍光ペンを付ける', (await P("return page.querySelector('mark')?.textContent")) === '道を歩');
  await selectText('次の段落', 'start');
  await P("const s = w.querySelector('[data-block]'); s.value = 'h2'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1;");
  await sleep(300);
  ok('段落の種類の選び箱で見出し 2 になる', (await P("return page.querySelector('h2')?.textContent")) === '次の段落です。');
  await tool('a-center');
  ok('中央揃えのボタンで中央揃えになる', (await P("return page.querySelector('h2').style.textAlign")) === 'center');
  await selectText('箇条書きにする行', 'start');
  await page.key('Control+Shift+8'); await sleep(300);
  ok('Ctrl+Shift+8 で箇条書きになる', (await P("return page.querySelector('ul > li')?.textContent")) === '箇条書きにする行');
  await page.key('End'); await page.key('Enter'); await page.typeText('二つ目の項目'); await sleep(300);
  ok('箇条書きの中の Enter で次の項目になる', (await P("return page.querySelectorAll('ul > li').length")) === 2);
  await tool('hr');
  ok('区切り線を入れると、その後ろに書ける段落ができる', await P("const hr = page.querySelector('hr'); return !!hr && hr.nextElementSibling?.localName === 'p'"));

  // ---- 表 ----
  await menu('挿入', '表');
  ok('表の箱が出る', await waitSel('dialog[open] #wrRows', 5000));
  await ev("const d = document.querySelector('dialog[open]'); d.querySelector('#wrRows').value = 2; d.querySelector('#wrCols').value = 3; return 1;");
  await click('dialog[open] button.default', 500);
  ok('2 行 3 列の表が入る', (await P("const t = page.querySelector('table'); return t ? t.rows.length + 'x' + t.rows[0].cells.length : ''")) === '2x3');
  await page.typeText('項目'); await page.key('Tab'); await page.typeText('説明'); await page.key('Tab'); await page.typeText('備考');
  await sleep(200);
  ok('表の中の Tab で次のマスへ移る', (await P("return [...page.querySelector('table').rows[0].cells].map((c) => c.textContent).join(',')")) === '項目,説明,備考');
  await menu('表', '下に行を足す');
  ok('「下に行を足す」で行が増える', (await P("return page.querySelector('table').rows.length")) === 3);
  await menu('表', '右に列を足す');
  ok('「右に列を足す」で全部の行に列が増える', (await P("return [...page.querySelector('table').rows].every((r) => r.cells.length === 4)")));
  await menu('表', '列を消す');
  ok('「列を消す」で列が減る', (await P("return [...page.querySelector('table').rows].every((r) => r.cells.length === 3)")));
  await menu('表', '行を消す');
  ok('「行を消す」で行が減る', (await P("return page.querySelector('table').rows.length")) === 2);
  ok('表の外では表のメニューを選べない（カーソルが表の中なら選べる）', (await P("return w.querySelector('[data-command=\"t-delRow\"]').getAttribute('aria-disabled')")) === 'false');

  // ---- 画像 ----
  const pngSize = await ev(`const c = document.createElement('canvas'); c.width = 240; c.height = 120; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, '#ff8ec7'); g.addColorStop(1, '#ffd37a'); x.fillStyle = g; x.fillRect(0, 0, 240, 120);
    x.fillStyle = '#4b5fe8'; x.beginPath(); x.arc(120, 100, 34, 0, Math.PI * 2); x.fill();
    const b = await new Promise((r) => c.toBlob(r, 'image/png')); const fs = await import('./js/fs.mjs'); await fs.write('/画像/夕日.png', b); return b.size;`);
  await selectText('大事な', 'end');
  await tool('image', 500);
  await answerFile('夕日.png');
  await sleep(500);
  const img0 = JSON.parse(await P("const i = page.querySelector('img'); return JSON.stringify(i ? { src: i.getAttribute('src').slice(0, 5), w: i.style.width, nat: i.naturalWidth } : null)"));
  ok('仮想ドライブの画像が入る（編集の間は blob: の URL）', img0 && img0.src === 'blob:' && img0.w === '240px' && img0.nat === 240, JSON.stringify(img0) + ` ${pngSize} バイト`);
  ok('入れた画像に大きさのつまみが出る', await P("return !w.querySelector('[data-imgbox]').hidden"));
  await shot('02-image');
  const hc = await centerOf(`${WIN}.querySelector('[data-imghandle]')`);
  await page.drag(hc[0], hc[1], hc[0] - 90, hc[1]);
  await sleep(400);
  const w1 = await P("return parseFloat(page.querySelector('img').style.width)");
  ok('つまみを左へドラッグすると画像が小さくなる', w1 < 200 && w1 > 120, `${w1}px`);
  await P("w.querySelector('[data-imghandle]').focus(); return 1;");
  await page.key('ArrowRight'); await sleep(200);
  ok('つまみにフォーカスして右の矢印キーで 10px 大きくなる', (await P("return parseFloat(page.querySelector('img').style.width)")) === Math.round(w1) + 10);
  await page.key('Control+z'); await sleep(300);
  ok('画像の大きさの変更も元に戻せる', (await P("return parseFloat(page.querySelector('img').style.width)")) === Math.round(w1));

  // ---- 悪い HTML の貼り付け ----
  await ev('window.__pwned = 0; return 1;');
  await P("const p = [...page.querySelectorAll(':scope > p')].at(-1); page.focus(); getSelection().collapse(p, 0); return 1;");
  await P(`const dt = new DataTransfer(); dt.setData('text/html', '<img src=x onerror="window.__pwned=8"><b onmouseover="window.__pwned=9">太い</b><script>window.__pwned=10</script><a href="javascript:window.__pwned=11">リンク</a>');
    dt.setData('text/plain', '太いリンク'); page.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return 1;`);
  await sleep(800);
  ok('貼り付けた HTML は消毒され、スクリプトは動かない', (await ev('return window.__pwned')) === 0 && (await P("return [...page.querySelectorAll('strong')].some((s) => s.textContent === '太い') && !page.querySelector('script, a, [onerror], [onmouseover]')")));
  await P(`const dt = new DataTransfer(); dt.setData('text/plain', '一行目の文\\n二行目の文'); page.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return 1;`);
  await sleep(500);
  ok('文字だけの貼り付けは、行ごとに段落になる', await P("const ps = [...page.querySelectorAll(':scope > p')].map((p) => p.textContent); return ps.some((t) => t.endsWith('一行目の文')) && ps.includes('二行目の文')"), await P("return [...page.querySelectorAll(':scope > p')].map((p) => p.textContent).slice(-3).join(' / ')"));
  await page.key('Control+z'); await sleep(300);
  ok('貼り付けも元に戻せる', !(await P("return page.textContent.includes('二行目の文')")));
  await shot('03-formatted');

  // ---- 検索と置換 ----
  await page.key('Control+f'); await sleep(300);
  ok('Ctrl+F で検索の帯が出る', await P("return !w.querySelector('[data-findbar]').hidden && document.activeElement === w.querySelector('[data-fq]')"));
  await page.typeText('項目'); await sleep(400);
  ok('見つかった数が出る（カーソルより後ろの最初の所から）', /^[12] \/ 2 件$/.test(await P("return w.querySelector('[data-fcount]').textContent")), await P("return w.querySelector('[data-fcount]').textContent"));
  ok('見つかった所に印（CSS Custom Highlight）が付く', await ev("return CSS.highlights.get('wr-find')?.size === 2 && CSS.highlights.has('wr-find-cur')"));
  await shot('04-find');
  await P("const r = w.querySelector('[data-fr]'); r.focus(); return 1;");
  await page.typeText('こうもく');
  await clickJs(`${WIN}.querySelector('[data-f="all"]')`, 400);
  ok('すべて置換で 2 か所が置き換わる', (await P("return (page.textContent.match(/こうもく/g) || []).length")) === 2 && !(await P("return page.textContent.includes('項目')")));
  await page.key('Escape'); await sleep(200);
  ok('Esc で検索の帯が閉じ、印が消える', await P("return w.querySelector('[data-findbar]').hidden") && !(await ev("return CSS.highlights.has('wr-find')")));
  await page.key('Control+z'); await sleep(300);
  ok('置換も元に戻せる', (await P("return (page.textContent.match(/項目/g) || []).length")) === 2);

  // ---- そのほかの書式（選ばずに書式を変えてから打つ、かな漢字変換、下線・取り消し線・書式を消す、引用・コード・番号付き・右寄せ） ----
  await P("const p = [...page.querySelectorAll(':scope > p')].at(-1); page.focus(); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); return 1;");
  await page.key('Enter'); await page.typeText('飾りの試し：');
  await page.key('Control+b'); await page.typeText('強い'); await page.key('Control+b'); await page.typeText('ふつう');
  await sleep(900);
  ok('選ばずに Ctrl+B を押してから打つと、その文字だけ太字になる', await P("const s = [...page.querySelectorAll('strong')].find((x) => x.textContent.includes('強い')); return !!s && s.textContent === '強い' && s.parentElement.textContent === '飾りの試し：強いふつう'"), await P("return [...page.querySelectorAll('strong')].map((x) => x.parentElement.innerHTML).join(' | ')"));
  ok('書式の目印の文字（ゼロ幅の空白）が残らない', !(await P("return page.textContent.includes('\\u200b')")));
  await page.key('Control+i');
  await page.send('Input.imeSetComposition', { text: 'しゅくだい', selectionStart: 5, selectionEnd: 5 });
  await sleep(200);
  await page.send('Input.insertText', { text: '宿題' });
  await sleep(900);
  ok('かな漢字変換で打っても、選んだ書式（斜体）になる', (await P("return [...page.querySelectorAll('em')].map((e) => e.textContent).join(',')")).includes('宿題'), await P("return [...page.querySelectorAll('em')].map((e) => e.textContent).join(',')"));
  await selectText('強い');
  await page.key('Control+u'); await page.key('Control+Shift+x'); await sleep(300);
  ok('Ctrl+U で下線、Ctrl+Shift+X で取り消し線になる', await P("return [...page.querySelectorAll('u')].some((e) => e.textContent === '強い') && [...page.querySelectorAll('s')].some((e) => e.textContent === '強い')"));
  await menu('書式', '書式を消す');
  ok('「書式を消す」で太字・下線・取り消し線が外れる', await P("return ![...page.querySelectorAll('strong, u, s')].some((e) => e.textContent.includes('強い'))"));
  await selectText('飾りの試し', 'start');
  await menu('書式', '段落の種類', '引用');
  ok('「段落の種類」→「引用」で引用になる', (await P("return page.querySelector('blockquote')?.textContent || ''")).startsWith('飾りの試し'));
  await P("const s = w.querySelector('[data-block]'); s.value = 'pre'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1;");
  await sleep(300);
  ok('段落の種類の選び箱で「コード」にする', (await P("return page.querySelector('pre')?.textContent || ''")).startsWith('飾りの試し'));
  await page.key('Control+Alt+0'); await sleep(300);
  await tool('ol');
  ok('番号付きのボタンで番号付きの列になる', (await P("return page.querySelector('ol > li')?.textContent || ''")).startsWith('飾りの試し'));
  await tool('ol');
  ok('もう一度押すと列から段落に戻る', !(await P("return !!page.querySelector('ol')")) && (await P("return [...page.querySelectorAll(':scope > p')].some((p) => p.textContent.startsWith('飾りの試し'))")));
  await page.key('Control+Shift+r'); await sleep(300);
  ok('Ctrl+Shift+R で右寄せになる', await P("return [...page.querySelectorAll(':scope > p')].find((p) => p.textContent.startsWith('飾りの試し'))?.style.textAlign === 'right'"));
  await menu('表示', '本文の文字の大きさ', '12 pt');
  await menu('表示', '行の間', '2 倍');
  ok('本文の文字の大きさ（12pt = 16px）と行の間（2 倍）を変える', (await P('return getComputedStyle(page).fontSize')) === '16px' && (await P('return getComputedStyle(page).lineHeight')) === '32px', await P('return getComputedStyle(page).fontSize + " " + getComputedStyle(page).lineHeight'));
  await menu('表示', '拡大率', '100%');
  ok('拡大率を 100% にする', (await P('return page.style.zoom')) === '1');
  // コピー: 消毒した HTML（画像は data:）と文字を渡す
  const copied = JSON.parse(await P(`const img = page.querySelector('img'); const r = document.createRange(); r.selectNode(img.parentElement); getSelection().removeAllRanges(); getSelection().addRange(r);
    const dt = new DataTransfer(); page.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); return JSON.stringify({ html: dt.getData('text/html').slice(0, 60), blob: dt.getData('text/html').includes('blob:') });`));
  ok('コピーすると、画像は data: の URL で渡す', /<p><img src="data:image\/png;base64,/.test(copied.html) && !copied.blob, copied.html);
  await clickJs(`[...${WIN}.querySelectorAll('.menu-title')].find((t) => t.textContent.trim().startsWith('書式'))`, 250);
  const fgc = await centerOf(`[...${WIN}.querySelectorAll('.menu-title.open .menu-item')].find((m) => m.textContent.trim().startsWith('文字の色'))`);
  await page.move(fgc[0], fgc[1]); await sleep(500);
  await shot('09-menu');
  await page.key('Escape'); await page.key('Escape'); await page.key('Escape'); await sleep(200);

  // ---- 縦書き ----
  await tool('vertical', 500);
  ok('縦書きのボタンで writing-mode が vertical-rl になる', (await P('return getComputedStyle(page).writingMode')) === 'vertical-rl');
  ok('状態の帯に縦書きと出る', /縦書き/.test(await P("return w.querySelector('[data-mode]').textContent")));
  await shot('05-vertical');

  // ---- 保存 ----
  await P('page.focus(); return 1;');
  await page.key('Control+s');
  await answerFile('夕暮れの報告');
  await sleep(600);
  const saved = await fsText('/ドキュメント/夕暮れの報告.fdoc');
  let sj = null;
  try { sj = JSON.parse(saved); } catch { /* 下で失敗にする */ }
  ok('Ctrl+S で /ドキュメント に .fdoc を保存する', !!sj && sj.format === 'future-os-fdoc' && sj.version === 1);
  ok('.fdoc に設定（縦書き・12pt・2 倍）と本文が入る', !!sj && sj.settings.writing === 'vertical' && sj.settings.fontSize === 12 && sj.settings.lineHeight === 2 && /<h1>夕暮れの報告<\/h1>/.test(sj.html) && /<strong>大事な<\/strong>/.test(sj.html) && /<table>/.test(sj.html) && /<img src="data:image\/png;base64,/.test(sj.html) && !/blob:|\u200B/.test(sj.html));
  ok('保存すると題名の * が消える', (await P("return w.querySelector('.title-bar-text').textContent")) === '夕暮れの報告.fdoc - 文書');
  ok('保存したら下書きを消す', !(await ev("return Object.keys(localStorage).some((k) => k.startsWith('fos-writer-draft-'))")));

  // ---- 書き出し ----
  await menu('ファイル', '書き出す', 'HTML');
  await answerFile('夕暮れの報告.html');
  const outHtml = await fsText('/ドキュメント/夕暮れの報告.html');
  ok('HTML に書き出す（1 つのファイル、画像は data:、紙と印刷の CSS、縦書き）', !!outHtml && /^<!doctype html>/.test(outHtml) && /@page \{ size: A4 portrait/.test(outHtml) && /writing-mode: vertical-rl/.test(outHtml) && /<img src="data:image\/png;base64,/.test(outHtml) && /<table>/.test(outHtml) && !/<script|blob:/.test(outHtml));
  await menu('ファイル', '書き出す', 'Markdown');
  await answerFile('夕暮れの報告.md');
  const md = await fsText('/ドキュメント/夕暮れの報告.md');
  ok('Markdown に書き出す（見出し・太字・斜体・表・箇条書き・画像）', !!md && /^# 夕暮れの報告$/m.test(md) && /\*\*大事な\*\*/.test(md) && /\*峠\*/.test(md) && /^\| 項目 \| 説明 \| 備考 \|$/m.test(md) && /^\| --- \| --- \| --- \|$/m.test(md) && /^- 箇条書きにする行$/m.test(md) && /!\[夕日\]\(data:image\/png;base64,/.test(md) && /^## 次の段落です。$/m.test(md), md ? md.replace(/\(data:[^)]+\)/, '(data:…)').slice(0, 400).replace(/\n/g, '⏎') : '');
  await menu('ファイル', '書き出す', 'テキスト');
  await answerFile('夕暮れの報告.txt');
  const txt = await fsText('/ドキュメント/夕暮れの報告.txt');
  ok('テキストに書き出す', !!txt && txt.startsWith('夕暮れの報告\n') && /・箇条書きにする行/.test(txt) && /項目\t説明\t備考/.test(txt));
  await menu('ファイル', 'パソコンへ書き出す', 'Markdown');
  let dl = [];
  for (let t = 0; t < 30 && !dl.length; t++) { await sleep(200); dl = readdirSync(DL).filter((f) => f.endsWith('.md')); }
  ok('パソコンへ Markdown を書き出す（ダウンロード）', dl.length === 1 && readFileSync(join(DL, dl[0]), 'utf8').startsWith('# 夕暮れの報告'), dl.join(','));

  // ---- 印刷 ----
  await ev(`window.__printFrame = null; new MutationObserver((ms, mo) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('wr-print')) { window.__printFrame = n; mo.disconnect(); } }).observe(document.body, { childList: true }); return 1;`);
  await menu('ファイル', '印刷');
  await sleep(600);
  const pr = JSON.parse(await ev("const f = window.__printFrame; if (!f) return 'null'; const d = f.contentDocument; return JSON.stringify({ sandbox: f.getAttribute('sandbox'), page: /@page \\{ size: A4 portrait/.test(d?.querySelector('style')?.textContent || ''), vertical: d ? getComputedStyle(d.documentElement).writingMode : '', table: !!d?.querySelector('table'), scripts: d ? d.querySelectorAll('script').length : -1 })"));
  ok('印刷は紙の形の HTML（印刷用の CSS 付き、スクリプトなし）を使う', !!pr && pr.page && pr.vertical === 'vertical-rl' && pr.table && pr.scripts === 0 && !/allow-scripts/.test(pr.sandbox), JSON.stringify(pr));

  // ---- 閉じて開き直す ----
  const sig = () => P("return JSON.stringify({ tags: [...page.querySelectorAll('*')].map((e) => e.localName + (e.getAttribute('style') ? '[' + e.getAttribute('style').replace(/\\s|;$/g, '') + ']' : '')).join(','), text: page.textContent.replace(/\\u200b/g, ''), mode: getComputedStyle(page).writingMode, font: getComputedStyle(page).fontSize + '/' + getComputedStyle(page).lineHeight, count: w.querySelector('[data-count]').textContent })");
  const before = await sig();
  await clickJs(`${WIN}.querySelector('.title-bar-controls .close')`, 700);
  ok('保存済みの文書は確かめずに閉じる', !(await ev("return !!document.querySelector('.app-writer') || !!document.querySelector('dialog.msgbox[open]')")));
  await ev("const shell = await import('./js/shell.mjs'); await shell.openFile('/ドキュメント/夕暮れの報告.fdoc'); return 1;");
  ok('.fdoc を開くと文書の窓で開く', await waitSel('.app-writer .wr-page h1', 10000));
  await sleep(800);
  const after = await sig();
  ok('開き直すと同じ状態に戻る（要素・書式・文字・縦書き・文字数）', before === after, before === after ? '' : `前 ${before.slice(0, 300)} / 後 ${after.slice(0, 300)}`);
  ok('開き直した画像も表示される', await P("const i = page.querySelector('img'); return !!i && i.complete && i.naturalWidth === 240"));
  await shot('06-reopened');

  // ---- 悪い .fdoc ----
  await ev('window.__pwned = 0; performance.clearResourceTimings(); return 1;');
  const evil = JSON.stringify({ format: 'future-os-fdoc', version: 1, settings: { writing: 'horizontal' }, html:
    '<p>安全な文</p><script>window.__pwned=1</script><img src=x onerror="window.__pwned=2"><p onclick="window.__pwned=3" style="background:url(https://example.com/bg.png)">押す</p>' +
    '<a href="javascript:window.__pwned=4">リンク</a><img src="https://example.com/track.png"><iframe src="javascript:parent.__pwned=5"></iframe><svg><image href="x" onerror="window.__pwned=6"/></svg>' +
    '<details open ontoggle="window.__pwned=7">開く</details><style>body{display:none}</style><object data="https://example.com/x.swf"></object><math><mi xlink:href="javascript:1">m</mi></math>' });
  await ev(`const fs = await import('./js/fs.mjs'); await fs.write('/ドキュメント/悪い文書.fdoc', ${JSON.stringify(evil)}); const shell = await import('./js/shell.mjs'); await shell.openFile('/ドキュメント/悪い文書.fdoc'); return 1;`);
  await waitJs(`${WIN}.querySelector('.title-bar-text').textContent.includes('悪い文書')`, 8000);
  await sleep(1500);
  ok('悪い .fdoc を開いてもスクリプトは動かない', (await ev('return window.__pwned')) === 0);
  const evilState = JSON.parse(await P("return JSON.stringify({ bad: page.querySelectorAll('script, iframe, svg, style, object, math, a, details').length, on: [...page.querySelectorAll('*')].some((e) => [...e.attributes].some((a) => /^on/i.test(a.name))), imgs: page.querySelectorAll('img').length, bg: [...page.querySelectorAll('[style]')].some((e) => /url/i.test(e.getAttribute('style'))), text: page.textContent })"));
  ok('script・iframe・svg・style・リンク・on〜 の属性・外の画像が残らない', evilState.bad === 0 && !evilState.on && evilState.imgs === 0 && !evilState.bg, JSON.stringify(evilState));
  ok('悪い .fdoc の中のふつうの文字は残る', /安全な文/.test(evilState.text) && /押す/.test(evilState.text) && /リンク/.test(evilState.text));
  ok('外の URL（example.com）を読みに行かない', !(await ev("return performance.getEntriesByType('resource').some((e) => e.name.includes('example.com'))")));
  await shot('07-evil');
  await ev(`const fs = await import('./js/fs.mjs'); await fs.write('/ドキュメント/壊れた文書.fdoc', 'これは文書ではありません'); const shell = await import('./js/shell.mjs'); shell.openFile('/ドキュメント/壊れた文書.fdoc'); return 1;`);
  ok('壊れた .fdoc は誤りの知らせを出す', await waitJs("document.querySelector('dialog.msgbox[open]')?.textContent.includes('読めません')", 6000));
  await shot('08-broken');
  if (await ev("return !!document.querySelector('dialog.msgbox[open]')")) await click('dialog.msgbox[open] button[data-close="OK"]', 400);
  ok('壊れた .fdoc のあとも白紙の文書の窓で書ける', await P("return page.isContentEditable && !page.querySelector('h1') && page.textContent === ''"));
  // 名前のない文書を閉じるときは、保存するかを聞く
  await clickJs(`${PAGE}`, 200);
  await page.typeText('名前のない文');
  await sleep(1300);
  await clickJs(`${WIN}.querySelector('.title-bar-controls .close')`, 600);
  ok('名前のない文書を閉じると、保存するかを聞く', await waitJs("document.querySelector('dialog.msgbox[open]')?.textContent.includes('保存しますか')", 4000));
  const drafts = () => ev("return Object.keys(localStorage).filter((k) => k.startsWith('fos-writer-draft-')).length");
  const d0 = await drafts();
  await click('dialog.msgbox[open] button[data-close="いいえ"]', 600);
  ok('「いいえ」で閉じ、その文書の下書きを消す', (await ev("return document.querySelectorAll('.app-writer').length")) === 2 && (await drafts()) === d0 - 1, `下書き ${d0} → ${await drafts()}`);
  // 次の起動で開き直すとき（窓の並びの記録に draftKey が残る）は、下書きから元の文書に戻る
  await ev(`const W = await import('./js/core/writer.mjs'); localStorage.setItem('fos-writer-draft-test', W.makeFdoc({ html: '<h2>下書きの見出し</h2><p>続きの文</p>', settings: { writing: 'vertical' } }));
    const shell = await import('./js/shell.mjs'); await shell.launch('writer', { draftKey: 'fos-writer-draft-test' }); return 1;`);
  await sleep(600);
  ok('下書きから開き直すと、本文と設定（縦書き）が戻る', await P("return page.querySelector('h2')?.textContent === '下書きの見出し' && getComputedStyle(page).writingMode === 'vertical-rl'"));
  ok('execCommand を使っていない（書式の変更は自前の DOM の操作）', !(await ev("return (await (await fetch('js/apps/writer.mjs')).text()).includes('execCommand(')")));
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'writer-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
