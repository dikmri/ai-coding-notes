// スキル（冒険者 6、各職 11、魔物のスキル）
// 効果は schema.mjs の OPS の部品だけで作る。1 つの効果は { op: '<部品の名前>', ...引数 }。
// 入れ子の効果は onHit / onTick / passHit / onArrive / onLand / onTrigger / effects に入れる。
// ダメージ: dmg = { type, base:[min,max], weapon: 武器のダメージの倍率, perRank: ランクごとの増え方(%), scale: 能力値 }
// perRank は「ランク 1 から 1 上がるごとに何 % 増えるか」。cdPerRank は「ランクごとに待ち時間が何秒減るか」。
// 効果の対象: 部品に target / affects が無いときは、スキルの対象（敵・味方・自分）にかかる。
// tags の役目: offense 攻め / defense 守り / support 支援 / mobility 動き / ultimate 切り札
// 魔物のスキルは cls: 'monster'。id は m_ で始める。

export const skillTags = Object.freeze({
  offense: '攻め', defense: '守り', support: '支援', mobility: '動き', ultimate: '切り札',
  attack: '武器の攻撃', spell: '呪文', melee: '近接', projectile: '飛び道具', area: '範囲',
  buff: '強化', heal: '回復', summon: '召喚', aura: 'オーラ', stance: '構え', trap: '罠',
  control: '足止め', channel: '押し続ける', light: '明かり', monster: '魔物',
});

/* ---------------- 小さな組み立ての道具 ---------------- */
const dmg = (type, base, weapon, perRank, scale) => {
  const d = { type, base, perRank };
  if (weapon) d.weapon = weapon;
  if (scale) d.scale = scale;
  return d;
};
const hit = (d, extra = {}) => ({ op: 'hit', dmg: d, ...extra });
const stun = (duration) => ({ op: 'debuff', id: 'stun', cc: 'stun', duration });
const slow = (value, duration) => ({ op: 'debuff', id: 'slow', cc: 'slow', value, duration });
const root = (duration) => ({ op: 'debuff', id: 'root', cc: 'root', duration });
const mod = (key, mode, value, perRank) => (perRank === undefined ? { key, mode, value } : { key, mode, value, perRank });

/* ---------------- 冒険者（全員が使える 6 個） ---------------- */
const adventurer = [
  {
    id: 'adv_bash', name: '強打', desc: '武器で力いっぱい打つ。普通の攻撃より大きなダメージを与える。',
    unlock: 1, cost: { mana: 3, perRank: 0.2 }, cd: 0, cast: 0.4, range: 1.4, target: 'enemy',
    tags: ['offense', 'attack', 'melee'],
    effects: [hit(dmg('phys', [1, 3], 1.5, 6, 'str'))],
    vfx: 'slash_heavy',
  },
  {
    id: 'adv_throw_knife', name: '投げナイフ', desc: '小さなナイフを投げる。離れた敵に当たる。',
    unlock: 2, cost: { mana: 3, perRank: 0.2 }, cd: 0.6, cast: 0.3, range: 8, target: 'dir',
    tags: ['offense', 'attack', 'projectile'],
    effects: [{ op: 'projectile', speed: 14, range: 8, onHit: [hit(dmg('phys', [3, 6], 0.5, 7, 'dex'))] }],
    vfx: 'knife',
  },
  {
    id: 'adv_first_aid', name: '応急手当', desc: '傷に布を巻く。5 秒かけて体力が戻る。',
    unlock: 3, cost: { mana: 6, perRank: 0.3 }, cd: 12, cdPerRank: 0.2, cast: 0.6, range: 0, target: 'self',
    tags: ['defense', 'heal'],
    effects: [{ op: 'buff', id: 'first_aid', mods: [mod('lifeRegen', 'flat', 4, 0.6)], duration: 5, target: 'self' }],
    vfx: 'bandage',
  },
  {
    id: 'adv_sprint', name: '駆け足', desc: '少しの間、速く走る。',
    unlock: 4, cost: { mana: 5 }, cd: 14, cdPerRank: 0.25, cast: 0, range: 0, target: 'self',
    tags: ['mobility', 'buff'],
    effects: [{ op: 'buff', id: 'sprint', mods: [mod('moveSpeed', 'inc', 35, 1.5)], duration: 4, target: 'self' }],
    vfx: 'dust',
  },
  {
    id: 'adv_kick', name: '蹴り', desc: '敵を蹴って押し返し、少しのあいだ気絶させる。',
    unlock: 5, cost: { mana: 4, perRank: 0.2 }, cd: 6, cast: 0.3, range: 1.4, target: 'enemy',
    tags: ['offense', 'attack', 'melee', 'control'],
    effects: [hit(dmg('phys', [2, 4], 0.6, 6, 'str')), { op: 'knockback', dist: 2 }, stun(0.6)],
    vfx: 'kick',
  },
  {
    id: 'adv_torch', name: 'たいまつ', desc: 'たいまつに火をつける。明かりの範囲が広がり、闇の攻撃に少し強くなる。',
    unlock: 6, cost: { mana: 4 }, cd: 20, cast: 0.5, range: 0, target: 'self',
    tags: ['support', 'buff', 'light'],
    effects: [{
      op: 'buff', id: 'torch', duration: 90, target: 'self',
      mods: [mod('lightRadius', 'flat', 3, 0.15), mod('resShadow', 'flat', 5, 0.5)],
    }],
    vfx: 'torch_glow',
  },
];

