// スキルの効果の部品（schema の OPS）を順に実行する仕組み。プレイヤーも魔物も同じ部品を使う。
// ctx = { zone, caster, skill, rank, target, point:{x,y}, targets?, knockFrom?, depth }
import { OPS, ANIM } from '../shared/schema.mjs';
import { damageRange, rollDamage, dotDps, ccDuration, areaMult, durationMult, mult, skillCost, skillCooldown, castTime } from '../shared/calc.mjs';
import { dirFromVec, vecFromDir, nearestWalkable } from '../shared/mapgen.mjs';
import { addStatus, removeStatus, isEnemy, isAlly, isActor, isBoss, hasStatus, historyAt, manaCap, dist, canCast } from './actor.mjs';
import { applyDamage, heal as doHeal, rollCrit, breakStealth, onStunned } from './combat.mjs';

const MAX_DEPTH = 10;
const norm = (dx, dy) => { const d = Math.hypot(dx, dy); return d > 1e-6 ? [dx / d, dy / d] : [0, 0]; };

export function makeCtx(zone, caster, skill, rank, { target = null, point = null } = {}) {
  return { zone, caster, skill, rank: Math.max(1, rank | 0), target, point: point ?? (target ? { x: target.x, y: target.y } : { x: caster.x, y: caster.y }), targets: null, depth: 0 };
}

export function runEffects(ctx, list) {
  if (!list?.length || (ctx.depth ?? 0) > MAX_DEPTH) return;
  const local = { ...ctx, depth: (ctx.depth ?? 0) + 1 };
  const W = ctx.zone.world;
  for (const e of list) {
    const h = HANDLERS[e.op];
    if (!h) { W.warnOnce?.('effects.unknownOp', { op: e.op, skill: ctx.skill?.id }); continue; }
    try { h(local, e); } catch (err) { W.logError?.('effects.exception', { op: e.op, skill: ctx.skill?.id }, err); }
  }
}

/* ---------------- 共通の道具 ---------------- */
const nowOf = (ctx) => ctx.zone.world.now;
function posOf(ctx, at) {
  if (at === 'self') return { x: ctx.caster.x, y: ctx.caster.y };
  if (at === 'target' && ctx.target && !ctx.target.removed) return { x: ctx.target.x, y: ctx.target.y };
  return { x: ctx.point.x, y: ctx.point.y };
}
function aimDir(ctx, from = ctx.caster) {
  const t = ctx.target && !ctx.target.removed && ctx.target !== ctx.caster ? ctx.target : ctx.point;
  const [ux, uy] = norm(t.x - from.x, t.y - from.y);
  if (ux || uy) return [ux, uy];
  return vecFromDir(ctx.caster.dir ?? 0);
}
const targetsOf = (ctx) => ctx.targets ?? (ctx.target ? [ctx.target] : []);
// 部品に target が無いときは、スキルの対象に合わせる（味方へのスキルなら味方、それ以外は自分）
const defTarget = (ctx) => (ctx.skill?.target === 'ally' ? 'ally' : 'self');
const hasRule = (a, r) => !!a?.rules?.includes(r);
const dur = (ctx, sec, dflt) => Math.max(0, (Number(sec ?? dflt) || 0) * 1000 * durationMult(ctx.caster.stats));
const rankF = (ctx, perRank) => 1 + ((Number(perRank) || 0) * (ctx.rank - 1)) / 100;
export const scaleMods = (mods, rank) => (mods ?? []).map((m) => ({ key: m.key, mode: m.mode, value: (Array.isArray(m.value) ? m.value[1] : m.value) + (m.perRank ?? 0) * (rank - 1) }));
function affectsPred(caster, affects) {
  if (affects === 'allies') return (a) => isAlly(caster, a) && !a.dead;
  if (affects === 'self') return (a) => a === caster;
  if (affects === 'all') return (a) => isActor(a) && !a.dead;
  return (a) => isEnemy(caster, a) && !a.dead && !a.untargetable;
}
function groupTargets(ctx, which, radius) {
  const { caster, zone } = ctx;
  switch (which) {
    case 'ally': return ctx.target && isAlly(caster, ctx.target) && !ctx.target.dead ? [ctx.target] : [caster];
    case 'target': return ctx.target && !ctx.target.dead ? [ctx.target] : [];
    case 'party': {
      const r = radius ?? 20;
      const pid = caster.partyId;
      return zone.queryActors(caster.x, caster.y, r, (a) => !a.dead && (a === caster || (pid && a.partyId === pid) || (caster.kind === 'monster' && isAlly(caster, a)) || (a.owner && a.owner === caster.id)));
    }
    case 'allies': return zone.queryActors(caster.x, caster.y, radius ?? 8, (a) => isAlly(caster, a) && !a.dead);
    case 'enemies': return zone.queryActors(ctx.point.x, ctx.point.y, radius ?? 3, (a) => isEnemy(caster, a) && !a.dead);
    default: return [caster];
  }
}
function clampDist(from, to, maxD) {
  const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy);
  if (d <= maxD || d < 1e-6) return { x: to.x, y: to.y };
  return { x: from.x + (dx / d) * maxD, y: from.y + (dy / d) * maxD };
}
function vfx(ctx, o) { ctx.zone.fx({ k: 'vfx', name: ctx.skill?.vfx ?? ctx.skill?.id ?? 'fx', src: ctx.caster.id, ...o }, o.x ?? ctx.caster.x, o.y ?? ctx.caster.y); }
function addObject(ctx, o) {
  const zone = ctx.zone;
  const obj = { id: zone.world.newId(), kind: 'object', dir: 0, anim: 0, owner: ctx.caster.id, team: ctx.caster.team, skillId: ctx.skill?.id ?? null, ...o };
  zone.add(obj);
  return obj;
}

