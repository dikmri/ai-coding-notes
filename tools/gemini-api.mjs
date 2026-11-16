// Gemini API（Interactions API）を直接呼ぶ道具。画像・音声・動画・YouTube の URL をそのまま渡せる。ライブラリは使わない。
// キーは環境変数 GEMINI_API_KEY から読む（無ければ Windows の利用者の環境変数の登録場所から読む）。キーは画面にもログにも出さない。
//
// 使い方（プロジェクトの直下で）:
//   node tools/gemini-api.mjs ask "質問" [ファイル や YouTube の URL ...] [--model gemini-4-argon] [--thinking low|medium|high] [--name 保存名]
//   node tools/gemini-api.mjs spend        … 使った金額の集計
// 結果: build/gemini/<日時>-<名前>.md と .json。金額の記録: runtime/gemini-spend.json。呼んだ記録: logs/gemini.log
// 設定: tools/gemini-api.config.json（model・tier（free か paid）・budgetUsd・thinking）
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from './lib/gemini-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'tools/gemini-api.config.json'), 'utf8'));
const BASE = 'https://generativelanguage.googleapis.com';
const LEDGER = join(ROOT, 'runtime/gemini-spend.json');
const LOG = join(ROOT, 'logs/gemini.log');
const INLINE_MAX = 15 * 1024 * 1024;

function log(event, args, result) {
  mkdirSync(dirname(LOG), { recursive: true });
  appendFileSync(LOG, `${new Date().toISOString()} ${event} args=${JSON.stringify(args)} result=${typeof result === 'string' ? result : JSON.stringify(result)}\n`);
}
function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'GEMINI_API_KEY'], { encoding: 'utf8', windowsHide: true });
      const m = /GEMINI_API_KEY\s+REG_\w+\s+(\S+)/.exec(out);
      if (m) return m[1];
    } catch { /* 登録が無い */ }
  }
  throw new Error('GEMINI_API_KEY が見つかりません。環境変数に API キーを入れてください');
}
async function call(path, init = {}) {
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
  log('gemini.upload', { file: path.replace(ROOT, '.').replace(/\\/g, '/'), size, mime }, { name: file.name, state: file.state });
  return file.uri;
}
async function toPart(target) {
  if (G.isYouTube(target)) return { kind: 'video', uri: target };
  const path = resolve(ROOT, target);
  if (!existsSync(path)) throw new Error('ファイルがありません: ' + target);
  const mime = G.mimeFor(path);
  if (!mime) throw new Error('この種類のファイルは渡せません: ' + target);
  const kind = G.kindFor(mime);
  if (kind === 'text') return { kind: 'text-file', text: `\n\n--- ${target} ---\n` + readFileSync(path, 'utf8') };
  if (statSync(path).size > INLINE_MAX) return { kind, mime, uri: await uploadFile(path, mime) };
  return { kind, mime, data: readFileSync(path).toString('base64') };
}
function loadLedger() {
  try { return JSON.parse(readFileSync(LEDGER, 'utf8')); } catch { return G.emptyLedger(CONFIG.budgetUsd); }
}
async function ask(args) {
  const opt = { model: CONFIG.model, thinking: CONFIG.thinking, name: 'ask', targets: [] };
  let question = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model') opt.model = args[++i];
    else if (args[i] === '--thinking') opt.thinking = args[++i];
    else if (args[i] === '--name') opt.name = args[++i];
    else if (question === null) question = args[i];
    else opt.targets.push(args[i]);
  }
  if (!question) throw new Error('質問を書いてください');
  const t0 = Date.now(), stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const parts = [];
  for (const t of opt.targets) parts.push(await toPart(t));
  const textExtra = parts.filter((p) => p.kind === 'text-file').map((p) => p.text).join('');
  const input = G.buildInput(question + textExtra, parts.filter((p) => p.kind !== 'text-file'));
  log('gemini.api.request', { model: opt.model, targets: opt.targets, thinking: opt.thinking }, 'start');
  const { body } = await call('/v1beta/interactions', { method: 'POST', headers: { 'content-type': 'application/json', 'Api-Revision': CONFIG.apiRevision }, body: JSON.stringify({ model: opt.model, input, store: false, generation_config: { thinking_level: opt.thinking } }) });
  const text = G.extractText(body), usd = G.costOf(body.usage, opt.model, new Date().toISOString());
  const entry = { ts: new Date().toISOString(), model: opt.model, tier: CONFIG.tier, name: opt.name, targets: opt.targets, usage: body.usage, usd, sec: Math.round((Date.now() - t0) / 1000) };
  mkdirSync(dirname(LEDGER), { recursive: true });
  const led = G.ledgerAdd(loadLedger(), entry);
  writeFileSync(LEDGER, JSON.stringify(led, null, 2));
  const dir = join(ROOT, 'build/gemini'), base = `${stamp}-${opt.name}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, base + '.json'), JSON.stringify({ request: { model: opt.model, question, targets: opt.targets }, response: body }, null, 2));
  writeFileSync(join(dir, base + '.md'), `# Gemini の回答（${opt.model}）\n\n- 日時: ${entry.ts}\n- 対象: ${opt.targets.join(' ') || 'なし'}\n- トークン: 入力 ${body.usage?.total_input_tokens ?? '-'} ・ 出力 ${body.usage?.total_output_tokens ?? '-'} ・ 考える過程 ${body.usage?.total_thought_tokens ?? '-'}\n- 金額の見積もり: ${usd == null ? '不明' : usd.toFixed(4) + ' ドル'}（${CONFIG.tier === 'paid' ? '有料' : '無料の枠。有料ならこの金額'}）\n\n## 質問\n\n${question}\n\n## 回答\n\n${text}\n`);
  log('gemini.api.response', { model: opt.model, file: `build/gemini/${base}.md`, sec: entry.sec, tokens: body.usage?.total_tokens }, { usd, tier: CONFIG.tier });
  console.log(text);
  console.log(`\n--- 保存: build/gemini/${base}.md ・ 金額の見積もり ${usd == null ? '不明' : usd.toFixed(4) + ' ドル'}（${CONFIG.tier}）・ 有料の累計 ${led.spentUsd.toFixed(4)} / ${led.budgetUsd} ドル`);
}
function spend() {
  const led = loadLedger(), by = {};
  for (const e of led.entries) { const k = `${e.model}（${e.tier}）`; by[k] = by[k] || { n: 0, usd: 0, tokens: 0 }; by[k].n++; by[k].usd += e.usd || 0; by[k].tokens += e.usage?.total_tokens || 0; }
  console.log(`予算 ${led.budgetUsd} ドル ・ 有料で使った額 ${led.spentUsd.toFixed(4)} ドル ・ 残り ${G.remaining(led).toFixed(4)} ドル ・ 無料の枠で使った分を有料に直すと ${led.freeEquivalentUsd.toFixed(4)} ドル`);
  for (const [k, v] of Object.entries(by)) console.log(`- ${k}: ${v.n} 回 ・ ${v.tokens.toLocaleString('ja-JP')} トークン ・ ${v.usd.toFixed(4)} ドル`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'ask') await ask(rest);
  else if (cmd === 'spend') spend();
  else { console.error('使い方: node tools/gemini-api.mjs ask "質問" [ファイル や URL ...] / node tools/gemini-api.mjs spend'); process.exit(1); }
} catch (e) {
  log('gemini.api.error', { cmd }, 'error: ' + e.message);
  console.error('失敗: ' + e.message);
  process.exit(1);
}
