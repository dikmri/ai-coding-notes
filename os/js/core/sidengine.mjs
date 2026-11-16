// SID 風シンセの音源: 3つの声部、合成波形、パルス幅、ADSR、同期、リング変調、共通のフィルター、並び順どおりの再生。
// AudioWorklet（鳴らす）と画面（WAV の書き出し）の両方から同じ計算を使う。DOM も Web Audio も使わない
import { noteFreq, waveSample, lfsrNext, noiseValue, envStep, svf, TRI } from './sid.mjs';
import { emptyPattern, songEvents, stepSec } from './song.mjs';

export const defaultVoice = () => ({ wave: 4, pw: 0.5, a: 0.002, d: 0.1, s: 0.6, r: 0.1, sync: false, ring: false, filter: false, mute: false });
export const defaultSong = () => ({
  format: 'future-os-sng', version: 1, bpm: 120, order: ['A'], patterns: { A: emptyPattern() },
  voices: [defaultVoice(), defaultVoice(), defaultVoice()],
  filter: { lp: true, bp: false, hp: false, cutoff: 1200, res: 0.3 }, volume: 0.8,
});

// パソコンの鍵盤（物理的な位置の e.code）を音の番号にする。下の段 Z〜/ と上の段 Q〜P の2段で、上の段は1オクターブ上
const KEYS = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11, Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28,
};
export function keyToNote(code, octave) {
  if (!(code in KEYS)) return null;
  const n = (octave + 1) * 12 + KEYS[code];
  return n >= 0 && n <= 127 ? n : null;
}

const ENV_EVERY = 16; // エンベロープは 16 サンプルごとに進める（SID も細かい段で進む）

export class SidEngine {
  constructor(sr) {
    this.sr = sr;
    this.v = [0, 1, 2].map(() => ({ phase: 0, inc: 0, gate: false, env: { stage: 'off', level: 0 }, lfsr: 0x7ffff8, noise: 0, note: null }));
    this.p = defaultSong();
    this.flt = { lp: 0, bp: 0 };
    this.dc = { x: 0, y: 0 };
    this.dcR = 1 - (2 * Math.PI * 10) / sr;
    this.k = 0;
    this.seq = null;
  }
  setParams(song) {
    this.p = {
      voices: [0, 1, 2].map((i) => ({ ...defaultVoice(), ...(song.voices?.[i] || {}) })),
      filter: { ...defaultSong().filter, ...(song.filter || {}) },
      volume: song.volume ?? 0.8,
    };
  }
  noteOn(i, note) {
    const v = this.v[i];
    v.note = note; v.inc = noteFreq(note) / this.sr; v.gate = true;
    v.env = { stage: 'a', level: v.env.level }; // 鳴っている途中でも立ち上がりからやり直す（音量は今の値から続けて、ぷつっと鳴らさない）
  }
  noteOff(i) { this.v[i].gate = false; }
  allOff() { for (let i = 0; i < 3; i++) this.noteOff(i); }

  // 並び順どおりに鳴らす。pattern を渡すとそのパターンだけ、from で並び順の途中から
  play(song, opt = {}) {
    this.opt = { loop: true, pattern: null, from: 0, ...opt };
    this.build(song, null);
  }
  // 再生中に曲を書き換えたとき: 今のステップの位置を保ったまま、音符の並びと速さを入れ替える
  update(song) {
    const q = this.seq;
    if (!q) return;
    this.build(song, q.pos / q.stepN);
  }
  build(song, atStep) {
    const { loop, pattern, from } = this.opt, one = pattern != null;
    const s = one ? { ...song, order: [pattern] } : song;
    const stepN = stepSec(s) * this.sr;
    const ev = songEvents(s).map((e) => ({ ...e, at: Math.round(e.t * this.sr) }));
    const len = Math.round(s.order.length * 16 * stepN);
    let pos = atStep != null ? Math.round(atStep * stepN) : one ? 0 : Math.round(Math.max(0, Math.min(from, s.order.length - 1)) * 16 * stepN);
    if (pos >= len) pos = 0;
    let i = 0;
    while (i < ev.length && ev[i].at < pos) i++;
    this.seq = { ev, i, pos, len, loop, stepN, one, orderIdx: one ? song.order.indexOf(pattern) : 0 };
  }
  stop() { this.seq = null; this.allOff(); }
  get playing() { return !!this.seq; }
  position() {
    const q = this.seq;
    if (!q) return null;
    const step = Math.floor(q.pos / q.stepN);
    return { order: q.one ? q.orderIdx : Math.floor(step / 16), step: step % 16 };
  }

