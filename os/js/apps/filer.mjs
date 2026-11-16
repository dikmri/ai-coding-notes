// ファイル マネージャ: 左にフォルダのツリー、右に一覧（詳細／大きいアイコン）。切り取り・コピー・貼り付け、取り込み、書き出し、ゴミ箱
import { basename, dirname, normalize, isInside } from '../core/path.mjs';
import { typeName } from '../core/assoc.mjs';

let clip = null; // { mode: 'copy' | 'cut', paths: [] }（窓をまたいで使う）

const MENU = (inTrash) => `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item default" data-command="open"><span class="label">開く(<u>O</u>)</span><span class="shortcut">Enter</span></div>
    <div class="menu-item"><span class="label">新規作成(<u>W</u>)</span><div class="menu" role="menu">
      <div class="menu-item" data-command="newdir"><span class="label">フォルダ(<u>F</u>)</span></div>
      <div class="menu-item" data-command="newtxt"><span class="label">テキスト文書(<u>T</u>)</span></div></div></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="import" data-status="パソコンのファイルを、いまのフォルダへ取り込みます。"><span class="label">パソコンから取り込む(<u>I</u>)...</span></div>
    <div class="menu-item" data-command="export" data-status="選んだファイルを、パソコンへ書き出します。"><span class="label">パソコンへ書き出す(<u>E</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="restore"${inTrash ? '' : ' aria-disabled="true"'}><span class="label">元に戻す(<u>R</u>)</span></div>
    <div class="menu-item" data-command="empty"${inTrash ? '' : ' aria-disabled="true"'}><span class="label">ゴミ箱を空にする(<u>B</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="delete"><span class="label">削除(<u>D</u>)</span><span class="shortcut">Del</span></div>
    <div class="menu-item" data-command="rename"><span class="label">名前の変更(<u>M</u>)</span><span class="shortcut">F2</span></div>
    <div class="menu-item" data-command="props"><span class="label">プロパティ(<u>P</u>)</span><span class="shortcut">Alt+Enter</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>C</u>)</span></div>
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="cut"><span class="label">切り取り(<u>T</u>)</span><span class="shortcut">Ctrl+X</span></div>
    <div class="menu-item" data-command="copy"><span class="label">コピー(<u>C</u>)</span><span class="shortcut">Ctrl+C</span></div>
    <div class="menu-item" data-command="paste"><span class="label">貼り付け(<u>P</u>)</span><span class="shortcut">Ctrl+V</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="selall"><span class="label">すべて選択(<u>A</u>)</span><span class="shortcut">Ctrl+A</span></div>
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    <div class="menu-item radio" data-radio="v" data-command="icons"><span class="label">大きいアイコン(<u>G</u>)</span></div>
    <div class="menu-item radio checked" data-radio="v" data-command="details"><span class="label">詳細(<u>D</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="refresh"><span class="label">最新の情報に更新(<u>R</u>)</span><span class="shortcut">F5</span></div>
  </div></div>
  <div class="menu-title">移動(<u>G</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="back"><span class="label">戻る(<u>B</u>)</span><span class="shortcut">Alt+←</span></div>
    <div class="menu-item" data-command="fwd"><span class="label">進む(<u>F</u>)</span><span class="shortcut">Alt+→</span></div>
    <div class="menu-item" data-command="up"><span class="label">1 つ上のフォルダ(<u>U</u>)</span><span class="shortcut">Backspace</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="go:/"><span class="label">マイ ドライブ(<u>M</u>)</span></div>
    <div class="menu-item" data-command="go:/デスクトップ"><span class="label">デスクトップ(<u>D</u>)</span></div>
    <div class="menu-item" data-command="go:/ドキュメント"><span class="label">ドキュメント(<u>O</u>)</span></div>
    <div class="menu-item" data-command="go:/ゴミ箱"><span class="label">ゴミ箱(<u>T</u>)</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="about"><span class="label">ファイル マネージャについて(<u>A</u>)</span></div>
  </div></div>
</div>
<div class="toolbar">
  <button type="button" data-command="up" title="1 つ上のフォルダ" class="labeled"><img src="icons/folder.svg" alt=""><span>上へ</span></button>
  <div class="sep"></div>
  <button type="button" data-command="cut" title="切り取り" data-status="選んだ項目を切り取ります。"><img src="icons/cut.svg" alt=""></button>
  <button type="button" data-command="copy" title="コピー" data-status="選んだ項目をコピーします。"><img src="icons/copy.svg" alt=""></button>
  <button type="button" data-command="paste" title="貼り付け" data-status="切り取り・コピーした項目を、ここへ貼り付けます。"><img src="icons/paste.svg" alt=""></button>
  <div class="sep"></div>
  <button type="button" data-command="delete" title="削除" data-status="選んだ項目をゴミ箱へ入れます。"><img src="icons/delete.svg" alt=""></button>
  <button type="button" data-command="props" title="プロパティ"><img src="icons/properties.svg" alt=""></button>
  <div class="sep"></div>
  <button type="button" data-command="import" title="パソコンから取り込む" class="labeled"><img src="icons/open.svg" alt=""><span>取り込む</span></button>
  <button type="button" data-command="export" title="パソコンへ書き出す" class="labeled"><img src="icons/save.svg" alt=""><span>書き出す</span></button>
</div>`;

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, esc } = os;
  let cur = normalize(args.path || '/'), view = 'details', sortKey = 'name', sortDir = 1, entries = [];
  const hist = [], fwdStack = [];
  if (!(await fs.exists(cur))) cur = '/';
  const win = wm.open({
    app: 'filer', icon: cur === fs.TRASH ? 'icons/trash.svg' : 'icons/folder.svg', className: 'app-filer', w: 680, h: 450, ...rect, args: { path: cur },
    render(w) {
      w.body.innerHTML = MENU(cur === fs.TRASH) + `<div class="addr"><label for="addr${w.id}">場所(<u>D</u>):</label><input type="text" id="addr${w.id}" spellcheck="false" autocomplete="off"></div>
        <div class="pane-row"><ul class="tree field tree-pane" tabindex="0" aria-label="フォルダ"></ul><div class="field list-pane" tabindex="0" aria-label="一覧"></div></div>
        <div class="status-bar"><div class="status-field" data-s1></div><div class="status-field" style="width:150px" data-s2></div><div class="status-field" style="width:150px" data-s3></div><div class="size-grip"></div></div>
        <input type="file" multiple hidden data-file>`;
    },
  });
  const B = (s) => win.body.querySelector(s);
  const tree = B('.tree-pane'), pane = B('.list-pane'), addr = B('input[type=text]'), fileIn = B('[data-file]');
  const inTrash = () => cur === fs.TRASH || isInside(cur, fs.TRASH);
  const selected = () => [...pane.querySelectorAll('.selected')].map((el) => entries.find((e) => e.path === el.dataset.path)).filter(Boolean);
  const status = (k, v) => { B(`[data-${k}]`).textContent = v; };

  async function go(path, push = true) {
    path = normalize(path);
    const st = await fs.stat(path);
    if (!st || st.kind !== 'dir') { os.msgbox({ title: 'ファイル マネージャ', text: `「${path}」というフォルダはありません。`, icon: 'warning' }); addr.value = cur; return; }
    if (push && path !== cur) { hist.push(cur); fwdStack.length = 0; }
    cur = path;
    win.setArgs({ path: cur });
    // ゴミ箱かどうかでメニューの使える項目が変わる
    const m = win.body.querySelector('[data-command="restore"]'); if (m) { m.toggleAttribute('aria-disabled', !inTrash()); win.body.querySelector('[data-command="empty"]').toggleAttribute('aria-disabled', !inTrash()); }
    await render();
  }
  async function render() {
    entries = await fs.list(cur);
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      const v = sortKey === 'size' ? a.size - b.size : sortKey === 'type' ? typeName(a.name).localeCompare(typeName(b.name), 'ja') : sortKey === 'mtime' ? a.mtime - b.mtime : a.name.localeCompare(b.name, 'ja', { numeric: true });
      return v * sortDir;
    });
    const name = cur === '/' ? 'マイ ドライブ' : basename(cur);
    win.setTitle(`${name} - ファイル マネージャ`);
    addr.value = cur;
    const cutSet = clip && clip.mode === 'cut' ? new Set(clip.paths) : new Set();
    const date = (t) => (t ? new Date(t).toLocaleString('ja-JP', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
    if (view === 'details') {
      const th = (k, label, num) => `<th${num ? ' class="num"' : ''} data-sort="${k}">${label}${sortKey === k ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
      pane.innerHTML = `<table class="details"><thead><tr>${th('name', '名前')}${th('size', '大きさ', 1)}${th('type', '種類')}${th('mtime', '更新日時', 1)}${inTrash() ? '<th>元の場所</th>' : ''}</tr></thead><tbody>${entries.map((e) => `<tr data-path="${esc(e.path)}"${cutSet.has(e.path) ? ' class="cut"' : ''}><td><img class="icon" src="${os.iconFor(e)}" alt="" width="16" height="16">${esc(e.name)}</td><td class="num">${e.kind === 'dir' ? '' : fs.human(e.size)}</td><td>${e.kind === 'dir' ? 'ファイル フォルダ' : esc(typeName(e.name))}</td><td class="num">${date(e.mtime)}</td>${inTrash() ? `<td>${esc(e.origin ? dirname(e.origin) : '')}</td>` : ''}</tr>`).join('')}</tbody></table>`;
    } else {
      pane.innerHTML = `<div class="icons-view">${entries.map((e) => `<div class="ico${cutSet.has(e.path) ? ' cut' : ''}" data-path="${esc(e.path)}"><img src="${os.iconFor(e)}" alt=""><span>${esc(e.name)}</span></div>`).join('')}</div>`;
    }
    const total = entries.reduce((s, e) => s + (e.kind === 'file' ? e.size : 0), 0);
    status('s1', `${entries.length} 個のオブジェクト`);
    status('s2', fs.human(total));
    fs.usage().then((u) => status('s3', u.quota ? `空き容量: ${fs.human(u.quota - u.usage)}` : ''));
    renderTree();
  }
  // フォルダのツリー（全部のフォルダを、いまの場所まで開いた形で）
  async function renderTree() {
    const keys = (await fs.walk('/')).sort((a, b) => a.localeCompare(b, 'ja'));
    const dirs = [];
    for (const k of keys) { const s = await fs.stat(k); if (s && s.kind === 'dir') dirs.push(k); }
    const node = (p) => {
      const kids = dirs.filter((d) => dirname(d) === p), open = isInside(cur, p), label = p === '/' ? 'マイ ドライブ' : basename(p);
      const icon = p === '/' ? 'icons/drive.svg' : p === fs.TRASH ? 'icons/trash.svg' : 'icons/folder.svg';
      const sel = p === cur ? ' selected' : '';
      const lab = `<img class="icon" src="${icon}" alt="" width="16" height="16"><span class="label${sel}" data-dir="${esc(p)}">${esc(label)}</span>`;
      return kids.length ? `<li><details${open || p === '/' ? ' open' : ''}><summary>${lab}</summary><ul>${kids.map(node).join('')}</ul></details></li>` : `<li><span>${lab}</span></li>`;
    };
    tree.innerHTML = node('/');
  }
  function select(el, add, range) {
    const items = [...pane.querySelectorAll('[data-path]')];
    if (range && pane._anchor) { const a = items.indexOf(pane._anchor), b = items.indexOf(el); items.forEach((x, i) => x.classList.toggle('selected', i >= Math.min(a, b) && i <= Math.max(a, b))); }
    else { if (!add) items.forEach((x) => x.classList.remove('selected')); if (el) { el.classList.toggle('selected', add ? !el.classList.contains('selected') : true); pane._anchor = el; } }
    const sel = selected();
    status('s1', sel.length ? `${sel.length} 個のオブジェクトを選択` : `${entries.length} 個のオブジェクト`);
    status('s2', fs.human(sel.reduce((s, e) => s + (e.kind === 'file' ? e.size : 0), 0)));
  }
  function startRename() {
    const el = pane.querySelector('.selected'); if (!el) return;
    const e = entries.find((x) => x.path === el.dataset.path);
    const host = el.querySelector('td') || el.querySelector('span'), input = document.createElement('input');
    input.value = e.name; host.innerHTML = ''; host.append(input); input.focus();
    const dot = e.name.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 && e.kind === 'file' ? dot : e.name.length);
    let done = false;
    const finish = async (ok) => { if (done) return; done = true; const v = input.value.trim(); if (ok && v && v !== e.name) { try { await fs.rename(e.path, v); } catch (err) { os.msgbox({ title: 'ファイル マネージャ', text: err.message, icon: 'error' }); } } render(); };
    input.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter' && !ev.isComposing) finish(true); if (ev.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  }
  async function paste() {
    if (!clip) return;
    for (const p of clip.paths) {
      if (!(await fs.exists(p))) continue;
      if (isInside(cur, p)) { os.msgbox({ title: 'ファイル マネージャ', text: `「${basename(p)}」を、そのフォルダの中へは入れられません。`, icon: 'warning' }); continue; }
      const to = cur + (cur === '/' ? '' : '/') + (await fs.freeName(cur, basename(p)));
      if (clip.mode === 'cut') await fs.move(p, to); else await fs.copy(p, to);
    }
    if (clip.mode === 'cut') clip = null;
    os.sound.play('drop');
  }
  async function del() {
    const sel = selected(); if (!sel.length) return;
    if (inTrash()) {
      const a = await os.msgbox({ title: 'ファイル マネージャ', text: `${sel.length} 個の項目を完全に消します。\n\n元には戻せません。続けますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') return;
      for (const e of sel) await fs.remove(e.path);
    } else for (const e of sel) await fs.trash(e.path);
    os.sound.play('trash');
  }
  function exportSel() {
    const files = selected().filter((e) => e.kind === 'file');
    if (!files.length) { os.msgbox({ title: 'ファイル マネージャ', text: '書き出すファイルを選んでください。フォルダはそのままでは書き出せません。', icon: 'info' }); return; }
    files.forEach(async (e, i) => {
      const blob = await fs.readBlob(e.path), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = e.name;
      setTimeout(() => { a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, i * 300);
    });
    log('fs.export', { count: files.length }, 'ok');
  }
  async function newItem(kind) {
    const name = await fs.freeName(cur, kind === 'dir' ? '新しいフォルダ' : '新しいテキスト文書.txt'), p = cur + (cur === '/' ? '' : '/') + name;
    if (kind === 'dir') await fs.mkdir(p); else await fs.write(p, '');
    await render();
    const el = pane.querySelector(`[data-path="${CSS.escape(p)}"]`); if (el) { select(el); startRename(); }
  }
  const cmds = {
    open: () => selected().forEach((e) => (e.kind === 'dir' ? go(e.path) : os.openFile(e.path))),
    newdir: () => newItem('dir'), newtxt: () => newItem('txt'),
    import: () => fileIn.click(), export: exportSel,
    restore: async () => { for (const e of selected()) await fs.restore(e.path); os.sound.play('drop'); },
    empty: async () => { const a = await os.msgbox({ title: 'ゴミ箱', text: 'ゴミ箱の中身を全部消します。\n\n元には戻せません。続けますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] }); if (a === 'はい') { await fs.emptyTrash(); os.sound.play('trash'); } },
    delete: del, rename: startRename,
    props: () => { const e = selected()[0]; import('../shell.mjs').then((s) => s.properties(e ? e.path : cur)); },
    close: () => win.close(),
    cut: () => { const s = selected(); if (s.length) { clip = { mode: 'cut', paths: s.map((e) => e.path) }; render(); } },
    copy: () => { const s = selected(); if (s.length) clip = { mode: 'copy', paths: s.map((e) => e.path) }; },
    paste, selall: () => pane.querySelectorAll('[data-path]').forEach((x) => x.classList.add('selected')),
    icons: () => { view = 'icons'; render(); }, details: () => { view = 'details'; render(); }, refresh: render,
    back: () => { if (hist.length) { fwdStack.push(cur); go(hist.pop(), false); } },
    fwd: () => { if (fwdStack.length) { hist.push(cur); go(fwdStack.pop(), false); } },
    up: () => { if (cur !== '/') go(dirname(cur)); },
    about: () => os.msgbox({ title: 'ファイル マネージャについて', icon: 'info', text: 'Future OS ファイル マネージャ 1.0\n\n仮想ドライブのファイルを整理し、パソコンと受け渡しします。\nパソコンのファイルを一覧へ落とすと取り込めます。' }),
  };
  win.body.addEventListener('w95:command', (e) => { const c = e.detail.command; if (c.startsWith('go:')) go(c.slice(3)); else cmds[c]?.(); });
  win.body.querySelector('.toolbar').addEventListener('click', (e) => { const b = e.target.closest('button[data-command]'); if (b) cmds[b.dataset.command]?.(); });
  addr.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(addr.value); } });
  tree.addEventListener('click', (e) => { const l = e.target.closest('[data-dir]'); if (l) { e.preventDefault(); go(l.dataset.dir); } });
  pane.addEventListener('pointerdown', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) { const k = th.dataset.sort; sortDir = sortKey === k ? -sortDir : 1; sortKey = k; render(); return; }
    const el = e.target.closest('[data-path]');
    if (e.button === 2) { if (el && !el.classList.contains('selected')) select(el); return; }
    if (!el) { if (!e.target.closest('input')) select(null); return; }
    if (e.target.closest('input')) return;
    select(el, e.ctrlKey, e.shiftKey);
  });
  pane.addEventListener('dblclick', (e) => { if (e.target.closest('[data-path]') && !e.target.closest('input')) cmds.open(); });
  pane.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    let m = document.getElementById('filerMenu');
    if (!m) { m = document.createElement('div'); m.id = 'filerMenu'; m.className = 'menu'; m.setAttribute('role', 'menu'); document.body.append(m); m.addEventListener('w95:command', (ev) => m.target?.(ev.detail.command)); }
    m.target = (c) => cmds[c]?.();
    const has = !!pane.querySelector('.selected');
    const it = (c, l, on = true, cls = '') => `<div class="menu-item${cls}" data-command="${c}"${on ? '' : ' aria-disabled="true"'}><span class="label">${l}</span></div>`;
    m.innerHTML = has
      ? it('open', '開く(<u>O</u>)', true, ' default') + (inTrash() ? it('restore', '元に戻す(<u>R</u>)') : '') + '<div class="menu-separator"></div>' + it('cut', '切り取り(<u>T</u>)') + it('copy', 'コピー(<u>C</u>)') + '<div class="menu-separator"></div>' + it('export', 'パソコンへ書き出す(<u>E</u>)') + it('delete', '削除(<u>D</u>)') + it('rename', '名前の変更(<u>M</u>)') + '<div class="menu-separator"></div>' + it('props', 'プロパティ(<u>R</u>)')
      : it('paste', '貼り付け(<u>P</u>)', !!clip) + '<div class="menu-separator"></div>' + it('newdir', '新しいフォルダ(<u>F</u>)') + it('newtxt', '新しいテキスト文書(<u>T</u>)') + it('import', 'パソコンから取り込む(<u>I</u>)...') + '<div class="menu-separator"></div>' + it('refresh', '最新の情報に更新(<u>E</u>)') + it('props', 'プロパティ(<u>R</u>)');
    os.sound.play('menu');
    w95.popupMenu(m, e.clientX, e.clientY);
  });
  pane.addEventListener('keydown', (e) => {
    const items = [...pane.querySelectorAll('[data-path]')], i = items.indexOf(pane.querySelector('.selected:last-of-type') || pane._anchor);
    if (e.target.closest('input')) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Enter' && e.altKey) { e.preventDefault(); cmds.props(); }
    else if (e.key === 'Enter') { e.preventDefault(); cmds.open(); }
    else if (e.key === 'Delete') { e.preventDefault(); del(); }
    else if (e.key === 'F2') { e.preventDefault(); startRename(); }
    else if (e.key === 'F5') { e.preventDefault(); render(); }
    else if (e.key === 'Backspace') { e.preventDefault(); cmds.up(); }
    else if (e.ctrlKey && k === 'c') { e.preventDefault(); cmds.copy(); }
    else if (e.ctrlKey && k === 'x') { e.preventDefault(); cmds.cut(); }
    else if (e.ctrlKey && k === 'v') { e.preventDefault(); paste(); }
    else if (e.ctrlKey && k === 'a') { e.preventDefault(); cmds.selall(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || (view === 'icons' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft'))) {
      const n = Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1)));
      if (items[n]) { e.preventDefault(); select(items[n], false, e.shiftKey); items[n].scrollIntoView({ block: 'nearest' }); }
    }
  });
  win.body.addEventListener('keydown', (e) => { if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); cmds.back(); } if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); cmds.fwd(); } });
  fileIn.addEventListener('change', async () => { const { importFiles } = await import('../shell.mjs'); await importFiles(fileIn.files, cur); fileIn.value = ''; });
  // パソコンのファイルを落として取り込む
  pane.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); pane.classList.add('drop-ok'); } });
  pane.addEventListener('dragleave', () => pane.classList.remove('drop-ok'));
  pane.addEventListener('drop', async (e) => { e.preventDefault(); pane.classList.remove('drop-ok'); const { importFiles } = await import('../shell.mjs'); await importFiles(e.dataTransfer.files, cur); });
  // デスクトップのアイコンをこの窓へ落としたら、いまのフォルダへ移す
  win.body.addEventListener('fos:drop-file', async (e) => {
    const p = e.detail.path;
    if (dirname(p) === cur || isInside(cur, p)) return;
    await fs.move(p, cur + (cur === '/' ? '' : '/') + (await fs.freeName(cur, basename(p))));
    os.sound.play('drop');
  });
  const onFs = (e) => { const dirs = e.detail.dirs || []; if (dirs.some((d) => d === cur || isInside(cur, d) || d === '/')) render(); else renderTree(); };
  fs.fs.addEventListener('change', onFs);
  win.cleanup = () => fs.fs.removeEventListener('change', onFs);
  await go(cur, false);
  pane.focus();
  return win;
}
