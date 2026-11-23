// 本物のデータ（kanenaki/shared/data/index.mjs）で、全部の地図を組み立て、全部のスキルを 1 回ずつ使い、
// 全部の区域で魔物を動かしても、例外が出ないことを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../kanenaki/sim/data.mjs';
import { World } from '../kanenaki/sim/world.mjs';
import { makeRng, walkable, findPath } from '../kanenaki/shared/mapgen.mjs';
import { startCast } from '../kanenaki/sim/effects.mjs';
import { MemoryLogger, join } from '../kanenaki/sim/fixtures/testkit.mjs';

const warns = [];
const D = await loadData({ fallbackUrl: null, warn: (e, a) => warns.push([e, a]) });

async function realWorld(seed = 1) {
  const log = new MemoryLogger();
  const W = new World({ data: D, log, rng: makeRng(seed), now: 5_000_000 });
  const { c, s, p } = join(W);
  return { W, log, c, s, p };
}

test('本物のデータ: 読み込みで足りない物が無く、警告は知らない決まりなどの小さな物だけ', () => {
  for (const [k, v] of Object.entries(D.source)) assert.equal(v, 'data', `${k} は本物のデータから`);
  const bad = warns.filter(([e]) => !['data.unknownRule'].includes(e));
  assert.deepEqual(bad, [], JSON.stringify(bad.slice(0, 5)));
});

test('本物のデータ: 全部の地図が組み立てられ、入り口と出入口は歩け、出入口の行き先がある', () => {
  for (const id of ['town', 'road', 'bog', 'tower1', 'tower2', 'tower3']) {
    const m = D.maps[id];
    assert.ok(m, `${id} がある`);
    assert.ok(walkable(m, Math.floor(m.entry.x), Math.floor(m.entry.y)), `${id} の入り口は歩ける`);
    for (const p of m.portals) {
      assert.ok(D.maps[p.to.map], `${id}.${p.id} の行き先 ${p.to.map}`);
      if (p.to.portal) assert.ok(D.maps[p.to.map].portals.some((q) => q.id === p.to.portal), `${p.to.map} に ${p.to.portal} がある`);
      const path = findPath(m, m.entry.x, m.entry.y, p.x, p.y, { maxNodes: 200000 });
      assert.ok(path, `${id} の入り口から ${p.id} へ歩いて行ける`);
    }
  }
  assert.ok(D.maps.tower3.spawns.some((s) => s.monsters.includes('bell_warden')), '3 階にボス');
});

test('本物のデータ: 作ったキャラは職業の初めの持ち物を持ち、町の入り口に立つ', async () => {
  const { p, s } = await realWorld();
  const start = D.classes.adventurer.start;
  if (start?.weapon) assert.equal(s.char.equip.weapon.base, start.weapon);
  for (const a of start?.armor ?? []) assert.ok(Object.values(s.char.equip).some((it) => it.base === a));
  assert.equal(p.zone.id, 'town');
  assert.ok(Math.hypot(p.x - D.maps.town.entry.x, p.y - D.maps.town.entry.y) < 0.6);
});

test('本物のデータ: 全部のスキル（魔物のスキルも）を 1 回ずつ使っても例外が出ない', async () => {
  const { W, log, p } = await realWorld(2);
  W.transfer(p, 'road', 64.5, 64.5, 'test');
  W.step(1);
  const z = p.zone;
  for (const a of [...z.actors]) if (a.kind === 'monster') z.remove(a);
  for (const sp of z.spawners) { sp.alive.clear(); sp.def = { ...sp.def, count: 0 }; }
  p.char.level = 30; p.level = 30; p.dirtyStats = true;
  W.step(1);
  const ally = W.makeMonster(D.monsters.minion_skeleton ?? Object.values(D.monsters)[0], { x: p.x + 1, y: p.y, team: 'p' });
  z.add(ally);
  let n = 0;
  for (const sk of Object.values(D.skills)) {
    p.dead = false; p.hp = p.maxHp; p.mana = p.maxMana; p.casting = null; p.channel = null; p.forced = null; p.untargetable = false;
    if (!z.free(p.x, p.y)) z.moveTo(p, 64.5, 64.5);
    const def = D.monsters.bone_soldier ?? Object.values(D.monsters).find((m) => !m.boss && !m.minion);
    const foe = W.makeMonster({ ...def, life: 5000 }, { x: p.x + 2, y: p.y + 0.5, team: 'm' });
    foe.ai.nextScan = Infinity;
    z.add(foe);
    const target = sk.target === 'enemy' ? foe : sk.target === 'ally' ? ally : null;
    const point = sk.target === 'self' ? { x: p.x, y: p.y } : { x: foe.x, y: foe.y };
    startCast(z, p, sk, 3, { target, point });
    W.step(30);
    for (const a of [...z.actors]) if (a !== p && a !== ally) z.remove(a);
    for (const o of [...z.objects]) z.remove(o);
    for (const m of [...z.missiles]) z.remove(m);
    p.statuses = []; p.auras = {}; p.stances = {}; p.reserved = 0; p.dirtyStats = true;
    n++;
  }
  assert.ok(n >= 70, `スキルの数 ${n}`);
  assert.deepEqual(log.errors, [], log.errors.slice(0, 3).join('\n'));
});

test('本物のデータ: 全部の区域で魔物（精鋭・ボスを含む）が 20 秒動いても例外が出ない', async () => {
  const { W, log, p } = await realWorld(3);
  p.char.level = 40; p.level = 40; p.dirtyStats = true;
  for (const id of ['road', 'bog', 'tower1', 'tower2', 'tower3']) {
    const z0 = W.zone(id);
    const sp = z0.map.spawns.find((s) => s.monsters.includes('bell_warden')) ?? z0.map.spawns[0];
    W.transfer(p, id, sp?.x ?? null, sp?.y ?? null, 'test');
    W.step(1);
    p.dead = false; p.hp = p.maxHp = 1e9;
    for (let i = 0; i < 400; i++) { if (p.dead) { p.dead = false; p.hp = p.maxHp; } W.step(1); }
    assert.ok(z0.populated && [...z0.actors].some((a) => a.kind === 'monster'), `${id} に魔物がいる`);
  }
  assert.deepEqual(log.errors, [], log.errors.slice(0, 3).join('\n'));
});
