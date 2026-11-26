// reports/riemann/js/math.mjs の計算を、知られている値と比べて確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primeCountsAt, li, zeta, zetaAbs, schoenfeldBound, ZETA_ZEROS } from '../reports/riemann/js/math.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} と ${b} の差が ${tol} を超える`);

test('素数の個数 π(x) が表の値と一致する', () => {
  const xs = [1, 2, 10, 100, 1000, 10000, 1e6, 1e7];
  assert.deepEqual([...primeCountsAt(xs)], [0, 1, 4, 25, 168, 1229, 78498, 664579]);
});

test('素数の個数: 素数ちょうどの所と、その 1 つ手前で 1 つ違う', () => {
  assert.deepEqual([...primeCountsAt([96, 97, 98])], [24, 25, 25]);
});

test('素数の個数: 並び順どおりでない x を渡すと断る', () => {
  assert.throws(() => primeCountsAt([10, 5]));
});

test('対数積分 li(x) が知られている値と一致する', () => {
  near(li(2), 1.045163780117493, 1e-9, 'li(2)');
  near(li(1e6), 78627.54915946, 1e-4, 'li(10^6)');
  near(li(1e7), 664918.40504654, 1e-3, 'li(10^7)');
});

test('Schoenfeld の幅 √x·log x / 8π', () => {
  near(schoenfeldBound(1e6), Math.sqrt(1e6) * Math.log(1e6) / (8 * Math.PI), 1e-9);
});

test('ゼータ関数: 実数の点での値', () => {
  const [a] = zeta(2, 0);
  near(a, Math.PI ** 2 / 6, 1e-12, 'ζ(2)');
  near(zeta(3, 0)[0], 1.2020569031595942, 1e-12, 'ζ(3)');
  near(zeta(0, 0)[0], -0.5, 1e-12, 'ζ(0)');
  near(zeta(-1, 0)[0], -1 / 12, 1e-12, 'ζ(-1)');
  near(zeta(0.5, 0)[0], -1.4603545088095868, 1e-12, 'ζ(1/2)');
});

test('ゼータ関数: 自明な零点 −2・−4 で 0 になる', () => {
  // 足す項が 10⁵ 程度の大きさになるので、倍精度の丸めの分（10⁻¹¹ 程度）は許す
  near(zetaAbs(-2, 0), 0, 1e-9, 'ζ(-2)');
  near(zetaAbs(-4, 0), 0, 1e-9, 'ζ(-4)');
  assert.ok(zetaAbs(-3, 0) > 0.008, 'ζ(-3) = 1/120 は 0 でない');
});

test('ゼータ関数: s = 1 は極なので有限の値を返さない', () => {
  assert.ok(!Number.isFinite(zetaAbs(1, 0)));
});

test('ゼータ関数: 虚部のある点の値（ζ(2+3i) を 10⁶ 項の直接の和で求めた値と比べる）', () => {
  // 0.7980219851463 − 0.1137443080529i は Σ_{n≤10⁶} n^(−s) + N^(1−s)/(s−1) − N^(−s)/2 で求めた（10⁵ 項でも同じ 13 桁）
  const [re, im] = zeta(2, 3);
  near(re, 0.7980219851463, 1e-12, '実部');
  near(im, -0.1137443080529, 1e-12, '虚部');
});

test('ゼータ関数: 最初の 10 個の零点で 0 になり、線から外れると 0 にならない', () => {
  assert.equal(ZETA_ZEROS.length, 10);
  for (const t of ZETA_ZEROS) {
    near(zetaAbs(0.5, t), 0, 1e-9, `1/2 + ${t}i`);
    assert.ok(zetaAbs(0.6, t) > 0.01, `0.6 + ${t}i で 0 に近すぎる`);
    assert.ok(zetaAbs(0.4, t) > 0.01, `0.4 + ${t}i で 0 に近すぎる`);
  }
});

test('ゼータ関数: 共役の点では共役の値になる（ζ(s̄) = ζ(s) の共役）', () => {
  const [a, b] = zeta(0.3, 20);
  const [c, d] = zeta(0.3, -20);
  near(a, c, 1e-12, '実部');
  near(b, -d, 1e-12, '虚部');
});
