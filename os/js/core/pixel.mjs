// ドット絵エディタの計算: 色の文字と RGBA の変換、16 色の並び「夜灯（よあかり）16」、対称の点、拡大の段、
// スプライトシートの並べ方、範囲の切り取りと貼り付け、保存の形 .pxa（JSON）の書き出しと検証、
// アニメ GIF の符号化（色の表・LZW・コマの待ち時間・くり返し）と読み取り、PNG の大きさの読み取り。
// 画面には触らない純粋な関数だけを置く（テストは tests/os-pixel.test.mjs）。
// 線・塗りつぶし・図形・元に戻すは core/paint.mjs の関数を使う（画像は { width, height, data } の同じ形）。

export const MIN_SIZE = 8, MAX_SIZE = 128, DEFAULT_SIZE = 32, MAX_FRAMES = 64, MIN_FPS = 1, MAX_FPS = 30;
export const FORMAT = 'future-os-pixel';
export const CLEAR = [0, 0, 0, 0];

// このアプリのために決めた 16 色。暗い紫から生成りまでの明るさの段と、肌・木・草・水・花の色を並べる
export const PALETTE = [
  { hex: '#1b1526', name: '墨' },
  { hex: '#463a5c', name: '夜藤' },
  { hex: '#8579a0', name: '灰藤' },
  { hex: '#cfc7da', name: '霧' },
  { hex: '#fbf7ee', name: '生成り' },
  { hex: '#803c46', name: '小豆' },
  { hex: '#d6584a', name: '朱' },
  { hex: '#f09a52', name: '杏' },
  { hex: '#f5d86a', name: '菜の花' },
  { hex: '#a3cf55', name: '若葉' },
  { hex: '#3e8c62', name: '常磐' },
  { hex: '#2b5a78', name: '藍' },
  { hex: '#52a7d6', name: '空' },
  { hex: '#a8e3e0', name: '水浅葱' },
  { hex: '#c06aa6', name: '躑躅' },
  { hex: '#f5b8c6', name: '桜' },
];

/* ---------- 色の文字 ---------- */
// '#rgb'・'#rrggbb'・'#rrggbbaa'・'transparent' を [r, g, b, a] にする。読めなければ null
export function parseColor(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim().toLowerCase();
  if (t === 'transparent') return [...CLEAR];
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(t);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const v = [0, 2, 4, 6].map((i) => (i < h.length ? parseInt(h.slice(i, i + 2), 16) : 255));
  return v;
}
const hx = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
// 不透明なら '#rrggbb'、半透明なら '#rrggbbaa'。透明は色の成分によらず '#00000000'
export function colorHex(c) {
  if (!c || c[3] === 0) return '#00000000';
  return '#' + hx(c[0]) + hx(c[1]) + hx(c[2]) + (c[3] === 255 || c[3] === undefined ? '' : hx(c[3]));
}

export const clampSize = (n) => { const v = Math.floor(Number(n)); return Number.isFinite(v) ? Math.max(MIN_SIZE, Math.min(MAX_SIZE, v)) : DEFAULT_SIZE; };
export const blankFrame = (w, h) => new Uint8ClampedArray(w * h * 4);

// 最近使った色: 新しい色を先頭に置き、同じ色は1つにして、max 個までにする
export const pushRecent = (list, hex, max = 8) => [hex, ...list.filter((c) => c !== hex)].slice(0, max);

/* ---------- 対称・拡大・並べ替え ---------- */
// 左右対称（x）・上下対称（y）で描くとき、点を映した点も加える。同じ点は1つにする
export function mirrorPoints(pts, w, h, { x = false, y = false } = {}) {
  const seen = new Set(), out = [];
  const add = (a, b) => { const k = a + ',' + b; if (!seen.has(k)) { seen.add(k); out.push([a, b]); } };
  for (const [a, b] of pts) {
    add(a, b);
    if (x) add(w - 1 - a, b);
    if (y) add(a, h - 1 - b);
    if (x && y) add(w - 1 - a, h - 1 - b);
  }
  return out;
}

