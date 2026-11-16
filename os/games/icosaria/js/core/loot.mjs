// 装備（武具）のランダムな生成。レア度、部位、基礎の名前、屈折銘（ランダムな付加効果）を決める
// data: { rarities: [{ id, weight, affixes: [最小, 最大] }], slots: [{ id, bases }], affixes: [{ id, stat, min, max, slots }], uniques: [{ name, slot }] }

// 周回の面（1〜20）が進むほど、屈折銘の値の上限が上がる
export const faceScale = (face = 1) => 1 + (Math.max(1, face) - 1) * 0.12;

// 面が進むと、上のレア度の重みが増える（白晶は減る）
export function rollRarity(rng, data, { face = 1, luck = 0 } = {}) {
  const boost = 1 + (Math.max(1, face) - 1) * 0.25 + luck / 100;
  const list = data.rarities.map((r, i) => ({ v: r.id, w: i === 0 ? r.weight / boost : r.weight * boost }));
  return rng.weighted(list).v;
}

export function rollItem(rng, data, { ilvl = 1, face = 1, luck = 0, slot = null, rarity = null } = {}) {
  const r = rarity || rollRarity(rng, data, { face, luck });
  const rd = data.rarities.find((x) => x.id === r);
  const sl = slot ? data.slots.find((s) => s.id === slot) : rng.pick(data.slots);
  const base = rng.pick(sl.bases);
  const pool = data.affixes.filter((a) => a.slots.includes(sl.id));
  const want = Math.min(pool.length, rng.int(rd.affixes[0], rd.affixes[1]));
  const chosen = [];
  const left = [...pool];
  // レベルが高いほど値が上の方に寄る
  const lvlBias = Math.min(1, 0.35 + ilvl * 0.06);
  for (let i = 0; i < want; i++) {
    const k = Math.floor(rng.next() * left.length);
    const a = left.splice(k, 1)[0];
    const top = a.max * faceScale(face);
    const v = Math.max(a.min, Math.round(a.min + (top - a.min) * Math.min(1, rng.next() * lvlBias + rng.next() * 0.3)));
    chosen.push({ id: a.id, stat: a.stat, v: Math.min(Math.ceil(top), v) });
  }
  const item = { slot: sl.id, base, rarity: r, ilvl, affixes: chosen, uid: Math.floor(rng.next() * 1e9).toString(36) };
  // 虹刻は固有の装備になる（部位が合うものがあれば）
  if (r === 'icosa' && data.uniques) {
    const u = data.uniques.filter((x) => x.slot === sl.id);
    if (u.length) item.unique = rng.pick(u).name;
  }
  return item;
}
