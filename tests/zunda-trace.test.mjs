// 絵を曲線に写す計算（tools/lib/vectorize.mjs）を確かめる。
// ずんだもんの三面図の正面を写す道具（tools/zunda-trace.mjs）と、見比べる道具（tools/zunda-compare.mjs）が使う。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../tools/lib/vectorize.mjs';

// ---- 範囲の検出 ----
test('範囲: 列ごとの数から、空白で区切られた塊を左から順に返す', () => {
  const c = new Array(100).fill(0);
  for (let x = 5; x < 25; x++) c[x] = 10;
  for (let x = 40; x < 70; x++) c[x] = 30;
  for (let x = 80; x < 95; x++) c[x] = 5;
  assert.deepEqual(V.findRuns(c, { minWidth: 5 }), [[5, 24], [40, 69], [80, 94]]);
});

test('範囲: 細い空白はつなぎ、小さな点（ごみ）は捨てる', () => {
  const c = new Array(100).fill(0);
  for (let x = 10; x < 30; x++) c[x] = 8;
  c[31] = 0; for (let x = 32; x < 50; x++) c[x] = 8; // 2 列の空白 → つなぐ
  c[70] = 3; // 1 列だけの点 → 捨てる
  assert.deepEqual(V.findRuns(c, { gap: 3, minWidth: 5 }), [[10, 49]]);
});

test('範囲: 3 体並んだうちの真ん中（正面）を選ぶ。幅の狭いごみの塊があっても、大きい 3 つから選ぶ', () => {
  assert.deepEqual(V.middleRun([[0, 2], [10, 300], [320, 900], [930, 1400]]), [320, 900]);
  assert.deepEqual(V.middleRun([[10, 300], [320, 900], [905, 910], [930, 1400]]), [320, 900]);
});

// ---- 色 ----
test('色: sRGB を Lab にする（白・黒・赤の既知の値）', () => {
  const near = (a, b, e = 0.05) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < e, `${a} と ${b}`));
  near(V.rgbToLab(255, 255, 255), [100, 0, 0]);
  near(V.rgbToLab(0, 0, 0), [0, 0, 0]);
  near(V.rgbToLab(255, 0, 0), [53.24, 80.09, 67.2], 0.1);
});

test('色: k-means は、離れた 3 つの群の中心を見つけ、同じ種から同じ結果を出す', () => {
  const pts = [], blobs = [[90, 0, 0], [50, -40, 40], [60, 50, -20]];
  let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  for (const b of blobs) for (let i = 0; i < 200; i++) pts.push(b[0] + rnd() * 4, b[1] + rnd() * 4, b[2] + rnd() * 4);
  const data = Float32Array.from(pts);
  const r1 = V.kmeans(data, 3, { seed: 7 }), r2 = V.kmeans(data, 3, { seed: 7 });
  assert.deepEqual([...r1.labels], [...r2.labels]);
  for (const b of blobs) {
    const best = Math.min(...r1.centers.map((c) => Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2])));
    assert.ok(best < 1, `群 ${b} の中心が見つからない（${best}）`);
  }
  assert.deepEqual([...r1.counts].sort(), [200, 200, 200]);
});

test('色: 近い中心は数で重みを付けて 1 つにまとめ、遠い中心は残す', () => {
  const r = V.mergeCenters([[50, 0, 0], [52, 0, 0], [80, 0, 0]], [300, 100, 50], 5);
  assert.equal(r.centers.length, 2);
  assert.deepEqual(r.counts, [400, 50]);
  assert.ok(Math.abs(r.centers[0][0] - 50.5) < 1e-9);
});

test('線の濃さ: 塗りの色と線の色の間のどこにあるか（0 は塗り、1 は線）', () => {
  const F = [250, 250, 250], L = [30, 30, 30];
  assert.equal(V.inkAlpha(F, F, L), 0);
  assert.equal(V.inkAlpha(L, F, L), 1);
  const mix = F.map((f, i) => 0.3 * L[i] + 0.7 * f);
  assert.ok(Math.abs(V.inkAlpha(mix, F, L) - 0.3) < 1e-9);
  assert.equal(V.inkAlpha([255, 255, 255], F, L), 0); // 塗りより明るい → 0 に切る
  assert.equal(V.inkAlpha([0, 0, 0], F, L), 1); // 線より暗い → 1 に切る
});

