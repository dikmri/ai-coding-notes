// タスク帳の 3 つの版を同じ条件で起動し、起動時間・メモリ・CPU・スクロールを測る。
// 使い方（プロジェクトの最上位で）:
//   node reports/rust-gui/bench/bench.mjs --scenarios startup,items10k,scroll --apps tauri,egui,gpui
// 結果は runtime/rust-gui/results/ に JSON で書く。版ごとの順番は回ごとに入れ替える。
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const R = (...p) => path.join(ROOT, ...p);

const APPS = {
  tauri: R('runtime/rust-gui/target-tauri/release/taskbook-tauri.exe'),
  egui: R('runtime/rust-gui/target-egui/release/taskbook-egui.exe'),
  'egui-glow': R('runtime/rust-gui/target-egui-glow/release/taskbook-egui.exe'),
  gpui: R('runtime/rust-gui/target-gpui/release/taskbook-gpui.exe'),
  // 測定用: GPUI を CPU の描画（WARP）に固定した版（src/gpui-warp.diff）。--software のときだけ WARP を選ぶ
  'gpui-warp': R('runtime/rust-gui/target-gpui/release/taskbook-gpui-warp.exe'),
  // egui を DirectX 12 だけで描く（wgpu の環境変数で、Vulkan を調べないようにする）
  'egui-dx12': R('runtime/rust-gui/target-egui/release/taskbook-egui.exe'),
};
const APP_ENV = { 'egui-dx12': { WGPU_BACKEND: 'dx12' } };
// GPUI を、前面にない窓でもフレームを抑えない設定で動かす（他の版と同じ条件で比べるため）
APPS['gpui-full'] = APPS.gpui;
// GPU なしの条件では、GPUI も他の版と同じく、前面にない窓のフレームを抑えない
const APP_ARGS = { 'gpui-full': ['--full-rate'], 'gpui-warp': ['--full-rate'] };

const SCROLL = ['--items', '10000', '--bench-scroll', '5'];
const SCENARIOS = {
  // 空の一覧で起動。起動時間・待機中のメモリと CPU
  startup: { args: [], runs: 7, idle: true },
  // 1 万件・10 万件を持って起動
  items10k: { args: ['--items', '10000'], runs: 3, idle: true },
  items100k: { args: ['--items', '100000'], runs: 3 },
  // 1 万件を 5 秒間スクロール
  scroll: { args: SCROLL, runs: 3, scroll: true },
  // 低い性能をまねる: CPU を 2 コア・1 コアに絞る
  startup_2core: { args: [], runs: 5, affinity: 0x3 },
  startup_1core: { args: [], runs: 5, affinity: 0x1 },
  scroll_2core: { args: SCROLL, runs: 3, scroll: true, affinity: 0x3 },
  scroll_1core: { args: SCROLL, runs: 3, scroll: true, affinity: 0x1 },
  // GPU を使わずに描く（対応している版だけ）
  startup_soft: { args: ['--software'], runs: 5, idle: true },
  scroll_soft: { args: [...SCROLL, '--software'], runs: 3, scroll: true },
};

// ---- 引数 ----
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const scenarioNames = opt('scenarios', 'startup').split(',');
const appNames = opt('apps', 'tauri,egui,gpui').split(',');
const runsOverride = opt('runs', null);
const tag = opt('tag', 'run');
// 窓はサブモニター（メインの左）の中央あたりに、前面に出さずに開く。利用者の作業の邪魔をしないため
const pos = opt('pos', '-1410,200');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---- 測定の補助（PowerShell を 1 つ起動したままにする） ----
class Probe {
  constructor() {
    this.ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', R('reports/rust-gui/bench/probe-server.ps1')], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    this.waiters = [];
    createInterface({ input: this.ps.stdout }).on('line', (line) => {
      const w = this.waiters.shift();
      if (w) w(JSON.parse(line));
    });
    this.ready = new Promise((r) => this.waiters.push(r));
  }
  cmd(line) {
    return new Promise((r) => {
      this.waiters.push(r);
      this.ps.stdin.write(line + '\n');
    });
  }
  close() {
    this.ps.stdin.write('quit\n');
  }
}

