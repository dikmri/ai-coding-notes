// リズムマシン: 打楽器 8 つ × 16 ステップの打ち込み、A〜H の 8 つのパターン、曲の並び、テンポとスイング、
// 打楽器ごとの音量・高さ・長さ・消音・単独、.rhy の保存と読み込み、WAV の書き出し、元に戻す・やり直し。
// 音は drums-voices.mjs が Web Audio で作る（素材ファイルなし）。計算は core/drums.mjs（tests/os-drums.test.mjs）。
// 鳴らす時刻は AudioContext の時刻で 0.12 秒先まで決めておく（setInterval は先読みの見回りに使うだけ）。
import * as R from '../core/drums.mjs';
import { createOutput, trigger } from './drums-voices.mjs';
import { encodeWAV } from '../core/wav.mjs';
import { basename, dirname, stem } from '../core/path.mjs';

const TITLE = 'リズムマシン';
const LOOKAHEAD = 0.12, TICK_MS = 25, SR = 44100;
const KNOBS = [
  { k: 'vol', label: '音量', min: 0, max: 100, step: 1, fmt: (v) => `${v}%` },
  { k: 'tune', label: '高さ', min: -12, max: 12, step: 1, fmt: (v) => (v > 0 ? `+${v} 半音` : v < 0 ? `${v} 半音` : '元の高さ') },
  { k: 'decay', label: '長さ', min: 25, max: 200, step: 5, fmt: (v) => `${v}%` },
];
const HINT = '格子を押して音を置き、Space で再生します。Shift+クリックか右クリックで強く打つ印を付けます。';
let seq = 0; // 窓ごとの id の頭（同じアプリを 2 つ開いても id が重ならないように）
let clip = null; // パターンのコピー（窓をまたいで貼り付けられる）

