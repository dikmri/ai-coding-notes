// reports/ippitsu/js の、画像を線にして筆の順番を決める処理を確かめる
// node --test tests/ippitsu-logic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowField, extractLines, isLineArt, binarizeLineArt } from '../reports/ippitsu/js/lines.mjs';
import { hatchStrokes } from '../reports/ippitsu/js/hatch.mjs';
import { orderStrokes, STAGES } from '../reports/ippitsu/js/order.mjs';
import { penProfile, strokeLength } from '../reports/ippitsu/js/pen.mjs';
import { toSVG, crc32, addPngText } from '../reports/ippitsu/js/export.mjs';

// 濃淡（0=黒、1=白）の画像を作る
function gray(w, h, f) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = f(x, y);
  return g;
}
function rgba(w, h, f) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = f(x, y);
    d.set([r, g, b, 255], (y * w + x) * 4);
  }
  return d;
}
const line = (pts, w = 2, kind = 'line') => ({ points: pts.map(([x, y]) => ({ x, y, w })), kind, closed: false });
const straight = (x0, y0, x1, y1, n = 20, w = 2, kind) => line(Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1)]), w, kind);

// ---------------- 模様の向き
test('縦の境目では、模様の向き（線の流れ）が縦になる', () => {
  const W = 60, H = 60;
  const g = gray(W, H, (x) => (x < 30 ? 0.2 : 0.9));
  const f = flowField(g, W, H);
  for (const y of [15, 30, 45]) {
    const i = y * W + 30;
    assert.ok(Math.abs(f.ty[i]) > 0.95, `y=${y} の向き (${f.tx[i]}, ${f.ty[i]})`);
    assert.ok(f.coherence[i] > 0.8, `そろい具合 ${f.coherence[i]}`);
  }
});

// ---------------- 線を起こす
test('一様な灰色からは線が 1 本も出ない', () => {
  const W = 50, H = 50;
  const { ink } = extractLines(gray(W, H, () => 0.5), W, H);
  assert.equal(ink.reduce((a, b) => a + b, 0), 0);
});

test('縦の境目からは、境目に沿ってつながった 1 本の線が出る', () => {
  const W = 60, H = 60;
  const { ink } = extractLines(gray(W, H, (x) => (x < 30 ? 0.2 : 0.9)), W, H);
  let rowsWithInk = 0, stray = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ink[y * W + x]) continue;
    if (Math.abs(x - 29.5) > 6) stray++;
  }
  for (let y = 8; y < 52; y++) {
    let any = false;
    for (let x = 24; x < 36; x++) if (ink[y * W + x]) any = true;
    if (any) rowsWithInk++;
  }
  assert.equal(stray, 0, '境目から離れた所に線がある');
  assert.equal(rowsWithInk, 44, `線がある行 ${rowsWithInk}/44`);
});

test('白地に描いた細い黒線は、線として拾われる', () => {
  const W = 60, H = 60;
  const { ink } = extractLines(gray(W, H, (x) => (Math.abs(x - 30) <= 1 ? 0.1 : 0.95)), W, H);
  let rows = 0;
  for (let y = 8; y < 52; y++) if (ink[y * W + 29] || ink[y * W + 30] || ink[y * W + 31]) rows++;
  assert.ok(rows >= 40, `線がある行 ${rows}/44`);
});

test('線画（白地に黒い線）と写真のような絵を見分ける', () => {
  const W = 80, H = 80;
  const art = rgba(W, H, (x, y) => ((x % 20 < 2 || y % 25 < 2) ? [20, 20, 20] : [250, 250, 248]));
  const photo = rgba(W, H, (x, y) => [80 + x, 40 + y, 120 + ((x * y) % 60)]);
  assert.equal(isLineArt(art, W, H), true);
  assert.equal(isLineArt(photo, W, H), false);
});

test('線画は、黒い線だけが墨になる', () => {
  const W = 40, H = 40;
  const g = gray(W, H, (x) => (x >= 18 && x < 22 ? 0.05 : 0.97));
  const ink = binarizeLineArt(g, W, H);
  assert.equal(ink[20 * W + 20], 1);
  assert.equal(ink[20 * W + 5], 0);
});

// ---------------- 斜線
function horizontalFlow(W, H) {
  return { tx: new Float32Array(W * H).fill(1), ty: new Float32Array(W * H), coherence: new Float32Array(W * H).fill(1) };
}
test('暗い四角の中だけに、流れの向きの斜線を引く', () => {
  const W = 80, H = 80;
  const tone = gray(W, H, (x, y) => (x >= 20 && x < 60 && y >= 20 && y < 60 ? 0.3 : 0.9));
  const strokes = hatchStrokes(tone, horizontalFlow(W, H), W, H, { levels: [{ below: 0.45, spacing: 6, angle: 0 }] });
  assert.ok(strokes.length >= 4, `本数 ${strokes.length}`);
  for (const s of strokes) {
    assert.equal(s.kind, 'hatch');
    for (const p of s.points) assert.ok(p.x >= 18.5 && p.x <= 61.5 && p.y >= 18.5 && p.y <= 61.5, `外に出た (${p.x}, ${p.y})`);
    const ys = s.points.map((p) => p.y);
    assert.ok(Math.max(...ys) - Math.min(...ys) <= 1.5, '横の流れに沿っていない');
  }
});

