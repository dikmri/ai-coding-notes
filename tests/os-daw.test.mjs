// 多重録音スタジオの計算（時間と拍と小節、クリップの編集、重なり、スナップ、鳴る位置、音量とパン、フェード、
// 予定表、メトロノーム、.fdaw の検証、元に戻す、波形の縮め方、録音の切り出し、見本の曲）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../os/js/core/daw.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const close = (a, b, eps = 1e-9, msg = '') => assert.ok(near(a, b, eps), `${msg} ${a} と ${b} が違います`);
const clip = (o = {}) => D.newClip({ id: 'c1', track: 't1', src: '/音楽/a.wav', name: 'a', start: 2, srcLen: 4, ...o });

test('時間と拍: 120 BPM の 4/4 では 1 拍 0.5 秒、1 小節 2 秒', () => {
  close(D.beatSec(120), 0.5);
  close(D.barSec(120, [4, 4]), 2);
  close(D.barSec(90, [3, 4]), 2);
  // 拍子の下の数は拍の音符。6/8 は 8 分音符を 1 拍として 6 拍
  close(D.barSec(120, [6, 8]), 3);
});

test('時間と拍: 秒から小節・拍へ、小節・拍から秒へ（どちらも 1 から数える）', () => {
  assert.deepEqual(D.secToBBT(0, 120, [4, 4]), { bar: 1, beat: 1, frac: 0 });
  const b = D.secToBBT(4.75, 120, [4, 4]); // 3 小節目の 2 拍目の半分
  assert.equal(b.bar, 3); assert.equal(b.beat, 2); close(b.frac, 0.5);
  close(D.bbtToSec(3, 2, 0.5, 120, [4, 4]), 4.75);
  close(D.bbtToSec(1, 1, 0, 120, [4, 4]), 0);
  // 3 拍子
  assert.deepEqual(D.secToBBT(1.5, 120, [3, 4]), { bar: 2, beat: 1, frac: 0 });
  // 割り切れない値でも、計算の誤差で 1 つ前の拍にならない
  const t = D.bbtToSec(7, 3, 0, 97, [4, 4]);
  assert.deepEqual(D.secToBBT(t, 97, [4, 4]), { bar: 7, beat: 3, frac: 0 });
  // 頭より前は 1 小節 1 拍として扱う
  assert.deepEqual(D.secToBBT(-1, 120, [4, 4]), { bar: 1, beat: 1, frac: 0 });
});

test('表示: 小節.拍.百分の一拍 と 分:秒.ミリ秒', () => {
  assert.equal(D.fmtBBT(4.75, 120, [4, 4]), '3.2.50');
  assert.equal(D.fmtBBT(0, 120, [4, 4]), '1.1.00');
  assert.equal(D.fmtSec(0), '0:00.000');
  assert.equal(D.fmtSec(65.25), '1:05.250');
  assert.equal(D.fmtSec(-1.5), '-0:01.500');
  assert.equal(D.fmtSec(59.9996), '1:00.000'); // 繰り上がりで 0:60.000 にならない
});

test('スナップ: 目盛りの単位（小節・拍・半拍）と、いちばん近い目盛りへの寄せ方', () => {
  close(D.gridStep('bar', 120, [4, 4]), 2);
  close(D.gridStep(1, 120, [4, 4]), 0.5);
  close(D.gridStep(0.25, 120, [4, 4]), 0.125);
  assert.equal(D.gridStep(0, 120, [4, 4]), 0);
  close(D.snapTime(1.26, 0.5), 1.5);
  close(D.snapTime(1.24, 0.5), 1);
  close(D.snapTime(1.234, 0), 1.234); // スナップなし
  close(D.snapTime(0.3 * 3, 0.1), 0.9); // 浮動小数点の端数を残さない
  assert.equal(String(D.snapTime(0.3 * 3, 0.1)), '0.9');
});

