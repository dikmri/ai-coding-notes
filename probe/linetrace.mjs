// 試作: 線画（白地に黒）を「中心線＋線幅」の筆に分け、描く順番を決める。
// 計測用。依存なし。Node でもブラウザ（Canvas の画素）でも同じコードが動く。
//
// 流れ: 二値化 → 距離変換（線幅） → Zhang-Suen の細線化 → 階段状の余分な画素を外す
//      → 端点・分岐点でつないだ図にする → 短いひげを外す → 分岐点で向きの続く枝をつなぐ
//      → 筆（点列・線幅・閉じているか） → 背景の領域を数える → 外周 → 長い線 → 短い線 の順に並べる

const DX = [0, 1, 1, 1, 0, -1, -1, -1]; // N, NE, E, SE, S, SW, W, NW（時計回り）
const DY = [-1, -1, 0, 1, 1, 1, 0, -1];

// 3x3 の周りの 8 画素の並び（ビット k = 上の順の k 番目）ごとに、
// 前景の 8 連結の成分数と、4 近傍を含む背景の 4 連結の成分数を前もって数えておく
const FG8 = new Uint8Array(256);
const BG4 = new Uint8Array(256);
(() => {
  for (let m = 0; m < 256; m++) {
    const on = (k) => (m >> (k & 7)) & 1;
    // 前景: 周りの画素どうしはチェビシェフ距離 1 なら隣
    const parent = [0, 1, 2, 3, 4, 5, 6, 7];
    const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
      if (!on(a) || !on(b)) continue;
      if (Math.max(Math.abs(DX[a] - DX[b]), Math.abs(DY[a] - DY[b])) === 1) parent[find(a)] = find(b);
    }
    const roots = new Set();
    for (let a = 0; a < 8; a++) if (on(a)) roots.add(find(a));
    FG8[m] = roots.size;
    // 背景: 並びで隣り合う位置は辺を共有する。4 近傍（偶数番）を含む成分だけ数える
    let comps = 0;
    const seen = new Uint8Array(8);
    for (let a = 0; a < 8; a += 2) {
      if (on(a) || seen[a]) continue;
      comps++;
      const stack = [a];
      seen[a] = 1;
      while (stack.length) {
        const c = stack.pop();
        for (const n of [(c + 1) & 7, (c + 7) & 7]) if (!on(n) && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    BG4[m] = comps;
  }
})();

export function binarize(gray, w, h, threshold = 128) {
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = gray[i] < threshold ? 1 : 0;
  return { w, h, ink };
}

// 墨の各画素から最も近い白の画素までの距離の 2 乗（Felzenszwalb の厳密な距離変換）
function distanceSquared(ink, w, h) {
  const INF = 1e20;
  const d = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = ink[i] ? INF : 0;
  const n = Math.max(w, h);
  const f = new Float64Array(n), out = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const pass = (len) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = d[y * w + x];
    pass(h);
    for (let y = 0; y < h; y++) d[y * w + x] = out[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = d[y * w + x];
    pass(w);
    for (let x = 0; x < w; x++) d[y * w + x] = out[x];
  }
  return d;
}

function ringMask(s, w, i) {
  let m = 0;
  for (let k = 0; k < 8; k++) if (s[i + DY[k] * w + DX[k]]) m |= 1 << k;
  return m;
}

function zhangSuen(ink, w, h) {
  const s = Uint8Array.from(ink);
  for (let x = 0; x < w; x++) { s[x] = 0; s[(h - 1) * w + x] = 0; }
  for (let y = 0; y < h; y++) { s[y * w] = 0; s[y * w + w - 1] = 0; }
  const del = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!s[i]) continue;
        const p2 = s[i - w], p3 = s[i - w + 1], p4 = s[i + 1], p5 = s[i + w + 1];
        const p6 = s[i + w], p7 = s[i + w - 1], p8 = s[i - 1], p9 = s[i - w - 1];
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        const a = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (a !== 1) continue;
        if (pass === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
        del.push(i);
      }
      for (const i of del) s[i] = 0;
      if (del.length) changed = true;
    }
  }
  // 階段状の余分な画素（外しても形のつながりが変わらない、端点でない画素）を外す
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!s[i]) continue;
    const m = ringMask(s, w, i);
    let cnt = 0;
    for (let k = 0; k < 8; k++) cnt += (m >> k) & 1;
    if (cnt >= 2 && FG8[m] === 1 && BG4[m] === 1) s[i] = 0;
  }
  return s;
}

