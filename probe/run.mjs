// 計測の台本: node probe/run.mjs <入力.gray> <幅> <高さ> <出力フォルダ> [--photo] [--min-region N] [--long N]
// 入力は 8 ビットの濃淡の生データ（ffmpeg -pix_fmt gray -f rawvideo）。
// --photo のときは、写真から XDoG で線を起こしてから同じ処理に通す。
import fs from 'node:fs';
import path from 'node:path';
import { binarize, traceStrokes, renderStrokes } from './linetrace.mjs';

const [file, W, H, outDir, ...rest] = process.argv.slice(2);
const w = +W, h = +H;
const flag = (name, def) => { const i = rest.indexOf(name); return i < 0 ? def : rest[i + 1] === undefined || rest[i + 1].startsWith('--') ? true : rest[i + 1]; };
const photo = !!flag('--photo', false);
const minRegion = +flag('--min-region', 1200);
const longLen = +flag('--long', 120);
fs.mkdirSync(outDir, { recursive: true });
let gray = new Uint8Array(fs.readFileSync(file));

function blur(src, sigma) {
  const r = Math.ceil(sigma * 3), k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r]; tmp[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r]; out[y * w + x] = s; }
  return out;
}
const t00 = performance.now();
if (photo) {
  // XDoG（差分ガウスを鋭くして、しきい値で線にする）
  const f = Float32Array.from(gray, (v) => v / 255);
  const sigma = +flag('--sigma', 1.4), p = +flag('--p', 22), eps = +flag('--eps', 0.62), phi = +flag('--phi', 12);
  const g1 = blur(f, sigma), g2 = blur(f, sigma * 1.6);
  gray = new Uint8Array(w * h);
  const tau = flag('--tau', null); // 指定したときは面を塗らない DoG（輪郭だけ）: s = G1 - tau*G2
  for (let i = 0; i < w * h; i++) {
    const s = tau !== null ? g1[i] - +tau * g2[i] : (1 + p) * g1[i] - p * g2[i];
    const e = s >= eps ? 1 : 1 + Math.tanh(phi * (s - eps));
    gray[i] = Math.max(0, Math.min(255, Math.round(e * 255)));
  }
}
const tPre = performance.now() - t00;
const img = binarize(gray, w, h, 128);
const tStart = performance.now();
const res = traceStrokes(img, { minRegion, longLen });
const tTrace = performance.now() - tStart;
const tR0 = performance.now();
const R = renderStrokes(res.strokes, w, h);
const tRender = performance.now() - tR0;

const O = img.ink;
const dilate = (m) => { const o = Uint8Array.from(m); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (m[i]) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (m[i + dy * w + dx]) o[i] = 1; } return o; };
const Od = dilate(O), Rd = dilate(R);
let nO = 0, nR = 0, rInO = 0, oInR = 0, both = 0;
for (let i = 0; i < w * h; i++) { nO += O[i]; nR += R[i]; if (R[i] && Od[i]) rInO++; if (O[i] && Rd[i]) oInR++; if (O[i] && R[i]) both++; }

// 外形（外の白でない部分）の一致
const resR = traceStrokes({ w, h, ink: R }, { minRegion, longLen });
let sO = 0, sR = 0, sBoth = 0;
for (let i = 0; i < w * h; i++) { const a = !res.regions.outside[i], b = !resR.regions.outside[i]; sO += a; sR += b; if (a && b) sBoth++; }

const stages = [0, 0, 0];
let rec = 0, raw = 0;
for (const st of res.strokes) { stages[st.stage]++; rec += st.recorded; raw += st.rawCount; }
const widths = res.strokes.flatMap((st) => st.points.map((p) => p.w)).sort((a, b) => a - b);
const report = {
  入力: path.basename(file), 大きさ: `${w}x${h}`, 写真から: photo,
  前処理ms: Math.round(tPre), 筆に分けるms: Math.round(tTrace), 内訳ms: Object.fromEntries(Object.entries(res.timings).map(([k, v]) => [k, Math.round(v)])), 塗り直しms: Math.round(tRender),
  筆の数: res.strokes.length, 段ごと: { 外周: stages[0], 長い線: stages[1], 短い線: stages[2] },
  閉じた筆: res.strokes.filter((s) => s.closed).length,
  記録点の合計: rec, 中心線の画素の合計: raw,
  線幅の中央値px: +widths[widths.length >> 1]?.toFixed(2), 線幅の90パーセンタイルpx: +widths[Math.floor(widths.length * 0.9)]?.toFixed(2),
  元の墨の画素: nO, 塗り直した墨の画素: nR,
  元の墨のうち塗り直しが1px以内で覆う割合: +(oInR / nO).toFixed(4),
  塗り直しのうち元の墨から1px以内の割合: +(rInO / nR).toFixed(4),
  ちょうど重なる割合IoU: +(both / (nO + nR - both)).toFixed(4),
  外形の面積の一致IoU: +(sBoth / (sO + sR - sBoth)).toFixed(4),
  囲まれた領域: { 元: res.regions.enclosed.length, 塗り直し: resR.regions.enclosed.length, 最小面積px: minRegion },
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));

// 絵: 元（二値）・中心線・途中 3 段・完成（段で色分け）
const writePGM = (name, m) => { const buf = Buffer.alloc(w * h); for (let i = 0; i < w * h; i++) buf[i] = m[i] ? 0 : 255; fs.writeFileSync(path.join(outDir, name), Buffer.concat([Buffer.from(`P5 ${w} ${h} 255\n`), buf])); };
writePGM('0-input.pgm', O);
writePGM('1-skeleton.pgm', res.skeleton);
const n = res.strokes.length;
[0.1, 0.35, 0.7].forEach((f, k) => writePGM(`${2 + k}-at${Math.round(f * 100)}.pgm`, renderStrokes(res.strokes, w, h, Math.round(n * f))));
const col = [[200, 40, 40], [30, 30, 30], [40, 90, 200]];
const ppm = Buffer.alloc(w * h * 3, 255);
for (let stage = 0; stage < 3; stage++) {
  const m = renderStrokes(res.strokes.filter((s) => s.stage === stage), w, h);
  const c = col[stage];
  for (let i = 0; i < w * h; i++) if (m[i]) { ppm[i * 3] = c[0]; ppm[i * 3 + 1] = c[1]; ppm[i * 3 + 2] = c[2]; }
}
fs.writeFileSync(path.join(outDir, '5-final-stages.ppm'), Buffer.concat([Buffer.from(`P6 ${w} ${h} 255\n`), ppm]));
