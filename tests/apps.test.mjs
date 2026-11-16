// 「そのまま使えるアプリ」の中核（core に書いた純粋な関数）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sandbox);
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const [, f] of html.matchAll(/<script src="(entries\/[^"]+)"/g)) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), sandbox, { filename: f });
const D = sandbox.dekiru;

function core(id, names) {
  const e = D.entries.find((x) => x.id === id);
  if (!e) throw new Error('項目がありません: ' + id);
  if (!e.core) throw new Error('core がありません: ' + id);
  const ctx = vm.createContext({});
  vm.runInContext(D.src(e.core) + `\n;globalThis.__x = { ${names.join(', ')} };`, ctx);
  // vm の中で作った配列は prototype が別物なので、比べる前にこちら側の値へ写す
  return Object.fromEntries(names.map((n) => [n, (...a) => structuredClone(ctx.__x[n](...a))]));
}

test('表計算: 四則演算・かっこ・参照', () => {
  const { computeSheet } = core('app-spreadsheet', ['computeSheet']);
  const v = computeSheet({ A1: '10', A2: '20', A3: '=A1+A2*2', B1: '=(1+2)*3', B2: '=10-4-3', B3: '=2^3^2', C1: '=a1/4' });
  assert.equal(v.A3, 50);
  assert.equal(v.B1, 9);
  assert.equal(v.B2, 3);
  assert.equal(v.B3, 512);
  assert.equal(v.C1, 2.5);
});

test('表計算: 範囲と関数', () => {
  const { computeSheet } = core('app-spreadsheet', ['computeSheet']);
  const v = computeSheet({ A1: '1', A2: '2', A3: '3', B1: '4', B2: 'りんご', C1: '=SUM(A1:A3)', C2: '=AVERAGE(A1:A3)', C3: '=MAX(A1:B2)', C4: '=COUNT(A1:B2)', C5: '=ROUND(3.14159, 2)', C6: '=IF(A3>2, "大", "小")', C7: '=MIN(A1:A3)+ABS(-5)' });
  assert.equal(v.C1, 6);
  assert.equal(v.C2, 2);
  assert.equal(v.C3, 4);
  assert.equal(v.C4, 3);
  assert.equal(v.C5, 3.14);
  assert.equal(v.C6, '大');
  assert.equal(v.C7, 6);
  assert.equal(v.B2, 'りんご');
});

