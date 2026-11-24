// 『今日も打とーっと』の大当り履歴と累計データ（dedama/js/record.mjs）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitKind, roundsText, hitRows, packRows, unpackRows, visitRecord, expectedYen, spinValue, addVisit, parseStore, serializeStore, totals } from '../dedama/js/record.mjs';
import { createSession } from '../dedama/sim/sim.mjs';
import { MACHINES, machineById } from '../dedama/sim/machines.mjs';

const hit = (o) => ({ type: 'hit', t: 100, sa: -500, spinsTotal: 10, fromLabel: '通常', chain: 1, rounds: 10, tokkaku: false, payout: 1400, next: 'normal', nextLabel: '通常', nextSpins: null, thenLabel: null, thenSpins: null, ...o });

test('大当りの種別: 次の状態で「通常・確変・ST・時短付き・RUSH・LT・突確」を言い分ける', () => {
  assert.equal(hitKind(hit({})), '通常');
  assert.equal(hitKind(hit({ next: 'kakuhen', nextLabel: '確変' })), '確変');
  assert.equal(hitKind(hit({ next: 'jitan', nextLabel: '時短', nextSpins: 100 })), '通常・時短 100');
  assert.equal(hitKind(hit({ next: 'st', nextLabel: 'ST', nextSpins: 163 })), 'ST 163');
  assert.equal(hitKind(hit({ next: 'st', nextLabel: 'ST', nextSpins: 8, thenLabel: '時短', thenSpins: 22 })), 'ST 8・時短 22');
  assert.equal(hitKind(hit({ next: 'st', nextLabel: 'RUSH', nextSpins: 100 })), 'RUSH 100');
  assert.equal(hitKind(hit({ next: 'rush', nextLabel: 'RUSH', nextSpins: 13 })), 'RUSH 13');
  // 1 回転で決着する状態（大一番・LT）は回数を書かない
  assert.equal(hitKind(hit({ next: 'st', nextLabel: '大一番', nextSpins: 1 })), '大一番');
  assert.equal(hitKind(hit({ next: 'st', nextLabel: 'LT', nextSpins: 1 })), 'LT');
  assert.equal(hitKind(hit({ tokkaku: true, next: 'kakuhen', nextLabel: '確変' })), '突確');
  assert.equal(hitKind({ type: 'reset', nextLabel: 'LT', spins: 144 }), '空振り');
});

test('ラウンドの書き方: 20R 以上で 10 の倍数は「10R×n」', () => {
  assert.equal(roundsText(10), '10R');
  assert.equal(roundsText(16), '16R');
  assert.equal(roundsText(20), '10R×2');
  assert.equal(roundsText(50), '10R×5');
  assert.equal(roundsText(0), '−');
});

test('大当り履歴の行: 回転数は前の行（大当り・空振り）からの数で、空振りは番号を付けない', () => {
  const ev = [
    { type: 'cash', t: 5, invest: 1000 },
    hit({ t: 900, spinsTotal: 245, fromLabel: '通常', chain: 1, next: 'st', nextLabel: 'ST', nextSpins: 120, sa: -3000 }),
    { type: 'bonusEnd', t: 960 },
    hit({ t: 1200, spinsTotal: 268, fromLabel: 'ST', chain: 2, rounds: 20, payout: 2800, next: 'st', nextLabel: 'ST', nextSpins: 120, sa: -1700 }),
    { type: 'reset', t: 1500, spinsTotal: 300, fromLabel: 'ST', chain: 2, sa: -800, nextLabel: 'ST', spins: 120 },
    hit({ t: 1700, spinsTotal: 305, fromLabel: 'ST', chain: 3, sa: -900 }),
  ];
  const rows = hitRows(ev);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.no), [1, 2, null, 3]);
  assert.deepEqual(rows.map((r) => r.spins), [245, 23, 32, 5]);
  assert.deepEqual(rows.map((r) => r.kind), ['ST 120', 'ST 120', '空振り', '通常']);
  assert.deepEqual(rows.map((r) => r.from), ['通常', 'ST', 'ST', 'ST']);
  assert.deepEqual(rows.map((r) => r.payout), [1400, 2800, 0, 1400]);
  assert.deepEqual(rows.map((r) => r.chain), [1, 2, 2, 3]);
  assert.equal(rows[0].sa, -3000);
  assert.equal(rows[1].rounds, 20);
  assert.equal(rows[2].rounds, 0);
});

