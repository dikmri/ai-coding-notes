// 『鐘なき王国』の共有の計算（画面とサーバーの両方が使う純粋な関数だけ）
// 設計書 §5: 修正の合計、命中、軽減、耐性、会心、経験値、ダメージの見込み
import { PRIMARY, STAT_KEYS, RES_CAP, PLAYER_SPEED, MAX_LEVEL, DAMAGE_TYPES } from './schema.mjs';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

/* ---------------- 修正の集計 ---------------- */
// mods: [{ key, mode:'flat'|'inc'|'more', value }] → { [key]: { flat, inc, more（かけ合わせた倍率） } }
export function aggregate(mods) {
  const agg = {};
  for (const m of mods ?? []) {
    if (!m || typeof m.key !== 'string') continue;
    const v = Number(m.value);
    if (!Number.isFinite(v)) continue;
    const a = (agg[m.key] ??= { flat: 0, inc: 0, more: 1 });
    if (m.mode === 'inc') a.inc += v;
    else if (m.mode === 'more') a.more *= 1 + v / 100;
    else a.flat += v;
  }
  return agg;
}
const A0 = Object.freeze({ flat: 0, inc: 0, more: 1 });
export const aggOf = (agg, key) => agg?.[key] ?? A0;
export function applyMods(base, agg, key) {
  const a = aggOf(agg, key);
  return (base + a.flat) * (1 + a.inc / 100) * a.more;
}
export const sumMods = (base, mods, key) => applyMods(base, aggregate(mods), key);

/* ---------------- 能力値 ---------------- */
// 「％で表す」能力値。値は合計の増減（％）。例: areaSize 32 → 範囲 +32%
const PCT_KEYS = ['attackSpeed', 'castSpeed', 'cooldownRecovery', 'areaSize', 'projectileSpeed', 'durationSkill', 'manaCost',
  'healPower', 'shieldPower', 'minionLife', 'auraEffect', 'goldFind', 'itemFind', 'xpGain',
  'dmg', 'dmgMelee', 'dmgProjectile', 'dmgArea', 'dmgDot', 'dmgMinion', 'dmgSpell', 'dmgAttack',
  'dmgPhys', 'dmgFire', 'dmgCold', 'dmgLightning', 'dmgPoison', 'dmgHoly', 'dmgShadow'];
const pctOf = (agg, key, extraInc = 0) => { const a = aggOf(agg, key); return ((1 + (a.inc + extraInc) / 100) * a.more - 1) * 100; };

export const KNOWN_RULES = Object.freeze({
  lifeToMana: '最大体力が 1 になり、その分の体力が魔力に加わる。受けるダメージは魔力から引かれる',
  noCrit: '会心が出ない',
  ironReflexes: '回避が全部防御になる',
  bloodMagic: '魔力が 0 になり、スキルは体力を使う',
  unwavering: '気絶しない',
  perfectParry: '攻撃を防ぐか跳ね返すと、次の攻撃が必ず会心になる',
  shadowFirst: '姿を消している間の最初の攻撃は、必ず会心になり、ダメージが 50% 多い',
  twoStances: '構えを 2 つまで同時に保てる。どちらの構えも効き目が半分',
  healEcho: '仲間を回復すると、その量の 30% が自分にも戻る',
  oneGreatMinion: '召喚できる味方が 1 体だけ。その 1 体の体力とダメージが 3 倍',
  // 固有の品の決まり
  killHeal: '敵を倒すたびに、最大体力の 5% が戻る',
  stunEcho: '敵を気絶させると、その周り 2 マスの敵にも聖のダメージが広がる',
  darkCrit: '明かりの外にいる敵への攻撃は、会心率が 2 倍',
  rewindOnLethal: '倒れるほどのダメージを受けると、代わりに 3 秒前の位置と体力に戻る（60 秒に 1 回）',
  minionBurst: '召喚した味方が倒れると、その場で破裂して周りの敵に闇のダメージを与える',
  leechOnly: '体力が自然に戻らない。与えたダメージから戻る体力が 2 倍',
  overhealShield: '回復で最大体力を超えた分が、5 秒消えない盾になる（最大体力の 20% まで）',
  stealthOnKill: '敵を倒すと 1.5 秒、姿が消える',
  tollOnCrit: '会心の一撃で、周り 3 マスの敵を 0.5 秒気絶させる',
  reflectBlocked: '防いだ飛び道具は、投げた者へ跳ね返る',
  lightPower: '明かりの範囲 1 マスごとに、呪文のダメージが 5% 増える',
});

