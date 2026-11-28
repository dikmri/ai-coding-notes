// ベタ（最も暗い所を黒く塗りつぶす）。依存なし。
// 模写の解説によると、水木作品のベタは「筆で大まかに塗った後、G ペンで整えている」。それに合わせて
//   1. 筆: ベタの内側（縁から筆の太さの半分以上入った所）を、太い筆の線で斜めに往復して塗る
//   2. ペン: 筆で塗り残した縁の細い帯を細線化し、細いペンの線で縁を整える
// の順に描く筆を作る。
import { traceStrokes, distanceSquared, renderStrokes } from './trace.mjs';

// value の値を持つ 4 連結のかたまりのうち、面積が minArea 未満のものを反対の値にする。
// holes = true のときは、画像の縁に触れるかたまりは残す（外の白はベタの穴ではない）
function dropSmall(m, w, h, value, minArea, holes) {
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h), comp = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (m[i0] !== value || seen[i0]) continue;
    let top = 0, edge = false;
    comp.length = 0;
    stack[top++] = i0; seen[i0] = 1;
    while (top) {
      const i = stack[--top];
      comp.push(i);
      const x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && m[j] === value && !seen[j]) { seen[j] = 1; stack[top++] = j; }
      }
    }
    if (comp.length < minArea && !(holes && edge)) for (const i of comp) m[i] = 1 - value;
  }
  return m;
}

// 明るさ tone（0 = 黒）が below より暗い所のうち、面積 minArea 以上のかたまりをベタにする（小さな穴は埋める）
export function betaRegions(tone, w, h, { below = 0.12, minArea = 300 } = {}) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = tone[i] < below ? 1 : 0;
  dropSmall(m, w, h, 1, minArea, false);
  dropSmall(m, w, h, 0, minArea, true);
  return m;
}

// ベタを塗る筆。kind = 'fill'、level 0 = 筆、level 1 = ペン。group はベタのかたまりごと、seq は描く順
export function betaStrokes(mask, w, h, { brush = 6, angle = 30, pen = 1.4 } = {}) {
  // かたまりに番号を付ける（8 連結）
  const label = new Int32Array(w * h).fill(-1);
  let regions = 0;
  {
    const stack = new Int32Array(w * h);
    for (let i0 = 0; i0 < w * h; i0++) {
      if (!mask[i0] || label[i0] >= 0) continue;
      let top = 0;
      stack[top++] = i0; label[i0] = regions;
      while (top) {
        const i = stack[--top], x = i % w, y = (i / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (mask[j] && label[j] < 0) { label[j] = regions; stack[top++] = j; }
        }
      }
      regions++;
    }
  }
  if (!regions) return [];
  // 縁から筆の太さの半分以上入った所（筆の線の中心を置いてよい所）
  const d2 = distanceSquared(mask, w, h);
  const half = brush / 2 + 0.5;
  const core = (x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    return xi >= 0 && yi >= 0 && xi < w && yi < h && d2[yi * w + xi] >= half * half;
  };
  // 筆: 斜めの走査線を brush × 0.7 の間隔で並べ、core の中の区間を 1 本の筆にする。1 本ごとに向きを反対にして往復させる
  const a = (angle * Math.PI) / 180, dx = Math.cos(a), dy = -Math.sin(a), nx = -dy, ny = dx;
  const corners = [[0, 0], [w, 0], [0, h], [w, h]];
  const ts = corners.map(([x, y]) => x * nx + y * ny), ss = corners.map(([x, y]) => x * dx + y * dy);
  const t0 = Math.min(...ts), t1 = Math.max(...ts), s0 = Math.min(...ss), s1 = Math.max(...ss);
  const perRegion = Array.from({ length: regions }, () => ({ brush: [], pen: [] }));
  let flip = false;
  for (let t = t0 + brush * 0.35; t <= t1; t += brush * 0.7) {
    let run = null;
    const flush = () => {
      if (!run || run.length < 1) { run = null; return; }
      const pts = [];
      for (let k = 0; k < run.length; k += 3) pts.push(run[k]);
      if (pts[pts.length - 1] !== run[run.length - 1]) pts.push(run[run.length - 1]);
      const r = label[Math.round(pts[0].y) * w + Math.round(pts[0].x)];
      if (r >= 0) perRegion[r].brush.push({ points: (flip ? pts.reverse() : pts).map((p) => ({ x: p.x, y: p.y, w: brush })), kind: 'fill', level: 0, closed: false, fixedDir: true });
      flip = !flip;
      run = null;
    };
    for (let s = s0; s <= s1; s += 1) {
      const x = s * dx + t * nx, y = s * dy + t * ny;
      if (core(x, y)) (run ??= []).push({ x, y });
      else flush();
    }
    flush();
  }
  // ペン: 筆の線で塗れなかったベタの画素（縁の細い帯）を細線化して、細い線にする
  const brushAll = perRegion.flatMap((r) => r.brush);
  const covered = renderStrokes(brushAll, w, h);
  const band = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) band[i] = mask[i] && !covered[i] ? 1 : 0;
  const tr = traceStrokes({ w, h, ink: band }, { minRegion: 1e9 });
  for (const s of tr.strokes) {
    const p0 = s.points[0];
    const r = label[Math.round(p0.y) * w + Math.round(p0.x)];
    if (r < 0) continue;
    perRegion[r].pen.push({ points: s.points.map((p) => ({ x: p.x, y: p.y, w: Math.max(pen * 0.8, Math.min(brush, p.w + 0.6)) })), kind: 'fill', level: 1, closed: s.closed, fixedDir: true });
  }
  // 描く順: かたまりごとに、筆の線を走査線の順に、続けてペンの線を近い順に
  const out = [];
  perRegion.forEach((r, g) => {
    let seq = 0;
    for (const s of r.brush) out.push({ ...s, group: g, seq: seq++ });
    let pen0 = r.brush.length ? r.brush[r.brush.length - 1].points.at(-1) : r.pen[0]?.points[0];
    const rest = [...r.pen];
    while (rest.length) {
      let bi = 0, bd = Infinity;
      rest.forEach((s, k) => { const p = s.points[0], d = (p.x - pen0.x) ** 2 + (p.y - pen0.y) ** 2; if (d < bd) { bd = d; bi = k; } });
      const s = rest.splice(bi, 1)[0];
      out.push({ ...s, group: g, seq: seq++ });
      pen0 = s.points.at(-1);
    }
  });
  return out;
}
