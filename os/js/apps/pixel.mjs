// ドット絵エディタ: ゲームの小さな絵とアニメを描く。キャンバスは 8〜128 画素（既定 32×32）。
// 道具は鉛筆・消しゴム・塗りつぶし・直線・四角・だ円・スポイト・範囲を選んで動かす。左右・上下の対称で描ける。
// 色は 16 色の並び「夜灯16」（差し替えられる）と自由な色、透明、最近使った色。左右のボタンで 2 つの色を使い分ける。
// コマ（アニメ）は足す・複製・消す・並べ替え。前のコマを薄く重ねて見られ（オニオンスキン）、見本の枠で再生する。
// 保存は .pxa（JSON）、書き出しは今のコマの PNG・スプライトシートの PNG・アニメ GIF（仮想ドライブの /画像 かパソコンへ）。
// 線・塗りつぶし・図形・元に戻すは core/paint.mjs、色の文字・保存の形・GIF の符号化などは core/pixel.mjs の計算を使う。
import * as P from '../core/paint.mjs';
import * as X from '../core/pixel.mjs';
import { basename, dirname, stem } from '../core/path.mjs';

// [id, 名前, 表示するキー]
const TOOLS = [
  ['pencil', '鉛筆', 'B'], ['eraser', '消しゴム', 'E'], ['fill', '塗りつぶし', 'G'], ['line', '直線', 'L'],
  ['rect', '四角', 'U'], ['rectf', '塗った四角', 'Shift+U'], ['ellipse', 'だ円', 'C'], ['ellipsef', '塗っただ円', 'Shift+C'],
  ['pick', 'スポイト', 'I'], ['select', '範囲を選ぶ', 'M'],
];
const KEYS = { b: 'pencil', e: 'eraser', g: 'fill', l: 'line', u: 'rect', U: 'rectf', c: 'ellipse', C: 'ellipsef', i: 'pick', m: 'select' };
const HINT = {
  pencil: '鉛筆: 左のボタンで左の色、右のボタンで右の色を 1 画素ずつ置きます。',
  eraser: '消しゴム: なぞった所を透明にします。',
  fill: '塗りつぶし: 押した所と同じ色で続いている所を塗ります。',
  line: '直線: 押した所から離した所まで線を引きます。',
  rect: '四角: ドラッグした範囲に四角の線を引きます。',
  rectf: '塗った四角: ドラッグした範囲を四角に塗ります。',
  ellipse: 'だ円: ドラッグした範囲にだ円の線を引きます。',
  ellipsef: '塗っただ円: ドラッグした範囲をだ円に塗ります。',
  pick: 'スポイト: 押した画素の色を左の色に（右のボタンなら右の色に）します。',
  select: '範囲を選ぶ: ドラッグで選び、中をドラッグするか矢印キーで動かします。Enter で置き、Delete で中を消します。',
};
const SHAPES = new Set(['line', 'rect', 'rectf', 'ellipse', 'ellipsef']);
const FREE = new Set(['pencil', 'eraser']);
const EXPORTS = { frame: ['今のコマの PNG', '.png'], sheet: ['スプライトシートの PNG', '.png'], gif: ['アニメ GIF', '.gif'] };
const START_TEXT = '左のボタンで左の色、右のボタンで右の色（はじめは透明）で描きます。B 鉛筆、E 消しゴム、G 塗りつぶし。ホイールで拡大・縮小します。';
const RECENT_KEY = 'fos-pixel-recent';
const HELP = `ドット絵エディタの使い方

・描く: 左のボタンで左の色、右のボタンで右の色を置きます。右の色は、はじめは透明です。
・道具のキー: B 鉛筆、E 消しゴム、G 塗りつぶし、L 直線、U 四角（Shift+U 塗った四角）、C だ円（Shift+C 塗っただ円）、I スポイト、M 範囲を選ぶ。
・範囲を選ぶ: 選んだ所の中をドラッグするか矢印キーで動かします。Enter で置き、Delete で消し、Esc で選ぶのをやめます。
・対称: H で左右対称、V で上下対称に描きます。
・色: 並びを左クリックで左の色、右クリックで右の色にします。X で左右の色を入れ替えます。「並びへ入れる」で、選んだ枠を左の色に差し替えます。
・コマ: 下の帯でコマを足す・複製・消す・並べ替え（ドラッグか Alt+←→）します。, と . で前後のコマへ移ります。O で前のコマを薄く重ねます。P で見本の再生を止めたり始めたりします。
・表示: ホイールか + と - で拡大・縮小、# で方眼の線を出し入れします。中ボタンのドラッグで絵を動かせます。
・保存は .pxa、書き出しは PNG・スプライトシート・アニメ GIF です（ファイルのメニュー）。`;

const item = (cmd, label, key = '', extra = '') => `<div class="menu-item" data-command="${cmd}" ${extra}><span class="label">${label}</span>${key ? `<span class="shortcut">${key}</span>` : ''}</div>`;
const SEP = '<div class="menu-separator"></div>';
const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    ${item('new', '新規(<u>N</u>)...')}${item('open', '開く(<u>O</u>)...', 'Ctrl+O')}${item('save', '上書き保存(<u>S</u>)', 'Ctrl+S')}${item('saveas', '名前を付けて保存(<u>A</u>)...')}
    ${SEP}
    ${item('export', '今のコマを PNG で書き出す(<u>P</u>)...', '', 'data-kind="frame" data-status="今のコマを PNG にします。倍率は 1〜8 倍から選べます。"')}
    ${item('export', 'スプライトシートを書き出す(<u>T</u>)...', '', 'data-kind="sheet" data-status="全部のコマを横に並べた 1 枚の PNG にします。"')}
    ${item('export', 'アニメ GIF を書き出す(<u>G</u>)...', '', 'data-kind="gif" data-status="全部のコマを、今の速さでくり返すアニメ GIF にします。透明も残ります。"')}
    ${SEP}${item('close', '閉じる(<u>X</u>)')}
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    ${item('undo', '元に戻す(<u>U</u>)', 'Ctrl+Z')}${item('redo', 'やり直し(<u>R</u>)', 'Ctrl+Y')}
    ${SEP}
    ${item('selall', 'すべて選ぶ(<u>A</u>)', 'Ctrl+A')}${item('delsel', '選んだ所を消す(<u>D</u>)', 'Delete')}${item('deselect', '選ぶのをやめる(<u>N</u>)', 'Esc')}
    ${SEP}${item('swap', '左右の色を入れ替える(<u>X</u>)', 'X')}${item('clearframe', 'コマを白紙にする(<u>L</u>)')}
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    ${item('zoomin', '拡大(<u>I</u>)', '+')}${item('zoomout', '縮小(<u>O</u>)', '-')}${item('zoomfit', '窓に合わせる(<u>F</u>)')}
    ${SEP}
    ${item('grid', '方眼の線(<u>G</u>)', '#', 'data-toggle="check"')}${item('onion', 'オニオンスキン(<u>N</u>)', 'O', 'data-toggle="check" data-status="前のコマを薄く重ねて見せます。"')}
  </div></div>
  <div class="menu-title">道具(<u>T</u>)<div class="menu" role="menu">
    ${TOOLS.map(([id, name, k]) => item('tool', name, k, `data-radio="tool" data-tool="${id}"`)).join('')}
    ${SEP}
    ${item('mirrorx', '左右対称に描く(<u>H</u>)', 'H', 'data-toggle="check"')}${item('mirrory', '上下対称に描く(<u>V</u>)', 'V', 'data-toggle="check"')}
  </div></div>
  <div class="menu-title">コマ(<u>M</u>)<div class="menu" role="menu">
    ${item('addframe', 'コマを足す(<u>A</u>)')}${item('dupframe', 'コマを複製(<u>D</u>)')}${item('delframe', 'コマを消す(<u>X</u>)')}
    ${SEP}${item('moveleft', '前へ移す(<u>B</u>)', 'Alt+←')}${item('moveright', '後ろへ移す(<u>N</u>)', 'Alt+→')}
    ${SEP}${item('prevframe', '前のコマ(<u>P</u>)', ',')}${item('nextframe', '次のコマ(<u>X</u>)', '.')}${item('play', '見本を再生・停止(<u>S</u>)', 'P')}
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    ${item('help', '使い方(<u>U</u>)')}${item('about', 'ドット絵エディタについて(<u>A</u>)')}
  </div></div>
