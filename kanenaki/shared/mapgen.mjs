// 『鐘なき王国』の地図の組み立て（画面とサーバーが共有する）
// 同じ入力なら同じ地図になる。乱数は種から作る自前のもの（Math.random を使わない）。
//
// 座標の約束:
//   - マス (i, j) は x が i〜i+1、y が j〜j+1 の範囲。マスの中心は (i+0.5, j+0.5)。
//   - 地図の定義（maps.mjs）に書く x, y は「マスの番号」。buildMap の出力では +0.5 して中心の座標にする。
//   - 向き（dir）は 16 方向。上から見た図（x が右、y が下）で 0 = +y、時計回りに 4 = −x、8 = −y、12 = +x。

export const TILE_TYPES = ['grass', 'dirt', 'road', 'cobble', 'swamp', 'water', 'dungeon_floor', 'dungeon_rubble', 'wall_town', 'wall_dungeon'];
export const TILE = Object.freeze(Object.fromEntries(TILE_TYPES.map((t, i) => [t, i])));
// 既定で通れない床（凡例の solid で上書きできる）
export const SOLID_TILES = Object.freeze(['water', 'wall_town', 'wall_dungeon']);
const SOLID_IDX = new Set(SOLID_TILES.map((t) => TILE[t]));

// 置物の大きさ（マス）と通れるかどうか。props の x, y は置物の中心。fp の範囲のマスを通れなくする。
export const PROP_INFO = Object.freeze({
  tree_oak: { fp: [1, 1], solid: 1 }, tree_dead: { fp: [1, 1], solid: 1 }, tree_pine: { fp: [1, 1], solid: 1 },
  rock_a: { fp: [1, 1], solid: 1 }, rock_b: { fp: [1, 1], solid: 1 },
  house_a: { fp: [3, 3], solid: 1 }, house_b: { fp: [4, 3], solid: 1 }, house_c: { fp: [3, 4], solid: 1 },
  belltower_ruin: { fp: [4, 4], solid: 1 },
  fence: { fp: [1, 1], solid: 1 }, grave: { fp: [1, 1], solid: 1 }, crate: { fp: [1, 1], solid: 1 },
  barrel: { fp: [1, 1], solid: 1 }, chest: { fp: [1, 1], solid: 1 }, brazier: { fp: [1, 1], solid: 1 },
  torch: { fp: [1, 1], solid: 0 }, bell_shard: { fp: [1, 1], solid: 0 }, warp_pad: { fp: [1, 1], solid: 0 },
  door: { fp: [1, 1], solid: 0 },
  wall_town: { fp: [1, 1], solid: 1 }, wall_dungeon: { fp: [1, 1], solid: 1 },
});
const propInfo = (art) => PROP_INFO[art] ?? { fp: [1, 1], solid: 1 };

/* ---------------- 乱数（種から作る） ---------------- */
export function hashSeed(seed) {
  const s = String(seed ?? 0);
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

// mulberry32。返す関数を呼ぶと [0, 1) の数。int / range / pick / chance も付ける。
export function makeRng(seed) {
  let a = typeof seed === 'number' && Number.isInteger(seed) ? (seed >>> 0) ^ 0x9e3779b9 : hashSeed(seed);
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  rng.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return rng;
}

/* ---------------- 向き ---------------- */
export function dirFromVec(dx, dy) {
  if (!dx && !dy) return 0;
  const d = Math.round(Math.atan2(-dx, dy) / (Math.PI / 8));
  return ((d % 16) + 16) % 16;
}
export function vecFromDir(d) {
  const a = (d % 16) * (Math.PI / 8);
  return [-Math.sin(a), Math.cos(a)];
}

/* ---------------- 共通の道具 ---------------- */
function tileIndex(name, warnings, where) {
  if (typeof name === 'number' && name >= 0 && name < TILE_TYPES.length) return name;
  const i = TILE[name];
  if (i === undefined) { warnings.push(`知らない床の種類 ${JSON.stringify(name)}（${where}）。草にする`); return TILE.grass; }
  return i;
}
const center = (o) => (o == null ? o : { ...o, x: (Number(o.x) || 0) + 0.5, y: (Number(o.y) || 0) + 0.5 });

function blank(id, w, h, fill) {
  return {
    id, w, h,
    ground: new Uint8Array(w * h).fill(fill),
    solid: new Uint8Array(w * h).fill(SOLID_IDX.has(fill) ? 1 : 0),
    props: [], portals: [], npcs: [], spawns: [], warnings: [],
  };
}

export function walkable(map, tx, ty, block) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false;
  const i = ty * map.w + tx;
  return !map.solid[i] && !(block && block[i]);
}
// 小数の座標でその点が通れるか
export const isSolidAt = (map, x, y, block) => !walkable(map, Math.floor(x), Math.floor(y), block);

