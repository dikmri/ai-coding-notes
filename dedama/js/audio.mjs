// 音（WebAudio で作る。曲も効果音もすべてオリジナル。音の素材ファイルは使わない）
import { log } from './log.mjs';

let ac = null, master = null, enabled = true, sadBus = null, sadTimer = 0, ambient = null;
const lastPlay = new Map();

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 'C5' 'G#4' 'Bb3' → 周波数
export function freq(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  const midi = 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}
const transpose = (name, semi) => {
  const f = freq(name) * 2 ** (semi / 12);
  return f;
};

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { log('audio.init', {}, 'error: no AudioContext'); return false; }
  ac = new AC();
  master = ac.createGain();
  master.gain.value = enabled ? 0.5 : 0;
  // 強い音で割れないように軽く抑える
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ac.destination);
  log('audio.init', { state: ac.state, rate: ac.sampleRate });
  return true;
}
export function setSound(on) {
  enabled = on;
  if (master) master.gain.setTargetAtTime(on ? 0.5 : 0, ac.currentTime, 0.05);
  log('audio.toggle', { on });
}
export const soundOn = () => enabled;

// ---- 楽器 ----
function env(g, t, a, d, s, r, dur, peak = 1) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), t + a + d);
  g.gain.setValueAtTime(Math.max(0.0001, peak * s), t + Math.max(a + d, dur));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + d, dur) + r);
}
function brass(bus, t, f, dur, vel = 0.22) {
  const g = ac.createGain(), lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(3400, t + 0.06); lp.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
  for (const det of [-7, 7]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    o.connect(lp); o.start(t); o.stop(t + dur + 0.2);
  }
  lp.connect(g).connect(bus);
  env(g, t, 0.025, 0.12, 0.7, 0.09, dur, vel);
}
function tone(bus, t, f, dur, type = 'triangle', vel = 0.2, { vib = 0, a = 0.02, r = 0.15 } = {}) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = f;
  if (vib) {
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = 5.2; lg.gain.value = f * vib;
    l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + r + 0.1);
  }
  o.connect(g).connect(bus);
  env(g, t, a, 0.1, 0.75, r, dur, vel);
  o.start(t); o.stop(t + dur + r + 0.1);
}
function chime(bus, t, f, dur = 1.2, vel = 0.25) {
  for (const [mul, v] of [[1, 1], [2.01, 0.35], [3.02, 0.12]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f * mul;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
}
let noiseBuf = null;
function noise(bus, t, dur, { hp = 4000, vel = 0.15 } = {}) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus); s.start(t); s.stop(t + dur + 0.05);
}
function timpani(bus, t, f = 90, vel = 0.5) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g).connect(bus); o.start(t); o.stop(t + 0.7);
}