test('大当り履歴の行: 本物の 1 日では、行の回転数の合計が最後の当たりまでの総回転数になる', () => {
  for (const id of ['dynamite', 'hamster', 'yokozuna', 'maneki']) {
    const s = createSession({ machine: id, seed: 21 });
    s.advanceTo(Infinity);
    const rows = hitRows(s.events);
    const nHits = rows.filter((r) => r.no != null).length;
    assert.equal(nHits, s.state.hitsTotal, `${id} 大当りの数`);
    assert.equal(rows.length, s.state.hitsTotal + s.events.filter((e) => e.type === 'reset').length, `${id} 空振りも行になる`);
    const last = s.events.filter((e) => e.type === 'hit' || e.type === 'reset').at(-1);
    if (last) assert.equal(rows.reduce((a, r) => a + r.spins, 0), last.spinsTotal, `${id} 回転数の合計`);
    assert.ok(rows.every((r) => r.spins >= 1), `${id} どの行も 1 回転以上`);
  }
});

test('大当り履歴は詰めて保存し、元に戻せる', () => {
  const s = createSession({ machine: 'hanabi', seed: 11, hours: 200 });
  s.advanceTo(Infinity);
  const rows = hitRows(s.events);
  const back = unpackRows(JSON.parse(JSON.stringify(packRows(rows))));
  assert.equal(back.length, rows.length);
  // 時刻は秒に丸める。ほかは同じ
  assert.deepEqual(back, rows.map((r) => ({ ...r, t: Math.round(r.t) })));
  assert.ok(back.some((r) => r.tokkaku), '突確も戻る');
});

test('期待値: 通常時の回転数 × 1 回転の価値 − 通常時に使った玉の代金', () => {
  const m = { border: 20 };
  assert.equal(spinValue(m), 50, '1 回転の価値が無い台は 1,000 円 ÷ ボーダー');
  assert.equal(spinValue({ border: 20, spinValue: 47.5 }), 47.5);
  assert.equal(expectedYen(m, 1000, 12500), 1000 * 50 - 12500 * 4);
  assert.equal(expectedYen(m, 0, 0), 0);
  assert.ok(expectedYen({ border: 20 }, 1000, 250 * 1000 / 18) < 0, '回転率 18 ＜ ボーダー 20 なら負け');
  // 台ごとの 1 回転の価値（12 時間の日で求めた値）は、連続運転のボーダーの値に近い（閉店の取りこぼしの分だけ低めになりやすい）
  for (const x of MACHINES) assert.ok(x.spinValue > 0 && Math.abs(x.spinValue / (1000 / x.border) - 1) < 0.08, `${x.id} 1 回転の価値 ${x.spinValue}`);
});

test('期待値: 多くの日の平均は、実際の収支の平均と 4σ の幅で合う', () => {
  for (const id of ['dynamite', 'laundry', 'maneki']) {
    const m = machineById(id);
    const diff = [];
    for (let d = 1; d <= 400; d++) {
      const s = createSession({ machine: id, seed: d * 6151 + 7 });
      s.advanceTo(Infinity);
      diff.push(s.state.sa * 4 - expectedYen(m, s.stats.spins.normal.n, s.stats.normal.net));
    }
    const mean = diff.reduce((a, b) => a + b, 0) / diff.length;
    const sd = Math.sqrt(diff.reduce((a, b) => a + (b - mean) ** 2, 0) / (diff.length - 1));
    assert.ok(Math.abs(mean) < (4 * sd) / Math.sqrt(diff.length), `${id}: 実際 − 期待値の平均 ${Math.round(mean)} 円（4σ ${Math.round((4 * sd) / 20)}）`);
  }
});

test('1 回の来店の記録: 収支 = 回収 − 投資、期待値と大当り履歴を持つ', () => {
  const m = machineById('crab');
  const s = createSession({ machine: m.id, seed: 8, rpk: 16.5 });
  s.advanceTo(Infinity);
  const r = visitRecord({ machine: m, rpk: 16.5, seed: 8, session: s, day: 20000 }, 1767225600000);
  assert.equal(r.m, 'crab');
  assert.equal(r.at, 1767225600000);
  assert.equal(r.day, 20000);
  assert.equal(r.yen, s.state.sa * 4);
  assert.equal(r.back - r.invest, r.yen, '回収 − 投資 = 収支');
  assert.equal(r.invest, s.state.invest);
  assert.equal(r.ns, s.stats.spins.normal.n);
  assert.equal(r.ev, expectedYen(m, s.stats.spins.normal.n, s.stats.normal.net));
  assert.equal(r.hits, s.state.hitsTotal);
  assert.equal(r.first, s.state.firstHits);
  assert.equal(r.maxChain, s.state.maxChain);
  assert.equal(r.spins, s.state.spinsTotal);
  assert.deepEqual(unpackRows(r.hist), hitRows(s.events).map((x) => ({ ...x, t: Math.round(x.t) })));
});

