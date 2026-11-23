// 絵を作る台本の土台。図形の命令を CyberSprite（https://github.com/kokuren333/CyberSprite、Apache-2.0）の Op に変えて、
// csp new → apply → validate → export の順に流す。色はパレットの名前で書く。
// 使い方: node dedama/art/build.mjs [絵の名前 ...]（CyberSprite の置き場所は環境変数 CYBERSPRITE、既定は runtime/pixel-skills/CyberSprite）
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');           // worktree
const MAIN = join(ROOT, '..', '..');                                                       // D:\soft\dekiru-html
export const CYBERSPRITE = process.env.CYBERSPRITE || join(MAIN, 'runtime', 'pixel-skills', 'CyberSprite');
export const WORK = process.env.DEDAMA_ART_WORK || join(MAIN, 'runtime', 'dedama-art');  // csp の作業場所（git の外）
export const OUT = join(ROOT, 'dedama', 'img');

// ---- パレット（0 は透明） ----
export const PALETTE = [
  ['clear', '#00000000'], ['ink', '#0b0a12'], ['night0', '#0d1030'], ['night1', '#1c2250'],
  ['shade0', '#1a1626'], ['shade1', '#2a2438'], ['shade2', '#3d3550'], ['gray0', '#5a5070'], ['gray1', '#7e7593'], ['gray2', '#a9a1bb'], ['gray3', '#d6d0e0'], ['white', '#ffffff'],
  ['skin0', '#5a3226'], ['skin1', '#8a4f3a'], ['skin2', '#c27c5c'], ['skin3', '#e8a982'], ['skin4', '#ffd5b5'],
  ['red0', '#4a0d1e'], ['red1', '#8c1a2b'], ['red2', '#d0263a'], ['red3', '#ff5a5f'],
  ['org0', '#7a3a0c'], ['org1', '#c8641a'], ['org2', '#ff9a2e'],
  ['gold0', '#7a5a10'], ['gold1', '#c8a020'], ['gold2', '#ffd84a'], ['gold3', '#fff3a0'],
  ['grn0', '#123d2a'], ['grn1', '#1f6b3a'], ['grn2', '#3aa55a'], ['grn3', '#8fe07a'],
  ['blu0', '#0c2a4a'], ['blu1', '#1a4f8c'], ['blu2', '#2f86d0'], ['blu3', '#63c6ff'], ['blu4', '#b5ecff'],
  ['pur0', '#3a1450'], ['pur1', '#6c2a8c'], ['pur2', '#b24ad6'], ['pnk0', '#ff5ad0'], ['pnk1', '#ffa6e8'],
  ['brn0', '#3b2416'], ['brn1', '#6b4226'], ['brn2', '#9c6a3c'], ['brn3', '#caa070'],
  ['sky0', '#5fa8e8'], ['sky1', '#8cc8f4'], ['sky2', '#c4e6ff'], ['win', '#a8c8e0'],
  ['pale0', '#6a7c9a'], ['pale1', '#9fb2cf'], ['pale2', '#cfdcf0'], ['steam', '#e8eef6'], ['shutter', '#8a8698'],
];
export const C = Object.fromEntries(PALETTE.map(([n], i) => [n, i]));
export const col = (c) => (typeof c === 'number' ? c : C[c] ?? (() => { throw new Error(`色がありません: ${c}`); })());
const paletteJson = (list) => JSON.stringify(list.map(([, h]) => (h.length === 7 ? `${h}ff` : h)));

