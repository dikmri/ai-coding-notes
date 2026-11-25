// reports/fft/js/repair.mjs のテスト。論文（The logarithmic exponent of finite Fourier transforms, 2026-11-24）の
// 第 5 節「予測と厳密な修理」を小さく作り直した模型が、ふつうのウォルシュ・アダマール変換と同じ答えを返すか。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  paperWindow, firstSavingM, windowPoly, hermiteG, hermiteD, centeredWindow, exceptionalCount,
  chooseWalshChecks, predictRepairWHT, gateCounts,
} from '../reports/fft/js/repair.mjs';
import { fwht } from '../reports/fft/js/fft.mjs';

function rand(n, seed = 1) {
  const a = new Float64Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; a[i] = x / 2 ** 31 - 1; }
  return a;
}
const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); };

test('論文の窓: m=10 では u=−5・v=15 で、窓が 0〜m を全部含む（外れる行が無い）', () => {
  const w = paperWindow(10);
  assert.equal(w.r, 5); // 2^5 ≥ 20
  assert.equal(w.B, 10); // ⌈√(2·10·5)⌉
  assert.equal(w.u, -5);
  assert.equal(w.v, 15);
  assert.equal(w.D, 20);
  assert.equal(w.b, 32); // D 以上の最小の 2 のべき
  assert.equal(w.stages, 128); // (ℓ+2)·b、ℓ=2
  assert.ok(w.u <= 0 && w.v >= 10);
});

test('論文の窓: Hoeffding の評価どおり、窓の外に出る割合は 1/(2m³) 以下', () => {
  for (const m of [60, 100, 200, 500]) {
    const w = paperWindow(m);
    // 2 項分布 B(m, 1/2) の窓の外の確率を、対数で正確に足す
    let p = 0;
    const lf = [0]; for (let i = 1; i <= m; i++) lf[i] = lf[i - 1] + Math.log(i);
    for (let c = 0; c <= m; c++) if (c < w.u || c > w.v) p += Math.exp(lf[m] - lf[c] - lf[m - c] - m * Math.LN2);
    assert.ok(p <= 1 / (2 * m ** 3), `m=${m} で ${p}`);
  }
});

test('段の数が m を下回る最初の m: その m で (ℓ+2)·b < m、それより小さい m では下回らない', () => {
  for (const factor of [1, 4]) {
    const m0 = firstSavingM(factor);
    assert.ok(paperWindow(m0).stages < factor * m0);
    for (let m = 2; m < m0; m++) assert.ok(paperWindow(m).stages >= factor * m, `factor=${factor} m=${m}`);
  }
  // 手で計算した値: m = 128 は b = 128 で b < m にならず、m = 129 で初めて b = 128 < 129
  assert.equal(firstSavingM(4), 129);
  assert.equal(firstSavingM(1), 2049);
});

test('予測の多項式: 論文の例（m=3、窓 1〜2）では 2c−3 になる', () => {
  const f = windowPoly(1, 1);
  for (const c of [-2, 0, 1, 2, 3, 7]) assert.equal(f(c), 2 * c - 3);
});

test('予測の多項式: 窓の中では (−1)^c に一致し、窓のすぐ外では一致しない', () => {
  for (const [u, D] of [[2, 6], [3, 4], [0, 5], [4, 3]]) {
    const f = windowPoly(u, D);
    for (let c = u; c <= u + D; c++) assert.equal(f(c), c % 2 ? -1 : 1, `u=${u} D=${D} c=${c}`);
    assert.notEqual(f(u + D + 1), (u + D + 1) % 2 ? -1 : 1);
    if (u > 0) assert.notEqual(f(u - 1), (u - 1) % 2 ? -1 : 1);
  }
});

test('ヘルミートの修正式: g(±1)=±1、傾き 0、g(y)−z = (y−z)²·D_z(y)', () => {
  for (const z of [1, -1]) {
    assert.equal(hermiteG(z), z);
    const h = 1e-6;
    assert.ok(Math.abs((hermiteG(z + h) - hermiteG(z - h)) / (2 * h)) < 1e-6);
    for (const y of [-3.5, -1, 0, 0.25, 2, 769]) {
      const lhs = hermiteG(y) - z, rhs = (y - z) ** 2 * hermiteD(z, y);
      assert.ok(Math.abs(lhs - rhs) <= 1e-9 * Math.max(1, Math.abs(lhs)), `z=${z} y=${y}`);
    }
  }
});

