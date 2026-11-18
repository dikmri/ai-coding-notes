// 文書（ワープロ）の計算。画面（DOM）を使わないので node:test で確かめられる（tests/os-writer.test.mjs）。
// ・sanitize: 外から来た HTML（開いた .fdoc、貼り付け）を、文書で使う決まった要素と属性だけにする。
//   script・on〜の属性・javascript: の URL・外の画像の URL は残さない。自前の小さな HTML の読み取りで木にしてから選ぶ。
// ・toMarkdown / toText / blockTexts: 書き出しと文字数のための変換
// ・countText: 文字数（改行を数えない数と、空白も数えない数）と段落の数
// ・findAll: 検索
// ・makeFdoc / parseFdoc / normalizeSettings: 保存の形 .fdoc（JSON に、決まった HTML の部分集合と設定を入れる）
// ・buildHtml: 1 つのファイルの HTML（紙の大きさと印刷の決まり付き）

export const FORMAT = 'future-os-fdoc';
export const VERSION = 1;
export const DEFAULT_SETTINGS = Object.freeze({ writing: 'horizontal', fontSize: 10.5, lineHeight: 1.8 });
export const FONT_SIZES = [9, 10, 10.5, 11, 12, 14, 16, 18, 20];
export const LINE_HEIGHTS = [1.4, 1.6, 1.8, 2, 2.2];
const MAX_HTML = 40 * 1024 * 1024; // 本文の HTML の上限（画像を data: で含むため大きめ）
const MAX_DEPTH = 120; // 要素の入れ子の上限。これより深い開始タグは無視し、中身だけを残す

/* ---------- 要素の決まり ---------- */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'keygen', 'frame', 'image']);
// 中身を HTML として読まない要素（閉じタグまでを文字として読み、捨てる）
const RAWTEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
// 中身ごと捨てる要素
const DROP = new Set([...RAWTEXT, 'template', 'svg', 'math', 'object', 'embed', 'applet', 'canvas', 'video', 'audio', 'picture', 'select', 'option', 'optgroup', 'button', 'input', 'head', 'meta', 'link', 'base', 'frameset', 'frame', 'map', 'area', 'dialog', 'datalist', 'output', 'progress', 'meter', 'slot', 'portal', 'fencedframe']);
// 同じ意味の要素の読み替え
const RENAME = { b: 'strong', i: 'em', strike: 's', del: 's', ins: 'u', h4: 'h3', h5: 'h3', h6: 'h3', tt: 'code', kbd: 'code', samp: 'code', var: 'em', cite: 'em', dfn: 'em' };
export const TEXT_BLOCKS = ['p', 'h1', 'h2', 'h3', 'blockquote', 'pre'];
const BLOCK = new Set([...TEXT_BLOCKS, 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr']);
const INLINE = new Set(['strong', 'em', 'u', 's', 'code', 'span', 'mark', 'sub', 'sup', 'br', 'img']);
export const ALLOWED = [...BLOCK, ...INLINE];
// 段落にする入れ物（中に段落があれば外すだけ）
const DIVLIKE = new Set(['div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'figure', 'figcaption', 'address', 'dl', 'dt', 'dd', 'caption', 'center', 'details', 'summary', 'fieldset', 'legend', 'form', 'body', 'html', 'hgroup', 'search']);

// style の中で残す性質（要素ごと）
const ALIGN = /^(left|center|right|start|end|justify)$/;
const COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*(,\s*(0|1|0?\.\d+)\s*)?\)|[a-z]{3,20})$/i;
const STYLE_RULES = {
  p: { 'text-align': ALIGN }, h1: { 'text-align': ALIGN }, h2: { 'text-align': ALIGN }, h3: { 'text-align': ALIGN },
  blockquote: { 'text-align': ALIGN }, pre: {}, li: { 'text-align': ALIGN }, td: { 'text-align': ALIGN }, th: { 'text-align': ALIGN },
  span: { color: COLOR, 'background-color': COLOR }, mark: { 'background-color': COLOR },
  img: { width: 'width' },
};
// 画面の側で、編集中の文書が決まりどおりかを調べるときに使う（要素ごとに残す style の性質の名前）
export const STYLE_PROPS = Object.fromEntries(Object.entries(STYLE_RULES).map(([k, v]) => [k, Object.keys(v)]));
// ブラウザの Sanitizer API（Document.parseHTML）に渡す設定。自前の消毒のあとに、念のためもう一度かけるときに使う
export const SANITIZER_CONFIG = { elements: [...new Set([...TEXT_BLOCKS, 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'strong', 'em', 'u', 's', 'code', 'span', 'mark', 'sub', 'sup', 'br', 'img'])], attributes: ['style', 'src', 'alt'], comments: false, dataAttributes: false };
// data: の画像だけを許す（外の URL は読み込みで相手に知らせてしまうので落とす）
const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp|bmp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i;

/* ---------- 文字参照 ---------- */
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', times: '×', divide: '÷', yen: '¥', deg: '°', plusmn: '±', para: '¶', sect: '§', bull: '•', shy: '\u00AD', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwj: '\u200D', zwnj: '\u200C' };
function decode(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,31});?/gi, (m, body) => {
    if (body[0] === '#') {
      const n = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!n || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '\uFFFD';
      return String.fromCodePoint(n);
    }
    const v = NAMED[body.toLowerCase()];
    return v === undefined ? m : v;
  });
}
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeHtml = (s) => escAttr(String(s));

