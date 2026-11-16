// 追加の項目のうち、計算やパースの中核（core）を持つもののテスト
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
  return Object.fromEntries(names.map((n) => [n, (...a) => structuredClone(ctx.__x[n](...a))]));
}

const TABLES = {
  fruits: [
    { name: 'りんご', color: 'red', price: 150 },
    { name: 'みかん', color: 'orange', price: 80 },
    { name: 'いちご', color: 'red', price: 400 },
    { name: 'ぶどう', color: 'purple', price: 300 },
    { name: 'れもん', color: 'yellow', price: 120 },
  ],
};

test('小さなSQL: 列の選択・条件・並べ替え', () => {
  const { runSql } = core('dt-mini-sql', ['runSql']);
  const r = runSql('SELECT name, price FROM fruits WHERE price >= 150 ORDER BY price DESC', TABLES);
  assert.deepEqual(r.columns, ['name', 'price']);
  assert.deepEqual(r.rows, [['いちご', 400], ['ぶどう', 300], ['りんご', 150]]);
});

test('小さなSQL: * と LIMIT、小文字のキーワード', () => {
  const { runSql } = core('dt-mini-sql', ['runSql']);
  const r = runSql('select * from fruits order by name limit 2', TABLES);
  assert.deepEqual(r.columns, ['name', 'color', 'price']);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0][0], 'いちご');
});

test('小さなSQL: AND・OR・NOT・かっこ・LIKE', () => {
  const { runSql } = core('dt-mini-sql', ['runSql']);
  const names = (q) => runSql(q, TABLES).rows.map((row) => row[0]);
  assert.deepEqual(names("SELECT name FROM fruits WHERE color = 'red' AND price < 200"), ['りんご']);
  assert.deepEqual(names("SELECT name FROM fruits WHERE (color = 'red' OR color = 'yellow') AND NOT price > 300"), ['りんご', 'れもん']);
  assert.deepEqual(names("SELECT name FROM fruits WHERE name LIKE '%ん%'"), ['りんご', 'みかん', 'れもん']);
  assert.deepEqual(names("SELECT name FROM fruits WHERE color <> 'red' AND color != 'orange'"), ['ぶどう', 'れもん']);
});

test('小さなSQL: GROUP BY と集計・別名', () => {
  const { runSql } = core('dt-mini-sql', ['runSql']);
  const r = runSql('SELECT color, COUNT(*) AS n, SUM(price) AS total FROM fruits GROUP BY color ORDER BY n DESC, color LIMIT 2', TABLES);
  assert.deepEqual(r.columns, ['color', 'n', 'total']);
  assert.deepEqual(r.rows, [['red', 2, 550], ['orange', 1, 80]]);
  const all = runSql('SELECT COUNT(*), AVG(price), MAX(price), MIN(price) FROM fruits', TABLES);
  assert.deepEqual(all.rows, [[5, 210, 400, 80]]);
});

test('小さなSQL: 誤りは日本語の例外になる', () => {
  const { runSql } = core('dt-mini-sql', ['runSql']);
  assert.throws(() => runSql('SELECT * FROM nothing', TABLES), /表/);
  assert.throws(() => runSql('SELECT weight FROM fruits', TABLES), /列/);
  assert.throws(() => runSql('SELECT name fruits', TABLES), /FROM/);
});

test('しりとり: 最後の字（長音・小さい字・カタカナ）', () => {
  const { tailKana } = core('gm-shiritori', ['tailKana']);
  assert.equal(tailKana('りんご'), 'ご');
  assert.equal(tailKana('コーヒー'), 'ひ');
  assert.equal(tailKana('きしゃ'), 'や');
  assert.equal(tailKana('ラーメン'), 'ん');
});

test('しりとり: つながるか・使った言葉・ん で終わる', () => {
  const { checkMove } = core('gm-shiritori', ['checkMove']);
  assert.equal(checkMove('りんご', 'ごりら', []).ok, true);
  assert.equal(checkMove('りんご', 'ゴリラ', []).ok, true);
  assert.equal(checkMove('りんご', 'らっぱ', []).ok, false);
  assert.equal(checkMove('りんご', 'ごりら', ['ごりら']).ok, false);
  const n = checkMove('ごりら', 'らいおん', []);
  assert.equal(n.ok, true);
  assert.equal(n.lose, true);
  assert.equal(checkMove('', 'abc', []).ok, false);
});

test('ローン: 金利0なら毎月同じ額', () => {
  const { loanSchedule } = core('ut-loan', ['loanSchedule']);
  const s = loanSchedule(1000000, 0, 10, 'equal-payment');
  assert.equal(s.rows.length, 10);
  assert.ok(s.rows.every((r) => r.payment === 100000));
  assert.equal(s.totalInterest, 0);
});

test('ローン: 元利均等は最後に残高が0、元金の合計は借りた額', () => {
  const { loanSchedule } = core('ut-loan', ['loanSchedule']);
  const s = loanSchedule(3000000, 1.2, 120, 'equal-payment');
  assert.equal(s.rows.length, 120);
  assert.equal(s.rows[0].interest, 3000);
  assert.equal(s.rows.at(-1).balance, 0);
  assert.equal(s.rows.reduce((a, r) => a + r.principal, 0), 3000000);
  assert.equal(new Set(s.rows.slice(0, -1).map((r) => r.payment)).size, 1);
  assert.equal(s.totalInterest, s.totalPayment - 3000000);
});

test('ローン: 元金均等は元金が一定で利息が減っていく', () => {
  const { loanSchedule } = core('ut-loan', ['loanSchedule']);
  const s = loanSchedule(1200000, 2.4, 12, 'equal-principal');
  assert.ok(s.rows.every((r) => r.principal === 100000));
  assert.ok(s.rows[0].interest > s.rows[11].interest);
  assert.equal(s.rows.at(-1).balance, 0);
});
