// データの読み込みと整え。データの係が同時に作っているので、足りない物があっても落ちない。
// 知らない部品・id・能力値のキーは警告を記録に書いて飛ばす。
import { OPS, STAT_KEYS, MOD_MODES, DAMAGE_TYPES, CLASSES, SLOTS } from '../shared/schema.mjs';
import { buildMap } from '../shared/mapgen.mjs';
import { KNOWN_RULES } from '../shared/calc.mjs';

export const DATA_URL = new URL('../shared/data/index.mjs', import.meta.url).href;
export const FIXTURE_URL = new URL('./fixtures/data.mjs', import.meta.url).href;
const NAMES = ['classes', 'skills', 'tree', 'bases', 'consumables', 'affixes', 'uniques', 'monsters', 'maps', 'npcs', 'quests', 'phrases', 'stamps', 'nameParts'];
const STAT_SET = new Set(STAT_KEYS);
const NESTED = ['onHit', 'onTick', 'passHit', 'onArrive', 'onTrigger', 'onLand', 'effects'];

// { url, fallbackUrl, fixturesOnly, warn(event, args) } → 整えたデータ
export async function loadData({ url = DATA_URL, fallbackUrl = FIXTURE_URL, fixturesOnly = false, warn = () => {} } = {}) {
  let mod = {}, fb = {};
  if (!fixturesOnly) {
    try { mod = await import(url); } catch (e) { warn('data.import', { url, error: String(e?.message ?? e).slice(0, 300) }); }
  }
  if (fallbackUrl) {
    try { fb = await import(fallbackUrl); } catch (e) { warn('data.importFallback', { url: fallbackUrl, error: String(e?.message ?? e).slice(0, 300) }); }
  }
  const raw = {};
  const source = {};
  for (const n of NAMES) {
    if (mod[n] !== undefined && !fixturesOnly) { raw[n] = mod[n]; source[n] = 'data'; }
    else if (fb[n] !== undefined) { raw[n] = fb[n]; source[n] = 'fixture'; if (!fixturesOnly) warn('data.fallback', { name: n }); }
    else { source[n] = 'none'; warn('data.missing', { name: n }); }
  }
  // 無くてもよい補助（データの係が足した物）。見本のデータからは補わない
  for (const n of OPTIONAL) {
    if (!fixturesOnly && mod[n] !== undefined) raw[n] = mod[n];
    else if (fixturesOnly && fb[n] !== undefined) raw[n] = fb[n];
  }
  const data = normalize(raw, warn);
  data.source = source;
  return data;
}
const OPTIONAL = ['lootTiers', 'questDrops', 'eliteMods', 'tierScale', 'scaleMonster', 'makeName'];

const asMap = (v) => {
  if (!v) return {};
  if (Array.isArray(v)) return Object.fromEntries(v.filter((x) => x?.id != null).map((x) => [x.id, x]));
  if (typeof v === 'object') return v;
  return {};
};
const asArr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);

export function normMods(mods, warn, where) {
  const out = [];
  for (const m of asArr(mods)) {
    if (!m || !STAT_SET.has(m.key)) { warn('data.unknownStat', { where, key: m?.key }); continue; }
    const mode = MOD_MODES.includes(m.mode) ? m.mode : 'flat';
    const value = Array.isArray(m.value) ? m.value.map(Number) : Number(m.value);
    if (Array.isArray(value) ? value.some((x) => !Number.isFinite(x)) : !Number.isFinite(value)) { warn('data.badModValue', { where, key: m.key }); continue; }
    out.push({ key: m.key, mode, value, ...(m.perRank != null ? { perRank: Number(m.perRank) || 0 } : {}) });
  }
  return out;
}

// 効果の部品の名前を見つける: { op } が基本。{ kind }、{ type: 'hit' }、{ hit: {...} } も受ける。
export function opOf(e) {
  if (!e || typeof e !== 'object') return null;
  if (typeof e.op === 'string') return e.op;
  if (typeof e.kind === 'string' && OPS[e.kind]) return e.kind;
  if (typeof e.type === 'string' && OPS[e.type]) return e.type;
  const keys = Object.keys(e);
  if (keys.length === 1 && OPS[keys[0]] && typeof e[keys[0]] === 'object') return keys[0];
  return null;
}

