// 『今日も打とーっと』の入口。画面の大きさ、毎コマの更新、操作の部品（DOM）、確かめ用の窓（?debug=1）。
import { makeScenes, W, H } from './scenes.mjs';
import { makePages } from './pages.mjs';
import { STORE_KEY, parseStore, serializeStore, addVisit, visitRecord, hitRows } from './record.mjs';
import { FxLayer } from './fx.mjs';
import { loadArt } from './art.mjs';
import { initAudio, setSound, soundOn, startAmbient, stopAmbient, stopSad } from './audio.mjs';
import { log, watchErrors, logFile } from './log.mjs';
import { SPEEDS, speedInfo, mealTier, todayRpk } from './logic.mjs';
import { createSession, YEN_PER_BALL } from '../sim/sim.mjs';
import { MACHINES } from '../sim/machines.mjs';
import { Graph } from './graph.mjs';

watchErrors();
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const bar = document.getElementById('controls');
const status = document.getElementById('status');
const stage = document.getElementById('stage');

const G = {
  clock: 0, paused: false, autoPaused: false, speedIndex: 2, speedOverride: null, machineIndex: 0,
  daySeed: params.has('day') ? Number(params.get('day')) : Math.floor(Date.now() / 86400000),
  fx: new FxLayer(W, H), play: null, scene: null, sceneName: '', shakeT: 0, shakeAmp: 0,
};
// canvas の中身は読み上げられないので、選び直した台を見えない status で知らせる（ページを開いた直後は知らせない）
G.announce = (text) => { if (status) status.textContent = text; };
// ---- 累計の記録（このブラウザの localStorage だけに残す。外へは送らない） ----
G.records = {
  read() {
    let text = null;
    try { text = localStorage.getItem(STORE_KEY); } catch (err) { log('record.read', {}, `error: ${err.message}`); return []; }
    const list = parseStore(text);
    log('record.read', { bytes: text ? text.length : 0, visits: list.length });
    return list;
  },
  add(rec) {
    const list = addVisit(this.read(), rec);
    try {
      localStorage.setItem(STORE_KEY, serializeStore(list));
      log('record.add', { visits: list.length, m: rec.m, yen: rec.yen, ev: rec.ev, hist: rec.hist?.length ?? 0 });
    } catch (err) { log('record.add', { visits: list.length }, `error: ${err.message}`); }
    return list;
  },
  clear() {
    try { localStorage.removeItem(STORE_KEY); log('record.clear', {}); } catch (err) { log('record.clear', {}, `error: ${err.message}`); }
  },
};
const S = { ...makeScenes(G), ...makePages(G) };

G.go = (name) => {
  G.scene?.leave?.();
  G.sceneName = name;
  G.scene = S[name];
  G.scene.enter();
  log('scene.enter', { name, day: G.daySeed });
};
G.startPlay = (machine, rpk, seed = params.has('seed') ? Number(params.get('seed')) : (Math.random() * 2 ** 31) >>> 0) => {
  const session = createSession({ machine: machine.id, seed, rpk });
  G.play = { machine, rpk, seed, session, graph: null, real: true };
  G.paused = false; G.speedOverride = null;
  log('play.start', { machine: machine.id, rpk, seed, day: G.daySeed });
  G.go('play');
};
G.openHistory = () => {
  const P = G.play;
  G.history = { rows: hitRows(P.session.events), title: P.machine.name, sub: '本日', back: 'result', page: 0 };
  G.returnFocus = 'btn-history';
  G.go('history');
};
G.openTotal = (back) => {
  G.totalBack = back;
  G.returnFocus = 'btn-total';
  G.go('total');
};
G.shake = (dur, amp) => { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { G.shakeT = dur; G.shakeAmp = amp; } };

