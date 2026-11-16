// Gemini API（Interactions API）を直接呼ぶ道具。画像・音声・動画・YouTube の URL をそのまま渡せる。画像も作れる。ライブラリは使わない。
//
// 使い方（プロジェクトの直下で）:
//   node tools/gemini-api.mjs ask "質問" [ファイル や YouTube の URL ...] [--model gemini-4-carbon] [--thinking low|medium|high] [--schema 形.json] [--name 保存名]
//   node tools/gemini-api.mjs image "作りたい画像の説明" [参考の画像 ...] [--out os/img/x.jpg] [--aspect 1:1] [--size 1K] [--name 保存名]
//   node tools/gemini-api.mjs models [名前の一部]   … このキーで使えるモデル（料金はかからない）
//   node tools/gemini-api.mjs spend                 … 使った金額の集計
// 結果: build/gemini/<日時>-<名前>.md・.json・画像。金額の記録: runtime/gemini-spend.json。呼んだ記録: logs/gemini.log
// 設定: tools/gemini-api.config.json（tier（free か paid）・budgetUsd・dailyCapUsd・models の役ごとのモデル）
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import * as G from './lib/gemini-core.mjs';
import { CONFIG, OUT, call, interact, loadLedger, moneyLine, log } from './lib/gemini-client.mjs';

function parseArgs(args, flags) {
  const opt = { rest: [] };
  for (let i = 0; i < args.length; i++) {
    const f = args[i].startsWith('--') ? args[i].slice(2) : null;
    if (f && flags.includes(f)) opt[f] = args[++i];
    else opt.rest.push(args[i]);
  }
  return opt;
}

async function ask(args) {
  const o = parseArgs(args, ['model', 'thinking', 'name', 'schema']);
  const [question, ...targets] = o.rest;
  if (!question) throw new Error('質問を書いてください');
  const model = o.model || CONFIG.models.default;
  const responseFormat = o.schema ? { type: 'text', mime_type: 'application/json', schema: JSON.parse(readFileSync(resolve(o.schema), 'utf8')) } : null;
  const r = await interact({ model, text: question, targets, thinking: o.thinking || CONFIG.thinking, responseFormat, name: o.name || 'ask' });
  const u = r.body.usage || {};
  writeFileSync(join(OUT, r.base + '.md'), `# Gemini の回答（${model}）\n\n- 日時: ${r.entry.ts}\n- 対象: ${targets.join(' ') || 'なし'}\n- トークン: 入力 ${u.total_input_tokens ?? '-'} ・ 出力 ${u.total_output_tokens ?? '-'} ・ 考える過程 ${u.total_thought_tokens ?? '-'}\n- ${moneyLine(r.usd, r.led)}\n\n## 質問\n\n${question}\n\n## 回答\n\n${r.text}\n`);
  console.log(r.text);
  console.log(`\n--- 保存: build/gemini/${r.base}.md ・ ${moneyLine(r.usd, r.led)}`);
}

async function image(args) {
  const o = parseArgs(args, ['model', 'name', 'out', 'aspect', 'size']);
  const [prompt, ...refs] = o.rest;
  if (!prompt) throw new Error('作りたい画像の説明を書いてください');
  const model = o.model || CONFIG.models.image;
  // 返せるのは JPEG だけ（2026-11-17 に API の返事で確認）。透明が要る素材は、単色の背景で作らせてから抜く
  const mime = 'image/jpeg';
  const responseFormat = { type: 'image', mime_type: mime, aspect_ratio: o.aspect || '1:1', image_size: (o.size || '1K').toUpperCase() };
  const r = await interact({ model, text: prompt, targets: refs, responseFormat, name: o.name || 'image' });
  const imgs = G.extractImages(r.body);
  if (!imgs.length) throw new Error('画像が返ってきませんでした。返事: ' + (r.text || '(なし)').slice(0, 300));
  const saved = [];
  imgs.forEach((im, i) => {
    const ext = im.mime === 'image/jpeg' ? '.jpg' : im.mime === 'image/webp' ? '.webp' : '.png';
    const p = join(OUT, `${r.base}-${i + 1}${ext}`);
    writeFileSync(p, Buffer.from(im.data, 'base64'));
    saved.push(p);
  });
  if (o.out) {
    const dest = resolve(o.out);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(saved[0], dest);
    saved.unshift(dest);
  }
  log('gemini.image', { model, name: o.name || 'image', refs, out: o.out || null }, { files: saved.length, usd: r.usd });
  if (r.text) console.log(r.text);
  console.log(`保存: ${saved.join(' ・ ')}\n--- ${moneyLine(r.usd, r.led)}`);
}

async function models(filter) {
  const { body } = await call('/v1beta/models?pageSize=1000');
  const re = filter ? new RegExp(filter, 'i') : null;
  for (const m of body.models || []) {
    if (re && !re.test(m.name + ' ' + (m.displayName || ''))) continue;
    console.log(`${m.name.replace('models/', '')} | ${m.displayName || ''} | 入力 ${m.inputTokenLimit ?? '-'} ・ 出力 ${m.outputTokenLimit ?? '-'} | ${(m.supportedGenerationMethods || []).join(',')}`);
  }
}

function spend() {
  const led = loadLedger(), by = {};
  const day = G.localDay(new Date().toISOString());
  for (const e of led.entries) { const k = `${e.model}（${e.tier}）`; by[k] = by[k] || { n: 0, usd: 0, tokens: 0 }; by[k].n++; by[k].usd += e.usd || 0; by[k].tokens += e.usage?.total_tokens || 0; }
  console.log(`予算 ${led.budgetUsd} ドル ・ 有料で使った額 ${led.spentUsd.toFixed(4)} ドル ・ 残り ${G.remaining(led).toFixed(4)} ドル ・ 今日（${day}）の分 ${G.spentOn(led, day).toFixed(4)} / ${CONFIG.dailyCapUsd} ドル`);
  console.log(`無料の枠で使った分を有料に直すと ${led.freeEquivalentUsd.toFixed(4)} ドル`);
  for (const [k, v] of Object.entries(by)) console.log(`- ${k}: ${v.n} 回 ・ ${v.tokens.toLocaleString('ja-JP')} トークン ・ ${v.usd.toFixed(4)} ドル`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'ask') await ask(rest);
  else if (cmd === 'image') await image(rest);
  else if (cmd === 'models') await models(rest[0]);
  else if (cmd === 'spend') spend();
  else { console.error('使い方: node tools/gemini-api.mjs ask "質問" [ファイル や URL ...] / image "説明" [--out パス] / models / spend'); process.exit(1); }
} catch (e) {
  log('gemini.api.error', { cmd }, 'error: ' + e.message);
  console.error('失敗: ' + e.message);
  process.exit(1);
}
