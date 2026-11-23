// 持ち物とスキルの小さな絵（ドット）。絵の係の一覧に品物とスキルの絵が無いので、画面で描く。
// どれもこのゲームのために作った形（既存のゲームのアイコンをまねない）。
import { presetFor } from '../fx.mjs';
import { RARITIES } from '../../shared/schema.mjs';

const cache = new Map();
const C = (r, g, b) => `rgb(${r},${g},${b})`;

function px(ctx, pts, col) { ctx.fillStyle = col; for (const [x, y, w = 1, h = 1] of pts) ctx.fillRect(x, y, w, h); }
function line(ctx, x0, y0, x1, y1, col, wdt = 1) {
  ctx.fillStyle = col;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), wdt, wdt);
}
function disc(ctx, cx, cy, r, col) { ctx.fillStyle = col; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) ctx.fillRect(cx + x, cy + y, 1, 1); }

const STEEL = C(200, 206, 216), STEEL_D = C(120, 128, 140), WOOD = C(130, 88, 50), WOOD_D = C(86, 56, 32), GOLD = C(222, 182, 82), LEATHER = C(142, 98, 60), CLOTH = C(170, 160, 140);

// 品物の絵: w×h マス（1 マス = 16 ドット）
export function itemIcon(item, data) {
  const base = data?.baseById?.[item.base] || {};
  const kind = item.kind || base.kind || 'misc';
  const w = (item.w || base.w || 1) * 16, h = (item.h || base.h || 1) * 16;
  // 薬の色を分ける（base.use は { healPct, manaPct, ... } の形。魔力だけを戻す薬は青）
  const u = base.use && typeof base.use === 'object' ? base.use : {};
  const useKind = (u.manaPct || u.mana) && !(u.healPct || u.heal) ? 'mana' : '';
  const key = `${kind}|${w}|${h}|${useKind}|${item.rarity || ''}`;
  let cv = cache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const cx = w >> 1, cy = h >> 1;
  switch (kind) {
    case 'sword': case 'greatsword': {
      line(c, cx, 2, cx, h - 9, STEEL, 2); line(c, cx + 1, 2, cx + 1, h - 9, C(236, 240, 246)); px(c, [[cx - 4, h - 9, 10, 2]], GOLD); line(c, cx, h - 7, cx, h - 3, WOOD, 2); px(c, [[cx - 1, h - 3, 4, 2]], GOLD);
      if (kind === 'greatsword') { line(c, cx - 2, 4, cx - 2, h - 10, STEEL_D); line(c, cx + 3, 4, cx + 3, h - 10, STEEL_D); }
      break;
    }
    case 'dagger': line(c, cx, 3, cx, h - 10, STEEL, 2); px(c, [[cx - 3, h - 10, 8, 2]], STEEL_D); line(c, cx, h - 8, cx, h - 3, LEATHER, 2); break;
    case 'axe': line(c, cx + 2, 3, cx + 2, h - 3, WOOD, 2); disc(c, cx - 3, 10, 6, STEEL_D); disc(c, cx - 3, 10, 4, STEEL); px(c, [[cx + 1, 4, 4, 12]], C(16, 12, 20)); line(c, cx + 2, 3, cx + 2, h - 3, WOOD, 2); break;
    case 'staff': line(c, cx, 6, cx, h - 2, WOOD, 2); line(c, cx + 1, 6, cx + 1, h - 2, WOOD_D); disc(c, cx, 5, 4, C(120, 200, 255)); disc(c, cx - 1, 4, 1, C(230, 250, 255)); break;
    case 'scepter': line(c, cx, 10, cx, h - 2, GOLD, 2); disc(c, cx, 7, 5, GOLD); disc(c, cx, 7, 2, C(255, 120, 90)); break;
    case 'knuckle': for (let i = 0; i < 4; i++) disc(c, 7 + i * 6, cy - 2, 3, STEEL); px(c, [[4, cy + 2, w - 8, 6]], STEEL_D); px(c, [[6, cy + 4, w - 12, 2]], LEATHER); break;
    case 'shield': disc(c, cx, cy, Math.min(cx, cy) - 2, WOOD); disc(c, cx, cy, Math.min(cx, cy) - 5, C(150, 104, 62)); disc(c, cx, cy, 3, STEEL); break;
    case 'tome': px(c, [[4, 3, w - 8, h - 6]], C(110, 50, 60)); px(c, [[6, 5, w - 12, h - 10]], C(150, 70, 80)); px(c, [[cx - 3, cy - 4, 6, 8]], GOLD); px(c, [[w - 7, 4, 2, h - 8]], C(236, 226, 200)); break;
    case 'helm': disc(c, cx, cy + 2, 10, LEATHER); px(c, [[cx - 12, cy + 4, 24, 3]], WOOD_D); px(c, [[cx - 8, cy - 6, 16, 2]], C(170, 120, 74)); break;
    case 'armor': px(c, [[6, 4, w - 12, h - 8]], CLOTH); px(c, [[2, 4, 6, 14]], CLOTH); px(c, [[w - 8, 4, 6, 14]], CLOTH); px(c, [[cx - 1, 6, 2, h - 12]], C(120, 110, 96)); for (let y = 10; y < h - 6; y += 6) px(c, [[7, y, w - 14, 1]], C(140, 130, 112)); px(c, [[cx - 4, 2, 8, 3]], C(16, 12, 20)); break;
    case 'gloves': px(c, [[6, 8, 10, 16]], LEATHER); px(c, [[16, 12, 6, 6]], LEATHER); px(c, [[6, 22, 10, 4]], WOOD_D); px(c, [[w - 14, 8, 10, 16]], C(126, 86, 52)); break;
    case 'boots': px(c, [[5, 4, 9, 18]], LEATHER); px(c, [[5, 20, 14, 6]], LEATHER); px(c, [[5, 26, 14, 2]], WOOD_D); px(c, [[w - 16, 6, 9, 18]], C(126, 86, 52)); px(c, [[w - 16, 22, 13, 6]], C(126, 86, 52)); break;
    case 'belt': px(c, [[1, cy - 3, w - 2, 6]], LEATHER); px(c, [[cx - 4, cy - 4, 8, 8]], GOLD); px(c, [[cx - 2, cy - 2, 4, 4]], LEATHER); break;
    case 'amulet': line(c, 3, 2, cx, 10, C(180, 170, 150)); line(c, w - 4, 2, cx, 10, C(180, 170, 150)); disc(c, cx, 11, 3, C(236, 228, 210)); disc(c, cx, 11, 1, C(160, 60, 70)); break;
    case 'ring': disc(c, cx, cy + 1, 5, GOLD); disc(c, cx, cy + 1, 3, 'rgba(0,0,0,0)'); c.clearRect(cx - 2, cy - 1, 5, 5); disc(c, cx, cy - 4, 2, C(120, 220, 255)); break;
    case 'potion': {
      const col = useKind === 'mana' ? C(70, 110, 230) : C(210, 40, 50);
      disc(c, cx, cy + 2, 5, col); px(c, [[cx - 2, cy - 6, 4, 4]], C(200, 220, 230)); px(c, [[cx - 2, cy - 7, 4, 2]], WOOD); px(c, [[cx - 3, cy, 2, 2]], 'rgba(255,255,255,0.7)');
      break;
    }
    case 'scroll': px(c, [[3, 4, w - 6, h - 8]], C(232, 216, 176)); px(c, [[2, 3, 3, h - 6]], C(190, 170, 130)); px(c, [[w - 5, 3, 3, h - 6]], C(190, 170, 130)); px(c, [[6, 7, w - 12, 1], [6, 10, w - 14, 1]], C(120, 90, 70)); break;
    case 'oblivion': disc(c, cx, cy + 2, 5, C(170, 220, 230)); px(c, [[cx - 1, cy - 6, 3, 4]], C(220, 240, 250)); disc(c, cx, cy + 3, 2, C(240, 255, 255)); break;
    default: disc(c, cx, cy, Math.min(cx, cy) - 3, C(180, 160, 120)); disc(c, cx - 1, cy - 1, 2, C(240, 230, 200));
  }
  cache.set(key, cv);
  return cv;
}

