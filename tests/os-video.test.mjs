// 動画の編集の計算（タイムライン・つなぎ目の重み・分ける・切り詰める・スナップ・並べ替え・時刻の文字・.fvid の検証・WebM の長さの書き込み）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../os/js/core/video.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
// 映像 1 に 2 つ、音 1 に 1 つ、文字に 1 つのクリップを持つ計画
function sample() {
  const p = V.newProject();
  p.media.push(
    { id: 'm1', path: '/ビデオ/a.webm', kind: 'video', name: 'a.webm', duration: 10, w: 640, h: 360 },
    { id: 'm2', path: '/画像/b.png', kind: 'image', name: 'b.png', duration: null, w: 800, h: 600 },
    { id: 'm3', path: '/音楽/c.wav', kind: 'audio', name: 'c.wav', duration: 20 },
  );
  p.clips.push(
    { ...V.clipDefaults(), id: 'c1', track: 'v1', media: 'm1', start: 0, dur: 4, in: 2 },
    { ...V.clipDefaults(), id: 'c2', track: 'v1', media: 'm2', start: 4, dur: 3, in: 0 },
    { ...V.clipDefaults(), id: 'c3', track: 'a1', media: 'm3', start: 1, dur: 5, in: 0, volume: 0.5 },
    { ...V.textDefaults(), id: 'c4', track: 't1', start: 2, dur: 2, text: 'こんにちは' },
  );
  return p;
}

test('新しい計画: 決まった段（文字・映像 2・映像 1・音 1・音 2）と設定を持ち、クリップは無い', () => {
  const p = V.newProject();
  assert.equal(p.kind, 'future-os-video');
  assert.equal(p.version, 1);
  assert.deepEqual(p.tracks.map((t) => [t.id, t.kind]), [['t1', 'text'], ['v2', 'video'], ['v1', 'video'], ['a1', 'audio'], ['a2', 'audio']]);
  assert.deepEqual(p.settings, { size: '720p', fps: 30 });
  assert.equal(p.clips.length, 0);
  assert.equal(V.duration(p), 0);
});

test('出力の大きさ: 横・縦・正方形を選べ、知らない名前は 1280×720', () => {
  assert.deepEqual(V.sizeOf('720p'), { w: 1280, h: 720 });
  assert.deepEqual(V.sizeOf('1080p'), { w: 1920, h: 1080 });
  assert.deepEqual(V.sizeOf('tall'), { w: 1080, h: 1920 });
  assert.deepEqual(V.sizeOf('?'), { w: 1280, h: 720 });
});

test('素材の種類: 拡張子から映像・画像・音を決める', () => {
  assert.equal(V.mediaKind('/a/b.WEBM'), 'video');
  assert.equal(V.mediaKind('x.mp4'), 'video');
  assert.equal(V.mediaKind('x.png'), 'image');
  assert.equal(V.mediaKind('x.wav'), 'audio');
  assert.equal(V.mediaKind('x.txt'), null);
});

test('段が受け付けるもの: 映像の段は映像と画像、音の段は音と映像（音だけ使う）、文字の段は文字', () => {
  assert.ok(V.accepts('video', 'video') && V.accepts('video', 'image') && !V.accepts('video', 'audio'));
  assert.ok(V.accepts('audio', 'audio') && V.accepts('audio', 'video') && !V.accepts('audio', 'image'));
  assert.ok(V.accepts('text', 'text') && !V.accepts('text', 'video'));
});

test('全体の長さ: いちばん後ろのクリップの終わり', () => {
  assert.equal(V.duration(sample()), 7);
});

test('ある時刻に映るもの: 映像の段のクリップと素材の中の位置、文字、音', () => {
  const p = sample();
  const a = V.activeAt(p, 3);
  assert.deepEqual(a.video.map((x) => [x.clip.id, x.src, x.alpha]), [['c1', 5, 1]]); // in 2 + (3 - 0)
  assert.deepEqual(a.text.map((x) => x.clip.id), ['c4']);
  assert.deepEqual(a.audio.map((x) => [x.clip.id, x.src, x.gain]), [['c1', 5, 1], ['c3', 2, 0.5]]);
  // 4 秒ちょうどは次のクリップ（終わりの時刻は含めない）
  assert.deepEqual(V.activeAt(p, 4).video.map((x) => x.clip.id), ['c2']);
  // 画像は音を持たない
  assert.ok(!V.activeAt(p, 5).audio.some((x) => x.clip.id === 'c2'));
  assert.deepEqual(V.activeAt(p, 7).video, []);
});

