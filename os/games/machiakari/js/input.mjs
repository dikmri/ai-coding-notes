// 操作: マウス（左で道具、右か真ん中で見る場所を動かす、ホイールで拡大）とキーボード（カーソルと Space/Enter）
import { plan } from './core/edit.mjs';
import { DRAG_LINE, DRAG_RECT } from './core/defs.mjs';

const log = (...a) => (window.dlog || (() => {}))(...a);

export function makeInput(G) {
  const cv = document.getElementById('city'), ui = G.ui, R = G.R;
  let drag = null;
  const dev = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * R.dpr, (e.clientY - r.top) * R.dpr, e.clientX - r.left, e.clientY - r.top]; };
  const tileAt = (sx, sy) => { const [fi, fj] = R.screenToTile(sx, sy); return [Math.floor(fi), Math.floor(fj)]; };
  const isDrag = () => DRAG_LINE.has(ui.tool.kind) || DRAG_RECT.has(ui.tool.kind);

  // 見積もりを作りなおす（カーソルか、引いている途中の2点から）
  function updatePreview(at) {
    const s = G.sim.s;
    if (!at || ui.tool.kind === 'inspect') { ui.preview = null; return; }
    const a = ui.dragStart && isDrag() ? ui.dragStart : at;
    const p = plan(s, ui.tool, a, at);
    ui.preview = { ...p, tool: ui.tool, a };
  }
  G.updatePreview = () => updatePreview(ui.cursor);

  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    if (!G.playing) return;
    cv.focus({ preventScroll: true });
    G.audio.unlock();
    const [sx, sy] = dev(e);
    const pan = e.button === 1 || e.button === 2 || (e.pointerType === 'touch' && ui.tool.kind === 'inspect');
    cv.setPointerCapture(e.pointerId);
    if (pan) { drag = { mode: 'pan', x: sx, y: sy, moved: 0, button: e.button }; return; }
    if (e.button !== 0) return;
    const t = tileAt(sx, sy);
    ui.cursor = t;
    if (isDrag()) { ui.dragStart = t; drag = { mode: 'tool', start: t }; updatePreview(t); }
    else drag = { mode: 'click', start: t };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!G.playing) return;
    const [sx, sy, cx, cy] = dev(e);
    if (drag && drag.mode === 'pan') {
      const sc = R.scale();
      R.cam.x -= (sx - drag.x) / sc; R.cam.y -= (sy - drag.y) / sc;
      drag.moved += Math.abs(sx - drag.x) + Math.abs(sy - drag.y);
      drag.x = sx; drag.y = sy;
      R.clampCam(G.sim.s.N);
      G.uiApi.showTip(0, 0, '');
      return;
    }
    const t = tileAt(sx, sy);
    if (!ui.cursor || t[0] !== ui.cursor[0] || t[1] !== ui.cursor[1]) { ui.cursor = t; updatePreview(t); }
    G.uiApi.showTip(cx, cy, G.uiApi.tipFor(t[0], t[1]));
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    try { cv.releasePointerCapture(e.pointerId); } catch { /* もう離れている */ }
    if (d.mode === 'pan') {
      // 右クリックで動かさなかったときは、引いている途中の道具をやめる
      if (d.moved < 4 && d.button === 2 && ui.dragStart) { ui.dragStart = null; updatePreview(ui.cursor); G.uiApi.announce('やめました'); }
      return;
    }
    if (e.type === 'pointercancel') { ui.dragStart = null; return; }
    const [sx, sy] = dev(e), t = tileAt(sx, sy);
    if (d.mode === 'tool') { G.applyTool(d.start, t); ui.dragStart = null; }
    else if (ui.tool.kind === 'inspect') G.uiApi.inspect(t[0], t[1]);
    else G.applyTool(t, t);
    updatePreview(t);
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { if (!drag) { G.uiApi.showTip(0, 0, ''); } });
  cv.addEventListener('wheel', (e) => {
    if (!G.playing) return;
    e.preventDefault();
    const [sx, sy] = dev(e);
    if (R.zoomAt(e.deltaY < 0 ? 1 : -1, sx, sy, G.sim.s.N)) log('ui.zoom', { z: R.cam.z }, 'ok');
  }, { passive: false });

  // キーボード
  function moveCursor(di, dj) {
    const N = G.sim.s.N, c = ui.cursor || centerTile();
    ui.cursor = [Math.max(0, Math.min(N - 1, c[0] + di)), Math.max(0, Math.min(N - 1, c[1] + dj))];
    // カーソルが画面の端に近づいたら、見る場所を動かす
    const [x, y] = R.tileTop(ui.cursor[0] + 0.5, ui.cursor[1] + 0.5), m = 80 * R.dpr, sc = R.scale();
    if (x < m) R.cam.x -= (m - x) / sc; if (x > R.W - m) R.cam.x += (x - (R.W - m)) / sc;
    if (y < m) R.cam.y -= (m - y) / sc; if (y > R.H - m) R.cam.y += (y - (R.H - m)) / sc;
    R.clampCam(N);
    updatePreview(ui.cursor);
    const [cx, cy] = R.tileTop(ui.cursor[0] + 0.5, ui.cursor[1] + 0.5);
    G.uiApi.showTip(cx / R.dpr, cy / R.dpr, G.uiApi.tipFor(ui.cursor[0], ui.cursor[1]));
  }
  function centerTile() { const [i, j] = R.screenToTile(R.W / 2, R.H / 2); return [Math.floor(i), Math.floor(j)]; }
  function useAtCursor() {
    const c = ui.cursor || centerTile();
    ui.cursor = c;
    if (ui.tool.kind === 'inspect') { G.uiApi.inspect(c[0], c[1]); return; }
    if (isDrag()) {
      if (!ui.dragStart) { ui.dragStart = c; updatePreview(c); G.uiApi.announce('始めの場所を決めました。カーソルを動かして、もう一度押すと決まります'); return; }
      G.applyTool(ui.dragStart, c); ui.dragStart = null; updatePreview(c); return;
    }
    G.applyTool(c, c); updatePreview(c);
  }
  const GROUP_BY_KEY = { 1: 'road', 2: 'res', 3: 'com', 4: 'ind', 5: 'power', 6: 'water', 7: 'safety', 8: 'edu', 9: 'park', 0: 'district', x: 'bulldoze', z: 'dezone', q: 'inspect' };
  addEventListener('keydown', (e) => {
    if (!G.playing || G.uiApi.anyOpen()) return;
    const el = document.activeElement;
    if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
    const onMap = !el || el === document.body || el === cv;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let used = true;
    const step = e.shiftKey ? 4 : 1;
    if (e.ctrlKey || e.metaKey) {
      if (k === 's') G.uiApi.openDialog('save'); else if (k === 'o') G.uiApi.openDialog('save'); else used = false;
    } else if (onMap && k === 'ArrowLeft') moveCursor(-step, 0);
    else if (onMap && k === 'ArrowRight') moveCursor(step, 0);
    else if (onMap && k === 'ArrowUp') moveCursor(0, -step);
    else if (onMap && k === 'ArrowDown') moveCursor(0, step);
    else if (onMap && (k === ' ' || k === 'Enter')) useAtCursor();
    else if (k === 'Escape') { if (ui.dragStart) { ui.dragStart = null; updatePreview(ui.cursor); G.uiApi.announce('やめました'); } else if (document.getElementById('inspect').open) document.getElementById('inspect').close(); else used = false; }
    else if (k in GROUP_BY_KEY) G.uiApi.selectGroup(GROUP_BY_KEY[k], false);
    else if (k === 'w' || k === 'a' || k === 's' || k === 'd') { const sc = R.scale(), v = (e.shiftKey ? 240 : 90) * R.dpr / sc; if (k === 'w') R.cam.y -= v; if (k === 's') R.cam.y += v; if (k === 'a') R.cam.x -= v; if (k === 'd') R.cam.x += v; R.clampCam(G.sim.s.N); }
    else if (k === '+' || k === '=' || k === ';') R.zoomAt(1, null, null, G.sim.s.N);
    else if (k === '-') R.zoomAt(-1, null, null, G.sim.s.N);
    else if (k === 'p' || k === 'Pause') G.setSpeed(G.ui.speedIdx === 0 ? (G.ui.lastSpeed || 1) : 0);
    else if (k === ',') G.setSpeed(Math.max(0, G.ui.speedIdx - 1));
    else if (k === '.') G.setSpeed(Math.min(3, G.ui.speedIdx + 1));
    else if (k === 'v') G.uiApi.cycleOverlay(e.shiftKey);
    else if (k === 'b') G.uiApi.openDialog('budget');
    else if (k === 'l') G.uiApi.openDialog('policy');
    else if (k === 'g') G.uiApi.openDialog('graph');
    else if (k === 'm') G.uiApi.openDialog('goals');
    else if (k === 'h' || k === '?') G.uiApi.openDialog('help');
    else if (k === 'Home') { const en = G.sim.s.entry; if (en) R.centerOn(en.i + en.len, en.j); }
    else used = false;
    if (used) { e.preventDefault(); G.audio.unlock(); }
  });
  return { updatePreview };
}
