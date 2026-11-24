// 『今日も打とーっと』の出玉の計算（dedama/sim）のテスト。
// 仕様書（MyWiki dedama-graph.md §2）の数字をここに書き写し、実装の設定とは別に理論値を出して、
// 多数回の試行の結果がその幅に入るかを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MACHINES } from '../dedama/sim/machines.mjs';
import { createSession, GAME_HOURS, YEN_PER_BALL } from '../dedama/sim/sim.mjs';

// ---- 仕様書の数字（台の設定ファイルとは別に持つ） ----
const SPEC = {
  dynamite: { normal: 319.7, rpk: 15.5, border: 16.3, modes: { kakuhen: 39.9, jitan: 319.7 }, jitan: 100,
    heso: [[60, 10], [5, 4], [35, 10]], den: [[60, 10], [5, 4], [35, 10]], perRound: 10 * 13 },
  hamster: { normal: 99.9, rpk: 17, border: 18.2, modes: { st: 9.9, jitan: 99.9 }, st: 8, jitan: 22,
    heso: [[100, 3]], den: [[30, 10], [70, 5]], perRound: 10 * 9 },
  train: { normal: 199.8, rpk: 17.5, border: 18.8, modes: { st: 79.9, jitan: 199.8 }, st: 120, jitan: 100,
    heso: [[50, 3], [50, 3]], den: [[50, 10], [50, 5]], perRound: 10 * 12 },
  crab: { normal: 319.7, rpk: 17, border: 17.9, modes: { st: 99.4, jitan: 319.7 }, st: 163, jitan: 100,
    heso: [[50, 3], [50, 3]], den: [[100, 10]], perRound: 10 * 15 },
  daibutsu: { normal: 319.7, rpk: 16.5, border: 17.5, rush: 13, koatari: 7.4,
    heso: [[50, 3], [50, 3]], den: [[100, 10]], perRound: 10 * 14 },
  hanabi: { normal: 399.6, rpk: 15.5, border: 16.4, modes: { kakuhen: 39.9, jitan: 399.6 }, jitan: 100,
    heso: [[45, 16], [15, 0], [40, 16]], den: [[45, 16], [15, 0], [40, 16]], perRound: 10 * 14, tokkaku: 2 * 10 },
  // 2026-11-24 に足した 4 台（作者が挙げた実在の台の公表スペックを参考）。enter は初当たりから電サポへ入る割合。
  // 振り分けのラウンド数 0 は ST リセット（出玉なし。大当たりに数えない）
  sushi: { normal: 229.95, rpk: 18, border: 19.0, modes: { st: 69.35, st4500: 69.35 }, enter: 0.51,
    heso: [[1, 3], [50, 3], [49, 3]], den: [[5.5, 30], [26.9, 20], [43.8, 10], [23.8, 0]], perRound: 10 * 14 },
  laundry: { normal: 199.9, rpk: 15.5, border: 16.7, modes: { st: 95.3 }, enter: 0.255,
    heso: [[25, 10], [0.5, 2], [24.5, 10], [50, 2]], den: [[97, 20], [3, 40]], perRound: 10 * 14 },
  yokozuna: { normal: 349.99, rpk: 16, border: 17.2, modes: { battle: 1, lt: 1 }, enter: 0.4,
    heso: [[40, 10], [40, 10], [20, 2]], battle: [[50, 50], [50, 10]], lt: [[25, 50], [51, 10], [24, 10]], perRound: 10 * 14 },
  maneki: { normal: 349.9, rpk: 15, border: 16.0, modes: { st: 99.9 }, enter: 0.55,
    heso: [[10, 20], [45, 10], [45, 10]], den: [[25, 40], [55, 10], [6, 2], [14, 0]], perRound: 10 * 14 },
  // 2026-11-24 に足した 4 台（その 2）。RUSH の回数は時短 ＋ 残り保留 1 個。perRoundBy は表ごとの 1R の出玉（ヘソと右打ちでアタッカーが違う台）
  wanko: { normal: 319.68, rpk: 19, border: 20.2, modes: { st: 2.06 }, enter: 0.602,
    heso: [[60.2, 6], [39.8, 6]], den: [[20, 9], [80, 3]], perRound: 10 * 10 },
  wanko2: { normal: 129.7, rpk: 16.5, border: 17.8, modes: { st: 2.44, lt: 2.44, last: 2.44 }, enter: 0.56,
    heso: [[56, 3], [44, 3]], den: [[80, 3], [18, 9], [2, 9]], lt: [[80, 3], [20, 9]], perRound: 10 * 7 },
  udezumo: { normal: 199.8, rpk: 20, border: 21.1, modes: { st: 1.58 }, enter: 0.5,
    heso: [[50, 4], [50, 4]], den: [[8, 9], [8, 6], [84, 3]], perRound: 10 * 6 },
  udezumo2: { normal: 199.5, rpk: 17, border: 18.1, modes: { st: 1.71, lt: 1.71, encho: 1.71 }, enter: 0.6,
    heso: [[60, 6], [40, 6]], den: [[3, 10], [3, 10], [94, 2]], lt: [[6, 10], [91.5, 2], [2.5, 2]], perRound: 10 * 6, perRoundBy: { heso: 10 * 9 } },
};
const cont = (oneIn, n) => 1 - (1 - 1 / oneIn) ** n;
const ROUTES = ['heso', 'den', 'battle', 'lt'];
// 出玉のある当たりだけの平均（ST リセットの行は除く）
const payRows = (spec, route) => spec[route].filter(([, r]) => r > 0 || spec.tokkaku);
const perRoundOf = (spec, route) => spec.perRoundBy?.[route] ?? spec.perRound;
const avgPay = (spec, route) => {
  const t = payRows(spec, route);
  return t.reduce((a, [w, r]) => a + w * (r === 0 ? spec.tokkaku : r * perRoundOf(spec, route)), 0) / t.reduce((a, [w]) => a + w, 0);
};
// 電サポの種類ごとの「次が当たる」割合の理論値
const THEORY = {
  dynamite: { kakuhen: 1, jitan: cont(319.7, 100) },
  hamster: { st: cont(9.9, 8), jitan: cont(99.9, 22) },
  train: { st: cont(79.9, 120), jitan: cont(199.8, 100) },
  crab: { st: cont(99.4, 163), jitan: cont(319.7, 100) },
  daibutsu: { rush: 1 - (1 - 1 / 7.4 - 1 / 319.7) ** 13 },
  hanabi: { kakuhen: 1, jitan: cont(399.6, 100) },
  sushi: { st: cont(69.35, 100), st4500: cont(69.35, 4500) },
  laundry: { st: cont(95.3, 130) },
  yokozuna: { battle: 1, lt: 1 }, // 1 回転で毎回当たる。続くかどうかは振り分けの表で決まる（別のテスト）
  maneki: { st: cont(99.9, 144) },
  wanko: { st: cont(2.06, 4) },
  // LT は 6 回を LT の表で回し、外れたらラスト 1 回（RUSH の表）
  wanko2: { st: cont(2.44, 4), lt: cont(2.44, 6), last: cont(2.44, 1) },
  udezumo: { st: cont(1.58, 3) },
  // LT は 101 回あるので必ず当たる（続くかは LT の表で決まる）。延長戦は 1 回だけ
  udezumo2: { st: cont(1.71, 3), lt: 1, encho: cont(1.71, 1) },
};

