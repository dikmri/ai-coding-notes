// 固有の品（決まった効果。どれも遊び方を変える rule を 1 つ持つ）
// mods は値が決まっている修正。rule はサーバーが処理を分ける短い id（calc.mjs の KNOWN_RULES と同じ書き方）、
// ruleDesc は画面に出す説明。
// dropFrom があればその魔物だけが落とす。無ければ level 以上の魔物がまれに落とす。

const m = (key, mode, value) => ({ key, mode, value });

export const uniques = [
  {
    id: 'u_ash_oath', base: 'long_sword', name: '灰の誓い', level: 10,
    mods: [m('dmgPhys', 'inc', 40), m('lifeLeech', 'flat', 2), m('str', 'flat', 10)],
    rule: 'killHeal', ruleDesc: '敵を倒すたびに、最大体力の 5% が戻る。',
    flavor: '灰になった町の名にかけて、最後の一体まで。',
  },
  {
    id: 'u_tongueless_bell', base: 'prayer_scepter', name: '舌のない鐘', level: 16,
    mods: [m('dmgHoly', 'inc', 30), m('stunChance', 'flat', 10), m('healPower', 'inc', 15)],
    rule: 'stunEcho', ruleDesc: '敵を気絶させると、その周り 2 マスの敵にも聖のダメージが広がる。',
    flavor: '鳴らない鐘にも、響きは残っている。',
  },
  {
    id: 'u_night_watch', base: 'leather_hood', name: '夜番の頭巾', level: 6,
    mods: [m('lightRadius', 'flat', 3), m('evasion', 'flat', 30), m('critChance', 'inc', 20)],
    rule: 'darkCrit', ruleDesc: '明かりの外にいる敵への攻撃は、会心率が 2 倍になる。',
    flavor: '夜番は眠らない。闇の中の目を数えている。',
  },
  {
    id: 'u_inverted_hourglass', base: 'silver_pendant', name: '逆さの砂時計', level: 14,
    mods: [m('cooldownRecovery', 'inc', 10), m('int', 'flat', 15)],
    rule: 'rewindOnLethal', ruleDesc: '倒れるほどのダメージを受けると、代わりに 3 秒前の位置と体力に戻る（60 秒に 1 回）。',
    flavor: '落ちた砂が、ときどき上へ戻っていく。',
  },
  {
    id: 'u_dead_mans_ring', base: 'obsidian_ring', name: '死者の指輪', level: 14,
    mods: [m('minionCount', 'flat', 1), m('dmgMinion', 'inc', 20)],
    rule: 'minionBurst', ruleDesc: '召喚した味方が倒れると、その場で破裂して周りの敵に闇のダメージを与える。',
    flavor: '持ち主はもういない。指輪にかけた術だけが今も残っている。',
  },
  {
    id: 'u_leech_fist', base: 'steel_knuckle', name: '吸い付く拳', level: 13,
    mods: [m('lifeLeech', 'flat', 6), m('attackSpeed', 'inc', 15)],
    rule: 'leechOnly', ruleDesc: '体力が自然に戻らない。そのかわり、与えたダメージから戻る体力が 2 倍になる。',
    flavor: '拳の内側に、小さな口が並んでいる。',
  },
  {
    id: 'u_mercy_robe', base: 'prayer_robe', name: '慈しみの法衣', level: 12,
    mods: [m('healPower', 'inc', 25), m('mana', 'flat', 30), m('resShadow', 'flat', 15)],
    rule: 'overhealShield', ruleDesc: '回復で最大体力を超えた分が、5 秒消えない盾になる（最大体力の 20% まで）。',
    flavor: '傷を負った者が着ると、縫い目がひとりでにほどけて傷を包む。',
  },
  {
    id: 'u_shadow_tread', base: 'traveler_boots', name: '影踏みの靴', level: 10,
    mods: [m('moveSpeed', 'inc', 15), m('dex', 'flat', 10)],
    rule: 'stealthOnKill', ruleDesc: '敵を倒すと 1.5 秒、姿が消える。',
    flavor: '足跡は、いつも一歩遅れて付く。',
  },
  {
    id: 'u_warden_greatblade', base: 'headsman_blade', name: '鐘守りの大剣', level: 24,
    mods: [m('dmgPhys', 'inc', 60), m('critChance', 'inc', 30), m('str', 'flat', 20)],
    rule: 'tollOnCrit', ruleDesc: '会心の一撃で、周り 3 マスの敵を 0.5 秒気絶させる。',
    flavor: '鐘を守った者は、鐘の音で敵を黙らせた。',
    dropFrom: ['bell_warden'],
  },
  {
    id: 'u_mirror_shield', base: 'tower_shield', name: '鏡写しの盾', level: 18,
    mods: [m('blockChance', 'flat', 10), m('armor', 'inc', 40)],
    rule: 'reflectBlocked', ruleDesc: '防いだ飛び道具は、投げた者へ跳ね返る。',
    flavor: '盾に映った敵は、自分の顔を見ることになる。',
  },
  {
    id: 'u_lantern_tome', base: 'old_tome', name: '灯火の魔導書', level: 8,
    mods: [m('lightRadius', 'flat', 2), m('dmgSpell', 'inc', 20)],
    rule: 'lightPower', ruleDesc: '明かりの範囲 1 マスごとに、呪文のダメージが 5% 増える。',
    flavor: '頁をめくるたびに、ろうそくが一本ともる。',
  },
];