// 白の 4 連結の領域に番号を付ける。外（画像の縁に触れる領域）と、囲まれた領域に分ける
function labelBackground(ink, w, h, minArea) {
  const label = new Int32Array(w * h).fill(-1);
  const areas = [], touches = [];
  const stack = new Int32Array(w * h);
  let id = 0;
  for (let i0 = 0; i0 < w * h; i0++) {
    if (ink[i0] || label[i0] >= 0) continue;
    let top = 0, area = 0, edge = false;
    stack[top++] = i0; label[i0] = id;
    while (top) {
      const i = stack[--top];
      area++;
      const x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      if (x > 0 && !ink[i - 1] && label[i - 1] < 0) { label[i - 1] = id; stack[top++] = i - 1; }
      if (x < w - 1 && !ink[i + 1] && label[i + 1] < 0) { label[i + 1] = id; stack[top++] = i + 1; }
      if (y > 0 && !ink[i - w] && label[i - w] < 0) { label[i - w] = id; stack[top++] = i - w; }
      if (y < h - 1 && !ink[i + w] && label[i + w] < 0) { label[i + w] = id; stack[top++] = i + w; }
    }
    areas.push(area); touches.push(edge); id++;
  }
  const enclosed = [];
  for (let k = 0; k < id; k++) if (!touches[k] && areas[k] >= minArea) enclosed.push({ id: k, area: areas[k] });
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (label[i] >= 0 && touches[label[i]]) outside[i] = 1;
  return { label, enclosed, outside, count: id };
}

// 外の白からの距離（4 近傍の歩数、上限つき）
function distanceFrom(mask, w, h, limit) {
  const d = new Uint16Array(w * h).fill(limit);
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (let i = 0; i < w * h; i++) if (mask[i]) { d[i] = 0; q[tail++] = i; }
  while (head < tail) {
    const i = q[head++];
    const nd = d[i] + 1;
    if (nd >= limit) continue;
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= w * h || d[j] <= nd) continue;
      d[j] = nd; q[tail++] = j;
    }
  }
  return d;
}

function smooth(points, radius) {
  const n = points.length;
  if (n < 3) return points;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = Math.min(radius, i, n - 1 - i);
    let sx = 0, sy = 0, sw = 0;
    for (let j = i - r; j <= i + r; j++) { sx += points[j].x; sy += points[j].y; sw += points[j].w; }
    const c = 2 * r + 1;
    out[i] = { x: sx / c, y: sy / c, w: sw / c };
  }
  return out;
}

// Ramer-Douglas-Peucker で残る点の数（「記録点」の目安）
function simplifiedCount(pts, eps) {
  if (pts.length < 3) return pts.length;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a].x, ay = pts[a].y, bx = pts[b].x, by = pts[b].y;
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const dd = Math.abs((bx - ax) * (ay - pts[i].y) - (ax - pts[i].x) * (by - ay)) / L;
      if (dd > best) { best = dd; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  let c = 0;
  for (const k of keep) c += k;
  return c;
}

