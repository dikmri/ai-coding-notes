// ダメージ・回復・倒れる、通常攻撃、命中したときの追加効果
import { hitChance, mitigate, damageRange, rollDamage, ccDuration } from '../shared/calc.mjs';
import { ANIM } from '../shared/schema.mjs';
import { addStatus, removeStatus, hasStatus, isBoss, isActor, isEnemy, manaCap, historyAt, dist } from './actor.mjs';

const scaleRange = (r, k) => (k && k !== 1 ? { ...r, min: Math.round(r.min * k), max: Math.round(r.max * k) } : r);
const hasRule = (a, r) => !!a?.rules?.includes(r);

// 会心の抽選。要と固有の品の決まり（次は必ず会心、姿を消した最初の一撃、明かりの外は 2 倍）もここで扱う
export function rollCrit(W, src, t) {
  const st = (src?.clone ? src.cloneOf : src)?.stats;
  let chance = st?.critChance ?? 5;
  if (hasRule(src, 'darkCrit') && t && dist(src, t) > (st?.lightRadius ?? 6)) chance *= 2;
  let crit = W.rng() * 100 < chance, extra = 1;
  if (src?.nextCrit) { crit = true; src.nextCrit = false; }
  if (src?.shadowStrike) { crit = true; extra = 1.5; src.shadowStrike = false; }
  if (hasRule(src, 'noCrit')) crit = false;
  return { crit, mult: extra * (crit ? (st?.critMulti ?? 150) / 100 : 1) };
}

// 攻撃や呪文で姿が現れる。shadowFirst なら、この一撃を強くする印を付ける
export function breakStealth(a) {
  const st = a.statuses.find((s) => s.id === 'stealth' && s.breakOnAttack);
  if (!st) return;
  removeStatus(a, (s) => s === st);
  if (hasRule(a, 'shadowFirst')) a.shadowStrike = true;
}

// 気絶させたとき（stunEcho: 周り 2 マスの敵へ聖のダメージ）
export function onStunned(zone, src, t) {
  if (!hasRule(src, 'stunEcho') || src.echoing) return;
  src.echoing = true;
  try {
    const amt = 4 + (src.level ?? 1) * 1.5;
    for (const o of zone.queryActors(t.x, t.y, 2, (o) => o !== t && isEnemy(src, o) && !o.dead)) applyDamage(zone, src, o, { amount: amt, type: 'holy' });
    zone.fx({ k: 'vfx', name: 'stun_echo', x: t.x, y: t.y, r: 2 }, t.x, t.y);
  } finally { src.echoing = false; }
}