test('クリップ: 新しいクリップは音の頭から全部を使い、音量 0 dB・フェードなし', () => {
  const c = clip();
  assert.equal(c.offset, 0); assert.equal(c.length, 4); assert.equal(c.gain, 0);
  assert.equal(c.fadeIn, 0); assert.equal(c.fadeOut, 0);
  assert.equal(D.clipEnd(c), 6);
});

test('クリップを動かす: 頭より前には行かない。段も変えられる', () => {
  const c = clip();
  assert.equal(D.moveClip(c, 5).start, 5);
  assert.equal(D.moveClip(c, -3).start, 0);
  const m = D.moveClip(c, 1, 't2');
  assert.equal(m.track, 't2'); assert.equal(m.offset, 0); assert.equal(m.length, 4);
  assert.equal(c.start, 2); // 元のクリップは変えない
});

test('切り詰め（頭）: 音の中の位置も一緒にずれる。音の頭より前と、終わりの近くへは行けない', () => {
  const c = clip({ offset: 1, length: 2, start: 3 }); // 音の 1〜3 秒を、3〜5 秒に置いている
  const a = D.trimStart(c, 3.5);
  close(a.start, 3.5); close(a.offset, 1.5); close(a.length, 1.5); close(D.clipEnd(a), 5);
  const b = D.trimStart(c, 0); // 音の頭（2 秒の位置）より前には伸ばせない
  close(b.start, 2); close(b.offset, 0); close(b.length, 3);
  const d = D.trimStart(c, 9); // 終わりを越えない。最短の長さは残す
  close(D.clipEnd(d), 5); close(d.length, D.MIN_LEN);
  // 時間の頭（0 秒）より前にも伸ばせない
  const e = D.trimStart(clip({ start: 0.5, offset: 2, length: 1 }), -5);
  close(e.start, 0); close(e.offset, 1.5);
});

test('切り詰め（終わり）: 音の終わりを越えて伸ばせない', () => {
  const c = clip({ offset: 1, length: 2, start: 3 }); // 音は 4 秒。後ろに 1 秒の余り
  close(D.trimEnd(c, 4).length, 1);
  close(D.trimEnd(c, 99).length, 3);
  close(D.trimEnd(c, 0).length, D.MIN_LEN);
});

test('切り詰めると、長さに合わないフェードを縮める', () => {
  const c = { ...clip(), fadeIn: 1, fadeOut: 2 };
  const a = D.trimEnd(c, 3.5); // 長さ 1.5 秒。フェードの合計 3 秒を同じ割合で縮める
  close(a.fadeIn + a.fadeOut, 1.5); close(a.fadeIn, 0.5); close(a.fadeOut, 1);
  const f = D.fixFades({ ...clip(), fadeIn: -1, fadeOut: 0.5 });
  assert.equal(f.fadeIn, 0); assert.equal(f.fadeOut, 0.5);
});

test('分ける: 再生位置で 2 つにし、音の位置がつながる。フェードは外側にだけ残す', () => {
  const c = { ...clip({ offset: 0.5, length: 3 }), fadeIn: 0.2, fadeOut: 0.4, gain: -3 };
  const [l, r] = D.splitClip(c, 3, 'c2');
  close(l.start, 2); close(l.length, 1); close(l.offset, 0.5);
  close(r.start, 3); close(r.length, 2); close(r.offset, 1.5);
  assert.equal(r.id, 'c2'); assert.equal(l.id, 'c1');
  assert.equal(l.fadeIn, 0.2); assert.equal(l.fadeOut, 0);
  assert.equal(r.fadeIn, 0); assert.equal(r.fadeOut, 0.4);
  assert.equal(r.gain, -3); assert.equal(r.track, 't1');
  // 端の近くや外では分けない
  assert.equal(D.splitClip(c, 2, 'x'), null);
  assert.equal(D.splitClip(c, 5 - D.MIN_LEN / 2, 'x'), null);
  assert.equal(D.splitClip(c, 9, 'x'), null);
});

