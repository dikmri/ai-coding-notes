// 測定結果（runtime/rust-gui/results/*.json）から中央値を集め、
// reports/rust-gui/data/summary.json と、レポートの棒グラフ（HTML）を作る。
// 使い方: node reports/rust-gui/bench/charts.mjs <結果.json> [<結果.json> ...]
// レポートの <!-- gen:名前 --> と <!-- /gen:名前 --> の間を書き換える。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const R = (...p) => path.join(ROOT, ...p);
const REPORT = R('reports/rust-gui/index.html');

const NAMES = { tauri: 'Tauri', egui: 'egui', 'egui-dx12': 'egui（DX12）', 'egui-glow': 'egui（glow）', gpui: 'GPUI', 'gpui-full': 'GPUI（抑えない）', 'gpui-warp': 'GPUI' };
const ORDER = ['tauri', 'egui', 'egui-dx12', 'egui-glow', 'gpui', 'gpui-full', 'gpui-warp'];

const files = process.argv.slice(2);
const runs = files.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).runs);
const machine = JSON.parse(fs.readFileSync(files[0], 'utf8')).machine;

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---- 中央値の表 ----
const summary = {};
for (const r of runs) {
  if (r.warmup || r.error) continue;
  ((summary[r.scenario] ??= {})[r.app] ??= []).push(r);
}
const MB = 1048576;
const stat = {};
for (const [sc, apps] of Object.entries(summary)) {
  stat[sc] = {};
  for (const [app, rs] of Object.entries(apps)) {
    const m = (f) => median(rs.map(f));
    stat[sc][app] = {
      n: rs.length,
      startupMs: m((r) => r.startupMs),
      memMB: m((r) => r.mem?.pws / MB),
      wsMB: m((r) => r.mem?.ws / MB),
      privMB: m((r) => r.mem?.priv / MB),
      procs: m((r) => r.mem?.procs),
      gpuDedicatedMB: m((r) => r.gpu?.dedicated / MB),
      gpuSharedMB: m((r) => r.gpu?.shared / MB),
      // 1 コアを 100% としたときの CPU 使用率
      idleCpuPct: m((r) => (r.idleCpuMsPerSec ?? NaN) / 10),
      fps: m((r) => r.scroll?.fps),
      maxGapMs: m((r) => r.scroll?.maxGapMs),
      scrollCpuPct: m((r) => (r.scroll?.cpuMsPerSec ?? NaN) / 10),
      cpuMsPerFrame: m((r) => r.scroll?.cpuMsPerFrame),
    };
  }
}
// 実行ファイルの大きさ
const EXE = {
  tauri: 'runtime/rust-gui/target-tauri/release/taskbook-tauri.exe',
  egui: 'runtime/rust-gui/target-egui/release/taskbook-egui.exe',
  'egui-glow': 'runtime/rust-gui/target-egui-glow/release/taskbook-egui.exe',
  gpui: 'runtime/rust-gui/target-gpui/release/taskbook-gpui.exe',
};
stat.exe = {};
for (const [app, p] of Object.entries(EXE)) {
  try {
    stat.exe[app] = { sizeMB: fs.statSync(R(p)).size / MB };
  } catch {}
}
const buildPath = R('reports/rust-gui/data/build-times.json');
if (fs.existsSync(buildPath)) stat.build = JSON.parse(fs.readFileSync(buildPath, 'utf8'));

