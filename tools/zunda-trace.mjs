// ずんだもんの公式の三面図の「正面」を、ベクターの曲線（JavaScript のデータ）に写す道具。
// 図鑑の項目「コードで描いたずんだもんを立体的に動かす」の段階 1。設計書は MyWiki の articles/zundamon-25d.md。
//
// 使い方: node tools/zunda-trace.mjs [--src <三面図.jpg>] [--out data/zunda-front.js] [--debug] [--profile <フォルダ>]
//   --debug: 途中の絵（色の割り当て、線の濃さ、部品の地図）を runtime/assets/zunko/work/ に書く
//   --profile: 画面なしの Chrome の使い捨ての設定のフォルダ（既定 runtime/zunda-profile）。JPEG を初めて読むときだけ使う
//   調整: --line-blur（線の濃さのぼかし、既定 0.6 画素）、--line-min（線にする濃さの山の下限、既定 0.2）、--cap（しきい値の上限の割合、既定 0.82）
//
// 権利の決まり: 元の画像と、元の画像から作った画素の絵は、リポジトリに入れない。作業用の画素のファイルは
// runtime/assets/zunko/work/（git の対象外）にだけ置く。リポジトリに入るのは、写した曲線の数の並び（data/zunda-front.js）だけ。
//
// 手順
// 1. JPEG を画面なしの Chrome で RGBA にする（tools/lib/zunda-load.mjs。結果は work/ に PNG で残す）
// 2. 列ごとの「白でない画素」の数で 3 体の間の空白を探し、真ん中（正面）の範囲を切り出す
// 3. 色: 平らな所の画素を Lab の空間で k-means で群に分け、近い群をまとめてパレットにする。線の色は暗い画素の平均
// 4. 塗り: パレットの色に近い画素を「確かな塗り」とする。背景は、枠（と bgSeeds）から白い所を、線で止まるまでたどって決める。
//    残りの画素（線の下、にじみ）は、線を越えにくくして、いちばん近い確かな塗りの色にする（塗りが線の中心まで広がり、線との間にすき間ができない）
// 5. 線の濃さ: 各画素が「下の塗りの色」と「線の色」の間のどこにあるか（0〜1）
// 6. 部品: tools/zunda-parts.json の多角形（元の絵の座標）と色で、塗りの画素ごとに部品を決める。線は手前の部品につける
// 7. 形: 塗りは部品と色ごとの 0/1 の地図を少しぼかし、0.35 の等値線（少し外へ広げ、となりの塗りと重ねる）。
//    線は、線の濃さをぼかした場の等値線。しきい値は、線の幅が濃さの合計と同じになるように線ごとに決める（下の「線」の説明）
// 7b. tools/zunda-parts.json の strokes の部品（目・口）は、線を等値線ではなく「中心の線 + 太さ + 色」で写す（tools/lib/strokes.mjs）。
//    元の絵のぼけ（σ）をまつげの縁から測り、線ごとに太さと不透明な色を戻す。瞳の点は、中の色の円と輪にする
// 8. 等値線（marching squares）→ 点を間引く → 3 次のベジェ（Schneider の方法）→ SVG の path の文字（0.1 画素）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJpeg } from './lib/zunda-load.mjs';
import { encodePng } from './lib/image.mjs';
import * as V from './lib/vectorize.mjs';
import * as S from './lib/strokes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(ROOT, '../assets/zunko'); // worktree（runtime/zunda）から見た素材のフォルダ
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const SRC = opt('--src', join(ASSETS, '202012_ずんだもん三面.jpg'));
const OUT = resolve(ROOT, opt('--out', 'data/zunda-front.js'));
const WORK = join(ASSETS, 'work');
const DEBUG = args.includes('--debug');
const PROFILE = resolve(ROOT, opt('--profile', 'runtime/zunda-profile')); // 画面なしの Chrome の使い捨ての設定のフォルダ
const PARTS_FILE = join(ROOT, 'tools/zunda-parts.json');
const t0 = Date.now();
const log = (...m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...m);

// ---- 1. 読む ----
const img = await loadJpeg(SRC, { workDir: WORK, profile: PROFILE });
log('元の絵', img.width, '×', img.height);

