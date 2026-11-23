// 画面から届く命令（C2S）の確かめと処理。世界の計算が正。すべての入力をここで確かめる。
// 戻り値は記録に書く結果（'ok' か 'err:<code>'）。
import { PROTO_VERSION, CLASSES, CLASS_CHANGE_LEVEL, INV_W, INV_H, STASH_W, STASH_H, PICKUP_RANGE, MAX_LEVEL, RARITIES } from '../shared/schema.mjs';
import { skillCost, xpToNext } from '../shared/calc.mjs';
import { nearestWalkable } from '../shared/mapgen.mjs';
import { isActor, isEnemy, isAlly, dist, canCast, canMove, manaCap, removeStatus, recompute } from './actor.mjs';
import { startCast, isToggleOff } from './effects.mjs';
import { applyDamage } from './combat.mjs';
import { canAlloc, canUnalloc, treeRoots, canRankUp, skillUsable } from './progress.mjs';
import { fits, findSpace, addItem, slotFor, slotAccepts } from './inventory.mjs';
import { makeItem, makeUnique, makeConsumable, sellPrice, buyPrice } from './loot.mjs';
import { newChar, fillChar } from './world.mjs';

const MESSAGES = {
  badMsg: '命令の形が正しくありません。', rate: '操作が速すぎます。少し待ってください。', unknown: '知らない命令です。', state: '今はその命令を使えません。',
  version: '画面とサーバーの版が違います。ページを読み込み直してください。', internal: 'サーバーで問題が起きました。', hasChar: 'キャラはもうあります。',
  noChar: 'キャラがまだありません。', dead: '倒れています。', notDead: 'まだ倒れていません。', noTarget: '相手が見つかりません。', noPath: 'そこへは行けません。',
  range: '遠すぎます。', noSkill: 'そのスキルは使えません。', cooldown: 'まだ使えません。', noMana: '魔力が足りません。', cantAct: '今は動けません。',
  silenced: '今はスキルを使えません。', busy: '今は手が離せません。', safe: '町の中では戦えません。', full: '持ち物がいっぱいです。', noItem: 'その品物がありません。',
  noSpace: 'そこには置けません。', level: 'レベルが足りません。', noGold: 'お金が足りません。', noNpc: 'その人は近くにいません。', notShop: 'ここでは売り買いできません。',
  noStash: '倉庫は宿屋で開いてください。', cantEquip: 'そこには装備できません。', notUsable: 'その品物は使えません。', notYours: 'まだ拾えません（ほかの人の宝です）。',
  noPoints: '点が足りません。', noNode: 'そのマスはありません。', already: 'もう取っています。', notConnected: '取ったマスとつながっていません。',
  notAllocated: 'そのマスは取っていません。', root: '出発点は取り消せません。', wouldDisconnect: '取り消すと、ほかのマスがつながらなくなります。',
  wrongClass: 'その職業では使えません。', maxRank: 'これ以上は上げられません。', badSlot: 'その枠は使えません。', noQuest: 'その依頼はありません。',
  questState: '今はその依頼を受けられません。', notReady: 'まだ依頼の条件を満たしていません。', badClass: 'その職業には転職できません。',
  alreadyClass: 'もう転職しています。', needTrial: '先に転職の試験を終えてください。', chatRate: '発言が速すぎます。', badPhrase: 'その定型文はありません。',
  badStamp: 'そのスタンプはありません。', noParty: 'パーティーに入っていません。', partyFull: 'パーティーがいっぱいです。', notLeader: 'リーダーだけができます。',
  inParty: 'その人はもうパーティーに入っています。', noInvite: '誘いが届いていません。', noPortal: 'ここには入口がありません。', noMap: 'その場所には行けません。',
  noScroll: '帰還の巻物がありません。', inTown: '町の中では使えません。', noReturn: '戻る場所がありません。', notVisited: 'まだ行ったことのない場所です。',
  potionCd: '薬はまだ飲めません。', noOpt: 'その選び方はありません。', self: '自分には使えません。',
  noCorpse: '近くに亡骸がありません。', portalClosed: 'この出口はまだ閉じています。', wrongWeapon: 'その職業はこの武器を使えません。',
  badSave: '保存の中身を読めませんでした。', noDebug: '確かめ用の命令は ?debug=1 のときだけ使えます。',
};
const giversOf = (q) => (Array.isArray(q.giver) ? q.giver : q.giver ? [q.giver] : []);
export const errMsg = (code) => MESSAGES[code] ?? 'できませんでした。';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isId = (v) => Number.isInteger(v) && v > 0;
const isStr = (v, max = 64) => typeof v === 'string' && v.length > 0 && v.length <= max;
const fail = (W, s, code) => { W.sendErr(s, code); return `err:${code}`; };
const BIND_SLOTS = ['r', '1', '2', '3', '4', '5', '6'];
const NPC_RANGE = 5, STASH_RANGE = 6;

const PRE = { hello, pause, save };
const LOBBY = { create, reroll, pause, save };
const PLAY = {
  move, attack, cast, stop, pick, inv, alloc, unalloc, skillUp, bind, talk, quest, classChange, portal, warp, respawn, pause, save, debug,
};

export function handleCommand(W, s, m) {
  const table = s.state === 'play' ? PLAY : s.state === 'lobby' ? LOBBY : PRE;
  const fn = table[m.t];
  if (!fn) {
    const known = PLAY[m.t] || LOBBY[m.t] || PRE[m.t];
    return fail(W, s, known ? 'state' : 'unknown');
  }
  if (s.state === 'play' && (!s.player || !s.player.zone)) return 'err:transit';
  return fn(W, s, m);
}

