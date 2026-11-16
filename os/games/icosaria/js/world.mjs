// ゲームの中心: 場所の読み込み、勇者・敵・ボス・村人、戦闘、装備のドロップ、仕掛け、成長、セーブ。
// 数値は Gemini 4 Carbon の設計書（data/game.json）、地図は Gemini が描いた data/maps.json。
import { T, tileFrame, GROUND } from './gfx.mjs';
import { parseMap, moveBox } from './core/tilemap.mjs';
import * as St from './core/stats.mjs';
import { rollItem, faceScale } from './core/loot.mjs';
import { makeRng } from './core/rng.mjs';

export const VIEW_W = 320, VIEW_H = 180;
const SAVE_KEY = 'icosaria-save-v1';
const log = (...a) => (window.dlog || (() => {}))(...a);
const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const EXIT_PAIR = { village: { '>': ['beach', '<'] }, beach: { '<': ['village', '>'], '^': ['dungeon', 'v'] }, dungeon: { v: ['beach', '^'] } };
const ELEM_NAME = { tide: '潮', gale: '烈風', mirage: '陽炎', thunder: '白雷', starfrost: '星氷' };
const SELL = { common: 6, azure: 18, sunset: 48, icosa: 120 };
const now = () => performance.now();

export function makeWorld({ gfx, audio, data, maps, ui }) {
  const G = data;
  const rng = makeRng((Date.now() ^ 0x5eed) >>> 0);
  const affixDef = Object.fromEntries(G.loot.affixes.map((a) => [a.id, a]));
  const rarity = Object.fromEntries(G.loot.rarities.map((r) => [r.id, r]));
  const trackByName = (re, fallback) => (audio.trackIds().find((id) => re.test(id)) || fallback);

  // ---- セーブの中身 ----
  let save = null;
  function freshSave() {
    const start = rollItem(rng, G.loot, { slot: 'weapon', rarity: 'common', ilvl: 1 });
    start.base = G.loot.slots.find((s) => s.id === 'weapon').bases[0]; start.affixes = [];
    return {
      v: 1, level: 1, xp: 0, prism: 20, potions: 3, face: 1, points: 1, area: 'village', spawn: { area: 'village', x: null, y: null },
      items: [start], equip: { weapon: start.uid, armor: null, talisman: null, boots: null },
      skills: { sk_wave_slash: 1 }, slots: ['sk_wave_slash', null, null], flags: { opening: false, chests: {}, boss: false, gate: false }, kills: 0, playMs: 0,
    };
  }
  function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 保存できない環境 */ } }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }

  // ---- 能力 ----
  const equipped = () => Object.values(save.equip).filter(Boolean).map((uid) => save.items.find((i) => i.uid === uid)).filter(Boolean);
  const passiveBonus = () => {
    const b = {};
    const r = (id) => save.skills[id] || 0, sk = (id) => G.skills[id];
    if (r('sk_marble_skin')) { const v = sk('sk_marble_skin').base + sk('sk_marble_skin').per_rank * (r('sk_marble_skin') - 1); b.hp_pct = v; b.def_pct = v; }
    if (r('sk_refract_mind')) { const v = sk('sk_refract_mind').base + sk('sk_refract_mind').per_rank * (r('sk_refract_mind') - 1); b.mp_pct = v; b.resonance_pct = v; }
    return b;
  };
  let stats = null;
  const restat = () => { stats = St.derive({ level: save.level, items: equipped(), bonus: passiveBonus() }); };

  // ---- 場所 ----
  let area = null, player = null, cam = { x: 0, y: 0 }, banner = null, shake = 0, boss = null, paused = false, deadTimer = 0;
  const fx = [], nums = [];
  function areaDef(id) { return maps.areas.find((a) => a.id === id); }
  function loadArea(id, enter = null) {
    const def = areaDef(id);
    const map = parseMap(def.rows);
    const a = { id, name: def.name, map, music: def.music, enemies: [], npcs: [], pickups: [], shots: [], hazards: [], exits: [], switches: [], gates: [] };
    let start = null;
    for (const e of map.entities) {
      const px = e.x * T + T / 2, py = e.y * T + T - 2;
      if (e.kind === 'player') start = { x: px, y: py };
      else if (e.kind === 'exit') a.exits.push({ ch: e.ch, tx: e.x, ty: e.y, x: px, y: py });
      else if (e.kind === 'npc') a.npcs.push(makeNpc(+e.ch, px, py));
      else if (e.kind === 'boss') { if (!save.flags.boss || save.face > 1) a.boss = makeBoss(px, py); }
      else a.enemies.push(makeEnemy(e.kind, px, py));
    }
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const t = map.tileAt(x, y);
      if (t === 'switch') a.switches.push({ tx: x, ty: y, on: false });
      if (t === 'gate') a.gates.push({ tx: x, ty: y });
    }
    // 格子扉: 前に開けていれば最初から開いている
    if (save.flags.gate) openGates(a, true);
    area = a; boss = null; save.area = id;
    // 入る位置: 出入り口から来たなら、その出入り口の内側
    let pos = start;
    if (enter) { const ex = a.exits.find((e) => e.ch === enter); if (ex) pos = inward(map, ex); }
    if (!pos && save.spawn.area === id && save.spawn.x != null) pos = { x: save.spawn.x, y: save.spawn.y };
    if (!pos) pos = a.exits[0] ? inward(map, a.exits[0]) : { x: map.w * T / 2, y: map.h * T / 2 };
    if (!player) player = makePlayer(pos.x, pos.y); else { player.x = pos.x; player.y = pos.y; }
    if (id === 'village' && save.spawn.x == null) save.spawn = { area: 'village', x: pos.x, y: pos.y };
    banner = { text: def.name, until: now() + 2500 };
    audio.playMusic(def.music && audio.trackIds().includes(def.music) ? def.music : audio.trackIds()[1]);
    ui.announce(def.name);
    log('rpg.area', { id, enemies: a.enemies.length, face: save.face }, 'ok');
    store();
  }
  function inward(map, ex) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      if (!map.solidAt(ex.tx + dx, ex.ty + dy) && !['<', '>', '^', 'v'].includes(String(map.tileAt(ex.tx + dx, ex.ty + dy)))) return { x: (ex.tx + dx) * T + T / 2, y: (ex.ty + dy) * T + T - 2 };
    }
    return { x: ex.x, y: ex.y };
  }
  function openGates(a, quiet) {
    for (const g of a.gates) a.map.setTile(g.tx, g.ty, 'switch_floor');
    a.gatesOpen = true;
    if (!quiet) { save.flags.gate = true; audio.sfx('gate_open'); toast('白亜の格子扉が開いた'); shake = 8; log('rpg.gate', {}, 'open'); }
  }

  // ---- 勇者 ----
  function makePlayer(x, y) {
    return { x, y, dir: 'down', state: 'idle', t: 0, anim: 0, combo: 0, queued: false, hitSet: new Set(), iframe: 0, dashCd: 0, potionCd: 0, cds: {}, aegis: 0, aegisTick: 0, galeBuff: 0, hp: 0, mp: 0, flash: 0, vx: 0, vy: 0, dashV: [0, 0], castT: 0 };
  }
  function fullHeal() { restat(); player.hp = stats.hp; player.mp = stats.mp; save.potions = 3; }

  // ---- 敵 ----
  function makeEnemy(kind, x, y) {
    const d = G.enemies[kind];
    const k = faceScale(save.face), elite = save.face > 1 && rng.chance(0.18);
    const hp = Math.round(d.hp * (1 + (save.face - 1) * 0.35) * (elite ? 1.8 : 1));
    return { kind, d, x, y, hx: x, hy: y, hp, maxhp: hp, atk: Math.round(d.atk * (1 + (save.face - 1) * 0.22) * (elite ? 1.3 : 1)), def: d.def, elite, k,
      state: 'idle', t: rng.range(0, 1000), cd: rng.range(500, 1500), dir: 'down', vx: 0, vy: 0, flash: 0, wet: 0, marks: 0, frozen: 0, stun: 0, shell: 0, alive: true, size: kind === 'sentinel' ? 14 : 10 };
  }
  function makeBoss(x, y) {
    const d = G.boss, hp = Math.round(d.hp * (1 + (save.face - 1) * 0.35));
    return { kind: 'boss', d, x, y, hx: x, hy: y, hp, maxhp: hp, atk: Math.round(d.atk * (1 + (save.face - 1) * 0.22)), def: d.def, state: 'sleep', t: 0, cd: 1500, dir: 'down', vx: 0, vy: 0, flash: 0, wet: 0, marks: 0, frozen: 0, stun: 0, alive: true, size: 18, phase: 1, said: 0 };
  }
  function makeNpc(n, x, y) {
    const list = G.village.npcs, d = list[n - 1] || { name: '村の人', role: '', lines: ['今日も夕凪がきれいだね。'] };
    const sprite = n === 1 ? ['npc-mio', 'down'] : n === 2 ? ['npc-gargan', 'down'] : ['npc-folk', ['b', 'a', 'c', 'a'][(n - 3) % 4]];
    return { n, d, x, y, sprite, line: 0 };
  }

  // ---- 共通 ----
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const facingAngle = (dir) => ({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 })[dir];
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
  const solid = (tx, ty) => area.map.solidAt(tx, ty) && area.map.tileAt(tx, ty) !== 'switch_floor';
  function move(ent, dx, dy, w = 10, h = 8) {
    const r = moveBox({ x: ent.x - w / 2, y: ent.y - h, w, h }, dx, dy, solid, T);
    ent.x = r.x + w / 2; ent.y = r.y + h;
    return r;
  }
  function toast(text) { ui.toast(text); }
  function num(x, y, text, color) { nums.push({ x, y, text: String(text), color, t: now() }); }
  function sparks(x, y, color, n = 6) { for (let i = 0; i < n; i++) { const a = rng.range(0, Math.PI * 2), s = rng.range(20, 70); fx.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, color, t: now(), life: rng.range(250, 450) }); } }

  // ---- 勇者が与えるダメージ ----
  function hitEnemy(e, { mult = 1, phys = 1, res = 0, elem = null, knock = 4, from = player, chain = true, src = 'atk' }) {
    if (!e.alive) return;
    const crit = rng.chance(stats.crit / 100);
    let m = mult;
    if (elem === 'thunder' && e.wet > now()) m *= 1.25;
    if (e.kind === 'boss' && e.state === 'stunned') m *= 1.35;
    const tgt = { def: e.def + (e.shell > now() ? 15 : 0) };
    const dmg = St.damage(stats, tgt, { mult: m, phys, res, elemPct: elem ? stats[elem + '_pct'] || 0 : 0, crit, roll: rng.range(0.95, 1.05) });
    e.hp -= dmg; e.flash = now() + 90;
    num(e.x, e.y - 18, dmg, crit ? '#ffe478' : '#f7f9fc');
    sparks(e.x, e.y - 8, crit ? '#ffe478' : '#f7f9fc', crit ? 9 : 5);
    audio.sfx('hit');
    if (e.kind !== 'boss' && knock) { const a = angleTo(from, e); move(e, Math.cos(a) * knock, Math.sin(a) * knock, e.size, 8); }
    // 相の効果
    if (elem === 'tide') e.wet = now() + 3000;
    if (elem === 'gale' && e.kind !== 'boss') { const a = angleTo(from, e); move(e, Math.cos(a) * 13, Math.sin(a) * 13, e.size, 8); player.galeBuff = now() + 1500; }
    if (elem === 'thunder') {
      e.stun = Math.max(e.stun, now() + 120);
      if (chain) { const near = liveEnemies().filter((o) => o !== e && dist(o, e) < 40).sort((a, b) => dist(a, e) - dist(b, e))[0]; if (near) { fx.push({ kind: 'bolt', x1: e.x, y1: e.y - 8, x2: near.x, y2: near.y - 8, t: now() }); hitEnemy(near, { mult: mult * 0.6, phys, res, elem: null, knock: 0, from: e, chain: false }); } }
    }
    if (elem === 'starfrost') { e.marks++; if (e.marks >= 3) { e.marks = 0; e.frozen = now() + 1200; e.shatter = true; } }
    if (crit && stats.proc_chain) { const near = liveEnemies().find((o) => o !== e && dist(o, e) < 48); if (near) { fx.push({ kind: 'bolt', x1: e.x, y1: e.y - 8, x2: near.x, y2: near.y - 8, t: now() }); hitEnemy(near, { mult: stats.proc_chain / 100, phys, res, knock: 0, from: e, chain: false }); } }
    if (src === 'atk') player.mp = Math.min(stats.mp, player.mp + 2);
    if (e.hp <= 0) kill(e);
  }
  const liveEnemies = () => area.enemies.filter((e) => e.alive).concat(boss && boss.alive ? [boss] : []);
  function kill(e) {
    e.alive = false;
    sparks(e.x, e.y - 8, '#b2f2e8', 14);
    audio.sfx('enemy_die');
    save.kills++;
    const xp = Math.round((e.kind === 'boss' ? G.boss.xp : e.d.xp) * (1 + (save.face - 1) * 0.3) * (e.elite ? 2 : 1));
    gainXp(xp);
    if (stats.hp_on_kill) player.hp = Math.min(stats.hp, player.hp + stats.hp_on_kill);
    // ドロップ: プリズム片、ときどき装備と潮雫
    const p = Math.round(rng.int(2, 6) * (1 + (save.face - 1) * 0.3) * (e.kind === 'boss' ? 12 : 1));
    area.pickups.push({ kind: 'prism', x: e.x + rng.range(-6, 6), y: e.y + rng.range(-4, 4), amount: p, t: now() });
    if (rng.chance(0.12)) area.pickups.push({ kind: 'potion', x: e.x + rng.range(-8, 8), y: e.y + rng.range(-4, 6), t: now() });
    const dropChance = e.kind === 'boss' ? 1 : e.elite ? 0.6 : e.kind === 'sentinel' ? 0.28 : 0.16;
    if (rng.chance(dropChance)) dropItem(e.x, e.y, e.kind === 'boss' ? { rarity: rng.chance(0.25) ? 'icosa' : 'sunset' } : {});
    if (e.kind === 'boss') bossDown();
    log('rpg.kill', { kind: e.kind, xp, elite: !!e.elite }, 'ok');
  }
  function dropItem(x, y, opt = {}) {
    const it = rollItem(rng, G.loot, { ilvl: save.level + (save.face - 1) * 3, face: save.face, luck: 0, ...opt });
    area.pickups.push({ kind: 'item', x: x + rng.range(-6, 6), y: y + rng.range(-2, 6), item: it, t: now() });
    log('rpg.drop', { rarity: it.rarity, slot: it.slot, affixes: it.affixes.length }, 'ok');
  }
  function gainXp(n) {
    save.xp += n;
    num(player.x, player.y - 30, '+' + n + ' 経験', '#ffe478');
    while (save.xp >= St.xpToNext(save.level)) {
      save.xp -= St.xpToNext(save.level); save.level++; save.points++;
      fullHeal(); audio.sfx('levelup'); fx.push({ kind: 'ring', x: player.x, y: player.y - 10, color: '#ffe478', t: now(), life: 700, r: 40 });
      toast(`レベル ${save.level} になった。波長点を1つ得た（Tab で煌刻樹へ）`);
      log('rpg.levelup', { level: save.level }, 'ok');
      store();
    }
  }

  // ---- 勇者が受けるダメージ ----
  function hurtPlayer(raw, from) {
    if (player.iframe > now() || player.state === 'dead') return;
    let dmg = Math.max(1, Math.floor(raw * (100 / (100 + stats.def * 2)) * (player.aegis > now() ? 0.75 : 1) * rng.range(0.95, 1.05)));
    player.hp -= dmg; player.iframe = now() + 650; player.flash = now() + 650;
    num(player.x, player.y - 26, dmg, '#ff5277');
    audio.sfx('player_hurt');
    if (from) { const a = angleTo(from, player); move(player, Math.cos(a) * 10, Math.sin(a) * 10); }
    shake = Math.max(shake, 3);
    if (player.hp <= 0) die();
  }
  function die() {
    player.hp = 0; player.state = 'dead'; deadTimer = now() + 1600;
    const lost = Math.floor(save.prism * 0.1); save.prism -= lost;
    toast(`気を失った……（プリズム片を ${lost} 個落とした）`);
    log('rpg.death', { area: area.id, lost }, 'ok');
  }
  function respawn() {
    const sp = save.spawn;
    fullHeal(); player.state = 'idle'; player.iframe = now() + 1500;
    if (sp.area !== area.id) { loadArea(sp.area); }
    if (sp.x != null) { player.x = sp.x; player.y = sp.y; }
    toast('双色の泉で目を覚ました');
  }

  // ---- スキル ----
  const rankOf = (id) => save.skills[id] || 0;
  const skillMult = (id) => { const s = G.skills[id]; return s.base + s.per_rank * (rankOf(id) - 1); };
  function useSkill(slot) {
    const id = save.slots[slot];
    if (!id || !rankOf(id)) { toast('この枠には煌刻術が入っていない（Tab で煌刻樹へ）'); return; }
    const s = G.skills[id];
    if ((player.cds[id] || 0) > now()) return;
    if (player.mp < s.mp) { toast('煌気が足りない'); audio.sfx('menu_cancel'); return; }
    player.mp -= s.mp; player.cds[id] = now() + s.cooldown_ms * (1 - stats.cdr / 100);
    const fa = facingAngle(player.dir), m = skillMult(id);
    player.state = 'cast'; player.castT = now() + 220;
    switch (id) {
      case 'sk_wave_slash': {
        audio.sfx('skill_wave');
        fx.push({ kind: 'wave', x: player.x, y: player.y - 8, a: fa, t: now(), life: 300 });
        for (const e of liveEnemies()) if (dist(player, e) < 36 && angDiff(angleTo(player, e), fa) < (55 * Math.PI) / 180) hitEnemy(e, { mult: m, phys: 0.8, res: 0.5, elem: 'tide', knock: 8, src: 'skill' });
        break;
      }
      case 'sk_gale_thrust': {
        audio.sfx('skill_gale');
        const [dx, dy] = DIRS[player.dir], hit = new Set();
        player.state = 'dash'; player.t = now() + 220; player.iframe = now() + 240; player.dashV = [dx * 48 / 0.22, dy * 48 / 0.22];
        player.onDash = () => { for (const e of liveEnemies()) if (!hit.has(e) && dist(player, e) < 18) { hit.add(e); hitEnemy(e, { mult: m, phys: 0.8, res: 0.5, elem: 'gale', knock: 6, src: 'skill' }); } };
        fx.push({ kind: 'trail', x: player.x, y: player.y - 10, a: fa, t: now(), life: 260, color: '#5bb379' });
        break;
      }
      case 'sk_prism_bolt': {
        audio.sfx('skill_prism');
        for (const da of [-0.26, 0, 0.26]) { const a = fa + da; area.shots.push({ from: 'player', x: player.x + Math.cos(a) * 8, y: player.y - 10 + Math.sin(a) * 8, vx: Math.cos(a) * 136, vy: Math.sin(a) * 136, life: now() + 760, r: 5, mult: m, elem: 'thunder', color: '#ffe478', hit: new Set() }); }
        break;
      }
      case 'sk_frost_aegis': {
        audio.sfx('skill_aegis');
        player.aegis = now() + 4500; player.aegisTick = 0;
        break;
      }
      default: toast('この煌刻術は、まだ使えない');
    }
    log('rpg.skill', { id, rank: rankOf(id) }, 'ok');
  }

  // ---- 1コマの更新 ----
  function update(dt, input) {
    if (!area) return;
    save.playMs += dt * 1000;
    if (paused || ui.blocking()) { input.clear(); return; }
    const t = now();
    if (player.state === 'dead') { if (t > deadTimer) respawn(); input.clear(); return; }
    restat();
    player.mp = Math.min(stats.mp, player.mp + 3.5 * dt);

    // 行動
    if (input.take('menu')) { input.clear(); ui.openMenu(); return; }
    if (input.take('interact')) interact();
    if (input.take('potion')) usePotion();
    if (input.take('dash') && player.dashCd < t && player.state !== 'dash') {
      const [ax, ay] = input.axis(), [dx, dy] = ax || ay ? [ax, ay] : DIRS[player.dir];
      player.state = 'dash'; player.t = t + 180; player.iframe = t + 180; player.dashCd = t + 900; player.dashV = [dx * 35 / 0.18, dy * 35 / 0.18]; player.onDash = null;
      audio.sfx('dash'); fx.push({ kind: 'after', x: player.x, y: player.y, dir: player.dir, t, life: 240 });
      if (stats.proc_step_flare) area.hazards.push({ kind: 'flare', from: 'player', x: player.x, y: player.y - 4, r: 22, t, fire: t, until: t + 1500, mult: stats.proc_step_flare / 100, tick: 0 });
    }
    for (const [i, act] of [[0, 'skill1'], [1, 'skill2'], [2, 'skill3']]) if (input.take(act) && player.state !== 'dash') useSkill(i);
    if (input.take('attack') && player.state !== 'dash') {
      if (player.state === 'attack') player.queued = true;
      else startAttack(1);
    }

    // 動き
    const speed = stats.move_spd * T * (player.galeBuff > t ? 1.15 : 1);
    if (player.state === 'dash') {
      move(player, player.dashV[0] * dt, player.dashV[1] * dt);
      if (player.onDash) player.onDash();
      if (t > player.t) { player.state = 'idle'; player.onDash = null; }
    } else if (player.state === 'attack') {
      const st = player.combo, dur = [0, 220, 220, 320][st] / (1 + (rankOf('sk_flowing_edge') ? 0.04 * rankOf('sk_flowing_edge') : 0));
      const k = 1 - (player.t - t) / dur;
      if (k > 0.35 && !player.swung) { player.swung = true; swing(st); }
      const [dx, dy] = DIRS[player.dir]; if (k < 0.4) move(player, dx * 30 * dt, dy * 30 * dt);
      if (t > player.t) { if (player.queued && st < 3) startAttack(st + 1); else { player.state = 'idle'; player.combo = 0; } }
    } else {
      if (player.state === 'cast' && t > player.castT) player.state = 'idle';
      const [ax, ay] = input.axis();
      if (ax || ay) {
        if (Math.abs(ax) > Math.abs(ay)) player.dir = ax > 0 ? 'right' : 'left'; else player.dir = ay > 0 ? 'down' : 'up';
        move(player, ax * speed * dt, ay * speed * dt);
        if (player.state !== 'cast') player.state = 'walk';
        player.anim += dt * 1000;
      } else if (player.state !== 'cast') player.state = 'idle';
    }

    // 星氷の鏡盾: 回る鏡が触れた敵を凍らせる
    if (player.aegis > t && t > player.aegisTick) {
      player.aegisTick = t + 400;
      for (let i = 0; i < 3; i++) {
        const a = t / 400 + (i * Math.PI * 2) / 3, mx = player.x + Math.cos(a) * 24, my = player.y - 8 + Math.sin(a) * 24;
        for (const e of liveEnemies()) if (Math.hypot(e.x - mx, e.y - 8 - my) < 14) hitEnemy(e, { mult: skillMult('sk_frost_aegis'), phys: 0.3, res: 1, elem: 'starfrost', knock: 3, src: 'skill' });
      }
    }

    // 出入り口・スイッチ・拾い物
    const ptx = Math.floor(player.x / T), pty = Math.floor((player.y - 2) / T);
    const ex = area.exits.find((e) => e.tx === ptx && e.ty === pty);
    if (ex && EXIT_PAIR[area.id] && EXIT_PAIR[area.id][ex.ch]) { const [to, ch] = EXIT_PAIR[area.id][ex.ch]; loadArea(to, ch); return; }
    const sw = area.switches.find((s) => s.tx === ptx && s.ty === pty && !s.on);
    if (sw) { sw.on = true; audio.sfx('switch'); toast(`調律スイッチが光った（${area.switches.filter((s) => s.on).length} / ${area.switches.length}）`); if (area.switches.every((s) => s.on) && !area.gatesOpen) openGates(area); }
    for (const p of area.pickups) {
      if (p.gone || t - p.t < 300) continue;
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (p.kind === 'prism' && d < 16) { p.gone = true; save.prism += p.amount; audio.sfx('pickup_prism'); num(p.x, p.y - 10, '+' + p.amount, '#63a4ff'); }
      if (p.kind === 'potion' && d < 14) { p.gone = true; save.potions = Math.min(3, save.potions + 1); audio.sfx('potion'); toast('癒やしの潮雫を1回分補充した'); }
    }
    area.pickups = area.pickups.filter((p) => !p.gone);

    // 敵・ボス・弾・危ない場所
    for (const e of area.enemies) if (e.alive) updateEnemy(e, dt, t);
    if (area.boss) updateBoss(area.boss, dt, t);
    updateShots(dt, t);
    updateHazards(t);
    if (shake > 0) shake = Math.max(0, shake - dt * 30);
    // カメラ
    const mw = area.map.w * T, mh = area.map.h * T;
    cam.x = mw <= VIEW_W ? (mw - VIEW_W) / 2 : Math.max(0, Math.min(mw - VIEW_W, player.x - VIEW_W / 2));
    cam.y = mh <= VIEW_H ? (mh - VIEW_H) / 2 : Math.max(0, Math.min(mh - VIEW_H, player.y - 12 - VIEW_H / 2));
  }
  function startAttack(stage) {
    player.state = 'attack'; player.combo = stage; player.queued = false; player.swung = false;
    player.t = now() + [0, 220, 220, 320][stage]; player.hitSet = new Set();
    audio.sfx('slash' + stage);
  }
  function swing(stage) {
    const fa = facingAngle(player.dir), mult = [0, 1, 1.1, 1.35][stage];
    fx.push({ kind: 'slash', x: player.x, y: player.y - 8, dir: player.dir, t: now(), life: 200, stage });
    for (const e of liveEnemies()) {
      const r = e.kind === 'boss' ? 40 : 26;
      if (dist(player, e) < r && angDiff(angleTo(player, e), fa) < Math.PI / 1.7) hitEnemy(e, { mult, phys: 1, res: 0, knock: stage === 3 ? 10 : 5 });
    }
    // 3段目の潮の飛沫（屈折銘）
    if (stage === 3 && stats.proc_wave) area.shots.push({ from: 'player', x: player.x, y: player.y - 8, vx: Math.cos(fa) * 150, vy: Math.sin(fa) * 150, life: now() + 450, r: 6, mult: stats.proc_wave / 100, elem: 'tide', color: '#64d6ca', hit: new Set(), pierce: true });
    // 宝箱は斬っても開かない（調べて開ける）
  }
  function usePotion() {
    if (player.potionCd > now()) return;
    if (save.potions <= 0) { toast('癒やしの潮雫が無い'); return; }
    save.potions--; player.potionCd = now() + 1500;
    const v = Math.round(stats.hp * 0.45); player.hp = Math.min(stats.hp, player.hp + v);
    num(player.x, player.y - 26, '+' + v, '#7ee08a'); audio.sfx('potion');
  }

  // ---- 調べる ----
  function interact() {
    const [dx, dy] = DIRS[player.dir];
    const fx0 = player.x + dx * 12, fy0 = player.y - 4 + dy * 12;
    // 拾い物（装備）
    const it = area.pickups.find((p) => p.kind === 'item' && Math.hypot(p.x - player.x, p.y - player.y) < 18);
    if (it) {
      if (save.items.length >= 24) { toast('武具がいっぱいで持てない（Tab で整理）'); return; }
      it.gone = true; save.items.push(it.item); audio.sfx(['sunset', 'icosa'].includes(it.item.rarity) ? 'pickup_rare' : 'pickup_item');
      toast(`【${rarity[it.item.rarity].name}】${itemName(it.item)} を拾った`); store(); return;
    }
    // 村人
    const npc = area.npcs.find((n) => Math.hypot(n.x - fx0, n.y - fy0) < 18);
    if (npc) { talk(npc); return; }
    // 地形の仕掛け
    const tx = Math.floor(fx0 / T), ty = Math.floor(fy0 / T), tile = area.map.tileAt(tx, ty);
    if (tile === 'chest') { openChest(tx, ty); return; }
    if (tile === 'fountain' || tile === 'obelisk') {
      fullHeal(); save.spawn = { area: area.id, x: player.x, y: player.y }; audio.sfx('heal_fountain');
      fx.push({ kind: 'ring', x: player.x, y: player.y - 10, color: '#64d6ca', t: now(), life: 600, r: 30 });
      toast(tile === 'fountain' ? '双色の泉で、生命波と煌気が満ちた（ここから再開する）' : '共鳴石柱に触れ、体が満たされた（ここから再開する）');
      store();
    }
  }
  function openChest(tx, ty) {
    const key = area.id + ':' + tx + ',' + ty;
    if (save.flags.chests[key]) { toast('宝箱は空っぽだ'); return; }
    save.flags.chests[key] = true; audio.sfx('chest');
    const first = area.id === 'beach' ? { rarity: rng.chance(0.3) ? 'sunset' : 'azure' } : area.id === 'dungeon' ? { rarity: rng.chance(0.25) ? 'icosa' : 'sunset' } : {};
    dropItem(tx * T + T / 2, ty * T + T + 6, first);
    area.pickups.push({ kind: 'prism', x: tx * T + T / 2 + 8, y: ty * T + T + 8, amount: rng.int(10, 30), t: now() });
    store();
  }
  function talk(n) {
    const lines = n.d.lines.length ? n.d.lines : ['……'];
    const line = lines[n.line % lines.length]; n.line++;
    audio.sfx('talk');
    if (/コハク/.test(n.d.name)) { ui.say([{ speaker: n.d.name, line }], () => ui.openShop()); return; }
    if (/ミオ/.test(n.d.name) && save.flags.boss && !save.flags.toldLoop) {
      save.flags.toldLoop = true;
      ui.say([{ speaker: n.d.name, line: '輝石が一面、回ったわ。世界の波長が強くなってる。' }, { speaker: n.d.name, line: '遺跡の魔物も強くなるけれど、宿る屈折銘も輝くはず。' }, { speaker: n.d.name, line: `今は第${save.face}面。もう一度、回廊へ行ってみて。` }]);
      return;
    }
    ui.say([{ speaker: n.d.name, line }]);
  }

  // ---- 敵の動き ----
  function updateEnemy(e, dt, t) {
    if (e.frozen > t) { return; }
    if (e.shatter && e.frozen && e.frozen <= t) { e.shatter = false; hitEnemy(e, { mult: 0.8, phys: 0, res: 1, knock: 0, chain: false, src: 'skill' }); if (!e.alive) return; }
    if (e.stun > t) return;
    const d = dist(e, player), slow = e.wet > t ? 0.75 : 1, sp = e.d.speed * T * slow;
    const toward = (k = 1) => { const a = angleTo(e, player); move(e, Math.cos(a) * sp * dt * k, Math.sin(a) * sp * dt * k, e.size, 8); e.dir = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 'right' : 'left') : (Math.sin(a) > 0 ? 'down' : 'up'); };
    const away = (k = 1) => toward(-k);
    switch (e.kind) {
      case 'crab': {
        if (e.hp < e.maxhp * 0.4 && !e.shellUsed) { e.shellUsed = true; e.shell = t + 1500; }
        if (e.state === 'windup') { if (t > e.t) { e.state = 'idle'; e.cd = t + 900; if (d < 22) hurtPlayer(e.atk, e); fx.push({ kind: 'poke', x: e.x, y: e.y - 6, t, life: 150 }); } break; }
        if (d < 61 && t > e.cd) { if (d < 20) { e.state = 'windup'; e.t = t + 350; } else toward(); } else wander(e, dt, t);
        break;
      }
      case 'jelly': {
        e.bob = Math.sin(t / 400 + e.hx) * 3;
        if (d < 80 && t > e.cd) { e.state = 'windup'; e.t = t + 300; e.cd = t + 2600; }
        if (e.state === 'windup' && t > e.t) { e.state = 'idle'; const a = angleTo(e, player); area.shots.push({ from: 'enemy', x: e.x, y: e.y - 10, vx: Math.cos(a) * 61, vy: Math.sin(a) * 61, life: t + 2200, r: 4, dmg: e.atk, elem: 'tide', color: '#64d6ca' }); }
        if (d < 80) { if (d < 40) away(0.6); } else wander(e, dt, t, 0.5);
        break;
      }
      case 'bird': {
        if (e.state === 'dive') { move(e, e.vx * dt, e.vy * dt, e.size, 8); if (d < 12) { hurtPlayer(e.atk, e); e.state = 'idle'; e.cd = t + 1500; } if (t > e.t) { e.state = 'idle'; e.cd = t + 1500; } break; }
        if (e.state === 'windup') { if (t > e.t) { const a = angleTo(e, player); e.state = 'dive'; e.t = t + 740; e.vx = Math.cos(a) * 6.5 * T; e.vy = Math.sin(a) * 6.5 * T; } break; }
        if (d < 110) { if (d < 56) away(); else if (d > 72) toward(); if (t > e.cd && d < 80) { e.state = 'windup'; e.t = t + 500; } } else wander(e, dt, t);
        break;
      }
      case 'sentinel': {
        if (e.state === 'windup') { if (t > e.t) { e.state = 'attack'; e.t = t + 200; if (d < 30 && angDiff(angleTo(e, player), facingAngle(e.dir)) < 1.0) hurtPlayer(e.atk, e); shake = Math.max(shake, 2); } break; }
        if (e.state === 'attack') { if (t > e.t) { e.state = 'idle'; e.cd = t + 1100; } break; }
        if (d < 120) { if (d < 26 && t > e.cd) { e.state = 'windup'; e.t = t + 500; area.hazards.push({ kind: 'cone', from: 'enemy', x: e.x, y: e.y - 6, a: facingAngle(e.dir), r: 30, spread: 1.0, t, fire: t + 500, until: t + 520, dmg: 0, show: true }); } else toward(); } else wander(e, dt, t, 0.6);
        break;
      }
      case 'orb': {
        e.bob = Math.sin(t / 300 + e.hy) * 2;
        if (e.state === 'windup') {
          if (t > e.t) { e.state = 'idle'; e.cd = t + 3000; audio.sfx('skill_prism');
            for (const a of e.beams) area.hazards.push({ kind: 'beam', from: 'enemy', x: e.x, y: e.y - 10, a, r: 67, t, fire: t, until: t + 220, dmg: e.atk, hitOnce: true }); }
          break;
        }
        if (d < 110) { if (d < 52) away(); else if (d > 64) toward(0.6); if (t > e.cd) { e.state = 'windup'; e.t = t + 450; const x = rng.chance(0.5); e.beams = [0, 1, 2, 3].map((k) => k * Math.PI / 2 + (x ? Math.PI / 4 : 0)); for (const a of e.beams) area.hazards.push({ kind: 'beam', from: 'enemy', x: e.x, y: e.y - 10, a, r: 67, t, fire: t + 450, until: t + 450, dmg: 0, show: true }); } } else wander(e, dt, t, 0.5);
        break;
      }
    }
  }
  function wander(e, dt, t, k = 0.4) {
    if (!e.wt || t > e.wt) { e.wt = t + rng.range(900, 2200); const a = rng.range(0, Math.PI * 2); e.wvx = Math.cos(a); e.wvy = Math.sin(a); if (Math.hypot(e.x - e.hx, e.y - e.hy) > 40) { const b = Math.atan2(e.hy - e.y, e.hx - e.x); e.wvx = Math.cos(b); e.wvy = Math.sin(b); } }
    move(e, e.wvx * e.d.speed * T * k * dt, e.wvy * e.d.speed * T * k * dt, e.size, 8);
  }

  // ---- ボス ----
  function updateBoss(b, dt, t) {
    if (!b.alive) return;
    const d = dist(b, player);
    if (b.state === 'sleep') { if (d < 7 * T) { b.state = 'idle'; boss = b; b.cd = t + 1200; audio.playMusic(trackByName(/boss|colossus|io/i, audio.musicId)); ui.say([{ speaker: 'コロッサス・イオ', line: G.dungeon.boss_lines[0] }]); log('rpg.boss', { face: save.face }, 'start'); } return; }
    if (b.frozen > t || b.stun > t) return;
    if (b.phase === 1 && b.hp < b.maxhp * 0.5) { b.phase = 2; b.state = 'idle'; b.cd = t + 1400; ui.say([{ speaker: 'コロッサス・イオ', line: G.dungeon.boss_lines[1] }]); shake = 10; audio.sfx('boss_roar'); log('rpg.boss', { phase: 2 }, 'ok'); }
    const sp = 1.8 * T * (b.wet > t ? 0.75 : 1);
    const a = angleTo(b, player);
    b.dir = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 'right' : 'left') : (Math.sin(a) > 0 ? 'down' : 'up');
    switch (b.state) {
      case 'idle': {
        if (d > 30) move(b, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt, 30, 14);
        if (t > b.cd) {
          const opts = d < 46 ? ['sweep', 'stomp'] : ['shots', 'stomp', 'shots'];
          if (b.phase === 2) opts.push('checker', 'charge', 'charge');
          const pick = rng.pick(opts);
          b.state = pick; b.t = t;
          if (pick === 'sweep') { b.fire = t + 650; area.hazards.push({ kind: 'cone', from: 'enemy', x: b.x, y: b.y - 12, a, r: 45, spread: 1.1, t, fire: t + 650, until: t + 700, dmg: 22, show: true }); }
          if (pick === 'stomp') { b.fire = t + 800; area.hazards.push({ kind: 'circle', from: 'enemy', x: b.x, y: b.y - 6, r: 48, t, fire: t + 800, until: t + 850, dmg: 20, show: true }); }
          if (pick === 'shots') { b.fire = t + 450; }
          if (pick === 'checker') { b.fire = t + 1100; const white = rng.chance(0.5); area.hazards.push({ kind: 'checker', from: 'enemy', x: b.x, y: b.y, white, r: 9 * T, t, fire: t + 1100, until: t + 1250, dmg: 26, show: true }); audio.sfx('boss_roar'); }
          if (pick === 'charge') { b.fire = t + 600; b.ca = a; area.hazards.push({ kind: 'line', from: 'enemy', x: b.x, y: b.y - 8, a, r: 160, t, fire: t + 600, until: t + 600, dmg: 0, show: true }); }
        }
        break;
      }
      case 'sweep': case 'stomp': case 'checker':
        if (t > b.fire + 60) { b.state = b.state === 'stomp' ? 'recover' : 'idle'; b.cd = t + (b.state === 'recover' ? 1200 : 900); b.rt = t + 1200; if (b.state === 'recover') { shake = 8; audio.sfx('boss_stomp'); fx.push({ kind: 'ring', x: b.x, y: b.y - 6, color: '#64d6ca', t, life: 500, r: 48 }); } }
        break;
      case 'recover': if (t > b.rt) { b.state = 'idle'; b.cd = t + 600; } break;
      case 'shots':
        if (t > b.fire) { for (let k = -2; k <= 2; k++) { const aa = a + k * 0.22; area.shots.push({ from: 'enemy', x: b.x, y: b.y - 22, vx: Math.cos(aa) * 4.2 * T, vy: Math.sin(aa) * 4.2 * T, life: t + 2500, r: 4, dmg: 16, elem: 'thunder', color: '#ffe478' }); } audio.sfx('skill_prism'); b.state = 'idle'; b.cd = t + 1300; }
        break;
      case 'charge': {
        if (t < b.fire) break;
        const r = move(b, Math.cos(b.ca) * 6.2 * T * dt, Math.sin(b.ca) * 6.2 * T * dt, 30, 14);
        if (d < 22) hurtPlayer(24, b);
        if (r.hitX || r.hitY || t > b.fire + 1800) { b.state = 'stunned'; b.rt = t + 2000; shake = 10; audio.sfx('boss_stomp'); toast('コロッサス・イオが壁に激突した。核が露出している！'); }
        break;
      }
      case 'stunned': if (t > b.rt) { b.state = 'idle'; b.cd = t + 800; } break;
    }
  }
  function bossDown() {
    shake = 14; audio.playMusic(trackByName(/fanfare|victory|clear/i, audio.musicId));
    const first = !save.flags.boss;
    save.flags.boss = true; save.face = Math.min(20, save.face + 1);
    ui.say([{ speaker: 'コロッサス・イオ', line: G.dungeon.boss_lines[3] || G.dungeon.boss_lines.at(-1) }, { speaker: 'カイ', line: '要の小輝石……取り戻したよ、ミオ。' }, { speaker: '', line: first ? `原初のイコサ輝石が一面回った。世界は第${save.face}面へ。魔物は強く、屈折銘はより輝く。` : `輝石がさらに回った。第${save.face}面へ。` }]);
    log('rpg.boss', { face: save.face }, 'down');
    store();
  }

  // ---- 弾と危ない場所 ----
  function updateShots(dt, t) {
    for (const s of area.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (t > s.life || area.map.solidAt(Math.floor(s.x / T), Math.floor((s.y + 6) / T))) { s.dead = true; continue; }
      if (s.from === 'enemy') { if (Math.hypot(s.x - player.x, s.y - (player.y - 10)) < s.r + 6) { hurtPlayer(s.dmg, s); s.dead = true; } }
      else for (const e of liveEnemies()) {
        if (s.hit.has(e)) continue;
        if (Math.hypot(s.x - e.x, s.y - (e.y - 8)) < s.r + (e.kind === 'boss' ? 18 : 7)) { s.hit.add(e); hitEnemy(e, { mult: s.mult, phys: 0.3, res: 1, elem: s.elem, knock: 3, from: s, src: 'skill' }); if (!s.pierce) { s.dead = true; break; } }
      }
    }
    area.shots = area.shots.filter((s) => !s.dead);
  }
  function inHazard(h, x, y) {
    const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy);
    if (h.kind === 'circle' || h.kind === 'flare') return d < h.r;
    if (h.kind === 'cone') return d < h.r && angDiff(Math.atan2(dy, dx), h.a) < h.spread / 2 + 0.2;
    if (h.kind === 'beam' || h.kind === 'line') { const ux = Math.cos(h.a), uy = Math.sin(h.a), along = dx * ux + dy * uy, across = Math.abs(-dx * uy + dy * ux); return along > 0 && along < h.r && across < 7; }
    if (h.kind === 'checker') { if (d > h.r) return false; const tx = Math.floor(x / T), ty = Math.floor(y / T), tile = area.map.tileAt(tx, ty); return h.white ? tile === 'checker_white' : tile === 'checker_black'; }
    return false;
  }
  function updateHazards(t) {
    for (const h of area.hazards) {
      if (h.from === 'enemy' && h.dmg && t >= h.fire && !h.done) {
        if (inHazard(h, player.x, player.y - 4)) hurtPlayer(h.dmg * (1 + (save.face - 1) * 0.22), h);
        h.done = true;
        if (h.kind === 'checker') { shake = 6; audio.sfx('boss_stomp'); }
      }
      if (h.kind === 'flare' && t > h.tick) { h.tick = t + 500; for (const e of liveEnemies()) if (inHazard(h, e.x, e.y)) hitEnemy(e, { mult: h.mult, phys: 0.3, res: 1, elem: 'mirage', knock: 0, src: 'skill' }); }
    }
    area.hazards = area.hazards.filter((h) => t < h.until);
  }

  // ---- 描画（320×180） ----
  function draw(g) {
    const t = now();
    g.fillStyle = '#141322'; g.fillRect(0, 0, VIEW_W, VIEW_H);
    if (!area) return;
    const sx = Math.round(cam.x + (shake ? rng.range(-shake, shake) * 0.3 : 0)), sy = Math.round(cam.y + (shake ? rng.range(-shake, shake) * 0.3 : 0));
    g.save(); g.translate(-sx, -sy);
    const x0 = Math.max(0, Math.floor(sx / T)), y0 = Math.max(0, Math.floor(sy / T)), x1 = Math.min(area.map.w - 1, Math.floor((sx + VIEW_W) / T)), y1 = Math.min(area.map.h - 1, Math.floor((sy + VIEW_H) / T));
    const tops = [];
    for (let ty = y0; ty <= y1 + 1; ty++) for (let tx = x0; tx <= x1; tx++) {
      let tile = area.map.tileAt(tx, ty);
      if (!tile) continue;
      if (tile === 'switch_floor') tile = 'checker_black';
      g.fillStyle = GROUND[tile] || '#535075'; g.fillRect(tx * T, ty * T, T, T);
      const st = tile === 'switch' ? area.switches.find((s) => s.tx === tx && s.ty === ty)?.on : tile === 'chest' ? !!save.flags.chests[area.id + ':' + tx + ',' + ty] : false;
      const fr = tileFrame(tile, t + (tx + ty) * 37, st);
      if (fr && gfx.has(fr[0], fr[1])) g.drawImage(gfx.get(fr[0], fr[1]), tx * T, ty * T);
      if (tile === 'pillar') tops.push([tx, ty]);
    }
    // 危ない場所の予兆（赤）
    for (const h of area.hazards) if (h.show && t < h.fire) drawHazard(g, h, t);
    for (const h of area.hazards) if (h.kind === 'flare') { g.fillStyle = 'rgba(255,196,120,0.35)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, Math.PI * 2); g.fill(); }
    // 物を、足元の高さの順に描く
    const list = [];
    for (const p of area.pickups) list.push({ y: p.y - 1, draw: () => drawPickup(g, p, t) });
    for (const n of area.npcs) list.push({ y: n.y, draw: () => drawSprite(g, n.sprite[0], n.sprite[1] + '-' + (Math.floor(t / 600 + n.n) % 2), n.x, n.y, 'normal', false, [16, 24]) });
    for (const e of area.enemies) if (e.alive) list.push({ y: e.y, draw: () => drawEnemy(g, e, t) });
    if (area.boss && area.boss.alive) list.push({ y: area.boss.y, draw: () => drawEnemy(g, area.boss, t) });
    list.push({ y: player.y, draw: () => drawPlayer(g, t) });
    list.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
    // 柱の上半分は、人より手前に描く（柱の向こうを歩くと隠れる）
    for (const [tx, ty] of tops) if (gfx.has('tiles-marble', 'pillar_top')) g.drawImage(gfx.get('tiles-marble', 'pillar_top'), tx * T, (ty - 1) * T);
    // 弾とエフェクト
    for (const s of area.shots) { g.fillStyle = s.color; g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.fillRect(s.x - 1, s.y - 1, 2, 2); }
    drawFx(g, t);
    g.restore();
  }
  function drawSprite(g, id, frame, x, y, kind = 'normal', flip = false, fb = [16, 16], dy = 0) {
    const img = gfx.get(id, frame, kind, fb);
    const w = img.width, h = img.height, px = Math.round(x - w / 2), py = Math.round(y - h + 2 + dy);
    g.fillStyle = 'rgba(20,19,34,0.3)'; g.beginPath(); g.ellipse(x, y, Math.max(4, w * 0.32), 2.5, 0, 0, Math.PI * 2); g.fill();
    if (flip) { g.save(); g.translate(px + w, py); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); } else g.drawImage(img, px, py);
  }
  function drawPlayer(g, t) {
    const p = player;
    if (p.state === 'dead') { g.globalAlpha = 0.5; }
    if (p.iframe > t && p.state !== 'dash' && Math.floor(t / 70) % 2) g.globalAlpha = 0.35;
    const flip = p.dir === 'left', sheet = 'hero-' + (p.dir === 'left' ? 'right' : p.dir);
    let frame = 'idle-' + (Math.floor(t / 500) % 2);
    if (p.state === 'walk') frame = 'walk-' + (Math.floor(p.anim / 130) % 4);
    if (p.state === 'attack') { const dur = [0, 220, 220, 320][p.combo], k = 1 - (p.t - t) / dur; frame = 'atk-' + Math.min(2, Math.floor(k * 3)); }
    if (p.state === 'cast') frame = 'cast-0';
    if (p.state === 'dash') frame = 'walk-1';
    drawSprite(g, sheet, frame, p.x, p.y, p.flash > t && Math.floor(t / 60) % 2 ? 'white' : 'normal', flip, [16, 24]);
    g.globalAlpha = 1;
    // 星氷の鏡盾
    if (p.aegis > t) for (let i = 0; i < 3; i++) { const a = t / 400 + (i * Math.PI * 2) / 3; const mx = p.x + Math.cos(a) * 24, my = p.y - 8 + Math.sin(a) * 24; g.fillStyle = '#b2f2e8'; g.beginPath(); g.moveTo(mx, my - 5); g.lineTo(mx + 4, my); g.lineTo(mx, my + 5); g.lineTo(mx - 4, my); g.closePath(); g.fill(); g.strokeStyle = '#3a66b8'; g.stroke(); }
  }
  function drawEnemy(g, e, t) {
    const id = e.kind === 'boss' ? 'boss' : e.kind;
    let frame = e.kind === 'boss' ? 'idle-' + (Math.floor(t / 500) % 2) : 'move-' + (Math.floor(t / 260) % 2);
    if (e.state === 'windup' || ['sweep', 'stomp', 'checker', 'shots'].includes(e.state) || (e.state === 'charge' && t < e.fire)) frame = 'windup';
    if (e.state === 'attack' || e.state === 'dive' || (e.state === 'charge' && t >= e.fire)) frame = gfx.has(id, 'attack') ? 'attack' : 'windup';
    if (e.state === 'stunned' || e.state === 'recover') frame = 'hurt';
    if (e.flash > t) frame = gfx.has(id, 'hurt') ? 'hurt' : frame;
    const kind = e.flash > t ? 'white' : e.frozen > t ? 'normal' : e.elite ? 'elite' : 'normal';
    const fb = e.kind === 'boss' ? [48, 48] : e.kind === 'sentinel' ? [24, 32] : [16, 16];
    drawSprite(g, id, frame, e.x, e.y, kind, e.dir === 'left', fb, e.bob || 0);
    if (e.frozen > t) { g.fillStyle = 'rgba(178,242,232,0.55)'; g.fillRect(e.x - 9, e.y - 18, 18, 18); }
    if (e.wet > t) { g.fillStyle = '#64d6ca'; g.fillRect(e.x - 1, e.y - (fb[1] + 4), 2, 2); }
    if (e.kind !== 'boss' && e.hp < e.maxhp) { g.fillStyle = '#141322'; g.fillRect(e.x - 8, e.y - fb[1] - 2, 16, 3); g.fillStyle = e.elite ? '#a33b6c' : '#ff5277'; g.fillRect(e.x - 7, e.y - fb[1] - 1, Math.max(0, 14 * e.hp / e.maxhp), 1); }
    if (e.elite) { g.strokeStyle = 'rgba(163,59,108,0.8)'; g.beginPath(); g.ellipse(e.x, e.y, 9, 3, 0, 0, Math.PI * 2); g.stroke(); }
  }
  function drawPickup(g, p, t) {
    if (p.kind === 'prism') { const img = gfx.get('icons-items', 'prism'); g.drawImage(img, Math.round(p.x - 8), Math.round(p.y - 14 + Math.sin(t / 200 + p.x) * 1.5)); return; }
    if (p.kind === 'potion') { g.drawImage(gfx.get('icons-items', 'potion'), Math.round(p.x - 8), Math.round(p.y - 14)); return; }
    const col = rarity[p.item.rarity].color;
    // レア度の色の光の筋
    const grd = g.createLinearGradient(0, p.y - 40, 0, p.y); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(1, col);
    g.globalAlpha = 0.45 + 0.25 * Math.sin(t / 250); g.fillStyle = grd; g.fillRect(p.x - 2, p.y - 40, 4, 40); g.globalAlpha = 1;
    g.drawImage(gfx.get('icons-items', { weapon: 'blade', armor: 'coat', talisman: 'charm', boots: 'boots' }[p.item.slot]), Math.round(p.x - 8), Math.round(p.y - 14));
  }
  function drawHazard(g, h, t) {
    const k = Math.min(1, (t - h.t) / Math.max(1, h.fire - h.t)), a = 0.18 + 0.25 * k;
    g.fillStyle = `rgba(255,82,119,${a})`; g.strokeStyle = `rgba(255,82,119,${0.5 + 0.4 * k})`;
    g.beginPath();
    if (h.kind === 'circle') g.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    else if (h.kind === 'cone') { g.moveTo(h.x, h.y); g.arc(h.x, h.y, h.r, h.a - h.spread / 2, h.a + h.spread / 2); g.closePath(); }
    else if (h.kind === 'beam' || h.kind === 'line') { const ux = Math.cos(h.a), uy = Math.sin(h.a); g.moveTo(h.x - uy * 5, h.y + ux * 5); g.lineTo(h.x - uy * 5 + ux * h.r, h.y + ux * 5 + uy * h.r); g.lineTo(h.x + uy * 5 + ux * h.r, h.y - ux * 5 + uy * h.r); g.lineTo(h.x + uy * 5, h.y - ux * 5); g.closePath(); }
    else if (h.kind === 'checker') {
      if (Math.floor(t / 120) % 2) return;
      for (let ty = Math.floor((h.y - h.r) / T); ty <= Math.floor((h.y + h.r) / T); ty++) for (let tx = Math.floor((h.x - h.r) / T); tx <= Math.floor((h.x + h.r) / T); tx++) {
        const tile = area.map.tileAt(tx, ty); if ((h.white && tile === 'checker_white') || (!h.white && tile === 'checker_black')) { g.fillStyle = 'rgba(255,228,120,0.55)'; g.fillRect(tx * T, ty * T, T, T); }
      }
      return;
    }
    g.fill(); g.stroke();
  }
  function drawFx(g, t) {
    for (const f of fx) {
      const k = (t - f.t) / (f.life || 200);
      if (k >= 1) { f.dead = true; continue; }
      if (f.kind === 'slash') {
        const s = 'slash-' + Math.min(2, Math.floor(k * 3)), img = gfx.get('slash', s, 'normal', [24, 24]);
        g.save(); g.translate(f.x + DIRS[f.dir][0] * 12, f.y + DIRS[f.dir][1] * 12); g.rotate(facingAngle(f.dir)); if (f.stage === 2) g.scale(1, -1); g.globalAlpha = 1 - k * 0.5; g.drawImage(img, -12, -12); g.restore(); g.globalAlpha = 1;
      } else if (f.kind === 'wave') {
        g.strokeStyle = `rgba(100,214,202,${1 - k})`; g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y, 10 + 26 * k, f.a - 0.95, f.a + 0.95); g.stroke(); g.lineWidth = 1;
      } else if (f.kind === 'spark') {
        const dt = (t - f.t) / 1000; g.fillStyle = f.color; g.fillRect(f.x + f.vx * dt, f.y + f.vy * dt + 60 * dt * dt, 2, 2);
      } else if (f.kind === 'ring') {
        g.strokeStyle = f.color; g.globalAlpha = 1 - k; g.beginPath(); g.arc(f.x, f.y, f.r * k, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      } else if (f.kind === 'bolt') {
        g.strokeStyle = `rgba(255,228,120,${1 - k})`; g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo((f.x1 + f.x2) / 2 + rng.range(-4, 4), (f.y1 + f.y2) / 2 + rng.range(-4, 4)); g.lineTo(f.x2, f.y2); g.stroke();
      } else if (f.kind === 'after' || f.kind === 'trail') {
        g.globalAlpha = 0.4 * (1 - k); drawSprite(g, 'hero-' + (player.dir === 'left' ? 'right' : player.dir), 'walk-1', f.x, f.y + (f.kind === 'trail' ? 10 : 0), 'normal', player.dir === 'left', [16, 24]); g.globalAlpha = 1;
      } else if (f.kind === 'poke') { g.fillStyle = '#f7f9fc'; g.fillRect(f.x - 2, f.y - 2, 4, 4); }
    }
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].dead) fx.splice(i, 1);
    // 水晶の盾などで消えたら
  }

  // ---- 外から使うもの ----
  const itemName = (it) => it.unique || it.base;
  const affixText = (a) => (affixDef[a.id] ? affixDef[a.id].text.replace('{v}', a.v) : `${a.stat} +${a.v}`);
  return {
    get save() { return save; }, get stats() { restat(); return stats; }, get player() { return player; }, get area() { return area; }, get boss() { return boss && boss.alive ? boss : null; },
    get cam() { return cam; }, get banner() { return banner; }, nums, rarity, itemName, affixText,
    hasSave, data: G,
    // 近くで調べられるものの案内
    hint() {
      if (!area || !player || player.state === 'dead') return null;
      const it = area.pickups.find((q) => q.kind === 'item' && Math.hypot(q.x - player.x, q.y - player.y) < 18);
      if (it) return `[E] 拾う 【${rarity[it.item.rarity].name}】${itemName(it.item)}`;
      const [dx, dy] = DIRS[player.dir], fx0 = player.x + dx * 12, fy0 = player.y - 4 + dy * 12;
      const npc = area.npcs.find((n) => Math.hypot(n.x - fx0, n.y - fy0) < 18);
      if (npc) return '[E] 話す（' + npc.d.name + '）';
      const tile = area.map.tileAt(Math.floor(fx0 / T), Math.floor(fy0 / T));
      if (tile === 'chest') return save.flags.chests[area.id + ':' + Math.floor(fx0 / T) + ',' + Math.floor(fy0 / T)] ? null : '[E] 宝箱を開ける';
      if (tile === 'fountain') return '[E] 泉に触れる（全快）';
      if (tile === 'obelisk') return '[E] 共鳴石柱に触れる（全快）';
      return null;
    },
    newGame() {
      save = freshSave(); restat(); player = null; loadArea('village'); fullHeal();
      log('rpg.newgame', {}, 'ok');
      return G.opening;
    },
    continueGame() {
      try { save = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { save = null; }
      if (!save || save.v !== 1) return this.newGame();
      restat(); player = null; loadArea(save.area || 'village'); fullHeal();
      log('rpg.continue', { level: save.level, face: save.face }, 'ok');
      return null;
    },
    update, draw, store, restat, useSkill,
    setPaused(v) { paused = v; },
    // 装備とスキルの操作（メニューから）
    equip(uid) { const it = save.items.find((i) => i.uid === uid); if (!it) return; save.equip[it.slot] = uid; restat(); player.hp = Math.min(player.hp, stats.hp); audio.sfx('menu_ok'); store(); log('rpg.equip', { slot: it.slot, rarity: it.rarity }, 'ok'); },
    unequip(slot) { save.equip[slot] = null; restat(); player.hp = Math.min(player.hp, stats.hp); audio.sfx('menu_cancel'); store(); },
    discard(uid) { if (Object.values(save.equip).includes(uid)) return; save.items = save.items.filter((i) => i.uid !== uid); audio.sfx('menu_cancel'); store(); },
    sell(uid) { if (Object.values(save.equip).includes(uid)) return 0; const it = save.items.find((i) => i.uid === uid); if (!it) return 0; const v = Math.round(SELL[it.rarity] * (1 + it.ilvl * 0.1)); save.prism += v; save.items = save.items.filter((i) => i.uid !== uid); audio.sfx('pickup_prism'); store(); return v; },
    buyMystery() {
      if (save.prism < 100) { audio.sfx('menu_cancel'); return null; }
      if (save.items.length >= 24) { audio.sfx('menu_cancel'); return 'full'; }
      save.prism -= 100;
      let it; do { it = rollItem(rng, G.loot, { ilvl: save.level + 1, face: save.face }); } while (it.rarity === 'common');
      save.items.push(it); audio.sfx(['sunset', 'icosa'].includes(it.rarity) ? 'pickup_rare' : 'pickup_item'); store();
      log('rpg.shop', { rarity: it.rarity }, 'buy');
      return it;
    },
    learn(id) {
      const s = G.skills[id], r = rankOf(id);
      if (save.points <= 0 || r >= s.max_rank || save.level < s.req_level) { audio.sfx('menu_cancel'); return false; }
      save.points--; save.skills[id] = r + 1; restat(); audio.sfx('levelup');
      if (s.kind === 'active' && !save.slots.includes(id)) { const empty = save.slots.indexOf(null); if (empty >= 0) save.slots[empty] = id; }
      store(); log('rpg.learn', { id, rank: r + 1 }, 'ok'); return true;
    },
    setSlot(i, id) { save.slots = save.slots.map((x) => (x === id ? null : x)); save.slots[i] = id; audio.sfx('menu_ok'); store(); },
    sellValue: (it) => Math.round(SELL[it.rarity] * (1 + it.ilvl * 0.1)),
    elementName: (e) => ELEM_NAME[e] || e,
  };
}
