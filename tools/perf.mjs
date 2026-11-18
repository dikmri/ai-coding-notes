// 図鑑の重さを測る道具。Chrome（画面に出さない）で図鑑を開き、読み込み・一覧のスクロール・詳細を開く操作の時間とメモリを数える。
// 使い方: node tools/perf.mjs <URL> <名前> [--runs 3] [--size 1280x800] [--ids a,b,c] [--live off] [--hero off]
//   --live off  動くプレビューの切り替えを切った状態で測る（localStorage の dekiru:live）
//   --hero off  表紙の粒子の動きを止めた状態で測る（「動きを止める」を押す）
//   例: node tools/perf.mjs http://localhost:8772/ before
// 結果は build/perf/<名前>.json に書き、要点を表で出す。runs 回測って中央値を取る。
// 数えるもの:
//  ・CPU の時間: Chrome の全部のプロセス（ページ・iframe・GPU）の合計。SystemInfo.getProcessInfo を 0.5 秒ごとに読み、増えた分を足す
//  ・メモリ: この Chrome の子プロセスの専用メモリ（PrivatePageCount）の合計。Windows の Win32_Process から読む
//  ・長い処理: 図鑑のページの主スレッドで 50ms を超えた処理（PerformanceObserver の longtask）
//  ・プレビュー: 画面に見えているカードの絵が出るまでの時間（動くプレビューの iframe.on か、静止画の .prev.img-on）
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [url, name, ...rest] = process.argv.slice(2);
const opt = { runs: 3, size: '1280x800', ids: 'shape-heart,3d-raymarch,3d-vroid-shore', scrollSpeed: 2500 };
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--runs') opt.runs = +rest[++i];
  else if (rest[i] === '--size') opt.size = rest[++i];
  else if (rest[i] === '--ids') opt.ids = rest[++i];
  else if (rest[i] === '--live') opt.live = rest[++i];
  else if (rest[i] === '--hero') opt.hero = rest[++i];
}
if (!url || !name || !/^[\w-]+$/.test(name)) { console.error('使い方: node tools/perf.mjs <URL> <名前> [--runs 3] [--size 1280x800] [--ids a,b,c]'); process.exit(1); }
const [W, H] = opt.size.split('x').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = join(ROOT, 'logs', 'perf.log');
mkdirSync(dirname(LOG), { recursive: true });
const log = (ev, args, result) => appendFileSync(LOG, `${new Date().toISOString()} ${ev} args=${JSON.stringify(args)} result=${result}\n`);

// ページが読み込まれる前に仕込む観測。主スレッドの長い処理・LCP・フレームの間隔・プレビューが出た時刻を集める
const PROBE = `(() => {
  if (window.top !== window) return;
  const P = window.__perf = { lt: [], lcp: 0, fcp: 0, frames: null, shown: new Map() };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') P.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch {}
  // カードの絵が出たか（動くプレビューなら iframe.on、静止画なら .prev.img-on）を 50ms ごとに見る
  const tick = () => {
    for (const p of document.querySelectorAll('.prev')) {
      if (P.shown.has(p)) continue;
      if (p.querySelector('iframe.on') || p.classList.contains('img-on')) P.shown.set(p, performance.now());
    }
    setTimeout(tick, 50);
  };
  setTimeout(tick, 50);
  // 一定の速さで下までスクロールし、フレームの間隔を記録する
  P.scroll = (speed) => new Promise((done) => {
    const ivs = []; let last = performance.now(); const t0 = last; const y0 = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    const f = (t) => {
      ivs.push(t - last); last = t;
      const y = Math.min(max, y0 + ((t - t0) / 1000) * speed);
      scrollTo(0, y);
      if (y < max) requestAnimationFrame(f); else done({ ivs, ms: t - t0, px: y - y0 });
    };
    requestAnimationFrame(f);
  });
  // 見えているカードの数と、その絵が出た時刻
  P.visibleCards = () => {
    const out = [];
    for (const p of document.querySelectorAll('.card:not([hidden]) .prev')) {
      const r = p.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight && r.width > 0) out.push(P.shown.has(p) ? P.shown.get(p) : null);
    }
    return out;
  };
})();`;

