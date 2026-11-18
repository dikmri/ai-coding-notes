// 画面キャプチャ: 「静止画」と「録画」の 2 つのタブ。計算は core/capture.mjs。
// 静止画: ブラウザの画面共有の許可をもらって1コマ撮り、PNG で /画像 に保存する。
//   撮るまでの待ち時間（すぐ・3秒・5秒）、撮る間は自分の窓を隠す、撮ったあとで四角く切り抜く（元に戻せる）、お絵かきで開く、コピー。
//   1コマ撮ったら、すぐに画面共有を止める。
// 録画（2026-11-19）: getDisplayMedia で画面全体・窓・タブを選び、MediaRecorder で WebM に録る。
//   画面の音とマイクの音（それぞれ入・切。録っている間も切り替えられる）は Web Audio で 1 本に混ぜる。
//   3 秒数えてから録り始め、一時停止・再開・止める。経過の時間と大きさの見込みを状態の帯に出す。
//   共有がブラウザの側（「共有を停止」）で止められたときも、そこまでを残す。
//   録ったものはその場で見られ、/ビデオ へ保存・パソコンへ書き出す・捨てる（確かめてから）。保存する WebM には長さを書き込む。
import * as K from '../core/capture.mjs';
import { levelKind } from '../core/recorder.mjs';
import { stopwatch, swElapsed, swStart, swStop } from '../core/clock.mjs';
import { basename } from '../core/path.mjs';