test('重なり: 同じ段で時間が重なるときだけ', () => {
  const a = clip(), b = clip({ id: 'c2', start: 5 }), c = clip({ id: 'c3', start: 6 }), d = clip({ id: 'c4', track: 't2', start: 3 });
  assert.equal(D.overlapping(a, b), true);
  assert.equal(D.overlapping(a, c), false); // ちょうど終わりから始まるのは重ならない
  assert.equal(D.overlapping(a, d), false); // 別の段
});

test('重なり: 後に置いたクリップ（上）が鳴り、下のクリップは隠れていない所だけ鳴る', () => {
  const low = clip({ id: 'low', start: 0, srcLen: 10 }); // 0〜10
  const up = clip({ id: 'up', start: 3, srcLen: 2 }); // 3〜5
  const parts = D.audibleParts([low, up]);
  assert.deepEqual(parts.get('low'), [[0, 3], [5, 10]]);
  assert.deepEqual(parts.get('up'), [[3, 5]]);
  // 上が下を全部隠すと、下は鳴らない
  const p2 = D.audibleParts([clip({ id: 'a', start: 1, srcLen: 1 }), clip({ id: 'b', start: 0, srcLen: 5 })]);
  assert.deepEqual(p2.get('a'), []);
  // 3 つ重ね
  const p3 = D.audibleParts([clip({ id: 'a', start: 0, srcLen: 6 }), clip({ id: 'b', start: 1, srcLen: 2 }), clip({ id: 'c', start: 2, srcLen: 2 })]);
  assert.deepEqual(p3.get('a'), [[0, 1], [4, 6]]);
  assert.deepEqual(p3.get('b'), [[1, 2]]);
  assert.deepEqual(p3.get('c'), [[2, 4]]);
});

test('ある時刻に鳴るクリップと、その音の中の位置', () => {
  const p = D.emptyProject();
  p.tracks = [D.newTrack('t1', 1, 'mint'), D.newTrack('t2', 2, 'sky')];
  p.clips = [clip({ id: 'a', start: 0, srcLen: 10 }), clip({ id: 'b', start: 3, offset: 1, length: 2, srcLen: 4 }), clip({ id: 'c', track: 't2', start: 4, srcLen: 1 })];
  const at = (t) => D.clipsAt(p, t).map((x) => [x.clip.id, +x.pos.toFixed(6)]);
  assert.deepEqual(at(1), [['a', 1]]);
  assert.deepEqual(at(4.5), [['b', 2.5], ['c', 0.5]]); // b が a を隠す。b は音の 1 秒目から置いている
  assert.deepEqual(at(5.5), [['a', 5.5]]);
  assert.deepEqual(at(20), []);
});

test('音量: dB と倍率。いちばん下（-60 dB 以下）は無音', () => {
  close(D.dbToGain(0), 1);
  close(D.dbToGain(-6), 0.501187, 1e-6);
  close(D.dbToGain(6), 1.995262, 1e-6);
  assert.equal(D.dbToGain(-60), 0);
  assert.equal(D.dbToGain(-Infinity), 0);
  close(D.gainToDb(0.5), -6.0206, 1e-4);
  assert.equal(D.gainToDb(0), -Infinity);
});

test('パン: 中央は左右とも元の大きさ。寄せた側は元のまま、反対側だけ小さくする', () => {
  assert.deepEqual(D.panGains(0).map((v) => +v.toFixed(9)), [1, 1]);
  assert.deepEqual(D.panGains(-1).map((v) => +v.toFixed(9)), [1, 0]);
  assert.deepEqual(D.panGains(1).map((v) => +v.toFixed(9)), [0, 1]);
  const [l, r] = D.panGains(0.5);
  close(l, Math.SQRT2 * Math.cos((1.5 * Math.PI) / 4), 1e-12); close(r, 1);
  assert.ok(l > 0.5 && l < 1);
  const [l2, r2] = D.panGains(-0.5); close(l2, 1); close(r2, l, 1e-12); // 左右対称
  assert.deepEqual(D.panGains(9), D.panGains(1)); // 範囲の外は端にそろえる
});