/* ---------------- 入る前 ---------------- */
// hello: 保存したキャラ（char）があれば続きから。無ければ名前の候補を送って、作るのを待つ
function hello(W, s, m) {
  if (s.state !== 'new') return fail(W, s, 'state');
  if (m.v !== PROTO_VERSION) W.sendErr(s, 'version');
  const ch = m.char && typeof m.char === 'object' && !Array.isArray(m.char) ? m.char : null;
  if (ch) {
    if (typeof ch.id !== 'string' || typeof ch.name !== 'string' || !Number.isInteger(ch.level)) return fail(W, s, 'badSave');
    ch.level = Math.max(1, Math.min(MAX_LEVEL, ch.level));
    s.state = 'lobby';
    W.enterWorld(s, ch, { welcome: true });
    return 'ok';
  }
  s.state = 'lobby';
  W.send(s, { t: 'welcome', you: null, zone: null, simTime: W.now });
  s.names = genNames(W, 3);
  W.send(s, { t: 'names', list: s.names });
  return 'ok';
}
function reroll(W, s) {
  if (s.char) return fail(W, s, 'hasChar');
  s.names = genNames(W, 3);
  W.send(s, { t: 'names', list: s.names });
  return 'ok';
}
function create(W, s, m) {
  if (s.char) return fail(W, s, 'hasChar');
  let name = typeof m.name === 'string' && s.names?.includes(m.name) ? m.name : null;
  if (!name) { const i = Number.isInteger(m.i) && m.i >= 0 && m.i < (s.names?.length ?? 0) ? m.i : 0; name = s.names?.[i]; }
  if (!name) name = genNames(W, 1)[0];
  const id = Math.floor(W.rng() * 2 ** 48).toString(16).padStart(12, '0');
  const ch = newChar(W.data, id, name, W.rng);
  W.log.server('create', { c: id, name });
  W.enterWorld(s, ch, { welcome: true });
  return 'ok';
}
const DEFAULT_PARTS = [['ア', 'イ', 'カ', 'セ', 'ト', 'ナ', 'ミ', 'リ', 'ル', 'ロ', 'ヴァ', 'ゼ'], ['ル', 'ン', 'ス', 'ト', 'ラ', 'リ', 'ク', 'ム'], ['', 'ア', 'ド', 'ネ', 'ル', 'ス']];
function nameTables(W) {
  const np = W.data.nameParts;
  const strArr = (a) => Array.isArray(a) && a.length && a.every((x) => typeof x === 'string');
  let parts = null;
  if (Array.isArray(np) && np.every(strArr)) parts = np;
  else if (strArr(np)) parts = [np, np];
  else if (np && typeof np === 'object') { const v = Object.values(np).filter(strArr); if (v.length === 1) parts = [v[0], v[0]]; else if (v.length) parts = v; }
  return parts ?? DEFAULT_PARTS;
}
export function genNames(W, n) {
  const parts = nameTables(W);
  const out = [];
  for (let tries = 0; out.length < n && tries < n * 30; tries++) {
    let name = null;
    if (W.data.makeName) { try { name = String(W.data.makeName(W.rng)).slice(0, 12); } catch { name = null; } }
    name ??= parts.map((a) => a[Math.floor(W.rng() * a.length)]).join('').slice(0, 12);
    if (name.length >= 2 && !out.includes(name)) out.push(name);
  }
  while (out.length < n) out.push(`旅人${Math.floor(W.rng() * 90000 + 10000)}`);
  return out;
}

