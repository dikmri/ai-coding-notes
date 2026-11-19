// 写したずんだもん（data/zunda-front.js）を、画面なしの Chrome で元の絵と同じ大きさに描き、三面図の正面と比べる道具。
// 使い方: node tools/zunda-compare.mjs [--data data/zunda-front.js] [--src <三面図.jpg>] [--profile <Chrome の使い捨ての設定のフォルダ>]
//
// 数（logs/zunda-compare.json）
// - 線の一致: 元の絵の線の画素と、写しの線の画素の、1.5 画素までのずれを許した一致（適合率・再現率・F1）。
//   線の画素 = 線の濃さが 0.5 以上。線の濃さは、画素が「下の塗りの色」と「線の色」の間のどこにあるか（0〜1）。
//   下の塗りの色は、写しの塗りだけを描いた絵から取る（元の絵と写しで同じものを使う）。
//   inkRatio: 線の濃さの合計の比（写し ÷ 元）。1 より大きいと写しの線が重い。
//   pieces: 線の画素の、つながった塊（3 画素以上）の数。写しの方が多いと、線が切れている目安
// - 色の差: 体の中の、線とそのとなり（1 画素）を除いた所の、平均の色の差（Lab の ΔE、CIE76）。
// - 外形: 体の外形（背景を枠からたどり、残った所）の IoU。元の絵と、写しを描いた絵に、同じ決め方を使う。
// 絵（build/zunda/、git の対象外。元の絵を含む）
// - compare.png: 元・写し・重ね・差の地図を並べたもの
// - trace-2x.png / trace-4x.png: 写した絵だけを 2 倍・4 倍で（線のなめらかさを見る）
// - view-<名前>-<倍率>x.png: tools/zunda-parts.json の views の範囲を拡大し、元（画素のまま）・元（なめらかに拡大）・写しを並べたもの
// - gaps-4x.png: 塗りだけを、背景を赤にして 4 倍で（塗りのすき間を見る）
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJpeg } from './lib/zunda-load.mjs';
import { openBrowser } from './lib/cdp.mjs';
import { decodePng, encodePng } from './lib/image.mjs';
import * as V from './lib/vectorize.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(ROOT, '../assets/zunko');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const DATA = resolve(ROOT, opt('--data', 'data/zunda-front.js'));
const SRC = opt('--src', join(ASSETS, '202012_ずんだもん三面.jpg'));
const OUTDIR = join(ROOT, 'build/zunda'), LOG = join(ROOT, 'logs/zunda-compare.json');
const PARTS_FILE = join(ROOT, 'tools/zunda-parts.json');
const PROFILE = resolve(ROOT, opt('--profile', 'runtime/zunda-profile')); // 画面なしの Chrome の使い捨ての設定のフォルダ
mkdirSync(OUTDIR, { recursive: true }); mkdirSync(dirname(LOG), { recursive: true });

const dataText = readFileSync(DATA, 'utf8');
const D = (() => { const window = {}; new Function('window', dataText)(window); return window.ZUNDA_FRONT; })();
const { w: W, h: H } = D, [X0, Y0] = D.origin, N = W * H;
const img = await loadJpeg(SRC, { workDir: join(ASSETS, 'work'), profile: PROFILE });

// ---- 写しを描く ----
const page = await openBrowser({ width: 400, height: 300, profile: PROFILE });
await page.evaluate(dataText);
await page.evaluate(`window.render = (scale, mode, region) => {
  const D = window.ZUNDA_FRONT, [rx, ry, rw, rh] = region || [0, 0, D.w, D.h];
  const c = document.createElement('canvas'); c.width = Math.round(rw * scale); c.height = Math.round(rh * scale);
  const g = c.getContext('2d');
  g.fillStyle = mode === 'gaps' ? '#ff0000' : '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.setTransform(scale, 0, 0, scale, -rx * scale, -ry * scale);
  for (const s of D.shapes) {
    if ((mode === 'fills' || mode === 'gaps') && s.kind !== 'fill') continue;
    g.fillStyle = D.palette[s.color];
    g.fill(new Path2D(s.d), 'nonzero');
  }
  return c.toDataURL('image/png').split(',')[1];
}; true`);
const render = async (scale, mode, region) => decodePng(Buffer.from(await page.evaluate(`window.render(${scale}, ${JSON.stringify(mode)}, ${JSON.stringify(region || null)})`), 'base64'));
const t0 = Date.now();
const full = await render(1, 'full'), fills = await render(1, 'fills');
const timeRender = Date.now() - t0;

