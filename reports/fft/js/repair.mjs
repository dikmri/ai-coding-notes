// 論文「The logarithmic exponent of finite Fourier transforms」（OpenAI、2026-11-24）の上界の作り方のうち、
// 第 5 節「予測と厳密な修理（Prediction and exact spectral repair）」を小さく作り直した模型。
//
// 対象: 長さ N = 2^m の正規化したウォルシュ・アダマール変換 F を、独立な W = 2^m 行の束にかける。
// ・F は、ビット j だけに 2 点の h = [[1,1],[1,−1]]/√2 をかける演算 Q_j（j = 0〜m−1）の積で、Q_j どうしは入れ替えられる。
// ・Q_j は共通の基底（ビットごとに h の固有ベクトルへ回す変換 S）で ±1 をかけるだけになる。
//   周波数 ν での Q_j の符号は (−1)^{ν_j}、積 F の符号は (−1)^{popcount ν}。
// ・各行 r にずらし β = r を割り当てる（すべてのずらしを 1 回ずつ使う）。行 r・周波数 ν での「数」c = popcount(ν xor β)。
// ・予測: 数え上げの演算 Ĉ_β = Σ_j (I − (−1)^{β_j} Q_j)/2 の D 次の多項式 P_β。c が窓 [u, u+D] に入る所では F と同じ符号になる。
// ・外れる所（c が窓の外）は周波数ごとに s 行あり、どの行かは前もって分かる。少数の検査の行（H·X と H·P·X、2s 行）だけを
//   S で周波数の側へ移し、外れた分を解いて求める。ヘルミートの式 g(y) = y − y(y²−1)/2 で予測を置き換えると、
//   決まった持ち上げ H^T で全部の行が厳密に正しくなる（論文の補題 Full-rate Hermite repair、ℓ = 2）。
//
// 論文との違い（模型の都合）:
// ・論文は Q_j を、変換の大きさに比べて安い「軸ごとの呼び出し」で作り、1 つの段に入る m 個の Q_j の呼び出しを
//   行と行の間で共有する（第 6 節）。この共有が効くのは m がとても大きいときなので、模型では Q_j を毎回そのままかける。
// ・検査の行列 H は、論文では Vandermonde 行列（一般化 Reed–Solomon 符号の検査行列）。倍精度では点が近いと解けない
//   ので、外れる行の組 J(ν) = ν xor T で必ず解けて条件数が小さい ±1 の行（ウォルシュ関数）を選ぶ。
//   J(ν) の形のおかげで、どの周波数でも H_J = diag(σ_ν)·H_T となり、逆行列は 1 つで済む。
// ・多項式は論文の L_h の和（ニュートン形）と同じ値を、Ĉ の D 回の適用で計算する。

const SQRT1_2 = Math.SQRT1_2;
const popcount = (x) => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
const ceilSqrt = (x) => { let b = Math.ceil(Math.sqrt(x)); while (b > 0 && (b - 1) * (b - 1) >= x) b--; while (b * b < x) b++; return b; };

/** 論文の窓（ℓ = 2）。r は 2^r ≥ 2m の最小、B = ⌈√(2mr)⌉、u = ⌊m/2 − B⌋、v = ⌈m/2 + B⌉、D = v − u。
 *  予測 1 回は b 段（b は max(2, D) 以上の最小の 2 のべき）、修理まで (ℓ+2)·b = 4b 段 */
export function paperWindow(m, ell = 2) {
  let r = 0;
  while (2 ** r < 2 * m) r++;
  const mu = (m * (ell - 1)) / 2;
  const B = (ell - 1) * ceilSqrt(2 * m * r);
  const u = Math.floor(mu - B), v = Math.ceil(mu + B);
  const D = v - u;
  let b = 1;
  while (b < Math.max(2, D)) b *= ell;
  return { m, r, B, u, v, D, b, stages: (ell + 2) * b };
}

/** 修理までの段の数 4b が、factor·m を下回る最初の m。
 *  factor = 1: Q_j を 1 つずつかける m 段との比べ。
 *  factor = 4: 論文の第 6 節の配列の軸は A = 2(m + D′ − 1) 本で、補助の軸の数 D′ は m より小さく選ぶので A < 4m。
 *  ふつうの方法は軸ごとに 1 回ずつ呼ぶ。論文の 1 段が少なくとも 1 回呼ぶとすると、4b < A < 4m（b < m）が要る */