/* ---------------- 1 人用: 止める・保存・確かめ ---------------- */
function pause(W, s, m) {
  W.setPaused(!!m.on, typeof m.why === 'string' ? m.why.slice(0, 20) : '');
  return 'ok';
}
function save(W, s, m) {
  if (!s.char) return 'ok:noChar';
  W.saveSession(s, typeof m.why === 'string' ? m.why.slice(0, 20) : 'request');
  return 'ok';
}
// 確かめ用の命令（?debug=1 のときだけ）。通し遊びの台本と、画面の「確かめ」の窓が使う
function debug(W, s, m) {
  if (!W.debug) return fail(W, s, 'noDebug');
  const p = s.player, ch = s.char, D = W.data, z = p.zone;
  const done = (msg, what = []) => { for (const k of ['stats', 'inv', 'skills', 'tree', 'quests', ...what]) W.markDirty(p, k); W.markDirty(p); if (msg) W.sys(s, `（確かめ）${msg}`); return 'ok'; };
  const n = Number(m.n);
  switch (m.op) {
    case 'level': {
      const lv = Math.max(1, Math.min(MAX_LEVEL, Math.round(n) || 1));
      const gained = Math.max(0, lv - ch.level);
      ch.level = lv; p.level = lv; ch.xp = 0;
      ch.points.passive += gained; ch.points.skill += gained;
      p.dirtyStats = true; recompute(p, D); p.hp = p.maxHp; p.mana = manaCap(p);
      if (gained) z.fx({ k: 'levelUp', id: p.id, level: lv }, p.x, p.y);
      W.log.server('levelUp', { c: ch.id, level: lv, by: 'debug' });
      return done(`レベル ${lv}（点を ${gained} ずつ足した）`);
    }
    case 'xp': W.grantXp(p, Math.max(0, n || xpToNext(ch.level))); return done('');
    // 装備の抽選: 今の職で使える武器と、胴・頭・手・足を、今の Lv から 14 下までの基本の品から 3 つずつ引き、いちばん良い物を付ける。
    // 珍しさは魔法（65%）か希少（35%）。付加効果はふだんの宝と同じ抽選。
    // extra を渡すと、売るための品も持ち物に入れる。外れた物は持ち物へ（入らなければ足元へ）
    case 'gear': {
      const L = ch.level;
      const allowed = D.classes[ch.cls]?.weapons;
      const roll1 = (slot) => {
        const fit = (b) => b.level <= L && (!slot || b.slot === slot) && (b.slot !== 'weapon' || !allowed || allowed.includes(b.kind));
        // 鐘楼のあたりで拾う品: 今の Lv から 14 下までの基本の品（無ければ Lv までの全部）
        let pool = Object.values(D.bases).filter((b) => fit(b) && b.level >= L - 14);
        if (!pool.length) pool = Object.values(D.bases).filter(fit);
        if (!pool.length) return null;
        const b = pool[Math.floor(W.rng() * pool.length)];
        return makeItem(D, W.rng, b.id, W.rng() < 0.65 ? 'magic' : 'rare', L, W.uid());
      };
      // 拾った 3 つのうち、いちばん良い物を付ける（人が拾って選ぶのと同じ）。武器は 1 秒あたりのダメージ、防具は防御で比べる
      const worth = (it) => (it.dmg ? ((it.dmg[0] + it.dmg[1]) / 2) * (it.speed ?? 1) : (it.armor ?? 0)) + (it.affixes?.length ?? 0);
      const roll = (slot) => {
        if (!slot) return roll1(null);
        let best = null;
        for (let k = 0; k < 3; k++) { const it = roll1(slot); if (it && (!best || worth(it) > worth(best))) best = it; }
        return best;
      };
      const stow = (it) => { delete it.x; delete it.y; if (!addItem(ch.inv, INV_W, INV_H, it, D).ok) W.dropToGround(z, p.x, p.y, { item: it }); };
      const got = [];
      for (const slot of ['weapon', 'body', 'head', 'hands', 'feet']) {
        const it = roll(slot);
        if (!it) continue;
        if (slot === 'weapon' && it.hands === 2 && ch.equip.offhand) { const o = ch.equip.offhand; delete ch.equip.offhand; stow(o); }
        const old = ch.equip[slot];
        delete it.x; delete it.y;
        ch.equip[slot] = it;
        if (old) stow(old);
        got.push(it.name);
      }
      const extra = Math.max(0, Math.min(12, Math.round(Number(m.extra) || 0)));
      for (let i = 0; i < extra; i++) { const it = roll(null); if (it) stow(it); }
      p.dirtyStats = true; recompute(p, D);
      W.log.server('gear', { c: ch.id, cls: ch.cls, level: L, items: got, extra });
      return done(`装備を抽選した: ${got.join('、')}`);
    }
    case 'gold': ch.gold = Math.max(0, ch.gold + (Math.round(n) || 1000)); return done(`お金 ${ch.gold}`);
    case 'points': ch.points.skill += Math.max(0, Math.round(Number(m.skill) || 0)); ch.points.passive += Math.max(0, Math.round(Number(m.passive) || 0)); return done(`スキルの点 ${ch.points.skill}、パッシブの点 ${ch.points.passive}`);
    case 'item': {
      const id = String(m.id ?? '');
      const qty = Math.max(1, Math.min(99, Math.round(Number(m.qty) || 1)));
      let it = null;
      const u = (D.uniques ?? []).find((x) => x.id === id);
      if (u) it = makeUnique(D, u, W.uid());
      else if (D.bases[id]) it = makeItem(D, W.rng, id, RARITIES[m.rarity] && m.rarity !== 'unique' ? m.rarity : 'rare', Math.max(ch.level, D.bases[id].level), W.uid());
      else if (D.consumables[id]) it = makeConsumable(D, id, qty, W.uid());
      if (!it) return fail(W, s, 'noItem');
      if (!addItem(ch.inv, INV_W, INV_H, it, D).ok) return fail(W, s, 'full');
      W.questCollectChanged(s);
      return done(`${it.name} を出した`);
    }
    case 'warp': {
      const map = String(m.map ?? '');
      if (!D.maps[map]) return fail(W, s, 'noMap');
      if (p.dead) { p.dead = false; p.hp = p.maxHp; }
      W.transfer(p, map, Number.isFinite(m.x) ? m.x : null, Number.isFinite(m.y) ? m.y : null, 'debug');
      return done(`${D.maps[map].name ?? map} へ移る`);
    }
    case 'speed': return done(`時間の速さ ×${W.setSpeed(n)}`);
    case 'heal': p.dead = false; p.hp = p.maxHp; p.mana = manaCap(p); p.cds = {}; removeStatus(p, (x) => x.kind === 'debuff' || x.kind === 'dot'); return done('体力と魔力を戻し、待ち時間と悪い効果を消した');
    case 'god': p.god = m.on !== false; return done(p.god ? '倒れなくした' : '倒れるように戻した');
    case 'cls': {
      const cls = String(m.cls ?? '');
      if (!D.classes[cls]) return fail(W, s, 'badClass');
      ch.cls = cls; p.cls = cls; p.art = D.classes[cls].art ?? cls;
      fillChar(ch, D);
      p.dirtyStats = true;
      s.known.delete(p.id);
      W.log.server('classChange', { c: ch.id, cls, by: 'debug' });
      return done(`${D.classes[cls].name}にした`);
    }
    case 'quest': {
      const q = D.quests[String(m.id ?? '')];
      if (!q) return fail(W, s, 'noQuest');
      if (m.state === 'done') ch.quests[q.id] = { state: 'done', kills: {}, talked: {} };
      else ch.quests[q.id] = { state: 'active', kills: Object.fromEntries(q.needs.filter((x) => x.kind === 'kill').map((x) => [x.id, x.count])), talked: {} };
      return done(`依頼「${q.name}」を ${m.state === 'done' ? '終えた' : '報告できる'} 状態にした`);
    }
    case 'spawn': {
      const def = D.monsters[String(m.id ?? '')];
      if (!def) return fail(W, s, 'noTarget');
      const k = Math.max(1, Math.min(20, Math.round(n) || 1));
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2;
        const pos = nearestWalkable(z.map, p.x + Math.cos(a) * 3, p.y + Math.sin(a) * 3, 4, z.block) ?? { x: p.x, y: p.y };
        const mo = W.makeMonster(def, { x: pos.x, y: pos.y, team: 'm', level: Number.isFinite(m.level) ? m.level : def.level, elite: !!m.elite });
        z.add(mo);
      }
      return done(`${def.name}を ${k} 体出した`);
    }
    case 'killAll': {
      const r = Math.max(1, Math.min(60, Number(m.r) || 12));
      let k = 0;
      for (const a of z.queryActors(p.x, p.y, r, (a) => a.kind === 'monster' && a.team !== p.team && !a.dead && !a.owner)) { applyDamage(z, p, a, { amount: a.hp + a.maxHp, type: 'holy', pure: true }); k++; }
      return done(`近くの魔物を ${k} 体倒した`);
    }
    default: return fail(W, s, 'badMsg');
  }
}

