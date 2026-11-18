// 表計算の計算（os/js/core/sheet.mjs）のテスト。
// 番地、値の読み取り、数式の字句と構文の解析と評価、関数、誤りの表示、参照のずらし（コピー・行と列の挿入と削除・移動）、
// 依存と循環、オートフィル、並べ替え、数の表示の書式、CSV の読み書き、保存の形の検証を確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../os/js/core/sheet.mjs';

const NOW = { y: 2026, m: 11, d: 19, hh: 12, mm: 30, ss: 0 };
// { A1: '10', A2: '=A1*2' } のような表を作る
function make(cells, opts = {}) {
  const sh = new S.Sheet({ now: () => NOW, ...opts });
  for (const [a, v] of Object.entries(cells)) sh.put(a, v);
  return sh;
}
const code = (v) => (S.isErr(v) ? v.code : v);
const one = (formula, cells = {}) => { const sh = make({ ...cells, Z1: formula }); return code(sh.val('Z1')); };
const R = (t) => S.parseRangeText(t);

/* ---------- 番地 ---------- */
test('番地: 列の名前と番号、A1 の読み書き、範囲', () => {
  assert.equal(S.colName(0), 'A');
  assert.equal(S.colName(25), 'Z');
  assert.equal(S.colName(26), 'AA');
  assert.equal(S.colName(51), 'AZ');
  assert.equal(S.colIndex('A'), 0);
  assert.equal(S.colIndex('az'), 51);
  assert.equal(S.addr(0, 0), 'A1');
  assert.equal(S.addr(9, 27), 'AB10');
  assert.deepEqual(S.parseAddr('B3'), { r: 2, c: 1 });
  assert.deepEqual(S.parseAddr('$c$10'), { r: 9, c: 2 });
  assert.equal(S.parseAddr('A0'), null);
  assert.equal(S.parseAddr('1A'), null);
  assert.equal(S.parseAddr(''), null);
  assert.deepEqual(R('B3:A1'), { r1: 0, c1: 0, r2: 2, c2: 1 });
  assert.deepEqual(R('C5'), { r1: 4, c1: 2, r2: 4, c2: 2 });
  assert.equal(S.rangeText({ r1: 0, c1: 0, r2: 2, c2: 1 }), 'A1:B3');
  assert.equal(S.rangeText({ r1: 4, c1: 2, r2: 4, c2: 2 }), 'C5');
});

/* ---------- 値の読み取り ---------- */
test('値: 数・パーセント・桁区切り・日付・真偽値・文字を見分ける', () => {
  assert.equal(S.parseLiteral('10').value, 10);
  assert.equal(S.parseLiteral(' -3.5 ').value, -3.5);
  assert.equal(S.parseLiteral('+5').value, 5);
  assert.equal(S.parseLiteral('1e3').value, 1000);
  assert.equal(S.parseLiteral('１２').value, 12);
  assert.deepEqual(S.parseLiteral('1,234.5'), { value: 1234.5, hint: { num: 'number', sep: true, dec: 1 } });
  assert.deepEqual(S.parseLiteral('12.5%'), { value: 0.125, hint: { num: 'percent', dec: 1 } });
  assert.deepEqual(S.parseLiteral('2026/11/19'), { value: 46345, hint: { num: 'date' } });
  assert.equal(S.parseLiteral('2026-11-19').value, 46345);
  assert.equal(S.parseLiteral('2026/2/30').value, '2026/2/30');
  assert.equal(S.parseLiteral('TRUE').value, true);
  assert.equal(S.parseLiteral('false').value, false);
  assert.equal(S.parseLiteral("'123").value, '123');
  assert.equal(S.parseLiteral('12abc').value, '12abc');
  assert.equal(S.parseLiteral('1,23').value, '1,23');
  assert.equal(S.parseLiteral('').value, null);
});

test('日付: 表計算ソフトと同じ日付の数（1899-12-30 から数えた日）', () => {
  assert.equal(S.dateSerial(1970, 1, 1), 25569);
  assert.equal(S.dateSerial(2026, 11, 19), 46345);
  assert.equal(S.dateSerial(2024, 3, 1) - S.dateSerial(2024, 2, 28), 2);
  assert.deepEqual(S.serialParts(46345.75), { y: 2026, m: 11, d: 19, hh: 18, mm: 0, ss: 0 });
  assert.deepEqual(S.serialParts(S.dateSerial(2000, 2, 29)), { y: 2000, m: 2, d: 29, hh: 0, mm: 0, ss: 0 });
});

