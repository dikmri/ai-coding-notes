// 種つきの乱数（mulberry32）。同じ種なら同じ並びになるので、装備のドロップや迷宮の生成を再現できる
export function makeRng(seed = Date.now()) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    // [{ v, w }] から重みに比例して1つ選ぶ
    weighted(list) {
      const total = list.reduce((s, x) => s + x.w, 0);
      let r = next() * total;
      for (const x of list) { if ((r -= x.w) < 0) return x; }
      return list[list.length - 1];
    },
  };
}
