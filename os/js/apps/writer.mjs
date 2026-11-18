// 文書（ワープロ）: A4 の縦の紙の形のまま書く。
// 段落・見出し 1〜3・引用・コード、太字・斜体・下線・取り消し線・等幅、文字の色と蛍光ペン、揃え、箇条書きと番号付き、区切り線、
// 表（行と列を足す・消す）、仮想ドライブの画像（つまみで大きさを変える）、縦書きと横書き、本文の文字の大きさと行の間、
// 検索と置換、文字数と段落の数、元に戻す・やり直し、自動保存（名前のない文書は下書き）、.fdoc で保存、
// HTML・Markdown・テキストへの書き出し（仮想ドライブとパソコン）、印刷（紙の形のまま）。
//
// 編集は contenteditable の上で行う。文字の入力・改行・削除・かな漢字変換はブラウザに任せ、
// 書式の変更は document.execCommand を使わず、Range と DOM の操作で自前で行う（廃止の予定の命令に頼らず、ブラウザごとの差も避ける）。
// そのため元に戻す・やり直しも、自前の履歴（本文の HTML と選択の位置）で行う。
// 外から入る HTML（開いたファイル・貼り付け・落としたもの）は core/writer.mjs の消毒を通し、さらに Sanitizer API
// （Element.setHTML。使えないブラウザは読み込みも実行もしない DOMParser）で読んでから、ページへ移す。
// 画像は編集の間だけ blob: の URL で持ち（元に戻すための記録を軽くする）、保存と書き出しで data: の URL に戻す。
// 計算（消毒、Markdown とテキストへの変換、文字数、保存の形）は core/writer.mjs。
import * as W from '../core/writer.mjs';
import { basename, dirname, extname } from '../core/path.mjs';

const PREFS = 'fos-writer-prefs', INTRO = 'fos-writer-intro';
const TB = 'p,h1,h2,h3,blockquote,pre,li,td,th'; // 文字を書く塊
const TB_SET = new Set(TB.split(','));
const LEAF = new Set(['p', 'h1', 'h2', 'h3', 'blockquote', 'pre']); // ページの直下に置く、文字の塊
const TOP_OK = new Set([...LEAF, 'ul', 'ol', 'table', 'hr']);
const ALLOWED = new Set(W.ALLOWED);
const INLINE_FMT = new Set(['strong', 'em', 'u', 's', 'code', 'span', 'mark', 'sub', 'sup']);
const ATOM = new Set(['br', 'img', 'hr']);
const BLOCK_TYPES = [['p', '本文'], ['h1', '見出し 1'], ['h2', '見出し 2'], ['h3', '見出し 3'], ['blockquote', '引用'], ['pre', 'コード']];
const FG = [['#d32f2f', '赤', 'R'], ['#1e5bd8', '青', 'B'], ['#2e7d32', '緑', 'G'], ['#7b3fbf', '紫', 'P'], ['#e8710a', '橙', 'O'], ['#c2185b', '桃', 'K']];
const HL = [['#fff27a', '黄', 'Y'], ['#b8f5c9', '緑', 'G'], ['#bdf3ff', '水色', 'A'], ['#ffd0e6', '桃', 'K'], ['#ffe0b2', '橙', 'O']];
const IMG_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp' };
const IMG_MAX = 8 * 1024 * 1024;
const MM = 96 / 25.4; // 1mm の CSS の画素
const PAPER_W = W.PAGE.width * MM, COLUMN_W = (W.PAGE.width - W.PAGE.marginX * 2) * MM; // 紙の幅と、文字を書く幅（横書き）
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];
const KINDS = { fdoc: ['.fdoc', '文書', 'application/json'], html: ['.html', 'HTML 文書', 'text/html;charset=utf-8'], md: ['.md', 'Markdown 文書', 'text/markdown;charset=utf-8'], txt: ['.txt', 'テキスト文書', 'text/plain;charset=utf-8'] };

// メニューの項目を作る
const mi = (cmd, label, { key = '', status = '', cls = '', attrs = '' } = {}) =>
  `<div class="menu-item${cls}" data-command="${cmd}"${status ? ` data-status="${status}"` : ''}${attrs}><span class="label">${label}</span>${key ? `<span class="shortcut">${key}</span>` : ''}</div>`;
const sub = (label, items, status = '') => `<div class="menu-item"${status ? ` data-status="${status}"` : ''}><span class="label">${label}</span><div class="menu" role="menu">${items}</div></div>`;
const SEP = '<div class="menu-separator"></div>';
const chip = (c) => `<i class="wr-chip" style="--c:${c}" aria-hidden="true"></i>`;
const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    ${mi('new', '新規(<u>N</u>)', { status: '白紙の文書を、別の窓で開きます。' })}
    ${mi('open', '開く(<u>O</u>)...', { key: 'Ctrl+O', status: '仮想ドライブの文書（.fdoc）を開きます。' })}
    ${mi('save', '上書き保存(<u>S</u>)', { key: 'Ctrl+S', status: '.fdoc の形で保存します。' })}
    ${mi('saveas', '名前を付けて保存(<u>A</u>)...')}
    ${SEP}
    ${sub('書き出す(<u>E</u>)', mi('x-html', 'HTML(<u>H</u>)...') + mi('x-md', 'Markdown(<u>M</u>)...') + mi('x-txt', 'テキスト(<u>T</u>)...'), '仮想ドライブへ、別の形のファイルとして書き出します。')}
    ${sub('パソコンへ書き出す(<u>D</u>)', mi('d-fdoc', '文書 .fdoc(<u>F</u>)') + mi('d-html', 'HTML(<u>H</u>)') + mi('d-md', 'Markdown(<u>M</u>)') + mi('d-txt', 'テキスト(<u>T</u>)'), 'パソコンへファイルとして書き出します。')}
    ${SEP}
    ${mi('print', '印刷(<u>P</u>)...', { key: 'Ctrl+P', status: '紙の形のまま印刷します。' })}
    ${SEP}
    ${mi('close', '閉じる(<u>X</u>)')}
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    ${mi('undo', '元に戻す(<u>U</u>)', { key: 'Ctrl+Z' })}
    ${mi('redo', 'やり直し(<u>R</u>)', { key: 'Ctrl+Y' })}
    ${SEP}
    ${mi('cut', '切り取り(<u>T</u>)', { key: 'Ctrl+X' })}
    ${mi('copy', 'コピー(<u>C</u>)', { key: 'Ctrl+C' })}
    ${mi('paste', '貼り付け(<u>P</u>)', { key: 'Ctrl+V' })}
    ${SEP}
    ${mi('all', 'すべて選択(<u>A</u>)', { key: 'Ctrl+A' })}
    ${SEP}
    ${mi('find', '検索(<u>F</u>)...', { key: 'Ctrl+F' })}
    ${mi('next', '次を検索(<u>N</u>)', { key: 'F3' })}
    ${mi('replace', '置換(<u>H</u>)...', { key: 'Ctrl+H' })}
  </div></div>
  <div class="menu-title">書式(<u>O</u>)<div class="menu" role="menu">
    ${mi('bold', '太字(<u>B</u>)', { key: 'Ctrl+B' })}
    ${mi('italic', '斜体(<u>I</u>)', { key: 'Ctrl+I' })}
    ${mi('underline', '下線(<u>U</u>)', { key: 'Ctrl+U' })}
    ${mi('strike', '取り消し線(<u>K</u>)', { key: 'Ctrl+Shift+X' })}
    ${mi('code', '等幅の文字（コード）(<u>D</u>)')}
    ${SEP}
    ${sub('文字の色(<u>C</u>)', FG.map(([c, n, k]) => mi('fg:' + c, `${chip(c)}${n}(<u>${k}</u>)`)).join('') + SEP + mi('fg-none', '色を元に戻す(<u>N</u>)') + mi('fg-pick', 'ほかの色(<u>M</u>)...'))}
    ${sub('蛍光ペン(<u>G</u>)', HL.map(([c, n, k]) => mi('hl:' + c, `${chip(c)}${n}(<u>${k}</u>)`)).join('') + SEP + mi('hl-none', '蛍光ペンを消す(<u>N</u>)') + mi('hl-pick', 'ほかの色(<u>M</u>)...'))}
    ${mi('clear', '書式を消す(<u>E</u>)', { status: '選んだ文字の太字・色などの飾りを外します。' })}
    ${SEP}
    ${sub('段落の種類(<u>P</u>)', mi('b-p', '本文(<u>0</u>)', { key: 'Ctrl+Alt+0' }) + mi('b-h1', '見出し 1(<u>1</u>)', { key: 'Ctrl+Alt+1' }) + mi('b-h2', '見出し 2(<u>2</u>)', { key: 'Ctrl+Alt+2' }) + mi('b-h3', '見出し 3(<u>3</u>)', { key: 'Ctrl+Alt+3' }) + mi('b-blockquote', '引用(<u>Q</u>)') + mi('b-pre', 'コード(<u>C</u>)'))}
    ${sub('揃え(<u>J</u>)', mi('a-left', '左寄せ(<u>L</u>)', { key: 'Ctrl+Shift+L' }) + mi('a-center', '中央揃え(<u>E</u>)', { key: 'Ctrl+Shift+E' }) + mi('a-right', '右寄せ(<u>R</u>)', { key: 'Ctrl+Shift+R' }))}
    ${mi('ul', '箇条書き(<u>L</u>)', { key: 'Ctrl+Shift+8' })}
    ${mi('ol', '番号付き(<u>N</u>)', { key: 'Ctrl+Shift+7' })}
  </div></div>
  <div class="menu-title">挿入(<u>I</u>)<div class="menu" role="menu">
    ${mi('table', '表(<u>T</u>)...', { status: '行と列の数を選んで、表を入れます。' })}
    ${mi('image', '画像(<u>G</u>)...', { status: '仮想ドライブの画像を入れます。' })}
    ${mi('imgsize', '画像の大きさ(<u>S</u>)...', { status: '選んでいる画像の幅を、数で決めます。' })}
    ${mi('hr', '区切り線(<u>H</u>)')}
    ${mi('date', '日付と時刻(<u>D</u>)', { key: 'F5' })}
  </div></div>
  <div class="menu-title">表(<u>A</u>)<div class="menu" role="menu">
    ${mi('t-rowAbove', '上に行を足す(<u>U</u>)', { attrs: ' aria-disabled="true"' })}
    ${mi('t-rowBelow', '下に行を足す(<u>D</u>)', { attrs: ' aria-disabled="true"' })}
    ${mi('t-colLeft', '左に列を足す(<u>L</u>)', { attrs: ' aria-disabled="true"' })}
    ${mi('t-colRight', '右に列を足す(<u>R</u>)', { attrs: ' aria-disabled="true"' })}
    ${SEP}
    ${mi('t-delRow', '行を消す(<u>W</u>)', { attrs: ' aria-disabled="true"' })}
    ${mi('t-delCol', '列を消す(<u>C</u>)', { attrs: ' aria-disabled="true"' })}
    ${SEP}
    ${mi('t-delTable', '表を消す(<u>T</u>)', { attrs: ' aria-disabled="true"' })}
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    ${mi('vertical', '縦書き(<u>V</u>)', { status: '縦書きと横書きを切り替えます。文書と一緒に保存します。' })}
    ${sub('本文の文字の大きさ(<u>S</u>)', W.FONT_SIZES.map((v) => mi('fs', `${v} pt`, { cls: ' radio', attrs: ` data-radio="fs" data-v="${v}"` })).join(''))}
    ${sub('行の間(<u>L</u>)', W.LINE_HEIGHTS.map((v) => mi('lh', `${v} 倍`, { cls: ' radio', attrs: ` data-radio="lh" data-v="${v}"` })).join(''))}
    ${SEP}
    ${sub('拡大率(<u>Z</u>)', ZOOMS.map((v) => mi('zoom', `${v * 100}%`, { cls: ' radio', attrs: ` data-radio="zoom" data-v="${v}"` })).join('') + mi('zoom', '紙の幅に合わせる(<u>W</u>)', { cls: ' radio', attrs: ' data-radio="zoom" data-v="fit"' }))}
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    ${mi('keys', 'キーボードの操作(<u>K</u>)')}
    ${mi('sample', '見本の文書を開く(<u>S</u>)')}
    ${SEP}
    ${mi('about', '文書について(<u>A</u>)')}
  </div></div>
