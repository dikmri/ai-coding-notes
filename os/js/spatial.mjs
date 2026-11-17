// 矢印キーで、見た目の位置どおりに隣の項目へ動く（格子や折り返しの並びのため）。
// 中の項目は「1つだけ tabindex=0、ほかは -1」にして、Tab では1回で通り抜けられるようにする。
// 動ける先がないときは preventDefault しない（ブラウザのスクロールを止めないため）。
const DIRS = { ArrowRight: 'right', ArrowLeft: 'left', ArrowDown: 'down', ArrowUp: 'up' };

// cur から dir の向きにある項目を返す（なければ null）。端の位置で向きを決め、まず縦横の重なる項目から、近いものを選ぶ
export function spatialTarget(items, cur, dir) {
  const a = cur.getBoundingClientRect(), tol = 1;
  const horiz = dir === 'left' || dir === 'right';
  const cands = [];
  for (const el of items) {
    if (el === cur || (el.checkVisibility && !el.checkVisibility())) continue;
    const b = el.getBoundingClientRect();
    const ok = dir === 'right' ? b.left >= a.right - tol : dir === 'left' ? b.right <= a.left + tol : dir === 'down' ? b.top >= a.bottom - tol : b.bottom <= a.top + tol;
    if (!ok) continue;
    const gap = dir === 'right' ? b.left - a.right : dir === 'left' ? a.left - b.right : dir === 'down' ? b.top - a.bottom : a.top - b.bottom;
    const overlap = horiz ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0 : Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0;
    const off = horiz ? Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) : Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2);
    cands.push({ el, gap: Math.max(0, gap), overlap, off });
  }
  const aligned = cands.filter((c) => c.overlap).sort((x, y) => x.gap - y.gap || x.off - y.off);
  if (aligned.length) return aligned[0].el;
  const rest = cands.sort((x, y) => x.gap + 2 * x.off - (y.gap + 2 * y.off));
  return rest[0]?.el ?? null;
}

// container の中で selector の項目を矢印キーで動けるようにする。動いたら onMove(項目) を呼ぶ
export function spatialKeys(container, selector, onMove) {
  container.addEventListener('keydown', (e) => {
    const dir = DIRS[e.key];
    if (!dir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const t = e.composedPath()[0];
    if (!(t instanceof Element) || !t.matches(selector)) return;
    const next = spatialTarget([...container.querySelectorAll(selector)], t, dir);
    if (!next) return;
    e.preventDefault();
    rove(container, selector, next);
    next.focus();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    onMove?.(next);
  });
}
// tabindex=0 を el に移す
export function rove(container, selector, el) {
  for (const x of container.querySelectorAll(selector)) x.tabIndex = x === el ? 0 : -1;
}
