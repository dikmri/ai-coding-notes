// 音声エディタの計算: 音（チャンネルごとの Float32Array の並びと標本化の周波数）の範囲の編集、貼り付けのそろえ、効果、
// 元に戻すの記録、波形の表示（画素ごとの最小と最大）、表示の範囲、時刻の文字、再生の範囲、WAV の読み込み。
// 画面にも音にも触らない純粋な関数だけを置く（テストは tests/os-wave.test.mjs）。WAV の書き出しは core/wav.mjs の encodeWAV。
//
// 編集の考え方: どの編集も「範囲 [s, e) を新しい中身に置き換える」ことの組み合わせ（patch）として表す。
// patch には置き換えた範囲の前と後の中身だけを残すので、短い範囲の編集なら、長い音でも元に戻すの記録は小さい。
// 関数は渡された音を書き換えず、新しい音を返す。
import { basename, extname } from './path.mjs';

export const MIN_SPP = 1 / 32; // 拡大の限度: 1 標本を 32 画素
export const MAX_SAMPLES = 64e6; // 開ける音の大きさの上限（全チャンネルの標本の合計。ステレオ 48 kHz で 11 分ほど、256 MB）
export const HISTORY_BYTES = 256 * 1024 * 1024; // 元に戻すの記録に使うメモリの上限
export const HISTORY_STEPS = 100;

/* ---------- 音の形 ---------- */
export function makeAudio(channels, rate) {
  if (!channels.length) throw new Error('チャンネルがありません');
  const n = channels[0].length;
  if (channels.some((c) => c.length !== n)) throw new Error('チャンネルの長さがそろっていません');
  return { rate, channels };
}
export const frames = (a) => (a && a.channels.length ? a.channels[0].length : 0);
const zeros = (nch, len) => Array.from({ length: nch }, () => new Float32Array(len));
export const blank = (seconds, rate, nch) => makeAudio(zeros(nch, Math.max(0, Math.round(seconds * rate))), rate);
// サイン波（見本の音と確かめ用）。freqs はチャンネルごとの周波数
export function tone({ freq = 440, freqs = [freq], seconds = 1, rate = 44100, amp = 0.5 }) {
  const n = Math.round(seconds * rate);
  return makeAudio(freqs.map((f) => { const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = amp * Math.sin((2 * Math.PI * f * i) / rate); return d; }), rate);
}
export function peak(chs) { let m = 0; for (const c of chs) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > m) m = v; } return m; }
export const regionLength = (r) => (r.length ? r[0].length : 0);
const bytesOf = (r) => r.reduce((s, c) => s + c.byteLength, 0);

/* ---------- 範囲 ---------- */
export function clampRange(len, a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return [Math.max(0, Math.min(len, Math.round(lo))), Math.max(0, Math.min(len, Math.round(hi)))];
}
export const sliceRegion = (chs, s, e) => chs.map((c) => c.slice(s, e));
// [s, e) を region に置き換えた新しい音
export function splice(audio, s, e, region) {
  const len = frames(audio), add = regionLength(region);
  return makeAudio(audio.channels.map((c, k) => {
    const out = new Float32Array(len - (e - s) + add);
    out.set(c.subarray(0, s), 0); out.set(region[k], s); out.set(c.subarray(e), s + add);
    return out;
  }), audio.rate);
}
// 置き換えを順に行い、元に戻すための patch を集める。ops: [{ s, e, region }]
export function edit(audio, ops) {
  const patches = [];
  let a = audio;
  for (const { s, e, region } of ops) { patches.push({ at: s, before: sliceRegion(a.channels, s, e), after: region }); a = splice(a, s, e, region); }
  return { audio: a, patches };
}
export function revert(audio, patches) {
  let a = audio;
  for (let i = patches.length - 1; i >= 0; i--) { const p = patches[i]; a = splice(a, p.at, p.at + regionLength(p.after), p.before); }
  return a;
}
export function reapply(audio, patches) {
  let a = audio;
  for (const p of patches) a = splice(a, p.at, p.at + regionLength(p.before), p.after);
  return a;
}