export const ZOOMS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
// 拡大の段を1つ上げる（d=1）か下げる（d=-1）。段に無い倍率からは、その向きでいちばん近い段へ
export function stepZoom(z, d) {
  if (d > 0) return ZOOMS.find((v) => v > z) ?? ZOOMS.at(-1);
  return [...ZOOMS].reverse().find((v) => v < z) ?? ZOOMS[0];
}
// 幅 viewW・高さ viewH の場所に絵全体が収まる、いちばん大きな段（収まらなければ 1）
export function fitZoom(w, h, viewW, viewH) {
  let best = ZOOMS[0];
  for (const z of ZOOMS) if (w * z <= viewW && h * z <= viewH) best = z;
  return best;
}

// 見本の再生で出すコマの番号。ms は再生を始めてから経った時間（負なら 0 として扱う）
export const playFrame = (ms, fps, n) => (n > 1 ? Math.floor((Math.max(0, ms) / 1000) * fps) % n : 0);

// 並びの from 番目を to 番目へ移した新しい並びを返す（to は端に丸める）
export function moveItem(arr, from, to) {
  const out = arr.slice(), t = Math.max(0, Math.min(arr.length - 1, to));
  const [it] = out.splice(from, 1);
  out.splice(t, 0, it);
  return out;
}

export function scaleRGBA(data, w, h, k) {
  if (k === 1) return data;
  const W = w * k, out = new Uint8ClampedArray(W * h * k * 4);
  for (let y = 0; y < h * k; y++) {
    const sy = Math.floor(y / k);
    for (let x = 0; x < W; x++) { const s = (sy * w + Math.floor(x / k)) * 4, d = (y * W + x) * 4; out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3]; }
  }
  return out;
}

/* ---------- スプライトシート ---------- */
// n コマを cols 列で並べたときの、全体の大きさと各コマの左上（既定は横一列）
export function sheetLayout(n, w, h, cols = n) {
  cols = Math.max(1, Math.min(n, cols));
  const rows = Math.ceil(n / cols);
  return { width: cols * w, height: rows * h, cols, rows, cells: Array.from({ length: n }, (_, i) => [(i % cols) * w, Math.floor(i / cols) * h]) };
}
export function composeSheet(frames, w, h, cols = frames.length) {
  const L = sheetLayout(frames.length, w, h, cols), out = new Uint8ClampedArray(L.width * L.height * 4);
  frames.forEach((f, i) => {
    const [ox, oy] = L.cells[i];
    for (let y = 0; y < h; y++) out.set(f.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * L.width + ox) * 4);
  });
  return out;
}

/* ---------- 範囲（選んで動かす） ---------- */
// 2つの角から、絵の中に切りつめた範囲 { x, y, w, h }。絵の外なら null
export function normRect(x0, y0, x1, y1, w, h) {
  const l = Math.max(0, Math.min(x0, x1)), r = Math.min(w - 1, Math.max(x0, x1));
  const t = Math.max(0, Math.min(y0, y1)), b = Math.min(h - 1, Math.max(y0, y1));
  if (l > r || t > b) return null;
  return { x: l, y: t, w: r - l + 1, h: b - t + 1 };
}
export function cutRect(data, w, h, r) {
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) out.set(data.subarray(((r.y + y) * w + r.x) * 4, ((r.y + y) * w + r.x + r.w) * 4), y * r.w * 4);
  return { w: r.w, h: r.h, data: out };
}
export function clearRectIn(data, w, h, r) {
  for (let y = 0; y < r.h; y++) data.fill(0, ((r.y + y) * w + r.x) * 4, ((r.y + y) * w + r.x + r.w) * 4);
}
// src（{ w, h, data }）を (dx, dy) に重ねる。透明の画素は下を残し、絵の外は捨てる
export function pasteOver(data, w, h, src, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x, s = (y * src.w + x) * 4;
      if (tx < 0 || tx >= w || src.data[s + 3] === 0) continue;
      data.set(src.data.subarray(s, s + 4), (ty * w + tx) * 4);
    }
  }
}

