// 写真の現像: 仮想ドライブの JPEG・PNG・WebP を開き、明るさ・色・トーンカーブ・切り抜きと回転を調整して書き出す。
// 元の画像は書き換えない（非破壊）。調整の設定は、画像の横の「<元の名前>.fdev」に保存し、次に開くと読み込む。
// 処理は WebGL2 のシェーダー（photo-gl.mjs）で行い、WebGL2 が無いときは同じ式の 2D の代わりの処理（core の renderCPU）を使う。
// 計算（式・トーンカーブ・座標・ヒストグラム・.fdev の検証・見本）は core/photo.mjs。
import * as F from '../core/photo.mjs';
import { History } from '../core/paint.mjs';
import { basename, dirname } from '../core/path.mjs';
import { createEngine } from './photo-gl.mjs';

const SAMPLE = '/画像/見本の夕暮れ.jpg';
const PRESET_FILE = '/システム/現像の見本.json';
const OPEN_EXTS = ['.jpg', '.jpeg', '.png', '.webp', F.FDEV_EXT];
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;
const PROXY_MAX = 1600, MAX_PIXELS = 50e6;
const GROUPS = [['light', '明るさ'], ['color', '色'], ['finish', '仕上げ']];

const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="open"><span class="label">開く(<u>O</u>)...</span><span class="shortcut">Ctrl+O</span></div>
    <div class="menu-item" data-command="save" data-status="調整の設定を、画像の横の .fdev のファイルに保存します。元の画像は書き換えません。"><span class="label">設定を保存(<u>S</u>)</span><span class="shortcut">Ctrl+S</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="export"><span class="label">書き出す(<u>W</u>)...</span></div>
    <div class="menu-item" data-command="exportpc"><span class="label">パソコンへ書き出す(<u>E</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="sample"><span class="label">見本の写真を開く(<u>M</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>X</u>)</span></div>
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="undo"><span class="label">元に戻す(<u>U</u>)</span><span class="shortcut">Ctrl+Z</span></div>
    <div class="menu-item" data-command="redo"><span class="label">やり直し(<u>R</u>)</span><span class="shortcut">Ctrl+Y</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="reset" data-status="色の調整と、切り抜きと回転を、全部開いたときの状態に戻します。"><span class="label">全部の調整を戻す(<u>A</u>)</span></div>
    <div class="menu-item" data-command="savepreset"><span class="label">今の設定を見本にする(<u>P</u>)...</span></div>
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="cropmode"><span class="label">切り抜きと回転(<u>K</u>)</span><span class="shortcut">K</span></div>
    <div class="menu-item" data-toggle="check" data-command="split"><span class="label">左右に分けて比べる(<u>D</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item checked" data-toggle="check" data-command="engine" data-status="切ると、WebGL2 を使わずに同じ式で計算します（遅くなります）。"><span class="label">WebGL2 で速く処理する(<u>G</u>)</span></div>
  </div></div>
  <div class="menu-title">画像(<u>I</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="rotr"><span class="label">右へ 90° 回す(<u>R</u>)</span></div>
    <div class="menu-item" data-command="rotl"><span class="label">左へ 90° 回す(<u>L</u>)</span></div>
    <div class="menu-item" data-command="flip"><span class="label">左右を反転(<u>J</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="resetgeo"><span class="label">切り抜きと回転を戻す(<u>C</u>)</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="howto"><span class="label">使い方(<u>U</u>)</span></div>
    <div class="menu-item" data-command="about"><span class="label">写真の現像について(<u>A</u>)</span></div>
  </div></div>
</div>`;

const fmtVal = (d, v) => (d.id === 'exposure' ? (v > 0 ? '+' : '') + v.toFixed(2) + ' 段' : (v > 0 ? '+' : '') + v);
// 説明は data-hint に置く（title は 95.js が浮かぶ説明に移し替えて消すので、あとから読めない）
const sliderRow = (d, wid) => `<div class="ph-row" data-row="${d.id}" data-hint="${d.hint || ''}" title="${d.hint || ''}（ダブルクリックで 0 に戻します）">
  <label for="ph-${d.id}-${wid}">${d.name}</label>
  <input type="range" id="ph-${d.id}-${wid}" data-k="${d.id}" min="${d.min}" max="${d.max}" step="${d.step}" value="0" aria-valuetext="${fmtVal(d, 0)}">
  <input type="number" data-n="${d.id}" min="${d.min}" max="${d.max}" step="${d.step}" value="0" aria-label="${d.name}の数" inputmode="decimal">
</div>`;

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  let path = null, full = null, proxy = null, s = F.defaults(), committed = JSON.stringify(s), saved = committed, cropBase = { ...s.crop };
  let mode = 'edit', cropStart = null, compare = false, split = false, splitPos = 0.5, engine = null, ctx2d = null, wantGL = args.engine !== 'cpu';
  let raf = 0, histTimer = 0, sel = -1, userPresets = [], loading = false, lastMsg = '';
  const hist = new History(100);
  const win = wm.open({
    app: 'photo', icon: 'icons/photo.svg', className: 'app-photo', title: '写真の現像', w: 1060, h: 720, ...rect, args: {},
    render(w) {
      const wid = w.id;
      w.body.innerHTML = MENU + `
      <div class="ph-bar" role="toolbar" aria-label="よく使う操作">
        <button type="button" class="flat ph-btn" data-a="open">開く(<u>O</u>)</button>
        <button type="button" class="flat ph-btn" data-a="undo" disabled>元に戻す(<u>Z</u>)</button>
        <button type="button" class="flat ph-btn" data-a="redo" disabled>やり直し(<u>Y</u>)</button>
        <span class="ph-gap" aria-hidden="true"></span>
        <button type="button" class="flat ph-btn" data-a="cropmode" aria-pressed="false">切り抜きと回転(<u>K</u>)</button>
        <button type="button" class="flat ph-btn" data-a="compare" title="押している間だけ、色の調整をしない元の色を見せます（\\ キーでも）">押す間は元の色(<u>B</u>)</button>
        <button type="button" class="flat ph-btn" data-a="split" aria-pressed="false">左右で比べる(<u>D</u>)</button>
        <span class="ph-gap" aria-hidden="true"></span>
        <button type="button" class="flat ph-btn" data-a="save">設定を保存(<u>S</u>)</button>
        <button type="button" class="flat ph-btn ph-go" data-a="export">書き出す(<u>W</u>)...</button>
      </div>
      <div class="ph-main">
        <div class="ph-stage" data-stage>
          <div class="ph-view" data-view>
            <canvas class="ph-canvas" data-canvas></canvas>
            <div class="ph-cropbox" data-cropbox hidden tabindex="0" role="group" aria-label="切り抜く範囲。中を引くと動き、四隅を引くと大きさが変わります。矢印キーで動かし、Shift と矢印キーで大きさを変えます。">
              ${['tl', 'tr', 'bl', 'br'].map((h) => `<span class="ph-hd" data-h="${h}"></span>`).join('')}
            </div>
            <div class="ph-split" data-split hidden tabindex="0" role="slider" aria-label="比べる境目（左が元の色）" aria-valuemin="5" aria-valuemax="95" aria-valuenow="50"></div>
            <span class="ph-tag ph-tag-l" data-tag-l hidden>元の色</span><span class="ph-tag ph-tag-r" data-tag-r hidden>現像後</span>
          </div>
          <p class="ph-wait" data-wait hidden>読み込んでいます…</p>
        </div>
        <div class="ph-side">
          <div class="ph-histbox">
            <canvas class="ph-hist" data-hist width="256" height="90" role="img" aria-label="ヒストグラム"></canvas>
            <div class="ph-clip" data-clip></div>
          </div>
          <div class="ph-panel" data-panel>
            <details class="ph-sec" open><summary>見本</summary>
              <div class="ph-presets" data-presets></div>
              <div class="ph-userpresets" data-userpresets></div>
              <button type="button" class="flat ph-small" data-a="savepreset">今の設定を見本にする(<u>N</u>)...</button>
            </details>
            ${GROUPS.map(([g, name]) => `<details class="ph-sec" open data-sec="${g}"><summary>${name}</summary>
              ${F.SLIDERS.filter((d) => d.group === g).map((d) => sliderRow(d, wid)).join('')}
              ${g === 'color' ? `<label class="ph-check"><input type="checkbox" data-mono> 白黒(<u>M</u>)</label>` : ''}
            </details>${g === 'color' ? `<details class="ph-sec" open data-sec="curve"><summary>トーンカーブ</summary>
              <canvas class="ph-curve" data-curve width="232" height="232" tabindex="0" role="application" aria-label="トーンカーブ。押すと点を足し、点を引くと動きます。[ と ] で点を選び、矢印キーで動かし、Delete で消します。"></canvas>
              <div class="ph-cpoint"><label for="ph-cx-${wid}">入力</label><input type="number" id="ph-cx-${wid}" data-cx min="0" max="255" step="1"><label for="ph-cy-${wid}">出力</label><input type="number" id="ph-cy-${wid}" data-cy min="0" max="255" step="1">
              <button type="button" class="flat ph-small" data-a="curvereset">直線に戻す(<u>L</u>)</button></div>
            </details>` : ''}`).join('')}
            <details class="ph-sec" open data-sec="crop"><summary>切り抜きと回転</summary>
              <div class="ph-row ph-aspect"><label for="ph-aspect-${wid}">比率</label><select id="ph-aspect-${wid}" data-aspect>${F.ASPECTS.map((a) => `<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
              ${sliderRow({ ...F.ANGLE, hint: '傾いた水平線をまっすぐにします。四隅がはみ出さないように切り抜きが縮みます。' }, wid)}
              <div class="ph-btns">
                <button type="button" class="flat ph-small" data-a="rotl">左へ 90°(<u>Q</u>)</button>
                <button type="button" class="flat ph-small" data-a="rotr">右へ 90°(<u>R</u>)</button>
                <button type="button" class="flat ph-small" data-a="flip">左右反転(<u>J</u>)</button>
                <button type="button" class="flat ph-small" data-a="resetgeo">戻す(<u>C</u>)</button>
              </div>
              <div class="ph-btns" data-cropacts hidden>
                <button type="button" class="flat ph-small ph-go" data-a="cropdone">決める(<u>A</u>)</button>
                <button type="button" class="flat ph-small" data-a="cropcancel" title="Esc キーでもやめられます">やめる(<u>X</u>)</button>
              </div>
            </details>
          </div>
        </div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:150px" data-dim></div><div class="status-field" style="width:110px" data-engine></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      if (!(await askSave('閉じる前に'))) return false;
      return true;
    },
  });
  win.cleanup = () => { cancelAnimationFrame(raf); clearTimeout(histTimer); ro.disconnect(); engine?.dispose(); };
  const q = (x) => win.body.querySelector(x), qa = (x) => [...win.body.querySelectorAll(x)];
  const view = q('[data-view]'), stage = q('[data-stage]'), cropbox = q('[data-cropbox]'), curveCv = q('[data-curve]'), histCv = q('[data-hist]');
  let canvas = q('[data-canvas]');
  function say(t) { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m; }
  const dirty = () => saved !== JSON.stringify(F.normalize(s));
  const setTitle = () => win.setTitle(`${path && dirty() ? '*' : ''}${path ? basename(path) : '無題'} - 写真の現像`);
  const oriented = () => F.orientedSize(full.width, full.height, s.rot);

  /* ---------- 処理のしかた（WebGL2 か 2D か） ---------- */
  function setEngine(gl) {
    // canvas は一度 webgl2 を取ると 2d を取れないので、切り替えるたびに作り直す
    const fresh = () => {
      const c = document.createElement('canvas');
      c.className = 'ph-canvas'; c.dataset.canvas = ''; c.setAttribute('role', 'img'); c.setAttribute('aria-label', '現像した写真のプレビュー');
      canvas.replaceWith(c); canvas = c;
    };
    fresh();
    engine?.dispose(); engine = null; ctx2d = null;
    if (gl) {
      try { engine = createEngine(canvas, onGLLost); } catch (e) { log('photo.engine', { kind: 'webgl2' }, 'error: ' + e.message); engine = null; }
      if (engine) {
        try { if (proxy) engine.setProxy(proxy); } catch (e) { log('photo.engine', { kind: 'webgl2', upload: true }, 'error: ' + e.message); engine.dispose(); engine = null; }
      }
      if (!engine) fresh();
    }
    if (!engine) ctx2d = canvas.getContext('2d');
    const kind = engine ? 'webgl2' : 'cpu';
    win.el.dataset.engine = kind;
    q('[data-engine]').textContent = engine ? 'WebGL2' : '2D の処理';
    q('[data-engine]').title = engine ? 'GPU のシェーダーで計算しています。' : 'WebGL2 を使わずに、同じ式を 1 画素ずつ計算しています。';
    qa('[data-command="engine"]').forEach((m) => m.classList.toggle('checked', !!engine));
    log('photo.engine', { want: gl ? 'webgl2' : 'cpu' }, 'ok ' + kind);
    return !!engine;
  }
  function onGLLost() { log('photo.engine', { lost: true }, 'error: WebGL2 の描き先が失われました'); say('GPU の描き先が失われたので、2D の代わりの処理に切り替えました。'); setEngine(false); schedule(); }

  /* ---------- 描く ---------- */
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderNow(); }); };
  function renderNow() {
    if (!proxy) return;
    const fullFrame = mode === 'crop', out = F.outputSize(s, full.width, full.height, { full: fullFrame });
    const box = { w: Math.max(40, stage.clientWidth - 28), h: Math.max(40, stage.clientHeight - 28) };
    const css = F.fitSize(out.w, out.h, box.w, box.h), k = proxy.width / full.width, dpr = devicePixelRatio || 1;
    const pw = Math.max(1, Math.min(Math.round(css.w * dpr), Math.round(out.w * k) || 1)), ph = Math.max(1, Math.round((pw * out.h) / out.w));
    Object.assign(view.style, { width: css.w + 'px', height: css.h + 'px' });
    const opts = { full: fullFrame, bypass: compare, split: split && !compare && !fullFrame ? splitPos : -1 };
    try {
      if (engine && !engine.lost) engine.preview(s, pw, ph, opts);
      else if (ctx2d) {
        if (canvas.width !== pw) canvas.width = pw;
        if (canvas.height !== ph) canvas.height = ph;
        const img = F.renderCPU(proxy, s, pw, ph, opts);
        ctx2d.putImageData(new ImageData(img.data, pw, ph), 0, 0);
      }
    } catch (e) { log('photo.render', { pw, ph }, 'error: ' + e.message); say('描けませんでした: ' + e.message); }
    const done = F.outputSize(s, full.width, full.height);
    q('[data-dim]').textContent = `${done.w} × ${done.h} 画素`;
    q('[data-dim]').title = '書き出す画像の大きさ（切り抜いたあとの、元の大きさ）';
    drawCropBox(); drawSplit();
    clearTimeout(histTimer); histTimer = setTimeout(drawHistogram, 70);
    drawCurve();
  }
  function drawHistogram() {
    if (!proxy) return;
    const out = F.outputSize(s, full.width, full.height), sz = F.fitSize(out.w, out.h, 220, 220), k = proxy.width / full.width;
    const w = Math.max(1, Math.min(sz.w, Math.round(out.w * k))), h = Math.max(1, Math.round((w * out.h) / out.w));
    let img;
    try { img = engine && !engine.lost ? engine.readProxy(s, w, h, {}) : F.renderCPU(proxy, s, w, h); } catch (e) { log('photo.histogram', {}, 'error: ' + e.message); return; }
    const H = F.histogram(img.data), c = histCv.getContext('2d'), W = histCv.width, Ht = histCv.height;
    let max = 1;
    for (const a of [H.l, H.r, H.g, H.b]) for (let i = 1; i < 255; i++) if (a[i] > max) max = a[i];
    c.clearRect(0, 0, W, Ht);
    const area = (a, color) => { c.fillStyle = color; c.beginPath(); c.moveTo(0, Ht); for (let i = 0; i < 256; i++) c.lineTo(i, Ht - Math.min(1, a[i] / max) * (Ht - 2)); c.lineTo(255, Ht); c.closePath(); c.fill(); };
    area(H.l, 'rgb(203 188 224 / 0.9)');
    c.globalCompositeOperation = 'multiply';
    area(H.r, 'rgb(255 92 151 / 0.45)'); area(H.g, 'rgb(59 168 156 / 0.45)'); area(H.b, 'rgb(75 95 232 / 0.4)');
    c.globalCompositeOperation = 'source-over';
    const pct = (v) => (v * 100).toFixed(1) + '%';
    const third = (a, b) => { let n = 0; for (let i = a; i < b; i++) n += H.l[i]; return pct(n / Math.max(1, H.total)); };
    q('[data-clip]').textContent = `真っ黒 ${pct(H.clipLo)}・真っ白 ${pct(H.clipHi)}`;
    histCv.setAttribute('aria-label', `ヒストグラム。暗い所 ${third(0, 85)}、中くらい ${third(85, 171)}、明るい所 ${third(171, 256)}。`);
    win.el.dataset.histTotal = String(H.total);
  }

  /* ---------- 画面の値をそろえる ---------- */
  function syncUI() {
    for (const d of [...F.SLIDERS, F.ANGLE]) {
      const r = q(`[data-k="${d.id}"]`), n = q(`[data-n="${d.id}"]`), v = s[d.id];
      if (r && +r.value !== v) r.value = v;
      if (r) r.setAttribute('aria-valuetext', d.id === 'angle' ? v + ' 度' : fmtVal(d, v));
      if (n && document.activeElement !== n) n.value = v;
    }
    q('[data-mono]').checked = s.mono;
    q('[data-aspect]').value = s.aspect;
    if (sel >= s.curve.length) sel = -1;
    syncPointFields();
    q('[data-a="undo"]').disabled = !hist.canUndo; q('[data-a="redo"]').disabled = !hist.canRedo;
    setTitle();
  }
  // 1 つの操作が終わったら、元に戻すの記録に入れる（動かしている途中は入れない）
  function commit(what) {
    // 記録と保存は .fdev と同じ形（範囲の内、切り抜きは小数 6 桁）にそろえる。開き直したときと同じ画素になるように
    s = F.normalize(s);
    const now = JSON.stringify(s);
    // 水平を直すときは、傾ける前の切り抜きから縮め直す（0 度へ戻すと元の大きさに戻る）
    if (what !== 'angle') cropBase = { ...s.crop };
    if (now === committed) return;
    hist.push(committed); committed = now;
    syncUI();
    log('photo.adjust', { what }, 'ok');
  }
  const applySettings = (n) => { s = n; schedule(); };

  /* ---------- つまみと数の欄 ---------- */
  function setValue(id, v, done) {
    const d = id === 'angle' ? F.ANGLE : F.SLIDERS.find((x) => x.id === id);
    v = Math.min(d.max, Math.max(d.min, Number.isFinite(v) ? v : 0));
    s = { ...s, [id]: v };
    if (id === 'angle' && full) { const o = oriented(); s.crop = F.fitCrop(cropBase, o.w, o.h, v); }
    syncUI(); schedule();
    if (done) commit(id);
  }
  const panel = q('[data-panel]');
  panel.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (k) { setValue(k, +e.target.value, false); return; }
    if (e.target.dataset.n && e.target.value !== '') { const v = +e.target.value; if (Number.isFinite(v)) setValue(e.target.dataset.n, v, false); }
  });
  panel.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.k) { commit(t.dataset.k); say(`${t.closest('.ph-row').querySelector('label').textContent}: ${t.getAttribute('aria-valuetext')}`); }
    else if (t.dataset.n) { setValue(t.dataset.n, t.value === '' ? 0 : +t.value, true); }
    else if (t.matches('[data-mono]')) { s = { ...s, mono: t.checked }; schedule(); commit('mono'); say(t.checked ? '白黒にしました。' : '色を戻しました。'); }
    else if (t.matches('[data-aspect]')) setAspect(t.value);
    else if (t.matches('[data-cx], [data-cy]')) pointFromFields();
  });
  // ダブルクリック（つまみか名前）で既定の 0 に戻す
  panel.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.ph-row[data-row]');
    if (!row || e.target.matches('input[type="number"]')) return;
    setValue(row.dataset.row, 0, true); sound.play('select');
    say(`${row.querySelector('label').textContent}を 0 に戻しました。`);
  });
  panel.addEventListener('focusin', (e) => { const row = e.target.closest('.ph-row[data-hint]'); if (row && row.dataset.hint) say(row.dataset.hint + ' ダブルクリックで 0 に戻ります。'); });

  /* ---------- ドラッグ ----------
     動きと離すのは window で受ける（指が要素の外へ出ても追える）。setPointerCapture は頼みとして呼ぶだけにする。
     つかまえが外れた知らせ lostpointercapture は、離す前に来ることがあった（画面なしの Chrome で確かめた。お絵かきと同じ） */
  function track(e, el, move, end) {
    try { el.setPointerCapture(e.pointerId); } catch { /* つかまえられなくても window で受ける */ }
    const mv = (ev) => { if (ev.pointerId === e.pointerId) move(ev); };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      end(ev);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }

  /* ---------- トーンカーブ ---------- */
  const cctx = curveCv.getContext('2d');
  const CPAD = 8;
  const cxy = (e) => { const r = curveCv.getBoundingClientRect(), sx = curveCv.width / r.width; const x = ((e.clientX - r.left) * sx - CPAD) / (curveCv.width - 2 * CPAD), y = 1 - ((e.clientY - r.top) * sx - CPAD) / (curveCv.height - 2 * CPAD); return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]; };
  const toC = (x, y) => [CPAD + x * (curveCv.width - 2 * CPAD), CPAD + (1 - y) * (curveCv.height - 2 * CPAD)];
  function drawCurve() {
    const W = curveCv.width, H = curveCv.height, c = cctx;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#fffdf9'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#e3d8f0'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const [gx] = toC(i / 4, 0), [, gy] = toC(0, i / 4); c.beginPath(); c.moveTo(gx + 0.5, CPAD); c.lineTo(gx + 0.5, H - CPAD); c.moveTo(CPAD, gy + 0.5); c.lineTo(W - CPAD, gy + 0.5); c.stroke(); }
    c.strokeStyle = '#cbbce0'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(...toC(0, 0)); c.lineTo(...toC(1, 1)); c.stroke(); c.setLineDash([]);
    const lut = F.curveLUT(s.curve, 129);
    c.strokeStyle = '#241734'; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i < lut.length; i++) { const [x, y] = toC(i / (lut.length - 1), lut[i]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke();
    s.curve.forEach(([x, y], i) => { const [px, py] = toC(x, y); c.fillStyle = i === sel ? '#6bf2e3' : '#fffdf9'; c.strokeStyle = '#241734'; c.lineWidth = 2; c.fillRect(px - 5, py - 5, 10, 10); c.strokeRect(px - 5, py - 5, 10, 10); });
  }
  function nearestPoint(x, y) {
    const r = curveCv.getBoundingClientRect(), k = (curveCv.width - 2 * CPAD) / curveCv.width * r.width;
    let best = -1, bd = 12;
    s.curve.forEach(([px, py], i) => { const d = Math.hypot((px - x) * k, (py - y) * k); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function syncPointFields() {
    const p = s.curve[sel], cx = q('[data-cx]'), cy = q('[data-cy]');
    cx.disabled = cy.disabled = !p;
    if (document.activeElement !== cx) cx.value = p ? Math.round(p[0] * 255) : '';
    if (document.activeElement !== cy) cy.value = p ? Math.round(p[1] * 255) : '';
  }
  function pointFromFields() {
    if (sel < 0) return;
    const x = +q('[data-cx]').value / 255, y = +q('[data-cy]').value / 255;
    s = { ...s, curve: F.moveCurvePoint(s.curve, sel, Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0) };
    schedule(); commit('curve');
  }
  curveCv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); curveCv.focus({ preventScroll: true });
    const [x, y] = cxy(e);
    let i = nearestPoint(x, y);
    if (i < 0) {
      const r = F.addCurvePoint(s.curve, x, y);
      if (r) { s = { ...s, curve: r.points }; i = r.index; sound.play('pin'); }
      else { say('ここには点を足せません（端の点の外か、ほかの点に近すぎます）。'); return; }
    }
    sel = i; syncPointFields(); schedule();
    curveCv.classList.add('dragging');
    track(e, curveCv, (ev) => {
      const [mx, my] = cxy(ev);
      s = { ...s, curve: F.moveCurvePoint(s.curve, sel, mx, my) };
      syncPointFields(); schedule();
    }, () => {
      curveCv.classList.remove('dragging'); commit('curve');
      if (sel >= 0) say(`曲線の点: 入力 ${Math.round(s.curve[sel][0] * 255)} → 出力 ${Math.round(s.curve[sel][1] * 255)}。点をダブルクリックすると消えます。`);
    });
  });
  curveCv.addEventListener('dblclick', (e) => {
    const [x, y] = cxy(e), i = nearestPoint(x, y);
    if (i > 0 && i < s.curve.length - 1) { s = { ...s, curve: F.removeCurvePoint(s.curve, i) }; sel = -1; schedule(); commit('curve'); sound.play('trash'); say('曲線の点を消しました。'); }
  });
  curveCv.addEventListener('keydown', (e) => {
    const n = s.curve.length;
    if (e.key === '[' || e.key === ']') { sel = sel < 0 ? 0 : (sel + (e.key === ']' ? 1 : -1) + n) % n; }
    else if (e.key.startsWith('Arrow') && sel >= 0) {
      const st = (e.shiftKey ? 16 : 1) / 255, [x, y] = s.curve[sel];
      const nx = x + (e.key === 'ArrowRight' ? st : e.key === 'ArrowLeft' ? -st : 0), ny = y + (e.key === 'ArrowUp' ? st : e.key === 'ArrowDown' ? -st : 0);
      s = { ...s, curve: F.moveCurvePoint(s.curve, sel, nx, ny) };
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel > 0 && sel < n - 1) { s = { ...s, curve: F.removeCurvePoint(s.curve, sel) }; sel = -1; }
    else return;
    e.preventDefault(); e.stopPropagation();
    syncPointFields(); schedule();
    if (sel >= 0) say(`曲線の点 ${sel + 1}/${s.curve.length}: 入力 ${Math.round(s.curve[sel][0] * 255)} → 出力 ${Math.round(s.curve[sel][1] * 255)}`);
  });
  curveCv.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow') || e.key === 'Delete' || e.key === 'Backspace') commit('curve'); });

  /* ---------- 切り抜きと回転 ---------- */
  function drawCropBox() {
    cropbox.hidden = mode !== 'crop';
    if (mode !== 'crop') return;
    const c = s.crop;
    Object.assign(cropbox.style, { left: c.x * 100 + '%', top: c.y * 100 + '%', width: c.w * 100 + '%', height: c.h * 100 + '%' });
  }
  function setMode(m) {
    if (!full || m === mode) return;
    mode = m;
    view.classList.toggle('cropping', m === 'crop');
    q('[data-a="cropmode"]').setAttribute('aria-pressed', String(m === 'crop'));
    q('[data-cropacts]').hidden = m !== 'crop';
    if (m === 'crop') {
      cropStart = JSON.stringify(s); q('[data-sec="crop"]').open = true;
      q('[data-cropacts]').scrollIntoView({ block: 'nearest' }); // 「決める」のボタンまで見えるように
      say('四隅を引くと大きさが、中を引くと場所が変わります。Enter で決め、Esc でやめます。');
    }
    schedule();
    if (m === 'crop') requestAnimationFrame(() => cropbox.focus({ preventScroll: true }));
    log('photo.cropmode', { mode: m }, 'ok');
  }
  function cropDone() { if (mode !== 'crop') return; commit('crop'); setMode('edit'); sound.play('select'); const o = F.outputSize(s, full.width, full.height); say(`${o.w} × ${o.h} 画素に切り抜きました。`); }
  function cropCancel() { if (mode !== 'crop') return; s = JSON.parse(cropStart); syncUI(); setMode('edit'); say('切り抜きをやめました。'); }
  function setAspect(id) {
    if (!full) return;
    const o = oriented();
    s = { ...s, aspect: id, crop: F.aspectCrop(s.crop, id, o.w, o.h, s.angle) };
    schedule(); commit('aspect');
    say(id === 'free' ? '比率を自由にしました。' : `比率を ${F.ASPECTS.find((a) => a.id === id).name} にしました。`);
  }
  cropbox.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || mode !== 'crop') return;
    e.preventDefault();
    const handle = e.target.closest('[data-h]')?.dataset.h, r = view.getBoundingClientRect(), start = { x: e.clientX, y: e.clientY }, base = { ...s.crop }, o = oriented();
    const ratio = F.aspectRatioOf(s.aspect, o.w, o.h);
    cropbox.classList.add('dragging');
    track(e, cropbox, (ev) => {
      const dx = (ev.clientX - start.x) / r.width, dy = (ev.clientY - start.y) / r.height;
      const next = handle ? F.resizeCrop(base, handle, dx, dy, ratio, o.w, o.h) : { ...base, x: base.x + dx, y: base.y + dy };
      s = { ...s, crop: F.constrainCrop(s.crop, next, o.w, o.h, s.angle) };
      schedule();
    }, () => { cropbox.classList.remove('dragging'); commit('crop'); const out = F.outputSize(s, full.width, full.height); say(`切り抜く範囲: ${out.w} × ${out.h} 画素`); });
  });
  cropbox.addEventListener('keydown', (e) => {
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault(); e.stopPropagation();
    const o = oriented(), st = 0.01, dx = e.key === 'ArrowRight' ? st : e.key === 'ArrowLeft' ? -st : 0, dy = e.key === 'ArrowDown' ? st : e.key === 'ArrowUp' ? -st : 0;
    const next = e.shiftKey ? F.resizeCrop(s.crop, 'br', dx, dy, F.aspectRatioOf(s.aspect, o.w, o.h), o.w, o.h) : { ...s.crop, x: s.crop.x + dx, y: s.crop.y + dy };
    s = { ...s, crop: F.constrainCrop(s.crop, next, o.w, o.h, s.angle) };
    schedule();
  });
  cropbox.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow')) commit('crop'); });
  const rotate = (dir) => { if (!full) return; s = F.rotateSettings(s, dir); schedule(); commit('rotate'); sound.play('select'); say(dir > 0 ? '右へ 90° 回しました。' : '左へ 90° 回しました。'); };
  const flip = () => { if (!full) return; s = F.flipSettings(s); schedule(); commit('flip'); sound.play('select'); say('左右を反転しました。'); };
  const resetGeo = () => { if (!full) return; s = { ...s, crop: { x: 0, y: 0, w: 1, h: 1 }, aspect: 'free', angle: 0, rot: 0, flip: false }; schedule(); commit('resetgeo'); say('切り抜きと回転を戻しました。'); };

  /* ---------- 比べる ---------- */
  function drawSplit() {
    const on = split && !compare && mode !== 'crop', bar = q('[data-split]');
    bar.hidden = !on; q('[data-tag-r]').hidden = !on; q('[data-tag-l]').hidden = !(on || compare);
    q('[data-tag-l]').textContent = compare ? '元の色（離すと戻ります）' : '元の色';
    if (on) { bar.style.left = splitPos * 100 + '%'; bar.setAttribute('aria-valuenow', String(Math.round(splitPos * 100))); }
  }
  function setCompare(v) {
    if (compare === v || !full) return;
    compare = v; schedule();
    q('[data-a="compare"]').classList.toggle('active', v);
    if (v) { say('元の色を見せています。離すと現像後に戻ります。'); log('photo.compare', {}, 'ok'); }
  }
  function setSplit(v) {
    split = v; schedule();
    q('[data-a="split"]').setAttribute('aria-pressed', String(v));
    qa('[data-command="split"]').forEach((m) => m.classList.toggle('checked', v));
    say(v ? '左が元の色、右が現像後です。境目は引いて動かせます。' : '左右に分けるのをやめました。');
    log('photo.split', { on: v }, 'ok');
  }
  const cmpBtn = q('[data-a="compare"]');
  cmpBtn.addEventListener('pointerdown', (e) => { if (e.button === 0) { setCompare(true); track(e, cmpBtn, () => {}, () => setCompare(false)); } });
  cmpBtn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setCompare(true); } });
  cmpBtn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') setCompare(false); });
  const splitEl = q('[data-split]');
  splitEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const r = view.getBoundingClientRect();
    track(e, splitEl, (ev) => { splitPos = Math.min(0.95, Math.max(0.05, (ev.clientX - r.left) / r.width)); schedule(); }, () => say(`境目を ${Math.round(splitPos * 100)}% の所にしました。`));
  });
  splitEl.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowLeft' ? -0.05 : e.key === 'ArrowRight' ? 0.05 : 0;
    if (!d) return;
    e.preventDefault(); e.stopPropagation(); splitPos = Math.min(0.95, Math.max(0.05, splitPos + d)); schedule();
  });

  /* ---------- 見本（プリセット） ---------- */
  function presetButton(p, i, user) {
    return `<span class="ph-pre"><button type="button" class="flat ph-preset" data-preset="${user ? 'u' : 'b'}${i}" title="${esc(p.name)}の見本をかけます"><canvas width="84" height="56" aria-hidden="true"></canvas><span>${esc(p.name)}</span></button>${user ? `<button type="button" class="flat ph-del" data-delpreset="${i}" aria-label="見本「${esc(p.name)}」を消す" title="この見本を消します">×</button>` : ''}</span>`;
  }
  function renderPresets() {
    q('[data-presets]').innerHTML = F.PRESETS.map((p, i) => presetButton(p, i, false)).join('');
    q('[data-userpresets]').innerHTML = userPresets.map((p, i) => presetButton(p, i, true)).join('');
    drawThumbs();
  }
  // 見本ごとの小さな絵（今の画像に見本をかけた様子）。2D の処理で小さく描く
  function drawThumbs() {
    if (!proxy) return;
    const tw = 84, th = 56, base = { ...F.defaults(), rot: s.rot, flip: s.flip };
    qa('.ph-preset').forEach((b) => {
      const id = b.dataset.preset, p = id[0] === 'b' ? F.PRESETS[+id.slice(1)] : userPresets[+id.slice(1)];
      if (!p) return;
      const o = F.outputSize(base, proxy.width, proxy.height), sz = F.fitSize(o.w, o.h, tw, th);
      const img = F.renderCPU(proxy, F.applyPreset(base, p), sz.w, sz.h), c = b.querySelector('canvas');
      c.width = sz.w; c.height = sz.h;
      c.getContext('2d').putImageData(new ImageData(img.data, sz.w, sz.h), 0, 0);
    });
  }
  async function loadUserPresets() {
    try { userPresets = (await fs.exists(PRESET_FILE)) ? F.normalizePresets(await fs.readJSON(PRESET_FILE)) : []; }
    catch (e) { userPresets = []; log('photo.presets', { path: PRESET_FILE }, 'error: ' + e.message); }
    renderPresets();
  }
  async function saveUserPresets() {
    try { await fs.write(PRESET_FILE, JSON.stringify(userPresets, null, 1), 'application/json'); log('photo.presets.save', { count: userPresets.length }, 'ok'); }
    catch (e) { log('photo.presets.save', {}, 'error: ' + e.message); os.msgbox({ title: '写真の現像', text: '見本を保存できませんでした。\n\n' + e.message, icon: 'error' }); }
  }
  q('.ph-sec').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-preset]'), del = e.target.closest('[data-delpreset]');
    if (b && full) {
      const id = b.dataset.preset, p = id[0] === 'b' ? F.PRESETS[+id.slice(1)] : userPresets[+id.slice(1)];
      s = F.applyPreset(s, p); sel = -1; syncUI(); schedule(); commit('preset:' + p.name); sound.play('select');
      say(`見本「${p.name}」をかけました。戻すときは Ctrl+Z を押します。`); log('photo.preset', { name: p.name }, 'ok');
    }
    if (del) {
      const p = userPresets[+del.dataset.delpreset];
      const a = await os.msgbox({ title: '写真の現像', text: `見本「${p.name}」を消しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') return;
      userPresets.splice(+del.dataset.delpreset, 1); await saveUserPresets(); renderPresets(); say(`見本「${p.name}」を消しました。`);
    }
  });
  async function savePreset() {
    if (!full) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog'; dlg.style.width = '340px';
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">今の設定を見本にする</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div>
      <div class="window-body"><p style="margin:0 0 8px">色の調整（切り抜きと回転は除く）を、見本として残します。</p>
        <label for="phPresetName">見本の名前(<u>N</u>):</label><input type="text" id="phPresetName" maxlength="24" autocomplete="off" style="width:100%;margin-top:4px">
        <div class="button-row"><button type="button" class="default" data-close="ok">OK</button><button type="button" data-close="">キャンセル</button></div></div>`;
    document.body.append(dlg);
    const input = dlg.querySelector('input');
    input.value = `私の見本 ${userPresets.length + 1}`;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); w95.closeDialog(dlg, 'ok'); } });
    setTimeout(() => input.select(), 0);
    const r = await w95.openDialog(dlg), name = input.value.trim();
    dlg.remove();
    if (r !== 'ok' || !name) return;
    userPresets = F.normalizePresets([...userPresets, { name, settings: F.toneOnly(s) }]);
    await saveUserPresets(); renderPresets(); sound.play('pin'); say(`見本「${name}」を作りました。`);
  }

  /* ---------- 開く ---------- */
  async function decode(blob) {
    const bmp = await createImageBitmap(blob);
    try {
      if (bmp.width * bmp.height > MAX_PIXELS) throw new Error(`画素が多すぎます（${bmp.width} × ${bmp.height}）。5000 万画素までの画像を開けます。`);
      const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0);
      const fullImg = g.getImageData(0, 0, bmp.width, bmp.height);
      const k = Math.min(1, PROXY_MAX / Math.max(bmp.width, bmp.height)), pw = Math.max(1, Math.round(bmp.width * k)), ph = Math.max(1, Math.round(bmp.height * k));
      let proxyImg = fullImg;
      if (k < 1) {
        const pc = new OffscreenCanvas(pw, ph), pg = pc.getContext('2d', { willReadFrequently: true });
        pg.imageSmoothingEnabled = true; pg.imageSmoothingQuality = 'high';
        pg.drawImage(bmp, 0, 0, pw, ph);
        proxyImg = pg.getImageData(0, 0, pw, ph);
      }
      return { full: fullImg, proxy: proxyImg };
    } finally { bmp.close(); }
  }
  async function askSave(when) {
    if (!path || !dirty()) return true;
    const a = await os.msgbox({ title: '写真の現像', text: `「${basename(path)}」の調整の設定は、保存されていません。\n\n${when}、設定を保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
    if (a === 'キャンセル') return false;
    if (a === 'はい') return await save();
    return true;
  }
  async function open(p, given = null, givenFrom = null) {
    if (loading) return false;
    if (p.toLowerCase().endsWith(F.FDEV_EXT)) {
      try { const r = F.parseFdev(await fs.readText(p)); return open(r.source, r.settings, p); }
      catch (e) { os.msgbox({ title: '写真の現像', text: `「${basename(p)}」を開けませんでした。\n\n${e.message}`, icon: 'error' }); log('photo.open', { path: p }, 'error: ' + e.message); return false; }
    }
    if (!IMAGE_RE.test(p)) { os.msgbox({ title: '写真の現像', text: `「${basename(p)}」は開けません。\n\nJPEG・PNG・WebP の画像を開けます。`, icon: 'warning' }); return false; }
    if (path && p !== path && !(await askSave('ほかの画像を開く前に'))) return false;
    loading = true; q('[data-wait]').hidden = false;
    try {
      const img = await decode(await fs.readBlob(p));
      // 画像の横の .fdev（あれば）。保存済みかどうかは、この設定と同じかどうかで決める
      const side = F.fdevPathFor(p);
      let fileSettings = null, note = '';
      if (await fs.exists(side)) {
        try { fileSettings = F.parseFdev(await fs.readText(side)).settings; note = `前に保存した設定（${basename(side)}）を読み込みました。`; log('photo.fdev.load', { path: side }, 'ok'); }
        catch (e) { note = `設定のファイル（${basename(side)}）は読めなかったので、使いません: ${e.message}`; log('photo.fdev.load', { path: side }, 'error: ' + e.message); }
      }
      if (given) note = `「${basename(givenFrom || side)}」の設定で開きました。`;
      full = img.full; proxy = img.proxy; path = p;
      s = given ? F.normalize(given) : fileSettings || F.defaults();
      const o = oriented();
      s = F.normalize({ ...s, crop: F.fitCrop(s.crop, o.w, o.h, s.angle) });
      saved = JSON.stringify(fileSettings || F.normalize(F.defaults()));
      committed = JSON.stringify(s); cropBase = { ...s.crop }; hist.clear(); sel = -1; mode = 'edit'; view.classList.remove('cropping');
      q('[data-cropacts]').hidden = true; q('[data-a="cropmode"]').setAttribute('aria-pressed', 'false');
      if (engine) { try { engine.setProxy(proxy); } catch (e) { log('photo.engine', { upload: true }, 'error: ' + e.message); setEngine(false); } }
      win.setArgs({ path }); os.addRecent(p);
      syncUI(); renderPresets(); schedule();
      say(note || (p === SAMPLE ? '見本の写真です。右のつまみを動かすと色が変わります。つまみをダブルクリックすると 0 に戻ります。' : `「${basename(p)}」を開きました。右のつまみや見本で色を整えます。`));
      log('photo.open', { path: p, w: full.width, h: full.height, fdev: !!fileSettings, given: !!given }, 'ok');
      return true;
    } catch (e) {
      os.msgbox({ title: '写真の現像', text: `「${basename(p)}」を写真として開けませんでした。\n\n${e.message}`, icon: 'error' });
      log('photo.open', { path: p }, 'error: ' + e.message);
      return false;
    } finally { loading = false; q('[data-wait]').hidden = true; }
  }
  async function openDialog() {
    const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/画像', exts: OPEN_EXTS, typeLabel: '写真と現像の設定' });
    if (p) open(p);
  }

  /* ---------- 保存と書き出し ---------- */
  async function save() {
    if (!path) return false;
    const fp = F.fdevPathFor(path);
    try {
      await fs.write(fp, F.fdevText(path, s), 'application/json');
      saved = JSON.stringify(F.normalize(s)); setTitle();
      sound.play('select'); say(`設定を「${basename(fp)}」に保存しました。元の画像は変わりません。`);
      log('photo.save', { path: fp }, 'ok');
      return true;
    } catch (e) { os.msgbox({ title: '写真の現像', text: '設定を保存できませんでした。\n\n' + e.message, icon: 'error' }); log('photo.save', { path: fp }, 'error: ' + e.message); return false; }
  }
  // 元の大きさで現像した画像を、指定の形式の Blob にする
  async function encode(fmt, quality) {
    const { w, h } = F.outputSize(s, full.width, full.height);
    let img;
    if (engine && !engine.lost) {
      try { img = engine.exportFull(full, s, w, h); } catch (e) { log('photo.export.gpu', { w, h }, 'error: ' + e.message); img = null; }
    }
    if (!img) img = F.renderCPU(full, s, w, h);
    const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
    if (fmt === 'jpeg') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); const t = new OffscreenCanvas(w, h); t.getContext('2d').putImageData(new ImageData(img.data, w, h), 0, 0); g.drawImage(t, 0, 0); }
    else g.putImageData(new ImageData(img.data, w, h), 0, 0);
    const type = F.EXPORT_TYPES[fmt].mime, blob = await c.convertToBlob({ type, quality: quality / 100 });
    return { blob, w, h, fell: blob.type !== type };
  }
  let lastFmt = 'jpeg', lastQ = 90, closeToast = null;
  async function exportDialog(toPC = false) {
    if (!full) return;
    const { w, h } = F.outputSize(s, full.width, full.height), id = win.id;
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog ph-export'; dlg.style.width = '380px';
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">${toPC ? 'パソコンへ書き出す' : '書き出す'}</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div>
      <div class="window-body">
        <fieldset><legend>形式</legend><div class="col">
          ${Object.entries(F.EXPORT_TYPES).map(([k, t]) => `<label><input type="radio" name="phfmt-${id}" value="${k}"${k === lastFmt ? ' checked' : ''}> ${t.name}${k === 'jpeg' ? '（写真に向く。小さい）' : k === 'png' ? '（画質が落ちない。大きい）' : '（JPEG より小さい）'}</label>`).join('')}
        </div></fieldset>
        <div class="ph-qrow"><label for="phq-${id}">品質(<u>Q</u>):</label><input type="range" id="phq-${id}" min="50" max="100" step="1" value="${lastQ}"><output for="phq-${id}">${lastQ}</output></div>
        <p class="ph-dlgnote">大きさ: ${w} × ${h} 画素（切り抜いたあとの元の大きさ）。元の画像は変わりません。</p>
        <div class="button-row">${toPC ? '<button type="button" class="default" data-close="pc">パソコンへ書き出す(<u>P</u>)</button>' : '<button type="button" class="default" data-close="drive">保存する場所を選ぶ(<u>S</u>)...</button>'}<button type="button" data-close="">キャンセル</button></div>
      </div>`;
    document.body.append(dlg);
    const qr = dlg.querySelector('input[type="range"]'), out = dlg.querySelector('output');
    const syncQ = () => { const fmt = dlg.querySelector('input[type="radio"]:checked').value; qr.disabled = fmt === 'png'; out.textContent = fmt === 'png' ? '－' : qr.value; qr.setAttribute('aria-valuetext', fmt === 'png' ? 'PNG は品質を選びません' : qr.value); };
    dlg.addEventListener('input', syncQ); dlg.addEventListener('change', syncQ); syncQ();
    const r = await w95.openDialog(dlg);
    const fmt = dlg.querySelector('input[type="radio"]:checked').value, quality = +qr.value;
    dlg.remove();
    if (!r) return;
    lastFmt = fmt; lastQ = quality;
    let dest = null;
    if (r === 'drive') {
      dest = await os.fileDialog({ mode: 'save', dir: '/画像', name: F.exportName(path, fmt), exts: [F.EXPORT_TYPES[fmt].ext], typeLabel: `${F.EXPORT_TYPES[fmt].name} 画像` });
      if (!dest) return;
    }
    say('書き出しています…'); q('[data-wait]').hidden = false; q('[data-wait]').textContent = '書き出しています…';
    await new Promise((ok) => setTimeout(ok, 30));
    try {
      const t0 = performance.now(), res = await encode(fmt, quality);
      if (r === 'drive') {
        await fs.write(dest, res.blob, res.blob.type);
        os.addRecent(dest);
        // 前の書き出しの知らせは閉じてから出す（続けて書き出しても、知らせが積み重ならない）
        try { closeToast?.(); } catch { /* もう閉じている */ }
        closeToast = os.notify?.({ title: '写真を書き出しました', text: `${basename(dest)}（${res.w} × ${res.h}）`, actionLabel: 'ビューアで開く', onAction: () => os.openFile(dest, 'viewer') });
        say(`「${basename(dest)}」に書き出しました（${res.w} × ${res.h}、${fs.human(res.blob.size)}）。${res.fell ? ' このブラウザは選んだ形式で書けないので PNG にしました。' : ''}`);
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(res.blob); a.download = F.exportName(path, res.fell ? 'png' : fmt); a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        say(`パソコンへ「${a.download}」を書き出しました（${res.w} × ${res.h}）。`);
      }
      sound.play('shutter');
      log('photo.export', { dest: dest || 'pc', fmt, quality, w: res.w, h: res.h, size: res.blob.size, ms: Math.round(performance.now() - t0), engine: engine ? 'webgl2' : 'cpu' }, 'ok');
    } catch (e) { os.msgbox({ title: '写真の現像', text: '書き出せませんでした。\n\n' + e.message, icon: 'error' }); log('photo.export', { fmt }, 'error: ' + e.message); }
    finally { q('[data-wait]').hidden = true; q('[data-wait]').textContent = '読み込んでいます…'; }
  }

  /* ---------- 見本の写真（初めて開いたとき）。外のファイルを使わず、ここで描く ---------- */
  async function makeSample() {
    const W = 1280, H = 853, c = new OffscreenCanvas(W, H), g = c.getContext('2d'), rnd = F.mulberry32(19910706), hz = Math.round(H * 0.6);
    let gr = g.createLinearGradient(0, 0, 0, hz);
    [[0, '#1d1640'], [0.35, '#4a2f7a'], [0.62, '#b4507e'], [0.86, '#f08a5d'], [1, '#ffc27a']].forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, W, hz);
    const sx = W * 0.64, sy = hz - H * 0.05;
    gr = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.5);
    [[0, 'rgb(255 228 170 / 0.85)'], [0.25, 'rgb(255 170 110 / 0.35)'], [1, 'rgb(255 140 120 / 0)']].forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, W, hz);
    g.filter = 'blur(3px)';
    for (let i = 0; i < 16; i++) { // 細長い雲（下の側が夕日の色）。小さな楕円を少しずつずらして重ね、ふちをぼかす
      const cy = H * (0.1 + rnd() * 0.38), cx = W * rnd(), rw = W * (0.07 + rnd() * 0.2), rh = H * (0.006 + rnd() * 0.018);
      const lg = g.createLinearGradient(0, cy - rh * 2, 0, cy + rh * 2); lg.addColorStop(0, 'rgb(64 38 104 / 0.55)'); lg.addColorStop(1, 'rgb(255 150 140 / 0.55)');
      g.fillStyle = lg;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(cx + (rnd() - 0.5) * rw, cy + (rnd() - 0.5) * rh * 1.6, rw * (0.35 + rnd() * 0.5), rh * (0.6 + rnd() * 0.8), 0, 0, Math.PI * 2); g.fill(); }
    }
    g.filter = 'none';
    g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(sx, sy, H * 0.05, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3b2452'; g.beginPath(); g.moveTo(W * 0.5, hz); // 遠くの山
    for (let x = W * 0.5; x <= W; x += 8) g.lineTo(x, hz - H * (0.012 + 0.05 * Math.sin(((x - W * 0.5) / (W * 0.5)) * Math.PI * 0.9) ** 2 + 0.008 * Math.sin(x / 23)));
    g.lineTo(W, hz); g.closePath(); g.fill();
    gr = g.createLinearGradient(0, hz, 0, H);
    [[0, '#c8688a'], [0.12, '#6a3d78'], [1, '#120d2a']].forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, hz, W, H - hz);
    for (let i = 0; i < 1100; i++) { // 波
      const t = rnd() ** 1.6, y = hz + (H - hz) * t, len = 6 + 70 * t * rnd(), x = rnd() * W;
      g.fillStyle = rnd() < 0.5 ? `rgb(255 190 200 / ${0.06 + 0.1 * (1 - t)})` : `rgb(10 5 30 / ${0.12 + 0.2 * t})`;
      g.fillRect(x, y, len, 1 + 2 * t);
    }
    for (let i = 0; i < 320; i++) { // 夕日の光の帯（海に映る）
      const t = rnd(), y = hz + 2 + (H - hz) * t * t, spread = 8 + 170 * t * t, x = sx + (rnd() - 0.5) * 2 * spread, len = 8 + 56 * t * rnd();
      g.fillStyle = `rgb(255 ${(200 + 40 * rnd()) | 0} ${(140 + 60 * rnd()) | 0} / ${0.55 * (1 - t * 0.6)})`;
      g.fillRect(x - len / 2, y, len, 1 + 3 * t);
    }
    g.fillStyle = '#140c22'; g.beginPath(); g.moveTo(0, H * 0.52); // 左の岬
    g.bezierCurveTo(W * 0.1, H * 0.5, W * 0.16, H * 0.62, W * 0.22, H * 0.7); g.bezierCurveTo(W * 0.28, H * 0.78, W * 0.3, H * 0.9, W * 0.38, H); g.lineTo(0, H); g.closePath(); g.fill();
    const palm = (bx, by, tx, ty, s) => { // ヤシの木の影
      g.strokeStyle = '#140c22'; g.lineWidth = 7 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + (tx - bx) * 0.2, by - (by - ty) * 0.6, tx, ty); g.stroke();
      g.fillStyle = '#140c22';
      for (const a of [-2.7, -2.2, -1.6, -1.0, -0.45, 0.1]) {
        const ex = tx + Math.cos(a) * 95 * s, ey = ty + Math.sin(a) * 40 * s + 38 * s;
        g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo((tx + ex) / 2, ty + Math.sin(a) * 75 * s - 10 * s, ex, ey); g.quadraticCurveTo((tx + ex) / 2, ty + Math.sin(a) * 55 * s + 8 * s, tx, ty); g.fill();
      }
    };
    palm(W * 0.13, H * 0.66, W * 0.17, H * 0.3, 1.1); palm(W * 0.21, H * 0.74, W * 0.27, H * 0.43, 0.8);
    g.strokeStyle = '#21123a'; g.lineWidth = 2.2; g.lineCap = 'round'; // 鳥
    for (const [bx, by, bs] of [[0.42, 0.22, 1], [0.47, 0.19, 0.8], [0.51, 0.24, 0.7], [0.78, 0.15, 0.9]]) { const x = bx * W, y = by * H, k = bs * 12; g.beginPath(); g.moveTo(x - k, y - k * 0.3); g.quadraticCurveTo(x - k * 0.4, y - k * 0.7, x, y); g.quadraticCurveTo(x + k * 0.4, y - k * 0.7, x + k, y - k * 0.3); g.stroke(); }
    const id = g.getImageData(0, 0, W, H), d = id.data; // フィルムのような細かい粒
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(id, 0, 0);
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  }
  async function openSample() {
    try {
      if (!(await fs.exists(SAMPLE))) { await fs.write(SAMPLE, await makeSample(), 'image/jpeg'); log('photo.sample', { path: SAMPLE }, 'ok'); }
      return open(SAMPLE);
    } catch (e) { log('photo.sample', { path: SAMPLE }, 'error: ' + e.message); say('見本の写真を作れませんでした: ' + e.message); return false; }
  }

  /* ---------- 元に戻す・命令 ---------- */
  function undo() { const d = hist.undo(committed); if (!d) { sound.play('error'); return; } s = JSON.parse(d); committed = d; cropBase = { ...s.crop }; syncUI(); schedule(); sound.play('op'); say('ひとつ前に戻しました。'); log('photo.undo', {}, 'ok'); }
  function redo() { const d = hist.redo(committed); if (!d) { sound.play('error'); return; } s = JSON.parse(d); committed = d; cropBase = { ...s.crop }; syncUI(); schedule(); sound.play('op'); say('やり直しました。'); log('photo.redo', {}, 'ok'); }
  function resetAll() { if (!full) return; s = F.defaults(); const o = oriented(); s.crop = F.fitCrop(s.crop, o.w, o.h, 0); sel = -1; syncUI(); schedule(); commit('reset'); say('全部の調整を戻しました。Ctrl+Z で戻せます。'); }
  const cmds = {
    open: openDialog, save, export: () => exportDialog(false), exportpc: () => exportDialog(true), sample: openSample, close: () => win.close(),
    undo, redo, reset: resetAll, savepreset: savePreset,
    cropmode: () => (mode === 'crop' ? cropDone() : setMode('crop')), cropdone: cropDone, cropcancel: cropCancel,
    split: () => setSplit(!split),
    engine: (d) => {
      const want = typeof d?.checked === 'boolean' ? d.checked : !engine, ok = setEngine(want);
      wantGL = want; schedule();
      say(ok ? 'WebGL2 のシェーダーで処理します。' : want ? 'WebGL2 を使えないので、2D の代わりの処理で計算します。' : 'WebGL2 を使わずに、同じ式を 2D の処理で計算します。');
    },
    rotr: () => rotate(1), rotl: () => rotate(-1), flip, resetgeo: resetGeo,
    curvereset: () => { s = { ...s, curve: [[0, 0], [1, 1]] }; sel = -1; syncUI(); schedule(); commit('curve'); say('トーンカーブを直線に戻しました。'); },
    howto: () => os.msgbox({ title: '写真の現像の使い方', icon: 'info', text: '1. 「開く」で写真を選びます（窓に画像を落としても開けます）。\n2. 右の「見本」を押すか、つまみを動かして色を整えます。つまみをダブルクリックすると 0 に戻ります。\n3. 「押す間は元の色」を押している間は、調整する前の色が見えます。\n4. 「切り抜きと回転」で範囲を選び、傾きを直します。\n5. 「設定を保存」で調整を残し、「書き出す」で JPEG・PNG・WebP の画像にします。\n\n元の画像は書き換えません。' }),
    about: () => os.msgbox({ title: '写真の現像について', icon: 'info', text: 'Future OS 写真の現像 1.0\n\n明るさ・色・トーンカーブ・切り抜きと回転を、元の画像を変えずに調整します。\n調整の設定は、画像の横の「.fdev」のファイルに残ります。\n計算は WebGL2 のシェーダーで行い、使えないときは同じ式を 2D の処理で計算します。' }),
  };
  win.body.addEventListener('w95:command', (e) => cmds[e.detail.command]?.(e.detail));
  win.body.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled && b.dataset.a !== 'compare') { if (b.dataset.a === 'split') setSplit(!split); else cmds[b.dataset.a]?.(); } });
  win.body.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(), inField = e.target.matches('input, textarea, select');
    if (e.ctrlKey && !e.altKey && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (e.ctrlKey && !e.altKey && k === 'y') { e.preventDefault(); redo(); }
    else if (e.ctrlKey && !e.altKey && k === 's') { e.preventDefault(); save(); }
    else if (e.ctrlKey && !e.altKey && k === 'o') { e.preventDefault(); openDialog(); }
    else if (mode === 'crop' && e.key === 'Enter' && !inField) { e.preventDefault(); cropDone(); }
    else if (mode === 'crop' && e.key === 'Escape') { e.preventDefault(); cropCancel(); }
    else if (inField || e.ctrlKey || e.altKey || e.metaKey) return;
    else if (k === 'k') { e.preventDefault(); cmds.cropmode(); }
    else if ((e.code === 'Backslash' || e.code === 'IntlYen' || e.key === '\\' || e.key === '¥') && !e.repeat) { e.preventDefault(); setCompare(true); }
  });
  win.body.addEventListener('keyup', (e) => { if (e.code === 'Backslash' || e.code === 'IntlYen' || e.key === '\\' || e.key === '¥') setCompare(false); });
  // 窓へ落とした画像を開く（デスクトップのアイコンと、パソコンのファイル）
  win.body.addEventListener('fos:drop-file', (e) => { const p = e.detail.path; if (IMAGE_RE.test(p) || p.toLowerCase().endsWith(F.FDEV_EXT)) open(p); else os.openFile(p); });
  win.body.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; stage.classList.add('drop-ok'); } });
  win.body.addEventListener('dragleave', (e) => { if (!win.body.contains(e.relatedTarget)) stage.classList.remove('drop-ok'); });
  win.body.addEventListener('drop', async (e) => {
    const f = [...(e.dataTransfer?.files || [])].find((x) => IMAGE_RE.test(x.name));
    stage.classList.remove('drop-ok');
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    if (!f) { say('JPEG・PNG・WebP の画像を落としてください。'); sound.play('error'); return; }
    try { const name = await fs.freeName('/画像', f.name), p = '/画像/' + name; await fs.write(p, f, f.type); sound.play('drop'); log('photo.import', { path: p, size: f.size }, 'ok'); open(p); }
    catch (err) { log('photo.import', { name: f.name }, 'error: ' + err.message); say('取り込めませんでした: ' + err.message); }
  });
  const ro = new ResizeObserver(() => schedule());
  ro.observe(stage);
  win.body.tabIndex = -1;

  setEngine(wantGL);
  if (wantGL && !engine) say('この画面では WebGL2 を使えないので、同じ式の 2D の代わりの処理で計算します。');
  await loadUserPresets();
  const ok = args.path ? await open(args.path) : await openSample();
  if (!ok && !full) say('「開く」で写真を選んでください。');
  if (engine === null && wantGL) say((lastMsg || '').trim() + ' （WebGL2 を使えないので、2D の代わりの処理で計算しています）');
  log('photo.launch', { path: args.path || null, engine: engine ? 'webgl2' : 'cpu' }, 'ok');
  return win;
}
