// 本棚: EPUB の電子書籍を集めて読むアプリ。
// ・本棚: 仮想ドライブの /本 の EPUB を、表紙・題名・著者で並べる（表紙の格子と一覧、並べ替え、探す）。本を足す（パソコンから・落とす・仮想ドライブから）
// ・読む画面: 章（spine）ごとに XHTML を消毒し、CSS の段組みで窓の大きさのページに分けてめくる。縦書き（vertical-rl）は右から左へ進む
// ・目次から飛ぶ、しおり、読んだ位置を本ごとに覚える（/システム/本棚.json）、表示の設定（文字の大きさ・行の間・余白・書体・地の色・本の CSS・文字の向き）
//
// 本は外から来たファイルなので、3 重に守る。
// 1. core/books.mjs の許可の一覧で消毒する（script・on〜 の属性・javascript: の URL・外への読み込みを落とす。本の中の画像と CSS は blob の URL にする）
// 2. 表示する側で、使えるブラウザでは Sanitizer API（setHTML）に同じ許可の一覧を渡してもう一度消毒する
// 3. iframe は sandbox="allow-same-origin"（allow-scripts を付けないのでスクリプトは一切動かない）と、外への読み込みを全部止める CSP の meta で出す。
//    allow-same-origin は、OS の側から blob の URL を読ませることと、ページを測って段組みをずらすために要る（スクリプトが無いので、iframe の側から OS には触れない）
// 計算（ZIP・OPF・目次・消毒・保存の形・ページの向き）は core/books.mjs、見本の本は core/books-samples.mjs。
import * as K from '../core/books.mjs';
import { SAMPLES } from '../core/books-samples.mjs';
import { basename, extname, stem } from '../core/path.mjs';

const DIR = '/本', STATE = '/システム/本棚.json';
const MARGINS = { narrow: 14, mid: 34, wide: 64 };
const THEMES = {
  white: { bg: '#ffffff', ink: '#1f1a28', link: '#3346c8' },
  cream: { bg: '#f6eedb', ink: '#3b2f22', link: '#8a4b12' },
  night: { bg: '#17131f', ink: '#ddd5ea', link: '#8fd9ff' },
};
const FONTS = {
  mincho: '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "BIZ UDPMincho", "MS PMincho", serif',
  gothic: '"Hiragino Kaku Gothic ProN", "BIZ UDPGothic", "Yu Gothic", "Meiryo", sans-serif',
};
// 本のページの CSP。画像・CSS・フォントは blob（本の中のもの）と data だけ。スクリプト・フォームの送り先・base は全部止める
const CSP = "default-src 'none'; img-src blob: data:; style-src blob: 'unsafe-inline'; font-src blob: data:; media-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
const NS_SVG = 'http://www.w3.org/2000/svg', NS_MATH = 'http://www.w3.org/1998/Math/MathML';
// Sanitizer API に渡す許可の一覧（core/books.mjs の一覧と同じもの）
const SANITIZER = {
  elements: [...K.HTML_ELEMENTS, ...K.SVG_ELEMENTS.map((name) => ({ name, namespace: NS_SVG })), ...K.MATH_ELEMENTS.map((name) => ({ name, namespace: NS_MATH }))],
  attributes: K.ALL_ATTRS,
};
const TYPE_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };

