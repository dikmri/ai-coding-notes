// レポートのグラフ（SVG）。data/compare.json から描く。色は CSS の --viz-s1（1 版）と --viz-s2（2 版）。
import { log, watchErrors } from './log.mjs';

watchErrors();
const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
};
const tip = (node, text) => { el('title', {}, node).textContent = text; return node; };
const svg = (w, h, label) => el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label });
const pct = (v) => `${Math.round(v * 100)}%`;

function tableView(host, caption, head, rows) {
  const d = document.createElement('details');
  d.innerHTML = `<summary>表で見る</summary><div class="table-wrap" tabindex="0"><table><caption>${caption}</caption><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td class="num">${c}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
  host.append(d);
}

// 1) 和音の長さの割合（1 版と 2 版のまとめた棒）
function chordLengths(host, m) {
  const keys = ['1', '2', '4', '8'];
  const tot = (L) => Object.values(L).reduce((a, b) => a + b, 0);
  const share = (L, k) => (L[`${k}.0`] || 0) / tot(L);
  const W = 640, H = 260, x0 = 48, y0 = 20, ph = 190, gw = (W - x0 - 10) / keys.length;
  const s = svg(W, H, '和音が続く拍の数の割合。1 版は 4 拍が 85%、2 版は 2 拍が多い');
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    const y = y0 + ph * (1 - v);
    el('line', { x1: x0, x2: W - 10, y1: y, y2: y, class: 'grid' }, s);
    el('text', { x: x0 - 8, y: y + 4, 'text-anchor': 'end' }, s).textContent = pct(v);
  }
  keys.forEach((k, i) => {
    const gx = x0 + i * gw;
    [['v1', 's1'], ['v2', 's2']].forEach(([ver, cls], j) => {
      const v = share(m[ver].lengths, k);
      const bw = gw * 0.32, x = gx + gw * 0.16 + j * (bw + 2);
      const h = Math.max(v * ph, v > 0 ? 2 : 0);
      tip(el('path', { d: `M${x},${y0 + ph} v${-h + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z`, class: `${cls} mark` }, s), `${ver === 'v1' ? '1 版' : '2 版'}: ${k} 拍の和音 ${pct(v)}`);
      if (v > 0.02) el('text', { x: x + bw / 2, y: y0 + ph - h - 6, 'text-anchor': 'middle' }, s).textContent = pct(v);
    });
    el('text', { x: gx + gw / 2, y: y0 + ph + 22, 'text-anchor': 'middle' }, s).textContent = `${k} 拍`;
  });
  el('line', { x1: x0, x2: W - 10, y1: y0 + ph, y2: y0 + ph, class: 'axis' }, s);
  host.append(s);
  tableView(host, '和音が続く拍の数の割合', ['拍の数', '1 版', '2 版'], keys.map((k) => [`${k} 拍`, pct(share(m.v1.lengths, k)), pct(share(m.v2.lengths, k))]));
}

// 2) drop の頭の 4 小節のリズムの格子
function rhythmGrid(host, g, ver, cls) {
  const rows = [['chop', '声'], ['chord', '和音'], ['kick', 'キック'], ['snare', 'スネア']];
  const W = 900, rh = 30, x0 = 64, H = rows.length * rh + 34, cw = (W - x0 - 6) / 64;
  const s = svg(W, H, `${ver} の drop の頭の 4 小節のリズム`);
  for (let b = 0; b <= 64; b += 4) {
    el('line', { x1: x0 + b * cw, x2: x0 + b * cw, y1: 4, y2: rows.length * rh + 4, class: b % 16 === 0 ? 'axis' : 'grid' }, s);
  }
  for (let b = 0; b < 4; b++) el('text', { x: x0 + b * 16 * cw + 4, y: rows.length * rh + 22 }, s).textContent = `${25 + b} 小節`;
  rows.forEach(([key, label], r) => {
    const y = 4 + r * rh;
    el('text', { x: x0 - 8, y: y + rh / 2 + 4, 'text-anchor': 'end' }, s).textContent = label;
    for (const [st, len, syl] of g[key]) {
      const w = Math.max(cw * 0.7, Math.min(len, 16) * cw - 2);
      tip(el('rect', { x: x0 + st * cw + 1, y: y + 6, width: w, height: rh - 12, rx: 4, class: `${cls} mark` }, s),
        `${label}: ${Math.floor(st / 16) + 25} 小節の ${Math.round(st % 16) + 1} 番目の 16 分${syl ? `（${syl}）` : ''}`);
    }
  });
  host.append(s);
}

// 3) サイドチェインの曲線（2 小節）
function pump(host, p) {
  const W = 900, H = 230, x0 = 48, y0 = 14, ph = 160, n = p.v1.length, dur = n / p.rate;
  const s = svg(W, H, 'サイドチェインの音量の曲線。1 版は毎拍同じ形、2 版はキックの所だけ下がる');
  for (const v of [0, 0.5, 1]) {
    const y = y0 + ph * (1 - v);
    el('line', { x1: x0, x2: W - 10, y1: y, y2: y, class: 'grid' }, s);
    el('text', { x: x0 - 8, y: y + 4, 'text-anchor': 'end' }, s).textContent = v.toFixed(1);
  }
  const X = (t) => x0 + (t / dur) * (W - x0 - 10);
  for (let k = 0; k <= 8; k++) {
    el('line', { x1: X(k * p.beat), x2: X(k * p.beat), y1: y0 + ph, y2: y0 + ph + 6, class: 'axis' }, s);
    if (k < 8) el('text', { x: X(k * p.beat) + 3, y: y0 + ph + 20 }, s).textContent = `${k % 4 + 1} 拍`;
  }
  const line = (arr, cls) => el('path', { d: arr.map((v, i) => `${i ? 'L' : 'M'}${X(i / p.rate).toFixed(1)},${(y0 + ph * (1 - v)).toFixed(1)}`).join(''), class: cls }, s);
  line(p.v1, 'l1');
  line(p.v2, 'l2');
  for (const t of p.kicksV2) tip(el('circle', { cx: X(t), cy: y0 + ph + 34, r: 5, class: 's2 mark' }, s), `2 版のキック ${t.toFixed(2)} 秒`);
  el('text', { x: x0 - 12, y: y0 + ph + 38, 'text-anchor': 'end' }, s).textContent = 'キック';
  host.append(s);
  tableView(host, '拍の頭の 0.1 秒後の音量', ['拍', '1 版', '2 版'], Array.from({ length: 8 }, (_, k) => {
    const i = Math.round((k * p.beat + 0.1) * p.rate);
    return [`${Math.floor(k / 4) + 1} 小節目の ${k % 4 + 1} 拍`, p.v1[i].toFixed(2), p.v2[i].toFixed(2)];
  }));
}

// 4) 周波数の配分（直す前と後）
function spectrum(host, sp) {
  const W = 900, H = 280, x0 = 52, y0 = 14, ph = 210;
  const lo = -25, hi = 18;
  const s = svg(W, H, '1/3 オクターブの周波数の配分。直す前は 12 kHz より上が多く、直した後は下がっている');
  const X = (i) => x0 + (i / (sp.centers.length - 1)) * (W - x0 - 10);
  const Y = (v) => y0 + ph * (1 - (v - lo) / (hi - lo));
  for (const v of [-20, -10, 0, 10]) {
    el('line', { x1: x0, x2: W - 10, y1: Y(v), y2: Y(v), class: v === 0 ? 'axis' : 'grid' }, s);
    el('text', { x: x0 - 8, y: Y(v) + 4, 'text-anchor': 'end' }, s).textContent = `${v > 0 ? '+' : ''}${v} dB`;
  }
  sp.centers.forEach((c, i) => {
    const f = [50, 100, 250, 1000, 4000, 16000].find((v) => Math.abs(c - v) / v < 0.06);
    if (f) el('text', { x: X(i), y: y0 + ph + 20, 'text-anchor': 'middle' }, s).textContent = f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`;
  });
  const line = (arr, cls) => el('path', { d: arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(Math.max(lo, v)).toFixed(1)}`).join(''), class: cls }, s);
  line(sp.before, 'l1');
  line(sp.after, 'l2');
  sp.centers.forEach((c, i) => {
    tip(el('circle', { cx: X(i), cy: Y(Math.max(lo, sp.before[i])), r: 4, class: 's1 mark' }, s), `直す前 ${Math.round(c)} Hz: ${sp.before[i]} dB`);
    tip(el('circle', { cx: X(i), cy: Y(Math.max(lo, sp.after[i])), r: 4, class: 's2 mark' }, s), `直した後 ${Math.round(c)} Hz: ${sp.after[i]} dB`);
  });
  host.append(s);
  tableView(host, '1/3 オクターブの配分（1 kHz を 0 dB とした値）', ['中心の周波数', '直す前', '直した後'],
    sp.centers.map((c, i) => [c >= 1000 ? `${(c / 1000).toFixed(1)} kHz` : `${Math.round(c)} Hz`, `${sp.before[i]} dB`, `${sp.after[i]} dB`]));
}

// 5) 母音の形（声道の通りやすさ）
function vowels(host, V, scale) {
  const names = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };
  for (const [k, table] of Object.entries(V)) {
    const box = document.createElement('div');
    box.className = 'chart';
    box.innerHTML = `<h4>${names[k]}（${k}）</h4>`;
    const W = 220, H = 110, x0 = 4, ph = 84, fmax = 6000;
    const s = svg(W, H, `母音 ${names[k]} のフォルマント`);
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const f = (i / 120) * fmax;
      let g = 0;
      for (const [F, B, w] of table) g += w / (1 + ((f - F * scale) / (B * scale * 0.5)) ** 2);
      pts.push([x0 + (i / 120) * (W - 8), 6 + ph * (1 - Math.min(1, g))]);
    }
    el('path', { d: `M${x0},${6 + ph} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join('') + ` L${W - 4},${6 + ph} Z`, class: 's2', opacity: 0.85 }, s);
    for (const f of [1000, 3000, 5000]) el('text', { x: x0 + (f / fmax) * (W - 8), y: H - 4, 'text-anchor': 'middle' }, s).textContent = `${f / 1000}k`;
    for (const [F] of table) tip(el('circle', { cx: x0 + ((F * scale) / fmax) * (W - 8), cy: 6 + ph + 2, r: 3, class: 's1 mark' }, s), `フォルマント ${Math.round(F * scale)} Hz`);
    box.append(s);
    host.append(box);
  }
}

async function main() {
  const t0 = performance.now();
  const res = await fetch(new URL('../data/compare.json', import.meta.url));
  const C = await res.json();
  const on = (id, f) => { const h = document.getElementById(id); if (h) f(h); };
  on('fig-lengths', (h) => chordLengths(h, C.metrics));
  on('fig-grid-v1', (h) => rhythmGrid(h, C.grids.v1, '1 版', 's1'));
  on('fig-grid-v2', (h) => rhythmGrid(h, C.grids.v2, '2 版', 's2'));
  on('fig-pump', (h) => pump(h, C.pump));
  on('fig-spectrum', (h) => spectrum(h, C.spectrum));
  on('fig-vowels', (h) => vowels(h, C.vowels, C.formantScale));
  log('figures', { ms: Math.round(performance.now() - t0) });
}
main().catch((err) => log('error.figures', { msg: String(err) }, `error ${err.message}`));