export function normEffects(list, warn, where) {
  const out = [];
  for (const raw of asArr(list)) {
    const op = opOf(raw);
    if (!op || !OPS[op]) { warn('data.unknownOp', { where, op: op ?? raw?.op ?? null }); continue; }
    let e = raw;
    if (raw.op === undefined && Object.keys(raw).length === 1 && raw[op] && typeof raw[op] === 'object') e = { ...raw[op] };
    e = { ...e, op };
    if (raw.kind === op) delete e.kind;
    if (raw.type === op && op !== 'dot') delete e.type;
    if (e.dmg) e.dmg = normDmg(e.dmg);
    if (op === 'dot' && !DAMAGE_TYPES.includes(e.type)) e.type = 'phys';
    if (Array.isArray(e.mods)) e.mods = normMods(e.mods, warn, `${where}.${op}`);
    for (const k of NESTED) if (e[k] !== undefined) e[k] = normEffects(e[k], warn, `${where}.${op}.${k}`);
    out.push(e);
  }
  return out;
}
function normDmg(d) {
  const base = Array.isArray(d.base) ? [num(d.base[0], 0), num(d.base[1] ?? d.base[0], 0)] : [num(d.base, 0), num(d.base, 0)];
  return { ...d, type: DAMAGE_TYPES.includes(d.type) ? d.type : 'phys', base };
}

function walkEffects(list, fn) {
  for (const e of list ?? []) { fn(e); for (const k of NESTED) if (Array.isArray(e[k])) walkEffects(e[k], fn); }
}