// スキルのダメージを 1 体に当てる
export function dealHit(ctx, t, spec, extraTags = []) {
  if (!spec || !t || t.dead) return 0;
  const { caster, zone } = ctx;
  const W = zone.world;
  const tags = [...(ctx.skill?.tags ?? []), ...extraTags];
  const src = caster.clone ? caster.cloneOf : caster;
  let r = damageRange(spec, { rank: ctx.rank, stats: src.stats, weapon: src.weapon ?? (spec.weapon ? { dmg: [1, 3] } : null), tags });
  let amount = rollDamage(r, W.rng) * (caster.dmgMult ?? 1);
  if (spec.targetLifePct) amount += (t.maxHp * spec.targetLifePct) / 100;
  const c = rollCrit(W, caster, t);
  amount *= c.mult;
  const canMiss = tags.includes('attack') && !tags.includes('area');
  return applyDamage(zone, caster, t, { amount, type: r.type, crit: c.crit, canMiss, tags, skillId: ctx.skill?.id });
}

/* ---------------- 部品 ---------------- */
export const HANDLERS = {
  hit(ctx, e) {
    const r = (Number(e.radius) || 0) * areaMult(ctx.caster.stats);
    if (r > 0) {
      const c = posOf(ctx, e.at ?? 'target');
      const hits = ctx.zone.queryActors(c.x, c.y, r, affectsPred(ctx.caster, 'enemies'));
      for (const a of hits) dealHit(ctx, a, e.dmg, ['area']);
      ctx.targets = hits;
      vfx(ctx, { x: c.x, y: c.y, r });
    } else {
      const t = ctx.target;
      if (t && isEnemy(ctx.caster, t) && !t.dead) dealHit(ctx, t, e.dmg);
    }
  },

  projectile(ctx, e) {
    const n = Math.max(1, Math.min(12, (Number(e.count) || 1) + (ctx.caster.stats?.projectileCount ?? 0)));
    const spread = ((e.spread ?? (n > 1 ? 30 : 0)) * Math.PI) / 180;
    const [dx, dy] = aimDir(ctx);
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? base - spread / 2 + (spread * i) / (n - 1) : base;
      spawnMissile(ctx.zone, ctx, { speed: e.speed ?? 10, range: e.range ?? 8, radius: e.radius ?? 0.3, pierce: e.pierce ?? 0, chain: e.chain ?? 0, homing: !!e.homing, onHit: e.onHit ?? [], dir: [Math.cos(a), Math.sin(a)], art: e.art ?? ctx.skill?.vfx });
    }
  },

  area(ctx, e) {
    const am = areaMult(ctx.caster.stats);
    const shape = e.shape ?? 'circle';
    const c = posOf(ctx, e.at ?? 'point');
    const dirv = aimDir(ctx, e.at === 'point' && ctx.caster ? ctx.caster : { x: c.x, y: c.y });
    const r = (e.radius ?? 3) * am, len = (e.length ?? 6) * am, width = (e.width ?? 1) * am;
    const angle = ((e.angle ?? 90) * Math.PI) / 180;
    const fire = () => {
      const reach = shape === 'line' ? len + 1 : r + 0.5;
      const hits = ctx.zone.queryActors(c.x, c.y, reach, affectsPred(ctx.caster, e.affects ?? 'enemies')).filter((a) => inShape(a, c, shape, r, angle, len, width, dirv));
      for (const a of hits) runEffects({ ...ctx, target: a, point: { x: a.x, y: a.y }, targets: null, knockFrom: c }, e.onHit);
    };
    vfx(ctx, { x: c.x, y: c.y, r: shape === 'line' ? undefined : r, shape, angle: e.angle, len: shape === 'line' ? len : undefined, width: shape === 'line' ? width : undefined, dir: dirFromVec(dirv[0], dirv[1]), delay: e.delay ?? 0 });
    if (e.delay > 0) ctx.zone.later(e.delay, fire); else fire();
  },

  zone(ctx, e) {
    const c = posOf(ctx, e.at ?? 'point');
    addObject(ctx, {
      objKind: 'zone', art: e.art ?? ctx.skill?.vfx ?? 'zone', x: c.x, y: c.y, radius: (e.radius ?? 3) * areaMult(ctx.caster.stats),
      until: nowOf(ctx) + dur(ctx, e.duration, 3), tickMs: Math.max(100, (e.tick ?? 0.5) * 1000), nextTick: nowOf(ctx),
      affects: e.affects ?? 'enemies', onTick: e.onTick ?? [], ctx: { ...ctx, targets: null },
    });
  },

  dash(ctx, e) {
    const { caster } = ctx;
    let dest;
    if ((e.to ?? 'target') === 'target' && ctx.target && !ctx.target.removed) {
      const t = ctx.target, d = dist(caster, t);
      const k = d > 1e-6 ? Math.max(0, d - 0.9) / d : 0;
      dest = { x: caster.x + (t.x - caster.x) * k, y: caster.y + (t.y - caster.y) * k };
    } else dest = { ...ctx.point };
    dest = clampDist(caster, dest, e.maxDist ?? 6);
    caster.forced = { kind: 'dash', tx: dest.x, ty: dest.y, speed: e.speed ?? 15, passHit: e.passHit, onArrive: e.onArrive, hitSet: new Set(), ctx: { ...ctx, targets: null }, until: nowOf(ctx) + 2000 };
    caster.path = null;
  },

  blink(ctx, e) {
    const { caster, zone } = ctx;
    const maxD = e.maxDist ?? 6;
    let dest;
    if (e.to === 'behindTarget' && ctx.target) {
      const t = ctx.target;
      if (dist(caster, t) > maxD + 1.5) return;
      const [ux, uy] = norm(t.x - caster.x, t.y - caster.y);
      dest = { x: t.x + ux * 1.0, y: t.y + uy * 1.0 };
    } else if (e.to === 'ally' && ctx.target && isAlly(caster, ctx.target)) {
      if (dist(caster, ctx.target) > maxD + 1.5) return;
      dest = { x: ctx.target.x + 0.6, y: ctx.target.y };
    } else dest = clampDist(caster, ctx.point, maxD);
    const p = zone.free(dest.x, dest.y) ? dest : nearestWalkable(zone.map, dest.x, dest.y, 3, zone.block);
    if (!p) return;
    vfx(ctx, { x: caster.x, y: caster.y, to: { x: p.x, y: p.y } });
    zone.moveTo(caster, p.x, p.y);
    caster.path = null;
  },

  hook(ctx, e) {
    spawnMissile(ctx.zone, ctx, { speed: e.speed ?? 14, range: e.range ?? 8, radius: e.width ?? 0.4, hook: true, onHit: e.onHit ?? [], dir: aimDir(ctx), art: e.art ?? ctx.skill?.vfx ?? 'hook', noScale: true });
  },

  knockback(ctx, e) {
    const { caster } = ctx;
    for (const t of targetsOf(ctx)) {
      if (!isActor(t) || t.dead || !isEnemy(caster, t)) continue;
      const from = ctx.knockFrom && Math.hypot(ctx.knockFrom.x - t.x, ctx.knockFrom.y - t.y) > 0.05 ? ctx.knockFrom : caster;
      let [ux, uy] = norm(t.x - from.x, t.y - from.y);
      if (!ux && !uy) [ux, uy] = vecFromDir(caster.dir);
      const d = (e.dist ?? 2) * (isBoss(t) ? 0.3 : 1);
      pushActor(ctx.zone, t, t.x + ux * d, t.y + uy * d, 12);
    }
  },

  vortex(ctx, e) {
    const c = posOf(ctx, e.at ?? 'point');
    addObject(ctx, { objKind: 'vortex', art: e.art ?? ctx.skill?.vfx ?? 'vortex', x: c.x, y: c.y, radius: (e.radius ?? 3) * areaMult(ctx.caster.stats), strength: e.strength ?? 3, until: nowOf(ctx) + dur(ctx, e.duration, 2), ctx: { ...ctx, targets: null } });
  },

  buff(ctx, e) {
    const now = nowOf(ctx);
    const mods = scaleMods(e.mods, ctx.rank);
    const id = e.id ?? ctx.skill?.id ?? 'buff';
    for (const t of groupTargets(ctx, e.target ?? defTarget(ctx), e.radius)) {
      addStatus(t, { id, kind: 'buff', mods, src: ctx.caster.id, until: now + dur(ctx, e.duration, 5), maxStacks: e.maxStacks ?? 1 }, now);
      ctx.zone.fx({ k: 'vfx', name: id, on: t.id, dur: dur(ctx, e.duration, 5) }, t.x, t.y);
    }
  },

  debuff(ctx, e) {
    const { caster } = ctx;
    const now = nowOf(ctx);
    let ts;
    if (e.affects === 'self') ts = [caster];
    else if (e.radius) { const c = posOf(ctx, e.at ?? 'target'); ts = ctx.zone.queryActors(c.x, c.y, e.radius, affectsPred(caster, e.affects ?? 'enemies')); }
    else ts = targetsOf(ctx).filter((t) => (e.affects === 'allies' ? isAlly(caster, t) : e.affects === 'all' ? isActor(t) : isEnemy(caster, t)));
    for (const t of ts) applyDebuff(ctx.zone, caster, t, e, ctx.rank, dur(ctx, e.duration, 2), now);
  },

  dot(ctx, e) {
    const now = nowOf(ctx);
    const src = ctx.caster.clone ? ctx.caster.cloneOf : ctx.caster;
    const dps = dotDps(e, { rank: ctx.rank, stats: src.stats, tags: ctx.skill?.tags ?? [] }) * (ctx.caster.dmgMult ?? 1);
    for (const t of targetsOf(ctx)) {
      if (!isEnemy(ctx.caster, t) || t.dead) continue;
      addStatus(t, { id: e.id ?? `dot:${ctx.skill?.id ?? 'x'}`, kind: 'dot', type: e.type ?? 'phys', dps, src: ctx.caster.id, until: now + dur(ctx, e.duration, 3), maxStacks: e.maxStacks ?? 1 }, now);
    }
  },

  heal(ctx, e) {
    for (const t of groupTargets(ctx, e.target ?? defTarget(ctx), e.radius)) {
      const amt = ((Number(e.amount) || 0) + ((Number(e.pct) || 0) / 100) * t.maxHp) * rankF(ctx, e.perRank) * mult(ctx.caster.stats, 'healPower');
      doHeal(ctx.zone, ctx.caster, t, amt);
    }
  },

  shield(ctx, e) {
    const now = nowOf(ctx);
    // radius があれば範囲の仲間全員（使い手も含む）
    const which = e.radius ? (e.target === 'party' ? 'party' : 'allies') : e.target ?? defTarget(ctx);
    for (const t of groupTargets(ctx, which, e.radius)) {
      const amount = (Number(e.amount) || 20) * rankF(ctx, e.perRank) * mult(ctx.caster.stats, 'shieldPower');
      addStatus(t, { id: `shield:${ctx.skill?.id ?? 'x'}`, kind: 'shield', amount, src: ctx.caster.id, until: now + dur(ctx, e.duration, 5) }, now);
      ctx.zone.fx({ k: 'vfx', name: 'shield', on: t.id, amt: Math.round(amount) }, t.x, t.y);
    }
  },

  summon(ctx, e) {
    const { zone, caster } = ctx;
    const W = zone.world;
    const def = W.data.monsters[e.unit];
    if (!def) { W.warnOnce('effects.unknownUnit', { unit: e.unit, skill: ctx.skill?.id }); return; }
    // oneGreatMinion: 召喚の味方は全部で 1 体だけ（そのかわり 3 倍の強さ）
    const great = hasRule(caster, 'oneGreatMinion');
    const count = great ? 1 : Math.max(1, Number(e.count) || 1);
    const max = great ? 1 : Math.max(1, (Number(e.max) || count) + (caster.kind === 'player' ? caster.stats?.minionCount ?? 0 : 0));
    const mine = [...zone.actors].filter((a) => a.owner === caster.id && !a.clone && (great || a.unit === e.unit) && !a.dead).sort((a, b) => a.bornAt - b.bornAt);
    for (let i = 0; i < count; i++) {
      while (mine.length >= max) zone.despawn(mine.shift());
      const ang = W.rng() * Math.PI * 2;
      const p = nearestWalkable(zone.map, caster.x + Math.cos(ang) * 1.2, caster.y + Math.sin(ang) * 1.2, 3, zone.block) ?? { x: caster.x, y: caster.y };
      const m = W.makeMonster(def, { x: p.x, y: p.y, team: caster.team, owner: caster.id, unit: e.unit, level: Number.isFinite(e.level) ? e.level : caster.level, rankMult: rankF(ctx, e.perRank) * (great ? 3 : 1), until: e.duration ? nowOf(ctx) + dur(ctx, e.duration) : null, summoner: caster });
      zone.add(m);
      mine.push(m);
    }
    vfx(ctx, { x: caster.x, y: caster.y });
  },

  aura(ctx, e) {
    const { caster } = ctx;
    const key = ctx.skill?.id ?? 'aura';
    if (caster.auras[key]) {
      caster.reserved = Math.max(0, caster.reserved - (caster.auras[key].reserve ?? 0));
      delete caster.auras[key];
      ctx.zone.fx({ k: 'vfx', name: key, on: caster.id, off: true }, caster.x, caster.y);
      return;
    }
    const reserve = Math.max(0, Number(e.reserve) || 0);
    if (caster.reserved + reserve > 95) return;
    caster.auras[key] = { key, radius: e.radius ?? 8, mods: scaleMods(e.mods, ctx.rank), affects: e.affects ?? 'allies', reserve };
    caster.reserved += reserve;
    caster.mana = Math.min(caster.mana, manaCap(caster));
    ctx.zone.fx({ k: 'vfx', name: key, on: caster.id, r: e.radius ?? 8, aura: true }, caster.x, caster.y);
  },

  trap(ctx, e) {
    const { zone, caster } = ctx;
    const max = Math.max(1, Number(e.max) || 3);
    const mine = [...zone.objects].filter((o) => o.objKind === 'trap' && o.owner === caster.id && o.skillId === (ctx.skill?.id ?? null)).sort((a, b) => a.id - b.id);
    while (mine.length >= max) zone.remove(mine.shift());
    const c = zone.free(ctx.point.x, ctx.point.y) ? ctx.point : { x: caster.x, y: caster.y };
    addObject(ctx, { objKind: 'trap', art: e.art ?? ctx.skill?.vfx ?? 'trap', x: c.x, y: c.y, radius: e.triggerRadius ?? 1, armAt: nowOf(ctx) + (e.armTime ?? 0.5) * 1000, until: nowOf(ctx) + dur(ctx, e.duration, 20), onTrigger: e.onTrigger ?? [], ctx: { ...ctx, targets: null } });
  },

  wall(ctx, e) {
    const { zone, caster } = ctx;
    const c = ctx.point;
    // 使い手から地点への向きに沿って、地点を中心に伸びる
    let [px, py] = norm(c.x - caster.x, c.y - caster.y);
    if (!px && !py) [px, py] = vecFromDir(caster.dir);
    const len = Math.max(1, Number(e.length) || 5);
    const tiles = new Set();
    for (let k = -len / 2; k <= len / 2 + 1e-9; k += 0.5) {
      const tx = Math.floor(c.x + px * k), ty = Math.floor(c.y + py * k);
      if (!zone.walkableTile(tx, ty)) continue;
      if (Math.floor(caster.x) === tx && Math.floor(caster.y) === ty) continue;
      tiles.add(ty * zone.map.w + tx);
    }
    const until = nowOf(ctx) + dur(ctx, e.duration, 4);
    for (const i of tiles) {
      const tx = i % zone.map.w, ty = (i - tx) / zone.map.w;
      zone.block[i]++;
      addObject(ctx, { objKind: 'wall', art: e.art ?? ctx.skill?.vfx ?? 'wall_earth', x: tx + 0.5, y: ty + 0.5, tile: i, until });
    }
  },

  rewind(ctx, e) {
    const { caster, zone } = ctx;
    const h = historyAt(caster, nowOf(ctx), e.seconds ?? 3);
    if (!h) return;
    vfx(ctx, { x: caster.x, y: caster.y, to: { x: h.x, y: h.y } });
    if (zone.free(h.x, h.y)) zone.moveTo(caster, h.x, h.y);
    if (!caster.dead) caster.hp = Math.min(caster.maxHp, Math.max(caster.hp, h.hp));
    caster.path = null; caster.forced = null;
    if (caster.kind === 'player') zone.world.markDirty(caster);
  },

  stealth(ctx, e) {
    const { caster, zone } = ctx;
    const now = nowOf(ctx);
    addStatus(caster, { id: 'stealth', kind: 'buff', src: caster.id, until: now + dur(ctx, e.duration, 4), breakOnAttack: e.breakOnAttack ?? true }, now);
    for (const m of zone.queryActors(caster.x, caster.y, 30, (a) => a.ai && a.ai.target === caster.id)) { m.ai.target = null; m.ai.nextScan = now + 300; }
    zone.fx({ k: 'cc', id: caster.id, cc: 'stealth', dur: dur(ctx, e.duration, 4) }, caster.x, caster.y);
  },

  taunt(ctx, e) {
    const { caster, zone } = ctx;
    const now = nowOf(ctx);
    for (const t of zone.queryActors(caster.x, caster.y, e.radius ?? 6, affectsPred(caster, 'enemies'))) {
      const d = ccDuration(dur(ctx, e.duration, 3), { boss: isBoss(t) });
      addStatus(t, { id: 'taunt', kind: 'debuff', src: caster.id, until: now + d }, now);
      if (t.ai) { t.ai.tauntedBy = caster.id; t.ai.target = caster.id; }
      zone.fx({ k: 'cc', id: t.id, cc: 'taunt', dur: d, by: caster.id }, t.x, t.y);
    }
  },

  swap(ctx) {
    const { caster, zone } = ctx;
    const t = ctx.target;
    if (!t || t === caster || !isActor(t) || t.dead || isBoss(t)) return;
    const cx = caster.x, cy = caster.y;
    vfx(ctx, { x: cx, y: cy, to: { x: t.x, y: t.y } });
    zone.moveTo(caster, t.x, t.y);
    zone.moveTo(t, cx, cy);
    caster.path = null; t.path = null;
  },

  revive(ctx, e) {
    const { caster, zone } = ctx;
    for (const t of zone.query(caster.x, caster.y, e.radius ?? 6, (a) => a.kind === 'player' && a.dead && a.team === caster.team)) {
      zone.world.revive(t, e.hpPct ?? 50);
    }
  },

  cheatDeath(ctx, e) {
    const now = nowOf(ctx);
    for (const t of groupTargets(ctx, e.target ?? defTarget(ctx), e.radius)) {
      addStatus(t, { id: 'cheatDeath', kind: 'buff', src: ctx.caster.id, until: now + dur(ctx, e.duration, 4), healAfterPct: e.healAfterPct ?? 0 }, now);
      ctx.zone.fx({ k: 'vfx', name: 'cheatDeath', on: t.id, dur: dur(ctx, e.duration, 4) }, t.x, t.y);
    }
  },

  mark(ctx, e) {
    const now = nowOf(ctx);
    for (const t of targetsOf(ctx)) {
      if (!isEnemy(ctx.caster, t) || t.dead) continue;
      addStatus(t, { id: e.id ?? `mark:${ctx.skill?.id ?? 'x'}`, kind: 'debuff', mods: e.mods ? scaleMods(e.mods, ctx.rank) : undefined, dmgTaken: e.dmgTaken, share: e.share, src: ctx.caster.id, until: now + dur(ctx, e.duration, 5) }, now);
      ctx.zone.fx({ k: 'cc', id: t.id, cc: 'mark', dur: dur(ctx, e.duration, 5) }, t.x, t.y);
    }
  },

  execute(ctx, e) {
    const t = ctx.target;
    if (!t || t.dead || !isEnemy(ctx.caster, t)) return;
    if ((t.hp / t.maxHp) * 100 <= (e.thresholdPct ?? 20)) {
      // ボスは即死せず、最大体力の 8% のダメージ
      if (isBoss(t) || t.def?.boss) applyDamage(ctx.zone, ctx.caster, t, { amount: t.maxHp * 0.08, type: e.dmg?.type ?? 'shadow', pure: true, skillId: ctx.skill?.id });
      else applyDamage(ctx.zone, ctx.caster, t, { amount: t.hp + t.maxHp, type: e.dmg?.type ?? 'shadow', pure: true, skillId: ctx.skill?.id });
      vfx(ctx, { x: t.x, y: t.y, execute: true });
    } else if (e.dmg) dealHit(ctx, t, e.dmg);
  },

  // 対象から近くの別の敵へ jumps 回跳び移り、そのたびに onHit。使い手も最後の敵のそばへ移る
  bounce(ctx, e) {
    const { caster, zone } = ctx;
    const radius = Number(e.radius) || 4;
    let cur = ctx.target && !ctx.target.dead && isEnemy(caster, ctx.target) ? ctx.target
      : zone.queryActors(ctx.point.x, ctx.point.y, radius, affectsPred(caster, 'enemies')).sort((a, b) => Math.hypot(a.x - ctx.point.x, a.y - ctx.point.y) - Math.hypot(b.x - ctx.point.x, b.y - ctx.point.y))[0];
    if (!cur) return;
    const hit = new Set();
    let prev = { x: caster.x, y: caster.y };
    for (let j = 0; j <= Math.max(0, Number(e.jumps) || 0) && cur; j++) {
      hit.add(cur.id);
      zone.fx({ k: 'vfx', name: ctx.skill?.vfx ?? 'bounce', src: caster.id, x: prev.x, y: prev.y, to: { x: cur.x, y: cur.y }, bounce: j }, cur.x, cur.y);
      runEffects({ ...ctx, target: cur, point: { x: cur.x, y: cur.y }, targets: null }, e.onHit);
      prev = { x: cur.x, y: cur.y };
      const from = cur;
      cur = zone.queryActors(from.x, from.y, radius, (a) => isEnemy(caster, a) && !a.dead && !a.untargetable && !hit.has(a.id)).sort((a, b) => dist(a, from) - dist(b, from))[0] ?? null;
    }
    const [ux, uy] = norm(caster.x - prev.x, caster.y - prev.y);
    const land = nearestWalkable(zone.map, prev.x + ux * 0.8, prev.y + uy * 0.8, 3, zone.block);
    if (land) zone.moveTo(caster, land.x, land.y);
    caster.path = null;
  },

  delayed(ctx, e) {
    const saved = { ...ctx, targets: ctx.targets ? [...ctx.targets] : null };
    ctx.zone.later(Math.max(0, Number(e.delay) || 1), () => {
      if (saved.target && (saved.target.dead || saved.target.removed || saved.target.zone !== saved.zone)) saved.target = null;
      if (saved.targets) saved.targets = saved.targets.filter((t) => !t.dead && !t.removed);
      runEffects(saved, e.effects);
    });
  },

  stance(ctx, e) {
    const { caster } = ctx;
    const now = nowOf(ctx);
    const key = ctx.skill?.id ?? e.group ?? 'stance';
    if (hasRule(caster, 'twoStances')) {
      // 構えを 2 つまで同時に保てる（同じ group でも）。どちらも効き目は半分
      const sid = `stance:${key}`;
      if (caster.stances[key]) { delete caster.stances[key]; removeStatus(caster, (s) => s.id === sid); return; }
      const held = Object.keys(caster.stances).sort((a, b) => caster.stances[a] - caster.stances[b]);
      while (held.length >= 2) { const old = held.shift(); delete caster.stances[old]; removeStatus(caster, (s) => s.id === `stance:${old}`); }
      caster.stances[key] = now;
      addStatus(caster, { id: sid, kind: 'stance', mods: scaleMods(e.mods, ctx.rank).map((m) => ({ ...m, value: m.value * 0.5 })), src: caster.id, until: Infinity, skill: key }, now);
      ctx.zone.fx({ k: 'vfx', name: key, on: caster.id, stance: key }, caster.x, caster.y);
      return;
    }
    const g = e.group ?? 'stance';
    const cur = caster.stances[g];
    removeStatus(caster, (s) => s.id === `stance:${g}`);
    if (cur === key) { delete caster.stances[g]; return; }
    caster.stances[g] = key;
    addStatus(caster, { id: `stance:${g}`, kind: 'stance', mods: scaleMods(e.mods, ctx.rank), src: caster.id, until: Infinity, skill: key }, now);
    ctx.zone.fx({ k: 'vfx', name: key, on: caster.id, stance: g }, caster.x, caster.y);
  },

  channel(ctx, e) {
    const { caster } = ctx;
    caster.channel = { until: nowOf(ctx) + Math.max(0.1, Number(e.duration) || 2) * 1000, tickMs: Math.max(100, (Number(e.tick) || 0.25) * 1000), next: nowOf(ctx), onTick: e.onTick ?? [], ctx: { ...ctx, targets: null } };
    caster.path = null;
    caster.anim = ANIM.cast;
  },

  reflect(ctx, e) {
    const now = nowOf(ctx);
    addStatus(ctx.caster, { id: 'reflect', kind: 'buff', src: ctx.caster.id, until: now + dur(ctx, e.duration, 3) }, now);
    ctx.zone.fx({ k: 'vfx', name: 'reflect', on: ctx.caster.id, dur: dur(ctx, e.duration, 3) }, ctx.caster.x, ctx.caster.y);
  },

  cleanse(ctx, e) {
    for (const t of groupTargets(ctx, e.target ?? defTarget(ctx), e.radius)) {
      const gone = removeStatus(t, (s) => s.kind === 'debuff' || s.kind === 'dot');
      if (t.ai && gone.some((s) => s.id === 'taunt')) t.ai.tauntedBy = null;
      ctx.zone.fx({ k: 'vfx', name: 'cleanse', on: t.id }, t.x, t.y);
    }
  },

  leap(ctx, e) {
    const { caster, zone } = ctx;
    let dest = (e.to === 'ally' || e.to === 'target') && ctx.target ? { x: ctx.target.x, y: ctx.target.y } : ctx.point;
    dest = clampDist(caster, dest, e.maxDist ?? 6);
    const p = (zone.free(dest.x, dest.y) ? dest : nearestWalkable(zone.map, dest.x, dest.y, 3, zone.block)) ?? { x: caster.x, y: caster.y };
    const d = dist(caster, p);
    caster.forced = { kind: 'leap', tx: p.x, ty: p.y, speed: Math.max(6, d / 0.45), onArrive: e.onLand, ctx: { ...ctx, targets: null }, until: nowOf(ctx) + 1500 };
    caster.untargetable = true;
    caster.path = null;
    vfx(ctx, { x: caster.x, y: caster.y, to: { x: p.x, y: p.y }, leap: true });
  },

  clone(ctx, e) {
    const { caster, zone } = ctx;
    const W = zone.world;
    const n = Math.max(1, Math.min(6, Number(e.count) || 1));
    const made = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + W.rng();
      const p = nearestWalkable(zone.map, caster.x + Math.cos(ang) * 1.3, caster.y + Math.sin(ang) * 1.3, 3, zone.block) ?? { x: caster.x, y: caster.y };
      const c = W.makeClone(caster, { x: p.x, y: p.y, until: nowOf(ctx) + dur(ctx, e.duration, 5), dmgPct: e.dmgPct ?? 50 });
      zone.add(c);
      made.push(c);
    }
    // 近くの魔物の半分は分身へ気を取られる
    for (const m of zone.queryActors(caster.x, caster.y, 12, (a) => a.ai && a.ai.target === caster.id && !a.ai.tauntedBy)) {
      if (W.rng() < 0.5) m.ai.target = made[Math.floor(W.rng() * made.length)].id;
    }
  },
};

