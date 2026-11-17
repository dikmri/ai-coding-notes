// 文字の見本帳の計算: 分類ごとの文字の一覧、U+ の番号、UTF-8 のバイト、HTML の書き方、検索。
// 画面には触らない純粋な関数だけを置く（テストは tests/os-chars.test.mjs）。
// Unicode の文字の名前の表はブラウザに無いので、名前での検索はしない（番号と文字そのもので探す）。

// [id, 表示の名前, [[はじめ, おわり], ...]]
export const CATEGORIES = [
  ['symbols', '記号', [[0x00a1, 0x00bf], [0x2010, 0x2027], [0x2030, 0x205e], [0x2600, 0x2613], [0x2619, 0x266f]]],
  ['arrows', '矢印', [[0x2190, 0x21ff], [0x27f0, 0x27ff], [0x2900, 0x297f]]],
  ['math', '数学', [[0x00b1, 0x00b1], [0x00d7, 0x00d7], [0x00f7, 0x00f7], [0x2200, 0x22ff]]],
  ['box', '罫線とブロック', [[0x2500, 0x259f]]],
  ['shapes', '図形', [[0x25a0, 0x25ff]]],
  ['enclosed', '囲み文字', [[0x2460, 0x24ff], [0x3251, 0x325f], [0x32b1, 0x32bf]]],
  ['greek', 'ギリシャ文字', [[0x0391, 0x03a9], [0x03b1, 0x03c9]]],
  ['roman', 'ローマ数字', [[0x2160, 0x2188]]],
  ['units', '単位と文字の記号', [[0x2100, 0x214f], [0x3380, 0x33ff]]],
  ['cjk', '句読点と括弧', [[0x3001, 0x303f], [0xff5f, 0xff65]]],
  ['fullwidth', '全角英数', [[0xff01, 0xff5e]]],
].map(([id, name, ranges]) => ({ id, name, ranges }));

const usable = (ch) => !/^[\p{Cn}\p{Cc}\p{Cs}\p{Co}]$/u.test(ch);
const cache = new Map();
export function charsOf(id) {
  if (cache.has(id)) return cache.get(id);
  const cat = CATEGORIES.find((c) => c.id === id);
  const out = [];
  if (cat) for (const [a, b] of cat.ranges) for (let cp = a; cp <= b; cp++) { const ch = String.fromCodePoint(cp); if (usable(ch)) out.push(ch); }
  cache.set(id, out);
  return out;
}
export const categoryOf = (cp) => CATEGORIES.find((c) => c.ranges.some(([a, b]) => cp >= a && cp <= b))?.id ?? null;

export const cpLabel = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
export const utf8Hex = (ch) => [...new TextEncoder().encode(ch)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

// よく使う名前の参照（HTML の決まりにあるものの一部）
const NAMED = {
  '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', ' ': 'nbsp', '©': 'copy', '®': 'reg', '™': 'trade', '…': 'hellip', '—': 'mdash', '–': 'ndash',
  '←': 'larr', '→': 'rarr', '↑': 'uarr', '↓': 'darr', '↔': 'harr', '⇐': 'lArr', '⇒': 'rArr', '⇔': 'hArr',
  '♠': 'spades', '♣': 'clubs', '♥': 'hearts', '♦': 'diams', '×': 'times', '÷': 'divide', '±': 'plusmn', '°': 'deg', 'µ': 'micro', '¶': 'para', '§': 'sect',
  '«': 'laquo', '»': 'raquo', '¥': 'yen', '£': 'pound', '€': 'euro', '¢': 'cent', '•': 'bull', '†': 'dagger', '‡': 'Dagger', '‰': 'permil', '′': 'prime', '″': 'Prime',
  '∀': 'forall', '∂': 'part', '∃': 'exist', '∅': 'empty', '∇': 'nabla', '∈': 'isin', '∉': 'notin', '∑': 'sum', '∏': 'prod', '−': 'minus', '√': 'radic', '∞': 'infin',
  '∧': 'and', '∨': 'or', '∩': 'cap', '∪': 'cup', '∫': 'int', '≈': 'asymp', '≠': 'ne', '≡': 'equiv', '≤': 'le', '≥': 'ge', '⊂': 'sub', '⊃': 'sup',
};
const GREEK = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho _ Sigma Tau Upsilon Phi Chi Psi Omega'.split(' ');
GREEK.forEach((n, i) => { if (n === '_') return; NAMED[String.fromCodePoint(0x391 + i)] = n; NAMED[String.fromCodePoint(0x3b1 + i)] = n.toLowerCase(); });
NAMED['ς'] = 'sigmaf';
export function htmlRefs(ch) {
  const cp = ch.codePointAt(0);
  return { hex: `&#x${cp.toString(16).toUpperCase()};`, dec: `&#${cp};`, named: NAMED[ch] ? `&${NAMED[ch]};` : null };
}

// 検索の言葉を番号にする: 「U+2605」「0x2605」「2605」（16進）か、文字そのもの1つ
export function parseQuery(q) {
  const s = String(q).trim();
  const m = /^(?:u\+|0x)?([0-9a-f]{2,6})$/i.exec(s);
  if (m) { const cp = parseInt(m[1], 16); return cp <= 0x10ffff ? cp : null; }
  const chars = [...s];
  return chars.length === 1 ? s.codePointAt(0) : null;
}
