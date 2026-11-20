// 『鐘なき王国』のデータの検査（5）: サーバーの係の読み込み（kanenaki/sim/data.mjs の normalize）に通しても
// 警告が出ず、どのデータも落とされないことを確かめる。サーバーの読み方が変わったときの食い違いを早く見つける。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../kanenaki/shared/data/index.mjs';
import { normalize } from '../kanenaki/sim/data.mjs';
import { KNOWN_RULES } from '../kanenaki/shared/calc.mjs';

const NAMES = ['classes', 'skills', 'tree', 'bases', 'consumables', 'affixes', 'uniques', 'monsters', 'maps', 'npcs', 'quests', 'phrases', 'stamps', 'nameParts'];

// 取りまとめ役を通して、サーバーの係に calc.mjs の KNOWN_RULES へ足してもらう要の決まり
export const REQUESTED_RULES = []; // 頼んでいた決まり（perfectParry・shadowFirst・twoStances・healEcho・oneGreatMinion）は calc.mjs の KNOWN_RULES に入った

const raw = Object.fromEntries(NAMES.map((n) => [n, D[n]]));
const warns = [];
const out = normalize(raw, (event, args) => warns.push({ event, ...args }));

test('normalize: 警告が出ない（まだサーバーに無い要の決まりは、頼んだ一覧の中だけ）', () => {
  const unknownRules = warns.filter((w) => w.event === 'data.unknownRule');
  for (const w of unknownRules) assert.ok(REQUESTED_RULES.includes(w.rule), `頼んでいない要の決まり ${w.rule}（${w.node}）`);
  assert.deepEqual(warns.filter((w) => w.event !== 'data.unknownRule'), []);
  // 頼んだ決まりがサーバーに入ったら、この一覧から外す
  for (const r of REQUESTED_RULES) if (KNOWN_RULES[r]) assert.fail(`${r} はもう KNOWN_RULES にある。REQUESTED_RULES から外す`);
});

test('normalize: 職業・スキル・ツリー・品・魔物・地図・NPC・依頼が 1 つも落とされない', () => {
  assert.equal(Object.keys(out.classes).length, Object.keys(D.classes).length);
  for (const [cls, c] of Object.entries(out.classes)) assert.equal(c.skills.length, D.classes[cls].skills.length, `${cls} のスキル`);
  assert.equal(Object.keys(out.skills).length, Object.keys(D.skills).length);
  assert.equal(Object.keys(out.tree.nodes).length, Object.keys(D.tree.nodes).length);
  assert.deepEqual(out.tree.starts, D.tree.starts);
  assert.equal(Object.keys(out.bases).length, D.bases.length);
  assert.equal(Object.keys(out.consumables).length, D.consumables.length);
  assert.equal(out.affixes.length, D.affixes.length);
  assert.equal(out.uniques.length, D.uniques.length);
  assert.equal(Object.keys(out.monsters).length, Object.keys(D.monsters).length);
  assert.equal(Object.keys(out.maps).length, Object.keys(D.maps).length);
  for (const [id, m] of Object.entries(out.maps)) assert.equal(m.portals.length, D.maps[id].portals.length, `${id} の出入口`);
  assert.equal(Object.keys(out.npcs).length, Object.keys(D.npcs).length);
  assert.equal(Object.keys(out.quests).length, Object.keys(D.quests).length);
  assert.equal(out.phrases.length, D.phrases.length);
  assert.equal(out.stamps.length, D.stamps.length);
});

test('normalize: 消耗品の使い道と依頼の条件が、こちらの数のまま読まれる', () => {
  assert.deepEqual(out.consumables.potion_life_big.use, { healPct: 60 });
  assert.deepEqual(out.consumables.potion_mana.use, { manaPct: 35 });
  assert.deepEqual(out.consumables.scroll_return.use, { portal: true });
  assert.deepEqual(out.consumables.holy_water_forget.use, { respec: 1 });
  assert.deepEqual(out.quests.q_trial.needs, [{ kind: 'kill', id: 'bone_soldier', count: 5 }, { kind: 'kill', id: 'mud_imp_slinger', count: 5 }]);
  assert.deepEqual(out.quests.q_herbs.needs, [{ kind: 'collect', id: 'bog_herb', count: 8 }]);
  assert.equal(out.quests.q_shards.requires, 'q_bones');
  assert.equal(out.quests.q_shards.minLevel, 14);
  // 依頼主の居場所がわかる（サーバーは依頼主の近くでだけ受けさせる）
  for (const q of Object.values(out.quests)) assert.ok(out.npcLocation[q.giver], `${q.id}: 依頼主 ${q.giver} の居場所`);
});
