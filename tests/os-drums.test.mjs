// リズムマシンの計算（パターンの形、ステップの時刻とスイング、曲の並び、鳴らす楽器、保存の形の検証と直し、元に戻す）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../os/js/core/drums.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} と ${b} が近くない`);

test('打楽器は 8 つ、パターンは A〜H の 8 つ、1 小節は 16 ステップ', () => {
  assert.equal(D.INSTRUMENTS.length, 8);
  assert.deepEqual(D.LETTERS, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.equal(D.STEPS, 16);
  // 閉じたハイハットと開いたハイハットの番号（開いた音を止める組み合わせに使う）
  assert.equal(D.INSTRUMENTS[D.CLOSED_HAT].id, 'chh');
  assert.equal(D.INSTRUMENTS[D.OPEN_HAT].id, 'ohh');
});

test('空のパターン: 8 段 × 16 ステップがすべて 0。段ごとに別の配列', () => {
  const p = D.emptyPattern();
  assert.equal(p.length, 8);
  for (const row of p) assert.deepEqual(row, Array(16).fill(0));
  p[0][0] = 1;
  assert.equal(p[1][0], 0);
  assert.equal(D.isEmptyPattern(D.emptyPattern()), true);
  assert.equal(D.isEmptyPattern(p), false);
});

test('ステップの長さ: 4 分音符を 4 つに分けた長さ', () => {
  near(D.stepDuration(120), 0.125);
  near(D.stepDuration(60), 0.25);
  near(D.patternDuration(120), 2);
});

test('ステップの時刻: スイング 0 なら等間隔、スイングがあると裏のステップだけ遅れる', () => {
  near(D.stepTime(0, 120, 0), 0);
  near(D.stepTime(1, 120, 0), 0.125);
  near(D.stepTime(4, 120, 0), 0.5);
  // スイング 50%: 裏のステップをステップの長さの 1/4 遅らせる
  near(D.stepTime(1, 120, 50), 0.125 + 0.125 * 0.25);
  near(D.stepTime(2, 120, 50), 0.25); // 表のステップは動かない
  // 約 66.7% で 3 連符のはね（2 ステップの組の 2/3 の所）
  near(D.stepTime(1, 120, 200 / 3), (2 * 0.125 * 2) / 3);
  // 範囲の外のスイングは 0〜75% に収める
  near(D.stepTime(1, 120, 300), D.stepTime(1, 120, 75));
  near(D.stepTime(1, 120, -5), 0.125);
});

test('ステップの切り替え: 押すとオンとオフ、強く打つ印は 強く⇔ふつう', () => {
  assert.equal(D.toggleStep(0), 1);
  assert.equal(D.toggleStep(1), 0);
  assert.equal(D.toggleStep(2), 0);
  assert.equal(D.toggleAccent(0), 2);
  assert.equal(D.toggleAccent(1), 2);
  assert.equal(D.toggleAccent(2), 1);
});

test('アクセントの強さ: 強く打つ印は、ふつうより大きい', () => {
  assert.equal(D.stepGain(0), 0);
  assert.ok(D.stepGain(1) > 0 && D.stepGain(1) < D.stepGain(2));
  assert.equal(D.stepGain(2), 1);
  assert.equal(D.stepGain(7), 0); // 知らない値は鳴らさない
});

test('つまみの値から音の作り方: 高さは半音ずつ、長さは割合、音量は 0〜1', () => {
  const v = D.voiceSettings({ vol: 100, tune: 12, decay: 50 });
  near(v.ratio, 2);
  near(v.length, 0.5);
  near(v.level, 1);
  near(D.voiceSettings({ vol: 0, tune: -12, decay: 200 }).ratio, 0.5);
  assert.equal(D.voiceSettings({ vol: 0, tune: 0, decay: 100 }).level, 0);
  // 音量は上げるほど大きくなる
  assert.ok(D.voiceSettings({ vol: 40, tune: 0, decay: 100 }).level < D.voiceSettings({ vol: 60, tune: 0, decay: 100 }).level);
});

test('鳴らす楽器: 消音は鳴らない。単独があれば単独だけ鳴る', () => {
  const kit = D.defaultKit();
  assert.deepEqual(D.audible(kit), Array(8).fill(true));
  kit[1].mute = true;
  assert.deepEqual(D.audible(kit), [true, false, true, true, true, true, true, true]);
  kit[3].solo = true; kit[5].solo = true;
  assert.deepEqual(D.audible(kit), [false, false, false, true, false, true, false, false]);
  kit[5].mute = true; // 単独でも消音なら鳴らない
  assert.deepEqual(D.audible(kit), [false, false, false, true, false, false, false, false]);
});

test('曲の並びを読む: A〜H の文字だけを順に拾い、ほかの文字は知らせる', () => {
  assert.deepEqual(D.parseOrder('A A B A C'), { order: ['A', 'A', 'B', 'A', 'C'], ignored: [] });
  assert.deepEqual(D.parseOrder('aabh'), { order: ['A', 'A', 'B', 'H'], ignored: [] });
  assert.deepEqual(D.parseOrder('A, B → Z 1'), { order: ['A', 'B'], ignored: [',', '→', 'Z', '1'] });
  assert.deepEqual(D.parseOrder(''), { order: [], ignored: [] });
});

test('鳴らす順: パターンの再生は今のパターンだけ、曲の再生は並びのとおり', () => {
  const s = D.emptyRhythm();
  s.current = 'C'; s.song = ['A', 'B', 'A'];
  assert.deepEqual(D.playOrder(s, 'pattern'), ['C']);
  assert.deepEqual(D.playOrder(s, 'song'), ['A', 'B', 'A']);
  s.song = [];
  assert.deepEqual(D.playOrder(s, 'song'), ['C']); // 並びが空なら今のパターン
});

test('次の位置: 16 ステップで次の小節へ、並びの最後の次は頭へ戻る。時刻はテンポの分だけ進む', () => {
  let p = { slot: 0, step: 14, time: 1 };
  p = D.advance(p, 2, 120);
  assert.deepEqual(p, { slot: 0, step: 15, time: 1.125 });
  p = D.advance(p, 2, 120);
  assert.deepEqual(p, { slot: 1, step: 0, time: 1.25 });
  p = D.advance({ slot: 1, step: 15, time: 0 }, 2, 60);
  assert.deepEqual(p, { slot: 0, step: 0, time: 0.25 });
});

test('書き出す音の一覧: 時刻・楽器・強さ。消音した楽器は入れない', () => {
  const s = D.emptyRhythm();
  s.bpm = 120; s.swing = 0;
  s.patterns.A[0][0] = 2; s.patterns.A[1][4] = 1;
  s.patterns.B[0][1] = 1;
  s.song = ['A', 'B'];
  const one = D.renderEvents(s, 'pattern');
  near(one.length, 2);
  assert.deepEqual(one.events.map((e) => [e.time, e.inst, e.gain]), [[0, 0, 1], [0.5, 1, D.stepGain(1)]]);
  const all = D.renderEvents(s, 'song');
  near(all.length, 4);
  assert.deepEqual(all.events.map((e) => [e.time, e.inst]), [[0, 0], [0.5, 1], [2.125, 0]]);
  s.kit[1].mute = true;
  assert.equal(D.renderEvents(s, 'pattern').events.length, 1);
  // スイングは書き出しにも効く
  s.swing = 50;
  near(D.renderEvents(s, 'song').events.at(-1).time, 2 + 0.125 + 0.125 * 0.25);
});

test('見本: 初めて開いたときに鳴らせるパターンが 2 つ以上と、曲の並びがある', () => {
  const s = D.sampleRhythm();
  const used = D.LETTERS.filter((c) => !D.isEmptyPattern(s.patterns[c]));
  assert.ok(used.length >= 2 && used.length <= 3, used.join());
  assert.ok(s.song.length >= 4);
  assert.ok(s.song.every((c) => used.includes(c)));
  assert.equal(s.current, 'A');
  // 見本も検証を通る形
  assert.deepEqual(D.normalizeRhythm(JSON.parse(JSON.stringify(D.serialize(s)))), s);
});

test('保存の形: 段は「.」「x」「X」の 16 文字。読み直すと同じ状態に戻る', () => {
  const s = D.sampleRhythm();
  s.bpm = 97; s.swing = 33; s.volume = 55; s.mode = 'song'; s.current = 'B';
  s.kit[2] = { vol: 35, tune: -5, decay: 140, mute: true, solo: false };
  s.kit[6].solo = true;
  const saved = D.serialize(s);
  assert.equal(saved.format, 'fos-rhythm');
  assert.equal(saved.version, 1);
  assert.match(saved.patterns.A[0], /^[.xX]{16}$/);
  const back = D.normalizeRhythm(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(back, s);
});

test('読み込みの検証: 壊れた値は既定値に直し、範囲の外は収める', () => {
  const s = D.normalizeRhythm({
    bpm: 999, swing: 'たくさん', volume: -3, mode: 'loop', current: 'Z',
    song: 'A Q b', kit: [{ vol: 150, tune: 3.6, decay: 5, mute: 'yes', solo: 1 }, null],
    patterns: { A: ['x.X?', [1, 2, 3, -1, true, '2']], B: 'こわれた', I: ['xxxxxxxxxxxxxxxx'] },
  });
  assert.equal(s.bpm, 240);
  assert.equal(s.swing, 0);
  assert.equal(s.volume, 0);
  assert.equal(s.mode, 'pattern');
  assert.equal(s.current, 'A');
  assert.deepEqual(s.song, ['A', 'B']);
  assert.deepEqual(s.kit[0], { vol: 100, tune: 4, decay: 25, mute: false, solo: false });
  assert.deepEqual(s.kit[1], D.defaultKit()[1]);
  assert.equal(s.kit.length, 8);
  assert.deepEqual(s.patterns.A[0], [1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.patterns.A[1], [1, 2, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.patterns.A[2], Array(16).fill(0));
  assert.deepEqual(s.patterns.B, D.emptyPattern());
  assert.deepEqual(Object.keys(s.patterns), D.LETTERS); // I は捨てる
  // テンポは整数に丸める。曲の並びが空なら今のパターン 1 つ
  const t = D.normalizeRhythm({ bpm: 100.6, song: [], current: 'c' });
  assert.equal(t.bpm, 101);
  assert.equal(t.current, 'C');
  assert.deepEqual(t.song, ['C']);
});

test('読み込みの検証: リズムのデータでないものは誤りにする', () => {
  assert.throws(() => D.normalizeRhythm(null), /リズム/);
  assert.throws(() => D.normalizeRhythm([1, 2]), /リズム/);
  assert.throws(() => D.normalizeRhythm('A A B'), /リズム/);
  assert.throws(() => D.normalizeRhythm({ format: 'something-else' }), /リズム/);
});

test('元に戻すとやり直し: 戻した分だけやり直せる。新しい編集でやり直しは消える。上限を超えた古いものは捨てる', () => {
  const h = D.createHistory(3);
  assert.equal(h.undo('now'), null);
  h.push('s1'); h.push('s2');
  assert.equal(h.undo('s3'), 's2');
  assert.equal(h.undo('s2'), 's1');
  assert.equal(h.undo('s1'), null);
  assert.equal(h.redo('s1'), 's2');
  assert.equal(h.redo('s2'), 's3');
  assert.equal(h.redo('s3'), null);
  h.undo('s3');
  h.push('x');
  assert.equal(h.redo('y'), null);
  const k = D.createHistory(2);
  k.push(1); k.push(2); k.push(3);
  assert.equal(k.undo(4), 3);
  assert.equal(k.undo(3), 2);
  assert.equal(k.undo(2), null);
});