test('消音と単独: 単独の段があれば単独の段だけ。消音は単独より強い', () => {
  const t = (id, o = {}) => ({ ...D.newTrack(id, 1, 'mint'), ...o });
  const a = t('a'), b = t('b', { mute: true }), c = t('c');
  assert.deepEqual([a, b, c].map((x) => D.audible(x, [a, b, c])), [true, false, true]);
  const s = t('c', { solo: true });
  assert.deepEqual([a, b, s].map((x) => D.audible(x, [a, b, s])), [false, false, true]);
  const ms = t('d', { solo: true, mute: true });
  assert.deepEqual([a, ms].map((x) => D.audible(x, [a, ms])), [false, false]);
  close(D.trackGain(t('x', { vol: -6 }), [t('x', { vol: -6 })]), D.dbToGain(-6));
  assert.equal(D.trackGain(b, [a, b]), 0);
});

test('フェードの重み: 頭は 0 から、終わりは 0 へ、まっすぐ変わる', () => {
  const c = { ...clip({ start: 2, srcLen: 4 }), fadeIn: 1, fadeOut: 2 }; // 2〜6
  close(D.fadeWeight(c, 2), 0); close(D.fadeWeight(c, 2.5), 0.5); close(D.fadeWeight(c, 3), 1);
  close(D.fadeWeight(c, 3.5), 1); close(D.fadeWeight(c, 5), 0.5); close(D.fadeWeight(c, 6), 0);
  assert.equal(D.fadeWeight(c, 1), 0); assert.equal(D.fadeWeight(c, 7), 0);
  const n = clip(); // フェードなしは端まで 1
  assert.equal(D.fadeWeight(n, 2), 1); assert.equal(D.fadeWeight(n, 5.999), 1);
});

test('音量の動き（クリップの音量とフェード）: 点の並びと、途中から鳴らすときの切り出し', () => {
  const c = { ...clip({ start: 2, srcLen: 4 }), fadeIn: 1, fadeOut: 2, gain: -6 }; // 2〜6
  const g = D.dbToGain(-6);
  const env = D.clipEnvelope(c);
  assert.deepEqual(env.map(([t]) => t), [2, 3, 4, 6]);
  assert.deepEqual(env.map(([, v]) => +v.toFixed(9)), [0, +g.toFixed(9), +g.toFixed(9), 0]);
  close(D.valueAt(env, 2.5), g / 2);
  const sl = D.envelopeSlice(env, 2.5, 5);
  assert.deepEqual(sl.map(([t]) => t), [2.5, 3, 4, 5]);
  close(sl[0][1], g / 2); close(sl[3][1], g / 2);
  // フェードなしは頭から終わりまで同じ値
  const flat = D.clipEnvelope(clip());
  assert.deepEqual(flat, [[2, 1], [6, 1]]);
});

test('予定表: 範囲の中で鳴る部分ごとに、いつ・音のどこから・何秒鳴らすか', () => {
  const p = D.emptyProject();
  p.tracks = [D.newTrack('t1', 1, 'mint')];
  p.clips = [clip({ id: 'a', start: 0, srcLen: 10 }), clip({ id: 'b', start: 3, srcLen: 2, offset: 0.5, length: 1.5 })];
  const s = D.schedule(p, 1, 8);
  const sum = s.map((x) => [x.clipId, +x.at.toFixed(6), +x.offset.toFixed(6), +x.dur.toFixed(6), x.edgeIn, x.edgeOut]);
  assert.deepEqual(sum, [
    ['a', 1, 1, 2, false, true], // 1 秒目から（途中から鳴らす）。b に隠れる所で切る
    ['a', 4.5, 4.5, 3.5, true, false], // b の後ろから、範囲の終わりまで
    ['b', 3, 0.5, 1.5, false, false],
  ]);
  assert.equal(s[0].src, '/音楽/a.wav');
  // 範囲の前から始まるクリップの音量の動きは、範囲の頭の値から始まる
  const q = D.emptyProject();
  q.clips = [{ ...clip({ id: 'f', track: q.tracks[0].id, start: 0, srcLen: 4 }), fadeIn: 2 }];
  const f = D.schedule(q, 1, 4)[0];
  assert.deepEqual(f.env.map(([t, v]) => [t, +v.toFixed(6)]), [[1, 0.5], [2, 1], [4, 1]]);
  // 範囲の後ろ・前のクリップは入らない。頭より前（マイナス）から始める範囲も扱える
  assert.equal(D.schedule(p, 20, 30).length, 0);
  const neg = D.schedule(p, -2, 1);
  assert.equal(neg.length, 1); close(neg[0].at, 0); close(neg[0].offset, 0); close(neg[0].dur, 1);
});