const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="new" data-status="見本の入った新しい窓を開きます。"><span class="label">新規(<u>N</u>)</span></div>
    <div class="menu-item" data-command="open"><span class="label">開く(<u>O</u>)...</span><span class="shortcut">Ctrl+O</span></div>
    <div class="menu-item" data-command="save"><span class="label">上書き保存(<u>S</u>)</span><span class="shortcut">Ctrl+S</span></div>
    <div class="menu-item" data-command="saveas"><span class="label">名前を付けて保存(<u>A</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="wav" data-status="パターン 1 つか曲全体を WAV 形式の音声にして、仮想ドライブへ保存します。"><span class="label">WAV で書き出す(<u>W</u>)...</span></div>
    <div class="menu-item" data-command="wavpc" data-status="パターン 1 つか曲全体を WAV 形式の音声にして、パソコンへ保存します。"><span class="label">パソコンへ WAV を書き出す(<u>X</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>C</u>)</span></div>
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="undo"><span class="label">元に戻す(<u>U</u>)</span><span class="shortcut">Ctrl+Z</span></div>
    <div class="menu-item" data-command="redo"><span class="label">やり直し(<u>R</u>)</span><span class="shortcut">Ctrl+Y</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="copy"><span class="label">パターンをコピー(<u>C</u>)</span><span class="shortcut">Ctrl+C</span></div>
    <div class="menu-item" data-command="paste"><span class="label">パターンに貼り付け(<u>P</u>)</span><span class="shortcut">Ctrl+V</span></div>
    <div class="menu-item" data-command="clear"><span class="label">パターンを空にする(<u>E</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="unmute" data-status="すべての打楽器の消音（M）と単独（S）を外します。"><span class="label">消音と単独をすべて外す(<u>M</u>)</span></div>
  </div></div>
  <div class="menu-title">パターン(<u>T</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="patnext"><span class="label">次のパターン(<u>N</u>)</span><span class="shortcut">PageDown</span></div>
    <div class="menu-item" data-command="patprev"><span class="label">前のパターン(<u>B</u>)</span><span class="shortcut">PageUp</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="songadd" data-status="いま表示しているパターンを、曲の並びの最後に足します。"><span class="label">曲の並びの最後に足す(<u>A</u>)</span></div>
  </div></div>
  <div class="menu-title">再生(<u>P</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="toggle"><span class="label">再生と停止(<u>S</u>)</span><span class="shortcut">Space・F5</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="mode:pattern" data-radio="mode"><span class="label">パターンを繰り返す(<u>L</u>)</span></div>
    <div class="menu-item" data-command="mode:song" data-radio="mode"><span class="label">曲を通す(<u>G</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item checked" data-toggle="check" data-command="follow" data-status="曲を通すとき、鳴っているパターンを格子に表示します。"><span class="label">再生位置を追う(<u>F</u>)</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="help"><span class="label">使い方(<u>H</u>)</span><span class="shortcut">F1</span></div>
    <div class="menu-item" data-command="about"><span class="label">リズムマシンについて(<u>A</u>)</span></div>
  </div></div>
</div>`;

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log } = os;
  const id = `dr${++seq}`;
  let path = args.path || null, s = R.sampleRhythm(), dirty = false;
  if (path) {
    try { s = R.normalizeRhythm(JSON.parse(await fs.readText(path))); log('drums.load', { path }, 'ok'); }
    catch (e) {
      log('drums.load', { path }, 'error: ' + e.message);
      const why = e instanceof SyntaxError ? 'ファイルの中身が JSON の形になっていません。メモ帳で開くと、どこが崩れているかを確かめられます。' : e.message;
      os.msgbox({ title: TITLE, text: `${basename(path)} を読めませんでした。\n\n${why}\n\n見本の入った状態で開きます。`, icon: 'error' });
      path = null;
    }
  }
  const hist = R.createHistory(100);
  let cur = { r: 0, c: 0 }, follow = true, pending = null, paint = null;

  const win = wm.open({
    app: 'drums', icon: 'icons/drums.svg', className: 'app-drums', w: 980, h: 620, ...rect, args: path ? { path } : {},
    render(w) {
      const cols = Array.from({ length: R.STEPS }, (_, c) => c);
      const grp = (c) => (Math.floor(c / 4) % 2 ? ' odd' : '') + (c % 4 === 0 ? ' beat' : '');
      w.body.innerHTML = MENU + `
      <div class="dr-main">
        <div class="dr-transport">
          <button type="button" class="dr-play" data-act="toggle" data-status="パターンか曲を鳴らします。もう一度押すと止まります（Space・F5）。">▶ 再生(<u>R</u>)</button>
          <div class="dr-modes" role="radiogroup" aria-label="再生のしかた">
            <label><input type="radio" name="${id}-mode" value="pattern" data-mode> パターンを繰り返す(<u>L</u>)</label>
            <label><input type="radio" name="${id}-mode" value="song" data-mode> 曲を通す(<u>S</u>)</label>
          </div>
          <div class="dr-knob"><label for="${id}-bpm">テンポ(<u>B</u>)</label><input type="range" id="${id}-bpm" data-t="bpm" min="40" max="240" step="1"><input type="number" class="dr-bpmnum" data-bpmnum min="40" max="240" step="1" aria-label="テンポの数（BPM）"><span class="dr-unit">BPM</span></div>
          <div class="dr-knob"><label for="${id}-swing">スイング(<u>W</u>)</label><input type="range" id="${id}-swing" data-t="swing" min="0" max="75" step="1" data-status="裏のステップを遅らせて、はねるリズムにします。67% ほどで 3 連符のはねになります。"><output for="${id}-swing" data-out="swing"></output></div>
          <div class="dr-knob"><label for="${id}-vol">音量(<u>O</u>)</label><input type="range" id="${id}-vol" data-t="volume" min="0" max="100" step="1"><output for="${id}-vol" data-out="volume"></output></div>
        </div>
        <div class="dr-bars">
          <div class="dr-patbar">
            <span class="dr-cap" id="${id}-patcap">パターン</span>
            <div class="dr-pats" role="group" aria-labelledby="${id}-patcap">${R.LETTERS.map((c) => `<button type="button" class="flat dr-pat" data-pat="${c}" aria-pressed="false" data-own-sound>${c}<i class="dr-dot" aria-hidden="true"></i></button>`).join('')}</div>
            <button type="button" class="dr-tool" data-act="copy" data-status="表示しているパターンをコピーします（Ctrl+C）。">コピー(<u>C</u>)</button>
            <button type="button" class="dr-tool" data-act="paste" data-status="コピーしたパターンを、表示しているパターンに貼り付けます（Ctrl+V）。">貼り付け(<u>V</u>)</button>
            <button type="button" class="dr-tool" data-act="clear" data-status="表示しているパターンの音を全部消します。元に戻すで戻せます。">空にする(<u>X</u>)</button>
          </div>
          <div class="dr-songbar">
            <label for="${id}-song">曲の並び(<u>G</u>)</label>
            <input type="text" id="${id}-song" class="dr-song" data-song spellcheck="false" autocomplete="off" aria-describedby="${id}-songhint">
            <button type="button" class="dr-tool" data-act="songadd">今のパターンを足す(<u>N</u>)</button>
            <ol class="dr-chips" role="list" data-chips aria-label="曲の並びの順"></ol>
            <span class="dr-hint" id="${id}-songhint">A〜H の文字を空白で区切って並べます。</span>
          </div>
        </div>
        <div class="dr-rack" data-rack>
          <div class="dr-grid" role="grid" aria-label="打ち込みの格子" aria-describedby="${id}-gridhint" aria-rowcount="${R.INSTRUMENTS.length + 1}" aria-colcount="${R.STEPS + 1}">
            <div role="row" class="dr-row dr-head"><span role="columnheader" class="dr-name">楽器</span>${cols.map((c) => `<span role="columnheader" class="dr-colnum${grp(c)}" data-col="${c}">${c + 1}</span>`).join('')}</div>
            ${R.INSTRUMENTS.map((ins, r) => `<div role="row" class="dr-row"><span role="rowheader" class="dr-name" id="${id}-n${r}" data-preview="${r}" title="押すと${ins.name}を鳴らします">${ins.name}</span>${cols.map((c) => `<span role="gridcell" class="dr-cell${grp(c)}"><button type="button" class="flat dr-step" data-r="${r}" data-c="${c}" tabindex="-1" aria-pressed="false" data-own-sound></button></span>`).join('')}</div>`).join('')}
          </div>
          <div class="dr-mixer" role="group" aria-label="打楽器ごとの音">
            <div class="dr-mrow dr-head" aria-hidden="true"><span></span><span>M</span><span>S</span>${KNOBS.map((k) => `<span id="${id}-h${k.k}">${k.label}</span>`).join('')}</div>
            ${R.INSTRUMENTS.map((ins, r) => `<div class="dr-mrow" data-row="${r}">
              <button type="button" class="flat dr-mini dr-hit" data-hit="${r}" aria-label="${ins.name}を鳴らす" data-own-sound>♪</button>
              <button type="button" class="flat dr-mini dr-ms" data-mute="${r}" aria-pressed="false" aria-label="M ${ins.name}の消音" data-status="M: この打楽器を鳴らしません。">M</button>
              <button type="button" class="flat dr-mini dr-ms" data-solo="${r}" aria-pressed="false" aria-label="S ${ins.name}の単独" data-status="S: 単独を付けた打楽器だけを鳴らします。">S</button>
              ${KNOBS.map((k) => `<input type="range" data-kk="${k.k}" data-row="${r}" min="${k.min}" max="${k.max}" step="${k.step}" aria-labelledby="${id}-h${k.k} ${id}-n${r}">`).join('')}
            </div>`).join('')}
          </div>
        </div>
        <p class="dr-hint dr-gridhint" id="${id}-gridhint">押すと打つ・消す。Shift+クリックか右クリックで強く打つ（◆）。矢印キーで動き、Space か Enter で打つ・消す、Shift+Enter で強く。</p>
      </div>
      <div class="status-bar"><div class="status-field" data-status>${HINT}</div><div class="status-field dr-s2" data-s2></div><div class="status-field dr-s3" data-s3></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      if (!dirty) return true;
      const a = await os.msgbox({ title: TITLE, text: `${path ? basename(path) : '無題'} は変更されています。\n\n保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') return await save();
      return true;
    },
  });
  // 窓の空いた所を押しても窓の中にフォーカスが残るようにする（Space の再生と停止が効くように）
  win.body.tabIndex = -1;
  const B = (q) => win.body.querySelector(q), A = (q) => win.body.querySelectorAll(q);
  const cells = R.INSTRUMENTS.map((_, r) => [...A(`.dr-step[data-r="${r}"]`)]);
  const colHeads = [...A('.dr-colnum')];
  const rack = B('[data-rack]');
  const statusEl = B('.status-field[data-status]');
  const pat = () => s.patterns[s.current];
  const title = () => win.setTitle(`${dirty ? '*' : ''}${path ? basename(path) : '無題'} - ${TITLE}`);
  // 状態の帯の左の欄に出す。説明文（data-status）が出ている間は、説明が消えたあとに出す
  function say(t) { statusEl.textContent = t; if (statusEl.dataset.saved !== undefined) statusEl.dataset.saved = t; }
  function touch() { dirty = true; title(); }

  /* ----- 音 ----- */
  let ac = null, out = null, audioErr = null;
  function audio() {
    if (audioErr) return null;
    try {
      if (!ac) {
        ac = new AudioContext({ latencyHint: 'interactive' });
        out = createOutput(ac, s.volume);
        log('drums.audio', { rate: ac.sampleRate }, 'ok');
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    } catch (e) {
      audioErr = e.message; log('drums.audio', {}, 'error: ' + e.message);
      say(`音を鳴らせません（${e.message}）。打ち込みと WAV の書き出しは使えます。`);
      return null;
    }
  }
  function preview(r, gain = 1) {
    const ctx = audio(); if (!ctx) return;
    trigger(ctx, out.input, r, ctx.currentTime + 0.005, gain, s.kit[r]);
  }
  function setMaster() { if (out) out.master.gain.setTargetAtTime(R.levelOf(s.volume), ac.currentTime, 0.02); }

  /* ----- 再生（先読みで AudioContext の時刻に予約する） ----- */
  let play = null, session = null, timer = 0, raf = 0;
  function start() {
    const ctx = audio();
    if (!ctx) { os.msgbox({ title: TITLE, text: `音を鳴らせません。\n\n${audioErr}\n\nWAV の書き出しは使えます。`, icon: 'warning' }); return; }
    stop(true);
    session = ctx.createGain(); session.connect(out.input);
    const order = R.playOrder(s, s.mode);
    play = { mode: s.mode, order, bar: order[0], pos: { slot: 0, step: 0, time: ctx.currentTime + 0.06 }, queue: [], shown: null };
    timer = setInterval(schedule, TICK_MS);
    schedule();
    raf = requestAnimationFrame(frame);
    drawTransport();
    log('drums.play', { mode: s.mode, pattern: s.current, song: s.song.join(' '), bpm: s.bpm }, 'ok');
  }
  function schedule() {
    const p = play; if (!p) return;
    const now = ac.currentTime;
    // 窓が隠れて見回りが遅れたときは、過ぎた分を鳴らさずに飛ばす（遅れた音をまとめて鳴らさないため）
    while (p.pos.time < now - 0.05) nextStep(p, false);
    // ブラウザは隠れたタブの見回りを 1 秒に 1 回へ減らすので、隠れている間は先読みを長くして音を途切れさせない
    const ahead = document.hidden ? 1.5 : LOOKAHEAD;
    while (p.pos.time < now + ahead) nextStep(p, true);
  }
  function nextStep(p, sound) {
    if (p.pos.step === 0) {
      // 小節の頭で、鳴らすパターンを決める（再生中の切り替えは次の小節から効く）
      p.mode = s.mode;
      if (p.mode === 'song') {
        p.order = R.playOrder(s, 'song');
        if (p.pos.slot >= p.order.length) p.pos.slot = 0;
        p.bar = p.order[p.pos.slot];
      } else { p.pos.slot = 0; p.order = [s.current]; p.bar = s.current; }
    }
    const { slot, step, time } = p.pos, t = time + R.swingOffset(step, s.bpm, s.swing);
    if (sound) {
      const rows = s.patterns[p.bar], on = R.audible(s.kit);
      for (let i = 0; i < R.INSTRUMENTS.length; i++) {
        const v = rows[i][step];
        if (v && on[i]) trigger(ac, session, i, t, R.stepGain(v), s.kit[i]);
      }
      p.queue.push({ t, slot, step, bar: p.bar, mode: p.mode, len: p.order.length });
    }
    p.pos = R.advance(p.pos, p.mode === 'song' ? p.order.length : 1, s.bpm);
  }
  // 画面: 鳴った時刻を過ぎたステップを光らせる
  function frame() {
    if (!play) return;
    const now = ac.currentTime;
    let hit = null;
    while (play.queue.length && play.queue[0].t <= now) hit = play.queue.shift();
    if (hit) showPos(hit);
    raf = requestAnimationFrame(frame);
  }
  function showPos(h) {
    play.shown = h;
    if (follow && h.mode === 'song' && h.bar !== s.current) { s.current = h.bar; drawPattern(); }
    markColumn(h.bar === s.current ? h.step : -1);
    A('.dr-chip').forEach((li, i) => li.classList.toggle('now', h.mode === 'song' && i === h.slot));
    drawPos();
  }
  let litCol = -1;
  function markColumn(c) {
    if (c === litCol) return;
    if (litCol >= 0) { colHeads[litCol].classList.remove('play'); for (const row of cells) row[litCol].classList.remove('play'); }
    litCol = c;
    if (c >= 0) { colHeads[c].classList.add('play'); for (const row of cells) row[c].classList.add('play'); }
  }
  function stop(quiet) {
    if (!play) return;
    clearInterval(timer); cancelAnimationFrame(raf);
    const g = session;
    if (g) { g.gain.setTargetAtTime(0, ac.currentTime, 0.012); setTimeout(() => { try { g.disconnect(); } catch { /* 片付け済み */ } }, 400); }
    session = null; play = null;
    markColumn(-1); A('.dr-chip.now').forEach((li) => li.classList.remove('now'));
    drawTransport(); drawPos();
    if (!quiet) log('drums.stop', {}, 'ok');
  }
  const toggle = () => (play ? stop() : start());

  /* ----- 表示 ----- */
  const stepLabel = (r, c, v) => `${R.INSTRUMENTS[r].name} ${c + 1}${v === 2 ? '、強く' : ''}`;
  function drawCell(r, c) {
    const v = pat()[r][c], el = cells[r][c];
    el.classList.toggle('on', v === 1); el.classList.toggle('acc', v === 2);
    el.setAttribute('aria-pressed', String(v > 0));
    el.setAttribute('aria-label', stepLabel(r, c, v));
    el.textContent = v === 2 ? '◆' : '';
  }
  function drawPattern() {
    for (let r = 0; r < R.INSTRUMENTS.length; r++) for (let c = 0; c < R.STEPS; c++) drawCell(r, c);
    drawPatButtons(); drawCursor(); drawPos();
    if (play?.shown) markColumn(play.shown.bar === s.current ? play.shown.step : -1);
    A('.dr-chip').forEach((li) => li.classList.toggle('cur', li.dataset.c === s.current));
  }
  function drawPatButtons() {
    A('.dr-pat').forEach((b) => {
      const c = b.dataset.pat;
      b.setAttribute('aria-pressed', String(c === s.current));
      b.classList.toggle('used', !R.isEmptyPattern(s.patterns[c]));
    });
  }
  function drawCursor() {
    const v = pat()[cur.r][cur.c];
    B('[data-s2]').textContent = `${R.INSTRUMENTS[cur.r].name} ・ ${cur.c + 1} ・ ${v === 2 ? '強く' : v ? 'ふつう' : '空'}`;
  }
  function drawPos() {
    const h = play?.shown;
    B('[data-s3]').textContent = !play ? `■ 停止 ・ パターン ${s.current} ・ ${s.bpm} BPM`
      : !h ? '▶ 再生' : h.mode === 'song' ? `▶ 曲 ${h.slot + 1}/${h.len} ・ ${h.bar} ・ ${h.step + 1}` : `▶ パターン ${h.bar} ・ ${h.step + 1}`;
  }
  function setRange(el, v, text) { el.value = v; el.setAttribute('aria-valuetext', text); }
  function drawTransport() {
    const btn = B('.dr-play');
    btn.innerHTML = play ? '■ 停止(<u>R</u>)' : '▶ 再生(<u>R</u>)';
    btn.classList.toggle('playing', !!play);
    win.el.classList.toggle('dr-playing', !!play);
    A('[data-mode]').forEach((el) => { el.checked = el.value === s.mode; });
    A('.menu-item[data-radio="mode"]').forEach((el) => { el.classList.add('radio'); el.classList.toggle('checked', el.dataset.command === 'mode:' + s.mode); });
    setRange(B('[data-t="bpm"]'), s.bpm, `${s.bpm} BPM`);
    B('[data-bpmnum]').value = s.bpm;
    setRange(B('[data-t="swing"]'), s.swing, `${s.swing}%`); B('[data-out="swing"]').textContent = `${s.swing}%`;
    setRange(B('[data-t="volume"]'), s.volume, `${s.volume}%`); B('[data-out="volume"]').textContent = `${s.volume}%`;
    drawPos();
  }
  function drawKit() {
    s.kit.forEach((k, r) => {
      B(`[data-mute="${r}"]`).setAttribute('aria-pressed', String(k.mute));
      B(`[data-solo="${r}"]`).setAttribute('aria-pressed', String(k.solo));
      for (const kn of KNOBS) setRange(B(`[data-kk="${kn.k}"][data-row="${r}"]`), k[kn.k], kn.fmt(k[kn.k]));
    });
    const on = R.audible(s.kit);
    A('.dr-row:not(.dr-head)').forEach((row, r) => row.classList.toggle('silent', !on[r]));
    A('.dr-mrow:not(.dr-head)').forEach((row, r) => row.classList.toggle('silent', !on[r]));
  }
  function drawSong() {
    const input = B('[data-song]');
    if (document.activeElement !== input) input.value = s.song.join(' ');
    B('[data-chips]').innerHTML = s.song.map((c, i) => `<li class="dr-chip${c === s.current ? ' cur' : ''}${play?.shown?.mode === 'song' && play.shown.slot === i ? ' now' : ''}" data-c="${c}">${c}</li>`).join('');
  }
  function drawAll() { drawPattern(); drawTransport(); drawKit(); drawSong(); title(); }

  /* ----- 格子のカーソル（ロービング tabindex: 格子の中で Tab で止まるのは 1 つだけ） ----- */
  function setCursor(r, c, focus) {
    cells[cur.r][cur.c].tabIndex = -1;
    cur = { r, c };
    const el = cells[r][c];
    el.tabIndex = 0;
    if (focus) {
      el.focus({ preventScroll: true });
      // 格子の欄の中だけをずらして見せる（scrollIntoView は、はみ出しを隠したデスクトップまでずらすことがあるため使わない）
      const b = el.getBoundingClientRect(), w = rack.getBoundingClientRect(), head = B('.dr-grid .dr-name')?.offsetWidth || 0;
      if (b.left < w.left + head) rack.scrollLeft -= w.left + head - b.left;
      else if (b.right > w.right) rack.scrollLeft += b.right - w.right;
      if (b.top < w.top) rack.scrollTop -= w.top - b.top; else if (b.bottom > w.bottom) rack.scrollTop += b.bottom - w.bottom;
    }
    drawCursor();
  }

  /* ----- 編集 ----- */
  const snap = () => JSON.stringify(s);
  function record() { hist.push(snap()); }
  // つまみ: 動かし始めの状態を覚えておき、離したときに 1 回分の「元に戻す」にする
  function beginEdit() { if (!pending) pending = snap(); }
  function endEdit() { if (!pending) return; hist.push(pending); pending = null; }
  function setStep(r, c, v, rec = true) {
    const row = pat()[r];
    if (row[c] === v) return false;
    if (rec) record();
    row[c] = v; touch(); drawCell(r, c); drawPatButtons();
    if (r === cur.r && c === cur.c) drawCursor();
    if (v && !play) preview(r, R.stepGain(v));
    return true;
  }
  function restore(text) {
    s = JSON.parse(text);
    cur = { r: Math.min(cur.r, 7), c: Math.min(cur.c, 15) };
    setMaster(); drawAll(); touch();
  }
  function selectPattern(c, why = 'button') {
    if (!R.LETTERS.includes(c)) return;
    s.current = c; drawPattern(); drawSong();
    const empty = R.isEmptyPattern(pat());
    say(play && s.mode === 'pattern' && play.bar !== c ? `次の小節から パターン ${c} を鳴らします。` : `パターン ${c} を表示しています。${empty ? '空なので、格子を押して音を置いてください。' : ''}`);
    log('drums.pattern', { pattern: c, why }, 'ok');
  }
  function setMode(m) {
    if (s.mode === m) return;
    s.mode = m; touch(); drawTransport();
    say(play ? `次の小節から${m === 'song' ? '曲を頭から通します' : `パターン ${s.current} を繰り返します`}。` : m === 'song' ? `曲の並び（${s.song.join(' ')}）を通して鳴らします。` : `パターン ${s.current} を繰り返して鳴らします。`);
    log('drums.mode', { mode: m }, 'ok');
  }

  /* ----- 保存と書き出し ----- */
  async function save() {
    if (!path) return saveAs();
    try {
      await fs.write(path, JSON.stringify(R.serialize(s), null, 1), 'application/json');
      dirty = false; os.addRecent(path); title(); say(`保存しました: ${path}`); log('drums.save', { path }, 'ok');
      return true;
    } catch (e) {
      log('drums.save', { path }, 'error: ' + e.message);
      os.msgbox({ title: TITLE, text: `保存できませんでした。\n\n${e.message}`, icon: 'error' });
      return false;
    }
  }
  async function saveAs() {
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/音楽', name: path ? basename(path) : '無題.rhy', exts: ['.rhy'], typeLabel: 'リズムの並び' });
    if (!p) return false;
    path = p; win.setArgs({ path });
    return save();
  }
  const base = () => (path ? stem(path) : 'リズム');
  async function chooseRange(where) {
    const a = await os.msgbox({
      title: where, icon: 'info',
      text: `どこまでを音声にしますか?\n\n曲全体: 曲の並び（${s.song.join(' ')}）を 1 回通します。\nパターン ${s.current}: 表示しているパターンを 1 回鳴らします。\n\n消音（M）と単独（S）は、聞こえているとおりに書き出します。`,
      buttons: [{ label: '曲全体(&S)', value: 'song' }, { label: `パターン ${s.current}(&P)`, value: 'pattern' }, 'キャンセル'],
    });
    return a === 'song' || a === 'pattern' ? a : null;
  }
  // 再生と同じ trigger で、OfflineAudioContext に描き出す（音の作り方が同じなので、聞いたとおりの音になる）
  async function renderWAV(which) {
    const { events, length } = R.renderEvents(s, which), tail = 1.5;
    say('WAV を作っています…');
    const t0 = performance.now();
    const ctx = new OfflineAudioContext(1, Math.ceil((length + tail) * SR), SR), o = createOutput(ctx, s.volume);
    for (const e of events) trigger(ctx, o.input, e.inst, e.time, e.gain, s.kit[e.inst]);
    const buf = await ctx.startRendering();
    const blob = new Blob([encodeWAV([buf.getChannelData(0)], SR)], { type: 'audio/wav' });
    return { blob, sec: length, ms: Math.round(performance.now() - t0), hits: events.length };
  }
  async function exportWAV(toPC) {
    const which = await chooseRange(toPC ? 'パソコンへ WAV を書き出す' : 'WAV で書き出す');
    if (!which) return;
    const name = `${base()}${which === 'pattern' ? ` (${s.current})` : ''}.wav`;
    let p = null;
    if (!toPC) { p = await os.fileDialog({ mode: 'save', dir: '/音楽', name, exts: ['.wav'], typeLabel: 'WAV 音声' }); if (!p) return; }
    try {
      const r = await renderWAV(which);
      if (toPC) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(r.blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        say(`${name} をパソコンへ書き出しました（${fs.human(r.blob.size)}）。`);
      } else {
        await fs.write(p, r.blob);
        say(`書き出しました: ${p}（${r.sec.toFixed(1)} 秒、${fs.human(r.blob.size)}）`);
      }
      os.sound.play('notify');
      log(toPC ? 'drums.wavpc' : 'drums.wav', { path: p, which, bytes: r.blob.size, sec: +r.sec.toFixed(2), hits: r.hits, ms: r.ms }, 'ok');
    } catch (e) {
      log(toPC ? 'drums.wavpc' : 'drums.wav', { path: p, which }, 'error: ' + e.message);
      os.msgbox({ title: TITLE, text: `WAV を書き出せませんでした。\n\n${e.message}`, icon: 'error' });
    }
  }

  /* ----- 命令 ----- */
  const cmds = {
    new: () => os.launch('drums'),
    open: async () => { const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/音楽', exts: ['.rhy'], typeLabel: 'リズムの並び' }); if (p) os.openFile(p, 'drums'); },
    save, saveas: saveAs,
    wav: () => exportWAV(false), wavpc: () => exportWAV(true),
    close: () => win.close(),
    undo: () => {
      endEdit();
      const t = hist.undo(snap());
      if (t == null) { os.sound.play('error'); say('元に戻せる操作はありません。'); return; }
      restore(t); say('元に戻しました。'); log('drums.undo', {}, 'ok');
    },
    redo: () => {
      const t = hist.redo(snap());
      if (t == null) { os.sound.play('error'); say('やり直せる操作はありません。'); return; }
      restore(t); say('やり直しました。'); log('drums.redo', {}, 'ok');
    },
    copy: () => { clip = R.copyPattern(pat()); say(`パターン ${s.current} をコピーしました。`); log('drums.copy', { pattern: s.current }, 'ok'); },
    paste: () => {
      if (!clip) { os.sound.play('error'); say('先にパターンをコピーしてください。'); return; }
      record(); s.patterns[s.current] = R.copyPattern(clip); touch(); drawPattern();
      say(`パターン ${s.current} に貼り付けました。`); log('drums.paste', { pattern: s.current }, 'ok');
    },
    clear: () => {
      if (R.isEmptyPattern(pat())) { say(`パターン ${s.current} はもう空です。`); return; }
      record(); s.patterns[s.current] = R.emptyPattern(); touch(); drawPattern();
      say(`パターン ${s.current} を空にしました。元に戻す（Ctrl+Z）で戻せます。`); log('drums.clear', { pattern: s.current }, 'ok');
    },
    unmute: () => {
      if (!s.kit.some((k) => k.mute || k.solo)) return;
      record(); s.kit.forEach((k) => { k.mute = false; k.solo = false; }); touch(); drawKit(); say('消音と単独をすべて外しました。');
    },
    patnext: () => selectPattern(R.LETTERS[(R.LETTERS.indexOf(s.current) + 1) % 8], 'key'),
    patprev: () => selectPattern(R.LETTERS[(R.LETTERS.indexOf(s.current) + 7) % 8], 'key'),
    songadd: () => {
      record(); s.song.push(s.current); touch(); drawSong();
      say(`曲の並びの最後に ${s.current} を足しました（${s.song.length} 小節）。`); log('drums.song', { song: s.song.join(' ') }, 'ok');
    },
    toggle,
    follow: (d) => { follow = d.checked; },
    help: () => os.msgbox({ title: 'リズムマシンの使い方', icon: 'info', text: '・格子の升を押すと、その拍で打楽器が鳴ります。もう一度押すと消えます。押したまま横へなぞると続けて置けます。\n・Shift+クリックか右クリックで、強く打つ印（◆）を付けます。\n・キーボードでは、矢印キーで升を動き、Space か Enter で打つ・消す、Shift+Enter で強く、Delete で消します。\n・Space か F5 で再生と停止（格子と入力欄の中を除く）。Esc でも止まります。\n・パターンは A〜H の 8 つ。PageUp と PageDown で切り替えます。\n・「曲の並び」に A A B A のように書き、「曲を通す」を選ぶと、その順に鳴らします。\n・右の ♪ で試し打ち、M で消音、S で単独、つまみで音量・高さ・長さを変えます。\n・開いたハイハットは、閉じたハイハットが鳴ると止まります。\n・ファイル メニューの「WAV で書き出す」で、パターン 1 つか曲全体を音声にできます。' }),
    about: () => os.msgbox({ title: 'リズムマシンについて', icon: 'info', text: 'Future OS リズムマシン 1.0\n\n打楽器の音は、録音した素材を使わず、Web Audio の発振器と雑音とフィルターで、鳴らすたびに作っています。\nWAV の書き出しも同じ作り方なので、聞いたとおりの音になります。\n\n保存の形（.rhy）は文字の JSON です。メモ帳で開くと、段が「.」「x」「X」の並びで読めます。' }),
  };
  win.body.addEventListener('w95:command', (e) => {
    const c = e.detail.command;
    if (c.startsWith('mode:')) setMode(c.slice(5));
    else cmds[c]?.(e.detail);
  });

  /* ----- 道具の帯 ----- */
  win.body.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (b) { cmds[b.dataset.act]?.(); return; }
    const pb = e.target.closest('button[data-pat]');
    if (pb) { selectPattern(pb.dataset.pat); return; }
    const hit = e.target.closest('button[data-hit]');
    if (hit) { preview(+hit.dataset.hit); log('drums.hit', { inst: R.INSTRUMENTS[+hit.dataset.hit].id }, 'ok'); return; }
    const name = e.target.closest('[data-preview]');
    if (name) { preview(+name.dataset.preview); return; }
    const ms = e.target.closest('button[data-mute], button[data-solo]');
    if (ms) {
      const r = +(ms.dataset.mute ?? ms.dataset.solo), key = ms.dataset.mute != null ? 'mute' : 'solo';
      record(); s.kit[r][key] = !s.kit[r][key]; touch(); drawKit();
      say(`${R.INSTRUMENTS[r].name}の${key === 'mute' ? '消音' : '単独'}を${s.kit[r][key] ? '付けました' : '外しました'}。`);
      log('drums.' + key, { inst: R.INSTRUMENTS[r].id, on: s.kit[r][key] }, 'ok');
    }
  });
  A('[data-mode]').forEach((el) => el.addEventListener('change', () => { if (el.checked) setMode(el.value); }));
  const KEYS = { bpm: 'bpm', swing: 'swing', volume: 'volume' };
  win.body.querySelector('.dr-transport').addEventListener('input', (e) => {
    const t = e.target, k = KEYS[t.dataset.t];
    if (!k) return;
    beginEdit();
    s[k] = +t.value; touch();
    if (k === 'volume') setMaster();
    drawTransport();
  });
  win.body.querySelector('.dr-transport').addEventListener('change', (e) => {
    const t = e.target;
    if (KEYS[t.dataset.t]) { endEdit(); log('drums.knob', { key: t.dataset.t, value: +t.value }, 'ok'); return; }
    if (t.matches('[data-bpmnum]')) {
      const v = Math.round(+t.value);
      if (!(v >= 40 && v <= 240)) { t.value = s.bpm; os.sound.play('error'); say('テンポは 40〜240 の数で入れてください。'); return; }
      if (v === s.bpm) return;
      record(); s.bpm = v; touch(); drawTransport(); log('drums.knob', { key: 'bpm', value: v }, 'ok');
    }
  });
  const mixer = B('.dr-mixer');
  mixer.addEventListener('input', (e) => {
    const t = e.target; if (!t.dataset.kk) return;
    const r = +t.dataset.row, kn = KNOBS.find((q) => q.k === t.dataset.kk);
    beginEdit();
    s.kit[r][kn.k] = +t.value; touch();
    t.setAttribute('aria-valuetext', kn.fmt(+t.value));
    say(`${R.INSTRUMENTS[r].name}の${kn.label}: ${kn.fmt(+t.value)}`);
  });
  mixer.addEventListener('change', (e) => {
    const t = e.target; if (!t.dataset.kk) return;
    endEdit();
    const r = +t.dataset.row;
    if (!play) preview(r);
    log('drums.knob', { inst: R.INSTRUMENTS[r].id, key: t.dataset.kk, value: +t.value }, 'ok');
  });
  const songInput = B('[data-song]');
  songInput.addEventListener('change', () => {
    const { order, ignored } = R.parseOrder(songInput.value);
    if (!order.length) { songInput.value = s.song.join(' '); os.sound.play('error'); say('曲の並びには、A〜H のパターンの文字を 1 つ以上書いてください。'); return; }
    if (order.join() !== s.song.join()) { record(); s.song = order; touch(); }
    songInput.value = order.join(' ');
    drawSong();
    say(ignored.length ? `A〜H 以外の文字（${[...new Set(ignored)].join(' ')}）は外しました。曲の並び: ${order.length} 小節` : `曲の並び: ${order.length} 小節`);
    log('drums.song', { song: order.join(' '), ignored: ignored.join('') }, 'ok');
  });
  songInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); songInput.dispatchEvent(new Event('change')); } });

  /* ----- 格子: 押す・なぞる・右クリック・キーボード ----- */
  const grid = B('.dr-grid');
  const stepOf = (el) => (el ? { r: +el.dataset.r, c: +el.dataset.c } : null);
  grid.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.dr-step'); if (!el) return;
    if (e.button !== 0 && e.button !== 2) return;
    const { r, c } = stepOf(el), v = pat()[r][c];
    setCursor(r, c, false);
    const accent = e.button === 2 || e.shiftKey;
    const nv = accent ? R.toggleAccent(v) : R.toggleStep(v);
    setStep(r, c, nv);
    log('drums.step', { pattern: s.current, inst: R.INSTRUMENTS[r].id, step: c + 1, value: nv, by: e.pointerType + (accent ? '+accent' : '') }, 'ok');
    // 左ボタンで押したまま動かすと、同じ値を続けて置く（マウスだけ。指で押すと画面が動かせなくなるため）
    if (e.button === 0 && !accent && e.pointerType === 'mouse') paint = { v: nv, n: 1 };
  });
  grid.addEventListener('pointerover', (e) => {
    if (!paint || !(e.buttons & 1)) return;
    const el = e.target.closest('.dr-step'); if (!el) return;
    const { r, c } = stepOf(el);
    if (setStep(r, c, paint.v, false)) paint.n++;
  });
  const endPaint = () => { if (paint && paint.n > 1) log('drums.paint', { pattern: s.current, value: paint.v, count: paint.n }, 'ok'); paint = null; };
  window.addEventListener('pointerup', endPaint);
  grid.addEventListener('contextmenu', (e) => { if (e.target.closest('.dr-step')) e.preventDefault(); });
  // キーボードで押したとき（Space・Enter）の click。ポインタの click は pointerdown で済ませているので、detail が 0 のときだけ扱う
  grid.addEventListener('click', (e) => {
    const el = e.target.closest('.dr-step'); if (!el || e.detail !== 0) return;
    const { r, c } = stepOf(el), nv = R.toggleStep(pat()[r][c]);
    setStep(r, c, nv);
    log('drums.step', { pattern: s.current, inst: R.INSTRUMENTS[r].id, step: c + 1, value: nv, by: 'key' }, 'ok');
  });
  grid.addEventListener('focusin', (e) => { const el = e.target.closest('.dr-step'); if (el) { const { r, c } = stepOf(el); if (r !== cur.r || c !== cur.c) setCursor(r, c, false); } });
  grid.addEventListener('keydown', (e) => {
    const el = e.target.closest('.dr-step'); if (!el || e.isComposing || e.defaultPrevented) return;
    const k = e.key;
    if (e.shiftKey && (k === 'Enter' || k === ' ') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (e.repeat) return;
      const nv = R.toggleAccent(pat()[cur.r][cur.c]);
      setStep(cur.r, cur.c, nv);
      log('drums.step', { pattern: s.current, inst: R.INSTRUMENTS[cur.r].id, step: cur.c + 1, value: nv, by: 'key+accent' }, 'ok');
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[k];
    if (d) {
      // 格子の端では回り込まず、キーも横取りしない（欄のスクロールなど、ブラウザの動きに任せる）
      const r = cur.r + d[0], c = cur.c + d[1];
      if (r < 0 || r >= R.INSTRUMENTS.length || c < 0 || c >= R.STEPS) return;
      e.preventDefault(); setCursor(r, c, true);
    } else if (k === 'Home') { e.preventDefault(); setCursor(cur.r, 0, true); }
    else if (k === 'End') { e.preventDefault(); setCursor(cur.r, R.STEPS - 1, true); }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); setStep(cur.r, cur.c, 0); }
  });

  /* ----- 窓のどこでも効くキー ----- */
  win.body.addEventListener('keydown', (e) => {
    if (e.isComposing || e.defaultPrevented) return;
    const t = e.target, typing = t.matches('input[type=text], input[type=number], select, textarea');
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'F5') { e.preventDefault(); toggle(); }
    else if (k === 'F8' || (k === 'Escape' && play)) { e.preventDefault(); stop(); }
    else if (k === 'F1') { e.preventDefault(); cmds.help(); }
    else if (e.ctrlKey && !e.altKey && k === 's') { e.preventDefault(); save(); }
    else if (e.ctrlKey && !e.altKey && k === 'o') { e.preventDefault(); cmds.open(); }
    else if (typing) return;
    else if (e.ctrlKey && !e.altKey && k === 'z') { e.preventDefault(); e.shiftKey ? cmds.redo() : cmds.undo(); }
    else if (e.ctrlKey && !e.altKey && k === 'y') { e.preventDefault(); cmds.redo(); }
    else if (e.ctrlKey && !e.altKey && k === 'c' && !String(getSelection())) { e.preventDefault(); cmds.copy(); }
    else if (e.ctrlKey && !e.altKey && k === 'v') { e.preventDefault(); cmds.paste(); }
    else if ((k === 'PageDown' || k === 'PageUp') && !t.matches('input[type=range]') && !e.ctrlKey && !e.altKey) { e.preventDefault(); cmds[k === 'PageDown' ? 'patnext' : 'patprev'](); }
    // Space: ボタン・チェック・ラジオの上では、その部品を押す（ブラウザの決まりどおり）。それ以外では再生と停止
    else if (k === ' ' && !e.ctrlKey && !e.altKey && !t.matches('button, input[type=checkbox], input[type=radio]')) { e.preventDefault(); if (!e.repeat) toggle(); }
  });
  win.body.addEventListener('fos:drop-file', (e) => os.openFile(e.detail.path));

  win.cleanup = () => {
    stop(true);
    window.removeEventListener('pointerup', endPaint);
    if (ac) { ac.close().catch(() => {}); ac = null; }
    log('drums.close', { path }, 'ok');
  };
  drawAll();
  setCursor(0, 0, false);
  B('.dr-play').focus({ preventScroll: true });
  say(HINT);
  log('drums.open', { path }, 'ok');
  return win;
}