/* ---------- 保存の形 .pxa ---------- */
// { format, version, width, height, fps, palette: 16 色, colors: 色の表, frames: [[続く数, 色の番号, ...], ...] }
// 画素は「同じ色が何個続くか」と色の表の番号の組で書く（白紙のコマは [w*h, 0] の2つの数になる）
export function encodeDoc(doc) {
  const index = new Map(), colors = [];
  const idOf = (d, i) => {
    const k = colorHex([d[i], d[i + 1], d[i + 2], d[i + 3]]);
    let n = index.get(k);
    if (n === undefined) { n = colors.length; colors.push(k); index.set(k, n); }
    return n;
  };
  const frames = doc.frames.map((f) => {
    const out = [];
    let prev = -1, run = 0;
    for (let i = 0; i < f.length; i += 4) {
      const n = idOf(f, i);
      if (n === prev) run++;
      else { if (run) out.push(run, prev); prev = n; run = 1; }
    }
    if (run) out.push(run, prev);
    return out;
  });
  return { format: FORMAT, version: 1, app: 'ドット絵エディタ', width: doc.width, height: doc.height, fps: doc.fps, palette: doc.palette.slice(), colors, frames };
}

const isHex6 = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
// 読み込む前に形を確かめ、違う所の説明を日本語の文の並びで返す（空なら読める）
export function validateDoc(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return ['中身が JSON のオブジェクトではありません。'];
  const E = [];
  if (o.format !== FORMAT) E.push(`Future OS のドット絵（format: "${FORMAT}"）ではありません。`);
  if (o.version !== 1) E.push(`版 ${o.version} は読めません。読めるのは版 1 です。`);
  const sizeOk = (v) => Number.isInteger(v) && v >= MIN_SIZE && v <= MAX_SIZE;
  if (!sizeOk(o.width)) E.push(`幅は ${MIN_SIZE}〜${MAX_SIZE} の整数にしてください（今は ${o.width}）。`);
  if (!sizeOk(o.height)) E.push(`高さは ${MIN_SIZE}〜${MAX_SIZE} の整数にしてください（今は ${o.height}）。`);
  if (!Number.isInteger(o.fps) || o.fps < MIN_FPS || o.fps > MAX_FPS) E.push(`速さは ${MIN_FPS}〜${MAX_FPS} コマ/秒の整数にしてください。`);
  if (!Array.isArray(o.palette) || o.palette.length !== 16 || !o.palette.every(isHex6)) E.push('色の並び（palette）は 16 個の #rrggbb にしてください。');
  const colorsOk = Array.isArray(o.colors) && o.colors.length > 0 && o.colors.length <= 65536 && o.colors.every((c) => parseColor(c));
  if (!colorsOk) E.push('色の表（colors）に読めない色があります。');
  if (!Array.isArray(o.frames) || o.frames.length < 1 || o.frames.length > MAX_FRAMES) E.push(`コマは 1〜${MAX_FRAMES} 個にしてください。`);
  else if (sizeOk(o.width) && sizeOk(o.height) && colorsOk) {
    const total = o.width * o.height;
    o.frames.forEach((f, i) => {
      if (!Array.isArray(f) || f.length % 2) { E.push(`${i + 1} コマ目の画素の並びが読めません。`); return; }
      let sum = 0;
      for (let k = 0; k < f.length; k += 2) {
        const n = f[k], c = f[k + 1];
        if (!Number.isInteger(n) || n < 1) { E.push(`${i + 1} コマ目に、続く数として読めない値があります。`); return; }
        if (!Number.isInteger(c) || c < 0 || c >= o.colors.length) { E.push(`${i + 1} コマ目に、色の表に無い番号 ${c} があります。`); return; }
        sum += n;
      }
      if (sum !== total) E.push(`${i + 1} コマ目の画素が ${sum} 個あります。${o.width}×${o.height} の ${total} 個にしてください。`);
    });
  }
  return E;
}

