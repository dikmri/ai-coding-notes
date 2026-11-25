// 画面の配線。曲の選択・再生・スペクトルの表示・交互の測定・論文の模型を、worker.mjs と計算の部品につなぐ。
import { createRadix2, createRealFFT, rfftRadix2 } from './fft.mjs';
import { hann, frameSpectrum, logEdges, columnLevels, peakFrequency, noteName } from './spectrum.mjs';
import { PIECES } from './music.mjs';
import { paperWindow, firstSavingM, centeredWindow, exceptionalCount, gateCounts } from './repair.mjs';
import { log, watchErrors, logFile } from './log.mjs';

watchErrors();
const $ = (id) => document.getElementById(id);
const DB_MIN = -100, DB_MAX = 0;
const fmtMs = (ms) => (ms < 1 ? `${(ms * 1000).toFixed(ms < 0.01 ? 2 : 1)} µs` : `${ms.toFixed(ms < 10 ? 2 : 0)} ms`);
const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2)} kHz` : `${f.toFixed(1)} Hz`);
const fmtExp = (x) => {
  if (!(x > 0)) return '0';
  const e = Math.floor(Math.log10(x)), m = x / 10 ** e;
  return `${m.toFixed(1)}×10<sup>${e}</sup>`;
};
// 文の中で使う形（上付きの数字の文字で書く）
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const fmtExpText = (x) => {
  if (!(x > 0)) return '0';
  const e = Math.floor(Math.log10(x)), m = x / 10 ** e;
  return `${m.toFixed(1)}×10${[...String(e)].map((ch) => SUP[ch]).join('')}`;
};

/* ---------- 色（CSS の変数を実際の色に直して読む） ---------- */
const probe = document.createElement('span');
probe.className = 'vh';
probe.setAttribute('aria-hidden', 'true');
$('tool').append(probe);
const parseRgb = (s) => (s.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(Number);
function cssColor(name) { probe.style.color = `var(${name})`; return getComputedStyle(probe).color; }
let theme = null;
function readTheme() {
  const seq = [];
  for (let i = 0; i < 8; i++) seq.push(parseRgb(cssColor(`--viz-seq-${i}`)));
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * 7, a = Math.min(6, Math.floor(t)), f = t - a;
    for (let c = 0; c < 3; c++) lut[i * 4 + c] = seq[a][c] + (seq[a + 1][c] - seq[a][c]) * f;
    lut[i * 4 + 3] = 255;
  }
  theme = {
    surface: cssColor('--viz-surface'), ink: cssColor('--ink'), ink2: cssColor('--ink-2'), muted: cssColor('--viz-muted'),
    grid: cssColor('--viz-grid'), axis: cssColor('--viz-axis'), s1: cssColor('--viz-s1'), s2: cssColor('--viz-s2'), lut,
  };
  const stops = [0, 2, 4, 6, 7].map((i) => `rgb(${seq[i].join(',')})`).join(',');
  $('sgram-scale').style.background = `linear-gradient(to right, ${stops})`;
  sgImage = null; mapDirty = true;
}
const lutIndex = (db, lo, hi) => Math.max(0, Math.min(255, Math.round(((db - lo) / (hi - lo)) * 255)));

/* ---------- 計算を受け持つ Worker ---------- */
const worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
let reqId = 0;
const pending = new Map(), onProgress = {};
function call(msg, transfer = []) {
  const id = ++reqId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id }, transfer);
  });
}
worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'progress') { onProgress[m.what]?.(m); return; }
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.type === 'error') { log('worker.error', { what: m.what }, `error: ${m.message.slice(0, 400)}`); p.reject(new Error(m.message)); }
  else p.resolve(m);
};
worker.onerror = (e) => log('worker.exception', { msg: e.message }, 'exception');

/* ---------- 状態 ---------- */
const st = {
  piece: 'arp', title: '', signal: new Float32Array(0), sr: 44100,
  n: 2048, engine: 'fast',
  playing: false, offset: 0, startAt: 0, buffer: null, source: null,
};
let ctx = null, gain = null;
const status = (s) => { $('status').textContent = s; };

/* ---------- 曲を用意する ---------- */
let loadSeq = 0;
async function usePiece(id) {
  const seq = ++loadSeq;
  stopAudio(true);
  const meta = PIECES.find((p) => p.id === id);
  status(`「${meta.title}」を合成しています…`);
  const t0 = performance.now();
  try {
    const r = await call({ type: 'render', piece: id });
    if (seq !== loadSeq) return;
    Object.assign(st, { piece: id, title: meta.title, signal: r.signal, sr: r.sampleRate, buffer: null, offset: 0 });
    $('piece-desc').textContent = meta.desc;
    log('piece.select', { id, samples: r.signal.length, sr: r.sampleRate }, `ok ${Math.round(r.ms)}ms`);
    status(`「${meta.title}」を用意しました（${(r.signal.length / r.sampleRate).toFixed(1)} 秒、合成 ${Math.round(performance.now() - t0)} ms）。`);
    await afterSignal();
  } catch (err) {
    log('piece.select', { id }, `error: ${err.message.slice(0, 200)}`);
    status(`曲を作れませんでした: ${err.message.split('\n')[0]}`);
  }
}

async function useFile(file) {
  const seq = ++loadSeq;
  stopAudio(true);
  status(`「${file.name}」を読んでいます…`);
  log('file.open', { name: file.name, size: file.size, type: file.type });
  try {
    const data = await file.arrayBuffer();
    const ac = ensureCtx();
    const buf = await ac.decodeAudioData(data);
    if (seq !== loadSeq) return;
    // 全部のチャンネルを平均してモノラルにする
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
    }
    Object.assign(st, { piece: 'file', title: file.name, signal: mono, sr: buf.sampleRate, buffer: null, offset: 0 });
    await call({ type: 'signal', signal: Float32Array.from(mono), sampleRate: buf.sampleRate });
    const fileRadio = $('piece-file');
    fileRadio.disabled = false; fileRadio.checked = true;
    $('file-name').textContent = file.name;
    $('piece-desc').textContent = `${buf.numberOfChannels} チャンネルを平均したモノラル、${buf.sampleRate} Hz、${buf.duration.toFixed(1)} 秒。論文の模型は先頭の 1,048,576 標本を使います。`;
    log('file.decode', { name: file.name, ch: buf.numberOfChannels, sr: buf.sampleRate, sec: +buf.duration.toFixed(2) });
    status(`「${file.name}」を読みました。`);
    await afterSignal();
  } catch (err) {
    log('file.decode', { name: file.name }, `error: ${String(err?.message || err).slice(0, 200)}`);
    status(`このファイルは読めませんでした（${err?.name || 'エラー'}）。ブラウザが対応する形式（WAV・MP3・AAC・Ogg など）を選んでください。`);
  }
}

async function afterSignal() {
  sg = null; sgImage = null;
  drawAll();
  await computeSpectrogram();
}

/* ---------- 再生 ---------- */
function ensureCtx() {
  if (!ctx) {
    ctx = new AudioContext();
    gain = ctx.createGain();
    gain.gain.value = $('vol').value / 100;
    gain.connect(ctx.destination);
    log('audio.context', { sr: ctx.sampleRate });
  }
  return ctx;
}
const duration = () => st.signal.length / st.sr;
const position = () => (st.playing ? Math.min(duration(), ctx.currentTime - st.startAt) : st.offset);
function startAudio() {
  if (!st.signal.length) return;
  ensureCtx();
  ctx.resume();
  if (!st.buffer) {
    st.buffer = ctx.createBuffer(1, st.signal.length, st.sr);
    st.buffer.copyToChannel(st.signal, 0);
  }
  if (st.offset >= duration() - 0.05) st.offset = 0;
  const src = ctx.createBufferSource();
  src.buffer = st.buffer;
  src.connect(gain);
  src.onended = () => {
    if (st.source !== src) return;
    st.playing = false; st.source = null; st.offset = 0;
    setPlayButton(); drawAll();
    log('audio.ended', { piece: st.piece });
  };
  src.start(0, st.offset);
  st.source = src; st.startAt = ctx.currentTime - st.offset; st.playing = true;
  setPlayButton();
  log('audio.play', { piece: st.piece, at: +st.offset.toFixed(2) });
  kick();
}
function stopAudio(silent) {
  if (!st.playing) return;
  st.offset = position();
  const src = st.source;
  st.source = null; st.playing = false;
  try { src.stop(); } catch { /* 止まっている */ }
  setPlayButton();
  if (!silent) log('audio.stop', { piece: st.piece, at: +st.offset.toFixed(2) });
  drawAll();
}
function seek(t) {
  const was = st.playing;
  if (was) stopAudio(true);
  st.offset = Math.max(0, Math.min(duration(), t));
  log('audio.seek', { at: +st.offset.toFixed(2), playing: was });
  if (was) startAudio(); else drawAll();
}
function setPlayButton() {
  const b = $('play');
  b.textContent = st.playing ? '止める' : '再生';
  b.setAttribute('aria-pressed', String(st.playing));
}

/* ---------- いま見ている区間の FFT ---------- */
const engines = new Map();
function getEngine() {
  const key = `${st.engine}:${st.n}`;
  if (!engines.has(key)) {
    let e;
    if (st.engine === 'radix2') { const r = createRadix2(st.n); e = { n: st.n, forward: (x, re, im) => rfftRadix2(r, x, re, im) }; }
    else e = createRealFFT(st.n);
    e.win = hann(st.n);
    e.db = new Float64Array((st.n >> 1) + 1);
    engines.set(key, e);
  }
  return engines.get(key);
}
// 1 回の FFT の時間。ブラウザの時計は粗い（0.1〜1 ms）ので、1 ms 以上の束にして測り、直近 60 束で平均する。
// 方法や長さを替えた直後の 5 束は、JIT が温まる前なので捨てる。止まっている間は、30 束たまるまでその場で測る
const timing = { el: [], reps: [], key: '', skip: 0 };
function measureBlock(e) {
  let reps = 0, el = 0;
  const t0 = performance.now();
  do { e.forward(e._buf, e._re, e._im); reps++; el = performance.now() - t0; } while (el < 1 && reps < 8192);
  if (timing.skip > 0) { timing.skip--; return; }
  timing.el.push(el); timing.reps.push(reps);
  if (timing.el.length > 60) { timing.el.shift(); timing.reps.shift(); }
}
function measureLive(e) {
  const key = `${st.engine}:${st.n}`;
  if (timing.key !== key) { timing.el = []; timing.reps = []; timing.key = key; timing.skip = 5; }
  if (st.playing) measureBlock(e);
  else while (timing.el.length < 30) measureBlock(e);
  return timing.el.reduce((a, b) => a + b, 0) / timing.reps.reduce((a, b) => a + b, 0);
}
let cur = null, lastAria = 0;
function updateSpectrum(t) {
  if (!st.signal.length) { cur = null; return; }
  const e = getEngine();
  const start = Math.round(t * st.sr) - (st.n >> 1);
  frameSpectrum(e, st.signal, start, e.win, e.db);
  const per = measureLive(e);
  const fHi = Math.min(20000, st.sr / 2);
  const p = peakFrequency(e.db, st.sr, st.n, 30, fHi);
  cur = { db: e.db, peak: p, t };
  const name = st.engine === 'radix2' ? '基数 2' : '速い版';
  $('fft-time').textContent = `${name}・長さ ${st.n.toLocaleString()} の FFT 1 回: ${fmtMs(per)}（1 ms 以上の束 ${timing.el.length} 個の平均）`;
  if (p.db < -80) $('peak').textContent = `${t.toFixed(2)} 秒: 音がほとんどありません`;
  else {
    const nn = noteName(p.freq);
    $('peak').textContent = `${t.toFixed(2)} 秒: いちばん強い音 ${fmtHz(p.freq)}（${nn.name}、${nn.cents >= 0 ? '+' : ''}${nn.cents} セント）、${p.db.toFixed(0)} dB`;
  }
  const now = performance.now();
  if (now - lastAria > 1000) {
    lastAria = now;
    $('spec').setAttribute('aria-label', `周波数ごとの強さのグラフ。${$('peak').textContent}`);
  }
}

/* ---------- キャンバス ---------- */
function fit(c) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return { w, h, dpr };
}
const hoverSpec = { x: null };
function drawSpectrum() {
  const c = $('spec'), g = c.getContext('2d');
  const { w: W, h: H, dpr } = fit(c);
  if (W < 20 || H < 20) return;
  g.fillStyle = theme.surface; g.fillRect(0, 0, W, H);
  const L = 46 * dpr, R = 12 * dpr, T = 10 * dpr, B = 26 * dpr, pw = W - L - R, ph = H - T - B;
  if (pw < 10 || ph < 10) return;
  const fLo = 20, fHi = Math.min(20000, st.sr / 2);
  const xOf = (f) => L + (Math.log(f / fLo) / Math.log(fHi / fLo)) * pw;
  const yOf = (d) => T + ((DB_MAX - Math.max(DB_MIN, Math.min(DB_MAX, d))) / (DB_MAX - DB_MIN)) * ph;
  g.font = `${11 * dpr}px system-ui, sans-serif`; g.lineWidth = Math.max(1, dpr);
  g.textBaseline = 'middle'; g.textAlign = 'right';
  for (let d = DB_MAX; d >= DB_MIN; d -= 20) {
    const y = Math.round(yOf(d)) + 0.5;
    g.strokeStyle = d === DB_MIN ? theme.axis : theme.grid;
    g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
    g.fillStyle = theme.muted; g.fillText(`${d} dB`, L - 6 * dpr, y);
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    if (f > fHi) continue;
    const x = Math.round(xOf(f)) + 0.5;
    g.strokeStyle = theme.grid; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke();
    g.fillStyle = theme.muted; g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, T + ph + 6 * dpr);
  }
  if (!cur) return;
  const cols = Math.max(2, Math.round(pw / dpr));
  const edges = logEdges(cols, fLo, fHi), lv = columnLevels(cur.db, edges, st.sr, st.n, new Float64Array(cols));
  const color = st.engine === 'radix2' ? theme.s1 : theme.s2;
  g.beginPath();
  for (let i = 0; i < cols; i++) { const x = L + ((i + 0.5) / cols) * pw, y = yOf(lv[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.lineTo(L + pw, T + ph); g.lineTo(L, T + ph); g.closePath();
  g.globalAlpha = 0.16; g.fillStyle = color; g.fill(); g.globalAlpha = 1;
  g.beginPath();
  for (let i = 0; i < cols; i++) { const x = L + ((i + 0.5) / cols) * pw, y = yOf(lv[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.strokeStyle = color; g.lineWidth = 2 * dpr; g.lineJoin = 'round'; g.stroke();
  const p = cur.peak;
  if (p.db > -80 && p.freq >= fLo) {
    const x = xOf(p.freq), y = yOf(p.db);
    g.beginPath(); g.arc(x, y, 6 * dpr, 0, 2 * Math.PI); g.fillStyle = theme.surface; g.fill();
    g.beginPath(); g.arc(x, y, 4 * dpr, 0, 2 * Math.PI); g.fillStyle = color; g.fill();
    g.fillStyle = theme.ink; g.textAlign = x > L + pw * 0.75 ? 'right' : 'left'; g.textBaseline = 'bottom';
    g.font = `600 ${12 * dpr}px system-ui, sans-serif`;
    g.fillText(fmtHz(p.freq), x + (g.textAlign === 'left' ? 8 : -8) * dpr, y - 4 * dpr);
  }
  if (hoverSpec.x !== null) {
    const x = hoverSpec.x * dpr;
    if (x >= L && x <= L + pw) {
      g.strokeStyle = theme.ink2; g.lineWidth = dpr; g.setLineDash([3 * dpr, 3 * dpr]);
      g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke(); g.setLineDash([]);
      const f = fLo * Math.exp(((x - L) / pw) * Math.log(fHi / fLo));
      const k = Math.min(cur.db.length - 1, Math.round((f * st.n) / st.sr));
      showHover('spec-hover', hoverSpec.x, `${fmtHz(f)}・${cur.db[k].toFixed(0)} dB`);
    }
  }
}

let sg = null, sgImage = null, sgSeq = 0;
async function computeSpectrogram() {
  const seq = ++sgSeq;
  const hop = Math.min(st.n >> 2, 1024);
  $('sgram-cap-time').textContent = '曲全体のスペクトログラムを計算しています…';
  try {
    const r = await call({ type: 'spectrogram', n: st.n, hop, engineName: st.engine, rows: 256, fLo: 30 });
    if (seq !== sgSeq) return;
    sg = r; sgImage = null;
    const name = st.engine === 'radix2' ? '基数 2' : '速い版';
    $('sgram-cap-time').textContent = `曲全体: 長さ ${r.n.toLocaleString()} の FFT を ${r.frames.toLocaleString()} 回（${name}）。窓・dB・列の計算まで含めて ${fmtMs(r.totalMs)}。`;
    log('spectrogram', { n: r.n, hop, frames: r.frames, engine: st.engine }, `ok ${r.totalMs.toFixed(1)}ms`);
    drawAll();
  } catch (err) {
    $('sgram-cap-time').textContent = 'スペクトログラムを作れませんでした。';
  }
}
function spectrogramImage() {
  if (sgImage || !sg) return sgImage;
  const { frames, rows, data } = sg;
  const oc = document.createElement('canvas');
  oc.width = frames; oc.height = rows;
  const og = oc.getContext('2d'), img = og.createImageData(frames, rows);
  for (let f = 0; f < frames; f++) {
    for (let r = 0; r < rows; r++) {
      const i = lutIndex(data[f * rows + r], -90, -10) * 4, o = ((rows - 1 - r) * frames + f) * 4;
      img.data[o] = theme.lut[i]; img.data[o + 1] = theme.lut[i + 1]; img.data[o + 2] = theme.lut[i + 2]; img.data[o + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  sgImage = oc;
  return oc;
}
const hoverSg = { x: null, y: null };
let sgGeom = null;
function drawSpectrogram() {
  const c = $('sgram'), g = c.getContext('2d');
  const { w: W, h: H, dpr } = fit(c);
  if (W < 20 || H < 20) return;
  g.fillStyle = theme.surface; g.fillRect(0, 0, W, H);
  const L = 46 * dpr, R = 12 * dpr, T = 8 * dpr, B = 26 * dpr, pw = W - L - R, ph = H - T - B;
  if (pw < 10 || ph < 10) return;
  const dur = duration() || 1;
  const fLo = sg?.fLo ?? 30, fHi = sg?.fHi ?? Math.min(20000, st.sr / 2);
  sgGeom = { L, T, pw, ph, dpr, dur, fLo, fHi };
  c.dataset.duration = dur.toFixed(4); // 確かめの台本が、押す位置を計算するのに使う
  const im = spectrogramImage();
  if (im) {
    g.imageSmoothingEnabled = true;
    // 標本の数は曲の長さと同じなので、最後の列までを曲の長さに合わせる
    g.drawImage(im, 0, 0, sg.frames, sg.rows, L, T, Math.min(pw, (pw * sg.frames * sg.hop) / st.signal.length), ph);
  }
  g.font = `${11 * dpr}px system-ui, sans-serif`; g.fillStyle = theme.muted; g.strokeStyle = theme.axis; g.lineWidth = Math.max(1, dpr);
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const f of [100, 1000, 10000]) {
    if (f > fHi) continue;
    const y = T + ph - (Math.log(f / fLo) / Math.log(fHi / fLo)) * ph;
    g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, L - 6 * dpr, y);
    g.beginPath(); g.moveTo(L - 3 * dpr, y); g.lineTo(L, y); g.stroke();
  }
  g.save(); g.translate(12 * dpr, T + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('Hz', 0, 0); g.restore();
  g.textAlign = 'center'; g.textBaseline = 'top';
  const stepS = dur > 40 ? 10 : 5;
  for (let s = 0; s <= dur + 1e-9; s += stepS) {
    const x = L + (s / dur) * pw;
    g.fillText(`${s} 秒`, Math.min(x, L + pw - 14 * dpr), T + ph + 6 * dpr);
    g.beginPath(); g.moveTo(x, T + ph); g.lineTo(x, T + ph + 3 * dpr); g.stroke();
  }
  // 再生位置
  const x = L + (position() / dur) * pw;
  g.strokeStyle = theme.ink; g.lineWidth = 2 * dpr;
  g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke();
  if (hoverSg.x !== null && sg) {
    const hx = hoverSg.x * dpr, hy = hoverSg.y * dpr;
    if (hx >= L && hx <= L + pw && hy >= T && hy <= T + ph) {
      const t = ((hx - L) / pw) * dur, f = fLo * Math.exp(((T + ph - hy) / ph) * Math.log(fHi / fLo));
      const fi = Math.min(sg.frames - 1, Math.max(0, Math.round((t * st.sr) / sg.hop)));
      const ri = Math.min(sg.rows - 1, Math.max(0, Math.floor(((T + ph - hy) / ph) * sg.rows)));
      showHover('sgram-hover', hoverSg.x, `${t.toFixed(2)} 秒・${fmtHz(f)}・${sg.data[fi * sg.rows + ri].toFixed(0)} dB（押すとここから）`);
    }
  }
}
function showHover(id, xCss, text) {
  const el = $(id);
  el.textContent = text; el.hidden = false;
  const box = el.parentElement.getBoundingClientRect();
  el.style.insetInlineStart = `${Math.max(4, Math.min(box.width - el.offsetWidth - 4, xCss + 10))}px`;
}

let rafId = 0, visible = true;
function frame() {
  rafId = 0;
  updateSpectrum(position());
  drawSpectrum(); drawSpectrogram();
  if (st.playing && visible) rafId = requestAnimationFrame(frame);
}
function kick() { if (!rafId) rafId = requestAnimationFrame(frame); }
function drawAll() { kick(); }

/* ---------- 交互の測定（基数 2 と速い版） ---------- */
async function runBench() {
  const btn = $('bench-run'), prog = $('bench-prog');
  btn.disabled = true; prog.hidden = false; prog.value = 0;
  $('bench-status').textContent = '測っています。終わるまで、ほかの重い作業を止めておくと数字が安定します。';
  const sizes = [256, 1024, 4096, 16384, 65536];
  const rows = [];
  onProgress.bench = (m) => { prog.value = m.value; rows.push(m.partial); renderBench(rows, sizes); };
  log('bench.start', { sizes, piece: st.piece });
  try {
    const r = await call({ type: 'bench', sizes, rounds: 15, minMs: 25 });
    renderBench(r.results, sizes);
    const summary = r.results.map((x) => ({ n: x.n, radix2: +(x.radix2.median * 1000).toFixed(2), fast: +(x.fast.median * 1000).toFixed(2), ratio: +x.ratio.toFixed(2), err: x.err }));
    log('bench.done', { piece: st.piece }, summary);
    $('bench-status').textContent = `測り終えました（各長さ 15 回ずつ交互、1 回の束は 25 ms 以上）。速い版は基数 2 の ${Math.min(...r.results.map((x) => x.ratio)).toFixed(1)}〜${Math.max(...r.results.map((x) => x.ratio)).toFixed(1)} 倍の速さでした。`;
  } catch (err) {
    $('bench-status').textContent = `測れませんでした: ${err.message.split('\n')[0]}`;
  } finally {
    btn.disabled = false; prog.hidden = true; onProgress.bench = null;
  }
}
function renderBench(results, sizes) {
  const tb = $('bench-table').tBodies[0];
  tb.replaceChildren(...results.map((r) => {
    const tr = document.createElement('tr');
    const cell = (tag, html, label) => { const c = document.createElement(tag); c.innerHTML = html; if (label) c.dataset.label = label; c.className = tag === 'td' ? 'num' : ''; return c; };
    tr.append(
      cell('th', `${r.n.toLocaleString()}`),
      cell('td', fmtMs(r.radix2.median), '基数 2'),
      cell('td', fmtMs(r.fast.median), '速い版'),
      cell('td', `${r.ratio.toFixed(2)} 倍`, '速さの比'),
      cell('td', r.err.radix2 !== undefined ? fmtExp(r.err.radix2) : '測っていない', '誤差（基数 2）'),
      cell('td', r.err.fast !== undefined ? fmtExp(r.err.fast) : '測っていない', '誤差（速い版）'),
    );
    return tr;
  }));
  drawBenchChart(results, sizes);
}
// 長さごとに 2 つの点（基数 2・速い版）を線で結ぶ図。横は時間の対数。
// 図の幅は実際の表示の幅に合わせる（縮めて表示すると、スマホの幅で文字が小さくなりすぎた）
let benchLast = { results: [], sizes: [] };
function drawBenchChart(results, sizes) {
  benchLast = { results, sizes };
  const svg = $('bench-chart');
  const W = Math.max(300, Math.min(736, Math.round(svg.getBoundingClientRect().width) || 640));
  const narrow = W < 480;
  const rowH = 36, top = narrow ? 52 : 34, left = narrow ? 70 : 78, right = narrow ? 56 : 70, H = top + sizes.length * rowH + 28;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const all = results.flatMap((r) => [r.radix2.median, r.fast.median]).map((ms) => ms * 1000);
  const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...all, 10)))), hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...all, 100))));
  const xOf = (us) => left + (Math.log10(us / lo) / Math.log10(hi / lo)) * (W - left - right);
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; return e; };
  const parts = [];
  const lx = narrow ? 12 : left, l2x = narrow ? 12 : left + 190, l2y = narrow ? 34 : 12;
  parts.push(el('circle', { cx: lx, cy: 12, r: 5, class: 'mk s1' }), el('text', { x: lx + 10, y: 16, class: 'lg' }, '基数 2（教科書どおり）'));
  parts.push(el('circle', { cx: l2x, cy: l2y, r: 5, class: 'mk s2' }), el('text', { x: l2x + 10, y: l2y + 4, class: 'lg' }, '速い版（実数入力・基数 4）'));
  for (let d = lo; d <= hi * 1.0001; d *= 10) {
    const x = xOf(d);
    parts.push(el('line', { x1: x, x2: x, y1: top - 6, y2: H - 24, class: 'grid' }));
    parts.push(el('text', { x, y: H - 8, class: 'ax', 'text-anchor': 'middle' }, d >= 1000 ? `${d / 1000} ms` : `${d} µs`));
  }
  sizes.forEach((n, i) => {
    const y = top + i * rowH + rowH / 2;
    parts.push(el('text', { x: left - 10, y: y + 4, class: 'ax', 'text-anchor': 'end' }, `N = ${n.toLocaleString()}`));
    const r = results.find((x) => x.n === n);
    if (!r) return;
    const a = xOf(r.radix2.median * 1000), b = xOf(r.fast.median * 1000);
    parts.push(el('line', { x1: Math.min(a, b), x2: Math.max(a, b), y1: y, y2: y, class: 'link' }));
    const ca = el('circle', { cx: a, cy: y, r: 5, class: 'mk s1' }); ca.append(el('title', {}, `N = ${n}・基数 2: ${fmtMs(r.radix2.median)}`));
    const cb = el('circle', { cx: b, cy: y, r: 5, class: 'mk s2' }); cb.append(el('title', {}, `N = ${n}・速い版: ${fmtMs(r.fast.median)}`));
    parts.push(ca, cb, el('text', { x: Math.max(a, b) + 12, y: y + 4, class: 'val' }, `${r.ratio.toFixed(1)} 倍`));
  });
  svg.replaceChildren(...parts);
}

/* ---------- 論文の模型 ---------- */
let mapDirty = true;
function windowText(D) {
  const m = 10, { u, v } = centeredWindow(m, D), s = exceptionalCount(m, u, v);
  return { u, v, s, text: `D = ${D}（数 c が ${u}〜${v} の行を予測で当てる。外れる行は周波数ごとに ${s} 行 / 1024 行）` };
}
// 外れる所の地図: 横が周波数 ν（S の基底）、縦が行 r。popcount(ν xor r) が窓の外なら濃く塗る（4×4 を 1 画素にまとめる）
function drawMap() {
  const c = $('map'), g = c.getContext('2d');
  const D = +$('win').value, { u, v } = centeredWindow(10, D);
  const S = 256, img = g.createImageData(S, S);
  const pc = (x) => { let k = 0; while (x) { x &= x - 1; k++; } return k; };
  const out = new Uint8Array(S * S);
  for (let r = 0; r < 1024; r++) for (let nu = 0; nu < 1024; nu++) { const k = pc(r ^ nu); if (k < u || k > v) out[(r >> 2) * S + (nu >> 2)]++; }
  for (let i = 0; i < S * S; i++) {
    const li = Math.min(255, out[i] * 64) * 4;
    img.data[i * 4] = theme.lut[li]; img.data[i * 4 + 1] = theme.lut[li + 1]; img.data[i * 4 + 2] = theme.lut[li + 2]; img.data[i * 4 + 3] = 255;
  }
  c.width = S; c.height = S;
  g.putImageData(img, 0, 0);
  mapDirty = false;
}
let modelImages = null;
function drawWalsh(id, im, lo, hi) {
  const c = $(id), g = c.getContext('2d');
  if (!im) { c.width = 1; c.height = 1; return; }
  c.width = im.size; c.height = im.size;
  const img = g.createImageData(im.size, im.size);
  for (let y = 0; y < im.size; y++) {
    for (let x = 0; x < im.size; x++) {
      const i = lutIndex(im.data[y * im.size + x], lo, hi) * 4, o = ((im.size - 1 - y) * im.size + x) * 4;
      img.data[o] = theme.lut[i]; img.data[o + 1] = theme.lut[i + 1]; img.data[o + 2] = theme.lut[i + 2]; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}
function drawModelImages() {
  if (!modelImages) return;
  let hi = -200;
  for (const v of modelImages.plain.data) if (v > hi) hi = v;
  const lo = hi - 80;
  drawWalsh('w-pred', modelImages.predicted, lo, hi);
  drawWalsh('w-rep', modelImages.repaired, lo, hi);
  drawWalsh('w-plain', modelImages.plain, lo, hi);
}
async function runModel() {
  const btn = $('model-run'), prog = $('model-prog'), D = +$('win').value;
  btn.disabled = true; prog.hidden = false; prog.value = 0;
  $('model-status').textContent = '模型で計算しています（ふつうの変換と 3 回ずつ交互に測ります）…';
  onProgress.model = (m) => { prog.value = m.value; };
  log('model.start', { D, piece: st.piece });
  try {
    const r = await call({ type: 'model', m: 10, D, rounds: 3 });
    modelImages = r.images;
    drawModelImages();
    const s = r.stats, gc = s.gates;
    const rows = [
      ['窓（予測で当てる数 c の範囲）', `${s.u}〜${s.v}（幅 D = ${s.D}）`],
      ['外れる行（周波数ごと）', `${s.s} 行 / ${s.W} 行（${(100 * s.exceptionalFraction).toFixed(1)}%）`],
      ['外れる所での予測の値の最大', s.s ? `${s.maxOutsideP.toLocaleString()}（正しい値は ±1）` : '外れる所が無い（予測だけで正しい）'],
      ['検査の行列の条件数', s.s ? s.cond.toFixed(2) : '検査なし'],
      ['予測だけの最大の差', s.s ? r.predErr.toFixed(2) : '0（外れる行が無い）'],
      ['修理のあとの最大の差（ふつうの変換と比べて）', `${fmtExp(r.maxDiff)}（出力の最大の大きさ ${r.maxAbs.toFixed(2)}）`],
      ['時間（中央値、3 回ずつ交互）', `ふつう ${fmtMs(r.plainMs)}、模型 ${fmtMs(r.modelMs)}（${(r.modelMs / r.plainMs).toFixed(0)} 倍の時間）`],
      ['模型の時間の内訳', Object.entries(s.phases).filter(([, v]) => v >= 0.5).map(([k, v]) => `${PHASE[k] || k} ${fmtMs(v)}`).join('、')],
      ['ゲートの数（式で数えた、1 標本あたり）', `ふつう ${gc.plainPerSample}、模型 ${gc.modelPerSample.toFixed(0)}（予測 ${gc.parts.predict}、検査 ${gc.parts.checks.toFixed(0)}、持ち上げ ${gc.parts.lift}、その他 ${(gc.parts.combine + gc.parts.convert + gc.parts.table).toFixed(0)}）`],
    ];
    const tb = $('model-table').tBodies[0];
    tb.replaceChildren(...rows.map(([k, v]) => { const tr = document.createElement('tr'); const th = document.createElement('th'); th.textContent = k; const td = document.createElement('td'); td.innerHTML = v; tr.append(th, td); return tr; }));
    $('model-table').hidden = false;
    log('model.done', { D, piece: st.piece }, { s: s.s, cond: +s.cond.toFixed(2), maxP: s.maxOutsideP, predErr: +r.predErr.toFixed(3), maxDiff: r.maxDiff, plainMs: +r.plainMs.toFixed(2), modelMs: +r.modelMs.toFixed(1), gates: +gc.modelPerSample.toFixed(1) });
    $('model-status').textContent = `計算し終えました。修理のあとの答えは、ふつうの変換と最大 ${fmtExpText(r.maxDiff)} の差で一致しました。時間は ${(r.modelMs / r.plainMs).toFixed(0)} 倍かかりました。`;
  } catch (err) {
    $('model-status').textContent = `計算できませんでした: ${err.message.split('\n')[0]}`;
  } finally {
    btn.disabled = false; prog.hidden = true; onProgress.model = null;
  }
}
const PHASE = { setup: '準備', predict: '予測', measure: '予測だけの誤差', checks: '検査の行', convert: '基底の行き来', table: '周波数ごとの表', lift: '持ち上げ' };

/* ---------- 論文の式で計算した表 ---------- */
function renderPaperTable() {
  const f1 = firstSavingM(1), f4 = firstSavingM(4);
  const ms = [...new Set([10, 20, 60, 100, f4 - 1, f4, 1000, f1])].sort((a, b) => a - b);
  const minus = (x) => String(x).replace('-', '−');
  const tb = $('paper-table').tBodies[0];
  tb.replaceChildren(...ms.map((m) => {
    const w = paperWindow(m), tr = document.createElement('tr');
    const vals = [`${m.toLocaleString()}`, `${minus(w.u)}〜${w.v}`, `${w.D}`, `${w.b.toLocaleString()}`, `${w.stages.toLocaleString()}`, w.b < m ? 'b < m' : 'b ≥ m'];
    const labels = ['m', '窓', '窓の幅 D', '予測 1 回の段 b', '修理までの段 4b', 'b と m'];
    vals.forEach((v, i) => { const c = document.createElement(i ? 'td' : 'th'); c.textContent = v; if (i) { c.dataset.label = labels[i]; c.className = 'num'; } tr.append(c); });
    return tr;
  }));
  const digits = Math.floor(2 * f4 * Math.log10(2)) + 1;
  $('paper-first').textContent = `${f4.toLocaleString()}`;
  $('paper-len').innerHTML = `2<sup>${(2 * f4).toLocaleString()}</sup>`;
  $('paper-digits').textContent = `${digits.toLocaleString()}`;
  $('paper-first1').textContent = `${f1.toLocaleString()}`;
  const g = gateCounts({ m: 10, D: 6, s: exceptionalCount(10, 2, 8) });
  $('gate-model').textContent = g.modelPerSample.toFixed(0);
}

/* ---------- 配線 ---------- */
function init() {
  readTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTheme(); drawAll(); if (modelImages) drawModelImages(); drawMap(); });
  new MutationObserver(() => { readTheme(); drawAll(); if (modelImages) drawModelImages(); drawMap(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  document.querySelectorAll('input[name="piece"]').forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    if (r.value === 'file') { $('file').click(); return; }
    usePiece(r.value);
  }));
  $('file').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) useFile(f); });
  $('play').addEventListener('click', () => { if (st.playing) stopAudio(); else startAudio(); });
  $('size').addEventListener('change', (e) => { st.n = +e.target.value; log('ui.size', { n: st.n }); computeSpectrogram(); drawAll(); });
  $('engine').addEventListener('change', (e) => { st.engine = e.target.value; log('ui.engine', { engine: st.engine }); computeSpectrogram(); drawAll(); });
  $('vol').addEventListener('input', (e) => { if (gain) gain.gain.value = e.target.value / 100; $('vol').setAttribute('aria-valuetext', `${e.target.value}%`); });
  $('vol').addEventListener('change', (e) => log('ui.volume', { value: +e.target.value }));
  const spec = $('spec');
  spec.addEventListener('pointermove', (e) => { hoverSpec.x = e.offsetX; drawAll(); });
  spec.addEventListener('pointerleave', () => { hoverSpec.x = null; $('spec-hover').hidden = true; drawAll(); });
  const sgc = $('sgram');
  sgc.addEventListener('pointermove', (e) => { hoverSg.x = e.offsetX; hoverSg.y = e.offsetY; drawAll(); });
  sgc.addEventListener('pointerleave', () => { hoverSg.x = null; $('sgram-hover').hidden = true; drawAll(); });
  sgc.addEventListener('click', (e) => {
    if (!sgGeom) return;
    const x = e.offsetX * sgGeom.dpr;
    seek(((x - sgGeom.L) / sgGeom.pw) * sgGeom.dur);
  });
  sgc.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowRight') { seek(position() + step); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { seek(position() - step); e.preventDefault(); }
    else if (e.key === 'Home') { seek(0); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { if (st.playing) stopAudio(); else startAudio(); e.preventDefault(); }
  });
  $('bench-run').addEventListener('click', runBench);
  $('model-run').addEventListener('click', runModel);
  const win = $('win');
  const syncWin = () => { const w = windowText(+win.value); $('win-out').textContent = w.text; win.setAttribute('aria-valuetext', w.text); };
  win.addEventListener('input', () => { syncWin(); drawMap(); });
  win.addEventListener('change', () => log('ui.window', { D: +win.value }));
  syncWin();
  new ResizeObserver(() => drawAll()).observe($('spec'));
  new ResizeObserver(() => drawAll()).observe($('sgram'));
  let benchW = 0;
  new ResizeObserver((es) => {
    const w = Math.round(es[0].contentRect.width);
    if (w && w !== benchW) { benchW = w; drawBenchChart(benchLast.results, benchLast.sizes); }
  }).observe($('bench-chart'));
  // 道具が画面の外にあるときは描かない（音は流れ続ける）
  new IntersectionObserver((es) => { visible = es.some((x) => x.isIntersecting); if (visible) kick(); }, { rootMargin: '200px' }).observe($('tool'));
  renderPaperTable();
  drawMap();
  drawBenchChart([], [256, 1024, 4096, 16384, 65536]);
  log('page.load', { ua: navigator.userAgent.slice(0, 120), logFile, cores: navigator.hardwareConcurrency, isolated: self.crossOriginIsolated });
  usePiece('arp');
}
init();