export function normalize(raw, warn = () => {}) {
  const D = { warnings: 0 };
  const W = (ev, a) => { D.warnings++; warn(ev, a); };
  const safe = (name, fn, dflt) => { try { return fn(); } catch (e) { W('data.broken', { name, error: String(e?.message ?? e).slice(0, 300) }); return dflt; } };

  /* 職業 */
  D.classes = safe('classes', () => {
    const out = {};
    for (const [id, c] of Object.entries(asMap(raw.classes))) {
      if (!CLASSES[id]) W('data.unknownClass', { id });
      out[id] = {
        id, name: c.name ?? CLASSES[id]?.name ?? id, desc: c.desc ?? '',
        base: { str: 10, dex: 10, int: 10, vit: 10, ...(c.base ?? {}) },
        perLevel: { str: 1, dex: 1, int: 1, vit: 1, life: 5, mana: 2, ...(c.perLevel ?? {}) },
        life: num(c.life, 50), mana: num(c.mana, 20), skills: asArr(c.skills), treeStart: c.treeStart ?? null, art: c.art ?? id,
        start: c.start ?? null, weapons: Array.isArray(c.weapons) ? c.weapons : null, attackStat: ['str', 'dex', 'int', 'vit'].includes(c.attackStat) ? c.attackStat : 'str',
        tier: CLASSES[id]?.tier ?? (id === 'adventurer' ? 0 : 1),
      };
    }
    if (!out.adventurer) { W('data.defaultClass', { id: 'adventurer' }); out.adventurer = { id: 'adventurer', name: '冒険者', desc: '', base: { str: 10, dex: 10, int: 10, vit: 10 }, perLevel: { str: 1, dex: 1, int: 1, vit: 1, life: 6, mana: 2 }, life: 60, mana: 30, skills: [], treeStart: null, art: 'adventurer', tier: 0 }; }
    return out;
  }, {});

  /* スキル */
  D.skills = safe('skills', () => {
    const out = {};
    for (const [id, s] of Object.entries(asMap(raw.skills))) {
      const sid = s.id ?? id;
      const effects = normEffects(s.effects, W, `skill:${sid}`);
      out[sid] = {
        ...s, id: sid, cls: s.cls ?? 'adventurer', name: s.name ?? sid, desc: s.desc ?? '',
        unlock: num(s.unlock, 1), maxRank: Math.max(1, num(s.maxRank, 20)),
        cost: { mana: num(s.cost?.mana ?? s.cost, 0), perRank: num(s.cost?.perRank, 0), ...(s.cost?.life != null ? { life: num(s.cost.life, 0) } : {}) },
        cd: num(s.cd, 0), cdPerRank: num(s.cdPerRank, 0), cast: num(s.cast, 0), range: num(s.range, 1.5),
        target: ['enemy', 'ground', 'self', 'ally', 'dir'].includes(s.target) ? s.target : 'ground',
        tags: asArr(s.tags).map(String), effects, vfx: s.vfx ?? sid, icon: s.icon ?? sid,
      };
    }
    return out;
  }, {});
  for (const c of Object.values(D.classes)) c.skills = c.skills.filter((s) => { if (D.skills[s]) return true; W('data.unknownSkill', { where: `class:${c.id}`, id: s }); return false; });

  /* ツリー */
  D.tree = safe('tree', () => {
    const t = raw.tree ?? {};
    const nodes = {};
    for (const [id, n] of Object.entries(asMap(t.nodes))) {
      const nid = n.id ?? id;
      nodes[nid] = { id: nid, x: num(n.x, 0), y: num(n.y, 0), kind: n.kind ?? 'small', cls: n.cls ?? null, name: n.name ?? nid, mods: normMods(n.mods, W, `tree:${nid}`), rule: n.rule ?? null, links: new Set(asArr(n.links)) };
      if (n.rule && !KNOWN_RULES[n.rule]) W('data.unknownRule', { node: nid, rule: n.rule });
    }
    for (const n of Object.values(nodes)) for (const l of [...n.links]) {
      if (!nodes[l]) { W('data.badLink', { node: n.id, link: l }); n.links.delete(l); continue; }
      nodes[l].links.add(n.id);
    }
    for (const n of Object.values(nodes)) n.links = [...n.links];
    const starts = { ...(t.starts ?? {}) };
    for (const [cls, c] of Object.entries(D.classes)) if (!starts[cls] && c.treeStart && nodes[c.treeStart]) starts[cls] = c.treeStart;
    for (const n of Object.values(nodes)) {
      if (n.kind === 'start' && !starts.adventurer) starts.adventurer = n.id;
      if (n.kind === 'gate' && n.cls && !starts[n.cls]) starts[n.cls] = n.id;
    }
    for (const [cls, id] of Object.entries(starts)) if (!nodes[id]) { W('data.badTreeStart', { cls, id }); delete starts[cls]; }
    return { nodes, starts };
  }, { nodes: {}, starts: {} });

  /* 品物 */
  const slotOk = new Set([...SLOTS, 'ring']);
  D.bases = safe('bases', () => {
    const out = {};
    for (const b of asArr(raw.bases)) {
      if (!b?.id) continue;
      let slot = b.slot;
      if (!slotOk.has(slot)) { W('data.badSlot', { id: b.id, slot }); continue; }
      if (slot === 'ring1' || slot === 'ring2') slot = 'ring';
      out[b.id] = { ...b, slot, kind: b.kind ?? slot, hands: Number(b.hands) || (b.twoHanded ? 2 : 1), w: Math.max(1, Math.min(4, num(b.w, 1))), h: Math.max(1, Math.min(4, num(b.h, 1))), level: num(b.level, 1), implicit: normMods(b.implicit, W, `base:${b.id}`), icon: b.icon ?? b.id };
    }
    return out;
  }, {});
  D.consumables = safe('consumables', () => {
    const out = {};
    for (const c of asArr(raw.consumables)) {
      if (!c?.id) continue;
      out[c.id] = { ...c, w: Math.max(1, num(c.w, 1)), h: Math.max(1, num(c.h, 1)), stack: Math.max(1, num(c.stack, 20)), price: num(c.price, 5), use: consumableUse(c), icon: c.icon ?? c.id };
    }
    return out;
  }, {});
  D.affixes = safe('affixes', () => asArr(raw.affixes).filter((a) => a?.id).map((a) => ({ ...a, kind: a.kind === 'suffix' ? 'suffix' : 'prefix', slots: asArr(a.slots), level: num(a.level, 1), weight: Math.max(0, num(a.weight, 100)), mods: normMods(a.mods, W, `affix:${a.id}`) })).filter((a) => a.mods.length), []);
  D.uniques = safe('uniques', () => asArr(raw.uniques).filter((u) => { if (!u?.id) return false; if (!D.bases[u.base]) { W('data.badUniqueBase', { id: u.id, base: u.base }); return false; } return true; }).map((u) => ({ ...u, level: num(u.level, 1), mods: normMods(u.mods, W, `unique:${u.id}`) })), []);

  /* 魔物 */
  D.monsters = safe('monsters', () => {
    const out = {};
    for (const [id, m] of Object.entries(asMap(raw.monsters))) {
      const mid = m.id ?? id;
      const ai = ['melee', 'ranged', 'caster', 'summoner', 'swarm', 'boss'].includes(m.ai) ? m.ai : 'melee';
      out[mid] = {
        ...m, id: mid, name: m.name ?? mid, level: num(m.level, 1), life: Math.max(1, num(m.life, 20)),
        dmg: Array.isArray(m.dmg) ? [num(m.dmg[0], 1), num(m.dmg[1] ?? m.dmg[0], 2)] : [1, 2],
        dmgType: DAMAGE_TYPES.includes(m.dmgType) ? m.dmgType : 'phys', speed: num(m.speed, 3), range: num(m.range, ai === 'ranged' || ai === 'caster' || ai === 'summoner' ? 6 : 1.3),
        ai, skills: asArr(m.skills), xp: num(m.xp, num(m.level, 1) * 10), art: m.art ?? mid, minion: !!m.minion, boss: !!m.boss || ai === 'boss',
      };
    }
    return out;
  }, {});
  for (const m of Object.values(D.monsters)) m.skills = m.skills.filter((s) => { if (D.skills[s]) return true; W('data.unknownSkill', { where: `monster:${m.id}`, id: s }); return false; });
  for (const s of Object.values(D.skills)) walkEffects(s.effects, (e) => { if (e.op === 'summon' && !D.monsters[e.unit]) W('data.unknownUnit', { skill: s.id, unit: e.unit }); });

  /* NPC・依頼 */
  D.npcs = safe('npcs', () => {
    const out = {};
    for (const [id, n] of Object.entries(asMap(raw.npcs))) out[n.id ?? id] = { ...n, id: n.id ?? id, name: n.name ?? id, art: n.art ?? n.id ?? id, role: n.role ?? 'story', lines: asArr(n.lines).map(String) };
    return out;
  }, {});
  D.quests = safe('quests', () => {
    const out = {};
    for (const [id, q] of Object.entries(asMap(raw.quests))) {
      const qid = q.id ?? id;
      out[qid] = { ...q, id: qid, name: q.name ?? qid, desc: q.desc ?? '', needs: normNeeds(q.needs, W, qid), reward: q.reward ?? {}, requires: q.requires ?? q.after ?? q.prev ?? null, minLevel: num(q.minLevel ?? q.level, 1) };
    }
    return out;
  }, {});

  /* 地図 */
  D.maps = {};
  D.mapDefs = {};
  for (const [id, def] of Object.entries(asMap(raw.maps))) {
    const mid = def.id ?? id;
    try {
      const m = buildMap({ ...def, id: mid });
      for (const w of m.warnings) W('data.mapWarning', { map: mid, warning: w });
      m.spawns = m.spawns.map((s) => ({ ...s, monsters: s.monsters.filter((x) => { if (D.monsters[x]) return true; W('data.unknownMonster', { map: mid, id: x }); return false; }) })).filter((s) => s.monsters.length);
      m.npcs = m.npcs.filter((n) => { if (D.npcs[n.id]) return true; W('data.unknownNpc', { map: mid, id: n.id }); return false; });
      D.maps[mid] = m;
      D.mapDefs[mid] = def;
    } catch (e) { W('data.mapBroken', { map: mid, error: String(e?.message ?? e).slice(0, 300) }); }
  }
  for (const m of Object.values(D.maps)) m.portals = m.portals.filter((p) => { if (p.to?.map && D.maps[p.to.map]) return true; W('data.badPortal', { map: m.id, portal: p.id, to: p.to?.map }); return false; });
  if (!D.maps.town) {
    W('data.defaultMap', { id: 'town' });
    D.maps.town = buildMap({ id: 'town', name: '灰鐘の町', w: 24, h: 24, rows: Array(24).fill('.'.repeat(24)), legend: { '.': { ground: 'cobble' } }, safe: true });
  }

  /* 会話 */
  D.phrases = asArr(raw.phrases).map((p) => (typeof p === 'string' ? p : p?.text ?? String(p)));
  D.stamps = asArr(raw.stamps).filter((s) => s?.id != null);
  D.nameParts = raw.nameParts ?? null;
  D.makeName = typeof raw.makeName === 'function' ? raw.makeName : null;

  /* 補助（無ければサーバーの既定を使う） */
  D.lootTiers = raw.lootTiers && typeof raw.lootTiers === 'object' ? raw.lootTiers : null;
  D.questDrops = raw.questDrops && typeof raw.questDrops === 'object' ? raw.questDrops : null;
  D.tierScale = raw.tierScale && typeof raw.tierScale === 'object' ? raw.tierScale : null;
  D.scaleMonster = typeof raw.scaleMonster === 'function' ? raw.scaleMonster : null;
  D.eliteMods = Array.isArray(raw.eliteMods) ? raw.eliteMods.filter((e) => e?.id).map((e) => ({
    ...e, mods: normMods(e.mods, W, `elite:${e.id}`), skills: asArr(e.skills).filter((s) => { if (D.skills[s]) return true; W('data.unknownSkill', { where: `elite:${e.id}`, id: s }); return false; }),
  })) : null;

  /* 索引 */
  D.items = { ...Object.fromEntries(Object.entries(D.bases).map(([k, v]) => [k, { ...v, isBase: true }])), ...Object.fromEntries(Object.entries(D.consumables).map(([k, v]) => [k, { ...v, consumable: true }])) };
  D.npcLocation = {};
  for (const m of Object.values(D.maps)) for (const n of m.npcs) D.npcLocation[n.id] = { map: m.id, x: n.x, y: n.y };
  return D;
}

