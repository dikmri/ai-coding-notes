// MCP の橋渡しの中継点（tools/serve.mjs の中で動く）。
// AI の道具 → tools/mcp-bridge.mjs →（WebSocket）→ ここ →（WebSocket）→ ブラウザの中の Future OS（assistant/mcp.mjs）
// 守ること:
//  - この機械の中からの接続だけを受ける（接続元の住所と Host 見出し。Host を見るのは、ほかのサイトの名前を手元へ向け直す手口を防ぐため）
//  - ページの接続は、Origin が同じ番号の手元の OS のときだけ受ける
//  - 合言葉（トークン）は runtime/agent-<番号>.json に置く（配信しない）。ページは同じ出どころからだけ取りに来られる。
//    合言葉は URL に入れず、つないだあとの最初の通信（hello）で送ってもらう
//  - 記録には道具の名前と引数の名前だけを書き、中身（ファイルの文など）は書かない
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { acceptKey, encodeFrame, decodeFrames } from './ws.mjs';
import { originAllowed } from './mcp.mjs';
import { maskSecrets } from '../../os/js/core/agent.mjs';

const MAX_MESSAGE = 8 * 1024 * 1024, HELLO_MS = 5000, CALL_MS = 5 * 60 * 1000;
export const NO_PAGE = 'Future OS の画面とつながっていません。ブラウザで Future OS を開き、AI アシスタントの窓で「MCP からの操作を受け付ける」に印を付けてください。';

export async function createAgentHub({ port, root, log }) {
  const token = randomBytes(24).toString('hex');
  const file = join(root, 'runtime', `agent-${port}.json`);
  await mkdir(join(root, 'runtime'), { recursive: true });
  await writeFile(file, JSON.stringify({ port, token, pid: process.pid, started: new Date().toISOString() }) + '\n');
  const tokenOk = (t) => typeof t === 'string' && t.length === token.length && timingSafeEqual(Buffer.from(t), Buffer.from(token));
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && hosts.has(String(req.headers.host || '').toLowerCase());

  const pages = [], bridges = new Set(), pending = new Map();
  let seq = 0;
  const currentPage = () => pages[pages.length - 1] || null;
  function notify() {
    const clients = [...bridges].map((b) => b.client || 'AI の道具');
    for (const p of pages) p.send({ type: 'status', bridges: bridges.size, clients });
    for (const b of bridges) b.send({ type: 'status', page: !!currentPage() });
  }

  // ページが合言葉を取りに来る（GET、同じ出どころの fetch だけ）
  function handleToken(req, res) {
    const send = (status, body) => res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(body));
    if (req.method !== 'GET' || !isLocal(req) || req.headers['x-arcadia-relay'] !== '1' || req.headers['sec-fetch-site'] !== 'same-origin') {
      send(403, { ok: false, error: 'この機械の Future OS からだけ使えます' });
      log(`server.agent.token args={} result=denied`);
      return;
    }
    send(200, { ok: true, token, port, root });
  }

  // WebSocket の接続を受ける。role=page（ブラウザの OS）か role=bridge（tools/mcp-bridge.mjs）
  function handleUpgrade(req, socket, head) {
    const url = new URL(req.url, 'http://localhost');
    const role = url.searchParams.get('role'), origin = req.headers.origin;
    const refuse = (why) => { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); log(`server.agent.connect args={"role":${JSON.stringify(role)}} result=${JSON.stringify('denied: ' + why)}`); };
    if (!isLocal(req)) return refuse('not-local');
    if (role !== 'page' && role !== 'bridge') return refuse('role');
    // ページはブラウザなので Origin が必ず付く。橋渡し（Node）は付けないか、付けても手元の OS
    if (role === 'page' ? !originAllowed(origin, port) : origin !== undefined && !originAllowed(origin, port)) return refuse('origin');
    const key = req.headers['sec-websocket-key'];
    if (!key || req.headers['sec-websocket-version'] !== '13') return refuse('version');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
    const conn = wsConn(socket, head);
    let ok = false;
    const helloTimer = setTimeout(() => { if (!ok) conn.close(1008); }, HELLO_MS);
    conn.on('message', (text) => {
      let msg; try { msg = JSON.parse(text); } catch { return; }
      if (!ok) {
        clearTimeout(helloTimer);
        if (msg.type !== 'hello' || !tokenOk(msg.token)) { log(`server.agent.connect args={"role":"${role}"} result="denied: token"`); conn.close(1008); return; }
        ok = true;
        if (role === 'page') pages.push(conn); else { conn.client = String(msg.client || '').slice(0, 60); bridges.add(conn); }
        log(`server.agent.connect args={"role":"${role}"} result=ok`);
        notify();
        return;
      }
      if (role === 'bridge') fromBridge(conn, msg); else fromPage(conn, msg);
    });
    conn.on('close', () => {
      clearTimeout(helloTimer);
      if (!ok) return;
      if (role === 'page') {
        const i = pages.indexOf(conn); if (i >= 0) pages.splice(i, 1);
        for (const [cid, p] of pending) if (p.page === conn) { finish(cid, { ok: false, error: 'Future OS の画面が閉じられました。操作が終わったかどうかは分かりません。' }); }
      } else {
        bridges.delete(conn);
        for (const [cid, p] of pending) if (p.bridge === conn) { clearTimeout(p.timer); pending.delete(cid); }
      }
      log(`server.agent.disconnect args={"role":"${role}"} result=ok`);
      notify();
    });
  }

  function fromBridge(bridge, msg) {
    if (msg.type === 'client') { bridge.client = String(msg.name || '').slice(0, 60); notify(); return; }
    if (msg.type !== 'call' || typeof msg.name !== 'string') return;
    const keys = Object.keys(msg.args || {});
    const page = currentPage();
    if (!page) {
      bridge.send({ type: 'result', id: msg.id, ok: false, error: NO_PAGE });
      log(`server.agent.call args={"tool":${JSON.stringify(msg.name)},"keys":${JSON.stringify(keys)}} result="error: no-page"`);
      return;
    }
    const cid = ++seq;
    const timer = setTimeout(() => finish(cid, { ok: false, error: '5 分たっても終わりませんでした。画面で確かめのダイアログが出ていないか見てください。' }), CALL_MS);
    pending.set(cid, { bridge, page, id: msg.id, name: msg.name, keys, timer });
    page.send({ type: 'call', id: cid, name: msg.name, args: msg.args || {} });
  }
  function fromPage(page, msg) {
    if (msg.type !== 'result') return;
    const p = pending.get(msg.id);
    if (!p || p.page !== page) return;
    finish(msg.id, msg.ok ? { ok: true, result: msg.result } : { ok: false, error: String(msg.error || '道具が失敗しました') });
  }
  function finish(cid, r) {
    const p = pending.get(cid);
    if (!p) return;
    clearTimeout(p.timer); pending.delete(cid);
    p.bridge.send({ type: 'result', id: p.id, ...r });
    log(`server.agent.call args={"tool":${JSON.stringify(p.name)},"keys":${JSON.stringify(p.keys)}} result=${r.ok ? 'ok' : JSON.stringify('error: ' + maskSecrets(r.error).slice(0, 200))}`);
  }

  return { handleToken, handleUpgrade, isLocal, file };
}

