// 音声エディタ: 仮想ドライブの音（WAV・MP3・Ogg など）を波形で見て、範囲を選んで切り取り・コピー・貼り付け・削除・無音・トリミングをする。
// 効果（音量・ノーマライズ・フェード・逆再生・直流のずれ）、元に戻す・やり直し（回数とメモリの上限つき）、再生（最初から・カーソルから・範囲だけ・くり返し）。
// WAV（16 ビット）で /音楽 へ保存し、パソコンへ書き出せる。パソコンのファイルを窓へ落としても開ける。
// 計算は core/wave.mjs（テストは tests/os-wave.test.mjs）、WAV の書き出しは core/wav.mjs。
import * as W from '../core/wave.mjs';
import { encodeWAV } from '../core/wav.mjs';
import { AUDIO_EXTS } from '../core/playlist.mjs';
import { basename, dirname, extname } from '../core/path.mjs';

const OPEN_EXTS = AUDIO_EXTS.filter((e) => e !== '.sng');
const RATES = [8000, 16000, 22050, 32000, 44100, 48000];
const RULER = 24; // 時間の目盛りの高さ（画素）
const SCROLL_MAX = 1e6; // 横のスクロールの中身の幅の上限（長い音を拡大しても、ブラウザの扱える幅を越えないように割合で動かす）
// 切り取り・コピーした音。音声エディタの窓どうしで共有する（別の窓へ貼れる）
let clipboard = null;

const item = (cmd, label, key = '', hint = '') => `<div class="menu-item" data-command="${cmd}"${hint ? ` data-status="${hint}"` : ''}><span class="label">${label}</span>${key ? `<span class="shortcut">${key}</span>` : ''}</div>`;
const SEP = '<div class="menu-separator"></div>';
const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    ${item('new', '新規(<u>N</u>)...', '', '長さと標本化の周波数を選んで、無音の新しい音を作ります。')}
    ${item('open', '開く(<u>O</u>)...', 'Ctrl+O')}
    ${SEP}
    ${item('save', '上書き保存(<u>S</u>)', 'Ctrl+S', 'WAV（16 ビット）で保存します。')}
    ${item('saveas', '名前を付けて保存(<u>A</u>)...')}
    ${item('export', 'パソコンへ書き出す(<u>E</u>)', '', 'WAV のファイルをパソコンに保存します。')}
    ${SEP}
    ${item('close', '閉じる(<u>X</u>)')}
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    ${item('undo', '元に戻す(<u>U</u>)', 'Ctrl+Z')}
    ${item('redo', 'やり直し(<u>R</u>)', 'Ctrl+Y')}
    ${SEP}
    ${item('cut', '切り取り(<u>T</u>)', 'Ctrl+X')}
    ${item('copy', 'コピー(<u>C</u>)', 'Ctrl+C')}
    ${item('paste', '貼り付け(<u>P</u>)', 'Ctrl+V', '範囲が無ければカーソルの位置へ挿入し、範囲があれば置き換えます。')}
    ${item('delete', '削除(<u>D</u>)', 'Delete')}
    ${SEP}
    ${item('silence', '無音にする(<u>N</u>)', '', '選んだ範囲を、長さを変えずに無音にします。')}
    ${item('trim', '選んだ範囲だけ残す(<u>K</u>)', '', '選んだ範囲の前と後ろを捨てます。')}
    ${SEP}
    ${item('selectall', 'すべて選択(<u>A</u>)', 'Ctrl+A')}
    ${item('deselect', '選択を外す(<u>E</u>)', 'Esc')}
  </div></div>
  <div class="menu-title">効果(<u>C</u>)<div class="menu" role="menu">
    ${item('gain', '音量を変える(<u>V</u>)...', '', '選んだ範囲（無ければ全体）の音量を dB で変えます。')}
    ${item('normalize', 'ノーマライズ(<u>N</u>)...', '', 'いちばん大きい振れ幅を、決めた大きさにそろえます。')}
    ${SEP}
    ${item('fadein', 'フェードイン(<u>I</u>)', '', '選んだ範囲の始めの無音から、だんだん大きくします。')}
    ${item('fadeout', 'フェードアウト(<u>O</u>)', '', '選んだ範囲の終わりへ向けて、だんだん小さくします。')}
    ${SEP}
    ${item('reverse', '逆再生(<u>R</u>)', '', '選んだ範囲の音を、後ろから前へ並べ替えます。')}
    ${item('dc', '直流のずれを取る(<u>D</u>)', '', '波の中心が 0 からずれている分を引きます。')}
  </div></div>
  <div class="menu-title">再生(<u>P</u>)<div class="menu" role="menu">
    ${item('toggle', '再生・停止(<u>P</u>)', 'Space', '範囲があれば範囲を、無ければカーソルから鳴らします。')}
    ${item('playStart', '最初から再生(<u>B</u>)')}
    ${item('playCursor', 'カーソルから再生(<u>C</u>)')}
    ${item('playSel', '選んだ範囲を再生(<u>S</u>)')}
    ${item('stop', '停止(<u>T</u>)')}
    ${SEP}
    <div class="menu-item" data-toggle="check" data-command="loop"><span class="label">くり返し再生(<u>L</u>)</span></div>
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    ${item('zoomin', '拡大(<u>I</u>)', '+')}
    ${item('zoomout', '縮小(<u>O</u>)', '-')}
    ${item('fit', '全体を見る(<u>F</u>)', '0')}
    ${item('zoomsel', '選んだ範囲に合わせる(<u>S</u>)')}
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    ${item('about', '音声エディタについて(<u>A</u>)')}
  </div></div>
