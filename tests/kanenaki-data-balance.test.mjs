// 『鐘なき王国』のデータの検査（4）: 数値の見込み（遊べる範囲か）と、データの係が出す小さな関数
// 計算は kanenaki/shared/calc.mjs（設計書 §5 の式）をそのまま使い、回数と時間が 1 人で遊べる範囲かを確かめる（§15）。
// 実際に戦わせて確かめるのは tests/kanenaki-sim-solo.test.mjs。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAT_KEYS } from '../kanenaki/shared/schema.mjs';
import * as D from '../kanenaki/shared/data/index.mjs';
import { computeStats, damageRange, armorReduce, resistReduce, xpToNext, hitChance, castTime } from '../kanenaki/shared/calc.mjs';
import { pickTreeNodes } from '../kanenaki/sim/fixtures/solo.mjs';

const base = (id) => D.bases.find((b) => b.id === id);
const mid = (r) => (r.min + r.max) / 2;

// 職業・Lv・武器・防具から、calc.mjs の能力値を作る
function hero(cls, level, weaponId, armorIds = []) {
  const weapon = base(weaponId);
  const armor = armorIds.reduce((a, id) => a + (base(id).armor ?? 0), 0);
  const mods = [{ key: 'armor', mode: 'flat', value: armor }, ...(weapon.implicit ?? [])];
  return { st: computeStats({ level, classDef: D.classes[cls], weapon, mods }), weapon };
}
// 1 回当たったときのダメージ（相手の防御か耐性で減らした後）
function perHit(h, spec, tags, rank, m) {
  const d = mid(damageRange(spec, { rank, stats: h.st, weapon: h.weapon, tags }));
  return spec.type === 'phys' ? armorReduce(d, m.armor) : resistReduce(d, m.res?.[spec.type] ?? 0);
}
// 魔物の 1 回の攻撃で受けるダメージ
const taken = (h, m) => armorReduce(mid({ min: m.dmg[0], max: m.dmg[1] }), h.st.armor);
const ATTACK = { type: 'phys', base: [0, 0], weapon: 1, scale: 'str' };

test('Lv1 の冒険者は、最初の武器の普通の攻撃 3〜5 回で野良犬を倒せ、強打なら 1〜3 回', () => {
  const adv = D.classes.adventurer;
  const h = hero('adventurer', 1, adv.start.weapon, adv.start.armor);
  const dog = D.monsters.stray_dog;
  const hits = Math.ceil(dog.life / perHit(h, ATTACK, ['attack', 'melee'], 1, dog));
  assert.ok(hits >= 3 && hits <= 5, `普通の攻撃で ${hits} 回`);
  const bash = D.skills.adv_bash.effects[0].dmg;
  const h2 = Math.ceil(dog.life / perHit(h, bash, D.skills.adv_bash.tags, 1, dog));
  assert.ok(h2 >= 1 && h2 <= 3, `強打で ${h2} 回`);
  // 野良犬に 15 回以上かまれるまで倒れない
  assert.ok(h.st.life / taken(h, dog) >= 15, `野良犬 ${(h.st.life / taken(h, dog)).toFixed(1)} 回で倒れる`);
});

test('各地の魔物は、その Lv の職業のよく使うスキルで 4〜18 回で倒れ、こちらは 10 回以上耐えられる', () => {
  const cases = [
    ['warrior', 10, 'long_sword', ['leather_armor', 'iron_helm'], 'war_cleave', (s) => s.effects[0].onHit[0].dmg, 1, 'bog_wight'],
    ['priest', 12, 'iron_scepter', ['prayer_robe'], 'pri_holy_bolt', (s) => s.effects[0].onHit[0].dmg, 3, 'bog_wight'],
    ['necromancer', 12, 'bone_staff', ['prayer_robe'], 'nec_bone_stake', (s) => s.effects[0].onHit[0].dmg, 3, 'venom_toad'],
    ['swordsman', 12, 'long_sword', ['leather_armor', 'iron_helm'], 'swd_cross_slash', (s) => s.effects[0].onHit[0].dmg, 3, 'mist_witch'],
    ['rogue', 16, 'stiletto', ['chain_mail', 'iron_helm'], 'rog_backstab', (s) => s.effects[1].dmg, 6, 'bell_ghoul'],
    ['monk', 16, 'steel_knuckle', ['chain_mail'], 'mnk_palm_wave', (s) => s.effects[0].onHit[0].dmg, 6, 'bell_ghoul'],
    ['warrior', 20, 'war_axe', ['plate_armor', 'great_helm', 'tower_shield'], 'war_cleave', (s) => s.effects[0].onHit[0].dmg, 10, 'bronze_sentinel'],
  ];
  for (const [cls, L, w, arm, sid, spec, rank, mid] of cases) {
    const h = hero(cls, L, w, arm), m = D.monsters[mid], s = D.skills[sid];
    const n = m.life / perHit(h, spec(s), s.tags, rank, m);
    assert.ok(n >= 4 && n <= 18, `Lv${L} ${cls} の ${s.name} で ${m.name} を ${n.toFixed(1)} 回`);
    const k = h.st.life / taken(h, m);
    assert.ok(k >= 10, `Lv${L} ${cls} は ${m.name} に ${k.toFixed(1)} 回で倒れる`);
  }
});

