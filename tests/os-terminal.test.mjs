// 端末の計算（字句の分け方、パスの解決、補完、コマンドの実行）のテスト。仮想ドライブはメモリの上の代わりのものに差し替える
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../os/js/core/terminal.mjs';

// メモリの上の仮想ドライブ（fs.mjs と同じ形の関数だけ）
function memfs(files) {
  const m = new Map([['/', { kind: 'dir' }]]);
  const parent = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
  const addDirs = (p) => { for (let d = parent(p); d !== '/'; d = parent(d)) if (!m.has(d)) m.set(d, { kind: 'dir', mtime: 0 }); };
  for (const [p, v] of Object.entries(files)) { m.set(p, v === null ? { kind: 'dir', mtime: 0 } : { kind: 'file', text: v, mtime: 0 }); addDirs(p); }
  const meta = (p) => { const r = m.get(p); return r && { path: p, name: p.split('/').pop(), kind: r.kind, size: r.kind === 'file' ? new TextEncoder().encode(r.text).length : 0, mtime: r.mtime }; };
  const TRASH = '/ゴミ箱';
  return {
    TRASH, map: m,
    stat: async (p) => (p === '/' ? { path: '/', name: '', kind: 'dir', size: 0 } : meta(p) || null),
    list: async (d) => [...m.keys()].filter((p) => p !== '/' && parent(p) === d).map(meta).sort((a, b) => (a.kind === b.kind ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.kind === 'dir' ? -1 : 1)),
    walk: async (d) => [...m.keys()].filter((p) => p !== '/' && (d === '/' || p.startsWith(d + '/'))),
    readText: async (p) => { const r = m.get(p); if (!r || r.kind !== 'file') throw new Error(`「${p}」が見つかりません。`); return r.text; },
    write: async (p, t) => { m.set(p, { kind: 'file', text: String(t), mtime: 1 }); addDirs(p); return p; },
    mkdir: async (p) => { m.set(p, { kind: 'dir', mtime: 1 }); addDirs(p); },
    move: async (a, b) => { for (const k of [...m.keys()]) if (k === a || k.startsWith(a + '/')) { m.set(b + k.slice(a.length), m.get(k)); m.delete(k); } return b; },
    copy: async (a, b) => { for (const k of [...m.keys()]) if (k === a || k.startsWith(a + '/')) m.set(b + k.slice(a.length), { ...m.get(k) }); return b; },
    trash: async (p) => { const to = TRASH + '/' + p.split('/').pop(); if (!m.has(TRASH)) m.set(TRASH, { kind: 'dir' }); for (const k of [...m.keys()]) if (k === p || k.startsWith(p + '/')) { m.set(to + k.slice(p.length), m.get(k)); m.delete(k); } return to; },
  };
}
const text = (r) => r.lines.map((l) => l.map((s) => s.t).join('')).join('\n');
function env(files = {}, extra = {}) {
  const fs = memfs({ '/ドキュメント/はじめに.txt': 'ようこそ\n2行目', '/画像/海.png': 'x', '/音楽': null, ...files });
  const opened = [], launched = [];
  return { cwd: '/', fs, opened, launched, open: async (p) => opened.push(p), launch: async (a) => launched.push(a), apps: { notepad: 'メモ帳', calc: '電卓' }, evaluate: (s) => (s === '1+2' ? { ok: true, value: 3 } : { ok: false, error: 'syntax' }), now: () => new Date(2026, 10, 17, 9, 5, 7), history: ['ls', 'cd 画像'], ...extra };
}

test('字句: 空白で分け、引用符の中の空白は残す。> と >> は書き出しの先', () => {
  assert.deepEqual(T.tokenize('ls  -l   /画像'), { args: ['ls', '-l', '/画像'], redirect: null });
  assert.deepEqual(T.tokenize('cat "新しい フォルダ/a.txt"'), { args: ['cat', '新しい フォルダ/a.txt'], redirect: null });
  assert.deepEqual(T.tokenize("echo 'a b' c > メモ.txt"), { args: ['echo', 'a b', 'c'], redirect: { mode: '>', path: 'メモ.txt' } });
  assert.deepEqual(T.tokenize('echo hi>>log.txt'), { args: ['echo', 'hi'], redirect: { mode: '>>', path: 'log.txt' } });
  assert.deepEqual(T.tokenize('echo "閉じていない'), { error: '引用符が閉じていません。' });
  assert.deepEqual(T.tokenize('echo a >'), { error: '書き出す先のファイル名がありません。' });
});

test('パス: 今のフォルダからの相対、..、~、/ からの絶対', () => {
  assert.equal(T.resolvePath('/ドキュメント', 'a.txt'), '/ドキュメント/a.txt');
  assert.equal(T.resolvePath('/ドキュメント', '../画像'), '/画像');
  assert.equal(T.resolvePath('/ドキュメント', '~'), '/');
  assert.equal(T.resolvePath('/ドキュメント', '/音楽/./x.wav'), '/音楽/x.wav');
  assert.equal(T.resolvePath('/', '..'), '/');
});

test('補完: 1つに決まれば決まった名前、いくつかあれば共通の頭と候補', () => {
  assert.deepEqual(T.completeWord('ca', ['cat', 'calc', 'cd']), { text: 'ca', options: ['calc', 'cat'] });
  assert.deepEqual(T.completeWord('cat', ['cat', 'calc']), { text: 'cat', options: [] });
  assert.deepEqual(T.completeWord('ドキ', ['ドキュメント/', '画像/']), { text: 'ドキュメント/', options: [] });
  assert.deepEqual(T.completeWord('x', ['a', 'b']), { text: 'x', options: [] });
});

