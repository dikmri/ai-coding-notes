// サーバーのテスト用の小さな見本のデータ（設計書 §13 と同じ形）。
// データの係のファイル（kanenaki/shared/data/**）には頼らない。本物のデータが無い項目の代わりにも使う。

const dmg = (type, lo, hi, extra = {}) => ({ type, base: [lo, hi], ...extra });

export const classes = {
  adventurer: { name: '冒険者', desc: '見習い', base: { str: 10, dex: 10, int: 8, vit: 10 }, perLevel: { str: 1, dex: 1, int: 1, vit: 1, life: 6, mana: 2 }, life: 60, mana: 30, skills: [], treeStart: 'st', art: 'adventurer' },
  swordsman: { name: '剣士', base: { str: 14, dex: 12, int: 6, vit: 12 }, perLevel: { str: 2, dex: 1, int: 0, vit: 2, life: 9, mana: 2 }, life: 80, mana: 30, skills: ['f_slash'], treeStart: 'gate_sw', art: 'swordsman' },
  warrior: { name: '戦士', base: { str: 16, dex: 8, int: 5, vit: 14 }, perLevel: { str: 2, dex: 1, int: 0, vit: 2, life: 10, mana: 1 }, life: 90, mana: 25, skills: [], art: 'warrior' },
  rogue: { name: '盗賊', base: { str: 10, dex: 16, int: 8, vit: 10 }, perLevel: { str: 1, dex: 2, int: 1, vit: 1, life: 7, mana: 3 }, life: 70, mana: 35, skills: [], art: 'rogue' },
  priest: { name: '司祭', base: { str: 8, dex: 8, int: 16, vit: 10 }, perLevel: { str: 0, dex: 1, int: 2, vit: 1, life: 6, mana: 5 }, life: 60, mana: 50, skills: [], art: 'priest' },
  necromancer: { name: 'ネクロマンサー', base: { str: 6, dex: 8, int: 18, vit: 9 }, perLevel: { str: 0, dex: 1, int: 2, vit: 1, life: 5, mana: 5 }, life: 55, mana: 55, skills: [], art: 'necromancer' },
  monk: { name: 'モンク', base: { str: 12, dex: 14, int: 10, vit: 11 }, perLevel: { str: 1, dex: 2, int: 1, vit: 1, life: 8, mana: 3 }, life: 75, mana: 35, skills: [], art: 'monk' },
};

const S = (id, target, effects, more = {}) => ({
  id, cls: 'adventurer', name: id, desc: '', unlock: 1, maxRank: 20, cost: { mana: 2, perRank: 0 }, cd: 0, cast: 0,
  range: 8, target, tags: ['spell'], effects, vfx: id, icon: id, ...more,
});