const median = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

// この Chrome の子プロセスの専用メモリの合計（MB）と、プロセスの数
function memoryOf(pid) {
  const out = execFileSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,PrivatePageCount | ConvertTo-Json -Compress'], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const list = JSON.parse(out);
  const kids = new Map();
  for (const p of list) { if (!kids.has(p.ParentProcessId)) kids.set(p.ParentProcessId, []); kids.get(p.ParentProcessId).push(p); }
  let sum = 0, n = 0;
  const walk = (id) => { for (const c of kids.get(id) || []) { sum += Number(c.PrivatePageCount) || 0; n++; walk(c.ProcessId); } };
  const self = list.find((p) => p.ProcessId === pid);
  if (self) { sum += Number(self.PrivatePageCount) || 0; n++; }
  walk(pid);
  return { mb: Math.round(sum / 1048576), procs: n };
}

// 全プロセスの CPU 時間を 0.5 秒ごとに読み、増えた分を足していく
function cpuMeter(page) {
  const last = new Map(); let total = 0, on = true;
  const read = async () => {
    const { processInfo } = await page.raw('SystemInfo.getProcessInfo');
    for (const p of processInfo) { const prev = last.get(p.id); if (prev != null && p.cpuTime > prev) total += p.cpuTime - prev; last.set(p.id, p.cpuTime); }
  };
  const loop = (async () => { while (on) { await read().catch(() => {}); await sleep(500); } })();
  return {
    async lap() { await read().catch(() => {}); const t = total; total = 0; return t; },
    async stop() { on = false; await loop; },
  };
}
const mainMetrics = async (page) => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