function placeProp(m, p, markSolid = true) {
  const info = propInfo(p.art);
  const fp = Array.isArray(p.fp) ? p.fp : info.fp;
  const solid = p.solid ?? info.solid;
  const out = { art: p.art, x: p.x, y: p.y, rot: Number(p.rot) || 0 };
  m.props.push(out);
  if (!markSolid || !solid) return out;
  const x0 = Math.floor(p.x - fp[0] / 2 + 1e-6), y0 = Math.floor(p.y - fp[1] / 2 + 1e-6);
  for (let y = y0; y < y0 + fp[1]; y++) for (let x = x0; x < x0 + fp[0]; x++) {
    if (x >= 0 && y >= 0 && x < m.w && y < m.h) m.solid[y * m.w + x] = 1;
  }
  return out;
}

function nearestWalkable(m, x, y, maxR = 12, block) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (walkable(m, tx, ty, block)) return { x: tx + 0.5, y: ty + 0.5 };
  let best = null, bd = Infinity;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!walkable(m, tx + dx, ty + dy, block)) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: tx + dx + 0.5, y: ty + dy + 0.5 }; }
    }
    if (best) return best;
  }
  return null;
}
export { nearestWalkable };

/* ---------------- 文字の行から ---------------- */
function fromRows(def) {
  const rows = def.rows.map(String);
  const w = def.w ?? Math.max(...rows.map((r) => [...r].length));
  const h = def.h ?? rows.length;
  const m = blank(def.id, w, h, TILE.grass);
  const legend = def.legend ?? {};
  const unknown = new Set();
  for (let y = 0; y < h; y++) {
    const chars = [...(rows[y] ?? '')];
    for (let x = 0; x < w; x++) {
      const ch = chars[x];
      const i = y * w + x;
      if (ch === undefined) continue;
      const L = legend[ch];
      if (!L) { unknown.add(ch); continue; }
      const g = tileIndex(L.ground ?? 'grass', m.warnings, `凡例 ${ch}`);
      m.ground[i] = g;
      let solid = SOLID_IDX.has(g) ? 1 : 0;
      if (L.prop) {
        const p = typeof L.prop === 'string' ? { art: L.prop } : L.prop;
        m.props.push({ art: p.art, x: x + 0.5, y: y + 0.5, rot: Number(p.rot) || 0 });
        solid = propInfo(p.art).solid ? 1 : solid;
        if (p.solid !== undefined) solid = p.solid ? 1 : 0;
      }
      if (L.solid !== undefined) solid = L.solid ? 1 : 0;
      m.solid[i] = solid;
    }
  }
  for (const ch of unknown) m.warnings.push(`凡例に無い文字 ${JSON.stringify(ch)}。草にする`);
  return m;
}

/* ---------------- なめらかな雑音 ---------------- */
function valueNoise(w, h, rng, scale) {
  const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / scale, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = x / scale, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      out[y * w + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  }
  return out;
}

