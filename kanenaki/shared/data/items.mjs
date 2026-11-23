// 宝: 基本の品（bases）と消耗品（consumables）、武器と防具の種類、落ち方の表
// slot は 'head','body','hands','feet','belt','neck','ring','weapon','offhand'。ring は ring1・ring2 のどちらにも入る。
// w×h は持ち物の升目（10×6）で使う大きさ。dmg は武器のダメージ、speed は 1 秒あたりの攻撃の回数。
// armor は防御。implicit は品そのものが持つ修正（付加とは別）。price は店で買う値段（売るときは 1/4 の想定）。
// 名前の出し方（提案）: 「<前の付加の名前><基本の品の名前>〈<後ろの付加の名前>〉」例: 鋭い長剣〈熊の〉

export const weaponKinds = Object.freeze({
  sword: { name: '剣', hands: 1 },
  greatsword: { name: '大剣', hands: 2 },
  dagger: { name: '短剣', hands: 1 },
  axe: { name: '斧', hands: 1 },
  staff: { name: '杖', hands: 2 },
  scepter: { name: '錫杖', hands: 1 },
  knuckle: { name: '拳甲', hands: 1 },
  shield: { name: '盾', hands: 0 },
  tome: { name: '魔導書', hands: 0 },
});
export const armorKinds = Object.freeze({
  helm: '兜', armor: '鎧', gloves: '手袋', boots: '靴', belt: '帯', amulet: '首飾り', ring: '指輪',
});

const W = (id, name, kind, w, h, level, dmg, speed, price, implicit) => ({
  id, name, slot: 'weapon', kind, w, h, level, dmg, speed, price,
  ...(weaponKinds[kind].hands === 2 ? { hands: 2 } : {}),
  ...(implicit ? { implicit } : {}), icon: id,
});
const A = (id, name, slot, kind, w, h, level, armor, price, implicit) => ({
  id, name, slot, kind, w, h, level, armor, price, ...(implicit ? { implicit } : {}), icon: id,
});
const J = (id, name, slot, kind, level, price, implicit) => ({
  id, name, slot, kind, w: 1, h: 1, level, price, implicit, icon: id,
});
const m = (key, mode, value) => ({ key, mode, value });

