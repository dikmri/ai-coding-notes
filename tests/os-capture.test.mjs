// 画面キャプチャの計算（切り抜く四角、プレビューの倍率、四隅のつまみ、保存の名前、画面共有の誤りの文）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../os/js/core/capture.mjs';

test('四角: 2点から、向きをそろえた四角', () => {
  assert.deepEqual(K.normRect(50, 40, 10, 20), { x: 10, y: 20, w: 40, h: 20 });
  assert.deepEqual(K.normRect(10, 20, 10, 20), { x: 10, y: 20, w: 0, h: 0 });
});

test('四角: 画像の内に収め、整数にする', () => {
  assert.deepEqual(K.clampRect({ x: -5, y: 10.6, w: 50, h: 300 }, 40, 100), { x: 0, y: 11, w: 40, h: 89 });
  assert.equal(K.clampRect({ x: 500, y: 0, w: 10, h: 10 }, 40, 100), null); // 外にはみ出したものは無し
});

test('倍率: プレビューの上の四角を、画像の画素の四角に直す', () => {
  assert.deepEqual(K.toImageRect({ x: 10, y: 20, w: 100, h: 50 }, 0.5), { x: 20, y: 40, w: 200, h: 100 });
});

test('四隅のつまみ: 引いた分だけ大きさを変え、小さくなりすぎない', () => {
  const r = { x: 10, y: 10, w: 100, h: 80 };
  assert.deepEqual(K.resizeRect(r, 'br', 20, 10), { x: 10, y: 10, w: 120, h: 90 });
  assert.deepEqual(K.resizeRect(r, 'tl', 20, 10), { x: 30, y: 20, w: 80, h: 70 });
  assert.deepEqual(K.resizeRect(r, 'tr', -200, 0, 8), { x: 10, y: 10, w: 8, h: 80 });
  assert.deepEqual(K.resizeRect(r, 'bl', 0, -500, 8), { x: 10, y: 10, w: 100, h: 8 });
});

test('保存の名前: 撮った日時から', () => {
  assert.equal(K.defaultName(new Date(2026, 10, 17, 9, 5, 7)), '画面 2026-11-17 09-05-07.png');
});

test('画面共有の誤り: 取り消し・使えないときの文（壊れずに次にできることを案内する）', () => {
  assert.match(K.errorText({ name: 'NotAllowedError' }), /取り消されました/);
  assert.match(K.errorText({ name: 'NotSupportedError' }), /画面共有で撮れません/);
  assert.match(K.errorText({ name: 'X', message: 'y' }), /撮れませんでした/);
});

/* ---------- 録画（2026-11-19） ---------- */

test('経過の時間の文字: 分:秒、1 時間をこえたら 時:分:秒', () => {
  assert.equal(K.elapsedText(0), '00:00');
  assert.equal(K.elapsedText(5999), '00:05'); // 秒は切り捨て
  assert.equal(K.elapsedText(65_000), '01:05');
  assert.equal(K.elapsedText(3_723_000), '1:02:03');
  assert.equal(K.elapsedText(-40), '00:00');
});

test('画質: 段ごとのビットレート。60 コマ/秒は 1.5 倍、知らない段は「ふつう」', () => {
  assert.deepEqual(K.QUALITIES.map((x) => x.id), ['light', 'normal', 'fine']);
  assert.equal(K.videoBps('normal', 30), 4_000_000);
  assert.equal(K.videoBps('normal', 60), 6_000_000);
  assert.equal(K.videoBps('light', 30), 1_500_000);
  assert.equal(K.videoBps('fine', 60), 12_000_000);
  assert.equal(K.videoBps('???', 30), 4_000_000);
});

test('大きさ: ビットレートからの見込み、1 分あたり、文字', () => {
  assert.equal(K.estimateBytes(60_000, 4_128_000), 30_960_000);
  assert.equal(K.perMinute(1_000_000, 10_000), 6_000_000);
  assert.equal(K.perMinute(1_000_000, 1500), null); // 短すぎるときは見込まない
  assert.equal(K.sizeText(512), '512 バイト');
  assert.equal(K.sizeText(1536), '1.5 KB');
  assert.equal(K.sizeText(5 * 1048576), '5.0 MB');
  assert.equal(K.sizeText(1.5 * 1073741824), '1.5 GB');
});