// ---- 画素の計算 ----
test('ぼかし: 平らな所は平らなまま、合計は変わらない', () => {
  const w = 20, h = 15, f = new Float32Array(w * h).fill(0.5);
  const g = V.blur(f, w, h, 1.2);
  assert.ok(g.every((v) => Math.abs(v - 0.5) < 1e-5));
  const dot = new Float32Array(w * h); dot[7 * w + 10] = 1;
  const gd = V.blur(dot, w, h, 1);
  assert.ok(Math.abs(gd.reduce((a, b) => a + b, 0) - 1) < 1e-4);
  assert.ok(gd[7 * w + 10] < 1 && gd[7 * w + 11] > 0);
});

test('塗りを広げる: 色の決まらない画素（-1）は、いちばん近い決まった画素の色になる', () => {
  const w = 9, h = 1, lab = new Int32Array([1, -1, -1, -1, -1, -1, -1, -1, 2]);
  const out = V.propagate(lab, w, h);
  assert.deepEqual([...out.slice(0, 4)], [1, 1, 1, 1]);
  assert.deepEqual([...out.slice(5)], [2, 2, 2, 2]);
  assert.ok(out[4] === 1 || out[4] === 2);
});

test('塗りを広げる: 2 次元でも、近い方の色になる（斜めの距離も数える）', () => {
  const w = 7, h = 7, lab = new Int32Array(w * h).fill(-1);
  lab[0] = 3; lab[w * h - 1] = 4;
  const out = V.propagate(lab, w, h);
  assert.equal(out[1 * w + 1], 3); assert.equal(out[5 * w + 5], 4);
  assert.ok([...out].every((v) => v === 3 || v === 4));
});

test('多角形: 点が中にあるか', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(V.pointInPolygon(5, 5, sq), true);
  assert.equal(V.pointInPolygon(15, 5, sq), false);
  const L = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 10], [0, 10]];
  assert.equal(V.pointInPolygon(6, 6, L), false);
  assert.equal(V.pointInPolygon(1, 6, L), true);
});

// ---- 等値線 ----
const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const block = (w, h, x0, y0, x1, y1, v = 1, f = new Float32Array(w * h)) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f[y * w + x] = v; return f; };

test('等値線: 0 と 1 の正方形の塊は、閉じた 1 本の線になり、面積は k×k − 0.5（角が斜めに切れる）', () => {
  const w = 12, h = 10, f = block(w, h, 3, 2, 7, 6);
  const cs = V.marchingSquares(f, w, h, 0.5);
  assert.equal(cs.length, 1);
  assert.ok(Math.abs(area(cs[0]) - (25 - 0.5)) < 1e-9, `面積 ${area(cs[0])}`);
});

test('等値線: 外側の線と穴の線は、向きが逆（面積の符号が逆）', () => {
  const w = 14, h = 14, f = block(w, h, 2, 2, 11, 11);
  block(w, h, 5, 5, 8, 8, 0, f);
  const cs = V.marchingSquares(f, w, h, 0.5);
  assert.equal(cs.length, 2);
  const as = cs.map(area).sort((a, b) => a - b);
  assert.ok(as[0] < 0 && as[1] > 0);
  assert.ok(Math.abs(as[1] - (100 - 0.5)) < 1e-9);
  assert.ok(Math.abs(-as[0] - (16 - 0.5)) < 1e-9, `穴の面積 ${as[0]}`); // 穴も 4×4 の角が斜めに切れる
});

test('等値線: 画素より細かく位置を出す（傾きの場所を線形に補う）', () => {
  const w = 12, h = 6, f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = Math.min(1, x / 10);
  const cs = V.marchingSquares(f, w, h, 0.35);
  // 縦の部分の点は x = 3.5 に乗る
  const mid = cs[0].filter((p) => p[1] > 0.5 && p[1] < h - 1.5);
  assert.ok(mid.length > 0);
  assert.ok(mid.every((p) => Math.abs(p[0] - 3.5) < 1e-6 || p[0] > 10), JSON.stringify(mid.slice(0, 5))); // 値は Float32 なので 1e-6 まで
});