/* ---------------- 剣士: 速い連撃と、構えで受ける剣 ---------------- */
const swordsman = [
  {
    id: 'swd_lunge', name: '踏み込み斬り',
    desc: '敵へ踏み込んで斬る。この一撃で敵を倒すと、待ち時間がすぐに戻る。',
    unlock: 10, cost: { mana: 6, perRank: 0.3 }, cd: 6, cdPerRank: 0.1, cast: 0, range: 6, target: 'enemy',
    tags: ['offense', 'mobility', 'attack', 'melee'], resetOnKill: true,
    effects: [{ op: 'dash', to: 'target', speed: 18, maxDist: 6, onArrive: [hit(dmg('phys', [4, 8], 1.3, 7, 'str'))] }],
    vfx: 'dash_slash',
  },
  {
    id: 'swd_cross_slash', name: '交差斬り', desc: '前の扇の範囲を 2 度斬る。斬られた敵は 3 秒血を流す。',
    unlock: 10, cost: { mana: 7, perRank: 0.3 }, cd: 3, cast: 0.35, range: 2.6, target: 'dir',
    tags: ['offense', 'attack', 'melee', 'area'],
    effects: [{
      op: 'area', at: 'self', shape: 'cone', radius: 2.6, angle: 100,
      onHit: [hit(dmg('phys', [3, 7], 1.2, 7, 'str')), { op: 'dot', type: 'phys', dps: 3, perRank: 10, duration: 3, maxStacks: 3 }],
    }],
    vfx: 'cross_slash',
  },
  {
    id: 'swd_parry', name: '受け流しの構え', desc: '1.5 秒、剣を構える。その間に飛んできた矢や呪文を跳ね返し、近接の攻撃も防ぎやすくなる。',
    unlock: 12, cost: { mana: 8 }, cd: 14, cdPerRank: 0.25, cast: 0, range: 0, target: 'self',
    tags: ['defense', 'buff'],
    effects: [
      { op: 'reflect', duration: 1.5 },
      { op: 'buff', id: 'parry', mods: [mod('blockChance', 'flat', 40, 1)], duration: 1.5, target: 'self' },
    ],
    vfx: 'parry',
  },
  {
    id: 'swd_wind_step', name: '風歩き', desc: '近くの地点へ一瞬で移る。移った直後は攻撃をよけやすい。',
    unlock: 12, cost: { mana: 6 }, cd: 9, cdPerRank: 0.15, cast: 0, range: 5, target: 'ground',
    tags: ['mobility'],
    effects: [
      { op: 'blink', to: 'point', maxDist: 5 },
      { op: 'buff', id: 'wind_step', mods: [mod('evasion', 'inc', 30, 2)], duration: 2, target: 'self' },
    ],
    vfx: 'wind',
  },
  {
    id: 'swd_spin', name: '独楽斬り', desc: '押している間、回りながら周りを斬り続ける。動きながら使える。',
    unlock: 15, cost: { mana: 12, perRank: 0.4 }, cd: 10, cast: 0, range: 0, target: 'self',
    tags: ['offense', 'attack', 'melee', 'area', 'channel'],
    effects: [{
      op: 'channel', duration: 2, tick: 0.25,
      onTick: [{ op: 'area', at: 'self', shape: 'circle', radius: 2, onHit: [hit(dmg('phys', [1, 3], 0.45, 6, 'str'))] }],
    }],
    vfx: 'spin',
  },
  {
    id: 'swd_challenge', name: '一騎打ちの誓い', desc: '1 体の敵に印を付ける。印の敵は防御が下がり、自分は与えたダメージの一部を体力に変える。',
    unlock: 18, cost: { mana: 10 }, cd: 16, cast: 0.2, range: 6, target: 'enemy',
    tags: ['support', 'offense'],
    effects: [
      { op: 'mark', duration: 6, mods: [mod('armor', 'inc', -30, -1)] },
      { op: 'buff', id: 'challenge', duration: 6, target: 'self', mods: [mod('lifeLeech', 'flat', 3, 0.2), mod('dmg', 'inc', 10, 1)] },
    ],
    vfx: 'challenge',
  },
  {
    id: 'swd_iai', name: '居合', desc: '一瞬ためてから、前へ一直線に斬り抜く。線の上の敵すべてに大きなダメージ。',
    unlock: 20, cost: { mana: 14, perRank: 0.5 }, cd: 8, cast: 0.2, range: 7, target: 'dir',
    tags: ['offense', 'attack', 'melee', 'area'],
    effects: [{ op: 'area', at: 'self', shape: 'line', length: 7, width: 1.2, delay: 0.5, onHit: [hit(dmg('phys', [10, 16], 2.4, 8, 'str'))] }],
    vfx: 'iai_line',
  },
  {
    id: 'swd_counter', name: '返し刃', desc: '1.8 秒、攻撃をとてもよけやすくなる。終わると周りを斬り、当たった敵を気絶させる。',
    unlock: 22, cost: { mana: 10 }, cd: 15, cdPerRank: 0.2, cast: 0, range: 0, target: 'self',
    tags: ['defense', 'control'],
    effects: [
      { op: 'buff', id: 'counter', mods: [mod('evasion', 'more', 400)], duration: 1.8, target: 'self' },
      { op: 'delayed', delay: 1.8, effects: [{ op: 'area', at: 'self', shape: 'circle', radius: 2.5, onHit: [hit(dmg('phys', [6, 10], 1.0, 7, 'str')), stun(1)] }] },
    ],
    vfx: 'counter',
  },
  {
    id: 'swd_thousand', name: '千刃', desc: '敵の背後へ跳び、周りの敵の間を跳び回りながら 4 度斬る。',
    unlock: 24, cost: { mana: 30, perRank: 1 }, cd: 60, cdPerRank: 1, cast: 0, range: 6, target: 'enemy',
    tags: ['ultimate', 'offense', 'attack', 'melee', 'area', 'mobility'],
    effects: [
      { op: 'blink', to: 'behindTarget', maxDist: 6 },
      hit(dmg('phys', [8, 14], 1.2, 8, 'dex')),
      ...[0.2, 0.4, 0.6].map((delay) => ({
        op: 'delayed', delay,
        effects: [{ op: 'area', at: 'self', shape: 'circle', radius: 3.5, onHit: [hit(dmg('phys', [6, 10], 0.9, 8, 'dex'))] }],
      })),
    ],
    vfx: 'thousand',
  },
  {
    id: 'swd_gale', name: '巻き風の太刀', desc: '地点に風の渦を起こして敵を中心へ集め、1.2 秒後にまとめて斬る。',
    unlock: 28, cost: { mana: 18, perRank: 0.5 }, cd: 18, cdPerRank: 0.2, cast: 0.3, range: 6, target: 'ground',
    tags: ['offense', 'control', 'area'],
    effects: [
      { op: 'vortex', at: 'point', radius: 4, strength: 4, duration: 1.2 },
      { op: 'area', at: 'point', shape: 'circle', radius: 2.5, delay: 1.2, onHit: [hit(dmg('phys', [12, 20], 1.6, 8, 'str'))] },
    ],
    vfx: 'gale',
  },
  {
    id: 'swd_blade_aura', name: '剣気の陣', desc: '切り替え式。近くの仲間の攻撃の速さと命中が上がる。魔力の一部を使い続ける。',
    unlock: 30, cost: { mana: 0 }, cd: 1, cast: 0, range: 0, target: 'self',
    tags: ['support', 'aura'],
    effects: [{ op: 'aura', radius: 7, affects: 'allies', reserve: 20, mods: [mod('attackSpeed', 'inc', 8, 0.5), mod('accuracy', 'inc', 10, 1)] }],
    vfx: 'aura_blade',
  },
];

