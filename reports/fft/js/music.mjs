// その場で合成するサンプル曲（既存の曲・外部の音源は使わない）。標本を JavaScript で直接計算する（DOM に触れない）。
// どの曲も 44.1 kHz で 2^20 標本（約 23.8 秒）。1024 標本 × 1024 区間にちょうど分かれ、論文の模型の束 1 つぶんになる。

export const SAMPLE_RATE = 44100;
export const PIECE_LENGTH = 1 << 20;

export const PIECES = [
  { id: 'arp', title: '夜の和音', desc: 'アルペジオと和音とベース。倍音が等間隔に並ぶ横線が見える' },
  { id: 'drums', title: 'ドラムとベース', desc: 'バスドラム・スネア・ハイハットと、のこぎり波のベース。音の頭で縦の帯が出る' },
  { id: 'sweep', title: '上がる音と鐘と口笛', desc: '80 Hz から 8 kHz へ上がる音、倍音がずれた鐘、ビブラートの口笛' },
];

export const midiToFreq = (n) => 440 * 2 ** ((n - 69) / 12);

// 毎回同じ乱数（雑音の楽器に使う）
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = 2 * Math.PI;

// 1 つの音を out に足す。fn(t, i) は音の始まりからの秒 t で値を返す
function addNote(out, sr, start, dur, fn) {
  const i0 = Math.max(0, Math.round(start * sr)), i1 = Math.min(out.length, Math.round((start + dur) * sr));
  for (let i = i0; i < i1; i++) out[i] += fn((i - i0) / sr);
}
const attack = (t, a) => (t < a ? t / a : 1);

// ---- 楽器 ----
// FM のエレクトリック・ピアノ（変調の深さが減っていく）
const epiano = (f, amp) => (t) => amp * attack(t, 0.004) * Math.exp(-t / 1.1) * Math.sin(TAU * f * t + 1.8 * Math.exp(-t / 0.25) * Math.sin(TAU * f * t));
// やわらかい笛（正弦波＋少しの 3 倍音、ビブラート）
const flute = (f, amp, dur) => (t) => {
  const env = attack(t, 0.08) * Math.min(1, Math.max(0, (dur - t) / 0.12));
  const ph = TAU * f * t + 0.004 * f * Math.sin(TAU * 5 * t) / 5;
  return amp * env * (Math.sin(ph) + 0.08 * Math.sin(3 * ph));
};
// 低い正弦波のベース
const sineBass = (f, amp, dur) => (t) => amp * attack(t, 0.01) * Math.min(1, Math.max(0, (dur - t) / 0.05)) * Math.exp(-t / 1.5) * (Math.sin(TAU * f * t) + 0.25 * Math.sin(2 * TAU * f * t));
// 和音を支える音（倍音を 4 本、ゆっくり立ち上がる）
const pad = (f, amp, dur) => (t) => {
  const env = Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (dur - t) / 0.6));
  const p = TAU * f * t;
  return amp * env * (Math.sin(p) + Math.sin(2.003 * p) / 4 + Math.sin(2.997 * p) / 9 + Math.sin(4.004 * p) / 16);
};
// バスドラム（150 Hz から 45 Hz へ下がる正弦波）
const kick = (amp) => (t) => amp * Math.exp(-t / 0.3) * Math.sin(TAU * (45 * t + (105 * 0.045) * (1 - Math.exp(-t / 0.045))));
// FM の鐘（変調の比 1.4 で倍音がずれる）
const bell = (f, amp) => (t) => amp * attack(t, 0.002) * Math.exp(-t / 2.2) * Math.sin(TAU * f * t + 2.6 * Math.exp(-t / 0.9) * Math.sin(TAU * 1.4 * f * t));

// 雑音の楽器（スネア・ハイハット）。高い音だけ残すために差分を取る
function addNoise(out, sr, rnd, start, dur, decay, amp, hp) {
  const i0 = Math.round(start * sr), i1 = Math.min(out.length, Math.round((start + dur) * sr));
  let prev = 0, prev2 = 0;
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / sr, w = rnd() * 2 - 1;
    const y = hp >= 2 ? w - 2 * prev + prev2 : hp === 1 ? w - prev : w;
    prev2 = prev; prev = w;
    out[i] += amp * Math.exp(-t / decay) * y;
  }
}

// のこぎり波のベース（polyBLEP で折り返しを抑え、1 次の低域通過で角を丸める）
function addSawBass(out, sr, start, dur, f, amp) {
  const i0 = Math.round(start * sr), i1 = Math.min(out.length, Math.round((start + dur) * sr));
  const dt = f / sr;
  let ph = 0, lp = 0;
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / sr;
    let v = 2 * ph - 1;
    if (ph < dt) { const x = ph / dt; v -= x + x - x * x - 1; }
    else if (ph > 1 - dt) { const x = (ph - 1) / dt; v -= x * x + x + x + 1; }
    ph += dt; if (ph >= 1) ph -= 1;
    const cut = 200 + 2400 * Math.exp(-t / 0.08); // 音の頭だけ明るい
    const a = 1 - Math.exp((-TAU * cut) / sr);
    lp += a * (v - lp);
    const env = attack(t, 0.003) * Math.min(1, Math.max(0, (dur - t) / 0.02));
    out[i] += amp * env * lp;
  }
}