// スキルの絵: 24×24。vfx の型で形、ダメージの種類や vfx で色
export function skillIcon(skill) {
  const key = `sk|${skill?.id}`;
  let cv = cache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = 24; cv.height = 24;
  const c = cv.getContext('2d');
  const { kind, col } = presetFor(skill?.vfx || skill?.id, skill?.effects?.[0]?.dmg?.type);
  const main = C(...col), dim = C(col[0] * 0.5, col[1] * 0.5, col[2] * 0.5), hi = C(Math.min(255, col[0] + 60), Math.min(255, col[1] + 60), Math.min(255, col[2] + 60));
  c.fillStyle = C(24, 18, 30); c.fillRect(0, 0, 24, 24);
  c.fillStyle = C(col[0] * 0.18, col[1] * 0.18, col[2] * 0.22); c.fillRect(1, 1, 22, 22);
  switch (kind) {
    case 'slash': for (let i = 0; i < 12; i++) { const a = -2.4 + i * 0.22; px(c, [[12 + Math.round(Math.cos(a) * 8), 13 + Math.round(Math.sin(a) * 8), 2, 2]], i > 8 ? hi : main); } line(c, 5, 19, 18, 6, dim); break;
    case 'impact': for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; line(c, 12, 12, 12 + Math.round(Math.cos(a) * (i % 2 ? 6 : 9)), 12 + Math.round(Math.sin(a) * (i % 2 ? 6 : 9)), i % 2 ? dim : main); } disc(c, 12, 12, 2, hi); break;
    case 'rise': for (const x of [6, 12, 18]) { line(c, x, 19, x, 7, main); px(c, [[x - 2, 9, 1, 1], [x + 2, 9, 1, 1], [x - 1, 8, 1, 1], [x + 1, 8, 1, 1]], hi); } px(c, [[4, 20, 16, 1]], dim); break;
    case 'pillar': px(c, [[10, 3, 4, 18]], main); px(c, [[11, 3, 2, 18]], hi); px(c, [[5, 20, 14, 2]], dim); break;
    case 'orbit': for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.28; px(c, [[12 + Math.round(Math.cos(a) * 8), 12 + Math.round(Math.sin(a) * 8), 1, 1]], i % 4 ? main : hi); } disc(c, 12, 12, 3, dim); break;
    case 'burst': for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28; line(c, 12, 12, 12 + Math.round(Math.cos(a) * 9), 12 + Math.round(Math.sin(a) * 9), main); } disc(c, 12, 12, 4, hi); break;
    case 'cloud': disc(c, 8, 13, 4, dim); disc(c, 14, 11, 5, main); disc(c, 17, 15, 3, dim); break;
    case 'line': for (let i = 0; i < 5; i++) { px(c, [[3 + i * 4, 18 - i * 3, 3, 2]], i % 2 ? main : hi); } px(c, [[19, 3, 3, 3]], hi); break;
    case 'trail': for (let i = 0; i < 4; i++) px(c, [[3 + i * 3, 11, 2, 2]], dim); line(c, 12, 12, 20, 12, main, 2); line(c, 17, 8, 21, 12, main); line(c, 17, 16, 21, 12, main); break;
    case 'debris': px(c, [[3, 18, 18, 2]], dim); for (const [x, y] of [[6, 14], [11, 9], [16, 13], [13, 16]]) disc(c, x, y, 2, main); line(c, 11, 18, 13, 22, hi); break;
    case 'ring': for (const r of [4, 7, 10]) for (let i = 0; i < 20; i++) { const a = (i / 20) * 6.28; px(c, [[12 + Math.round(Math.cos(a) * r), 12 + Math.round(Math.sin(a) * r * 0.75), 1, 1]], r === 4 ? hi : main); } break;
    case 'spiral': for (let i = 0; i < 30; i++) { const a = i * 0.45, r = 1 + i * 0.3; px(c, [[12 + Math.round(Math.cos(a) * r), 12 + Math.round(Math.sin(a) * r), 1, 1]], i > 20 ? hi : main); } break;
    case 'rune': disc(c, 12, 12, 7, dim); disc(c, 12, 12, 5, C(24, 18, 30)); disc(c, 12, 12, 2, hi); px(c, [[11, 3, 2, 4], [11, 17, 2, 4], [3, 11, 4, 2], [17, 11, 4, 2]], main); break;
    default: disc(c, 12, 12, 6, main);
  }
  c.fillStyle = C(70, 56, 80); c.fillRect(0, 0, 24, 1); c.fillRect(0, 23, 24, 1); c.fillRect(0, 0, 1, 24); c.fillRect(23, 0, 1, 24);
  cache.set(key, cv);
  return cv;
}

export const rarityColor = (r) => RARITIES[r]?.color || '#d8d4c8';