async function runOnce(i) {
  const page = await openBrowser({ width: W, height: H, profile: join(ROOT, 'runtime/perf-profile-' + i) });
  const r = {};
  try {
    await page.send('Performance.enable', { timeDomain: 'timeTicks' });
    await page.send('Network.enable');
    await page.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
    if (opt.live === 'off') await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (window.top === window) try { localStorage.setItem('dekiru:live', 'false'); } catch {}` });
    if (opt.hero === 'off') await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (window.top === window) addEventListener('load', () => document.querySelector('#heroPause')?.click());` });
    let bytes = 0, reqs = 0;
    page.on((m) => { if (m.method === 'Network.loadingFinished') { bytes += m.params.encodedDataLength; reqs++; } });
    const cpu = cpuMeter(page);
    await cpu.lap();
    const m0 = await mainMetrics(page);

    // 1. トップの読み込み（読み込み後 8 秒まで）
    await page.navigate(url);
    await sleep(8000);
    const load = await page.evaluate(`(() => { const n = performance.getEntriesByType('navigation')[0]; const P = window.__perf; const v = P.visibleCards();
      const lt = P.lt.filter(([s]) => s < 8000 + n.loadEventEnd);
      return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, fcp: P.fcp, lcp: P.lcp, ltCount: lt.length, ltTotal: lt.reduce((a, [, d]) => a + d, 0), ltMax: Math.max(0, ...lt.map(([, d]) => d)),
        visible: v.length, shown: v.filter((x) => x != null).length, shownLast: v.every((x) => x != null) ? Math.max(0, ...v) : null,
        iframes: document.querySelectorAll('.prev iframe').length, imgs: document.querySelectorAll('.prev img').length, dom: document.getElementsByTagName('*').length }; })()`);
    const m1 = await mainMetrics(page);
    r.load = { ...load, cpuSec: await cpu.lap(), bytesKB: Math.round(bytes / 1024), requests: reqs,
      scriptMs: (m1.ScriptDuration - m0.ScriptDuration) * 1000, layoutMs: (m1.LayoutDuration - m0.LayoutDuration) * 1000, styleMs: (m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000, taskMs: (m1.TaskDuration - m0.TaskDuration) * 1000,
      jsHeapMB: m1.JSHeapUsedSize / 1048576, ...(() => { const x = memoryOf(page.pid); return { memMB: x.mb, procs: x.procs }; })() };
    // 何もしないで 5 秒（トップのまま）
    await cpu.lap();
    await sleep(5000);
    r.idleTop = { cpuSec: await cpu.lap() };

    // 2. 一覧を下までスクロール
    await page.evaluate(`window.__perf.lt.length = 0`);
    const m2 = await mainMetrics(page);
    bytes = 0; reqs = 0;
    let peak = 0;
    const sampler = (async () => { for (let k = 0; k < 6; k++) { await sleep(2500); try { peak = Math.max(peak, memoryOf(page.pid).mb); } catch { /* 読めないときは飛ばす */ } } })();
    const sc = await page.evaluate(`window.__perf.scroll(${opt.scrollSpeed})`);
    const m3 = await mainMetrics(page);
    const scrollCpu = await cpu.lap();
    await sampler;
    const lt2 = await page.evaluate(`window.__perf.lt.map(([, d]) => d)`);
    const iv = sc.ivs.slice(1);
    r.scroll = { ms: sc.ms, px: sc.px, frames: iv.length, fps: (iv.length / sc.ms) * 1000, p95: pct(iv, 0.95), over50: iv.filter((x) => x > 50).length, over100: iv.filter((x) => x > 100).length, maxGap: Math.max(...iv),
      ltCount: lt2.length, ltTotal: lt2.reduce((a, b) => a + b, 0), cpuSec: scrollCpu, peakMemMB: peak, bytesKB: Math.round(bytes / 1024), requests: reqs,
      taskMs: (m3.TaskDuration - m2.TaskDuration) * 1000, scriptMs: (m3.ScriptDuration - m2.ScriptDuration) * 1000 };
    await cpu.lap();
    await sleep(5000);
    r.idleBottom = { cpuSec: await cpu.lap(), ...(() => { const x = memoryOf(page.pid); return { memMB: x.mb, procs: x.procs }; })() };

    // 3. 詳細を開いて閉じる（一覧の上に戻ってから）
    await page.evaluate(`scrollTo(0, 0)`);
    await sleep(4000);
    r.detail = [];
    for (const id of opt.ids.split(',')) {
      await cpu.lap();
      const d = await page.evaluate(`new Promise((done) => {
        const t0 = performance.now();
        window.DekiruApp.openEntry(${JSON.stringify(id)});
        const sync = performance.now() - t0;
        const f = document.querySelector('#dFrame');
        let loaded = null, paint = null;
        requestAnimationFrame(() => setTimeout(() => { paint = performance.now() - t0; }, 0));
        f.addEventListener('load', () => { loaded = performance.now() - t0; }, { once: true });
        setTimeout(() => done({ id: ${JSON.stringify(id)}, sync, paint, loaded }), 3000);
      })`);
      d.openCpuSec = await cpu.lap();
      const c = await page.evaluate(`new Promise((done) => { const t0 = performance.now(); document.querySelector('#detail').close(); const sync = performance.now() - t0;
        let paint = null; requestAnimationFrame(() => setTimeout(() => { paint = performance.now() - t0; }, 0)); setTimeout(() => done({ sync, paint }), 3000); })`);
      d.closeSync = c.sync; d.closePaint = c.paint; d.closeCpuSec = await cpu.lap();
      r.detail.push(d);
    }
    await cpu.stop();
    r.errors = page.consoleErrors.slice(0, 10);
  } finally { await page.close(); }
  return r;
}