test('窓を中央に置く: m=10・D=6 は 2〜8、外れる行は 2^m のうち 22 行', () => {
  assert.deepEqual(centeredWindow(10, 6), { u: 2, v: 8 });
  assert.equal(exceptionalCount(10, 2, 8), 22);
  assert.equal(exceptionalCount(10, 0, 10), 0);
  assert.equal(exceptionalCount(10, 3, 7), 2 * (binom(10, 0) + binom(10, 1) + binom(10, 2)));
});

test('検査の行列: 外れる行の組に合わせて選ぶと、どの周波数でも解ける（条件数が小さい）', () => {
  const { chosen, cond } = chooseWalshChecks(10, 2, 8);
  assert.equal(chosen.length, 22);
  assert.equal(new Set(chosen).size, 22);
  assert.ok(cond < 10, `条件数 ${cond}`);
});

for (const [m, D] of [[4, 2], [5, 3], [6, 4], [6, 6], [8, 4], [8, 5]]) {
  test(`予測と修理: m=${m}・D=${D} の束で、ふつうのウォルシュ・アダマール変換と同じ答え`, () => {
    const N = 1 << m, W = N;
    const X = rand(W * N, m * 31 + D);
    const want = Float64Array.from(X);
    for (let r = 0; r < W; r++) fwht(want.subarray(r * N, (r + 1) * N));
    const { out, stats } = predictRepairWHT(X, m, { D });
    let err = 0;
    for (let i = 0; i < out.length; i++) err = Math.max(err, Math.abs(out[i] - want[i]));
    // 正確な計算なら差は 0。倍精度では、外れる所の予測の値 p の 3 乗に比例した丸めが残る
    const tol = 1e-13 * (1 + stats.maxOutsideP ** 3);
    assert.ok(err < tol, `最大の差 ${err}（許す幅 ${tol}）`);
    assert.ok(err < 1e-4 * stats.predictOnlyErr || stats.s === 0, '修理のあとの差は、予測だけの差よりずっと小さい');
    const { u, v } = centeredWindow(m, D);
    assert.equal(stats.s, exceptionalCount(m, u, v));
    // 予測だけでは外れる行が残る（修理が働いている）
    if (stats.s > 0) assert.ok(stats.predictOnlyErr > 1e-3, `予測だけの差 ${stats.predictOnlyErr}`);
  });
}

test('予測と修理: 窓が 0〜m を全部含めば外れる行は無く、予測だけで正しい', () => {
  const m = 5, N = 1 << m;
  const X = rand(N * N, 3);
  const want = Float64Array.from(X);
  for (let r = 0; r < N; r++) fwht(want.subarray(r * N, (r + 1) * N));
  const { out, stats } = predictRepairWHT(X, m, { D: m });
  assert.equal(stats.s, 0);
  let err = 0; for (let i = 0; i < out.length; i++) err = Math.max(err, Math.abs(out[i] - want[i]));
  assert.ok(err < 1e-9);
});

test('予測と修理: 入力の配列を書き換えない', () => {
  const m = 4, N = 16, X = rand(N * N, 8), copy = Float64Array.from(X);
  predictRepairWHT(X, m, { D: 2 });
  assert.deepEqual(X, copy);
});

test('ゲートの数え方: ふつうの変換は 1 標本あたり m 個、模型は予測 4 回ぶんで D·(2m+2)·4 個より多い', () => {
  const g = gateCounts({ m: 10, D: 6, s: 22 });
  assert.equal(g.plainPerSample, 10);
  assert.ok(g.modelPerSample > 4 * 6 * (2 * 10 + 2));
  assert.equal(g.parts.predict, 4 * 6 * (2 * 10 + 2));
  // 外れる行が無ければ修理は要らず、予測 1 回だけ
  const g0 = gateCounts({ m: 10, D: 10, s: 0 });
  assert.equal(g0.parts.predict, 10 * (2 * 10 + 2));
  assert.equal(g0.modelPerSample, 10 * (2 * 10 + 2));
});
