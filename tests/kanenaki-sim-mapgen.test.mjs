// 地図の組み立て（mapgen）のテスト: 文字の行からの組み立て、種からの野外と迷宮、道探し、向き
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../kanenaki/shared/mapgen.mjs';

const T = (name) => G.TILE_TYPES.indexOf(name);

// 歩けるマスを、始まりのマスから 4 方向でたどって数える
function reachable(map, sx, sy) {
  const seen = new Uint8Array(map.w * map.h);
  const q = [[sx, sy]];
  seen[sy * map.w + sx] = 1;
  let n = 0;
  while (q.length) {
    const [x, y] = q.pop(); n++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const i = ny * map.w + nx;
      if (seen[i] || map.solid[i]) continue;
      seen[i] = 1; q.push([nx, ny]);
    }
  }
  return { n, seen };
}
const walkableCount = (map) => map.solid.reduce((a, s) => a + (s ? 0 : 1), 0);

test('床の種類の番号は約束どおりの順番', () => {
  assert.deepEqual(G.TILE_TYPES, ['grass', 'dirt', 'road', 'cobble', 'swamp', 'water', 'dungeon_floor', 'dungeon_rubble', 'wall_town', 'wall_dungeon']);
});

test('文字の行: 凡例の床・通れない・物を組み立て、知らない文字は警告して草にする', () => {
  const def = {
    id: 'mini', name: '見本', w: 5, h: 3,
    rows: ['#####', '#.T~?', '#####'],
    legend: {
      '#': { ground: 'wall_town' },
      '.': { ground: 'cobble' },
      'T': { ground: 'grass', prop: 'tree_oak' },
      '~': { ground: 'water' },
    },
  };
  const m = G.buildMap(def);
  assert.equal(m.w, 5); assert.equal(m.h, 3);
  assert.equal(m.ground[1 * 5 + 1], T('cobble'));
  assert.equal(m.solid[0], 1, '町の壁は通れない');
  assert.equal(m.solid[1 * 5 + 1], 0);
  assert.equal(m.solid[1 * 5 + 3], 1, '水は通れない');
  assert.equal(m.solid[1 * 5 + 2], 1, '木は通れない');
  assert.deepEqual(m.props, [{ art: 'tree_oak', x: 2.5, y: 1.5, rot: 0 }]);
  assert.equal(m.ground[1 * 5 + 4], T('grass'));
  assert.equal(m.solid[1 * 5 + 4], 0);
  assert.ok(m.warnings.some((w) => w.includes('?')));
});

test('文字の行: 凡例の solid は既定より優先し、置物の通れなさも上書きできる', () => {
  const m = G.buildMap({
    id: 'm2', rows: ['ab'], legend: { a: { ground: 'water', solid: false }, b: { ground: 'grass', prop: 'torch', solid: true } },
  });
  assert.equal(m.solid[0], 0);
  assert.equal(m.solid[1], 1);
});

test('def の座標はマスの番号。出力はマスの中心（+0.5）にする', () => {
  const m = G.buildMap({
    id: 'm3', rows: ['....', '....', '....'], legend: { '.': { ground: 'grass' } },
    portals: [{ id: 'p', x: 3, y: 1, to: { map: 'x', x: 10, y: 4 } }],
    npcs: [{ id: 'npc_smith', x: 1, y: 2 }],
    spawns: [{ monsters: ['stray_dog'], x: 2, y: 2, r: 3, count: 2, respawn: 20 }],
    props: [{ art: 'house_a', x: 0, y: 0 }],
  });
  assert.deepEqual(m.portals[0], { id: 'p', x: 3.5, y: 1.5, to: { map: 'x', x: 10.5, y: 4.5 } });
  assert.deepEqual(m.npcs[0], { id: 'npc_smith', x: 1.5, y: 2.5, dir: 0 });
  assert.equal(m.spawns[0].x, 2.5);
  assert.equal(m.spawns[0].count, 2);
  assert.ok(m.props.some((p) => p.art === 'house_a' && p.x === 0.5 && p.y === 0.5));
});