test('ある時刻に映るもの: 下の段（映像 1）から上の段（映像 2）の順に重ねる', () => {
  const p = sample();
  p.clips.push({ ...V.clipDefaults(), id: 'c5', track: 'v2', media: 'm2', start: 0, dur: 2 });
  assert.deepEqual(V.activeAt(p, 1).video.map((x) => x.clip.id), ['c1', 'c5']);
});

test('フェード: 黒から（始めの何秒）と黒へ（終わりの何秒）の重み', () => {
  const c = { ...V.clipDefaults(), start: 2, dur: 4, fadeIn: 1, fadeOut: 2 };
  assert.equal(V.fadeGain(c, 2), 0);
  assert.equal(V.fadeGain(c, 2.5), 0.5);
  assert.equal(V.fadeGain(c, 3), 1);
  assert.equal(V.fadeGain(c, 5), 0.5);
  assert.equal(V.fadeGain(c, 6), 0);
  assert.equal(V.fadeGain({ ...c, fadeIn: 0, fadeOut: 0 }, 2), 1);
  const p = sample();
  p.clips[0].fadeIn = 2;
  assert.ok(near(V.activeAt(p, 1).video[0].alpha, 0.5));
  assert.ok(near(V.activeAt(p, 1).audio[0].gain, 0.5)); // 音も同じだけ小さくする
});

test('重なり: カットなら後から始まるクリップが上に出て、下のクリップは隠れて音も止まる', () => {
  const p = sample();
  p.clips[1].start = 3; // c2 が c1 の終わり 1 秒に重なる
  const a = V.activeAt(p, 3.5);
  assert.deepEqual(a.video.map((x) => [x.clip.id, x.alpha]), [['c1', 0], ['c2', 1]]);
  assert.equal(a.audio.find((x) => x.clip.id === 'c1').gain, 0);
});

test('重なり: クロスフェードなら重なった所で重みを移す（映像も音も）', () => {
  const p = sample();
  const v2 = { id: 'm4', path: '/ビデオ/d.webm', kind: 'video', name: 'd.webm', duration: 10 };
  p.media.push(v2);
  p.clips[1] = { ...V.clipDefaults(), id: 'c2', track: 'v1', media: 'm4', start: 3, dur: 3, join: 'cross' };
  const a = V.activeAt(p, 3.25); // 重なり 3〜4 秒の 1/4
  const lo = a.video.find((x) => x.clip.id === 'c1'), hi = a.video.find((x) => x.clip.id === 'c2');
  assert.equal(lo.alpha, 1);
  assert.ok(near(hi.alpha, 0.25));
  assert.ok(near(a.audio.find((x) => x.clip.id === 'c1').gain, 0.75));
  assert.ok(near(a.audio.find((x) => x.clip.id === 'c2').gain, 0.25));
  assert.deepEqual(V.activeAt(p, 4.5).video.map((x) => [x.clip.id, x.alpha]), [['c2', 1]]);
});

test('つなぎ目: 前のクリップへ指定の秒だけ重ねて、後ろのクリップもいっしょに詰める', () => {
  const p = sample();
  p.clips.push({ ...V.clipDefaults(), id: 'c5', track: 'v1', media: 'm2', start: 9, dur: 1 });
  const r = V.crossfadeWithPrev(p, 'c2', 1);
  const by = (id) => r.clips.find((c) => c.id === id);
  assert.equal(by('c2').start, 3);
  assert.equal(by('c2').join, 'cross');
  assert.equal(by('c5').start, 8);
  assert.equal(by('c1').start, 0);
  assert.equal(by('c3').start, 1); // ほかの段は動かさない
  assert.equal(p.clips[1].start, 4); // 元の計画は変えない
  assert.equal(V.crossfadeWithPrev(p, 'c1', 1), null); // 前が無い
});

