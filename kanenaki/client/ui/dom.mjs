// DOM の共通部品: 要素づくり、パネル（ゲームを続けながら開く <dialog popover="manual">）、
// 説明の吹き出し、右クリックの小さなメニュー、読み上げ（aria-live）。
// modern-web-guidance の dialog（Rule 2: 開いたままゲームを続ける面は <dialog popover>、見える閉じるボタン）と
// drag（専用のつまみ、pointer capture、矢印キーで 15px、読み上げ）に合わせている。

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') {
      // CSS の変数（--x など）は Object.assign では入らないので setProperty で入れる
      for (const [sk, sv] of Object.entries(v)) if (sk.startsWith('--')) el.style.setProperty(sk, String(sv)); else el.style[sk] = sv;
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

/* ---------------- 読み上げ ---------------- */
let liveEl = null, liveTimer = 0;
export function announce(text) {
  liveEl ||= document.getElementById('live');
  if (!liveEl) return;
  liveEl.textContent = text;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { liveEl.textContent = ''; }, 1500);
}

/* ---------------- パネル ---------------- */
const POS_KEY = 'kanenaki:panels';
let savedPos = {};
try { savedPos = JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch { savedPos = {}; }
const savePos = () => { try { localStorage.setItem(POS_KEY, JSON.stringify(savedPos)); } catch { /* 保存できない */ } };

export function createPanels({ log, onChange }) {
  const panels = new Map();
  let zTop = 0;

  function define(id, { title, key, place = 'left', width, build, onOpen, onClose }) {
    const titleId = `panel-${id}-title`;
    const body = h('div', { class: 'panel-body' });
    const grip = h('button', { type: 'button', class: 'grip', 'aria-label': `${title}の窓を動かす。矢印キーでも動く`, title: 'つまんで動かす' }, h('span', { 'aria-hidden': 'true' }, '⠿'));
    const close = h('button', { type: 'button', class: 'close', 'aria-label': `${title}を閉じる`, title: '閉じる' }, h('span', { 'aria-hidden': 'true' }, '×'));
    const el = h('dialog', { class: `panel panel-${id}`, id: `panel-${id}`, 'aria-labelledby': titleId },
      h('header', { class: 'panel-head' }, grip, h('h2', { id: titleId }, title), key ? h('kbd', { class: 'panel-key', 'aria-hidden': 'true' }, key) : null, close),
      body);
    el.setAttribute('popover', 'manual');
    if (width) el.style.width = width;
    document.body.append(el);
    const p = { id, el, body, title, place, build, onOpen, onClose, open: false };
    panels.set(id, p);
    close.addEventListener('click', () => hide(id));
    el.addEventListener('pointerdown', () => raise(p), { capture: true });
    makeDraggable(p, grip);
    return p;
  }

  function placeDefault(p) {
    const r = p.el.getBoundingClientRect();
    const W = innerWidth, H = innerHeight;
    const s = savedPos[p.id];
    let x, y;
    if (s) { x = s.x * W; y = s.y * H; }
    else if (p.place === 'right') { x = W - r.width - 16; y = 70; }
    else if (p.place === 'center') { x = (W - r.width) / 2; y = Math.max(16, (H - r.height) / 2 - 40); }
    else if (p.place === 'bottom') { x = (W - r.width) / 2; y = H - r.height - 150; }
    else { x = 16; y = 70; }
    moveTo(p, x, y);
  }
  function moveTo(p, x, y) {
    const r = p.el.getBoundingClientRect();
    const maxX = Math.max(0, innerWidth - r.width), maxY = Math.max(0, innerHeight - Math.min(r.height, innerHeight));
    p.el.style.left = `${Math.round(Math.max(0, Math.min(x, maxX)))}px`;
    p.el.style.top = `${Math.round(Math.max(0, Math.min(y, maxY)))}px`;
  }
  function raise(p) {
    // 押した窓を手前へ（top layer の中では、最後に開いたものが手前になる）
    if (!p.open || p.el.dataset.z === String(zTop)) return;
    const focusInside = p.el.contains(document.activeElement) ? document.activeElement : null;
    try { p.el.hidePopover(); p.el.showPopover(); } catch { return; } // ほかの popover を開いている最中は並べ替えない
    p.el.dataset.z = String(++zTop);
    focusInside?.focus?.({ preventScroll: true });
  }

  function makeDraggable(p, grip) {
    let ox = 0, oy = 0, moved = false;
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = p.el.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top; moved = false;
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointermove', (e) => {
      if (!grip.hasPointerCapture(e.pointerId)) return;
      moved = true;
      grip.classList.add('dragging');
      moveTo(p, e.clientX - ox, e.clientY - oy);
    });
    grip.addEventListener('lostpointercapture', () => {
      grip.classList.remove('dragging');
      if (moved) remember(p);
    });
    grip.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-15, 0, '左へ'], ArrowRight: [15, 0, '右へ'], ArrowUp: [0, -15, '上へ'], ArrowDown: [0, 15, '下へ'] }[e.key];
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      const r = p.el.getBoundingClientRect();
      moveTo(p, r.left + d[0], r.top + d[1]);
      remember(p);
      announce(`${p.title}の窓を${d[2]}動かした`);
    });
  }
  function remember(p) {
    const r = p.el.getBoundingClientRect();
    savedPos[p.id] = { x: r.left / innerWidth, y: r.top / innerHeight };
    savePos();
  }

  function show(id, arg) {
    const p = panels.get(id);
    if (!p) return;
    try { p.build?.(p.body, arg); } catch (e) { log('ui.panel.build', { id, msg: String(e.stack || e).slice(0, 300) }, 'exception'); }
    if (!p.open) {
      p.el.showPopover();
      p.open = true;
      p.el.dataset.z = String(++zTop);
      placeDefault(p);
      log('ui.panel.open', { id });
      p.onOpen?.(arg);
      onChange?.();
    } else raise(p);
  }
  function hide(id) {
    const p = panels.get(id);
    if (!p || !p.open) return;
    p.el.hidePopover();
    p.open = false;
    log('ui.panel.close', { id });
    p.onClose?.();
    onChange?.();
  }
  return {
    define, show, hide,
    toggle(id, arg) { const p = panels.get(id); if (p?.open) hide(id); else show(id, arg); },
    isOpen: (id) => !!panels.get(id)?.open,
    refresh(id, arg) { const p = panels.get(id); if (p?.open) { try { p.build?.(p.body, arg); } catch (e) { log('ui.panel.build', { id, msg: String(e.stack || e).slice(0, 300) }, 'exception'); } } },
    anyOpen: () => [...panels.values()].some((p) => p.open),
    closeAll() { for (const p of panels.values()) if (p.open) hide(p.id); },
    get: (id) => panels.get(id),
    relayout() { for (const p of panels.values()) if (p.open) { const r = p.el.getBoundingClientRect(); moveTo(p, r.left, r.top); } },
  };
}

