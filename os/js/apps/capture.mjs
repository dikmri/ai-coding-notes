// 画面キャプチャ: ブラウザの画面共有の許可をもらって1コマ撮り、PNG で /画像 に保存する。
// 撮るまでの待ち時間（すぐ・3秒・5秒）、撮る間は自分の窓を隠す、撮ったあとで四角く切り抜く（元に戻せる）、お絵かきで開く、コピー。
// 1コマ撮ったら、すぐに画面共有を止める。計算は core/capture.mjs。
import * as K from '../core/capture.mjs';
import { basename } from '../core/path.mjs';

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound } = os;
  let shot = null, history = [], sel = null, path = null, busy = false, lastMsg = '';
  const win = wm.open({
    app: 'capture', icon: 'icons/capture.svg', className: 'app-capture', title: '画面キャプチャ', w: 680, h: 520, ...rect, args: {},
    render(w) {
      w.body.innerHTML = `<div class="cap-main">
        <div class="cap-bar">
          <label for="capWait-${w.id}">待ち時間(<u>W</u>):</label><select id="capWait-${w.id}" data-wait><option value="0">すぐ</option><option value="3" selected>3秒後</option><option value="5">5秒後</option></select>
          <label class="cap-hide"><input type="checkbox" data-hide checked> 撮る間は自分の窓を隠す(<u>H</u>)</label>
          <button type="button" class="default" data-a="shoot">撮る(<u>C</u>)</button>
        </div>
        <div class="cap-stage" data-stage>
          <p class="cap-empty" data-empty>「撮る」を押すと、ブラウザが撮る画面を聞きます。このタブ（Future OS）を選ぶと、OS の画面を撮れます。</p>
          <div class="cap-canvas-box" data-box hidden><canvas class="cap-canvas" data-canvas></canvas><div class="cap-sel" data-sel hidden>${['tl', 'tr', 'bl', 'br'].map((h) => `<span class="cap-handle" data-h="${h}"></span>`).join('')}</div></div>
          <div class="cap-count" data-count hidden aria-live="assertive"></div>
        </div>
        <p class="cap-msg" data-msg hidden></p>
        <div class="cap-actions">
          <button type="button" data-a="crop" disabled>切り抜く(<u>K</u>)</button>
          <button type="button" data-a="undo" disabled>元に戻す(<u>Z</u>)</button>
          <button type="button" data-a="save" disabled>保存(<u>S</u>)...</button>
          <button type="button" data-a="paint" disabled>お絵かきで開く(<u>E</u>)</button>
          <button type="button" data-a="copy" disabled>コピー(<u>Y</u>)</button>
        </div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:150px" data-dim></div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const cv = q('[data-canvas]'), ctx = cv.getContext('2d'), selEl = q('[data-sel]'), box = q('[data-box]');
  function say(t) { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m; }
  const showMsg = (t) => { const m = q('[data-msg]'); m.textContent = t || ''; m.hidden = !t; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- 撮る ---------- */
  async function shoot() {
    if (busy) return;
    if (!navigator.mediaDevices?.getDisplayMedia) { showMsg(K.errorText({ name: 'NotSupportedError' })); sound.play('error'); return; }
    busy = true; showMsg('');
    let stream;
    // 画面共有は、押したその場で聞く（待ち時間のあとでは、ブラウザが許さない）
    // 大きさを伝えないと、Chrome は小さめ（タブなら 800×500 ほど）で渡すので、画面の実際の画素数を ideal で伝える
    const dpr = devicePixelRatio || 1, W = Math.round(Math.max(screen.width, innerWidth) * dpr), H = Math.round(Math.max(screen.height, innerHeight) * dpr);
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser', width: { ideal: W }, height: { ideal: H } }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' }); }
    catch (e) { busy = false; showMsg(K.errorText(e)); sound.play('notify'); say('撮りませんでした。'); log('capture.share', { name: e.name }, 'error: ' + e.message); return; }
    const wait = +q('[data-wait]').value, hide = q('[data-hide]').checked;
    log('capture.share', { wait, hide, label: stream.getVideoTracks()[0]?.label }, 'ok');
    try {
      const video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.srcObject = stream;
      await video.play();
      if (hide) { await win.minimize(); await sleep(250); }
      // 待ち時間: 1秒ずつ音の高さを上げて知らせる（窓を隠しているときは音だけ）
      const cnt = q('[data-count]');
      for (let s = wait; s > 0; s--) { cnt.hidden = hide; cnt.textContent = String(s); sound.play('key', 2 + (wait - s) * 2); say(`${s} 秒後に撮ります。`); await sleep(1000); }
      cnt.hidden = true;
      await sleep(hide ? 120 : 0);
      await new Promise((r) => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => r()) : setTimeout(r, 100)));
      const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      shot = c; history = []; sel = null; path = null;
      sound.play('shutter');
      log('capture.shot', { w: c.width, h: c.height }, 'ok');
    } catch (e) { showMsg(K.errorText(e)); log('capture.shot', {}, 'error: ' + e.message); }
    finally {
      stream.getTracks().forEach((t) => t.stop()); // 1コマ撮ったら、すぐに画面共有を止める
      if (win.min) await win.restore();
      win.focus(); busy = false;
    }
    if (shot) { render(); say('撮りました。ドラッグで切り抜く範囲を選べます。'); }
  }

  /* ---------- プレビューと切り抜き ---------- */
  let scale = 1;
  function render() {
    q('[data-empty]').hidden = !!shot; box.hidden = !shot;
    if (!shot) return update();
    const stage = q('[data-stage]'), maxW = stage.clientWidth - 16, maxH = stage.clientHeight - 16;
    scale = Math.min(1, maxW / shot.width, maxH / shot.height);
    cv.width = shot.width; cv.height = shot.height;
    cv.style.width = Math.round(shot.width * scale) + 'px'; cv.style.height = Math.round(shot.height * scale) + 'px';
    ctx.drawImage(shot, 0, 0);
    q('[data-dim]').textContent = `${shot.width} × ${shot.height}`;
    drawSel(); update();
  }
  function drawSel() {
    selEl.hidden = !sel;
    if (sel) Object.assign(selEl.style, { left: sel.x + 'px', top: sel.y + 'px', width: sel.w + 'px', height: sel.h + 'px' });
  }
  function update() {
    const has = !!shot, b = (a) => q(`[data-a="${a}"]`);
    b('crop').disabled = !(has && sel && sel.w > 4 && sel.h > 4); b('undo').disabled = !history.length;
    b('save').disabled = !has; b('paint').disabled = !has; b('copy').disabled = !has;
    win.setTitle(`画面キャプチャ${path ? ' - ' + basename(path) : ''}`);
  }
  // プレビューの上でドラッグ: 新しく範囲を選ぶ。四隅のつまみ: 大きさを変える
  box.addEventListener('pointerdown', (e) => {
    if (!shot || e.button !== 0) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect(), handle = e.target.closest('[data-h]')?.dataset.h, start = { x: e.clientX, y: e.clientY }, base = sel && { ...sel };
    const px = (ev) => [Math.max(0, Math.min(r.width, ev.clientX - r.left)), Math.max(0, Math.min(r.height, ev.clientY - r.top))];
    const [x0, y0] = px(e);
    const move = (ev) => {
      if (handle && base) sel = K.resizeRect(base, handle, ev.clientX - start.x, ev.clientY - start.y, 8);
      else { const [x1, y1] = px(ev); sel = K.normRect(x0, y0, x1, y1); }
      drawSel(); update();
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); if (sel && (sel.w < 4 || sel.h < 4)) sel = null; drawSel(); update(); if (sel) say(`範囲: ${Math.round(sel.w / scale)} × ${Math.round(sel.h / scale)}。「切り抜く」で決めます。`); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  function crop() {
    const r = sel && K.clampRect(K.toImageRect(sel, scale), shot.width, shot.height);
    if (!r) return;
    history.push(shot);
    const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
    c.getContext('2d').drawImage(shot, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    shot = c; sel = null; path = null; render(); sound.play('select'); say(`${r.w} × ${r.h} に切り抜きました。`); log('capture.crop', r, 'ok');
  }
  function undo() { if (!history.length) return; shot = history.pop(); sel = null; path = null; render(); sound.play('op'); say('切り抜く前に戻しました。'); }

  /* ---------- 保存・お絵かき・コピー ---------- */
  const pngBlob = () => new Promise((ok) => shot.toBlob(ok, 'image/png'));
  async function save() {
    const p = await os.fileDialog({ mode: 'save', dir: '/画像', name: K.defaultName(new Date()), exts: ['.png'], typeLabel: 'PNG 画像' });
    if (!p) return null;
    try {
      await fs.write(p, await pngBlob(), 'image/png');
      path = p; os.addRecent(p); update(); say(`「${basename(p)}」を保存しました。`); log('capture.save', { path: p, w: shot.width, h: shot.height }, 'ok');
      os.notify?.({ title: '画面を保存しました', text: basename(p), actionLabel: 'ビューアで開く', onAction: () => os.openFile(p, 'viewer') });
      return p;
    } catch (e) { os.msgbox({ title: '画面キャプチャ', text: e.message, icon: 'error' }); log('capture.save', { path: p }, 'error: ' + e.message); return null; }
  }
  async function toPaint() { const p = path || (await save()); if (p) { os.openFile(p, 'paint'); log('capture.paint', { path: p }, 'ok'); } }
  async function copy() {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]); say('画像をコピーしました。'); log('capture.copy', {}, 'ok'); }
    catch (e) { say('コピーできませんでした。'); log('clipboard.write', {}, 'error: ' + e.message); }
  }
  const acts = { shoot, crop, undo, save, paint: toPaint, copy };
  win.body.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) acts[b.dataset.a](); });
  win.body.addEventListener('fos:resize', () => { if (shot) { sel = null; render(); } });
  win.body.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); } });
  render(); say('「撮る」を押すと、ブラウザが撮る画面を聞きます。');
  log('capture.open', {}, 'ok');
  return win;
}