/* ---------- 貼り付けのそろえ（標本化の周波数とチャンネル数） ---------- */
// 直線で補って周波数を変える（長さは比で変わる）
export function resample(ch, from, to) {
  if (from === to) return ch.slice();
  const n = Math.round((ch.length * to) / from), out = new Float32Array(n), r = from / to, last = ch.length - 1;
  for (let i = 0; i < n; i++) {
    const p = i * r, a = Math.floor(p), t = p - a;
    out[i] = a >= last ? ch[last] : ch[a] + (ch[a + 1] - ch[a]) * t;
  }
  return out;
}
// チャンネル数を合わせる: 1 つへは平均、1 つからは同じものを全部へ、それ以外は順に割り当てる
export function mixChannels(chs, nch) {
  if (chs.length === nch) return chs.map((c) => c.slice());
  if (nch === 1) { const n = regionLength(chs), out = new Float32Array(n); for (const c of chs) for (let i = 0; i < n; i++) out[i] += c[i] / chs.length; return [out]; }
  return Array.from({ length: nch }, (_, k) => chs[k % chs.length].slice());
}
export const conform = (clip, rate, nch) => mixChannels(clip.channels, nch).map((c) => resample(c, clip.rate, rate));

/* ---------- 編集 ---------- */
export function copy(audio, s, e) {
  [s, e] = clampRange(frames(audio), s, e);
  return e > s ? makeAudio(sliceRegion(audio.channels, s, e), audio.rate) : null;
}
export function remove(audio, s, e) {
  [s, e] = clampRange(frames(audio), s, e);
  return e > s ? edit(audio, [{ s, e, region: zeros(audio.channels.length, 0) }]) : null;
}
export function cut(audio, s, e) {
  const clip = copy(audio, s, e);
  return clip ? { ...remove(audio, s, e), clip } : null;
}
// 範囲が 0 ならカーソルの位置へ挿入、範囲があれば置き換える。返す start と end は貼った部分
export function paste(audio, s, e, clip) {
  [s, e] = clampRange(frames(audio), s, e);
  const region = conform(clip, audio.rate, audio.channels.length);
  return { ...edit(audio, [{ s, e, region }]), start: s, end: s + regionLength(region) };
}
export function silence(audio, s, e) {
  [s, e] = clampRange(frames(audio), s, e);
  return e > s ? edit(audio, [{ s, e, region: zeros(audio.channels.length, e - s) }]) : null;
}
// 選んだ範囲だけ残す。後ろを先に捨ててから前を捨てる（前を捨てると後ろの位置がずれるため）
export function trim(audio, s, e) {
  const len = frames(audio);
  [s, e] = clampRange(len, s, e);
  if (e <= s || (s === 0 && e === len)) return null;
  const nch = audio.channels.length, ops = [];
  if (e < len) ops.push({ s: e, e: len, region: zeros(nch, 0) });
  if (s > 0) ops.push({ s: 0, e: s, region: zeros(nch, 0) });
  return edit(audio, ops);
}
// 効果を範囲にかける（範囲が 0 なら全体）。fn は同じ長さの新しい中身を返す
export function effect(audio, s, e, fn) {
  [s, e] = clampRange(frames(audio), s, e);
  if (e <= s) [s, e] = [0, frames(audio)];
  return { ...edit(audio, [{ s, e, region: fn(sliceRegion(audio.channels, s, e)) }]), start: s, end: e };
}

/* ---------- 効果（範囲の中身 → 同じ長さの新しい中身） ---------- */
export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);
const map = (r, f) => r.map((c, k) => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = f(c[i], i, c.length, k); return o; });
export const gain = (r, db) => { const g = dbToGain(db); return map(r, (v) => v * g); };
// いちばん大きい振れ幅を目標の dB にそろえる。全部のチャンネルに同じ倍率をかけるので、左右の比は変わらない
export function normalize(r, targetDb = -1) {
  const p = peak(r);
  if (!p) return r.map((c) => c.slice());
  const g = dbToGain(targetDb) / p;
  return map(r, (v) => v * g);
}
export const fadeIn = (r) => map(r, (v, i, n) => (n > 1 ? v * (i / (n - 1)) : v));
export const fadeOut = (r) => map(r, (v, i, n) => (n > 1 ? v * (1 - i / (n - 1)) : v));
export const reverse = (r) => r.map((c) => c.slice().reverse());
// 直流のずれ（波の中心が 0 からずれている分）をチャンネルごとに引く
export function removeDC(r) {
  return r.map((c) => { let m = 0; for (let i = 0; i < c.length; i++) m += c[i]; m = c.length ? m / c.length : 0; const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] - m; return o; });
}

