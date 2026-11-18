import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const catalog = vm.createContext({});
catalog.window = catalog;
vm.runInContext(file('js/registry.js'), catalog);
const scripts = [...file('index.html').matchAll(/<script src="(entries\/[^"]+)"/g)].map((match) => match[1]);
assert.ok(scripts.includes('entries/astra.js'));
for (const script of scripts) vm.runInContext(file(script), catalog, { filename: script });

function core(id, names) {
  const entry = catalog.dekiru.byId.get('astra-' + id);
  assert.ok(entry, id);
  return vm.runInNewContext(catalog.dekiru.src(entry.core) + '\n;({' + names + '})');
}
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, a + ' ≠ ' + b);

test('山折り地図は、平らなときも折ったときも、辺と対角線の長さを保つ', () => {
  const { crease } = core('fold-map', 'crease');
  const distance = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));
  for (const angle of [0, 21, 42, 63]) {
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const a = crease(i, j, angle);
        near(distance(a, crease(i + 1, j, angle)), 1);
        near(distance(a, crease(i, j + 1, angle)), 1);
        near(distance(a, crease(i + 1, j + 1, angle)), distance(crease(i, j, 0), crease(i + 1, j + 1, 0)));
      }
  }
  assert.ok(crease(10, 0, 63)[0] < crease(10, 0, 0)[0]);
  assert.ok(crease(0, 6, 63)[1] < crease(0, 6, 0)[1]);
});

test('キツネの縞はどの位置でも六列で全コマを一巡し、歩幅も一巡して戻る', () => {
  const { frameAt, stride } = core('striped-fox', 'frameAt, stride');
  for (let phase = 0; phase < 6; phase++) {
    const visible = Array.from({ length: 36 }, (_, i) => i - 12).filter((i) => frameAt(i) === phase);
    assert.deepEqual(
      visible,
      [-12, -6, 0, 6, 12, 18].map((start) => start + phase)
    );
    assert.deepEqual(stride(phase), stride(phase + 6));
  }
  assert.equal(new Set(Array.from({ length: 6 }, (_, i) => JSON.stringify(stride(i)))).size, 6);
  near(stride(0).front, -stride(3).front);
});

test('検札機は各一ビット誤りを検出し、交点を反転すると元の切符に戻る', () => {
  const { encodeTicket, inspectTicket } = core('parity-ticket', 'encodeTicket, inspectTicket');
  const card = encodeTicket([
    [0, 1, 1, 0],
    [1, 0, 1, 0],
    [1, 1, 0, 1],
    [0, 1, 1, 1],
  ]);
  assert.deepEqual([...inspectTicket(card)], [-1, -1]);
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const copy = card.map((row) => row.slice());
      copy[r][c] ^= 1;
      const [row, col] = inspectTicket(copy);
      assert.deepEqual([row, col], [r, c]);
      copy[row][col] ^= 1;
      assert.deepEqual(copy, card);
    }
});

test('断層撮影では円の中央を通る影が直径に等しく、十分な方向から円盤の密度を復元できる', () => {
  const { raySum, rampFilter, reconstruct } = core('shadow-scan', 'raySum, rampFilter, reconstruct');
  const shape = [[0.24, -0.12, 0.28, 0.8]];
  near(raySum(shape, 0, 0.24), 2 * 0.28 * 0.8);
  near(raySum(shape, Math.PI / 2, -0.12), 2 * 0.28 * 0.8);
  assert.equal(raySum(shape, 0, -0.6), 0);
  const impulse = rampFilter([0, 0, 1, 0, 0], 1);
  near(impulse[2], 0.25);
  near(impulse[1], -1 / Math.PI ** 2);
  const error = (count) => {
    const n = 65,
      mid = (n - 1) / 2,
      { values } = reconstruct(shape, count, n);
    let sum = 0;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const r = Math.hypot(x / mid - 1 - 0.24, y / mid - 1 + 0.12);
        if (Math.abs(r - 0.28) > 0.06) sum += (values[y * n + x] - (r < 0.28 ? 0.8 : 0)) ** 2;
      }
    return sum;
  };
  assert.ok(error(48) < error(3) * 0.15);
  near(reconstruct([[0, 0, 0.4, 1]], 48, 65).values[32 * 65 + 32], 1, 0.08);
});

test('結び目は閉じており、上下を入れ替えると同じ交点を逆向きに刷る', () => {
  const { knot, crossing, overpasses } = core('knot-print', 'knot, crossing, overpasses');
  const segs = [
    [-1, 0, 2],
    [1, 0, 2],
    [0, -1, -1],
    [0, 1, 1],
  ];
  const hit = crossing(...segs);
  near(hit.s, 0.5);
  near(hit.t, 0.5);
  assert.equal(hit.firstAbove, true);
  assert.equal(crossing(...segs.slice(2), ...segs.slice(0, 2)).firstAbove, false);
  assert.equal(crossing([0, 0, 0], [2, 0, 0], [0, 1, 1], [2, 1, 1]), null);
  for (const wraps of [3, 5]) {
    knot(0, wraps, 11).forEach((v, k) => near(v, knot(2 * Math.PI, wraps, 11)[k]));
    const points = Array.from({ length: 180 }, (_, i) => knot(((i + 0.173) * Math.PI) / 90, wraps, 0));
    assert.equal(overpasses(points).length, wraps);
  }
});

