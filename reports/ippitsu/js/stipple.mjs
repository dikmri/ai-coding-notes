// 陰影を点で描く（点描、スティップリング）。依存なし。
//
// 調べたことに合わせた作り:
//   - 明暗は点の大きさではなく密度で出す。点の大きさはほぼ一定（細いペンを垂直に立てて打つ丸い点）
//   - 点は固まりも隙間も作らず、均等に散らす（ブルーノイズ。Secord 2002 の Weighted Voronoi Stippling と同じ性質）
//   - 約 5mm 角のマスで区切り、マスごとに打ち終えてから隣のマスへ移る（水木プロのアシスタントの打ち方の証言）
//
// 作り方: 暗さから「点で覆う割合」の目標を決め、そこから点どうしの最小距離 r を決める。
// 候補の点をランダムな順に試し、r より近くに点が無ければ置く（ポアソンディスク・サンプリング）。
// 最後に点をマスごとの束にし、マスの中は近い点へ順に打つ順番を付ける。

function hash(x, y, k) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(k | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 明るさ tone（0 = 黒、1 = 白）の所で、点で覆う割合の目標
export function coverageOf(tone, { cmax = 0.62, light = 0.8, gamma = 1.35 } = {}) {
  const t0 = 1 - light, dk = 1 - tone;
  if (dk <= t0) return 0;
  return cmax * Math.pow(Math.min(1, (dk - t0) / (1 - t0)), gamma);
}

// ポアソンディスクで詰めたときの点の密度は、おおよそ 0.697 / r²（ランダムに詰めたときの上限の 0.547 から）。
// 候補の数が有限なので上限まで詰まりきらない分（約 0.9）を見込んで、r を少し小さくする
const PACK = 0.697 * 0.9;

// sizeJitter: 点の大きさのぶれ（手で打つと少しずつ違う）。spacingJitter: 点どうしの距離のぶれ（並びがそろいすぎないように）。
// 最も暗い所（覆う割合が 0.35 を超える所）だけ、点を最大 1.4 倍まで大きくして黒に近づける
export function stippleDots(tone, w, h, { cell = 28, dot = 1.6, cmax = 0.62, light = 0.8, gamma = 1.35, rmax = 14, sizeJitter = 0.18, spacingJitter = 0.08 } = {}) {
  const area = Math.PI * (dot / 2) ** 2;
  const covOpts = { cmax, light, gamma };
  // 画素ごとの最小距離と、点で覆う割合。0 は点を打たない所
  const rAt = new Float32Array(w * h), covAt = new Float32Array(w * h);
  let rmin = Infinity;
  for (let i = 0; i < w * h; i++) {
    const c = coverageOf(tone[i], covOpts);
    if (c <= 0) continue;
    const r = Math.sqrt((PACK * area) / c);
    if (r > rmax) continue;
    rAt[i] = r; covAt[i] = c;
    if (r < rmin) rmin = r;
  }
  rmin *= 1 - spacingJitter;
  if (!Number.isFinite(rmin)) return [];

  // 置いた点を探すための格子（1 マス = rmin）
  const gs = Math.max(1, rmin);
  const gw = Math.ceil(w / gs) + 1, gh = Math.ceil(h / gs) + 1;
  const head = new Int32Array(gw * gh).fill(-1);
  const px = [], py = [], next = [];
  const near = (x, y, r) => {
    const reach = Math.ceil(r / gs);
    const cx = Math.floor(x / gs), cy = Math.floor(y / gs);
    for (let yy = Math.max(0, cy - reach); yy <= Math.min(gh - 1, cy + reach); yy++)
      for (let xx = Math.max(0, cx - reach); xx <= Math.min(gw - 1, cx + reach); xx++)
        for (let k = head[yy * gw + xx]; k >= 0; k = next[k]) {
          const dx = px[k] - x, dy = py[k] - y;
          if (dx * dx + dy * dy < r * r) return true;
        }
    return false;
  };

  // 候補: 点を打つ画素ごとに 2 つ（画素の中で少しずらす）。1024 個の箱にハッシュで振り分けて、ばらばらの順に試す
  const B = 1024;
  const count = new Uint32Array(B + 1);
  const candidates = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!rAt[y * w + x]) continue;
    for (let k = 0; k < 2; k++) {
      const b = Math.floor(hash(x, y, 11 + k) * B);
      candidates.push(b, x + hash(x, y, 21 + k), y + hash(x, y, 31 + k));
      count[b + 1]++;
    }
  }
  for (let b = 0; b < B; b++) count[b + 1] += count[b];
  const order = new Uint32Array(candidates.length / 3);
  const fill = count.slice(0, B);
  for (let i = 0; i < order.length; i++) order[fill[candidates[i * 3]]++] = i;

  for (const i of order) {
    const x = candidates[i * 3 + 1], y = candidates[i * 3 + 2];
    const r0 = rAt[Math.min(h - 1, y | 0) * w + Math.min(w - 1, x | 0)];
    if (!r0) continue;
    const r = r0 * (1 + spacingJitter * (hash(x * 29, y * 31, 41) * 2 - 1));
    if (near(x, y, r)) continue;
    const k = px.length;
    px.push(x); py.push(y);
    const gi = Math.floor(y / gs) * gw + Math.floor(x / gs);
    next.push(head[gi]); head[gi] = k;
  }

  // マスごとの束にし、マスの中は近い点へ順に打つ。
  // マスの中心を格子から少しずつずらし、一番近い中心に点を振り分ける（ボロノイ領域）。
  // こうするとマスの縁が縦横の直線にならず、打っている途中でも四角い区画が目立たない
  const cols = Math.ceil(w / cell) + 1;
  const cx = (i, j) => (i + 0.5 + (hash(i, j, 61) - 0.5) * 0.7) * cell;
  const cy = (i, j) => (j + 0.5 + (hash(i, j, 62) - 0.5) * 0.7) * cell;
  const byCell = new Map();
  for (let k = 0; k < px.length; k++) {
    const bi = Math.floor(px[k] / cell), bj = Math.floor(py[k] / cell);
    let best = 0, bd = Infinity;
    for (let j = bj - 1; j <= bj + 1; j++) for (let i = bi - 1; i <= bi + 1; i++) {
      if (i < 0 || j < 0) continue;
      const d = (cx(i, j) - px[k]) ** 2 + (cy(i, j) - py[k]) ** 2;
      if (d < bd) { bd = d; best = j * cols + i; }
    }
    (byCell.get(best) ?? byCell.set(best, []).get(best)).push(k);
  }
  const strokes = [];
  for (const [c, list] of [...byCell.entries()].sort((a, b) => a[0] - b[0])) {
    // マスの左上に一番近い点から始める
    const ci = c % cols, cj = Math.floor(c / cols);
    const x0 = cx(ci, cj) - cell / 2, y0 = cy(ci, cj) - cell / 2;
    let cur = list.reduce((best, k) => ((px[k] - x0) ** 2 + (py[k] - y0) ** 2 < (px[best] - x0) ** 2 + (py[best] - y0) ** 2 ? k : best), list[0]);
    const rest = new Set(list);
    let seq = 0;
    while (rest.size) {
      rest.delete(cur);
      const cov = covAt[Math.min(h - 1, py[cur] | 0) * w + Math.min(w - 1, px[cur] | 0)];
      const grow = 1 + 0.4 * Math.min(1, Math.max(0, (cov - 0.35) / 0.25));
      const wj = dot * grow * (1 + sizeJitter * (hash(px[cur] * 13, py[cur] * 17, 5) * 2 - 1));
      strokes.push({ points: [{ x: px[cur], y: py[cur], w: wj }], kind: 'dot', level: 0, group: c, seq: seq++, closed: false });
      let best = -1, bd = Infinity;
      for (const k of rest) { const d = (px[k] - px[cur]) ** 2 + (py[k] - py[cur]) ** 2; if (d < bd) { bd = d; best = k; } }
      if (best < 0) break;
      cur = best;
    }
  }
  return strokes;
}