// ---- 2. 正面の範囲 ----
const notWhite = (k) => 255 - Math.min(img.data[k], img.data[k + 1], img.data[k + 2]) > 30;
const cols = new Array(img.width).fill(0);
for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (notWhite((y * img.width + x) * 4)) cols[x]++;
const runs = V.findRuns(cols, { gap: 3, minWidth: 40 });
const [fx0, fx1] = V.middleRun(runs);
const rows = new Array(img.height).fill(0);
for (let y = 0; y < img.height; y++) for (let x = fx0; x <= fx1; x++) if (notWhite((y * img.width + x) * 4)) rows[y]++;
const rr = V.findRuns(rows, { gap: 40, minWidth: 5 });
const fy0 = rr[0][0], fy1 = rr[rr.length - 1][1];
// 余白: となりの体にかからない幅にする
const ri = runs.findIndex((r) => r[0] === fx0);
const gapL = ri > 0 ? fx0 - runs[ri - 1][1] - 1 : 99, gapR = ri < runs.length - 1 ? runs[ri + 1][0] - fx1 - 1 : 99;
const PAD = Math.max(2, Math.min(8, Math.floor(Math.min(gapL, gapR) / 2) - 1));
const X0 = Math.max(0, fx0 - PAD), Y0 = Math.max(0, fy0 - PAD);
const W = Math.min(img.width - 1, fx1 + PAD) - X0 + 1, H = Math.min(img.height - 1, fy1 + PAD) - Y0 + 1, N = W * H;
log('3 体の範囲', JSON.stringify(runs), '→ 正面', `x ${fx0}〜${fx1}, y ${fy0}〜${fy1}`, `（切り出し ${W}×${H}、左上 ${X0},${Y0}）`);
const rgb = new Float32Array(N * 3), lab = new Float32Array(N * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const k = ((y + Y0) * img.width + x + X0) * 4, i = (y * W + x) * 3;
  rgb[i] = img.data[k]; rgb[i + 1] = img.data[k + 1]; rgb[i + 2] = img.data[k + 2];
  lab.set(V.rgbToLab(img.data[k], img.data[k + 1], img.data[k + 2]), i);
}
const px = (i) => [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
const pl = (i) => [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]];

// ---- 3. 色 ----
// 線の色: 暗い方から 2〜8% の画素の平均（JPEG で暗く行き過ぎた画素を避ける）
const byL = Array.from({ length: N }, (_, i) => i).filter((i) => lab[i * 3] < 30).sort((a, b) => lab[a * 3] - lab[b * 3]);
const LINE = [0, 1, 2].map((c) => { const s = byL.slice(Math.floor(byL.length * 0.02), Math.ceil(byL.length * 0.08)); return s.reduce((a, i) => a + rgb[i * 3 + c], 0) / s.length; });
log('線の色', LINE.map(Math.round), `（暗い画素 ${byL.length}）`);
// 平らな所: まわり 8 画素との Lab の差が 5 未満で、線ほど暗くない画素
const flatSamples = [];
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const i = y * W + x; if (lab[i * 3] < 35) continue;
  let mx = 0;
  for (let dy = -1; dy <= 1 && mx < 5; dy++) for (let dx = -1; dx <= 1; dx++) mx = Math.max(mx, V.deltaE(pl(i), pl(i + dy * W + dx)));
  if (mx < 5) flatSamples.push(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);
}
const km = V.kmeans(Float32Array.from(flatSamples), 16, { seed: 3 });
let merged = V.mergeCenters(km.centers, km.counts, 10);
// 少なすぎる群（0.005% 未満）は、にじみの色なので捨てる
const total = merged.counts.reduce((a, b) => a + b, 0);
let pal = merged.centers.map((c, i) => ({ lab: c, n: merged.counts[i] })).filter((p) => p.n >= total * 0.00005).sort((a, b) => b.n - a.n);
const labToRgb = (L) => {
  const fy = (L[0] + 16) / 116, fx = fy + L[1] / 500, fz = fy - L[2] / 200;
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z, b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const gam = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
  return [gam(r), gam(g), gam(b)];
};
// 名前: 見本の色にいちばん近いものを付ける（遠ければ c番号）
const NAMED = { white: [255, 255, 255], green: [175, 255, 122], dark: [109, 154, 35], pink: [255, 175, 254], orange: [247, 137, 52], yellow: [255, 228, 95] };
const used = new Set();
pal.forEach((p, i) => {
  p.rgb = labToRgb(p.lab);
  let best = null, bd = 25;
  for (const [name, c] of Object.entries(NAMED)) { const d = V.deltaE(p.lab, V.rgbToLab(...c)); if (d < bd && !used.has(name)) { bd = d; best = name; } }
  p.name = best || `c${i}`; used.add(p.name);
});
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
log('パレット', pal.map((p) => `${p.name} ${hex(p.rgb)} (${p.n})`).join(', '));
const K = pal.length, BG = K, WHITE = pal.findIndex((p) => p.name === 'white');

