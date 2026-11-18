// ドット絵エディタの計算（色の文字、対称の点、スプライトシートの並べ方、拡大、範囲の切り取りと貼り付け、
// 保存の形 .pxa の書き出しと検証、GIF の LZW と符号化・読み取り、PNG の大きさの読み取り）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../os/js/core/pixel.mjs';

const RED = [255, 0, 0, 255], BLUE = [0, 0, 255, 255], CLEAR = [0, 0, 0, 0];
const px = (data, w, x, y) => Array.from(data.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
const put = (data, w, x, y, c) => data.set(c, (y * w + x) * 4);
const key = (pts) => pts.map(([x, y]) => x + ',' + y).sort();

test('色の文字: #rgb・#rrggbb・#rrggbbaa・transparent を RGBA にし、RGBA を文字に戻す', () => {
  assert.deepEqual(X.parseColor('#ff0000'), RED);
  assert.deepEqual(X.parseColor('#F00'), RED);
  assert.deepEqual(X.parseColor('#11223380'), [0x11, 0x22, 0x33, 0x80]);
  assert.deepEqual(X.parseColor('transparent'), CLEAR);
  assert.equal(X.parseColor('#12345'), null);
  assert.equal(X.parseColor('red'), null);
  assert.equal(X.parseColor(42), null);
  assert.equal(X.colorHex(RED), '#ff0000');
  assert.equal(X.colorHex([0x11, 0x22, 0x33, 0x80]), '#11223380');
  // 透明は色の成分によらず同じ文字になる（保存のときに色の表が増えないように）
  assert.equal(X.colorHex([9, 9, 9, 0]), '#00000000');
});

test('16 色の並び: 16 個の重ならない #rrggbb と名前', () => {
  assert.equal(X.PALETTE.length, 16);
  assert.equal(new Set(X.PALETTE.map((c) => c.hex)).size, 16);
  for (const c of X.PALETTE) { assert.match(c.hex, /^#[0-9a-f]{6}$/); assert.ok(c.name.length > 0); }
});

test('大きさの丸め: 8〜128 の整数にし、読めない値は既定の 32', () => {
  assert.equal(X.clampSize(4), 8);
  assert.equal(X.clampSize(200), 128);
  assert.equal(X.clampSize('48'), 48);
  assert.equal(X.clampSize(12.7), 12);
  assert.equal(X.clampSize('abc'), 32);
});

test('対称の点: 左右・上下・両方。重なる点は1つにする', () => {
  assert.deepEqual(key(X.mirrorPoints([[1, 2]], 8, 6, { x: true })), ['1,2', '6,2']);
  assert.deepEqual(key(X.mirrorPoints([[1, 2]], 8, 6, { y: true })), ['1,2', '1,3']);
  assert.deepEqual(key(X.mirrorPoints([[1, 2]], 8, 6, { x: true, y: true })), ['1,2', '1,3', '6,2', '6,3']);
  // 奇数の幅のまん中の列は、映しても同じ点なので増えない
  assert.deepEqual(key(X.mirrorPoints([[2, 0]], 5, 5, { x: true })), ['2,0']);
  assert.deepEqual(key(X.mirrorPoints([[0, 0], [1, 1]], 4, 4, {})), ['0,0', '1,1']);
});

test('スプライトシートの並べ方: 既定は横一列、列の数を決めると折り返す', () => {
  assert.deepEqual(X.sheetLayout(3, 16, 8), { width: 48, height: 8, cols: 3, rows: 1, cells: [[0, 0], [16, 0], [32, 0]] });
  const g = X.sheetLayout(5, 4, 4, 2);
  assert.equal(g.width, 8); assert.equal(g.height, 12);
  assert.deepEqual(g.cells[4], [0, 8]);
});

test('スプライトシート: コマの画素が並べた位置に入る', () => {
  const w = 2, h = 2, a = X.blankFrame(w, h), b = X.blankFrame(w, h);
  put(a, w, 0, 0, RED); put(b, w, 1, 1, BLUE);
  const s = X.composeSheet([a, b], w, h);
  assert.equal(s.length, 4 * 2 * 4);
  assert.deepEqual(px(s, 4, 0, 0), RED);
  assert.deepEqual(px(s, 4, 3, 1), BLUE);
  assert.deepEqual(px(s, 4, 2, 0), CLEAR);
});

test('拡大: 1 画素を k×k に広げる（ぼかさない）', () => {
  const d = X.blankFrame(2, 1);
  put(d, 2, 1, 0, RED);
  const s = X.scaleRGBA(d, 2, 1, 3);
  assert.equal(s.length, 6 * 3 * 4);
  assert.deepEqual(px(s, 6, 2, 2), CLEAR);
  assert.deepEqual(px(s, 6, 3, 0), RED);
  assert.deepEqual(px(s, 6, 5, 2), RED);
  assert.equal(X.scaleRGBA(d, 2, 1, 1), d);
});

test('範囲: 角の順によらず、絵の中に切りつめる。外れたら null', () => {
  assert.deepEqual(X.normRect(5, 6, 2, 1, 8, 8), { x: 2, y: 1, w: 4, h: 6 });
  assert.deepEqual(X.normRect(-3, -3, 2, 20, 8, 8), { x: 0, y: 0, w: 3, h: 8 });
  assert.equal(X.normRect(9, 9, 12, 12, 8, 8), null);
});

test('範囲の切り取り・消す・重ねて貼る（透明の所は下を残し、外へはみ出た所は捨てる）', () => {
  const w = 4, h = 4, d = X.blankFrame(w, h);
  put(d, w, 1, 1, RED); put(d, w, 2, 1, BLUE); put(d, w, 0, 3, BLUE);
  const r = { x: 1, y: 1, w: 2, h: 2 }, cut = X.cutRect(d, w, h, r);
  assert.equal(cut.w, 2); assert.equal(cut.h, 2);
  assert.deepEqual(px(cut.data, 2, 0, 0), RED);
  assert.deepEqual(px(cut.data, 2, 1, 0), BLUE);
  X.clearRectIn(d, w, h, r);
  assert.deepEqual(px(d, w, 1, 1), CLEAR);
  X.pasteOver(d, w, h, cut, -1, 2);
  assert.deepEqual(px(d, w, 0, 2), BLUE, '色のある所は貼る');
  assert.deepEqual(px(d, w, 0, 3), BLUE, '透明の所は下の色を残す');
  assert.deepEqual(px(d, w, 0, 0), CLEAR);
  X.pasteOver(d, w, h, cut, 3, 2);
  assert.deepEqual(px(d, w, 3, 2), RED);
});

const sampleDoc = () => {
  const w = 8, h = 8, f1 = X.blankFrame(w, h), f2 = X.blankFrame(w, h);
  put(f1, w, 0, 0, RED); put(f1, w, 7, 7, BLUE); put(f2, w, 3, 4, [1, 2, 3, 128]);
  return { width: w, height: h, fps: 12, palette: X.PALETTE.map((c) => c.hex), frames: [f1, f2] };
};

test('.pxa: 書き出して読み直すと、大きさ・速さ・色の並び・コマの画素が同じ', () => {
  const doc = sampleDoc(), obj = X.encodeDoc(doc);
  assert.equal(obj.format, 'future-os-pixel');
  assert.equal(obj.version, 1);
  const text = JSON.stringify(obj), back = X.parseDoc(text);
  assert.equal(back.width, 8); assert.equal(back.height, 8); assert.equal(back.fps, 12);
  assert.deepEqual(back.palette, doc.palette);
  assert.equal(back.frames.length, 2);
  assert.deepEqual(Array.from(back.frames[0]), Array.from(doc.frames[0]));
  assert.deepEqual(Array.from(back.frames[1]), Array.from(doc.frames[1]));
  // 同じ色の続きを1つにまとめるので、白紙のコマは短い
  assert.ok(JSON.stringify(X.encodeDoc({ ...doc, frames: [X.blankFrame(8, 8)] }).frames[0]).length < 20);
});

test('.pxa の検証: 形が違うと、どこが違うかを日本語で返す', () => {
  const good = X.encodeDoc(sampleDoc());
  assert.deepEqual(X.validateDoc(good), []);
  const bad = (patch) => X.validateDoc({ ...structuredClone(good), ...patch });
  assert.ok(bad({ format: 'other' }).some((e) => e.includes('ドット絵')));
  assert.ok(bad({ width: 200 }).some((e) => e.includes('幅')));
  assert.ok(bad({ height: 3 }).some((e) => e.includes('高さ')));
  assert.ok(bad({ fps: 0 }).some((e) => e.includes('速さ')));
  assert.ok(bad({ palette: ['#000000'] }).some((e) => e.includes('16')));
  assert.ok(bad({ colors: ['#zzzzzz'] }).length > 0);
  assert.ok(bad({ frames: [] }).some((e) => e.includes('コマ')));
  assert.ok(bad({ frames: [[63, 0]] }).some((e) => e.includes('64')), '画素の数が合わない');
  assert.ok(bad({ frames: [[64, 99]] }).some((e) => e.includes('色の表')), '色の番号が表に無い');
  assert.ok(X.validateDoc(null).length > 0);
  assert.throws(() => X.parseDoc('{"format":'), /JSON/);
  assert.throws(() => X.parseDoc({ ...good, width: 1 }), /幅/);
});

test('LZW: 1 画素は既知のバイト列（よく知られた 1×1 の GIF と同じ 44 01）', () => {
  assert.deepEqual(Array.from(X.lzwEncode([0], 2)), [0x44, 0x01]);
  // 同じ色 4 つ: 符号は 4(消す) 0 6 0 5(終わり)
  assert.deepEqual(Array.from(X.lzwEncode([0, 0, 0, 0], 2)), [0x84, 0x51]);
});

test('LZW: 符号にして戻すと同じ並び（辞書が 4096 で満ちて作り直す長さでも）', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
  const long = Uint8Array.from({ length: 128 * 128 }, rnd);
  assert.deepEqual(X.lzwDecode(X.lzwEncode(long, 8), 8), long);
  const few = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 3);
  assert.deepEqual(X.lzwDecode(X.lzwEncode(few, 2), 2), few);
});

test('GIF の色の表: 透明があれば 0 番を透明にし、表の長さは 2 のべき', () => {
  const f = X.blankFrame(2, 2);
  put(f, 2, 0, 0, RED); put(f, 2, 1, 0, BLUE); put(f, 2, 0, 1, RED);
  const p = X.gifPalette([f]);
  assert.equal(p.transparent, 0);
  assert.equal(p.table.length, 4);
  assert.equal(p.indexOf(RED), p.indexOf([255, 0, 0, 255]));
  assert.notEqual(p.indexOf(RED), p.indexOf(BLUE));
  assert.equal(p.indexOf(CLEAR), 0);
});

test('GIF の色の表: 255 色を超えたら色を丸めて 256 色に収める', () => {
  const w = 32, h = 32, f = X.blankFrame(w, h);
  for (let i = 0; i < w * h; i++) f.set([i & 255, (i >> 2) & 255, (i * 3) & 255, 255], i * 4);
  const p = X.gifPalette([f]);
  assert.ok(p.table.length <= 256);
  assert.equal(p.transparent, -1);
});

test('GIF: 先頭は GIF89a、コマの数・待ち時間・くり返し・透明を読み直せる', () => {
  const w = 3, h = 2, a = X.blankFrame(w, h), b = X.blankFrame(w, h);
  put(a, w, 0, 0, RED); put(a, w, 2, 1, BLUE);
  put(b, w, 1, 0, BLUE);
  const bytes = X.encodeGif({ width: w, height: h, frames: [a, b], fps: 10 });
  assert.equal(String.fromCharCode(...bytes.slice(0, 6)), 'GIF89a');
  assert.equal(bytes[6] | (bytes[7] << 8), 3);
  assert.equal(bytes[bytes.length - 1], 0x3b);
  const g = X.decodeGif(bytes);
  assert.equal(g.width, 3); assert.equal(g.height, 2);
  assert.equal(g.loop, 0, 'いつまでもくり返す');
  assert.equal(g.frames.length, 2);
  assert.equal(g.frames[0].delay, 10, '10 コマ/秒は 10/100 秒');
  assert.deepEqual(px(g.frames[0].rgba, w, 0, 0), RED);
  assert.deepEqual(px(g.frames[0].rgba, w, 2, 1), BLUE);
  assert.equal(px(g.frames[0].rgba, w, 1, 1)[3], 0, '透明は透明のまま');
  assert.deepEqual(px(g.frames[1].rgba, w, 1, 0), BLUE);
  assert.equal(g.frames[1].disposal, 2, '透明があるときは、次のコマの前に消す');
});

test('GIF: 1 コマなら くり返しの拡張を入れない。透明が無いときは透明の印を付けない', () => {
  const f = X.blankFrame(2, 2);
  for (let i = 0; i < 4; i++) f.set(RED, i * 4);
  const bytes = X.encodeGif({ width: 2, height: 2, frames: [f], fps: 1 });
  const g = X.decodeGif(bytes);
  assert.equal(g.loop, null);
  assert.equal(g.frames.length, 1);
  assert.equal(g.frames[0].delay, 100);
  assert.equal(g.frames[0].transparent, -1);
  assert.deepEqual(px(g.frames[0].rgba, 2, 1, 1), RED);
});

test('GIF: 128×128 で色の多い絵も、読み直すと同じ画素', () => {
  const w = 128, h = 128, f = X.blankFrame(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f.set(X.parseColor(X.PALETTE[(x * 3 + y * 5) % 16].hex), (y * w + x) * 4);
  const g = X.decodeGif(X.encodeGif({ width: w, height: h, frames: [f, f], fps: 30 }));
  assert.equal(g.frames[1].delay, 3);
  assert.deepEqual(Array.from(g.frames[1].rgba), Array.from(f));
});

test('GIF の読み取りは、GIF でないバイト列を断る', () => {
  assert.throws(() => X.decodeGif(new Uint8Array([1, 2, 3, 4, 5, 6, 7])), /GIF/);
});

test('PNG の大きさ: IHDR から幅と高さを読む。PNG でなければ null', () => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0, 0, 0, 0, 96]);
  assert.deepEqual(X.pngSize(b), { width: 256, height: 96 });
  assert.equal(X.pngSize(new Uint8Array(30)), null);
});