test('野外: 同じ種なら同じ地図、違う種なら違う地図', () => {
  const def = (seed) => ({ id: 'road', w: 64, h: 64, gen: { type: 'field', seed }, portals: [{ id: 'west', x: 1, y: 32, to: { map: 'town' } }] });
  const a = G.buildMap(def(7)), b = G.buildMap(def(7)), c = G.buildMap(def(8));
  assert.deepEqual(a.ground, b.ground);
  assert.deepEqual(a.solid, b.solid);
  assert.deepEqual(a.props, b.props);
  assert.notDeepEqual(a.solid, c.solid);
});

test('野外: 木と岩と水たまりがあり、歩けるマスは全部が入口からつながり、外周は通れない', () => {
  const m = G.buildMap({
    id: 'road', w: 96, h: 80, gen: { type: 'field', seed: 'kare', ponds: 5 },
    portals: [{ id: 'west', x: 1, y: 40, to: { map: 'town' } }, { id: 'east', x: 94, y: 20, to: { map: 'bog' } }],
  });
  assert.ok(m.props.some((p) => p.art.startsWith('tree_')));
  assert.ok(m.ground.includes(T('water')));
  assert.ok(m.ground.includes(T('road')));
  for (const p of m.portals) assert.equal(G.walkable(m, Math.floor(p.x), Math.floor(p.y)), true, `入口 ${p.id} は歩ける`);
  const { n } = reachable(m, Math.floor(m.portals[0].x), Math.floor(m.portals[0].y));
  assert.equal(n, walkableCount(m), '取り残された歩けるマスが無い');
  for (let x = 0; x < m.w; x++) { assert.equal(m.solid[x], 1); assert.equal(m.solid[(m.h - 1) * m.w + x], 1); }
});

test('迷宮: 入口と出口が床の上にあり、互いにたどれて、離れている。魔物の湧く場所は部屋の床', () => {
  const def = {
    id: 'tower1', w: 96, h: 96, gen: { type: 'dungeon', seed: 1234 },
    portals: [{ id: 'up', at: 'entrance', to: { map: 'road' } }, { id: 'down', at: 'exit', to: { map: 'tower2' } }],
    spawns: [{ monsters: ['bone_soldier'], r: 3, count: 3, respawn: 30 }, { monsters: ['bell_warden'], at: 'boss', r: 1, count: 1, respawn: 600 }],
  };
  const m = G.buildMap(def);
  assert.deepEqual(G.buildMap(def).ground, m.ground, '同じ種なら同じ迷宮');
  const up = m.portals.find((p) => p.id === 'up'), down = m.portals.find((p) => p.id === 'down');
  assert.ok(G.walkable(m, Math.floor(up.x), Math.floor(up.y)));
  assert.ok(G.walkable(m, Math.floor(down.x), Math.floor(down.y)));
  const path = G.findPath(m, up.x, up.y, down.x, down.y, { maxNodes: 100000 });
  assert.ok(path && path.length > 0, '入口から出口へ道がある');
  assert.ok(Math.hypot(up.x - down.x, up.y - down.y) > 20, '入口と出口は離れている');
  for (const s of m.spawns) assert.ok(G.walkable(m, Math.floor(s.x), Math.floor(s.y)), '湧く場所は床');
  const boss = m.spawns.find((s) => s.monsters[0] === 'bell_warden');
  const room = m.rooms[m.anchors.bossRoom];
  assert.ok(boss.x >= room.x && boss.x <= room.x + room.w && boss.y >= room.y && boss.y <= room.y + room.h, 'ボスは最も奥の部屋');
  assert.ok(m.ground.includes(T('dungeon_floor')));
  assert.ok(m.ground.includes(T('wall_dungeon')));
  const { n } = reachable(m, Math.floor(up.x), Math.floor(up.y));
  assert.equal(n, walkableCount(m), '迷宮の床は全部つながる');
});