/* ---------------- 部品の実行の道具 ---------------- */
export function applyDebuff(zone, caster, t, e, rank, durationMs, now) {
  if (!isActor(t) || t.dead) return;
  if ((e.cc === 'stun' || e.cc === 'sleep') && t.stats?.stunImmune) return;
  const d = e.cc ? ccDuration(durationMs, { boss: isBoss(t) }) : durationMs;
  addStatus(t, { id: e.id ?? e.cc ?? 'debuff', kind: 'debuff', cc: e.cc, value: e.value, mods: e.mods ? scaleMods(e.mods, rank) : undefined, src: caster.id, until: now + d }, now);
  if (e.cc === 'stun') onStunned(zone, caster, t);
  if (e.cc) {
    if (e.cc !== 'slow' && e.cc !== 'root') { t.casting = null; t.channel = null; }
    if (e.cc === 'stun' || e.cc === 'sleep' || e.cc === 'root') t.path = null;
    if (e.cc === 'fear' && t.ai) t.ai.target = null;
    zone.fx({ k: 'cc', id: t.id, cc: e.cc, dur: Math.round(d) }, t.x, t.y);
  }
}

export function pushActor(zone, t, tx, ty, speed) {
  t.forced = { kind: 'push', tx, ty, speed, until: zone.world.now + 1200 };
  t.path = null;
}

