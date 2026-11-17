// コードの作業場の計算: プロジェクトの中の住所、色分けの字句（JavaScript・CSS・HTML）、import の書き換え、
// プレビューの文書（HTML・CSS・モジュール・画像を1つの srcdoc にまとめる）、ZIP、ひな形。画面には触らない（テストは tests/os-workshop.test.mjs）。
//
// プレビューは allow-same-origin を付けない sandbox の iframe（不透明な origin）で動かす。Service Worker はその iframe を受け持てないので、
// 仮想ドライブのファイルは OS の側で Data URL にし、モジュールは import map で「vfs:///パス」から Data URL へ結び付ける。

const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
export const dirOf = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
function normalizePath(p) {
  const out = [];
  for (const seg of p.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') { if (!out.length) return null; out.pop(); } else out.push(seg); }
  return '/' + out.join('/');
}
const inside = (root, p) => p === root || p.startsWith(root.replace(/\/$/, '') + '/');

// プロジェクト root の中で、fromFile から見た spec の住所を解く。外の住所（scheme 付き、//）とプロジェクトの外へ出るものは null
export function resolveIn(root, fromFile, spec) {
  const s = String(spec).trim();
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//') || s.startsWith('#')) return null;
  const clean = decode(s.replace(/[?#].*$/, ''));
  const p = normalizePath(clean.startsWith('/') ? root + clean : dirOf(fromFile) + '/' + clean);
  return p && inside(root, p) ? p : null;
}
const isRelativeSpec = (s) => /^(\.{1,2}\/|\/(?!\/))/.test(s);

/* ---------- 色分けの字句 ---------- */
const JS_KEYWORDS = new Set('import export from as const let var function return if else for while do switch case break continue new class extends super this typeof instanceof in of await async yield try catch finally throw default delete void null undefined true false static get set debugger with'.split(' '));
const REGEX_AFTER_WORD = new Set('return typeof instanceof in of new delete void throw case do else yield await'.split(' '));
const ID_START = /[A-Za-z_$\u00A0-\uFFFF]/, ID_PART = /[\w$\u00A0-\uFFFF]/;
const NUM_RE = /^(?:0[xX][0-9a-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?)/;

// JavaScript を字句に分ける。type: comment / string / regexp / number / keyword / ident / punct
export function tokenizeJS(src, offset = 0) {
  const out = []; let i = 0, prev = null;
  const push = (type, s, e) => { const t = { type, start: s + offset, end: e + offset }; out.push(t); if (type !== 'comment') prev = { type, text: src.slice(s, e) }; };
  const regexAllowed = () => !prev || (prev.type === 'punct' && !/^[)\]}]$/.test(prev.text)) || (prev.type === 'keyword' && REGEX_AFTER_WORD.has(prev.text));
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e; push('comment', i, end); i = end; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; push('comment', i, end); i = end; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1; push('string', i, Math.min(j + 1, src.length)); i = j + 1; continue; }
    if (c === '`') {
      let j = i + 1, depth = 0;
      while (j < src.length) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (depth === 0 && ch === '`') break;
        if (ch === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
        if (depth > 0 && ch === '{') depth++;
        else if (depth > 0 && ch === '}') depth--;
        j++;
      }
      push('string', i, Math.min(j + 1, src.length)); i = j + 1; continue;
    }
    if (c === '/' && regexAllowed()) {
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== '\n') { const ch = src[j]; if (ch === '\\') { j += 2; continue; } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break; j++; }
      if (src[j] === '/') { j++; while (j < src.length && /[a-z]/i.test(src[j])) j++; push('regexp', i, j); i = j; continue; }
    }
    const num = /\d|\./.test(c) && (c !== '.' || /\d/.test(d)) ? NUM_RE.exec(src.slice(i)) : null;
    if (num) { push('number', i, i + num[0].length); i += num[0].length; continue; }
    if (ID_START.test(c)) { let j = i + 1; while (j < src.length && ID_PART.test(src[j])) j++; const w = src.slice(i, j); push(JS_KEYWORDS.has(w) && !(prev && prev.text === '.') ? 'keyword' : 'ident', i, j); i = j; continue; }
    push('punct', i, i + 1); i++;
  }
  return out;
}

