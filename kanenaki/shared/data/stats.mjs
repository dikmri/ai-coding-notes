// 能力値のキー（schema.mjs の STAT_KEYS）の日本語名と、修正 { key, mode, value } を文にする関数
// 画面の係が、宝の説明・ツリーのマス・スキルの効果を表示するときに使う。

export const statNames = Object.freeze({
  str: '力', dex: '器用', int: '知恵', vit: '体力',
  life: '最大体力', mana: '最大魔力', lifeRegen: '体力の回復', manaRegen: '魔力の回復',
  lifeLeech: '与えたダメージを体力に', manaLeech: '与えたダメージを魔力に',
  armor: '防御', evasion: '回避', blockChance: '防ぐ確率', accuracy: '命中',
  moveSpeed: '移動の速さ', attackSpeed: '攻撃の速さ', castSpeed: '詠唱の速さ', cooldownRecovery: '待ち時間の戻り',
  critChance: '会心率', critMulti: '会心の倍率',
  dmg: '与えるダメージ', dmgMelee: '近接のダメージ', dmgProjectile: '飛び道具のダメージ', dmgArea: '範囲のダメージ',
  dmgDot: '時間で削るダメージ', dmgMinion: '召喚した味方のダメージ', dmgSpell: '呪文のダメージ', dmgAttack: '攻撃のダメージ',
  dmgPhys: '物理のダメージ', dmgFire: '炎のダメージ', dmgCold: '冷気のダメージ', dmgLightning: '雷のダメージ',
  dmgPoison: '毒のダメージ', dmgHoly: '聖のダメージ', dmgShadow: '闇のダメージ',
  resFire: '炎の耐性', resCold: '冷気の耐性', resLightning: '雷の耐性', resPoison: '毒の耐性',
  resHoly: '聖の耐性', resShadow: '闇の耐性',
  areaSize: '範囲の広さ', projectileSpeed: '飛び道具の速さ', projectileCount: '飛び道具の数',
  durationSkill: 'スキルの効果時間', manaCost: '魔力の消費',
  healPower: '回復の量', shieldPower: '盾の量', minionLife: '召喚した味方の体力', minionCount: '召喚できる数',
  auraEffect: 'オーラの効き目',
  stunChance: '気絶させる確率', bleedChance: '出血させる確率', poisonChance: '毒にする確率',
  burnChance: '燃やす確率', freezeChance: '凍らせる確率', shockChance: '感電させる確率',
  goldFind: 'お金の見つけやすさ', itemFind: '宝の見つけやすさ', xpGain: '経験値', lightRadius: '明かりの範囲',
});

// flat の値そのものが％のキー（会心率 +3% のように表す）
export const pctFlatKeys = Object.freeze([
  'lifeLeech', 'manaLeech', 'blockChance', 'critChance', 'critMulti',
  'resFire', 'resCold', 'resLightning', 'resPoison', 'resHoly', 'resShadow',
  'stunChance', 'bleedChance', 'poisonChance', 'burnChance', 'freezeChance', 'shockChance',
]);
// flat の値が 1 秒あたりのキー
export const perSecondKeys = Object.freeze(['lifeRegen', 'manaRegen']);
// flat の値がマスのキー
export const tileKeys = Object.freeze(['lightRadius']);

const num = (v) => {
  const a = Math.abs(v);
  const s = Number.isInteger(a) ? String(a) : String(Math.round(a * 10) / 10);
  return `${v < 0 ? '−' : '+'}${s}`;
};

// { key, mode, value } → 「最大体力 +10%」。value が [min,max] のときは「+10〜20%」
export function formatMod({ key, mode, value }) {
  const name = statNames[key] ?? key;
  const body = Array.isArray(value)
    ? `${num(value[0])}〜${String(Math.abs(value[1]))}`
    : num(value);
  if (mode === 'inc') return `${name} ${body}%`;
  if (mode === 'more') return `${name} さらに ${body}%`;
  if (pctFlatKeys.includes(key)) return `${name} ${body}%`;
  if (perSecondKeys.includes(key)) return `${name} ${body}/秒`;
  if (tileKeys.includes(key)) return `${name} ${body}マス`;
  return `${name} ${body}`;
}