// ---- 4. 塗り ----
const partsDef = existsSync(PARTS_FILE) ? JSON.parse(readFileSync(PARTS_FILE, 'utf8')) : { parts: [{ name: 'body', poly: null }], order: ['body'] };
// 画素ごとに、いちばん近いパレットの色と、その差
const near = new Int8Array(N), nearD = new Float32Array(N);
for (let i = 0; i < N; i++) {
  let b = 0, bd = Infinity; const L = pl(i);
  for (let k = 0; k < K; k++) { const d = V.deltaE(L, pal[k].lab); if (d < bd) { bd = d; b = k; } }
  near[i] = b; nearD[i] = bd;
}
// 確かな塗り: パレットの色に 7 以内の画素。線と塗りが混ざった色（灰色、暗い緑など）はパレットに近い色がないので入らない。
// まわりも同じ色であることまでは求めない（細い髪の先のような、幅 2〜3 画素の塗りを残すため）
const conf = new Int32Array(N).fill(-1);
for (let i = 0; i < N; i++) if (nearD[i] < 7) conf[i] = near[i];
// 小さな粒（10 画素未満）は、にじみなので確かな塗りから外す（JPEG の色のにじみで、濃い緑の縁に明るい緑の点ができるため）
for (let k = 0; k < K; k++) {
  const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = conf[i] === k ? 1 : 0;
  const { id, sizes } = V.components(m, W, H);
  for (let i = 0; i < N; i++) if (id[i] && sizes[id[i]] < 10) conf[i] = -1;
}
// 背景: 枠から、白くて線の薄い画素を 4 方向にたどる
const whiteRgb = pal[WHITE].rgb;
// 線の切れ目（指先などで線が薄くなる所）から体の中へ入らないように、少しでも線のある画素（濃さ 0.12 以上）を 1 画素太らせて止める。
// 線にかこまれた背景（腕と胴の間など）は枠から届かないので、tools/zunda-parts.json の bgSeeds（元の絵の座標）からもたどる
const block = new Uint8Array(N);
for (let i = 0; i < N; i++) block[i] = V.inkAlpha(px(i), whiteRgb, LINE) >= 0.12 || V.deltaE(pl(i), pal[WHITE].lab) >= 20 ? 1 : 0;
const blockWide = V.dilate(block, W, H, 1);
const pass = new Uint8Array(N);
for (let i = 0; i < N; i++) pass[i] = blockWide[i] ? 0 : 1;
const seeds = V.borderSeeds(W, H);
for (const [sx, sy] of partsDef.bgSeeds || []) { const i = (sy - Y0) * W + (sx - X0); if (pass[i]) seeds.push(i); else log('背景の種が線の上にある（使わない）', sx, sy); }
const bgMask = V.flood(pass, W, H, seeds);
// たどった背景は、線を太らせた分だけ線の手前で止まっている。そこから 2.2 画素までの白い画素も背景に戻す
// （細い外形の線でも、線の内側の白い画素は 3 画素ほど離れているので体のまま残る）
{
  const near2 = V.nearestSeed(bgMask, W, H).dist2;
  for (let i = 0; i < N; i++) if (bgMask[i] || (conf[i] === WHITE && near2[i] <= 2.2 * 2.2)) conf[i] = BG;
}
// 残りの画素の色: まず、まっすぐの距離でいちばん近い確かな塗りの色にして、仮の線の濃さを出す。
// 次に、線の濃い所ほど越えにくくして広げ直す（境目が線の中心に来る。片側の確かな塗りが線から離れていても、塗りが線の外へはみ出さない）
const fillRgb = (k) => (k === BG ? whiteRgb : pal[k].rgb);
let label = V.propagate(conf, W, H);
{
  const cost = new Float32Array(N);
  for (let i = 0; i < N; i++) cost[i] = 0.05 + 3 * V.inkAlpha(px(i), fillRgb(label[i]), LINE);
  label = V.propagateGeodesic(conf, cost, W, H);
}
// ---- 5. 線の濃さ ----
const ink = new Float32Array(N);
for (let i = 0; i < N; i++) ink[i] = V.inkAlpha(px(i), fillRgb(label[i]), LINE);
let figure = 0; for (let i = 0; i < N; i++) if (label[i] !== BG) figure++;
log('体の画素', figure, `（切り出しの ${(100 * figure / N).toFixed(1)}%）`);

