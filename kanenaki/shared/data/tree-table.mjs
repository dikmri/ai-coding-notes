// パッシブのツリーの手で書いた表（目玉・要・門・小さいマスの候補）。
// kanenaki/tools/gen-tree.mjs がこの表と種から tree.mjs を作る。表を変えたら node kanenaki/tools/gen-tree.mjs を走らせる。
//
// 形: 中心に冒険者の出発点（c0）と 12 マスの輪。輪から 6 方向へ 5 マスの道（3 マス目が目玉）が伸び、
// その先に各職の門と地域がある。地域は 3 本の枝（左・中・右）で、枝ごとに「3 マス → 5 マスの輪と目玉 → 3 マス → 5 マスの輪と目玉」。
// 中の枝の先に 2 マスを挟んで要。となりの地域の左右の枝は、目玉を挟んだ 3 マスの橋でつながる。
// 中心の輪からは、職の方向の間に 2 本、要へ向かう短い道が出る。

const m = (key, mode, value) => ({ key, mode, value });

// 6 方向の順（画面の上から時計回り。y は下向き）。angle は度
export const regions = [
  { cls: 'warrior', angle: -90 },
  { cls: 'swordsman', angle: -30 },
  { cls: 'rogue', angle: 30 },
  { cls: 'monk', angle: 90 },
  { cls: 'priest', angle: 150 },
  { cls: 'necromancer', angle: 210 },
];

// 中心の輪の 12 マス（-90° から 30° ずつ時計回り）
export const ringMods = [
  m('str', 'flat', 6), m('life', 'flat', 10), m('dex', 'flat', 6), m('accuracy', 'flat', 20),
  m('dex', 'flat', 6), m('evasion', 'flat', 15), m('vit', 'flat', 6), m('lifeRegen', 'flat', 0.5),
  m('int', 'flat', 6), m('mana', 'flat', 10), m('int', 'flat', 6), m('armor', 'flat', 15),
];

// 小さいマスの候補（地域ごと）。道と枝の小さいマスは、種で決まる順にここから選ぶ
export const smallPools = {
  warrior: [m('str', 'flat', 8), m('life', 'inc', 4), m('armor', 'inc', 8), m('dmgMelee', 'inc', 6), m('lifeRegen', 'flat', 0.5), m('stunChance', 'flat', 2), m('dmgArea', 'inc', 6), m('vit', 'flat', 6)],
  swordsman: [m('dex', 'flat', 6), m('str', 'flat', 6), m('attackSpeed', 'inc', 3), m('critChance', 'inc', 8), m('dmgMelee', 'inc', 6), m('accuracy', 'flat', 15), m('evasion', 'inc', 6), m('bleedChance', 'flat', 2)],
  rogue: [m('dex', 'flat', 8), m('critChance', 'inc', 10), m('critMulti', 'flat', 8), m('evasion', 'inc', 8), m('poisonChance', 'flat', 2), m('moveSpeed', 'inc', 2), m('dmgProjectile', 'inc', 6), m('dmgDot', 'inc', 6)],
  monk: [m('dex', 'flat', 6), m('vit', 'flat', 6), m('attackSpeed', 'inc', 3), m('evasion', 'inc', 6), m('dmgMelee', 'inc', 6), m('manaRegen', 'flat', 0.3), m('moveSpeed', 'inc', 2), m('dmgHoly', 'inc', 6)],
  priest: [m('int', 'flat', 8), m('healPower', 'inc', 6), m('shieldPower', 'inc', 6), m('mana', 'inc', 5), m('manaRegen', 'flat', 0.3), m('dmgHoly', 'inc', 8), m('resShadow', 'flat', 5), m('auraEffect', 'inc', 4)],
  necromancer: [m('int', 'flat', 8), m('dmgMinion', 'inc', 8), m('minionLife', 'inc', 8), m('dmgShadow', 'inc', 8), m('dmgDot', 'inc', 6), m('castSpeed', 'inc', 3), m('mana', 'inc', 4), m('durationSkill', 'inc', 5)],
  center: [m('str', 'flat', 6), m('dex', 'flat', 6), m('int', 'flat', 6), m('vit', 'flat', 6), m('life', 'flat', 8), m('mana', 'flat', 6), m('armor', 'flat', 10), m('evasion', 'flat', 10)],
};