test('glob: * と ? を使えて、大文字と小文字を区別しない', () => {
  assert.ok(T.globToRegExp('*.TXT').test('はじめに.txt'));
  assert.ok(T.globToRegExp('海.p?g').test('海.png'));
  assert.ok(!T.globToRegExp('*.png').test('a.png.txt'));
});

test('cd・pwd・ls: フォルダは / 付きで、押せるパスとして返す', async () => {
  const e = env();
  let r = await T.run('cd ドキュメント', e);
  assert.equal(r.cwd, '/ドキュメント');
  r = await T.run('pwd', { ...e, cwd: r.cwd });
  assert.equal(text(r), '/ドキュメント');
  r = await T.run('ls /', e);
  assert.equal(text(r), 'ドキュメント/\n画像/\n音楽/'); // 並びは仮想ドライブの list の順のまま
  const seg = r.lines[0][0];
  assert.deepEqual([seg.path, seg.dir], ['/ドキュメント', true]);
  r = await T.run('cd ない', e);
  assert.match(text(r), /フォルダがありません/);
  assert.equal(r.cwd, '/');
});

test('echo と > >> で書き出し、cat で読む', async () => {
  const e = env();
  await T.run('echo こんにちは > /ドキュメント/メモ.txt', e);
  await T.run('echo 2行目 >> /ドキュメント/メモ.txt', e);
  const r = await T.run('cat ドキュメント/メモ.txt', e);
  assert.equal(text(r), 'こんにちは\n2行目');
  assert.equal(text(await T.run('ls >> /ドキュメント/一覧.txt', e)), '');
  assert.match(await e.fs.readText('/ドキュメント/一覧.txt'), /ドキュメント\//);
});

test('mkdir・touch・mv・cp・rm（rm はゴミ箱へ）', async () => {
  const e = env();
  await T.run('mkdir 作業', e);
  await T.run('touch 作業/a.txt', e);
  assert.equal((await e.fs.stat('/作業/a.txt')).kind, 'file');
  await T.run('cp 作業/a.txt 作業/b.txt', e);
  await T.run('mv 作業/b.txt /ドキュメント', e); // フォルダへ動かすと、その中へ
  assert.ok(await e.fs.stat('/ドキュメント/b.txt'));
  const r = await T.run('rm 作業', e);
  assert.match(text(r), /ゴミ箱へ移しました/);
  assert.ok(await e.fs.stat('/ゴミ箱/作業/a.txt'));
  assert.match(text(await T.run('rm /', e)), /消せません/);
  assert.match(text(await T.run('rm ない.txt', e)), /ありません/);
});

test('find・tree: 名前で探し、木の形で並べる', async () => {
  const e = env();
  assert.equal(text(await T.run('find / *.png', e)), '/画像/海.png');
  assert.equal(text(await T.run('find はじめ', e)), '/ドキュメント/はじめに.txt');
  assert.equal(text(await T.run('tree /ドキュメント', e)), '/ドキュメント\n└─ はじめに.txt');
});

test('open・run・date・calc・history・clear・help と、知らないコマンド', async () => {
  const e = env();
  await T.run('open 画像/海.png', e);
  assert.deepEqual(e.opened, ['/画像/海.png']);
  await T.run('run 電卓', e);
  await T.run('run notepad', e);
  assert.deepEqual(e.launched, ['calc', 'notepad']);
  assert.match(text(await T.run('run', e)), /calc\s+電卓/);
  assert.equal(text(await T.run('date', e)), '2026年11月17日（火） 09:05:07');
  assert.equal(text(await T.run('calc 1+2', e)), '3');
  assert.match(text(await T.run('calc 1+', e)), /計算できません/);
  assert.equal(text(await T.run('history', e)), '1  ls\n2  cd 画像');
  assert.equal((await T.run('clear', e)).clear, true);
  assert.match(text(await T.run('help', e)), /ls/);
  const r = await T.run('foo', e);
  assert.match(text(r), /そのコマンドはありません: foo/);
  assert.ok(r.lines[0][0].err);
  assert.equal(text(await T.run('   ', e)), '');
});

test('補完の位置: 最初の言葉ならコマンド、それより後ならパス', () => {
  assert.deepEqual(T.wordAt('ca'), { word: 'ca', start: 0, isCommand: true });
  assert.deepEqual(T.wordAt('  ls'), { word: 'ls', start: 2, isCommand: true });
  assert.deepEqual(T.wordAt('cd ドキ'), { word: 'ドキ', start: 3, isCommand: false });
  assert.deepEqual(T.wordAt('cat '), { word: '', start: 4, isCommand: false });
});

test('ls と tree: 場所を書かないときは今のフォルダ（cd だけは一番上へ戻る）', async () => {
  const e = env({}, { cwd: '/ドキュメント' });
  assert.equal(text(await T.run('ls', e)), 'はじめに.txt');
  assert.equal(text(await T.run('ls -l', e)).includes('はじめに.txt'), true);
  assert.equal(text(await T.run('tree', e)), '/ドキュメント\n└─ はじめに.txt');
  assert.equal((await T.run('cd', e)).cwd, '/');
});
