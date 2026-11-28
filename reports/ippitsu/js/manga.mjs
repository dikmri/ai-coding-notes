// 漫画原稿モードの線とトーン。依存なし。
//
// 線（ペン入れ）:
//   joinStrokes  … 細切れの線の端どうしを、すき間が小さく向きがそろうものだけつないで長い線にする
//   smoothPath   … 線のガタつきをならし、点の間隔をそろえる（端の位置は変えない）
//   gpenWidths   … G ペンの強弱。輪郭がはっきりした所・影の側・長い線ほど太く、細部は細く。
//                  大きなカーブのふくらみで太り、入りと抜きは細い
// トーン:
//   screenTones  … 中間の明るさを 45° の網点で表す。濃さは 10・20・30% の段にそろえた「影のトーン」、
//                  なだらかに明るさが変わる広い面は網点の大きさが少しずつ変わる「グラデーショントーン」

// ---------------------------------------------------------------- 線をつなぐ
function endDir(pts, atEnd) {
  const n = pts.length, k = Math.min(5, n - 1);
  const a = atEnd ? pts[n - 1 - k] : pts[k], b = atEnd ? pts[n - 1] : pts[0];
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  return { x: b.x, y: b.y, dx: dx / L, dy: dy / L }; // 端の位置と、線の外へ向かう向き
}

export function joinStrokes(strokes, { gap = 8, maxAngle = 35 } = {}) {
  const open = strokes.filter((s) => !s.closed && s.points.length >= 2);
  const rest = strokes.filter((s) => s.closed || s.points.length < 2);
  const cosMax = Math.cos((maxAngle * Math.PI) / 180);
  const ends = []; // 端の番号 e = 線の番号 * 2 + (0 = 始め, 1 = 終わり)
  open.forEach((s, i) => { ends[i * 2] = endDir(s.points, false); ends[i * 2 + 1] = endDir(s.points, true); });
  // 近い端を探すための格子
  const cell = Math.max(1, gap), grid = new Map();
  ends.forEach((e, k) => { const key = `${Math.floor(e.x / cell)},${Math.floor(e.y / cell)}`; (grid.get(key) ?? grid.set(key, []).get(key)).push(k); });
  const cands = [];
  ends.forEach((a, ka) => {
    const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
    for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) for (const kb of grid.get(`${xx},${yy}`) ?? []) {
      if (kb <= ka || (kb >> 1) === (ka >> 1)) continue;
      const b = ends[kb];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > gap) continue;
      // a の外向きと b の外向きが向き合い、すき間の向きも a の外向きにそろう
      const facing = -(a.dx * b.dx + a.dy * b.dy);
      if (facing < cosMax) continue;
      if (d > 0.5 && (dx * a.dx + dy * a.dy) / d < cosMax) continue;
      cands.push([d + 4 * (1 - facing), ka, kb]);
    }
  });
  cands.sort((p, q) => p[0] - q[0]);
  const link = new Int32Array(ends.length).fill(-1);
  // つないだ線のかたまり（輪にならないように、同じかたまりの端はつながない）
  const parent = open.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [, ka, kb] of cands) {
    if (link[ka] >= 0 || link[kb] >= 0) continue;
    const ra = find(ka >> 1), rb = find(kb >> 1);
    if (ra === rb) continue;
    link[ka] = kb; link[kb] = ka; parent[ra] = rb;
  }
  const used = new Uint8Array(open.length), out = [];
  for (let i = 0; i < open.length; i++) {
    if (used[i]) continue;
    // かたまりの片方の端（つながっていない端）までさかのぼる
    let s = i, side = 0, guard = 0;
    while (link[s * 2 + side] >= 0 && guard++ < open.length) { const e = link[s * 2 + side]; s = e >> 1; side = 1 - (e & 1); }
    // そこから反対の端まで、点を順につなぐ
    const pts = [], parts = [];
    let cur = s, enter = side;
    for (guard = 0; guard <= open.length; guard++) {
      used[cur] = 1;
      parts.push(open[cur]);
      const p = enter === 0 ? open[cur].points : [...open[cur].points].reverse();
      for (const q of p) pts.push({ ...q });
      const nx = link[cur * 2 + (1 - enter)];
      if (nx < 0) break;
      cur = nx >> 1; enter = nx & 1;
    }
    out.push({ ...parts[0], points: pts, length: undefined, outside: Math.max(...parts.map((q) => q.outside ?? 0)), joined: parts.length });
  }
  return [...out, ...rest];
}