// すべての部品を 1 つずつ使う見本のスキル（冒険者が Lv1 から使える）
export const skills = {
  f_strike: S('f_strike', 'enemy', [{ op: 'hit', dmg: dmg('phys', 2, 4, { weapon: 1.2, perRank: 10 }) }, { op: 'debuff', id: 'stun', cc: 'stun', duration: 0.6 }], { range: 1.6, tags: ['attack', 'melee'] }),
  f_knife: S('f_knife', 'ground', [{ op: 'projectile', speed: 14, range: 9, count: 1, onHit: [{ op: 'hit', dmg: dmg('phys', 3, 5) }] }], { tags: ['attack', 'projectile'] }),
  f_firstaid: S('f_firstaid', 'self', [{ op: 'heal', pct: 20, target: 'self' }], { cd: 6 }),
  f_sprint: S('f_sprint', 'self', [{ op: 'buff', id: 'sprint', mods: [{ key: 'moveSpeed', mode: 'inc', value: 30, perRank: 2 }], duration: 4, target: 'self' }], { cd: 10 }),
  f_kick: S('f_kick', 'enemy', [{ op: 'hit', dmg: dmg('phys', 1, 2) }, { op: 'knockback', dist: 3 }], { range: 1.6, tags: ['attack', 'melee'] }),
  f_cleave: S('f_cleave', 'ground', [{ op: 'area', at: 'self', shape: 'cone', radius: 3, angle: 100, onHit: [{ op: 'hit', dmg: dmg('phys', 4, 6) }] }], { range: 3, tags: ['attack', 'melee', 'area'] }),
  f_line: S('f_line', 'ground', [{ op: 'area', at: 'self', shape: 'line', length: 6, width: 1.2, delay: 0.2, onHit: [{ op: 'hit', dmg: dmg('lightning', 3, 6) }] }]),
  f_fountain: S('f_fountain', 'ground', [{ op: 'zone', at: 'point', radius: 3, duration: 3, tick: 0.5, affects: 'allies', onTick: [{ op: 'heal', amount: 5, target: 'ally' }] }]),
  f_burn: S('f_burn', 'ground', [{ op: 'zone', at: 'point', radius: 2.5, duration: 2, tick: 0.5, affects: 'enemies', onTick: [{ op: 'hit', dmg: dmg('fire', 2, 2) }] }]),
  f_dash: S('f_dash', 'enemy', [{ op: 'dash', to: 'target', speed: 18, maxDist: 8, passHit: [{ op: 'hit', dmg: dmg('phys', 1, 1) }], onArrive: [{ op: 'hit', dmg: dmg('phys', 5, 5) }] }], { cd: 5, resetOnKill: true, tags: ['attack', 'melee'] }),
  f_blink: S('f_blink', 'ground', [{ op: 'blink', to: 'point', maxDist: 6 }], { cd: 3 }),
  f_behind: S('f_behind', 'enemy', [{ op: 'blink', to: 'behindTarget', maxDist: 8 }]),
  f_hook: S('f_hook', 'ground', [{ op: 'hook', speed: 16, range: 8, width: 0.5, onHit: [{ op: 'hit', dmg: dmg('phys', 2, 2) }] }]),
  f_vortex: S('f_vortex', 'ground', [{ op: 'vortex', at: 'point', radius: 4, strength: 3, duration: 1.5 }]),
  f_poison: S('f_poison', 'enemy', [{ op: 'dot', type: 'poison', dps: 4, duration: 3, maxStacks: 3 }]),
  f_shield: S('f_shield', 'self', [{ op: 'shield', amount: 30, duration: 5, target: 'self' }]),
  f_raise: S('f_raise', 'ground', [{ op: 'summon', unit: 'minion_skeleton', count: 2, max: 3, duration: 30 }]),
  f_aura: S('f_aura', 'self', [{ op: 'aura', radius: 8, mods: [{ key: 'armor', mode: 'flat', value: 50 }], affects: 'allies', reserve: 20 }]),
  f_trap: S('f_trap', 'ground', [{ op: 'trap', armTime: 0.3, duration: 20, triggerRadius: 1.2, max: 2, onTrigger: [{ op: 'area', at: 'point', shape: 'circle', radius: 2, onHit: [{ op: 'hit', dmg: dmg('fire', 6, 6) }] }] }]),
  f_wall: S('f_wall', 'ground', [{ op: 'wall', length: 5, duration: 3, at: 'point' }]),
  f_rewind: S('f_rewind', 'self', [{ op: 'rewind', seconds: 3 }]),
  f_stealth: S('f_stealth', 'self', [{ op: 'stealth', duration: 4, breakOnAttack: true }]),
  f_taunt: S('f_taunt', 'self', [{ op: 'taunt', radius: 6, duration: 3 }]),
  f_swap: S('f_swap', 'enemy', [{ op: 'swap' }]),
  f_revive: S('f_revive', 'self', [{ op: 'revive', radius: 6, hpPct: 50 }]),
  f_cheat: S('f_cheat', 'self', [{ op: 'cheatDeath', duration: 4, healAfterPct: 20 }]),
  f_mark: S('f_mark', 'enemy', [{ op: 'mark', duration: 5, mods: [{ key: 'armor', mode: 'more', value: -50 }] }]),
  f_execute: S('f_execute', 'enemy', [{ op: 'execute', thresholdPct: 30, dmg: dmg('shadow', 1, 1) }]),
  f_doom: S('f_doom', 'enemy', [{ op: 'delayed', delay: 0.5, effects: [{ op: 'hit', dmg: dmg('shadow', 7, 7) }] }]),
  f_stance: S('f_stance', 'self', [{ op: 'stance', group: 'form', mods: [{ key: 'armor', mode: 'flat', value: 20 }] }]),
  f_channel: S('f_channel', 'ground', [{ op: 'channel', duration: 1, tick: 0.25, onTick: [{ op: 'area', at: 'point', shape: 'circle', radius: 2, onHit: [{ op: 'hit', dmg: dmg('cold', 1, 1) }] }] }]),
  f_reflect: S('f_reflect', 'self', [{ op: 'reflect', duration: 3 }]),
  f_cleanse: S('f_cleanse', 'self', [{ op: 'cleanse', target: 'self' }]),
  f_leap: S('f_leap', 'ground', [{ op: 'leap', to: 'point', maxDist: 7, onLand: [{ op: 'area', at: 'point', shape: 'circle', radius: 2, onHit: [{ op: 'hit', dmg: dmg('phys', 3, 3) }] }] }]),
  f_clone: S('f_clone', 'self', [{ op: 'clone', duration: 5, count: 2, dmgPct: 50 }]),
  f_bounce: S('f_bounce', 'enemy', [{ op: 'bounce', jumps: 2, radius: 4, onHit: [{ op: 'hit', dmg: dmg('lightning', 3, 3) }] }]),
  f_teamshield: S('f_teamshield', 'self', [{ op: 'shield', amount: 20, duration: 5, radius: 6 }]),
  f_ally_heal: S('f_ally_heal', 'ally', [{ op: 'heal', amount: 30 }]),
  f_corpse: { ...S('f_corpse', 'ground', [{ op: 'area', at: 'point', shape: 'circle', radius: 2.5, onHit: [{ op: 'hit', dmg: dmg('shadow', 5, 5) }] }]), needsCorpse: true },
  f_slash: { ...S('f_slash', 'enemy', [{ op: 'hit', dmg: dmg('phys', 6, 9, { weapon: 1.5 }) }], { range: 1.6, tags: ['attack', 'melee'] }), cls: 'swordsman', unlock: 10 },
  // 魔物のスキル
  m_bolt: { ...S('m_bolt', 'enemy', [{ op: 'projectile', speed: 9, range: 9, onHit: [{ op: 'hit', dmg: dmg('cold', 3, 6) }, { op: 'debuff', id: 'chill', cc: 'slow', value: 30, duration: 2 }] }]), cls: 'monster', cd: 3 },
  m_raise: { ...S('m_raise', 'self', [{ op: 'summon', unit: 'bone_soldier', count: 1, max: 2, duration: 30 }]), cls: 'monster', cd: 8 },
  m_slam: { ...S('m_slam', 'self', [{ op: 'area', at: 'self', shape: 'circle', radius: 3.5, delay: 0.6, onHit: [{ op: 'hit', dmg: dmg('phys', 10, 16) }, { op: 'debuff', id: 'daze', cc: 'stun', duration: 1 }] }]), cls: 'monster', cd: 6, range: 3 },
};
for (const id of Object.keys(skills)) if (skills[id].cls === 'adventurer') classes.adventurer.skills.push(id);

