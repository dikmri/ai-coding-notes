// 世界（1 人用）: 画面とのつながり（session）、区域、20 回/秒の計算、毎回の位置の送信、倒したときの報酬、保存の中身、記録の数字。
// ブラウザの Web Worker（client/sim-worker.mjs）でも Node.js のテストでも動く。Node.js だけの物（process・Buffer）は使わない。
// 時刻 now は世界の時計（計算 1 回で 1000/tickHz ms 進む）。止めている間は進まない。
import { TICK_HZ, SNAP_HZ, VIEW_RADIUS, SAVE_EVERY_S, INV_W, INV_H, ANIM } from '../shared/schema.mjs';
import { xpToNext, addXp, deathPenalty, monsterXp } from '../shared/calc.mjs';
import { findPath, nearestWalkable } from '../shared/mapgen.mjs';
import { Zone } from './zone.mjs';
import { baseActor, recompute, spawnInfo, youInfo, hpPct, statusList, manaCap, addStatus } from './actor.mjs';
import { applyDamage, heal, basicDamage } from './combat.mjs';
import { rollDrops, makeItem, makeConsumable } from './loot.mjs';
import { addItem } from './inventory.mjs';
import { treeRoots } from './progress.mjs';
import { handleCommand, errMsg, openDialog, usePortalNow } from './commands.mjs';

const ITEM_TTL_MS = 180000, PROTECT_MS = 10000;
const SYNC_EVERY_TICKS = 20; // 保存の中身を画面へ渡す間隔（計算の回数）。画面は閉じるときにこれを書く
const MAX_SPEED = 8;

export class World {
  constructor({ data, log, rng = Math.random, debug = false, now = Date.now(), tickHz = TICK_HZ, snapHz = SNAP_HZ }) {
    this.data = data; this.log = log; this.rng = rng; this.debug = debug;
    this.tickHz = Math.max(1, Math.min(60, tickHz)); this.snapHz = Math.max(1, Math.min(this.tickHz, snapHz));
    this.stepMs = 1000 / this.tickHz; this.dt = 1 / this.tickHz; this.snapEvery = Math.max(1, Math.round(this.tickHz / this.snapHz));
    this.now = now; this.tickNo = 0; this._id = 0; this._sid = 0;
    this.ents = new Map(); this.zones = new Map(); this.sessions = new Set();
    this.transfers = [];
    this.pathBudget = 40;
    this.warned = new Set();
    this.m = this.freshMetrics();
    this.lastMetrics = null;
    this.paused = false; this.speed = 1; this.running = false; this.timer = null;
  }
  newId() { return ++this._id; }
  freshMetrics() { return { ticks: 0, sum: 0, max: 0, rxMsgs: 0, txMsgs: 0, txBytes: 0, cmds: 0, errs: 0 }; }
  warnOnce(event, args) { const k = `${event}:${JSON.stringify(args)}`; if (this.warned.has(k)) return; this.warned.add(k); this.log.warn(event, args); }
  logError(event, args, err) { this.m.errs++; this.log.error(event, args, err); }

  /* ---------------- 区域 ---------------- */
  zone(id) {
    let z = this.zones.get(id);
    if (z) return z;
    const map = this.data.maps[id];
    if (!map) return null;
    z = new Zone(this, map);
    for (const n of map.npcs) {
      const def = this.data.npcs[n.id];
      z.add({ id: this.newId(), kind: 'npc', team: 'n', npcId: n.id, role: def?.role ?? 'story', art: def?.art ?? n.id, name: def?.name ?? n.id, x: n.x, y: n.y, dir: n.dir ?? 0, anim: 0 });
    }
    this.zones.set(id, z);
    return z;
  }
  townId() { return this.data.maps.town ? 'town' : Object.keys(this.data.maps)[0]; }

