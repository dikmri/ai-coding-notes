// シェル: アプリの起動、ファイルを開く、デスクトップのアイコン、タスクバー、スタートメニュー、開く・保存のダイアログ、設定
import * as fs from './fs.mjs';
import * as wm from './wm.mjs';
import * as sound from './sound.mjs';
import { drawWallpaper, forgetWall } from './boot.mjs';
import { appFor, typeName } from './core/assoc.mjs';
import { basename, dirname, extname, normalize } from './core/path.mjs';
import { openKey } from './core/winfind.mjs';

const $ = (s) => document.querySelector(s);
const log = (...a) => (window.dlog || (() => {}))(...a);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const APPS = {
  filer: { name: 'ファイル マネージャ', icon: 'icons/folder.svg' },
  notepad: { name: 'メモ帳', icon: 'icons/notepad.svg' },
  modeler: { name: 'ローポリ モデラー', icon: 'icons/modeler.svg' },
  synth: { name: 'SID 風シンセ', icon: 'icons/synth.svg' },
  viewer: { name: '画像と音のビューア', icon: 'icons/viewer.svg' },
  settings: { name: '設定', icon: 'icons/settings.svg' },
  icosaria: { name: '蒼海と白柱のイコサリア', icon: 'icons/icosaria.svg' },
  calc: { name: '電卓', icon: 'icons/calc.svg' },
  stickies: { name: '付箋', icon: 'icons/stickies.svg' },
  clock: { name: '時計とタイマー', icon: 'icons/clock.svg' },
  charmap: { name: '文字と色の見本帳', icon: 'icons/charmap.svg' },
  paint: { name: 'お絵かき', icon: 'icons/paint.svg' },
  player: { name: '音楽プレーヤー', icon: 'icons/player.svg' },
  terminal: { name: '端末', icon: 'icons/terminal.svg' },
  monitor: { name: 'システム モニタ', icon: 'icons/monitor.svg' },
  calendar: { name: 'カレンダー', icon: 'icons/calendar.svg' },
  recorder: { name: '音声レコーダー', icon: 'icons/recorder.svg' },
  capture: { name: '画面キャプチャ', icon: 'icons/capture.svg' },
  puzzle: { name: 'プリズム回廊', icon: 'icons/puzzle.svg' },
  browser: { name: 'ウェブブラウザ', icon: 'icons/browser.svg' },
};

/* ---------- 設定 ---------- */
const DEFAULTS = { wallpaper: 'arcadia-lagoon', skipBoot: false, volume: 0.6, mute: false, ui: true, keys: true };
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('fos-settings') || '{}') }; } catch { /* 読めない */ }
export const getSettings = () => ({ ...settings });
export const events = new EventTarget();
export function saveSettings(patch) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem('fos-settings', JSON.stringify(settings)); } catch { /* 保存できない */ }
  sound.configure({ volume: settings.volume, mute: settings.mute, ui: settings.ui, keys: settings.keys });
  if ('wallpaper' in patch) {
    // 仮想ドライブの画像は、描き直して保存されているかもしれないので、前に読んだ絵を捨ててから描く
    if (String(patch.wallpaper).startsWith('file:')) forgetWall(patch.wallpaper);
    drawWallpaper($('#wall'), settings.wallpaper);
  }
  syncVolume();
  events.dispatchEvent(new CustomEvent('settings', { detail: settings }));
  log('settings.save', patch, 'ok');
}

/* ---------- 最近使ったファイル ---------- */
export function recent() { try { return JSON.parse(localStorage.getItem('fos-recent') || '[]'); } catch { return []; } }
export function addRecent(path) { const r = [path, ...recent().filter((p) => p !== path)].slice(0, 10); try { localStorage.setItem('fos-recent', JSON.stringify(r)); } catch { /* 保存できない */ } }

/* ---------- アプリとファイル ---------- */
export function iconFor(entry) {
  if (entry.kind === 'dir') return entry.path === fs.TRASH ? 'icons/trash.svg' : 'icons/folder.svg';
  const app = appFor(entry.name || entry.path);
  return app && APPS[app] && app !== 'filer' ? APPS[app].icon : 'icons/document.svg';
}
export async function msgbox(o) {
  sound.play(o.icon === 'error' ? 'error' : o.icon === 'warning' ? 'notify' : 'notify');
  return w95.msgbox(o);
}
export const os = { fs, wm, sound, launch, openFile, fileDialog, msgbox, getSettings, saveSettings, recent, addRecent, iconFor, esc, APPS, events, log };