export const bases = [
  // 武器
  W('rusty_sword', '錆びた剣', 'sword', 1, 3, 1, [2, 5], 1.2, 10),
  W('long_sword', '長剣', 'sword', 1, 3, 8, [6, 12], 1.2, 120),
  W('knight_sword', '騎士の剣', 'sword', 1, 3, 18, [14, 26], 1.2, 600),
  W('two_hander', '両手剣', 'greatsword', 2, 4, 5, [6, 13], 0.9, 90),
  W('headsman_blade', '首斬りの大剣', 'greatsword', 2, 4, 16, [20, 38], 0.9, 650),
  W('short_knife', '小刀', 'dagger', 1, 2, 1, [2, 4], 1.5, 8),
  W('stiletto', '鎧通し', 'dagger', 1, 2, 10, [6, 11], 1.5, 180, [m('critChance', 'inc', 20)]),
  W('hatchet', '手斧', 'axe', 2, 3, 3, [3, 7], 1.05, 30),
  W('war_axe', '戦斧', 'axe', 2, 3, 14, [12, 24], 1.05, 420),
  W('oak_staff', '樫の杖', 'staff', 1, 4, 1, [2, 5], 1, 12, [m('dmgSpell', 'inc', 10)]),
  W('bone_staff', '骨の杖', 'staff', 1, 4, 12, [8, 15], 1, 300, [m('dmgSpell', 'inc', 25), m('dmgMinion', 'inc', 15)]),
  W('iron_scepter', '鉄の錫杖', 'scepter', 1, 3, 4, [3, 7], 1.1, 40, [m('healPower', 'inc', 10)]),
  W('prayer_scepter', '祈りの錫杖', 'scepter', 1, 3, 15, [10, 18], 1.1, 450, [m('dmgHoly', 'inc', 20)]),
  W('leather_knuckle', '革の拳甲', 'knuckle', 2, 2, 2, [2, 5], 1.45, 15),
  W('steel_knuckle', '鋼の拳甲', 'knuckle', 2, 2, 13, [9, 16], 1.45, 380, [m('attackSpeed', 'inc', 5)]),
  // 副手
  A('wooden_shield', '木の盾', 'offhand', 'shield', 2, 2, 1, 6, 10, [m('blockChance', 'flat', 15)]),
  A('tower_shield', '塔の盾', 'offhand', 'shield', 2, 3, 14, 40, 400, [m('blockChance', 'flat', 25)]),
  A('old_tome', '古い魔導書', 'offhand', 'tome', 2, 2, 5, 0, 60, [m('dmgSpell', 'inc', 10), m('mana', 'flat', 15)]),
  A('black_tome', '黒い魔導書', 'offhand', 'tome', 2, 2, 16, 0, 480, [m('dmgMinion', 'inc', 20), m('minionLife', 'inc', 15)]),
  // 頭
  A('leather_hood', '革の頭巾', 'head', 'helm', 2, 2, 1, 3, 8),
  A('iron_helm', '鉄の兜', 'head', 'helm', 2, 2, 8, 12, 90),
  A('great_helm', '大兜', 'head', 'helm', 2, 2, 18, 30, 450),
  // 胴
  A('cloth_tunic', '布の服', 'body', 'armor', 2, 3, 1, 4, 8),
  A('leather_armor', '革鎧', 'body', 'armor', 2, 3, 5, 12, 60),
  A('prayer_robe', '祈りの法衣', 'body', 'armor', 2, 3, 10, 14, 200, [m('mana', 'flat', 20)]),
  A('chain_mail', '鎖帷子', 'body', 'armor', 2, 3, 12, 30, 320),
  A('plate_armor', '板金の鎧', 'body', 'armor', 2, 3, 20, 55, 800, [m('moveSpeed', 'inc', -3)]),
  // 手
  A('leather_gloves', '革手袋', 'hands', 'gloves', 2, 2, 1, 2, 8),
  A('iron_gauntlets', '鉄の籠手', 'hands', 'gloves', 2, 2, 12, 12, 240),
  // 足
  A('leather_boots', '革靴', 'feet', 'boots', 2, 2, 1, 2, 8),
  A('traveler_boots', '旅人の靴', 'feet', 'boots', 2, 2, 8, 5, 120, [m('moveSpeed', 'inc', 5)]),
  A('iron_boots', '鉄靴', 'feet', 'boots', 2, 2, 12, 12, 240),
  // 帯
  A('cloth_sash', '布の帯', 'belt', 'belt', 2, 1, 1, 1, 6),
  A('leather_belt', '革の帯', 'belt', 'belt', 2, 1, 8, 3, 100, [m('life', 'flat', 15)]),
  A('chain_belt', '鎖の帯', 'belt', 'belt', 2, 1, 16, 8, 380, [m('armor', 'inc', 8)]),
  // 首
  J('bone_charm', '骨の首飾り', 'neck', 'amulet', 3, 40, [m('resShadow', 'flat', 8)]),
  J('silver_pendant', '銀の首飾り', 'neck', 'amulet', 12, 260, [m('manaRegen', 'flat', 0.5)]),
  // 指
  J('iron_ring', '鉄の指輪', 'ring', 'ring', 1, 20, [m('armor', 'flat', 5)]),
  J('copper_ring', '銅の指輪', 'ring', 'ring', 6, 80, [m('resLightning', 'flat', 10)]),
  J('obsidian_ring', '黒曜石の指輪', 'ring', 'ring', 14, 320, [m('critChance', 'inc', 10)]),
];