/* ---------- 数式 ---------- */
test('数式: 四則と累乗、括弧、符号、パーセントの順番（LibreOffice と同じく ^ は左から、-2^2 は 4）', () => {
  assert.equal(one('=1+2*3'), 7);
  assert.equal(one('=(1+2)*3'), 9);
  assert.equal(one('=7-2-1'), 4);
  assert.equal(one('=10/4'), 2.5);
  assert.equal(one('=2^3^2'), 64);
  assert.equal(one('=-2^2'), 4);
  assert.equal(one('=2^-1'), 0.5);
  assert.equal(one('=50%*200'), 100);
  assert.equal(one('= 1 +  2 '), 3);
  assert.equal(one('=0.1+0.2'), 0.30000000000000004);
});

test('数式: 比べる記号と文字をつなぐ &', () => {
  assert.equal(one('=1<2'), true);
  assert.equal(one('=2<>2'), false);
  assert.equal(one('=3>=3'), true);
  assert.equal(one('="a"="A"'), true);
  assert.equal(one('="b">"a"'), true);
  assert.equal(one('=1<"a"'), true);
  assert.equal(one('="合計"&10'), '合計10');
  assert.equal(one('=1&2'), '12');
  assert.equal(one('=(0.1+0.2)&""'), '0.3');
  assert.equal(one('=TRUE&"!"'), 'TRUE!');
  assert.equal(one('="言う""こと"""'), '言う"こと"');
});

test('数式: セルの参照（相対・絶対・小文字）と空のセル', () => {
  const sh = make({ A1: '10', A2: '20', A3: '=A1+A2', A4: '=$A$1*2', A5: '=a1+a$2', A6: '=Z99+1', A7: '=Z99', A8: '=A1&"円"' });
  assert.equal(sh.val('A3'), 30);
  assert.equal(sh.val('A4'), 20);
  assert.equal(sh.val('A5'), 30);
  assert.equal(sh.val('A6'), 1);
  assert.equal(sh.val('A7'), 0);
  assert.equal(sh.val('A8'), '10円');
  assert.equal(sh.input(4, 0), '=A1+A$2', '参照は大文字に直して残す');
});

test('数式: 全角で打った式も読む（＝１＋２）', () => {
  const sh = make({ A1: '＝１＋２', A2: '＝ＳＵＭ（Ａ１，３）', A3: '="ＡＢ"&"c"' });
  assert.equal(sh.val('A1'), 3);
  assert.equal(sh.inputAt('A1'), '=1+2');
  assert.equal(sh.val('A2'), 6);
  assert.equal(sh.val('A3'), 'ＡＢc', '文字列の中はそのまま');
});

test('関数: SUM・AVERAGE・MIN・MAX・COUNT・COUNTA（範囲の文字と空は数えない）', () => {
  const cells = { A1: '1', A2: '2', A3: '3', B1: '4', B2: 'りんご', B3: '' };
  assert.equal(one('=SUM(A1:A3)', cells), 6);
  assert.equal(one('=SUM(A1:B3)', cells), 10);
  assert.equal(one('=SUM(A1,A2,10)', cells), 13);
  assert.equal(one('=SUM(B2)', cells), 0, '参照の文字は数えない');
  assert.equal(one('=SUM("3",1)', cells), 4, '直接書いた数の文字は数にする');
  assert.equal(one('=SUM("x")', cells), '#VALUE!');
  assert.equal(one('=AVERAGE(A1:B3)', cells), 2.5);
  assert.equal(one('=AVERAGE(B2:B3)', cells), '#DIV/0!');
  assert.equal(one('=MIN(A1:B3)', cells), 1);
  assert.equal(one('=MAX(A1:B3)', cells), 4);
  assert.equal(one('=MAX(B2:B3)', cells), 0);
  assert.equal(one('=COUNT(A1:B3)', cells), 4);
  assert.equal(one('=COUNTA(A1:B3)', cells), 5);
  assert.equal(one('=sum(a1:a3)*2', cells), 12);
});

test('関数: ROUND（0.5 は 0 から遠い方へ、桁は負も使える）と ABS', () => {
  assert.equal(one('=ROUND(3.14159, 2)'), 3.14);
  assert.equal(one('=ROUND(2.5)'), 3);
  assert.equal(one('=ROUND(-2.5)'), -3);
  assert.equal(one('=ROUND(1.005, 2)'), 1.01);
  assert.equal(one('=ROUND(1234, -2)'), 1200);
  assert.equal(one('=ABS(-5)'), 5);
});

test('関数: IF・AND・OR・NOT（IF は選ばれなかった側を計算しない）', () => {
  const cells = { A1: '8' };
  assert.equal(one('=IF(A1>5,"大","小")', cells), '大');
  assert.equal(one('=IF(A1>10,"大","小")', cells), '小');
  assert.equal(one('=IF(FALSE,1)', cells), false);
  assert.equal(one('=IF(TRUE,1,1/0)', cells), 1);
  assert.equal(one('=IF(A1,"ある","ない")', cells), 'ある');
  assert.equal(one('=AND(TRUE,1)'), true);
  assert.equal(one('=AND(TRUE,0)'), false);
  assert.equal(one('=OR(FALSE,0)'), false);
  assert.equal(one('=OR(A1>5,FALSE)', cells), true);
  assert.equal(one('=NOT(TRUE)'), false);
  assert.equal(one('=AND("x")'), '#VALUE!');
});