// ---- 操作の部品（場面ごとに入れ替える） ----
const el = (tag, attrs = {}, text = '') => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; return e; };
function button(id, text, onClick, cls = '') {
  const b = el('button', { type: 'button', id, class: cls }, text);
  b.addEventListener('click', () => { log('ui.click', { id }); onClick(); });
  return b;
}
// focusId: 場面を入れ替えたあと、操作の部品にフォーカスを置き直す（押したボタンが消えてフォーカスが迷子にならないように）
G.controls = (kind, focusId = null) => {
  const hadFocus = bar.contains(document.activeElement);
  bar.replaceChildren();
  bar.dataset.kind = kind;
  if (kind === 'title') {
    bar.append(button('btn-start', '店に行く', () => { initAudio(); G.go('entry'); }, 'primary'), button('btn-total', '累計データ', () => G.openTotal('title')), el('span', { class: 'note' }, '音が出ます'));
  } else if (kind === 'skip') {
    bar.append(button('btn-skip', 'とばす', () => G.scene.skip?.()));
  } else if (kind === 'select') {
    bar.append(button('btn-prev', '← 左の台', () => S.select.pick(G.machineIndex - 1)), button('btn-decide', 'この台で打つ', () => S.select.decide(), 'primary'), button('btn-next', '右の台 →', () => S.select.pick(G.machineIndex + 1)));
  } else if (kind === 'play') {
    const lab = el('label', { for: 'speed' }, '時間の速さ');
    const range = el('input', { type: 'range', id: 'speed', min: '0', max: String(SPEEDS.length - 1), step: '1', value: String(G.speedIndex) });
    range.addEventListener('input', () => G.setSpeed(Number(range.value)));
    const out = el('output', { id: 'speed-text', for: 'speed' });
    bar.append(lab, range, out, button('btn-pause', '一時停止', () => G.togglePause()), soundButton());
    G.updateSpeedText(true);
  } else if (kind === 'result') {
    bar.append(button('btn-again', 'もう一度（台を選ぶ）', () => { initAudio(); startAmbient(); G.go('select'); }, 'primary'), button('btn-history', '大当り履歴', () => G.openHistory()), button('btn-total', '累計データ', () => G.openTotal('result')), button('btn-title', 'はじめから', () => G.go('title')), soundButton());
  } else if (kind === 'history' || kind === 'total') {
    bar.append(button('btn-prev', '← 前のページ', () => G.scene.turn(-1)), button('btn-next', '次のページ →', () => G.scene.turn(1)), button('btn-back', '戻る', () => G.scene.back(), 'primary'));
    if (kind === 'total') bar.append(button('btn-clear', '記録を消す', () => G.scene.clear(), 'danger'));
    G.updatePager();
  }
  // 置き直すのは、履歴・累計のページと、そこから戻ったときだけ（ほかの場面で動かすと、Enter が場面ではなくボタンに届く）
  if (hadFocus && (focusId || kind === 'history' || kind === 'total')) (document.getElementById(focusId ?? '') ?? document.getElementById('btn-back'))?.focus();
  if (DEBUG) debugPanel();
};
// 端のページでは押せないことを aria-disabled で知らせる（disabled にするとフォーカスが外れるので使わない）
G.updatePager = () => {
  const sc = G.scene;
  for (const [id, ok] of [['btn-prev', sc?.page > 0], ['btn-next', sc?.page < sc?.pages - 1]]) {
    const b = document.getElementById(id);
    if (b) b.setAttribute('aria-disabled', String(!ok));
  }
};
function soundButton() {
  const b = button('btn-sound', soundOn() ? '音: あり' : '音: なし', () => { setSound(!soundOn()); b.textContent = soundOn() ? '音: あり' : '音: なし'; });
  return b;
}
G.togglePause = () => {
  G.paused = !G.paused; G.autoPaused = false;
  const b = document.getElementById('btn-pause');
  if (b) b.textContent = G.paused ? '再開' : '一時停止';
  log('ui.pause', { paused: G.paused, t: Math.round(G.play?.session.state.t ?? 0) });
};
G.setSpeed = (i) => {
  const n = Math.max(0, Math.min(SPEEDS.length - 1, i));
  if (n === G.speedIndex && G.speedOverride == null) return;
  G.speedIndex = n; G.speedOverride = null;
  const r = document.getElementById('speed');
  if (r && Number(r.value) !== n) r.value = String(n);
  log('ui.speed', { index: n, mult: SPEEDS[n] });
  G.updateSpeedText(true);
};
let lastSpeedText = 0;
G.updateSpeedText = (force = false) => {
  if (!force && G.clock - lastSpeedText < 0.5) return;
  lastSpeedText = G.clock;
  const r = document.getElementById('speed'), out = document.getElementById('speed-text');
  if (!r || !out || !G.play) return;
  const info = speedInfo(G.speedIndex, G.play.session.state.t, G.play.session.endT);
  const text = G.speedOverride ? `確かめ用 ×${G.speedOverride}` : info.text;
  out.textContent = text;
  r.setAttribute('aria-valuetext', text);
  r.style.setProperty('--control-value', r.value);
};

