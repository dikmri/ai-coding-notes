// 『鐘なき王国』のデータの検査（1）: id の重複、参照先、効果の部品、能力値のキー、数
// 設計書: D:\soft\myWiki\articles\kanenaki-mmo.md の §4〜§9、§13
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPS, STAT_KEYS, MOD_MODES, DAMAGE_TYPES, PRIMARY, STAGE1_CLASSES, SLOTS, INV_W, INV_H,
} from '../kanenaki/shared/schema.mjs';
import * as D from '../kanenaki/shared/data/index.mjs';

const CC = ['stun', 'root', 'slow', 'silence', 'fear', 'sleep'];
const TARGETS = ['enemy', 'ground', 'self', 'ally', 'dir'];
const NESTED = ['onHit', 'onTick', 'passHit', 'onArrive', 'onLand', 'onTrigger', 'effects'];
const ITEM_SLOTS = ['head', 'body', 'hands', 'feet', 'belt', 'neck', 'ring', 'weapon', 'offhand'];
const WEAPON_KINDS = ['sword', 'greatsword', 'dagger', 'axe', 'staff', 'scepter', 'knuckle'];
const OFFHAND_KINDS = ['shield', 'tome'];
const MONSTER_IDS = [
  'stray_dog', 'bone_soldier', 'mud_imp', 'mud_imp_slinger', 'carrion_crow', 'bog_wight', 'venom_toad',
  'mist_witch', 'leech_swarm', 'bell_ghoul', 'cursed_acolyte', 'bronze_sentinel', 'bell_warden',
  'minion_skeleton', 'minion_skeleton_archer',
];
const NPC_IDS = [
  'npc_innkeeper', 'npc_smith', 'npc_apothecary', 'npc_bellkeeper', 'npc_warp',
  'npc_master_swordsman', 'npc_master_warrior', 'npc_master_rogue', 'npc_master_priest',
  'npc_master_necromancer', 'npc_master_monk',
];

// 効果の配列を入れ子まで全部たどる
function walkEffects(effects, fn, path = '') {
  assert.ok(Array.isArray(effects), `${path}: 効果は配列`);
  effects.forEach((e, i) => {
    const p = `${path}[${i}]`;
    fn(e, p);
    for (const k of NESTED) if (e[k] !== undefined) walkEffects(e[k], fn, `${p}.${k}`);
  });
}

// 能力値の修正 { key, mode, value } を確かめる。range=true なら value は [min,max]
function checkMods(mods, where, { range = false } = {}) {
  assert.ok(Array.isArray(mods), `${where}: mods は配列`);
  for (const m of mods) {
    assert.ok(STAT_KEYS.includes(m.key), `${where}: 能力値のキー ${m.key} が STAT_KEYS に無い`);
    assert.ok(MOD_MODES.includes(m.mode), `${where}: mode ${m.mode} が MOD_MODES に無い`);
    if (range) {
      assert.ok(Array.isArray(m.value) && m.value.length === 2, `${where}: value は [min,max]`);
      assert.ok(m.value[0] <= m.value[1], `${where}: value の min ≤ max`);
    } else {
      assert.equal(typeof m.value, 'number', `${where}: value は数`);
    }
  }
}

const playerSkills = () => Object.values(D.skills).filter((s) => s.cls !== 'monster');

test('index は設計書 §13 の名前を全部 export する', () => {
  for (const name of ['classes', 'skills', 'tree', 'bases', 'consumables', 'affixes', 'uniques',
    'monsters', 'maps', 'npcs', 'quests', 'phrases', 'stamps', 'nameParts']) {
    assert.ok(D[name] !== undefined, `${name} が無い`);
  }
});

test('職業: 段階 1 の 7 職。能力値のキー、覚えるスキル、ツリーの出発点、絵の id が正しい', () => {
  assert.deepEqual(Object.keys(D.classes).sort(), [...STAGE1_CLASSES].sort());
  for (const [cls, c] of Object.entries(D.classes)) {
    assert.ok(c.name && c.desc, `${cls}: name と desc`);
    assert.deepEqual(Object.keys(c.base).sort(), [...PRIMARY].sort(), `${cls}: base`);
    assert.deepEqual(Object.keys(c.perLevel).sort(), [...PRIMARY, 'life', 'mana'].sort(), `${cls}: perLevel`);
    assert.ok(c.life > 0 && c.mana > 0, `${cls}: life と mana`);
    assert.equal(c.art, cls);
    const want = cls === 'adventurer' ? [6, 6] : [10, 11];
    assert.ok(c.skills.length >= want[0] && c.skills.length <= want[1], `${cls}: スキルの数 ${c.skills.length}`);
    for (const id of c.skills) {
      assert.ok(D.skills[id], `${cls}: スキル ${id} が無い`);
      assert.equal(D.skills[id].cls, cls, `${id} の cls`);
    }
    assert.ok(D.tree.nodes[c.treeStart], `${cls}: treeStart ${c.treeStart} がツリーに無い`);
    assert.equal(D.tree.starts[cls], c.treeStart, `${cls}: tree.starts と treeStart が同じ`);
  }
});