// 消耗品と依頼の品。use はサーバーの係の data.mjs が読む形:
//   { healPct: 体力を戻す％ } / { manaPct: 魔力を戻す％ } / { portal: true（町へ帰る） } / { respec: 取り消せるマスの数 }
// key は使う鍵（設計書 §10: Z 回復薬、X 魔力の薬、T 帰還）。
export const consumables = [
  {
    id: 'potion_life', name: '回復薬', kind: 'potion', w: 1, h: 1, stack: 20, level: 1, price: 10, key: 'Z',
    desc: '体力の 35% を戻す。', use: { healPct: 35 }, icon: 'potion_life',
  },
  {
    id: 'potion_life_big', name: '大きな回復薬', kind: 'potion', w: 1, h: 1, stack: 20, level: 12, price: 40, key: 'Z',
    desc: '体力の 60% を戻す。', use: { healPct: 60 }, icon: 'potion_life_big',
  },
  {
    id: 'potion_mana', name: '魔力の薬', kind: 'potion', w: 1, h: 1, stack: 20, level: 1, price: 10, key: 'X',
    desc: '魔力の 35% を戻す。', use: { manaPct: 35 }, icon: 'potion_mana',
  },
  {
    id: 'potion_mana_big', name: '大きな魔力の薬', kind: 'potion', w: 1, h: 1, stack: 20, level: 12, price: 40, key: 'X',
    desc: '魔力の 60% を戻す。', use: { manaPct: 60 }, icon: 'potion_mana_big',
  },
  {
    id: 'scroll_return', name: '帰還の巻物', kind: 'scroll', w: 1, h: 1, stack: 10, level: 1, price: 25, key: 'T',
    desc: '読むと灰鐘の町へ戻る。', use: { portal: true }, icon: 'scroll_return',
  },
  {
    id: 'holy_water_forget', name: '忘却の聖水', kind: 'elixir', w: 1, h: 1, stack: 10, level: 1, price: 300,
    desc: '飲むと、取ったパッシブのマスを 1 つ取り消せる。', use: { respec: 1 }, icon: 'holy_water_forget',
  },
  {
    id: 'bog_herb', name: '沼の薬草', kind: 'quest', w: 1, h: 1, stack: 20, level: 1, price: 0,
    desc: '霧沼に生える苦い草。薬師が欲しがっている。', icon: 'bog_herb',
  },
  {
    id: 'bell_shard', name: '鐘のかけら', kind: 'quest', w: 1, h: 1, stack: 10, level: 1, price: 0,
    desc: '砕けた聖鐘のかけら。触れると、かすかに鳴る。', icon: 'bell_shard', art: 'bell_shard',
  },
];

// 落ち方の表（設計書 §8）。魔物の強さで決まり、rarity の確率に (1 + 宝の見つけやすさ/100) をかける。
// 落ちる品は「品の level ≤ 魔物の level」から選ぶ。gold は 1 回の量 = 魔物の level × perLevel の幅。
export const lootTiers = Object.freeze({
  normal: { dropChance: 0.35, count: [1, 1], gold: { chance: 0.4, perLevel: [1, 3] }, rarity: { magic: 0.22, rare: 0.05, unique: 0.004 }, potion: 0.12 },
  elite: { dropChance: 1, count: [1, 3], gold: { chance: 0.8, perLevel: [2, 6] }, rarity: { magic: 0.45, rare: 0.15, unique: 0.02 }, potion: 0.3 },
  boss: { dropChance: 1, count: [4, 6], gold: { chance: 1, perLevel: [10, 20] }, rarity: { magic: 0.4, rare: 0.4, unique: 0.15 }, potion: 1, always: ['bell_shard'] },
});

// 依頼の品の落ち方（依頼を受けている間だけ落ちる）
export const questDrops = Object.freeze({
  bog_herb: { from: ['bog_wight', 'venom_toad', 'leech_swarm', 'mist_witch'], chance: 0.3 },
  bell_shard: { from: ['bell_ghoul', 'cursed_acolyte', 'bronze_sentinel'], chance: 0.12 },
});
