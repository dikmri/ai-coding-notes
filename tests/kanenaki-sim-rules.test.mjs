// 育成（ツリーのつながり、スキルのランク）、持ち物の升目、宝の抽選のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, normEffects, normNeeds } from '../kanenaki/sim/data.mjs';
import * as raw from '../kanenaki/sim/fixtures/data.mjs';
import * as P from '../kanenaki/sim/progress.mjs';
import * as I from '../kanenaki/sim/inventory.mjs';
import * as L from '../kanenaki/sim/loot.mjs';
import { makeRng } from '../kanenaki/shared/mapgen.mjs';
import { INV_W, INV_H, RARITIES } from '../kanenaki/shared/schema.mjs';

const warns = [];
const D = normalize(raw, (e, a) => warns.push([e, a]));

test('データの整え: 見本のデータは警告なしで読め、知らない部品は飛ばして警告する', () => {
  assert.deepEqual(warns, []);
  const w = [];
  const eff = normEffects([{ op: 'hit', dmg: { type: 'fire', base: [1, 2] } }, { op: 'teleportEverything' }, { heal: { pct: 10, target: 'self' } }], (e, a) => w.push(e), 'x');
  assert.deepEqual(eff.map((e) => e.op), ['hit', 'heal']);
  assert.equal(eff[1].pct, 10);
  assert.deepEqual(w, ['data.unknownOp']);
  assert.deepEqual(normNeeds({ kill: { bone_soldier: 10 }, level: 5 }), [{ kind: 'kill', id: 'bone_soldier', count: 10 }, { kind: 'level', id: null, count: 5 }]);
  assert.deepEqual(normNeeds([{ type: 'collect', item: 'herb', count: 3 }]), [{ kind: 'collect', id: 'herb', count: 3 }]);
});

test('ツリー: 取ったマスとつながったマスだけ取れる。出発点は最初から根', () => {
  const roots = P.treeRoots(D.tree, 'adventurer');
  assert.deepEqual([...roots], ['st']);
  const alloc = new Set(roots);
  assert.equal(P.canAlloc(D.tree, alloc, 'a1').ok, true);
  assert.equal(P.canAlloc(D.tree, alloc, 'a2').code, 'notConnected');
  assert.equal(P.canAlloc(D.tree, alloc, 'nope').code, 'noNode');
  assert.equal(P.canAlloc(D.tree, alloc, 'st').code, 'already');
  alloc.add('a1');
  assert.equal(P.canAlloc(D.tree, alloc, 'a2').ok, true);
});

test('ツリー: 取り消しは、残りが根からつながったままのときだけ', () => {
  const roots = P.treeRoots(D.tree, 'adventurer');
  const alloc = new Set(['st', 'a1', 'a2', 'c1']);
  assert.equal(P.canUnalloc(D.tree, alloc, 'a1', roots).code, 'wouldDisconnect');
  assert.equal(P.canUnalloc(D.tree, alloc, 'a2', roots).ok, true);
  assert.equal(P.canUnalloc(D.tree, alloc, 'st', roots).code, 'root');
  assert.equal(P.canUnalloc(D.tree, alloc, 'b1', roots).code, 'notAllocated');
});

test('ツリー: 転職すると職の門も根になり、門からも伸ばせる', () => {
  const roots = P.treeRoots(D.tree, 'swordsman');
  assert.deepEqual([...roots].sort(), ['gate_sw', 'st']);
  const alloc = new Set(roots);
  assert.equal(P.canAlloc(D.tree, alloc, 'sw1').ok, true);
  assert.equal(P.canAlloc(D.tree, alloc, 'b1').ok, true);
});

test('ツリーの修正と要の決まりを集める', () => {
  const { mods, rules } = P.treeMods(D.tree, new Set(['st', 'c1', 'k1']));
  assert.deepEqual(rules, ['noCrit']);
  assert.ok(mods.some((m) => m.key === 'dex' && m.value === 5));
});

