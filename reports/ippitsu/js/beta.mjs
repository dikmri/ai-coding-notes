// ベタ（最も暗い所を黒く塗りつぶす）。依存なし。
// 模写の解説によると、水木作品のベタは「筆で大まかに塗った後、G ペンで整えている」。それに合わせて
//   1. 筆: ベタの内側（縁から筆の太さの半分以上入った所）を、太い筆の線で斜めに往復して塗る
//   2. ペン: 筆で塗り残した縁の細い帯を細線化し、細いペンの線で縁を整える
// の順に描く筆を作る。
import { distanceSquared } from './trace.mjs';

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

// ベタを塗る筆。kind = 'fill'、level 0 = 筆、level 1 = 縁を整える輪郭の多角形（poly）。group はベタのかたまりごと、seq は描く順。
// field を渡すと、その値 0.5 の所を輪郭にする（ぼかした面を渡すと、縁がなめらかになる）
export function betaStrokes(mask, w, h, { brush = 6, angle = 30, field = null } = {}) {
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
  const half = brush / 2 + 1.2; // 走査線の点は画素の位置に丸めて調べるので、その分も余裕をみる
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
  // 縁を整える: 面の輪郭（field の値 0.5 の所）をなぞった多角形を、かたまりごとに 1 枚で塗る。
  // 輪郭の形そのものを塗るので、はみ出しも塗り残しも出ない（線の丸い端や、線どうしの隙間が無い）
  const rings = maskContours(field ?? Float32Array.from(mask), w, h, 0.5);
  const ringsByRegion = Array.from({ length: regions }, () => []);
  for (const ring of rings) {
    // 輪郭の点のまわりの画素から、かたまりの番号を探す
    let r = -1;
    for (const p of ring) {
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) {
        const xi = Math.floor(p.x) + ox, yi = Math.floor(p.y) + oy;
        if (xi >= 0 && yi >= 0 && xi < w && yi < h && label[yi * w + xi] >= 0) { r = label[yi * w + xi]; break; }
      }
      if (r >= 0) break;
    }
    if (r >= 0) ringsByRegion[r].push(ring);
  }
  // 描く順: かたまりごとに、筆の線を走査線の順に、最後に輪郭の多角形を 1 枚
  const out = [];
  const areaOf = new Float64Array(regions);
  for (let i = 0; i < w * h; i++) if (label[i] >= 0) areaOf[label[i]]++;
  perRegion.forEach((rg, g) => {
    let seq = 0;
    for (const s of rg.brush) out.push({ ...s, group: g, seq: seq++ });
    if (ringsByRegion[g].length) out.push({ points: joinRings(ringsByRegion[g]), kind: 'fill', level: 1, poly: true, group: g, seq: seq++, closed: true, length: Math.max(6, Math.sqrt(areaOf[g]) * 0.35) });
  });
  return out;
}

// 多角形の輪の並びを、1 本の筆の点の並びにする。輪の区切りは w = -1 の点（座標は直前の点と同じ）
export const RING_BREAK = -1;
function joinRings(rings) {
  const pts = [];
  rings.forEach((ring, k) => {
    for (const p of ring) pts.push({ x: p.x, y: p.y, w: 0 });
    if (k < rings.length - 1) { const q = ring[ring.length - 1]; pts.push({ x: q.x, y: q.y, w: RING_BREAK }); }
  });
  return pts;
}
export function ringsOf(points) {
  const rings = [];
  let cur = [];
  for (const p of points) { if (p.w === RING_BREAK) { if (cur.length) rings.push(cur); cur = []; } else cur.push(p); }
  if (cur.length) rings.push(cur);
  return rings;
}

// マーチングスクエア: field が iso 以上の所を内側として、その輪郭を閉じた輪の列で返す（画像の外は 0 とみなす）。
// 点の座標は画素の位置（画素 (x, y) の中心が座標 (x, y)）。輪の向きはそろえない（塗るときは even-odd）
export function maskContours(field, w, h, iso = 0.5) {
  const v = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : field[y * w + x]);
  const pts = new Map(); // 辺の名前 → 点
  const adj = new Map(); // 辺の名前 → つながる辺の名前
  const edgePoint = (key, ax, ay, bx, by) => {
    if (!pts.has(key)) {
      const va = v(ax, ay), vb = v(bx, by), t = va === vb ? 0.5 : Math.min(1, Math.max(0, (iso - va) / (vb - va)));
      pts.set(key, { x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
    }
    return key;
  };
  const link = (p, q) => { (adj.get(p) ?? adj.set(p, []).get(p)).push(q); (adj.get(q) ?? adj.set(q, []).get(q)).push(p); };
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const tl = v(x, y) >= iso ? 8 : 0, tr = v(x + 1, y) >= iso ? 4 : 0, br = v(x + 1, y + 1) >= iso ? 2 : 0, bl = v(x, y + 1) >= iso ? 1 : 0;
    const c = tl | tr | br | bl;
    if (c === 0 || c === 15) continue;
    const T = () => edgePoint(`h${x},${y}`, x, y, x + 1, y), B = () => edgePoint(`h${x},${y + 1}`, x, y + 1, x + 1, y + 1);
    const Lf = () => edgePoint(`v${x},${y}`, x, y, x, y + 1), R = () => edgePoint(`v${x + 1},${y}`, x + 1, y, x + 1, y + 1);
    const center = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 >= iso;
    switch (c) {
      case 1: case 14: link(Lf(), B()); break;
      case 2: case 13: link(B(), R()); break;
      case 3: case 12: link(Lf(), R()); break;
      case 4: case 11: link(T(), R()); break;
      case 6: case 9: link(T(), B()); break;
      case 7: case 8: link(Lf(), T()); break;
      case 5: if (center) { link(Lf(), T()); link(B(), R()); } else { link(Lf(), B()); link(T(), R()); } break;
      case 10: if (center) { link(T(), R()); link(Lf(), B()); } else { link(Lf(), T()); link(B(), R()); } break;
    }
  }
  // 辺の点をたどって輪にする
  const seen = new Set(), rings = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const ring = [];
    let prev = null, cur = start;
    for (let guard = 0; guard < 1e7; guard++) {
      seen.add(cur);
      ring.push(pts.get(cur));
      const nb = adj.get(cur);
      const next = nb[0] !== prev ? nb[0] : nb[1];
      if (next === undefined || next === start) break;
      if (seen.has(next)) break;
      prev = cur; cur = next;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

// 輪の列を even-odd で塗った画素（1/0）。k 倍の大きさの画像で、画素 (x, y) は座標 (x/k, y/k) を見る
export function fillRings(rings, W, H, k = 1) {
  const out = new Uint8Array(W * H);
  const edges = [];
  for (const ring of rings) for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; if (a.y !== b.y) edges.push(a.x, a.y, b.x, b.y); }
  const xs = [];
  for (let y = 0; y < H; y++) {
    const Y = y / k;
    xs.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const ax = edges[e], ay = edges[e + 1], bx = edges[e + 2], by = edges[e + 3];
      if ((ay <= Y && by > Y) || (by <= Y && ay > Y)) xs.push(ax + ((Y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(xs[i] * k)), x1 = Math.min(W - 1, Math.floor(xs[i + 1] * k - 1e-9));
      for (let x = x0; x <= x1; x++) out[y * W + x] = 1;
    }
  }
  return out;
}
