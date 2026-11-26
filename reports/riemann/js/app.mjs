// reports/riemann/ のページの図。素数の数え方のずれと、ゼータ関数の大きさを描く
import { primeCountsAt, li, schoenfeldBound, zetaAbs, ZETA_ZEROS } from './math.mjs';
import { log, watchErrors } from './log.mjs';

watchErrors();
log('page.open', { w: innerWidth, h: innerHeight, dark: matchMedia('(prefers-color-scheme: dark)').matches });

const SVG = 'http://www.w3.org/2000/svg';
// 数を 3 桁ごとの区切りで書く。負の数の印はハイフンではなくマイナス記号にする
const fmt = (n, d = 0) => n.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/^-/, '−');
function el(name, attrs = {}, parent) {
  const e = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}

/**
 * 折れ線の図。点は xs・ys（同じ長さ）。ys の NaN の所は線を切る。
 * opts: { W, H, M:{l,r,t,b}, xMin, xMax, xTicks:[{v,label}], yMin, yMax, yLog, yTicks:[{v,label}], band:{lo:[],hi:[]}, marks:[x], tip(i) → [太字, 行…] }
 */
function lineChart(svg, tipEl, opts) {
  const { M } = opts;
  // 図の座標の幅を、表示されている幅（CSS の px）に合わせる。狭い画面でも文字が 12px のまま読める
  const W = Math.max(300, Math.round(svg.parentElement.clientWidth || opts.W));
  const H = W < 560 ? Math.round(opts.H * 0.8) : opts.H;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const X = (v) => M.l + ((v - opts.xMin) / (opts.xMax - opts.xMin)) * (W - M.l - M.r);
  const Yraw = opts.yLog ? (v) => Math.log10(v) : (v) => v;
  const y0 = Yraw(opts.yMin), y1 = Yraw(opts.yMax);
  const Y = (v) => {
    const r = Yraw(Math.min(Math.max(v, opts.yMin), opts.yMax));
    return H - M.b - ((r - y0) / (y1 - y0)) * (H - M.t - M.b);
  };
  // 目盛りと格子
  for (const t of opts.yTicks) {
    el('line', { class: t.v === 0 ? 'zero' : 'grid', x1: M.l, x2: W - M.r, y1: Y(t.v), y2: Y(t.v) }, svg);
    el('text', { x: M.l - 6, y: Y(t.v) + 4, 'text-anchor': 'end' }, svg).textContent = t.label;
  }
  for (const t of opts.xTicks) {
    el('line', { class: 'axis', x1: X(t.v), x2: X(t.v), y1: H - M.b, y2: H - M.b + 4 }, svg);
    el('text', { x: X(t.v), y: H - M.b + 18, 'text-anchor': 'middle' }, svg).textContent = t.label;
  }
  el('line', { class: 'axis', x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b }, svg);
  if (opts.xLabel) el('text', { x: W - M.r, y: H - 6, 'text-anchor': 'end', class: 'lab' }, svg).textContent = opts.xLabel;
  if (opts.yLabel) el('text', { x: M.l, y: M.t - 6, 'text-anchor': 'start', class: 'lab' }, svg).textContent = opts.yLabel;
  const { xs, ys } = opts;
  // 帯（上下の線のあいだ）
  if (opts.band) {
    const { lo, hi } = opts.band;
    const idx = xs.map((_, i) => i).filter((i) => Number.isFinite(lo[i]) && Number.isFinite(hi[i]));
    if (idx.length > 1) {
      const top = idx.map((i) => `${X(xs[i]).toFixed(1)},${Y(hi[i]).toFixed(1)}`);
      const bot = idx.slice().reverse().map((i) => `${X(xs[i]).toFixed(1)},${Y(lo[i]).toFixed(1)}`);
      el('path', { class: 'band', d: `M${top.join('L')}L${bot.join('L')}Z` }, svg);
      el('path', { class: 'band-edge', d: `M${top.join('L')}` }, svg);
      el('path', { class: 'band-edge', d: `M${idx.map((i) => `${X(xs[i]).toFixed(1)},${Y(lo[i]).toFixed(1)}`).join('L')}` }, svg);
    }
  }
  for (const m of opts.marks || []) el('circle', { class: 'mark', cx: X(m), cy: H - M.b, r: 4 }, svg);
  // 線
  let d = '';
  let pen = false;
  for (let i = 0; i < xs.length; i++) {
    if (!Number.isFinite(ys[i])) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(ys[i]).toFixed(1)}`;
    pen = true;
  }
  el('path', { class: 'line', d }, svg);
  // 十字線と吹き出し
  const cross = el('line', { class: 'cross', y1: M.t, y2: H - M.b, visibility: 'hidden' }, svg);
  const dot = el('circle', { class: 'dot', r: 5, visibility: 'hidden' }, svg);
  let cur = -1;
  function show(i) {
    if (i < 0 || i >= xs.length) return;
    cur = i;
    const cx = X(xs[i]);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    if (Number.isFinite(ys[i])) { dot.setAttribute('cx', cx); dot.setAttribute('cy', Y(ys[i])); dot.setAttribute('visibility', 'visible'); }
    const [head, ...rows] = opts.tip(i);
    const b = document.createElement('b');
    b.textContent = head;
    tipEl.replaceChildren(b, ...rows.map((r) => { const s = document.createElement('span'); s.textContent = r; return s; }));
    tipEl.hidden = false;
    // 吹き出しは点の右に置き、右端に近いときは左に置く
    const box = svg.getBoundingClientRect();
    const px = (cx / W) * box.width;
    const w = tipEl.offsetWidth;
    tipEl.style.insetInlineStart = `${px + 12 + w > box.width ? Math.max(0, px - 12 - w) : px + 12}px`;
  }
  function hide() { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tipEl.hidden = true; }
  const nearest = (clientX) => {
    const box = svg.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * W;
    const v = opts.xMin + ((vx - M.l) / (W - M.l - M.r)) * (opts.xMax - opts.xMin);
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] < v) lo = mid; else hi = mid; }
    return Math.abs(xs[lo] - v) <= Math.abs(xs[hi] - v) ? lo : hi;
  };
  svg.onpointermove = (e) => show(nearest(e.clientX));
  svg.onpointerdown = (e) => show(nearest(e.clientX));
  svg.onpointerleave = (e) => { if (e.pointerType === 'mouse') hide(); };
  svg.onfocus = () => show(cur >= 0 ? cur : Math.floor(xs.length / 2));
  svg.onblur = hide;
  svg.onkeydown = (e) => {
    const step = e.shiftKey ? Math.ceil(xs.length / 20) : Math.max(1, Math.round(xs.length / 100));
    if (e.key === 'ArrowRight') { show(Math.min(xs.length - 1, (cur < 0 ? 0 : cur) + step)); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { show(Math.max(0, (cur < 0 ? 0 : cur) - step)); e.preventDefault(); }
    else if (e.key === 'Home') { show(0); e.preventDefault(); }
    else if (e.key === 'End') { show(xs.length - 1); e.preventDefault(); }
    else if (e.key === 'Escape') hide();
  };
  if (cur >= 0) show(cur);
  return { X, Y };
}

/* ---------- 1. 素数の個数と予測のずれ ---------- */
const primeSvg = document.getElementById('prime-chart');
const primeTip = document.getElementById('prime-tip');
const primeOut = document.getElementById('prime-readout');
const SCHOENFELD_FROM = 2657;
function niceStep(range, n) {
  const raw = range / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
}
// 数えた結果は、範囲が同じあいだ使い回す（図の幅が変わって描き直すときに、数え直さないため）
let primeCache = null;
function primeData(limit) {
  if (primeCache?.limit === limit) return primeCache;
  const n = 600;
  const xs = Array.from({ length: n }, (_, i) => Math.round(2 + ((limit - 2) * i) / (n - 1)));
  const pis = primeCountsAt(xs);
  const lis = xs.map((x) => li(x));
  const ys = xs.map((x, i) => pis[i] - lis[i]);
  const hi = xs.map((x) => (x >= SCHOENFELD_FROM ? schoenfeldBound(x) : NaN));
  const lo = hi.map((v) => -v);
  primeCache = { limit, xs, pis, lis, ys, hi, lo };
  return primeCache;
}
function drawPrimes(limit) {
  const t0 = performance.now();
  const { xs, pis, lis, ys, hi, lo } = primeData(limit);
  const yMax = schoenfeldBound(limit) * 1.15;
  const ys1 = niceStep(yMax, 3);
  const yTicks = [];
  for (let v = -Math.floor(yMax / ys1) * ys1; v <= yMax; v += ys1) yTicks.push({ v, label: fmt(v) });
  const xs1 = niceStep(limit, 5);
  const xTicks = [];
  for (let v = 0; v <= limit; v += xs1) xTicks.push({ v, label: v >= 1e4 ? `${fmt(v / 1e4)} 万` : fmt(v) });
  lineChart(primeSvg, primeTip, {
    W: 720, H: 320, M: { l: 64, r: 18, t: 22, b: 40 },
    xMin: 0, xMax: limit, xTicks, yMin: -yMax, yMax, yTicks, xs, ys, band: { lo, hi },
    xLabel: 'x', yLabel: '本当の個数 − 予測',
    tip: (i) => [
      `x = ${fmt(xs[i])}`,
      `本当の個数 π(x) = ${fmt(pis[i])}`,
      `予測 li(x) = ${fmt(lis[i], 1)}`,
      `ずれ = ${fmt(ys[i], 1)}`,
      Number.isFinite(hi[i]) ? `灰色の帯の幅 ±${fmt(hi[i], 1)}` : '帯は x ≥ 2,657 から',
    ],
  });
  const last = xs.length - 1;
  const inside = xs.every((x, i) => !(x >= SCHOENFELD_FROM) || Math.abs(ys[i]) < hi[i]);
  primeOut.textContent = `x = ${fmt(limit)} までに素数は ${fmt(pis[last])} 個、予測は ${fmt(lis[last], 1)}。ずれは ${fmt(ys[last], 1)} で、帯の幅 ±${fmt(hi[last], 1)} の ${fmt((Math.abs(ys[last]) / hi[last]) * 100)}% です。${inside ? '2,657 から先は、どの点も帯の中に入っています。' : '帯の外に出た点があります。'}`;
  log('primes.draw', { limit, ms: Math.round(performance.now() - t0) }, { pi: pis[last], li: +lis[last].toFixed(2), inside });
}
const primeLimit = document.getElementById('prime-limit');
primeLimit.addEventListener('change', () => {
  primeOut.textContent = '数えています…';
  requestAnimationFrame(() => setTimeout(() => {
    try { drawPrimes(+primeLimit.value); } catch (e) { log('primes.draw', { limit: primeLimit.value }, `error ${e.message}`); primeOut.textContent = `数えられませんでした: ${e.message}`; }
  }, 0));
});
drawPrimes(+primeLimit.value);

/* ---------- 2. ゼータ関数の大きさ ---------- */
const zetaSvg = document.getElementById('zeta-chart');
const zetaTip = document.getElementById('zeta-tip');
const zetaOut = document.getElementById('zeta-readout');
const sigmaIn = document.getElementById('sigma');
const sigmaOut = document.getElementById('sigma-out');
const T_MAX = 50;
const FLOOR = 1e-4;
// 標本の谷の近くを黄金分割で探し、|ζ| の一番小さい所を求める
function refineMin(sigma, a, b) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = zetaAbs(sigma, c), fd = zetaAbs(sigma, d);
  for (let k = 0; k < 60; k++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = zetaAbs(sigma, c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = zetaAbs(sigma, d); }
  }
  return fc < fd ? { t: c, v: fc } : { t: d, v: fd };
}
function drawZeta(sigma) {
  const t0 = performance.now();
  const n = 2001;
  const ts = Array.from({ length: n }, (_, i) => (T_MAX * i) / (n - 1));
  const vs = ts.map((t) => zetaAbs(sigma, t));
  const mins = [];
  for (let i = 1; i < n - 1; i++) if (vs[i] < vs[i - 1] && vs[i] <= vs[i + 1]) mins.push(refineMin(sigma, ts[i - 1], ts[i + 1]));
  // 刻みの点だけでは谷の底を通らないので、探した谷の底を点の列に足す
  const pts = ts.map((t, i) => ({ t, v: vs[i] })).concat(mins).sort((a, b) => a.t - b.t);
  const xs = pts.map((p) => p.t);
  const ys = pts.map((p) => p.v);
  const zeros = mins.filter((m) => m.v < 1e-6);
  const lowest = mins.filter((m) => m.t > 5).reduce((a, m) => (m.v < a.v ? m : a), { t: NaN, v: Infinity });
  lineChart(zetaSvg, zetaTip, {
    W: 720, H: 320, M: { l: 56, r: 18, t: 22, b: 40 },
    xMin: 0, xMax: T_MAX, xTicks: [0, 10, 20, 30, 40, 50].map((v) => ({ v, label: String(v) })),
    yMin: FLOOR, yMax: 10, yLog: true,
    yTicks: [1e-4, 1e-3, 1e-2, 0.1, 1, 10].map((v) => ({ v, label: String(v) })),
    xs, ys, marks: ZETA_ZEROS,
    xLabel: '虚部 t', yLabel: `|ζ(${sigma.toFixed(2)} + it)|（対数の目盛り）`,
    tip: (i) => [`|ζ| = ${ys[i] < FLOOR ? `${ys[i].toExponential(1)}（下の端より小さい）` : fmt(ys[i], 4)}`, `s = ${sigma.toFixed(2)} + ${fmt(xs[i], 2)}i`],
  });
  if (zeros.length) {
    zetaOut.textContent = `実部 ${sigma.toFixed(2)} の線: |ζ| が 0 になる所が ${zeros.length} か所あります（t = ${zeros.map((z) => fmt(z.t, 2)).join('、')}）。下の点の位置と同じです。`;
  } else {
    zetaOut.textContent = `実部 ${sigma.toFixed(2)} の線: |ζ| は 0 になりません。一番小さいのは ${fmt(lowest.v, 4)}（t = ${fmt(lowest.t, 2)} の近く）です。`;
  }
  sigmaIn.setAttribute('aria-valuetext', `実部 ${sigma.toFixed(2)}`);
  log('zeta.draw', { sigma, ms: Math.round(performance.now() - t0) }, { zeros: zeros.length, lowest: Number.isFinite(lowest.v) ? +lowest.v.toPrecision(3) : null });
}
const onSigma = () => {
  const s = +sigmaIn.value / 100;
  sigmaOut.textContent = s.toFixed(2);
  drawZeta(s);
};
sigmaIn.addEventListener('input', onSigma);
sigmaIn.addEventListener('change', () => log('ui.sigma', { sigma: +sigmaIn.value / 100 }));
for (const b of document.querySelectorAll('[data-sigma]')) {
  b.addEventListener('click', () => { sigmaIn.value = b.dataset.sigma; onSigma(); log('ui.sigma.preset', { sigma: +b.dataset.sigma / 100 }); });
}
onSigma();

// 表示の幅が変わったら（窓の大きさや画面の向きを変えたときなど）、図をその幅で描き直す
let resizeTimer = 0;
let drawnWidth = primeSvg.parentElement.clientWidth;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const w = primeSvg.parentElement.clientWidth;
    if (Math.abs(w - drawnWidth) < 8) return;
    drawnWidth = w;
    primeTip.hidden = true;
    zetaTip.hidden = true;
    drawPrimes(+primeLimit.value);
    drawZeta(+sigmaIn.value / 100);
  }, 150);
}).observe(document.querySelector('.report'));
