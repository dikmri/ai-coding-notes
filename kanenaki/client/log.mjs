// 画面の記録。1 行 = `ISO時刻 イベント名 args={...} result=...`（schema の logLine と同じ形）。
// 手元（localhost の tools/serve.mjs）で開いたときは POST /__log で logs/app.log へ 1 行ずつ足す。公開版では console だけ。
// Worker（世界の計算）の記録も、link.mjs が forwardLine でここへ渡す。
// 送るのは fetchLater（無いブラウザでは下の小さな代わり）。閉じる間際の記録も落とさないため。
import { logLine } from '../shared/schema.mjs';

const REMOTE = /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const ENDPOINT = '/__log';
const MAX_BODY = 48 * 1024; // fetchLater の枠（1 つの送り先でおよそ 64KB）より小さく
const queue = [];
let timer = 0;

// fetchLater が無いブラウザの代わり（modern-web-guidance の full-session-analytics の形）
globalThis.fetchLater ??= function fetchLater(url, init = {}) {
  let timeoutHandle;
  let activated = false;
  function sendNow() {
    if (!(init.signal && init.signal.aborted)) {
      if ('keepalive' in Request.prototype || init.method !== 'POST' || init.headers) {
        fetch(url, Object.assign({}, init, { keepalive: true }));
        activated = true;
      } else {
        activated = navigator.sendBeacon(url, init.body);
      }
    }
    destroy();
  }
  function destroy() {
    document.removeEventListener('visibilitychange', sendNow);
    clearTimeout(timeoutHandle);
  }
  if (document.visibilityState === 'hidden') queueMicrotask(sendNow);
  else {
    document.addEventListener('visibilitychange', sendNow);
    if (typeof init.activateAfter === 'number' && init.activateAfter >= 0) timeoutHandle = setTimeout(sendNow, init.activateAfter);
  }
  if (init.signal) init.signal.addEventListener('abort', destroy);
  return { get activated() { return activated; } };
};

function flush() {
  clearTimeout(timer); timer = 0;
  while (queue.length) {
    let body = '', n = 0;
    while (n < queue.length && (n === 0 || body.length + queue[n].length < MAX_BODY)) { body += `${queue[n]}\n`; n++; }
    try {
      fetchLater(ENDPOINT, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body, activateAfter: 0 });
      queue.splice(0, n);
    } catch {
      // 枠が足りない（前に送った分がまだ出ていない）。少し待って送り直す
      timer = setTimeout(flush, 500);
      return;
    }
  }
}
function push(line) {
  if (!REMOTE) return;
  queue.push(line);
  if (queue.length > 400) flush();
  else if (!timer) timer = setTimeout(flush, 300);
}

const isBad = (r) => typeof r === 'string' && (r.startsWith('error') || r.startsWith('exception'));
export function log(event, args = {}, result = 'ok') {
  const line = logLine(event, args, result);
  if (isBad(result)) console.error(line); else console.debug(line);
  push(line);
}
// Worker が作った 1 行をそのまま足す（level が error なら console.error にも出す）
export function forwardLine(line, level = 'info') {
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.debug(line);
  push(line);
}
export const flushLog = flush;

// 例外の地点を全部記録する
export function watchErrors() {
  window.addEventListener('error', (e) => log('exception', { msg: String(e.message || e.error), at: `${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}` }, 'exception'));
  window.addEventListener('unhandledrejection', (e) => log('exception.promise', { msg: String(e.reason?.stack || e.reason).slice(0, 400) }, 'exception'));
  window.addEventListener('pagehide', flush);
}
