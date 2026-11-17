// AI アシスタントの計算（道具の一覧と引数、確かめが要る操作、窓の中の部品の一覧、歩く時間、秘密を伏せる）と、
// ガイドの台本（形の確かめ、進め方）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../os/js/core/agent.mjs';
import * as G from '../os/js/core/guide.mjs';

test('道具の一覧: 名前・説明・引数の形を持ち、名前は重ならない', () => {
  const names = A.TOOLS.map((t) => t.name);
  for (const n of ['get_desktop_state', 'open_app', 'manage_window', 'inspect_window', 'point_and_speak', 'click_element', 'input_text', 'press_keys', 'list_files', 'read_file', 'write_file', 'delete_file', 'open_file', 'open_url']) assert.ok(names.includes(n), n);
  assert.equal(new Set(names).size, names.length);
  for (const t of A.TOOLS) { assert.ok(t.description.length > 5, t.name); assert.equal(t.params.type, 'object', t.name); }
});

test('引数の確かめ: 知らない道具、足りない引数、型の違いを断る', () => {
  assert.deepEqual(A.validateArgs('open_app', { appId: 'notepad' }), { ok: true });
  assert.equal(A.validateArgs('nai', {}).ok, false);
  assert.match(A.validateArgs('open_app', {}).error, /appId/);
  assert.match(A.validateArgs('click_element', { windowId: 'w1', ref: 5 }).error, /ref/);
  assert.match(A.validateArgs('manage_window', { windowId: 'w1', action: 'explode' }).error, /action/);
});

test('確かめが要る操作: 消す・上書き・外の住所。ほかは要らない', () => {
  assert.equal(A.confirmNeeded('delete_file', { path: '/ドキュメント/a.txt' }).kind, 'delete');
  assert.match(A.confirmNeeded('delete_file', { path: '/ドキュメント/a.txt', permanent: true }).text, /元に戻せません/);
  assert.equal(A.confirmNeeded('write_file', { path: '/a.txt', content: 'x' }, { exists: true }).kind, 'overwrite');
  assert.equal(A.confirmNeeded('write_file', { path: '/a.txt', content: 'x' }, { exists: false }), null);
  const ext = A.confirmNeeded('open_url', { url: 'https://example.com/?q=秘密' });
  assert.equal(ext.kind, 'external'); assert.match(ext.text, /https:\/\/example\.com\/\?q=秘密/); // 住所を全部見せる
  assert.equal(A.confirmNeeded('open_url', { url: 'arcadia://start' }), null);
  assert.equal(A.confirmNeeded('open_url', { url: '/プロジェクト/a/index.html' }), null);
  assert.equal(A.confirmNeeded('click_element', { windowId: 'w', ref: 'r1' }), null);
});

test('部品の一覧の文: 参照番号・役割・名前・状態。秘密の欄は値を伏せる', () => {
  const text = A.formatSnapshot([
    { ref: 'r1', role: 'button', name: '保存(S)', disabled: true },
    { ref: 'r2', role: 'textbox', name: '住所', value: 'https://example.com/' },
    { ref: 'r3', role: 'textbox', name: 'API キー', value: 'sk-ant-abcdef123456', secret: true },
    { ref: 'r4', role: 'checkbox', name: '保存したら動かす', checked: true, depth: 1 },
    { ref: 'r5', role: 'text', name: 'あ'.repeat(300) },
  ]);
  assert.match(text, /\[r1\] ボタン「保存\(S\)」（押せない）/);
  assert.match(text, /\[r2\] 入力欄「住所」= "https:\/\/example\.com\/"/);
  assert.doesNotMatch(text, /sk-ant/);
  assert.match(text, /\[r3\] 入力欄「API キー」= （伏せてあります）/);
  assert.match(text, /\n  \[r4\] チェックボックス「保存したら動かす」（入）/);
  assert.ok(text.split('\n').every((l) => l.length < 220)); // 長い文は切る
});

