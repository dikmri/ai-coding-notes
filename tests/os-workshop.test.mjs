// コードの作業場の計算（プロジェクトの中の住所、import の書き換え、色分けの字句、プレビューの文書、ZIP）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../os/js/core/workshop.mjs';

test('住所: プロジェクトの中で相対の住所を解き、外へ出るものは null', () => {
  const root = '/プロジェクト/光';
  assert.equal(W.resolveIn(root, '/プロジェクト/光/js/main.mjs', './util.mjs'), '/プロジェクト/光/js/util.mjs');
  assert.equal(W.resolveIn(root, '/プロジェクト/光/js/main.mjs', '../style.css'), '/プロジェクト/光/style.css');
  assert.equal(W.resolveIn(root, '/プロジェクト/光/index.html', '/img/a.png'), '/プロジェクト/光/img/a.png'); // / はプロジェクトの根
  assert.equal(W.resolveIn(root, '/プロジェクト/光/index.html', 'img/a%20b.png?x#y'), '/プロジェクト/光/img/a b.png');
  assert.equal(W.resolveIn(root, '/プロジェクト/光/index.html', '../../ネット/履歴.json'), null);
  assert.equal(W.resolveIn(root, '/プロジェクト/光/index.html', 'https://example.com/a.js'), null); // 外の住所はそのまま（解かない）
  assert.equal(W.resolveIn(root, '/プロジェクト/光/index.html', 'data:image/png;base64,xx'), null);
});

test('import の書き換え: 相対の住所を vfs:/// にし、依存を集める。文字列やコメントの中は触らない', () => {
  const src = [
    "import { a } from './a.mjs';",
    "import './side.mjs';",
    "export { b } from \"../lib/b.mjs\";",
    "const m = await import('./lazy.mjs');",
    "const s = \"import './no.mjs'\"; // import './no2.mjs'",
    "/* import x from './no3.mjs' */",
    "import ext from 'https://cdn.example/x.mjs';",
    "const arr = Array.from('abc');",
  ].join('\n');
  const r = W.rewriteImports(src, '/p/js/main.mjs', '/p');
  assert.match(r.code, /from 'vfs:\/\/\/p\/js\/a\.mjs'/);
  assert.match(r.code, /import 'vfs:\/\/\/p\/js\/side\.mjs'/);
  assert.match(r.code, /from "vfs:\/\/\/p\/lib\/b\.mjs"/);
  assert.match(r.code, /import\('vfs:\/\/\/p\/js\/lazy\.mjs'\)/);
  assert.match(r.code, /"import '\.\/no\.mjs'"/);
  assert.match(r.code, /\/\/ import '\.\/no2\.mjs'/);
  assert.match(r.code, /'\.\/no3\.mjs'/);
  assert.match(r.code, /'https:\/\/cdn\.example\/x\.mjs'/);
  assert.match(r.code, /Array\.from\('abc'\)/);
  assert.deepEqual(r.deps.sort(), ['/p/js/a.mjs', '/p/js/lazy.mjs', '/p/js/side.mjs', '/p/lib/b.mjs']);
});

test('色分け: JavaScript の字句（キーワード・文字列・テンプレート・コメント・数・正規表現）', () => {
  const src = 'const x = `a${1}` + "s" /* c */ + 0x1f; // e\nlet r = /a\\/b/g;';
  const kinds = W.tokenize(src, 'js').map((t) => `${t.type}:${src.slice(t.start, t.end)}`);
  for (const k of ['keyword:const', 'string:`a${1}`', 'string:"s"', 'comment:/* c */', 'number:0x1f', 'comment:// e', 'keyword:let', 'regexp:/a\\/b/g']) assert.ok(kinds.includes(k), k + ' が見つからない: ' + kinds.join(' | '));
});

test('色分け: CSS と HTML（中の style と script も）', () => {
  const css = '.a { color: #fff; /* c */ width: 10px; }';
  const ck = W.tokenize(css, 'css').map((t) => `${t.type}:${css.slice(t.start, t.end)}`);
  for (const k of ['selector:.a', 'property:color', 'number:#fff', 'comment:/* c */', 'number:10px']) assert.ok(ck.includes(k), k + ': ' + ck.join(' | '));
  const html = '<!-- c --><p class="x">t</p><style>b{}</style><script>let a="s"</script>';
  const hk = W.tokenize(html, 'html').map((t) => `${t.type}:${html.slice(t.start, t.end)}`);
  for (const k of ['comment:<!-- c -->', 'tag:<p', 'attr:class', 'string:"x"', 'selector:b', 'keyword:let', 'string:"s"']) assert.ok(hk.includes(k), k + ': ' + hk.join(' | '));
});

