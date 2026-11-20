// 画面の純粋な計算（DOM を使わない）。テスト: tests/kanenaki-client-core.test.mjs
// 座標の約束: 地図はマス単位（1 マス = 16 ドット）。y は下向き。
// 向き dir は 16 方向で、0 = 地図の +y（下）、時計回り（4 = 左、8 = 上、12 = 右）。
import { TILE_PX } from '../shared/schema.mjs';

export const SQUASH = 0.75;      // 縦の縮み（スキル sprite-stacking の数字）
export const SPACING = 1;        // 1 枚ごとに 1 ドット持ち上げる
export const ROT_SPEED = (Math.PI / 2) / 0.25; // 90° を 0.25 秒で回す

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- 視点 ---------------- */
// 地図の位置 → 画面のドット（カメラの位置が 0,0）。canvas の translate → scale(1, SQUASH) → rotate(theta) と同じ変換
export function worldToScreen(wx, wy, cam, theta) {
  const dx = (wx - cam.x) * TILE_PX, dy = (wy - cam.y) * TILE_PX;
  const c = Math.cos(theta), s = Math.sin(theta);
  return { x: dx * c - dy * s, y: (dx * s + dy * c) * SQUASH };
}
export function screenToWorld(sx, sy, cam, theta) {
  const rx = sx, ry = sy / SQUASH;
  const c = Math.cos(theta), s = Math.sin(theta);
  return { x: cam.x + (rx * c + ry * s) / TILE_PX, y: cam.y + (-rx * s + ry * c) / TILE_PX };
}
// スライスの帯は前が下（+y）を向いている。向き dir の物を描くときの回転
export const dirToTurn = (dir, theta) => (dir * Math.PI) / 8 + theta;
export function vecToDir(dx, dy) {
  const a = Math.atan2(dy, dx) - Math.PI / 2;
  return ((Math.round(a / (Math.PI / 8)) % 16) + 16) % 16;
}
// 視点の回転を 1 コマ進める（90° を 0.25 秒）。行き過ぎない
export function stepAngle(a, target, dt) {
  const step = ROT_SPEED * dt, d = target - a;
  if (Math.abs(d) <= step) return target;
  return a + Math.sign(d) * step;
}

/* ---------------- 位置の補間（サーバーの位置を 120 ms 遅らせて描く） ---------------- */
const TRACK_MAX = 32;
export const createTrack = () => [];
export function pushTrack(tr, t, x, y, dir, anim, hp) {
  const s = { t, x, y, dir, anim, hp };
  if (!tr.length || t >= tr[tr.length - 1].t) tr.push(s);
  else {
    let i = tr.length - 1;
    while (i > 0 && tr[i - 1].t > t) i--;
    tr.splice(i, 0, s);
  }
  if (tr.length > TRACK_MAX) tr.splice(0, tr.length - TRACK_MAX);
}
export function sampleTrack(tr, t) {
  if (!tr.length) return null;
  if (t <= tr[0].t) return tr[0];
  const last = tr[tr.length - 1];
  if (t >= last.t) return last;
  let i = tr.length - 2;
  while (i > 0 && tr[i].t > t) i--;
  const a = tr[i], b = tr[i + 1];
  const k = (t - a.t) / (b.t - a.t || 1);
  return { t, x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), dir: b.dir, anim: b.anim, hp: lerp(a.hp, b.hp, k) };
}