// { level, classDef, mods, rules?, weapon?, bases? } → 能力値の表（agg に集計を残す）
// bases は魔物などの基本の値の上書き（{ life, mana, armor, evasion, accuracy, moveSpeed, aps, resFire, ... }）
export function computeStats({ level = 1, classDef = {}, mods = [], rules = [], weapon = null, bases = null } = {}) {
  const agg = aggregate(mods);
  const L = Math.max(1, level | 0);
  const base = classDef.base ?? {}, per = classDef.perLevel ?? {};
  const B = bases ?? {};
  const s = { level: L, agg, rules: [...new Set(rules ?? [])] };
  for (const p of PRIMARY) s[p] = Math.round(applyMods((base[p] ?? 0) + (per[p] ?? 0) * (L - 1), agg, p));
  s.life = Math.round(applyMods(B.life ?? (classDef.life ?? 50) + (per.life ?? 0) * (L - 1) + s.vit * 2 + s.str * 0.5, agg, 'life'));
  s.mana = Math.round(applyMods(B.mana ?? (classDef.mana ?? 20) + (per.mana ?? 0) * (L - 1) + s.int * 1.5, agg, 'mana'));
  s.lifeRegen = round2(applyMods(B.lifeRegen ?? 0.2 + s.vit * 0.05, agg, 'lifeRegen'));
  s.manaRegen = round2(applyMods(B.manaRegen ?? 1 + s.mana * 0.02 + s.int * 0.02, agg, 'manaRegen'));
  s.lifeLeech = round2(applyMods(0, agg, 'lifeLeech'));
  s.manaLeech = round2(applyMods(0, agg, 'manaLeech'));
  s.armor = Math.round(applyMods(B.armor ?? 0, agg, 'armor'));
  s.evasion = Math.round(applyMods(B.evasion ?? L * 2 + s.dex, agg, 'evasion'));
  s.accuracy = Math.round(applyMods(B.accuracy ?? L * 2 + s.dex * 2 + 10, agg, 'accuracy'));
  s.blockChance = clamp(0, 75, round2(applyMods(0, agg, 'blockChance')));
  s.moveSpeed = round2(clamp(B.moveSpeed != null ? 0.3 : 1, 12, applyMods(B.moveSpeed ?? PLAYER_SPEED, agg, 'moveSpeed')));
  s.critChance = clamp(0, 95, round2(applyMods(5, agg, 'critChance')));
  s.critMulti = round2(applyMods(150, agg, 'critMulti'));
  for (const t of DAMAGE_TYPES) if (t !== 'phys') { const k = `res${cap(t)}`; s[k] = clamp(-100, RES_CAP, Math.round(applyMods(B[k] ?? 0, agg, k))); }
  for (const k of PCT_KEYS) s[k] = round2(pctOf(agg, k, k === 'attackSpeed' ? s.dex * 0.1 : 0));
  s.projectileCount = Math.round(applyMods(0, agg, 'projectileCount'));
  s.minionCount = Math.round(applyMods(0, agg, 'minionCount'));
  for (const k of ['stunChance', 'bleedChance', 'poisonChance', 'burnChance', 'freezeChance', 'shockChance']) s[k] = clamp(0, 100, round2(applyMods(0, agg, k)));
  s.lightRadius = round2(applyMods(6, agg, 'lightRadius'));
  // 武器: 1 秒あたりの攻撃の回数
  const wspeed = B.aps ?? weapon?.speed ?? 1.4;
  s.aps = round2(clamp(0.2, 8, wspeed * (1 + s.attackSpeed / 100)));
  // 要の決まり
  const R = new Set(s.rules);
  if (R.has('noCrit')) s.critChance = 0;
  if (R.has('ironReflexes')) { s.armor += s.evasion; s.evasion = 0; }
  if (R.has('lifeToMana')) { s.mana += s.life - 1; s.life = 1; s.lifeRegen = 0; }
  if (R.has('bloodMagic')) { s.mana = 0; s.manaRegen = 0; }
  if (R.has('leechOnly')) { s.lifeRegen = 0; s.lifeLeech = round2(s.lifeLeech * 2); }
  if (R.has('lightPower')) {
    const a = (agg.dmgSpell ??= { flat: 0, inc: 0, more: 1 });
    a.inc += s.lightRadius * 5;
    s.dmgSpell = round2(pctOf(agg, 'dmgSpell'));
  }
  s.stunImmune = R.has('unwavering');
  return s;
}
const round2 = (v) => Math.round(v * 100) / 100;
export const mult = (stats, key) => 1 + (stats?.[key] ?? 0) / 100;