// ---------------------------------------------------------------- なめらかにする
export function smoothPath(points, { sigma = 1.5, step = 1.5 } = {}) {
  const n = points.length;
  if (n < 3) return points.map((p) => ({ ...p }));
  const R = Math.ceil(sigma * 3), wk = [];
  for (let k = 0; k <= R; k++) wk.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  const sm = points.map((p, i) => {
    const r = Math.min(R, i, n - 1 - i); // 端に近いほど窓を左右対称に縮め、端の位置を変えない
    let sx = 0, sy = 0, sw = 0, t = 0;
    for (let k = -r; k <= r; k++) { const q = points[i + k], c = wk[Math.abs(k)]; sx += q.x * c; sy += q.y * c; sw += q.w * c; t += c; }
    return { x: sx / t, y: sy / t, w: sw / t };
  });
  // 長さに沿って step ごとに置き直す
  const out = [{ ...sm[0] }];
  let carry = 0;
  for (let i = 1; i < n; i++) {
    const a = sm[i - 1], b = sm[i], L = Math.hypot(b.x - a.x, b.y - a.y);
    let s = step - carry;
    while (s <= L) { const u = s / L; out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, w: a.w + (b.w - a.w) * u }); s += step; }
    carry = L - (s - step);
  }
  const last = sm[n - 1], tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > step * 0.25) out.push({ ...last });
  else out[out.length - 1] = { ...last };
  return out;
}