test('関数: CONCAT・LEN・UPPER・LOWER（文字数は見た目の文字で数える）', () => {
  const cells = { A1: 'a', A2: '1', A3: 'c' };
  assert.equal(one('=CONCAT("[",A1:A3,"]")', cells), '[a1c]');
  assert.equal(one('=LEN("ありがとう")'), 5);
  assert.equal(one('=LEN(12.5)'), 4);
  assert.equal(one('=LEN(Z50)'), 0);
  assert.equal(one('=UPPER("abc")'), 'ABC');
  assert.equal(one('=LOWER("ÀBC")'), 'àbc');
});

test('関数: TODAY と NOW は今の日付と時刻の数（日付の表示が付く）', () => {
  const sh = make({ A1: '=TODAY()', A2: '=NOW()', A3: '=TODAY()+1' });
  assert.equal(sh.val('A1'), 46345);
  assert.equal(sh.val('A2'), 46345 + 12.5 / 24);
  assert.equal(sh.text('A1'), '2026/11/19');
  assert.equal(sh.text('A2'), '2026/11/19 12:30');
  assert.equal(sh.val('A3'), 46346);
});

test('関数: VLOOKUP（完全一致・近い値・見つからない・列が範囲の外）', () => {
  const cells = { A1: '10', B1: 'D', A2: '20', B2: 'C', A3: '30', B3: 'B', D1: 'みかん', E1: '80', D2: 'りんご', E2: '120' };
  assert.equal(one('=VLOOKUP(20,A1:B3,2,FALSE)', cells), 'C');
  assert.equal(one('=VLOOKUP(25,A1:B3,2)', cells), 'C');
  assert.equal(one('=VLOOKUP(25,A1:B3,2,FALSE)', cells), '#N/A');
  assert.equal(one('=VLOOKUP(5,A1:B3,2)', cells), '#N/A');
  assert.equal(one('=VLOOKUP("リンゴ",D1:E2,2,FALSE)', cells), '#N/A');
  assert.equal(one('=VLOOKUP("りんご",D1:E2,2,FALSE)', cells), 120);
  assert.equal(one('=VLOOKUP(20,A1:B3,3,FALSE)', cells), '#REF!');
  assert.equal(one('=VLOOKUP(20,A1:B3,0,FALSE)', cells), '#VALUE!');
});

test('関数: SUMIF と COUNTIF（比べる記号、文字、* と ? の当てはめ、空）', () => {
  const cells = { A1: 'りんご', B1: '100', A2: 'みかん', B2: '50', A3: 'りんご飴', B3: '200', A4: '', B4: '5', A5: '12', B5: '1' };
  assert.equal(one('=SUMIF(A1:A5,"りんご",B1:B5)', cells), 100);
  assert.equal(one('=SUMIF(A1:A5,"り*",B1:B5)', cells), 300);
  assert.equal(one('=SUMIF(B1:B5,">=100")', cells), 300);
  assert.equal(one('=SUMIF(B1:B5,"<>50")', cells), 306);
  assert.equal(one('=COUNTIF(A1:A5,"???")', cells), 2);
  assert.equal(one('=COUNTIF(A1:A5,"")', cells), 1);
  assert.equal(one('=COUNTIF(A1:A5,"<>")', cells), 4);
  assert.equal(one('=COUNTIF(B1:B5,50)', cells), 1);
  assert.equal(one('=COUNTIF(A1:A5,12)', cells), 1);
  assert.equal(one('=COUNTIF(B1:B5,">"&B2)', cells), 2);
});

test('誤り: #DIV/0!・#NAME?・#VALUE!・#REF!・#ERROR!・広がり', () => {
  assert.equal(one('=1/0'), '#DIV/0!');
  assert.equal(one('=FOO(1)'), '#NAME?');
  assert.equal(one('=abc+1'), '#NAME?');
  assert.equal(one('="a"*2'), '#VALUE!');
  assert.equal(one('=A1:A3'), '#VALUE!');
  assert.equal(one('=A1001'), '#REF!');
  assert.equal(one('=#REF!+1'), '#REF!');
  assert.equal(one('=1+'), '#ERROR!');
  assert.equal(one('=SUM(1'), '#ERROR!');
  assert.equal(one('=ROUND()'), '#ERROR!');
  assert.equal(one('="abc'), '#ERROR!');
  assert.equal(one('='), '#ERROR!');
  assert.equal(one('=1 2'), '#ERROR!');
  assert.equal(one('=(-1)^0.5'), '#NUM!');
  const sh = make({ A1: '=1/0', A2: '=A1+1', A3: '=SUM(A1:A2)', A4: '=IF(TRUE,5,A1)' });
  assert.equal(code(sh.val('A2')), '#DIV/0!');
  assert.equal(code(sh.val('A3')), '#DIV/0!');
  assert.equal(sh.val('A4'), 5);
  assert.match(S.explain('#DIV/0!'), /0 で割/);
  assert.match(sh.problem(0, 0), /0 で割/);
  assert.match(make({ A1: '=SUM(1' }).problem(0, 0), /\)/);
});

