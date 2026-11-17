// 文字の見本帳の計算（U+ の番号、UTF-8 のバイト、HTML の書き方、分類、検索）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../os/js/core/chars.mjs';

test('U+ の番号: 4けた以上の大文字の16進', () => {
  assert.equal(C.cpLabel(0x41), 'U+0041');
  assert.equal(C.cpLabel(0x2605), 'U+2605');
  assert.equal(C.cpLabel(0x1f600), 'U+1F600');
});

test('UTF-8 のバイト: 1〜4バイト', () => {
  assert.equal(C.utf8Hex('A'), '41');
  assert.equal(C.utf8Hex('é'), 'C3 A9');
  assert.equal(C.utf8Hex('★'), 'E2 98 85');
  assert.equal(C.utf8Hex('😀'), 'F0 9F 98 80');
});

test('HTML の書き方: 16進と10進の数値参照、名前があれば名前の参照', () => {
  assert.deepEqual(C.htmlRefs('★'), { hex: '&#x2605;', dec: '&#9733;', named: null });
  assert.deepEqual(C.htmlRefs('&'), { hex: '&#x26;', dec: '&#38;', named: '&amp;' });
  assert.equal(C.htmlRefs('→').named, '&rarr;');
  assert.equal(C.htmlRefs('α').named, '&alpha;');
});

test('分類: どれも空でなく、割り当てのない番号と制御文字を含まない', () => {
  assert.ok(C.CATEGORIES.length >= 10);
  for (const cat of C.CATEGORIES) {
    const list = C.charsOf(cat.id);
    assert.ok(list.length > 0, cat.id);
    assert.ok(list.every((ch) => !/^[\p{Cn}\p{Cc}]$/u.test(ch)), cat.id);
  }
  assert.ok(!C.charsOf('greek').includes(String.fromCodePoint(0x3a2))); // 0x3A2 は割り当てがない
  assert.equal(C.categoryOf(0x2192), 'arrows');
  assert.equal(C.categoryOf(0x41), null);
});

test('検索: U+番号・0x・16進だけ・文字そのもので番号を返す。読めなければ null', () => {
  assert.equal(C.parseQuery('U+2605'), 0x2605);
  assert.equal(C.parseQuery('u+2605'), 0x2605);
  assert.equal(C.parseQuery('0x2192'), 0x2192);
  assert.equal(C.parseQuery('2192'), 0x2192);
  assert.equal(C.parseQuery('★'), 0x2605);
  assert.equal(C.parseQuery(' ★ '), 0x2605);
  assert.equal(C.parseQuery('ほし'), null);
  assert.equal(C.parseQuery('U+110000'), null); // 範囲の外
});
