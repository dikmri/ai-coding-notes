// セリフの声を図鑑のデータにする計算（tools/lib/voice.mjs）のテスト
// WAV を読む・周波数を下げる・8 ビットにする・セリフの切れ目・読み仮名の拍・口の形の時間表
import test from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../tools/lib/voice.mjs';

const tone = (hz, sec, sr, amp = 0.5) => Float32Array.from({ length: Math.round(sec * sr) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / sr));
const cat = (...xs) => { const o = new Float32Array(xs.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of xs) { o.set(x, p); p += x.length; } return o; };
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
// 16 ビットの WAV を作る（fmt と data の間に LIST の塊を挟む。Irodori の WAV と同じ並び）
function wav16(x, sr) {
  const list = Buffer.from('LIST\x0c\x00\x00\x00INFOISFT\x00\x00\x00\x00', 'latin1');
  const b = Buffer.alloc(44 + list.length + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(b.length - 8, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  list.copy(b, 36);
  const d = 36 + list.length; b.write('data', d); b.writeUInt32LE(x.length * 2, d + 4);
  x.forEach((v, i) => b.writeInt16LE(Math.round(v * 32767), d + 8 + i * 2));
  return b;
}

test('WAV: 16 ビットの WAV を読み、途中の LIST の塊は飛ばす', () => {
  const x = tone(440, 0.1, 8000);
  const w = V.readWav(wav16(x, 8000));
  assert.equal(w.sampleRate, 8000);
  assert.equal(w.data.length, x.length);
  assert.ok(w.data.every((v, i) => Math.abs(v - x[i]) < 1e-4));
});

test('周波数を下げる: 1kHz の音は残り、新しい上限より高い 9kHz の音は消える（折り返さない）', () => {
  const lo = V.resample(tone(1000, 0.5, 48000), 48000, 11025), hi = V.resample(tone(9000, 0.5, 48000), 48000, 11025);
  assert.ok(Math.abs(lo.length - 0.5 * 11025) <= 1);
  assert.ok(Math.abs(rms(lo.subarray(200, -200)) - 0.5 / Math.SQRT2) < 0.02, `1kHz が弱まった: ${rms(lo)}`);
  assert.ok(rms(hi.subarray(200, -200)) < 0.01, `9kHz が残った: ${rms(hi)}`);
  let zc = 0; for (let i = 201; i < lo.length - 200; i++) if ((lo[i - 1] < 0) !== (lo[i] < 0)) zc++;
  assert.ok(Math.abs(zc / ((lo.length - 401) / 11025) / 2 - 1000) < 15, `周波数がずれた: ${zc}`);
});

test('8 ビット: -128〜127 に収まり、誤差は 1 段ほど。同じ種なら毎回同じ結果', () => {
  const x = Float32Array.from([0, 0.5, -0.5, 1.2, -1.2, 0.999]);
  const q = V.toInt8(x, 7);
  assert.ok(q instanceof Int8Array);
  assert.deepEqual([...q], [...V.toInt8(x, 7)]);
  assert.equal(q[3], 127); assert.equal(q[4], -128);
  for (const i of [0, 1, 2]) assert.ok(Math.abs(q[i] / 128 - x[i]) <= 2 / 128, `${i}: ${q[i]}`);
});

test('セリフの切れ目: 0.35 秒以上の無音で分け、短い間（っ・読点）では分けない', () => {
  const sr = 8000, s = (t) => new Float32Array(Math.round(t * sr));
  const x = cat(s(0.2), tone(300, 0.4, sr), s(0.1), tone(300, 0.3, sr), s(0.5), tone(300, 0.6, sr), s(0.2));
  const ph = V.findPhrases(x, sr);
  assert.equal(ph.length, 2, JSON.stringify(ph));
  assert.ok(Math.abs(ph[0].start / sr - 0.2) < 0.04 && Math.abs(ph[0].end / sr - 1.0) < 0.04, JSON.stringify(ph[0]));
  assert.ok(Math.abs(ph[1].start / sr - 1.5) < 0.04 && Math.abs(ph[1].end / sr - 2.1) < 0.04, JSON.stringify(ph[1]));
});

test('読み仮名の拍: 小さい「ゃ」は前の拍に付き、「ー」と、お段の後の「う」は前の母音を伸ばし、「っ」「ん」は別の拍', () => {
  const v = (k) => V.kanaMorae(k).map((m) => m.v).join('');
  assert.equal(v('おーい！こっちだよー！'), 'ooioQiaoo');
  assert.equal(v('きょうもきてくれて、ありがとう。'), 'oooieueeaiaoo');   // きょう → きょー、ありがとう → ありがとー
  assert.equal(v('またね！'), 'aae');
  assert.equal(v('ティーカップ'), 'iiaQu');
  assert.equal(v('うんうん'), 'uNuN');
  assert.deepEqual(V.kanaMorae('まばたき').map((m) => m.lips), [true, true, false, false]);   // ま行・ば行・ぱ行は唇を閉じてから開く
});

test('口の形の時間表: 声のある所に拍の母音が順に並び、無音では口を閉じ、「っ」は時間を取らない', () => {
  const sr = 8000;
  // 「あっい」: 0.3 秒の声 → 0.1 秒の無音（っ）→ 0.3 秒の声
  const x = cat(tone(300, 0.3, sr), new Float32Array(0.1 * sr), tone(300, 0.3, sr));
  const m = V.mouthTrack(x, sr, V.kanaMorae('あっい'), 50);
  assert.equal(m.length, 35);
  const shape = (f) => m[f] >> 5, level = (f) => m[f] & 31;
  assert.equal(shape(5), V.VOWELS.indexOf('a'));
  assert.equal(shape(30), V.VOWELS.indexOf('i'));
  assert.equal(level(17), 0, '無音で口が開いている');
  assert.ok(level(5) > 20 && level(30) > 20);
});

test('口の形の時間表: 句読点のまとまりと声の間の数が合えば、まとまりごとに拍を割り振る（長く伸ばした呼びかけで後ろがずれない）', () => {
  const sr = 8000;
  // 「ああああ、い」: 0.2 秒に 4 拍を早口で → 0.3 秒の間 → 0.6 秒の「い」
  const x = cat(tone(300, 0.2, sr), new Float32Array(0.3 * sr), tone(300, 0.6, sr));
  const m = V.mouthTrack(x, sr, V.kanaMorae('ああああ、い'), 50);
  assert.equal(m[30] >> 5, V.VOWELS.indexOf('i'), '2 つ目のまとまりの声に「あ」が入り込んだ');
  assert.equal(m[5] >> 5, V.VOWELS.indexOf('a'));
});

test('口の形の時間表: 声の間がまとまりより多いときは、長い間からまとまりの境目にする', () => {
  const sr = 8000;
  // 「ああ、い」: あ 0.2 秒 → 文の途中の短い間 0.2 秒 → あ 0.2 秒 → 読点の長い間 0.4 秒 → い 0.4 秒
  const x = cat(tone(300, 0.2, sr), new Float32Array(0.2 * sr), tone(300, 0.2, sr), new Float32Array(0.4 * sr), tone(300, 0.4, sr));
  const m = V.mouthTrack(x, sr, V.kanaMorae('ああ、い'), 50);
  assert.equal(m[55] >> 5, V.VOWELS.indexOf('i'), '読点の後の声に「あ」が入り込んだ');
  assert.equal(m[25] >> 5, V.VOWELS.indexOf('a'));
});

test('口の形の時間表: 唇を閉じる拍の頭では、口の開きを小さくする', () => {
  const sr = 8000, x = tone(300, 0.6, sr);
  const m = V.mouthTrack(x, sr, V.kanaMorae('まあ'), 50);
  assert.ok((m[1] & 31) < (m[10] & 31) / 2, `ま の頭が開いている: ${m[1] & 31} / ${m[10] & 31}`);
});