</div>`;
// 道具の帯のボタン: [動作, 文字, 説明]。Alt の文字はメニューの題（F・E・C・P・V・H）と重ならないものを選ぶ
const TOOL_GROUPS = [
  ['再生', [['playStart', '最初から(<u>B</u>)', '最初から再生します'], ['playCursor', 'カーソルから(<u>G</u>)', 'カーソルの位置から再生します（範囲が無いときの Space）'], ['playSel', '範囲を再生(<u>J</u>)', '選んだ範囲だけ再生します（範囲があるときの Space）'], ['stop', '停止(<u>S</u>)', '再生を止めます'], ['loop', 'くり返し(<u>L</u>)', 'くり返し再生の入・切']]],
  ['編集', [['cut', '切り取り(<u>T</u>)', 'Ctrl+X'], ['copy', 'コピー(<u>Y</u>)', 'Ctrl+C'], ['paste', '貼り付け(<u>A</u>)', 'Ctrl+V'], ['delete', '削除(<u>D</u>)', 'Delete'], ['silence', '無音(<u>M</u>)', '選んだ範囲を無音にします'], ['trim', '残す(<u>K</u>)', '選んだ範囲だけ残します']]],
  ['元に戻す', [['undo', '元に戻す(<u>U</u>)', 'Ctrl+Z'], ['redo', 'やり直し(<u>R</u>)', 'Ctrl+Y']]],
  ['表示', [['zoomin', '拡大(<u>I</u>)', '拡大（Ctrl+ホイール、+）'], ['zoomout', '縮小(<u>W</u>)', '縮小（Ctrl+ホイール、-）'], ['fit', '全体(<u>Z</u>)', '全体を見る（0）']]],
];

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound } = os;
  let audio = null, path = null, name = '', dirty = false, sums = [];
  let sel = [0, 0], anchor = 0, head = 0, view = { start: 0, spp: 1 }, cw = 1, ch = 1, dpr = 1, drag = null;
  let ac = null, out = null, src = null, buf = null, play = null, raf = 0, loop = false, lastMsg = '';
  const hist = new W.History();
  const win = wm.open({
    app: 'wave', icon: 'icons/wave.svg', className: 'app-wave', title: '音声エディタ', w: 980, h: 600, ...rect, args: args.path ? { path: args.path } : {},
    render(w) {
      w.body.innerHTML = MENU + `<div class="wv-main">
        <div class="wv-tools" role="toolbar" aria-label="音声エディタの操作" focusgroup="toolbar wrap" aria-controls="wvStage-${w.id}">
          ${TOOL_GROUPS.map(([g, list], gi) => `${gi ? '<span class="wv-sep" role="separator" aria-orientation="vertical"></span>' : ''}<div class="wv-group" role="group" aria-label="${g}">${list.map(([a, label, tip]) => `<button type="button" class="flat wv-btn${a.startsWith('play') ? ' wv-play' : ''}" data-a="${a}" title="${tip}"${a === 'loop' ? ' aria-pressed="false"' : ''}>${label}</button>`).join('')}</div>`).join('')}
        </div>
        <div class="wv-area">
          <div class="wv-stage" id="wvStage-${w.id}" role="application" tabindex="-1" aria-roledescription="波形" aria-label="波形（矢印キーでカーソル、Shift で範囲、Space で再生）" aria-describedby="wvSel-${w.id}" data-stage>
            <canvas class="wv-canvas" aria-hidden="true" data-canvas></canvas>
          </div>
          <div class="wv-empty" data-empty>
            <p class="wv-empty-title">ファイルを開くか、ここへ音声を落としてください。</p>
            <p>WAV・MP3・Ogg などを開けます。音声レコーダーで録った音も、そのまま開けます。</p>
            <div class="wv-empty-btns"><button type="button" class="default" data-a="open">開く(<u>O</u>)...</button><button type="button" data-a="new">新しい音(<u>N</u>)...</button><button type="button" data-a="sample">見本の音(<u>X</u>)</button></div>
          </div>
        </div>
        <div class="wv-scroll" tabindex="-1" data-scroll><div class="wv-spacer" data-spacer></div></div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field wv-selfield" id="wvSel-${w.id}" data-sel></div><div class="status-field wv-fmtfield" data-fmt></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => confirmDiscard('閉じる前に'),
  });
  const q = (s) => win.body.querySelector(s);
  const stage = q('[data-stage]'), canvas = q('[data-canvas]'), ctx = canvas.getContext('2d'), tools = q('.wv-tools'), scroller = q('[data-scroll]'), spacer = q('[data-spacer]');
  const len = () => W.frames(audio);
  const rate = () => audio?.rate || 48000;
  // 状態の帯の文。同じ文が続いても読み上げられるよう、末尾に空白を足して変える
  function say(t) { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m; }
  const secText = (n) => W.fmtTime(n / rate());
  const chName = (n) => (n === 1 ? 'モノラル' : n === 2 ? 'ステレオ' : `${n} チャンネル`);
  const setTitle = () => win.setTitle(`${dirty ? '*' : ''}${name || '無題'} - 音声エディタ`);

  /* ---------- 表示の更新 ---------- */
  function update() {
    const has = !!audio, n = len(), range = sel[1] > sel[0];
    const on = {
      save: has, saveas: has, export: has, undo: hist.undoCount > 0, redo: hist.redoCount > 0,
      cut: range, copy: range, paste: !!clipboard, delete: range, silence: range, trim: range && !(sel[0] === 0 && sel[1] === n),
      selectall: n > 0, deselect: range, gain: n > 0, normalize: n > 0, fadein: n > 0, fadeout: n > 0, reverse: n > 0, dc: n > 0,
      toggle: n > 0, playStart: n > 0, playCursor: n > 0, playSel: range, stop: !!play, loop: true,
      zoomin: n > 0, zoomout: n > 0, fit: n > 0, zoomsel: range,
    };
    for (const [k, v] of Object.entries(on)) {
      win.body.querySelectorAll(`.menu-item[data-command="${k}"], .wv-btn[data-a="${k}"]`).forEach((el) => { if (v) el.removeAttribute('aria-disabled'); else el.setAttribute('aria-disabled', 'true'); });
    }
    q('.wv-btn[data-a="loop"]').setAttribute('aria-pressed', String(loop));
    q('.menu-item[data-command="loop"]').classList.toggle('checked', loop);
    q('[data-empty]').hidden = has;
    stage.classList.toggle('has-audio', has);
    stage.tabIndex = has ? 0 : -1; // 音が無いときは、Tab で空の波形に止まらない
    q('[data-sel]').textContent = has ? W.selectionText(sel, rate()) : '';
    q('[data-fmt]').textContent = has ? `${audio.rate} Hz ・ ${chName(audio.channels.length)} ・ 長さ ${secText(n)}` : '';
    const u = hist.nextUndo, r = hist.nextRedo;
    q('.menu-item[data-command="undo"] .label').innerHTML = `元に戻す${u ? '（' + u.label + '）' : ''}(<u>U</u>)`;
    q('.menu-item[data-command="redo"] .label').innerHTML = `やり直し${r ? '（' + r.label + '）' : ''}(<u>R</u>)`;
    setTitle();
  }
  // 大きさは clientWidth で測る（getBoundingClientRect は、窓が開くときの縮めた動き（scale）まで含んでしまう）
  function resize() {
    dpr = devicePixelRatio || 1; cw = Math.max(1, stage.clientWidth); ch = Math.max(1, stage.clientHeight);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    if (audio) view = W.clampView(view, len(), cw);
    syncScroll(); draw();
  }
  // 横のスクロール: 中身の幅を「音の全体の画素の数」にする（上限 SCROLL_MAX。越えるときは割合で動かす）
  let setLeft = -1;
  function syncScroll() {
    const total = audio ? len() / view.spp : 0;
    spacer.style.width = Math.max(cw, Math.min(SCROLL_MAX, total)) + 'px';
    const maxStart = Math.max(0, len() - cw * view.spp), room = scroller.scrollWidth - scroller.clientWidth;
    const left = maxStart && room > 0 ? (view.start / maxStart) * room : 0;
    if (Math.abs(scroller.scrollLeft - left) >= 1) { setLeft = Math.round(left); scroller.scrollLeft = left; }
  }
  scroller.addEventListener('scroll', () => {
    if (Math.abs(scroller.scrollLeft - setLeft) <= 1) { setLeft = -1; return; } // こちらで動かした分
    setLeft = -1;
    if (!audio) return;
    const maxStart = Math.max(0, len() - cw * view.spp), room = scroller.scrollWidth - scroller.clientWidth;
    view = { ...view, start: room > 0 ? (scroller.scrollLeft / room) * maxStart : 0 };
    draw();
  });
  function setView(v) { view = W.clampView(v, len(), cw); syncScroll(); draw(); }

  /* ---------- 描く ---------- */
  function draw() {
    const cs = getComputedStyle(win.el), css = (n, d) => cs.getPropertyValue(n).trim() || d;
    const ink = css('--fos-ink', '#241734'), paper = css('--fos-paper', '#fffdf9'), marble = css('--fos-marble', '#f4eef8'), lo = css('--fos-marble-lo', '#cbbce0');
    const muted = css('--fos-ink-muted', '#6e5d85'), cobalt = css('--fos-cobalt', '#4b5fe8'), rose = css('--fos-rose', '#ff5c97'), mono = css('--fos-mono', 'monospace');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = paper; ctx.fillRect(0, 0, cw, ch);
    if (!audio) return;
    const n = len(), r = audio.rate, nch = audio.channels.length, laneH = (ch - RULER) / nch;
    const xEnd = Math.min(cw, W.frameToX(view, n));
    // 音の終わりより右は、作業面ではないので大理石の色
    if (xEnd < cw) { ctx.fillStyle = marble; ctx.fillRect(Math.max(0, xEnd), RULER, cw - Math.max(0, xEnd), ch - RULER); }
    // 選んだ範囲
    const x1 = W.frameToX(view, sel[0]), x2 = W.frameToX(view, sel[1]);
    if (sel[1] > sel[0]) { ctx.fillStyle = '#d2fbf5'; ctx.fillRect(Math.max(0, x1), RULER, Math.min(cw, x2) - Math.max(0, x1), ch - RULER); }
    // 時間の目盛り
    ctx.fillStyle = marble; ctx.fillRect(0, 0, cw, RULER);
    ctx.fillStyle = ink; ctx.fillRect(0, RULER - 1.5, cw, 1.5);
    const tk = W.ticks(view.start / r, view.spp / r, cw, 92);
    ctx.font = `11px ${mono}`; ctx.textBaseline = 'middle';
    for (const { x, t } of tk.list) {
      ctx.fillStyle = ink; ctx.fillRect(Math.round(x), RULER - 8, 1, 7);
      ctx.fillStyle = muted; ctx.fillText(W.fmtTick(t, tk.step), Math.round(x) + 4, RULER / 2 - 2);
      ctx.fillStyle = 'rgb(36 23 52 / 0.06)'; ctx.fillRect(Math.round(x), RULER, 1, ch - RULER);
    }
    // チャンネルごとの波形（最大と最小の山の形）
    for (let k = 0; k < nch; k++) {
      const y0 = RULER + k * laneH, mid = y0 + laneH / 2, amp = laneH / 2 - 6, c = audio.channels[k];
      if (k) { ctx.fillStyle = lo; ctx.fillRect(0, y0, cw, 1.5); }
      ctx.fillStyle = lo; ctx.fillRect(0, Math.round(mid), Math.min(cw, xEnd), 1);
      ctx.fillStyle = 'rgb(36 23 52 / 0.08)'; ctx.fillRect(0, Math.round(mid - amp), Math.min(cw, xEnd), 1); ctx.fillRect(0, Math.round(mid + amp), Math.min(cw, xEnd), 1);
      if (view.spp >= 1) {
        const pk = W.columnPeaks(c, view.start, view.spp, cw, sums[k]);
        for (let i = 0; i < cw; i++) {
          const v0 = pk[i * 2], v1 = pk[i * 2 + 1];
          if (Number.isNaN(v0)) continue;
          const ya = mid - Math.min(1, v1) * amp, yb = mid - Math.max(-1, v0) * amp;
          ctx.fillStyle = i >= x1 && i < x2 ? '#2b3596' : cobalt;
          ctx.fillRect(i, ya, 1, Math.max(1, yb - ya));
        }
      } else {
        // 拡大したとき: 標本を線でつなぎ、さらに拡大したら標本の点も描く
        const a = Math.max(0, Math.floor(view.start) - 1), b = Math.min(n, Math.ceil(view.start + cw * view.spp) + 2);
        ctx.strokeStyle = cobalt; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let f = a; f < b; f++) { const x = W.frameToX(view, f), y = mid - Math.max(-1, Math.min(1, c[f])) * amp; if (f === a) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
        if (view.spp <= 1 / 6) { ctx.fillStyle = ink; for (let f = a; f < b; f++) ctx.fillRect(W.frameToX(view, f) - 2, mid - Math.max(-1, Math.min(1, c[f])) * amp - 2, 4, 4); }
      }
      if (nch > 1) { ctx.fillStyle = muted; ctx.font = `700 11px ${mono}`; ctx.textBaseline = 'top'; ctx.fillText(nch === 2 ? (k ? '右' : '左') : String(k + 1), 6, y0 + 4); ctx.font = `11px ${mono}`; ctx.textBaseline = 'middle'; }
    }
    // カーソル（範囲が無いとき）と、範囲の両端
    ctx.fillStyle = ink;
    if (sel[1] > sel[0]) { for (const x of [x1, x2]) if (x >= -1 && x <= cw + 1) ctx.fillRect(Math.round(x) - 0.5, RULER, 1, ch - RULER); }
    else if (x1 >= -2 && x1 <= cw + 2) { ctx.fillRect(Math.round(x1) - 1, RULER, 2, ch - RULER); ctx.beginPath(); ctx.moveTo(x1 - 5, RULER - 7); ctx.lineTo(x1 + 5, RULER - 7); ctx.lineTo(x1, RULER - 1); ctx.fill(); }
    // 再生中の位置
    if (play) {
      const x = W.frameToX(view, curPos() * r);
      if (x >= -2 && x <= cw + 2) { ctx.fillStyle = rose; ctx.fillRect(Math.round(x) - 1, 0, 2, ch); }
    }
  }

  /* ---------- 音を差し替える ---------- */
  function setAudio(a, { fit = false } = {}) {
    audio = a; buf = null;
    sums = a ? a.channels.map((c) => W.summarize(c, 256)) : [];
    if (a) view = fit ? W.fitView(len(), cw) : W.clampView(view, len(), cw);
    syncScroll(); update(); draw();
  }
  function setDoc(a, p, nm, isDirty = false) {
    stopPlay(); hist.clear();
    path = p; name = nm; dirty = isDirty; sel = [0, 0]; anchor = head = 0;
    win.setArgs({ path: p || undefined });
    setAudio(a, { fit: true });
  }
  function setSel(a, b) { sel = W.clampRange(len(), a, b); update(); draw(); }
  // カーソル（動かした端）が見えるように表示をずらす
  function reveal(f) {
    const x = W.frameToX(view, f);
    if (x < 0 || x > cw) setView({ ...view, start: f - cw * view.spp * (x < 0 ? 0.1 : 0.9) });
  }

  /* ---------- ファイル ---------- */
  async function confirmDiscard(when = '') {
    if (!dirty || !audio) return true;
    const a = await os.msgbox({ title: '音声エディタ', text: `${name ? '「' + name + '」' : '無題の音'}は、変更が保存されていません。\n\n${when}保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
    if (a === 'キャンセル' || !a) return false;
    if (a === 'はい') return save();
    return true;
  }
  function ensureAudioContext() {
    if (!ac) {
      ac = new AudioContext(); out = ac.createGain(); out.connect(ac.destination); applyVolume();
      log('wave.audio', { rate: ac.sampleRate }, 'ok');
    }
    return ac;
  }
  // WAV は自分で読む（元の標本化の周波数とビットの値をそのまま保つ）。読めない形や WAV 以外は、ブラウザの読み込み（decodeAudioData）に任せる
  async function decode(data, fileName) {
    let a = null;
    const bytes = new Uint8Array(data, 0, Math.min(12, data.byteLength)), riff = String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF';
    if (riff || /\.wav$/i.test(fileName)) { try { a = W.parseWAV(data); } catch (e) { log('wave.parse', { file: fileName }, 'error: ' + e.message); } }
    if (!a) {
      const ab = await ensureAudioContext().decodeAudioData(data.slice(0));
      a = W.makeAudio(Array.from({ length: ab.numberOfChannels }, (_, k) => ab.getChannelData(k).slice()), ab.sampleRate);
    }
    if (W.frames(a) * a.channels.length > W.MAX_SAMPLES) throw new Error('長すぎるので開けません（ステレオで 11 分ほどまで開けます）。');
    return a;
  }
  async function openPath(p, ask = true) {
    if (ask && !(await confirmDiscard('開く前に'))) return false;
    say(`「${basename(p)}」を読んでいます…`);
    try {
      const a = await decode(await (await fs.readBlob(p)).arrayBuffer(), p);
      setDoc(a, p, basename(p)); os.addRecent(p); sound.play('select');
      say(`「${basename(p)}」を開きました。波形をドラッグして範囲を選び、Space で再生します。`);
      log('wave.open', { path: p, frames: len(), rate: a.rate, channels: a.channels.length }, 'ok');
      stage.focus({ preventScroll: true });
      return true;
    } catch (e) {
      say('開けませんでした。');
      os.msgbox({ title: '音声エディタ', text: `「${basename(p)}」を音として開けませんでした。\n\n${e.message || e.name}`, icon: 'error' });
      log('wave.open', { path: p }, 'error: ' + (e.message || e.name));
      return false;
    }
  }
  // パソコンから落としたファイルは、仮想ドライブには入れずにそのまま開く（保存すると仮想ドライブへ書く）
  async function openLocal(file) {
    if (!(await confirmDiscard('開く前に'))) return;
    try {
      const a = await decode(await file.arrayBuffer(), file.name);
      setDoc(a, null, file.name); sound.play('drop');
      say(`パソコンの「${file.name}」を開きました。保存すると、仮想ドライブに WAV で書きます。`);
      log('wave.drop', { file: file.name, size: file.size, frames: len(), rate: a.rate }, 'ok');
      stage.focus({ preventScroll: true });
    } catch (e) {
      os.msgbox({ title: '音声エディタ', text: `「${file.name}」を音として開けませんでした。\n\n${e.message || e.name}`, icon: 'error' });
      log('wave.drop', { file: file.name }, 'error: ' + (e.message || e.name));
    }
  }
  const wavBlob = () => new Blob([encodeWAV(audio.channels, audio.rate)], { type: 'audio/wav' });
  async function save() {
    if (!audio) return false;
    if (!path || extname(path).toLowerCase() !== '.wav') return saveAs();
    try {
      await fs.write(path, wavBlob(), 'audio/wav');
      dirty = false; os.addRecent(path); update();
      say(`「${basename(path)}」に保存しました（WAV 16 ビット）。`); log('wave.save', { path, frames: len(), rate: audio.rate, channels: audio.channels.length }, 'ok');
      return true;
    } catch (e) {
      os.msgbox({ title: '音声エディタ', text: e.message, icon: 'error' }); log('wave.save', { path }, 'error: ' + e.message);
      return false;
    }
  }
  async function saveAs() {
    if (!audio) return false;
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/音楽', name: W.wavName(path || name), exts: ['.wav'], typeLabel: 'WAV 音声' });
    if (!p) return false;
    path = p; name = basename(p); win.setArgs({ path });
    return save();
  }
  function exportFile() {
    if (!audio) return;
    const a = document.createElement('a'), fileName = W.wavName(path || name);
    a.href = URL.createObjectURL(wavBlob()); a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(`「${fileName}」をパソコンへ書き出しました。`); log('wave.export', { file: fileName, frames: len() }, 'ok');
  }

  /* ---------- 箱（新しい音・音量・ノーマライズ） ---------- */
  // 箱の中身は form method="dialog"。OK（送信）で閉じると returnValue が "ok" になる。Enter でも送信される
  async function ask(title, body, width = 360) {
    const dlg = document.createElement('dialog'), tid = 'wvDlg' + Math.random().toString(36).slice(2, 8);
    dlg.className = 'window dialog wv-dlg'; dlg.style.width = width + 'px'; dlg.setAttribute('aria-labelledby', tid);
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text" id="${tid}"></div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div>
      <form method="dialog" class="window-body">${body}<div class="button-row"><button type="submit" class="default" value="ok">OK</button><button type="button" data-close="">キャンセル</button></div></form>`;
    dlg.querySelector('.title-bar-text').textContent = title;
    document.body.append(dlg);
    const r = await w95.openDialog(dlg);
    const data = new FormData(dlg.querySelector('form'));
    dlg.remove();
    return r === 'ok' ? data : null;
  }
  async function newAudio() {
    if (!(await confirmDiscard('新しい音を作る前に'))) return;
    const d = await ask('新しい音', `<p class="wv-note">無音の音を作ります。録音や貼り付けの土台に使えます。</p>
      <div class="wv-field"><label for="wvLen">長さ（秒）(<u>L</u>):</label><input type="number" id="wvLen" name="sec" value="10" min="0.1" max="600" step="any" required autofocus></div>
      <div class="wv-field"><label for="wvRate">標本化の周波数(<u>R</u>):</label><select id="wvRate" name="rate">${RATES.map((x) => `<option value="${x}"${x === 48000 ? ' selected' : ''}>${x} Hz${x === 44100 ? '（CD と同じ）' : ''}</option>`).join('')}</select></div>
      <fieldset class="wv-field"><legend>チャンネル</legend><label><input type="radio" name="nch" value="1" checked> モノラル(<u>M</u>)</label> <label><input type="radio" name="nch" value="2"> ステレオ(<u>S</u>)</label></fieldset>`);
    if (!d) return;
    const sec = Math.min(600, Math.max(0.1, +d.get('sec') || 10)), r = +d.get('rate') || 48000, nch = +d.get('nch') || 1;
    setDoc(W.blank(sec, r, nch), null, '', false);
    say(`${W.fmtTime(sec)} の無音の音を作りました（${r} Hz・${chName(nch)}）。`); log('wave.new', { sec, rate: r, channels: nch }, 'ok');
    stage.focus({ preventScroll: true });
  }
  function useSample() {
    setDoc(W.sampleTune(44100), null, '見本の音.wav', false);
    say('見本の音を作りました。Space で鳴らし、波形をドラッグして範囲を選んでみてください。'); log('wave.sample', { frames: len() }, 'ok');
    stage.focus({ preventScroll: true });
  }
  const target = () => (sel[1] > sel[0] ? `選んだ範囲（${secText(sel[1] - sel[0])}）` : `全体（${secText(len())}）`);
  const peakDb = () => { const [s, e] = sel[1] > sel[0] ? sel : [0, len()], p = W.peak(W.sliceRegion(audio.channels, s, e)); return p ? `${W.gainToDb(p).toFixed(1).replace('-', '−')} dB` : '無音'; }; // 説明の文と同じ「−」にそろえる
  async function gainDialog() {
    if (!len()) return nothing();
    const d = await ask('音量を変える', `<p class="wv-note">${target()}の音量を変えます。いまの最大は ${peakDb()} です。</p>
      <div class="wv-field"><label for="wvDb">変える量（dB）(<u>D</u>):</label><input type="number" id="wvDb" name="db" value="-6" min="-60" max="24" step="any" required autofocus aria-describedby="wvDbHint"></div>
      <p class="wv-hint" id="wvDbHint">−6 dB でおよそ半分、+6 dB でおよそ 2 倍の振れ幅になります。</p>`);
    if (!d) return;
    const db = +d.get('db');
    applyEffect(`音量 ${db > 0 ? '+' : ''}${db} dB`, (r) => W.gain(r, db));
  }
  async function normalizeDialog() {
    if (!len()) return nothing();
    const d = await ask('ノーマライズ', `<p class="wv-note">${target()}のいちばん大きい振れ幅を、決めた大きさにそろえます。いまの最大は ${peakDb()} です。</p>
      <div class="wv-field"><label for="wvTarget">そろえる大きさ（dB）(<u>T</u>):</label><input type="number" id="wvTarget" name="db" value="-1" min="-30" max="0" step="any" required autofocus aria-describedby="wvTargetHint"></div>
      <p class="wv-hint" id="wvTargetHint">0 dB が音の割れる手前の限界です。−1 dB にすると少し余裕を残せます。</p>`);
    if (!d) return;
    const db = +d.get('db');
    if (W.peak(W.sliceRegion(audio.channels, ...(sel[1] > sel[0] ? sel : [0, len()]))) === 0) { sound.play('error'); say('無音なので、ノーマライズしても変わりません。'); return; }
    applyEffect(`ノーマライズ ${db} dB`, (r) => W.normalize(r, db));
  }

  /* ---------- 編集 ---------- */
  function nothing(msg = '先に音を開くか、新しい音を作ってください。') { sound.play('error'); say(msg); }
  function commit(r, label, after) {
    stopPlay();
    hist.push({ patches: r.patches, label, selBefore: sel.slice(), selAfter: after });
    dirty = true; sel = W.clampRange(W.frames(r.audio), after[0], after[1]); anchor = sel[0]; head = sel[1];
    setAudio(r.audio);
    log('wave.edit', { op: label, sel, frames: len(), undo: hist.undoCount }, 'ok');
  }
  const needRange = () => { if (sel[1] > sel[0]) return true; nothing(audio ? '先に波形をドラッグして範囲を選んでください。' : undefined); return false; };
  function cutSel() {
    if (!needRange()) return;
    const r = W.cut(audio, ...sel); clipboard = r.clip;
    commit(r, '切り取り', [sel[0], sel[0]]); sound.play('trash');
    say(`${secText(W.frames(r.clip))} を切り取りました。「貼り付け」でカーソルの位置へ入れられます。`);
  }
  function copySel() {
    if (!needRange()) return;
    clipboard = W.copy(audio, ...sel); update(); sound.play('select');
    say(`${secText(W.frames(clipboard))} をコピーしました。`); log('wave.copy', { sel, frames: W.frames(clipboard) }, 'ok');
  }
  function pasteClip() {
    if (!clipboard) { nothing('まだ何も切り取り・コピーしていません。'); return; }
    if (!audio) { setDoc(W.makeAudio(clipboard.channels.map((c) => c.slice()), clipboard.rate), null, '', true); say('コピーした音から、新しい音を作りました。'); log('wave.paste', { into: 'new' }, 'ok'); return; }
    const replace = sel[1] > sel[0], r = W.paste(audio, sel[0], sel[1], clipboard);
    commit(r, '貼り付け', [r.start, r.end]); sound.play('drop');
    const notes = [];
    if (clipboard.rate !== audio.rate) notes.push(`${clipboard.rate} Hz の音を ${audio.rate} Hz に直しました`);
    if (clipboard.channels.length !== audio.channels.length) notes.push(`${chName(clipboard.channels.length)}を${chName(audio.channels.length)}にしました`);
    say(`${secText(r.end - r.start)} を${replace ? '置き換えて' : '挿入して'}貼りました。${notes.length ? '（' + notes.join('。') + '）' : ''}`);
  }
  function deleteSel() {
    if (!needRange()) return;
    const d = sel[1] - sel[0];
    commit(W.remove(audio, ...sel), '削除', [sel[0], sel[0]]); sound.play('trash'); say(`${secText(d)} を削除しました。`);
  }
  function silenceSel() {
    if (!needRange()) return;
    commit(W.silence(audio, ...sel), '無音', sel.slice()); sound.play('op'); say(`${secText(sel[1] - sel[0])} を無音にしました。`);
  }
  function trimSel() {
    if (!needRange()) return;
    const r = W.trim(audio, ...sel);
    if (!r) { nothing('全体を選んでいるので、捨てる部分がありません。'); return; }
    const d = sel[1] - sel[0];
    commit(r, '残す', [0, d]); sound.play('trash'); say(`選んだ範囲（${secText(d)}）だけを残しました。`);
  }
  function applyEffect(label, fn) {
    if (!len()) return nothing();
    const before = sel.slice(), r = W.effect(audio, sel[0], sel[1], fn);
    commit(r, label, before); sound.play('op');
    const p = W.peak(W.sliceRegion(audio.channels, r.start, r.end));
    say(`${sel[1] > sel[0] ? '選んだ範囲' : '全体'}に「${label}」をかけました。${p > 1 ? '振れ幅が 1 を越えたので、保存すると音が割れます。' : ''}`);
  }
  function undo() {
    const r = hist.undo(audio);
    if (!r) { nothing('元に戻せる操作がありません。'); return; }
    stopPlay(); dirty = true; sel = r.entry.selBefore; anchor = sel[0]; head = sel[1]; setAudio(r.audio); sound.play('op');
    say(`「${r.entry.label}」を元に戻しました。`); log('wave.undo', { op: r.entry.label, left: hist.undoCount }, 'ok');
  }
  function redo() {
    const r = hist.redo(audio);
    if (!r) { nothing('やり直せる操作がありません。'); return; }
    stopPlay(); dirty = true; sel = r.entry.selAfter; anchor = sel[0]; head = sel[1]; setAudio(r.audio); sound.play('op');
    say(`「${r.entry.label}」をやり直しました。`); log('wave.redo', { op: r.entry.label, left: hist.redoCount }, 'ok');
  }
  function selectAll() { if (!len()) return nothing(); anchor = 0; head = len(); setSel(0, len()); say(`全体（${secText(len())}）を選びました。`); }
  function deselect() { anchor = head = sel[0]; setSel(sel[0], sel[0]); }

  /* ---------- 再生 ---------- */
  function applyVolume() { const s = os.getSettings(); if (out) out.gain.value = s.mute ? 0 : s.volume; }
  const onSettings = () => applyVolume();
  os.events.addEventListener('settings', onSettings);
  const curPos = () => (play ? W.playPosition({ from: play.from, to: play.to, offset: play.offset, loop: play.loop, elapsed: ac.currentTime - play.t0 }) : 0);
  // from〜to（秒）を、offset から鳴らす。くり返しのときは to のあと from へ戻る
  function startAt(from, to, offset, mode) {
    stopPlay(true);
    const c = ensureAudioContext();
    if (c.state === 'suspended') c.resume();
    if (!buf) { buf = c.createBuffer(audio.channels.length, Math.max(1, len()), audio.rate); audio.channels.forEach((d, k) => buf.copyToChannel(d, k)); }
    const s = c.createBufferSource();
    s.buffer = buf; s.connect(out);
    if (loop) { s.loop = true; s.loopStart = from; s.loopEnd = to; s.start(0, offset); }
    else s.start(0, offset, Math.max(0, to - offset));
    src = s; play = { from, to, offset, loop, mode, t0: c.currentTime };
    s.onended = () => { if (src !== s) return; src = null; play = null; cancelAnimationFrame(raf); update(); draw(); say('再生が終わりました。'); log('wave.ended', { mode }, 'ok'); };
    update(); tick();
  }
  function startPlay(mode) {
    if (!len()) return nothing();
    const [a, b] = W.playSpan(mode, sel, len()), r = audio.rate;
    startAt(a / r, b / r, a / r, mode);
    say(`${{ start: '最初から', cursor: 'カーソルから', selection: sel[1] > sel[0] ? '選んだ範囲を' : 'カーソルから' }[mode]}鳴らしています${loop ? '（くり返し）' : ''}。Space で止めます。`);
    log('wave.play', { mode, from: a, to: b, loop }, 'ok');
  }
  function stopPlay(quiet) {
    if (!src) { play = null; return; }
    const s = src; src = null; play = null; s.onended = null;
    try { s.stop(); } catch { /* もう止まっている */ }
    s.disconnect(); cancelAnimationFrame(raf);
    if (!quiet) { update(); draw(); say('止めました。'); log('wave.stop', {}, 'ok'); }
  }
  function togglePlay() { if (play) stopPlay(); else startPlay(sel[1] > sel[0] ? 'selection' : 'cursor'); }
  function toggleLoop() {
    loop = !loop; update();
    // 鳴らしている途中なら、いまの位置からくり返しの設定を変えて鳴らし直す
    if (play) { const p = curPos(), { from, to, mode } = play; startAt(from, to, Math.min(p, to), mode); }
    say(loop ? 'くり返し再生にしました。' : 'くり返し再生をやめました。'); log('wave.loop', { loop }, 'ok');
  }
  function tick() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!play) return;
      raf = requestAnimationFrame(step);
      if (win.min || document.hidden) return; // 見えないときは描かない
      // 再生の位置が表示の外へ出たら、ページをめくるように表示を進める（範囲をドラッグしている間は動かさない）
      const f = curPos() * audio.rate, x = W.frameToX(view, f);
      if (!drag && (x > cw - 4 || x < 0)) { view = W.clampView({ ...view, start: f - cw * view.spp * 0.05 }, len(), cw); syncScroll(); }
      draw();
    };
    raf = requestAnimationFrame(step);
  }

  /* ---------- 表示の拡大・縮小 ---------- */
  // x を渡したとき（Ctrl+ホイール）はポインタの位置を動かさずに拡大する。
  // ボタンとキーのときは、カーソル（範囲があれば範囲の中央）が表示の真ん中に来るようにする
  function zoom(factor, x) {
    if (!len()) return nothing();
    const before = view.spp;
    if (x === undefined) { const v = W.zoomView(view, factor, 0, len(), cw), f = (sel[0] + sel[1]) / 2; setView({ start: f - (cw * v.spp) / 2, spp: v.spp }); }
    else setView(W.zoomView(view, factor, x, len(), cw));
    if (view.spp === before) sound.play('error');
    say(view.spp <= W.MIN_SPP ? 'いちばん大きく拡大しています。' : view.spp >= len() / cw ? '全体を表示しています。' : `1 画素が ${(view.spp / audio.rate * 1000).toFixed(view.spp / audio.rate < 0.001 ? 3 : 1)} ミリ秒の大きさで表示しています。`);
  }
  function fit() { if (!len()) return nothing(); setView(W.fitView(len(), cw)); say('全体を表示しています。'); }
  function zoomSel() {
    if (!needRange()) return;
    const pad = (sel[1] - sel[0]) * 0.05;
    setView({ start: sel[0] - pad, spp: Math.max(W.MIN_SPP, (sel[1] - sel[0] + pad * 2) / cw) });
  }

  /* ---------- 命令 ---------- */
  const acts = {
    new: newAudio, sample: useSample,
    async open() { if (!(await confirmDiscard('開く前に'))) return; const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/音楽', exts: OPEN_EXTS, typeLabel: '音声' }); if (p) openPath(p, false); },
    save, saveas: saveAs, export: exportFile, close: () => win.close(),
    undo, redo, cut: cutSel, copy: copySel, paste: pasteClip, delete: deleteSel, silence: silenceSel, trim: trimSel, selectall: selectAll, deselect,
    gain: gainDialog, normalize: normalizeDialog,
    fadein: () => applyEffect('フェードイン', W.fadeIn), fadeout: () => applyEffect('フェードアウト', W.fadeOut),
    reverse: () => applyEffect('逆再生', W.reverse), dc: () => applyEffect('直流のずれを取る', W.removeDC),
    toggle: togglePlay, playStart: () => startPlay('start'), playCursor: () => startPlay('cursor'), playSel: () => (sel[1] > sel[0] ? startPlay('selection') : nothing(audio ? '先に波形をドラッグして範囲を選んでください。' : undefined)),
    stop: () => stopPlay(), loop: toggleLoop,
    zoomin: () => zoom(2), zoomout: () => zoom(0.5), fit, zoomsel: zoomSel,
    about: () => os.msgbox({ title: '音声エディタについて', icon: 'info', text: 'Future OS 音声エディタ 1.0\n\n波形をドラッグして範囲を選び、切り取り・コピー・貼り付け・削除や、音量・フェードなどの効果をかけます。\nShift を押しながらクリックすると、範囲を広げられます。Ctrl を押しながらホイールを回すと拡大・縮小します。\n保存は WAV（16 ビット）です。\n元に戻すは 100 回分まで覚えます。長い音の全体に効果をかけたときは、メモリを 256 MB より多く使わないよう、古いものから忘れます。' }),
  };
  const cmd = (name, detail) => {
    log('wave.command', { name }, 'ok');
    Promise.resolve(acts[name]?.(detail)).catch((e) => { log('wave.command', { name }, 'error: ' + e.message); os.msgbox({ title: '音声エディタ', text: e.message, icon: 'error' }); });
  };
  win.body.addEventListener('w95:command', (e) => {
    const c = e.detail.command;
    if (c === 'loop') { loop = !e.detail.checked; toggleLoop(); return; } // メニューが印を先に切り替えるので、それに合わせる
    cmd(c, e.detail);
  });
  win.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    cmd(b.dataset.a);
    // 道具の帯のボタンを押したあとも、キーボード（Space など）は波形で受ける
    if (b.closest('.wv-tools') && audio && e.detail > 0) stage.focus({ preventScroll: true });
  });
  // 道具の帯のボタンは、マウスで押しても入力の行き先を奪わない（押したあとの Space で同じボタンをもう一度押してしまわないように）
  tools.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  // 道具の帯のキーボード操作: focusgroup が使えないブラウザでは、矢印キーで動く1つのタブ位置を自分で作る
  if (!('focusGroup' in HTMLElement.prototype)) {
    const items = [...tools.querySelectorAll('button')];
    items.forEach((b, i) => { b.tabIndex = i ? -1 : 0; });
    tools.addEventListener('focusin', ({ target }) => { if (items.includes(target)) items.forEach((b) => { b.tabIndex = b === target ? 0 : -1; }); });
    tools.addEventListener('keydown', (e) => {
      const i = items.indexOf(e.target);
      if (i < 0) return;
      const rtl = getComputedStyle(tools).direction === 'rtl', steps = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 };
      let j = null;
      if (e.key in steps) j = (i + steps[e.key] + items.length) % items.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = items.length - 1;
      if (j === null) return;
      e.preventDefault(); e.stopPropagation(); items[j].focus();
    });
  }

  /* ---------- マウス: 範囲を選ぶ・カーソル・拡大 ---------- */
  const frameAt = (clientX) => Math.max(0, Math.min(len(), Math.round(W.xToFrame(view, clientX - stage.getBoundingClientRect().left))));
  stage.addEventListener('pointerdown', (e) => {
    if (!audio || e.button !== 0) return;
    e.preventDefault();
    stage.focus({ preventScroll: true });
    const f = frameAt(e.clientX);
    if (e.shiftKey) { anchor = sel[1] > sel[0] ? (Math.abs(f - sel[0]) > Math.abs(f - sel[1]) ? sel[0] : sel[1]) : sel[0]; head = f; }
    else { anchor = head = f; }
    setSel(anchor, head);
    try { stage.setPointerCapture(e.pointerId); } catch { /* つかまえられなくても選べる */ }
    drag = { id: e.pointerId, moved: false };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const x = e.clientX - stage.getBoundingClientRect().left;
    // 窓の端の外までドラッグしたら、表示をその向きへ送る
    if (x < 0 || x > cw) setView({ ...view, start: view.start + (x < 0 ? x : x - cw) * view.spp * 0.5 });
    head = frameAt(e.clientX); drag.moved = true;
    setSel(anchor, head);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    log('wave.select', { sel, shift: e.shiftKey }, 'ok');
    say(sel[1] > sel[0] ? `${secText(sel[1] - sel[0])} を選びました。Space で選んだ範囲を鳴らします。` : `カーソルを ${secText(sel[0])} に置きました。`);
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('wheel', (e) => {
    if (!audio) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cw : 1;
    if (e.ctrlKey || e.metaKey) { zoom(e.deltaY < 0 ? 1.5 : 1 / 1.5, e.clientX - stage.getBoundingClientRect().left); return; }
    const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
    setView({ ...view, start: view.start + d * view.spp });
  }, { passive: false });

  /* ---------- キーボード ---------- */
  function moveHead(to, extend) {
    if (!audio) return;
    head = Math.max(0, Math.min(len(), Math.round(to)));
    if (!extend) anchor = head;
    setSel(anchor, head); reveal(head);
  }
  win.body.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select') || e.isComposing) return;
    // 道具の帯の中の矢印・Home・End は、帯の中の移動（focusgroup か、その代わりの処理）に任せる
    if (e.target.closest('.wv-tools') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    const run = (name) => { e.preventDefault(); cmd(name); };
    if (ctrl && !e.altKey) {
      if (k === 'z' && !e.shiftKey) run('undo');
      else if (k === 'y' || (k === 'z' && e.shiftKey)) run('redo');
      else if (k === 'a') run('selectall');
      else if (k === 'x') run('cut');
      else if (k === 'c') run('copy');
      else if (k === 'v') run('paste');
      else if (k === 's') run('save');
      else if (k === 'o') run('open');
      return;
    }
    if (e.altKey || e.metaKey) return;
    const step = Math.max(1, Math.round(view.spp * 8));
    if (e.key === ' ' && !e.target.closest('button')) run('toggle');
    else if (e.key === 'Delete' || e.key === 'Backspace') run('delete');
    else if (e.key === 'Escape') { if (play) run('stop'); else if (sel[1] > sel[0]) run('deselect'); }
    else if (e.key === 'Home') { e.preventDefault(); moveHead(0, e.shiftKey); }
    else if (e.key === 'End') { e.preventDefault(); moveHead(len(), e.shiftKey); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      // 範囲があるときに Shift なしで押したら、範囲の端へカーソルを置く
      if (!e.shiftKey && sel[1] > sel[0]) moveHead(dir < 0 ? sel[0] : sel[1], false);
      else moveHead(head + dir * step, e.shiftKey);
    }
    else if (k === '+' || k === ';' || k === '=') run('zoomin');
    else if (k === '-') run('zoomout');
    else if (k === '0') run('fit');
  });

  /* ---------- ファイルを落とす ---------- */
  win.body.addEventListener('dragover', (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; stage.classList.add('drop-ok');
  });
  win.body.addEventListener('dragleave', (e) => { if (!win.body.contains(e.relatedTarget)) stage.classList.remove('drop-ok'); });
  win.body.addEventListener('drop', (e) => {
    stage.classList.remove('drop-ok');
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    openLocal(f);
  });
  // デスクトップや ファイル マネージャ から、仮想ドライブのファイルを落としたとき
  win.body.addEventListener('fos:drop-file', (e) => {
    const p = e.detail.path;
    if (OPEN_EXTS.includes(extname(p).toLowerCase())) openPath(p); else os.openFile(p);
  });

  /* ---------- 片付けと始まり ---------- */
  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  win.cleanup = () => {
    stopPlay(true); cancelAnimationFrame(raf); ro.disconnect();
    os.events.removeEventListener('settings', onSettings);
    if (ac) { ac.close().catch(() => {}); ac = null; out = null; }
    log('wave.close', { path }, 'ok');
  };
  win.body.tabIndex = -1;
  // 確かめの道具（tools/wave-check.mjs）が中の状態を読み、範囲を決めるための窓口
  win.wave = {
    state: () => ({ frames: len(), rate: audio?.rate || 0, channels: audio?.channels.length || 0, sel: sel.slice(), view: { ...view }, width: cw, dirty, path, name, undo: hist.undoCount, redo: hist.redoCount, playing: !!play, pos: play ? curPos() : null, loop, clip: clipboard ? { frames: W.frames(clipboard), rate: clipboard.rate, channels: clipboard.channels.length } : null, peak: audio ? W.peak(audio.channels) : 0 }),
    select: (a, b) => { anchor = a; head = b; setSel(a, b); },
    samples: (k, from, n) => (audio ? Array.from(audio.channels[k].subarray(from, from + n)) : []),
  };
  resize(); update();
  if (args.path) await openPath(args.path, false);
  else say('ファイルを開くか、音声をこの窓へ落としてください。「見本の音」で試すこともできます。');
  log('wave.launch', { path: args.path || null }, 'ok');
  return win;
}