test('大きさの帯の文: 録る前はビットレートの見込み、録っている間は今の大きさと 1 分あたり', () => {
  assert.equal(K.sizeLine({ bps: 4_128_000 }), '1 分で約 29.5 MB まで');
  assert.equal(K.sizeLine({ bytes: 2 * 1048576, ms: 20_000, bps: 4_128_000 }), '約 2.0 MB（1 分で約 6.0 MB）');
  // 始めたばかりで 1 分あたりを出せないときは、ビットレートの見込みを使う
  assert.equal(K.sizeLine({ bytes: 0, ms: 500, bps: 4_128_000 }), '約 0 バイト（1 分で約 29.5 MB まで）');
});

test('録画の名前: 録った日時から、拡張子は .webm', () => {
  assert.equal(K.videoName(new Date(2026, 10, 19, 9, 5, 7)), '録画 2026-11-19 09-05-07.webm');
});

test('録る形式: 使える最初の WebM を選ぶ。音が無いときは音の符号を付けない', () => {
  const only = (ok) => (m) => ok.includes(m);
  assert.equal(K.pickMime(only(['video/webm;codecs=vp9,opus', 'video/webm']), true), 'video/webm;codecs=vp9,opus');
  assert.equal(K.pickMime(only(['video/webm;codecs=vp8,opus', 'video/webm']), true), 'video/webm;codecs=vp8,opus');
  assert.equal(K.pickMime(only(['video/webm;codecs=vp9', 'video/webm;codecs=vp9,opus']), false), 'video/webm;codecs=vp9');
  assert.equal(K.pickMime(only([]), true), '');
});

test('録画の誤りの文: 画面とマイク、それぞれ次にできることを案内する', () => {
  assert.match(K.recErrorText({ name: 'NotAllowedError' }, 'screen'), /取り消されました.*録画を始める/);
  assert.match(K.recErrorText({ name: 'NotAllowedError' }, 'mic'), /マイク.*許可/);
  assert.match(K.recErrorText({ name: 'NotFoundError' }, 'mic'), /マイクが見つかりません/);
  assert.match(K.recErrorText({ name: 'NotReadableError' }, 'mic'), /ほかのアプリ/);
  assert.match(K.recErrorText({ name: 'NotSupportedError' }, 'screen'), /録画できません/);
  assert.match(K.recErrorText({ name: 'X', message: 'y' }, 'screen'), /録画を始められませんでした（y）/);
});

/* ---------- WebM の長さ ---------- */
// 確かめ用の小さな WebM を組み立てる（Chrome の MediaRecorder と同じく、Segment と Cluster は大きさ不明）
const vint = (n, len) => { const b = new Array(len); for (let i = len - 1; i >= 0; i--) { b[i] = n % 256; n = Math.floor(n / 256); } b[0] |= 0x80 >> (len - 1); return b; };
const sizeOf = (n) => { for (let len = 1; len <= 8; len++) if (n < 2 ** (7 * len) - 1) return vint(n, len); };
const UNKNOWN = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const el = (id, data, size = sizeOf(data.length)) => [...id, ...size, ...data];
const be = (v, n) => { const b = []; for (let i = n - 1; i >= 0; i--) b.push(Math.floor(v / 256 ** i) % 256); return b; };
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const f64 = (v) => { const a = new Uint8Array(8); new DataView(a.buffer).setFloat64(0, v); return [...a]; };
const ID = { EBML: [0x1a, 0x45, 0xdf, 0xa3], Segment: [0x18, 0x53, 0x80, 0x67], Info: [0x15, 0x49, 0xa9, 0x66], Scale: [0x2a, 0xd7, 0xb1], Muxing: [0x4d, 0x80], Duration: [0x44, 0x89], Tracks: [0x16, 0x54, 0xae, 0x6b], Cluster: [0x1f, 0x43, 0xb6, 0x75] };
// SimpleBlock: 線の番号（1 バイトの可変長）、Cluster からの相対の時刻（符号付き 16 ビット）、旗、中身
const block = (track, rel) => el([0xa3], [0x80 | track, ...be(rel & 0xffff, 2), 0x80, 1, 2, 3]);
const cluster = (tc, blocks) => [...ID.Cluster, ...UNKNOWN, ...el([0xe7], be(tc, 2)), ...blocks.flat()];
function webm({ scale = 1e6, app = 'Chrome', extraInfo = [], segKnown = false, clusters = [cluster(0, [block(1, 0), block(1, 33), block(2, 60)]), cluster(1000, [block(1, 0), block(1, 500)])] } = {}) {
  const ebml = el(ID.EBML, el([0x42, 0x82], ascii('webm')));
  const info = el(ID.Info, [...el(ID.Scale, be(scale, 3)), ...el(ID.Muxing, ascii(app)), ...extraInfo]);
  const tracks = el(ID.Tracks, el([0xae], el([0xd7], [1])));
  const body = [...info, ...tracks, ...clusters.flat()];
  const seg = segKnown ? el(ID.Segment, body, vint(body.length, 8)) : [...ID.Segment, ...UNKNOWN, ...body];
  return new Uint8Array([...ebml, ...seg]);
}

