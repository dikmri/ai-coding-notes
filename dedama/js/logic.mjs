// 画面側の純粋な部分（DOM に触らない）。テストは tests/dedama-logic.test.mjs。

// ---- 連チャンの色 ----
// 0 = 通常（水色）、1 = 白、2 = 薄い黄、3 = 黄、4 = 橙、5〜6 = 赤、7〜9 = 桃、10〜14 = 紫、15〜19 = 金、20〜 = 虹
const CHAIN_STEPS = [
  [20, null], [15, '#ffc93c'], [10, '#b24ad6'], [7, '#ff5ad0'], [5, '#ff4a4a'], [4, '#ff9a2e'], [3, '#ffd84a'], [2, '#fff3a0'], [1, '#ffffff'], [0, '#63c6ff'],
];
const hex2 = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
// 色相 h（0〜1）の鮮やかな色
export function hueColor(h) {
  const k = (n) => (n + h * 6) % 6;
  const f = (n) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return `#${hex2(255 * f(5))}${hex2(255 * f(3))}${hex2(255 * f(1))}`;
}
export function chainColor(chain, phase = 0) {
  for (const [n, c] of CHAIN_STEPS) if (chain >= n) return c ?? hueColor(((phase % 1) + 1) % 1);
  return CHAIN_STEPS.at(-1)[1];
}
export const chainLabel = (chain) => (chain >= 2 ? `${chain}連` : '');

// ---- グラフの列（横軸の 1 画素 = 1 列にまとめる） ----
export class Columns {
  constructor(endT, width) {
    this.endT = endT; this.width = width;
    this.min = new Float64Array(width); this.max = new Float64Array(width); this.last = new Float64Array(width); this.chain = new Uint16Array(width);
    this.count = 0; // 値の入った列の数
  }
  index(t) { return Math.min(this.width - 1, Math.max(0, Math.floor((t / this.endT) * this.width))); }
  add([t, sa, chain]) {
    const i = this.index(t);
    if (i >= this.count) {
      const prev = this.count ? this.last[this.count - 1] : sa;
      const prevChain = this.count ? this.chain[this.count - 1] : 0;
      for (let j = this.count; j < i; j++) { this.min[j] = this.max[j] = this.last[j] = prev; this.chain[j] = prevChain; }
      this.min[i] = this.max[i] = this.last[i] = sa; this.chain[i] = chain;
      this.count = i + 1;
      return;
    }
    if (sa < this.min[i]) this.min[i] = sa;
    if (sa > this.max[i]) this.max[i] = sa;
    this.last[i] = sa;
    if (chain > this.chain[i]) this.chain[i] = chain;
  }
  col(i) { return { min: this.min[i], max: this.max[i], last: this.last[i], chain: this.chain[i] }; }
}

// ---- 縦軸の幅 ----
export function yRange(lo, hi) {
  lo = Math.min(lo, -5000); hi = Math.max(hi, 5000);
  const span = hi - lo;
  const step = span > 80000 ? 20000 : span > 40000 ? 10000 : 5000;
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

// ---- 晩ごはんの段階（収支の円） ----
export const MEALS = {
  S: { name: '高級寿司', line: '大将、いちばん良いところを全部！' },
  A: { name: '焼肉', line: '今日はタン塩からいこう' },
  B: { name: 'カップラーメン', line: 'まあ、こんな日もある' },
  C: { name: 'もやし炒め', line: '給料日まであと 9 日' },
  D: { name: 'パチンコ屋でもらった飴', line: '……甘い' },
};
export function mealTier(yen) {
  if (yen >= 50000) return 'S';
  if (yen >= 15000) return 'A';
  if (yen > -15000) return 'B';
  if (yen > -40000) return 'C';
  return 'D';
}

// ---- 時間の速さ ----
export const BASE_SPEED = 240; // 12 時間を 3 分で
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
export function speedInfo(index, t, endT) {
  const mult = SPEEDS[index];
  const remainSec = Math.max(0, endT - t) / (BASE_SPEED * mult);
  const m = Math.floor(remainSec / 60), s = Math.round(remainSec % 60);
  const name = mult === 1 ? '標準' : mult < 1 ? `標準の ${mult} 倍（ゆっくり）` : `標準の ${mult} 倍`;
  return { mult, remainSec, text: `${name}（閉店まで あと ${m ? `${m} 分 ` : ''}${s} 秒）` };
}

// ---- 今日の回転率（店の釘。日と台で決まる） ----
const OFFSETS = [-1.5, -1, -1, -0.5, -0.5, -0.5, 0, 0, 0, 0.5, 0.5, 1, 1.5];
function hash(a, b) {
  let h = 2166136261 ^ a;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
export function todayRpk(machine, daySeed) {
  return machine.rpk + OFFSETS[hash(daySeed >>> 0, machine.id) % OFFSETS.length];
}

// ---- 万発・逆万発の線を越えた瞬間（seen に覚えて 1 日 1 回） ----
export function milestoneCross(prev, now, seen) {
  const out = [];
  for (let k = 1; k <= 9; k++) {
    const line = k * 10000, id = `wan${k}`;
    if (prev < line && now >= line && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  if (prev > -10000 && now <= -10000 && !seen.has('gyaku')) { seen.add('gyaku'); out.push('gyaku'); }
  return out;
}