// CSS を字句に分ける。type: comment / string / selector / atrule / property / number / value / punct
export function tokenizeCSS(src, offset = 0) {
  const out = []; let i = 0, depth = 0;
  const push = (type, s, e) => { if (e > s) out.push({ type, start: s + offset, end: e + offset }); };
  const trimPush = (type, s, e) => { while (s < e && /\s/.test(src[s])) s++; while (e > s && /\s/.test(src[e - 1])) e--; push(type, s, e); };
  // 値の中の字句（数・色・文字列・コメント・語）
  const value = (s, e) => {
    let j = s;
    while (j < e) {
      const ch = src[j];
      if (/\s|[,()/]/.test(ch)) { j++; continue; }
      if (ch === '/' && src[j + 1] === '*') { const k = src.indexOf('*/', j + 2); const end = k < 0 ? e : Math.min(k + 2, e); push('comment', j, end); j = end; continue; }
      if (ch === '"' || ch === "'") { let k = j + 1; while (k < e && src[k] !== ch) k += src[k] === '\\' ? 2 : 1; push('string', j, Math.min(k + 1, e)); j = k + 1; continue; }
      const m = /^(#[0-9a-fA-F]{3,8}\b|[+-]?(?:\d+\.?\d*|\.\d+)(?:[a-zA-Z%]+)?)/.exec(src.slice(j, e));
      if (m) { push('number', j, j + m[0].length); j += m[0].length; continue; }
      let k = j; while (k < e && !/[\s,()/;]/.test(src[k])) k++; push('value', j, Math.max(k, j + 1)); j = Math.max(k, j + 1);
    }
  };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; push('comment', i, end); i = end; continue; }
    if (c === '}') { push('punct', i, i + 1); depth = Math.max(0, depth - 1); i++; continue; }
    // ; { } のどれが先に来るかで、宣言か、入れ子の規則（セレクタ）かを決める
    let j = i; while (j < src.length && !';{}'.includes(src[j]) && !(src[j] === '/' && src[j + 1] === '*')) { if (src[j] === '"' || src[j] === "'") { const q = src[j]; j++; while (j < src.length && src[j] !== q) j++; } j++; }
    const stop = src[j];
    if (stop === '/') { const head = src.slice(i, j); if (!head.trim()) { i = j; continue; } }
    if (stop === '{' || depth === 0) {
      if (c === '@') { let k = i + 1; while (k < j && /[\w-]/.test(src[k])) k++; push('atrule', i, k); value(k, j); } else trimPush('selector', i, j);
      if (stop === '{') { push('punct', j, j + 1); depth++; i = j + 1; } else i = j + (stop === ';' ? 1 : 0);
      if (stop === undefined) break;
      continue;
    }
    const colon = src.indexOf(':', i);
    if (colon >= 0 && colon < j) { trimPush('property', i, colon); push('punct', colon, colon + 1); value(colon + 1, j); } else value(i, j);
    if (stop === ';') push('punct', j, j + 1);
    i = stop === ';' ? j + 1 : j;
  }
  return out;
}

