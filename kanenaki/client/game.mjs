// 画面が持つ世界の状態。世界の計算（Worker）の S2C を受け取って更新し、描く位置を決める。
// ・物の位置は、届いた位置を 50 ms 遅らせて補間する（schema の INTERP_DELAY_MS）。自分も同じ。
//   1 人用で Worker との遅れが 0 に近いので、先に動かす予測はやめた（ずれが出ない）。
// ・G.pred は「いま描く自分の位置」。カメラ・小さな地図・スキルの狙いが使う。
import { ANIM, INTERP_DELAY_MS, TICK_HZ } from '../shared/schema.mjs';
import { createTrack, pushTrack, sampleTrack, xpToNext } from './core.mjs';

const STEP_MS = 1000 / TICK_HZ;

export function createGame({ data, mapgen, fx, log, emit }) {
  const g = {
    mapId: null, zoneId: null, mapDef: null, map: null, mapVersion: 0, portals: [],
    ents: new Map(), meId: null, me: {},
    inv: { items: [], equip: {}, gold: 0, stash: null },
    tree: { alloc: new Set(), points: 0 },
    skills: { ranks: {}, binds: {}, points: 0, cds: {} },
    quests: [],
    pred: { x: 0, y: 0, dir: 0, has: false, moving: false },
    timeOff: null, selected: null, hover: null, names: [], welcomed: false, dead: false, paused: false, speed: 1,
    warns: [], // 地面の印（{ x, y, r, shape, dir, len, width, hostile, until: performance.now() の時刻 }）
  };

  const entName = (e) => e.name || (e.item ? (e.item.gold ? `お金 ${e.item.gold}` : `${e.item.name}${e.item.qty > 1 ? ` ×${e.item.qty}` : ''}`) : '');
  const makeEnt = (e) => ({
    id: e.id, kind: e.kind || 'unknown', art: e.art || e.item?.icon || e.item?.base || e.cls || 'unknown', name: entName(e), level: e.level ?? null, cls: e.cls || null,
    rarity: e.rarity || null, x: e.x ?? 0, y: e.y ?? 0, dir: e.dir ?? 0, anim: e.dead ? ANIM.dead : e.anim ?? ANIM.idle, hp: e.hpPct ?? 100,
    track: createTrack(), latest: null, flashUntil: 0, cc: {}, animStart: 0, raw: e,
  });

  /* ---------------- 地図 ---------------- */
  function enterZone(mapId, zoneId) {
    const def = data.maps[mapId];
    if (!def) log('zone.enter', { map: mapId }, 'error:no-map-def');
    const d = def || { id: mapId, name: mapId, w: 64, h: 64, light: 0, portals: [], npcs: [], spawns: [], props: [] };
    let built;
    try { built = mapgen.buildMap(d); } catch (e) { log('zone.build', { map: mapId }, 'exception:' + e.message); built = { w: d.w, h: d.h, ground: new Uint8Array(d.w * d.h), solid: new Uint8Array(d.w * d.h), props: [], portals: [], npcs: [], spawns: [] }; }
    g.mapId = mapId; g.zoneId = zoneId ?? mapId; g.mapDef = d; g.map = built; g.mapVersion++;
    for (const id of [...g.ents.keys()]) if (id !== g.meId) g.ents.delete(id);
    g.selected = null; g.hover = null; g.warns = [];
    const me = g.ents.get(g.meId);
    if (me) me.track.length = 0;
    fx.clear();
    log('zone.enter', { map: mapId, w: built.w, h: built.h }, 'ok');
    emit('zone', { mapId, name: d.name });
  }

  /* ---------------- 受け取り ---------------- */
  const handlers = {
    welcome(m) {
      g.welcomed = true;
      if (m.you) setYou(m.you);
      emit('welcome', { hasChar: !!m.you });
    },
    names(m) { g.names = m.list || []; emit('names', g.names); },
    zone(m) {
      if (m.you) setYou(m.you);
      g.portals = Array.isArray(m.portals) ? m.portals : [];
      enterZone(m.map, m.zone);
    },
    spawn(m) {
      const e = m.e; if (!e || e.id == null) return;
      let ent = g.ents.get(e.id);
      if (!ent) { ent = makeEnt(e); g.ents.set(e.id, ent); }
      else Object.assign(ent, { kind: e.kind || ent.kind, art: e.art || ent.art, name: entName(e) || ent.name, level: e.level ?? ent.level, cls: e.cls ?? ent.cls, rarity: e.rarity ?? ent.rarity, raw: e, hp: e.hpPct ?? ent.hp, anim: e.dead ? ANIM.dead : ent.anim });
      if (e.x != null && !ent.track.length) { ent.x = e.x; ent.y = e.y; ent.dir = e.dir ?? ent.dir; }
      if (e.id === g.meId && !g.pred.has) { g.pred.x = e.x; g.pred.y = e.y; g.pred.has = true; }
    },
    snap(m) {
      const now = performance.now();
      const st = m.st ?? now;
      // 世界の時計と画面の時計の差。止めた・速めたなどで大きくずれたら、その場で合わせ直す
      const off = now - st;
      if (g.timeOff == null || off < g.timeOff || off - g.timeOff > 250) g.timeOff = off; else g.timeOff += (off - g.timeOff) * 0.05;
      for (const row of m.ents || []) {
        const [id, x100, y100, dir, anim, hp] = row;
        let e = g.ents.get(id);
        if (!e) { e = makeEnt({ id, kind: 'unknown' }); g.ents.set(id, e); }
        const x = x100 / 100, y = y100 / 100;
        if (anim !== e.lastAnim) { e.animStart = now; e.lastAnim = anim; }
        // 変わった物だけが届く。止まっていた物が動き出したときは、直前の位置を 1 回分前に置き直して、古い位置から長く滑らないようにする
        const prev = e.track[e.track.length - 1];
        if (prev && st - prev.t > STEP_MS * 1.5) pushTrack(e.track, st - STEP_MS, prev.x, prev.y, prev.dir, prev.anim, prev.hp);
        pushTrack(e.track, st, x, y, dir, anim, hp);
        e.latest = { x, y, dir, anim, hp, t: now };
        if (id === g.meId) {
          if (!g.pred.has) { g.pred.x = x; g.pred.y = y; g.pred.has = true; }
          if (anim === ANIM.dead && !g.dead) { g.dead = true; emit('death', {}); }
          else if (anim !== ANIM.dead && g.dead) { g.dead = false; emit('alive', {}); }
        }
      }
      for (const id of m.gone || []) removeEnt(id);
    },
    fx(m) { onFx(m); },
    me(m) {
      const { t, ...rest } = m;
      Object.assign(g.me, rest);
      if (rest.id != null) g.meId = rest.id;
      if (rest.dead === true && !g.dead) { g.dead = true; emit('death', {}); }
      else if (rest.dead === false && g.dead) { g.dead = false; emit('alive', {}); }
      if (rest.statuses) applyStatuses(rest.statuses);
      emit('me', rest);
    },
    inv(m) { g.inv = { items: m.items || [], equip: m.equip || {}, gold: m.gold ?? g.inv.gold, stash: m.stash ?? null }; emit('inv', g.inv); },
    tree(m) { g.tree = { alloc: new Set(m.alloc || []), points: m.points ?? 0 }; emit('tree', g.tree); },
    skills(m) {
      const now = performance.now();
      const cds = {};
      for (const [s, v] of Object.entries(m.cds || {})) {
        const ms = Number(v) || 0;
        const total = (data.skills[s]?.cd || ms / 1000) * 1000;
        if (ms > 0) cds[s] = { until: now + ms, total: Math.max(ms, total) };
      }
      // cds は世界の計算が「いま待っている物」を全部送るので、足し合わせずに置き換える
      g.skills = { ranks: m.ranks || g.skills.ranks, binds: m.binds || g.skills.binds, points: m.points ?? g.skills.points, cds, avail: m.avail || g.skills.avail };
      emit('skills', g.skills);
    },
    quests(m) { g.quests = m.list || []; emit('quests', g.quests); },
    dialog(m) { emit('dialog', m); },
    shop(m) { emit('shop', m); },
    sys(m) { emit('sys', { msg: m.msg }); },
    err(m) { emit('sys', { msg: m.msg || '受け付けられませんでした', err: m.code }); },
    save(m) { emit('save', m); },
    paused(m) { g.paused = !!m.on; g.speed = m.speed ?? 1; emit('paused', m); },
  };

  // 自分の状態（until は世界の時計）を、頭の上の印にする
  function applyStatuses(list) {
    const me = g.ents.get(g.meId);
    if (!me) return;
    const simNow = performance.now() - (g.timeOff ?? 0);
    const now = performance.now();
    me.cc = {};
    for (const s of list) if (s.cc && s.until != null) me.cc[s.cc] = now + Math.max(0, s.until - simNow);
  }

  function setYou(you) {
    g.me = { ...g.me, ...you };
    if (you.id != null) g.meId = you.id;
    if (you.dead != null) g.dead = !!you.dead;
    if (you.x != null) Object.assign(g.pred, { x: you.x, y: you.y, has: true });
    emit('me', g.me);
  }
  function removeEnt(id) {
    if (id === g.meId) return;
    g.ents.delete(id);
    if (g.selected === id) g.selected = null;
    if (g.hover === id) g.hover = null;
  }

  function entPos(e) { return e.id === g.meId && g.pred.has ? { x: g.pred.x, y: g.pred.y } : { x: e.x, y: e.y }; }

  function onFx(m) {
    // dmg { id, src, amt, type, crit?, miss?, block? } / heal { id, amt } / vfx { name, src, on?, x?, y?, to?:{x,y}|id, from?, r? }
    // cast { id, s, x, y, tid, dur(ms), vfx } / cc { id, cc, dur(ms) } / loot { id, n, tier } / death { id, by } / levelUp { id, level }
    const e = m.id != null ? g.ents.get(m.id) : m.on != null ? g.ents.get(m.on) : null;
    const at = m.x != null ? { x: m.x, y: m.y } : e ? entPos(e) : null;
    const posOf = (v) => (v == null ? null : typeof v === 'object' ? (v.x != null ? { x: v.x, y: v.y } : null) : g.ents.get(v) ? entPos(g.ents.get(v)) : null);
    switch (m.k) {
      case 'dmg': {
        if (!at) return;
        if (m.miss || m.dodge) { fx.text(at, '外れ', [200, 200, 200], 0.8); return; }
        if (m.block) { fx.text(at, '防いだ', [190, 210, 255], 0.8); return; }
        const v = m.amt ?? 0;
        fx.number(at, v, { type: m.type || 'phys', crit: !!m.crit });
        fx.hitSpark(at, m.type);
        if (e) e.flashUntil = performance.now() + 90;
        if (e && e.id === g.meId) emit('hurt', { v });
        break;
      }
      case 'heal': if (at) fx.number(at, m.amt ?? 0, { heal: true }); break;
      case 'vfx': {
        if (m.off) return;
        const name = m.name ?? m.vfx;
        const from = posOf(m.from) || (m.src != null ? posOf(m.src) : null);
        const to = posOf(m.to);
        const p = m.x != null ? { x: m.x, y: m.y } : e ? entPos(e) : to || from;
        if (!p) return;
        const end = to || p;
        const opt = { from: to ? p : from, to: end, type: m.type, r: m.r, angle: from ? Math.atan2(end.y - from.y, end.x - from.x) : 0 };
        if (m.delay > 0) {
          // 前触れのある範囲: 当たるまで地面に印を出し、当たる時に効果を出す
          const srcEnt = m.src != null ? g.ents.get(m.src) : null;
          const hostile = m.src !== g.meId && !(srcEnt && (srcEnt.raw?.team === 'p' || srcEnt.raw?.owner === g.meId));
          const w = { x: p.x, y: p.y, r: m.r, shape: m.shape ?? 'circle', dir: m.dir ?? 0, len: m.len, width: m.width, angle: m.angle, delay: m.delay, hostile, src: m.src };
          fx.warn(w);
          g.warns.push({ ...w, until: performance.now() + (m.delay * 1000) / (g.speed || 1) }); // 時間を速めているときは、そのぶん早く当たる
          if (g.warns.length > 40) g.warns.splice(0, g.warns.length - 40);
          fx.playLater(m.delay, name, to && m.x != null ? end : p, opt);
        } else fx.play(name, to && m.x != null ? end : p, opt);
        if (m.on === g.meId && /torch/.test(name)) g.me.torch = true;
        break;
      }
      case 'cast': {
        const ms = Math.max(250, Math.min(1500, m.dur ?? 350));
        if (e) e.castUntil = performance.now() + ms;
        if (e && m.x != null) { const p = entPos(e); e.castDir = Math.atan2(m.y - p.y, m.x - p.x); }
        if (e) fx.light(entPos(e), 2, ms / 1000, [255, 230, 180]);
        // 魔物の構え（詠唱の長い技）は、頭の上に「！」を出す
        if (e && e.kind === 'monster' && e.raw?.team !== 'p' && (m.dur ?? 0) >= 500) fx.text(entPos(e), '！', [255, 110, 70], m.dur / 1000, e.raw?.boss ? 46 : 30);
        if (m.vfx && m.x != null && m.id === g.meId) fx.play(m.vfx, { x: m.x, y: m.y }, { from: e ? entPos(e) : null, to: { x: m.x, y: m.y } });
        break;
      }
      case 'death': if (at) fx.deathPuff(at); if (e) { e.deadAt = performance.now(); e.anim = ANIM.dead; } break;
      case 'levelUp': {
        if (at) { fx.play('revive', at); fx.text(at, `レベル ${m.level ?? ''}`, [255, 226, 120], 2); }
        if (m.id === g.meId) emit('levelUp', { level: m.level });
        break;
      }
      case 'loot': if (at) fx.beam(at, m.tier === 'boss' ? 'unique' : m.tier === 'elite' ? 'rare' : 'magic'); break;
      case 'cc': if (e && m.cc) { e.cc[m.cc] = performance.now() + (m.dur ?? 1000); } break;
      default: log('fx.unknown', { k: m.k }, 'ignored');
    }
  }

  /* ---------------- 毎コマ ---------------- */
  function renderTime() { return performance.now() - (g.timeOff ?? 0) - INTERP_DELAY_MS; }

  function update() {
    const rt = renderTime();
    const now = performance.now();
    for (const e of g.ents.values()) {
      if (e.track.length) {
        const s = sampleTrack(e.track, rt);
        e.x = s.x; e.y = s.y; e.dir = s.dir; e.anim = s.anim; e.hp = s.hp;
      }
      for (const k in e.cc) if (e.cc[k] < now) delete e.cc[k];
      if (e.kind === 'missile') fx.trailDot({ x: e.x, y: e.y }, [255, 220, 150]);
    }
    const me = g.ents.get(g.meId);
    if (me && (me.track.length || me.latest)) {
      const moved = Math.hypot(me.x - g.pred.x, me.y - g.pred.y) > 1e-4;
      g.pred.x = me.x; g.pred.y = me.y; g.pred.dir = me.dir; g.pred.has = true; g.pred.moving = moved;
    }
  }

  function myAnim() {
    const me = g.ents.get(g.meId);
    if (g.dead) return ANIM.dead;
    if (me?.castUntil > performance.now()) return ANIM.cast;
    return me?.anim ?? ANIM.idle;
  }

  function vitals() {
    const m = g.me;
    const life = m.hp ?? 0, lifeMax = m.maxHp ?? m.stats?.life ?? Math.max(1, life);
    const mana = m.mana ?? 0, manaMax = m.maxMana ?? m.stats?.mana ?? Math.max(1, mana);
    const level = m.level ?? 1;
    const xp = m.xp ?? 0, xpNext = m.xpNext ?? xpToNext(level);
    return { life, lifeMax, mana, manaMax, level, xp, xpNext };
  }

  return {
    g, handlers, update, entPos, renderTime, myAnim, vitals, enterZone,
    tileTypes: mapgen.TILE_TYPES,
    handle(m) { const h = handlers[m.t]; if (h) h(m); else log('link.recv.unknown', { t: m.t }, 'ignored'); },
  };
}
