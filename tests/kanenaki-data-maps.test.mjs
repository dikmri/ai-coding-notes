// 『鐘なき王国』のデータの検査（2）: 地図。サーバーの係の mapgen.mjs の buildMap で実際に組み立てて確かめる
// （町の文字の行、建物の足元、出入口と着く場所、湧く場所、NPC、迷宮のボスの部屋）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../kanenaki/shared/data/index.mjs';
import { buildMap, walkable, TILE_TYPES, PROP_INFO } from '../kanenaki/shared/mapgen.mjs';

const PROP_ARTS = ['tree_oak', 'tree_dead', 'tree_pine', 'rock_a', 'rock_b', 'house_a', 'house_b', 'house_c',
  'belltower_ruin', 'fence', 'grave', 'crate', 'barrel', 'chest', 'torch', 'brazier', 'bell_shard', 'warp_pad',
  'wall_town', 'wall_dungeon', 'door'];
const MAP_IDS = ['town', 'road', 'bog', 'tower1', 'tower2', 'tower3'];

const built = Object.fromEntries(Object.entries(D.maps).map(([id, def]) => [id, buildMap(def)]));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tile = (p) => [Math.floor(p.x), Math.floor(p.y)];

// 組み立てた地図で、入口（entry）から歩いて行けるマスの集まり
function reachable(m) {
  const seen = new Uint8Array(m.w * m.h);
  const [sx, sy] = tile(m.entry);
  const q = [[sx, sy]];
  seen[sy * m.w + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (walkable(m, nx, ny) && !seen[ny * m.w + nx]) { seen[ny * m.w + nx] = 1; q.push([nx, ny]); }
    }
  }
  return (p) => { const [x, y] = tile(p); return walkable(m, x, y) && seen[y * m.w + x] === 1; };
}
const reach = Object.fromEntries(Object.entries(built).map(([id, m]) => [id, reachable(m)]));
const inRoom = (r, p) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

test('地図: 設計書の 6 つの id。大きさ、名前、暗さ、gen の種類、種', () => {
  assert.deepEqual(Object.keys(D.maps).sort(), [...MAP_IDS].sort());
  const size = { town: 64, road: 128, bog: 128, tower1: 96, tower2: 96, tower3: 96 };
  for (const [id, m] of Object.entries(D.maps)) {
    assert.equal(m.id, id);
    assert.ok(m.name, `${id}: name`);
    assert.equal(m.w, size[id], `${id}: w`);
    assert.equal(m.h, size[id], `${id}: h`);
    assert.ok(typeof m.light === 'number' && m.light >= 0 && m.light <= 1, `${id}: light は暗さ 0〜1`);
  }
  assert.ok(D.maps.town.rows && !D.maps.town.gen, '町は手で作った rows');
  assert.ok(D.maps.town.light < D.maps.road.light && D.maps.road.light < D.maps.bog.light && D.maps.bog.light < D.maps.tower1.light, '町 → 街道 → 霧沼 → 鐘楼の順に暗い');
  for (const id of ['road', 'bog']) assert.equal(D.maps[id].gen.type, 'field', `${id}: field`);
  for (const id of ['tower1', 'tower2', 'tower3']) assert.equal(D.maps[id].gen.type, 'dungeon', `${id}: dungeon`);
  const seeds = MAP_IDS.filter((id) => D.maps[id].gen).map((id) => D.maps[id].gen.seed);
  assert.ok(seeds.every(Number.isInteger), '種は整数');
  assert.equal(new Set(seeds).size, seeds.length, '種は地図ごとに違う');
});

test('地図: buildMap で組み立てても警告が出ない', () => {
  for (const [id, m] of Object.entries(built)) assert.deepEqual(m.warnings, [], `${id} の警告`);
});