// 門（転職でその職の門を 1 つ無料でもらう）
export const gates = {
  warrior: { name: '戦士の門', mods: [m('str', 'flat', 10), m('life', 'flat', 15)] },
  swordsman: { name: '剣士の門', mods: [m('dex', 'flat', 8), m('attackSpeed', 'inc', 4)] },
  rogue: { name: '盗賊の門', mods: [m('dex', 'flat', 10), m('critChance', 'inc', 10)] },
  monk: { name: 'モンクの門', mods: [m('vit', 'flat', 8), m('evasion', 'inc', 8)] },
  priest: { name: '司祭の門', mods: [m('int', 'flat', 10), m('healPower', 'inc', 8)] },
  necromancer: { name: 'ネクロマンサーの門', mods: [m('int', 'flat', 10), m('dmgMinion', 'inc', 8)] },
};

// 道の目玉（中心から門へ向かう道の 3 マス目）
export const spokeNotables = {
  warrior: { name: '鍛えた腕', mods: [m('str', 'flat', 15), m('life', 'flat', 20)] },
  swordsman: { name: '剣を握る手', mods: [m('dex', 'flat', 10), m('str', 'flat', 10)] },
  rogue: { name: '器用な指', mods: [m('dex', 'flat', 15), m('accuracy', 'flat', 30)] },
  monk: { name: '静かな呼吸', mods: [m('dex', 'flat', 10), m('vit', 'flat', 10)] },
  priest: { name: '祈りの言葉', mods: [m('int', 'flat', 15), m('mana', 'flat', 20)] },
  necromancer: { name: '墓場の知恵', mods: [m('int', 'flat', 15), m('dmgMinion', 'inc', 10)] },
};

