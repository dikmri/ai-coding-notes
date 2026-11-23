// 持ち物の升目（10×6）と倉庫（12×10）、装備の部位（純粋な関数）
import { SLOTS } from '../shared/schema.mjs';

export function fits(items, W, H, w, h, x, y, ignoreUid) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + w > W || y + h > H) return false;
  for (const it of items) {
    if (it.uid === ignoreUid) continue;
    if (x < it.x + it.w && x + w > it.x && y < it.y + it.h && y + h > it.y) return false;
  }
  return true;
}

// 上の行から左へ順に、最初に入る場所
export function findSpace(items, W, H, w, h, ignoreUid) {
  for (let y = 0; y + h <= H; y++) for (let x = 0; x + w <= W; x++) if (fits(items, W, H, w, h, x, y, ignoreUid)) return { x, y };
  return null;
}

// 薬などは同じ物に重ねる。残りは空いている升へ。入りきらなければ ok:false（item.qty は残りの数）
export function addItem(items, W, H, item, D) {
  if (item.consumable) {
    const max = D?.consumables?.[item.base]?.stack ?? 20;
    let q = item.qty ?? 1;
    for (const it of items) {
      if (!q) break;
      if (it.consumable && it.base === item.base && (it.qty ?? 1) < max) {
        const take = Math.min(max - (it.qty ?? 1), q);
        it.qty = (it.qty ?? 1) + take; q -= take;
      }
    }
    item.qty = q;
    if (!q) return { ok: true, merged: true };
  }
  const pos = findSpace(items, W, H, item.w, item.h);
  if (!pos) return { ok: false, code: 'full' };
  item.x = pos.x; item.y = pos.y;
  items.push(item);
  return { ok: true, placed: item };
}

export function slotFor(item, equip) {
  if (!item?.slot) return null;
  if (item.slot === 'ring') return !equip.ring1 ? 'ring1' : !equip.ring2 ? 'ring2' : 'ring1';
  return SLOTS.includes(item.slot) ? item.slot : null;
}
export const slotAccepts = (slot, item) => !!item && (item.slot === slot || (item.slot === 'ring' && (slot === 'ring1' || slot === 'ring2')));

// 装備 1 つが与える修正（基本の品の防御を含む）
export function itemMods(item) {
  const out = [];
  for (const m of item?.mods ?? []) out.push({ key: m.key, mode: m.mode, value: m.value });
  if (item?.armor) out.push({ key: 'armor', mode: 'flat', value: item.armor });
  return out;
}