// ---- 6. 部品 ----
// tools/zunda-parts.json の parts: { name, poly（元の絵の座標の多角形）, colors（省くと全部の色）}。並びの前の部品ほど先に当てる。
// 塗りの画素は、多角形に入り、塗りの色が colors に入る最初の部品にする（色で絞るので、多角形はおおまかでよい。前髪は緑だけ、顔は白だけ、など）。
// どの部品にも入らない塗りの画素は、いちばん近い部品にする。
// 線の画素は、まわり 2.5 画素の中の塗りの部品のうち、いちばん手前（order で後ろ）の部品にする。
// 前の部品が動いたときに、その部品の縁の線が全部ついてくるように（前髪と顔の境目の線は前髪、袖と腕の境目の線は袖）
const PN = partsDef.parts.length, partOf = new Int16Array(N).fill(-1);
const palIndex = Object.fromEntries(pal.map((p, k) => [p.name, k]));
const polys = partsDef.parts.map((p) => p.poly && p.poly.map(([x, y]) => [x - X0, y - Y0]));
const colorOk = partsDef.parts.map((p) => { const m = new Uint8Array(K).fill(p.colors ? 0 : 1); for (const c of p.colors || []) { if (!(c in palIndex)) throw new Error(`部品 ${p.name} の色 ${c} はパレットにない`); m[palIndex[c]] = 1; } return m; });
const bbox = polys.map((p) => p && [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))]);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x; if (label[i] === BG) continue;
  for (let p = 0; p < PN; p++) {
    if (!colorOk[p][label[i]]) continue;
    const b = bbox[p];
    if (!polys[p] || (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && V.pointInPolygon(x + 0.5, y + 0.5, polys[p]))) { partOf[i] = p; break; }
  }
}
{
  const lab2 = new Int32Array(N); for (let i = 0; i < N; i++) lab2[i] = partOf[i];
  const filled = V.propagate(lab2, W, H);
  let n = 0; for (let i = 0; i < N; i++) if (partOf[i] < 0 && label[i] !== BG) { partOf[i] = filled[i]; n++; }
  if (n) log('どの部品の多角形にも入らない塗りの画素', n, '（いちばん近い部品にした）');
}
const order = partsDef.order || partsDef.parts.map((p) => p.name);
const partIndex = Object.fromEntries(partsDef.parts.map((p, i) => [p.name, i]));
for (const name of order) if (!(name in partIndex)) throw new Error(`order の ${name} が parts にない`);
for (const p of partsDef.parts) if (!order.includes(p.name)) throw new Error(`部品 ${p.name} が order にない`);
const rank = new Int16Array(PN); order.forEach((name, r) => { rank[partIndex[name]] = r; });
const linePart = new Int16Array(N).fill(-1);
{
  const offs = []; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 6.25) offs.push([dx, dy]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (ink[i] < 0.03) continue;
    let best = -1;
    for (const [dx, dy] of offs) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const q = partOf[Y * W + X]; if (q >= 0 && (best < 0 || rank[q] > rank[best])) best = q;
    }
    linePart[i] = best;
  }
  // 体から離れた線（背景の中の線）は、いちばん近い線の部品にする
  const lab2 = new Int32Array(N); for (let i = 0; i < N; i++) lab2[i] = linePart[i];
  const filled = V.propagate(lab2, W, H);
  for (let i = 0; i < N; i++) if (linePart[i] < 0 && ink[i] >= 0.03) linePart[i] = filled[i];
}

