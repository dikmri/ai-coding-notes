// 宝の抽選（純粋な関数。乱数は外から渡す）: 珍しさ、基本の品、付加効果、固有、落とす物、値段
import { RARITIES } from '../shared/schema.mjs';

const TIER_MULT = { normal: 1, elite: 2, boss: 4 };
export function rollRarity(rng, { itemFind = 0, tier = 'normal' } = {}) {
  const f = (1 + Math.max(-90, itemFind) / 100) * (TIER_MULT[tier] ?? 1);
  const table = [['normal', 70], ['magic', 25 * f], ['rare', 4.5 * f], ['unique', 0.5 * f]];
  const sum = table.reduce((a, [, w]) => a + w, 0);
  let r = rng() * sum;
  for (const [k, w] of table) { if ((r -= w) < 0) return k; }
  return 'normal';
}

export function pickBase(D, rng, ilvl) {
  const all = Object.values(D.bases ?? {});
  if (!all.length) return null;
  const ok = all.filter((b) => b.level <= ilvl);
  const pool = ok.length ? ok : [all.reduce((a, b) => (b.level < a.level ? b : a))];
  return pool[Math.floor(rng() * pool.length)].id;
}

const affixFits = (a, b) => a.slots.includes('any') || a.slots.includes(b.slot) || a.slots.includes(b.kind)
  || (b.slot === 'ring' && (a.slots.includes('ring1') || a.slots.includes('ring2')));
const rollValue = (v, rng) => {
  if (!Array.isArray(v)) return v;
  const [lo, hi] = v;
  if (Number.isInteger(lo) && Number.isInteger(hi)) return lo + Math.floor(rng() * (hi - lo + 1));
  return Math.round((lo + rng() * (hi - lo)) * 10) / 10;
};
const fixedValue = (v) => (Array.isArray(v) ? Math.round((v[0] + v[1]) / 2) : v);

const RARE_A = ['灰', '夜', '鉄', '霧', '骨', '鐘', '影', '血', '嵐', '星', '錆', '月'];
const RARE_B = ['の牙', 'の囁き', 'の祈り', 'の誓い', 'の爪', 'の残響', 'の帳', 'の棘', 'の鎖', 'の灯'];

function baseItem(b, uid, rarity, ilvl) {
  const it = {
    uid, base: b.id, name: b.name, baseName: b.name, rarity, ilvl, slot: b.slot, kind: b.kind, w: b.w, h: b.h, level: b.level, icon: b.icon,
    mods: (b.implicit ?? []).map((m) => ({ key: m.key, mode: m.mode, value: fixedValue(m.value), src: 'implicit' })), affixes: [],
  };
  if (b.dmg) it.dmg = [...b.dmg];
  if (b.hands === 2) it.hands = 2;
  if (b.speed) it.speed = b.speed;
  if (b.armor) it.armor = b.armor;
  return it;
}

export function makeItem(D, rng, baseId, rarity, ilvl, uid) {
  const b = D.bases[baseId];
  if (!b) return null;
  const it = baseItem(b, uid, rarity, ilvl);
  if (rarity !== 'magic' && rarity !== 'rare') return it;
  const [lo, hi] = RARITIES[rarity].affixes;
  const want = lo + Math.floor(rng() * (hi - lo + 1));
  const cap = rarity === 'magic' ? 1 : 3;
  const used = { prefix: 0, suffix: 0 };
  const pool = (D.affixes ?? []).filter((a) => affixFits(a, b) && a.level <= ilvl);
  const chosen = [];
  for (let k = 0; k < want; k++) {
    const cand = pool.filter((a) => !chosen.includes(a) && used[a.kind] < cap && !chosen.some((c) => c.group && c.group === a.group));
    const sum = cand.reduce((s, a) => s + a.weight, 0);
    if (!cand.length || sum <= 0) break;
    let r = rng() * sum, pick = cand[cand.length - 1];
    for (const a of cand) { if ((r -= a.weight) < 0) { pick = a; break; } }
    chosen.push(pick); used[pick.kind]++;
  }
  for (const a of chosen) {
    it.affixes.push(a.id);
    for (const m of a.mods) it.mods.push({ key: m.key, mode: m.mode, value: rollValue(m.value, rng), src: a.id });
  }
  const pre = chosen.find((a) => a.kind === 'prefix'), suf = chosen.find((a) => a.kind === 'suffix');
  if (rarity === 'magic') it.name = `${pre?.name ?? ''}${b.name}${suf ? `（${suf.name}）` : ''}`;
  else it.name = `${RARE_A[Math.floor(rng() * RARE_A.length)]}${RARE_B[Math.floor(rng() * RARE_B.length)]}・${b.name}`;
  return it;
}

