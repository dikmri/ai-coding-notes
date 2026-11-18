// ドット絵エディタ（os/js/apps/pixel.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// マウスで数画素を描き、右のボタンで消し、四角・だ円・対称・塗りつぶし・スポイト・範囲を動かす・元に戻すを試す。
// コマを足し・複製し・並べ替え、オニオンスキンと見本の再生を見る。.pxa に保存して開き直し、同じ姿に戻るかを比べる。
// 今のコマの PNG（4 倍）、スプライトシートの PNG、アニメ GIF を /画像 へ書き出し、中身（大きさ、GIF の先頭とコマの数）を確かめる。
// GIF は自前の読み取り（core/pixel.mjs）と、ブラウザの ImageDecoder の両方で読み、画素が合うかを見る。
// 確かめ専用の Chrome のプロファイル（runtime/pixel-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8794 を動かしてから、node tools/pixel-check.mjs [番号=8794]
//   画面の写真は build/pixel-check/、結果は logs/pixel-check.json
import { writeFileSync, mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8794;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'pixel-check');
// 記録（tools/serve.mjs が logs/app.log に追記する）は、この確かめで増えた所だけを読む
const APPLOG = join(ROOT, 'logs', 'app.log'), log0 = existsSync(APPLOG) ? statSync(APPLOG).size : 0;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'pixel-profile') });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info: typeof info === 'string' ? info : JSON.stringify(info) }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info !== '' ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
const waitSel = async (sel, ms = 15000) => { for (let t = 0; t < ms; t += 120) { if (await ev(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(120); } return false; };
const center = async (sel) => JSON.parse(await ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'null'; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2])`));
async function click(sel, wait = 250, opts = {}) {
  if (!(await waitSel(sel))) throw new Error('見つからない: ' + sel);
  const r = await center(sel);
  await page.click(r[0], r[1], opts);
  await sleep(wait);
}
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
// 最後に開いたドット絵エディタの窓（win.pixel が中の様子を読む窓口）
const WIN = "(await import('./js/wm.mjs')).list().filter((w) => w.app === 'pixel').at(-1)";
const S = (expr) => ev(`const win = ${WIN}; const p = win.pixel; return ${expr};`);
const key = async (k, wait = 120) => { await page.key(k); await sleep(wait); };
// 絵の (x, y) の画素のまん中の画面の位置
async function at(x, y) {
  const r = JSON.parse(await ev(`const win = ${WIN}; const r = win.el.querySelector('[data-canvas]').getBoundingClientRect(); return JSON.stringify([r.left, r.top, win.pixel.zoom])`));
  return [r[0] + (x + 0.5) * r[2], r[1] + (y + 0.5) * r[2]];
}
const pxAt = (x, y, frame = 'p.cur') => S(`Array.from(p.doc.frames[${frame}].slice((${y} * p.doc.width + ${x}) * 4, (${y} * p.doc.width + ${x}) * 4 + 4)).join(',')`);
async function drawDrag(a, b, button = 'left') {
  const [sx, sy] = await at(...a), [ex, ey] = await at(...b);
  await page.move(sx, sy); await page.down(sx, sy, button);
  for (let i = 1; i <= 8; i++) { await page.move(sx + ((ex - sx) * i) / 8, sy + ((ey - sy) * i) / 8); await sleep(12); }
  await page.up(ex, ey, button); await sleep(150);
}
const tap = async (x, y, button = 'left') => { const [cx, cy] = await at(x, y); await page.click(cx, cy, { button }); await sleep(120); };
const command = (cmd, kind) => ev(`const win = ${WIN}; const item = ${kind ? `win.el.querySelector('.menu-item[data-command="${cmd}"][data-kind="${kind}"]')` : 'null'}; win.body.dispatchEvent(new CustomEvent('w95:command', { detail: { command: '${cmd}', item, checked: undefined }, bubbles: true })); return true;`);
const answer = (value) => click(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 400);
// 開く・保存の箱に名前を入れて決める
async function fileDlg(name) {
  if (!(await waitSel('dialog.file-dlg[open] #fdName', 8000))) throw new Error('ファイルの箱が開かない');
  await ev(`const i = document.querySelector('dialog.file-dlg[open] #fdName'); i.value = ${JSON.stringify(name)}; return true;`);
  await click('dialog.file-dlg[open] [data-ok]', 500);
}
const readBytes = (path) => ev(`const fs = await import('./js/fs.mjs'); const b = new Uint8Array(await (await fs.readBlob(${JSON.stringify(path)})).arrayBuffer()); return Array.from(b);`);
const INK = '27,21,38,255', SHU = '214,88,74,255', CLR = '0,0,0,0';

try {
  // 起動の途中で空にすると、あとから見本の書き込みが残り、次の起動で /画像 が作られないことがある。起動を待ってから空にする
  await page.navigate(URL0 + '?shot');
  await waitSel('#desk:not([hidden]) .desk-icon', 20000);
  await sleep(800);
  await wipe();
  await page.navigate(URL0 + '?shot=pixel');
  ok('ドット絵エディタの窓が開く', await waitSel('.app-pixel [data-canvas]', 20000));
  ok('仮想ドライブに /画像 がある', await ev("const fs = await import('./js/fs.mjs'); for (let i = 0; i < 40 && !(await fs.exists('/画像')); i++) await new Promise((r) => setTimeout(r, 100)); return await fs.exists('/画像');"));
  await sleep(600);
  const first = JSON.parse(await S("JSON.stringify({ w: p.doc.width, h: p.doc.height, frames: p.doc.frames.length, blank: p.doc.frames[0].every((v) => v === 0), title: win.title, status: win.el.querySelector('.status-field[data-status]').textContent, tool: p.tool, zoom: p.zoom })"));
  ok('はじめは白紙の 32×32、1 コマ、鉛筆', first.w === 32 && first.h === 32 && first.frames === 1 && first.blank && first.tool === 'pencil', first);
  ok('題名は「無題 - ドット絵エディタ」', first.title === '無題 - ドット絵エディタ', first.title);
  ok('状態の帯に描き方の案内が出る', /左のボタン/.test(first.status) && /ホイール/.test(first.status), first.status);
  ok('窓に合わせて拡大する（32 画素なら 8 倍以上）', first.zoom >= 8, first.zoom);
  ok('道具のボタンの title にキーが書いてある', await ev("return [...document.querySelectorAll('.app-pixel .px-tool')].every((b) => /（.+）/.test(b.title))"));
  await shot('01-start');

  // 鉛筆で数画素とドラッグの線
  await tap(2, 2); await tap(3, 2);
  await drawDrag([5, 5], [12, 5]);
  ok('鉛筆: 押した画素が左の色（墨）になる', (await pxAt(2, 2)) === INK && (await pxAt(3, 2)) === INK);
  ok('鉛筆: ドラッグした線の画素が全部塗られる', (await S("[5,6,7,8,9,10,11,12].every((x) => p.doc.frames[0][(5 * 32 + x) * 4 + 3] === 255)")) === true);
  // 右のボタンは右の色（はじめは透明）
  await tap(3, 2, 'right');
  ok('右のボタン: 右の色（透明）で消える', (await pxAt(3, 2)) === CLR);
  ok('最近使った色に墨が入る', (await S("p.recent[0]")) === '#1b1526');
  await key('e');
  await tap(6, 5);
  ok('E で消しゴム: 押した画素が透明になる', (await S('p.tool')) === 'eraser' && (await pxAt(6, 5)) === CLR && (await pxAt(5, 5)) === INK);
  await key('b');

  // 色の並びの朱を選び、四角・塗っただ円・対称・直線
  await click('.app-pixel [data-slot="6"]');
  ok('並びを左クリックで左の色が朱になる', (await S("p.colors[0].join(',')")) === SHU);
  await click('.app-pixel [data-slot="11"]', 250, { button: 'right' });
  ok('並びを右クリックで右の色が藍になる', (await S("p.colors[1].join(',')")) === '43,90,120,255');
  await key('u');
  ok('U で四角の道具', (await S('p.tool')) === 'rect');
  await drawDrag([2, 20], [8, 26]);
  ok('四角: 枠は塗られ、中は空く', (await pxAt(2, 23)) === SHU && (await pxAt(5, 23)) === CLR);
  await key('Shift+c');
  ok('Shift+C で塗っただ円の道具', (await S('p.tool')) === 'ellipsef');
  await drawDrag([20, 20], [28, 28], 'right');
  ok('塗っただ円: 右のボタンで右の色（藍）の中が塗られる', (await pxAt(24, 24)) === '43,90,120,255' && (await pxAt(20, 20)) === CLR);
  await key('b'); await key('h');
  ok('H で左右対称がオン（ボタンとメニューに印）', (await S("win.el.querySelector('[data-a=\"mirrorx\"]').getAttribute('aria-pressed') === 'true' && win.el.querySelector('.menu-item[data-command=\"mirrorx\"]').classList.contains('checked')")) === true);
  await tap(1, 12);
  ok('左右対称: (1,12) を描くと (30,12) にも描かれる', (await pxAt(1, 12)) === SHU && (await pxAt(30, 12)) === SHU);
  await key('h');
  await key('l');
  await drawDrag([14, 10], [18, 14]);
  ok('直線: 斜めの線の両端と中が塗られる', (await pxAt(14, 10)) === SHU && (await pxAt(16, 12)) === SHU && (await pxAt(18, 14)) === SHU);
  await shot('02-drawn');

  // 塗りつぶし → 元に戻す・やり直し
  await click('.app-pixel [data-slot="9"]');
  await key('g');
  await tap(16, 28);
  const filled = await S("p.doc.frames[0].reduce((n, v, i) => n + (i % 4 === 0 && v === 163 && p.doc.frames[0][i + 1] === 207 ? 1 : 0), 0)");
  ok('塗りつぶし: 透明で続いた所が若葉になる（数百画素）', filled > 300 && (await pxAt(16, 28)) === '163,207,85,255', filled);
  ok('塗りつぶし: 四角の中（囲まれた所）は塗られない', (await pxAt(5, 23)) === CLR);
  await key('Control+z');
  ok('Ctrl+Z で塗りつぶしの前に戻る', (await pxAt(16, 28)) === CLR && (await pxAt(18, 14)) === SHU);
  await key('Control+y');
  ok('Ctrl+Y でやり直す', (await pxAt(16, 28)) === '163,207,85,255');
  await key('Control+z');
  // スポイト
  await key('i');
  await tap(24, 24);
  ok('スポイト: 押した画素の色が左の色になる', (await S("p.colors[0].join(',')")) === '43,90,120,255');

  // 範囲を選んで動かす（ドラッグと矢印キー）
  await key('m');
  await drawDrag([1, 1], [4, 3]);
  ok('範囲を選ぶ: ドラッグで 4×3 を選ぶ', (await S("JSON.stringify(p.sel)")) === '{"x":1,"y":1,"w":4,"h":3}', await S("JSON.stringify(p.sel)"));
  await key('ArrowRight'); await key('ArrowRight'); await key('ArrowDown');
  ok('矢印キーで選んだ範囲が動く（右へ 2、下へ 1）', (await S("p.floating && p.floating.x === 3 && p.floating.y === 2")) === true);
  await shot('03-select');
  await key('Enter');
  ok('Enter で置くと (2,2) の墨が (4,3) へ移り、元の所は透明', (await pxAt(4, 3)) === INK && (await pxAt(2, 2)) === CLR && (await S('p.floating')) === null);
  await drawDrag([20, 1], [22, 3]);
  await key('Escape');
  ok('Esc で選ぶのをやめる', (await S('p.sel')) === null);
  await key('Control+z');
  ok('動かしたのを元に戻すと (2,2) に戻る', (await pxAt(2, 2)) === INK && (await pxAt(4, 3)) === CLR);
  await key('Control+y');

  // 並びの色を差し替える（色を選ぶ → 並びへ入れる）
  await click('.app-pixel [data-slot="15"]');
  await ev(`const i = ${WIN}.el.querySelector('[data-color]'); i.value = '#123456'; i.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
  await click('.app-pixel [data-a="setslot"]');
  ok('色を選ぶと左の色が変わり、「並びへ入れる」で選んだ枠が差し替わる', (await S("p.doc.palette[15]")) === '#123456' && (await S("p.colors[0].join(',')")) === '18,52,86,255');
  await click('.app-pixel [data-slot="0"]');

  // 拡大（ホイールとボタン）と方眼
  const z0 = await S('p.zoom');
  const [wx, wy] = await at(16, 16);
  await page.wheel(wx, wy, 0, -120); await sleep(200);
  const z1 = await S('p.zoom');
  ok('ホイールを上へ回すと拡大する', z1 > z0, `${z0} → ${z1}`);
  await click('.app-pixel [data-a="zoomout"]');
  ok('縮小のボタンで 1 段戻る', (await S('p.zoom')) === z0);
  await key('#');
  ok('# で方眼の線を消す', (await S("win.el.querySelector('[data-stage]').classList.contains('grid')")) === false);
  await key('#');

  // コマ: 足す・オニオンスキン・描く・複製・並べ替え・消す
  await click('.app-pixel [data-a="addframe"]', 300);
  ok('「足す」でコマが 2 つになり、2 コマ目が白紙', (await S('p.doc.frames.length')) === 2 && (await S('p.cur')) === 1 && (await S('p.doc.frames[1].every((v) => v === 0)')) === true);
  await key('o');
  ok('O でオニオンスキン: 前のコマが薄く見える', (await S("(() => { const c = win.el.querySelector('[data-onion]'); return c.getContext('2d').getImageData(5, 5, 1, 1).data[3] === 255 && getComputedStyle(c).opacity < 1; })()")) === true);
  await key('b');
  await drawDrag([5, 6], [12, 6]);
  ok('2 コマ目に描ける（1 コマ目は変わらない）', (await pxAt(8, 6, 1)) === INK && (await pxAt(8, 6, 0)) === CLR);
  await shot('04-onion');
  await click('.app-pixel [data-a="dupframe"]', 300);
  ok('「複製」で 3 コマになり、3 コマ目は 2 コマ目と同じ', (await S('p.doc.frames.length')) === 3 && (await S('p.doc.frames[2].every((v, i) => v === p.doc.frames[1][i])')) === true);
  await tap(20, 6);
  const sig = () => S("p.doc.frames.map((f) => f.reduce((s, v, i) => (s + v * (i % 97 + 1)) % 1000003, 0)).join(',')");
  const before = await sig();
  // コマの帯で 3 コマ目を 1 番目へドラッグ
  const c3 = await center('.app-pixel .px-frames li[data-i="2"]'), c1 = await center('.app-pixel .px-frames li[data-i="0"]');
  await page.move(c3[0], c3[1]); await page.down(c3[0], c3[1]);
  for (let i = 1; i <= 10; i++) { await page.move(c3[0] + (c1[0] - 20 - c3[0]) * i / 10, c3[1]); await sleep(16); }
  await page.up(c1[0] - 20, c3[1]); await sleep(300);
  const after = await sig(), b = before.split(','), a = after.split(',');
  ok('コマをドラッグで並べ替える（3 番目が 1 番目へ）', a[0] === b[2] && a[1] === b[0] && a[2] === b[1] && (await S('p.cur')) === 0, `${before} → ${after}`);
  await key('Alt+ArrowRight');
  ok('Alt+→ で今のコマを 1 つ後ろへ移す', (await sig()).split(',')[1] === b[2]);
  await key('Control+z'); await key('Control+z');
  ok('並べ替えも元に戻せる', (await sig()) === before);
  {
    const s0 = await sig(), p0 = await center('.app-pixel .px-frames li[data-i="2"]'), p1 = await center('.app-pixel .px-frames li[data-i="0"]');
    await page.move(p0[0], p0[1]); await page.down(p0[0], p0[1]);
    for (let i = 1; i <= 6; i++) { await page.move(p0[0] + (p1[0] - 20 - p0[0]) * i / 6, p0[1]); await sleep(16); }
    const marker = await ev("return document.querySelector('.app-pixel .px-frames').hasAttribute('data-drop')");
    await key('Escape');
    await page.up(p1[0] - 20, p0[1]); await sleep(200);
    ok('コマのドラッグ中は入る所に印が出て、Esc でやめると並びは変わらない', marker === true && (await sig()) === s0);
  }
  ok('元に戻すと、今のコマも並べ替えの前（3 コマ目）に戻る', (await S('p.cur')) === 2);
  await key(',');
  ok(', で前のコマへ移る', (await S('p.cur')) === 1);
  await click('.app-pixel [data-a="delframe"]', 300);
  ok('「消す」でコマが 2 つになる', (await S('p.doc.frames.length')) === 2);
  await click('.app-pixel [data-a="dupframe"]', 300);
  // 速さと見本の再生
  await ev(`const r = ${WIN}.el.querySelector('[data-fps]'); r.value = 12; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  ok('速さを 12 コマ/秒にする', (await S('p.doc.fps')) === 12);
  const seen = new Set();
  for (let i = 0; i < 12; i++) { seen.add(await S("win.el.querySelector('[data-pvtxt]').textContent")); await sleep(60); }
  ok('見本の枠でアニメが再生される（コマの番号が変わる）', seen.size >= 2, [...seen].join(' '));
  await key('p');
  ok('P で見本を止めると今のコマを出す', (await S("win.el.querySelector('[data-pvtxt]').textContent")) === `${await S('p.cur + 1')} / 3`);
  await key('p');
  ok('最近使った色が並ぶ', (await S("win.el.querySelectorAll('[data-recent] [data-hex]').length")) >= 2);

  // 保存して開き直す
  const saved = await sig();
  await key('Control+s');
  await fileDlg('テストの絵');
  ok('Ctrl+S で /画像/テストの絵.pxa に保存', (await S('p.path')) === '/画像/テストの絵.pxa' && (await S('p.dirty')) === false);
  ok('題名にファイル名が出る', /^テストの絵\.pxa - ドット絵エディタ$/.test(await S('win.title')), await S('win.title'));
  const valid = await ev("const X = await import('./js/core/pixel.mjs'); const fs = await import('./js/fs.mjs'); const o = await fs.readJSON('/画像/テストの絵.pxa'); return JSON.stringify({ errors: X.validateDoc(o), frames: o.frames.length, fps: o.fps, w: o.width, p15: o.palette[15] });");
  const v = JSON.parse(valid);
  ok('保存したファイルは .pxa の形の検証を通る（3 コマ、12 コマ/秒、差し替えた色）', v.errors.length === 0 && v.frames === 3 && v.fps === 12 && v.w === 32 && v.p15 === '#123456', valid);
  await ev(`(${WIN}).close(); return true;`);
  await sleep(500);
  ok('保存したあとは確かめずに閉じる', (await ev("return (await import('./js/wm.mjs')).list().filter((w) => w.app === 'pixel').length")) === 0);
  await ev("const sh = await import('./js/shell.mjs'); await sh.openFile('/画像/テストの絵.pxa'); return true;");
  await waitSel('.app-pixel [data-canvas]');
  await sleep(500);
  ok('.pxa を開くとドット絵エディタで開く', (await S('p.path')) === '/画像/テストの絵.pxa');
  ok('開き直すと全部のコマの画素が同じ', (await sig()) === saved, `${saved} / ${await sig()}`);
  ok('開き直すと速さと色の並びも同じ', (await S('p.doc.fps')) === 12 && (await S('p.doc.palette[15]')) === '#123456');
  await shot('05-reopened');

  // 書き出し: 今のコマの PNG（4 倍）を /画像 へ。メニューを実際に押して開く
  await click('.app-pixel .menu-title:nth-child(1)', 300);
  await click('.app-pixel .menu-item[data-command="export"][data-kind="frame"]', 400);
  ok('書き出しの箱が開く', await waitSel('dialog.px-dlg[open]'));
  await ev("const s = document.querySelector('dialog.px-dlg[open] select'); s.value = '4'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;");
  ok('書き出しの箱に大きさ（128×128）が出る', /128×128/.test(await ev("return document.querySelector('dialog.px-dlg[open] [data-outsize]').textContent")));
  await shot('06-export');
  await click('dialog.px-dlg[open] [data-close="drive"]', 400);
  await fileDlg('書き出し.png');
  await sleep(300);
  const png = await readBytes('/画像/書き出し.png');
  const pngSz = await ev(`const X = await import('./js/core/pixel.mjs'); return JSON.stringify(X.pngSize(new Uint8Array(${JSON.stringify(png.slice(0, 32))})));`);
  ok('PNG（4 倍）は 128×128', pngSz === '{"width":128,"height":128}', pngSz);
  // スプライトシート（1 倍）
  await command('export', 'sheet');
  await waitSel('dialog.px-dlg[open]');
  await click('dialog.px-dlg[open] [data-close="drive"]', 400);
  await fileDlg('シート.png');
  await sleep(300);
  const sh = await ev(`const X = await import('./js/core/pixel.mjs'); const fs = await import('./js/fs.mjs'); const b = new Uint8Array(await (await fs.readBlob('/画像/シート.png')).arrayBuffer()); const bmp = await createImageBitmap(await fs.readBlob('/画像/シート.png')); const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); const d = c.getContext('2d').getImageData(0, 0, bmp.width, bmp.height).data; const p = ${WIN}.pixel; const same = p.doc.frames.every((f, k) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) for (let j = 0; j < 4; j++) if (Math.abs(f[(y * 32 + x) * 4 + j] - d[(y * 96 + k * 32 + x) * 4 + j]) > 1) return false; return true; }); return JSON.stringify({ size: X.pngSize(b), same });`);
  ok('スプライトシートは 3 コマを横に並べた 96×32 で、画素が各コマと同じ', sh === '{"size":{"width":96,"height":32},"same":true}', sh);
  // アニメ GIF（2 倍）
  await command('export', 'gif');
  await waitSel('dialog.px-dlg[open]');
  await ev("const s = document.querySelector('dialog.px-dlg[open] select'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;");
  await click('dialog.px-dlg[open] [data-close="drive"]', 400);
  await fileDlg('アニメ.gif');
  await sleep(300);
  const gif = await ev(`const X = await import('./js/core/pixel.mjs'); const fs = await import('./js/fs.mjs'); const blob = await fs.readBlob('/画像/アニメ.gif'); const b = new Uint8Array(await blob.arrayBuffer()); const g = X.decodeGif(b); const p = ${WIN}.pixel; const f0 = p.doc.frames[0];
    let mine = true; for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const s = ((y >> 1) * 32 + (x >> 1)) * 4, d = (y * 64 + x) * 4; if (f0[s + 3] < 128 ? g.frames[0].rgba[d + 3] !== 0 : [0, 1, 2].some((j) => g.frames[0].rgba[d + j] !== f0[s + j])) mine = false; }
    let browser = null;
    if ('ImageDecoder' in window) {
      const dec = new ImageDecoder({ data: blob.stream(), type: 'image/gif' }); await dec.tracks.ready; const n = dec.tracks.selectedTrack.frameCount;
      const { image } = await dec.decode({ frameIndex: 1 }); const c = new OffscreenCanvas(64, 64); c.getContext('2d').drawImage(image, 0, 0); image.close(); const d = c.getContext('2d').getImageData(0, 0, 64, 64).data; const f1 = p.doc.frames[1];
      let same = true; for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const s = ((y >> 1) * 32 + (x >> 1)) * 4, q = (y * 64 + x) * 4; if (f1[s + 3] < 128 ? d[q + 3] !== 0 : [0, 1, 2].some((j) => Math.abs(d[q + j] - f1[s + j]) > 1)) same = false; }
      browser = { frames: n, same }; dec.close();
    }
    return JSON.stringify({ head: String.fromCharCode(...b.slice(0, 6)), w: g.width, h: g.height, frames: g.frames.length, delay: g.frames[0].delay, loop: g.loop, mine, browser });`);
  const G = JSON.parse(gif);
  ok('GIF の先頭は GIF89a、64×64', G.head === 'GIF89a' && G.w === 64 && G.h === 64, gif);
  ok('GIF のコマは 3 つ、待ち時間は 12 コマ/秒の 8/100 秒、いつまでもくり返す', G.frames === 3 && G.delay === 8 && G.loop === 0, gif);
  ok('GIF を自前で読むと 1 コマ目の画素が絵と同じ（透明も）', G.mine === true);
  ok('ブラウザの ImageDecoder でも 3 コマと読め、2 コマ目の画素が絵と同じ', G.browser && G.browser.frames === 3 && G.browser.same === true, JSON.stringify(G.browser));
  // パソコンへ書き出す（a 要素の click を横取りして、名前と中身の大きさを見る）
  await ev("window.__dl = []; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push({ name: this.download, href: this.href }); return; } }; return true;");
  await command('export', 'gif');
  await waitSel('dialog.px-dlg[open]');
  await click('dialog.px-dlg[open] [data-close="pc"]', 600);
  const dl = JSON.parse(await ev("const d = window.__dl[0]; if (!d) return 'null'; const b = new Uint8Array(await (await fetch(d.href)).arrayBuffer()); return JSON.stringify({ name: d.name, head: String.fromCharCode(...b.slice(0, 6)), size: b.length });"));
  ok('「パソコンへ書き出す」で テストの絵.gif をダウンロードに渡す', dl && dl.name === 'テストの絵.gif' && dl.head === 'GIF89a' && dl.size > 50, dl);

  // PNG を開いて描き足す（ドット絵エディタで開く）。128 を超える絵は断る。前の窓は閉じておく
  await ev(`(${WIN}).close(true); return true;`);
  await sleep(300);
  await ev("const sh = await import('./js/shell.mjs'); await sh.openFile('/画像/シート.png', 'pixel'); return true;");
  await sleep(800);
  ok('PNG（96×32）を開くと 96×32 の 1 コマになり、画素が合う', (await S('p.doc.width')) === 96 && (await S('p.doc.height')) === 32 && (await S('p.doc.frames.length')) === 1 && (await pxAt(4, 3)) === INK, `${await S('p.doc.width')}×${await S('p.doc.height')}`);
  ok('PNG を開いたときの題名は元の名前', /シート\.png - ドット絵エディタ/.test(await S('win.title')), await S('win.title'));
  await tap(40, 20);
  ok('開いた PNG に描き足せる', (await pxAt(40, 20)) === INK && (await S('p.dirty')) === true);
  await ev(`(${WIN}).close(true); return true;`);
  await sleep(300);
  await ev("const c = new OffscreenCanvas(200, 10); c.getContext('2d').fillRect(0, 0, 200, 10); const fs = await import('./js/fs.mjs'); await fs.write('/画像/大きい.png', await c.convertToBlob({ type: 'image/png' }), 'image/png'); return true;");
  await ev("const sh = await import('./js/shell.mjs'); sh.openFile('/画像/大きい.png', 'pixel'); return true;");
  ok('200×10 の PNG は「128×128 画素まで」と断る', await waitSel('dialog.msgbox[open]', 5000) && /128×128/.test(await ev("return document.querySelector('dialog.msgbox[open] .msgbox-text').textContent")));
  await shot('07-too-big');
  await answer('OK');

  // 新規: 16×24 を選ぶ（確かめの箱で「はい」）
  await command('new');
  if (await waitSel('dialog.msgbox[open]', 3000)) await answer('はい');
  ok('新規の箱が開く', await waitSel('dialog.px-dlg[open] input[type="number"]'));
  await ev("const d = document.querySelector('dialog.px-dlg[open]'); const [w, h] = d.querySelectorAll('input[type=number]'); w.value = 16; h.value = 24; return true;");
  await shot('08-new');
  await click('dialog.px-dlg[open] [data-close="ok"]', 400);
  ok('新規で 16×24 の白紙になる', (await S('p.doc.width')) === 16 && (await S('p.doc.height')) === 24 && (await S('p.doc.frames[0].every((v) => v === 0)')) === true);
  ok('新規では 200 を 128 に、3 を 8 に丸める', await ev("const X = await import('./js/core/pixel.mjs'); return X.clampSize(200) === 128 && X.clampSize(3) === 8;"));

  // ヘルプ
  // Alt と下線の文字で、コマの帯のボタンを押せる（Alt+A で「足す」）
  await click('.app-pixel [data-scroll]', 200);
  await key('Alt+a', 300);
  ok('Alt+A で「足す」を押してコマが 2 つになる', (await S('p.doc.frames.length')) === 2);
  await key('Control+z');
  await command('help');
  ok('ヘルプの使い方が出る', await waitSel('dialog.msgbox[open]', 3000) && /B 鉛筆/.test(await ev("return document.querySelector('dialog.msgbox[open] .msgbox-text').textContent")));
  await sleep(600);
  await shot('09-help');
  await answer('OK');
  // 道具のメニューで道具を選ぶ
  await click('.app-pixel .menu-title:nth-child(4)', 300);
  await click('.app-pixel .menu-item[data-command="tool"][data-tool="fill"]', 300);
  ok('道具のメニューから塗りつぶしを選べる', (await S('p.tool')) === 'fill');
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));
  if (page.consoleErrors.length) console.log('ERRORS', page.consoleErrors.join(' --- '));
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
await sleep(500);
const newLog = existsSync(APPLOG) ? readFileSync(APPLOG).subarray(log0).toString('utf8') : '';
const lines = newLog.split(/\r?\n/), errs = lines.filter((l) => / pixel\./.test(l) && /result=error/.test(l) && !/大きい\.png/.test(l));
ok('記録（logs/app.log）にドット絵エディタの誤りが無い（わざと断らせた 200×10 の PNG を除く）', newLog.includes('pixel.launch') && errs.length === 0, errs.slice(0, 3).join(' | ') || `${lines.filter((l) => / pixel\./.test(l)).length} 行`);
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'pixel-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
