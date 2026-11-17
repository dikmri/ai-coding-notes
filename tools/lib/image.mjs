// 画像の計算（変換の道具で使う）。ライブラリは使わず、PNG は Node の zlib で開く。
// - decodePng: 8 ビットの RGB・RGBA の PNG（インターレースなし）を RGBA の画素に
// - bleed: 透明な画素に、隣の色を広げる（縮めたり、ブラウザで補間したりしたときに、縁に黒が混ざらないように）
// - downscale: 面積で平均して縮める。色は透明度を重みにする
// - split: 色の画像（透明度 255）と、透明度の画像（灰色）に分ける

import { inflateSync } from 'node:zlib';

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG ではありません');
  let off = 8, w = 0, h = 0, depth = 0, type = 0, inter = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), name = buf.toString('latin1', off + 4, off + 8), d = buf.subarray(off + 8, off + 8 + len);
    if (name === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; inter = d[12]; }
    else if (name === 'IDAT') idat.push(d);
    else if (name === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || inter) throw new Error(`読めない PNG です（ビット深度 ${depth}、色の種類 ${type}、インターレース ${inter}）`);
  const ch = type === 6 ? 4 : 3, stride = w * ch, raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[dst + x - ch] : 0, b = y > 0 ? px[dst - stride + x] : 0, c = x >= ch && y > 0 ? px[dst - stride + x - ch] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = (raw[src + x] + p) & 255;
    }
  }
  if (ch === 4) return { width: w, height: h, data: px };
  const data = new Uint8Array(w * h * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) { data[j] = px[i]; data[j + 1] = px[i + 1]; data[j + 2] = px[i + 2]; data[j + 3] = 255; }
  return { width: w, height: h, data };
}

export function bleed(img, steps) {
  const { width: w, height: h, data: d } = img;
  let filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) filled[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  for (let s = 0; s < steps; s++) {
    const next = filled.slice(); let changed = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (filled[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const k = Y * w + X; if (!filled[k]) continue;
        r += d[k * 4]; g += d[k * 4 + 1]; b += d[k * 4 + 2]; n++;
      }
      if (n) { d[i * 4] = Math.round(r / n); d[i * 4 + 1] = Math.round(g / n); d[i * 4 + 2] = Math.round(b / n); next[i] = 1; changed = true; }
    }
    filled = next; if (!changed) break;
  }
  return img;
}

export function downscale(img, W, H) {
  const { width: w, height: h, data: d } = img, out = new Uint8Array(W * H * 4);
  const sx = w / W, sy = h / H;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    let r = 0, g = 0, b = 0, a = 0, cr = 0, cg = 0, cb = 0, n = 0;
    for (let y = Math.floor(Y * sy); y < Math.ceil((Y + 1) * sy); y++) for (let x = Math.floor(X * sx); x < Math.ceil((X + 1) * sx); x++) {
      const k = (y * w + x) * 4, al = d[k + 3];
      r += d[k] * al; g += d[k + 1] * al; b += d[k + 2] * al; a += al; cr += d[k]; cg += d[k + 1]; cb += d[k + 2]; n++;
    }
    const o = (Y * W + X) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
    else { out[o] = Math.round(cr / n); out[o + 1] = Math.round(cg / n); out[o + 2] = Math.round(cb / n); }
    out[o + 3] = Math.round(a / n);
  }
  return { width: W, height: H, data: out };
}

export function split(img) {
  const { width, height, data } = img, color = new Uint8Array(data.length), alpha = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    color[i] = data[i]; color[i + 1] = data[i + 1]; color[i + 2] = data[i + 2]; color[i + 3] = 255;
    alpha[i] = alpha[i + 1] = alpha[i + 2] = data[i + 3]; alpha[i + 3] = 255;
  }
  return { color: { width, height, data: color }, alpha: { width, height, data: alpha } };
}