// ---- 7〜8. 形 ----
const tolOf = (name, kind) => (partsDef.tol?.[name] ?? (kind === 'fill' ? 0.6 : 0.45));
function traceField(field, level, tol, minArea) {
  const cs = V.marchingSquares(field, W, H, level);
  const out = [];
  let pts = 0;
  for (const c of cs) {
    let a = 0; for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length]; a += p[0] * q[1] - q[0] * p[1]; }
    if (Math.abs(a / 2) < minArea) continue;
    const s = V.simplifyClosed(c, 0.12);
    if (s.length < 3) continue;
    const curves = V.fitClosed(s, tol, { reach: 2.5, cornerAngle: 70 });
    if (curves.length) { out.push(curves); pts += curves.length; }
  }
  return { contours: out, segments: pts };
}
const shapes = [];
let segFill = 0, segLine = 0;
// 塗り（部品の奥から手前へ、部品の中は広い色から）
for (const name of order) {
  const p = partIndex[name];
  const area = new Array(K).fill(0);
  for (let i = 0; i < N; i++) if (partOf[i] === p && label[i] !== BG) area[label[i]]++;
  const ks = [...Array(K).keys()].filter((k) => area[k] > 0).sort((a, b) => area[b] - area[a]);
  for (const k of ks) {
    const f = new Float32Array(N);
    for (let i = 0; i < N; i++) f[i] = partOf[i] === p && label[i] === k ? 1 : 0;
    const g = V.blur(f, W, H, 0.8);
    const { contours, segments } = traceField(g, 0.35, tolOf(name, 'fill'), 1.5);
    if (!contours.length) continue;
    segFill += segments;
    shapes.push({ part: name, kind: 'fill', color: pal[k].name, d: V.pathData(contours) });
  }
}
// 線: 線の濃さを少しぼかしてから追う（JPEG の画素のゆれで、線の縁がでこぼこにならないように。ぼかしても断面の濃さの合計は変わらない）。
// 線の幅: ぼかした断面をガウス分布（山の高さ P、濃さの合計 A = P√(2π)σ）とみると、不透明度 o の形で濃さの合計を A にする幅は A/o、
// その幅になる高さ（しきい値）は P·exp(−πP²/(4o²))（σ によらない）。P は線を横切る向きの山（V.ridgePeak）。
// しきい値は山の CAP 倍（0.82）までにする（山の見積もりが少しずれても、線が消えて切れないように）。
// 不透明度は、つながった線（1 筆）ごとに決める: 山の高さの 90 パーセンタイルが 0.55 以上なら線の色そのもの（line）、
// それより薄い線（しわ、髪の筋、指など）は不透明度 0.6（lineSoft）で幅を広く。薄い線を真っ黒な細い線にすると、元の灰色の線より重く見えるため。
// 画素ごとに決めると、1 本の線の中で黒と灰色が入れ替わり、まだらになる。
// 部品ごとに、となりの部品と 1.5 画素重ねて、つなぎ目にすき間ができないようにする
const LINE_BLUR = +opt('--line-blur', 0.6), LINE_MIN = +opt('--line-min', 0.2), SOLID_FROM = 0.55, SOFT_A = 0.6;
// ぼかしの強さは、tools/zunda-parts.json の lineBlur で部品ごとに変えられる（目のような小さな所は弱く）
const inkS = (() => {
  const cache = new Map(), get = (sg) => { if (!cache.has(sg)) cache.set(sg, sg > 0 ? V.blur(ink, W, H, sg) : ink); return cache.get(sg); };
  const out = new Float32Array(get(LINE_BLUR));
  const lb = partsDef.lineBlur || {};
  for (const [name, sg] of Object.entries(lb)) {
    const p = partIndex[name], b = get(sg);
    for (let i = 0; i < N; i++) if ((linePart[i] >= 0 ? linePart[i] : partOf[i]) === p) out[i] = b[i];
  }
  return out;
})();
const peak = V.blur(V.ridgePeak(inkS, W, H), W, H, 0.5);
const CAP = +opt('--cap', 0.82);
const tOf = (P, o) => P * Math.min(CAP, Math.exp(-Math.PI * P * P / (4 * o * o)));
const lineMask = new Uint8Array(N);
// 線にする山の高さの下限。tools/zunda-parts.json の lineMin で部品ごとに下げられる（目の瞳の輪のような、小さく薄い線を残すため）
const minP = new Float32Array(N).fill(LINE_MIN);
for (let i = 0; i < N; i++) { const q = linePart[i] >= 0 ? linePart[i] : partOf[i]; if (q >= 0) minP[i] = partsDef.lineMin?.[partsDef.parts[q].name] ?? LINE_MIN; }
for (let i = 0; i < N; i++) { const P = Math.min(1, peak[i]); lineMask[i] = P >= minP[i] && inkS[i] >= tOf(P, 1) ? 1 : 0; }
const comp = V.components(lineMask, W, H, { diagonal: true });
const compSoft = new Uint8Array(comp.sizes.length);
{
  const vals = comp.sizes.map(() => []);
  for (let i = 0; i < N; i++) if (comp.id[i]) vals[comp.id[i]].push(peak[i]);
  for (let c = 1; c < vals.length; c++) { const v = vals[c].sort((x, y) => x - y); compSoft[c] = v[Math.floor(v.length * 0.9)] < SOLID_FROM ? 1 : 0; }
}
// 線のまわり 3 画素までの画素を、いちばん近い線の画素の筆に属させる
const nearLine = V.nearestSeed(lineMask, W, H);
const solidField = new Float32Array(N), softField = new Float32Array(N);
let softCount = 0; for (let c = 1; c < compSoft.length; c++) softCount += compSoft[c];
for (let i = 0; i < N; i++) {
  const P = Math.min(1, peak[i]);
  if (P < minP[i] || nearLine.index[i] < 0 || nearLine.dist2[i] > 9) continue;
  const soft = compSoft[comp.id[nearLine.index[i]]];
  if (soft) softField[i] = inkS[i] - tOf(P, SOFT_A) + 0.5; else solidField[i] = inkS[i] - tOf(P, 1) + 0.5;
}
log('線の筆', comp.sizes.length - 1, '本のうち薄い線', softCount, '本');

