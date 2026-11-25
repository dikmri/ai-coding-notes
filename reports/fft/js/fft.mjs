// FFT の計算だけを置く（画面・音・Worker から共通に使う。DOM に触れない）。
// ・createRadix2(n): 教科書どおりの基数 2 の FFT（複素数、その場で計算、ビット反転の並べ替え、回転因子の表）
// ・createRealFFT(n): 実数の入力を前提にした速い版。n 個の実数を n/2 個の複素数として詰め、
//   基数 4 の Stockham 法（並べ替えが要らない形）で n/2 点の FFT を計算してから、n/2+1 本の周波数に分け直す
// ・fwht(x): 正規化したウォルシュ・アダマール変換（論文の上界の作り方の出発点）
// ・dftNaive: 定義どおりの DFT（確かめ用。n² 回の計算）

const isPow2 = (n) => Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
function needPow2(n) {
  if (!isPow2(n)) throw new RangeError(`長さは 2 のべきにしてください（${n}）`);
}

/** 定義どおりの DFT。X[k] = Σ x[j]·e^{−2πijk/n}。角度は (j·k mod n) から作り、大きな角度での誤差を避ける */
export function dftNaive(re, im) {
  const n = re.length;
  const outRe = new Float64Array(n), outIm = new Float64Array(n);
  const c = new Float64Array(n), s = new Float64Array(n);
  for (let t = 0; t < n; t++) { c[t] = Math.cos((2 * Math.PI * t) / n); s[t] = Math.sin((2 * Math.PI * t) / n); }
  for (let k = 0; k < n; k++) {
    let sr = 0, si = 0;
    for (let j = 0; j < n; j++) {
      const t = (j * k) % n;
      // (a + ib)(cos − i sin)
      sr += re[j] * c[t] + im[j] * s[t];
      si += im[j] * c[t] - re[j] * s[t];
    }
    outRe[k] = sr; outIm[k] = si;
  }
  return { re: outRe, im: outIm };
}

/** 教科書どおりの基数 2（時間間引き）。forward(re, im) はその場で書き換える */
export function createRadix2(n) {
  needPow2(n);
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    rev[i] = r;
  }
  const half = n >> 1;
  const cos = new Float64Array(Math.max(1, half)), sin = new Float64Array(Math.max(1, half));
  for (let k = 0; k < half; k++) { cos[k] = Math.cos((2 * Math.PI * k) / n); sin[k] = Math.sin((2 * Math.PI * k) / n); }
  return {
    n,
    forward(re, im) {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) {
          let t = re[i]; re[i] = re[j]; re[j] = t;
          t = im[i]; im[i] = im[j]; im[j] = t;
        }
      }
      for (let size = 2; size <= n; size <<= 1) {
        const h = size >> 1, step = n / size;
        for (let start = 0; start < n; start += size) {
          for (let j = 0, k = 0; j < h; j++, k += step) {
            const a = start + j, b = a + h;
            const wr = cos[k], wi = sin[k];
            // (re[b] + i·im[b])·(wr − i·wi)
            const tr = re[b] * wr + im[b] * wi;
            const ti = im[b] * wr - re[b] * wi;
            re[b] = re[a] - tr; im[b] = im[a] - ti;
            re[a] += tr; im[a] += ti;
          }
        }
      }
    },
  };
}

/** ふつうの使い方: 実数の入力を虚部 0 の複素数として基数 2 に渡し、前半 n/2+1 本を返す（作業用の配列は f に持たせる） */
export function rfftRadix2(f, x, outRe, outIm) {
  const n = f.n;
  if (!f._re) { f._re = new Float64Array(n); f._im = new Float64Array(n); }
  const re = f._re, im = f._im;
  re.set(x.subarray ? x.subarray(0, n) : x);
  im.fill(0);
  f.forward(re, im);
  for (let k = 0; k <= n >> 1; k++) { outRe[k] = re[k]; outIm[k] = im[k]; }
}

/**
 * 基数 4 の Stockham 法の複素 FFT（長さ m）。入力は xr/xi、作業用の yr/yi と交互に使い、答えの入った組を返す。
 * 段ごとの回転因子 w1・w2・w3 は前もって 1 本の配列に並べておく（内側の繰り返しで順に読むため）。
 */
