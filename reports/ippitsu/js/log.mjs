// 動作確認の記録。1 行 = `ISO時刻 ippitsu.<イベント> args={...} result=...`。
// 手元（localhost の tools/serve.mjs）で開いたときだけ POST /__log で logs/app.log へ足す。公開版ではコンソールだけ。
const REMOTE = /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const queue = [];
let timer = 0;

function fmt(v) {
  let s;
  try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { s = String(v); }
  if (s === undefined) s = String(v);
  s = s.replace(/\s*\n\s*/g, ' ⏎ ');
  return s.length > 800 ? `${s.slice(0, 800)}…` : s;
}
function flush() {
  clearTimeout(timer); timer = 0;
  if (!queue.length) return;
  const body = `${queue.splice(0).join('\n')}\n`;
  fetch('/__log', { method: 'POST', body, keepalive: body.length < 60000, headers: { 'content-type': 'text/plain;charset=utf-8' } }).catch(() => {});
}
export function log(event, args = {}, result = 'ok') {
  const line = `${new Date().toISOString()} ippitsu.${event} args=${fmt(args)} result=${fmt(result)}`;
  const bad = typeof result === 'string' && (result.startsWith('error') || result.startsWith('exception'));
  if (bad) console.error(line); else console.debug(line);
  if (!REMOTE) return;
  queue.push(line);
  if (queue.length > 200) flush();
  else if (!timer) timer = setTimeout(flush, 400);
}
export function watchErrors() {
  addEventListener('error', (e) => log('exception', { msg: String(e.message || e.error), at: `${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}` }, 'exception'));
  addEventListener('unhandledrejection', (e) => log('exception.promise', { msg: String(e.reason?.stack || e.reason).slice(0, 500) }, 'exception'));
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
export const logFile = REMOTE;