test('スキルのランク: 職業・レベル・点・上限を確かめる', () => {
  const s = D.skills.f_slash; // 剣士、Lv10 から
  assert.equal(P.canRankUp(s, 'adventurer', 20, 0, 1).code, 'wrongClass');
  assert.equal(P.canRankUp(s, 'swordsman', 9, 0, 1).code, 'level');
  assert.equal(P.canRankUp(s, 'swordsman', 10, 0, 1).ok, true);
  assert.equal(P.canRankUp(s, 'swordsman', 10, 1, 1).code, 'level', 'ランク 2 は Lv11 から');
  assert.equal(P.canRankUp(s, 'swordsman', 30, 0, 0).code, 'noPoints');
  assert.equal(P.canRankUp({ ...s, maxRank: 2 }, 'swordsman', 30, 2, 5).code, 'maxRank');
  assert.equal(P.canRankUp(D.skills.f_strike, 'swordsman', 1, 0, 1).ok, true, '冒険者のスキルは転職後も使える');
});

test('持ち物の升目: w×h が重ならず、はみ出さない場所を探す', () => {
  const items = [{ uid: 'a', w: 2, h: 3, x: 0, y: 0 }];
  assert.equal(I.fits(items, INV_W, INV_H, 1, 1, 1, 2), false);
  assert.equal(I.fits(items, INV_W, INV_H, 1, 1, 2, 0), true);
  assert.equal(I.fits(items, INV_W, INV_H, 2, 2, 9, 0), false, '右へはみ出す');
  assert.equal(I.fits(items, INV_W, INV_H, 2, 3, 0, 0, 'a'), true, '自分自身は数えない');
  assert.deepEqual(I.findSpace(items, INV_W, INV_H, 2, 2), { x: 2, y: 0 });
  // 升目をいっぱいにすると、もう入らない
  const full = [];
  for (let y = 0; y < INV_H; y++) for (let x = 0; x < INV_W; x++) full.push({ uid: `${x},${y}`, w: 1, h: 1, x, y });
  assert.equal(I.findSpace(full, INV_W, INV_H, 1, 1), null);
});

test('持ち物: 薬は重ねる。重ねる上限を超えたら別の升へ', () => {
  const items = [];
  const mk = (n) => ({ uid: `p${n}`, base: 'potion_life', consumable: true, w: 1, h: 1, qty: n });
  assert.equal(I.addItem(items, INV_W, INV_H, mk(8), D).ok, true);
  assert.equal(I.addItem(items, INV_W, INV_H, mk(1), D).ok, true);
  assert.equal(items.length, 1);
  assert.equal(items[0].qty, 9);
  I.addItem(items, INV_W, INV_H, mk(3), D);
  assert.deepEqual(items.map((i) => i.qty), [10, 2]);
});

test('装備の部位: 指輪は空いている方、両手が埋まっていれば 1 つめと入れ替え', () => {
  assert.equal(I.slotFor({ slot: 'ring' }, {}), 'ring1');
  assert.equal(I.slotFor({ slot: 'ring' }, { ring1: {} }), 'ring2');
  assert.equal(I.slotFor({ slot: 'ring' }, { ring1: {}, ring2: {} }), 'ring1');
  assert.equal(I.slotFor({ slot: 'head' }, {}), 'head');
  assert.equal(I.slotFor({ slot: 'potion' }, {}), null);
});

test('宝: 同じ種なら同じ品。付加の数は珍しさの範囲、同じ付加は 2 度付かない、値は範囲の中', () => {
  for (const rarity of ['normal', 'magic', 'rare']) {
    for (let k = 0; k < 40; k++) {
      const a = L.makeItem(D, makeRng(`it${k}`), 'short_sword', rarity, 10, 'u1');
      const b = L.makeItem(D, makeRng(`it${k}`), 'short_sword', rarity, 10, 'u1');
      assert.deepEqual(a, b);
      const [lo, hi] = RARITIES[rarity].affixes;
      const eligible = D.affixes.filter((x) => x.slots.includes('weapon') || x.slots.includes('any')).length;
      assert.ok(a.affixes.length >= Math.min(lo, eligible) && a.affixes.length <= hi, `${rarity} の付加の数 ${a.affixes.length}`);
      assert.equal(new Set(a.affixes).size, a.affixes.length);
      for (const id of a.affixes) {
        const def = D.affixes.find((x) => x.id === id);
        assert.ok(def.slots.includes('weapon') || def.slots.includes('any'), '部位に合う付加だけ');
      }
      for (const m of a.mods.filter((m) => m.src !== 'implicit')) {
        const def = D.affixes.find((x) => x.id === m.src);
        const range = def.mods.find((x) => x.key === m.key).value;
        assert.ok(m.value >= range[0] && m.value <= range[1]);
      }
    }
  }
});

