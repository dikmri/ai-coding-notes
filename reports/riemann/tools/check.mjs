// reports/riemann/ のページを、画面なし・音なしの Chrome で操作して確かめる台本。
// 使い方: node reports/riemann/tools/check.mjs [--port 8797] [--shots] [--dark]
//   先に node tools/serve.mjs 8797 でページを出しておく。--shots でレポートの写真（reports/riemann/img/*.webp）も撮る。
//   --shots のときだけ、1 行版の生のファイル（GitHub、約 7.7 MB）を開いて写真を撮る
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from '../../../tools/lib/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const port = args.includes('--port') ? +args[args.indexOf('--port') + 1] : 8797;
const shots = args.includes('--shots');
const dark = args.includes('--dark');
const rawOnly = args.includes('--raw-only'); // 1 行版の写真だけを撮り直す
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : `http://localhost:${port}/reports/riemann/`;
const IMG = join(ROOT, 'reports/riemann/img');
const RAW = 'https://raw.githubusercontent.com/1337isnot1337/riemann-hypothesis-minimal/a035fea0c2d86e6f6dbcfc5a11e596daba2e0a7a/OneLineRH.lean';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'OK ' : 'NG '} ${name}${detail ? `  … ${detail}` : ''}`);
}
const text = (page, sel) => page.evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent || ''`);
async function waitText(page, sel, re, ms = 30000) {
  for (let t = 0; t < ms; t += 200) {
    const s = await text(page, sel);
    if (re.test(s)) return s;
    await sleep(200);
  }
  return null;
}
async function shot(page, sel, name, pad = 8) {
  if (!shots) return;
  // 上に固定された見出し帯が撮る範囲に重ならないよう、撮る間だけ隠す
  await page.evaluate(`document.querySelector('.masthead').style.visibility = 'hidden'; document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'start' })`);
  await sleep(400);
  const r = await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height }; })()`);
  const { data } = await page.send('Page.captureScreenshot', { format: 'webp', quality: 88, captureBeyondViewport: true, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + 2 * pad, height: r.h + 2 * pad, scale: 1 } });
  mkdirSync(IMG, { recursive: true });
  writeFileSync(join(IMG, `${name}.webp`), Buffer.from(data, 'base64'));
  await page.evaluate(`document.querySelector('.masthead').style.visibility = ''`);
  console.log(`   写真: reports/riemann/img/${name}.webp（${Math.round(r.w + 2 * pad)}×${Math.round(r.h + 2 * pad)}）`);
}
async function setSigma(page, v) {
  await page.evaluate(`(() => { const s = document.getElementById('sigma'); s.value = ${v}; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(300);
}
async function center(page, sel) {
  await page.evaluate(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' })`);
  await sleep(200);
  return page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
}

if (!rawOnly) {
const page = await openBrowser({ width: 1280, height: 900, dark, profile: join(ROOT, 'runtime/riemann-check-profile') });
try {
  await page.navigate(base);
  await page.waitFor('#prime-chart .line');
  const pr = await waitText(page, '#prime-readout', /素数は/);
  ok('素数の図: 100 万までで 78,498 個と出る', /素数は 78,498 個/.test(pr || ''), pr);
  ok('素数の図: 2,657 から先はどの点も帯の中', /どの点も帯の中/.test(pr || ''));
  const zr = await waitText(page, '#zeta-readout', /実部/);
  ok('ゼータの図: 実部 0.50 で零点 10 か所', /0 になる所が 10 か所/.test(zr || ''), zr);
  ok('ゼータの図: 見つけた零点が知られている値と同じ', /14\.13、21\.02、25\.01、30\.42、32\.94、37\.59、40\.92、43\.33、48\.01、49\.77/.test(zr || ''));

  // 指で触れると十字線と吹き出しが出る
  const r = await center(page, '#zeta-chart');
  const VW = await page.evaluate(`+document.getElementById('zeta-chart').getAttribute('viewBox').split(' ')[2]`);
  const tx = r.x + (56 + ((VW - 56 - 18) * 14.1347) / 50) * (r.w / VW);
  await page.move(tx, r.y + r.h / 2);
  await sleep(200);
  const tip = await text(page, '#zeta-tip');
  const tipShown = await page.evaluate(`!document.getElementById('zeta-tip').hidden`);
  ok('ゼータの図: 指を置くと吹き出しに値が出る', tipShown && /\|ζ\| = /.test(tip) && /\+ 14\.1\di/.test(tip), tip);
  await page.move(5, 5);

  // キーボード
  await page.evaluate(`document.getElementById('prime-chart').focus()`);
  await page.key('ArrowRight');
  await sleep(150);
  const ptip = await text(page, '#prime-tip');
  ok('素数の図: 図を選んで矢印のキーで値が出る', /x = [\d,]+/.test(ptip) && /本当の個数 π\(x\) = /.test(ptip), ptip);
  await page.key('End');
  await sleep(150);
  ok('素数の図: End で右の端（100 万）', /x = 1,000,000/.test(await text(page, '#prime-tip')), await text(page, '#prime-tip'));
  await page.evaluate(`document.getElementById('prime-chart').blur()`);

  // 1,000 万まで数える
  await page.evaluate(`(() => { const s = document.getElementById('prime-limit'); s.value = '10000000'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const pr7 = await waitText(page, '#prime-readout', /10,000,000 までに/);
  ok('素数の図: 1,000 万までで 664,579 個と出る', /素数は 664,579 個/.test(pr7 || ''), pr7);
  ok('素数の図: 1,000 万でも帯の中', /どの点も帯の中/.test(pr7 || ''));
  ok('負の数はマイナス記号で書く', /ずれは −339\.4/.test(pr7 || ''), pr7);

  // 実部をずらす
  await setSigma(page, 40);
  const z4 = await text(page, '#zeta-readout');
  const low4 = +(/一番小さいのは ([\d.]+)/.exec(z4) || [])[1];
  ok('ゼータの図: 実部 0.40 では 0 にならない（一番小さいのは約 0.083）', /0 になりません/.test(z4) && Math.abs(low4 - 0.0827) < 0.002, z4);
  await setSigma(page, 60);
  const z6 = await text(page, '#zeta-readout');
  ok('ゼータの図: 実部 0.60 でも 0 にならない', /0 になりません/.test(z6), z6);
  await setSigma(page, 49);
  ok('ゼータの図: 実部 0.49（線のすぐ横）でも 0 にならない', /0 になりません/.test(await text(page, '#zeta-readout')), await text(page, '#zeta-readout'));
  await page.evaluate(`document.querySelector('[data-sigma="50"]').click()`);
  await sleep(300);
  ok('ゼータの図: 0.50 のボタンで戻る', /0 になる所が 10 か所/.test(await text(page, '#zeta-readout')) && (await text(page, '#sigma-out')) === '0.50');

  // 写真（パネルごと）
  if (shots) {
    await page.evaluate(`(() => { const s = document.getElementById('prime-limit'); s.value = '10000000'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitText(page, '#prime-readout', /10,000,000 までに/);
    await page.evaluate(`(() => { const p = document.getElementById('prime-h').closest('section'); p.id = 'prime-panel'; document.getElementById('zeta-h').closest('section').id = 'zeta-panel'; })()`);
    await shot(page, '#prime-panel', 'primes');
    await setSigma(page, 50);
    await shot(page, '#zeta-panel', 'zeta-05');
    await setSigma(page, 40);
    await shot(page, '#zeta-panel', 'zeta-04');
    await setSigma(page, 50);
  }
  const over = await page.evaluate('document.documentElement.scrollWidth - innerWidth');
  ok('幅 1280 で横にはみ出さない', over <= 0, `はみ出し ${over}px`);
  ok('ここまでにページのエラーが無い', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' / '));
} finally {
  await page.close();
}

// スマホの幅
const phone = await openBrowser({ width: 390, height: 844, dark, profile: join(ROOT, 'runtime/riemann-check-profile') });
try {
  await phone.navigate(base);
  await waitText(phone, '#zeta-readout', /実部/);
  const over = await phone.evaluate('document.documentElement.scrollWidth - innerWidth');
  ok('幅 390 で横にはみ出さない', over <= 0, `はみ出し ${over}px`);
  ok('幅 390 でもエラーが無い', phone.consoleErrors.length === 0, phone.consoleErrors.slice(0, 3).join(' / '));
  if (shots) {
    await phone.evaluate(`document.getElementById('zeta-h').scrollIntoView({ block: 'start' }); scrollBy(0, -70)`);
    await sleep(500);
    writeFileSync(join(IMG, 'phone.webp'), Buffer.from((await phone.send('Page.captureScreenshot', { format: 'webp', quality: 88 })).data, 'base64'));
    console.log('   写真: reports/riemann/img/phone.webp');
  }
} finally {
  await phone.close();
}
}

// 1 行版の生のファイル（--shots のときだけ。GitHub から読む）
if (shots || rawOnly) {
  const raw = await openBrowser({ width: 1280, height: 150, dark: false, profile: join(ROOT, 'runtime/riemann-check-profile') });
  try {
    // 1 行版を直接開くと、Chrome が 760 万バイトの文字を並べる所で止まる。そこで手元のページから fetch で全文を読み、
    // 文字数と行数を数えてから、先頭の 6,000 文字だけを Chrome の文字のファイルの見た目（等幅・白地）で、折り返さずに表示する
    await raw.navigate(base);
    const { len, lines } = await raw.evaluate(`(async () => {
      const t = await (await fetch(${JSON.stringify(RAW)})).text();
      const r = { len: [...t].length, lines: t.split('\\n').filter(Boolean).length };
      document.head.innerHTML = '<style>html,body{margin:0;background:#fff;color:#000}pre{margin:8px;font:13px/1.45 monospace;white-space:pre}</style>';
      document.body.innerHTML = '<pre></pre>';
      document.querySelector('pre').textContent = t.slice(0, 6000);
      return r;
    })()`);
    await sleep(500);
    ok('1 行版を開くと、文字が 1 行に並ぶ', lines === 1, `${len.toLocaleString()} 文字、${lines} 行`);
    writeFileSync(join(IMG, 'oneline-raw.webp'), Buffer.from((await raw.send('Page.captureScreenshot', { format: 'webp', quality: 88 })).data, 'base64'));
    console.log('   写真: reports/riemann/img/oneline-raw.webp');
  } finally {
    await raw.close();
  }
}
console.log(`\n${pass} 件通過、${fail} 件失敗`);
process.exit(fail ? 1 : 0);