/* ---------------- 戦士: 引き寄せて、まとめて受け止める ---------------- */
const warrior = [
  {
    id: 'war_cleave', name: '大振り', desc: '武器を大きく振り、前の広い範囲を斬る。',
    unlock: 10, cost: { mana: 4, perRank: 0.1 }, cd: 0, cast: 0.45, range: 2.6, target: 'dir',
    tags: ['offense', 'attack', 'melee', 'area'],
    effects: [{ op: 'area', at: 'self', shape: 'cone', radius: 2.6, angle: 120, onHit: [hit(dmg('phys', [3, 6], 1.3, 7, 'str'))] }],
    vfx: 'cleave',
  },
  {
    id: 'war_chain_hook', name: '鎖の鉤', desc: '鉤の付いた鎖を投げる。最初に当たった敵を手元へ引き寄せ、少し気絶させる。',
    unlock: 10, cost: { mana: 10, perRank: 0.3 }, cd: 12, cdPerRank: 0.2, cast: 0.3, range: 8, target: 'dir',
    tags: ['offense', 'control', 'projectile'],
    effects: [{ op: 'hook', speed: 16, range: 8, width: 0.5, onHit: [hit(dmg('phys', [6, 10], 0.8, 7, 'str')), stun(0.4)] }],
    vfx: 'chain',
  },
  {
    id: 'war_war_cry', name: '不退の雄叫び', desc: '叫んで周りの敵の注意を自分に集める。少しの間、防御が上がる。',
    unlock: 12, cost: { mana: 10 }, cd: 14, cdPerRank: 0.2, cast: 0.2, range: 0, target: 'self',
    tags: ['defense', 'control'],
    effects: [
      { op: 'taunt', radius: 4, duration: 3 },
      { op: 'buff', id: 'war_cry', mods: [mod('armor', 'inc', 40, 3)], duration: 4, target: 'self' },
    ],
    vfx: 'roar',
  },
  {
    id: 'war_charge', name: '猛進', desc: '地点まで突っ込む。途中の敵ははじき飛ばし、着いた所の敵を気絶させる。',
    unlock: 12, cost: { mana: 8 }, cd: 10, cdPerRank: 0.15, cast: 0, range: 7, target: 'ground',
    tags: ['mobility', 'offense', 'control'],
    effects: [{
      op: 'dash', to: 'point', speed: 15, maxDist: 7,
      passHit: [hit(dmg('phys', [4, 8], 0.6, 6, 'str')), { op: 'knockback', dist: 1.5 }],
      onArrive: [{ op: 'area', at: 'self', shape: 'circle', radius: 1.8, onHit: [stun(0.8)] }],
    }],
    vfx: 'charge',
  },
  {
    id: 'war_rock_skin', name: '岩肌', desc: '体を固くする。6 秒、ダメージを吸う盾ができ、防御も大きく上がる。',
    unlock: 15, cost: { mana: 12 }, cd: 18, cdPerRank: 0.25, cast: 0.3, range: 0, target: 'self',
    tags: ['defense', 'buff'],
    effects: [
      { op: 'shield', amount: 40, perRank: 12, duration: 6, target: 'self' },
      { op: 'buff', id: 'rock_skin', mods: [mod('armor', 'more', 30, 1.5)], duration: 6, target: 'self' },
    ],
    vfx: 'rock_skin',
  },
  {
    id: 'war_stomp', name: '踏み鳴らし', desc: '地面を踏み鳴らす。周りの敵にダメージを与え、2 秒遅くする。',
    unlock: 18, cost: { mana: 10, perRank: 0.3 }, cd: 8, cast: 0.3, range: 0, target: 'self',
    tags: ['offense', 'control', 'area'],
    effects: [{ op: 'area', at: 'self', shape: 'circle', radius: 3, onHit: [hit(dmg('phys', [6, 10], 0.8, 7, 'str')), slow(40, 2)] }],
    vfx: 'stomp',
  },
  {
    id: 'war_fissure', name: '地割れ', desc: '前へ地面を割る。線の上の敵を気絶させ、割れ目は 4 秒、歩けない壁になる。',
    unlock: 20, cost: { mana: 16, perRank: 0.5 }, cd: 14, cdPerRank: 0.2, cast: 0.4, range: 8, target: 'dir',
    tags: ['control', 'offense', 'defense', 'area'],
    effects: [
      { op: 'area', at: 'self', shape: 'line', length: 8, width: 1, onHit: [hit(dmg('phys', [10, 16], 1.0, 7, 'str')), stun(0.8)] },
      { op: 'wall', length: 8, duration: 4, at: 'point' },
    ],
    vfx: 'fissure',
  },
  {
    id: 'war_bloodlust', name: '血の昂ぶり', desc: '8 秒、攻撃が速くなり、与えたダメージの一部を体力に変える。その間は防御が下がる。',
    unlock: 22, cost: { mana: 8 }, cd: 20, cdPerRank: 0.3, cast: 0, range: 0, target: 'self',
    tags: ['offense', 'buff'],
    effects: [{
      op: 'buff', id: 'bloodlust', duration: 8, target: 'self',
      mods: [mod('attackSpeed', 'inc', 20, 1), mod('lifeLeech', 'flat', 3, 0.2), mod('armor', 'inc', -20)],
    }],
    vfx: 'blood',
  },
  {
    id: 'war_bell_drop', name: '鐘落とし', desc: '高く跳び、落ちる鐘のように地点へ降りる。周りの敵に大きなダメージを与え、2 秒気絶させる。',
    unlock: 24, cost: { mana: 30, perRank: 1 }, cd: 60, cdPerRank: 1, cast: 0.2, range: 6, target: 'ground',
    tags: ['ultimate', 'offense', 'control', 'area', 'mobility'],
    effects: [{
      op: 'leap', to: 'point', maxDist: 6,
      onLand: [{ op: 'area', at: 'self', shape: 'circle', radius: 4, onHit: [hit(dmg('phys', [20, 32], 2.0, 8, 'str')), stun(2)] }],
    }],
    vfx: 'bell_drop',
  },
  {
    id: 'war_banner', name: '軍旗の誓い', desc: '切り替え式。近くの仲間の防御と体力の回復が上がる。魔力の一部を使い続ける。',
    unlock: 28, cost: { mana: 0 }, cd: 1, cast: 0, range: 0, target: 'self',
    tags: ['support', 'aura', 'defense'],
    effects: [{ op: 'aura', radius: 7, affects: 'allies', reserve: 20, mods: [mod('armor', 'inc', 20, 1), mod('lifeRegen', 'flat', 1, 0.1)] }],
    vfx: 'banner',
  },
  {
    id: 'war_beheader', name: '断頭の一撃', desc: '重い一撃。打ったあと敵の体力が 15% 以下なら、そのまま倒す。',
    unlock: 30, cost: { mana: 16, perRank: 0.5 }, cd: 12, cdPerRank: 0.2, cast: 0.5, range: 1.6, target: 'enemy',
    tags: ['offense', 'attack', 'melee'],
    effects: [hit(dmg('phys', [12, 20], 1.8, 8, 'str')), { op: 'execute', thresholdPct: 15 }],
    vfx: 'execute',
  },
];

