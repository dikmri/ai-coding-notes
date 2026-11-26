// スペクトルの表示に使う計算（DOM に触れない）。窓、dB、対数の目盛り、ピークの周波数、音名、ウォルシュ関数の並べ替え。

/** ハン窓 w[i] = 0.5 − 0.5·cos(2πi/n)（周期的な形。和はちょうど n/2） */
export function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/** 複素数 1 本の強さを dB にする。norm は振幅 1 の正弦波が 0 dB になる値（窓の和の半分） */
export function levelDb(re, im, norm) {
  const p = (re * re + im * im) / (norm * norm);
  return p > 1e-20 ? 10 * Math.log10(p) : -200;
}

/**
 * x[start .. start+n) に窓をかけて FFT し、0〜n/2 の dB を返す。範囲の外は 0 として扱う。
 * fft は createRealFFT の戻り値か、{ n, forward(x, re, im) } の形のもの。作業用の配列は fft に持たせる
 */
export function frameSpectrum(fft, x, start, win, out) {
  const n = fft.n, half = n >> 1;
  if (!fft._buf) { fft._buf = new Float64Array(n); fft._re = new Float64Array(half + 1); fft._im = new Float64Array(half + 1); }
  const buf = fft._buf, re = fft._re, im = fft._im;
  let wsum = 0;
  for (let i = 0; i < n; i++) {
    const j = start + i;
    buf[i] = (j >= 0 && j < x.length ? x[j] : 0) * win[i];
    wsum += win[i];
  }
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  fft.forward(buf, re, im);
  const ms = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
  const db = out || new Float64Array(half + 1);
  const norm = wsum / 2;
  for (let k = 0; k <= half; k++) db[k] = levelDb(re[k], im[k], norm);
  return { db, re, im, ms };
}

/** fLo〜fHi を対数で cols 列に分ける境目（cols+1 個） */
export function logEdges(cols, fLo, fHi) {
  const e = new Float64Array(cols + 1), r = Math.log(fHi / fLo);
  for (let i = 0; i <= cols; i++) e[i] = fLo * Math.exp((r * i) / cols);
  return e;
}

/** 列ごとの強さ。列に入る本があれば一番強い値、無ければ列の真ん中（対数で）の周波数を前後の本から補う */
export function columnLevels(db, edges, sr, n, out) {
  const cols = edges.length - 1, binHz = sr / n, last = db.length - 1;
  for (let c = 0; c < cols; c++) {
    const k0 = Math.ceil(edges[c] / binHz), k1 = Math.ceil(edges[c + 1] / binHz) - 1; // [edges[c], edges[c+1]) に入る本
    if (k1 >= k0 && k0 <= last) {
      let mx = -Infinity;
      for (let k = k0; k <= Math.min(k1, last); k++) if (db[k] > mx) mx = db[k];
      out[c] = mx;
    } else {
      const kf = Math.sqrt(edges[c] * edges[c + 1]) / binHz;
      const a = Math.min(last, Math.floor(kf)), b = Math.min(last, a + 1), t = kf - Math.floor(kf);
      out[c] = db[a] * (1 - t) + db[b] * t;
    }
  }
  return out;
}

/** fLo〜fHi の中で一番強い本を探し、前後の本と合わせた放物線の頂点で周波数を細かく求める（dB の上で） */
export function peakFrequency(db, sr, n, fLo, fHi) {
  const binHz = sr / n;
  const k0 = Math.max(1, Math.ceil(fLo / binHz)), k1 = Math.min(db.length - 2, Math.floor(fHi / binHz));
  let k = k0;
  for (let i = k0; i <= k1; i++) if (db[i] > db[k]) k = i;
  const a = db[k - 1], b = db[k], c = db[k + 1];
  const den = a - 2 * b + c;
  const d = den < 0 ? (0.5 * (a - c)) / den : 0;
  return { freq: (k + d) * binHz, db: b - 0.25 * (a - c) * d, bin: k };
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
/** 平均律（A4 = 440 Hz）でいちばん近い音名と、そこからのずれ（セント） */
export function noteName(freq) {
  if (!(freq > 0)) return null;
  const semis = 12 * Math.log2(freq / 440);
  const near = Math.round(semis);
  const midi = 69 + near;
  return { name: NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1), cents: Math.round(100 * (semis - near)) || 0 };
}

/** ウォルシュ・アダマール変換の出力（自然な順）を、符号の変わる回数（セクエンシー）の順に並べる表。
 *  q 番目に見せるのは ord[q] 番目の出力。ord[q] = グレイ符号 q xor (q>>1) のビットを逆に並べたもの */
export function sequencyOrder(m) {
  const n = 1 << m, ord = new Uint32Array(n);
  for (let q = 0; q < n; q++) {
    const g = q ^ (q >> 1);
    let r = 0;
    for (let b = 0; b < m; b++) if (g & (1 << b)) r |= 1 << (m - 1 - b);
    ord[q] = r;
  }
  return ord;
}