test('循環: 互いに指すセル、自分を指すセル、自分を含む範囲は #CYCLE!。直すと戻る', () => {
  const sh = make({ A1: '=B1', B1: '=A1', C1: '=A1+1', D1: '=D1+1', A5: '=SUM(A1:A5)', E1: '7' });
  assert.equal(code(sh.val('A1')), '#CYCLE!');
  assert.equal(code(sh.val('B1')), '#CYCLE!');
  assert.equal(code(sh.val('C1')), '#CYCLE!');
  assert.equal(code(sh.val('D1')), '#CYCLE!');
  assert.equal(code(sh.val('A5')), '#CYCLE!');
  sh.put('B1', '5');
  assert.equal(sh.val('A1'), 5);
  assert.equal(sh.val('C1'), 6);
});

test('依存: 変わったセルの先だけ計算し直す', () => {
  const sh = make({ A1: '1', A2: '2', A3: '3', B1: '=A1*2', B2: '=B1+1', C1: '=A3*10', D1: '=SUM(A1:A2)', E1: '=C1+1' });
  sh.put('A1', '5');
  assert.equal(sh.val('B1'), 10);
  assert.equal(sh.val('B2'), 11);
  assert.equal(sh.val('D1'), 7);
  assert.equal(sh.lastRecalc, 3, 'B1・B2・D1 だけ');
  sh.put('A3', '4');
  assert.equal(sh.val('E1'), 41);
  assert.equal(sh.lastRecalc, 2, 'C1・E1 だけ');
  sh.put('Q9', 'x');
  assert.equal(sh.lastRecalc, 0);
  // 長い鎖（1000 段）でも止まらない
  const big = new S.Sheet();
  big.put('A1', '1');
  for (let r = 2; r <= 1000; r++) big.put('A' + r, `=A${r - 1}+1`);
  big.put('A1', '2');
  assert.equal(big.val('A1000'), 1001);
});

/* ---------- 参照のずらし ---------- */
test('ずらし: コピーでは相対だけ動き、$ は動かない。外へ出ると #REF!', () => {
  assert.equal(S.shiftFormula('=A1+$B$2+C$3+$D4', 1, 2), '=C2+$B$2+E$3+$D5');
  assert.equal(S.shiftFormula('=SUM(A1:B2)', 2, 1), '=SUM(B3:C4)');
  assert.equal(S.shiftFormula('="A1"&A1', 1, 0), '="A1"&A2');
  assert.equal(S.shiftFormula('=A1', -1, 0), '=#REF!');
  assert.equal(S.shiftFormula('=SUM(A1:A3)', 0, -1), '=SUM(#REF!)');
  assert.equal(S.shiftFormula('=  a1 + 1', 1, 0), '=  A2 + 1', '空白は残す');
  assert.equal(S.shiftFormula('=SUM(1', 1, 0), '=SUM(1', '読めない式はそのまま');
});

test('ずらし: 行と列を入れると、後ろを指す参照が動き、範囲は広がる', () => {
  assert.equal(S.adjustInsert('=A1+A5+SUM(A2:A6)', 'row', 2, 1), '=A1+A6+SUM(A2:A7)');
  assert.equal(S.adjustInsert('=$A$5', 'row', 0, 2), '=$A$7');
  assert.equal(S.adjustInsert('=C1+A1', 'col', 1, 2), '=E1+A1');
  assert.equal(S.adjustInsert('=A1000', 'row', 0, 1, { rows: 1000, cols: 52 }), '=#REF!');
});

test('ずらし: 行と列を消すと、消えた所は #REF!、後ろは詰まり、範囲は縮む', () => {
  assert.equal(S.adjustDelete('=A1+A3+A5+SUM(A2:A6)', 'row', 2, 1), '=A1+#REF!+A4+SUM(A2:A5)');
  assert.equal(S.adjustDelete('=SUM(A2:A4)', 'row', 1, 3), '=SUM(#REF!)');
  assert.equal(S.adjustDelete('=SUM(A3:A7)', 'row', 0, 4), '=SUM(A1:A3)');
  assert.equal(S.adjustDelete('=SUM(A1:A4)', 'row', 2, 4), '=SUM(A1:A2)');
  assert.equal(S.adjustDelete('=D1*2', 'col', 1, 1), '=C1*2');
});

test('ずらし: 移動（切り取り）では、動かした範囲を指す参照だけ動く', () => {
  const src = R('A1:B2');
  assert.equal(S.adjustMove('=A1+B2+C3+SUM(A1:B2)+SUM(A1:C3)', src, 4, 1), '=B5+C6+C3+SUM(B5:C6)+SUM(A1:C3)');
});

