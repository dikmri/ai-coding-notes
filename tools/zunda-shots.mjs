// 図鑑の項目「コードで描いたずんだもんを立体的に動かす」（entries/zunda.js）を、向きや姿勢を変えながら撮る道具。
// 使い方: node tools/zunda-shots.mjs <名前> [--port 8771] [--size 760x1260] [--set '<JSON の配列>'] [--cols 0] [--scale 0.5]
//   --set: 撮る 1 枚ごとの状態（window.__zunda.state に入れる値）。既定は首の向き（yaw）を -180〜180 度まで 45 度ずつ
//   出力: build/zunda/shots/<名前>-<番号>.png と、縮めて並べた build/zunda/shots/<名前>.png（git の対象外。元の絵を写したものなので公開しない）
// 手元のサーバー（tools/serve.mjs）が動いていなければ、この道具が動かし、終わったら止める。
// 図鑑のページ（index.html）を開き、この項目を DekiruApp.buildDoc で組み立てた文書でページを置き換えて撮る（図鑑の中と同じ組み立て方）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { openBrowser } from './lib/cdp.mjs';
import { decodePng, encodePng, downscale } from './lib/image.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const NAME = args[0];
if (!NAME || NAME.startsWith('--')) { console.error('使い方: node tools/zunda-shots.mjs <名前> [--port 8771] [--size 760x1260] [--set JSON] [--scale 0.5]'); process.exit(1); }
const PORT = Number(opt('--port', 8771));
const [VW, VH] = opt('--size', '760x1260').split('x').map(Number);
const SCALE = Number(opt('--scale', 0.5));
const D2R = Math.PI / 180;
const SETS = opt('--set') ? JSON.parse(opt('--set')) : [-180, -135, -90, -60, -30, 0, 30, 60, 90, 135].map((d) => ({ auto: false, yaw: d * D2R, pitch: 0 }));
const OUT = join(ROOT, 'build/zunda/shots');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function up() { try { const r = await fetch(`http://localhost:${PORT}/index.html`); return r.ok; } catch { return false; } }
let server = null;
if (!(await up())) {
  server = spawn(process.execPath, [join(ROOT, 'tools/serve.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await sleep(100);
}
const page = await openBrowser({ width: VW, height: VH, profile: join(ROOT, 'runtime/zunda-profile') });
const files = [];
try {
  await page.navigate(`http://localhost:${PORT}/index.html`);
  await page.waitFor('#grid');
  const entrySrc = readFileSync(join(ROOT, 'entries/zunda.js'), 'utf8');
  // 文書を作る所と、ページを置き換える所を分ける（置き換えると、そのスクリプトの戻り値が失われる）
  const len = await page.evaluate(`(() => {
    // 図鑑にまだ載せていないときは、項目のファイルを読んで足し、表示用のコード（e.src）を作り直す
    if (!dekiru.entries.some((e) => e.id === '3d-zunda-move')) { (0, eval)(${JSON.stringify(entrySrc)}); dekiru.finalize(); }
    const e = dekiru.entries.find((x) => x.id === '3d-zunda-move');
    window.__doc = window.DekiruApp.buildDoc(e, { mode: 'detail' }).doc;
    return window.__doc.length;
  })()`);
  if (!len) throw new Error('項目を組み立てられない');
  await page.evaluate(`setTimeout(() => { const d = window.__doc; document.open(); document.write(d); document.close(); }, 0); true`);
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(100); ready = await page.evaluate('!!(window.__zunda && window.__zunda.ready)'); }
  if (!ready) throw new Error('20 秒待っても window.__zunda.ready にならない（エラー: ' + await page.evaluate('String(window.__err || "")') + '）');
  // --rebuild '<JSON>': 撮る前に、貼り方などを変えて部分を作り直す（window.__zunda.rebuild）
  if (opt('--rebuild')) await page.evaluate(`window.__zunda.rebuild(${opt('--rebuild')})`);
  for (let k = 0; k < SETS.length; k++) {
    await page.evaluate(`Object.assign(window.__zunda.state, ${JSON.stringify(SETS[k])}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`);
    const file = join(OUT, `${NAME}-${String(k).padStart(2, '0')}.png`);
    writeFileSync(file, Buffer.from(await page.screenshot(), 'base64'));
    files.push(file);
  }
} finally {
  await page.close();
  if (server) server.kill();
}
// 縮めて横に並べる
const imgs = files.map((f) => decodePng(readFileSync(f))).map((im) => downscale(im, Math.round(im.width * SCALE), Math.round(im.height * SCALE)));
const G = 6, w = imgs[0].width, h = imgs[0].height, CW = imgs.length * w + (imgs.length - 1) * G, sheet = new Uint8Array(CW * h * 4).fill(255);
imgs.forEach((im, n) => { for (let y = 0; y < h; y++) sheet.set(im.data.subarray(y * w * 4, (y + 1) * w * 4), (y * CW + n * (w + G)) * 4); });
writeFileSync(join(OUT, `${NAME}.png`), encodePng({ width: CW, height: h, data: sheet }));
console.log('撮った', files.length, '枚 →', join(OUT, `${NAME}.png`));