const VDIR = '/ビデオ';

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound } = os;
  const openPath = typeof args.path === 'string' && /\.webm$/i.test(args.path) ? args.path : null;
  let mode = openPath || args.mode === 'rec' ? 'rec' : 'shot';
  let shot = null, history = [], sel = null, path = null, busy = false, lastMsg = '';
  // 録画の状態。phase: idle（待ち）・count（数えている）・rec（録っている）・paused（一時停止）・stopping（まとめている）
  // reason: 録画が終わった・やめたわけ（user・share・error）。finishing: 切れ端をまとめている途中
  const R = { phase: 'idle', display: null, mic: null, ac: null, recorder: null, chunks: [], bytes: 0, sw: stopwatch(), timer: 0, gains: {}, analysers: {}, peaks: {}, cancel: null, opts: null, reason: '', at: null, finishing: false };
  let take = null; // 録ったもの、または開いたもの: { blob, url, ms, at, path, saved }
  let closed = false; // 窓が閉じられた（ブラウザに許可を聞いている間に閉じられることがある）
  const win = wm.open({
    app: 'capture', icon: 'icons/capture.svg', className: 'app-capture', title: '画面キャプチャ', w: 720, h: 560, ...rect, args: { mode, ...(openPath ? { path: openPath } : {}) },
    render(w) {
      const radio = (name, value, label, on) => `<label><input type="radio" name="${name}" value="${value}"${on ? ' checked' : ''}> ${label}</label>`;
      w.body.innerHTML = `<div class="cap-main">
        <div class="tab-list" role="tablist" aria-label="撮り方">
          <button type="button" class="tab" id="capTabShot-${w.id}" data-mode="shot" aria-selected="${mode === 'shot'}">静止画(<u>I</u>)</button>
          <button type="button" class="tab" id="capTabRec-${w.id}" data-mode="rec" aria-selected="${mode === 'rec'}">録画(<u>V</u>)</button>
        </div>
        <div class="tab-page cap-page" role="tabpanel" aria-labelledby="capTabShot-${w.id}" data-page="shot"${mode === 'shot' ? '' : ' hidden'}>
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
        <div class="tab-page cap-page" role="tabpanel" aria-labelledby="capTabRec-${w.id}" data-page="rec"${mode === 'rec' ? '' : ' hidden'}>
          <div class="cap-opts">
            <fieldset class="cap-set"><legend>画質(<u>Q</u>)</legend>${K.QUALITIES.map((x) => radio(`capQ-${w.id}`, x.id, x.label, x.id === 'normal')).join('')}</fieldset>
            <fieldset class="cap-set"><legend>コマの速さ(<u>F</u>)</legend>${radio(`capF-${w.id}`, 30, '30 コマ/秒', true)}${radio(`capF-${w.id}`, 60, '60 コマ/秒', false)}</fieldset>
            <fieldset class="cap-set"><legend>録る音</legend>
              <label><input type="checkbox" data-src="sys" checked> 画面の音(<u>U</u>)</label>
              <label><input type="checkbox" data-src="mic"> マイク(<u>M</u>)</label>
            </fieldset>
            <label class="cap-hide"><input type="checkbox" data-rhide> 録る間は窓をしまう(<u>H</u>)</label>
          </div>
          <div class="cap-stage cap-vstage" data-rstage>
            <p class="cap-empty" data-rempty>「録画を始める」を押すと、ブラウザが録る画面（画面全体・窓・タブ）を聞きます。選んで「共有」を押すと、3 秒数えてから録り始めます。</p>
            <video class="cap-video" data-live muted playsinline hidden aria-label="録っている画面"></video>
            <video class="cap-video" data-review controls playsinline preload="metadata" hidden aria-label="録った動画"></video>
            <div class="cap-badge" data-badge hidden><span data-bstate>● 録画中</span> <span data-btime>00:00</span></div>
            <div class="cap-count" data-rcount hidden aria-live="assertive"></div>
          </div>
          <div class="cap-meters" data-meters hidden>
            <span>画面の音</span><span class="cap-meter" aria-hidden="true"><i data-lv="sys"></i></span>
            <span>マイク</span><span class="cap-meter" aria-hidden="true"><i data-lv="mic"></i></span>
          </div>
          <p class="cap-msg" data-rmsg hidden></p>
          <div class="cap-actions cap-ractions">
            <div class="cap-group" role="group" aria-label="録る">
              <button type="button" class="default" data-r="start"><span class="cap-dot" aria-hidden="true"></span>録画を始める(<u>R</u>)</button>
              <button type="button" data-r="pause" disabled>一時停止(<u>P</u>)</button>
              <button type="button" data-r="stop" disabled>止める(<u>T</u>)</button>
            </div>
            <div class="cap-group" role="group" aria-label="録ったもの">
              <button type="button" data-r="save" disabled>保存(<u>S</u>)...</button>
              <button type="button" data-r="export" disabled>パソコンへ書き出す(<u>E</u>)</button>
              <button type="button" data-r="discard" disabled>捨てる(<u>D</u>)</button>
              <button type="button" data-r="open">開く(<u>O</u>)...</button>
            </div>
          </div>
        </div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:150px" data-dim></div><div class="status-field" style="width:64px" role="timer" aria-label="録画の長さ" data-time hidden></div><div class="status-field" style="width:220px" data-size hidden></div><div class="size-grip"></div></div>`;
    },
    // 録っている間や、保存していない録画があるときは、閉じる前に確かめる
    onClose: async () => {
      if (R.phase !== 'idle') {
        const a = await os.msgbox({ title: '画面キャプチャ', text: '録画しています。\n\n録画をやめて閉じますか? 録ったものは消えます。', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
        if (a !== 'はい') return false;
      } else if (take && !take.saved) {
        const a = await os.msgbox({ title: '画面キャプチャ', text: '録画がまだ保存されていません。\n\n保存しないで閉じますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
        if (a !== 'はい') return false;
      }
      return true;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const rp = q('[data-page="rec"]'), rq = (s) => rp.querySelector(s);
  const cv = q('[data-canvas]'), ctx = cv.getContext('2d'), selEl = q('[data-sel]'), box = q('[data-box]');
  const live = rq('[data-live]'), review = rq('[data-review]');
  function say(t) { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m; }
  const showMsg = (t) => { const m = q('[data-msg]'); m.textContent = t || ''; m.hidden = !t; };
  const recMsg = (t) => { const m = rq('[data-rmsg]'); m.textContent = t || ''; m.hidden = !t; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- 撮る ---------- */
  async function shoot() {
    if (busy || R.phase !== 'idle') return;
    if (!navigator.mediaDevices?.getDisplayMedia) { showMsg(K.errorText({ name: 'NotSupportedError' })); sound.play('error'); return; }
    busy = true; showMsg(''); update();
    let stream;
    // 画面共有は、押したその場で聞く（待ち時間のあとでは、ブラウザが許さない）
    // 大きさを伝えないと、Chrome は小さめ（タブなら 800×500 ほど）で渡すので、画面の実際の画素数を ideal で伝える
    const dpr = devicePixelRatio || 1, W = Math.round(Math.max(screen.width, innerWidth) * dpr), H = Math.round(Math.max(screen.height, innerHeight) * dpr);
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser', width: { ideal: W }, height: { ideal: H } }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' }); }
    catch (e) { busy = false; update(); showMsg(K.errorText(e)); sound.play('notify'); say('撮りませんでした。'); log('capture.share', { name: e.name }, 'error: ' + e.message); return; }
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
      // 新しい1コマを待つ。ただしタブの共有は、画面が変わったときだけコマを送るので、窓を隠して画面が止まっていると来ない。
      // 300 ミリ秒で待つのをやめ、video が持っている最後のコマ（窓を隠したあとの画面）を使う
      await new Promise((r) => { const t = setTimeout(r, 300); video.requestVideoFrameCallback?.(() => { clearTimeout(t); r(); }); });
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
    if (shot) { render(); say('撮りました。ドラッグで切り抜く範囲を選べます。'); } else update();
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
    drawSel(); update();
  }
  function drawSel() {
    selEl.hidden = !sel;
    if (sel) Object.assign(selEl.style, { left: sel.x + 'px', top: sel.y + 'px', width: sel.w + 'px', height: sel.h + 'px' });
  }
  function update() {
    const has = !!shot, b = (a) => q(`[data-a="${a}"]`);
    b('shoot').disabled = busy || R.phase !== 'idle';
    b('crop').disabled = !(has && sel && sel.w > 4 && sel.h > 4); b('undo').disabled = !history.length;
    b('save').disabled = !has; b('paint').disabled = !has; b('copy').disabled = !has;
    updateRec();
  }
  // プレビューの上でドラッグ: 新しく範囲を選ぶ。四隅のつまみ: 大きさを変える
  box.addEventListener('pointerdown', (e) => {
    if (!shot || e.button !== 0) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect(), handle = e.target.closest('[data-h]')?.dataset.h, start = { x: e.clientX, y: e.clientY }, base = sel && { ...sel };
    const px = (ev) => [Math.max(0, Math.min(r.width, ev.clientX - r.left)), Math.max(0, Math.min(r.height, ev.clientY - r.top))];
    const [x0, y0] = px(e);
    const move = (ev) => {
      // つまみで変えた範囲も、プレビューの枠の内に収める（枠の外まで引いても、はみ出さない）
      if (handle && base) sel = K.clampRect(K.resizeRect(base, handle, ev.clientX - start.x, ev.clientY - start.y, 8), r.width, r.height) || sel;
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
    catch (e) { say('コピーできませんでした。「保存」で残せます。');log('clipboard.write', {}, 'error: ' + e.message); }
  }

  /* ---------- 録画: 設定 ---------- */
  function opts() {
    const quality = rq(`input[name="capQ-${win.id}"]:checked`)?.value || 'normal', fps = +(rq(`input[name="capF-${win.id}"]:checked`)?.value || 30);
    return { quality, fps, sys: rq('[data-src="sys"]').checked, mic: rq('[data-src="mic"]').checked, hide: rq('[data-rhide]').checked };
  }
  // 録る前の大きさの見込みに使うビットレート（音を録るなら音の分も足す）
  const bpsOf = (o) => K.videoBps(o.quality, o.fps) + (o.sys || o.mic ? K.AUDIO_BPS : 0);
  const elapsed = () => swElapsed(R.sw, performance.now());

  /* ---------- 録画: 始める ---------- */
  async function startRec() {
    if (R.phase !== 'idle' || busy) return;
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') { recMsg(K.recErrorText({ name: 'NotSupportedError' })); sound.play('error'); log('capture.rec.start', {}, 'error: not supported'); return; }
    if (take && !take.saved) {
      const a = await os.msgbox({ title: '画面キャプチャ', text: '今の録画はまだ保存されていません。\n\n捨てて新しく録画しますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') return;
    }
    const o = opts();
    recMsg(''); clearTake(); R.phase = 'count'; R.reason = ''; R.finishing = false; update();
    // 音を混ぜる場所は、押したその場で作る（あとで作ると、ブラウザが音を止めたままにすることがある）
    if (o.sys || o.mic) { try { R.ac = new AudioContext(); } catch (e) { log('capture.rec.audio', {}, 'error: ' + e.message); } }
    // 大きさを伝えないと、Chrome はタブを小さめで渡すので、画面の実際の画素数を ideal で伝える（静止画と同じ）
    const dpr = devicePixelRatio || 1, W = Math.round(Math.max(screen.width, innerWidth) * dpr), H = Math.round(Math.max(screen.height, innerHeight) * dpr);
    let display;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: W }, height: { ideal: H }, frameRate: { ideal: o.fps, max: o.fps } },
        audio: o.sys ? { suppressLocalAudioPlayback: false } : false,
        selfBrowserSurface: 'include', surfaceSwitching: 'include', systemAudio: o.sys ? 'include' : 'exclude', monitorTypeSurfaces: 'include',
      });
    } catch (e) {
      if (closed) return;
      teardown(); R.phase = 'idle'; update();
      recMsg(K.recErrorText(e, 'screen')); sound.play('notify'); say('録画を始めませんでした。');
      log('capture.rec.share', { name: e.name }, 'error: ' + e.message);
      return;
    }
    // ブラウザが画面を聞いている間に窓が閉じられたら、もらった共有をすぐに止める
    if (closed) { display.getTracks().forEach((t) => t.stop()); return; }
    R.display = display;
    const vt = display.getVideoTracks()[0], st = vt.getSettings?.() || {};
    vt.addEventListener('ended', onShareEnded);
    log('capture.rec.share', { label: vt.label, surface: st.displaySurface, w: st.width, h: st.height, fps: st.frameRate, audio: display.getAudioTracks().length }, 'ok');
    // 音: 画面の音とマイクを、それぞれの音量の部品を通して 1 本に混ぜる。音量の部品で録っている間も入・切できる
    const notes = [], ac = R.ac;
    let dest = null;
    const addSource = (key, stream) => {
      const src = ac.createMediaStreamSource(stream), g = ac.createGain(), an = ac.createAnalyser();
      an.fftSize = 2048; g.gain.value = 1;
      src.connect(g); g.connect(dest); g.connect(an);
      R.gains[key] = g; R.analysers[key] = an;
    };
    if (ac) {
      dest = ac.createMediaStreamDestination();
      if (o.sys) {
        if (display.getAudioTracks().length) addSource('sys', new MediaStream(display.getAudioTracks()));
        else notes.push('画面の音は届いていません。音も録るときは、ブラウザの共有の画面で「音声を共有」を入にしてください。');
      }
      if (o.mic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          if (closed) { mic.getTracks().forEach((t) => t.stop()); return; }
          R.mic = mic; addSource('mic', mic);
          log('capture.rec.mic', { label: mic.getAudioTracks()[0]?.label }, 'ok');
        } catch (e) { notes.push(K.recErrorText(e, 'mic')); log('capture.rec.mic', { name: e.name }, 'error: ' + e.message); }
      }
      if (ac.state === 'suspended') await ac.resume().catch(() => {});
    }
    if (closed) return;
    const audio = Object.keys(R.gains).length > 0;
    live.srcObject = display; live.hidden = false; rq('[data-rempty]').hidden = true; review.hidden = true;
    live.play().catch(() => {});
    rq('[data-meters]').hidden = !audio;
    if (notes.length) recMsg(notes.join('\n'));
    if (o.hide) await win.minimize();
    // 3 秒数える（窓をしまっているときは音だけ）。数えている間に共有が止められたら、やめる
    if (!(await countdown(3, !o.hide))) {
      if (closed) return;
      teardown(); R.phase = 'idle'; update(); restoreView();
      say(R.reason === 'share' ? '録り始める前に画面共有が止められたので、録画をやめました。' : '録画をやめました。');
      log('capture.rec.cancel', { reason: R.reason || 'user' }, 'ok');
      if (win.min) await win.restore();
      return;
    }
    const mime = K.pickMime((m) => MediaRecorder.isTypeSupported(m), audio);
    const vbps = K.videoBps(o.quality, o.fps);
    let rec;
    try {
      rec = new MediaRecorder(new MediaStream([vt, ...(audio ? dest.stream.getAudioTracks() : [])]), { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: vbps, ...(audio ? { audioBitsPerSecond: K.AUDIO_BPS } : {}) });
      rec.ondataavailable = (e) => { if (e.data?.size) { R.chunks.push(e.data); R.bytes += e.data.size; } };
      rec.onerror = (e) => { log('capture.rec.error', { name: e.error?.name }, 'error: ' + (e.error?.message || '録画の部品の誤り')); R.reason = 'error'; stopRec(); };
      rec.onstop = () => finishRec();
      R.chunks = []; R.bytes = 0; R.recorder = rec; R.at = new Date();
      R.opts = { ...o, mime: rec.mimeType || mime, audio, bps: vbps + (audio ? K.AUDIO_BPS : 0) };
      rec.start(1000); // 1 秒ごとに切れ端を受け取り、大きさの見込みに使う
    } catch (e) {
      teardown(); R.phase = 'idle'; update(); restoreView();
      recMsg(K.recErrorText(e, 'screen')); sound.play('error'); say('録画を始められませんでした。');
      log('capture.rec.start', { mime }, 'error: ' + e.message);
      if (win.min) await win.restore();
      return;
    }
    R.sw = swStart(stopwatch(), performance.now()); R.phase = 'rec';
    sound.play('pin');
    say(o.hide ? '録画しています。止めるときは、タスクバーの「画面キャプチャ」を押して窓を戻し、「止める」を押します。' : '録画しています。「一時停止」で休み、「止める」で終わります。');
    log('capture.rec.start', { quality: o.quality, fps: o.fps, mime: R.opts.mime, vbps, sys: !!R.gains.sys, mic: !!R.gains.mic, hide: o.hide }, 'ok');
    clearInterval(R.timer); R.timer = setInterval(tick, 100);
    tick(); update();
  }
  // n 秒数える。最後まで数えたら true、やめたら false
  function countdown(n, show) {
    return new Promise((resolve) => {
      const cnt = rq('[data-rcount]');
      let left = n, t = 0;
      const done = (ok) => { clearTimeout(t); cnt.hidden = true; R.cancel = null; resolve(ok); };
      R.cancel = () => done(false);
      const step = () => {
        if (R.reason) return done(false); // 数え始める前に「やめる」が押された・共有が止められた
        if (left === 0) return done(true);
        cnt.hidden = !show; cnt.textContent = String(left);
        sound.play('key', 2 + (n - left) * 2); say(`${left} 秒後に録り始めます。`);
        left--; t = setTimeout(step, 1000);
      };
      step();
    });
  }

  /* ---------- 録画: 一時停止・止める ---------- */
  function pauseRec() {
    const rec = R.recorder;
    if (!rec) return;
    if (R.phase === 'rec') {
      try { rec.pause(); } catch (e) { log('capture.rec.pause', {}, 'error: ' + e.message); return; }
      R.sw = swStop(R.sw, performance.now()); R.phase = 'paused';
      sound.play('op'); say('一時停止しました。「再開」で続きを録ります。');
      log('capture.rec.pause', { ms: Math.round(elapsed()) }, 'ok');
    } else if (R.phase === 'paused') {
      try { rec.resume(); } catch (e) { log('capture.rec.resume', {}, 'error: ' + e.message); return; }
      R.sw = swStart(R.sw, performance.now()); R.phase = 'rec';
      sound.play('select'); say('録画を続けます。');
      log('capture.rec.resume', { ms: Math.round(elapsed()) }, 'ok');
    }
    tick(); update();
  }
  function stopRec() {
    if (R.phase === 'count') { R.reason = R.reason || 'user'; R.cancel?.(); return; }
    if (R.phase !== 'rec' && R.phase !== 'paused') return;
    R.sw = swStop(R.sw, performance.now()); R.phase = 'stopping'; update();
    say('録画をまとめています…');
    try { if (R.recorder.state !== 'inactive') R.recorder.stop(); else finishRec(); } catch { finishRec(); }
  }
  // 共有がブラウザの側で止められた（「共有を停止」・共有していた窓を閉じた）。数えている間ならやめ、録っている間ならそこまでを残す
  function onShareEnded() {
    log('capture.rec.ended', { phase: R.phase }, 'ok');
    R.reason = 'share';
    if (R.phase === 'count') R.cancel?.();
    else stopRec();
  }
  // 録画の部品が止まったら、切れ端をまとめて長さを書き込む。止める・誤り・共有の終わりが重なっても、まとめるのは 1 回だけ
  async function finishRec() {
    if (R.finishing || (R.phase !== 'stopping' && R.phase !== 'rec' && R.phase !== 'paused')) return;
    R.finishing = true;
    const ms = Math.round(elapsed()), o = R.opts, reason = R.reason, raw = new Blob(R.chunks, { type: 'video/webm' });
    R.phase = 'stopping';
    teardown();
    if (!raw.size) {
      R.phase = 'idle'; update(); restoreView();
      recMsg('録画できませんでした（中身がありません）。もう一度「録画を始める」を押してください。'); sound.play('error');
      log('capture.rec.stop', { ms, bytes: 0, reason }, 'error: empty');
      if (win.min) await win.restore();
      return;
    }
    let blob = raw;
    try { blob = await K.withDuration(raw, ms); } catch (e) { log('capture.rec.duration', { ms }, 'error: ' + e.message); }
    setTake({ blob, ms, at: R.at || new Date(), path: null, saved: false });
    R.phase = 'idle'; update();
    sound.play('op');
    const t = K.elapsedText(ms);
    if (reason === 'share') recMsg(`画面共有が止められたので、そこまでの ${t} を残しました。`);
    else if (reason === 'error') recMsg(`録画の途中で誤りが起きたので、そこまでの ${t} を残しました。`);
    say(`${t} 録りました。「保存」で ${VDIR} に残せます。`);
    log('capture.rec.stop', { ms, bytes: blob.size, raw: raw.size, reason: reason || 'user', mime: o?.mime }, 'ok');
    if (win.min) await win.restore();
  }
  // 録るのに使ったもの（画面共有・マイク・音の部品・時計）を片付ける。自分で止めた共有は ended を出さない
  function teardown() {
    clearInterval(R.timer); R.timer = 0;
    R.cancel?.();
    const vt = R.display?.getVideoTracks()[0];
    vt?.removeEventListener('ended', onShareEnded);
    R.display?.getTracks().forEach((t) => t.stop());
    R.mic?.getTracks().forEach((t) => t.stop());
    if (R.ac) R.ac.close().catch(() => {});
    R.display = R.mic = R.ac = R.recorder = null; R.gains = {}; R.analysers = {}; R.peaks = {}; R.chunks = [];
    live.pause(); live.srcObject = null; live.hidden = true;
    rq('[data-meters]').hidden = true;
  }

  /* ---------- 録画: 見る・保存・書き出す・捨てる・開く ---------- */
  function setTake(t) {
    clearTake();
    take = { ...t, url: URL.createObjectURL(t.blob) };
    const s = os.getSettings(); // 見るときの音は、OS の音量と消音の設定に合わせる
    review.volume = Math.max(0, Math.min(1, s.volume ?? 1)); review.muted = !!s.mute;
    review.src = take.url; review.hidden = false; rq('[data-rempty]').hidden = true; live.hidden = true;
    update();
  }
  function clearTake() {
    if (!take) return;
    review.pause(); review.removeAttribute('src'); review.load(); review.hidden = true;
    URL.revokeObjectURL(take.url); take = null;
    restoreView(); update();
  }
  // 何も録っていないときの案内を出す
  function restoreView() { if (!take && R.phase === 'idle') { rq('[data-rempty]').hidden = false; review.hidden = true; live.hidden = true; } }
  // 開いたファイルの長さは、読み込んでから分かる（書かれていなければ Infinity）
  review.addEventListener('loadedmetadata', () => {
    if (take && take.ms == null && Number.isFinite(review.duration)) { take.ms = Math.round(review.duration * 1000); update(); }
    log('capture.rec.view', { duration: review.duration, w: review.videoWidth, h: review.videoHeight }, 'ok');
  });
  review.addEventListener('error', () => log('capture.rec.view', { code: review.error?.code }, 'error: ' + (review.error?.message || '再生できません')));
  async function saveTake() {
    if (!take || R.phase !== 'idle') return null;
    review.pause();
    try { if (!(await fs.stat(VDIR))) await fs.mkdir(VDIR); } catch (e) { log('capture.rec.mkdir', { path: VDIR }, 'error: ' + e.message); }
    const p = await os.fileDialog({ mode: 'save', dir: VDIR, name: take.path ? basename(take.path) : K.videoName(take.at), exts: ['.webm'], typeLabel: 'WebM 動画' });
    if (!p) { log('capture.rec.save', {}, 'cancel'); return null; }
    try {
      await fs.write(p, take.blob, 'video/webm');
      take.path = p; take.saved = true; os.addRecent(p); win.setArgs({ mode: 'rec', path: p }); update();
      sound.play('op'); say(`「${basename(p)}」を保存しました。`);
      log('capture.rec.save', { path: p, ms: take.ms, bytes: take.blob.size }, 'ok');
      os.notify?.({ title: '録画を保存しました', text: basename(p), actionLabel: 'フォルダを開く', onAction: () => os.launch('filer', { path: VDIR }) });
      return p;
    } catch (e) { os.msgbox({ title: '画面キャプチャ', text: e.message, icon: 'error' }); log('capture.rec.save', { path: p }, 'error: ' + e.message); return null; }
  }
  function exportTake() {
    if (!take) return;
    const a = document.createElement('a');
    a.href = take.url; a.download = take.path ? basename(take.path) : K.videoName(take.at); a.click();
    say(`「${a.download}」をパソコンへ書き出しました。`);
    log('capture.rec.export', { name: a.download, bytes: take.blob.size }, 'ok');
  }
  async function discardTake() {
    if (!take || R.phase !== 'idle') return;
    if (!take.saved) {
      const a = await os.msgbox({ title: '画面キャプチャ', text: '録画を捨てますか?\n\nまだ保存していないので、捨てると元に戻せません。', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') { log('capture.rec.discard', {}, 'cancel'); return; }
    }
    const saved = take.saved;
    clearTake(); recMsg('');
    sound.play(saved ? 'op' : 'trash');
    say(saved ? `画面から片付けました。保存したファイルは ${VDIR} に残っています。` : '録画を捨てました。');
    log('capture.rec.discard', { saved }, 'ok');
  }
  async function openTake(p, quiet = false) {
    if (R.phase !== 'idle') return;
    if (!p) {
      if (take && !take.saved) {
        const a = await os.msgbox({ title: '画面キャプチャ', text: '今の録画はまだ保存されていません。\n\n捨てて別の動画を開きますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
        if (a !== 'はい') return;
      }
      p = await os.fileDialog({ mode: 'open', dir: VDIR, exts: ['.webm'], typeLabel: 'WebM 動画' });
      if (!p) return;
    }
    try {
      const st = await fs.stat(p), blob = await fs.readBlob(p);
      setTake({ blob: blob.type ? blob : new Blob([blob], { type: 'video/webm' }), ms: null, at: new Date(st?.mtime || Date.now()), path: p, saved: true });
      win.setArgs({ mode: 'rec', path: p }); recMsg('');
      say(`「${basename(p)}」を開きました。▶ で見られます。`);
      log('capture.rec.open', { path: p, bytes: blob.size }, 'ok');
    } catch (e) {
      log('capture.rec.open', { path: p }, 'error: ' + e.message);
      if (quiet) say(`「${basename(p)}」を開けませんでした。`);
      else os.msgbox({ title: '画面キャプチャ', text: `「${basename(p)}」を開けませんでした。\n\n${e.message}`, icon: 'error' });
    }
  }

  /* ---------- 録画: 表示 ---------- */
  // 録っている間の経過の時間・大きさ・音の量。窓が裏にあっても進むよう、requestAnimationFrame ではなく setInterval で回す
  function tick() {
    const ms = elapsed(), t = K.elapsedText(ms);
    rq('[data-btime]').textContent = t;
    q('[data-time]').textContent = t;
    q('[data-size]').textContent = K.sizeLine({ bytes: R.bytes, ms, bps: R.opts?.bps || 0 });
    // 音の量: 今の振れ幅のいちばん大きい値。見る間に鳴った短い音も見えるよう、前の値を少しずつ下げながら残す
    for (const key of ['sys', 'mic']) {
      const an = R.analysers[key], bar = rq(`[data-lv="${key}"]`);
      let p = 0;
      if (an && R.gains[key]?.gain.value > 0) { const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); for (const v of d) p = Math.max(p, Math.abs(v)); }
      p = Math.max(p, (R.peaks[key] || 0) * 0.75); R.peaks[key] = p;
      bar.style.width = Math.min(100, p * 100).toFixed(1) + '%'; bar.dataset.kind = levelKind(p);
    }
    const title = `${R.phase === 'paused' ? '‖ 一時停止' : '● 録画中'} ${t} - 画面キャプチャ`;
    if (win.title !== title) win.setTitle(title);
  }
  function updateRec() {
    const ph = R.phase, idle = ph === 'idle', on = ph === 'rec' || ph === 'paused';
    const b = (a) => rq(`[data-r="${a}"]`);
    b('start').disabled = !idle || busy;
    b('pause').disabled = !on; b('pause').innerHTML = ph === 'paused' ? '再開(<u>P</u>)' : '一時停止(<u>P</u>)';
    b('stop').disabled = !(on || ph === 'count'); b('stop').innerHTML = ph === 'count' ? 'やめる(<u>T</u>)' : '止める(<u>T</u>)';
    for (const a of ['save', 'export', 'discard']) b(a).disabled = !idle || !take;
    b('discard').innerHTML = take?.saved ? '片付ける(<u>D</u>)' : '捨てる(<u>D</u>)';
    b('discard').title = take?.saved ? '画面から外します（保存したファイルは残ります）' : '録った動画を捨てます';
    b('open').disabled = !idle;
    rp.querySelectorAll('input[type="radio"], [data-rhide]').forEach((i) => { i.disabled = !idle; });
    // 録っている間は、開いた音だけを入・切できる
    rp.querySelectorAll('[data-src]').forEach((i) => { i.disabled = !idle && !R.gains[i.dataset.src]; });
    const badge = rq('[data-badge]');
    badge.hidden = !on; badge.toggleAttribute('data-paused', ph === 'paused');
    rq('[data-bstate]').textContent = ph === 'paused' ? '‖ 一時停止中' : '● 録画中';
    win.el.classList.toggle('cap-recording', ph === 'rec');
    // 状態の帯: 静止画では画像の大きさ、録画では長さと大きさ
    const recMode = mode === 'rec';
    q('[data-dim]').hidden = recMode; q('[data-time]').hidden = !recMode; q('[data-size]').hidden = !recMode;
    q('[data-dim]').textContent = shot ? `${shot.width} × ${shot.height}` : '';
    if (on || ph === 'stopping') return; // 録っている間は tick が書く
    if (take) {
      q('[data-time]').textContent = take.ms == null ? '--:--' : K.elapsedText(take.ms);
      q('[data-size]').textContent = K.sizeText(take.blob.size);
    } else {
      q('[data-time]').textContent = K.elapsedText(0);
      q('[data-size]').textContent = K.sizeLine({ bps: bpsOf(opts()) });
    }
    const title = `画面キャプチャ${recMode && take ? ' - ' + (take.path ? basename(take.path) : '新しい録画 *') : !recMode && path ? ' - ' + basename(path) : ''}`;
    if (win.title !== title) win.setTitle(title);
  }
  // 録っている間に音の入・切を変えたら、すぐに音量の部品へ伝える
  rp.addEventListener('change', (e) => {
    const src = e.target.closest('[data-src]');
    if (src && R.gains[src.dataset.src]) {
      R.gains[src.dataset.src].gain.value = src.checked ? 1 : 0;
      const name = src.dataset.src === 'mic' ? 'マイク' : '画面の音';
      say(`${name}を${src.checked ? '入' : '切'}にしました。`);
      log('capture.rec.mute', { src: src.dataset.src, on: src.checked }, 'ok');
    }
    update();
  });

  /* ---------- タブ・ボタン・キー ---------- */
  function setMode(m) {
    if (m === mode) return;
    mode = m; win.setArgs({ mode });
    if (mode === 'rec') say(take ? '録った動画を ▶ で見られます。' : '「録画を始める」を押すと、ブラウザが録る画面を聞きます。');
    else say(shot ? 'ドラッグで切り抜く範囲を選べます。' : '「撮る」を押すと、ブラウザが撮る画面を聞きます。');
    if (mode === 'shot' && shot) render(); else update();
    log('capture.mode', { mode }, 'ok');
  }
  win.body.addEventListener('w95:tab', (e) => setMode(e.detail.tab.dataset.mode));
  const acts = { shoot, crop, undo, save, paint: toPaint, copy };
  const recActs = { start: startRec, pause: pauseRec, stop: stopRec, save: saveTake, export: exportTake, discard: discardTake, open: () => openTake() };
  win.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a], [data-r]');
    if (!b || b.disabled) return;
    if (b.dataset.a) acts[b.dataset.a](); else recActs[b.dataset.r]();
  });
  win.body.addEventListener('fos:resize', () => { if (shot && mode === 'shot') { sel = null; render(); } });
  win.body.addEventListener('keydown', (e) => { if (mode === 'shot' && e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); } });
  win.cleanup = () => {
    closed = true;
    if (R.recorder && R.recorder.state !== 'inactive') { R.recorder.onstop = null; try { R.recorder.stop(); } catch { /* 止まっている */ } }
    teardown(); clearTake();
  };
  render();
  say(mode === 'rec' ? '「録画を始める」を押すと、ブラウザが録る画面を聞きます。' : '「撮る」を押すと、ブラウザが撮る画面を聞きます。');
  if (openPath) await openTake(openPath, true);
  log('capture.open', { mode, path: openPath }, 'ok');
  return win;
}