test('等値線: 枠に触れる塊も閉じる。斜めに接する 2 つの画素（鞍点）でも線が閉じる', () => {
  const w = 4, h = 4, f = new Float32Array(w * h);
  f[0] = 1; f[5] = 1; // (0,0) と (1,1) が斜めに接する
  const cs = V.marchingSquares(f, w, h, 0.5);
  for (const c of cs) {
    assert.ok(c.length >= 3);
    assert.ok(area(c) > 0);
  }
  const total = cs.reduce((a, c) => a + area(c), 0);
  assert.ok(total > 0.9 && total < 2.1, `面積 ${total}`);
});

// ---- 点の間引き ----
test('間引き: 直線の上の点は両端だけ残す。正方形は 4 つの角だけ残す', () => {
  const line = Array.from({ length: 11 }, (_, i) => [i, 0.01 * (i % 2)]);
  assert.deepEqual(V.simplifyOpen(line, 0.1).map((p) => p[0]), [0, 10]);
  const sq = [];
  for (let i = 0; i < 10; i++) sq.push([i, 0]);
  for (let i = 0; i < 10; i++) sq.push([10, i]);
  for (let i = 0; i < 10; i++) sq.push([10 - i, 10]);
  for (let i = 0; i < 10; i++) sq.push([0, 10 - i]);
  const s = V.simplifyClosed(sq, 0.1);
  assert.equal(s.length, 4);
});

// ---- ベジェの当てはめ ----
const bez = (b, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * b[0][k] + 3 * u * u * t * b[1][k] + 3 * u * t * t * b[2][k] + t * t * t * b[3][k]); };
// 点から曲線（細かく区切った折れ線）までの距離の最大
function maxDist(points, curves) {
  const poly = [];
  for (const b of curves) for (let i = 0; i <= 256; i++) poly.push(bez(b, i / 256)); // 細かく区切り、折れ線と曲線の差（0.001 画素ほど）を小さくする
  let worst = 0;
  for (const p of points) {
    let best = Infinity;
    for (let i = 0; i + 1 < poly.length; i++) {
      const a = poly[i], c = poly[i + 1], dx = c[0] - a[0], dy = c[1] - a[1], L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
      best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const unit = (v) => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };

test('ベジェ: 1 本の 3 次ベジェの上の点からは、1 本で元の曲線を当てる', () => {
  const B = [[0, 0], [30, 60], [70, -20], [100, 40]];
  const pts = Array.from({ length: 60 }, (_, i) => bez(B, i / 59));
  const cs = V.fitCurve(pts, 0.5);
  assert.equal(cs.length, 1);
  assert.ok(maxDist(pts, cs) < 0.5);
});

test('ベジェ: 半円は数本に分け、どの点も許す誤差の中に入り、つなぎ目はなめらか（接線がそろう）', () => {
  const pts = Array.from({ length: 200 }, (_, i) => { const a = Math.PI * i / 199; return [100 * Math.cos(a), 100 * Math.sin(a)]; });
  const cs = V.fitCurve(pts, 0.5);
  assert.ok(cs.length >= 2 && cs.length <= 6, `本数 ${cs.length}`);
  assert.ok(maxDist(pts, cs) < 0.5);
  for (let i = 0; i + 1 < cs.length; i++) {
    assert.deepEqual(cs[i][3], cs[i + 1][0]);
    const t1 = unit([cs[i][3][0] - cs[i][2][0], cs[i][3][1] - cs[i][2][1]]), t2 = unit([cs[i + 1][1][0] - cs[i + 1][0][0], cs[i + 1][1][1] - cs[i + 1][0][1]]);
    assert.ok(Math.abs(cross(t1, t2)) < 1e-6 && t1[0] * t2[0] + t1[1] * t2[1] > 0);
  }
});

test('ベジェ（閉じた線）: 円は数本の曲線になり、1 周どこでもなめらか', () => {
  const pts = Array.from({ length: 300 }, (_, i) => { const a = 2 * Math.PI * i / 300; return [200 + 80 * Math.cos(a), 150 + 80 * Math.sin(a)]; });
  const cs = V.fitClosed(pts, 0.5);
  assert.ok(cs.length >= 3 && cs.length <= 10, `本数 ${cs.length}`);
  assert.ok(maxDist(pts, cs) < 0.5);
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i], b = cs[(i + 1) % cs.length];
    assert.ok(Math.hypot(a[3][0] - b[0][0], a[3][1] - b[0][1]) < 1e-9, '閉じていない');
    const t1 = unit([a[3][0] - a[2][0], a[3][1] - a[2][1]]), t2 = unit([b[1][0] - b[0][0], b[1][1] - b[0][1]]);
    assert.ok(Math.abs(cross(t1, t2)) < 1e-3, `つなぎ目 ${i} で折れる`);
  }
});