// ---- 確かめ用（?debug=1） ----
function findSeed(tier, machineId, tries = 600) {
  for (let s = 1; s <= tries; s++) {
    const seed = (s * 2654435761) >>> 0;
    const ses = createSession({ machine: machineId, seed });
    ses.advanceTo(Infinity);
    if (mealTier(ses.state.sa * YEN_PER_BALL) === tier) return { seed, ses };
  }
  return null;
}
function showResult(tier) {
  const m = MACHINES[G.machineIndex];
  const got = findSeed(tier, m.id);
  if (!got) { log('debug.result', { tier }, 'error: seed not found'); return; }
  const graph = new Graph({ x: 6, y: 18, w: 280, h: 148, endT: got.ses.endT });
  graph.sync(got.ses.samples);
  G.play = { machine: m, rpk: m.rpk, seed: got.seed, session: got.ses, graph };
  log('debug.result', { tier, seed: got.seed, sa: got.ses.state.sa });
  G.go('result');
}
// 確かめ用: 本物の計算で 1 日ずつ遊んだことにして累計に足す（台は順番、回転率は日ごとの釘）
function addFakeVisits(n) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const m = MACHINES[i % MACHINES.length], day = G.daySeed - n + i, rpk = todayRpk(m, day);
    const seed = (Math.random() * 2 ** 31) >>> 0;
    const session = createSession({ machine: m.id, seed, rpk });
    session.advanceTo(Infinity);
    G.records.add(visitRecord({ machine: m, rpk, seed, session, day }, Date.now() - (n - i) * 3600000));
  }
  log('debug.fakeVisits', { n, ms: Math.round(performance.now() - t0) });
  if (G.sceneName === 'total') G.go('total');
}
function debugPanel() {
  let p = document.getElementById('debug');
  if (!p) { p = el('div', { id: 'debug' }); bar.after(p); }
  p.replaceChildren(el('strong', {}, '確かめ用'));
  const add = (text, fn) => p.append(button(`dbg-${text}`, text, fn));
  add('入店', () => { initAudio(); G.go('entry'); });
  add('台選び', () => G.go('select'));
  add('×64', () => { if (G.play) { G.speedOverride = 64; G.updateSpeedText(true); log('debug.speed', { mult: 64 }); } });
  add('閉店 1 分前', () => { if (G.play && G.sceneName === 'play') { const s = G.play.session; s.advanceTo(Math.max(s.state.t, s.endT - 60)); log('debug.jump', { t: s.state.t }); } });
  for (const t of ['S', 'A', 'B', 'C', 'D']) add(`結果 ${t}`, () => showResult(t));
  add('累計 +20 回', () => addFakeVisits(20));
  add('累計を空に', () => { G.records.clear(); if (G.sceneName === 'total') { G.totalView = { page: 0, sel: 0 }; G.go('total'); } });
  p.append(el('span', { class: 'note' }, `日 ${G.daySeed}${G.play ? ` / 種 ${G.play.seed}` : ''} / 記録 ${logFile ? 'logs/app.log' : 'コンソールだけ'}`));
}