/* ---------- 読み取り（文字 → 木） ----------
   木の節: { tag, attrs: { 名前: 値 }, children: [] } と { text }。一番外は { tag: '#root' } */
function tokenize(html) {
  const out = [];
  let i = 0;
  const n = html.length;
  const pushText = (t) => { if (t) out.push({ type: 'text', text: decode(t) }); };
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { pushText(html.slice(i)); break; }
    if (lt > i) pushText(html.slice(i, lt));
    i = lt;
    if (html.startsWith('<!--', i)) { const e = html.indexOf('-->', i + 4); i = e < 0 ? n : e + 3; continue; }
    if (html[i + 1] === '!' || html[i + 1] === '?') { const e = html.indexOf('>', i); i = e < 0 ? n : e + 1; continue; }
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(i, i + 64));
    if (!m) { pushText('<'); i++; continue; }
    const end = m[1] === '/', tag = m[2].toLowerCase();
    let j = i + m[0].length;
    const attrs = {};
    // 属性: 名前、名前=値、名前="値"、名前='値'
    for (;;) {
      while (j < n && /[\s/]/.test(html[j])) j++;
      if (j >= n || html[j] === '>') break;
      const am = /^([^\s"'>/=]+)/.exec(html.slice(j, j + 256));
      if (!am) { j++; continue; }
      const name = am[1].toLowerCase();
      j += am[1].length;
      while (j < n && /\s/.test(html[j])) j++;
      let value = '';
      if (html[j] === '=') {
        j++;
        while (j < n && /\s/.test(html[j])) j++;
        const q = html[j];
        if (q === '"' || q === "'") { const e = html.indexOf(q, j + 1); value = html.slice(j + 1, e < 0 ? n : e); j = e < 0 ? n : e + 1; }
        else { const vm = /^[^\s>]*/.exec(html.slice(j)); value = vm[0]; j += value.length; }
      }
      if (!(name in attrs)) attrs[name] = decode(value);
    }
    const selfClose = html[j - 1] === '/';
    i = j < n ? j + 1 : n;
    if (end) { out.push({ type: 'end', tag }); continue; }
    out.push({ type: 'start', tag, attrs, selfClose });
    if (RAWTEXT.has(tag)) {
      // 閉じタグまでを、中身として読まずに飛ばす
      if (tag === 'plaintext') { i = n; continue; }
      const re = new RegExp('</' + tag + '[\\s/>]', 'ig');
      re.lastIndex = i;
      const e = re.exec(html);
      if (!e) { i = n; out.push({ type: 'end', tag }); continue; }
      const close = html.indexOf('>', e.index);
      i = close < 0 ? n : close + 1;
      out.push({ type: 'end', tag });
    }
  }
  return out;
}