export function makeUnique(D, u, uid) {
  const b = D.bases[u.base];
  if (!b) return null;
  const it = baseItem(b, uid, 'unique', u.level);
  it.name = u.name; it.unique = u.id; it.flavor = u.flavor ?? '';
  for (const m of u.mods) it.mods.push({ key: m.key, mode: m.mode, value: fixedValue(m.value), src: u.id });
  if (u.rule) it.rule = u.rule;
  return it;
}

export function makeConsumable(D, id, qty, uid) {
  const c = D.consumables[id];
  if (!c) return null;
  return { uid, base: id, name: c.name, rarity: 'normal', consumable: true, w: c.w, h: c.h, qty: Math.max(1, Math.min(c.stack, qty)), icon: c.icon, kind: c.kind ?? 'consumable', level: c.level ?? 1 };
}

const POTION_TABLE = [['potion_life', 50], ['potion_mana', 30], ['scroll_return', 15], ['oblivion_water', 1]];
const randIn = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

// 薬の 1 つ（魔物の Lv までの、回復・魔力・帰還の品から）
function rollPotion(D, rng, level, uid) {
  const cand = Object.values(D.consumables ?? {}).filter((c) => (c.level ?? 1) <= Math.max(1, level) && (c.use?.healPct || c.use?.heal || c.use?.manaPct || c.use?.mana || c.use?.portal));
  if (!cand.length) return null;
  const w = (c) => (c.use.healPct || c.use.heal ? 5 : c.use.manaPct || c.use.mana ? 3 : 2);
  const sum = cand.reduce((a, c) => a + w(c), 0);
  let r = rng() * sum, pick = cand[0];
  for (const c of cand) { if ((r -= w(c)) < 0) { pick = c; break; } }
  return makeConsumable(D, pick.id, 1, uid());
}

// データの落ち方の表（lootTiers）に従う
function rollDropsByTable(D, rng, T, { level = 1, itemFind = 0, goldFind = 0, extra = [] }, uid) {
  const out = [];
  const f = 1 + Math.max(-90, itemFind) / 100;
  const n = rng() < (T.dropChance ?? 0) ? randIn(rng, T.count ?? [1, 1]) : 0;
  for (let k = 0; k < n; k++) {
    const r = rng();
    const ru = (T.rarity?.unique ?? 0) * f, rr = (T.rarity?.rare ?? 0) * f, rm = (T.rarity?.magic ?? 0) * f;
    let rarity = r < ru ? 'unique' : r < ru + rr ? 'rare' : r < ru + rr + rm ? 'magic' : 'normal';
    if (rarity === 'unique') {
      const us = (D.uniques ?? []).filter((u) => u.level <= level + 2);
      if (us.length) { const it = makeUnique(D, us[Math.floor(rng() * us.length)], uid()); if (it) { out.push({ kind: 'item', item: it }); continue; } }
      rarity = 'rare';
    }
    const baseId = pickBase(D, rng, level);
    const it = baseId && makeItem(D, rng, baseId, rarity, level, uid());
    if (it) out.push({ kind: 'item', item: it });
  }
  if (rng() < (T.potion ?? 0)) { const it = rollPotion(D, rng, level, uid); if (it) out.push({ kind: 'item', item: it }); }
  for (const id of T.always ?? []) { const it = makeConsumable(D, id, 1, uid()); if (it) out.push({ kind: 'item', item: it }); }
  for (const e of extra) if (rng() < (e.chance ?? 0.2)) { const it = makeConsumable(D, e.item, 1, uid()); if (it) out.push({ kind: 'item', item: it }); }
  if (T.gold && rng() < (T.gold.chance ?? 0)) {
    const [lo, hi] = T.gold.perLevel ?? [1, 3];
    out.push({ kind: 'gold', amount: Math.max(1, Math.round(level * (lo + rng() * (hi - lo)) * (1 + goldFind / 100))) });
  }
  return out;
}