// ---- 画面の大きさ（整数倍で拡大） ----
function fit() {
  const availW = stage.clientWidth, availH = Math.max(216, innerHeight - bar.offsetHeight - 120);
  let k = Math.min(availW / W, availH / H);
  k = k >= 1 ? Math.floor(k) : k;
  canvas.style.width = `${Math.round(W * k)}px`;
  canvas.style.height = `${Math.round(H * k)}px`;
}
addEventListener('resize', fit);

// ---- 入力 ----
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
canvas.addEventListener('click', (e) => {
  const p = toCanvas(e);
  log('ui.canvas.click', { scene: G.sceneName, x: Math.round(p.x), y: Math.round(p.y) });
  if (G.sceneName === 'title') { initAudio(); G.go('entry'); return; }
  if (G.scene.skip) { G.scene.skip(); return; }
  G.scene.click?.(p.x, p.y);
});
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.key !== ' ') return; // 速さの部品は自分で矢印を受ける
  if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
  let done = false;
  if (G.sceneName === 'title' && e.key === 'Enter') { initAudio(); G.go('entry'); done = true; }
  else if (G.scene.skip && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { G.scene.skip(); done = true; }
  else done = !!G.scene.key?.(e);
  if (done) { e.preventDefault(); log('ui.key', { key: e.key, scene: G.sceneName }); }
});
// 別のタブへ移ったら止め、戻ったら続ける
document.addEventListener('visibilitychange', () => {
  if (G.sceneName !== 'play') return;
  if (document.hidden && !G.paused) { G.paused = true; G.autoPaused = true; log('ui.autopause', { hidden: true }); }
  else if (!document.hidden && G.autoPaused) { G.paused = false; G.autoPaused = false; log('ui.autopause', { hidden: false }); }
});

// ---- 毎コマ ----
let last = 0;
function loop(ts) {
  // 出玉の計算には 1 秒まで渡す（重い PC でも 12 時間が 3 分で終わるように）。光る効果の動きは 0.1 秒で打ち切る
  const raw = last ? Math.min(1, (ts - last) / 1000) : 0;
  const dt = Math.min(0.1, raw);
  last = ts;
  G.clock += dt;
  try {
    G.scene.update(dt, raw);
    G.fx.update(dt);
    ctx.save();
    if (G.shakeT > 0) { G.shakeT -= dt; ctx.translate(Math.round((Math.random() - 0.5) * 2 * G.shakeAmp), Math.round((Math.random() - 0.5) * 2 * G.shakeAmp)); }
    G.scene.draw(ctx);
    ctx.restore();
    G.fx.draw(ctx);
  } catch (err) {
    log('exception.loop', { scene: G.sceneName, msg: String(err.stack || err).slice(0, 500) }, 'exception');
    throw err;
  }
  requestAnimationFrame(loop);
}

// 確かめ用の窓口（画面なしの Chrome の台本が使う）
window.__dedama = {
  G, S, MACHINES, findSeed, showResult,
  state: () => ({ scene: G.sceneName, paused: G.paused, speed: G.speedOverride ?? SPEEDS[G.speedIndex], fx: G.fx.list.length,
    ...(G.play ? { machine: G.play.machine.id, seed: G.play.seed, t: G.play.session.state.t, sa: G.play.session.state.sa, done: G.play.session.done, hits: G.play.session.state.hitsTotal, maxChain: G.play.session.state.maxChain } : {}) }),
  stopSounds: () => { stopSad(); stopAmbient(); },
};

(async () => {
  log('page.load', { url: location.href, debug: DEBUG, ua: navigator.userAgent.slice(0, 120) });
  ctx.imageSmoothingEnabled = false;
  await Promise.all([loadArt(new URL('../', import.meta.url)), document.fonts?.ready]);
  fit();
  G.go('title');
  requestAnimationFrame(loop);
})();