// HTML を字句に分ける。type: comment / doctype / tag / attr / string（属性の値）。<style> と <script> の中は CSS と JavaScript の字句
export function tokenizeHTML(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); const end = e < 0 ? src.length : e + 3; out.push({ type: 'comment', start: lt, end }); i = end; continue; }
    if (/^<!doctype/i.test(src.slice(lt, lt + 9))) { const e = src.indexOf('>', lt); const end = e < 0 ? src.length : e + 1; out.push({ type: 'doctype', start: lt, end }); i = end; continue; }
    const m = /^<\/?([a-zA-Z][\w:-]*)/.exec(src.slice(lt));
    if (!m) { i = lt + 1; continue; }
    out.push({ type: 'tag', start: lt, end: lt + m[0].length });
    const name = m[1].toLowerCase(), closing = m[0][1] === '/';
    let j = lt + m[0].length;
    while (j < src.length && src[j] !== '>') {
      if (/\s|\//.test(src[j])) { j++; continue; }
      const a = /^[^\s"'>/=]+/.exec(src.slice(j));
      if (!a) { j++; continue; }
      out.push({ type: 'attr', start: j, end: j + a[0].length }); j += a[0].length;
      while (/\s/.test(src[j] || '')) j++;
      if (src[j] === '=') {
        j++; while (/\s/.test(src[j] || '')) j++;
        if (src[j] === '"' || src[j] === "'") { const q = src[j], e = src.indexOf(q, j + 1); const end = e < 0 ? src.length : e + 1; out.push({ type: 'string', start: j, end }); j = end; }
        else { const v = /^[^\s>]+/.exec(src.slice(j)); if (v) { out.push({ type: 'string', start: j, end: j + v[0].length }); j += v[0].length; } }
      }
    }
    if (j < src.length) out.push({ type: 'tag', start: src[j - 1] === '/' ? j - 1 : j, end: j + 1 });
    i = j + 1;
    if (!closing && (name === 'style' || name === 'script')) {
      const close = src.toLowerCase().indexOf(`</${name}`, i);
      const end = close < 0 ? src.length : close;
      out.push(...(name === 'style' ? tokenizeCSS(src.slice(i, end), i) : tokenizeJS(src.slice(i, end), i)));
      i = end;
    }
  }
  return out;
}
export function tokenize(src, lang) {
  if (lang === 'css') return tokenizeCSS(src);
  if (lang === 'html') return tokenizeHTML(src);
  if (lang === 'js' || lang === 'json') return tokenizeJS(src);
  return [];
}
export const langOf = (path) => ({ '.html': 'html', '.htm': 'html', '.css': 'css', '.js': 'js', '.mjs': 'js', '.json': 'json', '.svg': 'html' }[(/\.[^./]+$/.exec(path) || [''])[0].toLowerCase()] || 'text');

/* ---------- import の書き換え ---------- */
// 相対の住所（./ ../ /）の import・export from・import() を vfs:///パス にし、依存のパスを集める。文字列やコメントの中は字句で見分けて触らない
export function rewriteImports(src, fromFile, root) {
  const toks = tokenizeJS(src).filter((t) => t.type !== 'comment');
  const text = (t) => src.slice(t.start, t.end);
  const edits = [], deps = new Set();
  const take = (t) => {
    const q = src[t.start];
    if (q !== '"' && q !== "'") return;
    const spec = src.slice(t.start + 1, t.end - 1);
    if (!isRelativeSpec(spec)) return;
    const p = resolveIn(root, fromFile, spec);
    if (!p) return;
    deps.add(p); edits.push([t.start, t.end, q + 'vfs://' + p + q]);
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k], n = toks[k + 1];
    if (!n) break;
    const w = text(t);
    if (w === 'import' && t.type === 'keyword') {
      if (n.type === 'string') take(n);
      else if (text(n) === '(' && toks[k + 2]?.type === 'string' && text(toks[k + 3] || {}) !== '+') take(toks[k + 2]);
    } else if (w === 'from' && n.type === 'string' && !(k > 0 && text(toks[k - 1]) === '.')) take(n);
  }
  let code = src;
  for (const [s, e, r] of edits.sort((a, b) => b[0] - a[0])) code = code.slice(0, s) + r + code.slice(e);
  return { code, deps: [...deps] };
}

/* ---------- プレビューの文書 ---------- */
const MIME = { '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.txt': 'text/plain', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
export const mimeOf = (p) => MIME[(/\.[^./]+$/.exec(p) || [''])[0].toLowerCase()] || 'application/octet-stream';
const dataText = (type, text) => `data:${type};charset=utf-8,${encodeURIComponent(text)}`;
const attrRe = (name) => new RegExp(`(\\s${name}\\s*=\\s*)("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
const getAttr = (attrs, name) => { const m = attrRe(name).exec(attrs); return m ? (m[3] ?? m[4] ?? m[5]) : null; };
const setAttr = (attrs, name, value) => attrs.replace(attrRe(name), (_, pre) => `${pre}"${value.replace(/"/g, '&quot;')}"`);
const escScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const escStyle = (s) => s.replace(/<\/style/gi, '<\\/style');