export function firstSavingM(factor = 1, limit = 1e6) {
  for (let m = 2; m <= limit; m++) if (paperWindow(m).stages < factor * m) return m;
  return null;
}

/** 窓 [u, u+D] の上で (−1)^c に一致する D 次の多項式。論文の P_β から (−1)^{|β|} を除いたもの:
 *  f(c) = (−1)^u Σ_{h=0}^{D} (−2)^h·C(c−u, h)（C は一般化した 2 項係数） */
export function windowPoly(u, D) {
  return (c) => {
    const x = c - u;
    let term = 1, sum = 1;
    for (let h = 1; h <= D; h++) { term = (term * (x - h + 1)) / h; sum += term * (-2) ** h; }
    return (u & 1 ? -1 : 1) * sum;
  };
}

/** ヘルミートの修正式（ℓ = 2）: g(y) = y − y(y² − 1)/2。z = ±1 で g(z) = z、g'(z) = 0 */
export const hermiteG = (y) => y - (y * (y * y - 1)) / 2;
/** g(y) − z = (y − z)²·D_z(y) となる D_z。ℓ = 2 では D_z(y) = −(y + 2z)/2 */
export const hermiteD = (z, y) => -(y + 2 * z) / 2;

/** 窓の幅 D を m の真ん中に置く */
export function centeredWindow(m, D) {
  const u = Math.floor((m - D) / 2);
  return { u, v: u + D };
}

/** 2^m 個のずらしのうち、数 c が窓 [u, v] の外になるもの（= 周波数ごとの外れる行の数 s） */
export function exceptionalCount(m, u, v) {
  let s = 0, cmb = 1;
  for (let c = 0; c <= m; c++) {
    if (c < u || c > v) s += cmb;
    cmb = (cmb * (m - c)) / (c + 1);
  }
  return Math.round(s);
}

function exceptionalSet(m, u, v) {
  const T = [];
  for (let t = 0; t < 1 << m; t++) { const c = popcount(t); if (c < u || c > v) T.push(t); }
  return T;
}

// 正方行列の逆行列（部分ピボットのガウス・ジョルダン）。a は行ごとの Float64Array
function invert(a) {
  const n = a.length;
  const M = a.map((row, i) => { const r = new Float64Array(2 * n); r.set(row); r[n + i] = 1; return r; });
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('検査の行列が解けません');
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c];
    for (let k = 0; k < 2 * n; k++) M[c][k] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f) for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r) => r.slice(n));
}

// 2 ノルムの条件数（AᵀA と A⁻ᵀA⁻¹ の最大固有値をべき乗法で求める）
function cond2(A, Ainv) {
  const top = (B) => {
    const n = B.length;
    let x = new Float64Array(n).fill(1), lam = 0;
    for (let it = 0; it < 200; it++) {
      const y = new Float64Array(n), z = new Float64Array(n);
      for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < n; j++) t += B[i][j] * x[j]; y[i] = t; }
      for (let j = 0; j < n; j++) { let t = 0; for (let i = 0; i < n; i++) t += B[i][j] * y[i]; z[j] = t; }
      const nz = Math.hypot(...z);
      if (!nz) return 0;
      lam = nz;
      x = z.map((t) => t / nz);
    }
    return Math.sqrt(lam);
  };
  return top(A) * top(Ainv);
}

/** 外れる行の組に合わせて、検査に使うウォルシュ関数 χ_a(r) = (−1)^{popcount(a & r)} を s 本選ぶ。
 *  T の上に制限した列で、ピボット付きのグラム・シュミット（残りの長さが一番大きい列から取る）を行う */