const rec = (o) => ({ at: 1, day: 1, m: 'crab', rpk: 17, seed: 1, yen: 0, invest: 10000, back: 10000, spins: 2000, ns: 1800, hits: 0, first: 0, maxChain: 0, maxSa: 0, minSa: 0, ev: -5000, ...o });

test('記録を足す: 古い順に並べ、上限を超えたら古い来店から消し、大当り履歴は新しい来店の分だけ残す', () => {
  let list = [];
  for (let i = 1; i <= 7; i++) list = addVisit(list, rec({ at: i, hist: [[1]] }), { max: 5, keepHist: 2 });
  assert.deepEqual(list.map((r) => r.at), [3, 4, 5, 6, 7]);
  assert.deepEqual(list.map((r) => !!r.hist), [false, false, false, true, true]);
  const before = [rec({ at: 1 })];
  addVisit(before, rec({ at: 2 }));
  assert.equal(before.length, 1, '元の配列は変えない');
});

test('保存の読み書き: 壊れた中身・違う版・おかしな来店は捨てる', () => {
  const list = [rec({ at: 1, yen: 1200 }), rec({ at: 2, yen: -800 })];
  assert.deepEqual(parseStore(serializeStore(list)), list);
  assert.deepEqual(parseStore(null), []);
  assert.deepEqual(parseStore(''), []);
  assert.deepEqual(parseStore('{壊れた'), []);
  assert.deepEqual(parseStore(JSON.stringify({ v: 999, visits: list })), []);
  assert.deepEqual(parseStore(JSON.stringify({ v: 1, visits: 'x' })), []);
  const mixed = JSON.stringify({ v: 1, visits: [list[0], null, { m: 'crab' }, { ...list[1], yen: 'x' }, list[1]] });
  assert.deepEqual(parseStore(mixed), list);
});

test('累計: 勝ち負けの数・お金の合計・期待値・台ごと・推移', () => {
  const list = [
    rec({ at: 1, m: 'crab', yen: 30000, invest: 20000, back: 50000, ev: -6000, hits: 8, first: 2, ns: 1700, maxChain: 6, spins: 2100 }),
    rec({ at: 2, m: 'hamster', yen: -12000, invest: 15000, back: 3000, ev: -9000, hits: 12, first: 6, ns: 2500, maxChain: 4, spins: 2900 }),
    rec({ at: 3, m: 'crab', yen: -25000, invest: 25000, back: 0, ev: -7000, hits: 0, first: 0, ns: 2600, maxChain: 0, spins: 2600 }),
    rec({ at: 4, m: 'crab', yen: 0, invest: 5000, back: 5000, ev: -1000, hits: 1, first: 1, ns: 300, maxChain: 1, spins: 300 }),
  ];
  const t = totals(list, MACHINES);
  assert.equal(t.visits, 4);
  assert.equal(t.wins, 1);
  assert.equal(t.losses, 2);
  assert.equal(t.draws, 1);
  assert.equal(t.yen, -7000);
  assert.equal(t.invest, 65000);
  assert.equal(t.back, 58000);
  assert.equal(t.ev, -23000);
  assert.equal(t.avg, -1750);
  assert.equal(t.winRate, 0.25);
  assert.equal(t.hits, 21);
  assert.equal(t.first, 9);
  assert.equal(t.spins, 7900);
  assert.equal(t.firstRate, (1700 + 2500 + 2600 + 300) / 9, '初当り 1 回あたりの通常時の回転数');
  assert.equal(t.maxChain, 6);
  assert.equal(t.best.at, 1);
  assert.equal(t.worst.at, 3);
  assert.deepEqual(t.running, [0, 30000, 18000, -7000, -7000]);
  assert.deepEqual(t.expected, [0, -6000, -15000, -22000, -23000]);
  // 台ごとは台の並び順（仕様の順）で、遊んだ台だけ
  assert.deepEqual(t.byMachine.map((b) => b.id), ['hamster', 'crab']);
  const crab = t.byMachine.find((b) => b.id === 'crab');
  assert.deepEqual({ visits: crab.visits, wins: crab.wins, yen: crab.yen, ev: crab.ev, first: crab.first, ns: crab.ns, maxChain: crab.maxChain }, { visits: 3, wins: 1, yen: 5000, ev: -14000, first: 3, ns: 4600, maxChain: 6 });
});

test('累計: 記録が無いときは 0 と空の推移', () => {
  const t = totals([], MACHINES);
  assert.equal(t.visits, 0);
  assert.equal(t.yen, 0);
  assert.equal(t.avg, 0);
  assert.equal(t.winRate, 0);
  assert.equal(t.firstRate, null);
  assert.equal(t.best, null);
  assert.deepEqual(t.running, [0]);
  assert.deepEqual(t.byMachine, []);
});
