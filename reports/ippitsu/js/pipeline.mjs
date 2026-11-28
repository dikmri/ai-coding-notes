// 画像（RGBA の画素）から「描く筆の列」を作るまでの通しの処理。依存なし（Web Worker と Node で動く）。
//   1. 写真か線画かを見分ける
//   2. 線を起こす（写真: 流れに沿った DoG ／ 線画: しきい値）
//   3. 細線化して、中心線と線幅の筆に分ける（trace.mjs）
//   4. 写真なら、暗い所に斜線の筆を足す（hatch.mjs）
//   5. 順番を決め（order.mjs）、ペンの入り抜きを付ける（pen.mjs）
import { luminance, gaussianBlur, flowField, extractLines, isLineArt, binarizeLineArt } from './lines.mjs';
import { traceStrokes } from './trace.mjs';
import { hatchStrokes, hatchHuman } from './hatch.mjs';
import { stippleDots } from './stipple.mjs';
import { betaRegions, betaStrokes } from './beta.mjs';
import { orderStrokes, STAGES } from './order.mjs';
import { penProfile } from './pen.mjs';

// 8 近傍でつながった墨のかたまりのうち、面積が minArea 未満のものを消す（写真から出る点のような線）
export function removeSpecks(ink, w, h, minArea) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const comp = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!ink[i0] || seen[i0]) continue;
    let top = 0;
    comp.length = 0;
    stack[top++] = i0; seen[i0] = 1;
    while (top) {
      const i = stack[--top];
      comp.push(i);
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (ink[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
      }
    }
    if (comp.length < minArea) for (const i of comp) ink[i] = 0;
  }
  return ink;
}

// 明るさを、画像の暗い側 2% と明るい側 2% の値で 0〜1 に引き伸ばす（斜線の濃さを画像ごとにそろえる）
function stretch(gray) {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[Math.min(255, Math.max(0, Math.round(v * 255)))]++;
  const n = gray.length;
  let acc = 0, lo = 0, hi = 255;
  for (let t = 0; t < 256; t++) { acc += hist[t]; if (acc >= n * 0.02) { lo = t; break; } }
  acc = 0;
  for (let t = 255; t >= 0; t--) { acc += hist[t]; if (acc >= n * 0.02) { hi = t; break; } }
  const span = Math.max(1, hi - lo) / 255, base = lo / 255;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, (gray[i] - base) / span));
  return out;
}

export const DEFAULTS = {
  mode: 'auto',      // 'auto' | 'photo' | 'lineart'
  detail: 0.5,       // 0〜1。大きいほど細かい線まで拾う
  hatch: true,       // 写真のとき、暗い所に斜線を引く
  hatchDensity: 0.5, // 0〜1。大きいほど斜線が増える
  // 'hand'（人の斜線）| 'grid'（格子。前の方式）| 'stipple'（点描）| 'stipple-only'（点描だけ。主線なし）
  // | 'beta-stipple'（ベタと点描）| 'beta-stipple-only'（ベタと点描だけ。主線なし）| 'beta-only'（ベタだけ）
  hatchStyle: 'hand',
};