function finish(out, sr) {
  // 最初の 10 ms と最後の 1 秒をなめらかにし、最大を −1 dBFS にそろえる
  const fin = Math.round(0.01 * sr), fout = Math.round(1 * sr), n = out.length;
  for (let i = 0; i < fin; i++) out[i] *= i / fin;
  for (let i = 0; i < fout; i++) out[n - 1 - i] *= i / fout;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? 0.891 / peak : 1;
  const f32 = new Float32Array(n);
  for (let i = 0; i < n; i++) f32[i] = out[i] * g;
  return f32;
}

function pieceArp(sr, len) {
  const out = new Float64Array(len);
  const beat = 60 / 92, bar = 4 * beat, s16 = beat / 4;
  // 和音（MIDI）。Am・F・C・G・Am・F・Dm・E・Am
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59], [57, 60, 64]];
  const melody = [[76, 72], [69, 72], [67, 76], [74, 71], [72, 76], [77, 76], [74, 69], [68, 71], [69]];
  chords.forEach((ch, b) => {
    const t0 = b * bar;
    const notes = [ch[0], ch[1], ch[2], ch[0] + 12, ch[1] + 12, ch[2] + 12];
    const order = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3];
    order.forEach((k, i) => addNote(out, sr, t0 + i * s16, 1.6, epiano(midiToFreq(notes[k]), 0.16)));
    for (const n of ch) addNote(out, sr, t0, bar, pad(midiToFreq(n), 0.05, bar));
    addNote(out, sr, t0, bar * 0.9, sineBass(midiToFreq(ch[0] - 12), 0.35, bar * 0.9));
    const mel = melody[b];
    mel.forEach((n, i) => { const d = bar / mel.length; addNote(out, sr, t0 + i * d, d * 0.95, flute(midiToFreq(n), 0.22, d * 0.95)); });
  });
  return finish(out, sr);
}

function pieceDrums(sr, len) {
  const out = new Float64Array(len), rnd = mulberry32(20261126);
  const beat = 60 / 118, bar = 4 * beat, e8 = beat / 2;
  const roots = [40, 40, 43, 45];
  const bass = [0, 0, 12, 0, 7, 0, 10, 12];
  const bars = Math.ceil(len / sr / bar);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const kicks = b % 2 ? [0, 2, 2.5] : [0, 2];
    for (const k of kicks) addNote(out, sr, t0 + k * beat, 0.5, kick(0.9));
    for (const s of [1, 3]) {
      addNoise(out, sr, rnd, t0 + s * beat, 0.25, 0.09, 0.35, 1);
      addNote(out, sr, t0 + s * beat, 0.15, (t) => 0.3 * Math.exp(-t / 0.04) * Math.sin(TAU * 190 * t));
    }
    for (let i = 0; i < 8; i++) {
      const open = i === 7;
      addNoise(out, sr, rnd, t0 + i * e8, open ? 0.3 : 0.06, open ? 0.12 : 0.02, i % 2 ? 0.1 : 0.16, 2);
      addSawBass(out, sr, t0 + i * e8, e8 * 0.85, midiToFreq(roots[b % 4] + bass[i]), 0.32);
    }
  }
  return finish(out, sr);
}

function pieceSweep(sr, len) {
  const out = new Float64Array(len);
  // 0〜8 秒: f(t) = 80·100^{t/8}（80 Hz → 8 kHz）。位相はその積分
  const T = 8, f0 = 80, k = Math.log(100) / T;
  addNote(out, sr, 0, T, (t) => {
    const ph = (TAU * f0 * (Math.exp(k * t) - 1)) / k;
    const env = Math.min(1, t / 0.05) * Math.min(1, (T - t) / 0.05);
    return env * (0.6 * Math.sin(ph) + 0.12 * Math.sin(2 * ph) + 0.04 * Math.sin(3 * ph));
  });
  // 8〜16 秒: 鐘（ド・ミ・ソ・ラ・ドの 5 音を順に）
  const pent = [72, 76, 79, 81, 84, 81, 79, 76, 74, 79, 84, 88, 86, 84, 79, 76];
  pent.forEach((n, i) => addNote(out, sr, 8 + i * 0.5, 6, bell(midiToFreq(n), 0.22)));
  // 16 秒〜: 口笛（2 kHz 前後、音の間をなめらかにつなぐ）
  const whistle = [[91, 0.6], [88, 0.4], [86, 0.5], [88, 0.5], [91, 1.0], [93, 0.5], [91, 0.5], [88, 1.0], [86, 0.8], [84, 1.4]];
  let t = 16, ph = 0, prevF = midiToFreq(whistle[0][0]);
  const rnd = mulberry32(7);
  for (const [n, d] of whistle) {
    const f = midiToFreq(n), i0 = Math.round(t * sr), i1 = Math.min(len, Math.round((t + d) * sr));
    for (let i = i0; i < i1; i++) {
      const u = (i - i0) / sr;
      const glide = prevF + (f - prevF) * Math.min(1, u / 0.06);
      const fv = glide * (1 + 0.012 * Math.sin(TAU * 5.5 * (i / sr)));
      ph += (TAU * fv) / sr;
      const env = Math.min(1, u / 0.03) * Math.min(1, (d - u) / 0.04 + 0.6);
      out[i] += 0.35 * env * Math.sin(ph) + 0.002 * env * (rnd() * 2 - 1);
    }
    prevF = f; t += d;
  }
  return finish(out, sr);
}

/** 曲を 1 つ合成して Float32Array（モノラル）で返す */
export function renderPiece(id, sr = SAMPLE_RATE, len = PIECE_LENGTH) {
  if (id === 'arp') return pieceArp(sr, len);
  if (id === 'drums') return pieceDrums(sr, len);
  if (id === 'sweep') return pieceSweep(sr, len);
  throw new RangeError(`曲 ${id} はありません`);
}