/* ---------- 表の操作 ---------- */
test('表: 行を入れると中身が下へ動き、式の参照が直る。消すと #REF!', () => {
  const sh = make({ A1: '10', A2: '20', A3: '=A1+A2', B2: 'x' });
  sh.setHeight(1, 40);
  assert.equal(sh.insertRows(1, 1).ok, true);
  assert.equal(sh.inputAt('A2'), '');
  assert.equal(sh.val('A3'), 20);
  assert.equal(sh.inputAt('A4'), '=A1+A3');
  assert.equal(sh.val('A4'), 30);
  assert.equal(sh.inputAt('B3'), 'x');
  assert.equal(sh.height(2), 40, '行の高さも一緒に動く');
  sh.deleteRows(0, 1);
  assert.equal(sh.inputAt('A3'), '=#REF!+A2');
  assert.equal(code(sh.val('A3')), '#REF!');
});

test('表: 列を入れる・消す。列の幅も動く。一番下に中身があると行を入れない', () => {
  const sh = make({ A1: '1', B1: '2', C1: '=A1+B1' });
  sh.setWidth(1, 150);
  sh.insertCols(1, 1);
  assert.equal(sh.inputAt('D1'), '=A1+C1');
  assert.equal(sh.val('D1'), 3);
  assert.equal(sh.width(2), 150);
  sh.deleteCols(1, 1);
  assert.equal(sh.inputAt('C1'), '=A1+B1');
  assert.equal(sh.width(1), 150);
  const full = make({ A1000: 'end' });
  assert.equal(full.insertRows(0, 1).ok, false);
  assert.equal(full.inputAt('A1000'), 'end');
});

test('表: コピーと貼り付けで相対参照がずれ、$ は残る。1 つを広い範囲へ貼ると全部に入る', () => {
  const sh = make({ A1: '1', A2: '2', A3: '3', B1: '=A1*2', C1: '=$A$1+A1' });
  const blk = sh.copy(R('B1:C1'));
  sh.paste(blk, R('B2:C3'));
  assert.equal(sh.inputAt('B2'), '=A2*2');
  assert.equal(sh.inputAt('B3'), '=A3*2');
  assert.equal(sh.inputAt('C3'), '=$A$1+A3');
  assert.equal(sh.val('B3'), 6);
  assert.equal(sh.val('C3'), 4);
  const b1 = sh.copy(R('B1'));
  sh.paste(b1, R('D1:D3'));
  assert.equal(sh.inputAt('D3'), '=C3*2');
  // 書式も一緒に写る
  sh.setFormat(R('A1'), { b: true, bg: '#ffd37a' });
  sh.paste(sh.copy(R('A1')), R('E5'));
  assert.deepEqual(sh.fmtAt('E5'), { b: true, bg: '#ffd37a' });
  assert.equal(sh.toTSV(R('A1:B2')), '1\t2\r\n2\t4');
});

test('表: 切り取って貼ると、中身が動き、そこを指す式も付いてくる', () => {
  const sh = make({ A1: '5', B1: '=A1*2', C1: '=B1+1', D1: '=SUM(A1:B1)' });
  sh.move(R('A1:B1'), 2, 0);
  assert.equal(sh.inputAt('A1'), '');
  assert.equal(sh.inputAt('B1'), '');
  assert.equal(sh.inputAt('A3'), '5');
  assert.equal(sh.inputAt('B3'), '=A3*2');
  assert.equal(sh.inputAt('C1'), '=B3+1');
  assert.equal(sh.inputAt('D1'), '=SUM(A3:B3)');
  assert.equal(sh.val('C1'), 11);
  assert.equal(sh.val('D1'), 15);
});

test('表: 外から貼った TSV（タブ区切り）を値として入れる', () => {
  const sh = new S.Sheet();
  sh.pasteText('名前\t点\r\nあや\t80\r\n', 1, 1);
  assert.equal(sh.inputAt('B2'), '名前');
  assert.equal(sh.val('C3'), 80);
});