// 開いている要素を、その要素を閉じるときに一緒に閉じる範囲で探す
const SCOPE_STOP = new Set(['table', 'ul', 'ol', 'blockquote', 'td', 'th', '#root']);
const P_CLOSERS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote', 'pre', 'div', 'hr', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'figure', 'address', 'dl', 'details', 'form', 'fieldset', 'center', 'li']);
export function parseHTML(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const closeTo = (tag, stops = SCOPE_STOP) => {
    for (let k = stack.length - 1; k > 0; k--) {
      if (stack[k].tag === tag) { stack.length = k; return true; }
      if (stops.has(stack[k].tag)) return false;
    }
    return false;
  };
  for (const t of tokenize(String(html))) {
    if (t.type === 'text') {
      const kids = top().children, last = kids[kids.length - 1];
      if (last && last.text !== undefined) last.text += t.text; else kids.push({ text: t.text });
      continue;
    }
    if (t.type === 'start') {
      const tag = t.tag;
      if (P_CLOSERS.has(tag)) closeTo('p', new Set([...SCOPE_STOP, 'li']));
      if (/^h[1-6]$/.test(tag)) { for (let k = stack.length - 1; k > 0 && !SCOPE_STOP.has(stack[k].tag); k--) if (/^h[1-6]$/.test(stack[k].tag)) { stack.length = k; break; } }
      if (tag === 'li') closeTo('li', new Set(['ul', 'ol', 'table', '#root']));
      if (tag === 'td' || tag === 'th') { if (!closeTo('td', new Set(['tr', 'table', '#root']))) closeTo('th', new Set(['tr', 'table', '#root'])); }
      if (tag === 'tr') closeTo('tr', new Set(['table', '#root']));
      if ((tag === 'tbody' || tag === 'thead' || tag === 'tfoot')) { closeTo('tbody', new Set(['table', '#root'])); closeTo('thead', new Set(['table', '#root'])); }
      const el = { tag, attrs: t.attrs, children: [] };
      if (stack.length > MAX_DEPTH && !VOID.has(tag)) continue; // 深すぎる開始タグは無視し、中身は今の要素に入れる
      top().children.push(el);
      if (!VOID.has(tag) && !t.selfClose) stack.push(el);
      continue;
    }
    // 閉じタグ
    if (t.tag === 'br') { top().children.push({ tag: 'br', attrs: {}, children: [] }); continue; }
    if (t.tag === 'p' && !stack.some((e) => e.tag === 'p')) { top().children.push({ tag: 'p', attrs: {}, children: [] }); continue; }
    for (let k = stack.length - 1; k > 0; k--) {
      if (stack[k].tag === t.tag) { stack.length = k; break; }
      if (SCOPE_STOP.has(stack[k].tag) && !(t.tag === 'table' && stack[k].tag !== 'table' && stack.slice(0, k).some((e) => e.tag === 'table'))) break;
    }
  }
  return root;
}

/* ---------- 消毒（木 → 許した木） ---------- */
function cleanStyle(tag, raw) {
  const rules = STYLE_RULES[tag];
  if (!rules || !raw) return '';
  const out = [];
  for (const decl of String(raw).split(';')) {
    const k = decl.indexOf(':');
    if (k < 0) continue;
    const prop = decl.slice(0, k).trim().toLowerCase(), value = decl.slice(k + 1).trim().replace(/\s*!important$/i, '');
    const rule = rules[prop];
    if (!rule || out.some((d) => d.startsWith(prop + ':'))) continue;
    if (rule === 'width') {
      const m = /^(\d+(?:\.\d+)?)(%|px)$/.exec(value);
      if (!m) continue;
      const v = m[2] === '%' ? Math.min(100, Math.max(5, +m[1])) : Math.min(2000, Math.max(16, +m[1]));
      out.push(`width:${Math.round(v * 10) / 10}${m[2]}`);
    } else if (rule.test(value) && !/url|expression|\\/i.test(value)) out.push(`${prop}:${value}`);
  }
  return out.join(';');
}

function cleanAttrs(tag, attrs, opts = {}) {
  const out = {};
  if (tag === 'img') {
    const src = String(attrs.src || '').trim();
    if (DATA_IMAGE.test(src)) out.src = src.replace(/\s+/g, '');
    else if (/^blob:/i.test(src) && opts.imageSrc && opts.imageSrc(src)) out.src = src; // 画面の中だけで使う画像（呼んだ側が許したもの）
    else return null; // 画像として残せない
    if (attrs.alt) out.alt = String(attrs.alt).slice(0, 300);
  }
  const style = cleanStyle(tag, attrs.style);
  if (style) out.style = style;
  return out;
}

const isBlock = (node) => node.tag && BLOCK.has(node.tag);
const blank = (node) => node.text !== undefined ? !node.text.replace(/[\s\u00A0]/g, '') : false;