// ---- 7b. 線を「中心の線 + 太さ + 濃さ」で写す部品（tools/zunda-parts.json の strokes）----
// 顔のような小さな所は、濃さの境目で写すと、線が波打ち、元より太く黒くなる。tools/lib/strokes.mjs で、線の中心をなめらかにたどり、
// 線ごとに太さと濃さ（半透明の黒）を測って描き直す。小さな点（瞳の点、鼻）は円にし、中が明るい点（瞳の点）は、中の色の円と輪にする
const STROKE_PARTS = new Set(partsDef.strokes || []);
const strokeShapes = [], dotFills = [], extraPalette = {}, dotColors = [];
const inkName = (c) => {
  if (c >= 1) return 'line';
  const name = `line${Math.round(c * 100)}`;
  extraPalette[name] = hex(LINE) + Math.round(c * 255).toString(16).padStart(2, '0');
  return name;
};
const dotColorName = (rgbv) => {
  const L = V.rgbToLab(...rgbv), hit = dotColors.find((d) => V.deltaE(d.lab, L) < 10);
  if (hit) return hit.name;
  const name = dotColors.length ? `dot${dotColors.length + 1}` : 'pupil';
  dotColors.push({ name, lab: L }); extraPalette[name] = hex(rgbv);
  return name;
};
const LINE_LAB = V.rgbToLab(...LINE);
// 元の絵の色（双線形）と、塗りの色（いちばん近い画素の塗り）。座標は切り出しの中
const rgbAt = (x, y) => {
  const cx = Math.min(W - 1, Math.max(0, x)), cy = Math.min(H - 1, Math.max(0, y)), x0 = Math.min(W - 2, Math.floor(cx)), y0 = Math.min(H - 2, Math.floor(cy)), tx = cx - x0, ty = cy - y0;
  return [0, 1, 2].map((c) => (rgb[(y0 * W + x0) * 3 + c] * (1 - tx) + rgb[(y0 * W + x0 + 1) * 3 + c] * tx) * (1 - ty) + (rgb[((y0 + 1) * W + x0) * 3 + c] * (1 - tx) + rgb[((y0 + 1) * W + x0 + 1) * 3 + c] * tx) * ty);
};
const fillAtPx = (x, y) => fillRgb(label[Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))]);
const WHITE_LAB = pal[WHITE].lab;
// 元の絵のぼけ（σ）: 太くて濃い所（まつげなど）の縁の広がりから測る。tools/zunda-parts.json の strokeSigma で決め打ちもできる
const SIGMA = STROKE_PARTS.size ? (partsDef.strokeSigma ?? S.estimatePsf(ink, W, H) ?? 0.55) : 0.55;
if (STROKE_PARTS.size) log('元の絵のぼけ（σ）', SIGMA.toFixed(3), '画素');
// 1 回目: 部品ごとに線と点を当てる
const strokeResults = [];
for (const name of STROKE_PARTS) {
  if (!(name in partIndex)) throw new Error(`strokes の ${name} が parts にない`);
  const p = partIndex[name];
  const own = new Uint8Array(N); for (let i = 0; i < N; i++) own[i] = linePart[i] === p && ink[i] >= 0.03 ? 1 : 0;
  const reach = V.dilate(own, W, H, 1.5);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (reach[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) continue;
  x0 = Math.max(0, x0 - 4); y0 = Math.max(0, y0 - 4); x1 = Math.min(W - 1, x1 + 4); y1 = Math.min(H - 1, y1 + 4);
  const sw = x1 - x0 + 1, sh = y1 - y0 + 1, sub = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const i = (y + y0) * W + x + x0; sub[y * sw + x] = reach[i] ? ink[i] : 0; }
  const r = S.strokesFromField(sub, sw, sh, {
    minPeak: partsDef.lineMin?.[name] ?? LINE_MIN, sigmaPsf: SIGMA,
    colorAt: (x, y) => rgbAt(x + x0, y + y0), fillAt: (x, y) => fillAtPx(x + x0, y + y0),
  });
  strokeResults.push({ name, x0, y0, ...r });
}
// 線の色をまとめる: JPEG の色のにじみで、同じ色の線でも 1 本ずつ少しずつ違う色に戻る。
// 長さ（点は円周）で重みを付け、重い線から順に、近い色（ΔE 15 未満）の群に入れる。群の色は重み付きの平均。黒に近い群は line
// 点（瞳の点の輪）は小さく、1 個ずつ測ると色のにじみに強く引っぱられる。点どうしを先にまとめ（左右の瞳の点を同じ色にする）、
// その色を線の群のうち近いもの（ΔE 30 未満）に入れる
// この絵の線は基本的に黒で、瞳の輪郭が茶色に見えるのは、細い黒の線がオレンジや黄色と混ざるため（中心の画素の値が、
// 黒い 1.3 画素の線を σ 0.7 でぼかした値で説明できる）。黒との差が ΔE 25 未満の群は黒（line）にする
const colorItems = [], dotItems = [];
for (const r of strokeResults) {
  for (const s of r.strokes) if (s.rgb) colorItems.push({ o: s, rgb: s.rgb, wgt: S.pathLength(s.pts, s.closed) * (s.half.reduce((a, b) => a + b, 0) / s.half.length) });
  for (const d of r.dots) if (d.rgb) dotItems.push({ o: d, rgb: d.rgb, wgt: 2 * Math.PI * d.r * (d.wr || d.r) });
}
const groupBy = (items, tol) => {
  const groups = [];
  for (const it of [...items].sort((a, b) => b.wgt - a.wgt)) {
    const lab = V.rgbToLab(...it.rgb);
    let g = groups.find((q) => V.deltaE(q.lab, lab) < tol);
    if (!g) { g = { sum: [0, 0, 0], w: 0, lab, members: [] }; groups.push(g); }
    it.rgb.forEach((v, j) => { g.sum[j] += v * it.wgt; }); g.w += it.wgt; g.members.push(it.o);
    g.rgb = g.sum.map((v) => v / g.w); g.lab = V.rgbToLab(...g.rgb);
  }
  return groups;
};
const colorGroups = groupBy(colorItems, 15);
for (const dg of groupBy(dotItems, 35)) {
  const near = colorGroups.map((q) => [q, V.deltaE(q.lab, dg.lab)]).filter(([, d]) => d < 30).sort((a, b) => a[1] - b[1])[0]?.[0];
  if (near) near.members.push(...dg.members); else colorGroups.push(dg);
}
let inkN = 0;
for (const g of colorGroups) {
  const name = V.deltaE(g.lab, LINE_LAB) < 25 ? 'line' : `ink${++inkN}`;
  if (name !== 'line') extraPalette[name] = hex(g.rgb);
  for (const o of g.members) o.colorName = name;
}
log('線の色', colorGroups.map((g) => `${g.members[0].colorName} ${hex(g.rgb)}（${g.members.length}）`).join('、'));
// 2 回目: 形にする
for (const { name, x0, y0, strokes, dots } of strokeResults) {
  const byColor = new Map(), add = (color, curves) => { if (!byColor.has(color)) byColor.set(color, []); byColor.get(color).push(curves); };
  const colorOf = (o) => o.colorName ?? inkName(o.c);
  for (const s of strokes) {
    const pts = s.pts.map(([x, y]) => [x + x0, y + y0]);
    for (const poly of S.strokeOutline(pts, s.half, { closed: s.closed, caps: s.ends })) {
      const curves = V.fitClosed(poly, 0.05, { reach: 1, cornerAngle: 100 });
      if (curves.length) add(colorOf(s), curves);
    }
  }
  let skipped = 0;
  for (const d of dots) {
    const cx = d.cx + x0, cy = d.cy + y0;
    // ほかの部品の線（濃さ 0.3 以上）が 1.5 画素以内にある点は、その線のかけら（部品の境目で切れた端）なので描かない
    {
      let other = false;
      for (let y = Math.floor(cy - d.r - 1.5); y <= Math.ceil(cy + d.r + 1.5) && !other; y++) for (let x = Math.floor(cx - d.r - 1.5); x <= Math.ceil(cx + d.r + 1.5); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (ink[i] >= 0.3 && linePart[i] >= 0 && linePart[i] !== partIndex[name] && Math.hypot(x - cx, y - cy) <= d.r + 1.5) { other = true; break; }
      }
      if (other) { skipped++; continue; }
    }
    if (d.ring) {
      // 輪の中の色: 元の絵の、輪の内側の画素の平均。
      // まわりの塗りが白い輪は、瞳の点ではない（白目の上で 2 本の線が寄った所の小さなすき間）ので描かない
      const rin = Math.max(0.6, d.r - d.wr);
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = Math.floor(cy - rin); y <= Math.ceil(cy + rin); y++) for (let x = Math.floor(cx - rin); x <= Math.ceil(cx + rin); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H || Math.hypot(x - cx, y - cy) > rin) continue;
        const c = px(y * W + x); sr += c[0]; sg += c[1]; sb += c[2]; n++;
      }
      let whiteAround = 0;
      for (let a = 0; a < 8; a++) { const f = fillAtPx(cx + (d.r + 1.2) * Math.cos((a * Math.PI) / 4), cy + (d.r + 1.2) * Math.sin((a * Math.PI) / 4)); if (V.deltaE(V.rgbToLab(...f), WHITE_LAB) < 5) whiteAround++; }
      if (!n || whiteAround >= 5) { skipped++; continue; }
      dotFills.push({ part: name, kind: 'fill', color: dotColorName([sr / n, sg / n, sb / n]), d: V.pathData([S.circleCurves(cx, cy, d.r - d.wr / 2)]) });
      add(colorOf(d), S.circleCurves(cx, cy, d.r)); add(colorOf(d), S.circleCurves(cx, cy, Math.max(0.1, d.r - d.wr), true));
    } else add(colorOf(d), S.circleCurves(cx, cy, d.r));
  }
  if (skipped) log(`  点のうち ${skipped} 個は描かなかった（中が白い輪、またはほかの部品の線のかけら）`);
  for (const [color, contours] of byColor) strokeShapes.push({ part: name, kind: 'line', color, d: V.pathData(contours) });
  log(`線を当てた部品 ${name}: 線 ${strokes.length} 本、点 ${dots.length} 個（輪 ${dots.filter((d) => d.ring).length}）`);
}