test('分ける: 再生位置で 2 つにし、後ろの半分は素材の中の位置を進める', () => {
  const p = sample();
  const r = V.splitClip(p, 'c1', 1.5, 'c9');
  const a = r.clips.find((c) => c.id === 'c1'), b = r.clips.find((c) => c.id === 'c9');
  assert.deepEqual([a.start, a.dur, a.in], [0, 1.5, 2]);
  assert.deepEqual([b.start, b.dur, b.in, b.media, b.track], [1.5, 2.5, 3.5, 'm1', 'v1']);
  assert.equal(p.clips.length, 4); // 元の計画は変えない
  // 端の近く（最小の長さより短くなる所）や外では分けない
  assert.equal(V.splitClip(p, 'c1', 0.05, 'c9'), null);
  assert.equal(V.splitClip(p, 'c1', 4, 'c9'), null);
  assert.equal(V.splitClip(p, 'nope', 1, 'c9'), null);
});

test('分ける: フェードの始めは前の半分に、終わりは後ろの半分に残し、つなぎ目は前の半分に残す', () => {
  const p = sample();
  Object.assign(p.clips[0], { fadeIn: 1, fadeOut: 1, join: 'cross' });
  const r = V.splitClip(p, 'c1', 2, 'c9');
  const a = r.clips.find((c) => c.id === 'c1'), b = r.clips.find((c) => c.id === 'c9');
  assert.deepEqual([a.fadeIn, a.fadeOut, a.join], [1, 0, 'cross']);
  assert.deepEqual([b.fadeIn, b.fadeOut, b.join], [0, 1, 'cut']);
});

test('分ける: 文字のクリップは文字と見た目をそのまま写す', () => {
  const r = V.splitClip(sample(), 'c4', 3, 'c9');
  const b = r.clips.find((c) => c.id === 'c9');
  assert.deepEqual([b.start, b.dur, b.text, b.track], [3, 1, 'こんにちは', 't1']);
});

test('切り詰める: 始めを動かすと、素材の中の位置もいっしょに動く', () => {
  const r = V.trimClip(sample(), 'c1', 'start', 1);
  const c = r.clips.find((x) => x.id === 'c1');
  assert.deepEqual([c.start, c.dur, c.in], [1, 3, 3]);
});

test('切り詰める: 映像は素材の始めより前・終わりより後ろへ伸ばせない', () => {
  const p = sample();
  p.clips[0].start = 5; // in 2 なので、始めは 3 秒まで戻せる
  const a = V.trimClip(p, 'c1', 'start', 0).clips[0];
  assert.deepEqual([a.start, a.in, a.dur], [3, 0, 6]);
  const b = V.trimClip(p, 'c1', 'end', 30).clips[0];
  assert.equal(b.dur, 8); // 素材 10 秒 - in 2
});

test('切り詰める: 最小の長さより短くしない。画像と文字は長さを自由に伸ばせる', () => {
  const p = sample();
  assert.equal(V.trimClip(p, 'c1', 'end', -5).clips[0].dur, V.MIN_DUR);
  assert.equal(V.trimClip(p, 'c1', 'start', 99).clips[0].dur, V.MIN_DUR);
  const img = V.trimClip(p, 'c2', 'end', 60).clips.find((c) => c.id === 'c2');
  assert.equal(img.dur, 56);
  const img2 = V.trimClip(p, 'c2', 'start', 1).clips.find((c) => c.id === 'c2');
  assert.deepEqual([img2.start, img2.dur, img2.in], [1, 6, 0]); // 画像は in を動かさない
  const txt = V.trimClip(p, 'c4', 'start', -3).clips.find((c) => c.id === 'c4');
  assert.deepEqual([txt.start, txt.dur], [0, 4]); // 0 秒より前へは伸ばさない
});

test('動かす: 0 秒より前へは動かさず、受け付ける段へだけ移る', () => {
  const p = sample();
  assert.equal(V.moveClip(p, 'c1', -3).clips[0].start, 0);
  assert.equal(V.moveClip(p, 'c1', 2.5, 'v2').clips[0].track, 'v2');
  assert.equal(V.moveClip(p, 'c1', 2.5, 'a2').clips[0].track, 'a2'); // 映像は音の段へも置ける（音だけ使う）
  assert.equal(V.moveClip(p, 'c2', 2.5, 'a2').clips[1].track, 'v1'); // 画像は音の段へ行かない
  assert.equal(V.moveClip(p, 'c4', 2.5, 'v1').clips[3].track, 't1');
});

