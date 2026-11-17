// 動作確認用の小さなサーバー（依存なし）。
// 使い方: node tools/serve.mjs  → http://localhost:8765/
// ・プロジェクトのファイルをそのまま配信する
// ・画面から送られた操作ログを logs/app.log に1行ずつ追記する
// ・Future OS のウェブブラウザのための、手元専用の中継（/__arcadia/relay）。手元の機械と家の中のネットワークへはつながない
// ・AI の道具（MCP）から Future OS を操作するための中継点（/__arcadia/agent、tools/lib/agent-hub.mjs）。この機械の中からだけ受ける
// ・runtime/ は配信しない（中継点の合言葉や、確認用のブラウザの記録を置くため）
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns';
import { isIP } from 'node:net';
import zlib from 'node:zlib';
import { readFile, writeFile, appendFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBlockedAddress } from '../os/js/core/netguard.mjs';
import { frameBlocked } from '../os/js/core/browser.mjs';
import { createAgentHub } from './lib/agent-hub.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const LOG_DIR = join(ROOT, 'logs');
const LOG_FILE = join(LOG_DIR, 'app.log');
const PORT = Number(process.argv[2] || process.env.PORT || 8765);
const SHOT_DIR = join(ROOT, 'build', 'shots');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

await mkdir(LOG_DIR, { recursive: true });
const serverLog = (line) => appendFile(LOG_FILE, `${new Date().toISOString()} ${line}\n`).catch(() => {});
const hub = await createAgentHub({ port: PORT, root: ROOT, log: serverLog });

