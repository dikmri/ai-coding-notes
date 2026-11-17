// MCP（Model Context Protocol）の受け答えと、橋渡しの接続を受けてよい相手の確かめ。
// tools/mcp-bridge.mjs が標準入出力で受けた JSON-RPC を handle に通す。道具を動かすのはブラウザの中の OS（ctx.call）。

// 受け付ける版。相手が知らない版を言ってきたら、こちらの新しい版で答える（MCP の決まり）
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS = [
  'ブラウザで開いている Future OS（手元の node tools/serve.mjs で配信したもの）を操作します。',
  'まず get_desktop_state で窓とアプリの一覧を見て、inspect_window で窓の中の部品と参照番号（r1 など）を読んでから、click_element や input_text で操作してください。',
  '参照番号は inspect_window を呼ぶたびに振り直されます。窓の中が変わったら読み直してください。',
  'ファイルを消す・別の中身へ書き換える・外の住所を開く操作は、画面で利用者が許可するまで待ちます。利用者が断ったときは、その操作はしていません。',
].join('\n');

// ページの Origin が、同じ番号で配信している手元の OS かどうか
export function originAllowed(origin, port) {
  if (typeof origin !== 'string') return false;
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
}

const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

// JSON-RPC の1通に答える。知らせ（id のない通）には null を返す（返事をしない）。
// ctx: { tools: core/agent.mjs の TOOLS, call: async (name, args) => ({ ok, result } | { ok: false, error }) }
export async function handle(msg, ctx) {
  const hasId = msg && typeof msg === 'object' && 'id' in msg && msg.id !== null;
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return hasId ? fail(msg.id, -32600, '形の正しくない依頼です') : null;
  if (!hasId) return null;
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return reply(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'future-os', title: 'Future OS', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return reply(id, {});
    case 'tools/list': return reply(id, { tools: ctx.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.params })) });
    case 'tools/call': {
      if (typeof params?.name !== 'string') return fail(id, -32602, '道具の名前（name）がありません');
      const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      let r;
      try { r = await ctx.call(params.name, args); } catch (e) { r = { ok: false, error: e.message }; }
      if (r?.ok) {
        const text = typeof r.result === 'string' ? r.result : JSON.stringify(r.result ?? null);
        return reply(id, { content: [{ type: 'text', text }], isError: false });
      }
      return reply(id, { content: [{ type: 'text', text: String(r?.error || '道具が失敗しました') }], isError: true });
    }
    default: return fail(id, -32601, `知らない方法です: ${method}`);
  }
}