function inShape(a, c, shape, r, angle, len, width, [dx, dy]) {
  const vx = a.x - c.x, vy = a.y - c.y;
  const rad = a.radius ?? 0.4;
  if (shape === 'cone') {
    const d = Math.hypot(vx, vy);
    if (d > r + rad) return false;
    if (d < 0.6) return true;
    const cos = (vx * dx + vy * dy) / d;
    return cos >= Math.cos(angle / 2);
  }
  if (shape === 'line') {
    const t = vx * dx + vy * dy;
    if (t < -rad || t > len + rad) return false;
    return Math.abs(vx * -dy + vy * dx) <= width / 2 + rad;
  }
  return Math.hypot(vx, vy) <= r + rad;
}

export function spawnMissile(zone, ctx, o) {
  const W = zone.world;
  const speed = (o.speed ?? 10) * (o.noScale ? 1 : mult(ctx.caster.stats, 'projectileSpeed'));
  const [dx, dy] = o.dir;
  const m = {
    id: W.newId(), kind: 'missile', art: o.art ?? 'missile', x: ctx.caster.x, y: ctx.caster.y, vx: dx * speed, vy: dy * speed, speed,
    range: o.range ?? 8, traveled: 0, radius: o.radius ?? 0.3, pierce: o.pierce ?? 0, chain: o.chain ?? 0, homing: !!o.homing,
    homingTarget: ctx.target?.id ?? null, onHit: o.onHit ?? [], hook: !!o.hook, fn: o.fn ?? null, team: ctx.caster.team, ownerId: ctx.caster.id,
    ctx: { ...ctx, targets: null }, hit: new Set(), dir: dirFromVec(dx, dy), anim: 0,
  };
  zone.add(m);
  return m;
}

