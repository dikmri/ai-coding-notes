// パッシブのツリーの画面。canvas に描き、ホイール・2 本指で拡大縮小、引きずって移動、検索、取れるマスの強調、取る・取り消す。
// キー操作: 矢印で移動、+ と - で拡大縮小、Tab で「次の取れるマス」ボタンへ。選んだマスの説明と操作はボタンで出す。
import { h, clear, announce } from './dom.mjs';
import { formatMod, treeAllocatable, treeCanUnalloc, treeAdjacency } from '../core.mjs';

const KIND_LABEL = { small: '小さなマス', notable: '目玉のマス', keystone: '要のマス', start: '出発点', gate: '門' };
const CLS_COL = { swordsman: [110, 150, 230], warrior: [220, 90, 70], rogue: [90, 190, 110], priest: [240, 220, 150], necromancer: [170, 110, 220], monk: [240, 160, 70] };

export function createTreeView({ panels, game, data, net, log }) {
  const G = game.g;
  const fmt = (m) => { try { return typeof data.formatMod === 'function' ? data.formatMod(m) : formatMod(m); } catch { return formatMod(m); } };
  const ruleText = (r) => (r == null ? '' : typeof r === 'string' ? r : r.desc || r.text || '');
  const tree = data.tree || { nodes: {}, starts: {} };
  const nodes = Object.values(tree.nodes || {});
  const adj = treeAdjacency(tree);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
  if (!nodes.length) { minX = minY = -1; maxX = maxY = 1; }
  const span = Math.max(maxX - minX, maxY - minY, 1);

  const cv = h('canvas', { class: 'tree-canvas', tabindex: '0', role: 'img', 'aria-label': 'パッシブのツリー。矢印キーで動かし、+ と - で拡大縮小する。' });
  const search = h('input', { type: 'search', class: 'tree-search', placeholder: 'マスを探す（例: 体力、会心）', 'aria-label': 'マスを探す' });
  const found = h('span', { class: 'tree-found', 'aria-live': 'polite' });
  const points = h('span', { class: 'tree-points' });
  const info = h('div', { class: 'tree-info', 'aria-live': 'polite' });
  const zoomIn = h('button', { type: 'button', 'aria-label': '拡大' }, '＋'), zoomOut = h('button', { type: 'button', 'aria-label': '縮小' }, '－');
  const fit = h('button', { type: 'button' }, '全体');
  const nextFree = h('button', { type: 'button' }, '次の取れるマス');

  let view = { cx: 0, cy: 0, z: 0.3 };
  let hover = null, selected = null, matches = [], matchIdx = -1, raf = 0, W = 600, H = 420, dpr = 1;
  const pointers = new Map();
  let pinch = null, dragStart = null, moved = false;

  const allocSet = () => G.tree.alloc;
  const canTake = () => (G.tree.points || 0) > 0 ? treeAllocatable(tree, allocSet()) : new Set();
  const toScreen = (n) => ({ x: (n.x - view.cx) * view.z + W / 2, y: (n.y - view.cy) * view.z + H / 2 });
  const toTree = (sx, sy) => ({ x: (sx - W / 2) / view.z + view.cx, y: (sy - H / 2) / view.z + view.cy });

  function fitAll() {
    view.cx = (minX + maxX) / 2; view.cy = (minY + maxY) / 2;
    view.z = Math.min(W, H) / (span * 1.08);
    draw();
  }
  function centerOn(n, z) { view.cx = n.x; view.cy = n.y; if (z) view.z = z; draw(); }
  function radius(n) { return (n.kind === 'start' ? 13 : n.kind === 'keystone' ? 12 : n.kind === 'gate' ? 10 : n.kind === 'notable' ? 8 : 5) * Math.max(0.6, Math.min(1.6, view.z * 3)); }

  function draw() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(paint);
  }
  function paint(t = performance.now()) {
    const rect = cv.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = Math.max(1, rect.width); H = Math.max(1, rect.height);
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#100c14'; c.fillRect(0, 0, W, H);
    // 背景の模様
    c.strokeStyle = 'rgba(180,140,80,0.06)'; c.lineWidth = 1;
    const o = toScreen({ x: 0, y: 0 });
    for (let r = 1; r < 6; r++) { c.beginPath(); c.arc(o.x, o.y, (span / 10) * r * view.z, 0, Math.PI * 2); c.stroke(); }
    const alloc = allocSet(), take = canTake();
    const q = search.value.trim();
    const match = new Set(matches.map((n) => n.id));
    // つながり
    c.lineCap = 'round';
    for (const n of nodes) {
      const a = toScreen(n);
      for (const l of adj.get(n.id) || []) {
        if (l < n.id) continue;
        const m = tree.nodes[l]; if (!m) continue;
        const b = toScreen(m);
        const both = alloc.has(n.id) && alloc.has(l), one = alloc.has(n.id) || alloc.has(l);
        c.strokeStyle = both ? '#e0b45c' : one ? 'rgba(224,180,92,0.45)' : 'rgba(150,140,160,0.28)';
        c.lineWidth = both ? 3 : 2;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
    }
    // マス
    const pulse = 0.5 + Math.sin(t / 260) * 0.5;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (const n of nodes) {
      const p = toScreen(n);
      const r = radius(n);
      if (p.x < -40 || p.y < -40 || p.x > W + 40 || p.y > H + 40) continue;
      const has = alloc.has(n.id), can = take.has(n.id);
      const col = n.cls && CLS_COL[n.cls] ? CLS_COL[n.cls] : [200, 190, 170];
      c.beginPath();
      if (n.kind === 'keystone') { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; c.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); } c.closePath(); }
      else if (n.kind === 'gate') { c.moveTo(p.x, p.y - r); c.lineTo(p.x + r, p.y); c.lineTo(p.x, p.y + r); c.lineTo(p.x - r, p.y); c.closePath(); }
      else c.arc(p.x, p.y, r, 0, Math.PI * 2);
      c.fillStyle = has ? `rgb(${Math.min(255, col[0] + 30)},${Math.min(255, col[1] + 10)},${col[2] * 0.6})` : '#2a2230';
      if (has && !n.cls) c.fillStyle = '#e8c068';
      c.fill();
      c.lineWidth = n.kind === 'small' ? 1.5 : 2.5;
      c.strokeStyle = has ? '#fff3cf' : can ? `rgba(140,255,170,${0.5 + pulse * 0.5})` : `rgb(${col[0] * 0.6},${col[1] * 0.6},${col[2] * 0.6})`;
      c.stroke();
      if (can) { c.beginPath(); c.arc(p.x, p.y, r + 3 + pulse * 2, 0, Math.PI * 2); c.strokeStyle = `rgba(140,255,170,${0.25 + pulse * 0.3})`; c.lineWidth = 1.5; c.stroke(); }
      if (q && match.has(n.id)) { c.beginPath(); c.arc(p.x, p.y, r + 6, 0, Math.PI * 2); c.strokeStyle = '#7fd8ff'; c.lineWidth = 2; c.stroke(); }
      if (selected === n.id || hover === n.id) { c.beginPath(); c.arc(p.x, p.y, r + 4, 0, Math.PI * 2); c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.stroke(); }
      if ((n.kind !== 'small' && view.z > 0.22) || (n.kind === 'small' && view.z > 0.9 && n.name)) {
        c.font = `${n.kind === 'keystone' ? 700 : 500} ${n.kind === 'small' ? 10 : 12}px system-ui, sans-serif`;
        c.lineWidth = 3; c.strokeStyle = 'rgba(12,8,16,0.9)'; c.strokeText(n.name || '', p.x, p.y + r + 3);
        c.fillStyle = n.kind === 'keystone' ? '#ffb27a' : n.kind === 'notable' ? '#f0d79c' : '#d8d0c4'; c.fillText(n.name || '', p.x, p.y + r + 3);
      }
    }
    points.textContent = `パッシブの点 ${G.tree.points || 0}　取ったマス ${alloc.size}`;
    if (panels.isOpen('tree') && (take.size || q)) raf = requestAnimationFrame(paint);
  }

  function nodeAt(sx, sy) {
    let best = null, bd = Infinity;
    for (const n of nodes) {
      const p = toScreen(n);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < radius(n) + 5 && d < bd) { bd = d; best = n; }
    }
    return best;
  }

  function showInfo(n) {
    clear(info);
    if (!n) { info.append(h('p', { class: 'hint' }, 'マスを押すと、ここに説明と操作が出る。2 回押すと取る。')); return; }
    const alloc = allocSet();
    const has = alloc.has(n.id), can = canTake().has(n.id), canUn = treeCanUnalloc(tree, alloc, n.id);
    info.append(h('div', { class: 'tn-name' }, n.name || KIND_LABEL[n.kind] || 'マス'), h('div', { class: 'tn-kind' }, `${KIND_LABEL[n.kind] || ''}${n.cls ? `（${data.classes[n.cls]?.name || n.cls}の地域）` : ''}`));
    for (const m of n.mods || []) info.append(h('div', { class: 'tip-mod' }, fmt(m)));
    if (n.rule) info.append(h('div', { class: 'tip-rule' }, ruleText(n.rule)));
    const state = has ? '取ったマス' : can ? '取れる' : (G.tree.points || 0) <= 0 ? '点が足りない' : 'まだつながっていない';
    info.append(h('div', { class: `tn-state${can ? ' ok' : ''}` }, state));
    const take = h('button', { type: 'button', class: 'primary', disabled: !can || null }, '取る');
    take.addEventListener('click', () => { net.send({ t: 'alloc', node: n.id }); log('ui.tree.alloc', { node: n.id }); });
    const undo = h('button', { type: 'button', disabled: !canUn || null, title: '忘却の聖水かお金を使う' }, '取り消す');
    undo.addEventListener('click', () => { net.send({ t: 'unalloc', node: n.id }); log('ui.tree.unalloc', { node: n.id }); });
    info.append(h('div', { class: 'row' }, take, undo));
    if (has && !canUn && n.kind !== 'start' && n.kind !== 'gate') info.append(h('p', { class: 'hint' }, '外すと、ほかの取ったマスが出発点から切れるので取り消せない。'));
  }
  function select(n) { selected = n?.id ?? null; showInfo(n); draw(); if (n) announce(`${n.name || KIND_LABEL[n.kind]}を選んだ`); }

  /* ---------------- 操作 ---------------- */
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  function zoomAt(sx, sy, f) {
    const before = toTree(sx, sy);
    view.z = Math.max(0.05, Math.min(4, view.z * f));
    const after = toTree(sx, sy);
    view.cx += before.x - after.x; view.cy += before.y - after.y;
    draw();
  }
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z }; }
    dragStart = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
    moved = false;
  });
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        zoomAt(mx, my, (pinch.z * (d / pinch.d)) / view.z);
        moved = true;
        return;
      }
      if (dragStart && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 4) {
        moved = true;
        view.cx = dragStart.cx - (e.clientX - dragStart.x) / view.z;
        view.cy = dragStart.cy - (e.clientY - dragStart.y) / view.z;
        cv.classList.add('panning');
        draw();
        return;
      }
    }
    const n = nodeAt(e.clientX - r.left, e.clientY - r.top);
    if ((n?.id ?? null) !== hover) { hover = n?.id ?? null; cv.title = n ? `${n.name || KIND_LABEL[n.kind]}\n${(n.mods || []).map(fmt).join('\n')}` : ''; draw(); }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    cv.classList.remove('panning');
    if (!moved && e.type === 'pointerup') {
      const r = cv.getBoundingClientRect();
      const n = nodeAt(e.clientX - r.left, e.clientY - r.top);
      if (n && n.id === selected && canTake().has(n.id)) { net.send({ t: 'alloc', node: n.id }); log('ui.tree.alloc', { node: n.id, by: 'double' }); }
      else select(n);
    }
    dragStart = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('keydown', (e) => {
    const step = 60 / view.z;
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (k) { e.preventDefault(); e.stopPropagation(); view.cx += k[0]; view.cy += k[1]; draw(); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); e.stopPropagation(); zoomAt(W / 2, H / 2, 1.25); }
    if (e.key === '-') { e.preventDefault(); e.stopPropagation(); zoomAt(W / 2, H / 2, 0.8); }
  });
  zoomIn.addEventListener('click', () => zoomAt(W / 2, H / 2, 1.25));
  zoomOut.addEventListener('click', () => zoomAt(W / 2, H / 2, 0.8));
  fit.addEventListener('click', fitAll);
  nextFree.addEventListener('click', () => {
    const list = [...canTake()].map((id) => tree.nodes[id]).filter(Boolean);
    if (!list.length) { announce((G.tree.points || 0) > 0 ? '取れるマスがない' : 'パッシブの点が足りない'); return; }
    const i = (list.findIndex((n) => n.id === selected) + 1) % list.length;
    centerOn(list[i], Math.max(view.z, 0.6)); select(list[i]);
  });
  search.addEventListener('input', () => {
    const q = search.value.trim();
    matches = q ? nodes.filter((n) => (n.name || '').includes(q) || (n.mods || []).some((m) => fmt(m).includes(q)) || ruleText(n.rule).includes(q)) : [];
    matchIdx = -1;
    found.textContent = q ? `${matches.length} 件` : '';
    draw();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && matches.length) { e.preventDefault(); matchIdx = (matchIdx + 1) % matches.length; centerOn(matches[matchIdx], Math.max(view.z, 0.6)); select(matches[matchIdx]); }
  });

  panels.define('tree', {
    title: 'パッシブのツリー', key: 'P', place: 'center', width: 'min(980px, 96vw)',
    build(body) {
      if (!body.firstChild) {
        body.append(
          h('div', { class: 'tree-bar' }, search, found, h('span', { class: 'grow' }), points),
          h('div', { class: 'tree-main' }, cv, h('aside', { class: 'tree-side' }, info, h('div', { class: 'row' }, zoomOut, zoomIn, fit), nextFree)));
        showInfo(null);
      } else showInfo(selected ? tree.nodes[selected] : null);
      draw();
    },
    onOpen() {
      requestAnimationFrame(() => {
        const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
        if (!view.init) { view.init = true; fitAll(); const st = tree.nodes[[...G.tree.alloc].pop()] || tree.nodes[tree.starts?.[G.me.cls || 'adventurer']]; if (st) centerOn(st, Math.min(W, H) / (span * 0.45)); }
        draw();
      });
    },
  });
  return { refresh: () => { if (panels.isOpen('tree')) { showInfo(selected ? tree.nodes[selected] : null); draw(); } } };
}
