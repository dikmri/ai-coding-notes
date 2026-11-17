// AI との対話の計算（各社の API の形への変換、返事の読み取り、道具の結果の返し方、誤りの訳、繰り返しの進め方）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../os/js/core/agent-loop.mjs';

const TOOLS = [{ name: 'open_app', description: 'アプリを開く', params: { type: 'object', properties: { appId: { type: 'string' } }, required: ['appId'] } }];
const KEY = 'test-key-0000';

test('提供元: 3社と、それぞれの既定のモデル', () => {
  assert.deepEqual(Object.keys(L.PROVIDERS), ['anthropic', 'openai', 'gemini']);
  for (const p of Object.values(L.PROVIDERS)) { assert.ok(p.label); assert.ok(p.models.length >= 1); }
  assert.equal(L.PROVIDERS.anthropic.models[0], 'claude-sonnet-5-5');
  assert.equal(L.PROVIDERS.openai.models[0], 'gpt-6-astra');
});

test('依頼の形: Claude はブラウザから直接呼ぶ見出しと input_schema、鍵は見出しに入れる', () => {
  const r = L.buildRequest({ provider: 'anthropic', model: 'claude-sonnet-5-5', key: KEY, system: 'S', items: [L.userItem('anthropic', 'こんにちは')], tools: TOOLS });
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.init.headers['x-api-key'], KEY);
  assert.equal(r.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.ok(r.init.headers['anthropic-version']);
  const b = JSON.parse(r.init.body);
  assert.equal(b.system, 'S');
  assert.deepEqual(b.messages, [{ role: 'user', content: 'こんにちは' }]);
  assert.deepEqual(b.tools, [{ name: 'open_app', description: 'アプリを開く', input_schema: TOOLS[0].params }]);
  assert.ok(b.max_tokens > 0);
  assert.ok(!r.url.includes(KEY));
});

test('依頼の形: OpenAI は Responses API。保存しない設定で、推論の中身を返してもらう', () => {
  const r = L.buildRequest({ provider: 'openai', model: 'gpt-6-astra', key: KEY, system: 'S', items: [L.userItem('openai', 'やあ')], tools: TOOLS });
  assert.equal(r.url, 'https://api.openai.com/v1/responses');
  assert.equal(r.init.headers.authorization, 'Bearer ' + KEY);
  const b = JSON.parse(r.init.body);
  assert.equal(b.instructions, 'S');
  assert.deepEqual(b.input, [{ role: 'user', content: 'やあ' }]);
  assert.deepEqual(b.tools, [{ type: 'function', name: 'open_app', description: 'アプリを開く', parameters: TOOLS[0].params }]);
  assert.equal(b.store, false);
  assert.deepEqual(b.include, ['reasoning.encrypted_content']);
});

