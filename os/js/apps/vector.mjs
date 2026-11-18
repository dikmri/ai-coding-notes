// 図形エディタ: SVG のベクター描画。道具は 選ぶ・四角・だ円・直線・折れ線（多角形）・ペン（ベジェ）・文字・スポイト。
// つまみで大きさと回転、整列と等間隔、重なりの順、まとめる、図形の一覧（名前・隠す・固定）、性質の欄、方眼、拡大縮小と移動、
// 元に戻す・やり直し、コピーと貼り付け。保存は自分で書き出す SVG（既定の場所は /画像）、PNG の書き出し（倍率を選ぶ）。
// 計算（当たり判定・大きさの変更・SVG の読み書きと消毒）は core/vector.mjs。
// 画面の図形は、読み込んだ文字の SVG を innerHTML に入れず、図形のデータから createElementNS で作る（読んだ物を動かさないため）。
import * as V from '../core/vector.mjs';
import { basename, dirname, stem } from '../core/path.mjs';

const NS = 'http://www.w3.org/2000/svg';
const TOOLS = [
  ['select', '選ぶ', 'V'], ['rect', '四角', 'R'], ['ellipse', 'だ円', 'E'], ['line', '直線', 'L'],
  ['poly', '折れ線', 'O'], ['pen', 'ペン', 'P'], ['text', '文字', 'T'], ['pick', 'スポイト', 'I'],
];
const GUIDE = {
  select: '選ぶ: 図形を押して選びます。Shift で足し、何もない所をドラッグすると囲んで選べます。四角いつまみで大きさ（Shift で縦横の比を保つ）、上の丸で回します。',
  rect: '四角: 紙の上をドラッグして描きます。Shift で正方形になります。',
  ellipse: 'だ円: 紙の上をドラッグして描きます。Shift で正円になります。',
  line: '直線: ドラッグして引きます。Shift で 45° ごとの向きになります。',
  poly: '折れ線: クリックで点を足します。最初の点を押すと多角形、ダブルクリックか Enter で折れ線として終わります。Esc でやめます。',
  pen: 'ペン: クリックで角、ドラッグで曲線の点を置きます。最初の点を押すと閉じ、ダブルクリックか Enter で終わります。Backspace で 1 つ戻ります。',
  text: '文字: 文字を置きたい所を押して打ち、Enter で決めます。選ぶ道具で文字をダブルクリックすると直せます。',
  pick: 'スポイト: 図形を押すと、その塗りの色を、選んでいる図形と次に描く図形に使います。Shift を押しながらだと線の色を取ります。',
};
const FIRST = '白い紙に描けます。左の「四角」を選んだまま、紙の上をドラッグしてみてください。ホイールで拡大と縮小、Space を押しながらドラッグで紙を動かせます。';
const SIZES = [[800, 600, 'ふつう'], [1024, 768, '大きめ'], [640, 480, '小さめ'], [1280, 720, '横長の画面'], [1920, 1080, '大きな横長'], [512, 512, '正方形'], [595, 842, 'A4 縦の比']];
const PAPERS = [['#ffffff', '白'], ['#fff6e3', 'クリーム'], ['none', '透明']];
const SCALES = [1, 2, 3, 4];
const MAX_PX = 8192;
const MARK = { rect: '□', ellipse: '○', line: '／', polyline: '⌒', polygon: '△', path: '〜', text: 'あ', g: '▤' };
// 道具の帯と一覧の小さな絵（16×16。色は文字の色）
const svgIcon = (d) => `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="${d}"/></svg>`;
const ICON = {
  'align:left': svgIcon('M1 1h2v14H1zM4 3h10v4H4zM4 9h6v4H4z'),
  'align:hcenter': svgIcon('M7 1h2v2H7zM2 3h12v4H2zM7 7h2v2H7zM4 9h8v4H4zM7 13h2v2H7z'),
  'align:right': svgIcon('M13 1h2v14h-2zM2 3h10v4H2zM6 9h6v4H6z'),
  'align:top': svgIcon('M1 1h14v2H1zM3 4h4v10H3zM9 4h4v6H9z'),
  'align:vcenter': svgIcon('M1 7h2v2H1zM3 2h4v12H3zM7 7h2v2H7zM9 4h4v8H9zM13 7h2v2h-2z'),
  'align:bottom': svgIcon('M1 13h14v2H1zM3 2h4v10H3zM9 6h4v6H9z'),
  'dist:h': svgIcon('M1 4h3v8H1zM6.5 2h3v12h-3zM12 5h3v6h-3z'),
  'dist:v': svgIcon('M4 1h8v3H4zM2 6.5h12v3H2zM5 12h6v3H5z'),
};
const EYE = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M1.5 8C3.5 4.8 5.6 3.5 8 3.5s4.5 1.3 6.5 4.5c-2 3.2-4.1 4.5-6.5 4.5S3.5 11.2 1.5 8z"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M1.5 8C3.5 4.8 5.6 3.5 8 3.5s4.5 1.3 6.5 4.5c-2 3.2-4.1 4.5-6.5 4.5S3.5 11.2 1.5 8zM2 14L14 2"/></svg>';
const LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M5 7V5a3 3 0 0 1 6 0v2"/><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/></svg>';
const UNLOCK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M5 7V5a3 3 0 0 1 5.8-1"/><rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
let clip = null; // コピーした図形（JSON）。図形エディタの窓どうしで使える
let winSeq = 0;

const item = (cmd, label, key = '', extra = '') => `<div class="menu-item${extra}" data-command="${cmd}"><span class="label">${label}</span>${key ? `<span class="shortcut">${key}</span>` : ''}</div>`;
const SEP = '<div class="menu-separator"></div>';
const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    ${item('new', '新規(<u>N</u>)...')}${item('open', '開く(<u>O</u>)...', 'Ctrl+O')}${item('save', '上書き保存(<u>S</u>)', 'Ctrl+S')}${item('saveas', '名前を付けて保存(<u>A</u>)...')}${SEP}
    <div class="menu-item" data-command="png" data-status="倍率を選んで、仮想ドライブへ PNG 画像として書き出します。"><span class="label">PNG で書き出す(<u>E</u>)...</span></div>
    <div class="menu-item"><span class="label">パソコンへ書き出す(<u>X</u>)</span><div class="menu" role="menu">${item('dl-svg', 'SVG 画像(<u>S</u>)')}${item('dl-png', 'PNG 画像(<u>P</u>)...')}</div></div>${SEP}
    ${item('close', '閉じる(<u>C</u>)')}
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    ${item('undo', '元に戻す(<u>U</u>)', 'Ctrl+Z')}${item('redo', 'やり直し(<u>R</u>)', 'Ctrl+Y')}${SEP}
    ${item('cut', '切り取り(<u>T</u>)', 'Ctrl+X')}${item('copy', 'コピー(<u>C</u>)', 'Ctrl+C')}${item('paste', '貼り付け(<u>P</u>)', 'Ctrl+V')}${item('dup', '複製(<u>D</u>)', 'Ctrl+D')}${item('del', '削除(<u>L</u>)', 'Del')}${SEP}
    ${item('selall', 'すべて選択(<u>A</u>)', 'Ctrl+A')}${item('selnone', '選択の解除(<u>N</u>)', 'Esc')}
  </div></div>
  <div class="menu-title">図形(<u>O</u>)<div class="menu" role="menu">
    ${item('order:top', '最前面へ(<u>T</u>)', 'Home')}${item('order:up', '前へ(<u>F</u>)', 'PgUp')}${item('order:down', '後ろへ(<u>B</u>)', 'PgDn')}${item('order:bottom', '最背面へ(<u>K</u>)', 'End')}${SEP}
    ${item('group', 'まとめる(<u>G</u>)', 'Ctrl+G')}${item('ungroup', 'まとめを解く(<u>U</u>)', 'Ctrl+Shift+G')}${SEP}
    <div class="menu-item"><span class="label">整列(<u>A</u>)</span><div class="menu" role="menu">
      ${item('align:left', '左(<u>L</u>)')}${item('align:hcenter', '左右の中央(<u>C</u>)')}${item('align:right', '右(<u>R</u>)')}${SEP}${item('align:top', '上(<u>T</u>)')}${item('align:vcenter', '上下の中央(<u>M</u>)')}${item('align:bottom', '下(<u>B</u>)')}
    </div></div>
    <div class="menu-item"><span class="label">等間隔(<u>D</u>)</span><div class="menu" role="menu">${item('dist:h', '横に等間隔(<u>H</u>)')}${item('dist:v', '縦に等間隔(<u>V</u>)')}</div></div>${SEP}
    ${item('rot:90', '右へ 90° 回す(<u>R</u>)')}${item('rot:-90', '左へ 90° 回す(<u>E</u>)')}${item('flip:h', '左右を反転(<u>H</u>)')}${item('flip:v', '上下を反転(<u>V</u>)')}${SEP}
    ${item('rename', '名前を付ける(<u>M</u>)...', 'F2')}
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    ${item('zoomin', '拡大(<u>I</u>)', '+')}${item('zoomout', '縮小(<u>O</u>)', '-')}${item('zoom100', '等倍(<u>1</u>)', '1')}${item('fit', '紙全体を表示(<u>W</u>)', '0')}${SEP}
    <div class="menu-item checked" data-toggle="check" data-command="grid"><span class="label">方眼を出す(<u>G</u>)</span></div>
    <div class="menu-item" data-toggle="check" data-command="snap"><span class="label">方眼に合わせる(<u>S</u>)</span></div>
    <div class="menu-item"><span class="label">方眼の幅(<u>Z</u>)</span><div class="menu" role="menu">
      ${[10, 20, 50].map((g) => `<div class="menu-item radio${g === 20 ? ' checked' : ''}" data-radio="gs" data-command="gs:${g}"><span class="label">${g} px</span></div>`).join('')}
    </div></div>${SEP}
    ${item('paper', '画用紙の大きさと色(<u>P</u>)...')}
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    ${item('help', '使い方(<u>H</u>)', 'F1')}${item('sample', '見本の絵を開く(<u>S</u>)')}${SEP}${item('about', '図形エディタについて(<u>A</u>)')}
  </div></div>
