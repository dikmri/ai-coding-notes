#!/usr/bin/env node
// Future OS の MCP の橋渡し: AI の道具（Claude Code・Claude Desktop・Gemini CLI など）から、ブラウザの中の Future OS を操作する。
// 使い方: node tools/mcp-bridge.mjs --port 8780
//   先に node tools/serve.mjs 8780 で OS を配信し、ブラウザで開いて、AI アシスタントの窓の「MCP からの操作を受け付ける」に印を付ける。
//   AI の道具への登録の例（Claude Code）: claude mcp add future-os -- node <このフォルダ>/tools/mcp-bridge.mjs --port 8780
// しくみ: AI の道具 ⇄（標準入出力、改行区切りの JSON-RPC）⇄ この橋渡し ⇄（WebSocket）⇄ serve.mjs の中継点 ⇄ ブラウザの OS
// 標準出力は MCP の通り道なので、人に向けた文は標準エラーと logs/mcp-bridge.log へ書く
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS, maskSecrets } from '../os/js/core/agent.mjs';
import { handle } from './lib/mcp.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const PORT = Number(argv[argv.indexOf('--port') + 1] || process.env.PORT || 8765) || 8765;
const LOG_DIR = join(ROOT, 'logs'), LOG_FILE = join(LOG_DIR, 'mcp-bridge.log');
const CALL_MS = 6 * 60 * 1000;
await mkdir(LOG_DIR, { recursive: true });
const log = (event, args, result) => appendFile(LOG_FILE, `${new Date().toISOString()} bridge.${event} args=${JSON.stringify(args)} result=${JSON.stringify(result)}\n`).catch(() => {});
const say = (text) => process.stderr.write(`[future-os] ${text}\n`);

/* ---------- serve.mjs の中継点とのつながり ---------- */
let ws = null, opened = null, pageLinked = false, client = '', seq = 0, retryTimer = 0, retryMs = 1000;
const pending = new Map();
const NOT_SERVED = `Future OS の配信とつながっていません。node tools/serve.mjs ${PORT} を動かしてから、もう一度試してください。`;

async function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return opened;
  let token;
  try { token = JSON.parse(await readFile(join(ROOT, 'runtime', `agent-${PORT}.json`), 'utf8')).token; } catch { token = null; }
  if (!token) { scheduleRetry(); return false; }
  const sock = new WebSocket(`ws://127.0.0.1:${PORT}/__arcadia/agent?role=bridge`);
  ws = sock;
  opened = new Promise((done) => {
    sock.addEventListener('open', () => {
      sock.send(JSON.stringify({ type: 'hello', token, client }));
      retryMs = 1000;
      log('connect', { port: PORT }, 'ok'); say(`配信（${PORT} 番）とつながりました。`);
      done(true);
    });
    sock.addEventListener('error', () => done(false));
  });
  sock.addEventListener('message', (e) => {
    let msg; try { msg = JSON.parse(String(e.data)); } catch { return; }
    if (msg.type === 'status') {
      if (msg.page !== pageLinked) say(msg.page ? 'Future OS の画面とつながりました。' : 'Future OS の画面とのつながりが切れました。');
      pageLinked = !!msg.page;
      return;
    }
    if (msg.type === 'result' && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer);
      p.done(msg.ok ? { ok: true, result: msg.result } : { ok: false, error: msg.error });
    }
  });
  sock.addEventListener('close', () => {
    if (ws === sock) { ws = null; pageLinked = false; }
    for (const [id, p] of pending) { clearTimeout(p.timer); pending.delete(id); p.done({ ok: false, error: '配信とのつながりが切れました。操作が終わったかどうかは分かりません。' }); }
    scheduleRetry();
  });
  return opened;
}
function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => { retryTimer = 0; connect(); }, retryMs);
  retryMs = Math.min(10000, retryMs * 2);
}

// 道具を1つ、画面の OS で動かす
async function call(name, args) {
  const t0 = Date.now(), keys = Object.keys(args || {});
  if (!(ws?.readyState === 1 || (await connect()))) { log('call', { tool: name, keys }, 'error: not-served'); return { ok: false, error: NOT_SERVED }; }
  const id = ++seq;
  const r = await new Promise((done) => {
    const timer = setTimeout(() => { pending.delete(id); done({ ok: false, error: '6 分たっても答えがありませんでした。' }); }, CALL_MS);
    pending.set(id, { done, timer });
    ws.send(JSON.stringify({ type: 'call', id, name, args: args || {} }));
  });
  log('call', { tool: name, keys, ms: Date.now() - t0 }, r.ok ? 'ok' : 'error: ' + maskSecrets(String(r.error)).slice(0, 200));
  return r;
}

/* ---------- AI の道具との受け答え（標準入出力） ---------- */
const out = (msg) => { if (msg) process.stdout.write(JSON.stringify(msg) + '\n'); };
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON として読めません' } }); return; }
  if (msg?.method === 'initialize') {
    client = String(msg.params?.clientInfo?.name || '').slice(0, 60);
    log('initialize', { client, protocolVersion: msg.params?.protocolVersion }, 'ok');
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'client', name: client }));
  }
  // 1通ずつ待たずに答える（時間のかかる道具の間も ping に答えられるように）
  out(await handle(msg, { tools: TOOLS, call }));
});
rl.on('close', () => { log('stop', { port: PORT }, 'ok'); process.exit(0); });

say(`Future OS の MCP の橋渡しを始めます（配信の番号: ${PORT}、記録: ${LOG_FILE}）。`);
log('start', { port: PORT }, 'ok');
connect();
