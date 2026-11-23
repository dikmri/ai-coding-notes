// 通し遊びの台本（設計書 §15 の完成の条件を順に確かめる）。画面なしの Chrome で ?debug=1 を開き、
// マウスとキーで遊び、足りない所（レベル・品・ワープ・時間の速さ）は確かめ用の命令で補う。
// 使い方: 先に `node tools/serve.mjs 8775` を動かし、`node kanenaki/tools/playthrough.mjs [--port 8775] [--shots <写真の置き場>] [--skip-solo | --solo-only]`
// 最後の「1 人で鐘守りの亡者を倒す」場面（戦士・司祭・ネクロマンサー）は、倒れない設定を使わない。確かめ用の命令は Lv・装備の抽選・時間の速さだけ。
// 結果: 条件ごとの ○×、写真（幅 1280 と 800）、<写真の置き場>/playthrough.json。終わると Chrome を閉じる。
import { openBrowser } from '../../tools/lib/cdp.mjs';
import { writeFileSync, mkdirSync, rmSync, statSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../sim/data.mjs';
import { planSkillUps, pickTreeNodes, decide, RANGED } from '../sim/fixtures/solo.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('--port', 8775);
const SHOTS = arg('--shots', 'D:/soft/dekiru-html/runtime/kanenaki-shots');
const PROFILE = join(SHOTS, '.profile');
const PROFILE_SOLO = join(SHOTS, '.profile-solo');
const SOLO_ONLY = process.argv.includes('--solo-only'), SKIP_SOLO = process.argv.includes('--skip-solo');
const SOLO_CLASSES = arg('--solo-classes', 'warrior,priest,necromancer').split(',');
const URL0 = `http://localhost:${PORT}/kanenaki/?debug=1`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_LOG = join(ROOT, 'logs', 'app.log');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(SHOTS, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true }); // 前の保存を残さない（新しく作るところから確かめる）
rmSync(PROFILE_SOLO, { recursive: true, force: true });
const logStart = existsSync(APP_LOG) ? statSync(APP_LOG).size : 0;

