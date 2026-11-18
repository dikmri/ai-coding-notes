// 上から見る版を画面なしの Chrome（音なし）で開き、操作を一通り試して確かめる（開発用）。
//   先に node tools/yugure-serve.mjs を動かしておく。 node tools/yugure-check.mjs [番号]
// 試すこと: タイトル → 合図 → W で加速 → D で右へ → C でカメラ → R で道へ戻る → Esc で一時停止と再開 → F の自動運転で 1 周
// 絵は shots/ に保存する。出来事は、サーバーが logs/play.log に残す。
import { openBrowser } from './lib/cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2]) || 8790;
const SHOTS = fileURLToPath(new URL('../shots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '○' : '×'} ${name}${detail ? ' ― ' + detail : ''}`); };

const page = await openBrowser({ width: 1280, height: 720, profile: fileURLToPath(new URL('../logs/profile-check-' + Date.now(), import.meta.url)) });
const state = () => page.evaluate('window.yugure && window.yugure.state()');
const shot = async (name) => writeFileSync(SHOTS + name + '.png', Buffer.from(await page.screenshot(), 'base64'));
try {
  await page.navigate(`http://127.0.0.1:${PORT}/game/top.html`);
  await page.waitFor('#title-dialog[open]', 15000);
  check('タイトルの窓が開く', true);
  await shot('01-title');

  await page.evaluate(`document.querySelector('#title-dialog button[value=start]').click()`);
  await sleep(3600);
  let s = await state();
  check('合図のあと走れる状態になる', s.phase === 'racing', `phase=${s.phase}`);

  await page.key('w', 'down'); await sleep(4000); await page.key('w', 'up');
  s = await state();
  check('W で加速する', s.speedKmh > 40, `${s.speedKmh.toFixed(0)} km/h、${s.gear} 速`);
  await shot('02-accel');

  const before = await page.evaluate('window.yugure.state().s');
  await page.key('d', 'down'); await sleep(1200); await page.key('d', 'up');
  s = await state();
  check('D で右へ曲がる（道の中心より右へ寄る）', s.lateral > 0.5 || s.surface === 'grass', `横のずれ ${s.lateral.toFixed(1)} m、路面 ${s.surface}`);

  await page.key('c'); await sleep(300);
  s = await state();
  check('C でカメラが北を上にする', s.cameraMode === 'north', s.cameraMode);
  await shot('03-north-up');
  await page.key('c'); await sleep(200);

  await page.key('r'); await sleep(400);
  s = await state();
  check('R で道の中央へ戻る', Math.abs(s.lateral) < 0.3 && s.speedKmh < 1, `横のずれ ${s.lateral.toFixed(2)} m、${s.speedKmh.toFixed(1)} km/h`);

  await page.key('Escape'); await sleep(400);
  const pausedOpen = await page.evaluate(`document.querySelector('#pause-dialog').open`);
  s = await state();
  check('Esc で一時停止の窓が開く', pausedOpen && s.paused);
  const t0 = s.time; await sleep(800);
  check('一時停止の間は時間が進まない', (await state()).time === t0);
  await shot('04-pause');
  await page.key('Escape'); await sleep(400);
  check('もう一度 Esc で再開する', !(await state()).paused);

  await page.key('f'); await sleep(300);
  check('F で自動運転が入る', (await state()).autopilot);
  let lap = 0;
  for (let i = 0; i < 150 && lap < 1; i++) { await sleep(1000); s = await state(); lap = s.lap; if (i === 30) await shot('05-autopilot'); }
  check('自動運転で 1 周する', lap >= 1, `最速 ${s.bestLapTime?.toFixed(2)} 秒、ガードレール ${s.barrierHits} 回`);
  await shot('06-lap');
  check('エラーが出ない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' / '));
} catch (error) {
  check('止まらずに最後まで試せる', false, error.message);
} finally {
  await page.close();
}
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? `失敗 ${failed} 件` : `すべて合格（${results.length} 件）`);
process.exit(failed ? 1 : 0);
