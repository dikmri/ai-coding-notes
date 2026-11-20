// 共有の計算（能力値の合計、命中、軽減、耐性、会心、経験値、ダメージの見込み）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../kanenaki/shared/calc.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('修正の合計: (基本 + flat) × (1 + inc/100) × Π(1 + more/100)', () => {
  const mods = [
    { key: 'life', mode: 'flat', value: 20 },
    { key: 'life', mode: 'inc', value: 10 },
    { key: 'life', mode: 'inc', value: 15 },
    { key: 'life', mode: 'more', value: 20 },
    { key: 'life', mode: 'more', value: -10 },
    { key: 'mana', mode: 'flat', value: 999 },
  ];
  near(C.sumMods(100, mods, 'life'), 120 * 1.25 * 1.2 * 0.9);
  near(C.sumMods(50, [], 'life'), 50);
});

test('命中率: 命中 / (命中 + 回避 × 0.5) を 5%〜95% に収める', () => {
  near(C.hitChance(100, 100), 100 / 150);
  assert.equal(C.hitChance(1000, 0), 0.95);
  assert.equal(C.hitChance(1, 10000), 0.05);
  assert.equal(C.hitChance(0, 0), 0.95);
});

test('物理の軽減: ダメージ × (1 − 防御 / (防御 + 5 × ダメージ))', () => {
  near(C.armorReduce(100, 500), 100 * (1 - 500 / (500 + 500)));
  assert.equal(C.armorReduce(100, 0), 100);
  assert.equal(C.armorReduce(0, 100), 0);
  // 小さいダメージほど防御がよく効く
  assert.ok(C.armorReduce(10, 100) / 10 < C.armorReduce(1000, 100) / 1000);
});

test('耐性: 上限 75%。負の耐性はダメージを増やす', () => {
  assert.equal(C.resistReduce(100, 50), 50);
  assert.equal(C.resistReduce(100, 90), 25);
  assert.equal(C.resistReduce(100, -20), 120);
});

test('受けるダメージ: 物理は防御、属性は耐性', () => {
  const def = { armor: 500, resFire: 40 };
  near(C.mitigate(100, 'phys', def), 50);
  near(C.mitigate(100, 'fire', def), 60);
  near(C.mitigate(100, 'cold', def), 100);
});

test('経験値: 次のレベルまで round(100 × L^1.8)', () => {
  assert.equal(C.xpToNext(1), 100);
  assert.equal(C.xpToNext(2), Math.round(100 * 2 ** 1.8));
  assert.equal(C.xpToNext(10), Math.round(100 * 10 ** 1.8));
});

test('経験値を足すと、まとめて何レベルも上がり、余りが残る。最大のレベルで止まる', () => {
  const need1 = C.xpToNext(1), need2 = C.xpToNext(2);
  assert.deepEqual(C.addXp(1, 0, need1 + need2 + 5), { level: 3, xp: 5, gained: 2 });
  assert.deepEqual(C.addXp(1, 10, 20), { level: 1, xp: 30, gained: 0 });
  assert.deepEqual(C.addXp(99, 0, 1e12, 99), { level: 99, xp: 0, gained: 0 });
});

test('倒れると今のレベルの経験値の 5% を失う。0 より下がらず、レベルも下がらない', () => {
  assert.equal(C.deathPenalty(10, 1000), 1000 - Math.round(0.05 * C.xpToNext(10)));
  assert.equal(C.deathPenalty(10, 3), 0);
});

test('パーティーの経験値: 人数で少し増え、レベルの重みで分ける', () => {
  const s = C.partyXpShare(100, [{ id: 'a', level: 10 }, { id: 'b', level: 10 }]);
  assert.equal(s.a, 55); assert.equal(s.b, 55);
  const solo = C.partyXpShare(100, [{ id: 'a', level: 3 }]);
  assert.equal(solo.a, 100);
  const u = C.partyXpShare(100, [{ id: 'hi', level: 30 }, { id: 'lo', level: 10 }]);
  assert.ok(u.hi > u.lo);
});

test('魔物の経験値: 自分のレベルが 5 より上回ると減る（最低 10%）', () => {
  assert.equal(C.monsterXp(100, 10, 12), 100);
  assert.equal(C.monsterXp(100, 10, 17), Math.round(100 * 0.7));
  assert.equal(C.monsterXp(100, 1, 60), 10);
});

test('能力値: 職業の基本とレベルの伸び、修正、体力・魔力・命中などの派生', () => {
  const classDef = { base: { str: 10, dex: 8, int: 5, vit: 9 }, perLevel: { str: 2, dex: 1, int: 1, vit: 2, life: 8, mana: 3 }, life: 60, mana: 20 };
  const s = C.computeStats({ level: 3, classDef, mods: [{ key: 'str', mode: 'flat', value: 4 }, { key: 'life', mode: 'inc', value: 10 }] });
  assert.equal(s.str, 10 + 2 * 2 + 4);
  assert.equal(s.vit, 9 + 2 * 2);
  assert.equal(s.life, Math.round((60 + 8 * 2 + s.vit * 2 + s.str * 0.5) * 1.1));
  assert.equal(s.mana, Math.round(20 + 3 * 2 + s.int * 1.5));
  assert.equal(s.critChance, 5);
  assert.equal(s.critMulti, 150);
  assert.ok(s.accuracy > 0 && s.evasion > 0);
  assert.equal(s.moveSpeed, 4.5);
});