// .pxa の文字（か読んだ JSON）から、編集に使う形 { width, height, fps, palette, frames: [Uint8ClampedArray] } にする
export function parseDoc(src) {
  let o = src;
  if (typeof src === 'string') { try { o = JSON.parse(src); } catch (e) { throw new Error('JSON として読めません: ' + e.message); } }
  const errors = validateDoc(o);
  if (errors.length) throw new Error(errors.join('\n'));
  const table = o.colors.map(parseColor), total = o.width * o.height;
  const frames = o.frames.map((f) => {
    const d = new Uint8ClampedArray(total * 4);
    let p = 0;
    for (let k = 0; k < f.length; k += 2) { const c = table[f[k + 1]]; for (let n = 0; n < f[k]; n++, p += 4) d.set(c, p); }
    return d;
  });
  return { width: o.width, height: o.height, fps: o.fps, palette: o.palette.map((c) => c.toLowerCase()), frames };
}

/* ---------- PNG を開く ---------- */
export function pngSize(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!bytes || bytes.length < 24 || sig.some((v, i) => bytes[i] !== v) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
  const be = (i) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  return { width: be(16), height: be(20) };
}
// PNG を開くときのキャンバスの大きさ。128 を超える絵は断り、8 より小さい絵は 8 の枠の左上に置く
export function fitImport(w, h) {
  if (!(w >= 1 && h >= 1)) return { ok: false, reason: '絵の大きさを読めませんでした。' };
  if (w > MAX_SIZE || h > MAX_SIZE) return { ok: false, reason: `この絵は ${w}×${h} 画素です。ドット絵エディタで開けるのは ${MAX_SIZE}×${MAX_SIZE} 画素までです。` };
  return { ok: true, width: Math.max(MIN_SIZE, w), height: Math.max(MIN_SIZE, h) };
}

/* ---------- GIF ---------- */
// LZW の符号（GIF の形: 下の桁から詰める、消す符号と終わりの符号、12 ビットで辞書を作り直す）。
// 返すのは符号を詰めたバイト列（255 バイトずつの区切りは encodeGif で付ける）
export function lzwEncode(indices, minCode) {
  const clear = 1 << minCode, eoi = clear + 1, out = [];
  let size = minCode + 1, next = eoi + 1, dict = new Map(), acc = 0, nbits = 0;
  const emit = (code) => { acc |= code << nbits; nbits += size; while (nbits >= 8) { out.push(acc & 255); acc >>>= 8; nbits -= 8; } };
  emit(clear);
  if (indices.length) {
    let cur = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = (cur << 8) | k, hit = dict.get(key);
      if (hit !== undefined) { cur = hit; continue; }
      emit(cur);
      if (next === 4096) { emit(clear); dict = new Map(); size = minCode + 1; next = eoi + 1; }
      else { if (next >= 1 << size) size++; dict.set(key, next++); }
      cur = k;
    }
    emit(cur);
    // 読む側は最後の符号を読んだあとに辞書へ1つ足し、桁が上がることがある。終わりの符号もその桁で書く
    if (next >= 1 << size && size < 12) size++;
  }
  emit(eoi);
  if (nbits > 0) out.push(acc & 255);
  return Uint8Array.from(out);
}