test('スナップ: ほかのクリップの端と再生位置へ、近ければ吸い付く', () => {
  const p = sample();
  const ts = V.snapTargets(p, { exclude: 'c2', playhead: 5.5 });
  assert.deepEqual(ts, [0, 1, 2, 4, 5.5, 6]); // 0・c1 の端・c3 の端・c4 の端・再生位置
  assert.deepEqual(V.snapValue(3.92, ts, 0.1), { t: 4, to: 4 });
  assert.deepEqual(V.snapValue(3.5, ts, 0.1), { t: 3.5, to: null });
  // 動かすときは、始めと終わりのうち近い方を合わせる
  assert.deepEqual(V.snapMove(1.55, 3.9, ts, 0.1), { start: 1.6, to: 5.5 }); // 終わり 5.45 → 5.5
  assert.deepEqual(V.snapMove(3.97, 1, ts, 0.1), { start: 4, to: 4 });
  assert.deepEqual(V.snapMove(3, 0.5, ts, 0.1), { start: 3, to: null });
});

test('並べ替え: 同じ段の隣のクリップと順番を入れ替え、すき間は保つ', () => {
  const p = sample();
  p.clips[1].start = 5; // c1 [0,4]、1 秒あけて c2 [5,8]
  const r = V.reorderClip(p, 'c2', -1);
  const a = r.clips.find((c) => c.id === 'c1'), b = r.clips.find((c) => c.id === 'c2');
  assert.deepEqual([b.start, a.start], [0, 4]); // c2 [0,3]、1 秒あけて c1 [4,8]
  const back = V.reorderClip(r, 'c2', 1);
  assert.deepEqual(back.clips.filter((c) => c.track === 'v1').map((c) => [c.id, c.start]).sort(), [['c1', 0], ['c2', 5]]);
  assert.equal(V.reorderClip(p, 'c1', -1), null); // 先頭より前は無い
});

test('素材を置く: 段を決めないときは主な段（映像 1・音 1）の終わりへ、長さは素材の長さ（画像は 3 秒）', () => {
  const p = sample();
  const r1 = V.placeMedia(p, 'm1');
  const c1 = r1.project.clips.find((c) => c.id === r1.id);
  assert.deepEqual([c1.track, c1.start, c1.dur, c1.in], ['v1', 7, 10, 0]);
  const r0 = V.placeMedia(p, 'm3');
  assert.deepEqual([r0.project.clips.at(-1).track, r0.project.clips.at(-1).start], ['a1', 6]);
  const r2 = V.placeMedia(p, 'm2', 'v1');
  assert.deepEqual([r2.project.clips.at(-1).start, r2.project.clips.at(-1).dur], [7, V.IMAGE_DUR]);
  const r3 = V.placeMedia(p, 'm3', 'a2', 2.5);
  assert.deepEqual([r3.project.clips.at(-1).track, r3.project.clips.at(-1).start], ['a2', 2.5]);
  assert.equal(V.placeMedia(p, 'm2', 'a1'), null); // 画像は音の段へ置けない
  assert.notEqual(r1.id, 'c1');
});

