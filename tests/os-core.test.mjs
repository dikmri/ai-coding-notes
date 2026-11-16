// Future OS の中核（DOM を使わない計算）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../os/js/core/path.mjs';
import * as A from '../os/js/core/assoc.mjs';
import * as M from '../os/js/core/mesh.mjs';
import * as O from '../os/js/core/obj.mjs';
import { encodeWAV } from '../os/js/core/wav.mjs';
import * as S from '../os/js/core/sid.mjs';
import * as G from '../os/js/core/song.mjs';

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

test('パス: 正規化・結合・名前の取り出し', () => {
  assert.equal(P.normalize('/a/./b/../c/'), '/a/c');
  assert.equal(P.normalize('a//b'), '/a/b');
  assert.equal(P.normalize('/..'), '/');
  assert.equal(P.join('/ドキュメント', 'メモ', '../日記.txt'), '/ドキュメント/日記.txt');
  assert.equal(P.dirname('/a/b.txt'), '/a');
  assert.equal(P.dirname('/a'), '/');
  assert.equal(P.basename('/a/b.txt'), 'b.txt');
  assert.equal(P.extname('b.tar.gz'), '.gz');
  assert.equal(P.extname('.hidden'), '');
  assert.equal(P.extname('名前なし'), '');
});

test('パス: 同じ名前があれば (2) (3) と番号を付ける。フォルダを自分の中へは動かせない', () => {
  assert.equal(P.uniqueName(['メモ.txt', 'メモ (2).txt'], 'メモ.txt'), 'メモ (3).txt');
  assert.equal(P.uniqueName([], 'a.txt'), 'a.txt');
  assert.equal(P.uniqueName(['新しいフォルダ'], '新しいフォルダ'), '新しいフォルダ (2)');
  assert.equal(P.isInside('/a/b', '/a'), true);
  assert.equal(P.isInside('/a', '/a'), true);
  assert.equal(P.isInside('/ab', '/a'), false);
});

test('関連付け: 拡張子から開くアプリと種類の名前を決める', () => {
  assert.equal(A.appFor('メモ.TXT'), 'notepad');
  assert.equal(A.appFor('ロケット.lpm'), 'modeler');
  assert.equal(A.appFor('model.obj'), 'modeler');
  assert.equal(A.appFor('曲.sng'), 'synth');
  assert.equal(A.appFor('写真.png'), 'viewer');
  assert.equal(A.appFor('謎.xyz'), null);
  assert.equal(A.typeName('メモ.txt'), 'テキスト文書');
});

test('立体: 基本の形の頂点と面の数', () => {
  const c = M.cube();
  assert.deepEqual([c.v.length, c.f.length], [8, 6]);
  const s0 = M.icosphere(1, 0), s1 = M.icosphere(1, 1);
  assert.deepEqual([s0.v.length, s0.f.length, s1.v.length, s1.f.length], [12, 20, 42, 80]);
  for (const p of s1.v) assert.ok(near(Math.hypot(...p), 1));
  const y = M.cylinder(8);
  assert.deepEqual([y.v.length, y.f.length], [16, 10]);
  const k = M.cone(6);
  assert.deepEqual([k.v.length, k.f.length], [7, 7]);
  assert.deepEqual([M.plane().v.length, M.plane().f.length], [4, 1]);
});

test('立体: 閉じた形はどれも V - E + F = 2、面は外向き', () => {
  for (const m of [M.cube(), M.icosphere(1, 1), M.cylinder(8), M.cone(6)]) {
    assert.equal(m.v.length - M.edges(m).length + m.f.length, 2);
    const ctr = M.centroid(m, m.v.map((_, i) => i));
    for (let fi = 0; fi < m.f.length; fi++) {
      const n = M.faceNormal(m, fi), fc = M.centroid(m, m.f[fi].i);
      assert.ok(n[0] * (fc[0] - ctr[0]) + n[1] * (fc[1] - ctr[1]) + n[2] * (fc[2] - ctr[2]) > 0);
    }
  }
});

test('立体: 面の押し出しで面が外へ伸び、横の面が4枚増え、形は閉じたまま', () => {
  const c = M.cube(2);
  const top = c.f.findIndex((_, i) => near(M.faceNormal(c, i)[1], 1));
  const e = M.extrude(c, [top], 1.5);
  assert.deepEqual([e.v.length, e.f.length], [12, 10]);
  assert.ok(near(Math.max(...e.v.map((p) => p[1])), 2.5));
  assert.equal(e.v.length - M.edges(e).length + e.f.length, 2);
  assert.equal(c.f.length, 6, '元の形は変えない');
});

test('立体: 選んだ頂点の移動・拡大・回転と、面の削除', () => {
  const c = M.cube(2);
  const moved = M.moveVerts(c, [0], [0, 0, 5]);
  assert.ok(near(moved.v[0][2], c.v[0][2] + 5));
  const big = M.scaleVerts(c, c.v.map((_, i) => i), 2, [0, 0, 0]);
  assert.ok(near(Math.max(...big.v.map((p) => p[0])), 2));
  const rot = M.rotateVerts(c, c.v.map((_, i) => i), [0, 1, 0], Math.PI / 2, [0, 0, 0]);
  assert.ok(near(Math.max(...rot.v.map((p) => p[0])), 1));
  const d = M.deleteFaces(c, [0]);
  assert.equal(d.f.length, 5);
  assert.equal(d.v.length, 8);
});