test('石橋の鎖は端で高さゼロになり、等間隔の弧長で切ると全長と左右対称を保つ', () => {
  const { linkPoint } = core('chain-arch', 'linkPoint');
  for (const total of [104, 124, 136]) {
    const point = (t) => linkPoint(100, total, t);
    near(point(0).x, -50);
    near(point(1).x, 50);
    near(point(0).sag, 0);
    near(point(1).sag, 0);
    near(point(0.25).sag, point(0.75).sag);
    let prev = point(0);
    for (let i = 1; i <= 200; i++) {
      const next = point(i / 200);
      near(Math.hypot(next.x - prev.x, next.sag - prev.sag), total / 200, 0.00002);
      near(Math.hypot(next.nx, next.ny), 1);
      prev = next;
    }
  }
  assert.ok(linkPoint(100, 136, 0.5).sag > linkPoint(100, 104, 0.5).sag);
});

test('天秤は九通りのどの真珠でも二度で特定でき、不ぞろいな皿では量れない', () => {
  const { weighPearls, movePearl } = core('pearl-balance', 'weighPearls, movePearl');
  const placement = [1, 1, 1, 2, 2, 2, 0, 0, 0];
  for (let light = 0; light < 9; light++) {
    const first = weighPearls(placement, light);
    const start = first < 0 ? 0 : first > 0 ? 3 : 6;
    const next = Array(9).fill(0);
    next[start] = 1;
    next[start + 1] = 2;
    const second = weighPearls(next, light);
    assert.equal(start + (second < 0 ? 0 : second > 0 ? 1 : 2), light);
  }
  assert.equal(weighPearls(Array(9).fill(0), 0), null);
  assert.equal(weighPearls([1, 1, 0, 0, 0, 0, 0, 0, 2], 3), null);
  assert.deepEqual([movePearl(0), movePearl(1), movePearl(2)], [1, 2, 0]);
});

test('活版帖を中綴じすると表紙から裏表紙まで一度ずつページが現れる', () => {
  const { impose } = core('type-folio', 'impose');
  for (const pages of [16, 24]) {
    const early = [],
      late = [];
    for (let sheet = 1; sheet <= pages / 4; sheet++) {
      const [last, first] = impose(pages, sheet, false);
      const [second, penultimate] = impose(pages, sheet, true);
      early.push(first, second);
      late.unshift(penultimate, last);
    }
    assert.deepEqual(
      [...early, ...late],
      Array.from({ length: pages }, (_, i) => i + 1)
    );
  }
});

test('干潟は水面より低くても峠が閉じていれば乾き、斜めだけでは海につながらない', () => {
  const { inundate, opening, terrain } = core('tidal-pass', 'inundate, opening, terrain');
  const heights = [0, 0.8, 0, 1, 0.5, 0.1, 1, 1, 1];
  assert.equal(inundate(heights, 3, 3, 0.51)[5], 0);
  heights[3] = 0.4;
  assert.equal(opening(heights, 3, 3, 5), 50);
  assert.equal(inundate(heights, 3, 3, 0.49)[5], 0);
  assert.equal(inundate(heights, 3, 3, 0.5)[5], 1);
  const w = 156,
    h = 92,
    land = terrain(w, h),
    basin = Math.floor(0.49 * h) * w + Math.floor(0.62 * w);
  const sill = opening(land, w, h, basin);
  assert.ok(sill > 42 && sill < 78);
  assert.ok(land[basin] < (sill - 1) / 100);
  assert.equal(inundate(land, w, h, (sill - 1) / 100)[basin], 0);
  assert.equal(inundate(land, w, h, sill / 100)[basin], 1);
});

test('直交偏光で結晶軸が平行になると消光し、光路差半波長で特定の色が最大になる', () => {
  const { transmission, crystalColor } = core('polar-section', 'transmission, crystalColor');
  for (const wavelength of [455, 535, 650]) {
    near(transmission(18, -18, wavelength / 2, wavelength), 0);
    near(transmission(18, 72, wavelength / 2, wavelength), 0);
    near(transmission(0, 45, wavelength / 2, wavelength), 1);
    near(transmission(0, 45, wavelength, wavelength), 0);
  }
  assert.deepEqual([...crystalColor(0, 12, 0, 0.015)], [12, 12, 12]);
  assert.notDeepEqual(crystalColor(20, 15, 25, 0.017), crystalColor(20, 15, 42, 0.017));
});
