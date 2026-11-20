// 画面と世界の計算（Web Worker）の通り道。前の net.mjs（WebSocket）の代わりで、送る形と受ける形は schema の C2S・S2C のまま。
// 送る: send({ t, ... }) を postMessage で物のまま渡す。受ける: Worker がまとめて送る JSON の文字列を 1 つずつ読んで onMessage へ。
import { C2S } from '../shared/schema.mjs';
import { log, forwardLine } from './log.mjs';
import { DEBUG } from './config.mjs';

// 記録に残さない（多すぎる）種類
const QUIET_RECV = new Set(['snap', 'fx', 'me', 'spawn', 'save', 'skills', 'paused']);
const QUIET_SEND = new Set(['move']);

export function createLink({ onMessage, onReady, onFatal }) {
  let ready = false;
  const stats = { sent: 0, recv: 0, bytesIn: 0, lastRecv: 0, batches: 0 };
  const url = new URL('./sim-worker.mjs', import.meta.url);
  if (DEBUG) url.searchParams.set('debug', '1');
  log('link.worker', { url: url.pathname + url.search }, 'start');
  const worker = new Worker(url, { type: 'module', name: 'kanenaki-sim' });

  function handle(text) {
    stats.recv++; stats.bytesIn += text.length;
    let m;
    try { m = JSON.parse(text); } catch { log('link.recv', { len: text.length }, 'error:json'); return; }
    if (!m || typeof m.t !== 'string') return;
    if (!QUIET_RECV.has(m.t)) log(`link.recv.${m.t}`, summarize(m));
    try { onMessage(m); } catch (e) { log('link.handle', { t: m.t, msg: String(e.stack || e).slice(0, 400) }, 'exception'); }
  }
  worker.onmessage = (ev) => {
    const d = ev.data;
    stats.batches++; stats.lastRecv = performance.now();
    for (const [level, line] of d.logs ?? []) forwardLine(line, level);
    for (const text of d.out ?? []) handle(text);
    if (d.ready && !ready) { ready = true; log('link.ready', { ms: d.ms, warnings: d.warnings }); onReady?.(d); }
    if (d.fatal) { log('link.fatal', { msg: d.fatal }, 'error'); onFatal?.(d.fatal); }
  };
  worker.onerror = (e) => { log('link.worker', { msg: e.message, at: `${e.filename ?? ''}:${e.lineno ?? 0}` }, 'error:worker'); onFatal?.(e.message || '世界の計算を始められませんでした'); };
  worker.onmessageerror = () => log('link.worker', {}, 'error:messageerror');

  // 画面からの命令。schema に無い種類は送らない
  function send(obj) {
    if (!obj || !C2S[obj.t]) { log('link.send', { t: obj?.t }, 'error:unknown-type'); return false; }
    worker.postMessage(obj);
    stats.sent++;
    if (!QUIET_SEND.has(obj.t)) log(`link.send.${obj.t}`, summarize(obj));
    return true;
  }
  return { send, stats, get ready() { return ready; }, state: 'open' };
}

// 記録の 1 行が長くなりすぎないように、主な項目だけ残す
function summarize(m) {
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (k === 't') continue;
    if (k === 'char') { out.char = v ? `${v.name} Lv${v.level}` : null; continue; }
    if (Array.isArray(v)) out[k] = `[${v.length}]`;
    else if (v && typeof v === 'object') out[k] = '{…}';
    else out[k] = typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '…' : v;
  }
  return out;
}