// 夜の色: 光る色（看板・電球・窓の明かり）は残し、ほかは暗く青くする
const LIGHTS = new Set(['gold2', 'gold3', 'pnk0', 'pnk1', 'red3', 'blu3', 'blu4', 'org2', 'grn3', 'white']);
const NIGHT_FIX = { sky0: '#0d1030', sky1: '#161c46', sky2: '#22245a', win: '#ffe48a', steam: '#9aa4c4' };
export function nightPalette() {
  return PALETTE.map(([n, h]) => {
    if (n === 'clear' || LIGHTS.has(n)) return [n, h];
    if (NIGHT_FIX[n]) return [n, NIGHT_FIX[n]];
    const v = parseInt(h.slice(1, 7), 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    const mix = (x, k) => Math.round(Math.min(255, x * k)).toString(16).padStart(2, '0');
    return [n, `#${mix(r, 0.36)}${mix(g, 0.4)}${mix(b, 0.62)}`];
  });
}

// ---- 描き方の道具（Op の列を作る） ----
export class Draw {
  constructor(w, h, frames = 1) { this.w = w; this.h = h; this.frames = frames; this.ops = []; this.fr = 0; this.layer = 'L1'; }
  frame(i) { this.fr = i; return this; }
  op(op, args) { this.ops.push({ op, args: { layer: this.layer, frame: this.fr, ...args } }); return this; }
  rect(x, y, w, h, c) { if (w > 0 && h > 0) this.op('rect', { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), color: col(c), filled: true }); return this; }
  box(x, y, w, h, c) { return this.op('rect', { x, y, w, h, color: col(c), filled: false }); }
  line(x0, y0, x1, y1, c, size = 1) { return this.op('line', { x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1), color: col(c), ...(size > 1 ? { brush: { size, shape: 'circle' } } : {}) }); }
  oval(x, y, w, h, c, filled = true) { return this.op('ellipse', { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), color: col(c), filled }); }
  poly(pts, c, filled = true) { return this.op('polygon', { points: pts.map(([a, b]) => [Math.round(a), Math.round(b)]), color: col(c), filled }); }
  // 点。続けて打った点は 1 つの set_pixels にまとめる
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const last = this.ops[this.ops.length - 1];
    if (last && last.op === 'set_pixels' && last.args.frame === this.fr && last.args.layer === this.layer) last.args.pixels.push([x, y, col(c)]);
    else this.op('set_pixels', { pixels: [[x, y, col(c)]] });
    return this;
  }
  // 市松の網掛け（parity 0/1）
  dither(x, y, w, h, c, parity = 0) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (((xx + yy) & 1) === parity) this.px(xx, yy, c); return this; }
  // 薄い網掛け（4 画素に 1 つ）
  sparse(x, y, w, h, c, ox = 0, oy = 0) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (((xx + ox) & 1) === 0 && ((yy + oy) & 1) === 0) this.px(xx, yy, c); return this; }
  // 行の流し込み。legend は { 文字: 色の名前 }、'.' は透明（下の絵を残す）
  rows(x, y, rows, legend) {
    const lg = Object.fromEntries(Object.entries(legend).map(([k, v]) => [k, col(v)]));
    return this.op('draw_rows', { x, y, rows, format: 'sym', legend: lg, skip_transparent: true });
  }
  fill(x, y, c) { return this.op('fill', { x, y, color: col(c) }); }
  outline(c, { placement = 'outside', connectivity = 4, exclude = [] } = {}) { return this.op('outline', { color: col(c), placement, connectivity, ...(exclude.length ? { exclude_colors: exclude.map(col) } : {}) }); }
}

// ---- CyberSprite を呼ぶ ----
function csp(args, { input } = {}) {
  const r = spawnSync('uv', ['run', '--quiet', '--project', CYBERSPRITE, 'csp', ...args], { cwd: WORK, encoding: 'utf8', windowsHide: true, input, maxBuffer: 64 * 1024 * 1024 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* 下で失敗にする */ }
  if (r.status !== 0 || !json?.ok) throw new Error(`csp ${args.slice(0, 3).join(' ')} に失敗: ${(r.stdout || '').slice(0, 1500)} ${(r.stderr || '').slice(0, 800)}`);
  return json;
}

// 1 枚の絵を作る。make(d) が Draw に描く。palettes: [[書き出す名前, パレット], ...]（夜の版など）
export function buildAsset(name, { w, h, frames = 1, make, palettes = [[name, PALETTE]], preview = 3 }) {
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const proj = join(WORK, name);
  rmSync(proj, { recursive: true, force: true });
  const t0 = Date.now();
  csp(['new', name, '--size', `${w}x${h}`, '--palette', paletteJson(PALETTE)]);
  // 色に名前を付けておく（CyberSprite の GUI やプレビューで番号の代わりに読める）
  csp(['-p', name, 'op', 'set_palette', '--args', JSON.stringify({ colors: JSON.parse(paletteJson(PALETTE)), names: Object.fromEntries(PALETTE.map(([n], i) => [String(i), n]).slice(1)) })]);
  if (frames > 1) csp(['-p', name, 'op', 'add_frame', `count=${frames - 1}`, 'cels=empty']);
  const d = new Draw(w, h, frames);
  make(d);
  const batch = join(WORK, `${name}.ops.json`);
  writeFileSync(batch, JSON.stringify({ label: name, ops: d.ops }));
  const applied = csp(['-p', name, 'apply', batch]);
  const v = csp(['-p', name, 'validate']);
  const results = [];
  for (const [outName, pal] of palettes) {
    if (pal !== PALETTE) csp(['-p', name, 'op', 'set_palette', '--args', JSON.stringify({ colors: JSON.parse(paletteJson(pal)) })]);
    const rel = `out/${outName}.png`;
    const ex = frames > 1
      ? csp(['-p', name, 'export', 'sheet', '--out', rel, '--layout', 'horizontal', '--frames', 'all', '--color-mode', 'rgba'])
      : csp(['-p', name, 'export', 'image', '--out', rel, '--color-mode', 'rgba']);
    if (preview) csp(['-p', name, 'export', frames > 1 ? 'sheet' : 'image', '--out', `prev/${outName}.png`, '--scale', String(preview), ...(frames > 1 ? ['--layout', 'horizontal', '--frames', 'all'] : []), '--color-mode', 'rgba']);
    copyFileSync(join(WORK, rel), join(OUT, `${outName}.png`));
    const f = ex.result.files[0];
    results.push({ out: outName, w: f.width, h: f.height, verified: ex.result.files.every((x) => x.verified !== false), validation_ok: ex.result.validation_ok ?? true });
  }
  const info = {
    name, ops: d.ops.length, pixels: applied.result?.results?.reduce((a, r) => a + (r.pixels_written || 0), 0) ?? null,
    validation: { ok: v.result.ok, counts: v.result.counts }, results, ms: Date.now() - t0,
  };
  return info;
}
export const exists = existsSync;
