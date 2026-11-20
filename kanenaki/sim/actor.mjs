// 動く者（プレイヤー・魔物・召喚・分身・NPC）の形、能力値の計算、状態（強化・弱体・状態異常）
import { computeStats, clamp } from '../shared/calc.mjs';
import { ANIM } from '../shared/schema.mjs';
import { itemMods } from './inventory.mjs';
import { treeMods } from './progress.mjs';

export const CC_KINDS = ['stun', 'root', 'slow', 'silence', 'fear', 'sleep'];
const HISTORY_N = 60, HISTORY_MS = 100; // 巻き戻し用に 6 秒分を 0.1 秒ごと

export function baseActor(world, kind, props) {
  return {
    id: world.newId(), kind, team: 'n', art: kind, name: '', level: 1, cls: null, rarity: 'normal',
    x: 0, y: 0, dir: 0, anim: ANIM.idle, animUntil: 0, radius: 0.4,
    hp: 1, mana: 0, maxHp: 1, maxMana: 0, reserved: 0,
    stats: null, mods: [], rules: [], weapon: null, dirtyStats: true,
    statuses: [], cc: { stun: false, root: false, slow: 0, silence: false, fear: false, sleep: false, fearFrom: null },
    path: null, pathGoal: null, pathAt: 0, action: null, attackReadyAt: 0, casting: null, channel: null, forced: null,
    cds: {}, history: null, dead: false, diedAt: 0, untargetable: false, owner: null, auras: {}, stances: {},
    ...props,
  };
}

export const isActor = (e) => e && (e.kind === 'player' || e.kind === 'monster');
export const isEnemy = (a, b) => isActor(a) && isActor(b) && a.team !== b.team && a.team !== 'n' && b.team !== 'n';
export const isAlly = (a, b) => isActor(a) && isActor(b) && a.team === b.team;
export const hpPct = (e) => (isActor(e) ? clamp(0, 100, Math.ceil((e.hp / Math.max(1, e.maxHp)) * 100)) : 100);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const hasStatus = (a, id) => a.statuses.some((s) => s.id === id);
export const getStatus = (a, id) => a.statuses.find((s) => s.id === id);
export const isBoss = (a) => a.rarity === 'boss';
export const manaCap = (a) => Math.max(0, Math.floor(a.maxMana * (1 - a.reserved / 100)));

/* ---------------- 能力値 ---------------- */
function statusMods(a) {
  const out = [];
  for (const s of a.statuses) {
    if (!s.mods) continue;
    const n = Math.max(1, s.stacks ?? 1);
    for (const m of s.mods) {
      if (m.mode === 'more') for (let i = 0; i < n; i++) out.push(m);
      else out.push({ key: m.key, mode: m.mode, value: m.value * n });
    }
  }
  return out;
}

export function recompute(a, D) {
  const oldMax = a.maxHp, oldMana = a.maxMana;
  if (a.kind === 'player') {
    const ch = a.char;
    const classDef = D.classes[ch.cls] ?? D.classes.adventurer;
    const mods = [];
    const rules = [];
    for (const it of Object.values(ch.equip ?? {})) {
      if (!it) continue;
      for (const m of itemMods(it)) mods.push(m);
      if (it.rule) rules.push(it.rule);
    }
    const t = treeMods(D.tree, new Set(ch.alloc ?? []));
    mods.push(...t.mods); rules.push(...t.rules);
    mods.push(...statusMods(a));
    const w = ch.equip?.weapon;
    a.weapon = w?.dmg ? { dmg: w.dmg, speed: w.speed ?? 1.4, kind: w.kind } : null;
    a.stats = computeStats({ level: ch.level, classDef, mods, rules, weapon: a.weapon });
    a.attackStat = classDef.attackStat ?? 'str';
  } else if (a.kind === 'monster') {
    const def = a.def;
    const mods = [...(a.extraMods ?? []), ...statusMods(a)];
    a.stats = computeStats({
      level: a.level, classDef: { base: { str: 0, dex: 0, int: 0, vit: 0 } }, mods,
      bases: {
        life: a.baseLife, mana: 300, armor: def.armor ?? a.level * 5, evasion: def.evasion ?? a.level * 3,
        accuracy: def.accuracy ?? a.level * 10 + 40, moveSpeed: def.speed, aps: def.aps ?? def.attackSpeed ?? (def.ai === 'swarm' ? 1.1 : 0.85),
        lifeRegen: 0, manaRegen: 10,
        ...Object.fromEntries(Object.entries(def.res ?? {}).map(([k, v]) => [`res${k[0].toUpperCase()}${k.slice(1)}`, v])),
      },
    });
  } else return;
  a.rules = a.stats.rules;
  a.maxHp = Math.max(1, a.stats.life);
  a.maxMana = Math.max(0, a.stats.mana);
  // 最大が増えたら今の値も同じ割合で保つ（減ったら上限で切る）
  if (oldMax > 1 && a.maxHp > oldMax && !a.dead) a.hp = Math.min(a.maxHp, a.hp + (a.maxHp - oldMax));
  a.hp = Math.min(a.hp, a.maxHp);
  if (oldMana > 0 && a.maxMana > oldMana) a.mana += a.maxMana - oldMana;
  a.mana = Math.min(a.mana, manaCap(a));
  a.dirtyStats = false;
}

