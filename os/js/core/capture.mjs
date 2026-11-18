// 画面キャプチャの計算: 切り抜く四角（向きをそろえる・画像の内に収める・プレビューの倍率を直す・四隅のつまみ）、保存の名前、画面共有の誤りの文。
// 録画（2026-11-19）: 経過の時間の文字、画質の段とビットレート、大きさの見込み、録画の名前、録る形式、録画の誤りの文、WebM の長さの読み書き。
// 画面には触らない純粋な関数だけを置く（テストは tests/os-capture.test.mjs）。四隅のつまみの名前は tl・tr・bl・br（窓のつまみ .rz の nw などと重ならないように）。
import { fmt } from './clock.mjs';

export const normRect = (x0, y0, x1, y1) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
export function clampRect(r, W, H) {
  const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
  const x1 = Math.min(W, Math.round(r.x + r.w)), y1 = Math.min(H, Math.round(r.y + r.h));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
// プレビューは画像を scale 倍で見せているので、プレビューの上の四角を画像の画素へ直す
export const toImageRect = (r, scale) => ({ x: r.x / scale, y: r.y / scale, w: r.w / scale, h: r.h / scale });
// 四隅のつまみ（tl 左上・tr 右上・bl 左下・br 右下）を (dx, dy) 動かしたときの四角。min より小さくしない
export function resizeRect(r, handle, dx, dy, min = 8) {
  let { x, y, w, h } = r;
  if (handle.includes('l')) { const nw = Math.max(min, w - dx); x += w - nw; w = nw; }
  if (handle.includes('r')) w = Math.max(min, w + dx);
  if (handle.includes('t')) { const nh = Math.max(min, h - dy); y += h - nh; h = nh; }
  if (handle.includes('b')) h = Math.max(min, h + dy);
  return { x, y, w, h };
}
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
export const defaultName = (d) => `画面 ${stamp(d)}.png`;
export function errorText(e) {
  switch (e?.name) {
    case 'NotAllowedError': case 'AbortError':
      return '画面共有が取り消されました。もう一度「撮る」を押して、撮りたい画面（このタブなど）を選んでください。';
    case 'NotSupportedError': case 'TypeError':
      return 'このブラウザでは、画面共有で撮れません。パソコンの画面写真の機能で撮ってから、ファイル マネージャへ落として取り込んでください。';
    default:
      return `画面を撮れませんでした（${e?.message || e?.name || '理由は分かりません'}）。もう一度「撮る」を押してください。`;
  }
}

/* ---------- 録画 ---------- */

// 経過の時間: 分:秒（1 時間をこえたら 時:分:秒）。秒は切り捨て。時計とタイマーと同じ書き方
export const elapsedText = (ms) => fmt(ms);

// 画質の段（映像のビットレート、30 コマ/秒のとき）。60 コマ/秒は 1 コマあたりの画質をそろえるため 1.5 倍にする
export const QUALITIES = [
  { id: 'light', label: '軽い', bps: 1_500_000 },
  { id: 'normal', label: 'ふつう', bps: 4_000_000 },
  { id: 'fine', label: 'きれい', bps: 8_000_000 },
];
export const AUDIO_BPS = 128_000;
export function videoBps(quality, fps) {
  const q = QUALITIES.find((x) => x.id === quality) || QUALITIES[1];
  return Math.round(q.bps * (fps >= 60 ? 1.5 : 1));
}

// 大きさ: ビットレート（ビット/秒）で ms ミリ秒録ったときのバイト数。動きの少ない画面はこれより小さくなるので「まで」の見込み
export const estimateBytes = (ms, bps) => Math.round(((ms / 1000) * bps) / 8);
// 今までに録れたバイト数から、1 分あたりのバイト数。2 秒より短いうちは揺れが大きいので見込まない
export const perMinute = (bytes, ms) => (ms >= 2000 ? (bytes * 60_000) / ms : null);
export function sizeText(n) {
  n = Math.max(0, Math.round(n));
  if (n < 1024) return `${n} バイト`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(1)} GB`;
}
// 状態の帯の「大きさ」の欄。録る前（ms が無い）はビットレートの見込み、録っている間は今の大きさと 1 分あたり
export function sizeLine({ bytes = 0, ms, bps }) {
  const byRate = `1 分で約 ${sizeText(estimateBytes(60_000, bps))} まで`;
  if (ms == null) return byRate;
  const pm = perMinute(bytes, ms);
  return `約 ${sizeText(bytes)}（${pm == null ? byRate : `1 分で約 ${sizeText(pm)}`}）`;
}

export const videoName = (d) => `録画 ${stamp(d)}.webm`;

// MediaRecorder で使える最初の形式。isSupported は MediaRecorder.isTypeSupported を渡す
const MIMES_AV = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const MIMES_V = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
export const pickMime = (isSupported, audio) => (audio ? MIMES_AV : MIMES_V).find((m) => isSupported(m)) || '';

// 録画の誤りの文。kind は 'screen'（画面共有）か 'mic'（マイク）。マイクを使えないときは、マイクの音なしで録り続ける
export function recErrorText(e, kind = 'screen') {
  const name = e?.name;
  if (kind === 'mic') {
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'マイクを使う許可がありません。今回はマイクの音なしで録ります。マイクも録るときは、アドレスバーの左のしるしを押して「マイク」を「許可」にしてください。';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'マイクが見つかりません。今回はマイクの音なしで録ります。マイクをつないでから、もう一度録ってください。';
    if (name === 'NotReadableError' || name === 'AbortError') return 'マイクを開けませんでした。今回はマイクの音なしで録ります。ほかのアプリがマイクを使っていないか確かめてください。';
    return `マイクを使えませんでした（${e?.message || name || '理由は分かりません'}）。今回はマイクの音なしで録ります。`;
  }
  switch (name) {
    case 'NotAllowedError': case 'AbortError':
      return '画面共有が取り消されました。もう一度「録画を始める」を押して、録りたい画面・窓・タブを選んでください。';
    case 'NotReadableError':
      return '画面を読み取れませんでした。ほかのアプリが画面を使っていないか確かめて、もう一度「録画を始める」を押してください。';
    case 'NotSupportedError': case 'TypeError':
      return 'このブラウザでは、画面を録画できません。新しい Chrome・Edge・Firefox で開いてください。';
    default:
      return `録画を始められませんでした（${e?.message || name || '理由は分かりません'}）。もう一度「録画を始める」を押してください。`;
  }
}

/* ---------- WebM の長さ ----------
   MediaRecorder の WebM には長さ（Segment > Info > Duration）が書かれていないことがある。そのままでは video 要素が長さを
   Infinity と言い、再生の位置を動かせない。録り終えたあとで Info の中に Duration（8 バイトの小数、単位は TimecodeScale。
   ふつうは 1 ミリ秒）を書き足す。Chrome の WebM は Segment と Cluster の大きさが「不明」なので、Info が伸びても直す所は Info だけ。
   位置の表（SeekHead）がある形は、足すと位置がずれるので触らない（長さの欄が既にあれば上書きだけする）。 */
const ID = { EBML: 0x1a45dfa3, Segment: 0x18538067, Info: 0x1549a966, Duration: 0x4489, TimecodeScale: 0x2ad7b1, SeekHead: 0x114d9b74, Cluster: 0x1f43b675, Timecode: 0xe7, SimpleBlock: 0xa3, BlockGroup: 0xa0, Block: 0xa1 };
const SHORT = 'short'; // バイト列が途中で切れている（頭だけを渡されたとき）
// 可変長の数（id と大きさ）。先頭のバイトの 1 の位置で長さが決まる
function vlen(x, max) { for (let k = 0; k < max; k++) if (x & (0x80 >> k)) return k + 1; return 0; }
function readId(b, o) {
  if (o >= b.length) return SHORT;
  const len = vlen(b[o], 4);
  if (!len) return null;
  if (o + len > b.length) return SHORT;
  let v = 0; for (let k = 0; k < len; k++) v = v * 256 + b[o + k];
  return { id: v, len };
}
function readSize(b, o) {
  if (o >= b.length) return SHORT;
  const len = vlen(b[o], 8);
  if (!len) return null;
  if (o + len > b.length) return SHORT;
  let v = b[o] & (0xff >> len), ones = v === 0xff >> len;
  for (let k = 1; k < len; k++) { v = v * 256 + b[o + k]; if (b[o + k] !== 0xff) ones = false; }
  return { size: ones ? -1 : v, len }; // すべて 1 は「大きさ不明」
}
// 要素の頭（id と大きさ）
function head(b, o) {
  const i = readId(b, o); if (!i || i === SHORT) return i;
  const s = readSize(b, o + i.len); if (!s || s === SHORT) return s;
  return { id: i.id, at: o, sizeAt: o + i.len, sizeLen: s.len, size: s.size, data: o + i.len + s.len };
}
// v を len バイト以上の可変長の大きさで書く（今の長さ min から順に、入る長さを探す）
function sizeBytes(v, min) {
  for (let len = min; len <= 8; len++) {
    if (v >= 2 ** (7 * len) - 1) continue;
    const out = new Uint8Array(len); let n = v;
    for (let k = len - 1; k >= 0; k--) { out[k] = n % 256; n = Math.floor(n / 256); }
    out[0] |= 0x80 >> (len - 1);
    return out;
  }
  return null;
}
const uintAt = (b, o, n) => { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + b[o + k]; return v; };
// Segment と Info の場所。WebM でなければ null、Info の終わりまで届いていなければ SHORT
function locate(b) {
  const h = head(b, 0);
  if (!h || h === SHORT) return h;
  if (h.id !== ID.EBML || h.size < 0) return null;
  const seg = head(b, h.data + h.size);
  if (!seg || seg === SHORT) return seg;
  if (seg.id !== ID.Segment) return null;
  const segEnd = seg.size < 0 ? Infinity : seg.data + seg.size;
  let seek = false;
  for (let o = seg.data; o < segEnd;) {
    const e = head(b, o);
    if (!e || e === SHORT) return e;
    if (e.id === ID.Cluster || e.size < 0) return null; // Info より先に映像が来る形は扱わない
    if (e.id === ID.SeekHead) seek = true;
    if (e.id === ID.Info) {
      if (e.data + e.size > b.length) return SHORT;
      let scale = 1e6, dur = null;
      for (let k = e.data; k < e.data + e.size;) {
        const c = head(b, k); if (!c || c === SHORT || c.size < 0) break;
        if (c.id === ID.TimecodeScale) scale = uintAt(b, c.data, c.size) || 1e6;
        if (c.id === ID.Duration) dur = c;
        k = c.data + c.size;
      }
      return { seg, info: e, scale, dur, seek };
    }
    o = e.data + e.size;
  }
  return null;
}
function readFloat(b, at, size) {
  const dv = new DataView(b.buffer, b.byteOffset + at, size);
  return size === 8 ? dv.getFloat64(0) : size === 4 ? dv.getFloat32(0) : null;
}
// 区切り（SimpleBlock・Block）の、Cluster からの相対の時刻（符号付き 16 ビット）
function blockRel(b, o) {
  const t = readSize(b, o); // 線の番号は大きさと同じ形の可変長
  if (!t || t === SHORT || o + t.len + 2 > b.length) return null;
  const v = b[o + t.len] * 256 + b[o + t.len + 1];
  return v >= 0x8000 ? v - 0x10000 : v;
}

// WebM の中身を調べる: 時刻の単位（ナノ秒）、書かれている長さ（ミリ秒、無ければ null）、いちばん後ろの区切りの時刻（ミリ秒）、区切りの数
export function webmInfo(bytes) {
  const L = locate(bytes);
  if (!L || L === SHORT) return null;
  const toMs = (v) => (v * L.scale) / 1e6;
  const dv = L.dur ? readFloat(bytes, L.dur.data, L.dur.size) : null;
  let last = null, blocks = 0, tc = 0;
  const end = L.seg.size < 0 ? bytes.length : Math.min(bytes.length, L.seg.data + L.seg.size);
  for (let o = L.seg.data; o < end;) {
    const e = head(bytes, o);
    if (!e || e === SHORT) break;
    // Cluster と BlockGroup は中へ入る（大きさ不明の Cluster は、次の Cluster が来たところで終わる）
    if (e.id === ID.Cluster || e.id === ID.BlockGroup) { o = e.data; continue; }
    if (e.id === ID.Timecode) tc = uintAt(bytes, e.data, e.size);
    else if (e.id === ID.SimpleBlock || e.id === ID.Block) {
      const rel = blockRel(bytes, e.data);
      if (rel != null) { last = last == null ? tc + rel : Math.max(last, tc + rel); blocks++; }
    }
    if (e.size < 0) break;
    o = e.data + e.size;
  }
  return { scale: L.scale, durationMs: dv == null ? null : toMs(dv), lastMs: last == null ? null : toMs(last), blocks };
}

// 長さ ms（ミリ秒）を書き込んだ新しいバイト列を返す。元のバイト列は書き換えない。
// 頭の部分だけを渡してもよい（Info の終わりまで入っていれば直せる）。直せないときは、渡したものをそのまま返す
export function fixWebmDuration(bytes, ms) {
  const L = locate(bytes);
  if (!L || L === SHORT) return bytes;
  const value = (ms * 1e6) / L.scale;
  if (L.dur) {
    if (L.dur.size !== 8 && L.dur.size !== 4) return bytes;
    const out = bytes.slice(), dv = new DataView(out.buffer, out.byteOffset + L.dur.data, L.dur.size);
    if (L.dur.size === 8) dv.setFloat64(0, value); else dv.setFloat32(0, value);
    return out;
  }
  if (L.seek) return bytes;
  const add = new Uint8Array(11); add[0] = 0x44; add[1] = 0x89; add[2] = 0x88; new DataView(add.buffer).setFloat64(3, value);
  const infoSize = sizeBytes(L.info.size + add.length, L.info.sizeLen);
  if (!infoSize) return bytes;
  const delta = add.length + infoSize.length - L.info.sizeLen;
  let segSize = null;
  if (L.seg.size >= 0) { segSize = sizeBytes(L.seg.size + delta, L.seg.sizeLen); if (!segSize || segSize.length !== L.seg.sizeLen) return bytes; }
  const infoEnd = L.info.data + L.info.size;
  const parts = [bytes.subarray(0, L.info.sizeAt), infoSize, bytes.subarray(L.info.data, infoEnd), add, bytes.subarray(infoEnd)];
  const out = new Uint8Array(parts.reduce((s, x) => s + x.length, 0));
  let o = 0; for (const x of parts) { out.set(x, o); o += x.length; }
  if (segSize) out.set(segSize, L.seg.sizeAt);
  return out;
}

// 録画の Blob に長さを書き込む。大きな録画を全部読まないよう、頭だけを読んで直し、残りの Blob をつなぐ。
// Info が頭に入りきらなければ、読む量を増やして試し直す。直せなければ元の Blob を返す
export async function withDuration(blob, ms, headSize = 65536) {
  for (let size = headSize; ; size *= 4) {
    const head = new Uint8Array(await blob.slice(0, size).arrayBuffer());
    const L = locate(head);
    if (L === SHORT && size < blob.size) continue;
    const fixed = fixWebmDuration(head, ms);
    return fixed === head ? blob : new Blob([fixed, blob.slice(head.length)], { type: blob.type || 'video/webm' });
  }
}
