// お絵かき: 鉛筆・ブラシ・消しゴム・直線・四角・楕円・塗りつぶし・スポイト。ARCADIA-91 の16色と自由な色。
// 形はどれも1マスずつの点で描き、ぼかさない（ドット絵がにじまない）。網点塗りで、前の色と後ろの色を市松に混ぜられる。
// 拡大は 100%〜800%。400% 以上では1マスの格子を出す。PNG で仮想ドライブへ保存し、壁紙にもできる。計算は core/paint.mjs。
import * as P from '../core/paint.mjs';
import { ARCADIA, parseHex, toHex } from '../core/colors.mjs';
import { basename, dirname } from '../core/path.mjs';

const TOOLS = [
  ['pencil', '鉛筆', 'P'], ['brush', 'ブラシ', 'B'], ['eraser', '消しゴム', 'E'], ['line', '直線', 'L'],
  ['rect', '四角', 'R'], ['ellipse', '楕円', 'O'], ['fill', '塗りつぶし', 'F'], ['pick', 'スポイト', 'I'],
];
const ZOOMS = [1, 2, 4, 8];
const PAPER = [255, 253, 249, 255], CLEAR = [0, 0, 0, 0];
const rgbaOf = (hex) => { const c = parseHex(hex); return [c.r, c.g, c.b, 255]; };
const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="new"><span class="label">新規(<u>N</u>)...</span></div>
    <div class="menu-item" data-command="open"><span class="label">開く(<u>O</u>)...</span><span class="shortcut">Ctrl+O</span></div>
    <div class="menu-item" data-command="save"><span class="label">上書き保存(<u>S</u>)</span><span class="shortcut">Ctrl+S</span></div>
    <div class="menu-item" data-command="saveas"><span class="label">名前を付けて保存(<u>A</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="wall" data-status="保存してから、この絵をデスクトップの壁紙にします。"><span class="label">壁紙にする(<u>W</u>)</span></div>
    <div class="menu-item" data-command="export"><span class="label">パソコンへ書き出す(<u>E</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>X</u>)</span></div>
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="undo"><span class="label">元に戻す(<u>U</u>)</span><span class="shortcut">Ctrl+Z</span></div>
    <div class="menu-item" data-command="redo"><span class="label">やり直し(<u>R</u>)</span><span class="shortcut">Ctrl+Y</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="clear"><span class="label">全部消す(<u>L</u>)</span></div>
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    ${ZOOMS.map((z) => `<div class="menu-item radio" data-radio="zoom" data-command="zoom" data-zoom="${z}"><span class="label">${z * 100}%</span></div>`).join('')}
    <div class="menu-separator"></div>
    <div class="menu-item checked" data-toggle="check" data-command="grid"><span class="label">400% 以上で格子を出す(<u>G</u>)</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="about"><span class="label">お絵かきについて(<u>A</u>)</span></div>
  </div></div>
</div>`;

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  let path = args.path || null, img = P.makeImage(320, 240, PAPER), zoom = 2, tool = 'pencil', size = 1, fillShapes = false, useDither = false, showGrid = true;
  let front = '#241734', back = '#fffdf9', dirty = false, drag = null, raf = 0;
  const hist = new P.History(20);
  const win = wm.open({
    app: 'paint', icon: 'icons/paint.svg', className: 'app-paint', title: 'お絵かき', w: 780, h: 580, ...rect, args: path ? { path } : {},
    render(w) {
      w.body.innerHTML = MENU + `<div class="pt-main">
        <div class="pt-tools" role="toolbar" aria-label="道具" aria-orientation="vertical">
          ${TOOLS.map(([id, name, k]) => `<button type="button" class="flat pt-tool" data-tool="${id}" aria-pressed="false" title="${name}（${k}）">${name}</button>`).join('')}
          <div class="pt-opts">
            <label for="ptSize">太さ: <b data-size></b></label><input type="range" id="ptSize" min="1" max="16" value="1">
            <label><input type="checkbox" id="ptFill"> 図形を塗る(<u>Q</u>)</label>
            <label title="前の色と後ろの色を、1マスおきの市松に混ぜて塗ります"><input type="checkbox" id="ptDither"> 網点塗り(<u>D</u>)</label>
          </div>
        </div>
        <div class="pt-scroll" data-scroll><div class="pt-stage" data-stage><canvas class="pt-canvas" data-canvas></canvas><canvas class="pt-preview" data-preview aria-hidden="true"></canvas></div></div>
      </div>
      <div class="pt-palette">
        <div class="pt-current" title="左のボタンで塗る色（前）と、右のボタンで塗る色（後ろ）"><span class="pt-back" data-back></span><span class="pt-front" data-front></span></div>
        <div class="pt-swatches" role="group" aria-label="色（左クリックで前、右クリックで後ろ）">${ARCADIA.map((c) => `<button type="button" class="flat pt-sw" data-hex="${c.hex}" style="--c:${c.hex}" title="${c.name}" aria-label="${c.name}"></button>`).join('')}</div>
        <label class="pt-free"><span>自由な色(<u>C</u>):</span><input type="color" id="ptColor"></label>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:90px" data-pos></div><div class="status-field" style="width:110px" data-dim></div><div class="status-field" style="width:60px" data-zoomtxt></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      cancelAnimationFrame(raf);
      if (!dirty) return true;
      const a = await os.msgbox({ title: 'お絵かき', text: `${path ? '「' + basename(path) + '」' : '無題の絵'}は、変更が保存されていません。\n\n保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') return await save();
      return true;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const cv = q('[data-canvas]'), pv = q('[data-preview]'), stage = q('[data-stage]'), ctx = cv.getContext('2d'), pctx = pv.getContext('2d');
  const say = (t) => { q('.status-field[data-status]').textContent = t; };
  const setTitle = () => win.setTitle(`${dirty ? '*' : ''}${path ? basename(path) : '無題'} - お絵かき`);

  /* ---------- 表示 ---------- */
  function layout() {
    for (const c of [cv, pv]) { c.width = img.width; c.height = img.height; c.style.width = img.width * zoom + 'px'; c.style.height = img.height * zoom + 'px'; }
    stage.style.setProperty('--z', zoom + 'px');
    stage.classList.toggle('grid', showGrid && zoom >= 4);
    q('[data-dim]').textContent = `${img.width} × ${img.height}`;
    q('[data-zoomtxt]').textContent = zoom * 100 + '%';
    win.body.querySelectorAll('[data-command="zoom"]').forEach((m) => m.classList.toggle('checked', +m.dataset.zoom === zoom));
    draw();
  }
  const draw = () => { ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0); };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  function setTool(id) {
    tool = id;
    win.body.querySelectorAll('.pt-tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
    stage.dataset.tool = id;
    say(`${TOOLS.find((t) => t[0] === id)[1]}: 左のボタンで前の色、右のボタンで後ろの色で描きます。`);
  }
  function setColors() {
    q('[data-front]').style.background = front; q('[data-back]').style.background = back;
    q('[data-front]').title = '前の色 ' + front; q('[data-back]').title = '後ろの色 ' + back;
    q('#ptColor').value = front;
  }
  const colorFn = (btn) => {
    if (tool === 'eraser') return P.solid(CLEAR);
    const a = rgbaOf(btn === 2 ? back : front), b = rgbaOf(btn === 2 ? front : back);
    return useDither ? P.dither(a, b) : P.solid(a);
  };
  const snapshot = () => new Uint8ClampedArray(img.data);
  const restore = (d) => { img = { width: img.width, height: img.height, data: d }; draw(); };
  function changed() { if (!dirty) { dirty = true; setTitle(); } }

  /* ---------- 描く ---------- */
  const posOf = (e) => P.toImage(e.clientX, e.clientY, cv.getBoundingClientRect(), zoom);
  const stroke = (x0, y0, x1, y1, fn) => { const n = tool === 'pencil' ? 1 : size; for (const [x, y] of P.linePoints(x0, y0, x1, y1)) P.paint(img, P.brushPoints(x, y, n), fn); };
  const shapePts = (a, b) => tool === 'line' ? P.linePoints(a[0], a[1], b[0], b[1]).flatMap(([x, y]) => P.brushPoints(x, y, size))
    : tool === 'rect' ? P.rectPoints(a[0], a[1], b[0], b[1], fillShapes) : P.ellipsePoints(a[0], a[1], b[0], b[1], fillShapes);
  function showPreview(pts, fn) {
    pctx.clearRect(0, 0, pv.width, pv.height);
    const tmp = P.makeImage(img.width, img.height, CLEAR);
    P.paint(tmp, pts, fn);
    pctx.putImageData(new ImageData(tmp.data, tmp.width, tmp.height), 0, 0);
  }
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    // 入力の行き先は、つかまえる前にここで移す（つかまえたあとに移すと、Chrome がつかまえを外し、線が途切れる）
    if (!win.el.contains(document.activeElement)) win.body.focus({ preventScroll: true });
    const [x, y] = posOf(e), btn = e.button;
    if (tool === 'pick') {
      if (!P.inside(img, x, y)) return;
      const c = P.getPx(img, x, y);
      if (c[3] === 0) { sound.play('error'); say('透明のマスからは色を取れません。'); return; }
      const hex = toHex({ r: c[0], g: c[1], b: c[2] });
      if (btn === 2) back = hex; else front = hex;
      setColors(); sound.play('select'); say(`${btn === 2 ? '後ろ' : '前'}の色を ${hex} にしました。`); log('paint.pick', { hex }, 'ok');
      return;
    }
    if (tool === 'fill') {
      const before = snapshot(), n = P.floodFill(img, x, y, colorFn(btn));
      if (n) { hist.push(before); changed(); draw(); sound.play('pin'); log('paint.fill', { x, y, n }, 'ok'); say(`${n} マスを塗りました。`); }
      return;
    }
    try { cv.setPointerCapture(e.pointerId); } catch { /* つかまえられなくても、window で受けるので描ける */ }
    drag = { btn, start: [x, y], last: [x, y], before: snapshot(), fn: colorFn(btn) };
    addEventListener('pointermove', onDragMove); addEventListener('pointerup', finish); addEventListener('pointercancel', finish);
    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') { stroke(x, y, x, y, drag.fn); schedule(); }
  });
  // 位置の表示は canvas の上で。描いている間の動きは window で受ける（絵の外まで動かしても追えるように）
  cv.addEventListener('pointermove', (e) => { const [x, y] = posOf(e); q('[data-pos]').textContent = P.inside(img, x, y) ? `${x}, ${y}` : ''; });
  const onDragMove = (e) => {
    if (!drag) return;
    const [x, y] = posOf(e);
    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') {
      // 速く動かしても線が途切れないよう、間の位置（まとめられたイベント）もたどる
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ce of evs.length ? evs : [e]) { const p = posOf(ce); stroke(drag.last[0], drag.last[1], p[0], p[1], drag.fn); drag.last = p; }
      schedule();
    } else { drag.last = [x, y]; showPreview(shapePts(drag.start, drag.last), drag.fn); }
  };
  const finish = () => {
    if (!drag) return;
    removeEventListener('pointermove', onDragMove); removeEventListener('pointerup', finish); removeEventListener('pointercancel', finish);
    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') { P.paint(img, shapePts(drag.start, drag.last), drag.fn); pctx.clearRect(0, 0, pv.width, pv.height); }
    hist.push(drag.before); changed(); draw();
    log('paint.draw', { tool, from: drag.start, to: drag.last }, 'ok');
    drag = null;
  };
  // 描き終わりは、離したときと取り消されたときに決める。window で受けるので、絵の外で離しても終わる
  // （つかまえが外れた知らせ lostpointercapture は、離す前に来ることも来ないこともあったので使わない）
  cv.addEventListener('pointerleave', () => { q('[data-pos]').textContent = ''; });

  /* ---------- 道具と色 ---------- */
  q('.pt-tools').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) { setTool(b.dataset.tool); sound.play('key', TOOLS.findIndex((t) => t[0] === b.dataset.tool)); } });
  q('#ptSize').addEventListener('input', (e) => { size = +e.target.value; q('[data-size]').textContent = size; });
  q('#ptFill').addEventListener('change', (e) => { fillShapes = e.target.checked; });
  q('#ptDither').addEventListener('change', (e) => { useDither = e.target.checked; say(useDither ? '網点塗り: 前の色と後ろの色を、1マスおきに混ぜて塗ります。' : ''); });
  const sw = q('.pt-swatches');
  sw.addEventListener('click', (e) => { const b = e.target.closest('[data-hex]'); if (b) { front = b.dataset.hex; setColors(); } });
  sw.addEventListener('contextmenu', (e) => { const b = e.target.closest('[data-hex]'); if (b) { e.preventDefault(); back = b.dataset.hex; setColors(); sound.play('select'); } });
  q('#ptColor').addEventListener('input', (e) => { front = e.target.value; setColors(); });
  q('.pt-current').addEventListener('click', () => { [front, back] = [back, front]; setColors(); sound.play('select'); });

  /* ---------- ファイル ---------- */
  async function load(p) {
    try {
      const bmp = await createImageBitmap(await fs.readBlob(p));
      const w = Math.min(2048, bmp.width), h = Math.min(2048, bmp.height), off = new OffscreenCanvas(w, h), o = off.getContext('2d');
      o.drawImage(bmp, 0, 0);
      img = { width: w, height: h, data: o.getImageData(0, 0, w, h).data };
      path = p; dirty = false; hist.clear(); win.setArgs({ path });
      zoom = w <= 64 ? 8 : w <= 160 ? 4 : w <= 400 ? 2 : 1;
      layout(); setTitle(); os.addRecent(p); log('paint.open', { path: p, w, h }, 'ok');
      return true;
    } catch (err) { os.msgbox({ title: 'お絵かき', text: `「${basename(p)}」を絵として開けませんでした。\n\n${err.message}`, icon: 'error' }); log('paint.open', { path: p }, 'error: ' + err.message); return false; }
  }
  const pngBlob = () => new Promise((ok) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0); c.toBlob(ok, 'image/png'); });
  async function save() {
    if (!path || !/\.png$/i.test(path)) return saveAs();
    try { await fs.write(path, await pngBlob(), 'image/png'); dirty = false; setTitle(); os.addRecent(path); say(`「${path}」に保存しました。`); log('paint.save', { path }, 'ok'); return true; }
    catch (err) { os.msgbox({ title: 'お絵かき', text: err.message, icon: 'error' }); log('paint.save', { path }, 'error: ' + err.message); return false; }
  }
  async function saveAs() {
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/画像', name: path ? basename(path).replace(/\.\w+$/, '.png') : '無題.png', exts: ['.png'], typeLabel: 'PNG 画像' });
    if (!p) return false;
    path = p; win.setArgs({ path });
    return save();
  }
  async function newImage() {
    // 保存していない変更の確認を先に出す（大きさを選んだあとに聞かない）
    if (dirty) { const a = await os.msgbox({ title: 'お絵かき', text: '今の絵の変更は保存されていません。\n\n捨てて新しい絵にしますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] }); if (a !== 'はい') return; }
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog'; dlg.style.width = '330px';
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">新しい絵</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div>
      <div class="window-body"><fieldset><legend>大きさ</legend><div class="col">
        <label><input type="radio" name="sz" value="32x32"> 32 × 32（アイコン）</label><label><input type="radio" name="sz" value="320x240" checked> 320 × 240</label><label><input type="radio" name="sz" value="640x480"> 640 × 480</label></div></fieldset>
        <fieldset style="margin-top:8px"><legend>紙</legend><div class="col"><label><input type="radio" name="bg" value="paper" checked> 真珠白</label><label><input type="radio" name="bg" value="clear"> 透明</label></div></fieldset>
        <div class="button-row"><button type="button" class="default" data-close="ok">OK</button><button type="button" data-close="">キャンセル</button></div></div>`;
    document.body.append(dlg);
    const r = await w95.openDialog(dlg);
    const [w, h] = dlg.querySelector('[name=sz]:checked').value.split('x').map(Number), bg = dlg.querySelector('[name=bg]:checked').value;
    dlg.remove();
    if (r !== 'ok') return;
    img = P.makeImage(w, h, bg === 'clear' ? CLEAR : PAPER); path = null; dirty = false; hist.clear(); win.setArgs({ path: undefined });
    zoom = w <= 64 ? 8 : 2; layout(); setTitle(); log('paint.new', { w, h, bg }, 'ok');
  }
  const cmds = {
    new: newImage,
    open: async () => { const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/画像', exts: ['.png', '.jpg', '.jpeg', '.gif', '.webp'], typeLabel: '画像' }); if (p) load(p); },
    save, saveas: saveAs,
    async wall() {
      if ((dirty || !path) && !(await save())) return;
      os.saveSettings({ wallpaper: 'file:' + path });
      sound.play('notify'); say('この絵を壁紙にしました。'); log('paint.wallpaper', { path }, 'ok');
    },
    async export() { const a = document.createElement('a'); a.href = URL.createObjectURL(await pngBlob()); a.download = path ? basename(path).replace(/\.\w+$/, '.png') : '無題.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); log('paint.export', { path }, 'ok'); },
    close: () => win.close(),
    undo: () => { const d = hist.undo(snapshot()); if (d) { restore(d); changed(); sound.play('op'); } else sound.play('error'); },
    redo: () => { const d = hist.redo(snapshot()); if (d) { restore(d); changed(); sound.play('op'); } else sound.play('error'); },
    clear: () => { hist.push(snapshot()); img = P.makeImage(img.width, img.height, PAPER); changed(); draw(); sound.play('trash'); },
    zoom: (d) => { zoom = +d.item.dataset.zoom; layout(); },
    grid: (d) => { showGrid = d.checked; layout(); },
    about: () => os.msgbox({ title: 'お絵かきについて', icon: 'info', text: 'Future OS お絵かき 1.0\n\n形はどれも1マスずつの点で描くので、拡大してもにじみません。\n網点塗りで、2つの色を市松に混ぜられます。\n「壁紙にする」で、描いた絵をデスクトップの壁紙にできます。' }),
  };
  win.body.addEventListener('w95:command', (e) => cmds[e.detail.command]?.(e.detail));
  win.body.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'z') { e.preventDefault(); cmds.undo(); }
    else if (e.ctrlKey && k === 'y') { e.preventDefault(); cmds.redo(); }
    else if (e.ctrlKey && k === 's') { e.preventDefault(); save(); }
    else if (e.ctrlKey && k === 'o') { e.preventDefault(); cmds.open(); }
    else if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      const t = TOOLS.find((x) => x[2].toLowerCase() === k);
      if (t) { setTool(t[0]); sound.play('key', TOOLS.indexOf(t)); }
      if (k === '+' || k === ';') { zoom = ZOOMS[Math.min(3, ZOOMS.indexOf(zoom) + 1)]; layout(); }
      if (k === '-') { zoom = ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)]; layout(); }
    }
  });
  win.body.addEventListener('fos:drop-file', (e) => { if (/\.(png|jpe?g|gif|webp)$/i.test(e.detail.path)) load(e.detail.path); else os.openFile(e.detail.path); });
  // 窓を押したら（絵の上でも）、道具の切り替えのキーや Ctrl+Z をこの窓で受ける
  win.body.tabIndex = -1;
  win.el.addEventListener('pointerdown', () => setTimeout(() => { if (wm.getActive() === win && !win.el.contains(document.activeElement)) win.body.focus({ preventScroll: true }); }, 0));
  setTool('pencil'); setColors(); q('[data-size]').textContent = size;
  if (path) { if (!(await load(path))) { path = null; layout(); } } else layout();
  setTitle();
  log('paint.launch', { path }, 'ok');
  return win;
}
