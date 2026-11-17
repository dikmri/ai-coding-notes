// AI との対話の計算: 道具の一覧を各社の API の形に変え、依頼を組み立て、返事を同じ形に読み、道具の結果を返し、
// 最後の文が出るか上限の回数に達するまで繰り返す。fetch と道具の実行（call）は外から渡す（テストでは偽物を渡す）。
// 鍵は見出しにだけ入れ、URL には入れない。誤りの文は日本語に訳し、鍵らしい文字は伏せる。
import { maskSecrets } from './agent.mjs';

export const PROVIDERS = {
  anthropic: { label: 'Claude（Anthropic）', short: 'Claude', models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'], keyHint: 'sk-ant-', keyPage: 'https://console.anthropic.com/' },
  openai: { label: 'ChatGPT（OpenAI）', short: 'ChatGPT', models: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-5.6-terra'], keyHint: 'sk-', keyPage: 'https://platform.openai.com/' },
  gemini: { label: 'Gemini（Google）', short: 'Gemini', models: ['gemini-3.8-flash', 'gemini-4-carbon', 'gemini-4-argon', 'gemini-4-hydrogen'], keyHint: 'AIza', keyPage: 'https://aistudio.google.com/' },
};
const MAX_TOKENS = 4096;

// 利用者の文を、各社の履歴の1項目にする
export function userItem(provider, text) {
  return provider === 'gemini' ? { role: 'user', parts: [{ text }] } : { role: 'user', content: text };
}

function toolSpecs(provider, tools) {
  if (provider === 'anthropic') return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.params }));
  if (provider === 'openai') return tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.params }));
  return [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.params })) }];
}

// 依頼を組み立てる。戻り値は fetch(url, init) にそのまま渡せる形
export function buildRequest({ provider, model, key, system, items, tools, maxTokens = MAX_TOKENS }) {
  const json = { 'content-type': 'application/json' };
  if (provider === 'anthropic') {
    return { url: 'https://api.anthropic.com/v1/messages', init: { method: 'POST', headers: { ...json, 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: items, tools: toolSpecs(provider, tools) }) } };
  }
  if (provider === 'openai') {
    // 会話を OpenAI の側に残さない（store: false）。推論の項目は暗号にした中身ごと返してもらい、次の依頼で返す
    return { url: 'https://api.openai.com/v1/responses', init: { method: 'POST', headers: { ...json, authorization: 'Bearer ' + key }, body: JSON.stringify({ model, instructions: system, input: items, tools: toolSpecs(provider, tools), store: false, include: ['reasoning.encrypted_content'], max_output_tokens: maxTokens }) } };
  }
  return { url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, init: { method: 'POST', headers: { ...json, 'x-goog-api-key': key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: items, tools: toolSpecs(provider, tools), generationConfig: { maxOutputTokens: maxTokens } }) } };
}

const parseArgs = (s) => { try { const v = typeof s === 'string' ? JSON.parse(s || '{}') : s; return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

// 返事を読む。戻り値: { text, calls: [{ id, name, args }], items: 履歴へ足す項目, usage: { input, output } }
export function parseReply(provider, j) {
  if (provider === 'anthropic') {
    const content = j?.content || [];
    return {
      text: content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim(),
      calls: content.filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id, name: c.name, args: c.input || {} })),
      items: [{ role: 'assistant', content }],
      usage: { input: (j?.usage?.input_tokens || 0) + (j?.usage?.cache_read_input_tokens || 0) + (j?.usage?.cache_creation_input_tokens || 0), output: j?.usage?.output_tokens || 0 },
    };
  }
  if (provider === 'openai') {
    const out = j?.output || [];
    return {
      text: out.filter((o) => o.type === 'message').flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('\n').trim(),
      calls: out.filter((o) => o.type === 'function_call').map((o) => ({ id: o.call_id, name: o.name, args: parseArgs(o.arguments) })),
      items: out,
      usage: { input: j?.usage?.input_tokens || 0, output: j?.usage?.output_tokens || 0 },
    };
  }
  const content = j?.candidates?.[0]?.content || { role: 'model', parts: [] };
  const parts = content.parts || [];
  const u = j?.usageMetadata || {};
  return {
    text: parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('\n').trim(),
    calls: parts.filter((p) => p.functionCall).map((p) => ({ id: p.functionCall.id, name: p.functionCall.name, args: p.functionCall.args || {} })),
    items: [{ ...content, role: 'model' }],
    usage: { input: u.promptTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) },
  };
}

