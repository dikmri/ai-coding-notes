// Gemini API の道具の中核（金額の計算・依頼の組み立て・使った金額の記録）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../tools/lib/gemini-core.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('ファイルの種類: 拡張子から MIME と、画像・音声・動画の別を決める', () => {
  assert.equal(G.mimeFor('a/b/shot.PNG'), 'image/png');
  assert.equal(G.mimeFor('x.jpg'), 'image/jpeg');
  assert.equal(G.mimeFor('song.wav'), 'audio/wav');
  assert.equal(G.mimeFor('boot.webm'), 'video/webm');
  assert.equal(G.mimeFor('clip.mp4'), 'video/mp4');
  assert.equal(G.mimeFor('謎.xyz'), null);
  assert.equal(G.kindFor('image/png'), 'image');
  assert.equal(G.kindFor('audio/wav'), 'audio');
  assert.equal(G.kindFor('video/webm'), 'video');
  assert.equal(G.isYouTube('https://www.youtube.com/watch?v=9hE5-98ZeCg'), true);
  assert.equal(G.isYouTube('https://youtu.be/9hE5-98ZeCg'), true);
  assert.equal(G.isYouTube('https://example.com/a.mp4'), false);
});

test('料金: モデルと日付で単価が変わる（Argon は 12月1日から2倍）', () => {
  assert.deepEqual(G.priceFor('gemini-4-argon', '2026-11-30'), { input: 2, output: 10, cache: 0.1 });
  assert.deepEqual(G.priceFor('gemini-4-argon', '2026-12-01'), { input: 4, output: 20, cache: 0.2 });
  assert.deepEqual(G.priceFor('gemini-4-hydrogen', '2027-03-01'), { input: 1.5, output: 7.5, cache: 0.075 });
  assert.deepEqual(G.priceFor('gemini-3.8-flash', '2027-01-01'), { input: 1.5, output: 7.5, cache: 0.15 });
  assert.equal(G.priceFor('知らないモデル', '2026-11-17'), null);
});

test('金額の見積もり: 出力には考える過程の分も入る。キャッシュは安い単価', () => {
  const usage = { total_input_tokens: 1_000_000, total_cached_tokens: 200_000, total_output_tokens: 10_000, total_thought_tokens: 90_000, total_tool_use_tokens: 0 };
  // 入力 80万×2 + キャッシュ 20万×0.1 + 出力 10万×10 = 1.6 + 0.02 + 1.0
  assert.ok(near(G.costOf(usage, 'gemini-4-argon', '2026-11-17'), 2.62));
  assert.equal(G.costOf(usage, '知らないモデル', '2026-11-17'), null);
});

test('依頼の組み立て: 文章、ファイルのデータ、YouTube の URL を順に並べる', () => {
  const input = G.buildInput('見てください', [
    { kind: 'image', mime: 'image/png', data: 'QUJD' },
    { kind: 'video', uri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg' },
    { kind: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc', mime: 'video/webm' },
  ]);
  assert.deepEqual(input, [
    { type: 'text', text: '見てください' },
    { type: 'image', data: 'QUJD', mime_type: 'image/png' },
    { type: 'video', uri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg' },
    { type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc', mime_type: 'video/webm' },
  ]);
});

test('返事の取り出し: 考える過程は除き、model_output の文章だけをつなぐ', () => {
  const res = { steps: [{ type: 'thought', signature: 'x' }, { type: 'model_output', content: [{ type: 'text', text: '2' }, { type: 'text', text: 'です。' }] }] };
  assert.equal(G.extractText(res), '2です。');
  assert.equal(G.extractText({}), '');
});

test('使った金額の記録: 無料の枠は予算から引かず、有料だけを合計する', () => {
  let led = G.emptyLedger(20);
  led = G.ledgerAdd(led, { ts: '2026-11-17T00:00:00Z', model: 'gemini-4-hydrogen', tier: 'free', usd: 0.5 });
  led = G.ledgerAdd(led, { ts: '2026-11-17T01:00:00Z', model: 'gemini-4-argon', tier: 'paid', usd: 1.25 });
  assert.equal(led.entries.length, 2);
  assert.ok(near(led.spentUsd, 1.25));
  assert.ok(near(led.freeEquivalentUsd, 0.5));
  assert.ok(near(G.remaining(led), 18.75));
});

test('料金: 画像を作るモデル（Nano Banana 2.1）は出力の単価が高い', () => {
  assert.deepEqual(G.priceFor('gemini-nano-banana-2.1', '2026-11-17'), { input: 1.5, output: 30, cache: 0.15 });
  // 1K の画像1枚は出力 1120 トークン前後 → 約 0.0336 ドル
  assert.ok(near(G.costOf({ total_input_tokens: 0, total_output_tokens: 1120 }, 'gemini-nano-banana-2.1', '2026-11-17'), 0.0336, 1e-6));
});

test('画像の取り出し: model_output の画像だけを、MIME つきで返す', () => {
  const res = { steps: [
    { type: 'thought' },
    { type: 'model_output', content: [{ type: 'text', text: 'できました' }, { type: 'image', data: 'iVBO', mime_type: 'image/png' }] },
    { type: 'model_output', content: [{ type: 'image', data: '/9j/' }] },
  ] };
  assert.deepEqual(G.extractImages(res), [{ data: 'iVBO', mime: 'image/png' }, { data: '/9j/', mime: 'image/jpeg' }]);
  assert.deepEqual(G.extractImages({}), []);
});

test('JSON の取り出し: 囲みの記号があっても中身を読む。読めなければ null', () => {
  assert.deepEqual(G.parseJson('{"verdict":"approve"}'), { verdict: 'approve' });
  assert.deepEqual(G.parseJson('```json\n{"a":[1,2]}\n```'), { a: [1, 2] });
  assert.equal(G.parseJson('JSON ではない'), null);
});

test('予算の歯止め: 残りが無いか、その日の上限を超えたら呼ばない', () => {
  let led = G.emptyLedger(20);
  led = G.ledgerAdd(led, { ts: '2026-11-17T01:00:00Z', day: '2026-11-17', tier: 'paid', usd: 1.5 });
  led = G.ledgerAdd(led, { ts: '2026-11-16T01:00:00Z', day: '2026-11-16', tier: 'paid', usd: 9 });
  led = G.ledgerAdd(led, { ts: '2026-11-17T02:00:00Z', day: '2026-11-17', tier: 'free', usd: 5 });
  assert.ok(near(G.spentOn(led, '2026-11-17'), 1.5));
  assert.deepEqual(G.budgetCheck(led, { tier: 'paid', dailyCapUsd: 2, day: '2026-11-17' }), { ok: true });
  assert.equal(G.budgetCheck(led, { tier: 'paid', dailyCapUsd: 1.5, day: '2026-11-17' }).ok, false);
  const used = G.ledgerAdd(led, { day: '2026-11-18', tier: 'paid', usd: 9.5 });
  const r = G.budgetCheck(used, { tier: 'paid', dailyCapUsd: 50, day: '2026-11-18' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /予算/);
  // 無料の枠は歯止めの対象にしない
  assert.deepEqual(G.budgetCheck(used, { tier: 'free', dailyCapUsd: 0, day: '2026-11-18' }), { ok: true });
});

test('日付: 記録の日付は日本時間で数える', () => {
  assert.equal(G.localDay('2026-11-16T20:07:30Z', 540), '2026-11-17');
  assert.equal(G.localDay('2026-11-16T14:59:59Z', 540), '2026-11-16');
});