// ---- 数 ----
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const LINE = hexRgb(D.palette.line), WHITE = [255, 255, 255];
const orig = new Float32Array(N * 3), tr = new Float32Array(N * 3), under = new Float32Array(N * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x, k = ((y + Y0) * img.width + x + X0) * 4;
  for (let c = 0; c < 3; c++) { orig[i * 3 + c] = img.data[k + c]; tr[i * 3 + c] = full.data[i * 4 + c]; under[i * 3 + c] = fills.data[i * 4 + c]; }
}
const get = (a, i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
const inkO = new Float32Array(N), inkT = new Float32Array(N), lineO = new Uint8Array(N), lineT = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  inkO[i] = V.inkAlpha(get(orig, i), get(under, i), LINE); inkT[i] = V.inkAlpha(get(tr, i), get(under, i), LINE);
  lineO[i] = inkO[i] >= 0.5 ? 1 : 0; lineT[i] = inkT[i] >= 0.5 ? 1 : 0;
}
const lm = V.lineMatch(lineO, lineT, W, H, 1.5);
let inkSumO = 0, inkSumT = 0; for (let i = 0; i < N; i++) { inkSumO += inkO[i]; inkSumT += inkT[i]; }
const pieces = (m) => V.components(m, W, H, { diagonal: true }).sizes.filter((n, k) => k > 0 && n >= 3).length;
// 外形: 白くて線の薄い画素を、線を 1 画素太らせて止めながら枠（と背景の種）からたどる。たどった所から 2.2 画素までの白い画素も背景
function silhouette(rgbArr) {
  const block = new Uint8Array(N), white = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const p = get(rgbArr, i), dE = V.deltaE(V.rgbToLab(...p.map(Math.round)), [100, 0, 0]);
    white[i] = dE < 7 ? 1 : 0;
    block[i] = V.inkAlpha(p, WHITE, LINE) >= 0.12 || dE >= 20 ? 1 : 0;
  }
  const wide = V.dilate(block, W, H, 1), pass = new Uint8Array(N);
  for (let i = 0; i < N; i++) pass[i] = wide[i] ? 0 : 1;
  const seeds = V.borderSeeds(W, H);
  const pd = JSON.parse(readFileSync(PARTS_FILE, 'utf8'));
  for (const [sx, sy] of pd.bgSeeds || []) seeds.push((sy - Y0) * W + (sx - X0));
  const bg = V.flood(pass, W, H, seeds), d2 = V.nearestSeed(bg, W, H).dist2, fig = new Uint8Array(N);
  for (let i = 0; i < N; i++) fig[i] = bg[i] || (white[i] && d2[i] <= 2.2 * 2.2) ? 0 : 1;
  return fig;
}
// 元の絵と写しの絵に、同じ決め方を使う（外形の線の、薄いにじみの扱いをそろえる）
const figO = silhouette(orig), figT = silhouette(tr);
const iouFig = V.iou(figO, figT);
// 色の差: 体（どちらかの外形）の中で、線（どちらか）から 1 画素より離れた所
const anyLine = new Uint8Array(N); for (let i = 0; i < N; i++) anyLine[i] = lineO[i] || lineT[i] || inkO[i] >= 0.25 || inkT[i] >= 0.25 ? 1 : 0;
const nearLine = V.dilate(anyLine, W, H, 1);
const dEmap = new Float32Array(N); let sum = 0, cnt = 0; const des = [];
for (let i = 0; i < N; i++) {
  if (!(figO[i] || figT[i]) || nearLine[i]) { dEmap[i] = -1; continue; }
  const d = V.deltaE(V.rgbToLab(...get(orig, i)), V.rgbToLab(...get(tr, i)));
  dEmap[i] = d; sum += d; cnt++; des.push(d);
}
des.sort((a, b) => a - b);
const meanDE = sum / cnt, p95 = des[Math.floor(des.length * 0.95)], over10 = des.filter((d) => d > 10).length / des.length;