  /* ---------------- 作る ---------------- */
  makePlayer(s, ch) {
    const cls = this.data.classes[ch.cls] ?? this.data.classes.adventurer;
    const p = baseActor(this, 'player', { team: 'p', art: cls?.art ?? ch.cls, name: ch.name, level: ch.level, cls: ch.cls, char: ch, session: s, partyId: null });
    recompute(p, this.data);
    p.xpNext = xpToNext(ch.level);
    return p;
  }
  // 魔物を別の Lv に合わせる（データの scaleMonster があれば使う）。同じ組み合わせは使い回す
  scaledDef(def, level) {
    if (!level || level === def.level) return def;
    const key = `${def.id}@${level}`;
    this._scaled ??= new Map();
    let d = this._scaled.get(key);
    if (!d) {
      if (this.data.scaleMonster) { try { d = this.data.scaleMonster(def, level); } catch (e) { this.warnOnce('data.scaleMonster', { id: def.id, error: String(e?.message ?? e) }); } }
      if (!d) { const k = level - def.level; d = { ...def, level, life: Math.max(1, Math.round(def.life * 1.16 ** k)), dmg: def.dmg.map((v) => Math.max(1, Math.round(v * 1.1 ** k))), xp: def.xp > 0 ? Math.max(1, Math.round(def.xp * 1.15 ** k)) : 0 }; }
      this._scaled.set(key, d);
    }
    return d;
  }
  makeMonster(def0, o) {
    const lvl = o.level ?? def0.level;
    const def = this.scaledDef(def0, lvl);
    const minion = !!o.owner;
    const sm = o.summoner;
    let baseLife = def.life;
    if (minion && sm?.kind === 'player') baseLife = def.life * (o.rankMult ?? 1) * (1 + (sm.stats?.minionLife ?? 0) / 100);
    const m = baseActor(this, 'monster', {
      team: o.team ?? 'm', art: def.art, name: def.name, level: lvl, def, x: o.x, y: o.y, rarity: def.boss ? 'boss' : 'normal',
      baseLife, extraMods: [], skills: [...(def.skills ?? [])], xpValue: def.xp, radius: def.boss ? 0.8 : 0.4,
      ai: { home: { x: o.x, y: o.y }, homeR: o.homeR ?? 3, target: null, nextScan: 0, nextSkill: this.now + 800, nextWander: this.now + this.rng() * 4000, tauntedBy: null, returning: false },
      owner: o.owner ?? null, unit: o.unit ?? null, until: o.until ?? null, spawner: o.spawner ?? null, dmgMult: 1,
    });
    if (minion && sm?.kind === 'player') m.dmgMult = (o.rankMult ?? 1) * (1 + (sm.stats?.dmgMinion ?? 0) / 100);
    if (o.elite) {
      const table = this.data.eliteMods ?? [];
      const n = Math.min(table.length, this.rng() < 0.25 ? 2 : 1); // 性質が 2 つ付くのは 4 回に 1 回
      const pick = [];
      while (pick.length < n) { const e = table[Math.floor(this.rng() * table.length)]; if (!pick.includes(e)) pick.push(e); }
      const ts = this.data.tierScale?.elite ?? { life: 2.5, dmg: 1.4, xp: 3 };
      m.rarity = 'elite';
      m.elite = pick.map((e) => e.name);
      m.baseLife *= ts.life ?? 2.5; m.dmgMult = ts.dmg ?? 1.4; m.xpValue *= ts.xp ?? 3;
      m.extraMods = pick.flatMap((e) => e.mods ?? []);
      for (const e of pick) for (const sk of e.skills ?? []) if (!m.skills.includes(sk)) m.skills.push(sk);
      m.name = m.elite.length ? `${m.elite.join('・')}${def.name}` : `強い${def.name}`;
    }
    recompute(m, this.data);
    m.hp = m.maxHp; m.mana = m.maxMana;
    return m;
  }
  makeClone(owner, { x, y, until, dmgPct }) {
    const def = { id: 'clone', name: owner.name, ai: 'melee', range: 1.4, speed: owner.stats.moveSpeed, aps: owner.stats.aps, dmg: [1, 2], dmgType: 'phys', skills: [], xp: 0, boss: false, armor: owner.stats.armor, evasion: owner.stats.evasion, accuracy: owner.stats.accuracy };
    const c = baseActor(this, 'monster', {
      team: owner.team, art: owner.art, name: owner.name, level: owner.level, cls: owner.cls, clone: true, cloneOf: owner, owner: owner.id, x, y, until,
      dmgMult: dmgPct / 100, def, baseLife: Math.max(1, owner.maxHp * 0.4), extraMods: [], skills: [],
      ai: { home: { x, y }, homeR: 2, target: null, nextScan: 0, nextSkill: Infinity, nextWander: Infinity, tauntedBy: null },
    });
    recompute(c, this.data);
    c.hp = c.maxHp;
    return c;
  }

