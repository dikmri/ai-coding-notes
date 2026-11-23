// 通しで遊ぶ台本。画面なしの Chrome（音なし）で ?debug=1 を開き、本物のマウスとキーで 入店 → 台選び → 打つ → 閉店 → 退店 → 結果 を通す。
// 使い方: 先に node tools/serve.mjs 8793 を動かし、node dedama/tools/playthrough.mjs [--port 8793] [--shots <置き場>] [--full]
//   --full: 標準の速さのまま閉店まで遊び、12 時間が実時間で約 3 分になるかを測る（約 3 分かかる）
// 結果: 条件ごとの ○×、画面の写真（<置き場>/*.png、ゲームの画面そのもの 384×216 と、ページ全体）、<置き場>/playthrough.json
import { openBrowser } from '../../tools/lib/cdp.mjs';
import { writeFileSync, mkdirSync, rmSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MACHINES } from '../sim/machines.mjs';
import { todayRpk } from '../js/logic.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(arg('--port', 8793));
const SHOTS = arg('--shots', join(ROOT, '..', 'dedama-shots'));
const FULL = process.argv.includes('--full');
const APP_LOG = join(ROOT, 'logs', 'app.log');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(SHOTS, { recursive: true });
const PROFILE = join(SHOTS, '.profile');
rmSync(PROFILE, { recursive: true, force: true });
const logStart = existsSync(APP_LOG) ? statSync(APP_LOG).size : 0;

// カニ船長（4 台目）の種 1 は、21 連（虹色）・万発・逆万発が 1 日に全部入る。回転率が店の標準（17）になる日を選ぶ
const CRAB = MACHINES.findIndex((m) => m.id === 'crab');
let DAY = 1;
while (todayRpk(MACHINES[CRAB], DAY) !== MACHINES[CRAB].rpk) DAY++;
const URL0 = `http://localhost:${PORT}/dedama/?debug=1&seed=1&day=${DAY}`;

const results = [];
const note = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '○' : '×'} ${name}${detail ? `  ${detail}` : ''}`); };
let page;
const E = (body) => page.evaluate(`(() => { const D = window.__dedama, G = D.G; ${body} })()`);
const state = () => E('return D.state();');
async function waitFor(cond, ms = 15000, step = 50) { for (let t = 0; t < ms; t += step) { if (await E(`return !!(${cond});`)) return true; await sleep(step); } return false; }
async function shot(name) {
  const url = await E("return document.getElementById('screen').toDataURL('image/png');");
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  writeFileSync(join(SHOTS, `${name}-page.png`), Buffer.from(await page.screenshot(), 'base64'));
  console.log('   写真', name);
}
async function clickEl(sel) {
  const r = await E(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };`);
  if (!r) return false;
  await page.click(r.x, r.y);
  return true;
}
// 場面の時間を止めて写す（入店・退店の途中など）
async function freezeShot(scene, t, name) {
  await waitFor(`G.sceneName === '${scene}' && G.scene.t >= ${t}`, 12000, 20);
  await E(`const s = G.scene; s.__u = s.update; s.update = () => {};`);
  await sleep(120);
  await shot(name);
  await E(`const s = G.scene; s.update = s.__u;`);
}