/* ---------------- 動きと戦い ---------------- */
function move(W, s, m) {
  const p = s.player, z = p.zone;
  if (!isNum(m.x) || !isNum(m.y)) return fail(W, s, 'badMsg');
  if (p.dead) return fail(W, s, 'dead');
  if (m.x < 0 || m.y < 0 || m.x >= z.map.w || m.y >= z.map.h) return fail(W, s, 'noPath');
  if (p.forced) return 'err:busy';
  if (!canMove(p)) return 'err:cantAct';
  p.action = null; p.casting = null; p.channel = null;
  const path = W.pathFor(z, p, m.x, m.y);
  if (!path) { p.path = null; return fail(W, s, 'noPath'); }
  p.path = path;
  return 'ok';
}
function attack(W, s, m) {
  const p = s.player, z = p.zone;
  if (!isId(m.id)) return fail(W, s, 'badMsg');
  if (p.dead) return fail(W, s, 'dead');
  if (z.map.safe) return fail(W, s, 'safe');
  const t = z.ents.get(m.id);
  if (!t || !isActor(t) || t.dead || !isEnemy(p, t)) return fail(W, s, 'noTarget');
  p.action = { type: 'attack', id: t.id };
  p.channel = null;
  return 'ok';
}
function stop(W, s) {
  const p = s.player;
  p.path = null; p.action = null; p.channel = null;
  return 'ok';
}
function cast(W, s, m) {
  const p = s.player, z = p.zone, ch = s.char, D = W.data;
  if (!isStr(m.s)) return fail(W, s, 'badMsg');
  const sk = D.skills[m.s];
  const rank = sk ? ch.ranks[sk.id] ?? 0 : 0;
  if (!sk || rank < 1 || !skillUsable(sk, ch.cls)) return fail(W, s, 'noSkill');
  if (p.dead) return fail(W, s, 'dead');
  if (p.cc.silence) return fail(W, s, 'silenced');
  if (!canCast(p)) return fail(W, s, 'cantAct');
  if (p.forced || p.casting) return 'err:busy';
  const check = () => {
    if ((p.cds[sk.id] ?? 0) > W.now) return 'cooldown';
    if (!isToggleOff(p, sk) && !p.rules?.includes('bloodMagic') && p.mana < skillCost(sk, rank, p.stats)) return 'noMana';
    if (!canCast(p) || p.dead) return 'cantAct';
    return null;
  };
  const c0 = check();
  if (c0) return fail(W, s, c0);
  let target = null, point = null;
  const reach = (t) => sk.range + 0.6 + (t?.radius ?? 0);
  if (sk.target === 'enemy') {
    const t = isId(m.id) ? z.ents.get(m.id) : null;
    const corpse = sk.tags.includes('corpse');
    if (!t || !isActor(t) || !isEnemy(p, t) || (t.dead && !corpse) || (corpse && !t.dead)) return fail(W, s, 'noTarget');
    target = t;
  } else if (sk.target === 'ally') {
    const t = isId(m.id) ? z.ents.get(m.id) : null;
    target = t && isActor(t) && isAlly(p, t) ? t : p;
  } else if (sk.target === 'self') {
    point = { x: p.x, y: p.y };
  } else {
    if (!isNum(m.x) || !isNum(m.y)) return fail(W, s, 'badMsg');
    let dx = m.x - p.x, dy = m.y - p.y;
    const d = Math.hypot(dx, dy);
    if (sk.target === 'dir') { const k = d > 1e-6 ? sk.range / d : 0; point = { x: p.x + dx * k, y: p.y + dy * k }; }
    else if (d > sk.range) point = { x: p.x + (dx / d) * sk.range, y: p.y + (dy / d) * sk.range };
    else point = { x: m.x, y: m.y };
    if (isId(m.id)) { const t = z.ents.get(m.id); if (t && isActor(t) && !t.dead) target = t; }
  }
  // needsCorpse: 使い手から range 以内の亡骸が要る。狙った地点にいちばん近い亡骸を使い、1 つ消す
  let corpse = null;
  if (sk.needsCorpse || sk.tags.includes('corpse')) {
    const aim = point ?? target ?? p;
    corpse = z.query(p.x, p.y, sk.range + 0.5, (e) => e.kind === 'monster' && e.dead && !e.owner && !e.clone && !e.def?.boss)
      .sort((a, b) => Math.hypot(a.x - aim.x, a.y - aim.y) - Math.hypot(b.x - aim.x, b.y - aim.y))[0] ?? null;
    if (!corpse) return fail(W, s, 'noCorpse');
    if (sk.target !== 'enemy') point = { x: corpse.x, y: corpse.y };
  }
  const run = () => {
    const c = check();
    if (c) { W.sendErr(s, c); return; }
    if (target && (target.removed || target.zone !== z)) { W.sendErr(s, 'noTarget'); return; }
    if (corpse && corpse.removed) { W.sendErr(s, 'noCorpse'); return; }
    startCast(z, p, sk, rank, { target, point: point ?? (target ? { x: target.x, y: target.y } : null) });
    if (corpse && !corpse.removed) { z.fx({ k: 'vfx', name: 'corpse_used', on: corpse.id }, corpse.x, corpse.y); z.remove(corpse); }
  };
  if (target && target !== p && dist(p, target) > reach(target)) {
    p.action = { type: 'cast', id: target.id, range: reach(target) - 0.2, run };
    p.channel = null;
    return 'ok:approach';
  }
  p.action = null;
  run();
  return 'ok';
}
function pick(W, s, m) {
  const p = s.player, z = p.zone;
  if (!isId(m.id)) return fail(W, s, 'badMsg');
  if (p.dead) return fail(W, s, 'dead');
  const e = z.ents.get(m.id);
  if (!e || e.kind !== 'item') return fail(W, s, 'noItem');
  if (dist(p, e) <= PICKUP_RANGE) { W.pickItem(p, e); return 'ok'; }
  p.action = { type: 'pick', id: e.id };
  return 'ok:approach';
}

