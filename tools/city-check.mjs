// 街あかり（os/games/machiakari）の通しの確認。音を出さない Chrome で開き、確かめ用の入口（?debug=1）から
// 最初の街を作って時間を進め、昼・夕方・夜の画面写真と、1秒あたりのコマ数・人口・車の数を記録する。
// 使い方: node tools/city-check.mjs [URL の根元（既定 http://localhost:8771）] [--months 8] [--size 1280x760] [--big]
//   --big  80×80 の格子の大きな街を一気に作り（道具はすべて解放）、2年ぶん見回りを進めてから、朝の通勤と夜を撮る
// 写真は build/shots/city-*.png（--big は city-big-*.png）、結果は標準出力に JSON で出す
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a)) || 'http://localhost:8771';
const opt = { months: 8, size: '1280x760', big: false };
for (let i = 0; i < args.length; i++) { if (args[i] === '--months') opt.months = +args[++i]; if (args[i] === '--size') opt.size = args[++i]; if (args[i] === '--big') opt.big = true; }
const [W, H] = opt.size.split('x').map(Number);
const out = join(ROOT, 'build/shots');
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await openBrowser({ width: W, height: H, profile: join(ROOT, 'runtime/shot-profile-city') });
const report = { shots: [], samples: [] };
try {
  if (opt.big) { await bigCity(); process.exit(0); }
  await page.navigate(`${base}/os/games/machiakari/index.html?debug=1&start=1&size=64&seed=7&terrain=river`);
  if (!(await page.waitFor('#app:not([hidden])'))) throw new Error('ゲームが始まりませんでした');
  await sleep(800);
  // 最初の街: 外への大通りの先に格子の道、住宅・商業・工業、発電所・給水塔・下水処理場（置けない場所なら少しずらす）
  report.build = await page.evaluate(`(() => {
    const { G } = window.__city; const s = G.sim.s, en = s.entry, row = en.j, x0 = en.len;
    localStorage.removeItem('machiakari-slot-auto'); localStorage.removeItem('machiakari-meta-auto');
    const res = [];
    const use = (tool, a, b) => { G.ui.tool = tool; const before = s.funds; G.applyTool(a, b || a); res.push([JSON.stringify(tool), before - s.funds]); return before !== s.funds; };
    const place = (key, i, j) => { for (let d = 0; d < 12; d++) for (const [di, dj] of [[0,0],[-d,0],[0,d],[0,-d],[d,0]]) if (use({ kind: 'svc', key }, [i + di, j + dj])) return true; return false; };
    use({ kind: 'road', road: 1 }, [x0, row], [x0 + 22, row]);
    for (const x of [x0 + 4, x0 + 10, x0 + 16]) use({ kind: 'road', road: 1 }, [x, row - 10], [x, row + 10]);
    use({ kind: 'road', road: 1 }, [x0 + 4, row - 10], [x0 + 16, row - 10]); use({ kind: 'road', road: 1 }, [x0 + 4, row + 10], [x0 + 16, row + 10]);
    use({ kind: 'zone', zone: 1 }, [x0 + 5, row - 9], [x0 + 9, row - 1]); use({ kind: 'zone', zone: 1 }, [x0 + 11, row - 9], [x0 + 15, row - 4]);
    use({ kind: 'zone', zone: 3 }, [x0 + 11, row - 3], [x0 + 15, row - 1]);
    use({ kind: 'zone', zone: 5 }, [x0 + 5, row + 1], [x0 + 9, row + 9]); use({ kind: 'zone', zone: 3 }, [x0 + 11, row + 1], [x0 + 15, row + 3]); use({ kind: 'zone', zone: 1 }, [x0 + 11, row + 4], [x0 + 15, row + 9]);
    const ok = { coal: place('coal', x0 + 1, row + 4), tower: place('tower', x0 + 2, row - 3), sewer: place('sewer', x0 + 2, row - 6) };
    // 発電所から区画へ送電線（道を越える）
    ok.line = use({ kind: 'power' }, [x0 + 2, row + 3], [x0 + 6, row + 3]);
    G.setSpeed(3);
    return { ok, funds: s.funds, spent: res.filter((r) => r[1] > 0).length };
  })()`);
  const sample = async (label) => report.samples.push({ label, ...(await page.evaluate(`(() => { const { G } = window.__city, st = G.sim.stats, s = G.sim.s; return { when: s.time.year + '-' + s.time.month, tod: Math.round(s.time.tod), fps: Math.round(G.fps), pop: st.residents, jobs: st.jobs.C + st.jobs.I + st.jobs.O, cars: G.sim.tr.vehicles.length, peds: G.crowd.peds.length, k: G.sim.model && G.sim.model.k, flow: Math.round(G.sim.tr.flow * 100), funds: s.funds, power: Math.round(st.power.demand) + '/' + Math.round(st.power.supply), stuck: G.sim.tr.stuck, msgs: G.sim.msgs.slice(-2).map((m) => m.text) }; })()`)) });
  const shot = async (name) => { const f = join(out, `city-${name}.png`); writeFileSync(f, Buffer.from(await page.screenshot(), 'base64')); report.shots.push(f); };
  // 時間を進める（とても速い = 4 倍。1か月は 12 秒）
  for (let m = 0; m < opt.months; m++) { await sleep(12000); await sample('month ' + (m + 1)); }
  // 見どころへ寄って、昼・夕方・夜を撮る
  const goTime = async (hour) => { await page.evaluate(`(() => { const { G } = window.__city; G.sim.s.time.tod = ${hour * 60}; G.setSpeed(1); const en = G.sim.s.entry; G.R.cam.z = 4; G.R.centerOn(en.len + 10, en.j); })()`); await sleep(2500); };
  await goTime(11); await shot('day'); await sample('day');
  await goTime(18.2); await shot('dusk');
  await goTime(21.5); await shot('night'); await sample('night');
  await page.evaluate(`(() => { const { G } = window.__city; G.R.cam.z = 6; const en = G.sim.s.entry; G.R.centerOn(en.len + 7, en.j); })()`); await sleep(1500); await shot('night-close');
  await page.evaluate(`(() => { const { G } = window.__city; G.sim.s.time.tod = 8 * 60; G.R.cam.z = 6; })()`); await sleep(2500); await shot('morning-close'); await sample('morning');
  await page.evaluate(`(() => { const { G } = window.__city; G.R.cam.z = 1; })()`); await sleep(1500); await shot('far');
  report.errors = await page.evaluate(`(window.__errs || []).slice(0, 5)`);
} finally { await page.close(); }
console.log(JSON.stringify(report, null, 1));

