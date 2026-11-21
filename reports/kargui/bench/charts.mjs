// kargui のレポートの棒グラフと表を、data/ の数字から作る。
// 数字の元: data/summary.json（kargui の tools/bench-phase3.sh で測った中央値）、data/doc-coverage.json、data/ai-test.json。
// 使い方: node reports/kargui/bench/charts.mjs
// レポートの <!-- gen:名前 --> と <!-- /gen:名前 --> の間を書き換える。
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '..');
const REPORT = path.join(DIR, 'index.html');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, 'data', f), 'utf8'));
const sum = read('summary.json').results;
const cov = read('doc-coverage.json').crates;
const ai = read('ai-test.json').frameworks;

const NAMES = {
  'kargui-tb': 'kargui', 'kargui-tb-full': 'kargui', 'kargui-tb-gpu': 'kargui（GPU）', 'kargui-tb-gpu-full': 'kargui（GPU）',
  egui: 'egui', 'egui-glow': 'egui（glow）', gpui: 'GPUI', 'gpui-full': 'GPUI（抑えない）', 'gpui-warp': 'GPUI（WARP）', tauri: 'Tauri',
};
// 色を決める札（グラフ・表で同じ色）
const COLOR = (app) => (app.startsWith('kargui') ? (app.includes('gpu') ? 'kargui-gpu' : 'kargui') : app);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const group = (n) => n.toLocaleString('en-US');

function bars(id, title, hint, rows, note = '') {
  const max = Math.max(...rows.map((r) => r.value));
  const body = rows
    .map((r) => {
      const w = ((r.value / max) * 100).toFixed(1);
      return `    <div class="bar-row" data-app="${r.color}" title="${esc(r.name)}: ${esc(r.label)}">
      <span class="bar-name">${esc(r.name)}</span>
      <span class="bar-track"><span class="bar" style="--w:${w}%"></span><span class="bar-val">${esc(r.label)}</span></span>
    </div>`;
    })
    .join('\n');
  return `<figure class="bars" id="${id}">
  <figcaption><span class="bars-title">${esc(title)}</span><span class="bars-hint">${esc(hint)}</span></figcaption>
  <div class="bar-rows">
${body}
  </div>${note ? `\n  <p class="bars-note">${esc(note)}</p>` : ''}
</figure>`;
}

function measured(scenario, apps, field, fmt) {
  return apps.map((app) => {
    const v = sum[`${scenario}|${app}`]?.[field];
    if (v === undefined || v === null) throw new Error(`${scenario}|${app} の ${field} が無い`);
    return { name: NAMES[app], color: COLOR(app), value: v, label: fmt(v) };
  });
}
const ms = (v) => `${group(Math.round(v))} ms`;
const mb = (v) => `${v.toFixed(1)} MB`;
const frame = (v) => `${v.toFixed(2)} ms`;

