// 付箋: 1枚が1つの小さな窓。書くそばから保存し、次の起動でも残る。4色、手前に固定（ピン留め）、文書への書き出し。
// 付箋の中身は localStorage（fos-stickies）に置く。消した付箋は、ゴミ箱に文書として残す（元に戻せるように）。
// 「付箋」を開くと、閉じていた付箋を全部開く。全部開いているときは新しい付箋を1枚作る。
const KEY = 'fos-stickies';
export const COLORS = [['paper', '真珠白'], ['mint', 'ミント'], ['lavender', 'ラベンダー'], ['apricot', 'アプリコット']];

function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); return Array.isArray(d.notes) ? d.notes : []; } catch { return []; } }
function store(notes) { try { localStorage.setItem(KEY, JSON.stringify({ notes })); } catch { /* 保存できない */ } }
function update(id, patch) { const notes = load(), n = notes.find((x) => x.id === id); if (n) { Object.assign(n, patch, { mtime: Date.now() }); store(notes); } }
const newId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const titleOf = (text) => { const line = (text || '').split('\n').find((l) => l.trim()) || ''; return line.trim() ? '付箋 - ' + (line.trim().length > 14 ? line.trim().slice(0, 14) + '…' : line.trim()) : '付箋'; };

// 手前に固定した付箋を、ほかの窓より上に置き直す（窓が手前に来るたびに呼ぶ）。ドックやメニュー（z-index 9000 台）よりは下
let wired = false;
function wirePins(wm) {
  if (wired) return; wired = true;
  wm.events.addEventListener('focus', () => {
    const all = wm.list(), top = Math.max(10, ...all.map((w) => +w.el.style.zIndex || 0));
    all.filter((w) => w.app === 'stickies' && w.el.classList.contains('pinned')).forEach((w, i) => { w.el.style.zIndex = String(Math.min(8900, top + 1 + i)); });
  });
}