// pkt = { amount, type, crit?, canMiss?, isDot?, pure?, shared?, tags?, skillId?, basic? } → 実際に減った体力
export function applyDamage(zone, src, dst, pkt) {
  if (!isActor(dst) || dst.dead || dst.untargetable || dst.removed) return 0;
  const W = zone.world;
  if (zone.map.safe && dst.kind === 'player') return 0;
  if (pkt.canMiss && src?.stats) {
    if (W.rng() > hitChance(src.stats.accuracy, dst.stats.evasion)) { zone.fx({ k: 'dmg', id: dst.id, src: src.id, amt: 0, miss: true }, dst.x, dst.y); return 0; }
    if (dst.stats.blockChance > 0 && W.rng() * 100 < dst.stats.blockChance) {
      if (hasRule(dst, 'perfectParry')) dst.nextCrit = true;
      zone.fx({ k: 'dmg', id: dst.id, src: src.id, amt: 0, block: true }, dst.x, dst.y);
      return 0;
    }
  }
  let amt = Number(pkt.amount) || 0;
  if (amt <= 0) return 0;
  if (!pkt.pure && !(pkt.isDot && pkt.type === 'phys')) amt = mitigate(amt, pkt.type, dst.stats);
  let taken = 0;
  for (const s of dst.statuses) if (s.dmgTaken) taken += s.dmgTaken * (s.stacks ?? 1);
  amt = Math.max(0, amt * (1 + taken / 100));
  const shown = amt;
  let absorbed = 0;
  for (const s of dst.statuses) {
    if (s.kind !== 'shield' || !(s.amount > 0) || amt <= 0) continue;
    const a = Math.min(s.amount, amt); s.amount -= a; amt -= a; absorbed += a;
  }
  if (absorbed) removeStatus(dst, (s) => s.kind === 'shield' && s.amount <= 0);
  if (dst.rules?.includes('lifeToMana') && dst.mana > 0 && amt > 0) { const a = Math.min(dst.mana, amt); dst.mana -= a; amt -= a; }
  if (dst.god) amt = Math.min(amt, Math.max(0, dst.hp - 1)); // 確かめ用の「倒れない」
  const before = dst.hp;
  dst.hp -= amt;
  if (dst.hp < 1 && hasStatus(dst, 'cheatDeath')) dst.hp = 1;
  // rewindOnLethal: 倒れるほどの一撃で、3 秒前の位置と体力に戻る（60 秒に 1 回）
  if (dst.hp <= 0 && hasRule(dst, 'rewindOnLethal') && W.now >= (dst.rewindReadyAt ?? 0)) {
    const h = historyAt(dst, W.now, 3);
    if (h) {
      dst.rewindReadyAt = W.now + 60000;
      dst.hp = Math.max(1, Math.min(dst.maxHp, h.hp));
      if (zone.free(h.x, h.y)) zone.moveTo(dst, h.x, h.y);
      dst.path = null; dst.forced = null;
      zone.fx({ k: 'vfx', name: 'rewind_lethal', on: dst.id, x: dst.x, y: dst.y }, dst.x, dst.y);
      if (dst.kind === 'player') W.markDirty(dst);
      return 0;
    }
  }
  const dealt = Math.max(0, before - dst.hp);
  if (dst.cc.sleep) removeStatus(dst, (s) => s.cc === 'sleep');
  if (dst.kind === 'monster' && src && dst.ai && !dst.ai.tauntedBy && src.team !== dst.team) {
    if (!dst.ai.target || W.rng() < 0.15) dst.ai.target = src.id;
    dst.ai.alerted = true;
  }
  if (src && src.stats && !pkt.isDot && dealt > 0 && !src.dead) {
    if (src.stats.lifeLeech > 0) heal(zone, src, src, dealt * src.stats.lifeLeech / 100, { quiet: true });
    if (src.stats.manaLeech > 0) src.mana = Math.min(manaCap(src), src.mana + dealt * src.stats.manaLeech / 100);
  }
  if (!pkt.shared && dealt > 0) {
    const mk = dst.statuses.find((s) => s.share > 0);
    if (mk) {
      const ratio = mk.share <= 1 ? mk.share : mk.share / 100; // 0〜1 の割合（25 のような % の書き方も受ける）
      for (const o of zone.queryActors(dst.x, dst.y, 12, (o) => o !== dst && !o.dead && o.statuses.some((s) => s.id === mk.id && s.src === mk.src))) {
        applyDamage(zone, src, o, { amount: dealt * ratio, type: pkt.type, pure: true, shared: true });
      }
    }
  }
  zone.fx({ k: 'dmg', id: dst.id, src: src?.id ?? null, amt: Math.round(shown), type: pkt.type, ...(pkt.crit ? { crit: true } : {}), ...(pkt.isDot ? { dot: true } : {}), ...(absorbed ? { abs: Math.round(absorbed) } : {}) }, dst.x, dst.y);
  if (dst.kind === 'player') W.markDirty(dst);
  if (pkt.crit && hasRule(src, 'tollOnCrit') && !pkt.shared) {
    const now = W.now;
    for (const o of zone.queryActors(dst.x, dst.y, 3, (o) => isEnemy(src, o) && !o.dead && !o.stats?.stunImmune)) {
      addStatus(o, { id: 'toll_stun', kind: 'debuff', cc: 'stun', src: src.id, until: now + ccDuration(500, { boss: isBoss(o) }) }, now);
    }
    zone.fx({ k: 'vfx', name: 'toll', x: dst.x, y: dst.y, r: 3 }, dst.x, dst.y);
  }
  if (dst.hp <= 0) kill(zone, dst, src, pkt);
  else {
    if (!pkt.isDot && !pkt.shared && src?.stats && dealt > 0) procs(zone, src, dst, dealt, pkt);
    if (!pkt.isDot && dst.anim !== ANIM.attack && dst.anim !== ANIM.cast) { dst.anim = ANIM.hit; dst.animUntil = W.now + 150; }
  }
  return dealt;
}