export function lzwDecode(bytes, minCode) {
  const clear = 1 << minCode, eoi = clear + 1, total = bytes.length * 8;
  const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096), len = new Uint16Array(4096);
  for (let i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; first[i] = i; len[i] = 1; }
  let size = minCode + 1, next = eoi + 1, prev = -1, pos = 0;
  const out = [];
  const write = (code) => { const n = len[code], at = out.length; out.length += n; for (let c = code, j = n - 1; j >= 0; j--, c = prefix[c]) out[at + j] = suffix[c]; };
  for (;;) {
    if (pos + size > total) break;
    let code = 0;
    for (let i = 0; i < size; i++, pos++) code |= ((bytes[pos >> 3] >> (pos & 7)) & 1) << i;
    if (code === clear) { size = minCode + 1; next = eoi + 1; prev = -1; continue; }
    if (code === eoi) break;
    if (prev === -1) {
      if (code >= clear) throw new Error('LZW の符号が壊れています（消す符号の直後）。');
      write(code); prev = code; continue;
    }
    if (code > next) throw new Error('LZW の符号が壊れています（辞書に無い番号）。');
    if (next < 4096) {
      prefix[next] = prev; first[next] = first[prev]; len[next] = len[prev] + 1;
      suffix[next] = code < next ? first[code] : first[prev];
      next++;
    }
    write(code);
    if (next >= 1 << size && size < 12) size++;
    prev = code;
  }
  return Uint8Array.from(out);
}

// GIF の色の表。透明（不透明さ 128 未満）があれば 0 番を透明にする。色が 255 を超えたら、各色の下の桁を落として収める
export function gifPalette(frames) {
  let hasT = false;
  const uniq = new Set();
  for (const f of frames) for (let i = 0; i < f.length; i += 4) { if (f[i + 3] < 128) hasT = true; else uniq.add((f[i] << 16) | (f[i + 1] << 8) | f[i + 2]); }
  const room = 256 - (hasT ? 1 : 0);
  const q = (c, s) => ((((c >> 16) & 255) >> s) << 16) | ((((c >> 8) & 255) >> s) << 8) | ((c & 255) >> s);
  let s = 0, keys = [...uniq];
  while (keys.length > room) { s++; keys = [...new Set([...uniq].map((c) => q(c, s)))]; }
  const n = keys.length + (hasT ? 1 : 0);
  let bits = 1;
  while (1 << bits < n) bits++;
  const table = Array.from({ length: 1 << bits }, () => [0, 0, 0]), map = new Map(), base = hasT ? 1 : 0;
  const up = (v) => Math.min(255, (v << s) + (s ? 1 << (s - 1) : 0));
  keys.forEach((k, i) => { table[base + i] = [up((k >> 16) & 255), up((k >> 8) & 255), up(k & 255)]; map.set(k, base + i); });
  return {
    table, bits, transparent: hasT ? 0 : -1,
    indexOf: (c) => (c[3] < 128 ? 0 : map.get(q((c[0] << 16) | (c[1] << 8) | c[2], s))),
  };
}

// アニメ GIF（GIF89a）。fps からコマの待ち時間（1/100 秒）を決め、2 コマ以上ならいつまでもくり返す（loop=0）
export function encodeGif({ width, height, frames, fps = 10, loop = 0 }) {
  const pal = gifPalette(frames), minCode = Math.max(2, pal.bits), hasT = pal.transparent >= 0, b = [];
  const u16 = (v) => b.push(v & 255, (v >> 8) & 255);
  const bytes = (s) => { for (const ch of s) b.push(ch.charCodeAt(0)); };
  bytes('GIF89a');
  u16(width); u16(height);
  b.push(0x80 | ((pal.bits - 1) << 4) | (pal.bits - 1), hasT ? pal.transparent : 0, 0);
  for (const c of pal.table) b.push(c[0], c[1], c[2]);
  if (frames.length > 1) { b.push(0x21, 0xff, 11); bytes('NETSCAPE2.0'); b.push(3, 1); u16(loop); b.push(0); }
  const delay = Math.max(2, Math.round(100 / fps)), idx = new Uint8Array(width * height);
  for (const f of frames) {
    // 透明があるときは、次のコマの前に背景（透明）へ戻す。無いときは残す
    b.push(0x21, 0xf9, 4, ((hasT ? 2 : 1) << 2) | (hasT ? 1 : 0)); u16(delay); b.push(hasT ? pal.transparent : 0, 0);
    b.push(0x2c); u16(0); u16(0); u16(width); u16(height); b.push(0);
    for (let i = 0, p = 0; i < idx.length; i++, p += 4) idx[i] = pal.indexOf([f[p], f[p + 1], f[p + 2], f[p + 3]]);
    const data = lzwEncode(idx, minCode);
    b.push(minCode);
    for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); b.push(n); for (let j = 0; j < n; j++) b.push(data[i + j]); }
    b.push(0);
  }
  b.push(0x3b);
  return Uint8Array.from(b);
}

