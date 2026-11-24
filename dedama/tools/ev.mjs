// 台ごとの「通常時 1 回転の価値（円）」を、12 時間の日を多数回遊んで求める。累計データの期待値の線に使う。
// 1 回転の価値 = Σ(差玉 + 通常時に使った玉) × 4 円 ÷ Σ 通常時の回転数。閉店で RUSH・確変が途中で終わる分も含む
// （仕様の border は閉店のない連続運転の値なので、1 日の遊びでは少し甘い）。
// 使い方: node dedama/tools/ev.mjs [日数=20000] [台の id ...]
import { MACHINES } from '../sim/machines.mjs';
import { createSession, YEN_PER_BALL } from '../sim/sim.mjs';

const DAYS = Number(process.argv[2]) || 20000;
const only = process.argv.slice(3);
for (const m of MACHINES) {
  if (only.length && !only.includes(m.id)) continue;
  const t0 = Date.now();
  let n = 0, gain = 0;
  const perDay = [];
  for (let d = 1; d <= DAYS; d++) {
    const s = createSession({ machine: m.id, seed: (d * 2654435761 + 977) >>> 0 });
    s.advanceTo(Infinity);
    n += s.stats.spins.normal.n;
    gain += s.state.sa + s.stats.normal.net;
    perDay.push([s.stats.spins.normal.n, s.state.sa + s.stats.normal.net]);
  }
  const v = (gain * YEN_PER_BALL) / n;
  // 1 回転の価値の標準誤差（日ごとの比の推定。デルタ法）
  const mn = n / DAYS, mg = gain / DAYS;
  let s2 = 0;
  for (const [a, b] of perDay) s2 += (b - (mg / mn) * a) ** 2;
  const se = (Math.sqrt(s2 / (DAYS - 1)) / mn / Math.sqrt(DAYS)) * YEN_PER_BALL;
  console.log(`${m.id.padEnd(9)} spinValue ${v.toFixed(2)} 円（±${se.toFixed(2)}）  1 日のボーダー ${(1000 / v).toFixed(2)}（仕様 ${m.border}）  ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
}