test('オートフィル: 数の連番、差の続き、文字の中の数、曜日、式、上へ', () => {
  assert.deepEqual(S.fillSeries(['1'], 3).map((x) => x.input), ['2', '3', '4']);
  assert.deepEqual(S.fillSeries(['1', '3'], 3).map((x) => x.input), ['5', '7', '9']);
  assert.deepEqual(S.fillSeries(['1', '2', '4'], 4).map((x) => x.input), ['1', '2', '4', '1']);
  assert.deepEqual(S.fillSeries(['第1週'], 2).map((x) => x.input), ['第2週', '第3週']);
  assert.deepEqual(S.fillSeries(['No.008'], 2).map((x) => x.input), ['No.009', 'No.010']);
  assert.deepEqual(S.fillSeries(['金'], 3).map((x) => x.input), ['土', '日', '月']);
  assert.deepEqual(S.fillSeries(['月曜日', '水曜日'], 2).map((x) => x.input), ['金曜日', '日曜日']);
  assert.deepEqual(S.fillSeries(['abc'], 2).map((x) => x.input), ['abc', 'abc']);
  assert.deepEqual(S.fillSeries(['2026/11/30'], 2).map((x) => x.input), ['2026/12/01', '2026/12/02']);
  assert.deepEqual(S.fillSeries(['5'], 2, -1).map((x) => x.input), ['4', '3']);
  const sh = make({ A1: '1', A2: '2', B1: '=A1*10', C1: '月' });
  sh.fill(R('A1:C2'), R('A1:C5'));
  assert.deepEqual(['A3', 'A4', 'A5'].map((a) => sh.val(a)), [3, 4, 5]);
  assert.equal(sh.inputAt('B5'), '=A5*10');
  assert.equal(sh.val('B5'), 50);
  assert.equal(sh.inputAt('C2'), '', '空のセルも写す');
  const up = make({ A5: '5', B5: '=A5+1' });
  up.fill(R('A5:B5'), R('A3:B5'));
  assert.equal(up.val('A3'), 3);
  assert.equal(up.inputAt('B3'), '=A3+1');
  const right = make({ A1: '1月' });
  right.fill(R('A1'), R('A1:C1'));
  assert.equal(right.inputAt('C1'), '3月');
});

test('並べ替え: 選んだ範囲を列で並べ、見出しは残す。式は自分の行を指したまま', () => {
  const sh = make({ A1: '名前', B1: '点', C1: '2倍', A2: 'あや', B2: '70', C2: '=B2*2', A3: 'けん', B3: '95', C3: '=B3*2', A4: 'さき', B4: '', C4: '=B4*2', A5: 'いと', B5: '80', C5: '=B5*2' });
  sh.sort(R('A1:C5'), 1, { desc: true, header: true });
  assert.deepEqual(['A1', 'A2', 'A3', 'A4', 'A5'].map((a) => sh.val(a)), ['名前', 'けん', 'いと', 'あや', 'さき']);
  assert.equal(sh.inputAt('C2'), '=B2*2');
  assert.equal(sh.val('C2'), 190);
  assert.equal(sh.val('C5'), 0, '空は最後');
  sh.sort(R('A2:C5'), 0, {});
  assert.deepEqual(['A2', 'A3', 'A4', 'A5'].map((a) => sh.val(a)), ['あや', 'いと', 'けん', 'さき']);
});

test('書式: 範囲に足す・外す、枠線、小数の桁、消す', () => {
  const sh = make({ A1: '1.5', B1: '2', A2: 'x' });
  sh.setFormat(R('A1:B2'), { b: true, color: '#4b5fe8' });
  assert.deepEqual(sh.fmtAt('B2'), { b: true, color: '#4b5fe8' });
  sh.setFormat(R('A1:B2'), { b: null });
  assert.deepEqual(sh.fmtAt('A1'), { color: '#4b5fe8' });
  sh.setBorder(R('A1:B2'), 'outer');
  assert.equal(sh.fmtAt('A1').bd, 'tl');
  assert.equal(sh.fmtAt('B2').bd, 'rb');
  sh.setBorder(R('A1:B2'), 'all');
  assert.equal(sh.fmtAt('A2').bd, 'trbl');
  sh.setBorder(R('A1:B2'), 'none');
  assert.equal(sh.fmtAt('A2').bd, undefined);
  sh.changeDecimals(R('A1'), 1);
  assert.deepEqual(sh.fmtAt('A1'), { color: '#4b5fe8', num: 'number', dec: 2 });
  assert.equal(sh.text('A1'), '1.50');
  sh.changeDecimals(R('A1'), -2);
  assert.equal(sh.text('A1'), '2');
  sh.clear(R('A1:B2'), 'formats');
  assert.equal(sh.fmtAt('A1'), null);
  assert.equal(sh.inputAt('A1'), '1.5');
  sh.clear(R('A1:B2'), 'contents');
  assert.equal(sh.inputAt('A1'), '');
  // 打った値の形から、表示の書式が付く
  const h = make({ A1: '2026/11/19', A2: '25%', A3: '1,200' });
  assert.equal(h.text('A1'), '2026/11/19');
  assert.equal(h.text('A2'), '25%');
  assert.equal(h.text('A3'), '1,200');
});