test('スキル: 数は 66〜76、id が重複せず、どれか 1 つの職業に属し、形が約束どおり', () => {
  const list = playerSkills();
  assert.ok(list.length >= 66 && list.length <= 76, `スキルの数 ${list.length}`);
  const owned = Object.values(D.classes).flatMap((c) => c.skills);
  assert.equal(new Set(owned).size, owned.length, '同じスキルが 2 つの職業に入っている');
  for (const s of list) assert.ok(owned.includes(s.id), `${s.id} がどの職業にも入っていない`);
  for (const [id, s] of Object.entries(D.skills)) {
    assert.equal(s.id, id);
    assert.ok(s.name && s.desc, `${id}: name と desc`);
    assert.ok(TARGETS.includes(s.target), `${id}: target ${s.target}`);
    assert.ok(Number.isInteger(s.maxRank) && s.maxRank >= 1 && s.maxRank <= 20, `${id}: maxRank`);
    assert.equal(typeof s.cost?.mana, 'number', `${id}: cost.mana`);
    for (const k of ['cd', 'cast', 'range', 'unlock']) assert.equal(typeof s[k], 'number', `${id}: ${k}`);
    assert.ok(Array.isArray(s.tags), `${id}: tags`);
    assert.ok(Array.isArray(s.effects) && s.effects.length > 0, `${id}: effects`);
    assert.match(s.vfx, /^[a-z][a-z0-9_]{1,15}$/, `${id}: vfx は短い英小文字の id`);
    assert.equal(typeof s.icon, 'string', `${id}: icon`);
    if (s.cls === 'adventurer') assert.ok(s.unlock >= 1 && s.unlock < 10, `${id}: 冒険者は Lv1〜9 で覚える`);
    else if (s.cls !== 'monster') assert.ok(s.unlock >= 10, `${id}: 転職後の職は Lv10 から`);
  }
});

test('スキル: 6 職それぞれに「攻め」「守り・支援」「動き」「切り札（待ち時間 40 秒以上）」がある', () => {
  for (const cls of STAGE1_CLASSES.filter((c) => c !== 'adventurer')) {
    const list = D.classes[cls].skills.map((id) => D.skills[id]);
    const has = (t) => list.some((s) => s.tags.includes(t));
    assert.ok(has('offense'), `${cls}: 攻め`);
    assert.ok(has('defense') || has('support'), `${cls}: 守り・支援`);
    assert.ok(has('mobility'), `${cls}: 動き`);
    const ult = list.filter((s) => s.tags.includes('ultimate'));
    assert.ok(ult.length >= 1, `${cls}: 切り札`);
    for (const s of ult) assert.ok(s.cd >= 40, `${s.id}: 切り札の待ち時間 ${s.cd}`);
  }
});

test('スキル: 効果の部品は全部 OPS にあり、ダメージの種類・能力値・状態異常・召喚が約束どおり', () => {
  for (const s of Object.values(D.skills)) {
    walkEffects(s.effects, (e, p) => {
      const where = `${s.id}${p}`;
      assert.ok(Object.hasOwn(OPS, e.op), `${where}: 部品 ${e.op} が OPS に無い`);
      if (e.dmg) {
        assert.ok(DAMAGE_TYPES.includes(e.dmg.type), `${where}: ダメージの種類 ${e.dmg.type}`);
        assert.ok(Array.isArray(e.dmg.base) && e.dmg.base[0] <= e.dmg.base[1], `${where}: dmg.base`);
        if (e.dmg.scale) assert.ok(PRIMARY.includes(e.dmg.scale), `${where}: dmg.scale`);
      }
      if (e.op === 'dot') assert.ok(DAMAGE_TYPES.includes(e.type), `${where}: dot の種類`);
      if (e.op === 'debuff' && e.cc) assert.ok(CC.includes(e.cc), `${where}: cc ${e.cc}`);
      if (e.mods) checkMods(e.mods, where);
      if (e.op === 'summon') {
        const u = D.monsters[e.unit];
        assert.ok(u, `${where}: 召喚する ${e.unit} が魔物に無い`);
        if (s.cls !== 'monster') assert.equal(u.minion, true, `${where}: 味方の召喚は minion: true の魔物`);
      }
    });
  }
});