const sizeKB = statSync(DATA).size / 1024;
const countSeg = (d) => { let n = 0; for (const m of d.matchAll(/([cl])([^McClz]*)/g)) { const k = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).length; n += m[1] === 'c' ? k / 6 : k / 2; } return n; };
const segFill = D.shapes.filter((s) => s.kind === 'fill').reduce((a, s) => a + countSeg(s.d), 0);
const segLine = D.shapes.filter((s) => s.kind === 'line').reduce((a, s) => a + countSeg(s.d), 0);
const result = {
  date: new Date().toISOString(), data: DATA.replace(ROOT, '.'), sizeKB: +sizeKB.toFixed(1), shapes: D.shapes.length,
  segments: { fill: segFill, line: segLine, total: segFill + segLine },
  lines: { f1: +lm.f1.toFixed(4), precision: +lm.precision.toFixed(4), recall: +lm.recall.toFixed(4), originalPixels: lm.original, tracedPixels: lm.traced, tolerancePx: 1.5, inkRatio: +(inkSumT / inkSumO).toFixed(4), pieces: { original: pieces(lineO), traced: pieces(lineT) } },
  color: { meanDeltaE: +meanDE.toFixed(3), p95DeltaE: +p95.toFixed(2), over10: +over10.toFixed(4), pixels: cnt },
  silhouette: { iou: +iouFig.toFixed(4), original: figO.reduce((a, b) => a + b, 0), traced: figT.reduce((a, b) => a + b, 0) },
  pass: { f1: lm.f1 >= 0.8, deltaE: meanDE <= 4, iou: iouFig >= 0.97 },
  renderMs: timeRender,
};
writeFileSync(LOG, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

// ---- 絵 ----
// 並べた絵: 元 | 写し | 重ね（線だけ。元だけは赤、写しだけは青、両方は黒）| 差（線: 緑=一致、赤=写しにない、青=写しだけ。塗り: ΔE を灰色の濃さ）
{
  const gap = 8, CW = W * 4 + gap * 3, out = new Uint8Array(CW * H * 4).fill(255);
  const put = (panel, i, c) => { const x = i % W, y = (i - x) / W, o = (y * CW + panel * (W + gap) + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; };
  const dil = (m) => V.dilate(m, W, H, 1.5);
  const nearT = dil(lineT), nearO = dil(lineO);
  for (let i = 0; i < N; i++) {
    put(0, i, get(orig, i)); put(1, i, get(tr, i));
    const a = 1 - inkO[i], b = 1 - inkT[i];
    put(2, i, [255 * b, 255 * Math.min(a, b), 255 * a]); // 元だけの線は赤、写しだけの線は青、両方は黒
    let c;
    if (lineO[i] && nearT[i]) c = [0, 170, 0];
    else if (lineO[i]) c = [230, 0, 0];
    else if (lineT[i] && !nearO[i]) c = [0, 60, 255];
    else if (lineT[i]) c = [0, 170, 0];
    else if (dEmap[i] >= 0) { const v = 255 - Math.min(255, dEmap[i] * 12); c = [v, v, v]; }
    else c = figO[i] !== figT[i] ? [255, 160, 0] : [255, 255, 255];
    put(3, i, c);
  }
  writeFileSync(join(OUTDIR, 'compare.png'), encodePng({ width: CW, height: H, data: out }));
}
for (const s of [2, 4]) writeFileSync(join(OUTDIR, `trace-${s}x.png`), encodePng(await render(s, 'full')));
writeFileSync(join(OUTDIR, 'gaps-4x.png'), encodePng(await render(4, 'gaps')));
// 見比べの絵: tools/zunda-parts.json の views（元の絵の座標 [x, y, 幅, 高さ, 倍率]）ごとに、
// 元（画素のまま）| 元（ブラウザでなめらかに拡大）| 写し を並べる
{
  const crop = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) { crop[i * 4] = orig[i * 3]; crop[i * 4 + 1] = orig[i * 3 + 1]; crop[i * 4 + 2] = orig[i * 3 + 2]; crop[i * 4 + 3] = 255; }
  const url = 'data:image/png;base64,' + encodePng({ width: W, height: H, data: crop }).toString('base64');
  await page.evaluate(`(async () => { const im = new Image(); im.src = ${JSON.stringify(url)}; await im.decode(); window.ORIG = im;
    window.smooth = (rx, ry, rw, rh, S) => { const c = document.createElement('canvas'); c.width = rw * S; c.height = rh * S; const g = c.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(window.ORIG, rx, ry, rw, rh, 0, 0, c.width, c.height); return c.toDataURL('image/png').split(',')[1]; };
    return true; })()`);
  const pd = JSON.parse(readFileSync(PARTS_FILE, 'utf8'));
  const views = pd.views || { face: [850, 200, 140, 120, 8] };
  for (const [name, [vx, vy, vw, vh, S]] of Object.entries(views)) {
    const t = await render(S, 'full', [vx - X0, vy - Y0, vw, vh]);
    const sm = decodePng(Buffer.from(await page.evaluate(`window.smooth(${vx - X0}, ${vy - Y0}, ${vw}, ${vh}, ${S})`), 'base64'));
    const FW = vw * S, FH = vh * S, G = 16, CW = FW * 3 + G * 2, out = new Uint8Array(CW * FH * 4).fill(255);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const k = ((vy + Math.floor(y / S)) * img.width + vx + Math.floor(x / S)) * 4, q = (y * FW + x) * 4;
      out.set([img.data[k], img.data[k + 1], img.data[k + 2], 255], (y * CW + x) * 4);
      out.set([sm.data[q], sm.data[q + 1], sm.data[q + 2], 255], (y * CW + FW + G + x) * 4);
      out.set([t.data[q], t.data[q + 1], t.data[q + 2], 255], (y * CW + 2 * (FW + G) + x) * 4);
    }
    writeFileSync(join(OUTDIR, `view-${name}-${S}x.png`), encodePng({ width: CW, height: FH, data: out }));
  }
}
await page.close();
console.log('絵を書いた', OUTDIR);