/* ---------------- 持ち物 ---------------- */
function findItem(ch, uid) {
  let i = ch.inv.findIndex((it) => it.uid === uid);
  if (i >= 0) return { where: 'inv', list: ch.inv, i, item: ch.inv[i] };
  i = ch.stash.findIndex((it) => it.uid === uid);
  if (i >= 0) return { where: 'stash', list: ch.stash, i, item: ch.stash[i] };
  return null;
}
function stashOk(W, s) {
  const p = s.player;
  const n = s.stashOpen ? p.zone.ents.get(s.stashOpen) : null;
  return !!n && dist(p, n) <= STASH_RANGE;
}
function npcNear(W, s, id, roles) {
  const p = s.player;
  const n = isId(id) ? p.zone.ents.get(id) : typeof id === 'string' ? [...p.zone.npcs].find((e) => e.npcId === id) : null;
  if (!n || n.kind !== 'npc' || dist(p, n) > NPC_RANGE) return null;
  if (roles && !roles.includes(n.role)) return null;
  return n;
}
function inv(W, s, m) {
  const p = s.player, ch = s.char, D = W.data;
  const op = m.op;
  const done = () => { W.markDirty(p, 'inv'); W.markDirty(p); return 'ok'; };
  if (op === 'move') {
    const f = isStr(m.item) ? findItem(ch, m.item) : null;
    if (!f) return fail(W, s, 'noItem');
    const to = m.to ?? {};
    if (!Number.isInteger(to.x) || !Number.isInteger(to.y)) return fail(W, s, 'badMsg');
    const toStash = !!to.stash;
    if ((toStash || f.where === 'stash') && !stashOk(W, s)) return fail(W, s, 'noStash');
    const dest = toStash ? ch.stash : ch.inv;
    const [dw, dh] = toStash ? [STASH_W, STASH_H] : [INV_W, INV_H];
    const same = (f.where === 'stash') === toStash;
    if (!fits(dest, dw, dh, f.item.w, f.item.h, to.x, to.y, same ? f.item.uid : null)) return fail(W, s, 'noSpace');
    f.list.splice(f.i, 1);
    f.item.x = to.x; f.item.y = to.y;
    dest.push(f.item);
    return done();
  }
  if (op === 'equip') {
    const f = isStr(m.item) ? findItem(ch, m.item) : null;
    if (!f || f.where !== 'inv') return fail(W, s, 'noItem');
    const it = f.item;
    if (it.consumable || !it.slot) return fail(W, s, 'cantEquip');
    if ((it.level ?? 1) > ch.level) return fail(W, s, 'level');
    const slot = m.to != null ? m.to : slotFor(it, ch.equip);
    if (!slot || !slotAccepts(slot, it)) return fail(W, s, 'cantEquip');
    const allowed = D.classes[ch.cls]?.weapons;
    if (slot === 'weapon' && Array.isArray(allowed) && it.kind && !allowed.includes(it.kind)) return fail(W, s, 'wrongWeapon');
    // 外れる物: その枠の今の装備と、両手の武器なら副手（副手を付けるなら両手の武器）
    const off = [ch.equip[slot] ? slot : null];
    if (slot === 'weapon' && (it.hands === 2 || D.bases[it.base]?.hands === 2) && ch.equip.offhand) off.push('offhand');
    if (slot === 'offhand' && (ch.equip.weapon?.hands === 2 || D.bases[ch.equip.weapon?.base]?.hands === 2)) off.push('weapon');
    ch.inv.splice(f.i, 1);
    const placed = [];
    for (const sl of off.filter(Boolean)) {
      const old = ch.equip[sl];
      const pos = !placed.length && fits(ch.inv, INV_W, INV_H, old.w, old.h, it.x, it.y) ? { x: it.x, y: it.y } : findSpace(ch.inv, INV_W, INV_H, old.w, old.h);
      if (!pos) {
        for (const [psl, o] of placed) { ch.inv.splice(ch.inv.indexOf(o), 1); ch.equip[psl] = o; delete o.x; delete o.y; }
        ch.inv.splice(f.i, 0, it);
        return fail(W, s, 'full');
      }
      delete ch.equip[sl];
      old.x = pos.x; old.y = pos.y;
      ch.inv.push(old);
      placed.push([sl, old]);
    }
    delete it.x; delete it.y;
    ch.equip[slot] = it;
    p.dirtyStats = true;
    return done();
  }
  if (op === 'unequip') {
    const slot = m.from;
    const it = typeof slot === 'string' ? ch.equip[slot] : null;
    if (!it) return fail(W, s, 'noItem');
    let pos = m.to && Number.isInteger(m.to.x) && Number.isInteger(m.to.y) && fits(ch.inv, INV_W, INV_H, it.w, it.h, m.to.x, m.to.y) ? { x: m.to.x, y: m.to.y } : null;
    pos ??= findSpace(ch.inv, INV_W, INV_H, it.w, it.h);
    if (!pos) return fail(W, s, 'full');
    delete ch.equip[slot];
    it.x = pos.x; it.y = pos.y;
    ch.inv.push(it);
    p.dirtyStats = true;
    return done();
  }
  if (op === 'drop') {
    let it = null;
    if (isStr(m.item)) { const f = findItem(ch, m.item); if (!f || f.where !== 'inv') return fail(W, s, 'noItem'); it = f.item; f.list.splice(f.i, 1); }
    else if (typeof m.from === 'string' && ch.equip[m.from]) { it = ch.equip[m.from]; delete ch.equip[m.from]; p.dirtyStats = true; }
    else return fail(W, s, 'noItem');
    delete it.x; delete it.y;
    W.dropToGround(p.zone, p.x, p.y, { item: it }, null);
    W.questCollectChanged(s);
    return done();
  }
  if (op === 'use') {
    const f = isStr(m.item) ? findItem(ch, m.item) : null;
    if (!f || f.where !== 'inv') return fail(W, s, 'noItem');
    const it = f.item;
    const def = it.consumable ? D.consumables[it.base] : null;
    const use = def?.use ?? {};
    if (!def || !Object.keys(use).length || use.respec) return fail(W, s, 'notUsable');
    if (p.dead) return fail(W, s, 'dead');
    if (use.portal) return portal(W, s, { viaItem: f });
    if ((p.potionAt ?? 0) > W.now) return fail(W, s, 'potionCd');
    p.potionAt = W.now + 500;
    const life = (Number(use.heal) || 0) + ((Number(use.healPct) || 0) / 100) * p.maxHp;
    const mana = (Number(use.mana) || 0) + ((Number(use.manaPct) || 0) / 100) * p.maxMana;
    if (life > 0) { const before = p.hp; p.hp = Math.min(p.maxHp, p.hp + life); p.zone.fx({ k: 'heal', id: p.id, amt: Math.round(p.hp - before), potion: true }, p.x, p.y); }
    if (mana > 0) p.mana = Math.min(manaCap(p), p.mana + mana);
    consumeOne(ch, f);
    return done();
  }
  if (op === 'sell') {
    const n = npcNear(W, s, m.npc, ['smith', 'apothecary', 'inn']);
    if (!n) return fail(W, s, 'notShop');
    const f = isStr(m.item) ? findItem(ch, m.item) : null;
    if (!f || f.where !== 'inv') return fail(W, s, 'noItem');
    const price = sellPrice(f.item, D);
    f.list.splice(f.i, 1);
    ch.gold += price;
    W.questCollectChanged(s);
    W.sys(s, `${f.item.name} を ${price} G で売りました。`);
    return done();
  }
  if (op === 'buy') {
    const n = npcNear(W, s, m.npc, ['smith', 'apothecary', 'inn']);
    if (!n) return fail(W, s, 'notShop');
    const entry = shopList(W, n, ch).find((e) => e.id === m.item);
    if (!entry) return fail(W, s, 'noItem');
    const qty = entry.item.consumable && Number.isInteger(m.qty) ? Math.max(1, Math.min(m.qty, D.consumables[entry.id]?.stack ?? 1)) : 1;
    const cost = entry.price * qty;
    if (ch.gold < cost) return fail(W, s, 'noGold');
    const it = entry.item.consumable ? makeConsumable(D, entry.id, qty, W.uid()) : makeItem(D, W.rng, entry.id, 'normal', D.bases[entry.id].level, W.uid());
    const r = addItem(ch.inv, INV_W, INV_H, it, D);
    if (!r.ok) return fail(W, s, 'full');
    ch.gold -= cost;
    return done();
  }
  if (op === 'stash') {
    if (!stashOk(W, s)) return fail(W, s, 'noStash');
    const f = isStr(m.item) ? findItem(ch, m.item) : null;
    if (!f) return fail(W, s, 'noItem');
    const toStash = f.where === 'inv';
    const dest = toStash ? ch.stash : ch.inv;
    const [dw, dh] = toStash ? [STASH_W, STASH_H] : [INV_W, INV_H];
    const pos = findSpace(dest, dw, dh, f.item.w, f.item.h);
    if (!pos) return fail(W, s, 'full');
    f.list.splice(f.i, 1);
    f.item.x = pos.x; f.item.y = pos.y;
    dest.push(f.item);
    W.questCollectChanged(s);
    return done();
  }
  return fail(W, s, 'badMsg');
}
function consumeOne(ch, f) {
  f.item.qty = (f.item.qty ?? 1) - 1;
  if (f.item.qty <= 0) { const i = f.list.indexOf(f.item); if (i >= 0) f.list.splice(i, 1); }
}
function findConsumable(W, ch, key) {
  for (let i = 0; i < ch.inv.length; i++) {
    const it = ch.inv[i];
    if (it.consumable && W.data.consumables[it.base]?.use?.[key]) return { where: 'inv', list: ch.inv, i, item: it };
  }
  return null;
}
export function shopList(W, n, ch) {
  const D = W.data, def = D.npcs[n.npcId] ?? {};
  let ids = Array.isArray(def.shop) ? def.shop : null;
  if (!ids) {
    if (n.role === 'smith') ids = Object.values(D.bases).filter((b) => b.level <= ch.level + 3).slice(0, 16).map((b) => b.id);
    else if (n.role === 'apothecary') ids = Object.values(D.consumables).filter((c) => Object.keys(c.use ?? {}).length).map((c) => c.id);
    else ids = [];
  }
  const out = [];
  for (const e of ids) {
    const id = typeof e === 'string' ? e : e?.id;
    let item = null;
    if (D.bases[id]) item = makeItem(D, () => 0.5, id, 'normal', D.bases[id].level, `shop:${id}`);
    else if (D.consumables[id]) item = makeConsumable(D, id, 1, `shop:${id}`);
    if (!item) { W.warnOnce('shop.unknownItem', { npc: n.npcId, id }); continue; }
    out.push({ id, name: item.name, price: typeof e === 'object' && e.price ? e.price : buyPrice(item, D), w: item.w, h: item.h, item });
  }
  return out;
}