test('歩く時間: 速さの設定と距離で決まり、上限と下限がある。瞬間は 0', () => {
  assert.equal(A.walkMs({ x: 0, y: 0 }, { x: 0, y: 0 }, 'normal'), 0);
  const near = A.walkMs({ x: 0, y: 0 }, { x: 60, y: 80 }, 'normal'), far = A.walkMs({ x: 0, y: 0 }, { x: 3000, y: 0 }, 'normal');
  assert.ok(near >= 250 && near < far && far <= 1600, `${near} ${far}`);
  assert.ok(A.walkMs({ x: 0, y: 0 }, { x: 3000, y: 0 }, 'fast') <= 500);
  assert.equal(A.walkMs({ x: 0, y: 0 }, { x: 3000, y: 0 }, 'instant'), 0);
});

test('秘密を伏せる: API キーらしい文字列を消す', () => {
  const s = A.maskSecrets('キーは sk-ant-api03-AbCdEf0123456789xyz と sk-proj-ABCDEFGHIJKLMNOPQRST と AIzaSyA1234567890abcdefghijklmnopqrstuv です');
  assert.doesNotMatch(s, /sk-ant-api03|sk-proj-|AIzaSy/);
  assert.match(s, /（伏せた文字）/);
  assert.equal(A.maskSecrets('普通の文 sky-blue と task-list'), '普通の文 sky-blue と task-list');
});

test('道具の説明の文: 吹き出しと記録に出す、何をするかの短い文', () => {
  assert.equal(A.describeCall('open_app', { appId: 'notepad' }, { appName: 'メモ帳' }), '「メモ帳」を開きます。');
  assert.equal(A.describeCall('delete_file', { path: '/a/b.txt' }), '「/a/b.txt」をゴミ箱へ移します。');
  assert.equal(A.describeCall('input_text', { windowId: 'w', ref: 'r2', value: 'こんにちは' }, { targetName: '本文' }), '「本文」に「こんにちは」と入れます。');
});

test('台本の形: 必要な欄と、目当て・待ち方・表情の値を確かめる', () => {
  const ok = { id: 'a', title: 'はじめての案内', steps: [{ id: 's1', say: 'こんにちは。', emotion: 'happy_1', waitFor: 'next' }, { id: 's2', say: 'ここがスタートボタンです。', target: { guideId: 'start-button' }, waitFor: 'target' }] };
  assert.deepEqual(G.validateScript(ok), []);
  const bad = G.validateScript({ id: 'b', steps: [{ id: 's1', waitFor: 'someday', target: { nothing: 1 }, emotion: 'dance' }] });
  assert.ok(bad.some((e) => /title/.test(e)) && bad.some((e) => /say/.test(e)) && bad.some((e) => /waitFor/.test(e)) && bad.some((e) => /target/.test(e)) && bad.some((e) => /emotion/.test(e)), bad.join(' / '));
});

test('台本の進め方: 次へ・戻る・終わり。最後の次は終わり', () => {
  const s = { id: 'a', title: 't', steps: [{ id: '1', say: 'a' }, { id: '2', say: 'b' }] };
  let r = G.start(s);
  assert.equal(G.current(s, r).id, '1');
  r = G.back(s, r); assert.equal(r.i, 0);
  r = G.next(s, r); assert.equal(G.current(s, r).id, '2');
  r = G.next(s, r); assert.equal(r.done, true); assert.equal(G.current(s, r), null);
  assert.equal(G.progress(s, G.start(s)), '1 / 2');
});

// 位置の計算（画面 1280×800、イコちゃんは 96×96）
const VIEW = { w: 1280, h: 800 };
const R = (left, top, width, height) => ({ left, top, width, height });
const hit = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

