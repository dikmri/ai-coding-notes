// 本棚の計算: ZIP の目録の読み取りと取り出し（deflate は DecompressionStream）、XML の読み取り、
// EPUB の container.xml・OPF・目次（nav.xhtml と toc.ncx）、本の中の相対パス、XHTML と CSS の消毒（許可の一覧）、
// しおりと読んだ位置の保存の形、ページの向き、並べ替えと探す、EPUB を作る（見本の本）。
// 画面には触らない（テストは tests/os-books.test.mjs）。
//
// 消毒の考え方: 本は外から来たファイルなので、許した要素と属性だけを残す。スクリプトにつながるもの（script、on〜 の属性、
// javascript: の URL）と、外への読み込み（http の画像・CSS・フォント、@import）は全部落とす。本の中の画像と CSS は
// 呼び出し側が渡す resource(パス) の URL（blob:）に置き換える。表示する側でも、スクリプトを許さない sandbox と CSP で二重に止める。
import { crc32, zipStore } from './workshop.mjs';

/* ---------- ZIP ---------- */
const MAX_ENTRY = 64 * 1024 * 1024; // 1 つのファイルを広げたときの上限（これより大きい本の部品は読まない）
const zipError = (why = '') => new Error(`ZIP の形ではないか、壊れています${why ? `（${why}）` : ''}。EPUB は ZIP の形のファイルです。`);
const u16 = (b, p) => b[p] | (b[p + 1] << 8);
const u32 = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
const utf8 = new TextDecoder('utf-8');
const readRange = async (blob, a, b) => new Uint8Array(await blob.slice(a, b).arrayBuffer());

// deflate-raw を広げる。書いてある大きさ（expected）を超えたら止める（圧縮爆弾を防ぐ）
export async function inflateRaw(data, expected, name = '') {
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const out = new Uint8Array(expected);
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (n + value.length > expected) { await reader.cancel().catch(() => {}); throw new Error(`「${name}」が、書いてある大きさより大きく広がりました。壊れているか、圧縮爆弾の可能性があります。`); }
      out.set(value, n); n += value.length;
    }
  } catch (e) {
    if (/大きさ/.test(e.message)) throw e;
    throw new Error(`「${name}」が壊れています（広げられません）。`);
  }
  return n === expected ? out : out.slice(0, n);
}

// ZIP の目録（ファイルの末尾にある中央の目録）を読み、名前から中身を取り出せる形にする。
// Blob の一部だけを読むので、大きな本でも開くのは速い
export async function openZip(blob) {
  const size = blob.size;
  if (size < 22) throw zipError();
  const tailLen = Math.min(size, 22 + 65535);
  const tail = await readRange(blob, size - tailLen, size);
  let e = -1;
  for (let p = tail.length - 22; p >= 0; p--) if (u32(tail, p) === 0x06054b50) { e = p; break; }
  if (e < 0) throw zipError();
  const count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
  if (cdOff === 0xffffffff || count === 0xffff) throw zipError('ZIP64 には対応していません');
  if (cdOff + cdSize > size) throw zipError('目録が途中で切れています');
  const cd = await readRange(blob, cdOff, cdOff + cdSize);
  const entries = new Map();
  for (let p = 0; p + 46 <= cd.length;) {
    if (u32(cd, p) !== 0x02014b50) throw zipError('目録が読めません');
    const flags = u16(cd, p + 8), method = u16(cd, p + 10), crc = u32(cd, p + 16), comp = u32(cd, p + 20), usize = u32(cd, p + 24);
    const nl = u16(cd, p + 28), xl = u16(cd, p + 30), cl = u16(cd, p + 32), off = u32(cd, p + 42);
    const name = utf8.decode(cd.subarray(p + 46, p + 46 + nl));
    if (!name.endsWith('/') && !entries.has(name)) entries.set(name, { name, flags, method, crc, comp, size: usize, off });
    p += 46 + nl + xl + cl;
  }
  const get = (name) => { const en = entries.get(name); if (!en) throw new Error(`本の中に「${name}」が見つかりません。`); return en; };
  async function bytes(name) {
    const en = get(name);
    if (en.flags & 1) throw new Error(`「${name}」には鍵がかかっています。`);
    if (en.size > MAX_ENTRY) throw new Error(`「${name}」は大きすぎます（${Math.round(en.size / 1048576)} MB）。`);
    const lh = await readRange(blob, en.off, en.off + 30);
    if (lh.length < 30 || u32(lh, 0) !== 0x04034b50) throw zipError(`「${name}」の見出しが読めません`);
    const start = en.off + 30 + u16(lh, 26) + u16(lh, 28);
    const data = await readRange(blob, start, start + en.comp);
    if (data.length < en.comp) throw zipError(`「${name}」が途中で切れています`);
    let out;
    if (en.method === 0) out = data;
    else if (en.method === 8) out = await inflateRaw(data, en.size, name);
    else throw new Error(`「${name}」は対応していない圧縮の形です（${en.method}）。`);
    if (out.length !== en.size || crc32(out) !== en.crc) throw new Error(`「${name}」が壊れています（CRC が合いません）。`);
    return out;
  }
  return {
    names: () => [...entries.keys()],
    has: (name) => entries.has(name),
    size: (name) => entries.get(name)?.size ?? 0,
    bytes,
    text: async (name) => decodeText(await bytes(name)),
    blob: async (name, type = '') => new Blob([await bytes(name)], { type }),
  };
}
// 文字に直す。UTF-16 の印（BOM）があれば UTF-16 として読む
export function decodeText(b) {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  return utf8.decode(b);
}

