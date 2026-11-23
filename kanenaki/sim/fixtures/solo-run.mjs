// 1 人のキャラを戦わせて、釣り合いを測る（Node.js のテストと、数の見直し用）。
// - runSolo: 鐘守りの亡者と 1 対 1。キャラは「Lv を上げ、装備を抽選し（確かめ用の gear）、スキルとツリーを素直に上げた」状態。
// - runPack: 地図の入口の近くで、魔物の群れ（精鋭を含められる）と戦う。Lv1 の冒険者なら初めの持ち物のまま。
// 戦いの手は solo.mjs の decide（人の真似）。倒れない設定や能力値をいじる命令は使わない。
import { World } from '../world.mjs';
import { MemoryLogger, join } from './testkit.mjs';
import { makeRng, nearestWalkable } from '../../shared/mapgen.mjs';
import { planSkillUps, pickTreeNodes, decide, RANGED } from './solo.mjs';
import { manaCap } from '../actor.mjs';

// キャラを作る。cls が adventurer なら転職しない。gear: 装備を抽選する。bigPotions: 大きな回復薬の数（null なら初めの回復薬のまま）
// manaPotions: 大きな魔力の薬の数
function buildHero(D, { cls, level, seed, gear = true, bigPotions = null, manaPotions = 0 }) {
  const log = new MemoryLogger();
  const W = new World({ data: D, log, rng: makeRng(seed), debug: true, now: 5_000_000 });
  const { c, s, p } = join(W);
  const ch = s.char;
  if (level > 1) c.msg({ t: 'debug', op: 'level', n: level });
  if (cls !== 'adventurer') c.msg({ t: 'debug', op: 'cls', cls });
  if (gear) c.msg({ t: 'debug', op: 'gear' });
  for (const sid of planSkillUps(cls, D.skills, ch.ranks, ch.level, ch.points.skill)) c.msg({ t: 'skillUp', s: sid });
  for (const id of pickTreeNodes(D.tree, ch.alloc, cls, ch.points.passive)) c.msg({ t: 'alloc', node: id });
  if (bigPotions != null) {
    ch.inv = ch.inv.filter((i) => !(i.consumable && /potion_life/.test(i.base)));
    if (bigPotions > 0) c.msg({ t: 'debug', op: 'item', id: 'potion_life_big', qty: bigPotions });
  }
  if (manaPotions > 0) c.msg({ t: 'debug', op: 'item', id: 'potion_mana_big', qty: manaPotions });
  return { W, log, c, s, p, ch };
}

// 敵を 1 体ずつ（近い順に）相手にして、決着まで回す。enemies() は生きている敵の列
function fight({ W, c, p, ch, log }, cls, enemies, { mode = 'play', maxS = 240, warnFrom = null, every = 4 } = {}) {
  const z = p.zone;
  const warns = [];
  const stat = { dmgByMe: 0, dmgByMinions: 0, dmgTaken: 0, acts: {}, errs: {} };
  let minHp = p.hp, used = 0, usedMana = 0, potionReadyAt = 0, lastMoveAt = -1e9;
  const t0 = W.now;
  const potionCount = (re = /potion_life/) => ch.inv.filter((i) => i.consumable && re.test(i.base)).reduce((a, i) => a + (i.qty ?? 1), 0);
  for (let tick = 0; tick < maxS * 20; tick++) {
    W.step(1);
    const foes = enemies();
    for (const m of c.sent) {
      if (m.t === 'fx' && m.k === 'vfx' && m.delay > 0 && (!warnFrom || warnFrom.has(m.src))) warns.push({ x: m.x, y: m.y, r: m.r, shape: m.shape, dir: m.dir, len: m.len, width: m.width, until: W.now + m.delay * 1000 });
      if (m.t === 'fx' && m.k === 'dmg' && m.id === p.id) { stat.dmgTaken += m.amt; }
      if (m.t === 'fx' && m.k === 'dmg' && m.id !== p.id && m.src === p.id) stat.dmgByMe += m.amt;
      if (m.t === 'err') stat.errs[m.code] = (stat.errs[m.code] ?? 0) + 1;
    }
    c.clear();
    minHp = Math.min(minHp, p.hp);
    if (p.dead || !foes.length) break;
    if (tick % every) continue; // 人の手は 0.2 秒ごと（every は 1 回の判断に使う刻みの数。1 刻み 0.05 秒）
    const t = foes.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    const cds = {};
    for (const [k, v] of Object.entries(p.cds)) if (v > W.now) cds[k] = v - W.now;
    const view = {
      now: W.now, me: { x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: manaCap(p), dead: p.dead, cds, ranks: ch.ranks, stance: Object.keys(p.stances).length > 0 },
      boss: { id: t.id, x: t.x, y: t.y }, warns: warns.filter((w) => w.until > W.now),
      minions: [...z.actors].filter((a) => a.owner === p.id && !a.dead).length, potions: potionCount(), manaPotions: potionCount(/potion_mana/), potionReadyAt, lastMoveAt,
    };
    const a = mode === 'stand' ? (p.action?.id === t.id ? null : { t: 'attack', id: t.id }) : decide(cls, view, W.data.skills);
    const key = a ? (a.t === 'cast' ? a.s : a.t === 'move' ? `move:${a.why}` : a.t) : 'wait';
    stat.acts[key] = (stat.acts[key] ?? 0) + 1;
    if (!a) continue;
    if (a.t === 'potion') { const it = ch.inv.find((i) => i.consumable && /potion_life/.test(i.base)); c.msg({ t: 'inv', op: 'use', item: it.uid }); used++; potionReadyAt = W.now + 600; }
    else if (a.t === 'mana') { const it = ch.inv.find((i) => i.consumable && /potion_mana/.test(i.base)); c.msg({ t: 'inv', op: 'use', item: it.uid }); usedMana++; potionReadyAt = W.now + 600; }
    else if (a.t === 'move') { c.msg({ t: 'move', x: a.x, y: a.y }); lastMoveAt = W.now; }
    else if (a.t === 'cast') c.msg({ t: 'cast', s: a.s, x: a.x, y: a.y, id: a.id });
    else if (a.t === 'attack' && p.action?.id !== a.id) c.msg({ t: 'attack', id: a.id });
  }
  return { died: p.dead, simS: Math.round((W.now - t0) / 100) / 10, minHpPct: Math.max(0, Math.round((minHp / p.maxHp) * 100)), potionsUsed: used, manaPotionsUsed: usedMana, stat, errors: log.errors };
}