// 小さなツリー: 出発点 st から 3 方向。剣士の門 gate_sw。
export const tree = {
  nodes: {
    st: { id: 'st', x: 0, y: 0, kind: 'start', name: '出発点', mods: [], links: ['a1', 'b1', 'c1'] },
    a1: { id: 'a1', x: 1, y: 0, kind: 'small', name: '力', mods: [{ key: 'str', mode: 'flat', value: 5 }], links: ['st', 'a2'] },
    a2: { id: 'a2', x: 2, y: 0, kind: 'notable', name: '鉄の腕', mods: [{ key: 'dmgMelee', mode: 'inc', value: 20 }], links: ['a1'] },
    b1: { id: 'b1', x: 0, y: 1, kind: 'small', name: '体力', mods: [{ key: 'life', mode: 'flat', value: 20 }], links: ['st', 'gate_sw'] },
    gate_sw: { id: 'gate_sw', x: 0, y: 2, kind: 'gate', cls: 'swordsman', name: '剣士の門', mods: [{ key: 'str', mode: 'flat', value: 10 }], links: ['b1', 'sw1'] },
    sw1: { id: 'sw1', x: 0, y: 3, kind: 'small', cls: 'swordsman', name: '剣の心得', mods: [{ key: 'attackSpeed', mode: 'inc', value: 5 }], links: ['gate_sw'] },
    c1: { id: 'c1', x: -1, y: 0, kind: 'small', name: '器用', mods: [{ key: 'dex', mode: 'flat', value: 5 }], links: ['st', 'k1'] },
    k1: { id: 'k1', x: -2, y: 0, kind: 'keystone', name: '無心', mods: [{ key: 'dmg', mode: 'more', value: 30 }], rule: 'noCrit', links: ['c1'] },
  },
  starts: { adventurer: 'st', swordsman: 'gate_sw' },
};