test('メトロノーム: 範囲の中の拍の時刻と、小節の頭の印', () => {
  const c = D.clickTimes(0, 2.1, 120, [4, 4]);
  assert.deepEqual(c.map((x) => x.t), [0, 0.5, 1, 1.5, 2]);
  assert.deepEqual(c.map((x) => x.accent), [true, false, false, false, true]);
  const d = D.clickTimes(0.6, 1.6, 120, [3, 4]);
  assert.deepEqual(d.map((x) => [x.t, x.accent]), [[1, false], [1.5, true]]);
  const neg = D.clickTimes(-2, 0, 120, [4, 4]); // カウントの間（頭より前）も小節の頭がそろう
  assert.deepEqual(neg.map((x) => [x.t, x.accent]), [[-2, true], [-1.5, false], [-1, false], [-0.5, false]]);
  const s = D.clickSamples(48000, true);
  assert.ok(s.length > 1000 && s.length < 48000 * 0.1);
  assert.ok(Math.max(...s.map(Math.abs)) <= 1);
  assert.ok(Math.abs(s[s.length - 1]) < 0.01); // 終わりは小さくなって切れる（ぷつっと鳴らない）
  close(D.countInSec(1, 120, [4, 4]), 2); assert.equal(D.countInSec(0, 120, [4, 4]), 0);
});

test('.fdaw の検証: 形の違うファイルは理由を付けて断る', () => {
  assert.throws(() => D.normalizeProject(null), /多重録音スタジオの計画/);
  assert.throws(() => D.normalizeProject({ format: 'other' }), /多重録音スタジオの計画/);
  assert.throws(() => D.normalizeProject({ format: D.FORMAT, version: 99, tracks: [], clips: [] }), /新しい版/);
  assert.throws(() => D.normalizeProject({ format: D.FORMAT, version: 1, tracks: 'x', clips: [] }), /段/);
});

test('.fdaw の検証: 範囲の外の値を直し、無い段のクリップと壊れたクリップを捨てる', () => {
  const raw = {
    format: D.FORMAT, version: 1, bpm: 9999, sig: [0, 3], master: 40, latencyMs: 'x',
    loop: { on: true, start: 5, end: 2 },
    tracks: [{ id: 't1', name: '', color: 'nope', vol: -200, pan: 3, mute: 1, solo: 0 }, { id: 't1', name: '二重' }],
    clips: [
      { id: 'a', track: 't1', src: '/音楽/a.wav', start: -1, offset: 0, length: 2, srcLen: 3, gain: 99, fadeIn: 5, fadeOut: 5 },
      { id: 'b', track: 'none', src: '/音楽/b.wav', start: 0, length: 1, srcLen: 1 },
      { id: 'c', track: 't1', src: '', start: 0, length: 1, srcLen: 1 },
      { id: 'a', track: 't1', src: '/音楽/d.wav', start: 0, length: 0, srcLen: 1 },
    ],
  };
  const p = D.normalizeProject(raw);
  assert.equal(p.bpm, 300); assert.deepEqual(p.sig, [1, 4]); assert.equal(p.master, 6); assert.equal(p.latencyMs, 0);
  assert.equal(p.tracks.length, 2);
  assert.notEqual(p.tracks[0].id, p.tracks[1].id); // 同じ id は付け直す
  assert.equal(p.tracks[0].name, '段 1'); assert.equal(p.tracks[0].color, D.COLORS[0].id);
  assert.equal(p.tracks[0].vol, -60); assert.equal(p.tracks[0].pan, 1); assert.equal(p.tracks[0].mute, true);
  assert.equal(p.clips.length, 2); // 無い段と、音のファイルの無いクリップは捨てる
  const a = p.clips[0];
  assert.equal(a.start, 0); assert.equal(a.gain, 24); assert.ok(a.fadeIn + a.fadeOut <= a.length + 1e-9);
  assert.notEqual(p.clips[1].id, 'a'); assert.ok(p.clips[1].length >= D.MIN_LEN);
  assert.ok(p.loop.start < p.loop.end); // 逆さまのループは並べ直す
});

