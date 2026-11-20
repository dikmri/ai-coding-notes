// 魔物・召喚・分身の動き方: 近接、遠距離、呪文、召喚、群れ、ボス。精鋭の付加、追いかける、戻る、うろつく
import { ANIM } from '../shared/schema.mjs';
import { lineOfSight, findPath, dirFromVec, nearestWalkable } from '../shared/mapgen.mjs';
import { isEnemy, hasStatus, dist, canAct, canCast, canMove, addStatus } from './actor.mjs';
import { meleeHit, basicRange, basicDamage, applyDamage } from './combat.mjs';
import { startCast, spawnMissile } from './effects.mjs';
import { rollDamage } from '../shared/calc.mjs';

// 精鋭の性質の表はデータ（eliteMods）が持つ。サーバーは引いて付けるだけ
export const ELITE_CHANCE = 0.08;
const RANGED_AI = new Set(['ranged', 'caster', 'summoner']);

export function aggroRange(m) {
  if (m.def.aggro) return m.def.aggro;
  if (m.def.boss) return 10;
  return m.owner ? 8 : 7;
}

function acquire(zone, m) {
  const center = m.owner ? zone.world.ents.get(m.owner) ?? m : m;
  const r = aggroRange(m);
  let best = null, bd = Infinity;
  for (const a of zone.queryActors(center.x, center.y, r, (a) => isEnemy(m, a) && !a.dead && !a.untargetable && !hasStatus(a, 'stealth'))) {
    const d = dist(m, a);
    // すぐ近く（2.5 マス）は木や壁の向こうでも気づく。それより遠くは見通しが要る
    if (d < bd && (d <= 2.5 || lineOfSight(zone.map, m.x, m.y, a.x, a.y, zone.block))) { bd = d; best = a; }
  }
  return best;
}

// 目当ての地点へ歩く。見通しがきけば真っすぐ、きかなければ道探し（1 回の計算で使える回数に上限）
export function walkToward(zone, m, tx, ty, dt, { stopAt = 0 } = {}) {
  const W = zone.world;
  const speed = m.stats.moveSpeed * (1 - (m.cc.slow ?? 0) / 100);
  let budget = speed * dt;
  const d0 = Math.hypot(tx - m.x, ty - m.y);
  if (d0 <= stopAt) { m.path = null; return true; }
  if (lineOfSight(zone.map, m.x, m.y, tx, ty, zone.block)) {
    m.path = null;
    const step = Math.min(budget, d0 - stopAt);
    zone.tryMove(m, m.x + ((tx - m.x) / d0) * step, m.y + ((ty - m.y) / d0) * step);
    m.dir = dirFromVec(tx - m.x, ty - m.y);
    m.moving = true;
    return d0 - step <= stopAt + 1e-3;
  }
  const goalMoved = !m.pathGoal || Math.hypot(m.pathGoal.x - tx, m.pathGoal.y - ty) > 1.5;
  if ((!m.path?.length || (goalMoved && W.now >= m.pathAt)) && W.pathBudget > 0) {
    W.pathBudget--;
    m.path = findPath(zone.map, m.x, m.y, tx, ty, { block: zone.block, maxNodes: 1500, partial: true });
    m.pathGoal = { x: tx, y: ty };
    m.pathAt = W.now + 600 + W.rng() * 300;
  }
  if (!m.path?.length) {
    const step = Math.min(budget, d0);
    zone.tryMove(m, m.x + ((tx - m.x) / d0) * step, m.y + ((ty - m.y) / d0) * step);
    m.moving = true;
    return false;
  }
  followPath(zone, m, budget);
  return false;
}

export function followPath(zone, a, budget) {
  while (budget > 1e-6 && a.path?.length) {
    const [px, py] = a.path[0];
    const dx = px - a.x, dy = py - a.y, d = Math.hypot(dx, dy);
    if (d > 1e-6) a.dir = dirFromVec(dx, dy);
    if (d <= budget) {
      if (!zone.free(px, py)) { a.path = null; break; }
      zone.moveTo(a, px, py);
      budget -= d;
      a.path.shift();
    } else {
      const nx = a.x + (dx / d) * budget, ny = a.y + (dy / d) * budget;
      if (!zone.free(nx, ny)) { a.path = null; break; }
      zone.moveTo(a, nx, ny);
      budget = 0;
    }
    a.moving = true;
  }
  if (a.path && !a.path.length) a.path = null;
}

