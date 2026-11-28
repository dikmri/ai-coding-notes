// reports/ippitsu/ のレポートとプレーヤーを、画面なし・音なしの Chrome で通しで確かめる台本。
// 使い方: node reports/ippitsu/tools/check.mjs [--port 8799] [--base <URL>] [--shots]
//   先に node tools/serve.mjs 8799 でページを出しておく。--base で公開版も確かめられる。
//   --shots で build/ippitsu/shots/ に画面の写真を残す。
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from '../../../tools/lib/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const port = args.includes('--port') ? +args[args.indexOf('--port') + 1] : 8799;
const base = args.includes('--base') ? args[args.indexOf('--base') + 1].replace(/\/?$/, '/') : `http://localhost:${port}/reports/ippitsu/`;
const SHOTS = args.includes('--shots') ? join(ROOT, 'build', 'ippitsu', 'shots') : null;
const DL = join(ROOT, 'build', 'ippitsu', `dl-${process.pid}`);
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(DL, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const bench = [];
function ok(name, cond, detail = '') {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'OK ' : 'NG '} ${name}${detail ? `  … ${detail}` : ''}`);
}

const page = await openBrowser({ width: 1440, height: 900, profile: join(ROOT, 'build', 'ippitsu', `check-profile-${process.pid}`) });
const shot = async (name) => { if (SHOTS) fs.writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(await page.screenshot(), 'base64')); };
const viewport = (width, height, mobile = false) => page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const ds = (k) => page.evaluate(`document.getElementById('player').dataset.${k} ?? ''`);
async function waitJob(prev, ms = 20000) {
  for (let t = 0; t < ms; t += 100) { const j = await ds('job'); if (j && j !== prev) return true; await sleep(100); }
  return false;
}

try {
  // ---------------- レポート
  await page.navigate(base);
  await page.waitFor('#player', 15000);
  const got = await waitJob('');
  ok('見本（港の漁師）を自動で読み、描き順ができる', got, `筆 ${await ds('strokes')}、${await ds('ms')} ms`);
  const rep = await page.evaluate(`(async () => {
    const imgs = [...document.images];
    for (const i of imgs) i.loading = 'eager';
    const settle = (i) => (i.complete && i.naturalWidth ? Promise.resolve() : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }));
    await Promise.race([Promise.all(imgs.map(settle)), new Promise((r) => setTimeout(r, 8000))]);
    return {
      broken: imgs.filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')),
      imgs: imgs.length, alts: imgs.filter((i) => !i.alt).length,
      videos: document.querySelectorAll('video').length,
      mp4: [...document.querySelectorAll('[src], [href]')].some((e) => (e.getAttribute('src') || e.getAttribute('href')).split('?')[0].endsWith('.mp4')),
      fsShown: !document.getElementById('ip-fs').hidden, fsEnabled: document.fullscreenEnabled,
      h1: document.querySelector('h1').textContent,
    };
  })()`);
  ok('レポート: 画像がすべて読める', rep.broken.length === 0 && rep.imgs >= 3, `画像 ${rep.imgs} 枚、読めない ${rep.broken.join(',') || 'なし'}`);
  ok('レポート: 画像に代わりの文がある', rep.alts === 0);
  ok('レポート: 動画を置いていない', rep.videos === 0 && !rep.mp4);
  ok('レポート: 全画面のボタンは、使えるときだけ出る', rep.fsShown === rep.fsEnabled);

  // ---------------- 再生
  await sleep(1500);
  const i1 = Number(await page.evaluate(`document.getElementById('m-i').textContent`));
  await sleep(1500);
  const i2 = Number(await page.evaluate(`document.getElementById('m-i').textContent`));
  ok('自動で再生が始まり、筆の番号が進む', i2 > i1 && i1 >= 0, `${i1} → ${i2}`);
  await shot('inline-1440x900');
  // 記事の中ではスペースキーで再生を止めない
  await page.evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))`);
  await sleep(300);
  ok('記事の中のスペースキーでは一時停止しない', (await page.evaluate(`document.getElementById('ip-play').textContent`)) === '一時停止');
  // 紙にフォーカスしてスペース → 一時停止
  await page.evaluate(`(() => { const w = document.querySelector('.ip-paper-wrap'); w.focus(); w.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); })()`);
  await sleep(200);
  ok('紙の上のスペースキーで一時停止する', (await page.evaluate(`document.getElementById('ip-play').textContent`)) === '再生');
  const a = Number(await page.evaluate(`document.getElementById('m-i').textContent`));
  await page.evaluate(`document.getElementById('ip-step').click()`);
  await sleep(150);
  const b = Number(await page.evaluate(`document.getElementById('m-i').textContent`));
  ok('「1 筆進む」で筆の番号が 1 つ進む', b === a + 1, `${a} → ${b}`);
  await page.evaluate(`document.getElementById('ip-end').click()`);
  await sleep(300);
  const [ie, ne] = await page.evaluate(`[document.getElementById('m-i').textContent, document.getElementById('m-n').textContent]`);
  ok('「描き上がり」で全部の筆を描く', Number(ie) === Number(ne) && Number(ne) > 100, `${ie} / ${ne}`);
  // 描き上がりの紙に、白でない画素が十分ある
  const inked = await page.evaluate(`(() => { const c = document.getElementById('ip-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 128) n++; return n / (d.length / 16); })()`);
  ok('描き上がりの紙に線が描かれている', inked > 0.03 && inked < 0.6, `黒い画素 ${(inked * 100).toFixed(1)}%`);
  await shot('finished-fisher');
  await page.evaluate(`document.getElementById('ip-restart').click()`);
  await sleep(200);
  await page.evaluate(`document.getElementById('ip-play').click()`);
  await sleep(100);
  ok('「最初から」で 0 筆目に戻る', Number(await page.evaluate(`document.getElementById('m-i').textContent`)) <= 5);

  // ---------------- 書き出し
  await page.raw('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await page.evaluate(`document.getElementById('ip-png').click()`);
  await page.evaluate(`document.getElementById('ip-svg').click()`);
  let files = [];
  for (let t = 0; t < 80 && files.filter((f) => /\.(png|svg)$/.test(f)).length < 2; t++) { await sleep(100); files = fs.readdirSync(DL); }
  const png = files.find((f) => f.endsWith('.png')), svg = files.find((f) => f.endsWith('.svg'));
  if (png) {
    const buf = fs.readFileSync(join(DL, png));
    const hasText = buf.includes(Buffer.from('iTXt')) && buf.includes(Buffer.from('プログラム'));
    const colorType = buf[25]; // IHDR の色の種類（6 = RGBA）
    ok('PNG を書き出せ、透過つきで、プログラムが描いたことの説明が入っている', hasText && colorType === 6, `${png}（${buf.length} バイト）`);
  } else ok('PNG を書き出せる', false, `見つかったファイル: ${files.join(',')}`);
  if (svg) {
    const text = fs.readFileSync(join(DL, svg), 'utf8');
    const paths = (text.match(/<(path|circle) /g) || []).length;
    ok('SVG を書き出せ、筆の数だけ道筋がある', paths === Number(await ds('strokes')) && /<desc>[^<]*プログラム/.test(text), `${paths} 本`);
  } else ok('SVG を書き出せる', false);

  // ---------------- 見本 4 枚の処理の時間
  for (const key of ['fisher', 'rain', 'stairs', 'street']) {
    const prev = await ds('job');
    await page.evaluate(`document.querySelector('[data-sample="${key}"]').click()`);
    const done = await waitJob(prev);
    const r = { key, done, strokes: +(await ds('strokes')), hatch: +(await ds('hatch')), mode: await ds('mode'), ms: +(await ds('ms')), size: await ds('size') };
    bench.push(r);
    ok(`見本 ${key}: 描き順ができる`, done && r.strokes > 100, `${r.mode} ${r.size}、筆 ${r.strokes}（斜線 ${r.hatch}）、${r.ms} ms`);
    if (key === 'stairs') ok('線画は「線画」と見分けられ、斜線を引かない', r.mode === 'lineart' && r.hatch === 0);
    if (key === 'rain') { await sleep(4000); await shot('playing-rain'); }
  }

  // ---------------- 画像を選ぶ（ファイルの入力）
  {
    const { root } = await page.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#ip-file' });
    const prev = await ds('job');
    await page.send('DOM.setFileInputFiles', { nodeId, files: [join(ROOT, 'reports', 'neko', 'img', 'final-0001.webp')] });
    const done = await waitJob(prev);
    const pressed = await page.evaluate(`[...document.querySelectorAll('[data-sample][aria-pressed="true"]')].length`);
    ok('「画像を選ぶ」で選んだ画像を処理できる', done && +(await ds('strokes')) > 50 && pressed === 0, `筆 ${await ds('strokes')}`);
  }
  // 画像でないファイルは、エラーにせず知らせる
  {
    const bad = join(DL, 'not-image.png');
    fs.writeFileSync(bad, 'これは画像ではありません');
    const { root } = await page.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#ip-file' });
    await page.send('DOM.setFileInputFiles', { nodeId, files: [bad] });
    await sleep(800);
    const msg = await page.evaluate(`document.getElementById('ip-status').textContent`);
    ok('読めない画像は、画面で知らせる', /読めませんでした/.test(msg), msg);
  }
  // 斜線の量を 0 にすると、斜線の無い描き順に作り直す
  {
    await page.evaluate(`document.querySelector('[data-sample="fisher"]').click()`);
    await waitJob(await ds('job'));
    const prev = await ds('job');
    await page.evaluate(`(() => { const r = document.getElementById('ip-hatch'); r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitJob(prev);
    ok('斜線の量 0 で、斜線の無い描き順になる', +(await ds('hatch')) === 0 && (await page.evaluate(`document.getElementById('ip-hatch-v').textContent`)) === 'なし', `斜線 ${await ds('hatch')}`);
    await page.evaluate(`(() => { const r = document.getElementById('ip-hatch'); r.value = '5'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitJob(await ds('job'));
  }
  // 斜線の描き方を「格子」に切り替えると作り直し、「人の描き方」に戻せる
  {
    const handHatch = +(await ds('hatch'));
    const setStyle = (v) => page.evaluate(`(() => { const s = document.getElementById('ip-hstyle'); s.value = '${v}'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    let prev = await ds('job');
    await setStyle('grid');
    await waitJob(prev);
    const gridHatch = +(await ds('hatch'));
    prev = await ds('job');
    await setStyle('hand');
    await waitJob(prev);
    const back = +(await ds('hatch'));
    ok('斜線の描き方を切り替えると描き順を作り直し、元に戻せる', gridHatch > 0 && gridHatch !== handHatch && back === handHatch, `人の描き方 ${handHatch} 本、格子 ${gridHatch} 本、戻して ${back} 本`);
    // 人の描き方では、斜線の「いまの筆」に段の番号が出る
    await page.evaluate(`document.getElementById('ip-end').click()`);
    await sleep(200);
    ok('いまの筆の種類に、斜線の段が出る', /斜線 \d 段目/.test(await page.evaluate(`document.querySelector('#m-cur [data-k="kind"]').textContent`)));
    // 点描に切り替えると、点で陰影を描き、段の名前が「点描」になる。描き上がりまで描け、SVG に点が円で出る
    prev = await ds('job');
    await setStyle('stipple');
    await waitJob(prev, 30000);
    const dots = +(await ds('hatch'));
    const stageNames = await page.evaluate(`[...document.querySelectorAll('#m-stages .ip-sname')].map((e) => e.textContent).join('/')`);
    await page.evaluate(`document.getElementById('ip-end').click()`);
    await sleep(500);
    const kindText = await page.evaluate(`document.querySelector('#m-cur [data-k="kind"]').textContent`);
    ok('陰影の描き方を「点描」にすると、点で陰影を描く', dots > 5000 && /点描$/.test(stageNames) && kindText === '点描の点', `点 ${dots} 個、段 ${stageNames}、いまの筆 ${kindText}`);
    await shot('stipple-finished');
    // 画面なしの Chrome は同じ名前のファイルを上書きする。クリックの前の更新時刻を覚えておき、
    // 新しくできたか更新された .svg の書き込みが終わる（大きさが止まる）まで待つ
    const before = new Map(fs.readdirSync(DL).map((n) => [n, fs.statSync(join(DL, n)).mtimeMs]));
    await page.evaluate(`document.getElementById('ip-svg').click()`);
    let svgFile = null, lastSize = -1;
    for (let t = 0; t < 150; t++) {
      await sleep(100);
      const f = fs.readdirSync(DL).find((n) => n.endsWith('.svg') && (!before.has(n) || fs.statSync(join(DL, n)).mtimeMs > before.get(n)));
      if (!f) continue;
      const size = fs.statSync(join(DL, f)).size;
      if (size > 0 && size === lastSize) { svgFile = join(DL, f); break; }
      lastSize = size;
    }
    const circles = svgFile ? (fs.readFileSync(svgFile, 'utf8').match(/<circle /g) || []).length : 0;
    ok('点描の SVG では、点が円で書き出される', circles === dots, `円 ${circles} 個`);
    // 点描だけ（主線なし）: 段は「点描」の 1 つだけで、筆はすべて点
    prev = await ds('job');
    await setStyle('stipple-only');
    await waitJob(prev, 30000);
    const onlyStages = await page.evaluate(`[...document.querySelectorAll('#m-stages .ip-sname')].map((e) => e.textContent).join('/')`);
    ok('「点描だけ（主線なし）」では、線を描かず点だけで描く', onlyStages === '点描' && +(await ds('strokes')) === +(await ds('hatch')), `段 ${onlyStages}、筆 ${await ds('strokes')}、点 ${await ds('hatch')}`);
    // ベタと点描: 段に「ベタ」が入り、描き上がりの紙に真っ黒な所がある
    prev = await ds('job');
    await setStyle('beta-stipple');
    await waitJob(prev, 30000);
    const betaStages = await page.evaluate(`[...document.querySelectorAll('#m-stages .ip-sname')].map((e) => e.textContent).join('/')`);
    await page.evaluate(`document.getElementById('ip-end').click()`);
    await sleep(600);
    const solid = await page.evaluate(`(() => { const c = document.getElementById('ip-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, all = 0; for (let i = 0; i < d.length; i += 16) { all++; if (d[i] < 40) n++; } return n / all; })()`);
    ok('「ベタと点描」では、ベタの段があり、黒く塗った所ができる', betaStages === '長い輪郭/中くらいの線/短い線/ベタ/点描' && solid > 0.03, `段 ${betaStages}、真っ黒な画素 ${(solid * 100).toFixed(1)}%`);
    await shot('beta-finished');
    // 層の表示の切り替え: 描いていない層（斜線）は押せない。ベタを消すと真っ黒な所が減り、全部消すと白紙になる
    // 画素を何度も読み出したキャンバスは、Chrome が描き方を切り替え、細い点や線のふちの灰色の出方が変わる。
    // そこで、ふちの影響を受けない「真っ黒な画素」と「白でない画素」を数える
    const dark = () => page.evaluate(`(() => { const c = document.getElementById('ip-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, any = 0, all = 0; for (let i = 0; i < d.length; i += 16) { all++; if (d[i] < 40) s++; if (d[i] < 250) any++; } return { solid: s / all, any: any / all }; })()`);
    const setLayer = (id, on) => page.evaluate(`(() => { const b = document.getElementById('${id}'); b.checked = ${on}; b.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const hatchDisabled = await page.evaluate(`document.getElementById('ip-show-hatch').disabled`);
    const allOn = await dark();
    await setLayer('ip-show-fill', false);
    await sleep(300);
    const noFill = await dark();
    await setLayer('ip-show-line', false); await setLayer('ip-show-dot', false);
    await sleep(300);
    const none = await dark();
    ok('層の表示: 描いていない斜線は押せず、ベタを消すと真っ黒な所が減り、全部消すと白紙になる', hatchDisabled && noFill.solid < allOn.solid * 0.4 && none.any < 0.0005,
      `真っ黒な画素 ${(allOn.solid * 100).toFixed(1)}% → ベタなし ${(noFill.solid * 100).toFixed(1)}%、全部なしの墨 ${(none.any * 100).toFixed(2)}%`);
    // 点描だけ表示して SVG を書き出すと、点（円）だけが出る
    await setLayer('ip-show-dot', true);
    await sleep(200);
    const before2 = new Map(fs.readdirSync(DL).map((n) => [n, fs.statSync(join(DL, n)).mtimeMs]));
    await page.evaluate(`document.getElementById('ip-svg').click()`);
    let svg2 = null, last2 = -1;
    for (let t = 0; t < 150; t++) {
      await sleep(100);
      const f = fs.readdirSync(DL).find((n) => n.endsWith('.svg') && (!before2.has(n) || fs.statSync(join(DL, n)).mtimeMs > before2.get(n)));
      if (!f) continue;
      const size = fs.statSync(join(DL, f)).size;
      if (size > 0 && size === last2) { svg2 = fs.readFileSync(join(DL, f), 'utf8'); break; }
      last2 = size;
    }
    const nPath = svg2 ? (svg2.match(/<path /g) || []).length : -1, nCircle = svg2 ? (svg2.match(/<circle /g) || []).length : -1;
    ok('層の表示: 点描だけを表示して書き出すと、SVG は点だけになる', nPath === 0 && nCircle === +(await ds('hatch')), `道筋 ${nPath}、円 ${nCircle}`);
    await setLayer('ip-show-line', true); await setLayer('ip-show-fill', true);
    // ベタだけ・ベタと点描だけ（主線なし）
    prev = await ds('job');
    await setStyle('beta-only');
    await waitJob(prev, 30000);
    const onlyBeta = await page.evaluate(`[...document.querySelectorAll('#m-stages .ip-sname')].map((e) => e.textContent).join('/')`);
    const lineDisabled = await page.evaluate(`document.getElementById('ip-show-line').disabled && document.getElementById('ip-show-dot').disabled && !document.getElementById('ip-show-fill').disabled`);
    ok('「ベタだけ」では、ベタの段だけを描き、主線と点描の表示は押せない', onlyBeta === 'ベタ' && +(await ds('hatch')) === 0 && lineDisabled, `段 ${onlyBeta}、筆 ${await ds('strokes')}`);
    prev = await ds('job');
    await setStyle('beta-stipple-only');
    await waitJob(prev, 30000);
    const bso = await page.evaluate(`[...document.querySelectorAll('#m-stages .ip-sname')].map((e) => e.textContent).join('/')`);
    ok('「ベタと点描だけ（主線なし）」では、ベタ → 点描 の 2 段で描く', bso === 'ベタ/点描' && +(await ds('hatch')) > 5000, `段 ${bso}、点 ${await ds('hatch')}`);
    prev = await ds('job');
    await setStyle('hand');
    await waitJob(prev);
  }

  // ---------------- 1 画面に収まるか（ページいっぱい）
  for (const [w, h, mobile] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [390, 844, true]]) {
    await viewport(w, h, mobile);
    await page.evaluate(`document.getElementById('player').classList.contains('is-fit') || document.getElementById('ip-fit').click()`);
    await sleep(500);
    const m = await page.evaluate(`(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const paper = r('.ip-paper'), bar = r('.ip-bar-ctl'), top = r('.ip-top');
      const over = [...document.querySelectorAll('#player .ip-side, #player .ip-bar-ctl, #player .ip-top')].filter((e) => getComputedStyle(e).display !== 'none' && e.scrollHeight > e.clientHeight + 2).map((e) => e.className);
      return { paper: [paper.top, paper.bottom, paper.width], bar: bar.bottom, top: top.top, vh: innerHeight, vw: innerWidth, docScroll: document.documentElement.scrollHeight > innerHeight + 1 && getComputedStyle(document.documentElement).overflow !== 'hidden', over };
    })()`);
    const fits = m.paper[1] <= m.vh + 0.5 && m.bar <= m.vh + 0.5 && m.top >= -0.5 && m.paper[2] > 100 && m.over.length === 0;
    ok(`ページいっぱい ${w}×${h}: 紙と操作の帯が画面に収まり、はみ出す欄が無い`, fits, `紙の下端 ${Math.round(m.paper[1])}、帯の下端 ${Math.round(m.bar)}、画面 ${m.vh}、紙の幅 ${Math.round(m.paper[2])}${m.over.length ? `、はみ出し ${m.over.join(' / ')}` : ''}`);
    await shot(`fit-${w}x${h}`);
    await page.evaluate(`document.getElementById('ip-fit').click()`);
    await sleep(200);
    // ふだん（記事の中）でも、プレーヤーの高さは画面の高さ以下
    const inline = await page.evaluate(`(() => {
      const p = document.getElementById('player'); p.scrollIntoView();
      const over = [...p.querySelectorAll('.ip-side, .ip-bar-ctl, .ip-top')].filter((e) => getComputedStyle(e).display !== 'none' && e.scrollHeight > e.clientHeight + 2).map((e) => e.className);
      return { h: p.getBoundingClientRect().height, vh: innerHeight, over, wide: document.documentElement.scrollWidth > innerWidth + 1 };
    })()`);
    if (!mobile) ok(`記事の中 ${w}×${h}: プレーヤーが画面の高さに収まり、はみ出す欄が無い`, inline.h <= inline.vh && inline.over.length === 0, `${Math.round(inline.h)} / ${inline.vh}${inline.over.length ? `、はみ出し ${inline.over.join(' / ')}` : ''}`);
    else { ok(`記事の中 ${w}×${h}: ページが横にはみ出さない`, !inline.wide && inline.over.length === 0); await shot('inline-mobile'); }
  }
  await viewport(1440, 900);

  // 読めない画像を知らせる自分の記録（ippitsu.load.error）は、確かめのために起こしたものなので除く
  const errors = page.consoleErrors.filter((m) => !/^\S+ ippitsu\.load\.error /.test(m));
  ok('コンソールにエラーが無い', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await page.close();
}
console.log('\n見本ごとの処理:');
for (const r of bench) console.log(`  ${r.key}\t${r.size}\t${r.mode}\t筆 ${r.strokes}\t斜線 ${r.hatch}\t${r.ms} ms`);
console.log(`\n${pass} 件通過、${fail} 件失敗`);
process.exitCode = fail ? 1 : 0;
