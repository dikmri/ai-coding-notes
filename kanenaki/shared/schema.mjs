// 『鐘なき王国』の約束ごと（世界の計算・画面・データ・絵が共有する定義）
// 設計書: D:\soft\myWiki\articles\kanenaki-mmo.md（§15「1 人用への作り直し」が正）
// 1 人用: 世界の計算（kanenaki/sim/）はブラウザの Web Worker（client/sim-worker.mjs）で動く。
// 画面とのやり取りは下の C2S・S2C の形のまま、通り道だけ postMessage にしている（client/link.mjs）。

export const PROTO_VERSION = 1;

/* ---------------- 時間と大きさ ---------------- */
export const TICK_HZ = 20;          // 世界の計算の回数（1 秒あたり）
export const SNAP_HZ = 20;          // 画面へ位置を送る回数（1 秒あたり。1 人用なので毎回送る）
export const INTERP_DELAY_MS = 50;  // 画面が位置を補間するときの遅れ（Worker との遅れは 0 に近い）
export const TILE_PX = 16;          // 1 マスのドット数（絵の解像度）
export const VIEW_RADIUS = 24;      // 世界の計算が送る範囲（マス）
export const PLAYER_SPEED = 4.5;    // マス/秒
export const MELEE_RANGE = 1.4;     // マス
export const PICKUP_RANGE = 1.5;    // マス
export const SAVE_EVERY_S = 30;     // 自動保存の間隔

/* ---------------- 保存（1 人用、§15） ---------------- */
export const SAVE_KEY = 'kanenaki:save:v1'; // localStorage の名前
export const SAVE_VERSION = 1;              // 保存の中身の版
export const SAVE_SLOTS = 3;                // キャラの枠の数
export const MAX_LEVEL = 99;
export const CLASS_CHANGE_LEVEL = 10;
export const ADVANCED_CLASS_LEVEL = 40; // 段階 2 以降

/* ---------------- 職業 ---------------- */
// base: 全員がここから始まる。tier1: Lv10 で転職。tier2: Lv40（段階 2 以降）
export const CLASSES = Object.freeze({
  adventurer: { name: '冒険者', tier: 0 },
  swordsman: { name: '剣士', tier: 1 },
  warrior: { name: '戦士', tier: 1 },
  rogue: { name: '盗賊', tier: 1 },
  priest: { name: '司祭', tier: 1 },        // ヒーラー
  necromancer: { name: 'ネクロマンサー', tier: 1 },
  monk: { name: 'モンク', tier: 1 },
  // 段階 2: mage 魔術師, hunter 狩人, paladin 聖騎士, spiritcaller 精霊使い, bard 吟遊詩人
});
export const STAGE1_CLASSES = ['adventurer', 'swordsman', 'warrior', 'rogue', 'priest', 'necromancer', 'monk'];

/* ---------------- 能力値 ---------------- */
// 主な能力値
export const PRIMARY = ['str', 'dex', 'int', 'vit']; // 力・器用・知恵・体力
// 能力値のキー。修正は「足す（flat）」「％増し（inc、足し合わせる）」「％かける（more、かけ合わせる）」の 3 種
// 例: { key: 'life', mode: 'inc', value: 10 } は「最大体力 +10%」
export const STAT_KEYS = Object.freeze([
  'str', 'dex', 'int', 'vit',
  'life', 'mana', 'lifeRegen', 'manaRegen', 'lifeLeech', 'manaLeech',
  'armor', 'evasion', 'blockChance', 'accuracy',
  'moveSpeed', 'attackSpeed', 'castSpeed', 'cooldownRecovery',
  'critChance', 'critMulti',
  'dmg', 'dmgMelee', 'dmgProjectile', 'dmgArea', 'dmgDot', 'dmgMinion', 'dmgSpell', 'dmgAttack',
  'dmgPhys', 'dmgFire', 'dmgCold', 'dmgLightning', 'dmgPoison', 'dmgHoly', 'dmgShadow',
  'resFire', 'resCold', 'resLightning', 'resPoison', 'resHoly', 'resShadow',
  'areaSize', 'projectileSpeed', 'projectileCount', 'durationSkill', 'manaCost',
  'healPower', 'shieldPower', 'minionLife', 'minionCount', 'auraEffect',
  'stunChance', 'bleedChance', 'poisonChance', 'burnChance', 'freezeChance', 'shockChance',
  'goldFind', 'itemFind', 'xpGain', 'lightRadius',
]);
export const MOD_MODES = ['flat', 'inc', 'more'];
export const DAMAGE_TYPES = ['phys', 'fire', 'cold', 'lightning', 'poison', 'holy', 'shadow'];
export const RES_CAP = 75; // 耐性の上限（％）