function sumTree(tree) {
  const s = { pws: 0, ws: 0, priv: 0, cpu: 0, procs: tree.length };
  for (const p of tree) {
    s.pws += p.pws;
    s.ws += p.ws;
    s.priv += p.priv;
    s.cpu += p.cpu;
  }
  return s;
}

/** 記録ファイルに event=name の行が現れるまで待ち、その行を返す */
async function waitEvent(logPath, name, timeoutMs, child) {
  const end = Date.now() + timeoutMs;
  const re = new RegExp(`^(\\S+) t_ms=(\\d+) app=\\S+ event=${name.replace('.', '\\.')} args="(.*?)" result="(.*)"$`, 'm');
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`exited ${child.exitCode} before ${name}`);
    try {
      const m = re.exec(fs.readFileSync(logPath, 'utf8'));
      if (m) return { at: Date.now(), t_ms: Number(m[2]), args: m[3], result: m[4] };
    } catch {}
    await sleep(15);
  }
  throw new Error(`timeout waiting ${name}`);
}

const kv = (s) => Object.fromEntries(s.split(' ').filter((x) => x.includes('=')).map((x) => x.split('=')));

async function runOnce(probe, app, scen, sname, i) {
  const logPath = R(`logs/rust-gui/bench/${tag}-${sname}-${app}-${i}.log`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.rmSync(logPath, { force: true });
  const args = [...scen.args, ...(APP_ARGS[app] ?? []), '--log', logPath, '--run-id', `${tag}-${sname}-${app}-${i}`, '--pos', pos, '--no-focus'];
  const env = { ...process.env, TASKBOOK_WEBVIEW_DATA: R('runtime/rust-gui/webview2-data'), ...(APP_ENV[app] ?? {}) };
  const spawnAt = Date.now();
  const child = spawn(APPS[app], args, { cwd: ROOT, stdio: 'ignore', env });
  const out = { app, scenario: sname, run: i, args: scen.args };
  try {
    if (scen.affinity) {
      out.affinitySet = (await probe.cmd(`affinity ${child.pid} ${scen.affinity}`)).ok;
    }
    const ready = await waitEvent(logPath, 'ready', 60000, child);
    out.startupMs = ready.t_ms - spawnAt;
    out.sinceMainMs = Number(kv(ready.result).since_main_ms);
    // 窓がサブモニター（x < 0）に開いたことを確かめる。メインモニターに出ていたら、すぐに閉じる
    const rect = await probe.cmd(`rect ${child.pid}`);
    out.rect = rect;
    if (rect.found && rect.l >= 0) throw new Error(`window opened on the main monitor: ${JSON.stringify(rect)}`);

    if (scen.scroll) {
      const start = await waitEvent(logPath, 'bench.scroll.start', 30000, child);
      const t1 = sumTree(JSON.parse(JSON.stringify(await probe.cmd(`tree ${child.pid}`))));
      const w1 = Date.now();
      const done = await waitEvent(logPath, 'bench.scroll.done', 30000, child);
      const t2 = sumTree(await probe.cmd(`tree ${child.pid}`));
      const w2 = Date.now();
      const r = kv(done.result);
      out.scroll = {
        frames: Number(r.frames),
        fps: Number(r.fps),
        maxGapMs: Number(r.max_gap_ms),
        cpuMsPerSec: (t2.cpu - t1.cpu) / 1e4 / ((w2 - w1) / 1000),
        startLag: start.at - start.t_ms,
      };
      // 1 フレームを描くのに使った CPU の時間。fps が違う版どうしでも比べられる
      out.scroll.cpuMsPerFrame = out.scroll.cpuMsPerSec / out.scroll.fps;
      await sleep(2000);
    } else {
      // 表示から 3 秒待ってからメモリを測る
      await sleep(Math.max(0, ready.t_ms + 3000 - Date.now()));
    }
    const tree = await probe.cmd(`tree ${child.pid}`);
    const mem = sumTree(tree);
    out.mem = { pws: mem.pws, ws: mem.ws, priv: mem.priv, procs: mem.procs };
    out.procNames = tree.map((p) => p.name);
    out.affinities = [...new Set(tree.map((p) => p.aff))];
    out.gpu = await probe.cmd(`gpu ${tree.map((p) => p.pid).join(',')}`);

    if (scen.idle) {
      // 何もしない 10 秒間の CPU 時間
      const a = sumTree(await probe.cmd(`tree ${child.pid}`));
      const wa = Date.now();
      await sleep(10000);
      const b = sumTree(await probe.cmd(`tree ${child.pid}`));
      out.idleCpuMsPerSec = (b.cpu - a.cpu) / 1e4 / ((Date.now() - wa) / 1000);
    }
  } catch (e) {
    out.error = String(e.message ?? e);
  } finally {
    await probe.cmd(`kill ${child.pid}`);
    await sleep(1500);
  }
  return out;
}

const probe = new Probe();
await probe.ready;
const info = await probe.cmd('info');
const results = { tag, startedAt: new Date().toISOString(), machine: info, runs: [] };
const outPath = R(`runtime/rust-gui/results/${tag}-${Date.now()}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });

for (const sname of scenarioNames) {
  const scen = SCENARIOS[sname];
  if (!scen) throw new Error(`unknown scenario ${sname}`);
  const runs = Number(runsOverride ?? scen.runs);
  // 1 回目は温め（結果に残すが集計から除く）
  for (let i = 0; i <= runs; i++) {
    // 版の順番を回ごとにずらす
    const order = appNames.map((_, k) => appNames[(k + i) % appNames.length]);
    for (const app of order) {
      const r = await runOnce(probe, app, scen, sname, i);
      r.warmup = i === 0;
      results.runs.push(r);
      fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
      const mb = (b) => (b / 1048576).toFixed(1);
      console.log(
        `${sname} ${app} #${i}${r.warmup ? '(warm)' : ''}: start=${r.startupMs}ms main=${r.sinceMainMs}ms` +
          (r.mem ? ` pws=${mb(r.mem.pws)}MB ws=${mb(r.mem.ws)}MB priv=${mb(r.mem.priv)}MB procs=${r.mem.procs}` : '') +
          (r.gpu ? ` gpu=${mb(r.gpu.dedicated)}/${mb(r.gpu.shared)}MB` : '') +
          (r.idleCpuMsPerSec !== undefined ? ` idle=${r.idleCpuMsPerSec.toFixed(2)}ms/s` : '') +
          (r.scroll ? ` fps=${r.scroll.fps} gap=${r.scroll.maxGapMs} cpu=${r.scroll.cpuMsPerSec.toFixed(0)}ms/s perframe=${r.scroll.cpuMsPerFrame.toFixed(2)}ms` : '') +
          (r.error ? ` ERROR ${r.error}` : ''),
      );
    }
  }
}