function flee(zone, m, dt) {
  const from = zone.world.ents.get(m.cc.fearFrom);
  if (!from) return;
  const dx = m.x - from.x, dy = m.y - from.y, d = Math.hypot(dx, dy) || 1;
  const step = m.stats.moveSpeed * 0.8 * dt;
  zone.tryMove(m, m.x + (dx / d) * step, m.y + (dy / d) * step);
  m.dir = dirFromVec(dx, dy);
  m.moving = true;
}

function rangedShot(zone, m, t) {
  const r = basicDamage(m);
  const dx = t.x - m.x, dy = t.y - m.y, d = Math.hypot(dx, dy) || 1;
  spawnMissile(zone, { zone, caster: m, skill: null, rank: 1, target: t, point: { x: t.x, y: t.y }, depth: 0 }, {
    speed: 10, range: basicRange(m) + 3, radius: 0.3, dir: [dx / d, dy / d], art: m.def?.missile ?? `missile_${r.type}`, noScale: true,
    fn: (a) => {
      const W = zone.world;
      let amount = rollDamage(r, W.rng);
      const crit = W.rng() * 100 < (m.stats?.critChance ?? 5);
      if (crit) amount *= (m.stats?.critMulti ?? 150) / 100;
      applyDamage(zone, m, a, { amount, type: r.type, crit, canMiss: true, tags: ['attack', 'projectile'], basic: true });
    },
  });
}

function trySkill(zone, m, t) {
  const W = zone.world, now = W.now;
  if (!m.skills?.length || now < m.ai.nextSkill || !canCast(m)) return false;
  m.ai.nextSkill = now + 900 + W.rng() * 600;
  const d = t ? dist(m, t) : 0;
  for (const sid of m.skills) {
    const s = W.data.skills[sid];
    if (!s || (m.cds[sid] ?? 0) > now) continue;
    const isSummon = s.effects.some((e) => e.op === 'summon');
    if (isSummon) {
      const unit = s.effects.find((e) => e.op === 'summon').unit;
      const have = [...zone.actors].filter((a) => a.owner === m.id && a.unit === unit && !a.dead).length;
      if (have >= (s.effects.find((e) => e.op === 'summon').max ?? 2)) continue;
    } else if (s.target === 'enemy' || s.target === 'ground' || s.target === 'dir') {
      if (!t || d > s.range + 0.5) continue;
    } else if (s.aiRange && (!t || d > s.aiRange)) continue; // 自分の周りに効くスキルは、相手が近いときだけ
    const rank = Math.max(1, Math.floor(m.level / 5) + 1);
    startCast(zone, m, s, rank, { target: s.target === 'self' ? null : t, point: t && s.target !== 'self' ? { x: t.x, y: t.y } : { x: m.x, y: m.y } });
    return true;
  }
  return false;
}

