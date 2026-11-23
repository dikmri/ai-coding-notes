// 『今日も打とーっと』の画面側の純粋な部分（dedama/js/logic.mjs）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainColor, chainLabel, Columns, yRange, mealTier, SPEEDS, speedInfo, todayRpk, BASE_SPEED, milestoneCross } from '../dedama/js/logic.mjs';
import { MACHINES } from '../dedama/sim/machines.mjs';

test('連チャンの色: 数が増えるほど変わり、20 連から虹', () => {
  const seen = [0, 1, 2, 3, 4, 5, 7, 10, 15].map((n) => chainColor(n, 0));
  assert.equal(new Set(seen).size, seen.length, '段階ごとに違う色');
  assert.equal(chainColor(6, 0), chainColor(5, 0), '5〜6 連は同じ色');
  assert.equal(chainColor(19, 0), chainColor(15, 0), '15〜19 連は同じ色');
  const rainbow = new Set([0, 0.2, 0.4, 0.6, 0.8].map((h) => chainColor(20, h)));
  assert.ok(rainbow.size >= 4, '20 連以上は位相で色が回る（虹）');
  assert.match(chainColor(25, 0.3), /^#[0-9a-f]{6}$/);
});

test('連チャンの札: 2 連から「n連」、1 以下は出さない', () => {
  assert.equal(chainLabel(0), '');
  assert.equal(chainLabel(1), '');
  assert.equal(chainLabel(2), '2連');
  assert.equal(chainLabel(20), '20連');
});

test('グラフの列: 1 列の時間の中の最小・最大・最後・最大の連チャンをまとめる', () => {
  const c = new Columns(43200, 10); // 1 列 = 4320 秒
  c.add([0, 0, 0]);
  c.add([1000, -300, 0]);
  c.add([2000, 1500, 1]);
  c.add([4000, 900, 2]);
  c.add([5000, 700, 0]); // 次の列
  assert.equal(c.count, 2);
  assert.deepEqual(c.col(0), { min: -300, max: 1500, last: 900, chain: 2 });
  assert.deepEqual(c.col(1), { min: 700, max: 700, last: 700, chain: 0 });
  c.add([43200, 50, 0]); // 閉店の時刻は最後の列へ
  assert.equal(c.count, 10);
  assert.equal(c.col(9).last, 50);
  // 間の列は前の値で埋まる
  assert.deepEqual(c.col(5), { min: 700, max: 700, last: 700, chain: 0 });
});

test('縦軸の幅: 最低でも ±5,000、5,000 刻みで、はみ出さない', () => {
  assert.deepEqual(yRange(0, 0), { lo: -5000, hi: 5000, step: 5000 });
  const r = yRange(-12345, 2000);
  assert.ok(r.lo <= -12345 && r.hi >= 2000);
  assert.ok(r.lo % r.step === 0, "下の端は目盛りの倍数");
  assert.ok(r.hi % r.step === 0, "上の端は目盛りの倍数");
  const big = yRange(-3000, 64000);
  assert.ok(big.step >= 10000, '幅が広いときは目盛りを粗く');
  assert.ok(big.hi >= 64000);
});

test('晩ごはんの段階: 寿司 → 焼肉 → カップラーメン → もやし → 飴', () => {
  assert.equal(mealTier(50000), 'S');
  assert.equal(mealTier(49999), 'A');
  assert.equal(mealTier(15000), 'A');
  assert.equal(mealTier(14999), 'B');
  assert.equal(mealTier(0), 'B');
  assert.equal(mealTier(-14999), 'B');
  assert.equal(mealTier(-15000), 'C');
  assert.equal(mealTier(-39999), 'C');
  assert.equal(mealTier(-40000), 'D', '逆万発（−10,000 玉 = −40,000 円）は飴');
});

test('時間の速さ: 標準で 12 時間が 3 分、段階は 0.25〜8 倍', () => {
  assert.equal(BASE_SPEED, 240);
  assert.deepEqual(SPEEDS, [0.25, 0.5, 1, 2, 4, 8]);
  const i = speedInfo(2, 0, 43200);
  assert.equal(i.mult, 1);
  assert.equal(i.remainSec, 180);
  assert.match(i.text, /標準/);
  const j = speedInfo(5, 21600, 43200);
  assert.equal(j.remainSec, 11.25);
  assert.match(j.text, /8 倍/);
});

test('今日の回転率: 同じ日なら同じ、台ごとに違い、店の標準 ±1.5 の中', () => {
  for (const m of MACHINES) {
    const a = todayRpk(m, 123), b = todayRpk(m, 123);
    assert.equal(a, b);
    assert.ok(Math.abs(a - m.rpk) <= 1.5 + 1e-9, `${m.id} ${a}`);
    assert.equal(a * 2, Math.round(a * 2), '0.5 刻み');
  }
  const days = new Set();
  for (let d = 0; d < 50; d++) days.add(todayRpk(MACHINES[0], d));
  assert.ok(days.size >= 4, '日によって変わる');
});

test('万発・逆万発の線を越えた瞬間を知らせる（同じ線は 1 日 1 回）', () => {
  const seen = new Set();
  assert.deepEqual(milestoneCross(9000, 10200, seen), ['wan1']);
  assert.deepEqual(milestoneCross(10200, 9000, seen), []);
  assert.deepEqual(milestoneCross(9000, 10500, seen), [], '2 回目は出さない');
  assert.deepEqual(milestoneCross(10500, 31000, seen), ['wan2', 'wan3']);
  assert.deepEqual(milestoneCross(-9000, -10001, seen), ['gyaku']);
  assert.deepEqual(milestoneCross(-10001, -9500, seen), []);
});
