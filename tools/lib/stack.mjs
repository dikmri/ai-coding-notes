// 三面図（正面・横・後ろ）から、ドット絵の立体（ボクセル）を作るための計算。画面もファイルも使わない
// 使う所: tools/stack-build.mjs（作る道具）、tests/stack.test.mjs

// 背景の色との差（RGB の差の絶対値の和）が thr より大きい画素を 1 にした外形。外とつながっていない穴は埋める
export function maskOf(img, bg, thr) {
  const { w, h, d } = img, m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = Math.abs(d[i * 4] - bg[0]) + Math.abs(d[i * 4 + 1] - bg[1]) + Math.abs(d[i * 4 + 2] - bg[2]) > thr ? 1 : 0;
  return fillHoles(m, w, h);
}
// 外側（端の画素）から背景をたどり、たどれなかった背景（中の穴）を 1 にする
export function fillHoles(m, w, h) {
  const out = new Uint8Array(m), seen = new Uint8Array(w * h), st = [];
  const push = (i) => { if (!seen[i] && !m[i]) { seen[i] = 1; st.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (st.length) {
    const i = st.pop(), x = i % w, y = (i - x) / w;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < w * h; i++) if (!m[i] && !seen[i]) out[i] = 1;
  return out;
}
// 1 行の中の、1 が続く区間 [始め, 終わり]（終わりを含む）
export function runsOf(row) {
  const out = []; let a = -1;
  for (let i = 0; i <= row.length; i++) {
    const on = i < row.length && row[i];
    if (on && a < 0) a = i;
    if (!on && a >= 0) { out.push([a, i - 1]); a = -1; }
  }
  return out;
}
// 高さの帯（画像の y0..y1 行）のどこかで 1 の画素がある列を 1 にした、帯の外形の 1 行
export function bandRow(mask, w, x0, x1, y0, y1) {
  const r = new Uint8Array(x1 - x0 + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask[y * w + x]) r[x - x0] = 1;
  return r;
}
// 1 段（高さ 1 つ分）の断面を楕円の集まりで近似する。
// front: 正面の外形の区間（x、ボクセルの単位）、side: 横の外形の区間（z）。それぞれの組み合わせで、幅を直径とする楕円を作る。
// 細い区間（その段でいちばん太い区間の limb 倍より細い。腕や手）は、断面を丸とみなし、奥行きの半径を幅の半分にする
export function sliceEllipses(front, side, limb = 0.4) {
  const wmax = Math.max(0, ...front.map(([a, b]) => b - a + 1)), out = [];
  for (const [a, b] of front) for (const [c, d] of side) {
    const rx = (b - a + 1) / 2, cx = (a + b + 1) / 2;
    let rz = (d - c + 1) / 2; const cz = (c + d + 1) / 2;
    if (b - a + 1 < limb * wmax) rz = Math.min(rz, rx);
    out.push({ cx, cz, rx, rz });
  }
  return out;
}
// 点 (x, z) が入るいちばん「中寄り」の楕円と、その楕円の中での向き（中心から外へ、-1〜1）。どれにも入らなければ null
// p は形の指数: 2 なら楕円、大きいほど角の丸い四角に近づく（|u|^p + |v|^p ≤ 1）
export function insideEllipse(list, x, z, p = 2) {
  let best = null, bq = 1;
  for (const e of list) {
    const u = (x - e.cx) / e.rx, v = (z - e.cz) / e.rz, q = Math.abs(u) ** p + Math.abs(v) ** p;
    if (q <= 1 && (best === null || q < bq)) { best = { e, u, v }; bq = q; }
  }
  return best;
}
// 外向きの向き (u, v)（u は右、v は前）から、色を取る絵を選ぶ: 'front'・'back'・'left'（キャラの左 = +x の側）・'right'
export function viewFor(u, v) {
  if (Math.abs(v) >= Math.abs(u)) return v >= 0 ? 'front' : 'back';
  return u >= 0 ? 'left' : 'right';
}
// 色の数を k 個まで減らす（メディアンカット）。colors は [r, g, b] の配列。返すのは色の表（[r, g, b] の配列）
export function medianCut(colors, k) {
  let boxes = [colors.slice()];
  while (boxes.length < k) {
    let bi = -1, bc = 0, br = -1;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } if (hi - lo > br) { br = hi - lo; bi = i; bc = c; } }
    });
    if (bi < 0 || br <= 0) break;
    const b = boxes[bi].sort((p, q) => p[bc] - q[bc]), mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length)));
}
export function nearest(pal, c) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) { const d = (pal[i][0] - c[0]) ** 2 + (pal[i][1] - c[1]) ** 2 + (pal[i][2] - c[2]) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
}
// 同じ値が続く所を [回数（1〜255）, 値] の組にする
export function rle(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length;) { const v = bytes[i]; let n = 1; while (i + n < bytes.length && bytes[i + n] === v && n < 255) n++; out.push(n, v); i += n; }
  return Uint8Array.from(out);
}

// 3D の面の向き: 周り（半径 r の立方体）の詰まったボクセルの位置の和の逆向き。occ(i, k, j) は詰まっていれば 1
// 返すのは [nx, ny, nz]（長さは正規化しない）。段ごとの断面ではなく立体全体から求めるので、段の間で向きが急に変わらない
export function normalAt(occ, i, k, j, r = 2) {
  let x = 0, y = 0, z = 0;
  for (let dj = -r; dj <= r; dj++) for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) if (occ(i + di, k + dk, j + dj)) { x += di; y += dj; z += dk; }
  return [-x, -y, -z];
}