export async function launch(app, args = {}, rect = {}) {
  if (!APPS[app]) throw new Error('知らないアプリです: ' + app);
  try {
    const mod = await import(`./apps/${app}.mjs`);
    const win = await mod.launch(os, args, rect);
    log('app.launch', { app, args }, 'ok');
    return win;
  } catch (e) {
    log('app.launch', { app, args }, 'error: ' + e.message);
    msgbox({ title: APPS[app].name, text: `${APPS[app].name} を開けませんでした。\n\n${e.message}`, icon: 'error' });
    return null;
  }
}
// 同じアプリで同じ場所を開いている窓があれば、新しく開かずにその窓を手前に出す。
// 開いている途中（読み込み中）の窓も覚えておき、続けて2回開いても窓が二重にならないようにする
const opening = new Map();
async function launchAt(app, path) {
  const open = wm.find(app, path);
  if (open) { await wm.raise(open); log('shell.reuse', { app, path }, 'ok ' + open.id); return open; }
  const key = openKey(app, path);
  if (opening.has(key)) { log('shell.reuse', { app, path }, 'ok opening'); return opening.get(key); }
  const p = launch(app, { path }).finally(() => opening.delete(key));
  opening.set(key, p);
  return p;
}
export async function openFile(path, withApp) {
  const st = await fs.stat(path);
  if (!st) { msgbox({ title: 'Future OS', text: `「${path}」が見つかりません。\n\n移動したか、消された可能性があります。`, icon: 'warning' }); return null; }
  if (st.kind === 'dir') return launchAt('filer', path);
  const app = withApp || appFor(path) || (wm.find('notepad', path) ? 'notepad' : null);
  if (!app) {
    const a = await msgbox({ title: 'ファイルを開く', text: `「${basename(path)}」を開くアプリが決まっていません。\n\nメモ帳で文字として開きますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
    if (a !== 'はい') return null;
    addRecent(path);
    return launchAt('notepad', path);
  }
  addRecent(path);
  return launchAt(app, path);
}

/* ---------- 開く・保存のダイアログ ---------- */
export function fileDialog({ mode = 'open', title, dir = '/ドキュメント', name = '', exts = [], typeLabel = 'すべてのファイル' } = {}) {
  return new Promise(async (resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog file-dlg';
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text"></div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div>
      <div class="window-body">
        <div class="fd-row"><label for="fdDir">ファイルの場所(<u>I</u>):</label><select id="fdDir"></select></div>
        <ul class="list fd-list" tabindex="0" style="margin-top:6px"></ul>
        <div class="fd-row"><label for="fdName">ファイル名(<u>N</u>):</label><input type="text" id="fdName" autocomplete="off" spellcheck="false"></div>
        <div class="fd-row"><span>ファイルの種類:</span><span class="fd-type"></span></div>
        <div class="button-row"><button type="button" class="default" data-ok>${mode === 'save' ? '保存(<u>S</u>)' : '開く(<u>O</u>)'}</button><button type="button" data-close="">キャンセル</button></div>
      </div>`;
    dlg.querySelector('.title-bar-text').textContent = title || (mode === 'save' ? '名前を付けて保存' : '開く');
    dlg.querySelector('.fd-type').textContent = `${typeLabel}${exts.length ? '（' + exts.map((e) => '*' + e).join(';' + String.fromCharCode(0x200b)) + '）' : ''}`;
    document.body.append(dlg);
    const ul = dlg.querySelector('.fd-list'), nameIn = dlg.querySelector('#fdName'), dirSel = dlg.querySelector('#fdDir');
    nameIn.value = name;
    let cur = normalize(dir);
    if (!(await fs.exists(cur))) cur = '/';
    async function show(d) {
      cur = normalize(d);
      const anc = []; for (let p = cur; ; p = dirname(p)) { anc.unshift(p); if (p === '/') break; }
      const extra = ['/デスクトップ', '/ドキュメント', '/モデル', '/音楽', '/画像'].filter((p) => !anc.includes(p));
      dirSel.innerHTML = anc.map((p, i) => `<option value="${esc(p)}">${'　'.repeat(i)}${p === '/' ? 'マイ ドライブ' : esc(basename(p))}</option>`).join('') + extra.map((p) => `<option value="${esc(p)}">${esc(basename(p))}</option>`).join('');
      dirSel.value = cur;
      const items = (await fs.list(cur)).filter((e) => e.kind === 'dir' ? e.path !== fs.TRASH : !exts.length || exts.includes(extname(e.name).toLowerCase()));
      ul.innerHTML = (cur === '/' ? '' : `<li data-up="1"><img class="icon" src="icons/folder.svg" alt="" width="16" height="16">..（ひとつ上へ）</li>`) +
        items.map((e) => `<li data-path="${esc(e.path)}" data-kind="${e.kind}"><img class="icon" src="${iconFor(e)}" alt="" width="16" height="16">${esc(e.name)}</li>`).join('');
    }
    async function ok() {
      const sel = ul.querySelector('li.selected');
      if (sel && sel.dataset.kind === 'dir' && !nameIn.value.trim()) return show(sel.dataset.path);
      let n = nameIn.value.trim();
      if (!n) { sound.play('error'); nameIn.focus(); return; }
      if (/[\/\\]/.test(n)) { await msgbox({ title: dlg.querySelector('.title-bar-text').textContent, text: 'ファイル名に / や \\ は使えません。', icon: 'warning' }); return; }
      if (mode === 'save' && exts.length && !extname(n)) n += exts[0];
      const path = normalize(cur + '/' + n), st = await fs.stat(path);
      if (st && st.kind === 'dir') return show(path);
      if (mode === 'open' && !st) { await msgbox({ title: '開く', text: `「${n}」が見つかりません。\n\nファイル名を確かめてください。`, icon: 'warning' }); return; }
      if (mode === 'save' && st) {
        const a = await msgbox({ title: '名前を付けて保存', text: `「${n}」はすでにあります。\n\n上書きしますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
        if (a !== 'はい') return;
      }
      w95.closeDialog(dlg, path);
    }
    ul.addEventListener('click', (e) => {
      const li = e.target.closest('li'); if (!li) return;
      ul.querySelectorAll('.selected').forEach((x) => x.classList.remove('selected')); li.classList.add('selected'); sound.play('select');
      if (li.dataset.kind === 'file') nameIn.value = basename(li.dataset.path);
    });
    ul.addEventListener('dblclick', (e) => { const li = e.target.closest('li'); if (!li) return; if (li.dataset.up) show(dirname(cur)); else if (li.dataset.kind === 'dir') show(li.dataset.path); else { nameIn.value = basename(li.dataset.path); ok(); } });
    dirSel.addEventListener('change', () => show(dirSel.value));
    dlg.querySelector('[data-ok]').addEventListener('click', ok);
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok(); } });
    await show(cur);
    const result = await w95.openDialog(dlg);
    dlg.remove();
    log('dialog.file', { mode, result }, 'ok');
    resolve(result || null);
  });
}

/* ---------- デスクトップ ---------- */
const iconsEl = $('#icons'), desk = $('#desk');
const SYS = [
  { key: 'sys:drive', name: 'マイ ドライブ', icon: 'icons/drive.svg', open: () => launchAt('filer', '/') },
  { key: 'sys:trash', name: 'ゴミ箱', icon: 'icons/trash.svg', open: () => launchAt('filer', fs.TRASH), path: fs.TRASH },
  { key: 'app:notepad', name: 'メモ帳', icon: APPS.notepad.icon, open: () => launch('notepad') },
  { key: 'app:modeler', name: 'ローポリ モデラー', icon: APPS.modeler.icon, open: () => launch('modeler') },
  { key: 'app:synth', name: 'SID 風シンセ', icon: APPS.synth.icon, open: () => launch('synth') },
  { key: 'app:settings', name: '設定', icon: APPS.settings.icon, open: () => launch('settings') },
  { key: 'app:icosaria', name: 'イコサリア', icon: APPS.icosaria.icon, open: () => launch('icosaria') },
  { key: 'app:calc', name: '電卓', icon: APPS.calc.icon, open: () => launch('calc') },
  { key: 'app:stickies', name: '付箋', icon: APPS.stickies.icon, open: () => launch('stickies') },
  { key: 'app:clock', name: '時計', icon: APPS.clock.icon, open: () => launch('clock') },
  { key: 'app:paint', name: 'お絵かき', icon: APPS.paint.icon, open: () => launch('paint') },
  { key: 'app:player', name: '音楽', icon: APPS.player.icon, open: () => launch('player') },
  { key: 'app:browser', name: 'ネット', icon: APPS.browser.icon, open: () => launch('browser') },
];
let deskItems = [], pos = {};
try { pos = JSON.parse(localStorage.getItem('fos-icons') || '{}'); } catch { pos = {}; }
const savePos = () => { try { localStorage.setItem('fos-icons', JSON.stringify(pos)); } catch { /* 保存できない */ } };
const CELL_W = 80, CELL_H = 74;
function freeCell(used) {
  const rows = Math.max(1, Math.floor((desk.clientHeight - 8) / CELL_H));
  for (let i = 0; ; i++) { const c = { x: 6 + Math.floor(i / rows) * CELL_W, y: 6 + (i % rows) * CELL_H }; if (!used.has(c.x + ',' + c.y)) return c; }
}
export async function renderDesktop() {
  const files = await fs.list('/デスクトップ');
  const trashFull = (await fs.list(fs.TRASH)).length > 0;
  deskItems = [...SYS.map((s) => ({ ...s, icon: s.key === 'sys:trash' && trashFull ? 'icons/trash-full.svg' : s.icon })),
    ...files.map((f) => ({ key: 'file:' + f.path, name: f.name, icon: iconFor(f), path: f.path, entry: f, open: () => openFile(f.path) }))];
  const used = new Set(deskItems.filter((d) => pos[d.key]).map((d) => pos[d.key].x + ',' + pos[d.key].y));
  for (const d of deskItems) if (!pos[d.key]) { pos[d.key] = freeCell(used); used.add(pos[d.key].x + ',' + pos[d.key].y); }
  const selected = new Set([...iconsEl.querySelectorAll('.selected')].map((li) => li.dataset.key));
  iconsEl.innerHTML = deskItems.map((d) => `<li class="desk-icon${selected.has(d.key) ? ' selected' : ''}" role="option" aria-selected="${selected.has(d.key)}" data-key="${esc(d.key)}" style="left:${pos[d.key].x}px;top:${pos[d.key].y}px"><img src="${d.icon}" alt=""><span>${esc(d.name)}</span></li>`).join('');
  savePos();
}
const itemOf = (li) => deskItems.find((d) => d.key === li.dataset.key);
function selectIcon(li, add) {
  if (!add) iconsEl.querySelectorAll('.selected').forEach((x) => { x.classList.remove('selected'); x.setAttribute('aria-selected', 'false'); });
  if (li) { li.classList.toggle('selected', add ? !li.classList.contains('selected') : true); li.setAttribute('aria-selected', li.classList.contains('selected')); iconsEl.querySelectorAll('.focus').forEach((x) => x.classList.remove('focus')); li.classList.add('focus'); }
}
const selectedItems = () => [...iconsEl.querySelectorAll('.selected')].map(itemOf).filter(Boolean);
async function trashItems(items) {
  const files = items.filter((d) => d.path && d.key.startsWith('file:'));
  if (!files.length) { sound.play('error'); return; }
  for (const d of files) await fs.trash(d.path);
  sound.play('trash');
}
function renameIcon(li) {
  const d = itemOf(li);
  if (!d || !d.key.startsWith('file:')) { sound.play('error'); return; }
  const span = li.querySelector('span'), input = document.createElement('input');
  input.value = d.name; span.replaceWith(input); input.focus();
  const dot = d.name.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : d.name.length);
  let done = false;
  const finish = async (save) => {
    if (done) return; done = true;
    const v = input.value.trim();
    if (save && v && v !== d.name) { try { const to = await fs.rename(d.path, v); pos['file:' + to] = pos[d.key]; } catch (e) { msgbox({ title: 'Future OS', text: e.message, icon: 'error' }); } }
    renderDesktop();
  };
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing) finish(true); if (e.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true));
}
async function properties(path) {
  const st = await fs.stat(path);
  if (!st) return;
  let size = st.size, count = 0;
  if (st.kind === 'dir') for (const p of await fs.walk(path)) { const s = await fs.stat(p); if (s.kind === 'file') { size += s.size; count++; } }
  const when = st.mtime ? new Date(st.mtime).toLocaleString('ja-JP') : '－';
  msgbox({ title: `${st.name || 'マイ ドライブ'}のプロパティ`, icon: 'info', text: `名前: ${st.name || 'マイ ドライブ'}\n種類: ${st.kind === 'dir' ? 'フォルダ' : typeName(st.name)}\n場所: ${dirname(st.path)}\n大きさ: ${fs.human(size)}${st.kind === 'dir' ? `（ファイル ${count} 個）` : ''}\n更新日時: ${when}` });
}
export { properties };
async function newItem(kind) {
  const name = await fs.freeName('/デスクトップ', kind === 'dir' ? '新しいフォルダ' : '新しいテキスト文書.txt');
  if (kind === 'dir') await fs.mkdir('/デスクトップ/' + name); else await fs.write('/デスクトップ/' + name, '');
  await renderDesktop();
  const li = iconsEl.querySelector(`[data-key="${CSS.escape('file:/デスクトップ/' + name)}"]`);
  if (li) { selectIcon(li); renameIcon(li); }
}
async function importFiles(fileList, dir) {
  let n = 0;
  for (const f of fileList) { const name = await fs.freeName(dir, f.name); await fs.write(dir + '/' + name, f); n++; }
  if (n) sound.play('drop');
  log('fs.import', { dir, count: n }, 'ok');
  return n;
}
export { importFiles };
function deskMenu(x, y, li) {
  let m = $('#deskMenu');
  if (!m) { m = document.createElement('div'); m.id = 'deskMenu'; m.className = 'menu'; m.setAttribute('role', 'menu'); document.body.append(m); m.addEventListener('w95:command', onDeskCommand); }
  const d = li && itemOf(li), isFile = d && d.key.startsWith('file:');
  m.innerHTML = d
    ? `<div class="menu-item default" data-command="d.open"><span class="label">開く(<u>O</u>)</span></div>` +
      (d.key === 'sys:trash' ? '<div class="menu-item" data-command="d.empty"><span class="label">ゴミ箱を空にする(<u>B</u>)</span></div>' : '') +
      `<div class="menu-separator"></div><div class="menu-item" data-command="d.rename"${isFile ? '' : ' aria-disabled="true"'}><span class="label">名前の変更(<u>M</u>)</span></div><div class="menu-item" data-command="d.delete"${isFile ? '' : ' aria-disabled="true"'}><span class="label">削除(<u>D</u>)</span></div><div class="menu-separator"></div><div class="menu-item" data-command="d.props"${d.path ? '' : ' aria-disabled="true"'}><span class="label">プロパティ(<u>R</u>)</span></div>`
    : `<div class="menu-item"><span class="label">新規作成(<u>W</u>)</span><div class="menu" role="menu"><div class="menu-item" data-command="d.newdir"><span class="label">フォルダ(<u>F</u>)</span></div><div class="menu-item" data-command="d.newtxt"><span class="label">テキスト文書(<u>T</u>)</span></div></div></div>` +
      `<div class="menu-separator"></div><div class="menu-item" data-command="d.arrange"><span class="label">アイコンの整列(<u>I</u>)</span></div><div class="menu-item" data-command="d.refresh"><span class="label">最新の情報に更新(<u>E</u>)</span></div><div class="menu-separator"></div><div class="menu-item" data-command="d.wall"><span class="label">壁紙の変更(<u>P</u>)...</span></div>`;
  sound.play('menu');
  w95.popupMenu(m, x, y);
}
async function onDeskCommand(e) {
  const c = e.detail.command, items = selectedItems();
  if (c === 'd.open') items.forEach((d) => d.open());
  if (c === 'd.empty') { await fs.emptyTrash(); sound.play('trash'); }
  if (c === 'd.rename') { const li = iconsEl.querySelector('.selected'); if (li) renameIcon(li); }
  if (c === 'd.delete') trashItems(items);
  if (c === 'd.props' && items[0]?.path) properties(items[0].path);
  if (c === 'd.newdir') newItem('dir');
  if (c === 'd.newtxt') newItem('txt');
  if (c === 'd.arrange') { pos = {}; renderDesktop(); }
  if (c === 'd.refresh') renderDesktop();
  if (c === 'd.wall') launch('settings', { tab: 0 });
}
export function initDesktop() {
  fs.fs.addEventListener('change', (e) => { const dirs = e.detail.dirs || []; if (dirs.some((d) => d === '/デスクトップ' || d === fs.TRASH || d === '/')) renderDesktop(); });
  iconsEl.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.desk-icon');
    if (e.button === 2) { if (li && !li.classList.contains('selected')) selectIcon(li); return; }
    if (!li) { if (e.target === iconsEl) selectIcon(null); return; }
    if (e.button !== 0) return;
    if (!li.classList.contains('selected') || e.ctrlKey) selectIcon(li, e.ctrlKey);
    sound.play('select');
    // アイコンをつかんで動かす（4px 動いてから）。ゴミ箱の上で離すとゴミ箱へ、窓の上で離すとその窓へ渡す
    const start = { x: e.clientX, y: e.clientY }, p0 = { ...pos[li.dataset.key] };
    let moving = false;
    li.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (!moving && Math.hypot(dx, dy) < 4) return;
      moving = true; li.classList.add('dragging');
      li.style.left = p0.x + dx + 'px'; li.style.top = p0.y + dy + 'px';
    };
    li.addEventListener('pointermove', mv);
    li.addEventListener('lostpointercapture', async (ev) => {
      li.removeEventListener('pointermove', mv);
      li.classList.remove('dragging');
      if (!moving) return;
      li.style.visibility = 'hidden';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      li.style.visibility = '';
      const d = itemOf(li), target = under && under.closest('.desk-icon'), winEl = under && under.closest('.wins > .window');
      if (target && target.dataset.key === 'sys:trash' && d.path) { await trashItems(selectedItems()); return; }
      if (winEl && d.path) { winEl.querySelector('.app-body').dispatchEvent(new CustomEvent('fos:drop-file', { detail: { path: d.path }, bubbles: true })); renderDesktop(); return; }
      const dr = desk.getBoundingClientRect();
      pos[li.dataset.key] = { x: Math.max(0, Math.round((ev.clientX - dr.left - (start.x - dr.left - p0.x) - 6) / CELL_W) * CELL_W + 6), y: Math.max(0, Math.round((ev.clientY - dr.top - (start.y - dr.top - p0.y) - 6) / CELL_H) * CELL_H + 6) };
      savePos(); renderDesktop();
    }, { once: true });
  });
  iconsEl.addEventListener('dblclick', (e) => { const li = e.target.closest('.desk-icon'); if (li) itemOf(li).open(); });
  iconsEl.addEventListener('contextmenu', (e) => { e.preventDefault(); deskMenu(e.clientX, e.clientY, e.target.closest('.desk-icon')); });
  iconsEl.addEventListener('keydown', (e) => {
    const lis = [...iconsEl.querySelectorAll('.desk-icon')], cur = iconsEl.querySelector('.focus') || lis[0];
    if (!cur) return;
    if (e.key === 'Enter') { e.preventDefault(); selectedItems().forEach((d) => d.open()); }
    else if (e.key === 'F2') { e.preventDefault(); renameIcon(cur); }
    else if (e.key === 'Delete') { e.preventDefault(); trashItems(selectedItems()); }
    else if (e.key === 'a' && e.ctrlKey) { e.preventDefault(); lis.forEach((li) => { li.classList.add('selected'); li.setAttribute('aria-selected', 'true'); }); }
    else if (e.key.startsWith('Arrow')) {
      // いまのアイコンから、押した向きにある一番近いアイコンへ移る
      const r0 = cur.getBoundingClientRect(), dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
      let best = null, bd = Infinity;
      for (const li of lis) { if (li === cur) continue; const r = li.getBoundingClientRect(), dx = r.left - r0.left, dy = r.top - r0.top; if (dx * dir[0] + dy * dir[1] <= 0) continue; const dist = Math.abs(dx) * (dir[0] ? 1 : 3) + Math.abs(dy) * (dir[1] ? 1 : 3); if (dist < bd) { bd = dist; best = li; } }
      if (best) { e.preventDefault(); selectIcon(best, false); sound.play('select'); }
    }
  });
  // パソコンからファイルを落として取り込む
  desk.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files') && !e.target.closest('.wins > .window')) { e.preventDefault(); desk.classList.add('drop-ok'); } });
  desk.addEventListener('dragleave', (e) => { if (e.target === desk || e.target === iconsEl) desk.classList.remove('drop-ok'); });
  desk.addEventListener('drop', async (e) => { if (e.target.closest('.wins > .window')) return; e.preventDefault(); desk.classList.remove('drop-ok'); await importFiles(e.dataTransfer.files, '/デスクトップ'); });
  addEventListener('resize', () => drawWallpaper($('#wall'), settings.wallpaper));
  renderDesktop();
}

/* ---------- タスクバー: 時計と音量 ---------- */
function tick() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  $('#clock').title = d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) + '（押すと時計とタイマーを開きます）';
}
function syncVolume() {
  const r = $('#volRange'), m = $('#volMute');
  if (r) r.value = Math.round(settings.volume * 100);
  if (m) m.checked = settings.mute;
}
export function initTaskbar() {
  tick(); setInterval(tick, 5000);
  $('#clock').addEventListener('click', () => launch('clock', { tab: 0 }));
  syncVolume();
  const pop = $('#volPop');
  $('#volBtn').addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; sound.play('click'); });
  $('#volRange').addEventListener('input', (e) => saveSettings({ volume: e.target.value / 100 }));
  $('#volRange').addEventListener('change', () => sound.play('select'));
  $('#volMute').addEventListener('change', (e) => saveSettings({ mute: e.target.checked }));
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !e.target.closest('#volPop, #volBtn')) pop.hidden = true; });
  initStart();
}

/* ---------- スタートメニュー ---------- */
const startEl = $('#start'), startBtn = $('#startBtn'), listEl = $('#startList'), qEl = $('#startQ');
let subEl = null;
function closeSub() { if (subEl) { subEl.remove(); subEl = null; } }
function startItems() {
  return [
    { label: 'プログラム(<u>P</u>)', icon: 'icons/app.svg', sub: () => Object.entries(APPS).map(([id, a]) => ({ label: esc(a.name), icon: a.icon, run: () => launch(id) })) },
    { label: '最近使ったファイル(<u>D</u>)', icon: 'icons/document.svg', sub: () => recent().map((p) => ({ label: esc(basename(p)), icon: iconFor({ kind: 'file', name: p }), run: () => openFile(p) })) },
    { label: 'ファイル マネージャ(<u>F</u>)', icon: APPS.filer.icon, run: () => launch('filer', { path: '/' }) },
    { label: '設定(<u>S</u>)', icon: APPS.settings.icon, run: () => launch('settings') },
    { label: 'ヘルプ(<u>H</u>)', icon: 'icons/help.svg', run: () => openFile('/ドキュメント/はじめに.txt') },
    { sep: true },
    { label: 'Future OS の終了(<u>U</u>)...', icon: 'icons/logo.svg', run: shutdownDialog },
  ];
}
let current = [];
function renderStart(items, small) {
  current = items;
  listEl.innerHTML = items.length ? items.map((it, i) => (it.sep ? '<li class="start-sep" role="separator"></li>' : `<li role="none"><div class="start-item${small ? ' small' : ''}${it.sub ? ' sub' : ''}" role="menuitem" tabindex="-1" data-i="${i}"><img src="${it.icon}" alt=""><span>${it.label}</span></div></li>`)).join('') : '<li class="start-empty">見つかりませんでした</li>';
}
function openSub(div, item) {
  closeSub();
  const items = item.sub();
  subEl = document.createElement('ul');
  subEl.className = 'start-sub';
  subEl.setAttribute('role', 'menu');
  subEl.innerHTML = items.length ? items.map((it, i) => `<li role="none"><div class="start-item small" role="menuitem" tabindex="-1" data-i="${i}"><img src="${it.icon}" alt=""><span>${it.label}</span></div></li>`).join('') : '<li class="start-empty">（空）</li>';
  document.body.append(subEl);
  const r = div.getBoundingClientRect();
  subEl.style.left = r.right - 3 + 'px';
  subEl.style.top = Math.min(r.top, innerHeight - 30 - subEl.offsetHeight) + 'px';
  subEl.items = items;
  subEl.addEventListener('click', (e) => { const d = e.target.closest('[data-i]'); if (!d) return; const it = items[d.dataset.i]; closeStart(); sound.play('menu'); it.run(); });
  subEl.addEventListener('pointerover', (e) => { const d = e.target.closest('.start-item'); subEl.querySelectorAll('.active').forEach((x) => x.classList.remove('active')); if (d) d.classList.add('active'); });
}
export function openStart() {
  startEl.hidden = false; startBtn.setAttribute('aria-expanded', 'true'); qEl.value = ''; renderStart(startItems()); qEl.focus(); sound.play('menu');
}
export function closeStart() { startEl.hidden = true; startBtn.setAttribute('aria-expanded', 'false'); closeSub(); }
function activeIndex() { const a = listEl.querySelector('.start-item.active'); return a ? +a.dataset.i : -1; }
function setActive(i) { listEl.querySelectorAll('.active').forEach((x) => x.classList.remove('active')); const d = listEl.querySelector(`[data-i="${i}"]`); if (d) { d.classList.add('active'); d.scrollIntoView({ block: 'nearest' }); } }
function runItem(i, div) {
  const it = current[i];
  if (!it) return;
  if (it.sub) { openSub(div, it); return; }
  closeStart(); sound.play('menu'); it.run();
}
// 検索: アプリの名前と、仮想ドライブの全部のファイル名から探す
let searchSeq = 0;
async function search(q) {
  const id = ++searchSeq, s = q.trim().toLowerCase();
  if (!s) { renderStart(startItems()); return; }
  const apps = Object.entries(APPS).filter(([, a]) => a.name.toLowerCase().includes(s)).map(([id2, a]) => ({ label: esc(a.name), icon: a.icon, run: () => launch(id2) }));
  const files = (await fs.walk('/')).filter((p) => basename(p).toLowerCase().includes(s) && !p.startsWith(fs.TRASH + '/')).slice(0, 12)
    .map((p) => ({ label: `${esc(basename(p))} <span style="color:var(--GrayText)">${esc(dirname(p))}</span>`, icon: extname(p) ? iconFor({ kind: 'file', name: p }) : 'icons/folder.svg', run: () => openFile(p) }));
  if (id !== searchSeq) return;
  renderStart([...apps, ...files], true);
  setActive(0);
}
function initStart() {
  startBtn.addEventListener('click', () => (startEl.hidden ? openStart() : closeStart()));
  qEl.addEventListener('input', () => { closeSub(); search(qEl.value); });
  listEl.addEventListener('click', (e) => { const d = e.target.closest('[data-i]'); if (d) runItem(+d.dataset.i, d); });
  listEl.addEventListener('pointerover', (e) => { const d = e.target.closest('.start-item'); if (!d) return; setActive(+d.dataset.i); const it = current[+d.dataset.i]; if (it && it.sub) openSub(d, it); else closeSub(); });
  startEl.addEventListener('keydown', (e) => {
    const n = current.length;
    if (e.key === 'Escape') { e.preventDefault(); closeStart(); startBtn.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      let i = activeIndex();
      for (let k = 0; k < n; k++) { i = (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; if (!current[i].sep) break; }
      setActive(i);
    }
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const i = Math.max(0, activeIndex()); runItem(i, listEl.querySelector(`[data-i="${i}"]`)); }
    if (e.key === 'ArrowRight') { const i = activeIndex(); if (current[i]?.sub) { e.preventDefault(); openSub(listEl.querySelector(`[data-i="${i}"]`), current[i]); } }
  });
  document.addEventListener('pointerdown', (e) => { if (!startEl.hidden && !e.target.closest('#start, #startBtn, .start-sub')) closeStart(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.ctrlKey) { e.preventDefault(); startEl.hidden ? openStart() : closeStart(); } });
}

/* ---------- 終了 ---------- */
async function shutdownDialog() {
  const dlg = document.createElement('dialog');
  dlg.className = 'window dialog';
  dlg.style.width = '330px';
  dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">Future OS の終了</div><div class="title-bar-controls"><button type="button" class="close" aria-label="閉じる"></button></div></div>
    <div class="window-body"><div class="msgbox-body"><img src="icons/logo.svg" alt="" width="32" height="32" style="image-rendering:pixelated"><div class="col">
    <p>次の中から選んでください:</p>
    <label><input type="radio" name="sd" value="off" checked> 電源を切れる状態にする(<u>S</u>)</label>
    <label><input type="radio" name="sd" value="reboot"> 再起動する(<u>R</u>)</label>
    <label><input type="radio" name="sd" value="guide"> 図鑑「出来る！」へ戻る(<u>B</u>)</label></div></div>
    <div class="button-row"><button type="button" class="default" data-close="ok">OK</button><button type="button" data-close="">キャンセル</button></div></div>`;
  document.body.append(dlg);
  sound.play('notify');
  const r = await w95.openDialog(dlg);
  const choice = dlg.querySelector('input[name=sd]:checked').value;
  dlg.remove();
  if (r !== 'ok') return;
  log('os.shutdown', { choice }, 'ok');
  wm.saveSession();
  sound.play('shutdown');
  document.body.animate([{ filter: 'none' }, { filter: 'grayscale(1) brightness(.4)' }], { duration: 1200, fill: 'forwards' });
  await new Promise((ok) => setTimeout(ok, 2200));
  document.body.getAnimations().forEach((a) => a.cancel());
  if (choice === 'guide') { location.href = '../'; return; }
  if (choice === 'reboot') { location.reload(); return; }
  for (const id of ['#desk', '#taskbar', '#start']) $(id).hidden = true;
  $('#off').hidden = false;
}

/* ---------- 知らせ（トースト） ----------
   popover="manual" で、閉じるまで残す。入れ物は名前付きの領域（role="region"）にまとめ、右下に下から積む。
   モーダルのダイアログが開いている間は出さずに待つ（見落とさないように）。読み上げは ariaNotify、使えなければ読み上げの領域で行う。 */
let toastBox = null, toastLive = null;
const toasts = [];
function toastRoot() {
  if (!toastBox) {
    toastBox = document.createElement('div'); toastBox.className = 'fos-toasts'; toastBox.setAttribute('role', 'region'); toastBox.setAttribute('aria-label', '知らせ');
    toastLive = document.createElement('div'); toastLive.className = 'fos-sr-only'; toastLive.setAttribute('aria-live', 'polite');
    document.body.append(toastBox, toastLive);
  }
  return toastBox;
}
function layoutToasts() { let y = 16; for (const t of toasts) { t.style.bottom = y + 'px'; y += t.offsetHeight + 10; } }
export function notify(o) {
  if (document.querySelector('dialog[open]')) { setTimeout(() => notify(o), 1000); return; }
  const el = document.createElement('div');
  el.className = 'fos-toast'; el.setAttribute('popover', 'manual');
  el.innerHTML = `<div class="fos-toast-title"></div><div class="fos-toast-text"></div><div class="fos-toast-actions">${o.actionLabel ? '<button type="button" class="flat fos-toast-btn" data-act></button>' : ''}<button type="button" class="flat fos-toast-btn" data-close>閉じる</button></div>`;
  el.querySelector('.fos-toast-title').textContent = o.title || 'Future OS';
  el.querySelector('.fos-toast-text').textContent = o.text || '';
  if (o.actionLabel) el.querySelector('[data-act]').textContent = o.actionLabel;
  toastRoot().append(el);
  const before = document.activeElement;
  const close = () => {
    const had = el.contains(document.activeElement), i = toasts.indexOf(el);
    try { el.hidePopover?.(); } catch { /* もう閉じている */ }
    el.remove(); if (i >= 0) toasts.splice(i, 1); layoutToasts();
    // 知らせの中にフォーカスがあったら、次の知らせへ、無ければ前にいた場所へ戻す
    if (had) (toasts.at(-1)?.querySelector('[data-close]') || (before && before.isConnected ? before : document.body)).focus?.();
    log('notify.close', { title: o.title }, 'ok');
  };
  el.querySelector('[data-close]').addEventListener('click', close);
  el.querySelector('[data-act]')?.addEventListener('click', () => { close(); o.onAction?.(); });
  toasts.push(el);
  if (el.showPopover) el.showPopover(); else el.classList.add('open');
  layoutToasts();
  const say = `${o.title || ''}。${o.text || ''}${o.actionLabel ? '。操作があります。' : ''}`;
  if (typeof document.ariaNotify === 'function') document.ariaNotify(say); else { toastLive.textContent = ''; requestAnimationFrame(() => { toastLive.textContent = say; }); }
  sound.play(o.sound || 'notify');
  log('notify.show', { title: o.title, text: o.text }, 'ok');
  return close;
}
os.notify = notify;

/* ---------- 予定の知らせ（カレンダーの窓を閉じていても、OS を開いている間は見張る） ---------- */
import { normalizeEvents, dueReminders, reminderKey, localNow, FILE as CAL_FILE } from './core/calendar.mjs';
const FIRED = 'fos-calendar-fired';
const loadFired = () => { try { return new Set(JSON.parse(localStorage.getItem(FIRED) || '[]')); } catch { return new Set(); } };
const saveFired = (s) => { try { localStorage.setItem(FIRED, JSON.stringify([...s].slice(-300))); } catch { /* 保存できない */ } };
async function checkReminders() {
  let list;
  try { if (!(await fs.exists(CAL_FILE))) return; list = normalizeEvents(await fs.readJSON(CAL_FILE)); } catch (e) { log('calendar.watch', {}, 'error: ' + e.message); return; }
  const fired = loadFired(), due = dueReminders(list, localNow(new Date()), fired);
  for (const e of due) {
    fired.add(reminderKey(e));
    notify({ title: '予定の時刻です', text: `${e.date.slice(5).replace('-', '/')} ${e.time}　${e.title || '（題名なし）'}`, actionLabel: 'カレンダーで開く', onAction: () => launch('calendar', { date: e.date, id: e.id }), sound: 'chime' });
    log('calendar.remind', { id: e.id, date: e.date, time: e.time }, 'ok');
  }
  if (due.length) saveFired(fired);
}
export function initReminders() {
  checkReminders();
  setInterval(checkReminders, 30000);
  events.addEventListener('calendar', checkReminders);
}
