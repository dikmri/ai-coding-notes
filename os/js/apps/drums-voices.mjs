// リズムマシンの打楽器の音。音の素材ファイルは使わず、Web Audio の発振器と雑音とフィルターでその場で作る。
// 再生（AudioContext）と WAV の書き出し（OfflineAudioContext）は、同じ trigger を呼ぶ。だから書き出した音は聞いた音と同じになる。
// 音の作り方: 発振器の周波数を下げながら減らす（バスドラム・タム）、雑音を帯域で絞る（スネア・手拍子）、
// ずれた周波数の矩形波を重ねて高い所だけ通す（ハイハット・カウベル）。数はこのアプリのために決めたもの。
import { INSTRUMENTS, voiceSettings, levelOf } from '../core/drums.mjs';

const noiseFor = new WeakMap(); // 音の文脈ごとの雑音（1 秒分）
const openFor = new WeakMap(); // 音の文脈ごとの、最後に鳴らした開いたハイハット（閉じたハイハットで止める）

// 雑音は決まった順の疑似乱数で作る（書き出すたびに同じ音になるように）
function noiseBuffer(ctx) {
  let b = noiseFor.get(ctx);
  if (b) return b;
  const n = ctx.sampleRate;
  b = ctx.createBuffer(1, n, n);
  const d = b.getChannelData(0);
  let x = 0x2f6b9d1;
  for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; d[i] = ((x >>> 0) / 4294967296) * 2 - 1; }
  noiseFor.set(ctx, b);
  return b;
}

// 出口: 打楽器 → 全体の音量 → 強い音を抑える圧縮 → スピーカー（書き出しでは描き出す先）
export function createOutput(ctx, volume = 80) {
  const master = ctx.createGain(), comp = ctx.createDynamicsCompressor();
  master.gain.value = levelOf(volume);
  comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
  master.connect(comp).connect(ctx.destination);
  return { input: master, master, comp };
}

// 音の大きさの形: すぐ立ち上がり、tau の速さで減る（setTargetAtTime で、あとから止める予定を足せるようにする）
function envelope(param, t, peak, tau) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + 0.001);
  param.setTargetAtTime(0, t + 0.001, tau);
  return t + 0.001 + tau * 7; // ここまでで十分に小さくなる
}
function vca(ctx, out) { const g = ctx.createGain(); g.gain.value = 0; g.connect(out); return g; }
function noiseSrc(ctx) { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx); s.loop = true; return s; }
function filter(ctx, type, freq, q = 0.7) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
function run(src, t, end) { src.start(t); src.stop(end); }

// 雑音の短い打撃（アタックの手触りを足す）
function tick(ctx, out, t, g, type, freq, tau) {
  const n = noiseSrc(ctx), f = filter(ctx, type, freq), a = vca(ctx, out);
  n.connect(f).connect(a);
  run(n, t, envelope(a.gain, t, g, tau));
}
// 周波数を下げながら減る正弦波（バスドラムとタム）
function drop(ctx, out, t, g, from, to, glide, tau, type = 'sine') {
  const o = ctx.createOscillator(), a = vca(ctx, out);
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + glide);
  o.connect(a);
  run(o, t, envelope(a.gain, t, g, tau));
}
// ずれた周波数の矩形波の束（金属の音）。返り値は音の大きさの節
function metal(ctx, out, t, g, ratio, tau, freqs, hp) {
  const sum = ctx.createGain(), bp = filter(ctx, 'bandpass', 9500 * Math.sqrt(ratio), 0.6), hi = filter(ctx, 'highpass', hp * ratio), a = vca(ctx, out);
  sum.gain.value = 0.25;
  sum.connect(bp).connect(hi).connect(a);
  const end = envelope(a.gain, t, g, tau);
  for (const f of freqs) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * ratio; o.connect(sum); run(o, t, end); }
  const n = noiseSrc(ctx), nf = filter(ctx, 'highpass', 7000 * ratio), ng = ctx.createGain();
  ng.gain.value = 0.35;
  n.connect(nf).connect(ng).connect(a);
  run(n, t, end);
  return { gain: a.gain, t, end };
}
const HAT = [331, 467, 586, 727, 853, 1049];

const VOICES = {
  kick(ctx, out, t, g, r, L) {
    drop(ctx, out, t, g, 168 * r, 49 * r, 0.11, 0.17 * L);
    tick(ctx, out, t, g * 0.22, 'highpass', 2200, 0.004);
  },
  snare(ctx, out, t, g, r, L) {
    drop(ctx, out, t, g * 0.5, 205 * r, 158 * r, 0.05, 0.05 * L, 'triangle');
    const n = noiseSrc(ctx), hp = filter(ctx, 'highpass', 1300 * r), pk = filter(ctx, 'peaking', 4200 * r), a = vca(ctx, out);
    pk.gain.value = 5;
    n.connect(hp).connect(pk).connect(a);
    run(n, t, envelope(a.gain, t, g * 0.7, 0.065 * L));
  },
  clap(ctx, out, t, g, r, L) {
    // 何人かの手がわずかにずれて鳴る形: 短い山を 3 つ、そのあと余韻
    const n = noiseSrc(ctx), bp = filter(ctx, 'bandpass', 1150 * r, 1.8), a = vca(ctx, out), p = a.gain;
    n.connect(bp).connect(a);
    p.setValueAtTime(0, t);
    for (const k of [0, 0.0105, 0.0215]) { p.setValueAtTime(g, t + k); p.setTargetAtTime(g * 0.08, t + k, 0.0032); }
    const tail = t + 0.032, tau = 0.075 * L;
    p.setValueAtTime(g * 0.75, tail);
    p.setTargetAtTime(0, tail, tau);
    run(n, t, tail + tau * 7);
  },
  chh(ctx, out, t, g, r, L) {
    // 閉じたハイハットが鳴ったら、前に鳴らした開いたハイハットを止める
    const open = openFor.get(ctx);
    if (open && open.t < t && open.end > t) open.gain.setTargetAtTime(0, t, 0.006);
    metal(ctx, out, t, g * 0.5, r, 0.024 * L, HAT, 7000);
  },
  ohh(ctx, out, t, g, r, L) {
    openFor.set(ctx, metal(ctx, out, t, g * 0.45, r, 0.17 * L, HAT, 6200));
  },
  ltom(ctx, out, t, g, r, L) {
    drop(ctx, out, t, g * 0.85, 165 * r, 98 * r, 0.09, 0.14 * L);
    tick(ctx, out, t, g * 0.12, 'bandpass', 2800, 0.006);
  },
  htom(ctx, out, t, g, r, L) {
    drop(ctx, out, t, g * 0.8, 240 * r, 148 * r, 0.08, 0.115 * L);
    tick(ctx, out, t, g * 0.12, 'bandpass', 3400, 0.006);
  },
  cow(ctx, out, t, g, r, L) {
    const bp = filter(ctx, 'bandpass', 880 * r, 1.4), a = vca(ctx, out);
    bp.connect(a);
    const end = envelope(a.gain, t, g * 0.55, 0.075 * L);
    for (const f of [557, 834]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * r; o.connect(bp); run(o, t, end); }
  },
};

// 打楽器 inst を時刻 t に鳴らす。gain はステップの強さ（0〜1）、k はその打楽器のつまみ
export function trigger(ctx, out, inst, t, gain, k) {
  const { ratio, length, level } = voiceSettings(k), g = gain * level;
  if (!(g > 0)) return;
  VOICES[INSTRUMENTS[inst].id](ctx, out, Math.max(t, ctx.currentTime), g, ratio, length);
}