test('OBJ: 書き出して読み戻すと、頂点・面・色が同じ', () => {
  const c = M.cube(2);
  c.f[0].c = '#c23b22';
  const text = O.toOBJ([{ name: '箱', mesh: c }]);
  assert.match(text, /^v /m);
  assert.match(text, /^f 1 /m);
  assert.match(O.toMTL([{ name: '箱', mesh: c }]), /newmtl c_c23b22/);
  const back = O.fromOBJ(text);
  assert.equal(back.length, 1);
  assert.equal(back[0].name, '箱');
  assert.deepEqual([back[0].mesh.v.length, back[0].mesh.f.length], [8, 6]);
  assert.equal(back[0].mesh.f[0].c, '#c23b22');
  assert.ok(near(back[0].mesh.v[3][1], c.v[3][1]));
});

test('OBJ: v/vt/vn 形式と負の番号も読める', () => {
  const t = 'o 三角\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//1 3//1\nf -3/1/1 -2/1/1 -1/1/1\n';
  const r = O.fromOBJ(t);
  assert.deepEqual(r[0].mesh.f.map((f) => f.i), [[0, 1, 2], [0, 1, 2]]);
});

test('WAV: 見出しと 16 ビットの値（はみ出しは切り詰める）', () => {
  const b = encodeWAV([new Float32Array([0, 1, -1, 2])], 8000);
  const dv = new DataView(b.buffer);
  const str = (o, n) => String.fromCharCode(...b.slice(o, o + n));
  assert.equal(str(0, 4), 'RIFF');
  assert.equal(str(8, 4), 'WAVE');
  assert.equal(dv.getUint16(22, true), 1);
  assert.equal(dv.getUint32(24, true), 8000);
  assert.equal(dv.getUint16(34, true), 16);
  assert.equal(dv.getUint32(40, true), 8);
  assert.deepEqual([0, 1, 2, 3].map((i) => dv.getInt16(44 + i * 2, true)), [0, 32767, -32768, 32767]);
  assert.equal(b.length, 44 + 8);
});

test('SID: 音の高さと音名', () => {
  assert.ok(near(S.noteFreq(69), 440));
  assert.ok(near(S.noteFreq(57), 220));
  assert.equal(S.noteName(60), 'C-4');
  assert.equal(S.noteName(61), 'C#4');
  assert.equal(S.parseNote('C#4'), 61);
  assert.equal(S.parseNote('A-4'), 69);
});

test('SID: 波形（三角・のこぎり・矩形）と、重ねたときは小さい方になる', () => {
  assert.ok(near(S.waveSample(S.TRI, 0, 0.5, 0), -1, 0.01));
  assert.ok(near(S.waveSample(S.TRI, 0.5, 0.5, 0), 1, 0.01));
  assert.ok(near(S.waveSample(S.SAW, 0, 0.5, 0), -1, 0.01));
  assert.ok(near(S.waveSample(S.PUL, 0.2, 0.5, 0), 1));
  assert.ok(near(S.waveSample(S.PUL, 0.7, 0.5, 0), -1));
  for (const ph of [0.1, 0.3, 0.6, 0.9]) {
    const both = S.waveSample(S.TRI | S.SAW, ph, 0.5, 0);
    assert.ok(both <= Math.min(S.waveSample(S.TRI, ph, 0.5, 0), S.waveSample(S.SAW, ph, 0.5, 0)) + 1e-9);
  }
});

test('SID: 雑音のレジスタは0にならず、すぐには繰り返さない', () => {
  let s = 0x7ffff8;
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { s = S.lfsrNext(s); assert.ok(s > 0 && s <= 0x7fffff); seen.add(s); }
  assert.equal(seen.size, 2000);
});

test('SID: エンベロープは上がって保ち、離すと下がって止まる', () => {
  const p = { a: 0.01, d: 0.05, s: 0.6, r: 0.1 };
  let e = { stage: 'off', level: 0 };
  for (let i = 0; i < 10; i++) e = S.envStep(e, true, p, 0.001);
  assert.ok(e.level > 0.9);
  for (let i = 0; i < 200; i++) e = S.envStep(e, true, p, 0.001);
  assert.equal(e.stage, 's');
  assert.ok(near(e.level, 0.6, 0.01));
  for (let i = 0; i < 300; i++) e = S.envStep(e, false, p, 0.001);
  assert.equal(e.stage, 'off');
  assert.equal(e.level, 0);
});

test('SID: フィルター（状態変数型）は一定の入力でローパスが入力に近づき、ハイパスが0に近づく', () => {
  let st = { lp: 0, bp: 0 };
  let out;
  for (let i = 0; i < 4000; i++) { out = S.svf(st, 0.5, 1000, 0.2, 44100); st = out; }
  assert.ok(near(out.lp, 0.5, 0.01));
  assert.ok(near(out.hp, 0, 0.01));
});

test('曲: 16 ステップの並びから、鳴らす時刻の一覧と長さを作る', () => {
  const song = { bpm: 120, order: ['A', 'B'], patterns: { A: [[60, null, -1, null, ...Array(12).fill(null)], Array(16).fill(null), Array(16).fill(null)], B: [Array(16).fill(null), [48, ...Array(15).fill(null)], Array(16).fill(null)] } };
  const step = 60 / 120 / 4;
  const ev = G.songEvents(song);
  assert.deepEqual(ev[0], { t: 0, voice: 0, type: 'on', note: 60 });
  assert.ok(ev.some((e) => e.type === 'off' && e.voice === 0 && near(e.t, step * 2)));
  assert.ok(ev.some((e) => e.type === 'on' && e.voice === 1 && e.note === 48 && near(e.t, step * 16)));
  assert.ok(near(G.songLength(song), step * 32));
});