test('能力値: 耐性は 75% で止まり、会心率は 95% で止まる', () => {
  const s = C.computeStats({ level: 1, classDef: {}, mods: [{ key: 'resFire', mode: 'flat', value: 120 }, { key: 'critChance', mode: 'flat', value: 200 }] });
  assert.equal(s.resFire, 75);
  assert.equal(s.critChance, 95);
});

test('能力値: 要の決まり（会心が出ない、体力が 1 で魔力で耐える）', () => {
  const noCrit = C.computeStats({ level: 1, classDef: {}, mods: [], rules: ['noCrit'] });
  assert.equal(noCrit.critChance, 0);
  const mm = C.computeStats({ level: 5, classDef: { life: 100, mana: 10 }, mods: [], rules: ['lifeToMana'] });
  assert.equal(mm.life, 1);
  assert.ok(mm.mana > 100);
});

test('能力値: 固有の品の決まり（自然回復なしで吸収 2 倍、明かりで呪文が強くなる）', () => {
  const base = C.computeStats({ level: 5, classDef: {}, mods: [{ key: 'lifeLeech', mode: 'flat', value: 3 }] });
  const lo = C.computeStats({ level: 5, classDef: {}, mods: [{ key: 'lifeLeech', mode: 'flat', value: 3 }], rules: ['leechOnly'] });
  assert.ok(base.lifeRegen > 0);
  assert.equal(lo.lifeRegen, 0);
  assert.equal(lo.lifeLeech, 6);
  const lp = C.computeStats({ level: 1, classDef: {}, mods: [{ key: 'lightRadius', mode: 'flat', value: 2 }], rules: ['lightPower'] });
  assert.equal(lp.lightRadius, 8);
  assert.equal(lp.dmgSpell, 40, '明かり 8 マス × 5%');
  const r = C.damageRange({ type: 'fire', base: [10, 10] }, { stats: lp, tags: ['spell'] });
  assert.equal(r.min, 14);
  assert.ok(C.KNOWN_RULES.oneGreatMinion && C.KNOWN_RULES.tollOnCrit, '要と固有の決まりの説明がある');
});

test('ダメージの見込み: 基本 × ランクの伸び ＋ 武器 × 倍率、そのあと増加と more', () => {
  const stats = C.computeStats({ level: 1, classDef: { base: { str: 0, dex: 0, int: 20, vit: 0 } }, mods: [
    { key: 'dmgFire', mode: 'inc', value: 30 },
    { key: 'dmgSpell', mode: 'inc', value: 20 },
    { key: 'dmg', mode: 'more', value: 10 },
    { key: 'dmgCold', mode: 'inc', value: 500 },
  ] });
  const r = C.damageRange({ type: 'fire', base: [10, 20], perRank: 10, scale: 'int' }, { rank: 3, stats, tags: ['spell'] });
  const inc = 30 + 20 + 20 * 0.5;
  assert.equal(r.type, 'fire');
  assert.equal(r.min, Math.round(10 * 1.2 * (1 + inc / 100) * 1.1));
  assert.equal(r.max, Math.round(20 * 1.2 * (1 + inc / 100) * 1.1));
  const plain = C.computeStats({ level: 1, classDef: {}, mods: [] });
  const w = C.damageRange({ type: 'phys', base: [0, 0], weapon: 1.5, scale: 'str' }, { rank: 1, stats: plain, weapon: { dmg: [4, 8] }, tags: ['attack', 'melee'] });
  assert.equal(w.min, 6); assert.equal(w.max, 12);
  // flat の追加は、型か種類が合うものだけ
  const flat = C.computeStats({ level: 1, classDef: {}, mods: [{ key: 'dmgPhys', mode: 'flat', value: 3 }, { key: 'dmgFire', mode: 'flat', value: 100 }] });
  const f = C.damageRange({ type: 'phys', base: [1, 1] }, { rank: 1, stats: flat, tags: ['attack'] });
  assert.equal(f.min, 4);
});

test('会心込みの期待値と、範囲からの抽選', () => {
  near(C.expectedDamage({ min: 10, max: 30 }, 50, 200), 20 * 1.5);
  const rng = () => 0.999999;
  assert.equal(C.rollDamage({ min: 10, max: 30 }, rng), 30);
  assert.equal(C.rollDamage({ min: 10, max: 30 }, () => 0), 10);
});

test('スキルの消費と待ち時間: ランクで変わり、能力値で縮む', () => {
  const skill = { cost: { mana: 10, perRank: 2 }, cd: 8, cdPerRank: 0.5, cast: 0.5, tags: ['spell'] };
  const stats = C.computeStats({ level: 1, classDef: {}, mods: [{ key: 'manaCost', mode: 'inc', value: -50 }, { key: 'cooldownRecovery', mode: 'inc', value: 100 }, { key: 'castSpeed', mode: 'inc', value: 25 }] });
  assert.equal(C.skillCost(skill, 3, stats), 7);
  near(C.skillCooldown(skill, 3, stats), (8 - 1) / 2);
  near(C.castTime(skill, stats), 0.5 / 1.25);
});

test('状態異常の時間: ボスは半分', () => {
  assert.equal(C.ccDuration(2, { boss: true }), 1);
  assert.equal(C.ccDuration(2, {}), 2);
});