const lineShapes = { lineSoft: [], line: [] };
for (const name of order) {
  if (STROKE_PARTS.has(name)) continue;
  const p = partIndex[name];
  const own = new Uint8Array(N); for (let i = 0; i < N; i++) own[i] = linePart[i] === p ? 1 : 0;
  const reach = V.dilate(own, W, H, 1.5);
  for (const [color, field] of [['lineSoft', softField], ['line', solidField]]) {
    const f = new Float32Array(N);
    for (let i = 0; i < N; i++) f[i] = reach[i] ? field[i] : 0;
    const { contours, segments } = traceField(f, 0.5, tolOf(name, 'line'), 0.3);
    if (!contours.length) continue;
    segLine += segments;
    lineShapes[color].push({ part: name, kind: 'line', color, d: V.pathData(contours) });
  }
}
// 描く順: 塗り（奥から手前）→ 薄い線 → 濃い線 → 線を当てた部品の点の中の色 → 線を当てた部品の線
shapes.push(...lineShapes.lineSoft, ...lineShapes.line, ...dotFills, ...strokeShapes);

// ---- 書き出し ----
// 線を当てた部品で足した色のうち、形に使われなかったもの（輪郭が小さすぎて曲線にならなかった線の色など）は外す
for (const name of Object.keys(extraPalette)) if (!shapes.some((s) => s.color === name)) delete extraPalette[name];
const palette = Object.fromEntries([...pal.map((p) => [p.name, hex(p.rgb)]), ['line', hex(LINE)], ['lineSoft', hex(LINE) + Math.round(SOFT_A * 255).toString(16).padStart(2, '0')], ...Object.entries(extraPalette)]);
const data = { w: W, h: H, origin: [X0, Y0], src: [img.width, img.height], palette, parts: order, shapes };
const head = `/* ずんだもん（東北ずん子・ずんだもんプロジェクトの公式イラスト「202012_ずんだもん三面」の正面）を、曲線で写したデータ。
 * tools/zunda-trace.mjs で写した（部品の境目は tools/zunda-parts.json）。図鑑の項目が、開いたときだけ読み込む。
 * 座標は画素（0.1 単位）。origin は元の絵（${img.width}×${img.height}）の中の左上。shapes は描く順（塗り → 薄い線 → 濃い線）。fill-rule は nonzero（外側と穴の向きが逆。重なった外側も塗る）。
 * palette の lineSoft は不透明度つき（#RRGGBBAA）。
 * 権利: 東北ずん子・ずんだもんプロジェクトのガイドライン（https://zunko.jp/guideline.html ）に従って使う。
 * このデータは、リポジトリのライセンスの対象外（素材の再許諾は禁止されている）。キャラクターデザイン: 江戸村ににこ。 */
`;
mkdirSync(dirname(OUT), { recursive: true });
const body = `${head}window.ZUNDA_FRONT = ${JSON.stringify(data).replace(/,\{"part"/g, ',\n{"part"')};\n`;
writeFileSync(OUT, body);
log('書いた', OUT, `${(Buffer.byteLength(body) / 1024).toFixed(1)} KB`, `形 ${shapes.length}`, `曲線 塗り ${segFill}・線 ${segLine}`);

