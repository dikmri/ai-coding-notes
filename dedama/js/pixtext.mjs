// ドット絵の文字。端末の日本語フォントを小さなキャンバスに描き、2 値（塗る・塗らない）にしてから色を付ける。
// 外のフォントは読まない。同じ文字列・大きさ・色は使い回す。
const FONT = '"MS Gothic", "Osaka-Mono", "Hiragino Sans", "BIZ UDGothic", "Noto Sans JP", "Yu Gothic", sans-serif';
const cache = new Map();
let scratch = null;

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return hex.length === 4 ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 文字列 1 行のスプライト（canvas）。outline に色を渡すと 1 画素の縁取りを付ける
export function textSprite(str, { size = 12, color = '#ffffff', outline = null, bold = false } = {}) {
  const key = `${str}\u0000${size}\u0000${color}\u0000${outline}\u0000${bold}`;
  let c = cache.get(key);
  if (c) return c;
  scratch ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  scratch.font = font;
  const w = Math.max(1, Math.ceil(scratch.measureText(str).width) + 4), h = size + 4;
  scratch.canvas.width = w; scratch.canvas.height = h;
  scratch.font = font;
  scratch.textBaseline = 'top';
  scratch.fillStyle = '#fff';
  scratch.fillText(str, 2, 2);
  const src = scratch.getImageData(0, 0, w, h).data;
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  const [r, gg, b] = rgbOf(color);
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = src[i * 4 + 3] >= 120 ? 1 : 0;
  if (outline) {
    const [or, og, ob] = rgbOf(outline);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (on[i]) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && on[yy * w + xx]) { near = true; break; }
      }
      if (near) { d[i * 4] = or; d[i * 4 + 1] = og; d[i * 4 + 2] = ob; d[i * 4 + 3] = 255; }
    }
  }
  for (let i = 0; i < w * h; i++) if (on[i]) { d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  if (cache.size > 600) cache.clear();
  cache.set(key, c);
  return c;
}

// x, y は文字の左上。align: 'left' | 'center' | 'right'
export function drawText(ctx, str, x, y, opts = {}) {
  const s = textSprite(String(str), opts);
  const ox = opts.align === 'center' ? Math.round(x - s.width / 2) : opts.align === 'right' ? Math.round(x - s.width) : Math.round(x);
  ctx.drawImage(s, ox - 2, Math.round(y) - 2);
  return s.width - 4;
}
export const textWidth = (str, opts = {}) => textSprite(String(str), opts).width - 4;

// 数を 3 桁ごとに区切り、符号を付ける
export const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(Math.round(n)).toLocaleString('ja-JP')}`;
export const comma = (n) => Math.round(n).toLocaleString('ja-JP');
