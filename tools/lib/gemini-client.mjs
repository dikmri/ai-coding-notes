// Gemini API を呼ぶ部分（キー・通信・ファイルの受け渡し・金額の記録・ログ）。tools/gemini-api.mjs と tools/gemini-pr.mjs が使う。
// キーは環境変数 GEMINI_API_KEY から読む（無ければ Windows の利用者の環境変数の登録場所から読む）。キーは画面にもログにも出さない。
// 金額の記録とログと結果は、作業用の別のチェックアウト（git worktree）から呼んでも、元のチェックアウトの1か所に集める。
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from './gemini-core.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const CONFIG = JSON.parse(readFileSync(join(ROOT, 'tools/gemini-api.config.json'), 'utf8'));
function mainRoot() {
  try {
    const d = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
    return dirname(d);
  } catch { return ROOT; }
}
export const MAIN = mainRoot();
export const OUT = join(MAIN, 'build/gemini');
const BASE = 'https://generativelanguage.googleapis.com';
const LEDGER = join(MAIN, 'runtime/gemini-spend.json');
const LOG = join(MAIN, 'logs/gemini.log');
const INLINE_MAX = 15 * 1024 * 1024;

export function log(event, args, result) {
  mkdirSync(dirname(LOG), { recursive: true });
  appendFileSync(LOG, `${new Date().toISOString()} ${event} args=${JSON.stringify(args)} result=${typeof result === 'string' ? result : JSON.stringify(result)}\n`);
}
let key = null;
function apiKey() {
  if (key) return key;
  if (process.env.GEMINI_API_KEY) return (key = process.env.GEMINI_API_KEY);
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'GEMINI_API_KEY'], { encoding: 'utf8', windowsHide: true });
      const m = /GEMINI_API_KEY\s+REG_\w+\s+(\S+)/.exec(out);
      if (m) return (key = m[1]);
    } catch { /* 登録が無い */ }
  }
  throw new Error('GEMINI_API_KEY が見つかりません。環境変数に API キーを入れてください');
}
export async function call(path, init = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { 'x-goog-api-key': apiKey(), ...(init.headers || {}) } });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(typeof body === 'string' ? body : JSON.stringify(body.error || body)).slice(0, 400)}`);
  return { r, body };
}
// 大きいファイルは API のファイルの受け渡しの仕組みで送り、使える状態（ACTIVE）になるまで待つ
async function uploadFile(path, mime) {
  const size = statSync(path).size;
  const start = await fetch(`${BASE}/upload/v1beta/files`, { method: 'POST', headers: { 'x-goog-api-key': apiKey(), 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(size), 'X-Goog-Upload-Header-Content-Type': mime, 'content-type': 'application/json' }, body: JSON.stringify({ file: { display_name: basename(path) } }) });
  const url = start.headers.get('x-goog-upload-url');
  if (!url) throw new Error('ファイルを送る準備に失敗しました: HTTP ' + start.status);
  const up = await fetch(url, { method: 'POST', headers: { 'Content-Length': String(size), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: readFileSync(path) });
  const j = await up.json();
  let file = j.file;
  for (let i = 0; i < 120 && file.state && file.state !== 'ACTIVE'; i++) {
    if (file.state === 'FAILED') throw new Error('送ったファイルを Gemini が読めませんでした: ' + path);
    await new Promise((res) => setTimeout(res, 5000));
    file = (await call(`/v1beta/${file.name}`)).body;
  }
  log('gemini.upload', { file: basename(path), size, mime }, { name: file.name, state: file.state });
  return file.uri;
}
// ファイル（今いるフォルダからの相対）や YouTube の URL を、依頼に入れる形にする。文章のファイルは本文に足す
export async function toPart(target) {
  if (G.isYouTube(target)) return { kind: 'video', uri: target };
  const path = resolve(process.cwd(), target);
  if (!existsSync(path)) throw new Error('ファイルがありません: ' + target);
  const mime = G.mimeFor(path);
  if (!mime) throw new Error('この種類のファイルは渡せません: ' + target);
  const kind = G.kindFor(mime);
  if (kind === 'text') return { kind: 'text-file', text: `\n\n--- ${target} ---\n` + readFileSync(path, 'utf8') };
  if (statSync(path).size > INLINE_MAX) return { kind, mime, uri: await uploadFile(path, mime) };
  return { kind, mime, data: readFileSync(path).toString('base64') };
}
export function loadLedger() {
  try { return JSON.parse(readFileSync(LEDGER, 'utf8')); } catch { return G.emptyLedger(CONFIG.budgetUsd); }
}
export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// 1回呼ぶ。有料なら先に予算の歯止めを通し、呼んだあと金額を記録して、依頼と返事を build/gemini/ に保存する
// opt: { model, text, targets: [ファイル や URL], thinking, responseFormat, name }
export async function interact(opt) {
  const t0 = Date.now();
  const tier = CONFIG.tier, day = G.localDay(new Date().toISOString());
  const chk = G.budgetCheck(loadLedger(), { tier, dailyCapUsd: CONFIG.dailyCapUsd, day });
  if (!chk.ok) { log('gemini.api.blocked', { model: opt.model, name: opt.name }, chk.reason); throw new Error('呼びませんでした: ' + chk.reason); }
  const parts = [];
  for (const t of opt.targets || []) parts.push(await toPart(t));
  const extra = parts.filter((p) => p.kind === 'text-file').map((p) => p.text).join('');
  const input = G.buildInput(opt.text + extra, parts.filter((p) => p.kind !== 'text-file'));
  const req = { model: opt.model, input, store: false };
  if (opt.thinking) req.generation_config = { thinking_level: opt.thinking };
  if (opt.responseFormat) req.response_format = opt.responseFormat;
  log('gemini.api.request', { model: opt.model, name: opt.name, targets: opt.targets || [], thinking: opt.thinking || null }, 'start');
  const { body } = await call('/v1beta/interactions', { method: 'POST', headers: { 'content-type': 'application/json', 'Api-Revision': CONFIG.apiRevision }, body: JSON.stringify(req) });
  const now = new Date().toISOString();
  const usd = G.costOf(body.usage, opt.model, now);
  const entry = { ts: now, day, model: opt.model, tier, name: opt.name, targets: opt.targets || [], usage: body.usage, usd, sec: Math.round((Date.now() - t0) / 1000) };
  mkdirSync(dirname(LEDGER), { recursive: true });
  const led = G.ledgerAdd(loadLedger(), entry);
  writeFileSync(LEDGER, JSON.stringify(led, null, 2));
  mkdirSync(OUT, { recursive: true });
  const base = `${stamp()}-${opt.name}`;
  // 画像のデータは JSON に残さない（大きいため）。画像は呼び出し側が別に保存する
  const slim = JSON.parse(JSON.stringify(body, (k, v) => (k === 'data' && typeof v === 'string' && v.length > 200 ? `(${v.length} 文字の base64)` : v)));
  writeFileSync(join(OUT, base + '.json'), JSON.stringify({ request: { model: opt.model, text: opt.text, targets: opt.targets || [] }, response: slim }, null, 2));
  log('gemini.api.response', { model: opt.model, name: opt.name, file: `build/gemini/${base}.json`, sec: entry.sec, tokens: body.usage?.total_tokens }, { usd, tier });
  return { body, text: G.extractText(body), usd, led, base, entry };
}
// 金額の1行（PR のコメントや画面の表示に使う）
export function moneyLine(usd, led) {
  const day = G.localDay(new Date().toISOString());
  const u = usd == null ? '不明' : usd.toFixed(4) + ' ドル';
  return CONFIG.tier === 'paid'
    ? `見積もり ${u} ・ 今日 ${G.spentOn(led, day).toFixed(2)} / ${CONFIG.dailyCapUsd} ドル ・ 残り ${G.remaining(led).toFixed(2)} / ${led.budgetUsd} ドル`
    : `見積もり ${u}（無料の枠。有料ならこの金額）`;
}