  render(out, start, n) {
    const { voices, filter, volume } = this.p, sr = this.sr, v = this.v, wrapped = [false, false, false], smp = [0, 0, 0];
    const anyMode = filter.lp || filter.bp || filter.hp;
    for (let j = start; j < start + n; j++) {
      const q = this.seq;
      if (q) {
        while (q.i < q.ev.length && q.ev[q.i].at <= q.pos) { const e = q.ev[q.i++]; if (e.type === 'on') this.noteOn(e.voice, e.note); else this.noteOff(e.voice); }
        if (++q.pos >= q.len) {
          if (q.loop) { q.pos = 0; q.i = 0; } else { this.seq = null; this.allOff(); }
        }
      }
      // 発振（位相 0〜1）。雑音のレジスタは、1周で16回進める
      for (let k = 0; k < 3; k++) {
        const o = v[k], before = o.phase * 16;
        o.phase += o.inc;
        wrapped[k] = o.phase >= 1;
        if (wrapped[k]) o.phase %= 1;
        let clocks = Math.min(8, Math.floor(before + o.inc * 16) - Math.floor(before));
        while (clocks-- > 0) o.lfsr = lfsrNext(o.lfsr);
        o.noise = noiseValue(o.lfsr);
      }
      // 同期: 1つ前の声部（声部1なら声部3）が1周したら、こちらの位相を頭に戻す
      for (let k = 0; k < 3; k++) if (voices[k].sync && wrapped[(k + 2) % 3]) v[k].phase = 0;
      if (this.k++ % ENV_EVERY === 0) for (let k = 0; k < 3; k++) v[k].env = envStep(v[k].env, v[k].gate, voices[k], ENV_EVERY / sr);
      let direct = 0, toFilter = 0;
      for (let k = 0; k < 3; k++) {
        const p = voices[k], o = v[k];
        if (p.mute || o.env.level <= 0) { smp[k] = 0; continue; }
        let s = waveSample(p.wave, o.phase, p.pw, o.noise);
        // リング変調: 三角波を、1つ前の声部の位相の後ろ半分で裏返す
        if (p.ring && p.wave & TRI && v[(k + 2) % 3].phase >= 0.5) s = -s;
        s *= o.env.level;
        if (p.filter) toFilter += s; else direct += s;
      }
      let y = toFilter;
      if (toFilter !== 0 || this.flt.lp !== 0 || this.flt.bp !== 0) {
        const r = svf(this.flt, toFilter, filter.cutoff, filter.res, sr);
        this.flt.lp = r.lp; this.flt.bp = r.bp;
        if (Math.abs(r.lp) < 1e-9 && Math.abs(r.bp) < 1e-9) { this.flt.lp = 0; this.flt.bp = 0; }
        if (anyMode) y = (filter.lp ? r.lp : 0) + (filter.bp ? r.bp : 0) + (filter.hp ? r.hp : 0);
      }
      const x = (direct + y) * 0.32 * volume;
      // 直流を取り除く（矩形波の片寄りで、止めた時にぼこっと鳴らさない）
      const d = x - this.dc.x + this.dcR * this.dc.y;
      this.dc.x = x; this.dc.y = Math.abs(d) < 1e-12 ? 0 : d;
      out[j] = d > 1 ? 1 : d < -1 ? -1 : d;
    }
  }
}

// 曲全体を1本の音（モノラル）にする。tail 秒だけ余韻を足す
export function renderSong(song, sr, tail = 1.5) {
  const e = new SidEngine(sr);
  e.setParams(song);
  e.play(song, { loop: false });
  const n = Math.ceil((song.order.length * 16 * stepSec(song) + tail) * sr), out = new Float32Array(n);
  e.render(out, 0, n);
  return out;
}
