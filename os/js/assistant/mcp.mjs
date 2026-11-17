// MCP の橋渡しの、ブラウザの側。手元の serve.mjs の中継点（/__arcadia/agent）と WebSocket でつなぎ、
// AI の道具から届いた道具の呼び出しを、イコちゃんの agent.call に1つずつ渡す（同時に2つの操作が画面で混ざらないように）。
// 公開版（GitHub Pages）には中継点がないので使えない。手元で node tools/serve.mjs を動かしたときだけ使える。
import { getAgent } from './agent.mjs';

let os = null, ws = null, wanted = false, retryMs = 1000, retryTimer = 0, chain = Promise.resolve();
let state = 'off', bridges = 0, clients = [], info = null;
export const events = new EventTarget();
const set = (s) => { state = s; events.dispatchEvent(new CustomEvent('state', { detail: status() })); };
// state: off（切っている）/ unavailable（中継点がない）/ connecting / waiting（中継点とつながり、AI の道具を待っている）/ linked（AI の道具とつながっている）/ retry
export function status() { return { state, bridges, clients: [...clients], root: info?.root || '', port: info?.port || Number(location.port) || 0 }; }

// 手元の配信かどうか（公開版では中継点を探しに行かない）
export const localHost = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && location.protocol === 'http:';

async function fetchToken() {
  if (!localHost()) return null;
  try {
    const r = await fetch('/__arcadia/agent-token', { headers: { 'x-arcadia-relay': '1' }, cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j.ok ? j : null;
  } catch { return null; }
}
// 中継点があるか（アシスタントの窓が、印を押せるかどうかを決めるのに使う）
export async function available() { info = await fetchToken(); return !!info; }

export async function start(theOs) {
  os = theOs; wanted = true;
  if (ws) return;
  await connect();
}
export function stop() {
  wanted = false; clearTimeout(retryTimer); retryTimer = 0;
  if (ws) { const w = ws; ws = null; w.close(); }
  bridges = 0; clients = [];
  os?.log('mcp.stop', {}, 'ok');
  set('off');
}

async function connect() {
  if (!wanted) return;
  set('connecting');
  info = await fetchToken();
  if (!info) { os.log('mcp.connect', {}, 'unavailable'); set('unavailable'); return; }
  const sock = new WebSocket(`ws://${location.host}/__arcadia/agent?role=page`);
  ws = sock;
  sock.addEventListener('open', () => {
    sock.send(JSON.stringify({ type: 'hello', token: info.token }));
    retryMs = 1000;
    os.log('mcp.connect', { port: info.port }, 'ok');
    set('waiting');
  });
  sock.addEventListener('message', (e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'status') { bridges = msg.bridges || 0; clients = msg.clients || []; set(bridges ? 'linked' : 'waiting'); return; }
    if (msg.type === 'call') {
      // 1つずつ順に動かす
      chain = chain.then(async () => {
        const r = await getAgent(os).call(String(msg.name), msg.args || {}, { source: 'mcp' });
        if (ws === sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: 'result', id: msg.id, ...r }));
      }).catch((err) => { os.log('mcp.call', { tool: msg.name }, 'error: ' + err.message); });
    }
  });
  sock.addEventListener('close', () => {
    if (ws !== sock) return;
    ws = null; bridges = 0; clients = [];
    os.log('mcp.disconnect', {}, wanted ? 'retry' : 'ok');
    if (!wanted) { set('off'); return; }
    set('retry');
    retryTimer = setTimeout(() => { retryTimer = 0; connect(); }, retryMs);
    retryMs = Math.min(15000, retryMs * 2);
  });
}

// 状態を、窓の下の欄に出す短い文にする
export function label(s = status()) {
  return {
    off: 'MCP: 受け付けていません',
    unavailable: 'MCP: 使えません',
    connecting: 'MCP: つないでいます…',
    waiting: 'MCP: AI の道具を待っています',
    linked: `MCP: つながっています${s.clients.length ? `（${s.clients.join('、')}）` : ''}`,
    retry: 'MCP: つなぎ直しています…',
  }[s.state] || 'MCP: ' + s.state;
}