/* ---------------- 野外（種から） ---------------- */
function genField(def) {
  const g = def.gen;
  const rng = makeRng(g.seed ?? def.id);
  const w = def.w ?? 128, h = def.h ?? 128;
  const m = blank(def.id, w, h, TILE.grass);
  const base = tileIndex(g.ground ?? 'grass', m.warnings, 'gen.ground');
  const patch = tileIndex(g.patch ?? (base === TILE.swamp ? 'grass' : 'dirt'), m.warnings, 'gen.patch');
  const pondTile = tileIndex(g.pondTile ?? 'water', m.warnings, 'gen.pondTile');
  const road = tileIndex(g.road ?? 'road', m.warnings, 'gen.road');
  m.ground.fill(base);
  m.solid.fill(0);

  // 守る場所（入口・NPC・湧く場所・置物の周り）には木や水を置かない
  const keep = [];
  for (const p of def.portals ?? []) if (p.x != null) keep.push([p.x + 0.5, p.y + 0.5, 4]);
  for (const p of def.npcs ?? []) if (p.x != null) keep.push([p.x + 0.5, p.y + 0.5, 3]);
  for (const s of def.spawns ?? []) if (s.x != null) keep.push([s.x + 0.5, s.y + 0.5, 2]);
  for (const p of def.props ?? []) if (p.x != null) keep.push([p.x + 0.5, p.y + 0.5, 3]);
  const hub = g.hub ? [g.hub.x + 0.5, g.hub.y + 0.5] : [w / 2, h / 2];
  keep.push([hub[0], hub[1], 4]);
  const kept = new Uint8Array(w * h);
  for (const [cx, cy, r] of keep) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) kept[y * w + x] = 1;
    }
  }

  // まだらの土
  const pn = valueNoise(w, h, rng, g.patchScale ?? 9);
  const patchAmt = g.patchAmount ?? 0.22;
  for (let i = 0; i < w * h; i++) if (pn[i] > 1 - patchAmt) m.ground[i] = patch;

  // 道: 各入口から中心へ、ゆらぎながら幅 2 で
  const isRoad = new Uint8Array(w * h);
  const paint = (x, y) => {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      isRoad[yy * w + xx] = 1; m.ground[yy * w + xx] = road;
    }
  };
  if (g.roads !== false) {
    for (const p of def.portals ?? []) {
      if (p.x == null) continue;
      let x = Math.floor(p.x), y = Math.floor(p.y);
      const tx = Math.floor(hub[0]), ty = Math.floor(hub[1]);
      for (let guard = 0; guard < (w + h) * 4 && (x !== tx || y !== ty); guard++) {
        paint(x, y);
        const ddx = tx - x, ddy = ty - y;
        const goX = rng() < Math.abs(ddx) / (Math.abs(ddx) + Math.abs(ddy) + 1e-9);
        if (rng() < 0.18) { // ゆらぎ
          if (goX) y += rng() < 0.5 ? -1 : 1; else x += rng() < 0.5 ? -1 : 1;
          x = Math.max(1, Math.min(w - 3, x)); y = Math.max(1, Math.min(h - 3, y));
          continue;
        }
        if (goX) x += Math.sign(ddx); else y += Math.sign(ddy);
      }
      paint(x, y);
    }
  }

  // 水たまり
  const ponds = g.ponds ?? Math.round((w * h) / 2600);
  const pondNoise = valueNoise(w, h, rng, 3);
  for (let k = 0; k < ponds; k++) {
    const r = rng.range(g.pondMin ?? 2, g.pondMax ?? 5);
    const cx = rng.range(r + 3, w - r - 3), cy = rng.range(r + 3, h - r - 3);
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
      const i = y * w + x;
      if (kept[i] || isRoad[i]) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r * (0.75 + 0.5 * pondNoise[i])) { m.ground[i] = pondTile; m.solid[i] = SOLID_IDX.has(pondTile) ? 1 : 0; }
    }
  }

  // 木と岩
  const forest = valueNoise(w, h, rng, g.forestScale ?? 12);
  const trees = g.trees ?? 0.035, rocks = g.rocks ?? 0.008;
  const treeArts = g.treeArts ?? (base === TILE.swamp ? ['tree_dead'] : ['tree_oak', 'tree_pine', 'tree_oak']);
  const rockArts = g.rockArts ?? ['rock_a', 'rock_b'];
  const decor = g.decor ?? []; // [{ art, density }]
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x;
    if (kept[i] || isRoad[i] || m.solid[i]) continue;
    const f = forest[i];
    const r = rng();
    if (r < trees * (0.15 + 2.2 * f * f)) {
      placeProp(m, { art: rng.pick(treeArts), x: x + 0.5, y: y + 0.5, rot: rng.int(0, 3) * 90 });
    } else if (r < trees * (0.15 + 2.2 * f * f) + rocks) {
      placeProp(m, { art: rng.pick(rockArts), x: x + 0.5, y: y + 0.5, rot: rng.int(0, 3) * 90 });
    } else {
      for (const d of decor) {
        if (rng() < (d.density ?? 0.002)) { placeProp(m, { art: d.art, x: x + 0.5, y: y + 0.5, rot: rng.int(0, 3) * 90, solid: d.solid }); break; }
      }
    }
  }

  // 外周: いちばん外は通れない。内側 2 マスは木を濃く
  const nearPortal = (x, y) => (def.portals ?? []).some((p) => p.x != null && Math.abs(p.x - x) <= 3 && Math.abs(p.y - y) <= 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (edge > 1) continue;
    const i = y * w + x;
    if (nearPortal(x, y)) { if (edge === 0) m.solid[i] = 1; continue; }
    if (edge === 0) m.solid[i] = 1;
    if (!m.solid[i] && rng() < 0.55 && !isRoad[i]) placeProp(m, { art: rng.pick(treeArts), x: x + 0.5, y: y + 0.5, rot: rng.int(0, 3) * 90 });
    else if (edge === 0 && rng() < 0.5) m.props.push({ art: rng.pick(treeArts), x: x + 0.5, y: y + 0.5, rot: 0 });
  }
  return m;
}