/* ---------------- 1 人用の見込み（§15） ---------------- */
// Lv と職から、素直に取ったツリーと、その職のいちばん良い武器・防具（付加効果なし）で能力値を作る
function soloHero(cls, level, weaponId, armorIds = []) {
  const weapon = base(weaponId);
  const armor = armorIds.reduce((a, id) => a + (base(id).armor ?? 0), 0);
  const roots = [D.tree.starts.adventurer, D.tree.starts[cls]].filter(Boolean);
  const alloc = [...roots, ...pickTreeNodes(D.tree, roots, cls, level - 1)];
  const mods = [{ key: 'armor', mode: 'flat', value: armor }, ...(weapon.implicit ?? []), ...alloc.flatMap((id) => D.tree.nodes[id].mods ?? [])];
  return { st: computeStats({ level, classDef: D.classes[cls], weapon, mods }), weapon, cls };
}
const dmgOf = (list) => { for (const e of list) { if (e.dmg) return e.dmg; for (const k of ['onHit', 'onTick', 'effects', 'onArrive']) if (e[k]) { const d = dmgOf(e[k]); if (d) return d; } } return null; };
const skillHit = (h, sid, rank, m, n = 1) => perHit(h, dmgOf(D.skills[sid].effects), D.skills[sid].tags, rank, m) * n;
const basicHit = (h, m) => perHit(h, { type: 'phys', base: [0, 0], weapon: 1, scale: D.classes[h.cls].attackStat ?? 'str' }, ['attack', 'melee'], 1, m) * hitChance(h.st.accuracy, m.evasion);
// 鐘守りの亡者へ、主な手だけを休まず使い続けたときの 1 秒あたりのダメージ（Lv24、主なスキルは Lv で上げられる上限のランク）
const L = 24;
const boss = D.monsters.bell_warden;
const SOLO = {
  warrior: ['headsman_blade', ['plate_armor', 'great_helm'], (h) => skillHit(h, 'war_cleave', 15, boss) / castTime(D.skills.war_cleave, h.st)],
  priest: ['prayer_scepter', ['prayer_robe'], (h) => skillHit(h, 'pri_holy_bolt', 15, boss) / castTime(D.skills.pri_holy_bolt, h.st)],
  necromancer: ['bone_staff', ['prayer_robe'], (h) => {
    const sk = D.scaleMonster(D.monsters.minion_skeleton, L);
    const bone = armorReduce(mid({ min: sk.dmg[0], max: sk.dmg[1] }), boss.armor) * sk.aps * hitChance(sk.accuracy, boss.evasion);
    return skillHit(h, 'nec_bone_stake', 15, boss) / castTime(D.skills.nec_bone_stake, h.st) + 3 * bone; // 骨の兵 3 体
  }],
  swordsman: ['headsman_blade', ['chain_mail'], (h) => basicHit(h, boss) * h.st.aps + skillHit(h, 'swd_cross_slash', 15, boss) / 3 + skillHit(h, 'swd_iai', 5, boss) / 8],
  rogue: ['knight_sword', ['chain_mail'], (h) => basicHit(h, boss) * h.st.aps + skillHit(h, 'rog_fan_knives', 15, boss, 2) / 2 + skillHit(h, 'rog_backstab', 9, boss) / 5],
  monk: ['steel_knuckle', ['chain_mail'], (h) => basicHit(h, boss) * h.st.aps * 0.75 + skillHit(h, 'mnk_palm_wave', 13, boss) / 1.5],
};
// ボスの普通の攻撃の 1 秒あたり（闇なので防御では減らない。耐性 0 として）
const bossBasicDps = (h) => mid({ min: boss.dmg[0], max: boss.dmg[1] }) * boss.aps * hitChance(boss.accuracy, h.st.evasion);
// よけないで受けたときの大技の 1 秒あたり（弔いの鐘・響きの落下・鐘の鎖）
const bossSkillDps = ['m_warden_toll', 'm_warden_ring', 'm_warden_chain'].reduce((a, id) => a + mid({ min: dmgOf(D.skills[id].effects).base[0], max: dmgOf(D.skills[id].effects).base[1] }) / D.skills[id].cd, 0);