const resultText = (r) => (r.ok ? (typeof r.result === 'string' ? r.result : JSON.stringify(r.result ?? null)) : 'うまくいきませんでした: ' + r.error);
// 道具の結果を、呼び出しの番号に合わせて履歴の項目にする
export function resultItems(provider, calls, results) {
  if (provider === 'anthropic') return [{ role: 'user', content: calls.map((c, i) => ({ type: 'tool_result', tool_use_id: c.id, content: resultText(results[i]), is_error: !results[i].ok })) }];
  if (provider === 'openai') return calls.map((c, i) => ({ type: 'function_call_output', call_id: c.id, output: resultText(results[i]) }));
  return [{ role: 'user', parts: calls.map((c, i) => ({ functionResponse: { ...(c.id ? { id: c.id } : {}), name: c.name, response: results[i].ok ? { result: results[i].result ?? null } : { error: results[i].error } } })) }];
}

// API の誤りを、何が起きたかとどうすればよいかの日本語にする
export function errorText(status, body, { model = '' } = {}) {
  const raw = maskSecrets(String(body?.error?.message || body?.message || '')).slice(0, 200);
  if (!status) return 'AI のサーバーにつながりませんでした。インターネットにつながっているか確かめてください。';
  if (status === 401 || status === 403) return '鍵が正しくないか、使えない状態です。「設定」の「AI」のタブで鍵を確かめてください。';
  if (status === 404) return `モデル「${model}」が見つかりません。「設定」の「AI」のタブで、モデルの名前を確かめてください。`;
  if (status === 429) return '使える量の上限になりました。しばらく待つか、各社のサイトで残高や上限を確かめてください。';
  if (status === 529 || status >= 500) return 'AI のサーバーが混み合っているか、問題が起きています。少し待ってから、もう一度送ってください。';
  return `AI に送った内容が受け付けられませんでした（${status}）。${raw}`;
}

class AbortedTurn extends Error {}

// 利用者の1回の依頼を進める。戻り値: { items, text, usage, steps, limited?, stopped? }。API の誤りは訳した文の Error で投げる
// confirmMore(steps): 上限の回数（maxSteps）に達したときに、続けて料金のかかる依頼を送るかを聞く
export async function runTurn({ provider, model, key, system, items = [], tools, userText, call, fetch, signal, maxSteps = 15, confirmMore, onEvent = () => {} }) {
  const hist = [...items, userItem(provider, userText)];
  const usage = { input: 0, output: 0 }, texts = [];
  let steps = 0, limit = maxSteps, pendingCalls = null, results = [];
  const done = (extra = {}) => ({ items: hist, text: texts.join('\n\n'), usage, steps, ...extra });
  try {
    for (;;) {
      if (signal?.aborted) throw new AbortedTurn();
      if (steps >= limit) {
        if (!(await confirmMore?.(steps))) return done({ limited: true });
        limit += maxSteps;
      }
      const req = buildRequest({ provider, model, key, system, items: hist, tools });
      onEvent({ type: 'request', step: steps + 1 });
      let res;
      try { res = await fetch(req.url, { ...req.init, signal }); } catch (e) {
        if (signal?.aborted || e?.name === 'AbortError') throw new AbortedTurn();
        throw new Error(errorText(0, null, { model }));
      }
      const body = await res.json().catch(() => null);
      steps++;
      if (!res.ok) throw new Error(errorText(res.status, body, { model }));
      const r = parseReply(provider, body);
      usage.input += r.usage.input; usage.output += r.usage.output;
      hist.push(...r.items);
      if (r.text) { texts.push(r.text); onEvent({ type: 'text', text: r.text }); }
      if (!r.calls.length) return done();
      pendingCalls = r.calls; results = [];
      for (const c of r.calls) {
        if (signal?.aborted) throw new AbortedTurn();
        onEvent({ type: 'call', name: c.name, args: c.args });
        const out = await call(c.name, c.args);
        results.push(out);
        onEvent({ type: 'result', name: c.name, args: c.args, ok: out.ok, error: out.error });
      }
      hist.push(...resultItems(provider, r.calls, results));
      pendingCalls = null;
      if (signal?.aborted) throw new AbortedTurn();
    }
  } catch (e) {
    if (!(e instanceof AbortedTurn)) throw e;
    // 答えの出ていない呼び出しに「止めました」を返し、次の依頼で履歴が壊れないようにする
    if (pendingCalls) {
      const filled = pendingCalls.map((c, i) => results[i] || { ok: false, error: '利用者が止めました' });
      hist.push(...resultItems(provider, pendingCalls, filled));
    }
    return done({ stopped: true });
  }
}