const runs = [];
for (let i = 0; i < opt.runs; i++) {
  const t = Date.now();
  try { runs.push(await runOnce(i)); log('perf.run', { url, name, i }, `ok ${Date.now() - t}ms`); }
  catch (e) { log('perf.run', { url, name, i }, 'error: ' + e.message); console.error('失敗: ' + e.message); }
}
if (!runs.length) process.exit(1);
// 中央値をまとめる
const pick = (f) => median(runs.map(f));
const sum = {
  load: Object.fromEntries(Object.keys(runs[0].load).map((k) => [k, pick((r) => r.load[k])])),
  idleTop: { cpuSec: pick((r) => r.idleTop.cpuSec) },
  scroll: Object.fromEntries(Object.keys(runs[0].scroll).map((k) => [k, pick((r) => r.scroll[k])])),
  idleBottom: Object.fromEntries(Object.keys(runs[0].idleBottom).map((k) => [k, pick((r) => r.idleBottom[k])])),
  detail: runs[0].detail.map((d, j) => Object.fromEntries(Object.keys(d).map((k) => [k, k === 'id' ? d.id : pick((r) => r.detail[j]?.[k])]))),
};
const out = join(ROOT, 'build/perf', name + '.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ url, size: opt.size, runs: runs.length, at: new Date().toISOString(), median: sum, all: runs }, null, 2));
const f = (v, d = 0) => (v == null ? '-' : Number(v).toFixed(d));
console.log(`== ${name}（${runs.length} 回の中央値、${opt.size}）`);
console.log(`読み込み: DCL ${f(sum.load.dcl)}ms / load ${f(sum.load.load)}ms / FCP ${f(sum.load.fcp)}ms / LCP ${f(sum.load.lcp)}ms / 通信 ${f(sum.load.bytesKB)}KB ${f(sum.load.requests)}件`);
console.log(`  主スレッド: 長い処理 ${f(sum.load.ltCount)}回 計${f(sum.load.ltTotal)}ms 最大${f(sum.load.ltMax)}ms / script ${f(sum.load.scriptMs)}ms layout ${f(sum.load.layoutMs)}ms style ${f(sum.load.styleMs)}ms task ${f(sum.load.taskMs)}ms`);
console.log(`  最初の 8 秒の CPU ${f(sum.load.cpuSec, 2)}秒 / メモリ ${f(sum.load.memMB)}MB（${f(sum.load.procs)}プロセス）/ JS ヒープ ${f(sum.load.jsHeapMB, 1)}MB / 要素 ${f(sum.load.dom)}`);
console.log(`  見えているカード ${f(sum.load.visible)} 枚のうち絵が出た ${f(sum.load.shown)} 枚、全部出た時刻 ${f(sum.load.shownLast)}ms / iframe ${f(sum.load.iframes)} 個`);
console.log(`何もしない 5 秒（トップ）: CPU ${f(sum.idleTop.cpuSec, 2)}秒`);
console.log(`スクロール ${f(sum.scroll.px)}px を ${f(sum.scroll.ms)}ms: ${f(sum.scroll.fps, 1)}fps / 95%点 ${f(sum.scroll.p95, 1)}ms / 50ms超 ${f(sum.scroll.over50)}回 / 100ms超 ${f(sum.scroll.over100)}回 / 最大 ${f(sum.scroll.maxGap)}ms`);
console.log(`  長い処理 ${f(sum.scroll.ltCount)}回 計${f(sum.scroll.ltTotal)}ms / CPU ${f(sum.scroll.cpuSec, 2)}秒 / メモリの山 ${f(sum.scroll.peakMemMB)}MB / 通信 ${f(sum.scroll.bytesKB)}KB`);
console.log(`何もしない 5 秒（下）: CPU ${f(sum.idleBottom.cpuSec, 2)}秒 / メモリ ${f(sum.idleBottom.memMB)}MB`);
for (const d of sum.detail) console.log(`詳細 ${d.id}: 開く処理 ${f(d.sync, 1)}ms / 次の描画 ${f(d.paint, 1)}ms / 見本の読み込み ${f(d.loaded)}ms / CPU ${f(d.openCpuSec, 2)}秒 ・ 閉じる処理 ${f(d.closeSync, 1)}ms / 次の描画 ${f(d.closePaint, 1)}ms / 閉じたあと 3 秒の CPU ${f(d.closeCpuSec, 2)}秒`);
console.log('保存: build/perf/' + name + '.json');
