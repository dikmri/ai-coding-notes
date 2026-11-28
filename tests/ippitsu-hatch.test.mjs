// reports/ippitsu/js/hatch.mjs の「人の描き方」の斜線（hatchHuman）と、その描く順番を確かめる
// node --test tests/ippitsu-hatch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hatchHuman } from '../reports/ippitsu/js/hatch.mjs';
import { orderStrokes } from '../reports/ippitsu/js/order.mjs';

function gray(w, h, f) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = f(x, y);
  return g;
}
const flat = (w, h) => ({ tx: new Float32Array(w * h).fill(1), ty: new Float32Array(w * h), coherence: new Float32Array(w * h) });
const angleOf = (s) => { const a = s.points[0], b = s.points.at(-1); return ((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 180) % 180; };
const adiff = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };
const mid = (s) => s.points[s.points.length >> 1];
const W = 160, H = 160;
const square = (v) => gray(W, H, (x, y) => (x >= 30 && x < 130 && y >= 30 && y < 130 ? v : 0.95));
// 1 段目 60°（「/」）、2 段目はそこから 45° 回す。形には沿わせない
const LEVELS = [{ below: 0.5, spacing: 6, angle: 0 }, { below: 0.25, spacing: 6, angle: 45 }];
const OPTS = { levels: LEVELS, baseAngle: 60, follow: 0, jitter: 0 };

test('1 段目の斜線は、決めた向き（60°）にそろった、ほぼまっすぐな線になる', () => {
  const s = hatchHuman(square(0.35), flat(W, H), W, H, OPTS);
  const l0 = s.filter((q) => q.level === 0);
  assert.ok(l0.length >= 8, `本数 ${l0.length}`);
  for (const q of l0) {
    assert.ok(adiff(angleOf(q), 120) <= 6, `向き ${angleOf(q)}`); // 画像の座標は y が下向きなので「/」60° は 120°
  }
});

test('暗い所にだけ 2 段目を重ね、交差の角度は直角ではなく約 45° になる', () => {
  const light = hatchHuman(square(0.35), flat(W, H), W, H, OPTS);
  assert.equal(light.filter((q) => q.level === 1).length, 0, '明るめの所に 2 段目がある');
  const dark = hatchHuman(square(0.1), flat(W, H), W, H, OPTS);
  const l1 = dark.filter((q) => q.level === 1);
  assert.ok(l1.length >= 6, `2 段目 ${l1.length}`);
  for (const q of l1) assert.ok(Math.abs(adiff(angleOf(q), 120) - 45) <= 6, `交差 ${adiff(angleOf(q), 120)}`);
});

test('同じ束の中では、隣の線を順に描く（向きがそろい、間隔はおよそ spacing）', () => {
  const s = hatchHuman(square(0.35), flat(W, H), W, H, OPTS).filter((q) => q.level === 0);
  let pairs = 0, near = 0;
  for (let i = 1; i < s.length; i++) {
    if (s[i].group !== s[i - 1].group) continue;
    pairs++;
    assert.ok(adiff(angleOf(s[i]), angleOf(s[i - 1])) <= 6);
    // 2 本の中点の、線に直交する向きの距離
    const t = (120 * Math.PI) / 180, nx = -Math.sin(t), ny = Math.cos(t);
    const a = mid(s[i - 1]), b = mid(s[i]);
    const d = Math.abs((b.x - a.x) * nx + (b.y - a.y) * ny);
    if (d >= 3 && d <= 13) near++;
  }
  assert.ok(pairs >= 6, `同じ束の続き ${pairs}`);
  assert.ok(near / pairs >= 0.8, `間隔が spacing に近い割合 ${near}/${pairs}`);
});

test('線は暗い所ほど太い', () => {
  const g = gray(W, H, (x, y) => (y >= 20 && y < 140 && x >= 20 && x < 140 ? (x < 80 ? 0.08 : 0.42) : 0.95));
  const s = hatchHuman(g, flat(W, H), W, H, { ...OPTS, levels: [{ below: 0.5, spacing: 6, angle: 0 }] });
  const ws = (cond) => s.flatMap((q) => q.points.filter(cond).map((p) => p.w)).sort((a, b) => a - b);
  const dark = ws((p) => p.x < 70), light = ws((p) => p.x > 90);
  assert.ok(dark[dark.length >> 1] > light[light.length >> 1] * 1.2, `暗 ${dark[dark.length >> 1]} 明 ${light[light.length >> 1]}`);
});

test('「/」の斜線は上の端から描き始める（右手で引く向き）', () => {
  const s = hatchHuman(square(0.35), flat(W, H), W, H, OPTS);
  for (const q of s.filter((x) => x.level === 0)) assert.ok(q.points[0].y <= q.points.at(-1).y + 0.5);
});

test('白い画像には引かず、同じ入力からは毎回同じ斜線になる', () => {
  assert.equal(hatchHuman(gray(W, H, () => 0.95), flat(W, H), W, H, OPTS).length, 0);
  const g = gray(W, H, (x, y) => 0.15 + 0.003 * (x + y));
  assert.deepEqual(hatchHuman(g, flat(W, H), W, H, { levels: LEVELS }), hatchHuman(g, flat(W, H), W, H, { levels: LEVELS }));
});

