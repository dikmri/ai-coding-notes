// 音。曲は Gemini が楽譜のデータとして作曲したもの（data/music.json）、効果音は作り方のデータ（data/sfx.json）。
// 16ビットの家庭用ゲーム機のように、FM 音源・パルス波・三角波・雑音で、その場で鳴らす。曲は少し先まで予約しながら回す。
import { parseNotes, fitChannel } from './core/music.mjs';
import { encodeWav } from './core/wav.mjs';

export function makeAudio(musicData, sfxData) {
  let ac = null, master, musicBus, sfxBus, echoIn, pulse25, pulse12, noiseBuf;
  let vol = { music: 0.55, sfx: 0.8 };
  const tracks = {};
  for (const tr of (musicData && musicData.tracks) || []) {
    const steps = Math.max(16, (tr.bars || 8) * 16);
    tracks[tr.id] = { ...tr, steps, channels: tr.channels.map((c) => ({ ...c, seq: fitChannel(parseNotes(c.notes, { drums: c.inst === 'drums' }), steps) })) };
  }
  const sfxMap = {};
  for (const s of (sfxData && sfxData.sfx) || []) sfxMap[s.id] = s;

  function pulseWave(duty) {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ac.createPeriodicWave(re, im);
  }
  // 音の部品を ctx の上に組む（ふだんは AudioContext、書き出しのときは OfflineAudioContext）
  function build(ctx) {
      ac = ctx;
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      musicBus = ac.createGain(); musicBus.gain.value = vol.music; musicBus.connect(master);
      sfxBus = ac.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
      // こだま（当時の音源の残響のような、短いフィードバックのディレイ）
      echoIn = ac.createGain(); const d = ac.createDelay(1); d.delayTime.value = 0.27;
      const fb = ac.createGain(); fb.gain.value = 0.38; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      echoIn.connect(d); d.connect(lp).connect(fb).connect(d); lp.connect(master);
      pulse25 = pulseWave(0.25); pulse12 = pulseWave(0.125);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  function unlock() {
    if (!ac) build(new AudioContext());
    if (ac.state === 'suspended') ac.resume();
  }
  // 曲を sec 秒ぶん、鳴らさずに作って WAV のバイト列にする（Gemini に聞いてもらうため）
  async function renderTrack(id, sec = 20) {
    const tr = tracks[id];
    if (!tr) return null;
    const live = { ac, master, musicBus, sfxBus, echoIn, pulse25, pulse12, noiseBuf };
    const off = new OfflineAudioContext(2, Math.round(44100 * sec), 44100);
    build(off);
    const sd = 60 / tr.bpm / 4;
    for (let k = 0, t = 0.05; t < sec - 0.05; k++, t += sd) {
      const step = k % tr.steps;
      for (const ch of tr.channels) for (const e of ch.seq.events) if (e.step === step) {
        const opt = { v: ch.vol ?? 0.6, pan: ch.pan || 0, echo: ch.echo || 0 };
        if (ch.inst === 'drums') e.notes.forEach((n) => drum(n, t, opt)); else e.notes.forEach((m) => play(ch.inst, m, t, e.len * sd * 0.95, opt));
      }
    }
    const done = off.startRendering();
    ({ ac, master, musicBus, sfxBus, echoIn, pulse25, pulse12, noiseBuf } = live);
    const buf = await done;
    return encodeWav([buf.getChannelData(0), buf.getChannelData(1)], buf.sampleRate);
  }
  const mf = (m) => 440 * 2 ** ((m - 69) / 12);
  function out(node, { bus, pan = 0, echo = 0 }) {
    let n = node;
    if (pan) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); n.connect(p); n = p; }
    n.connect(bus);
    if (echo > 0) { const e = ac.createGain(); e.gain.value = echo; n.connect(e).connect(echoIn); }
  }
  function osc(type, f, t) {
    const o = ac.createOscillator();
    if (type === 'pulse25') o.setPeriodicWave(pulse25); else if (type === 'pulse12') o.setPeriodicWave(pulse12); else o.type = type;
    o.frequency.setValueAtTime(f, t);
    return o;
  }
  function env(g, t, a, peak, d, sustain, rel) {
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), t + a + d);
    g.gain.setValueAtTime(Math.max(0.0001, peak * sustain), rel); g.gain.exponentialRampToValueAtTime(0.0001, rel + 0.08);
  }
  function noise(t, dur, { type = 'highpass', f = 6000, q = 0.7, vol: v = 0.2, bus, pan = 0, echo = 0, f1 = null }) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f1) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g); out(g, { bus, pan, echo }); s.start(t); s.stop(t + dur + 0.02);
  }
  // 楽器
  function play(inst, midi, t, dur, { v = 0.5, pan = 0, echo = 0 }) {
    const bus = musicBus, f = mf(midi), end = t + dur;
    const vv = v * 0.16;
    const simple = (type, a, d, s, detune = 0) => { const o = osc(type, f, t), g = ac.createGain(); o.detune.value = detune; env(g, t, a, vv, d, s, end); o.connect(g); out(g, { bus, pan, echo }); o.start(t); o.stop(end + 0.1); };
    const fm = (ratio, index, a, d, s, idxDecay = 0.3) => {
      const c = osc('sine', f, t), m = osc('sine', f * ratio, t), mg = ac.createGain(), g = ac.createGain();
      mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * idxDecay), t + Math.max(0.05, dur));
      m.connect(mg).connect(c.frequency); env(g, t, a, vv, d, s, end); c.connect(g); out(g, { bus, pan, echo });
      c.start(t); m.start(t); c.stop(end + 0.1); m.stop(end + 0.1);
    };
    switch (inst) {
      case 'lead_pulse': return simple('pulse25', 0.005, 0.12, 0.6);
      case 'lead_square': return simple('square', 0.005, 0.1, 0.55);
      case 'fm_bell': return fm(3.5, 2.2, 0.003, 0.5, 0.15, 0.1);
      case 'fm_epiano': return fm(1, 1.6, 0.004, 0.35, 0.35, 0.2);
      case 'fm_brass': return fm(1, 2.4, 0.04, 0.2, 0.7, 0.6);
      case 'fm_bass': return fm(0.5, 2.0, 0.003, 0.15, 0.55, 0.2);
      case 'tri_bass': return simple('triangle', 0.004, 0.1, 0.8);
      case 'strings': { simple('sawtooth', 0.18, 0.3, 0.7, -7); return simple('sawtooth', 0.18, 0.3, 0.7, 7); }
      case 'flute': return simple('sine', 0.05, 0.1, 0.85);
      case 'harp': return simple('triangle', 0.002, 0.4, 0.1);
      default: return simple('square', 0.005, 0.1, 0.5);
    }
  }
  function drum(kind, t, { v = 0.6, pan = 0, echo = 0 }) {
    const bus = musicBus, vv = v * 0.5;
    if (kind === 'K') { const o = osc('sine', 150, t), g = ac.createGain(); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(vv, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(g); out(g, { bus, pan }); o.start(t); o.stop(t + 0.2); }
    else if (kind === 'S') { noise(t, 0.14, { f: 1500, vol: vv * 0.6, bus, pan, echo }); const o = osc('triangle', 200, t), g = ac.createGain(); g.gain.setValueAtTime(vv * 0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); o.connect(g); out(g, { bus, pan }); o.start(t); o.stop(t + 0.1); }
    else if (kind === 'H') noise(t, 0.04, { f: 7500, vol: vv * 0.35, bus, pan });
    else if (kind === 'O') noise(t, 0.22, { f: 6500, vol: vv * 0.3, bus, pan });
    else if (kind === 'T') { const o = osc('sine', 220, t), g = ac.createGain(); o.frequency.exponentialRampToValueAtTime(110, t + 0.15); g.gain.setValueAtTime(vv * 0.8, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); out(g, { bus, pan }); o.start(t); o.stop(t + 0.22); }
  }

  // ---- 曲の予約 ----
  let cur = null, timer = null;
  function schedule() {
    if (!cur) return;
    const tr = cur.track, sd = 60 / tr.bpm / 4, ahead = ac.currentTime + 0.15;
    while (cur.next < ahead) {
      const step = cur.step % tr.steps;
      for (const ch of tr.channels) {
        for (const e of ch.seq.events) if (e.step === step) {
          const opt = { v: ch.vol ?? 0.6, pan: ch.pan || 0, echo: ch.echo || 0 };
          if (ch.inst === 'drums') e.notes.forEach((k) => drum(k, cur.next, opt));
          else e.notes.forEach((m) => play(ch.inst, m, cur.next, e.len * sd * 0.95, opt));
        }
      }
      cur.step++; cur.next += sd;
    }
  }
  function playMusic(id) {
    if (!ac) return;
    if (cur && cur.id === id) return;
    stopMusic();
    const track = tracks[id];
    if (!track) return;
    cur = { id, track, step: 0, next: ac.currentTime + 0.08 };
    musicBus.gain.cancelScheduledValues(ac.currentTime); musicBus.gain.setValueAtTime(vol.music, ac.currentTime);
    timer = setInterval(schedule, 25);
  }
  function stopMusic() { if (timer) clearInterval(timer); timer = null; cur = null; }

  // ---- 効果音 ----
  function sfx(id) {
    if (!ac) return;
    const s = sfxMap[id];
    if (!s) return;
    const t0 = ac.currentTime + 0.005;
    for (const L of s.layers) {
      const t = t0 + (L.delay_ms || 0) / 1000, dur = Math.max(0.01, (L.dur_ms || 80) / 1000);
      const v = Math.min(0.6, L.vol ?? 0.2) * 0.9, bus = sfxBus, echo = L.echo || 0;
      if (L.wave === 'noise') { noise(t, dur, { type: 'bandpass', f: Math.max(60, L.f0 || 2000), f1: L.f1 || null, q: 0.9, vol: v, bus, echo }); continue; }
      const o = osc(L.wave === 'pulse25' ? 'pulse25' : L.wave, Math.max(20, L.f0 || 440), t), g = ac.createGain();
      if (L.arp && L.arp.length) {
        const st = (L.arp_ms || 60) / 1000;
        L.arp.forEach((semi, i) => o.frequency.setValueAtTime(Math.max(20, L.f0) * 2 ** (semi / 12), t + i * st));
      } else if (L.f1 && L.f1 !== L.f0) {
        if (L.curve === 'lin') o.frequency.linearRampToValueAtTime(Math.max(20, L.f1), t + dur);
        else o.frequency.exponentialRampToValueAtTime(Math.max(20, L.f1), t + dur);
      }
      const a = Math.min(dur / 2, (L.attack_ms || 2) / 1000);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); out(g, { bus, echo }); o.start(t); o.stop(t + dur + 0.03);
    }
  }
  return {
    unlock, playMusic, stopMusic, sfx, renderTrack,
    get ready() { return !!ac; },
    get musicId() { return cur ? cur.id : null; },
    setVolume(kind, v) { vol[kind] = v; if (ac) (kind === 'music' ? musicBus : sfxBus).gain.value = v; },
    trackIds: () => Object.keys(tracks),
  };
}
