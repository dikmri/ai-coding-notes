// 画面キャプチャ（os/js/apps/capture.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// 作り物の画面・マイクと、許可の自動の承認（openBrowser の fakeMedia）を使う。
// 静止画: 撮る（3 秒待つ・窓を隠す）→ 切り抜く → 元に戻す → 保存（PNG の大きさ）。
// 録画: 録る → 一時停止 → 再開 → 止める → 保存（/ビデオ を作る）→ 保存した WebM の長さ・中身の時刻・video 要素で読めるか
//       → 開き直す → パソコンへ書き出す → 捨てる（確かめの箱）→ 共有が相手の側で止められたとき → 許可されなかったとき → 閉じるときの確かめ。
// 確かめ専用の Chrome のプロファイル（runtime/capture-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8805 を動かしてから、node tools/capture-check.mjs [番号=8805]
//   画面の写真と書き出した動画は build/capture-check/、結果は logs/capture-check.json
import { writeFileSync, mkdirSync, rmSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8805;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'capture-check'), DL = join(OUT, 'downloads');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });
mkdirSync(join(ROOT, 'logs'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1280, height: 860, profile: join(ROOT, 'runtime', 'capture-profile'), fakeMedia: true });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info ? ' ' + info : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
const center = async (sel) => JSON.parse(await ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'null'; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2])`));
const waitSel = async (sel, ms = 15000) => { for (let t = 0; t < ms; t += 100) { if (await ev(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(100); } return false; };
const waitFor = async (js, ms = 15000) => { for (let t = 0; t < ms; t += 100) { if (await ev(js)) return true; await sleep(100); } return false; };
async function click(sel, wait = 300) {
  if (!(await waitSel(sel))) throw new Error('見つからない: ' + sel);
  const r = await center(sel);
  await page.click(r[0], r[1]);
  await sleep(wait);
}
const W = '.app-capture';
const C = (js) => ev(`const w = document.querySelector('${W}'); return ${js}`);
const status = () => C("w.querySelector('.status-field[data-status]').textContent.trim()");
const field = (n) => C(`w.querySelector('.status-field[data-${n}]').textContent.trim()`);
const answer = (value) => click(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 500);
const recBtn = (r) => `${W} [data-page="rec"] [data-r="${r}"]`;
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
// 画面の記録（logs/app.log）の、この確かめで増えた行
const LOG = join(ROOT, 'logs', 'app.log');
const logStart = (() => { try { return statSync(LOG).size; } catch { return 0; } })();
const newLog = () => { try { return readFileSync(LOG).subarray(logStart).toString('utf8'); } catch { return ''; } };

try {
  await page.raw('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
  await page.navigate(URL0 + '?shot');
  // 起動の途中で空にすると、起動の続きの見本の書き込みが残ることがある。デスクトップのアイコンが並ぶ（起動が終わる）のを待ってから空にする
  await waitSel('#desk:not([hidden]) .desk-icon', 20000);
  await sleep(500);
  await wipe();
  await page.navigate(URL0 + '?shot=capture');
  ok('画面キャプチャの窓が開く', await waitSel(`${W} .tab-list .tab`, 20000));
  ok('「静止画」と「録画」のタブがあり、始めは静止画', (await C("[...w.querySelectorAll('.tab-list .tab')].map((t) => t.textContent + ':' + t.getAttribute('aria-selected')).join(',')")) === '静止画(I):true,録画(V):false');
  ok('静止画のページに「撮る」、録画のページは隠れている', await C("!w.querySelector('[data-page=\"shot\"]').hidden && w.querySelector('[data-page=\"rec\"]').hidden && !!w.querySelector('[data-a=\"shoot\"]')"));
  // Alt と下線の文字でタブを切り替える
  await click(`${W} .tab-list .tab[data-mode="shot"]`, 200);
  await page.key('Alt+v'); await sleep(300);
  ok('Alt+V で録画のタブ', await C("!w.querySelector('[data-page=\"rec\"]').hidden"));
  await page.key('Alt+i'); await sleep(300);
  ok('Alt+I で静止画のタブに戻る', await C("!w.querySelector('[data-page=\"shot\"]').hidden && w.querySelector('[data-page=\"rec\"]').hidden"));
  await sleep(300);
  await shot('01-still-start');

  /* ---------- 静止画（前と同じに動くか） ---------- */
  await click(`${W} [data-a="shoot"]`, 300);
  ok('静止画: 撮る間は窓を隠す（既定）', await waitFor("return document.querySelector('.app-capture').hidden", 5000));
  ok('静止画: 3 秒待ってから撮り、窓が戻る', await waitFor("const w = document.querySelector('.app-capture'); return !w.hidden && !w.querySelector('[data-box]').hidden", 12000));
  const dim0 = await field('dim');
  ok('静止画: 状態の帯に画像の大きさ', /^\d+ × \d+$/.test(dim0), dim0);
  const cvRect = JSON.parse(await C("JSON.stringify(w.querySelector('[data-canvas]').getBoundingClientRect())"));
  await page.drag(cvRect.x + 20, cvRect.y + 20, cvRect.x + cvRect.width / 2, cvRect.y + cvRect.height / 2);
  await sleep(200);
  ok('静止画: ドラッグで範囲を選ぶと「切り抜く」が押せる', await C("!w.querySelector('[data-a=\"crop\"]').disabled"));
  await shot('02-still-select');
  await click(`${W} [data-a="crop"]`, 300);
  const dim1 = await field('dim');
  ok('静止画: 切り抜くと画像が小さくなる', dim1 !== dim0 && /^\d+ × \d+$/.test(dim1), `${dim0} → ${dim1}`);
  await click(`${W} [data-a="undo"]`, 300);
  ok('静止画: 元に戻すで元の大きさ', (await field('dim')) === dim0);
  await click(`${W} [data-a="save"]`, 600);
  await click('dialog.file-dlg[open] [data-ok]', 800);
  const png = JSON.parse(await ev("const fs = await import('./js/fs.mjs'); const l = await fs.list('/画像'); const e = l.find((x) => x.name.endsWith('.png')); if (!e) return 'null'; const b = await fs.readBlob(e.path); const bm = await createImageBitmap(b); return JSON.stringify({ name: e.name, w: bm.width, h: bm.height, type: b.type })"));
  ok('静止画: /画像 に PNG で保存し、大きさが同じ', png && png.type === 'image/png' && `${png.w} × ${png.h}` === dim0, JSON.stringify(png));

  /* ---------- 録画: 待ちの状態 ---------- */
  await click(`${W} .tab-list .tab[data-mode="rec"]`, 400);
  ok('録画のタブに切り替わる', await C("!w.querySelector('[data-page=\"rec\"]').hidden && w.querySelector('[data-page=\"shot\"]').hidden"));
  ok('録画: 状態の帯に長さと大きさの見込み（静止画の大きさの欄は隠れる）', await C("w.querySelector('[data-dim]').hidden && !w.querySelector('[data-time]').hidden && !w.querySelector('[data-size]').hidden"));
  const est1 = await field('size');
  ok('録画: 録る前の大きさの見込み（1 分あたり）', /^1 分で約 [\d.]+ MB まで$/.test(est1), est1);
  await click(`${W} [data-page="rec"] input[value="fine"]`, 200);
  await click(`${W} [data-page="rec"] input[value="60"]`, 200);
  const est2 = await field('size');
  ok('録画: 画質ときれい・60 コマ/秒にすると見込みが大きくなる', parseFloat(est2.replace(/[^\d.]/g, '')) > parseFloat(est1.replace(/[^\d.]/g, '')), `${est1} → ${est2}`);
  await click(`${W} [data-page="rec"] input[value="normal"]`, 100);
  await click(`${W} [data-page="rec"] input[value="30"]`, 100);
  await click(`${W} [data-src="mic"]`, 200); // マイクを入にする（作り物のマイク）
  await shot('03-rec-idle');

  /* ---------- 録画: 録る・一時停止・再開・止める ---------- */
  await click(recBtn('start'), 0);
  ok('録画: 3 秒数える', await waitFor("const c = document.querySelector('.app-capture [data-rcount]'); return !c.hidden && c.textContent === '3'", 8000));
  await shot('04-rec-count');
  ok('録画: 数え終わると録り始め、録画中のしるしが出る', await waitFor("return !document.querySelector('.app-capture [data-badge]').hidden", 8000));
  const t0 = Date.now();
  ok('録画: マイクの音の量の表示が出る', await C("!w.querySelector('[data-meters]').hidden"));
  await sleep(2500);
  const recSize = await field('size'), recTime = await field('time');
  ok('録画: 状態の帯に経過の時間', /^00:0[2-3]$/.test(recTime), recTime);
  ok('録画: 状態の帯に今の大きさ', /^約 [\d.]+ (バイト|KB|MB)（1 分で約 [\d.]+ (KB|MB)( まで)?）$/.test(recSize), recSize);
  // 作り物のマイクは 1 秒ごとに短く鳴るので、何度か見て、いちばん大きい値を見る
  let micMax = 0;
  for (let i = 0; i < 12; i++) { micMax = Math.max(micMax, parseFloat(await C("w.querySelector('[data-lv=\"mic\"]').style.width")) || 0); await sleep(100); }
  ok('録画: マイクの音の量が動く', micMax > 5, `いちばん大きいとき ${micMax.toFixed(1)}%`);
  await shot('05-rec-recording');
  const t1 = Date.now();
  await click(recBtn('pause'), 0);
  ok('録画: 一時停止すると「再開」に変わり、しるしが一時停止中になる', await waitFor("const w = document.querySelector('.app-capture'); return w.querySelector('[data-r=\"pause\"]').textContent.startsWith('再開') && w.querySelector('[data-badge]').hasAttribute('data-paused')", 3000));
  const p0 = await field('time');
  await sleep(2000);
  ok('録画: 一時停止の間は経過の時間が進まない', (await field('time')) === p0, `${p0} → ${await field('time')}`);
  await shot('06-rec-paused');
  const t2 = Date.now();
  await click(recBtn('pause'), 0);
  await sleep(2000);
  const t3 = Date.now();
  await click(recBtn('stop'), 0);
  const active = (t1 - t0) + (t3 - t2), total = t3 - t0;
  ok('録画: 止めると、その場で見る video が出る', await waitFor("const v = document.querySelector('.app-capture [data-review]'); return !v.hidden && v.readyState >= 1", 10000));
  const takeTime = await field('time');
  ok('録画: 録った長さ（一時停止の間を除く）', Math.abs(takeTime.split(':').reduce((s, x) => s * 60 + +x, 0) - active / 1000) <= 1.2, `${takeTime} / 録った時間 ${active} ミリ秒（止めていた間を入れると ${total}）`);
  ok('録画: 見る video の長さが分かる（Infinity でない）', await C("Number.isFinite(w.querySelector('[data-review]').duration)"), String(await C("w.querySelector('[data-review]').duration")));
  ok('録画: 保存していない印が題名に付く', /\*$/.test(await C('w.querySelector(".title-bar-text").textContent')));
  ok('録画: 保存・書き出す・捨てるが押せる', await C("['save', 'export', 'discard'].every((a) => !w.querySelector(`[data-r=\"${a}\"]`).disabled)"));
  await shot('07-rec-review');

  /* ---------- 保存（/ビデオ を作る）と、保存した WebM の中身 ---------- */
  ok('保存の前は /ビデオ が無い', !(await ev("const fs = await import('./js/fs.mjs'); return !!(await fs.stat('/ビデオ'))")));
  await click(recBtn('save'), 600);
  const dlgInfo = JSON.parse(await ev("const d = document.querySelector('dialog.file-dlg[open]'); return JSON.stringify({ name: d?.querySelector('#fdName').value, dir: d?.querySelector('#fdDir').value })"));
  ok('保存: 名前の既定は「録画 日時.webm」、場所は /ビデオ', /^録画 \d{4}-\d\d-\d\d \d\d-\d\d-\d\d\.webm$/.test(dlgInfo.name) && dlgInfo.dir === '/ビデオ', JSON.stringify(dlgInfo));
  await shot('08-rec-save-dialog');
  await page.evaluate(`(() => { const i = document.querySelector('dialog.file-dlg[open] #fdName'); i.value = '確かめの録画'; return true; })()`);
  await click('dialog.file-dlg[open] [data-ok]', 800);
  const saved = '/ビデオ/確かめの録画.webm';
  ok('保存: 拡張子 .webm を足して /ビデオ に保存', await ev(`const fs = await import('./js/fs.mjs'); const s = await fs.stat('${saved}'); return !!s && s.kind === 'file' && s.size > 1000`));
  ok('保存: 題名がファイルの名前になり、保存していない印が消える', (await C('w.querySelector(".title-bar-text").textContent')) === '画面キャプチャ - 確かめの録画.webm');
  ok('保存: 「捨てる」が「片付ける」に変わる', (await C("w.querySelector('[data-r=\"discard\"]').textContent")) === '片付ける(D)');
  const info = JSON.parse(await ev(`const fs = await import('./js/fs.mjs'); const K = await import('./js/core/capture.mjs'); const b = await fs.readBlob('${saved}'); const bytes = new Uint8Array(await b.arrayBuffer());
    const i = K.webmInfo(bytes);
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = URL.createObjectURL(b);
    await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('読めない')); setTimeout(r, 8000); });
    const dur = v.duration, vw = v.videoWidth, vh = v.videoHeight;
    // 終わりの近くへ動かせるか（長さが無い WebM は動かせない）
    let seeked = false; if (Number.isFinite(dur)) { v.currentTime = Math.max(0, dur - 0.3); seeked = await new Promise((r) => { v.onseeked = () => r(true); setTimeout(() => r(false), 5000); }); }
    return JSON.stringify({ type: b.type, size: b.size, ebml: [...bytes.slice(0, 4)].map((x) => x.toString(16)).join(''), info: i, dur, vw, vh, seeked });`));
  ok('保存した WebM: 先頭が EBML（1a45dfa3）で、種類は video/webm', info.ebml === '1a45dfa3' && info.type === 'video/webm', `${info.ebml} ${info.type} ${info.size} バイト`);
  ok('保存した WebM: 長さ（Duration）が書き込まれ、録った時間に近い', info.info?.durationMs != null && Math.abs(info.info.durationMs - active) < 700, `書いた長さ ${Math.round(info.info?.durationMs)} ミリ秒 / 録った時間 ${active}`);
  ok('保存した WebM: 中身の最後の時刻も録った時間に近い（一時停止の間が入らない）', info.info?.lastMs != null && Math.abs(info.info.lastMs - active) < 700 && info.info.lastMs < total - 1200, `最後の区切り ${Math.round(info.info?.lastMs)} ミリ秒 / 録った時間 ${active} / 止めていた間を入れると ${total}`);
  ok('保存した WebM: video 要素で読め、長さが近い', Number.isFinite(info.dur) && Math.abs(info.dur * 1000 - active) < 700 && info.vw > 0 && info.vh > 0, `${info.dur} 秒 ${info.vw}×${info.vh}`);
  ok('保存した WebM: 終わりの近くへ動かせる', info.seeked);

  /* ---------- 書き出す ---------- */
  await click(recBtn('export'), 300);
  let dl = null;
  for (let i = 0; i < 50 && !dl; i++) { await sleep(200); dl = readdirSync(DL).find((f) => f.endsWith('.webm')); }
  ok('パソコンへ書き出す: 同じ大きさの WebM が書き出される', dl && statSync(join(DL, dl)).size === info.size, dl ? `${dl} ${statSync(join(DL, dl)).size} バイト` : '書き出されない');

  /* ---------- 片付けてから、開き直す ---------- */
  await click(recBtn('discard'), 400);
  ok('保存したものは確かめずに片付け、ファイルは残る', !(await ev("return !!document.querySelector('dialog.msgbox[open]')")) && (await C("w.querySelector('[data-review]').hidden && !w.querySelector('[data-rempty]').hidden")) && (await ev(`const fs = await import('./js/fs.mjs'); return !!(await fs.stat('${saved}'))`)));
  await click(recBtn('open'), 600);
  await click('dialog.file-dlg[open] .fd-list li[data-kind="file"]', 200);
  await click('dialog.file-dlg[open] [data-ok]', 800);
  ok('開く: 保存した録画を開き直し、同じ長さで見られる', await waitFor("const v = document.querySelector('.app-capture [data-review]'); return !v.hidden && Number.isFinite(v.duration)", 8000) && (await field('time')) === takeTime && (await C('w.querySelector(".title-bar-text").textContent')) === '画面キャプチャ - 確かめの録画.webm', `${await field('time')} / ${takeTime}`);
  // ファイル マネージャなどから開いたとき（?shot=capture:パス）も、録画のタブで開く
  await page.navigate(URL0 + '?shot=capture:' + encodeURIComponent(saved));
  ok('パスを渡して開くと、録画のタブで見られる', await waitFor("const w = document.querySelector('.app-capture'); const v = w?.querySelector('[data-review]'); return !!v && !w.querySelector('[data-page=\"rec\"]').hidden && !v.hidden && Number.isFinite(v.duration)", 15000));
  ok('パスを渡して開く: 長さが同じ', (await field('time')) === takeTime, await field('time'));
  await shot('09-reopen');

  /* ---------- 捨てる（確かめの箱） ---------- */
  await click(recBtn('start'), 0);
  ok('もう一度録る（保存したものを開いているので確かめない）', await waitFor("return !document.querySelector('.app-capture [data-badge]').hidden", 10000));
  await sleep(1500);
  await click(recBtn('stop'), 0);
  await waitFor("return !document.querySelector('.app-capture [data-review]').hidden", 8000);
  await click(recBtn('discard'), 500);
  ok('捨てる: 保存していないので確かめの箱が出る', await waitSel('dialog.msgbox[open]', 3000));
  await shot('10-discard-confirm');
  await answer('いいえ');
  ok('捨てる: 「いいえ」なら残る', await C("!w.querySelector('[data-review]').hidden"));
  await click(recBtn('discard'), 500);
  await answer('はい');
  ok('捨てる: 「はい」で消え、始めの案内に戻る', await C("w.querySelector('[data-review]').hidden && !w.querySelector('[data-rempty]').hidden && w.querySelector('[data-r=\"save\"]').disabled"));
  ok('捨てる: 状態の帯で知らせる', (await status()) === '録画を捨てました。', await status());

  /* ---------- 共有が相手の側で止められたとき ---------- */
  await click(`${W} [data-rhide]`, 200); // 録る間は窓をしまう
  await click(recBtn('start'), 0);
  ok('窓をしまう: 録っている間は窓が隠れる', await waitFor("return document.querySelector('.app-capture').hidden", 6000));
  ok('窓をしまう: 録り始める', await waitFor("return !document.querySelector('.app-capture [data-badge]').hidden", 10000));
  const sh0 = Date.now();
  ok('窓をしまう: タスクバーの題名に録画中と経過の時間', /^● 録画中 \d\d:\d\d - 画面キャプチャ$/.test(await ev("return [...document.querySelectorAll('.task-btn span')].map((s) => s.textContent).find((t) => t.includes('画面キャプチャ')) || ''")), await ev("return [...document.querySelectorAll('.task-btn span')].map((s) => s.textContent).join('|')"));
  await sleep(2000);
  const s0 = Date.now();
  // ブラウザの「共有を停止」と同じく、共有の映像の線を終わらせて ended を出す
  await ev("const t = document.querySelector('.app-capture [data-live]').srcObject.getVideoTracks()[0]; t.stop(); t.dispatchEvent(new Event('ended')); return true;");
  ok('共有が止められたら、窓が戻り、そこまでを残す', await waitFor("const w = document.querySelector('.app-capture'); return !w.hidden && !w.querySelector('[data-review]').hidden", 10000));
  const shareMsg = await C("w.querySelector('[data-rmsg]').textContent");
  ok('共有が止められた: そのことを知らせる', /画面共有が止められたので、そこまでの \d\d:\d\d を残しました/.test(shareMsg), shareMsg);
  const shareTime = await field('time');
  ok('共有が止められた: 長さが録った時間に近い', Math.abs(shareTime.split(':').reduce((s, x) => s * 60 + +x, 0) - (s0 - sh0) / 1000) <= 1.2, `${shareTime} / ${s0 - sh0} ミリ秒`);
  await sleep(600); // 窓が戻る動きが終わってから撮る
  await shot('11-share-ended');
  await click(`${W} [data-rhide]`, 200);

  /* ---------- 許可されなかったとき ---------- */
  await click(recBtn('discard'), 500);
  await answer('はい');
  await ev("const md = navigator.mediaDevices; md.__gdm = md.getDisplayMedia; md.getDisplayMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); return true;");
  await click(recBtn('start'), 800);
  const denyMsg = await C("w.querySelector('[data-rmsg]').textContent");
  ok('画面共有が許可されないと、次にすることを案内し、待ちに戻る', /取り消されました.*録画を始める/.test(denyMsg) && (await C("!w.querySelector('[data-r=\"start\"]').disabled")), denyMsg);
  await shot('12-denied');
  await ev("const md = navigator.mediaDevices; md.getDisplayMedia = md.__gdm; md.__gum = md.getUserMedia; md.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); return true;");
  // パスを渡して開き直したので、窓は作り直されてマイクは既定の「切」。入にしてから録る
  if (!(await C("w.querySelector('[data-src=\"mic\"]').checked"))) await click(`${W} [data-src="mic"]`, 200);
  await click(recBtn('start'), 0);
  ok('マイクが許可されなくても、マイクの音なしで録る', await waitFor("return !document.querySelector('.app-capture [data-badge]').hidden", 10000));
  const micMsg = await C("w.querySelector('[data-rmsg]').textContent");
  ok('マイクが許可されない: そのことを知らせる', /マイクを使う許可がありません.*マイクの音なしで録ります/.test(micMsg), micMsg);
  await sleep(1200);
  await click(recBtn('stop'), 0);
  await waitFor("return !document.querySelector('.app-capture [data-review]').hidden", 8000);
  await ev("const md = navigator.mediaDevices; md.getUserMedia = md.__gum; return true;");

  /* ---------- 閉じるときの確かめ ---------- */
  await click(`${W} .title-bar-controls .close`, 500);
  ok('保存していない録画があると、閉じる前に確かめる', await waitSel('dialog.msgbox[open]', 3000));
  await answer('いいえ');
  ok('「いいえ」なら窓は残る', await ev("return !!document.querySelector('.app-capture')"));
  await click(`${W} .title-bar-controls .close`, 500);
  await answer('はい');
  ok('「はい」で閉じる', await waitFor("return !document.querySelector('.app-capture')", 3000));

  /* ---------- 記録と誤り ---------- */
  await sleep(1500); // 記録がサーバーへ届くのを待つ
  const lines = newLog();
  for (const k of ['capture.rec.share', 'capture.rec.start', 'capture.rec.pause', 'capture.rec.resume', 'capture.rec.stop', 'capture.rec.save', 'capture.rec.export', 'capture.rec.discard', 'capture.rec.open', 'capture.rec.ended']) ok(`記録: ${k}`, lines.includes(k));
  ok('記録: 許可されなかった誤り（画面とマイク）', /capture\.rec\.share.*error: Permission denied/.test(lines) && /capture\.rec\.mic.*error: Permission denied/.test(lines));
  ok('ページの console.error が出ない', page.consoleErrors.length === 0, page.consoleErrors.join(' / '));
} catch (e) {
  ok('途中で止まらない', false, e.stack || e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
const failed = report.filter((r) => !r.ok);
writeFileSync(join(ROOT, 'logs', 'capture-check.json'), JSON.stringify({ at: new Date().toISOString(), pass: report.length - failed.length, fail: failed.length, report }, null, 1));
console.log(`\n${report.length - failed.length} / ${report.length} 通過`);
process.exit(failed.length ? 1 : 0);
