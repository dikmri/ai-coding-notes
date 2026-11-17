// 操作音と起動の音（FUTURE OS // ARCADIA-91）。音のファイルは持たず、すべて Web Audio でその場で作る。
// 音の作り方は Gemini 4 Carbon の設計書（build/gemini/design-spec.json の sounds と boot）に合わせた。
// FM のベルとマリンバ、7th の和音、短い光る音。どれも小さめの音量で、続けて鳴っても耳障りにならないようにする。
let ac = null, master = null, verb = null, verbIn = null;
const cfg = { volume: 0.6, mute: false, ui: true, keys: true };
const log = (...a) => (window.dlog || (() => {}))(...a);

export function configure(c) {
  Object.assign(cfg, c || {});
  if (master) master.gain.value = cfg.mute ? 0 : cfg.volume;
}
export const settings = () => ({ ...cfg });

// 残響（その場で作った減衰する雑音を、たたみ込みの応答に使う）
function makeReverb(sec = 2.2) {
  const n = Math.round(ac.sampleRate * sec), buf = ac.createBuffer(2, n, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  }
  const c = ac.createConvolver(); c.buffer = buf;
  return c;
}
// 最初に利用者が押したときに呼ぶ（ブラウザは押される前の音を許さない）
export function unlock() {
  try {
    if (!ac) {
      ac = new AudioContext();
      master = ac.createGain();
      master.connect(ac.destination);
      verb = makeReverb();
      verbIn = ac.createGain(); verbIn.gain.value = 0.6;
      verbIn.connect(verb).connect(master);
      configure();
      log('sound.unlock', { rate: ac.sampleRate }, 'ok');
    }
    if (ac.state === 'suspended') ac.resume();
  } catch (e) { log('sound.unlock', {}, 'error: ' + e.message); }
  return ac;
}
export const context = () => ac;

const mf = (m) => 440 * 2 ** ((m - 69) / 12);
// 音名を MIDI の番号にする（例: 'F#4' → 66）
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const nm = (s) => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(s); return 12 * (+m[3] + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
const hz = (s) => mf(nm(s));

// 出口: dry（そのまま）と wet（残響へ）。起動の音は止められるように、専用の出口を渡す
const outs = () => ({ dry: master, wet: verbIn });
function route(node, { pan = 0, wet = 0, out = outs() } = {}) {
  let n = node;
  if (pan) { const p = ac.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
  n.connect(out.dry);
  if (wet) { const w = ac.createGain(); w.gain.value = wet; n.connect(w).connect(out.wet); }
}
// 1音（基本の波形）。to を渡すと音程が滑る
function tone(f, t, dur, { type = 'sine', vol = 0.1, to = null, attack = 0.004, pan = 0, wet = 0, out } = {}) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g); route(g, { pan, wet, out });
  o.start(t); o.stop(t + dur + 0.03);
}
// FM の1音（ベル、エレピ、マリンバ）。ratio は変調の周波数の比、index は変調の深さ
function fm(f, t, dur, { ratio = 2, index = 2, vol = 0.1, pan = 0, wet = 0, out, attack = 0.003 } = {}) {
  const c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
  c.frequency.value = f; m.frequency.value = f * ratio;
  mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * index * 0.05 + 0.01, t + dur);
  m.connect(mg).connect(c.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  c.connect(g); route(g, { pan, wet, out });
  c.start(t); m.start(t); c.stop(t + dur + 0.03); m.stop(t + dur + 0.03);
}
let noiseBuf = null;
function noise(t, dur, { vol = 0.1, type = 'bandpass', f0 = 1500, f1 = null, q = 0.8, attack = 0.002, swell = false, pan = 0, wet = 0, out } = {}) {
  if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (swell) { g.gain.setValueAtTime(0.0005, t); g.gain.exponentialRampToValueAtTime(vol, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.03); }
  else { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); }
  s.connect(fl).connect(g); route(g, { pan, wet, out });
  s.start(t); s.stop(t + dur + 0.05);
}
// ずらしたノコギリ波を重ねた和音（パッド、スーパーソウ）。cutoff から cutoff2 へフィルターを開く
function chord(notes, t, dur, { vol = 0.02, voices = 2, spread = 9, cutoff = 1200, cutoff2 = null, attack = 0.3, release = 0.6, wet = 0.3, out } = {}) {
  const fl = ac.createBiquadFilter(), g = ac.createGain();
  fl.type = 'lowpass'; fl.frequency.setValueAtTime(cutoff, t); if (cutoff2) fl.frequency.exponentialRampToValueAtTime(cutoff2, t + Math.max(0.05, dur - release));
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + attack); g.gain.setValueAtTime(1, t + Math.max(attack, dur - release)); g.gain.linearRampToValueAtTime(0, t + dur);
  fl.connect(g); route(g, { wet, out });
  for (const n of notes) for (let v = 0; v < voices; v++) {
    const o = ac.createOscillator(), og = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = voices === 1 ? 0 : -spread + (2 * spread * v) / (voices - 1);
    og.gain.value = vol; o.connect(og).connect(fl);
    o.start(t); o.stop(t + dur + 0.05);
  }
}