</div>`;
const tb = (cmd, label, inner, cls = '') => `<button type="button" class="${cls}" data-command="${cmd}" title="${label}" aria-label="${label}">${inner}</button>`;
const BAR = `
<div class="toolbar vc-bar" role="toolbar" aria-label="よく使う操作">
  ${tb('undo', '元に戻す（Ctrl+Z）', '<img src="icons/undo.svg" alt="">')}${tb('redo', 'やり直し（Ctrl+Y）', '<img class="vc-flipx" src="icons/undo.svg" alt="">')}<div class="sep"></div>
  ${tb('align:left', '左に揃える', ICON['align:left'])}${tb('align:hcenter', '左右の中央に揃える', ICON['align:hcenter'])}${tb('align:right', '右に揃える', ICON['align:right'])}
  ${tb('align:top', '上に揃える', ICON['align:top'])}${tb('align:vcenter', '上下の中央に揃える', ICON['align:vcenter'])}${tb('align:bottom', '下に揃える', ICON['align:bottom'])}
  ${tb('dist:h', '横に等間隔', ICON['dist:h'])}${tb('dist:v', '縦に等間隔', ICON['dist:v'])}<div class="sep"></div>
  ${tb('order:top', '最前面へ（Home）', '<span>最前面</span>', 'labeled')}${tb('order:up', '前へ（PageUp）', '<span>前へ</span>', 'labeled')}${tb('order:down', '後ろへ（PageDown）', '<span>後ろへ</span>', 'labeled')}${tb('order:bottom', '最背面へ（End）', '<span>最背面</span>', 'labeled')}<div class="sep"></div>
  ${tb('group', 'まとめる（Ctrl+G）', '<span>まとめる</span>', 'labeled')}${tb('ungroup', 'まとめを解く（Ctrl+Shift+G）', '<span>解く</span>', 'labeled')}<div class="sep"></div>
  <label class="vc-opt"><input type="checkbox" data-opt="grid" checked> 方眼(<u>G</u>)</label>
  <label class="vc-opt"><input type="checkbox" data-opt="snap"> 方眼に合わせる(<u>J</u>)</label>
