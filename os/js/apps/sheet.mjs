// 表計算: 1000 行 × 52 列（A〜AZ）の格子。見えている所だけを描き、スクロールのたびに描き直す。
// セルを選ぶ（クリック・矢印・Tab・Enter・Shift で範囲）、打ち始めると入力、F2 か二度押しで編集、Esc で取り消し、数式の欄。
// 数式（= で始める）と関数、コピー・切り取り・貼り付け、行と列の挿入と削除、元に戻す・やり直し、オートフィル（右下のつまみ）、
// 並べ替え、書式（太字・文字の色・背景の色・寄せ方・数の表示・枠線）、.fsheet の保存と CSV の読み書き、パソコンへ書き出す。
// 計算は core/sheet.mjs（テストは tests/os-sheet.test.mjs）。ここは画面と操作だけ。
//
// キーボードの入力は、いつも 1 つの入力欄（.sh-editor）で受ける。選んでいるだけのときは見えない入力欄が今のセルの上にあり、
// 文字を打ち始めると（かな漢字変換の始まりも）そのまま入力の状態になる。変換の途中のキーは扱わない。
import * as S from '../core/sheet.mjs';
import { basename, dirname } from '../core/path.mjs';

const HEAD_W = 46, HEAD_H = 24;
const SEEN = 'fos-sheet-seen';
const DIRS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
const NUM_OPTS = [['general', '標準'], ['number', '数値（小数 2 桁）'], ['sep', '桁区切り'], ['percent', 'パーセント'], ['date', '日付（年/月/日）'], ['md', '日付（月/日）'], ['datejp', '日付（年月日）'], ['datetime', '日付と時刻']];
const NUM_PATCH = {
  general: { num: null, dec: null, sep: null }, number: { num: 'number', dec: 2, sep: null }, sep: { num: 'number', dec: 0, sep: true }, percent: { num: 'percent', dec: 0, sep: null },
  date: { num: 'date', dec: null, sep: null }, md: { num: 'md', dec: null, sep: null }, datejp: { num: 'datejp', dec: null, sep: null }, datetime: { num: 'datetime', dec: null, sep: null },
};
const numKey = (f) => (!f?.num || f.num === 'general' ? 'general' : f.num === 'number' ? (f.sep ? 'sep' : 'number') : f.num);
const BORDERS = [['all', '格子'], ['outer', '外枠'], ['bottom', '下線'], ['none', '枠線なし']];
const svg = (d) => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  undo: svg('M5 4 2 7l3 3M2.5 7H10a4 4 0 0 1 0 8H7'), redo: svg('m11 4 3 3-3 3M13.5 7H6a4 4 0 0 0 0 8h3'),
  left: svg('M2 3h12M2 6.5h8M2 10h12M2 13.5h8'), center: svg('M2 3h12M4 6.5h8M2 10h12M4 13.5h8'), right: svg('M2 3h12M6 6.5h8M2 10h12M6 13.5h8'),
};
const HINT = 'セルを選んで打ち、Enter で決めます。= で始めると式になります（例: =SUM(B2:B8)）。';

