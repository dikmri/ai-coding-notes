// 3D のデータを小さな整数に詰める計算（tools/lib/meshpack.mjs）を確かめる。詰めて戻したときの誤差が、決めた幅に収まること
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../tools/lib/meshpack.mjs';

const rand = (n, lo, hi) => Float32Array.from({ length: n }, () => lo + Math.random() * (hi - lo));

test('位置: 箱の大きさの 1/65535 の半分より細かい誤差で戻る', () => {
  const p = rand(3 * 500, -0.8, 1.7);
  const { q, min, max } = M.quantizePositions(p);
  assert.ok(q instanceof Uint16Array && q.length === p.length);
  const back = M.dequantizePositions(q, min, max);
  for (let i = 0; i < p.length; i++) {
    const step = (max[i % 3] - min[i % 3]) / 65535;
    assert.ok(Math.abs(back[i] - p[i]) <= step / 2 + 1e-6, `${i}: ${p[i]} → ${back[i]}`);
  }
});

test('位置: 箱の幅が 0 の軸があっても壊れない', () => {
  const p = Float32Array.from([0, 1, 2, 0, 3, 2]);
  const { q, min, max } = M.quantizePositions(p);
  assert.deepEqual([...M.dequantizePositions(q, min, max)], [0, 1, 2, 0, 3, 2]);
});

test('法線: 2 バイトに詰めて戻すと、向きの誤差が 1.5 度より小さい', () => {
  const n = new Float32Array(3 * 2000);
  for (let i = 0; i < 2000; i++) {
    const v = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1];
    const l = Math.hypot(...v) || 1; n.set(v.map((x) => x / l), i * 3);
  }
  n.set([0, 0, -1, 0, 0, 1, 1, 0, 0], 0);   // 真下・真上・真横も含める
  const e = M.octEncode(n);
  assert.ok(e instanceof Int8Array && e.length === 2 * 2000);
  const d = M.octDecode(e);
  for (let i = 0; i < 2000; i++) {
    const dot = n[i * 3] * d[i * 3] + n[i * 3 + 1] * d[i * 3 + 1] + n[i * 3 + 2] * d[i * 3 + 2];
    assert.ok(Math.acos(Math.min(1, dot)) * 180 / Math.PI < 1.5, `${i}: dot ${dot}`);
  }
});

test('UV: 範囲の 1/65535 の半分より細かい誤差で戻る（0〜1 の外の値も扱える）', () => {
  const uv = rand(2 * 300, -0.2, 1.3);
  const { q, min, max } = M.quantizeUV(uv);
  const back = M.dequantizeUV(q, min, max);
  for (let i = 0; i < uv.length; i++) assert.ok(Math.abs(back[i] - uv[i]) <= (max[i % 2] - min[i % 2]) / 65535 / 2 + 1e-6);
});

test('骨の重み: 1 頂点の 4 つの合計がちょうど 255 になり、いちばん重かった骨は詰めたあとも最大（同点を含む）', () => {
  const w = Float32Array.from([0.7, 0.2, 0.1, 0, 0.333, 0.333, 0.334, 0, 1, 0, 0, 0, 0.5, 0.25, 0.125, 0.125]);
  const b = M.packWeights(w);
  for (let v = 0; v < 4; v++) {
    const s = b[v * 4] + b[v * 4 + 1] + b[v * 4 + 2] + b[v * 4 + 3];
    assert.equal(s, 255, `頂点 ${v}`);
    const big = [0, 1, 2, 3].reduce((a, k) => (w[v * 4 + k] > w[v * 4 + a] ? k : a), 0);
    assert.equal(b[v * 4 + big], Math.max(b[v * 4], b[v * 4 + 1], b[v * 4 + 2], b[v * 4 + 3]));
  }
  assert.equal(b[3], 0);
});

test('骨の重み: 合計が 0 の頂点は、最初の骨に全部を割り当てる', () => {
  assert.deepEqual([...M.packWeights(new Float32Array(4))], [255, 0, 0, 0]);
});

test('表情の差分: 小さな動きの頂点は省き、残りは尺度の半分より細かい誤差で戻る', () => {
  const d = new Float32Array(3 * 1000);
  for (let i = 0; i < 1000; i += 7) d.set([0.01 * Math.random(), -0.004, 0.002], i * 3);
  d[3 * 3] = 1e-7;   // ほぼ動かない頂点
  const m = M.packMorph(d, 1e-5);
  assert.ok(m.idx.length < 1000 / 7 + 2);
  assert.ok(!m.idx.includes(3));
  const back = M.unpackMorph(m, 1000);
  for (let i = 0; i < d.length; i++) {
    const near = Math.abs(d[i]) < 1e-5 && !m.idx.includes(Math.floor(i / 3));
    if (!near) assert.ok(Math.abs(back[i] - d[i]) <= m.scale / 2 + 1e-9, `${i}: ${d[i]} → ${back[i]}`);
  }
});

test('まとめる: どの配列も 4 バイトの境目から始まり、取り出すと元と同じ', () => {
  const pk = new M.Pack();
  const a = Uint8Array.from([1, 2, 3]), b = Int16Array.from([-5, 7, 9]), c = Float32Array.from([1.5, -2.25]);
  const ra = pk.add(a), rb = pk.add(b), rc = pk.add(c);
  for (const r of [ra, rb, rc]) assert.equal(r.o % 4, 0);
  const bytes = pk.bytes();
  assert.deepEqual([...M.view(bytes, ra)], [1, 2, 3]);
  assert.deepEqual([...M.view(bytes, rb)], [-5, 7, 9]);
  assert.deepEqual([...M.view(bytes, rc)], [1.5, -2.25]);
});

test('base64: 文字列にして戻すと、元のバイト列と同じ', () => {
  const u = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37) & 255);
  assert.deepEqual([...M.fromBase64(M.toBase64(u))], [...u]);
});