/* ---------- 本の中の相対パス ---------- */
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
// base（本の中のファイルの場所）から見た href を、本の中の場所と # の後ろに分ける。
// 外の住所（scheme 付き、//）、\ を含むもの、ZIP の外へ出るものは null
export function resolveHref(base, href) {
  const s = String(href ?? '').trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s.replace(/[\x00-\x20\x7f]/g, '')) || s.startsWith('//') || s.includes('\\')) return null;
  const hash = s.indexOf('#');
  let p = hash < 0 ? s : s.slice(0, hash);
  const fragment = hash < 0 ? '' : decode(s.slice(hash + 1));
  const q = p.indexOf('?'); if (q >= 0) p = p.slice(0, q);
  p = decode(p);
  if (!p) return { path: String(base), fragment };
  const out = p.startsWith('/') ? [] : String(base).split('/').slice(0, -1);
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!out.length) return null; out.pop(); } else out.push(seg);
  }
  return out.length ? { path: out.join('/'), fragment } : null;
}
// 本の外へのリンク（http・https・mailto）だけを、正しい形の住所にして返す。ほかは null
export function externalHref(href) {
  try { const u = new URL(String(href ?? '').trim()); return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}

/* ---------- XML（XHTML・OPF・目次）の読み取り ---------- */
// EPUB の XML は整った形のはずだが、HTML のような書き方（閉じ忘れ、<br>）でも止まらずに読む
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const NAMED = {
  lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', middot: '·', times: '×', divide: '÷', deg: '°', plusmn: '±',
  sect: '§', para: '¶', bull: '•', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c', zwj: '\u200d', lrm: '\u200e', rlm: '\u200f',
  shy: '\u00ad', yen: '¥', euro: '€', pound: '£', cent: '¢', iexcl: '¡', iquest: '¿', larr: '←', rarr: '→', uarr: '↑', darr: '↓', hearts: '♥',
};
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, body) => {
    if (body[0] === '#') {
      const n = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '\ufffd';
    }
    return NAMED[body] ?? NAMED[body.toLowerCase()] ?? m;
  });
}
export const localName = (name) => { const s = String(name); return s.slice(s.indexOf(':') + 1); };
// 戻り値: { type: 'doc', children }。要素は { type: 'el', name, attrs: { 名前: 値 }, children }、文字は { type: 'text', text }
export function parseXml(src) {
  src = String(src);
  const root = { type: 'doc', children: [] }, stack = [root], n = src.length;
  const top = () => stack[stack.length - 1];
  const text = (t) => { if (t) top().children.push({ type: 'text', text: t }); };
  let i = 0;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { text(decodeEntities(src.slice(i))); break; }
    if (lt > i) text(decodeEntities(src.slice(i, lt)));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt + 9); text(src.slice(lt + 9, e < 0 ? n : e)); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt + 2); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith('<!', lt)) { // DOCTYPE（[ ] の中の宣言ごと飛ばす）
      let j = lt + 2, depth = 0;
      for (; j < n; j++) { const c = src[j]; if (c === '[') depth++; else if (c === ']') depth--; else if (c === '>' && depth <= 0) break; }
      i = j + 1; continue;
    }
    if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt);
      const name = src.slice(lt + 2, e < 0 ? n : e).trim();
      let k = stack.length - 1;
      while (k > 0 && stack[k].name !== name && stack[k].name.toLowerCase() !== name.toLowerCase()) k--;
      if (k > 0) stack.length = k; // 閉じていない子も一緒に閉じる。合う要素が無ければ閉じタグを捨てる
      i = e < 0 ? n : e + 1; continue;
    }
    const m = /^[A-Za-z_][\w:.-]*/.exec(src.slice(lt + 1, lt + 201));
    if (!m) { text('<'); i = lt + 1; continue; }
    let j = lt + 1 + m[0].length, selfClose = false;
    const attrs = {};
    while (j < n) {
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === '>') { j++; break; }
      if (src.startsWith('/>', j)) { selfClose = true; j += 2; break; }
      const am = /^[^\s=/>]+/.exec(src.slice(j, j + 200));
      if (!am) { j++; continue; }
      const an = am[0]; j += an.length;
      while (j < n && /\s/.test(src[j])) j++;
      let val = '';
      if (src[j] === '=') {
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        const q = src[j];
        if (q === '"' || q === "'") { const e = src.indexOf(q, j + 1); val = src.slice(j + 1, e < 0 ? n : e); j = e < 0 ? n : e + 1; }
        else { const vm = /^[^\s>]*/.exec(src.slice(j)); val = vm[0]; j += val.length; }
      }
      if (!(an in attrs)) attrs[an] = decodeEntities(val);
    }
    const el = { type: 'el', name: m[0], attrs, children: [] };
    top().children.push(el);
    if (!selfClose && !VOID.has(m[0].toLowerCase())) stack.push(el);
    i = j;
  }
  return root;
}
export function textOf(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text;
  return (node.children || []).map(textOf).join('');
}
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
const isEl = (n, name) => n && n.type === 'el' && (!name || localName(n.name).toLowerCase() === name.toLowerCase());
function find(node, pred) {
  for (const c of node.children || []) { if (c.type !== 'el') continue; if (pred(c)) return c; const r = find(c, pred); if (r) return r; }
  return null;
}
function findAll(node, pred, out = []) {
  for (const c of node.children || []) { if (c.type !== 'el') continue; if (pred(c)) out.push(c); findAll(c, pred, out); }
  return out;
}
// 属性を名前で探す（接頭辞 opf: などが付いていてもよい）
function attr(el, name) {
  if (name in el.attrs) return el.attrs[name];
  for (const [k, v] of Object.entries(el.attrs)) if (localName(k).toLowerCase() === name.toLowerCase()) return v;
  return undefined;
}