// 能力値の「〜の確率」で付く効果
function procs(zone, src, dst, dealt, pkt) {
  const W = zone.world, now = W.now, s = src.stats, boss = isBoss(dst);
  const roll = (p) => p > 0 && W.rng() * 100 < p;
  if (roll(s.stunChance) && !dst.stats.stunImmune) { addStatus(dst, { id: 'proc_stun', kind: 'debuff', cc: 'stun', src: src.id, until: now + ccDuration(400, { boss }) }, now); onStunned(zone, src, dst); }
  if (roll(s.freezeChance) && !dst.stats.stunImmune) addStatus(dst, { id: 'proc_freeze', kind: 'debuff', cc: 'stun', src: src.id, until: now + ccDuration(600, { boss }) }, now);
  if (roll(s.bleedChance)) addStatus(dst, { id: 'bleed', kind: 'dot', type: 'phys', dps: dealt * 0.1, src: src.id, until: now + 3000 }, now);
  if (roll(s.poisonChance)) addStatus(dst, { id: 'poison', kind: 'dot', type: 'poison', dps: dealt * 0.13, src: src.id, until: now + 3000, maxStacks: 5 }, now);
  if (roll(s.burnChance)) addStatus(dst, { id: 'burn', kind: 'dot', type: 'fire', dps: dealt * 0.13, src: src.id, until: now + 3000 }, now);
  if (roll(s.shockChance)) addStatus(dst, { id: 'shock', kind: 'debuff', dmgTaken: 15, src: src.id, until: now + 3000 }, now);
}

export function heal(zone, src, dst, amount, { quiet = false, echo = true } = {}) {
  if (!isActor(dst) || dst.dead || !(amount > 0)) return 0;
  const before = dst.hp;
  dst.hp = Math.min(dst.maxHp, dst.hp + amount);
  const got = dst.hp - before;
  if (got >= 1 && !quiet) zone.fx({ k: 'heal', id: dst.id, src: src?.id ?? null, amt: Math.round(got) }, dst.x, dst.y);
  // overhealShield: あふれた分を 5 秒の盾に（最大体力の 20% まで）
  if (hasRule(dst, 'overhealShield') && amount - got > 0.5) {
    const now = zone.world.now, cap = dst.maxHp * 0.2;
    const cur = dst.statuses.find((s) => s.id === 'overheal');
    const amt = Math.min(cap, (cur?.amount ?? 0) + (amount - got));
    addStatus(dst, { id: 'overheal', kind: 'shield', amount: amt, src: dst.id, until: now + 5000 }, now);
  }
  // healEcho: 仲間を回復すると、その 30% が自分にも戻る
  if (echo && src && src !== dst && hasRule(src, 'healEcho') && got > 0) heal(zone, src, src, got * 0.3, { quiet: true, echo: false });
  if (dst.kind === 'player') zone.world.markDirty(dst);
  return got;
}

export function kill(zone, dst, src, pkt = {}) {
  const W = zone.world;
  dst.dead = true; dst.hp = 0; dst.diedAt = W.now; dst.anim = ANIM.dead;
  dst.path = null; dst.action = null; dst.casting = null; dst.channel = null; dst.forced = null;
  dst.statuses = []; dst.auras = {}; dst.stances = {}; dst.reserved = 0; dst.dirtyStats = true;
  dst.cc = { stun: false, root: false, slow: 0, silence: false, fear: false, sleep: false, fearFrom: null };
  zone.fx({ k: 'death', id: dst.id, by: src?.id ?? null }, dst.x, dst.y);
  W.onKill(zone, dst, src, pkt);
}

/* ---------------- 通常攻撃 ---------------- */
export function basicRange(a) {
  if (a.kind === 'monster' && !a.clone) return Math.max(a.def.range ?? 1.3, 1.1);
  return a.weapon?.range ?? 1.4;
}
export function basicDamage(a) {
  if (a.kind === 'player' || a.clone) {
    const src = a.clone ? a.cloneOf : a;
    // 普通の攻撃は職の攻めの能力値（盗賊とモンクは器用、ほかは力）で強くなる
    const r = damageRange({ type: 'phys', base: [0, 0], weapon: 1, scale: src.attackStat ?? 'str' }, { stats: src.stats, weapon: src.weapon ?? { dmg: [1, 3] }, tags: ['attack', 'melee'] });
    return scaleRange(r, a.dmgMult ?? 1);
  }
  const ranged = a.def.ai === 'ranged' || a.def.ai === 'caster' || a.def.ai === 'summoner';
  const r = damageRange({ type: a.def.dmgType, base: a.def.dmg }, { stats: a.stats, tags: ['attack', ranged ? 'projectile' : 'melee'] });
  return scaleRange(r, a.dmgMult ?? 1);
}
export function meleeHit(zone, a, t) {
  const W = zone.world;
  const r = basicDamage(a);
  const c = rollCrit(W, a, t);
  const amount = rollDamage(r, W.rng) * c.mult;
  return applyDamage(zone, a, t, { amount, type: r.type, crit: c.crit, canMiss: true, tags: ['attack', 'melee'], basic: true });
}
