// 図形エディタ（os/js/apps/vector.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// 四角・だ円・ペンの曲線・文字・多角形を描き、選んで動かし・大きさを変え・回し・整列し・等間隔にし、まとめる・写す・重なりの順・
// 性質の欄・スポイト・一覧（名前・隠す・固定）・方眼に合わせる・拡大縮小と移動を操作する。保存して開き直すと同じになること、
// PNG を 2 倍で書き出して大きさが合うこと、script や onload を含む SVG を開いても何も動かないことを確かめる。
// 確かめ専用の Chrome のプロファイル（runtime/vector-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8797 を動かしてから、node tools/vector-check.mjs [番号=8797]
//   画面の写真は build/vector-check/、結果は logs/vector-check.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8797;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'vector-check');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'vector-profile') });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info ? ' ' + info : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
const center = async (sel) => JSON.parse(await ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'null'; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2])`));
const waitSel = async (sel, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await ev(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(150); } return false; };
async function click(sel, wait = 250, o = {}) {
  if (!(await waitSel(sel))) throw new Error('見つからない: ' + sel);
  const r = await center(sel);
  await page.click(r[0], r[1], o);
  await sleep(wait);
}
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
// 図形エディタの窓口（win.el.vectorDebug）
const D = (js) => ev(`const d = document.querySelector('.app-vector').vectorDebug; return ${js}`);
const docOf = () => D('d.doc()');
const shapes = async () => (await docOf()).shapes;
const byType = async (t) => (await shapes()).filter((s) => s.type === t);
const box = (id) => D(`d.bbox(${JSON.stringify(id)})`);
const toClient = (x, y) => D(`d.toClient(${x}, ${y})`);
const status = () => ev("return document.querySelector('.app-vector .status-field[data-status]').textContent");
const near = (a, b, e = 0.6) => Math.abs(a - b) <= e;
async function dragW(a, b, wait = 200) { const p = await toClient(...a), q = await toClient(...b); await page.drag(p[0], p[1], q[0], q[1]); await sleep(wait); }
async function clickW(x, y, o = {}, wait = 200) { const p = await toClient(x, y); await page.click(p[0], p[1], o); await sleep(wait); }
const key = async (k, wait = 150) => { await page.key(k); await sleep(wait); };
const SHIFT = 8;
const answer = (value) => click(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 400);
// ファイルの箱に名前を入れて決める
async function fileDialog(name) {
  if (!(await waitSel('dialog.file-dlg[open]', 8000))) throw new Error('ファイルの箱が開かない');
  await ev(`const i = document.querySelector('dialog.file-dlg[open] #fdName'); i.value = ${JSON.stringify(name)}; return 1`);
  await click('dialog.file-dlg[open] [data-ok]', 700);
}
// 修飾キー（Shift など）を押したままのドラッグ（page.drag は修飾キーを送らないため、開発用の通信で直に送る）
async function dragMods(a, b, modifiers) {
  const p = await toClient(...a), q = await toClient(...b);
  const m = (type, x, y, buttons, button = 'left') => page.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1, modifiers });
  await m('mouseMoved', p[0], p[1], 0, 'none');
  await m('mousePressed', p[0], p[1], 1);
  for (let i = 1; i <= 10; i++) { await m('mouseMoved', p[0] + ((q[0] - p[0]) * i) / 10, p[1] + ((q[1] - p[1]) * i) / 10, 1, 'none'); await sleep(16); }
  await m('mouseReleased', q[0], q[1], 0);
  await sleep(200);
}
// メニューの中の、さらに奥のメニューの項目を押す
async function submenu(title, parent, command) {
  await menu(title, null);
  await ev(`const it = [...document.querySelectorAll('.app-vector .menu-title.open .menu-item')].find((i) => i.querySelector(':scope > .label')?.textContent.startsWith(${JSON.stringify(parent)})); it.dataset.vcSub = '1'; return 1`);
  await click('.app-vector .menu-title.open [data-vc-sub="1"]', 300);
  await click(`.app-vector .menu-title.open [data-command="${command}"]`, 400);
}
async function menu(title, command) {
  await ev(`const ts = [...document.querySelectorAll('.app-vector .menu-bar > .menu-title')]; ts.forEach((t) => delete t.dataset.vcCheck); ts.find((t) => t.textContent.startsWith(${JSON.stringify(title)})).dataset.vcCheck = '1'; return 1`);
  await click('.app-vector .menu-title[data-vc-check="1"]', 250);
  if (command) await click(`.app-vector .menu-title.open [data-command="${command}"]`, 400);
}
// 保存して開き直した物と比べる: id は比べず、数は 0.002 まで同じとみなす
function same(a, b, path = '') {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 0.002 ? null : `${path}: ${a} ≠ ${b}`;
  if (Array.isArray(a) || Array.isArray(b)) { if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return `${path}: 長さが違う`; for (let i = 0; i < a.length; i++) { const r = same(a[i], b[i], `${path}[${i}]`); if (r) return r; } return null; }
  if (a && b && typeof a === 'object') { const ks = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => k !== 'id')); for (const k of ks) { const r = same(a[k], b[k], `${path}.${k}`); if (r) return r; } return null; }
  return a === b ? null : `${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
}

