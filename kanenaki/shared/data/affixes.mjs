// 付加効果（魔法は 1〜2 個、希少は 3〜6 個。設計書 §8）
// kind: prefix（前に付く形容の名前）/ suffix（後ろに付く名前）。同じ品に同じ能力値のキーの付加は 1 つだけの想定。
// slots は付く部位、level は付く品の level の下限、weight は選ばれやすさ。value は [min, max] の幅から引く。

const ARMOR = ['head', 'body', 'hands', 'feet', 'belt', 'offhand'];
const JEWEL = ['neck', 'ring'];
const DEF = [...ARMOR, ...JEWEL];
const ELEM = ['weapon', 'ring', 'neck', 'hands'];
const CASTER = ['weapon', 'offhand', 'neck', 'ring'];
const STAT = ['weapon', 'head', 'body', 'hands', 'feet', 'belt', 'neck', 'ring'];

const P = (id, name, slots, level, weight, key, mode, value) => ({ id, kind: 'prefix', name, slots, level, weight, mods: [{ key, mode, value }] });
const S = (id, name, slots, level, weight, key, mode, value) => ({ id, kind: 'suffix', name, slots, level, weight, mods: [{ key, mode, value }] });

export const affixes = [
  // 前（体力・魔力・防御）
  P('pre_life1', '丈夫な', DEF, 1, 100, 'life', 'flat', [10, 20]),
  P('pre_life2', '頑健な', DEF, 10, 70, 'life', 'flat', [21, 35]),
  P('pre_life3', '不屈の', DEF, 18, 40, 'life', 'flat', [36, 55]),
  P('pre_mana1', '澄んだ', ['head', 'neck', 'ring', 'offhand', 'weapon'], 1, 90, 'mana', 'flat', [8, 15]),
  P('pre_mana2', '深い泉の', ['head', 'neck', 'ring', 'offhand', 'weapon'], 12, 60, 'mana', 'flat', [16, 30]),
  P('pre_armor1', '堅い', ARMOR, 1, 100, 'armor', 'inc', [10, 20]),
  P('pre_armor2', '鋼の', ARMOR, 10, 70, 'armor', 'inc', [21, 40]),
  P('pre_armor3', '岩の', ARMOR, 18, 40, 'armor', 'inc', [41, 60]),
  P('pre_evasion1', '身軽な', ['body', 'feet', 'head', 'hands', 'belt'], 1, 80, 'evasion', 'flat', [10, 25]),
  P('pre_evasion2', '影のような', ['body', 'feet', 'head', 'hands', 'belt'], 12, 50, 'evasion', 'flat', [26, 50]),
  P('pre_block', '守りの', ['offhand'], 5, 60, 'blockChance', 'flat', [3, 8]),
  // 前（攻め）
  P('pre_phys1', '鋭い', ['weapon'], 1, 100, 'dmgPhys', 'inc', [10, 20]),
  P('pre_phys2', '研がれた', ['weapon'], 8, 70, 'dmgPhys', 'inc', [21, 35]),
  P('pre_phys3', '無慈悲な', ['weapon'], 16, 40, 'dmgPhys', 'inc', [36, 55]),
  P('pre_spell1', '学識の', CASTER, 1, 80, 'dmgSpell', 'inc', [8, 16]),
  P('pre_spell2', '秘儀の', CASTER, 12, 50, 'dmgSpell', 'inc', [17, 30]),
  P('pre_minion', '死霊の', ['weapon', 'offhand', 'neck', 'head'], 5, 60, 'dmgMinion', 'inc', [10, 25]),
  P('pre_holy', '聖別された', CASTER, 5, 60, 'dmgHoly', 'inc', [10, 25]),
  P('pre_shadow', '呪われた', CASTER, 5, 60, 'dmgShadow', 'inc', [10, 25]),
  P('pre_fire', '燃える', ELEM, 5, 50, 'dmgFire', 'inc', [10, 25]),
  P('pre_cold', '凍てつく', ELEM, 5, 50, 'dmgCold', 'inc', [10, 25]),
  P('pre_lightning', '雷鳴の', ELEM, 5, 50, 'dmgLightning', 'inc', [10, 25]),
  P('pre_poison', '毒の', ELEM, 5, 50, 'dmgPoison', 'inc', [10, 25]),
  P('pre_accuracy', '正確な', ['weapon', 'hands', 'head', 'ring'], 1, 80, 'accuracy', 'flat', [10, 30]),
  P('pre_crit', '冷酷な', ['weapon', 'neck', 'ring'], 8, 50, 'critChance', 'inc', [10, 25]),
  P('pre_leech', '吸血の', ['weapon', 'ring'], 10, 40, 'lifeLeech', 'flat', [1, 3]),
  P('pre_heal', '慈悲の', ['weapon', 'offhand', 'neck', 'body'], 5, 50, 'healPower', 'inc', [8, 20]),
  P('pre_shield', '加護の', ['weapon', 'offhand', 'neck'], 8, 40, 'shieldPower', 'inc', [8, 20]),
  P('pre_melee', '猛き', ['weapon', 'hands'], 6, 60, 'dmgMelee', 'inc', [8, 20]),
  P('pre_proj', '鷹の目の', ['weapon', 'hands', 'head'], 6, 60, 'dmgProjectile', 'inc', [8, 20]),
  P('pre_dot', '蝕む', ['weapon', 'neck', 'ring'], 10, 40, 'dmgDot', 'inc', [8, 20]),

  // 後ろ（主な能力値）
  S('suf_str1', '熊の力', STAT, 1, 100, 'str', 'flat', [2, 5]),
  S('suf_str2', '大熊の力', STAT, 10, 60, 'str', 'flat', [6, 10]),
  S('suf_dex1', '猫の身のこなし', STAT, 1, 100, 'dex', 'flat', [2, 5]),
  S('suf_dex2', '山猫の身のこなし', STAT, 10, 60, 'dex', 'flat', [6, 10]),
  S('suf_int1', '梟の知恵', STAT, 1, 100, 'int', 'flat', [2, 5]),
  S('suf_int2', '大梟の知恵', STAT, 10, 60, 'int', 'flat', [6, 10]),
  S('suf_vit1', '牛の根気', STAT, 1, 100, 'vit', 'flat', [2, 5]),
  S('suf_vit2', '野牛の根気', STAT, 10, 60, 'vit', 'flat', [6, 10]),
  // 後ろ（耐性）
  S('suf_resfire1', '炉の守り', DEF, 1, 80, 'resFire', 'flat', [8, 16]),
  S('suf_resfire2', '溶岩の守り', DEF, 12, 50, 'resFire', 'flat', [17, 30]),
  S('suf_rescold1', '雪の守り', DEF, 1, 80, 'resCold', 'flat', [8, 16]),
  S('suf_rescold2', '氷河の守り', DEF, 12, 50, 'resCold', 'flat', [17, 30]),
  S('suf_reslight1', '嵐の守り', DEF, 1, 80, 'resLightning', 'flat', [8, 16]),
  S('suf_reslight2', '雷雲の守り', DEF, 12, 50, 'resLightning', 'flat', [17, 30]),
  S('suf_respoison', '沼の守り', DEF, 5, 70, 'resPoison', 'flat', [8, 20]),
  S('suf_resshadow', '灯火の守り', DEF, 5, 70, 'resShadow', 'flat', [8, 20]),
  // 後ろ（そのほか）
  S('suf_liferegen', '再生', ['body', 'belt', 'ring', 'neck', 'head'], 5, 60, 'lifeRegen', 'flat', [1, 3]),
  S('suf_manaregen', '瞑想', ['neck', 'ring', 'head', 'offhand', 'weapon'], 5, 60, 'manaRegen', 'flat', [0.5, 1.5]),
  S('suf_move', '旅人の足', ['feet'], 5, 70, 'moveSpeed', 'inc', [5, 12]),
  S('suf_light', '灯り', ['head', 'neck', 'ring', 'offhand'], 1, 60, 'lightRadius', 'flat', [1, 2]),
  S('suf_gold', '強欲', ['hands', 'ring', 'neck', 'belt'], 5, 50, 'goldFind', 'inc', [10, 30]),
  S('suf_item', '幸運', ['ring', 'neck', 'head', 'feet'], 10, 30, 'itemFind', 'inc', [5, 15]),
  S('suf_critmulti', '処刑人の手', ['weapon', 'neck'], 10, 40, 'critMulti', 'flat', [10, 25]),
  S('suf_atkspd', '素早さ', ['weapon', 'hands'], 6, 60, 'attackSpeed', 'inc', [5, 10]),
  S('suf_castspd', '流れる詠唱', ['weapon', 'offhand', 'neck'], 6, 60, 'castSpeed', 'inc', [5, 10]),
  S('suf_cdr', '速き時', ['neck', 'ring', 'head'], 14, 30, 'cooldownRecovery', 'inc', [4, 10]),
  S('suf_stun', '鉄槌', ['weapon'], 5, 50, 'stunChance', 'flat', [3, 8]),
  S('suf_bleed', '裂き傷', ['weapon'], 5, 50, 'bleedChance', 'flat', [5, 12]),
  S('suf_poisonc', '蛇の牙', ['weapon', 'hands'], 5, 50, 'poisonChance', 'flat', [5, 12]),
  S('suf_area', '広野', ['weapon', 'neck', 'head'], 12, 40, 'areaSize', 'inc', [5, 12]),
  S('suf_duration', '長い祈り', ['offhand', 'neck', 'head'], 12, 40, 'durationSkill', 'inc', [5, 12]),
  S('suf_manacost', '倹約', ['neck', 'ring', 'head'], 8, 40, 'manaCost', 'inc', [-10, -4]),
];