// 割合 p の n 回の試行で、観測 k が許す幅（4σ）に入るか
function near(k, n, p, label) {
  const sd = Math.sqrt(n * p * (1 - p));
  assert.ok(n > 0, `${label}: 試行が 0 回`);
  assert.ok(Math.abs(k - n * p) <= 4 * sd + 1, `${label}: 観測 ${k}/${n} = ${(k / n).toFixed(4)}、理論 ${p.toFixed(4)}（±${((4 * sd) / n).toFixed(4)}）`);
}

// 長い 1 日（時間を伸ばした台の試行）。結果は台ごとに使い回す
const LONG_HOURS = 4000;
const long = new Map();
function longRun(id) {
  if (!long.has(id)) {
    const s = createSession({ machine: id, seed: 20261124, hours: LONG_HOURS });
    s.advanceTo(Infinity);
    long.set(id, s);
  }
  return long.get(id);
}

test(`台は仕様書の ${Object.keys(SPEC).length} 種類で、名前・型・回転率・確率が仕様と同じ`, () => {
  assert.deepEqual(MACHINES.map((m) => m.id), Object.keys(SPEC));
  for (const m of MACHINES) {
    const sp = SPEC[m.id];
    assert.equal(m.normal, sp.normal, `${m.id} 通常時の確率`);
    assert.equal(m.rpk, sp.rpk, `${m.id} 回転率`);
    assert.equal(m.border, sp.border, `${m.id} ボーダー`);
    assert.ok(m.rpk < m.border, `${m.id} 店の回転率はボーダーより下（店が少し勝つ）`);
    assert.ok(m.name && m.type && m.blurb, `${m.id} 名前・型・説明`);
  }
});

