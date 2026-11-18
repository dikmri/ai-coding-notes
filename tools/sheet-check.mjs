// 表計算の窓（os/js/apps/sheet.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// 見本の表・選んだ範囲の合計・打った数と式の計算・誤りの表示・コピーで参照がずれる・循環・行を入れると参照が直る・
// 元に戻す・オートフィル・並べ替え・書式・列の幅・番地の欄・式の途中でセルを押す・見える所だけ描く・
// .fsheet に保存して開き直すと同じ・CSV に書き出して読み戻すと同じ・パソコンへ書き出す、を確かめる。
// 確かめ専用の Chrome のプロファイル（runtime/sheet-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8798 を動かしてから、node tools/sheet-check.mjs [番号=8798]
//   画面の写真は build/sheet-check/、結果は logs/sheet-check.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8798;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'sheet-check');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'sheet-profile') });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info: String(info) }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info !== '' ? ' ' + info : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
const waitSel = async (sel, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await ev(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(150); } return false; };
const center = async (sel) => JSON.parse(await ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'null'; const r = el.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2])`));
async function click(sel, wait = 250) {
  if (!(await waitSel(sel))) throw new Error('見つからない: ' + sel);
  const r = await center(sel);
  await page.click(r[0], r[1]);
  await sleep(wait);
}
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
const A = (a) => { const m = /^([A-Z]+)(\d+)$/.exec(a); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return { r: +m[2] - 1, c: c - 1 }; };
// 表示されているセルの文字（見えている所だけ描くので、見える場所で読む）
const text = (a) => { const p = A(a); return ev(`const el = document.querySelector('.app-sheet .sh-row[aria-rowindex="${p.r + 1}"] .sh-c[aria-colindex="${p.c + 1}"] span'); return el ? el.textContent : ''`); };
const field = (sel) => ev(`return document.querySelector('.app-sheet ${sel}')?.value ?? null`);
const status = () => ev("return document.querySelector('.app-sheet .status-field[data-status]').textContent");
const stats = () => ev("return document.querySelector('.app-sheet [data-stats]').textContent");
const title = () => ev("return document.querySelector('.app-sheet .title-bar-text').textContent");
// 番地の欄に打って移る
async function go(a) {
  await click('.app-sheet [data-name]', 100);
  await ev("const n = document.querySelector('.app-sheet [data-name]'); n.select(); return true;");
  await page.typeText(a);
  await page.key('Enter');
  await sleep(150);
}
// セルの真ん中（列と行の見出しの位置から）
const cellXY = (a) => { const p = A(a); return center(`.app-sheet .sh-ch[data-c="${p.c}"]`).then(async (cx) => [cx[0], (await center(`.app-sheet .sh-rh[data-r="${p.r}"]`))[1]]); };
async function clickCell(a, opts = {}) { const [x, y] = await cellXY(a); await page.click(x, y, opts); await sleep(150); }
async function type(s, end = 'Enter') { await page.typeText(s); await sleep(60); if (end) await page.key(end); await sleep(120); }
const cmd = (command, data = {}) => ev(`document.querySelector('.app-sheet .app-body').dispatchEvent(new CustomEvent('w95:command', { bubbles: true, detail: { command: ${JSON.stringify(command)}, item: { dataset: ${JSON.stringify(data)} } } })); return true;`);
const answer = async (v) => { await waitSel(`dialog.msgbox[open] .button-row button[data-close="${v}"]`, 5000); await click(`dialog.msgbox[open] .button-row button[data-close="${v}"]`, 400); };
async function fileDialog(name) {
  if (!(await waitSel('dialog.file-dlg[open] #fdName', 5000))) throw new Error('ファイルの箱が開かない');
  await ev(`const i = document.querySelector('dialog.file-dlg[open] #fdName'); i.value = ${JSON.stringify(name)}; return true;`);
  await click('dialog.file-dlg[open] [data-ok]', 600);
}
const readFile = (p) => ev(`const fs = await import('./js/fs.mjs'); return await fs.readText(${JSON.stringify(p)});`);

try {
  await page.navigate(URL0 + '?shot');
  await wipe();
  await page.navigate(URL0 + '?shot=sheet');
  ok('表計算の窓が開く', await waitSel('.app-sheet .sh-cells .sh-c', 20000));
  await sleep(500);
  await shot('00-open');
  await click('.app-sheet .title-bar-controls .max', 500);

  /* 見本の表 */
  ok('初めて開くと見本の表（おこづかい帳）が出る', (await text('A1')) === '1 週間のおこづかい帳' && /見本/.test(await title()), await title());
  ok('見本の SUM と残りの式が計算されている', (await text('D13')) === '2,500' && (await text('E13')) === '1,520' && (await text('F13')) === '980', `${await text('D13')} ${await text('E13')} ${await text('F13')}`);
  ok('見本の AVERAGE と COUNTIF と IF', (await text('E14')) === '217' && (await text('E16')) === '4' && (await text('C18')) === 'まだ余裕があります。', `${await text('E14')} ${await text('E16')} ${await text('C18')}`);
  ok('日付は 月/日 で表示される', (await text('A5')) === '11/16', await text('A5'));
  ok('状態の帯に案内が出る', /黄色のセル/.test(await status()), await status());
  ok('今のセルは E8、番地の欄と中身の欄に出る', (await field('[data-name]')) === 'E8' && (await field('[data-formula]')) === '150');
  await shot('01-sample');

  /* 範囲を引っぱって選ぶと、状態の帯に合計・平均・個数 */
  const [x1, y1] = await cellXY('D5'), [x2, y2] = await cellXY('E11');
  await page.drag(x1, y1, x2, y2);
  await sleep(300);
  const st = await stats();
  ok('範囲を引っぱって選ぶと、合計・平均・個数が出る', /合計 4,020/.test(st) && /個数 14/.test(st) && /平均 287\.1429/.test(st), st);
  ok('選んだ範囲が番地の欄に出る', (await field('[data-name]')) === 'D5:E11', await field('[data-name]'));
  await shot('02-stats');

  /* 打つと計算し直す */
  await clickCell('E8');
  await type('500');
  ok('数を打って Enter で決めると、残りと合計が計算し直される', (await text('E8')) === '500' && (await text('F13')) === '630' && (await text('F11')) === '630', `${await text('E8')} ${await text('F13')}`);
  ok('Enter で下のセルへ移る', (await field('[data-name]')) === 'E9');
  ok('題に変更の印（*）が付く', (await title()).startsWith('*'), await title());
  // F2 で直して Esc で取り消す
  await page.key('F2'); await sleep(100);
  await type('99', 'Escape');
  ok('F2 で直しても Esc で取り消すと元のまま', (await text('E9')) === '290' && /取り消し/.test(await status()), await text('E9'));
  // 元に戻す
  await page.key('Control+z'); await sleep(200);
  ok('Ctrl+Z で元に戻す', (await text('E8')) === '150' && (await text('F13')) === '980', await text('E8'));
  await page.key('Control+y'); await sleep(200);
  ok('Ctrl+Y でやり直す', (await text('E8')) === '500');

  /* 新しい表（保存しない） */
  await cmd('new');
  await answer('いいえ');
  await sleep(300);
  ok('新規で空の表になる', (await text('A1')) === '' && /無題/.test(await title()), await title());

  /* 数と式を自動で入れる */
  await go('A1');
  for (const v of ['10', '20', '30']) await type(v);
  await go('B1'); await type('=a1*2');
  await go('A4'); await type('=SUM(A1:A3)');
  await type('=average(A1:A3)');
  ok('数と式: =A1*2 は 20、SUM は 60、AVERAGE は 20', (await text('B1')) === '20' && (await text('A4')) === '60' && (await text('A5')) === '20', `${await text('B1')} ${await text('A4')} ${await text('A5')}`);
  await go('B1');
  ok('式は大文字に直して残る', (await field('[data-formula]')) === '=A1*2', await field('[data-formula]'));
  await go('C1'); await type('=1/0'); await type('=FOO(1)'); await type('="合計は"&A4');
  await go('C1');
  ok('#DIV/0! と説明が状態の帯に出る', (await text('C1')) === '#DIV/0!' && /0 で割/.test(await status()), await status());
  ok('知らない関数は #NAME?、& で文字をつなぐ', (await text('C2')) === '#NAME?' && (await text('C3')) === '合計は60', `${await text('C2')} ${await text('C3')}`);
  await go('C5'); await type('=SUM(1');
  await go('C5');
  ok('書き方の誤りは #ERROR! と理由', (await text('C5')) === '#ERROR!' && /\)/.test(await status()), await status());
  // 打っている途中でセルを押すと番地が入る
  await go('C6');
  await page.typeText('=A1+');
  await sleep(100);
  await clickCell('A2');
  await page.key('Enter'); await sleep(200);
  ok('式の途中でセルを押すと、その番地が式に入る（=A1+A2 は 30）', (await text('C6')) === '30', await text('C6'));

  /* コピーで参照がずれる */
  await go('B1');
  await page.key('Control+c'); await sleep(150);
  ok('コピーすると点線の印が出る', await ev("return !document.querySelector('.app-sheet [data-ants]').hidden"));
  await go('B2:B3');
  await cmd('paste'); await sleep(300);
  await go('B3');
  ok('コピーして貼ると、相対参照がずれる（B3 は =A3*2 で 60）', (await field('[data-formula]')) === '=A3*2' && (await text('B3')) === '60', await field('[data-formula]'));
  await go('D1'); await type('=$A$1+A1');
  await page.key('ArrowUp'); await sleep(100);
  await page.key('Control+c'); await sleep(100);
  await page.key('ArrowDown'); await sleep(100);
  await cmd('paste'); await sleep(300);
  await go('D2');
  ok('$ の付いた参照はずれない（D2 は =$A$1+A2）', (await field('[data-formula]')) === '=$A$1+A2' && (await text('D2')) === '30', await field('[data-formula]'));
  // 切り取って貼ると動く
  await go('D2'); await page.key('Control+x'); await sleep(100);
  await go('E7'); await cmd('paste'); await sleep(300);
  ok('切り取って貼ると中身が動く', (await text('D2')) === '' && (await text('E7')) === '30', await text('E7'));

  /* 循環 */
  await go('F1'); await type('=F2+1'); await type('=F1+1');
  ok('互いに指す式は #CYCLE!', (await text('F1')) === '#CYCLE!' && (await text('F2')) === '#CYCLE!', `${await text('F1')} ${await text('F2')}`);
  await go('F1');
  ok('循環の説明が状態の帯に出る', /循環/.test(await status()), await status());
  await type('7');
  ok('片方を数にすると循環が解ける（F2 は 8）', (await text('F2')) === '8', await text('F2'));
  await shot('03-formulas');

  /* 行を入れると参照が直る */
  await click('.app-sheet .sh-rh[data-r="1"]', 200);
  ok('行の見出しを押すと行全体を選ぶ', (await field('[data-name]')) === 'A2:AZ2', await field('[data-name]'));
  await cmd('insrow'); await sleep(300);
  await go('A5');
  ok('行を入れると下の中身が動き、SUM の範囲が広がる（=SUM(A1:A4)）', (await field('[data-formula]')) === '=SUM(A1:A4)' && (await text('A5')) === '60' && (await text('A3')) === '20', await field('[data-formula]'));
  await go('B4');
  ok('行を入れても、コピーした式は自分の行を指したまま（B4 は =A4*2）', (await field('[data-formula]')) === '=A4*2', await field('[data-formula]'));
  await go('A2'); await type('5');
  ok('入れた行に数を打つと SUM に入る', (await text('A5')) === '65', await text('A5'));
  await click('.app-sheet .sh-rh[data-r="1"]', 200);
  await cmd('delrow'); await sleep(300);
  await go('A4');
  ok('行を消すと SUM の範囲が縮む（=SUM(A1:A3)）', (await field('[data-formula]')) === '=SUM(A1:A3)' && (await text('A4')) === '60', await field('[data-formula]'));
  await click('.app-sheet .sh-ch[data-c="0"]', 200);
  await cmd('inscol'); await sleep(300);
  await go('C1');
  ok('列を入れると参照が右へずれる（C1 は =B1*2）', (await field('[data-formula]')) === '=B1*2' && (await text('C1')) === '20', await field('[data-formula]'));
  await cmd('undo'); await sleep(200);
  await go('B1');
  ok('元に戻すで列の挿入が戻る', (await field('[data-formula]')) === '=A1*2', await field('[data-formula]'));

  /* オートフィル */
  await go('H1'); await type('1'); await type('2'); await go('I1'); await type('=H1*10'); await go('J1'); await type('月');
  await go('H1:J2');
  const hc = await center('.app-sheet [data-handle]'), [, ty] = await cellXY('H6');
  await page.drag(hc[0], hc[1], hc[0], ty);
  await sleep(400);
  ok('つまみを引っぱると連番が続く（H6 は 6）', (await text('H3')) === '3' && (await text('H6')) === '6', `${await text('H3')} ${await text('H6')}`);
  await go('I5');
  ok('つまみで式も伸びる（I5 は =H5*10 で 50）', (await field('[data-formula]')) === '=H5*10' && (await text('I5')) === '50', await field('[data-formula]'));
  await go('J1');
  const hc2 = await center('.app-sheet [data-handle]'), [, ty2] = await cellXY('J4');
  await page.drag(hc2[0], hc2[1], hc2[0], ty2);
  await sleep(300);
  ok('曜日も続く（月→火→水→木）', (await text('J2')) === '火' && (await text('J4')) === '木', `${await text('J2')} ${await text('J4')}`);
  await shot('04-fill');

  /* キーボードで範囲、Ctrl+矢印、オートSUM、二度押しで直す、道具の帯の元に戻す */
  await go('H1');
  await page.key('Shift+ArrowDown'); await page.key('Shift+ArrowDown'); await sleep(150);
  ok('Shift+矢印で範囲を広げ、合計が状態の帯に出る', (await field('[data-name]')) === 'H1:H3' && /合計 6/.test(await stats()), await stats());
  await page.key('Control+ArrowDown'); await sleep(150);
  ok('Ctrl+矢印で中身の続く端へ移る（H6）', (await field('[data-name]')) === 'H6', await field('[data-name]'));
  await page.key('ArrowDown'); await sleep(100);
  await click('.app-sheet [data-a="autosum"]', 300);
  ok('Σ 合計で上に続く数の合計（=SUM(H1:H6) は 21）が入る', (await text('H7')) === '21' && /SUM\(H1:H6\)/.test(await status()), await status());
  const [dx, dy] = await cellXY('H7');
  await page.click(dx, dy, { count: 2 }); await sleep(200);
  ok('二度押しで、中身を直す入力欄が出る', await ev("const e = document.querySelector('.app-sheet [data-editor]'); return e.classList.contains('on') && e.value === '=SUM(H1:H6)'"));
  await page.key('Escape'); await sleep(100);
  await click('.app-sheet [data-a="undo"]', 200);
  ok('道具の帯の「元に戻す」で合計が消える', (await text('H7')) === '', await text('H7'));
  await go('G1'); await type('1');
  await go('G1:G4'); await cmd('filldown'); await sleep(200);
  ok('メニューの「下へ伸ばす」でも連番になる（つまみを使わない方法）', (await text('G4')) === '4', await text('G4'));

  /* 並べ替え */
  await go('L1'); for (const v of ['名前', 'けん', 'あや', 'さき']) await type(v);
  await go('M1'); for (const v of ['点', '70', '95', '80']) await type(v);
  await go('M2');
  await cmd('sortdesc'); await sleep(300);
  ok('並べ替え: 1 つのセルを選んでいても、続く範囲を点の大きい順に並べ、見出しは残す', (await text('L1')) === '名前' && (await text('L2')) === 'あや' && (await text('L3')) === 'さき' && (await text('L4')) === 'けん', `${await text('L2')} ${await text('L3')} ${await text('L4')}`);
  await cmd('sortasc'); await sleep(300);
  ok('小さい順にも並べ替えられる', (await text('L2')) === 'けん' && (await text('M2')) === '70', await text('L2'));
  await go('L2');
  await cmd('sort');
  ok('並べ替えの箱が開き、見出しの付いた列の名前が出る', (await waitSel('dialog.sh-dlg[open]', 4000)) && /M 列（点）/.test(await ev("return document.querySelector('dialog.sh-dlg[open] select').textContent")));
  await shot('05a-sortdialog');
  await ev("const d = document.querySelector('dialog.sh-dlg[open]'); d.querySelector('select').value = '12'; d.querySelector('input[value=\"desc\"]').checked = true; return true;");
  await click('dialog.sh-dlg[open] button[data-close="ok"]', 300);
  ok('並べ替えの箱で、点の大きい順にする', (await text('L2')) === 'あや' && (await text('M2')) === '95', await text('L2'));

  /* 書式 */
  await go('L1:M1');
  await click('.app-sheet [data-a="bold"]');
  await click('.app-sheet [data-a="center"]');
  ok('太字と中央寄せ（ボタンが押された見た目になる）', await ev("const c = document.querySelector('.app-sheet .sh-row[aria-rowindex=\"1\"] .sh-c[aria-colindex=\"12\"]'); return c.classList.contains('b') && c.classList.contains('al-center') && document.querySelector('.app-sheet [data-a=\"bold\"]').getAttribute('aria-pressed') === 'true'"));
  await ev("const i = document.querySelector('.app-sheet [data-color=\"bg\"]'); i.value = '#c9f8f1'; i.dispatchEvent(new Event('change', { bubbles: true })); return true;");
  await sleep(200);
  ok('背景の色', await ev("return getComputedStyle(document.querySelector('.app-sheet .sh-row[aria-rowindex=\"1\"] .sh-c[aria-colindex=\"12\"]')).backgroundColor === 'rgb(201, 248, 241)'"));
  await ev("const s = document.querySelector('.app-sheet [data-bdsel]'); s.value = 'all'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;");
  await sleep(200);
  ok('枠線（格子）', await ev("return document.querySelector('.app-sheet .sh-row[aria-rowindex=\"1\"] .sh-c[aria-colindex=\"13\"]').dataset.bd === 'trbl'"));
  await go('A5'); await type('1234.5', null);
  await page.key('Enter');
  await go('A5');
  await ev("const s = document.querySelector('.app-sheet [data-numsel]'); s.value = 'sep'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;");
  await sleep(150);
  ok('数の表示: 桁区切り', (await text('A5')) === '1,235', await text('A5'));
  await click('.app-sheet [data-a="decmore"]');
  ok('小数の桁を増やす', (await text('A5')) === '1,234.5', await text('A5'));
  await cmd('num', { num: 'percent' }); await sleep(150);
  ok('数の表示: パーセント', (await text('A5')) === '123450%', await text('A5'));
  await go('A6'); await type('2026/11/19');
  ok('日付を打つと日付の表示が付く', (await text('A6')) === '2026/11/19', await text('A6'));

  /* 列の幅 */
  await go('L1');
  const before = await ev("return document.querySelector('.app-sheet .sh-ch[data-c=\"11\"]').getBoundingClientRect().width");
  const g = await center('.app-sheet .sh-ch[data-c="11"] .sh-grip');
  await page.drag(g[0], g[1], g[0] + 60, g[1]);
  await sleep(300);
  const after = await ev("return document.querySelector('.app-sheet .sh-ch[data-c=\"11\"]').getBoundingClientRect().width");
  ok('列の見出しの境目を引っぱると幅が変わる', after - before > 50, `${before} → ${after}`);
  await go('B1');
  await cmd('colw');
  await waitSel('dialog.sh-dlg[open] input[type="number"]', 4000);
  await ev("const i = document.querySelector('dialog.sh-dlg[open] input'); i.value = '130'; return true;");
  await click('dialog.sh-dlg[open] button[data-close="ok"]', 300);
  ok('列の幅の箱で B 列を 130 画素にする', (await ev("return document.querySelector('.app-sheet .sh-ch[data-c=\"1\"]').getBoundingClientRect().width")) === 130);
  await shot('05-format');

  /* 見える所だけ描く */
  await go('C500');
  const vis = await ev("return { cells: document.querySelectorAll('.app-sheet .sh-c').length, heads: document.querySelectorAll('.app-sheet .sh-rh').length, has500: !!document.querySelector('.app-sheet .sh-rh[data-r=\"499\"]') }");
  ok('500 行目へ移っても、描く行の見出しは見えている分だけ', vis.has500 && vis.heads < 40, JSON.stringify(vis));
  await go('AZ1000'); await type('端', null); await page.key('Enter');
  await go('AZ1000');
  ok('表の端（AZ1000）にも打てる', (await text('AZ1000')) === '端');
  await page.key('Delete'); await sleep(150);
  await go('A1');

  /* 保存して開き直すと同じ */
  await cmd('saveas');
  await fileDialog('確かめ.fsheet');
  const saved = await readFile('/ドキュメント/確かめ.fsheet');
  ok('.fsheet に保存できる（/ドキュメント/確かめ.fsheet）', /"format":"future-os-sheet"/.test(saved) && !(await title()).startsWith('*'), await title());
  const snapA = await ev("return [...document.querySelectorAll('.app-sheet .sh-c')].map((c) => c.parentElement.getAttribute('aria-rowindex') + ':' + c.getAttribute('aria-colindex') + '=' + c.textContent + '|' + c.className + '|' + (c.dataset.bd || '') + '|' + c.style.cssText).join('\\n')");
  await ev("document.querySelector('.app-sheet .title-bar-controls .close').click(); return true;");
  await sleep(600);
  ok('閉じる（保存済みなので聞かれない）', !(await ev("return !!document.querySelector('.app-sheet')")));
  await ev("const shell = await import('./js/shell.mjs'); await shell.openFile('/ドキュメント/確かめ.fsheet'); return true;");
  await waitSel('.app-sheet .sh-c');
  await click('.app-sheet .title-bar-controls .max', 600);
  const snapB = await ev("return [...document.querySelectorAll('.app-sheet .sh-c')].map((c) => c.parentElement.getAttribute('aria-rowindex') + ':' + c.getAttribute('aria-colindex') + '=' + c.textContent + '|' + c.className + '|' + (c.dataset.bd || '') + '|' + c.style.cssText).join('\\n')");
  ok('開き直すと、見えるセルの中身・書式・位置が同じ', snapA === snapB && snapA.length > 200, `${snapA.length} 文字`);
  await cmd('saveas');
  await fileDialog('確かめ2.fsheet');
  const saved2 = await readFile('/ドキュメント/確かめ2.fsheet');
  ok('開き直して保存したファイルの中身が、前のファイルと同じ', saved === saved2, `${saved.length} / ${saved2.length}`);
  ok('列の幅も残っている', /"colW":\{[^}]*"L":/.test(saved2));
  await shot('06-reopen');

  /* CSV に書き出して読み戻すと同じ */
  await go('N1'); await type('"引用符",とカンマ'); await type('="一行目"&" 二行目"');
  const want = {};
  for (const a of ['B1', 'A4', 'C1', 'C3', 'J4', 'L2', 'M4', 'A6', 'N1', 'N2']) { await go(a); want[a] = await text(a); }
  await cmd('csvsave');
  await fileDialog('確かめ.csv');
  const csv1 = await readFile('/ドキュメント/確かめ.csv');
  ok('CSV で保存でき、, と " を含む欄は引用符で囲む', /\r\n/.test(csv1) && csv1.includes('"""引用符"",とカンマ"'), csv1.split('\r\n')[0]);
  await cmd('csvopen');
  await fileDialog('確かめ.csv');
  await answer('いいえ');
  await sleep(500);
  ok('CSV を読み込むと題に名前が出る', /確かめ\.csv/.test(await title()), await title());
  const got = {};
  for (const a of Object.keys(want)) { await go(a); got[a] = await text(a); }
  ok('CSV から読み戻した値が、書き出す前の表示と同じ（式は値、日付は日付、引用符も）', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
  await cmd('csvsave');
  await fileDialog('確かめ2.csv');
  const csv2 = await readFile('/ドキュメント/確かめ2.csv');
  ok('CSV に書き出して読み戻し、もう一度書き出すと同じ', csv1 === csv2, `${csv1.length} / ${csv2.length}`);
  // CSV のまま上書き保存すると、形を聞かれる
  await cmd('save');
  ok('CSV を上書き保存しようとすると、.fsheet にするか聞かれる', await waitSel('dialog.msgbox[open]', 4000) && /CSV/.test(await ev("return document.querySelector('dialog.msgbox[open] .msgbox-text').textContent")));
  await answer('キャンセル');

  /* パソコンへ書き出す（ダウンロードの中身を受け取って確かめる） */
  await ev("window.__dl = []; window.__click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dl.push({ name: this.download, href: this.href }); else window.__click.call(this); }; return true;");
  await cmd('export'); await cmd('exportcsv'); await sleep(200);
  const dl = JSON.parse(await ev("const out = []; for (const d of window.__dl) { const b = new Uint8Array(await (await fetch(d.href)).arrayBuffer()); out.push({ name: d.name, bom: b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf, text: new TextDecoder().decode(b) }); } HTMLAnchorElement.prototype.click = window.__click; return JSON.stringify(out);"));
  ok('パソコンへ書き出す（.fsheet の JSON）', dl[0] && /\.fsheet$/.test(dl[0].name) && JSON.parse(dl[0].text).format === 'future-os-sheet', dl[0]?.name);
  ok('パソコンへ CSV で書き出す（先頭に BOM、中身は保存した CSV と同じ）', dl[1] && dl[1].bom && dl[1].text === csv2, dl[1]?.name);

  /* 右クリックのメニューと、見本をもう一度 */
  const [cx, cy] = await cellXY('B2');
  await page.click(cx, cy, { button: 'right' });
  await sleep(300);
  ok('右クリックでメニューが出る', await ev("return document.querySelector('.sh-ctx').classList.contains('open')"));
  await shot('07-context');
  await page.key('Escape'); await sleep(200);
  await cmd('sample'); await sleep(800);
  ok('ヘルプから見本の表をもう一度開ける', (await ev("return document.querySelectorAll('.app-sheet').length")) === 2);
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));

  /* アイコンを大きく見る */
  await page.navigate(`http://127.0.0.1:${PORT}/os/icons/sheet.svg`);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 256, height: 256, deviceScaleFactor: 1, mobile: false });
  await ev("document.documentElement.style.background = '#f4eef8'; const s = document.querySelector('svg'); s.setAttribute('width', 256); s.setAttribute('height', 256); s.style.imageRendering = 'pixelated'; return true;");
  await shot('08-icon');
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await page.navigate(URL0 + '?shot').catch(() => {});
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'sheet-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
