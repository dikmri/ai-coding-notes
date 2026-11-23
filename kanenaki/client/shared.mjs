// 共有のデータ・地図の組み立て・計算を読み込み、画面で引きやすい形を足す。
import * as shared from '../shared/data/index.mjs';
import * as mapgen from '../shared/mapgen.mjs';
import * as calc from '../shared/calc.mjs';
import { log } from './log.mjs';

const DATA_KEYS = ['classes', 'skills', 'tree', 'bases', 'consumables', 'affixes', 'uniques', 'monsters', 'maps', 'npcs', 'quests', 'nameParts', 'statNames', 'formatMod'];

export function loadShared() {
  const data = {};
  for (const k of DATA_KEYS) data[k] = shared[k];
  const byId = (arr) => Object.fromEntries((Array.isArray(arr) ? arr : Object.values(arr || {})).map((b) => [b.id, b]));
  data.baseById = { ...byId(data.bases), ...byId(data.consumables) };
  data.uniqueById = byId(data.uniques);
  data.affixById = byId(data.affixes);
  log('data.load', { skills: Object.keys(data.skills).length, maps: Object.keys(data.maps).length });
  return { data, mapgen, calc };
}