test('魔物: 設計書の 15 種。絵の id は魔物の id、スキルがある、召喚の味方 2 種、ボス 1 体', () => {
  assert.deepEqual(Object.keys(D.monsters).sort(), [...MONSTER_IDS].sort());
  const AI = ['melee', 'ranged', 'caster', 'summoner', 'swarm', 'boss'];
  for (const [id, m] of Object.entries(D.monsters)) {
    assert.equal(m.id, id);
    assert.equal(m.art, id);
    assert.ok(m.name && m.level >= 1 && m.life > 0, `${id}: name, level, life`);
    assert.ok(m.dmg[0] <= m.dmg[1], `${id}: dmg`);
    assert.ok(DAMAGE_TYPES.includes(m.dmgType), `${id}: dmgType`);
    assert.ok(AI.includes(m.ai), `${id}: ai`);
    // サーバーの actor.mjs が読む項目: aps（回/秒）、armor・evasion・accuracy、res のキーはダメージの種類
    assert.ok(m.aps > 0 && m.aps <= 3, `${id}: aps`);
    for (const k of ['armor', 'evasion', 'accuracy', 'speed', 'range', 'aggro']) assert.equal(typeof m[k], 'number', `${id}: ${k}`);
    for (const k of Object.keys(m.res)) assert.ok(DAMAGE_TYPES.includes(k) && k !== 'phys', `${id}: res のキー ${k}`);
    for (const sid of m.skills) {
      assert.ok(D.skills[sid], `${id}: スキル ${sid} が無い`);
      assert.equal(D.skills[sid].cls, 'monster', `${sid} は魔物のスキル`);
    }
  }
  assert.deepEqual(Object.values(D.monsters).filter((m) => m.minion).map((m) => m.id).sort(),
    ['minion_skeleton', 'minion_skeleton_archer']);
  assert.deepEqual(Object.values(D.monsters).filter((m) => m.boss).map((m) => m.id), ['bell_warden']);
  // 精鋭の性質の能力値とスキル
  for (const e of D.eliteMods) {
    checkMods(e.mods, `精鋭 ${e.id}`);
    for (const sid of e.skills ?? []) assert.equal(D.skills[sid]?.cls, 'monster', `精鋭 ${e.id}: スキル ${sid}`);
  }
});

test('宝: 基本の品 36〜44。部位と種類、武器のダメージ、升目の大きさが正しい', () => {
  const ids = [...D.bases, ...D.consumables].map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, '品の id が重複している');
  assert.ok(D.bases.length >= 36 && D.bases.length <= 44, `基本の品の数 ${D.bases.length}`);
  for (const b of D.bases) {
    assert.ok(ITEM_SLOTS.includes(b.slot), `${b.id}: slot ${b.slot}`);
    assert.ok(b.w >= 1 && b.h >= 1 && b.w <= INV_W && b.h <= INV_H, `${b.id}: 大きさ`);
    if (b.slot === 'weapon') {
      assert.ok(WEAPON_KINDS.includes(b.kind), `${b.id}: 武器の種類 ${b.kind}`);
      assert.ok(b.dmg[0] <= b.dmg[1] && b.speed > 0, `${b.id}: dmg と speed`);
    }
    if (b.slot === 'offhand') assert.ok(OFFHAND_KINDS.includes(b.kind), `${b.id}: 副手の種類`);
    if (b.implicit) checkMods(b.implicit, b.id);
  }
  for (const k of [...WEAPON_KINDS, ...OFFHAND_KINDS]) assert.ok(D.bases.some((b) => b.kind === k), `種類 ${k} の品が無い`);
  for (const s of ITEM_SLOTS) assert.ok(D.bases.some((b) => b.slot === s), `部位 ${s} の品が無い`);
  // ring は ring1・ring2 のどちらにも入る
  assert.ok(SLOTS.includes('ring1') && SLOTS.includes('ring2'));
});

