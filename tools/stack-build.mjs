// 三面図（正面・左の横顔・後ろ・右の横顔が横に並んだ 1 枚の絵）から、ドット絵の立体（ボクセル）を作り、
// 図鑑の項目「三面図から作る、重ねたドット絵の立体」のデータ data/stack-girl.js に書く。
// 使い方: node tools/stack-build.mjs [--src runtime/assets/stack-girl/1.webp] [--px 5] [--colors 48]
//   --px: ボクセル 1 つの大きさ（元の絵の画素）。小さいほど細かく、データが大きくなる
// 元の絵は git に入れない（runtime/ に置く）。絵を画素に直すのに、画面のない Chrome を使う（WebP を読むため）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from './lib/cdp.mjs';
import { maskOf, runsOf, bandRow, sliceEllipses, insideEllipse, viewFor, medianCut, nearest, rle, normalAt } from './lib/stack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
// 元の絵の既定の場所: 元のフォルダの runtime/assets/stack-girl/1.webp（worktree（runtime/<名前>）から動かすときは、2 つ上の runtime/assets）
const DEF = ['runtime/assets/stack-girl/1.webp', '../assets/stack-girl/1.webp'].map((p) => resolve(ROOT, p)).find((p) => existsSync(p));
const SRC = opt('src', null) ? resolve(ROOT, opt('src')) : DEF, S = +opt('px', 5), NCOL = +opt('colors', 48);
if (!SRC) throw new Error('元の絵が見つからない: runtime/assets/stack-girl/1.webp に置くか、--src で渡す');
const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// 1. 絵を画素に直す
mkdirSync(join(ROOT, 'runtime'), { recursive: true });
const page = await openBrowser({ width: 800, height: 600, profile: join(ROOT, 'runtime/stack-profile') });
let img;
try {
  const b64 = readFileSync(SRC).toString('base64'), type = SRC.endsWith('.png') ? 'png' : SRC.endsWith('.jpg') ? 'jpeg' : 'webp';
  const o = JSON.parse(await page.evaluate(`(async () => {
    const im = new Image(); im.src = 'data:image/${type};base64,${b64}'; await im.decode();
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return JSON.stringify({ w: c.width, h: c.height, b: btoa(s) });
  })()`));
  img = { w: o.w, h: o.h, d: Buffer.from(o.b, 'base64') };
} finally { await page.close(); }
log('絵', img.w, '×', img.h);

// 2. 外形と、4 つの絵の範囲。背景は左の真ん中の色
const W0 = img.w, H0 = img.h, at = (x, y) => (y * W0 + x) * 4;
const bg = [img.d[at(5, H0 >> 1)], img.d[at(5, H0 >> 1) + 1], img.d[at(5, H0 >> 1) + 2]];
const mask = maskOf(img, bg, 40);
// 下の見出しの文字を除く: 列ごとの数を見る前に、行ごとの数で「絵の下の空き」を探す
const rowN = new Array(H0).fill(0); for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) rowN[y] += mask[y * W0 + x];
let floorY = -1; for (let y = Math.floor(H0 * 0.6); y < H0; y++) { if (rowN[y] > 0 && rowN[y + 1] === 0 && rowN[y + 2] === 0 && rowN[y + 3] === 0) { floorY = y; break; } }
const topY = rowN.findIndex((n) => n > 0);
const colN = new Array(W0).fill(0); for (let y = topY; y <= floorY; y++) for (let x = 0; x < W0; x++) colN[x] += mask[y * W0 + x];
const panels = runsOf(colN.map((n) => (n > 3 ? 1 : 0))).filter(([a, b]) => b - a > 20);
if (panels.length !== 4) throw new Error(`絵が 4 つに分かれない: ${JSON.stringify(panels)}`);
const [PF, PL, PB, PR] = panels;   // 正面・左の横顔・後ろ・右の横顔（左から）
log('床', floorY, '頭', topY, '絵の範囲', JSON.stringify(panels));
// 縦の軸: ふくらはぎの高さの帯（床から背の 22〜30%）の外形の左右の真ん中
const Hpx = floorY - topY + 1, cy0 = Math.round(floorY - 0.3 * Hpx), cy1 = Math.round(floorY - 0.22 * Hpx);
const axis = ([a, b]) => { const r = runsOf(bandRow(mask, W0, a, b, cy0, cy1)); return a + (r[0][0] + r[r.length - 1][1] + 1) / 2; };
const cxF = axis(PF), cxL = axis(PL), cxB = axis(PB), cxR = axis(PR);
log('縦の軸', cxF.toFixed(1), cxL.toFixed(1), cxB.toFixed(1), cxR.toFixed(1));

// 3. 大きさ（ボクセルの数）。x は正面の幅、z は横の幅から
const half = (p, c) => Math.max(c - p[0], p[1] + 1 - c);
const W = 2 * Math.ceil(Math.max(half(PF, cxF), half(PB, cxB)) / S) + 2, D = 2 * Math.ceil(Math.max(half(PL, cxL), half(PR, cxR)) / S) + 2;
const H = Math.ceil(Hpx / S);
log('ボクセル', W, '×', D, '×', H, `（1 つ ${S} 画素）`);
const toVox = (x, c, n) => Math.floor((x - c) / S + n / 2);   // 絵の座標 → ボクセルの番号