export function updateMissile(zone, m, dt) {
  const W = zone.world;
  if (m.homing) {
    let t = m.homingTarget ? W.ents.get(m.homingTarget) : null;
    if (!t || t.dead || t.zone !== zone) {
      t = zone.queryActors(m.x, m.y, 6, (a) => !a.dead && a.team !== m.team && a.team !== 'n' && !m.hit.has(a.id))[0] ?? null;
      m.homingTarget = t?.id ?? null;
    }
    if (t) {
      const want = Math.atan2(t.y - m.y, t.x - m.x), cur = Math.atan2(m.vy, m.vx);
      let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const turn = Math.max(-6 * dt, Math.min(6 * dt, d));
      m.vx = Math.cos(cur + turn) * m.speed; m.vy = Math.sin(cur + turn) * m.speed;
    }
  }
  const stepLen = m.speed * dt;
  const n = Math.max(1, Math.ceil(stepLen / 0.4));
  for (let s = 0; s < n; s++) {
    const nx = m.x + (m.vx * dt) / n, ny = m.y + (m.vy * dt) / n;
    if (!zone.free(nx, ny)) { zone.remove(m); return; }
    zone.moveTo(m, nx, ny);
    m.traveled += stepLen / n;
    const hits = zone.queryActors(nx, ny, m.radius, (a) => !a.dead && !a.untargetable && a.team !== m.team && a.team !== 'n' && !m.hit.has(a.id));
    for (const a of hits) {
      // 跳ね返す: 「跳ね返す」の強化、または reflectBlocked の品を持ち、防ぐ抽選に勝ったとき
      const blockedBack = !m.reflected && !hasStatus(a, 'reflect') && hasRule(a, 'reflectBlocked') && W.rng() * 100 < (a.stats?.blockChance ?? 0);
      if ((hasStatus(a, 'reflect') || blockedBack) && !m.reflected) {
        if (hasRule(a, 'perfectParry')) a.nextCrit = true;
        m.vx = -m.vx; m.vy = -m.vy; m.team = a.team; m.ownerId = a.id; m.reflected = true; m.traveled = 0; m.hit.clear();
        m.ctx = { ...m.ctx, caster: a };
        m.dir = dirFromVec(m.vx, m.vy);
        zone.fx({ k: 'vfx', name: 'reflect', on: a.id, missile: m.id }, a.x, a.y);
        break;
      }
      m.hit.add(a.id);
      if (m.hook) {
        const c = m.ctx.caster;
        if (!isBoss(a) && !c.removed) { const [ux, uy] = norm(a.x - c.x, a.y - c.y); pushActor(zone, a, c.x + ux * 1.0, c.y + uy * 1.0, m.speed); }
        runEffects({ ...m.ctx, target: a, point: { x: a.x, y: a.y } }, m.onHit);
        zone.remove(m);
        return;
      }
      if (m.fn) m.fn(a, m); else runEffects({ ...m.ctx, target: a, point: { x: a.x, y: a.y } }, m.onHit);
      if (m.pierce > 0) { m.pierce--; continue; }
      if (m.chain > 0) {
        const next = zone.queryActors(a.x, a.y, 6, (b) => !b.dead && b.team !== m.team && b.team !== 'n' && !m.hit.has(b.id)).sort((p, q) => dist(p, a) - dist(q, a))[0];
        if (next) {
          m.chain--;
          const [ux, uy] = norm(next.x - a.x, next.y - a.y);
          m.vx = ux * m.speed; m.vy = uy * m.speed; m.traveled = 0; m.dir = dirFromVec(ux, uy);
          zone.moveTo(m, a.x, a.y);
          zone.fx({ k: 'vfx', name: 'chain', from: a.id, to: next.id }, a.x, a.y);
          return;
        }
      }
      zone.remove(m);
      return;
    }
    if (m.traveled >= m.range) { zone.remove(m); return; }
  }
}