// 子の並びを消毒して、新しい子の並びを返す。ancestors は祖先の要素名の並び（同じ飾りの入れ子を外すため）
function cleanChildren(children, ancestors, depth, opts) {
  const out = [];
  for (const node of children) {
    if (node.text !== undefined) { if (node.text) out.push({ text: node.text }); continue; }
    let tag = RENAME[node.tag] || node.tag;
    if (DROP.has(tag)) continue;
    if (depth > MAX_DEPTH) { out.push(...cleanChildren(node.children, ancestors, depth, opts)); continue; }
    if (tag === 'img') { const a = cleanAttrs('img', node.attrs, opts); if (a) out.push({ tag, attrs: a, children: [] }); continue; }
    if (tag === 'br' || tag === 'hr') { out.push({ tag, attrs: {}, children: [] }); continue; }
    const kids = cleanChildren(node.children, [...ancestors, tag], depth + 1, opts);
    if (DIVLIKE.has(tag) || !ALLOWED.includes(tag)) {
      // 入れ物: 中に段落などがあれば外すだけ、文字だけなら段落にする
      if (DIVLIKE.has(tag) && !kids.some(isBlock) && kids.some((k) => !blank(k)) && !ancestors.some((a) => ['p', 'h1', 'h2', 'h3', 'li', 'td', 'th', 'pre'].includes(a) || INLINE.has(a))) {
        out.push({ tag: 'p', attrs: {}, children: kids });
      } else out.push(...kids);
      continue;
    }
    // 飾り（インライン）の中の段落などは、飾りを外す。同じ飾りの入れ子も外す
    if (INLINE.has(tag) && (kids.some(isBlock) || ancestors.includes(tag))) { out.push(...kids); continue; }
    if (INLINE.has(tag) && !kids.length) continue; // 中身のない飾り
    const attrs = cleanAttrs(tag, node.attrs) || {};
    if (tag === 'span' && !attrs.style) { out.push(...kids); continue; }
    out.push({ tag, attrs, children: kids });
  }
  return out;
}

// 構造を整える: 一番外は段落などの塊だけにする、表と箇条書きの形をそろえる、空の塊に <br> を入れる
function fixStructure(children, parentTag) {
  const out = [];
  let run = null; // 塊の外にある文字と飾りをまとめる段落
  const flush = () => { if (run) { if (run.children.some((k) => !blank(k) || k.tag)) out.push(run); run = null; } };
  // 一番外と、段落などが混ざった引用・項目・マスでは、外に出ている文字と飾りを段落にまとめる（項目の中の入れ子の列は数えない）
  const needsBlocks = parentTag === '#root' || (['blockquote', 'li', 'td', 'th'].includes(parentTag) && children.some((k) => isBlock(k) && k.tag !== 'ul' && k.tag !== 'ol'));
  for (const node of children) {
    if (node.text === undefined) {
      const tag = node.tag;
      // 置き場所の違う要素を直す
      if (tag === 'li' && parentTag !== 'ul' && parentTag !== 'ol') { node.tag = 'p'; }
      else if ((tag === 'td' || tag === 'th') && parentTag !== 'tr') { flushInto(node.children); continue; }
      else if (tag === 'tr' && !['table', 'tbody', 'thead'].includes(parentTag)) { flushInto(node.children); continue; }
      else if ((tag === 'tbody' || tag === 'thead') && parentTag !== 'table') { flushInto(node.children); continue; }
      else if ((parentTag === 'ul' || parentTag === 'ol') && tag !== 'li') { node.children = [node.text === undefined ? { ...node } : node]; node.tag = 'li'; node.attrs = {}; }
      else if (parentTag === 'tr' && tag !== 'td' && tag !== 'th') { node.children = [{ ...node }]; node.tag = 'td'; node.attrs = {}; }
      else if (['table', 'tbody', 'thead'].includes(parentTag) && tag !== 'tr' && tag !== 'tbody' && tag !== 'thead') { continue; }
    } else if (['ul', 'ol', 'table', 'tbody', 'thead', 'tr'].includes(parentTag)) {
      continue; // 表と列の間の文字（空白）は捨てる
    }
    if (needsBlocks && (node.text !== undefined || INLINE.has(node.tag))) {
      if (!run) run = { tag: 'p', attrs: {}, children: [] };
      run.children.push(node);
      continue;
    }
    flush();
    if (node.text !== undefined) { out.push(node); continue; }
    const tag = node.tag;
    if (tag === 'table') {
      // tr を tbody に入れる
      const rows = [];
      let body = null;
      for (const k of node.children) {
        if (k.tag === 'tr') { if (!body) { body = { tag: 'tbody', attrs: {}, children: [] }; rows.push(body); } body.children.push(k); }
        else { body = null; rows.push(k); }
      }
      node.children = rows;
    }
    node.children = fixStructure(node.children, tag);
    if (tag === 'table' && !node.children.some((b) => b.children?.length)) continue; // 行のない表は捨てる
    // 空の塊（空白と改行だけのものも）には <br> を入れて、書ける場所を残す。pre の中の空白は文字として残す
    if ((TEXT_BLOCKS.includes(tag) || tag === 'li' || tag === 'td' || tag === 'th') && !node.children.some((k) => k.tag || (k.text !== undefined && (tag === 'pre' ? k.text !== '' : /[^ \t\n\r\f]/.test(k.text))))) {
      node.children = [{ tag: 'br', attrs: {}, children: [] }];
    }
    if ((tag === 'ul' || tag === 'ol') && !node.children.length) continue;
    out.push(node);
  }
  flush();
  if (parentTag === '#root' && !out.length) out.push({ tag: 'p', attrs: {}, children: [{ tag: 'br', attrs: {}, children: [] }] });
  return out;

  function flushInto(kids) { for (const k of fixStructure(kids, parentTag)) { if (needsBlocks && (k.text !== undefined || INLINE.has(k.tag))) { if (!run) run = { tag: 'p', attrs: {}, children: [] }; run.children.push(k); } else { flush(); out.push(k); } } }
}

