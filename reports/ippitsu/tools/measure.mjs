// 手元の計測: 画像ファイルを drawPlan に通し、時間・筆の数と、途中の絵を書き出す。
// 使い方: node reports/ippitsu/tools/measure.mjs <画像> <出力フォルダ> [--max 1000] [--detail 0.5] [--hatch 0|1] [--density 0.5] [--mode auto]
// 画像の読み込みと絵の書き出しに ffmpeg を使う（PATH にあること）。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { drawPlan } from '../js/pipeline.mjs';

const [file, outDir, ...rest] = process.argv.slice(2);
const opt = (name, def) => { const i = rest.indexOf(name); return i < 0 ? def : rest[i + 1]; };
const max = +opt('--max', 1000);
fs.mkdirSync(outDir, { recursive: true });

// 画像の大きさを調べ、長い辺を max 以下にして RGBA の生データで読む
const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
const k = Math.min(1, max / Math.max(probe[0], probe[1]));
const w = Math.round(probe[0] * k), h = Math.round(probe[1] * k);
const rgba = new Uint8ClampedArray(execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${w}:${h}:flags=lanczos,format=rgba`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 }));

const t0 = performance.now();
const plan = drawPlan(rgba, w, h, { detail: +opt('--detail', 0.5), hatch: opt('--hatch', '1') === '1', hatchDensity: +opt('--density', 0.5), mode: opt('--mode', 'auto') });
const total = performance.now() - t0;
const report = {
  入力: path.basename(file), 大きさ: `${w}x${h}`, 種類: plan.mode, 合計ms: Math.round(total),
  内訳ms: Object.fromEntries(Object.entries(plan.timings).map(([a, b]) => [a, Math.round(b)])),
  筆の数: plan.strokes.length, 段ごと: Object.fromEntries(plan.stages.map((s, i) => [s, plan.stageCounts[i]])),
  斜線: plan.hatchCount, 線の長さの合計px: Math.round(plan.totalLength), 記録点: plan.recorded, 囲まれた領域: plan.regions,
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));

// 塗る（簡易のアンチエイリアス付き。円を並べる）
function render(strokes, upto, color = (s) => [17, 17, 17]) {
  const img = new Float32Array(w * h * 3).fill(1);
  for (let n = 0; n < Math.min(upto, strokes.length); n++) {
    const s = strokes[n], c = color(s).map((v) => v / 255), pts = s.points;
    const stamp = (cx, cy, r) => {
      for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(h - 1, Math.ceil(cy + r + 1)); y++)
        for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(w - 1, Math.ceil(cx + r + 1)); x++) {
          const a = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x - cx, y - cy)));
          if (a <= 0) continue;
          const i = (y * w + x) * 3;
          for (let q = 0; q < 3; q++) img[i + q] = Math.min(img[i + q], img[i + q] * (1 - a) + c[q] * a);
        }
    };
    if (pts.length === 1) { stamp(pts[0].x, pts[0].y, pts[0].w / 2); continue; }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y), m = Math.max(1, Math.ceil(L / 0.5));
      for (let j = 0; j <= m; j++) { const u = j / m; stamp(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, (a.w + (b.w - a.w) * u) / 2); }
    }
  }
  return img;
}
function writePNG(name, img) {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h * 3; i++) buf[i] = Math.round(img[i] * 255);
  const ppm = path.join(outDir, name.replace(/\.png$/, '.ppm'));
  fs.writeFileSync(ppm, Buffer.concat([Buffer.from(`P6 ${w} ${h} 255\n`), buf]));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', ppm, path.join(outDir, name)]);
  fs.unlinkSync(ppm);
}
const N = plan.strokes.length;
for (const f of [0.15, 0.4, 0.7, 1]) writePNG(`at${Math.round(f * 100)}.png`, render(plan.strokes, Math.round(N * f)));
const pal = [[200, 50, 40], [30, 30, 30], [60, 100, 200], [40, 150, 90]];
writePNG('stages.png', render(plan.strokes, N, (s) => pal[s.stage]));
