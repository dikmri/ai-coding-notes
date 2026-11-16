// ドット絵の道具の中核（Gemini が返した色の並びを確かめ、SVG にする）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../tools/lib/pixel.mjs';

const art = (rows, palette = [{ key: 'k', color: '#000000' }, { key: 'w', color: '#FFFFFF' }]) => ({ palette, rows });

test('色の書き方をそろえる: #RGB も #RRGGBB も小文字の #rrggbb にする。読めなければ null', () => {
  assert.equal(P.normalizeHex('#F00'), '#ff0000');
  assert.equal(P.normalizeHex('#00FF00'), '#00ff00');
  assert.equal(P.normalizeHex('red'), null);
});

test('Windows の16色: いちばん近い色にそろえる', () => {
  assert.equal(P.WIN16.length, 16);
  assert.equal(P.nearest('#fe0102', P.WIN16), '#ff0000');
  assert.equal(P.nearest('#7f7f80', P.WIN16), '#808080');
});

test('検査: 行の数と行の長さが大きさに合わなければ誤り', () => {
  const r = P.validateArt(art(['kw', 'wk', 'kk']), { size: 2 });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /行の数/);
  const r2 = P.validateArt(art(['kw', 'w']), { size: 2 });
  assert.equal(r2.ok, false);
  assert.match(r2.errors.join(), /2 行目/);
});

test('検査: 色の表に無い文字と、17色以上は誤り。「.」は透明', () => {
  assert.equal(P.validateArt(art(['k.', 'zw']), { size: 2 }).ok, false);
  const many = Array.from({ length: 17 }, (_, i) => ({ key: String.fromCharCode(65 + i), color: '#000000' }));
  assert.equal(P.validateArt(art(['AB', 'CD'], many), { size: 2 }).ok, false);
  assert.equal(P.validateArt(art(['k.', '.w']), { size: 2 }).ok, true);
});

test('検査: win16 のときは16色以外の色を近い色にそろえ、そろえた色を返す', () => {
  const r = P.validateArt(art(['ab', 'ba'], [{ key: 'a', color: '#fe0000' }, { key: 'b', color: '#c0c0c0' }]), { size: 2, win16: true });
  assert.equal(r.ok, true);
  assert.equal(r.art.palette.find((p) => p.key === 'a').color, '#ff0000');
  assert.deepEqual(r.snapped, [{ key: 'a', from: '#fe0000', to: '#ff0000' }]);
});

test('SVG: 横に続く同じ色をまとめ、色ごとに path を1本にする。透明は描かない', () => {
  const svg = P.toSvg(art(['kkw.', '..ww']), 4);
  assert.equal(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2" viewBox="0 0 4 2" shape-rendering="crispEdges">'
    + '<path fill="#000" d="M0 0h2v1h-2z"/>'
    + '<path fill="#fff" d="M2 0h1v1h-1zM2 1h2v1h-2z"/></svg>');
});
