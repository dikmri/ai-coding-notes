// 動作確認用の小さなサーバー（依存なし）。
// 使い方: node tools/serve.mjs  → http://localhost:8765/
// ・プロジェクトのファイルをそのまま配信する
// ・画面から送られた操作ログを logs/app.log に1行ずつ追記する
import { createServer } from 'node:http';
import { readFile, appendFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const LOG_DIR = join(ROOT, 'logs');
const LOG_FILE = join(LOG_DIR, 'app.log');
const PORT = Number(process.env.PORT || 8765);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

await mkdir(LOG_DIR, { recursive: true });
const serverLog = (line) => appendFile(LOG_FILE, `${new Date().toISOString()} ${line}\n`).catch(() => {});

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/__log') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 1e6) break; }
      await appendFile(LOG_FILE, body.endsWith('\n') ? body : body + '\n');
      res.writeHead(204).end();
      return;
    }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT + sep) && file !== ROOT) { res.writeHead(403).end(); return; }
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('見つかりません');
      serverLog(`server.404 args={"path":${JSON.stringify(path)}} result=404`);
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch (err) {
    serverLog(`server.error args={"url":${JSON.stringify(req.url)}} result=${JSON.stringify(err.message)}`);
    res.writeHead(500).end();
  }
}).listen(PORT, () => {
  console.log(`出来る！ http://localhost:${PORT}/   ログ: ${LOG_FILE}`);
  serverLog(`server.start args={"port":${PORT}} result=ok`);
});