test('鐘守りの亡者（1 人用）: Lv24 の各職が、主な手を休まず使えば 30〜150 秒で倒せる。戦士・司祭・ネクロマンサーは、よけたり近づいたりで手が 4 割止まっても 60〜150 秒', () => {
  for (const [cls, [w, arm, dps]] of Object.entries(SOLO)) {
    const h = soloHero(cls, L, w, arm);
    const t100 = boss.life / dps(h);
    assert.ok(t100 >= 30 && t100 <= 150, `${cls}: 休まず使って ${t100.toFixed(0)} 秒`);
    if (['warrior', 'priest', 'necromancer'].includes(cls)) {
      const t60 = t100 / 0.6;
      assert.ok(t60 >= 60 && t60 <= 150, `${cls}: 手が 4 割止まると ${t60.toFixed(0)} 秒`);
    }
  }
});

test('鐘守りの亡者（1 人用）: 何もしないで殴り合う（よけない・薬を飲まない）と、倒すより先に倒れる', () => {
  for (const [cls, [w, arm, dps]] of Object.entries(SOLO)) {
    const h = soloHero(cls, L, w, arm);
    const tKill = boss.life / dps(h);
    const tDie = h.st.life / (bossBasicDps(h) + bossSkillDps);
    assert.ok(tDie < tKill * 0.8, `${cls}: 倒れるまで ${tDie.toFixed(0)} 秒、倒すまで ${tKill.toFixed(0)} 秒`);
  }
});

test('鐘守りの亡者（1 人用）: 大技をよけ、大きな回復薬 10 個を使えば、普通の攻撃を受け続けても 150 秒もつ', () => {
  const big = D.consumables.find((c) => c.id === 'potion_life_big');
  for (const [cls, [w, arm]] of Object.entries(SOLO)) {
    const h = soloHero(cls, L, w, arm);
    const pool = h.st.life * (1 + (10 * big.use.healPct) / 100) + h.st.lifeRegen * 150;
    assert.ok(pool >= bossBasicDps(h) * 150, `${cls}: もつ量 ${pool.toFixed(0)}、150 秒で受ける量 ${(bossBasicDps(h) * 150).toFixed(0)}`);
  }
  // 大技は前触れ（構えと地面の印）があり、よけられる
  for (const id of ['m_warden_toll', 'm_warden_ring']) {
    const e = D.skills[id].effects[0];
    assert.equal(e.op, 'area');
    assert.ok(D.skills[id].cast + e.delay >= 1.5, `${id}: 構えから当たるまで ${D.skills[id].cast + e.delay} 秒`);
  }
  // 呼ぶ魔物は 2 体まで、Lv は 16
  const call = D.skills.m_warden_call.effects[0];
  assert.ok(call.max <= 2 && call.level <= 16);
});

test('Lv1 の冒険者は、最初の持ち物のまま野良犬 3 匹の群れに、普通の攻撃だけで勝てる（薬なしでも体力が 2 割以上残る）。初めの回復薬は 5 個', () => {
  const adv = D.classes.adventurer;
  const h = hero('adventurer', 1, adv.start.weapon, adv.start.armor);
  const dog = D.monsters.stray_dog;
  const hits = Math.ceil(dog.life / perHit(h, ATTACK, ['attack', 'melee'], 1, dog));
  const tOne = hits / (h.st.aps * hitChance(h.st.accuracy, dog.evasion)); // 1 匹を倒す秒数
  const dogDps = taken(h, dog) * dog.aps * hitChance(dog.accuracy, h.st.evasion);
  const got = dogDps * tOne * (3 + 2 + 1); // 3 匹 → 2 匹 → 1 匹と減っていく間に受ける量
  assert.ok(got <= h.st.life * 0.8, `受ける量 ${got.toFixed(1)}、体力 ${h.st.life}`);
  assert.equal(adv.start.items.find((i) => i.id === 'potion_life').count, 5);
  // 街道の入口（町からの出入口）から 50 マスまでの群れは 4 匹まで
  const gate = D.maps.road.portals.find((p) => p.id === 'road_west');
  const near = D.maps.road.spawns.filter((s) => Math.hypot(s.x - gate.x, s.y - gate.y) < 50);
  assert.ok(near.length >= 2);
  for (const sp of near) assert.ok(sp.count <= 4, `${sp.monsters} が ${sp.count} 匹`);
});