// 起動の音（約13秒）。runBoot が始まると同時に呼び、場面に合わせて全部を予約する。飛ばしたら stop() で止める
export function bootScore() {
  if (!ac || cfg.mute) return { stop() {} };
  const dry = ac.createGain(), wet = ac.createGain();
  dry.connect(master); wet.connect(verbIn);
  const out = { dry, wet };
  const t0 = ac.currentTime + 0.03, T = (ms) => t0 + ms / 1000;
  // 場面1: 電源のスイッチ、ブラウン管が帯電する上昇音、文字を打つ音
  tone(180, T(0), 0.06, { type: 'square', vol: 0.1, to: 90, out });
  tone(110, T(30), 1.05, { type: 'sine', vol: 0.05, to: 1760, attack: 0.3, out });
  for (let i = 0; i < 22; i++) tone(2400, T(450 + i * 28), 0.015, { type: 'square', vol: 0.018, out });
  // 場面2〜4: 低い土台の音（A1）
  tone(55, T(1100), 5.9, { type: 'triangle', vol: 0.14, attack: 0.8, out });
  // 場面2: FM マリンバの分散和音（Amaj9）が左右に揺れながら上っていく
  const arp = ['A3', 'C#4', 'E4', 'G#4', 'B4', 'C#5', 'E5', 'G#5', 'B5', 'C#6', 'E6', 'G#6', 'B6', 'E6', 'G#6', 'B6'];
  arp.forEach((n, i) => fm(hz(n), T(1150 + i * 105), 0.32, { ratio: 4, index: 1.6, vol: 0.06, pan: i % 2 ? 0.45 : -0.45, wet: 0.35, out }));
  // 場面3: 夕陽が昇るパッド（F#maj7）。フィルターがゆっくり開く
  chord(['F#3', 'A#3', 'C#4', 'F4'], T(2800), 2.0, { vol: 0.018, cutoff: 400, cutoff2: 3200, attack: 0.6, release: 0.4, out });
  // 場面4: G#m7 → C#9 と、左右を飛ぶ FM のベル
  chord(['G#3', 'B3', 'D#4', 'F#4'], T(4600), 1.2, { vol: 0.017, cutoff: 2200, attack: 0.25, release: 0.3, out });
  chord(['C#4', 'F4', 'G#4', 'B4', 'D#5'], T(5700), 1.3, { vol: 0.015, cutoff: 2600, attack: 0.25, release: 0.4, out });
  ['E5', 'G#5', 'B5', 'D#6', 'B5', 'G#5', 'D#6', 'E6'].forEach((n, i) => fm(hz(n), T(4700 + i * 250), 0.9, { ratio: 3.5, index: 2.2, vol: 0.05, pan: i % 2 ? 0.7 : -0.7, wet: 0.5, out }));
  // 場面5: 逆回しのシンバルのように膨らむ雑音 → 水晶が光る和音（Bmaj9）
  noise(T(7000), 1.0, { vol: 0.08, f0: 800, f1: 6000, q: 0.6, swell: true, wet: 0.3, out });
  ['B5', 'D#6', 'F#6', 'A#6', 'C#7'].forEach((n, i) => { tone(hz(n), T(8000 + i * 12), 2.4, { type: 'sine', vol: 0.045, wet: 0.7, pan: (i - 2) * 0.25, out }); fm(hz(n), T(8000 + i * 12), 1.6, { ratio: 3.5, index: 1.2, vol: 0.02, wet: 0.6, out }); });
  // 場面6: キックとスネア、スーパーソウの和音（Emaj9 → F#6 → G#m9）、題字が着地するたびの音
  tone(150, T(9000), 0.18, { type: 'sine', vol: 0.45, to: 45, out });
  noise(T(9000), 0.16, { vol: 0.16, type: 'highpass', f0: 1500, out }); tone(200, T(9000), 0.08, { type: 'triangle', vol: 0.08, out });
  chord(['E3', 'G#3', 'B3', 'D#4', 'F#4'], T(9000), 0.85, { vol: 0.011, voices: 3, spread: 14, cutoff: 3000, attack: 0.02, release: 0.2, wet: 0.35, out });
  chord(['F#3', 'A#3', 'C#4', 'D#4'], T(9800), 0.85, { vol: 0.012, voices: 3, spread: 14, cutoff: 3200, attack: 0.02, release: 0.2, wet: 0.35, out });
  chord(['G#3', 'B3', 'D#4', 'F#4', 'A#4'], T(10600), 1.2, { vol: 0.011, voices: 3, spread: 14, cutoff: 3400, attack: 0.02, release: 0.5, wet: 0.4, out });
  for (let i = 0; i < 8; i++) tone(620, T(8900 + i * 190 + 260), 0.05, { type: 'sine', vol: 0.09, to: 300, out });
  // 場面7: 起動の完了を知らせる4音（エレピとグロッケンを重ね、長い残響）と、光の輪の音
  jingle(T(11400), out);
  noise(T(12200), 0.8, { vol: 0.05, f0: 2000, f1: 9000, q: 0.5, swell: true, wet: 0.5, out });
  log('sound.boot', {}, 'scheduled');
  return {
    stop() {
      const n = ac.currentTime;
      for (const g of [dry, wet]) { g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + 0.15); }
      setTimeout(() => { dry.disconnect(); wet.disconnect(); }, 400);
      log('sound.boot', {}, 'stopped');
    },
  };
}
function jingle(t, out) {
  ['B4', 'F#5', 'G#5', 'D#6'].forEach((n, i) => {
    fm(hz(n), t + i * 0.15, 1.4, { ratio: 1, index: 1.4, vol: 0.09, wet: 0.6, out });
    tone(hz(n) * 2, t + i * 0.15, 1.2, { type: 'sine', vol: 0.035, wet: 0.7, out });
  });
}
function shutdown(t) {
  ['D#6', 'G#5', 'F#5', 'B4'].forEach((n, i) => fm(hz(n), t + i * 0.16, 1.2, { ratio: 1, index: 1.2, vol: 0.07, wet: 0.6 }));
  chord(['B2', 'F#3', 'A#3', 'D#4'], t, 2.4, { vol: 0.016, cutoff: 2400, cutoff2: 150, attack: 0.05, release: 1.6 });
}

