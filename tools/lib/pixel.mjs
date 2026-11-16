// ドット絵の道具の中核。Gemini が返した「色の表」と「1マスずつの色の並び」を確かめ、OS のアイコンと同じ形の SVG にする。
// 計算だけで、通信も画面も使わない。tests/pixel.test.mjs で確かめている。
// 絵の形: { palette: [{ key: '1文字', color: '#rrggbb' }], rows: ['1行の文字列', ...] }。「.」は透明。

// Windows の16色（当時の標準の色の並び）
export const WIN16 = ['#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
  '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'];

export function normalizeHex(c) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c).replace(/[`'"s]/g, ''));
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  return '#' + h.toLowerCase();
}
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function nearest(hex, palette) {
  const [r, g, b] = rgb(normalizeHex(hex));
  let best = palette[0], bd = Infinity;
  for (const p of palette) {
    const [r2, g2, b2] = rgb(p);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// 絵を確かめる。size（正方形）か w と h を渡すと、行の数と各行の長さがそれに合うかを見る。
// win16 なら Windows の16色に、allowed（色の表）を渡せばその中の近い色にそろえる。maxColors は色の数の上限
export function validateArt(art, { size = null, w = null, h = null, win16 = false, allowed = null, maxColors = 16 } = {}) {
  const W = w ?? size, H = h ?? size;
  // 使える色の一覧が読めない（空になる）ときは、色をそろえない（空の一覧から選ぶと色を失うため）
  let table = allowed ? allowed.map(normalizeHex).filter(Boolean) : win16 ? WIN16 : null;
  if (table && !table.length) table = null;
  const errors = [], snapped = [];
  const rows = Array.isArray(art?.rows) ? art.rows.map((r) => Array.from(String(r))) : [];
  const palette = [];
  for (const p of Array.isArray(art?.palette) ? art.palette : []) {
    const key = Array.from(String(p.key ?? ''));
    const color = normalizeHex(p.color);
    if (key.length !== 1 || key[0] === '.') { errors.push(`色の表の記号「${p.key}」は1文字で、「.」以外にしてください`); continue; }
    if (!color) { errors.push(`色の表の「${p.key}」の色「${p.color}」を読めません`); continue; }
    let c = color;
    if (table && !table.includes(c)) { c = nearest(c, table); snapped.push({ key: key[0], from: color, to: c }); }
    palette.push({ key: key[0], color: c });
  }
  if (palette.length > maxColors) errors.push(`色が ${palette.length} 色あります。${maxColors}色までにしてください`);
  if (!rows.length) errors.push('行がありません');
  if (H && rows.length !== H) errors.push(`行の数が ${rows.length} です。${H} 行にしてください`);
  const keys = new Set(palette.map((p) => p.key));
  const width = W || (rows[0] ? rows[0].length : 0);
  rows.forEach((r, i) => {
    if (r.length !== width) errors.push(`${i + 1} 行目の長さが ${r.length} です。${width} 文字にしてください`);
    const bad = [...new Set(r.filter((ch) => ch !== '.' && !keys.has(ch)))];
    if (bad.length) errors.push(`${i + 1} 行目に色の表に無い記号があります: ${bad.join(' ')}`);
  });
  return { ok: errors.length === 0, errors, snapped, art: { palette, rows: rows.map((r) => r.join('')) } };
}

const short = (h) => (h[1] === h[2] && h[3] === h[4] && h[5] === h[6] ? '#' + h[1] + h[3] + h[5] : h);
// SVG にする。横に続く同じ色を1つの長方形にまとめ、色ごとに path を1本にする（色の表の順）
export function toSvg(art) {
  const rows = art.rows.map((r) => Array.from(r));
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  let body = '';
  for (const p of art.palette) {
    let d = '';
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length;) {
        if (r[x] !== p.key) { x++; continue; }
        let n = 1;
        while (r[x + n] === p.key) n++;
        d += `M${x} ${y}h${n}v1h-${n}z`;
        x += n;
      }
    });
    if (d) body += `<path fill="${short(normalizeHex(p.color) || p.color)}" d="${d}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
}
