// 1 人用の釣り合いを確かめる道具: 職ごとのスキルの上げ方、パッシブのツリーの取り方、ボスと戦う人の手の決め方。
// Node.js のテスト（tests/kanenaki-sim-solo.test.mjs）と、画面なしの Chrome の通し遊び（kanenaki/tools/playthrough.mjs）の両方が使う。
// どちらも「人が素直に遊んだら」を真似る。強さを足す命令（倒れない・能力値をいじる）は使わない。

// スキルの上げ方: [スキル, 目標のランク] を前から順に満たす（ランクは Lv と点の数で止まる）
export const PLANS = {
  warrior: [['war_cleave', 8], ['war_rock_skin', 1], ['war_bloodlust', 1], ['war_cleave', 99], ['war_stomp', 99], ['war_rock_skin', 99]],
  priest: [['pri_holy_bolt', 8], ['pri_mend', 2], ['pri_judgment', 3], ['pri_holy_shield', 1], ['pri_holy_bolt', 99], ['pri_judgment', 99], ['pri_mend', 99]],
  necromancer: [['nec_bone_stake', 8], ['nec_grave_raise', 3], ['nec_bone_mantle', 1], ['nec_bone_stake', 99], ['nec_grave_raise', 99], ['nec_bone_mantle', 99]],
  swordsman: [['swd_cross_slash', 8], ['swd_lunge', 1], ['swd_iai', 1], ['swd_cross_slash', 99], ['swd_iai', 99], ['swd_lunge', 99]],
  rogue: [['rog_fan_knives', 8], ['rog_backstab', 2], ['rog_vault', 1], ['rog_fan_knives', 99], ['rog_backstab', 99]],
  monk: [['mnk_palm_wave', 8], ['mnk_stance_fire', 3], ['mnk_chakra', 1], ['mnk_flurry', 1], ['mnk_palm_wave', 99], ['mnk_stance_fire', 99], ['mnk_flurry', 99]],
};
// 離れて戦う職（ボスから 7 マスより内にいて、魔力が足りないときは殴りに行かずに待つ）
export const RANGED = new Set(['priest', 'necromancer']);
// 近づかれたら離れる職。司祭は離れない（狭い迷宮で離れると、礫を撃つ間が減って長引く。盾と癒しと薬でしのぐ）
export const KITE = new Set(['necromancer']);

// スキルの点の使い方: 今のランクと Lv と点の数から、上げる順のスキルの列を返す（純粋な関数）
export function planSkillUps(cls, skills, ranks0, level, points) {
  const ranks = { ...ranks0 };
  const out = [];
  let left = points;
  for (const [sid, want] of PLANS[cls] ?? []) {
    const sk = skills[sid];
    if (!sk) continue;
    while (left > 0 && (ranks[sid] ?? 0) < Math.min(want, sk.maxRank ?? 20) && level >= (sk.unlock ?? 1) + (ranks[sid] ?? 0)) {
      ranks[sid] = (ranks[sid] ?? 0) + 1; left--; out.push(sid);
    }
  }
  return out;
}

// パッシブのツリーの取り方: 取ったマスにつながるマスから、その職に役立つ修正の多いものを順に選ぶ（純粋な関数）
const MAIN_STAT = { warrior: 'str', swordsman: 'str', rogue: 'dex', monk: 'dex', priest: 'int', necromancer: 'int', adventurer: 'str' };
export function pickTreeNodes(tree, alloc0, cls, points) {
  const alloc = new Set(alloc0);
  const out = [];
  const main = MAIN_STAT[cls] ?? 'str';
  const score = (n) => {
    let v = 0;
    for (const m of n.mods ?? []) {
      const x = Math.abs(Number(Array.isArray(m.value) ? m.value[1] : m.value) || 0);
      if (m.key === 'life') v += m.mode === 'flat' ? x / 4 : x;
      else if (m.key === main) v += x * 1.5;
      else if (m.key === 'vit') v += x;
      else if (m.key.startsWith('dmg')) v += x * 0.8;
      else if (m.key === 'armor' || m.key.startsWith('res')) v += x * 0.3;
      else v += x * 0.2;
    }
    if (n.cls && n.cls !== cls) v -= 5;
    return v;
  };
  for (let k = 0; k < points; k++) {
    let best = null, bs = -Infinity;
    for (const id of alloc) for (const l of tree.nodes[id]?.links ?? []) {
      if (alloc.has(l)) continue;
      const n = tree.nodes[l];
      if (!n || n.kind === 'keystone') continue;
      const s = score(n);
      if (s > bs || (s === bs && l < best)) { bs = s; best = l; }
    }
    if (!best) break;
    alloc.add(best); out.push(best);
  }
  return out;
}

// 地面の印（前触れのある範囲の攻撃）の中にいるか
export function insideWarn(w, x, y, margin = 0.7) {
  const vx = x - w.x, vy = y - w.y, d = Math.hypot(vx, vy);
  if (w.shape === 'line') {
    const a = ((w.dir ?? 0) * Math.PI) / 8, dx = -Math.sin(a), dy = Math.cos(a);
    const t = vx * dx + vy * dy;
    return t > -margin && t < (w.len ?? 6) + margin && Math.abs(vx * -dy + vy * dx) < (w.width ?? 1) / 2 + margin;
  }
  return d < (w.r ?? 3) + margin;
}

