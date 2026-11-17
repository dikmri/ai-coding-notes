// セリフの声（WAV）を、図鑑の項目が使う小さなデータ（data/<id>.js）にする。
// アミガのトラッカーのサンプラーと同じ考え方で、全部のセリフを 1 本の 8 ビットの音（サンプル）につなぎ、
// 各セリフの始まりの位置（トラッカーの「サンプルの途中から鳴らす」命令と同じ）と、口の形の時間表を添える。
//
// 使い方: node tools/voice2js.mjs tools/voice-lines/shore.voice.json
// 設定の JSON: { "id": "voice-shore", "rate": 11025, "credit": "...", "lines": [
//   { "name": "call", "src": "runtime/assets/voice/....wav", "phrase": 0, "text": "字幕の文", "kana": "読み仮名" }, ... ] }
// src は元のチェックアウトからの道筋（作業用の場所から動かすときは DEKIRU_ROOT に元のチェックアウトを渡す）。
// phrase は、その WAV を 0.35 秒以上の無音で分けたときの何番目か。[1, 2] のように範囲でも書ける（省くと、最初の声から最後の声まで）。
// --wav <フォルダ> を付けると、確かめるために、各セリフの 8 ビットの音を WAV でも書き出す。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWav, resample, toInt8, findPhrases, kanaMorae, mouthTrack } from './lib/voice.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.DEKIRU_ROOT || HERE;
const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const wavDir = process.argv.includes('--wav') ? process.argv[process.argv.indexOf('--wav') + 1] : null;
// 8 ビット（符号なし）の WAV
const u8wav = (q, sr) => { const b = Buffer.alloc(44 + q.length); b.write('RIFF', 0); b.writeUInt32LE(36 + q.length, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(q.length, 40); q.forEach((v, i) => { b[44 + i] = v + 128; }); return b; };
const rate = spec.rate || 11025, tick = 50, gap = Math.round(rate * 0.05);   // セリフの間に 0.05 秒の無音を挟む
const parts = [], lines = [];
let pos = 0;
for (const [k, l] of spec.lines.entries()) {
  const w = readWav(readFileSync(join(ROOT, l.src)));
  let x = w.data;
  const all = findPhrases(x, w.sampleRate), pad = Math.round(w.sampleRate * 0.03);
  const [a, b] = l.phrase == null ? [0, all.length - 1] : [].concat(l.phrase, l.phrase).slice(0, 2).map(Number);   // 省いたときは、最初の声から最後の声まで
  if (!all[a] || !all[b]) throw new Error(`${l.src} に ${l.phrase} 番目のセリフがありません（${all.length} 個）`);
  const ph = { start: all[a].start, end: all[b].end };
  x = x.subarray(Math.max(0, ph.start - pad), Math.min(x.length, ph.end + pad));
  let y = resample(x, w.sampleRate, rate);
  const peak = y.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-6);
  y = y.map((v) => v / peak * 0.92);                                  // 8 ビットの段を使い切るよう、大きさをそろえる
  const fade = Math.round(rate * 0.006);
  for (let i = 0; i < fade; i++) { y[i] *= i / fade; y[y.length - 1 - i] *= i / fade; }   // 端の「ぷつっ」を消す
  const q = toInt8(y, k + 1), mouth = mouthTrack(y, rate, kanaMorae(l.kana), tick);
  parts.push(q, new Int8Array(gap));
  if (wavDir) { mkdirSync(wavDir, { recursive: true }); writeFileSync(join(wavDir, `${l.name}.wav`), u8wav(q, rate)); }
  lines.push({ name: l.name, text: l.text, start: pos, len: q.length, mouth: Buffer.from(mouth).toString('base64') });
  console.log(`${l.name}: ${(q.length / rate).toFixed(2)} 秒・${q.length} バイト・口の形 ${mouth.length} コマ「${l.text}」`);
  pos += q.length + gap;
}
const pcm = new Int8Array(pos);
let p = 0; for (const a of parts) { pcm.set(a, p); p += a.length; }
const data = { rate, tick, credit: spec.credit, pcm: Buffer.from(pcm.buffer).toString('base64'), lines };
const out = join(HERE, 'data', `${spec.id}.js`);
writeFileSync(out, `/* セリフの声。図鑑の項目が、開いたときだけ読み込む。
 * ${spec.credit}
 * tools/voice2js.mjs で変換した（${rate}Hz・8 ビットの 1 本の音。lines の start と len は点の番号、mouth は 1 秒 ${tick} コマの口の形: 上の 3 ビットが 0 閉じる・1 あ・2 い・3 う・4 え・5 お、下の 5 ビットが開き 0〜31）。 */
(window.DEKIRU_DATA ??= {})[${JSON.stringify(spec.id)}] = ${JSON.stringify(data)};\n`);
console.log(`書き出し: data/${spec.id}.js ・ ${(readFileSync(out).length / 1024).toFixed(0)} KB（音 ${(pos / rate).toFixed(1)} 秒）`);
