// 講座の窓（os/js/apps/course.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// 課へ進む・答え合わせ・手本との違い・代わりにやって・課を飛ばしたときのそろえ・アプリの登録・差し色・目次を見る。
// 確かめ専用の Chrome のプロファイル（runtime/course-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8791 を動かしてから、node tools/yugure-course-check.mjs [番号=8791]
//   画面の写真は build/course-check/、結果は logs/course-check.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8791;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'course-check');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'course-profile') });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info ? ' ' + info : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
const center = async (sel) => JSON.parse(await ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'null'; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2])`));
const waitSel = async (sel, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await ev(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(150); } return false; };
async function click(sel, wait = 300) {
  if (!(await waitSel(sel))) throw new Error('見つからない: ' + sel);
  const r = await center(sel);
  await page.click(r[0], r[1]);
  await sleep(wait);
}
const C = (js) => ev(`const w = document.querySelector('.app-course'); return ${js}`);
// メッセージの箱のボタンを押す（value は「はい」「いいえ」「OK」など）
const answer = (value) => click(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 500);
async function waitVerdict(ms = 90000) {
  for (let t = 0; t < ms; t += 250) {
    const v = await C("w.querySelector('[data-verdict]').textContent");
    if (v && v !== '確かめています…') return v;
    await sleep(250);
  }
  return 'timeout';
}
async function check() { await click('.app-course .cr-bar [data-a="check"]', 300); return waitVerdict(); }
const heading = () => C("w.querySelector('[data-head] .cr-id')?.textContent || ''");
const failed = () => C("[...w.querySelectorAll('.cr-check.ng')].map((li) => li.textContent).join(' / ')");
async function goTo(id, align = 'はい') {
  if (!(await C("!!w.querySelector('[data-go]')"))) await click('.app-course .cr-bar [data-a="toc"]', 400);
  await click(`.app-course [data-go="${id}"]`, 400);
  if (await ev("return !!document.querySelector('dialog.msgbox[open]')")) await answer(align);
  for (let t = 0; t < 8000 && (await heading()) !== id; t += 200) await sleep(200);
  await sleep(600);
}
async function solve() {
  await click('.app-course .cr-bar [data-a="solve"]', 400);
  await answer('はい');
  await sleep(300);
  return waitVerdict();
}
const closeInfo = async () => { if (await ev("return !!document.querySelector('dialog.msgbox[open] .button-row button[data-close=\"OK\"]')")) await answer('OK'); };
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");

try {
  await page.navigate(URL0 + '?shot');
  await wipe();
  await page.navigate(URL0 + '?shot=course');
  ok('講座の窓が開く', await waitSel('.app-course [data-text] h1', 20000));
  ok('作業場が右に並び、夕暮れ峠のプロジェクトを開く', await waitSel('.app-workshop [data-file$="/index.html"]', 15000));
  const rects = JSON.parse(await ev("const a = document.querySelector('.app-course').getBoundingClientRect(), b = document.querySelector('.app-workshop').getBoundingClientRect(); return JSON.stringify([a.left, a.right, b.left, b.right])"));
  ok('講座の窓が左、作業場が右で重ならない', rects[1] <= rects[2] + 1, JSON.stringify(rects));
  ok('最初の課は 0-1', (await heading()) === '0-1');
  ok('デスクトップに「講座」のアイコン', await ev("return [...document.querySelectorAll('.desk-icon')].some((d) => d.textContent.trim() === '講座')"));
  await sleep(800);
  await shot('01-start');

  // 0-1: 始めの状態のままで合格する課
  let v = await check();
  ok('0-1 答え合わせが合格', v === '合格です', v + ' ' + (await failed()));
  await shot('02-pass');
  // 0-2: 何もしないと通らない → 手本との違い → 代わりにやって
  await click('.app-course .cr-bar [data-a="next"]', 1200);
  ok('次の課へで 0-2 に進む', (await heading()) === '0-2');
  v = await check();
  ok('0-2 何もしないと通らない', v !== '合格です' && v !== 'timeout', v);
  await click('.app-course .cr-bar [data-a="diff"]', 800);
  ok('手本との違いの箱に、足す行と消す行が出る', await ev("const d = document.querySelector('dialog.cr-dlg[open]'); return !!d && d.querySelectorAll('.cr-d.add').length > 0 && d.querySelectorAll('.cr-d.remove').length > 0"));
  await shot('03-diff');
  await click('dialog.cr-dlg[open] button[type="submit"]', 400);
  v = await solve();
  ok('0-2 代わりにやってで合格（手本で済み）', v === '合格です' && (await C("w.querySelector('[data-head] .cr-done')?.textContent")) === '手本で済み', v);
  ok('上書きする前のファイルがゴミ箱に入る', await ev("const fs = await import('./js/fs.mjs'); return (await fs.list('/ゴミ箱')).some((e) => e.name.startsWith('index'))"));

  // 課を飛ばす: 1-6 へそろえて、手本で合格 → 看板がアプリになる
  await goTo('1-6');
  ok('目次から 1-6 へ移り、ファイルを課の始めにそろえる', (await heading()) === '1-6' && (await ev("const fs = await import('./js/fs.mjs'); return /<header|<h1/.test(await fs.readText('/プロジェクト/夕暮れ峠/index.html'))")));
  v = await solve();
  ok('1-6 代わりにやってで合格', v === '合格です', v + ' ' + (await failed()));
  ok('課を終えた知らせが出る', await waitSel('dialog.msgbox[open]', 5000));
  await shot('04-app');
  await closeInfo();
  ok('看板がデスクトップのアイコンになる', await ev("return [...document.querySelectorAll('.desk-icon')].some((d) => d.textContent.includes('夕暮れ峠の看板'))"));

  // 2-6: 差し色
  await goTo('2-6');
  v = await solve();
  ok('2-6 代わりにやってで合格', v === '合格です', v + ' ' + (await failed()));
  await closeInfo();
  const accent = await ev("return document.body.style.getPropertyValue('--fos-sunset')");
  ok('OS の差し色が看板の色になる', /^#[0-9a-f]{3,8}$/i.test(accent), accent);
  await shot('05-accent');

  // 3-8 と 4-8: タイマーと峠のゲーム（ゲームは動きを確かめるので、縮めて見せる画面で描画が進む必要がある）
  await goTo('3-8');
  const ptitle = () => ev("return document.querySelector('.app-workshop [data-ptitle]')?.textContent || ''");
  ok('3-8 では作業場が meter.html を開いて動かす', (await ptitle()) === 'meter.html', await ptitle());
  v = await solve();
  ok('3-8 代わりにやってで合格', v === '合格です', v + ' ' + (await failed()));
  await closeInfo();
  await goTo('4-8');
  ok('4-8 では作業場が game.html を開いて動かす', (await ptitle()) === 'game.html', await ptitle());
  await click('.app-workshop [data-file$="/game/main.js"]', 600);
  await click('.app-workshop [data-a="run"]', 800);
  ok('JS のファイルを開いて「動かす」を押しても、課のページ（game.html）が動く', (await ptitle()) === 'game.html', await ptitle());
  v = await solve();
  ok('4-8 代わりにやってで合格（ゲームの動きの確かめも通る）', v === '合格です', v + ' ' + (await failed()));
  await shot('06-game-pass');
  await closeInfo();
  ok('作ったアプリが 3 つ登録される', (await ev("const fs = await import('./js/fs.mjs'); return (await fs.readJSON('/システム/登録アプリ.json')).filter((r) => r.id.startsWith('yugure-')).length")) === 3);

  // 作ったゲームを OS のアプリとして開く
  await ev("const shell = await import('./js/shell.mjs'); await shell.launch('user:yugure-game'); return true;");
  await sleep(2500);
  ok('登録した峠のゲームが窓で開く', await ev("return [...document.querySelectorAll('.window .title-bar-text')].some((t) => t.textContent.includes('夕暮れ峠（上から走る）'))"));
  await shot('07-userapp');

  // 目次と、差し色を元に戻す
  await click('.app-course .cr-bar [data-a="toc"]', 600);
  const toc = await C("w.querySelector('[data-text]').innerText");
  ok('目次に部ごとの数と済みの印が出る', /第 4 部/.test(toc) && /済み/.test(toc));
  await shot('08-toc');
  await ev("document.querySelector('.app-course .app-body').dispatchEvent(new CustomEvent('w95:command', { detail: { command: 'accent' }, bubbles: true })); return true;");
  await sleep(300);
  ok('メニューの「OS の色を元に戻す」で差し色が戻る', (await ev("return document.body.style.getPropertyValue('--fos-sunset')")) === '');
  ok('進み具合が localStorage に残る', await ev("return Object.keys(JSON.parse(localStorage.getItem('fos-course-yugure')).done).length >= 6"));
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'course-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