/* ---------------- 迷宮（種から） ---------------- */
function genDungeon(def) {
  const g = def.gen;
  const rng = makeRng(g.seed ?? def.id);
  const w = def.w ?? 96, h = def.h ?? 96;
  const wall = tileIndex(g.wall ?? 'wall_dungeon', [], 'gen.wall');
  const floor = tileIndex(g.floor ?? 'dungeon_floor', [], 'gen.floor');
  const rubble = tileIndex(g.rubble ?? 'dungeon_rubble', [], 'gen.rubble');
  const m = blank(def.id, w, h, wall);
  m.solid.fill(1);
  const want = g.rooms ?? Math.max(4, Math.round((w * h) / 480));
  const rmin = g.roomMin ?? 5, rmax = g.roomMax ?? 11;
  const rooms = [];
  for (let a = 0; a < want * 40 && rooms.length < want; a++) {
    const rw = rng.int(rmin, rmax), rh = rng.int(rmin, rmax);
    const x = rng.int(2, w - rw - 3), y = rng.int(2, h - rh - 3);
    if (rooms.some((r) => x < r.x + r.w + 3 && x + rw + 3 > r.x && y < r.y + r.h + 3 && y + rh + 3 > r.y)) continue;
    rooms.push({ x, y, w: rw, h: rh, cx: x + Math.floor(rw / 2), cy: y + Math.floor(rh / 2) });
  }
  if (rooms.length === 0) rooms.push({ x: 2, y: 2, w: Math.min(8, w - 4), h: Math.min(8, h - 4), cx: 6, cy: 6 });
  const carve = (x, y) => {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return;
    const i = y * w + x; m.ground[i] = floor; m.solid[i] = 0;
  };
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);

  // 部屋をつなぐ: 最小の木（Prim）＋ところどころ輪
  const cw = g.corridor ?? 2;
  const corridor = (a, b) => {
    const hFirst = rng() < 0.5;
    const line = (x0, y0, x1, y1) => {
      const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
      let x = x0, y = y0;
      for (;;) {
        for (let d = 0; d < cw; d++) { if (sx) carve(x, y + d); else carve(x + d, y); }
        if (x === x1 && y === y1) break;
        x += sx; y += sy;
      }
      for (let dy = 0; dy < cw; dy++) for (let dx = 0; dx < cw; dx++) carve(x1 + dx, y1 + dy);
    };
    if (hFirst) { line(a.cx, a.cy, b.cx, a.cy); line(b.cx, a.cy, b.cx, b.cy); } else { line(a.cx, a.cy, a.cx, b.cy); line(a.cx, b.cy, b.cx, b.cy); }
  };
  const inTree = [0];
  const rest = new Set(rooms.map((_, i) => i).slice(1));
  const d2 = (a, b) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
  while (rest.size) {
    let best = null, bd = Infinity;
    for (const i of inTree) for (const j of rest) { const d = d2(rooms[i], rooms[j]); if (d < bd) { bd = d; best = [i, j]; } }
    corridor(rooms[best[0]], rooms[best[1]]);
    inTree.push(best[1]); rest.delete(best[1]);
  }
  const loops = g.loops ?? 0.15;
  for (let i = 0; i < rooms.length; i++) {
    if (!rng.chance(loops)) continue;
    const others = rooms.map((r, j) => [j, d2(rooms[i], r)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
    if (others[1]) corridor(rooms[i], rooms[others[1][0]]);
  }
  for (let i = 0; i < w * h; i++) if (m.ground[i] === floor && rng() < (g.rubbleAmount ?? 0.06)) m.ground[i] = rubble;

  // 入口の部屋と、そこから最も遠い部屋（出口・ボス）
  const entranceRoom = 0;
  const dist = bfsDist(m, rooms[0].cx, rooms[0].cy);
  let exitRoom = 0, far = -1;
  rooms.forEach((r, i) => { const d = dist[r.cy * w + r.cx]; if (d > far) { far = d; exitRoom = i; } });
  m.rooms = rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  m.anchors = {
    entrance: { x: rooms[entranceRoom].cx + 0.5, y: rooms[entranceRoom].cy + 0.5 },
    exit: { x: rooms[exitRoom].cx + 0.5, y: rooms[exitRoom].cy + 0.5 },
    entranceRoom, exitRoom, bossRoom: exitRoom,
  };

  // 飾り: 部屋の内側の角に火鉢や樽、上の壁にたいまつ
  const isWall = (x, y) => x < 0 || y < 0 || x >= w || y >= h || m.solid[y * w + x] === 1;
  const trueCorner = (x, y, sx, sy) => isWall(x + sx, y) && isWall(x, y + sy) && isWall(x + sx, y + sy)
    && isWall(x + sx, y - sy) && isWall(x - sx, y + sy) && !isWall(x - sx, y) && !isWall(x, y - sy);
  rooms.forEach((r, ri) => {
    if (ri === entranceRoom) return;
    const corners = [[r.x, r.y, -1, -1], [r.x + r.w - 1, r.y, 1, -1], [r.x, r.y + r.h - 1, -1, 1], [r.x + r.w - 1, r.y + r.h - 1, 1, 1]];
    for (const [x, y, sx, sy] of corners) {
      if (!trueCorner(x, y, sx, sy)) continue;
      const roll = rng();
      if (roll < 0.25) placeProp(m, { art: 'brazier', x: x + 0.5, y: y + 0.5 });
      else if (roll < 0.4) placeProp(m, { art: rng.pick(['barrel', 'crate']), x: x + 0.5, y: y + 0.5, rot: rng.int(0, 3) * 90 });
    }
    for (let x = r.x + 1; x < r.x + r.w - 1; x += 4) {
      if (isWall(x, r.y - 1) && rng() < 0.6) m.props.push({ art: 'torch', x: x + 0.5, y: r.y - 1 + 0.5, rot: 0 });
    }
  });
  return m;
}

function bfsDist(m, sx, sy) {
  const dist = new Int32Array(m.w * m.h).fill(-1);
  const q = new Int32Array(m.w * m.h);
  let qh = 0, qt = 0;
  const s = sy * m.w + sx;
  dist[s] = 0; q[qt++] = s;
  while (qh < qt) {
    const i = q[qh++], x = i % m.w, y = (i - x) / m.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const j = ny * m.w + nx;
      if (dist[j] >= 0 || m.solid[j]) continue;
      dist[j] = dist[i] + 1; q[qt++] = j;
    }
  }
  return dist;
}