/* ---------------- 盗賊: 時を盗み、影で入れ替わる ---------------- */
const rogue = [
  {
    id: 'rog_backstab', name: '背刺し', desc: '敵の背後へ回り込んで刺す。',
    unlock: 10, cost: { mana: 7, perRank: 0.3 }, cd: 5, cdPerRank: 0.1, cast: 0, range: 3, target: 'enemy',
    tags: ['offense', 'mobility', 'attack', 'melee'],
    effects: [{ op: 'blink', to: 'behindTarget', maxDist: 3 }, hit(dmg('phys', [4, 8], 1.8, 8, 'dex'))],
    vfx: 'backstab',
  },
  {
    id: 'rog_fan_knives', name: '扇投げ', desc: '5 本のナイフを扇の形に投げる。',
    unlock: 10, cost: { mana: 7, perRank: 0.3 }, cd: 2, cast: 0.35, range: 7, target: 'dir',
    tags: ['offense', 'attack', 'projectile'],
    effects: [{ op: 'projectile', speed: 15, range: 7, count: 5, spread: 50, onHit: [hit(dmg('phys', [3, 6], 0.6, 7, 'dex'))] }],
    vfx: 'knife_fan',
  },
  {
    id: 'rog_vault', name: '宙返り', desc: '短く跳んで位置を変える。次の 2 秒の攻撃が強くなる。',
    unlock: 12, cost: { mana: 4 }, cd: 5, cdPerRank: 0.1, cast: 0, range: 3.5, target: 'ground',
    tags: ['mobility', 'buff'],
    effects: [
      { op: 'dash', to: 'point', speed: 20, maxDist: 3.5 },
      { op: 'buff', id: 'vault', mods: [mod('dmgAttack', 'inc', 30, 2)], duration: 2, target: 'self' },
    ],
    vfx: 'tumble',
  },
  {
    id: 'rog_smoke', name: '煙幕', desc: '足元に煙を広げて姿を消す。煙の中の敵は呪文を使えず、攻撃が当たりにくい。',
    unlock: 12, cost: { mana: 10 }, cd: 18, cdPerRank: 0.3, cast: 0, range: 0, target: 'self',
    tags: ['defense', 'control'],
    effects: [
      {
        op: 'zone', at: 'self', radius: 3, duration: 4, tick: 0.5, affects: 'enemies',
        onTick: [{ op: 'debuff', id: 'smoke', cc: 'silence', duration: 0.6, mods: [mod('accuracy', 'inc', -40)] }],
      },
      { op: 'stealth', duration: 3, breakOnAttack: true },
    ],
    vfx: 'smoke',
  },
  {
    id: 'rog_spike_trap', name: '棘の罠', desc: '地面に罠を置く（3 つまで）。踏んだ敵の周りに棘が出て、1.5 秒動けなくする。',
    unlock: 15, cost: { mana: 6, perRank: 0.2 }, cd: 1, cast: 0.4, range: 5, target: 'ground',
    tags: ['control', 'trap', 'offense'],
    effects: [{
      op: 'trap', armTime: 1, duration: 40, triggerRadius: 1, max: 3,
      onTrigger: [{ op: 'area', at: 'self', shape: 'circle', radius: 1.6, onHit: [hit(dmg('phys', [8, 14], 0, 8, 'dex')), root(1.5)] }],
    }],
    vfx: 'trap',
  },
  {
    id: 'rog_poison_blade', name: '毒塗りの刃', desc: '刃に毒を塗る。20 秒、攻撃で敵を毒にしやすくなり、毒のダメージも上がる。',
    unlock: 18, cost: { mana: 8 }, cd: 20, cast: 0.5, range: 0, target: 'self',
    tags: ['offense', 'support', 'buff'],
    effects: [{ op: 'buff', id: 'poison_blade', duration: 20, target: 'self', mods: [mod('poisonChance', 'flat', 30, 1), mod('dmgPoison', 'inc', 30, 2)] }],
    vfx: 'venom',
  },
  {
    id: 'rog_rewind', name: '時戻しの短剣', desc: '3 秒前の位置と体力に戻る。戻った所で短剣の刃が周りを切る。',
    unlock: 20, cost: { mana: 12 }, cd: 30, cdPerRank: 0.5, cast: 0, range: 0, target: 'self',
    tags: ['defense', 'mobility'],
    effects: [
      { op: 'rewind', seconds: 3 },
      { op: 'area', at: 'self', shape: 'circle', radius: 2.5, onHit: [hit(dmg('phys', [8, 14], 0.8, 7, 'dex'))] },
    ],
    vfx: 'rewind',
  },
  {
    id: 'rog_shadow_swap', name: '影の入れ替え', desc: '離れた敵と立ち位置を入れ替える。入れ替えた敵は少しの間遅くなる。',
    unlock: 22, cost: { mana: 10 }, cd: 14, cdPerRank: 0.2, cast: 0.2, range: 8, target: 'enemy',
    tags: ['mobility', 'control'],
    effects: [{ op: 'swap' }, slow(30, 1.5)],
    vfx: 'swap',
  },
  {
    id: 'rog_time_stop', name: '時止めの砂', desc: '地点に砂時計の砂をまく。3 秒、範囲の中の敵の時が止まる。',
    unlock: 24, cost: { mana: 35, perRank: 1 }, cd: 70, cdPerRank: 1, cast: 0.3, range: 7, target: 'ground',
    tags: ['ultimate', 'control', 'area', 'support'],
    effects: [{ op: 'zone', at: 'point', radius: 3.5, duration: 3, tick: 0.25, affects: 'enemies', onTick: [{ op: 'debuff', id: 'time_stop', cc: 'stun', duration: 0.3 }] }],
    vfx: 'time_stop',
  },
  {
    id: 'rog_caltrops', name: '撒き菱', desc: '地点に鉄の菱をまく。6 秒、上を歩く敵は削られて遅くなる。',
    unlock: 28, cost: { mana: 8, perRank: 0.3 }, cd: 10, cast: 0.3, range: 6, target: 'ground',
    tags: ['control', 'area', 'offense'],
    effects: [{
      op: 'zone', at: 'point', radius: 2.5, duration: 6, tick: 0.5, affects: 'enemies',
      onTick: [hit(dmg('phys', [2, 4], 0, 6, 'dex')), slow(35, 0.6)],
    }],
    vfx: 'caltrops',
  },
  {
    id: 'rog_echo_shadow', name: 'うつし影', desc: '自分の影を 2 体立たせ、1 秒姿を消す。影は 8 秒、弱い攻撃で戦う。',
    unlock: 30, cost: { mana: 16, perRank: 0.5 }, cd: 25, cdPerRank: 0.3, cast: 0, range: 0, target: 'self',
    tags: ['offense', 'support'],
    effects: [{ op: 'clone', duration: 8, count: 2, dmgPct: 35 }, { op: 'stealth', duration: 1, breakOnAttack: true }],
    vfx: 'clone',
  },
];