export const bases = [
  { id: 'short_sword', name: '短い剣', slot: 'weapon', kind: 'sword', w: 1, h: 3, level: 1, dmg: [3, 6], speed: 1.4, icon: 'short_sword', price: 20 },
  { id: 'dagger', name: '短剣', slot: 'weapon', kind: 'dagger', w: 1, h: 2, level: 1, dmg: [2, 5], speed: 1.7, icon: 'dagger' },
  { id: 'oak_staff', name: '樫の杖', slot: 'weapon', kind: 'staff', w: 1, h: 4, level: 2, dmg: [4, 8], speed: 1.1, implicit: [{ key: 'dmgSpell', mode: 'inc', value: 10 }], icon: 'oak_staff' },
  { id: 'leather_cap', name: '革の帽子', slot: 'head', kind: 'helm', w: 2, h: 2, level: 1, armor: 5, icon: 'leather_cap' },
  { id: 'tunic', name: '布の服', slot: 'body', kind: 'armor', w: 2, h: 3, level: 1, armor: 12, icon: 'tunic' },
  { id: 'gloves', name: '手袋', slot: 'hands', kind: 'gloves', w: 2, h: 2, level: 1, armor: 3, icon: 'gloves' },
  { id: 'boots', name: '長靴', slot: 'feet', kind: 'boots', w: 2, h: 2, level: 1, armor: 4, icon: 'boots' },
  { id: 'sash', name: '帯', slot: 'belt', kind: 'belt', w: 2, h: 1, level: 1, icon: 'sash' },
  { id: 'amulet', name: '首飾り', slot: 'neck', kind: 'amulet', w: 1, h: 1, level: 3, icon: 'amulet' },
  { id: 'ring', name: '指輪', slot: 'ring', kind: 'ring', w: 1, h: 1, level: 2, icon: 'ring' },
  { id: 'buckler', name: '小盾', slot: 'offhand', kind: 'shield', w: 2, h: 2, level: 1, armor: 8, implicit: [{ key: 'blockChance', mode: 'flat', value: 10 }], icon: 'buckler' },
];
export const consumables = [
  { id: 'potion_life', name: '回復薬', w: 1, h: 1, stack: 10, price: 10, use: { healPct: 40 }, icon: 'potion_life' },
  { id: 'potion_mana', name: '魔力の薬', w: 1, h: 1, stack: 10, price: 10, use: { manaPct: 40 }, icon: 'potion_mana' },
  { id: 'scroll_return', name: '帰還の巻物', w: 1, h: 1, stack: 10, price: 25, use: { portal: true }, icon: 'scroll_return' },
  { id: 'oblivion_water', name: '忘却の聖水', w: 1, h: 1, stack: 5, price: 200, use: { respec: true }, icon: 'oblivion_water' },
  { id: 'herb', name: '沼の薬草', w: 1, h: 1, stack: 20, price: 1, kind: 'quest', icon: 'herb' },
];
export const affixes = [
  { id: 'p_sharp', kind: 'prefix', name: '鋭い', slots: ['weapon'], level: 1, weight: 100, mods: [{ key: 'dmg', mode: 'inc', value: [10, 25] }] },
  { id: 'p_sturdy', kind: 'prefix', name: '頑丈な', slots: ['head', 'body', 'hands', 'feet', 'offhand'], level: 1, weight: 100, mods: [{ key: 'armor', mode: 'flat', value: [5, 15] }] },
  { id: 'p_healthy', kind: 'prefix', name: '丈夫な', slots: ['head', 'body', 'belt', 'ring', 'neck'], level: 1, weight: 100, mods: [{ key: 'life', mode: 'flat', value: [5, 20] }] },
  { id: 'p_fiery', kind: 'prefix', name: '熱い', slots: ['weapon', 'ring'], level: 3, weight: 50, mods: [{ key: 'dmgFire', mode: 'flat', value: [1, 4] }] },
  { id: 's_fox', kind: 'suffix', name: '狐', slots: ['any'], level: 1, weight: 100, mods: [{ key: 'dex', mode: 'flat', value: [2, 6] }] },
  { id: 's_bear', kind: 'suffix', name: '熊', slots: ['any'], level: 1, weight: 100, mods: [{ key: 'str', mode: 'flat', value: [2, 6] }] },
  { id: 's_ember', kind: 'suffix', name: '残り火', slots: ['any'], level: 1, weight: 80, mods: [{ key: 'resFire', mode: 'flat', value: [5, 15] }] },
  { id: 's_swift', kind: 'suffix', name: '疾風', slots: ['weapon', 'hands', 'feet'], level: 2, weight: 60, mods: [{ key: 'attackSpeed', mode: 'inc', value: [3, 8] }] },
];
export const uniques = [
  { id: 'u_bellbreaker', base: 'short_sword', name: '鐘割り', level: 1, mods: [{ key: 'dmg', mode: 'inc', value: 40 }, { key: 'str', mode: 'flat', value: 8 }], flavor: '砕けた鐘の欠片で打たれた剣' },
];