// 地域の目玉。順は [左の 1 つ目, 左の 2 つ目, 中の 1 つ目, 中の 2 つ目, 右の 1 つ目, 右の 2 つ目]。
// small はその目玉を囲む 5 マスの輪に付く修正。
export const regionNotables = {
  warrior: [
    { name: '鉄の胴', mods: [m('life', 'inc', 10), m('armor', 'inc', 20)], small: m('armor', 'inc', 6) },
    { name: '岩をも砕く', mods: [m('dmgMelee', 'inc', 20), m('stunChance', 'flat', 8)], small: m('dmgMelee', 'inc', 5) },
    { name: '戦場の雄叫び', mods: [m('dmgArea', 'inc', 15), m('areaSize', 'inc', 10)], small: m('dmgArea', 'inc', 5) },
    { name: '不倒の心', mods: [m('life', 'inc', 12), m('lifeRegen', 'flat', 2)], small: m('life', 'inc', 3) },
    { name: '血の誓い', mods: [m('lifeLeech', 'flat', 2), m('dmgPhys', 'inc', 15)], small: m('dmgPhys', 'inc', 5) },
    { name: '重い一歩', mods: [m('armor', 'more', 10), m('resFire', 'flat', 10), m('resCold', 'flat', 10)], small: m('vit', 'flat', 5) },
  ],
  swordsman: [
    { name: '一閃', mods: [m('critChance', 'inc', 25), m('critMulti', 'flat', 15)], small: m('critChance', 'inc', 6) },
    { name: '刃の舞', mods: [m('attackSpeed', 'inc', 10), m('evasion', 'inc', 15)], small: m('attackSpeed', 'inc', 3) },
    { name: '見切り', mods: [m('evasion', 'inc', 25), m('blockChance', 'flat', 5)], small: m('evasion', 'inc', 6) },
    { name: '研ぎ澄ました刃', mods: [m('dmgPhys', 'inc', 20), m('accuracy', 'inc', 15)], small: m('dmgPhys', 'inc', 5) },
    { name: '踏み込みの足', mods: [m('moveSpeed', 'inc', 6), m('dmgMelee', 'inc', 15)], small: m('dmgMelee', 'inc', 5) },
    { name: '出血の刃', mods: [m('bleedChance', 'flat', 10), m('dmgDot', 'inc', 20)], small: m('bleedChance', 'flat', 2) },
  ],
  rogue: [
    { name: '急所狙い', mods: [m('critChance', 'inc', 30), m('critMulti', 'flat', 20)], small: m('critMulti', 'flat', 6) },
    { name: '毒の知識', mods: [m('poisonChance', 'flat', 10), m('dmgPoison', 'inc', 25)], small: m('dmgPoison', 'inc', 6) },
    { name: '身のこなし', mods: [m('evasion', 'inc', 25), m('moveSpeed', 'inc', 5)], small: m('evasion', 'inc', 6) },
    { name: '投げの名手', mods: [m('dmgProjectile', 'inc', 20), m('projectileSpeed', 'inc', 15)], small: m('dmgProjectile', 'inc', 5) },
    { name: '罠の心得', mods: [m('durationSkill', 'inc', 15), m('dmgArea', 'inc', 15)], small: m('durationSkill', 'inc', 4) },
    { name: '影にひそむ', mods: [m('evasion', 'more', 10), m('critChance', 'inc', 15)], small: m('dex', 'flat', 6) },
  ],
  monk: [
    { name: '速い拳', mods: [m('attackSpeed', 'inc', 12), m('dmgMelee', 'inc', 10)], small: m('attackSpeed', 'inc', 3) },
    { name: '内なる気', mods: [m('manaRegen', 'flat', 1.5), m('mana', 'inc', 10)], small: m('manaRegen', 'flat', 0.3) },
    { name: '柳の身', mods: [m('evasion', 'inc', 25), m('resPoison', 'flat', 10)], small: m('evasion', 'inc', 6) },
    { name: '気の拳', mods: [m('dmgHoly', 'inc', 20), m('dmgAttack', 'inc', 10)], small: m('dmgHoly', 'inc', 6) },
    { name: '仲間を守る構え', mods: [m('shieldPower', 'inc', 20), m('auraEffect', 'inc', 10)], small: m('shieldPower', 'inc', 5) },
    { name: '鍛えた体', mods: [m('life', 'inc', 10), m('vit', 'flat', 10)], small: m('vit', 'flat', 5) },
  ],
  priest: [
    { name: '慈愛', mods: [m('healPower', 'inc', 25), m('mana', 'flat', 20)], small: m('healPower', 'inc', 6) },
    { name: '守りの祈り', mods: [m('shieldPower', 'inc', 25), m('durationSkill', 'inc', 10)], small: m('shieldPower', 'inc', 6) },
    { name: '光の裁き', mods: [m('dmgHoly', 'inc', 25), m('castSpeed', 'inc', 6)], small: m('dmgHoly', 'inc', 6) },
    { name: '聖なる輪の心', mods: [m('auraEffect', 'inc', 15), m('resShadow', 'flat', 15)], small: m('auraEffect', 'inc', 4) },
    { name: '澄んだ魂', mods: [m('manaRegen', 'flat', 2), m('manaCost', 'inc', -8)], small: m('manaRegen', 'flat', 0.3) },
    { name: '祈りの持久', mods: [m('life', 'inc', 8), m('resPoison', 'flat', 15)], small: m('int', 'flat', 5) },
  ],
  necromancer: [
    { name: '骨の軍勢', mods: [m('minionCount', 'flat', 1), m('dmgMinion', 'inc', 10)], small: m('dmgMinion', 'inc', 6) },
    { name: '硬い骨', mods: [m('minionLife', 'inc', 30), m('armor', 'inc', 10)], small: m('minionLife', 'inc', 6) },
    { name: '闇の学び', mods: [m('dmgShadow', 'inc', 25), m('castSpeed', 'inc', 6)], small: m('dmgShadow', 'inc', 6) },
    { name: '腐れの手', mods: [m('dmgDot', 'inc', 25), m('durationSkill', 'inc', 10)], small: m('dmgDot', 'inc', 5) },
    { name: '死者の囁き', mods: [m('mana', 'inc', 12), m('manaRegen', 'flat', 1)], small: m('mana', 'inc', 4) },
    { name: '冷たい血', mods: [m('resCold', 'flat', 15), m('resShadow', 'flat', 15), m('life', 'inc', 6)], small: m('int', 'flat', 5) },
  ],
};