// 歩けるのに入口からたどれないマスの群れを、いちばん近いたどれるマスまで切り開く
function connectAll(m, sx, sy) {
  const w = m.w, h = m.h;
  if (!walkable(m, sx, sy)) return;
  for (let guard = 0; guard < 200; guard++) {
    const dist = bfsDist(m, sx, sy);
    let lone = -1;
    for (let i = 0; i < w * h; i++) if (!m.solid[i] && dist[i] < 0) { lone = i; break; }
    if (lone < 0) return;
    // lone から、壁も通って、たどれるマスまでの最短
    const prev = new Int32Array(w * h).fill(-2);
    const q = [lone]; prev[lone] = -1;
    let hit = -1;
    for (let qi = 0; qi < q.length && hit < 0; qi++) {
      const i = q[qi], x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const j = ny * w + nx;
        if (prev[j] !== -2) continue;
        prev[j] = i;
        if (!m.solid[j] && dist[j] >= 0) { hit = j; break; }
        q.push(j);
      }
    }
    if (hit < 0) { // つなげない（外周の内側に閉じ込められた）なら埋める
      m.solid[lone] = 1;
      continue;
    }
    const cleared = new Set();
    for (let i = prev[hit]; i >= 0; i = prev[i]) {
      if (m.solid[i]) { m.solid[i] = 0; cleared.add(i); if (m.ground[i] === TILE.water || m.ground[i] === TILE.wall_town || m.ground[i] === TILE.wall_dungeon) m.ground[i] = TILE.dirt; }
    }
    if (cleared.size) m.props = m.props.filter((p) => !cleared.has(Math.floor(p.y) * w + Math.floor(p.x)) || !propInfo(p.art).solid);
  }
}