for (const id of Object.keys(SPEC)) {
  const sp = SPEC[id];
  test(`${id}: 通常時の大当たり確率が 1/${sp.normal}`, () => {
    const st = longRun(id).stats;
    near(st.spins.normal.hits, st.spins.normal.n, 1 / sp.normal, `${id} 通常時`);
  });

  test(`${id}: 電サポ中の 1 回転あたりの当たり確率が仕様どおり`, () => {
    const st = longRun(id).stats;
    if (sp.modes) {
      for (const [mode, oneIn] of Object.entries(sp.modes)) near(st.spins[mode].hits, st.spins[mode].n, 1 / oneIn, `${id} ${mode}`);
    } else {
      near(st.spins.rush.hits, st.spins.rush.n, 1 / 7.4 + 1 / 319.7, `${id} RUSH（小当たり＋1種）`);
    }
  });

  test(`${id}: 電サポに入ったあと次が当たる割合（連チャン率）が理論値`, () => {
    const st = longRun(id).stats;
    for (const [mode, p] of Object.entries(THEORY[id])) {
      const ep = st.episodes[mode];
      // 必ず当たる状態（確変・1/1・回数が多い ST）は、回数が少なくても全部当たることを確かめる
      if (p === 1) { assert.ok(ep.n >= 10, `${id} ${mode} の回数 ${ep.n}`); assert.equal(ep.hit, ep.n, `${id} ${mode} は必ず当たる`); }
      else near(ep.hit, ep.n, p, `${id} ${mode} の継続`);
    }
  });

  test(`${id}: 1 回の大当たりの平均出玉が振り分けの理論値`, () => {
    const st = longRun(id).stats;
    for (const route of ROUTES.filter((r) => sp[r])) {
      const h = st.hits[route];
      assert.ok(h && h.n > 50, `${id} ${route} の当たりが少ない（${h?.n}）`);
      const want = avgPay(sp, route), got = h.payout / h.n;
      // 振り分けの抽選の揺れ: 出玉の分散から 4σ
      const t = payRows(sp, route), tw = t.reduce((a, [w]) => a + w, 0);
      const pay = (r) => (r === 0 ? sp.tokkaku : r * perRoundOf(sp, route));
      const vr = t.reduce((a, [w, r]) => a + (w / tw) * (pay(r) - want) ** 2, 0);
      const tol = 4 * Math.sqrt(vr / h.n) + 1;
      assert.ok(Math.abs(got - want) <= tol, `${id} ${route}: 平均 ${got.toFixed(1)}、理論 ${want.toFixed(1)}（±${tol.toFixed(1)}）`);
    }
  });

  if (sp.enter != null) test(`${id}: 初当たりの ${(sp.enter * 100).toFixed(1)}% が電サポ（RUSH・LT・大一番）へ入る`, () => {
    const first = longRun(id).events.filter((e) => e.type === 'hit' && e.from === 'normal');
    near(first.filter((e) => e.next !== 'normal').length, first.length, sp.enter, `${id} の突入`);
  });

  test(`${id}: 回転率が 1,000 円あたり ${sp.rpk} 回転`, () => {
    const st = longRun(id).stats;
    const rpk = st.normal.entries / (st.normal.net / 250);
    assert.ok(Math.abs(rpk - sp.rpk) / sp.rpk < 0.02, `${id}: ${rpk.toFixed(2)} 回転/千円`);
  });

  test(`${id}: 等価のボーダーが ${sp.border} 回転（試行から計算した値と 4% か 4σ の大きい方の幅）`, () => {
    const s = longRun(id);
    const border = (250 * s.stats.spins.normal.n) / (s.state.sa + s.stats.normal.net);
    // 初当たりから通常に戻るまでの 1 回分の出玉（連チャンの長さで大きくばらつく）から、ボーダーの相対誤差を見積もる
    const gains = [];
    let start = null;
    for (const e of s.events) {
      if (e.type === 'hit' && e.from === 'normal') start = e.sa;
      else if (e.type === 'modeEnd' && e.result === 'out' && start != null) { gains.push(e.sa - start); start = null; }
    }
    const mean = gains.reduce((a, b) => a + b, 0) / gains.length;
    const sd = Math.sqrt(gains.reduce((a, b) => a + (b - mean) ** 2, 0) / (gains.length - 1));
    const tol = Math.max(0.04, (4 * sd) / (mean * Math.sqrt(gains.length)));
    assert.ok(gains.length > 1000, `${id}: 初当たり ${gains.length} 回`);
    assert.ok(Math.abs(border - sp.border) / sp.border < tol, `${id}: 計算 ${border.toFixed(2)}、仕様 ${sp.border}（±${(tol * 100).toFixed(1)}%）`);
  });

  test(`${id}: 通常時は 1 時間に 200〜330 回転（現実の目安）`, () => {
    const st = longRun(id).stats;
    const perHour = st.spins.normal.n / (st.normal.time / 3600);
    assert.ok(perHour >= 200 && perHour <= 330, `${id}: ${perHour.toFixed(0)} 回転/時`);
  });
}