export function updateMonster(zone, m, dt) {
  const W = zone.world, now = W.now;
  const ai = m.ai;
  if (m.until && now >= m.until) { zone.despawn(m); return; }
  let owner = null;
  if (m.owner) {
    owner = W.ents.get(m.owner);
    if (!owner || owner.dead || owner.zone !== zone || owner.removed) { zone.despawn(m); return; }
  }
  if (m.casting || m.channel) return;
  if (m.cc.fear) { flee(zone, m, dt); return; }
  if (!canAct(m)) return;
  if (ai.tauntedBy) { if (!hasStatus(m, 'taunt')) ai.tauntedBy = null; else ai.target = ai.tauntedBy; }

  let t = ai.target ? W.ents.get(ai.target) : null;
  const home = owner ?? ai.home;
  const leash = m.def.boss ? 60 : 26;
  if (t && (t.dead || t.removed || t.zone !== zone || t.untargetable || !isEnemy(m, t) || (hasStatus(t, 'stealth') && !ai.tauntedBy) || (!owner && Math.hypot(m.x - ai.home.x, m.y - ai.home.y) > leash) || (owner && dist(owner, t) > 14))) {
    t = null; ai.target = null;
    if (!owner && Math.hypot(m.x - ai.home.x, m.y - ai.home.y) > leash) ai.returning = true;
  }
  if (!t && !ai.returning && now >= ai.nextScan) {
    ai.nextScan = now + 350 + W.rng() * 250;
    t = acquire(zone, m);
    if (t) {
      ai.target = t.id;
      if (m.def.ai === 'swarm' || m.elite?.length) for (const o of zone.queryActors(m.x, m.y, 8, (o) => o.ai && o.team === m.team && !o.ai.target && !o.owner)) { o.ai.target = t.id; }
    }
  }
  if (m.def.boss && !ai.enraged && m.hp < m.maxHp * 0.5) {
    ai.enraged = true;
    addStatus(m, { id: 'enrage', kind: 'buff', src: m.id, until: Infinity, mods: [{ key: 'attackSpeed', mode: 'inc', value: 25 }, { key: 'moveSpeed', mode: 'inc', value: 15 }] }, now);
    zone.fx({ k: 'vfx', name: 'enrage', on: m.id }, m.x, m.y);
    W.zoneSys(zone, `${m.name}が怒り狂った！`);
  }

  if (!t) {
    if (owner) {
      const d = dist(m, owner);
      if (d > 20) { const p = nearestWalkable(zone.map, owner.x + 1, owner.y, 3, zone.block); if (p) zone.moveTo(m, p.x, p.y); }
      else if (d > 3.5 && canMove(m)) walkToward(zone, m, owner.x, owner.y, dt, { stopAt: 2.5 });
      return;
    }
    const dh = Math.hypot(m.x - ai.home.x, m.y - ai.home.y);
    if (ai.returning) {
      if (canMove(m)) walkToward(zone, m, ai.home.x, ai.home.y, dt, { stopAt: 1 });
      if (dh < 1.5) { ai.returning = false; m.hp = m.maxHp; }
      return;
    }
    if (ai.wander && canMove(m)) {
      if (walkToward(zone, m, ai.wander.x, ai.wander.y, dt, { stopAt: 0.2 }) || now > ai.wander.until) ai.wander = null;
      return;
    }
    if (now >= ai.nextWander) {
      ai.nextWander = now + 3000 + W.rng() * 5000;
      if (W.rng() < 0.5) {
        const r = Math.max(1, ai.homeR ?? 3);
        const x = ai.home.x + (W.rng() * 2 - 1) * r, y = ai.home.y + (W.rng() * 2 - 1) * r;
        if (zone.free(x, y) && lineOfSight(zone.map, m.x, m.y, x, y, zone.block)) ai.wander = { x, y, until: now + 4000 };
      }
    }
    return;
  }

  if (trySkill(zone, m, t)) return;
  const d = dist(m, t);
  const range = basicRange(m);
  const ranged = RANGED_AI.has(m.def.ai);
  const reach = ranged ? range : range + (t.radius ?? 0.4) * 0.5;
  if (d > reach || (ranged && !lineOfSight(zone.map, m.x, m.y, t.x, t.y, zone.block))) {
    if (canMove(m)) walkToward(zone, m, t.x, t.y, dt, { stopAt: ranged ? range * 0.8 : reach * 0.85 });
    return;
  }
  m.path = null;
  m.dir = dirFromVec(t.x - m.x, t.y - m.y);
  if (now >= m.attackReadyAt) {
    m.attackReadyAt = now + 1000 / Math.max(0.2, m.stats.aps);
    m.anim = ANIM.attack; m.animUntil = now + Math.min(450, 900 / m.stats.aps);
    if (ranged) rangedShot(zone, m, t); else meleeHit(zone, m, t);
  }
}