const results = [];
const note = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '○' : '×'} ${name}${detail ? `  ${detail}` : ''}`); };
const info = (...a) => console.log('  ', ...a);

let page = null;
const errorsSeen = [];
const K = (body) => page.evaluate(`(() => { const K = window.__kanenaki, G = K.game.g; ${body} })()`);
async function waitFor(cond, ms = 15000, step = 100) {
  for (let t = 0; t < ms; t += step) { if (await K(`return !!(${cond});`)) return true; await sleep(step); }
  return false;
}
const send = (m) => K(`return K.send(${JSON.stringify(m)});`);
const dbg = (op, a = {}) => K(`return K.debug(${JSON.stringify(op)}, ${JSON.stringify(a)});`);
async function shot(name) {
  const file = join(SHOTS, `${page.width}-${name}.png`);
  await sleep(250);
  writeFileSync(file, Buffer.from(await page.screenshot(), 'base64'));
  info('写真', file);
}
async function open(width, height, profile = PROFILE) {
  page = await openBrowser({ width, height, profile });
  info('Chrome', `pid ${page.pid}`, `${width}x${height}`);
  await page.navigate(URL0);
  if (!(await waitFor("window.__kanenaki && document.getElementById('title')?.open && document.querySelector('#title [data-act]')", 20000))) throw new Error('題名の画面が出ない');
  // 受け取った S2C（位置以外）を数えるための記録
  await K(`if (!window.__pt) { window.__pt = { rec: [], n: 0, lastSt: 0 }; const g = K.game; const orig = g.handle; g.handle = (m) => { if (m.t === 'me' && m.hp != null) { const mx = m.maxHp ?? G.me.maxHp; if (mx) __pt.minHpPct = Math.min(__pt.minHpPct ?? 100, (100 * m.hp) / mx); } if (m.t === 'snap') __pt.lastSt = m.st; else if (m.t !== 'spawn' && m.t !== 'me' && m.t !== 'save') { __pt.rec.push({ ...m, _n: __pt.n++ }); if (__pt.rec.length > 30000) __pt.rec.splice(0, 10000); } return orig(m); }; } return true;`);
}
async function close() { if (!page) return; errorsSeen.push(...page.consoleErrors); await page.close(); page = null; }
const mark = () => K('return __pt.n;');
const recSince = (n, filter = 'true') => K(`return __pt.rec.filter((m) => m._n >= ${n} && (${filter}));`);
const me = () => K('return { ...G.me, x: G.pred.x, y: G.pred.y, map: G.mapId, dead: G.dead, inv: G.inv.items.length, stash: (G.inv.stash || []).length, gold: G.inv.gold, cls: G.me.cls, id: G.meId };');

// 画面の上の物を押す（HUD の部品が重なっていたら押さずに false）
async function clickWorld(x, y, lift = 0, opts = {}) {
  const p = await K(`return K.renderer.toCss(${x}, ${y}, ${lift});`);
  if (!p || p.x < 4 || p.y < 4 || p.x > page.width - 4 || p.y > page.height - 4) return false;
  const hit = await page.evaluate(`(() => { const el = document.elementFromPoint(${p.x}, ${p.y}); return !!el && !!el.closest('#stage'); })()`);
  if (!hit) return false;
  await page.click(p.x, p.y, opts);
  return true;
}
async function clickEnt(id, lift = 7) {
  const q = await K(`const e = G.ents.get(${id}); if (!e) return null; return K.game.entPos(e);`);
  return q ? clickWorld(q.x, q.y, lift) : false;
}
async function hoverEnt(id, lift = 7) {
  const q = await K(`const e = G.ents.get(${id}); if (!e) return null; const p = K.game.entPos(e); return K.renderer.toCss(p.x, p.y, ${lift});`);
  if (q) await page.move(q.x, q.y);
  return !!q;
}
// DOM の部品を本物のマウスで押す
async function clickEl(sel, text = null) {
  const r = await page.evaluate(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.offsetParent !== null || e.getClientRects().length); const el = ${text ? `els.find((e) => e.textContent.includes(${JSON.stringify(text)}))` : 'els[0]'}; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (!r) return false;
  await page.click(r.x, r.y);
  return true;
}
const nearestMonster = (r = 24, ids = null) => K(`let best = null, bd = ${r}; for (const e of G.ents.values()) { if (e.kind !== 'monster' || e.anim === 5 || e.raw?.team === 'p' || e.raw?.owner${ids ? ` || !${JSON.stringify(ids)}.includes(e.raw?.art)` : ''}) continue; const d = Math.hypot(e.x - G.pred.x, e.y - G.pred.y); if (d < bd) { bd = d; best = { id: e.id, art: e.art, name: e.name, d, boss: !!e.raw?.boss }; } } return best;`);
const alive = (id) => K(`const e = G.ents.get(${id}); return !!e && e.anim !== 5;`);

// スキルを 1 つ上げて枠に割り当て、的にカーソルを置いてキーで使う。世界から cast の知らせが届けば使えた
async function trySkill(sk, key) {
  await send({ t: 'skillUp', s: sk.id });
  await send({ t: 'bind', slot: key, s: sk.id });
  await waitFor(`G.skills.binds[${JSON.stringify(key)}] === ${JSON.stringify(sk.id)} && (G.skills.ranks[${JSON.stringify(sk.id)}] || 0) >= 1`, 3000, 50);
  await dbg('heal');
  // 的: 近くに生きた魔物（気絶させてこない鴉）。亡骸が要るスキルは 1 体倒しておく
  if (!(await nearestMonster(6))) { await dbg('spawn', { id: 'carrion_crow', n: 2, level: 30 }); await sleep(300); }
  if (sk.corpse) { await dbg('spawn', { id: 'bone_soldier', n: 1 }); await sleep(200); await dbg('killAll', { r: 4 }); await sleep(300); }
  await waitFor('Object.keys(G.skills.cds || {}).length === 0', 2000, 50);
  const tgt = await nearestMonster(8);
  const aim = async () => { if (tgt && (await alive(tgt.id))) await hoverEnt(tgt.id, 7); else await page.move(page.width / 2 + 60, page.height / 2); };
  const n0 = await mark();
  let ok = false, errs = [];
  // 気絶・詠唱中などで使えなかったときは、少し待って押し直す（3 回まで）
  for (let tries = 0; tries < 3 && !ok; tries++) {
    if (tries) { await dbg('heal'); await sleep(700); }
    await aim();
    const n1 = await mark();
    await page.key(key);
    for (let t = 0; t < 2500 && !ok; t += 150) {
      await sleep(150);
      const rs = await recSince(n1, `(m.t === 'fx' && m.k === 'cast' && m.s === ${JSON.stringify(sk.id)}) || m.t === 'err'`);
      ok = rs.some((m) => m.t === 'fx');
      errs = rs.filter((m) => m.t === 'err').map((m) => m.code);
      if (errs.length) break;
    }
  }
  await sleep(500);
  const fx = (await recSince(n0, "m.t === 'fx' && (m.k === 'dmg' || m.k === 'vfx' || m.k === 'heal' || m.k === 'cc')")).length;
  return { ok, errs, fx };
}

// 拾った物で持ち物が詰まっていたら、大きな装備品から地面に置いて場所を空ける（品物を押した一覧の「地面に置く」と同じ命令）
async function makeRoom() {
  const used = await K('return G.inv.items.reduce((a, i) => a + (i.w || 1) * (i.h || 1), 0);');
  if (used <= 36) return;
  for (const uid of await K("return G.inv.items.filter((i) => !i.consumable).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 6).map((i) => i.uid);")) await send({ t: 'inv', op: 'drop', item: uid });
  await sleep(300);
}
// 1 体を押して倒すまで待つ。体力が減ったら Z（回復薬）、無ければ確かめ用の全回復
async function fightOne(id, maxMs = 25000, { skills = [], every = 3 } = {}) {
  const n0 = await mark();
  if (!(await clickEnt(id))) await send({ t: 'attack', id });
  const t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(200);
    k++;
    if (!(await alive(id))) break;
    const v = await K('return K.game.vitals();');
    if (await K('return G.dead;')) { await dbg('heal'); await sleep(300); if (!(await clickEnt(id))) await send({ t: 'attack', id }); continue; }
    if (v.life < v.lifeMax * 0.5) { const hasPot = await K("return G.inv.items.some((i) => K.data.baseById[i.base]?.key === 'Z');"); if (hasPot) await page.key('z'); else await dbg('heal'); }
    if (skills.length && k % every === 0) { await hoverEnt(id); await page.key(skills[Math.floor(k / every) % skills.length]); }
    // 別の物を押してしまったときや、相手が離れたときのために、ときどき押し直す
    if (k % 10 === 0 && (await alive(id))) { if (!(await clickEnt(id))) await send({ t: 'attack', id }); }
  }
  const died = (await recSince(n0, `m.t === 'fx' && m.k === 'death' && m.id === ${id}`)).length > 0;
  return died;
}
async function walkTo(x, y, maxMs = 20000, near = 1.5) {
  await send({ t: 'move', x, y });
  return waitFor(`Math.hypot(G.pred.x - ${x}, G.pred.y - ${y}) < ${near}`, maxMs);
}
async function usePortal(id, map, maxMs = 30000) {
  // 見えていれば出入口を押す。見えていなければ同じ命令（warp）を送る。どちらも世界の計算が歩いて近づく
  const q = await K(`return G.portals.find((p) => p.id === ${JSON.stringify(id)}) || null;`);
  let clicked = false;
  if (q && Math.hypot(q.x - (await K('return G.pred.x;')), q.y - (await K('return G.pred.y;'))) < 9) clicked = await clickWorld(q.x, q.y, 0);
  if (!clicked) await send({ t: 'warp', id });
  return waitFor(`G.mapId === ${JSON.stringify(map)}`, maxMs);
}
async function talkTo(npcId, maxMs = 15000) {
  const find = () => K(`for (const e of G.ents.values()) if (e.kind === 'npc' && e.raw?.npc === ${JSON.stringify(npcId)}) return { id: e.id, x: e.x, y: e.y }; return null;`);
  let e = await find();
  if (!e) {
    // 見えない所にいる人は、地図のデータの場所の近くまで歩いてから
    const at = await K(`const n = (K.data.maps[G.mapId]?.npcs || []).find((n) => n.id === ${JSON.stringify(npcId)}); return n ? { x: n.x + 0.5, y: n.y + 2.5 } : null;`);
    if (!at) return false;
    await walkTo(at.x, at.y, 20000, 6);
    e = await find();
    if (!e) return false;
  }
  const n0 = await mark();
  const d = await K(`return Math.hypot(G.pred.x - ${e.x}, G.pred.y - ${e.y});`);
  if (!(d < 12 && (await clickEnt(e.id, 8)))) await send({ t: 'talk', npc: e.id });
  for (let t = 0; t < maxMs; t += 150) {
    await sleep(150);
    if ((await recSince(n0, "m.t === 'dialog'")).length) return true;
    if (t === 3000) await send({ t: 'talk', npc: e.id }); // 押した所が人から外れて歩いただけのときは、同じ命令を送り直す
  }
  return false;
}

/* ---------------- 1 人で戦う場面の道具 ---------------- */
// 職ごとに、人の手（decide）が使うスキルを 1〜4 のキーへ割り当てる
const SOLO_KEYS = {
  warrior: ['war_cleave', 'war_stomp', 'war_bloodlust', 'war_rock_skin'],
  priest: ['pri_holy_bolt', 'pri_judgment', 'pri_mend', 'pri_holy_shield'],
  necromancer: ['nec_bone_stake', 'nec_grave_raise', 'nec_bone_mantle'],
  swordsman: ['swd_cross_slash', 'swd_iai', 'swd_lunge'],
  rogue: ['rog_fan_knives', 'rog_backstab'],
  monk: ['mnk_palm_wave', 'mnk_flurry', 'mnk_stance_fire', 'mnk_chakra'],
  adventurer: [],
};
// 画面が持っている今の様子（人の手を決める材料）を 1 回で読む。時刻は performance.now()
const soloView = () => K(`const now = performance.now();
  const cds = {}; for (const [k, v] of Object.entries(G.skills.cds || {})) if (v.until > now) cds[k] = v.until - now;
  const foes = []; let boss = null;
  for (const e of G.ents.values()) { if (e.kind !== 'monster' || e.anim === 5 || e.raw?.team === 'p' || e.raw?.owner) continue; const d = Math.hypot(e.x - G.pred.x, e.y - G.pred.y); foes.push({ id: e.id, x: e.x, y: e.y, d }); if (e.raw?.boss) boss = { id: e.id, x: e.x, y: e.y, d }; }
  foes.sort((a, b) => a.d - b.d);
  return { now, map: G.mapId, st: __pt.lastSt, speed: G.speed,
    me: { x: G.pred.x, y: G.pred.y, hp: G.me.hp ?? 0, maxHp: G.me.maxHp ?? 1, mana: G.me.mana ?? 0, maxMana: G.me.maxMana ?? G.me.stats?.mana ?? 0, dead: G.dead, cds, ranks: G.skills.ranks || {}, stance: (G.me.statuses || []).some((s) => s.kind === 'stance') },
    boss, foes, warns: G.warns.filter((w) => w.hostile && w.until > now),
    minions: [...G.ents.values()].filter((e) => e.raw?.owner === G.meId && e.anim !== 5).length,
    potions: G.inv.items.filter((i) => K.data.baseById[i.base]?.key === 'Z').reduce((a, i) => a + (i.qty || 1), 0),
    manaPotions: G.inv.items.filter((i) => K.data.baseById[i.base]?.key === 'X').reduce((a, i) => a + (i.qty || 1), 0) };`);
// 人の手を、画面の操作（キー・マウス）か、それと同じ命令で行う
async function soloAct(cls, a, st, now) { // now は画面の performance.now()（soloView と同じ時計。Node の時計と混ぜない）
  if (!a) return;
  if (a.t === 'potion') { await page.key('z'); st.potionReadyAt = now + 700; return; }
  if (a.t === 'mana') { await page.key('x'); st.potionReadyAt = now + 700; return; }
  if (a.t === 'move') { await send({ t: 'move', x: +a.x.toFixed(2), y: +a.y.toFixed(2) }); st.lastMoveAt = now; st.attacking = null; return; }
  if (a.t === 'attack') {
    if (st.attacking !== a.id || performance.now() - (st.attackAt ?? 0) > 3000) { if (!(await clickEnt(a.id))) await send({ t: 'attack', id: a.id }); st.attacking = a.id; st.attackAt = performance.now(); }
    return;
  }
  if (a.t === 'cast') {
    const k = SOLO_KEYS[cls].indexOf(a.s);
    if (k < 0) return;
    st.attacking = null;
    // 狙う相手か地点にカーソルを置いてキーを押す（画面の castSlot が、指している敵かカーソルの位置へ使う）
    const p = await K(`return K.renderer.toCss(${a.x}, ${a.y}, ${a.id ? 7 : 0});`);
    if (p && p.x > 4 && p.y > 4 && p.x < page.width - 4 && p.y < page.height - 4) await page.move(p.x, p.y);
    await page.key(String(k + 1));
  }
}
// 倒れたら町で目を覚ます
async function soloRespawn(st) {
  st.travelDeaths++;
  await clickEl('#death button.primary');
  await waitFor('!G.dead', 5000);
  await sleep(800);
}
// 近くの敵と戦いながら、出入口を使って次の地図へ進む
async function soloTravel(cls, portal, map, st, maxMs = 150000) {
  const t0 = Date.now();
  let lastWarp = 0;
  while (Date.now() - t0 < maxMs) {
    const v = await soloView();
    if (v.map === map) return true;
    if (v.me.dead) { await soloRespawn(st); return false; }
    const foe = v.foes.find((f) => f.d < 6);
    if (foe) { await soloAct(cls, decide(cls, { ...v, boss: foe, potionReadyAt: st.potionReadyAt, lastMoveAt: st.lastMoveAt }, SD.skills), st, v.now); lastWarp = 0; }
    else if (Date.now() - lastWarp > 2500) { await send({ t: 'warp', id: portal }); st.attacking = null; lastWarp = Date.now(); }
    await sleep(60);
  }
  return false;
}
// 1 人のキャラを作り、試験を受けて転職し、装備を抽選し、スキルとツリーを上げ、薬を買って、鐘楼 3 階まで歩いてボスと戦う
async function soloBoss(cls, slot) {
  const st = { potionReadyAt: 0, lastMoveAt: 0, attacking: null, travelDeaths: 0 };
  if (!(await waitFor("document.getElementById('title')?.open && document.querySelector('#title [data-act]')", 20000))) throw new Error('題名の画面が出ない');
  await clickEl(`#title [data-act="new"][data-slot="${slot}"]`);
  await waitFor("document.querySelector('#title [data-act=\"create\"]')", 10000);
  await clickEl('#title [data-act="create"]');
  if (!(await waitFor("G.welcomed && G.mapId === 'town' && !document.getElementById('title').open", 15000))) throw new Error('作れない');
  // Lv24 にして、冒険者の武器で試験を受ける（確かめ用の命令は Lv・装備の抽選・時間の速さだけ）
  await dbg('level', { n: 24 });
  await dbg('gear');
  await sleep(300);
  if (!(await talkTo('npc_master_swordsman'))) throw new Error('剣の師範と話せない');
  await clickEl('.panel-talk .talk-options button', '転職の試験');
  await sleep(300);
  await usePortal('town_east', 'road', 40000);
  await dbg('speed', { n: 4 });
  // 骨の兵と投石兵の湧く場所を回って倒す
  const spots = await K("return G.map.spawns.filter((s) => s.monsters.includes('bone_soldier') || s.monsters.includes('mud_imp_slinger')).map((s) => ({ x: s.x, y: s.y }));");
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < 180000; i++) {
    if (await K("return G.quests.find((q) => q.id === 'q_trial')?.state === 'ready';")) break;
    const v = await soloView();
    if (v.me.dead) { await soloRespawn(st); await usePortal('town_east', 'road', 40000); continue; }
    const foe = v.foes.find((f) => f.d < 9);
    if (foe) await soloAct('adventurer', decide('adventurer', { ...v, boss: foe, potionReadyAt: st.potionReadyAt }, SD.skills), st, v.now);
    else { const sp = spots[Math.floor(i / 25) % spots.length]; await send({ t: 'move', x: sp.x, y: sp.y }); st.attacking = null; await sleep(500); }
    await sleep(150);
  }
  if (!(await K("return G.quests.find((q) => q.id === 'q_trial')?.state === 'ready';"))) throw new Error('転職の試験を終えられない');
  await page.key('t');
  if (!(await waitFor("G.mapId === 'town'", 6000))) await usePortal('road_west', 'town', 60000);
  await dbg('speed', { n: 2 });
  await talkTo('npc_master_swordsman');
  await clickEl('.panel-talk .talk-options button', '報告する');
  await sleep(500);
  await talkTo(`npc_master_${cls}`);
  await clickEl('.panel-talk .talk-options button', '転職する');
  await waitFor("K.panels.isOpen('classChange')", 3000);
  await clickEl('.panel-classChange .cc-card button'); await sleep(200); await clickEl('.panel-classChange .cc-card button');
  if (!(await waitFor(`G.me.cls === ${JSON.stringify(cls)}`, 5000))) throw new Error('転職できない');
  // 装備を抽選し（売るための品も 6 つ）、スキルとツリーを素直に上げ、キーへ割り当てる
  await dbg('gear', { extra: 6 });
  await sleep(400);
  const ranks = await K('return G.skills.ranks;');
  const pts = await K('return G.skills.points;');
  for (const sid of planSkillUps(cls, SD.skills, ranks, 24, pts)) await send({ t: 'skillUp', s: sid });
  for (const [k, sid] of SOLO_KEYS[cls].entries()) await send({ t: 'bind', slot: String(k + 1), s: sid });
  const alloc = await K('return [...G.tree.alloc];');
  const tp = await K('return G.tree.points;');
  for (const id of pickTreeNodes(SD.tree, alloc, cls, tp)) await send({ t: 'alloc', node: id });
  await sleep(300);
  // 薬師で、要らない品を売り、大きな回復薬を買う（店の「5 個」を押す）。離れて戦う職（司祭・ネクロマンサー）は大きな魔力の薬も 10 個
  await talkTo('npc_apothecary');
  await clickEl('.panel-talk .talk-options button', '品物を見る');
  await waitFor("K.panels.isOpen('shop')", 3000);
  const npcId = await K("for (const e of G.ents.values()) if (e.kind === 'npc' && e.raw?.npc === 'npc_apothecary') return e.id; return null;");
  for (const uid of await K('return G.inv.items.filter((i) => !i.consumable).map((i) => i.uid);')) await send({ t: 'inv', op: 'sell', item: uid, npc: npcId });
  await sleep(400);
  const buyList = [['大きな回復薬', 3], ...(RANGED.has(cls) ? [['大きな魔力の薬', 2]] : [])];
  for (const [label, times] of buyList) for (let k = 0; k < times; k++) {
    const ok = await page.evaluate("(() => { const li = [...document.querySelectorAll('.panel-shop .shop-list li')].find((l) => l.textContent.includes('" + label + "')); const b = li && [...li.querySelectorAll('button.buy')].find((x) => x.textContent.includes('5')); if (!b || b.disabled) return false; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
    if (!ok) break;
    await page.click(ok.x, ok.y);
    await sleep(300);
  }
  // 窓を閉じる（最初の Esc は説明の吹き出しを消すだけのことがある）
  for (let k = 0; k < 4 && (await K('return K.panels.anyOpen() || false;')); k++) { await page.key('Escape'); await sleep(150); }
  const potionsBought = await K("return G.inv.items.filter((i) => i.base === 'potion_life_big').reduce((a, i) => a + (i.qty || 1), 0);");
  const manaBought = await K("return G.inv.items.filter((i) => i.base === 'potion_mana_big').reduce((a, i) => a + (i.qty || 1), 0);");
  const weapon = await K('return G.inv.equip.weapon?.name ?? null;');
  info(cls, '武器', weapon, '大きな回復薬', potionsBought, '大きな魔力の薬', manaBought, 'お金', await K('return G.inv.gold;'));
  // 鐘楼 3 階まで歩く（途中の魔物とは戦う。倒れたら町から、行ったことのある場所までワープの番人で戻る）
  await dbg('speed', { n: 2 });
  const legs = [['town_east', 'road'], ['road_east', 'bog'], ['bog_tower', 'tower1'], ['tower1_down', 'tower2'], ['tower2_down', 'tower3']];
  const WARP_LABEL = { road: '枯れ野の街道へ', bog: '霧沼へ', tower1: '沈んだ鐘楼 1 階へ', tower2: '沈んだ鐘楼 2 階へ', tower3: '沈んだ鐘楼 3 階へ' };
  for (const [portal, map] of legs) {
    let ok = false;
    for (let tries = 0; tries < 4 && !ok; tries++) {
      const cur = await K('return G.mapId;');
      const prev = legs[legs.findIndex((l) => l[1] === map) - 1]?.[1];
      if (cur === 'town' && prev) { // 倒れて町に戻ったとき
        await talkTo('npc_warp');
        await clickEl('.panel-talk .talk-options button', WARP_LABEL[prev]);
        await waitFor(`G.mapId === ${JSON.stringify(prev)}`, 8000);
      }
      ok = await soloTravel(cls, portal, map, st);
    }
    if (!ok) throw new Error(`${map} へ着けない`);
    info(cls, `${map} へ着いた`);
  }
  // ボスを探す
  await dbg('speed', { n: 2 });
  const spawn = await K("return G.map.spawns.find((s) => s.monsters.includes('bell_warden')) || null;");
  let boss = null;
  for (let t = 0; t < 150000 && !boss; t += 100) {
    const v = await soloView();
    if (v.boss && v.boss.d < 12) { boss = v.boss; break; } // 遠くに見えただけでは始めない（壁の向こうのことがある）
    if (v.boss && !v.foes.some((f) => f.d < 6) && t % 1500 === 0) { await send({ t: 'move', x: v.boss.x, y: v.boss.y }); st.attacking = null; await sleep(100); continue; }
    if (v.me.dead) {
      await soloRespawn(st);
      await talkTo('npc_warp');
      await clickEl('.panel-talk .talk-options button', WARP_LABEL.tower3);
      if (!(await waitFor("G.mapId === 'tower3'", 8000))) throw new Error('3 階へ戻れない');
      continue;
    }
    const foe = v.foes.find((f) => f.d < 6);
    if (foe) await soloAct(cls, decide(cls, { ...v, boss: foe, potionReadyAt: st.potionReadyAt, lastMoveAt: st.lastMoveAt }, SD.skills), st, v.now);
    else if (t % 2000 === 0) { await send({ t: 'move', x: spawn.x, y: spawn.y }); st.attacking = null; }
    await sleep(100);
  }
  if (!boss) throw new Error('ボスが見つからない');
  // ボスと戦う（時間の速さ ×1。人の手は 0.1 秒ほどごと。×2 だと台本の手が遅れて、人より不利になる）
  await dbg('speed', { n: 1 });
  await K('__pt.minHpPct = 100; return true;');
  const manaCount = () => K("return G.inv.items.filter((i) => /potion_mana/.test(i.base)).reduce((a, i) => a + (i.qty || 1), 0);");
  const mana0 = await manaCount();
  const n0 = await mark();
  const st0 = await K('return __pt.lastSt;');
  let shotDone = false, win = false, died = false;
  const tB = Date.now();
  let lastBoss = boss, lastChase = 0;
  while (Date.now() - tB < 300000) {
    const v = await soloView();
    if (v.me.dead) { died = true; break; }
    if (!v.boss && (await recSince(n0, `m.t === 'fx' && m.k === 'death' && m.id === ${boss.id}`)).length) { win = true; break; }
    if (v.boss) lastBoss = v.boss;
    // ボスが見えないときは、近くの敵だけ相手にし、いなければ最後に見えた場所へ向かう（周りの魔物を倒し続けない）
    const near = v.foes.find((f) => f.d < 6);
    const tgt = v.boss ?? near ?? null;
    if (!v.boss && !near && Date.now() - lastChase > 1500) { await send({ t: 'move', x: lastBoss.x, y: lastBoss.y }); st.attacking = null; lastChase = Date.now(); }
    if (tgt) await soloAct(cls, decide(cls, { ...v, boss: tgt, potionReadyAt: st.potionReadyAt, lastMoveAt: st.lastMoveAt }, SD.skills), st, v.now);
    if (!shotDone && Date.now() - tB > 9000 && ((v.boss && v.boss.d < 7) || Date.now() - tB > 60000)) { await shot(`solo-${cls}`); shotDone = true; } // ボスが近くに写るときに撮る
    await sleep(30); // 人はキーを押し続けて次々に使う。台本は 1 回ずつ押すので、間を短くして近づける
  }
  const st1 = await K('return __pt.lastSt;');
  const potions = (await recSince(n0, "m.t === 'fx' && m.k === 'heal' && m.potion && m.id === K.game.g.meId")).length;
  const minHpPct = Math.round(await K('return __pt.minHpPct ?? 100;'));
  const manaUsed = mana0 - (await manaCount());
  await dbg('speed', { n: 1 });
  // 開いた出口で町へ帰り、題名へ戻る（次の職は次の枠で作る）
  if (win) await usePortal('tower3_exit', 'town', 40000);
  if (await K('return G.dead;')) await clickEl('#death button.primary');
  for (let k = 0; k < 6 && !(await K('return K.menus.pauseOpen;')); k++) { await page.key('Escape'); await sleep(200); } // 窓が開いていれば、先に閉じてから止める
  await clickEl('#pause [data-act="quit"]');
  await sleep(1500);
  await waitFor("window.__kanenaki && document.getElementById('title')?.open", 20000);
  await K("if (!window.__pt) { window.__pt = { rec: [], n: 0, lastSt: 0 }; const g = K.game; const orig = g.handle; g.handle = (m) => { if (m.t === 'me' && m.hp != null) { const mx = m.maxHp ?? G.me.maxHp; if (mx) __pt.minHpPct = Math.min(__pt.minHpPct ?? 100, (100 * m.hp) / mx); } if (m.t === 'snap') __pt.lastSt = m.st; else if (m.t !== 'spawn' && m.t !== 'me' && m.t !== 'save') { __pt.rec.push({ ...m, _n: __pt.n++ }); if (__pt.rec.length > 30000) __pt.rec.splice(0, 10000); } return orig(m); }; } return true;");
  return { cls, win: win && !died, died, simS: Math.round((st1 - st0) / 100) / 10, minHpPct, potions, potionsBought, manaUsed, manaBought, travelDeaths: st.travelDeaths, weapon };
}