// files: { パス: { text } または { dataUrl } }。root: プロジェクトのフォルダ。entry: 開く HTML。runtime: 最初に動かす橋渡しのスクリプト
// 戻り値: { html（srcdoc に入れる文書）, missing（見つからなかったファイル） }
export function buildPreview(files, root, entry, { runtime = '' } = {}) {
  const missing = new Set(), imports = {}, done = new Set(), sources = {};
  const urlOf = (p) => { const f = files[p]; if (!f) { missing.add(p); return null; } return f.dataUrl || dataText(mimeOf(p), f.text ?? ''); };
  const css = (text, from, seen = new Set()) => text
    .replace(/@import\s+(?:url\(\s*)?(['"])([^'"]+)\1\s*\)?\s*;/g, (all, _q, spec) => {
      const p = resolveIn(root, from, spec);
      if (!p || seen.has(p)) return all;
      if (!files[p]) { missing.add(p); return ''; }
      return css(files[p].text ?? '', p, new Set([...seen, p]));
    })
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, q, spec) => {
      const p = resolveIn(root, from, spec);
      if (!p) return all;
      const u = urlOf(p);
      return u ? `url(${q}${u}${q})` : all;
    });
  const mod = (p) => {
    if (done.has(p)) return;
    done.add(p);
    const f = files[p];
    if (!f) { missing.add(p); return; }
    const r = rewriteImports(f.text ?? '', p, root);
    imports['vfs://' + p] = dataText('text/javascript', r.code);
    sources[imports['vfs://' + p]] = p;
    r.deps.forEach(mod);
  };
  let html = files[entry]?.text ?? '';
  // script と style の中身は、ほかの書き換えに巻き込まないよう、先に置き換えて取りのけておく
  const held = [];
  const hold = (s) => `\u0000${held.push(s) - 1}\u0000`;
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (all, attrs, body) => {
    const src = getAttr(attrs, 'src'), type = (getAttr(attrs, 'type') || '').toLowerCase();
    const isModule = type === 'module';
    if (src) {
      const p = resolveIn(root, entry, src);
      if (!p) return hold(all); // 外の住所はそのまま
      if (isModule) {
        mod(p);
        const f = files[p];
        if (!f) return '';
        const r = rewriteImports(f.text ?? '', p, root), u = dataText('text/javascript', r.code);
        sources[u] = p;
        return hold(`<script type="module" src="${u}"></script>`);
      }
      if (!files[p]) { missing.add(p); return ''; }
      return hold(`<script>${escScript(files[p].text ?? '')}</script>`);
    }
    if (isModule) { const r = rewriteImports(body, entry, root); r.deps.forEach(mod); return hold(`<script type="module">${escScript(r.code)}</script>`); }
    return hold(all);
  });
  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (_, attrs, body) => hold(`<style${attrs}>${escStyle(css(body, entry))}</style>`));
  html = html.replace(/<link\b([^>]*)>/gi, (all, attrs) => {
    const rel = (getAttr(attrs, 'rel') || '').toLowerCase(), href = getAttr(attrs, 'href');
    const p = href && resolveIn(root, entry, href);
    if (!p) return all;
    if (rel.split(/\s+/).includes('stylesheet')) {
      if (!files[p]) { missing.add(p); return ''; }
      return hold(`<style data-src="${href.replace(/"/g, '&quot;')}">${escStyle(css(files[p].text ?? '', p))}</style>`);
    }
    if (rel.split(/\s+/).includes('icon')) { const u = urlOf(p); return u ? `<link${setAttr(attrs, 'href', u)}>` : all; }
    return all;
  });
  html = html.replace(/<(img|audio|video|source|track|input)\b([^>]*)>/gi, (all, tag, attrs) => {
    let a = attrs;
    for (const name of ['src', 'poster']) {
      const v = getAttr(a, name), p = v && resolveIn(root, entry, v);
      if (p) { const u = urlOf(p); if (u) a = setAttr(a, name, u); }
    }
    return `<${tag}${a}>`;
  });
  html = html.replace(/\u0000(\d+)\u0000/g, (_, n) => held[+n]);
  // 最初に橋渡しのスクリプト、次に import map（モジュールより前に必要）
  const map = Object.keys(imports).length ? `<script type="importmap">${JSON.stringify({ imports }).replace(/</g, '\\u003c')}</script>` : '';
  const inject = `<script>${escScript(runtime)}</script>${map}`;
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, (m) => m + inject);
  else if (/<html\b[^>]*>/i.test(html)) html = html.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${inject}</head>`);
  else { const dt = /^\s*<!doctype[^>]*>/i.exec(html); html = dt ? dt[0] + `<head>${inject}</head>` + html.slice(dt[0].length) : `<head>${inject}</head>` + html; }
  return { html, missing: [...missing], sources };
}

/* ---------- 橋渡し（プレビューの中で最初に動く） ---------- */
// OS とのやり取りは、MessageChannel の専用の口だけを使う。口は、橋渡しが「arcadia-hello」で頼み、OS が答えて渡す
// （作ったページが一番上の階層で arcadia の操作を await しても、読み込みの終わりを待たずに口が届くように）。
// 役目: console と誤りを作業場へ送る、相対の住所の fetch を仮想ドライブから返す、リンクを OS で開く、window.arcadia の窓口
export const RUNTIME = `(()=>{const q=[];let port=null,seq=0;const wait=new Map();
const post=(m)=>{if(port)port.postMessage(m);else q.push(m);};
const call=(op,args)=>new Promise((res,rej)=>{const id=++seq;wait.set(id,[res,rej]);post({id,op,args});});
const fmt=(v)=>{try{if(v instanceof Error)return v.stack||String(v);if(typeof v==='string')return v;if(typeof v==='function')return 'function '+(v.name||'');if(typeof Node!=='undefined'&&v instanceof Node)return '<'+String(v.nodeName).toLowerCase()+'>';const s=JSON.stringify(v,(k,x)=>typeof x==='bigint'?x+'n':x);return s===undefined?String(v):s;}catch{return String(v);}};
for(const level of ['log','info','warn','error','debug']){const orig=console[level].bind(console);console[level]=(...a)=>{post({op:'console',args:{level,text:a.map(fmt).join(' ')}});orig(...a);};}
addEventListener('error',(e)=>post({op:'console',args:{level:'error',text:String(e.message),file:String(e.filename||''),line:e.lineno|0,col:e.colno|0}}));
addEventListener('unhandledrejection',(e)=>post({op:'console',args:{level:'error',text:'処理されなかった Promise の失敗: '+fmt(e.reason)}}));
addEventListener('message',(e)=>{const d=e.data;if(port||e.source!==parent||!d||d.type!=='arcadia-port'||!e.ports[0])return;port=e.ports[0];
port.onmessage=(m)=>{const r=m.data,w=wait.get(r.id);if(!w)return;wait.delete(r.id);if(r.error)w[1](new Error(r.error));else w[0](r.result);};
for(const m of q.splice(0))port.postMessage(m);});
parent.postMessage({type:'arcadia-hello'},'*');
const local=(u)=>typeof u==='string'&&!/^[a-z][a-z0-9+.-]*:/i.test(u)&&!u.startsWith('//');
const of=window.fetch.bind(window);
window.fetch=(input,init)=>{const u=typeof input==='string'?input:(input instanceof URL?input.href:null);if(!local(u))return of(input,init);
return call('read',{path:u}).then((r)=>new Response(r.text!=null?r.text:Uint8Array.from(atob(r.base64),(c)=>c.charCodeAt(0)),{status:200,headers:{'content-type':r.type}}));};
addEventListener('click',(e)=>{if(e.defaultPrevented)return;const a=e.composedPath().find((n)=>n&&n.tagName==='A'&&n.getAttribute&&n.getAttribute('href'));if(!a)return;
const h=a.getAttribute('href');if(h.startsWith('#'))return;e.preventDefault();post(local(h)?{op:'navigate',args:{href:h}}:{op:'link',args:{href:a.href}});},true);
window.arcadia=Object.freeze({setTitle:(t)=>call('setTitle',{text:String(t)}),setStatus:(t)=>call('setStatus',{text:String(t)}),sound:(n)=>call('sound',{name:String(n)}),
notify:(o)=>call('notify',{title:String(o&&o.title||''),text:String(o&&o.text||'')}),loadData:(k)=>call('loadData',{key:String(k)}),
saveData:(k,v)=>call('saveData',{key:String(k),value:JSON.parse(JSON.stringify(v))}),readFile:(p)=>call('read',{path:String(p)}).then((r)=>r.text)});})();`;

/* ---------- ZIP（外のライブラリを使わずに作る） ---------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(data) { let c = 0xffffffff; for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d) => (((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
// entries: [{ name, data: Uint8Array, deflated?: Uint8Array（deflate-raw で縮めたもの。あれば method 8） }]
export function zipStore(entries, date = new Date()) {
  const enc = new TextEncoder(), local = [], central = []; let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), body = e.deflated || e.data, method = e.deflated ? 8 : 0;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
    h.setUint16(10, dosTime(date), true); h.setUint16(12, dosDate(date), true); h.setUint32(14, crc, true);
    h.setUint32(18, body.length, true); h.setUint32(22, e.data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    local.push(new Uint8Array(h.buffer), name, body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
    c.setUint16(12, dosTime(date), true); c.setUint16(14, dosDate(date), true); c.setUint32(16, crc, true); c.setUint32(20, body.length, true);
    c.setUint32(24, e.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((s, a) => s + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, a) => s + a.length, 0)); let p = 0;
  for (const a of parts) { out.set(a, p); p += a.length; }
  return out;
}

/* ---------- ひな形 ---------- */
const STYLE = `/* ARCADIA-91 の色: 作業面 #FFFDF9、文字 #241734、ミント #6BF2E3、ピンク #FF8EC7、アプリコット #FFD37A、ラベンダー #CFAEFF */
:root { color-scheme: light; --ink: #241734; --paper: #fffdf9; --mint: #6bf2e3; --pink: #ff8ec7; --apricot: #ffd37a; --lavender: #cfaeff; }
body { margin: 0; font: 15px/1.7 system-ui, sans-serif; color: var(--ink); background: var(--paper); }
`;
export const TEMPLATES = [
  { id: 'blank', name: '空のページ', desc: 'HTML・CSS・JavaScript の3つのファイルだけの、いちばん小さな形です。', files: {
    'index.html': `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<title>はじめてのページ</title>\n<link rel="stylesheet" href="style.css">\n<script type="module" src="main.mjs"></script>\n</head>\n<body>\n<main>\n<h1>こんにちは、ARCADIA</h1>\n<p>この文字を書きかえて、保存してみましょう。</p>\n<button type="button" id="hello">押す</button>\n</main>\n</body>\n</html>\n`,
    'style.css': STYLE + `main { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }\nh1 { border-bottom: 3px solid var(--pink); }\nbutton { font: inherit; padding: .3rem 1rem; border: 2px solid var(--ink); border-radius: 999px; background: var(--mint); }\n`,
    'main.mjs': `// ボタンを押したら、ページの下に一言を足す\nconst button = document.querySelector('#hello');\nlet count = 0;\nbutton.addEventListener('click', () => {\n  count++;\n  const p = document.createElement('p');\n  p.textContent = \`\${count} 回押しました。\`;\n  document.querySelector('main').append(p);\n  console.log('押した回数', count);\n});\n`,
  } },
  { id: 'canvas', name: 'canvas の遊び', desc: '矢印キーで動く光の玉と、ぶつかったときの音。動きのある作品の出発点です。', files: {
    'index.html': `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<title>光の玉</title>\n<link rel="stylesheet" href="style.css">\n<script type="module" src="main.mjs"></script>\n</head>\n<body>\n<canvas id="stage" width="480" height="320" tabindex="0" aria-label="矢印キーで光の玉を動かす遊び"></canvas>\n<p>玉の板を押してから、矢印キーで光の玉を動かします。板がキーを受けているときは、まわりに水色の枠が出ます。壁にぶつかると音が鳴ります。</p>\n</body>\n</html>\n`,
    'style.css': STYLE + `/* 列の幅を 0 まで縮められるようにして、狭い画面でも canvas と文が切れないようにする */\nbody { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: .5rem; padding: 1rem; }\ncanvas { border: 3px solid var(--ink); border-radius: 8px; background: linear-gradient(#ffe1f0, #fff3d6); max-width: 100%; height: auto; }\ncanvas:focus-visible { outline: 4px solid var(--mint); outline-offset: 3px; }\np { max-width: 32rem; margin: 0; }\n`,
    'main.mjs': `// 矢印キーで玉を動かし、壁にぶつかったら音を鳴らす\nconst canvas = document.querySelector('#stage');\nconst ctx = canvas.getContext('2d');\nconst ball = { x: 240, y: 160, vx: 0, vy: 0, r: 16 };\nconst keys = new Set();\nlet audio = null;\n// 押した瞬間に一度ぐっと押し出し、押し続けている間は少しずつ加速する\nconst KICK = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, -3], ArrowDown: [0, 3] };\ncanvas.addEventListener('keydown', (e) => {\n  if (!KICK[e.key]) return;\n  e.preventDefault();\n  if (!e.repeat) { ball.vx += KICK[e.key][0]; ball.vy += KICK[e.key][1]; }\n  keys.add(e.key);\n});\naddEventListener('keyup', (e) => keys.delete(e.key));\ncanvas.addEventListener('pointerdown', () => { audio ??= new AudioContext(); canvas.focus(); });\nfunction beep(freq) {\n  if (!audio) return;\n  const o = audio.createOscillator(), g = audio.createGain();\n  o.frequency.value = freq; g.gain.setValueAtTime(0.15, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2);\n  o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.2);\n}\nfunction step() {\n  if (keys.has('ArrowLeft')) ball.vx -= 0.4;\n  if (keys.has('ArrowRight')) ball.vx += 0.4;\n  if (keys.has('ArrowUp')) ball.vy -= 0.4;\n  if (keys.has('ArrowDown')) ball.vy += 0.4;\n  ball.vx *= 0.96; ball.vy *= 0.96;\n  ball.x += ball.vx; ball.y += ball.vy;\n  if (ball.x < ball.r || ball.x > canvas.width - ball.r) { ball.vx *= -0.8; ball.x = Math.max(ball.r, Math.min(canvas.width - ball.r, ball.x)); beep(660); }\n  if (ball.y < ball.r || ball.y > canvas.height - ball.r) { ball.vy *= -0.8; ball.y = Math.max(ball.r, Math.min(canvas.height - ball.r, ball.y)); beep(880); }\n  ctx.clearRect(0, 0, canvas.width, canvas.height);\n  const g = ctx.createRadialGradient(ball.x - 5, ball.y - 5, 2, ball.x, ball.y, ball.r);\n  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#6bf2e3'); g.addColorStop(1, '#cfaeff');\n  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();\n  ctx.lineWidth = 2; ctx.strokeStyle = '#241734'; ctx.stroke();\n  requestAnimationFrame(step);\n}\nrequestAnimationFrame(step);\n`,
  } },
  { id: 'osapp', name: 'OS のアプリ', desc: 'Future OS の窓として動くアプリのひな形です。状態の帯・効果音・知らせ・保存を使います。', files: {
    'app.json': JSON.stringify({ name: '一行メモ', w: 420, h: 320, entry: 'index.html' }, null, 2) + '\n',
    'index.html': `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<title>一行メモ</title>\n<link rel="stylesheet" href="style.css">\n<script type="module" src="main.mjs"></script>\n</head>\n<body>\n<main>\n<label for="line">今日の一行:</label>\n<input id="line" type="text" autocomplete="off">\n<button type="button" id="save">保存</button>\n<ul id="list"></ul>\n</main>\n</body>\n</html>\n`,
    'style.css': STYLE + `main { padding: 12px; display: grid; gap: 8px; }\ninput { font: inherit; padding: 4px 8px; border: 2px solid var(--ink); border-radius: 6px; }\nbutton { font: inherit; justify-self: start; padding: 2px 14px; border: 2px solid var(--ink); border-radius: 999px; background: var(--apricot); }\nul { margin: 0; padding-left: 1.2em; }\n`,
    'main.mjs': `// window.arcadia: Future OS が渡す、決まった操作だけの窓口\n// setTitle(文字) / setStatus(文字) / sound(名前) / notify({ title, text }) / loadData(名前) / saveData(名前, 値) / readFile(プロジェクトの中のパス)\nconst input = document.querySelector('#line'), list = document.querySelector('#list');\nconst lines = (await window.arcadia?.loadData('lines')) || [];\nconst draw = () => { list.replaceChildren(...lines.map((t) => Object.assign(document.createElement('li'), { textContent: t }))); };\ndraw();\nwindow.arcadia?.setStatus(\`\${lines.length} 行あります。\`);\ndocument.querySelector('#save').addEventListener('click', async () => {\n  const t = input.value.trim();\n  if (!t) return;\n  lines.unshift(t); input.value = '';\n  await window.arcadia?.saveData('lines', lines);\n  draw();\n  window.arcadia?.sound('select');\n  window.arcadia?.setStatus(\`保存しました。\${lines.length} 行あります。\`);\n});\n`,
  } },
];
