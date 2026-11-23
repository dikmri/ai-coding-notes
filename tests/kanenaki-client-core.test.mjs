// 画面の純粋な計算（client/core.mjs）のテスト。実行: node --test tests/kanenaki-client-core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  worldToScreen, screenToWorld, dirToTurn, vecToDir, createTrack, pushTrack, sampleTrack,
  findPath, invFits, invFindSpot, treeAllocatable, treeCanUnalloc, formatMod, ditherOn, xpToNext,
  stepAngle, cdFraction, hitChance, physTaken, resCapped,
} from '../kanenaki/client/core.mjs';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} と ${b} が近くない`);

test('視点: カメラの位置は画面の中心（0,0）に来る', () => {
  const p = worldToScreen(10, 20, { x: 10, y: 20 }, Math.PI / 4);
  near(p.x, 0); near(p.y, 0);
});

test('視点: 回さないとき、+x の 1 マスは右へ 16 ドット、+y の 1 マスは下へ 12 ドット（縦の縮み 0.75）', () => {
  const cam = { x: 0, y: 0 };
  const a = worldToScreen(1, 0, cam, 0);
  near(a.x, 16); near(a.y, 0);
  const b = worldToScreen(0, 1, cam, 0);
  near(b.x, 0); near(b.y, 12);
});

test('視点: 45° のとき、+x は右下、+y は左下へ向く', () => {
  const cam = { x: 0, y: 0 };
  const a = worldToScreen(1, 0, cam, Math.PI / 4);
  assert.ok(a.x > 0 && a.y > 0);
  const b = worldToScreen(0, 1, cam, Math.PI / 4);
  assert.ok(b.x < 0 && b.y > 0);
});

test('視点: 画面から地図へ戻すと元の位置になる（どの角度でも）', () => {
  const cam = { x: 31.5, y: 12.25 };
  for (const th of [0, Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, 1.1]) {
    const s = worldToScreen(40.2, 7.7, cam, th);
    const w = screenToWorld(s.x, s.y, cam, th);
    near(w.x, 40.2); near(w.y, 7.7);
  }
});

test('向き: 0 は +y（下）、時計回りに 4 で左、8 で上、12 で右', () => {
  assert.equal(vecToDir(0, 1), 0);
  assert.equal(vecToDir(-1, 0), 4);
  assert.equal(vecToDir(0, -1), 8);
  assert.equal(vecToDir(1, 0), 12);
  assert.equal(vecToDir(-1, 1), 2);
});

test('向き: 絵の回転は「向き × 22.5° ＋ カメラの角度」', () => {
  near(dirToTurn(0, 0), 0);
  near(dirToTurn(4, 0), Math.PI / 2);
  near(dirToTurn(0, Math.PI / 4), Math.PI / 4);
});

test('補間: 2 つの位置の間を時刻で割り振る。範囲の外は端の値を使う', () => {
  const tr = createTrack();
  pushTrack(tr, 1000, 0, 0, 0, 1, 100);
  pushTrack(tr, 1100, 10, 4, 4, 1, 50);
  let s = sampleTrack(tr, 1050);
  near(s.x, 5); near(s.y, 2); assert.equal(s.dir, 4); near(s.hp, 75);
  s = sampleTrack(tr, 900); near(s.x, 0);
  s = sampleTrack(tr, 5000); near(s.x, 10);
});

test('補間: 古い位置は捨て、数は上限を超えない', () => {
  const tr = createTrack();
  for (let i = 0; i < 100; i++) pushTrack(tr, i * 100, i, 0, 0, 0, 100);
  assert.ok(tr.length <= 32);
  near(sampleTrack(tr, 9850).x, 98.5);
});

const grid = (rows) => ({ w: rows[0].length, h: rows.length, solid: Uint8Array.from(rows.join('').split('').map((c) => (c === '#' ? 1 : 0))) });

test('道探し: 壁を避けて目的地に着く', () => {
  const g = grid([
    '.....',
    '.###.',
    '...#.',
    '.#...',
  ]);
  const path = findPath(g, 0, 0, 2, 2);
  assert.ok(path && path.length > 0);
  const last = path[path.length - 1];
  assert.deepEqual([last.x, last.y], [2, 2]);
  for (const p of path) assert.equal(g.solid[p.y * g.w + p.x], 0, `${p.x},${p.y} は壁`);
});

test('道探し: 斜めに進むとき、壁の角をすり抜けない', () => {
  const g = grid([
    '.#',
    '..',
  ]);
  const path = findPath(g, 0, 0, 1, 1);
  assert.equal(path.length, 2); // (0,1) を通る
  assert.deepEqual([path[0].x, path[0].y], [0, 1]);
});

test('道探し: 目的地が壁なら、いちばん近い歩ける場所まで行く', () => {
  const g = grid([
    '....',
    '...#',
    '...#',
  ]);
  const path = findPath(g, 0, 0, 3, 2);
  const last = path[path.length - 1];
  assert.equal(g.solid[last.y * g.w + last.x], 0);
  assert.ok(Math.hypot(last.x - 3, last.y - 2) <= 1.5);
});

test('持ち物: 空いていれば置ける。重なり・はみ出しは置けない。自分自身は除く', () => {
  const items = [{ id: 'a', x: 0, y: 0, w: 2, h: 3 }];
  assert.equal(invFits(items, 10, 6, 2, 0, 1, 1), true);
  assert.equal(invFits(items, 10, 6, 1, 2, 1, 1), false);
  assert.equal(invFits(items, 10, 6, 9, 0, 2, 1), false);
  assert.equal(invFits(items, 10, 6, 1, 0, 2, 3, 'a'), true);
});

test('持ち物: 空いている場所を左上から探す。無ければ null', () => {
  const items = [{ id: 'a', x: 0, y: 0, w: 2, h: 2 }];
  assert.deepEqual(invFindSpot(items, 4, 2, 2, 2), { x: 2, y: 0 });
  assert.equal(invFindSpot([...items, { id: 'b', x: 2, y: 0, w: 2, h: 2 }], 4, 2, 1, 1), null);
});

const tree = {
  nodes: {
    S: { id: 'S', kind: 'start', links: ['A'] },
    A: { id: 'A', kind: 'small', links: ['S', 'B', 'C'] },
    B: { id: 'B', kind: 'small', links: ['A'] },
    C: { id: 'C', kind: 'notable', links: ['A', 'D'] },
    D: { id: 'D', kind: 'small', links: ['C'] },
  },
};

test('ツリー: 取ったマスとつながる、まだ取っていないマスだけが取れる', () => {
  assert.deepEqual([...treeAllocatable(tree, new Set(['S']))].sort(), ['A']);
  assert.deepEqual([...treeAllocatable(tree, new Set(['S', 'A']))].sort(), ['B', 'C']);
});

test('ツリー: 片方向にしか書かれていないつながりも、両方向として扱う', () => {
  const t = { nodes: { S: { id: 'S', kind: 'start', links: ['A'] }, A: { id: 'A', kind: 'small', links: [] } } };
  assert.deepEqual([...treeAllocatable(t, new Set(['S']))], ['A']);
});

test('ツリー: 取り消すと出発点から切れるマスは取り消せない。出発点も取り消せない', () => {
  const alloc = new Set(['S', 'A', 'B', 'C']);
  assert.equal(treeCanUnalloc(tree, alloc, 'B'), true);
  assert.equal(treeCanUnalloc(tree, alloc, 'C'), true);
  assert.equal(treeCanUnalloc(tree, alloc, 'A'), false);
  assert.equal(treeCanUnalloc(tree, alloc, 'S'), false);
  assert.equal(treeCanUnalloc(tree, alloc, 'D'), false); // 取っていない
});

test('ツリー: 門のマスも根になる（転職でもらった門から伸ばした先は残せる）', () => {
  const t = {
    nodes: {
      S: { id: 'S', kind: 'start', links: ['A'] },
      A: { id: 'A', kind: 'small', links: ['S'] },
      G: { id: 'G', kind: 'gate', links: ['H'] },
      H: { id: 'H', kind: 'small', links: ['G'] },
    },
  };
  assert.equal(treeCanUnalloc(t, new Set(['S', 'A', 'G', 'H']), 'H'), true);
  assert.equal(treeCanUnalloc(t, new Set(['S', 'A', 'G', 'H']), 'G'), false);
});

test('能力値の文: 足す・％増し・かける・幅', () => {
  assert.equal(formatMod({ key: 'str', mode: 'flat', value: 5 }), '力 +5');
  assert.equal(formatMod({ key: 'life', mode: 'inc', value: 10 }), '最大体力 +10%');
  assert.equal(formatMod({ key: 'dmg', mode: 'more', value: 20 }), 'ダメージ ×1.2');
  assert.equal(formatMod({ key: 'armor', mode: 'flat', value: [5, 8] }), '防御 +5〜8');
  assert.equal(formatMod({ key: 'moveSpeed', mode: 'inc', value: -10 }), '歩く速さ −10%');
  assert.equal(formatMod({ key: 'unknownKey', mode: 'flat', value: 1 }), 'unknownKey +1');
});

test('網目: 0 は塗らない、1 は全部塗る、0.5 はちょうど半分塗る', () => {
  let n0 = 0, n1 = 0, nh = 0;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    n0 += ditherOn(0, x, y); n1 += ditherOn(1, x, y); nh += ditherOn(0.5, x, y);
  }
  assert.equal(n0, 0); assert.equal(n1, 16); assert.equal(nh, 8);
});

test('経験値: 次のレベルまで round(100 × L^1.8)', () => {
  assert.equal(xpToNext(1), 100);
  assert.equal(xpToNext(2), Math.round(100 * 2 ** 1.8));
  assert.equal(xpToNext(10), Math.round(100 * 10 ** 1.8));
});

test('視点の回転: 0.25 秒で 90° 進み、行き過ぎない', () => {
  let a = 0;
  const target = Math.PI / 2;
  for (let i = 0; i < 10; i++) a = stepAngle(a, target, 0.025);
  near(a, target, 1e-9);
  a = stepAngle(0, target, 0.1);
  near(a, (Math.PI / 2) * 0.4);
});

test('説明の計算: 命中率は 5%〜95% に収まる', () => {
  near(hitChance(100, 100), 100 / 150);
  near(hitChance(1, 1000), 0.05);
  near(hitChance(1000, 0), 0.95);
});

test('説明の計算: 物理の軽減 受ける = ダメージ × (1 − 防御 / (防御 + 5 × ダメージ))', () => {
  near(physTaken(50, 0), 50);
  near(physTaken(50, 250), 50 * (1 - 250 / 500));
  assert.ok(physTaken(10, 100) < physTaken(100, 100) / 10 * 10);
});

test('説明の計算: 耐性は 75% で頭打ち', () => {
  assert.equal(resCapped(30), 30);
  assert.equal(resCapped(120), 75);
});

test('待ち時間: 残りの割合（0〜1）', () => {
  near(cdFraction({ until: 2000, total: 1000 }, 1500), 0.5);
  near(cdFraction({ until: 2000, total: 1000 }, 2500), 0);
  near(cdFraction(null, 0), 0);
});
