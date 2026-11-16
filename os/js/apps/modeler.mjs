// ローポリ モデラー: Canvas 2D で面の塗りと陰影。物体・面・頂点を選び、移動・回転・拡大・押し出し・色塗り。.lpm 保存、OBJ+MTL の書き出しと取り込み
import * as M from '../core/mesh.mjs';
import { toOBJ, toMTL, fromOBJ } from '../core/obj.mjs';
import { basename, dirname, extname, stem } from '../core/path.mjs';

const PAL = ['#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0', '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'];
const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="new"><span class="label">新規(<u>N</u>)</span></div>
    <div class="menu-item" data-command="open"><span class="label">開く(<u>O</u>)...</span><span class="shortcut">Ctrl+O</span></div>
    <div class="menu-item" data-command="save"><span class="label">上書き保存(<u>S</u>)</span><span class="shortcut">Ctrl+S</span></div>
    <div class="menu-item" data-command="saveas"><span class="label">名前を付けて保存(<u>A</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="objsave" data-status="仮想ドライブへ OBJ と MTL の2つのファイルで書き出します。"><span class="label">OBJ 形式で書き出す(<u>E</u>)...</span></div>
    <div class="menu-item" data-command="objdl" data-status="パソコンへ OBJ と MTL を書き出します。ほかの 3D ソフトで開けます。"><span class="label">パソコンへ OBJ を書き出す(<u>X</u>)</span></div>
    <div class="menu-item" data-command="objpc"><span class="label">パソコンから OBJ を取り込む(<u>I</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>C</u>)</span></div>
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="undo"><span class="label">元に戻す(<u>U</u>)</span><span class="shortcut">Ctrl+Z</span></div>
    <div class="menu-item" data-command="redo"><span class="label">やり直し(<u>R</u>)</span><span class="shortcut">Ctrl+Y</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="dup"><span class="label">物体を複製(<u>D</u>)</span><span class="shortcut">Ctrl+D</span></div>
    <div class="menu-item" data-command="del"><span class="label">削除(<u>L</u>)</span><span class="shortcut">Del</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="selall"><span class="label">すべて選択(<u>A</u>)</span><span class="shortcut">Ctrl+A</span></div>
    <div class="menu-item" data-command="selnone"><span class="label">選択の解除(<u>N</u>)</span><span class="shortcut">Esc</span></div>
  </div></div>
  <div class="menu-title">追加(<u>A</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="add:cube"><span class="label">立方体(<u>C</u>)</span></div>
    <div class="menu-item" data-command="add:sphere"><span class="label">球(<u>S</u>)</span></div>
    <div class="menu-item" data-command="add:cyl"><span class="label">円柱(<u>Y</u>)</span></div>
    <div class="menu-item" data-command="add:cone"><span class="label">円すい(<u>O</u>)</span></div>
    <div class="menu-item" data-command="add:plane"><span class="label">板(<u>P</u>)</span></div>
  </div></div>
  <div class="menu-title">選択(<u>S</u>)<div class="menu" role="menu">
    <div class="menu-item radio checked" data-radio="m" data-command="mode:object"><span class="label">物体を選ぶ(<u>O</u>)</span><span class="shortcut">1</span></div>
    <div class="menu-item radio" data-radio="m" data-command="mode:face"><span class="label">面を選ぶ(<u>F</u>)</span><span class="shortcut">2</span></div>
    <div class="menu-item radio" data-radio="m" data-command="mode:vertex"><span class="label">頂点を選ぶ(<u>V</u>)</span><span class="shortcut">3</span></div>
  </div></div>
  <div class="menu-title">変形(<u>T</u>)<div class="menu" role="menu">
    <div class="menu-item radio checked" data-radio="t" data-command="tool:select"><span class="label">選ぶだけ(<u>Q</u>)</span><span class="shortcut">Q</span></div>
    <div class="menu-item radio" data-radio="t" data-command="tool:move"><span class="label">移動(<u>G</u>)</span><span class="shortcut">G</span></div>
    <div class="menu-item radio" data-radio="t" data-command="tool:rotate"><span class="label">回転(<u>R</u>)</span><span class="shortcut">R</span></div>
    <div class="menu-item radio" data-radio="t" data-command="tool:scale"><span class="label">拡大と縮小(<u>S</u>)</span><span class="shortcut">S</span></div>
    <div class="menu-item radio" data-radio="t" data-command="tool:paint"><span class="label">色を塗る(<u>P</u>)</span><span class="shortcut">P</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="extrude" data-status="選んだ面を外へ押し出します。そのあとドラッグで長さを変えられます。"><span class="label">面の押し出し(<u>E</u>)</span><span class="shortcut">E</span></div>
    <div class="menu-item" data-command="flip"><span class="label">面の向きを反転(<u>I</u>)</span></div>
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="view:persp"><span class="label">斜めから(<u>D</u>)</span><span class="shortcut">0</span></div>
    <div class="menu-item" data-command="view:front"><span class="label">正面から(<u>F</u>)</span></div>
    <div class="menu-item" data-command="view:top"><span class="label">上から(<u>T</u>)</span></div>
    <div class="menu-item" data-command="view:side"><span class="label">横から(<u>S</u>)</span></div>
    <div class="menu-item" data-command="frame"><span class="label">選んだ物に合わせる(<u>Z</u>)</span><span class="shortcut">Z</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item checked" data-toggle="check" data-command="grid"><span class="label">格子(<u>G</u>)</span></div>
    <div class="menu-item checked" data-toggle="check" data-command="wire"><span class="label">辺の線(<u>W</u>)</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="help"><span class="label">使い方(<u>H</u>)</span><span class="shortcut">F1</span></div>
    <div class="menu-item" data-command="about"><span class="label">モデラーについて(<u>A</u>)</span></div>
  </div></div>
</div>
<div class="toolbar">
  <button type="button" class="labeled" data-command="mode:object" aria-pressed="true" title="物体を選ぶ (1)"><span>物体</span></button>
  <button type="button" class="labeled" data-command="mode:face" aria-pressed="false" title="面を選ぶ (2)"><span>面</span></button>
  <button type="button" class="labeled" data-command="mode:vertex" aria-pressed="false" title="頂点を選ぶ (3)"><span>頂点</span></button>
  <div class="sep"></div>
  <button type="button" class="labeled" data-command="tool:select" aria-pressed="true" title="選ぶだけ (Q)"><span>選択</span></button>
  <button type="button" class="labeled" data-command="tool:move" aria-pressed="false" title="移動 (G)"><span>移動</span></button>
  <button type="button" class="labeled" data-command="tool:rotate" aria-pressed="false" title="回転 (R)"><span>回転</span></button>
  <button type="button" class="labeled" data-command="tool:scale" aria-pressed="false" title="拡大と縮小 (S)"><span>拡大</span></button>
  <button type="button" class="labeled" data-command="tool:paint" aria-pressed="false" title="色を塗る (P)"><span>塗る</span></button>
  <div class="sep"></div>
  <button type="button" class="labeled" data-command="extrude" title="面の押し出し (E)"><span>押し出し</span></button>
  <div class="sep"></div>
  <button type="button" data-command="undo" title="元に戻す"><img src="icons/undo.svg" alt=""></button>
</div>`;

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, esc } = os;
  let path = args.path || null, objects = [], active = 0, mode = 'object', tool = 'select', color = '#ff0000', sel = new Set(), dirty = false;
  const undo = [], redo = [];
  const cam = { yaw: 0.7, pitch: 0.45, dist: 6, target: [0, 0.3, 0] };
  const opt = { grid: true, wire: true };
  const snap = () => JSON.stringify({ objects, active });
  function push() { undo.push(snap()); if (undo.length > 60) undo.shift(); redo.length = 0; dirty = true; }
  function restoreSnap(s) { const d = JSON.parse(s); objects = d.objects; active = Math.min(d.active, objects.length - 1); sel.clear(); }
  async function load(p) {
    const ext = extname(p).toLowerCase();
    if (ext === '.obj') { objects = fromOBJ(await fs.readText(p)); }
    else { const d = await fs.readJSON(p); objects = d.objects || []; }
    active = 0; sel.clear(); undo.length = 0; redo.length = 0; dirty = false;
    path = ext === '.obj' ? null : p;
    log('modeler.open', { path: p, objects: objects.length }, 'ok');
  }
  if (path) { try { await load(path); } catch (e) { os.msgbox({ title: 'ローポリ モデラー', text: e.message, icon: 'error' }); path = null; } }
  if (!objects.length && !path) objects = [{ name: '立方体', mesh: M.paintFaces(M.cube(1), [0, 1, 2, 3, 4, 5], '#c0c0c0') }];
  let cv, x, list;
  const win = wm.open({
    app: 'modeler', icon: 'icons/modeler.svg', className: 'app-modeler', w: 760, h: 520, ...rect, args: path ? { path } : {},
    render(w) {
      w.body.innerHTML = MENU + `<div class="view-wrap"><canvas class="view" tabindex="0" aria-label="3D の作業場所。右ドラッグか、何もない所の左ドラッグで視点を回し、ホイールで寄る"></canvas>
        <div class="side"><label>物体(<u>B</u>):</label><select size="6" class="objlist" aria-label="物体の一覧"></select>
        <label>色:</label><div class="palette">${PAL.map((c) => `<button type="button" style="background:${c}" data-color="${c}" aria-label="${c}" aria-pressed="false"></button>`).join('')}</div>
        <label>好きな色: <input type="color" data-custom value="#ff0000"></label>
        <fieldset><legend>数で動かす</legend><div class="col"><span>矢印キー: 横と奥</span><span>PageUp/Down: 上下</span><span>Shift で細かく</span></div></fieldset></div></div>
        <div class="status-bar"><div class="status-field" data-s1>右ドラッグで視点を回し、ホイールで寄ります。</div><div class="status-field" style="width:170px" data-s2></div><div class="status-field" style="width:150px" data-s3></div><div class="size-grip"></div></div>`;
      cv = w.body.querySelector('canvas'); x = cv.getContext('2d'); list = w.body.querySelector('.objlist');
    },
    onClose: async () => {
      if (!dirty) return true;
      const a = await os.msgbox({ title: 'ローポリ モデラー', text: `${path ? basename(path) : '無題'} は変更されています。\n\n保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') return await save();
      return true;
    },
  });
  const B = (s) => win.body.querySelector(s), st = (k, v) => { B(`[data-${k}]`).textContent = v; };
  const title = () => win.setTitle(`${dirty ? '*' : ''}${path ? basename(path) : '無題'} - ローポリ モデラー`);

  /* ----- 視点と投影 ----- */
  let W = 1, H = 1, dpr = 1, proj = [];
  function basis() {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const fwd = [-sy * cp, -sp, -cy * cp], eye = [cam.target[0] - fwd[0] * cam.dist, cam.target[1] - fwd[1] * cam.dist, cam.target[2] - fwd[2] * cam.dist];
    const right = [cy, 0, -sy], up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    return { fwd, eye, right, up }; // up = right × fwd（正面から見て +y が上）
  }
  const F = () => (H * 0.5) / Math.tan(0.45);
  function toCam(p, b) { const d = [p[0] - b.eye[0], p[1] - b.eye[1], p[2] - b.eye[2]]; return [d[0] * b.right[0] + d[1] * b.right[1] + d[2] * b.right[2], d[0] * b.up[0] + d[1] * b.up[1] + d[2] * b.up[2], d[0] * b.fwd[0] + d[1] * b.fwd[1] + d[2] * b.fwd[2]]; }
  function toScreen(c) { const f = F(); return [W / 2 + (c[0] * f) / Math.max(0.05, c[2]), H / 2 - (c[1] * f) / Math.max(0.05, c[2])]; }
  const light = (() => { const l = [-0.4, 0.8, 0.45], n = Math.hypot(...l); return l.map((v) => v / n); })();
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`; };

  function draw() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1); W = Math.max(1, r.width); H = Math.max(1, r.height);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = '#2b2b3a'; x.fillRect(0, 0, W, H);
    const b = basis();
    if (opt.grid) {
      x.lineWidth = 1;
      for (let i = -5; i <= 5; i++) for (const [a, c] of [[[i, 0, -5], [i, 0, 5]], [[-5, 0, i], [5, 0, i]]]) {
        const ca = toCam(a, b), cc = toCam(c, b);
        if (ca[2] < 0.1 && cc[2] < 0.1) continue;
        const pa = toScreen(ca), pc = toScreen(cc);
        x.strokeStyle = i === 0 ? (a[0] === -5 ? '#c04848' : '#4870c0') : '#45455a';
        x.beginPath(); x.moveTo(...pa); x.lineTo(...pc); x.stroke();
      }
    }
    proj = [];
    objects.forEach((o, oi) => {
      if (o.hidden) return;
      const cam3 = o.mesh.v.map((p) => toCam(p, b)), scr = cam3.map(toScreen);
      o.mesh.f.forEach((f, fi) => {
        if (f.i.some((i) => cam3[i][2] < 0.06)) return;
        const n = M.faceNormal(o.mesh, fi), c = M.centroid(o.mesh, f.i);
        const toEye = [b.eye[0] - c[0], b.eye[1] - c[1], b.eye[2] - c[2]];
        if (n[0] * toEye[0] + n[1] * toEye[1] + n[2] * toEye[2] <= 0) return; // 裏向きの面は描かない
        const z = f.i.reduce((s, i) => s + cam3[i][2], 0) / f.i.length;
        const lit = 0.35 + 0.65 * Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
        proj.push({ oi, fi, z, pts: f.i.map((i) => scr[i]), col: shade(f.c || '#c0c0c0', lit) });
      });
    });
    proj.sort((a, c) => c.z - a.z);
    for (const p of proj) {
      x.beginPath(); p.pts.forEach((q, k) => x[k ? 'lineTo' : 'moveTo'](q[0], q[1])); x.closePath();
      x.fillStyle = p.col; x.fill();
      const isSelObj = mode === 'object' && sel.has(p.oi), isSelFace = mode === 'face' && p.oi === active && sel.has(p.fi);
      if (isSelFace) { x.fillStyle = 'rgba(255,160,0,.45)'; x.fill(); }
      if (opt.wire || mode !== 'object' || isSelObj) { x.strokeStyle = isSelObj ? '#ffd000' : mode !== 'object' && p.oi === active ? '#101018' : 'rgba(0,0,0,.35)'; x.lineWidth = isSelObj ? 1.5 : 1; x.stroke(); }
    }
    if (mode === 'vertex' && objects[active]) {
      const o = objects[active];
      o.mesh.v.forEach((p, i) => { const c = toCam(p, b); if (c[2] < 0.06) return; const s = toScreen(c); x.fillStyle = sel.has(i) ? '#ffa000' : '#000'; x.fillRect(s[0] - 3, s[1] - 3, 6, 6); x.strokeStyle = '#fff'; x.lineWidth = 1; x.strokeRect(s[0] - 3.5, s[1] - 3.5, 7, 7); });
    }
    const fc = objects.reduce((s, o) => s + o.mesh.f.length, 0), vc = objects.reduce((s, o) => s + o.mesh.v.length, 0);
    st('s2', `物体 ${objects.length} ・ 面 ${fc} ・ 頂点 ${vc}`);
    st('s3', `${{ object: '物体', face: '面', vertex: '頂点' }[mode]}を選ぶ ・ ${{ select: '選択', move: '移動', rotate: '回転', scale: '拡大', paint: '塗る' }[tool]}`);
  }
  let raf = 0;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
  function syncUI() {
    list.innerHTML = objects.map((o, i) => `<option value="${i}"${i === active ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
    win.body.querySelectorAll('.toolbar [data-command^="mode:"]').forEach((bt) => bt.setAttribute('aria-pressed', bt.dataset.command === 'mode:' + mode));
    win.body.querySelectorAll('.toolbar [data-command^="tool:"]').forEach((bt) => bt.setAttribute('aria-pressed', bt.dataset.command === 'tool:' + tool));
    win.body.querySelectorAll('.menu-item[data-radio="m"]').forEach((m) => m.classList.toggle('checked', m.dataset.command === 'mode:' + mode));
    win.body.querySelectorAll('.menu-item[data-radio="t"]').forEach((m) => m.classList.toggle('checked', m.dataset.command === 'tool:' + tool));
    win.body.querySelectorAll('.palette button').forEach((bt) => bt.setAttribute('aria-pressed', bt.dataset.color === color));
    B('[data-custom]').value = color; // 好きな色の見本も、いま塗る色にそろえる
    title(); redraw();
  }

  /* ----- 選ぶ ----- */
  function inPoly(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function pick(px, py) {
    if (mode === 'vertex') {
      const o = objects[active]; if (!o) return null;
      const b = basis(); let best = null, bd = 10;
      o.mesh.v.forEach((p, i) => { const c = toCam(p, b); if (c[2] < 0.06) return; const s = toScreen(c), d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = { oi: active, vi: i }; } });
      if (best) return best;
      for (let k = proj.length - 1; k >= 0; k--) if (proj[k].oi !== active && inPoly([px, py], proj[k].pts)) return { oi: proj[k].oi };
      return null;
    }
    for (let k = proj.length - 1; k >= 0; k--) if (inPoly([px, py], proj[k].pts)) return proj[k];
    return null;
  }
  // いま変形の対象になる頂点（物体ごと）
  function targets() {
    if (mode === 'object') return [...sel].map((oi) => ({ oi, vs: objects[oi].mesh.v.map((_, i) => i) }));
    const o = objects[active]; if (!o || !sel.size) return [];
    return [{ oi: active, vs: mode === 'face' ? M.vertsOfFaces(o.mesh, [...sel]) : [...sel] }];
  }
  function center(ts) {
    let s = [0, 0, 0], n = 0;
    for (const t of ts) { const c = M.centroid(objects[t.oi].mesh, t.vs); s = s.map((v, k) => v + c[k] * t.vs.length); n += t.vs.length; }
    return n ? s.map((v) => v / n) : [0, 0, 0];
  }
  function applyTransform(base, ts, kind, amount, c) {
    for (const t of ts) {
      let m = base[t.oi];
      if (kind === 'move') m = M.moveVerts(m, t.vs, amount);
      if (kind === 'rotate') m = M.rotateVerts(m, t.vs, amount.axis, amount.angle, c);
      if (kind === 'scale') m = M.scaleVerts(m, t.vs, amount, c);
      objects[t.oi].mesh = m;
    }
  }

  /* ----- 操作 ----- */
  let drag = null;
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    cv.focus();
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const hit = e.button === 0 ? pick(px, py) : null;
    if (e.button === 0 && tool === 'paint' && hit && hit.fi !== undefined) {
      push();
      const o = objects[hit.oi];
      o.mesh = mode === 'object' ? M.paintFaces(o.mesh, o.mesh.f.map((_, i) => i), color) : M.paintFaces(o.mesh, [hit.fi], color);
      os.sound.play('click'); syncUI(); return;
    }
    if (e.button === 0 && hit) {
      // 選ぶ（Shift で足す・外す）
      if (mode === 'object') { const k = hit.oi; if (e.shiftKey) sel.has(k) ? sel.delete(k) : sel.add(k); else if (!sel.has(k)) { sel.clear(); sel.add(k); } active = k; }
      else if (hit.vi === undefined && mode === 'vertex') { active = hit.oi; sel.clear(); } // 頂点の無い所: その物体の頂点を出す
      else {
        if (hit.oi !== active) { active = hit.oi; sel.clear(); } // 別の物体の面でも、1回押せばその面が選ばれる
        const k = mode === 'face' ? hit.fi : hit.vi;
        if (e.shiftKey) sel.has(k) ? sel.delete(k) : sel.add(k); else if (!sel.has(k)) { sel.clear(); sel.add(k); }
      }
      os.sound.play('select');
      syncUI();
    } else if (e.button === 0 && !e.shiftKey && tool === 'select') { if (sel.size) { sel.clear(); syncUI(); } }
    const transforming = e.button === 0 && hit && ['move', 'rotate', 'scale'].includes(tool) && sel.size;
    drag = { x: e.clientX, y: e.clientY, button: e.button, mode: transforming ? tool : e.button === 1 || (e.button === 0 && e.shiftKey && !hit) ? 'pan' : 'orbit', cam: { ...cam, target: cam.target.slice() }, started: false };
    if (transforming) { drag.base = objects.map((o) => o.mesh); drag.ts = targets(); drag.c = center(drag.ts); }
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.started && Math.hypot(dx, dy) < 3) return;
    if (!drag.started && drag.base) push();
    drag.started = true;
    const b = basis(), k = (cam.dist * 2 * Math.tan(0.45)) / H;
    if (drag.mode === 'orbit') { cam.yaw = drag.cam.yaw - dx * 0.01; cam.pitch = Math.max(-1.5, Math.min(1.5, drag.cam.pitch + dy * 0.01)); }
    else if (drag.mode === 'pan') { cam.target = drag.cam.target.map((v, i) => v - b.right[i] * dx * k + b.up[i] * dy * k); }
    else if (drag.mode === 'move') { const s = e.shiftKey ? 0.2 : 1; applyTransform(drag.base, drag.ts, 'move', b.right.map((v, i) => (v * dx - b.up[i] * dy) * k * s)); }
    else if (drag.mode === 'rotate') applyTransform(drag.base, drag.ts, 'rotate', { axis: e.shiftKey ? b.right : [0, 1, 0], angle: dx * 0.01 }, drag.c);
    else if (drag.mode === 'scale') applyTransform(drag.base, drag.ts, 'scale', Math.max(0.05, 1 + (dx - dy) * 0.006), drag.c);
    redraw();
  });
  cv.addEventListener('lostpointercapture', () => { if (drag && drag.base && drag.started) { title(); log('modeler.transform', { kind: drag.mode }, 'ok'); } drag = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(1, Math.min(60, cam.dist * (e.deltaY > 0 ? 1.12 : 0.89))); redraw(); }, { passive: false });
  new ResizeObserver(redraw).observe(cv);

  /* ----- 命令 ----- */
  async function save() {
    if (!path) return saveAs();
    try { await fs.write(path, { format: 'future-os-lpm', version: 1, objects }); dirty = false; os.addRecent(path); title(); st('s1', `保存しました: ${path}`); return true; }
    catch (e) { os.msgbox({ title: 'ローポリ モデラー', text: e.message, icon: 'error' }); return false; }
  }
  async function saveAs() {
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/モデル', name: path ? basename(path) : '無題.lpm', exts: ['.lpm'], typeLabel: 'ローポリ モデル' });
    if (!p) return false;
    path = p; win.setArgs({ path });
    return save();
  }
  function addShape(kind) {
    push();
    const m = { cube: () => M.cube(1), sphere: () => M.icosphere(0.6, 1), cyl: () => M.cylinder(10, 0.5, 1), cone: () => M.cone(10, 0.5, 1), plane: () => M.plane(2) }[kind]();
    const names = { cube: '立方体', sphere: '球', cyl: '円柱', cone: '円すい', plane: '板' };
    const off = objects.length * 0.3;
    objects.push({ name: names[kind] + (objects.length + 1), mesh: M.paintFaces(M.moveVerts(m, m.v.map((_, i) => i), [off, kind === 'plane' ? 0 : 0.5, 0]), m.f.map((_, i) => i), '#c0c0c0') });
    active = objects.length - 1; mode = 'object'; sel = new Set([active]);
    os.sound.play('drop'); syncUI();
  }
  function nudge(d) {
    const ts = targets(); if (!ts.length) return;
    push(); applyTransform(objects.map((o) => o.mesh), ts, 'move', d); title(); redraw();
  }
  function setView(v) {
    Object.assign(cam, { persp: { yaw: 0.7, pitch: 0.45 }, front: { yaw: 0, pitch: 0 }, top: { yaw: 0, pitch: 1.5 }, side: { yaw: Math.PI / 2, pitch: 0 } }[v]);
    redraw();
  }
  function frame() {
    const ts = targets().length ? targets() : objects.map((o, oi) => ({ oi, vs: o.mesh.v.map((_, i) => i) }));
    if (!ts.length) return;
    cam.target = center(ts);
    let r = 0.5; for (const t of ts) for (const i of t.vs) { const p = objects[t.oi].mesh.v[i]; r = Math.max(r, Math.hypot(p[0] - cam.target[0], p[1] - cam.target[1], p[2] - cam.target[2])); }
    cam.dist = Math.max(2, r * 3.2); redraw();
  }
  function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const base = () => (path ? stem(path) : '無題');
  const cmds = {
    new: () => os.launch('modeler'),
    open: async () => { const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/モデル', exts: ['.lpm', '.obj'], typeLabel: 'ローポリ モデルと OBJ' }); if (p) os.openFile(p, 'modeler'); },
    save, saveas: saveAs,
    objsave: async () => {
      const p = await os.fileDialog({ mode: 'save', dir: '/モデル', name: base() + '.obj', exts: ['.obj'], typeLabel: 'OBJ モデル' });
      if (!p) return;
      const mtl = stem(p) + '.mtl';
      await fs.write(p, toOBJ(objects, mtl)); await fs.write(dirname(p) + '/' + mtl, toMTL(objects));
      st('s1', `${basename(p)} と ${mtl} を書き出しました。`); log('modeler.objsave', { path: p }, 'ok');
    },
    objdl: () => { download(base() + '.obj', toOBJ(objects, base() + '.mtl')); setTimeout(() => download(base() + '.mtl', toMTL(objects)), 400); log('modeler.objdl', {}, 'ok'); },
    objpc: () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.obj'; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; push(); objects.push(...fromOBJ(await f.text())); active = objects.length - 1; sel.clear(); syncUI(); frame(); log('modeler.objpc', { name: f.name }, 'ok'); }; inp.click(); },
    close: () => win.close(),
    undo: () => { if (!undo.length) { os.sound.play('error'); return; } redo.push(snap()); restoreSnap(undo.pop()); dirty = true; syncUI(); },
    redo: () => { if (!redo.length) { os.sound.play('error'); return; } undo.push(snap()); restoreSnap(redo.pop()); dirty = true; syncUI(); },
    dup: () => { if (!objects[active]) return; push(); const o = JSON.parse(JSON.stringify(objects[active])); o.name += ' のコピー'; o.mesh = M.moveVerts(o.mesh, o.mesh.v.map((_, i) => i), [0.4, 0, 0.4]); objects.push(o); active = objects.length - 1; mode = 'object'; sel = new Set([active]); syncUI(); },
    del: () => {
      if (mode === 'object') { if (!sel.size) return; push(); objects = objects.filter((_, i) => !sel.has(i)); active = Math.max(0, Math.min(active, objects.length - 1)); }
      else if (mode === 'face' && sel.size) { push(); const o = objects[active]; o.mesh = M.deleteFaces(o.mesh, [...sel]); if (!o.mesh.f.length) objects.splice(active, 1); }
      else return;
      sel.clear(); os.sound.play('trash'); syncUI();
    },
    selall: () => { sel = new Set(mode === 'object' ? objects.map((_, i) => i) : mode === 'face' ? objects[active]?.mesh.f.map((_, i) => i) : objects[active]?.mesh.v.map((_, i) => i)); syncUI(); },
    selnone: () => { sel.clear(); syncUI(); },
    extrude: () => {
      if (mode !== 'face' || !sel.size) { st('s1', '押し出す面を選んでください（面を選ぶ: 2）。'); os.sound.play('error'); return; }
      push(); const o = objects[active];
      o.mesh = M.extrude(o.mesh, [...sel], 0.4); // 選んだ面の番号は押し出した先の面を指したまま
      tool = 'move'; os.sound.play('max'); st('s1', '押し出しました。そのままドラッグすると長さを変えられます。'); syncUI();
    },
    flip: () => { if (mode !== 'face' || !sel.size) return; push(); objects[active].mesh = M.flipFaces(objects[active].mesh, [...sel]); syncUI(); },
    frame, grid: (d) => { opt.grid = d.checked; redraw(); }, wire: (d) => { opt.wire = d.checked; redraw(); },
    help: () => os.msgbox({ title: 'ローポリ モデラーの使い方', icon: 'info', text: '・右ドラッグ（か何もない所の左ドラッグ）で視点を回し、ホイールで寄ります。Shift+左ドラッグで視点を平行に動かします。\n・1・2・3 で、物体・面・頂点のどれを選ぶかを切り替えます。\n・G 移動、R 回転（Shift で横の軸）、S 拡大。選んだ物の上からドラッグします。\n・面を選んで E で押し出し、そのままドラッグで長さを決めます。\n・P で色を塗ります。物体を選ぶ時は物体全体を、面を選ぶ時はその面だけを塗ります。\n・矢印キーと PageUp/PageDown で、選んだ物を少しずつ動かします。' }),
    about: () => os.msgbox({ title: 'モデラーについて', icon: 'info', text: 'Future OS ローポリ モデラー 1.0\n\n面の塗りと陰影は Canvas 2D だけで描いています。\nOBJ 形式で書き出すと、ほかの 3D ソフトで開けます。' }),
  };
  win.body.addEventListener('w95:command', (e) => {
    const c = e.detail.command;
    if (c.startsWith('add:')) addShape(c.slice(4));
    else if (c.startsWith('mode:')) { mode = c.slice(5); sel.clear(); syncUI(); }
    else if (c.startsWith('tool:')) { tool = c.slice(5); syncUI(); }
    else if (c.startsWith('view:')) setView(c.slice(5));
    else cmds[c]?.(e.detail);
  });
  win.body.querySelector('.toolbar').addEventListener('click', (e) => { const bt = e.target.closest('button[data-command]'); if (!bt) return; const c = bt.dataset.command; if (c.startsWith('mode:')) { mode = c.slice(5); sel.clear(); syncUI(); } else if (c.startsWith('tool:')) { tool = c.slice(5); syncUI(); } else cmds[c]?.(); });
  win.body.querySelector('.palette').addEventListener('click', (e) => { const bt = e.target.closest('[data-color]'); if (bt) { color = bt.dataset.color; tool = 'paint'; syncUI(); } });
  B('[data-custom]').addEventListener('input', (e) => { color = e.target.value; tool = 'paint'; syncUI(); });
  list.addEventListener('change', () => { active = +list.value; mode = 'object'; sel = new Set([active]); syncUI(); });
  list.addEventListener('dblclick', async () => {
    const o = objects[active]; if (!o) return;
    const dlg = document.createElement('dialog'); dlg.className = 'window dialog'; dlg.style.width = '300px';
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">物体の名前</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div><div class="window-body"><div class="form"><label for="on">名前(<u>N</u>):</label><input type="text" id="on" autofocus></div><div class="button-row"><button type="button" class="default" data-close="ok">OK</button><button type="button" data-close="">キャンセル</button></div></div>`;
    document.body.append(dlg); const inp = dlg.querySelector('#on'); inp.value = o.name;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); w95.closeDialog(dlg, 'ok'); } });
    const r = await w95.openDialog(dlg); const v = inp.value.trim(); dlg.remove();
    if (r === 'ok' && v) { push(); o.name = v; syncUI(); }
  });
  cv.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(), s = e.shiftKey ? 0.02 : 0.1, b = basis();
    if (e.ctrlKey && k === 'z') { e.preventDefault(); cmds.undo(); }
    else if (e.ctrlKey && k === 'y') { e.preventDefault(); cmds.redo(); }
    else if (e.ctrlKey && k === 'd') { e.preventDefault(); cmds.dup(); }
    else if (e.ctrlKey && k === 'a') { e.preventDefault(); cmds.selall(); }
    else if (e.ctrlKey && k === 's') { e.preventDefault(); save(); }
    else if (e.ctrlKey && k === 'o') { e.preventDefault(); cmds.open(); }
    else if (e.ctrlKey) return;
    else if (['1', '2', '3'].includes(k)) { mode = ['object', 'face', 'vertex'][+k - 1]; sel.clear(); syncUI(); }
    else if ({ q: 'select', g: 'move', r: 'rotate', s: 'scale', p: 'paint' }[k]) { tool = { q: 'select', g: 'move', r: 'rotate', s: 'scale', p: 'paint' }[k]; syncUI(); }
    else if (k === 'e') cmds.extrude();
    else if (k === 'z') frame();
    else if (k === '0') setView('persp');
    else if (e.key === 'Delete') cmds.del();
    else if (e.key === 'Escape') cmds.selnone();
    else if (e.key === 'F1') { e.preventDefault(); cmds.help(); }
    else if (e.key.startsWith('Arrow') || e.key.startsWith('Page')) {
      e.preventDefault();
      // 視点の向きに合わせて、画面の右・奥へ動かす（高さは変えない）
      const r = [b.right[0], 0, b.right[2]], f = [-b.right[2], 0, b.right[0]];
      const d = { ArrowRight: r, ArrowLeft: r.map((v) => -v), ArrowUp: f.map((v) => -v), ArrowDown: f, PageUp: [0, 1, 0], PageDown: [0, -1, 0] }[e.key];
      if (d) nudge(d.map((v) => v * s));
    }
  });
  win.body.addEventListener('fos:drop-file', (e) => os.openFile(e.detail.path));
  syncUI();
  cv.focus();
  return win;
}