test('精鋭は 1 人で無理のない強さ: 体力は普通の 2 倍まで、ダメージは 1.25 倍まで。硬い性質も控えめ', () => {
  assert.ok(D.tierScale.elite.life <= 2 && D.tierScale.elite.dmg <= 1.25);
  const stone = D.eliteMods.find((e) => e.id === 'stone');
  for (const m of stone.mods) assert.ok(m.value <= 50, `${m.key} ${m.value}`);
});

test('Lv1→2 は野良犬と屍鴉を 8〜20 体、Lv9→10 は霧沼の魔物を 20〜60 体ほど倒せば上がる', () => {
  const n1 = xpToNext(1) / ((D.monsters.stray_dog.xp + D.monsters.carrion_crow.xp) / 2);
  assert.ok(n1 >= 8 && n1 <= 20, `Lv1→2 で ${n1.toFixed(1)} 体`);
  const bog = ['bog_wight', 'venom_toad', 'leech_swarm'].map((id) => D.monsters[id].xp);
  const n9 = xpToNext(9) / (bog.reduce((a, b) => a + b) / bog.length);
  assert.ok(n9 >= 20 && n9 <= 60, `Lv9→10 で ${n9.toFixed(1)} 体`);
});

test('魔物の強さは地図の順（街道 < 霧沼 < 鐘楼 < ボス）に上がる', () => {
  const max = (ids) => Math.max(...ids.map((id) => D.monsters[id].level));
  const min = (ids) => Math.min(...ids.map((id) => D.monsters[id].level));
  const road = ['stray_dog', 'mud_imp', 'mud_imp_slinger', 'carrion_crow', 'bone_soldier'];
  const bog = ['bog_wight', 'venom_toad', 'mist_witch', 'leech_swarm'];
  const tower = ['bell_ghoul', 'cursed_acolyte', 'bronze_sentinel'];
  assert.ok(max(road) <= 8 && min(bog) >= 8 && max(bog) <= 16 && min(tower) >= 14);
  assert.ok(D.monsters.bell_warden.level >= 25 && D.monsters.bell_warden.life > 20 * D.monsters.bell_ghoul.life);
});

test('scaleMonster: 同じ Lv なら元のまま、Lv が上がると体力・ダメージ・経験値が増え、整数のまま', () => {
  const m = D.monsters.bone_soldier;
  const same = D.scaleMonster(m, m.level);
  assert.equal(same.life, m.life);
  assert.deepEqual(same.dmg, m.dmg);
  assert.equal(same.xp, m.xp);
  const up = D.scaleMonster(m, m.level + 10);
  assert.equal(up.level, m.level + 10);
  assert.ok(up.life > m.life * 3 && up.dmg[1] > m.dmg[1] * 2 && up.xp > m.xp * 3, '10 Lv 上で十分に強い');
  for (const v of [up.life, ...up.dmg, up.xp, up.armor]) assert.ok(Number.isInteger(v), `整数 ${v}`);
  assert.notEqual(up, m, '元の魔物を書き換えない');
  assert.equal(D.monsters.bone_soldier.level, m.level);
});

test('formatMod: 足す・％増し・かけ合わせを日本語で表す', () => {
  assert.equal(D.formatMod({ key: 'str', mode: 'flat', value: 5 }), '力 +5');
  assert.equal(D.formatMod({ key: 'life', mode: 'inc', value: 10 }), '最大体力 +10%');
  assert.equal(D.formatMod({ key: 'moveSpeed', mode: 'inc', value: -10 }), '移動の速さ −10%');
  assert.equal(D.formatMod({ key: 'dmg', mode: 'more', value: 20 }), '与えるダメージ さらに +20%');
  assert.equal(D.formatMod({ key: 'critChance', mode: 'flat', value: 3 }), '会心率 +3%');
  assert.equal(D.formatMod({ key: 'lifeRegen', mode: 'flat', value: 1.5 }), '体力の回復 +1.5/秒');
  for (const k of STAT_KEYS) assert.ok(D.statNames[k], `${k} の名前が無い`);
});