/* ---------------- 司祭: 癒し、守り、倒れた仲間を起こす ---------------- */
const priest = [
  {
    id: 'pri_holy_bolt', name: '聖なる礫', desc: '敵を追いかける光の礫を放つ。',
    unlock: 10, cost: { mana: 5, perRank: 0.3 }, cd: 0, cast: 0.4, range: 9, target: 'enemy',
    tags: ['offense', 'spell', 'projectile'],
    effects: [{ op: 'projectile', speed: 12, range: 9, homing: true, onHit: [hit(dmg('holy', [8, 15], 0, 8, 'int'))] }],
    vfx: 'holy_bolt',
  },
  {
    id: 'pri_mend', name: '手当ての祈り', desc: '仲間 1 人の体力を戻す。',
    unlock: 10, cost: { mana: 8, perRank: 0.4 }, cd: 2, cast: 0.5, range: 8, target: 'ally',
    tags: ['support', 'heal'],
    effects: [{ op: 'heal', amount: 30, perRank: 10, target: 'ally' }],
    vfx: 'heal',
  },
  {
    id: 'pri_holy_shield', name: '聖なる盾', desc: '仲間 1 人を光の盾で包む。盾はダメージを吸い、5 秒で消える。',
    unlock: 12, cost: { mana: 10, perRank: 0.4 }, cd: 8, cdPerRank: 0.1, cast: 0.3, range: 8, target: 'ally',
    tags: ['support', 'defense'],
    effects: [{ op: 'shield', amount: 50, perRank: 10, duration: 5, target: 'ally' }],
    vfx: 'holy_shield',
  },
  {
    id: 'pri_light_step', name: '光の歩み', desc: '近くの地点へ一瞬で移り、自分の体力を少し戻す。',
    unlock: 12, cost: { mana: 8 }, cd: 10, cdPerRank: 0.15, cast: 0, range: 6, target: 'ground',
    tags: ['mobility', 'heal'],
    effects: [{ op: 'blink', to: 'point', maxDist: 6 }, { op: 'heal', pct: 5, target: 'self' }],
    vfx: 'light_step',
  },
  {
    id: 'pri_spring', name: '癒しの泉', desc: '地点に泉を湧かせる。6 秒、中にいる仲間の体力が毎秒戻る。',
    unlock: 15, cost: { mana: 14, perRank: 0.5 }, cd: 16, cdPerRank: 0.2, cast: 0.5, range: 7, target: 'ground',
    tags: ['support', 'heal', 'area'],
    effects: [{ op: 'zone', at: 'point', radius: 3, duration: 6, tick: 1, affects: 'allies', onTick: [{ op: 'heal', amount: 8, perRank: 10 }] }],
    vfx: 'spring',
  },
  {
    id: 'pri_judgment', name: '裁きの柱', desc: '少し遅れて地点に光の柱が落ちる。当たった敵を気絶させる。',
    unlock: 18, cost: { mana: 14, perRank: 0.5 }, cd: 6, cast: 0.4, range: 8, target: 'ground',
    tags: ['offense', 'spell', 'area', 'control'],
    effects: [{ op: 'area', at: 'point', shape: 'circle', radius: 2, delay: 0.7, onHit: [hit(dmg('holy', [16, 26], 0, 8, 'int')), stun(0.8)] }],
    vfx: 'pillar',
  },
  {
    id: 'pri_false_death', name: '仮初めの死', desc: '仲間 1 人に祈りをかける。4 秒、体力が 1 より下がらない。終わると体力が少し戻る。',
    unlock: 20, cost: { mana: 18 }, cd: 40, cdPerRank: 0.8, cast: 0, range: 8, target: 'ally',
    tags: ['support', 'defense'],
    effects: [{ op: 'cheatDeath', duration: 4, healAfterPct: 15 }],
    vfx: 'grave_guard',
  },
  {
    id: 'pri_cleanse', name: '清めの祈り', desc: '仲間 1 人の悪い効果をすべて消し、体力を少し戻す。',
    unlock: 22, cost: { mana: 10 }, cd: 10, cdPerRank: 0.15, cast: 0.3, range: 8, target: 'ally',
    tags: ['support', 'heal'],
    effects: [{ op: 'cleanse', target: 'ally' }, { op: 'heal', amount: 20, perRank: 8, target: 'ally' }],
    vfx: 'cleanse',
  },
  {
    id: 'pri_revive', name: '蘇生の光', desc: '周りの倒れた仲間をすべて起こし、近くの仲間の体力も戻す。',
    unlock: 24, cost: { mana: 40, perRank: 1 }, cd: 90, cdPerRank: 1.5, cast: 1, range: 0, target: 'self',
    tags: ['ultimate', 'support', 'heal'],
    effects: [{ op: 'revive', radius: 6, hpPct: 40 }, { op: 'heal', pct: 20, target: 'allies', radius: 6 }],
    vfx: 'revive',
  },
  {
    id: 'pri_white_ring', name: '白い火の輪', desc: '自分の周りに白い火の輪を置く。6 秒、中の敵を毎秒焼く。',
    unlock: 28, cost: { mana: 16, perRank: 0.5 }, cd: 12, cdPerRank: 0.2, cast: 0.4, range: 0, target: 'self',
    tags: ['offense', 'spell', 'area'],
    effects: [{ op: 'zone', at: 'self', radius: 3.5, duration: 6, tick: 1, affects: 'enemies', onTick: [hit(dmg('holy', [6, 10], 0, 8, 'int'))] }],
    vfx: 'white_ring',
  },
  {
    id: 'pri_prayer_ring', name: '祈りの輪', desc: '切り替え式。近くの仲間が闇と毒に強くなり、体力が少しずつ戻る。魔力の一部を使い続ける。',
    unlock: 30, cost: { mana: 0 }, cd: 1, cast: 0, range: 0, target: 'self',
    tags: ['support', 'aura', 'defense'],
    effects: [{
      op: 'aura', radius: 7, affects: 'allies', reserve: 20,
      mods: [mod('resShadow', 'flat', 15, 0.5), mod('resPoison', 'flat', 15, 0.5), mod('lifeRegen', 'flat', 1.5, 0.1)],
    }],
    vfx: 'aura_holy',
  },
];