test('.fdaw: 書き出してから読み直すと同じになる（実行中だけの印は書かない）', () => {
  const p = D.emptyProject();
  p.tracks.push(D.newTrack('t9', 2, 'sunset'));
  p.clips.push({ ...clip({ id: 'c5', track: 't9' }), missing: true });
  p.bpm = 96; p.sig = [3, 4]; p.loop = { on: true, start: 1, end: 3 }; p.metronome = true;
  const s = D.serialize(p);
  assert.equal('missing' in s.clips[0], false);
  const back = D.normalizeProject(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back, D.normalizeProject(s));
  assert.deepEqual(D.serialize(back), s);
  assert.equal(back.format, D.FORMAT);
});

test('曲の長さと、書き出す範囲（全体かループ）と標本の数', () => {
  const p = D.emptyProject();
  assert.equal(D.projectEnd(p), 0);
  p.clips = [clip({ track: p.tracks[0].id, start: 1, srcLen: 3 })];
  close(D.projectEnd(p), 4);
  assert.deepEqual(D.mixRange(p, false), { start: 0, end: 4 });
  p.loop = { on: true, start: 2, end: 3.5 };
  assert.deepEqual(D.mixRange(p, true), { start: 2, end: 3.5 });
  assert.equal(D.mixFrames({ start: 2, end: 3.5 }, 44100), 66150);
});

test('元に戻す・やり直し: 戻した後に新しく変えると、やり直しの分は消える', () => {
  const h = D.createHistory(3);
  assert.equal(h.undo('x'), null);
  h.push('a'); h.push('b');
  assert.equal(h.undo('c'), 'b'); // 今の 'c' はやり直しの側へ
  assert.equal(h.undo('b'), 'a');
  assert.equal(h.canUndo(), false);
  assert.equal(h.redo('a'), 'b');
  assert.equal(h.redo('b'), 'c');
  assert.equal(h.redo('c'), null);
  h.undo('c'); h.push('d');
  assert.equal(h.canRedo(), false);
  h.push('e'); h.push('f'); h.push('g'); // 上限 3 を越えると古い方から捨てる
  assert.equal(h.size(), 3);
});

test('波形: 区切りごとの最小と最大を作り、その範囲のいちばん外側を返す', () => {
  const d = new Float32Array([0, 0.5, -0.25, 1, -1, 0.25, 0.125]);
  const pk = D.buildPeaks([d], 2);
  assert.deepEqual([...pk.min], [0, -0.25, -1, 0.125]);
  assert.deepEqual([...pk.max], [0.5, 1, 0.25, 0.125]);
  assert.deepEqual(D.peakSpan(pk, 0, 4), [-0.25, 1]);
  assert.deepEqual(D.peakSpan(pk, 3, 7), [-1, 1]);
  assert.deepEqual(D.peakSpan(pk, 50, 60), [0, 0]);
  // 2 チャンネルは両方の外側
  const st = D.buildPeaks([new Float32Array([0.5, 0]), new Float32Array([-0.75, 0.25])], 2);
  assert.deepEqual([...st.min, ...st.max], [-0.75, 0.5]);
});

