// Gemini API の道具の中核（計算だけ。通信はしない）。tests/gemini-core.test.mjs で確かめている

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic',
  '.wav': 'audio/wav', '.mp3': 'audio/mp3', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/aac',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mpeg': 'video/mpeg', '.avi': 'video/x-msvideo',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/plain', '.json': 'text/plain', '.js': 'text/plain', '.mjs': 'text/plain', '.css': 'text/plain', '.html': 'text/plain',
};
export function mimeFor(path) {
  const m = /\.[^./\\]+$/.exec(String(path));
  return m ? MIME[m[0].toLowerCase()] || null : null;
}
export function kindFor(mime) {
  if (!mime) return null;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'document';
  return 'text';
}
export const isYouTube = (s) => /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|shorts|live)|youtu\.be\/)/i.test(String(s));

// 100万トークンあたりの料金（ドル）。from の日付から有効（公式の料金ページ、2026-11-17 に確認）
const PRICES = {
  'gemini-4-argon': [{ from: '0000-01-01', input: 2, output: 10, cache: 0.1 }, { from: '2026-12-01', input: 4, output: 20, cache: 0.2 }],
  'gemini-4-carbon': [{ from: '0000-01-01', input: 2, output: 10, cache: 0.1 }, { from: '2026-12-01', input: 4, output: 20, cache: 0.2 }],
  'gemini-4-hydrogen': [{ from: '0000-01-01', input: 1.5, output: 7.5, cache: 0.075 }],
  'gemini-3.8-flash': [{ from: '0000-01-01', input: 0.75, output: 3.75, cache: 0.075 }, { from: '2027-01-01', input: 1.5, output: 7.5, cache: 0.15 }],
  // 画像を作るモデル。出力は画像のトークンの単価（1K の画像1枚で約 0.034 ドル）。2.1 の単価は二次資料で確認、キャッシュは入力の1割と仮に置く
  'gemini-nano-banana-2.1': [{ from: '0000-01-01', input: 1.5, output: 30, cache: 0.15 }],
  'gemini-3.1-flash-image': [{ from: '0000-01-01', input: 0.5, output: 60, cache: 0.05 }],
  'gemini-3-pro-image': [{ from: '0000-01-01', input: 2, output: 120, cache: 0.2 }],
};
export function priceFor(model, isoDate) {
  const list = PRICES[model];
  if (!list) return null;
  const day = String(isoDate).slice(0, 10);
  let p = null;
  for (const row of list) if (row.from <= day) p = row;
  return p && { input: p.input, output: p.output, cache: p.cache };
}
// 見積もりの金額（ドル）。出力には考える過程（thought）を含める。道具の呼び出しの分は入力として数える
export function costOf(usage, model, isoDate) {
  const p = priceFor(model, isoDate);
  if (!p || !usage) return null;
  const n = (k) => Number(usage[k]) || 0;
  const cached = n('total_cached_tokens'), input = Math.max(0, n('total_input_tokens') - cached) + n('total_tool_use_tokens');
  const output = n('total_output_tokens') + n('total_thought_tokens');
  return (input * p.input + cached * p.cache + output * p.output) / 1e6;
}
// Interactions API の input を作る。parts は { kind, mime, data(base64) } か { kind, uri, mime? }
export function buildInput(text, parts = []) {
  const out = [{ type: 'text', text }];
  for (const p of parts) {
    if (p.uri) out.push(p.mime ? { type: p.kind, uri: p.uri, mime_type: p.mime } : { type: p.kind, uri: p.uri });
    else out.push({ type: p.kind, data: p.data, mime_type: p.mime });
  }
  return out;
}
export function extractText(res) {
  return (res && res.steps ? res.steps : []).filter((s) => s.type === 'model_output').flatMap((s) => s.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
}
// 作られた画像を取り出す。MIME が無いときは中身の先頭で決める
export function extractImages(res) {
  const sniff = (d) => (d.startsWith('/9j/') ? 'image/jpeg' : d.startsWith('UklG') ? 'image/webp' : 'image/png');
  return (res && res.steps ? res.steps : []).filter((s) => s.type === 'model_output').flatMap((s) => s.content || [])
    .filter((c) => c.type === 'image' && c.data).map((c) => ({ data: c.data, mime: c.mime_type || sniff(c.data) }));
}
// JSON で返すよう頼んだ返事を読む。```json の囲みがあっても読む
export function parseJson(text) {
  const t = String(text).trim().replace(/^```(?:json)?s*/i, '').replace(/s*```$/, '');
  try { return JSON.parse(t); } catch { return null; }
}
// ISO の時刻を、時差（分）をつけた日付にする。記録の日付は日本時間（540）で数える
export const localDay = (iso, offsetMin = 540) => new Date(Date.parse(iso) + offsetMin * 60000).toISOString().slice(0, 10);

// 使った金額の記録。無料の枠の分は「有料ならいくらだったか」だけを別に足す
export const emptyLedger = (budgetUsd) => ({ budgetUsd, spentUsd: 0, freeEquivalentUsd: 0, entries: [] });
export function ledgerAdd(led, e) {
  const usd = Number(e.usd) || 0;
  return {
    ...led,
    spentUsd: led.spentUsd + (e.tier === 'paid' ? usd : 0),
    freeEquivalentUsd: led.freeEquivalentUsd + (e.tier === 'paid' ? 0 : usd),
    entries: [...led.entries, e],
  };
}
export const remaining = (led) => led.budgetUsd - led.spentUsd;
export function spentOn(led, day) {
  return led.entries.filter((e) => e.tier === 'paid' && (e.day || String(e.ts).slice(0, 10)) === day).reduce((a, e) => a + (Number(e.usd) || 0), 0);
}
// 有料で呼ぶ前の歯止め。予算の残りが無いか、その日の上限に届いていたら止める
export function budgetCheck(led, { tier, dailyCapUsd, day }) {
  if (tier !== 'paid') return { ok: true };
  if (remaining(led) <= 0) return { ok: false, reason: `予算 ${led.budgetUsd} ドルを使い切りました（使った額 ${led.spentUsd.toFixed(4)} ドル）` };
  const today = spentOn(led, day);
  if (dailyCapUsd != null && today >= dailyCapUsd) return { ok: false, reason: `今日（${day}）の上限 ${dailyCapUsd} ドルに届きました（今日の分 ${today.toFixed(4)} ドル）` };
  return { ok: true };
}
