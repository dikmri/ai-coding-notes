// リーマン予想の解説ページで使う計算。依存なしの ES モジュール（ブラウザと Node.js の両方で動く）
//   primeCountsAt … 素数の個数 π(x)（エラトステネスのふるい）
//   li            … 対数積分 li(x)（Ramanujan の級数）
//   zeta / zetaAbs … リーマンのゼータ関数 ζ(σ + it)（オイラー・マクローリンの和の公式）

/** 虚部が正の、最初の 10 個の零点の虚部（どれも実部は 1/2）。A. Odlyzko の表の値 */
export const ZETA_ZEROS = [
  14.134725141734693, 21.022039638771555, 25.010857580145688, 30.424876125859513, 32.935061587739189,
  37.586178158825671, 40.918719012147495, 43.327073280914999, 48.005150881167159, 49.773832477672302,
];

/**
 * 小さい順に並んだ xs のそれぞれについて、x 以下の素数の個数を返す。
 * @param {ArrayLike<number>} xs 小さい順（同じ値の並びは可）。最後の値までふるう
 * @returns {Uint32Array}
 */
export function primeCountsAt(xs) {
  const out = new Uint32Array(xs.length);
  if (!xs.length) return out;
  for (let i = 1; i < xs.length; i++) {
    if (!(xs[i] >= xs[i - 1])) throw new RangeError(`x は小さい順に渡す（${i - 1} 番目 ${xs[i - 1]}、${i} 番目 ${xs[i]}）`);
  }
  const n = Math.max(0, Math.floor(xs[xs.length - 1]));
  const composite = new Uint8Array(n + 1);
  for (let k = 2; k * k <= n; k++) {
    if (composite[k]) continue;
    for (let m = k * k; m <= n; m += k) composite[m] = 1;
  }
  let count = 0;
  let j = 0;
  while (j < xs.length && Math.floor(xs[j]) < 0) out[j++] = 0;
  for (let v = 0; v <= n && j < xs.length; v++) {
    if (v >= 2 && !composite[v]) count++;
    while (j < xs.length && Math.floor(xs[j]) === v) out[j++] = count;
  }
  return out;
}

const EULER_GAMMA = 0.5772156649015329;

/** 対数積分 li(x) = ∫₀ˣ dt / log t（x = 1 の所は主値）。x > 1 で使う */
export function li(x) {
  if (!(x > 1)) return x === 1 ? -Infinity : NaN;
  const L = Math.log(x);
  // Ramanujan: li(x) = γ + log log x + √x Σ (−1)^(n−1) Lⁿ / (n! 2^(n−1)) Σ_{k=0}^{⌊(n−1)/2⌋} 1/(2k+1)
  let sum = 0;
  let term = 0; // Lⁿ / (n! 2^(n−1))。n = 1 で L、あとは前の項に L / 2n をかける
  let inner = 0;
  for (let n = 1; n < 400; n++) {
    term = n === 1 ? L : (term * L) / (2 * n);
    if (n % 2 === 1) inner += 1 / n; // n が奇数のとき、k = (n−1)/2 の 1/(2k+1) = 1/n が増える
    const t = (n % 2 === 1 ? 1 : -1) * term * inner;
    sum += t;
    if (n > 2 * L && Math.abs(t) < 1e-17 * Math.abs(sum)) break;
  }
  return EULER_GAMMA + Math.log(L) + Math.sqrt(x) * sum;
}

/** リーマン予想が正しいときの |π(x) − li(x)| の上限（Schoenfeld 1976、x ≥ 2657）: √x·log x / 8π */
export function schoenfeldBound(x) {
  return (Math.sqrt(x) * Math.log(x)) / (8 * Math.PI);
}

// B₂ₖ / (2k)!（k = 1〜10）
const B2K_OVER_FACT = (() => {
  const B = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66, -691 / 2730, 7 / 6, -3617 / 510, 43867 / 798, -174611 / 330];
  let f = 1;
  return B.map((b, i) => {
    const k = i + 1;
    f *= (2 * k - 1) * (2 * k);
    return b / f;
  });
})();

/**
 * ζ(σ + it) を [実部, 虚部] で返す。オイラー・マクローリンの和の公式
 *   ζ(s) = Σ_{n<N} n^(−s) + N^(1−s)/(s−1) + N^(−s)/2 + Σ_{k=1}^{M} B₂ₖ/(2k)! · s(s+1)…(s+2k−2) · N^(−s−2k+1)
 * を M = 10 で使う。N は |t| に合わせて大きくする（|t| ≤ 100 で相対誤差 10⁻¹² 程度）。
 */
export function zeta(sigma, t) {
  if (sigma === 1 && t === 0) return [Infinity, 0];
  const N = 15 + Math.ceil((3 * Math.abs(t)) / (2 * Math.PI));
  let re = 0, im = 0;
  for (let n = 1; n < N; n++) {
    const ln = Math.log(n);
    const mag = Math.exp(-sigma * ln);
    re += mag * Math.cos(t * ln);
    im -= mag * Math.sin(t * ln);
  }
  // N^(−s)
  const lnN = Math.log(N);
  const nm = Math.exp(-sigma * lnN);
  const nsRe = nm * Math.cos(t * lnN);
  const nsIm = -nm * Math.sin(t * lnN);
  // N^(1−s)/(s−1) = N · N^(−s) / (s − 1)
  {
    const aRe = N * nsRe, aIm = N * nsIm;
    const dRe = sigma - 1, dIm = t;
    const den = dRe * dRe + dIm * dIm;
    re += (aRe * dRe + aIm * dIm) / den;
    im += (aIm * dRe - aRe * dIm) / den;
  }
  re += nsRe / 2;
  im += nsIm / 2;
  // 補正の項。p = s(s+1)…(s+2k−2)、q = N^(−s−2k+1)
  let pRe = sigma, pIm = t;
  let qRe = nsRe / N, qIm = nsIm / N;
  for (let k = 1; k <= B2K_OVER_FACT.length; k++) {
    const c = B2K_OVER_FACT[k - 1];
    re += c * (pRe * qRe - pIm * qIm);
    im += c * (pRe * qIm + pIm * qRe);
    // 次の k へ: p に (s+2k−1)(s+2k) をかけ、q を N² で割る
    for (const add of [2 * k - 1, 2 * k]) {
      const r = pRe * (sigma + add) - pIm * t;
      pIm = pRe * t + pIm * (sigma + add);
      pRe = r;
    }
    qRe /= N * N;
    qIm /= N * N;
  }
  return [re, im];
}

/** |ζ(σ + it)| */
export function zetaAbs(sigma, t) {
  const [re, im] = zeta(sigma, t);
  return Math.hypot(re, im);
}