/* ---------- 元に戻す ---------- */
// 回数（max）と使うメモリ（maxBytes）の両方に上限を置く。古いものから捨てるが、最新の 1 つは大きくても残す
export class History {
  constructor({ max = HISTORY_STEPS, maxBytes = HISTORY_BYTES } = {}) { this.max = max; this.maxBytes = maxBytes; this.done = []; this.undone = []; }
  static size(entry) { return entry.patches.reduce((s, p) => s + bytesOf(p.before) + bytesOf(p.after), 0); }
  get bytes() { return [...this.done, ...this.undone].reduce((s, e) => s + History.size(e), 0); }
  get undoCount() { return this.done.length; }
  get redoCount() { return this.undone.length; }
  get nextUndo() { return this.done.at(-1) || null; }
  get nextRedo() { return this.undone.at(-1) || null; }
  push(entry) {
    this.done.push(entry); this.undone = [];
    while (this.done.length > 1 && (this.done.length > this.max || this.bytes > this.maxBytes)) this.done.shift();
  }
  undo(audio) { const e = this.done.pop(); if (!e) return null; this.undone.push(e); return { audio: revert(audio, e.patches), entry: e }; }
  redo(audio) { const e = this.undone.pop(); if (!e) return null; this.done.push(e); return { audio: reapply(audio, e.patches), entry: e }; }
  clear() { this.done = []; this.undone = []; }
}