</div>`;

// 道具の帯のボタン（data-cmd はメニューの命令と同じ名前）
const tb = (cmd, text, label, { pressed = null, key = '', status = '' } = {}) =>
  `<button type="button" class="wr-tb" data-cmd="${cmd}" aria-label="${label}" title="${label}${key ? '（' + key + '）' : ''}"${pressed === null ? '' : ` aria-pressed="${pressed}"`}${status ? ` data-status="${status}"` : ''}>${text}</button>`;
const TSEP = '<span class="wr-sep" role="separator" aria-orientation="vertical"></span>';

const loadPrefs = () => { try { return { zoom: 'fit', ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { zoom: 'fit' }; } };
const savePrefs = (p) => { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch { /* 保存できない */ } };
const time = () => new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound } = os;
  let path = args.path || null;
  const draftKey = args.draftKey || 'fos-writer-draft-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let settings = { ...W.DEFAULT_SETTINGS }, initial = null, intro = false, failed = false;
  const prefs = loadPrefs();

  /* ---------- 読み込み ---------- */
  if (path) {
    try {
      const d = W.parseFdoc(await fs.readText(path));
      initial = d.html; settings = d.settings;
      log('writer.open', { path }, 'ok');
    } catch (e) {
      log('writer.open', { path }, 'error: ' + e.message);
      os.msgbox({ title: '文書', text: `「${basename(path)}」を開けませんでした。\n\n${e.message}`, icon: 'error' });
      path = null; failed = true;
    }
  } else if (!args.blank && !args.sample) {
    let draft = null;
    try { draft = localStorage.getItem(draftKey); } catch { /* 読めない */ }
    if (draft) {
      try { const d = W.parseFdoc(draft); initial = d.html; settings = d.settings; log('writer.draft.load', { draftKey }, 'ok'); }
      catch (e) { log('writer.draft.load', { draftKey }, 'error: ' + e.message); }
    }
  }
  if (initial == null) {
    let seen = false;
    try { seen = !!localStorage.getItem(INTRO); } catch { /* 読めない */ }
    if (args.sample || (!args.blank && !failed && !seen)) {
      initial = W.SAMPLE_HTML; intro = true;
      try { localStorage.setItem(INTRO, '1'); } catch { /* 保存できない */ }
    } else initial = '<p><br></p>';
  }

  let page, scroller, dirty = false;
  const win = wm.open({
    app: 'writer', icon: 'icons/writer.svg', className: 'app-writer', title: '文書', w: 960, h: 720, ...rect, args: path ? { path } : { draftKey },
    render(w) {
      w.body.innerHTML = MENU + `
      <div class="toolbar wr-bar">
        <label class="wr-blocklabel" for="wrBlock-${w.id}">段落の種類(<u>Y</u>):</label>
        <select id="wrBlock-${w.id}" class="wr-block" data-block data-status="段落を見出しや引用に変えます。">${BLOCK_TYPES.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
        <div class="wr-tools" role="toolbar" aria-label="書式と挿入" aria-controls="wrPage-${w.id}" focusgroup="toolbar wrap">
          <div class="wr-group" role="group" aria-label="文字の飾り">
            ${tb('bold', '<b>太</b>', '太字', { pressed: false, key: 'Ctrl+B' })}${tb('italic', '<i>斜</i>', '斜体', { pressed: false, key: 'Ctrl+I' })}${tb('underline', '<u>下</u>', '下線', { pressed: false, key: 'Ctrl+U' })}${tb('strike', '<s>消</s>', '取り消し線', { pressed: false, key: 'Ctrl+Shift+X' })}
          </div>${TSEP}
          <div class="wr-group" role="group" aria-label="色">
            ${tb('fg', '<span class="wr-a">A</span><i class="wr-swatch" data-swatch="fg"></i>', '文字の色をぬる', { status: '選んだ文字に、右の四角の色をぬります。' })}<input type="color" class="wr-pick" data-pick="fg" value="#d32f2f" aria-label="文字の色を選ぶ" title="文字の色を選ぶ">
            ${tb('hl', '<span class="wr-a wr-pen">ペン</span><i class="wr-swatch" data-swatch="hl"></i>', '蛍光ペンをぬる', { status: '選んだ文字に、蛍光ペンをぬります。' })}<input type="color" class="wr-pick" data-pick="hl" value="#fff27a" aria-label="蛍光ペンの色を選ぶ" title="蛍光ペンの色を選ぶ">
          </div>${TSEP}
          <div class="wr-group" role="group" aria-label="揃え">
            ${tb('a-left', '<span class="wr-al wr-al-l" aria-hidden="true"></span>', '左寄せ', { pressed: true, key: 'Ctrl+Shift+L' })}${tb('a-center', '<span class="wr-al wr-al-c" aria-hidden="true"></span>', '中央揃え', { pressed: false, key: 'Ctrl+Shift+E' })}${tb('a-right', '<span class="wr-al wr-al-r" aria-hidden="true"></span>', '右寄せ', { pressed: false, key: 'Ctrl+Shift+R' })}
          </div>${TSEP}
          <div class="wr-group" role="group" aria-label="箇条書き">
            ${tb('ul', '・≡', '箇条書き', { pressed: false, key: 'Ctrl+Shift+8' })}${tb('ol', '1.≡', '番号付き', { pressed: false, key: 'Ctrl+Shift+7' })}
          </div>${TSEP}
          <div class="wr-group" role="group" aria-label="挿入">
            ${tb('table', '表(<u>T</u>)', '表を入れる', { status: '行と列の数を選んで、表を入れます。' })}${tb('image', '画像(<u>G</u>)', '画像を入れる', { status: '仮想ドライブの画像を入れます。' })}${tb('hr', '線(<u>K</u>)', '区切り線を入れる')}
          </div>${TSEP}
          <div class="wr-group" role="group" aria-label="元に戻す">
            ${tb('undo', '↶', '元に戻す', { key: 'Ctrl+Z' })}${tb('redo', '↷', 'やり直し', { key: 'Ctrl+Y' })}
          </div>${TSEP}
          ${tb('vertical', '縦書き(<u>W</u>)', '縦書き', { pressed: false, status: '縦書きと横書きを切り替えます。' })}
          ${tb('find', '検索', '検索と置換', { key: 'Ctrl+F' })}
        </div>
      </div>
      <div class="wr-find" data-findbar hidden role="search" aria-label="検索と置換">
        <label for="wrFq-${w.id}">検索(<u>S</u>):</label><input type="search" id="wrFq-${w.id}" data-fq autocomplete="off" spellcheck="false" enterkeyhint="search">
        <button type="button" class="flat wr-fbtn" data-f="prev">前へ(<u>P</u>)</button><button type="button" class="flat wr-fbtn" data-f="next">次へ(<u>N</u>)</button>
        <label class="wr-fcase"><input type="checkbox" data-fcase> 大文字と小文字を区別(<u>M</u>)</label>
        <span class="wr-fcount" data-fcount aria-live="polite"></span>
        <label for="wrFr-${w.id}">置換後(<u>L</u>):</label><input type="text" id="wrFr-${w.id}" data-fr autocomplete="off" spellcheck="false">
        <button type="button" class="flat wr-fbtn" data-f="one">置換(<u>R</u>)</button><button type="button" class="flat wr-fbtn" data-f="all">すべて置換(<u>Q</u>)</button>
        <button type="button" class="flat wr-fbtn" data-f="close">閉じる(<u>X</u>)</button>
      </div>
      <div class="wr-stage" data-stage>
        <div class="wr-scroll" data-scroll>
          <div class="wr-page" data-page id="wrPage-${w.id}" contenteditable="true" role="textbox" aria-multiline="true" aria-label="本文" spellcheck="false"></div>
        </div>
        <div class="wr-imgbox" data-imgbox hidden><button type="button" class="flat wr-imghandle" data-imghandle aria-label="画像の大きさのつまみ。左右の矢印キーで幅を変えます" title="ドラッグで画像の大きさを変えます（矢印キーでも変えられます）"></button></div>
      </div>
      <div class="fos-sr-only" aria-live="polite" data-live></div>
      <div class="status-bar"><div class="status-field" data-status></div><div class="status-field" style="width:188px" data-count></div><div class="status-field" style="width:64px" data-paras></div><div class="status-field" style="width:128px" data-mode></div><div class="status-field" style="width:120px" data-saved></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      clearTimeout(saveTimer); clearTimeout(typingTimer);
      if (path) { if (dirty) await save(); return true; }
      if (!dirty && (intro || isBlank())) { try { localStorage.removeItem(draftKey); } catch { /* 消せない */ } return true; }
      const a = await os.msgbox({ title: '文書', text: '無題の文書には、まだ名前が付いていません。\n\n保存しますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') return await saveAs();
      try { localStorage.removeItem(draftKey); } catch { /* 消せない */ }
      return true;
    },
  });
  const q = (s) => win.body.querySelector(s);
  page = q('[data-page]'); scroller = q('[data-scroll]');
  const stage = q('[data-stage]'), statusEl = q('.status-field[data-status]'), blockSel = q('[data-block]'), tools = q('[role="toolbar"]');
  const imgBox = q('[data-imgbox]'), handle = q('[data-imghandle]');
  // 操作の結果は状態の帯に出し、読み上げの領域にも入れる（帯の欄はメニューの説明にも使うので、そこは読み上げの領域にしない）
  const live = q('[data-live]');
  const say = (t) => { delete statusEl.dataset.saved; statusEl.textContent = t; live.textContent = ''; requestAnimationFrame(() => { live.textContent = t; }); };
  const set = (sel, v) => { q(sel).textContent = v; };

  /* ---------- 画像（編集の間は blob: の URL で持つ） ---------- */
  const images = new Map(); // blob: の URL → { blob, dataURL }
  const imageSrc = (src) => images.has(src);
  function dataUrlToBlob(u) {
    const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(u);
    if (!m) throw new Error('画像の形が読めません');
    const bin = atob(m[2]), a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: m[1] });
  }
  const blobToDataUrl = (b) => new Promise((ok, ng) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ng(r.error); r.readAsDataURL(b); });
  function registerBlob(blob, dataURL) { const url = URL.createObjectURL(blob); images.set(url, { blob, dataURL }); return url; }
  function adoptImages(root) {
    for (const img of root.querySelectorAll('img')) {
      const s = img.getAttribute('src') || '';
      if (s.startsWith('data:image/')) { try { img.setAttribute('src', registerBlob(dataUrlToBlob(s), s)); } catch { img.remove(); } }
      else if (!images.has(s)) img.remove();
    }
  }

  /* ---------- 消毒した HTML をページに入れる形にする ---------- */
  // clean は core の消毒を通した文字。Sanitizer API でもう一度消毒しながら読み（使えなければ、実行も読み込みもしない DOMParser）、
  // 文字に戻さずに節をそのまま移す
  function parseClean(clean) {
    let holder = null;
    if ('setHTML' in Element.prototype) {
      try { holder = document.createElement('div'); holder.setHTML(clean, { sanitizer: W.SANITIZER_CONFIG }); }
      catch (e) { holder = null; log('writer.sanitize', {}, 'error: ' + e.message); }
    }
    if (!holder) holder = new DOMParser().parseFromString(clean, 'text/html').body;
    adoptImages(holder);
    const frag = document.createDocumentFragment();
    frag.append(...holder.childNodes);
    return frag;
  }
  // 保存と書き出しに使う本文の HTML（blob: の画像を data: に戻し、書式の目印の文字を除く）
  const docHtml = (html = page.innerHTML) => html.replace(/\u200B/g, '').replace(/(<img\b[^>]*?\bsrc=")(blob:[^"]+)(")/g, (m, a, u, b) => (images.has(u) ? a + images.get(u).dataURL + b : a + b));
  const docText = () => W.makeFdoc({ html: docHtml(), settings });

  /* ---------- 選択の位置（文字の数で表す。DOM を作り直しても同じ所へ戻せる） ---------- */
  const idx = (n) => Array.prototype.indexOf.call(n.parentNode.childNodes, n);
  function* units(n) {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) yield c;
      else if (c.nodeType === 1) {
        if (ATOM.has(c.localName)) yield c;
        else { if (TB_SET.has(c.localName)) yield { block: c }; yield* units(c); }
      }
    }
  }
  function posOf(node, offset) {
    if (!page.contains(node)) return 0;
    const r = document.createRange();
    r.setStart(node, offset);
    let acc = 0;
    // 塊は、境目が塊の中（先頭を含む）にあれば数える。文字と画像などは、境目より前で始まっていれば数える
    for (const u of units(page)) {
      if (u.block) { if (r.comparePoint(u.block, 0) > 0) break; acc += 1; continue; }
      if (u === node) return acc + offset;
      if (r.comparePoint(u, 0) >= 0) break;
      acc += u.nodeType === 3 ? u.length : 1;
    }
    return acc;
  }
  function pointAt(pos) {
    let acc = 0, last = null;
    for (const u of units(page)) {
      if (u.block) { if (acc >= pos && last) return last; acc += 1; last = [u.block, 0]; continue; }
      if (u.nodeType === 3) { if (acc + u.length >= pos) return [u, Math.max(0, pos - acc)]; acc += u.length; last = [u, u.length]; continue; }
      if (acc >= pos) return [u.parentNode, idx(u)];
      acc += 1; last = [u.parentNode, idx(u) + 1];
    }
    return last || [page, page.childNodes.length];
  }
  function selPos() {
    const s = getSelection();
    if (!s.rangeCount || !page.contains(s.anchorNode) || !page.contains(s.focusNode)) return null;
    return [posOf(s.anchorNode, s.anchorOffset), posOf(s.focusNode, s.focusOffset)];
  }
  function setSelPos(p) {
    if (!p) return;
    const a = pointAt(p[0]), f = p[0] === p[1] ? a : pointAt(p[1]);
    try { getSelection().setBaseAndExtent(a[0], a[1], f[0], f[1]); } catch { /* 置けない位置 */ }
  }
  // 塊を作り直す操作の間は、選択の端を節で覚える（文字の節はそのまま移るので、同じ節へ戻せる）
  function saveRefs() {
    const s = getSelection();
    if (!s.rangeCount || !page.contains(s.anchorNode)) return null;
    const ref = (n, o) => (n.nodeType === 3 ? { t: n, o } : { before: n.childNodes[o] || null, parent: n });
    return [ref(s.anchorNode, s.anchorOffset), ref(s.focusNode, s.focusOffset)];
  }
  function restoreRefs(refs) {
    if (!refs) return;
    const pt = (x) => (x.t ? (page.contains(x.t) ? [x.t, Math.min(x.o, x.t.length)] : null)
      : x.before && page.contains(x.before) ? [x.before.parentNode, idx(x.before)] : page.contains(x.parent) ? [x.parent, x.parent.childNodes.length] : null);
    const a = pt(refs[0]), f = pt(refs[1]);
    if (a && f) try { getSelection().setBaseAndExtent(a[0], a[1], f[0], f[1]); } catch { /* 置けない位置 */ }
  }

  /* ---------- 選択と、塊を探す道具 ---------- */
  let savedRange = null;
  function onSelChange() {
    const s = getSelection();
    if (!s.rangeCount || !page.contains(s.getRangeAt(0).commonAncestorContainer)) return;
    savedRange = s.getRangeAt(0).cloneRange();
    syncState();
  }
  document.addEventListener('selectionchange', onSelChange);
  // 今の選択（ページの外へ焦点が移っていれば、最後にページで選んでいた範囲に戻す）
  function range() {
    const s = getSelection();
    if (s.rangeCount && page.contains(s.getRangeAt(0).commonAncestorContainer)) return s.getRangeAt(0);
    page.focus({ preventScroll: true });
    let r;
    if (savedRange && page.contains(savedRange.startContainer) && page.contains(savedRange.endContainer)) r = savedRange.cloneRange();
    else { r = document.createRange(); r.selectNodeContents(page.querySelector(TB) || page); r.collapse(true); }
    s.removeAllRanges(); s.addRange(r);
    return s.getRangeAt(0);
  }
  // node から上へ、sel に合う要素（ページの中だけ）
  const within = (node, sel) => { const el = (node?.nodeType === 1 ? node : node?.parentElement)?.closest(sel); return el && el !== page && page.contains(el) ? el : null; };
  const blockOf = (node) => within(node, TB);
  const topOf = (n) => { while (n && n.parentNode !== page) n = n.parentNode; return n && n.parentNode === page ? n : null; };
  const emptyP = () => { const p = document.createElement('p'); p.append(document.createElement('br')); return p; };
  const hasContent = (n) => !!(n.textContent.replace(/\u200B/g, '') || n.querySelector?.('img, br'));
  const isEmptyBlock = (b) => LEAF.has(b.localName) && !b.textContent.replace(/[\u200B\s]/g, '') && !b.querySelector('img');
  const isBlank = () => !page.textContent.replace(/[\u200B\s]/g, '') && !page.querySelector('img, table, hr');
  function caretAt(node, start) {
    const r = document.createRange(); r.selectNodeContents(node); r.collapse(start);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function selectNodes(a, b) { getSelection().setBaseAndExtent(a, 0, b, b.nodeType === 3 ? b.length : b.childNodes.length); }
  // 範囲にかかる文字の節（端の節は範囲の所で分ける）
  function textsIn(r) {
    const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    const list = [];
    if (r.commonAncestorContainer.nodeType === 3) list.push(r.commonAncestorContainer);
    else { const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n = tw.nextNode(); n; n = tw.nextNode()) if (r.intersectsNode(n)) list.push(n); }
    const sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
    const out = [];
    for (let t of list) {
      const s = t === sc ? so : 0, e = t === ec ? eo : t.length;
      if (s >= e) continue;
      if (e < t.length) t.splitText(e);
      if (s > 0) t = t.splitText(s);
      out.push(t);
    }
    return out;
  }
  // anc の中で node へ続く道だけを残し、前と後ろの部分は anc の写しへ移す（飾りや列を、ある所で分けるのに使う）
  function isolate(anc, node) {
    const before = document.createRange(); before.setStart(anc, 0); before.setEndBefore(node);
    if (!before.collapsed) { const f = before.extractContents(); if (hasContent(f)) { const c = anc.cloneNode(false); c.append(f); anc.before(c); } }
    const after = document.createRange(); after.setStartAfter(node); after.setEnd(anc, anc.childNodes.length);
    if (!after.collapsed) { const f = after.extractContents(); if (hasContent(f)) { const c = anc.cloneNode(false); c.append(f); anc.after(c); } }
  }
  const unwrap = (el) => el.replaceWith(...el.childNodes);
  function wrapText(t, tag, prop, value) { const el = document.createElement(tag); if (prop) el.style.setProperty(prop, value); t.before(el); el.append(t); return el; }
  // 範囲にかかる、いちばん内側の文字の塊（3 回押しの選択のように、終わりが次の塊の先頭にちょうどあるときは、その塊を入れない）
  function blocksIn(r) {
    const start = blockOf(r.startContainer);
    if (r.collapsed) return start ? [start] : [];
    const out = [];
    const tw = document.createTreeWalker(page, NodeFilter.SHOW_ELEMENT, { acceptNode: (el) => (TB_SET.has(el.localName) && ![...el.children].some((c) => LEAF.has(c.localName)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    for (let el = tw.nextNode(); el; el = tw.nextNode()) if (r.intersectsNode(el)) out.push(el);
    if (out.length > 1) {
      const last = out[out.length - 1], pre = document.createRange();
      pre.setStart(last, 0); pre.setEnd(r.endContainer, r.endOffset);
      if (!pre.toString() && !pre.cloneContents().querySelector('img')) out.pop();
    }
    return out;
  }

  /* ---------- 整える ---------- */
  // 決まりの外の形（ブラウザが入れた div や style、一番外の文字など）があるか
  function nonCanonical() {
    if (!page.firstChild) return true;
    for (const n of page.childNodes) {
      if (n.nodeType === 3) { if (n.data.replace(/[\s\u200B]/g, '')) return true; }
      else if (n.nodeType !== 1 || !TOP_OK.has(n.localName)) return true;
    }
    for (const el of page.querySelectorAll('*')) {
      const tag = el.localName;
      if (!ALLOWED.has(tag)) return true;
      for (const a of el.attributes) {
        if (a.name === 'style') { const ok = W.STYLE_PROPS[tag] || []; for (let i = 0; i < el.style.length; i++) if (!ok.includes(el.style[i])) return true; }
        else if (!(tag === 'img' && (a.name === 'src' || a.name === 'alt'))) return true;
      }
      if (tag === 'span' && !el.style.length) return true;
      if (TB_SET.has(tag) && !el.firstChild) return true;
    }
    return false;
  }
  function repair() {
    const p = selPos();
    page.replaceChildren(parseClean(W.sanitize(page.innerHTML, { imageSrc })));
    wrapLoose(); // HTML の読み取りは、表の中に置けない文字を表の前へ出す。それも段落に入れる
    setSelPos(p);
    log('writer.tidy', {}, 'ok');
  }
  // 打っている間にすぐ直すもの: 一番外の文字・飾り・br を段落に入れる、一番外の div を段落にする、空のページに段落を置く
  function quickFix() {
    if (composing) return;
    if (!page.firstChild) { const p = emptyP(); page.append(p); caretAt(p, true); return; }
    const refs = saveRefs();
    if (wrapLoose()) restoreRefs(refs);
  }
  function wrapLoose() {
    const loose = [...page.childNodes].filter((n) => (n.nodeType === 3 ? n.data.replace(/[\s\u200B]/g, '') : n.nodeType === 1 && (INLINE_FMT.has(n.localName) || n.localName === 'br' || n.localName === 'img' || n.localName === 'div')));
    if (!loose.length) return false;
    let run = null;
    for (const n of [...page.childNodes]) {
      if (n.nodeType === 1 && n.localName === 'div') { run = null; const p = document.createElement('p'); p.append(...n.childNodes); if (!p.firstChild) p.append(document.createElement('br')); n.replaceWith(p); continue; }
      const inl = n.nodeType === 3 || (n.nodeType === 1 && (INLINE_FMT.has(n.localName) || n.localName === 'br' || n.localName === 'img'));
      if (!inl) { run = null; continue; }
      if (n.nodeType === 3 && !n.data.trim() && !run) continue;
      if (!run) { run = document.createElement('p'); n.before(run); }
      run.append(n);
    }
    return true;
  }
  // 飾りの後始末: 空の飾りを消し、となりあう同じ飾りをまとめ、文字の節をつなぐ
  function tidyInline() {
    for (const el of [...page.querySelectorAll('strong,em,u,s,code,span,mark,sub,sup')]) if (!el.textContent && !el.querySelector('img,br')) el.remove();
    for (const el of [...page.querySelectorAll('strong,em,u,s,code,span,mark,sub,sup')]) {
      const prev = el.previousSibling;
      if (prev && prev.nodeType === 1 && prev.localName === el.localName && (prev.getAttribute('style') || '') === (el.getAttribute('style') || '')) { prev.append(...el.childNodes); el.remove(); }
    }
    page.normalize();
  }
  // 書式の目印の文字（ゼロ幅の空白）は、ほかの文字を打ったら消す
  function fixZwsp() {
    const s = getSelection();
    if (composing || !s.isCollapsed) return;
    const n = s.focusNode;
    if (n?.nodeType !== 3 || !n.data.includes('\u200B') || n.data.length < 2 || !page.contains(n)) return;
    const off = s.focusOffset, before = (n.data.slice(0, off).match(/\u200B/g) || []).length;
    n.data = n.data.replace(/\u200B/g, '');
    s.collapse(n, Math.max(0, off - before));
  }

  /* ---------- 履歴（元に戻す・やり直し） ---------- */
  const hist = { list: [], i: -1 };
  let typingTimer = 0, pendingTyping = false, composing = false;
  function record() {
    clearTimeout(typingTimer); pendingTyping = false;
    const html = page.innerHTML, sel = selPos(), cur = hist.list[hist.i];
    if (cur && cur.html === html) { cur.sel = sel; syncUndo(); return; }
    hist.list.splice(hist.i + 1);
    hist.list.push({ html, sel });
    if (hist.list.length > 300) hist.list.shift();
    hist.i = hist.list.length - 1;
    syncUndo();
  }
  const flushTyping = () => { if (pendingTyping) { if (nonCanonical()) repair(); record(); } };
  function syncUndo() {
    q('[data-cmd="undo"]').setAttribute('aria-disabled', String(hist.i <= 0));
    q('[data-cmd="redo"]').setAttribute('aria-disabled', String(hist.i >= hist.list.length - 1));
  }
  function restoreState(st) {
    page.innerHTML = st.html; // 自分で記録した本文（読み込みと貼り付けのときに消毒済み）
    pickImg(null);
    if (st.sel) { page.focus({ preventScroll: true }); setSelPos(st.sel); }
    changed();
  }
  function undo() {
    flushTyping();
    if (hist.i <= 0) { sound.play('error'); say('これより前には戻せません。'); return; }
    hist.i--; restoreState(hist.list[hist.i]); syncUndo(); say('元に戻しました。'); log('writer.undo', { at: hist.i }, 'ok');
  }
  function redo() {
    flushTyping();
    if (hist.i >= hist.list.length - 1) { sound.play('error'); say('やり直せる操作はありません。'); return; }
    hist.i++; restoreState(hist.list[hist.i]); syncUndo(); say('やり直しました。'); log('writer.redo', { at: hist.i }, 'ok');
  }

  // 本文を変える命令の型: 打ちかけの文字を記録 → 変える → 整える → 記録
  // fn の戻り値: false は「変えなかった」、true は「fn が選択を置いた」、それ以外は「元の選択の節へ戻す」
  function edit(name, fn, { noRange = false } = {}) {
    flushTyping();
    const r = noRange ? null : range();
    if (!noRange && !r) return false;
    const refs = noRange ? null : saveRefs();
    const res = fn(r);
    if (res === false) return false;
    if (res !== true && !noRange) restoreRefs(refs);
    const p = noRange ? null : selPos();
    tidyInline();
    if (nonCanonical()) repair();
    if (p) setSelPos(p);
    record(); changed(); syncState();
    log('writer.command', { command: name }, 'ok');
    return true;
  }

  /* ---------- 文字の飾り ---------- */
  // 選択がないときは、ゼロ幅の空白を目印に置き、その中へ打てるようにする（かな漢字変換でも続けて打てる）
  function caretFormat(r, tag) {
    const a = within(r.startContainer, tag), z = document.createTextNode('\u200B');
    if (a) {
      const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(a, a.childNodes.length);
      const f = tail.extractContents();
      a.after(z);
      if (hasContent(f)) { const c = a.cloneNode(false); c.append(f); z.after(c); }
    } else { const el = document.createElement(tag); el.append(z); r.insertNode(el); }
    getSelection().collapse(z, 1);
    return true;
  }
  const FMT_NAME = { strong: '太字', em: '斜体', u: '下線', s: '取り消し線', code: '等幅の文字' };
  function toggleInline(tag) {
    let on = true;
    const done = edit(tag, (r) => {
      if (r.collapsed) { on = !within(r.startContainer, tag); return caretFormat(r, tag); }
      const texts = textsIn(r);
      if (!texts.length) return false;
      on = !texts.every((t) => within(t, tag));
      for (const t of texts) {
        if (on) { if (!within(t, tag)) wrapText(t, tag); }
        else { let a; while ((a = within(t, tag))) { isolate(a, t); unwrap(a); } }
      }
      selectNodes(texts[0], texts[texts.length - 1]);
      return true;
    });
    if (done) say(`${FMT_NAME[tag]}を${on ? '付けました' : '外しました'}。`);
  }
  // 色（span の color）と蛍光ペン（mark の background-color）
  const styledOf = (t, kind) => { for (let el = t.parentElement; el && el !== page && !TB_SET.has(el.localName); el = el.parentElement) if (kind === 'mark' ? el.localName === 'mark' : el.localName === 'span' && el.style.color) return el; return null; };
  function setColor(kind, value) {
    const tag = kind === 'mark' ? 'mark' : 'span', prop = kind === 'mark' ? 'background-color' : 'color';
    const done = edit(kind, (r) => {
      if (r.collapsed) {
        if (!value) return false;
        const el = document.createElement(tag), z = document.createTextNode('\u200B');
        el.style.setProperty(prop, value); el.append(z); r.insertNode(el); getSelection().collapse(z, 1);
        return true;
      }
      const texts = textsIn(r);
      if (!texts.length) return false;
      for (const t of texts) {
        const a = styledOf(t, kind);
        if (a) {
          isolate(a, t);
          if (value) a.style.setProperty(prop, value);
          else if (kind === 'mark') unwrap(a);
          else { a.style.removeProperty('color'); if (!a.style.length) unwrap(a); }
        } else if (value) wrapText(t, tag, prop, value);
      }
      selectNodes(texts[0], texts[texts.length - 1]);
      return true;
    });
    if (done) say(kind === 'mark' ? (value ? '蛍光ペンをぬりました。' : '蛍光ペンを消しました。') : (value ? '文字の色を変えました。' : '文字の色を元に戻しました。'));
  }
  function clearFormat() {
    const done = edit('clear', (r) => {
      if (r.collapsed) return false;
      const texts = textsIn(r);
      if (!texts.length) return false;
      for (const t of texts) {
        for (let a = t.parentElement; a && a !== page && !TB_SET.has(a.localName); a = t.parentElement) {
          if (!INLINE_FMT.has(a.localName)) break;
          isolate(a, t); unwrap(a);
        }
      }
      selectNodes(texts[0], texts[texts.length - 1]);
      return true;
    });
    if (done) say('書式を消しました。'); else { sound.play('error'); say('先に、書式を消す文字を選んでください。'); }
  }

  /* ---------- 段落 ---------- */
  function retag(el, tag) {
    const n = document.createElement(tag), al = el.style.textAlign;
    if (al && tag !== 'pre') n.style.textAlign = al;
    n.append(...el.childNodes);
    if (!n.firstChild) n.append(document.createElement('br'));
    el.replaceWith(n);
    return n;
  }
  // 列の項目を、列の外の段落にする（前と後ろの項目は別の列に分ける）
  function liftLi(li) {
    const list = li.parentElement;
    isolate(list, li);
    const p = document.createElement('p'), al = li.style.textAlign;
    if (al) p.style.textAlign = al;
    const nested = [...li.children].filter((c) => c.localName === 'ul' || c.localName === 'ol');
    p.append(...[...li.childNodes].filter((c) => !nested.includes(c)));
    if (!p.firstChild) p.append(document.createElement('br'));
    list.replaceWith(p, ...nested);
    return p;
  }
  function liftQuote(b) { const qt = b.parentElement?.closest('blockquote'); if (qt && qt !== b && page.contains(qt)) { isolate(qt, b); unwrap(qt); } }
  function setBlock(tag) {
    edit('block-' + tag, (r) => {
      const blocks = blocksIn(r).filter((b) => b.localName !== 'td' && b.localName !== 'th');
      if (!blocks.length) return false;
      for (let b of blocks) {
        if (b.localName === 'li') { if (tag === 'p') continue; b = liftLi(b); }
        if (tag === 'blockquote' && b.parentElement.closest('blockquote')) continue;
        liftQuote(b);
        if (b.localName !== tag) retag(b, tag);
      }
    });
    blockSel.value = tag;
    say(`段落を「${BLOCK_TYPES.find((t) => t[0] === tag)[1]}」にしました。`);
  }
  function align(v) {
    edit('align-' + v, (r) => {
      const bs = blocksIn(r);
      if (!bs.length) return false;
      for (const b of bs) { if (v === 'left') b.style.removeProperty('text-align'); else b.style.textAlign = v; if (!b.style.length) b.removeAttribute('style'); }
    });
  }
  function mergeLists() { for (const l of [...page.querySelectorAll('ul + ul, ol + ol')]) { const prev = l.previousElementSibling; if (prev && prev.localName === l.localName && prev.parentNode === l.parentNode) { prev.append(...l.childNodes); l.remove(); } } }
  function toggleList(type) {
    edit('list-' + type, (r) => {
      const blocks = blocksIn(r).filter((b) => !b.closest('td, th'));
      if (!blocks.length) return false;
      if (blocks.every((b) => b.localName === 'li' && b.parentElement.localName === type)) { for (const b of blocks) liftLi(b); return; }
      let list = null;
      for (const b of blocks) {
        if (b.localName === 'li') {
          const l = b.parentElement;
          if (l.localName !== type) { const n = document.createElement(type); n.append(...l.childNodes); l.replaceWith(n); list = n; } else list = l;
          continue;
        }
        liftQuote(b);
        const li = document.createElement('li'), al = b.style.textAlign;
        if (al) li.style.textAlign = al;
        li.append(...b.childNodes);
        if (!li.firstChild) li.append(document.createElement('br'));
        const prev = b.previousElementSibling;
        if (list && list.nextElementSibling === b) { list.append(li); b.remove(); }
        else if (prev && prev.localName === type) { prev.append(li); b.remove(); list = prev; }
        else { const n = document.createElement(type); n.append(li); b.replaceWith(n); list = n; }
      }
      mergeLists();
    });
  }

  /* ---------- 挿入 ---------- */
  function insertAfterTop(r, node) {
    const top = topOf(r.endContainer);
    if (top && isEmptyBlock(top) && top.localName === 'p') top.replaceWith(node);
    else if (top) top.after(node);
    else page.append(node);
    let next = node.nextElementSibling;
    if (!next || !LEAF.has(next.localName)) { next = emptyP(); node.after(next); }
    return next;
  }
  function insertHr() {
    edit('hr', (r) => { const next = insertAfterTop(r, document.createElement('hr')); caretAt(next, true); return true; });
    say('区切り線を入れました。');
  }
  function insertTable(rows, cols) {
    edit('table', (r) => {
      const t = document.createElement('table'), body = t.createTBody();
      for (let i = 0; i < rows; i++) { const tr = body.insertRow(); for (let j = 0; j < cols; j++) tr.insertCell().append(document.createElement('br')); }
      insertAfterTop(r, t);
      caretAt(body.rows[0].cells[0], true);
      return true;
    });
    say(`${rows} 行 ${cols} 列の表を入れました。表の中で Tab を押すと、次のマスへ移ります。`);
    log('writer.table', { rows, cols }, 'ok');
  }
  function insertText(s) {
    edit('text', (r) => {
      r.deleteContents();
      const t = document.createTextNode(s);
      r.insertNode(t);
      const c = document.createRange(); c.setStartAfter(t); c.collapse(true);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(c);
      return true;
    });
  }
  // 表の操作。cell はカーソルのあるマス
  function tableOp(op, { firstCell = false } = {}) {
    edit('table-' + op, (r) => {
      const cell = within(r.startContainer, 'td, th');
      if (!cell) { say('表の中にカーソルを置いてから選んでください。'); sound.play('error'); return false; }
      const tr = cell.parentElement, table = cell.closest('table'), rows = [...table.rows], col = cell.cellIndex;
      const newCell = () => { const td = document.createElement('td'); td.append(document.createElement('br')); return td; };
      const delTable = () => { let next = table.nextElementSibling; if (!next || !LEAF.has(next.localName)) { next = emptyP(); table.after(next); } table.remove(); caretAt(next, true); return true; };
      if (op === 'rowAbove' || op === 'rowBelow') {
        const n = document.createElement('tr');
        for (let i = 0; i < tr.cells.length; i++) n.append(newCell());
        if (op === 'rowAbove') tr.before(n); else tr.after(n);
        caretAt(n.cells[firstCell ? 0 : Math.min(col, n.cells.length - 1)], true);
      } else if (op === 'colLeft' || op === 'colRight') {
        for (const row of rows) { const ref = row.cells[Math.min(col, row.cells.length - 1)], c = newCell(); if (!ref) row.append(c); else if (op === 'colLeft') ref.before(c); else ref.after(c); }
        caretAt(tr.cells[op === 'colLeft' ? col : col + 1], true);
      } else if (op === 'delRow') {
        if (rows.length <= 1) return delTable();
        const i = rows.indexOf(tr); tr.remove();
        const to = rows[i + 1] || rows[i - 1];
        caretAt(to.cells[Math.min(col, to.cells.length - 1)], true);
      } else if (op === 'delCol') {
        if (Math.max(...rows.map((x) => x.cells.length)) <= 1) return delTable();
        for (const row of rows) row.cells[col]?.remove();
        caretAt(tr.cells[Math.min(col, tr.cells.length - 1)], true);
      } else if (op === 'delTable') return delTable();
      return true;
    });
  }
  // 表の中の Tab: 次（Shift で前）のマスへ。最後のマスでは行を足す
  function tabCell(back) {
    const s = getSelection();
    const cell = s.rangeCount && within(s.getRangeAt(0).startContainer, 'td, th');
    if (!cell) return false;
    const cells = [...cell.closest('table').querySelectorAll('td, th')], i = cells.indexOf(cell) + (back ? -1 : 1);
    if (i < 0) return true;
    if (i >= cells.length) { tableOp('rowBelow', { firstCell: true }); return true; }
    caretAt(cells[i], false);
    return true;
  }

  /* ---------- 画像 ---------- */
  let picked = null;
  const zoomNow = () => (prefs.zoom === 'fit' ? fitZoom() : +prefs.zoom || 1);
  const maxImgW = () => (settings.writing === 'vertical' ? 900 : Math.floor(COLUMN_W));
  async function insertImageBlob(raw, name, from) {
    try {
      if (raw.size > IMG_MAX) throw new Error(`画像が大きすぎます（${fs.human(raw.size)}）。8 MB までの画像を選んでください。`);
      const type = IMG_TYPES[extname(name).toLowerCase()] || raw.type;
      if (!/^image\/(png|jpeg|gif|webp|svg\+xml|bmp)$/.test(type)) throw new Error('この形の画像は入れられません（PNG・JPEG・GIF・WebP・SVG・BMP が入れられます）。');
      const blob = new Blob([raw], { type });
      const dataURL = await blobToDataUrl(blob);
      const url = registerBlob(blob, dataURL);
      const probe = new Image(); probe.src = url;
      await probe.decode().catch(() => {});
      const w = Math.max(16, Math.min(probe.naturalWidth || 320, maxImgW()));
      edit('image', (r) => {
        const img = document.createElement('img');
        img.src = url; img.alt = name.replace(/\.[^.]+$/, ''); img.style.width = Math.round(w) + 'px';
        if (within(r.startContainer, 'td, th, li')) { r.deleteContents(); r.insertNode(img); }
        else { const p = document.createElement('p'); p.append(img); insertAfterTop(r, p); }
        const c = document.createRange(); c.setStartAfter(img); c.collapse(true);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(c);
        pickImg(img);
        return true;
      });
      say(`画像「${name}」を入れました。画像を押すと出る右下のつまみで、大きさを変えられます。`);
      log('writer.image', { from, name, size: raw.size, width: Math.round(w) }, 'ok');
    } catch (e) {
      log('writer.image', { from, name }, 'error: ' + e.message);
      os.msgbox({ title: '文書', text: `画像を入れられませんでした。\n\n${e.message}`, icon: 'error' });
    }
  }
  async function insertImagePath(p) {
    try { await insertImageBlob(await fs.readBlob(p), basename(p), p); }
    catch (e) { log('writer.image', { path: p }, 'error: ' + e.message); os.msgbox({ title: '文書', text: `画像を読めませんでした。\n\n${e.message}`, icon: 'error' }); }
  }
  async function pickImage() {
    const p = await os.fileDialog({ mode: 'open', title: '画像を入れる', dir: '/画像', exts: Object.keys(IMG_TYPES), typeLabel: '画像' });
    if (p) await insertImagePath(p);
  }
  function pickImg(img) { picked = img && page.contains(img) ? img : null; updateImageBox(); }
  function updateImageBox() {
    if (!picked || !page.contains(picked)) { picked = null; imgBox.hidden = true; return; }
    const sr = stage.getBoundingClientRect(), ir = picked.getBoundingClientRect();
    imgBox.hidden = false;
    Object.assign(imgBox.style, { left: ir.left - sr.left + 'px', top: ir.top - sr.top + 'px', width: ir.width + 'px', height: ir.height + 'px' });
  }
  function setImageWidth(img, w, how) {
    img.style.width = Math.round(Math.max(16, Math.min(maxImgW(), w))) + 'px';
    updateImageBox();
    if (how) { record(); changed(); say(`画像の幅を ${parseInt(img.style.width, 10)} px にしました。`); log('writer.imageSize', { width: img.style.width, how }, 'ok'); }
  }
  // つまみのドラッグ。つまみは本文の外の重ねた層にあり、動かす間に位置を合わせ直すので、動きは文書全体で受ける
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !picked) return;
    e.preventDefault();
    flushTyping();
    const img = picked, x0 = e.clientX, w0 = img.getBoundingClientRect().width / zoomNow(), id = e.pointerId;
    let moved = false;
    handle.classList.add('dragging');
    const mv = (ev) => { if (ev.pointerId !== id) return; moved = true; setImageWidth(img, w0 + (ev.clientX - x0) / zoomNow()); };
    const end = (ev) => {
      if (ev.pointerId !== id) return;
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end);
      handle.classList.remove('dragging');
      if (moved) setImageWidth(img, parseFloat(img.style.width), 'drag');
    };
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  });
  handle.addEventListener('keydown', (e) => {
    if (!picked) return;
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (d) { e.preventDefault(); flushTyping(); setImageWidth(picked, parseFloat(picked.style.width || picked.getBoundingClientRect().width / zoomNow()) + d * (e.shiftKey ? 1 : 10), 'key'); }
    else if (e.key === 'Escape') { e.preventDefault(); page.focus(); pickImg(null); }
  });
  async function imageSizeDialog() {
    const s = getSelection();
    let img = picked;
    if (!img && s.rangeCount) { const r = s.getRangeAt(0); const n = r.startContainer.childNodes?.[r.startOffset] || r.startContainer.childNodes?.[r.startOffset - 1]; if (n?.localName === 'img') img = n; }
    if (!img) { sound.play('error'); say('先に、本文の中の画像を押して選んでください。'); return; }
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog'; dlg.style.width = '340px'; dlg.setAttribute('aria-label', '画像の大きさ');
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">画像の大きさ</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div>
      <div class="window-body"><div class="form" style="grid-template-columns:auto 1fr"><label for="wrImgW">幅（px）(<u>W</u>):</label><input type="number" id="wrImgW" min="16" max="${maxImgW()}" step="1"></div>
      <p class="wr-note">紙の文字の幅は ${Math.floor(COLUMN_W)} px です。高さは、元の画像の縦と横の割合で決まります。</p>
      <div class="button-row"><button type="button" class="default" data-close="ok">OK</button><button type="button" data-close="">キャンセル</button></div></div>`;
    document.body.append(dlg);
    const inp = dlg.querySelector('#wrImgW');
    inp.value = Math.round(parseFloat(img.style.width) || img.getBoundingClientRect().width / zoomNow());
    inp.setAttribute('autofocus', '');
    const r = await w95.openDialog(dlg);
    const v = +inp.value;
    dlg.remove();
    if (r !== 'ok' || !Number.isFinite(v)) return;
    flushTyping();
    setImageWidth(img, v, 'dialog');
  }

  /* ---------- 貼り付けと、落としたもの ---------- */
  function textToHtml(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    return lines.length === 1 ? W.escapeHtml(lines[0]) : lines.map((l) => (l ? `<p>${W.escapeHtml(l)}</p>` : '<p><br></p>')).join('');
  }
  // 消毒した節の集まりを、カーソルの所に入れる。段落が 1 つなら文の中へ、いくつもあれば今の段落をそこで分けて間に入れる
  function insertFragment(r, frag) {
    r.deleteContents();
    const kids = [...frag.childNodes];
    if (!kids.length) return true;
    const host = blockOf(r.startContainer);
    const one = kids.length === 1 && kids[0].localName === 'p';
    let last;
    if (!host) {
      // 塊の外（表や列の骨組みの中など）にカーソルがあるときは、その一番外の塊の後ろへ段落のまま入れる
      const top = topOf(r.startContainer);
      if (top) { r.setStartAfter(top); r.collapse(true); }
      r.insertNode(frag);
      caretAt(kids[kids.length - 1], false);
      return true;
    } else if (one || ['td', 'th', 'li', 'pre'].includes(host.localName)) {
      const inl = document.createDocumentFragment();
      kids.forEach((k, i) => {
        if (i) inl.append(document.createElement('br'));
        if (LEAF.has(k.localName)) inl.append(...k.childNodes); else inl.append(document.createTextNode(k.textContent));
      });
      last = inl.lastChild;
      if (!last) return true;
      r.insertNode(inl);
    } else {
      const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(host, host.childNodes.length);
      const rest = tail.extractContents();
      let at = host;
      for (const k of kids) { at.after(k); at = k; }
      if (rest.textContent.replace(/\u200B/g, '') || rest.querySelector('img')) { const c = host.cloneNode(false); c.append(rest); at.after(c); }
      if (isEmptyBlock(host)) host.remove(); else if (!host.firstChild) host.append(document.createElement('br'));
      last = at.lastChild || at;
    }
    const c = document.createRange();
    if (last.nodeType === 3) c.setStart(last, last.length); else c.setStartAfter(last);
    c.collapse(true);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(c);
    return true;
  }
  function pasteContent(html, text, how) {
    const clean = W.sanitize(html || textToHtml(text || ''), { imageSrc });
    edit('paste', (r) => insertFragment(r, parseClean(clean)));
    log('writer.paste', { how, html: !!html, size: (html || text || '').length }, 'ok');
  }
  page.addEventListener('paste', (e) => {
    e.preventDefault();
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { for (const f of files) insertImageBlob(f, f.name || '貼り付けた画像.png', 'paste'); return; }
    pasteContent(e.clipboardData.getData('text/html'), e.clipboardData.getData('text/plain'), 'paste');
  });
  // コピーと切り取りは、消毒した HTML（画像は data:）と文字を渡す
  function clipData() {
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed || !page.contains(s.getRangeAt(0).commonAncestorContainer)) return null;
    const div = document.createElement('div');
    div.append(s.getRangeAt(0).cloneContents());
    return { html: W.sanitize(docHtml(div.innerHTML)), text: s.toString().replace(/\u200B/g, '') };
  }
  function onCopy(e, cut) {
    const d = clipData();
    if (!d) return;
    e.preventDefault();
    e.clipboardData.setData('text/html', d.html); e.clipboardData.setData('text/plain', d.text);
    if (cut) edit('cut', (r) => { r.deleteContents(); return true; });
  }
  page.addEventListener('copy', (e) => onCopy(e, false));
  page.addEventListener('cut', (e) => onCopy(e, true));
  async function clipMenu(cut) {
    range();
    const d = clipData();
    if (!d) { sound.play('error'); say('先に文字を選んでください。'); return; }
    try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([d.html], { type: 'text/html' }), 'text/plain': new Blob([d.text], { type: 'text/plain' }) })]); }
    catch (e) {
      try { await navigator.clipboard.writeText(d.text); } catch (e2) { log('clipboard.write', {}, 'error: ' + e2.message); os.msgbox({ title: '文書', text: 'クリップボードに書けませんでした。\n\nCtrl+C を使ってください。', icon: 'info' }); return; }
    }
    if (cut) edit('cut', (r) => { r.deleteContents(); return true; });
    say(cut ? '切り取りました。' : 'コピーしました。');
  }
  async function pasteMenu() {
    try {
      let html = '', text = '';
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
        else if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
        const img = item.types.find((t) => t.startsWith('image/'));
        if (img && !html && !text) { await insertImageBlob(await item.getType(img), '貼り付けた画像.png', 'paste'); return; }
      }
      pasteContent(html, text, 'menu');
    } catch (e) {
      log('clipboard.read', {}, 'error: ' + e.message);
      os.msgbox({ title: '文書', text: 'クリップボードを読めませんでした。\n\nCtrl+V で貼り付けてください。', icon: 'info' });
    }
  }
  let dragInside = false;
  page.addEventListener('dragstart', () => { dragInside = true; });
  page.addEventListener('dragend', () => { dragInside = false; });
  page.addEventListener('drop', (e) => {
    if (dragInside) return; // 文書の中での移動はブラウザに任せ、あとで整える
    e.preventDefault();
    const pt = document.caretPositionFromPoint?.(e.clientX, e.clientY);
    if (pt && page.contains(pt.offsetNode)) { page.focus({ preventScroll: true }); getSelection().collapse(pt.offsetNode, pt.offset); }
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || IMG_TYPES[extname(f.name).toLowerCase()]);
    if (files.length) { for (const f of files) insertImageBlob(f, f.name, 'drop'); return; }
    pasteContent(e.dataTransfer.getData('text/html'), e.dataTransfer.getData('text/plain'), 'drop');
  });
  // デスクトップやファイル マネージャから落としたファイル: 画像なら入れる、ほかはそのファイルを開く
  win.body.addEventListener('fos:drop-file', (e) => { const p = e.detail.path; if (IMG_TYPES[extname(p).toLowerCase()]) insertImagePath(p); else os.openFile(p); });

  /* ---------- 打つ・選ぶ ---------- */
  page.addEventListener('beforeinput', (e) => {
    const t = e.inputType;
    if (t === 'historyUndo') { e.preventDefault(); undo(); }
    else if (t === 'historyRedo') { e.preventDefault(); redo(); }
    else if (t.startsWith('format')) e.preventDefault(); // 書式はこのアプリの命令で変える
  });
  page.addEventListener('input', () => { if (!composing) { fixZwsp(); quickFix(); } typed(); });
  page.addEventListener('compositionstart', () => { composing = true; });
  page.addEventListener('compositionend', () => { composing = false; setTimeout(() => { fixZwsp(); quickFix(); typed(); }, 0); });
  // 打つのを止めて 0.7 秒で、元に戻すための記録を 1 つ残す
  function typed() {
    pendingTyping = true;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { if (composing) { typed(); return; } flushTyping(); }, 700);
    changed();
  }
  page.addEventListener('click', (e) => { pickImg(e.target.localName === 'img' && page.contains(e.target) ? e.target : null); });
  page.addEventListener('dblclick', (e) => { if (e.target.localName === 'img') { pickImg(e.target); imageSizeDialog(); } });
  scroller.addEventListener('scroll', updateImageBox, { passive: true });
  page.addEventListener('load', updateImageBox, true); // 画像を読み終えて大きさが決まったら、つまみの位置を合わせ直す
  // 紙の余白（ページの外の机）を押したら、本文の最後へ
  scroller.addEventListener('mousedown', (e) => { if (e.target === scroller) { e.preventDefault(); page.focus({ preventScroll: true }); caretAt(page.lastElementChild || page, false); } });

  /* ---------- 変わったときの後始末（題名・文字数・自動保存・検索の印） ---------- */
  let saveTimer = 0, countTimer = 0, findTimer = 0;
  const updateTitle = () => win.setTitle(`${dirty ? '*' : ''}${path ? basename(path) : '無題'} - 文書`);
  function changed() {
    if (!dirty) { dirty = true; updateTitle(); }
    clearTimeout(countTimer); countTimer = setTimeout(updateCount, 200);
    clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 1000);
    if (findOpen) { clearTimeout(findTimer); findTimer = setTimeout(() => runFind(true), 250); }
    updateImageBox();
  }
  function updateCount() {
    const c = W.countText(W.blockTexts(page.innerHTML.replace(/\u200B/g, '')));
    const f = (n) => n.toLocaleString('ja-JP');
    set('[data-count]', `${f(c.chars)} 文字（空白を除く ${f(c.noSpace)}）`);
    set('[data-paras]', `段落 ${f(c.paragraphs)}`);
  }
  async function autosave() {
    if (path) { await save(); return; }
    try { const t = docText(); localStorage.setItem(draftKey, t); set('[data-saved]', '下書きを残しました ' + time()); log('writer.draft', { draftKey, size: t.length }, 'ok'); }
    catch (e) { set('[data-saved]', '下書きを残せませんでした'); log('writer.draft', { draftKey }, 'error: ' + e.message); }
  }

  /* ---------- 保存・開く・書き出し・印刷 ---------- */
  const firstLine = () => (page.querySelector('h1, h2, h3, p')?.textContent || '').replace(/[\u200B\s/\\:*?"<>|]+/g, ' ').trim().slice(0, 24);
  const baseName = () => (path ? basename(path).replace(/\.fdoc$/i, '') : firstLine() || '無題');
  async function save() {
    if (!path) return saveAs();
    clearTimeout(saveTimer);
    flushTyping();
    try {
      const t = docText();
      await fs.write(path, t, 'application/json');
      dirty = false; updateTitle();
      set('[data-saved]', '保存しました ' + time());
      os.addRecent(path);
      log('writer.save', { path, size: t.length }, 'ok');
      return true;
    } catch (e) {
      log('writer.save', { path }, 'error: ' + e.message);
      os.msgbox({ title: '文書', text: `保存できませんでした。\n\n${e.message}`, icon: 'error' });
      return false;
    }
  }
  async function saveAs() {
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/ドキュメント', name: baseName() + '.fdoc', exts: ['.fdoc'], typeLabel: '文書' });
    if (!p) return false;
    path = p; win.setArgs({ path, draftKey: undefined });
    try { localStorage.removeItem(draftKey); } catch { /* 消せない */ }
    return save();
  }
  async function openDoc() {
    const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/ドキュメント', exts: ['.fdoc'], typeLabel: '文書' });
    if (p) os.openFile(p, 'writer');
  }
  function contentOf(kind) {
    flushTyping();
    const h = docHtml();
    return kind === 'fdoc' ? W.makeFdoc({ html: h, settings }) : kind === 'html' ? W.buildHtml({ title: baseName(), html: h, settings }) : kind === 'md' ? W.toMarkdown(h) : W.toText(h);
  }
  async function exportDrive(kind) {
    const [ext, label, type] = KINDS[kind];
    const p = await os.fileDialog({ mode: 'save', title: `${label}として書き出す`, dir: path ? dirname(path) : '/ドキュメント', name: baseName() + ext, exts: [ext], typeLabel: label });
    if (!p) return;
    try { await fs.write(p, contentOf(kind), type); say(`「${basename(p)}」に書き出しました。`); log('writer.export', { kind, path: p }, 'ok'); }
    catch (e) { log('writer.export', { kind, path: p }, 'error: ' + e.message); os.msgbox({ title: '文書', text: `書き出せませんでした。\n\n${e.message}`, icon: 'error' }); }
  }
  function exportPc(kind) {
    const [ext, , type] = KINDS[kind];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([contentOf(kind)], { type }));
    a.download = baseName() + ext; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(`パソコンへ「${a.download}」を書き出しました。`);
    log('writer.download', { kind, name: a.download }, 'ok');
  }
  // 印刷: 書き出しと同じ HTML（印刷用の CSS 付き）を、見えない iframe（スクリプトは動かさない）に入れて印刷する
  function print() {
    const f = document.createElement('iframe');
    f.className = 'wr-print';
    f.setAttribute('sandbox', 'allow-same-origin allow-modals');
    f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;visibility:hidden';
    f.srcdoc = contentOf('html');
    f.addEventListener('load', () => {
      try { f.contentWindow.focus(); f.contentWindow.print(); say('印刷の画面を開きました。'); log('writer.print', { title: baseName(), writing: settings.writing }, 'ok'); }
      catch (e) { log('writer.print', {}, 'error: ' + e.message); os.msgbox({ title: '文書', text: `印刷できませんでした。\n\n${e.message}`, icon: 'error' }); }
      setTimeout(() => f.remove(), 2000);
    }, { once: true });
    document.body.append(f);
  }

  /* ---------- 設定（文書と一緒に保存）と表示（このパソコンだけ） ---------- */
  function fitZoom() { const avail = scroller.clientWidth - 40; return Math.max(0.4, Math.min(1.5, avail / PAPER_W)); }
  function applyZoom() {
    page.style.zoom = String(Math.round(zoomNow() * 1000) / 1000);
    for (const it of win.body.querySelectorAll('[data-radio="zoom"]')) it.classList.toggle('checked', it.dataset.v === String(prefs.zoom));
    updateImageBox();
  }
  function setZoom(z) { prefs.zoom = z; savePrefs(prefs); applyZoom(); say(z === 'fit' ? '紙の幅を窓に合わせました。' : `拡大率を ${z * 100}% にしました。`); }
  function applySettings() {
    page.style.setProperty('--wr-fs', settings.fontSize + 'pt');
    page.style.setProperty('--wr-lh', String(settings.lineHeight));
    const v = settings.writing === 'vertical';
    scroller.dataset.writing = settings.writing;
    q('[data-cmd="vertical"]').setAttribute('aria-pressed', String(v));
    q('[data-command="vertical"]').classList.toggle('checked', v);
    for (const it of win.body.querySelectorAll('[data-radio="fs"]')) it.classList.toggle('checked', +it.dataset.v === settings.fontSize);
    for (const it of win.body.querySelectorAll('[data-radio="lh"]')) it.classList.toggle('checked', +it.dataset.v === settings.lineHeight);
    set('[data-mode]', `A4・${v ? '縦書き' : '横書き'}・${settings.fontSize}pt`);
    applyZoom();
  }
  function setSetting(patch) {
    flushTyping();
    settings = W.normalizeSettings({ ...settings, ...patch });
    applySettings();
    if ('writing' in patch) { scroller.scrollTo({ left: 0, top: 0 }); say(settings.writing === 'vertical' ? '縦書きにしました。右上から下へ、右から左へ書き進みます。' : '横書きにしました。'); }
    changed();
    log('writer.settings', patch, 'ok');
  }
  const ro = new ResizeObserver(() => { if (prefs.zoom === 'fit') applyZoom(); else updateImageBox(); });
  ro.observe(scroller);

  /* ---------- 道具の帯とメニューの印 ---------- */
  let stateRaf = 0;
  function syncState() {
    cancelAnimationFrame(stateRaf);
    stateRaf = requestAnimationFrame(() => {
      const s = getSelection();
      if (!s.rangeCount || !page.contains(s.focusNode)) return;
      const n = s.focusNode;
      const press = (cmd, on) => q(`[data-cmd="${cmd}"]`)?.setAttribute('aria-pressed', String(!!on));
      press('bold', within(n, 'strong')); press('italic', within(n, 'em')); press('underline', within(n, 'u')); press('strike', within(n, 's'));
      const b = blockOf(n), tag = b && LEAF.has(b.localName) ? b.localName : 'p';
      if (document.activeElement !== blockSel) blockSel.value = tag;
      const al = b?.style.textAlign || 'left';
      press('a-left', !['center', 'right', 'end'].includes(al)); press('a-center', al === 'center'); press('a-right', al === 'right' || al === 'end');
      press('ul', within(n, 'ul')); press('ol', within(n, 'ol'));
      const inTable = !!within(n, 'td, th');
      for (const it of win.body.querySelectorAll('[data-command^="t-"]')) it.setAttribute('aria-disabled', String(!inTable));
    });
  }
  // 道具の帯: 押しても本文の選択が消えないように、押したときに焦点を移さない
  tools.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  tools.addEventListener('click', (e) => { const b = e.target.closest('button[data-cmd]'); if (b && b.getAttribute('aria-disabled') !== 'true') run(b.dataset.cmd); });
  // focusgroup が使えないブラウザでは、矢印キーで帯の中を移る（帯に入るのは Tab 1 回）
  if (!('focusGroup' in HTMLElement.prototype)) {
    const items = () => [...tools.querySelectorAll('button, input')];
    items().forEach((b, i) => { b.tabIndex = i ? -1 : 0; });
    tools.addEventListener('focusin', ({ target }) => { const it = items(); if (it.includes(target)) it.forEach((b) => { b.tabIndex = b === target ? 0 : -1; }); });
    tools.addEventListener('keydown', (e) => {
      const it = items(), i = it.indexOf(e.target);
      if (i < 0) return;
      const n = { ArrowRight: (i + 1) % it.length, ArrowLeft: (i - 1 + it.length) % it.length, Home: 0, End: it.length - 1 }[e.key];
      if (n === undefined) return;
      e.preventDefault(); it[n].focus();
    });
  }
  const pick = (k) => q(`[data-pick="${k}"]`);
  const syncSwatches = () => { q('[data-swatch="fg"]').style.background = pick('fg').value; q('[data-swatch="hl"]').style.background = pick('hl').value; };
  for (const k of ['fg', 'hl']) {
    pick(k).addEventListener('input', syncSwatches);
    pick(k).addEventListener('change', () => { syncSwatches(); setColor(k === 'hl' ? 'mark' : 'color', pick(k).value); });
  }
  function pickColor(k) { const inp = pick(k); try { inp.showPicker(); } catch { inp.click(); } }
  blockSel.addEventListener('change', () => setBlock(blockSel.value));

  /* ---------- 表と画像の大きさの箱 ---------- */
  async function tableDialog() {
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog'; dlg.style.width = '320px'; dlg.setAttribute('aria-label', '表を入れる');
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">表を入れる</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div>
      <div class="window-body"><div class="form" style="grid-template-columns:auto 1fr">
        <label for="wrRows">行の数(<u>R</u>):</label><input type="number" id="wrRows" min="1" max="40" value="3">
        <label for="wrCols">列の数(<u>C</u>):</label><input type="number" id="wrCols" min="1" max="12" value="3"></div>
        <p class="wr-note">行と列は、あとから「表」のメニューで足したり消したりできます。Markdown に書き出すと、1 行目が見出しの行になります。</p>
        <div class="button-row"><button type="button" class="default" data-close="ok">OK</button><button type="button" data-close="">キャンセル</button></div></div>`;
    document.body.append(dlg);
    dlg.querySelector('#wrRows').setAttribute('autofocus', '');
    const r = await w95.openDialog(dlg);
    const rows = Math.max(1, Math.min(40, Math.round(+dlg.querySelector('#wrRows').value) || 3)), cols = Math.max(1, Math.min(12, Math.round(+dlg.querySelector('#wrCols').value) || 3));
    dlg.remove();
    if (r === 'ok') insertTable(rows, cols);
  }

  /* ---------- 検索と置換 ---------- */
  const fbar = q('[data-findbar]'), fq = q('[data-fq]'), fr = q('[data-fr]'), fcase = q('[data-fcase]'), fcount = q('[data-fcount]');
  let findOpen = false, matches = [], cur = -1;
  function openFind(replace) {
    const s = getSelection();
    const selText = s.rangeCount && page.contains(s.anchorNode) && !s.isCollapsed ? s.toString().replace(/\u200B/g, '') : '';
    if (selText && selText.length < 100 && !selText.includes('\n')) fq.value = selText;
    fbar.hidden = false; findOpen = true;
    (replace && fq.value ? fr : fq).focus();
    if (!replace) fq.select();
    runFind();
    log('writer.find', { replace }, 'ok');
  }
  function clearMarks() { if (globalThis.CSS?.highlights) { CSS.highlights.delete('wr-find'); CSS.highlights.delete('wr-find-cur'); } }
  function closeFind() {
    const m = matches[cur];
    fbar.hidden = true; findOpen = false; clearMarks();
    page.focus({ preventScroll: true });
    if (m) { const s = getSelection(); s.removeAllRanges(); s.addRange(m.cloneRange()); }
    matches = []; cur = -1;
  }
  // 1 つの塊の中の文字の節（中の列や表は除く）を、つないだ文字と、節ごとの始まりの位置にする
  function blockText(b) {
    const map = [];
    let text = '';
    const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === 1 ? (n !== b && (TB_SET.has(n.localName) || /^(ul|ol|table)$/.test(n.localName)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = tw.nextNode(); n; n = tw.nextNode()) { map.push([n, text.length]); text += n.data; }
    return { map, text };
  }
  function rangeOf(map, s, e) {
    const at = (pos, end) => {
      for (const [n, start] of map) if (end ? pos > start && pos <= start + n.length : pos >= start && pos < start + n.length) return [n, pos - start];
      const [n, start] = map[map.length - 1];
      return [n, pos - start];
    };
    const r = document.createRange();
    r.setStart(...at(s, false)); r.setEnd(...at(e, true));
    return r;
  }
  function runFind(keep) {
    const query = fq.value;
    matches = [];
    if (query) {
      for (const b of page.querySelectorAll(TB)) {
        const { map, text } = blockText(b);
        if (!map.length) continue;
        for (const [s, e] of W.findAll(text, query, { caseSensitive: fcase.checked })) matches.push(rangeOf(map, s, e));
      }
    }
    if (!keep || cur >= matches.length) {
      cur = -1;
      if (matches.length) {
        cur = 0;
        if (savedRange) { const i = matches.findIndex((m) => m.compareBoundaryPoints(Range.START_TO_START, savedRange) >= 0); if (i >= 0) cur = i; }
      }
    }
    paintFind();
  }
  function paintFind(scroll = true) {
    if (globalThis.CSS?.highlights) {
      CSS.highlights.set('wr-find', new Highlight(...matches));
      const c = matches[cur];
      if (c) { const h = new Highlight(c); h.priority = 1; CSS.highlights.set('wr-find-cur', h); } else CSS.highlights.delete('wr-find-cur');
    }
    fcount.textContent = !fq.value ? '' : matches.length ? `${cur + 1} / ${matches.length} 件` : '見つかりません';
    const c = matches[cur];
    if (c && scroll) c.startContainer.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function findStep(dir) {
    if (!findOpen) { openFind(false); return; }
    if (!matches.length) { sound.play('error'); say(fq.value ? `「${fq.value}」は見つかりませんでした。` : '探す言葉を入れてください。'); return; }
    cur = (cur + dir + matches.length) % matches.length;
    paintFind();
    // 印を付けられないブラウザでは、見つかった所を選ぶ
    if (!globalThis.CSS?.highlights) { const s = getSelection(); s.removeAllRanges(); s.addRange(matches[cur].cloneRange()); }
  }
  function replaceOne() {
    const m = matches[cur];
    if (!m) { sound.play('error'); return; }
    edit('replace', () => { m.deleteContents(); m.insertNode(document.createTextNode(fr.value)); return true; }, { noRange: true });
    runFind(true);
    say('1 か所を置換しました。');
  }
  function replaceAll() {
    const n = matches.length;
    if (!n) { sound.play('error'); say(fq.value ? `「${fq.value}」は見つかりませんでした。` : '探す言葉を入れてください。'); return; }
    edit('replaceAll', () => { for (const m of [...matches].reverse()) { m.deleteContents(); m.insertNode(document.createTextNode(fr.value)); } return true; }, { noRange: true });
    runFind();
    say(`${n} か所を置換しました。`);
    log('writer.replaceAll', { count: n }, 'ok');
  }
  fq.addEventListener('input', () => runFind());
  fcase.addEventListener('change', () => runFind());
  fbar.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; ({ prev: () => findStep(-1), next: () => findStep(1), one: replaceOne, all: replaceAll, close: closeFind })[b.dataset.f](); });
  fbar.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); return; }
    if (e.key !== 'Enter' || e.target.localName !== 'input' || e.target.type === 'checkbox') return;
    e.preventDefault();
    if (e.isComposing || e.keyCode === 229) return; // かな漢字変換を決める Enter では動かない
    if (e.target === fr) replaceOne(); else findStep(e.shiftKey ? -1 : 1);
  });

  /* ---------- 命令 ---------- */
  function selectAll() { page.focus({ preventScroll: true }); const r = document.createRange(); r.selectNodeContents(page); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  const cmds = {
    new: () => os.launch('writer', { blank: true }),
    open: openDoc, save, saveas: saveAs,
    'x-html': () => exportDrive('html'), 'x-md': () => exportDrive('md'), 'x-txt': () => exportDrive('txt'),
    'd-fdoc': () => exportPc('fdoc'), 'd-html': () => exportPc('html'), 'd-md': () => exportPc('md'), 'd-txt': () => exportPc('txt'),
    print, close: () => win.close(),
    undo, redo, cut: () => clipMenu(true), copy: () => clipMenu(false), paste: pasteMenu, all: selectAll,
    find: () => openFind(false), next: () => findStep(1), replace: () => openFind(true),
    bold: () => toggleInline('strong'), italic: () => toggleInline('em'), underline: () => toggleInline('u'), strike: () => toggleInline('s'), code: () => toggleInline('code'),
    fg: () => setColor('color', pick('fg').value), hl: () => setColor('mark', pick('hl').value),
    'fg-none': () => setColor('color', null), 'hl-none': () => setColor('mark', null), 'fg-pick': () => pickColor('fg'), 'hl-pick': () => pickColor('hl'),
    clear: clearFormat,
    'a-left': () => align('left'), 'a-center': () => align('center'), 'a-right': () => align('right'),
    ul: () => toggleList('ul'), ol: () => toggleList('ol'),
    table: tableDialog, image: pickImage, imgsize: imageSizeDialog, hr: insertHr, date: () => insertText(new Date().toLocaleString('ja-JP')),
    vertical: () => setSetting({ writing: settings.writing === 'vertical' ? 'horizontal' : 'vertical' }),
    fs: (d) => setSetting({ fontSize: +d.item.dataset.v }), lh: (d) => setSetting({ lineHeight: +d.item.dataset.v }),
    zoom: (d) => setZoom(d.item.dataset.v === 'fit' ? 'fit' : +d.item.dataset.v),
    keys: () => os.msgbox({ title: 'キーボードの操作', icon: 'info', text: '書式: Ctrl+B 太字、Ctrl+I 斜体、Ctrl+U 下線、Ctrl+Shift+X 取り消し線\n段落: Ctrl+Alt+0 本文、Ctrl+Alt+1〜3 見出し\n揃え: Ctrl+Shift+L 左、Ctrl+Shift+E 中央、Ctrl+Shift+R 右\n列: Ctrl+Shift+8 箇条書き、Ctrl+Shift+7 番号付き\n表: Tab で次のマス、Shift+Tab で前のマス（最後のマスの Tab で行を足す）\n画像: 押すと出るつまみにフォーカスして、左右の矢印キーで幅を変える\nほか: Ctrl+Z 元に戻す、Ctrl+Y やり直し、Ctrl+F 検索、Ctrl+H 置換、F3 次を検索、Ctrl+S 保存、Ctrl+P 印刷、F5 日付と時刻' }),
    sample: () => os.launch('writer', { sample: true }),
    about: () => os.msgbox({ title: '文書について', icon: 'info', text: 'Future OS 文書 1.0\n\nA4 の紙の形のまま、見出し・表・画像の入った文書を書けます。縦書きにもできます。\n書くのを止めて 1 秒で自動で保存します。名前を付ける前の文書も、下書きとして残ります。\n.fdoc の形で保存し、HTML・Markdown・テキストへ書き出せます。' }),
  };
  const run = (c, d = {}) => {
    if (c.startsWith('fg:')) return setColor('color', c.slice(3));
    if (c.startsWith('hl:')) return setColor('mark', c.slice(3));
    if (c.startsWith('b-')) return setBlock(c.slice(2));
    if (c.startsWith('t-')) return tableOp(c.slice(2));
    return cmds[c]?.(d);
  };
  win.body.addEventListener('w95:command', (e) => run(e.detail.command, e.detail));
  win.body.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    const inPage = e.target === page || page.contains(e.target), k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, field = e.target.matches('input, select, textarea');
    const go = (fn) => { e.preventDefault(); fn(); };
    if (ctrl && e.altKey && inPage && /^Digit[0-3]$/.test(e.code)) return go(() => setBlock(['p', 'h1', 'h2', 'h3'][+e.code.slice(5)]));
    if (ctrl && !e.altKey) {
      if (k === 's' && !e.shiftKey) return go(save);
      if (k === 'o') return go(openDoc);
      if (k === 'p') return go(print);
      if (k === 'f') return go(() => openFind(false));
      if (k === 'h') return go(() => openFind(true));
      if (!field && k === 'z' && !e.shiftKey) return go(undo);
      if (!field && (k === 'y' || (k === 'z' && e.shiftKey))) return go(redo);
      if (inPage) {
        if (k === 'b' && !e.shiftKey) return go(() => toggleInline('strong'));
        if (k === 'i' && !e.shiftKey) return go(() => toggleInline('em'));
        if (k === 'u' && !e.shiftKey) return go(() => toggleInline('u'));
        if (e.shiftKey && k === 'x') return go(() => toggleInline('s'));
        if (e.shiftKey && e.code === 'Digit7') return go(() => toggleList('ol'));
        if (e.shiftKey && e.code === 'Digit8') return go(() => toggleList('ul'));
        if (e.shiftKey && k === 'l') return go(() => align('left'));
        if (e.shiftKey && k === 'e') return go(() => align('center'));
        if (e.shiftKey && k === 'r') return go(() => align('right'));
      }
    }
    if (e.key === 'F3') return go(() => findStep(e.shiftKey ? -1 : 1));
    if (e.key === 'F5' && !field) return go(() => insertText(new Date().toLocaleString('ja-JP')));
    if (e.key === 'Tab' && inPage && !ctrl && !e.altKey && tabCell(e.shiftKey)) e.preventDefault();
  });
  win.body.addEventListener('fos:resize', () => (prefs.zoom === 'fit' ? applyZoom() : updateImageBox()));

  win.cleanup = () => {
    document.removeEventListener('selectionchange', onSelChange);
    ro.disconnect();
    clearTimeout(saveTimer); clearTimeout(countTimer); clearTimeout(findTimer); clearTimeout(typingTimer);
    if (findOpen) clearMarks();
    for (const u of images.keys()) URL.revokeObjectURL(u);
  };

  /* ---------- 始める ---------- */
  page.replaceChildren(parseClean(W.sanitize(initial)));
  applySettings();
  syncSwatches();
  record();
  dirty = false;
  updateTitle(); updateCount();
  set('[data-saved]', path ? '保存済み' : '');
  say(intro ? '見本の文書です。文字を選び、上の帯で書式を変えます。' : '文字を打って書き始めます。書式は上の帯で変えます。');
  page.focus({ preventScroll: true });
  caretAt(page.querySelector(TB) || page, true);
  scroller.scrollTo({ left: 0, top: 0 });
  log('writer.launch', { path, intro, writing: settings.writing }, 'ok');
  return win;
}
