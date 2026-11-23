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
};
const cont = (oneIn, n) => 1 - (1 - 1 / oneIn) ** n;
const avgPay = (spec, route) => {
  const t = spec[route];
  return t.reduce((a, [w, r]) => a + w * (r === 0 ? spec.tokkaku : r * spec.perRound), 0) / t.reduce((a, [w]) => a + w, 0);
};
// 電サポの種類ごとの「次が当たる」割合の理論値
const THEORY = {
  dynamite: { kakuhen: 1, jitan: cont(319.7, 100) },
  hamster: { st: cont(9.9, 8), jitan: cont(99.9, 22) },
  train: { st: cont(79.9, 120), jitan: cont(199.8, 100) },
  crab: { st: cont(99.4, 163), jitan: cont(319.7, 100) },
  daibutsu: { rush: 1 - (1 - 1 / 7.4 - 1 / 319.7) ** 13 },
  hanabi: { kakuhen: 1, jitan: cont(399.6, 100) },
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

test('台は仕様書の 6 種類で、名前・型・回転率・確率が仕様と同じ', () => {
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
      if (p === 1) { assert.ok(ep.n > 100, `${id} ${mode} の回数`); assert.equal(ep.hit, ep.n, `${id} ${mode} は次回まで続く`); }
      else near(ep.hit, ep.n, p, `${id} ${mode} の継続`);
    }
  });

  test(`${id}: 1 回の大当たりの平均出玉が振り分けの理論値`, () => {
    const st = longRun(id).stats;
    for (const route of ['heso', 'den']) {
      const h = st.hits[route];
      assert.ok(h.n > 50, `${id} ${route} の当たりが少ない（${h.n}）`);
      const want = avgPay(sp, route), got = h.payout / h.n;
      // 振り分けの抽選の揺れ: 出玉の分散から 4σ
      const t = sp[route], tw = t.reduce((a, [w]) => a + w, 0);
      const pay = (r) => (r === 0 ? sp.tokkaku : r * sp.perRound);
      const vr = t.reduce((a, [w, r]) => a + (w / tw) * (pay(r) - want) ** 2, 0);
      const tol = 4 * Math.sqrt(vr / h.n) + 1;
      assert.ok(Math.abs(got - want) <= tol, `${id} ${route}: 平均 ${got.toFixed(1)}、理論 ${want.toFixed(1)}（±${tol.toFixed(1)}）`);
    }
  });

  test(`${id}: 回転率が 1,000 円あたり ${sp.rpk} 回転`, () => {
    const st = longRun(id).stats;
    const rpk = st.normal.entries / (st.normal.net / 250);
    assert.ok(Math.abs(rpk - sp.rpk) / sp.rpk < 0.02, `${id}: ${rpk.toFixed(2)} 回転/千円`);
  });

  test(`${id}: 等価のボーダーが ${sp.border} 回転（試行から計算した値と 4% 以内）`, () => {
    const s = longRun(id);
    const border = (250 * s.stats.spins.normal.n) / (s.state.sa + s.stats.normal.net);
    assert.ok(Math.abs(border - sp.border) / sp.border < 0.04, `${id}: 計算 ${border.toFixed(2)}、仕様 ${sp.border}`);
  });

  test(`${id}: 通常時は 1 時間に 200〜330 回転（現実の目安）`, () => {
    const st = longRun(id).stats;
    const perHour = st.spins.normal.n / (st.normal.time / 3600);
    assert.ok(perHour >= 200 && perHour <= 330, `${id}: ${perHour.toFixed(0)} 回転/時`);
  });
}

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

test('回転率を変えて遊べる（今日の釘）', () => {
  const s = createSession({ machine: 'train', seed: 4, hours: 3000, rpk: 21 });
  s.advanceTo(Infinity);
  const rpk = s.stats.normal.entries / (s.stats.normal.net / 250);
  assert.equal(s.rpk, 21);
  assert.ok(Math.abs(rpk - 21) / 21 < 0.02, `${rpk.toFixed(2)} 回転/千円`);
});
