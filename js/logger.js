/* 動作確認用ログ。
 * 手元の tools/serve.mjs 経由（localhost）で開いたときだけ、1行ずつ logs/app.log に追記される。
 * 書式: 2026-11-16T13:00:00.000Z イベント名 args={...} result=...
 * file:// で直接開いたときや、公開したページではコンソールにだけ出す（外のサーバーへは送らない）。 */
(function () {
  'use strict';
  const remote = /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const queue = [];
  let timer = 0;

  function fmt(v) {
    let s;
    try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { s = String(v); }
    if (s === undefined) s = String(v);
    s = s.replace(/\s*\n\s*/g, ' ⏎ ');
    return s.length > 400 ? s.slice(0, 400) + '…' : s;
  }
  function flush() {
    if (!queue.length) return;
    const body = queue.splice(0).join('\n') + '\n';
    fetch('/__log', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain;charset=utf-8' } }).catch(() => {});
  }
  function log(event, args, result) {
    const line = `${new Date().toISOString()} ${event} args=${fmt(args ?? {})} result=${fmt(result ?? 'ok')}`;
    if (!remote) { console.debug('[dekiru]', line); return; }
    queue.push(line);
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }

  addEventListener('pagehide', flush);
  addEventListener('error', (e) => log('window.error', { msg: e.message, src: e.filename, line: e.lineno, col: e.colno }, 'exception'));
  addEventListener('unhandledrejection', (e) => log('window.unhandledrejection', { reason: String((e.reason && e.reason.stack) || e.reason) }, 'exception'));
  window.dlog = log;
  log('page.load', { url: location.href, ua: navigator.userAgent }, 'ok');
})();