/* ---------- ウェブブラウザの中継（手元専用） ---------- */
const RELAY_MAX = 5 * 1024 * 1024, RELAY_TIMEOUT = 10000, RELAY_HOPS = 5;
const blockedError = () => Object.assign(new Error('つないではいけない住所です'), { code: 'EBLOCKED' });
// つなぐときの名前引きの中で、住所を確かめる（確かめたあとに別の住所へすり替える手口も防ぐ）
const safeLookup = (host, opts, cb) => lookup(host, { ...opts, all: true }, (err, addrs) => {
  if (err) return cb(err);
  if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) return cb(blockedError());
  if (opts.all) cb(null, addrs); else cb(null, addrs[0].address, addrs[0].family);
});
// GET で取りに行く。転送先も1回ごとに確かめ、5回まで。戻り値は最後の応答
function relayGet(target, deadline, hops = 0) {
  return new Promise((done, fail) => {
    let u;
    try { u = new URL(target); } catch { fail(new Error('住所を読めません')); return; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') { fail(new Error('http と https だけを中継します')); return; }
    if (u.username || u.password) { fail(blockedError()); return; }
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && isBlockedAddress(host)) { fail(blockedError()); return; }
    const left = deadline - Date.now();
    if (left <= 0) { fail(new Error('時間切れです')); return; }
    const req = (u.protocol === 'https:' ? httpsRequest : httpRequest)(u, {
      method: 'GET', lookup: safeLookup, signal: AbortSignal.timeout(left),
      headers: { 'user-agent': 'Mozilla/5.0 (Future OS relay)', accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'accept-language': 'ja,en;q=0.8', 'accept-encoding': 'gzip, deflate, br' },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (hops >= RELAY_HOPS) { fail(new Error('転送が多すぎます')); return; }
        done(relayGet(new URL(res.headers.location, u).href, deadline, hops + 1));
        return;
      }
      done({ url: u.href, res });
    });
    req.on('error', fail);
    req.end();
  });
}
async function readBody(res) {
  const enc = String(res.headers['content-encoding'] || '').toLowerCase();
  const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
  const chunks = []; let n = 0;
  for await (const c of stream) { n += c.length; if (n > RELAY_MAX) { res.destroy(); throw new Error('ページが大きすぎます（5MB まで）'); } chunks.push(c); }
  return Buffer.concat(chunks);
}
// 文字コード: 応答の見出し → ページの meta → UTF-8 の順に決める
function decodeHtml(buf, type) {
  let label = /charset=["']?([\w-]+)/i.exec(type || '')?.[1];
  if (!label) {
    const head = buf.subarray(0, 4096).toString('latin1');
    label = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try { return new TextDecoder(label || 'utf-8').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}
async function relay(req, res, url) {
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(body)); };
  // ほかのサイトのページから呼ばれないようにする（専用の見出しと、ブラウザが付ける Sec-Fetch-Site を見る）
  const site = req.headers['sec-fetch-site'];
  if (req.method !== 'GET' || req.headers['x-arcadia-relay'] !== '1' || (site && site !== 'same-origin')) { send(403, { ok: false, error: 'この中継は Future OS のブラウザからだけ使えます' }); return; }
  const mode = url.searchParams.get('mode'), origin = `http://localhost:${PORT}`;
  if (mode === 'ping') { send(200, { ok: true, origin }); return; }
  const target = url.searchParams.get('url') || '';
  let hostName = ''; try { hostName = new URL(target).hostname; } catch { /* 下で失敗する */ }
  try {
    const { url: finalUrl, res: up } = await relayGet(target, Date.now() + RELAY_TIMEOUT);
    const type = String(up.headers['content-type'] || '');
    const blocked = frameBlocked(up.headers, origin);
    const isHtml = /text\/html|application\/xhtml\+xml/i.test(type);
    let html = null;
    if (mode === 'page' && isHtml) html = decodeHtml(await readBody(up), type); else up.destroy();
    send(200, { ok: true, url: finalUrl, status: up.statusCode, type, blocked, html });
    serverLog(`server.relay args={"mode":${JSON.stringify(mode)},"host":${JSON.stringify(hostName)}} result=ok status=${up.statusCode} blocked=${blocked}`);
  } catch (err) {
    const blockedAddr = err.code === 'EBLOCKED';
    send(blockedAddr ? 403 : 502, { ok: false, error: blockedAddr ? 'この住所（手元の機械や家の中のネットワーク）へは中継しません' : err.name === 'TimeoutError' || err.name === 'AbortError' ? '10秒以内に応答がありませんでした' : err.message });
    serverLog(`server.relay args={"mode":${JSON.stringify(mode)},"host":${JSON.stringify(hostName)}} result=${JSON.stringify('error: ' + (err.code || err.message))}`);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__arcadia/relay') { await relay(req, res, url); return; }
    if (url.pathname === '/__arcadia/agent-token') { hub.handleToken(req, res); return; }
    if (req.method === 'POST' && url.pathname === '/__log') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 1e6) break; }
      await appendFile(LOG_FILE, body.endsWith('\n') ? body : body + '\n');
      res.writeHead(204).end();
      return;
    }
    // 確認用: 画面の canvas を画像（data URL）で受け取り、build/shots/<name>.png|jpg に保存する
    if (req.method === 'POST' && url.pathname === '/__shot') {
      const name = (url.searchParams.get('name') || 'shot').replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'shot';
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 12e6) break; }
      const m = /^data:image\/(png|jpeg);base64,(.+)$/s.exec(body);
      if (!m) { res.writeHead(400).end(); return; }
      await mkdir(SHOT_DIR, { recursive: true });
      const out = join(SHOT_DIR, `${name}.${m[1] === 'jpeg' ? 'jpg' : 'png'}`);
      await writeFile(out, Buffer.from(m[2], 'base64'));
      serverLog(`server.shot args={"name":${JSON.stringify(name)}} result=ok`);
      res.writeHead(204).end();
      return;
    }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT + sep) && file !== ROOT) { res.writeHead(403).end(); return; }
    if (file.slice(ROOT.length + 1).split(sep)[0].toLowerCase() === 'runtime') { res.writeHead(403).end(); serverLog(`server.403 args={"path":${JSON.stringify(path)}} result=403`); return; }
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
});
// WebSocket は MCP の中継点だけ
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => socket.destroy());
  if (new URL(req.url, 'http://localhost').pathname === '/__arcadia/agent') hub.handleUpgrade(req, socket, head);
  else socket.destroy();
});
server.listen(PORT, () => {
  console.log(`出来る！ http://localhost:${PORT}/   ログ: ${LOG_FILE}`);
  serverLog(`server.start args={"port":${PORT}} result=ok`);
});
