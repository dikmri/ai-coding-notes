// 窓の管理: 開く・閉じる・手前へ・移動・大きさ変更・端へ寄せる・最小化・最大化・タスクバー・次回の起動での開き直し
import * as sound from './sound.mjs';

const $ = (s) => document.querySelector(s);
const log = (...a) => (window.dlog || (() => {}))(...a);
const layer = $('#wins'), snapEl = $('#snap'), zoomEl = $('#zoom'), tasks = $('#tasks'), desk = $('#desk');
const wins = new Map();
let zTop = 10, seq = 0, active = null;
export const events = new EventTarget();
const MIN_W = 220, MIN_H = 140;
const deskRect = () => ({ w: desk.clientWidth, h: desk.clientHeight });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const list = () => [...wins.values()];
export const getActive = () => active;

export function open(o) {
  const id = 'w' + ++seq, d = deskRect(), n = wins.size;
  const w = Math.min(o.w || 520, d.w - 20), h = Math.min(o.h || 380, d.h - 20);
  const el = document.createElement('div');
  el.className = 'window ' + (o.className || '');
  el.dataset.win = id;
  el.setAttribute('role', 'region');
  el.innerHTML =
    `<div class="title-bar"><img class="title-bar-icon" src="${o.icon || 'icons/app.svg'}" alt="" title="窓のメニュー（Alt+-）"><div class="title-bar-text"></div><div class="title-bar-controls">` +
    (o.resizable === false ? '' : '<button type="button" class="min" aria-label="最小化"></button><button type="button" class="max" aria-label="最大化"></button>') +
    '<button type="button" class="close" aria-label="閉じる"></button></div></div><div class="app-body"></div>' +
    (o.resizable === false ? '' : ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((k) => `<div class="rz ${k}" data-rz="${k}"></div>`).join(''));
  const win = {
    id, el, app: o.app, icon: o.icon, body: el.querySelector('.app-body'), args: o.args || {}, rect: null, max: false, min: false, onClose: o.onClose || null,
    setTitle(t) { this.title = t; el.querySelector('.title-bar-text').textContent = t; el.setAttribute('aria-label', t); if (this.task) { this.task.querySelector('span').textContent = t; this.task.title = t; } },
    close: (force) => close(win, force), focus: () => focus(win), minimize: () => minimize(win), maximize: () => maximize(win), restore: () => restore(win),
    setArgs(a) { this.args = { ...this.args, ...a }; saveSession(); },
  };
  // 新しい窓は、デスクトップの左のアイコンの列を隠さないよう、その右から少しずつずらして開く
  const x0 = o.x ?? 100 + (n % 8) * 26, y0 = o.y ?? 16 + (n % 8) * 24;
  place(win, { x: x0, y: y0, w, h });
  layer.append(el);
  win.setTitle(o.title || '');
  // タスクバーのボタン
  win.task = document.createElement('button');
  win.task.type = 'button';
  win.task.className = 'task-btn';
  win.task.innerHTML = `<img src="${o.icon || 'icons/app.svg'}" alt="" width="16" height="16"><span>${esc(o.title || '')}</span>`;
  win.task.addEventListener('click', () => { sound.play('click'); if (win === active && !win.min) minimize(win); else { if (win.min) restore(win); focus(win); } });
  win.task.addEventListener('contextmenu', (e) => { e.preventDefault(); sysMenu(win, e.clientX, e.clientY - 150); });
  tasks.append(win.task);
  wins.set(id, win);
  bind(win);
  if (o.render) o.render(win);
  if (window.w95) w95.init(el);
  if (o.max) maximize(win, true);
  focus(win);
  sound.play('open');
  log('wm.open', { app: o.app, title: o.title, args: o.args }, 'ok');
  saveSession();
  return win;
}

function place(win, r) {
  const d = deskRect();
  r.w = Math.max(MIN_W, Math.min(r.w, d.w)); r.h = Math.max(MIN_H, Math.min(r.h, d.h));
  r.x = Math.max(60 - r.w, Math.min(r.x, d.w - 60)); r.y = Math.max(0, Math.min(r.y, d.h - 24));
  win.rect = r;
  Object.assign(win.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}

export function focus(win) {
  if (!win || !wins.has(win.id)) return;
  win.el.style.zIndex = ++zTop;
  active = win;
  if (window.w95) w95.activate(win.el);
  for (const w of wins.values()) w.task.classList.toggle('active', w === win && !w.min);
  events.dispatchEvent(new CustomEvent('focus', { detail: win }));
}

export async function close(win, force) {
  if (!wins.has(win.id)) return;
  if (!force && win.onClose && (await win.onClose()) === false) return;
  win.el.remove(); win.task.remove(); wins.delete(win.id);
  sound.play('close');
  log('wm.close', { app: win.app, title: win.title }, 'ok');
  if (win.cleanup) try { win.cleanup(); } catch { /* 片付けの失敗で止めない */ }
  const next = [...wins.values()].filter((w) => !w.min).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
  active = null;
  if (next) focus(next);
  saveSession();
}

// 当時の動き: 窓の枠だけがタスクバーのボタンへ縮んでいく（またはそこから広がる）
function zoom(fromR, toR) {
  const r0 = fromR, r1 = toR;
  zoomEl.hidden = false;
  const kf = [r0, r1].map((r) => ({ left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }));
  const a = zoomEl.animate(kf, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 160, easing: 'linear' });
  return a.finished.catch(() => {}).then(() => { zoomEl.hidden = true; });
}
const elRect = (el) => { const r = el.getBoundingClientRect(), d = desk.getBoundingClientRect(); return { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height }; };