test('ベジェ（閉じた線）: 正方形の角は角のまま残す（丸めない）', () => {
  const sq = [];
  for (let i = 0; i < 40; i++) sq.push([i, 0]);
  for (let i = 0; i < 40; i++) sq.push([40, i]);
  for (let i = 0; i < 40; i++) sq.push([40 - i, 40]);
  for (let i = 0; i < 40; i++) sq.push([0, 40 - i]);
  const cs = V.fitClosed(sq, 0.5);
  assert.ok(maxDist(sq, cs) < 0.5);
  const ends = cs.map((b) => b[0]);
  for (const c of [[0, 0], [40, 0], [40, 40], [0, 40]]) assert.ok(ends.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 1e-9), `角 ${c} がない`);
});

test('ベジェ（閉じた線）: とがった先（筆の入り抜き）も角として残す', () => {
  // 細長い葉の形: 両端がとがる
  const pts = [];
  for (let i = 0; i <= 50; i++) { const t = i / 50; pts.push([100 * t, 8 * Math.sin(Math.PI * t)]); }
  for (let i = 49; i >= 1; i--) { const t = i / 50; pts.push([100 * t, -8 * Math.sin(Math.PI * t)]); }
  const cs = V.fitClosed(pts, 0.3);
  assert.ok(maxDist(pts, cs) < 0.3);
  const ends = cs.map((b) => b[0]);
  for (const c of [[0, 0], [100, 0]]) assert.ok(ends.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 1e-6), `先 ${c} が丸まった`);
});

// ---- SVG の path の文字 ----
// テスト用: 相対の c と M・z だけの path を読み、絶対の座標の並びにする
function parsePath(d) {
  const toks = d.match(/[MmCcZzLl]|-?(?:\d+\.?\d*|\.\d+)/g);
  const out = []; let cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, nums = [];
  const flush = () => {
    if (cmd === 'M') { cx = nums[0]; cy = nums[1]; sx = cx; sy = cy; out.push(['M', cx, cy]); }
    else if (cmd === 'c') for (let i = 0; i + 5 < nums.length; i += 6) { const p = [cx + nums[i], cy + nums[i + 1], cx + nums[i + 2], cy + nums[i + 3], cx + nums[i + 4], cy + nums[i + 5]]; out.push(['C', ...p]); cx = p[4]; cy = p[5]; }
    nums = [];
  };
  for (const t of toks) {
    if (/[A-Za-z]/.test(t)) { flush(); cmd = t; if (t === 'z' || t === 'Z') { out.push(['z']); cx = sx; cy = sy; } }
    else nums.push(parseFloat(t));
  }
  flush();
  return out;
}

