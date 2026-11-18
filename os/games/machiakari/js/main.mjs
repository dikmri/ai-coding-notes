// 街あかり: 題名の画面、新しい街、保存と読み込み、毎コマの進行と描画をつなぐ
import { createCity } from './core/city.mjs';
import { apply } from './core/edit.mjs';
import { createSim, advance, recompute, buildTripModel, monthIndex } from './core/sim.mjs';
import { serialize, deserialize } from './core/save.mjs';
import { toolKey, toolName, ROADS, MONEY } from './core/defs.mjs';
import { MILESTONES } from './core/milestones.mjs';
import { makeRenderer, draw, lighting } from './render.mjs';
import { makeCrowd, stepCrowd } from './crowd.mjs';
import { makeUi } from './ui.mjs';
import { makeInput } from './input.mjs';
import { makeAudio } from './audio.mjs';
import { demoCity } from './demo.mjs';

const log = (...a) => (window.dlog || (() => {}))(...a);
const $ = (s) => document.querySelector(s);
const SPEEDS = [0, 1, 2, 4];
const PREFIX = 'machiakari-';

/* ---- 設定 ---- */
const DEFAULTS = { sfx: true, music: true, volume: 0.6, maxVehicles: 450, icons: true, autosave: true, disasters: true };
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFIX + 'settings') || '{}') }; } catch { /* 読めない */ }

/* ---- 保存の場所（localStorage） ---- */
const SLOTS = [['auto', '自動保存'], ['1', '保存 1'], ['2', '保存 2'], ['3', '保存 3']];
const storage = {
  list: () => SLOTS.map(([key, label]) => { let meta = null; try { meta = JSON.parse(localStorage.getItem(PREFIX + 'meta-' + key) || 'null'); } catch { meta = null; } return { key, label, meta }; }),
  write(key, data, meta) { localStorage.setItem(PREFIX + 'slot-' + key, data); localStorage.setItem(PREFIX + 'meta-' + key, JSON.stringify(meta)); },
  read: (key) => localStorage.getItem(PREFIX + 'slot-' + key),
  remove(key) { localStorage.removeItem(PREFIX + 'slot-' + key); localStorage.removeItem(PREFIX + 'meta-' + key); },
};

const G = {
  sim: null, R: null, crowd: makeCrowd(), playing: false, settings, storage,
  ui: { tool: null, preview: null, cursor: null, dragStart: null, overlay: null, icons: settings.icons, speedIdx: 1, lastSpeed: 1, speed: 1 },
};
G.audio = makeAudio(settings);
G.saveSettings = () => { try { localStorage.setItem(PREFIX + 'settings', JSON.stringify(settings)); } catch { /* 保存できない */ } G.audio.configure(settings); };

const canvas = $('#city');
G.R = makeRenderer(canvas);
G.R.crowd = G.crowd;