test('宝: 消耗品（回復薬・魔力の薬・帰還の巻物・忘却の聖水）と依頼の品がある', () => {
  const ids = D.consumables.map((c) => c.id);
  for (const id of ['potion_life', 'potion_mana', 'scroll_return', 'holy_water_forget', 'bog_herb', 'bell_shard']) {
    assert.ok(ids.includes(id), `${id} が無い`);
  }
  // use はサーバーの data.mjs が読む形 { healPct | manaPct | portal | respec }。依頼の品は use なし
  const USE_KEYS = ['heal', 'healPct', 'mana', 'manaPct', 'over', 'portal', 'respec'];
  for (const c of D.consumables) {
    assert.ok(c.name && c.w >= 1 && c.h >= 1, `${c.id}: name と大きさ`);
    if (c.kind === 'quest') { assert.equal(c.use, undefined, `${c.id}: 依頼の品は使えない`); continue; }
    assert.ok(c.use && Object.keys(c.use).length > 0, `${c.id}: use`);
    for (const k of Object.keys(c.use)) assert.ok(USE_KEYS.includes(k), `${c.id}: use の ${k}`);
  }
  assert.equal(D.consumables.find((c) => c.id === 'potion_mana').use.manaPct > 0, true);
  assert.equal(D.consumables.find((c) => c.id === 'scroll_return').use.portal, true);
  assert.ok(D.consumables.find((c) => c.id === 'holy_water_forget').use.respec >= 1);
  // 依頼の品の落ち方、冒険者の最初の持ち物、固有の品の落とし主
  const itemIds = new Set([...D.bases, ...D.consumables].map((b) => b.id));
  for (const [it, q] of Object.entries(D.questDrops)) {
    assert.ok(itemIds.has(it), `questDrops: 品 ${it}`);
    for (const mId of q.from) assert.ok(D.monsters[mId], `questDrops ${it}: 魔物 ${mId}`);
  }
  const st = D.classes.adventurer.start;
  for (const id of [st.weapon, ...st.armor, ...st.items.map((i) => i.id)]) assert.ok(itemIds.has(id), `最初の持ち物 ${id}`);
  for (const u of D.uniques) for (const mId of u.dropFrom ?? []) assert.ok(D.monsters[mId], `${u.id}: 落とす魔物 ${mId}`);
  for (const it of D.lootTiers.boss.always ?? []) assert.ok(itemIds.has(it), `ボスが必ず落とす ${it}`);
});

test('付加効果: 55〜65 種。id が重複せず、前と後ろ、部位、能力値のキー、値の幅が正しい', () => {
  assert.ok(D.affixes.length >= 55 && D.affixes.length <= 65, `付加の数 ${D.affixes.length}`);
  const ids = D.affixes.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, '付加の id が重複している');
  for (const a of D.affixes) {
    assert.ok(['prefix', 'suffix'].includes(a.kind), `${a.id}: kind`);
    assert.ok(a.name && a.level >= 1 && a.weight > 0, `${a.id}: name, level, weight`);
    assert.ok(a.slots.length > 0 && a.slots.every((s) => ITEM_SLOTS.includes(s)), `${a.id}: slots`);
    checkMods(a.mods, a.id, { range: true });
  }
  assert.ok(D.affixes.some((a) => a.kind === 'prefix') && D.affixes.some((a) => a.kind === 'suffix'));
});

test('固有: 9〜12 種。基本の品があり、どれも遊び方を変える rule を持つ', () => {
  assert.ok(D.uniques.length >= 9 && D.uniques.length <= 12, `固有の数 ${D.uniques.length}`);
  const ids = D.uniques.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const u of D.uniques) {
    assert.ok(D.bases.some((b) => b.id === u.base), `${u.id}: 基本の品 ${u.base} が無い`);
    assert.ok(u.name && u.flavor, `${u.id}: name と flavor`);
    checkMods(u.mods, u.id);
    assert.match(u.rule ?? '', /^[a-z][A-Za-z0-9]+$/, `${u.id}: rule は camelCase の短い id`);
    assert.ok(u.ruleDesc, `${u.id}: ruleDesc`);
  }
});

