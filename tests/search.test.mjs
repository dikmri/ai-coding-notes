// 検索ロジックのテスト。実行: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../js/search.js');

const ENTRIES = [
  { id: 'fx-neon', t: 'ネオンサイン', y: 'ねおんさいん', c: 'effect', tags: ['光', 'text-shadow', 'アニメーション'], d: 'ちらつくネオン管の文字をCSSだけで作る。', code: 'text-shadow: 0 0 8px', lv: 1 },
  { id: 'mt-mandel', t: 'マンデルブロ集合', y: 'まんでるぶろしゅうごう', c: 'math', tags: ['フラクタル', 'canvas', 'mandelbrot'], d: 'クリックで拡大できるフラクタル。', code: 'getContext("2d")', lv: 2 },
  { id: 'sd-piano', t: '鍵盤ピアノ', y: 'けんばんぴあの', c: 'sound', tags: ['音', 'Web Audio', '楽器'], d: 'キーボードで弾けるピアノ。', code: 'new AudioContext()', lv: 2 },
  { id: 'mt-bar', t: '棒グラフ', y: 'ぼうぐらふ', c: 'math', tags: ['chart', 'svg'], d: 'SVGで描く棒グラフ。', code: '<rect>', lv: 1 },
  { id: 'fx-glass', t: 'すりガラス', y: 'すりがらす', c: 'effect', tags: ['backdrop-filter', 'ぼかし'], d: '背面をぼかす板。', code: 'backdrop-filter: blur(10px)', lv: 1 },
];
const CAT = { effect: '光と演出', math: '数理', sound: '音' };
const idx = S.createIndex(ENTRIES, { catLabel: (c) => CAT[c] });
const ids = (q, opts) => S.search(idx, q, opts).items.map((r) => r.entry.id);

test('normalize: 全角・半角カナ・カタカナをそろえる', () => {
  assert.equal(S.normalize('ＡＢＣ　１２３'), 'abc 123');
  assert.equal(S.normalize('カタカナ'), 'かたかな');
  assert.equal(S.normalize('ｶﾀｶﾅ'), 'かたかな');
  assert.equal(S.normalize('ヴァイオリン'), 'ゔぁいおりん');
});

test('romajiToHira: ヘボン式・訓令式・促音・撥音', () => {
  const cases = {
    sakura: 'さくら', kyouto: 'きょうと', gakkou: 'がっこう', shinbun: 'しんぶん',
    matcha: 'まっちゃ', konnichiha: 'こんにちは', konnnichiha: 'こんにちは', onna: 'おんな',
    "kin'en": 'きんえん', tokei: 'とけい', 'pa-thi-': 'ぱーてぃー', fairu: 'ふぁいる',
    ji: 'じ', zi: 'じ', jya: 'じゃ', ja: 'じゃ', konnyaku: 'こんにゃく', tsukue: 'つくえ',
  };
  for (const [r, h] of Object.entries(cases)) assert.equal(S.romajiToHira(r), h, r);
});

test('romajiQueryToKana: 入力途中の子音と末尾の n を扱う', () => {
  assert.deepEqual(S.romajiQueryToKana('tok'), ['と']);
  assert.ok(S.romajiQueryToKana('pian').includes('ぴあ'));
  assert.ok(S.romajiQueryToKana('pian').includes('ぴあん'));
  assert.deepEqual(S.romajiQueryToKana('canvas'), []);
  assert.deepEqual(S.romajiQueryToKana('k'), []);
});

test('parseQuery: 演算子を読み分ける', () => {
  const q = S.parseQuery('canvas -css tag:光 "完全 一致" canvas|svg lv:2');
  assert.equal(q.length, 6);
  assert.deepEqual(q[0], { field: null, neg: false, phrase: false, alts: ['canvas'] });
  assert.equal(q[1].neg, true);
  assert.deepEqual(q[1].alts, ['css']);
  assert.equal(q[2].field, 'tag');
  assert.deepEqual(q[2].alts, ['光']);
  assert.equal(q[3].phrase, true);
  assert.deepEqual(q[3].alts, ['完全 一致']);
  assert.deepEqual(q[4].alts, ['canvas', 'svg']);
  assert.equal(q[5].field, 'lv');
  assert.deepEqual(S.parseQuery('   '), []);
});

test('search: 空の検索語は全件を元の順で返す', () => {
  assert.deepEqual(ids(''), ENTRIES.map((e) => e.id));
});