/* ---------------- 育成 ---------------- */
function alloc(W, s, m) {
  const p = s.player, ch = s.char;
  if (!isStr(m.node, 80)) return fail(W, s, 'badMsg');
  if (ch.points.passive < 1) return fail(W, s, 'noPoints');
  const set = new Set(ch.alloc);
  const r = canAlloc(W.data.tree, set, m.node);
  if (!r.ok) return fail(W, s, r.code);
  ch.alloc.push(m.node);
  ch.points.passive--;
  p.dirtyStats = true;
  W.markDirty(p, 'tree');
  return 'ok';
}
function unalloc(W, s, m) {
  const p = s.player, ch = s.char;
  if (!isStr(m.node, 80)) return fail(W, s, 'badMsg');
  const roots = treeRoots(W.data.tree, ch.cls);
  const r = canUnalloc(W.data.tree, new Set(ch.alloc), m.node, roots);
  if (!r.ok) return fail(W, s, r.code);
  const water = findConsumable(W, ch, 'respec');
  const goldCost = 20 * ch.level;
  if (water) consumeOne(ch, water);
  else if (ch.gold >= goldCost) ch.gold -= goldCost;
  else return fail(W, s, 'noGold');
  ch.alloc = ch.alloc.filter((id) => id !== m.node);
  ch.points.passive++;
  p.dirtyStats = true;
  W.markDirty(p, 'tree'); W.markDirty(p, 'inv');
  W.sys(s, water ? '忘却の聖水を使って、マスを取り消しました。' : `${goldCost} G を払って、マスを取り消しました。`);
  return 'ok';
}
function skillUp(W, s, m) {
  const p = s.player, ch = s.char;
  if (!isStr(m.s)) return fail(W, s, 'badMsg');
  const sk = W.data.skills[m.s];
  const r = canRankUp(sk, ch.cls, ch.level, ch.ranks[m.s] ?? 0, ch.points.skill);
  if (!r.ok) return fail(W, s, r.code === 'noSkill' ? 'noSkill' : r.code);
  ch.ranks[m.s] = (ch.ranks[m.s] ?? 0) + 1;
  ch.points.skill--;
  W.markDirty(p, 'skills');
  return 'ok';
}
function bind(W, s, m) {
  const ch = s.char;
  if (!BIND_SLOTS.includes(String(m.slot))) return fail(W, s, 'badSlot');
  const slot = String(m.slot);
  if (m.s === null || m.s === '') { delete ch.binds[slot]; W.markDirty(s.player, 'skills'); return 'ok'; }
  if (!isStr(m.s) || !W.data.skills[m.s] || !(ch.ranks[m.s] >= 1) || !skillUsable(W.data.skills[m.s], ch.cls)) return fail(W, s, 'noSkill');
  ch.binds[slot] = m.s;
  W.markDirty(s.player, 'skills');
  return 'ok';
}
function classChange(W, s, m) {
  const p = s.player, ch = s.char, D = W.data;
  const cls = m.cls;
  if (!isStr(cls) || !CLASSES[cls] || CLASSES[cls].tier !== 1 || !D.classes[cls]) return fail(W, s, 'badClass');
  if (ch.cls !== 'adventurer') return fail(W, s, 'alreadyClass');
  if (ch.level < CLASS_CHANGE_LEVEL) return fail(W, s, 'level');
  const masterDefined = Object.values(D.npcs).some((n) => n.role === 'master' && n.cls === cls && D.npcLocation[n.id]);
  if (masterDefined && ![...p.zone.npcs].some((n) => n.role === 'master' && D.npcs[n.npcId]?.cls === cls && dist(p, n) <= NPC_RANGE)) return fail(W, s, 'noNpc');
  const trials = Object.values(D.quests).filter((q) => q.classTrial || q.reward?.classChange);
  if (trials.length && !trials.some((q) => ch.quests[q.id]?.state === 'done')) return fail(W, s, 'needTrial');
  ch.cls = cls; p.cls = cls; p.art = D.classes[cls].art ?? cls;
  fillChar(ch, D);
  p.dirtyStats = true;
  for (const o of W.sessions) o.known.delete(p.id); // 新しい姿を送り直す
  p.zone.fx({ k: 'vfx', name: 'classChange', on: p.id, cls }, p.x, p.y);
  W.sys(s, `${D.classes[cls].name}に転職しました。職の門のマスをもらいました。`);
  W.markDirty(p, 'tree'); W.markDirty(p, 'skills'); W.markDirty(p, 'stats');
  W.send(s, W.zoneMsg(s));
  W.log.server('classChange', { c: ch.id, cls });
  return 'ok';
}

