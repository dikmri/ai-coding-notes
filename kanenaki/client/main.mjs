// 『鐘なき王国』（1 人用のハクスラ）の画面の入り口。
// 世界の計算は Web Worker（sim-worker.mjs）で動き、link.mjs が schema の C2S・S2C の形でやり取りする。
// 保存は localStorage の SAVE_KEY（3 枠、版の番号つき）。30 秒ごと・区域の移動・タブを隠したとき・閉じるときに書く。
import { DEBUG, SETTINGS_KEY } from './config.mjs';
import { log, watchErrors, flushLog } from './log.mjs';
import { loadShared } from './shared.mjs';
import { createArt } from './art.mjs';
import { createFx } from './fx.mjs';
import { createGame } from './game.mjs';
import { createRenderer } from './render.mjs';
import { createLink } from './link.mjs';
import { createInput } from './input.mjs';
import { createPanels, createTooltip, createContextMenu, h } from './ui/dom.mjs';
import { createHud } from './ui/hud.mjs';
import { createScreens } from './ui/panels.mjs';
import { createTreeView } from './ui/tree.mjs';
import { createMenus } from './ui/menus.mjs';
import { createDebugPanel } from './ui/debugpanel.mjs';
import { parseSave, serializeSave, putSlot, clearSlot, exportSlot, importText, exportFileName, emptySave, charOk } from './save.mjs';
import { ANIM, PROTO_VERSION, SAVE_KEY } from '../shared/schema.mjs';

watchErrors();
log('boot', { debug: DEBUG, ua: navigator.userAgent.slice(0, 80), w: innerWidth, h: innerHeight });

/* ---------------- 設定（この端末だけ） ---------------- */
const settings = (() => {
  let s = { scale: 'auto', names: true };
  try { s = { ...s, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { /* 読めない */ }
  return {
    get: (k) => s[k],
    set(k, v) { s[k] = v; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* 保存できない */ } log('settings.set', { k, v }); },
  };
})();

const { data, mapgen, calc } = loadShared();
const art = createArt({ base: new URL('../', import.meta.url).href, log });
await art.load();

const fx = createFx();
let hud, screens, panels, treeView, renderer, input, tooltip, menus, link;
const handlers = {};
const emit = (kind, payload) => { try { handlers[kind]?.(payload); } catch (e) { log('ui.emit', { kind, msg: String(e.stack || e).slice(0, 300) }, 'exception'); } };
const game = createGame({ data, mapgen, fx, log, emit });
const G = game.g;

const view = document.getElementById('view'), over = document.getElementById('over'), stage = document.getElementById('stage');
renderer = createRenderer({ view, over, game, art, fx, data, settings, log });
renderer.resize();

/* ---------------- 保存（localStorage） ---------------- */
let slot = null;        // 遊んでいる枠
let latest = null;      // Worker から最後に届いたキャラ（毎秒）
let quitting = false;
function readSave() {
  let text = null;
  try { text = localStorage.getItem(SAVE_KEY); } catch (e) { log('save.read', {}, 'error:' + e.message); }
  const r = parseSave(text);
  if (r.error) log('save.read', { error: r.error, bytes: text?.length ?? 0 }, r.error === 'newer' ? 'error:newer' : 'warn:' + r.error);
  return r;
}
function writeSave(save, why) {
  try {
    const text = serializeSave(save);
    localStorage.setItem(SAVE_KEY, text);
    log('save.write', { why, slot, bytes: text.length });
    return true;
  } catch (e) {
    log('save.write', { why, slot }, 'error:' + e.message);
    hud?.addLog('保存できませんでした（ブラウザの保存の場所がいっぱいかもしれません）。', 'warn');
    return false;
  }
}
// 遊んでいる枠へ、最後に届いたキャラを書く。別のタブが書いた枠を消さないよう、書く直前に読み直す
function persist(why) {
  if (slot == null || !latest) return false;
  const r = readSave();
  if (r.error === 'newer') return false;
  const ok = writeSave(putSlot(r.save, slot, latest), why);
  if (ok) hud.setSaved(Date.now());
  return ok;
}
function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  log('save.export', { name, bytes: text.length });
}