/* ---------------- 命中・軽減・耐性 ---------------- */
export function hitChance(accuracy, evasion) {
  const d = accuracy + evasion * 0.5;
  if (!(d > 0)) return 0.95;
  return clamp(0.05, 0.95, accuracy / d);
}
export function armorReduce(dmg, armor) {
  if (!(dmg > 0)) return 0;
  if (!(armor > 0)) return dmg;
  return dmg * (1 - armor / (armor + 5 * dmg));
}
export function resistReduce(dmg, res) {
  return dmg * (1 - Math.min(res ?? 0, RES_CAP) / 100);
}
export function mitigate(amount, type, def) {
  if (type === 'phys' || !type) return armorReduce(amount, def?.armor ?? 0);
  return resistReduce(amount, def?.[`res${cap(type)}`] ?? 0);
}

/* ---------------- 経験値 ---------------- */
export const xpToNext = (L) => Math.round(100 * Math.max(1, L) ** 1.8);
export function addXp(level, xp, gain, maxLevel = MAX_LEVEL) {
  let L = level, x = xp + Math.max(0, gain), gained = 0;
  if (L >= maxLevel) return { level: maxLevel, xp: 0, gained: 0 };
  while (L < maxLevel && x >= xpToNext(L)) { x -= xpToNext(L); L++; gained++; }
  if (L >= maxLevel) x = 0;
  return { level: L, xp: Math.round(x), gained };
}
export const deathPenalty = (level, xp) => Math.max(0, xp - Math.round(0.05 * xpToNext(level)));
export function monsterXp(baseXp, monsterLevel, playerLevel) {
  const over = playerLevel - monsterLevel - 5;
  const f = over > 0 ? Math.max(0.1, 1 - 0.15 * over) : 1;
  return Math.round(baseXp * f);
}
// 合計の経験値を、人数で少し増やし、レベルの重みで分ける
export function partyXpShare(total, members) {
  const out = {};
  if (!members?.length) return out;
  const pool = total * (1 + 0.1 * (members.length - 1));
  const wsum = members.reduce((a, m) => a + Math.max(1, m.level), 0);
  for (const m of members) out[m.id] = Math.round((pool * Math.max(1, m.level)) / wsum);
  return out;
}