const T0 = Date.now();
const SD = await loadData({ fallbackUrl: null }); // 1 人で戦う場面のスキルとツリーの選び方に使う（世界の計算と同じ整えたデータ）
const soloResults = [];
try {
  if (!SOLO_ONLY) {
  /* ============ 1. キャラを作る ============ */
  await open(1280, 800);
  await shot('title');
  await clickEl('#title [data-act="new"]');
  await waitFor("document.querySelector('#title [data-act=\"create\"]')", 10000);
  await clickEl('#title [data-act="reroll"]');
  await sleep(300);
  await clickEl('#title [data-act="create"]');
  const created = await waitFor("G.welcomed && G.mapId === 'town' && G.meId != null && !document.getElementById('title').open", 15000);
  await sleep(800);
  const saved1 = await K("const s = JSON.parse(localStorage.getItem('kanenaki:save:v1') || 'null'); return s && s.slots[0] ? { v: s.v, name: s.slots[0].char.name } : null;");
  const m0 = await me();
  note('キャラを作る（名前を選んで作り、保存の枠 1 に入る）', created && saved1?.name === m0.name && saved1?.v === 1, `${m0.name} Lv${m0.level}`);
  await dbg('speed', { n: 2 });

  /* ============ 2. 町 ============ */
  const npcs = await K("return [...G.ents.values()].filter((e) => e.kind === 'npc').length;");
  const talked = await talkTo('npc_bellkeeper');
  await shot('town');
  await clickEl('.panel-talk .talk-bye');
  note('町（灰鐘の町に入り、町の人がいて話せる）', npcs >= 5 && talked, `見えている町の人 ${npcs} 人、鐘番の老人と話せた ${talked}`);

  /* ============ 3. 街道で戦う → 4. レベルが上がる ============ */
  const toRoad = await usePortal('town_east', 'road');
  await sleep(500);
  await dbg('speed', { n: 2 });
  let kills = 0, drops = 0;
  const spawns = await K('return G.map.spawns.map((s) => ({ x: s.x, y: s.y, m: s.monsters }));');
  const lv0 = (await me()).level;
  const nLoot = await mark();
  for (let round = 0; round < 40 && (await me()).level < lv0 + 1; round++) {
    let m = await nearestMonster(16);
    if (!m) {
      const p = await me();
      const sp = spawns.filter((s) => !s.m.includes('bog_wight')).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[round % 3];
      await walkTo(sp.x, sp.y, 15000, 3);
      m = await nearestMonster(16);
      if (!m) continue;
    }
    if (await fightOne(m.id)) kills++;
    if (round === 1) await shot('road');
    // 落ちた宝を押して拾う
    for (const it of await K("return [...G.ents.values()].filter((e) => e.kind === 'item' && Math.hypot(e.x - G.pred.x, e.y - G.pred.y) < 6).map((e) => ({ id: e.id, x: e.x, y: e.y }));")) {
      if (!(await clickWorld(it.x, it.y, 3))) await send({ t: 'pick', id: it.id });
      await sleep(500);
    }
  }
  drops = (await recSince(nLoot, "m.t === 'fx' && m.k === 'loot'")).length;
  const lv1 = (await me()).level;
  note('街道で戦う（街道へ歩いて入り、魔物を押して倒す）', toRoad && kills >= 3, `倒した数 ${kills}、宝を落とした回数 ${drops}`);
  note('レベルが上がる（倒した経験値で）', lv1 > lv0, `Lv${lv0} → Lv${lv1}`);

  /* ============ 5. Lv10 で転職（試験の依頼を受けて終え、師範の近くで選ぶ） ============ */
  await dbg('level', { n: 10 });
  await dbg('heal');
  // Lv10 のころには拾った武器を持っているはず。確かめ用の命令で希少の長剣を出して持たせる
  await dbg('item', { id: 'long_sword', rarity: 'rare' });
  await sleep(200);
  const lsUid = await K("return G.inv.items.find((i) => i.base === 'long_sword')?.uid;");
  if (lsUid) await send({ t: 'inv', op: 'equip', item: lsUid });
  await usePortal('road_west', 'town');
  await sleep(500);
  let ok5 = await talkTo('npc_master_swordsman');
  ok5 &&= await clickEl('.panel-talk .talk-options button', '転職の試験');
  await sleep(500);
  const trialActive = await K("return G.quests.some((q) => q.id === 'q_trial' && (q.state === 'active' || q.state === 'ready'));");
  await usePortal('town_east', 'road');
  await sleep(400);
  await dbg('god', { on: true });
  await dbg('speed', { n: 4 });
  await dbg('spawn', { id: 'bone_soldier', n: 5 });
  await dbg('spawn', { id: 'mud_imp_slinger', n: 5 });
  await sleep(400);
  for (let i = 0; i < 30; i++) {
    const q = await K("return G.quests.find((q) => q.id === 'q_trial');");
    if (q?.state === 'ready') break;
    const m = await nearestMonster(14, ['bone_soldier', 'mud_imp_slinger']);
    if (!m) { await dbg('spawn', { id: 'mud_imp_slinger', n: 2 }); await dbg('spawn', { id: 'bone_soldier', n: 2 }); await sleep(300); continue; }
    await fightOne(m.id, 20000);
  }
  await shot('combat');
  const trialReady = await K("return G.quests.find((q) => q.id === 'q_trial')?.state === 'ready';");
  await dbg('god', { on: false });
  await page.key('t'); // 帰還の巻物
  if (!(await waitFor("G.mapId === 'town'", 6000))) await usePortal('road_west', 'town', 40000); // 巻物が無ければ歩いて帰る
  await sleep(500);
  await talkTo('npc_master_swordsman');
  await clickEl('.panel-talk .talk-options button', '報告する');
  await sleep(600);
  await talkTo('npc_master_warrior');
  const ccOpt = await clickEl('.panel-talk .talk-options button', '転職する');
  await waitFor("K.panels.isOpen('classChange')", 3000);
  await clickEl('.panel-classChange .cc-card button');
  await sleep(200);
  await clickEl('.panel-classChange .cc-card button');
  const changed = await waitFor("G.me.cls === 'warrior'", 5000);
  // 門のマスは職が変わった後の知らせで届く。少し待つ
  const gate = await waitFor("[...G.tree.alloc].some((id) => K.data.tree.nodes[id]?.kind === 'gate')", 3000);
  note('Lv10 で転職（試験を受けて終え、戦の師範の所で戦士になる。門のマスをもらう）', ok5 && trialActive && trialReady && ccOpt && changed && gate, `試験 ${trialActive ? '受けた' : '受けていない'}→${trialReady ? '報告できた' : '途中'}、職 ${(await me()).cls}、師範と話す ${ok5 ? '○' : '×'}、転職を選ぶ ${ccOpt ? '○' : '×'}、門のマス ${gate ? '○' : '×'}`);

  /* ============ 6. 6 職の全スキル ============ */
  await dbg('warp', { map: 'road', x: 40.5, y: 64.5 });
  await waitFor("G.mapId === 'road'", 5000);
  await sleep(600);
  await dbg('god', { on: true });
  await dbg('speed', { n: 2 });
  const classes = ['swordsman', 'warrior', 'rogue', 'priest', 'necromancer', 'monk'];
  const skillReport = {};
  let allSkillsOk = true, totalSkills = 0, usedSkills = 0;
  const maxUnlock = await K('return Math.max(...Object.values(K.data.skills).map((s) => s.unlock || 1));');
  await dbg('level', { n: Math.max(30, maxUnlock) });
  for (const cls of classes) {
    await dbg('cls', { cls });
    await waitFor(`G.me.cls === ${JSON.stringify(cls)}`, 3000);
    await dbg('points', { skill: 400 });
    await sleep(300);
    const list = await K(`return (K.data.classes[${JSON.stringify(cls)}].skills || []).map((id) => { const s = K.data.skills[id]; return { id, name: s.name, target: s.target, corpse: !!(s.needsCorpse || (s.tags || []).includes('corpse')) }; });`);
    const rep = skillReport[cls] = { total: list.length, used: 0, fails: [] };
    for (const sk of list) {
      totalSkills++;
      const r = await trySkill(sk, '1');
      if (r.ok) { rep.used++; usedSkills++; } else { rep.fails.push(`${sk.name}(${r.errs.join(',') || '届かない'})`); allSkillsOk = false; }
      rep.fx = (rep.fx ?? 0) + r.fx;
    }
    if (cls === 'necromancer') await shot('skills');
    info(cls, `${rep.used}/${rep.total}`, rep.fails.join(' '));
  }
  // 冒険者のスキルも（転職後も使える）
  const adv = await K("return (K.data.classes.adventurer.skills || []).map((id) => { const s = K.data.skills[id]; return { id, name: s.name, target: s.target, corpse: false }; });");
  const advRep = skillReport.adventurer = { total: adv.length, used: 0, fails: [] };
  for (const sk of adv) {
    totalSkills++;
    const r = await trySkill(sk, '2');
    if (r.ok) { advRep.used++; usedSkills++; } else { advRep.fails.push(`${sk.name}(${r.errs.join(',') || '届かない'})`); allSkillsOk = false; }
    advRep.fx = (advRep.fx ?? 0) + r.fx;
  }
  info('adventurer', `${advRep.used}/${advRep.total}`, advRep.fails.join(' '));
  const fxTotal = Object.values(skillReport).reduce((a, r) => a + (r.fx ?? 0), 0);
  note('6 職の全スキル（キー 1・2 で使い、効果の印と数字が届く）', allSkillsOk, `${usedSkills}/${totalSkills} 個、効果の知らせ ${fxTotal} 件`);
  await dbg('cls', { cls: 'warrior' });
  await dbg('killAll', { r: 30 });

  /* ============ 7. ツリー ============ */
  await page.key('p');
  await waitFor("K.panels.isOpen('tree')", 3000);
  await sleep(500);
  const stats0 = await K('return JSON.stringify(G.me.stats || {});');
  const pts0 = await K('return G.tree.points;');
  const alloc0 = await K('return G.tree.alloc.size;');
  let took = 0;
  for (let i = 0; i < 4; i++) {
    await clickEl('.panel-tree .tree-side > button', '次の取れるマス');
    await sleep(250);
    await clickEl('.panel-tree .tree-info button.primary', '取る');
    await sleep(400);
    took = (await K('return G.tree.alloc.size;')) - alloc0;
  }
  await waitFor(`JSON.stringify(G.me.stats || {}) !== ${JSON.stringify(stats0)}`, 3000);
  const stats1 = await K('return JSON.stringify(G.me.stats || {});');
  await shot('tree');
  await page.key('Escape');
  note('ツリー（P で開き、取れるマスを押して取ると能力値が変わる）', took >= 3 && stats1 !== stats0 && pts0 > 0, `取ったマス +${took}`);

  /* ============ 8. 宝・装備・店・倉庫 ============ */
  const picked = await K("return G.inv.items.filter((i) => !i.consumable).length;");
  // 拾った物で持ち物が詰まっていたら、装備品をいくつか地面に置いて場所を空ける（品物を押した一覧の「地面に置く」と同じ命令）
  await makeRoom();
  await dbg('item', { id: 'chain_mail', rarity: 'rare' });
  await sleep(300);
  await page.key('i');
  await waitFor("K.panels.isOpen('inv')", 3000);
  await sleep(300);
  const armor0 = await K('return G.me.stats?.armor ?? 0;');
  const cmUid = await K("return G.inv.items.find((i) => i.base === 'chain_mail')?.uid;");
  await clickEl(`.panel-inv .item[data-uid="${cmUid}"]`);
  await sleep(200);
  await clickEl('#ctx .ctx-item', '装備する');
  const equipped = await waitFor("G.inv.equip.body?.base === 'chain_mail'", 3000);
  await waitFor(`(G.me.stats?.armor ?? 0) !== ${armor0}`, 3000);
  const armor1 = await K('return G.me.stats?.armor ?? 0;');
  await shot('inventory');
  await page.key('Escape');
  // 店（鍛冶屋で買って売る）
  await dbg('warp', { map: 'town' });
  await waitFor("G.mapId === 'town'", 5000);
  await sleep(600);
  await dbg('gold', { n: 2000 });
  await talkTo('npc_smith');
  await clickEl('.panel-talk .talk-options button', '品物を見る');
  await waitFor("K.panels.isOpen('shop')", 3000);
  await sleep(300);
  const g0 = await K('return G.inv.gold;');
  const inv0 = await K('return G.inv.items.length;');
  await clickEl('.panel-shop .shop-list button.buy');
  await waitFor(`G.inv.items.length > ${inv0}`, 3000);
  const g1 = await K('return G.inv.gold;');
  await shot('shop');
  const sellUid = await K(`return G.inv.items[G.inv.items.length - 1]?.uid;`);
  await clickEl(`.panel-inv .item[data-uid="${sellUid}"]`);
  await sleep(200);
  await clickEl('#ctx .ctx-item', '売る');
  await waitFor(`G.inv.gold > ${g1}`, 3000);
  const g2 = await K('return G.inv.gold;');
  await page.key('Escape');
  // 倉庫（宿屋で開いて入れて出す）
  await talkTo('npc_innkeeper');
  await clickEl('.panel-talk .talk-options button', '倉庫を開く');
  const stashOpen = await waitFor("K.panels.isOpen('stash')", 3000);
  await sleep(300);
  const stUid = await K("return G.inv.items.find((i) => !i.consumable)?.uid ?? G.inv.items[0]?.uid;");
  await clickEl(`.panel-inv .item[data-uid="${stUid}"]`);
  await sleep(200);
  await clickEl('#ctx .ctx-item', '倉庫へ入れる');
  const inStash = await waitFor(`(G.inv.stash || []).some((i) => i.uid === ${JSON.stringify(stUid)})`, 3000);
  await clickEl(`.panel-stash .item[data-uid="${stUid}"]`);
  await sleep(200);
  await clickEl('#ctx .ctx-item', '持ち物へ移す');
  const backInv = await waitFor(`G.inv.items.some((i) => i.uid === ${JSON.stringify(stUid)})`, 3000);
  await page.key('Escape');
  note('宝・装備（落ちた宝を拾い、鎖かたびらを押して装備すると防御が変わる）', drops > 0 && picked > 0 && equipped && armor1 > armor0, `拾った装備品 ${picked}、防御 ${armor0} → ${armor1}`);
  note('店（鍛冶屋で買って、売る）', g1 < g0 && g2 > g1, `お金 ${g0} → ${g1} → ${g2}`);
  note('倉庫（宿屋で開き、入れて出す）', stashOpen && inStash && backInv);

  /* ============ 9. 霧沼 ============ */
  await talkTo('npc_warp');
  const warpOpt = await clickEl('.panel-talk .talk-options button', '枯れ野の街道へ');
  await waitFor("G.mapId === 'road'", 8000);
  await sleep(400);
  await dbg('speed', { n: 8 });
  await dbg('god', { on: true });
  const toBog = await usePortal('road_east', 'bog', 40000);
  await dbg('speed', { n: 2 });
  await sleep(600);
  let bogKill = false;
  for (let i = 0; i < 6 && !bogKill; i++) {
    let m = await nearestMonster(18);
    if (!m) { const sp = await K('return G.map.spawns.map((s) => ({ x: s.x, y: s.y })).sort((a, b) => Math.hypot(a.x - G.pred.x, a.y - G.pred.y) - Math.hypot(b.x - G.pred.x, b.y - G.pred.y))[0];'); await walkTo(sp.x, sp.y, 15000, 4); m = await nearestMonster(18); }
    if (!m) continue;
    if (i === 0) await shot('bog');
    bogKill = await fightOne(m.id, 25000);
  }
  note('霧沼（ワープの番人で街道へ、歩いて霧沼へ入り、沼の魔物を倒す）', warpOpt && toBog && bogKill);

  /* ============ 10. 迷宮 3 階のボス ============ */
  await dbg('speed', { n: 8 });
  const t1 = await usePortal('bog_tower', 'tower1', 40000);
  await sleep(500);
  await shot('dungeon');
  const t2 = await usePortal('tower1_down', 'tower2', 60000);
  await sleep(300);
  const t3 = await usePortal('tower2_down', 'tower3', 60000);
  await sleep(500);
  // 職のスキルを上げて割り当て、良い武器を持つ
  // ボスは大勢で倒す強さ（データの釣り合いのテストで、Lv25 の戦士の大振りランク 15 で 100〜250 回）。首斬りの大剣と、ランクを上げた大振りで挑む
  await makeRoom();
  await dbg('item', { id: 'headsman_blade', rarity: 'rare' });
  await sleep(200);
  const hbUid = await K("return G.inv.items.find((i) => i.base === 'headsman_blade')?.uid;");
  if (hbUid) await send({ t: 'inv', op: 'equip', item: hbUid });
  for (let r = 0; r < 20; r++) await send({ t: 'skillUp', s: 'war_cleave' });
  await send({ t: 'bind', slot: '1', s: 'war_cleave' });
  const warSkills = ['war_cleave'];
  const bossSpawn = await K("return G.map.spawns.find((s) => s.monsters.includes('bell_warden')) || null;");
  let boss = null;
  if (bossSpawn) {
    // 魔物に気絶させられると歩くのが止まるので、止まっていたら押し直す（人が遊ぶときと同じ）
    for (let t = 0; t < 60000 && !boss; t += 300) {
      if (t % 1800 === 0) await send({ t: 'move', x: bossSpawn.x, y: bossSpawn.y });
      await sleep(300);
      boss = await K("for (const e of G.ents.values()) if (e.kind === 'monster' && e.raw?.boss && e.anim !== 5) return { id: e.id }; return null;");
    }
  }
  let bossDead = false, exitOk = false;
  if (boss) {
    await dbg('speed', { n: 4 });
    await clickEnt(boss.id, 14);
    await sleep(1500);
    await shot('boss');
    await dbg('speed', { n: 8 });
    bossDead = await fightOne(boss.id, 150000, { skills: ['1'], every: 1 });
    await sleep(500);
    const n0 = await mark();
    exitOk = await usePortal('tower3_exit', 'town', 40000);
    info('ボスの後の知らせ', (await recSince(0, "m.t === 'sys' && /倒した/.test(m.msg)")).map((m) => m.msg).slice(-1).join(''), n0);
  }
  await dbg('god', { on: false });
  await dbg('speed', { n: 1 });
  note('迷宮 3 階のボス（霧沼から鐘楼へ入り、1→2→3 階と降りてボスを倒し、開いた出口で町へ帰る）', t1 && t2 && t3 && bossDead && exitOk, `ボス ${boss ? '見つけた' : '見つからない'}・${bossDead ? '倒した' : '倒せない'}`);

  /* ============ 止める（Esc とタブを隠したとき） ============ */
  await sleep(500);
  // 歩かせておき、止めている間は位置（と世界の時計）が届かないことを見る
  // 6〜25 マス先の歩ける所（町の人・魔物の湧く場所・入口のどれか）
  const walkTarget = await K("const d = K.data.maps[G.mapId]; const pts = [...(d.npcs || []), ...(G.map.spawns || []).map((s) => ({ x: s.x - 0.5, y: s.y - 0.5 })), d.entry].filter(Boolean).map((p) => ({ x: p.x + 0.5, y: p.y + 1.5 })); return pts.map((p) => ({ ...p, d: Math.hypot(p.x - G.pred.x, p.y - G.pred.y) })).filter((p) => p.d > 6 && p.d < 25).sort((a, b) => b.d - a.d)[0] || { x: G.pred.x - 6, y: G.pred.y };");
  await send({ t: 'move', ...walkTarget });
  await sleep(300);
  await page.key('Escape');
  const paused = await waitFor('G.paused && K.menus.pauseOpen', 3000);
  const st0 = await K('return __pt.lastSt;');
  await sleep(1000);
  const st1 = await K('return __pt.lastSt;');
  await shot('pause');
  await page.key('Escape');
  await waitFor('!G.paused', 3000);
  await sleep(600);
  const st2 = await K('return __pt.lastSt;');
  await K("Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); return true;");
  const hiddenPaused = await waitFor('G.paused', 3000);
  const savedHidden = await K("const s = JSON.parse(localStorage.getItem('kanenaki:save:v1')); return s.slots[0].char.map === G.mapId;");
  await K("Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); return true;");
  const resumed = await waitFor('!G.paused', 3000);
  note('止める（Esc で世界が止まり、もう一度 Esc で続く。タブを隠すと止まって保存する）', paused && st0 === st1 && st2 > st1 && hiddenPaused && resumed && savedHidden, `止めている間に進んだ世界の時計 ${st1 - st0} ms、動かしたあと ${st2 - st1} ms`);

  /* ============ 11. 閉じて開き直すと続き ============ */
  const before = await me();
  const beforeItems = await K('return G.inv.items.map((i) => i.uid).sort().join(",");');
  await page.navigate(URL0); // 読み込み直す（閉じるときに保存する）
  await waitFor("window.__kanenaki && document.getElementById('title')?.open && document.querySelector('#title [data-act=\"continue\"]')", 20000);
  const slotText = await page.evaluate("document.querySelector('#title .slot-card').textContent");
  // 書き出し: 枠 1 の「書き出す」でファイルに落ち、中身は鐘なき王国の書き出しの形
  const DL = join(SHOTS, '.downloads');
  rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true });
  await page.raw('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await clickEl('#title [data-act="export"]');
  let exported = null;
  for (let i = 0; i < 50 && !exported; i++) { await sleep(100); const f = readdirSync(DL).find((n) => n.endsWith('.json')); if (f) { try { exported = { name: f, json: JSON.parse(readFileSync(join(DL, f), 'utf8')) }; } catch { /* 書き込み中 */ } } }
  // 読み込み: 空いている枠 2 の「読み込む」でファイルを選ぶと、同じキャラが枠 2 に入る
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  const chooser = new Promise((res) => page.on((m) => { if (m.method === 'Page.fileChooserOpened') res(m.params); }));
  await clickEl('#title [data-act="import"]');
  const fc = await Promise.race([chooser, sleep(5000).then(() => null)]);
  if (fc && exported) await page.send('DOM.setFileInputFiles', { files: [join(DL, exported.name)], backendNodeId: fc.backendNodeId });
  const imported = await waitFor(`(() => { const s = JSON.parse(localStorage.getItem('kanenaki:save:v1')); return s.slots[1]?.char?.name === s.slots[0]?.char?.name; })()`, 5000);
  await page.send('Page.setInterceptFileChooserDialog', { enabled: false });
  note('書き出しと読み込み（枠 1 をファイルに書き出し、枠 2 へ読み込む）', exported?.json?.kind === 'kanenaki-save' && exported?.json?.v === 1 && imported, exported ? exported.name : 'ファイルができない');
  await K(`if (!window.__pt) { window.__pt = { rec: [], n: 0, lastSt: 0 }; const g = K.game; const orig = g.handle; g.handle = (m) => { if (m.t === 'snap') __pt.lastSt = m.st; else if (m.t !== 'spawn' && m.t !== 'me' && m.t !== 'save') { __pt.rec.push({ ...m, _n: __pt.n++ }); } return orig(m); }; } return true;`);
  await clickEl('#title [data-act="continue"]');
  await waitFor('G.welcomed && G.meId != null && G.me.level', 15000);
  await sleep(800);
  const after = await me();
  const afterItems = await K('return G.inv.items.map((i) => i.uid).sort().join(",");');
  const same = after.name === before.name && after.level === before.level && after.cls === before.cls && after.map === before.map && after.gold === before.gold && afterItems === beforeItems && Math.hypot(after.x - before.x, after.y - before.y) < 2;
  note('閉じて開き直すと続き（読み込み直し、枠 1 の「続きから」で同じ名前・Lv・職・場所・お金・持ち物）', same && slotText.includes(before.name), `${after.name} Lv${after.level} ${after.cls} ${after.map} ${after.gold}G`);
  await close();

  /* ============ 幅 800 の写真（閉じた Chrome を開き直して続きから） ============ */
  await open(800, 600);
  await clickEl('#title [data-act="continue"]');
  const cont800 = await waitFor('G.welcomed && G.meId != null', 15000);
  await sleep(1000);
  const again = await me();
  note('Chrome を閉じて開き直しても続き（幅 800）', cont800 && again.name === before.name && again.level === before.level, `${again.name} Lv${again.level}`);
  await shot('town');
  await dbg('warp', { map: 'road', x: 30.5, y: 60.5 });
  await waitFor("G.mapId === 'road'", 5000);
  await sleep(1000);
  await shot('road');
  await dbg('god', { on: true });
  await dbg('spawn', { id: 'mud_imp', n: 4, level: 30 });
  await sleep(300);
  const mm = await nearestMonster(8);
  if (mm) { await clickEnt(mm.id); await sleep(900); await page.key('1'); await sleep(500); }
  await shot('combat');
  await dbg('killAll', { r: 20 });
  await page.key('p');
  await waitFor("K.panels.isOpen('tree')", 3000);
  await sleep(600);
  await shot('tree');
  await page.key('Escape');
  await page.key('i');
  await waitFor("K.panels.isOpen('inv')", 3000);
  await sleep(400);
  await shot('inventory');
  await page.key('Escape');
  await dbg('warp', { map: 'tower2' });
  await waitFor("G.mapId === 'tower2'", 5000);
  await sleep(1200);
  await shot('dungeon');
  await dbg('warp', { map: 'town' });
  await waitFor("G.mapId === 'town'", 5000);
  await dbg('god', { on: false });
  await sleep(500);
  // 止めた画面の「保存して題名へ戻る」: 保存してから読み込み直し、題名の画面に戻る
  const goldQ = await K('return G.inv.gold;');
  await dbg('gold', { n: 7 });
  await waitFor(`G.inv.gold === ${goldQ + 7}`, 3000);
  await page.key('Escape');
  await waitFor('K.menus.pauseOpen', 3000);
  await clickEl('#pause [data-act="quit"]');
  await sleep(1500);
  const backTitle = await waitFor("window.__kanenaki && document.getElementById('title')?.open && document.querySelector('#title [data-act=\"continue\"]')", 20000);
  const goldSaved = await page.evaluate("JSON.parse(localStorage.getItem('kanenaki:save:v1')).slots[0].char.gold");
  note('保存して題名へ戻る（止めた画面から。戻る直前のお金まで保存される）', backTitle && goldSaved === goldQ + 7, `お金 ${goldSaved}`);
  await shot('title');
  await close();
  } // 本編ここまで

  /* ============ 13. 1 人の普通のキャラで鐘守りの亡者を倒す（倒れない設定なし） ============ */
  if (!SKIP_SOLO) {
    await close();
    await open(1280, 800, PROFILE_SOLO);
    for (const [i, cls] of SOLO_CLASSES.entries()) {
      let r;
      try { r = await soloBoss(cls, i); } catch (e) { r = { cls, win: false, error: String(e.stack || e).slice(0, 300) }; }
      soloResults.push(r);
      const name = SD.classes[cls]?.name ?? cls;
      note(`1 人で鐘守りの亡者を倒す（${name}、Lv24、倒れない設定なし）`, r.win, r.error ?? `世界の時間 ${r.simS} 秒、いちばん少ない体力 ${r.minHpPct}%、回復薬 ${r.potions} 個（持っていたのは大きな回復薬 ${r.potionsBought} 個）、${r.manaBought ? `魔力の薬 ${r.manaUsed} 個（持っていたのは ${r.manaBought} 個）、` : ''}ボスまでの道で倒れた ${r.travelDeaths} 回、武器 ${r.weapon}`);
    }
    await close();
  }
} catch (e) {
  note('台本が最後まで動く', false, String(e.stack || e).slice(0, 400));
} finally {
  await close().catch(() => {});
}

