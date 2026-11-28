// Canvas に筆を描く。pts は x, y, 幅 の 3 つずつの並び、a〜b-1 が 1 本の筆の点。s は画像 1px あたりの Canvas の画素数。

// 描き終えた筆を、左右にずらした輪郭で囲んで塗る（1 本 1 回の塗りで済むので、描き直しが速い）
export function fillStroke(ctx, pts, a, b, s) {
  const n = b - a;
  if (n <= 0) return;
  if (n === 1) {
    ctx.beginPath();
    ctx.arc(pts[a * 3] * s, pts[a * 3 + 1] * s, Math.max(0.5, (pts[a * 3 + 2] / 2) * s), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const L = new Float32Array(n * 2), R = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const p = (a + i) * 3, q0 = (a + Math.max(0, i - 1)) * 3, q1 = (a + Math.min(n - 1, i + 1)) * 3;
    let dx = pts[q1] - pts[q0], dy = pts[q1 + 1] - pts[q0 + 1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const r = (pts[p + 2] / 2) * s, x = pts[p] * s, y = pts[p + 1] * s;
    L[i * 2] = x - dy * r; L[i * 2 + 1] = y + dx * r;
    R[i * 2] = x + dy * r; R[i * 2 + 1] = y - dx * r;
  }
  ctx.beginPath();
  ctx.moveTo(L[0], L[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i * 2], L[i * 2 + 1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i * 2], R[i * 2 + 1]);
  ctx.closePath();
  ctx.fill();
  // 両端を丸くする
  const e0 = a * 3, e1 = (b - 1) * 3;
  const r0 = Math.max(0.3, (pts[e0 + 2] / 2) * s), r1 = Math.max(0.3, (pts[e1 + 2] / 2) * s);
  ctx.beginPath();
  ctx.moveTo(pts[e0] * s + r0, pts[e0 + 1] * s);
  ctx.arc(pts[e0] * s, pts[e0 + 1] * s, r0, 0, Math.PI * 2);
  ctx.moveTo(pts[e1] * s + r1, pts[e1 + 1] * s);
  ctx.arc(pts[e1] * s, pts[e1 + 1] * s, r1, 0, Math.PI * 2);
  ctx.fill();
}

// スクリーントーンの 1 枚（面）: 点ごとに網点の円を描く。1 回の塗りで済ませる
export function fillDots(ctx, pts, a, b, s) {
  ctx.beginPath();
  for (let q = a; q < b; q++) {
    const x = pts[q * 3] * s, y = pts[q * 3 + 1] * s, r = Math.max(0.25, (pts[q * 3 + 2] / 2) * s);
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

// ベタの縁を整える 1 枚: 輪郭の多角形を even-odd で塗る。輪の区切りは w = -1 の点
export function fillPolygon(ctx, pts, a, b, s) {
  ctx.beginPath();
  let start = true;
  for (let q = a; q < b; q++) {
    if (pts[q * 3 + 2] === -1) { ctx.closePath(); start = true; continue; }
    const x = pts[q * 3] * s, y = pts[q * 3 + 1] * s;
    if (start) { ctx.moveTo(x, y); start = false; } else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill('evenodd');
}

// 描いている途中の筆の 1 区間（端は丸い線）
export function drawSegment(ctx, x0, y0, w0, x1, y1, w1, s) {
  ctx.lineWidth = Math.max(0.6, ((w0 + w1) / 2) * s);
  ctx.beginPath();
  ctx.moveTo(x0 * s, y0 * s);
  ctx.lineTo(x1 * s, y1 * s);
  ctx.stroke();
}