// 地面に置いた物（範囲・罠・渦・壁）
export function updateObject(zone, o, dt = zone.world.dt ?? 0.05) {
  const W = zone.world, now = W.now;
  if (o.until != null && now >= o.until) { zone.remove(o); return; }
  if (o.objKind === 'zone') {
    if (now < o.nextTick) return;
    o.nextTick += o.tickMs;
    for (const a of zone.queryActors(o.x, o.y, o.radius, affectsPred(o.ctx.caster, o.affects))) runEffects({ ...o.ctx, target: a, point: { x: a.x, y: a.y } }, o.onTick);
  } else if (o.objKind === 'trap') {
    if (now < o.armAt) return;
    const a = zone.queryActors(o.x, o.y, o.radius, affectsPred(o.ctx.caster, 'enemies'))[0];
    if (!a) return;
    zone.remove(o);
    zone.fx({ k: 'vfx', name: o.art, x: o.x, y: o.y, trap: true }, o.x, o.y);
    runEffects({ ...o.ctx, target: a, point: { x: o.x, y: o.y } }, o.onTrigger);
  } else if (o.objKind === 'vortex') {
    for (const a of zone.queryActors(o.x, o.y, o.radius, affectsPred(o.ctx.caster, 'enemies'))) {
      if (a.forced) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < 0.3) continue;
      const step = Math.min(d, o.strength * dt * (isBoss(a) ? 0.3 : 1));
      zone.tryMove(a, a.x + ((o.x - a.x) / d) * step, a.y + ((o.y - a.y) / d) * step);
    }
  }
}

