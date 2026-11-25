// 重い計算を画面の外（Web Worker）で行う。受け取る命令:
// ・signal: 曲の標本を受け取って覚える
// ・spectrogram: 曲全体のスペクトログラム（対数の周波数の列ごとの dB）を作る
// ・bench: 基数 2 と速い版を、同じ入力で交互に測る
// ・model: 論文の仕組みの模型（予測と修理）と、ふつうのウォルシュ・アダマール変換を交互に測る
import { createRadix2, createRealFFT, rfftRadix2, dftNaive, fwht } from './fft.mjs';
import { hann, frameSpectrum, logEdges, columnLevels, sequencyOrder } from './spectrum.mjs';
import { predictRepairWHT } from './repair.mjs';
import { renderPiece, SAMPLE_RATE } from './music.mjs';

let signal = new Float32Array(0), sampleRate = 44100;
const rendered = new Map(); // 合成した曲の控え（同じ曲を選び直したときに作り直さない）
const now = () => performance.now();
const median = (v) => { const s = [...v].sort((a, b) => a - b); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const quart = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };

function engine(name, n) {
  if (name === 'radix2') { const r = createRadix2(n); return { n, name, forward: (x, re, im) => rfftRadix2(r, x, re, im) }; }
  const f = createRealFFT(n);
  return { n, name, forward: (x, re, im) => f.forward(x, re, im) };
}

function spectrogram({ n, hop, engineName, rows, fLo }) {
  const fft = engine(engineName, n), win = hann(n);
  const fHi = Math.min(20000, sampleRate / 2);
  const edges = logEdges(rows, fLo, fHi);
  const frames = Math.max(1, Math.ceil(signal.length / hop));
  const out = new Float32Array(frames * rows), col = new Float64Array(rows), db = new Float64Array((n >> 1) + 1);
  let fftMs = 0;
  const t0 = now();
  for (let f = 0; f < frames; f++) {
    const spec = frameSpectrum(fft, signal, f * hop - (n >> 1), win, db);
    fftMs += spec.ms;
    columnLevels(db, edges, sampleRate, n, col);
    out.set(col, f * rows);
  }
  return { frames, rows, hop, n, fLo, fHi, data: out, fftMs, totalMs: now() - t0, engineName };
}

// fn を minMs 以上になるまで繰り返し、1 回あたりの時間を返す。ブラウザの時計は 0.1〜1 ms 刻みなので、短い計算は束で測る
function timeIt(fn, minMs) {
  let count = 0;
  const t0 = now();
  let el = 0;
  do { fn(); count++; el = now() - t0; } while (el < minMs);
  return el / count;
}

// 同じ入力で 2 つの方法を交互に測る。round ごとに先に走らせる方を入れ替える
function bench({ sizes, rounds = 15, minMs = 25 }, post) {
  const results = [];
  sizes.forEach((n, si) => {
    const mid = Math.max(0, (signal.length >> 1) - (n >> 1));
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = signal[mid + i] ?? 0;
    const eng = { radix2: engine('radix2', n), fast: engine('fast', n) };
    const out = { re: new Float64Array((n >> 1) + 1), im: new Float64Array((n >> 1) + 1) };
    const run = { radix2: () => eng.radix2.forward(x, out.re, out.im), fast: () => eng.fast.forward(x, out.re, out.im) };
    // 慣らし（最適化が落ち着くまで両方を回す）
    timeIt(run.radix2, minMs); timeIt(run.fast, minMs);
    const times = { radix2: [], fast: [] };
    for (let round = 0; round < rounds; round++) {
      const order = round % 2 ? ['fast', 'radix2'] : ['radix2', 'fast'];
      for (const name of order) times[name].push(timeIt(run[name], minMs));
    }
    const reps = Math.round(minMs / times.fast[0]);
    // 精度: 4096 以下だけ、定義どおりの DFT（倍精度）と比べた相対誤差（二乗平均の平方根）
    const err = {};
    if (n <= 4096) {
      const ref = dftNaive(x, new Float64Array(n));
      for (const name of ['radix2', 'fast']) {
        eng[name].forward(x, out.re, out.im);
        let num = 0, den = 0;
        for (let k = 0; k <= n >> 1; k++) { num += (out.re[k] - ref.re[k]) ** 2 + (out.im[k] - ref.im[k]) ** 2; den += ref.re[k] ** 2 + ref.im[k] ** 2; }
        err[name] = Math.sqrt(num / den);
      }
    }
    const r = {
      n, reps, rounds,
      radix2: { median: median(times.radix2), q1: quart(times.radix2, 0.25), q3: quart(times.radix2, 0.75) },
      fast: { median: median(times.fast), q1: quart(times.fast, 0.25), q3: quart(times.fast, 0.75) },
      err,
    };
    r.ratio = r.radix2.median / r.fast.median;
    results.push(r);
    post({ type: 'progress', what: 'bench', value: (si + 1) / sizes.length, partial: r });
  });
  return results;
}

