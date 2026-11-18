// 音声エディタ（os/js/apps/wave.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// 作り物の音（core/wave.mjs の tone で作ったサイン波の WAV）を仮想ドライブに書いて開き、範囲の選び方・拡大・編集・元に戻す・効果・
// 再生・保存・開き直し・パソコンからのドロップ・新しい音・見本の音・書き出しを、マウスとキーで操作して確かめる。
// 音声レコーダーで録った WAV が開けることも、作り物のマイク（--use-fake-device-for-media-stream）で録音して確かめる。
// 確かめ専用の Chrome のプロファイル（runtime/wave-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8793 を動かしてから、node tools/wave-check.mjs [番号=8793]
//   画面の写真は build/wave-check/、結果は logs/wave-check.json
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8793;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'wave-check'), DL = join(OUT, 'download');
mkdirSync(OUT, { recursive: true });
rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'wave-profile'), fakeMedia: true });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info: String(info) }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info !== '' ? ' ' + info : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
const waitSel = async (sel, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await ev(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(150); } return false; };
const center = async (sel) => JSON.parse(await ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'null'; const r = el.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2])`));
async function click(sel, wait = 300) {
  if (!(await waitSel(sel))) throw new Error('見つからない: ' + sel);
  const r = await center(sel);
  await page.click(r[0], r[1]);
  await sleep(wait);
}
const WIN = "(await import('./js/wm.mjs')).list().find((w) => w.app === 'wave')";
const S = async () => JSON.parse(await ev(`const w = ${WIN}; return JSON.stringify(w ? w.wave.state() : null)`));
const select = (a, b) => ev(`(${WIN}).wave.select(${a}, ${b}); return true;`);
const samples = async (k, from, n) => JSON.parse(await ev(`return JSON.stringify((${WIN}).wave.samples(${k}, ${from}, ${n}))`));
const status = () => ev("return document.querySelector('.app-wave .status-field[data-status]').textContent");
const selText = () => ev("return document.querySelector('.app-wave [data-sel]').textContent");
async function waitState(pred, ms = 8000) { let s = null; for (let t = 0; t < ms; t += 120) { s = await S(); if (s && pred(s)) return s; await sleep(120); } return s; }
// 波形の上の、標本 f の位置（画面の座標）
async function xy(f, lane = 0.5) {
  const r = JSON.parse(await ev("const r = document.querySelector('.app-wave [data-stage]').getBoundingClientRect(); return JSON.stringify([r.left, r.top, r.height])"));
  const s = await S();
  return [r[0] + (f - s.view.start) / s.view.spp, r[1] + 24 + (r[2] - 24) * lane];
}
async function menu(title, command, wait = 400) {
  const r = JSON.parse(await ev(`const t = [...document.querySelectorAll('.app-wave .menu-bar > .menu-title')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(title)})); const b = t.getBoundingClientRect(); return JSON.stringify([b.left + 12, b.top + b.height / 2])`));
  await page.click(r[0], r[1]); await sleep(250);
  await click(`.app-wave .menu-title.open .menu-item[data-command="${command}"], .app-wave .menu-item[data-command="${command}"]`, wait);
}
const answer = (value) => click(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 500);
const focusStage = async () => { await ev("document.querySelector('.app-wave [data-stage]').focus(); return true;"); };
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const sameList = (a, b, eps = 1e-6) => a.length === b.length && a.every((v, i) => near(v, b[i], eps));
// 作り物の音を仮想ドライブに書く（16 ビットの WAV）
const writeTone = (p, opts, dc = 0) => ev(`const fs = await import('./js/fs.mjs'); const W = await import('./js/core/wave.mjs'); const { encodeWAV } = await import('./js/core/wav.mjs');
  const a = W.tone(${JSON.stringify(opts)}); a.channels.forEach((c) => { for (let i = 0; i < c.length; i++) c[i] += ${dc}; });
  await fs.write(${JSON.stringify(p)}, new Blob([encodeWAV(a.channels, a.rate)], { type: 'audio/wav' }), 'audio/wav'); return true;`);
const openIn = async (p) => { await ev(`const sh = await import('./js/shell.mjs'); await sh.openFile(${JSON.stringify(p)}, 'wave'); return true;`); };
const closeWave = async () => { await click('.app-wave .title-bar-controls .close', 500); };

try {
  await page.navigate(URL0 + '?shot');
  await wipe();
  await page.navigate(URL0 + '?shot=wave');

  /* ---------- 1. 空のときの案内 ---------- */
  ok('?shot=wave で音声エディタが開く', await waitSel('.app-wave [data-stage]', 20000));
  await sleep(600);
  ok('音が無いとき、作業域の中に「ファイルを開くか、ここへ音声を落としてください」', await ev("const e = document.querySelector('.app-wave [data-empty]'); return !e.hidden && e.textContent.includes('ファイルを開くか、ここへ音声を落としてください')"));
  ok('状態の帯に、初めの案内が出る', /ファイルを開くか/.test(await status()), await status());
  ok('音が無いとき、編集のボタンは押せない印（aria-disabled）', await ev("return document.querySelector('.app-wave .wv-btn[data-a=\"cut\"]').getAttribute('aria-disabled') === 'true'"));
  ok('デスクトップのスタートメニューのアプリ一覧に名前がある', await ev("const sh = await import('./js/shell.mjs'); return sh.APPS.wave.name === '音声エディタ' && sh.APPS.wave.icon === 'icons/wave.svg'"));
  await shot('01-empty');

  /* ---------- 2. 作り物の音を書いて、窓へ落として開く ---------- */
  await writeTone('/音楽/テスト.wav', { freqs: [440, 660], seconds: 2, rate: 44100, amp: 0.5 });
  await writeTone('/音楽/ずれ.wav', { freq: 200, seconds: 0.5, rate: 16000, amp: 0.3 }, 0.2);
  await ev("document.querySelector('.app-wave .app-body').dispatchEvent(new CustomEvent('fos:drop-file', { detail: { path: '/音楽/テスト.wav' }, bubbles: true })); return true;");
  let s = await waitState((x) => x.frames > 0);
  ok('仮想ドライブのファイルを窓へ落とす（fos:drop-file）と開く', s.frames === 88200 && s.rate === 44100 && s.channels === 2, JSON.stringify([s.frames, s.rate, s.channels]));
  ok('案内の箱が消え、状態の帯に形と長さ', !(await ev("return !document.querySelector('.app-wave [data-empty]').hidden")) && /44100 Hz ・ ステレオ ・ 長さ 0:02\.000/.test(await ev("return document.querySelector('.app-wave [data-fmt]').textContent")));
  ok('窓の題にファイル名', await ev("return document.querySelector('.app-wave .title-bar-text').textContent === 'テスト.wav - 音声エディタ'"));
  ok('全体が見えるように表示する', near(s.view.spp, 88200 / s.width, 1e-6), JSON.stringify(s.view));
  const orig = await samples(0, 0, 88200), origR = await samples(1, 0, 88200);
  ok('読んだ値が作った値と同じ（16 ビットの誤差まで）', near(orig[100], 0.5 * Math.sin((2 * Math.PI * 440 * 100) / 44100), 1 / 32000) && near(origR[100], 0.5 * Math.sin((2 * Math.PI * 660 * 100) / 44100), 1 / 32000));
  await sleep(300);
  await shot('02-open-stereo');

  /* ---------- 3. 範囲を選ぶ（ドラッグ・Shift+クリック・クリック・すべて選択） ---------- */
  let a = await xy(22050), b = await xy(44100);
  await page.drag(a[0], a[1], b[0], b[1]); await sleep(300);
  s = await S();
  const tol = s.view.spp * 1.5;
  ok('ドラッグで範囲を選ぶ（0.5 秒〜1.0 秒）', near(s.sel[0], 22050, tol) && near(s.sel[1], 44100, tol), JSON.stringify(s.sel));
  ok('状態の帯に、範囲の始め・終わり・長さ（秒とミリ秒）', /^始め 0:00\.\d{3} ・ 終わり 0:0[01]\.\d{3} ・ 長さ 0:00\.\d{3}$/.test(await selText()), await selText());
  await shot('03-select');
  a = await xy(66150);
  await page.click(a[0], a[1], { modifiers: 8 }); await sleep(250);
  s = await S();
  ok('Shift+クリックで範囲を広げる（終わりが 1.5 秒へ）', near(s.sel[0], 22050, tol) && near(s.sel[1], 66150, tol), JSON.stringify(s.sel));
  a = await xy(11025);
  await page.click(a[0], a[1]); await sleep(250);
  s = await S();
  ok('クリックでカーソルを置く', s.sel[0] === s.sel[1] && near(s.sel[0], 11025, tol) && /^カーソル 0:00\.2\d\d$/.test(await selText()), await selText());
  await page.key('Control+a'); await sleep(200);
  s = await S();
  ok('Ctrl+A ですべて選択', s.sel[0] === 0 && s.sel[1] === 88200);
  await page.key('Escape'); await sleep(150);
  ok('Esc で選択を外す', (await S()).sel[1] === (await S()).sel[0]);
  await page.key('End'); await page.key('Shift+Home'); await sleep(150);
  ok('End と Shift+Home で、キーボードでも全体を選べる', JSON.stringify((await S()).sel) === '[0,88200]');

  /* ---------- 4. 拡大・縮小・横のスクロール ---------- */
  const st = JSON.parse(await ev("const r = document.querySelector('.app-wave [data-stage]').getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2])"));
  let spp0 = (await S()).view.spp;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: st[0], y: st[1], deltaX: 0, deltaY: -120, modifiers: 2 }); await sleep(250);
  s = await S();
  ok('Ctrl+ホイールで拡大（1.5 倍）', near(s.view.spp, spp0 / 1.5, 1e-6), `${spp0} → ${s.view.spp}`);
  await click('.app-wave .wv-btn[data-a="zoomin"]');
  s = await S();
  ok('「拡大」のボタンで 2 倍', near(s.view.spp, spp0 / 3, 1e-6));
  const start0 = s.view.start;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: st[0], y: st[1], deltaX: 0, deltaY: 200, modifiers: 0 }); await sleep(250);
  s = await S();
  ok('ホイールで横へ送る', s.view.start > start0, `${start0} → ${s.view.start}`);
  await ev("const sc = document.querySelector('.app-wave [data-scroll]'); sc.scrollLeft = sc.scrollWidth; return true;"); await sleep(300);
  s = await S();
  ok('横のスクロールのつまみを右の端へ動かすと、音の終わりが見える', near(s.view.start + s.width * s.view.spp, 88200, s.view.spp * 2), JSON.stringify(s.view));
  await shot('04-zoom');
  // いちばん大きく拡大すると、標本を線でつなぎ、標本の点も描く
  await focusStage(); await select(30000, 30000);
  for (let i = 0; i < 14; i++) await page.key('+');
  await sleep(200);
  s = await S();
  ok('「+」のキーで、1 標本が 32 画素の大きさまで拡大できる', near(s.view.spp, 1 / 32, 1e-9), s.view.spp);
  ok('拡大してもカーソルが表示の中にある', s.view.start <= 30000 && 30000 <= s.view.start + s.width * s.view.spp, JSON.stringify(s.view));
  await shot('04b-zoom-samples');
  await page.key('0'); await sleep(200);
  ok('「0」のキーで全体を見る', near((await S()).view.spp, 88200 / s.width, 1e-6));
  await click('.app-wave .wv-btn[data-a="zoomout"]');
  ok('全体より縮めない', near((await S()).view.spp, 88200 / s.width, 1e-6));

  /* ---------- 5. 編集（切り取り・元に戻す・やり直し・貼り付け・コピー・削除・無音・残す） ---------- */
  await focusStage();
  await select(22050, 44100);
  await page.key('Control+x'); await sleep(250);
  s = await S();
  ok('Ctrl+X で切り取る（長さが 0.5 秒減る）', s.frames === 66150 && s.clip?.frames === 22050, JSON.stringify([s.frames, s.clip]));
  ok('切り取ったあとは、切った位置の続きの音が来る', sameList(await samples(0, 22050, 4), orig.slice(44100, 44104)));
  await page.key('Control+z'); await sleep(250);
  s = await S();
  ok('Ctrl+Z で元に戻す（長さと値が戻る）', s.frames === 88200 && sameList(await samples(0, 22050, 4), orig.slice(22050, 22054)) && s.sel[0] === 22050 && s.sel[1] === 44100);
  await page.key('Control+y'); await sleep(250);
  ok('Ctrl+Y でやり直す', (await S()).frames === 66150);
  await select(0, 0);
  await page.key('Control+v'); await sleep(250);
  s = await S();
  ok('Ctrl+V でカーソルの位置へ挿入し、貼った部分を選ぶ', s.frames === 88200 && s.sel[0] === 0 && s.sel[1] === 22050 && sameList(await samples(0, 0, 4), orig.slice(22050, 22054)), JSON.stringify(s.sel));
  await select(0, 1000);
  await click('.app-wave .wv-btn[data-a="copy"]');
  ok('「コピー」のボタン', (await S()).clip?.frames === 1000);
  await select(5000, 9000);
  await click('.app-wave .wv-btn[data-a="paste"]');
  s = await S();
  ok('範囲があるときの貼り付けは置き換え（4000 → 1000 標本）', s.frames === 85200 && s.sel[0] === 5000 && s.sel[1] === 6000, JSON.stringify([s.frames, s.sel]));
  ok('状態の帯に「置き換えて貼りました」', /置き換えて貼りました/.test(await status()), await status());
  await select(0, 4410); await focusStage();
  await page.key('Delete'); await sleep(250);
  ok('Delete で削除', (await S()).frames === 85200 - 4410);
  await select(1000, 2000);
  await click('.app-wave .wv-btn[data-a="silence"]');
  s = await S();
  ok('「無音」で範囲だけ 0 になり、長さは同じ', s.frames === 80790 && (await samples(0, 1000, 1000)).every((v) => v === 0) && (await samples(0, 999, 1))[0] !== 0);
  await select(10000, 30000);
  await click('.app-wave .wv-btn[data-a="trim"]');
  s = await S();
  ok('「残す」で選んだ範囲だけになる', s.frames === 20000 && s.sel[0] === 0 && s.sel[1] === 20000);
  ok('元に戻すの数が 6', s.undo === 6, s.undo);
  await shot('05-edited');
  for (let i = 0; i < 6; i++) { await click('.app-wave .wv-btn[data-a="undo"]', 120); }
  s = await S();
  ok('「元に戻す」を 6 回で最初の音に戻る', s.frames === 88200 && sameList(await samples(0, 0, 88200), orig) && s.undo === 0 && s.redo === 6);
  ok('戻せるものが無いとき、ボタンは押せない印', await ev("return document.querySelector('.app-wave .wv-btn[data-a=\"undo\"]').getAttribute('aria-disabled') === 'true'"));
  // 22 回の編集を全部戻せる（少なくとも 20 回分）
  await focusStage();
  for (let i = 0; i < 22; i++) { await select(i * 100, i * 100 + 50); await page.key('Delete'); }
  await sleep(200);
  s = await S();
  ok('22 回の削除を覚えている', s.undo === 22 && s.frames === 88200 - 22 * 50, JSON.stringify([s.undo, s.frames]));
  for (let i = 0; i < 22; i++) await page.key('Control+z');
  await sleep(300);
  s = await S();
  ok('22 回元に戻すと、最初の音と同じ', s.frames === 88200 && s.undo === 0 && sameList(await samples(1, 0, 88200), origR));

  /* ---------- 6. 効果 ---------- */
  await select(0, 0);
  await menu('効果', 'gain');
  ok('「音量を変える」の箱が開き、全体が対象と書いてある', await waitSel('dialog.wv-dlg[open] #wvDb') && /全体（0:02\.000）/.test(await ev("return document.querySelector('dialog.wv-dlg[open]').textContent")));
  await page.key('Control+a'); await page.typeText('-6.0206'); await sleep(150);
  await shot('06-gain-dialog');
  await page.key('Enter'); await sleep(400);
  s = await S();
  ok('Enter で決めると、全体の音量が半分（−6 dB）', near(s.peak, 0.25, 0.001) && !(await ev("return !!document.querySelector('dialog.wv-dlg[open]')")), s.peak);
  ok('元に戻すのメニューに操作の名前', /元に戻す（音量 -6\.0206 dB）/.test(await ev("return document.querySelector('.app-wave .menu-item[data-command=\"undo\"] .label').textContent")));
  await menu('効果', 'normalize');
  await waitSel('dialog.wv-dlg[open] #wvTarget');
  await click('dialog.wv-dlg[open] button.default', 400);
  s = await S();
  ok('ノーマライズで最大が −1 dB（0.891）にそろう', near(s.peak, 10 ** (-1 / 20), 0.001), s.peak);
  await menu('効果', 'gain'); await waitSel('dialog.wv-dlg[open]');
  await click('dialog.wv-dlg[open] button[data-close=""]', 400);
  ok('箱を「キャンセル」で閉じると何も変わらない', (await S()).undo === 2);
  await select(0, 4410);
  await menu('効果', 'fadein');
  const fin = await samples(0, 0, 4410), base = await samples(0, 4435, 1);
  ok('フェードイン: 範囲の始めが 0、範囲の外は変わらない', fin[0] === 0 && Math.abs(fin[100]) < 0.05 && Math.abs(base[0]) > 0.1, JSON.stringify([fin[0], fin[100], base[0]]));
  await select(88200 - 4410, 88200);
  await menu('効果', 'fadeout');
  ok('フェードアウト: 範囲の終わりが 0', (await samples(0, 88199, 1))[0] === 0 && (await samples(1, 88199, 1))[0] === 0);
  await select(10000, 10100);
  const before = await samples(0, 10000, 100);
  await menu('効果', 'reverse');
  ok('逆再生: 範囲の中が後ろから前へ', sameList(await samples(0, 10000, 100), before.slice().reverse()));
  for (let i = 0; i < 5; i++) await page.key('Control+z');
  ok('効果も元に戻せる', sameList(await samples(0, 0, 88200), orig));

  /* ---------- 7. 再生 ---------- */
  await select(0, 0); await focusStage();
  await page.key(' '); await sleep(500);
  s = await S();
  ok('Space でカーソルから鳴らし、再生の位置が進む', s.playing && s.pos > 0.15, JSON.stringify([s.playing, s.pos]));
  await shot('07-playing');
  ok('再生中の位置の線（ばら色）を描く', await ev(`const c = document.querySelector('.app-wave [data-canvas]'), g = c.getContext('2d'), d = g.getImageData(0, 4 * devicePixelRatio, c.width, 1).data; for (let i = 0; i < d.length; i += 4) if (d[i] === 255 && d[i + 1] === 92 && d[i + 2] === 151) return true; return false;`));
  await page.key(' '); await sleep(200);
  ok('もう一度 Space で止める', !(await S()).playing);
  await select(22050, 26460);
  await click('.app-wave .wv-btn[data-a="loop"]');
  ok('「くり返し」の切り替え（aria-pressed とメニューの印）', (await S()).loop && await ev("return document.querySelector('.app-wave .wv-btn[data-a=\"loop\"]').getAttribute('aria-pressed') === 'true' && document.querySelector('.app-wave .menu-item[data-command=\"loop\"]').classList.contains('checked')"));
  await click('.app-wave .wv-btn[data-a="playSel"]', 700);
  s = await S();
  ok('選んだ範囲（0.1 秒）だけを、くり返し鳴らす（0.7 秒たっても範囲の中）', s.playing && s.pos >= 0.5 - 0.01 && s.pos <= 0.6 + 0.01, JSON.stringify([s.playing, s.pos]));
  await click('.app-wave .wv-btn[data-a="stop"]');
  ok('「停止」で止まる', !(await S()).playing);
  await click('.app-wave .wv-btn[data-a="loop"]');
  await click('.app-wave .wv-btn[data-a="playStart"]', 300);
  s = await S();
  ok('「最初から」は 0 秒から鳴らす', s.playing && s.pos < 0.6, s.pos);
  await focusStage(); await page.key('Escape'); await sleep(200);
  ok('Esc でも止まる', !(await S()).playing);
  await page.key('Alt+b'); await sleep(300);
  ok('Alt+B（「最初から(B)」の下線の文字）でも鳴らせる', (await S()).playing);
  await page.key('Escape'); await sleep(150);
  // 道具の帯は 1 つのタブの位置で、矢印キーと Home・End で中を動く
  await ev("document.querySelector('.app-wave .wv-btn[data-a=\"playStart\"]').focus(); return true;");
  await page.key('ArrowRight'); await sleep(100);
  const f1 = await ev('return document.activeElement.dataset.a');
  await page.key('End'); await sleep(100);
  const f2 = await ev('return document.activeElement.dataset.a');
  ok('道具の帯の中を、矢印キーと End で動ける', f1 === 'playCursor' && f2 === 'fit', JSON.stringify([f1, f2, await ev("return 'focusGroup' in HTMLElement.prototype ? 'focusgroup' : '代わりの処理'")]));
  await select(87000, 88200);
  await click('.app-wave .wv-btn[data-a="playSel"]');
  await sleep(1000);
  ok('くり返しなしの範囲の再生は、終わると止まる', !(await S()).playing && /再生が終わりました/.test(await status()), await status());

  /* ---------- 8. 保存と開き直し ---------- */
  await select(0, 22050); await focusStage(); await page.key('Delete'); await sleep(200);
  await select(1000, 3000); await page.key('Control+x'); await sleep(200);
  ok('変更があると題に * が付く', await ev("return document.querySelector('.app-wave .title-bar-text').textContent.startsWith('*')"));
  await page.key('Control+s'); await sleep(600);
  s = await S();
  const savedSize = await ev("const fs = await import('./js/fs.mjs'); return (await fs.stat('/音楽/テスト.wav')).size");
  ok('Ctrl+S で上書き保存（WAV 16 ビット、ステレオ）', !s.dirty && savedSize === 44 + s.frames * 4, JSON.stringify([s.frames, savedSize]));
  await menu('ファイル', 'saveas', 600);
  await waitSel('dialog.file-dlg[open] #fdName');
  ok('名前を付けて保存の箱は /音楽 の .wav', /テスト\.wav/.test(await ev("return document.querySelector('#fdName').value")));
  await ev("const i = document.querySelector('#fdName'); i.value = '編集後.wav'; return true;");
  await click('dialog.file-dlg[open] [data-ok]', 800);
  s = await S();
  ok('名前を付けて保存すると、題と開いているファイルが変わる', s.path === '/音楽/編集後.wav' && await ev("return document.querySelector('.app-wave .title-bar-text').textContent === '編集後.wav - 音声エディタ'"), s.path);
  const edited = [await samples(0, 0, s.frames), await samples(1, 0, s.frames)], editedFrames = s.frames;
  await closeWave();
  await page.navigate(URL0 + '?shot=wave:/音楽/編集後.wav');
  s = await waitState((x) => x.frames > 0, 15000);
  ok('?shot=wave:パス で保存したファイルを開き直す', s?.path === '/音楽/編集後.wav');
  ok('開き直すと、長さ・周波数・チャンネル・値が保存前と同じ', s.frames === editedFrames && s.rate === 44100 && s.channels === 2 && sameList(await samples(0, 0, s.frames), edited[0], 1 / 32767 + 1e-7) && sameList(await samples(1, 0, s.frames), edited[1], 1 / 32767 + 1e-7));
  await sleep(300);
  await shot('08-reopened');

  /* ---------- 9. 音声レコーダーで録った WAV を開く ---------- */
  // 音声エディタの窓は 1 つだけにして確かめる（document.querySelector('.app-wave …') が同じ窓を指すように）
  await closeWave();
  await ev("const sh = await import('./js/shell.mjs'); await sh.launch('recorder'); return true;");
  await click('.app-recorder [data-a="rec"]', 1500);
  await click('.app-recorder [data-a="stop"]', 800);
  await click('.app-recorder [data-a="save"]', 600);
  await waitSel('dialog.file-dlg[open] #fdName');
  const recName = await ev("return document.querySelector('#fdName').value");
  await click('dialog.file-dlg[open] [data-ok]', 800);
  const recPath = '/音楽/' + recName;
  ok('音声レコーダーで録音して /音楽 に保存した', await ev(`const fs = await import('./js/fs.mjs'); return !!(await fs.stat(${JSON.stringify(recPath)}))`), recPath);
  await click('.app-recorder .title-bar-controls .close', 500);
  await openIn(recPath);
  s = await waitState((x) => x.path === recPath && x.frames > 0);
  ok('録音の WAV（モノラル 16 ビット）がそのまま開ける', s.channels === 1 && s.rate >= 8000 && s.frames > s.rate * 0.8, JSON.stringify([s.frames, s.rate, s.channels]));
  await sleep(300);
  await shot('09-recorder-file');
  // WAV 以外（WebM の Opus）は、ブラウザの読み込み（decodeAudioData）で開く
  await ev(`const fs = await import('./js/fs.mjs'); const c = new AudioContext(), o = c.createOscillator(), dest = c.createMediaStreamDestination(); o.connect(dest); o.start();
    const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' }), parts = []; rec.ondataavailable = (e) => parts.push(e.data);
    rec.start(); await new Promise((r) => setTimeout(r, 800)); const done = new Promise((r) => { rec.onstop = r; }); rec.stop(); await done; o.stop(); await c.close();
    await fs.write('/音楽/圧縮.weba', new Blob(parts, { type: 'audio/webm' }), 'audio/webm'); return true;`);
  await ev("document.querySelector('.app-wave .app-body').dispatchEvent(new CustomEvent('fos:drop-file', { detail: { path: '/音楽/圧縮.weba' }, bubbles: true })); return true;");
  s = await waitState((x) => x.path === '/音楽/圧縮.weba');
  ok('WAV 以外の音（WebM の Opus）も開ける', s?.frames > s?.rate * 0.3 && s?.peak > 0.1, JSON.stringify([s?.frames, s?.rate, s?.channels, s?.peak]));
  // 壊れたファイルは、誤りの箱を出して、いまの音はそのまま
  await ev("const fs = await import('./js/fs.mjs'); await fs.write('/音楽/壊れた.wav', new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 9, 9, 9, 9, 7, 7])]), 'audio/wav'); document.querySelector('.app-wave .app-body').dispatchEvent(new CustomEvent('fos:drop-file', { detail: { path: '/音楽/壊れた.wav' }, bubbles: true })); return true;");
  ok('壊れたファイルを開くと、誤りの箱が出る', await waitSel('dialog.msgbox[open]', 5000) && /開けませんでした/.test(await ev("return document.querySelector('dialog.msgbox[open]').textContent")));
  await answer('OK');
  ok('誤りのあとも、前の音のまま', (await S()).path === '/音楽/圧縮.weba');
  // 同じ窓でずれのある音を開き、直流のずれを取る
  await ev("document.querySelector('.app-wave .app-body').dispatchEvent(new CustomEvent('fos:drop-file', { detail: { path: '/音楽/ずれ.wav' }, bubbles: true })); return true;");
  s = await waitState((x) => x.path === '/音楽/ずれ.wav');
  const mean = async () => { const d = await samples(0, 0, 8000); return d.reduce((t, v) => t + v, 0) / d.length; };
  const m0 = await mean();
  await menu('効果', 'dc');
  const m1 = await mean();
  ok('直流のずれを取る: 平均が 0.2 から 0 へ', near(m0, 0.2, 0.01) && near(m1, 0, 1e-4), JSON.stringify([m0, m1]));

  /* ---------- 10. パソコンのファイルを落とす・別の形の音を貼る ---------- */
  await ev(`const W = await import('./js/core/wave.mjs'); const { encodeWAV } = await import('./js/core/wav.mjs');
    const a = W.tone({ freq: 880, seconds: 0.5, rate: 22050, amp: 0.4 }), file = new File([encodeWAV(a.channels, a.rate)], 'パソコンの音.wav', { type: 'audio/wav' });
    const dt = new DataTransfer(); dt.items.add(file);
    const st = document.querySelector('.app-wave [data-stage]');
    st.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    st.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); return true;`);
  ok('変更があるときに別の音を開くと、保存するか聞く', await waitSel('dialog.msgbox[open]', 4000));
  await answer('いいえ');
  s = await waitState((x) => x.name === 'パソコンの音.wav');
  ok('パソコンのファイルを窓へ落とすと開く（仮想ドライブには入れない）', s.frames === 11025 && s.rate === 22050 && s.channels === 1 && s.path === null, JSON.stringify([s.frames, s.rate, s.path]));
  await focusStage(); await page.key('Control+a'); await page.key('Control+c'); await sleep(150);
  await ev("document.querySelector('.app-wave .app-body').dispatchEvent(new CustomEvent('fos:drop-file', { detail: { path: '/音楽/テスト.wav' }, bubbles: true })); return true;");
  s = await waitState((x) => x.path === '/音楽/テスト.wav');
  const tf = s.frames;
  await select(0, 0); await focusStage(); await page.key('Control+v'); await sleep(300);
  s = await S();
  ok('22050 Hz・モノラルの音を 44100 Hz・ステレオへ貼ると、周波数とチャンネルをそろえる', s.frames === tf + 22050 && s.channels === 2 && s.rate === 44100, JSON.stringify([tf, s.frames]));
  ok('状態の帯に、そろえたことを書く', /22050 Hz の音を 44100 Hz に直しました。モノラルをステレオにしました/.test(await status()), await status());
  const l = await samples(0, 5000, 3), r = await samples(1, 5000, 3);
  ok('モノラルから貼った部分は左右が同じ', sameList(l, r));

  /* ---------- 11. 新しい音・見本の音・書き出し ---------- */
  await menu('ファイル', 'new', 500);
  ok('変更があるので、新しい音の前に保存するか聞く', await waitSel('dialog.msgbox[open]', 3000));
  await answer('いいえ');
  await waitSel('dialog.wv-dlg[open] #wvLen');
  await ev("const d = document.querySelector('dialog.wv-dlg[open]'); d.querySelector('#wvLen').value = '3'; d.querySelector('#wvRate').value = '22050'; d.querySelector('input[name=nch][value=\"2\"]').checked = true; return true;");
  await shot('10-new-dialog');
  await click('dialog.wv-dlg[open] button.default', 500);
  s = await S();
  ok('新しい音: 3 秒・22050 Hz・ステレオの無音', s.frames === 66150 && s.rate === 22050 && s.channels === 2 && s.peak === 0 && s.path === null && s.undo === 0, JSON.stringify([s.frames, s.rate, s.channels]));
  await closeWave();
  await ev("const sh = await import('./js/shell.mjs'); await sh.launch('wave'); return true;");
  await click('.app-wave [data-a="sample"]', 400);
  s = await S();
  ok('「見本の音」で、すぐ試せる音ができる', s.frames > 44100 && s.peak > 0.3 && s.name === '見本の音.wav');
  await page.key(' '); await sleep(300);
  ok('見本の音を Space で鳴らせる', (await S()).playing);
  await page.key(' ');
  await select(10000, 30000);
  await sleep(200);
  await shot('11-sample');
  await page.raw('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await menu('ファイル', 'export', 1500);
  let dl = null;
  for (let t = 0; t < 30 && !dl; t++) { dl = readdirSync(DL).find((f) => f.endsWith('.wav')); if (!dl) await sleep(200); }
  ok('「パソコンへ書き出す」で WAV が保存される', dl === '見本の音.wav' && statSync(join(DL, dl)).size === 44 + s.frames * 2, dl);
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));
  await sleep(500); // 記録は 250 ミリ秒ごとにまとめてサーバーへ送られる
  const logText = existsSync(join(ROOT, 'logs', 'app.log')) ? (await import('node:fs')).readFileSync(join(ROOT, 'logs', 'app.log'), 'utf8') : '';
  const need = ['wave.open', 'wave.edit', 'wave.undo', 'wave.play', 'wave.stop', 'wave.save', 'wave.drop', 'wave.export', 'wave.new'];
  ok('操作と読み書きと再生が logs/app.log に記録される', need.every((k) => logText.includes(' ' + k + ' ')), need.filter((k) => !logText.includes(' ' + k + ' ')).join(','));
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'wave-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((x) => !x.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