test('NPC: 設計書の 11 人。役目、店の品、師範は 6 職に 1 人ずつ', () => {
  assert.deepEqual(Object.keys(D.npcs).sort(), [...NPC_IDS].sort());
  const ROLES = ['inn', 'smith', 'apothecary', 'master', 'story', 'warp'];
  const itemIds = new Set([...D.bases, ...D.consumables].map((b) => b.id));
  for (const [id, n] of Object.entries(D.npcs)) {
    assert.equal(n.id, id);
    assert.equal(n.art, id);
    assert.ok(ROLES.includes(n.role), `${id}: role`);
    assert.ok(n.lines.length >= 2, `${id}: 台詞`);
    for (const it of n.shop ?? []) assert.ok(itemIds.has(it), `${id}: 店の品 ${it} が無い`);
  }
  const masters = Object.values(D.npcs).filter((n) => n.role === 'master').map((n) => n.cls).sort();
  assert.deepEqual(masters, STAGE1_CLASSES.filter((c) => c !== 'adventurer').sort());
  for (const w of D.npcs.npc_warp.warps) assert.ok(D.maps[w.map], `ワープ先 ${w.map}`);
});

test('依頼: 5〜6 件。依頼主・倒す魔物・集める品・前の依頼がある', () => {
  const qs = Object.values(D.quests);
  assert.ok(qs.length >= 5 && qs.length <= 6, `依頼の数 ${qs.length}`);
  const itemIds = new Set([...D.bases, ...D.consumables].map((b) => b.id));
  // 形はサーバーの world.mjs・commands.mjs の読み方: giver は 1 人、minLevel、requires は依頼の id、褒美の品は { id, qty }
  for (const q of qs) {
    assert.ok(q.name && q.desc, `${q.id}: name と desc`);
    assert.equal(typeof q.giver, 'string', `${q.id}: 依頼主は 1 人`);
    assert.ok(D.npcs[q.giver], `${q.id}: 依頼主 ${q.giver}`);
    assert.ok(Number.isInteger(q.minLevel) && q.minLevel >= 1, `${q.id}: minLevel`);
    for (const m of Object.keys(q.needs.kill ?? {})) assert.ok(D.monsters[m], `${q.id}: 魔物 ${m}`);
    for (const it of Object.keys(q.needs.items ?? {})) assert.ok(itemIds.has(it), `${q.id}: 品 ${it}`);
    if (q.requires !== undefined) {
      assert.ok(D.quests[q.requires], `${q.id}: 前の依頼 ${q.requires}`);
      assert.ok(D.quests[q.requires].minLevel <= q.minLevel, `${q.id}: 前の依頼のほうが Lv が低い`);
    }
    for (const it of q.reward.items ?? []) assert.ok(itemIds.has(it.id) && it.qty >= 1, `${q.id}: 褒美の品 ${it.id}`);
  }
  // 転職の試験は 1 件で、依頼主は師範
  const trials = qs.filter((q) => q.reward.classChange);
  assert.equal(trials.length, 1);
  assert.equal(D.npcs[trials[0].giver].role, 'master');
  // NPC が持つ依頼の id があり、依頼主と NPC の一覧が食い違わない
  for (const n of Object.values(D.npcs)) for (const q of n.quests ?? []) assert.equal(D.quests[q]?.giver, n.id, `${n.id}: 依頼 ${q}`);
  for (const q of qs) assert.ok(D.npcs[q.giver].quests?.includes(q.id), `${q.giver} の quests に ${q.id} が無い`);
});

test('会話: 定型文 36〜46（重複なし、20 字以内）、スタンプ 10〜14（絵の id は stamp_<id>）', () => {
  assert.ok(D.phrases.length >= 36 && D.phrases.length <= 46, `定型文の数 ${D.phrases.length}`);
  assert.equal(new Set(D.phrases).size, D.phrases.length);
  for (const p of D.phrases) assert.ok(typeof p === 'string' && p.length > 0 && p.length <= 20, `定型文 ${p}`);
  assert.ok(D.stamps.length >= 10 && D.stamps.length <= 14, `スタンプの数 ${D.stamps.length}`);
  for (const s of D.stamps) {
    assert.match(s.id, /^[a-z][a-z0-9_]*$/);
    assert.equal(s.art, `stamp_${s.id}`);
    assert.ok(s.name);
  }
});

test('名前: makeName は部品からカタカナの名前を作り、同じ乱数なら同じ名前になる', () => {
  const seq = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const a = Array.from({ length: 50 }, (_, i) => D.makeName(seq(i + 1)));
  const b = Array.from({ length: 50 }, (_, i) => D.makeName(seq(i + 1)));
  assert.deepEqual(a, b);
  for (const n of a) {
    assert.match(n, /^[\u30A0-\u30FF]{3,8}$/, `カタカナ 3〜8 字: ${n}`);
    assert.ok(!D.nameParts.banned.includes(n), `避ける名前 ${n}`);
  }
  assert.ok(new Set(a).size >= 40, '名前がばらける');
});