test('path: 0.1 画素に丸め、相対の座標で短く書く。何本続いても位置がずれない', () => {
  const curves = [];
  let p = [10.04, 20.06];
  for (let i = 0; i < 50; i++) { const q = [p[0] + 1.234, p[1] - 0.987]; curves.push([p, [p[0] + 0.41, p[1] + 0.33], [q[0] - 0.27, q[1] + 0.71], q]); p = q; }
  const d = V.pathData([curves]);
  assert.ok(d.startsWith('M10 20.1'), d.slice(0, 20));
  assert.ok(!/\d\.\d\d/.test(d), '小数が 2 桁ある');
  const cmds = parsePath(d).filter((c) => c[0] === 'C');
  assert.equal(cmds.length, 50);
  for (let i = 0; i < 50; i++) {
    const want = curves[i][3];
    assert.ok(Math.abs(cmds[i][5] - want[0]) <= 0.05 + 1e-9 && Math.abs(cmds[i][6] - want[1]) <= 0.05 + 1e-9, `${i}: ${cmds[i]} と ${want}`);
  }
});

test('path: 閉じた線ごとに M と z を書き、数の間の区切りを省ける所は省く', () => {
  const sq = (x, y) => [[[x, y], [x + 1, y], [x + 2, y], [x + 3, y]], [[x + 3, y], [x + 3, y + 1], [x + 3, y + 2], [x, y]]];
  const d = V.pathData([sq(0, 0), sq(10, 10)]);
  assert.equal((d.match(/M/g) || []).length, 2);
  assert.equal((d.match(/z/g) || []).length, 2);
  assert.ok(!d.includes(' -') && !d.includes(',-'), d);
  assert.ok(!/(^|[^\d])0\.\d/.test(d), '0.5 は .5 と書く: ' + d);
});

// ---- 見比べの数 ----
test('線の一致: 同じなら F1 は 1。1 画素ずれても許す。3 画素ずれると 0', () => {
  const w = 30, h = 20, a = new Uint8Array(w * h);
  for (let x = 5; x < 25; x++) a[10 * w + x] = 1;
  assert.equal(V.lineMatch(a, a, w, h).f1, 1);
  const b1 = new Uint8Array(w * h); for (let x = 5; x < 25; x++) b1[11 * w + x] = 1;
  assert.equal(V.lineMatch(a, b1, w, h).f1, 1);
  const b3 = new Uint8Array(w * h); for (let x = 5; x < 25; x++) b3[13 * w + x] = 1;
  assert.equal(V.lineMatch(a, b3, w, h).f1, 0);
});

test('線の一致: 写しに線が足りないと再現率が下がり、余分な線があると適合率が下がる', () => {
  const w = 40, h = 10, a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  for (let x = 0; x < 40; x++) a[5 * w + x] = 1;
  for (let x = 0; x < 20; x++) b[5 * w + x] = 1;
  const r = V.lineMatch(a, b, w, h);
  // 写しの端（x = 19）の隣の x = 20 は、ずれを許す範囲に入る
  assert.equal(r.precision, 1); assert.equal(r.recall, 21 / 40);
  const r2 = V.lineMatch(b, a, w, h);
  assert.equal(r2.precision, 21 / 40); assert.equal(r2.recall, 1);
});

test('外形: IoU は重なり ÷ 合わせた面積', () => {
  const w = 10, h = 10, a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  for (let i = 0; i < 50; i++) a[i] = 1;
  for (let i = 25; i < 75; i++) b[i] = 1;
  assert.equal(V.iou(a, b), 25 / 75);
  assert.equal(V.iou(a, a), 1);
});

test('塗りつぶし: 枠からたどると、閉じた輪の中には入らない。輪の中の種からはたどれる。斜めの 1 画素の切れ目は通らない', () => {
  const w = 12, h = 12, pass = new Uint8Array(w * h).fill(1);
  for (let i = 3; i <= 8; i++) { pass[3 * w + i] = 0; pass[8 * w + i] = 0; pass[i * w + 3] = 0; pass[i * w + 8] = 0; }
  const out = V.flood(pass, w, h, V.borderSeeds(w, h));
  assert.equal(out[0], 1); assert.equal(out[5 * w + 5], 0); assert.equal(out[3 * w + 3], 0);
  const inner = V.flood(pass, w, h, [5 * w + 5]);
  assert.equal(inner[5 * w + 5], 1); assert.equal(inner[0], 0);
  // 斜めの線: (x, x) を通れなくする。4 方向にしか進まないので、右上と左下はつながらない
  const p2 = new Uint8Array(w * h).fill(1); for (let i = 0; i < w; i++) p2[i * w + i] = 0;
  const o2 = V.flood(p2, w, h, [w - 1]);
  assert.equal(o2[w - 1], 1); assert.equal(o2[(h - 1) * w], 0);
});