test('yokozuna: 大一番は 50% で勝って LT、LT は 76% で続く', () => {
  const ev = longRun('yokozuna').events.filter((e) => e.type === 'hit');
  const battle = ev.filter((e) => e.fromKey === 'battle'), lt = ev.filter((e) => e.fromKey === 'lt');
  near(battle.filter((e) => e.nextKey === 'lt').length, battle.length, 0.5, '大一番の勝ち');
  near(lt.filter((e) => e.nextKey === 'lt').length, lt.length, 0.76, 'LT の継続');
  near(lt.filter((e) => e.rounds === 50).length, lt.length, 0.25, 'LT の 7,500 発');
  assert.ok(battle.every((e) => e.nextKey === 'lt' ? e.rounds === 50 : e.rounds === 10), '大一番は勝てば 50R、負ければ 10R');
});

test('ST リセットのある台: 出玉なしの当たりは数えず、RUSH・LT を最初の回数から続ける', () => {
  for (const [id, share, spins] of [['sushi', 0.238, 100], ['maneki', 0.14, 144]]) {
    const s = longRun(id);
    const fromDen = s.events.filter((e) => (e.type === 'hit' || e.type === 'reset') && e.from !== 'normal');
    const resets = fromDen.filter((e) => e.type === 'reset');
    near(resets.length, fromDen.length, share, `${id} のリセットの割合`);
    assert.equal(s.stats.resets, resets.length);
    assert.ok(resets.every((e) => e.next === 'st'), `${id} リセットのあとも ST`);
    assert.equal(MACHINES.find((m) => m.id === id).den.find((r) => r[1] === 0)[2].spins, spins);
  }
});

test('同じ種なら同じ 1 日になり、違う種なら違う 1 日になる', () => {
  const run = (seed) => { const s = createSession({ machine: 'crab', seed }); s.advanceTo(Infinity); return s; };
  const a = run(7), b = run(7), c = run(8);
  assert.equal(a.state.sa, b.state.sa);
  assert.deepEqual(a.samples.slice(-5), b.samples.slice(-5));
  assert.notDeepEqual(a.samples.slice(-5), c.samples.slice(-5));
});