const M = (id, level, life, lo, hi, more = {}) => ({ id, name: id, level, life, dmg: [lo, hi], dmgType: 'phys', speed: 3, range: 1.3, ai: 'melee', skills: [], xp: level * 12, art: id, ...more });
export const monsters = {
  stray_dog: M('stray_dog', 1, 20, 1, 3, { name: '野良犬', speed: 4.5 }),
  bone_soldier: M('bone_soldier', 2, 30, 2, 4, { name: '骨の兵' }),
  mud_imp: M('mud_imp', 2, 16, 1, 3, { name: '泥小鬼', ai: 'swarm' }),
  mud_imp_slinger: M('mud_imp_slinger', 3, 18, 2, 4, { name: '泥小鬼の投石兵', ai: 'ranged', range: 6 }),
  mist_witch: M('mist_witch', 4, 25, 2, 4, { name: '霧の魔女', ai: 'caster', range: 7, skills: ['m_bolt'], dmgType: 'cold' }),
  cursed_acolyte: M('cursed_acolyte', 5, 30, 2, 5, { name: '呪われた侍祭', ai: 'summoner', range: 6, skills: ['m_raise'] }),
  bell_warden: M('bell_warden', 8, 400, 8, 14, { name: '鐘守りの亡者', ai: 'boss', boss: true, skills: ['m_slam'], xp: 600 }),
  minion_skeleton: M('minion_skeleton', 1, 30, 2, 4, { name: '骨の兵（味方）', minion: true }),
  minion_skeleton_archer: M('minion_skeleton_archer', 1, 20, 2, 3, { name: '骨の射手（味方）', minion: true, ai: 'ranged', range: 6 }),
};

// 精鋭の性質（本物のデータの eliteMods と同じ形）
export const eliteMods = [
  { id: 'swift', name: '素早い', mods: [{ key: 'moveSpeed', mode: 'inc', value: 40 }, { key: 'attackSpeed', mode: 'inc', value: 35 }] },
  { id: 'armored', name: '硬い', mods: [{ key: 'armor', mode: 'more', value: 120 }, { key: 'life', mode: 'more', value: 40 }] },
  { id: 'vampiric', name: '血を吸う', mods: [{ key: 'lifeLeech', mode: 'flat', value: 25 }] },
  { id: 'caster', name: '霧を呼ぶ', mods: [], skills: ['m_bolt'] },
];

