// 種（seed）を決めると、毎回同じ並びの数を返す乱数。
// Math.random() は開くたびに違う数を返すので、同じコースのデータから毎回同じ景色を作るには、こちらを使う。
// しくみは「mulberry32」という、短くて速い、広く使われている作り方。

export function createRandom(seed) {
  let state = seed >>> 0;

  // 0 以上 1 未満の数
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    // min 以上 max 未満の数
    range: (min, max) => min + (max - min) * next(),
    // min 以上 max 以下の整数
    integer: (min, max) => Math.floor(min + (max - min + 1) * next()),
    // 配列から 1 つ選ぶ
    pick: (list) => list[Math.floor(next() * list.length)],
  };
}