const SOUNDS = {
  // ふっくらしたボタンを押す「ポコッ・キラ」
  click: (t) => { tone(520, t, 0.05, { type: 'triangle', vol: 0.12, to: 260 }); tone(2093, t, 0.02, { type: 'sine', vol: 0.03 }); },
  // メニューの項目を決めたときの FM のベル2音
  select: (t) => { fm(hz('A5'), t, 0.16, { ratio: 3.5, index: 1.5, vol: 0.07 }); fm(hz('E6'), t + 0.045, 0.18, { ratio: 3.5, index: 1.5, vol: 0.06, wet: 0.2 }); },
  // メニューやランチャーが開く、水晶のハープ
  menu: (t) => ['C5', 'E5', 'G5', 'B5'].forEach((n, i) => fm(hz(n), t + i * 0.02, 0.14, { ratio: 2, index: 1, vol: 0.045, wet: 0.15 })),
  // 窓が開く（F#maj7 の FM エレピ）
  open: (t) => ['F#4', 'A#4', 'C#5', 'F5'].forEach((n, i) => fm(hz(n), t + i * 0.035, 0.26, { ratio: 2, index: 1.8, vol: 0.075, wet: 0.25 })),
  // 窓を閉じる（下る3音と、柔らかい雑音）
  close: (t) => { ['F5', 'C#5', 'A#4'].forEach((n, i) => tone(hz(n), t + i * 0.04, 0.12, { type: 'triangle', vol: 0.07 })); noise(t + 0.11, 0.08, { vol: 0.03, type: 'lowpass', f0: 1200 }); },
  min: (t) => tone(987, t, 0.11, { type: 'sine', vol: 0.08, to: 493 }),
  max: (t) => { tone(493, t, 0.12, { type: 'sine', vol: 0.07, to: 987 }); tone(740, t, 0.12, { type: 'sine', vol: 0.04, to: 1480 }); },
  // 注意の音（ほろ苦い Fm9 を2回）
  error: (t) => [0, 0.11].forEach((d) => ['F4', 'Ab4', 'C5', 'G5'].forEach((n) => fm(hz(n), t + d, 0.09, { ratio: 1, index: 1.3, vol: 0.05 }))),
  notify: (t) => { fm(hz('A5'), t, 0.7, { ratio: 3.5, index: 1.2, vol: 0.08, wet: 0.5 }); fm(hz('E6'), t + 0.08, 0.6, { ratio: 3.5, index: 1.2, vol: 0.05, wet: 0.5 }); },
  // ゴミ箱: 紙くずが星屑になる
  trash: (t) => { noise(t, 0.18, { vol: 0.08, f0: 1200, f1: 3600, q: 1.2 }); ['C6', 'D6', 'F6', 'G6', 'A6'].forEach((n, i) => tone(hz(n), t + 0.16 + i * 0.044, 0.12, { type: 'sine', vol: 0.035, wet: 0.3 })); },
  drop: (t) => tone(300, t, 0.08, { type: 'sine', vol: 0.1, to: 150 }),
  type: (t) => noise(t, 0.012, { vol: 0.03, type: 'highpass', f0: 3500 }),
  // チェックを入れる・外す
  toggleOn: (t) => { tone(hz('G5'), t, 0.06, { type: 'triangle', vol: 0.08 }); tone(hz('D6'), t + 0.03, 0.06, { type: 'triangle', vol: 0.07 }); },
  toggleOff: (t) => { tone(hz('D5'), t, 0.06, { type: 'triangle', vol: 0.07 }); tone(hz('G4'), t + 0.03, 0.06, { type: 'triangle', vol: 0.06 }); },
  // スライダーの刻み（値 0〜1 で音程が上がる）
  tick: (t, v = 0.5) => tone(880 * 2 ** Math.min(1, Math.max(0, v)), t, 0.02, { type: 'triangle', vol: 0.035 }),
  // 前の版の起動の音（電子音と、ブラウン管）
  beep: (t) => tone(1000, t, 0.16, { type: 'square', vol: 0.06 }),
  crt: (t) => noise(t, 0.35, { vol: 0.08, type: 'bandpass', f0: 1500 }),
  // 起動の音を飛ばしたときと、設定の「起動音」で鳴らす4音
  startup: (t) => jingle(t, outs()),
  shutdown,
  // 電卓の数字（0〜9 で音の高さが上がるマリンバ。五音の音階なので続けて押しても濁らない）
  key: (t, i = 0) => { const n = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6'][Math.max(0, Math.min(9, i))]; fm(hz(n), t, 0.2, { ratio: 4, index: 1.6, vol: 0.07 }); },
  // 電卓の演算子（低めの木の音）
  op: (t) => fm(hz('G4'), t, 0.12, { ratio: 1.5, index: 2.2, vol: 0.06 }),
  // 電卓の答え（7th の和音を上へ。i で根音を変える）
  equals: (t, i = 0) => { const r = [0, 2, 4, 7, 9][Math.abs(i) % 5]; ['C5', 'E5', 'G5', 'B5'].forEach((n, k) => fm(mf(nm(n) + r), t + k * 0.045, 0.5, { ratio: 2, index: 1.4, vol: 0.06, wet: 0.35 })); },
  // 付箋のピン留め（高い水晶のベル）
  pin: (t) => { fm(hz('E7'), t, 0.4, { ratio: 3.5, index: 2, vol: 0.05, wet: 0.4 }); tone(hz('B7'), t + 0.03, 0.25, { type: 'sine', vol: 0.02, wet: 0.5 }); },
  // タイマーの残り10秒の刻み
  count: (t) => fm(hz('A5'), t, 0.07, { ratio: 3, index: 0.8, vol: 0.04 }),
  // タイマーが終わったときのチャイム（F#maj7 を2回）
  chime: (t) => [0, 0.7].forEach((d) => ['F#5', 'A#5', 'C#6', 'F6'].forEach((n, k) => fm(hz(n), t + d + k * 0.09, 1.1, { ratio: 1, index: 1.3, vol: 0.08, wet: 0.5 }))),
};
// 操作音を切っていても鳴らす音（起動・終了と、タイマーのような知らせ）。消音のときは鳴らさない
const ALWAYS = ['startup', 'shutdown', 'beep', 'crt', 'chime'];
export function play(name, arg) {
  if (!ac || cfg.mute) return;
  if (name === 'type' && !cfg.keys) return;
  if (!cfg.ui && !ALWAYS.includes(name)) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  try { fn(ac.currentTime + 0.005, arg); } catch (e) { log('sound.play', { name }, 'error: ' + e.message); }
}
