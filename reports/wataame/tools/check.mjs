// reports/wataame/ のレポートと再生ページを、画面なし・音なしの Chrome で通しで確かめる台本。
// 使い方: node reports/wataame/tools/check.mjs [--port 8798] [--base <URL>] [--dark]
//   先に node tools/serve.mjs 8798 でページを出しておく。--base で公開版（https://dikmri.github.io/ai-coding-notes/reports/wataame/）も確かめられる
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from '../../../tools/lib/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const port = args.includes('--port') ? +args[args.indexOf('--port') + 1] : 8798;
const base = args.includes('--base') ? args[args.indexOf('--base') + 1].replace(/\/?$/, '/') : `http://localhost:${port}/reports/wataame/`;
const dark = args.includes('--dark');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'OK ' : 'NG '} ${name}${detail ? `  … ${detail}` : ''}`);
}

const page = await openBrowser({ width: 1440, height: 900, dark, profile: join(ROOT, 'build', 'wataame', `check-profile-${process.pid}`) });
try {
  // ---------------- レポート
  await page.navigate(base);
  await page.waitFor('#fig-spectrum svg', 15000);
  await sleep(500);
  const rep = await page.evaluate(`(async () => {
    const imgs = [...document.images];
    // loading="lazy" の画像は画面の外だと読み込まれないので、先に読ませる（読めないときは 8 秒で先へ進む）
    for (const i of imgs) i.loading = 'eager';
    const settle = (i) => (i.complete && i.naturalWidth ? Promise.resolve() : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }));
    await Promise.race([Promise.all(imgs.map(settle)), new Promise((r) => setTimeout(r, 8000))]);
    const v = document.querySelector('video');
    if (v.readyState < 1) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 8000); });
    const urls = ['player/', 'media/wataame.m4a', 'media/demo-v1.m4a', 'media/demo-v2.m4a', 'data/score.json', 'data/levels.bin', 'data/compare.json'];
    const codes = await Promise.all(urls.map((u) => fetch(u, { method: 'HEAD' }).then((r) => r.status).catch(() => 0)));
    return {
      svgs: document.querySelectorAll('.chart svg').length,
      broken: imgs.filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')),
      imgs: imgs.length,
      alts: imgs.filter((i) => !i.alt).length,
      video: { dur: v.duration, w: v.videoWidth, h: v.videoHeight },
      codes: Object.fromEntries(urls.map((u, i) => [u, codes[i]])),
      h1: document.querySelector('h1').textContent,
      tables: document.querySelectorAll('table').length,
    };
  })()`);
  ok('レポート: グラフが 10 枚（和音の長さ・格子 2・サイドチェイン・配分・母音 5）', rep.svgs === 10, `svg=${rep.svgs}`);
  ok('レポート: 画像がすべて読める', rep.broken.length === 0 && rep.imgs >= 9, `画像 ${rep.imgs} 枚、読めない ${rep.broken.join(',') || 'なし'}`);
  ok('レポート: 画像に代わりの文がある', rep.alts === 0);
  ok('レポート: 動画が 1920×1080、約 123 秒', rep.video.w === 1920 && rep.video.h === 1080 && Math.abs(rep.video.dur - 123) < 0.2, JSON.stringify(rep.video));
  ok('レポート: 再生ページと音とデータがある', Object.values(rep.codes).every((c) => c === 200), JSON.stringify(rep.codes));
  for (const w of [400, 768]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 600 });
    await sleep(300);
    const o = await page.evaluate('({ sw: document.scrollingElement.scrollWidth, iw: innerWidth })');
    ok(`レポート: 幅 ${w} px で横にはみ出さない`, o.sw <= o.iw + 1, `scrollWidth=${o.sw} innerWidth=${o.iw}`);
  }
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // ---------------- 撮影モード（同じ時刻は同じ絵、違う時刻は違う絵）
  await page.navigate(`${base}player/?capture=1`);
  const cap = await page.evaluate(`(async () => {
    const info = await window.__wataame.ready;
    const c = document.getElementById('stage');
    const at = (t) => { window.__wataame.renderAt(t); return c.toDataURL('image/png'); };
    const a = at(40.6), b = at(40.6), d = at(41.1);
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) window.__wataame.renderAt(36 + i / 60);
    return { info, same: a === b, differ: a !== d, msPerFrame: (performance.now() - t0) / 120 };
  })()`);
  ok('撮影モード: 準備ができ、長さは 123 秒', cap.info && Math.abs(cap.info.duration - 123) < 0.01, JSON.stringify(cap.info));
  ok('撮影モード: 同じ時刻なら同じ絵になる', cap.same);
  ok('撮影モード: 時刻が違えば絵も変わる', cap.differ);
  ok('撮影モード: 1 コマの描画が 8 ms 未満', cap.msPerFrame < 8, `${cap.msPerFrame.toFixed(2)} ms`);

  // ---------------- 再生ページ（音なしの Chrome で再生・シーク・一時停止）
  await page.navigate(`${base}player/`);
  await page.waitFor('#play:not([disabled])', 15000);
  const ready = await page.evaluate(`({ status: document.getElementById('status').textContent, btn: document.getElementById('play').textContent })`);
  ok('再生ページ: データを読み、再生ボタンが押せる', ready.btn === '再生' && ready.status === '', JSON.stringify(ready));
  await page.evaluate(`document.getElementById('play').click()`);
  await sleep(2500);
  const playing = await page.evaluate(`(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
    return { btn: document.getElementById('play').textContent, time: document.getElementById('time').textContent, seek: +document.getElementById('seek').value, fps: n };
  })()`);
  ok('再生ページ: 再生すると時刻が進む', playing.btn === '一時停止' && playing.seek > 1, JSON.stringify(playing));
  ok('再生ページ: 再生中は 1 秒に 50 コマ以上描く', playing.fps >= 50, `${playing.fps} コマ/秒（画面なしの Chrome）`);
  await page.evaluate(`(() => { const s = document.getElementById('seek'); s.value = '36'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(1200);
  const sought = await page.evaluate(`({ seek: +document.getElementById('seek').value, now: document.getElementById('now').textContent })`);
  ok('再生ページ: シークで 36 秒へ動き、区間の表示が Drop になる', sought.seek > 36 && sought.seek < 39 && sought.now.includes('Drop'), JSON.stringify(sought));
  await page.evaluate(`document.getElementById('play').click()`);
  await sleep(400);
  const paused = await page.evaluate(`({ btn: document.getElementById('play').textContent, a: +document.getElementById('seek').value })`);
  await sleep(800);
  const paused2 = await page.evaluate(`+document.getElementById('seek').value`);
  ok('再生ページ: 一時停止すると時刻が止まる', paused.btn === '再生' && Math.abs(paused2 - paused.a) < 0.01, `${paused.a} → ${paused2}`);
  const dec = await page.evaluate(`(async () => { const ac = new OfflineAudioContext(2, 48000, 48000); const b = await ac.decodeAudioData(await (await fetch('../media/wataame.m4a')).arrayBuffer()); return b.duration; })()`);
  ok('再生ページ: 配信用の音を読むと 123.00 秒（AAC の先頭の無音が除かれている）', Math.abs(dec - 123) < 0.03, `${dec.toFixed(4)} 秒`);
  // 1 画面に収まる（縦にも横にもスクロールが出ない）。canvas は画面の中に全部見える
  for (const [w, h, mobile] of [[1366, 768, false], [1920, 937, false], [1280, 600, false], [375, 812, true], [812, 375, true]]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await sleep(350);
    const o = await page.evaluate(`(() => { const se = document.scrollingElement; const r = document.getElementById('stage').getBoundingClientRect(); return { sw: se.scrollWidth, sh: se.scrollHeight, iw: innerWidth, ih: innerHeight, c: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] }; })()`);
    const fits = o.sw <= o.iw + 1 && o.sh <= o.ih + 1 && o.c[0] >= 0 && o.c[1] >= 0 && o.c[2] <= o.iw && o.c[3] <= o.ih;
    ok(`再生ページ: ${w}×${h} で 1 画面に収まる`, fits, `scroll=${o.sw}×${o.sh} canvas=${o.c.join(',')}`);
  }
  // 青い箱（サイドチェインの曲線のグラフ）を外したこと: 描画のコードに、その見出しも pump の値の読み出しも無い
  const src = await page.evaluate(`fetch('../js/stage.mjs').then((r) => r.text())`);
  ok('再生ページ: サイドチェインの青い箱を描く部分が無い', !src.includes('サイドチェイン') && !src.includes("'pump'"));
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(300);
  ok('再生ページ: 動きを減らす設定でも止まらない', (await page.evaluate('typeof window.requestDraw')) === 'function');

  ok('コンソールにエラーが無い', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' / '));
} catch (err) {
  ok('台本が最後まで動く', false, String(err));
} finally {
  await page.close();
}
console.log(`\n${pass} 件通過、${fail} 件失敗`);
process.exitCode = fail ? 1 : 0;
