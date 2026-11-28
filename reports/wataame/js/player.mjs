// 再生ページ: 音を Web Audio で鳴らし、音の時計の時刻で stage.mjs の絵を描く。
// ?capture=1 では音を鳴らさず、window.__wataame.renderAt(t) で 1 コマずつ描けるようにする（動画の撮影用）。
import { loadData, sectionAt, chordIndexAt, fmtTime, fmtTimeJa } from './data.mjs';
import { createStage, loadFonts, W, H } from './stage.mjs';
import { log, watchErrors, logFile } from './log.mjs';

const base = new URL('../', import.meta.url).href;
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
canvas.width = W;
canvas.height = H;
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = reducedQuery.matches && !capture;
reducedQuery.addEventListener('change', (e) => { reduced = e.matches && !capture; log('reduced_motion', { reduced }); requestDraw(); });

watchErrors();
log('load', { capture, logFile, ua: navigator.userAgent.slice(0, 120), dpr: devicePixelRatio, reduced });

let data, draw, ready;
const statusEl = document.getElementById('status');
const setStatus = (s) => { if (statusEl) statusEl.textContent = s; };

async function init() {
  const t0 = performance.now();
  try {
    const [d, fontsMs] = await Promise.all([loadData(base), loadFonts()]);
    data = d;
    draw = createStage(data);
    log('data', { chords: data.score.chords.length, chops: data.chops.length, frames: data.score.levels.frames, fontsMs, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    log('error.data', { msg: String(err) }, `error ${err.message}`);
    setStatus('データを読めませんでした。ページを読み直してください。');
    throw err;
  }
  return data;
}

// ------------------------------------------------------------------ 撮影モード
if (capture) {
  document.documentElement.classList.add('capture');
  ready = init().then(() => {
    renderAt(0);
    return { duration: data.score.duration, end: data.score.bars * data.score.bar, fps: 60 };
  });
  window.__wataame = { ready, renderAt };
} else {
  setupPlayer();
}

function renderAt(t) {
  draw(ctx, t, { reduced });
  return true;
}

// ------------------------------------------------------------------ 再生ページ
function setupPlayer() {
  const playBtn = document.getElementById('play');
  const restartBtn = document.getElementById('restart');
  const seek = document.getElementById('seek');
  const vol = document.getElementById('volume');
  const timeEl = document.getElementById('time');
  const nowEl = document.getElementById('now');
  let actx = null, gain = null, buffer = null, src = null;
  let playing = false, offset = 0, startAt = 0, decoding = null;
  let lastSection = '', lastChordIdx = -1;
  let raf = 0, perf = { frames: 0, worst: 0, since: performance.now(), last: 0 };

  const syncSlider = (el) => { el.style.setProperty('--control-value', el.value); el.style.setProperty('--attr-min', el.min || 0); el.style.setProperty('--attr-max', el.max || 100); };

  ready = init().then(() => {
    const end = data.score.bars * data.score.bar;
    seek.max = String(end.toFixed(2));
    syncSlider(seek);
    syncSlider(vol);
    playBtn.disabled = false;
    restartBtn.disabled = false;
    seek.disabled = false;
    setStatus('');
    updateTexts(0);
    requestDraw();
  });

  async function ensureAudio() {
    if (buffer) return buffer;
    if (!decoding) {
      decoding = (async () => {
        const t0 = performance.now();
        actx = new AudioContext({ latencyHint: 'playback' });
        gain = actx.createGain();
        gain.gain.value = Number(vol.value) / 100;
        gain.connect(actx.destination);
        setStatus('音を読んでいます…');
        const res = await fetch(`${base}media/wataame.m4a`);
        if (!res.ok) throw new Error(`wataame.m4a ${res.status}`);
        const ab = await res.arrayBuffer();
        buffer = await actx.decodeAudioData(ab);
        log('decode', { seconds: +buffer.duration.toFixed(3), sampleRate: buffer.sampleRate, ms: Math.round(performance.now() - t0), baseLatency: actx.baseLatency, outputLatency: actx.outputLatency ?? null });
        setStatus('');
        return buffer;
      })().catch((err) => {
        log('error.audio', { msg: String(err) }, `error ${err.message}`);
        setStatus('音を読めませんでした。ページを読み直してください。');
        decoding = null;
        throw err;
      });
    }
    return decoding;
  }

  // いま聞こえている時刻（出力の遅れを差し引く）
  function position() {
    if (!playing || !actx) return offset;
    let now = actx.currentTime;
    if (actx.getOutputTimestamp) {
      const ts = actx.getOutputTimestamp();
      if (ts.contextTime > 0) now = ts.contextTime; else now -= actx.outputLatency || 0;
    } else now -= actx.outputLatency || 0;
    return Math.max(0, now - startAt);
  }

  async function play(via) {
    await ready;
    await ensureAudio();
    if (actx.state === 'suspended') await actx.resume();
    const end = data.score.bars * data.score.bar;
    if (offset >= end - 0.05) offset = 0;
    src = actx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    const thisSrc = src;
    src.onended = () => {
      if (thisSrc !== src || !playing) return;
      playing = false;
      offset = data.score.duration;
      log('ended', { pos: +offset.toFixed(2) });
      updateButtons();
      requestDraw();
    };
    src.start(0, offset);
    startAt = actx.currentTime - offset;
    playing = true;
    perf = { frames: 0, worst: 0, since: performance.now(), last: 0 };
    log('play', { pos: +offset.toFixed(2), via, state: actx.state, outputLatency: actx.outputLatency ?? null });
    updateButtons();
    loop();
  }
  function pause(via) {
    if (!playing) return;
    offset = position();
    playing = false;
    try { src.stop(); } catch { /* 止まっている */ }
    src = null;
    log('pause', { pos: +offset.toFixed(2), via });
    updateButtons();
    requestDraw();
  }
  async function seekTo(t, via) {
    const from = position();
    const wasPlaying = playing;
    if (playing) { playing = false; try { src.stop(); } catch { /* 止まっている */ } src = null; }
    offset = Math.max(0, Math.min(t, data.score.bars * data.score.bar));
    log('seek', { from: +from.toFixed(2), to: +offset.toFixed(2), via, wasPlaying });
    if (wasPlaying) await play('seek'); else { updateTexts(offset); requestDraw(); }
  }
  function updateButtons() {
    playBtn.textContent = playing ? '一時停止' : '再生';
    playBtn.dataset.state = playing ? 'playing' : 'paused';
  }
  function updateTexts(t) {
    const end = data.score.bars * data.score.bar;
    const tt = Math.min(t, end);
    timeEl.textContent = `${fmtTime(tt)} / ${fmtTime(end)}`;
    if (document.activeElement !== seek) {
      seek.value = String(tt.toFixed(2));
      syncSlider(seek);
    }
    seek.setAttribute('aria-valuetext', `${fmtTimeJa(tt)} / ${fmtTimeJa(end)}`);
    const sec = sectionAt(data.score, tt);
    const ci = chordIndexAt(data.score, tt);
    if (sec.id !== lastSection || ci !== lastChordIdx) {
      if (sec.id !== lastSection) {
        nowEl.textContent = `いまの区間: ${sec.name}（${sec.bar + 1}〜${sec.bar + sec.bars} 小節）`;
        if (playing) log('section', { id: sec.id, pos: +tt.toFixed(2) });
      }
      lastSection = sec.id;
      lastChordIdx = ci;
    }
  }

  function frame(now) {
    raf = 0;
    const t = position();
    draw(ctx, t, { reduced });
    updateTexts(t);
    if (playing) {
      const dt = perf.last ? now - perf.last : 0;
      perf.last = now;
      perf.frames++;
      if (dt > perf.worst) perf.worst = dt;
      if (now - perf.since > 10000) {
        log('perf', { fps: +((perf.frames * 1000) / (now - perf.since)).toFixed(1), worstMs: Math.round(perf.worst), pos: +t.toFixed(1) });
        perf = { frames: 0, worst: 0, since: now, last: now };
      }
      loop();
    } else perf.last = 0;
  }
  function loop() { if (!raf) raf = requestAnimationFrame(frame); }
  window.requestDraw = () => loop();

  playBtn.addEventListener('click', () => (playing ? pause('button') : play('button')));
  restartBtn.addEventListener('click', () => seekTo(0, 'restart'));
  let seekingFrom = null;
  seek.addEventListener('input', () => {
    syncSlider(seek);
    if (seekingFrom === null) seekingFrom = position();
    if (!playing) { offset = Number(seek.value); updateTexts(offset); requestDraw(); }
  });
  seek.addEventListener('change', () => { seekingFrom = null; seekTo(Number(seek.value), 'slider'); });
  let volTimer = 0;
  vol.addEventListener('input', () => {
    syncSlider(vol);
    if (gain) gain.gain.setTargetAtTime(Number(vol.value) / 100, actx.currentTime, 0.02);
    clearTimeout(volTimer);
    volTimer = setTimeout(() => log('volume', { value: Number(vol.value) }), 400);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, button, select, textarea, a')) return;
    if (e.key === ' ') { e.preventDefault(); log('key', { key: 'space' }); playing ? pause('key') : play('key'); }
    else if (e.key === 'ArrowRight') { log('key', { key: 'right' }); seekTo(position() + 5, 'key'); }
    else if (e.key === 'ArrowLeft') { log('key', { key: 'left' }); seekTo(position() - 5, 'key'); }
  });
  document.addEventListener('visibilitychange', () => log('visibility', { state: document.visibilityState, pos: +position().toFixed(2), playing }));
}

function requestDraw() {
  if (typeof window.requestDraw === 'function') window.requestDraw();
}
