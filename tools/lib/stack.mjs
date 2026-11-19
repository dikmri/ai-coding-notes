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
  // 種類の付いた区間（髪・腕）は、横の外形のいちばん太い区間（体の本体）とだけ組にする。
  // 胸のふくらみのように横の外形が分かれる高さで、髪や腕が胸の前の奥行きに置かれて横一列の棒になるのを防ぐ
  const main = side.reduce((m, r) => (r[1] - r[0] > m[1] - m[0] ? r : m), side[0] || [0, -1]);
  for (const f of front) for (const [c, d] of (f[2] ? [main] : side)) {
    const [a, b] = f;
    let rx = (b - a + 1) / 2; const cx = (a + b + 1) / 2;
    // 本体から離れた横の区間（胸のふくらみなど）と組む楕円は、幅を本体の奥行きの 1.1 倍までにする（髪まで含んだ幅に広がらない）
    if (c !== main[0] || d !== main[1]) rx = Math.min(rx, ((main[1] - main[0] + 1) / 2) * 1.1);
    let rz = (d - c + 1) / 2, cz = (c + d + 1) / 2;
    const kind = f[2];
    if (kind === 'limb' || (!kind && b - a + 1 < limb * wmax)) rz = Math.min(rz, rx);
    else if (kind === 'hair') { rz = Math.min(rz, rx * 1.2); cz = c + rz; }   // 横の髪は、横の外形の後ろ側（背中側）に寄せる
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

// 表面の殻: 詰まったボクセルのうち、6 方向のどれかが空いているもの（表面）と、同じ段で表面の隣（8 方向）にあるものだけを残す。
// 中は、開いたときに段ごとに埋め戻す（項目の core の fillLayer）。厚さを 2 にするのは、斜めのすき間から外の空きが中へつながらないようにするため
export function shellOf(vox, W, D, H) {
  const at = (i, k, j) => i >= 0 && i < W && k >= 0 && k < D && j >= 0 && j < H && vox[(j * D + k) * W + i] !== 0;
  const surf = new Uint8Array(W * D * H);
  for (let j = 0; j < H; j++) for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    if (!at(i, k, j)) continue;
    if (!at(i - 1, k, j) || !at(i + 1, k, j) || !at(i, k - 1, j) || !at(i, k + 1, j) || !at(i, k, j - 1) || !at(i, k, j + 1)) surf[(j * D + k) * W + i] = 1;
  }
  const keep = new Uint8Array(surf);
  for (let j = 0; j < H; j++) for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    const idx = (j * D + k) * W + i; if (keep[idx] || !at(i, k, j)) continue;
    for (let dk = -1; dk <= 1 && !keep[idx]; dk++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, kk = k + dk;
      if (ii >= 0 && ii < W && kk >= 0 && kk < D && surf[(j * D + kk) * W + ii]) { keep[idx] = 1; break; }
    }
  }
  return keep;
}

// 腕を胴から分ける: 正面の区間の端に、細い肌の部分（腕や手）があれば、別の区間にする。
// 肘が髪や胴に触れる高さでは、正面の外形が 1 本につながり、胴の奥行きの楕円が腕の幅まで広がって平たい円盤になるため。
// skinAt(x): 正面の絵の x の画素が肌の色か。端の輪郭の線（edge 画素まで）は飛ばして数える。肌の部分が区間の幅の maxFrac より細いときだけ分ける
// 分けた区間には 3 つ目の値に種類（kind）を付ける。center(x) を渡すと、区間の真ん中がその条件に合うときだけ分ける
// tol: 部分の中に挟まってもよい、条件に合わない画素の続く数（髪の筋の線など）
export function splitLimbs(runs, skinAt, { edge = 3, minPx = 3, maxFrac = 0.3, kind = 'limb', center = null, tol = 0 } = {}) {
  const out = [];
  for (const run of runs) {
    const [a, b] = run;
    if (run[2] || (center && !center((a + b) >> 1))) { out.push(run); continue; }
    const w = b - a + 1; let lo = a, hi = b;
    const side = (start, step) => {
      let x = start, skip = 0;
      while (skip < edge && x >= a && x <= b && !skinAt(x)) { x += step; skip++; }
      // 条件に合う画素を数える。合わない画素が tol 個までなら、その先も続きとみなす
      let n = 0, hit = 0, gap = 0;
      while (x >= a && x <= b) {
        if (skinAt(x)) { hit++; n += gap + 1; gap = 0; } else if (++gap > tol) break;
        x += step;
      }
      x -= step * gap;   // 最後に合った画素のすぐ先へ戻す
      return hit >= minPx && (n + skip) < maxFrac * w && x >= a && x <= b ? n + skip : 0;   // 部分の先に、合わない所が続くときだけ
    };
    const l = side(a, 1), r = side(b, -1);
    if (l) { out.push([a, a + l - 1, kind]); lo = a + l; }
    const tail = r ? [b - r + 1, b, kind] : null; if (r) hi = b - r;
    if (hi >= lo) out.push([lo, hi]);
    if (tail) out.push(tail);
  }
  return out;
}
// 肌の色か（明るく、赤みが青みより少し強く、白ほど灰色ではない）
export const isSkin = (r, g, b) => r > 200 && g > 165 && b > 150 && r - b >= 12 && r - b <= 70 && r >= g;
// 髪の色か（茶色から桃色。肌より暗い）
export const isHair = (r, g, b) => r >= g && g >= b - 10 && r - b > 20 && 0.3 * r + 0.59 * g + 0.11 * b < 205 && r > 90;

// 横の髪を胴から分ける: 区間の端から、体の色（肌・白いシャツ・紺の服）が stopRun 画素以上続く所までを、髪の部分とする。
// 背景の色（髪の筋のすき間）や暗い線は、どちらでもないので数えずに進む。cls(x) は 'in'（髪）・'stop'（体）・'neutral' を返す。
// 髪の部分は、髪の画素が minFrac 以上で、区間の幅の maxFrac より細いときだけ分ける。区間の真ん中が center に合わなければ分けない
export function splitHairEdges(runs, cls, { stopRun = 6, minFrac = 0.25, maxFrac = 0.42, center = null } = {}) {
  const out = [];
  for (const run of runs) {
    const [a, b] = run;
    if (run[2] || (center && !center((a + b) >> 1))) { out.push(run); continue; }
    const w = b - a + 1;
    const side = (start, step) => {
      let x = start, hits = 0, stop = 0;
      for (; x >= a && x <= b; x += step) {
        const c = cls(x);
        if (c === 'stop') { if (++stop >= stopRun) break; } else { stop = 0; if (c === 'in') hits++; }
      }
      if (!(x >= a && x <= b)) return 0;   // 体の色に当たらずに端まで来た（全部が髪）: 分けない
      const len = Math.abs(x - start) + 1 - stop;   // 体の色が続き始めた所の手前まで
      return len > 0 && hits >= minFrac * len && len < maxFrac * w ? len : 0;
    };
    const l = side(a, 1), r = side(b, -1);
    let lo = a, hi = b;
    if (l) { out.push([a, a + l - 1, 'hair']); lo = a + l; }
    const tail = r ? [b - r + 1, b, 'hair'] : null; if (r) hi = b - r;
    if (hi >= lo) out.push([lo, hi]);
    if (tail) out.push(tail);
  }
  return out;
}
// 髪を分けるときの色の分け方
export const hairClass = (r, g, b) => (isHair(r, g, b) ? 'in' : isSkin(r, g, b) || (r > 200 && g > 200 && b > 200) || (b > r + 25 && b > 70) ? 'stop' : 'neutral');