test('表計算: 空のセルは0、エラーは # で始まる', () => {
  const { computeSheet } = core('app-spreadsheet', ['computeSheet']);
  const v = computeSheet({ A1: '=Z9+1', A2: '=1/0', A3: '=FOO(1)', B1: '=C1', C1: '=B1', D1: '="a"*2', D2: '=1+' });
  assert.equal(v.A1, 1);
  assert.equal(v.A2, '#DIV/0!');
  assert.equal(v.A3, '#NAME?');
  assert.match(String(v.B1), /^#/);
  assert.match(String(v.C1), /^#/);
  assert.equal(v.D1, '#VALUE!');
  assert.match(String(v.D2), /^#/);
});

test('単語帳: 復習の間隔（SM-2）', () => {
  const { review, dayNumber } = core('app-flashcards', ['review', 'dayNumber']);
  assert.equal(dayNumber('2026-01-01') - dayNumber('2025-12-31'), 1);
  let c = { reps: 0, interval: 0, ease: 2.5, due: 0 };
  c = review(c, 4, 100);
  assert.deepEqual([c.reps, c.interval, c.due, c.ease], [1, 1, 101, 2.5]);
  c = review(c, 4, 101);
  assert.deepEqual([c.reps, c.interval, c.due], [2, 6, 107]);
  c = review(c, 5, 107);
  assert.equal(c.interval, 15);
  assert.ok(Math.abs(c.ease - 2.6) < 1e-9);
  const miss = review(c, 1, 122);
  assert.deepEqual([miss.reps, miss.interval, miss.due], [0, 1, 123]);
  let low = { reps: 3, interval: 10, ease: 1.35, due: 0 };
  low = review(low, 3, 0);
  assert.equal(low.ease, 1.3);
});

test('文章チェッカー: ら抜き言葉（見れば は対象外）', () => {
  const { check } = core('app-proofreader', ['check']);
  const t = 'このケーキは食べれる。';
  const hit = check(t).find((i) => i.type === 'ら抜き');
  assert.ok(hit);
  assert.equal(hit.index, t.indexOf('食べれる'));
  assert.equal(hit.suggest, '食べられる');
  assert.ok(!check('見れば分かる。').some((i) => i.type === 'ら抜き'));
});

test('文章チェッカー: 二重表現・全角英数・文体の混在・長い文・語尾の連続', () => {
  const { check } = core('app-proofreader', ['check']);
  const types = (s) => check(s).map((i) => i.type);
  assert.ok(types('頭痛が痛い。').includes('二重表現'));
  const z = check('ＡＢＣを使う。').find((i) => i.type === '全角英数');
  assert.equal(z.suggest, 'ABC');
  assert.ok(types('今日は晴れです。明日は雨だ。').includes('文体の混在'));
  assert.ok(types('あ'.repeat(90) + '。').includes('長い文'));
  assert.ok(types('行きます。食べます。寝ます。').includes('語尾の連続'));
  assert.deepEqual(check('今日は晴れです。散歩に行きました。'), []);
});

test('ドット絵: 塗りつぶし', () => {
  const { floodFill } = core('app-pixel-editor', ['floodFill']);
  const g = [1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0];
  const out = floodFill(g, 4, 4, 0, 0, 7);
  assert.deepEqual(out, [7, 7, 0, 0, 7, 0, 0, 7, 7, 7, 7, 7, 0, 0, 7, 0]);
  assert.deepEqual(g.slice(0, 2), [1, 1], '元の配列は変えない');
  assert.deepEqual(floodFill(g, 4, 4, 0, 0, 1), g);
});

test('スライド: 区切りと見出し・箇条書き', () => {
  const { parseSlides } = core('app-slides', ['parseSlides']);
  const s = parseSlides('# 表紙\nはじめに\n---\n# 2枚目\n- いち\n- に\n\n---\n');
  assert.equal(s.length, 2);
  assert.equal(s[0].title, '表紙');
  assert.deepEqual(s[0].paras, ['はじめに']);
  assert.deepEqual(s[1].bullets, ['いち', 'に']);
});

test('マインドマップ: 親は子の真ん中、深いほど右', () => {
  const { layoutTree } = core('app-mindmap', ['layoutTree']);
  const tree = { id: 'r', children: [{ id: 'a', children: [{ id: 'a1', children: [] }, { id: 'a2', children: [] }] }, { id: 'b', children: [] }] };
  const p = layoutTree(tree, { dx: 100, dy: 40 });
  assert.equal(p.a1.x, 200);
  assert.equal(p.a.y, (p.a1.y + p.a2.y) / 2);
  assert.equal(p.r.y, (p.a.y + p.b.y) / 2);
  assert.ok(p.b.y > p.a2.y);
  assert.equal(p.r.x, 0);
});

test('家計簿: 月ごとの集計', () => {
  const { summarize } = core('app-kakeibo', ['summarize']);
  const items = [
    { date: '2026-11-01', kind: 'in', amount: 250000, cat: '給料' },
    { date: '2026-11-03', kind: 'out', amount: 1200, cat: '食費' },
    { date: '2026-11-20', kind: 'out', amount: 800, cat: '食費' },
    { date: '2026-11-21', kind: 'out', amount: 5000, cat: '交通' },
    { date: '2026-10-30', kind: 'out', amount: 9999, cat: '食費' },
  ];
  const s = summarize(items, '2026-11');
  assert.equal(s.income, 250000);
  assert.equal(s.expense, 7000);
  assert.equal(s.balance, 243000);
  assert.deepEqual(s.byCategory, [['交通', 5000], ['食費', 2000]]);
});