/* ---------------- ネクロマンサー: 骨を起こし、死を予告する ---------------- */
const necromancer = [
  {
    id: 'nec_grave_raise', name: '墓起こし', desc: '骨の兵を 1 体起こす（3 体まで）。骨の兵は近くの敵と戦う。',
    unlock: 10, cost: { mana: 12, perRank: 0.4 }, cd: 1, cast: 0.6, range: 4, target: 'ground',
    tags: ['offense', 'summon'],
    effects: [{ op: 'summon', unit: 'minion_skeleton', count: 1, max: 3, perRank: 8 }],
    vfx: 'raise',
  },
  {
    id: 'nec_bone_stake', name: '骨の杭', desc: '尖った骨の杭を飛ばす。3 体まで突き抜ける。',
    unlock: 10, cost: { mana: 7, perRank: 0.3 }, cd: 0, cast: 0.45, range: 9, target: 'dir',
    tags: ['offense', 'spell', 'projectile'],
    effects: [{ op: 'projectile', speed: 16, range: 9, pierce: 3, onHit: [hit(dmg('phys', [6, 11], 0, 8, 'int'))] }],
    vfx: 'bone_stake',
  },
  {
    id: 'nec_rust_curse', name: '錆の呪い', desc: '範囲の敵を呪う。8 秒、防御と与えるダメージが下がる。',
    unlock: 12, cost: { mana: 10, perRank: 0.3 }, cd: 6, cast: 0.4, range: 8, target: 'ground',
    tags: ['support', 'control', 'spell', 'area'],
    effects: [{
      op: 'area', at: 'point', shape: 'circle', radius: 3,
      onHit: [{ op: 'debuff', id: 'rust_curse', duration: 8, mods: [mod('armor', 'inc', -25, -1), mod('dmg', 'inc', -15, -0.5)] }],
    }],
    vfx: 'curse',
  },
  {
    id: 'nec_soul_step', name: '魂渡り', desc: '近くの地点へ一瞬で移る。着いた所の敵は 2 秒遅くなる。',
    unlock: 12, cost: { mana: 8 }, cd: 10, cdPerRank: 0.15, cast: 0, range: 6, target: 'ground',
    tags: ['mobility', 'control'],
    effects: [{ op: 'blink', to: 'point', maxDist: 6 }, { op: 'area', at: 'self', shape: 'circle', radius: 2, onHit: [slow(40, 2)] }],
    vfx: 'soul_step',
  },
  {
    id: 'nec_archer_wake', name: '射手の目覚め', desc: '弓を持つ骨の射手を 1 体起こす（2 体まで）。離れた所から矢を射る。',
    unlock: 15, cost: { mana: 14, perRank: 0.4 }, cd: 1, cast: 0.6, range: 4, target: 'ground',
    tags: ['offense', 'summon'],
    effects: [{ op: 'summon', unit: 'minion_skeleton_archer', count: 1, max: 2, perRank: 8 }],
    vfx: 'raise',
  },
  {
    id: 'nec_bone_mantle', name: '骸の外套', desc: '骨の外套をまとう。8 秒、ダメージを吸う盾ができ、防御が上がる。',
    unlock: 18, cost: { mana: 12 }, cd: 16, cdPerRank: 0.2, cast: 0.3, range: 0, target: 'self',
    tags: ['defense', 'buff'],
    effects: [
      { op: 'shield', amount: 50, perRank: 12, duration: 8, target: 'self' },
      { op: 'buff', id: 'bone_mantle', mods: [mod('armor', 'inc', 30, 1)], duration: 8, target: 'self' },
    ],
    vfx: 'bone_mantle',
  },
  {
    id: 'nec_life_drain', name: '命吸い', desc: '押している間、敵の命を吸い取り、自分の体力にする。',
    unlock: 20, cost: { mana: 12, perRank: 0.4 }, cd: 8, cast: 0, range: 6, target: 'enemy',
    tags: ['offense', 'spell', 'channel', 'heal'],
    effects: [{
      op: 'channel', duration: 3, tick: 0.5,
      onTick: [hit(dmg('shadow', [5, 8], 0, 8, 'int')), { op: 'heal', amount: 4, perRank: 8, target: 'self' }],
    }],
    vfx: 'drain',
  },
  {
    id: 'nec_soul_chain', name: '魂の鎖', desc: '範囲の敵を魂の鎖でつなぐ。8 秒、つながれた敵の 1 体が受けたダメージの 25% が、ほかの敵にも入る。',
    unlock: 22, cost: { mana: 16, perRank: 0.5 }, cd: 14, cdPerRank: 0.2, cast: 0.4, range: 8, target: 'ground',
    tags: ['support', 'control', 'spell', 'area'],
    effects: [{
      op: 'area', at: 'point', shape: 'circle', radius: 4,
      onHit: [{ op: 'mark', duration: 8, share: 25, mods: [mod('resShadow', 'flat', -10)] }],
    }],
    vfx: 'soul_chain',
  },
  {
    id: 'nec_death_sentence', name: '死の宣告', desc: '敵 1 体に死を告げる。3 秒後に闇の大きなダメージを与え、そのとき体力が 30% 以下なら倒す。',
    unlock: 24, cost: { mana: 35, perRank: 1 }, cd: 60, cdPerRank: 1, cast: 0.5, range: 8, target: 'enemy',
    tags: ['ultimate', 'offense', 'spell'],
    effects: [
      slow(30, 3),
      { op: 'delayed', delay: 3, effects: [hit(dmg('shadow', [40, 60], 0, 10, 'int')), { op: 'execute', thresholdPct: 30 }] },
    ],
    vfx: 'death_sentence',
  },
  {
    id: 'nec_corpse_burst', name: '亡骸の破裂', desc: '地点の近くにある亡骸を破裂させ、周りの敵に闇のダメージを与える。亡骸が無いと使えない。',
    unlock: 28, cost: { mana: 14, perRank: 0.5 }, cd: 2, cast: 0.4, range: 8, target: 'ground',
    tags: ['offense', 'spell', 'area'], needsCorpse: true,
    effects: [{ op: 'area', at: 'point', shape: 'circle', radius: 2.8, onHit: [hit(dmg('shadow', [18, 30], 0, 8, 'int'))] }],
    vfx: 'corpse_burst',
  },
  {
    id: 'nec_rib_fence', name: '肋骨の柵', desc: '地点に骨の柵を立てる。6 秒、敵も味方も通れない。',
    unlock: 30, cost: { mana: 12 }, cd: 16, cdPerRank: 0.2, cast: 0.4, range: 7, target: 'ground',
    tags: ['defense', 'control'],
    effects: [{ op: 'wall', length: 5, duration: 6, at: 'point' }],
    vfx: 'bone_fence',
  },
];