const gen = {
  startup: bars('c-startup', '起動してから画面が出るまで（空の一覧）', '棒が短いほど良い',
    measured('startup', ['kargui-tb', 'kargui-tb-gpu', 'egui-glow', 'gpui'], 'startupMs', ms)),
  mem10k: bars('c-mem-10k', 'メモリ（1 万件・待機）', '棒が短いほど良い',
    measured('items10k', ['kargui-tb', 'kargui-tb-gpu', 'gpui', 'egui-glow'], 'memMB', mb)),
  mem100k: bars('c-mem-100k', 'メモリ（10 万件・待機）', '棒が短いほど良い',
    measured('items100k', ['kargui-tb', 'kargui-tb-gpu', 'gpui', 'egui-glow'], 'memMB', mb), 'データそのもの（共通の taskcore）が約 13 MB あります。'),
  perFrame: bars('c-per-frame', 'スクロール中の 1 フレームの CPU', '棒が短いほど良い',
    measured('scroll', ['kargui-tb-full', 'kargui-tb-gpu-full', 'egui', 'gpui-full'], 'cpuMsPerFrame', frame),
    '測定の道具は CPU の時間を 15.6 ms 単位で数えるので、1 ms 前後の値は回ごとにばらつきます。'),
  softStartup: bars('c-soft-startup', 'GPU なしの起動', '棒が短いほど良い',
    measured('startup_soft', ['kargui-tb', 'gpui-warp', 'tauri'], 'startupMs', ms)),
  softFrame: bars('c-soft-frame', 'GPU なしのスクロール 1 フレームの CPU', '棒が短いほど良い',
    measured('scroll_soft', ['kargui-tb-full', 'tauri', 'gpui-warp'], 'cpuMsPerFrame', frame)),
  core1: bars('c-core1', 'CPU 1 コアでの起動', '棒が短いほど良い',
    measured('startup_1core', ['kargui-tb', 'kargui-tb-gpu', 'egui-glow', 'gpui'], 'startupMs', ms)),
  docs: bars('c-docs', '例がある割合（公開項目のうち、動く例を持つ物）', '棒が長いほど良い',
    [['kargui', 'kargui'], ['gpui-pre', 'gpui'], ['egui', 'egui'], ['tauri', 'tauri']].map(([c, color]) => ({
      name: c === 'gpui-pre' ? 'GPUI（gpui-pre）' : NAMES[c] ?? c, color, value: cov[c].examples_pct, label: `${cov[c].examples_pct}%（${cov[c].examples} / ${cov[c].examples_eligible}）`,
    })),
    'rustdoc の数え方（--show-coverage）。分母は、例の対象になる関数や型などの項目。'),
  aiLines: bars('c-ai-lines', 'AI が書いた画面のコードの行数（6 回の中央値）', '棒が短いほど良い',
    [['kargui2', 'kargui', 'kargui（直した後）'], ['kargui', 'kargui', 'kargui（直す前）'], ['egui', 'egui', 'egui'], ['tauri', 'tauri', 'Tauri'], ['gpui', 'gpui', 'GPUI']].map(([k, color, name]) => ({
      name, color, value: ai[k].lines_median, label: `${group(Math.round(ai[k].lines_median))} 行`,
    })),
    '空行とコメントを除いた行数。GPUI は 6 回中 4 回、入力欄そのものを自分で書いていました。'),
  aiTable: `<div class="table-wrap" tabindex="0" role="region" aria-labelledby="t-ai">
      <table>
        <caption id="t-ai">AI に同じ課題を出した結果（Sonnet と Haiku に 3 回ずつ）</caption>
        <thead><tr><th scope="col">版</th><th scope="col" class="num">一度も失敗しなかった回</th><th scope="col" class="num">仕様の採点（8 点満点の平均）</th><th scope="col" class="num">満点の回</th><th scope="col" class="num">行数の中央値</th></tr></thead>
        <tbody>
${[['kargui2', 'kargui（直した後）'], ['kargui', 'kargui（直す前）'], ['tauri', 'Tauri'], ['gpui', 'GPUI'], ['egui', 'egui']]
  .map(([k, name]) => `          <tr><th scope="row"><span class="fw ${COLOR(k).replace('-gpu', '')}">${esc(name)}</span></th><td class="num">${ai[k].clean} / ${ai[k].n}</td><td class="num">${ai[k].score_avg.toFixed(2)}</td><td class="num">${ai[k].full_marks}</td><td class="num">${group(Math.round(ai[k].lines_median))} 行</td></tr>`)
  .join('\n')}
        </tbody>
      </table>
    </div>`,
};

let html = fs.readFileSync(REPORT, 'utf8');
for (const [name, body] of Object.entries(gen)) {
  const re = new RegExp(`(<!-- gen:${name} -->)[\\s\\S]*?(<!-- /gen:${name} -->)`);
  if (!re.test(html)) throw new Error(`gen:${name} の印が無い`);
  html = html.replace(re, `$1\n${body}\n$2`);
}
fs.writeFileSync(REPORT, html);
console.log(`書き換えた: ${Object.keys(gen).join(', ')}`);
