// 動画の編集（os/js/apps/video.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// 「見本の素材を作る」で動画・画像・音を作り、素材をタイムラインへドラッグして置き、再生・分ける・切り詰める・動かす・並べ替える・
// 文字を足す・フェードとクロスフェード・音量・スナップ・拡大・出力の設定・元に戻す・計画の保存と開き直し・見つからない素材の知らせ・
// WebM の書き出し（やめる・パソコンへ書き出す）を、マウスとキーで操作して確かめる。書き出した WebM は video 要素で読み、長さと絵を確かめる。
// 確かめ専用の Chrome のプロファイル（runtime/video-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8801 を動かしてから、node tools/video-check.mjs [番号=8801]
//   画面の写真は build/video-check/、結果は logs/video-check.json
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8801;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'video-check'), DL = join(OUT, 'download');
mkdirSync(OUT, { recursive: true });
rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'video-profile') });
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
const WIN = "(await import('./js/wm.mjs')).list().find((w) => w.app === 'video')";
const S = async () => JSON.parse(await ev(`const w = ${WIN}; return JSON.stringify(w ? w.video.state() : null)`));
const P = async () => JSON.parse(await ev(`return JSON.stringify((${WIN}).video.project())`));
async function waitState(pred, ms = 8000) { let s = null; for (let t = 0; t < ms; t += 120) { s = await S(); if (s && pred(s)) return s; await sleep(120); } return s; }
const status = () => ev("return document.querySelector('.app-video .status-field[data-status]').textContent");
const clipRect = async (id) => JSON.parse(await ev(`const el = document.querySelector('.app-video .vd-clip[data-id="${id}"]'); if (!el) return 'null'; const r = el.getBoundingClientRect(); return JSON.stringify({ l: r.left, r: r.right, x: r.left + r.width / 2, y: r.top + r.height / 2 })`));
const xOf = async (time) => ev(`return (${WIN}).video.xOf(${time})`);
const laneY = async (tr) => ev(`return (${WIN}).video.laneY('${tr}')`);
const pps = async () => (await S()).pps;
const setTime = async (x) => { await ev(`(${WIN}).video.setTime(${x}); return true;`); await sleep(500); };
// プレビューの canvas の画素（出力の座標）。描き終わるまで少し待つ
const pixel = async (x, y) => JSON.parse(await ev(`return JSON.stringify((${WIN}).video.pixel(${x}, ${y}))`));
const bright = (p) => p[0] + p[1] + p[2];
async function menu(title, command, wait = 400) {
  const r = JSON.parse(await ev(`const t = [...document.querySelectorAll('.app-video .menu-bar > .menu-title')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(title)})); const b = t.getBoundingClientRect(); return JSON.stringify([b.left + 12, b.top + b.height / 2])`));
  await page.click(r[0], r[1]); await sleep(250);
  await click(`.app-video .menu-title.open .menu-item[data-command="${command}"], .app-video .menu-item[data-command="${command}"]`, wait);
}
const answer = (value) => click(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 500);
async function fileDialog(name, wait = 800) {
  if (!(await waitSel('dialog.file-dlg[open] #fdName'))) throw new Error('ファイルの箱が開かない');
  await ev(`const i = document.querySelector('dialog.file-dlg[open] #fdName'); i.value = ${JSON.stringify(name)}; return true;`);
  await click('dialog.file-dlg[open] [data-ok]', wait);
}
const focusPreview = async () => { const r = await center('.app-video .vd-screen'); await page.click(r[0], r[1] - 40); await sleep(150); };
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const clipsOn = (s, tr) => s.clips.filter((c) => c.track === tr).sort((a, b) => a.start - b.start);
// 入力欄の値を変えて、input と change を送る（色の箱など、画面なしの Chrome で開けない部品に使う）
const setField = (sel, value) => ev(`const el = document.querySelector(${JSON.stringify(sel)}); el.focus(); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
// 書き出した WebM を、ページの中の video 要素で読む（長さ・大きさ・1 秒の所の絵の明るさ・音の形式）
const probeWebM = async (p) => JSON.parse(await ev(`const fs = await import('./js/fs.mjs'); const V = await import('./js/core/video.mjs');
  const blob = await fs.readBlob(${JSON.stringify(p)}); const bytes = new Uint8Array(await blob.arrayBuffer());
  const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob);
  await new Promise((ok, ng) => { v.onloadedmetadata = ok; v.onerror = () => ng(new Error('読めない')); setTimeout(() => ng(new Error('時間切れ')), 8000); });
  const out = { size: blob.size, duration: v.duration, w: v.videoWidth, h: v.videoHeight, header: V.readWebmDuration(bytes), opus: new TextDecoder('latin1').decode(bytes.subarray(0, 4096)).includes('A_OPUS') };
  await new Promise((ok) => { v.onseeked = ok; v.currentTime = 1.0; setTimeout(ok, 4000); });
  const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d'); g.drawImage(v, 0, 0, 64, 36);
  const d = g.getImageData(0, 0, 64, 36).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
  out.bright = Math.round(sum / (64 * 36)); URL.revokeObjectURL(v.src);
  // 音: WebM の中の Opus を読み、いちばん大きい振れ幅を見る（無音でないこと）
  try { const buf = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes.slice().buffer); let pk = 0; for (let c = 0; c < buf.numberOfChannels; c++) for (const x of buf.getChannelData(c)) pk = Math.max(pk, Math.abs(x)); out.peak = +pk.toFixed(3); out.audioSec = +buf.duration.toFixed(2); } catch (e) { out.peak = -1; out.audioErr = e.message; }
  return JSON.stringify(out);`));
// 計画を、鍵の並びによらずに比べられる形にする
const canon = (x) => (Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

try {
  // 起動の場面を飛ばして開き、デスクトップのアイコンが並んでから（見本のファイルを書き終えてから）仮想ドライブを空にする
  await page.navigate(URL0 + '?shot');
  await waitSel('#desk:not([hidden]) .desk-icon', 20000);
  await wipe();
  await page.navigate(URL0 + '?shot=video');

  /* ---------- 1. 初めて開いたときの案内 ---------- */
  ok('?shot=video で動画の編集が開く', await waitSel('.app-video .vd-canvas', 20000));
  await sleep(700);
  ok('作業域の中に「動画を作る 3 つの手順」の案内が出る', await ev("const g = document.querySelector('.app-video [data-guide]'); return !g.hidden && g.textContent.includes('動画を作る 3 つの手順') && g.querySelectorAll('li').length === 3"));
  ok('状態の帯に、初めの案内が出る', /素材を足す.*見本の素材を作る/.test(await status()), await status());
  ok('クリップが無いとき、分ける・消す・書き出すは押せない印（aria-disabled）', await ev("return ['split', 'delete', 'export'].every((a) => document.querySelector('.app-video .vd-tools [data-a=\"' + a + '\"]').getAttribute('aria-disabled') === 'true')"));
  ok('スタートメニューのアプリ一覧に名前とアイコンがある', await ev("const sh = await import('./js/shell.mjs'); return sh.APPS.video.name === '動画の編集' && sh.APPS.video.icon === 'icons/video.svg'"));
  ok('.fvid は動画の編集で開く', await ev("const a = await import('./js/core/assoc.mjs'); return a.appFor('/ビデオ/x.fvid') === 'video' && a.typeName('x.fvid') === '動画の編集の計画'"));
  ok('段は 文字・映像 2・映像 1・音 1・音 2', (await S()).tracks.map((t) => t.name).join(',') === '文字,映像 2,映像 1,音 1,音 2');
  await shot('01-empty');

  /* ---------- 2. 見本の素材を作る ---------- */
  await click('.app-video [data-guide] [data-a="sample"]', 300);
  let s = await waitState((x) => x.media.length === 3, 30000);
  ok('「見本の素材を作る」で、動画・画像・音の 3 つが素材の箱に入る', s.media.map((m) => m.kind).join(',') === 'video,image,audio', JSON.stringify(s.media.map((m) => m.name)));
  const vid = s.media[0], img = s.media[1], aud = s.media[2];
  ok('見本の動画は 4 秒、640×360（canvas の動きを MediaRecorder で録ったもの）', near(vid.duration, 4, 0.15) && vid.w === 640 && vid.h === 360, JSON.stringify(vid));
  ok('見本の画像は 1280×720、見本の音は 6 秒', img.w === 1280 && img.h === 720 && near(aud.duration, 6, 0.01));
  ok('見本は /ビデオ/見本 に保存される', await ev("const fs = await import('./js/fs.mjs'); return (await fs.list('/ビデオ/見本')).map((e) => e.name).sort().join(',')") === '見本の動画.webm,見本の画像.png,見本の音.wav');
  ok('録った見本の WebM には長さが書き込まれている', near(await ev("const fs = await import('./js/fs.mjs'); const V = await import('./js/core/video.mjs'); return V.readWebmDuration(new Uint8Array(await (await fs.readBlob('/ビデオ/見本/見本の動画.webm')).arrayBuffer()))"), 4000, 1));
  ok('素材の箱に、小さな絵（サムネイル）と長さが出る', await ev("const li = [...document.querySelectorAll('.app-video .vd-bin-item')]; return li.length === 3 && li.every((x) => x.querySelector('img')?.src.startsWith('data:image')) && li[0].textContent.includes('0:04.0')"));
  ok('案内の 1 つ目の手順に、済みの印が付く', await ev("return document.querySelector('.app-video [data-guide] [data-step=\"1\"]').classList.contains('done')"));
  await shot('02-samples');

  /* ---------- 3. 素材をタイムラインへ置く ---------- */
  let from = await center(`.app-video .vd-bin-item[data-mid="${vid.id}"]`);
  await page.drag(from[0], from[1], await xOf(0.08), await laneY('v1')); await sleep(400);
  s = await S();
  ok('動画を映像 1 の段へドラッグすると置ける（0 秒へ吸い付く）', s.clips.length === 1 && s.clips[0].track === 'v1' && s.clips[0].start === 0 && near(s.clips[0].dur, vid.duration, 1e-6), JSON.stringify(s.clips));
  const c1 = s.clips[0].id;
  from = await center(`.app-video .vd-bin-item[data-mid="${img.id}"]`);
  await page.drag(from[0], from[1], await xOf(vid.duration + 0.1), await laneY('v1')); await sleep(400);
  s = await S();
  let cImg = s.clips.find((c) => c.media === img.id);
  ok('画像を動画の終わりの近くへ落とすと、終わりに吸い付く。長さは 3 秒', cImg && near(cImg.start, vid.duration, 1e-6) && cImg.dur === 3, JSON.stringify(cImg));
  from = await center(`.app-video .vd-bin-item[data-mid="${img.id}"]`);
  await page.drag(from[0], from[1], await xOf(1), await laneY('a1')); await sleep(400);
  ok('画像は音の段には置けない（知らせが出る）', (await S()).clips.length === 2 && /その段には置けません/.test(await status()), await status());
  const binAud = await center(`.app-video .vd-bin-item[data-mid="${aud.id}"]`);
  await page.click(binAud[0], binAud[1], { count: 2 }); await sleep(400);
  s = await S();
  const cAud = s.clips.find((c) => c.media === aud.id);
  ok('音をダブルクリックすると、音 1 の段の終わり（0 秒）に置ける', cAud && cAud.track === 'a1' && cAud.start === 0 && near(cAud.dur, 6, 0.01), JSON.stringify(cAud));
  ok('クリップを置くと案内が消える', await ev("return document.querySelector('.app-video [data-guide]').hidden"));
  await shot('03-placed');

  /* ---------- 4. プレビュー（canvas の合成） ---------- */
  await setTime(1); await sleep(400);
  ok('1 秒の所: 動画の絵がプレビューに映る（黒でない）', bright(await pixel(640, 200)) > 120, JSON.stringify(await pixel(640, 200)));
  await setTime(5); await sleep(300);
  ok('5 秒の所: 画像（薄紫から水色）が映る', bright(await pixel(60, 60)) > 450, JSON.stringify(await pixel(60, 60)));
  ok('再生位置の文字が 0:05.00 になる', await ev("return document.querySelector('.app-video [data-time]').textContent") === '0:05.00');

  /* ---------- 5. 再生・停止・コマ送り ---------- */
  await click('.app-video [data-a="home"]', 200);
  ok('「先頭へ」で 0 秒へ', (await S()).t === 0);
  await focusPreview();
  await page.key(' '); await sleep(1200);
  s = await S();
  ok('Space で再生する（時刻が進む）', s.playing && s.t > 0.6, s.t);
  await page.key(' '); await sleep(200);
  s = await S();
  ok('もう一度 Space で止まる', !s.playing, s.t);
  const tStop = s.t;
  await click('.app-video [data-a="nextf"]', 200);
  ok('「次のコマ」で 1/30 秒進む', near((await S()).t, Math.round(tStop * 30 + 1) / 30, 1e-6));
  await page.key('ArrowLeft'); await sleep(150);
  ok('← で 1 コマ戻る', near((await S()).t, Math.round(tStop * 30) / 30, 1e-6));
  await page.key('Shift+ArrowRight'); await sleep(150);
  ok('Shift+→ で 1 秒進む', near((await S()).t, Math.round(tStop * 30) / 30 + 1, 1e-6));

  /* ---------- 6. 分ける・元に戻す・やり直し ---------- */
  await setTime(2);
  let r = await clipRect(c1);
  await page.click(r.x - 30, r.y); await sleep(250);
  ok('クリップを押すと選べて、右の欄に設定が出る', (await S()).sel === c1 && await ev("return !!document.querySelector('.app-video [data-insp] [data-f=\"start\"]')"));
  await page.key('s'); await sleep(400);
  s = await S();
  let v1 = clipsOn(s, 'v1').filter((c) => c.media === vid.id);
  ok('S で再生位置（2 秒）で 2 つに分ける。後ろの半分は素材の 2 秒目から', v1.length === 2 && v1[0].dur === 2 && v1[1].start === 2 && v1[1].in === 2 && near(v1[1].dur, vid.duration - 2, 1e-6), JSON.stringify(v1));
  const c2 = v1[1].id;
  await page.key('Control+z'); await sleep(300);
  ok('Ctrl+Z で分ける前に戻る', clipsOn(await S(), 'v1').length === 2 && clipsOn(await S(), 'v1')[0].dur === vid.duration);
  await page.key('Control+y'); await sleep(300);
  ok('Ctrl+Y でやり直す', clipsOn(await S(), 'v1').length === 3);
  await shot('04-split');

  /* ---------- 7. 両端をつまんで切り詰める ---------- */
  s = await S();
  cImg = s.clips.find((c) => c.media === img.id);
  let px = await pps();
  r = await clipRect(cImg.id);
  await page.drag(r.r - 3, r.y, r.r - 3 - px * 1.0, r.y); await sleep(400);
  cImg = (await S()).clips.find((c) => c.id === cImg.id);
  ok('画像の終わりのつまみを 1 秒分左へ引くと、長さが 2 秒になる', near(cImg.dur, 2, 1 / 30 + 1e-6), cImg.dur);
  r = await clipRect(c2);
  await page.drag(r.l + 3, r.y, r.l + 3 + px * 0.5, r.y); await sleep(400);
  let k2 = (await S()).clips.find((c) => c.id === c2);
  ok('始めのつまみを 0.5 秒右へ引くと、始まりと素材の中の位置がいっしょに進む', near(k2.start, 2.5, 1 / 30 + 1e-6) && near(k2.in, 2.5, 1 / 30 + 1e-6) && near(k2.start + k2.dur, vid.duration, 1e-6), JSON.stringify(k2));
  r = await clipRect(c2);
  await page.drag(r.l + 3, r.y, r.l + 3 - px * 5, r.y); await sleep(400);
  k2 = (await S()).clips.find((c) => c.id === c2);
  ok('始めを素材の始めより前へは伸ばせない（in は 0 まで）', k2.in === 0 && near(k2.start, 0, 1e-6), JSON.stringify(k2));
  await page.key('Control+z'); await sleep(300);
  k2 = (await S()).clips.find((c) => c.id === c2);
  ok('元に戻すと、切り詰めた前（2.5 秒から）に戻る', near(k2.start, 2.5, 1 / 30 + 1e-6), JSON.stringify(k2));
  await shot('05-trim');

  /* ---------- 8. 動かす（スナップ・段の移動） ---------- */
  s = await S();
  cImg = s.clips.find((c) => c.media === img.id);
  r = await clipRect(cImg.id);
  await page.drag(r.x, r.y, r.x + px * 2, r.y); await sleep(400);
  let mi = (await S()).clips.find((c) => c.id === cImg.id);
  ok('クリップをドラッグで 2 秒後ろへ動かす', near(mi.start, cImg.start + 2, 1 / 30 + 1e-6), JSON.stringify([cImg.start, mi.start]));
  r = await clipRect(cImg.id);
  await page.drag(r.x, r.y, r.x - px * 2 + 6, r.y); await sleep(400);
  mi = (await S()).clips.find((c) => c.id === cImg.id);
  ok('前のクリップの終わりの近くへ戻すと、ぴったり吸い付く', near(mi.start, vid.duration, 1e-6), mi.start);
  r = await clipRect(cImg.id);
  await page.drag(r.x, r.y, r.x, await laneY('v2')); await sleep(400);
  mi = (await S()).clips.find((c) => c.id === cImg.id);
  ok('上へドラッグすると、映像 2 の段へ移る', mi.track === 'v2' && near(mi.start, vid.duration, 1e-6), JSON.stringify(mi));
  r = await clipRect(cImg.id);
  await page.drag(r.x, r.y, r.x, await laneY('a2')); await sleep(400);
  ok('画像を音の段へ動かそうとしても、映像の段に残る', (await S()).clips.find((c) => c.id === cImg.id).track.startsWith('v'));
  await setField('.app-video [data-insp] [data-f="track"]', 'v1'); await sleep(300);
  ok('右の欄の「段」でも（ドラッグしなくても）段を移せる。選べるのは受け付ける段だけ', (await S()).clips.find((c) => c.id === cImg.id).track === 'v1' && await ev("return [...document.querySelectorAll('.app-video [data-insp] [data-f=\"track\"] option')].map((o) => o.value).join() === 'v2,v1'"));
  await page.key('Control+z'); await sleep(300);
  await click('.app-video .vd-tools [data-a="snap"]', 200);
  ok('「スナップ」のボタンで切る（aria-pressed が false）', !(await S()).snap && await ev("return document.querySelector('.app-video .vd-tools [data-a=\"snap\"]').getAttribute('aria-pressed') === 'false'"));
  r = await clipRect(cImg.id);
  await page.drag(r.x, r.y, r.x + 4, r.y); await sleep(400);
  mi = (await S()).clips.find((c) => c.id === cImg.id);
  ok('スナップを切ると、少しだけ動かしても吸い付かない', near(mi.start, vid.duration + 4 / px, 1 / 30 + 1e-6) && !near(mi.start, vid.duration, 1e-3), mi.start);
  await page.key('Control+z'); await sleep(200);
  await click('.app-video .vd-tools [data-a="snap"]', 200);
  ok('もう一度押すとスナップが入る', (await S()).snap);

  /* ---------- 9. 並べ替え ---------- */
  s = await S();
  v1 = clipsOn(s, 'v1');
  const [a0, b0] = v1;
  r = await clipRect(b0.id);
  await page.click(r.x, r.y); await sleep(200);
  await page.key('Alt+ArrowLeft'); await sleep(300);
  v1 = clipsOn(await S(), 'v1');
  ok('Alt+← で、同じ段の前のクリップと順番を入れ替える（すき間は保つ）', v1[0].id === b0.id && v1[0].start === 0 && near(v1[1].start, b0.dur + (b0.start - (a0.start + a0.dur)), 1e-6), JSON.stringify(v1.map((c) => [c.id, c.start])));
  await click('.app-video .vd-tools [data-a="later"]', 300);
  v1 = clipsOn(await S(), 'v1');
  ok('「後ろへ」のボタンで元の順に戻す', v1[0].id === a0.id && near(v1[1].start, b0.start, 1e-6), JSON.stringify(v1.map((c) => [c.id, c.start])));
  await shot('06-move');

  /* ---------- 10. 文字（テロップ） ---------- */
  await setTime(0.5);
  await click('.app-video .vd-tools [data-a="text"]', 400);
  s = await S();
  const tx = s.clips.find((c) => c.track === 't1');
  ok('「文字を足す」で、文字の段の再生位置に 3 秒の文字を足す', tx && near(tx.start, 0.5, 1e-6) && tx.dur === 3 && s.sel === tx.id, JSON.stringify(tx));
  ok('足した文字の入力欄に入力の行き先が移る', await ev("return document.activeElement?.dataset.f === 'text'"));
  await page.typeText('はじめての動画'); await sleep(100);
  await page.key('Tab'); await sleep(300);
  ok('入力した文字がクリップに入る', (await S()).clips.find((c) => c.id === tx.id).text === 'はじめての動画');
  ok('Tab で次の欄（大きさ）へ移れる', await ev("return document.activeElement?.dataset.f === 'size'"));
  await setField('.app-video [data-insp] [data-f="color"]', '#ffd37a'); await sleep(150);
  await setField('.app-video [data-insp] [data-f="size"]', '12'); await sleep(150);
  await setField('.app-video [data-insp] [data-f="pos"]', 'top'); await sleep(300);
  let t1 = (await S()).clips.find((c) => c.id === tx.id);
  ok('色・大きさ・位置（上）を変えられる', t1.color === '#ffd37a' && t1.size === 12 && t1.y === 0.15 && t1.x === 0.5, JSON.stringify(t1));
  await setTime(1.5); await sleep(300);
  // 文字の中心（640, 108）の近くを探し、黄色（#ffd37a）の画素があるか
  const yellow = JSON.parse(await ev(`const w = ${WIN}; let n = 0; for (let x = 400; x < 880; x += 4) for (let y = 70; y < 150; y += 4) { const p = w.video.pixel(x, y); if (p[0] > 230 && p[1] > 190 && p[1] < 230 && p[2] < 150) n++; } return JSON.stringify(n)`));
  ok('プレビューの上の方に、黄色の文字が描かれる', yellow > 20, yellow);
  ok('タイムラインの文字のクリップに、その文字が出る', await ev(`return document.querySelector('.app-video .vd-clip[data-id="${tx.id}"]').textContent.includes('はじめての動画')`));
  await shot('07-text');
  r = await clipRect(tx.id);
  await page.click(r.x, r.y); await sleep(200);
  await page.key('Delete'); await sleep(300);
  ok('Delete で選んだクリップを消す', !(await S()).clips.some((c) => c.id === tx.id) && (await S()).sel === null);
  await page.key('Control+z'); await sleep(300);
  ok('元に戻すと、消した文字が戻る', (await S()).clips.find((c) => c.id === tx.id)?.text === 'はじめての動画');

  /* ---------- 11. フェードとクロスフェード ---------- */
  r = await clipRect(a0.id);
  await page.click(r.x, r.y); await sleep(200);
  await menu('クリップ', 'fadein');
  ok('メニュー「始めをフェード（黒から）」で始めの 1 秒をフェードにする', (await S()).clips.find((c) => c.id === a0.id).fadeIn === 1);
  await setTime(0); await sleep(300);
  ok('0 秒の所は黒（文字もまだ出ていない）', bright(await pixel(640, 360)) < 10, JSON.stringify(await pixel(640, 360)));
  ok('タイムラインのクリップに、フェードの印が出る', await ev(`return !!document.querySelector('.app-video .vd-clip[data-id="${a0.id}"] .vd-fade[data-side="in"]')`));
  await ev("const i = document.querySelector('.app-video [data-insp] [data-f=\"fadeOut\"]'); i.focus(); i.select(); return true;");
  await page.typeText('0.5'); await page.key('Enter'); await sleep(300);
  ok('右の欄で、終わりのフェードを 0.5 秒にする', (await S()).clips.find((c) => c.id === a0.id).fadeOut === 0.5);
  r = await clipRect(b0.id);
  await page.click(r.x, r.y); await sleep(200);
  await menu('クリップ', 'cross', 500);
  let bx = (await S()).clips.find((c) => c.id === b0.id);
  ok('メニュー「前のクリップとクロスフェード」で、前のクリップに 0.5 秒重ねる', bx.join === 'cross' && near(bx.start, a0.dur - 0.5, 1e-6), JSON.stringify(bx));
  ok('重なった所に、クロスフェードの印が出る', await ev(`return !!document.querySelector('.app-video .vd-clip[data-id="${b0.id}"] .vd-xf')`));
  ok('右の欄のつなぎ目が「クロスフェード」になる', await ev("return document.querySelector('.app-video [data-insp] [data-f=\"join\"]').value === 'cross'"));
  await setField('.app-video [data-insp] [data-f="join"]', 'cut'); await sleep(300);
  ok('右の欄でつなぎ目をカットに戻せる', (await S()).clips.find((c) => c.id === b0.id).join === 'cut');
  await page.key('Control+z'); await sleep(300);
  ok('元に戻すとクロスフェードに戻る', (await S()).clips.find((c) => c.id === b0.id).join === 'cross');
  await shot('08-fade');

  /* ---------- 12. 音量（クリップと段） ---------- */
  r = await clipRect(cAud.id);
  await page.click(r.x, r.y); await sleep(200);
  await setField('.app-video [data-insp] [data-f="volume"]', '50'); await sleep(200);
  ok('音のクリップの音量を 50% にする', (await S()).clips.find((c) => c.id === cAud.id).volume === 0.5);
  await setField('.app-video [data-heads] [data-tvol="a1"]', '80'); await sleep(200);
  ok('音 1 の段の音量を 80% にする', (await S()).tracks.find((t) => t.id === 'a1').volume === 0.8);
  await click('.app-video [data-heads] [data-tmute="v1"]', 200);
  ok('映像 1 の段の「消音」を入れる', (await S()).tracks.find((t) => t.id === 'v1').mute === true);
  await click('.app-video [data-heads] [data-tmute="v1"]', 200);
  ok('もう一度押すと戻る', (await S()).tracks.find((t) => t.id === 'v1').mute === false);

  /* ---------- 13. 拡大・縮小・全体 ---------- */
  px = await pps();
  await click('.app-video .vd-tools [data-a="zoomin"]', 200);
  ok('「拡大」で 1 秒あたりの画素が 1.5 倍', near(await pps(), px * 1.5, 1e-6));
  await click('.app-video .vd-tools [data-a="zoomout"]', 200);
  ok('「縮小」で元に戻る', near(await pps(), px, 1e-6));
  await click('.app-video .vd-tools [data-a="fit"]', 200);
  s = await S();
  const vw = await ev("return document.querySelector('.app-video [data-scroll]').clientWidth");
  ok('「全体」で、全体の長さが横幅に収まる', near(s.pps * s.duration, vw - 40, 2), `${s.pps} × ${s.duration} / ${vw}`);
  await shot('09-zoom-fit');

  /* ---------- 14. 出力の大きさとコマの速さ ---------- */
  await setField('.app-video [data-size]', 'tall'); await sleep(400);
  ok('出力を縦 1080×1920 にすると、プレビューの canvas も縦になる', await ev("const c = document.querySelector('.app-video .vd-canvas'); return c.width === 1080 && c.height === 1920") && (await S()).settings.size === 'tall');
  await shot('10-tall');
  await setField('.app-video [data-fps]', '24'); await sleep(200);
  ok('コマの速さを 24 にすると、状態の帯に出る', (await S()).settings.fps === 24 && /1080×1920 ・ 24 コマ\/秒/.test(await ev("return document.querySelector('.app-video .status-field[data-stout]').textContent")));
  await page.key('Control+z'); await page.key('Control+z'); await sleep(300);
  ok('元に戻すと 1280×720・30 コマ/秒に戻る', JSON.stringify((await S()).settings) === '{"size":"720p","fps":30}');

  /* ---------- 15. 計画の保存と開き直し ---------- */
  await focusPreview();
  await page.key('Control+s');
  await fileDialog('テストの計画.fvid');
  s = await S();
  ok('Ctrl+S で /ビデオ に .fvid を保存する（題から * が消える）', s.path === '/ビデオ/テストの計画.fvid' && !s.dirty && await ev("return document.querySelector('.app-video .title-bar-text').textContent === 'テストの計画.fvid - 動画の編集'"), s.path);
  const saved = await P();
  ok('保存した .fvid は、検証を通る JSON', await ev("const fs = await import('./js/fs.mjs'); const V = await import('./js/core/video.mjs'); const r = V.validateProject(await fs.readJSON('/ビデオ/テストの計画.fvid')); return r.ok && r.warnings.length === 0"));
  await menu('ファイル', 'new', 500);
  s = await S();
  ok('「新しい計画」で空になる（保存済みなので聞かれない）', s.clips.length === 0 && s.media.length === 0 && s.path === null);
  await menu('ファイル', 'open', 600);
  await fileDialog('テストの計画.fvid', 1500);
  await waitState((x) => x.clips.length > 0, 8000);
  const reopened = await P();
  ok('保存した計画を開き直すと、同じ状態に戻る（素材・クリップ・文字・段・設定）', same(reopened, saved) && reopened.clips.length === 5 && reopened.clips.some((c) => c.text === 'はじめての動画' && c.color === '#ffd37a') && reopened.tracks.find((t) => t.id === 'a1').volume === 0.8, `${reopened.clips.length} クリップ`);
  s = await S();
  ok('開き直した直後は、変更なし・元に戻す記録なし', !s.dirty && s.undo === 0 && s.path === '/ビデオ/テストの計画.fvid');
  await setTime(1); await sleep(400);
  ok('開き直しても、プレビューに動画の絵が映る', bright(await pixel(640, 200)) > 60, JSON.stringify(await pixel(640, 200)));
  await shot('11-reopen');

  /* ---------- 16. 見つからない素材 ---------- */
  await ev("const fs = await import('./js/fs.mjs'); await fs.copy('/ビデオ/テストの計画.fvid', '/ビデオ/欠けた計画.fvid'); await fs.trash('/ビデオ/見本/見本の画像.png'); return true;");
  await menu('ファイル', 'open', 600);
  await fileDialog('欠けた計画.fvid', 1500);
  ok('素材が見つからない計画を開くと、知らせが出る', await waitSel('dialog.msgbox[open]') && /見つからない素材が 1 個/.test(await ev("return document.querySelector('dialog.msgbox[open] .msgbox-text').textContent")), await ev("return document.querySelector('dialog.msgbox[open] .msgbox-text')?.textContent || ''"));
  await shot('12-missing-msg');
  await answer('OK');
  s = await S();
  ok('見つからない素材は、箱とタイムラインで印が付く', s.media.find((m) => m.name === '見本の画像.png').missing && await ev("return document.querySelectorAll('.app-video .vd-clip.missing').length === 1 && document.querySelectorAll('.app-video .vd-bin-item.missing').length === 1"));
  const missClip = s.clips.find((c) => c.media === s.media.find((m) => m.missing).id);
  await setTime(missClip.start + 0.5); await sleep(300);
  ok('プレビューには「素材が見つかりません」の絵（紫の地）が出る', bright(await pixel(20, 700)) > 60, JSON.stringify(await pixel(20, 700)));
  await shot('13-missing');
  await ev("const fs = await import('./js/fs.mjs'); await fs.restore((await fs.list(fs.TRASH))[0].path); return true;");
  await menu('ファイル', 'open', 600);
  await fileDialog('テストの計画.fvid', 1500);
  await waitState((x) => x.path === '/ビデオ/テストの計画.fvid', 8000);
  await sleep(300);
  ok('素材を戻して開き直すと、知らせは出ず、印も消える', !(await ev("return !!document.querySelector('dialog.msgbox[open]')")) && (await S()).media.every((m) => !m.missing));

  /* ---------- 17. 書き出し（WebM） ---------- */
  s = await S();
  const total = s.duration;
  await click('.app-video .vd-tools [data-a="export"]', 300);
  await fileDialog('テストの動画.webm', 300);
  s = await waitState((x) => x.exporting, 5000);
  ok('「書き出す」で、書き出しが始まる', s.exporting);
  await sleep(1500);
  ok('書き出す間は進み具合（progress）が出て、編集の部分は触れない（inert）', await ev("const p = document.querySelector('.app-video [data-export]'); return !p.hidden && p.querySelector('progress').value > 0 && document.querySelector('.app-video [data-tl]').inert && document.querySelector('.app-video .vd-tools [data-a=\"export\"]').textContent.startsWith('やめる')"));
  await shot('14-exporting');
  s = await waitState((x) => !x.exporting, (total + 20) * 1000);
  const ex = s.lastExport;
  ok('動画の長さとほぼ同じ時間で書き終わる', ex && ex.ms > total * 1000 - 300 && ex.ms < total * 1000 + 3000, ex && ex.ms + ' ms / ' + total + ' 秒');
  ok('/ビデオ/テストの動画.webm に保存される', ex?.path === '/ビデオ/テストの動画.webm' && await ev("const fs = await import('./js/fs.mjs'); return (await fs.stat('/ビデオ/テストの動画.webm'))?.size > 20000"));
  const w = await probeWebM('/ビデオ/テストの動画.webm');
  ok('書き出した WebM を video 要素で読める。1280×720', w.w === 1280 && w.h === 720, JSON.stringify(w));
  ok('長さが計画の長さに近い（ファイルの中の長さと video 要素の長さ）', near(w.header / 1000, total, 0.05) && near(w.duration, total, 0.5), `${w.header} / ${w.duration} / ${total}`);
  ok('書き出した WebM の 1 秒の所に絵がある（黒でない）、音（Opus）も入っている', w.bright > 30 && w.opus, JSON.stringify(w));
  ok('書き出した WebM の音は無音でない（素材の音を Web Audio で混ぜて録れている）', w.peak > 0.02 && near(w.audioSec, total, 0.5), JSON.stringify({ peak: w.peak, audioSec: w.audioSec, err: w.audioErr }));
  ok('書き終わると、進み具合が消えて編集できる', await ev("return document.querySelector('.app-video [data-export]').hidden && !document.querySelector('.app-video [data-tl]').inert"));
  await shot('15-exported');

  /* ---------- 18. 書き出しをやめる・パソコンへ書き出す ---------- */
  await click('.app-video .vd-tools [data-a="export"]', 300);
  await fileDialog('やめる動画.webm', 300);
  await waitState((x) => x.exporting, 5000);
  await sleep(800);
  await page.key('Escape'); await sleep(800);
  s = await S();
  ok('Esc で書き出しをやめる（ファイルは作らない）', !s.exporting && /やめました/.test(await status()) && !(await ev("const fs = await import('./js/fs.mjs'); return fs.exists('/ビデオ/やめる動画.webm')")), await status());
  await page.raw('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await menu('ファイル', 'exportpc', 1500);
  let dl = null;
  for (let i = 0; i < 30 && !dl; i++) { dl = readdirSync(DL).find((f) => f.endsWith('.webm')); if (!dl) await sleep(200); }
  ok('「パソコンへ書き出す」で、さっき書き出した WebM をそのまま渡す', dl === 'テストの動画.webm' && statSync(join(DL, dl)).size === ex.size, dl);
  // パソコンのファイル（いま書き出した WebM）を、窓の素材の箱へ落とす
  const bin = await center('.app-video [data-bin]');
  const dd = { items: [], files: [join(DL, dl)], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) { await page.send('Input.dispatchDragEvent', { type, x: bin[0], y: bin[1], data: dd }); await sleep(100); }
  s = await waitState((x) => x.media.some((m) => m.name.startsWith('テストの動画')), 8000);
  const dropped = s.media.find((m) => m.name.startsWith('テストの動画'));
  ok('パソコンの動画ファイルを窓へ落とすと、/ビデオ に取り込んで素材の箱に入る', dropped && dropped.path.startsWith('/ビデオ/テストの動画') && near(dropped.duration, total, 0.1), JSON.stringify(dropped));

  /* ---------- 19. ほかの窓からファイルを落とす・閉じる前の確かめ ---------- */
  await ev(`const fs = await import('./js/fs.mjs'); const { encodeWAV } = await import('./js/core/wav.mjs'); const d = new Float32Array(22050).map((_, i) => Math.sin(i / 10) * 0.3); await fs.write('/音楽/落とす音.wav', new Blob([encodeWAV([d], 22050)], { type: 'audio/wav' }), 'audio/wav');
    document.querySelector('.app-video .app-body').dispatchEvent(new CustomEvent('fos:drop-file', { detail: { path: '/音楽/落とす音.wav' }, bubbles: true })); return true;`);
  s = await waitState((x) => x.media.length === 5, 5000);
  ok('仮想ドライブの音を窓へ落とすと、素材の箱に入る', s.media.at(-1)?.name === '落とす音.wav' && near(s.media.at(-1).duration, 1, 0.01));
  ok('変えたので題に * が付く', await ev("return document.querySelector('.app-video .title-bar-text').textContent.startsWith('*')"));
  await click('.app-video .title-bar-controls .close', 500);
  ok('保存していない変更があると、閉じる前に聞く', await waitSel('dialog.msgbox[open]', 3000) && /保存していない変更/.test(await ev("return document.querySelector('dialog.msgbox[open] .msgbox-text').textContent")));
  await answer('cancel');
  ok('キャンセルすると閉じない', !!(await S()));
  await click('.app-video .title-bar-controls .close', 500);
  await answer('discard');
  ok('保存しないで閉じられる', !(await S()));
  await ev("const sh = await import('./js/shell.mjs'); await sh.openFile('/ビデオ/テストの計画.fvid'); return true;");
  s = await waitState((x) => x.clips.length > 0, 8000);
  ok('.fvid を開くと（ファイル マネージャのダブルクリックと同じ）、動画の編集で計画が開く', s?.path === '/ビデオ/テストの計画.fvid' && same(await P(), saved));
  await shot('16-openfile');

  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));
  await sleep(600); // 記録は 250 ミリ秒ごとにまとめてサーバーへ送られる
  const logText = existsSync(join(ROOT, 'logs', 'app.log')) ? readFileSync(join(ROOT, 'logs', 'app.log'), 'utf8') : '';
  const need = ['video.launch', 'video.media', 'video.sample', 'video.add', 'video.place', 'video.split', 'video.trim', 'video.move', 'video.reorder', 'video.text', 'video.fade', 'video.join', 'video.field', 'video.track', 'video.undo', 'video.redo', 'video.play', 'video.stop', 'video.save', 'video.openplan', 'video.export.start', 'video.export.done', 'video.export.cancel', 'video.download', 'video.close'];
  ok('操作と読み書きと再生と書き出しが logs/app.log に記録される', need.every((k) => logText.includes(' ' + k + ' ')), need.filter((k) => !logText.includes(' ' + k + ' ')).join(','));
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'video-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((x) => !x.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