test('文字を足す: 文字の段の指定の時刻に、決まった見た目で 3 秒', () => {
  const r = V.addText(sample(), 6, '見出し');
  const c = r.project.clips.find((x) => x.id === r.id);
  assert.deepEqual([c.track, c.start, c.dur, c.text], ['t1', 6, 3, '見出し']);
  assert.ok(c.size > 0 && /^#[0-9a-f]{6}$/.test(c.color));
});

test('消す: そのクリップだけを外す', () => {
  const r = V.removeClip(sample(), 'c2');
  assert.deepEqual(r.clips.map((c) => c.id), ['c1', 'c3', 'c4']);
});

test('文字の置き場所: 大きさは出力の高さの割合、位置は割合から画素へ', () => {
  const b = V.textBox({ ...V.textDefaults(), text: 'あ\nいう', size: 10, x: 0.5, y: 0.8 }, 1280, 720);
  assert.deepEqual(b, { px: 72, x: 640, y: 576, lines: ['あ', 'いう'], lineH: 72 * 1.25 });
});

test('はめ込み: 縦横の比を保って、出力の中に収める（余りは黒）', () => {
  assert.deepEqual(V.fitRect(640, 360, 1280, 720), { x: 0, y: 0, w: 1280, h: 720 });
  assert.deepEqual(V.fitRect(800, 600, 1280, 720), { x: 160, y: 0, w: 960, h: 720 });
  assert.deepEqual(V.fitRect(1920, 1080, 1080, 1920), { x: 0, y: 656.25, w: 1080, h: 607.5 });
});

test('時刻の文字: 分:秒.百分の一秒、1 時間を越えたら時も', () => {
  assert.equal(V.fmtTime(0), '0:00.00');
  assert.equal(V.fmtTime(3.256), '0:03.25');
  assert.equal(V.fmtTime(62.5), '1:02.50');
  assert.equal(V.fmtTime(3723.1), '1:02:03.10');
  assert.equal(V.fmtTime(-1), '0:00.00');
});

test('コマ送り: コマの速さに合わせて 1 コマずつ進む・戻る', () => {
  assert.ok(near(V.frameStep(1, 30, 1), 31 / 30));
  assert.ok(near(V.frameStep(1.01, 30, -1), 29 / 30)); // 一番近いコマにそろえてから
  assert.equal(V.frameStep(0, 30, -1), 0);
});

test('時間の目盛り: 拡大の度合いに合わせて、読みやすい間隔を選ぶ', () => {
  assert.equal(V.rulerStep(100).major, 1);
  assert.equal(V.rulerStep(10).major, 10);
  assert.equal(V.rulerStep(400).major, 0.25);
  const s = V.rulerStep(100);
  assert.ok(s.minor < s.major && near((s.major / s.minor) % 1, 0));
});

test('これから始まるクリップ: 先に用意する（前もって位置を合わせる）ために、少し先までに始まる音と映像を返す', () => {
  const ids = V.upcoming(sample(), 0.6, 0.5).map((c) => c.id);
  assert.deepEqual(ids, ['c3']);
});

test('計画の検証: 正しい形はそのまま読み、いらない値を落とす', () => {
  const p = sample();
  const r = V.validateProject(JSON.parse(V.serialize(p)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.project, p);
  assert.deepEqual(r.warnings, []);
});

test('計画の検証: 形が違うものは読まない', () => {
  assert.equal(V.validateProject(null).ok, false);
  assert.equal(V.validateProject([]).ok, false);
  assert.equal(V.validateProject({ kind: 'other' }).ok, false);
  assert.match(V.validateProject({ kind: 'future-os-video', version: 9 }).errors[0], /新しい版/);
});

test('計画の検証: おかしなクリップは外して知らせ、数は範囲に収める', () => {
  const p = JSON.parse(V.serialize(sample()));
  p.clips.push({ id: 'x1', track: 'v9', start: 0, dur: 1, media: 'm1' }); // 知らない段
  p.clips.push({ id: 'x2', track: 'v1', start: 'a', dur: 1, media: 'm1' }); // 数でない
  p.clips.push({ id: 'x3', track: 'v1', start: 0, dur: 1, media: 'zz' }); // 知らない素材
  p.clips[0].volume = 9; p.clips[0].fadeIn = -1;
  p.settings.fps = 1000; p.settings.size = 'huge';
  p.media[0].path = 42; // パスが文字でない素材は外す（使っていたクリップも外す）
  const r = V.validateProject(p);
  assert.equal(r.ok, true);
  assert.deepEqual(r.project.clips.map((c) => c.id), ['c2', 'c3', 'c4']);
  assert.equal(r.warnings.length, 7); // 素材 1・クリップ 4・設定 2
  assert.deepEqual(r.project.settings, { size: '720p', fps: 30 });
  const q = JSON.parse(V.serialize(sample()));
  q.clips[0].volume = 9; q.clips[0].fadeIn = -1;
  const c = V.validateProject(q).project.clips[0];
  assert.deepEqual([c.volume, c.fadeIn], [2, 0]);
});

test('計画の検証: 同じ id のクリップは 2 つ目を外す', () => {
  const p = JSON.parse(V.serialize(sample()));
  p.clips.push({ ...p.clips[0] });
  const r = V.validateProject(p);
  assert.equal(r.project.clips.length, 4);
  assert.equal(r.warnings.length, 1);
});

test('見つからない素材: 仮想ドライブに無いパスの素材と、それを使うクリップ', () => {
  const r = V.missing(sample(), new Set(['/ビデオ/a.webm', '/音楽/c.wav']));
  assert.deepEqual(r.media, ['m2']);
  assert.deepEqual(r.clips, ['c2']);
});

test('元に戻す・やり直し: 変える前の状態を積み、戻した分はやり直せる。新しく変えたらやり直しは消える', () => {
  const h = new V.History(3);
  h.push('A'); h.push('B');
  assert.equal(h.undo('C'), 'B');
  assert.equal(h.undo('B'), 'A');
  assert.equal(h.undo('A'), null);
  assert.equal(h.redo('A'), 'B');
  assert.equal(h.redo('B'), 'C');
  assert.equal(h.redo('C'), null);
  h.undo('C'); h.push('X');
  assert.equal(h.redoCount, 0);
  h.push('1'); h.push('2'); h.push('3');
  assert.equal(h.undoCount, 3); // 上限まで
});

test('書き出しの形式: ブラウザが録れる WebM の形式を選ぶ', () => {
  assert.equal(V.pickMime((m) => m === 'video/webm;codecs=vp8,opus'), 'video/webm;codecs=vp8,opus');
  assert.equal(V.pickMime(() => true), 'video/webm;codecs=vp9,opus');
  assert.equal(V.pickMime(() => false), '');
});

test('名前: 書き出しの名前は日時から', () => {
  assert.equal(V.defaultName(new Date(2026, 10, 19, 9, 5, 7)), '動画 2026-11-19 09-05-07.webm');
});

test('音の波形: 区間ごとの一番大きい振れ幅', () => {
  assert.deepEqual(V.peaks(Float32Array.from([0, 0.5, -1, 0.25, 0, 0]), 3), [0.5, 1, 0]);
});

/* ---------- WebM の長さ ---------- */
// EBML の要素を作る（id はバイトの並び、大きさは 8 バイトの長さで書く）
const el = (id, data) => { const size = [0x01, 0, 0, 0, 0, 0, 0, 0]; let n = data.length; for (let i = 7; i >= 1; i--) { size[i] = n & 255; n = Math.floor(n / 256); } return [...id, ...size, ...data]; };
const uint = (id, v) => [...id, 0x81, v];
function fakeWebM({ withDuration = false, segKnown = false } = {}) {
  const info = el([0x15, 0x49, 0xa9, 0x66], [...[0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40], ...uint([0x4d, 0x80], 67), ...(withDuration ? [0x44, 0x89, 0x88, 0, 0, 0, 0, 0, 0, 0, 0] : [])]);
  const tracks = el([0x16, 0x54, 0xae, 0x6b], [0xae, 0x80]);
  const cluster = [0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xe7, 0x81, 0x00];
  const body = [...info, ...tracks, ...cluster];
  const seg = segKnown ? el([0x18, 0x53, 0x80, 0x67], body) : [0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...body];
  return Uint8Array.from([...el([0x1a, 0x45, 0xdf, 0xa3], [0x42, 0x86, 0x81, 0x01]), ...seg]);
}

test('WebM の長さ: 録った WebM の Info に長さ（ミリ秒）を書き足し、ほかの中身は保つ', () => {
  const src = fakeWebM();
  assert.equal(V.readWebmDuration(src), null);
  const out = V.fixWebmDuration(src, 4321.5);
  assert.equal(V.readWebmDuration(out), 4321.5);
  assert.equal(out.length, src.length + 11);
  assert.deepEqual([...out.slice(-15)], [...src.slice(-15)]); // 後ろの塊は同じ
});

test('WebM の長さ: すでに長さがあれば書き換え、大きさが決まった Segment は大きさも直す', () => {
  const a = V.fixWebmDuration(fakeWebM({ withDuration: true }), 1000);
  assert.equal(V.readWebmDuration(a), 1000);
  const src = fakeWebM({ segKnown: true });
  const b = V.fixWebmDuration(src, 2500);
  assert.equal(V.readWebmDuration(b), 2500);
  const segSize = (u) => Number(new DataView(u.buffer, u.byteOffset).getBigUint64(20) & 0x00ffffffffffffffn);
  assert.equal(segSize(b), segSize(src) + 11);
});

test('WebM の長さ: WebM でないものはそのまま返す', () => {
  const x = Uint8Array.from([1, 2, 3, 4]);
  assert.equal(V.fixWebmDuration(x, 100), x);
  assert.equal(V.readWebmDuration(x), null);
});