/* ---------------- 入口・NPC・湧く場所 ---------------- */
function placeObjects(m, def, isDungeon) {
  const rng = makeRng(`${def.gen?.seed ?? def.id}:objects`);
  const portals = def.portals ?? [];
  portals.forEach((p, i) => {
    let pos;
    if (isDungeon) {
      const at = p.at ?? (i === 0 ? 'entrance' : i === 1 ? 'exit' : null);
      if (at === 'entrance' || at === 'exit' || at === 'boss') pos = { ...m.anchors[at === 'boss' ? 'exit' : at] }; // ボスの部屋 = 最も奥の部屋
      else { const r = m.rooms[rng.int(0, m.rooms.length - 1)]; pos = { x: r.x + Math.floor(r.w / 2) + 0.5, y: r.y + 1.5 }; }
    } else {
      pos = { x: (Number(p.x) || 0) + 0.5, y: (Number(p.y) || 0) + 0.5 };
      const tx = Math.floor(pos.x), ty = Math.floor(pos.y);
      if (tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && def.gen) m.solid[ty * m.w + tx] = 0;
    }
    const to = p.to ? { ...p.to } : null;
    if (to && to.x != null) { to.x = Number(to.x) + 0.5; to.y = Number(to.y) + 0.5; }
    const out = { ...p, x: pos.x, y: pos.y, to };
    delete out.at;
    m.portals.push(out);
  });
  for (const n of def.npcs ?? []) {
    let pos;
    if (isDungeon) { const r = m.rooms[m.anchors.entranceRoom]; pos = { x: r.x + 1.5 + (m.npcs.length % Math.max(1, r.w - 2)), y: r.y + 1.5 }; }
    else pos = { x: (Number(n.x) || 0) + 0.5, y: (Number(n.y) || 0) + 0.5 };
    m.npcs.push({ ...n, x: pos.x, y: pos.y, dir: Number(n.dir) || 0 });
  }
  const spawns = def.spawns ?? [];
  if (!isDungeon) {
    for (const s of spawns) m.spawns.push(normSpawn(s, (Number(s.x) || 0) + 0.5, (Number(s.y) || 0) + 0.5, s.r));
    return;
  }
  // 迷宮: ボスは最も奥の部屋。ほかは入口とボスの部屋を除く部屋へ順に配り、部屋が余れば繰り返して埋める
  const bossRooms = new Set([m.anchors.bossRoom]);
  const normal = spawns.filter((s) => !(s.at === 'boss' || s.boss));
  for (const s of spawns.filter((s) => s.at === 'boss' || s.boss)) {
    const r = m.rooms[m.anchors.bossRoom];
    m.spawns.push(normSpawn(s, r.x + Math.floor(r.w / 2) + 0.5, r.y + Math.floor(r.h / 2) + 0.5, Math.min(s.r ?? 1, Math.floor(Math.min(r.w, r.h) / 2) - 1)));
  }
  if (!normal.length) return;
  const roomIdx = rng.shuffle(m.rooms.map((_, i) => i).filter((i) => i !== m.anchors.entranceRoom && (!bossRooms.has(i) || m.rooms.length <= 2)));
  const fill = def.gen?.fillRooms !== false;
  const n = fill ? Math.max(roomIdx.length, normal.length) : Math.min(roomIdx.length, normal.length);
  for (let k = 0; k < n && roomIdx.length; k++) {
    const s = normal[k % normal.length];
    const r = m.rooms[roomIdx[k % roomIdx.length]];
    const rr = Math.max(1, Math.min(s.r ?? 3, Math.floor(Math.min(r.w, r.h) / 2) - 1));
    m.spawns.push(normSpawn(s, r.x + Math.floor(r.w / 2) + 0.5, r.y + Math.floor(r.h / 2) + 0.5, rr));
  }
}
function normSpawn(s, x, y, r) {
  const out = { ...s, monsters: Array.isArray(s.monsters) ? s.monsters : s.monster ? [s.monster] : [], x, y, r: Number(r ?? 3), count: Number(s.count ?? 1), respawn: Number(s.respawn ?? 30) };
  delete out.at;
  return out;
}

