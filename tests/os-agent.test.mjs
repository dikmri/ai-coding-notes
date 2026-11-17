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