// 突進・跳躍・押し出し・引き寄せ。true を返したら、その回は他の動きをしない
export function updateForced(zone, a, dt) {
  const f = a.forced;
  if (!f) return false;
  const now = zone.world.now;
  const end = () => {
    a.forced = null;
    if (f.kind === 'leap') a.untargetable = false;
    if (f.onArrive?.length && !a.dead) runEffects({ ...f.ctx, point: { x: a.x, y: a.y } }, f.onArrive);
  };
  if (now > f.until) { end(); return true; }
  const dx = f.tx - a.x, dy = f.ty - a.y, d = Math.hypot(dx, dy);
  const step = f.speed * dt;
  a.dir = dirFromVec(dx, dy);
  if (d <= step) {
    if (f.kind === 'leap' || zone.free(f.tx, f.ty)) zone.moveTo(a, f.tx, f.ty);
    passHits(zone, a, f);
    end();
    return true;
  }
  const nx = a.x + (dx / d) * step, ny = a.y + (dy / d) * step;
  if (f.kind === 'leap') zone.moveTo(a, nx, ny);
  else if (zone.free(nx, ny)) zone.moveTo(a, nx, ny);
  else { end(); return true; }
  passHits(zone, a, f);
  return true;
}
function passHits(zone, a, f) {
  if (!f.passHit?.length) return;
  for (const t of zone.queryActors(a.x, a.y, 0.9, (b) => isEnemy(a, b) && !b.dead && !f.hitSet.has(b.id))) {
    f.hitSet.add(t.id);
    runEffects({ ...f.ctx, target: t, point: { x: t.x, y: t.y } }, f.passHit);
  }
}