// GIF を読む（確かめ用）。コマごとに { delay, disposal, transparent, rgba（画面全体の大きさ、重ねずにそのコマだけ） }
export function decodeGif(bytes) {
  if (!bytes || bytes.length < 13 || String.fromCharCode(...bytes.slice(0, 3)) !== 'GIF') throw new Error('GIF ではありません。');
  const u16 = (i) => bytes[i] | (bytes[i + 1] << 8);
  const width = u16(6), height = u16(8), lsd = bytes[10];
  let p = 13, gct = null, loop = null, gce = null;
  const readTable = (n) => { const t = []; for (let i = 0; i < n; i++, p += 3) t.push([bytes[p], bytes[p + 1], bytes[p + 2]]); return t; };
  const blocks = () => { const parts = []; for (let n = bytes[p++]; n; n = bytes[p++]) { parts.push(bytes.slice(p, p + n)); p += n; } return parts; };
  if (lsd & 0x80) gct = readTable(2 << (lsd & 7));
  const frames = [];
  while (p < bytes.length) {
    const t = bytes[p++];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = bytes[p++], parts = blocks();
      if (label === 0xf9 && parts[0]) { const g = parts[0]; gce = { disposal: (g[0] >> 2) & 7, delay: g[1] | (g[2] << 8), transparent: g[0] & 1 ? g[3] : -1 }; }
      if (label === 0xff && parts[0] && String.fromCharCode(...parts[0]) === 'NETSCAPE2.0' && parts[1]?.[0] === 1) loop = parts[1][1] | (parts[1][2] << 8);
      continue;
    }
    if (t !== 0x2c) throw new Error(`GIF の中に知らない区切り 0x${t.toString(16)} があります。`);
    const x = u16(p), y = u16(p + 2), w = u16(p + 4), h = u16(p + 6), id = bytes[p + 8];
    p += 9;
    const table = id & 0x80 ? readTable(2 << (id & 7)) : gct;
    if (id & 0x40) throw new Error('飛び越し（インターレース）の GIF は読めません。');
    if (!table) throw new Error('GIF に色の表がありません。');
    const minCode = bytes[p++], parts = blocks(), data = new Uint8Array(parts.reduce((s, a) => s + a.length, 0));
    let o = 0;
    for (const a of parts) { data.set(a, o); o += a.length; }
    const ix = lzwDecode(data, minCode), rgba = new Uint8ClampedArray(width * height * 4), tr = gce ? gce.transparent : -1;
    for (let i = 0; i < Math.min(ix.length, w * h); i++) {
      const tx = x + (i % w), ty = y + Math.floor(i / w);
      if (ix[i] === tr || tx >= width || ty >= height) continue;
      const c = table[ix[i]] || [0, 0, 0];
      rgba.set([c[0], c[1], c[2], 255], (ty * width + tx) * 4);
    }
    frames.push({ delay: gce ? gce.delay : 0, disposal: gce ? gce.disposal : 0, transparent: tr, x, y, w, h, rgba });
    gce = null;
  }
  return { width, height, loop, frames };
}