test('迷宮: at が無い入口は順番で入口・出口に置く', () => {
  const m = G.buildMap({ id: 'tower2', w: 64, h: 64, gen: { type: 'dungeon', seed: 5 }, portals: [{ id: 'a', x: 0, y: 0, to: { map: 'tower1' } }, { id: 'b', to: { map: 'tower3' } }] });
  assert.deepEqual([m.portals[0].x, m.portals[0].y], [m.anchors.entrance.x, m.anchors.entrance.y]);
  assert.deepEqual([m.portals[1].x, m.portals[1].y], [m.anchors.exit.x, m.anchors.exit.y]);
});

function openMap(rows) {
  return G.buildMap({ id: 't', rows, legend: { '.': { ground: 'grass' }, '#': { ground: 'wall_town' } } });
}

test('道探し: 壁を回り込み、角は切らない', () => {
  const m = openMap([
    '.....',
    '.###.',
    '...#.',
    '.#...',
  ]);
  const p = G.findPath(m, 0.5, 2.5, 4.5, 3.5);
  assert.ok(p, '道がある');
  const last = p[p.length - 1];
  assert.deepEqual(last, [4.5, 3.5]);
  // 角を切らない: 斜めに進む 2 点の間で、横と縦のマスがどちらも歩ける
  let prev = [0.5, 2.5];
  for (const pt of p) {
    assert.ok(G.lineOfSight(m, prev[0], prev[1], pt[0], pt[1]), `${prev} → ${pt} は壁を通らない`);
    prev = pt;
  }
});

test('道探し: 斜めの隙間（角だけが接している）は通れない', () => {
  const m = openMap([
    '.#',
    '#.',
  ]);
  assert.equal(G.findPath(m, 0.5, 0.5, 1.5, 1.5), null);
});

test('道探し: 行き先が壁なら、いちばん近い歩けるマスへ向かう。閉じた場所へは null', () => {
  const m = openMap([
    '......',
    '..##..',
    '..##..',
    '......',
  ]);
  const p = G.findPath(m, 0.5, 0.5, 2.5, 1.5);
  assert.ok(p);
  const [lx, ly] = p[p.length - 1];
  assert.equal(G.walkable(m, Math.floor(lx), Math.floor(ly)), true);
  assert.ok(Math.hypot(lx - 2.5, ly - 1.5) <= 1.5);
  const closed = openMap(['.#.', '###', '...']);
  assert.equal(G.findPath(closed, 0.5, 0.5, 2.5, 2.5), null);
});

test('道探し: 見通しのよい所は 1 点で直行する。追加の通れない印も守る', () => {
  const m = openMap(['........', '........', '........']);
  assert.deepEqual(G.findPath(m, 0.5, 0.5, 7.5, 2.5), [[7.5, 2.5]]);
  const block = new Uint8Array(m.w * m.h);
  for (let y = 0; y < 3; y++) block[y * m.w + 4] = 1;
  assert.equal(G.findPath(m, 0.5, 0.5, 7.5, 2.5, { block }), null);
});

test('見通し: 壁を挟むと見えない', () => {
  const m = openMap(['.....', '..#..', '.....']);
  assert.equal(G.lineOfSight(m, 0.5, 1.5, 4.5, 1.5), false);
  assert.equal(G.lineOfSight(m, 0.5, 0.5, 4.5, 0.5), true);
});

test('向き: 0 が +y、時計回りに 4 = −x、8 = −y、12 = +x', () => {
  assert.equal(G.dirFromVec(0, 1), 0);
  assert.equal(G.dirFromVec(-1, 0), 4);
  assert.equal(G.dirFromVec(0, -1), 8);
  assert.equal(G.dirFromVec(1, 0), 12);
  assert.equal(G.dirFromVec(-1, 1), 2);
  const [vx, vy] = G.vecFromDir(12);
  assert.ok(Math.abs(vx - 1) < 1e-9 && Math.abs(vy) < 1e-9);
});

test('乱数: 同じ種なら同じ並び。範囲を守る', () => {
  const a = G.makeRng('abc'), b = G.makeRng('abc');
  for (let i = 0; i < 50; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
  const r = G.makeRng(3);
  for (let i = 0; i < 200; i++) { const n = r.int(2, 5); assert.ok(n >= 2 && n <= 5 && Number.isInteger(n)); }
});