try {
  page = await openBrowser({ width: 1280, height: 900, profile: PROFILE });
  await page.navigate(URL0);
  note('題名の画面が出る', await waitFor("window.__dedama && G.sceneName === 'title'", 20000), `日 ${DAY}`);
  await sleep(500);
  await shot('01-title');
  // 入店（本物のマウスで「店に行く」）
  await clickEl('#btn-start');
  note('「店に行く」で入店の場面', await waitFor("G.sceneName === 'entry'", 3000));
  await freezeShot('entry', 1.3, '02-entry-open');
  await freezeShot('entry', 3.0, '03-entry-talk');
  await freezeShot('entry', 4.7, '04-entry-dash');
  note('入店のあと台選び', await waitFor("G.sceneName === 'select'", 9000));
  // 台選び（キーで右へ 3 つ → カニ船長、Enter）
  for (let i = 0; i < CRAB; i++) { await page.key('ArrowRight'); await sleep(120); }
  note('← → で台を選べる', (await E('return G.machineIndex;')) === CRAB, `選んだ台 ${await E('return D.MACHINES[G.machineIndex].id;')}`);
  await sleep(400);
  await shot('05-select');
  await page.key('Enter');
  note('Enter で打ち始める', await waitFor("G.sceneName === 'play'", 3000));
  const st0 = await state();
  note('種と回転率が指定どおり', st0.seed === 1 && (await E('return G.play.rpk;')) === MACHINES[CRAB].rpk, `種 ${st0.seed}、回転率 ${await E('return G.play.rpk;')}`);
  // 標準の速さで 5 秒 → ゲーム内 20 分（240 倍）
  const tA = (await state()).t, wA = Date.now();
  await sleep(5000);
  const tB = (await state()).t, wB = Date.now();
  const rate = (tB - tA) / ((wB - wA) / 1000);
  note('標準の速さは 240 倍（12 時間が 3 分）', Math.abs(rate - 240) / 240 < 0.08, `${rate.toFixed(1)} 倍`);
  // 一時停止のボタン
  await clickEl('#btn-pause');
  const p1 = await state(); await sleep(800); const p2 = await state();
  note('一時停止で時間が止まる', p1.paused && p2.t === p1.t, `t ${Math.round(p1.t)} → ${Math.round(p2.t)}`);
  await clickEl('#btn-pause');
  note('再開で動き出す', !(await state()).paused);
  // 速さの部品（本物の range をキーで動かす）
  await clickEl('#speed');
  await E("document.getElementById('speed').value = '2'; document.getElementById('speed').dispatchEvent(new Event('input'));");
  for (let i = 0; i < 3; i++) { await page.key('ArrowRight'); await sleep(80); }
  const sp = await E("return { i: G.speedIndex, text: document.getElementById('speed').getAttribute('aria-valuetext') };");
  note('速さの部品で 8 倍にできる', sp.i === 5 && /8 倍/.test(sp.text), sp.text);
  const tC = (await state()).t, wC = Date.now();
  await sleep(2000);
  const rate8 = ((await state()).t - tC) / ((Date.now() - wC) / 1000);
  note('8 倍は 1,920 倍で進む', Math.abs(rate8 - 1920) / 1920 < 0.1, `${rate8.toFixed(0)} 倍`);
  await page.key('['); await page.key('[');
  await shot('06-play-early');

  if (FULL) {
    // 標準の速さで閉店まで（今のゲーム内時刻から残りを測る）
    await E('G.setSpeed(2);');
    const t0 = (await state()).t, w0 = Date.now();
    await waitFor('G.play.session.done', 240000, 500);
    const wall = (Date.now() - w0) / 1000, game = 43200 - t0;
    note('標準の速さで閉店まで遊べる（残りの時間 ÷ 240 と実時間が合う）', Math.abs(wall - game / 240) < 6, `実時間 ${wall.toFixed(1)} 秒、予定 ${(game / 240).toFixed(1)} 秒`);
  } else {
    // 確かめ用の 64 倍で進め、場面ごとに止めて写す
    await E('G.speedOverride = 64;');
    const moments = [
      ['07-first-hit', 'G.play.session.state.hitsTotal >= 1 && G.fx.list.length > 0'],
      ['08-gyaku', "S.play.seen.has('gyaku') && S.play.rain"],
      ['09-chain5', 'G.play.session.state.chain >= 5'],
      ['10-chain10', 'G.play.session.state.chain >= 10'],
      ['11-rainbow', 'G.play.session.state.chain >= 20'],
      ['12-wan', "S.play.seen.has('wan1')"],
    ];
    const S = 'const S = D.S;';
    for (const [name, cond] of moments) {
      const ok = await waitFor(`(() => { ${S} return ${cond}; })()`, 60000, 15);
      if (ok) { await E('G.paused = true;'); await sleep(150); await shot(name); await E('G.paused = false;'); }
      note(`場面: ${name}`, ok);
    }
    note('閉店する', await waitFor('G.play.session.done', 90000, 100));
  }
  const fin = await state();
  await freezeShot('play', 0, '13-closing').catch(() => {});
  note('閉店のあと退店の場面', await waitFor("G.sceneName === 'exit'", 8000));
  await freezeShot('exit', 2.0, '14-exit');
  note('退店のあと結果の画面', await waitFor("G.sceneName === 'result'", 9000));
  await sleep(1500);
  await shot('15-result');
  const res = await E('return { tier: G.scene.tier, yen: G.scene.yen };');
  note('結果の収支は差玉 × 4 円', res.yen === fin.sa * 4, `${res.yen} 円（差玉 ${fin.sa}）、段階 ${res.tier}`);
  // 晩ごはんの 5 段階（確かめ用の窓口で、その段階になる日を探して結果の画面を出す）
  for (const t of ['S', 'A', 'B', 'C', 'D']) {
    await E(`D.showResult('${t}');`);
    await sleep(2200);
    const got = await E('return G.scene.tier;');
    note(`晩ごはん ${t} の絵`, got === t && (await E("return !!document.getElementById('screen');")));
    await shot(`16-meal-${t}`);
  }
  // 記録
  await sleep(1200);
  const errors = page.consoleErrors.filter((e) => !/404|Failed to load resource/.test(e));
  note('コンソールにエラーが無い', errors.length === 0, errors.slice(0, 3).join(' / '));
  const log = existsSync(APP_LOG) ? readFileSync(APP_LOG, 'utf8').slice(logStart) : '';
  const lines = log.split('\n').filter((l) => l.includes(' dedama.'));
  const count = (re) => lines.filter((l) => re.test(l)).length;
  note('記録: 場面・操作・当たり・音が残る', count(/dedama\.scene\.enter/) >= 6 && count(/dedama\.ui\./) >= 5 && count(/dedama\.sim\.hit/) >= 10 && count(/dedama\.sound\.play/) >= 5,
    `scene ${count(/scene\.enter/)}・ui ${count(/dedama\.ui\./)}・hit ${count(/sim\.hit/)}・sound ${count(/sound\.play/)}・fanfare ${count(/"name":"fanfare"/)}・sad ${count(/audio\.sad/)}`);
  note('記録: 例外が無い', count(/result=exception|dedama\.exception/) === 0);
} catch (e) {
  note('台本が最後まで動く', false, String(e.stack || e).slice(0, 400));
} finally {
  await page?.close();
}
writeFileSync(join(SHOTS, 'playthrough.json'), JSON.stringify({ day: DAY, url: URL0, results }, null, 2));
const ng = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - ng} / ${results.length} が ○`);
process.exitCode = ng ? 1 : 0;