</div>`;

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  const uid = 'px' + Math.random().toString(36).slice(2, 8);
  const blankDoc = (w = X.DEFAULT_SIZE, h = X.DEFAULT_SIZE) => ({ width: w, height: h, fps: 8, palette: X.PALETTE.map((c) => c.hex), frames: [X.blankFrame(w, h)] });
  let doc = blankDoc(), cur = 0, path = null, srcName = null, dirty = false, zoom = 12, tool = 'pencil';
  let colors = [X.parseColor(X.PALETTE[0].hex), [...X.CLEAR]], slot = 0, mirror = { x: false, y: false }, showGrid = true, onion = false, playing = true;
  let sel = null, floating = null, drag = null, raf = 0, drawRaf = 0, t0 = performance.now(), shownPv = -1;
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((c) => X.parseColor(c)).slice(0, 8); } catch { recent = []; }
  const hist = new P.History(40);

  const win = wm.open({
    app: 'pixel', icon: 'icons/pixel.svg', className: 'app-pixel', title: 'ドット絵エディタ', w: 960, h: 660, ...rect, args: args.path ? { path: args.path } : {},
    render(w) {
      w.body.innerHTML = MENU + `
      <div class="toolbar px-bar" role="toolbar" aria-label="表示と対称" focusgroup="toolbar wrap">
        <button type="button" data-a="zoomout" title="縮小（-）" aria-label="縮小">－</button>
        <span class="px-zoomtxt" data-zoomtxt aria-live="polite"></span>
        <button type="button" data-a="zoomin" title="拡大（+）" aria-label="拡大">＋</button>
        <span class="px-sep" role="separator" aria-orientation="vertical"></span>
        <button type="button" class="labeled px-toggle" data-a="mirrorx" aria-pressed="false" title="左右対称に描く（H）">左右対称</button>
        <button type="button" class="labeled px-toggle" data-a="mirrory" aria-pressed="false" title="上下対称に描く（V）">上下対称</button>
        <span class="px-sep" role="separator" aria-orientation="vertical"></span>
        <label title="方眼の線を出す（#）。拡大が 4 倍以上のときに出ます"><input type="checkbox" data-a="grid" checked> 方眼(<u>G</u>)</label>
        <label title="前のコマを薄く重ねて見る（O）"><input type="checkbox" data-a="onion"> オニオンスキン(<u>O</u>)</label>
      </div>
      <div class="px-main">
        <div class="px-tools" role="toolbar" aria-label="道具" aria-orientation="vertical" focusgroup="toolbar wrap block">
          ${TOOLS.map(([id, name, k]) => `<button type="button" class="flat px-tool" data-tool="${id}" aria-pressed="false" title="${name}（${k}）"><span>${name}</span><kbd>${k}</kbd></button>`).join('')}
        </div>
        <div class="px-scroll" data-scroll tabindex="0" aria-label="キャンバス。矢印キーで選んだ範囲を動かします">
          <div class="px-stage" data-stage>
            <canvas class="px-onion" data-onion aria-hidden="true"></canvas>
            <canvas class="px-canvas" data-canvas aria-hidden="true"></canvas>
            <canvas class="px-over" data-over aria-hidden="true"></canvas>
            <div class="px-sel" data-sel hidden></div>
          </div>
        </div>
        <div class="px-side">
          <div class="px-head">色</div>
          <div class="px-colors">
            <div class="px-pair">
              <button type="button" class="flat px-c px-c1" data-c="1" title="右の色（右のボタンで描く色）" aria-label="右の色"></button>
              <button type="button" class="flat px-c px-c0" data-c="0" title="左の色（左のボタンで描く色）" aria-label="左の色"></button>
            </div>
            <button type="button" class="flat px-btn" data-a="swap" title="左右の色を入れ替える（X）">入れ替え</button>
            <button type="button" class="flat px-sw clear" data-clear title="透明（左クリックで左の色、右クリックで右の色）" aria-label="透明"></button>
          </div>
          <div class="px-swatches" role="group" aria-label="16 色の並び（左クリックで左の色、右クリックで右の色）" data-swatches></div>
          <div class="px-row">
            <label class="px-pick" for="${uid}-color">色を選ぶ(<u>C</u>):</label><input type="color" id="${uid}-color" data-color>
          </div>
          <button type="button" class="flat px-btn" data-a="setslot" title="選んだ枠の色を、左の色に差し替えます">並びへ入れる(<u>R</u>)</button>
          <div class="px-head">最近使った色</div>
          <div class="px-recent" role="group" aria-label="最近使った色" data-recent></div>
          <div class="px-row px-headrow"><span class="px-head">見本</span><span data-pvtxt></span><button type="button" class="flat px-btn" data-a="play" aria-pressed="true">停止(<u>P</u>)</button></div>
          <div class="px-preview"><canvas class="px-pv" data-pv aria-label="アニメの見本"></canvas></div>
          <label class="px-fps" for="${uid}-fps">速さ(<u>S</u>): <b data-fpstxt></b> コマ/秒</label>
          <input type="range" id="${uid}-fps" min="${X.MIN_FPS}" max="${X.MAX_FPS}" step="1" data-fps>
        </div>
      </div>
      <div class="px-framebar">
        <span class="px-head">コマ</span>
        <ol class="px-frames" role="listbox" aria-label="コマ（←→で選ぶ、Alt+←→で並べ替える）" aria-orientation="horizontal" data-frames></ol>
        <div class="px-fbtns">
          <button type="button" class="flat px-btn" data-a="addframe" title="今のコマの後ろに白紙のコマを足します">足す(<u>A</u>)</button>
          <button type="button" class="flat px-btn" data-a="dupframe" title="今のコマを複製して後ろに置きます">複製(<u>D</u>)</button>
          <button type="button" class="flat px-btn" data-a="delframe" title="今のコマを消します">消す(<u>X</u>)</button>
          <button type="button" class="flat px-btn" data-a="moveleft" title="今のコマを 1 つ前へ移します（Alt+←）">前へ(<u>B</u>)</button>
          <button type="button" class="flat px-btn" data-a="moveright" title="今のコマを 1 つ後ろへ移します（Alt+→）">後ろへ(<u>N</u>)</button>
        </div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field px-sf" data-pos></div><div class="status-field px-sf" data-dim></div><div class="status-field px-sf" data-zoomst></div><div class="status-field px-sf" data-framest></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      if (!dirty) return true;
      const a = await os.msgbox({ title: 'ドット絵エディタ', text: `${titleName()}は、変更が保存されていません。\n\n保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') return await save();
      return true;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const cv = q('[data-canvas]'), oc = q('[data-onion]'), ov = q('[data-over]'), stage = q('[data-stage]'), scroller = q('[data-scroll]'), selBox = q('[data-sel]');
  const ctx = cv.getContext('2d'), octx = oc.getContext('2d'), vctx = ov.getContext('2d'), pv = q('[data-pv]'), pctx = pv.getContext('2d');
  const framesEl = q('[data-frames]');
  const say = (t) => { q('.status-field[data-status]').textContent = t; };
  const titleName = () => (path ? '「' + basename(path) + '」' : srcName ? '「' + srcName + '」' : '無題のドット絵');
  const setTitle = () => win.setTitle(`${dirty ? '*' : ''}${path ? basename(path) : srcName || '無題'} - ドット絵エディタ`);
  const W = () => doc.width, H = () => doc.height;
  const img = () => ({ width: doc.width, height: doc.height, data: doc.frames[cur] });

  /* ---------- 元に戻す（core/paint.mjs の History。姿は「コマの並び・今のコマ・色の並び」） ---------- */
  // コマの中身は、描く前に必ず複製してから書き換える。こうすると、覚えた姿のコマは書き換わらない
  const snap = () => ({ frames: doc.frames.slice(), cur, palette: doc.palette.slice() });
  function restore(s) {
    doc.frames = s.frames.slice(); doc.palette = s.palette.slice(); cur = Math.min(s.cur, doc.frames.length - 1);
    floating = null; renderPalette(); renderFrames(); draw();
  }
  function begin() { hist.push(snap()); doc.frames[cur] = doc.frames[cur].slice(); changed(); }
  function changed() { if (!dirty) { dirty = true; setTitle(); } }

  /* ---------- 表示 ---------- */
  function layout() {
    const w = W(), h = H();
    for (const c of [cv, oc, ov]) { c.width = w; c.height = h; }
    stage.style.width = w * zoom + 'px'; stage.style.height = h * zoom + 'px';
    stage.style.setProperty('--z', zoom + 'px');
    stage.style.setProperty('--ck', (zoom >= 8 ? zoom / 2 : 4) + 'px');
    stage.classList.toggle('grid', showGrid && zoom >= 4);
    pv.width = w; pv.height = h;
    const k = Math.min(160 / w, 92 / h);
    pv.style.width = Math.round(w * k) + 'px'; pv.style.height = Math.round(h * k) + 'px';
    q('[data-dim]').textContent = `${w} × ${h}`;
    q('[data-zoomtxt]').textContent = `×${zoom}`;
    q('[data-zoomst]').textContent = `拡大 ×${zoom}`;
    q('[data-fps]').value = doc.fps; q('[data-fpstxt]').textContent = doc.fps;
    q('[data-fps]').setAttribute('aria-valuetext', `${doc.fps} コマ/秒`);
    syncChecks(); renderFrames(); draw();
  }
  // 今のコマ（動かしている範囲があれば重ねた姿）
  function view() {
    if (!floating) return doc.frames[cur];
    const d = doc.frames[cur].slice();
    X.pasteOver(d, W(), H(), floating, floating.x, floating.y);
    return d;
  }
  function draw() {
    cancelAnimationFrame(drawRaf); drawRaf = 0;
    const w = W(), h = H();
    ctx.putImageData(new ImageData(view(), w, h), 0, 0);
    octx.clearRect(0, 0, w, h);
    if (onion && cur > 0) octx.putImageData(new ImageData(doc.frames[cur - 1], w, h), 0, 0);
    drawSel(); drawThumb(cur); shownPv = -1;
    q('[data-framest]').textContent = `コマ ${cur + 1} / ${doc.frames.length}`;
  }
  const schedule = () => { if (!drawRaf) drawRaf = requestAnimationFrame(() => { drawRaf = 0; draw(); }); };
  function drawSel() {
    const r = floating ? { x: floating.x, y: floating.y, w: floating.w, h: floating.h } : sel;
    selBox.hidden = !r;
    if (r) Object.assign(selBox.style, { left: r.x * zoom + 'px', top: r.y * zoom + 'px', width: r.w * zoom + 'px', height: r.h * zoom + 'px' });
  }
  function drawThumb(i) {
    const c = framesEl.children[i]?.querySelector('canvas');
    if (c) c.getContext('2d').putImageData(new ImageData(i === cur ? view() : doc.frames[i], W(), H()), 0, 0);
  }
  function renderFrames() {
    // 作り直すと入力の行き先（フォーカス）が消えるので、帯にあったときは今のコマへ戻す
    const had = framesEl.contains(document.activeElement);
    const w = W(), h = H(), k = Math.min(40 / w, 40 / h);
    framesEl.innerHTML = doc.frames.map((_, i) => `<li role="option" aria-selected="${i === cur}" tabindex="${i === cur ? 0 : -1}" data-i="${i}" title="コマ ${i + 1}"><canvas width="${w}" height="${h}" style="width:${Math.round(w * k)}px;height:${Math.round(h * k)}px" aria-hidden="true"></canvas><span>${i + 1}</span></li>`).join('');
    doc.frames.forEach((_, i) => drawThumb(i));
    framesEl.children[cur]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (had) framesEl.children[cur]?.focus({ preventScroll: true });
  }
  function syncChecks() {
    const m = (cmd, on) => win.body.querySelectorAll(`.menu-item[data-command="${cmd}"]`).forEach((el) => el.classList.toggle('checked', on));
    m('grid', showGrid); m('onion', onion); m('mirrorx', mirror.x); m('mirrory', mirror.y);
    win.body.querySelectorAll('.menu-item[data-command="tool"]').forEach((el) => el.classList.toggle('checked', el.dataset.tool === tool));
    q('[data-a="mirrorx"]').setAttribute('aria-pressed', String(mirror.x));
    q('[data-a="mirrory"]').setAttribute('aria-pressed', String(mirror.y));
    q('input[data-a="grid"]').checked = showGrid; q('input[data-a="onion"]').checked = onion;
    const pb = q('[data-a="play"]');
    pb.setAttribute('aria-pressed', String(playing)); pb.innerHTML = playing ? '停止(<u>P</u>)' : '再生(<u>P</u>)';
  }
  function setZoom(z, ev) {
    if (z === zoom) return;
    const r = cv.getBoundingClientRect(), fx = ev ? (ev.clientX - r.left) / r.width : 0.5, fy = ev ? (ev.clientY - r.top) / r.height : 0.5;
    const ax = ev ? ev.clientX : r.left + r.width / 2, ay = ev ? ev.clientY : r.top + r.height / 2;
    zoom = z; layout();
    // 指していた画素が、拡大のあとも同じ場所に来るように動かす
    const r2 = cv.getBoundingClientRect();
    scroller.scrollLeft += r2.left + fx * r2.width - ax; scroller.scrollTop += r2.top + fy * r2.height - ay;
    log('pixel.zoom', { zoom }, 'ok');
  }
  const fitView = () => X.fitZoom(W(), H(), Math.max(64, scroller.clientWidth - 40), Math.max(64, scroller.clientHeight - 40));

  /* ---------- 色 ---------- */
  const isClear = (c) => c[3] === 0;
  const cssOf = (c) => (isClear(c) ? 'transparent' : `rgb(${c[0]} ${c[1]} ${c[2]} / ${c[3] / 255})`);
  const nameOf = (c) => (isClear(c) ? '透明' : X.colorHex(c));
  function setColors() {
    [0, 1].forEach((i) => {
      const b = q(`[data-c="${i}"]`);
      b.style.setProperty('--c', cssOf(colors[i]));
      b.classList.toggle('clear', isClear(colors[i]));
      b.title = `${i ? '右' : '左'}の色 ${nameOf(colors[i])}（${i ? '右' : '左'}のボタンで描く色）`;
    });
    if (!isClear(colors[0])) q('[data-color]').value = X.colorHex(colors[0]).slice(0, 7);
  }
  function renderPalette() {
    q('[data-swatches]').innerHTML = doc.palette.map((hex, i) => `<button type="button" class="flat px-sw${i === slot ? ' slot' : ''}" data-slot="${i}" style="--c:${hex}" title="${X.PALETTE[i] && X.PALETTE[i].hex === hex ? X.PALETTE[i].name + ' ' : ''}${hex}${i === slot ? '（選んだ枠）' : ''}" aria-label="${hex}"></button>`).join('');
  }
  function renderRecent() {
    q('[data-recent]').innerHTML = recent.length ? recent.map((hex) => `<button type="button" class="flat px-sw" data-hex="${hex}" style="--c:${cssOf(X.parseColor(hex))}" title="${hex}" aria-label="${hex}"></button>`).join('') : '<span class="px-none">まだありません</span>';
  }
  function useColor(btn, c, from) {
    colors[btn] = [...c]; setColors(); sound.play('select');
    say(`${btn ? '右' : '左'}の色を ${nameOf(c)} にしました。`);
    log('pixel.color', { side: btn ? 'right' : 'left', color: X.colorHex(c), from }, 'ok');
  }
  function remember(c) {
    if (isClear(c)) return;
    recent = X.pushRecent(recent, X.colorHex(c), 8); renderRecent();
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* 保存できなくても使える */ }
  }

  /* ---------- 道具 ---------- */
  function setTool(id) {
    if (id !== 'select') commitFloating();
    tool = id; stage.dataset.tool = id;
    win.body.querySelectorAll('.px-tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
    syncChecks(); say(HINT[id]);
  }
  const mirrored = (pts) => X.mirrorPoints(pts, W(), H(), mirror);
  const stroke = (x0, y0, x1, y1, c) => P.paint(img(), mirrored(P.linePoints(x0, y0, x1, y1)), P.solid(c));
  function shapePts(a, b) {
    const pts = tool === 'line' ? P.linePoints(a[0], a[1], b[0], b[1])
      : tool === 'rect' || tool === 'rectf' ? P.rectPoints(a[0], a[1], b[0], b[1], tool === 'rectf')
        : P.ellipsePoints(a[0], a[1], b[0], b[1], tool === 'ellipsef');
    return mirrored(pts);
  }
  function showPreview(pts, c) {
    vctx.clearRect(0, 0, ov.width, ov.height);
    // 透明で描く図形は、どこに描くかが見えるよう、薄い灰色で下書きを見せる
    const tmp = P.makeImage(W(), H(), [0, 0, 0, 0]);
    P.paint(tmp, pts, P.solid(isClear(c) ? [110, 93, 133, 140] : c));
    vctx.putImageData(new ImageData(tmp.data, tmp.width, tmp.height), 0, 0);
  }
  const posOf = (e) => P.toImage(e.clientX, e.clientY, cv.getBoundingClientRect(), zoom);
  const inRect = (r, x, y) => r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

  // 範囲: 選んだ所を持ち上げる（元の所は透明にする）。置くまでは「動かしている範囲」として重ねて見せる
  function lift() {
    if (floating || !sel) return;
    begin();
    floating = { ...X.cutRect(doc.frames[cur], W(), H(), sel), x: sel.x, y: sel.y };
    X.clearRectIn(doc.frames[cur], W(), H(), sel);
    log('pixel.lift', { ...sel }, 'ok');
  }
  function commitFloating() {
    if (!floating) return;
    X.pasteOver(doc.frames[cur], W(), H(), floating, floating.x, floating.y);
    sel = X.normRect(floating.x, floating.y, floating.x + floating.w - 1, floating.y + floating.h - 1, W(), H());
    log('pixel.place', { x: floating.x, y: floating.y, w: floating.w, h: floating.h }, 'ok');
    floating = null; draw();
  }
  function nudge(dx, dy) {
    if (!sel && !floating) return false;
    lift();
    floating.x += dx; floating.y += dy;
    draw(); say(`選んだ範囲を (${floating.x}, ${floating.y}) へ動かしました。Enter で置きます。`);
    return true;
  }
  function deselect() { commitFloating(); sel = null; drawSel(); }

  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    // 入力の行き先は、つかまえる前に移す（あとで移すと Chrome がつかまえを外す）。矢印キーはキャンバスで受ける
    scroller.focus({ preventScroll: true });
    const [x, y] = posOf(e), btn = e.button === 2 ? 1 : 0, c = tool === 'eraser' ? [...X.CLEAR] : colors[btn];
    if (tool === 'pick') {
      if (!P.inside(img(), x, y)) return;
      useColor(btn, P.getPx(img(), x, y), 'pick');
      return;
    }
    if (tool === 'fill') {
      if (!P.inside(img(), x, y)) return;
      commitFloating();
      const before = snap(), copy = doc.frames[cur].slice(), target = { width: W(), height: H(), data: copy };
      let n = 0;
      for (const [sx, sy] of mirrored([[x, y]])) n += P.floodFill(target, sx, sy, P.solid(c));
      if (!n) { say('同じ色なので、塗る所がありません。'); return; }
      hist.push(before); doc.frames[cur] = copy; changed(); draw(); remember(c); sound.play('pin');
      say(`${n} 画素を塗りました。`); log('pixel.fill', { x, y, n, color: X.colorHex(c) }, 'ok');
      return;
    }
    try { stage.setPointerCapture(e.pointerId); } catch { /* つかまえられなくても、window で受けるので描ける */ }
    if (tool === 'select') {
      if (inRect(floating || sel, x, y)) { lift(); drag = { mode: 'move', start: [x, y], ox: floating.x, oy: floating.y }; }
      else { commitFloating(); sel = null; drag = { mode: 'sel', start: [x, y], last: [x, y] }; drawSel(); }
    } else {
      drag = { mode: 'draw', btn, c, start: [x, y], last: [x, y] };
      if (FREE.has(tool)) { begin(); stroke(x, y, x, y, c); schedule(); }
      else showPreview(shapePts(drag.start, drag.last), c);
    }
    addEventListener('pointermove', onDragMove); addEventListener('pointerup', finish); addEventListener('pointercancel', finish);
  });
  stage.addEventListener('pointermove', (e) => { const [x, y] = posOf(e); q('[data-pos]').textContent = P.inside(img(), x, y) ? `${x}, ${y}` : ''; });
  stage.addEventListener('pointerleave', () => { q('[data-pos]').textContent = ''; });
  function onDragMove(e) {
    if (!drag) return;
    const [x, y] = posOf(e);
    if (drag.mode === 'move') {
      floating.x = drag.ox + x - drag.start[0]; floating.y = drag.oy + y - drag.start[1];
      schedule(); drawSel();
    } else if (drag.mode === 'sel') {
      drag.last = [x, y]; sel = X.normRect(drag.start[0], drag.start[1], x, y, W(), H()); drawSel();
    } else if (FREE.has(tool)) {
      // 速く動かしても線が途切れないよう、まとめられた間の位置もたどる
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ce of evs.length ? evs : [e]) { const p = posOf(ce); stroke(drag.last[0], drag.last[1], p[0], p[1], drag.c); drag.last = p; }
      schedule();
    } else { drag.last = [x, y]; showPreview(shapePts(drag.start, drag.last), drag.c); }
  }
  function finish() {
    if (!drag) return;
    removeEventListener('pointermove', onDragMove); removeEventListener('pointerup', finish); removeEventListener('pointercancel', finish);
    const d = drag;
    drag = null;
    if (d.mode === 'move') { draw(); say('範囲を動かしました。Enter で置きます。'); log('pixel.move', { x: floating.x, y: floating.y }, 'ok'); return; }
    if (d.mode === 'sel') {
      const moved = d.start[0] !== d.last[0] || d.start[1] !== d.last[1];
      if (!moved) sel = null;
      drawSel();
      say(sel ? `${sel.w} × ${sel.h} を選びました。中をドラッグするか矢印キーで動かします。` : '選ぶのをやめました。');
      if (sel) log('pixel.select', { ...sel }, 'ok');
      return;
    }
    if (SHAPES.has(tool)) { begin(); P.paint(img(), shapePts(d.start, d.last), P.solid(d.c)); vctx.clearRect(0, 0, ov.width, ov.height); }
    draw(); remember(d.c);
    log('pixel.draw', { tool, from: d.start, to: d.last, color: X.colorHex(d.c), mirror: { ...mirror } }, 'ok');
  }
  // ホイールで拡大・縮小（Shift を押しているときは横へ動かす）。中ボタンのドラッグで絵を動かす
  scroller.addEventListener('wheel', (e) => {
    if (e.shiftKey || e.ctrlKey && e.deltaY === 0) return;
    e.preventDefault();
    setZoom(X.stepZoom(zoom, e.deltaY < 0 ? 1 : -1), e);
  }, { passive: false });
  scroller.addEventListener('pointerdown', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, l0 = scroller.scrollLeft, t0s = scroller.scrollTop;
    const mv = (ev) => { scroller.scrollLeft = l0 - (ev.clientX - sx); scroller.scrollTop = t0s - (ev.clientY - sy); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); scroller.classList.remove('panning'); };
    scroller.classList.add('panning');
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });

  /* ---------- 道具・色・見本の部品 ---------- */
  q('.px-tools').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) { setTool(b.dataset.tool); sound.play('key', TOOLS.findIndex((t) => t[0] === b.dataset.tool) % 10); log('pixel.tool', { tool: b.dataset.tool }, 'ok'); } });
  win.body.addEventListener('click', (e) => {
    const a = e.target.closest('button[data-a]');
    if (a && cmds[a.dataset.a]) cmds[a.dataset.a]({});
  });
  win.body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[data-a="grid"]')) cmds.grid({ checked: t.checked });
    if (t.matches('input[data-a="onion"]')) cmds.onion({ checked: t.checked });
    if (t.matches('[data-color]')) log('pixel.color', { side: 'left', color: t.value, from: 'input' }, 'ok');
  });
  const sw = q('[data-swatches]');
  sw.addEventListener('click', (e) => {
    const b = e.target.closest('[data-slot]');
    if (!b) return;
    slot = +b.dataset.slot; renderPalette(); q(`[data-slot="${slot}"]`).focus();
    useColor(0, X.parseColor(doc.palette[slot]), 'palette');
  });
  sw.addEventListener('contextmenu', (e) => { const b = e.target.closest('[data-slot]'); if (b) { e.preventDefault(); useColor(1, X.parseColor(doc.palette[+b.dataset.slot]), 'palette'); } });
  const clearBtn = q('[data-clear]');
  clearBtn.addEventListener('click', () => useColor(0, X.CLEAR, 'clear'));
  clearBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); useColor(1, X.CLEAR, 'clear'); });
  const rc = q('[data-recent]');
  rc.addEventListener('click', (e) => { const b = e.target.closest('[data-hex]'); if (b) useColor(0, X.parseColor(b.dataset.hex), 'recent'); });
  rc.addEventListener('contextmenu', (e) => { const b = e.target.closest('[data-hex]'); if (b) { e.preventDefault(); useColor(1, X.parseColor(b.dataset.hex), 'recent'); } });
  q('[data-color]').addEventListener('input', (e) => { colors[0] = X.parseColor(e.target.value); setColors(); say(`左の色を ${e.target.value} にしました。「並びへ入れる」で、選んだ枠をこの色にできます。`); });
  q('.px-pair').addEventListener('click', (e) => { if (e.target.closest('[data-c]')) cmds.swap(); });
  q('[data-fps]').addEventListener('input', (e) => {
    doc.fps = +e.target.value; q('[data-fpstxt]').textContent = doc.fps; e.target.setAttribute('aria-valuetext', `${doc.fps} コマ/秒`);
    t0 = performance.now(); changed();
  });
  q('[data-fps]').addEventListener('change', () => log('pixel.fps', { fps: doc.fps }, 'ok'));

  // 見本の再生（requestAnimationFrame。止めているときと 1 コマのときは今のコマを出す）
  function tick(now) {
    raf = requestAnimationFrame(tick);
    // rAF の時刻（now）は、速さを変えたときに覚えた t0 より前のことがある。playFrame は負の時間を 0 として扱う
    const n = doc.frames.length, i = playing && n > 1 ? X.playFrame(now - t0, doc.fps, n) : cur;
    if (i === shownPv) return;
    shownPv = i;
    pctx.putImageData(new ImageData(i === cur ? view() : doc.frames[i], W(), H()), 0, 0);
    q('[data-pvtxt]').textContent = `${i + 1} / ${n}`;
  }
  raf = requestAnimationFrame(tick);

  /* ---------- コマの帯 ---------- */
  function goFrame(i, focus = false) {
    i = Math.max(0, Math.min(doc.frames.length - 1, i));
    if (i === cur) { if (focus) framesEl.children[i]?.focus(); return; }
    commitFloating();
    cur = i; renderFrames(); draw();
    if (focus) framesEl.children[i]?.focus();
    log('pixel.frame', { frame: i + 1 }, 'ok');
  }
  function moveFrame(from, to, focus = false) {
    to = Math.max(0, Math.min(doc.frames.length - 1, to));
    if (from === to) return;
    commitFloating();
    hist.push(snap());
    doc.frames = X.moveItem(doc.frames, from, to); cur = to; changed(); renderFrames(); draw();
    if (focus) framesEl.children[cur]?.focus();
    sound.play('drop'); say(`コマ ${from + 1} を ${to + 1} 番目へ移しました。`);
    log('pixel.moveframe', { from: from + 1, to: to + 1 }, 'ok');
  }
  framesEl.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
    e.preventDefault(); e.stopPropagation();
    const d = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
    if (e.altKey && d) moveFrame(cur, cur + d, true);
    else goFrame(k === 'Home' ? 0 : k === 'End' ? doc.frames.length - 1 : cur + d, true);
  });
  // ドラッグで並べ替える。離すまでは並びを変えず、入る所に印を出す（位置は帯の中の配置から求める）
  framesEl.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li || e.button !== 0) return;
    const from = +li.dataset.i, x0 = e.clientX, id = e.pointerId;
    let to = from, dragging = false;
    try { li.setPointerCapture(id); } catch { /* 無くても window で受ける */ }
    const spot = (cx) => {
      const r = framesEl.getBoundingClientRect(), px = cx - r.left - framesEl.clientLeft + framesEl.scrollLeft, items = [...framesEl.children];
      const i = items.findIndex((el) => el.offsetLeft + el.offsetWidth / 2 > px);
      const at = i < 0 ? items.length : i, ref = items[at] || items.at(-1);
      framesEl.style.setProperty('--drop-x', (at < items.length ? ref.offsetLeft - 3 : ref.offsetLeft + ref.offsetWidth + 3) + 'px');
      return at > from ? at - 1 : at;
    };
    const mv = (ev) => {
      if (ev.pointerId !== id) return;
      if (!dragging && Math.abs(ev.clientX - x0) < 5) return;
      dragging = true; li.classList.add('lifted'); to = spot(ev.clientX);
      if (to === from) delete framesEl.dataset.drop; else framesEl.dataset.drop = '';
    };
    const end = (ev) => {
      if (ev.type !== 'keydown' && ev.pointerId !== id) return;
      if (ev.type === 'keydown') { if (ev.key !== 'Escape') return; ev.preventDefault(); ev.stopPropagation(); }
      removeEventListener('pointermove', mv); removeEventListener('pointerup', end); removeEventListener('pointercancel', end); removeEventListener('keydown', end, true);
      delete framesEl.dataset.drop; li.classList.remove('lifted');
      // Esc と取り消しでは並びを変えない
      if (ev.type === 'pointercancel' || ev.type === 'keydown') { if (dragging) say('並べ替えをやめました。'); return; }
      if (dragging) moveFrame(from, to, true); else goFrame(from, true);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', end); addEventListener('pointercancel', end); addEventListener('keydown', end, true);
  });

  /* ---------- ファイル ---------- */
  async function confirmDiscard(what) {
    if (!dirty) return true;
    const a = await os.msgbox({ title: 'ドット絵エディタ', text: `今のドット絵の変更は保存されていません。\n\n捨てて${what}か?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
    return a === 'はい';
  }
  function setDoc(d, p, name) {
    doc = d; cur = 0; path = p; srcName = name; dirty = false; sel = null; floating = null; hist.clear();
    win.setArgs({ path: p || undefined });
    zoom = fitView(); renderPalette(); layout(); setTitle();
  }
  async function load(p) {
    try {
      if (/\.pxa$/i.test(p)) {
        const d = X.parseDoc(await fs.readText(p));
        setDoc(d, p, null);
        say(`「${basename(p)}」を開きました（${d.width}×${d.height}、${d.frames.length} コマ）。`);
      } else if (/\.png$/i.test(p)) {
        const bmp = await createImageBitmap(await fs.readBlob(p));
        const fit = X.fitImport(bmp.width, bmp.height);
        if (!fit.ok) { bmp.close?.(); throw new Error(fit.reason); }
        const off = new OffscreenCanvas(fit.width, fit.height), o = off.getContext('2d');
        o.drawImage(bmp, 0, 0); bmp.close?.();
        const d = blankDoc(fit.width, fit.height);
        d.frames = [new Uint8ClampedArray(o.getImageData(0, 0, fit.width, fit.height).data)];
        setDoc(d, null, basename(p));
        say(`「${basename(p)}」を開きました。描き足したら「名前を付けて保存」で .pxa に保存します。`);
      } else throw new Error('ドット絵エディタで開けるのは .pxa と .png です。');
      os.addRecent(p); sound.play('open');
      log('pixel.open', { path: p, w: doc.width, h: doc.height, frames: doc.frames.length }, 'ok');
      return true;
    } catch (err) {
      os.msgbox({ title: 'ドット絵エディタ', text: `「${basename(p)}」を開けませんでした。\n\n${err.message}`, icon: 'error' });
      log('pixel.open', { path: p }, 'error: ' + err.message);
      return false;
    }
  }
  async function save() {
    if (!path) return saveAs();
    commitFloating();
    try {
      await fs.write(path, JSON.stringify(X.encodeDoc(doc)), 'application/json');
      dirty = false; setTitle(); os.addRecent(path); sound.play('notify');
      say(`「${path}」に保存しました。`); log('pixel.save', { path, frames: doc.frames.length }, 'ok');
      return true;
    } catch (err) {
      os.msgbox({ title: 'ドット絵エディタ', text: err.message, icon: 'error' }); log('pixel.save', { path }, 'error: ' + err.message);
      return false;
    }
  }
  // 既定の場所 /画像 が消されていても、保存の箱がドライブのいちばん上で開かないよう、先に作っておく
  const pictures = async () => { try { if (!(await fs.exists('/画像'))) await fs.mkdir('/画像'); } catch { /* 作れなければ箱の側でドライブのいちばん上を出す */ } return '/画像'; };
  async function saveAs() {
    const base = path ? basename(path) : srcName ? stem(srcName) + '.pxa' : '無題.pxa';
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : await pictures(), name: base, exts: ['.pxa'], typeLabel: 'ドット絵（.pxa）' });
    if (!p) return false;
    path = /\.pxa$/i.test(p) ? p : p + '.pxa'; srcName = null; win.setArgs({ path });
    return save();
  }
  // 小さな箱（新規・書き出し）。dialog を showModal で開き、Esc で閉じる（95.js の openDialog）
  function makeDialog(title, body, cls) {
    const dlg = document.createElement('dialog'), tid = uid + '-dt';
    dlg.className = 'window dialog ' + cls;
    dlg.setAttribute('aria-labelledby', tid);
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text" id="${tid}">${esc(title)}</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div><div class="window-body">${body}</div>`;
    document.body.append(dlg);
    return dlg;
  }
  async function newDoc() {
    if (!(await confirmDiscard('新しい絵にします'))) return;
    const dlg = makeDialog('新しいドット絵', `
      <p class="px-dlg-note">キャンバスの大きさを選びます（${X.MIN_SIZE}〜${X.MAX_SIZE} 画素）。</p>
      <div class="px-dlg-grid">
        <label for="${uid}-w">幅(<u>W</u>):</label><input type="number" id="${uid}-w" min="${X.MIN_SIZE}" max="${X.MAX_SIZE}" step="1" value="${W()}" autofocus><span>画素</span>
        <label for="${uid}-h">高さ(<u>T</u>):</label><input type="number" id="${uid}-h" min="${X.MIN_SIZE}" max="${X.MAX_SIZE}" step="1" value="${H()}"><span>画素</span>
      </div>
      <div class="px-dlg-presets" role="group" aria-label="よく使う大きさ">${[16, 24, 32, 48, 64, 128].map((n) => `<button type="button" class="flat px-btn" data-size="${n}">${n}×${n}</button>`).join('')}</div>
      <div class="button-row"><button type="button" class="default" data-close="ok">OK</button><button type="button" data-close="">キャンセル</button></div>`, 'px-dlg');
    const wi = dlg.querySelector(`#${uid}-w`), hi = dlg.querySelector(`#${uid}-h`);
    dlg.querySelector('.px-dlg-presets').addEventListener('click', (e) => { const b = e.target.closest('[data-size]'); if (b) { wi.value = hi.value = b.dataset.size; } });
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); w95.closeDialog(dlg, 'ok'); } });
    const r = await w95.openDialog(dlg);
    const w = X.clampSize(wi.value), h = X.clampSize(hi.value);
    dlg.remove();
    if (r !== 'ok') return;
    setDoc(blankDoc(w, h), null, null);
    say(`${w}×${h} の白紙を用意しました。${START_TEXT}`);
    log('pixel.new', { w, h }, 'ok');
  }
  async function pngBlob(data, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
    return new Promise((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error('PNG を作れませんでした。'))), 'image/png'));
  }
  // 書き出す中身を作る。スプライトシートは横一列（幅が 8192 画素を超えるときだけ折り返す）
  async function buildExport(kind, k) {
    commitFloating();
    const w = W(), h = H(), base = path ? stem(path) : srcName ? stem(srcName) : '無題';
    if (kind === 'frame') return { blob: await pngBlob(X.scaleRGBA(doc.frames[cur], w, h, k), w * k, h * k), name: `${base}${doc.frames.length > 1 ? '-' + (cur + 1) : ''}.png`, type: 'image/png', size: [w * k, h * k] };
    if (kind === 'sheet') {
      const n = doc.frames.length, cols = Math.max(1, Math.min(n, Math.floor(8192 / (w * k)))), L = X.sheetLayout(n, w, h, cols);
      const data = X.scaleRGBA(X.composeSheet(doc.frames, w, h, cols), L.width, L.height, k);
      return { blob: await pngBlob(data, L.width * k, L.height * k), name: `${base}-シート.png`, type: 'image/png', size: [L.width * k, L.height * k], cols };
    }
    const bytes = X.encodeGif({ width: w * k, height: h * k, frames: doc.frames.map((f) => X.scaleRGBA(f, w, h, k)), fps: doc.fps });
    return { blob: new Blob([bytes], { type: 'image/gif' }), name: `${base}.gif`, type: 'image/gif', size: [w * k, h * k] };
  }
  async function exportDlg(kind = 'frame') {
    const dlg = makeDialog('書き出す', `
      <fieldset><legend>書き出すもの</legend><div class="col">
        ${Object.entries(EXPORTS).map(([id, [label]]) => `<label><input type="radio" name="${uid}-kind" value="${id}"${id === kind ? ' checked' : ''}> ${label}</label>`).join('')}
      </div></fieldset>
      <div class="px-dlg-grid"><label for="${uid}-k">倍率(<u>K</u>):</label><select id="${uid}-k">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}">${n} 倍</option>`).join('')}</select><span data-outsize></span></div>
      <div class="button-row"><button type="button" class="default" data-close="drive">/画像 へ保存(<u>S</u>)</button><button type="button" data-close="pc">パソコンへ書き出す(<u>D</u>)</button><button type="button" data-close="">キャンセル</button></div>`, 'px-dlg px-dlg-wide');
    const ks = dlg.querySelector(`#${uid}-k`), out = dlg.querySelector('[data-outsize]');
    const kindNow = () => dlg.querySelector(`[name="${uid}-kind"]:checked`).value;
    const upd = () => {
      const k = +ks.value, n = doc.frames.length, kd = kindNow();
      const cols = Math.max(1, Math.min(n, Math.floor(8192 / (W() * k)))), L = X.sheetLayout(n, W(), H(), cols);
      out.textContent = kd === 'sheet' ? `${L.width * k}×${L.height * k} 画素` : `${W() * k}×${H() * k} 画素${kd === 'gif' ? `、${n} コマ` : ''}`;
    };
    dlg.addEventListener('change', upd); upd();
    const r = await w95.openDialog(dlg);
    const k = +ks.value, kd = kindNow();
    dlg.remove();
    if (r !== 'drive' && r !== 'pc') return null;
    try {
      const x = await buildExport(kd, k);
      if (r === 'pc') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(x.blob); a.download = x.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        say(`「${x.name}」をパソコンへ書き出しました（${x.size[0]}×${x.size[1]}）。`);
        log('pixel.export', { kind: kd, scale: k, to: 'pc', name: x.name, bytes: x.blob.size }, 'ok');
        return x.name;
      }
      const p = await os.fileDialog({ mode: 'save', dir: await pictures(), name: x.name, exts: [x.type === 'image/gif' ? '.gif' : '.png'], typeLabel: x.type === 'image/gif' ? 'GIF 画像' : 'PNG 画像' });
      if (!p) return null;
      await fs.write(p, x.blob, x.type);
      sound.play('notify');
      say(`「${p}」に書き出しました（${x.size[0]}×${x.size[1]}${kd === 'gif' ? `、${doc.frames.length} コマ` : ''}）。`);
      log('pixel.export', { kind: kd, scale: k, to: p, bytes: x.blob.size }, 'ok');
      return p;
    } catch (err) {
      os.msgbox({ title: 'ドット絵エディタ', text: `書き出せませんでした。\n\n${err.message}`, icon: 'error' });
      log('pixel.export', { kind: kd, scale: k }, 'error: ' + err.message);
      return null;
    }
  }

  /* ---------- 命令 ---------- */
  const toggle = (name, v, text) => { sound.play(v ? 'toggleOn' : 'toggleOff'); say(text); log('pixel.' + name, { on: v }, 'ok'); };
  const cmds = {
    new: newDoc,
    async open() {
      if (!(await confirmDiscard('別の絵を開きます'))) return;
      const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/画像', exts: ['.pxa', '.png'], typeLabel: 'ドット絵と PNG 画像' });
      if (p) await load(p);
    },
    save, saveas: saveAs,
    export: (d) => exportDlg(d.item?.dataset.kind || 'frame'),
    close: () => win.close(),
    undo() {
      commitFloating();
      const s = hist.undo(snap());
      if (s) { restore(s); changed(); sound.play('op'); say('元に戻しました。'); log('pixel.undo', {}, 'ok'); } else sound.play('error');
    },
    redo() {
      commitFloating();
      const s = hist.redo(snap());
      if (s) { restore(s); changed(); sound.play('op'); say('やり直しました。'); log('pixel.redo', {}, 'ok'); } else sound.play('error');
    },
    selall() { commitFloating(); setTool('select'); sel = { x: 0, y: 0, w: W(), h: H() }; drawSel(); say('全体を選びました。矢印キーで動かせます。'); },
    delsel() {
      if (!sel && !floating) { say('先に「範囲を選ぶ」（M）で範囲を選びます。'); return; }
      if (floating) floating = null; else { begin(); X.clearRectIn(doc.frames[cur], W(), H(), sel); }
      draw(); sound.play('trash'); say('選んだ所を消しました。'); log('pixel.delsel', { ...sel }, 'ok');
    },
    deselect() { deselect(); say('選ぶのをやめました。'); },
    swap() { colors = [colors[1], colors[0]]; setColors(); sound.play('select'); say(`左の色を ${nameOf(colors[0])}、右の色を ${nameOf(colors[1])} にしました。`); },
    clearframe() { commitFloating(); begin(); doc.frames[cur].fill(0); draw(); sound.play('trash'); say(`コマ ${cur + 1} を白紙にしました。`); log('pixel.clearframe', { frame: cur + 1 }, 'ok'); },
    zoomin: () => setZoom(X.stepZoom(zoom, 1)),
    zoomout: () => setZoom(X.stepZoom(zoom, -1)),
    zoomfit: () => setZoom(fitView()),
    grid(d) { showGrid = d.checked ?? !showGrid; layout(); toggle('grid', showGrid, showGrid ? '方眼の線を出します（拡大が 4 倍以上のとき）。' : '方眼の線を消しました。'); },
    onion(d) { onion = d.checked ?? !onion; syncChecks(); draw(); toggle('onion', onion, onion ? '前のコマを薄く重ねて見せます。' : 'オニオンスキンを消しました。'); },
    tool: (d) => setTool(d.item.dataset.tool),
    mirrorx() { mirror.x = !mirror.x; syncChecks(); toggle('mirrorx', mirror.x, mirror.x ? '左右対称に描きます。' : '左右対称をやめました。'); },
    mirrory() { mirror.y = !mirror.y; syncChecks(); toggle('mirrory', mirror.y, mirror.y ? '上下対称に描きます。' : '上下対称をやめました。'); },
    setslot() {
      if (isClear(colors[0])) { sound.play('error'); say('透明は並びに入れられません。先に左の色を選びます。'); return; }
      const hex = X.colorHex([colors[0][0], colors[0][1], colors[0][2], 255]);
      hist.push(snap()); doc.palette[slot] = hex; changed(); renderPalette(); sound.play('pin');
      say(`並びの ${slot + 1} 番目の枠を ${hex} に差し替えました。`); log('pixel.setslot', { slot, hex }, 'ok');
    },
    addframe() {
      if (doc.frames.length >= X.MAX_FRAMES) { sound.play('error'); say(`コマは ${X.MAX_FRAMES} 個までです。`); return; }
      commitFloating(); hist.push(snap());
      doc.frames = [...doc.frames.slice(0, cur + 1), X.blankFrame(W(), H()), ...doc.frames.slice(cur + 1)]; cur++;
      changed(); renderFrames(); draw(); sound.play('pin'); say(`白紙のコマを足しました（${cur + 1} / ${doc.frames.length}）。O で前のコマを薄く重ねられます。`);
      log('pixel.addframe', { frame: cur + 1, total: doc.frames.length }, 'ok');
    },
    dupframe() {
      if (doc.frames.length >= X.MAX_FRAMES) { sound.play('error'); say(`コマは ${X.MAX_FRAMES} 個までです。`); return; }
      commitFloating(); hist.push(snap());
      doc.frames = [...doc.frames.slice(0, cur + 1), doc.frames[cur].slice(), ...doc.frames.slice(cur + 1)]; cur++;
      changed(); renderFrames(); draw(); sound.play('pin'); say(`コマを複製しました（${cur + 1} / ${doc.frames.length}）。`);
      log('pixel.dupframe', { frame: cur + 1, total: doc.frames.length }, 'ok');
    },
    delframe() {
      if (doc.frames.length <= 1) { sound.play('error'); say('コマが 1 つのときは消せません。白紙にするには「編集」の「コマを白紙にする」を使います。'); return; }
      commitFloating(); hist.push(snap());
      doc.frames = doc.frames.filter((_, i) => i !== cur); cur = Math.min(cur, doc.frames.length - 1);
      changed(); renderFrames(); draw(); sound.play('trash'); say(`コマを消しました（残り ${doc.frames.length}）。元に戻すで戻せます。`);
      log('pixel.delframe', { total: doc.frames.length }, 'ok');
    },
    moveleft: () => moveFrame(cur, cur - 1),
    moveright: () => moveFrame(cur, cur + 1),
    prevframe: () => goFrame(cur - 1),
    nextframe: () => goFrame(cur + 1),
    play() { playing = !playing; t0 = performance.now(); shownPv = -1; syncChecks(); say(playing ? '見本を再生しています。' : '見本を止めました。今のコマを出します。'); log('pixel.play', { playing }, 'ok'); },
    help: () => os.msgbox({ title: 'ドット絵エディタの使い方', icon: 'info', text: HELP }),
    about: () => os.msgbox({ title: 'ドット絵エディタについて', icon: 'info', text: 'Future OS ドット絵エディタ 1.0\n\nゲームの小さな絵とアニメを描く道具です。\n色の並び「夜灯16」は、このアプリのために決めた 16 色です。\n保存は .pxa（JSON）、書き出しは PNG とアニメ GIF です。' }),
  };
  win.body.addEventListener('w95:command', (e) => cmds[e.detail.command]?.(e.detail));
  win.body.addEventListener('keydown', (e) => {
    if (e.isComposing || e.target.matches('input, textarea, select')) return;
    const k = e.key, lk = k.toLowerCase();
    const run = (name, d = {}) => { e.preventDefault(); cmds[name](d); };
    if (e.ctrlKey && !e.altKey) {
      if (lk === 'z' && e.shiftKey) run('redo');
      else if (lk === 'z') run('undo');
      else if (lk === 'y') run('redo');
      else if (lk === 's') run('save');
      else if (lk === 'o') run('open');
      else if (lk === 'a') run('selall');
      return;
    }
    if (e.altKey || e.metaKey) return;
    const inBar = e.target.closest('[role="toolbar"], [role="listbox"]');
    if (k.startsWith('Arrow')) {
      if (inBar) return;
      const step = e.shiftKey ? 4 : 1, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
      if (nudge(d[0], d[1])) e.preventDefault();
      return;
    }
    if (k === 'Enter' && floating && !e.target.matches('button')) { e.preventDefault(); commitFloating(); say('範囲を置きました。'); return; }
    if (k === 'Escape' && (sel || floating)) { e.preventDefault(); cmds.deselect(); return; }
    if (k === 'Delete' || k === 'Backspace') { if (sel || floating) run('delsel'); return; }
    const t = KEYS[e.shiftKey && (lk === 'u' || lk === 'c') ? lk.toUpperCase() : lk];
    if (t) { e.preventDefault(); setTool(t); sound.play('key', TOOLS.findIndex((x) => x[0] === t) % 10); log('pixel.tool', { tool: t, key: k }, 'ok'); return; }
    const map = { x: 'swap', h: 'mirrorx', v: 'mirrory', o: 'onion', p: 'play', ',': 'prevframe', '.': 'nextframe', '+': 'zoomin', ';': 'zoomin', '=': 'zoomin', '-': 'zoomout', '#': 'grid' };
    if (map[lk]) run(map[lk]);
  });
  win.body.addEventListener('fos:drop-file', async (e) => {
    const p = e.detail.path;
    if (/\.(pxa|png)$/i.test(p)) { if (await confirmDiscard('別の絵を開きます')) load(p); } else os.openFile(p);
  });
  // 道具の帯: focusgroup の無いブラウザでは、矢印キーで道具の間を移る（Tab で入るのは 1 つ）
  function roving(bar, vertical) {
    if ('focusGroup' in HTMLElement.prototype) return;
    const items = () => [...bar.querySelectorAll('button, input')];
    items().forEach((b, i) => { b.tabIndex = i ? -1 : 0; });
    bar.addEventListener('focusin', (e) => { const it = items(); if (it.includes(e.target)) it.forEach((b) => { b.tabIndex = b === e.target ? 0 : -1; }); });
    bar.addEventListener('keydown', (e) => {
      const steps = vertical ? { ArrowDown: 1, ArrowUp: -1 } : { ArrowRight: 1, ArrowLeft: -1 }, it = items(), i = it.indexOf(document.activeElement);
      if (i < 0) return;
      const j = e.key in steps ? (i + steps[e.key] + it.length) % it.length : e.key === 'Home' ? 0 : e.key === 'End' ? it.length - 1 : null;
      if (j === null) return;
      e.preventDefault(); e.stopPropagation(); it[j].focus();
    });
  }
  roving(q('.px-bar'), false); roving(q('.px-tools'), true);
  win.body.tabIndex = -1;
  win.el.addEventListener('pointerdown', () => setTimeout(() => { if (wm.getActive() === win && !win.el.contains(document.activeElement)) win.body.focus({ preventScroll: true }); }, 0));
  win.cleanup = () => { cancelAnimationFrame(raf); cancelAnimationFrame(drawRaf); removeEventListener('pointermove', onDragMove); removeEventListener('pointerup', finish); removeEventListener('pointercancel', finish); };

  // 確かめの道具（tools/pixel-check.mjs）が中の様子を読むための窓口。画面の操作には使わない
  win.pixel = { get doc() { return doc; }, get cur() { return cur; }, get sel() { return sel; }, get floating() { return floating; }, get zoom() { return zoom; }, get tool() { return tool; }, get colors() { return colors; }, get dirty() { return dirty; }, get path() { return path; }, get recent() { return recent; }, exportDlg, buildExport };

  setTool('pencil'); setColors(); renderPalette(); renderRecent();
  if (args.path && (await load(args.path))) { /* 開いた */ } else {
    // 開けなかったファイルは窓の覚え書きから外す（次の起動で開き直して、また断らないように）
    if (args.path) win.setArgs({ path: undefined });
    zoom = fitView(); layout(); say(START_TEXT);
  }
  setTitle();
  log('pixel.launch', { path: args.path || null }, 'ok');
  return win;
}