export function traceStrokes(img, opts = {}) {
  const { w, h, ink } = img;
  const minRegion = opts.minRegion ?? 300;
  const longLen = opts.longLen ?? 60;
  const t = {};
  let t0 = performance.now();
  const lap = (name) => { const t1 = performance.now(); t[name] = t1 - t0; t0 = t1; };

  const d2 = distanceSquared(ink, w, h); lap('距離変換');
  const s = zhangSuen(ink, w, h); lap('細線化');

  // 端点・分岐点（隣の数が 2 でない画素）。隣り合う分岐点の画素は 1 つの節にまとめる
  const deg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (s[i]) { let c = 0; for (let k = 0; k < 8; k++) c += s[i + DY[k] * w + DX[k]] ? 1 : 0; deg[i] = c; }
  const node = new Int32Array(w * h).fill(-1);
  const nodeKind = []; // 'end' | 'junction' | 'dot'
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!s[i0] || deg[i0] === 2 || node[i0] >= 0) continue;
    const id = nodeKind.length;
    if (deg[i0] <= 1) { node[i0] = id; nodeKind.push(deg[i0] === 0 ? 'dot' : 'end'); continue; }
    const stack = [i0];
    node[i0] = id;
    while (stack.length) {
      const i = stack.pop();
      for (let k = 0; k < 8; k++) {
        const j = i + DY[k] * w + DX[k];
        if (s[j] && deg[j] >= 3 && node[j] < 0) { node[j] = id; stack.push(j); }
      }
    }
    nodeKind.push('junction');
  }

  // 節から節まで、隣が 2 つの画素をたどって枝にする
  const visited = new Uint8Array(w * h);
  const edges = [];
  const direct = new Set();
  for (let i0 = 0; i0 < w * h; i0++) {
    if (node[i0] < 0) continue;
    for (let k = 0; k < 8; k++) {
      const q = i0 + DY[k] * w + DX[k];
      if (!s[q] || node[q] === node[i0]) continue;
      if (node[q] >= 0) {
        const key = Math.min(i0, q) + ':' + Math.max(i0, q);
        if (direct.has(key)) continue;
        direct.add(key);
        edges.push({ px: [i0, q], a: node[i0], b: node[q] });
        continue;
      }
      if (visited[q]) continue;
      const px = [i0, q];
      visited[q] = 1;
      let prev = i0, cur = q, endNode = -1;
      for (;;) {
        let next = -1, nodeNext = -1;
        for (let kk = 0; kk < 8; kk++) {
          const j = cur + DY[kk] * w + DX[kk];
          if (!s[j] || j === prev) continue;
          if (node[j] >= 0) { if (!(node[j] === node[i0] && px.length <= 2)) nodeNext = j; continue; }
          if (!visited[j]) next = j;
        }
        if (nodeNext >= 0 && (next < 0 || true)) { px.push(nodeNext); endNode = node[nodeNext]; break; }
        if (next < 0) break;
        visited[next] = 1; px.push(next); prev = cur; cur = next;
      }
      edges.push({ px, a: node[i0], b: endNode });
    }
  }
  // 節を持たない輪
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!s[i0] || visited[i0] || node[i0] >= 0) continue;
    const px = [i0];
    visited[i0] = 1;
    let prev = -1, cur = i0;
    for (;;) {
      let next = -1;
      for (let k = 0; k < 8; k++) { const j = cur + DY[k] * w + DX[k]; if (s[j] && j !== prev && !visited[j]) { next = j; break; } }
      if (next < 0) break;
      visited[next] = 1; px.push(next); prev = cur; cur = next;
    }
    edges.push({ px, a: -1, b: -1, loop: true });
  }
  // 点だけの節
  for (let i = 0; i < w * h; i++) if (node[i] >= 0 && nodeKind[node[i]] === 'dot') edges.push({ px: [i], a: node[i], b: node[i], dot: true });
  lap('枝をたどる');

  // 短いひげ（端点と分岐点を結ぶ短い枝）を外す
  const width = (i) => 2 * Math.max(0.5, Math.sqrt(d2[i]) - 0.5);
  const live = edges.filter((e) => {
    if (e.loop || e.dot) return true;
    const ka = nodeKind[e.a], kb = e.b >= 0 ? nodeKind[e.b] : 'end';
    const spur = (ka === 'end' && kb === 'junction') || (kb === 'end' && ka === 'junction');
    if (!spur) return true;
    const jp = ka === 'junction' ? e.px[0] : e.px[e.px.length - 1];
    return e.px.length >= Math.max(4, 1.2 * width(jp));
  });

  // 分岐点で、向きが続く（ほぼ反対向きに出ていく）枝の端どうしをつなぐ
  const ends = new Map(); // 節 → [端の番号]
  live.forEach((e, ei) => {
    if (e.loop || e.dot) return;
    if (e.a >= 0) (ends.get(e.a) ?? ends.set(e.a, []).get(e.a)).push(ei * 2);
    if (e.b >= 0) (ends.get(e.b) ?? ends.set(e.b, []).get(e.b)).push(ei * 2 + 1);
  });
  const link = new Int32Array(live.length * 2).fill(-1);
  const outDir = (end) => {
    const px = live[end >> 1].px;
    const n = px.length;
    const k = Math.min(8, n - 1);
    const p0 = end & 1 ? px[n - 1] : px[0];
    const pk = end & 1 ? px[n - 1 - k] : px[k];
    const dx = (pk % w) - (p0 % w), dy = ((pk / w) | 0) - ((p0 / w) | 0);
    const L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  };
  for (const [nid, list] of ends) {
    if (nodeKind[nid] !== 'junction' || list.length < 2) continue;
    if (list.length === 2) { link[list[0]] = list[1]; link[list[1]] = list[0]; continue; }
    const dirs = list.map(outDir);
    const pairs = [];
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const dot = dirs[a][0] * dirs[b][0] + dirs[a][1] * dirs[b][1];
      if (dot < -0.707) pairs.push([dot, list[a], list[b]]);
    }
    pairs.sort((p, q) => p[0] - q[0]);
    for (const [, ea, eb] of pairs) if (link[ea] < 0 && link[eb] < 0 && (ea >> 1) !== (eb >> 1)) { link[ea] = eb; link[eb] = ea; }
  }
  lap('分岐をつなぐ');

  // 枝をつないで筆にする
  const used = new Uint8Array(live.length);
  const strokes = [];
  const walk = (e0, side0) => {
    const pix = [];
    let e = e0, side = side0, closed = false;
    for (;;) {
      used[e] = 1;
      const px = side === 0 ? live[e].px : [...live[e].px].reverse();
      for (const p of px) if (pix[pix.length - 1] !== p) pix.push(p);
      const nxt = link[e * 2 + (1 - side)];
      if (nxt < 0) break;
      const e2 = nxt >> 1;
      if (used[e2]) { closed = e2 === e0 && (nxt & 1) === side0; break; }
      e = e2; side = nxt & 1;
    }
    return { pix, closed };
  };
  const add = ({ pix, closed }) => {
    const raw = pix.map((i) => ({ x: i % w, y: (i / w) | 0, w: width(i) }));
    const points = smooth(raw, 2);
    strokes.push({ points, closed, rawCount: raw.length });
  };
  live.forEach((e, ei) => {
    if (used[ei]) return;
    if (e.loop) { used[ei] = 1; add({ pix: e.px, closed: true }); return; }
    if (e.dot) { used[ei] = 1; add({ pix: e.px, closed: false }); return; }
    if (link[ei * 2] < 0) add(walk(ei, 0));
    else if (link[ei * 2 + 1] < 0) add(walk(ei, 1));
  });
  live.forEach((e, ei) => { if (!used[ei]) add(walk(ei, 0)); });
  lap('筆にする');

  // 白の領域と、外の白からの距離
  const regions = labelBackground(ink, w, h, minRegion);
  const dOut = distanceFrom(regions.outside, w, h, 64);
  lap('領域を数える');

  // 並べる: 外周に触れる筆 → 長い線 → 短い線。各段の中は、いまのペン先から近い順（逆向きも可）
  for (const st of strokes) {
    let L = 0;
    for (let i = 1; i < st.points.length; i++) L += Math.hypot(st.points[i].x - st.points[i - 1].x, st.points[i].y - st.points[i - 1].y);
    st.length = L;
    st.recorded = simplifiedCount(st.points, 0.5);
    let near = 0;
    for (const p of st.points) if (dOut[Math.round(p.y) * w + Math.round(p.x)] <= p.w / 2 + 2) near++;
    st.stage = near / st.points.length > 0.5 && L >= 8 ? 0 : L >= longLen ? 1 : 2;
  }
  const ordered = [];
  let pen = { x: 0, y: 0 };
  for (let stage = 0; stage < 3; stage++) {
    const rest = strokes.filter((st) => st.stage === stage);
    while (rest.length) {
      let bi = 0, bd = Infinity, rev = false;
      rest.forEach((st, k) => {
        const a = st.points[0], b = st.points[st.points.length - 1];
        const da = (a.x - pen.x) ** 2 + (a.y - pen.y) ** 2, db = (b.x - pen.x) ** 2 + (b.y - pen.y) ** 2;
        if (da < bd) { bd = da; bi = k; rev = false; }
        if (!st.closed && db < bd) { bd = db; bi = k; rev = true; }
      });
      const st = rest.splice(bi, 1)[0];
      if (rev) st.points.reverse();
      ordered.push(st);
      pen = st.points[st.points.length - 1];
    }
  }
  lap('順番を決める');
  return { strokes: ordered, regions, skeleton: s, timings: t };
}

// 筆を「円を並べた可変幅のリボン」として塗る（upto 本目まで）。戻り値は塗った画素の 0/1
export function renderStrokes(strokes, w, h, upto = strokes.length) {
  const out = new Uint8Array(w * h);
  const stamp = (cx, cy, r) => {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
    const rr = r * r;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rr) out[y * w + x] = 1;
  };
  for (let k = 0; k < Math.min(upto, strokes.length); k++) {
    const pts = strokes[k].points;
    if (pts.length === 1) { stamp(pts[0].x, pts[0].y, Math.max(0.5, pts[0].w / 2)); continue; }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.ceil(L / 0.5));
      for (let j = 0; j <= n; j++) {
        const u = j / n;
        stamp(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, Math.max(0.5, (a.w + (b.w - a.w) * u) / 2));
      }
    }
  }
  return out;
}
