// Gemini API（Interactions API）を直接呼ぶ道具。画像・音声・動画・YouTube の URL をそのまま渡せる。画像も作れる。ライブラリは使わない。
//
// 使い方（プロジェクトの直下で）:
//   node tools/gemini-api.mjs ask "質問" [ファイル や YouTube の URL ...] [--model gemini-4-carbon] [--thinking low|medium|high] [--schema 形.json] [--name 保存名]
//   node tools/gemini-api.mjs image "作りたい画像の説明" [参考の画像 ...] [--out os/img/x.jpg] [--aspect 1:1] [--size 1K] [--name 保存名]
//   node tools/gemini-api.mjs pixel "描きたい絵の説明" [参考の画像 ...] [--size 16] [--out os/icons/x.svg] [--free] [--rounds 2] [--name 保存名]
//       … Gemini 自身が1マスずつの色の並びを考え、道具が SVG にする（ドット絵・アイコン向け。透明と16色の決まりを守れる）
//   node tools/gemini-api.mjs models [名前の一部]   … このキーで使えるモデル（料金はかからない）
//   node tools/gemini-api.mjs spend                 … 使った金額の集計
// 結果: build/gemini/<日時>-<名前>.md・.json・画像。金額の記録: runtime/gemini-spend.json。呼んだ記録: logs/gemini.log
// 設定: tools/gemini-api.config.json（tier（free か paid）・budgetUsd・dailyCapUsd・models の役ごとのモデル）
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as G from './lib/gemini-core.mjs';
import * as P from './lib/pixel.mjs';
import { openBrowser } from './lib/cdp.mjs';
import { CONFIG, OUT, ROOT, call, interact, loadLedger, moneyLine, log } from './lib/gemini-client.mjs';

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

