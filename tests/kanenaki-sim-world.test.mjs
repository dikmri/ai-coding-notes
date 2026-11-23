// 世界の計算のテスト（1 人用）: 入る、歩く、命令の確かめ、戦って育つ、持ち物、依頼、入口、倒れる、保存と続き、止める、確かめ用の命令
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, join, fakeConn, moveTo, spawnMonster } from '../kanenaki/sim/fixtures/testkit.mjs';
import { xpToNext } from '../kanenaki/shared/calc.mjs';
import { INV_W, INV_H } from '../kanenaki/shared/schema.mjs';
import { applyDamage } from '../kanenaki/sim/combat.mjs';

test('入る: 保存が無ければ名前の候補、選んだ名前で作ると町に入り、全部の情報と保存の中身が届く', () => {
  const { W } = makeWorld();
  const c = fakeConn();
  const s = W.connect(c);
  W.receive(s, { t: 'hello', v: 1 });
  assert.equal(c.last('welcome').you, null);
  const names = c.last('names').list;
  assert.equal(names.length, 3);
  W.receive(s, { t: 'create', name: names[2] });
  W.step(2);
  const z = c.last('zone');
  assert.equal(z.map, 'town');
  assert.equal(z.you.name, names[2]);
  assert.equal(z.you.level, 1);
  for (const t of ['welcome', 'inv', 'tree', 'skills', 'quests', 'save']) assert.ok(c.last(t), `${t} が届く`);
  assert.ok(c.last('inv').equip.weapon, '初めの武器を持っている');
  assert.equal(c.last('save').char.name, names[2]);
  assert.ok(c.of('snap').some((m) => m.ents.some((e) => e[0] === z.you.id)), '自分の位置が snap に入る');
});

test('入る: 候補に無い名前は使わない', () => {
  const { W } = makeWorld();
  const c = fakeConn();
  const s = W.connect(c);
  W.receive(s, { t: 'hello', v: 1 });
  W.receive(s, { t: 'create', name: 'ずるい名前' });
  assert.ok(c.last('names').list.includes(s.char.name));
});

test('位置は計算のたびに送る（動いている物は毎回 snap に入る）', () => {
  const { W } = makeWorld();
  const { c, p } = join(W);
  c.msg({ t: 'move', x: p.x - 5, y: p.y }); // 見本の町は東の端に入口がある
  c.clear();
  W.step(6);
  const snaps = c.of('snap').filter((m) => m.ents.some((e) => e[0] === p.id));
  assert.equal(snaps.length, 6);
});

test('歩く: 道を探して目的地へ着く。壁の中は行けない', () => {
  const { W } = makeWorld();
  const { c, p } = join(W);
  const target = { x: 10.5, y: 8.5 };
  c.msg({ t: 'move', ...target });
  W.step(80);
  assert.ok(Math.hypot(p.x - target.x, p.y - target.y) < 0.2, `着いた (${p.x}, ${p.y})`);
  c.msg({ t: 'move', x: 0.5, y: 0.5 }); // 町の壁。いちばん近い歩ける所で止まる
  for (let i = 0; i < 120; i++) { W.step(1); assert.ok(p.zone.free(p.x, p.y), '通れないマスに立たない'); }
  assert.ok(Math.hypot(p.x - 1.5, p.y - 1.5) < 0.2, `壁の手前で止まる (${p.x}, ${p.y})`);
});

