// 操作音。音のファイルは持たず、すべて Web Audio でその場で作る
let ac = null, master = null, echo = null;
const cfg = { volume: 0.6, mute: false, ui: true, keys: true };
const log = (...a) => (window.dlog || (() => {}))(...a);

export function configure(c) {
  Object.assign(cfg, c || {});
  if (master) master.gain.value = cfg.mute ? 0 : cfg.volume;
}
export const settings = () => ({ ...cfg });
// 最初に利用者が押したときに呼ぶ（ブラウザは押される前の音を許さない）
export function unlock() {
  try {
    if (!ac) {
      ac = new AudioContext();
      master = ac.createGain();
      master.connect(ac.destination);
      // こだま（起動音や鐘の音に使う）
      echo = ac.createDelay(1);
      echo.delayTime.value = 0.28;
      const fb = ac.createGain(); fb.gain.value = 0.35;
      const wet = ac.createGain(); wet.gain.value = 0.5;
      echo.connect(fb).connect(echo);
      echo.connect(wet).connect(master);
      configure();
      log('sound.unlock', { rate: ac.sampleRate }, 'ok');
    }
    if (ac.state === 'suspended') ac.resume();
  } catch (e) { log('sound.unlock', {}, 'error: ' + e.message); }
  return ac;
}
export const context = () => ac;

function tone(f, t, dur, { type = 'square', vol = 0.15, to = null, attack = 0.004, wet = false } = {}) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g).connect(master);
  if (wet) g.connect(echo);
  o.start(t); o.stop(t + dur + 0.02);
}
let noiseBuf = null;
function noise(t, dur, { vol = 0.2, hp = 1500, lp = 12000 } = {}) {
  if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ac.createBufferSource(), h = ac.createBiquadFilter(), l = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; h.type = 'highpass'; h.frequency.value = hp; l.type = 'lowpass'; l.frequency.value = lp;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  s.connect(h).connect(l).connect(g).connect(master);
  s.start(t); s.stop(t + dur + 0.02);
}
const mf = (m) => 440 * 2 ** ((m - 69) / 12);

// 起動音: 和音がゆっくり開き、きらめく分散和音とこだまが重なる（約4.5秒）
function startup(t) {
  const chord = [48, 55, 59, 62, 64];
  for (const m of chord) for (const dt of [-7, 7]) {
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = mf(m); o.detune.value = dt;
    f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3200, t + 2.6); f.frequency.exponentialRampToValueAtTime(900, t + 4.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 1.2); g.gain.setValueAtTime(0.035, t + 3); g.gain.linearRampToValueAtTime(0, t + 4.6);
    o.connect(f).connect(g).connect(master); g.connect(echo);
    o.start(t); o.stop(t + 4.7);
  }
  tone(mf(36), t, 4.2, { type: 'sine', vol: 0.3, attack: 0.8 });
  [79, 84, 88, 91, 95, 98, 100].forEach((m, i) => tone(mf(m), t + 0.9 + i * 0.13, 1.6, { type: 'triangle', vol: 0.09, wet: true }));
  [91, 96].forEach((m, i) => tone(mf(m), t + 2.4 + i * 0.4, 2, { type: 'sine', vol: 0.12, wet: true }));
  noise(t + 2.2, 1.8, { vol: 0.03, hp: 6000 });
}
function shutdown(t) {
  [100, 95, 91, 88, 84, 79].forEach((m, i) => tone(mf(m), t + i * 0.12, 1.2, { type: 'triangle', vol: 0.08, wet: true }));
  for (const m of [48, 52, 55, 59]) {
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = mf(m);
    f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(150, t + 2.4);
    g.gain.setValueAtTime(0.04, t); g.gain.linearRampToValueAtTime(0, t + 2.5);
    o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 2.6);
  }
}
const SOUNDS = {
  click: (t) => tone(1900, t, 0.018, { vol: 0.05 }),
  select: (t) => tone(950, t, 0.03, { vol: 0.05, type: 'triangle' }),
  menu: (t) => tone(1150, t, 0.05, { vol: 0.06, to: 1500, type: 'triangle' }),
  open: (t) => { tone(mf(84), t, 0.07, { vol: 0.07 }); tone(mf(88), t + 0.05, 0.07, { vol: 0.07 }); tone(mf(91), t + 0.1, 0.12, { vol: 0.07, wet: true }); },
  close: (t) => { tone(mf(91), t, 0.06, { vol: 0.06 }); tone(mf(84), t + 0.05, 0.1, { vol: 0.06 }); },
  min: (t) => tone(900, t, 0.14, { vol: 0.07, to: 260, type: 'triangle' }),
  max: (t) => tone(260, t, 0.14, { vol: 0.07, to: 900, type: 'triangle' }),
  error: (t) => { tone(220, t, 0.28, { vol: 0.09 }); tone(233, t, 0.28, { vol: 0.09 }); },
  notify: (t) => { tone(mf(93), t, 0.7, { type: 'sine', vol: 0.12, wet: true }); tone(mf(100), t + 0.08, 0.6, { type: 'sine', vol: 0.06, wet: true }); },
  trash: (t) => { noise(t, 0.18, { vol: 0.18, hp: 900, lp: 5000 }); tone(140, t + 0.05, 0.12, { type: 'sine', vol: 0.15, to: 70 }); },
  drop: (t) => tone(300, t, 0.08, { type: 'sine', vol: 0.12, to: 150 }),
  type: (t) => noise(t, 0.012, { vol: 0.035, hp: 3500 }),
  beep: (t) => tone(1000, t, 0.16, { vol: 0.08 }),
  crt: (t) => { noise(t, 0.35, { vol: 0.12, hp: 300, lp: 3000 }); tone(15000, t + 0.1, 0.9, { type: 'sine', vol: 0.012 }); },
  startup, shutdown,
};
export function play(name) {
  if (!ac || cfg.mute) return;
  if (name === 'type' && !cfg.keys) return;
  if (!cfg.ui && !['startup', 'shutdown', 'beep', 'crt'].includes(name)) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  try { fn(ac.currentTime + 0.005); } catch (e) { log('sound.play', { name }, 'error: ' + e.message); }
}