/* ---------------- スキルの効果の部品 ---------------- */
// スキルは effects の配列。サーバーが部品を順に実行する。データの係はこの部品だけを使う。
// 共通の引数: dmg = { type, base:[min,max], weapon: 倍率, perRank: ランクごとの増え方(%), scale: 'str'|'dex'|'int'|'vit' }
//             affects = 'enemies'|'allies'|'self'|'all'
export const OPS = Object.freeze({
  hit: '{ dmg, radius?=0, at?="target"|"self"|"point" } その場で当てる。radius>0 なら範囲',
  projectile: '{ speed, range, count?=1, spread?=0, pierce?=0, chain?=0, radius?=0.3, homing?=false, onHit:[effects] } 飛び道具',
  area: '{ at:"point"|"self"|"target", shape:"circle"|"cone"|"line", radius?, angle?, length?, width?, delay?=0, onHit:[effects] } 一度だけの範囲',
  zone: '{ at, radius, duration, tick, affects, onTick:[effects] } 地面に残る範囲',
  dash: '{ to:"target"|"point", speed, maxDist, passHit?:[effects], onArrive?:[effects] } 突進',
  blink: '{ to:"point"|"behindTarget"|"ally", maxDist } 瞬間移動',
  hook: '{ speed, range, width?=0.4, onHit?:[effects] } 最初に当たった敵を引き寄せる',
  knockback: '{ dist } 押し出す',
  vortex: '{ at, radius, strength, duration } 中心へ吸い寄せる',
  buff: '{ id, mods:[{key,mode,value,perRank?}], duration, target:"self"|"ally"|"party"|"allies", radius?, maxStacks?=1 }',
  debuff: '{ id, mods?:[...], cc?:"stun"|"root"|"slow"|"silence"|"fear"|"sleep", value?, duration, affects? }',
  dot: '{ type, dps, perRank?, duration, maxStacks?=1 } 時間で削る',
  heal: '{ amount?, pct?, perRank?, target:"self"|"ally"|"party"|"allies", radius? }',
  shield: '{ amount, perRank?, duration, target, radius? } radius があれば範囲の仲間全員',
  summon: '{ unit, count?=1, duration?, max, perRank?, level? } 召喚（プレイヤーの unit は monsters のうち minion: true のもの）。level が無ければ使い手の Lv',
  aura: '{ radius, mods, affects, reserve } 切り替え式。reserve は確保する魔力の％',
  trap: '{ armTime, duration, triggerRadius, max, onTrigger:[effects] } 置く罠',
  wall: '{ length, duration, at:"point" } 歩けない壁。使い手から地点への向きに沿って、地点を中心に伸びる',
  rewind: '{ seconds } 数秒前の位置と体力に戻る',
  stealth: '{ duration, breakOnAttack?=true }',
  taunt: '{ radius, duration }',
  swap: '{ } 対象と位置を入れ替える',
  revive: '{ radius, hpPct } 倒れた仲間を起こす',
  cheatDeath: '{ duration, healAfterPct? } その間は体力が 1 より下がらない',
  mark: '{ duration, mods, share? } 印を付けた敵が受ける効果。share（0〜1）があれば、印の付いた敵が受けたダメージのその割合を、ほかの印の付いた敵にも与える',
  execute: '{ thresholdPct, dmg? } 体力が一定以下ならとどめ。ボス（boss: true）は即死せず、代わりに最大体力の 8% のダメージ',
  bounce: '{ jumps, radius, onHit:[effects] } 対象から近くの別の敵へ jumps 回跳び移り、そのたびに onHit を当てる（使い手も最後の敵の位置へ移る）',
  delayed: '{ delay, effects:[...] } 時間差で発動',
  stance: '{ group, mods } 切り替え式の構え。同じ group は 1 つだけ',
  channel: '{ duration, tick, onTick:[effects] } 押し続けて発動',
  reflect: '{ duration } 飛び道具を跳ね返す',
  cleanse: '{ target } 悪い効果を消す',
  leap: '{ to:"point", maxDist, onLand?:[effects] } 跳んで着地',
  clone: '{ duration, count, dmgPct } 分身',
});

// スキルのデータに書ける、effects の外の項目
export const SKILL_FLAGS = Object.freeze({
  resetOnKill: 'true なら、このスキルで敵を倒したとき待ち時間がなくなる',
  needsCorpse: 'true なら、近く（range 以内）に死体が無いと使えない。使うと死体を 1 つ消す',
});
// 地図の床の種類は kanenaki/shared/mapgen.mjs の TILE_TYPES が正。地図の light は「暗さ」（0 = 明るい、1 = 真っ暗）。
// 魔物の耐性は res: { fire: 30, cold: 0, ... }（キーは DAMAGE_TYPES と同じ、値は %）。
// 依頼の giver は NPC の id の文字列か、その配列（複数の NPC が同じ依頼を出せる）。

/* ---------------- 装備 ---------------- */
export const SLOTS = ['head', 'body', 'hands', 'feet', 'belt', 'neck', 'ring1', 'ring2', 'weapon', 'offhand'];
export const RARITIES = Object.freeze({
  normal: { name: '普通', color: '#d8d4c8', affixes: [0, 0] },
  magic: { name: '魔法', color: '#7d9cff', affixes: [1, 2] },
  rare: { name: '希少', color: '#f2d45c', affixes: [3, 6] },
  unique: { name: '固有', color: '#d9813a', affixes: [0, 0] },
});
export const INV_W = 10, INV_H = 6; // 持ち物の升目（アイテムは w×h の升目を使う）
export const STASH_W = 12, STASH_H = 10;

