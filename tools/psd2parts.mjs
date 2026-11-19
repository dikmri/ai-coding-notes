// PSD（Photoshop のファイル）の部品（レイヤー）を読み、一覧と、部品ごとの PNG を書き出す道具。外の道具は使わない。
// コードでキャラを写す前に、元の絵が「どの部品に分かれているか」を知り、部品ごとに写すために使う。
//
// 使い方: node tools/psd2parts.mjs <入力.psd> [出力のフォルダ] [--scale 0.25]
//   出力のフォルダを渡すと、部品ごとの PNG（縮めたもの）と layers.json を書く。渡さなければ一覧だけを出す。
//   一覧の行: 番号 / 入れ物（グループ）の道筋 / 名前 / 見えるか / 不透明度 / 合成 / 範囲（左,上,右,下）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const args = process.argv.slice(2);
const input = args[0], outDir = args[1] && !args[1].startsWith('--') ? args[1] : null;
const scale = Number((args.find((a, i) => args[i - 1] === '--scale')) || 0.25);
if (!input) { console.error('使い方: node tools/psd2parts.mjs <入力.psd> [出力のフォルダ] [--scale 0.25]'); process.exit(1); }

const buf = readFileSync(input);
let p = 0;
const u8 = () => buf[p++];
const u16 = () => { const v = buf.readUInt16BE(p); p += 2; return v; };
const i16 = () => { const v = buf.readInt16BE(p); p += 2; return v; };
const u32 = () => { const v = buf.readUInt32BE(p); p += 4; return v; };
const i32 = () => { const v = buf.readInt32BE(p); p += 4; return v; };
const str = (n) => { const s = buf.toString('latin1', p, p + n); p += n; return s; };

// 見出し
if (str(4) !== '8BPS') throw new Error('PSD ではありません');
const version = u16(); // 1 = PSD、2 = PSB（大きな版。長さが 8 バイトになる所がある）
const big = version === 2;
const len = () => (big ? Number(buf.readBigUInt64BE((p += 8) - 8)) : u32());
p += 6;
const channels = u16(), height = u32(), width = u32(), depth = u16(), colorMode = u16();
if (depth !== 8 || colorMode !== 3) throw new Error(`8 ビットの RGB だけを読めます（深さ ${depth}、色の形 ${colorMode}）`);
// 長さを読んで、その分を飛ばす（`p += u32()` と書くと、u32 が進めた 4 バイトが古い p で上書きされて消える）
const skip = () => { const n = u32(); p += n; };
skip(); // 色の表
skip(); // 画像の資源
const lmEnd = (() => { const n = len(); return p + n; })();
const liLen = len(), liEnd = p + liLen;
let count = i16();
count = Math.abs(count); // 負のときは「最初の透明の情報が全体の透明度」を表すだけ

const BLEND = { norm: '通常', mul: '乗算', scrn: 'スクリーン', over: 'オーバーレイ', pass: '通過', lddg: '覆い焼き（リニア）', 'lgCl': '焼き込み（リニア）', add: '加算', ligh: '比較（明）', dark: '比較（暗）', sLit: 'ソフトライト', hLit: 'ハードライト', colr: 'カラー', lum: '輝度' };
const layers = [];
for (let i = 0; i < count; i++) {
  const top = i32(), left = i32(), bottom = i32(), right = i32();
  const nch = u16(), chans = [];
  for (let c = 0; c < nch; c++) chans.push({ id: i16(), length: len() });
  if (str(4) !== '8BIM') throw new Error('部品の記録の合図が違います');
  const blend = str(4).trim(), opacity = u8(), clipping = u8(), flags = u8(); p++;
  const extraEnd = (() => { const n = u32(); return p + n; })();
  skip(); // マスク
  skip(); // 合成の範囲
  const nameLen = u8(); let name = buf.toString('latin1', p, p + nameLen); p += nameLen; p += (4 - ((nameLen + 1) % 4)) % 4;
  let section = 0;
  while (p < extraEnd) {
    const sig = str(4); if (sig !== '8BIM' && sig !== '8B64') break;
    const key = str(4);
    const n = big && ['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD'].includes(key) ? len() : u32();
    const start = p;
    if (key === 'luni') { const n2 = u32(); name = ''; for (let k = 0; k < n2; k++) name += String.fromCharCode(buf.readUInt16BE(p + k * 2)); p += n2 * 2; }
    else if (key === 'lsct' || key === 'lsdk') section = u32();
    p = start + n;
  }
  p = extraEnd;
  layers.push({ index: i, name, top, left, bottom, right, chans, blend, blendName: BLEND[blend] || blend, opacity, clipping, hidden: !!(flags & 2), section });
}
const pixelStart = p; // 部品の記録のすぐ後ろから、部品ごとの画素が並ぶ

