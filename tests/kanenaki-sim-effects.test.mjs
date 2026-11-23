// スキルの効果の部品（schema の OPS）を、本物の cast の命令からすべて実行して、起きたことを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPS } from '../kanenaki/shared/schema.mjs';
import { HANDLERS, spawnMissile } from '../kanenaki/sim/effects.mjs';
import { applyDamage } from '../kanenaki/sim/combat.mjs';
import { hasStatus } from '../kanenaki/sim/actor.mjs';
import { makeWorld, join, moveTo } from '../kanenaki/sim/fixtures/testkit.mjs';

test('OPS の部品はすべて実行できる（実行の仕組みが揃っている）', () => {
  for (const op of Object.keys(OPS)) assert.equal(typeof HANDLERS[op], 'function', `${op} の実行`);
});

// 街道の (20.5, 20.5) にプレイヤー、(23.5, 20.5) に動かない的（体力 500、回避 0）
async function arena(seed = 7) {
  const { W, log } = makeWorld({ seed });
  const { c, p, s } = await join(W);
  moveTo(W, p, 'road', 20.5, 20.5);
  const z = p.zone;
  for (const a of [...z.actors]) if (a.kind === 'monster') z.remove(a);
  for (const sp of z.spawners) { sp.alive.clear(); sp.def = { ...sp.def, count: 0 }; }
  for (const sid of Object.keys(W.data.skills)) if (W.data.skills[sid].cls === 'adventurer') s.char.ranks[sid] = 1;
  const dummy = (x = 23.5, y = 20.5, extra = {}) => {
    const def = { ...W.data.monsters.bone_soldier, life: 500, evasion: 0, armor: 0, ...extra };
    const m = W.makeMonster(def, { x, y, team: 'm' });
    m.ai.nextScan = Infinity;
    z.add(m);
    return m;
  };
  const cast = (sid, o = {}) => {
    p.mana = p.maxMana; delete p.cds[sid];
    c.msg({ t: 'cast', s: sid, ...o });
    const e = c.last('err');
    c.clear();
    return e;
  };
  return { W, log, c, p, s, z, dummy, cast };
}

test('hit・debuff（気絶）・knockback・area（扇と線）・dot・mark・execute', async () => {
  const { W, log, p, z, dummy, cast } = await arena();
  const m = dummy(21.6, 20.5);
  assert.equal(cast('f_strike', { id: m.id }), undefined);
  assert.ok(m.hp < m.maxHp, 'hit が当たる');
  assert.ok(m.cc.stun, 'debuff で気絶');
  const x0 = m.x;
  W.step(20);
  cast('f_kick', { id: m.id });
  W.step(10);
  assert.ok(m.x > x0 + 1.5, `knockback で押し出す ${x0} → ${m.x}`);
  const hp1 = m.hp;
  cast('f_cleave', { x: m.x, y: m.y });
  assert.ok(m.hp < hp1 || m.dist > 3, '扇の範囲');
  const m2 = dummy(24.5, 20.5);
  cast('f_line', { x: 26.5, y: 20.5 });
  const hp2 = m2.hp;
  W.step(6);
  assert.ok(m2.hp < hp2, '線の範囲（0.2 秒遅れ）');
  cast('f_poison', { id: m2.id });
  assert.ok(m2.statuses.some((s) => s.kind === 'dot'));
  const hp3 = m2.hp;
  W.step(25);
  assert.ok(m2.hp < hp3, 'dot で時間とともに減る');
  const a0 = m2.stats.armor;
  m2.def = { ...m2.def, armor: 100 }; m2.dirtyStats = true; W.step(1);
  const armorBefore = m2.stats.armor;
  cast('f_mark', { id: m2.id });
  W.step(1);
  assert.ok(m2.stats.armor < armorBefore, `mark で防御が下がる ${armorBefore} → ${m2.stats.armor}`);
  m2.hp = m2.maxHp * 0.2;
  cast('f_execute', { id: m2.id });
  assert.ok(m2.dead, 'execute でとどめ');
  assert.ok(a0 >= 0);
  assert.deepEqual(log.errors, []);
});

