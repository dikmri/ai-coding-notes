// レポートの図を、プレーヤーと同じ処理（pipeline.mjs）から書き出す。
// 使い方: node reports/ippitsu/tools/figures.mjs   → reports/ippitsu/img/fig-steps.webp と fig-order.webp
// 画像の読み書きに ffmpeg を使う。見出しの文字は Windows の Meiryo で描く。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { drawPlan } from '../js/pipeline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.join(HERE, '..', 'img');
const TMP = path.join(HERE, '..', '..', '..', 'build', 'ippitsu', 'fig');
fs.mkdirSync(TMP, { recursive: true });
const FONT = 'C\\:/Windows/Fonts/meiryo.ttc';

function readRGBA(file, max = 1000) {
  const [W, H] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
  const k = Math.min(1, max / Math.max(W, H));
  const w = Math.round(W * k), h = Math.round(H * k);
  const rgba = new Uint8ClampedArray(execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${w}:${h}:flags=lanczos,format=rgba`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 }));
  return { rgba, w, h };
}

// RGB の浮動小数の画像（0〜1）
const blank = (w, h, v = 1) => ({ w, h, d: new Float32Array(w * h * 3).fill(v) });
function blend(img, x, y, c, a) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h || a <= 0) return;
  const i = (y * img.w + x) * 3;
  for (let q = 0; q < 3; q++) img.d[i + q] = img.d[i + q] * (1 - a) + c[q] * a;
}
function disk(img, cx, cy, r, c) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++)
      blend(img, x, y, c, Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x - cx, y - cy))));
}
function strokeLine(img, pts, c) {
  if (pts.length === 1) { disk(img, pts[0].x, pts[0].y, pts[0].w / 2, c); return; }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], m = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5));
    for (let j = 0; j <= m; j++) { const u = j / m; disk(img, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, (a.w + (b.w - a.w) * u) / 2, c); }
  }
}
function crop(img, x0, y0, cw, ch) {
  const out = blank(cw, ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) for (let q = 0; q < 3; q++) out.d[(y * cw + x) * 3 + q] = img.d[((y + y0) * img.w + (x + x0)) * 3 + q];
  return out;
}
function save(img, name) {
  const buf = Buffer.alloc(img.w * img.h * 3);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.round(Math.min(1, Math.max(0, img.d[i])) * 255);
  const file = path.join(TMP, name);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`P6 ${img.w} ${img.h} 255\n`), buf]));
  return file;
}
// 見出し付きで横に並べ、WebP にする
function panel(files, labels, out, cellW) {
  const inputs = files.flatMap((f) => ['-i', f]);
  const chains = files.map((_, i) => `[${i}]scale=${cellW}:-1,pad=${cellW + 8}:ih+40:4:36:white,drawtext=fontfile='${FONT}':text='${labels[i]}':x=6:y=8:fontsize=20:fontcolor=0x222222[c${i}]`).join(';');
  const stack = `${files.map((_, i) => `[c${i}]`).join('')}hstack=${files.length}`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `${chains};${stack}`, '-quality', '82', out]);
}

// ---------------- 図 1: 処理の段（漁師の顔のあたり）
{
  const { rgba, w, h } = readRGBA(path.join(IMG, 'sample-fisher.webp'));
  const plan = drawPlan(rgba, w, h, { detail: 0.5, hatch: true, hatchDensity: 0.5 });
  const src = blank(w, h);
  for (let i = 0; i < w * h; i++) for (let q = 0; q < 3; q++) src.d[i * 3 + q] = rgba[i * 4 + q] / 255;
  // 模様の向き: 薄くした元の画像の上に、8px ごとに流れの向きの短い線
  const flowImg = blank(w, h);
  for (let i = 0; i < w * h; i++) for (let q = 0; q < 3; q++) flowImg.d[i * 3 + q] = 0.82 + 0.18 * src.d[i * 3 + q];
  const { tx, ty, coherence } = plan.layers.flow;
  for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) {
    const i = y * w + x, c = coherence[i];
    if (c < 0.15) continue;
    const pts = [];
    for (let s = -3.5; s <= 3.5; s += 0.5) pts.push({ x: x + tx[i] * s, y: y + ty[i] * s, w: 1 });
    strokeLine(flowImg, pts, [0.85 - 0.6 * c, 0.25, 0.1]);
  }
  const inkImg = blank(w, h), skel = blank(w, h);
  for (let i = 0; i < w * h; i++) {
    if (plan.layers.ink[i]) for (let q = 0; q < 3; q++) inkImg.d[i * 3 + q] = 0.08;
    if (plan.layers.skeleton[i]) for (let q = 0; q < 3; q++) skel.d[i * 3 + q] = 0.08;
  }
  const staged = blank(w, h);
  const pal = [[0.78, 0.2, 0.16], [0.12, 0.12, 0.12], [0.24, 0.4, 0.8], [0.16, 0.58, 0.36]];
  for (const s of plan.strokes) strokeLine(staged, s.points, pal[s.stage]);
  const box = [Math.round(w * 0.28), Math.round(h * 0.07), Math.round(w * 0.44), Math.round(w * 0.44)];
  const files = [src, flowImg, inkImg, skel, staged].map((im, k) => save(crop(im, ...box), `steps-${k}.ppm`));
  panel(files, ['元の画像', '1 模様の向き', '2 起こした線', '3 中心線', '4 筆（段で色分け）'], path.join(IMG, 'fig-steps.webp'), 300);
  console.log('fig-steps', plan.strokes.length, plan.stageCounts);
}

// ---------------- 図 2: 描く順番（雨の街）
{
  const { rgba, w, h } = readRGBA(path.join(IMG, 'sample-rain.webp'));
  const plan = drawPlan(rgba, w, h, { detail: 0.5, hatch: true, hatchDensity: 0.5 });
  const ends = []; // 段ごとの終わりの筆の番号
  plan.stageCounts.reduce((a, c) => { ends.push(a + c); return a + c; }, 0);
  const files = ends.map((upto, k) => {
    const im = blank(w, h);
    for (let n = 0; n < upto; n++) strokeLine(im, plan.strokes[n].points, [0.08, 0.08, 0.08]);
    return save(im, `order-${k}.ppm`);
  });
  const labels = plan.stages.map((s, k) => `${s}まで（${ends[k].toLocaleString('ja-JP')} 筆）`);
  panel(files, labels, path.join(IMG, 'fig-order.webp'), 300);
  console.log('fig-order', ends);
}

// ---------------- 図 3・4: 斜線の描き方の比べ（港の漁師の顔のあたり）
{
  const { rgba, w, h } = readRGBA(path.join(IMG, 'sample-fisher.webp'));
  const box = [Math.round(w * 0.23), Math.round(h * 0.06), 420, 420];
  const plans = { grid: drawPlan(rgba, w, h, { hatchStyle: 'grid' }), hand: drawPlan(rgba, w, h, { hatchStyle: 'hand' }) };
  const finished = ['grid', 'hand'].map((st) => {
    const im = blank(w, h);
    for (const s of plans[st].strokes) strokeLine(im, s.points, [0.08, 0.08, 0.08]);
    return save(crop(im, ...box), `hatch-${st}.ppm`);
  });
  panel(finished, ['前の方式（格子）', '人の描き方'], path.join(IMG, 'fig-hatch.webp'), 420);
  // 描く途中: 斜線を描き始めてから、斜線を 150 本・500 本・1,200 本描いた所（画像の全体。斜線は朱色、輪郭は灰色）
  for (const st of ['grid', 'hand']) {
    const strokes = plans[st].strokes;
    const first = strokes.findIndex((s) => s.kind === 'hatch');
    const counts = [150, 500, 1200];
    const files = counts.map((c, i) => {
      const im = blank(w, h);
      for (let n = 0; n < first + c && n < strokes.length; n++) strokeLine(im, strokes[n].points, n >= first ? [0.75, 0.22, 0.12] : [0.62, 0.62, 0.62]);
      return save(im, `prog-${st}-${i}.ppm`);
    });
    panel(files, counts.map((c) => `斜線 ${c.toLocaleString('ja-JP')} 本目まで`), path.join(IMG, `fig-progress-${st}.webp`), 300);
  }
  console.log('fig-hatch', plans.grid.hatchCount, plans.hand.hatchCount);
}

// ---------------- 図 5・6: 点描（港の漁師の顔のあたりと、猫の目線の生け垣のあたり。打ち進める途中）
{
  const pick = (name) => readRGBA(path.join(IMG, `sample-${name}.webp`));
  const f = pick('fisher'), s = pick('street');
  const pf = drawPlan(f.rgba, f.w, f.h, { hatchStyle: 'stipple' }), ps = drawPlan(s.rgba, s.w, s.h, { hatchStyle: 'stipple' });
  const draw = (plan, w, h, upto = plan.strokes.length, dotColor = [0.08, 0.08, 0.08]) => {
    const im = blank(w, h);
    for (let n = 0; n < upto; n++) strokeLine(im, plan.strokes[n].points, plan.strokes[n].kind === 'dot' ? dotColor : [0.08, 0.08, 0.08]);
    return im;
  };
  const a = save(crop(draw(pf, f.w, f.h), Math.round(f.w * 0.23), Math.round(f.h * 0.06), 420, 420), 'st-fisher.ppm');
  const b = save(crop(draw(ps, s.w, s.h), 0, 140, 420, 420), 'st-street.ppm');
  panel([a, b], ['港の漁師（顔のあたり）', '猫の目線の通り（生け垣のあたり）'], path.join(IMG, 'fig-stipple.webp'), 420);
  // 打ち進める途中: 点を 8%・30%・70% 打った所（点は朱色）
  const first = pf.strokes.findIndex((q) => q.kind === 'dot'), nd = pf.strokes.length - first;
  const files = [0.08, 0.3, 0.7].map((r, i) => save(draw(pf, f.w, f.h, first + Math.round(nd * r), [0.75, 0.22, 0.12]), `st-prog-${i}.ppm`));
  panel(files, [0.08, 0.3, 0.7].map((r) => `点を ${Math.round(nd * r).toLocaleString('ja-JP')} 個まで`), path.join(IMG, 'fig-stipple-progress.webp'), 300);
  console.log('fig-stipple', pf.hatchCount, ps.hatchCount);
}

// ---------------- 図 7: 点描とベタの 5 つのモード（雨の街の顔と髪のあたり）
{
  const { rgba, w, h } = readRGBA(path.join(IMG, 'sample-rain.webp'));
  const modes = [['stipple', '点描'], ['stipple-only', '点描だけ'], ['beta-stipple', 'ベタと点描'], ['beta-stipple-only', 'ベタと点描だけ'], ['beta-only', 'ベタだけ']];
  const files = modes.map(([st]) => {
    const plan = drawPlan(rgba, w, h, { hatchStyle: st });
    const im = blank(w, h);
    for (const s of plan.strokes) strokeLine(im, s.points, [0.08, 0.08, 0.08]);
    return save(crop(im, 170, 100, 400, 400), `modes-${st}.ppm`);
  });
  panel(files, modes.map(([, l]) => l), path.join(IMG, 'fig-beta.webp'), 240);
  console.log('fig-beta');
}
