// 魔物（設計書 §13 の 15 種。絵の id は魔物の id と同じ）
// speed はマス/秒、range はマス、aps は 1 秒あたりの攻撃の回数、aggro は気づく距離（マス）。
// res は耐性（％）。キーはダメージの種類（fire・cold・lightning・poison・holy・shadow）で、サーバーの actor.mjs が resFire などに直す。
// xp は倒したときの経験値（同じ Lv のとき）。項目名はサーバーの係の actor.mjs の読み方に合わせてある。
// 召喚の味方（minion: true）は、呼んだ者の Lv に scaleMonster で合わせる想定。

export const monsters = {
  stray_dog: {
    id: 'stray_dog', name: '野良犬', desc: '飢えて群れを離れた犬。足が速い。',
    level: 1, life: 14, dmg: [1, 3], dmgType: 'phys', speed: 5.2, range: 1.2, aps: 0.91, aggro: 7,
    armor: 0, evasion: 10, accuracy: 30, res: {},
    ai: 'melee', skills: ['m_pounce'], xp: 9, art: 'stray_dog',
  },
  carrion_crow: {
    id: 'carrion_crow', name: '屍鴉', desc: '死んだ者をついばむ鴉。速いが弱い。',
    level: 1, life: 9, dmg: [1, 3], dmgType: 'phys', speed: 6, range: 1.2, aps: 1.11, aggro: 8,
    armor: 0, evasion: 18, accuracy: 30, res: {}, flying: true,
    ai: 'melee', skills: [], xp: 7, art: 'carrion_crow',
  },
  mud_imp: {
    id: 'mud_imp', name: '泥小鬼', desc: '泥から生まれた小さな鬼。群れで押し寄せる。',
    level: 2, life: 18, dmg: [1, 3], dmgType: 'phys', speed: 3.8, range: 1.2, aps: 0.83, aggro: 7,
    armor: 4, evasion: 8, accuracy: 34, res: {},
    ai: 'swarm', skills: ['m_imp_howl'], xp: 11, art: 'mud_imp',
  },
  mud_imp_slinger: {
    id: 'mud_imp_slinger', name: '泥小鬼の投石兵', desc: '石を投げてくる泥小鬼。近づくと逃げる。',
    level: 3, life: 16, dmg: [2, 5], dmgType: 'phys', speed: 3.6, range: 6, aps: 0.63, aggro: 9,
    armor: 3, evasion: 12, accuracy: 40, res: {},
    ai: 'ranged', skills: ['m_sling'], xp: 15, art: 'mud_imp_slinger',
  },
  bone_soldier: {
    id: 'bone_soldier', name: '骨の兵', desc: '鐘が砕けた夜に起き上がった兵士の骨。盾を持つ。',
    level: 5, life: 34, dmg: [4, 7], dmgType: 'phys', speed: 3.2, range: 1.3, aps: 0.77, aggro: 7,
    armor: 6, evasion: 6, accuracy: 46, res: { poison: 50, shadow: 25 },
    ai: 'melee', skills: ['m_shield_bash'], xp: 30, art: 'bone_soldier',
  },
  bog_wight: {
    id: 'bog_wight', name: '沼の亡者', desc: '沼に沈んだ者のなれの果て。硬く、足元から手を伸ばす。',
    level: 10, life: 140, dmg: [8, 14], dmgType: 'phys', speed: 2.8, range: 1.3, aps: 0.67, aggro: 7,
    armor: 30, evasion: 10, accuracy: 80, res: { poison: 40, shadow: 30, holy: -25 },
    ai: 'melee', skills: ['m_grave_grasp'], xp: 170, art: 'bog_wight',
  },
  venom_toad: {
    id: 'venom_toad', name: '毒蛙', desc: '背中に毒のこぶを持つ大きな蛙。離れた所から毒を吐く。',
    level: 9, life: 70, dmg: [5, 9], dmgType: 'poison', speed: 3.4, range: 5, aps: 0.5, aggro: 8,
    armor: 10, evasion: 20, accuracy: 70, res: { poison: 75 },
    ai: 'ranged', skills: ['m_venom_spit'], xp: 130, art: 'venom_toad',
  },
  mist_witch: {
    id: 'mist_witch', name: '霧の魔女', desc: '霧の奥に住む魔女。冷たい呪いで足を止め、霧に紛れて逃げる。',
    level: 12, life: 110, dmg: [10, 16], dmgType: 'cold', speed: 3.2, range: 7, aps: 0.4, aggro: 10,
    armor: 8, evasion: 20, accuracy: 90, res: { cold: 50 },
    ai: 'caster', skills: ['m_frost_hex', 'm_mist_veil'], xp: 300, art: 'mist_witch',
  },
  leech_swarm: {
    id: 'leech_swarm', name: '吸い蛭の群れ', desc: '泥の中から群れで這い出す蛭。血を吸って傷をふさぐ。',
    level: 9, life: 34, dmg: [3, 6], dmgType: 'phys', speed: 4.4, range: 1.1, aps: 1, aggro: 6,
    armor: 2, evasion: 25, accuracy: 70, res: { poison: 30 },
    ai: 'swarm', skills: ['m_leech_bite'], xp: 70, art: 'leech_swarm',
  },
  bell_ghoul: {
    id: 'bell_ghoul', name: '鐘楼の屍鬼', desc: '鐘楼の地下で死者を食らう鬼。血を見ると狂ったように暴れる。',
    level: 15, life: 240, dmg: [14, 22], dmgType: 'phys', speed: 3.8, range: 1.3, aps: 0.83, aggro: 8,
    armor: 30, evasion: 18, accuracy: 120, res: { shadow: 30, poison: 30, holy: -20 },
    ai: 'melee', skills: ['m_ghoul_frenzy'], xp: 420, art: 'bell_ghoul',
  },
  cursed_acolyte: {
    id: 'cursed_acolyte', name: '呪われた侍祭', desc: '鐘楼に仕えていた侍祭。今は闇に祈り、骨を起こす。',
    level: 17, life: 190, dmg: [12, 18], dmgType: 'shadow', speed: 3, range: 7, aps: 0.5, aggro: 10,
    armor: 20, evasion: 20, accuracy: 130, res: { shadow: 50, holy: -25 },
    ai: 'summoner', skills: ['m_dark_bolt', 'm_raise_bones'], xp: 520, art: 'cursed_acolyte',
  },
  bronze_sentinel: {
    id: 'bronze_sentinel', name: '青銅の番兵', desc: '鐘楼を守るために鋳られた青銅の像。動きは遅いが、とても硬い。',
    level: 19, life: 460, dmg: [20, 32], dmgType: 'phys', speed: 2.4, range: 1.6, aps: 0.56, aggro: 6,
    armor: 110, evasion: 0, accuracy: 150, res: { fire: 30, cold: 30, lightning: -25, poison: 75 },
    ai: 'melee', skills: ['m_bronze_slam'], xp: 760, art: 'bronze_sentinel',
  },
  bell_warden: {
    id: 'bell_warden', name: '鐘守りの亡者', desc: '沈んだ鐘楼の最も深い所で、割れた鐘を抱いて立つ亡者。鐘を鳴らすたびに死者が起きる。',
    level: 26, life: 7000, dmg: [18, 28], dmgType: 'shadow', speed: 3, range: 1.8, aps: 0.55, aggro: 12,
    armor: 45, evasion: 30, accuracy: 150, res: { shadow: 60, poison: 50, holy: -15, fire: 20, cold: 20, lightning: 20 },
    ai: 'boss', skills: ['m_warden_call', 'm_warden_toll', 'm_warden_chain', 'm_warden_ring', 'm_warden_dread'],
    xp: 28000, art: 'bell_warden', boss: true, ccResist: 0.5,
  },
  minion_skeleton: {
    id: 'minion_skeleton', name: '骨の兵（味方）', desc: 'ネクロマンサーが起こした骨の兵。近くの敵に斬りかかる。',
    level: 10, life: 90, dmg: [4, 6], dmgType: 'phys', speed: 4.2, range: 1.3, aps: 0.83, aggro: 8,
    armor: 20, evasion: 10, accuracy: 90, res: { poison: 50 },
    ai: 'melee', skills: [], xp: 0, art: 'minion_skeleton', minion: true,
  },
  minion_skeleton_archer: {
    id: 'minion_skeleton_archer', name: '骨の射手（味方）', desc: 'ネクロマンサーが起こした骨の射手。離れた所から骨の矢を射る。',
    level: 10, life: 60, dmg: [4, 7], dmgType: 'phys', speed: 4, range: 6, aps: 0.71, aggro: 9,
    armor: 10, evasion: 15, accuracy: 100, res: { poison: 50 },
    ai: 'ranged', skills: ['m_bone_arrow'], xp: 0, art: 'minion_skeleton_archer', minion: true,
  },
};

