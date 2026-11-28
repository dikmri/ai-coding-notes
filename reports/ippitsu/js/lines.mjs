// 画像から「線を引く場所」を決める。依存なし（Web Worker でも Node でも動く）。
//
// 写真のような絵: 模様の向き（構造テンソルで求める線の流れ）を出し、その向きに沿って
//   差分ガウス（DoG）をかける「流れに沿った DoG」（Kang ほか 2007 の考え方）で線を起こす。
//   明るさの変化に横切る向きで DoG をかけ、それを流れに沿ってならすので、線がつながりやすい。
// 線画（白地に黒い線）: 線は既にあるので、しきい値で黒い所をそのまま墨にする。

export function luminance(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    // 透明な所は白とみなす
    const r = rgba[i * 4] * a + 255 * (1 - a), gg = rgba[i * 4 + 1] * a + 255 * (1 - a), b = rgba[i * 4 + 2] * a + 255 * (1 - a);
    g[i] = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
  }
  return g;
}

function kernel(sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return { k, r };
}

export function gaussianBlur(src, w, h, sigma) {
  if (sigma <= 0) return Float32Array.from(src);
  const { k, r } = kernel(sigma);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) { let xx = x + i; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; s += src[row + xx] * k[i + r]; }
      tmp[row + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) { let yy = y + i; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy; s += tmp[yy * w + x] * k[i + r]; }
      out[y * w + x] = s;
    }
  }
  return out;
}

// 模様の向き。tx, ty は線の流れ（明るさの変化に直交する向き）の単位ベクトル、
// coherence は向きのそろい具合（0 = ばらばら、1 = 一方向）
export function flowField(gray, w, h, { sigma = 1.0, tensorSigma = 3.0 } = {}) {
  const g = gaussianBlur(gray, w, h, sigma);
  const E = new Float32Array(w * h), F = new Float32Array(w * h), G = new Float32Array(w * h);
  const at = (x, y) => g[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
    const i = y * w + x;
    E[i] = gx * gx; F[i] = gx * gy; G[i] = gy * gy;
  }
  const e = gaussianBlur(E, w, h, tensorSigma), f = gaussianBlur(F, w, h, tensorSigma), gg = gaussianBlur(G, w, h, tensorSigma);
  const tx = new Float32Array(w * h), ty = new Float32Array(w * h), coherence = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = e[i], b = f[i], c = gg[i];
    const d = Math.sqrt((a - c) * (a - c) + 4 * b * b);
    const l1 = (a + c + d) / 2, l2 = (a + c - d) / 2;
    // 大きい固有値の固有ベクトル = 明るさが変わる向き。数値の安定な方を選ぶ
    let vx = l1 - c, vy = b;
    if (Math.abs(vx) + Math.abs(vy) < Math.abs(b) + Math.abs(l1 - a)) { vx = b; vy = l1 - a; }
    const n = Math.hypot(vx, vy);
    if (n < 1e-12 || l1 < 1e-12) { tx[i] = 1; ty[i] = 0; coherence[i] = 0; continue; }
    tx[i] = -vy / n; ty[i] = vx / n;
    coherence[i] = (l1 - l2) / (l1 + l2 + 1e-12);
  }
  return { tx, ty, coherence };
}

function sample(src, w, h, x, y) {
  if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
  const x0 = x | 0, y0 = y | 0, x1 = x0 < w - 1 ? x0 + 1 : x0, y1 = y0 < h - 1 ? y0 + 1 : y0;
  const fx = x - x0, fy = y - y0;
  const a = src[y0 * w + x0], b = src[y0 * w + x1], c = src[y1 * w + x0], d = src[y1 * w + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

// 流れに沿った DoG の値。負の値ほど「周りより暗い細い所」= 線を引く場所
export function fdog(gray, w, h, flow, { sigmaC = 1.0, rho = 0.99, sigmaM = 3.0 } = {}) {
  const sigmaS = 1.6 * sigmaC;
  const T = Math.ceil(3 * sigmaS);
  const kd = new Float32Array(2 * T + 1);
  {
    let sc = 0, ss = 0;
    const c = [], s = [];
    for (let t = -T; t <= T; t++) { c.push(Math.exp(-(t * t) / (2 * sigmaC * sigmaC))); s.push(Math.exp(-(t * t) / (2 * sigmaS * sigmaS))); sc += c.at(-1); ss += s.at(-1); }
    for (let t = 0; t < kd.length; t++) kd[t] = c[t] / sc - rho * (s[t] / ss);
  }
  const { tx, ty } = flow;
  // 1) 明るさが変わる向き（流れに直交）に 1 次元の DoG
  const hg = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const nx = -ty[i], ny = tx[i];
    let s = 0;
    for (let t = -T; t <= T; t++) s += kd[t + T] * sample(gray, w, h, x + t * nx, y + t * ny);
    hg[i] = s;
  }
  // 2) 流れに沿ってガウスでならす（流れの曲がりに合わせて 1 画素ずつ進む）
  const S = Math.ceil(3 * sigmaM);
  const km = new Float32Array(S + 1);
  let ksum = 0;
  for (let s = 0; s <= S; s++) { km[s] = Math.exp(-(s * s) / (2 * sigmaM * sigmaM)); ksum += s ? 2 * km[s] : km[s]; }
  for (let s = 0; s <= S; s++) km[s] /= ksum;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let acc = km[0] * hg[i];
    for (const sign of [1, -1]) {
      let px = x, py = y, dx = tx[i] * sign, dy = ty[i] * sign;
      for (let s = 1; s <= S; s++) {
        px += dx; py += dy;
        if (px < 0 || py < 0 || px > w - 1 || py > h - 1) break;
        acc += km[s] * sample(hg, w, h, px, py);
        const j = Math.round(py) * w + Math.round(px);
        let nx = tx[j], ny = ty[j];
        if (nx * dx + ny * dy < 0) { nx = -nx; ny = -ny; }
        dx = nx; dy = ny;
      }
    }
    out[i] = acc;
  }
  return out;
}

// 写真のような絵から線を起こす。threshold が小さいほど細かい線まで拾う
export function extractLines(gray, w, h, { threshold = 0.006, sigmaC = 1.0, sigmaM = 3.0, flow } = {}) {
  const f = flow ?? flowField(gray, w, h);
  const response = fdog(gray, w, h, f, { sigmaC, sigmaM });
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (response[i] < -threshold) ink[i] = 1;
  return { ink, flow: f, response };
}

// 白地に黒い線の絵か。白い所が多く、暗い所が少なく、色が薄い
export function isLineArt(rgba, w, h) {
  let white = 0, dark = 0, sat = 0, n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40000)));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * 4;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (l > 0.85) white++;
    if (l < 0.35) dark++;
    sat += mx ? (mx - mn) / mx : 0;
    n++;
  }
  return white / n >= 0.55 && dark / n <= 0.3 && sat / n < 0.15;
}

// 大津の方法でしきい値を決め、暗い側を墨にする
export function binarizeLineArt(gray, w, h) {
  const hist = new Float64Array(256);
  for (let i = 0; i < w * h; i++) hist[Math.min(255, Math.max(0, Math.round(gray[i] * 255)))]++;
  const total = w * h;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let wB = 0, sumB = 0, best = -1, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (gray[i] * 255 <= thr) ink[i] = 1;
  return ink;
}