// 人の手の決め方。view = { now(ms), me:{ x, y, hp, maxHp, mana, dead, cds:{ s: 残り ms }, ranks }, boss:{ id, x, y } | null,
//   warns:[{ x, y, r, shape, dir, len, width, until }], minions: 自分の召喚の数, potions: 回復薬の数, potionReadyAt, lastMoveAt }
// opts = { potions: 使うか, dodge: よけるか, skills: スキルを使うか }
// 戻り値: { t:'potion' }（回復薬）| { t:'mana' }（魔力の薬）| { t:'move', x, y, why } | { t:'cast', s, x, y, id? } | { t:'attack', id } | null
// view.manaPotions と me.maxMana があれば、魔力が 2 割を切ったときに魔力の薬を飲む
export function decide(cls, view, skills, opts = {}) {
  const { potions = true, dodge = true, useSkills = true } = opts;
  const { me, boss } = view;
  if (me.dead) return null;
  const hpPct = (me.hp / Math.max(1, me.maxHp)) * 100;
  if (potions && view.potions > 0 && hpPct < 45 && view.now >= (view.potionReadyAt ?? 0)) return { t: 'potion' };
  if (potions && (view.manaPotions ?? 0) > 0 && me.maxMana && me.mana < me.maxMana * 0.2 && view.now >= (view.potionReadyAt ?? 0)) return { t: 'mana' };
  // 地面の印から出る
  if (dodge) {
    const w = (view.warns ?? []).find((w) => w.until > view.now && insideWarn(w, me.x, me.y));
    if (w) {
      let dx = me.x - w.x, dy = me.y - w.y, d = Math.hypot(dx, dy);
      if (w.shape === 'line') { const a = ((w.dir ?? 0) * Math.PI) / 8; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
      if (d < 0.2) { dx = 1; dy = 0; d = 1; }
      const R = w.shape === 'line' ? (w.width ?? 1) / 2 + 2 : (w.r ?? 3) + 1.6;
      const base = w.shape === 'line' ? { x: me.x, y: me.y } : { x: w.x, y: w.y };
      return { t: 'move', x: base.x + (dx / d) * R, y: base.y + (dy / d) * R, why: 'dodge' };
    }
  }
  if (!boss) return null;
  const dist = Math.hypot(boss.x - me.x, boss.y - me.y);
  const ready = (sid) => useSkills && (me.ranks?.[sid] ?? 0) > 0 && !((me.cds?.[sid] ?? 0) > 0) && me.mana >= (skills[sid]?.cost?.mana ?? 0) + (skills[sid]?.cost?.perRank ?? 0) * ((me.ranks?.[sid] ?? 1) - 1);
  const at = { x: boss.x, y: boss.y, id: boss.id };
  const self = { x: me.x, y: me.y };
  const ranged = RANGED.has(cls);
  // 離れる職は、近づかれたら離れる
  if (ranged && KITE.has(cls) && dist < 3 && view.now - (view.lastMoveAt ?? 0) > 900) {
    const k = 6.5 / Math.max(0.1, dist);
    return { t: 'move', x: boss.x + (me.x - boss.x) * k, y: boss.y + (me.y - boss.y) * k, why: 'kite' };
  }
  const C = (s, p = at) => ({ t: 'cast', s, ...p });
  switch (cls) {
    case 'warrior':
      if (ready('war_bloodlust') && dist < 4) return C('war_bloodlust', self);
      if (ready('war_rock_skin') && hpPct < 75) return C('war_rock_skin', self);
      if (ready('war_stomp') && dist < 2.8) return C('war_stomp', self);
      if (ready('war_cleave') && dist < 2.8) return C('war_cleave');
      break;
    case 'priest':
      if (ready('pri_mend') && hpPct < 65) return C('pri_mend', self);
      if (ready('pri_holy_shield') && dist < 7) return C('pri_holy_shield', self);
      if (ready('pri_judgment') && dist < 8) return C('pri_judgment');
      if (ready('pri_holy_bolt') && dist < 9) return C('pri_holy_bolt');
      break;
    case 'necromancer':
      if (ready('nec_grave_raise') && (view.minions ?? 0) < 3) return C('nec_grave_raise', { x: me.x + (boss.x - me.x) * 0.3, y: me.y + (boss.y - me.y) * 0.3 });
      if (ready('nec_bone_mantle') && hpPct < 75) return C('nec_bone_mantle', self);
      if (ready('nec_bone_stake') && dist < 9) return C('nec_bone_stake');
      break;
    case 'swordsman':
      if (ready('swd_iai') && dist < 6) return C('swd_iai');
      if (ready('swd_cross_slash') && dist < 2.8) return C('swd_cross_slash');
      if (ready('swd_lunge') && dist > 2.5 && dist < 6) return C('swd_lunge');
      break;
    case 'rogue':
      if (ready('rog_backstab') && dist < 3) return C('rog_backstab');
      if (ready('rog_fan_knives') && dist < 7) return C('rog_fan_knives');
      break;
    case 'monk':
      if (ready('mnk_stance_fire') && !me.stance) return C('mnk_stance_fire', self);
      if (ready('mnk_chakra') && hpPct < 65) return C('mnk_chakra', self);
      if (ready('mnk_palm_wave') && dist < 6) return C('mnk_palm_wave');
      if (ready('mnk_flurry') && dist < 1.8) return C('mnk_flurry');
      break;
    default: break;
  }
  if (ranged && dist > 7.5) return { t: 'move', x: boss.x + (me.x - boss.x) * (6 / dist), y: boss.y + (me.y - boss.y) * (6 / dist), why: 'close' };
  if (ranged && useSkills) return null; // 魔力が戻るのを待つ（離れたまま）
  return { t: 'attack', id: boss.id };
}
