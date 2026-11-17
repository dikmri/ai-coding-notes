// セリフの声を図鑑のデータにする計算。DOM もファイルも使わない（tools/voice2js.mjs とテストから呼ぶ）
// ・WAV を読む ・周波数を下げる ・8 ビットにする ・セリフの切れ目を探す ・読み仮名を拍に分ける ・口の形の時間表を作る

// 口の形の番号。0 は口を閉じる。VRM の表情 a・i・u・e・o に対応する
export const VOWELS = ['-', 'a', 'i', 'u', 'e', 'o'];

// WAV（PCM 8/16/24/32 ビット・浮動小数 32 ビット）を読み、1 チャンネルの -1〜1 にする。fmt と data 以外の塊は飛ばす
export function readWav(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WAVE') throw new Error('WAV ではありません');
  let fmt = null, data = null;
  for (let p = 12; p + 8 <= b.length;) {
    const id = b.toString('latin1', p, p + 4), size = b.readUInt32LE(p + 4), body = p + 8;
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(body), channels: b.readUInt16LE(body + 2), sampleRate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    else if (id === 'data') data = { start: body, size: Math.min(size, b.length - body) };
    p = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('fmt か data の塊がありません');
  const { format, channels, bits } = fmt, step = bits / 8, n = Math.floor(data.size / step / channels), out = new Float32Array(n);
  const read = (o) => {
    if (format === 3 && bits === 32) return b.readFloatLE(o);
    if (format !== 1 && format !== 0xfffe) throw new Error(`読めない形式です: ${format}`);
    if (bits === 8) return (b[o] - 128) / 128;
    if (bits === 16) return b.readInt16LE(o) / 32768;
    if (bits === 24) return b.readIntLE(o, 3) / 8388608;
    if (bits === 32) return b.readInt32LE(o) / 2147483648;
    throw new Error(`読めないビット数です: ${bits}`);
  };
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += read(data.start + (i * channels + c) * step);
    out[i] = s / channels;
  }
  return { sampleRate: fmt.sampleRate, data: out };
}

// 周波数（1 秒あたりの点の数）を変える。新しい上限の 0.45 倍より高い音は、窓をかけた sinc で取り除いてから点を拾う（折り返しの雑音を出さない）
export function resample(x, from, to, half = 32) {
  const n = Math.round(x.length * to / from), out = new Float32Array(n), ratio = from / to;
  const fc = 0.45 * Math.min(from, to) / from, W = Math.ceil(half * Math.max(1, ratio));
  for (let i = 0; i < n; i++) {
    const t = i * ratio, j0 = Math.max(0, Math.ceil(t - W)), j1 = Math.min(x.length - 1, Math.floor(t + W));
    let s = 0, ws = 0;
    for (let j = j0; j <= j1; j++) {
      const u = t - j, a = 2 * Math.PI * fc * u;
      const h = (u === 0 ? 1 : Math.sin(a) / a) * (0.42 + 0.5 * Math.cos(Math.PI * u / W) + 0.08 * Math.cos(2 * Math.PI * u / W));   // Blackman の窓
      s += x[j] * h; ws += h;
    }
    out[i] = ws ? s / ws : 0;
  }
  return out;
}

// 8 ビット（-128〜127）にする。段差のひずみを散らすため、種から決まる三角の揺らぎを足す（毎回同じ結果になる）
export function toInt8(x, seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const out = new Int8Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.max(-128, Math.min(127, Math.round(x[i] * 127 + rnd() - rnd())));
  return out;
}

// 一定の間隔ごとの音の大きさ（dB）
function levels(x, sr, step) {
  const h = Math.max(1, Math.round(sr * step)), out = [];
  for (let i = 0; i < x.length; i += h) {
    let s = 0; const e = Math.min(x.length, i + h);
    for (let j = i; j < e; j++) s += x[j] * x[j];
    out.push(10 * Math.log10(s / (e - i) + 1e-12));
  }
  return out;
}

// セリフの切れ目。いちばん大きい所より range dB 以上小さい区間が minGap 秒以上続いたら、そこで分ける。返すのは点の番号の [start, end)
export function findPhrases(x, sr, { step = 0.02, range = 40, minGap = 0.35 } = {}) {
  const db = levels(x, sr, step), peak = Math.max(...db), on = db.map((v) => v > peak - range), h = Math.round(sr * step), out = [];
  let i = 0;
  while (i < on.length) {
    if (!on[i]) { i++; continue; }
    let end = i, j = i;
    while (j < on.length) {
      if (on[j]) { end = j; j++; continue; }
      let k = j; while (k < on.length && !on[k]) k++;
      if ((k - j) * step >= minGap || k === on.length) break;
      j = k;
    }
    out.push({ start: i * h, end: Math.min(x.length, (end + 1) * h) });
    i = j;
  }
  return out;
}