function serialize(nodes) {
  let s = '';
  for (const n of nodes) {
    if (n.text !== undefined) { s += escText(n.text); continue; }
    s += '<' + n.tag;
    for (const [k, v] of Object.entries(n.attrs || {})) s += ` ${k}="${escAttr(v)}"`;
    s += '>';
    if (VOID.has(n.tag)) continue;
    s += serialize(n.children) + '</' + n.tag + '>';
  }
  return s;
}

function cleanTree(html, opts = {}) {
  const raw = String(html ?? '');
  if (raw.length > MAX_HTML) throw new Error('文書が大きすぎます（40 MB まで）。');
  return fixStructure(cleanChildren(parseHTML(raw).children, [], 0, opts), '#root');
}
// opts.imageSrc(src): 画面の中で使う blob: の画像を残すかを決める関数（保存や書き出しでは渡さない）
export function sanitize(html, opts = {}) { return serialize(cleanTree(html, opts)); }

/* ---------- 文字への変換 ---------- */
// 木の中の文字。pre の中以外は、空白と改行を 1 つの空白にまとめる
function inlineText(nodes, pre = false) {
  let s = '';
  nodes.forEach((n, i) => {
    if (n.text !== undefined) s += pre ? n.text : n.text.replace(/[\t\n\r\f ]+/g, ' ');
    else if (n.tag === 'br') { if (i < nodes.length - 1) s += '\n'; }
    else if (n.tag === 'img') s += '';
    else s += inlineText(n.children, pre || n.tag === 'pre');
  });
  return s;
}

// 段落・見出し・項目・マスの文字の一覧（文字数を数えるため）
export function blockTexts(html) {
  const out = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.text !== undefined) continue;
      if (n.tag === 'ul' || n.tag === 'ol' || n.tag === 'table' || n.tag === 'tbody' || n.tag === 'thead' || n.tag === 'tr' || (n.tag === 'blockquote' && n.children.some(isBlock))) { walk(n.children); continue; }
      if (n.tag === 'li' || n.tag === 'td' || n.tag === 'th') {
        const inner = n.children.filter((k) => !(k.tag === 'ul' || k.tag === 'ol'));
        if (inner.some(isBlock)) walk(inner); else out.push(inlineText(inner, false).trim());
        walk(n.children.filter((k) => k.tag === 'ul' || k.tag === 'ol'));
        continue;
      }
      if (TEXT_BLOCKS.includes(n.tag)) out.push(n.tag === 'pre' ? inlineText(n.children, true) : inlineText(n.children).trim());
    }
  };
  walk(cleanTree(html));
  return out;
}