test('プレビューの文書: CSS を入れ込み、モジュールを import map と Data URL にし、画像を Data URL にする', () => {
  const files = {
    '/p/index.html': { text: '<!doctype html><html><head><link rel="stylesheet" href="style.css"><script type="module" src="js/main.mjs"></script></head><body><img src="img/a.png" alt="a"><script src="classic.js"></script></body></html>' },
    '/p/style.css': { text: 'body { background: url("img/a.png"); }' },
    '/p/js/main.mjs': { text: "import { v } from './v.mjs'; console.log(v);" },
    '/p/js/v.mjs': { text: 'export const v = "光";' },
    '/p/classic.js': { text: 'window.c = 1; // </script> を含む' },
    '/p/img/a.png': { dataUrl: 'data:image/png;base64,AAAA' },
  };
  const out = W.buildPreview(files, '/p', '/p/index.html', { runtime: '/*RUNTIME*/' });
  assert.match(out.html, /<head><script>\/\*RUNTIME\*\/<\/script>/); // 橋渡しが最初に動く
  assert.match(out.html, /<style data-src="style\.css">body \{ background: url\("data:image\/png;base64,AAAA"\); \}<\/style>/);
  assert.match(out.html, /<script type="importmap">/);
  const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/s.exec(out.html)[1]);
  assert.ok(map.imports['vfs:///p/js/v.mjs'].startsWith('data:text/javascript;charset=utf-8,'));
  assert.equal(decodeURIComponent(map.imports['vfs:///p/js/v.mjs'].split(',').slice(1).join(',')), 'export const v = "光";');
  assert.match(out.html, /<script type="module" src="data:text\/javascript;charset=utf-8,[^"]*vfs%3A%2F%2F%2Fp%2Fjs%2Fv\.mjs/);
  assert.match(out.html, /<img src="data:image\/png;base64,AAAA" alt="a">/);
  assert.match(out.html, /<script>window\.c = 1; \/\/ <\\\/script> を含む<\/script>/); // 中の </script> で切れない
  assert.deepEqual(out.missing, []);
  // 誤りの場所を出すため、Data URL からファイルのパスを引ける
  assert.deepEqual(Object.values(out.sources).sort(), ['/p/js/main.mjs', '/p/js/v.mjs']);
});

test('プレビューの文書: 見つからないファイルは missing に出す', () => {
  const out = W.buildPreview({ '/p/index.html': { text: '<script type="module" src="./nai.mjs"></script><link rel="stylesheet" href="nai.css">' } }, '/p', '/p/index.html', { runtime: '' });
  assert.deepEqual(out.missing.sort(), ['/p/nai.css', '/p/nai.mjs']);
});

test('ZIP: CRC32 の値と、ファイルの並び（先頭の印・中央の一覧・終わりの印）', () => {
  assert.equal(W.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const zip = W.zipStore([{ name: 'index.html', data: new TextEncoder().encode('<p>hi</p>') }, { name: 'js/光.mjs', data: new TextEncoder().encode('export {}') }]);
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  const eocd = zip.byteLength - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), 2); // ファイルの数
  assert.ok(new TextDecoder().decode(zip).includes('js/光.mjs'));
  assert.equal(dv.getUint16(6, true) & 0x0800, 0x0800); // 名前は UTF-8 の印
});

test('橋渡し: JavaScript として読め、口を頼む知らせと window.arcadia を持つ', () => {
  assert.doesNotThrow(() => new Function(W.RUNTIME));
  assert.match(W.RUNTIME, /arcadia-hello/);
  assert.match(W.RUNTIME, /window\.arcadia=Object\.freeze/);
  assert.doesNotMatch(W.RUNTIME, /<\/script/i);
});

test('ひな形: 3つとも index.html を持ち、OS のアプリのひな形は app.json を持つ', () => {
  assert.deepEqual(W.TEMPLATES.map((t) => t.id), ['blank', 'canvas', 'osapp']);
  for (const t of W.TEMPLATES) assert.ok(t.files['index.html'], t.id);
  assert.ok(JSON.parse(W.TEMPLATES[2].files['app.json']).name);
});