export function drawPlan(rgba, w, h, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const t = {};
  let t0 = performance.now();
  const lap = (name) => { const t1 = performance.now(); t[name] = (t[name] ?? 0) + (t1 - t0); t0 = t1; };

  const mode = o.mode === 'auto' ? (isLineArt(rgba, w, h) ? 'lineart' : 'photo') : o.mode;
  const gray = luminance(rgba, w, h);
  lap('見分ける');
  let ink, flow = null;
  if (mode === 'lineart') {
    ink = binarizeLineArt(gray, w, h);
    lap('線を拾う');
  } else {
    flow = flowField(gray, w, h, { tensorSigma: 3 });
    lap('模様の向き');
    // detail 0 → 0.016、0.5 → 0.006、1 → 0.0022（指数で動かす）
    const threshold = 0.016 * Math.pow(0.1375, o.detail);
    ink = extractLines(gray, w, h, { threshold, flow }).ink;
    removeSpecks(ink, w, h, 8);
    lap('線を起こす');
  }
  const diag = Math.hypot(w, h);
  const tr = traceStrokes({ w, h, ink }, { minRegion: Math.max(60, Math.round(w * h * 0.00025)) });
  for (const [k, v] of Object.entries(tr.timings)) t[k === '細線化' || k === '距離変換' ? k : '筆にする'] = (t[k === '細線化' || k === '距離変換' ? k : '筆にする'] ?? 0) + v;
  t0 = performance.now();
  let strokes = tr.strokes.filter((s) => s.length >= (mode === 'photo' ? 3 : 1.5) || s.points.length === 1 && s.points[0].w >= 2.5);
  // 写真から起こした線は DoG の幅で太めに出るので、ペンの線らしく細くする
  if (mode === 'photo') for (const s of strokes) for (const p of s.points) p.w = Math.min(3.2, p.w * 0.7);

  let hatchCount = 0;
  // 点描とベタの組み合わせ。noLines = 主線を描かない、withBeta = ベタを塗る、withDots = 点描を打つ
  const STYLE = {
    stipple: { withDots: true },
    'stipple-only': { withDots: true, noLines: true },
    'beta-stipple': { withDots: true, withBeta: true },
    'beta-stipple-only': { withDots: true, withBeta: true, noLines: true },
    'beta-only': { withBeta: true, noLines: true },
  }[o.hatchStyle];
  const stippleStyle = !!STYLE;
  if (mode === 'photo' && o.hatch && stippleStyle) {
    // 点描: 約 5mm 角（対角の 2.2%）のマスごとに、ほぼ同じ大きさの点を均等に散らして打つ
    const tone = gaussianBlur(stretch(gray), w, h, 1.2);
    const d = o.hatchDensity;
    if (STYLE.noLines) {
      // 点描だけ（主線なし）: 線を描かない代わりに、明暗の差を強め（アンシャープマスク）、
      // 起こした線の位置では点を少し密にして、形の境目を点の密度で出す
      const base = gaussianBlur(tone, w, h, 4);
      for (let i = 0; i < w * h; i++) {
        let v = tone[i] + 0.7 * (tone[i] - base[i]);
        if (ink[i]) v = Math.min(v, 0.42);
        tone[i] = Math.min(1, Math.max(0, v));
      }
      strokes = [];
    }
    let fills = [];
    if (STYLE.withBeta) {
      // ベタ: 最も暗い面は筆とペンで黒く塗り、その中には点を打たない
      const mask = betaRegions(gaussianBlur(stretch(gray), w, h, 2), w, h, { below: 0.08 + 0.12 * d, minArea: Math.max(120, Math.round(w * h * 0.0004)) });
      fills = betaStrokes(mask, w, h, { brush: Math.max(4, diag * 0.005), pen: Math.max(1.2, (diag / 1267) * 1.4) });
      for (let i = 0; i < w * h; i++) if (mask[i]) tone[i] = 1;
      lap('ベタ');
    }
    const dots = STYLE.withDots ? stippleDots(tone, w, h, { cell: Math.max(12, Math.round(diag * 0.022)), dot: Math.max(1.2, (diag / 1267) * 1.6), cmax: 0.4 + 0.45 * d }) : [];
    hatchCount = dots.length;
    strokes = strokes.concat(fills, dots);
    if (STYLE.withDots) lap('点描');
  } else if (mode === 'photo' && o.hatch && o.hatchStyle === 'hand') {
    // 人の描き方: 「/」（60°）にそろえた束を基本にし、暗い所は 55° 回した束を重ねる（直角の格子にしない）。
    // 最も暗い所は、3 つ目の向きを足さず、1 段目の線の間に同じ向きの線を足す（三角の網目にしない）
    const tone = gaussianBlur(stretch(gray), w, h, 2.0);
    const hflow = flowField(gray, w, h, { sigma: 2, tensorSigma: 10 });
    const d = o.hatchDensity;
    const sp = 9.5 - 4 * d; // 0 → 9.5px、1 → 5.5px
    const levels = [
      { below: 0.34 + 0.22 * d, spacing: sp, angle: 0 },
      { below: 0.16 + 0.14 * d, spacing: sp, angle: 55 },
      { below: 0.1 + 0.08 * d, spacing: sp, angle: 0, between: 0 },   // 1 段目の線の間を埋める
      { below: 0.05 + 0.06 * d, spacing: sp, angle: 55, between: 1 }, // 2 段目の線の間を埋める
    ];
    // 長い輪郭の線を壁にして、斜線が輪郭を越えないようにする
    const barrier = new Uint8Array(w * h);
    for (const s of strokes) {
      if (s.length < diag * 0.07) continue;
      for (const p of s.points) {
        const r = Math.max(1, Math.round(p.w / 2)), cx = Math.round(p.x), cy = Math.round(p.y);
        for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) barrier[y * w + x] = 1;
      }
    }
    const hs = hatchHuman(tone, hflow, w, h, { levels, baseAngle: 60, follow: 0.55, maxLen: Math.max(28, diag * 0.055), minLen: 8, width: 0.9, jitter: 2.5, barrier });
    hatchCount = hs.length;
    strokes = strokes.concat(hs);
    lap('斜線');
  } else if (mode === 'photo' && o.hatch) {
    const tone = gaussianBlur(stretch(gray), w, h, 2.0);
    const hflow = flowField(gray, w, h, { sigma: 2, tensorSigma: 7 });
    // 1 段目は形に少し沿う斜線、2 段目は交差するまっすぐな斜線、3 段目は最も暗い所だけの細かい斜線
    const sp = 10 - 5 * o.hatchDensity; // 0 → 10px、1 → 5px
    const d = o.hatchDensity;
    const levels = [
      { below: 0.3 + 0.2 * d, spacing: sp, angle: 0, follow: 0.45, inertia: 0.8 },
      { below: 0.12 + 0.12 * d, spacing: sp, angle: 90, follow: 0, inertia: 0.9 },
      { below: 0.03 + 0.06 * d, spacing: sp * 0.7, angle: 45, follow: 0, inertia: 0.9 },
    ];
    const hs = hatchStrokes(tone, hflow, w, h, { levels, maxLen: Math.max(24, diag * 0.045), width: 0.8, fallbackAngle: 62 });
    hatchCount = hs.length;
    strokes = strokes.concat(hs);
    lap('斜線');
  }
  const ordered = orderStrokes(strokes, { mode, longLen: diag * 0.07, midLen: diag * 0.022 });
  lap('順番を決める');
  for (const s of ordered) {
    // ベタの筆とペンは塗り残しが出ないよう細くしない。人の描き方の斜線は、入りを短く、抜きを長くする（素早く払う線）
    if (s.kind === 'fill') continue;
    s.points = s.fixedDir
      ? penProfile(s.points, { taperIn: 2.5, taperOut: Math.min(12, s.length * 0.4), minW: 0.3 })
      : penProfile(s.points, { taperIn: Math.min(12, diag * 0.01), taperOut: Math.min(16, diag * 0.014) });
  }
  lap('入り抜き');

  // 段の名前: ベタがあれば「… → ベタ → 点描」、点描なら最後の段を「点描」、点描だけなら「点描」の 1 段
  let stages = STAGES[mode];
  if (mode === 'photo' && ordered.some((s) => s.kind === 'fill')) stages = STAGES.photoBeta;
  else if (mode === 'photo' && stippleStyle) stages = [...STAGES.photo.slice(0, 3), '点描'];
  // 主線を描かないモードは、使う段だけにする（ベタ → 点描）
  if (mode === 'photo' && STYLE?.noLines) {
    stages = [...(STYLE.withBeta ? ['ベタ'] : []), ...(STYLE.withDots ? ['点描'] : [])];
    for (const s of ordered) s.stage = s.kind === 'fill' ? 0 : stages.indexOf('点描');
  }
  const stageCounts = stages.map(() => 0);
  let totalLength = 0, recorded = 0;
  for (const s of ordered) { stageCounts[s.stage]++; totalLength += s.length; recorded += s.points.length; }
  return {
    mode, w, h, strokes: ordered, hatchCount,
    stages, stageCounts,
    totalLength, recorded, regions: tr.regions.enclosed.length, timings: t,
    layers: { ink, skeleton: tr.skeleton, flow },
  };
}