// ---- 途中の絵（work/ にだけ置く）----
if (DEBUG) {
  const out = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) { const c = label[i] === BG ? [255, 0, 255] : pal[label[i]].rgb; out.set([c[0], c[1], c[2], 255], i * 4); }
  writeFileSync(join(WORK, 'dbg-label.png'), encodePng({ width: W, height: H, data: out }));
  for (let i = 0; i < N; i++) { const v = 255 - Math.round(ink[i] * 255); out.set([v, v, v, 255], i * 4); }
  writeFileSync(join(WORK, 'dbg-ink.png'), encodePng({ width: W, height: H, data: out }));
  for (let i = 0; i < N; i++) { const c = conf[i] < 0 ? [0, 0, 0] : conf[i] === BG ? [255, 0, 255] : pal[conf[i]].rgb; out.set([c[0], c[1], c[2], 255], i * 4); }
  writeFileSync(join(WORK, 'dbg-conf.png'), encodePng({ width: W, height: H, data: out }));
  const pc = (q) => { const hh = (q * 137.508) % 360 / 60, c = 200, x = c * (1 - Math.abs(hh % 2 - 1)); const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hh)]; return t.map((v) => v + 40); };
  for (let i = 0; i < N; i++) { const q = ink[i] >= 0.3 ? linePart[i] : partOf[i]; const c = q < 0 ? [255, 255, 255] : pc(q); const s = ink[i] >= 0.3 ? 0.55 : 1; out.set([c[0] * s, c[1] * s, c[2] * s, 255], i * 4); }
  writeFileSync(join(WORK, 'dbg-parts.png'), encodePng({ width: W, height: H, data: out }));
  log('途中の絵を書いた', WORK);
}