test('projectile・hook・vortex・zone・trap・channel・delayed・leap', async () => {
  const { W, log, p, z, dummy, cast } = await arena();
  const m = dummy(25.5, 20.5);
  let hp = m.hp;
  cast('f_knife', { x: m.x, y: m.y });
  assert.ok([...z.missiles].length >= 1, '飛び道具が出る');
  W.step(10);
  assert.ok(m.hp < hp, 'projectile が当たる');
  const d0 = Math.hypot(m.x - p.x, m.y - p.y);
  cast('f_hook', { x: m.x, y: m.y });
  W.step(20);
  assert.ok(Math.hypot(m.x - p.x, m.y - p.y) < d0 - 1.5, 'hook で引き寄せる');
  const far = dummy(28.5, 24.5);
  const v0 = { x: far.x, y: far.y };
  cast('f_vortex', { x: 26.5, y: 22.5 });
  W.step(10);
  assert.ok(Math.hypot(far.x - 26.5, far.y - 22.5) < Math.hypot(v0.x - 26.5, v0.y - 22.5), 'vortex で中心へ寄る');
  hp = far.hp;
  cast('f_burn', { x: far.x, y: far.y });
  W.step(12);
  assert.ok(far.hp < hp, 'zone の範囲で削る');
  const t = dummy(22.5, 23.5);
  cast('f_trap', { x: 22.5, y: 23.5 });
  assert.ok([...z.objects].some((o) => o.objKind === 'trap'));
  hp = t.hp;
  W.step(10);
  assert.ok(t.hp < hp, '罠が作動する');
  assert.ok(![...z.objects].some((o) => o.objKind === 'trap'), '作動した罠は消える');
  hp = t.hp;
  cast('f_channel', { x: t.x, y: t.y });
  assert.ok(p.channel);
  W.step(25);
  assert.ok(t.hp < hp && !p.channel, 'channel で何度も当たり、時間で終わる');
  hp = t.hp;
  cast('f_doom', { id: t.id });
  assert.equal(t.hp, hp, 'delayed はすぐには当たらない');
  W.step(12);
  assert.ok(t.hp < hp, 'delayed が遅れて当たる');
  hp = t.hp;
  cast('f_leap', { x: t.x - 0.5, y: t.y });
  assert.ok(p.untargetable, '跳んでいる間は当たらない');
  W.step(15);
  assert.ok(!p.untargetable && Math.hypot(p.x - (t.x - 0.5), p.y - t.y) < 1.2, 'leap で着地');
  assert.ok(t.hp < hp, '着地の範囲');
  assert.deepEqual(log.errors, []);
});

test('dash（倒すと待ち時間が戻る）・blink・behindTarget・swap・rewind', async () => {
  const { W, log, p, z, dummy, cast } = await arena();
  const m = dummy(26.5, 20.5);
  cast('f_dash', { id: m.id });
  W.step(15);
  assert.ok(Math.hypot(p.x - m.x, p.y - m.y) < 1.5, 'dash で近づく');
  assert.ok(m.hp < m.maxHp);
  assert.ok(p.cds.f_dash > W.now, '待ち時間に入る');
  m.hp = 3;
  p.mana = p.maxMana; delete p.cds.f_dash;
  const { c } = { c: p.session.conn };
  c.msg({ t: 'cast', s: 'f_dash', id: m.id });
  W.step(15);
  assert.ok(m.dead, '倒した');
  assert.ok(!(p.cds.f_dash > W.now), '倒すと待ち時間が戻る');
  const target = { x: p.x - 4, y: p.y };
  cast('f_blink', target);
  assert.ok(Math.hypot(p.x - target.x, p.y - target.y) < 0.8, 'blink');
  const b = dummy(p.x + 3, p.y);
  cast('f_behind', { id: b.id });
  assert.ok(p.x > b.x, '相手の後ろへ');
  const before = { px: p.x, py: p.y, bx: b.x, by: b.y };
  cast('f_swap', { id: b.id });
  assert.ok(Math.abs(p.x - before.bx) < 1e-9 && Math.abs(b.x - before.px) < 1e-9, 'swap で入れ替わる');
  W.step(70); // 立ち止まって履歴をためる
  const start = { x: p.x, y: p.y };
  p.session.conn.msg({ t: 'move', x: p.x - 6, y: p.y });
  W.step(58); // 歩き終えてから、動き出しの約 3 秒後まで待つ
  assert.ok(Math.hypot(p.x - start.x, p.y - start.y) > 4);
  p.hp = 5;
  cast('f_rewind');
  assert.ok(Math.hypot(p.x - start.x, p.y - start.y) < 1, `rewind で 3 秒前の場所へ (${p.x},${p.y})`);
  assert.ok(p.hp > 5, 'rewind で体力も戻る');
  assert.deepEqual(log.errors, []);
});

