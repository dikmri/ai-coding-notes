// PNG を読む・縮める・透明な所へ色を広げる計算（tools/lib/image.mjs）を確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import * as I from '../tools/lib/image.mjs';

// テスト用に、行ごとにフィルターの種類を変えた PNG を作る（フィルターの式は PNG の仕様どおり）
function makePng(w, h, px, channels, filters) {
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  const stride = w * channels, raw = [];
  for (let y = 0; y < h; y++) {
    const f = filters[y % filters.length]; raw.push(f);
    for (let x = 0; x < stride; x++) {
      const cur = px[y * stride + x], a = x >= channels ? px[y * stride + x - channels] : 0, b = y > 0 ? px[(y - 1) * stride + x] : 0, c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      raw.push((cur - [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]) & 255);
    }
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0))]);
}

test('PNG: 5 種類の行フィルターを使った RGBA を、元の画素どおりに読む', () => {
  const w = 7, h = 10, px = Uint8Array.from({ length: w * h * 4 }, (_, i) => (i * 53 + (i >> 3) * 7) & 255);
  const img = I.decodePng(makePng(w, h, px, 4, [0, 1, 2, 3, 4]));
  assert.equal(img.width, w); assert.equal(img.height, h);
  assert.deepEqual([...img.data], [...px]);
});

test('PNG: RGB（透明度なし）は、透明度 255 の RGBA として読む', () => {
  const w = 5, h = 4, px = Uint8Array.from({ length: w * h * 3 }, (_, i) => (i * 29) & 255);
  const img = I.decodePng(makePng(w, h, px, 3, [4, 3, 1]));
  for (let i = 0; i < w * h; i++) {
    assert.deepEqual([...img.data.subarray(i * 4, i * 4 + 3)], [...px.subarray(i * 3, i * 3 + 3)]);
    assert.equal(img.data[i * 4 + 3], 255);
  }
});

test('縮小: 色は透明度を重みにして平均し、透明度はそのまま平均する', () => {
  // 2x2 を 1x1 に。赤の不透明が 1 つ、残りは透明な黒
  const img = { width: 2, height: 2, data: Uint8Array.from([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) };
  const s = I.downscale(img, 1, 1);
  assert.deepEqual([...s.data], [255, 0, 0, 64]);
});

test('縮小: 一様な色の画像は、同じ色のまま小さくなる', () => {
  const img = { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4).map((_, i) => [10, 200, 30, 255][i % 4]) };
  const s = I.downscale(img, 2, 2);
  assert.deepEqual([...s.data], [10, 200, 30, 255, 10, 200, 30, 255, 10, 200, 30, 255, 10, 200, 30, 255]);
});

test('色を広げる: 透明な画素は、隣の不透明な画素の色になる（透明度は変えない）', () => {
  const img = { width: 3, height: 1, data: Uint8Array.from([0, 0, 0, 0, 40, 80, 120, 255, 0, 0, 0, 0]) };
  I.bleed(img, 2);
  assert.deepEqual([...img.data], [40, 80, 120, 0, 40, 80, 120, 255, 40, 80, 120, 0]);
});

test('分ける: 色の画像は透明度 255 に、透明度の画像は灰色の明るさに', () => {
  const img = { width: 2, height: 1, data: Uint8Array.from([9, 8, 7, 100, 1, 2, 3, 0]) };
  const { color, alpha } = I.split(img);
  assert.deepEqual([...color.data], [9, 8, 7, 255, 1, 2, 3, 255]);
  assert.deepEqual([...alpha.data], [100, 100, 100, 255, 0, 0, 0, 255]);
});

test('PNG: encodePng で書いた RGBA を decodePng で読むと、元の画素に戻る', () => {
  const w = 5, h = 3, px = Uint8Array.from({ length: w * h * 4 }, (_, i) => (i * 37 + 11) & 255);
  const back = I.decodePng(I.encodePng({ width: w, height: h, data: px }));
  assert.equal(back.width, w); assert.equal(back.height, h);
  assert.deepEqual([...back.data], [...px]);
});