test('WebM を読む: 時刻の単位、長さ（無ければ null）、いちばん後ろの区切りの時刻、区切りの数', () => {
  assert.deepEqual(K.webmInfo(webm()), { scale: 1e6, durationMs: null, lastMs: 1500, blocks: 5 });
  // 相対の時刻は符号付き（Cluster より前の区切りもある）
  assert.equal(K.webmInfo(webm({ clusters: [cluster(1000, [block(1, -10)])] })).lastMs, 990);
  // 時刻の単位が 0.1 ミリ秒のとき
  assert.equal(K.webmInfo(webm({ scale: 1e5, clusters: [cluster(5000, [block(1, 2000)])] })).lastMs, 700);
  assert.equal(K.webmInfo(new Uint8Array([1, 2, 3, 4])), null);
});

test('WebM の長さを書き込む: 長さの無い Info に足し、ほかの中身は変えない', () => {
  const src = webm(), out = K.fixWebmDuration(src, 1534.5);
  assert.equal(out.length, src.length + 11); // Duration の要素（id 2 + 大きさ 1 + 8 バイトの小数）
  assert.deepEqual(K.webmInfo(out), { scale: 1e6, durationMs: 1534.5, lastMs: 1500, blocks: 5 });
  assert.deepEqual([...out.slice(out.length - 40)], [...src.slice(src.length - 40)]); // 後ろの区切りはそのまま
});

test('WebM の長さを書き込む: すでに長さがあれば上書きする（大きさは変わらない）', () => {
  const src = webm({ extraInfo: el(ID.Duration, f64(0)) }), out = K.fixWebmDuration(src, 2500);
  assert.equal(out.length, src.length);
  assert.equal(K.webmInfo(out).durationMs, 2500);
  assert.equal(K.webmInfo(src).durationMs, 0); // 元のバイト列は書き換えない
});

test('WebM の長さを書き込む: Info の大きさの欄が 1 バイトに収まらなくなったら広げる', () => {
  // Info の中身を 118 バイトにする（3+3 + 2+1+109）。11 バイト足すと 129 になり、1 バイトの欄（最大 126）をこえる
  const src = webm({ app: 'x'.repeat(109) });
  const out = K.fixWebmDuration(src, 800);
  assert.equal(out.length, src.length + 12);
  assert.deepEqual(K.webmInfo(out), { scale: 1e6, durationMs: 800, lastMs: 1500, blocks: 5 });
});

test('WebM の長さを書き込む: Segment の大きさが分かっているときは、その大きさも直す', () => {
  const src = webm({ segKnown: true }), out = K.fixWebmDuration(src, 1600);
  const at = 4 + 1 + 7 + 4; // EBML ヘッダ（id 4 + 大きさ 1 + 中身 7）の後ろの Segment の id 4 バイトの次が、大きさの欄（8 バイト）
  const size = (b) => b.slice(at + 1, at + 8).reduce((s, x) => s * 256 + x, 0);
  assert.equal(size(out), size(src) + 11);
  assert.equal(K.webmInfo(out).durationMs, 1600);
});

test('WebM の長さを書き込む: 頭の部分だけでも直せる。Info が途中で切れていたら触らない', () => {
  const src = webm(), whole = K.fixWebmDuration(src, 1500), head = K.fixWebmDuration(src.slice(0, 60), 1500);
  assert.deepEqual([...head], [...whole.slice(0, 71)]);
  const cut = src.slice(0, 30); // Info の途中で切れている
  assert.equal(K.fixWebmDuration(cut, 1500), cut);
  const junk = new Uint8Array([9, 9, 9]);
  assert.equal(K.fixWebmDuration(junk, 1500), junk); // WebM でなければそのまま
});

test('録画の Blob に長さを書き込む: 頭だけを読んで直し、残りはつなぐ', async () => {
  const src = webm(), blob = new Blob([src], { type: 'video/webm' });
  const out = await K.withDuration(blob, 1534, 32);
  assert.equal(out.type, 'video/webm');
  assert.deepEqual([...new Uint8Array(await out.arrayBuffer())], [...K.fixWebmDuration(src, 1534)]);
  const junk = new Blob([new Uint8Array([1, 2, 3])]);
  assert.equal(await K.withDuration(junk, 1000), junk); // 直せないものは元のまま返す
});