/* ---------- 波形の表示 ---------- */
// 大きく縮めたとき用のまとめ: block 標本ごとの最小と最大
export function summarize(ch, block = 256) {
  const n = Math.ceil(ch.length / block), min = new Float32Array(n), max = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let lo = Infinity, hi = -Infinity;
    for (let i = b * block, e = Math.min(ch.length, i + block); i < e; i++) { const v = ch[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    min[b] = lo; max[b] = hi;
  }
  return { block, min, max };
}
// 画素の列ごとの [最小, 最大] を並べた配列（長さ cols × 2）。列 i は標本 [start + i × spp, start + (i + 1) × spp) を受け持つ。
// 音の外の列は NaN。spp が 1 より小さいとき（拡大したとき）は、その位置の標本を1つ使う
export function columnPeaks(ch, start, spp, cols, sum = null) {
  const out = new Float32Array(cols * 2), len = ch.length, useSum = sum && spp >= sum.block * 4;
  for (let i = 0; i < cols; i++) {
    let a = Math.floor(start + i * spp), b = Math.max(a + 1, Math.floor(start + (i + 1) * spp));
    a = Math.max(0, a); b = Math.min(len, b);
    if (a >= b) { out[i * 2] = out[i * 2 + 1] = NaN; continue; }
    let lo = Infinity, hi = -Infinity;
    if (useSum) {
      for (let k = Math.floor(a / sum.block), ke = Math.ceil(b / sum.block); k < ke; k++) { if (sum.min[k] < lo) lo = sum.min[k]; if (sum.max[k] > hi) hi = sum.max[k]; }
    } else {
      for (let k = a; k < b; k++) { const v = ch[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    out[i * 2] = lo; out[i * 2 + 1] = hi;
  }
  return out;
}

/* ---------- 表示の範囲（view: { start: 左端の標本の位置, spp: 1 画素あたりの標本の数 }） ---------- */
const maxSpp = (len, width) => Math.max(MIN_SPP, len / Math.max(1, width));
export const fitView = (len, width) => ({ start: 0, spp: maxSpp(len, width) });
export function clampView(view, len, width) {
  const spp = Math.min(maxSpp(len, width), Math.max(MIN_SPP, view.spp));
  return { start: Math.max(0, Math.min(Math.max(0, len - width * spp), view.start)), spp };
}
// x の位置にある標本を動かさずに、factor 倍に拡大（1 より小さければ縮小）する
export function zoomView(view, factor, x, len, width) {
  const anchor = view.start + x * view.spp;
  const spp = Math.min(maxSpp(len, width), Math.max(MIN_SPP, view.spp / factor));
  return clampView({ start: anchor - x * spp, spp }, len, width);
}
export const xToFrame = (view, x) => view.start + x * view.spp;
export const frameToX = (view, f) => (f - view.start) / view.spp;

/* ---------- 時刻の文字と目盛り ---------- */
const pad = (n, w = 2) => String(n).padStart(w, '0');
// 秒を「分:秒.ミリ秒」にする。1 時間を越えたら「時:分:秒.ミリ秒」
export function fmtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000)), s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h ? h + ':' + pad(m) : m}:${pad(s % 60)}.${pad(ms % 1000, 3)}`;
}
const STEPS = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const decimalsOf = (step) => (step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)));
// 目盛りの時刻の文字: 刻みに合わせて小数の桁を減らす
export function fmtTick(t, step) {
  const d = decimalsOf(step), u = 10 ** d, v = Math.round(t * u), whole = Math.floor(v / u), m = Math.floor(whole / 60);
  return `${m}:${pad(whole % 60)}${d ? '.' + pad(v % u, d) : ''}`;
}
// 目盛り: 間が minGap 画素より狭くならない、きりのよい刻みを選ぶ
export function ticks(startSec, secPerPx, width, minGap = 80) {
  const step = STEPS.find((s) => s / secPerPx >= minGap) || STEPS.at(-1);
  const list = [];
  for (let k = Math.ceil(startSec / step - 1e-9) || 0; ; k++) { // || 0 で -0 を 0 にする
    const t = k * step, x = (t - startSec) / secPerPx;
    if (x > width) break;
    list.push({ x, t });
  }
  return { step, list };
}
export function selectionText([s, e], rate) {
  return e > s ? `始め ${fmtTime(s / rate)} ・ 終わり ${fmtTime(e / rate)} ・ 長さ ${fmtTime((e - s) / rate)}` : `カーソル ${fmtTime(s / rate)}`;
}

/* ---------- 再生 ---------- */
// 鳴らす範囲 [from, to)（標本）。カーソルが最後にあれば最初から鳴らす
export function playSpan(mode, [s, e], len) {
  if (mode === 'selection' && e > s) return [s, e];
  if (mode === 'start' || s >= len) return [0, len];
  return [s, len];
}
// offset（秒）から鳴らし始めて elapsed 秒たったときの位置（秒）。くり返しのときは to まで行ったら from へ戻り、from〜to の中を回る
export function playPosition({ from, to, elapsed, loop, offset = from }) {
  const p = offset + elapsed;
  if (!loop || to <= from) return Math.min(p, to);
  return p < to ? p : from + ((p - to) % (to - from));
}

// 見本の音: 4 つの音（ド・ミ・ソ・ド）を、少し重ねて鳴らす。どの音も鳴り始めは速く上がり、ゆっくり消える
export function sampleTune(rate = 44100) {
  const notes = [523.25, 659.25, 783.99, 1046.5], gap = 0.32, dur = 1.1, n = Math.round((gap * (notes.length - 1) + dur) * rate), d = new Float32Array(n);
  notes.forEach((f, k) => {
    const o = Math.round(k * gap * rate), m = Math.round(dur * rate);
    for (let i = 0; i < m && o + i < n; i++) {
      const t = i / rate, env = Math.min(1, t / 0.01) * Math.exp(-t * 4) * (1 - i / m);
      d[o + i] += 0.3 * env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t));
    }
  });
  return makeAudio([d], rate);
}

/* ---------- WAV を読む（PCM 8・16・24・32 ビット、32・64 ビット浮動小数、拡張の形） ---------- */
// 16 ビットは core/wav.mjs の encodeWAV と同じ割り方（正は 32767、負は 32768）で戻すので、保存して開き直しても値がずれない
export function parseWAV(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('WAV の形ではありません');
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= b.length;) {
    const id = tag(o), size = dv.getUint32(o + 4, true), body = o + 8;
    if (id === 'fmt ') {
      let code = dv.getUint16(body, true);
      if (code === 0xfffe && size >= 26) code = dv.getUint16(body + 24, true); // 拡張の形: 中身の種類は SubFormat の先頭
      fmt = { code, nch: dv.getUint16(body + 2, true), rate: dv.getUint32(body + 4, true), align: dv.getUint16(body + 12, true), bits: dv.getUint16(body + 14, true) };
    } else if (id === 'data') data = [body, Math.min(size, b.length - body)];
    o = body + size + (size & 1); // 奇数の大きさの塊には 1 バイトの詰め物が付く
  }
  if (!fmt || !data) throw new Error('WAV の中身（fmt と data）が見つかりません');
  const { code, nch, rate, bits } = fmt, bps = bits / 8;
  const ok = (code === 1 && [8, 16, 24, 32].includes(bits)) || (code === 3 && (bits === 32 || bits === 64));
  if (!ok || !nch || !rate) throw new Error(`この WAV の形（種類 ${code}、${bits} ビット）は読めない形です`);
  const align = fmt.align || nch * bps, n = Math.floor(data[1] / align), chs = zeros(nch, n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const o = data[0] + i * align + c * bps;
      let v;
      if (code === 3) v = bits === 32 ? dv.getFloat32(o, true) : dv.getFloat64(o, true);
      else if (bits === 8) v = (b[o] - 128) / 128;
      else if (bits === 16) { const x = dv.getInt16(o, true); v = x < 0 ? x / 32768 : x / 32767; }
      else if (bits === 24) { let x = b[o] | (b[o + 1] << 8) | (b[o + 2] << 16); if (x & 0x800000) x -= 0x1000000; v = x / 8388608; }
      else v = dv.getInt32(o, true) / 2147483648;
      chs[c][i] = v;
    }
  }
  return makeAudio(chs, rate);
}

// 保存の名前: 拡張子を .wav にする
export function wavName(p) {
  const b = p ? basename(p) : '', e = extname(b);
  return (e ? b.slice(0, -e.length) : b || '無題の音') + '.wav';
}