function metaOf(s) { return { name: s.name, pop: G.sim ? G.sim.stats.residents : 0, when: `${s.time.year}年${s.time.month}月`, saved: Date.now() }; }
G.saveTo = (key) => {
  if (!G.sim) return false;
  try {
    const t0 = performance.now(), data = serialize(G.sim.s);
    storage.write(key, data, metaOf(G.sim.s));
    log('save.write', { slot: key, bytes: data.length, ms: Math.round(performance.now() - t0) }, 'ok');
    G.audio.sfx('coin');
    return true;
  } catch (e) { log('save.write', { slot: key }, 'error: ' + e.message); G.audio.sfx('error'); return false; }
};
G.loadFrom = (key) => {
  try {
    const data = storage.read(key);
    if (!data) throw new Error('空き');
    startWith(deserialize(data));
    log('save.read', { slot: key, bytes: data.length }, 'ok');
    return true;
  } catch (e) { log('save.read', { slot: key }, 'error: ' + e.message); G.audio.sfx('error'); return false; }
};
G.exportFile = () => {
  if (!G.sim) return;
  const data = serialize(G.sim.s), blob = new Blob([data], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${G.sim.s.name}-${G.sim.s.time.year}-${G.sim.s.time.month}.machiakari.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  log('save.export', { bytes: data.length }, 'ok');
};
G.importFile = async (file) => {
  try { const s = deserialize(await file.text()); startWith(s); log('save.import', { name: file.name, bytes: file.size }, 'ok'); return true; }
  catch (e) { log('save.import', { name: file.name }, 'error: ' + e.message); return false; }
};

G.setSpeed = (i) => {
  if (i !== 0) G.ui.lastSpeed = i;
  G.ui.speedIdx = i; G.ui.speed = SPEEDS[i];
  G.uiApi && G.uiApi.refresh();
  G.audio.sfx('click');
  log('ui.speed', { speed: SPEEDS[i] }, 'ok');
};

// 道具を使う（見積もりで止められたら理由を伝える）
G.applyTool = (a, b) => {
  const s = G.sim.s, t = G.ui.tool;
  if (s.funds < 0 && t.kind !== 'bulldoze' && t.kind !== 'dezone' && t.kind !== 'district' && t.kind !== 'zone') { G.uiApi.announce('お金がマイナスの間は建てられません'); G.audio.sfx('error'); log('tool.apply', { tool: toolKey(t), a, b }, 'refused: no funds'); return; }
  const r = apply(s, t, a, b);
  log('tool.apply', { tool: toolKey(t), a, b, tiles: r.tiles.length, cost: r.cost }, r.ok ? 'ok' : 'refused: ' + r.reason);
  if (!r.ok) { G.uiApi.announce(r.reason); if (r.reason && !/もう|ありません/.test(r.reason)) G.audio.sfx('error'); return; }
  G.audio.sfx(t.kind === 'road' || t.kind === 'power' ? 'road' : t.kind === 'zone' || t.kind === 'district' ? 'zone' : t.kind === 'bulldoze' || t.kind === 'dezone' ? 'bulldoze' : 'build');
  G.uiApi.announce(`${toolName(t)}: ${r.tiles.length} マス${r.cost ? `、${r.cost.toLocaleString('ja-JP')} ${MONEY}` : ''}`);
  recompute(G.sim);
  buildTripModel(G.sim);
  G.sim.overlayRev = (G.sim.overlayRev || 0) + 1;
  G.uiApi.refresh();
};

let lastMonth = -1;
function attachSim(s) {
  G.sim = createSim(s, { maxVehicles: settings.maxVehicles });
  G.sim.overlayRev = 0;
  G.sim.listeners.push((m) => G.uiApi.onMessage(m));
  lastMonth = monthIndex(s);
  G.crowd.peds.length = 0;
}
function startWith(s) {
  attachSim(s);
  G.playing = true;
  $('#title').hidden = true;
  $('#app').hidden = false;
  G.R.resize();
  G.R.cam.z = 4;
  const en = s.entry || { i: 0, j: Math.floor(s.N / 2), len: 10 };
  G.R.centerOn(en.i + en.len + 2, en.j);
  G.R.clampCam(s.N);
  G.ui.cursor = [en.i + en.len, en.j];
  G.uiApi.selectGroup('road', true);
  G.uiApi.renderViews();
  G.uiApi.refresh();
  G.uiApi.onMessage({ when: `${s.time.year}年${s.time.month}月`, text: `「${s.name}」へようこそ。西から伸びる大通りに道をつなぎ、区画を塗って、発電所と給水塔と下水処理場を置きましょう。困ったら ？ を押してください。`, kind: 'info' });
  canvas.focus({ preventScroll: true });
  log('game.start', { name: s.name, N: s.N, pop: G.sim.stats.residents, funds: s.funds }, 'ok');
}
G.toTitle = () => {
  if (G.sim && settings.autosave) G.saveTo('auto');
  G.playing = false;
  $('#app').hidden = true;
  $('#title').hidden = false;
  refreshTitle();
  log('game.title', {}, 'ok');
};

/* ---- 題名の画面 ---- */
const titleCv = $('#titleCanvas'), TR = makeRenderer(titleCv);
TR.crowd = makeCrowd();
let demo = null;
function setupDemo() {
  demo = createSim(demoCity(3), { maxVehicles: 260 });
  TR.resize(); TR.cam.z = 3; TR.centerOn(14, 22); TR.clampCam(demo.s.N);
}
function refreshTitle() { $('#btnContinue').hidden = !storage.read('auto'); }
$('#btnContinue').addEventListener('click', () => { G.audio.unlock(); G.loadFrom('auto'); });
$('#btnNew').addEventListener('click', () => { G.audio.unlock(); $('#newSeed').value = String(1 + Math.floor(Math.random() * 99999)); G.uiApi.openDialog('new'); });
$('#btnLoad').addEventListener('click', () => { G.audio.unlock(); G.uiApi.openDialog('save'); });
$('#btnHelpTitle').addEventListener('click', () => { G.audio.unlock(); G.uiApi.openDialog('help'); });
$('#newSeedRand').addEventListener('click', () => { $('#newSeed').value = String(1 + Math.floor(Math.random() * 99999)); });
$('#dlgNew').addEventListener('close', () => {
  const dlg = $('#dlgNew');
  if (dlg.returnValue !== 'ok') { dlg.returnValue = ''; return; }
  dlg.returnValue = '';
  const pick = (n) => document.querySelector(`[name="${n}"]:checked`).value;
  const opts = { name: ($('#newName').value || 'あかり市').trim().slice(0, 16), terrain: pick('terrain'), size: +pick('size'), funds: +pick('funds'), seed: Math.max(1, +$('#newSeed').value || 1) };
  log('game.new', opts, 'ok');
  const s = createCity(opts);
  s.flags.disasters = settings.disasters !== false;
  startWith(s);
});

G.uiApi = makeUi(G);
makeInput(G);
G.audio.configure(settings);
setupDemo();
refreshTitle();

/* ---- 毎コマ ---- */
let last = performance.now(), paused = false, uiTimer = 0, mmTimer = 0, frames = 0, fpsT = 0;
G.fps = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (paused) return;
  frames++; fpsT += dt; if (fpsT >= 1) { G.fps = frames / fpsT; frames = 0; fpsT = 0; }
  try {
    if (!G.playing) {
      // 題名の画面: 時間を早回しして、昼と夜をめぐらせる
      if (!demo) return;
      TR.resize();
      advance(demo, dt * 3);
      const v = TR.view();
      stepCrowd(TR.crowd, demo, v, dt * 3, demo.s.time.tod / 60);
      TR.cam.x += dt * 6; if (TR.cam.x > 220) TR.cam.x = -160;
      draw(TR, demo, { icons: false, speed: 3 }, t);
      return;
    }
    const sim = G.sim, gdt = dt * G.ui.speed;
    G.R.resize();
    if (gdt > 0) {
      advance(sim, gdt);
      stepCrowd(G.crowd, sim, G.R.view(), gdt, sim.s.time.tod / 60);
      // 見回りのたびに色分けの値が変わるので、色分けの作り置きを描きなおす合図を出す
      if (sim.overlayTick !== sim.tickInMonth) { sim.overlayTick = sim.tickInMonth; sim.overlayRev = (sim.overlayRev || 0) + 1; }
    }
    G.audio.night = lighting(sim.s.time.tod).night;
    if (sim.fx.some((f) => f.type === 'milestone')) G.audio.sfx('milestone');
    draw(G.R, sim, G.ui, t);
    uiTimer += dt; mmTimer += dt;
    if (uiTimer > 0.25) { uiTimer = 0; G.uiApi.refresh(); }
    if (mmTimer > 1) { mmTimer = 0; G.uiApi.refreshMinimap(); }
    // 月が変わったら: 自動保存、解放の確かめ、月の記録
    const mi = monthIndex(sim.s);
    if (mi !== lastMonth) {
      lastMonth = mi;
      const st = sim.stats, lb = sim.lastBudget;
      log('sim.month', { when: `${sim.s.time.year}-${sim.s.time.month}`, pop: st.residents, jobs: st.jobs, funds: sim.s.funds, net: lb ? Math.round(lb.net) : 0, cars: sim.tr.vehicles.length, k: sim.model && sim.model.k, flow: Math.round(sim.tr.flow * 100), fps: Math.round(G.fps), stage: MILESTONES[sim.s.milestone].title }, 'ok');
      if (settings.autosave) G.saveTo('auto');
      G.uiApi.renderSub();
    }
  } catch (e) {
    log('game.error', { msg: String(e && e.message).slice(0, 200), stack: String(e && e.stack).slice(0, 400) }, 'exception');
    paused = true;
    setTimeout(() => { paused = false; last = performance.now(); }, 1000);
  }
}
requestAnimationFrame(frame);
addEventListener('resize', () => { G.R.resize(); TR.resize(); });
addEventListener('pagehide', () => { if (G.playing && settings.autosave) G.saveTo('auto'); });

// 試し遊びの道具（tools/gemini-browse.mjs）が、AI が考えている間だけ止めるための入口
window.__aiPause = (on) => { paused = !!on; if (!on) last = performance.now(); log('ai.pause', { on: !!on }, 'ok'); };
// 確かめるとき: ?debug=1 で window.__city から中身を読める。&start=1 で題名の画面を飛ばす
if (/debug/.test(location.search)) {
  window.__city = { G, apply, ROADS, startWith, createCity };
  const q = new URLSearchParams(location.search);
  if (q.get('start')) startWith(createCity({ name: 'ためし市', size: +(q.get('size') || 64), seed: +(q.get('seed') || 7), terrain: q.get('terrain') || 'river', funds: +(q.get('funds') || 50000) }));
}
log('game.boot', { w: innerWidth, h: innerHeight }, 'ok');