export function toText(html) {
  const lines = [];
  const walk = (nodes, prefix = '') => {
    for (const n of nodes) {
      if (n.text !== undefined) continue;
      if (n.tag === 'hr') { lines.push('――――――――'); continue; }
      if (n.tag === 'ul' || n.tag === 'ol') {
        let k = 0;
        for (const li of n.children) {
          k++;
          const inner = li.children.filter((c) => c.tag !== 'ul' && c.tag !== 'ol');
          lines.push(prefix + (n.tag === 'ol' ? `${k}. ` : '・') + inlineText(inner).trim());
          walk(li.children.filter((c) => c.tag === 'ul' || c.tag === 'ol'), prefix + '\u3000');
        }
        continue;
      }
      if (n.tag === 'table') {
        for (const body of n.children) for (const tr of body.children) lines.push(tr.children.map((td) => inlineText(td.children).trim().replace(/\n/g, ' ')).join('\t'));
        continue;
      }
      if (n.tag === 'blockquote' && n.children.some(isBlock)) { walk(n.children, prefix); continue; }
      lines.push(prefix + (n.tag === 'pre' ? inlineText(n.children, true) : inlineText(n.children).trim()));
    }
  };
  walk(cleanTree(html));
  return lines.join('\n') + '\n';
}

/* ---------- Markdown ---------- */
const mdEscape = (s) => s.replace(/([\\`*_[\]~|<])/g, '\\$1');
const mdLineStart = (s) => s.replace(/^(\s*)(#{1,6}(?=\s|$)|>|[-+](?=\s)|(\d+)\.(?=\s))/, (m, sp, mark, num) => sp + (num ? num + '\\.' : '\\' + mark));
function mdInline(nodes) {
  let s = '';
  nodes.forEach((n, i) => {
    if (n.text !== undefined) { s += mdEscape(n.text.replace(/[\t\n\r\f ]+/g, ' ')); return; }
    switch (n.tag) {
      case 'br': if (i < nodes.length - 1) s += '  \n'; return;
      case 'img': s += `![${mdEscape(n.attrs.alt || '')}](${n.attrs.src})`; return;
      case 'strong': s += wrap(mdInline(n.children), '**'); return;
      case 'em': s += wrap(mdInline(n.children), '*'); return;
      case 's': s += wrap(mdInline(n.children), '~~'); return;
      case 'u': { const inner = mdInline(n.children); if (inner.trim()) s += `<u>${inner}</u>`; return; }
      case 'code': {
        const t = inlineText(n.children, true).replace(/\n/g, ' ');
        if (!t) return;
        let fence = '`';
        while (t.includes(fence)) fence += '`';
        const pad = t.startsWith('`') || t.endsWith('`') ? ' ' : '';
        s += fence + pad + t + pad + fence;
        return;
      }
      default: s += mdInline(n.children);
    }
  });
  return s;
}
// 強調の記号で囲む。内側の端の空白は外へ出す（「** b **」は強調にならないため）
function wrap(inner, mark) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
}
const cellMd = (td) => mdInline(td.children.flatMap((k) => (isBlock(k) ? [...k.children, { text: ' ' }] : [k]))).replace(/ {2}\n/g, ' ').trim();

