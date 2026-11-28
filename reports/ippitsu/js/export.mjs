// 描いた筆の書き出し。SVG（筆ごとの輪郭の道筋）と、PNG に足す説明（iTXt）。依存なし。

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const n2 = (v) => (Math.round(v * 100) / 100).toString();

// 可変幅の筆を、左右にずらした輪郭と丸い端で囲んだ道筋にする
export function ribbonPath(points) {
  const n = points.length;
  if (!n) return '';
  if (n === 1) {
    const { x, y } = points[0], r = Math.max(0.2, points[0].w / 2);
    return `M${n2(x - r)} ${n2(y)}A${n2(r)} ${n2(r)} 0 1 0 ${n2(x + r)} ${n2(y)}A${n2(r)} ${n2(r)} 0 1 0 ${n2(x - r)} ${n2(y)}Z`;
  }
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const r = Math.max(0.1, points[i].w / 2);
    L.push([points[i].x - dy * r, points[i].y + dx * r]);
    R.push([points[i].x + dy * r, points[i].y - dx * r]);
  }
  const rEnd = Math.max(0.1, points[n - 1].w / 2), rStart = Math.max(0.1, points[0].w / 2);
  let d = `M${n2(L[0][0])} ${n2(L[0][1])}`;
  for (let i = 1; i < n; i++) d += `L${n2(L[i][0])} ${n2(L[i][1])}`;
  d += `A${n2(rEnd)} ${n2(rEnd)} 0 0 0 ${n2(R[n - 1][0])} ${n2(R[n - 1][1])}`;
  for (let i = n - 2; i >= 0; i--) d += `L${n2(R[i][0])} ${n2(R[i][1])}`;
  d += `A${n2(rStart)} ${n2(rStart)} 0 0 0 ${n2(L[0][0])} ${n2(L[0][1])}Z`;
  return d;
}

export const PROGRAM_NOTE = 'プログラムが元の画像から線を拾い、一筆ずつ描き直した線画です。人の手描きではありません（AI コーディングノート「一筆ずつ描くペン画」）。';

export function toSVG(strokes, w, h, { title = '一筆ずつ描いたペン画', desc = PROGRAM_NOTE, color = '#111' } = {}) {
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
    `<title>${esc(title)}</title>`, `<desc>${esc(desc)}</desc>`, `<g fill="${esc(color)}">`];
  // 点描の点（点が 1 つだけの筆）は円にする。道筋で書くより短く、点が 10 万個あってもファイルが重くなりすぎない
  strokes.forEach((s, i) => parts.push(s.points.length === 1
    ? `<circle cx="${n2(s.points[0].x)}" cy="${n2(s.points[0].y)}" r="${n2(Math.max(0.2, s.points[0].w / 2))}" data-order="${i + 1}"/>`
    : `<path d="${ribbonPath(s.points)}" data-order="${i + 1}"/>`));
  parts.push('</g></svg>');
  return parts.join('\n');
}

let CRC_TABLE;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// PNG の IHDR の直後に iTXt（UTF-8 の説明）を差し込む
export function addPngText(png, keyword, text, lang = 'ja') {
  const enc = new TextEncoder();
  const ihdrLen = new DataView(png.buffer, png.byteOffset, png.byteLength).getUint32(8);
  const at = 8 + 12 + ihdrLen;
  const kw = enc.encode(keyword), lg = enc.encode(lang), tx = enc.encode(text);
  const data = new Uint8Array(kw.length + 1 + 2 + lg.length + 1 + 1 + tx.length);
  let o = 0;
  data.set(kw, o); o += kw.length; data[o++] = 0;
  data[o++] = 0; data[o++] = 0; // 圧縮しない
  data.set(lg, o); o += lg.length; data[o++] = 0;
  data[o++] = 0; // 訳したキーワードは空
  data.set(tx, o);
  const chunk = new Uint8Array(12 + data.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length);
  chunk.set(enc.encode('iTXt'), 4);
  chunk.set(data, 8);
  dv.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}
