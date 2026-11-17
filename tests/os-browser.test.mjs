// ウェブブラウザの計算（住所の欄の読み取り、窓の中での表示を断る見出しの判断、中継したページの書き換え、
// 読む表示のリンク、履歴）と、手元の中継がつないではいけない住所の判断のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../os/js/core/browser.mjs';
import { isBlockedAddress } from '../os/js/core/netguard.mjs';

test('住所の欄: ドメインだけなら https の住所にする', () => {
  assert.deepEqual(B.parseInput('example.com'), { kind: 'web', url: 'https://example.com/' });
  assert.deepEqual(B.parseInput('  http://example.com/a?b=1#c '), { kind: 'web', url: 'http://example.com/a?b=1#c' });
  assert.deepEqual(B.parseInput('localhost:8080/x'), { kind: 'web', url: 'http://localhost:8080/x' });
});

test('住所の欄: 内部のページ・百科事典・仮想ドライブ', () => {
  assert.deepEqual(B.parseInput('arcadia://start'), { kind: 'start' });
  assert.deepEqual(B.parseInput('arcadia://wiki/ja/プリズム'), { kind: 'wiki', lang: 'ja', title: 'プリズム' });
  assert.deepEqual(B.parseInput('arcadia://search?q=光 と 色'), { kind: 'search', q: '光 と 色' });
  assert.deepEqual(B.parseInput('/ドキュメント/作品/index.html'), { kind: 'vfs', path: '/ドキュメント/作品/index.html' });
});

test('住所の欄: 住所でないものは検索。javascript: や data: も検索として扱う', () => {
  assert.deepEqual(B.parseInput('プリズム 光'), { kind: 'search', q: 'プリズム 光' });
  assert.deepEqual(B.parseInput('hello'), { kind: 'search', q: 'hello' });
  assert.deepEqual(B.parseInput('javascript:alert(1)'), { kind: 'search', q: 'javascript:alert(1)' });
  assert.deepEqual(B.parseInput('data:text/html,<b>x</b>'), { kind: 'search', q: 'data:text/html,<b>x</b>' });
  assert.equal(B.parseInput('   '), null);
});

test('住所の欄: 読む表示（arcadia://read?url=…）は http と https だけ', () => {
  assert.deepEqual(B.parseInput('arcadia://read?url=https://example.com/a?b=1'), { kind: 'read', url: 'https://example.com/a?b=1' });
  assert.deepEqual(B.parseInput('arcadia://read?url=javascript:alert(1)'), { kind: 'start' });
});

test('百科事典の記事の住所から、言語と題名を取り出す', () => {
  assert.deepEqual(B.wikiFromUrl('https://ja.wikipedia.org/wiki/%E5%85%89_(%E7%89%A9%E7%90%86)'), { lang: 'ja', title: '光 (物理)' });
  assert.equal(B.wikiFromUrl('https://ja.wikipedia.org/w/index.php?title=x'), null);
  assert.equal(B.wikiFromUrl('https://example.com/wiki/x'), null);
});

test('検索結果の抜き出し: HTML の印を除いて文字だけにする', () => {
  assert.equal(B.stripTags('<span class="searchmatch">光</span>の&quot;色&quot; &amp; 影'), '光の"色" & 影');
});

test('内部の住所: 種類から住所の欄に出す文字を作る（読み取りと往復できる）', () => {
  for (const s of ['arcadia://start', 'arcadia://wiki/ja/光', 'arcadia://search?q=a b', 'arcadia://read?url=https://example.com/', 'https://example.com/']) {
    assert.equal(B.toAddress(B.parseInput(s)), s);
  }
});

test('枠の中での表示: X-Frame-Options と CSP の frame-ancestors で断っているか', () => {
  const me = 'http://localhost:8769';
  assert.equal(B.frameBlocked({ 'x-frame-options': 'DENY' }, me), true);
  assert.equal(B.frameBlocked({ 'x-frame-options': 'sameorigin' }, me), true);
  assert.equal(B.frameBlocked({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }, me), true);
  assert.equal(B.frameBlocked({ 'content-security-policy': "frame-ancestors 'self' https://a.example" }, me), true);
  assert.equal(B.frameBlocked({ 'content-security-policy': 'frame-ancestors *' }, me), false);
  assert.equal(B.frameBlocked({ 'content-security-policy': 'frame-ancestors http://localhost:8769' }, me), false);
  assert.equal(B.frameBlocked({ 'content-security-policy': "script-src 'self'" }, me), false);
  assert.equal(B.frameBlocked({}, me), false);
});

test('中継したページ: head の先頭に base とリンクを拾うスクリプトを入れ、ページの CSP の meta を除く', () => {
  const html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src none"><base href="/old/"><title>t</title></head><body><a href="/x">x</a></body></html>';
  const out = B.relayDocument(html, 'https://example.com/a/b.html');
  assert.match(out, /<head><base href="https:\/\/example\.com\/a\/b\.html"><script>/);
  assert.doesNotMatch(out, /Content-Security-Policy/i);
  assert.doesNotMatch(out, /href="\/old\/"/);
  assert.match(out, /arcadia-nav/);
  // head がないページにも入れる。住所の引用符は壊さない
  const bare = B.relayDocument('<p>hi</p>', 'https://example.com/?q="x"');
  assert.match(bare, /^<head><base href="https:\/\/example\.com\/\?q=%22x%22"><script>/);
});

test('読む表示のリンク: http と https だけを通し、相対の住所は元のページから解決する', () => {
  assert.equal(B.safeHref('/wiki/x', 'https://ja.wikipedia.org/a'), 'https://ja.wikipedia.org/wiki/x');
  assert.equal(B.safeHref('//upload.wikimedia.org/i.png', 'https://ja.wikipedia.org/'), 'https://upload.wikimedia.org/i.png');
  assert.equal(B.safeHref('javascript:alert(1)', 'https://example.com/'), null);
  assert.equal(B.safeHref('data:text/html,x', 'https://example.com/'), null);
});

test('百科事典: 記事の中の「./題名」のリンクを内部の住所にする', () => {
  assert.equal(B.wikiLink('./%E5%85%89', 'ja'), 'arcadia://wiki/ja/光');
  assert.equal(B.wikiLink('./光#色', 'ja'), 'arcadia://wiki/ja/光');
  assert.equal(B.wikiLink('https://example.com/', 'ja'), null);
});

test('履歴: 新しいものを先頭に、同じ住所は1つにまとめ、上限を超えたら古いものを捨てる', () => {
  let h = [];
  h = B.addHistory(h, { url: 'a', title: 'A' }, 3, 1);
  h = B.addHistory(h, { url: 'b', title: 'B' }, 3, 2);
  h = B.addHistory(h, { url: 'a', title: 'A2' }, 3, 3);
  assert.deepEqual(h.map((e) => e.url + e.title), ['aA2', 'bB']);
  h = B.addHistory(h, { url: 'c' }, 3, 4); h = B.addHistory(h, { url: 'd' }, 3, 5);
  assert.deepEqual(h.map((e) => e.url), ['d', 'c', 'a']);
});

test('つないではいけない住所: 手元・家の中のネットワーク・特別な範囲（IPv4・IPv6）', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '93.184.216.34', '2606:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
  assert.equal(isBlockedAddress('not-an-ip'), true); // 分からないものは通さない
});