test('命令の確かめ: 壊れた JSON、知らない命令、型の違い、入る前の命令、外した命令は err を返し、記録に残る', () => {
  const { W, log } = makeWorld();
  const c = fakeConn();
  const s = W.connect(c);
  W.receive(s, { t: 'move', x: 1, y: 1 });
  assert.equal(c.last('err').code, 'state');
  W.receive(s, '{oops');
  assert.equal(c.last('err').code, 'badMsg');
  W.receive(s, { t: 'hello', v: 1 });
  W.receive(s, { t: 'create' });
  W.receive(s, { t: 'dance' });
  assert.equal(c.last('err').code, 'unknown');
  for (const t of ['chat', 'stamp', 'party', 'ping']) { W.receive(s, { t }); assert.equal(c.last('err').code, 'unknown', `${t} は 1 人用で外した`); }
  W.receive(s, { t: 'move', x: '3', y: 4 });
  assert.equal(c.last('err').code, 'badMsg');
  W.receive(s, { t: 'cast', s: 'no_such_skill', x: 1, y: 1 });
  assert.equal(c.last('err').code, 'noSkill');
  W.receive(s, { t: 'attack', id: 999999 });
  assert.equal(c.last('err').code, 'safe');
  assert.ok(log.lines.some((l) => / cmd args=\{.*"t":"dance".*result=err:unknown/.test(l)), '命令と結果が記録に残る');
  assert.ok(c.of('err').every((e) => /[ぁ-んァ-ヶ一-龠]/.test(e.msg)), 'エラーの文は日本語');
});

test('戦う: 街道の魔物を攻撃して倒すと、経験値が増え、ダメージと倒れた知らせが届く', () => {
  const { W } = makeWorld({ seed: 3 });
  const { c, p, s } = join(W);
  moveTo(W, p, 'road', 20.5, 20.5);
  const z = p.zone;
  for (const a of [...z.actors]) if (a.kind === 'monster') z.remove(a);
  for (const sp of z.spawners) sp.alive.clear();
  const m = spawnMonster(W, z, 'stray_dog', p.x + 3, p.y);
  m.ai.nextScan = Infinity;
  const xp0 = s.char.xp;
  c.msg({ t: 'attack', id: m.id });
  W.step(400);
  assert.ok(m.dead, '倒した');
  assert.ok(s.char.xp > xp0 || s.char.level > 1, '経験値が増えた');
  assert.ok(c.of('fx').some((f) => f.k === 'dmg' && f.id === m.id), 'ダメージの数字が届く');
  assert.ok(c.of('fx').some((f) => f.k === 'death' && f.id === m.id));
});

test('宝を拾うと持ち物に入る。お金はお金に足す', () => {
  const { W } = makeWorld({ seed: 5 });
  const { c, p, s } = join(W);
  moveTo(W, p, 'road', 20.5, 20.5);
  const z = p.zone;
  const it = W.dropToGround(z, p.x + 1, p.y, { item: { uid: 'x1', base: 'ring', name: '指輪', rarity: 'magic', slot: 'ring', w: 1, h: 1, mods: [], affixes: [] } });
  const gold = W.dropToGround(z, p.x + 4, p.y, { gold: 17 });
  const g0 = s.char.gold;
  c.msg({ t: 'pick', id: it.id });
  W.step(30);
  c.msg({ t: 'pick', id: gold.id });
  W.step(60);
  assert.ok(s.char.inv.some((i) => i.uid === 'x1'));
  assert.equal(s.char.gold, g0 + 17);
});

test('育つ: レベルが上がると点が増え、Lv10 で剣の師範の近くなら剣士に転職でき、門のマスをもらう', () => {
  const { W } = makeWorld();
  const { c, p, s } = join(W);
  let need = 0;
  for (let L = 1; L < 10; L++) need += xpToNext(L);
  W.grantXp(p, need);
  assert.equal(s.char.level, 10);
  assert.equal(s.char.points.passive, 9);
  c.msg({ t: 'classChange', cls: 'swordsman' });
  assert.equal(c.last('err').code, 'noNpc', '師範から遠いと転職できない');
  const master = [...p.zone.npcs].find((n) => n.npcId === 'npc_master_swordsman');
  p.zone.moveTo(p, master.x, master.y + 1);
  c.msg({ t: 'talk', npc: master.id });
  assert.ok(c.last('dialog').options.some((o) => o.send.t === 'classChange'));
  c.msg({ t: 'classChange', cls: 'swordsman' });
  W.step(2);
  assert.equal(s.char.cls, 'swordsman');
  assert.ok(s.char.alloc.includes('gate_sw'));
  c.msg({ t: 'skillUp', s: 'f_slash' });
  assert.equal(s.char.ranks.f_slash, 1);
});

test('パッシブのツリー: 取ると能力値が変わり、つながらないマスは取れない。取り消しはお金か聖水', () => {
  const { W } = makeWorld();
  const { c, p, s } = join(W);
  W.grantXp(p, xpToNext(1) + xpToNext(2));
  const str0 = p.stats.str;
  c.msg({ t: 'alloc', node: 'a2' });
  assert.equal(c.last('err').code, 'notConnected');
  c.msg({ t: 'alloc', node: 'a1' });
  W.step(1);
  assert.equal(p.stats.str, str0 + 5);
  c.msg({ t: 'alloc', node: 'a2' });
  c.msg({ t: 'unalloc', node: 'a1' });
  assert.equal(c.last('err').code, 'wouldDisconnect');
  s.char.gold = 0;
  c.msg({ t: 'unalloc', node: 'a2' });
  assert.equal(c.last('err').code, 'noGold');
  s.char.gold = 500;
  c.msg({ t: 'unalloc', node: 'a2' });
  assert.equal(s.char.gold, 500 - 20 * s.char.level);
  assert.equal(s.char.points.passive, 1);
  s.char.inv.push({ uid: 'w1', base: 'oblivion_water', consumable: true, w: 1, h: 1, qty: 1, x: 9, y: 5 });
  c.msg({ t: 'alloc', node: 'a2' });
  c.msg({ t: 'unalloc', node: 'a2' });
  assert.equal(s.char.gold, 500 - 20 * s.char.level);
  assert.ok(!s.char.inv.some((i) => i.uid === 'w1'));
});

test('持ち物: 装備を外して付け直す、鍛冶屋で買って売る、薬を飲む、倉庫へ入れて出す', () => {
  const { W } = makeWorld();
  const { c, p, s } = join(W);
  const ch = s.char;
  c.msg({ t: 'inv', op: 'unequip', from: 'weapon' });
  W.step(1);
  assert.equal(ch.equip.weapon, undefined);
  assert.equal(p.weapon, null);
  const w = ch.inv.find((i) => i.slot === 'weapon');
  c.msg({ t: 'inv', op: 'equip', item: w.uid });
  W.step(1);
  assert.ok(p.weapon);
  const smith = [...p.zone.npcs].find((n) => n.npcId === 'npc_smith');
  c.msg({ t: 'inv', op: 'buy', npc: smith.id, item: 'dagger' });
  assert.equal(c.last('err').code, 'notShop', '遠いと買えない');
  p.zone.moveTo(p, smith.x, smith.y + 1);
  c.msg({ t: 'talk', npc: smith.id, opt: 'shop' });
  const dagger = c.last('shop').items.find((i) => i.id === 'dagger');
  ch.gold = 1000;
  c.msg({ t: 'inv', op: 'buy', npc: smith.id, item: 'dagger' });
  const bought = ch.inv.find((i) => i.base === 'dagger');
  assert.ok(bought);
  assert.equal(ch.gold, 1000 - dagger.price);
  c.msg({ t: 'inv', op: 'sell', npc: smith.id, item: bought.uid });
  assert.ok(!ch.inv.some((i) => i.uid === bought.uid));
  assert.ok(ch.gold > 1000 - dagger.price);
  p.hp = 5;
  const pot = ch.inv.find((i) => i.base === 'potion_life');
  const q0 = pot.qty;
  c.msg({ t: 'inv', op: 'use', item: pot.uid });
  assert.ok(p.hp > 5);
  assert.equal(pot.qty, q0 - 1);
  c.msg({ t: 'inv', op: 'move', item: pot.uid, to: { x: INV_W, y: 0 } });
  assert.equal(c.last('err').code, 'noSpace');
  assert.ok(ch.inv.every((i) => i.x + i.w <= INV_W && i.y + i.h <= INV_H));
  // 倉庫: 宿屋で開いてから出し入れする
  c.msg({ t: 'inv', op: 'stash', item: pot.uid });
  assert.equal(c.last('err').code, 'noStash');
  const inn = [...p.zone.npcs].find((n) => n.role === 'inn');
  p.zone.moveTo(p, inn.x, inn.y + 1);
  c.msg({ t: 'talk', npc: inn.id, opt: 'stash' });
  assert.ok(Array.isArray(c.last('inv').stash));
  c.msg({ t: 'inv', op: 'stash', item: pot.uid });
  assert.ok(ch.stash.some((i) => i.uid === pot.uid) && !ch.inv.some((i) => i.uid === pot.uid));
  c.msg({ t: 'inv', op: 'stash', item: pot.uid });
  assert.ok(ch.inv.some((i) => i.uid === pot.uid));
});

test('依頼: 受けて、骨の兵を倒し、報告すると報酬。次の依頼が出る', () => {
  const { W } = makeWorld();
  const { c, p, s } = join(W);
  const keeper = [...p.zone.npcs].find((n) => n.npcId === 'npc_bellkeeper');
  p.zone.moveTo(p, keeper.x, keeper.y + 1);
  c.msg({ t: 'talk', npc: keeper.id });
  const opt = c.last('dialog').options.find((o) => o.send.t === 'quest');
  assert.equal(opt.send.id, 'q_bones');
  c.msg(opt.send);
  for (let i = 0; i < 3; i++) W.questKill(s, 'bone_soldier');
  W.step(1);
  assert.equal(c.last('quests').list.find((q) => q.id === 'q_bones').state, 'ready');
  const g0 = s.char.gold;
  c.msg({ t: 'quest', op: 'turnIn', id: 'q_bones' });
  W.step(1);
  assert.equal(s.char.gold, g0 + 50);
  assert.equal(s.char.quests.q_bones.state, 'done');
  assert.ok(c.last('quests').list.some((q) => q.id === 'q_herbs' && q.state === 'available'));
});

test('入口: 町の出口へ歩いてワープすると街道に入り（そのとき保存の中身が届く）、帰還の巻物で町へ戻る', () => {
  const { W } = makeWorld();
  const { c, p, s } = join(W);
  c.clear();
  c.msg({ t: 'warp', id: 'to_road' });
  W.step(200);
  assert.equal(p.zone.id, 'road');
  assert.equal(c.last('zone').map, 'road');
  assert.ok(c.of('save').some((m) => m.why === 'zone' && m.char.map === 'road'), '区域を移ると保存の中身が届く');
  assert.ok(s.char.visited.includes('road'));
  c.msg({ t: 'portal' });
  W.step(2);
  assert.equal(p.zone.id, 'town');
  assert.equal(s.char.returnTo.map, 'road');
  c.msg({ t: 'warp', id: 'return' });
  W.step(2);
  assert.equal(p.zone.id, 'road');
});

test('倒れる: 経験値を 5% 失い、町で起きる', () => {
  const { W } = makeWorld();
  const { c, p, s } = join(W);
  W.grantXp(p, xpToNext(1) + 200);
  moveTo(W, p, 'road', 20.5, 20.5);
  const xp0 = s.char.xp;
  const m = spawnMonster(W, p.zone, 'bone_soldier', 21.5, 20.5);
  applyDamage(p.zone, m, p, { amount: 99999, type: 'phys', pure: true });
  assert.ok(p.dead);
  assert.equal(s.char.xp, Math.max(0, xp0 - Math.round(0.05 * xpToNext(s.char.level))));
  c.msg({ t: 'move', x: 10, y: 10 });
  assert.equal(c.last('err').code, 'dead');
  c.msg({ t: 'respawn' });
  W.step(2);
  assert.equal(p.dead, false);
  assert.equal(p.zone.id, 'town');
  assert.equal(p.hp, p.maxHp);
});

test('保存と続き: 保存の中身を hello に渡して入り直すと、続きから遊べる', () => {
  const { W } = makeWorld();
  const { c, p, s } = join(W);
  W.grantXp(p, 50);
  s.char.gold = 777;
  p.zone.moveTo(p, 12.5, 9.5);
  c.msg({ t: 'save', why: 'test' });
  const saved = JSON.parse(JSON.stringify(c.last('save').char));
  assert.equal(c.last('save').why, 'test');
  const cid = s.char.id, name = s.char.name;
  W.disconnect(s);
  const { W: W2 } = makeWorld({ seed: 9 });
  const again = join(W2, { char: saved });
  assert.equal(again.s.char.id, cid);
  assert.equal(again.s.char.name, name);
  assert.equal(again.s.char.gold, 777);
  assert.equal(again.s.char.xp, 50);
  assert.ok(Math.hypot(again.p.x - 12.5, again.p.y - 9.5) < 0.2);
  assert.equal(again.c.of('welcome')[0].you.name, name);
});

test('保存と続き: 壊れた保存の中身は断る', () => {
  const { W } = makeWorld();
  const c = fakeConn();
  const s = W.connect(c);
  W.receive(s, { t: 'hello', v: 1, char: { name: 3 } });
  assert.equal(c.last('err').code, 'badSave');
  assert.equal(s.player, null);
});

test('保存: 30 秒ごとに auto、毎秒 sync の中身が届く', () => {
  const { W } = makeWorld();
  const { c } = join(W);
  c.clear();
  W.step(20 * 31);
  assert.equal(c.of('save').filter((m) => m.why === 'auto').length, 1);
  assert.ok(c.of('save').filter((m) => m.why === 'sync').length >= 29);
});

test('止める: 止めている間は世界の時計が進まず、動かすと続きから進む', async () => {
  const { W } = makeWorld();
  const { c } = join(W);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  W.start();
  try {
    c.msg({ t: 'pause', on: true });
    assert.equal(W.paused, true);
    assert.equal(c.last('paused').on, true);
    const now0 = W.now;
    await sleep(150);
    assert.equal(W.now, now0, '止めている間は時計が進まない');
    c.msg({ t: 'pause', on: false });
    assert.equal(c.last('paused').on, false);
    await sleep(200);
    assert.ok(W.now > now0, '動かすと進む');
  } finally { W.stop(); }
});

test('確かめ用の命令: レベル・品・お金・ワープ・職・依頼・速さ・倒れない', () => {
  const { W } = makeWorld();
  const { c, p, s } = join(W);
  c.msg({ t: 'debug', op: 'level', n: 12 });
  assert.equal(s.char.level, 12);
  assert.equal(s.char.points.skill, 11);
  c.msg({ t: 'debug', op: 'item', id: 'dagger', rarity: 'rare' });
  assert.ok(s.char.inv.some((i) => i.base === 'dagger' && i.rarity === 'rare'));
  c.msg({ t: 'debug', op: 'gold', n: 500 });
  assert.ok(s.char.gold >= 500);
  c.msg({ t: 'debug', op: 'warp', map: 'road' });
  W.step(1);
  assert.equal(p.zone.id, 'road');
  c.msg({ t: 'debug', op: 'cls', cls: 'monk' });
  assert.equal(s.char.cls, 'monk');
  c.msg({ t: 'debug', op: 'quest', id: 'q_bones' });
  W.step(1);
  assert.equal(c.last('quests').list.find((q) => q.id === 'q_bones').state, 'ready');
  c.msg({ t: 'debug', op: 'speed', n: 4 });
  assert.equal(W.speed, 4);
  c.msg({ t: 'debug', op: 'god' });
  const m = spawnMonster(W, p.zone, 'bone_soldier', p.x + 1, p.y);
  applyDamage(p.zone, m, p, { amount: 99999, type: 'phys', pure: true });
  assert.ok(!p.dead && p.hp >= 1, '倒れない');
  c.msg({ t: 'debug', op: 'killAll', r: 5 });
  assert.ok(m.dead);
});

test('確かめ用の命令は debug でない世界では使えない', () => {
  const { W } = makeWorld({ debug: false });
  const { c, s } = join(W);
  c.msg({ t: 'debug', op: 'level', n: 30 });
  assert.equal(c.last('err').code, 'noDebug');
  assert.equal(s.char.level, 1);
});

test('誰もいない区域は計算しない', () => {
  const { W } = makeWorld();
  const { p } = join(W);
  moveTo(W, p, 'road', 20.5, 20.5);
  const road = W.zones.get('road');
  const town = W.zones.get('town');
  assert.equal(town.players.size, 0);
  const before = town.timers.length;
  town.later(0.01, () => { throw new Error('止まっているはず'); });
  W.step(20);
  assert.equal(town.timers.length, before + 1, '町のタイマーは進まない');
  assert.ok(road.populated);
});