test('12 時間で閉店し、収支は差玉 × 4 円、投資は 1,000 円単位', () => {
  for (const id of Object.keys(SPEC)) {
    for (let seed = 1; seed <= 8; seed++) {
      const s = createSession({ machine: id, seed });
      assert.equal(s.endT, GAME_HOURS * 3600);
      s.advanceTo(s.endT - 1);
      assert.equal(s.done, false);
      s.advanceTo(Infinity);
      assert.equal(s.done, true, `${id}/${seed} 閉店した`);
      const { sa, mochi, invest } = s.state;
      assert.equal(invest % 1000, 0);
      assert.equal(mochi * YEN_PER_BALL - invest, sa * YEN_PER_BALL, `${id}/${seed} 持ち玉 − 投資 = 差玉`);
      assert.ok(mochi >= 0);
      // 閉店後に始まった変動は無い（閉店前に始まった当たりは消化してよい）
      for (const e of s.events) if (e.type === 'hit') assert.ok(e.spinAt < s.endT, `${id}/${seed} 閉店後の抽選`);
    }
  }
});

test('連チャン数: 通常時の当たりが 1、電サポ中の当たりで増え、通常に戻ると 0', () => {
  const s = createSession({ machine: 'crab', seed: 3, hours: 300 });
  s.advanceTo(Infinity);
  let chain = 0, prevMode = 'normal';
  const hits = s.events.filter((e) => e.type === 'hit' || e.type === 'modeEnd');
  assert.ok(hits.some((e) => e.type === 'hit' && e.chain >= 3), '3 連以上が 1 度はある');
  for (const e of hits) {
    if (e.type === 'modeEnd' && e.result === 'out') { chain = 0; prevMode = 'normal'; continue; }
    if (e.type !== 'hit') continue;
    chain = e.from === 'normal' ? 1 : chain + 1;
    assert.equal(e.chain, chain, `t=${e.t} の連チャン数`);
    prevMode = e.from;
  }
  assert.ok(prevMode);
});

test('グラフの点は時刻順で、差玉は state と一致して終わる', () => {
  const s = createSession({ machine: 'dynamite', seed: 11 });
  s.advanceTo(Infinity);
  for (let i = 1; i < s.samples.length; i++) assert.ok(s.samples[i][0] >= s.samples[i - 1][0], `点 ${i} の時刻`);
  assert.equal(s.samples.at(-1)[1], s.state.sa);
});

test('少しずつ進めても、一度に進めても同じ結果になる', () => {
  const a = createSession({ machine: 'daibutsu', seed: 5 });
  for (let t = 0; t <= a.endT + 3600; t += 37.3) a.advanceTo(t);
  a.advanceTo(Infinity);
  const b = createSession({ machine: 'daibutsu', seed: 5 });
  b.advanceTo(Infinity);
  assert.equal(a.state.sa, b.state.sa);
  assert.equal(a.events.length, b.events.length);
});

// ---- 状態ごとの確率・振り分け・表示名（LT のように 1 回転で決着する状態）と、出玉なしの ST リセット ----
// 実在の台に合わせた設定とは別の、テスト用の台で確かめる
const NORMAL = { mode: 'normal' };
const FIX_LT = { mode: 'st', spins: 1, p: 1, table: 'lt', key: 'lt', label: 'LT' };
const FIX_LT_MACHINE = {
  id: 'fix-lt', name: 'テスト台 LT', type: 'テスト', blurb: 'テスト', normal: 40, rpk: 18, border: 99, count: 10, perBall: 15,
  heso: [[50, 10, FIX_LT], [50, 2, NORMAL]],
  lt: [[60, 10, FIX_LT], [40, 5, NORMAL]],
  den: [[100, 10, NORMAL]],
};
const FIX_ST = { mode: 'st', spins: 30, label: 'RUSH' };
const FIX_RESET_MACHINE = {
  id: 'fix-reset', name: 'テスト台 リセット', type: 'テスト', blurb: 'テスト', normal: 40, high: 20, rpk: 18, border: 99, count: 10, perBall: 15,
  heso: [[100, 3, FIX_ST]],
  den: [[50, 10, FIX_ST], [50, 0, FIX_ST]], // 0R は出玉なしで ST を最初に戻す（突確の設定が無い台）
};