// ---- ドット絵（Gemini が色の並びを考え、道具が SVG にする）----
const PIXEL_SCHEMA = {
  type: 'object',
  properties: {
    note: { type: 'string', description: '何をどう描いたか、何を直したか（日本語で1〜2文）' },
    done: { type: 'boolean', description: '見本を見て直すところが無ければ true' },
    palette: { type: 'array', items: { type: 'object', properties: { key: { type: 'string', description: '1文字。「.」は使わない' }, color: { type: 'string', description: '#rrggbb' } }, required: ['key', 'color'] } },
    rows: { type: 'array', items: { type: 'string' }, description: '上の行から順に。各行は横のマスの数と同じ文字数。「.」は透明' },
  },
  required: ['note', 'done', 'palette', 'rows'],
};
// 拡大した見本の画像を作る（左: 拡大と市松模様、右: 実際の大きさと2倍を、青緑・灰色・白の背景に置く）
async function previewPng(svg, size, file) {
  const scale = Math.max(4, Math.floor(384 / size));
  const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const tile = (bg) => '<div class="tile" style="background:' + bg + '"><img src="' + src + '" width="' + size + '" height="' + size + '"><img src="' + src + '" width="' + size * 2 + '" height="' + size * 2 + '"></div>';
  const html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;display:flex;gap:24px;padding:16px;align-items:flex-start}'
    + '.big{width:' + size * scale + 'px;height:' + size * scale + 'px;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/' + scale * 2 + 'px ' + scale * 2 + 'px}'
    + '.col{display:flex;flex-direction:column;gap:12px}.tile{padding:12px;display:flex;gap:12px;align-items:center}img{image-rendering:pixelated}</style>'
    + '<img class="big" src="' + src + '"><div class="col">' + tile('#008080') + tile('#c0c0c0') + tile('#ffffff') + '</div>';
  const htmlFile = file.replace(/\.png$/, '.html');
  writeFileSync(htmlFile, html);
  const page = await openBrowser({ width: size * scale + size * 3 + 120, height: Math.max(size * scale, size * 6 + 120) + 32, profile: join(ROOT, 'runtime/shot-profile') });
  try {
    await page.navigate(pathToFileURL(htmlFile).href);
    await new Promise((r) => setTimeout(r, 300));
    writeFileSync(file, Buffer.from(await page.screenshot(), 'base64'));
  } finally { await page.close(); }
}
async function pixel(args) {
  const o = parseArgs(args, ['model', 'name', 'out', 'size', 'rounds']);
  const free = o.rest.includes('--free');
  const [prompt, ...refs] = o.rest.filter((x) => x !== '--free');
  if (!prompt) throw new Error('描きたい絵の説明を書いてください');
  const size = +(o.size || 16), rounds = +(o.rounds || 2), model = o.model || CONFIG.models.pixel || CONFIG.models.default;
  const name = o.name || 'pixel';
  const rules = size + '×' + size + ' マスのドット絵を、色の表（palette）と、1マスずつの色の並び（rows）で描いてください。\n'
    + '- rows は ' + size + ' 行で、各行はちょうど ' + size + ' 文字にしてください。「.」は透明です。\n'
    + '- 色の表の記号は1文字（英数字）にし、色は #rrggbb で書いてください。色は16色まで' + (free ? '' : 'で、次の Windows の16色だけを使ってください: ' + P.WIN16.join(' ')) + '。\n'
    + '- 1998年ごろのパソコンのアイコンの描き方にしてください: 輪郭は黒の1マスの線、光は左上から（左上を明るく、右下を暗く）、背景は透明、文字は入れない。\n'
    + '- 小さく表示しても形が分かるように、細かすぎる模様を避けてください。';
  let input = rules + '\n\n描くもの: ' + prompt + (refs.length ? '\n参考の画像を付けます。形や色の参考にし、ドット絵として描き直してください。' : '');
  // reviewed: 見本の画像を一度見せたか。見せる前の「直すところ無し」（done）では終えない
  let targets = refs, art = null, total = 0, led = null, note = '', snapped = [], reviewed = false;
  const dir = join(OUT, 'pixel');
  mkdirSync(dir, { recursive: true });
  const base = join(dir, new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-' + name);
  for (let round = 0; round <= rounds; round++) {
    const r = await interact({ model, text: input, targets, thinking: CONFIG.thinking, responseFormat: { type: 'text', mime_type: 'application/json', schema: PIXEL_SCHEMA }, name: name + '-r' + round });
    total += r.usd || 0; led = r.led;
    const j = G.parseJson(r.text);
    if (!j) throw new Error('絵を読めませんでした: ' + r.text.slice(0, 200));
    const v = P.validateArt(j, { size, win16: !free });
    note = j.note || '';
    if (!v.ok) {
      log('gemini.pixel.invalid', { name, round }, v.errors.slice(0, 5).join(' / '));
      if (round === rounds) throw new Error('決まりに合う絵になりませんでした: ' + v.errors.slice(0, 5).join(' / '));
      input = rules + '\n\n描くもの: ' + prompt + '\n\n前の答えは次の点が決まりに合いませんでした。直した全体を返してください。\n- ' + v.errors.slice(0, 20).join('\n- ') + '\n\n前の答え:\n' + JSON.stringify(j);
      targets = refs;
      continue;
    }
    art = v.art; snapped = v.snapped;
    if (reviewed && j.done) break;
    if (round === rounds) break;
    // できた絵を拡大した見本にして見せ、直すところがあれば直してもらう
    const png = base + '-r' + round + '.png';
    writeFileSync(base + '-r' + round + '.svg', P.toSvg(art));
    await previewPng(P.toSvg(art), size, png);
    input = rules + '\n\n描くもの: ' + prompt + '\n\n付けた画像は、あなたが描いた絵の見本です（左: 拡大、右: 実際の大きさと2倍を、青緑・灰色・白の背景に置いたもの）。説明どおりに見えるか、小さくしても形が分かるか、輪郭と光の向きが決まりどおりかを見てください。直すところがあれば直した全体を返し、無ければ同じ絵を done: true で返してください。\n\n今の絵:\n' + JSON.stringify(art);
    targets = [png];
    reviewed = true;
  }
  const svg = P.toSvg(art);
  writeFileSync(base + '.svg', svg);
  await previewPng(svg, size, base + '.png');
  if (o.out) { const dest = resolve(o.out); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, svg); }
  log('gemini.pixel', { name, size, model, out: o.out || null }, { usd: total, colors: art.palette.length, snapped: snapped.length });
  console.log(note + '\n保存: ' + base + '.svg ・ 見本 ' + base + '.png' + (o.out ? ' ・ ' + o.out : '')
    + (snapped.length ? '\n16色にそろえた色: ' + snapped.map((x) => x.key + ' ' + x.from + '→' + x.to).join('、') : '')
    + '\n--- ' + moneyLine(total, led));
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
  else if (cmd === 'pixel') await pixel(rest);
  else if (cmd === 'models') await models(rest[0]);
  else if (cmd === 'spend') spend();
  else { console.error('使い方: node tools/gemini-api.mjs ask "質問" [ファイル や URL ...] / image "説明" [--out パス] / models / spend'); process.exit(1); }
} catch (e) {
  log('gemini.api.error', { cmd }, 'error: ' + e.message);
  console.error('失敗: ' + e.message);
  process.exit(1);
}