// opts: { level, tier:'normal'|'elite'|'boss', itemFind, goldFind, extra:[{ item, chance }], uid() }
export function rollDrops(D, rng, opts) {
  let seq0 = 0;
  const uid0 = opts.uid ?? (() => `${Math.floor(rng() * 2 ** 32).toString(36)}${(seq0++).toString(36)}`);
  const T = D.lootTiers?.[opts.tier ?? 'normal'];
  if (T) return rollDropsByTable(D, rng, T, opts, uid0);
  const { level = 1, tier = 'normal', itemFind = 0, goldFind = 0, extra = [] } = opts;
  let n = 0;
  if (tier === 'boss') n = 4 + Math.floor(rng() * 4);
  else if (tier === 'elite') n = 1 + Math.floor(rng() * 3);
  else n = (rng() < 0.3 ? 1 : 0) + (rng() < 0.05 ? 1 : 0);
  let seq = 0;
  const uid = opts.uid ?? (() => `${Math.floor(rng() * 2 ** 32).toString(36)}${(seq++).toString(36)}`);
  const out = [];
  for (let k = 0; k < n; k++) {
    const potions = POTION_TABLE.filter(([id]) => D.consumables?.[id]);
    if ((rng() < 0.22 || !Object.keys(D.bases ?? {}).length) && potions.length) {
      const sum = potions.reduce((a, [, w]) => a + w, 0);
      let r = rng() * sum, id = potions[0][0];
      for (const [pid, w] of potions) { if ((r -= w) < 0) { id = pid; break; } }
      const it = makeConsumable(D, id, 1, uid());
      if (it) out.push({ kind: 'item', item: it });
      continue;
    }
    let rarity = rollRarity(rng, { itemFind, tier });
    if (rarity === 'unique') {
      const us = (D.uniques ?? []).filter((u) => u.level <= level + 2);
      if (us.length) { const it = makeUnique(D, us[Math.floor(rng() * us.length)], uid()); if (it) { out.push({ kind: 'item', item: it }); continue; } }
      rarity = 'rare';
    }
    const baseId = pickBase(D, rng, level);
    const it = baseId && makeItem(D, rng, baseId, rarity, level, uid());
    if (it) out.push({ kind: 'item', item: it });
  }
  for (const e of extra) {
    if (rng() < (e.chance ?? 0.2)) {
      const it = makeConsumable(D, e.item, 1, uid());
      if (it) out.push({ kind: 'item', item: it });
    }
  }
  const goldChance = tier === 'boss' ? 1 : tier === 'elite' ? 0.9 : 0.45;
  if (rng() < goldChance) {
    const tm = tier === 'boss' ? 10 : tier === 'elite' ? 3 : 1;
    out.push({ kind: 'gold', amount: Math.max(1, Math.round(level * (2 + rng() * 4) * tm * (1 + goldFind / 100))) });
  }
  return out;
}

const RARITY_VALUE = { normal: 1, magic: 2.5, rare: 5, unique: 10 };
export function itemValue(item, D) {
  if (item.consumable) return (D.consumables?.[item.base]?.price ?? 5) * (item.qty ?? 1);
  const b = D.bases?.[item.base];
  const base = b?.price ?? 5 + (b?.level ?? item.level ?? 1) * 4;
  return Math.round(base * (RARITY_VALUE[item.rarity] ?? 1) * (1 + 0.15 * (item.affixes?.length ?? 0)));
}
export const sellPrice = (item, D) => Math.max(1, Math.floor(itemValue(item, D) * 0.25));
export const buyPrice = (item, D) => Math.max(1, Math.round(itemValue(item, D)));