export async function minimize(win) {
  if (win.min) return;
  sound.play('min');
  const from = elRect(win.el);
  win.min = true; win.el.hidden = true;
  await zoom(from, elRect(win.task));
  win.task.classList.remove('active');
  const next = [...wins.values()].filter((w) => !w.min).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
  if (next) focus(next); else active = null;
  log('wm.minimize', { title: win.title }, 'ok');
  saveSession();
}
export async function restore(win) {
  if (win.min) {
    sound.play('max');
    win.min = false;
    const to = win.max ? { x: 0, y: 0, ...deskRect() } : win.rect;
    await zoom(elRect(win.task), { x: to.x, y: to.y, w: to.w ?? to.w, h: to.h });
    win.el.hidden = false;
    focus(win);
  } else if (win.max) {
    win.max = false; win.el.classList.remove('maximized'); maxBtn(win); sound.play('min');
    place(win, win.rect);
  }
  saveSession();
}
export function maximize(win, quiet) {
  if (win.max) return restore(win);
  win.max = true; win.el.classList.add('maximized'); maxBtn(win);
  if (!quiet) sound.play('max');
  saveSession();
}
function maxBtn(win) {
  const b = win.el.querySelector('.title-bar-controls .max, .title-bar-controls .restore');
  if (!b) return;
  b.className = win.max ? 'restore' : 'max';
  b.setAttribute('aria-label', win.max ? '元のサイズに戻す' : '最大化');
}
function snapTo(win, kind) {
  const d = deskRect();
  if (kind === 'max') return maximize(win);
  win.max = false; win.el.classList.remove('maximized'); maxBtn(win);
  place(win, { x: kind === 'left' ? 0 : Math.round(d.w / 2), y: 0, w: Math.round(d.w / 2), h: d.h });
  sound.play('max');
  saveSession();
}

function bind(win) {
  const el = win.el, bar = el.querySelector('.title-bar');
  el.addEventListener('pointerdown', () => { if (active !== win) focus(win); }, true);
  el.addEventListener('w95:window', (e) => {
    const a = e.detail.action;
    if (a === 'min') minimize(win);
    else if (a === 'max') maximize(win);
    else if (a === 'restore') restore(win);
    else if (a === 'close') close(win);
  });
  bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.title-bar-controls, .title-bar-icon') && el.querySelector('.rz')) maximize(win); });
  el.querySelector('.title-bar-icon').addEventListener('click', (e) => { const r = e.target.getBoundingClientRect(); sysMenu(win, r.left, r.bottom); });
  // タイトルバーでつかんで動かす（主ボタンだけ、4px 動いてから。押した位置のずれを保つ）
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.title-bar-controls, .title-bar-icon')) return;
    const start = { x: e.clientX, y: e.clientY }, r0 = { ...win.rect };
    let moving = false, snap = null;
    bar.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (!moving && Math.hypot(dx, dy) < 4) return;
      if (!moving) {
        moving = true; document.documentElement.classList.add('fos-dragging');
        if (win.max) { // 最大化の窓をつかんだら元の大きさに戻し、つかんだ位置の割合を保つ
          const k = (start.x - desk.getBoundingClientRect().left) / deskRect().w;
          win.max = false; el.classList.remove('maximized'); maxBtn(win);
          r0.x = start.x - win.rect.w * k; r0.y = 0;
        }
      }
      place(win, { ...win.rect, x: r0.x + dx, y: r0.y + dy });
      const d = deskRect(), dr = desk.getBoundingClientRect(), px = ev.clientX - dr.left, py = ev.clientY - dr.top;
      snap = px <= 3 ? 'left' : px >= d.w - 4 ? 'right' : py <= 2 ? 'max' : null;
      if (snap) { snapEl.hidden = false; Object.assign(snapEl.style, { left: (snap === 'right' ? d.w / 2 : 0) + 'px', top: '0px', width: (snap === 'max' ? d.w : d.w / 2) + 'px', height: d.h + 'px' }); } else snapEl.hidden = true;
    };
    const end = () => {
      bar.removeEventListener('pointermove', onMove);
      document.documentElement.classList.remove('fos-dragging');
      snapEl.hidden = true;
      if (moving) { if (snap) snapTo(win, snap); else saveSession(); log('wm.move', { title: win.title, snap }, 'ok'); }
    };
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('lostpointercapture', end, { once: true });
  });
  // 8方向の大きさ変更
  el.querySelectorAll('.rz').forEach((h) => h.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const k = h.dataset.rz, s = { x: e.clientX, y: e.clientY }, r0 = { ...win.rect };
    h.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const dx = ev.clientX - s.x, dy = ev.clientY - s.y, r = { ...r0 };
      if (k.includes('e')) r.w = Math.max(MIN_W, r0.w + dx);
      if (k.includes('s')) r.h = Math.max(MIN_H, r0.h + dy);
      if (k.includes('w')) { r.w = Math.max(MIN_W, r0.w - dx); r.x = r0.x + r0.w - r.w; }
      if (k.includes('n')) { r.h = Math.max(MIN_H, r0.h - dy); r.y = r0.y + r0.h - r.h; }
      place(win, r);
      win.body.dispatchEvent(new CustomEvent('fos:resize'));
    };
    h.addEventListener('pointermove', mv);
    h.addEventListener('lostpointercapture', () => { h.removeEventListener('pointermove', mv); saveSession(); log('wm.resize', { title: win.title, w: win.rect.w, h: win.rect.h }, 'ok'); }, { once: true });
  }));
}