const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">付箋(<u>N</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="new"><span class="label">新しい付箋(<u>N</u>)</span></div>
    <div class="menu-item" data-command="all"><span class="label">付箋を全部開く(<u>A</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="export"><span class="label">文書として保存(<u>E</u>)...</span></div>
    <div class="menu-item" data-command="delete"><span class="label">この付箋を消す(<u>D</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>X</u>)</span></div>
  </div></div>
  <div class="menu-title">色(<u>C</u>)<div class="menu" role="menu">
    ${COLORS.map(([k, n], i) => `<div class="menu-item radio" data-radio="col" data-command="color" data-color="${k}"><span class="label">${n}(<u>${i + 1}</u>)</span></div>`).join('')}
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    <div class="menu-item" data-toggle="check" data-command="pin"><span class="label">手前に固定(<u>P</u>)</span></div>
  </div></div>
</div>`;

export async function launch(os, args = {}, rect = {}) {
  const { wm, log } = os;
  wirePins(wm);
  const openWin = (id) => wm.list().find((w) => w.app === 'stickies' && w.args.id === id);
  if (args.id) {
    const n = load().find((x) => x.id === args.id);
    if (n) return openNote(os, n, rect);
    if (!args.create) return null;
  }
  if (args.create || args.id) return createNote(os, rect);
  // 引数なし: 閉じている付箋を全部開く。全部開いていれば、新しい1枚を作る
  const closed = load().filter((n) => !openWin(n.id));
  if (!closed.length) {
    const open = load().map((n) => openWin(n.id)).filter(Boolean);
    if (open.length && args.focusOnly) { open.forEach((w) => w.focus()); return open.at(-1); }
    return createNote(os, rect);
  }
  let last = null;
  for (const n of closed) last = await openNote(os, n, {});
  log('stickies.openAll', { count: closed.length }, 'ok');
  return last;
}

function createNote(os, rect) {
  const notes = load(), k = notes.length;
  const n = { id: newId(), text: '', color: COLORS[k % COLORS.length][0], pinned: false, rect: rect.x != null ? rect : { x: 140 + (k % 6) * 28, y: 40 + (k % 6) * 26, w: 250, h: 230 }, mtime: Date.now() };
  notes.push(n); store(notes);
  os.log('stickies.new', { id: n.id }, 'ok');
  return openNote(os, n, {});
}

function openNote(os, note, rect) {
  const { fs, wm, log, sound } = os;
  const exists = wm.list().find((w) => w.app === 'stickies' && w.args.id === note.id);
  if (exists) { exists.focus(); return exists; }
  const r = { ...(note.rect || {}), ...rect };
  let ta, timer = 0;
  const win = wm.open({
    app: 'stickies', icon: 'icons/stickies.svg', className: 'app-sticky', title: titleOf(note.text), w: r.w || 250, h: r.h || 230, x: r.x, y: r.y, args: { id: note.id },
    render(w) {
      w.body.innerHTML = MENU + `<textarea class="sticky-text" spellcheck="false" aria-label="付箋の本文" placeholder="ここに書くと、そのまま保存されます。"></textarea>`;
      ta = w.body.querySelector('textarea'); ta.value = note.text || '';
    },
    onClose: async () => {
      clearTimeout(timer);
      // 何も書いていない付箋は、閉じたら残さない
      if (!ta.value.trim()) { store(load().filter((x) => x.id !== note.id)); log('stickies.discardEmpty', { id: note.id }, 'ok'); }
      else update(note.id, { text: ta.value, rect: win.rect });
      return true;
    },
  });
  const setColor = (c) => {
    win.el.dataset.sticky = c;
    win.body.querySelectorAll('[data-command="color"]').forEach((m) => m.classList.toggle('checked', m.dataset.color === c));
  };
  const setPin = (on) => {
    win.el.classList.toggle('pinned', on);
    const m = win.body.querySelector('[data-command="pin"]'); m.classList.toggle('checked', on); m.setAttribute('aria-checked', String(on));
    if (on) wm.focus(win);
  };
  setColor(note.color || 'paper');
  setPin(!!note.pinned);
  const save = () => { update(note.id, { text: ta.value, rect: win.rect }); win.setTitle(titleOf(ta.value)); };
  ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 400); });
  win.body.addEventListener('fos:resize', () => { clearTimeout(timer); timer = setTimeout(save, 400); });
  const cmds = {
    new: () => createNote(os, { x: win.rect.x + 28, y: win.rect.y + 26, w: win.rect.w, h: win.rect.h }),
    all: () => launch(os, { focusOnly: true }),
    async export() {
      const p = await os.fileDialog({ mode: 'save', dir: '/ドキュメント', name: (titleOf(ta.value).replace(/^付箋( - )?/, '') || '付箋').replace(/[\\/…]/g, '') + '.txt', exts: ['.txt'], typeLabel: 'テキスト文書' });
      if (!p) return;
      try { await fs.write(p, ta.value); os.addRecent(p); log('stickies.export', { id: note.id, path: p }, 'ok'); sound.play('select'); }
      catch (e) { os.msgbox({ title: '付箋', text: e.message, icon: 'error' }); log('stickies.export', { path: p }, 'error: ' + e.message); }
    },
    async delete() {
      // 書いてある付箋は、ゴミ箱に文書として残す（ゴミ箱から「元に戻す」でデスクトップへ戻せる）
      if (ta.value.trim()) {
        const name = await fs.freeName(fs.TRASH, (titleOf(ta.value).replace(/^付箋( - )?/, '').replace(/[\\/…]/g, '') || '付箋') + '.txt');
        try { await fs.write(fs.TRASH + '/' + name, ta.value); } catch (e) { log('stickies.delete', { id: note.id }, 'error: ' + e.message); }
      }
      store(load().filter((x) => x.id !== note.id));
      sound.play('trash');
      log('stickies.delete', { id: note.id }, 'ok');
      win.close(true);
    },
    close: () => win.close(),
    color: (d) => { const c = d.item?.dataset.color; if (!c) return; setColor(c); update(note.id, { color: c }); sound.play('toggleOn'); log('stickies.color', { id: note.id, color: c }, 'ok'); },
    pin: (d) => { const on = !!d.checked; setPin(on); update(note.id, { pinned: on }); sound.play(on ? 'pin' : 'toggleOff'); log('stickies.pin', { id: note.id, on }, 'ok'); },
  };
  win.body.addEventListener('w95:command', (e) => cmds[e.detail.command]?.(e.detail));
  win.body.addEventListener('fos:drop-file', async (e) => {
    // 文書を付箋の上に落とすと、その中身を付け足す
    try { const t = await fs.readText(e.detail.path); ta.value += (ta.value && !ta.value.endsWith('\n') ? '\n' : '') + t; save(); } catch (err) { log('stickies.drop', { path: e.detail.path }, 'error: ' + err.message); }
  });
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  log('stickies.open', { id: note.id }, 'ok');
  return win;
}
