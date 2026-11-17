// 音声レコーダー: マイクの許可をもらって録音し、WAV（16 ビット PCM）で /音楽 に保存する（音楽プレーヤー・ビューアで鳴らせる）。
// 録音・一時停止・再開・停止・聞き直し、入力の機器の選択、音の大きさ（3色）と波形、経過時間。
// 停止したらマイクを閉じる（ブラウザの録音中のしるしを消す）。計算は core/recorder.mjs、WAV は core/wav.mjs。
import * as R from '../core/recorder.mjs';
import { encodeWAV } from '../core/wav.mjs';
import { fmt } from '../core/clock.mjs';
import { basename } from '../core/path.mjs';

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  let ac = null, stream = null, node = null, src = null, chunks = [], state = 'idle', rate = 48000, samples = null, saved = true, raf = 0, player = null, flushed = null, playStart = 0, lastPeak = 0, lastMsg = '';
  const win = wm.open({
    app: 'recorder', icon: 'icons/recorder.svg', className: 'app-recorder', title: '音声レコーダー', w: 640, h: 420, ...rect, args: {},
    render(w) {
      w.body.innerHTML = `<div class="rec-main">
        <div class="rec-top"><label for="recDev-${w.id}">入力(<u>I</u>):</label><select id="recDev-${w.id}" data-dev><option value="">いつものマイク</option></select></div>
        <div class="rec-time" role="timer" aria-label="録音の長さ" data-time>00:00.00</div>
        <div class="rec-meter" aria-hidden="true"><i data-level></i></div>
        <canvas class="rec-wave" width="520" height="110" role="img" aria-label="録音の波形" data-wave></canvas>
        <p class="rec-msg" data-msg hidden></p>
        <div class="rec-ctrls" role="toolbar" aria-label="録音の操作">
          <button type="button" class="flat rec-btn rec-rec" data-a="rec">録音(<u>R</u>)</button>
          <button type="button" class="flat rec-btn" data-a="pause" disabled>一時停止(<u>A</u>)</button>
          <button type="button" class="flat rec-btn" data-a="stop" disabled>停止(<u>S</u>)</button>
          <button type="button" class="flat rec-btn" data-a="play" disabled>聞く(<u>P</u>)</button>
          <button type="button" class="flat rec-btn" data-a="save" disabled>保存(<u>V</u>)...</button>
          <button type="button" class="flat rec-btn" data-a="discard" disabled>捨てる(<u>D</u>)</button>
        </div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:160px" data-rate></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      if (!saved && samples && samples.length) {
        const a = await os.msgbox({ title: '音声レコーダー', text: '録音した音がまだ保存されていません。\n\n保存しないで閉じますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
        if (a !== 'はい') return false;
      }
      return true;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const wave = q('[data-wave]'), wctx = wave.getContext('2d'), devSel = q('[data-dev]');
  function say(t) { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m; }
  const showMsg = (t) => { const m = q('[data-msg]'); m.textContent = t || ''; m.hidden = !t; };
  const total = () => chunks.reduce((s, c) => s + c.length, 0);

  /* ---------- 入力の機器 ---------- */
  async function listDevices() {
    try {
      const keep = devSel.value, list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      devSel.innerHTML = '<option value="">いつものマイク</option>' + list.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'マイク ' + (i + 1))}</option>`).join('');
      if ([...devSel.options].some((o) => o.value === keep)) devSel.value = keep;
    } catch (e) { log('recorder.devices', {}, 'error: ' + e.message); }
  }

  /* ---------- 録音 ---------- */
  async function openMic() {
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(devSel.value ? { deviceId: { exact: devSel.value } } : {}) };
    stream = await navigator.mediaDevices.getUserMedia({ audio });
    if (!ac) { ac = new AudioContext(); await ac.audioWorklet.addModule(new URL('./recorder-worklet.mjs', import.meta.url)); }
    if (ac.state === 'suspended') await ac.resume();
    rate = ac.sampleRate;
    src = ac.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ac, 'fos-recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const mute = ac.createGain(); mute.gain.value = 0; // 処理を続けさせるために出口へつなぐが、音は出さない
    src.connect(node).connect(mute).connect(ac.destination);
    node.port.onmessage = (e) => {
      const d = e.data;
      if (d === 'flushed') { flushed?.(); return; }
      lastPeak = Math.max(lastPeak * 0.6, R.peak(d)); if (state === 'recording' || state === 'stopping') chunks.push(d);
    };
    q('[data-rate]').textContent = `${rate} Hz ・ モノラル`;
    stream.getAudioTracks()[0].addEventListener('ended', () => { if (state === 'recording' || state === 'paused') { stop(); showMsg('マイクが外れたので、録音を止めました。'); } });
    listDevices();
  }
  // 停止の前に、部品の中に残っている最後の切れ端（2048 標本未満、最大 40 ミリ秒ほど）を受け取る。返事が来なければ 300 ミリ秒であきらめる
  function drain() {
    return new Promise((r) => {
      if (!node) return r();
      const t = setTimeout(r, 300);
      flushed = () => { clearTimeout(t); flushed = null; r(); };
      try { node.port.postMessage('flush'); } catch { r(); }
    });
  }
  function closeMic() {
    src?.disconnect(); node?.disconnect(); src = node = null;
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
  }
  async function record() {
    if (state === 'paused') { state = 'recording'; sound.play('select'); say('録音を続けます。'); log('recorder.resume', {}, 'ok'); update(); return; }
    if (samples && !saved) {
      const a = await os.msgbox({ title: '音声レコーダー', text: '今の録音はまだ保存されていません。\n\n捨てて新しく録音しますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') return;
    }
    stopPlay(); showMsg('');
    try { await openMic(); }
    catch (e) { closeMic(); showMsg(R.errorText(e)); sound.play('error'); say('録音を始められませんでした。'); log('recorder.mic', { name: e.name }, 'error: ' + e.message); return; }
    chunks = []; samples = null; saved = true; state = 'recording';
    sound.play('pin'); say('録音しています。'); log('recorder.start', { rate, device: devSel.value ? 'chosen' : 'default' }, 'ok');
    update(); loop();
  }
  function pause() { if (state !== 'recording') return; state = 'paused'; sound.play('op'); say('一時停止しました。「続ける」で再開します。'); log('recorder.pause', { sec: R.seconds(total(), rate) }, 'ok'); update(); }
  async function stop() {
    if (state !== 'recording' && state !== 'paused') return;
    // 録音中から止めたときだけ、最後の切れ端を待つ（一時停止中の音は残さない）
    const tail = state === 'recording';
    state = 'stopping'; update();
    if (tail) await drain();
    state = 'stopped'; closeMic();
    samples = R.joinChunks(chunks); chunks = []; saved = !samples.length;
    sound.play('op'); say(samples.length ? `${fmt(R.seconds(samples.length, rate) * 1000, { cs: true })} 録りました。「聞く」「保存」が使えます。` : '音が録れていませんでした。');
    log('recorder.stop', { samples: samples.length, sec: R.seconds(samples.length, rate) }, 'ok');
    update(); drawWave(); loop(); // 止まった状態の1回分で、経過時間を録音の全体の長さにする
  }

  /* ---------- 聞き直し ---------- */
  function play() {
    if (player) { stopPlay(); update(); drawWave(); say('聞き直しを止めました。'); return; } // 止めたら再生の位置の線を消す
    if (!samples || !samples.length || !ac) return;
    const buf = ac.createBuffer(1, samples.length, rate); buf.copyToChannel(samples, 0);
    const g = ac.createGain(), s = os.getSettings(); g.gain.value = s.mute ? 0 : s.volume;
    player = ac.createBufferSource(); player.buffer = buf; player.connect(g).connect(ac.destination);
    player.onended = () => { player = null; update(); drawWave(); say('聞き直しが終わりました。'); };
    if (ac.state === 'suspended') ac.resume();
    player.start(); playStart = ac.currentTime; say('聞き直しています。'); log('recorder.play', { sec: R.seconds(samples.length, rate) }, 'ok');
    update(); loop();
  }
  function stopPlay() { if (player) { player.onended = null; try { player.stop(); } catch { /* 止まっている */ } player = null; } }

  /* ---------- 保存・捨てる ---------- */
  async function save() {
    if (!samples || !samples.length) return;
    if (player) { stopPlay(); drawWave(); update(); } // 聞き直しの途中なら止めてから保存する
    const p = await os.fileDialog({ mode: 'save', dir: '/音楽', name: R.defaultName(new Date()), exts: ['.wav'], typeLabel: 'WAV 音声' });
    if (!p) return;
    try {
      await fs.write(p, new Blob([encodeWAV([samples], rate)], { type: 'audio/wav' }), 'audio/wav');
      saved = true; os.addRecent(p); update(); say(`「${basename(p)}」を保存しました。`); log('recorder.save', { path: p, sec: R.seconds(samples.length, rate) }, 'ok');
      os.notify?.({ title: '録音を保存しました', text: basename(p), actionLabel: '音楽プレーヤーで開く', onAction: () => os.openFile(p, 'player') });
    } catch (e) { os.msgbox({ title: '音声レコーダー', text: e.message, icon: 'error' }); log('recorder.save', { path: p }, 'error: ' + e.message); }
  }
  function discard() { stopPlay(); samples = null; saved = true; state = 'idle'; drawWave(); update(); sound.play('trash'); say('録音を捨てました。'); }

  /* ---------- 表示 ---------- */
  function update() {
    const has = !!(samples && samples.length), rec = state === 'recording' || state === 'paused';
    const b = (a) => q(`[data-a="${a}"]`);
    b('rec').innerHTML = state === 'paused' ? '続ける(<u>R</u>)' : '録音(<u>R</u>)';
    b('rec').disabled = state === 'recording' || state === 'stopping';
    b('pause').disabled = state !== 'recording';
    b('stop').disabled = !rec;
    b('play').disabled = rec || !has; b('play').innerHTML = player ? '止める(<u>P</u>)' : '聞く(<u>P</u>)';
    b('save').disabled = rec || !has; b('discard').disabled = rec || !has;
    devSel.disabled = rec;
    win.el.classList.toggle('recording', state === 'recording');
    win.setTitle(`${state === 'recording' ? '● ' : ''}音声レコーダー${has && !saved ? ' *' : ''}`);
  }
  function setLevel(p) {
    const i = q('[data-level]'); i.style.width = Math.min(100, p * 100) + '%'; i.dataset.kind = R.levelKind(p);
  }
  function drawWave(live) {
    const W = wave.width, H = wave.height, cs = getComputedStyle(win.el);
    wctx.fillStyle = cs.getPropertyValue('--fos-paper').trim() || '#fffdf9'; wctx.fillRect(0, 0, W, H);
    wctx.strokeStyle = '#e6def0'; wctx.beginPath(); wctx.moveTo(0, H / 2); wctx.lineTo(W, H / 2); wctx.stroke();
    // 録音中は直近の数秒、止めたあとは全体
    const d = live ? R.joinChunks(chunks.slice(-Math.ceil((rate * 4) / 2048))) : samples;
    if (!d || !d.length) return;
    const bins = R.waveBins(d, W / 2), ink = cs.getPropertyValue('--fos-ink').trim() || '#241734';
    wctx.fillStyle = ink;
    bins.forEach(([lo, hi], i) => { const y1 = H / 2 - hi * (H / 2 - 4), y2 = H / 2 - lo * (H / 2 - 4); wctx.fillRect(i * 2, y1, 1.5, Math.max(1, y2 - y1)); });
    if (player) { const x = Math.min(W, ((ac.currentTime - playStart) / R.seconds(samples.length, rate)) * W); wctx.fillStyle = cs.getPropertyValue('--fos-rose').trim() || '#ff5c97'; wctx.fillRect(x, 0, 2, H); }
  }
  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (state === 'recording' || state === 'paused') {
        q('[data-time]').textContent = fmt(R.seconds(total(), rate) * 1000, { cs: true });
        setLevel(lastPeak); lastPeak *= 0.92; drawWave(true);
      } else if (player) {
        q('[data-time]').textContent = fmt((ac.currentTime - playStart) * 1000, { cs: true }); drawWave();
      } else { setLevel(0); if (samples) q('[data-time]').textContent = fmt(R.seconds(samples.length, rate) * 1000, { cs: true }); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  const acts = { rec: record, pause, stop, play, save, discard };
  win.body.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) acts[b.dataset.a](); });
  devSel.addEventListener('change', () => say(`入力を「${devSel.selectedOptions[0].textContent}」にしました。`));
  win.cleanup = () => { cancelAnimationFrame(raf); stopPlay(); closeMic(); if (ac) { ac.close().catch(() => {}); ac = null; } };
  if (!navigator.mediaDevices?.getUserMedia) { showMsg('このブラウザでは録音できません。'); q('[data-a="rec"]').disabled = true; }
  else listDevices();
  drawWave(); update(); say('「録音」を押すと、マイクの許可を聞いてから録音を始めます。');
  log('recorder.open', {}, 'ok');
  return win;
}