export function updateChannel(zone, a) {
  const c = a.channel;
  if (!c) return;
  const now = zone.world.now;
  if (now >= c.until || !canCast(a) || a.dead) { a.channel = null; return; }
  if (now >= c.next) { c.next += c.tickMs; runEffects(c.ctx, c.onTick); }
}

/* ---------------- スキルを使う ---------------- */
const TOGGLE_OPS = new Set(['aura', 'stance']);
export function isToggleOff(a, skill) {
  const e = skill.effects;
  if (e.length !== 1 || !TOGGLE_OPS.has(e[0].op)) return false;
  if (e[0].op === 'aura') return !!a.auras[skill.id];
  if (hasRule(a, 'twoStances')) return !!a.stances[skill.id];
  return a.stances[e[0].group ?? 'stance'] === skill.id;
}

// 消費・待ち時間を払い、詠唱を始める（詠唱 0 ならその場で実行）。確かめは呼ぶ側が済ませておく
export function startCast(zone, a, skill, rank, { target = null, point = null } = {}) {
  const W = zone.world, now = W.now;
  const free = isToggleOff(a, skill);
  if (!free) {
    const cost = skillCost(skill, rank, a.stats);
    if (a.rules?.includes('bloodMagic') || skill.cost?.life) a.hp = Math.max(1, a.hp - cost - (skill.cost?.life ?? 0));
    else a.mana -= cost;
    const cd = skillCooldown(skill, rank, a.stats);
    if (cd > 0) a.cds[skill.id] = now + cd * 1000;
  }
  if (!skill.effects.some((e) => e.op === 'stealth')) breakStealth(a);
  const p = point ?? (target ? { x: target.x, y: target.y } : { x: a.x, y: a.y });
  if (p.x !== a.x || p.y !== a.y) a.dir = dirFromVec(p.x - a.x, p.y - a.y);
  const ct = free ? 0 : castTime(skill, a.stats) * 1000;
  zone.fx({ k: 'cast', id: a.id, s: skill.id, x: round2(p.x), y: round2(p.y), tid: target?.id ?? null, dur: Math.round(ct), vfx: skill.vfx }, a.x, a.y);
  a.path = null;
  if (ct > 0) { a.casting = { skill, rank, target, point: p, at: now + ct }; a.anim = ANIM.cast; }
  else executeSkill(zone, a, skill, rank, target, p);
  if (a.kind === 'player') W.markDirty(a, 'skills');
}
export function executeSkill(zone, a, skill, rank, target, point) {
  const W = zone.world;
  a.anim = skill.tags?.includes('attack') ? ANIM.attack : ANIM.cast;
  a.animUntil = W.now + 300;
  runEffects(makeCtx(zone, a, skill, rank, { target: target && !target.removed ? target : null, point }), skill.effects);
}
const round2 = (v) => Math.round(v * 100) / 100;

export const ALL_OPS = Object.keys(OPS);