// 部品の画素（ここで読み飛ばすか、読む）
function readChannel(w, h, length) {
  const end = p + length;
  const comp = u16();
  let out = Buffer.alloc(w * h);
  if (w === 0 || h === 0) { p = end; return out; }
  if (comp === 0) { buf.copy(out, 0, p, p + w * h); }
  else if (comp === 1) {
    const rows = []; for (let r = 0; r < h; r++) rows.push(big ? u32() : u16());
    let o = 0;
    for (let r = 0; r < h; r++) {
      const rowEnd = p + rows[r]; let x = 0;
      while (p < rowEnd) {
        const n = buf.readInt8(p++);
        if (n >= 0) { buf.copy(out, o + x, p, p + n + 1); p += n + 1; x += n + 1; }
        else if (n !== -128) { out.fill(buf[p++], o + x, o + x + 1 - n); x += 1 - n; }
      }
      o += w;
    }
  } else if (comp === 2 || comp === 3) {
    out = inflateSync(buf.subarray(p, end));
    if (comp === 3) for (let r = 0; r < h; r++) for (let x = 1; x < w; x++) out[r * w + x] = (out[r * w + x] + out[r * w + x - 1]) & 255;
  }
  p = end;
  return out;
}

// 入れ物（グループ）の道筋。部品は下から上の順に並ぶ。区切り（section 3）が入れ物の終わり、1・2 が入れ物の頭
const stack = [];
for (let i = layers.length - 1; i >= 0; i--) {
  const L = layers[i];
  if (L.section === 1 || L.section === 2) { L.path = stack.join(' / '); stack.push(L.name); L.group = true; }
  else if (L.section === 3) { L.divider = true; }
  else L.path = stack.join(' / ');
  if (L.section === 3) {}
}
// 下から上へ読むと、区切りが入れ物の始まりになる。上から下へ組み直した stack で道筋を付け直す
{
  const st = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    if (L.group) { L.path = st.join(' / '); st.push(L.name); }
    else if (L.divider) st.pop();
    else L.path = st.join(' / ');
  }
}

// PNG を書く（縮めて、RGBA）
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

p = pixelStart;
if (outDir) mkdirSync(outDir, { recursive: true });
const meta = [];
for (const L of layers) {
  const w = L.right - L.left, h = L.bottom - L.top;
  const planes = {};
  for (const c of L.chans) planes[c.id] = readChannel(c.id === -2 ? 0 : w, c.id === -2 ? 0 : h, c.length);
  const rec = { index: L.index, path: L.path, name: L.name, hidden: L.hidden, opacity: L.opacity, blend: L.blendName, clipping: L.clipping, group: !!L.group, divider: !!L.divider, box: [L.left, L.top, L.right, L.bottom] };
  meta.push(rec);
  if (!outDir || L.group || L.divider || w <= 0 || h <= 0) continue;
  // 縮める（面積の平均。透明度で重みを付ける）
  const W = Math.max(1, Math.round(w * scale)), H = Math.max(1, Math.round(h * scale));
  const out = Buffer.alloc(W * H * 4);
  const r = planes[0], g = planes[1], b = planes[2], a = planes[-1];
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const x0 = Math.floor(X / scale), x1 = Math.min(w, Math.floor((X + 1) / scale)), y0 = Math.floor(Y / scale), y1 = Math.min(h, Math.floor((Y + 1) / scale));
    let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = y * w + x, al = a ? a[k] : 255; sr += r[k] * al; sg += g[k] * al; sb += b[k] * al; sa += al; n++; }
    const o = (Y * W + X) * 4;
    if (sa > 0) { out[o] = sr / sa; out[o + 1] = sg / sa; out[o + 2] = sb / sa; }
    out[o + 3] = n ? sa / n : 0;
  }
  const file = `${String(L.index).padStart(3, '0')}_${L.name.replace(/[\\/:*?"<>|\s]/g, '_')}.png`;
  writeFileSync(join(outDir, file), png(W, H, out));
  rec.file = file; rec.size = [W, H];
}
if (outDir) writeFileSync(join(outDir, 'layers.json'), JSON.stringify({ width, height, scale, layers: meta }, null, 1));
console.log(`${width} × ${height}、部品 ${layers.length} 個（入れ物と区切りを含む）`);
for (const L of [...meta].reverse()) {
  if (L.divider) continue;
  console.log(`${String(L.index).padStart(3)} ${L.group ? '［' : ' '}${L.path ? L.path + ' / ' : ''}${L.name}${L.group ? '］' : ''}${L.hidden ? ' （隠れ）' : ''}${L.opacity < 255 ? ` 不透明度 ${Math.round(L.opacity / 2.55)}%` : ''}${L.blend !== '通常' && L.blend !== '通過' ? ' ' + L.blend : ''}${L.clipping ? ' （下にはさむ）' : ''} ${L.box.join(',')}`);
}