// 窓のメニュー（タイトルバーのアイコン・Alt+-・タスクバーの右クリック）。キーボードで移動と大きさ変更もできる
let sys = null;
export function sysMenu(win, x, y) {
  if (!sys) {
    sys = document.createElement('div');
    sys.className = 'menu sysmenu';
    sys.setAttribute('role', 'menu');
    document.body.append(sys);
    sys.addEventListener('w95:command', (e) => {
      const w = sys.win, c = e.detail.command;
      if (!w) return;
      ({ 'win.restore': () => restore(w), 'win.min': () => minimize(w), 'win.max': () => maximize(w), 'win.left': () => snapTo(w, 'left'), 'win.right': () => snapTo(w, 'right'), 'win.close': () => close(w), 'win.move': () => keyMode(w, 'move'), 'win.size': () => keyMode(w, 'size') })[c]?.();
    });
  }
  sys.win = win;
  const resizable = !!win.el.querySelector('.rz');
  const item = (cmd, label, on = true, extra = '') => `<div class="menu-item${extra}" data-command="${cmd}"${on ? '' : ' aria-disabled="true"'}><span class="label">${label}</span></div>`;
  sys.innerHTML =
    item('win.restore', '元のサイズに戻す(<u>R</u>)', win.max || win.min) + item('win.move', '移動(<u>M</u>)', !win.max) + item('win.size', 'サイズ変更(<u>S</u>)', resizable && !win.max) +
    item('win.min', '最小化(<u>N</u>)', resizable && !win.min) + item('win.max', '最大化(<u>X</u>)', resizable && !win.max) + '<div class="menu-separator"></div>' +
    item('win.left', '画面の左半分へ(<u>L</u>)', resizable) + item('win.right', '画面の右半分へ(<u>I</u>)', resizable) + '<div class="menu-separator"></div>' +
    item('win.close', '閉じる(<u>C</u>)', true, ' default');
  sound.play('menu');
  w95.popupMenu(sys, x, y);
}
function keyMode(win, mode) {
  focus(win);
  const old = { ...win.rect };
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  Object.assign(tip.style, { position: 'fixed', left: '8px', bottom: '32px', zIndex: 9999 });
  tip.textContent = mode === 'move' ? '矢印キーで移動、Enter で決定、Esc で取り消し（Shift で細かく）' : '矢印キーで大きさを変更、Enter で決定、Esc で取り消し（Shift で細かく）';
  document.body.append(tip);
  const onKey = (e) => {
    const s = e.shiftKey ? 1 : 10, dv = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
    e.preventDefault(); e.stopPropagation();
    if (dv) { const r = { ...win.rect }; if (mode === 'move') { r.x += dv[0]; r.y += dv[1]; } else { r.w += dv[0]; r.h += dv[1]; } place(win, r); }
    else if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Escape') place(win, old); removeEventListener('keydown', onKey, true); tip.remove(); saveSession(); }
  };
  addEventListener('keydown', onKey, true);
}
addEventListener('keydown', (e) => {
  if (e.altKey && (e.code === 'Space' || e.key === '-') && active) { e.preventDefault(); const r = active.el.querySelector('.title-bar-icon').getBoundingClientRect(); sysMenu(active, r.left, r.bottom); }
});

// 次の起動で開き直すための記録
let saveTimer = 0;
// 撮影用の入口では窓の並びを保存しない（利用者の前回の窓を上書きしないため）
let persist = true;
export function setPersist(v) { persist = !!v; }
export function saveSession() {
  if (!persist) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = [...wins.values()].sort((a, b) => a.el.style.zIndex - b.el.style.zIndex).map((w) => ({ app: w.app, args: w.args, rect: w.rect, max: w.max, min: w.min }));
    try { localStorage.setItem('fos-session', JSON.stringify(data)); } catch { /* 保存できない環境 */ }
  }, 200);
}
export function loadSession() { try { return JSON.parse(localStorage.getItem('fos-session')) || []; } catch { return []; } }
// 画面の大きさが変わったら、はみ出した窓を中へ戻す
addEventListener('resize', () => { for (const w of wins.values()) if (!w.max) place(w, w.rect); });
