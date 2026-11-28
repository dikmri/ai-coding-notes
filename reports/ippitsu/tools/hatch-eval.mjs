// 斜線（ハッチング）の描き方を数字で比べる台本。
// 使い方: node reports/ippitsu/tools/hatch-eval.mjs <出力フォルダ> [--styles grid,hand] [--samples fisher,rain,street]
// 測るもの（斜線の筆だけ。描く順に並べたもの）
//   向きの変化   : 続けて描く 2 本の斜線の向きの差。人は同じ向きの線を隣へ隣へ引くので小さい
//   大きく変わる : 向きの差が 30° 以上になる割合
//   始点の移動   : 続く 2 本の描き始めの点の距離（隣の線へ順に移れば、線の間隔くらい）
//   直角の交差   : 段の違う斜線どうしの交差のうち、75〜90° で交わる割合（格子に見える度合い）
//   まっすぐさ   : 両端を結んだ長さ ÷ 線の長さ
//   明暗の再現   : 描いた絵と元の画像を、どちらもぼかして比べた相関（1 に近いほど明暗が合う）
// 画像の読み書きに ffmpeg を使う。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { drawPlan } from '../js/pipeline.mjs';
import { luminance, gaussianBlur } from '../js/lines.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.join(HERE, '..', 'img');
const [outDir, ...rest] = process.argv.slice(2);
const opt = (name, def) => { const i = rest.indexOf(name); return i < 0 ? def : rest[i + 1]; };
const styles = opt('--styles', 'grid,hand').split(',');
const samples = opt('--samples', 'fisher,rain,street').split(',');
fs.mkdirSync(outDir, { recursive: true });

function readRGBA(file, max = 1000) {
  const [W, H] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
  const k = Math.min(1, max / Math.max(W, H));
  const w = Math.round(W * k), h = Math.round(H * k);
  return { w, h, rgba: new Uint8ClampedArray(execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${w}:${h}:flags=lanczos,format=rgba`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 })) };
}

// 筆を濃淡の画像に塗る（0 = 黒、1 = 白。円を並べ、縁はなめらかにする）
export function render(strokes, w, h) {
  const g = new Float32Array(w * h).fill(1);
  const disk = (cx, cy, r) => {
    for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(h - 1, Math.ceil(cy + r + 1)); y++)
      for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(w - 1, Math.ceil(cx + r + 1)); x++) {
        const a = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x - cx, y - cy)));
        if (a > 0) g[y * w + x] = Math.min(g[y * w + x], 1 - a * 0.93);
      }
  };
  for (const s of strokes) {
    const p = s.points;
    if (p.length === 1) { disk(p[0].x, p[0].y, p[0].w / 2); continue; }
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], m = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5));
      for (let j = 0; j <= m; j++) { const u = j / m; disk(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, (a.w + (b.w - a.w) * u) / 2); }
    }
  }
  return g;
}

const angleOf = (s) => { const a = s.points[0], b = s.points[s.points.length - 1]; return ((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 180) % 180; };
const adiff = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };
const median = (v) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const arc = (s) => { let L = 0; for (let i = 1; i < s.points.length; i++) L += Math.hypot(s.points[i].x - s.points[i - 1].x, s.points[i].y - s.points[i - 1].y); return L; };

function crossings(hs) {
  // 両端を結んだ線分で近似し、32px の格子で近いものどうしだけ調べる
  const segs = hs.map((s) => { const a = s.points[0], b = s.points[s.points.length - 1]; return { a, b, lv: s.level ?? 0, ang: angleOf(s) }; });
  const grid = new Map();
  segs.forEach((g, i) => {
    const x0 = Math.floor(Math.min(g.a.x, g.b.x) / 32), x1 = Math.floor(Math.max(g.a.x, g.b.x) / 32);
    const y0 = Math.floor(Math.min(g.a.y, g.b.y) / 32), y1 = Math.floor(Math.max(g.a.y, g.b.y) / 32);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = `${x},${y}`; (grid.get(k) ?? grid.set(k, []).get(k)).push(i); }
  });
  const cross = (p, q, r, s) => {
    const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d, u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
    return t > 0 && t < 1 && u > 0 && u < 1;
  };
  const seen = new Set(), angles = [];
  for (const list of grid.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i], B = list[j], key = A < B ? `${A}:${B}` : `${B}:${A}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const g = segs[A], k = segs[B];
    if (g.lv === k.lv) continue;
    if (cross(g.a, g.b, k.a, k.b)) angles.push(adiff(g.ang, k.ang));
  }
  return angles;
}

function corr(a, b) {
  let sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / a.length, mb = sb / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return num / Math.sqrt(da * db);
}

function savePNG(g, w, h, file) {
  const buf = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) buf[i] = Math.round(Math.max(0, Math.min(1, g[i])) * 255);
  const pgm = file.replace(/\.png$/, '.pgm');
  fs.writeFileSync(pgm, Buffer.concat([Buffer.from(`P5 ${w} ${h} 255\n`), buf]));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', pgm, file]);
  fs.unlinkSync(pgm);
}

const results = [];
for (const name of samples) {
  const { w, h, rgba } = readRGBA(path.join(IMG, `sample-${name}.webp`));
  const target = gaussianBlur(luminance(rgba, w, h), w, h, 4);
  for (const style of styles) {
    const t0 = performance.now();
    const plan = drawPlan(rgba, w, h, { detail: 0.5, hatch: true, hatchDensity: 0.5, hatchStyle: style });
    const ms = performance.now() - t0;
    const hs = plan.strokes.filter((s) => s.kind === 'hatch');
    const turns = [], travel = [];
    for (let i = 1; i < hs.length; i++) {
      turns.push(adiff(angleOf(hs[i - 1]), angleOf(hs[i])));
      // 続く 2 本の描き始めの点の距離（隣の線へ順に移れば、線の間隔くらいになる）
      const e = hs[i - 1].points[0], s = hs[i].points[0];
      travel.push(Math.hypot(s.x - e.x, s.y - e.y));
    }
    const lens = hs.map(arc), straight = hs.map((s) => { const L = arc(s); const a = s.points[0], b = s.points.at(-1); return L ? Math.hypot(b.x - a.x, b.y - a.y) / L : 1; });
    const cr = crossings(hs);
    const img = render(plan.strokes, w, h);
    const tone = corr(gaussianBlur(img, w, h, 4), target);
    const r = {
      見本: name, 方式: style, 斜線の本数: hs.length, 全部の筆: plan.strokes.length, 処理ms: Math.round(ms),
      向きの変化の中央値: +median(turns).toFixed(1), 大きく変わる割合: +(turns.filter((d) => d >= 30).length / Math.max(1, turns.length)).toFixed(3),
      始点の移動の中央値px: +median(travel).toFixed(1), 斜線の長さの中央値px: +median(lens).toFixed(1),
      直角の交差の割合: +(cr.filter((d) => d >= 75).length / Math.max(1, cr.length)).toFixed(3), 交差の角度の中央値: +median(cr).toFixed(1), 交差の数: cr.length,
      まっすぐさの中央値: +median(straight).toFixed(3), 明暗の相関: +tone.toFixed(3),
    };
    results.push(r);
    console.log(JSON.stringify(r));
    savePNG(img, w, h, path.join(outDir, `${name}-${style}.png`));
  }
}
fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(results, null, 1));