test('表示: 標準・数値・桁区切り・パーセント・日付・真偽値・誤り、寄せ方', () => {
  assert.equal(S.formatValue(0.1 + 0.2, null), '0.3');
  assert.equal(S.formatValue(1 / 3, null), '0.3333333333');
  assert.equal(S.formatValue(1e20, null), '1E+20');
  assert.equal(S.formatValue(1.5e-8, null), '1.5E-08');
  assert.equal(S.formatValue(-0, null), '0');
  assert.equal(S.generalText(1 / 3, 6), '0.333333', '狭い列では桁を減らして見せる');
  assert.equal(S.expText(123456789, 2), '1.23E+08');
  assert.equal(S.expText(-0.00012, 1), '-1.2E-04');
  assert.equal(S.formatValue(1234.5, { num: 'number', dec: 2, sep: true }), '1,234.50');
  assert.equal(S.formatValue(-1234, { num: 'number', dec: 0, sep: true }), '-1,234');
  assert.equal(S.formatValue(1.005, { num: 'number', dec: 2 }), '1.01');
  assert.equal(S.formatValue(-0.001, { num: 'number', dec: 2 }), '0.00');
  assert.equal(S.formatValue(0.256, { num: 'percent', dec: 1 }), '25.6%');
  assert.equal(S.formatValue(46345, { num: 'date' }), '2026/11/19');
  assert.equal(S.formatValue(46345, { num: 'md' }), '11/19');
  assert.equal(S.formatValue(46345, { num: 'datejp' }), '2026年11月19日');
  assert.equal(S.formatValue(46345.5, { num: 'datetime' }), '2026/11/19 12:00');
  assert.equal(S.formatValue(true, null), 'TRUE');
  assert.equal(S.formatValue(S.ERR['#DIV/0!'], null), '#DIV/0!');
  assert.equal(S.formatValue(null, null), '');
  assert.equal(S.formatValue('文字', { num: 'percent' }), '文字');
  assert.equal(S.alignOf(5, null), 'right');
  assert.equal(S.alignOf('a', null), 'left');
  assert.equal(S.alignOf(true, null), 'center');
  assert.equal(S.alignOf(5, { align: 'center' }), 'center');
});

test('集計: 選んだ範囲の合計・平均・個数と、オートSUM の範囲、Ctrl+矢印の行き先', () => {
  const sh = make({ B1: '点', B2: '10', B3: '20', B4: 'x', B5: '30', C9: '1' });
  assert.deepEqual(sh.stats(R('B1:B5')), { sum: 60, nums: 3, count: 5, avg: 20 });
  assert.deepEqual(sh.stats(R('D1:D5')), { sum: 0, nums: 0, count: 0, avg: null });
  const a = make({ B1: '点', B2: '10', B3: '20', B4: '30', D1: '1', E1: '2' });
  assert.deepEqual(a.autoSumRange(4, 1), R('B2:B4'));
  assert.deepEqual(a.autoSumRange(0, 5), R('D1:E1'));
  assert.equal(a.autoSumRange(9, 9), null);
  assert.deepEqual(a.edge(1, 1, 1, 0), { r: 3, c: 1 }, '中身の続く端まで');
  assert.deepEqual(a.edge(3, 1, 1, 0), { r: 999, c: 1 }, '先に何もなければ表の端');
  assert.deepEqual(a.edge(0, 0, 0, 1), { r: 0, c: 1 }, '空からは次の中身へ');
  assert.deepEqual(a.usedRange(), R('A1:E4'));
});

test('並べ替えの準備: 中身の続くまとまりと、見出しの行の見分け', () => {
  const sh = make({ A4: '日付', B4: '金額', A5: '1', B5: '10', A6: '2', B6: '20', C7: 'x', A10: '合計' });
  assert.deepEqual(sh.region(4, 1), R('A4:C7'), '斜めにつながる所も含む');
  assert.deepEqual(sh.region(20, 20), R('U21'));
  assert.equal(sh.guessHeader(R('A4:B6')), true);
  assert.equal(sh.guessHeader(R('A5:B6')), false);
  sh.setMany([{ r: 7, c: 1, input: '=SUM(B5:B6)' }, { r: 8, c: 1, input: '25%' }]);
  assert.equal(sh.val('B8'), 30);
  assert.equal(sh.text('B9'), '25%');
});

test('元に戻す: 写しを取って戻す・やり直す', () => {
  const sh = make({ A1: '1', A2: '=A1+1' });
  const h = new S.History(3);
  h.push(sh.snapshot());
  sh.put('A1', '10');
  assert.equal(sh.val('A2'), 11);
  const before = h.undo(sh.snapshot());
  sh.restore(before);
  assert.equal(sh.val('A2'), 2);
  const after = h.redo(sh.snapshot());
  sh.restore(after);
  assert.equal(sh.val('A2'), 11);
  assert.equal(h.redo(sh.snapshot()), null);
  for (let i = 0; i < 5; i++) h.push(sh.snapshot());
  assert.equal(h.undoCount, 3, '数の上限を守る');
  h.discard();
  assert.equal(h.undoCount, 2, '何も変わらなかった操作の写しは捨てる');
});