// opts: { cls, level=24, seed=1, potions=10（大きな回復薬の数）, mode: 'play'（人の手）| 'stand'（何もしないで殴り合う）, maxS=240,
//   every=4（判断の間隔の刻み数）, keepOthers=false（true なら 3 階のほかの魔物を残す）,
//   manaPotions（大きな魔力の薬の数。既定は離れて戦う職（司祭・ネクロマンサー）だけ 10） }
export function runSolo(D, opts = {}) {
  const { cls = 'warrior', level = 24, seed = 1, potions = 10, mode = 'play', maxS = 240, every = 4, keepOthers = false, manaPotions = RANGED.has(cls) ? 10 : 0 } = opts;
  const h = buildHero(D, { cls, level, seed, bigPotions: potions, manaPotions: mode === 'stand' ? 0 : manaPotions });
  const { W, c, p } = h;
  // ボスの部屋の入口（ボスから 9 マス）に立つ。ほかの魔物は片付けておく
  c.msg({ t: 'debug', op: 'warp', map: 'tower3' });
  W.step(2);
  const z = p.zone;
  const spawn = z.map.spawns.find((sp) => sp.monsters.includes('bell_warden'));
  if (!keepOthers) {
    for (const a of [...z.actors]) if (a.kind === 'monster' && !a.def?.boss) z.remove(a);
    for (const sp of z.spawners) if (!sp.def.monsters.includes('bell_warden')) { sp.alive.clear(); sp.def = { ...sp.def, count: 0 }; }
  }
  const boss = [...z.actors].find((a) => a.def?.boss);
  const start = [[9, 0], [-9, 0], [0, 9], [0, -9], [6, 6], [-6, 6], [6, -6], [-6, -6]].map(([dx, dy]) => ({ x: spawn.x + dx, y: spawn.y + dy })).find((q) => z.free(q.x, q.y)) ?? { x: spawn.x, y: spawn.y + 3 };
  z.moveTo(p, start.x, start.y);
  p.hp = p.maxHp; p.mana = manaCap(p);
  W.step(1);
  c.clear();
  const r = fight(h, cls, () => (boss.dead ? [] : [boss]), { mode, maxS, every, warnFrom: new Set([boss.id]) });
  return {
    cls, level, seed, mode, win: boss.dead && !r.died, ...r, bossHpPct: Math.round((Math.max(0, boss.hp) / boss.maxHp) * 100), bossFromHome: Math.round(Math.hypot(boss.x - boss.ai.home.x, boss.y - boss.ai.home.y)),
    hero: { maxHp: p.maxHp, armor: p.stats.armor, weapon: h.ch.equip.weapon?.name, ranks: { ...h.ch.ranks } },
  };
}

// 群れと戦う。opts: { cls='adventurer', level=1, seed=1, map='road', at:{x,y}（立つ所。無ければ地図の入口）, pack:[{ id, n, level?, elite? }],
//   gear（Lv>1 なら装備を抽選）, potions（大きな回復薬の数。null なら初めの持ち物のまま）, mode, maxS }
export function runPack(D, opts = {}) {
  const { cls = 'adventurer', level = 1, seed = 1, map = 'road', at = null, pack = [], gear = level > 1, potions = null, mode = 'play', maxS = 180 } = opts;
  const h = buildHero(D, { cls, level, seed, gear, bigPotions: potions });
  const { W, c, p } = h;
  if (map !== 'town') { c.msg({ t: 'debug', op: 'warp', map, ...(at ? { x: at.x, y: at.y } : {}) }); W.step(2); }
  const z = p.zone;
  for (const a of [...z.actors]) if (a.kind === 'monster') z.remove(a);
  for (const sp of z.spawners) { sp.alive.clear(); sp.def = { ...sp.def, count: 0 }; }
  const foes = [];
  let k = 0;
  const total = pack.reduce((a, g) => a + g.n, 0);
  for (const g of pack) for (let i = 0; i < g.n; i++, k++) {
    const ang = (k / Math.max(1, total)) * Math.PI * 2;
    const q = nearestWalkable(z.map, p.x + 6 + Math.cos(ang) * 1.5, p.y + Math.sin(ang) * 1.5, 5, z.block) ?? { x: p.x + 5, y: p.y };
    const m = W.makeMonster(D.monsters[g.id], { x: q.x, y: q.y, team: 'm', level: g.level ?? D.monsters[g.id].level, elite: !!g.elite });
    z.add(m); foes.push(m);
  }
  p.hp = p.maxHp; p.mana = manaCap(p);
  W.step(1);
  c.clear();
  const r = fight(h, cls, () => foes.filter((m) => !m.dead && !m.removed), { mode, maxS });
  return { cls, level, seed, mode, win: !r.died && foes.every((m) => m.dead), ...r, elites: foes.filter((m) => m.rarity === 'elite').map((m) => m.name), hero: { maxHp: p.maxHp, armor: p.stats.armor, weapon: h.ch.equip.weapon?.name } };
}