/* ---------------- 説明の吹き出し ---------------- */
// [data-tip="種類:値"] の要素に、指を乗せる・フォーカスすると出る。Esc で消える。吹き出しに指を乗せても消えない
export function createTooltip({ providers }) {
  const tip = h('div', { id: 'tip', class: 'tip', role: 'tooltip' });
  tip.setAttribute('popover', 'manual');
  document.body.append(tip);
  let current = null, hideTimer = 0, overTip = false;

  function show(target, at) {
    const spec = target.dataset.tip;
    const [kind, ...rest] = spec.split(':');
    const provider = providers[kind];
    if (!provider) return;
    const content = provider(rest.join(':'), target);
    if (!content) return;
    clearTimeout(hideTimer);
    clear(tip).append(content);
    current = target;
    raiseTip();
    target.setAttribute('aria-describedby', 'tip');
    position(target, at);
  }
  // 開いている窓より手前へ出す。ほかの popover を開いている最中（小さなメニューを開いてフォーカスが動いたときなど）は
  // showPopover が InvalidStateError になるので、その回は見送り、次の一巡で出し直す
  function raiseTip() {
    try {
      if (tip.matches(':popover-open')) tip.hidePopover();
      tip.showPopover();
    } catch {
      setTimeout(() => { if (!current?.isConnected) return; try { if (!tip.matches(':popover-open')) tip.showPopover(); position(current, null); } catch { /* 次に指を乗せたときに出す */ } }, 0);
    }
  }
  function position(target, at) {
    const tr = tip.getBoundingClientRect();
    let x, y;
    if (at) { x = at.x + 18; y = at.y + 18; }
    else { const r = target.getBoundingClientRect(); x = r.right + 8; y = r.top; }
    if (x + tr.width > innerWidth - 8) x = (at ? at.x - 18 : target.getBoundingClientRect().left - 8) - tr.width;
    if (y + tr.height > innerHeight - 8) y = innerHeight - 8 - tr.height;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }
  function hide() {
    if (current) current.removeAttribute('aria-describedby');
    current = null;
    if (tip.matches(':popover-open')) tip.hidePopover();
  }
  const later = () => { clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!overTip) hide(); }, 120); };

  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t && t !== current && e.pointerType !== 'touch') show(t, { x: e.clientX, y: e.clientY });
  });
  document.addEventListener('pointermove', (e) => { if (current && e.target.closest?.('[data-tip]') === current) position(current, { x: e.clientX, y: e.clientY }); });
  document.addEventListener('pointerout', (e) => { const t = e.target.closest?.('[data-tip]'); if (t && t === current && !t.contains(e.relatedTarget)) later(); });
  document.addEventListener('focusin', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) show(t, null); });
  document.addEventListener('focusout', (e) => { if (e.target.closest?.('[data-tip]') === current) later(); });
  tip.addEventListener('pointerenter', () => { overTip = true; clearTimeout(hideTimer); });
  tip.addEventListener('pointerleave', () => { overTip = false; later(); });
  return {
    hide, get open() { return !!current; },
    refresh() { if (current && current.isConnected) show(current, null); else if (current) hide(); },
    showFor: show,
  };
}

/* ---------------- 右クリックの小さなメニュー ---------------- */
export function createContextMenu() {
  const menu = h('div', { id: 'ctx', class: 'ctx', role: 'menu' });
  menu.setAttribute('popover', 'auto');
  document.body.append(menu);
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('[role=menuitem]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  });
  return {
    open(at, title, actions) {
      clear(menu);
      if (title) menu.append(h('div', { class: 'ctx-title' }, title));
      for (const a of actions) {
        const b = h('button', { type: 'button', role: 'menuitem', class: 'ctx-item', disabled: a.disabled || null }, a.label);
        b.addEventListener('click', () => { menu.hidePopover(); a.run(); });
        menu.append(b);
      }
      menu.showPopover();
      const r = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(at.x, innerWidth - r.width - 4))}px`;
      menu.style.top = `${Math.max(4, Math.min(at.y, innerHeight - r.height - 4))}px`;
      menu.querySelector('[role=menuitem]:not([disabled])')?.focus();
    },
    close() { if (menu.matches(':popover-open')) menu.hidePopover(); },
  };
}