test('町: 64×64 の文字の行。全部の文字が legend にあり、床の種類は TILE_TYPES、外周は出口のほか通れない', () => {
  const m = D.maps.town;
  assert.equal(m.rows.length, 64);
  m.rows.forEach((r, y) => assert.equal(r.length, 64, `町の ${y} 行目の長さ ${r.length}`));
  for (const [ch, l] of Object.entries(m.legend)) {
    assert.equal(ch.length, 1);
    assert.ok(TILE_TYPES.includes(l.ground), `legend '${ch}': ground ${l.ground}`);
    if (l.prop) assert.ok(PROP_ARTS.includes(l.prop), `legend '${ch}': prop ${l.prop}`);
  }
  m.rows.forEach((r, y) => [...r].forEach((ch, x) => assert.ok(m.legend[ch], `(${x},${y}) の文字 '${ch}' が legend に無い`)));
  const b = built.town;
  for (let i = 0; i < 64; i++) {
    for (const [x, y] of [[i, 0], [i, 63], [0, i], [63, i]]) {
      if (walkable(b, x, y)) assert.ok(m.portals.some((p) => dist(p, { x, y }) <= p.r + 0.01), `外周 (${x},${y}) が出口でないのに歩ける`);
    }
  }
});

test('町: 家と鐘楼の足元（PROP_INFO の大きさ）は rows の h / r と同じ広さで重なる', () => {
  const m = D.maps.town;
  let covered = 0;
  for (const p of m.props) {
    const fp = PROP_INFO[p.art]?.fp ?? [1, 1];
    if (fp[0] * fp[1] === 1) continue;
    const x0 = Math.floor(p.x + 0.5 - fp[0] / 2 + 1e-6), y0 = Math.floor(p.y + 0.5 - fp[1] / 2 + 1e-6);
    for (let y = y0; y < y0 + fp[1]; y++) for (let x = x0; x < x0 + fp[0]; x++) {
      assert.ok('hr'.includes(m.rows[y][x]), `${p.art} (${p.x},${p.y}) の足元 (${x},${y}) が '${m.rows[y][x]}'`);
      covered++;
    }
  }
  const hr = m.rows.join('').split('').filter((c) => c === 'h' || c === 'r').length;
  assert.equal(covered, hr, '家の無い h / r のマスがある');
});

test('町: 起きる場所・NPC 11 人・出入口・ワープの台に、入口から歩いて行ける', () => {
  const m = D.maps.town, ok = reach.town;
  assert.ok(ok(m.respawn), '起きる場所');
  for (const n of built.town.npcs) assert.ok(ok(n), `${n.id} (${n.x},${n.y})`);
  for (const p of built.town.portals) assert.ok(ok(p), `${p.id}`);
  const pad = m.props.find((p) => p.art === 'warp_pad');
  assert.ok(pad && ok(pad), 'ワープの台');
  assert.deepEqual(m.npcs.map((n) => n.id).sort(), Object.keys(D.npcs).sort());
});

test('地図: 湧く魔物・NPC・置物の絵が存在し、湧く場所と出入口に入口から行ける', () => {
  for (const [id, def] of Object.entries(D.maps)) {
    const m = built[id];
    for (const s of def.spawns) {
      assert.ok(s.monsters.length > 0);
      for (const mid of s.monsters) {
        assert.ok(D.monsters[mid], `${id}: 魔物 ${mid}`);
        assert.ok(!D.monsters[mid].minion, `${id}: 召喚の味方 ${mid} を湧かせない`);
      }
      assert.ok(s.count >= 1 && s.r > 0 && s.respawn > 0, `${id}: count, r, respawn`);
    }
    for (const s of m.spawns) assert.ok(reach[id](s), `${id}: 湧く場所 (${s.x},${s.y}) に行けない`);
    for (const p of m.portals) assert.ok(reach[id](p), `${id}/${p.id}: 出入口に行けない`);
    for (const n of def.npcs) assert.ok(D.npcs[n.id], `${id}: NPC ${n.id}`);
    for (const pr of def.props) assert.ok(PROP_ARTS.includes(pr.art), `${id}: 物の絵 ${pr.art}`);
    for (const p of def.portals) if (p.opensAfter) assert.ok(D.monsters[p.opensAfter], `${p.id}: opensAfter`);
  }
});