test('状態ごとの確率と振り分け: LT は毎回当たり、LT の表で次を決める', () => {
  const s = createSession({ machine: FIX_LT_MACHINE, seed: 5, hours: 2000 });
  s.advanceTo(Infinity);
  const st = s.stats;
  assert.ok(st.spins.lt.n > 1000, `LT の回転 ${st.spins.lt.n}`);
  assert.equal(st.spins.lt.hits, st.spins.lt.n, 'LT は 1/1');
  const fromLt = s.events.filter((e) => e.type === 'hit' && e.fromKey === 'lt');
  near(fromLt.filter((e) => e.nextKey === 'lt').length, fromLt.length, 0.6, 'LT の継続');
  assert.equal(st.hits.lt.n, fromLt.length, '当たりは表の名前ごとに数える');
  near(fromLt.filter((e) => e.rounds === 10).length, fromLt.length, 0.6, 'LT の表の 10R');
  const first = s.events.filter((e) => e.type === 'hit' && e.fromKey === 'normal');
  near(first.filter((e) => e.nextKey === 'lt').length, first.length, 0.5, '初当たりの LT 突入');
  const toLt = s.events.find((e) => e.type === 'bonusEnd' && e.nextKey === 'lt');
  assert.equal(toLt.nextLabel, 'LT', '表示名');
  assert.equal(toLt.spins, 1);
});

test('ST リセット: 出玉なしで ST の回数が最初に戻り、大当たりと連チャンには数えない', () => {
  const s = createSession({ machine: FIX_RESET_MACHINE, seed: 9, hours: 600 });
  const resets = [];
  let lastChain = 0, lastHits = 0;
  // 出来事を 1 つずつ見るため、少しずつ進める
  for (let t = 0; !s.done; t += 5) {
    const before = s.events.length;
    s.advanceTo(t);
    for (const e of s.events.slice(before)) {
      if (e.type === 'hit') { lastChain = e.chain; lastHits++; }
      if (e.type === 'reset') {
        resets.push(e);
        assert.equal(e.chain, lastChain, 'リセットで連チャン数は変わらない');
        assert.equal(s.state.hitsTotal, lastHits, 'リセットは大当たりに数えない');
        // 同じ時刻に次の変動が始まっていれば 1 回減っている
        if (s.state.mode === 'st' && !s.state.inBonus && s.state.t === e.t) assert.ok(s.state.modeLeft >= 29, `ST は 30 回に戻る（残り ${s.state.modeLeft}）`);
      }
    }
  }
  assert.ok(resets.length > 50, `リセット ${resets.length} 回`);
  assert.ok(resets.every((e) => e.label === 'RUSH'), 'リセットの表示名');
  assert.equal(s.events.filter((e) => e.type === 'hit' && e.payout === 0).length, 0, '出玉 0 の大当たりは無い');
  // 出玉の平均は 10R だけ（リセットは数えない）
  assert.equal(s.stats.hits.den.payout / s.stats.hits.den.n, 10 * 10 * 14);
  // 継続（リセットも次につながる）: 1/20 を 30 回で
  near(s.stats.episodes.st.hit, s.stats.episodes.st.n, cont(20, 30), 'ST の継続（リセット込み）');
});

test('回転率を変えて遊べる（今日の釘）', () => {
  const s = createSession({ machine: 'train', seed: 4, hours: 3000, rpk: 21 });
  s.advanceTo(Infinity);
  const rpk = s.stats.normal.entries / (s.stats.normal.net / 250);
  assert.equal(s.rpk, 21);
  assert.ok(Math.abs(rpk - 21) / 21 < 0.02, `${rpk.toFixed(2)} 回転/千円`);
});

