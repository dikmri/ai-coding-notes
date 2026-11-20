// 区域（地図 1 枚）: 物の出し入れ、升目の索引、歩ける場所、時間差の出来事、1 回分の計算
import { ANIM, PICKUP_RANGE } from '../shared/schema.mjs';
import { walkable, dirFromVec } from '../shared/mapgen.mjs';
import { recompute, addStatus, removeStatus, deriveCC, recordHistory, manaCap, isActor, dist, canMove } from './actor.mjs';
import { applyDamage, heal, meleeHit, basicRange, breakStealth } from './combat.mjs';
import { updateMissile, updateObject, updateForced, updateChannel, executeSkill } from './effects.mjs';
import { updateMonster, followPath } from './monsters.mjs';

const CELL = 8;
const CORPSE_MS = 10000, MINION_CORPSE_MS = 1500, ITEM_TTL_MS = 180000;

export class Zone {
  constructor(world, map) {
    this.world = world; this.map = map; this.id = map.id;
    this.ents = new Map();
    this.players = new Set(); this.actors = new Set(); this.missiles = new Set(); this.objects = new Set(); this.items = new Set(); this.npcs = new Set();
    this.gw = Math.ceil(map.w / CELL); this.gh = Math.ceil(map.h / CELL);
    this.grid = Array.from({ length: this.gw * this.gh }, () => new Set());
    this.block = new Uint8Array(map.w * map.h);
    this.timers = [];
    this.spawners = (map.spawns ?? []).map((s, i) => ({ i, def: s, alive: new Set(), due: [], rr: 0 }));
    this.populated = false;
    this.slowAt = 0; this.auraAt = 0;
  }