// 受けた WebSocket の接続（サーバーの側）。届いた文字の通信を 'message' で渡す
function wsConn(socket, head) {
  const em = new EventEmitter();
  let buf = head?.length ? Buffer.from(head) : Buffer.alloc(0), parts = null, size = 0, closed = false;
  const close = (code = 1000) => {
    if (closed) return; closed = true;
    const b = Buffer.alloc(2); b.writeUInt16BE(code);
    try { socket.end(encodeFrame(b, { opcode: 8 })); } catch { socket.destroy(); }
  };
  socket.setNoDelay(true);
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    let r;
    try { r = decodeFrames(buf, { maxPayload: MAX_MESSAGE }); } catch { socket.destroy(); return; }
    buf = Buffer.from(r.rest);
    for (const f of r.frames) {
      if (!f.masked) { close(1002); return; } // 手元の機械からの枠は、覆い（mask）付きの決まり
      if (f.opcode === 8) { close(1000); return; }
      if (f.opcode === 9) { socket.write(encodeFrame(f.payload, { opcode: 10 })); continue; }
      if (f.opcode === 10) continue;
      if (f.opcode === 1 || f.opcode === 2) { parts = []; size = 0; }
      if (!parts) continue;
      parts.push(f.payload); size += f.payload.length;
      if (size > MAX_MESSAGE) { close(1009); return; }
      if (f.fin) { const text = Buffer.concat(parts).toString('utf8'); parts = null; em.emit('message', text); }
    }
  });
  socket.on('close', () => { closed = true; em.emit('close'); });
  socket.on('error', () => socket.destroy());
  em.send = (obj) => { if (!closed && !socket.destroyed) socket.write(encodeFrame(JSON.stringify(obj))); };
  em.close = close;
  return em;
}