// 要（遊び方の決まりを変える）。rule はサーバーが処理を分ける短い id（calc.mjs の KNOWN_RULES と同じ書き方）、
// ruleDesc は画面に出す説明。KNOWN_RULES に既にある id: unwavering・lifeToMana・noCrit
export const keystones = {
  warrior: {
    name: '鉄の意志', mods: [m('moveSpeed', 'inc', -10)],
    rule: 'unwavering', ruleDesc: '気絶しなくなる。そのかわり、移動の速さが 10% 下がる。',
  },
  swordsman: {
    name: '剣聖の境地', mods: [m('blockChance', 'flat', -5)],
    rule: 'perfectParry', ruleDesc: '攻撃を防ぐか跳ね返すと、次の攻撃が必ず会心になる。そのかわり、防ぐ確率が 5% 下がる。',
  },
  rogue: {
    name: '静かな刃', mods: [m('critChance', 'inc', -30)],
    rule: 'shadowFirst', ruleDesc: '姿を消している間の最初の攻撃は、必ず会心になり、ダメージが 50% 多い。姿を消していないときの会心率は 30% 下がる。',
  },
  monk: {
    name: '二つの型', mods: [],
    rule: 'twoStances', ruleDesc: '構えを 2 つまで同時に保てる。そのかわり、どちらの構えも効き目が半分になる。',
  },
  priest: {
    name: '祈りの循環', mods: [m('healPower', 'more', -10)],
    rule: 'healEcho', ruleDesc: '仲間を回復すると、その量の 30% が自分にも戻る。そのかわり、回復の量が 10% 下がる。',
  },
  necromancer: {
    name: '死者の王', mods: [],
    rule: 'oneGreatMinion', ruleDesc: '召喚できる味方が 1 体だけになる。そのかわり、その 1 体の体力とダメージが 3 倍になる。',
  },
};

// となりの地域をつなぐ橋の目玉（regions の順で、i 番目と i+1 番目の間）
export const bridgeNotables = [
  { name: '刃と盾', mods: [m('dmgMelee', 'inc', 12), m('armor', 'inc', 12)] },
  { name: '素早い刃', mods: [m('attackSpeed', 'inc', 8), m('critChance', 'inc', 15)] },
  { name: '風のような足', mods: [m('moveSpeed', 'inc', 6), m('evasion', 'inc', 12)] },
  { name: '癒しの気', mods: [m('healPower', 'inc', 12), m('lifeRegen', 'flat', 1.5)] },
  { name: '生と死の境', mods: [m('dmgHoly', 'inc', 12), m('dmgShadow', 'inc', 12)] },
  { name: '屍の守り手', mods: [m('minionLife', 'inc', 15), m('armor', 'inc', 12)] },
];

// 中心の輪から出る、要への短い道（angle は輪のマスの向き）
export const centerPaths = [
  {
    id: 'ka', angle: -60,
    notable: { name: '魔力の泉', mods: [m('mana', 'inc', 15), m('manaRegen', 'flat', 1)] },
    keystone: {
      name: '魔力の器', mods: [m('manaRegen', 'inc', 30)],
      rule: 'lifeToMana', ruleDesc: '最大体力が 1 になり、そのぶん最大魔力が増える。受けるダメージは魔力から引かれる。魔力の回復が 30% 速くなる。',
    },
  },
  {
    id: 'kb', angle: 120,
    notable: { name: '渾身の力', mods: [m('dmg', 'inc', 10), m('str', 'flat', 8)] },
    keystone: {
      name: '会心なき一撃', mods: [m('dmg', 'more', 40)],
      rule: 'noCrit', ruleDesc: '会心が出なくなる。そのかわり、与えるダメージが 40% 多くなる。',
    },
  },
];
