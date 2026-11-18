// 一覧のカードの静止画を撮り、シート（WebP）と目録（js/thumbs.js）を作る道具。
// 使い方: node tools/thumbs.mjs [--all] [--only id,id] [--wait 1800] [--dry]
//   ふだんは、新しい項目とコードが変わった項目だけを撮る。項目を足したり直したりしたら、これを走らせる
//   --all   全部を撮り直す（下地の CSS や撮り方を変えたとき）。位置は変えない
//   --only  その項目だけを撮り直す
//   --wait  読み込んでから撮るまでの時間（ミリ秒）。WebGL の項目はこの 2 倍、データを読む項目は 4 倍待つ
//   --dry   撮らずに、撮る項目と書き換えるシートだけを出す
// 出力: thumbs/sNN-l.webp（明るい配色）・thumbs/sNN-d.webp（暗い配色）・js/thumbs.js（目録）。ログは logs/thumbs.log
// 撮り方: Chrome（画面に出さない、音なし）で図鑑を開き、項目の見本を一覧と同じ「小さな絵」の作り（window.THUMB = true）で
// 600×375 の iframe に出して 4 つずつ並べて撮る。絵は 400×250 に縮め、8 枚を 1 枚のシートに並べて WebP にする。
// 変わらない絵は前のシートから切り出して使うので、撮り直すのは変わった項目だけ。
// 許可の要る項目（perm）はカメラなどを使うので撮らない（一覧では頭の 1 文字のままにする）。
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, appendFileSync, rmSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { openBrowser } from './lib/cdp.mjs';
import { LAYOUT, entryHash, planThumbs, tileRect, parseManifest, formatManifest } from './lib/thumbs-plan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'thumbs');
const MANIFEST = join(ROOT, 'js', 'thumbs.js');
const LOG = join(ROOT, 'logs', 'thumbs.log');
const args = process.argv.slice(2);
const opt = { all: args.includes('--all'), dry: args.includes('--dry'), only: null, wait: 1800 };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--only') opt.only = args[++i].split(',').map((s) => s.trim()).filter(Boolean);
  else if (args[i] === '--wait') opt.wait = +args[++i];
}
mkdirSync(dirname(LOG), { recursive: true });
const log = (ev, a, result) => appendFileSync(LOG, `${new Date().toISOString()} ${ev} args=${JSON.stringify(a)} result=${result}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 項目を読む（tools/check.mjs と同じやり方）----
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sandbox, { filename: 'registry.js' });
for (const m of html.matchAll(/<script src="(entries\/[^"]+)"/g)) vm.runInContext(readFileSync(join(ROOT, m[1]), 'utf8'), sandbox, { filename: m[1] });
const entries = sandbox.dekiru.finalize();
const byId = new Map(entries.map((e) => [e.id, e]));
const list = entries.map((e) => ({ id: e.id, hash: entryHash(e), skip: !!e.perm }));
const prev = existsSync(MANIFEST) ? parseManifest(readFileSync(MANIFEST, 'utf8')) : null;
const plan = planThumbs(prev, list, { force: opt.all, only: opt.only });
const missingOnly = (opt.only || []).filter((id) => !byId.has(id));
if (missingOnly.length) { console.error('見つからない項目: ' + missingOnly.join(', ')); process.exit(1); }
console.log(`項目 ${entries.length}（撮らない ${list.filter((x) => x.skip).length}）・撮る ${plan.capture.length}・書き換えるシート ${plan.dirty.size} / ${plan.sheetCount}`);
if (opt.dry) { console.log(plan.capture.join(' ')); process.exit(0); }
if (!plan.capture.length && !plan.dirty.size && prev && prev.sheets?.length === plan.sheetCount) { console.log('撮り直す項目はありません'); process.exit(0); }

const isGL = (e) => /getContext\(\s*['"](webgl2?|experimental-webgl)['"]/.test(e.src.js);
const waitFor = (e) => (e.data?.length ? opt.wait * 4 : isGL(e) ? opt.wait * 2 : opt.wait);

// ---- 手元だけの小さな配信（読むだけ。runtime/ は出さない）----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(ROOT + sep) || file.slice(ROOT.length + 1).split(sep)[0] === 'runtime') { res.writeHead(403).end(); return; }
    const st = await stat(file).catch(() => null);
    if (!st?.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(await readFile(file));
  } catch { res.writeHead(500).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

// 4 つずつ並べる位置（600×375 の枠、間を 20 空ける）
const V = LAYOUT.view, GAP = 20, PAR = 4;
const SLOTS = [[0, 0], [V.w + GAP, 0], [0, V.h + GAP], [V.w + GAP, V.h + GAP]];
const page = await openBrowser({ width: V.w * 2 + GAP, height: V.h * 2 + GAP, profile: join(ROOT, 'runtime/thumbs-profile') });
const shots = { light: new Map(), dark: new Map() };
const spread = { light: new Map(), dark: new Map() }; // 絵の明るさのばらつき（小さいほど 1 色に近い）
const flat = [];
const t0 = Date.now();
try {
  // 一覧の動くプレビューを止め、表紙の粒の動きも止めた図鑑の上に、撮る iframe を重ねる
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (window.top === window) { try { localStorage.setItem('dekiru:live', 'false'); } catch {} addEventListener('load', () => document.querySelector('#heroPause')?.click()); }` });
  await page.navigate(base + 'index.html#v=index');
  if (!(await page.waitFor('#indexBody section'))) throw new Error('図鑑が開けませんでした');
  await page.evaluate(`(() => { const s = document.createElement('div'); s.id = 'thumbStage'; s.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#808080'; document.body.append(s); })()`);
  for (const scheme of ['light', 'dark']) {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    for (let i = 0; i < plan.capture.length; i += PAR) {
      const batch = plan.capture.slice(i, i + PAR);
      const ms = Math.max(...batch.map((id) => waitFor(byId.get(id))));
      const taken = await shootBatch(batch, ms);
      // ほぼ 1 色の絵（WebGL が描き終わる前など）は、2 倍待って撮り直す
      const flatIds = batch.filter((id, k) => taken[k].flat);
      let retry = [];
      if (flatIds.length) retry = await shootBatch(flatIds, ms * 2.5);
      batch.forEach((id, k) => {
        const r = flatIds.includes(id) ? retry[flatIds.indexOf(id)] : taken[k];
        shots[scheme].set(id, r.png);
        spread[scheme].set(id, r.spread);
        log('thumbs.capture', { id, scheme }, r.flat ? 'flat' : 'ok');
      });
      process.stdout.write(`\r${scheme === 'light' ? '明るい配色' : '暗い配色'} ${Math.min(i + PAR, plan.capture.length)} / ${plan.capture.length}   `);
    }
    process.stdout.write('\n');
  }
  // 明暗で描け方が大きく違う絵（片方だけ、描き始める前に撮れてしまったもの）は、薄い方を 3 倍待って撮り直す。
  // 2026-11-18 に、ほかの重い処理と並べて撮ったとき、暗い配色だけ線や文字がまだ描かれていない絵が 4 つできた
  const weak = { light: [], dark: [] };
  for (const id of plan.capture) {
    const l = spread.light.get(id), d = spread.dark.get(id), lo = Math.min(l, d);
    if (lo < 15 && lo < Math.max(l, d) * 0.35) weak[l < d ? 'light' : 'dark'].push(id);
  }
  for (const scheme of ['light', 'dark']) {
    if (!weak[scheme].length) continue;
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    for (let i = 0; i < weak[scheme].length; i += PAR) {
      const batch = weak[scheme].slice(i, i + PAR);
      const taken = await shootBatch(batch, Math.max(...batch.map((id) => waitFor(byId.get(id)))) * 3);
      batch.forEach((id, k) => {
        const better = taken[k].spread > spread[scheme].get(id);
        if (better) { shots[scheme].set(id, taken[k].png); spread[scheme].set(id, taken[k].spread); }
        log('thumbs.retake', { id, scheme }, better ? 'ok' : 'same');
      });
    }
    console.log(`${scheme === 'light' ? '明るい' : '暗い'}配色で撮り直した: ${weak[scheme].join(' ')}`);
  }
  for (const scheme of ['light', 'dark']) for (const id of plan.capture) if (spread[scheme].get(id) < 2) flat.push(`${id}（${scheme === 'light' ? '明' : '暗'}）`);

  // ---- シートを組み立てる ----
  mkdirSync(OUT_DIR, { recursive: true });
  const sheets = prev?.sheets?.slice(0, plan.sheetCount) || [];
  for (let s = 0; s < plan.sheetCount; s++) {
    const name = 's' + String(s).padStart(2, '0');
    const exists = existsSync(join(OUT_DIR, name + '-l.webp')) && existsSync(join(OUT_DIR, name + '-d.webp'));
    if (!plan.dirty.has(s) && exists && sheets[s]) continue;
    const tiles = Object.entries(plan.at).filter(([, [ss]]) => ss === s);
    const bytes = [];
    for (const [scheme, tag] of [['light', 'l'], ['dark', 'd']]) {
      const draw = tiles.map(([id, [, slot]]) => ({ slot, png: shots[scheme].get(id) || null }));
      const keep = tiles.filter(([id]) => !shots[scheme].has(id)).map(([, [, slot]]) => slot);
      const old = exists ? `${base}thumbs/${name}-${tag}.webp?t=${Date.now()}` : null;
      const dataUrl = await page.evaluate(`(async () => {
        const L = ${JSON.stringify(LAYOUT)}, draw = ${JSON.stringify(draw)}, keep = ${JSON.stringify(keep)}, old = ${JSON.stringify(old)};
        const load = (src) => new Promise((ok, ng) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ng(new Error('読めない: ' + src.slice(0, 60))); im.src = src; });
        const c = new OffscreenCanvas(L.w * L.cols, L.h * L.rows), g = c.getContext('2d');
        const at = (slot) => [(slot % L.cols) * L.w, Math.floor(slot / L.cols) * L.h];
        if (old && keep.length) { const im = await load(old); for (const slot of keep) { const [x, y] = at(slot); g.drawImage(im, x, y, L.w, L.h, x, y, L.w, L.h); } }
        for (const t of draw) { if (!t.png) continue; const [x, y] = at(t.slot); g.drawImage(await load('data:image/png;base64,' + t.png), x, y, L.w, L.h); }
        const blob = await c.convertToBlob({ type: 'image/webp', quality: 0.8 });
        const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      })()`);
      const buf = Buffer.from(dataUrl, 'base64');
      if (buf.subarray(8, 12).toString() !== 'WEBP') throw new Error('WebP にできませんでした（' + name + '）');
      writeFileSync(join(OUT_DIR, `${name}-${tag}.webp`), buf);
      bytes.push(buf);
    }
    sheets[s] = createHash('sha1').update(Buffer.concat(bytes)).digest('hex').slice(0, 6);
    log('thumbs.sheet', { sheet: name, tiles: tiles.length }, 'ok ' + bytes.map((b) => b.length).join('+') + 'B');
  }
  // 要らなくなったシートを消す
  for (const f of readdirSync(OUT_DIR)) { const m = /^s(\d+)-[ld]\.webp$/.exec(f); if (m && +m[1] >= plan.sheetCount) rmSync(join(OUT_DIR, f)); }
  const manifest = { v: 1, w: LAYOUT.w, h: LAYOUT.h, cols: LAYOUT.cols, rows: LAYOUT.rows, sheets, at: plan.at };
  writeFileSync(MANIFEST, formatManifest(manifest));
} finally {
  await page.close();
  server.close();
}
const total = readdirSync(OUT_DIR).filter((f) => f.endsWith('.webp')).reduce((a, f) => a + statSync(join(OUT_DIR, f)).size, 0);
console.log(`撮った ${plan.capture.length} 項目 × 2 配色、シート ${plan.sheetCount} 枚（合計 ${(total / 1024).toFixed(0)} KB）、${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
if (flat.length) console.log('ほぼ 1 色の絵（目で確かめる）: ' + flat.join('、'));
log('thumbs.done', { captured: plan.capture.length, sheets: plan.sheetCount }, `ok ${total}B flat=${flat.length}`);

// 撮る: batch の項目を並べて読み込み、ms 待って 1 つずつ切り抜く。戻り値は [{ png, spread, flat }]
async function shootBatch(batch, ms) {
  await page.evaluate(`new Promise((done) => {
    const stage = document.querySelector('#thumbStage'); stage.replaceChildren();
    const ids = ${JSON.stringify(batch)}, pos = ${JSON.stringify(SLOTS)}; let n = ids.length;
    ids.forEach((id, k) => {
      const e = window.DekiruApp.entries.find((x) => x.id === id);
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', window.DekiruApp.sandboxFor(e));
      f.style.cssText = 'position:absolute;left:' + pos[k][0] + 'px;top:' + pos[k][1] + 'px;width:${V.w}px;height:${V.h}px;border:0;background:transparent';
      f.srcdoc = window.DekiruApp.buildDoc(e, { mode: 'thumb' }).doc;
      f.onload = () => { if (--n === 0) done(); };
      stage.append(f);
    });
    setTimeout(done, 15000);
  })`);
  await sleep(ms);
  const out = [];
  for (let k = 0; k < batch.length; k++) {
    const [x, y] = SLOTS[k];
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: V.w, height: V.h, scale: LAYOUT.w / V.w } });
    const sp = await spreadOf(data);
    out.push({ png: data, spread: sp, flat: sp < 2 });
  }
  await page.evaluate(`document.querySelector('#thumbStage').replaceChildren()`);
  return out;
}
// 明るさのばらつき（標準偏差、0〜255）。小さく縮めて数える。2 より小さければ、ほぼ 1 色
async function spreadOf(png) {
  return page.evaluate(`(async () => {
    const im = new Image(); im.src = 'data:image/png;base64,${png}'; await im.decode();
    const c = new OffscreenCanvas(48, 30), g = c.getContext('2d'); g.drawImage(im, 0, 0, 48, 30);
    const d = g.getImageData(0, 0, 48, 30).data; let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const v = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; s += v; s2 += v * v; n++; }
    return Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
  })()`);
}
