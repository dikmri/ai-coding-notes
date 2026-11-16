// Future OS の SID 風シンセ（音を作る部分と鍵盤の割り当て）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SidEngine, renderSong, keyToNote, defaultSong } from '../os/js/core/sidengine.mjs';
import { songLength, stepSec } from '../os/js/core/song.mjs';

const rms = (a, from = 0, to = a.length) => { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, to - from)); };
const SR = 8000;

test('鍵盤: 下の段は Z が C、上の段は Q が1オクターブ上の C。割り当てのないキーは null', () => {
  assert.equal(keyToNote('KeyZ', 4), 60);
  assert.equal(keyToNote('KeyS', 4), 61);
  assert.equal(keyToNote('KeyM', 4), 71);
  assert.equal(keyToNote('KeyQ', 4), 72);
  assert.equal(keyToNote('Digit2', 4), 73);
  assert.equal(keyToNote('KeyP', 4), 88);
  assert.equal(keyToNote('KeyZ', 2), 36);
  assert.equal(keyToNote('KeyA', 4), null);
  assert.equal(keyToNote('Digit1', 4), null);
});

test('音源: 鳴らすと音が出て、止めて余韻が過ぎると無音に戻る', () => {
  const e = new SidEngine(SR), song = defaultSong();
  song.voices[0] = { ...song.voices[0], wave: 4, a: 0.001, d: 0.01, s: 0.8, r: 0.02 };
  e.setParams(song);
  const out = new Float32Array(SR);
  e.noteOn(0, 60);
  e.render(out, 0, SR / 2);
  e.noteOff(0);
  e.render(out, SR / 2, SR / 2);
  assert.ok(rms(out, 100, SR / 2) > 0.05, '鳴っている間は音がある');
  assert.ok(rms(out, SR - 400, SR) < 1e-4, '余韻のあとは無音');
});

test('音源: 消音にした声部は鳴らない', () => {
  const e = new SidEngine(SR), song = defaultSong();
  song.voices[1] = { ...song.voices[1], wave: 2, mute: true };
  e.setParams(song);
  const out = new Float32Array(2000);
  e.noteOn(1, 60); e.render(out, 0, 2000);
  assert.ok(rms(out) < 1e-6);
});

test('音源: 低い遮断周波数のローパスを通すと、ノコギリ波の高い音は小さくなる', () => {
  const make = (filter) => {
    const e = new SidEngine(SR), song = defaultSong();
    song.voices[0] = { ...song.voices[0], wave: 2, a: 0.001, s: 1, filter };
    song.filter = { lp: true, bp: false, hp: false, cutoff: 150, res: 0 };
    e.setParams(song);
    const out = new Float32Array(4000);
    e.noteOn(0, 84); e.render(out, 0, 4000);
    return rms(out, 1000);
  };
  assert.ok(make(true) < make(false) * 0.5);
});

test('音源: 雑音・同期・リング変調を選んでも値は -1〜1 に収まり、NaN にならない', () => {
  const e = new SidEngine(SR), song = defaultSong();
  song.voices = [
    { ...song.voices[0], wave: 8 },
    { ...song.voices[1], wave: 1, ring: true },
    { ...song.voices[2], wave: 2 | 4, sync: true, filter: true },
  ];
  song.filter = { lp: true, bp: true, hp: true, cutoff: 3000, res: 1 };
  e.setParams(song);
  const out = new Float32Array(4000);
  e.noteOn(0, 60); e.noteOn(1, 64); e.noteOn(2, 67);
  e.render(out, 0, 4000);
  assert.ok(out.every((v) => Number.isFinite(v) && v >= -1 && v <= 1));
  assert.ok(rms(out) > 0.01);
});

test('並び順の再生: ステップの位置が進み、曲の最後で頭に戻る', () => {
  const song = defaultSong();
  song.bpm = 150; song.order = ['A', 'B']; song.patterns.B = song.patterns.A.map((v) => v.slice());
  song.patterns.A[0][0] = 60;
  const e = new SidEngine(SR);
  e.setParams(song);
  e.play(song, { loop: true });
  const step = Math.round((60 / 150 / 4) * SR), out = new Float32Array(step);
  assert.deepEqual(e.position(), { order: 0, step: 0 });
  e.render(out, 0, step); e.render(out, 0, 5);
  assert.deepEqual(e.position(), { order: 0, step: 1 });
  for (let k = 0; k < 31; k++) e.render(out, 0, step);
  assert.deepEqual(e.position(), { order: 0, step: 0 });
});

test('1つのパターンだけを繰り返す再生もできる', () => {
  const song = defaultSong();
  song.order = ['A', 'B']; song.patterns.B = song.patterns.A.map((v) => v.slice());
  const e = new SidEngine(SR);
  e.setParams(song);
  e.play(song, { loop: true, pattern: 'B' });
  assert.deepEqual(e.position(), { order: 1, step: 0 });
});

test('曲の書き出し: 長さは曲の長さ＋余韻で、同じ曲からは毎回同じ音になる', () => {
  const song = defaultSong();
  song.patterns.A[0][0] = 60; song.patterns.A[1][4] = 64; song.patterns.A[2][8] = 67; song.patterns.A[0][12] = -1;
  const a = renderSong(song, SR, 0.5), b = renderSong(song, SR, 0.5);
  assert.equal(a.length, Math.ceil((songLength(song) + 0.5) * SR));
  assert.ok(rms(a) > 0.01);
  assert.deepEqual(a, b);
});

test('再生中に曲を書き換えても、位置はそのままで新しい音符が鳴る。速さを変えても同じステップに留まる', () => {
  const song = defaultSong();
  song.order = ['A', 'A'];
  const e = new SidEngine(SR);
  e.setParams(song);
  e.play(song, { loop: true });
  const step = Math.round(stepSec(song) * SR), out = new Float32Array(step * 5);
  e.render(out, 0, step * 5 + 0);
  e.render(out, 0, 10);
  assert.deepEqual(e.position(), { order: 0, step: 5 });
  const s2 = JSON.parse(JSON.stringify(song));
  s2.patterns.A[0][6] = 72; s2.bpm = 60;
  e.update(s2);
  assert.deepEqual(e.position(), { order: 0, step: 5 });
  e.render(out, 0, Math.round(stepSec(s2) * SR));
  assert.equal(e.v[0].note, 72);
});