  /* ---------------- 画面とのつながり ---------------- */
  // conn = { send(text), cork?(), uncork?() }。1 人用なので session は 1 つ
  connect(conn) {
    const s = { id: ++this._sid, conn, state: 'new', out: [], known: new Map(), dirty: {}, lastMe: {}, meAt: 0, nextSave: Infinity, char: null, player: null, names: null, stashOpen: null };
    this.sessions.add(s);
    this.log.server('connect', { s: s.id });
    return s;
  }
  // 画面からの命令（物か JSON の文字列）
  receive(s, msg) {
    this.m.rxMsgs++;
    if (s.closed) return;
    if (typeof msg === 'string') {
      try { msg = JSON.parse(msg); } catch { this.sendErr(s, 'badMsg'); this.log.server('cmd', { s: s.id, t: '?' }, 'err:badJson'); this.flush(s); return; }
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string' || msg.t.length > 20) { this.sendErr(s, 'badMsg'); this.log.server('cmd', { s: s.id, t: '?' }, 'err:badMsg'); this.flush(s); return; }
    this.dispatch(s, msg);
    this.flush(s); // 返事はすぐ届ける（止めている間も）
  }
  dispatch(s, msg) {
    this.m.cmds++;
    let r;
    try { r = handleCommand(this, s, msg); } catch (e) { r = 'err:internal'; this.logError('cmd.exception', { s: s.id, t: msg.t }, e); this.sendErr(s, 'internal'); }
    this.logCmd(s, msg, r);
  }
  logCmd(s, msg, r) {
    const args = { c: s.char?.id ?? null, t: msg.t };
    for (const [k, v] of Object.entries(msg)) {
      if (k === 't') continue;
      if (k === 'char') { args.char = v ? `${v.name ?? '?'} Lv${v.level ?? '?'}` : null; continue; }
      if (typeof v === 'number') args[k] = Math.round(v * 100) / 100;
      else if (typeof v === 'string') args[k] = v.slice(0, 40);
      else if (v && typeof v === 'object') args[k] = JSON.stringify(v).slice(0, 120);
      else args[k] = v;
    }
    this.log.server('cmd', args, r ?? 'ok');
  }
  disconnect(s) {
    if (s.closed) return;
    s.closed = true;
    this.sessions.delete(s);
    if (s.player) {
      const p = s.player, z = p.zone;
      if (z) { for (const a of [...z.actors]) if (a.owner === p.id) z.despawn(a); z.remove(p); }
    }
    this.log.server('disconnect', { s: s.id, c: s.char?.id ?? null });
  }

  /* ---------------- 送る ---------------- */
  send(s, obj) { if (s && !s.closed) s.out.push(JSON.stringify(obj)); }
  sendErr(s, code, extra) { this.send(s, { t: 'err', code, msg: errMsg(code), ...(extra ?? {}) }); }
  sys(s, msg) { this.send(s, { t: 'sys', msg }); }
  zoneSys(zone, msg) { for (const p of zone.players) this.sys(p.session, msg); }
  flush(s) {
    if (!s.out.length || s.closed) { s.out.length = 0; return; }
    const c = s.conn;
    c.cork?.();
    for (const m of s.out) { if (c.send(m) !== false) { this.m.txMsgs++; this.m.txBytes += m.length; } }
    c.uncork?.();
    s.out.length = 0;
  }
  fxNear(zone, msg, x, y) {
    if (!zone.players.size) return;
    const str = JSON.stringify({ t: 'fx', ...msg });
    const R = VIEW_RADIUS + 2;
    for (const p of zone.players) if (Math.abs(p.x - x) <= R && Math.abs(p.y - y) <= R) p.session.out.push(str);
  }
  markDirty(p, what = 'me') { const s = p?.session; if (s) { s.dirty.me = true; if (what !== 'me') s.dirty[what] = true; } }

  sendInv(s) { const ch = s.char; this.send(s, { t: 'inv', items: ch.inv, equip: ch.equip, gold: ch.gold, ...(s.stashOpen ? { stash: ch.stash } : {}) }); }
  sendTree(s) { this.send(s, { t: 'tree', alloc: s.char.alloc, points: s.char.points.passive }); }
  sendSkills(s) {
    const ch = s.char, now = this.now;
    const cds = {};
    for (const [k, v] of Object.entries(s.player?.cds ?? {})) if (v > now) cds[k] = Math.round(v - now);
    const avail = Object.values(this.data.skills).filter((sk) => sk.cls === 'adventurer' || sk.cls === ch.cls).map((sk) => sk.id);
    this.send(s, { t: 'skills', ranks: ch.ranks, binds: ch.binds, points: ch.points.skill, cds, avail });
  }
  sendQuests(s) { this.send(s, { t: 'quests', list: this.questList(s.char) }); }
  zoneMsg(s) {
    const p = s.player;
    return { t: 'zone', zone: p.zone.id, map: p.zone.map.id, you: this.you(p), portals: p.zone.map.portals.map((q) => ({ id: q.id, x: q.x, y: q.y, to: q.to?.map, r: q.r, oneWay: q.oneWay, opensAfter: q.opensAfter })) };
  }
  you(p) { p.xpNext = xpToNext(p.char.level); return youInfo(p); }

  /* ---------------- 世界に入る ---------------- */
  enterWorld(s, ch, opts = {}) {
    fillChar(ch, this.data);
    const z = this.zone(ch.map) ?? this.zone(this.townId());
    ch.map = z.id;
    const p = this.makePlayer(s, ch);
    let pos = ch.x != null && z.free(ch.x, ch.y) ? { x: ch.x, y: ch.y } : z.map.entry;
    if (ch.hp != null && ch.hp <= 0) pos = z.map.entry;
    p.x = pos.x; p.y = pos.y;
    p.hp = ch.hp != null && ch.hp > 0 ? Math.min(p.maxHp, ch.hp) : p.maxHp;
    p.mana = ch.mana != null ? Math.min(manaCap(p), ch.mana) : p.maxMana;
    z.add(p);
    s.player = p; s.char = ch; s.state = 'play';
    s.nextSave = this.now + SAVE_EVERY_S * 1000;
    s.known.clear();
    if (!ch.visited.includes(z.id)) ch.visited.push(z.id);
    if (opts.welcome) this.send(s, { t: 'welcome', you: this.you(p), zone: z.id, simTime: this.now });
    this.send(s, this.zoneMsg(s));
    this.sendInv(s); this.sendTree(s); this.sendSkills(s); this.sendQuests(s);
    this.log.server('enter', { c: ch.id, name: ch.name, map: z.id, x: r1(p.x), y: r1(p.y), level: ch.level, cls: ch.cls });
    this.saveSession(s, 'enter');
  }

  transfer(p, mapId, x, y, reason) { this.transfers.push({ p, mapId, x, y, reason }); }
  doTransfer({ p, mapId, x, y, reason }) {
    const s = p.session;
    if (!s || s.closed || !p.zone) return;
    const from = p.zone, to = this.zone(mapId);
    if (!to) { this.sendErr(s, 'noMap'); return; }
    for (const a of [...from.actors]) if (a.owner === p.id) from.despawn(a);
    from.remove(p);
    p.path = null; p.action = null; p.casting = null; p.channel = null; p.forced = null; p.untargetable = false;
    let pos = x != null && to.free(x, y) ? { x, y } : nearestWalkable(to.map, x ?? to.map.entry.x, y ?? to.map.entry.y, 8, to.block);
    pos ??= to.map.entry;
    p.x = pos.x; p.y = pos.y;
    to.add(p);
    const ch = s.char;
    ch.map = to.id;
    if (!ch.visited.includes(to.id)) ch.visited.push(to.id);
    s.known.clear();
    s.stashOpen = null;
    this.send(s, this.zoneMsg(s));
    this.questVisit(s, to.id);
    this.log.server('zoneMove', { c: ch.id, from: from.id, to: to.id, reason: reason ?? 'warp' });
    this.saveSession(s, 'zone');
  }
  pathFor(zone, p, x, y) { return findPath(zone.map, p.x, p.y, x, y, { block: zone.block, maxNodes: 20000 }); }
  finishAction(p, act, t) {
    const s = p.session;
    if (act.type === 'pick') this.pickItem(p, t);
    else if (act.type === 'talk') this.openDialog(s, t, null);
    else if (act.type === 'warp') this.usePortal(p, act.portal);
    else if (act.type === 'cast') act.run?.();
  }

  /* ---------------- 1 回分の計算 ---------------- */
  tick() {
    const t0 = performance.now();
    this.now += this.stepMs;
    this.tickNo++;
    this.pathBudget = 40;
    for (const z of this.zones.values()) if (z.players.size) z.tick(this.dt);
    if (this.transfers.length) { const tr = this.transfers; this.transfers = []; for (const x of tr) { try { this.doTransfer(x); } catch (e) { this.logError('transfer', { map: x.mapId }, e); } } }
    const snap = this.tickNo % this.snapEvery === 0;
    const sync = this.tickNo % SYNC_EVERY_TICKS === 0;
    for (const s of this.sessions) {
      if (s.player && s.player.zone) {
        try {
          const p = s.player;
          if (p.god && !p.dead) { p.hp = p.maxHp; p.mana = manaCap(p); }
          this.updateMe(s);
          if (snap) this.snapshotFor(s);
          if (this.now >= s.nextSave) { s.nextSave = this.now + SAVE_EVERY_S * 1000; this.saveSession(s, 'auto'); }
          else if (sync) this.saveSession(s, 'sync');
        } catch (e) { this.logError('tick.session', { s: s.id }, e); }
      }
      this.flush(s);
    }
    const ms = performance.now() - t0;
    this.m.ticks++; this.m.sum += ms; if (ms > this.m.max) this.m.max = ms;
  }
  step(n = 1) { for (let i = 0; i < n; i++) this.tick(); }

  // 実時間で回す。遅れたら最大 4 回分まで追いつき、1 秒以上遅れたら諦めて今に合わせる。
  // speed（確かめ用の時間の速さ）が 2 なら、1 回分の時間に 2 回計算する。止めている間はタイマーも止める。
  start() {
    if (this.running) return;
    this.running = true;
    this.next = performance.now();
    this.loop = () => {
      this.timer = null;
      if (!this.running || this.paused) return;
      const t = performance.now();
      let n = 0;
      while (t >= this.next && n < 4) {
        for (let k = 0; k < this.speed; k++) { try { this.tick(); } catch (e) { this.logError('tick', {}, e); } }
        this.next += this.stepMs; n++;
      }
      if (t - this.next > 1000) this.next = t;
      try { this.afterLoop?.(); } catch (e) { this.logError('afterLoop', {}, e); }
      this.timer = setTimeout(this.loop, Math.max(0, this.next - performance.now()));
    };
    this.timer = setTimeout(this.loop, 0);
  }
  stop() { this.running = false; clearTimeout(this.timer); this.timer = null; }
  setPaused(on, why = '') {
    on = !!on;
    if (on === this.paused) return false;
    this.paused = on;
    if (on) { clearTimeout(this.timer); this.timer = null; }
    else if (this.running && !this.timer) { this.next = performance.now(); this.timer = setTimeout(this.loop, 0); }
    this.log.server(on ? 'pause' : 'resume', { why, tick: this.tickNo });
    for (const s of this.sessions) { this.send(s, { t: 'paused', on, speed: this.speed }); this.flush(s); }
    return true;
  }
  setSpeed(n) {
    this.speed = Math.max(1, Math.min(MAX_SPEED, Math.round(Number(n) || 1)));
    for (const s of this.sessions) this.send(s, { t: 'paused', on: this.paused, speed: this.speed });
    return this.speed;
  }

  updateMe(s) {
    const p = s.player, ch = s.char, d = s.dirty;
    if (d.stats) {
      const { agg, ...stats } = p.stats;
      try { const r = basicDamage(p); stats.dmgMin = r.min; stats.dmgMax = r.max; } catch { /* 武器の無い姿 */ }
      this.send(s, { t: 'me', stats }); d.stats = false;
    }
    if (d.inv) { this.sendInv(s); d.inv = false; }
    if (d.skills) { this.sendSkills(s); d.skills = false; }
    if (d.tree) { this.sendTree(s); d.tree = false; }
    if (d.quests) { this.sendQuests(s); d.quests = false; }
    if (!d.me && this.now - s.meAt < 200) return;
    s.meAt = this.now; d.me = false;
    const cur = { hp: Math.round(p.hp), maxHp: p.maxHp, mana: Math.round(p.mana), maxMana: p.maxMana, manaCap: manaCap(p), level: ch.level, xp: ch.xp, xpNext: xpToNext(ch.level), gold: ch.gold, dead: p.dead, cls: ch.cls, pp: ch.points.passive, sp: ch.points.skill };
    const out = { t: 'me' };
    let any = false;
    for (const [k, v] of Object.entries(cur)) if (s.lastMe[k] !== v) { out[k] = v; s.lastMe[k] = v; any = true; }
    const st = statusList(p);
    const key = JSON.stringify(st);
    if (key !== s.lastMe.st) { s.lastMe.st = key; out.statuses = st; any = true; }
    if (any) this.send(s, out);
  }

  // 物ごとの送る文字列は、1 回の計算につき 1 度だけ作る
  spawnStr(e) {
    if (e._spawnTick !== this.tickNo) { e._spawnTick = this.tickNo; e._spawnStr = JSON.stringify({ t: 'spawn', e: spawnInfo(e) }); }
    return e._spawnStr;
  }
  snapState(e) {
    if (e._snapTick !== this.tickNo) {
      e._snapTick = this.tickNo;
      e._snapKey = `${Math.round(e.x * 100)},${Math.round(e.y * 100)},${e.dir ?? 0},${e.anim ?? 0},${hpPct(e)}`;
      e._snapStr = `[${e.id},${e._snapKey}]`;
    }
    return e._snapKey;
  }
  snapshotFor(s) {
    const p = s.player, z = p.zone;
    const vis = z.query(p.x, p.y, VIEW_RADIUS);
    const seen = new Set();
    const frags = [];
    for (const e of vis) {
      seen.add(e.id);
      const k = s.known.get(e.id);
      if (k === undefined) s.out.push(this.spawnStr(e));
      if (e.kind === 'item' || e.kind === 'npc' || e.kind === 'object') { s.known.set(e.id, 1); continue; }
      const key = this.snapState(e);
      if (k !== key) { frags.push(e._snapStr); s.known.set(e.id, key); }
    }
    const gone = [];
    if (s.known.size > seen.size) for (const id of s.known.keys()) if (!seen.has(id)) { gone.push(id); s.known.delete(id); }
    if (frags.length || gone.length) s.out.push(`{"t":"snap","st":${this.now},"ents":[${frags.join(',')}],"gone":[${gone.join(',')}]}`);
  }

  /* ---------------- 倒したとき ---------------- */
  onKill(zone, dst, src, pkt) {
    if (dst.kind === 'player') {
      const s = dst.session, ch = dst.char;
      const before = ch.xp;
      ch.xp = deathPenalty(ch.level, ch.xp);
      for (const m of zone.actors) if (m.ai?.target === dst.id) m.ai.target = null;
      for (const a of [...zone.actors]) if (a.owner === dst.id) zone.despawn(a);
      this.sys(s, `倒れました（経験値 −${before - ch.xp}）。町の宿で目を覚ませます。`);
      this.markDirty(dst);
      this.log.server('death', { c: ch.id, map: zone.id, by: src?.def?.id ?? null, xpLost: before - ch.xp });
      return;
    }
    if (dst.spawner) { dst.spawner.alive.delete(dst.id); dst.spawner.due.push(this.now + (dst.spawner.def.respawn ?? 30) * 1000); }
    if (dst.owner || dst.clone) {
      // minionBurst: 呼んだ者の召喚が倒れると、その場で破裂する
      const owner = this.ents.get(dst.owner);
      if (!dst.clone && owner?.rules?.includes('minionBurst')) {
        const amt = Math.max(5, dst.maxHp * 0.3);
        for (const o of zone.queryActors(dst.x, dst.y, 2.5, (o) => o.team !== owner.team && o.team !== 'n' && !o.dead)) applyDamage(zone, owner, o, { amount: amt, type: 'shadow' });
        zone.fx({ k: 'vfx', name: 'minion_burst', x: dst.x, y: dst.y, r: 2.5 }, dst.x, dst.y);
      }
      return;
    }
    let killer = src;
    if (killer?.owner) killer = this.ents.get(killer.owner) ?? null;
    if (!killer || killer.kind !== 'player' || !killer.session) return;
    if (killer.rules?.includes('killHeal')) heal(zone, killer, killer, killer.maxHp * 0.05);
    if (killer.rules?.includes('stealthOnKill')) addStatus(killer, { id: 'stealth', kind: 'buff', src: killer.id, until: this.now + 1500, breakOnAttack: true }, this.now);
    const gain = Math.round(monsterXp(dst.xpValue, dst.level, killer.char.level) * (1 + (killer.stats?.xpGain ?? 0) / 100));
    this.log.server('kill', { m: dst.def.id, lv: dst.level, rarity: dst.rarity, map: zone.id, xp: gain });
    this.grantXp(killer, gain);
    this.questKill(killer.session, dst.def.id);
    // 宝
    const tier = dst.rarity === 'boss' ? 'boss' : dst.rarity === 'elite' ? 'elite' : 'normal';
    const extra = [...(dst.def.drops ?? []), ...this.questDropsFor([killer], dst)];
    const drops = rollDrops(this.data, this.rng, { level: dst.level, tier, itemFind: killer.stats?.itemFind ?? 0, goldFind: killer.stats?.goldFind ?? 0, extra, uid: () => this.uid() });
    drops.forEach((d, i) => {
      const a = (i / Math.max(1, drops.length)) * Math.PI * 2 + this.rng();
      const r = drops.length > 1 ? 0.6 + this.rng() * 0.8 : 0.2;
      const pos = nearestWalkable(zone.map, dst.x + Math.cos(a) * r, dst.y + Math.sin(a) * r, 3, zone.block) ?? { x: dst.x, y: dst.y };
      this.dropToGround(zone, pos.x, pos.y, d.kind === 'gold' ? { gold: d.amount } : { item: d.item });
    });
    if (drops.length) zone.fx({ k: 'loot', id: dst.id, n: drops.length, tier }, dst.x, dst.y);
    // 倒すと待ち時間が戻るスキル
    if (pkt?.skillId && this.data.skills[pkt.skillId]?.resetOnKill && src === killer) { delete killer.cds[pkt.skillId]; this.markDirty(killer, 'skills'); }
    if (dst.def.boss) { this.zoneSys(zone, `${killer.name}が ${dst.def.name} を倒した！`); this.log.server('bossKill', { boss: dst.def.id, by: killer.char.id, map: zone.id }); }
  }
  uid() { return `${Math.floor(this.now).toString(36)}${(this._uid = (this._uid ?? 0) + 1).toString(36)}${Math.floor(this.rng() * 1e6).toString(36)}`; }
  dropToGround(zone, x, y, { item, gold }) {
    const e = { id: this.newId(), kind: 'item', art: gold ? 'gold' : item.icon ?? item.base, name: gold ? `${gold} G` : item.name, x, y, dir: 0, anim: 0, item: item ?? null, gold: gold ?? 0, protectUntil: this.now + PROTECT_MS, expireAt: this.now + ITEM_TTL_MS };
    zone.add(e);
    return e;
  }
  grantXp(p, amount) {
    const ch = p.char;
    if (!(amount > 0) || p.dead) return;
    const r = addXp(ch.level, ch.xp, amount);
    ch.xp = r.xp;
    if (r.gained > 0) {
      ch.level = r.level; p.level = r.level;
      ch.points.passive += r.gained; ch.points.skill += r.gained;
      p.dirtyStats = true; recompute(p, this.data);
      p.hp = p.maxHp; p.mana = manaCap(p);
      p.zone?.fx({ k: 'levelUp', id: p.id, level: ch.level }, p.x, p.y);
      this.sys(p.session, `レベル ${ch.level} になりました。パッシブの点とスキルの点が ${r.gained} つずつ増えました。`);
      this.markDirty(p, 'skills'); this.markDirty(p, 'tree'); this.markDirty(p, 'stats'); this.markDirty(p, 'quests');
      this.log.server('levelUp', { c: ch.id, level: ch.level });
    }
    this.markDirty(p);
  }
  revive(p, pct) {
    if (!p.dead) return;
    p.dead = false; p.hp = Math.max(1, (p.maxHp * pct) / 100); p.anim = ANIM.idle;
    p.zone?.fx({ k: 'vfx', name: 'revive', on: p.id }, p.x, p.y);
    this.markDirty(p);
  }
  pickItem(p, e) {
    const s = p.session, ch = s.char;
    if (!e || e.kind !== 'item' || e.removed || e.zone !== p.zone) return this.sendErr(s, 'noItem');
    if (e.gold) { ch.gold += e.gold; p.zone.remove(e); this.markDirty(p); this.markDirty(p, 'inv'); this.log.server('pick', { gold: e.gold }); return; }
    const r = addItem(ch.inv, INV_W, INV_H, e.item, this.data);
    if (!r.ok) { this.sendErr(s, 'full'); return; }
    p.zone.remove(e);
    this.questCollectChanged(s);
    this.markDirty(p, 'inv');
    this.log.server('pick', { item: e.item.base, rarity: e.item.rarity });
  }

  /* ---------------- 依頼 ---------------- */
  questState(ch, q) {
    const st = ch.quests[q.id];
    if (st?.state === 'done') return 'done';
    if (st?.state === 'active') return this.questProgress(ch, q).every((n) => n.have >= n.need) ? 'ready' : 'active';
    if (q.requires && ch.quests[q.requires]?.state !== 'done') return 'locked';
    if (ch.level < (q.minLevel ?? 1)) return 'locked';
    return 'available';
  }
  questProgress(ch, q) {
    const st = ch.quests[q.id] ?? {};
    return q.needs.map((n) => {
      let have = 0;
      if (n.kind === 'kill') have = st.kills?.[n.id] ?? 0;
      else if (n.kind === 'collect') have = ch.inv.filter((i) => i.base === n.id).reduce((a, i) => a + (i.qty ?? 1), 0);
      else if (n.kind === 'level') have = ch.level;
      else if (n.kind === 'visit') have = ch.visited.includes(n.id) ? 1 : 0;
      else if (n.kind === 'talk') have = st.talked?.[n.id] ? 1 : 0;
      return { kind: n.kind, id: n.id, need: n.count, have: Math.min(have, n.count) };
    });
  }
  questList(ch) {
    const out = [];
    for (const q of Object.values(this.data.quests)) {
      const state = this.questState(ch, q);
      if (state === 'locked') continue;
      out.push({ id: q.id, name: q.name, desc: q.desc, giver: q.giver, state, progress: state === 'active' || state === 'ready' ? this.questProgress(ch, q) : undefined });
    }
    return out;
  }
  questKill(s, monsterId) {
    if (!s) return;
    const ch = s.char;
    let changed = false;
    for (const [id, st] of Object.entries(ch.quests)) {
      if (st.state !== 'active') continue;
      const q = this.data.quests[id];
      for (const n of q?.needs ?? []) if (n.kind === 'kill' && n.id === monsterId) { st.kills ??= {}; st.kills[monsterId] = Math.min(n.count, (st.kills[monsterId] ?? 0) + 1); changed = true; }
    }
    if (changed) s.dirty.quests = true;
  }
  questVisit(s) { if (Object.values(s.char.quests).some((st) => st.state === 'active')) s.dirty.quests = true; }
  questCollectChanged(s) { if (Object.values(s.char.quests).some((st) => st.state === 'active')) s.dirty.quests = true; }
  questDropsFor(members, dst) {
    const out = [];
    for (const m of members) for (const [id, st] of Object.entries(m.char.quests)) {
      if (st.state !== 'active') continue;
      const q = this.data.quests[id];
      for (const n of q?.needs ?? []) {
        if (n.kind !== 'collect' || !this.data.consumables[n.id]) continue;
        const qd = this.data.questDrops?.[n.id];
        const from = qd?.from ?? q.from ?? this.data.consumables[n.id].dropFrom;
        if (Array.isArray(from) && !from.includes(dst.def.id)) continue;
        if (typeof q.map === 'string' && q.map !== dst.zone?.id) continue;
        if (!out.some((o) => o.item === n.id)) out.push({ item: n.id, chance: qd?.chance ?? (from ? 0.35 : 0.15) });
      }
    }
    return out;
  }

  /* ---------------- NPC ---------------- */
  openDialog(s, npcEnt, opt) { return openDialog(this, s, npcEnt, opt); }
  usePortal(p, portal) { return usePortalNow(this, p, portal); }

  /* ---------------- 保存の中身 ---------------- */
  // 保存先（localStorage）は画面が持つ。世界は中身を { t:'save', why, char } で渡すだけ
  snapshotChar(s) {
    const p = s.player, ch = s.char;
    if (p) { ch.x = r1(p.x); ch.y = r1(p.y); ch.hp = p.dead ? 0 : Math.round(p.hp); ch.mana = Math.round(p.mana); ch.map = p.zone?.id ?? ch.map; }
    ch.saved = new Date().toISOString();
    return ch;
  }
  saveSession(s, why) {
    if (!s?.char) return;
    try {
      this.send(s, { t: 'save', why, char: this.snapshotChar(s) });
      if (why !== 'sync') this.log.server('save', { c: s.char.id, why, map: s.char.map, level: s.char.level });
    } catch (e) { this.logError('save', { why }, e); }
  }

  /* ---------------- 記録の数字 ---------------- */
  metrics() {
    const m = this.m;
    let entities = 0, monsters = 0;
    for (const z of this.zones.values()) { entities += z.ents.size; for (const a of z.actors) if (a.kind === 'monster') monsters++; }
    const out = {
      tickHz: this.tickHz, paused: this.paused, speed: this.speed,
      tickAvgMs: m.ticks ? Math.round((m.sum / m.ticks) * 100) / 100 : 0, tickMaxMs: Math.round(m.max * 100) / 100, ticks: m.ticks,
      entities, monsters, zones: this.zones.size, rxMsgs: m.rxMsgs, txMsgs: m.txMsgs, txBytes: m.txBytes, cmds: m.cmds, errs: m.errs,
    };
    this.lastMetrics = out;
    this.m = this.freshMetrics();
    return out;
  }
}
const r1 = (v) => Math.round(v * 10) / 10;

/* ---------------- キャラ ---------------- */
export function newChar(D, id, name, rng = Math.random) {
  const ch = {
    v: 1, id, name, cls: 'adventurer', level: 1, xp: 0, gold: 30, map: D.maps.town ? 'town' : Object.keys(D.maps)[0], x: null, y: null, hp: null, mana: null,
    alloc: [], points: { passive: 0, skill: 0 }, ranks: {}, binds: {}, inv: [], equip: {}, stash: [], quests: {}, visited: [], returnTo: null,
    created: new Date().toISOString(),
  };
  fillChar(ch, D);
  // 初めの持ち物: 職業の start（{ weapon, armor:[], items:[{id,count}], gold }）。無ければ武器 1 本、回復薬 3、帰還の巻物 1
  let seq = 0;
  const uid = () => `${id.slice(0, 6)}s${seq++}`;
  const start = D.classes.adventurer?.start;
  const wId = start?.weapon && D.bases[start.weapon] ? start.weapon : Object.values(D.bases).filter((b) => b.slot === 'weapon').sort((a, b) => a.level - b.level)[0]?.id;
  if (wId) ch.equip.weapon = makeItem(D, rng, wId, 'normal', 1, uid());
  for (const aid of start?.armor ?? []) {
    const b = D.bases[aid];
    if (!b) continue;
    const slot = b.slot === 'ring' ? (ch.equip.ring1 ? 'ring2' : 'ring1') : b.slot;
    ch.equip[slot] = makeItem(D, rng, aid, 'normal', 1, uid());
  }
  const items = start?.items ?? [{ id: 'potion_life', count: 3 }, { id: 'scroll_return', count: 1 }];
  for (const e of items) {
    const it = D.consumables[e.id] ? makeConsumable(D, e.id, e.count ?? e.qty ?? 1, uid()) : D.bases[e.id] ? makeItem(D, rng, e.id, 'normal', 1, uid()) : null;
    if (it) addItem(ch.inv, INV_W, INV_H, it, D);
  }
  if (Number.isFinite(start?.gold)) ch.gold = start.gold;
  // 冒険者の最初のスキルをランク 1 にして右クリックへ
  const first = (D.classes.adventurer?.skills ?? []).find((sid) => (D.skills[sid]?.unlock ?? 1) <= 1);
  if (first) { ch.ranks[first] = 1; ch.binds.r = first; ch.binds['1'] = first; }
  return ch;
}
// 古い保存や足りない項目を補う
export function fillChar(ch, D) {
  ch.points ??= { passive: 0, skill: 0 };
  ch.ranks ??= {}; ch.binds ??= {}; ch.inv ??= []; ch.equip ??= {}; ch.stash ??= []; ch.quests ??= {}; ch.visited ??= [];
  if (!D.classes[ch.cls]) ch.cls = 'adventurer';
  const roots = treeRoots(D.tree, ch.cls);
  ch.alloc = (ch.alloc ?? []).filter((id) => D.tree.nodes[id]);
  for (const r of roots) if (!ch.alloc.includes(r)) ch.alloc.push(r);
  for (const sid of Object.keys(ch.ranks)) if (!D.skills[sid]) delete ch.ranks[sid];
  for (const [k, sid] of Object.entries(ch.binds)) if (!D.skills[sid]) delete ch.binds[k];
  return ch;
}
