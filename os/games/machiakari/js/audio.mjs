// 音: 効果音と、昼と夜で雰囲気の変わる静かな曲（その場で作る。既存の曲は使わない）
const log = (...a) => (window.dlog || (() => {}))(...a);

export function makeAudio(settings) {
  let ac = null, master = null, sfxBus = null, musicBus = null, timer = 0, nextBar = 0, bar = 0;
  const A = { night: 0, ready: false };
  A.configure = (st) => {
    settings = st;
    if (!ac) return;
    master.gain.value = st.volume;
    sfxBus.gain.value = st.sfx ? 0.55 : 0;
    musicBus.gain.value = st.music ? 0.22 : 0;
  };
  A.unlock = () => {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new AudioContext();
      master = ac.createGain(); master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.connect(master);
      A.ready = true;
      A.configure(settings);
      nextBar = ac.currentTime + 0.2;
      timer = setInterval(schedule, 250);
      log('audio.unlock', {}, 'ok');
    } catch (e) { log('audio.unlock', {}, 'error: ' + e.message); }
  };
  function tone(f, dur, type = 'square', vol = 0.2, at = 0, slide = 0, bus = sfxBus) {
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq = 800, at = 0) {
    const t = ac.currentTime + at, n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = b; f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t);
  }
  const SFX = {
    click: () => tone(1320, 0.03, 'square', 0.05),
    open: () => { tone(660, 0.05, 'triangle', 0.12); tone(990, 0.06, 'triangle', 0.1, 0.05); },
    road: () => { tone(220, 0.06, 'square', 0.1); noise(0.08, 0.12, 1200); },
    zone: () => { tone(523, 0.05, 'triangle', 0.12); tone(784, 0.07, 'triangle', 0.1, 0.05); },
    build: () => { tone(392, 0.07, 'square', 0.1); tone(523, 0.07, 'square', 0.1, 0.07); tone(659, 0.1, 'square', 0.1, 0.14); },
    bulldoze: () => { noise(0.25, 0.3, 500); tone(90, 0.2, 'sawtooth', 0.08, 0, 0.6); },
    error: () => { tone(180, 0.12, 'square', 0.14); tone(140, 0.16, 'square', 0.14, 0.12); },
    coin: () => { tone(988, 0.06, 'square', 0.1); tone(1319, 0.14, 'square', 0.1, 0.06); },
    good: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, i * 0.08)),
    notice: () => tone(880, 0.08, 'sine', 0.1),
    alert: () => { for (let i = 0; i < 3; i++) { tone(784, 0.1, 'square', 0.1, i * 0.22); tone(587, 0.1, 'square', 0.1, i * 0.22 + 0.11); } },
    milestone: () => [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i === 6 ? 0.5 : 0.13, 'square', 0.1, i * 0.11)),
  };
  A.sfx = (name) => { if (!ac || !settings.sfx) return; try { (SFX[name] || SFX.click)(); } catch { /* 鳴らせない */ } };

  // 曲: 4小節の和音の進み（昼は明るく、夜は低く静かに）。音は五音音階から、その場で選ぶ
  const DAY = [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]];
  const NIGHT = [[-3, 0, 4, 7], [5, 9, 12, 16], [0, 4, 7, 11], [2, 5, 9, 12]];
  const PENTA = [0, 2, 4, 7, 9];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const hz = (semi, base = 261.63) => base * Math.pow(2, semi / 12);
  function schedule() {
    if (!ac || !settings.music) { if (ac) nextBar = Math.max(nextBar, ac.currentTime + 0.1); return; }
    const beat = A.night > 0.5 ? 0.62 : 0.48;
    while (nextBar < ac.currentTime + 1.2) {
      const prog = A.night > 0.5 ? NIGHT : DAY, ch = prog[bar % 4], t0 = nextBar - ac.currentTime;
      // 低音
      tone(hz(ch[0] - 24), beat * 3.6, 'triangle', 0.32, t0, 0, musicBus);
      // 和音を柔らかく
      for (const n of ch.slice(1)) tone(hz(n - 12), beat * 3.8, 'sine', 0.07, t0 + 0.01, 0, musicBus);
      // 旋律: 1小節に 4〜6 音
      const notes = A.night > 0.5 ? 3 : 5;
      for (let k = 0; k < notes; k++) {
        if (rnd() < 0.25) continue;
        const p = PENTA[Math.floor(rnd() * 5)] + (rnd() < 0.3 ? 12 : 0) + ch[0] % 12;
        tone(hz(p + (A.night > 0.5 ? 0 : 12)), beat * 0.9, A.night > 0.5 ? 'sine' : 'square', A.night > 0.5 ? 0.09 : 0.045, t0 + (k * beat * 4) / notes, 0, musicBus);
      }
      nextBar += beat * 4; bar++;
    }
  }
  A.stop = () => { clearInterval(timer); if (ac) ac.close(); ac = null; };
  return A;
}