// ---------------------------------------------------------------- 線を引き直す
// 画素をたどった道筋に残る数 px の波を落とし、迷いの無い曲線に引き直す。
//   1. ガウスでならす（波長が数 px の揺れを弱める）
//   2. Ramer-Douglas-Peucker で、eps より小さいずれを無視して要所の点だけ残す
//   3. Chaikin の角切りを 4 回（2 次 B スプラインに近い、なめらかな曲線）
//   4. step ごとに置き直す。端の位置は変えない
function rdp(pts, eps) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a].x, ay = pts[a].y, dx = pts[b].x - ax, dy = pts[b].y - ay, L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dx * (ay - pts[i].y) - (ax - pts[i].x) * dy) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function chaikin(pts, iterations) {
  let p = pts;
  for (let it = 0; it < iterations && p.length > 2; it++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      const mix = (u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, w: a.w + (b.w - a.w) * u });
      if (i > 0) q.push(mix(0.25));
      if (i < p.length - 2) q.push(mix(0.75));
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

export function fairPath(points, { eps = 1, step = 1.5, sigma = 3, iterations = 4 } = {}) {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const smooth = smoothPath(points, { sigma, step: 1 });
  const key = rdp(smooth, eps * 0.5);
  return smoothPath(chaikin(key, iterations), { sigma: 0.8, step });
}

// 線の太さだけを、前後の点でならす（ベタの縁のペンが波打たないように）
export function smoothWidths(points, sigma = 3) {
  const n = points.length, R = Math.ceil(sigma * 3);
  return points.map((p, i) => {
    let s = 0, t = 0;
    for (let k = Math.max(0, i - R); k <= Math.min(n - 1, i + R); k++) { const c = Math.exp(-((k - i) ** 2) / (2 * sigma * sigma)); s += points[k].w * c; t += c; }
    return { ...p, w: s / t };
  });
}

// ---------------------------------------------------------------- G ペンの強弱
// contrast: 線の下の境目のはっきりさ（0〜1）、dark: 線のまわりの暗さ（0〜1）
// 入り（taperIn）は短く、抜き（taperOut）は長く、どちらも線の長さに合わせて縮める。
// 長い線は真ん中が少しふくらむ（筆圧が乗る）。大きなカーブのふくらみでは curveGain の分だけ太る
export function gpenWidths(points, { wMin = 0.6, wMax = 3.2, wEnd = 0.15, refLen = 200, contrast = 0.5, dark = 0.5, taperIn = 16, taperOut = 30, curveRadius = 25, curveGain = 0.6, swell = 0.3 } = {}) {
  const n = points.length;
  if (!n) return [];
  const sAt = new Float64Array(n);
  for (let i = 1; i < n; i++) sAt[i] = sAt[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  const L = sAt[n - 1];
  const strength = Math.min(1, Math.max(0, 0.7 * contrast + 0.3 * dark));
  const lf = 0.3 + 0.7 * Math.sqrt(Math.min(1, L / refLen));
  const base = wMin + (wMax - wMin) * strength * lf;
  // 曲がり: 大きくならした道筋で、前後 10px の向きの変わり方（1px あたりの角度）を、半径 curveRadius の円で 1 になるようにそろえる。
  // 細かい揺れで太さが揺れないように、道筋も曲がりもならしてから使う
  const sm = n > 6 ? smoothCoords(points, 4) : points;
  const kappa = new Float64Array(n);
  let j0 = 0, j1 = 0;
  for (let i = 0; i < n; i++) {
    while (j0 < i && sAt[i] - sAt[j0] > 10) j0++;
    while (j1 < n - 1 && sAt[j1] - sAt[i] < 10) j1++;
    const a = sm[j0], b = sm[i], c = sm[j1];
    if (j0 === i || j1 === i) continue;
    const a1 = Math.atan2(b.y - a.y, b.x - a.x), a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    kappa[i] = Math.min(1, (d / Math.max(1e-6, sAt[j1] - sAt[j0])) * curveRadius);
  }
  // 曲がりもならす（前後 4 点のガウス）
  const ks = smoothCoords(Array.from(kappa, (k) => ({ x: k, y: 0, w: 0 })), 4).map((p) => p.x);
  const tin = Math.min(taperIn, L * 0.2), tout = Math.min(taperOut, L * 0.35);
  const sw = L > 40 ? swell : 0;
  return points.map((p, i) => {
    const s = sAt[i];
    const a = tin > 0 ? Math.min(1, s / tin) : 1, b = tout > 0 ? Math.min(1, (L - s) / tout) : 1;
    const f = Math.pow(Math.min(a, b), 0.8); // 入りと抜き（先端までまっすぐ細くとがる）
    const bulge = 1 - sw / 2 + sw * Math.sin((Math.PI * s) / Math.max(1e-6, L));
    const wMid = Math.min(wMax, base * bulge * (1 + curveGain * ks[i]));
    return { x: p.x, y: p.y, w: Math.max(wEnd, wEnd + (wMid - wEnd) * f) };
  });
}

// 座標を前後の点でならす（点の数は変えない。端に近いほど窓を縮め、端は動かさない）
function smoothCoords(points, sigma) {
  const n = points.length, R = Math.ceil(sigma * 3);
  return points.map((p, i) => {
    const r = Math.min(R, i, n - 1 - i);
    let sx = 0, sy = 0, t = 0;
    for (let k = -r; k <= r; k++) { const c = Math.exp(-(k * k) / (2 * sigma * sigma)); sx += points[i + k].x * c; sy += points[i + k].y * c; t += c; }
    return { x: sx / t, y: sy / t, w: p.w };
  });
}

// ---------------------------------------------------------------- スクリーントーン
function blur(src, w, h, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3)), k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r]; tmp[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r]; out[y * w + x] = s; }
  return out;
}

// 4 連結のかたまりに番号を付ける。戻り値は { comp, sizes, labelOf }
function components(lab, w, h) {
  const comp = new Int32Array(w * h).fill(-1), sizes = [], labelOf = [];
  const stack = new Int32Array(w * h);
  for (let i0 = 0; i0 < w * h; i0++) {
    if (comp[i0] >= 0) continue;
    const id = sizes.length, v = lab[i0];
    let top = 0, n = 0;
    stack[top++] = i0; comp[i0] = id;
    while (top) {
      const i = stack[--top], x = i % w;
      n++;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || comp[j] >= 0 || lab[j] !== v) continue;
        comp[j] = id; stack[top++] = j;
      }
    }
    sizes.push(n); labelOf.push(v);
  }
  return { comp, sizes, labelOf };
}

export const TONE_LEVELS = [{ below: 0.82, level: 10 }, { below: 0.62, level: 20 }, { below: 0.42, level: 30 }];