// 大きな街: 西は住宅、中央は商業とオフィス、東は工業。区画の角に施設を順に置く
async function bigCity() {
  try {
    await page.navigate(`${base}/os/games/machiakari/index.html?debug=1&start=1&size=80&seed=21&terrain=flat&funds=900000`);
    if (!(await page.waitFor('#app:not([hidden])'))) throw new Error('ゲームが始まりませんでした');
    report.big = await page.evaluate(`(async () => {
      const { G, apply } = window.__city; const S = await import('./js/core/sim.mjs');
      const s = G.sim.s; s.unlockAll = true; const row = s.entry.j, x0 = s.entry.len, N = s.N;
      localStorage.removeItem('machiakari-slot-auto'); localStorage.removeItem('machiakari-meta-auto');
      const road = (a, b, t = 1) => apply(s, { kind: 'road', road: t }, a, b);
      const X1 = Math.min(N - 2, x0 + 54), Y0 = row - 27, Y1 = row + 27;
      for (let x = x0; x <= X1; x += 6) road([x, Y0], [x, Y1], (x - x0) % 18 === 0 ? 2 : 1);
      for (let y = Y0; y <= Y1; y += 6) road([x0, y], [X1, y], (y - Y0) % 18 === 0 ? 2 : 1);
      road([0, row], [x0, row], 2);
      for (let y = Y0 + 1; y < Y1; y++) for (let x = x0 + 1; x < X1; x++) {
        if (s.road[y * N + x]) continue;
        const fx = (x - x0) / (X1 - x0);
        const z = fx < 0.42 ? ((x + y) % 7 === 0 ? 3 : (fx < 0.2 ? 1 : 2)) : fx < 0.62 ? ((x + y) % 3 === 0 ? 6 : 4) : 5;
        apply(s, { kind: 'zone', zone: z }, [x, y], [x, y]);
      }
      const svc = (key, x, y) => apply(s, { kind: 'svc', key }, [x, y], [x, y]).ok;
      let nth = 0;
      for (let by = Y0 + 1; by < Y1; by += 6) for (let bx = x0 + 1; bx < X1; bx += 6) svc(['clinic', 'fire', 'police', 'school', 'tower', 'sewer', 'park', 'metro', 'plaza'][nth++ % 9], bx, by);
      for (const [x, y] of [[X1 - 4, Y0 + 2], [X1 - 4, Y0 + 8], [X1 - 4, Y1 - 4], [X1 - 10, Y1 - 4], [X1 - 16, Y1 - 4]]) svc('coal', x, y);
      svc('hospital', x0 + 25, row + 2); svc('high', x0 + 13, row - 10); svc('univ', x0 + 31, row - 16); svc('sewer2', x0 + 1, Y1 - 4); svc('landmark', x0 + 26, row - 2);
      G.sim.opts.maxVehicles = 450;
      for (let k = 0; k < 24 * 30; k++) S.tick(G.sim);
      G.setSpeed(1);
      return { pop: G.sim.stats.residents, funds: s.funds };
    })()`);
    const shot = async (name) => { const f = join(out, `city-big-${name}.png`); writeFileSync(f, Buffer.from(await page.screenshot(), 'base64')); report.shots.push(f); };
    const at = async (hour, z, wait = 9000) => { await page.evaluate(`(() => { const { G } = window.__city; G.sim.s.time.tod = ${hour * 60}; G.R.cam.z = ${z}; const en = G.sim.s.entry; G.R.centerOn(en.len + 27, en.j + 2); })()`); await sleep(wait); };
    const sample = async (label) => report.samples.push({ label, ...(await page.evaluate(`(() => { const { G } = window.__city, st = G.sim.stats; return { pop: st.residents, cars: G.sim.tr.vehicles.length, peds: G.crowd.peds.length, k: G.sim.model.k, flow: Math.round(G.sim.tr.flow * 100), fps: Math.round(G.fps) }; })()`)) });
    await at(7.4, 4); await sample('rush'); await shot('rush');
    await at(7.9, 5, 3000); await shot('rush-close'); await sample('rush-close');
    await at(20.5, 3); await shot('night'); await sample('night');
    await at(20.8, 5, 3000); await shot('night-close');
    await at(12, 1, 3000); await shot('far');
  } finally { await page.close(); console.log(JSON.stringify(report, null, 1)); }
}