test('指す範囲: ふつうの部品はそのまま。画面の半分より大きい入れ物は、中の部品をまとめた範囲', () => {
  assert.deepEqual(A.pointRect(R(10, 20, 100, 30), [], VIEW), R(10, 20, 100, 30));
  // デスクトップ全体に広がるアイコンの並び → 左の列のアイコンだけを囲む
  assert.deepEqual(A.pointRect(R(80, 0, 1200, 800), [R(100, 10, 90, 70), R(100, 90, 90, 70), R(0, 0, 0, 0)], VIEW), R(100, 10, 90, 150));
  // 中に部品のない大きな部品（最大化したメモ帳の本文など）は、そのまま
  assert.deepEqual(A.pointRect(R(80, 40, 1200, 700), [], VIEW), R(80, 40, 1200, 700));
});

test('立つ場所: 部品の左に立って右を向く。左に場所がなければ右に立って左を向く。両側にないときは部品の上に立つ', () => {
  assert.deepEqual(A.standSpot(R(500, 300, 80, 40), VIEW, 96), { x: 398, y: 267, face: 1 });
  assert.deepEqual(A.standSpot(R(16, 40, 60, 60), VIEW, 96), { x: 82, y: 17, face: -1 });
  const wide = A.standSpot(R(60, 40, 1200, 700), VIEW, 96);
  assert.equal(wide.face, 1);
  assert.ok(wide.x >= 60 && wide.x + 96 <= 1260, JSON.stringify(wide));
  // 画面の下の端では、はみ出さない
  assert.equal(A.standSpot(R(500, 780, 80, 20), VIEW, 96).y, 800 - 96 - 4);
});

test('吹き出しの場所: 上 → 下 → 横の順に、イコちゃん・止めるボタン・指している部品と重ならない所を選ぶ', () => {
  const size = { w: 340, h: 100 };
  // 広い所では、イコちゃんの真上
  assert.deepEqual(A.bubbleSpot({ char: R(600, 400, 96, 96), size, avoid: [], view: VIEW }), { x: 478, y: 292 });
  // 画面の上の端（スタートボタンの横）: 上は入らないので、止めるボタンも含めたイコちゃんの下
  const top = A.bubbleSpot({ char: R(82, 17, 96, 126), size, avoid: [R(12, 36, 68, 68)], view: VIEW });
  assert.ok(top.y >= 17 + 126, JSON.stringify(top));
  // メモ帳の本文の左に立つとき: 本文に重ならない場所（左上へ伸ばす）
  const text = R(402, 250, 500, 350), char = R(300, 300, 96, 96);
  const s = A.bubbleSpot({ char, size, avoid: [text], view: VIEW });
  const b = R(s.x, s.y, size.w, size.h);
  assert.equal(hit(b, text), false, JSON.stringify(s));
  assert.equal(hit(b, char), false, JSON.stringify(s));
  // どこも重なるときも、画面の中には収まる
  const all = A.bubbleSpot({ char: R(0, 0, 96, 96), size, avoid: [R(0, 0, 1280, 800)], view: VIEW });
  assert.ok(all.x >= 4 && all.y >= 4 && all.x + 340 <= 1276 && all.y + 100 <= 796, JSON.stringify(all));
});

test('ガイドの台本: assistant/guides の台本は、どれも形の確かめを通る', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../os/js/assistant/guides/', import.meta.url);
  const files = readdirSync(dir).filter((n) => n.endsWith('.json'));
  assert.ok(files.length >= 1);
  for (const f of files) assert.deepEqual(G.validateScript(JSON.parse(readFileSync(new URL(f, dir), 'utf8'))), [], f);
});

test('吹き出しの場所: イコちゃんの横に入る幅がないときは、指している部品の上か下へ回す', () => {
  // 画面 1366×820。メモ帳の本文（強調の枠の分だけ広げた四角）の左に、イコちゃん（止めるボタンを含む）が立つ
  const view = { w: 1366, h: 820 }, size = { w: 360, h: 103 };
  const text = R(242, 131, 596, 337), char = R(148, 246, 96, 124);
  const s = A.bubbleSpot({ char, size, avoid: [text], view });
  const b = R(s.x, s.y, size.w, size.h);
  assert.equal(hit(b, text), false, JSON.stringify(s));
  assert.equal(hit(b, char), false, JSON.stringify(s));
});
