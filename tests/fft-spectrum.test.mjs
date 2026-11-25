// reports/fft/js/spectrum.mjs（表示のための計算）と music.mjs（その場で合成する曲）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { hann, levelDb, logEdges, columnLevels, peakFrequency, noteName, sequencyOrder, frameSpectrum } from '../reports/fft/js/spectrum.mjs';
import { midiToFreq, PIECES, renderPiece, PIECE_LENGTH, SAMPLE_RATE } from '../reports/fft/js/music.mjs';
import { createRealFFT, fwht } from '../reports/fft/js/fft.mjs';

const sine = (n, f, sr, a = 1) => Float64Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / sr));

test('ハン窓: 両端が 0、真ん中が 1、和は n/2', () => {
  const w = hann(1024);
  assert.equal(w[0], 0);
  assert.ok(Math.abs(w[512] - 1) < 1e-12);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 512) < 1e-9);
});

test('振幅 1 の正弦波は約 0 dB、振幅 0.1 は約 −20 dB（窓の和で正規化）', () => {
  const n = 4096, sr = 48000, f = (sr / n) * 100; // ちょうど 100 本目
  for (const [a, want] of [[1, 0], [0.1, -20]]) {
    const spec = frameSpectrum(createRealFFT(n), sine(n, f, sr, a), 0, hann(n));
    assert.ok(Math.abs(spec.db[100] - want) < 0.01, `${spec.db[100]}`);
  }
});

test('levelDb: 0 は下限で止める', () => {
  assert.equal(levelDb(0, 0, 1), -200);
});

test('対数の目盛り: 20 Hz〜20 kHz を 3 列に分けると 200 Hz と 2 kHz で区切る', () => {
  const e = logEdges(3, 20, 20000);
  assert.deepEqual([...e].map((x) => Math.round(x)), [20, 200, 2000, 20000]);
});

test('列ごとの強さ: 1 列に入る本の中で一番強い値を取り、本が無い列は前後から補う', () => {
  const sr = 1000, n = 16; // 1 本 = 62.5 Hz、0〜8 本
  const db = Float64Array.from({ length: 9 }, (_, k) => -k * 10);
  const out = columnLevels(db, Float64Array.of(70, 200, 230), sr, n, new Float64Array(2));
  // 列 0 は 70〜200 Hz → 本 2・3（125・187.5 Hz）。一番強いのは −20
  assert.equal(out[0], -20);
  // 列 1 は 200〜230 Hz に本が無い → 215 Hz を 3 本目と 4 本目（187.5・250 Hz）の間で補う
  assert.ok(out[1] < -30 && out[1] > -40, `${out[1]}`);
});

test('ピークの周波数: 本と本の間の音でも 0.1% 以内で求める', () => {
  const n = 4096, sr = 44100;
  for (const f of [261.63, 440, 1234.5, 5000.2]) {
    const spec = frameSpectrum(createRealFFT(n), sine(n, f, sr), 0, hann(n));
    const p = peakFrequency(spec.db, sr, n, 30, 20000);
    assert.ok(Math.abs(p.freq - f) / f < 1e-3, `${f} → ${p.freq}`);
  }
});

test('音名: 440 Hz は A4、261.63 Hz は C4、ずれはセントで返す', () => {
  assert.deepEqual(noteName(440), { name: 'A4', cents: 0 });
  assert.deepEqual(noteName(261.63), { name: 'C4', cents: 0 });
  assert.equal(noteName(452).name, 'A4');
  assert.equal(noteName(452).cents, 47);
  assert.equal(noteName(0), null);
});

test('ウォルシュ関数の並べ替え: 符号の変わる回数（セクエンシー）の順に並ぶ', () => {
  const m = 4, n = 16, ord = sequencyOrder(m);
  assert.deepEqual([...sequencyOrder(2)], [0, 2, 3, 1]);
  for (let q = 0; q < n; q++) {
    const row = new Float64Array(n); row[ord[q]] = 1; fwht(row); // ord[q] 番目のウォルシュ関数（の √n 分の 1）
    let flips = 0; for (let i = 1; i < n; i++) if (Math.sign(row[i]) !== Math.sign(row[i - 1])) flips++;
    assert.equal(flips, q);
  }
});

test('合成の音: midiToFreq(69) = 440、60 は約 261.63', () => {
  assert.equal(midiToFreq(69), 440);
  assert.ok(Math.abs(midiToFreq(60) - 261.6256) < 1e-3);
});

test('合成の曲: 3 曲あり、どれも 2^20 標本・振幅 1 以下・毎回同じ音', () => {
  assert.equal(PIECES.length, 3);
  for (const p of PIECES) {
    const a = renderPiece(p.id), b = renderPiece(p.id);
    assert.equal(a.length, PIECE_LENGTH);
    let peak = 0, energy = 0;
    for (let i = 0; i < a.length; i++) { peak = Math.max(peak, Math.abs(a[i])); energy += a[i] * a[i]; }
    assert.ok(peak <= 1 && peak > 0.3, `${p.id} の最大 ${peak}`);
    assert.ok(energy / a.length > 1e-3, `${p.id} が静かすぎる`);
    assert.deepEqual(a.subarray(0, 4096), b.subarray(0, 4096));
  }
});

test('合成の曲「上がる音と鐘」: 4 秒の所の一番強い音は、上がる音の式どおり約 800 Hz', () => {
  const x = renderPiece('sweep');
  const n = 4096, at = Math.round(4 * SAMPLE_RATE) - n / 2;
  const spec = frameSpectrum(createRealFFT(n), x, at, hann(n));
  const p = peakFrequency(spec.db, SAMPLE_RATE, n, 30, 20000);
  assert.ok(Math.abs(p.freq - 800) / 800 < 0.02, `${p.freq}`);
});