/* ---------------- NPC と依頼 ---------------- */
function talk(W, s, m) {
  const p = s.player, z = p.zone;
  const n = isId(m.npc) ? z.ents.get(m.npc) : typeof m.npc === 'string' ? [...z.npcs].find((e) => e.npcId === m.npc) : null;
  if (!n || n.kind !== 'npc') return fail(W, s, 'noNpc');
  if (m.opt !== undefined && !isStr(m.opt, 64)) return fail(W, s, 'badMsg');
  if (dist(p, n) > NPC_RANGE) {
    if (m.opt) return fail(W, s, 'noNpc');
    p.action = { type: 'talk', id: n.id };
    return 'ok:approach';
  }
  return openDialog(W, s, n, m.opt ?? null);
}
export function openDialog(W, s, n, opt) {
  const D = W.data, ch = s.char, p = s.player;
  const def = D.npcs[n.npcId] ?? { name: n.name, role: n.role, lines: [] };
  for (const st of Object.values(ch.quests)) if (st.state === 'active') { st.talked ??= {}; if (!st.talked[n.npcId]) { st.talked[n.npcId] = 1; s.dirty.quests = true; } }
  if (opt) {
    if (opt === 'rest' && n.role === 'inn') { p.hp = p.maxHp; p.mana = manaCap(p); removeStatus(p, (x) => x.kind === 'debuff' || x.kind === 'dot'); W.markDirty(p); W.sys(s, 'ぐっすり休んで、体力と魔力が戻りました。'); return 'ok'; }
    if (opt === 'stash' && n.role === 'inn') { s.stashOpen = n.id; W.sendInv(s); return 'ok'; }
    if (opt === 'shop' && ['smith', 'apothecary', 'inn'].includes(n.role)) { W.send(s, { t: 'shop', npc: n.id, items: shopList(W, n, ch).map(({ item, ...e }) => ({ ...e, item })) }); return 'ok'; }
    if (opt === 'return' && ch.returnTo) return warp(W, s, { id: 'return' });
    if (opt.startsWith('warp:') && n.role === 'warp') {
      const to = opt.slice(5);
      if (!D.maps[to]) return fail(W, s, 'noMap');
      if (!ch.visited.includes(to)) return fail(W, s, 'notVisited');
      W.transfer(p, to, null, null, 'warpNpc');
      return 'ok';
    }
    return fail(W, s, 'noOpt');
  }
  const options = [];
  if (n.role === 'inn') options.push({ label: '休む（体力と魔力を戻す）', send: { t: 'talk', npc: n.id, opt: 'rest' } }, { label: '倉庫を開く', send: { t: 'talk', npc: n.id, opt: 'stash' } });
  if (n.role === 'smith' || n.role === 'apothecary') options.push({ label: '品物を見る', send: { t: 'talk', npc: n.id, opt: 'shop' } });
  if (n.role === 'master' && def.cls && ch.cls === 'adventurer') {
    if (ch.level >= CLASS_CHANGE_LEVEL) options.push({ label: `${D.classes[def.cls]?.name ?? def.cls}に転職する`, send: { t: 'classChange', cls: def.cls } });
  }
  if (n.role === 'warp') {
    for (const mid of ch.visited) if (mid !== p.zone.id && D.maps[mid]) options.push({ label: `${D.maps[mid].name}へ`, send: { t: 'talk', npc: n.id, opt: `warp:${mid}` } });
    if (ch.returnTo) options.push({ label: '巻物を使った場所へ戻る', send: { t: 'talk', npc: n.id, opt: 'return' } });
  }
  let questLine = null;
  for (const q of Object.values(D.quests)) {
    if (!giversOf(q).includes(n.npcId)) continue;
    const st = W.questState(ch, q);
    if (st === 'available') { options.push({ label: `依頼「${q.name}」を受ける`, send: { t: 'quest', op: 'accept', id: q.id }, desc: q.desc }); questLine ??= q.lines?.offer; }
    else if (st === 'ready') options.push({ label: `依頼「${q.name}」を報告する`, send: { t: 'quest', op: 'turnIn', id: q.id } });
    else if (st === 'active') questLine ??= q.lines?.progress;
  }
  let text = questLine ?? (def.lines?.length ? def.lines[Math.floor(W.rng() * def.lines.length)] : '……。');
  if (n.role === 'master' && ch.cls === 'adventurer' && ch.level < CLASS_CHANGE_LEVEL) text += `（転職は Lv${CLASS_CHANGE_LEVEL} から）`;
  W.send(s, { t: 'dialog', npc: n.id, npcId: n.npcId, name: def.name, text, options });
  return 'ok';
}
function quest(W, s, m) {
  const D = W.data, ch = s.char, p = s.player;
  const q = isStr(m.id) ? D.quests[m.id] : null;
  if (!q) return fail(W, s, 'noQuest');
  const locs = giversOf(q).map((g) => D.npcLocation[g]).filter(Boolean);
  if (locs.length && !locs.some((loc) => p.zone.id === loc.map && Math.hypot(p.x - loc.x, p.y - loc.y) <= NPC_RANGE + 1)) return fail(W, s, 'noNpc');
  const st = W.questState(ch, q);
  if (m.op === 'accept') {
    if (st !== 'available') return fail(W, s, 'questState');
    ch.quests[q.id] = { state: 'active', kills: {}, talked: {} };
    W.sys(s, `依頼「${q.name}」を受けました。`);
    s.dirty.quests = true;
    return 'ok';
  }
  if (m.op === 'turnIn') {
    if (st !== 'ready') return fail(W, s, 'notReady');
    for (const n of q.needs) {
      if (n.kind !== 'collect') continue;
      let left = n.count;
      for (const it of [...ch.inv]) {
        if (left <= 0) break;
        if (it.base !== n.id) continue;
        const take = Math.min(left, it.qty ?? 1);
        it.qty = (it.qty ?? 1) - take; left -= take;
        if (it.qty <= 0) ch.inv.splice(ch.inv.indexOf(it), 1);
      }
    }
    ch.quests[q.id].state = 'done';
    const r = q.reward ?? {};
    if (r.gold) ch.gold += Math.max(0, Number(r.gold) || 0);
    if (r.skillPoints) ch.points.skill += Number(r.skillPoints) || 0;
    if (r.passivePoints) ch.points.passive += Number(r.passivePoints) || 0;
    const items = Array.isArray(r.items) ? r.items : r.item ? [r.item] : [];
    for (const e of items) {
      const id = typeof e === 'string' ? e : e?.id;
      const qty = typeof e === 'object' ? e.qty ?? 1 : 1;
      const it = D.bases[id] ? makeItem(D, W.rng, id, typeof e === 'object' && e.rarity ? e.rarity : 'magic', Math.max(ch.level, D.bases[id].level), W.uid()) : makeConsumable(D, id, qty, W.uid());
      if (!it) { W.warnOnce('quest.unknownReward', { quest: q.id, id }); continue; }
      if (!addItem(ch.inv, INV_W, INV_H, it, D).ok) W.dropToGround(p.zone, p.x, p.y, { item: it }, new Set([ch.id]));
    }
    if (r.xp) W.grantXp(p, Number(r.xp) || 0);
    W.sys(s, `依頼「${q.name}」を終えました。`);
    if (q.lines?.done) {
      const g = [...p.zone.npcs].find((e) => giversOf(q).includes(e.npcId));
      if (g) W.send(s, { t: 'dialog', npc: g.id, npcId: g.npcId, name: D.npcs[g.npcId]?.name ?? g.name, text: q.lines.done, options: [] });
    }
    W.log.server('questDone', { c: ch.id, q: q.id });
    s.dirty.quests = true;
    W.markDirty(p, 'inv'); W.markDirty(p, 'tree'); W.markDirty(p, 'skills');
    return 'ok';
  }
  return fail(W, s, 'badMsg');
}

