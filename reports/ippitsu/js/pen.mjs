// ペンの入り抜き。筆の始めと終わりを細くし、Gペンで引いた線のように見せる。依存なし。

export function strokeLength(points) {
  let L = 0;
  for (let i = 1; i < points.length; i++) L += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return L;
}

// taperIn / taperOut: 入りと抜きで細くする長さ（px）。短い筆では長さに合わせて縮める
export function penProfile(points, { taperIn = 10, taperOut = 14, minW = 0.35, maxW = 7 } = {}) {
  if (!points.length) return [];
  const L = strokeLength(points);
  const tin = Math.min(taperIn, L * 0.35), tout = Math.min(taperOut, L * 0.45);
  let s = 0;
  return points.map((p, i) => {
    if (i) s += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    const base = Math.min(maxW, Math.max(minW, p.w));
    const a = tin > 0 ? Math.min(1, s / tin) : 1;
    const b = tout > 0 ? Math.min(1, (L - s) / tout) : 1;
    const f = Math.sqrt(Math.max(0, Math.min(a, b)));
    return { x: p.x, y: p.y, w: Math.max(minW, base * (0.12 + 0.88 * f)) };
  });
}