/* ============ 12. エラーが出ない ============ */
const logText = existsSync(APP_LOG) ? readFileSync(APP_LOG).subarray(logStart).toString('utf8') : '';
const badLines = logText.split('\n').filter((l) => / result=(error|exception)/.test(l));
note('エラーが出ない（コンソールのエラー 0、logs/app.log の error・exception 0）', errorsSeen.length === 0 && badLines.length === 0, `コンソール ${errorsSeen.length}、記録 ${badLines.length}（記録 ${logText.split('\n').length - 1} 行）`);
for (const e of errorsSeen.slice(0, 5)) info('console', e.slice(0, 300));
for (const l of badLines.slice(0, 5)) info('log', l.slice(0, 300));

for (const d of [PROFILE, PROFILE_SOLO, join(SHOTS, '.downloads')]) { for (let i = 0; i < 20; i++) { try { rmSync(d, { recursive: true, force: true }); break; } catch { await sleep(250); } } }
const ok = results.every((r) => r.ok);
writeFileSync(join(SHOTS, 'playthrough.json'), JSON.stringify({ at: new Date().toISOString(), seconds: Math.round((Date.now() - T0) / 1000), ok, results, solo: soloResults }, null, 1));
console.log(`\n${ok ? 'すべて ○' : '× があります'}（${Math.round((Date.now() - T0) / 1000)} 秒）`);
process.exit(ok ? 0 : 1);