// 閉じた折れ線 pts から、点 p までの距離
function distToRing(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length], dx = c[0] - a[0], dy = c[1] - a[1], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
  }
  return best;
}

test('ベジェ（閉じた線）: 点と点の間で、曲線が大きく飛び出さない（ゆれのある小さな形の等値線）', () => {
  // 乱数の値をぼかした場の等値線（本物の絵の等値線と同じく、小さく曲がりくねる）。種を決めてあるので毎回同じ形
  let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let worst = 0, where = '';
  for (let trial = 0; trial < 30; trial++) {
    const w = 40, h = 30, f = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) f[i] = rnd();
    const g = V.blur(V.blur(f, w, h, 1.5), w, h, 0.6);
    for (const c of V.marchingSquares(g, w, h, 0.5)) {
      const sc = V.simplifyClosed(c, 0.12);
      if (sc.length < 3) continue;
      for (const b of V.fitClosed(sc, 0.45, { reach: 2.5, cornerAngle: 70 })) {
        for (let i = 0; i <= 20; i++) { const d = distToRing(bez(b, i / 20), sc); if (d > worst) { worst = d; where = `試し ${trial}`; } }
      }
    }
  }
  assert.ok(worst <= 0.9, `曲線が点の並びから ${worst.toFixed(2)} 画素離れた（${where}）`);
});

test('線の山: 線を横切る向きの山の高さを返す。線に沿って濃さが変わっても、となりの濃い所の値を拾わない', () => {
  // 縦の線（x = 10）の濃さが、上から下へ 0.9 → 0.3 と薄くなる。断面はガウス（σ = 1）
  const w = 21, h = 40, f = new Float32Array(w * h);
  const amp = (y) => 0.9 - 0.6 * (y / (h - 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = amp(y) * Math.exp(-((x - 10) ** 2) / 2);
  const P = V.ridgePeak(f, w, h);
  for (const y of [5, 20, 34]) for (const x of [9, 10, 11]) {
    assert.ok(Math.abs(P[y * w + x] - amp(y)) < 0.03, `(${x}, ${y}) の山 ${P[y * w + x].toFixed(3)}、本当は ${amp(y).toFixed(3)}`);
  }
  // 斜めの線でも同じ
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = (x - y * 0.5 - 2) / Math.hypot(1, 0.5); g[y * w + x] = 0.6 * Math.exp(-(d * d) / 2); }
  const Q = V.ridgePeak(g, w, h);
  assert.ok(Math.abs(Q[20 * w + 12] - 0.6) < 0.04, `斜め: ${Q[20 * w + 12]}`);
});

test('塗りを広げる（線を越えにくく）: 境目は 2 つの種の真ん中ではなく、越えにくい所（線の山）に来る', () => {
  // 左の種は x = 0、右の種は x = 11。線（越えにくい所）は x = 3。まっすぐの距離なら境目は x = 5〜6 だが、線で止まる
  const w = 12, h = 5, lab = new Int32Array(w * h).fill(-1), cost = new Float32Array(w * h).fill(0.05);
  for (let y = 0; y < h; y++) { lab[y * w] = 1; lab[y * w + 11] = 2; cost[y * w + 3] = 3; }
  const out = V.propagateGeodesic(lab, cost, w, h);
  for (let y = 0; y < h; y++) {
    assert.deepEqual([...out.slice(y * w, y * w + 3)], [1, 1, 1]);
    assert.deepEqual([...out.slice(y * w + 4, y * w + 12)], [2, 2, 2, 2, 2, 2, 2, 2]);
  }
  // 越えにくさがどこも同じなら、ふつうの近さと同じ
  const flat = V.propagateGeodesic(lab, new Float32Array(w * h).fill(1), w, h);
  for (let y = 0; y < h; y++) { assert.equal(flat[y * w + 2], 1); assert.equal(flat[y * w + 9], 2); }
});