// ---- 曲 ----
// 万発のファンファーレ（ハ長調、140 拍）。k 万発ごとに 2 半音ずつ上げる
const FANFARE = {
  bpm: 140,
  melody: [['G4', 0.5], ['G4', 0.5], ['C5', 0.5], ['E5', 0.5], ['G5', 1.5], ['E5', 0.5], ['F5', 0.5], ['A5', 0.5], ['C6', 1], ['B5', 0.5], ['A5', 0.5], ['G5', 1],
    ['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 1], ['G5', 1], ['C6', 3]],
  chords: [[['C4', 'E4', 'G4'], 2], [['C4', 'E4', 'G4'], 2], [['F3', 'A3', 'C4'], 2], [['G3', 'B3', 'D4'], 2], [['F3', 'A3', 'C4'], 2], [['G3', 'B3', 'D4'], 2], [['C4', 'E4', 'G4', 'C5'], 3]],
};
function playFanfare(semi = 0) {
  const t0 = ac.currentTime + 0.05, beat = 60 / FANFARE.bpm;
  let t = t0;
  for (const [n, b] of FANFARE.melody) { brass(master, t, transpose(n, semi), b * beat * 0.92, 0.2); t += b * beat; }
  t = t0;
  for (const [ch, b] of FANFARE.chords) {
    for (const n of ch) brass(master, t, transpose(n, semi), b * beat * 0.95, 0.07);
    timpani(master, t, 70 * 2 ** (semi / 12), 0.35);
    t += b * beat;
  }
  // 最後の和音でティンパニの連打とシンバル
  const last = t - 3 * beat;
  for (let i = 0; i < 10; i++) timpani(master, last + i * 0.07, 65 * 2 ** (semi / 12), 0.18 + i * 0.02);
  noise(master, last, 2.2, { hp: 5000, vel: 0.16 });
  return t - t0;
}

// 逆万発の悲しい曲（イ短調、66 拍、16 拍で 1 周）
const SAD = {
  bpm: 66,
  melody: [['E5', 1], ['D5', 0.5], ['C5', 0.5], ['B4', 1.5], ['A4', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['G#4', 0.5], ['A4', 2],
    ['F5', 1], ['E5', 0.5], ['D5', 0.5], ['C5', 1.5], ['B4', 0.5], ['A4', 0.5], ['B4', 0.5], ['C5', 0.5], ['B4', 0.5], ['E4', 2]],
  chords: [[['A2', 'E3', 'C4'], 2], [['G2', 'E3', 'B3'], 2], [['D3', 'F3', 'A3'], 1], [['E3', 'G#3', 'B3'], 1], [['A2', 'E3', 'A3'], 2],
    [['D3', 'F3', 'A3'], 2], [['A2', 'E3', 'C4'], 2], [['F2', 'C3', 'A3'], 1], [['E2', 'B2', 'G#3'], 1], [['E2', 'B2', 'E3'], 2]],
};
function sadLoop() {
  if (!sadBus) return;
  const t0 = ac.currentTime + 0.05, beat = 60 / SAD.bpm;
  let t = t0;
  for (const [n, b] of SAD.melody) { tone(sadBus, t, freq(n), b * beat * 0.9, 'triangle', 0.16, { vib: 0.006, a: 0.05, r: 0.4 }); t += b * beat; }
  t = t0;
  for (const [ch, b] of SAD.chords) {
    for (const n of ch) tone(sadBus, t, freq(n), b * beat, 'sine', 0.05, { a: 0.3, r: 0.6 });
    chime(sadBus, t, freq(ch[ch.length - 1]) * 2, 1.6, 0.05);
    t += b * beat;
  }
  sadTimer = setTimeout(sadLoop, (t - t0 - 0.1) * 1000);
}
export function startSad() {
  if (!ac || sadBus) return;
  sadBus = ac.createGain();
  sadBus.gain.setValueAtTime(0.0001, ac.currentTime);
  sadBus.gain.exponentialRampToValueAtTime(1, ac.currentTime + 1.5);
  sadBus.connect(master);
  sadLoop();
  log('audio.sad', { on: true });
}
export function stopSad() {
  if (!sadBus) return;
  clearTimeout(sadTimer);
  const b = sadBus;
  sadBus = null;
  b.gain.setTargetAtTime(0.0001, ac.currentTime, 0.6);
  setTimeout(() => b.disconnect(), 4000);
  log('audio.sad', { on: false });
}
export const sadPlaying = () => !!sadBus;

// 店のざわめき（玉の音）。音量は小さく
export function startAmbient() {
  if (!ac || ambient) return;
  const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let k = 0; k < 900; k++) {
    const at = Math.floor(Math.random() * len), amp = Math.random() * 0.8, n = Math.floor(ac.sampleRate * 0.006);
    for (let i = 0; i < n && at + i < len; i++) d[at + i] += amp * (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = buf; s.loop = true; f.type = 'highpass'; f.frequency.value = 2200; g.gain.value = 0.05;
  s.connect(f).connect(g).connect(master); s.start();
  ambient = { s, g };
}
export function stopAmbient() {
  if (!ambient) return;
  ambient.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.3);
  const a = ambient; ambient = null;
  setTimeout(() => { try { a.s.stop(); } catch { /* 止め済み */ } }, 1500);
}

// ---- 効果音 ----
export function sfx(name, arg = 0) {
  if (!ac || !enabled) return;
  const now = performance.now();
  const gap = name === 'hit' ? 140 : 60;
  if (now - (lastPlay.get(name) || 0) < gap) return;
  lastPlay.set(name, now);
  const t = ac.currentTime + 0.01;
  switch (name) {
    case 'hit': { // キュイン（連チャンが進むほど高く）
      const k = 1 + Math.min(arg, 20) * 0.035;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(650 * k, t); o.frequency.exponentialRampToValueAtTime(2300 * k, t + 0.2);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.5);
      ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => tone(master, t + 0.12 + i * 0.05, freq(n) * k, 0.06, 'square', 0.05, { a: 0.005, r: 0.05 }));
      break;
    }
    case 'chain': { // 5・10・15・20 連の節目
      const semi = Math.min(arg, 20) / 5 * 2;
      [['C5', 0], ['E5', 0.09], ['G5', 0.18], ['C6', 0.27]].forEach(([n, d]) => brass(master, t + d, transpose(n, semi), 0.25, 0.14));
      break;
    }
    case 'chime': chime(master, t, freq('E6'), 0.9, 0.22); chime(master, t + 0.45, freq('C6'), 1.4, 0.22); break;
    case 'closing': ['G5', 'E5', 'C5', 'G4'].forEach((n, i) => chime(master, t + i * 0.55, freq(n), 1.8, 0.2)); break;
    case 'blip': tone(master, t, 880, 0.04, 'square', 0.06, { a: 0.004, r: 0.03 }); break;
    case 'decide': tone(master, t, 988, 0.05, 'square', 0.07, { a: 0.004, r: 0.03 }); tone(master, t + 0.07, 1319, 0.08, 'square', 0.07, { a: 0.004, r: 0.05 }); break;
    case 'dash': noise(master, t, 0.35, { hp: 1200, vel: 0.2 }); tone(master, t, 220, 0.2, 'sawtooth', 0.06); break;
    case 'bump': timpani(master, t, 60, 0.6); noise(master, t, 0.2, { hp: 800, vel: 0.15 }); break;
    case 'win': ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => brass(master, t + i * 0.12, freq(n), i === 3 ? 0.8 : 0.12, 0.15)); break;
    case 'lose': ['E4', 'D#4', 'D4', 'C#4'].forEach((n, i) => tone(master, t + i * 0.32, freq(n), i === 3 ? 1.0 : 0.28, 'triangle', 0.15, { vib: i === 3 ? 0.02 : 0 })); break;
    case 'fanfare': playFanfare(arg); break;
    default: return;
  }
  log('sound.play', { name, arg });
}