function mdBlocks(nodes, indent = '') {
  const parts = [];
  for (const n of nodes) {
    if (n.text !== undefined) continue;
    switch (n.tag) {
      case 'h1': case 'h2': case 'h3': parts.push('#'.repeat(+n.tag[1]) + ' ' + mdInline(n.children).trim()); break;
      case 'hr': parts.push('---'); break;
      case 'pre': {
        const t = inlineText(n.children, true);
        let fence = '```';
        while (t.includes(fence)) fence += '`';
        parts.push(fence + '\n' + t + '\n' + fence);
        break;
      }
      case 'blockquote': {
        const inner = n.children.some(isBlock) ? mdBlocks(n.children) : mdLineStart(mdInline(n.children).trim());
        parts.push(inner.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n'));
        break;
      }
      case 'ul': case 'ol': {
        const lines = [];
        let k = 0;
        for (const li of n.children) {
          k++;
          const mark = n.tag === 'ol' ? `${k}. ` : '- ';
          const inner = li.children.filter((c) => c.tag !== 'ul' && c.tag !== 'ol');
          const text = (inner.some(isBlock) ? mdBlocks(inner) : mdInline(inner).trim()).replace(/\n/g, '\n' + ' '.repeat(mark.length));
          lines.push(mark + text);
          const sub = li.children.filter((c) => c.tag === 'ul' || c.tag === 'ol');
          if (sub.length) lines.push(mdBlocks(sub).split('\n').filter((l) => l).map((l) => ' '.repeat(mark.length) + l).join('\n'));
        }
        parts.push(lines.join('\n'));
        break;
      }
      case 'table': {
        const rows = n.children.flatMap((b) => b.children).map((tr) => tr.children.map(cellMd));
        if (!rows.length) break;
        const width = Math.max(...rows.map((r) => r.length));
        const line = (r) => '| ' + Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ') + ' |';
        parts.push([line(rows[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n'));
        break;
      }
      default: {
        const t = mdInline(n.children).trim();
        if (t) parts.push(mdLineStart(t));
      }
    }
  }
  return parts.map((p) => p.split('\n').map((l) => (l ? indent + l : l)).join('\n')).join('\n\n');
}
export function toMarkdown(html) { const s = mdBlocks(cleanTree(html)); return s ? s + '\n' : ''; }

/* ---------- 文字数 ---------- */
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;
const graphemes = (s) => (segmenter ? [...segmenter.segment(s)].length : [...s].length);
// blocks: 段落ごとの文字。chars は改行を数えない文字数、noSpace は空白（全角の空白も）と改行を数えない文字数
export function countText(blocks) {
  let chars = 0, noSpace = 0, paragraphs = 0;
  for (const b of blocks) {
    const t = String(b);
    chars += graphemes(t.replace(/[\r\n]/g, ''));
    const solid = t.replace(/[\s\u3000\u00A0]/g, '');
    noSpace += graphemes(solid);
    if (solid) paragraphs++;
  }
  return { chars, noSpace, paragraphs };
}

/* ---------- 検索 ---------- */
export function findAll(text, query, { caseSensitive = false } = {}) {
  if (!query) return [];
  const hay = caseSensitive ? text : text.toLowerCase(), q = caseSensitive ? query : query.toLowerCase();
  const out = [];
  for (let i = hay.indexOf(q); i >= 0; i = hay.indexOf(q, i + q.length)) out.push([i, i + q.length]);
  return out;
}

/* ---------- 保存の形 ---------- */
export function normalizeSettings(s) {
  const o = s && typeof s === 'object' ? s : {};
  const num = (v, min, max, d) => { const x = Number(v); return Number.isFinite(x) && v !== '' && v !== null ? Math.min(max, Math.max(min, x)) : d; };
  return {
    writing: o.writing === 'vertical' ? 'vertical' : 'horizontal',
    fontSize: num(o.fontSize, 8, 20, DEFAULT_SETTINGS.fontSize),
    lineHeight: num(o.lineHeight, 1.2, 2.5, DEFAULT_SETTINGS.lineHeight),
  };
}
export function makeFdoc({ html, settings }) {
  return JSON.stringify({ format: FORMAT, version: VERSION, app: 'Future OS 文書', settings: normalizeSettings(settings), html: sanitize(html) });
}
export function parseFdoc(text) {
  let j;
  try { j = JSON.parse(String(text)); } catch { throw new Error('文書のファイルとして読めません（中身が JSON の形になっていません）。'); }
  if (!j || typeof j !== 'object' || j.format !== FORMAT) throw new Error('文書のファイルではありません（.fdoc の形と違います）。');
  if (typeof j.version !== 'number' || j.version > VERSION) throw new Error('この文書は新しい版の「文書」で作られたため、開けません。');
  if (typeof j.html !== 'string') throw new Error('文書の本文がありません。');
  return { html: sanitize(j.html), settings: normalizeSettings(j.settings) };
}

/* ---------- HTML の書き出し・印刷 ---------- */
// 紙: A4 の縦。余白は上下 20mm、左右 22mm（横書きのとき。縦書きでも紙の向きは同じ）
export const PAGE = { width: 210, height: 297, marginY: 20, marginX: 22 };
export function documentCss(settings) {
  const s = normalizeSettings(settings), v = s.writing === 'vertical';
  return `@page { size: A4 portrait; margin: ${PAGE.marginY}mm ${PAGE.marginX}mm; }
html { ${v ? 'writing-mode: vertical-rl; ' : ''}background: #ece8f1; }
body { box-sizing: border-box; margin: 24px auto; ${v ? `inline-size: ${PAGE.height}mm; min-block-size: ${PAGE.width}mm;` : `inline-size: ${PAGE.width}mm; min-block-size: ${PAGE.height}mm;`} padding: ${PAGE.marginY}mm ${PAGE.marginX}mm; background: #fff; color: #1d1a22; box-shadow: 0 2px 12px rgb(0 0 0 / 0.18);
  font-family: "BIZ UDPMincho", "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif JP", serif; font-size: ${s.fontSize}pt; line-height: ${s.lineHeight}; overflow-wrap: anywhere; line-break: strict; }
h1, h2, h3 { font-family: "BIZ UDPGothic", "Yu Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif; line-height: 1.4; margin-block: 0.8em 0.4em; }
h1 { font-size: 1.8em; } h2 { font-size: 1.4em; } h3 { font-size: 1.15em; }
p, ul, ol, blockquote, pre, table { margin-block: 0 0.6em; }
blockquote { margin-inline: 1.5em 0; padding-inline-start: 1em; border-inline-start: 3px solid #b9a8d6; color: #4a4157; }
pre, code { font-family: "BIZ UDGothic", "MS Gothic", ui-monospace, monospace; font-size: 0.92em; }
pre { padding: 0.6em 0.8em; background: #f5f2f8; border: 1px solid #d9d0e6; white-space: pre-wrap; }
code { padding: 0 0.2em; background: #f2eef7; }
table { border-collapse: collapse; }
td, th { border: 1px solid #5d5468; padding: 0.2em 0.5em; min-inline-size: 3em; vertical-align: top; }
hr { border: 0; border-block-start: 1px solid #5d5468; margin-block: 1em; }
img { max-inline-size: 100%; block-size: auto; vertical-align: middle; }
mark { background-color: #fff27a; color: inherit; }
@media print {
  html { background: none; }
  body { margin: 0; padding: 0; inline-size: auto; min-block-size: 0; box-shadow: none; }
  h1, h2, h3 { break-after: avoid; }
  tr, img, pre { break-inside: avoid; }
}`;
}
export function buildHtml({ title = '無題', html, settings }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Future OS 文書">
<title>${escapeHtml(title)}</title>
<style>
${documentCss(settings)}
</style>
</head>
<body>
${sanitize(html)}
</body>
</html>
`;
}

/* ---------- 見本の文書（初めて開いたとき） ---------- */
export const SAMPLE_HTML = [
  '<h1>「文書」へようこそ</h1>',
  '<p>これは「文書」の見本です。そのまま書きかえて、自由に使ってください。紙の形のまま書けて、<strong>太字</strong>や<em>斜体</em>、<span style="color:#c2185b">文字の色</span>や<mark style="background-color:#fff27a">蛍光ペン</mark>も使えます。</p>',
  '<h2>すぐに使える操作</h2>',
  '<ul><li>文字を選んで、上の帯の「太」「斜」「下」のボタンを押すと、書式が変わります。</li><li>左上の「段落の種類」で、見出しや引用に変えられます。</li><li>表と画像は「挿入」のメニューから入れます。画像は仮想ドライブから選びます。</li><li>「縦書き」のボタンで、縦書きと横書きを切り替えます。</li></ul>',
  '<h2>保存と書き出し</h2>',
  '<p>Ctrl+S で、.fdoc の形で保存します。名前を付ける前の文書も、下書きとして自動で残ります。</p>',
  '<p>「ファイル」の「書き出す」で、HTML・Markdown・テキストのファイルにできます。「印刷」は、紙の形のまま印刷します。</p>',
  '<table><tbody><tr><td>キー</td><td>働き</td></tr><tr><td>Ctrl+B</td><td>太字</td></tr><tr><td>Ctrl+I</td><td>斜体</td></tr><tr><td>Ctrl+Z</td><td>元に戻す</td></tr><tr><td>Ctrl+F</td><td>検索</td></tr></tbody></table>',
  '<blockquote>FUTURE OS // ARCADIA-91 は、1991 年に作られたという設定の、ブラウザの中で動く OS です。この文書も、ブラウザの中の仮想ドライブに保存されます。</blockquote>',
  '<hr>',
  '<p style="text-align:right">アルカディア開発機構</p>',
].join('');