test('依頼の形: Gemini は鍵を URL に入れず x-goog-api-key で送り、functionDeclarations を使う', () => {
  const r = L.buildRequest({ provider: 'gemini', model: 'gemini-3.8-flash', key: KEY, system: 'S', items: [L.userItem('gemini', 'はい')], tools: TOOLS });
  assert.equal(r.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(r.init.headers['x-goog-api-key'], KEY);
  assert.ok(!r.url.includes(KEY));
  const b = JSON.parse(r.init.body);
  assert.deepEqual(b.systemInstruction, { parts: [{ text: 'S' }] });
  assert.deepEqual(b.contents, [{ role: 'user', parts: [{ text: 'はい' }] }]);
  assert.deepEqual(b.tools, [{ functionDeclarations: [{ name: 'open_app', description: 'アプリを開く', parameters: TOOLS[0].params }] }]);
});

test('返事の読み取り: 3社とも、文・道具の呼び出し・使った量を同じ形にする', () => {
  const a = L.parseReply('anthropic', { content: [{ type: 'text', text: '開きます' }, { type: 'tool_use', id: 'tu1', name: 'open_app', input: { appId: 'notepad' } }], stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 20 } });
  assert.equal(a.text, '開きます');
  assert.deepEqual(a.calls, [{ id: 'tu1', name: 'open_app', args: { appId: 'notepad' } }]);
  assert.deepEqual(a.usage, { input: 100, output: 20 });
  assert.deepEqual(a.items, [{ role: 'assistant', content: [{ type: 'text', text: '開きます' }, { type: 'tool_use', id: 'tu1', name: 'open_app', input: { appId: 'notepad' } }] }]);

  const reasoning = { type: 'reasoning', id: 'rs1', encrypted_content: 'xxx', summary: [] };
  const o = L.parseReply('openai', { output: [reasoning, { type: 'function_call', id: 'fc1', call_id: 'call1', name: 'open_app', arguments: '{"appId":"notepad"}' }], usage: { input_tokens: 50, output_tokens: 10 } });
  assert.equal(o.text, '');
  assert.deepEqual(o.calls, [{ id: 'call1', name: 'open_app', args: { appId: 'notepad' } }]);
  assert.equal(o.items.length, 2); // 推論の項目も、そのまま次の依頼へ返す
  const o2 = L.parseReply('openai', { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '終わりました' }] }], usage: { input_tokens: 5, output_tokens: 3 } });
  assert.equal(o2.text, '終わりました');
  assert.deepEqual(o2.calls, []);

  const sig = 'sig-abc';
  const g = L.parseReply('gemini', { candidates: [{ content: { role: 'model', parts: [{ text: '考え中', thought: true }, { text: '開きますね' }, { functionCall: { id: 'g1', name: 'open_app', args: { appId: 'notepad' } }, thoughtSignature: sig }] } }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 7, thoughtsTokenCount: 5 } });
  assert.equal(g.text, '開きますね'); // 考える過程の文は出さない
  assert.deepEqual(g.calls, [{ id: 'g1', name: 'open_app', args: { appId: 'notepad' } }]);
  assert.deepEqual(g.usage, { input: 30, output: 12 });
  assert.equal(g.items[0].parts[2].thoughtSignature, sig); // 署名を壊さず履歴に残す
});

test('道具の結果の返し方: 呼び出しの番号に合わせ、失敗は失敗として返す', () => {
  const calls = [{ id: 'c1', name: 'open_app', args: {} }, { id: 'c2', name: 'read_file', args: {} }];
  const results = [{ ok: true, result: { windowId: 'w2' } }, { ok: false, error: 'ありません' }];
  assert.deepEqual(L.resultItems('anthropic', calls, results), [{ role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'c1', content: '{"windowId":"w2"}', is_error: false },
    { type: 'tool_result', tool_use_id: 'c2', content: 'うまくいきませんでした: ありません', is_error: true },
  ] }]);
  assert.deepEqual(L.resultItems('openai', calls, results), [
    { type: 'function_call_output', call_id: 'c1', output: '{"windowId":"w2"}' },
    { type: 'function_call_output', call_id: 'c2', output: 'うまくいきませんでした: ありません' },
  ]);
  assert.deepEqual(L.resultItems('gemini', calls, results), [{ role: 'user', parts: [
    { functionResponse: { id: 'c1', name: 'open_app', response: { result: { windowId: 'w2' } } } },
    { functionResponse: { id: 'c2', name: 'read_file', response: { error: 'ありません' } } },
  ] }]);
});

test('誤りの訳: 何が起きたかと、どうすればよいかを日本語で返し、鍵らしい文字は伏せる', () => {
  assert.match(L.errorText(401, {}, { model: 'm' }), /鍵/);
  assert.match(L.errorText(404, {}, { model: 'nai-model' }), /nai-model/);
  assert.match(L.errorText(429, {}), /上限/);
  assert.match(L.errorText(529, {}), /混み合って/);
  assert.match(L.errorText(0, null), /つながりませんでした/);
  const t = L.errorText(400, { error: { message: 'bad key sk-ant-api03-ABCDEFGHIJKLMNOPQRST' } });
  assert.ok(!t.includes('ABCDEFGHIJ'), t);
});

