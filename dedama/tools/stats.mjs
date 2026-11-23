// 台ごとの実測と理論の比べ、12 時間の日を多数回遊んだときの勝ち負けの分布を出す。
// 使い方: node dedama/tools/stats.mjs [日数=2000] [--json 出力先]
import { writeFileSync } from 'node:fs';
import { MACHINES } from '../sim/machines.mjs';
import { createSession, YEN_PER_BALL } from '../sim/sim.mjs';

const DAYS = Number(process.argv[2]) || 2000;
const outIdx = process.argv.indexOf('--json');
const cont = (oneIn, n) => 1 - (1 - 1 / oneIn) ** n;
const out = [];

for (const m of MACHINES) {
  const long = createSession({ machine: m.id, seed: 99, hours: 4000 });
  long.advanceTo(Infinity);
  const st = long.stats;
  const rate = (o) => (o.n ? o.hits / o.n : NaN);
  const ep = Object.fromEntries(Object.entries(st.episodes).filter(([, v]) => v.n).map(([k, v]) => [k, +(v.hit / v.n).toFixed(4)]));
  const days = [];
  let wan = 0, gyaku = 0, chains = [];
  for (let d = 1; d <= DAYS; d++) {
    const s = createSession({ machine: m.id, seed: d * 7919 });
    s.advanceTo(Infinity);
    days.push(s.state.sa);
    if (s.state.maxSa >= 10000) wan++;
    if (s.state.minSa <= -10000) gyaku++;
    chains.push(s.state.maxChain);
  }
  days.sort((a, b) => a - b);
  const q = (p) => days[Math.floor(p * (days.length - 1))];
  const mean = days.reduce((a, b) => a + b, 0) / days.length;
  const row = {
    id: m.id, name: m.name, type: m.type,
    normal: { spec: +(1 / m.normal).toFixed(5), got: +rate(st.spins.normal).toFixed(5) },
    rpk: { spec: m.rpk, got: +(st.normal.entries / (st.normal.net / 250)).toFixed(2) },
    spinsPerHour: Math.round(st.spins.normal.n / (st.normal.time / 3600)),
    continuation: ep,
    avgPayout: { heso: Math.round(st.hits.heso.payout / st.hits.heso.n), den: Math.round(st.hits.den.payout / st.hits.den.n) },
    day: { meanBalls: Math.round(mean), meanYen: Math.round(mean * YEN_PER_BALL), p10: q(0.1), median: q(0.5), p90: q(0.9), win: +(days.filter((x) => x > 0).length / DAYS).toFixed(3), wan: +(wan / DAYS).toFixed(3), gyaku: +(gyaku / DAYS).toFixed(3), maxChainMedian: chains.sort((a, b) => a - b)[DAYS >> 1] },
  };
  out.push(row);
  console.log(`${m.name}（${m.type}）`);
  console.log(`  通常時 1/${(1 / row.normal.got).toFixed(1)}（仕様 1/${m.normal}）  回転率 ${row.rpk.got}（仕様 ${m.rpk}）  通常時 ${row.spinsPerHour} 回転/時`);
  console.log(`  継続（電サポの種類ごと）: ${JSON.stringify(ep)}  平均出玉 ヘソ ${row.avgPayout.heso}・電チュー ${row.avgPayout.den}`);
  console.log(`  12 時間 × ${DAYS} 日: 平均 ${row.day.meanBalls} 玉（${row.day.meanYen} 円）、下位 10% ${row.day.p10}、中央 ${row.day.median}、上位 10% ${row.day.p90}、勝ち ${(row.day.win * 100).toFixed(1)}%、万発 ${(row.day.wan * 100).toFixed(1)}%、逆万発 ${(row.day.gyaku * 100).toFixed(1)}%`);
}
if (outIdx > 0) writeFileSync(process.argv[outIdx + 1], JSON.stringify({ days: DAYS, machines: out }, null, 2));
// 理論の継続（比べ用）
console.log('\n理論の継続: 商店街 時短', cont(319.7, 100).toFixed(4), '/ ハムスター ST', cont(7.9, 8).toFixed(4), '時短', cont(99.9, 42).toFixed(4),
  '/ 夜行列車 ST', cont(79.9, 120).toFixed(4), '時短', cont(199.8, 100).toFixed(4), '/ カニ ST', cont(99.4, 163).toFixed(4),
  '/ 大仏 RUSH', (1 - (1 - 1 / 7.4 - 1 / 319.7) ** 11).toFixed(4), '/ 花火 時短', cont(399.6, 100).toFixed(4));