fs.mkdirSync(R('reports/rust-gui/data'), { recursive: true });
fs.writeFileSync(
  R('reports/rust-gui/data/summary.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), machine, sources: files.map((f) => path.basename(f)), stat }, null, 1),
);

// ---- 棒グラフ ----
const fmt = (v, digits) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '–'
    : v.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * 横向きの棒グラフ。rows は [{ app, value, note? }]。値はすべて棒の先に書く。
 * better: 'low' なら短いほど良い。
 */
function bars({ id, title, unit, digits = 0, better = 'low', rows, note }) {
  const shown = rows.filter((r) => r.value !== null && r.value !== undefined && Number.isFinite(r.value));
  const max = Math.max(...shown.map((r) => r.value), 1e-9);
  const hint = better === 'low' ? '棒が短いほど良い' : '棒が長いほど良い';
  const body = rows
    .map((r) => {
      const ok = r.value !== null && r.value !== undefined && Number.isFinite(r.value);
      const w = ok ? Math.max(0.6, (r.value / max) * 100) : 0;
      const label = ok ? `${fmt(r.value, digits)} ${unit}` : r.note ?? '測れない';
      return `    <div class="bar-row" data-app="${r.app}" title="${NAMES[r.app]}: ${label}">
      <span class="bar-name">${NAMES[r.app]}</span>
      <span class="bar-track">${ok ? `<span class="bar" style="--w:${w.toFixed(1)}%"></span>` : ''}<span class="bar-val">${label}</span></span>
    </div>`;
    })
    .join('\n');
  return `<figure class="bars" id="${id}">
  <figcaption><span class="bars-title">${title}</span><span class="bars-hint">${hint}</span></figcaption>
  <div class="bar-rows">
${body}
  </div>${note ? `\n  <p class="bars-note">${note}</p>` : ''}
</figure>`;
}

const pick = (sc, key, apps = ORDER) =>
  apps.filter((a) => stat[sc]?.[a]).map((a) => ({ app: a, value: stat[sc][a][key] }));

const blocks = {
  startup: bars({ id: 'c-startup', title: '起動してから画面が出るまで', unit: 'ms', rows: pick('startup', 'startupMs') }),
  memIdle: bars({ id: 'c-mem-idle', title: 'メモリ（空の一覧、待機中）', unit: 'MB', digits: 1, rows: pick('startup', 'memMB') }),
  mem10k: bars({ id: 'c-mem-10k', title: 'メモリ（1 万件、待機中）', unit: 'MB', digits: 1, rows: pick('items10k', 'memMB') }),
  mem100k: bars({ id: 'c-mem-100k', title: 'メモリ（10 万件、待機中）', unit: 'MB', digits: 1, rows: pick('items100k', 'memMB') }),
  memScroll: bars({ id: 'c-mem-scroll', title: 'メモリ（1 万件を 5 秒スクロールしたあと）', unit: 'MB', digits: 1, rows: pick('scroll', 'memMB') }),
  idleCpu: bars({ id: 'c-idle-cpu', title: '待機中の CPU 使用率（1 コア = 100%）', unit: '%', digits: 2, rows: pick('startup', 'idleCpuPct') }),
  scrollCpu: bars({ id: 'c-scroll-cpu', title: 'スクロール中の CPU 使用率（1 コア = 100%）', unit: '%', digits: 0, rows: pick('scroll', 'scrollCpuPct') }),
  perFrame: bars({ id: 'c-per-frame', title: 'スクロール中、1 フレームを描くのに使った CPU の時間', unit: 'ms', digits: 2, rows: pick('scroll', 'cpuMsPerFrame') }),
  fps: bars({ id: 'c-fps', title: 'スクロール中のフレームの数（前面にない窓）', unit: 'fps', digits: 0, better: 'high', rows: pick('scroll', 'fps') }),
  exe: bars({
    id: 'c-exe',
    title: '実行ファイルの大きさ',
    unit: 'MB',
    digits: 1,
    rows: ORDER.filter((a) => stat.exe[a]).map((a) => ({ app: a, value: stat.exe[a].sizeMB })),
    note: 'Tauri は、Windows 11 に最初から入っている WebView2 を使うので、その分は含みません。',
  }),
  start1core: bars({ id: 'c-start-1core', title: '起動してから画面が出るまで（CPU を 1 コアに制限）', unit: 'ms', rows: pick('startup_1core', 'startupMs') }),
  start2core: bars({ id: 'c-start-2core', title: '起動してから画面が出るまで（CPU を 2 コアに制限）', unit: 'ms', rows: pick('startup_2core', 'startupMs') }),
  scrollCpu1core: bars({ id: 'c-scroll-1core', title: 'スクロールの滑らかさ（CPU を 1 コアに制限）', unit: 'fps', digits: 1, better: 'high', rows: pick('scroll_1core', 'fps') }),
  softCpu: bars({ id: 'c-soft-cpu', title: 'GPU なし（CPU で描画）のスクロール中の CPU 使用率', unit: '%', digits: 0, rows: pick('scroll_soft', 'scrollCpuPct') }),
  softPerFrame: bars({ id: 'c-soft-per-frame', title: 'GPU なし（CPU で描画）で 1 フレームを描くのに使った CPU の時間', unit: 'ms', digits: 2, rows: pick('scroll_soft', 'cpuMsPerFrame') }),
  softFps: bars({ id: 'c-soft-fps', title: 'GPU なし（CPU で描画）のスクロールの滑らかさ', unit: 'fps', digits: 1, better: 'high', rows: pick('scroll_soft', 'fps') }),
};
if (stat.build) {
  blocks.buildClean = bars({
    id: 'c-build-clean',
    title: '最初のビルドにかかる時間（リリース）',
    unit: '分',
    digits: 1,
    rows: ORDER.filter((a) => stat.build[a]?.cleanReleaseSec).map((a) => ({ app: a, value: stat.build[a].cleanReleaseSec / 60 })),
  });
  blocks.buildIncr = bars({
    id: 'c-build-incr',
    title: '1 行直してから動かせるまで（デバッグ）',
    unit: '秒',
    digits: 1,
    rows: ORDER.filter((a) => stat.build[a]?.incrDebugSec).map((a) => ({ app: a, value: stat.build[a].incrDebugSec })),
  });
}

if (fs.existsSync(REPORT)) {
  let html = fs.readFileSync(REPORT, 'utf8');
  for (const [name, frag] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- gen:${name} -->)[\\s\\S]*?(<!-- /gen:${name} -->)`);
    if (re.test(html)) html = html.replace(re, `$1\n${frag}\n$2`);
  }
  fs.writeFileSync(REPORT, html);
}
console.log(JSON.stringify(stat, null, 1));