test('録音の切り出し: 音の部品の番号から、録り始めの所を取り出し、遅れの分を詰める', () => {
  const chunks = [{ frame: 100, data: new Float32Array([1, 2, 3, 4]) }, { frame: 104, data: new Float32Array([5, 6, 7, 8]) }];
  assert.deepEqual([...D.alignTake(chunks, 102, 107)], [3, 4, 5, 6, 7]);
  // 届いていない所は無音で埋める
  assert.deepEqual([...D.alignTake(chunks, 98, 101)], [0, 0, 1]);
  assert.deepEqual([...D.alignTake(chunks, 107, 110)], [8, 0, 0]);
  assert.equal(D.latencyFrames(10, 48000), 480);
  assert.equal(D.latencyFrames(-5, 44100), -221); // -220.5 を丸める
  assert.equal(D.takeName(new Date(2026, 10, 19, 9, 5, 7)), '録音 2026-11-19 09-05-07.wav');
});

test('目盛り: 拡大の度合いに合わせて、文字が重ならない間かくで小節（または秒）を書く', () => {
  const t = D.rulerTicks(0, 16, 50, 'bars', 120, [4, 4]); // 1 小節 = 100px
  const majors = t.filter((x) => x.major);
  assert.deepEqual(majors.map((x) => x.label), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.ok(t.some((x) => !x.major && near(x.t, 0.5))); // 拍の細かい線
  const far = D.rulerTicks(0, 120, 5, 'bars', 120, [4, 4]); // 1 小節 = 10px なら何小節かおき
  const step = far.filter((x) => x.major)[1].t - far.filter((x) => x.major)[0].t;
  assert.ok(step * 5 >= 50);
  const sec = D.rulerTicks(0, 10, 100, 'time', 120, [4, 4]);
  assert.deepEqual(sec.filter((x) => x.major).slice(0, 3).map((x) => x.label), ['0:00', '0:01', '0:02']);
});

test('見本の曲: ドラム・ベース・和音の 3 つの音が、同じ長さ（4 小節）で、音割れしない', () => {
  const rate = 8000, st = D.demoStems(rate, 110);
  const len = Math.round(D.barSec(110, [4, 4]) * 4 * rate);
  for (const k of ['drums', 'bass', 'chords']) {
    assert.equal(st[k].length, len, k);
    let peak = 0, sum = 0;
    for (const v of st[k]) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    assert.ok(peak <= 1 && peak > 0.2, `${k} の大きさ ${peak}`);
    assert.ok(Math.sqrt(sum / len) > 0.02, `${k} が静かすぎます`);
  }
  // 同じ周波数で作ると同じ音（雑音も決まった並び）
  assert.deepEqual(D.demoStems(rate, 110).drums.slice(0, 50), st.drums.slice(0, 50));
  const p = D.demoProject({ drums: '/d.wav', bass: '/b.wav', chords: '/c.wav' }, 110);
  assert.equal(p.tracks.length, 3);
  assert.ok(p.clips.length >= 3);
  assert.equal(new Set(p.clips.map((c) => c.track)).size, 3);
  assert.doesNotThrow(() => D.normalizeProject(D.serialize(p)));
});

test('段の色と id: 使っていない色を順に選び、id は空いている次の番号', () => {
  assert.equal(D.nextColor([]), D.COLORS[0].id);
  assert.equal(D.nextColor([{ color: 'mint' }, { color: 'lavender' }]), 'sunset');
  assert.equal(D.nextColor(D.COLORS.map((c) => ({ color: c.id }))), D.COLORS[0].id); // 全部使っていたら一周する
  assert.equal(D.colorHex('sky'), '#8fd3ff');
  assert.equal(D.colorHex('nope'), D.COLORS[0].hex);
  assert.equal(D.newId('c', [{ id: 'c2' }, { id: 'c10' }, { id: 'x99' }]), 'c11');
  assert.equal(D.newId('t', []), 't1');
});

test('音の大きさの表示: -48 dB から 0 dB を 0〜1 に', () => {
  assert.equal(D.meterFrac(0), 0);
  assert.equal(D.meterFrac(1), 1);
  assert.equal(D.meterFrac(2), 1);
  close(D.meterFrac(D.dbToGain(-24)), 0.5, 1e-9);
  assert.equal(D.meterFrac(D.dbToGain(-50)), 0);
});
