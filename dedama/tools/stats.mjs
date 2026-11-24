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
    // 振り分けの表ごと（ST リセットは数えない）
    avgPayout: Object.fromEntries(Object.entries(st.hits).filter(([, h]) => h.n).map(([k, h]) => [k, Math.round(h.payout / h.n)])),
    resets: st.resets,
    day: { meanBalls: Math.round(mean), meanYen: Math.round(mean * YEN_PER_BALL), p10: q(0.1), median: q(0.5), p90: q(0.9), win: +(days.filter((x) => x > 0).length / DAYS).toFixed(3), wan: +(wan / DAYS).toFixed(3), gyaku: +(gyaku / DAYS).toFixed(3), maxChainMedian: chains.sort((a, b) => a - b)[DAYS >> 1] },
  };
  out.push(row);
  console.log(`${m.name}（${m.type}）`);
  console.log(`  通常時 1/${(1 / row.normal.got).toFixed(1)}（仕様 1/${m.normal}）  回転率 ${row.rpk.got}（仕様 ${m.rpk}）  通常時 ${row.spinsPerHour} 回転/時`);
  console.log(`  継続（電サポの種類ごと）: ${JSON.stringify(ep)}  平均出玉 ${Object.entries(row.avgPayout).map(([k, v]) => `${k} ${v}`).join('・')}${row.resets ? `、ST リセット ${row.resets} 回` : ''}`);
  console.log(`  12 時間 × ${DAYS} 日: 平均 ${row.day.meanBalls} 玉（${row.day.meanYen} 円）、下位 10% ${row.day.p10}、中央 ${row.day.median}、上位 10% ${row.day.p90}、勝ち ${(row.day.win * 100).toFixed(1)}%、万発 ${(row.day.wan * 100).toFixed(1)}%、逆万発 ${(row.day.gyaku * 100).toFixed(1)}%`);
}
if (outIdx > 0) writeFileSync(process.argv[outIdx + 1], JSON.stringify({ days: DAYS, machines: out }, null, 2));
// 理論の継続（台の設定から計算する。ST・時短は 1 − (1 − 1/確率)^回数、RUSH は小当たりと 1 種を足した確率）
// 振り分けの表（[重み, ラウンド数, 次の状態] の並び）を全部集める（heso・den・battle・lt など）
const isTable = (v) => Array.isArray(v) && v.length && Array.isArray(v[0]) && v[0].length === 3;
const nx = (m) => Object.values(m).filter(isTable).flat().map((r) => r[2]);
for (const m of MACHINES) {
  const parts = [];
  const seen = new Set();
  for (let n of nx(m)) for (; n; n = n.then) {
    const key = (n.key ?? n.mode) + n.spins;
    if (seen.has(key) || n.mode === 'normal') continue;
    seen.add(key);
    const name = n.label ?? 'ST';
    if (n.mode === 'kakuhen') parts.push('確変 1（次回まで）');
    else if (n.mode === 'st' && n.p === 1) parts.push(`${name} ${n.spins} 回 毎回当たり（続くかは ${n.table} の表）`);
    else if (n.mode === 'st') parts.push(`${name} ${n.spins} 回 ${cont(n.p ?? m.high, n.spins).toFixed(4)}`);
    else if (n.mode === 'jitan') parts.push(`時短 ${n.spins} 回 ${cont(m.normal, n.spins).toFixed(4)}`);
    else if (n.mode === 'rush') parts.push(`RUSH ${n.spins} 回 ${(1 - (1 - 1 / m.koatari - 1 / m.normal) ** n.spins).toFixed(4)}`);
  }
  console.log(`理論の継続 ${m.name}: ${parts.join('、')}`);
}
