// メモ帳: 自動保存（名前のないメモは下書きとして残す）、検索と置換、行・列・文字数、右端で折り返す
import { basename, dirname } from '../core/path.mjs';

const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="new"><span class="label">新規(<u>N</u>)</span></div>
    <div class="menu-item" data-command="open" data-status="ファイルを開きます。"><span class="label">開く(<u>O</u>)...</span><span class="shortcut">Ctrl+O</span></div>
    <div class="menu-item" data-command="save" data-status="作業中の文書を保存します。"><span class="label">上書き保存(<u>S</u>)</span><span class="shortcut">Ctrl+S</span></div>
    <div class="menu-item" data-command="saveas"><span class="label">名前を付けて保存(<u>A</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="export" data-status="パソコンへファイルとして書き出します。"><span class="label">パソコンへ書き出す(<u>E</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>X</u>)</span></div>
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="undo"><span class="label">元に戻す(<u>U</u>)</span><span class="shortcut">Ctrl+Z</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="cut"><span class="label">切り取り(<u>T</u>)</span><span class="shortcut">Ctrl+X</span></div>
    <div class="menu-item" data-command="copy"><span class="label">コピー(<u>C</u>)</span><span class="shortcut">Ctrl+C</span></div>
    <div class="menu-item" data-command="paste"><span class="label">貼り付け(<u>P</u>)</span><span class="shortcut">Ctrl+V</span></div>
    <div class="menu-item" data-command="del"><span class="label">削除(<u>L</u>)</span><span class="shortcut">Del</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="find"><span class="label">検索(<u>F</u>)...</span><span class="shortcut">Ctrl+F</span></div>
    <div class="menu-item" data-command="next"><span class="label">次を検索(<u>N</u>)</span><span class="shortcut">F3</span></div>
    <div class="menu-item" data-command="replace"><span class="label">置換(<u>R</u>)...</span><span class="shortcut">Ctrl+H</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="all"><span class="label">すべて選択(<u>A</u>)</span><span class="shortcut">Ctrl+A</span></div>
    <div class="menu-item" data-command="date"><span class="label">日付と時刻(<u>D</u>)</span><span class="shortcut">F5</span></div>
  </div></div>
  <div class="menu-title">書式(<u>O</u>)<div class="menu" role="menu">
    <div class="menu-item checked" data-toggle="check" data-command="wrap"><span class="label">右端で折り返す(<u>W</u>)</span></div>
    <div class="menu-item" data-command="bigger"><span class="label">文字を大きく(<u>L</u>)</span></div>
    <div class="menu-item" data-command="smaller"><span class="label">文字を小さく(<u>S</u>)</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="about"><span class="label">メモ帳について(<u>A</u>)</span></div>
  </div></div>
</div>`;

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log } = os;
  let path = args.path || null, saved = '', fontPx = 14, timer = 0, lastFind = '';
  const draftKey = args.draftKey || 'fos-draft-' + Date.now().toString(36);
  let text = '';
  if (path) {
    try { text = await fs.readText(path); } catch (e) { os.msgbox({ title: 'メモ帳', text: e.message, icon: 'error' }); path = null; }
  } else { try { text = localStorage.getItem(draftKey) || ''; } catch { /* 読めない */ } }
  saved = path ? text : '';
  const title = () => `${dirty() ? '*' : ''}${path ? basename(path) : '無題'} - メモ帳`;
  const dirty = () => ta.value !== saved;
  let ta, st;
  const win = wm.open({
    app: 'notepad', icon: 'icons/notepad.svg', className: 'app-notepad', w: 560, h: 400, ...rect, args: path ? { path } : { draftKey },
    render(w) {
      w.body.innerHTML = MENU + '<textarea spellcheck="false" aria-label="本文"></textarea><div class="status-bar"><div class="status-field">ヘルプを表示するには [F1] を押してください。</div><div class="status-field" style="width:110px" data-pos></div><div class="status-field" style="width:90px" data-count></div><div class="status-field" style="width:150px" data-saved></div><div class="size-grip"></div></div>';
      ta = w.body.querySelector('textarea'); st = w.body.querySelector('.status-bar');
      ta.value = text;
    },
    onClose: async () => {
      clearTimeout(timer);
      if (path) { if (dirty()) await save(); return true; }
      if (!ta.value) { try { localStorage.removeItem(draftKey); } catch { /* 消せない */ } return true; }
      const a = await os.msgbox({ title: 'メモ帳', text: '無題のメモには、まだ名前が付いていません。\n\n保存しますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') return await saveAs();
      try { localStorage.removeItem(draftKey); } catch { /* 消せない */ }
      return true;
    },
  });
  const set = (sel, v) => { st.querySelector(sel).textContent = v; };
  function refresh() {
    win.setTitle(title());
    const before = ta.value.slice(0, ta.selectionStart), line = before.split('\n').length, col = before.length - before.lastIndexOf('\n');
    set('[data-pos]', `${line} 行、${col} 列`);
    set('[data-count]', `${[...ta.value].length} 文字`);
  }
  async function save() {
    if (!path) return saveAs();
    try { await fs.write(path, ta.value); saved = ta.value; set('[data-saved]', '保存しました ' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })); os.addRecent(path); refresh(); return true; }
    catch (e) { os.msgbox({ title: 'メモ帳', text: e.message, icon: 'error' }); return false; }
  }
  async function saveAs() {
    const p = await os.fileDialog({ mode: 'save', dir: path ? dirname(path) : '/ドキュメント', name: path ? basename(path) : '無題.txt', exts: ['.txt', '.md'], typeLabel: 'テキスト文書' });
    if (!p) return false;
    path = p; win.setArgs({ path, draftKey: undefined });
    try { localStorage.removeItem(draftKey); } catch { /* 消せない */ }
    return save();
  }
  // 書くのを止めて 1 秒で自動保存。名前のないメモは下書きとして残す
  ta.addEventListener('input', () => {
    refresh();
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (path) save();
      else { try { localStorage.setItem(draftKey, ta.value); set('[data-saved]', '下書きを残しました'); } catch { /* 保存できない */ } }
    }, 1000);
  });
  ['keyup', 'click', 'select'].forEach((ev) => ta.addEventListener(ev, refresh));
  function findNext(q = lastFind, from = ta.selectionEnd) {
    if (!q) return false;
    lastFind = q;
    let i = ta.value.indexOf(q, from);
    if (i < 0) i = ta.value.indexOf(q, 0);
    if (i < 0) { os.sound.play('error'); st.querySelector('.status-field').textContent = `「${q}」は見つかりませんでした。`; return false; }
    ta.focus(); ta.setSelectionRange(i, i + q.length); refresh(); return true;
  }
  async function ask(titleText, withReplace) {
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog';
    dlg.style.width = '360px';
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">${titleText}</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div><div class="window-body"><div class="form" style="grid-template-columns:auto 1fr">
      <label for="nf">検索する文字列(<u>N</u>):</label><input type="text" id="nf">${withReplace ? '<label for="nr">置換後の文字列(<u>P</u>):</label><input type="text" id="nr">' : ''}</div>
      <div class="button-row"><button type="button" class="default" data-close="find">次を検索(<u>F</u>)</button>${withReplace ? '<button type="button" data-close="all">すべて置換(<u>A</u>)</button>' : ''}<button type="button" data-close="">キャンセル</button></div></div>`;
    document.body.append(dlg);
    const nf = dlg.querySelector('#nf'); nf.value = ta.value.slice(ta.selectionStart, ta.selectionEnd) || lastFind;
    nf.setAttribute('autofocus', '');
    nf.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); w95.closeDialog(dlg, 'find'); } });
    const r = await w95.openDialog(dlg);
    const q = nf.value, rep = withReplace ? dlg.querySelector('#nr').value : '';
    dlg.remove();
    if (!q) return;
    if (r === 'find') findNext(q);
    if (r === 'all') { const n = ta.value.split(q).length - 1; if (n) { ta.focus(); ta.select(); document.execCommand('insertText', false, ta.value.split(q).join(rep)); } st.querySelector('.status-field').textContent = `${n} か所を置換しました。`; refresh(); }
  }
  const insert = (s) => { ta.focus(); document.execCommand('insertText', false, s); };
  const cmds = {
    new: () => os.launch('notepad'),
    open: async () => { const p = await os.fileDialog({ mode: 'open', dir: path ? dirname(path) : '/ドキュメント', exts: ['.txt', '.md', '.json', '.csv', '.log', '.html', '.mtl'], typeLabel: 'テキスト文書' }); if (p) os.openFile(p, 'notepad'); },
    save, saveas: saveAs,
    export: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ta.value], { type: 'text/plain;charset=utf-8' })); a.download = path ? basename(path) : '無題.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); log('notepad.export', { path }, 'ok'); },
    close: () => win.close(),
    undo: () => { ta.focus(); document.execCommand('undo'); },
    cut: async () => { const s = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (!s) return; try { await navigator.clipboard.writeText(s); insert(''); } catch (e) { log('clipboard.write', {}, 'error: ' + e.message); } },
    copy: async () => { const s = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (s) try { await navigator.clipboard.writeText(s); } catch (e) { log('clipboard.write', {}, 'error: ' + e.message); } },
    paste: async () => { try { insert(await navigator.clipboard.readText()); } catch (e) { log('clipboard.read', {}, 'error: ' + e.message); os.msgbox({ title: 'メモ帳', text: 'クリップボードを読めませんでした。\n\nCtrl+V で貼り付けてください。', icon: 'info' }); } },
    del: () => insert(''),
    find: () => ask('検索', false), next: () => findNext(), replace: () => ask('置換', true),
    all: () => { ta.focus(); ta.select(); },
    date: () => insert(new Date().toLocaleString('ja-JP')),
    wrap: (d) => ta.classList.toggle('nowrap', !d.checked),
    bigger: () => { fontPx = Math.min(32, fontPx + 2); ta.style.fontSize = fontPx + 'px'; },
    smaller: () => { fontPx = Math.max(10, fontPx - 2); ta.style.fontSize = fontPx + 'px'; },
    about: () => os.msgbox({ title: 'メモ帳について', icon: 'info', text: 'Future OS メモ帳 1.0\n\n書くのを止めて 1 秒で自動保存します。\n名前のないメモも、下書きとして次の起動まで残ります。' }),
  };
  win.body.addEventListener('w95:command', (e) => cmds[e.detail.command]?.(e.detail));
  win.body.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 's') { e.preventDefault(); save(); }
    else if (e.ctrlKey && k === 'o') { e.preventDefault(); cmds.open(); }
    else if (e.ctrlKey && k === 'f') { e.preventDefault(); cmds.find(); }
    else if (e.ctrlKey && k === 'h') { e.preventDefault(); cmds.replace(); }
    else if (e.key === 'F3') { e.preventDefault(); findNext(); }
    else if (e.key === 'F5') { e.preventDefault(); cmds.date(); }
  });
  win.body.addEventListener('fos:drop-file', (e) => os.openFile(e.detail.path));
  refresh();
  ta.focus();
  ta.setSelectionRange(0, 0);
  ta.scrollTop = 0;
  return win;
}