/* ---------------- 入り口 ---------------- */
export function buildMap(def) {
  if (!def || typeof def !== 'object') throw new Error('buildMap: 地図の定義がない');
  let m;
  const isDungeon = def.gen?.type === 'dungeon';
  if (def.gen) m = isDungeon ? genDungeon(def) : genField(def);
  else if (Array.isArray(def.rows)) m = fromRows(def);
  else { m = blank(def.id, def.w ?? 32, def.h ?? 32, TILE.grass); m.warnings.push('rows も gen も無い。草だけの地図にする'); }
  m.name = def.name ?? def.id;
  m.light = def.light ?? (isDungeon ? 'dark' : def.id === 'town' ? 'day' : 'dusk');
  m.safe = def.safe ?? def.id === 'town';
  m.rooms ??= null; m.anchors ??= null;
  // 定義に書かれた置物（マスの番号 → 中心）
  for (const p of def.props ?? []) {
    if (!p?.art) { m.warnings.push(`art の無い置物 ${JSON.stringify(p)}`); continue; }
    placeProp(m, { ...p, x: (Number(p.x) || 0) + 0.5, y: (Number(p.y) || 0) + 0.5 });
  }
  placeObjects(m, def, isDungeon);
  // 入口と NPC の足元は歩けるようにする（種から作る地図だけ。文字の行の地図は書いたとおり）
  if (def.gen) for (const o of [...m.portals, ...m.npcs]) {
    const tx = Math.floor(o.x), ty = Math.floor(o.y);
    if (tx >= 0 && ty >= 0 && tx < m.w && ty < m.h) {
      m.solid[ty * m.w + tx] = 0;
      m.props = m.props.filter((p) => !(Math.floor(p.x) === tx && Math.floor(p.y) === ty && propInfo(p.art).solid));
    }
  }
  const e = def.entry ? center(def.entry) : m.portals[0] ? { x: m.portals[0].x, y: m.portals[0].y } : isDungeon ? m.anchors.entrance : { x: m.w / 2, y: m.h / 2 };
  m.entry = nearestWalkable(m, e.x, e.y, 24) ?? { x: e.x, y: e.y };
  if (def.gen) connectAll(m, Math.floor(m.entry.x), Math.floor(m.entry.y));
  else for (const o of [...m.portals, ...m.npcs]) if (!walkable(m, Math.floor(o.x), Math.floor(o.y))) m.warnings.push(`${o.id} が通れないマスの上にある (${o.x}, ${o.y})`);
  return m;
}

/* ---------------- 見通し ---------------- */
// 線分が通れないマスを通らないか。斜めにマスの角を通るときは、両隣のどちらかが通れなければ見えない
export function lineOfSight(map, x0, y0, x1, y1, block) {
  let tx = Math.floor(x0), ty = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  const dx = x1 - x0, dy = y1 - y0;
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dy) : Infinity;
  let tmx = sx > 0 ? (tx + 1 - x0) * tdx : sx < 0 ? (x0 - tx) * tdx : Infinity;
  let tmy = sy > 0 ? (ty + 1 - y0) * tdy : sy < 0 ? (y0 - ty) * tdy : Infinity;
  for (let guard = 0; guard < 4096; guard++) {
    if (tx === ex && ty === ey) return walkable(map, tx, ty, block);
    if (Math.abs(tmx - tmy) < 1e-9) {
      if (!walkable(map, tx + sx, ty, block) || !walkable(map, tx, ty + sy, block)) return false;
      tx += sx; ty += sy; tmx += tdx; tmy += tdy;
    } else if (tmx < tmy) { tx += sx; tmx += tdx; } else { ty += sy; tmy += tdy; }
    if (tmx > 1 + 1e-9 && tmy > 1 + 1e-9 && !(tx === ex && ty === ey)) return walkable(map, ex, ey, block);
    if (!walkable(map, tx, ty, block)) return false;
  }
  return false;
}

