// 手元の中継（tools/serve.mjs）がつないではいけない住所の判断。
// 手元の機械（localhost）、家や会社の中のネットワーク、特別な用途の範囲へは、ブラウザの中のページから中継させない（SSRF を防ぐ）。
// 分からない形の住所も通さない。テストは tests/os-browser.test.mjs。

const v4 = (s) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
};
// IPv4 の止める範囲（先頭の数、長さ）
const V4_BLOCK = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([a, n]) => [v4(a).reduce((x, y) => x * 256 + y, 0), n]);
function blockedV4(p) {
  const x = p.reduce((a, b) => a * 256 + b, 0);
  return V4_BLOCK.some(([base, n]) => Math.floor(x / 2 ** (32 - n)) === Math.floor(base / 2 ** (32 - n)));
}
// IPv6 を 8 つの 16 ビットの数にする（最後が IPv4 の書き方でもよい）。読めなければ null
function v6(s) {
  let t = s.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  let tail = [];
  const m = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t);
  if (m) { const p = v4(m[2]); if (!p) return null; tail = [p[0] * 256 + p[1], p[2] * 256 + p[3]]; t = m[1].endsWith('::') ? m[1] : m[1].slice(0, -1); }
  const halves = t.split('::');
  if (halves.length > 2) return null;
  const part = (h) => (h ? h.split(':') : []);
  const head = part(halves[0]), back = halves.length === 2 ? part(halves[1]) : [];
  if ([...head, ...back].some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  const known = head.length + back.length + tail.length;
  if (halves.length === 1 ? known !== 8 : known > 7) return null;
  const nums = [...head, ...Array(8 - known).fill('0'), ...back].map((h) => parseInt(h, 16));
  return [...nums, ...tail];
}
export function isBlockedAddress(ip) {
  const p4 = v4(String(ip));
  if (p4) return blockedV4(p4);
  const h = v6(String(ip));
  if (!h) return true;
  if (h.every((x) => x === 0) || (h.slice(0, 7).every((x) => x === 0) && h[7] === 1)) return true; // :: と ::1
  const embedded = [h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255];
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return blockedV4(embedded); // ::ffff:a.b.c.d
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return blockedV4(embedded); // 64:ff9b::/96
  if ((h[0] & 0xfe00) === 0xfc00 || (h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xff00) === 0xff00) return true; // 家の中・リンク・マルチキャスト
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // 説明用の範囲
  if (h.slice(0, 6).every((x) => x === 0)) return true; // ::a.b.c.d（古い書き方）
  return false;
}