// ---- 中央値の一覧 ----
console.log('\n== median (warmup excluded) ==');
for (const sname of scenarioNames) {
  for (const app of appNames) {
    const rs = results.runs.filter((r) => r.scenario === sname && r.app === app && !r.warmup && !r.error);
    if (!rs.length) continue;
    const m = (f) => median(rs.map(f));
    const mb = (b) => (b === null ? '-' : (b / 1048576).toFixed(1));
    console.log(
      `${sname.padEnd(14)} ${app.padEnd(9)} n=${rs.length} start=${m((r) => r.startupMs)}ms pws=${mb(m((r) => r.mem?.pws))}MB ws=${mb(m((r) => r.mem?.ws))}MB priv=${mb(m((r) => r.mem?.priv))}MB` +
        ` gpu=${mb(m((r) => r.gpu?.dedicated))}MB idle=${m((r) => r.idleCpuMsPerSec)?.toFixed?.(2)}ms/s` +
        ` fps=${m((r) => r.scroll?.fps)} gap=${m((r) => r.scroll?.maxGapMs)} scrollcpu=${m((r) => r.scroll?.cpuMsPerSec)?.toFixed?.(0)}ms/s`,
    );
  }
}
results.finishedAt = new Date().toISOString();
fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
console.log(`\nwrote ${outPath}`);
probe.close();
