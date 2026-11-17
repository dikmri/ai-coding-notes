// 音楽プレーヤー: 仮想ドライブの音（WAV・MP3・OGG など）と、SID 風シンセの曲（.sng。その場で音にする）を、1つの再生の一覧で続けて鳴らす。
// 再生・一時停止・停止・前・次・位置・音量、順番を混ぜる、くり返し（なし・1曲・全部）。一覧は .m3u で保存・読み込み。
// 帯の高さの表示（スペクトラム）と波形の表示は、押すと切り替わる。窓は1つだけ開き、閉じると音と描画を止める。計算は core/playlist.mjs。
import * as L from '../core/playlist.mjs';
import { fmt } from '../core/clock.mjs';
import { normalizeSong, renderSong } from '../core/sidengine.mjs';
import { encodeWAV } from '../core/wav.mjs';
import { basename, dirname, extname, stem } from '../core/path.mjs';

const LIST_KEY = 'fos-player';
const REPEATS = [['none', 'くり返さない'], ['all', '全部をくり返す'], ['one', '1曲をくり返す']];
const loadState = () => { try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}'); } catch { return {}; } };
const saveState = (s) => { try { localStorage.setItem(LIST_KEY, JSON.stringify(s)); } catch { /* 保存できない */ } };
const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="add"><span class="label">曲を追加(<u>A</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="openlist"><span class="label">一覧を開く(<u>O</u>)...</span></div>
    <div class="menu-item" data-command="savelist"><span class="label">一覧を保存(<u>S</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>X</u>)</span></div>
  </div></div>
  <div class="menu-title">再生(<u>P</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="toggle"><span class="label">再生・一時停止(<u>P</u>)</span><span class="shortcut">Space</span></div>
    <div class="menu-item" data-command="stop"><span class="label">停止(<u>S</u>)</span></div>
    <div class="menu-item" data-command="prev"><span class="label">前の曲(<u>B</u>)</span></div>
    <div class="menu-item" data-command="next"><span class="label">次の曲(<u>N</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-toggle="check" data-command="shuffle"><span class="label">順番を混ぜる(<u>H</u>)</span></div>
    ${REPEATS.map(([k, n]) => `<div class="menu-item radio" data-radio="rep" data-command="repeat" data-rep="${k}"><span class="label">${n}</span></div>`).join('')}
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="about"><span class="label">音楽プレーヤーについて(<u>A</u>)</span></div>
  </div></div>
</div>`;

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  const open = wm.list().find((w) => w.app === 'player');
  if (open) { if (open.min) open.restore(); open.focus(); if (args.path) await open.addPath?.(args.path, true); return open; }
  const st0 = loadState();
  let list = Array.isArray(st0.list) ? st0.list.filter((p) => typeof p === 'string') : [], index = -1, order = [], shuffle = !!st0.shuffle, repeat = st0.repeat || 'none';
  let volume = typeof st0.volume === 'number' ? st0.volume : 0.8, mode = 'bars', url = null, raf = 0, lastMsg = '';
  const sngCache = new Map();
  const win = wm.open({
    app: 'player', icon: 'icons/player.svg', className: 'app-player', title: '音楽プレーヤー', w: 560, h: 500, ...rect, args: {},
    render(w) {
      w.body.innerHTML = MENU + `<div class="pl-main">
        <div class="pl-now">
          <canvas class="pl-viz" width="520" height="90" role="img" aria-label="音の表示（押すと帯と波形が切り替わります）" title="押すと、帯の高さと波形の表示が切り替わります"></canvas>
          <div class="pl-title" data-title>曲を追加してください。</div>
          <div class="pl-seek"><span data-cur>00:00</span><input type="range" min="0" max="1000" value="0" data-seek aria-label="再生の位置"><span data-dur>00:00</span></div>
          <div class="pl-ctrls" role="toolbar" aria-label="再生の操作">
            <button type="button" class="flat pl-btn" data-act="prev" title="前の曲">前</button>
            <button type="button" class="flat pl-btn pl-play" data-act="toggle" title="再生（Space）">再生</button>
            <button type="button" class="flat pl-btn" data-act="stop" title="停止">停止</button>
            <button type="button" class="flat pl-btn" data-act="next" title="次の曲">次</button>
            <button type="button" class="flat pl-btn pl-mode" data-act="shuffle" aria-pressed="false" title="順番を混ぜる">混ぜる</button>
            <button type="button" class="flat pl-btn pl-mode" data-act="repeat" title="くり返しを切り替える"></button>
            <label class="pl-vol">音量<input type="range" min="0" max="100" data-vol aria-label="音量"></label>
          </div>
        </div>
        <div class="pl-listhead"><span>再生の一覧</span><span class="pl-tools">
          <button type="button" class="flat pl-small" data-act="add">追加(<u>A</u>)...</button><button type="button" class="flat pl-small" data-act="remove">外す(<u>R</u>)</button>
          <button type="button" class="flat pl-small" data-act="up">上へ(<u>U</u>)</button><button type="button" class="flat pl-small" data-act="down">下へ(<u>D</u>)</button></span></div>
        <ol class="list pl-list" role="listbox" aria-label="再生の一覧" tabindex="0" data-list></ol>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:90px" data-count></div><div class="size-grip"></div></div>
      <audio data-audio preload="auto"></audio>`;
    },
    onClose: async () => { stopAll(); return true; },
  });
  const q = (s) => win.body.querySelector(s);
  const audio = q('[data-audio]'), listEl = q('[data-list]'), viz = q('.pl-viz'), vctx = viz.getContext('2d');
  let sel = -1;
  function say(t) { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m; }
  const persist = () => saveState({ list, shuffle, repeat, volume });

  /* ---------- 音の通り道（<audio> → 解析 → 音量 → 出口）。OS の音量と消音にも従う ---------- */
  let ac = null, analyser = null, gain = null;
  function ensureAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    ac = new AudioContext();
    const src = ac.createMediaElementSource(audio);
    analyser = ac.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.75;
    gain = ac.createGain();
    src.connect(analyser).connect(gain).connect(ac.destination);
    applyVolume();
    log('player.audio', { rate: ac.sampleRate }, 'ok');
  }
  function applyVolume() {
    const s = os.getSettings();
    // プレーヤーの音量 × OS の音量。OS が消音なら鳴らさない
    if (gain) gain.gain.value = s.mute ? 0 : volume * s.volume;
  }
  const onSettings = () => applyVolume();
  os.events.addEventListener('settings', onSettings);

  /* ---------- 一覧 ---------- */
  function rebuildOrder() { order = shuffle ? L.shuffleOrder(list.length, index, Math.random) : [...list.keys()]; }
  function renderList() {
    listEl.innerHTML = list.length ? list.map((p, i) => `<li role="option" data-i="${i}" aria-selected="${i === sel}" class="${i === index ? 'playing' : ''}${i === sel ? ' selected' : ''}"><span class="pl-num">${i + 1}</span><span class="pl-name">${esc(stem(p))}</span><span class="pl-kind">${extname(p).slice(1).toUpperCase()}</span></li>`).join('')
      : '<li class="pl-empty">曲がありません。「追加」か、ファイルをここへ落としてください。</li>';
    q('[data-count]').textContent = `${list.length} 曲`;
  }
  function markRows() {
    listEl.querySelectorAll('li[data-i]').forEach((li) => { const i = +li.dataset.i; li.classList.toggle('playing', i === index); li.classList.toggle('selected', i === sel); li.setAttribute('aria-selected', String(i === sel)); });
  }
  function addPaths(paths, playFirst = false) {
    const ok = paths.filter((p) => L.isPlayable(p));
    if (!ok.length) { sound.play('error'); say('鳴らせるファイルがありませんでした（WAV・MP3・OGG・.sng など）。'); return; }
    const first = list.length;
    list.push(...ok); rebuildOrder(); persist(); renderList();
    say(`${ok.length} 曲を一覧に足しました。`); log('player.add', { count: ok.length }, 'ok');
    if (playFirst || index < 0) playAt(first, playFirst);
  }
  win.addPath = async (p, play) => {
    if (extname(p).toLowerCase() === '.m3u') return loadList(p);
    const i = list.indexOf(p);
    if (i >= 0) return playAt(i, true);
    addPaths([p], play);
  };
  async function loadList(p) {
    try {
      const paths = L.parseM3U(await fs.readText(p), dirname(p));
      list = paths; index = -1; sel = -1; rebuildOrder(); persist(); renderList();
      say(`「${basename(p)}」から ${paths.length} 曲を読みました。`); log('player.openlist', { path: p, count: paths.length }, 'ok');
      if (paths.length) playAt(order[0], false);
    } catch (e) { os.msgbox({ title: '音楽プレーヤー', text: e.message, icon: 'error' }); log('player.openlist', { path: p }, 'error: ' + e.message); }
  }

  /* ---------- 鳴らす ---------- */
  async function urlFor(p) {
    if (extname(p).toLowerCase() !== '.sng') return URL.createObjectURL(await fs.readBlob(p));
    if (!sngCache.has(p)) {
      say(`「${stem(p)}」を音にしています…`);
      await new Promise((r) => setTimeout(r, 30)); // 知らせを先に描く
      const song = normalizeSong(await fs.readJSON(p)), sr = 44100;
      sngCache.set(p, new Blob([encodeWAV([renderSong(song, sr)], sr)], { type: 'audio/wav' }));
    }
    return URL.createObjectURL(sngCache.get(p));
  }
  async function playAt(i, autoplay = true) {
    if (i < 0 || i >= list.length) return;
    const p = list[i];
    index = i; sel = i; markRows();
    q('[data-title]').textContent = stem(p);
    win.setTitle(`${stem(p)} - 音楽プレーヤー`);
    try {
      if (url) URL.revokeObjectURL(url);
      url = await urlFor(p);
      audio.src = url;
      if (autoplay) { ensureAudio(); await audio.play(); sound.play('select'); }
      say(autoplay ? `「${stem(p)}」を鳴らしています。` : `「${stem(p)}」を選びました。`);
      log('player.play', { path: p, autoplay }, 'ok');
      mediaSession(p);
    } catch (e) {
      say(`「${stem(p)}」を鳴らせませんでした。`); log('player.play', { path: p }, 'error: ' + e.message);
      if (autoplay) { const n = L.afterEnd({ order, index, repeat: repeat === 'one' ? 'none' : repeat }); if (n >= 0 && n !== i) setTimeout(() => playAt(n), 400); }
    }
  }
  function toggle() {
    if (index < 0) { if (list.length) playAt(order[0] ?? 0); else sound.play('error'); return; }
    if (!audio.src) { playAt(index); return; }
    if (audio.paused) { ensureAudio(); audio.play(); } else audio.pause();
  }
  function stop() { audio.pause(); audio.currentTime = 0; say('止めました。'); log('player.stop', {}, 'ok'); }
  // 窓を閉じるとき: 音・描画・音の文脈・URL・知らせの受け取りを全部止める（2回呼ばれても困らないように）
  function stopAll() {
    cancelAnimationFrame(raf); raf = 0;
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (url) { URL.revokeObjectURL(url); url = null; }
    os.events.removeEventListener('settings', onSettings);
    if (ac) { ac.close().catch(() => {}); ac = null; analyser = null; gain = null; }
    if ('mediaSession' in navigator) { navigator.mediaSession.metadata = null; for (const k of ['play', 'pause', 'previoustrack', 'nexttrack', 'stop']) try { navigator.mediaSession.setActionHandler(k, null); } catch { /* 使えない操作 */ } }
  }
  audio.addEventListener('ended', () => { const n = L.afterEnd({ order, index, repeat }); log('player.ended', { index, next: n }, 'ok'); if (n >= 0) playAt(n); else { say('一覧の最後まで鳴らしました。'); updateButtons(); } });
  // 鳴り始めたら（一時停止からの再開も）、何を鳴らしているかを知らせる
  audio.addEventListener('play', () => { updateButtons(); if (index >= 0) say(`「${stem(list[index])}」を鳴らしています。`); });
  audio.addEventListener('pause', () => { updateButtons(); if (!audio.ended && audio.currentTime > 0 && index >= 0) say('一時停止しました。'); });
  audio.addEventListener('loadedmetadata', () => { q('[data-dur]').textContent = fmt(audio.duration * 1000); });
  audio.addEventListener('timeupdate', () => { q('[data-cur]').textContent = fmt(audio.currentTime * 1000); if (!seeking && audio.duration) q('[data-seek]').value = Math.round((audio.currentTime / audio.duration) * 1000); });
  let seeking = false;
  const seek = q('[data-seek]');
  seek.addEventListener('input', () => { seeking = true; if (audio.duration) q('[data-cur]').textContent = fmt((seek.value / 1000) * audio.duration * 1000); });
  seek.addEventListener('change', () => { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; seeking = false; });
  function updateButtons() {
    const b = q('[data-act="toggle"]'), playing = !audio.paused;
    b.textContent = playing ? '一時停止' : '再生'; b.title = (playing ? '一時停止' : '再生') + '（Space）';
    q('[data-act="shuffle"]').setAttribute('aria-pressed', String(shuffle));
    q('[data-act="repeat"]').textContent = REPEATS.find((r) => r[0] === repeat)[1];
    win.body.querySelectorAll('[data-command="repeat"]').forEach((m) => m.classList.toggle('checked', m.dataset.rep === repeat));
    win.body.querySelector('[data-command="shuffle"]').classList.toggle('checked', shuffle);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : index >= 0 ? 'paused' : 'none';
    if (playing && !raf) loop();
  }
  // パソコンの再生のキー（キーボードの再生・次・前のキー）でも操作できるようにする
  function mediaSession(p) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: stem(p), artist: 'Future OS', album: '音楽プレーヤー' });
      const h = { play: () => toggle(), pause: () => audio.pause(), previoustrack: () => playAt(L.step({ order, index }, -1)), nexttrack: () => playAt(L.step({ order, index }, 1)), stop: () => stop() };
      for (const [k, f] of Object.entries(h)) navigator.mediaSession.setActionHandler(k, f);
    } catch (e) { log('player.mediaSession', {}, 'error: ' + e.message); }
  }

  /* ---------- 表示（帯の高さ・波形）。鳴っていないときと、窓が隠れているときは描かない ---------- */
  function loop() {
    raf = requestAnimationFrame(loop);
    if (audio.paused || win.min || document.hidden || !analyser) { if (audio.paused) { cancelAnimationFrame(raf); raf = 0; drawIdle(); } return; }
    const W = viz.width, H = viz.height, cs = getComputedStyle(win.el);
    const ink = cs.getPropertyValue('--fos-ink').trim() || '#241734';
    vctx.fillStyle = cs.getPropertyValue('--fos-paper').trim() || '#fffdf9'; vctx.fillRect(0, 0, W, H);
    if (mode === 'bars') {
      const d = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(d);
      const n = 32, bw = W / n, g = vctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, cs.getPropertyValue('--fos-aqua').trim() || '#6bf2e3'); g.addColorStop(1, cs.getPropertyValue('--fos-sunset').trim() || '#ff8ec7');
      for (let i = 0; i < n; i++) {
        // 低い音を細かく、高い音をまとめる（対数に近い分け方）
        const a = Math.floor((i / n) ** 2 * d.length * 0.7), b = Math.max(a + 1, Math.floor(((i + 1) / n) ** 2 * d.length * 0.7));
        let v = 0; for (let k = a; k < b; k++) v = Math.max(v, d[k]);
        const h = Math.max(2, (v / 255) * (H - 6));
        vctx.fillStyle = g; vctx.fillRect(i * bw + 2, H - h, bw - 4, h);
        vctx.strokeStyle = ink; vctx.lineWidth = 1; vctx.strokeRect(i * bw + 2.5, H - h + 0.5, bw - 5, h - 1);
      }
    } else {
      const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d);
      vctx.strokeStyle = ink; vctx.lineWidth = 2; vctx.beginPath();
      for (let i = 0; i < d.length; i++) { const x = (i / (d.length - 1)) * W, y = H / 2 - d[i] * (H / 2 - 4); if (i) vctx.lineTo(x, y); else vctx.moveTo(x, y); }
      vctx.stroke();
    }
  }
  function drawIdle() {
    const cs = getComputedStyle(win.el);
    vctx.fillStyle = cs.getPropertyValue('--fos-paper').trim() || '#fffdf9'; vctx.fillRect(0, 0, viz.width, viz.height);
    vctx.strokeStyle = cs.getPropertyValue('--fos-marble-lo').trim() || '#cbbce0'; vctx.lineWidth = 2; vctx.beginPath(); vctx.moveTo(0, viz.height / 2); vctx.lineTo(viz.width, viz.height / 2); vctx.stroke();
  }
  viz.addEventListener('click', () => { mode = mode === 'bars' ? 'wave' : 'bars'; sound.play('toggleOn'); say(mode === 'bars' ? '帯の高さで表示します。' : '波形で表示します。'); if (audio.paused) drawIdle(); });

  /* ---------- 操作 ---------- */
  function moveSel(dir) {
    if (sel < 0) { sound.play('error'); return; }
    const r = L.moveItem(list, sel, dir);
    if (r.to === sel) { sound.play('error'); return; }
    const playingPath = list[index];
    list = r.list;
    // 動かした2行の、今ある行の要素を入れ替える（作り直さない。押したボタンにフォーカスを残す）
    const a = listEl.querySelector(`[data-i="${sel}"]`), b = listEl.querySelector(`[data-i="${r.to}"]`);
    const move = Object.hasOwn(Element.prototype, 'moveBefore') ? (n, ref) => listEl.moveBefore(n, ref) : (n, ref) => listEl.insertBefore(n, ref);
    if (dir < 0) move(a, b); else move(b, a);
    [...listEl.querySelectorAll('li[data-i]')].forEach((li, k) => { li.dataset.i = k; li.querySelector('.pl-num').textContent = k + 1; });
    sel = r.to; index = list.indexOf(playingPath); rebuildOrder(); persist(); markRows();
    say(`「${stem(list[sel])}」を ${sel + 1} 番目にしました。`);
  }
  const acts = {
    prev: () => playAt(L.step({ order, index }, -1)), next: () => playAt(L.step({ order, index }, 1)), toggle, stop,
    shuffle: () => { shuffle = !shuffle; rebuildOrder(); persist(); updateButtons(); say(shuffle ? '順番を混ぜて鳴らします。' : '一覧の順番で鳴らします。'); },
    repeat: () => { repeat = REPEATS[(REPEATS.findIndex((r) => r[0] === repeat) + 1) % REPEATS.length][0]; persist(); updateButtons(); say(REPEATS.find((r) => r[0] === repeat)[1] + '。'); },
    async add() { const p = await os.fileDialog({ mode: 'open', dir: '/音楽', exts: L.AUDIO_EXTS, typeLabel: '音と曲' }); if (p) addPaths([p]); },
    remove() {
      if (sel < 0) { sound.play('error'); return; }
      const wasPlaying = sel === index, name = stem(list[sel]);
      list.splice(sel, 1);
      if (wasPlaying) { audio.pause(); audio.removeAttribute('src'); index = -1; q('[data-title]').textContent = '曲を選んでください。'; }
      else if (index > sel) index--;
      sel = Math.min(sel, list.length - 1); rebuildOrder(); persist(); renderList(); sound.play('trash'); say(`「${name}」を一覧から外しました。`);
    },
    up: () => moveSel(-1), down: () => moveSel(1),
  };
  win.body.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) acts[b.dataset.act]?.(); });
  const cmds = {
    add: acts.add, close: () => win.close(), toggle, stop, prev: acts.prev, next: acts.next,
    async openlist() { const p = await os.fileDialog({ mode: 'open', dir: '/音楽', exts: ['.m3u'], typeLabel: '再生の一覧' }); if (p) loadList(p); },
    async savelist() {
      if (!list.length) { sound.play('error'); say('一覧が空です。'); return; }
      const p = await os.fileDialog({ mode: 'save', dir: '/音楽', name: '再生の一覧.m3u', exts: ['.m3u'], typeLabel: '再生の一覧' });
      if (!p) return;
      try { await fs.write(p, L.toM3U(list), 'audio/x-mpegurl'); os.addRecent(p); say(`「${p}」に保存しました。`); log('player.savelist', { path: p, count: list.length }, 'ok'); }
      catch (e) { os.msgbox({ title: '音楽プレーヤー', text: e.message, icon: 'error' }); log('player.savelist', { path: p }, 'error: ' + e.message); }
    },
    shuffle: () => acts.shuffle(),
    repeat: (d) => { repeat = d.item.dataset.rep; persist(); updateButtons(); },
    about: () => os.msgbox({ title: '音楽プレーヤーについて', icon: 'info', text: 'Future OS 音楽プレーヤー 1.0\n\nWAV・MP3・OGG など、ブラウザが鳴らせる音と、SID 風シンセの曲（.sng）を続けて鳴らします。\n.sng はその場で音にするので、シンセを開かなくても聴けます。\n上の表示を押すと、帯の高さと波形が切り替わります。' }),
  };
  win.body.addEventListener('w95:command', (e) => cmds[e.detail.command]?.(e.detail));
  listEl.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) { sel = +li.dataset.i; markRows(); } });
  listEl.addEventListener('dblclick', (e) => { const li = e.target.closest('li[data-i]'); if (li) playAt(+li.dataset.i); });
  listEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(list.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); markRows(); listEl.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); playAt(sel); }
    else if (e.key === 'Delete') { e.preventDefault(); acts.remove(); }
  });
  win.body.addEventListener('keydown', (e) => {
    if (e.key === ' ' && !e.target.closest('button, input, select, textarea')) { e.preventDefault(); toggle(); }
  });
  q('[data-vol]').value = Math.round(volume * 100);
  q('[data-vol]').addEventListener('input', (e) => { volume = e.target.value / 100; applyVolume(); persist(); });
  win.body.addEventListener('fos:drop-file', (e) => win.addPath(e.detail.path, false));
  win.cleanup = () => stopAll();
  renderList(); rebuildOrder(); updateButtons(); drawIdle();
  if (args.path) await win.addPath(args.path, true);
  log('player.open', { count: list.length }, 'ok');
  return win;
}
