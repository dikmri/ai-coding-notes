// reports/fft/ のページを、画面なし・音なしの Chrome で通しで操作して確かめる台本。
// 使い方: node reports/fft/tools/check.mjs [--port 8796] [--shots] [--dark]
//   先に node tools/serve.mjs 8796 でページを出しておく。--shots でレポートの写真（reports/fft/img/*.webp）も撮る
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from '../../../tools/lib/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const port = args.includes('--port') ? +args[args.indexOf('--port') + 1] : 8796;
const shots = args.includes('--shots');
const base = `http://localhost:${port}/reports/fft/`;
const IMG = join(ROOT, 'reports/fft/img');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'OK ' : 'NG '} ${name}${detail ? `  … ${detail}` : ''}`);
}

// 2 秒の 440 Hz（左）と 440 Hz（右）のステレオ WAV（48 kHz、16 ビット）を作る
function makeWav(path) {
  const sr = 48000, n = sr * 2, ch = 2, data = Buffer.alloc(n * ch * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.round(0.5 * Math.sin((2 * Math.PI * 440 * i) / sr) * 32767);
    data.writeInt16LE(v, i * 4); data.writeInt16LE(v, i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22); h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * ch * 2, 28); h.writeUInt16LE(ch * 2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

async function waitText(page, sel, re, ms = 30000) {
  for (let t = 0; t < ms; t += 200) {
    const s = await page.evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent || ''`);
    if (re.test(s)) return s;
    await sleep(200);
  }
  return null;
}
const text = (page, sel) => page.evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent || ''`);
async function shot(page, sel, name, pad = 8) {
  if (!shots) return;
  await page.evaluate(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'start' })`);
  await sleep(400);
  const r = await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height }; })()`);
  const { data } = await page.send('Page.captureScreenshot', { format: 'webp', quality: 88, captureBeyondViewport: true, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad, scale: 1 } });
  mkdirSync(IMG, { recursive: true });
  writeFileSync(join(IMG, `${name}.webp`), Buffer.from(data, 'base64'));
  console.log(`   写真: reports/fft/img/${name}.webp（${Math.round(r.w + 2 * pad)}×${Math.round(r.h + 2 * pad)}）`);
}
const select = (page, id, value) => page.evaluate(`(() => { const s = document.getElementById(${JSON.stringify(id)}); s.value = ${JSON.stringify(String(value))}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const click = (page, sel) => page.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
const peakHz = (s) => { const m = /いちばん強い音 ([\d.]+) (k?Hz)/.exec(s); return m ? +m[1] * (m[2] === 'kHz' ? 1000 : 1) : NaN; };
async function seekTo(page, sec) {
  // スペクトログラムの上の、その秒の位置を押す
  const r = await page.evaluate(`(() => { const c = document.getElementById('sgram'); c.scrollIntoView({ block: 'center' }); const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
  await sleep(200);
  const L = 46, R = 12, dur = +(await page.evaluate('document.getElementById("sgram").dataset.duration'));
  await page.click(r.x + L + ((r.w - L - R) * sec) / dur, r.y + r.h / 2);
  await sleep(300);
}

const dark = args.includes('--dark');
const page = await openBrowser({ width: 1280, height: 900, dark, profile: join(ROOT, 'runtime/fft-check-profile') });
try {
  await page.navigate(base);
  ok('曲を合成し、曲全体のスペクトログラムを作る', !!(await waitText(page, '#sgram-cap-time', /曲全体: /)), await text(page, '#sgram-cap-time'));
  ok('状態の欄に曲を用意したと出る', /夜の和音.*用意しました/.test(await text(page, '#status')), await text(page, '#status'));
  ok('止まっている間も、0 秒の所のスペクトルを出す', /0\.00 秒/.test(await text(page, '#peak')), await text(page, '#peak'));
  await seekTo(page, 6);
  ok('スペクトログラムを押すと、その位置のスペクトルになる', /^[56]\.\d\d 秒: いちばん強い音/.test(await text(page, '#peak')), await text(page, '#peak'));

  await click(page, '#play');
  await sleep(1500);
  const pressed = await page.evaluate(`document.getElementById('play').getAttribute('aria-pressed')`);
  const t1 = parseFloat(await text(page, '#peak'));
  ok('再生すると位置が進む', pressed === 'true' && t1 > 6.5, `位置 ${t1} 秒`);
  ok('FFT 1 回の時間を出す（速い版）', /速い版・長さ 2,048 の FFT 1 回: [\d.]+ µs/.test(await text(page, '#fft-time')), await text(page, '#fft-time'));
  await shot(page, '#tool', 'tool-arp');
  await select(page, 'engine', 'radix2');
  ok('方法を基数 2 にすると、スペクトログラムを作り直す', !!(await waitText(page, '#sgram-cap-time', /基数 2/)), await text(page, '#sgram-cap-time'));
  await sleep(600);
  ok('FFT 1 回の時間も基数 2 になる', /基数 2・長さ 2,048/.test(await text(page, '#fft-time')), await text(page, '#fft-time'));
  await select(page, 'size', 8192);
  ok('長さ 8,192 にすると作り直す', !!(await waitText(page, '#sgram-cap-time', /8,192/)), await text(page, '#sgram-cap-time'));
  await click(page, '#play');
  await sleep(300);
  ok('止めるボタンで止まる', (await page.evaluate(`document.getElementById('play').getAttribute('aria-pressed')`)) === 'false');
  await select(page, 'engine', 'fast');
  await select(page, 'size', 2048);

  await click(page, 'input[value="drums"]');
  ok('曲を「ドラムとベース」に替える', !!(await waitText(page, '#status', /ドラムとベース.*用意しました/)), await text(page, '#status'));
  await waitText(page, '#sgram-cap-time', /曲全体: /);
  await seekTo(page, 3);
  await shot(page, '#tool', 'tool-drums');

  await click(page, 'input[value="sweep"]');
  await waitText(page, '#status', /上がる音と鐘と口笛.*用意しました/);
  await waitText(page, '#sgram-cap-time', /曲全体: /);
  await seekTo(page, 4);
  const sweepAt = parseFloat(await text(page, '#peak'));
  const f4 = peakHz(await text(page, '#peak'));
  const want = 80 * 100 ** (sweepAt / 8);
  ok('上がる音: 押した位置の一番強い音が、式 80·100^(t/8) の値に近い', Math.abs(f4 - want) / want < 0.05, `${sweepAt} 秒で ${f4} Hz（式では ${want.toFixed(0)} Hz）`);
  await seekTo(page, 10.2);
  await shot(page, '#tool', 'tool-sweep');

  // 交互の測定
  await click(page, 'input[value="arp"]');
  await waitText(page, '#sgram-cap-time', /曲全体: /);
  await click(page, '#bench-run');
  const bs = await waitText(page, '#bench-status', /測り終えました|測れません/, 180000);
  ok('交互の測定が終わる', /測り終えました/.test(bs || ''), bs);
  const rows = await page.evaluate(`[...document.querySelectorAll('#bench-table tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))`);
  for (const r of rows) console.log('     ', r.join(' | '));
  ok('5 つの長さすべてで結果が出る', rows.length === 5);
  ok('誤差は 4,096 まで 10^-14 より小さい', rows.slice(0, 3).every((r) => /×10-1[5-9]/.test(r[4]) && /×10-1[5-9]/.test(r[5])), rows.slice(0, 3).map((r) => `${r[4]} ${r[5]}`).join(' / '));
  await shot(page, '#bench', 'bench');

  // 論文の模型
  await page.evaluate(`(() => { const w = document.getElementById('win'); w.value = 6; w.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click(page, '#model-run');
  const ms = await waitText(page, '#model-status', /計算し終えました|計算できません/, 240000);
  ok('模型の計算が終わる', /計算し終えました/.test(ms || ''), ms);
  const mrows = await page.evaluate(`[...document.querySelectorAll('#model-table tbody tr')].map((tr) => tr.children[0].textContent + '：' + tr.children[1].textContent)`);
  for (const r of mrows) console.log('     ', r);
  // 「最大 2.4×10⁻⁷ の差」を数に直す
  const st = await text(page, '#model-status');
  const mm = /最大 ([\d.]+)×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+) の差/.exec(st);
  const md = mm ? +mm[1] * 10 ** +[...mm[2]].map((c) => (c === '⁻' ? '-' : String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)))).join('') : NaN;
  ok('修理のあとの答えが、ふつうの変換と 10^-6 より小さい差で一致する', md < 1e-6, String(md));
  await shot(page, '#model', 'model');

  // 自分の音声ファイル
  const wav = join(ROOT, 'runtime/fft-check-440.wav');
  mkdirSync(dirname(wav), { recursive: true });
  makeWav(wav);
  await page.send('DOM.enable');
  const { root } = await page.send('DOM.getDocument', {});
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#file' });
  await page.send('DOM.setFileInputFiles', { nodeId, files: [wav] });
  ok('音声ファイルを読む', !!(await waitText(page, '#status', /読みました/)), await text(page, '#status'));
  await waitText(page, '#sgram-cap-time', /曲全体: /);
  await seekTo(page, 1);
  const f440 = peakHz(await text(page, '#peak'));
  ok('読んだ 440 Hz の音のピークが 440 Hz（A4）になる', Math.abs(f440 - 440) < 1 && /A4/.test(await text(page, '#peak')), await text(page, '#peak'));
  ok('ファイルの欄の名前と説明が変わる', /fft-check-440\.wav/.test(await text(page, '#file-name')) && /2 チャンネル.*48000 Hz/.test(await text(page, '#piece-desc')), await text(page, '#piece-desc'));
  await shot(page, '#tool', 'tool-file');
  ok('ここまでにページのエラーが無い', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' / '));
} finally {
  await page.close();
}

// スマホの幅（横にはみ出さないか、キャンバスの幅 0 の瞬間にエラーが出ないか）
const phone = await openBrowser({ width: 390, height: 844, dark, profile: join(ROOT, 'runtime/fft-check-profile') });
try {
  await phone.navigate(base);
  await waitText(phone, '#sgram-cap-time', /曲全体: /);
  const over = await phone.evaluate('document.documentElement.scrollWidth - innerWidth');
  ok('幅 390 で横にはみ出さない', over <= 0, `はみ出し ${over}px`);
  ok('幅 390 でもエラーが無い', phone.consoleErrors.length === 0, phone.consoleErrors.slice(0, 3).join(' / '));
  if (shots) {
    await phone.evaluate(`document.getElementById('tool').scrollIntoView({ block: 'start' })`);
    await sleep(500);
    writeFileSync(join(IMG, 'phone.webp'), Buffer.from((await phone.send('Page.captureScreenshot', { format: 'webp', quality: 88 })).data, 'base64'));
    console.log('   写真: reports/fft/img/phone.webp');
  }
} finally {
  await phone.close();
}
console.log(`\n${pass} 件通過、${fail} 件失敗`);
process.exit(fail ? 1 : 0);
