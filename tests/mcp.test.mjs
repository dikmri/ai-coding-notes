// MCP の橋渡しの計算（WebSocket の手順と枠、MCP の受け答え、Origin の確かめ）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as WS from '../tools/lib/ws.mjs';
import * as M from '../tools/lib/mcp.mjs';

test('WebSocket: 手順の返事の鍵（RFC 6455 の例）', () => {
  assert.equal(WS.acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('WebSocket: 文字の枠を組み立てて読み取る（覆いあり・なし、長さ 125 / 126 / 65536 の境目）', () => {
  for (const text of ['光', 'a'.repeat(125), 'b'.repeat(126), 'c'.repeat(70000)]) {
    for (const mask of [false, true]) {
      const buf = WS.encodeFrame(text, { mask });
      const r = WS.decodeFrames(buf);
      assert.equal(r.frames.length, 1);
      assert.equal(r.frames[0].opcode, 1);
      assert.equal(r.frames[0].text, text);
      assert.equal(r.rest.length, 0);
    }
  }
});

test('WebSocket: 途中までの枠は残りとして返し、2つ続きの枠は2つとも読む', () => {
  const a = WS.encodeFrame('一つ目', { mask: true }), b = WS.encodeFrame('二つ目', { mask: true });
  const both = Buffer.concat([a, b]);
  const r1 = WS.decodeFrames(both.subarray(0, a.length + 3));
  assert.deepEqual(r1.frames.map((f) => f.text), ['一つ目']);
  assert.equal(r1.rest.length, 3);
  const r2 = WS.decodeFrames(Buffer.concat([r1.rest, both.subarray(a.length + 3)]));
  assert.deepEqual(r2.frames.map((f) => f.text), ['二つ目']);
});

test('Origin: 手元の OS（localhost と 127.0.0.1 の同じ番号）だけを受ける', () => {
  assert.equal(M.originAllowed('http://localhost:8780', 8780), true);
  assert.equal(M.originAllowed('http://127.0.0.1:8780', 8780), true);
  assert.equal(M.originAllowed('http://localhost:8781', 8780), false);
  assert.equal(M.originAllowed('https://evil.example', 8780), false);
  assert.equal(M.originAllowed('http://localhost.evil.example:8780', 8780), false);
  assert.equal(M.originAllowed(undefined, 8780), false);
  assert.equal(M.originAllowed('null', 8780), false);
});

test('MCP: initialize・tools/list・ping・知らない方法・知らせには返事をしない', async () => {
  const tools = [{ name: 'open_app', description: 'アプリを開く', params: { type: 'object', properties: { appId: { type: 'string' } }, required: ['appId'] } }];
  const ctx = { tools, call: async () => ({ ok: true, result: {} }) };
  const init = await M.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }, ctx);
  assert.equal(init.id, 1); assert.equal(init.result.protocolVersion, '2025-06-18'); assert.ok(init.result.capabilities.tools); assert.equal(init.result.serverInfo.name, 'future-os');
  const list = await M.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx);
  assert.deepEqual(list.result.tools, [{ name: 'open_app', description: 'アプリを開く', inputSchema: tools[0].params }]);
  assert.deepEqual((await M.handle({ jsonrpc: '2.0', id: 3, method: 'ping' }, ctx)).result, {});
  assert.equal((await M.handle({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, ctx)).error.code, -32601);
  assert.equal(await M.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx), null);
});

test('MCP: tools/call は OS へ渡し、結果を文にして返す。失敗は isError', async () => {
  const seen = [];
  const ctx = { tools: [], call: async (name, args) => { seen.push([name, args]); return name === 'bad' ? { ok: false, error: '窓がありません' } : { ok: true, result: { windowId: 'w3' } }; } };
  const ok = await M.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'open_app', arguments: { appId: 'notepad' } } }, ctx);
  assert.deepEqual(seen[0], ['open_app', { appId: 'notepad' }]);
  assert.equal(ok.result.isError, false);
  assert.deepEqual(JSON.parse(ok.result.content[0].text), { windowId: 'w3' });
  const ng = await M.handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'bad', arguments: {} } }, ctx);
  assert.equal(ng.result.isError, true);
  assert.match(ng.result.content[0].text, /窓がありません/);
});