test('buff・heal・shield・cheatDeath・cleanse・stance・aura・reflect', async () => {
  const { W, log, p, z, dummy, cast } = await arena();
  const ms0 = p.stats.moveSpeed;
  cast('f_sprint');
  W.step(1);
  assert.ok(p.stats.moveSpeed > ms0, 'buff で速くなる');
  W.step(100);
  assert.equal(p.stats.moveSpeed, ms0, '時間で切れる');
  p.hp = 10;
  cast('f_firstaid');
  assert.ok(p.hp > 10, 'heal');
  cast('f_shield');
  const hp = p.hp;
  const m = dummy();
  applyDamage(z, m, p, { amount: 10, type: 'phys', pure: true });
  assert.equal(p.hp, hp, 'shield が受け止める');
  cast('f_cheat');
  applyDamage(z, m, p, { amount: 99999, type: 'phys', pure: true });
  assert.equal(p.dead, false);
  assert.equal(p.hp, 1, 'cheatDeath で 1 より下がらない');
  W.step(90);
  assert.ok(p.hp > 1, '終わると回復する');
  p.statuses.push({ id: 'chill', kind: 'debuff', cc: 'slow', value: 40, until: W.now + 9999, src: m.id, stacks: 1 });
  p.dirtyStats = true;
  cast('f_cleanse');
  assert.ok(!p.statuses.some((s) => s.kind === 'debuff'), 'cleanse で消える');
  const ar0 = p.stats.armor;
  cast('f_stance');
  W.step(1);
  assert.equal(p.stats.armor, ar0 + 20, 'stance');
  cast('f_stance');
  W.step(1);
  assert.equal(p.stats.armor, ar0, '同じ構えでもう一度押すと解ける');
  cast('f_aura');
  W.step(12);
  assert.equal(p.reserved, 20, 'aura は魔力を確保する');
  assert.ok(p.stats.armor >= ar0 + 50, 'aura の効果');
  cast('f_aura');
  W.step(20);
  assert.equal(p.reserved, 0, 'aura を切る');
  assert.equal(p.stats.armor, ar0);
  cast('f_reflect');
  const mhp = m.hp;
  spawnMissile(z, { zone: z, caster: m, skill: null, rank: 1, target: p, point: { x: p.x, y: p.y }, depth: 0 }, {
    speed: 12, range: 10, dir: [Math.sign(p.x - m.x) || -1, 0], noScale: true,
    fn: (a) => applyDamage(z, m, a, { amount: 30, type: 'fire', pure: true }),
  });
  const php = p.hp;
  W.step(30);
  assert.equal(p.hp >= php, true, 'reflect で自分には当たらない');
  assert.ok(m.hp < mhp, '跳ね返した飛び道具が相手に当たる');
  assert.deepEqual(log.errors, []);
});

test('summon（上限）・clone・taunt・stealth・wall・revive', async () => {
  const { W, log, p, z, dummy, cast } = await arena();
  cast('f_raise', { x: p.x, y: p.y });
  cast('f_raise', { x: p.x, y: p.y });
  const mine = () => [...z.actors].filter((a) => a.owner === p.id && a.unit === 'minion_skeleton' && !a.dead);
  assert.equal(mine().length, 3, '上限 3 体');
  assert.ok(mine().every((a) => a.team === p.team));
  const m = dummy(24.5, 20.5);
  m.ai.nextScan = 0;
  W.step(60);
  assert.ok(m.hp < m.maxHp, '召喚した骨が戦う');
  cast('f_clone');
  assert.equal([...z.actors].filter((a) => a.clone && a.owner === p.id).length, 2);
  const m2 = dummy(22.5, 22.5);
  cast('f_taunt');
  assert.equal(m2.ai.tauntedBy, p.id);
  assert.equal(m2.ai.target, p.id);
  cast('f_stealth');
  assert.ok(hasStatus(p, 'stealth'));
  W.step(5);
  assert.ok(m2.ai.target !== p.id || m2.ai.tauntedBy === p.id);
  const blocked0 = z.block.reduce((a, b) => a + b, 0);
  cast('f_wall', { x: p.x + 2, y: p.y });
  const blocked = z.block.reduce((a, b) => a + b, 0);
  assert.ok(blocked > blocked0, 'wall で通れないマスができる');
  W.step(100);
  assert.equal(z.block.reduce((a, b) => a + b, 0), blocked0, '時間で消える');
  const other = await join(W, { ip: '9.9.9.9' });
  moveTo(W, other.p, 'road', p.x + 1, p.y);
  applyDamage(z, m, other.p, { amount: 99999, type: 'phys', pure: true });
  assert.ok(other.p.dead);
  cast('f_revive');
  assert.equal(other.p.dead, false, 'revive で起き上がる');
  assert.ok(other.p.hp >= other.p.maxHp * 0.49);
  assert.deepEqual(log.errors, []);
});