// 行き先 { map, portal?, x?, y? } を確かめる
function checkDest(where, to) {
  const def = D.maps[to.map];
  assert.ok(def, `${where}: 行き先の地図 ${to.map}`);
  if (to.portal) assert.ok(def.portals.some((q) => q.id === to.portal), `${where}: ${to.map} に出入口 ${to.portal} が無い`);
  if (to.x != null) {
    assert.ok(!def.gen || def.gen.type !== 'dungeon', `${where}: 迷宮へは x, y でなく portal で着く`);
    const p = { x: to.x + 0.5, y: to.y + 0.5 };
    assert.ok(reach[to.map](p), `${where}: 着く場所 (${to.x},${to.y}) が ${to.map} で歩けないか行けない`);
    for (const q of built[to.map].portals) assert.ok(dist(q, p) > q.r + 0.5, `${where}: 着く場所が ${q.id} の上`);
  } else {
    assert.ok(to.portal, `${where}: x, y も portal も無い`);
  }
}

test('地図: 出入口とワープの行き先があり、着く場所は歩ける', () => {
  for (const def of Object.values(D.maps)) {
    for (const p of def.portals) {
      assert.ok(p.r > 0, `${p.id}: r`);
      if (def.gen?.type === 'dungeon') assert.ok(['entrance', 'exit'].includes(p.at), `${p.id}: 迷宮の出入口は at`);
      checkDest(`${def.id}/${p.id}`, p.to);
    }
  }
  for (const w of D.npcs.npc_warp.warps) checkDest(`ワープ ${w.name}`, w);
});

test('地図: 出入口は行き来できる（片道の印が無い限り、行き先の出入口が自分を指す）', () => {
  for (const def of Object.values(D.maps)) {
    for (const p of def.portals) {
      if (p.oneWay) continue;
      const back = D.maps[p.to.map].portals.find((q) => q.id === p.to.portal);
      assert.ok(back, `${p.id}: 戻る出入口`);
      assert.equal(back.to.map, def.id, `${p.id} ↔ ${back.id}`);
      assert.equal(back.to.portal, p.id, `${p.id} ↔ ${back.id}`);
    }
  }
  const next = (a, b) => D.maps[a].portals.some((p) => p.to.map === b);
  for (const [a, b] of [['town', 'road'], ['road', 'bog'], ['bog', 'tower1'], ['tower1', 'tower2'], ['tower2', 'tower3'], ['tower3', 'town']]) {
    assert.ok(next(a, b), `${a} → ${b}`);
  }
});

test('地図: 野外の湧く場所の円は、出入口と着く場所から 6 マス以上離れている', () => {
  for (const def of Object.values(D.maps)) {
    if (def.gen?.type === 'dungeon') continue;
    const arrivals = Object.values(D.maps).flatMap((o) => o.portals.filter((p) => p.to.map === def.id && p.to.x != null).map((p) => p.to));
    for (const s of def.spawns) {
      for (const a of [...def.portals, ...arrivals]) {
        assert.ok(dist(s, a) >= s.r + 6, `${def.id}: 湧く場所 (${s.x},${s.y}) が (${a.x},${a.y}) に近い`);
      }
    }
  }
});

test('迷宮: 部屋が 8 つ以上あり、入口と奥の部屋が違い、3 階のボスと町への出口はボスの部屋にある', () => {
  for (const id of ['tower1', 'tower2', 'tower3']) {
    const m = built[id];
    assert.ok(m.rooms.length >= 8, `${id}: 部屋 ${m.rooms.length}`);
    assert.notEqual(m.anchors.entranceRoom, m.anchors.exitRoom, `${id}: 入口と奥`);
    assert.ok(m.spawns.length >= 5, `${id}: 湧く場所 ${m.spawns.length}`);
  }
  const m = built.tower3, room = m.rooms[m.anchors.bossRoom];
  const boss = m.spawns.filter((s) => s.monsters.includes('bell_warden'));
  assert.equal(boss.length, 1);
  assert.equal(boss[0].count, 1);
  assert.ok(inRoom(room, boss[0]), 'ボスはボスの部屋');
  assert.ok(m.spawns.filter((s) => s !== boss[0]).every((s) => !inRoom(room, s)), 'ボスの部屋にほかの魔物は湧かない');
  assert.ok(inRoom(room, m.portals.find((p) => p.id === 'tower3_exit')), '町への出口はボスの部屋');
});
