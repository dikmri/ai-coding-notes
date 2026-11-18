// 講座「夕暮れ峠をもう一度」を手元で動かすためのサーバー（開発用。講座の中身には入れない）。
//   node tools/yugure-serve.mjs [番号]   → http://127.0.0.1:8790/game/top.html
// os/course/yugure/ を配る。HTML には記録の小さなスクリプト（/__dev/logger.js）を差し込み、
// キー操作・ボタン・ゲームの出来事・エラーを、logs/play.log に 1 行ずつ残す。
// 1 行の形: 「時刻 出来事 args={...} result=...」
import { createServer } from 'node:http';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..', 'os', 'course', 'yugure');
const LOG_DIR = resolve(HERE, '..', 'logs');
const LOG_FILE = join(LOG_DIR, 'play.log');
const PORT = Number(process.argv[2]) || 8790;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wgsl': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.obj': 'text/plain; charset=utf-8',
};

const LOGGER = `(() => {
  const send = (event, args = {}, result = 'ok') => {
    const body = JSON.stringify({ t: new Date().toISOString(), event, args, result });
    fetch('/__log', { method: 'POST', body, keepalive: true }).catch(() => {});
  };
  send('page.load', { url: location.pathname + location.search, size: innerWidth + 'x' + innerHeight });
  addEventListener('keydown', (e) => { if (!e.repeat) send('input.keydown', { code: e.code }); }, true);
  addEventListener('keyup', (e) => send('input.keyup', { code: e.code }), true);
  addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) send('ui.click', { text: b.textContent.trim(), value: b.value }); }, true);
  addEventListener('error', (e) => send('error', { message: e.message, file: e.filename, line: e.lineno, col: e.colno }, 'error'));
  addEventListener('unhandledrejection', (e) => send('error.rejection', { reason: String((e.reason && e.reason.message) || e.reason) }, 'error'));
  addEventListener('yugure', (e) => send('game.' + e.detail.type, e.detail));
  let frames = 0;
  const count = () => { frames++; requestAnimationFrame(count); };
  requestAnimationFrame(count);
  setInterval(() => {
    const s = window.yugure && window.yugure.state ? window.yugure.state() : null;
    send('game.status', Object.assign({ fps: Math.round(frames / 5) }, s || {}));
    frames = 0;
  }, 5000);
})();
`;

await mkdir(LOG_DIR, { recursive: true });
const writeLog = (line) => appendFile(LOG_FILE, line + '\n');
await writeLog(`${new Date().toISOString()} server.start args=${JSON.stringify({ port: PORT, root: ROOT })} result=ok`);

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  try {
    if (url.pathname === '/__log' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const entry = JSON.parse(body);
      await writeLog(`${entry.t} ${entry.event} args=${JSON.stringify(entry.args)} result=${JSON.stringify(entry.result)}`);
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === '/__dev/logger.js') {
      response.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' }).end(LOGGER);
      return;
    }
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (path !== ROOT && !path.startsWith(ROOT + sep)) { response.writeHead(403).end(); return; }
    const file = path.endsWith(sep) || url.pathname.endsWith('/') ? join(path, 'index.html') : path;
    let body = await readFile(file);
    const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    if (type.startsWith('text/html')) body = body.toString('utf8').replace('</head>', '<script src="/__dev/logger.js"></script>\n</head>');
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  } catch (error) {
    const status = error.code === 'ENOENT' ? 404 : 500;
    await writeLog(`${new Date().toISOString()} http.${status} args=${JSON.stringify({ path: url.pathname })} result=${JSON.stringify(error.message)}`);
    response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(status === 404 ? 'ありません' : 'エラー');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}/game/top.html （記録: ${LOG_FILE}）`));