// 4. 段ごとに、楕円の断面で詰める。色は、詰めたあとで立体全体の面の向きから付ける
const P_SHAPE = +opt('shape', 2.6);   // 断面の形の指数（2 は楕円。大きいほど角の丸い四角）
const vox = new Uint8Array(W * D * H), col = [], dir = new Float32Array(W * D * H * 2);   // col: [番号, r, g, b]。dir: 断面の中での向き（中のボクセル用）
function sample(view, i, k, j) {
  const y1 = floorY - j * S, y0 = y1 - S + 1;
  const xF = cxF + (i - W / 2 + 0.5) * S, xB = cxB - (i - W / 2 + 0.5) * S, uL = cxL + (k - D / 2 + 0.5) * S, uR = cxR - (k - D / 2 + 0.5) * S;
  const x = view === 'front' ? xF : view === 'back' ? xB : view === 'left' ? uL : uR;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.max(0, y0); y <= y1; y++) for (let xx = Math.floor(x - S / 2); xx < Math.floor(x + S / 2); xx++) {
    if (xx < 0 || xx >= W0 || !mask[y * W0 + xx]) continue;
    const p = at(xx, y); r += img.d[p]; g += img.d[p + 1]; b += img.d[p + 2]; n++;
  }
  return n > 0 ? [r / n, g / n, b / n] : null;
}
const ORDER = { front: ['front', 'left', 'right', 'back'], back: ['back', 'left', 'right', 'front'], left: ['left', 'front', 'back', 'right'], right: ['right', 'front', 'back', 'left'] };
for (let j = 0; j < H; j++) {
  const y1 = floorY - j * S, y0 = Math.max(topY, y1 - S + 1);
  const toRuns = (p, c, n, flip) => runsOf(bandRow(mask, W0, p[0], p[1], y0, y1)).map(([a, b]) => {
    const u = toVox(p[0] + a, c, n), v = toVox(p[0] + b, c, n);
    return flip ? [n - 1 - v, n - 1 - u] : [u, v];
  });
  const fr = toRuns(PF, cxF, W, false), sr = toRuns(PL, cxL, D, false);
  if (!fr.length || !sr.length) continue;
  const fRow = new Uint8Array(W), sRow = new Uint8Array(D);
  for (const [a, b] of fr) for (let i = Math.max(0, a); i <= Math.min(W - 1, b); i++) fRow[i] = 1;
  for (const [a, b] of sr) for (let k = Math.max(0, a); k <= Math.min(D - 1, b); k++) sRow[k] = 1;
  const ell = sliceEllipses(fr, sr);
  for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    if (!fRow[i] || !sRow[k]) continue;
    const hit = insideEllipse(ell, i + 0.5, k + 0.5, P_SHAPE); if (!hit) continue;
    const idx = (j * D + k) * W + i; vox[idx] = 1; dir[idx * 2] = hit.u; dir[idx * 2 + 1] = hit.v;
  }
}
// 色: 表面のボクセルは、立体全体から求めた面の向き（左右と前後の成分）に近い絵から取る。中のボクセルは断面の中での向きで選ぶ
const occ = (i, k, j) => i >= 0 && i < W && k >= 0 && k < D && j >= 0 && j < H && vox[(j * D + k) * W + i] ? 1 : 0;
for (let j = 0; j < H; j++) for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
  const idx = (j * D + k) * W + i; if (!vox[idx]) continue;
  const surf = !occ(i - 1, k, j) || !occ(i + 1, k, j) || !occ(i, k - 1, j) || !occ(i, k + 1, j) || !occ(i, k, j - 1) || !occ(i, k, j + 1);
  let u = dir[idx * 2], v = dir[idx * 2 + 1];
  if (surf) { const n = normalAt(occ, i, k, j, 2); if (n[0] || n[2]) { u = n[0]; v = n[2]; } }
  let c = null; for (const vw of ORDER[viewFor(u, v)]) { c = sample(vw, i, k, j); if (c) break; }
  if (!c) { vox[idx] = 0; continue; }
  col.push([idx, c[0], c[1], c[2]]);
}
log('詰めたボクセル', col.length);

// 5. 色の数を減らして、色の表の番号（1 から。0 は空）にする
const pal = medianCut(col.map((c) => [c[1], c[2], c[3]]), NCOL);
for (const c of col) vox[c[0]] = nearest(pal, [c[1], c[2], c[3]]) + 1;
const enc = rle(vox), b64 = Buffer.from(enc).toString('base64');
const hex = pal.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''));
const head = `/* 三面図から作った、ドット絵の立体（ボクセル）。図鑑の項目「三面図から作る、重ねたドット絵の立体」が、開いたときだけ読み込む。
 * 元の絵: 作者が用意した三面図（正面・左の横顔・後ろ・右の横顔）。元の絵はリポジトリに入れていない。
 * tools/stack-build.mjs で作った（ボクセル 1 つは元の絵の ${S} 画素、色は ${pal.length} 色）。
 * vox は、下の段から順に、段ごとに z（奥から手前）→ x（左から右）の順に並べた色の番号（0 は空、1 からは pal の番号 + 1）を、
 * [回数, 値] の組に縮めて base64 にしたもの。 */
(window.DEKIRU_DATA ??= {})["stack-girl"] = ${JSON.stringify({ w: W, d: D, h: H, pal: hex, vox: b64 })};
`;
writeFileSync(join(ROOT, 'data/stack-girl.js'), head);
log('書いた data/stack-girl.js', (head.length / 1024).toFixed(1), 'KB', `（圧縮 ${enc.length} バイト、元 ${vox.length}）`);
process.exit(0);