/* ---------- EPUB: container.xml・OPF・目次 ---------- */
export function parseContainer(xml) {
  const rf = find(parseXml(xml), (e) => isEl(e, 'rootfile') && /opf|oebps/i.test(attr(e, 'media-type') || 'opf') && attr(e, 'full-path'));
  const p = rf && resolveHref('', attr(rf, 'full-path'));
  if (!p) throw new Error('container.xml に OPF（本の目録）の場所が書いてありません。');
  return p.path;
}

export function parseOpf(xml, opfPath) {
  const doc = parseXml(xml);
  const pkg = find(doc, (e) => isEl(e, 'package')) || doc;
  const meta = find(pkg, (e) => isEl(e, 'metadata')) || pkg;
  const texts = (name) => findAll(meta, (e) => isEl(e, name)).map((e) => squash(textOf(e))).filter(Boolean);
  const uid = attr(pkg, 'unique-identifier');
  const ids = findAll(meta, (e) => isEl(e, 'identifier'));
  const identifier = squash(textOf(ids.find((e) => uid && attr(e, 'id') === uid) || ids[0]));
  const manifest = [], byId = new Map(), types = {};
  for (const it of findAll(pkg, (e) => isEl(e, 'item'))) {
    const r = resolveHref(opfPath, attr(it, 'href'));
    if (!r) continue;
    const item = { id: attr(it, 'id') || '', path: r.path, type: (attr(it, 'media-type') || '').toLowerCase(), props: squash(attr(it, 'properties') || '').split(' ').filter(Boolean) };
    manifest.push(item); if (item.id) byId.set(item.id, item); types[item.path] = item.type;
  }
  const spineEl = find(pkg, (e) => isEl(e, 'spine'));
  const ppdRaw = spineEl ? (attr(spineEl, 'page-progression-direction') || '').toLowerCase() : '';
  const spine = spineEl ? findAll(spineEl, (e) => isEl(e, 'itemref')).map((ir) => ({ ir, item: byId.get(attr(ir, 'idref')) })).filter((x) => x.item)
    .map(({ ir, item }) => ({ id: item.id, path: item.path, type: item.type, linear: (attr(ir, 'linear') || '').toLowerCase() !== 'no' })) : [];
  let cover = manifest.find((m) => m.props.includes('cover-image'))?.path || null;
  if (!cover) {
    const cm = findAll(meta, (e) => isEl(e, 'meta') && (attr(e, 'name') || '').toLowerCase() === 'cover')[0];
    const it = cm && byId.get(attr(cm, 'content'));
    if (it) cover = it.path;
  }
  const ncxItem = (spineEl && byId.get(attr(spineEl, 'toc'))) || manifest.find((m) => m.type === 'application/x-dtbncx+xml');
  const creators = texts('creator');
  return {
    title: texts('title')[0] || '', creators, author: creators.join('、'), language: (texts('language')[0] || '').toLowerCase(), identifier,
    ppd: ppdRaw === 'rtl' || ppdRaw === 'ltr' ? ppdRaw : '', manifest, types, spine, cover,
    nav: manifest.find((m) => m.props.includes('nav'))?.path || null, ncx: ncxItem?.path || null,
  };
}

// EPUB 3 の目次（nav.xhtml の <nav epub:type="toc">）。入れ子の ol を、深さ付きの平らな並びにする
export function parseNav(xml, navPath) {
  const doc = parseXml(xml);
  const navs = findAll(doc, (e) => isEl(e, 'nav'));
  const nav = navs.find((e) => Object.entries(e.attrs).some(([k, v]) => localName(k) === 'type' && /(^|\s)toc(\s|$)/.test(v))) || navs[0];
  const out = [];
  const walkOl = (ol, depth) => {
    for (const li of ol.children.filter((c) => isEl(c, 'li'))) {
      const a = li.children.find((c) => isEl(c, 'a')), label = squash(textOf(a || li.children.find((c) => isEl(c, 'span')) || ''));
      const href = a ? attr(a, 'href') : null;
      const r = href ? resolveHref(navPath, href) : null;
      if (href && !r) { /* 本の外へのリンクは目次に入れない */ } else if (label) out.push({ label, path: r ? r.path : '', fragment: r ? r.fragment : '', depth });
      for (const sub of li.children.filter((c) => isEl(c, 'ol'))) walkOl(sub, depth + 1);
    }
  };
  const ol = nav && find(nav, (e) => isEl(e, 'ol'));
  if (ol) walkOl(ol, 0);
  return out;
}
// EPUB 2 の目次（toc.ncx の navPoint）
export function parseNcx(xml, ncxPath) {
  const map = find(parseXml(xml), (e) => isEl(e, 'navMap'));
  const out = [];
  const walk = (node, depth) => {
    for (const np of node.children.filter((c) => isEl(c, 'navPoint'))) {
      const label = squash(textOf(find(np, (e) => isEl(e, 'text')) || ''));
      const content = np.children.find((c) => isEl(c, 'content'));
      const r = content ? resolveHref(ncxPath, attr(content, 'src')) : null;
      if (label && r) out.push({ label, path: r.path, fragment: r.fragment, depth });
      walk(np, depth + 1);
    }
  };
  if (map) walk(map, 0);
  return out;
}