export function chooseWalshChecks(m, u, v) {
  const T = exceptionalSet(m, u, v), s = T.length, n = 1 << m;
  if (!s) return { T, chosen: [], Ht: [], Hinv: [], cond: 1 };
  const R = new Float64Array(s * n); // 列 a の成分 i を R[a*s + i] に
  const norm2 = new Float64Array(n);
  for (let a = 0; a < n; a++) {
    for (let i = 0; i < s; i++) R[a * s + i] = popcount(a & T[i]) & 1 ? -1 : 1;
    norm2[a] = s;
  }
  const chosen = [], used = new Uint8Array(n), q = new Float64Array(s);
  for (let k = 0; k < s; k++) {
    let best = -1;
    for (let a = 0; a < n; a++) if (!used[a] && (best < 0 || norm2[a] > norm2[best] + 1e-9)) best = a;
    used[best] = 1; chosen.push(best);
    const nb = Math.sqrt(norm2[best]);
    for (let i = 0; i < s; i++) q[i] = R[best * s + i] / nb;
    for (let a = 0; a < n; a++) {
      if (used[a]) continue;
      let d = 0;
      for (let i = 0; i < s; i++) d += q[i] * R[a * s + i];
      let n2 = 0;
      for (let i = 0; i < s; i++) { const t = (R[a * s + i] -= d * q[i]); n2 += t * t; }
      norm2[a] = n2;
    }
  }
  const Ht = chosen.map((a) => Float64Array.from(T, (t) => (popcount(a & t) & 1 ? -1 : 1)));
  const Hinv = invert(Ht);
  return { T, chosen, Ht, Hinv, cond: cond2(Ht, Hinv) };
}

/** 1 標本・1 変換あたりの 2 入力線形ゲート（au + bv を 1 個と数える）の数。式で数える（計測ではない） */
export function gateCounts({ m, D, s }) {
  const W = 2 ** m;
  const parts = {
    // 予測を 4 回（PX・P²X・P³X・PZ）。1 回は Ĉ を D 回（Ĉ は 1 ビットあたり 2 個）と組み合わせ 2 個。
    // 外れる行が無い（s = 0）ときは修理が要らないので、予測 1 回だけ
    predict: (s > 0 ? 4 : 1) * D * (2 * m + 2),
    combine: s > 0 ? 3 : 0, // g(P)X = 1.5PX − 0.5P³X と、出力 = g(P)X − PZ + FZ
    checks: (2 * s * (W - 1)) / W, // H·X と H·PX（s 行ずつ、各行は W 行の符号付きの和）
    convert: (4 * s * m) / W, // 検査の 2s 行を S で行き来する（行あたり m 段）
    table: (2 * s * s + 3 * s) / W, // 周波数ごとに s×s を 2 回かける
    lift: 2 * Math.max(0, s - 1), // Z と FZ を H^T で全部の行へ戻す
  };
  const modelPerSample = Object.values(parts).reduce((x, y) => x + y, 0);
  return { plainPerSample: m, modelPerSample, parts };
}

/**
 * 予測と修理で、W = 2^m 行（各行 2^m 個）の正規化したウォルシュ・アダマール変換を求める。
 * X は行を順に並べた Float64Array（長さ 4^m）。X は書き換えない。
 * opts: D（窓の幅）、measurePredict（予測だけの誤差も測る。既定 true）、keepPredicted（予測だけの答えも返す）、
 *       onProgress(割合, 段階)
 */