/* ---------------- モンク: 構えを替え、仲間のもとへ跳ぶ ---------------- */
const monk = [
  {
    id: 'mnk_flurry', name: '百烈の拳', desc: '押している間、目にも止まらない速さで殴り続ける。',
    unlock: 10, cost: { mana: 8, perRank: 0.3 }, cd: 4, cast: 0, range: 1.4, target: 'enemy',
    tags: ['offense', 'attack', 'melee', 'channel'],
    effects: [{ op: 'channel', duration: 1.2, tick: 0.15, onTick: [hit(dmg('phys', [2, 4], 0.5, 6, 'dex'))] }],
    vfx: 'flurry',
  },
  {
    id: 'mnk_stance_fire', name: '烈火の構え', desc: '構えを替える。攻撃が速く、近接のダメージが大きくなる。ほかの構えとは同時に使えない。',
    unlock: 10, cost: { mana: 4 }, cd: 1, cast: 0, range: 0, target: 'self',
    tags: ['offense', 'stance', 'buff'],
    effects: [{ op: 'stance', group: 'monk', mods: [mod('attackSpeed', 'inc', 15, 1), mod('dmgMelee', 'inc', 10, 1)] }],
    vfx: 'stance_fire',
  },
  {
    id: 'mnk_qi_leap', name: '気脈の跳躍', desc: '仲間のもとへ跳ぶ。着いたら、その仲間と自分に小さな盾ができる。',
    unlock: 12, cost: { mana: 8 }, cd: 10, cdPerRank: 0.15, cast: 0, range: 8, target: 'ally',
    tags: ['mobility', 'support'],
    effects: [
      { op: 'blink', to: 'ally', maxDist: 8 },
      { op: 'shield', amount: 30, perRank: 10, duration: 3, target: 'ally' },
      { op: 'shield', amount: 30, perRank: 10, duration: 3, target: 'self' },
    ],
    vfx: 'qi_leap',
  },
  {
    id: 'mnk_palm_wave', name: '掌波', desc: '手のひらから気の波を飛ばす。2 体まで突き抜ける。',
    unlock: 12, cost: { mana: 6, perRank: 0.3 }, cd: 1.5, cast: 0.35, range: 6, target: 'dir',
    tags: ['offense', 'attack', 'projectile'],
    effects: [{ op: 'projectile', speed: 14, range: 6, pierce: 2, radius: 0.6, onHit: [hit(dmg('holy', [8, 14], 0.7, 7, 'dex'))] }],
    vfx: 'palm_wave',
  },
  {
    id: 'mnk_stance_water', name: '流水の構え', desc: '構えを替える。攻撃をよけやすく、足が速くなり、魔力が戻りやすい。',
    unlock: 15, cost: { mana: 4 }, cd: 1, cast: 0, range: 0, target: 'self',
    tags: ['defense', 'stance', 'buff'],
    effects: [{ op: 'stance', group: 'monk', mods: [mod('evasion', 'inc', 30, 2), mod('moveSpeed', 'inc', 10), mod('manaRegen', 'flat', 1, 0.1)] }],
    vfx: 'stance_water',
  },
  {
    id: 'mnk_sweep', name: '足払い', desc: '回し蹴りで周りの敵の足を払い、少し気絶させる。',
    unlock: 18, cost: { mana: 8, perRank: 0.3 }, cd: 8, cast: 0.3, range: 0, target: 'self',
    tags: ['offense', 'control', 'area'],
    effects: [{ op: 'area', at: 'self', shape: 'circle', radius: 2.2, onHit: [hit(dmg('phys', [5, 9], 0.8, 7, 'dex')), stun(0.6)] }],
    vfx: 'sweep',
  },
  {
    id: 'mnk_chakra', name: '気の巡り', desc: '周りのパーティーの仲間の体力を戻す。',
    unlock: 20, cost: { mana: 14, perRank: 0.5 }, cd: 14, cdPerRank: 0.2, cast: 0.4, range: 0, target: 'self',
    tags: ['support', 'heal'],
    effects: [{ op: 'heal', amount: 25, perRank: 8, target: 'party', radius: 6 }],
    vfx: 'chakra',
  },
  {
    id: 'mnk_mountain_kick', name: '山崩しの蹴り', desc: '全身の力で蹴り飛ばす。敵は遠くへ飛び、1 秒気絶する。',
    unlock: 22, cost: { mana: 14, perRank: 0.5 }, cd: 16, cdPerRank: 0.2, cast: 0.3, range: 1.6, target: 'enemy',
    tags: ['offense', 'control', 'attack', 'melee'],
    effects: [hit(dmg('phys', [14, 22], 1.8, 8, 'dex')), { op: 'knockback', dist: 5 }, stun(1)],
    vfx: 'big_kick',
  },
  {
    id: 'mnk_harmony', name: '調和の結界', desc: '周りのパーティーの仲間全員を大きな盾で包み、悪い効果を消す。',
    unlock: 24, cost: { mana: 35, perRank: 1 }, cd: 75, cdPerRank: 1, cast: 0.5, range: 0, target: 'self',
    tags: ['ultimate', 'support', 'defense'],
    effects: [
      { op: 'shield', amount: 120, perRank: 15, duration: 5, target: 'party', radius: 8 },
      { op: 'cleanse', target: 'party' },
    ],
    vfx: 'harmony',
  },
  {
    id: 'mnk_stance_rock', name: '磐石の構え', desc: '構えを替える。防御が大きく上がり、体力が少しずつ戻る。足は少し遅くなる。',
    unlock: 28, cost: { mana: 4 }, cd: 1, cast: 0, range: 0, target: 'self',
    tags: ['defense', 'stance', 'buff'],
    effects: [{ op: 'stance', group: 'monk', mods: [mod('armor', 'inc', 40, 2), mod('lifeRegen', 'flat', 2, 0.2), mod('moveSpeed', 'inc', -10)] }],
    vfx: 'stance_rock',
  },
  {
    id: 'mnk_diamond_breath', name: '金剛の息', desc: '深く息を整える。自分の悪い効果を消し、6 秒、炎・冷気・雷・毒・闇に強くなる。',
    unlock: 30, cost: { mana: 10 }, cd: 20, cdPerRank: 0.3, cast: 0, range: 0, target: 'self',
    tags: ['defense', 'buff'],
    effects: [
      { op: 'cleanse', target: 'self' },
      {
        op: 'buff', id: 'diamond_breath', duration: 6, target: 'self',
        mods: ['resFire', 'resCold', 'resLightning', 'resPoison', 'resShadow'].map((k) => mod(k, 'flat', 15, 1)),
      },
    ],
    vfx: 'diamond',
  },
];