/* ---------------- 道探し（自分の移動を先に動かす用。サーバーが正） ---------------- */
// g = { w, h, solid: Uint8Array }。8 方向、壁の角はすり抜けない。
// 着けないときは、目的地にいちばん近い歩ける場所まで。戻り値はスタートを含まないマスの列
export function findPath(g, sx, sy, tx, ty, maxNodes = 6000) {
  const { w, h, solid } = g;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const free = (x, y) => inside(x, y) && !solid[y * w + x];
  sx = clamp(Math.floor(sx), 0, w - 1); sy = clamp(Math.floor(sy), 0, h - 1);
  tx = clamp(Math.floor(tx), 0, w - 1); ty = clamp(Math.floor(ty), 0, h - 1);
  if (sx === tx && sy === ty) return [];
  const N = w * h, start = sy * w + sx;
  const gScore = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heur = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.41421356 * Math.min(dx, dy); };
  const heap = []; // [f, idx]
  const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], end = heap.pop(); if (heap.length) { heap[0] = end; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  gScore[start] = 0; push(heur(sx, sy), start);
  let best = start, bestD = Math.hypot(sx - tx, sy - ty), bestG = 0, expanded = 0;
  const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41421356], [1, -1, 1.41421356], [-1, 1, 1.41421356], [-1, -1, 1.41421356]];
  while (heap.length && expanded < maxNodes) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    closed[cur] = 1; expanded++;
    const cx = cur % w, cy = (cur / w) | 0;
    const d = Math.hypot(cx - tx, cy - ty);
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) < 1e-9 && gScore[cur] < bestG)) { best = cur; bestD = d; bestG = gScore[cur]; }
    if (cx === tx && cy === ty) break;
    for (const [dx, dy, cost] of DIRS8) {
      const nx = cx + dx, ny = cy + dy;
      if (!free(nx, ny)) continue;
      if (dx && dy && (!free(cx + dx, cy) || !free(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const ng = gScore[cur] + cost;
      if (ng < gScore[ni]) { gScore[ni] = ng; came[ni] = cur; push(ng + heur(nx, ny), ni); }
    }
  }
  const out = [];
  for (let c = best; c !== start && c >= 0; c = came[c]) out.push({ x: c % w, y: (c / w) | 0 });
  return out.reverse();
}

/* ---------------- 持ち物の升目 ---------------- */
const uidOf = (it) => it.uid ?? it.id;
export function invFits(items, W, H, x, y, w, h, ignoreId) {
  if (x < 0 || y < 0 || x + w > W || y + h > H) return false;
  for (const it of items) {
    if (ignoreId != null && uidOf(it) === ignoreId) continue;
    const iw = it.w || 1, ih = it.h || 1;
    if (x < it.x + iw && it.x < x + w && y < it.y + ih && it.y < y + h) return false;
  }
  return true;
}
export function invFindSpot(items, W, H, w, h) {
  for (let x = 0; x <= W - w; x++) for (let y = 0; y <= H - h; y++) if (invFits(items, W, H, x, y, w, h)) return { x, y };
  return null;
}

/* ---------------- パッシブのツリー ---------------- */
const adjCache = new WeakMap();
export function treeAdjacency(tree) {
  let adj = adjCache.get(tree);
  if (adj) return adj;
  adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const n of Object.values(tree.nodes)) {
    if (!adj.has(n.id)) adj.set(n.id, new Set());
    for (const l of n.links || []) if (tree.nodes[l]) { add(n.id, l); add(l, n.id); }
  }
  adjCache.set(tree, adj);
  return adj;
}
export function treeAllocatable(tree, alloc) {
  const adj = treeAdjacency(tree), out = new Set();
  for (const id of alloc) for (const n of adj.get(id) || []) if (!alloc.has(n)) out.add(n);
  return out;
}
const isRoot = (node) => node && (node.kind === 'start' || node.kind === 'gate');
export function treeCanUnalloc(tree, alloc, id) {
  if (!alloc.has(id) || isRoot(tree.nodes[id])) return false;
  const adj = treeAdjacency(tree), left = new Set(alloc);
  left.delete(id);
  const seen = new Set(), queue = [];
  for (const a of left) if (isRoot(tree.nodes[a])) { seen.add(a); queue.push(a); }
  while (queue.length) {
    const c = queue.pop();
    for (const n of adj.get(c) || []) if (left.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen.size === left.size;
}

/* ---------------- 能力値の名前と文 ---------------- */
export const STAT_LABELS = Object.freeze({
  str: '力', dex: '器用', int: '知恵', vit: '体力',
  life: '最大体力', mana: '最大魔力', lifeRegen: '体力の回復（毎秒）', manaRegen: '魔力の回復（毎秒）',
  lifeLeech: '与えたダメージを体力に', manaLeech: '与えたダメージを魔力に',
  armor: '防御', evasion: '回避', blockChance: '防ぐ確率', accuracy: '命中',
  moveSpeed: '歩く速さ', attackSpeed: '攻撃の速さ', castSpeed: '詠唱の速さ', cooldownRecovery: '待ち時間の戻り',
  critChance: '会心の確率', critMulti: '会心の倍率',
  dmg: 'ダメージ', dmgMelee: '近接のダメージ', dmgProjectile: '飛び道具のダメージ', dmgArea: '範囲のダメージ', dmgDot: '継続ダメージ',
  dmgMinion: '仲間のダメージ', dmgSpell: '呪文のダメージ', dmgAttack: '攻撃のダメージ',
  dmgPhys: '物理のダメージ', dmgFire: '火のダメージ', dmgCold: '冷気のダメージ', dmgLightning: '雷のダメージ',
  dmgPoison: '毒のダメージ', dmgHoly: '聖なるダメージ', dmgShadow: '闇のダメージ',
  resFire: '火の耐性', resCold: '冷気の耐性', resLightning: '雷の耐性', resPoison: '毒の耐性', resHoly: '聖の耐性', resShadow: '闇の耐性',
  areaSize: '範囲の広さ', projectileSpeed: '飛び道具の速さ', projectileCount: '飛び道具の数', durationSkill: 'スキルの効果時間', manaCost: '魔力の消費',
  healPower: '回復の効き目', shieldPower: '守りの膜の強さ', minionLife: '仲間の体力', minionCount: '仲間の数', auraEffect: '加護の効き目',
  stunChance: '気絶させる確率', bleedChance: '出血させる確率', poisonChance: '毒にする確率', burnChance: '燃やす確率', freezeChance: '凍らせる確率', shockChance: '感電させる確率',
  goldFind: 'お金の見つけやすさ', itemFind: '宝の見つけやすさ', xpGain: '経験値の増え方', lightRadius: '明かりの広さ',
});
export const DMG_TYPE_LABELS = Object.freeze({ phys: '物理', fire: '火', cold: '冷気', lightning: '雷', poison: '毒', holy: '聖', shadow: '闇' });
const MINUS = '−';
const num = (v) => String(Math.round(v * 100) / 100);
const signed = (v) => (v < 0 ? MINUS + num(-v) : '+' + num(v));
export function formatMod(m) {
  const label = STAT_LABELS[m.key] ?? m.key;
  const v = m.value;
  if (m.mode === 'more') {
    const f = (x) => num(1 + x / 100);
    return Array.isArray(v) ? `${label} ×${f(v[0])}〜${f(v[1])}` : `${label} ×${f(v)}`;
  }
  const pct = m.mode === 'inc' ? '%' : '';
  if (Array.isArray(v)) return `${label} ${signed(v[0])}〜${num(Math.abs(v[1]))}${pct}`;
  return `${label} ${signed(v)}${pct}`;
}

/* ---------------- 暗さの網目（Bayer 4×4） ---------------- */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const ditherOn = (level, x, y) => ((BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16 < level ? 1 : 0);

/* ---------------- 説明の吹き出しで見せる計算（設計書 §5） ---------------- */
export const hitChance = (acc, eva) => clamp(acc / (acc + eva * 0.5 || 1), 0.05, 0.95);
export const physTaken = (dmg, armor) => (dmg <= 0 ? 0 : dmg * (1 - armor / (armor + 5 * dmg)));
export const resCapped = (r) => Math.min(r, 75);

/* ---------------- そのほか ---------------- */
export const xpToNext = (L) => Math.round(100 * L ** 1.8);
export function cdFraction(cd, now) {
  if (!cd || !cd.total) return 0;
  return clamp((cd.until - now) / cd.total, 0, 1);
}
// 文字列から決まった数（仮の絵の色や形を id ごとに変える）
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// 決まった順の乱数（同じ種なら同じ並び）
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a ^= a << 13; a >>>= 0; a ^= a >> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
}