test('宝: 固有の品は決まった効果。基本の品の大きさと能力を引き継ぐ', () => {
  const u = L.makeUnique(D, D.uniques[0], 'u2');
  assert.equal(u.rarity, 'unique');
  assert.equal(u.name, '鐘割り');
  assert.deepEqual([u.w, u.h], [1, 3]);
  assert.deepEqual(u.dmg, [3, 6]);
});

test('宝: 珍しさの抽選は見つけやすさで珍しい側へ寄る', () => {
  const count = (itemFind, tier) => {
    const rng = makeRng(99);
    const c = { normal: 0, magic: 0, rare: 0, unique: 0 };
    for (let i = 0; i < 20000; i++) c[L.rollRarity(rng, { itemFind, tier })]++;
    return c;
  };
  const base = count(0, 'normal'), lucky = count(200, 'normal'), boss = count(0, 'boss');
  assert.ok(base.normal > base.magic && base.magic > base.rare && base.rare > base.unique);
  assert.ok(lucky.rare > base.rare * 1.8);
  assert.ok(boss.rare > base.rare * 2);
});

test('宝: 落とす物は魔物の強さで増える。お金も落ちる', () => {
  const avg = (tier) => {
    const rng = makeRng(`drops-${tier}`);
    let n = 0;
    for (let i = 0; i < 400; i++) n += L.rollDrops(D, rng, { level: 5, tier, itemFind: 0, goldFind: 0 }).filter((d) => d.kind === 'item').length;
    return n / 400;
  };
  const a = avg('normal'), b = avg('elite'), c = avg('boss');
  assert.ok(a < b && b < c, `${a} < ${b} < ${c}`);
  const drops = L.rollDrops(D, makeRng(1), { level: 5, tier: 'boss', itemFind: 0, goldFind: 0 });
  assert.ok(drops.some((d) => d.kind === 'gold' && d.amount > 0));
});

test('宝: データの落ち方の表（lootTiers）があれば、その数・お金・必ず落ちる物に従う', () => {
  const D2 = { ...D, lootTiers: {
    normal: { dropChance: 0, count: [1, 1], gold: { chance: 0, perLevel: [1, 3] }, rarity: { magic: 0.2, rare: 0.05, unique: 0 }, potion: 0 },
    boss: { dropChance: 1, count: [4, 6], gold: { chance: 1, perLevel: [10, 20] }, rarity: { magic: 0.4, rare: 0.4, unique: 0.1 }, potion: 1, always: ['herb'] },
  } };
  for (let k = 0; k < 50; k++) {
    const rng = makeRng(`tier${k}`);
    const boss = L.rollDrops(D2, rng, { level: 10, tier: 'boss', itemFind: 0, goldFind: 0 });
    const equip = boss.filter((d) => d.kind === 'item' && !d.item.consumable);
    assert.ok(equip.length >= 4 && equip.length <= 6, `ボスの装備は 4〜6 個（${equip.length}）`);
    assert.ok(boss.some((d) => d.kind === 'item' && d.item.base === 'herb'), '必ず落ちる物');
    assert.ok(boss.some((d) => d.kind === 'item' && d.item.consumable && d.item.base !== 'herb'), 'potion: 1 なら薬も落ちる');
    const g = boss.find((d) => d.kind === 'gold');
    assert.ok(g && g.amount >= 100 && g.amount <= 200, `お金は Lv × 10〜20（${g?.amount}）`);
    assert.deepEqual(L.rollDrops(D2, rng, { level: 10, tier: 'normal' }), [], 'dropChance 0 なら何も落ちない');
  }
});

test('売り値と買い値: 珍しいほど高く、買い値は売り値より高い', () => {
  const rng = makeRng(5);
  const n = L.makeItem(D, rng, 'tunic', 'normal', 5, 'a');
  const r = L.makeItem(D, rng, 'tunic', 'rare', 5, 'b');
  assert.ok(L.sellPrice(r, D) > L.sellPrice(n, D));
  assert.ok(L.buyPrice(n, D) > L.sellPrice(n, D));
});
