// 操作: 左クリック（歩く・攻撃・拾う・話す・出入口を使う。押したままで歩き続ける）、Shift＋左クリックでその場で攻撃、
// 右クリックと 1〜6 でスキル、Z/X の薬、T の帰還、Q/E の視点、C・I・S・P・M・J の窓、Esc（窓を閉じる・止める）、F2（確かめ用の窓）。
// 近づく動き（届くまで歩いてから攻撃・拾う・話す・出入口に入る）は世界の計算が行う。画面は命令を送るだけ。
export function createInput({ stage, game, renderer, link, actions, log, debug = false }) {
  const G = game.g;
  let cursor = { x: innerWidth / 2, y: innerHeight / 2, inside: false };
  let hold = null, holdTimer = 0, lastMoveSent = null;

  const world = () => renderer.screenToMap(cursor.x, cursor.y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function sendMove(p, force = false) {
    if (!force && lastMoveSent && dist(lastMoveSent, p) < 0.4) return;
    lastMoveSent = { x: p.x, y: p.y };
    link.send({ t: 'move', x: +p.x.toFixed(2), y: +p.y.toFixed(2) });
  }
  // 押した地点の近くの出入口（地図の portals はマスの中心）
  function portalAt(p) {
    let best = null, bd = Infinity;
    for (const q of G.portals) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= Math.max(1.2, (q.r || 1) + 0.6) && d < bd) { bd = d; best = q; }
    }
    return best;
  }

  function primary(shift) {
    if (G.dead || G.paused) return;
    const ent = renderer.pick(cursor.x, cursor.y);
    const p = world();
    if (shift) {
      if (ent?.kind === 'monster') { G.selected = ent.id; link.send({ t: 'attack', id: ent.id }); }
      else link.send({ t: 'stop' });
      log('ui.click', { what: 'attack-stay', id: ent?.id ?? null });
      return;
    }
    if (ent) {
      log('ui.click', { what: ent.kind, id: ent.id, name: ent.name });
      if (ent.kind === 'monster') { G.selected = ent.id; link.send({ t: 'attack', id: ent.id }); hold = { kind: 'attack' }; return; }
      if (ent.kind === 'item') { link.send({ t: 'pick', id: ent.id }); return; }
      if (ent.kind === 'npc') { G.selected = ent.id; link.send({ t: 'talk', npc: ent.id }); return; }
    }
    const q = portalAt(p);
    if (q) {
      log('ui.click', { what: 'portal', id: q.id, to: q.to });
      renderer.setMarker(q.x, q.y);
      link.send({ t: 'warp', id: q.id });
      return;
    }
    G.selected = null;
    renderer.setMarker(p.x, p.y);
    sendMove(p, true);
    hold = { kind: 'move' };
    log('ui.click', { what: 'ground', x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
  }

  stage.addEventListener('pointerdown', (e) => {
    cursor = { x: e.clientX, y: e.clientY, inside: true };
    if (e.button === 0) {
      stage.setPointerCapture(e.pointerId);
      primary(e.shiftKey);
      clearInterval(holdTimer);
      holdTimer = setInterval(() => { if (hold?.kind === 'move' && !G.paused) sendMove(world()); }, 150);
    } else if (e.button === 2) {
      actions.castSlot('r', world());
    }
  });
  stage.addEventListener('pointermove', (e) => {
    cursor = { x: e.clientX, y: e.clientY, inside: true };
    if (e.pointerType === 'touch') return;
    const ent = renderer.pick(cursor.x, cursor.y);
    G.hover = ent ? ent.id : null;
    stage.dataset.cursor = ent ? ent.kind : portalAt(world()) ? 'portal' : 'ground';
  });
  const endHold = () => { hold = null; clearInterval(holdTimer); };
  stage.addEventListener('pointerup', endHold);
  stage.addEventListener('pointercancel', endHold);
  stage.addEventListener('lostpointercapture', endHold);
  stage.addEventListener('pointerleave', () => { cursor.inside = false; G.hover = null; });
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------- キー ---------------- */
  const PANEL_KEYS = { c: 'char', i: 'inv', s: 'skills', p: 'tree', m: 'map', j: 'quests' };
  window.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'F2' && debug) { e.preventDefault(); actions.togglePanel('debug'); return; }
    if (actions.modalOpen()) return; // 止めた画面・設定・題名の画面は dialog が Esc を受ける
    if (k === 'Escape') {
      // 小さなメニュー（popover="auto"）は、ブラウザが Esc で閉じる。そのときは窓や止める画面に手を出さない
      if (document.querySelector('#ctx:popover-open')) return;
      e.preventDefault(); actions.escape(); return;
    }
    if (!G.welcomed || G.paused) return;
    // ボタンなどにフォーカスがあるときの Enter と空白は、その部品に任せる
    if ((k === 'Enter' || k === ' ') && t instanceof HTMLElement && t.closest('button, a, [role=menuitem], canvas.tree-canvas')) return;
    if (/^[1-6]$/.test(k)) { e.preventDefault(); actions.castSlot(k, cursor.inside ? world() : null); return; }
    if (k === 'z' || k === 'x' || k === 't') { e.preventDefault(); actions.useBelt(k.toUpperCase()); return; }
    if (k === 'q') { e.preventDefault(); renderer.rotate(-1); return; }
    if (k === 'e') { e.preventDefault(); renderer.rotate(1); return; }
    if (PANEL_KEYS[k]) { e.preventDefault(); actions.togglePanel(PANEL_KEYS[k]); }
  });

  return { get cursor() { return cursor; }, world, portalAt };
}
