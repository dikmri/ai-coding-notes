// 『鐘なき王国』のデータの検査（3）: パッシブのツリー（数、つながり、重なり、目玉と要、生成の再現）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAT_KEYS, MOD_MODES, STAGE1_CLASSES } from '../kanenaki/shared/schema.mjs';
import { tree } from '../kanenaki/shared/data/tree.mjs';
import { buildTree, TREE_SEED } from '../kanenaki/tools/gen-tree.mjs';

const nodes = Object.values(tree.nodes);
const count = (kind) => nodes.filter((n) => n.kind === kind).length;

test('ツリー: マス 380〜420、目玉 45〜55、要 7〜9、出発点 1、門 6', () => {
  assert.ok(nodes.length >= 380 && nodes.length <= 420, `マスの数 ${nodes.length}`);
  assert.ok(count('notable') >= 45 && count('notable') <= 55, `目玉 ${count('notable')}`);
  assert.ok(count('keystone') >= 7 && count('keystone') <= 9, `要 ${count('keystone')}`);
  assert.equal(count('start'), 1);
  assert.equal(count('gate'), 6);
  for (const n of nodes) assert.ok(['small', 'notable', 'keystone', 'start', 'gate'].includes(n.kind), `${n.id}: kind`);
});

test('ツリー: 出発点は 7 職ぶん。冒険者は中心の start、6 職はそれぞれの門', () => {
  assert.deepEqual(Object.keys(tree.starts).sort(), [...STAGE1_CLASSES].sort());
  const s = tree.nodes[tree.starts.adventurer];
  assert.equal(s.kind, 'start');
  assert.equal(s.cls, 'adventurer');
  for (const cls of STAGE1_CLASSES.filter((c) => c !== 'adventurer')) {
    const g = tree.nodes[tree.starts[cls]];
    assert.equal(g.kind, 'gate', `${cls}: 門`);
    assert.equal(g.cls, cls);
  }
});

test('ツリー: つながりは両向きで、自分や存在しないマスへのつながりはない', () => {
  for (const n of nodes) {
    assert.equal(n.id, Object.keys(tree.nodes).find((k) => tree.nodes[k] === n));
    assert.equal(new Set(n.links).size, n.links.length, `${n.id}: つながりが重複`);
    for (const l of n.links) {
      assert.notEqual(l, n.id, `${n.id}: 自分へのつながり`);
      assert.ok(tree.nodes[l], `${n.id}: ${l} が無い`);
      assert.ok(tree.nodes[l].links.includes(n.id), `${n.id} → ${l} が片向き`);
    }
  }
});

test('ツリー: 全マスがどの出発点からもつながっている', () => {
  for (const [cls, start] of Object.entries(tree.starts)) {
    const seen = new Set([start]);
    const q = [start];
    while (q.length) for (const l of tree.nodes[q.pop()].links) if (!seen.has(l)) { seen.add(l); q.push(l); }
    assert.equal(seen.size, nodes.length, `${cls} の出発点から届かないマスがある`);
  }
});

test('ツリー: マスどうしが重ならない（どの 2 マスも 40 以上離れている）', () => {
  let min = Infinity, pair = null;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < min) { min = d; pair = [nodes[i].id, nodes[j].id]; }
    }
  }
  assert.ok(min >= 40, `最も近い 2 マス ${pair} の距離 ${min.toFixed(1)}`);
  for (const n of nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `${n.id}: 座標`);
});

test('ツリー: 能力値のキーは STAT_KEYS、目玉と要は名前が重ならず、要は rule を持つ', () => {
  for (const n of nodes) {
    assert.ok(n.name, `${n.id}: name`);
    for (const m of n.mods) {
      assert.ok(STAT_KEYS.includes(m.key), `${n.id}: キー ${m.key}`);
      assert.ok(MOD_MODES.includes(m.mode), `${n.id}: mode ${m.mode}`);
      assert.equal(typeof m.value, 'number', `${n.id}: value`);
    }
    if (n.kind === 'small' || n.kind === 'notable') assert.ok(n.mods.length > 0, `${n.id}: mods が空`);
    if (n.kind === 'keystone') {
      assert.match(n.rule ?? '', /^[a-z][A-Za-z0-9]+$/, `${n.id}: rule は camelCase の短い id`);
      assert.ok(n.ruleDesc, `${n.id}: ruleDesc`);
    } else {
      assert.equal(n.rule, undefined, `${n.id}: rule は要だけ`);
    }
  }
  const big = nodes.filter((n) => n.kind === 'notable' || n.kind === 'keystone').map((n) => n.name);
  assert.equal(new Set(big).size, big.length, '目玉と要の名前が重なっている');
});

test('ツリー: 生成の台本は同じ種から同じツリーを作り、tree.mjs と一致する', () => {
  const a = buildTree(TREE_SEED);
  const b = buildTree(TREE_SEED);
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(tree)), 'tree.mjs が古い。node kanenaki/tools/gen-tree.mjs で作り直す');
  assert.notDeepEqual(buildTree(TREE_SEED + 1), a, '種が違えば結果も違う');
});