test('間を埋める段（between）は、1 段目と同じ向きで、1 段目の線の間に入る', () => {
  const levels = [{ below: 0.5, spacing: 8, angle: 0 }, { below: 0.2, spacing: 8, angle: 0, between: 0 }];
  const s = hatchHuman(square(0.08), flat(W, H), W, H, { ...OPTS, levels });
  const l0 = s.filter((q) => q.level === 0), l1 = s.filter((q) => q.level === 1);
  assert.ok(l1.length >= 5, `間を埋める線 ${l1.length}`);
  for (const q of l1) assert.ok(adiff(angleOf(q), 120) <= 6, `向き ${angleOf(q)}`);
  // 1 段目の線のどの点からも 1.5px 以上離れている（重ねて太くしていない）
  const pts0 = l0.flatMap((q) => q.points);
  let close = 0, total = 0;
  for (const q of l1) for (const p of q.points) { total++; if (pts0.some((r) => Math.hypot(r.x - p.x, r.y - p.y) < 1.5)) close++; }
  assert.ok(close / total < 0.05, `1 段目に重なる点 ${close}/${total}`);
});

test('壁（barrier）の画素を越えて斜線を引かない', () => {
  const barrier = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) { barrier[y * W + 80] = 1; barrier[y * W + 81] = 1; }
  const s = hatchHuman(square(0.35), flat(W, H), W, H, { ...OPTS, barrier });
  assert.ok(s.length >= 6);
  for (const q of s) {
    const xs = q.points.map((p) => p.x);
    assert.ok(Math.max(...xs) < 80 || Math.min(...xs) > 81, `壁を越えた ${Math.min(...xs)}〜${Math.max(...xs)}`);
  }
});

test('模様の向きがはっきりした所だけ流れに沿い、弱い所では決めた向きのまま', () => {
  const flowOf = (c) => ({ tx: new Float32Array(W * H).fill(0), ty: new Float32Array(W * H).fill(1), coherence: new Float32Array(W * H).fill(c) });
  const weak = hatchHuman(square(0.35), flowOf(0.4), W, H, { ...OPTS, follow: 0.6 }).filter((q) => q.level === 0);
  const strong = hatchHuman(square(0.35), flowOf(1), W, H, { ...OPTS, follow: 0.6 }).filter((q) => q.level === 0);
  const med = (v) => v.sort((a, b) => a - b)[v.length >> 1];
  assert.ok(med(weak.map((q) => adiff(angleOf(q), 120))) <= 4, '弱い流れに沿ってしまった');
  assert.ok(med(strong.map((q) => adiff(angleOf(q), 120))) >= 12, '強い流れに沿っていない');
});

test('広い暗い面の中に、束の継ぎ目の白い隙間をほとんど残さない', () => {
  const N = 320;
  const g = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g[y * N + x] = x >= 20 && x < 300 && y >= 20 && y < 300 ? 0.3 : 0.95;
  const f = { tx: new Float32Array(N * N).fill(1), ty: new Float32Array(N * N), coherence: new Float32Array(N * N) };
  const s = hatchHuman(g, f, N, N, { levels: [{ below: 0.5, spacing: 7, angle: 0 }], baseAngle: 60, follow: 0, maxLen: 40 });
  // 線の点を 1px ごとに並べ、各画素から一番近い線までの距離を測る（格子で近いものだけ調べる）
  const cell = 8, grid = new Map();
  for (const q of s) for (let i = 1; i < q.points.length; i++) {
    const a = q.points[i - 1], b = q.points[i], m = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let j = 0; j <= m; j++) {
      const x = a.x + ((b.x - a.x) * j) / Math.max(1, m), y = a.y + ((b.y - a.y) * j) / Math.max(1, m);
      const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      (grid.get(k) ?? grid.set(k, []).get(k)).push(x, y);
    }
  }
  let far = 0, total = 0;
  for (let y = 40; y < 280; y += 2) for (let x = 40; x < 280; x += 2) {
    total++;
    let best = Infinity;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const v = grid.get(`${cx + dx},${cy + dy}`);
      if (v) for (let i = 0; i < v.length; i += 2) best = Math.min(best, Math.hypot(v[i] - x, v[i + 1] - y));
    }
    // 平行な線の間の点は、線から最大で間隔の半分（約 3.7px）しか離れない。4.5px より離れた所は束の継ぎ目の白い隙間
    if (best > 4.5) far++;
  }
  assert.ok(far / total < 0.03, `線から 4.5px より離れた画素 ${(100 * far / total).toFixed(1)}%`);
});

test('順番: 斜線は段ごとに描き、束の中は作った順のまま、向きも変えない', () => {
  const s = hatchHuman(square(0.1), flat(W, H), W, H, OPTS);
  const firstPoints = s.map((q) => ({ x: q.points[0].x, y: q.points[0].y }));
  const out = orderStrokes([...s].reverse(), { mode: 'photo', longLen: 80, midLen: 25 });
  const levels = out.map((q) => q.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b), '段の順になっていない');
  for (let i = 1; i < out.length; i++) if (out[i].group === out[i - 1].group) assert.ok(out[i].seq > out[i - 1].seq, '束の中の順が崩れた');
  // 描き始めの点が変わっていない（逆向きにしていない）
  for (const q of out) { const k = s.indexOf(q); assert.deepEqual({ x: q.points[0].x, y: q.points[0].y }, firstPoints[k]); }
});
