// 仮想ドライブ: IndexedDB に、パスごとに { path, kind: 'file'|'dir', blob, size, type, mtime, origin } を置く
// 変更は fs（EventTarget）の 'change' と、ほかのタブへの BroadcastChannel で知らせる
import { normalize, dirname, basename, uniqueName, isInside } from './core/path.mjs';

export const fs = new EventTarget();
export const TRASH = '/ゴミ箱';
const log = (...a) => (window.dlog || (() => {}))(...a);
let db = null;
const bc = 'BroadcastChannel' in self ? new BroadcastChannel('future-os-fs') : null;
if (bc) bc.onmessage = (e) => fs.dispatchEvent(new CustomEvent('change', { detail: e.data }));
function changed(...dirs) {
  const detail = { dirs: [...new Set(dirs.map(normalize))] };
  fs.dispatchEvent(new CustomEvent('change', { detail }));
  if (bc) bc.postMessage(detail);
}
const req = (r) => new Promise((ok, ng) => { r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
const store = (mode = 'readonly') => db.transaction('files', mode).objectStore('files');
const range = (dir) => { const p = dir === '/' ? '/' : dir + '/'; return IDBKeyRange.bound(p, p + '￿'); };

export async function open() {
  if (db) return;
  db = await new Promise((ok, ng) => {
    const r = indexedDB.open('future-os', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'path' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error);
  });
}
const meta = (r) => ({ path: r.path, name: basename(r.path), kind: r.kind, size: r.size || 0, type: r.type || '', mtime: r.mtime || 0, origin: r.origin });

export async function stat(path) {
  path = normalize(path);
  if (path === '/') return { path: '/', name: '', kind: 'dir', size: 0, mtime: 0 };
  const r = await req(store().get(path));
  return r ? meta(r) : null;
}
export const exists = async (path) => !!(await stat(path));
// フォルダの中身（直下だけ）。フォルダが先、次に名前の順
export async function list(dir) {
  dir = normalize(dir);
  const all = await req(store().getAll(range(dir)));
  const depth = dir === '/' ? 1 : dir.split('/').length;
  return all.filter((r) => r.path.split('/').length === depth + 1).map(meta)
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ja', { numeric: true }) : a.kind === 'dir' ? -1 : 1));
}
// フォルダの下にある全部のパス（検索に使う）
export async function walk(dir = '/') { return req(store().getAllKeys(range(normalize(dir)))); }

export async function readBlob(path) {
  path = normalize(path);
  const r = await req(store().get(path));
  if (!r || r.kind !== 'file') throw new Error(`「${path}」が見つかりません。`);
  return r.blob;
}
export const readText = async (path) => (await readBlob(path)).text();
export const readJSON = async (path) => JSON.parse(await readText(path));

async function mkdirp(path) {
  path = normalize(path);
  if (path === '/') return;
  const parts = path.split('/').filter(Boolean), st = store('readwrite');
  let cur = '';
  for (const p of parts) {
    cur += '/' + p;
    const r = await req(st.get(cur));
    if (r && r.kind !== 'dir') throw new Error(`「${cur}」はファイルなので、フォルダを作れません。`);
    if (!r) await req(st.put({ path: cur, kind: 'dir', mtime: Date.now() }));
  }
}
export async function mkdir(path) { await mkdirp(path); changed(dirname(path)); log('fs.mkdir', { path }, 'ok'); }

function toBlob(data, type) {
  if (data instanceof Blob) return data;
  if (typeof data === 'string') return new Blob([data], { type: type || 'text/plain;charset=utf-8' });
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data], { type: type || 'application/octet-stream' });
  return new Blob([JSON.stringify(data, null, 1)], { type: type || 'application/json' });
}
export async function write(path, data, type) {
  path = normalize(path);
  if (path === '/') throw new Error('ドライブそのものには書けません。');
  const old = await stat(path);
  if (old && old.kind === 'dir') throw new Error(`「${basename(path)}」という名前のフォルダがあります。`);
  await mkdirp(dirname(path));
  const blob = toBlob(data, type);
  await req(store('readwrite').put({ path, kind: 'file', blob, size: blob.size, type: blob.type, mtime: Date.now() }));
  changed(dirname(path));
  log('fs.write', { path, size: blob.size }, 'ok');
  return path;
}
// パスと、その下の全部を消す
export async function remove(path) {
  path = normalize(path);
  if (path === '/' || path === TRASH) throw new Error('この場所は消せません。');
  const st = store('readwrite');
  for (const k of await req(st.getAllKeys(range(path)))) await req(st.delete(k));
  await req(st.delete(path));
  changed(dirname(path));
  log('fs.remove', { path }, 'ok');
}
async function relocate(from, to, keep) {
  from = normalize(from); to = normalize(to);
  if (from === '/' ) throw new Error('ドライブそのものは動かせません。');
  if (isInside(to, from)) throw new Error('フォルダを、そのフォルダの中へは動かせません。');
  if (await exists(to)) throw new Error(`「${basename(to)}」はすでにあります。`);
  const src = await stat(from);
  if (!src) throw new Error(`「${from}」が見つかりません。`);
  await mkdirp(dirname(to));
  const st = store('readwrite');
  const recs = [await req(st.get(from)), ...(await req(st.getAll(range(from))))];
  for (const r of recs) {
    const nr = { ...r, path: to + r.path.slice(from.length), mtime: keep ? Date.now() : r.mtime };
    if (r.path === from && !keep) delete nr.origin;
    await req(st.put(nr));
    if (!keep) await req(st.delete(r.path));
  }
  changed(dirname(from), dirname(to));
  return to;
}
export async function move(from, to) { const r = await relocate(from, to, false); log('fs.move', { from, to }, 'ok'); return r; }
export async function copy(from, to) { const r = await relocate(from, to, true); log('fs.copy', { from, to }, 'ok'); return r; }
export async function rename(path, newName) {
  if (!newName || /[\/\\]/.test(newName)) throw new Error('名前に / や \\ は使えません。');
  return move(path, normalize(dirname(path) + '/' + newName));
}
// 同じ名前があれば番号を付けて、そのフォルダの中で空いている名前を返す
export async function freeName(dir, name) { return uniqueName((await list(dir)).map((e) => e.name), name); }

export async function trash(path) {
  path = normalize(path);
  if (isInside(path, TRASH)) return remove(path);
  await mkdirp(TRASH);
  const to = TRASH + '/' + (await freeName(TRASH, basename(path)));
  await relocate(path, to, false);
  const st = store('readwrite'), r = await req(st.get(to));
  r.origin = path;
  await req(st.put(r));
  log('fs.trash', { path, to }, 'ok');
  return to;
}
export async function restore(trashPath) {
  const r = await stat(trashPath);
  if (!r) throw new Error('ゴミ箱に見つかりません。');
  const origin = r.origin || '/デスクトップ/' + r.name, dir = dirname(origin);
  const to = dir + (dir === '/' ? '' : '/') + (await freeName(dir, basename(origin)));
  await relocate(trashPath, to, false);
  log('fs.restore', { from: trashPath, to }, 'ok');
  return to;
}
export async function emptyTrash() { for (const e of await list(TRASH)) await remove(e.path); log('fs.emptyTrash', {}, 'ok'); }
export async function wipe() { await req(store('readwrite').clear()); changed('/'); log('fs.wipe', {}, 'ok'); }
export async function usage() {
  try { const e = await navigator.storage.estimate(); return { usage: e.usage || 0, quota: e.quota || 0 }; } catch { return { usage: 0, quota: 0 }; }
}
export const human = (n) => (n < 1024 ? `${n} バイト` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