function createStockham4(m) {
  needPow2(m);
  const stages = [];
  let total = 0;
  for (let n = m, s = 1; n >= 4; n >>= 2, s <<= 2) { stages.push({ n, s, off: total }); total += 6 * (n >> 2); }
  const tw = new Float64Array(Math.max(1, total));
  for (const st of stages) {
    const q = st.n >> 2;
    for (let p = 0; p < q; p++) {
      const t = (-2 * Math.PI * p) / st.n;
      const o = st.off + 6 * p;
      tw[o] = Math.cos(t); tw[o + 1] = Math.sin(t);
      tw[o + 2] = Math.cos(2 * t); tw[o + 3] = Math.sin(2 * t);
      tw[o + 4] = Math.cos(3 * t); tw[o + 5] = Math.sin(3 * t);
    }
  }
  // 4 の段で割り切れず 2 が残るときは、最後に基数 2 の段を 1 つ足す
  const lastRadix2 = (Math.log2(m) & 1) === 1;
  return function run(xr, xi, yr, yi) {
    let ar = xr, ai = xi, br = yr, bi = yi;
    for (const { n, s, off } of stages) {
      const q = n >> 2;
      const n1 = s * q, n2 = 2 * n1, n3 = 3 * n1;
      for (let p = 0; p < q; p++) {
        const o = off + 6 * p;
        const w1r = tw[o], w1i = tw[o + 1], w2r = tw[o + 2], w2i = tw[o + 3], w3r = tw[o + 4], w3i = tw[o + 5];
        const sp = s * p, s4p = 4 * sp;
        for (let k = 0; k < s; k++) {
          const i0 = k + sp;
          const are = ar[i0], aim = ai[i0];
          const bre = ar[i0 + n1], bim = ai[i0 + n1];
          const cre = ar[i0 + n2], cim = ai[i0 + n2];
          const dre = ar[i0 + n3], dim = ai[i0 + n3];
          const apcr = are + cre, apci = aim + cim, amcr = are - cre, amci = aim - cim;
          const bpdr = bre + dre, bpdi = bim + dim;
          // j·(b − d) = (−(bim − dim), bre − dre)
          const jbr = dim - bim, jbi = bre - dre;
          const j0 = k + s4p;
          br[j0] = apcr + bpdr; bi[j0] = apci + bpdi;
          let tr = amcr - jbr, ti = amci - jbi;
          br[j0 + s] = tr * w1r - ti * w1i; bi[j0 + s] = tr * w1i + ti * w1r;
          tr = apcr - bpdr; ti = apci - bpdi;
          br[j0 + 2 * s] = tr * w2r - ti * w2i; bi[j0 + 2 * s] = tr * w2i + ti * w2r;
          tr = amcr + jbr; ti = amci + jbi;
          br[j0 + 3 * s] = tr * w3r - ti * w3i; bi[j0 + 3 * s] = tr * w3i + ti * w3r;
        }
      }
      let t = ar; ar = br; br = t; t = ai; ai = bi; bi = t;
    }
    if (lastRadix2) {
      const s = m >> 1;
      for (let k = 0; k < s; k++) {
        const are = ar[k], aim = ai[k], bre = ar[k + s], bim = ai[k + s];
        br[k] = are + bre; bi[k] = aim + bim;
        br[k + s] = are - bre; bi[k + s] = aim - bim;
      }
      let t = ar; ar = br; br = t; t = ai; ai = bi; bi = t;
    }
    return [ar, ai];
  };
}

/** 実数入力の速い版。forward(x, outRe, outIm) は x を書き換えず、0〜n/2 の n/2+1 本を書く */
export function createRealFFT(n) {
  needPow2(n);
  if (n < 4) throw new RangeError('実数入力の速い版は長さ 4 以上にしてください');
  const m = n >> 1;
  const run = createStockham4(m);
  const zr = new Float64Array(m), zi = new Float64Array(m), wr = new Float64Array(m), wi = new Float64Array(m);
  // X[k] = Fe[k] + e^{−2πik/n}·Fo[k] の回転因子
  const c = new Float64Array(m + 1), s = new Float64Array(m + 1);
  for (let k = 0; k <= m; k++) { c[k] = Math.cos((2 * Math.PI * k) / n); s[k] = Math.sin((2 * Math.PI * k) / n); }
  return {
    n,
    forward(x, outRe, outIm) {
      for (let k = 0; k < m; k++) { zr[k] = x[2 * k]; zi[k] = x[2 * k + 1]; }
      const [Zr, Zi] = run(zr, zi, wr, wi);
      for (let k = 0; k <= m; k++) {
        const k1 = k === m ? 0 : k, k2 = k === 0 ? 0 : m - k;
        const ar = Zr[k1], ai = Zi[k1], br = Zr[k2], bi = -Zi[k2]; // b = conj(Z[m−k])
        const fer = 0.5 * (ar + br), fei = 0.5 * (ai + bi);
        // Fo = −i·(a − b)/2 = ((ai − bi)/2, −(ar − br)/2)
        const for_ = 0.5 * (ai - bi), foi = -0.5 * (ar - br);
        // e^{−iθ}·Fo = (cos − i sin)(for + i·foi)
        outRe[k] = fer + for_ * c[k] + foi * s[k];
        outIm[k] = fei + foi * c[k] - for_ * s[k];
      }
    },
  };
}

/** 正規化したウォルシュ・アダマール変換（その場）。各段は 2 点の h = [[1,1],[1,−1]]/√2 */
export function fwht(x) {
  const n = x.length;
  needPow2(n);
  for (let h = 1; h < n; h <<= 1) {
    for (let i = 0; i < n; i += h << 1) {
      for (let j = i; j < i + h; j++) {
        const a = x[j], b = x[j + h];
        x[j] = a + b; x[j + h] = a - b;
      }
    }
  }
  const sc = 1 / Math.sqrt(n);
  for (let i = 0; i < n; i++) x[i] *= sc;
}

/** 2 のべきかどうか（画面の入力の確かめにも使う） */
export { isPow2 };