const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="new" data-status="空の表にします。"><span class="label">新規(<u>N</u>)</span></div>
    <div class="menu-item" data-command="open" data-status="表（.fsheet）か CSV を開きます。"><span class="label">開く(<u>O</u>)...</span><span class="shortcut">Ctrl+O</span></div>
    <div class="menu-item" data-command="save" data-status="式と書式も残す表計算の形（.fsheet）で保存します。"><span class="label">上書き保存(<u>S</u>)</span><span class="shortcut">Ctrl+S</span></div>
    <div class="menu-item" data-command="saveas"><span class="label">名前を付けて保存(<u>A</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="csvopen" data-status="CSV（, で区切った文字）を読み込みます。"><span class="label">CSV を読み込む(<u>I</u>)...</span></div>
    <div class="menu-item" data-command="csvsave" data-status="値だけを CSV で仮想ドライブへ保存します。式と書式は残りません。"><span class="label">CSV で保存(<u>V</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="export" data-status="この表を .fsheet のファイルとしてパソコンへ書き出します。"><span class="label">パソコンへ書き出す(<u>E</u>)</span></div>
    <div class="menu-item" data-command="exportcsv" data-status="値だけを CSV のファイルとしてパソコンへ書き出します（Excel でも開けます）。"><span class="label">パソコンへ CSV で書き出す(<u>C</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>X</u>)</span></div>
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="undo"><span class="label">元に戻す(<u>U</u>)</span><span class="shortcut">Ctrl+Z</span></div>
    <div class="menu-item" data-command="redo"><span class="label">やり直し(<u>R</u>)</span><span class="shortcut">Ctrl+Y</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="cut"><span class="label">切り取り(<u>T</u>)</span><span class="shortcut">Ctrl+X</span></div>
    <div class="menu-item" data-command="copy"><span class="label">コピー(<u>C</u>)</span><span class="shortcut">Ctrl+C</span></div>
    <div class="menu-item" data-command="paste"><span class="label">貼り付け(<u>P</u>)</span><span class="shortcut">Ctrl+V</span></div>
    <div class="menu-item" data-command="del"><span class="label">中身を消す(<u>D</u>)</span><span class="shortcut">Del</span></div>
    <div class="menu-item" data-command="clearfmt"><span class="label">書式を消す(<u>F</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="all"><span class="label">すべて選択(<u>A</u>)</span><span class="shortcut">Ctrl+A</span></div>
  </div></div>
  <div class="menu-title">行と列(<u>R</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="insrow" data-status="選んだ行の上に、選んだ数だけ行を入れます。"><span class="label">上に行を入れる(<u>I</u>)</span></div>
    <div class="menu-item" data-command="inscol" data-status="選んだ列の左に、選んだ数だけ列を入れます。"><span class="label">左に列を入れる(<u>C</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="delrow"><span class="label">行を消す(<u>D</u>)</span></div>
    <div class="menu-item" data-command="delcol"><span class="label">列を消す(<u>L</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="colw"><span class="label">列の幅(<u>W</u>)...</span></div>
    <div class="menu-item" data-command="rowh"><span class="label">行の高さ(<u>H</u>)...</span></div>
    <div class="menu-item" data-command="fitcol" data-status="列の幅を、中身のいちばん長い文字に合わせます（列の見出しの境目の二度押しでも同じ）。"><span class="label">列の幅を中身に合わせる(<u>F</u>)</span></div>
  </div></div>
  <div class="menu-title">書式(<u>O</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="bold"><span class="label">太字(<u>B</u>)</span><span class="shortcut">Ctrl+B</span></div>
    <div class="menu-item" data-command="color"><span class="label">文字の色(<u>C</u>)...</span></div>
    <div class="menu-item" data-command="bg"><span class="label">背景の色(<u>G</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="left"><span class="label">左寄せ(<u>L</u>)</span></div>
    <div class="menu-item" data-command="center"><span class="label">中央(<u>E</u>)</span></div>
    <div class="menu-item" data-command="right"><span class="label">右寄せ(<u>R</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item"><span class="label">数の表示(<u>N</u>)</span><div class="menu" role="menu">${NUM_OPTS.map(([k, t]) => `<div class="menu-item" data-command="num" data-num="${k}"><span class="label">${t}</span></div>`).join('')}</div></div>
    <div class="menu-item" data-command="decmore"><span class="label">小数の桁を増やす(<u>I</u>)</span></div>
    <div class="menu-item" data-command="decless"><span class="label">小数の桁を減らす(<u>D</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item"><span class="label">枠線(<u>W</u>)</span><div class="menu" role="menu">${BORDERS.map(([k, t]) => `<div class="menu-item" data-command="border" data-bd="${k}"><span class="label">${t}</span></div>`).join('')}</div></div>
  </div></div>
  <div class="menu-title">データ(<u>D</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="autosum" data-status="上か左に続く数の合計（=SUM）を入れます。範囲を選んでいれば、その下に入れます。"><span class="label">合計を入れる（オートSUM）(<u>U</u>)</span></div>
    <div class="menu-item" data-command="filldown" data-status="選んだ範囲を、1 行目の中身を元に下へ伸ばします（右下のつまみを下へ引っぱるのと同じ）。"><span class="label">下へ伸ばす(<u>W</u>)</span></div>
    <div class="menu-item" data-command="fillright" data-status="選んだ範囲を、1 列目の中身を元に右へ伸ばします（右下のつまみを右へ引っぱるのと同じ）。"><span class="label">右へ伸ばす(<u>G</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="sortasc"><span class="label">小さい順に並べ替え(<u>A</u>)</span></div>
    <div class="menu-item" data-command="sortdesc"><span class="label">大きい順に並べ替え(<u>D</u>)</span></div>
    <div class="menu-item" data-command="sort"><span class="label">並べ替え(<u>S</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="recalc"><span class="label">すべて計算し直す(<u>R</u>)</span><span class="shortcut">F9</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="keys"><span class="label">キーの使い方(<u>K</u>)</span></div>
    <div class="menu-item" data-command="funcs"><span class="label">関数の一覧(<u>F</u>)</span></div>
    <div class="menu-item" data-command="sample"><span class="label">見本の表を開く(<u>S</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="about"><span class="label">表計算について(<u>A</u>)</span></div>
  </div></div>
</div>`;

const TOOLBAR = `
<div class="sh-bar" role="toolbar" aria-label="表の操作と書式" focusgroup="toolbar wrap">
  <div role="group" aria-label="元に戻す">
    <button type="button" class="flat sh-tb" data-a="undo" aria-label="元に戻す" title="元に戻す（Ctrl+Z）">${ICON.undo}</button>
    <button type="button" class="flat sh-tb" data-a="redo" aria-label="やり直し" title="やり直し（Ctrl+Y）">${ICON.redo}</button>
  </div>
  <span class="sh-sep" role="separator" aria-orientation="vertical"></span>
  <div role="group" aria-label="文字">
    <button type="button" class="flat sh-tb sh-bold" data-a="bold" aria-pressed="false" title="太字（Ctrl+B）">B</button>
    <label class="sh-pick" title="文字の色"><span class="sh-pick-mark" data-mark="color" aria-hidden="true">あ</span><input type="color" data-color="color" value="#241734" aria-label="文字の色"></label>
    <label class="sh-pick" title="背景の色"><span class="sh-pick-mark bg" data-mark="bg" aria-hidden="true">地</span><input type="color" data-color="bg" value="#fff1c4" aria-label="背景の色"></label>
  </div>
  <span class="sh-sep" role="separator" aria-orientation="vertical"></span>
  <div role="group" aria-label="寄せ方">
    <button type="button" class="flat sh-tb" data-a="left" aria-pressed="false" aria-label="左寄せ" title="左寄せ">${ICON.left}</button>
    <button type="button" class="flat sh-tb" data-a="center" aria-pressed="false" aria-label="中央" title="中央">${ICON.center}</button>
    <button type="button" class="flat sh-tb" data-a="right" aria-pressed="false" aria-label="右寄せ" title="右寄せ">${ICON.right}</button>
  </div>
  <span class="sh-sep" role="separator" aria-orientation="vertical"></span>
  <div role="group" aria-label="数の表示">
    <select data-numsel aria-label="数の表示" title="数の表示">${NUM_OPTS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
    <button type="button" class="flat sh-tb" data-a="decmore" title="小数の桁を増やす">.0+</button>
    <button type="button" class="flat sh-tb" data-a="decless" title="小数の桁を減らす">.0−</button>
    <select data-bdsel aria-label="枠線" title="枠線"><option value="">枠線…</option>${BORDERS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
  </div>
  <span class="sh-sep" role="separator" aria-orientation="vertical"></span>
  <div role="group" aria-label="データ">
    <button type="button" class="flat sh-tb" data-a="autosum" title="上か左に続く数の合計を入れます">Σ 合計</button>
    <button type="button" class="flat sh-tb" data-a="sortasc" title="今の列で小さい順に並べ替えます">小さい順</button>
    <button type="button" class="flat sh-tb" data-a="sortdesc" title="今の列で大きい順に並べ替えます">大きい順</button>
  </div>
</div>`;

// 見本の表: 1 週間のおこづかい帳（オリジナルの中身）
function sampleSheet(now) {
  const sh = new S.Sheet({ now });
  const R = S.parseRangeText;
  sh.put('A1', '1 週間のおこづかい帳');
  sh.put('A2', '黄色のセルの金額を変えると、残り・合計・平均が計算し直されます。');
  const rows = [
    ['日付', '曜日', '内容', '入ったお金', '使ったお金', '残り'],
    ['2026/11/16', '月', '先週からの繰り越し', '1200', '0', '=D5-E5'],
    ['2026/11/17', '火', '消しゴムと付箋', '0', '180', '=F5+D6-E6'],
    ['2026/11/18', '水', 'お手伝い（窓ふき）', '300', '0', '=F6+D7-E7'],
    ['2026/11/19', '木', '図書館の帰りに肉まん', '0', '150', '=F7+D8-E8'],
    ['2026/11/20', '金', '漫画の雑誌', '0', '290', '=F8+D9-E9'],
    ['2026/11/21', '土', '祖父母からのおこづかい', '1000', '0', '=F9+D10-E10'],
    ['2026/11/22', '日', '友だちと映画', '0', '900', '=F10+D11-E11'],
  ];
  sh.setMany(rows.flatMap((row, i) => row.map((input, j) => ({ r: 3 + i, c: j, input }))));
  sh.setMany([
    { r: 12, c: 0, input: '合計' }, { r: 12, c: 3, input: '=SUM(D5:D11)' }, { r: 12, c: 4, input: '=SUM(E5:E11)' }, { r: 12, c: 5, input: '=D13-E13' },
    { r: 13, c: 0, input: '1 日の平均' }, { r: 13, c: 3, input: '=AVERAGE(D5:D11)' }, { r: 13, c: 4, input: '=AVERAGE(E5:E11)' },
    { r: 15, c: 0, input: 'お金を使った日の数' }, { r: 15, c: 4, input: '=COUNTIF(E5:E11,">0")' },
    { r: 16, c: 0, input: 'いちばん大きい出費' }, { r: 16, c: 4, input: '=MAX(E5:E11)' },
    { r: 17, c: 0, input: 'ひとこと' }, { r: 17, c: 2, input: '=IF(F13>=500,"まだ余裕があります。","使いすぎに注意です。")' },
  ]);
  sh.setFormat(R('A1'), { b: true, color: '#4b5fe8' });
  sh.setFormat(R('A2'), { color: '#6e5d85' });
  sh.setFormat(R('A4:F4'), { b: true, bg: '#e9dcff', align: 'center' });
  sh.setFormat(R('A5:A11'), { num: 'md' });
  sh.setFormat(R('B5:B11'), { align: 'center' });
  sh.setFormat(R('D5:E11'), { bg: '#fff1c4' });
  sh.setFormat(R('D5:F14'), { num: 'number', dec: 0, sep: true });
  sh.setFormat(R('E17'), { num: 'number', dec: 0, sep: true });
  sh.setFormat(R('A13:F13'), { b: true });
  sh.setFormat(R('F13'), { bg: '#c9f8f1' });
  sh.setBorder(R('A4:F11'), 'all');
  sh.setBorder(R('A13:F14'), 'all');
  sh.setHeight(0, 30);
  [64, 44, 176, 92, 92, 92].forEach((w, c) => sh.setWidth(c, w));
  return sh;
}

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  const uid = 'sh' + Math.random().toString(36).slice(2, 8);
  // 今の日付と時刻（TODAY と NOW）。Temporal があれば暦の日付をそのまま読む
  const nowParts = () => {
    try { if (globalThis.Temporal?.Now) { const t = Temporal.Now.plainDateTimeISO(); return { y: t.year, m: t.month, d: t.day, hh: t.hour, mm: t.minute, ss: t.second }; } } catch { /* 使えない */ }
    return S.localNow();
  };
  let sheet = new S.Sheet({ now: nowParts }), path = null, kind = 'fsheet', dirty = false, isSample = false;
  const hist = new S.History(100);
  // 選択: cur は今のセル、anc と ext は範囲の 2 つの角（Shift で動くのは ext）
  let cur = { r: 0, c: 0 }, anc = { r: 0, c: 0 }, ext = { r: 0, c: 0 };
  // 入力の状態: ready（選んでいるだけ）・enter（打ち始めた。矢印で決めて移る）・edit（F2・二度押し・数式の欄。矢印は文字の中を動く）
  let mode = 'ready', draft = '', editAt = null, editFrom = 'cell', point = null;
  let clip = null, colX = [0], rowY = [0], raf = 0, msgUntil = 0, msgAt = 0, liveTimer = 0;

  const win = wm.open({
    app: 'sheet', icon: 'icons/sheet.svg', className: 'app-sheet', title: '表計算', w: 960, h: 620, ...rect, args: {},
    render(w) {
      w.body.innerHTML = MENU + TOOLBAR + `
      <div class="sh-fbar">
        <input type="text" class="sh-name" data-name aria-label="セルの番地（打って Enter で移ります）" title="セルの番地。B5 や A1:C3 と打って Enter で、その場所を選びます" spellcheck="false" autocomplete="off">
        <span class="sh-fx" aria-hidden="true">中身</span>
        <input type="text" class="sh-formula" data-formula aria-label="セルの中身（式は = で始めます）" spellcheck="false" autocomplete="off">
      </div>
      <div class="sh-scroll" data-scroll>
        <div class="sh-sheet" data-sheet>
          <div class="sh-colhead" data-colhead aria-hidden="true"></div>
          <div class="sh-rowhead" data-rowhead aria-hidden="true"></div>
          <div class="sh-body" data-gbody>
            <div class="sh-lines" data-lines aria-hidden="true"></div>
            <div class="sh-cells" data-cells role="grid" aria-label="表" aria-rowcount="${sheet.rows}" aria-colcount="${sheet.cols}"></div>
            <div class="sh-sel" data-sel aria-hidden="true"></div>
            <div class="sh-ants" data-ants hidden aria-hidden="true"></div>
            <div class="sh-fillbox" data-fillbox hidden aria-hidden="true"></div>
            <div class="sh-refbox" data-refbox hidden aria-hidden="true"></div>
            <div class="sh-cur" data-cur aria-hidden="true"></div>
            <div class="sh-handle" data-handle title="つまみ: 引っぱると、連番や式を伸ばします" aria-hidden="true"></div>
            <input type="text" class="sh-editor" data-editor aria-label="セル" spellcheck="false" autocomplete="off">
          </div>
        </div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field sh-stats" data-stats></div><div class="status-field sh-modef" data-mode></div><div class="size-grip"></div></div>
      <div class="fos-sr-only" aria-live="polite" data-live></div>`;
    },
    onClose: async () => {
      if (mode !== 'ready') commit();
      if (!dirty) return true;
      const a = await os.msgbox({ title: '表計算', text: `${docName()}は、変更が保存されていません。\n\n保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') return await save();
      return true;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const scroll = q('[data-scroll]'), sheetEl = q('[data-sheet]'), colhead = q('[data-colhead]'), rowhead = q('[data-rowhead]'), body = q('[data-gbody]');
  const linesEl = q('[data-lines]'), cellsEl = q('[data-cells]'), selEl = q('[data-sel]'), curEl = q('[data-cur]'), antsEl = q('[data-ants]'), fillEl = q('[data-fillbox]'), refEl = q('[data-refbox]');
  const handle = q('[data-handle]'), editor = q('[data-editor]'), nameBox = q('[data-name]'), fbar = q('[data-formula]'), live = q('[data-live]');
  const statusEl = q('.status-field[data-status]'), statsEl = q('[data-stats]'), modeEl = q('[data-mode]'), numSel = q('[data-numsel]'), bdSel = q('[data-bdsel]');
  const docName = () => (path ? `「${basename(path)}」` : isSample ? '見本の表' : '無題の表');
  const setTitle = () => win.setTitle(`${dirty ? '*' : ''}${path ? basename(path) : isSample ? 'おこづかい帳（見本）' : '無題'} - 表計算`);
  const range = () => S.normRect({ r1: anc.r, c1: anc.c, r2: ext.r, c2: ext.c });
  const single = (x) => x.r1 === x.r2 && x.c1 === x.c2;
  const clampPos = (r, c) => ({ r: Math.max(0, Math.min(sheet.rows - 1, r)), c: Math.max(0, Math.min(sheet.cols - 1, c)) });
  const NF = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 4 });

  /* ---------- 状態の帯 ---------- */
  function idle() { const p = sheet.problem(cur.r, cur.c); return p ? `${S.addr(cur.r, cur.c)}: ${p}` : HINT; }
  function say(t) { statusEl.textContent = t; msgAt = Date.now(); msgUntil = msgAt + 6000; }
  // セルを移ったら、前の知らせより今のセルの説明（誤りの理由など）を出す。同じ操作の中で出した知らせ（入力して Enter で移ったときなど）は残す
  const moved = () => { if (Date.now() - msgAt > 50) msgUntil = 0; };
  function updateStatus() {
    if (Date.now() > msgUntil) statusEl.textContent = idle();
    const x = range();
    if (single(x)) statsEl.textContent = '';
    else { const s = sheet.stats(x); statsEl.textContent = s.nums ? `合計 ${NF.format(s.sum)}　平均 ${NF.format(s.avg)}　個数 ${s.count}` : `個数 ${s.count}`; }
    modeEl.textContent = mode === 'ready' ? '選択' : canPoint() ? '参照を選ぶ' : mode === 'enter' ? '入力' : '編集';
  }
  // 読み上げ（選んだセルの番地と中身）。続けて動いたときは最後の 1 つだけを読む
  function announce() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { const t = sheet.display(cur.r, cur.c); live.textContent = `${S.addr(cur.r, cur.c)}、${t || '空'}`; }, 250);
    editor.setAttribute('aria-label', `セル ${S.addr(cur.r, cur.c)}`);
  }

  /* ---------- 大きさと位置 ---------- */
  function layoutSizes() {
    colX = [0]; rowY = [0];
    for (let c = 0; c < sheet.cols; c++) colX.push(colX[c] + sheet.width(c));
    for (let r = 0; r < sheet.rows; r++) rowY.push(rowY[r] + sheet.height(r));
    const tw = colX[sheet.cols], th = rowY[sheet.rows];
    sheetEl.style.width = HEAD_W + tw + 'px'; sheetEl.style.height = HEAD_H + th + 'px';
    colhead.style.width = HEAD_W + tw + 'px'; rowhead.style.height = th + 'px';
    body.style.width = tw + 'px'; body.style.height = th + 'px';
  }
  // 並んだ境目の中から、v を含む行（列）の番号を二分探索で探す
  const indexAt = (arr, v) => { let lo = 0, hi = arr.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= v) lo = m; else hi = m - 1; } return lo; };
  const meas = document.createElement('canvas').getContext('2d');
  let fontFamily = '';
  const textW = (s, bold) => { if (!fontFamily) fontFamily = getComputedStyle(cellsEl).fontFamily; meas.font = `${bold ? 700 : 400} 13px ${fontFamily}`; return meas.measureText(s).width; };
  // 枠は境目の線に重ねて置く。A 列と 1 行目では、見出しの下に隠れないよう内側へ寄せる
  const placeBox = (el, x) => {
    const l = Math.max(0, colX[x.c1] - 1), t = Math.max(0, rowY[x.r1] - 1);
    Object.assign(el.style, { left: l + 'px', top: t + 'px', width: colX[x.c2 + 1] - l + 'px', height: rowY[x.r2 + 1] - t + 'px' });
  };

  /* ---------- 描く（見えている所だけ） ---------- */
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
  // 数が列に入りきらないとき: 標準の表示なら桁を減らし、それでも入らなければ指数にする。書式付きの数は ### にする
  function fitNumber(v, f, t, w, bold) {
    const room = w - 8, fits = (s) => textW(s, bold) <= room;
    if (fits(t)) return t;
    if (!f?.num || f.num === 'general') {
      for (let sig = 9; sig >= 1; sig--) { const s = S.generalText(v, sig); if (s.length < t.length && fits(s)) return s; }
      for (let d = 4; d >= 0; d--) { const s = S.expText(v, d); if (fits(s)) return s; }
    }
    return '#'.repeat(Math.max(1, Math.min(10, Math.floor(room / 8))));
  }
  function cellHtml(r, c, cell, cLast) {
    const v = sheet.value(r, c), f = cell.fmt, w = sheet.width(c), h = sheet.height(r), bold = !!f?.b, al = S.alignOf(v, f);
    let t = sheet.display(r, c), span = w - 1;
    if (typeof v === 'number' && t) t = fitNumber(v, f, t, w, bold);
    // 左寄せの文字は、右の空のセルにはみ出して見せる
    if (al === 'left' && t && typeof v === 'string') { const need = textW(t, bold) + 9; for (let k = c + 1; span < need && k <= Math.min(sheet.cols - 1, cLast + 8) && !sheet.input(r, k); k++) span += sheet.width(k); }
    const st = `left:${colX[c]}px;width:${w - 1}px;height:${h - 1}px;${f?.bg ? `background:${f.bg};` : ''}${f?.color ? `color:${f.color};` : ''}`;
    return `<div role="gridcell" aria-colindex="${c + 1}" class="sh-c al-${al}${bold ? ' b' : ''}${S.isErr(v) ? ' err' : ''}" style="${st}"${f?.bd ? ` data-bd="${f.bd}"` : ''}><span style="width:${span - 1}px">${esc(t)}</span></div>`;
  }
  function draw() {
    raf = 0;
    const vw = scroll.clientWidth - HEAD_W, vh = scroll.clientHeight - HEAD_H, sx = scroll.scrollLeft, sy = scroll.scrollTop;
    const c0 = indexAt(colX, sx), c1 = Math.min(sheet.cols - 1, indexAt(colX, sx + vw)), r0 = indexAt(rowY, sy), r1 = Math.min(sheet.rows - 1, indexAt(rowY, sy + vh));
    const x = range();
    let h = '<div class="sh-corner" data-corner title="すべて選択"></div>';
    for (let c = c0; c <= c1; c++) h += `<div class="sh-ch${c >= x.c1 && c <= x.c2 ? ' on' : ''}" data-c="${c}" style="left:${HEAD_W + colX[c]}px;width:${sheet.width(c)}px">${S.colName(c)}<i class="sh-grip" data-cgrip="${c}" title="引っぱると幅が変わります。二度押しで中身に合わせます"></i></div>`;
    colhead.innerHTML = h;
    h = '';
    for (let r = r0; r <= r1; r++) h += `<div class="sh-rh${r >= x.r1 && r <= x.r2 ? ' on' : ''}" data-r="${r}" style="top:${rowY[r]}px;height:${sheet.height(r)}px">${r + 1}<i class="sh-grip" data-rgrip="${r}" title="引っぱると高さが変わります。二度押しで元の高さに戻します"></i></div>`;
    rowhead.innerHTML = h;
    const top = rowY[r0], bottom = rowY[r1 + 1], left = colX[c0], right = colX[c1 + 1];
    h = '';
    for (let c = c0; c <= c1; c++) h += `<i class="sh-lv" style="left:${colX[c + 1] - 1}px;top:${top}px;height:${bottom - top}px"></i>`;
    for (let r = r0; r <= r1; r++) h += `<i class="sh-lh" style="top:${rowY[r + 1] - 1}px;left:${left}px;width:${right - left}px"></i>`;
    linesEl.innerHTML = h;
    h = '';
    for (let r = r0; r <= r1; r++) {
      let row = '';
      for (let c = c0; c <= c1; c++) { const cell = sheet.cell(r, c); if (cell) row += cellHtml(r, c, cell, c1); }
      if (row) h += `<div role="row" aria-rowindex="${r + 1}" class="sh-row" style="top:${rowY[r]}px;height:${sheet.height(r)}px">${row}</div>`;
    }
    cellsEl.innerHTML = h;
  }
  function drawSel() {
    const x = range();
    placeBox(selEl, x); selEl.hidden = single(x);
    placeBox(curEl, { r1: cur.r, c1: cur.c, r2: cur.r, c2: cur.c });
    Object.assign(handle.style, { left: colX[x.c2 + 1] - 5 + 'px', top: rowY[x.r2 + 1] - 5 + 'px' });
    antsEl.hidden = !clip;
    if (clip) placeBox(antsEl, clip.blk.src);
    if (document.activeElement !== nameBox) nameBox.value = single(x) ? S.addr(cur.r, cur.c) : S.rangeText(x);
    if (mode === 'ready' && document.activeElement !== fbar) fbar.value = sheet.input(cur.r, cur.c);
    placeEditor();
  }
  function placeEditor() {
    const p = editAt || cur, f = sheet.fmt(p.r, p.c), w = sheet.width(p.c) - 1;
    const want = mode === 'ready' ? w : Math.min(colX[sheet.cols] - colX[p.c], Math.max(w, textW(editor.value, f?.b) + 14));
    Object.assign(editor.style, { left: colX[p.c] + 'px', top: rowY[p.r] + 'px', width: want + 'px', height: sheet.height(p.r) - 1 + 'px', fontWeight: f?.b ? '700' : '' });
  }
  function updateToolbar() {
    const f = sheet.fmt(cur.r, cur.c) || {};
    q('[data-a="bold"]').setAttribute('aria-pressed', String(!!f.b));
    for (const a of ['left', 'center', 'right']) q(`[data-a="${a}"]`).setAttribute('aria-pressed', String(f.align === a));
    numSel.value = numKey(f);
    q('[data-mark="color"]').style.color = f.color || '';
    q('[data-mark="bg"]').style.background = f.bg || '';
  }
  function refresh() { drawSel(); schedule(); updateToolbar(); updateStatus(); announce(); }
  function ensureVisible(r, c) {
    const vw = scroll.clientWidth - HEAD_W, vh = scroll.clientHeight - HEAD_H;
    if (colX[c] < scroll.scrollLeft) scroll.scrollLeft = colX[c]; else if (colX[c + 1] > scroll.scrollLeft + vw) scroll.scrollLeft = colX[c + 1] - vw;
    if (rowY[r] < scroll.scrollTop) scroll.scrollTop = rowY[r]; else if (rowY[r + 1] > scroll.scrollTop + vh) scroll.scrollTop = rowY[r + 1] - vh;
  }

  /* ---------- 選ぶ ---------- */
  function select(r, c, extend = false) {
    const p = clampPos(r, c);
    if (extend) ext = p; else { cur = p; anc = p; ext = p; }
    moved(); refresh(); ensureVisible(p.r, p.c);
  }
  // 範囲を選ぶ。範囲の右下（つまみ）も見えるように動かしてから、今のセルが見えるようにする
  function selectRect(x, at = { r: x.r1, c: x.c1 }) { anc = { r: x.r1, c: x.c1 }; ext = { r: x.r2, c: x.c2 }; cur = { ...at }; moved(); refresh(); ensureVisible(Math.min(x.r2, x.r1 + 40), x.c2); ensureVisible(cur.r, cur.c); }
  // Enter と Tab: 範囲を選んでいるときは、その中を順に回る
  function step(dr, dc) {
    const x = range();
    if (single(x)) { select(cur.r + dr, cur.c + dc); return; }
    let { r, c } = cur;
    if (dr) { r += dr; if (r > x.r2) { r = x.r1; c = c + 1 > x.c2 ? x.c1 : c + 1; } else if (r < x.r1) { r = x.r2; c = c - 1 < x.c1 ? x.c2 : c - 1; } }
    if (dc) { c += dc; if (c > x.c2) { c = x.c1; r = r + 1 > x.r2 ? x.r1 : r + 1; } else if (c < x.c1) { c = x.c2; r = r - 1 < x.r1 ? x.r2 : r - 1; } }
    cur = { r, c }; moved(); refresh(); ensureVisible(r, c);
  }
  const focusGrid = () => editor.focus({ preventScroll: true });

  /* ---------- 入力 ---------- */
  const activeInput = () => (editFrom === 'bar' ? fbar : editor);
  function beginEdit(how, textIn, from = 'cell') {
    mode = how; editAt = { ...cur }; draft = textIn; editFrom = from; point = null;
    editor.value = textIn; fbar.value = textIn; editor.classList.add('on');
    placeEditor(); updateStatus();
    if (from === 'cell') { focusGrid(); editor.setSelectionRange(textIn.length, textIn.length); }
  }
  function endEdit() { mode = 'ready'; editAt = null; editFrom = 'cell'; point = null; editor.value = ''; editor.classList.remove('on'); refEl.hidden = true; }
  function commit(dr = 0, dc = 0) {
    if (mode === 'ready') return;
    const { r, c } = editAt, textIn = draft, before = sheet.input(r, c);
    const back = editFrom === 'bar';
    endEdit();
    if (textIn !== before) {
      mutate('入力', () => { sheet.set(r, c, textIn); widen(r, c); }, { cell: S.addr(r, c), input: textIn.slice(0, 120) });
      const v = sheet.value(r, c);
      if (S.isErr(v)) { sound.play('error'); say(`${S.addr(r, c)} は ${v.code} になりました。${sheet.problem(r, c)}`); }
      else if (textIn[0] === '=') say(`${S.addr(r, c)} の式を計算しました（${sheet.lastRecalc} 個の式を計算し直しました）。`);
    }
    if (back) focusGrid();
    if (dr || dc) step(dr, dc); else refresh();
  }
  // 日付や桁区切りのような書式付きの数を打って列に入りきらないときは、幅を変えていない列だけ広げる（### にしない）
  function widen(r, c) {
    const v = sheet.value(r, c), f = sheet.fmt(r, c);
    if (typeof v !== 'number' || !f?.num || f.num === 'general' || sheet.colW.has(c)) return;
    const need = Math.ceil(textW(sheet.display(r, c), !!f.b)) + 12;
    if (need > sheet.width(c)) sheet.setWidth(c, Math.min(240, need));
  }
  function cancel() { if (mode === 'ready') return; const back = editFrom === 'bar'; endEdit(); if (back) focusGrid(); refresh(); say('入力を取り消しました。'); }
  // 式を打っている途中で、演算子や ( や , のすぐあとなら、セルを押すとその番地が入る
  const POINT_RE = /[=+\-*/^&(,;<>]\s*$/;
  function canPoint() {
    if (mode === 'ready' || !draft.startsWith('=')) return false;
    const el = activeInput();
    return (point && el.selectionStart === point.end) || POINT_RE.test(el.value.slice(0, el.selectionStart));
  }
  function putRef(x) {
    const el = activeInput(), t = single(x) ? S.addr(x.r1, x.c1) : S.rangeText(x);
    if (!point || el.selectionStart !== point.end) { const s = el.selectionStart; point = { start: s, end: s }; }
    el.setRangeText(t, point.start, point.end, 'end');
    point.end = point.start + t.length;
    draft = el.value;
    (el === fbar ? editor : fbar).value = draft;
    placeBox(refEl, x); refEl.hidden = false;
    placeEditor(); updateStatus();
  }

  /* ---------- 変更をまとめる（元に戻すの写しを取ってから） ---------- */
  function mutate(label, fn, info = {}) {
    hist.push(sheet.snapshot());
    let res;
    try { res = fn(); } catch (e) { const s = hist.undo(sheet.snapshot()); if (s) sheet.restore(s); hist.r = []; log('sheet.edit', { op: label, ...info }, 'error: ' + e.message); os.msgbox({ title: '表計算', text: `${label}ができませんでした。\n\n${e.message}`, icon: 'error' }); return false; }
    if (res && res.ok === false) { hist.discard(); sound.play('error'); say(res.error); log('sheet.edit', { op: label, ...info }, 'error: ' + res.error); return false; }
    dirty = true; setTitle(); layoutSizes(); refresh();
    log('sheet.edit', { op: label, ...info }, 'ok');
    return true;
  }
  function restoreFrom(s, label) {
    if (mode !== 'ready') cancel();
    if (!s) { sound.play('error'); say(`${label}ことのできる操作はありません。`); return; }
    sheet.restore(s); dirty = true; clip = null;
    cur = clampPos(cur.r, cur.c); anc = clampPos(anc.r, anc.c); ext = clampPos(ext.r, ext.c);
    layoutSizes(); setTitle(); refresh(); sound.play('op');
    log('sheet.history', { op: label, undo: hist.undoCount, redo: hist.redoCount }, 'ok');
  }

  /* ---------- コピー・切り取り・貼り付け ---------- */
  const nl = (s) => String(s).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  function doCopy(cut) {
    if (mode !== 'ready') commit();
    const x = range();
    clip = { blk: sheet.copy(x), tsv: sheet.toTSV(x), cut };
    navigator.clipboard?.writeText(clip.tsv).then(() => log('clipboard.write', { chars: clip?.tsv.length }, 'ok'), (e) => log('clipboard.write', {}, 'error: ' + e.message));
    refresh(); sound.play('select');
    say(cut ? `${S.rangeText(x)} を切り取りました。貼る所を選んで Ctrl+V を押してください。` : `${S.rangeText(x)} をコピーしました。貼る所を選んで Ctrl+V を押してください。`);
    log('sheet.' + (cut ? 'cut' : 'copy'), { range: S.rangeText(x) }, 'ok');
  }
  function doPaste(textIn) {
    if (mode !== 'ready') commit();
    const x = range(), mine = clip && (textIn == null || textIn === '' || nl(textIn) === nl(clip.tsv));
    if (mine && clip.cut) {
      const src = clip.blk.src, h = src.r2 - src.r1, w = src.c2 - src.c1;
      if (cur.r + h >= sheet.rows || cur.c + w >= sheet.cols) { sound.play('error'); say('表の外へははみ出せません。'); return; }
      let dest = null;
      if (mutate('切り取りの貼り付け', () => { dest = sheet.move(src, cur.r, cur.c); }, { from: S.rangeText(src), to: S.addr(cur.r, cur.c) })) {
        clip = null; selectRect(dest); sound.play('drop'); say(`${S.rangeText(src)} を ${S.rangeText(dest)} へ動かしました。そこを指す式も付いてきます。`);
      }
      return;
    }
    if (mine) {
      let area = null;
      if (mutate('貼り付け', () => { area = sheet.paste(clip.blk, x); }, { from: S.rangeText(clip.blk.src), to: S.rangeText(x) })) { selectRect(area); sound.play('drop'); say(`${S.rangeText(area)} に貼り付けました。式の番地は動いた分だけずらしました。`); }
      return;
    }
    if (textIn) {
      let area = null;
      if (mutate('文字の貼り付け', () => { area = sheet.pasteText(textIn, cur.r, cur.c); }, { to: S.addr(cur.r, cur.c), chars: textIn.length })) { selectRect(area); sound.play('drop'); say(`${S.rangeText(area)} に貼り付けました。`); }
      return;
    }
    sound.play('error'); say('貼り付けるものがありません。先にコピーしてください。');
  }

  /* ---------- 書式 ---------- */
  function fmtRange(patch, label) {
    if (mode !== 'ready') commit();
    const x = range();
    if (mutate(label, () => sheet.setFormat(x, patch), { range: S.rangeText(x), patch })) { sound.play('select'); say(`${S.rangeText(x)}: ${label}`); }
  }
  async function pickColor(which) {
    const input = q(`[data-color="${which}"]`);
    try { input.showPicker(); } catch { input.click(); }
  }

  /* ---------- 行と列 ---------- */
  function structural(label, fn) {
    if (mode !== 'ready') commit();
    if (mutate(label, fn)) { clip = null; sound.play('op'); say(`${label}ました。式の番地も合わせて直しました。`); refresh(); }
  }
  // 入れる位置と数: 選んだ行（列）の数だけ入れる。列を丸ごと選んでいるときに行を入れる（またはその逆の）ときは 1 つ
  function spanOf(x, axis) {
    if (axis === 'row') return [x.r1, x.r1 === 0 && x.r2 === sheet.rows - 1 ? 1 : Math.min(100, x.r2 - x.r1 + 1)];
    return [x.c1, x.c1 === 0 && x.c2 === sheet.cols - 1 ? 1 : Math.min(sheet.cols, x.c2 - x.c1 + 1)];
  }
  const rowsText = (a, b) => (a === b ? `${a + 1} 行目` : `${a + 1}〜${b + 1} 行目`);
  const colsText = (a, b) => (a === b ? `${S.colName(a)} 列` : `${S.colName(a)}〜${S.colName(b)} 列`);
  async function askNumber(title, label, value, min, max) {
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog sh-dlg';
    dlg.setAttribute('aria-labelledby', uid + '-t');
    dlg.style.width = '320px';
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text" id="${uid}-t"></div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div>
      <div class="window-body"><div class="sh-form"><label for="${uid}-n">${label}(<u>W</u>):</label><span><input type="number" id="${uid}-n" min="${min}" max="${max}" step="1" autofocus> 画素</span></div>
      <p class="sh-note">${min}〜${max} の数を打ちます。</p>
      <div class="button-row"><button type="button" class="default" data-close="ok">OK</button><button type="button" data-close="">キャンセル</button></div></div>`;
    dlg.querySelector('.title-bar-text').textContent = title;
    const input = dlg.querySelector('input');
    input.value = value;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!e.isComposing && e.keyCode !== 229) w95.closeDialog(dlg, 'ok'); } });
    document.body.append(dlg);
    input.select();
    const r = await w95.openDialog(dlg);
    const v = Math.round(+input.value);
    dlg.remove();
    focusGrid();
    return r === 'ok' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : null;
  }
  function sizeAll(axis, v) {
    const x = range();
    const list = axis === 'col' ? Array.from({ length: x.c2 - x.c1 + 1 }, (_, i) => x.c1 + i) : Array.from({ length: Math.min(1000, x.r2 - x.r1 + 1) }, (_, i) => x.r1 + i);
    mutate(axis === 'col' ? '列の幅' : '行の高さ', () => list.forEach((i) => (axis === 'col' ? sheet.setWidth(i, v) : sheet.setHeight(i, v))), { axis, v, count: list.length });
  }
  function fitWidth(c, sh = sheet) {
    const u = sh.usedRange();
    let m = textW(S.colName(c), true);
    if (u) for (let r = 0; r <= u.r2; r++) { const t = sh.display(r, c); if (t) m = Math.max(m, textW(t, !!sh.fmt(r, c)?.b)); }
    return Math.max(32, Math.min(600, Math.ceil(m) + 14));
  }

  /* ---------- 並べ替え ---------- */
  function sortRange() {
    const x = range();
    return single(x) ? sheet.region(cur.r, cur.c) : x;
  }
  function doSort(x, keyCol, desc, header) {
    if (x.r2 - x.r1 < (header ? 2 : 1)) { sound.play('error'); say('並べ替えるには、2 行以上の範囲を選んでください。'); return; }
    if (mutate('並べ替え', () => sheet.sort(x, keyCol, { desc, header }), { range: S.rangeText(x), key: S.colName(keyCol), desc, header })) {
      selectRect(x, { r: x.r1, c: keyCol }); sound.play('pin');
      say(`${S.rangeText(x)} を ${S.colName(keyCol)} 列の${desc ? '大きい順' : '小さい順'}に並べ替えました${header ? '（1 行目は見出しとして残しました）' : ''}。`);
    }
  }
  function quickSort(desc) {
    if (mode !== 'ready') commit();
    const x = sortRange();
    doSort(x, Math.max(x.c1, Math.min(x.c2, cur.c)), desc, sheet.guessHeader(x));
  }
  async function sortDialog() {
    if (mode !== 'ready') commit();
    const x = sortRange(), header = sheet.guessHeader(x);
    const label = (c) => { const h = sheet.display(x.r1, c); return `${S.colName(c)} 列${h ? `（${h.slice(0, 16)}）` : ''}`; };
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog sh-dlg';
    dlg.setAttribute('aria-labelledby', uid + '-st');
    dlg.style.width = '360px';
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text" id="${uid}-st">並べ替え</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div>
      <div class="window-body"><p class="sh-note">範囲: ${S.rangeText(x)}</p>
      <div class="sh-form"><label for="${uid}-k">並べる列(<u>K</u>):</label><select id="${uid}-k" autofocus>${Array.from({ length: x.c2 - x.c1 + 1 }, (_, i) => `<option value="${x.c1 + i}"${x.c1 + i === cur.c ? ' selected' : ''}>${esc(label(x.c1 + i))}</option>`).join('')}</select>
      <fieldset><legend>順番</legend><label><input type="radio" name="${uid}-o" value="asc" checked> 小さい順（昇順）(<u>A</u>)</label><label><input type="radio" name="${uid}-o" value="desc"> 大きい順（降順）(<u>D</u>)</label></fieldset>
      <label class="sh-check"><input type="checkbox" id="${uid}-h"${header ? ' checked' : ''}> 1 行目は見出し（並べない）(<u>H</u>)</label></div>
      <div class="button-row"><button type="button" class="default" data-close="ok">並べ替え(<u>S</u>)</button><button type="button" data-close="">キャンセル</button></div></div>`;
    document.body.append(dlg);
    const r = await w95.openDialog(dlg);
    const keyCol = +dlg.querySelector(`#${uid}-k`).value, desc = dlg.querySelector(`[name="${uid}-o"]:checked`).value === 'desc', hdr = dlg.querySelector(`#${uid}-h`).checked;
    dlg.remove();
    focusGrid();
    if (r === 'ok') doSort(x, keyCol, desc, hdr);
  }

  /* ---------- ファイル ---------- */
  function replaceSheet(sh, p, k) {
    sheet = sh; path = p; kind = k; dirty = false; clip = null; hist.clear();
    if (mode !== 'ready') endEdit();
    win.setArgs({ path: p || undefined });
    cur = { r: 0, c: 0 }; anc = { ...cur }; ext = { ...cur };
    layoutSizes(); scroll.scrollTo(0, 0); setTitle(); refresh();
  }
  async function confirmDiscard() {
    if (mode !== 'ready') commit();
    if (!dirty) return true;
    const a = await os.msgbox({ title: '表計算', text: `${docName()}の変更は保存されていません。\n\n保存しますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
    if (a === 'キャンセル') return false;
    if (a === 'はい') return await save();
    return true;
  }
  async function load(p) {
    try {
      let sh, warnings = 0, k = 'fsheet';
      if (/\.csv$/i.test(p)) {
        sh = S.Sheet.fromCSV(await fs.readText(p), { now: nowParts }); k = 'csv';
        const u = sh.usedRange();
        if (u) for (let c = 0; c <= u.c2; c++) { const w = fitWidth(c, sh); if (w > S.DEF_W) sh.setWidth(c, Math.min(240, w)); }
      } else {
        const r = S.fromJSON(await fs.readJSON(p), { now: nowParts });
        if (!r.ok) throw new Error(r.error);
        sh = r.sheet; warnings = r.warnings;
      }
      isSample = false;
      replaceSheet(sh, p, k);
      os.addRecent(p);
      say(`「${basename(p)}」を開きました。${k === 'csv' ? 'CSV なので、値だけが入っています。' : ''}${warnings ? `読めない書式が ${warnings} 個あったので外しました。` : ''}`);
      log('sheet.open', { path: p, kind: k, cells: sh.cells.size, warnings }, 'ok');
      return true;
    } catch (err) {
      os.msgbox({ title: '表計算', text: `「${basename(p)}」を開けませんでした。\n\n${err.message}`, icon: 'error' });
      log('sheet.open', { path: p }, 'error: ' + err.message);
      return false;
    }
  }
  async function writeFile(p, k) {
    try {
      if (k === 'csv') await fs.write(p, sheet.toCSV(), 'text/csv');
      else await fs.write(p, JSON.stringify(sheet.toJSON()), 'application/json');
      os.addRecent(p);
      log('sheet.save', { path: p, kind: k, cells: sheet.cells.size }, 'ok');
      return true;
    } catch (err) {
      os.msgbox({ title: '表計算', text: `「${basename(p)}」に保存できませんでした。\n\n${err.message}`, icon: 'error' });
      log('sheet.save', { path: p, kind: k }, 'error: ' + err.message);
      return false;
    }
  }
  const baseName = () => (path ? basename(path).replace(/\.[^.]+$/, '') : isSample ? 'おこづかい帳' : '無題');
  async function save() {
    if (mode !== 'ready') commit();
    if (!path) return saveAs();
    if (kind === 'csv') {
      const a = await os.msgbox({ title: '表計算', text: `「${basename(path)}」は CSV です。CSV には式・書式・列の幅が残りません。\n\n表計算の形（.fsheet）で保存しますか?\n「いいえ」を押すと、値だけを CSV に上書きします。`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') return saveAs();
    }
    if (!(await writeFile(path, kind))) return false;
    dirty = false; setTitle(); sound.play('pin');
    say(`「${path}」に保存しました ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
    return true;
  }
  async function saveAs() {
    if (mode !== 'ready') commit();
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/ドキュメント', name: baseName() + '.fsheet', exts: ['.fsheet'], typeLabel: '表計算の表' });
    focusGrid();
    if (!p) return false;
    path = p; kind = 'fsheet'; isSample = false; win.setArgs({ path });
    return save();
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    log('sheet.export', { name, bytes: blob.size }, 'ok');
    say(`「${name}」をパソコンへ書き出しました。`);
  }

  /* ---------- 命令 ---------- */
  const cmds = {
    async new() { if (!(await confirmDiscard())) return; isSample = false; replaceSheet(new S.Sheet({ now: nowParts }), null, 'fsheet'); say('空の表にしました。'); log('sheet.new', {}, 'ok'); },
    async open() {
      const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/ドキュメント', exts: ['.fsheet', '.csv'], typeLabel: '表計算の表と CSV' });
      focusGrid();
      if (p && (await confirmDiscard())) load(p);
    },
    async csvopen() {
      const p = await os.fileDialog({ mode: 'open', title: 'CSV を読み込む', dir: path ? dirname(path) : '/ドキュメント', exts: ['.csv'], typeLabel: 'CSV データ' });
      focusGrid();
      if (p && (await confirmDiscard())) load(p);
    },
    save, saveas: saveAs,
    async csvsave() {
      if (mode !== 'ready') commit();
      const p = await os.fileDialog({ mode: 'save', title: 'CSV で保存', dir: path ? dirname(path) : '/ドキュメント', name: baseName() + '.csv', exts: ['.csv'], typeLabel: 'CSV データ' });
      focusGrid();
      if (p && (await writeFile(p, 'csv'))) { sound.play('pin'); say(`「${p}」に CSV で保存しました。式は値に、書式は外れています。`); }
    },
    export() { if (mode !== 'ready') commit(); download(new Blob([JSON.stringify(sheet.toJSON(), null, 1)], { type: 'application/json' }), baseName() + '.fsheet'); },
    exportcsv() { if (mode !== 'ready') commit(); download(new Blob(['﻿' + sheet.toCSV()], { type: 'text/csv;charset=utf-8' }), baseName() + '.csv'); },
    close: () => win.close(),
    undo: () => restoreFrom(hist.undo(sheet.snapshot()), '元に戻す'),
    redo: () => restoreFrom(hist.redo(sheet.snapshot()), 'やり直す'),
    cut: () => doCopy(true),
    copy: () => doCopy(false),
    async paste() {
      let t = null;
      try { t = await navigator.clipboard.readText(); log('clipboard.read', { chars: t.length }, 'ok'); } catch (e) { log('clipboard.read', {}, 'error: ' + e.message); }
      doPaste(t);
    },
    del() {
      if (mode !== 'ready') commit();
      const x = range();
      if (mutate('中身を消す', () => sheet.clear(x, 'contents'), { range: S.rangeText(x) })) { sound.play('trash'); say(`${S.rangeText(x)} の中身を消しました。書式は残っています。`); }
    },
    clearfmt() { if (mode !== 'ready') commit(); const x = range(); if (mutate('書式を消す', () => sheet.clear(x, 'formats'), { range: S.rangeText(x) })) say(`${S.rangeText(x)} の書式を消しました。`); },
    all() { if (mode !== 'ready') commit(); anc = { r: 0, c: 0 }; ext = { r: sheet.rows - 1, c: sheet.cols - 1 }; cur = { r: 0, c: 0 }; refresh(); say('表の全部を選びました。'); },
    insrow() { const [at, n] = spanOf(range(), 'row'); structural(`${at + 1} 行目の上に ${n} 行を入れ`, () => sheet.insertRows(at, n)); },
    inscol() { const [at, n] = spanOf(range(), 'col'); structural(`${S.colName(at)} 列の左に ${n} 列を入れ`, () => sheet.insertCols(at, n)); },
    delrow() { const x = range(); structural(`${rowsText(x.r1, x.r2)}を消し`, () => sheet.deleteRows(x.r1, x.r2 - x.r1 + 1)); },
    delcol() { const x = range(); structural(`${colsText(x.c1, x.c2)}を消し`, () => sheet.deleteCols(x.c1, x.c2 - x.c1 + 1)); },
    async colw() { const v = await askNumber('列の幅', '列の幅', sheet.width(cur.c), 16, 800); if (v !== null) sizeAll('col', v); },
    async rowh() { const v = await askNumber('行の高さ', '行の高さ', sheet.height(cur.r), 14, 300); if (v !== null) sizeAll('row', v); },
    fitcol() { const x = range(); mutate('列の幅を中身に合わせる', () => { for (let c = x.c1; c <= x.c2; c++) sheet.setWidth(c, fitWidth(c)); }, { range: S.rangeText(x) }); },
    bold() { const on = !sheet.fmt(cur.r, cur.c)?.b; fmtRange({ b: on || null }, on ? '太字にしました' : '太字を外しました'); },
    color: () => pickColor('color'),
    bg: () => pickColor('bg'),
    left: () => align('left'), center: () => align('center'), right: () => align('right'),
    num: (d) => setNum(d.item?.dataset.num || 'general'),
    decmore() { if (mode !== 'ready') commit(); const x = range(); if (mutate('小数の桁を増やす', () => sheet.changeDecimals(x, 1), { range: S.rangeText(x) })) say('小数の桁を 1 つ増やしました。'); },
    decless() { if (mode !== 'ready') commit(); const x = range(); if (mutate('小数の桁を減らす', () => sheet.changeDecimals(x, -1), { range: S.rangeText(x) })) say('小数の桁を 1 つ減らしました。'); },
    border: (d) => setBorder(d.item?.dataset.bd || 'all'),
    autosum() {
      if (mode !== 'ready') commit();
      const x = range();
      if (!single(x)) {
        if (x.r2 + 1 >= sheet.rows) { sound.play('error'); return; }
        const list = [];
        for (let c = x.c1; c <= x.c2; c++) list.push({ r: x.r2 + 1, c, input: `=SUM(${S.rangeText({ r1: x.r1, c1: c, r2: x.r2, c2: c })})` });
        if (mutate('合計', () => sheet.setMany(list), { range: S.rangeText(x) })) { selectRect({ r1: x.r2 + 1, c1: x.c1, r2: x.r2 + 1, c2: x.c2 }); sound.play('pin'); say(`${x.r2 + 2} 行目に、列ごとの合計を入れました。`); }
        return;
      }
      const g = sheet.autoSumRange(cur.r, cur.c);
      if (!g) { beginEdit('enter', '=SUM()'); editor.setSelectionRange(5, 5); say('足す範囲を、セルを押すか引っぱって選び、Enter で決めます。'); updateStatus(); return; }
      const f = `=SUM(${S.rangeText(g)})`;
      if (mutate('合計', () => sheet.set(cur.r, cur.c, f), { cell: S.addr(cur.r, cur.c), input: f })) { sound.play('pin'); say(`${S.addr(cur.r, cur.c)} に ${f} を入れました。`); }
    },
    filldown: () => fillFrom('down'),
    fillright: () => fillFrom('right'),
    sortasc: () => quickSort(false),
    sortdesc: () => quickSort(true),
    sort: sortDialog,
    recalc() { sheet.recalcAll(); refresh(); say(`すべての式（${sheet.lastRecalc} 個）を計算し直しました。`); log('sheet.recalc', { count: sheet.lastRecalc }, 'ok'); },
    keys: () => os.msgbox({ title: '表計算のキー', icon: 'info', text: '矢印: セルを移る（Shift で範囲を広げる、Ctrl で中身の端まで）\nEnter・Tab: 決めて下・右へ（Shift で逆へ。範囲の中を回る）\n文字を打つ: 入力を始める　F2 か二度押し: 中身を直す　Esc: 取り消す\nDelete: 中身を消す　Backspace: 消して打ち直す\nCtrl+C・Ctrl+X・Ctrl+V: コピー・切り取り・貼り付け\nCtrl+Z・Ctrl+Y: 元に戻す・やり直し\nCtrl+B: 太字　Ctrl+A: すべて選択　Ctrl+S: 上書き保存　F9: すべて計算し直す\n\n式を打っている途中（= や + や ( のあと）でセルを押すと、その番地が式に入ります。\n選んだ範囲の右下のつまみを引っぱると、連番や式を伸ばせます。' }),
    funcs: () => os.msgbox({ title: '関数の一覧', icon: 'info', text: Object.entries(S.FUNCS).filter(([n]) => n !== 'CONCATENATE').map(([n, f]) => `${n}: ${f.help}`).join('\n') + '\n\n誤りの表示: #DIV/0!（0 で割った）、#REF!（セルがない）、#NAME?（知らない名前）、#VALUE!（計算できない値）、#CYCLE!（循環参照）、#N/A（見つからない）、#ERROR!（書き方の誤り）' }),
    sample: () => os.launch('sheet', { sample: true }),
    about: () => os.msgbox({ title: '表計算について', icon: 'info', text: 'Future OS 表計算 1.0\n\n1000 行 × 52 列（A〜AZ）の表です。\n式は = で始め、+ - * / ^ & と比べる記号、関数が使えます。\n変わったセルの先の式だけを計算し直し、循環参照は #CYCLE! で知らせます。\n保存は .fsheet（式と書式と列の幅も残す）と CSV（値だけ）です。' }),
  };
  // つまみを引っぱらずに伸ばす（メニューから。キーボードだけでも使える）
  function fillFrom(dir) {
    if (mode !== 'ready') commit();
    const x = range(), down = dir === 'down';
    if (down ? x.r1 === x.r2 : x.c1 === x.c2) { sound.play('error'); say(down ? '下へ伸ばすには、縦に 2 つ以上のセルを選んでください。1 行目の中身を元にします。' : '右へ伸ばすには、横に 2 つ以上のセルを選んでください。1 列目の中身を元にします。'); return; }
    const src = down ? { ...x, r2: x.r1 } : { ...x, c2: x.c1 };
    if (mutate(down ? '下へ伸ばす' : '右へ伸ばす', () => sheet.fill(src, x), { from: S.rangeText(src), to: S.rangeText(x) })) { sound.play('pin'); say(`${S.rangeText(x)} を、${down ? '1 行目' : '1 列目'}の中身を元に伸ばしました。`); }
  }
  function align(a) { const on = sheet.fmt(cur.r, cur.c)?.align !== a; fmtRange({ align: on ? a : null }, on ? { left: '左寄せにしました', center: '中央にしました', right: '右寄せにしました' }[a] : '寄せ方を元に戻しました'); }
  function setNum(k) { fmtRange(NUM_PATCH[k] || NUM_PATCH.general, `数の表示を「${NUM_OPTS.find((o) => o[0] === k)?.[1] || '標準'}」にしました`); }
  function setBorder(k) {
    if (mode !== 'ready') commit();
    const x = range();
    if (mutate('枠線', () => sheet.setBorder(x, k), { range: S.rangeText(x), kind: k })) { sound.play('select'); say(`${S.rangeText(x)}: 枠線を「${BORDERS.find((b) => b[0] === k)?.[1]}」にしました。`); }
  }
  win.body.addEventListener('w95:command', (e) => cmds[e.detail.command]?.(e.detail));

  /* ---------- 道具の帯 ---------- */
  const bar = q('.sh-bar');
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) { cmds[b.dataset.a]?.(); if (mode === 'ready') focusGrid(); } });
  numSel.addEventListener('change', () => { setNum(numSel.value); focusGrid(); });
  bdSel.addEventListener('change', () => { if (bdSel.value) setBorder(bdSel.value); bdSel.value = ''; focusGrid(); });
  for (const which of ['color', 'bg']) {
    const input = q(`[data-color="${which}"]`);
    input.addEventListener('input', () => { q(`[data-mark="${which}"]`).style[which === 'bg' ? 'background' : 'color'] = input.value; });
    input.addEventListener('change', () => { fmtRange({ [which]: input.value.toLowerCase() }, which === 'bg' ? `背景の色を ${input.value} にしました` : `文字の色を ${input.value} にしました`); focusGrid(); });
  }
  // 道具の帯は Tab で 1 回だけ止まり、中は左右の矢印で動く（focusgroup が使えないブラウザでは、ここで同じ動きを作る）
  if (!('focusGroup' in HTMLElement.prototype)) {
    const items = [...bar.querySelectorAll('button, select, input')];
    items.forEach((b, i) => (b.tabIndex = i ? -1 : 0));
    bar.addEventListener('focusin', (e) => { if (items.includes(e.target)) items.forEach((b) => (b.tabIndex = b === e.target ? 0 : -1)); });
    bar.addEventListener('keydown', (e) => {
      const i = items.indexOf(e.target);
      if (i < 0 || e.target.matches('select') || e.altKey || e.ctrlKey) return;
      const n = e.key === 'ArrowRight' ? (i + 1) % items.length : e.key === 'ArrowLeft' ? (i - 1 + items.length) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
      if (n >= 0) { e.preventDefault(); items[n].focus(); }
    });
  }

  /* ---------- キーボード（入力欄で受ける） ---------- */
  editor.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    const k = e.key, lk = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.altKey) {
      if (lk === 's') { e.preventDefault(); save(); return; }
      if (lk === 'o') { e.preventDefault(); cmds.open(); return; }
      if (mode !== 'ready') return; // 入力の途中の Ctrl+Z や Ctrl+C は、文字の操作に任せる
      if (lk === 'z' && !e.shiftKey) { e.preventDefault(); cmds.undo(); }
      else if (lk === 'y' || (lk === 'z' && e.shiftKey)) { e.preventDefault(); cmds.redo(); }
      else if (lk === 'c') { e.preventDefault(); doCopy(false); }
      else if (lk === 'x') { e.preventDefault(); doCopy(true); }
      else if (lk === 'b') { e.preventDefault(); cmds.bold(); }
      else if (lk === 'a') { e.preventDefault(); cmds.all(); }
      else if (DIRS[k]) { e.preventDefault(); const from = e.shiftKey ? ext : cur, p = sheet.edge(from.r, from.c, ...DIRS[k]); select(p.r, p.c, e.shiftKey); }
      else if (k === 'Home') { e.preventDefault(); select(0, 0, e.shiftKey); }
      else if (k === 'End') { e.preventDefault(); const u = sheet.usedRange(); if (u) select(u.r2, u.c2, e.shiftKey); }
      return; // Ctrl+V は paste の知らせで受ける
    }
    if (k === 'F9') { e.preventDefault(); cmds.recalc(); return; }
    if (mode === 'ready') {
      if (DIRS[k]) { e.preventDefault(); const [dr, dc] = DIRS[k]; if (e.shiftKey) select(ext.r + dr, ext.c + dc, true); else select(cur.r + dr, cur.c + dc); }
      else if (k === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1, 0); }
      else if (k === 'Tab') { e.preventDefault(); step(0, e.shiftKey ? -1 : 1); }
      else if (k === 'Delete') { e.preventDefault(); cmds.del(); }
      else if (k === 'Backspace') { e.preventDefault(); beginEdit('enter', ''); }
      else if (k === 'F2') { e.preventDefault(); beginEdit('edit', sheet.input(cur.r, cur.c)); }
      else if (k === 'Escape') { if (clip) { clip = null; refresh(); say('コピーの印を外しました。'); } }
      else if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); const n = Math.max(1, Math.floor((scroll.clientHeight - HEAD_H) / S.DEF_H) - 1) * (k === 'PageDown' ? 1 : -1); if (e.shiftKey) select(ext.r + n, ext.c, true); else select(cur.r + n, cur.c); }
      else if (k === 'Home') { e.preventDefault(); select(cur.r, 0, e.shiftKey); }
      return;
    }
    if (k === 'Enter') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 0); }
    else if (k === 'Tab') { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); }
    else if (k === 'Escape') { e.preventDefault(); cancel(); }
    else if (k === 'F2') { e.preventDefault(); mode = mode === 'enter' ? 'edit' : 'enter'; updateStatus(); }
    else if (mode === 'enter' && DIRS[k] && !e.shiftKey) { e.preventDefault(); commit(...DIRS[k]); }
  });
  // 選んでいるだけのときに文字が入ったら（かな漢字変換の始まりも）、そのまま入力にする
  const startTyping = () => { if (mode === 'ready') { mode = 'enter'; editAt = { ...cur }; editFrom = 'cell'; editor.classList.add('on'); } };
  editor.addEventListener('compositionstart', () => { startTyping(); placeEditor(); updateStatus(); });
  editor.addEventListener('input', () => { startTyping(); draft = editor.value; point = null; refEl.hidden = true; fbar.value = draft; placeEditor(); updateStatus(); });
  editor.addEventListener('keyup', () => { if (mode !== 'ready') updateStatus(); });
  editor.addEventListener('paste', (e) => { if (mode !== 'ready') return; e.preventDefault(); doPaste(e.clipboardData?.getData('text/plain') ?? null); });
  editor.addEventListener('blur', () => { if (mode !== 'ready' && editFrom === 'cell') setTimeout(() => { if (mode !== 'ready' && editFrom === 'cell' && !win.el.contains(document.activeElement)) commit(); }, 0); });

  /* ---------- 数式の欄と番地の欄 ---------- */
  fbar.addEventListener('focus', () => { if (mode === 'ready') beginEdit('edit', sheet.input(cur.r, cur.c), 'bar'); else editFrom = 'bar'; });
  fbar.addEventListener('input', () => { if (mode === 'ready') beginEdit('edit', fbar.value, 'bar'); draft = fbar.value; editor.value = draft; point = null; refEl.hidden = true; placeEditor(); updateStatus(); });
  fbar.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 0); }
    else if (e.key === 'Tab') { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  fbar.addEventListener('blur', () => setTimeout(() => { if (mode !== 'ready' && editFrom === 'bar' && document.activeElement !== fbar) commit(); }, 0));
  nameBox.addEventListener('focus', () => nameBox.select());
  nameBox.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.preventDefault(); refresh(); focusGrid(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const x = S.parseRangeText(nameBox.value.replace(/[：]/g, ':').replace(/[Ａ-Ｚａ-ｚ０-９＄]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)));
    if (!x || x.r2 >= sheet.rows || x.c2 >= sheet.cols) { sound.play('error'); say(`「${nameBox.value}」は番地として読めません。B5 や A1:C3 のように打ってください。`); return; }
    focusGrid(); selectRect(x); log('sheet.goto', { to: S.rangeText(x) }, 'ok');
  });

  /* ---------- マウス ---------- */
  const cellAt = (e) => { const b = body.getBoundingClientRect(); return clampPos(indexAt(rowY, Math.max(0, e.clientY - b.top)), indexAt(colX, Math.max(0, e.clientX - b.left))); };
  function autoScroll(e) {
    const s = scroll.getBoundingClientRect();
    if (e.clientY > s.bottom - 10) scroll.scrollTop += 24; else if (e.clientY < s.top + HEAD_H + 4) scroll.scrollTop -= 24;
    if (e.clientX > s.right - 10) scroll.scrollLeft += 40; else if (e.clientX < s.left + HEAD_W + 4) scroll.scrollLeft -= 40;
  }
  // 押したまま動かす間を追う。end は離したときと取り消されたときに呼ぶ。
  // 引っぱる間も格子を描き直す（押した所の要素が入れ替わる）ため、つかまえ（pointer capture）は使わず window で受ける。
  // つかまえる形では、Chrome が押した直後につかまえを外し、動きが届かなかった
  function track(el, e, move, end) {
    const id = e.pointerId;
    const mv = (ev) => { if (ev.pointerId === id) move(ev); };
    const up = (ev) => {
      if (ev.pointerId !== id) return;
      removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
      end(ev);
    };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
  }
  // 押した所で入力欄の文字の選択や、フォーカスの移動が起きないようにする（入力の続きと、参照を選ぶため）
  body.addEventListener('mousedown', (e) => { if (!(e.target === editor && mode !== 'ready')) e.preventDefault(); });
  body.addEventListener('pointerdown', (e) => {
    if (e.target === editor && mode !== 'ready') return;
    const p = cellAt(e);
    if (e.button === 2) { const x = range(); if (mode !== 'ready') commit(); if (!(p.r >= x.r1 && p.r <= x.r2 && p.c >= x.c1 && p.c <= x.c2)) select(p.r, p.c); return; }
    if (e.button !== 0) return;
    // pointerdown を取り消して、続く mousedown（フォーカスの移動と文字の選択）を起こさない。
    // mousedown の側で取り消すだけでは、Chrome がつかまえ（pointer capture）をすぐに外してしまった
    e.preventDefault();
    if (e.target === handle) { if (mode !== 'ready') commit(); startFill(e); return; }
    if (canPoint()) {
      // 式を打っている途中: 押したセル（引っぱれば範囲）の番地を式に入れる
      const a = p;
      putRef({ r1: a.r, c1: a.c, r2: a.r, c2: a.c });
      track(body, e, (ev) => { autoScroll(ev); const b2 = cellAt(ev); putRef(S.normRect({ r1: a.r, c1: a.c, r2: b2.r, c2: b2.c })); }, () => { activeInput().focus({ preventScroll: true }); log('sheet.pointref', { draft: draft.slice(0, 120) }, 'ok'); });
      return;
    }
    if (mode !== 'ready') commit();
    focusGrid();
    // 同じセルの二度押しで中身を直す（押すたびに格子を描き直すので、dblclick の知らせではなく押した間隔で見る）
    const t = performance.now();
    if (!e.shiftKey && lastDown && lastDown.r === p.r && lastDown.c === p.c && t - lastDown.t < 450) {
      lastDown = null;
      select(p.r, p.c);
      beginEdit('edit', sheet.input(p.r, p.c));
      return;
    }
    lastDown = { r: p.r, c: p.c, t };
    select(p.r, p.c, e.shiftKey);
    sound.play('select');
    track(body, e, (ev) => { autoScroll(ev); const b2 = cellAt(ev); if (b2.r !== ext.r || b2.c !== ext.c) { ext = b2; refresh(); } }, () => log('sheet.select', { range: S.rangeText(range()) }, 'ok'));
  });
  let lastDown = null;
  function startFill(e) {
    const src = range();
    let target = src;
    track(body, e, (ev) => {
      autoScroll(ev);
      const p = cellAt(ev), dn = p.r - src.r2, up = src.r1 - p.r, rt = p.c - src.c2, lf = src.c1 - p.c, m = Math.max(dn, up, rt, lf);
      target = m <= 0 ? src : m === dn ? { ...src, r2: p.r } : m === up ? { ...src, r1: p.r } : m === rt ? { ...src, c2: p.c } : { ...src, c1: p.c };
      fillEl.hidden = target === src;
      placeBox(fillEl, target);
      say(target === src ? 'つまみを外へ引っぱると、連番や式を伸ばします。' : `${S.rangeText(target)} まで伸ばします。`);
    }, () => {
      fillEl.hidden = true;
      if (target === src) return;
      if (mutate('オートフィル', () => sheet.fill(src, target), { from: S.rangeText(src), to: S.rangeText(target) })) {
        anc = { r: target.r1, c: target.c1 }; ext = { r: target.r2, c: target.c2 }; refresh(); sound.play('pin');
        say(`${S.rangeText(target)} まで伸ばしました。数は続きの番号に、式は番地をずらして入れました。`);
      }
    });
  }
  body.addEventListener('contextmenu', (e) => { e.preventDefault(); sound.play('menu'); w95.popupMenu(ctx, e.clientX, e.clientY); });
  // 列と行の見出し: 押すと列（行）を選ぶ。境目を引っぱると幅（高さ）が変わり、二度押しで中身に合わせる
  function headDown(e, axis) {
    if (e.button !== 0) return;
    e.preventDefault();
    if (mode !== 'ready') commit();
    focusGrid();
    if (e.target.closest('[data-corner]')) { cmds.all(); return; }
    const grip = e.target.closest(axis === 'col' ? '[data-cgrip]' : '[data-rgrip]');
    if (grip) {
      // 境目の二度押し: 列は中身に合わせ、行は元の高さに戻す（つかまえると dblclick の行き先が変わるので、押した間隔で見る）
      const i = +(axis === 'col' ? grip.dataset.cgrip : grip.dataset.rgrip), t = performance.now();
      if (lastGrip && lastGrip.axis === axis && lastGrip.i === i && t - lastGrip.t < 450) {
        lastGrip = null;
        if (axis === 'col') { const w = fitWidth(i); mutate('列の幅を中身に合わせる', () => sheet.setWidth(i, w), { col: S.colName(i), w }); say(`${S.colName(i)} 列の幅を中身に合わせました（${w} 画素）。`); }
        else { mutate('行の高さを戻す', () => sheet.setHeight(i, S.DEF_H), { row: i + 1 }); say(`${i + 1} 行目の高さを元に戻しました。`); }
        return;
      }
      lastGrip = { axis, i, t };
      startResize(e, axis, i);
      return;
    }
    const h = e.target.closest(axis === 'col' ? '[data-c]' : '[data-r]');
    if (!h) return;
    const i = +(axis === 'col' ? h.dataset.c : h.dataset.r), last = axis === 'col' ? sheet.rows - 1 : sheet.cols - 1;
    const at = (n) => (axis === 'col' ? { r: last, c: n } : { r: n, c: last });
    if (e.shiftKey) { anc = axis === 'col' ? { r: 0, c: anc.c } : { r: anc.r, c: 0 }; ext = at(i); }
    else { cur = axis === 'col' ? { r: 0, c: i } : { r: i, c: 0 }; anc = { ...cur }; ext = at(i); }
    refresh(); sound.play('select');
    track(e.currentTarget, e, (ev) => { const p = cellAt(ev), n = axis === 'col' ? p.c : p.r; const ne = at(n); if (ne.r !== ext.r || ne.c !== ext.c) { ext = ne; refresh(); } }, () => {});
  }
  function startResize(e, axis, i) {
    const start = axis === 'col' ? e.clientX : e.clientY, s0 = axis === 'col' ? sheet.width(i) : sheet.height(i), snap = sheet.snapshot();
    let moved = false;
    track(e.currentTarget, e, (ev) => {
      const d = (axis === 'col' ? ev.clientX : ev.clientY) - start;
      if (!moved && Math.abs(d) < 2) return;
      moved = true;
      const v = Math.max(axis === 'col' ? 16 : 14, Math.min(axis === 'col' ? 800 : 300, s0 + d));
      if (axis === 'col') sheet.setWidth(i, v); else sheet.setHeight(i, v);
      layoutSizes(); refresh();
      say(axis === 'col' ? `${S.colName(i)} 列の幅: ${v} 画素` : `${i + 1} 行目の高さ: ${v} 画素`);
    }, () => {
      if (!moved) return;
      hist.push(snap); dirty = true; setTitle();
      log('sheet.resize', { axis, index: i, size: axis === 'col' ? sheet.width(i) : sheet.height(i) }, 'ok');
    });
  }
  let lastGrip = null;
  colhead.addEventListener('pointerdown', (e) => headDown(e, 'col'));
  rowhead.addEventListener('pointerdown', (e) => headDown(e, 'row'));
  scroll.addEventListener('scroll', schedule, { passive: true });

  // 右クリックのメニュー（本体の外に置く。閉じるときに片付ける）
  const ctx = document.createElement('div');
  ctx.className = 'menu sh-ctx';
  ctx.setAttribute('role', 'menu');
  ctx.innerHTML = [['cut', '切り取り(<u>T</u>)'], ['copy', 'コピー(<u>C</u>)'], ['paste', '貼り付け(<u>P</u>)'], ['del', '中身を消す(<u>D</u>)'], null, ['insrow', '上に行を入れる(<u>I</u>)'], ['inscol', '左に列を入れる(<u>N</u>)'], ['delrow', '行を消す(<u>R</u>)'], ['delcol', '列を消す(<u>L</u>)'], null, ['sort', '並べ替え(<u>S</u>)...'], ['clearfmt', '書式を消す(<u>F</u>)']]
    .map((it) => (it ? `<div class="menu-item" data-command="${it[0]}"><span class="label">${it[1]}</span></div>` : '<div class="menu-separator"></div>')).join('');
  document.body.append(ctx);
  ctx.addEventListener('w95:command', (e) => { cmds[e.detail.command]?.(e.detail); });

  // ほかのアプリから落としたファイル
  win.body.addEventListener('fos:drop-file', async (e) => {
    const p = e.detail.path;
    if (/\.(fsheet|csv)$/i.test(p)) { if (await confirmDiscard()) load(p); } else os.openFile(p);
  });
  // 窓が手前に来たときと、窓のどこかを押したとき（入力欄の外）は、キーボードの入力を表で受ける
  const grab = () => setTimeout(() => { if (wm.getActive() === win && !win.el.contains(document.activeElement)) focusGrid(); }, 0);
  const onFocus = (e) => { if (e.detail === win) grab(); };
  wm.events.addEventListener('focus', onFocus);
  win.el.addEventListener('pointerdown', grab);
  const ro = new ResizeObserver(schedule);
  ro.observe(scroll);
  win.cleanup = () => { ro.disconnect(); wm.events.removeEventListener('focus', onFocus); ctx.remove(); cancelAnimationFrame(raf); clearTimeout(liveTimer); };

  /* ---------- 始め ---------- */
  let first = false;
  try { first = !localStorage.getItem(SEEN); } catch { /* 読めない */ }
  if (args.path) { if (!(await load(args.path))) { layoutSizes(); refresh(); } }
  else if (args.sample || first) {
    sheet = sampleSheet(nowParts); isSample = true;
    try { localStorage.setItem(SEEN, '1'); } catch { /* 保存できない */ }
    layoutSizes(); select(7, 4); setTitle();
    say('見本の表です。黄色のセルの金額を変えると、残りと合計が計算し直されます。= で始めると式になります。');
  } else { layoutSizes(); setTitle(); refresh(); }
  focusGrid();
  log('sheet.launch', { path: path || null, sample: isSample }, 'ok');
  return win;
}