// 精鋭の性質（設計書 §9）。精鋭は色が変わり、ここから 1〜2 個を持つ。
// mods は能力値の修正、skills は足される魔物のスキル（skills.mjs の id）。
export const eliteMods = [
  { id: 'swift', name: '速い', mods: [{ key: 'moveSpeed', mode: 'inc', value: 40 }, { key: 'attackSpeed', mode: 'inc', value: 25 }] },
  { id: 'stone', name: '硬い', mods: [{ key: 'armor', mode: 'more', value: 50 }, { key: 'life', mode: 'more', value: 30 }] },
  { id: 'burning', name: '炎をまとう', mods: [{ key: 'resFire', mode: 'flat', value: 50 }], skills: ['m_burning_coat'] },
  { id: 'rallying', name: '仲間を勢いづける', mods: [], skills: ['m_imp_howl'] },
  { id: 'vampiric', name: '血を吸う', mods: [{ key: 'lifeLeech', mode: 'flat', value: 10 }] },
  { id: 'cursing', name: '呪いをかける', mods: [{ key: 'dmg', mode: 'inc', value: 15 }], skills: ['m_hex'] },
];

// 精鋭と普通の差（life と dmg と xp と宝にかける倍率）
export const tierScale = Object.freeze({
  normal: { life: 1, dmg: 1, xp: 1 },
  elite: { life: 2, dmg: 1.25, xp: 2.5 },
  boss: { life: 1, dmg: 1, xp: 1 },
});

// 魔物を別の Lv に合わせる（湧き場所の level、召喚した者の Lv）。元の魔物は書き換えない。
export function scaleMonster(m, level) {
  const d = level - m.level;
  const f = (v, rate) => Math.max(1, Math.round(v * rate ** d));
  const g = (v, rate) => Math.round(v * rate ** d);
  return {
    ...m,
    level,
    life: f(m.life, 1.16),
    dmg: m.dmg.map((v) => f(v, 1.1)),
    armor: g(m.armor, 1.08),
    evasion: g(m.evasion, 1.08),
    accuracy: g(m.accuracy, 1.08),
    xp: m.xp > 0 ? f(m.xp, 1.15) : 0,
  };
}