test('魔物の動き: 近づいて殴る、遠くから撃つ、呪文で鈍らせる、召喚する、ボスは怒る', async () => {
  const { W, log, p, z } = await arena(11);
  p.hp = p.maxHp = 100000; p.stats.life = 100000;
  // 見通しを良くするため、周りの木と岩をどける（このテストの地図だけ）
  for (let y = 12; y < 30; y++) for (let x = 12; x < 30; x++) z.map.solid[y * z.map.w + x] = 0;
  const mk = (id, x, y) => { const m = W.makeMonster(W.data.monsters[id], { x, y, team: 'm' }); z.add(m); return m; };
  const dog = mk('stray_dog', 26.5, 20.5);
  const sl = mk('mud_imp_slinger', 20.5, 25.5);
  const witch = mk('mist_witch', 16.5, 20.5);
  const aco = mk('cursed_acolyte', 20.5, 16.5);
  const boss = mk('bell_warden', 24.5, 24.5);
  const hp0 = p.hp;
  W.step(200);
  assert.ok(Math.hypot(dog.x - p.x, dog.y - p.y) < 2, '近接は近づく');
  assert.ok(p.hp < hp0, '殴られる');
  assert.ok([...z.actors].some((a) => a.owner === aco.id), '召喚する');
  boss.hp = boss.maxHp * 0.4;
  W.step(5);
  assert.ok(hasStatus(boss, 'enrage'), 'ボスは体力が半分を切ると怒る');
  assert.ok(sl.ai.target === p.id && witch.ai.target === p.id);
  assert.deepEqual(log.errors, []);
});

test('精鋭は名前と付加が付き、体力と経験値が多い', async () => {
  const { W } = await arena(12);
  const def = W.data.monsters.bone_soldier;
  const n = W.makeMonster(def, { x: 10, y: 10, team: 'm' });
  const e = W.makeMonster(def, { x: 10, y: 10, team: 'm', elite: true });
  assert.equal(e.rarity, 'elite');
  assert.ok(e.elite.length >= 1);
  assert.ok(e.maxHp > n.maxHp * 2);
  assert.ok(e.xpValue === n.xpValue * 3);
  assert.notEqual(e.name, n.name);
});

test('bounce・shield の範囲・wall の向き・execute（ボスは 8%）・亡骸が要るスキル', async () => {
  const { W, log, p, z, dummy, cast, c } = await arena();
  const a = dummy(23.5, 20.5), b = dummy(26.5, 20.5), d = dummy(29.5, 20.5);
  cast('f_bounce', { id: a.id });
  for (const m of [a, b, d]) assert.ok(m.hp < m.maxHp, '3 体に跳ぶ');
  assert.ok(Math.hypot(p.x - d.x, p.y - d.y) < 1.5, '使い手は最後の敵のそばへ');
  const other = await join(W, { ip: '8.8.8.8' });
  moveTo(W, other.p, 'road', p.x + 1, p.y);
  cast('f_teamshield');
  assert.ok(other.p.statuses.some((s) => s.kind === 'shield'), '範囲の仲間にも盾');
  p.zone.moveTo(p, 20.5, 20.5);
  const before = new Set([...z.block.keys()].filter((i) => z.block[i]));
  cast('f_wall', { x: 24.5, y: 20.5 });
  const added = [...z.block.keys()].filter((i) => z.block[i] && !before.has(i));
  assert.ok(added.length >= 3);
  assert.ok(added.every((i) => Math.floor(i / z.map.w) === 20), '使い手から地点への向き（横）に伸びる');
  const boss = W.makeMonster(W.data.monsters.bell_warden, { x: 21.5, y: 22.5, team: 'm' });
  boss.ai.nextScan = Infinity;
  z.add(boss);
  boss.hp = boss.maxHp * 0.1;
  const hp0 = boss.hp;
  cast('f_execute', { id: boss.id });
  assert.equal(boss.dead, false, 'ボスは即死しない');
  assert.ok(Math.abs(hp0 - boss.hp - boss.maxHp * 0.08) < 1, 'ボスには最大体力の 8%');
  assert.equal(cast('f_corpse', { x: p.x + 2, y: p.y })?.code, 'noCorpse');
  const corpse = dummy(p.x + 2, p.y + 1);
  applyDamage(z, p, corpse, { amount: 99999, type: 'phys', pure: true });
  const near = dummy(p.x + 3, p.y + 1);
  assert.equal(cast('f_corpse', { x: p.x + 2, y: p.y }), undefined);
  assert.ok(corpse.removed, '亡骸を 1 つ使う');
  assert.ok(near.hp < near.maxHp);
  assert.deepEqual(log.errors, []);
});

