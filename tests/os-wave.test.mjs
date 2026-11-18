// 音声エディタの計算（core/wave.mjs）のテスト: 範囲の編集、貼り付けのそろえ、効果、元に戻す、波形の表示、時刻の文字、WAV の読み込み
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../os/js/core/wave.mjs';
import { encodeWAV } from '../os/js/core/wav.mjs';

const f32 = (...v) => new Float32Array(v);
const mono = (rate, ...v) => W.makeAudio([f32(...v)], rate);
const arr = (a) => [...a];
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} と ${b} が近くない`);
const nearAll = (xs, ys, eps = 1e-6) => { assert.equal(xs.length, ys.length); for (let i = 0; i < xs.length; i++) near(xs[i], ys[i], eps); };

test('音の形: チャンネルの長さがそろっていないと作れない。空の音と無音', () => {
  const a = W.makeAudio([f32(1, 2), f32(3, 4)], 44100);
  assert.equal(W.frames(a), 2);
  assert.equal(a.channels.length, 2);
  assert.throws(() => W.makeAudio([f32(1), f32(1, 2)], 44100));
  assert.throws(() => W.makeAudio([], 44100));
  const b = W.blank(0.5, 8000, 2);
  assert.equal(W.frames(b), 4000);
  assert.equal(b.channels.length, 2);
  assert.ok(b.channels.every((c) => c.every((v) => v === 0)));
  assert.equal(W.frames(W.blank(0, 8000, 1)), 0);
});

test('サイン波: 周波数と大きさ。チャンネルごとに周波数を変えられる', () => {
  const a = W.tone({ freqs: [1000, 2000], seconds: 0.01, rate: 8000, amp: 0.5 });
  assert.equal(W.frames(a), 80);
  assert.equal(a.channels.length, 2);
  near(a.channels[0][0], 0);
  near(a.channels[0][2], 0.5 * Math.sin((2 * Math.PI * 1000 * 2) / 8000), 1e-6);
  near(a.channels[1][1], 0.5 * Math.sin((2 * Math.PI * 2000) / 8000), 1e-6);
  near(W.peak(a.channels), 0.5, 1e-6);
});

test('範囲のそろえ: 逆向き・はみ出し・小数を、0〜長さの整数の始めと終わりにする', () => {
  assert.deepEqual(W.clampRange(10, 7, 3), [3, 7]);
  assert.deepEqual(W.clampRange(10, -5, 20), [0, 10]);
  assert.deepEqual(W.clampRange(10, 2.4, 2.6), [2, 3]);
  assert.deepEqual(W.clampRange(0, 1, 2), [0, 0]);
});

test('切り取り: 範囲を抜いた音と、抜いた部分。元に戻すと同じ音', () => {
  const a = mono(8000, 0, 1, 2, 3, 4, 5);
  const r = W.cut(a, 2, 4);
  assert.deepEqual(arr(r.audio.channels[0]), [0, 1, 4, 5]);
  assert.deepEqual(arr(r.clip.channels[0]), [2, 3]);
  assert.equal(r.clip.rate, 8000);
  assert.deepEqual(arr(W.revert(r.audio, r.patches).channels[0]), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(arr(W.reapply(W.revert(r.audio, r.patches), r.patches).channels[0]), [0, 1, 4, 5]);
  // 元の音は書き換えない
  assert.deepEqual(arr(a.channels[0]), [0, 1, 2, 3, 4, 5]);
});

test('切り取り・削除の境界: 範囲が 0 なら何もしない。端の範囲', () => {
  const a = mono(8000, 0, 1, 2);
  assert.equal(W.cut(a, 1, 1), null);
  assert.equal(W.remove(a, 2, 2), null);
  assert.deepEqual(arr(W.remove(a, 0, 1).audio.channels[0]), [1, 2]);
  assert.deepEqual(arr(W.remove(a, 2, 3).audio.channels[0]), [0, 1]);
  assert.equal(W.frames(W.remove(a, 0, 3).audio), 0);
});

test('コピー: 範囲の写し（元の配列と別のもの）。範囲が 0 なら null', () => {
  const a = mono(8000, 0, 1, 2, 3);
  const c = W.copy(a, 1, 3);
  assert.deepEqual(arr(c.channels[0]), [1, 2]);
  c.channels[0][0] = 9;
  assert.equal(a.channels[0][1], 1);
  assert.equal(W.copy(a, 2, 2), null);
});

test('貼り付け: 範囲が 0 ならカーソルへ挿入、範囲があれば置き換え。端にも貼れる', () => {
  const a = mono(8000, 0, 1, 2, 3);
  const clip = mono(8000, 7, 8);
  const ins = W.paste(a, 1, 1, clip);
  assert.deepEqual(arr(ins.audio.channels[0]), [0, 7, 8, 1, 2, 3]);
  assert.deepEqual([ins.start, ins.end], [1, 3]);
  const rep = W.paste(a, 1, 3, clip);
  assert.deepEqual(arr(rep.audio.channels[0]), [0, 7, 8, 3]);
  assert.deepEqual(arr(W.paste(a, 0, 0, clip).audio.channels[0]), [7, 8, 0, 1, 2, 3]);
  assert.deepEqual(arr(W.paste(a, 4, 4, clip).audio.channels[0]), [0, 1, 2, 3, 7, 8]);
  assert.deepEqual(arr(W.revert(rep.audio, rep.patches).channels[0]), [0, 1, 2, 3]);
});

test('貼り付けのチャンネル数のそろえ: モノラルをステレオへは両方に、ステレオをモノラルへは平均', () => {
  const st = W.makeAudio([f32(0, 0), f32(0, 0)], 8000);
  const m = mono(8000, 0.5, -0.5);
  const r1 = W.paste(st, 1, 1, m);
  assert.equal(r1.audio.channels.length, 2);
  assert.deepEqual(arr(r1.audio.channels[0]), [0, 0.5, -0.5, 0]);
  assert.deepEqual(arr(r1.audio.channels[1]), [0, 0.5, -0.5, 0]);
  const clipSt = W.makeAudio([f32(1, 0.5), f32(0, -0.5)], 8000);
  const r2 = W.paste(mono(8000, 0), 0, 0, clipSt);
  assert.deepEqual(arr(r2.audio.channels[0]), [0.5, 0, 0]);
});

test('貼り付けの標本化の周波数のそろえ: 貼り先の周波数に直してから貼る（長さが比で変わる）', () => {
  const a = mono(48000, 0);
  const clip = W.makeAudio([new Float32Array(441).fill(0.25)], 44100);
  const r = W.paste(a, 1, 1, clip);
  assert.equal(W.frames(r.audio), 1 + 480);
  assert.equal(r.audio.rate, 48000);
  near(r.audio.channels[0][100], 0.25);
  // 直線で補う: 0,1 を 2 倍の周波数にすると 0, 0.5, 1, 1
  nearAll(W.resample(f32(0, 1), 1000, 2000), [0, 0.5, 1, 1]);
  nearAll(W.resample(f32(0, 1, 2, 3), 2000, 1000), [0, 2]);
  assert.equal(W.resample(f32(), 1000, 2000).length, 0);
});

test('無音にする: 範囲だけを 0 にする。長さは変わらない', () => {
  const a = mono(8000, 1, 1, 1, 1);
  const r = W.silence(a, 1, 3);
  assert.deepEqual(arr(r.audio.channels[0]), [1, 0, 0, 1]);
  assert.deepEqual(arr(W.revert(r.audio, r.patches).channels[0]), [1, 1, 1, 1]);
  assert.equal(W.silence(a, 2, 2), null);
});

test('選んだ範囲だけ残す: 前と後ろを捨てる。元に戻すと前と後ろも戻る', () => {
  const a = mono(8000, 0, 1, 2, 3, 4);
  const r = W.trim(a, 1, 3);
  assert.deepEqual(arr(r.audio.channels[0]), [1, 2]);
  assert.deepEqual(arr(W.revert(r.audio, r.patches).channels[0]), [0, 1, 2, 3, 4]);
  assert.equal(W.trim(a, 2, 2), null);
  // 全体を選んでいれば変わらないので何もしない
  assert.equal(W.trim(a, 0, 5), null);
});

test('音量: dB と倍率の換算。範囲だけを変える', () => {
  near(W.dbToGain(0), 1);
  near(W.dbToGain(-6.0206), 0.5, 1e-4);
  near(W.gainToDb(0.5), -6.0206, 1e-3);
  assert.equal(W.gainToDb(0), -Infinity);
  const a = mono(8000, 0.5, 0.5, 0.5);
  const r = W.effect(a, 1, 2, (g) => W.gain(g, -6.0206));
  nearAll(r.audio.channels[0], [0.5, 0.25, 0.5], 1e-4);
});

test('ノーマライズ: いちばん大きい振れ幅を目標の dB にそろえる。チャンネルの比は保つ。無音は変えない', () => {
  const g = W.normalize([f32(0.1, -0.2), f32(0.05, 0)], -1);
  near(W.peak(g), W.dbToGain(-1), 1e-6);
  near(g[0][0] / g[1][0], 2, 1e-5);
  const z = W.normalize([f32(0, 0)], -1);
  assert.deepEqual(arr(z[0]), [0, 0]);
});

test('フェードイン・フェードアウト: 0 から 1 へ、1 から 0 へ直線で', () => {
  nearAll(W.fadeIn([f32(1, 1, 1, 1, 1)])[0], [0, 0.25, 0.5, 0.75, 1]);
  nearAll(W.fadeOut([f32(1, 1, 1, 1, 1)])[0], [1, 0.75, 0.5, 0.25, 0]);
  nearAll(W.fadeIn([f32(0.8)])[0], [0.8]); // 1 標本だけなら変えない
});

test('逆再生と直流のずれを取る', () => {
  assert.deepEqual(arr(W.reverse([f32(1, 2, 3)])[0]), [3, 2, 1]);
  nearAll(W.removeDC([f32(0.3, 0.1, 0.2, 0.2)])[0], [0.1, -0.1, 0, 0]);
});

test('効果の範囲: 範囲が 0 なら全体にかける', () => {
  const a = mono(8000, 1, 2, 3);
  assert.deepEqual(arr(W.effect(a, 1, 1, W.reverse).audio.channels[0]), [3, 2, 1]);
  assert.deepEqual(arr(W.effect(a, 0, 2, W.reverse).audio.channels[0]), [2, 1, 3]);
});

test('元に戻す: 21 回の編集を全部戻せて、やり直せる。新しい編集でやり直しの先は消える', () => {
  const h = new W.History();
  let a = mono(8000, ...new Array(30).fill(0).map((_, i) => i));
  const orig = arr(a.channels[0]);
  for (let i = 0; i < 21; i++) { const r = W.silence(a, i, i + 1); h.push({ patches: r.patches, label: '無音' }); a = r.audio; }
  assert.equal(h.undoCount, 21);
  for (let i = 0; i < 21; i++) a = h.undo(a).audio;
  assert.deepEqual(arr(a.channels[0]), orig);
  assert.equal(h.undo(a), null);
  a = h.redo(a).audio;
  assert.equal(a.channels[0][0], 0);
  assert.equal(a.channels[0][1], 1);
  assert.equal(h.redoCount, 20);
  const r = W.remove(a, 0, 1); h.push({ patches: r.patches }); a = r.audio;
  assert.equal(h.redoCount, 0);
});

test('元に戻すの上限: 回数と使うメモリの両方。古いものから捨て、最新の 1 つは残す', () => {
  const h = new W.History({ max: 3, maxBytes: 1e9 });
  let a = mono(8000, 0, 0, 0, 0, 0);
  for (let i = 0; i < 5; i++) { const r = W.silence(W.makeAudio([new Float32Array(5).fill(1)], 8000), 0, 5); h.push({ patches: r.patches }); }
  assert.equal(h.undoCount, 3);
  const small = new W.History({ max: 50, maxBytes: 100 });
  const big = W.silence(W.makeAudio([new Float32Array(20).fill(1)], 8000), 0, 20); // 20 標本 × 4 バイト × 2（前と後） = 160 バイト
  small.push({ patches: big.patches });
  assert.equal(small.undoCount, 1);
  small.push({ patches: big.patches });
  assert.equal(small.undoCount, 1);
  assert.ok(small.bytes <= 160);
  assert.ok(a);
});

test('波形の表示: 画素ごとの最小と最大。音の外は NaN', () => {
  const ch = f32(0, 1, -1, 0.5, 0.25, -0.25, 0, 0);
  const p = W.columnPeaks(ch, 0, 2, 5);
  assert.deepEqual(arr(p.subarray(0, 8)), [0, 1, -1, 0.5, -0.25, 0.25, 0, 0]);
  assert.ok(Number.isNaN(p[8]) && Number.isNaN(p[9]));
  // 1 画素に 1 標本より少ないとき（拡大したとき）は、その位置の標本
  const q = W.columnPeaks(ch, 1, 0.5, 4);
  assert.deepEqual(arr(q), [1, 1, 1, 1, -1, -1, -1, -1]);
  // 始めが負（左の外）
  const n = W.columnPeaks(ch, -2, 2, 2);
  assert.ok(Number.isNaN(n[0]));
  assert.deepEqual(arr(n.subarray(2)), [0, 1]);
});

test('波形の表示: まとめ（大きく縮めたとき用）を使っても、生の計算の最小・最大を含む', () => {
  const d = new Float32Array(10000);
  for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * 0.37) * (i / d.length);
  const sum = W.summarize(d, 64);
  const raw = W.columnPeaks(d, 0, 1000, 10), fast = W.columnPeaks(d, 0, 1000, 10, sum);
  for (let i = 0; i < 10; i++) { assert.ok(fast[i * 2] <= raw[i * 2] + 1e-7); assert.ok(fast[i * 2 + 1] >= raw[i * 2 + 1] - 1e-7); near(fast[i * 2 + 1], raw[i * 2 + 1], 0.05); }
});

test('表示の範囲: 全体を見る・拡大の中心・はみ出さないようにそろえる・画素と標本の換算', () => {
  const v = W.fitView(8000, 800);
  assert.deepEqual(v, { start: 0, spp: 10 });
  // ポインタの位置（x=400 → 標本 4000）を保って 2 倍に拡大
  const z = W.zoomView(v, 2, 400, 8000, 800);
  assert.equal(z.spp, 5);
  assert.equal(W.xToFrame(z, 400), 4000);
  // 全体より縮めない。拡大の限度もある
  assert.equal(W.zoomView(v, 0.5, 400, 8000, 800).spp, 10);
  assert.equal(W.zoomView({ start: 0, spp: W.MIN_SPP }, 2, 0, 8000, 800).spp, W.MIN_SPP);
  // 右の端を越えない
  assert.equal(W.clampView({ start: 7900, spp: 5 }, 8000, 800).start, 4000);
  assert.equal(W.clampView({ start: -10, spp: 5 }, 8000, 800).start, 0);
  assert.equal(W.frameToX({ start: 100, spp: 2 }, 300), 100);
  // 短い音でも割り算が 0 にならない
  assert.ok(W.fitView(0, 800).spp > 0);
});

test('時刻の文字: 分:秒.ミリ秒。1 時間を越えたら時も', () => {
  assert.equal(W.fmtTime(1.25), '0:01.250');
  assert.equal(W.fmtTime(0), '0:00.000');
  assert.equal(W.fmtTime(75.0004), '1:15.000');
  assert.equal(W.fmtTime(3723.5), '1:02:03.500');
  assert.equal(W.fmtTime(-3), '0:00.000');
  assert.equal(W.fmtTime(59.9996), '1:00.000'); // 繰り上がり
});

test('時間の目盛り: 目盛りの間が狭くなりすぎない、きりのよい刻み', () => {
  const t = W.ticks(0, 0.01, 800, 80); // 1 画素 10 ミリ秒 → 1 秒ごと
  assert.equal(t.step, 1);
  assert.deepEqual(t.list.slice(0, 3).map((k) => [k.x, k.t]), [[0, 0], [100, 1], [200, 2]]);
  const u = W.ticks(1.03, 0.0001, 600, 80); // 拡大したとき: 10 ミリ秒ごと
  assert.equal(u.step, 0.01);
  near(u.list[0].t, 1.03, 1e-9);
  assert.equal(W.fmtTick(1.03, 0.01), '0:01.03');
  assert.equal(W.fmtTick(65, 5), '1:05');
  assert.equal(W.fmtTick(2.5, 0.5), '0:02.5');
  // いちばん拡大したとき（44100 Hz で 1 標本 32 画素）でも、目盛りが 2 つ以上出る
  const v = W.ticks(0.68, 1 / 32 / 44100, 960, 92);
  assert.ok(v.list.length >= 2, `目盛りが ${v.list.length} 個`);
  assert.equal(v.step, 0.0001);
  assert.equal(W.fmtTick(0.6801, 0.0001), '0:00.6801');
});

test('状態の帯の文: 範囲があれば始め・終わり・長さ、無ければカーソルの位置', () => {
  assert.equal(W.selectionText([12000, 24000], 8000), '始め 0:01.500 ・ 終わり 0:03.000 ・ 長さ 0:01.500');
  assert.equal(W.selectionText([8000, 8000], 8000), 'カーソル 0:01.000');
});

test('再生の範囲: 最初から・カーソルから・選んだ範囲だけ（範囲が 0 ならカーソルから）', () => {
  assert.deepEqual(W.playSpan('start', [10, 20], 100), [0, 100]);
  assert.deepEqual(W.playSpan('cursor', [10, 20], 100), [10, 100]);
  assert.deepEqual(W.playSpan('selection', [10, 20], 100), [10, 20]);
  assert.deepEqual(W.playSpan('selection', [30, 30], 100), [30, 100]);
  // カーソルが最後にあれば、最初から
  assert.deepEqual(W.playSpan('cursor', [100, 100], 100), [0, 100]);
});

test('再生の位置: くり返しなしは進むだけ、くり返しは範囲の中を回る', () => {
  near(W.playPosition({ from: 1, to: 3, elapsed: 0.5, loop: false }), 1.5);
  near(W.playPosition({ from: 1, to: 3, elapsed: 5, loop: false }), 3);
  near(W.playPosition({ from: 1, to: 3, elapsed: 2.5, loop: true }), 1.5);
  near(W.playPosition({ from: 1, to: 3, elapsed: 4, loop: true }), 1);
  // 途中（offset）から鳴らし始めたとき: 終わりまで行ってから範囲の始めへ戻る
  near(W.playPosition({ from: 1, to: 3, offset: 2.5, elapsed: 0.25, loop: true }), 2.75);
  near(W.playPosition({ from: 1, to: 3, offset: 2.5, elapsed: 1, loop: true }), 1.5);
  near(W.playPosition({ from: 0, to: 3, offset: 2.5, elapsed: 1, loop: false }), 3);
});

test('見本の音: 短い音の並び。音が割れない大きさで、終わりは静か', () => {
  const a = W.sampleTune(8000);
  assert.equal(a.rate, 8000);
  assert.equal(a.channels.length, 1);
  assert.ok(W.frames(a) / 8000 > 1.5 && W.frames(a) / 8000 < 4);
  const p = W.peak(a.channels);
  assert.ok(p > 0.3 && p <= 0.9);
  near(a.channels[0][W.frames(a) - 1], 0, 1e-3);
});

test('WAV を読む: 16 ビットの書き出しを読み直すと、標本化の周波数・チャンネル・値が戻る', () => {
  const a = W.tone({ freqs: [440, 660], seconds: 0.05, rate: 22050, amp: 0.6 });
  const b = W.parseWAV(encodeWAV(a.channels, a.rate));
  assert.equal(b.rate, 22050);
  assert.equal(b.channels.length, 2);
  assert.equal(W.frames(b), W.frames(a));
  for (let c = 0; c < 2; c++) for (let i = 0; i < W.frames(a); i++) near(b.channels[c][i], a.channels[c][i], 1 / 32000);
});

test('WAV を読む: 8・24 ビット、32 ビット浮動小数、拡張の形。WAV でないものは誤り', () => {
  const head = (fmt, bits, nch, rate, data, extensible = false) => {
    // 余計な塊（LIST、中身は奇数の 3 バイトなので 1 バイトの詰め物が付く）を先に置いても読めること
    const fmtLen = extensible ? 40 : 16, b = new Uint8Array(12 + 12 + 8 + fmtLen + 8 + data.length), dv = new DataView(b.buffer);
    const tag = (o, s) => { for (let i = 0; i < 4; i++) b[o + i] = s.charCodeAt(i); };
    tag(0, 'RIFF'); dv.setUint32(4, b.length - 8, true); tag(8, 'WAVE');
    tag(12, 'LIST'); dv.setUint32(16, 3, true); b.set([1, 2, 3, 0], 20);
    let o = 24;
    tag(o, 'fmt '); dv.setUint32(o + 4, fmtLen, true); dv.setUint16(o + 8, extensible ? 0xfffe : fmt, true); dv.setUint16(o + 10, nch, true);
    dv.setUint32(o + 12, rate, true); dv.setUint32(o + 16, rate * nch * (bits / 8), true); dv.setUint16(o + 20, nch * (bits / 8), true); dv.setUint16(o + 22, bits, true);
    if (extensible) { dv.setUint16(o + 24, 22, true); dv.setUint16(o + 26, bits, true); dv.setUint16(o + 32, fmt, true); }
    o += 8 + fmtLen;
    tag(o, 'data'); dv.setUint32(o + 4, data.length, true); b.set(data, o + 8);
    return b;
  };
  const u8 = W.parseWAV(head(1, 8, 1, 8000, new Uint8Array([128, 255, 0])));
  nearAll(u8.channels[0], [0, 127 / 128, -1], 1e-6);
  const p24 = new Uint8Array([0, 0, 0x40, 0, 0, 0xc0]); // +0.5, -0.5
  nearAll(W.parseWAV(head(1, 24, 1, 8000, p24)).channels[0], [0.5, -0.5], 1e-6);
  const fl = new Uint8Array(new Float32Array([0.25, -0.75]).buffer);
  const pf = W.parseWAV(head(3, 32, 2, 16000, fl));
  assert.equal(pf.rate, 16000);
  assert.deepEqual([pf.channels[0][0], pf.channels[1][0]], [0.25, -0.75]);
  const ex = W.parseWAV(head(1, 16, 1, 8000, new Uint8Array([0, 0x40]), true));
  near(ex.channels[0][0], 0.5, 1e-4);
  assert.throws(() => W.parseWAV(new Uint8Array([1, 2, 3, 4])), /WAV/);
  assert.throws(() => W.parseWAV(head(2, 4, 1, 8000, new Uint8Array([0]))), /読めない/);
});

test('保存の名前: 拡張子を .wav にする。名前が無ければ「無題の音.wav」', () => {
  assert.equal(W.wavName('/音楽/歌.mp3'), '歌.wav');
  assert.equal(W.wavName('歌.wav'), '歌.wav');
  assert.equal(W.wavName('メモ'), 'メモ.wav');
  assert.equal(W.wavName(''), '無題の音.wav');
});