/* ---------------- ダメージ ---------------- */
const TAG_KEY = { melee: 'dmgMelee', projectile: 'dmgProjectile', area: 'dmgArea', dot: 'dmgDot', minion: 'dmgMinion', spell: 'dmgSpell', attack: 'dmgAttack' };
export function damageKeys(type, tags = []) {
  const keys = ['dmg', `dmg${cap(type || 'phys')}`];
  for (const t of tags) if (TAG_KEY[t]) keys.push(TAG_KEY[t]);
  return [...new Set(keys)];
}
// spec = { type, base:[min,max], weapon: 倍率, perRank: %, scale: 'str'|'dex'|'int'|'vit' }
// → { type, min, max }（会心の前、相手の軽減の前）
export function damageRange(spec, { rank = 1, stats = null, weapon = null, tags = [] } = {}) {
  const type = DAMAGE_TYPES.includes(spec?.type) ? spec.type : 'phys';
  const b = Array.isArray(spec?.base) ? spec.base : [0, 0];
  const rf = 1 + ((Number(spec?.perRank) || 0) * Math.max(0, rank - 1)) / 100;
  let lo = (Number(b[0]) || 0) * rf, hi = (Number(b[1] ?? b[0]) || 0) * rf;
  if (spec?.weapon) {
    const wd = weapon?.dmg ?? [1, 3];
    lo += wd[0] * spec.weapon; hi += wd[1] * spec.weapon;
  }
  const agg = stats?.agg;
  let flat = 0, inc = 0, more = 1;
  for (const k of damageKeys(type, tags)) { const a = aggOf(agg, k); flat += a.flat; inc += a.inc; more *= a.more; }
  const scale = spec?.scale ?? (tags.includes('spell') ? 'int' : tags.includes('attack') || tags.includes('melee') ? 'str' : null);
  if (scale && stats) inc += (stats[scale] ?? 0) * 0.5;
  lo += flat; hi += flat;
  const m = Math.max(0, (1 + inc / 100) * more);
  return { type, min: Math.max(0, Math.round(lo * m)), max: Math.max(0, Math.round(Math.max(lo, hi) * m)) };
}
export const expectedDamage = (r, critChance = 5, critMulti = 150) => ((r.min + r.max) / 2) * (1 + (critChance / 100) * (critMulti / 100 - 1));
export const rollDamage = (r, rng) => r.min + Math.floor(rng() * (r.max - r.min + 1));
// 時間で削るダメージの 1 秒あたり
export function dotDps(spec, { rank = 1, stats = null, tags = [] } = {}) {
  const type = DAMAGE_TYPES.includes(spec?.type) ? spec.type : 'phys';
  const base = (Number(spec?.dps) || 0) * (1 + ((Number(spec?.perRank) || 0) * Math.max(0, rank - 1)) / 100);
  let inc = 0, more = 1;
  for (const k of damageKeys(type, [...tags, 'dot'])) { const a = aggOf(stats?.agg, k); inc += a.inc; more *= a.more; }
  return Math.max(0, base * (1 + inc / 100) * more);
}

/* ---------------- スキル ---------------- */
export function skillCost(skill, rank, stats) {
  const c = skill?.cost ?? {};
  const raw = (Number(c.mana) || 0) + (Number(c.perRank) || 0) * Math.max(0, rank - 1);
  return Math.max(0, Math.round(raw * mult(stats, 'manaCost')));
}
export function skillCooldown(skill, rank, stats) {
  const raw = Math.max(0, (Number(skill?.cd) || 0) - (Number(skill?.cdPerRank) || 0) * Math.max(0, rank - 1));
  return raw / Math.max(0.1, mult(stats, 'cooldownRecovery'));
}
export function castTime(skill, stats) {
  const raw = Number(skill?.cast) || 0;
  const key = skill?.tags?.includes('attack') ? 'attackSpeed' : 'castSpeed';
  return raw / Math.max(0.1, mult(stats, key));
}
export const ccDuration = (base, { boss = false } = {}) => base * (boss ? 0.5 : 1);
export const areaMult = (stats) => Math.sqrt(Math.max(0.1, mult(stats, 'areaSize')));
export const durationMult = (stats) => Math.max(0.1, mult(stats, 'durationSkill'));

/* ---------------- 確かめ用 ---------------- */
export const isStatKey = (k) => STAT_KEYS.includes(k);