/* ---------------- 動きの種類（画面の絵の切り替え） ---------------- */
export const ANIM = Object.freeze({ idle: 0, walk: 1, attack: 2, cast: 3, hit: 4, dead: 5 });
export const DIRS = 16; // 向きは 16 方向（0 = 画面の下向き、時計回り）

/* ---------------- やり取りの約束 ---------------- */
// 画面 → 世界（C2S）は postMessage で物のまま送る。世界 → 画面（S2C）は JSON の文字列を 1 回の計算ごとにまとめて送る。
// t が種類。数値の座標はマス単位の小数。
// 1 人用で外したもの: パーティー（party）、会話（chat・stamp）、接続の確かめ（ping・pong）、客の鍵（token）。
export const C2S = Object.freeze({
  hello: '{ t, v:PROTO_VERSION, char? } 最初に送る。char（保存したキャラ）があれば続きから、無ければ名前の候補が届く',
  create: '{ t, name?, i? } キャラを作る（name は候補の中から。職業は冒険者）',
  reroll: '{ t } 作る前に名前を引き直す',
  move: '{ t, x, y } その地点へ歩く（サーバーが道を探す）',
  attack: '{ t, id } その敵を通常攻撃する（届くまで近づく）',
  cast: '{ t, s, x, y, id? } スキル s を地点か対象へ',
  stop: '{ t }',
  pick: '{ t, id } 落ちているアイテムを拾う',
  inv: '{ t, op:"move"|"equip"|"unequip"|"drop"|"use"|"sell"|"buy"|"stash", from?, to?, npc?, item? }',
  alloc: '{ t, node } パッシブのマスを取る',
  unalloc: '{ t, node } 取り消す（忘却の聖水かお金を使う）',
  skillUp: '{ t, s } スキルのランクを上げる',
  bind: '{ t, slot, s } 1〜6 と右クリックへスキルを割り当てる。slot は "r"|"1".."6"',
  talk: '{ t, npc } 話しかける',
  quest: '{ t, op:"accept"|"turnIn", id }',
  classChange: '{ t, cls }',
  portal: '{ t } 帰還の巻物を使う',
  warp: '{ t, id } ワープの台・入口・出口を使う',
  respawn: '{ t } 倒れたあと町で起きる',
  // 1 人用で足したもの
  pause: '{ t, on } 世界を止める・動かす（Esc の画面、タブを隠したとき）',
  save: '{ t, why } 今のキャラを save で返してもらう（why は記録用: hidden・close・menu など）',
  debug: '{ t, op, ... } 確かめ用の命令（?debug=1 のときだけ）。op: level・xp・gold・item・warp・speed・heal・god・cls・points・quest・spawn・killAll',
});
export const S2C = Object.freeze({
  welcome: '{ t, you, zone, simTime } you はキャラの全部の情報（無ければ null）',
  names: '{ t, list } 作る前の名前の候補',
  zone: '{ t, zone, map, you } 地図に入ったとき。map は地図の id',
  spawn: '{ t, e } 範囲に入った物。e = { id, kind:"player"|"monster"|"npc"|"item"|"object"|"missile", art, name?, level?, cls?, rarity?, x, y, dir, hpPct }',
  snap: '{ t, st, ents:[[id, x100, y100, dir, anim, hpPct], ...], gone:[id...] } 10 回/秒',
  fx: '{ t, k, ... } 戦いの出来事。k = "dmg"|"heal"|"vfx"|"cast"|"death"|"levelUp"|"loot"|"cc"',
  me: '{ t, ...変わった項目 } 自分の能力値・体力・魔力・経験値など',
  inv: '{ t, items, equip, gold, stash? }',
  tree: '{ t, alloc, points }',
  skills: '{ t, ranks, binds, points, cds }',
  quests: '{ t, list }',
  dialog: '{ t, npc, text, options }',
  shop: '{ t, npc, items }',
  sys: '{ t, msg } 知らせ（日本語）',
  err: '{ t, code, msg }',
  // 1 人用で足したもの
  save: '{ t, why, char } 保存する中身。画面が localStorage の SAVE_KEY へ書く（why: sync は毎秒、zone・request・auto など）',
  paused: '{ t, on, speed } 世界が止まった・動き出した。speed は時間の速さ（確かめ用）',
});

/* ---------------- 記録の形 ---------------- */
// 1 行 = `ISO時刻 イベント名 args={...} result=...`（CLAUDE.md の決まり）
export function logLine(event, args, result = 'ok', now = new Date()) {
  return `${now.toISOString()} ${event} args=${JSON.stringify(args ?? {})} result=${typeof result === 'string' ? result : JSON.stringify(result)}`;
}