/* ---------------- 魔物のスキル ---------------- */
const monster = [
  {
    id: 'm_pounce', name: '飛びかかり', desc: '離れた所から飛びかかってかみつく。',
    cd: 6, cast: 0.2, range: 4, target: 'enemy',
    effects: [{ op: 'dash', to: 'target', speed: 12, maxDist: 4, onArrive: [hit(dmg('phys', [1, 3], 0, 0))] }],
    vfx: 'pounce',
  },
  {
    id: 'm_imp_howl', name: '小鬼の呼び声', desc: '叫んで近くの仲間を勢いづける。',
    cd: 15, cast: 0.5, range: 0, target: 'self',
    effects: [{ op: 'buff', id: 'imp_howl', mods: [mod('attackSpeed', 'inc', 25), mod('moveSpeed', 'inc', 15)], duration: 6, target: 'allies', radius: 5 }],
    vfx: 'howl',
  },
  {
    id: 'm_sling', name: '投石', desc: '石を投げる。',
    cd: 1.6, cast: 0.4, range: 6, target: 'enemy',
    effects: [{ op: 'projectile', speed: 10, range: 6, onHit: [hit(dmg('phys', [2, 5], 0, 0))] }],
    vfx: 'stone',
  },
  {
    id: 'm_shield_bash', name: '盾打ち', desc: '盾で打って少し気絶させる。',
    cd: 8, cast: 0.4, range: 1.4, target: 'enemy',
    effects: [hit(dmg('phys', [3, 6], 0, 0)), stun(0.5)],
    vfx: 'bash',
  },
  {
    id: 'm_grave_grasp', name: '墓の手', desc: '足元から死者の手が伸びてつかむ。',
    cd: 9, cast: 0.5, range: 6, target: 'enemy',
    effects: [{ op: 'area', at: 'target', shape: 'circle', radius: 1.2, delay: 0.6, onHit: [hit(dmg('shadow', [6, 10], 0, 0)), root(1.5)] }],
    vfx: 'grasp',
  },
  {
    id: 'm_venom_spit', name: '毒吐き', desc: '毒の粘液を吐く。当たると毒になる。',
    cd: 2, cast: 0.4, range: 5, target: 'enemy',
    effects: [{ op: 'projectile', speed: 9, range: 5, onHit: [hit(dmg('poison', [4, 7], 0, 0)), { op: 'dot', type: 'poison', dps: 3, duration: 4, maxStacks: 3 }] }],
    vfx: 'spit',
  },
  {
    id: 'm_leech_bite', name: '吸い付き', desc: '血を吸って自分の体力にする。',
    cd: 3, cast: 0.2, range: 1.2, target: 'enemy',
    effects: [hit(dmg('shadow', [3, 6], 0, 0)), { op: 'heal', amount: 5, target: 'self' }],
    vfx: 'leech',
  },
  {
    id: 'm_frost_hex', name: '凍える呪い', desc: '冷たい霧の弾を放つ。当たると遅くなる。',
    cd: 2.5, cast: 0.5, range: 7, target: 'enemy',
    effects: [{ op: 'projectile', speed: 9, range: 7, onHit: [hit(dmg('cold', [8, 13], 0, 0)), slow(40, 2)] }],
    vfx: 'frost',
  },
  {
    id: 'm_mist_veil', name: '霧隠れ', desc: '霧に紛れて離れた所へ移り、少しの間姿を消す。',
    cd: 12, cast: 0.3, range: 5, target: 'ground',
    effects: [{ op: 'blink', to: 'point', maxDist: 5 }, { op: 'stealth', duration: 2, breakOnAttack: true }],
    vfx: 'mist',
  },
  {
    id: 'm_ghoul_frenzy', name: '狂い食い', desc: '4 秒、攻撃が速くなり、かみつくたびに体力が戻る。',
    cd: 12, cast: 0.3, range: 0, target: 'self',
    effects: [{ op: 'buff', id: 'ghoul_frenzy', mods: [mod('attackSpeed', 'inc', 40), mod('lifeLeech', 'flat', 10)], duration: 4, target: 'self' }],
    vfx: 'frenzy',
  },
  {
    id: 'm_dark_bolt', name: '闇の礫', desc: '闇の礫を放つ。',
    cd: 2.6, cast: 0.5, range: 7, target: 'enemy',
    effects: [{ op: 'projectile', speed: 10, range: 7, onHit: [hit(dmg('shadow', [12, 18], 0, 0))] }],
    vfx: 'dark_bolt',
  },
  {
    id: 'm_raise_bones', name: '骨呼び', desc: '床の骨を起こして骨の兵を 1 体呼ぶ（2 体まで、Lv14）。',
    cd: 14, cast: 1, range: 3, target: 'self',
    effects: [{ op: 'summon', unit: 'bone_soldier', count: 1, max: 2, duration: 30, level: 14 }],
    vfx: 'raise',
  },
  {
    id: 'm_bronze_slam', name: '青銅の踏みつけ', desc: '重い足で床を踏みつける。周りの者を気絶させる。',
    cd: 7, cast: 0.8, range: 0, target: 'self',
    effects: [{ op: 'area', at: 'self', shape: 'circle', radius: 2.5, delay: 0.8, onHit: [hit(dmg('phys', [18, 28], 0, 0)), stun(1.2)] }],
    vfx: 'slam',
  },
  {
    id: 'm_bone_arrow', name: '骨の矢', desc: '骨の矢を射る。',
    cd: 1.4, cast: 0.4, range: 6, target: 'enemy',
    effects: [{ op: 'projectile', speed: 13, range: 6, onHit: [hit(dmg('phys', [3, 5], 0, 0))] }],
    vfx: 'arrow',
  },
  // 鐘守りの亡者（1 人で倒せる強さ。大技は構え（詠唱）と地面の印のあとに当たるので、印から出れば受けない）
  // aiRange: 魔物がこの距離より近い相手にだけ使う（自分の周りに効くスキル）
  {
    id: 'm_warden_toll', name: '弔いの鐘', desc: '割れた鐘を高く掲げ（構え 1 秒）、足元に印が出た 1 秒後、周りの者に闇のダメージを与えて気絶させる。',
    cd: 11, cast: 1, range: 0, target: 'self', aiRange: 4.5,
    effects: [{ op: 'area', at: 'self', shape: 'circle', radius: 5, delay: 1, onHit: [hit(dmg('shadow', [55, 75], 0, 0)), stun(1)] }],
    vfx: 'toll',
  },
  {
    id: 'm_warden_chain', name: '鐘の鎖', desc: '鐘を吊っていた鎖を投げ、当たった者を引き寄せる。横へよければ当たらない。',
    cd: 13, cast: 0.6, range: 9, target: 'enemy',
    effects: [{ op: 'hook', speed: 12, range: 9, width: 0.5, onHit: [hit(dmg('phys', [16, 24], 0, 0))] }],
    vfx: 'chain',
  },
  {
    id: 'm_warden_ring', name: '響きの落下', desc: '鐘の響きを相手の足元へ落とす。印が出た 1 秒後に、その場所へ闇のダメージ。',
    cd: 7, cast: 0.6, range: 10, target: 'enemy',
    effects: [{ op: 'area', at: 'point', shape: 'circle', radius: 2.2, delay: 1, onHit: [hit(dmg('shadow', [40, 56], 0, 0))] }],
    vfx: 'sound_ring',
  },
  {
    id: 'm_warden_call', name: '鳴らぬ鐘の呼び声', desc: '床の骨を起こして、骨の兵を 2 体呼ぶ（Lv16、25 秒で崩れる）。',
    cd: 30, cast: 1.5, range: 0, target: 'self',
    effects: [{ op: 'summon', unit: 'bone_soldier', count: 2, max: 2, duration: 25, level: 16 }],
    vfx: 'raise',
  },
  {
    id: 'm_burning_coat', name: '炎の衣', desc: '体の周りに炎をまとう。近くにいる者が焼ける（精鋭の性質）。',
    cd: 3, cast: 0, range: 0, target: 'self',
    effects: [{ op: 'zone', at: 'self', radius: 2, duration: 3, tick: 0.5, affects: 'enemies', onTick: [hit(dmg('fire', [2, 4], 0, 0))] }],
    vfx: 'flame_coat',
  },
  {
    id: 'm_hex', name: '弱りの呪い', desc: '相手の周りを呪い、防御を下げる（精鋭の性質）。',
    cd: 10, cast: 0.5, range: 6, target: 'enemy',
    effects: [{ op: 'area', at: 'target', shape: 'circle', radius: 2, onHit: [{ op: 'debuff', id: 'hex', duration: 5, mods: [mod('armor', 'inc', -30)] }] }],
    vfx: 'curse',
  },
  {
    id: 'm_warden_dread', name: '戦慄', desc: '近くの者をおびえさせ、1.2 秒逃げ回らせる。',
    cd: 24, cast: 0.6, range: 0, target: 'self', aiRange: 4,
    effects: [{ op: 'area', at: 'self', shape: 'circle', radius: 4, onHit: [{ op: 'debuff', id: 'dread', cc: 'fear', duration: 1.2 }] }],
    vfx: 'dread',
  },
];

/* ---------------- まとめ ---------------- */
function build() {
  const out = {};
  const add = (cls, list) => {
    for (const s of list) {
      if (out[s.id]) throw new Error(`スキルの id が重複: ${s.id}`);
      const isMonster = cls === 'monster';
      out[s.id] = {
        id: s.id, cls, name: s.name, desc: s.desc,
        unlock: isMonster ? 0 : s.unlock,
        maxRank: isMonster ? 1 : (s.maxRank ?? 20),
        cost: s.cost ?? { mana: 0 },
        cd: s.cd, ...(s.cdPerRank ? { cdPerRank: s.cdPerRank } : {}),
        cast: s.cast, range: s.range, target: s.target, ...(s.aiRange ? { aiRange: s.aiRange } : {}),
        tags: isMonster ? ['monster'] : s.tags,
        effects: s.effects,
        vfx: s.vfx, icon: s.icon ?? s.id,
        ...(s.resetOnKill ? { resetOnKill: true } : {}),
        ...(s.needsCorpse ? { needsCorpse: true } : {}),
      };
    }
  };
  add('adventurer', adventurer);
  add('swordsman', swordsman);
  add('warrior', warrior);
  add('rogue', rogue);
  add('priest', priest);
  add('necromancer', necromancer);
  add('monk', monk);
  add('monster', monster);
  return out;
}

export const skills = build();

// 職業ごとの覚える順（classes.mjs が使う）
export const skillsByClass = Object.freeze({
  adventurer: adventurer.map((s) => s.id),
  swordsman: swordsman.map((s) => s.id),
  warrior: warrior.map((s) => s.id),
  rogue: rogue.map((s) => s.id),
  priest: priest.map((s) => s.id),
  necromancer: necromancer.map((s) => s.id),
  monk: monk.map((s) => s.id),
});