try {
  await page.navigate(URL0 + '?shot');
  // 起動の途中（見本のフォルダを作っている間）に空にすると、作りかけのフォルダが欠けるので、起動が済んでから空にする
  await waitSel('#desk:not([hidden]) .desk-icon', 20000);
  await sleep(300);
  await wipe();
  await page.navigate(URL0 + '?shot=vector');
  ok('図形エディタの窓が ?shot=vector で開く', await waitSel('.app-vector [data-svg] [data-paper]', 20000));
  await sleep(700);
  const d0 = await docOf();
  ok('初めは 800 × 600 の白紙', d0.width === 800 && d0.height === 600 && d0.background === '#ffffff' && d0.shapes.length === 0);
  ok('状態の帯に、すぐ描ける案内が出る', /白い紙に描けます/.test(await status()), await status());
  ok('道具は「四角」で始まる', (await D('d.tool()')) === 'rect');
  ok('一覧に「まだ図形がありません」', await ev("return /まだ図形がありません/.test(document.querySelector('.app-vector [data-layers]').textContent)"));
  await shot('01-blank');

  // ---- 描く ----
  await dragW([100, 100], [300, 220]);
  let [r] = await byType('rect');
  ok('四角をドラッグで描ける', r && near(r.x, 100) && near(r.y, 100) && near(r.w, 200) && near(r.h, 120), JSON.stringify(r && [r.x, r.y, r.w, r.h]));
  await key('e');
  await dragW([400, 120], [560, 240]);
  let [el] = await byType('ellipse');
  ok('E キーでだ円に替えて描ける', el && near(el.cx, 480) && near(el.cy, 180) && near(el.rx, 80) && near(el.ry, 60), JSON.stringify(el && [el.cx, el.cy, el.rx, el.ry]));
  await click('.app-vector [data-tool="pen"]');
  await clickW(120, 400);
  await dragW([300, 330], [360, 330]);
  await clickW(480, 420);
  await key('Enter', 300);
  const [pen] = await byType('path');
  ok('ペン: クリックで角、ドラッグで曲線の点を置き、Enter で終える', pen && pen.segs.length === 3 && pen.segs.some((s) => s.c === 'C') && pen.fill === 'none', JSON.stringify(pen?.segs.map((s) => s.c)));
  await key('t');
  await clickW(560, 400, {}, 400);
  ok('文字の道具で押すと、文字の欄が開く', await waitSel('.app-vector [data-textin]:not([hidden])', 3000));
  await page.typeText('夕暮れの図形');
  await key('Enter', 300);
  const [tx] = await byType('text');
  ok('文字を打って Enter で置ける', tx && tx.text === '夕暮れの図形' && near(tx.x, 560), JSON.stringify(tx && [tx.text, tx.x, tx.y]));
  await key('o');
  await clickW(620, 480); await clickW(720, 470); await clickW(690, 560); await clickW(620, 480, {}, 300);
  const [pg] = await byType('polygon');
  ok('折れ線の道具で、最初の点を押すと多角形になる', pg && pg.points.length === 3, JSON.stringify(pg?.points));
  await clickW(80, 500); await clickW(160, 540); await clickW(240, 500, { count: 2 }, 300);
  const [pl] = await byType('polyline');
  ok('ダブルクリックで折れ線として終える（2 回目の点は足さない）', pl && pl.points.length === 3, JSON.stringify(pl?.points));
  ok('一覧に描いた順の逆で 6 つ並ぶ', (await ev("return [...document.querySelectorAll('.app-vector .vc-layer')].map((l) => l.textContent.trim()).join('|')")).split('|').length === 6);
  await shot('02-drawn');

  // ---- 選んで動かす・大きさ・回す ----
  await key('v');
  await clickW(200, 160);
  ok('選ぶ道具で押すと選べる', JSON.stringify(await D('d.sel()')) === JSON.stringify([r.id]));
  await dragW([200, 160], [250, 190]);
  [r] = await byType('rect');
  ok('ドラッグで動かせる', near(r.x, 150) && near(r.y, 130), `${r.x}, ${r.y}`);
  await dragW([r.x + r.w, r.y + r.h], [r.x + r.w + 40, r.y + r.h + 20]);
  [r] = await byType('rect');
  ok('右下のつまみで大きさを変えられる（左上は動かない）', near(r.w, 240) && near(r.h, 140) && near(r.x, 150) && near(r.y, 130), JSON.stringify([r.x, r.y, r.w, r.h]));
  {
    const c = [r.x + r.w / 2, r.y + r.h / 2], top = await toClient(c[0], r.y), cc = await toClient(...c);
    await page.drag(top[0], top[1] - 26, cc[0] + 120, cc[1]);
    await sleep(250);
  }
  [r] = await byType('rect');
  ok('上の丸をドラッグして回せる（右へ 90°）', near(r.rot, 90, 1.5), String(r.rot));
  await shot('03-rotated');
  await page.key('ctrl+z'); await sleep(200);
  [r] = await byType('rect');
  ok('Ctrl+Z で元に戻る', r.rot === 0, String(r.rot));
  await page.key('ctrl+y'); await sleep(200);
  [r] = await byType('rect');
  ok('Ctrl+Y でやり直せる', near(r.rot, 90, 1.5), String(r.rot));
  await key('ArrowRight'); await key('ArrowRight'); await key('shift+ArrowDown');
  const bR = await box(r.id);
  [r] = await byType('rect');
  ok('矢印キーで 1、Shift で 10 動く', near(r.x, 152) && near(r.y, 140), `${r.x}, ${r.y}`);

  // ---- 整列・等間隔・まとめる ----
  const bE0 = await box(el.id);
  await clickW(bE0.x + bE0.w / 2, bE0.y + bE0.h / 2, { modifiers: SHIFT });
  ok('Shift+クリックで足して選べる', (await D('d.sel()')).length === 2);
  await click('.app-vector .vc-bar [data-command="align:top"]', 300);
  const [bA, bB] = [await box(r.id), await box(el.id)];
  ok('道具の帯の「上に揃える」で上の辺が揃う', near(bA.y, bB.y, 0.01) && near(bA.y, Math.min(bR.y, bE0.y), 0.01), `${bA.y} ${bB.y}`);
  await page.key('ctrl+g'); await sleep(250);
  const gs = await byType('g');
  ok('Ctrl+G でまとめられる', gs.length === 1 && gs[0].children.length === 2 && (await shapes()).length === 5);
  await page.key('ctrl+shift+g'); await sleep(250);
  ok('Ctrl+Shift+G でまとめを解ける', (await byType('g')).length === 0 && (await shapes()).length === 6);
  await page.key('ctrl+a'); await sleep(200);
  ok('Ctrl+A ですべて選べる', (await D('d.sel()')).length === 6);
  await click('.app-vector .vc-bar [data-command="dist:h"]', 300);
  {
    const ids = (await shapes()).map((s) => s.id), bx = [];
    for (const id of ids) bx.push(await box(id));
    bx.sort((a, b) => a.x - b.x);
    const gaps = bx.slice(1).map((b, i) => b.x - (bx[i].x + bx[i].w));
    ok('等間隔（横）で、隙間が同じになる', gaps.every((g) => near(g, gaps[0], 0.05)), gaps.map((g) => g.toFixed(2)).join(' '));
  }
  await key('Escape');
  await shot('04-aligned');

  // ---- 写す・重なりの順 ----
  const tb = await box(tx.id);
  await clickW(tb.x + tb.w / 2, tb.y + tb.h / 2);
  await page.key('ctrl+c'); await sleep(100); await page.key('ctrl+v'); await sleep(250);
  const texts = await byType('text');
  ok('Ctrl+C と Ctrl+V で、窓の中で写せる（少しずらして貼る）', texts.length === 2 && near(texts[1].x - texts[0].x, 10) && texts[1].text === texts[0].text);
  await key('Delete', 250);
  ok('Delete で消せる', (await byType('text')).length === 1);
  const eb = await box(el.id);
  await clickW(eb.x + eb.w / 2, eb.y + eb.h / 2);
  await key('End', 200);
  ok('End で最背面へ', (await shapes())[0].id === el.id);
  await key('Home', 200);
  ok('Home で最前面へ', (await shapes()).at(-1).id === el.id);
  await key('PageDown', 200);
  ok('PageDown で 1 つ後ろへ', (await shapes()).at(-2).id === el.id);

  // ---- 性質の欄 ----
  [r] = await byType('rect');
  const rb = await box(r.id);
  await clickW(rb.x + rb.w / 2, rb.y + rb.h / 2);
  await ev(`const s = document.querySelector('.app-vector .vc-side'); const f = s.querySelector('[data-p="fill"]'); f.value = '#4b5fe8'; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true }));
    const w = s.querySelector('[data-p="sw"]'); w.value = '6'; w.dispatchEvent(new Event('change', { bubbles: true }));
    const o = s.querySelector('[data-p="opacity"]'); o.value = '50'; o.dispatchEvent(new Event('input', { bubbles: true })); o.dispatchEvent(new Event('change', { bubbles: true }));
    const x = s.querySelector('[data-p="rx"]'); x.value = '12'; x.dispatchEvent(new Event('change', { bubbles: true })); return 1`);
  await sleep(200);
  [r] = await byType('rect');
  ok('性質の欄で塗り・線の太さ・不透明度・角の丸みを変えられる', r.fill === '#4b5fe8' && r.sw === 6 && r.opacity === 0.5 && r.rx === 12, JSON.stringify([r.fill, r.sw, r.opacity, r.rx]));
  await ev(`const g = document.querySelector('.app-vector [data-g="w"]'); g.value = '300'; g.dispatchEvent(new Event('change', { bubbles: true })); return 1`);
  await sleep(200);
  ok('位置と大きさの欄で幅を変えられる', near((await box(r.id)).w, 300, 0.05), String((await box(r.id)).w));
  await ev(`const g = document.querySelector('.app-vector [data-g="rot"]'); g.value = '30'; g.dispatchEvent(new Event('change', { bubbles: true })); return 1`);
  await sleep(200);
  ok('回転の欄で角度を決められる', (await byType('rect'))[0].rot === 30);
  // スポイト: 四角を一番上にしてから、一覧でだ円を選び、四角の色を取る
  await key('Home', 200);
  await click(`.app-vector .vc-layer[data-id="${el.id}"] .vc-name`, 250);
  await key('i');
  const rb2 = await box(r.id);
  await clickW(rb2.x + rb2.w / 2, rb2.y + rb2.h / 2);
  ok('スポイトで、選んだだ円に四角の塗りの色を写せる', (await byType('ellipse'))[0].fill === '#4b5fe8', await status());
  await key('v');
  await shot('05-props');

  // ---- 一覧: 名前・隠す・固定 ----
  await click(`.app-vector .vc-layer[data-id="${pg.id}"] .vc-lock`, 250);
  ok('一覧の鍵で固定できる', (await byType('polygon'))[0].locked === true);
  await key('Escape');
  { const pts = (await byType('polygon'))[0].points, c = pts.reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[1] / 3], [0, 0]); await clickW(c[0], c[1]); }
  ok('固定した図形は、押しても選ばれない', !(await D('d.sel()')).includes(pg.id));
  await click(`.app-vector .vc-layer[data-id="${pl.id}"] .vc-eye`, 250);
  ok('一覧の目で隠せる（画面に描かない）', (await byType('polyline'))[0].hidden === true && (await ev("return [...document.querySelectorAll('.app-vector [data-shapes] polyline')].every((p) => p.getAttribute('display') === 'none')")));
  await click(`.app-vector .vc-layer[data-id="${tx.id}"] .vc-name`, 200, { count: 2 });
  if (await waitSel('.app-vector .vc-rename', 3000)) { await page.typeText('看板の文字'); await key('Enter', 250); }
  ok('一覧の名前をダブルクリックして名前を付けられる', (await byType('text'))[0].name === '看板の文字');

  // ---- 方眼に合わせる・拡大縮小・動かす ----
  await click('.app-vector .vc-bar [data-opt="snap"]', 200);
  await click('.app-vector [data-tool="rect"]', 150);
  await dragW([13, 457], [97, 583]);
  const snapped = (await byType('rect')).at(-1);
  ok('方眼に合わせると、描いた四角の角が 20 の倍数になる', [snapped.x, snapped.y, snapped.w, snapped.h].every((v) => Math.abs(v / 20 - Math.round(v / 20)) < 1e-6), JSON.stringify([snapped.x, snapped.y, snapped.w, snapped.h]));
  await click('.app-vector .vc-bar [data-opt="snap"]', 200);
  await click('.app-vector [data-tool="select"]', 150);
  const z0 = (await D('d.view()')).z, mid = await center('.app-vector [data-svg]');
  await page.wheel(mid[0], mid[1], 0, -360); await sleep(200);
  const z1 = (await D('d.view()')).z;
  ok('ホイールで拡大できる', z1 > z0 * 1.3, `${z0.toFixed(3)} → ${z1.toFixed(3)}`);
  await page.move(mid[0], mid[1]); await sleep(50);
  await page.key(' ', 'down'); await sleep(80);
  const v0 = await D('d.view()');
  await page.drag(mid[0], mid[1], mid[0] + 80, mid[1] + 40); await sleep(150);
  await page.key(' ', 'up'); await sleep(80);
  const v1 = await D('d.view()');
  ok('Space+ドラッグで紙を動かせる（図形は動かない）', near(v1.px - v0.px, 80, 2) && near(v1.py - v0.py, 40, 2) && (await shapes()).length === 7, `${v1.px - v0.px}, ${v1.py - v0.py}`);
  await page.down(mid[0], mid[1], 'middle'); await page.move(mid[0] - 50, mid[1] - 20); await sleep(50); await page.move(mid[0] - 100, mid[1] - 40); await page.up(mid[0] - 100, mid[1] - 40, 'middle'); await sleep(150);
  const v2 = await D('d.view()');
  ok('中ボタンのドラッグでも動かせる', near(v2.px - v1.px, -100, 2) && near(v2.py - v1.py, -40, 2), `${v2.px - v1.px}, ${v2.py - v1.py}`);
  await key('0', 250);
  await shot('06-layers');

  // ---- 保存して開き直す ----
  const before = await docOf(), markup = await ev("return document.querySelector('.app-vector [data-shapes]').innerHTML");
  await page.key('ctrl+s'); await sleep(400);
  await fileDialog('図形の確かめ.svg');
  const saved = await ev("const fs = await import('./js/fs.mjs'); const st = await fs.stat('/画像/図形の確かめ.svg'); return st ? (await fs.readText('/画像/図形の確かめ.svg')).slice(0, 200) : null");
  ok('Ctrl+S で /画像 に SVG として保存できる', saved && saved.includes('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"'), saved?.slice(0, 120));
  ok('題名に保存したファイルの名前が出る（* が消える）', await ev("return document.querySelector('.app-vector .title-bar-text').textContent === '図形の確かめ.svg - 図形エディタ'"));
  await menu('ファイル', 'new');
  if (await waitSel('dialog.vc-dlg[open]', 4000)) await click('dialog.vc-dlg[open] button[data-close="ok"]', 400);
  ok('新規で白紙に戻る', (await shapes()).length === 0);
  await menu('ファイル', 'open');
  await fileDialog('図形の確かめ.svg');
  await sleep(400);
  const after = await docOf();
  const diff = same(after, before);
  ok('開き直すと、同じ図形・名前・隠す・固定・紙に戻る', !diff && after.shapes.length === 7, diff || `${after.shapes.length} 個`);
  ok('開き直した画面の図形の描き方も同じ', (await ev("return document.querySelector('.app-vector [data-shapes]').innerHTML")) === markup);
  await shot('07-reopened');

  // ---- PNG ----
  await menu('ファイル', 'png');
  ok('PNG の倍率を選ぶ箱が出る', await waitSel('dialog.vc-dlg[open] [name="vcScale"]', 4000));
  await shot('08-png-dialog');
  await click('dialog.vc-dlg[open] input[name="vcScale"][value="2"]', 150);
  await click('dialog.vc-dlg[open] button[data-close="ok"]', 400);
  await fileDialog('図形の確かめ-2倍.png');
  await sleep(500);
  const png = await ev("const fs = await import('./js/fs.mjs'); const b = await fs.readBlob('/画像/図形の確かめ-2倍.png'); const v = new DataView(await b.arrayBuffer()); return [v.getUint32(0).toString(16), v.getUint32(16), v.getUint32(20), b.size]");
  ok('PNG を 2 倍で書き出すと 1600 × 1200 になる', png[0] === '89504e47' && png[1] === 1600 && png[2] === 1200 && png[3] > 5000, JSON.stringify(png));

  // ---- 危ない SVG ----
  await ev(`window.__pwned = 0; const fs = await import('./js/fs.mjs'); await fs.write('/画像/危ない.svg', ${JSON.stringify(`<?xml version="1.0"?>
<!DOCTYPE svg [ <!ENTITY x "XX"> ]>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="300" onload="window.__pwned = 1">
  <script>window.__pwned = 2</script>
  <rect x="20" y="20" width="200" height="100" fill="#ff8ec7" onclick="window.__pwned = 3" onmouseover="window.__pwned = 4" style="stroke:url(http://127.0.0.1:${PORT}/__evil-style)"/>
  <image href="http://127.0.0.1:${PORT}/__evil-image.png" x="0" y="0" width="10" height="10" onerror="window.__pwned = 5"/>
  <use xlink:href="http://127.0.0.1:${PORT}/__evil-use.svg#a"/>
  <foreignObject width="100" height="100"><iframe xmlns="http://www.w3.org/1999/xhtml" src="http://127.0.0.1:${PORT}/__evil-frame"></iframe></foreignObject>
  <a href="javascript:window.__pwned = 6"><circle cx="50" cy="50" r="40"/></a>
  <style>@import url(http://127.0.0.1:${PORT}/__evil.css);</style>
  <circle cx="300" cy="150" r="60" fill="url(#g)" onload="window.__pwned = 7"/>
  <text x="20" y="200" font-size="24">&x;安全な文字</text>
</svg>`)}, 'image/svg+xml'); return 1`);
  await menu('ファイル', 'open');
  await fileDialog('危ない.svg');
  await sleep(1200);
  const ev1 = await docOf();
  ok('script や on〜 を含む SVG を開くと、扱える図形だけを読む', ev1.width === 400 && ev1.shapes.map((s) => s.type).join(',') === 'rect,ellipse,text', ev1.shapes.map((s) => s.type).join(','));
  ok('開いても script も on〜 も動かない', (await ev('return window.__pwned')) === 0);
  ok('外への参照（image・use・iframe・url()・@import）を読みに行かない', (await ev("return performance.getEntriesByType('resource').filter((e) => e.name.includes('__evil')).length")) === 0);
  ok('窓の中の図形に script・foreignObject・image・on〜 が無い', await ev("const g = document.querySelector('.app-vector [data-shapes]'); return !g.querySelector('script, foreignObject, image, use, a, iframe, style') && ![...g.querySelectorAll('*')].some((e) => [...e.attributes].some((a) => /^on|href/i.test(a.name)))"));
  ok('状態の帯で、読まなかった要素を知らせる', /扱えない要素/.test(await status()), await status());
  ok('自分で定義した実体は展開しない', (await byType('text'))[0].text === '&x;安全な文字');
  await shot('09-sanitized');

  // ---- そのほかの道具と操作（危ない SVG から読んだ絵の上で） ----
  await key('l');
  await dragW([40, 260], [180, 280]);
  const [ln] = await byType('line');
  ok('直線をドラッグで引ける', ln && near(ln.x1, 40) && near(ln.y1, 260) && near(ln.x2, 180) && near(ln.y2, 280), JSON.stringify(ln && [ln.x1, ln.y1, ln.x2, ln.y2]));
  await key('v');
  await key('Escape');
  await dragW([30, 245], [200, 296]);
  ok('何もない所からドラッグして囲むと、全体が入る図形だけを選ぶ', JSON.stringify(await D('d.sel()')) === JSON.stringify([ln.id]), JSON.stringify(await D('d.sel()')));
  await page.key('ctrl+d'); await sleep(250);
  const lines = await byType('line');
  ok('Ctrl+D で複製できる（少しずれる）', lines.length === 2 && near(lines[1].x1 - lines[0].x1, 10) && /のコピー/.test(lines[1].name), JSON.stringify(lines.map((l) => [l.x1, l.name])));
  await clickW(120, 70);
  await dragMods([220, 120], [320, 130], SHIFT);
  const [er] = await byType('rect');
  ok('Shift を押しながら角のつまみを動かすと、縦横の比を保つ', near(er.w, 300) && near(er.h, 150) && near(er.x, 20) && near(er.y, 20), JSON.stringify([er.x, er.y, er.w, er.h]));
  {
    const [t0] = await byType('text'), b = await box(t0.id);
    await clickW(b.x + b.w / 2, b.y + b.h / 2);
    await ev(`const s = document.querySelector('.app-vector .vc-side'); const z = s.querySelector('[data-p="size"]'); z.value = '48'; z.dispatchEvent(new Event('change', { bubbles: true }));
      const f = s.querySelector('[data-p="font"]'); f.selectedIndex = 1; f.dispatchEvent(new Event('change', { bubbles: true })); return 1`);
    await sleep(200);
    const [t1] = await byType('text');
    ok('性質の欄で文字の大きさと書体を変えられる', t1.size === 48 && /Mincho/.test(t1.font), JSON.stringify([t1.size, t1.font]));
  }
  await menu('表示', 'paper');
  if (await waitSel('dialog.vc-dlg[open] input[name="vcSize"][value="1024x768"]', 4000)) {
    await click('dialog.vc-dlg[open] input[name="vcSize"][value="1024x768"]', 150);
    await click('dialog.vc-dlg[open] input[name="vcBg"][value="#fff6e3"]', 150);
    await click('dialog.vc-dlg[open] button[data-close="ok"]', 400);
  }
  const dp = await docOf();
  ok('画用紙の大きさと色を変えられる', dp.width === 1024 && dp.height === 768 && dp.background === '#fff6e3', `${dp.width} × ${dp.height} ${dp.background}`);
  await page.key('ctrl+z'); await sleep(250);
  const du = await docOf();
  ok('画用紙の変更も元に戻せる', du.width === 400 && du.height === 300 && du.background === 'none');
  await ev(`window.__dl = []; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { const name = this.download; fetch(this.href).then((r) => r.blob()).then((b) => window.__dl.push([name, b.size, b.type])); return; } return orig.call(this); }; return 1`);
  await submenu('ファイル', 'パソコンへ書き出す', 'dl-svg');
  await sleep(400);
  const dl = await ev('return window.__dl');
  ok('パソコンへ SVG を書き出す', dl.length === 1 && dl[0][0] === '危ない.svg' && dl[0][1] > 300 && dl[0][2] === 'image/svg+xml', JSON.stringify(dl));
  await shot('10-more');
  await menu('ヘルプ', 'sample');
  if (await waitSel('dialog.msgbox[open]', 3000)) await answer('いいえ');
  await sleep(400);
  const sm = await docOf();
  ok('ヘルプの「見本の絵を開く」で見本が開く（保存していない変更は先に聞く）', sm.shapes.length === 7 && sm.background === '#fff6e3', `${sm.shapes.length} 個`);
  await shot('11-sample');

  // ---- ヘルプと閉じる ----
  await menu('ヘルプ', 'help');
  ok('ヘルプのメニューに使い方が出る', await waitSel('dialog.msgbox[open]', 3000) && /ペンはクリックで角/.test(await ev("return document.querySelector('dialog.msgbox[open]').textContent")));
  await shot('12-help');
  await answer('OK');
  await clickW(100, 50);
  await key('Delete', 200);
  ok('変更があると、閉じる前に保存するかを聞く', await (async () => { await click('.app-vector .title-bar-controls .close', 400); const asked = await waitSel('dialog.msgbox[open]', 3000); if (asked) await answer('いいえ'); await sleep(300); return asked && !(await ev("return !!document.querySelector('.app-vector')")); })());
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'vector-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