test('さらに暗い所には、交差する向きの斜線も重ねる', () => {
  const W = 80, H = 80;
  const tone = gray(W, H, (x, y) => (x >= 20 && x < 60 && y >= 20 && y < 60 ? 0.1 : 0.9));
  const strokes = hatchStrokes(tone, horizontalFlow(W, H), W, H, { levels: [{ below: 0.45, spacing: 6, angle: 0 }, { below: 0.2, spacing: 6, angle: 90 }] });
  const vertical = strokes.filter((s) => { const xs = s.points.map((p) => p.x); return Math.max(...xs) - Math.min(...xs) <= 1.5 && s.points.length > 4; });
  assert.ok(vertical.length >= 3, `縦の斜線 ${vertical.length}`);
});

test('白い画像には斜線を引かず、同じ入力からは毎回同じ斜線になる', () => {
  const W = 60, H = 60;
  assert.equal(hatchStrokes(gray(W, H, () => 0.95), horizontalFlow(W, H), W, H).length, 0);
  const tone = gray(W, H, (x, y) => 0.2 + 0.004 * (x + y));
  const a = hatchStrokes(tone, horizontalFlow(W, H), W, H);
  const b = hatchStrokes(tone, horizontalFlow(W, H), W, H);
  assert.deepEqual(a, b);
});

// ---------------- 順番
test('長い線 → 中くらいの線 → 短い線 → 斜線 の順に並ぶ', () => {
  const strokes = [straight(0, 0, 8, 0), straight(0, 10, 0, 110), straight(0, 20, 40, 20), straight(0, 30, 30, 30, 20, 1, 'hatch')];
  const out = orderStrokes(strokes, { mode: 'photo', longLen: 80, midLen: 25 });
  assert.deepEqual(out.map((s) => STAGES.photo[s.stage]), ['長い輪郭', '中くらいの線', '短い線', '斜線']);
});

test('同じ段の中は、ペン先から近い順に描き、近いほうの端から描き始める', () => {
  const strokes = [straight(100, 0, 105, 0), straight(0, 0, 5, 0), straight(18, 0, 12, 0)];
  const out = orderStrokes(strokes, { mode: 'photo', longLen: 80, midLen: 25 });
  assert.deepEqual(out.map((s) => Math.round(s.points[0].x)), [0, 12, 100]);
});

test('線画では、外周に触れる筆を先に描く', () => {
  const inner = { ...straight(40, 40, 60, 40), outside: 0 };
  const outer = { ...straight(0, 0, 20, 0), outside: 0.9 };
  const out = orderStrokes([inner, outer], { mode: 'lineart', longLen: 80, midLen: 25 });
  assert.equal(STAGES.lineart[out[0].stage], '外周');
  assert.equal(out[0], outer);
});

// ---------------- ペンの入り抜き
test('筆の入りと抜きは細く、真ん中は元の線幅に近い', () => {
  const s = straight(0, 0, 60, 0, 61, 3);
  const p = penProfile(s.points);
  assert.ok(p[0].w < 1.5 && p[p.length - 1].w < 1.5, `端 ${p[0].w} ${p[p.length - 1].w}`);
  assert.ok(Math.abs(p[30].w - 3) < 0.3, `真ん中 ${p[30].w}`);
  assert.ok(p.every((q) => q.w > 0));
  assert.ok(Math.abs(strokeLength(p) - 60) < 1e-6);
});

// ---------------- 出力
test('SVG は筆の数だけの道筋と、プログラムが描いたことの説明を持つ', () => {
  const svg = toSVG([straight(0, 0, 50, 0), straight(0, 10, 50, 30)], 120, 80);
  assert.equal((svg.match(/<path /g) || []).length, 2);
  assert.match(svg, /viewBox="0 0 120 80"/);
  assert.match(svg, /<desc>[^<]*プログラム[^<]*<\/desc>/);
  assert.doesNotMatch(svg, /NaN/);
});

test('CRC-32 は PNG の IEND の値と一致する', () => {
  assert.equal(crc32(new TextEncoder().encode('IEND')), 0xae426082);
});

test('PNG の IHDR の直後に、日本語の説明（iTXt）を足せる', () => {
  const chunk = (type, data) => {
    const t = new TextEncoder().encode(type);
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set(t, 4); out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = new Uint8Array([...sig, ...chunk('IHDR', new Uint8Array(13)), ...chunk('IEND', new Uint8Array(0))]);
  const text = 'プログラムが一筆ずつ描いた線画';
  const out = addPngText(png, 'Description', text);
  const dv = new DataView(out.buffer);
  const at = 8 + 25; // 署名 8 + IHDR 25
  const len = dv.getUint32(at);
  assert.equal(new TextDecoder().decode(out.subarray(at + 4, at + 8)), 'iTXt');
  assert.equal(dv.getUint32(at + 8 + len), crc32(out.subarray(at + 4, at + 8 + len)));
  assert.ok(new TextDecoder().decode(out.subarray(at + 8, at + 8 + len)).endsWith(text));
  assert.equal(out.length, png.length + 12 + len);
});