</div>`;

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  const wid = ++winSeq;
  let path = args.path || null, doc = V.newDoc(), sel = [], tool = 'rect', dirty = false;
  const style = { ...V.DEFAULT_STYLE, rx: 0, size: 32, font: V.FONTS[0].css };
  const opt = { grid: true, snap: false, gridSize: 20 };
  const view = { z: 1, px: 0, py: 0 };
  const hist = new V.History(100);
  let drag = null, hover = null, pointer = null, spaceDown = false, overStage = false, live = null, raf = 0, fitted = false, textEdit = null, pasteN = 0;
  const draw2 = { kind: null, nodes: [] }; // 折れ線・ペンで置いている途中の点
  const L = (ev, a = {}, r = 'ok') => log('vector.' + ev, a, r);

  const win = wm.open({
    app: 'vector', icon: 'icons/vector.svg', className: 'app-vector', title: '図形エディタ', w: 1000, h: 680, ...rect, args: path ? { path } : {},
    render(w) {
      w.body.innerHTML = MENU + BAR + `<div class="vc-main">
        <div class="vc-tools" role="toolbar" aria-label="道具" aria-orientation="vertical">
          ${TOOLS.map(([id, name, k]) => `<button type="button" class="flat vc-tool" data-tool="${id}" aria-pressed="false" title="${name}（${k}）" aria-keyshortcuts="${k}"><span>${name}</span><kbd>${k}</kbd></button>`).join('')}
        </div>
        <div class="vc-stage" data-stage data-tool="rect">
          <svg class="vc-svg" data-svg xmlns="${NS}" role="img" aria-label="画用紙。道具を選んで描きます。選んだ図形は矢印キーで動かせます。">
            <defs>
              <pattern id="vcChk${wid}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#ffffff"/><rect width="8" height="8" fill="#e6e0ec"/><rect x="8" y="8" width="8" height="8" fill="#e6e0ec"/></pattern>
              <pattern id="vcGrid${wid}" data-gridpat width="20" height="20" patternUnits="userSpaceOnUse"><path data-gridpath d="M20 0H0V20" fill="none" stroke="rgb(75 95 232 / 0.2)"/></pattern>
            </defs>
            <g data-view>
              <rect data-shadow fill="rgb(45 27 70 / 0.55)"/>
              <rect data-paper stroke="#241734"/>
              <g data-shapes></g>
              <rect data-grid fill="url(#vcGrid${wid})" pointer-events="none"/>
              <g data-preview pointer-events="none"></g>
            </g>
            <g data-overlay pointer-events="none"></g>
          </svg>
          <input type="text" class="vc-textin" data-textin hidden autocomplete="off" spellcheck="false" aria-label="置く文字">
        </div>
        <div class="vc-side">
          <section class="vc-props" aria-labelledby="vcPH${wid}">
            <h2 class="vc-head" id="vcPH${wid}" data-ptitle>新しい図形の性質</h2>
            <div class="vc-row"><label><input type="checkbox" data-p="fillOn"> 塗り(<u>N</u>)</label><input type="color" data-p="fill" aria-label="塗りの色"></div>
            <div class="vc-row"><label><input type="checkbox" data-p="strokeOn"> 線(<u>L</u>)</label><input type="color" data-p="stroke" aria-label="線の色"></div>
            <div class="vc-row"><label for="vcSw${wid}">線の太さ(<u>W</u>)</label><input type="number" id="vcSw${wid}" data-p="sw" min="0" max="200" step="0.5"></div>
            <div class="vc-row"><label for="vcOp${wid}">不透明度(<u>Q</u>)</label><div class="vc-op"><input type="range" id="vcOp${wid}" data-p="opacity" min="0" max="100" step="1"><output for="vcOp${wid}" data-out="opacity"></output></div></div>
            <div class="vc-row"><label for="vcRx${wid}">角の丸み(<u>K</u>)</label><input type="number" id="vcRx${wid}" data-p="rx" min="0" max="2000" step="1"></div>
            <div class="vc-row"><label for="vcSz${wid}">文字の大きさ(<u>Z</u>)</label><input type="number" id="vcSz${wid}" data-p="size" min="4" max="1000" step="1"></div>
            <div class="vc-row"><label for="vcFt${wid}">書体(<u>Y</u>)</label><select id="vcFt${wid}" data-p="font"></select></div>
            <div class="vc-row"><label for="vcTx${wid}">文字(<u>M</u>)</label><input type="text" id="vcTx${wid}" data-p="text" autocomplete="off"></div>
            <fieldset class="vc-geo"><legend>位置と大きさ</legend><div class="vc-grid4">
              <label for="vcGx${wid}">X</label><input type="number" id="vcGx${wid}" data-g="x" step="1">
              <label for="vcGy${wid}">Y</label><input type="number" id="vcGy${wid}" data-g="y" step="1">
              <label for="vcGw${wid}">幅</label><input type="number" id="vcGw${wid}" data-g="w" min="1" step="1">
              <label for="vcGh${wid}">高さ</label><input type="number" id="vcGh${wid}" data-g="h" min="1" step="1">
              <label for="vcGr${wid}">回転</label><input type="number" id="vcGr${wid}" data-g="rot" step="1" min="-180" max="180"><span class="vc-unit">度</span>
            </div></fieldset>
          </section>
          <section class="vc-layers-wrap" aria-labelledby="vcLH${wid}">
            <h2 class="vc-head" id="vcLH${wid}">図形の一覧（上ほど手前）</h2>
            <ul class="vc-layers" data-layers></ul>
          </section>
        </div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:100px" data-pos></div><div class="status-field" style="width:170px" data-sel></div><div class="status-field" style="width:58px" data-zoomtxt></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      cancelAnimationFrame(raf);
      if (!dirty) return true;
      const a = await os.msgbox({ title: '図形エディタ', text: `${path ? '「' + basename(path) + '」' : '無題の絵'}は、変更が保存されていません。\n\n保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') return await save();
      return true;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const stage = q('[data-stage]'), svg = q('[data-svg]'), viewG = q('[data-view]'), paperEl = q('[data-paper]'), shadowEl = q('[data-shadow]');
  const shapesG = q('[data-shapes]'), gridEl = q('[data-grid]'), gridPat = q('[data-gridpat]'), gridPath = q('[data-gridpath]'), previewG = q('[data-preview]'), ov = q('[data-overlay]');
  const textIn = q('[data-textin]'), layersUl = q('[data-layers]'), side = q('.vc-side');
  const P = (k) => side.querySelector(`[data-p="${k}"]`), G = (k) => side.querySelector(`[data-g="${k}"]`);
  P('font').innerHTML = V.FONTS.map((f) => `<option value="${esc(f.css)}">${esc(f.label)}</option>`).join('');
  const say = (t) => { const f = q('.status-field[data-status]'); f.textContent = t; f.title = t; };
  const setTitle = () => win.setTitle(`${dirty ? '*' : ''}${path ? basename(path) : '無題'} - 図形エディタ`);

  // 文字の幅は canvas で測る（保存と開き直しで同じ幅になるよう、どちらもこの関数を使う）
  const mctx = document.createElement('canvas').getContext('2d');
  const measure = (t, size, font) => { mctx.font = `${size}px ${font}`; return mctx.measureText(t).width; };
  const r2 = (v) => Math.round(v * 100) / 100;
  const byId = (id) => doc.shapes.find((s) => s.id === id);
  const selShapes = () => doc.shapes.filter((s) => sel.includes(s.id));
  const selBox = () => V.unionBox(selShapes().map((s) => V.bbox(s, measure)));
  const snapshot = () => JSON.stringify({ width: doc.width, height: doc.height, background: doc.background, shapes: doc.shapes });
  function restore(json) {
    const d = JSON.parse(json);
    if (d.width !== doc.width || d.height !== doc.height) fitted = false; // 紙の大きさが戻ったら、表示も合わせ直す
    doc = d; sel = sel.filter((id) => byId(id)); syncSide(); schedule();
  }
  function changed() { if (!dirty) { dirty = true; } setTitle(); }
  // 図形の数は小数 3 桁にそろえてから記録する（SVG に書く桁と同じにして、保存と開き直しで同じ値になるように）
  const round3 = (list) => JSON.parse(JSON.stringify(list, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  function commit(before, what, a = {}) {
    doc.shapes = round3(doc.shapes);
    if (before === snapshot()) return false;
    hist.push(before); changed(); syncSide(); schedule(); L(what, a);
    return true;
  }

  /* ---------- 表示 ---------- */
  const toScreen = (x, y) => [x * view.z + view.px, y * view.z + view.py];
  function worldOf(e) { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left - view.px) / view.z, (e.clientY - r.top - view.py) / view.z]; }
  const tolW = () => 4 / view.z;
  const snapPt = (p) => (opt.snap ? [V.snap(p[0], opt.gridSize), V.snap(p[1], opt.gridSize)] : [r2(p[0]), r2(p[1])]);
  function build(node) {
    const el = document.createElementNS(NS, node.tag);
    for (const [k, v] of Object.entries(node.attrs)) if (!k.startsWith('data-')) el.setAttribute(k, v);
    if (node.text !== null && node.text !== undefined) el.textContent = node.text;
    if (node.children) el.append(...node.children.map(build));
    return el;
  }
  function fit() {
    const r = svg.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return;
    view.z = Math.max(0.05, Math.min(8, Math.min((r.width - 48) / doc.width, (r.height - 48) / doc.height)));
    view.px = (r.width - doc.width * view.z) / 2; view.py = (r.height - doc.height * view.z) / 2;
    fitted = true; schedule();
  }
  function zoomAt(z, cx, cy) {
    z = Math.max(0.05, Math.min(32, z));
    const wx = (cx - view.px) / view.z, wy = (cy - view.py) / view.z;
    view.z = z; view.px = cx - wx * z; view.py = cy - wy * z;
    schedule();
  }
  const zoomBy = (k) => { const r = svg.getBoundingClientRect(); zoomAt(view.z * k, r.width / 2, r.height / 2); L('zoom', { z: r2(view.z) }); };
  function draw() {
    raf = 0;
    if (!fitted) fit();
    const z = view.z;
    viewG.setAttribute('transform', `translate(${view.px} ${view.py}) scale(${z})`);
    for (const el of [paperEl, shadowEl, gridEl]) { el.setAttribute('width', doc.width); el.setAttribute('height', doc.height); }
    shadowEl.setAttribute('x', 5 / z); shadowEl.setAttribute('y', 5 / z);
    paperEl.setAttribute('fill', doc.background === 'none' ? `url(#vcChk${wid})` : doc.background);
    paperEl.setAttribute('stroke-width', 1.5 / z);
    // 方眼: 画面で 8px より細かくなるときは、幅を倍にして描く
    let step = opt.gridSize;
    while (step * z < 8) step *= 2;
    gridEl.style.display = opt.grid ? '' : 'none';
    gridPat.setAttribute('width', step); gridPat.setAttribute('height', step);
    gridPath.setAttribute('d', `M${step} 0H0V${step}`); gridPath.setAttribute('stroke-width', 1 / z);
    shapesG.replaceChildren(...doc.shapes.map((s) => build(V.shapeNode(s, measure))));
    previewG.replaceChildren(...previewNodes());
    drawOverlay();
    q('[data-zoomtxt]').textContent = Math.round(z * 100) + '%';
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

  /* ---------- 選んだ物の枠とつまみ ---------- */
  function frame() {
    const ss = selShapes();
    if (!ss.length) return null;
    if (ss.length === 1 && ss[0].type === 'line') return { kind: 'line', s: ss[0] };
    if (ss.length === 1 && V.canRotateSelf(ss[0])) { const s = ss[0]; return { kind: 'local', s, box: V.localBox(s, measure), rot: s.rot, m: V.shapeMatrix(s, measure) }; }
    return { kind: 'box', box: selBox(), rot: 0, m: V.I };
  }
  const frameCenter = (f) => (f.kind === 'local' ? V.center(f.s, measure) : [f.box.x + f.box.w / 2, f.box.y + f.box.h / 2]);
  function handles() {
    const f = frame();
    if (!f || tool !== 'select') return [];
    if (f.kind === 'line') return [{ name: 'p1', p: toScreen(f.s.x1, f.s.y1) }, { name: 'p2', p: toScreen(f.s.x2, f.s.y2) }];
    const out = Object.entries(V.handlePoints(f.box)).map(([name, pt]) => ({ name, p: toScreen(...V.apply(f.m, pt[0], pt[1])) }));
    const top = out.find((h) => h.name === 'n').p, a = ((f.rot || 0) * Math.PI) / 180;
    out.push({ name: 'rot', p: [top[0] + Math.sin(a) * 26, top[1] - Math.cos(a) * 26], from: top });
    return out;
  }
  function handleAt(e) {
    const r = svg.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const h of handles().reverse()) if (Math.hypot(h.p[0] - x, h.p[1] - y) <= 7) return h.name;
    return null;
  }
  const CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rot: 'grab', p1: 'move', p2: 'move' };
  function drawOverlay() {
    const els = [];
    const mk = (tag, a) => { const el = document.createElementNS(NS, tag); for (const k in a) el.setAttribute(k, a[k]); els.push(el); return el; };
    const poly = (pts, cls) => mk('polygon', { points: pts.map((p) => toScreen(p[0], p[1]).join(',')).join(' '), class: cls });
    const outline = (s, cls) => poly(V.canRotateSelf(s) ? V.corners(s, measure) : V.boxCorners(V.bbox(s, measure)), cls);
    if (tool === 'select' && hover && !sel.includes(hover) && !drag) { const s = byId(hover); if (s) outline(s, 'vc-hover'); }
    const ss = selShapes();
    if (ss.length > 1 || (ss.length && tool !== 'select')) for (const s of ss) outline(s, 'vc-selout');
    const f = frame();
    if (f && tool === 'select') {
      if (f.kind === 'line') { const a = toScreen(f.s.x1, f.s.y1), b = toScreen(f.s.x2, f.s.y2); mk('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'vc-frame' }); }
      else poly(V.boxCorners(f.box).map(([x, y]) => V.apply(f.m, x, y)), 'vc-frame');
      for (const h of handles()) {
        if (h.name === 'rot') { mk('line', { x1: h.from[0], y1: h.from[1], x2: h.p[0], y2: h.p[1], class: 'vc-hline' }); mk('circle', { cx: h.p[0], cy: h.p[1], r: 5.5, class: 'vc-rot', 'data-h': 'rot' }); }
        else mk('rect', { x: h.p[0] - 4.5, y: h.p[1] - 4.5, width: 9, height: 9, class: 'vc-handle', 'data-h': h.name });
      }
    }
    if (drag?.mode === 'marquee' && drag.moved) {
      const a = toScreen(...drag.p0), b = toScreen(...drag.p1);
      mk('rect', { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]), class: 'vc-marquee' });
    }
    draw2.nodes.forEach((n, i) => {
      const p = toScreen(n.x, n.y);
      if (n.hx || n.hy) for (const sgn of [1, -1]) { const h = toScreen(n.x + sgn * n.hx, n.y + sgn * n.hy); mk('line', { x1: p[0], y1: p[1], x2: h[0], y2: h[1], class: 'vc-hline' }); mk('circle', { cx: h[0], cy: h[1], r: 3.5, class: 'vc-node' }); }
      mk('rect', { x: p[0] - 4, y: p[1] - 4, width: 8, height: 8, class: i === 0 ? 'vc-node first' : 'vc-node' });
    });
    ov.replaceChildren(...els);
  }
  // 描いている途中の形（四角・だ円・直線）と、折れ線・ペンの案内の線（点線）
  function previewNodes() {
    const out = [];
    if (drag?.mode === 'shape' && drag.moved) out.push(build(V.shapeNode(shapeFrom(drag.kind, drag.a, drag.b), measure)));
    if (draw2.nodes.length) {
      const n = draw2.nodes, segs = draw2.kind === 'pen' ? V.penSegs(n, false) : n.map((p, i) => ({ c: i ? 'L' : 'M', x: p.x, y: p.y }));
      if (pointer && !drag) {
        const last = n[n.length - 1], pt = snapPt(pointer);
        segs.push(last.hx || last.hy ? { c: 'C', x1: last.x + last.hx, y1: last.y + last.hy, x2: pt[0], y2: pt[1], x: pt[0], y: pt[1] } : { c: 'L', x: pt[0], y: pt[1] });
      }
      out.push(build({ tag: 'path', attrs: { d: V.pathD(segs), fill: 'none', stroke: '#4b5fe8', 'stroke-width': '1.5', 'stroke-dasharray': '6 4', 'vector-effect': 'non-scaling-stroke' } }));
    }
    return out;
  }

  /* ---------- 横の欄（性質と一覧） ---------- */
  const firstLeaf = (s) => (s.type === 'g' ? s.children.map(firstLeaf).find(Boolean) || null : s);
  const firstOfType = (list, type) => { for (const s of list) { if (s.type === type) return s; if (s.type === 'g') { const f = firstOfType(s.children, type); if (f) return f; } } return null; };
  function syncProps() {
    const ss = selShapes(), one = ss[0];
    q('[data-ptitle]').textContent = !ss.length ? '新しい図形の性質' : ss.length === 1 ? `「${V.displayName(one)}」の性質` : `${ss.length} 個の図形の性質`;
    const src = (one && firstLeaf(one)) || style;
    if (document.activeElement !== P('fill')) { P('fillOn').checked = src.fill !== 'none'; if (src.fill !== 'none') P('fill').value = src.fill; }
    if (document.activeElement !== P('stroke')) { P('strokeOn').checked = src.stroke !== 'none'; if (src.stroke !== 'none') P('stroke').value = src.stroke; }
    P('sw').value = src.sw;
    const op = one ? one.opacity : style.opacity;
    P('opacity').value = Math.round(op * 100); side.querySelector('[data-out="opacity"]').textContent = Math.round(op * 100) + '%';
    const rectS = firstOfType(ss, 'rect'), textS = firstOfType(ss, 'text');
    P('rx').value = rectS ? rectS.rx : style.rx; P('rx').disabled = !!one && !rectS;
    P('size').value = r2(textS ? textS.size : style.size); P('size').disabled = !!one && !textS;
    const font = textS ? textS.font : style.font, fs2 = P('font');
    if (![...fs2.options].some((o) => o.value === font)) fs2.add(new Option('読み込んだ書体', font));
    fs2.value = font; fs2.disabled = !!one && !textS;
    const single = ss.length === 1 && one.type === 'text';
    if (document.activeElement !== P('text')) P('text').value = single ? one.text : '';
    P('text').disabled = !single;
    syncPos();
  }
  function syncPos() {
    const ss = selShapes();
    for (const k of ['x', 'y', 'w', 'h', 'rot']) G(k).disabled = !ss.length;
    q('[data-sel]').textContent = ss.length ? (ss.length === 1 ? V.displayName(ss[0]) : `${ss.length} 個を選択`) : '選んでいません';
    if (!ss.length) { for (const k of ['x', 'y', 'w', 'h', 'rot']) G(k).value = ''; return; }
    const b = selBox(), vals = { x: r2(b.x), y: r2(b.y), w: r2(b.w), h: r2(b.h) };
    for (const k in vals) if (document.activeElement !== G(k)) G(k).value = vals[k];
    const rs = ss.length === 1 && V.canRotateSelf(ss[0]);
    G('rot').disabled = !rs;
    if (document.activeElement !== G('rot')) G('rot').value = rs ? r2(ss[0].rot) : '';
    q('[data-sel]').textContent += `（${Math.round(b.w)} × ${Math.round(b.h)}）`;
  }
  // 一覧の並び・名前・隠す・固定が変わったときだけ作り直す（選んだ物だけが変わったときは印を替える。
  // 作り直すと、名前のダブルクリックの 2 回目が別のボタンに当たり、名前を変えられなくなるため）
  let layerSig = '';
  function syncLayers() {
    const sig = doc.shapes.map((s) => [s.id, s.name, s.type, s.hidden, s.locked, s.children?.length].join('\t')).join('\n');
    if (sig === layerSig && layersUl.querySelector('.vc-layer')) {
      for (const li of layersUl.querySelectorAll('.vc-layer')) { const on = sel.includes(li.dataset.id); li.classList.toggle('selected', on); li.querySelector('.vc-name')?.setAttribute('aria-pressed', String(on)); }
      return;
    }
    layerSig = sig;
    const fo = document.activeElement?.closest?.('.vc-layer'), fid = fo?.dataset.id, fcls = fid && ['vc-eye', 'vc-lock', 'vc-name'].find((c) => document.activeElement.classList.contains(c));
    if (!doc.shapes.length) { layersUl.innerHTML = '<li class="vc-empty">まだ図形がありません。左の道具で描くと、ここに並びます。</li>'; return; }
    layersUl.innerHTML = [...doc.shapes].reverse().map((s) => {
      const nm = esc(V.displayName(s)), on = sel.includes(s.id);
      return `<li class="vc-layer${on ? ' selected' : ''}${s.hidden ? ' is-hidden' : ''}${s.locked ? ' is-locked' : ''}" data-id="${esc(s.id)}">` +
        `<button type="button" class="flat vc-eye" aria-pressed="${s.hidden}" aria-label="「${nm}」を隠す" title="隠す・出す">${s.hidden ? EYE_OFF : EYE}</button>` +
        `<button type="button" class="flat vc-lock" aria-pressed="${s.locked}" aria-label="「${nm}」を固定する" title="固定する・外す（固定した図形は押しても選ばれません）">${s.locked ? LOCK : UNLOCK}</button>` +
        `<button type="button" class="flat vc-name" aria-pressed="${on}" title="押すと選びます。ダブルクリックで名前を変えます"><span class="vc-mark" aria-hidden="true">${MARK[s.type] || ''}</span>${nm}${s.type === 'g' ? `<span class="vc-count">（${s.children.length}）</span>` : ''}</button></li>`;
    }).join('');
    if (fid && fcls) layersUl.querySelector(`[data-id="${CSS.escape(fid)}"] .${fcls}`)?.focus({ preventScroll: true });
  }
  function syncSide() { syncProps(); syncLayers(); }

  /* ---------- 図形を作る ---------- */
  function shapeFrom(kind, a, b) {
    const st = { fill: style.fill, stroke: style.stroke, sw: style.sw, opacity: style.opacity };
    if (kind === 'line') return V.makeShape('line', { ...st, fill: 'none', x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
    if (kind === 'rect') return V.makeShape('rect', { ...st, x, y, w, h, rx: Math.min(style.rx, w / 2, h / 2) });
    return V.makeShape('ellipse', { ...st, cx: r2(x + w / 2), cy: r2(y + h / 2), rx: r2(w / 2), ry: r2(h / 2) });
  }
  function add(s, msg) {
    const before = snapshot();
    s.name = V.nextName(doc.shapes, s.type);
    doc.shapes = [...doc.shapes, s]; sel = [s.id];
    commit(before, 'draw', { type: s.type, id: s.id, box: Object.fromEntries(Object.entries(V.bbox(s, measure)).map(([k, v]) => [k, r2(v)])) });
    sound.play('drop');
    say(msg || `${V.displayName(s)}を描きました。続けて描くか、「選ぶ」（V）で動かします。`);
  }
  // 四角とだ円は Shift で正方形と正円、直線は Shift で 45° ごと
  function constrain(kind, a, b, shift) {
    if (!shift) return b;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (kind === 'line') { const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy); return [r2(a[0] + Math.cos(ang) * len), r2(a[1] + Math.sin(ang) * len)]; }
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    return [a[0] + Math.sign(dx || 1) * m, a[1] + Math.sign(dy || 1) * m];
  }
  function finishShape(d) {
    const w = Math.abs(d.b[0] - d.a[0]) * view.z, h = Math.abs(d.b[1] - d.a[1]) * view.z;
    if (!d.moved || (d.kind === 'line' ? Math.hypot(w, h) < 3 : w < 2 || h < 2)) { say('紙の上をドラッグすると描けます（押しただけでは描きません）。'); schedule(); return; }
    add(shapeFrom(d.kind, d.a, d.b));
  }
  // 折れ線とペン: 点を置く・終える・やめる
  function downPath(e, p) {
    const n = draw2.nodes, sp = snapPt(p);
    if (n.length && draw2.kind !== tool) n.length = 0;
    draw2.kind = tool;
    const first = n[0], need = tool === 'poly' ? 3 : 2;
    if (first && n.length >= need) { const a = toScreen(first.x, first.y), b = toScreen(...p); if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 8) { finishDraw2(true); return; } }
    n.push({ x: sp[0], y: sp[1], hx: 0, hy: 0 });
    if (tool === 'pen') startDrag(e, { mode: 'pen', node: n[n.length - 1] });
    say(`${n.length} 個目の点を置きました。${n.length >= need ? '最初の点を押すと閉じ、ダブルクリックか Enter で終わります。' : ''}`);
    schedule();
  }
  function finishDraw2(closed) {
    const n = draw2.nodes.splice(0), kind = draw2.kind;
    const st = { fill: style.fill, stroke: style.stroke, sw: style.sw, opacity: style.opacity };
    if (kind === 'poly' && closed && n.length >= 3) add(V.makeShape('polygon', { ...st, points: n.map((p) => [p.x, p.y]) }), '多角形を描きました。');
    else if (kind === 'poly' && n.length >= 2) add(V.makeShape('polyline', { ...st, fill: 'none', points: n.map((p) => [p.x, p.y]) }), '折れ線を描きました。');
    else if (kind === 'pen' && n.length >= 2) add(V.makeShape('path', { ...st, fill: closed ? style.fill : 'none', segs: V.penSegs(n.map((p) => ({ ...p, hx: r2(p.hx), hy: r2(p.hy) })), closed) }), closed ? '閉じた曲線を描きました。' : '曲線を描きました。');
    else say('点が足りないので、描くのをやめました。');
    schedule();
  }
  function cancelDraw2() { draw2.nodes.length = 0; say('描くのをやめました。'); schedule(); }

  /* ---------- 文字 ---------- */
  function openText(p, editId) {
    const s = editId ? byId(editId) : null, size = s ? s.size : style.size;
    textEdit = { p, editId };
    const [sx, sy] = toScreen(s ? s.x : p[0], s ? s.y - 0.9 * size : p[1]);
    Object.assign(textIn.style, { left: sx + 'px', top: sy + 'px', fontSize: Math.max(12, Math.min(72, size * view.z)) + 'px', fontFamily: s ? s.font : style.font });
    textIn.value = s ? s.text : '';
    textIn.hidden = false; textIn.focus(); textIn.select();
    say('文字を打って Enter で決めます。Esc でやめます。');
  }
  function closeText(ok) {
    if (!textEdit) return;
    const t = textEdit, v = textIn.value.trim().slice(0, 2000);
    textEdit = null; textIn.hidden = true;
    win.body.focus({ preventScroll: true });
    if (!ok || !v) { say(ok ? '文字が空なので、置きませんでした。' : '文字を置くのをやめました。'); return; }
    if (t.editId) {
      const before = snapshot();
      doc.shapes = doc.shapes.map((s) => (s.id === t.editId ? { ...s, text: v } : s));
      commit(before, 'text', { id: t.editId, text: v }); say('文字を直しました。');
    } else add(V.makeShape('text', { fill: style.fill, stroke: 'none', sw: 0, opacity: style.opacity, x: r2(t.p[0]), y: r2(t.p[1] + 0.9 * style.size), text: v, size: style.size, font: style.font }), `文字「${v}」を置きました。`);
  }
  textIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); if (e.isComposing || e.keyCode === 229) return; closeText(true); }
    else if (e.key === 'Escape') { e.preventDefault(); closeText(false); }
  });
  textIn.addEventListener('blur', () => closeText(true));

  /* ---------- スポイト ---------- */
  function leafAt(list, x, y) {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.hidden || !V.hitShape(s, x, y, tolW(), measure)) continue;
      return s.type === 'g' ? leafAt(s.children, x, y) : s;
    }
    return null;
  }
  function doPick(e, p) {
    const src = leafAt(doc.shapes, p[0], p[1]), key = e.shiftKey ? 'stroke' : 'fill', word = key === 'fill' ? '塗り' : '線';
    const color = src ? (src[key] !== 'none' ? src[key] : null) : doc.background !== 'none' ? doc.background : null;
    if (!color) { sound.play('error'); say(src ? `この図形の${word}は「なし」なので、色を取れません。` : '紙が透明なので、色を取れません。'); L('pick', { key }, 'error: 色がない'); return; }
    applyProp(key, color, true, true);
    sound.play('select');
    say(`${word}の色を ${color} にしました。${sel.length ? '選んでいる図形にも使いました。' : '次に描く図形に使います。'}`);
    L('pick', { key, color, from: src?.id || 'paper' });
  }

  /* ---------- 性質を変える ---------- */
  const STYLE_KEYS = ['fill', 'stroke', 'sw', 'opacity', 'rx', 'size', 'font'];
  // 選んだ図形の性質を変える。何も選んでいないとき（とスポイト）は、次に描く図形の性質（style）を変える
  function applyProp(key, value, commitNow, setDefault = !sel.length) {
    if (setDefault && STYLE_KEYS.includes(key)) style[key] = value;
    if (!sel.length) { syncProps(); return; }
    const before = commitNow ? snapshot() : null;
    const fit1 = (s) => (key === 'rx' ? s.type === 'rect' : key === 'size' || key === 'font' || key === 'text' ? s.type === 'text' : true);
    const deep = (s) => {
      if (s.type === 'g') return { ...s, children: s.children.map(deep) };
      if (!fit1(s)) return s;
      return key === 'rx' ? { ...s, rx: Math.max(0, Math.min(value, s.w / 2, s.h / 2)) } : { ...s, [key]: value };
    };
    doc.shapes = doc.shapes.map((s) => (!sel.includes(s.id) ? s : key === 'opacity' ? { ...s, opacity: value } : deep(s)));
    schedule();
    if (commitNow) commit(before, 'prop', { key, value, ids: sel });
  }
  function applyGeo(k) {
    const ss = selShapes();
    if (!ss.length) return;
    const before = snapshot(), num = (f) => parseFloat(G(f).value);
    if (k === 'rot') {
      const s = ss[0], v = num('rot');
      if (!V.canRotateSelf(s) || !Number.isFinite(v)) { syncPos(); return; }
      doc.shapes = doc.shapes.map((x) => (x.id === s.id ? V.setRotation(x, v) : x));
    } else {
      const b = selBox(), v = num(k);
      if (!Number.isFinite(v)) { syncPos(); return; }
      if (k === 'x' || k === 'y') { const dx = k === 'x' ? v - b.x : 0, dy = k === 'y' ? v - b.y : 0; doc.shapes = doc.shapes.map((s) => (sel.includes(s.id) ? V.moveShape(s, dx, dy) : s)); }
      else { const A = V.boxMap(b, { x: b.x, y: b.y, w: k === 'w' ? Math.max(1, v) : b.w, h: k === 'h' ? Math.max(1, v) : b.h }); doc.shapes = doc.shapes.map((s) => (sel.includes(s.id) ? V.mapShape(s, A, measure) : s)); }
    }
    if (!commit(before, 'geo', { field: k, value: G(k).value })) syncPos();
  }
  side.addEventListener('input', (e) => {
    const k = e.target.dataset.p;
    if (k === 'fill' || k === 'stroke') { if (!live) live = snapshot(); P(k + 'On').checked = true; applyProp(k, e.target.value, false); }
    else if (k === 'opacity') { if (!live) live = snapshot(); side.querySelector('[data-out="opacity"]').textContent = e.target.value + '%'; applyProp('opacity', +e.target.value / 100, false); }
  });
  side.addEventListener('change', (e) => {
    const t = e.target, k = t.dataset.p;
    if (t.dataset.g) { applyGeo(t.dataset.g); return; }
    if (k === 'fill' || k === 'stroke' || k === 'opacity') {
      // 動かしている間（input）は記録せずに見せ、決めたとき（change）に 1 回だけ元に戻せる記録を残す
      const before = live || snapshot();
      applyProp(k, k === 'opacity' ? +t.value / 100 : t.value, false);
      if (k !== 'opacity') P(k + 'On').checked = true;
      if (sel.length) commit(before, 'prop', { key: k, value: t.value, ids: sel });
      live = null; return;
    }
    if (k === 'fillOn' || k === 'strokeOn') { const key = k === 'fillOn' ? 'fill' : 'stroke'; applyProp(key, t.checked ? P(key).value : 'none', true); return; }
    if (k === 'sw') { const v = Math.max(0, Math.min(200, parseFloat(t.value) || 0)); applyProp('sw', v, true); return; }
    if (k === 'rx') { applyProp('rx', Math.max(0, parseFloat(t.value) || 0), true); return; }
    if (k === 'size') { const v = parseFloat(t.value); if (Number.isFinite(v)) applyProp('size', Math.max(4, Math.min(1000, v)), true); return; }
    if (k === 'font') { applyProp('font', t.value, true); return; }
    if (k === 'text') { const v = t.value.trim(); if (v) applyProp('text', v.slice(0, 2000), true); else syncProps(); }
  });
  side.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type="number"], input[type="text"]') && !(e.isComposing || e.keyCode === 229)) { e.preventDefault(); e.target.blur(); win.body.focus({ preventScroll: true }); } });

  /* ---------- 一覧 ---------- */
  function toggleFlag(id, key) {
    const s = byId(id); if (!s) return;
    const before = snapshot(), v = !s[key];
    doc.shapes = doc.shapes.map((x) => (x.id === id ? { ...x, [key]: v } : x));
    if (v) sel = sel.filter((x) => x !== id);
    commit(before, 'layer', { id, [key]: v });
    sound.play(v ? 'toggleOn' : 'toggleOff');
    say(`${V.displayName(s)}を${key === 'hidden' ? (v ? '隠しました' : '出しました') : v ? '固定しました。押しても選ばれません' : '固定から外しました'}。`);
  }
  layersUl.addEventListener('click', (e) => {
    const li = e.target.closest('[data-id]'); if (!li) return;
    const id = li.dataset.id, s = byId(id); if (!s) return;
    if (e.target.closest('.vc-eye')) return toggleFlag(id, 'hidden');
    if (e.target.closest('.vc-lock')) return toggleFlag(id, 'locked');
    if (!e.target.closest('.vc-name')) return;
    if (s.locked || s.hidden) { sound.play('error'); say(s.locked ? '固定している図形は選べません。左の鍵を押すと外せます。' : '隠している図形は選べません。左の目を押すと出せます。'); return; }
    sel = e.shiftKey ? (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]) : [id];
    if (tool !== 'select') setTool('select', true);
    sound.play('select'); syncSide(); schedule();
  });
  layersUl.addEventListener('dblclick', (e) => { const li = e.target.closest('[data-id]'); if (li && e.target.closest('.vc-name')) startRename(li.dataset.id); });
  function startRename(id) {
    const s = byId(id), btn = layersUl.querySelector(`[data-id="${CSS.escape(id)}"] .vc-name`);
    if (!s || !btn) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'vc-rename'; inp.value = V.displayName(s); inp.setAttribute('aria-label', '図形の名前'); inp.autocomplete = 'off';
    btn.replaceWith(inp); inp.focus(); inp.select();
    say('名前を打って Enter で決めます。Esc でやめます。');
    let done = false;
    const finish = (ok) => {
      if (done) return; done = true;
      const v = inp.value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
      if (ok && v && v !== s.name) { const before = snapshot(); doc.shapes = doc.shapes.map((x) => (x.id === id ? { ...x, name: v } : x)); commit(before, 'rename', { id, name: v }); say(`名前を「${v}」にしました。`); }
      else { layerSig = ''; syncLayers(); }
      win.body.focus({ preventScroll: true });
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); if (e.isComposing || e.keyCode === 229) return; finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
  }

  /* ---------- ポインタの操作 ---------- */
  // ドラッグの間の動きと離すのは window で受ける。つかまえ（setPointerCapture）は、窓の中で入力の行き先が動いたときなどに
  // Chrome が外すことがあるので、つかまえが外れた知らせ（lostpointercapture）ではドラッグを終えない
  function startDrag(e, d) {
    drag = { ...d, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    try { svg.setPointerCapture(e.pointerId); } catch { /* つかまえられなくても window で受けるので動く */ }
    addEventListener('pointermove', onDragMove);
    addEventListener('pointerup', endDrag);
    addEventListener('pointercancel', endDrag);
  }
  function focusBody() { if (!win.body.contains(document.activeElement) || document.activeElement.matches('input, select, textarea')) win.body.focus({ preventScroll: true }); }
  function downSelect(e, p) {
    const h = handleAt(e);
    if (h) {
      const f = frame(), before = snapshot();
      if (h === 'rot') { const c = frameCenter(f); startDrag(e, { mode: 'rotate', f, c, a0: Math.atan2(p[1] - c[1], p[0] - c[0]), base: doc.shapes, before }); }
      else if (h === 'p1' || h === 'p2') startDrag(e, { mode: 'end', which: h, s0: f.s, base: doc.shapes, before });
      else startDrag(e, { mode: 'resize', h, f, p0: p, base: doc.shapes, before });
      return;
    }
    const i = V.pick(doc.shapes, p[0], p[1], tolW(), measure);
    if (i >= 0) {
      const id = doc.shapes[i].id;
      if (e.shiftKey) sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      else if (!sel.includes(id)) sel = [id];
      sound.play('select'); syncSide(); schedule();
      if (sel.includes(id)) startDrag(e, { mode: 'move', p0: p, base: doc.shapes, box0: selBox(), before: snapshot() });
      return;
    }
    if (!e.shiftKey && sel.length) { sel = []; syncSide(); schedule(); }
    startDrag(e, { mode: 'marquee', p0: p, p1: p, add: e.shiftKey });
  }
  svg.addEventListener('pointerdown', (e) => {
    if (textEdit) { closeText(true); return; }
    focusBody();
    const p = worldOf(e);
    if (e.button === 1 || (e.button === 0 && spaceDown)) { e.preventDefault(); startDrag(e, { mode: 'pan', x0: e.clientX, y0: e.clientY, px: view.px, py: view.py }); stage.classList.add('vc-panning'); return; }
    if (e.button !== 0) return;
    e.preventDefault();
    if (tool === 'select') downSelect(e, p);
    else if (tool === 'rect' || tool === 'ellipse' || tool === 'line') { const a = snapPt(p); startDrag(e, { mode: 'shape', kind: tool, a, b: a }); }
    else if (tool === 'poly' || tool === 'pen') downPath(e, p);
    // 押したときの既定の動き（入力の行き先の移動）が済んでから、文字の欄を開く
    else if (tool === 'text') { const sp = snapPt(p); setTimeout(() => openText(sp, null), 0); }
    else if (tool === 'pick') doPick(e, p);
  });
  svg.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // 中ボタンの自動スクロールを出さない
  // 紙の上の動き: 位置の表示、つまみの上のカーソル、図形に重なったときの印、折れ線とペンの案内の線
  svg.addEventListener('pointermove', (e) => {
    const p = worldOf(e);
    pointer = p;
    q('[data-pos]').textContent = `${Math.round(p[0])}, ${Math.round(p[1])}`;
    if (drag) return;
    if (tool === 'select') {
      const h = handleAt(e);
      svg.style.cursor = h ? CURSOR[h] : '';
      const i = h ? -1 : V.pick(doc.shapes, p[0], p[1], tolW(), measure), nh = i >= 0 ? doc.shapes[i].id : null;
      if (nh !== hover) { hover = nh; schedule(); }
    } else if (draw2.nodes.length) schedule();
  });
  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const p = worldOf(e);
    pointer = p;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
    drag.moved = true;
    const d = drag;
    if (d.mode === 'pan') { view.px = d.px + e.clientX - d.x0; view.py = d.py + e.clientY - d.y0; }
    else if (d.mode === 'move') {
      let dx = p[0] - d.p0[0], dy = p[1] - d.p0[1];
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (opt.snap) [dx, dy] = V.snapDelta(d.box0, dx, dy, opt.gridSize); else { dx = r2(dx); dy = r2(dy); }
      d.d = [dx, dy];
      doc.shapes = d.base.map((s) => (sel.includes(s.id) ? V.moveShape(s, dx, dy) : s));
    } else if (d.mode === 'resize') {
      const f = d.f, dd = [p[0] - d.p0[0], p[1] - d.p0[1]];
      let [lx, ly] = f.rot ? V.apply(V.rotation(-f.rot), dd[0], dd[1]) : dd;
      if (opt.snap && !f.rot) { const hp = V.handlePoints(f.box)[d.h]; lx = V.snap(hp[0] + lx, opt.gridSize) - hp[0]; ly = V.snap(hp[1] + ly, opt.gridSize) - hp[1]; }
      const nb = V.resizeBox(f.box, d.h, lx, ly, { keepRatio: e.shiftKey, fromCenter: e.ctrlKey });
      if (f.kind === 'local') doc.shapes = d.base.map((s) => (s.id === f.s.id ? V.resizeLocal(s, nb, measure) : s));
      else { const A = V.boxMap(f.box, nb); doc.shapes = d.base.map((s) => (sel.includes(s.id) ? V.mapShape(s, A, measure) : s)); }
      d.nb = nb;
    } else if (d.mode === 'rotate') {
      let a = ((Math.atan2(p[1] - d.c[1], p[0] - d.c[0]) - d.a0) * 180) / Math.PI;
      a = r2(a);
      if (d.f.kind === 'local') doc.shapes = d.base.map((s) => (s.id === d.f.s.id ? V.setRotation(s, e.shiftKey ? Math.round((s.rot + a) / 15) * 15 : r2(s.rot + a)) : s));
      else { if (e.shiftKey) a = Math.round(a / 15) * 15; doc.shapes = d.base.map((s) => (sel.includes(s.id) ? V.rotateShape(s, a, d.c[0], d.c[1], measure) : s)); }
      d.a = a;
    } else if (d.mode === 'end') {
      const s0 = d.s0, other = d.which === 'p1' ? [s0.x2, s0.y2] : [s0.x1, s0.y1], np = constrain('line', other, snapPt(p), e.shiftKey);
      doc.shapes = d.base.map((s) => (s.id === s0.id ? (d.which === 'p1' ? { ...s, x1: np[0], y1: np[1] } : { ...s, x2: np[0], y2: np[1] }) : s));
    } else if (d.mode === 'shape') d.b = constrain(d.kind, d.a, snapPt(p), e.shiftKey);
    else if (d.mode === 'marquee') d.p1 = p;
    else if (d.mode === 'pen') { d.node.hx = r2(p[0] - d.node.x); d.node.hy = r2(p[1] - d.node.y); }
    schedule();
    if (d.mode !== 'pan' && d.mode !== 'marquee' && d.mode !== 'shape' && d.mode !== 'pen') syncPos();
  }
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    removeEventListener('pointermove', onDragMove); removeEventListener('pointerup', endDrag); removeEventListener('pointercancel', endDrag);
    stage.classList.remove('vc-panning');
    try { svg.releasePointerCapture(d.id); } catch { /* 外れている */ }
    if (d.mode === 'move' && d.moved) commit(d.before, 'move', { ids: sel, d: d.d });
    else if (d.mode === 'resize' && d.moved) commit(d.before, 'resize', { handle: d.h, box: d.nb });
    else if (d.mode === 'rotate' && d.moved) commit(d.before, 'rotate', { ids: sel, deg: d.a });
    else if (d.mode === 'end' && d.moved) commit(d.before, 'endpoint', { which: d.which });
    else if (d.mode === 'shape') finishShape(d);
    else if (d.mode === 'marquee' && d.moved) {
      const r = { x: Math.min(d.p0[0], d.p1[0]), y: Math.min(d.p0[1], d.p1[1]), w: Math.abs(d.p1[0] - d.p0[0]), h: Math.abs(d.p1[1] - d.p0[1]) };
      const ids = V.inMarquee(doc.shapes, r, measure).map((i) => doc.shapes[i].id);
      sel = d.add ? [...new Set([...sel, ...ids])] : ids;
      syncSide(); L('marquee', { count: ids.length });
      say(ids.length ? `${ids.length} 個の図形を選びました。` : '囲みの中に、全体が入る図形はありませんでした。');
    } else if (d.mode === 'pan') L('pan', { px: Math.round(view.px), py: Math.round(view.py) });
    schedule();
  }
  svg.addEventListener('pointerenter', () => { overStage = true; });
  svg.addEventListener('pointerleave', () => { overStage = false; q('[data-pos]').textContent = ''; if (hover && !drag) { hover = null; schedule(); } });
  svg.addEventListener('dblclick', (e) => {
    // 折れ線とペン: ダブルクリックで終える。2 回目の押しで置いた点（1 回目とほぼ同じ所）は捨てる
    if ((tool === 'poly' || tool === 'pen') && draw2.nodes.length >= 2) {
      const n = draw2.nodes, a = toScreen(n[n.length - 1].x, n[n.length - 1].y), b = toScreen(n[n.length - 2].x, n[n.length - 2].y);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 4) n.pop();
      if (n.length >= 2) finishDraw2(false);
      return;
    }
    if (tool !== 'select') return;
    const p = worldOf(e), i = V.pick(doc.shapes, p[0], p[1], tolW(), measure);
    if (i >= 0 && doc.shapes[i].type === 'text') openText(p, doc.shapes[i].id);
  });
  svg.addEventListener('contextmenu', (e) => { e.preventDefault(); if (draw2.nodes.length) finishDraw2(false); });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect(), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(view.z * Math.exp(-dy * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  const ro = new ResizeObserver(() => { if (!fitted) fit(); schedule(); });
  ro.observe(svg);

  /* ---------- 道具 ---------- */
  function setTool(id, quiet) {
    if (draw2.nodes.length && id !== draw2.kind) { if (draw2.nodes.length >= 2) finishDraw2(false); else cancelDraw2(); }
    if (textEdit) closeText(true);
    tool = id; hover = null;
    win.body.querySelectorAll('.vc-tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
    stage.dataset.tool = id; svg.style.cursor = '';
    if (!quiet) say(GUIDE[id]);
    schedule(); L('tool', { tool: id });
  }
  q('.vc-tools').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) { setTool(b.dataset.tool); sound.play('key', TOOLS.findIndex((t) => t[0] === b.dataset.tool)); } });

  /* ---------- 命令 ---------- */
  async function confirmDiscard() {
    if (!dirty) return true;
    const a = await os.msgbox({ title: '図形エディタ', text: `${path ? '「' + basename(path) + '」' : '無題の絵'}の変更は保存されていません。\n\n保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
    if (a === 'はい') return await save();
    return a === 'いいえ';
  }
  function setDoc(d, p) {
    doc = d; path = p; sel = []; hist.clear(); dirty = false; draw2.nodes.length = 0;
    win.setArgs({ path: p || undefined });
    fitted = false; setTitle(); syncSide(); schedule();
  }
  async function load(p) {
    try {
      const { doc: d, dropped } = V.parseSVG(await fs.readText(p), measure);
      setDoc(d, p); setTool('select', true); os.addRecent(p);
      L('open', { path: p, shapes: d.shapes.length, dropped });
      say(dropped.length ? `「${basename(p)}」を開きました。扱えない要素（${dropped.slice(0, 5).join('、')}${dropped.length > 5 ? ' など' : ''}）は読み込んでいません。` : `「${basename(p)}」を開きました。図形は ${d.shapes.length} 個です。`);
      return true;
    } catch (err) {
      os.msgbox({ title: '図形エディタ', text: `「${basename(p)}」を開けませんでした。\n\n${err.message}`, icon: 'error' });
      L('open', { path: p }, 'error: ' + err.message);
      return false;
    }
  }
  async function save() {
    if (!path || !/\.svg$/i.test(path)) return saveAs();
    try {
      await fs.write(path, V.toSVG(doc, measure), 'image/svg+xml');
      dirty = false; setTitle(); os.addRecent(path); say(`「${path}」に保存しました。`); L('save', { path, shapes: doc.shapes.length });
      return true;
    } catch (err) { os.msgbox({ title: '図形エディタ', text: err.message, icon: 'error' }); L('save', { path }, 'error: ' + err.message); return false; }
  }
  // 既定の場所（/画像）が無ければ作ってから、保存の箱を開く
  const ensureDir = async () => { if (!path && !(await fs.exists('/画像'))) await fs.mkdir('/画像'); };
  async function saveAs() {
    await ensureDir();
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/画像', name: path ? stem(path) + '.svg' : '無題.svg', exts: ['.svg'], typeLabel: 'SVG 画像' });
    if (!p) return false;
    path = p; win.setArgs({ path });
    return save();
  }
  async function pngBlob(k) {
    const url = URL.createObjectURL(new Blob([V.toSVG(doc, measure)], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = Math.round(doc.width * k); c.height = Math.round(doc.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error('PNG を作れませんでした。'))), 'image/png'));
    } finally { URL.revokeObjectURL(url); }
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const baseName = () => (path ? stem(path) : '無題');
  function dialog(title, inner, width = 340) {
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog vc-dlg'; dlg.style.width = width + 'px';
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text"></div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div>
      <div class="window-body">${inner}<div class="button-row"><button type="button" class="default" data-close="ok">OK</button><button type="button" data-close="">キャンセル</button></div></div>`;
    dlg.querySelector('.title-bar-text').textContent = title;
    document.body.append(dlg);
    return dlg;
  }
  async function scaleDialog() {
    const dlg = dialog('PNG で書き出す', `<fieldset><legend>倍率</legend><div class="col">${SCALES.map((k) => {
      const w = Math.round(doc.width * k), h = Math.round(doc.height * k), off = w > MAX_PX || h > MAX_PX;
      return `<label><input type="radio" name="vcScale" value="${k}"${k === 1 ? ' checked' : ''}${off ? ' disabled' : ''}> ${k} 倍（${w} × ${h}）${off ? ' 大きすぎます' : ''}</label>`;
    }).join('')}</div></fieldset>`);
    const r = await w95.openDialog(dlg), k = +dlg.querySelector('[name=vcScale]:checked').value;
    dlg.remove();
    return r === 'ok' ? k : null;
  }
  async function exportPNG(toPC) {
    const k = await scaleDialog();
    if (!k) return;
    try {
      const blob = await pngBlob(k), name = `${baseName()}${k > 1 ? `-${k}倍` : ''}.png`;
      if (toPC) { download(blob, name); say(`「${name}」をパソコンへ書き出しました。`); L('export', { kind: 'png', scale: k, size: blob.size }); return; }
      await ensureDir();
      const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/画像', name, exts: ['.png'], typeLabel: 'PNG 画像' });
      if (!p) return;
      await fs.write(p, blob, 'image/png');
      say(`「${p}」に PNG（${Math.round(doc.width * k)} × ${Math.round(doc.height * k)}）を書き出しました。`); L('png', { path: p, scale: k, size: blob.size });
    } catch (err) { os.msgbox({ title: '図形エディタ', text: `PNG を書き出せませんでした。\n\n${err.message}`, icon: 'error' }); L('png', { scale: k }, 'error: ' + err.message); }
  }
  // 新しい絵・画用紙の大きさと色
  async function paperDialog(mode) {
    const curW = mode === 'new' ? 800 : doc.width, curH = mode === 'new' ? 600 : doc.height, curBg = mode === 'new' ? '#ffffff' : doc.background;
    const known = SIZES.some(([w, h]) => w === curW && h === curH);
    const dlg = dialog(mode === 'new' ? '新しい絵' : '画用紙の大きさと色', `
      <fieldset><legend>大きさ</legend><div class="col">
        ${SIZES.map(([w, h, label]) => `<label><input type="radio" name="vcSize" value="${w}x${h}"${w === curW && h === curH ? ' checked' : ''}> ${w} × ${h}（${label}）</label>`).join('')}
        <label><input type="radio" name="vcSize" value="custom"${known ? '' : ' checked'}> ほかの大きさ:</label>
        <div class="row vc-custom"><label for="vcCw${wid}">幅</label><input type="number" id="vcCw${wid}" min="16" max="4096" value="${curW}"><label for="vcCh${wid}">高さ</label><input type="number" id="vcCh${wid}" min="16" max="4096" value="${curH}"></div>
      </div></fieldset>
      <fieldset style="margin-top:8px"><legend>紙の色</legend><div class="row">${PAPERS.map(([v, label]) => `<label><input type="radio" name="vcBg" value="${v}"${v === curBg ? ' checked' : ''}> ${label}</label>`).join('')}</div></fieldset>`, 360);
    if (!dlg.querySelector('[name=vcBg]:checked')) dlg.querySelector('[name=vcBg]').checked = true;
    dlg.querySelectorAll('.vc-custom input').forEach((i) => i.addEventListener('input', () => { dlg.querySelector('[name=vcSize][value=custom]').checked = true; }));
    const r = await w95.openDialog(dlg);
    const sz = dlg.querySelector('[name=vcSize]:checked').value, bg = dlg.querySelector('[name=vcBg]:checked').value;
    const clampN = (v, d) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(16, Math.min(4096, n)) : d; };
    const [w, h] = sz === 'custom' ? [clampN(dlg.querySelector(`#vcCw${wid}`).value, curW), clampN(dlg.querySelector(`#vcCh${wid}`).value, curH)] : sz.split('x').map(Number);
    dlg.remove();
    return r === 'ok' ? { width: w, height: h, background: bg } : null;
  }
  function order(how) {
    if (!sel.length) { sound.play('error'); say('先に図形を選んでください。'); return; }
    const before = snapshot();
    doc.shapes = V.reorder(doc.shapes, sel, how);
    if (commit(before, 'order', { how, ids: sel })) say({ top: '最前面へ移しました。', up: '1 つ前へ移しました。', down: '1 つ後ろへ移しました。', bottom: '最背面へ移しました。' }[how]);
  }
  function transformSel(fn, what, a) {
    if (!sel.length) { sound.play('error'); say('先に図形を選んでください。'); return false; }
    const before = snapshot();
    doc.shapes = fn(doc.shapes);
    return commit(before, what, a);
  }
  const ALIGN = { left: '左', hcenter: '左右の中央', right: '右', top: '上', vcenter: '上下の中央', bottom: '下' };
  const cmds = {
    async new() {
      if (!(await confirmDiscard())) return;
      const r = await paperDialog('new');
      if (!r) return;
      setDoc(V.newDoc(r), null); setTool('rect', true); say(FIRST); L('new', r);
    },
    async open() {
      if (!(await confirmDiscard())) return;
      const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/画像', exts: ['.svg'], typeLabel: 'SVG 画像' });
      if (p) load(p);
    },
    save, saveas: saveAs,
    png: () => exportPNG(false), 'dl-png': () => exportPNG(true),
    'dl-svg': () => { const name = baseName() + '.svg'; download(new Blob([V.toSVG(doc, measure)], { type: 'image/svg+xml' }), name); say(`「${name}」をパソコンへ書き出しました。`); L('export', { kind: 'svg' }); },
    close: () => win.close(),
    undo() { const s = hist.undo(snapshot()); if (s === null) { sound.play('error'); say('これより前には戻せません。'); return; } restore(s); changed(); sound.play('op'); L('undo'); say('元に戻しました。'); },
    redo() { const s = hist.redo(snapshot()); if (s === null) { sound.play('error'); say('やり直す操作がありません。'); return; } restore(s); changed(); sound.play('op'); L('redo'); say('やり直しました。'); },
    copy() { if (!sel.length) { sound.play('error'); return false; } clip = JSON.stringify(selShapes()); pasteN = 0; say(`${sel.length} 個の図形をコピーしました。`); L('copy', { count: sel.length }); return true; },
    cut() { if (cmds.copy()) { cmds.del(); L('cut'); } },
    paste() {
      if (!clip) { sound.play('error'); say('コピーした図形がありません。'); return; }
      const before = snapshot(), k = 10 * ++pasteN, items = JSON.parse(clip).map((s) => V.cloneShape(s, k, k));
      doc.shapes = [...doc.shapes, ...items]; sel = items.map((s) => s.id);
      commit(before, 'paste', { count: items.length }); sound.play('drop'); say(`${items.length} 個の図形を貼り付けました。`);
    },
    dup() {
      if (!sel.length) { sound.play('error'); say('先に図形を選んでください。'); return; }
      const before = snapshot(), items = selShapes().map((s) => ({ ...V.cloneShape(s, 10, 10), name: V.displayName(s) + ' のコピー' }));
      doc.shapes = [...doc.shapes, ...items]; sel = items.map((s) => s.id);
      commit(before, 'dup', { count: items.length }); sound.play('drop'); say(`${items.length} 個を複製しました。`);
    },
    del() {
      if (!sel.length) { sound.play('error'); return; }
      const before = snapshot(), n = sel.length;
      doc.shapes = doc.shapes.filter((s) => !sel.includes(s.id)); sel = [];
      commit(before, 'delete', { count: n }); sound.play('trash'); say(`${n} 個の図形を消しました。`);
    },
    selall() { sel = doc.shapes.filter((s) => !s.hidden && !s.locked).map((s) => s.id); if (tool !== 'select') setTool('select', true); syncSide(); schedule(); say(`${sel.length} 個の図形を選びました。`); },
    selnone() { sel = []; syncSide(); schedule(); },
    group() {
      if (!sel.length) { sound.play('error'); say('まとめる図形を選んでください（Shift で足せます）。'); return; }
      const before = snapshot(), { shapes, group } = V.groupShapes(doc.shapes, sel, V.nextName(doc.shapes, 'g'));
      doc.shapes = shapes; sel = [group.id];
      commit(before, 'group', { id: group.id, count: group.children.length }); say(`${group.children.length} 個を「${group.name}」にまとめました。`);
    },
    ungroup() {
      const gs = selShapes().filter((s) => s.type === 'g');
      if (!gs.length) { sound.play('error'); say('まとめを選んでから解いてください。'); return; }
      const before = snapshot(), ids = [];
      for (const g of gs) { const r = V.ungroupShapes(doc.shapes, g.id); doc.shapes = r.shapes; ids.push(...r.ids); }
      sel = ids; commit(before, 'ungroup', { count: gs.length }); say(`まとめを解きました（${ids.length} 個）。`);
    },
    rename() { if (sel.length !== 1) { sound.play('error'); say('名前を付ける図形を 1 つ選んでください。'); return; } startRename(sel[0]); },
    zoomin: () => zoomBy(1.25), zoomout: () => zoomBy(0.8),
    zoom100() { const r = svg.getBoundingClientRect(); zoomAt(1, r.width / 2, r.height / 2); L('zoom', { z: 1 }); },
    fit() { fit(); L('zoom', { z: r2(view.z), fit: true }); },
    grid: (d) => setOpt('grid', d.checked), snap: (d) => setOpt('snap', d.checked),
    async paper() {
      const r = await paperDialog('paper');
      if (!r) return;
      const before = snapshot();
      Object.assign(doc, r);
      if (commit(before, 'paper', r)) { fitted = false; schedule(); say(`画用紙を ${r.width} × ${r.height} にしました。`); }
    },
    help: () => os.msgbox({ title: '図形エディタの使い方', icon: 'info', text: '・左の道具を選び、紙の上をドラッグして描きます（キー: V 選ぶ、R 四角、E だ円、L 直線、O 折れ線、P ペン、T 文字、I スポイト）。\n・ペンはクリックで角、ドラッグで曲線の点を置きます。最初の点を押すと閉じ、ダブルクリックか Enter で終わります。\n・選ぶ道具で図形を押すと選べます。Shift で足し、何もない所をドラッグすると囲んで選べます。\n・四角いつまみで大きさを変えます（Shift で縦横の比を保つ）。上の丸をドラッグすると回せます（Shift で 15° ごと）。\n・矢印キーで 1 ずつ動かします（Shift で 10）。Ctrl+C と Ctrl+V で写し、Ctrl+D で複製、Ctrl+G でまとめます。\n・右の欄で色や線の太さを変えます。何も選んでいないときは、次に描く図形の性質になります。\n・ホイールで拡大と縮小、Space を押しながらドラッグ（か中ボタンのドラッグ）で紙を動かします。\n・保存すると SVG になります。ほかのソフトの SVG を開くと、扱える図形だけを読み込みます。' }),
    async sample() { if (!(await confirmDiscard())) return; setDoc(V.sampleDoc(), null); setTool('select', true); say('見本の絵を開きました。図形を押して動かしたり、色を変えたりしてみてください。'); L('sample'); },
    about: () => os.msgbox({ title: '図形エディタについて', icon: 'info', text: 'Future OS 図形エディタ 1.0\n\n四角・だ円・線・ペンの曲線・文字を、拡大してもにじまない図形で描きます。\n保存した SVG は、ブラウザやほかのお絵かきソフトで開けます。' }),
  };
  function setOpt(k, v) {
    opt[k] = !!v;
    win.body.querySelector(`.menu-item[data-command="${k}"]`)?.classList.toggle('checked', opt[k]);
    const cb = win.body.querySelector(`[data-opt="${k}"]`); if (cb) cb.checked = opt[k];
    schedule(); L('option', { [k]: opt[k] });
    say(k === 'grid' ? (opt.grid ? '方眼を出しました。' : '方眼を隠しました。') : opt.snap ? `動かす・描くときに ${opt.gridSize} px の方眼に合わせます。` : '方眼に合わせるのをやめました。');
  }
  function run(c, detail = {}) {
    const [head, arg] = c.split(':');
    if (head === 'order') return order(arg);
    if (head === 'align') {
      if (transformSel((l) => V.align(l, sel, arg, { x: 0, y: 0, w: doc.width, h: doc.height }, measure), 'align', { how: arg, ids: sel })) say(`${sel.length === 1 ? '紙の' : ''}${ALIGN[arg]}に揃えました。`);
      return;
    }
    if (head === 'dist') {
      if (sel.length < 3) { sound.play('error'); say('等間隔にするには、図形を 3 つ以上選んでください。'); return; }
      if (transformSel((l) => V.distribute(l, sel, arg, measure), 'distribute', { axis: arg, ids: sel })) say(arg === 'h' ? '横に等間隔に並べました。' : '縦に等間隔に並べました。');
      return;
    }
    if (head === 'rot' || head === 'flip') {
      const b = selBox(), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const fn = head === 'rot' ? (s) => V.rotateShape(s, +arg, cx, cy, measure) : (s) => V.flipShape(s, arg, cx, cy, measure);
      if (transformSel((l) => l.map((s) => (sel.includes(s.id) ? fn(s) : s)), head === 'rot' ? 'rotate' : 'flip', { arg, ids: sel })) say(head === 'rot' ? `${+arg > 0 ? '右' : '左'}へ 90° 回しました。` : arg === 'h' ? '左右を反転しました。' : '上下を反転しました。');
      return;
    }
    if (head === 'gs') { opt.gridSize = +arg; schedule(); L('option', { gridSize: opt.gridSize }); say(`方眼の幅を ${arg} px にしました。`); return; }
    cmds[c]?.(detail);
  }
  win.body.addEventListener('w95:command', (e) => run(e.detail.command, e.detail));
  q('.vc-bar').addEventListener('click', (e) => { const b = e.target.closest('button[data-command]'); if (b) run(b.dataset.command); });
  q('.vc-bar').addEventListener('change', (e) => { const k = e.target.dataset.opt; if (k) setOpt(k, e.target.checked); });

  /* ---------- キー ---------- */
  function nudge(dx, dy) {
    if (!sel.length) return;
    const before = snapshot();
    doc.shapes = doc.shapes.map((s) => (sel.includes(s.id) ? V.moveShape(s, dx, dy) : s));
    commit(before, 'nudge', { dx, dy, ids: sel });
  }
  win.body.addEventListener('keydown', (e) => {
    const k = e.key, lower = k.length === 1 ? k.toLowerCase() : k, ctrl = e.ctrlKey || e.metaKey;
    // 文字を打つ欄では何もしない。チェックボックスやスライダーでは、Space と矢印と Enter をその部品に任せる
    if (e.target.matches('input[type="text"], input[type="number"], input:not([type]), textarea, select')) return;
    const control = e.target.matches('input, button');
    // Space: 紙の上にマウスがあれば、ボタンにフォーカスがあっても紙を動かす
    if (k === ' ' && !ctrl && (overStage || !control)) { e.preventDefault(); if (!spaceDown) { spaceDown = true; stage.classList.add('vc-pan'); } return; }
    if (control && e.target.matches('input') && (k === ' ' || k === 'Enter' || k.startsWith('Arrow'))) return;
    if (ctrl) {
      const act = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', s: 'save', o: 'open', c: 'copy', x: 'cut', v: 'paste', d: 'dup', a: 'selall', g: e.shiftKey ? 'ungroup' : 'group' }[lower];
      if (act) { e.preventDefault(); cmds[act](); }
      return;
    }
    if (e.altKey || k === ' ') return;
    if (k === 'Enter') { if (draw2.nodes.length) { e.preventDefault(); finishDraw2(false); } return; }
    if (k === 'Escape') { if (draw2.nodes.length) cancelDraw2(); else if (sel.length) cmds.selnone(); return; }
    if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      if (draw2.nodes.length) { draw2.nodes.pop(); say(draw2.nodes.length ? `点を 1 つ戻しました（残り ${draw2.nodes.length} 個）。` : '点を全部戻しました。'); schedule(); }
      else cmds.del();
      return;
    }
    if (k.startsWith('Arrow')) {
      if (!sel.length) return;
      e.preventDefault();
      const st = opt.snap ? opt.gridSize : e.shiftKey ? 10 : 1;
      nudge({ ArrowLeft: -st, ArrowRight: st }[k] || 0, { ArrowUp: -st, ArrowDown: st }[k] || 0);
      return;
    }
    const keys = { PageUp: 'order:up', PageDown: 'order:down', Home: 'order:top', End: 'order:bottom', F1: 'help', F2: 'rename', '+': 'zoomin', '=': 'zoomin', ';': 'zoomin', '-': 'zoomout', '0': 'fit', '1': 'zoom100' };
    if (keys[k]) { e.preventDefault(); run(keys[k]); return; }
    const t = TOOLS.find((x) => x[2].toLowerCase() === lower);
    if (t) { setTool(t[0]); sound.play('key', TOOLS.indexOf(t)); }
  });
  win.body.addEventListener('keyup', (e) => { if (e.key === ' ' && spaceDown) { e.preventDefault(); spaceDown = false; stage.classList.remove('vc-pan'); } });
  const onBlur = () => { spaceDown = false; stage.classList.remove('vc-pan'); };
  addEventListener('blur', onBlur);
  win.body.addEventListener('fos:drop-file', async (e) => {
    if (/\.svg$/i.test(e.detail.path)) { if (await confirmDiscard()) load(e.detail.path); }
    else os.openFile(e.detail.path);
  });
  // 窓を押したら（紙の上でも）、道具の切り替えのキーや Ctrl+Z をこの窓で受ける
  win.body.tabIndex = -1;
  win.el.addEventListener('pointerdown', () => setTimeout(() => { if (wm.getActive() === win && !win.el.contains(document.activeElement)) win.body.focus({ preventScroll: true }); }, 0));
  win.cleanup = () => { ro.disconnect(); removeEventListener('blur', onBlur); removeEventListener('pointermove', onDragMove); removeEventListener('pointerup', endDrag); removeEventListener('pointercancel', endDrag); cancelAnimationFrame(raf); };
  // 確かめの道具（tools/vector-check.mjs）が、図形のデータと画面の位置を読むための窓口
  win.el.vectorDebug = {
    doc: () => JSON.parse(snapshot()), sel: () => sel.slice(), view: () => ({ ...view }), tool: () => tool,
    toClient: (x, y) => { const r = svg.getBoundingClientRect(); return [r.left + x * view.z + view.px, r.top + y * view.z + view.py]; },
    bbox: (id) => { const s = byId(id); return s ? V.bbox(s, measure) : null; },
  };

  setTitle();
  if (path) { const p = path; path = null; if (!(await load(p))) { setTool('rect', true); say(FIRST); } }
  else { setTool('rect', true); say(FIRST); }
  syncSide(); schedule();
  L('launch', { path });
  return win;
}