test('search: 表記ゆれ（ローマ字・ひらがな・カタカナ・全角）で見つかる', () => {
  for (const q of ['neon', 'ねおん', 'ネオン', 'ｎｅｏｎ']) assert.equal(ids(q)[0], 'fx-neon', q);
  assert.equal(ids('manderu')[0], 'mt-mandel');
  assert.equal(ids('kenban')[0], 'sd-piano');
  assert.ok(ids('pian').includes('sd-piano'));
});

test('search: あいまい一致（飛び飛び・タイプミス）', () => {
  assert.ok(ids('まんぶろ').includes('mt-mandel'));
  assert.ok(ids('mandelbrto').includes('mt-mandel'));
});

test('search: 同義語で見つかる', () => {
  assert.equal(ids('グラフ')[0], 'mt-bar');
  assert.ok(ids('チャート').includes('mt-bar'));
});

test('search: 演算子（タグ・除外・AND・OR・コード・難易度・完全一致）', () => {
  assert.deepEqual(ids('tag:canvas'), ['mt-mandel']);
  assert.ok(!ids('-光').includes('fx-neon'));
  assert.equal(ids('-光').length, 4);
  assert.deepEqual(ids('ぼかし ガラス'), ['fx-glass']);
  assert.deepEqual(ids('canvas|svg').sort(), ['mt-bar', 'mt-mandel']);
  assert.deepEqual(ids('code:AudioContext'), ['sd-piano']);
  assert.deepEqual(ids('lv:2').sort(), ['mt-mandel', 'sd-piano']);
  assert.deepEqual(ids('"ネオンサイン"'), ['fx-neon']);
  assert.deepEqual(ids('cat:数理').sort(), ['mt-bar', 'mt-mandel']);
});

test('search: is: は呼び出し側の判定に任せる', () => {
  const r = ids('is:fav', { is: (name, e) => name === 'fav' && e.id === 'fx-glass' });
  assert.deepEqual(r, ['fx-glass']);
});

test('search: 文章で探すと単語に分けて探し直す', () => {
  const r = S.search(idx, '音を鳴らしたい');
  assert.ok(r.items.map((x) => x.entry.id).includes('sd-piano'));
  assert.ok(r.rewritten);
});

test('search: 文章検索で「した」などの添え言葉を拾わない', () => {
  const r = S.search(idx, '音を鳴らしたい');
  assert.ok(!/(^| )した( |$)/.test(r.rewritten), r.rewritten);
});

const idx2 = S.createIndex([
  { id: 'a', t: '花火', y: 'はなび', c: 'p', tags: ['粒子'], d: '夜空に打ち上がる。' },
  { id: 'b', t: 'カメラを映して撮る', y: 'かめらをうつしてとる', c: 'm', tags: ['撮影'], d: '写真を撮る。' },
  { id: 'c', t: '三目並べ', y: 'さんもくならべ', c: 'g', tags: ['AI'], d: '負けない。' },
  { id: 'd', t: '桜吹雪', y: 'さくらふぶき', c: 'p', tags: ['春'], d: '舞い散る。' },
]);
const ids2 = (q) => S.search(idx2, q).items.map((r) => r.entry.id);

test('search: 英語でも代表的な言葉は見つかる', () => {
  assert.deepEqual(ids2('fireworks'), ['a']);
});

test('search: カタカナを含む文章はカタカナのまま単語に分ける', () => {
  assert.equal(ids2('カメラで遊びたい')[0], 'b');
});

test('search: 文章検索では、より多くの言葉に当たる項目を上にする', () => {
  const idx3 = S.createIndex([
    { id: 'pad', t: 'ゲームコントローラーを読む', y: 'げーむこんとろーらーをよむ', c: 'api', tags: ['ゲーム', '入力'], d: 'ボタンを読む。' },
    { id: 'puz', t: '15パズル', y: 'じゅうごぱずる', c: 'game', tags: ['パズル', 'スライド'], d: '札を滑らせる。' },
  ], { catLabel: (c) => (c === 'game' ? 'ゲーム 遊戯' : 'ブラウザの機能') });
  assert.equal(S.search(idx3, 'パズルで遊びたい').items[0].entry.id, 'puz');
});

test('search: 広がりすぎた飛び飛び一致は拾わない', () => {
  assert.deepEqual(ids2('さくら'), ['d']);
});

test('search: 見つからないときは近い見出しを提案する', () => {
  const r = S.search(idx, 'すりがらすす');
  assert.equal(r.items.length, 0);
  assert.equal(r.suggest, 'すりガラス');
});

test('findRanges: カタカナの見出しにひらがなの検索語で印を付ける', () => {
  assert.deepEqual(S.findRanges('ネオンサイン', ['ねおん']), [[0, 3]]);
  assert.deepEqual(S.findRanges('すりガラスの板', ['がらす', '板']), [[2, 5], [6, 7]]);
});