const FONT_OBFUSCATION = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];
// 開いた ZIP から、本の目録をまとめて読む
export async function readBook(zip) {
  if (!zip.has('META-INF/container.xml')) throw new Error('META-INF/container.xml が見つかりません。EPUB の形ではありません。');
  const opfPath = parseContainer(await zip.text('META-INF/container.xml'));
  if (!zip.has(opfPath)) throw new Error(`OPF（本の目録）「${opfPath}」が見つかりません。`);
  const o = parseOpf(await zip.text(opfPath), opfPath);
  let toc = [];
  if (o.nav && zip.has(o.nav)) toc = parseNav(await zip.text(o.nav), o.nav);
  if (!toc.length && o.ncx && zip.has(o.ncx)) toc = parseNcx(await zip.text(o.ncx), o.ncx);
  const spine = o.spine.filter((s) => zip.has(s.path)).map((s) => ({ ...s, size: zip.size(s.path) }));
  let cover = o.cover && zip.has(o.cover) && /^image\//.test(o.types[o.cover] || '') ? o.cover : null;
  if (!cover) cover = o.manifest.find((m) => /^image\//.test(m.type) && /cover/i.test(m.id + ' ' + m.path) && zip.has(m.path))?.path || null;
  let drm = zip.has('META-INF/rights.xml');
  if (!drm && zip.has('META-INF/encryption.xml')) {
    const enc = parseXml(await zip.text('META-INF/encryption.xml'));
    drm = findAll(enc, (e) => isEl(e, 'EncryptionMethod')).some((e) => !FONT_OBFUSCATION.includes(attr(e, 'Algorithm')));
  }
  return { title: o.title, author: o.author, creators: o.creators, language: o.language, identifier: o.identifier, ppd: o.ppd, spine, toc, cover, types: o.types, opfPath, drm };
}

/* ---------- XHTML の消毒 ---------- */
export const HTML_ELEMENTS = ['a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'big', 'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup',
  'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'i', 'img',
  'ins', 'kbd', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'section', 'small', 'span', 'strike', 'strong',
  'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'tt', 'u', 'ul', 'var', 'wbr'];
export const SVG_ELEMENTS = ['svg', 'g', 'defs', 'title', 'desc', 'image', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan',
  'linearGradient', 'radialGradient', 'stop', 'clipPath'];
export const MATH_ELEMENTS = ['math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mrow', 'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mtable', 'mtr', 'mtd',
  'mover', 'munder', 'munderover', 'mspace', 'mstyle', 'mpadded', 'mphantom', 'menclose', 'semantics', 'annotation'];
// 中身ごと捨てる要素（スクリプト、外の読み込み、入力、埋め込み、名前空間のすき間を使う手口に使われるもの）
const DROP = new Set(['script', 'noscript', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'param', 'form', 'input', 'button', 'select',
  'option', 'optgroup', 'textarea', 'datalist', 'output', 'audio', 'video', 'source', 'track', 'canvas', 'map', 'area', 'meta', 'base', 'head', 'dialog',
  'portal', 'slot', 'case', 'foreignobject', 'use', 'animate', 'animatemotion', 'animatetransform', 'set', 'feimage', 'mpath', 'filter', 'pattern', 'mask',
  'marker', 'symbol', 'annotation-xml', 'maction', 'mglyph', 'malignmark', 'xmp', 'plaintext', 'listing', 'noembed', 'noframes', 'iframe', 'math-xml']);
const HTML_SET = new Set(HTML_ELEMENTS), SVG_SET = new Set(SVG_ELEMENTS), MATH_SET = new Set(MATH_ELEMENTS);
const HTML_VOID = new Set(['br', 'col', 'hr', 'img', 'wbr']);
const GLOBAL_ATTRS = ['id', 'class', 'lang', 'dir', 'title', 'role', 'aria-label', 'aria-hidden', 'aria-describedby'];
const HTML_ATTRS = {
  img: ['alt', 'width', 'height'], ol: ['start', 'reversed', 'type'], li: ['value'], td: ['colspan', 'rowspan', 'headers', 'scope', 'abbr', 'align', 'valign'],
  th: ['colspan', 'rowspan', 'headers', 'scope', 'abbr', 'align', 'valign'], tr: ['align', 'valign'], col: ['span', 'width', 'align'], colgroup: ['span', 'width', 'align'],
  table: ['border'], time: ['datetime'], del: ['datetime'], ins: ['datetime'], details: ['open'], p: ['align'], div: ['align'],
  h1: ['align'], h2: ['align'], h3: ['align'], h4: ['align'], h5: ['align'], h6: ['align'],
};
export const SVG_ATTRS = ['viewBox', 'preserveAspectRatio', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'transform',
  'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
  'clip-path', 'clip-rule', 'fx', 'fy', 'dx', 'dy'];
export const MATH_ATTRS = ['mathvariant', 'display', 'displaystyle', 'scriptlevel', 'stretchy', 'fence', 'separator', 'lspace', 'rspace', 'linethickness',
  'accent', 'accentunder', 'columnalign', 'rowalign', 'notation', 'form', 'largeop', 'movablelimits', 'symmetric', 'width', 'height', 'depth'];
// 表示する側の Sanitizer API に渡す属性の一覧（消毒した結果に出てくる属性の全部）
export const ALL_ATTRS = [...new Set([...GLOBAL_ATTRS, ...Object.values(HTML_ATTRS).flat(), ...SVG_ATTRS, ...MATH_ATTRS, 'style', 'href', 'src', 'data-bk-href', 'data-bk-ext'])];

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');
const unsafeValue = (v) => /javascript:|vbscript:|expression\s*\(/i.test(String(v).replace(/[\x00-\x20\x7f]/g, ''));

// text: XHTML の文字。opts: { path: 本の中の場所, resource(本の中のパス) → URL か null }
// 戻り値: { html: body の中身（消毒済みの HTML）, lang, dir, htmlClass, bodyClass, title, styles: [CSS の場所], inlineCss: [消毒済みの CSS] }
export function sanitizeXhtml(text, { path, resource }) {
  const doc = parseXml(text);
  const htmlEl = find(doc, (e) => isEl(e, 'html')) || doc;
  const body = find(htmlEl, (e) => isEl(e, 'body')) || htmlEl;
  const headEl = find(htmlEl, (e) => isEl(e, 'head'));
  const styles = [], inlineCss = [];
  const cssOpts = { path, resource };
  // head と body の CSS（link と style）を集める
  for (const el of findAll(htmlEl, (e) => isEl(e, 'link') || isEl(e, 'style'))) {
    if (isEl(el, 'style')) { const css = sanitizeCss(textOf(el), cssOpts); if (css) inlineCss.push(css); continue; }
    const rel = ` ${squash(attr(el, 'rel') || '').toLowerCase()} `;
    if (!rel.includes(' stylesheet ') || rel.includes(' alternate ')) continue;
    const r = resolveHref(path, attr(el, 'href'));
    if (r && !styles.includes(r.path)) styles.push(r.path);
  }
  const out = [];
  const serialize = (node, ns) => {
    if (node.type === 'text') { out.push(escText(node.text)); return; }
    if (node.type !== 'el') return;
    const raw = localName(node.name), lname = raw.toLowerCase();
    if (DROP.has(lname) || lname === 'style' || lname === 'link' || (lname === 'title' && ns === 'html')) return;
    let ns2 = ns;
    if (lname === 'svg') ns2 = 'svg'; else if (lname === 'math') ns2 = 'math';
    const kids = () => node.children.forEach((c) => serialize(c, ns2));
    let name, allowed;
    if (ns2 === 'svg') {
      name = SVG_ELEMENTS.find((s) => s.toLowerCase() === lname);
      if (!name) { if (lname === 'a' || lname === 'switch') kids(); return; } // svg の a は中身だけ残す。ほかの知らない要素は捨てる
      allowed = SVG_ATTRS;
    } else if (ns2 === 'math') {
      if (!MATH_SET.has(lname)) { if (lname === 'mrow') kids(); return; }
      name = lname; allowed = MATH_ATTRS;
    } else {
      if (!HTML_SET.has(lname)) { kids(); return; } // 知らない要素（font、center、epub:switch など）は中身だけ残す
      name = lname; allowed = HTML_ATTRS[lname] || [];
    }
    const attrs = [];
    const has = (k) => attrs.some(([a]) => a === k);
    for (const [k0, v] of Object.entries(node.attrs)) {
      const k = ns2 === 'svg' ? localName(k0) : localName(k0).toLowerCase();
      const full = k0.toLowerCase();
      if (full.startsWith('xmlns')) continue;
      if (full === 'xml:lang') { if (!('lang' in node.attrs)) attrs.push(['lang', v]); continue; }
      if (k === 'style') { const st = sanitizeStyleAttr(v, cssOpts); if (st) attrs.push(['style', st]); continue; }
      if ((k === 'href' && (name === 'image' || name === 'a')) || (k === 'src' && name === 'img')) continue; // 下で扱う
      if (k0.includes(':') && full !== 'xml:lang') continue; // epub:type などの接頭辞付きは捨てる
      if (!GLOBAL_ATTRS.includes(k) && !allowed.includes(k)) continue;
      if (unsafeValue(v)) continue;
      if (ns2 === 'svg' && /url\s*\(/i.test(v) && !/^\s*url\(\s*['"]?#[^)'"]*['"]?\s*\)\s*$/i.test(v)) continue; // 外を指す url() は落とす
      if (!has(k)) attrs.push([k, v]);
    }
    if (name === 'img' || name === 'image') {
      const src = name === 'img' ? attr(node, 'src') : (node.attrs.href ?? node.attrs['xlink:href'] ?? attr(node, 'href'));
      const r = resolveHref(path, src);
      const url = r && resource(r.path);
      if (!url) return; // 本の外の画像・見つからない画像は要素ごと落とす
      attrs.unshift([name === 'img' ? 'src' : 'href', url]);
    }
    if (name === 'a') {
      const href = attr(node, 'href');
      if (href != null) {
        const r = resolveHref(path, href), ext = r ? null : externalHref(href);
        if (r) attrs.unshift(['href', '#'], ['data-bk-href', r.path + (r.fragment ? '#' + r.fragment : '')]);
        else if (ext) attrs.unshift(['href', '#'], ['data-bk-ext', ext]);
      }
    }
    out.push(`<${name}${attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')}>`);
    if (ns2 === 'html' && HTML_VOID.has(name)) return;
    kids();
    out.push(`</${name}>`);
  };
  body.children.forEach((c) => serialize(c, 'html'));
  const pick = (el, k) => (el && el.type === 'el' ? squash(attr(el, k) || '') : '');
  return {
    html: out.join(''),
    lang: pick(htmlEl, 'lang') || pick(body, 'lang'), dir: /^(rtl|ltr)$/i.test(pick(htmlEl, 'dir') || pick(body, 'dir')) ? (pick(htmlEl, 'dir') || pick(body, 'dir')).toLowerCase() : '',
    htmlClass: pick(htmlEl, 'class'), bodyClass: pick(body, 'class'),
    title: headEl ? squash(textOf(find(headEl, (e) => isEl(e, 'title')) || '')) : '',
    styles, inlineCss,
  };
}

/* ---------- CSS の消毒 ---------- */
// 文字列（" '）とかっこの深さを見ながら、コメントを除いた CSS を、規則（{ } の塊）と @ の文に分ける
function cssItems(src) {
  const items = [];
  let i = 0, start = 0, depth = 0, buf = '';
  const n = src.length;
  let prelude = null;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); buf += ' '; i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < n; j++) { if (src[j] === '\\') { j++; continue; } if (src[j] === c || src[j] === '\n') break; }
      buf += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '{') {
      if (depth === 0) { prelude = buf; buf = ''; } else buf += c;
      depth++; i++; continue;
    }
    if (c === '}') {
      if (depth === 0) { i++; continue; }
      depth--;
      if (depth === 0) { items.push({ prelude: prelude.trim(), block: buf }); buf = ''; prelude = null; } else buf += c;
      i++; continue;
    }
    if (c === ';' && depth === 0) { if (buf.trim()) items.push({ prelude: buf.trim(), block: null }); buf = ''; i++; continue; }
    buf += c; i++;
  }
  if (depth > 0 && prelude != null) items.push({ prelude: prelude.trim(), block: buf }); // 閉じ忘れの最後の塊
  else if (buf.trim()) items.push({ prelude: buf.trim(), block: null });
  void start;
  return items;
}
// 宣言の並びを ; で分ける（文字列とかっこの中の ; は分けない）
function splitDecls(block) {
  const out = [];
  let buf = '', paren = 0;
  for (let i = 0; i < block.length; i++) {
    const c = block[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < block.length; j++) { if (block[j] === '\\') { j++; continue; } if (block[j] === c) break; }
      buf += block.slice(i, j + 1); i = j; continue;
    }
    if (c === '(') paren++; else if (c === ')') paren = Math.max(0, paren - 1);
    if (c === ';' && paren === 0) { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  out.push(buf);
  return out.map((d) => d.trim()).filter(Boolean);
}
const outsideStrings = (s) => s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
const RENAME = {
  '-epub-writing-mode': 'writing-mode', '-webkit-writing-mode': 'writing-mode', '-epub-text-orientation': 'text-orientation', '-webkit-text-orientation': 'text-orientation',
  '-epub-text-emphasis-style': 'text-emphasis-style', '-epub-text-emphasis-color': 'text-emphasis-color', '-epub-text-emphasis-position': 'text-emphasis-position',
  '-epub-text-emphasis': 'text-emphasis', '-epub-hyphens': 'hyphens', '-epub-word-break': 'word-break', '-epub-line-break': 'line-break',
};
const SAFE_DATA = /^data:(image\/(png|jpeg|gif|webp|svg\+xml)|font\/[a-z0-9.+-]+|application\/(font-woff2?|x-font-[a-z0-9]+|vnd\.ms-opentype))[;,]/i;
// 1 つの宣言を消毒する。落とすときは null
function cleanDecl(decl, { path, resource }) {
  const colon = decl.indexOf(':');
  if (colon <= 0) return null;
  let prop = decl.slice(0, colon).trim().toLowerCase();
  let value = decl.slice(colon + 1).trim();
  if (!/^-?[a-z][a-z0-9-]*$/.test(prop) || !value) return null;
  if (['behavior', '-moz-binding', 'binding', '-ms-behavior'].includes(prop)) return null;
  if (prop === '-epub-text-combine' || prop === '-webkit-text-combine' || prop === '-epub-text-combine-horizontal') { prop = 'text-combine-upright'; value = /horizontal|all/i.test(value) ? 'all' : 'none'; }
  prop = RENAME[prop] || prop;
  const bare = outsideStrings(value);
  if (bare.includes('\\')) return null; // 文字列の外の \ は、url や import を隠す書き方に使われる
  if (unsafeValue(value) || /(image-set|image|src|cross-fade|element|paint)\s*\(/i.test(bare.replace(/url\s*\(/gi, ''))) return null;
  if (prop === 'position' && /fixed|sticky/i.test(value)) return null;
  // url() を本の中の URL に置き換える。1 つでも外を指していれば宣言ごと落とす
  let bad = false;
  value = value.replace(/url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)'"\s]*))\s*\)/gi, (m, a, b, c) => {
    const u = (a ?? b ?? c ?? '').trim();
    if (SAFE_DATA.test(u) && !/["'()\\<>]/.test(u)) return `url("${u}")`;
    const r = resolveHref(path, u);
    const url = r && resource(r.path);
    if (!url) { bad = true; return 'url("")'; }
    return `url("${String(url).replace(/["\\\n]/g, '')}")`;
  });
  if (bad || /url\s*\(/i.test(outsideStrings(value).replace(/url\(""\)/gi, ''))) return null;
  return `${prop}: ${value}`;
}
function cleanDecls(block, opts) { return splitDecls(block).map((d) => cleanDecl(d, opts)).filter(Boolean); }
function cleanRules(src, opts) {
  const out = [];
  for (const { prelude, block } of cssItems(src)) {
    if (prelude.startsWith('@')) {
      const m = /^@([a-z-]+)/i.exec(prelude);
      const name = m ? m[1].toLowerCase() : '';
      if (!m || prelude.includes('\\')) continue;
      const rest = prelude.slice(m[0].length).trim();
      if (name === 'namespace' && block == null) { if (/^([a-z_][\w-]*\s+)?(url\()?\s*"[^"\\]*"\s*\)?$/i.test(rest)) out.push(`@namespace ${rest};`); continue; }
      if (block == null) continue; // @import、@charset などの文は捨てる
      if (/url\s*\(|\/\//i.test(outsideStrings(rest))) continue;
      if (name === 'media' || name === 'supports') { const inner = cleanRules(block, opts); if (inner) out.push(`@${name} ${rest} {\n${inner}\n}`); }
      else if (name === 'font-face') { const d = cleanDecls(block, opts); if (d.length) out.push(`@font-face { ${d.map((x) => x + ';').join(' ')} }`); }
      else if (name === 'keyframes' || name === '-webkit-keyframes') { const inner = cleanRules(block, opts); if (inner) out.push(`@${name} ${rest} {\n${inner}\n}`); }
      continue; // @page などほかの塊は捨てる
    }
    if (block == null) continue;
    const sel = squash(prelude);
    if (!sel || /[<>]\s*\/|<\//.test(sel)) continue;
    const d = cleanDecls(block, opts);
    if (d.length) out.push(`${sel} { ${d.map((x) => x + ';').join(' ')} }`);
  }
  return out.join('\n');
}
export function sanitizeCss(css, opts) { return cleanRules(String(css ?? ''), opts); }
export function sanitizeStyleAttr(style, opts) { return cleanDecls(String(style ?? ''), opts).join('; '); }

/* ---------- しおりと読んだ位置（/システム/本棚.json） ---------- */
export const DEFAULT_PREFS = Object.freeze({ view: 'grid', sort: 'recent', fontSize: 100, lineHeight: 1.8, margin: 'mid', font: 'mincho', theme: 'white', bookCss: true, flow: 'auto' });
export const LIMITS = Object.freeze({ fontSize: [70, 200], lineHeight: [1.2, 2.6] });
export const CHOICES = Object.freeze({ view: ['grid', 'list'], sort: ['recent', 'title', 'author'], margin: ['narrow', 'mid', 'wide'], font: ['mincho', 'gothic'], theme: ['white', 'cream', 'night'], flow: ['auto', 'horizontal', 'vertical'] });
const MAX_MARKS = 200, MAX_BOOKS = 3000;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const okPath = (p) => typeof p === 'string' && p.length > 0 && p.length <= 1000;
export const validMark = (m) => !!m && typeof m === 'object' && typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 64 && okPath(m.path) && finite(m.progress);
const cleanMark = (m) => ({ id: m.id, path: m.path, progress: clamp01(m.progress), label: typeof m.label === 'string' ? m.label.slice(0, 120) : '', time: finite(m.time) ? m.time : 0 });
export function normalizePrefs(p) {
  const src = p && typeof p === 'object' ? p : {}, out = { ...DEFAULT_PREFS };
  for (const [k, list] of Object.entries(CHOICES)) if (list.includes(src[k])) out[k] = src[k];
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) if (finite(src[k])) out[k] = Math.min(hi, Math.max(lo, src[k]));
  if (typeof src.bookCss === 'boolean') out.bookCss = src.bookCss;
  return out;
}
export function normalizeState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const books = {};
  const entries = src.books && typeof src.books === 'object' ? Object.entries(src.books).slice(0, MAX_BOOKS) : [];
  for (const [key, b] of entries) {
    if (!b || typeof b !== 'object' || typeof key !== 'string' || key.length > 2000) continue;
    const pos = b.pos && okPath(b.pos.path) && finite(b.pos.progress) ? { path: b.pos.path, progress: clamp01(b.pos.progress) } : null;
    const marks = Array.isArray(b.marks) ? b.marks.filter(validMark).slice(0, MAX_MARKS).map(cleanMark) : [];
    books[key] = { pos, marks, last: finite(b.last) ? b.last : 0 };
  }
  return { version: 1, prefs: normalizePrefs(src.prefs), books };
}
// しおりを足す。同じ場所のしおりは二重にしない。本の中の順（order: 章の場所の並び）に並べる
export function addMark(marks, mark, order = []) {
  if (!validMark(mark)) return marks;
  if (marks.some((m) => m.path === mark.path && Math.abs(m.progress - mark.progress) < 1e-6)) return marks;
  const idx = (p) => { const i = order.indexOf(p); return i < 0 ? order.length : i; };
  return [...marks, cleanMark(mark)].sort((a, b) => idx(a.path) - idx(b.path) || a.progress - b.progress).slice(0, MAX_MARKS);
}
export const removeMark = (marks, id) => marks.filter((m) => m.id !== id);
// 本ごとの記録の鍵。識別子があれば題名と組みにし、無ければファイルの場所
export const bookKey = (meta, path) => (meta && meta.identifier ? `id:${meta.identifier}|${meta.title || ''}` : `path:${path}`);

/* ---------- ページ ---------- */
// キーから、ページの動きを決める。rtl: 右から左へ進む本（縦書きなど）では ← が次
export function pageKeyAction(key, rtl, { shift = false, ctrl = false, alt = false, meta = false } = {}) {
  if (ctrl || alt || meta) return null;
  switch (key) {
    case 'ArrowRight': return rtl ? 'prev' : 'next';
    case 'ArrowLeft': return rtl ? 'next' : 'prev';
    case 'ArrowDown': case 'PageDown': return 'next';
    case 'ArrowUp': case 'PageUp': return 'prev';
    case ' ': case 'Spacebar': return shift ? 'prev' : 'next';
    case 'Home': return 'first';
    case 'End': return 'last';
    default: return null;
  }
}
// ページの上を押したとき: 進む向きの側の半分なら次、反対なら前
export const clickAction = (x, width, rtl) => (x < width / 2 ? (rtl ? 'next' : 'prev') : (rtl ? 'prev' : 'next'));
// 章の中の割合（0〜1。最初のページが 0、最後のページが 1）とページ番号
export const progressAt = (page, pages) => (pages <= 1 ? 0 : clamp01(page / (pages - 1)));
export const pageAt = (progress, pages) => (pages <= 1 ? 0 : Math.min(pages - 1, Math.max(0, Math.round((finite(progress) ? progress : 0) * (pages - 1)))));
// 本全体の進み具合（0〜1）。章ごとの重み（文字の量に近い、ファイルの大きさ）で計る
export function bookProgress(weights, index, frac) {
  const total = weights.reduce((s, w) => s + w, 0);
  if (!total || index < 0 || index >= weights.length) return 0;
  const before = weights.slice(0, index).reduce((s, w) => s + w, 0);
  return clamp01((before + weights[index] * clamp01(frac)) / total);
}

/* ---------- 並べ替えと探す ---------- */
const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
// 探すときの文字: 全角と半角をそろえ、大文字を小文字に、カタカナをひらがなにする
export const searchKey = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const byTitle = (a, b) => collator.compare(String(a.title ?? '').normalize('NFKC'), String(b.title ?? '').normalize('NFKC'));
export function sortBooks(list, by) {
  const arr = [...list];
  if (by === 'author') return arr.sort((a, b) => collator.compare(String(a.author ?? '').normalize('NFKC'), String(b.author ?? '').normalize('NFKC')) || byTitle(a, b));
  if (by === 'recent') return arr.sort((a, b) => (b.last || 0) - (a.last || 0) || byTitle(a, b));
  return arr.sort(byTitle);
}
export function filterBooks(list, query) {
  const q = searchKey(query).trim();
  if (!q) return [...list];
  const words = q.split(/\s+/);
  return list.filter((b) => { const hay = searchKey(`${b.title} ${b.author} ${b.path}`); return words.every((w) => hay.includes(w)); });
}

/* ---------- EPUB を作る（見本の本） ---------- */
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// book: { id, title, author, lang, ppd: 'ltr'|'rtl', css, cover: { href, type, data }, images: [{ href, type, data }], chapters: [{ id, title, body }] }
// deflate(Uint8Array) → Promise<Uint8Array>（deflate-raw）を渡すと、mimetype 以外を縮める
export async function makeEpub(book, { deflate = null, date = new Date('2026-11-19T00:00:00Z') } = {}) {
  const lang = book.lang || 'ja', vertical = book.ppd === 'rtl';
  const files = [];
  const add = (name, text) => files.push({ name, data: typeof text === 'string' ? new TextEncoder().encode(text) : text });
  add('mimetype', 'application/epub+zip');
  add('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n`);
  const imgs = [book.cover, ...(book.images || [])].filter(Boolean);
  const page = (title, body, cls = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xmlEsc(lang)}" lang="${xmlEsc(lang)}"${cls ? ` class="${cls}"` : ''}>\n<head>\n<meta charset="UTF-8"/>\n<title>${xmlEsc(title)}</title>\n<link rel="stylesheet" type="text/css" href="../style.css"/>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${xmlEsc(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${xmlEsc(book.id)}</dc:identifier>
<dc:title>${xmlEsc(book.title)}</dc:title>
<dc:creator>${xmlEsc(book.author)}</dc:creator>
<dc:language>${xmlEsc(lang)}</dc:language>
<meta property="dcterms:modified">${date.toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
${book.cover ? '<meta name="cover" content="cover-image"/>\n' : ''}</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${imgs.map((im, i) => `<item id="${im === book.cover ? 'cover-image' : 'img' + i}" href="${xmlEsc(im.href)}" media-type="${xmlEsc(im.type)}"${im === book.cover ? ' properties="cover-image"' : ''}/>`).join('\n')}
${book.chapters.map((c) => `<item id="${xmlEsc(c.id)}" href="text/${xmlEsc(c.id)}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine toc="ncx" page-progression-direction="${vertical ? 'rtl' : 'ltr'}">
${book.chapters.map((c) => `<itemref idref="${xmlEsc(c.id)}"/>`).join('\n')}
</spine>
</package>
`;
  add('OEBPS/content.opf', opf);
  add('OEBPS/nav.xhtml', page('目次', `<nav epub:type="toc" id="toc">\n<h1>目次</h1>\n<ol>\n${book.chapters.map((c) => `<li><a href="text/${xmlEsc(c.id)}.xhtml">${xmlEsc(c.title)}</a></li>`).join('\n')}\n</ol>\n</nav>`).replace('href="../style.css"', 'href="style.css"'));
  add('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n<head><meta name="dtb:uid" content="${xmlEsc(book.id)}"/></head>\n<docTitle><text>${xmlEsc(book.title)}</text></docTitle>\n<navMap>\n${book.chapters.map((c, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xmlEsc(c.title)}</text></navLabel><content src="text/${xmlEsc(c.id)}.xhtml"/></navPoint>`).join('\n')}\n</navMap>\n</ncx>\n`);
  add('OEBPS/style.css', book.css || '');
  for (const im of imgs) add('OEBPS/' + im.href, im.data);
  for (const c of book.chapters) add(`OEBPS/text/${c.id}.xhtml`, page(c.title, c.body, vertical ? 'vrtl' : ''));
  if (deflate) for (const f of files) if (f.name !== 'mimetype') f.deflated = await deflate(f.data);
  return zipStore(files, date);
}
