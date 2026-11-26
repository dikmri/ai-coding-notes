// reports/fft/js/fft.mjs のテスト。FFT の速い版・ふつうの版が、素朴な DFT と同じ答えを返すか。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadix2, createRealFFT, dftNaive, fwht, rfftRadix2 } from '../reports/fft/js/fft.mjs';

function rand(n, seed = 1) {
  const a = new Float64Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; a[i] = x / 2 ** 31 - 1; }
  return a;
}
const maxDiff = (a, b, n = Math.min(a.length, b.length)) => { let d = 0; for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; };

test('素朴な DFT: 長さ 4 の手計算と一致する', () => {
  // x = [1, 2, 3, 4] → X = [10, -2+2i, -2, -2-2i]
  const { re, im } = dftNaive(Float64Array.of(1, 2, 3, 4), new Float64Array(4));
  assert.deepEqual([...re].map((v) => +v.toFixed(12)), [10, -2, -2, -2]);
  assert.deepEqual([...im].map((v) => +v.toFixed(12) || 0), [0, 2, 0, -2]);
});

for (const n of [2, 4, 8, 16, 64, 256, 1024]) {
  test(`基数 2: 長さ ${n} の複素数入力で素朴な DFT と一致する`, () => {
    const re = rand(n, n), im = rand(n, n + 7);
    const want = dftNaive(re, im);
    const f = createRadix2(n);
    const r = Float64Array.from(re), i = Float64Array.from(im);
    f.forward(r, i);
    assert.ok(maxDiff(r, want.re) < 1e-9 * n, `re の差 ${maxDiff(r, want.re)}`);
    assert.ok(maxDiff(i, want.im) < 1e-9 * n, `im の差 ${maxDiff(i, want.im)}`);
  });
}

for (const n of [4, 8, 16, 32, 64, 128, 512, 2048, 4096]) {
  test(`実数入力の速い版: 長さ ${n} で素朴な DFT の前半 n/2+1 本と一致する`, () => {
    const x = rand(n, n * 3);
    const want = dftNaive(x, new Float64Array(n));
    const f = createRealFFT(n);
    const re = new Float64Array(n / 2 + 1), im = new Float64Array(n / 2 + 1);
    f.forward(x, re, im);
    assert.ok(maxDiff(re, want.re, n / 2 + 1) < 1e-9 * n, `re の差 ${maxDiff(re, want.re, n / 2 + 1)}`);
    assert.ok(maxDiff(im, want.im, n / 2 + 1) < 1e-9 * n, `im の差 ${maxDiff(im, want.im, n / 2 + 1)}`);
  });
}

test('実数入力の速い版: 入力の配列を書き換えない', () => {
  const x = rand(64, 5), copy = Float64Array.from(x);
  createRealFFT(64).forward(x, new Float64Array(33), new Float64Array(33));
  assert.deepEqual(x, copy);
});

test('基数 2 で実数入力を扱う関数: 速い版と同じ n/2+1 本を返す', () => {
  const n = 1024, x = rand(n, 9);
  const a = { re: new Float64Array(n / 2 + 1), im: new Float64Array(n / 2 + 1) };
  const b = { re: new Float64Array(n / 2 + 1), im: new Float64Array(n / 2 + 1) };
  createRealFFT(n).forward(x, a.re, a.im);
  rfftRadix2(createRadix2(n), x, b.re, b.im);
  assert.ok(maxDiff(a.re, b.re) < 1e-9 && maxDiff(a.im, b.im) < 1e-9);
});

test('長さが 2 のべきでないと断る', () => {
  assert.throws(() => createRadix2(12), /2 のべき/);
  assert.throws(() => createRealFFT(6), /2 のべき/);
});

test('正規化したウォルシュ・アダマール変換: 長さ 4 の手計算と一致し、2 回でもとに戻る', () => {
  const x = Float64Array.of(1, 2, 3, 4);
  fwht(x);
  // H4 / 2 · [1,2,3,4] = [10, -2, -4, 0] / 2
  assert.deepEqual([...x].map((v) => +v.toFixed(12) || 0), [5, -1, -2, 0]);
  fwht(x);
  assert.deepEqual([...x].map((v) => +v.toFixed(12)), [1, 2, 3, 4]);
});

test('ウォルシュ・アダマール変換: 素朴な定義 (−1)^{popcount(i&k)} / √N と一致する', () => {
  const n = 64, x = rand(n, 11), y = Float64Array.from(x);
  fwht(y);
  const pc = (v) => { let c = 0; while (v) { v &= v - 1; c++; } return c; };
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += (pc(i & k) & 1 ? -1 : 1) * x[i];
    assert.ok(Math.abs(s / Math.sqrt(n) - y[k]) < 1e-12);
  }
});