export function predictRepairWHT(X, m, { D = Math.min(m, 6), measurePredict = true, keepPredicted = false, onProgress } = {}) {
  const N = 1 << m, W = N;
  if (X.length !== W * N) throw new RangeError(`入力は ${W} 行 × ${N} 個にしてください`);
  const { u, v } = centeredWindow(m, D);
  const f = windowPoly(u, D);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const phases = {};
  let t0 = now();
  const lap = (name) => { const t = now(); phases[name] = (phases[name] || 0) + (t - t0); t0 = t; };
  const progress = (x, p) => { if (onProgress) onProgress(x, p); };

  const checks = chooseWalshChecks(m, u, v);
  const { T, chosen, Hinv } = checks, s = T.length;
  lap('setup');

  // 行ごとの作業用
  const cur = new Float64Array(N), nxt = new Float64Array(N), acc = new Float64Array(N);

  // P_β を y にかけて dst へ（y と dst は別の配列）
  function applyP(beta, y, dst) {
    const sign = (popcount(beta) + u) & 1 ? -1 : 1;
    cur.set(y);
    dst.set(y);
    for (let h = 1; h <= D; h++) {
      // nxt = (Ĉ − (u+h−1))·cur / h、Ĉ = m/2 − ½ Σ_j ε_j Q_j
      const c0 = m / 2 - (u + h - 1);
      for (let i = 0; i < N; i++) acc[i] = c0 * cur[i];
      for (let j = 0; j < m; j++) {
        const hj = 1 << j, k = (beta >> j) & 1 ? 0.5 * SQRT1_2 : -0.5 * SQRT1_2; // −½·ε_j·(1/√2)
        for (let blk = 0; blk < N; blk += hj << 1) {
          for (let i = blk, e = blk + hj; i < e; i++) {
            const a = cur[i], b = cur[i + hj];
            acc[i] += k * (a + b);
            acc[i + hj] += k * (a - b);
          }
        }
      }
      const ih = 1 / h, coef = (-2) ** h;
      for (let i = 0; i < N; i++) { const t = acc[i] * ih; nxt[i] = t; dst[i] += coef * t; }
      cur.set(nxt);
    }
    if (sign < 0) for (let i = 0; i < N; i++) dst[i] = -dst[i];
  }

  // ビットごとに h の固有ベクトルへ回す変換 S（inverse = true で戻す）。直交行列
  const cs = Math.cos(Math.PI / 8), sn = Math.sin(Math.PI / 8);
  function applyS(row, inverse) {
    for (let j = 0; j < m; j++) {
      const hj = 1 << j;
      for (let blk = 0; blk < N; blk += hj << 1) {
        for (let i = blk, e = blk + hj; i < e; i++) {
          const a = row[i], b = row[i + hj];
          if (inverse) { row[i] = a * cs - b * sn; row[i + hj] = a * sn + b * cs; }
          else { row[i] = a * cs + b * sn; row[i + hj] = -a * sn + b * cs; }
        }
      }
    }
  }

  const rowOf = (A, r) => A.subarray(r * N, (r + 1) * N);
  const PX = new Float64Array(W * N), B = new Float64Array(W * N), out = new Float64Array(W * N);

  // 1. 予測 PX
  let predictOnlyErr = 0;
  const plain = new Float64Array(N);
  for (let r = 0; r < W; r++) {
    applyP(r, rowOf(X, r), rowOf(PX, r));
    if ((r & 63) === 63) progress((0.25 * (r + 1)) / W, 'predict');
  }
  lap('predict');
  if (measurePredict) {
    for (let r = 0; r < W; r++) {
      plain.set(rowOf(X, r));
      fwhtRow(plain, m);
      const p = rowOf(PX, r);
      for (let i = 0; i < N; i++) predictOnlyErr = Math.max(predictOnlyErr, Math.abs(p[i] - plain[i]));
    }
    lap('measure');
  }

  // 外れる行が無ければ（窓が 0〜m を全部含む）、予測がそのまま正しい答え。修理は要らない
  if (s === 0) {
    out.set(PX);
    progress(1, 'done');
    return {
      out, predicted: keepPredicted ? PX : null,
      stats: { m, N, W, D, u, v, s, chosen, cond: checks.cond, exceptionalFraction: 0, maxOutsideP: 0, predictOnlyErr, phases, gates: gateCounts({ m, D, s }) },
    };
  }

  // 2. 検査の行 HX・HPX（s 行ずつ）。H[k][r] = χ_{a_k}(r)
  const HX = new Float64Array(s * N), HPX = new Float64Array(s * N);
  for (let k = 0; k < s; k++) {
    const a = chosen[k], hx = rowOf(HX, k), hpx = rowOf(HPX, k);
    for (let r = 0; r < W; r++) {
      const x = rowOf(X, r), px = rowOf(PX, r);
      if (popcount(a & r) & 1) { for (let i = 0; i < N; i++) { hx[i] -= x[i]; hpx[i] -= px[i]; } }
      else { for (let i = 0; i < N; i++) { hx[i] += x[i]; hpx[i] += px[i]; } }
    }
  }
  lap('checks');
  progress(0.3, 'checks');

  // 3. P²X、P³X。出力の土台 g(P)X = 1.5·PX − 0.5·P³X
  const tmp = new Float64Array(N);
  for (let r = 0; r < W; r++) {
    const px = rowOf(PX, r), b = rowOf(B, r), o = rowOf(out, r);
    applyP(r, px, tmp);
    applyP(r, tmp, b);
    for (let i = 0; i < N; i++) o[i] = 1.5 * px[i] - 0.5 * b[i];
    if ((r & 63) === 63) progress(0.3 + (0.45 * (r + 1)) / W, 'predict');
  }
  lap('predict');

  // 4. 検査の 2s 行を周波数の側へ
  for (let k = 0; k < s; k++) { applyS(rowOf(HX, k), false); applyS(rowOf(HPX, k), false); }
  lap('convert');

  // 5. 周波数ごとの小さな表: 外れた分 e_J を解き、持ち上げの係数 a と z·a を返す
  const Ahat = new Float64Array(s * N), Bhat = new Float64Array(s * N);
  const d = new Float64Array(s), e = new Float64Array(s), tg = new Float64Array(s), sig = new Float64Array(s);
  // 外れる所の P の符号 p は、c = popcount(T_i) と popcount(β) の偶奇だけで決まる
  const fT = Float64Array.from(T, (t) => f(popcount(t)));
  for (let nu = 0; nu < N; nu++) {
    const z = popcount(nu) & 1 ? -1 : 1;
    for (let k = 0; k < s; k++) {
      sig[k] = popcount(chosen[k] & nu) & 1 ? -1 : 1;
      d[k] = sig[k] * (HPX[k * N + nu] - z * HX[k * N + nu]);
    }
    for (let i = 0; i < s; i++) { let t = 0; const row = Hinv[i]; for (let k = 0; k < s; k++) t += row[k] * d[k]; e[i] = t; }
    for (let i = 0; i < s; i++) {
      const beta = nu ^ T[i];
      const p = (popcount(beta) & 1 ? -1 : 1) * fT[i];
      tg[i] = hermiteD(z, p) * e[i];
    }
    // a = σ ∘ (H_T^{-T}·tg)
    for (let k = 0; k < s; k++) {
      let t = 0;
      for (let i = 0; i < s; i++) t += Hinv[i][k] * tg[i];
      const a = sig[k] * t;
      Ahat[k * N + nu] = a; Bhat[k * N + nu] = z * a;
    }
  }
  lap('table');

  // 6. 表の 2s 行を元の座標へ戻す（Bhat 側は F·Z になる。F を直接かけずに済む）
  for (let k = 0; k < s; k++) { applyS(rowOf(Ahat, k), true); applyS(rowOf(Bhat, k), true); }
  lap('convert');
  progress(0.8, 'lift');

  // 7. 持ち上げ: Z_r = Σ_k H[k][r]·α_k、FZ_r = Σ_k H[k][r]·γ_k。出力 = g(P)X − P·Z + F·Z
  const Zr = new Float64Array(N), PZ = new Float64Array(N);
  if (s) {
    for (let r = 0; r < W; r++) {
      const o = rowOf(out, r);
      Zr.fill(0);
      for (let k = 0; k < s; k++) {
        const al = rowOf(Ahat, k), ga = rowOf(Bhat, k);
        if (popcount(chosen[k] & r) & 1) { for (let i = 0; i < N; i++) { Zr[i] -= al[i]; o[i] -= ga[i]; } }
        else { for (let i = 0; i < N; i++) { Zr[i] += al[i]; o[i] += ga[i]; } }
      }
      lap('lift');
      applyP(r, Zr, PZ);
      for (let i = 0; i < N; i++) o[i] -= PZ[i];
      lap('predict');
      if ((r & 63) === 63) progress(0.8 + (0.2 * (r + 1)) / W, 'lift');
    }
  }
  progress(1, 'done');
  return {
    out,
    predicted: keepPredicted ? PX : null, // 予測だけ（修理の前）の答え
    stats: {
      m, N, W, D, u, v, s, chosen, cond: checks.cond,
      exceptionalFraction: s / W,
      // 外れる所での予測の値の最大。修理は p³ を使うので、浮動小数点の丸めはこの 3 乗に比例して大きくなる
      maxOutsideP: T.reduce((mx, t) => Math.max(mx, Math.abs(f(popcount(t)))), 1),
      predictOnlyErr,
      phases,
      gates: gateCounts({ m, D, s }),
    },
  };
}

// 正規化したウォルシュ・アダマール変換（1 行）。fft.mjs の fwht と同じ計算（このファイルだけで完結させるため）
function fwhtRow(x, m) {
  const n = 1 << m;
  for (let h = 1; h < n; h <<= 1) {
    for (let i = 0; i < n; i += h << 1) {
      for (let j = i; j < i + h; j++) { const a = x[j], b = x[j + h]; x[j] = a + b; x[j + h] = a - b; }
    }
  }
  const sc = 1 / Math.sqrt(n);
  for (let i = 0; i < n; i++) x[i] *= sc;
}