test('PNG を開くときの大きさ: 128 を超えたら断り、8 より小さい絵は 8 の枠に入れる', () => {
  assert.deepEqual(X.fitImport(16, 24), { ok: true, width: 16, height: 24 });
  assert.deepEqual(X.fitImport(4, 20), { ok: true, width: 8, height: 20 });
  const r = X.fitImport(129, 10);
  assert.equal(r.ok, false);
  assert.match(r.reason, /128/);
});

test('拡大の段: 1 段ずつ上げ下げし、端で止まる。窓に収まるいちばん大きな倍率を選ぶ', () => {
  assert.equal(X.stepZoom(4, 1), 6);
  assert.equal(X.stepZoom(4, -1), 3);
  assert.equal(X.stepZoom(X.ZOOMS[0], -1), X.ZOOMS[0]);
  assert.equal(X.stepZoom(X.ZOOMS.at(-1), 1), X.ZOOMS.at(-1));
  assert.equal(X.stepZoom(5, 1), 6, '段に無い倍率からは、近い上の段へ');
  assert.equal(X.fitZoom(32, 32, 500, 400), 12);
  assert.equal(X.fitZoom(128, 128, 500, 400), 3);
  assert.equal(X.fitZoom(128, 128, 50, 50), 1);
});

test('コマの並べ替え: from の位置のものを to の位置へ移す（元の並びは変えない）', () => {
  const a = ['A', 'B', 'C', 'D'];
  assert.deepEqual(X.moveItem(a, 0, 2), ['B', 'C', 'A', 'D']);
  assert.deepEqual(X.moveItem(a, 3, 0), ['D', 'A', 'B', 'C']);
  assert.deepEqual(X.moveItem(a, 1, 1), a);
  assert.deepEqual(X.moveItem(a, 1, 9), ['A', 'C', 'D', 'B'], '範囲の外は端へ');
  assert.deepEqual(a, ['A', 'B', 'C', 'D']);
});

test('見本の再生: 経った時間と速さから出すコマの番号。時間が負でも 0 から（rAF の時刻が先に覚えた時刻より前のとき）', () => {
  assert.equal(X.playFrame(0, 10, 3), 0);
  assert.equal(X.playFrame(150, 10, 3), 1);
  assert.equal(X.playFrame(350, 10, 3), 0, '3 コマを回ってまた 0');
  assert.equal(X.playFrame(-16, 12, 3), 0);
  assert.equal(X.playFrame(5000, 12, 1), 0);
});

test('最近使った色: 新しい色を先頭に、重ねず、数を限る', () => {
  let r = [];
  for (const c of ['#111111', '#222222', '#111111', '#333333']) r = X.pushRecent(r, c, 3);
  assert.deepEqual(r, ['#333333', '#111111', '#222222']);
  r = X.pushRecent(r, '#444444', 3);
  assert.deepEqual(r, ['#444444', '#333333', '#111111']);
});