/* ---------- 保存の形 ---------- */
test('保存: .fsheet の JSON に書いて読むと、中身・書式・幅・高さが同じになる', () => {
  const sh = make({ A1: 'おこづかい', B2: '1200', B3: '=B2*2', C1: '2026/11/19' });
  sh.setFormat(R('A1'), { b: true, color: '#241734', bg: '#fff6e3', align: 'center' });
  sh.setBorder(R('B2:B3'), 'all');
  sh.setWidth(0, 160);
  sh.setHeight(2, 36);
  const json = JSON.parse(JSON.stringify(sh.toJSON()));
  assert.equal(json.format, 'future-os-sheet');
  assert.equal(json.version, 1);
  assert.deepEqual(json.cells.B3, { v: '=B2*2', f: { bd: 'trbl' } });
  const r = S.fromJSON(json, { now: () => NOW });
  assert.equal(r.ok, true);
  assert.deepEqual(r.sheet.toJSON(), sh.toJSON());
  assert.equal(r.sheet.val('B3'), 2400);
  assert.equal(r.sheet.text('C1'), '2026/11/19');
  assert.equal(r.sheet.width(0), 160);
  assert.equal(r.sheet.height(2), 36);
});

test('保存: 壊れたファイルは理由を付けて断り、読めない書式は捨てて数える', () => {
  assert.equal(S.fromJSON(null).ok, false);
  assert.equal(S.fromJSON([]).ok, false);
  assert.match(S.fromJSON({ format: 'other', version: 1 }).error, /表計算/);
  assert.match(S.fromJSON({ format: 'future-os-sheet', version: 9 }).error, /新しい版/);
  assert.equal(S.fromJSON({ format: 'future-os-sheet', version: 1, rows: 5e6 }).ok, false);
  assert.match(S.fromJSON({ format: 'future-os-sheet', version: 1, cells: { 'ZZZZ1': { v: '1' } } }).error, /ZZZZ1/);
  assert.equal(S.fromJSON({ format: 'future-os-sheet', version: 1, cells: { A1: { v: 5 } } }).ok, false);
  assert.equal(S.fromJSON({ format: 'future-os-sheet', version: 1, cells: { A1: 'x' } }).ok, false);
  const r = S.fromJSON({ format: 'future-os-sheet', version: 1, cells: { A1: { v: '1', f: { color: 'red', b: true, align: 'up', zz: 1 } } }, colW: { A: 'wide', B: 120 } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.sheet.fmtAt('A1'), { b: true });
  assert.equal(r.warnings, 4);
  assert.equal(r.sheet.width(1), 120);
});

/* ---------- CSV ---------- */
test('CSV: RFC 4180 の引用符・二重の引用符・中の改行・CRLF を読む', () => {
  assert.deepEqual(S.parseCSV('a,b\r\n"c,d","e""f"\n"g\r\nh",i\r\n'), [['a', 'b'], ['c,d', 'e"f'], ['g\r\nh', 'i']]);
  assert.deepEqual(S.parseCSV('﻿1,,3\n\n""'), [['1', '', '3'], [''], ['']]);
  assert.deepEqual(S.parseCSV('x\ry'), [['x'], ['y']]);
  assert.deepEqual(S.parseCSV('a\tb', '\t'), [['a', 'b']]);
  assert.deepEqual(S.parseCSV(''), []);
});

test('CSV: 書き出しは必要な所だけ引用符で囲み、行は CRLF。読み戻すと同じ', () => {
  const rows = [['a', 'b,c'], ['x"y', 'line\nbreak'], ['', ' sp '], ['日本語', '=1+1']];
  const text = S.toCSV(rows);
  assert.equal(text, 'a,"b,c"\r\n"x""y","line\nbreak"\r\n," sp "\r\n日本語,=1+1\r\n');
  assert.deepEqual(S.parseCSV(text), rows);
});

test('CSV: 表を書き出して読み戻すと、値と表示が同じ（式は値になり、= の文字は文字のまま）', () => {
  const sh = make({ A1: '品物', B1: '値段', C1: '日付', A2: 'ノート, 青', B2: '120', C2: '2026/11/19', A3: '"特価"', B3: '=B2*0.5', C3: '=1/0', A4: 'TRUE', B4: '0.1', D5: "'=式ではない" });
  const text = sh.toCSV();
  assert.match(text, /^品物,値段,日付,\r\n"ノート, 青",120,2026\/11\/19,\r\n/, '使っている範囲の列の数をそろえる');
  const back = S.Sheet.fromCSV(text, { now: () => NOW });
  for (const a of ['A1', 'B1', 'A2', 'B2', 'C2', 'A3', 'B3', 'A4', 'B4', 'D5']) {
    assert.deepEqual(back.val(a), sh.val(a), a);
    assert.equal(back.text(a), sh.text(a), a);
  }
  assert.equal(back.text('C3'), '#DIV/0!');
  assert.equal(back.inputAt('D5'), "'=式ではない");
});