/* ---------------- 操作の窓口 ---------------- */
const now = () => performance.now();
function nearestMonster(range) {
  let best = null, bd = range;
  for (const e of G.ents.values()) {
    if (e.kind !== 'monster' || e.anim === ANIM.dead || e.raw?.team === 'p') continue;
    const d = Math.hypot(e.x - G.pred.x, e.y - G.pred.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
let menuPaused = false, hiddenPaused = false;
const setPaused = (why) => link.send({ t: 'pause', on: menuPaused || hiddenPaused, why });
const actions = {
  toast(msg) { hud.addLog(msg, 'warn'); },
  castSlot(sl, at) {
    if (G.dead || G.paused) return;
    const sid = G.skills.binds?.[sl];
    if (!sid) { actions.toast('この枠にはスキルがない。S の画面で割り当てる。'); return; }
    const sk = data.skills[sid] || { name: sid };
    const cd = G.skills.cds[sid];
    if (cd && cd.until > now()) { actions.toast(`${sk.name}はまだ使えない`); return; }
    let target = null, p = at;
    const hov = G.hover != null ? G.ents.get(G.hover) : null;
    // 指している物: 生きている敵（味方の召喚は除く）か、仲間へのスキルなら人
    if (hov && hov.anim !== ANIM.dead && ((hov.kind === 'monster' && hov.raw?.team !== 'p') || (sk.target === 'ally' && hov.kind === 'player'))) target = hov;
    if (!target && (sk.target === 'enemy' || !p)) {
      const sel = G.selected != null ? G.ents.get(G.selected) : null;
      target = sel?.kind === 'monster' && sel.anim !== ANIM.dead ? sel : nearestMonster((sk.range || 2) + 4);
    }
    if (!p) {
      if (target) p = game.entPos(target);
      else { const a = Math.PI / 2 + (G.pred.dir * Math.PI) / 8; p = { x: G.pred.x + Math.cos(a) * 3, y: G.pred.y + Math.sin(a) * 3 }; }
    }
    if (sk.target === 'self') { p = { x: G.pred.x, y: G.pred.y }; target = null; }
    link.send({ t: 'cast', s: sid, x: +p.x.toFixed(2), y: +p.y.toFixed(2), id: target?.id });
  },
  // key は消耗品のデータの key（Z: 回復薬、X: 魔力の薬、T: 帰還の巻物）
  useBelt(key) {
    if (key === 'T') { link.send({ t: 'portal' }); return; }
    // 同じキーの薬が何種類かあれば、よく効く方から使う
    const power = (i) => { const u = data.baseById[i.base]?.use ?? {}; return (u.healPct ?? 0) + (u.manaPct ?? 0) + ((u.heal ?? 0) + (u.mana ?? 0)) / 10; };
    const it = G.inv.items.filter((i) => data.baseById[i.base]?.key === key).sort((a, b) => power(b) - power(a))[0];
    if (!it) { actions.toast(key === 'Z' ? '回復薬がない' : '魔力の薬がない'); return; }
    link.send({ t: 'inv', op: 'use', item: it.uid });
  },
  togglePanel(id) { panels.toggle(id); },
  openPanel(id) { panels.show(id); },
  openSettings() { screens.openSettings(); },
  openPause() {
    if (!G.welcomed || menus.titleOpen || menus.pauseOpen) return;
    menuPaused = true; setPaused('menu');
    menus.openPause();
  },
  modalOpen: () => screens.modalOpen || menus.titleOpen || menus.pauseOpen,
  escape() {
    if (tooltip.open) { tooltip.hide(); return; }
    if (panels.anyOpen()) { panels.closeAll(); return; }
    actions.openPause();
  },
  afterSettings() { renderer.resize(); },
  resize() { renderer.resize(); },
  miniImage: () => renderer.mini,
};

/* ---------------- 画面の部品 ---------------- */
panels = createPanels({ log, onChange: () => hud?.setMenuState(panels.isOpen) });
const ctxMenu = createContextMenu();
hud = createHud({ root: document.getElementById('hud'), game, data, settings, actions, log });
const providers = {};
tooltip = createTooltip({ providers });
link = createLink({
  onMessage: (m) => game.handle(m),
  onReady: () => openTitle(),
  onFatal: (msg) => menus.renderMessage(`世界の計算を始められませんでした（${msg}）。ページを読み込み直してください。`),
});
screens = createScreens({ game, data, link, panels, ctxMenu, tooltip, settings, actions, log, calc });
Object.assign(providers, screens.providers, {
  node(id) { const n = data.tree.nodes[id]; return n ? h('div', {}, n.name) : null; },
});
treeView = createTreeView({ panels, game, data, net: link, log });
input = createInput({ stage, game, renderer, link, actions, log, debug: DEBUG });
const dbgPanel = DEBUG ? createDebugPanel({ panels, game, data, link, log }) : null;

menus = createMenus({
  data, log,
  on: {
    continueSlot(i) {
      const r = readSave();
      const s = r.save.slots[i];
      if (!s || !charOk(s.char)) { menus.renderSlots(r.save, 'その枠は読めませんでした。'); return; }
      slot = i; latest = s.char;
      log('ui.title.continue', { slot: i, name: s.char.name, level: s.char.level, map: s.char.map });
      link.send({ t: 'hello', v: PROTO_VERSION, char: s.char });
    },
    newSlot(i) { slot = i; log('ui.title.new', { slot: i }); link.send({ t: 'hello', v: PROTO_VERSION }); },
    reroll() { link.send({ t: 'reroll' }); },
    create(name) { log('ui.title.create', { slot, name }); link.send({ t: 'create', name }); },
    exportSlot(i) { const r = readSave(); const text = exportSlot(r.save, i); if (text) download(text, exportFileName(r.save.slots[i].char)); },
    deleteSlot(i) { const r = readSave(); if (r.error === 'newer') return; writeSave(clearSlot(r.save, i), 'delete'); log('ui.title.delete', { slot: i }); menus.renderSlots(readSave().save, `${i + 1} 番の枠を消しました。`); },
    importSlot(i, text) {
      const imp = importText(text);
      const r = readSave();
      if (!imp.ok) { log('save.import', { slot: i }, 'warn:' + imp.error); menus.renderSlots(r.save, `読み込めませんでした: ${imp.error}`); return; }
      if (r.error === 'newer') return;
      writeSave(putSlot(r.save, i, imp.char), 'import');
      log('save.import', { slot: i, name: imp.char.name, level: imp.char.level });
      menus.renderSlots(readSave().save, `${imp.char.name}（Lv ${imp.char.level}）を ${i + 1} 番の枠へ読み込みました。`);
    },
    resume() { menuPaused = false; setPaused('menu'); },
    saveNow() { link.send({ t: 'save', why: 'menu' }); },
    exportCurrent() { link.send({ t: 'save', why: 'export' }); },
    settings() { screens.openSettings(); },
    quit() {
      quitting = true;
      link.send({ t: 'save', why: 'quit' });
      setTimeout(() => { persist('quit'); location.reload(); }, 1500); // 返事が来なくても戻る
    },
  },
});
function openTitle() {
  const r = readSave();
  menus.renderSlots(r.save, r.error === 'newer' ? 'この画面より新しい版の保存があります。上書きしないよう、書き込みを止めています。' : r.error ? '保存の中身が壊れていたので、空の枠から始めます。' : '');
}

// 指で遊ぶときのスキルのボタン
for (const sl of ['r', '1', '2', '3']) {
  const b = h('button', { type: 'button', class: 'touch-skill', 'aria-label': `スキル ${sl === 'r' ? '右' : sl}` }, sl === 'r' ? '右' : sl);
  b.addEventListener('click', () => actions.castSlot(sl, null));
  hud.touch.append(b);
}

/* ---------------- 受け取った出来事 ---------------- */
let charRefresh = 0, hadStash = false;
const lastErr = { msg: '', at: 0 };
Object.assign(handlers, {
  welcome: ({ hasChar }) => { if (hasChar) { menus.closeTitle(); document.body.classList.add('playing'); log('play.start', { slot, name: G.me.name, level: G.me.level }); } },
  names: (list) => menus.renderNames(list),
  zone: ({ name }) => { screens.closeDeath(); hud.setZone(name); panels.hide('talk'); panels.hide('shop'); panels.refresh('map'); },
  me: () => { if (now() - charRefresh > 500) { charRefresh = now(); panels.refresh('char'); } },
  inv: (inv) => {
    if (inv.stash && !hadStash) panels.show('stash');
    if (!inv.stash && hadStash) panels.hide('stash');
    hadStash = !!inv.stash;
    panels.refresh('inv'); panels.refresh('stash'); screens.refreshShop(); hud.refreshBelt(); tooltip.refresh();
  },
  tree: () => treeView.refresh(),
  skills: () => { hud.refreshSkills(); panels.refresh('skills'); },
  quests: () => panels.refresh('quests'),
  dialog: (m) => screens.setDialog(m),
  shop: (m) => screens.setShop(m),
  sys: ({ msg, err }) => {
    // 同じ断りの知らせ（「今は動けません」など）が続くときは、1.5 秒に 1 回だけ出す
    const now0 = now();
    if (err && msg === lastErr.msg && now0 - lastErr.at < 1500) return;
    if (err) Object.assign(lastErr, { msg, at: now0 });
    hud.addLog(msg, err ? 'warn' : 'sys');
  },
  death: () => screens.openDeath(),
  alive: () => screens.closeDeath(),
  levelUp: ({ level }) => { hud.addLog(`レベル ${level} になった`, 'good'); panels.refresh('skills'); panels.refresh('char'); },
  hurt: () => { stage.classList.remove('hurt'); void stage.offsetWidth; stage.classList.add('hurt'); },
  save: (m) => {
    if (!m.char) return;
    latest = m.char;
    if (m.why === 'sync') return;
    persist(m.why);
    if (m.why === 'menu') hud.addLog('保存しました。', 'good');
    if (m.why === 'export') { const text = exportSlot(putSlot(emptySave(), 0, latest), 0); download(text, exportFileName(latest)); hud.addLog('ファイルに書き出しました。', 'good'); }
    if (m.why === 'quit' && quitting) location.reload();
  },
  paused: (m) => { stage.classList.toggle('paused', !!m.on); },
});

/* ---------------- 止める・保存する（タブを隠したとき・閉じるとき） ---------------- */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (slot != null && latest) persist('hidden');      // 閉じられても残るよう、まず手元の最新を書く
    if (G.welcomed) { link.send({ t: 'save', why: 'hidden' }); }
    hiddenPaused = true; setPaused('hidden');
    log('page.hidden', {});
    flushLog();
  } else {
    hiddenPaused = false; setPaused('visible');
    log('page.visible', {});
  }
});
window.addEventListener('pagehide', () => { if (slot != null && latest) persist('close'); });