// 4^m 個の入力（2^m 個ずつ 2^m 区間）。曲の先頭から順に詰め、足りない所は 0
function batchFromSignal(m) {
  const N = 1 << m, X = new Float64Array(N * N);
  const L = Math.min(X.length, signal.length);
  for (let i = 0; i < L; i++) X[i] = signal[i];
  return X;
}

// 自然な順の出力を、セクエンシーの順・dB にして、縦横 1/scale に縮める（強い方を残す）
function walshImage(Y, m, scale) {
  const N = 1 << m, ord = sequencyOrder(m), S = N / scale;
  const img = new Float32Array(S * S);
  img.fill(-200);
  for (let r = 0; r < N; r++) {
    const row = r * N, x = Math.floor(r / scale);
    for (let q = 0; q < N; q++) {
      const v = Math.abs(Y[row + ord[q]]);
      const db = v > 1e-10 ? 20 * Math.log10(v) : -200;
      const y = Math.floor(q / scale), at = y * S + x;
      if (db > img[at]) img[at] = db;
    }
  }
  return { size: S, data: img };
}

function model({ m = 10, D = 6, rounds = 3 }, post) {
  const N = 1 << m;
  const X = batchFromSignal(m);
  const plainTimes = [], modelTimes = [];
  let plainOut = null, res = null;
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 ? ['model', 'plain'] : ['plain', 'model'];
    for (const what of order) {
      if (what === 'plain') {
        // ふつうの変換は 1 回が短いので、60 ms 以上になるまで繰り返して 1 回あたりを出す（入力の写しも含める）。
        // 出力の配列は 1 回だけ作って使い回す（毎回 8 MB を作るとガベージコレクションが測定に混ざった）
        const Y = plainOut || new Float64Array(X.length);
        plainTimes.push(timeIt(() => {
          Y.set(X);
          for (let r = 0; r < N; r++) fwht(Y.subarray(r * N, (r + 1) * N));
        }, 60));
        plainOut = Y;
      } else {
        const keep = round === rounds - 1;
        const t = now();
        const r = predictRepairWHT(X, m, {
          D, measurePredict: false, keepPredicted: keep,
          onProgress: (v, phase) => post({ type: 'progress', what: 'model', value: (round + v) / rounds, phase }),
        });
        modelTimes.push(now() - t);
        res = r;
      }
    }
  }
  let maxDiff = 0, maxAbs = 0, predErr = 0;
  for (let i = 0; i < plainOut.length; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(res.out[i] - plainOut[i]));
    maxAbs = Math.max(maxAbs, Math.abs(plainOut[i]));
    if (res.predicted) predErr = Math.max(predErr, Math.abs(res.predicted[i] - plainOut[i]));
  }
  const scale = 2;
  return {
    m, D, rounds,
    plainMs: median(plainTimes), modelMs: median(modelTimes), plainTimes, modelTimes,
    maxDiff, maxAbs, predErr,
    stats: { ...res.stats, phases: res.stats.phases },
    images: {
      plain: walshImage(plainOut, m, scale),
      repaired: walshImage(res.out, m, scale),
      predicted: res.predicted ? walshImage(res.predicted, m, scale) : null,
    },
  };
}

self.onmessage = (ev) => {
  const msg = ev.data, post = (x) => self.postMessage(x);
  try {
    if (msg.type === 'render') {
      const t = now();
      if (!rendered.has(msg.piece)) rendered.set(msg.piece, renderPiece(msg.piece));
      signal = rendered.get(msg.piece); sampleRate = SAMPLE_RATE;
      const copy = Float32Array.from(signal);
      post({ type: 'render', id: msg.id, piece: msg.piece, signal: copy, sampleRate, ms: now() - t }, [copy.buffer]);
    } else if (msg.type === 'signal') {
      signal = msg.signal; sampleRate = msg.sampleRate;
      post({ type: 'signal', id: msg.id, length: signal.length });
    } else if (msg.type === 'spectrogram') {
      const r = spectrogram(msg);
      post({ type: 'spectrogram', id: msg.id, ...r }, [r.data.buffer]);
    } else if (msg.type === 'bench') {
      const results = bench(msg, post);
      post({ type: 'bench', id: msg.id, results });
    } else if (msg.type === 'model') {
      const r = model(msg, post);
      const bufs = [r.images.plain.data.buffer, r.images.repaired.data.buffer, ...(r.images.predicted ? [r.images.predicted.data.buffer] : [])];
      post({ type: 'model', id: msg.id, ...r }, bufs);
    }
  } catch (err) {
    post({ type: 'error', id: msg.id, what: msg.type, message: String(err?.stack || err) });
  }
};