export function screenTones(tone, w, h, {
  pitch = 5, angle = 45, beta = null, minArea = 150, levels = TONE_LEVELS,
  gradMinArea = null, gradSlope = 0.0012, gradFlat = 0.012, gradMax = 0.5,
} = {}) {
  const N = w * h;
  // 1. 濃さの段: 0 = 白（またはベタ）、1〜 = levels の番号 + 1、GRAD = グラデーショントーン
  const GRAD = levels.length + 1;
  const lab = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (beta && beta[i]) continue;
    let v = 0;
    levels.forEach((lv, k) => { if (tone[i] < lv.below) v = k + 1; });
    lab[i] = v;
  }
  // 2. グラデーショントーン: 細かい模様が無く（ぼかした絵との差が小さく）、大きく見ると明るさがなだらかに変わる広い所
  const ls = blur(tone, w, h, 6);
  const resid = new Float32Array(N);
  for (let i = 0; i < N; i++) resid[i] = Math.abs(tone[i] - ls[i]);
  const detail = blur(resid, w, h, 6);
  const cand = new Uint8Array(N);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!lab[i] && !(tone[i] < (levels[0].below + 0.06) && !(beta && beta[i]))) continue;
    if (beta && beta[i]) continue;
    const gx = (ls[i + 1] - ls[i - 1]) / 2, gy = (ls[i + w] - ls[i - w]) / 2;
    if (detail[i] < gradFlat && Math.hypot(gx, gy) > gradSlope) cand[i] = 1;
  }
  {
    const minG = gradMinArea ?? Math.max(minArea * 4, Math.round(N * 0.02));
    const { comp, sizes, labelOf } = components(cand, w, h);
    for (let i = 0; i < N; i++) if (labelOf[comp[i]] === 1 && sizes[comp[i]] >= minG) lab[i] = GRAD;
  }
  // 3. 境目をならす（5×5 の多数決を 2 回）
  for (let it = 0; it < 2; it++) {
    const src = Uint8Array.from(lab), cnt = new Uint16Array(GRAD + 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (beta && beta[i]) continue;
      cnt.fill(0);
      for (let dy = -2; dy <= 2; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy)); for (let dx = -2; dx <= 2; dx++) cnt[src[yy * w + Math.min(w - 1, Math.max(0, x + dx))]]++; }
      let best = src[i];
      for (let v = 0; v <= GRAD; v++) if (cnt[v] > cnt[best]) best = v;
      lab[i] = best;
    }
  }
  // 4. 小さすぎる面は、まわりで一番多い段に合わせる（ベタの穴は除く）
  for (let it = 0; it < 4; it++) {
    const { comp, sizes } = components(lab, w, h);
    let changed = false;
    const votes = new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, c = comp[i];
      if (sizes[c] >= minArea) continue;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0 || comp[j] === c) continue;
        const m = votes.get(c) ?? votes.set(c, new Map()).get(c);
        m.set(lab[j], (m.get(lab[j]) ?? 0) + 1);
      }
    }
    if (!votes.size) break;
    const to = new Map();
    for (const [c, m] of votes) { let bv = -1, bn = -1; for (const [v, n] of m) if (n > bn) { bn = n; bv = v; } to.set(c, bv); }
    for (let i = 0; i < N; i++) { const t = to.get(comp[i]); if (t !== undefined && t !== lab[i]) { lab[i] = t; changed = true; } }
    if (beta) for (let i = 0; i < N; i++) if (beta[i]) lab[i] = 0;
    if (!changed) break;
  }
  // 5. 網点: 45° に回した格子の点ごとに、その点の面の濃さから網点の直径を決める（網点の面積 = 濃さ × ピッチ²）
  const { comp, sizes, labelOf } = components(lab, w, h);
  const regions = new Map();
  const a = (angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const R = Math.ceil(Math.hypot(w, h) / pitch) + 2;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const x = pitch * (i * ca - j * sa), y = pitch * (i * sa + j * ca);
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) continue;
    const p = Math.round(y) * w + Math.round(x), v = lab[p];
    if (!v) continue;
    const c = v === GRAD ? Math.min(gradMax, Math.max(0.03, 0.95 * (0.92 - ls[p]))) : levels[v - 1].level / 100;
    const d = pitch * Math.sqrt((4 * c) / Math.PI);
    const id = comp[p];
    const r = regions.get(id) ?? regions.set(id, { id, level: v === GRAD ? 0 : levels[v - 1].level, gradation: v === GRAD, area: sizes[id], dots: [] }).get(id);
    r.dots.push({ x, y, w: d });
  }
  return [...regions.values()].filter((r) => r.dots.length).sort((p, q) => p.id - q.id);
}