/* ---------------- 状態 ---------------- */
// st = { id, kind:'buff'|'debuff'|'dot'|'shield'|'stance'|'aura', src, until, mods?, cc?, value?, maxStacks?, dps?, type?, amount?, dmgTaken?, ... }
export function addStatus(a, st, now) {
  const same = a.statuses.find((s) => s.id === st.id && (st.kind !== 'dot' || s.src === st.src));
  if (same) {
    same.until = Math.max(same.until, st.until);
    const max = st.maxStacks ?? same.maxStacks ?? 1;
    if (max > 1) same.stacks = Math.min(max, (same.stacks ?? 1) + 1);
    for (const k of ['mods', 'dps', 'amount', 'value', 'dmgTaken', 'share']) if (st[k] !== undefined) same[k] = st[k];
    if (st.mods) a.dirtyStats = true;
    deriveCC(a);
    return same;
  }
  const s = { stacks: 1, maxStacks: 1, nextTick: now + 500, ...st };
  a.statuses.push(s);
  if (s.mods) a.dirtyStats = true;
  deriveCC(a);
  return s;
}
export function removeStatus(a, pred) {
  const before = a.statuses.length;
  const gone = [];
  a.statuses = a.statuses.filter((s) => { if (pred(s)) { gone.push(s); return false; } return true; });
  if (gone.some((s) => s.mods)) a.dirtyStats = true;
  if (before !== a.statuses.length) deriveCC(a);
  return gone;
}
export function deriveCC(a) {
  const c = a.cc;
  c.stun = c.root = c.silence = c.fear = c.sleep = false; c.slow = 0; c.fearFrom = null;
  for (const s of a.statuses) {
    if (!s.cc) continue;
    if (s.cc === 'slow') c.slow = Math.max(c.slow, clamp(0, 90, s.value ?? 30));
    else if (s.cc === 'fear') { c.fear = true; c.fearFrom = s.src; }
    else if (CC_KINDS.includes(s.cc)) c[s.cc] = true;
  }
}
export const canAct = (a) => !a.dead && !a.cc.stun && !a.cc.sleep && !a.cc.fear;
export const canMove = (a) => canAct(a) && !a.cc.root;
export const canCast = (a) => canAct(a) && !a.cc.silence;

/* ---------------- 巻き戻しの履歴 ---------------- */
export function recordHistory(a, now) {
  if (!a.history) a.history = { buf: new Float64Array(HISTORY_N * 4), i: 0, n: 0, last: 0 };
  const h = a.history;
  if (now - h.last < HISTORY_MS) return;
  h.last = now;
  const k = h.i * 4;
  h.buf[k] = now; h.buf[k + 1] = a.x; h.buf[k + 2] = a.y; h.buf[k + 3] = a.hp;
  h.i = (h.i + 1) % HISTORY_N; h.n = Math.min(HISTORY_N, h.n + 1);
}
// seconds 秒前にいちばん近い記録 { x, y, hp }
export function historyAt(a, now, seconds) {
  const h = a.history;
  if (!h || !h.n) return null;
  const want = now - seconds * 1000;
  let best = null, bd = Infinity;
  for (let j = 0; j < h.n; j++) {
    const k = j * 4;
    const d = Math.abs(h.buf[k] - want);
    if (d < bd) { bd = d; best = { x: h.buf[k + 1], y: h.buf[k + 2], hp: h.buf[k + 3] }; }
  }
  return best;
}

/* ---------------- 送る形 ---------------- */
export function spawnInfo(e) {
  const o = { id: e.id, kind: e.kind, art: e.art, x: r2(e.x), y: r2(e.y), dir: e.dir ?? 0, hpPct: hpPct(e), anim: e.anim ?? 0 };
  if (e.name) o.name = e.name;
  if (isActor(e)) {
    o.level = e.level; o.team = e.team; o.rarity = e.rarity;
    if (e.cls) o.cls = e.cls;
    if (e.owner) o.owner = e.owner;
    if (e.elite?.length) o.elite = e.elite;
    if (e.clone) o.clone = true;
    if (hasStatus(e, 'stealth')) o.stealth = true;
    if (e.dead) o.dead = true;
    if (e.kind === 'monster' && e.def?.boss) o.boss = true;
  }
  if (e.kind === 'npc') { o.npc = e.npcId; o.role = e.role; }
  if (e.kind === 'item') { o.item = e.gold ? { gold: e.gold } : { base: e.item.base, name: e.item.name, rarity: e.item.rarity, qty: e.item.qty, icon: e.item.icon }; o.rarity = e.gold ? 'normal' : e.item.rarity; }
  if (e.kind === 'object') { o.obj = e.objKind; if (e.radius) o.r = e.radius; if (e.until && Number.isFinite(e.until)) o.until = e.until; if (e.owner) o.owner = e.owner; }
  if (e.kind === 'missile') { o.vx = r2(e.vx); o.vy = r2(e.vy); o.owner = e.ownerId; }
  return o;
}
const r2 = (v) => Math.round(v * 100) / 100;

// 自分の全部の情報（welcome・zone の you）
export function youInfo(p) {
  const ch = p.char;
  const s = p.stats ?? {};
  const { agg, ...stats } = s;
  return {
    id: p.id, cid: ch.id, name: ch.name, cls: ch.cls, level: ch.level, xp: ch.xp, xpNext: p.xpNext,
    hp: Math.round(p.hp), maxHp: p.maxHp, mana: Math.round(p.mana), maxMana: p.maxMana, manaCap: manaCap(p),
    gold: ch.gold, map: ch.map, x: r2(p.x), y: r2(p.y), dead: p.dead, stats,
    points: { ...ch.points }, statuses: statusList(p),
  };
}
export function statusList(a) {
  return a.statuses.filter((s) => s.kind !== 'aura' || s.src !== a.id).map((s) => ({ id: s.id, kind: s.kind, cc: s.cc, stacks: s.stacks, until: Number.isFinite(s.until) ? s.until : null }));
}