  /* ---- 出し入れと索引 ---- */
  cellOf(x, y) {
    const cx = Math.max(0, Math.min(this.gw - 1, Math.floor(x / CELL)));
    const cy = Math.max(0, Math.min(this.gh - 1, Math.floor(y / CELL)));
    return cy * this.gw + cx;
  }
  add(e) {
    e.zone = this; e.removed = false;
    this.ents.set(e.id, e); this.world.ents.set(e.id, e);
    e._cell = this.cellOf(e.x, e.y); this.grid[e._cell].add(e);
    if (e.kind === 'player') { this.players.add(e); this.actors.add(e); }
    else if (e.kind === 'monster') { this.actors.add(e); e.bornAt ??= this.world.now; }
    else if (e.kind === 'missile') this.missiles.add(e);
    else if (e.kind === 'object') this.objects.add(e);
    else if (e.kind === 'item') this.items.add(e);
    else if (e.kind === 'npc') this.npcs.add(e);
    return e;
  }
  remove(e) {
    if (e.zone !== this) return;
    this.ents.delete(e.id);
    if (this.world.ents.get(e.id) === e) this.world.ents.delete(e.id);
    this.grid[e._cell]?.delete(e);
    this.players.delete(e); this.actors.delete(e); this.missiles.delete(e); this.objects.delete(e); this.items.delete(e); this.npcs.delete(e);
    if (e.kind === 'object' && e.tile != null && this.block[e.tile] > 0) this.block[e.tile]--;
    e.removed = true; e.zone = null;
  }
  despawn(m) {
    if (m.spawner) { m.spawner.alive.delete(m.id); }
    this.remove(m);
  }
  moveTo(e, x, y) {
    e.x = x; e.y = y;
    const c = this.cellOf(x, y);
    if (c !== e._cell) { this.grid[e._cell].delete(e); this.grid[c].add(e); e._cell = c; }
  }
  query(x, y, r, pred) {
    const out = [];
    const x0 = Math.max(0, Math.floor((x - r) / CELL)), x1 = Math.min(this.gw - 1, Math.floor((x + r) / CELL));
    const y0 = Math.max(0, Math.floor((y - r) / CELL)), y1 = Math.min(this.gh - 1, Math.floor((y + r) / CELL));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (const e of this.grid[cy * this.gw + cx]) {
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy <= r2 && (!pred || pred(e))) out.push(e);
      }
    }
    return out;
  }
  // 動く者を、体の大きさ（radius）込みで探す
  queryActors(x, y, r, pred) {
    return this.query(x, y, r + 0.5, (e) => isActor(e) && Math.hypot(e.x - x, e.y - y) <= r + (e.radius ?? 0.4) && (!pred || pred(e)));
  }

  /* ---- 歩ける場所 ---- */
  walkableTile(tx, ty) { return walkable(this.map, tx, ty, this.block); }
  free(x, y) { return walkable(this.map, Math.floor(x), Math.floor(y), this.block); }
  tryMove(e, nx, ny) {
    if (this.free(nx, ny)) { this.moveTo(e, nx, ny); return true; }
    if (this.free(nx, e.y)) { this.moveTo(e, nx, e.y); return true; }
    if (this.free(e.x, ny)) { this.moveTo(e, e.x, ny); return true; }
    return false;
  }
  later(sec, fn) { this.timers.push({ at: this.world.now + sec * 1000, fn }); }
  fx(msg, x, y) { this.world.fxNear(this, msg, x, y); }

  /* ---- 魔物の湧き ---- */
  spawnOne(sp) {
    const W = this.world;
    const s = sp.def;
    const id = s.monsters[sp.rr++ % s.monsters.length];
    const def = W.data.monsters[id];
    if (!def) return null;
    let p = null;
    for (let k = 0; k < 12 && !p; k++) {
      const a = W.rng() * Math.PI * 2, r = W.rng() * Math.max(0.5, s.r);
      const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
      if (this.free(x, y)) p = { x, y };
    }
    if (!p) p = this.free(s.x, s.y) ? { x: s.x, y: s.y } : null;
    if (!p) return null;
    const m = W.makeMonster(def, { x: p.x, y: p.y, team: 'm', spawner: sp, homeR: s.r, level: s.level ?? def.level, elite: !def.boss && !def.minion && W.rng() < (s.eliteChance ?? 0.08) });
    sp.alive.add(m.id);
    this.add(m);
    return m;
  }
  populate() {
    this.populated = true;
    for (const sp of this.spawners) for (let i = sp.alive.size; i < sp.def.count; i++) this.spawnOne(sp);
  }

  /* ---- 1 回分の計算 ---- */
  tick(dt) {
    const W = this.world, now = W.now;
    if (!this.populated) this.populate();
    if (this.timers.length) {
      const due = [];
      this.timers = this.timers.filter((t) => (t.at <= now ? (due.push(t), false) : true));
      for (const t of due) { try { t.fn(); } catch (e) { W.logError('zone.timer', { zone: this.id }, e); } }
    }
    const auraTick = now >= this.auraAt;
    if (auraTick) this.auraAt = now + 500;
    for (const a of [...this.actors]) {
      if (a.removed) continue;
      try { this.tickActor(a, dt, auraTick); } catch (e) { W.logError('zone.actor', { zone: this.id, id: a.id, kind: a.kind }, e); }
    }
    for (const m of [...this.missiles]) { try { updateMissile(this, m, dt); } catch (e) { W.logError('zone.missile', { zone: this.id }, e); this.remove(m); } }
    for (const o of [...this.objects]) { try { updateObject(this, o, dt); } catch (e) { W.logError('zone.object', { zone: this.id }, e); this.remove(o); } }
    if (now >= this.slowAt) {
      this.slowAt = now + 1000;
      for (const it of [...this.items]) if (now >= it.expireAt) this.remove(it);
      for (const sp of this.spawners) {
        sp.due = sp.due.filter((t) => { if (t <= now && sp.alive.size < sp.def.count) { this.spawnOne(sp); return false; } return true; });
      }
    }
  }

  tickActor(a, dt, auraTick) {
    const W = this.world, now = W.now;
    if (a.dead) {
      if (a.kind === 'monster' && now - a.diedAt > (a.owner || a.clone ? MINION_CORPSE_MS : CORPSE_MS)) this.remove(a);
      return;
    }
    // 状態の期限と、時間で削るダメージ
    if (a.statuses.length) {
      let expired = null;
      for (const s of a.statuses) {
        if (now >= s.until) (expired ??= []).push(s);
        else if (s.kind === 'dot' && now >= s.nextTick) {
          s.nextTick += 500;
          const src = W.ents.get(s.src) ?? null;
          applyDamage(this, src, a, { amount: s.dps * 0.5 * (s.stacks ?? 1), type: s.type ?? 'phys', isDot: true });
          if (a.dead) return;
        }
      }
      if (expired) {
        removeStatus(a, (s) => expired.includes(s));
        for (const s of expired) {
          if (s.id === 'cheatDeath' && s.healAfterPct) heal(this, a, a, (a.maxHp * s.healAfterPct) / 100);
          if (s.id === 'taunt' && a.ai) a.ai.tauntedBy = null;
        }
        if (a.kind === 'player') W.markDirty(a);
      }
    }
    // 自分のオーラを周りへ配る
    if (auraTick) {
      for (const au of Object.values(a.auras)) {
        const mods = au.mods.map((m) => ({ ...m, value: m.value * (1 + (a.stats?.auraEffect ?? 0) / 100) }));
        for (const t of this.queryActors(a.x, a.y, au.radius, au.affects === 'enemies' ? (t) => t.team !== a.team && !t.dead : (t) => t.team === a.team && !t.dead)) {
          addStatus(t, { id: `aura:${au.key}:${a.id}`, kind: 'aura', mods, src: a.id, until: now + 700 }, now);
        }
      }
    }
    if (a.dirtyStats) { recompute(a, W.data); if (a.kind === 'player') W.markDirty(a, 'stats'); }
    // 自然回復
    if (a.stats) {
      if (a.hp < a.maxHp && a.stats.lifeRegen > 0) a.hp = Math.min(a.maxHp, a.hp + a.stats.lifeRegen * dt);
      const cap = manaCap(a);
      if (a.mana < cap) a.mana = Math.min(cap, a.mana + a.stats.manaRegen * dt);
      else if (a.mana > cap) a.mana = cap;
    }
    if (a.kind === 'player' || a.def?.boss) recordHistory(a, now);
    a.moving = false;
    if (updateForced(this, a, dt)) { this.setAnim(a, now); return; }
    if (a.casting) {
      if (a.cc.stun || a.cc.sleep || a.cc.fear || a.cc.silence) a.casting = null;
      else if (now >= a.casting.at) { const c = a.casting; a.casting = null; executeSkill(this, a, c.skill, c.rank, c.target, c.point); }
    }
    updateChannel(this, a);
    if (a.kind === 'player') this.updatePlayer(a, dt);
    else updateMonster(this, a, dt);
    this.setAnim(a, now);
  }

  setAnim(a, now) {
    if (a.removed) return;
    if (a.dead) a.anim = ANIM.dead;
    else if (a.casting || a.channel) a.anim = ANIM.cast;
    else if (now < a.animUntil) { /* 攻撃・被弾の絵を保つ */ }
    else if (a.moving || a.forced) a.anim = ANIM.walk;
    else a.anim = ANIM.idle;
  }

  /* ---- プレイヤーの歩きと行動 ---- */
  updatePlayer(p, dt) {
    const W = this.world, now = W.now;
    if (p.cc.fear) {
      const from = W.ents.get(p.cc.fearFrom);
      if (from) { const dx = p.x - from.x, dy = p.y - from.y, d = Math.hypot(dx, dy) || 1; this.tryMove(p, p.x + (dx / d) * p.stats.moveSpeed * 0.7 * dt, p.y + (dy / d) * p.stats.moveSpeed * 0.7 * dt); p.moving = true; }
      return;
    }
    if (p.casting || p.channel || p.cc.stun || p.cc.sleep) return;
    const act = p.action;
    if (act) {
      const t = act.id != null ? this.ents.get(act.id) : null;
      if (act.id != null && (!t || t.removed || (isActor(t) && t.dead && act.type !== 'cast'))) { p.action = null; }
      else {
        const goal = t ?? act.at;
        const d = dist(p, goal);
        const reach = act.type === 'attack' ? basicRange(p) + (t.radius ?? 0.4) * 0.5
          : act.type === 'pick' ? PICKUP_RANGE : act.type === 'talk' ? 3 : act.type === 'warp' ? act.range ?? 2.2 : act.range;
        if (d > reach) {
          if (!canMove(p)) return;
          if (!p.path || now >= p.pathAt || (p.pathGoal && Math.hypot(p.pathGoal.x - goal.x, p.pathGoal.y - goal.y) > 1)) {
            p.path = W.pathFor(this, p, goal.x, goal.y);
            p.pathGoal = { x: goal.x, y: goal.y }; p.pathAt = now + 400;
            if (!p.path) { p.action = null; W.sendErr(p.session, 'noPath'); return; }
          }
          followPath(this, p, p.stats.moveSpeed * (1 - p.cc.slow / 100) * dt);
          return;
        }
        p.path = null;
        if (t) p.dir = dirFromVec(t.x - p.x, t.y - p.y);
        if (act.type === 'attack') {
          if (now >= p.attackReadyAt) {
            p.attackReadyAt = now + 1000 / Math.max(0.2, p.stats.aps);
            p.anim = ANIM.attack; p.animUntil = now + Math.min(450, 900 / p.stats.aps);
            breakStealth(p);
            meleeHit(this, p, t);
          }
          return;
        }
        p.action = null;
        W.finishAction(p, act, t);
        return;
      }
    }
    if (p.path?.length && canMove(p)) followPath(this, p, p.stats.moveSpeed * (1 - p.cc.slow / 100) * dt);
  }
}