/* ---------------- 道探し（A*、斜めあり、角は切らない） ---------------- */
const SQ2 = Math.SQRT2;
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

function scratch(map) {
  const n = map.w * map.h;
  if (!map._astar || map._astar.n !== n) {
    map._astar = { n, g: new Float32Array(n), came: new Int32Array(n), seen: new Uint32Array(n), closed: new Uint32Array(n), gen: 0, heap: new Int32Array(n * 2), hf: new Float32Array(n * 2) };
  }
  const s = map._astar;
  s.gen = (s.gen + 1) >>> 0;
  if (s.gen === 0) { s.seen.fill(0); s.closed.fill(0); s.gen = 1; }
  return s;
}

// 戻り値: 通る点の配列 [[x, y], ...]（出発点は含まない。最後は行き先）。行けなければ null。
// opts: { maxNodes=20000, block: Uint8Array（一時的に通れないマス）, partial: 行けないとき最も近づける所まで }
export function findPath(map, sx, sy, tx, ty, opts = {}) {
  const block = opts.block;
  const w = map.w;
  const s0x = Math.floor(sx), s0y = Math.floor(sy);
  if (s0x < 0 || s0y < 0 || s0x >= w || s0y >= map.h) return null;
  let goal = { x: tx, y: ty };
  if (!walkable(map, Math.floor(tx), Math.floor(ty), block)) {
    goal = nearestWalkable(map, tx, ty, 4, block);
    if (!goal) return null;
  }
  const gx = Math.floor(goal.x), gy = Math.floor(goal.y);
  if (lineOfSight(map, sx, sy, goal.x, goal.y, block)) return [[goal.x, goal.y]];
  const maxNodes = opts.maxNodes ?? 20000;
  const S = scratch(map);
  const { g, came, seen, closed, heap, hf } = S;
  const gen = S.gen;
  let hn = 0;
  const push = (i, f) => {
    let k = hn++;
    heap[k] = i; hf[k] = f;
    while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0];
    hn--;
    if (hn > 0) {
      heap[0] = heap[hn]; hf[0] = hf[hn];
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < hn && hf[l] < hf[m]) m = l;
        if (r < hn && hf[r] < hf[m]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m;
      }
    }
    return top;
  };
  const H = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (SQ2 - 2) * Math.min(dx, dy); };
  const start = s0y * w + s0x, goalI = gy * w + gx;
  g[start] = 0; came[start] = -1; seen[start] = gen;
  push(start, H(s0x, s0y));
  let found = false, expanded = 0, best = start, bestH = H(s0x, s0y);
  while (hn > 0) {
    const i = pop();
    if (closed[i] === gen) continue;
    closed[i] = gen;
    if (i === goalI) { found = true; break; }
    if (++expanded > maxNodes || hn >= heap.length - 8) break;
    const x = i % w, y = (i - x) / w;
    const h0 = H(x, y);
    if (h0 < bestH) { bestH = h0; best = i; }
    for (const [dx, dy, c] of NB) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(map, nx, ny, block)) continue;
      if (dx && dy && (!walkable(map, x + dx, y, block) || !walkable(map, x, y + dy, block))) continue;
      const j = ny * w + nx;
      if (closed[j] === gen) continue;
      const ng = g[i] + c;
      if (seen[j] === gen && ng >= g[j]) continue;
      seen[j] = gen; g[j] = ng; came[j] = i;
      push(j, ng + H(nx, ny));
    }
  }
  let end = goalI;
  if (!found) { if (!opts.partial || best === start) return null; end = best; }
  const tiles = [];
  for (let i = end; i !== -1 && i !== start; i = came[i]) tiles.push(i);
  tiles.reverse();
  const pts = tiles.map((i) => { const x = i % w; return [x + 0.5, (i - x) / w + 0.5]; });
  if (found) pts[pts.length - 1] = [goal.x, goal.y];
  // 見通しのきく所は飛ばす（ひもを引く）
  const out = [];
  let cx = sx, cy = sy, k = 0;
  while (k < pts.length) {
    let far = k;
    for (let j = pts.length - 1; j > k; j--) {
      if (lineOfSight(map, cx, cy, pts[j][0], pts[j][1], block)) { far = j; break; }
    }
    out.push(pts[far]);
    [cx, cy] = pts[far];
    k = far + 1;
  }
  return out;
}