// 読み仮名を拍に分ける。{ v: 母音（a i u e o、っ は Q、ん は N）, lips: 唇を閉じてから開く拍（ま行・ば行・ぱ行） }
const ROWS = { a: 'あかさたなはまやらわがざだばぱ', i: 'いきしちにひみりぎじぢびぴ', u: 'うくすつぬふむゆるぐずづぶぷゔ', e: 'えけせてねへめれげぜでべぺ', o: 'おこそとのほもよろをごぞどぼぽ' };
const SMALL = { 'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゃ': 'a', 'ゅ': 'u', 'ょ': 'o', 'ゎ': 'a' };
const LIPS = 'まみむめもばびぶべぼぱぴぷぺぽ';
// g は句読点（、。！？ と空白）で区切ったまとまりの番号
const PUNCT = '、。，．！？!?,. 　…';
export function kanaMorae(kana) {
  const out = [];
  let g = 0;
  for (const ch0 of kana) {
    const code = ch0.codePointAt(0), ch = code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : ch0;   // カタカナはひらがなに
    const last = out[out.length - 1];
    if (PUNCT.includes(ch)) { if (last && last.g === g) g++; continue; }
    if (SMALL[ch] && last && last.v !== 'Q' && last.v !== 'N') { last.v = SMALL[ch]; continue; }
    if (ch === 'っ') { out.push({ v: 'Q', lips: false, g }); continue; }
    if (ch === 'ん') { out.push({ v: 'N', lips: false, g }); continue; }
    if (ch === 'ー' || ch === '〜') { const pv = [...out].reverse().find((m) => 'aiueo'.includes(m.v)); if (pv) out.push({ v: pv.v, lips: false, g }); continue; }
    if (ch === 'う' && last && last.v === 'o') { out.push({ v: 'o', lips: false, g }); continue; }   // ありがとう → ありがとー
    const v = Object.keys(ROWS).find((k) => ROWS[k].includes(ch)) || SMALL[ch];
    if (v) out.push({ v, lips: LIPS.includes(ch), g });
  }
  return out;
}

// 口の形の時間表。1 秒に tick コマ、1 コマ 1 バイト（上の 3 ビットが口の形の番号、下の 5 ビットが開き 0〜31）
// 日本語の拍はほぼ同じ長さなので、声のある時間に拍を等しく割り振る。「っ」は無音として現れるので時間を取らない。
// 句読点のまとまりと、声の 0.15 秒以上の間で分けた区間を対応させ、まとまりごとに割り振る（伸ばした呼びかけで後ろがずれない）。
// 区間のほうが多いときは長い間から境目にし、少ないときは全体に割り振る。
// 「ん」は「う」の形で小さく開く。ま行・ば行・ぱ行は拍の初めの 3 割で口を閉じ気味にする
export function mouthTrack(x, sr, morae, tick = 50, minPause = 0.15) {
  const db = levels(x, sr, 1 / tick), peak = Math.max(...db), n = db.length, out = new Uint8Array(n);
  const voiced = db.map((v) => v > peak - 35);
  const timed = morae.filter((m) => m.v !== 'Q');
  if (!timed.length || !voiced.some(Boolean)) return out;
  // 声の区間（短い間はつなげる）
  const segs = [], gapN = Math.round(minPause * tick);
  for (let f = 0; f < n; f++) {
    if (!voiced[f]) continue;
    const s = segs[segs.length - 1];
    if (s && f - s.last <= gapN) { s.frames.push(f); s.last = f; } else segs.push({ frames: [f], last: f });
  }
  const groups = [...new Set(timed.map((m) => m.g ?? 0))].map((g) => timed.filter((m) => (m.g ?? 0) === g));
  // 区間がまとまりより多いときは、長い間の順にまとまりの数 - 1 か所だけを境目に残し、ほかの間はつなげる
  while (segs.length > groups.length) {
    let k = 1;
    for (let i = 2; i < segs.length; i++) if (segs[i].frames[0] - segs[i - 1].last < segs[k].frames[0] - segs[k - 1].last) k = i;
    segs[k - 1].frames.push(...segs[k].frames); segs[k - 1].last = segs[k].last; segs.splice(k, 1);
  }
  const pairs = segs.length === groups.length ? segs.map((s, i) => [s.frames, groups[i]]) : [[segs.flatMap((s) => s.frames), timed]];
  for (const [frames, list] of pairs) {
    frames.forEach((f, i) => {
      const pos = i / frames.length * list.length, k = Math.min(list.length - 1, Math.floor(pos)), m = list[k], inMora = pos - k;
      let open = Math.max(0, Math.min(1, (db[f] - peak + 30) / 30));
      if (m.v === 'N') open *= 0.35;
      if (m.lips && inMora < 0.3) open *= 0.15;
      out[f] = (VOWELS.indexOf(m.v === 'N' ? 'u' : m.v) << 5) | Math.round(open * 31);
    });
  }
  return out;
}