/* ---------------- 移動（巻物・入口・起き上がる） ---------------- */
function portal(W, s, m = {}) {
  const p = s.player, ch = s.char;
  if (p.dead) return fail(W, s, 'dead');
  if (p.zone.map.safe) return fail(W, s, 'inTown');
  const f = m.viaItem ?? findConsumable(W, ch, 'portal');
  if (!f) return fail(W, s, 'noScroll');
  consumeOne(ch, f);
  ch.returnTo = { map: p.zone.id, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  W.transfer(p, W.townId(), null, null, 'scroll');
  W.sys(s, '帰還の巻物で町へ戻りました。ワープの番人に話すと、元の場所へ戻れます。');
  W.markDirty(p, 'inv');
  return 'ok';
}
function warp(W, s, m) {
  const p = s.player, ch = s.char;
  if (!isStr(m.id)) return fail(W, s, 'badMsg');
  if (p.dead) return fail(W, s, 'dead');
  if (m.id === 'return') {
    if (!p.zone.map.safe || !ch.returnTo || !W.data.maps[ch.returnTo.map]) return fail(W, s, 'noReturn');
    const r = ch.returnTo;
    ch.returnTo = null;
    W.transfer(p, r.map, r.x, r.y, 'return');
    return 'ok';
  }
  const q = p.zone.map.portals.find((x) => x.id === m.id);
  if (!q) return fail(W, s, 'noPortal');
  if (portalClosed(W, p.zone, q)) return fail(W, s, 'portalClosed');
  if (Math.hypot(p.x - q.x, p.y - q.y) > portalReach(q)) {
    p.action = { type: 'warp', portal: q.id, at: { x: q.x, y: q.y }, id: null, range: portalReach(q) - 0.2 };
    p.path = W.pathFor(p.zone, p, q.x, q.y);
    if (!p.path) { p.action = null; return fail(W, s, 'noPath'); }
    return 'ok:approach';
  }
  return usePortalNow(W, p, q.id);
}
const portalReach = (q) => Math.max(2.2, (Number(q.r) || 0) + 1);
// opensAfter: その魔物がこの区域で生きている間（湧き直したあとも）は閉じている
function portalClosed(W, zone, q) {
  if (!q.opensAfter) return false;
  if (!zone.populated) return true;
  for (const a of zone.actors) if (a.kind === 'monster' && !a.dead && (a.def?.id === q.opensAfter)) return true;
  return false;
}
export function usePortalNow(W, p, portalId) {
  const s = p.session;
  const q = p.zone.map.portals.find((x) => x.id === portalId);
  if (!q || !q.to?.map || !W.data.maps[q.to.map]) return fail(W, s, 'noPortal');
  if (portalClosed(W, p.zone, q)) return fail(W, s, 'portalClosed');
  const dest = W.data.maps[q.to.map];
  let x = q.to.x ?? null, y = q.to.y ?? null;
  if (q.to.portal) {
    const back = dest.portals.find((o) => o.id === q.to.portal);
    if (back) {
      // 着いた先の入口の上に立つと、すぐ戻ってしまうように見えるので、地図の内側へ 1.5 マスずらす
      const dx = dest.w / 2 - back.x, dy = dest.h / 2 - back.y, d = Math.hypot(dx, dy) || 1;
      const pos = nearestWalkable(dest, back.x + (dx / d) * 1.5, back.y + (dy / d) * 1.5, 4) ?? { x: back.x, y: back.y };
      x = pos.x; y = pos.y;
    }
  }
  W.transfer(p, dest.id, x, y, `portal:${portalId}`);
  return 'ok';
}
function respawn(W, s) {
  const p = s.player;
  if (!p.dead) return fail(W, s, 'notDead');
  p.dead = false; p.hp = p.maxHp; p.mana = manaCap(p); p.anim = 0;
  const town = W.townId();
  const e = W.data.maps[town].entry;
  if (p.zone.id === town) p.zone.moveTo(p, e.x, e.y);
  else { p.untargetable = true; W.transfer(p, town, e.x, e.y, 'respawn'); } // 町へ移るまでの間に打たれない
  for (const o of W.sessions) o.known.delete(p.id);
  W.markDirty(p);
  return 'ok';
}
