// 保存の中身（1 人用、設計書 §15）。localStorage の SAVE_KEY に、版の番号つきの JSON で 3 枠を置く。
// ここは純粋な関数だけ（localStorage・ファイルの読み書きは main.mjs）。テスト: tests/kanenaki-client-save.test.mjs
// 形: { v: SAVE_VERSION, slots: [ { char, savedAt } | null, ×3 ], last: 最後に遊んだ枠の番号 | null }
// 書き出し: { kind: 'kanenaki-save', v: SAVE_VERSION, exportedAt, char }
import { SAVE_VERSION, SAVE_SLOTS } from '../shared/schema.mjs';

export const EXPORT_KIND = 'kanenaki-save';

export const emptySave = () => ({ v: SAVE_VERSION, slots: Array(SAVE_SLOTS).fill(null), last: null });

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// 世界の計算が読めるキャラか（hello で渡す前の確かめ。細かい項目は世界の fillChar が補う）
export const charOk = (c) => isObj(c) && typeof c.id === 'string' && c.id.length > 0 && typeof c.name === 'string' && c.name.length > 0 && Number.isInteger(c.level) && c.level >= 1;
const slotOk = (s) => isObj(s) && charOk(s.char);

// 文字列 → { save, error }。error: null | 'json' | 'shape' | 'newer'
export function parseSave(text) {
  if (text == null || text === '') return { save: emptySave(), error: null };
  let o;
  try { o = JSON.parse(text); } catch { return { save: emptySave(), error: 'json' }; }
  if (!isObj(o) || !Number.isInteger(o.v) || !Array.isArray(o.slots)) return { save: emptySave(), error: 'shape' };
  if (o.v > SAVE_VERSION) return { save: emptySave(), error: 'newer' };
  const slots = Array.from({ length: SAVE_SLOTS }, (_, i) => (slotOk(o.slots[i]) ? { char: o.slots[i].char, savedAt: typeof o.slots[i].savedAt === 'string' ? o.slots[i].savedAt : null } : null));
  const last = Number.isInteger(o.last) && o.last >= 0 && o.last < SAVE_SLOTS ? o.last : null;
  return { save: { v: SAVE_VERSION, slots, last }, error: null };
}
export const serializeSave = (save) => JSON.stringify(save);

const checkIndex = (i) => { if (!Number.isInteger(i) || i < 0 || i >= SAVE_SLOTS) throw new RangeError(`枠の番号 ${i} はありません`); };
export function putSlot(save, i, char, savedAt = new Date().toISOString()) {
  checkIndex(i);
  const slots = save.slots.slice();
  slots[i] = { char, savedAt };
  return { ...save, slots, last: i };
}
export function clearSlot(save, i) {
  checkIndex(i);
  const slots = save.slots.slice();
  slots[i] = null;
  return { ...save, slots, last: save.last === i ? null : save.last };
}

export function exportSlot(save, i, at = new Date().toISOString()) {
  const s = save.slots[i];
  if (!s) return null;
  return JSON.stringify({ kind: EXPORT_KIND, v: SAVE_VERSION, exportedAt: at, char: s.char }, null, 1);
}
// 書き出した文 → { ok, char, error }
export function importText(text) {
  let o;
  try { o = JSON.parse(text); } catch { return { ok: false, error: 'JSON として読めません。' }; }
  if (!isObj(o) || o.kind !== EXPORT_KIND) return { ok: false, error: '鐘なき王国の書き出しのファイルではありません。' };
  if (!Number.isInteger(o.v) || o.v > SAVE_VERSION) return { ok: false, error: 'この画面より新しい版のファイルです。' };
  if (!charOk(o.char)) return { ok: false, error: 'キャラの中身が足りません。' };
  return { ok: true, char: o.char };
}
export function exportFileName(char, d = new Date()) {
  const name = String(char.name).replace(/[\\/:*?"<>|\s]/g, '_');
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `kanenaki-${name}-Lv${char.level}-${ymd}.json`;
}

export function slotSummary(slot, data) {
  if (!slot) return null;
  const c = slot.char;
  return { name: c.name, cls: data.classes?.[c.cls]?.name ?? c.cls ?? '冒険者', level: c.level, place: data.maps?.[c.map]?.name ?? c.map ?? '', savedAt: slot.savedAt };
}
