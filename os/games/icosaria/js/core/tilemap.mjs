// 地図（1文字1タイルの文字の並び。Gemini が描いたもの）を読み、当たり判定をする
export const TILE_CHARS = {
  '.': 'sand_plain', ',': 'sand_shell', ';': 'sand_wet', '~': 'sea_shallow', W: 'sea_deep',
  w: 'checker_white', b: 'checker_black', m: 'marble_floor', c: 'marble_cracked', '=': 'marble_stairs', '#': 'marble_wall',
  I: 'pillar', i: 'pillar_broken', ':': 'village_path', '"': 'village_grass', T: 'palm_tree', H: 'house_wall', R: 'house_roof',
  _: 'wood_pier', F: 'fountain', O: 'obelisk', S: 'switch', G: 'gate', C: 'chest',
};
export const SOLID = new Set(['sea_deep', 'marble_wall', 'pillar', 'pillar_broken', 'palm_tree', 'house_wall', 'house_roof', 'fountain', 'obelisk', 'gate', 'chest']);
export const ENTITY_CHARS = {
  P: 'player', 1: 'npc', 2: 'npc', 3: 'npc', 4: 'npc', 5: 'npc', 6: 'npc',
  K: 'crab', J: 'jelly', Y: 'bird', N: 'sentinel', Q: 'orb', X: 'boss', '<': 'exit', '>': 'exit', '^': 'exit', v: 'exit',
};

export function parseMap(rows, { fallback = 'sand_plain' } = {}) {
  const h = rows.length, w = Math.max(...rows.map((r) => [...r].length));
  const tiles = new Array(w * h).fill(null), entities = [], warnings = [];
  rows.forEach((r, y) => [...r.padEnd(w, '#')].forEach((ch, x) => {
    if (TILE_CHARS[ch]) tiles[y * w + x] = TILE_CHARS[ch];
    else if (ENTITY_CHARS[ch]) entities.push({ kind: ENTITY_CHARS[ch], ch, x, y });
    else { warnings.push(`知らない文字「${ch}」(${x},${y})`); tiles[y * w + x] = fallback; }
  }));
  // 物の下の床: 上下左右の歩ける床のうち、いちばん多いもの
  for (const e of entities) {
    const count = {};
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const t = tiles[(e.y + dy) * w + (e.x + dx)];
      if (t && !SOLID.has(t) && e.x + dx >= 0 && e.x + dx < w && e.y + dy >= 0 && e.y + dy < h) count[t] = (count[t] || 0) + 1;
    }
    const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    tiles[e.y * w + e.x] = best ? best[0] : fallback;
  }
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : tiles[y * w + x]);
  return {
    w, h, tiles, entities, warnings, tileAt,
    setTile: (x, y, t) => { if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = t; },
    solidAt: (x, y) => { const t = tileAt(x, y); return t == null || SOLID.has(t); },
  };
}

// 箱（x, y, w, h は画素）を dx, dy だけ動かす。軸ごとに、通り道のタイルの列（行）を手前から調べ、最初の壁の手前で止める
export function moveBox(box, dx, dy, solidAt, T = 16) {
  const { w, h } = box;
  const fl = Math.floor, E = 0.001;
  let x = box.x, y = box.y, hitX = false, hitY = false;
  if (dx) {
    const y0 = fl(y / T), y1 = fl((y + h - E) / T);
    const colSolid = (c) => { for (let ty = y0; ty <= y1; ty++) if (solidAt(c, ty)) return true; return false; };
    let nx = x + dx;
    if (dx > 0) { for (let c = fl((x + w - E) / T) + 1; c <= fl((nx + w - E) / T); c++) if (colSolid(c)) { nx = c * T - w; hitX = true; break; } }
    else { for (let c = fl(x / T) - 1; c >= fl(nx / T); c--) if (colSolid(c)) { nx = (c + 1) * T; hitX = true; break; } }
    x = nx;
  }
  if (dy) {
    const x0 = fl(x / T), x1 = fl((x + w - E) / T);
    const rowSolid = (r) => { for (let tx = x0; tx <= x1; tx++) if (solidAt(tx, r)) return true; return false; };
    let ny = y + dy;
    if (dy > 0) { for (let r = fl((y + h - E) / T) + 1; r <= fl((ny + h - E) / T); r++) if (rowSolid(r)) { ny = r * T - h; hitY = true; break; } }
    else { for (let r = fl(y / T) - 1; r >= fl(ny / T); r--) if (rowSolid(r)) { ny = (r + 1) * T; hitY = true; break; } }
    y = ny;
  }
  return { x, y, hitX, hitY };
}
