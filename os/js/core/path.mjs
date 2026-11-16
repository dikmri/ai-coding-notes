// 仮想ドライブのパス（"/" 区切り、先頭は必ず "/"）を扱う計算
export function normalize(p) {
  const out = [];
  for (const part of String(p).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}
export const join = (...parts) => normalize(parts.join('/'));
export function dirname(p) { const n = normalize(p); const i = n.lastIndexOf('/'); return i <= 0 ? '/' : n.slice(0, i); }
export function basename(p) { const n = normalize(p); return n.slice(n.lastIndexOf('/') + 1); }
export function extname(name) { const b = basename(name); const i = b.lastIndexOf('.'); return i <= 0 ? '' : b.slice(i); }
export function stem(name) { const b = basename(name), e = extname(b); return e ? b.slice(0, -e.length) : b; }
// 同じ名前があれば「名前 (2).拡張子」「名前 (3).拡張子」…と空いている番号を付ける
export function uniqueName(existing, desired) {
  const set = new Set(existing);
  if (!set.has(desired)) return desired;
  const e = extname(desired), s = e ? desired.slice(0, -e.length) : desired;
  for (let k = 2; ; k++) { const n = `${s} (${k})${e}`; if (!set.has(n)) return n; }
}
// child が parent そのもの、または parent の中にあるか
export function isInside(child, parent) {
  const c = normalize(child), p = normalize(parent);
  return c === p || c.startsWith(p === '/' ? '/' : p + '/');
}
