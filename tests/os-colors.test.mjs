// 色の計算（HEX・rgb・hsl の変換、WCAG の見やすさの比、いちばん近い ARCADIA の色）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../os/js/core/colors.mjs';

test('HEX: 3けた・6けた・# なしを読み、読めないものは null', () => {
  assert.deepEqual(K.parseHex('#ABC'), { r: 170, g: 187, b: 204 });
  assert.deepEqual(K.parseHex('6bf2e3'), { r: 107, g: 242, b: 227 });
  assert.equal(K.parseHex('#12345'), null);
  assert.equal(K.parseHex('red'), null);
  assert.equal(K.toHex({ r: 36, g: 23, b: 52 }), '#241734');
});

test('hsl: 色相・彩度・明度（整数に丸める）と、CSS の書き方', () => {
  assert.deepEqual(K.rgbToHsl({ r: 255, g: 0, b: 0 }), { h: 0, s: 100, l: 50 });
  assert.deepEqual(K.rgbToHsl({ r: 128, g: 128, b: 128 }), { h: 0, s: 0, l: 50 });
  assert.deepEqual(K.rgbToHsl({ r: 207, g: 174, b: 255 }), { h: 264, s: 100, l: 84 });
  assert.deepEqual(K.formats('#cfaeff'), { hex: '#cfaeff', rgb: 'rgb(207, 174, 255)', hsl: 'hsl(264, 100%, 84%)' });
});

test('見やすさの比: WCAG の計算。濃い紫と真珠白は 16.57、黒と白は 21', () => {
  assert.equal(K.contrast('#000000', '#ffffff'), 21);
  assert.equal(K.contrast('#241734', '#fffdf9'), 16.57);
  assert.equal(K.contrast('#fffdf9', '#241734'), 16.57); // 順番によらない
  assert.equal(K.contrast('#777777', '#ffffff'), 4.48);
});

test('見やすさの目安: 7 以上は AAA、4.5 以上は AA、3 以上は大きい文字だけ、それ未満は不可', () => {
  assert.equal(K.grade(16.57), 'AAA');
  assert.equal(K.grade(4.5), 'AA');
  assert.equal(K.grade(4.48), 'AA（大きい文字）');
  assert.equal(K.grade(2.08), '不可');
});

test('いちばん近い ARCADIA の色: 同じ色ならその色、近い色ならそれを返す', () => {
  assert.equal(K.nearest('#6bf2e3').hex, '#6bf2e3');
  assert.equal(K.nearest('#6af0e0').hex, '#6bf2e3');
  assert.equal(K.nearest('#000000').hex, '#140c24');
  assert.equal(K.ARCADIA.length, 16);
  assert.ok(K.ARCADIA.every((c) => /^#[0-9a-f]{6}$/.test(c.hex) && c.name && c.role));
});