/* ---------------- 毎コマ ---------------- */
let last = now(), fps = 60, lastDbg = 0;
function loop(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  try {
    game.update();
    if (!G.paused) fx.update(dt * (G.speed || 1)); // 効果と地面の印も、世界の時間の速さに合わせる
    renderer.frame(dt);
    hud.update(t, renderer);
  } catch (e) {
    log('frame', { msg: String(e.stack || e).slice(0, 400) }, 'exception');
  }
  fps = fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
  if (DEBUG && t - lastDbg > 250) {
    lastDbg = t;
    const st = renderer.stat;
    hud.debug([
      `fps ${fps.toFixed(0)}  描画 ${st.frameMs.toFixed(1)} ms`,
      `世界 ${G.paused ? '止めている' : '動いている'}  速さ ×${G.speed}  受けた ${link.stats.recv}（まとめ ${link.stats.batches}）`,
      `物 ${G.ents.size}（画面内 ${st.ents}）  重ね描き ${st.draws}  粒 ${fx.parts.length}`,
      `焼き付け ${art.bakeCount}（覚えている ${art.cacheSize}）`,
      `地図 ${G.mapId ?? '—'}  枠 ${slot == null ? '—' : slot + 1}`,
      `位置 ${G.pred.x.toFixed(1)}, ${G.pred.y.toFixed(1)}  視点 ${Math.round((renderer.theta * 180) / Math.PI) % 360}°  ×${renderer.scale}`,
    ].join('\n'));
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

addEventListener('resize', () => { renderer.resize(); panels.relayout(); });
document.getElementById('boot')?.remove();
// 確かめ用の窓口（?debug=1 のときだけ）。通し遊びの台本（kanenaki/tools/playthrough.mjs）が使う
if (DEBUG) {
  window.__kanenaki = {
    game, renderer, link, panels, screens, menus, art, fx, data, actions, input,
    debug: (op, args) => dbgPanel.send(op, args),
    send: (m) => link.send(m),
    get slot() { return slot; },
    readSave: () => readSave().save,
  };
}