// 固有の品の決まりを付けた指輪を装備する
function withRule(W, p, rule, slot = 'ring1') {
  p.char.equip[slot] = { uid: `r_${rule}`, base: 'ring', name: rule, rarity: 'unique', slot: 'ring', w: 1, h: 1, mods: [], affixes: [], rule };
  p.dirtyStats = true;
  W.step(1);
}

test('要と固有の品の決まり: 倒すと回復・姿を消す、あふれた回復は盾、仲間を癒すと自分も、倒れる一撃で巻き戻る', async () => {
  const { W, log, p, z, dummy, cast } = await arena();
  withRule(W, p, 'killHeal');
  withRule(W, p, 'stealthOnKill', 'ring2');
  p.hp = p.maxHp * 0.5;
  const hp0 = p.hp;
  const m = dummy(21.5, 20.5);
  applyDamage(z, p, m, { amount: 99999, type: 'phys', pure: true });
  assert.ok(p.hp > hp0, 'killHeal');
  assert.ok(hasStatus(p, 'stealth'), 'stealthOnKill');
  withRule(W, p, 'overhealShield');
  p.hp = p.maxHp;
  cast('f_firstaid');
  assert.ok(p.statuses.some((s) => s.id === 'overheal' && s.amount > 0 && s.amount <= p.maxHp * 0.2 + 1e-9), 'overhealShield');
  withRule(W, p, 'healEcho');
  const ally = await join(W, { ip: '7.7.7.7' });
  moveTo(W, ally.p, 'road', p.x + 1, p.y);
  ally.p.hp = 5; p.hp = 10;
  cast('f_ally_heal', { id: ally.p.id });
  assert.ok(ally.p.hp > 5, '味方を回復');
  assert.ok(p.hp > 10, 'healEcho で自分にも戻る');
  withRule(W, p, 'rewindOnLethal');
  p.hp = p.maxHp;
  W.step(70);
  const where = { x: p.x, y: p.y };
  applyDamage(z, m, p, { amount: 999999, type: 'phys', pure: true });
  assert.equal(p.dead, false, 'rewindOnLethal で倒れない');
  assert.ok(Math.hypot(p.x - where.x, p.y - where.y) < 1);
  applyDamage(z, m, p, { amount: 999999, type: 'phys', pure: true });
  assert.equal(p.dead, true, '60 秒に 1 回だけ');
  assert.deepEqual(log.errors, []);
});

test('要の決まり: 召喚は 1 体で 3 倍、構えを 2 つ、防ぐと次は会心、気絶が周りへ響く、会心で周りを気絶', async () => {
  const { W, log, p, z, dummy, cast } = await arena();
  withRule(W, p, 'oneGreatMinion');
  cast('f_raise', { x: p.x, y: p.y });
  cast('f_raise', { x: p.x, y: p.y });
  const mine = [...z.actors].filter((a) => a.owner === p.id && !a.dead && !a.clone);
  assert.equal(mine.length, 1, '1 体だけ');
  const plain = W.makeMonster(W.data.monsters.minion_skeleton, { x: 1, y: 1, team: 'p', owner: p.id, level: p.level, summoner: p, rankMult: 1 });
  assert.ok(mine[0].maxHp >= plain.maxHp * 2.9, '体力 3 倍');
  withRule(W, p, 'twoStances');
  const ar0 = p.stats.armor;
  W.data.skills.f_stance2 = { ...W.data.skills.f_stance, id: 'f_stance2', effects: [{ op: 'stance', group: 'form', mods: [{ key: 'armor', mode: 'flat', value: 40 }] }] };
  p.char.ranks.f_stance2 = 1;
  cast('f_stance'); cast('f_stance2');
  W.step(1);
  assert.equal(p.stats.armor, ar0 + 10 + 20, '同じ group の構えが 2 つ、効き目は半分');
  withRule(W, p, 'perfectParry');
  p.stats.blockChance = 100;
  const m = dummy(21.5, 20.5);
  m.ai.nextScan = 0;
  for (let i = 0; i < 40 && !p.nextCrit; i++) W.step(1);
  assert.ok(p.nextCrit, '防ぐと次は会心');
  withRule(W, p, 'stunEcho');
  const n1 = dummy(22.5, 21.0);
  const h1 = n1.hp;
  cast('f_strike', { id: m.id });
  assert.ok(n1.hp < h1, 'stunEcho で周りへ聖のダメージ');
  withRule(W, p, 'tollOnCrit');
  const n2 = dummy(22.0, 19.5);
  applyDamage(z, p, m, { amount: 1, type: 'phys', crit: true });
  assert.ok(n2.cc.stun, 'tollOnCrit で周りを気絶');
  assert.deepEqual(log.errors, []);
});