// ---- 大当り履歴の表に使う出来事の中身 ----
test('大当たりと ST リセットの出来事: その時の総回転数・当たった時の状態の名前・次の状態の回数を持つ', () => {
  const ham = createSession({ machine: 'hamster', seed: 3 });
  ham.advanceTo(Infinity);
  const hits = ham.events.filter((e) => e.type === 'hit');
  assert.ok(hits.length > 10, `大当たり ${hits.length} 回`);
  let prev = 0;
  for (const e of hits) {
    assert.ok(e.spinsTotal > prev, '総回転数は当たりごとに増える');
    prev = e.spinsTotal;
    assert.ok(['通常', 'ST', '時短'].includes(e.fromLabel), `当たった時の状態 ${e.fromLabel}`);
    // 甘デジは毎回 ST 8 回 ＋ 時短 22 回
    assert.equal(e.nextSpins, 8);
    assert.equal(e.thenLabel, '時短');
    assert.equal(e.thenSpins, 22);
  }
  assert.ok(prev <= ham.state.spinsTotal);
  assert.ok(hits.some((e) => e.fromLabel === '通常') && hits.some((e) => e.fromLabel === 'ST'), '通常時と ST 中の当たりがある');

  const rs = createSession({ machine: FIX_RESET_MACHINE, seed: 9, hours: 100 });
  rs.advanceTo(Infinity);
  const resets = rs.events.filter((e) => e.type === 'reset');
  assert.ok(resets.length > 3, `リセット ${resets.length} 回`);
  for (const e of resets) {
    assert.ok(Number.isInteger(e.spinsTotal) && e.spinsTotal > 0, 'リセットも総回転数を持つ');
    assert.equal(e.fromLabel, 'RUSH');
    assert.equal(typeof e.sa, 'number', 'リセットの時の差玉');
  }
  // 当たらない状態から戻る大当たり（確変・突確）
  const hb = createSession({ machine: 'hanabi', seed: 11, hours: 200 });
  hb.advanceTo(Infinity);
  const tk = hb.events.find((e) => e.type === 'hit' && e.tokkaku);
  assert.ok(tk, '突確がある');
  assert.equal(tk.next, 'kakuhen');
  assert.equal(tk.nextSpins, null, '確変は回数を持たない');
});

test('udezumo2: ヘソの当たりは 1R 90 発、右打ちの当たりは 1R 60 発（表ごとの 1R の出玉）', () => {
  const ev = longRun('udezumo2').events.filter((e) => e.type === 'hit');
  const heso = ev.filter((e) => e.table === 'heso'), right = ev.filter((e) => e.table !== 'heso');
  assert.ok(heso.length > 100 && right.length > 1000, `ヘソ ${heso.length}・右打ち ${right.length}`);
  assert.ok(heso.every((e) => e.rounds === 6 && e.payout === 540), 'ヘソは 6R 540 発');
  assert.ok(right.every((e) => e.payout === e.rounds * 60), '右打ちは 1R 60 発');
  // LT の 2.5% は延長戦（1 回だけ）。延長戦で当たれば RUSH の表で次を決める
  const lt = ev.filter((e) => e.fromKey === 'lt');
  near(lt.filter((e) => e.nextKey === 'encho').length, lt.length, 0.025, 'LT の終わり（延長戦へ）');
  const encho = ev.filter((e) => e.fromKey === 'encho');
  assert.ok(encho.length > 20 && encho.every((e) => e.table === 'den'), `延長戦の当たり ${encho.length} 回は RUSH の表`);
});

test('wanko2: LT を 6 回外すと、ラスト 1 回は RUSH の表で回る', () => {
  const s = longRun('wanko2');
  const ends = s.events.filter((e) => e.type === 'modeEnd' && e.key === 'lt');
  assert.ok(ends.length > 20, `LT の終わり ${ends.length} 回`);
  assert.ok(ends.every((e) => e.result === 'next' && e.toKey === 'last' && e.toLabel === 'ラスト'), 'LT の後はラスト');
  const last = s.events.filter((e) => e.type === 'hit' && e.fromKey === 'last');
  assert.ok(last.length > 5 && last.every((e) => e.table === 'den'), `ラストの当たり ${last.length} 回は RUSH の表`);
});