// 台本どおりに答える偽の fetch
const fakeFetch = (replies, seen = []) => async (url, init) => {
  seen.push({ url, body: JSON.parse(init.body), signal: init.signal });
  const r = replies.shift();
  return { ok: r.status === undefined || r.status < 400, status: r.status || 200, json: async () => r.body };
};

test('繰り返し: 道具を呼んで結果を返し、最後の文で終わる。使った量を足す', async () => {
  const seen = [], called = [];
  const fetch = fakeFetch([
    { body: { content: [{ type: 'tool_use', id: 't1', name: 'open_app', input: { appId: 'notepad' } }], usage: { input_tokens: 10, output_tokens: 5 } } },
    { body: { content: [{ type: 'text', text: 'メモ帳を開きました。' }], usage: { input_tokens: 20, output_tokens: 6 } } },
  ], seen);
  const r = await L.runTurn({ provider: 'anthropic', model: 'claude-sonnet-5-5', key: KEY, system: 'S', items: [], tools: TOOLS, userText: 'メモ帳を開いて', fetch, call: async (name, args) => { called.push([name, args]); return { ok: true, result: { windowId: 'w2' } }; } });
  assert.deepEqual(called, [['open_app', { appId: 'notepad' }]]);
  assert.equal(r.text, 'メモ帳を開きました。');
  assert.deepEqual(r.usage, { input: 30, output: 11 });
  assert.equal(r.steps, 2);
  assert.equal(r.items.length, 4); // 依頼・呼び出し・結果・答え
  assert.equal(seen[1].body.messages[2].content[0].type, 'tool_result');
});

test('繰り返し: 上限の回数に達したら確かめ、断られたらそこで止める', async () => {
  const loop = { content: [{ type: 'tool_use', id: 't', name: 'open_app', input: { appId: 'x' } }], usage: { input_tokens: 1, output_tokens: 1 } };
  let asked = 0;
  const r = await L.runTurn({ provider: 'anthropic', model: 'm', key: KEY, system: 'S', items: [], tools: TOOLS, userText: 'ずっと', maxSteps: 3, fetch: fakeFetch(Array.from({ length: 5 }, () => ({ body: loop }))), call: async () => ({ ok: true, result: {} }), confirmMore: async (n) => { asked = n; return false; } });
  assert.equal(asked, 3);
  assert.equal(r.steps, 3);
  assert.equal(r.limited, true);
});

test('繰り返し: 止めたら、答えの出ていない呼び出しに「止めました」を返して履歴を整える', async () => {
  const ctrl = new AbortController();
  const r = await L.runTurn({ provider: 'anthropic', model: 'm', key: KEY, system: 'S', items: [], tools: TOOLS, userText: 'やって', signal: ctrl.signal,
    fetch: fakeFetch([{ body: { content: [{ type: 'tool_use', id: 't1', name: 'open_app', input: { appId: 'x' } }, { type: 'tool_use', id: 't2', name: 'open_app', input: { appId: 'y' } }], usage: { input_tokens: 1, output_tokens: 1 } } }]),
    call: async () => { ctrl.abort(); return { ok: false, error: '利用者が止めました' }; } });
  assert.equal(r.stopped, true);
  const last = r.items[r.items.length - 1];
  assert.equal(last.role, 'user');
  assert.deepEqual(last.content.map((c) => c.tool_use_id), ['t1', 't2']); // どの呼び出しにも答えがある
});

test('繰り返し: API の誤りは、訳した文の Error にする', async () => {
  await assert.rejects(L.runTurn({ provider: 'openai', model: 'gpt-6-astra', key: KEY, system: 'S', items: [], tools: TOOLS, userText: 'x', fetch: fakeFetch([{ status: 401, body: { error: { message: 'Incorrect API key' } } }]), call: async () => ({ ok: true }) }), /鍵/);
  const failing = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(L.runTurn({ provider: 'gemini', model: 'g', key: KEY, system: 'S', items: [], tools: TOOLS, userText: 'x', fetch: failing, call: async () => ({ ok: true }) }), /つながりませんでした/);
});