// 薬などの使い道。use を推奨。無ければ id や kind から推し量る。
function consumableUse(c) {
  const u = c.use ?? c.effect ?? {};
  const out = {};
  for (const k of ['heal', 'healPct', 'mana', 'manaPct', 'over', 'portal', 'respec']) if (u[k] != null) out[k] = u[k];
  if (Object.keys(out).length) return out;
  const hint = `${c.id} ${c.kind ?? ''}`.toLowerCase();
  if (/quest/.test(hint)) return {};
  if (/mana/.test(hint)) return { manaPct: 40 };
  if (/life|heal|hp|potion/.test(hint)) return { healPct: 40 };
  if (/scroll|return|portal|town/.test(hint)) return { portal: true };
  if (/oblivion|respec|forget/.test(hint)) return { respec: true };
  return {};
}

// 依頼の条件を [{ kind:'kill'|'collect'|'level'|'visit'|'talk', id, count }] にそろえる
export function normNeeds(needs, warn = () => {}, qid = '') {
  const out = [];
  const add = (kind, id, count) => out.push({ kind, id: id ?? null, count: Math.max(1, num(count, 1)) });
  const list = Array.isArray(needs) ? needs : needs && typeof needs === 'object' ? (needs.type ? [needs] : Object.entries(needs).map(([k, v]) => ({ __k: k, __v: v }))) : [];
  for (const n of list) {
    if (n.__k !== undefined) {
      const k = n.__k, v = n.__v;
      if (k === 'kill' || k === 'collect' || k === 'items') {
        const kind = k === 'kill' ? 'kill' : 'collect';
        if (Array.isArray(v)) for (const x of v) add(kind, x.id ?? x.monster ?? x.item, x.count);
        else if (v && typeof v === 'object') for (const [id, c] of Object.entries(v)) add(kind, id, c);
        else if (typeof v === 'string') add(kind, v, 1);
      } else if (k === 'level') add('level', null, v);
      else if (k === 'boss') add('kill', v, 1);
      else if (k === 'visit') add('visit', v, 1);
      else if (k === 'talk') add('talk', v, 1);
      else if (k === 'from' || k === 'map') { /* 補足の情報 */ }
      else warn('data.unknownNeed', { quest: qid, need: k });
    } else if (n && typeof n === 'object') {
      const kind = n.type ?? n.kind;
      if (['kill', 'collect', 'level', 'visit', 'talk'].includes(kind)) add(kind, n.id ?? n.monster ?? n.item ?? n.map ?? n.npc, n.count ?? n.level);
      else warn('data.unknownNeed', { quest: qid, need: kind });
    }
  }
  return out;
}