async function deflateRaw(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const pct = (x) => `${Math.round(x * 100)}%`;
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) % 360; return h; };

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  let state = K.normalizeState(null), prefs = state.prefs;
  let saveTimer = 0, shelf = [], selectedPath = null, query = '';
  const cache = new Map(); // パス → { mtime, size, meta, coverUrl, error }
  let R = null; // 読んでいる本 { path, zip, book, key, weights, index, page, pages, vertical, rtl, urls, cssUrls }
  let loadSeq = 0;
  const radio = (group, value, label, key) => `<div class="menu-item radio${prefs[group] === value ? ' checked' : ''}" data-radio="${group}" data-command="${group}:${value}"><span class="label">${label}(<u>${key}</u>)</span></div>`;

  const win = wm.open({
    app: 'books', icon: 'icons/books.svg', className: 'app-books', title: '本棚', w: 920, h: 660, ...rect, args: {},
    onClose: () => { flushSave(); return true; },
    render(w) {
      const id = w.id;
      w.body.innerHTML = `<div class="menu-bar" role="menubar">
        <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
          <div class="menu-item" data-command="add" data-status="パソコンの EPUB ファイルを選んで、本棚（/本）へ取り込みます。"><span class="label">本を足す(<u>A</u>)...</span></div>
          <div class="menu-item" data-command="addvfs" data-status="仮想ドライブにある EPUB ファイルを選んで、本棚へ写します。"><span class="label">仮想ドライブから足す(<u>V</u>)...</span></div>
          <div class="menu-item" data-command="samples" data-status="見本の本を 2 冊作って、本棚へ入れます。"><span class="label">見本の本を作る(<u>M</u>)</span></div>
          <div class="menu-separator"></div>
          <div class="menu-item" data-command="open"><span class="label">開く(<u>O</u>)</span><span class="shortcut">Enter</span></div>
          <div class="menu-item" data-command="info"><span class="label">本の情報(<u>I</u>)</span></div>
          <div class="menu-item" data-command="export"><span class="label">パソコンへ書き出す(<u>E</u>)</span></div>
          <div class="menu-item" data-command="trash"><span class="label">ゴミ箱へ入れる(<u>D</u>)</span><span class="shortcut">Del</span></div>
          <div class="menu-separator"></div>
          <div class="menu-item" data-command="shelf"><span class="label">本棚へ戻る(<u>B</u>)</span><span class="shortcut">Esc</span></div>
          <div class="menu-item" data-command="close"><span class="label">閉じる(<u>X</u>)</span></div>
        </div></div>
        <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
          ${radio('view', 'grid', '表紙を並べる', 'G')}${radio('view', 'list', '一覧', 'L')}
          <div class="menu-separator"></div>
          ${radio('sort', 'recent', '最近読んだ順', 'R')}${radio('sort', 'title', '題名の順', 'T')}${radio('sort', 'author', '著者の順', 'U')}
          <div class="menu-separator"></div>
          <div class="menu-item" data-command="panel:settings"><span class="label">表示の設定(<u>S</u>)</span></div>
          <div class="menu-item" data-command="bigger"><span class="label">文字を大きく(<u>I</u>)</span><span class="shortcut">+</span></div>
          <div class="menu-item" data-command="smaller"><span class="label">文字を小さく(<u>O</u>)</span><span class="shortcut">-</span></div>
        </div></div>
        <div class="menu-title">移動(<u>G</u>)<div class="menu" role="menu">
          <div class="menu-item" data-command="next"><span class="label">次のページ(<u>N</u>)</span><span class="shortcut">Space</span></div>
          <div class="menu-item" data-command="prev"><span class="label">前のページ(<u>P</u>)</span><span class="shortcut">Shift+Space</span></div>
          <div class="menu-item" data-command="nextch"><span class="label">次の章(<u>X</u>)</span></div>
          <div class="menu-item" data-command="prevch"><span class="label">前の章(<u>V</u>)</span></div>
          <div class="menu-separator"></div>
          <div class="menu-item" data-command="first"><span class="label">本の最初へ(<u>F</u>)</span></div>
          <div class="menu-item" data-command="panel:toc"><span class="label">目次(<u>C</u>)</span></div>
        </div></div>
        <div class="menu-title">しおり(<u>M</u>)<div class="menu" role="menu">
          <div class="menu-item" data-command="mark"><span class="label">このページに挟む(<u>A</u>)</span></div>
          <div class="menu-item" data-command="panel:marks"><span class="label">しおりの一覧(<u>L</u>)</span></div>
        </div></div>
        <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
          <div class="menu-item" data-command="about"><span class="label">本棚について(<u>A</u>)</span></div>
        </div></div>
      </div>
      <div class="bk-main">
        <section class="bk-shelf" data-shelf aria-label="本棚">
          <div class="bk-bar" role="toolbar" aria-label="本棚の操作">
            <button type="button" class="flat bk-btn bk-add" data-a="add">本を足す(<u>A</u>)</button>
            <button type="button" class="flat bk-btn" data-a="samples">見本の本を作る(<u>E</u>)</button>
            <span class="bk-gap"></span>
            <label for="bkQ-${id}">探す(<u>Q</u>):</label><input id="bkQ-${id}" class="bk-q" type="search" autocomplete="off" spellcheck="false" placeholder="題名や著者" data-q>
            <label for="bkSort-${id}">並べ替え(<u>O</u>):</label><select id="bkSort-${id}" data-sort><option value="recent">最近読んだ順</option><option value="title">題名の順</option><option value="author">著者の順</option></select>
            <button type="button" class="flat bk-btn bk-view" data-a="view" data-view="grid" aria-pressed="false">表紙(<u>P</u>)</button>
            <button type="button" class="flat bk-btn bk-view" data-a="view" data-view="list" aria-pressed="false">一覧(<u>L</u>)</button>
          </div>
          <div class="bk-books" role="listbox" aria-label="本棚の本" data-books></div>
          <div class="bk-empty" data-empty hidden>
            <h2>本棚はまだ空です</h2>
            <p>EPUB（イーパブ）の形の電子書籍を足すと、ここに表紙が並びます。</p>
            <p class="bk-empty-acts"><button type="button" class="flat bk-btn bk-add" data-a="add">本を足す</button><button type="button" class="flat bk-btn" data-a="samples">見本の本を作る</button></p>
            <p class="bk-dim">パソコンの EPUB ファイルを、この窓へ引っぱって落としても足せます。見本の本は、使い方の案内（横書き）と、短い物語（縦書き・ルビ付き）の 2 冊です。</p>
          </div>
        </section>
        <section class="bk-reader" data-reader hidden aria-label="本を読む">
          <div class="bk-bar" role="toolbar" aria-label="読む画面の操作">
            <button type="button" class="flat bk-btn" data-a="shelf">本棚へ(<u>B</u>)</button>
            <button type="button" class="flat bk-btn" data-a="panel" data-panel="toc" aria-pressed="false">目次(<u>C</u>)</button>
            <button type="button" class="flat bk-btn" data-a="panel" data-panel="marks" aria-pressed="false">しおり(<u>K</u>)</button>
            <button type="button" class="flat bk-btn" data-a="panel" data-panel="settings" aria-pressed="false">表示の設定(<u>S</u>)</button>
            <span class="bk-booktitle" data-booktitle></span>
          </div>
          <div class="bk-rbody">
            <aside class="bk-side" data-side hidden><h3 class="bk-side-title" data-side-title></h3><div class="bk-side-body" data-side-body></div></aside>
            <div class="bk-stagewrap">
              <button type="button" class="flat bk-turn" data-a="left"><span aria-hidden="true">‹</span></button>
              <div class="bk-stage" data-stage tabindex="0" aria-label="本のページ。矢印キー・Space・PageDown でめくります。">
                <iframe class="bk-frame" data-frame sandbox="allow-same-origin" referrerpolicy="no-referrer" aria-label="本の中身"></iframe>
              </div>
              <button type="button" class="flat bk-turn" data-a="right"><span aria-hidden="true">›</span></button>
            </div>
          </div>
        </section>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field bk-sf-ch" data-chapter></div><div class="status-field bk-sf-page" data-page></div><div class="status-field bk-sf-pct" data-pct></div><div class="size-grip"></div></div>
      <input type="file" accept=".epub,application/epub+zip" multiple hidden data-file>`;
    },
  });

  const q = (s) => win.body.querySelector(s);
  const shelfEl = q('[data-shelf]'), readerEl = q('[data-reader]'), booksEl = q('[data-books]'), emptyEl = q('[data-empty]');
  const stage = q('[data-stage]'), frame = q('[data-frame]'), side = q('[data-side]'), fileIn = q('[data-file]');
  let lastMsg = '';
  const say = (text) => { let m = text; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m; };
  const field = (k, v) => { q(`.status-field[data-${k}]`).textContent = v; };
  // 章・ページ・進み具合の欄は、読む画面でだけ出す（本棚では案内の文を広く見せる）
  const readerFields = (on) => { for (const k of ['chapter', 'page', 'pct']) q(`.status-field[data-${k}]`).hidden = !on; };

  /* ---------- 保存（/システム/本棚.json） ---------- */
  async function loadState() {
    try { if (await fs.exists(STATE)) state = K.normalizeState(await fs.readJSON(STATE)); log('books.state.load', { path: STATE }, 'ok'); }
    catch (e) { log('books.state.load', { path: STATE }, 'error: ' + e.message); state = K.normalizeState(null); }
    prefs = state.prefs;
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 700); }
  function flushSave() {
    clearTimeout(saveTimer); saveTimer = 0;
    state.prefs = prefs;
    return fs.write(STATE, JSON.stringify(state, null, 1), 'application/json')
      .then(() => log('books.state.save', { books: Object.keys(state.books).length }, 'ok'))
      .catch((e) => log('books.state.save', {}, 'error: ' + e.message));
  }
  const entryOf = (key) => (state.books[key] ??= { pos: null, marks: [], last: 0 });

  /* ---------- 本棚 ---------- */
  async function ensureDir() { if (!(await fs.exists(DIR))) await fs.mkdir(DIR); }
  async function metaFor(path) {
    const st = await fs.stat(path);
    const c = cache.get(path);
    if (c && c.mtime === st.mtime && c.size === st.size) return c;
    if (c?.coverUrl) URL.revokeObjectURL(c.coverUrl);
    const rec = { mtime: st.mtime, size: st.size, meta: null, coverUrl: null, error: null };
    try {
      const zip = await K.openZip(await fs.readBlob(path));
      rec.meta = await K.readBook(zip);
      if (rec.meta.cover) rec.coverUrl = URL.createObjectURL(await zip.blob(rec.meta.cover, rec.meta.types[rec.meta.cover] || TYPE_BY_EXT[extname(rec.meta.cover).toLowerCase()] || ''));
      log('books.meta', { path, title: rec.meta.title }, 'ok');
    } catch (e) { rec.error = e.message; log('books.meta', { path }, 'error: ' + e.message); }
    cache.set(path, rec);
    return rec;
  }
  async function refreshShelf() {
    await ensureDir();
    const paths = (await fs.walk(DIR)).filter((p) => extname(p).toLowerCase() === '.epub').sort();
    const list = [];
    for (const path of paths) {
      const st = await fs.stat(path);
      if (!st || st.kind !== 'file') continue;
      const c = await metaFor(path), m = c.meta;
      const key = m ? K.bookKey(m, path) : 'path:' + path, e = state.books[key];
      const weights = m ? m.spine.map((s) => s.size) : [];
      const idx = m && e?.pos ? m.spine.findIndex((s) => s.path === e.pos.path) : -1;
      list.push({ path, name: basename(path), title: m?.title || stem(path), author: m?.author || '', cover: c.coverUrl, key, error: c.error,
        last: e?.last || 0, progress: idx >= 0 ? K.bookProgress(weights, idx, e.pos.progress) : 0, read: !!e?.pos, vertical: m?.ppd === 'rtl', drm: !!m?.drm });
    }
    for (const p of [...cache.keys()]) if (!paths.includes(p)) { const c = cache.get(p); if (c.coverUrl) URL.revokeObjectURL(c.coverUrl); cache.delete(p); }
    shelf = list;
    renderShelf();
  }
  function visibleBooks() { return K.filterBooks(K.sortBooks(shelf, prefs.sort), query); }
  function renderShelf() {
    const list = visibleBooks();
    booksEl.className = `bk-books bk-${prefs.view}`;
    for (const b of win.body.querySelectorAll('.bk-view')) b.setAttribute('aria-pressed', String(b.dataset.view === prefs.view));
    q('[data-sort]').value = prefs.sort;
    emptyEl.hidden = shelf.length > 0;
    booksEl.hidden = shelf.length === 0;
    if (!list.some((b) => b.path === selectedPath)) selectedPath = list[0]?.path || null;
    const date = (t) => (t ? new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '');
    booksEl.innerHTML = list.length ? list.map((b) => {
      const sel = b.path === selectedPath;
      const cover = b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" decoding="async">` : `<span class="bk-nocover" style="--h:${hue(b.title)}">${esc(b.title)}</span>`;
      const note = b.error ? '読めない本' : b.drm ? '鍵のかかった本' : b.read ? `${pct(b.progress)} 読みました` : '未読';
      return `<div class="bk-item${b.error || b.drm ? ' bk-bad' : ''}" role="option" tabindex="${sel ? 0 : -1}" aria-selected="${sel}" data-path="${esc(b.path)}" title="${esc(b.error || `${b.title}${b.author ? ' / ' + b.author : ''}`)}">
        <span class="bk-cover">${cover}</span>
        <span class="bk-meta"><span class="bk-title">${esc(b.title)}</span><span class="bk-author">${esc(b.author || '著者の名前なし')}</span><span class="bk-note">${esc(note)}${b.last ? `<span class="bk-when">・${date(b.last)}</span>` : ''}</span></span>
        <span class="bk-meter" aria-hidden="true"><span style="inline-size:${(b.progress * 100).toFixed(1)}%"></span></span>
      </div>`;
    }).join('') : `<p class="bk-none">「${esc(query)}」に合う本はありません。</p>`;
    if (!R) {
      win.setTitle('本棚');
      say(shelf.length ? `${shelf.length} 冊の本があります。${query ? `「${query}」で探して ${list.length} 冊。` : ''}表紙を 2 回押すか、選んで Enter を押すと開きます。` : '本棚は空です。「本を足す」か「見本の本を作る」を押してください。');
      readerFields(false);
    }
  }
  const itemEl = (path) => booksEl.querySelector(`.bk-item[data-path="${CSS.escape(path)}"]`);
  function select(path, focus = true) {
    selectedPath = path;
    for (const el of booksEl.querySelectorAll('.bk-item')) { const on = el.dataset.path === path; el.setAttribute('aria-selected', String(on)); el.tabIndex = on ? 0 : -1; }
    const el = itemEl(path);
    if (el && focus) { el.focus(); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    const b = shelf.find((x) => x.path === path);
    if (b) say(`${b.title}${b.author ? '（' + b.author + '）' : ''}${b.error ? ' は読めません: ' + b.error : ''}`);
  }
  // 矢印キーで、見えている位置から押した向きの隣の本へ移る（位置は押したときに測る）
  function spatial(key) {
    const cur = itemEl(selectedPath);
    if (!cur) return false;
    const a = cur.getBoundingClientRect(), tol = 2;
    const dirs = { ArrowRight: 'r', ArrowLeft: 'l', ArrowDown: 'd', ArrowUp: 'u' }, d = dirs[key];
    let best = null, bestScore = Infinity, bestAligned = false;
    for (const el of booksEl.querySelectorAll('.bk-item')) {
      if (el === cur || !el.checkVisibility()) continue;
      const b = el.getBoundingClientRect();
      const ok = d === 'r' ? b.left >= a.right - tol : d === 'l' ? b.right <= a.left + tol : d === 'd' ? b.top >= a.bottom - tol : b.bottom <= a.top + tol;
      if (!ok) continue;
      const horiz = d === 'r' || d === 'l';
      const gap = d === 'r' ? b.left - a.right : d === 'l' ? a.left - b.right : d === 'd' ? b.top - a.bottom : a.top - b.bottom;
      const aligned = horiz ? b.top < a.bottom && b.bottom > a.top : b.left < a.right && b.right > a.left;
      const off = horiz ? Math.abs((b.top + b.bottom) / 2 - (a.top + a.bottom) / 2) : Math.abs((b.left + b.right) / 2 - (a.left + a.right) / 2);
      const score = aligned ? gap * 1000 + off : gap + 3 * off;
      if ((aligned && !bestAligned) || (aligned === bestAligned && score < bestScore)) { best = el; bestScore = score; bestAligned = aligned; }
    }
    if (!best) return false;
    select(best.dataset.path); sound.play('click');
    return true;
  }

  /* ---------- 本を足す ---------- */
  async function importFiles(files) {
    await ensureDir();
    const added = [], bad = [];
    for (const f of files) {
      if (extname(f.name).toLowerCase() !== '.epub') { bad.push(`${f.name}: EPUB（.epub）のファイルではありません`); continue; }
      try {
        const book = await K.readBook(await K.openZip(f));
        const name = await fs.freeName(DIR, f.name);
        await fs.write(`${DIR}/${name}`, f, 'application/epub+zip');
        added.push({ path: `${DIR}/${name}`, title: book.title || stem(name) });
        log('books.import', { name: f.name, size: f.size, title: book.title }, 'ok');
      } catch (e) { bad.push(`${f.name}: ${e.message}`); log('books.import', { name: f.name }, 'error: ' + e.message); }
    }
    if (added.length) { sound.play('drop'); await refreshShelf(); select(added[0].path); say(`${added.length} 冊を本棚に足しました: ${added.map((a) => a.title).join('、')}`); }
    if (bad.length) await os.msgbox({ title: '本を足す', icon: 'warning', text: `次のファイルは足せませんでした。\n\n${bad.join('\n')}` });
    return added;
  }
  async function addFromVfs() {
    const p = await os.fileDialog({ mode: 'open', dir: '/ドキュメント', exts: ['.epub'], typeLabel: 'EPUB の本' });
    if (!p) return;
    if (p.startsWith(DIR + '/')) { await showReaderFor(p); return; }
    const blob = await fs.readBlob(p);
    await importFiles([new File([blob], basename(p), { type: 'application/epub+zip' })]);
  }
  async function makeSamples() {
    await ensureDir();
    const made = [];
    for (const s of SAMPLES) {
      const path = `${DIR}/${s.file}`;
      if (await fs.exists(path)) continue;
      try {
        const bytes = await K.makeEpub(s, { deflate: deflateRaw });
        await fs.write(path, new Blob([bytes], { type: 'application/epub+zip' }));
        made.push(path); log('books.sample', { path, size: bytes.length }, 'ok');
      } catch (e) { log('books.sample', { path }, 'error: ' + e.message); say('見本の本を作れませんでした: ' + e.message); sound.play('error'); return; }
    }
    if (!made.length) { say('見本の本は、もう本棚にあります。'); return; }
    sound.play('drop');
    query = ''; q('[data-q]').value = '';
    await refreshShelf();
    select(made[0]);
    say(`見本の本を ${made.length} 冊作りました。表紙を 2 回押すと開きます。「本棚のはじめかた」に使い方が書いてあります。`);
  }

  /* ---------- 本の操作（本棚） ---------- */
  const selectedBook = () => shelf.find((b) => b.path === selectedPath) || null;
  async function trashBook() {
    const b = selectedBook(); if (!b) return;
    const a = await os.msgbox({ title: '本棚', icon: 'warning', text: `「${b.title}」をゴミ箱へ入れますか?\n\nゴミ箱から元に戻せます。読んだ位置としおりは残ります。`, buttons: ['はい(&Y)', 'いいえ(&N)'] });
    if (a !== 'はい') return;
    await fs.trash(b.path); sound.play('trash'); log('books.trash', { path: b.path }, 'ok');
    await refreshShelf(); say(`「${b.title}」をゴミ箱へ入れました。`);
  }
  async function exportBook() {
    const path = R ? R.path : selectedPath; if (!path) return;
    const blob = await fs.readBlob(path), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = basename(path); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    log('books.export', { path }, 'ok');
  }
  async function bookInfo() {
    const path = R ? R.path : selectedPath; if (!path) return;
    const c = await metaFor(path), m = c.meta, st = await fs.stat(path);
    if (!m) { os.msgbox({ title: '本の情報', icon: 'error', text: `「${basename(path)}」は読めません。\n\n${c.error}` }); return; }
    os.msgbox({ title: '本の情報', icon: 'info', text: `題名: ${m.title || '（なし）'}\n著者: ${m.author || '（なし）'}\n言語: ${m.language || '（なし）'}\n進む向き: ${m.ppd === 'rtl' ? '右から左（縦書きの本など）' : '左から右'}\n章の数: ${m.spine.length}\n目次の項目: ${m.toc.length}\n場所: ${path}\n大きさ: ${fs.human(st.size)}${m.drm ? '\n\nこの本には鍵（DRM）がかかっているため、読めません。' : ''}` });
  }

  /* ---------- 読む画面 ---------- */
  async function showReaderFor(path) {
    const b = shelf.find((x) => x.path === path);
    let zip, book;
    try {
      zip = await K.openZip(await fs.readBlob(path));
      book = await K.readBook(zip);
      if (book.drm) throw new Error('この本には鍵（DRM）がかかっているため、読めません。');
      if (!book.spine.length) throw new Error('本の中に、読む順の章（spine）がありません。');
    } catch (e) {
      log('books.open', { path }, 'error: ' + e.message); sound.play('error');
      await os.msgbox({ title: '本棚', icon: 'error', text: `「${b?.title || basename(path)}」を開けませんでした。\n\n${e.message}` });
      return;
    }
    closeBook();
    const key = K.bookKey(book, path), e = entryOf(key);
    R = { path, zip, book, key, weights: book.spine.map((s) => s.size), index: 0, page: 0, pages: 1, vertical: false, rtl: false, urls: new Map(), cssUrls: new Map(), lang: book.language };
    e.last = Date.now(); scheduleSave();
    shelfEl.hidden = true; readerEl.hidden = false; readerFields(true);
    q('[data-booktitle]').textContent = `${book.title || stem(path)}${book.author ? '　' + book.author : ''}`;
    win.setTitle(`${book.title || stem(path)} - 本棚`);
    win.setArgs({ path });
    log('books.open', { path, title: book.title, chapters: book.spine.length, ppd: book.ppd }, 'ok');
    const pos = e.pos, idx = pos ? book.spine.findIndex((s) => s.path === pos.path) : -1;
    await loadChapter(Math.max(0, idx), { progress: idx >= 0 ? pos.progress : 0 });
    stage.focus({ preventScroll: true });
    say(idx >= 0 ? `前に読んだ所（${pct(K.bookProgress(R.weights, R.index, K.progressAt(R.page, R.pages)))}）から開きました。${R.rtl ? '← キーか左の半分で次のページへ進みます。' : '→ キーか右の半分で次のページへ進みます。'}` : `「${book.title || stem(path)}」を開きました。${R.rtl ? 'この本は右から左へ進みます。← キーか左の半分で次のページへ。' : '→ キーか右の半分で次のページへ。'}`);
  }
  function closeBook() {
    if (!R) return;
    for (const u of R.urls.values()) URL.revokeObjectURL(u);
    for (const u of R.cssUrls.values()) URL.revokeObjectURL(u);
    for (const u of R.extraUrls || []) URL.revokeObjectURL(u);
    R = null;
  }
  async function backToShelf() {
    if (!R) return;
    const path = R.path;
    closeBook(); flushSave();
    frame.srcdoc = '';
    readerEl.hidden = true; shelfEl.hidden = false;
    win.setArgs({ path: undefined });
    await refreshShelf();
    if (itemEl(path)) select(path);
    log('books.shelf', { from: path }, 'ok');
  }
  // 本の中の画像・フォントの blob の URL を作る（同じものは 1 回だけ）
  async function ensureUrl(p) {
    if (R.urls.has(p)) return;
    const type = R.book.types[p] || TYPE_BY_EXT[extname(p).toLowerCase()] || '';
    R.urls.set(p, URL.createObjectURL(await R.zip.blob(p, type)));
  }
  // 消毒を 2 回通す。1 回目で使う画像の場所を集め、URL を作ってから 2 回目で本当の URL を入れる
  async function sanitizeWithUrls(fn) {
    const want = new Set();
    fn((p) => { if (!R.zip.has(p)) return null; want.add(p); return 'about:blank'; });
    for (const p of want) await ensureUrl(p);
    return fn((p) => R.urls.get(p) || null);
  }
  async function cssUrl(p) {
    if (R.cssUrls.has(p)) return R.cssUrls.get(p);
    const text = await R.zip.text(p);
    const css = await sanitizeWithUrls((resource) => K.sanitizeCss(text, { path: p, resource }));
    const u = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
    R.cssUrls.set(p, u);
    return u;
  }
  const stageSize = () => ({ W: Math.max(200, Math.floor(stage.clientWidth)), H: Math.max(160, Math.floor(stage.clientHeight)) });
  // 読む画面の CSS。本の CSS より後に置き、!important で段組み・大きさ・設定を決める
  function readerCss() {
    const { W, H } = stageSize(), m = MARGINS[prefs.margin], t = THEMES[prefs.theme];
    const ph = Math.min(m, Math.floor(W / 6)), pv = Math.min(Math.round(m * 0.8) + 8, Math.floor(H / 6));
    const night = prefs.theme === 'night';
    return `html { margin: 0 !important; padding: 0 !important; width: ${W}px !important; height: ${H}px !important; overflow: hidden !important; background: ${t.bg} !important; color: ${t.ink}; font-size: ${(16 * prefs.fontSize) / 100}px !important; -webkit-text-size-adjust: none; }
html.bk-v { writing-mode: vertical-rl !important; } html.bk-h { writing-mode: horizontal-tb !important; }
html.bk-v body { writing-mode: vertical-rl !important; } html.bk-h body { writing-mode: horizontal-tb !important; }
body { margin: 0 !important; box-sizing: border-box !important; width: ${W}px !important; height: ${H}px !important; min-width: 0 !important; min-height: 0 !important; max-width: none !important; max-height: none !important;
  padding: ${pv}px ${ph}px !important; column-count: auto !important; column-fill: auto !important; overflow: visible !important; position: static !important; font-size: 1rem !important;
  font-family: ${FONTS[prefs.font]} !important; line-height: ${prefs.lineHeight} !important; color: ${t.ink} !important; background: transparent !important; }
html.bk-h body { column-width: ${W - 2 * ph}px !important; column-gap: ${2 * ph}px !important; }
html.bk-v body { column-width: ${H - 2 * pv}px !important; column-gap: ${2 * pv}px !important; }
body :where(p, li, dd, dt, blockquote, div, td, th, figcaption) { line-height: ${prefs.lineHeight} !important; }
body :not(code, pre, kbd, samp, tt, svg, svg *, math, math *) { font-family: inherit !important; }
body pre, body code, body kbd, body samp { font-family: ui-monospace, "BIZ UDGothic", monospace !important; white-space: pre-wrap !important; }
img, svg, video { max-width: ${W - 2 * ph}px !important; max-height: ${H - 2 * pv}px !important; object-fit: contain; break-inside: avoid; }
img { height: auto; }
figure, table, tr, h1, h2, h3, h4, h5, h6 { break-inside: avoid; }
h1, h2, h3, h4, h5, h6 { break-after: avoid; }
a[data-bk-href], a[data-bk-ext] { cursor: pointer; }
a[data-bk-ext]::after { content: " ↗"; font-size: 0.8em; }
#bk-end { display: block !important; inline-size: 1px !important; block-size: 0 !important; margin: 0 !important; padding: 0 !important; }
::selection { background: ${night ? '#4b5fe8' : '#6bf2e3'}; color: ${night ? '#fff' : '#241734'}; }
${prefs.theme !== 'white' ? `body *:not(svg *):not(math *) { color: inherit !important; background-color: transparent !important; }\nbody a { color: ${t.link} !important; }` : ''}`;
  }
  // 章を読み込んでページに分ける。opts: { progress（0〜1）, page: 'last', fragment }
  async function loadChapter(index, opts = {}) {
    const seq = ++loadSeq, item = R.book.spine[index];
    stage.classList.add('bk-loading');
    let res;
    try {
      const text = await R.zip.text(item.path);
      res = await sanitizeWithUrls((resource) => K.sanitizeXhtml(text, { path: item.path, resource }));
      if (seq !== loadSeq || !R) return;
      const links = [];
      if (prefs.bookCss) {
        for (const p of res.styles) if (R.zip.has(p)) links.push(await cssUrl(p));
        for (const css of res.inlineCss) { const u = URL.createObjectURL(new Blob([css], { type: 'text/css' })); (R.extraUrls ??= []).push(u); links.push(u); }
      }
      if (seq !== loadSeq || !R) return;
      const lang = res.lang || R.book.language || '';
      const htmlAttrs = `${lang ? ` lang="${esc(lang)}"` : ''}${res.dir ? ` dir="${res.dir}"` : ''}${prefs.bookCss && res.htmlClass ? ` class="${esc(res.htmlClass)}"` : ''}`;
      const srcdoc = `<!doctype html><html${htmlAttrs}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">${links.map((u) => `<link rel="stylesheet" href="${esc(u)}">`).join('')}<style id="bk-reader"></style></head><body${prefs.bookCss && res.bodyClass ? ` class="${esc(res.bodyClass)}"` : ''}></body></html>`;
      await new Promise((ok) => { frame.addEventListener('load', ok, { once: true }); frame.srcdoc = srcdoc; });
      if (seq !== loadSeq || !R) return;
      const d = frame.contentDocument;
      // Sanitizer API があれば、同じ許可の一覧でもう一度消毒してから入れる（無ければ core の消毒だけ）
      let viaSanitizer = false;
      if (typeof d.body.setHTML === 'function') {
        try { d.body.setHTML(res.html, { sanitizer: SANITIZER }); viaSanitizer = true; } catch (e) { log('books.sanitizer', {}, 'error: ' + e.message); }
      }
      if (!viaSanitizer) d.body.innerHTML = res.html; // core/books.mjs で許可の一覧どおりに消毒済み。iframe ではスクリプトが動かない
      const end = d.createElement('div'); end.id = 'bk-end'; d.body.append(end);
      // 縦書きかどうか: 設定で決めていればそれ。「本に合わせる」なら、本の CSS の writing-mode、使わないときは進む向きと言語で決める
      let vertical;
      if (prefs.flow === 'vertical') vertical = true;
      else if (prefs.flow === 'horizontal') vertical = false;
      else if (prefs.bookCss) vertical = [d.documentElement, d.body].some((el) => /^vertical/.test(d.defaultView.getComputedStyle(el).writingMode));
      else vertical = R.book.ppd === 'rtl' && /^(ja|zh|ko)/i.test(lang);
      d.documentElement.classList.add(vertical ? 'bk-v' : 'bk-h');
      d.getElementById('bk-reader').textContent = readerCss();
      stage.style.setProperty('--bk-bg', THEMES[prefs.theme].bg);
      R.vertical = vertical;
      R.rtl = vertical || d.defaultView.getComputedStyle(d.body).direction === 'rtl';
      R.index = index;
      bindFrame(d);
      await Promise.all([d.fonts?.ready, ...[...d.images].map((im) => im.decode().catch(() => {}))]);
      if (seq !== loadSeq || !R) return;
      measure();
      let page = 0;
      if (opts.page === 'last') page = R.pages - 1;
      else if (opts.fragment) page = pageOfId(opts.fragment) ?? 0;
      else if (typeof opts.progress === 'number') page = K.pageAt(opts.progress, R.pages);
      show(page, { quiet: true });
      syncTurnButtons();
      if (!side.hidden) renderSide();
      log('books.chapter', { index, path: item.path, pages: R.pages, vertical, sanitizer: viaSanitizer ? 'native+core' : 'core' }, 'ok');
    } catch (e) {
      log('books.chapter', { index, path: item?.path }, 'error: ' + e.message);
      say(`この章を表示できませんでした: ${e.message}`); sound.play('error');
    } finally { if (seq === loadSeq) stage.classList.remove('bk-loading'); }
  }
  // ページの数を測る。本文の最後に置いた印が、何ページ目の段にあるかで決める
  function measure() {
    const d = frame.contentDocument, b = d.body, end = d.getElementById('bk-end');
    const { W, H } = stageSize();
    const br = b.getBoundingClientRect(), er = end.getBoundingClientRect();
    const at = R.vertical ? (er.top - br.top) / H : R.rtl ? (br.right - er.right) / W : (er.left - br.left) / W;
    R.pages = Math.max(1, Math.floor(at + 0.001) + 1);
    R.W = W; R.H = H;
  }
  function pageOfId(id) {
    const d = frame.contentDocument, el = d.getElementById(id);
    if (!el) return null;
    const br = d.body.getBoundingClientRect(), r = el.getBoundingClientRect();
    const at = R.vertical ? (r.top - br.top) / R.H : R.rtl ? (br.right - r.right) / R.W : (r.left - br.left) / R.W;
    return Math.min(R.pages - 1, Math.max(0, Math.floor(at + 0.001)));
  }
  function show(page, { quiet = false } = {}) {
    if (!R) return;
    R.page = Math.min(R.pages - 1, Math.max(0, page));
    const b = frame.contentDocument?.body;
    if (b) b.style.transform = R.vertical ? `translateY(${-R.page * R.H}px)` : `translateX(${(R.rtl ? 1 : -1) * R.page * R.W}px)`;
    const frac = K.progressAt(R.page, R.pages), total = K.bookProgress(R.weights, R.index, frac);
    const e = entryOf(R.key);
    e.pos = { path: R.book.spine[R.index].path, progress: frac }; e.last = Date.now();
    scheduleSave();
    field('chapter', chapterTitle(R.index));
    field('page', `${R.page + 1} / ${R.pages} ページ（${R.index + 1} / ${R.book.spine.length} 章）`);
    field('pct', `進み具合 ${pct(total)}`);
    stage.style.setProperty('--bk-progress', String(total));
    if (!quiet) { sound.play('type'); log('books.page', { index: R.index, page: R.page, pages: R.pages }, 'ok'); }
  }
  function chapterTitle(index) {
    const p = R.book.spine[index].path;
    const t = R.book.toc.find((x) => x.path === p);
    return t ? t.label : `${index + 1} 番目の部分`;
  }
  async function turn(action) {
    if (!R) return;
    const last = R.book.spine.length - 1;
    if (action === 'next') {
      if (R.page < R.pages - 1) show(R.page + 1);
      else if (R.index < last) { await loadChapter(R.index + 1, { progress: 0 }); sound.play('type'); log('books.page', { index: R.index, page: 0 }, 'ok'); }
      else { say('最後のページです。本棚へ戻るには「本棚へ」を押してください。'); sound.play('error'); }
    } else if (action === 'prev') {
      if (R.page > 0) show(R.page - 1);
      else if (R.index > 0) { await loadChapter(R.index - 1, { page: 'last' }); sound.play('type'); log('books.page', { index: R.index, page: R.page }, 'ok'); }
      else { say('最初のページです。'); sound.play('error'); }
    } else if (action === 'first') {
      if (R.index === 0) show(0); else await loadChapter(0, { progress: 0 });
    } else if (action === 'last') {
      if (R.page < R.pages - 1) show(R.pages - 1);
      else if (R.index < last) await loadChapter(last, { page: 'last' });
    }
  }
  // 両側のボタン: 縦書きの本では左が次、右が前
  function syncTurnButtons() {
    const [l, r] = win.body.querySelectorAll('.bk-turn');
    const next = '次のページ', prev = '前のページ';
    l.setAttribute('aria-label', R?.rtl ? next : prev); l.title = l.getAttribute('aria-label');
    r.setAttribute('aria-label', R?.rtl ? prev : next); r.title = r.getAttribute('aria-label');
    l.classList.toggle('bk-next', !!R?.rtl); r.classList.toggle('bk-next', !R?.rtl);
  }
  // iframe の中の操作: リンク、ページの上を押す、キー、ホイール。押したあとはキーを OS の側（ページの枠）へ戻す
  let wheelAcc = 0, wheelLock = 0;
  function bindFrame(d) {
    d.addEventListener('click', (e) => {
      const a = e.target.closest?.('a');
      if (a) { e.preventDefault(); followLink(a); return; }
      const sel = d.getSelection();
      if (sel && !sel.isCollapsed) return; // 文字を選んでいるときはめくらない
      turn(K.clickAction(e.clientX, R.W, R.rtl));
      stage.focus({ preventScroll: true });
    });
    d.addEventListener('keydown', onKey);
    d.addEventListener('wheel', onWheel, { passive: false });
    d.addEventListener('submit', (e) => e.preventDefault());
    d.addEventListener('dragstart', (e) => e.preventDefault());
  }
  function onWheel(e) {
    if (!R || e.ctrlKey) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheelLock) return;
    wheelAcc += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX * (R.rtl ? -1 : 1);
    if (Math.abs(wheelAcc) >= 40) { turn(wheelAcc > 0 ? 'next' : 'prev'); wheelAcc = 0; wheelLock = now + 280; }
  }
  async function followLink(a) {
    const ext = a.dataset.bkExt, href = a.dataset.bkHref;
    if (ext) {
      const ans = await os.msgbox({ title: '本の外へのリンク', icon: 'info', text: `このリンクは本の外のページを指しています。\n\n${ext}\n\nウェブブラウザで開きますか?`, buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (ans === 'はい') { os.launch('browser', { url: ext }); log('books.link', { kind: 'external' }, 'ok'); }
      return;
    }
    if (!href) return;
    const [p, frag = ''] = href.split('#');
    const idx = R.book.spine.findIndex((s) => s.path === p);
    if (idx < 0) { say('リンク先が、この本の読む順の中に見つかりません。'); sound.play('error'); return; }
    if (idx === R.index && frag) { const pg = pageOfId(frag); if (pg != null) show(pg); }
    else await loadChapter(idx, frag ? { fragment: frag } : { progress: 0 });
    log('books.link', { kind: 'internal', index: idx }, 'ok');
    say(`「${chapterTitle(idx)}」へ移りました。`);
  }
  function onKey(e) {
    if (!R || readerEl.hidden || e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); backToShelf(); return; }
    if ((e.key === '+' || e.key === ';') && !e.ctrlKey) { e.preventDefault(); cmds.bigger(); return; }
    if (e.key === '-' && !e.ctrlKey) { e.preventDefault(); cmds.smaller(); return; }
    const act = K.pageKeyAction(e.key, R.rtl, { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey });
    if (!act) return;
    e.preventDefault();
    turn(act);
    if (e.currentTarget !== stage && e.currentTarget?.nodeType === 9) stage.focus({ preventScroll: true });
  }
  // 窓や設定が変わったら、同じ割合の位置を保って測り直す
  function relayout() {
    if (!R || !frame.contentDocument?.getElementById('bk-reader')) return;
    const frac = K.progressAt(R.page, R.pages);
    frame.contentDocument.getElementById('bk-reader').textContent = readerCss();
    stage.style.setProperty('--bk-bg', THEMES[prefs.theme].bg);
    measure(); show(K.pageAt(frac, R.pages), { quiet: true });
  }
  let roTimer = 0;
  const ro = new ResizeObserver(() => { clearTimeout(roTimer); roTimer = setTimeout(() => { if (R && (R.W !== stageSize().W || R.H !== stageSize().H)) relayout(); }, 120); });
  ro.observe(stage);

  /* ---------- 横の欄: 目次・しおり・表示の設定 ---------- */
  let panel = null;
  function togglePanel(name) {
    panel = panel === name ? null : name;
    side.hidden = !panel;
    for (const b of readerEl.querySelectorAll('[data-a="panel"]')) b.setAttribute('aria-pressed', String(b.dataset.panel === panel));
    if (panel) renderSide();
    log('books.panel', { panel }, 'ok');
    // 欄の幅だけページの枠が変わるので、測り直しは ResizeObserver に任せる
  }
  function renderSide() {
    if (!R || !panel) return;
    const t = q('[data-side-title]'), body = q('[data-side-body]'), id = win.id;
    if (panel === 'toc') {
      t.textContent = '目次';
      const toc = R.book.toc.length ? R.book.toc : R.book.spine.map((s, i) => ({ label: `${i + 1} 番目の部分`, path: s.path, fragment: '', depth: 0 }));
      const curPath = R.book.spine[R.index].path;
      let curIdx = -1; toc.forEach((x, i) => { if (x.path === curPath && curIdx < 0) curIdx = i; });
      body.innerHTML = `<ul class="bk-toc">${toc.map((x, i) => `<li><button type="button" class="flat bk-link" data-toc="${i}" style="padding-inline-start:${0.5 + x.depth}em"${i === curIdx ? ' aria-current="true"' : ''}${x.path ? '' : ' disabled'}>${esc(x.label)}</button></li>`).join('')}</ul>`;
      body._toc = toc;
    } else if (panel === 'marks') {
      t.textContent = 'しおり';
      const marks = entryOf(R.key).marks;
      const chapterOf = (p) => { const i = R.book.spine.findIndex((s) => s.path === p); return i < 0 ? '' : chapterTitle(i); };
      body.innerHTML = `<p><button type="button" class="flat bk-btn" data-a="mark">このページに挟む(<u>N</u>)</button></p>` + (marks.length
        ? `<ul class="bk-marks">${marks.map((m) => { const i = R.book.spine.findIndex((s) => s.path === m.path); return `<li><button type="button" class="flat bk-link" data-mark-go="${esc(m.id)}"><span class="bk-mark-label">${esc(m.label || '（文字のないページ）')}</span><span class="bk-dim">${esc(chapterOf(m.path))}・${pct(K.bookProgress(R.weights, Math.max(0, i), m.progress))}</span></button><button type="button" class="flat bk-mini" data-mark-del="${esc(m.id)}" aria-label="このしおりを外す">外す</button></li>`; }).join('')}</ul>`
        : '<p class="bk-dim">しおりはまだありません。あとで読み返したいページで「このページに挟む」を押すと、ここに並びます。</p>');
    } else {
      t.textContent = '表示の設定';
      const rad = (name, value, label) => `<label><input type="radio" name="bk-${name}-${id}" data-pref="${name}" value="${value}"${prefs[name] === value ? ' checked' : ''}> ${label}</label>`;
      body.innerHTML = `<div class="bk-set">
        <div class="bk-row"><label for="bkFs-${id}">文字の大きさ(<u>T</u>)</label><output data-out="fontSize" for="bkFs-${id}">${prefs.fontSize}%</output></div>
        <input type="range" id="bkFs-${id}" data-pref="fontSize" min="${K.LIMITS.fontSize[0]}" max="${K.LIMITS.fontSize[1]}" step="10" value="${prefs.fontSize}">
        <div class="bk-row"><label for="bkLh-${id}">行の間(<u>R</u>)</label><output data-out="lineHeight" for="bkLh-${id}">${prefs.lineHeight.toFixed(1)}</output></div>
        <input type="range" id="bkLh-${id}" data-pref="lineHeight" min="${K.LIMITS.lineHeight[0]}" max="${K.LIMITS.lineHeight[1]}" step="0.1" value="${prefs.lineHeight}">
        <fieldset><legend>余白(<u>Y</u>)</legend>${rad('margin', 'narrow', '狭い')}${rad('margin', 'mid', '普通')}${rad('margin', 'wide', '広い')}</fieldset>
        <fieldset><legend>書体(<u>W</u>)</legend>${rad('font', 'mincho', '明朝')}${rad('font', 'gothic', 'ゴシック')}</fieldset>
        <fieldset><legend>地の色(<u>J</u>)</legend>${rad('theme', 'white', '白')}${rad('theme', 'cream', 'クリーム')}${rad('theme', 'night', '夜')}</fieldset>
        <fieldset><legend>文字の向き(<u>D</u>)</legend>${rad('flow', 'auto', '本に合わせる')}${rad('flow', 'horizontal', '横書き')}${rad('flow', 'vertical', '縦書き')}</fieldset>
        <label class="bk-check"><input type="checkbox" data-pref="bookCss"${prefs.bookCss ? ' checked' : ''}> 本の CSS を使う(<u>U</u>)</label>
        <p><button type="button" class="flat bk-mini" data-a="resetprefs">最初の設定に戻す</button></p>
      </div>`;
    }
  }
  let prefTimer = 0;
  // 設定を変える。CSS だけで済むものは測り直し、本の CSS と文字の向きは章を読み直す
  function setPref(name, value, { reload = false, quiet = false } = {}) {
    prefs = K.normalizePrefs({ ...prefs, [name]: value });
    state.prefs = prefs; scheduleSave();
    log('books.pref', { [name]: prefs[name] }, 'ok');
    if (!R) return;
    const out = q(`[data-out="${name}"]`); if (out) out.textContent = name === 'fontSize' ? `${prefs.fontSize}%` : name === 'lineHeight' ? prefs.lineHeight.toFixed(1) : '';
    clearTimeout(prefTimer);
    prefTimer = setTimeout(() => {
      if (!R) return;
      if (reload) loadChapter(R.index, { progress: K.progressAt(R.page, R.pages) }); else relayout();
    }, quiet ? 120 : 0);
  }
  side.addEventListener('input', (e) => {
    const el = e.target.closest('[data-pref]'); if (!el) return;
    const name = el.dataset.pref;
    if (el.type === 'range') setPref(name, Number(el.value), { quiet: true });
  });
  side.addEventListener('change', (e) => {
    const el = e.target.closest('[data-pref]'); if (!el) return;
    const name = el.dataset.pref;
    if (el.type === 'checkbox') { setPref(name, el.checked, { reload: true }); sound.play(el.checked ? 'toggleOn' : 'toggleOff'); }
    else if (el.type === 'radio') { setPref(name, el.value, { reload: name === 'flow' }); sound.play('click'); }
    else if (el.type === 'range') sound.play('tick', (Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min)));
  });
  side.addEventListener('click', async (e) => {
    const tocBtn = e.target.closest('[data-toc]');
    if (tocBtn) {
      const x = q('[data-side-body]')._toc[+tocBtn.dataset.toc];
      const idx = R.book.spine.findIndex((s) => s.path === x.path);
      if (idx < 0) { say('目次の行き先が、この本の読む順の中に見つかりません。'); sound.play('error'); return; }
      if (idx === R.index && x.fragment) { const pg = pageOfId(x.fragment); show(pg ?? 0); } else await loadChapter(idx, x.fragment ? { fragment: x.fragment } : { progress: 0 });
      sound.play('select'); say(`目次から「${x.label}」へ移りました。`); log('books.toc', { label: x.label, index: idx }, 'ok');
      stage.focus({ preventScroll: true });
      return;
    }
    const go = e.target.closest('[data-mark-go]');
    if (go) {
      const m = entryOf(R.key).marks.find((x) => x.id === go.dataset.markGo); if (!m) return;
      const idx = R.book.spine.findIndex((s) => s.path === m.path);
      if (idx < 0) { say('しおりの章が、この本に見つかりません。'); return; }
      if (idx === R.index) show(K.pageAt(m.progress, R.pages), { quiet: true }); else await loadChapter(idx, { progress: m.progress });
      sound.play('select'); say('しおりのページへ移りました。'); log('books.mark.go', { id: m.id }, 'ok');
      stage.focus({ preventScroll: true });
      return;
    }
    const del = e.target.closest('[data-mark-del]');
    if (del) {
      const e2 = entryOf(R.key); e2.marks = K.removeMark(e2.marks, del.dataset.markDel); scheduleSave();
      renderSide(); sound.play('trash'); say('しおりを外しました。'); log('books.mark.remove', { id: del.dataset.markDel }, 'ok');
      return;
    }
    if (e.target.closest('[data-a="resetprefs"]')) {
      const keep = { view: prefs.view, sort: prefs.sort };
      prefs = K.normalizePrefs({ ...K.DEFAULT_PREFS, ...keep }); state.prefs = prefs; scheduleSave();
      renderSide(); loadChapter(R.index, { progress: K.progressAt(R.page, R.pages) });
      say('表示の設定を最初の形に戻しました。'); log('books.pref.reset', {}, 'ok');
    }
  });
  // 今のページの最初の文字を、しおりの名前にする
  function pageSnippet() {
    const d = frame.contentDocument;
    if (!d) return '';
    const walker = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT), range = d.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.right > 0 && r.left < R.W && r.bottom > 0 && r.top < R.H) return n.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
      }
    }
    return '';
  }
  function addMark() {
    if (!R) return;
    const e = entryOf(R.key), before = e.marks.length;
    const mark = { id: Math.random().toString(36).slice(2, 10), path: R.book.spine[R.index].path, progress: K.progressAt(R.page, R.pages), label: pageSnippet() || chapterTitle(R.index), time: Date.now() };
    e.marks = K.addMark(e.marks, mark, R.book.spine.map((s) => s.path));
    if (e.marks.length === before) { say('このページには、もうしおりが挟んであります。'); return; }
    scheduleSave(); sound.play('pin');
    say(`しおりを挟みました: ${mark.label}`); log('books.mark.add', { index: R.index, page: R.page }, 'ok');
    if (panel !== 'marks') togglePanel('marks'); else renderSide();
  }

  /* ---------- 命令 ---------- */
  const cmds = {
    add: () => fileIn.click(), addvfs: addFromVfs, samples: makeSamples,
    open: () => { if (!R && selectedPath) showReaderFor(selectedPath); },
    info: bookInfo, export: exportBook, trash: () => { if (!R) trashBook(); },
    shelf: backToShelf, close: () => win.close(),
    bigger: () => { setPref('fontSize', prefs.fontSize + 10); renderSideIf('settings'); say(`文字の大きさ: ${prefs.fontSize}%`); },
    smaller: () => { setPref('fontSize', prefs.fontSize - 10); renderSideIf('settings'); say(`文字の大きさ: ${prefs.fontSize}%`); },
    next: () => turn('next'), prev: () => turn('prev'), first: () => turn('first'),
    nextch: () => { if (R && R.index < R.book.spine.length - 1) loadChapter(R.index + 1, { progress: 0 }); },
    prevch: () => { if (R && R.index > 0) loadChapter(R.index - 1, { progress: 0 }); },
    mark: addMark,
    about: () => os.msgbox({ title: '本棚について', icon: 'info', text: 'Future OS 本棚 1.0\n\nEPUB の電子書籍を集めて読むアプリです。本は仮想ドライブの /本 に、読んだ位置としおりは /システム/本棚.json に置きます。\n\n本の中のスクリプトは動かさず、本の外への読み込みもしません。' }),
  };
  function renderSideIf(name) { if (panel === name) renderSide(); }
  win.body.addEventListener('w95:command', (e) => {
    const c = e.detail.command;
    const m = /^(view|sort):(.+)$/.exec(c);
    if (m) { prefs = K.normalizePrefs({ ...prefs, [m[1]]: m[2] }); state.prefs = prefs; scheduleSave(); renderShelf(); log('books.pref', { [m[1]]: m[2] }, 'ok'); return; }
    if (c.startsWith('panel:')) { if (R) togglePanel(c.slice(6)); else say('本を開いてから使えます。'); return; }
    cmds[c]?.();
  });
  win.body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'); if (!a || a.disabled || side.contains(a) && a.dataset.a !== 'mark') return;
    const k = a.dataset.a;
    if (k === 'view') { prefs = K.normalizePrefs({ ...prefs, view: a.dataset.view }); state.prefs = prefs; scheduleSave(); renderShelf(); sound.play('click'); syncMenuRadio(); return; }
    if (k === 'panel') { togglePanel(a.dataset.panel); return; }
    if (k === 'left' || k === 'right') { turn(K.clickAction(k === 'left' ? 0 : 1, 1, R?.rtl)); stage.focus({ preventScroll: true }); return; }
    cmds[k]?.();
  });
  function syncMenuRadio() {
    for (const it of win.body.querySelectorAll('.menu-item[data-radio]')) it.classList.toggle('checked', it.dataset.command === `${it.dataset.radio}:${prefs[it.dataset.radio]}`);
  }
  q('[data-q]').addEventListener('input', (e) => { query = e.target.value; renderShelf(); });
  q('[data-sort]').addEventListener('change', (e) => { prefs = K.normalizePrefs({ ...prefs, sort: e.target.value }); state.prefs = prefs; scheduleSave(); renderShelf(); syncMenuRadio(); log('books.pref', { sort: prefs.sort }, 'ok'); });
  booksEl.addEventListener('click', (e) => { const it = e.target.closest('.bk-item'); if (it) { select(it.dataset.path); sound.play('select'); } });
  booksEl.addEventListener('dblclick', (e) => { const it = e.target.closest('.bk-item'); if (it) showReaderFor(it.dataset.path); });
  booksEl.addEventListener('keydown', (e) => {
    if (e.target.closest('.bk-item') == null || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter') { e.preventDefault(); if (selectedPath) showReaderFor(selectedPath); }
    else if (e.key === 'Delete') { e.preventDefault(); trashBook(); }
    else if (e.key.startsWith('Arrow')) { if (spatial(e.key)) e.preventDefault(); }
    else if (e.key === 'Home' || e.key === 'End') { const items = [...booksEl.querySelectorAll('.bk-item')]; const t = e.key === 'Home' ? items[0] : items.at(-1); if (t) { e.preventDefault(); select(t.dataset.path); } }
  });
  booksEl.addEventListener('contextmenu', (e) => {
    const it = e.target.closest('.bk-item');
    e.preventDefault();
    if (it) select(it.dataset.path, false);
    let m = document.getElementById('booksMenu');
    if (!m) { m = document.createElement('div'); m.id = 'booksMenu'; m.className = 'menu'; m.setAttribute('role', 'menu'); document.body.append(m); m.addEventListener('w95:command', (ev) => m.target?.(ev.detail.command)); }
    m.target = (c) => cmds[c]?.();
    const item = (c, l, cls = '') => `<div class="menu-item${cls}" data-command="${c}"><span class="label">${l}</span></div>`;
    m.innerHTML = it
      ? item('open', '開く(<u>O</u>)', ' default') + item('info', '本の情報(<u>I</u>)') + '<div class="menu-separator"></div>' + item('export', 'パソコンへ書き出す(<u>E</u>)') + item('trash', 'ゴミ箱へ入れる(<u>D</u>)')
      : item('add', '本を足す(<u>A</u>)...') + item('samples', '見本の本を作る(<u>M</u>)');
    sound.play('menu');
    w95.popupMenu(m, e.clientX, e.clientY);
  });
  stage.addEventListener('keydown', onKey);
  stage.addEventListener('wheel', onWheel, { passive: false });
  fileIn.addEventListener('change', async () => { const files = [...fileIn.files]; fileIn.value = ''; if (files.length) { if (R) await backToShelf(); await importFiles(files); } });
  // パソコンのファイルを落として足す
  const main = q('.bk-main');
  main.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); main.classList.add('drop-ok'); } });
  main.addEventListener('dragleave', (e) => { if (e.target === main || !main.contains(e.relatedTarget)) main.classList.remove('drop-ok'); });
  main.addEventListener('drop', async (e) => { e.preventDefault(); main.classList.remove('drop-ok'); const files = [...e.dataTransfer.files]; if (!files.length) return; if (R) await backToShelf(); await importFiles(files); });
  // デスクトップのアイコンをこの窓へ落としたら、本棚へ写す（/本 の中の本なら開く）
  win.body.addEventListener('fos:drop-file', async (e) => {
    const p = e.detail.path;
    if (extname(p).toLowerCase() !== '.epub') { say('EPUB（.epub）のファイルだけを本棚に足せます。'); sound.play('error'); return; }
    if (p.startsWith(DIR + '/')) { await showReaderFor(p); return; }
    if (R) await backToShelf();
    await importFiles([new File([await fs.readBlob(p)], basename(p), { type: 'application/epub+zip' })]);
  });
  let fsTimer = 0;
  const onFs = (e) => { const dirs = e.detail.dirs || []; if (!R && dirs.some((d) => d === DIR || d.startsWith(DIR + '/') || d === '/')) { clearTimeout(fsTimer); fsTimer = setTimeout(() => { if (!R) refreshShelf(); }, 200); } };
  fs.fs.addEventListener('change', onFs);
  win.cleanup = () => {
    fs.fs.removeEventListener('change', onFs); clearTimeout(fsTimer); ro.disconnect(); clearTimeout(roTimer); clearTimeout(prefTimer);
    closeBook();
    for (const c of cache.values()) if (c.coverUrl) URL.revokeObjectURL(c.coverUrl);
    cache.clear();
  };

  await loadState();
  syncMenuRadio(); syncTurnButtons();
  await refreshShelf();
  log('books.launch', { books: shelf.length, path: args.path || '' }, 'ok');
  if (args.path && (await fs.exists(args.path))) await showReaderFor(args.path);
  else booksEl.querySelector('.bk-item[tabindex="0"]')?.focus({ preventScroll: true }) ?? emptyEl.querySelector('button')?.focus();
  return win;
}