const townRows = [
  '########################',
  '#cccccccccccccccccccccc#',
  '#c....................c#',
  '#c..H.................c#',
  '#c....................c#',
  '#c.........cc.........c#',
  '#c.........cc..........#',
  '#c.........cc..........#',
  '#c....................c#',
  '#c..~~................c#',
  '#c..~~................c#',
  '#c....................c#',
  '#cccccccccccccccccccccc#',
  '########################',
];
export const maps = {
  town: {
    id: 'town', name: '灰鐘の町', w: 24, h: 14, light: 'day', safe: true,
    rows: townRows,
    legend: { '#': { ground: 'wall_town' }, c: { ground: 'cobble' }, '.': { ground: 'grass' }, '~': { ground: 'water' }, H: { ground: 'grass', prop: 'house_a', solid: true } },
    spawns: [],
    portals: [{ id: 'to_road', x: 22, y: 6, to: { map: 'road', portal: 'from_town' } }],
    npcs: [
      { id: 'npc_innkeeper', x: 6, y: 2 }, { id: 'npc_smith', x: 9, y: 2 }, { id: 'npc_apothecary', x: 12, y: 2 },
      { id: 'npc_bellkeeper', x: 15, y: 2 }, { id: 'npc_master_swordsman', x: 18, y: 2 }, { id: 'npc_warp', x: 20, y: 8 },
    ],
    props: [],
  },
  road: {
    id: 'road', name: '枯れ野の街道', w: 64, h: 64, light: 'dusk',
    gen: { type: 'field', seed: 'fixture-road', ponds: 2 },
    spawns: [
      { monsters: ['stray_dog'], x: 20, y: 32, r: 4, count: 3, respawn: 10 },
      { monsters: ['bone_soldier', 'mud_imp'], x: 40, y: 20, r: 5, count: 4, respawn: 15 },
      { monsters: ['mud_imp_slinger', 'mist_witch'], x: 44, y: 44, r: 4, count: 2, respawn: 20 },
      { monsters: ['cursed_acolyte'], x: 30, y: 50, r: 3, count: 1, respawn: 30 },
    ],
    portals: [{ id: 'from_town', x: 1, y: 32, to: { map: 'town', portal: 'to_road' } }, { id: 'to_tower', x: 62, y: 32, to: { map: 'tower1', portal: 'up' } }],
    npcs: [],
    props: [],
  },
  tower1: {
    id: 'tower1', name: '沈んだ鐘楼 1 階', w: 48, h: 48, light: 'dark',
    gen: { type: 'dungeon', seed: 'fixture-tower', rooms: 6 },
    spawns: [{ monsters: ['bone_soldier'], r: 2, count: 2, respawn: 30 }, { monsters: ['bell_warden'], at: 'boss', r: 1, count: 1, respawn: 120 }],
    portals: [{ id: 'up', at: 'entrance', to: { map: 'road', portal: 'to_tower' } }],
    npcs: [],
    props: [],
  },
};

export const npcs = {
  npc_innkeeper: { id: 'npc_innkeeper', name: '宿屋の女主人', art: 'npc_innkeeper', role: 'inn', lines: ['ゆっくり休んでいきな。'] },
  npc_smith: { id: 'npc_smith', name: '鍛冶屋', art: 'npc_smith', role: 'smith', shop: ['short_sword', 'dagger', 'leather_cap', 'tunic', 'buckler'], lines: ['いい鉄が入ったぞ。'] },
  npc_apothecary: { id: 'npc_apothecary', name: '薬師', art: 'npc_apothecary', role: 'apothecary', shop: ['potion_life', 'potion_mana', 'scroll_return', 'oblivion_water'], lines: ['薬はいるかい。'] },
  npc_bellkeeper: { id: 'npc_bellkeeper', name: '鐘番の老人', art: 'npc_bellkeeper', role: 'story', lines: ['鐘が鳴らなくなって久しい。'] },
  npc_master_swordsman: { id: 'npc_master_swordsman', name: '剣の師範', art: 'npc_master_swordsman', role: 'master', cls: 'swordsman', lines: ['剣の道を歩むか。'] },
  npc_warp: { id: 'npc_warp', name: 'ワープの番人', art: 'npc_warp', role: 'warp', lines: ['どこへ行く。'] },
};

export const quests = {
  q_bones: { id: 'q_bones', name: '骨の兵を倒す', giver: 'npc_bellkeeper', desc: '街道の骨の兵を 3 体倒す', needs: { kill: { bone_soldier: 3 } }, reward: { xp: 200, gold: 50 } },
  q_herbs: { id: 'q_herbs', name: '薬草を集める', giver: 'npc_bellkeeper', desc: '沼の薬草を 2 つ', needs: { collect: { herb: 2 } }, reward: { xp: 100, items: ['potion_life'] }, requires: 'q_bones' },
};

export const phrases = ['こんにちは', 'ありがとう', '手伝ってください', 'いいね', 'さようなら'];
export const stamps = [{ id: 'smile', name: '笑顔', art: 'stamp_smile' }, { id: 'bow', name: 'おじぎ', art: 'stamp_bow' }];
export const nameParts = { first: ['アル', 'ベル', 'カイ', 'ドル', 'エン'], last: ['ン', 'ト', 'ラ', 'ク', 'ム'] };
