// ウェブブラウザの計算: 住所の欄の読み取り、窓の中での表示を断る見出しの判断、中継したページの書き換え、
// 読む表示のリンク、百科事典（Wikipedia の公開の API）の住所、履歴。画面には触らない（テストは tests/os-browser.test.mjs）。

const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// 住所の欄の文字を、種類に分ける。
// { kind: 'web', url } / { kind: 'start' } / { kind: 'wiki', lang, title } / { kind: 'search', q } / { kind: 'vfs', path }
export function parseInput(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  if (/^arcadia:\/\//i.test(s)) {
    const rest = s.slice('arcadia://'.length);
    const w = /^wiki\/([a-z-]{2,12})\/(.+)$/i.exec(rest);
    if (w) return { kind: 'wiki', lang: w[1].toLowerCase(), title: decode(w[2]).replace(/_/g, ' ') };
    const q = /^search\?q=(.*)$/i.exec(rest);
    if (q) return { kind: 'search', q: decode(q[1]) };
    const r = /^read\?url=(https?:\/\/.+)$/i.exec(rest);
    if (r) { try { return { kind: 'read', url: new URL(decode(r[1])).href }; } catch { /* 下へ */ } }
    return { kind: 'start' };
  }
  if (s.startsWith('/')) return { kind: 'vfs', path: s };
  if (/^https?:\/\//i.test(s)) {
    try { return { kind: 'web', url: new URL(s).href }; } catch { return { kind: 'search', q: s }; }
  }
  if (/\s/.test(s)) return { kind: 'search', q: s };
  // ホスト名:番号（localhost:8080 など）。「javascript:」のような scheme と区別するため、番号が続くものだけ
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#].*)?$/i.test(s);
  const host = /^[^\s/?#:@]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(s) || /^[^\s/?#:@]+:\d+(?:[/?#].*)?$/.test(s);
  if (local || host) {
    try { return { kind: 'web', url: new URL((local ? 'http://' : 'https://') + s).href }; } catch { /* 検索へ */ }
  }
  return { kind: 'search', q: s };
}

// 種類から、住所の欄に出す文字を作る（parseInput と往復できる）
export function toAddress(p) {
  if (!p) return '';
  switch (p.kind) {
    case 'start': return 'arcadia://start';
    case 'wiki': return `arcadia://wiki/${p.lang}/${p.title}`;
    case 'search': return `arcadia://search?q=${p.q}`;
    case 'read': return `arcadia://read?url=${p.url}`;
    case 'vfs': return p.path;
    default: return p.url;
  }
}

// 応答の見出しから、ほかのページの枠（iframe）の中での表示を断っているかを判断する。
// CSP の frame-ancestors があればそれだけで決め（新しいブラウザは X-Frame-Options より優先する）、なければ X-Frame-Options を見る
export function frameBlocked(headers, myOrigin) {
  const h = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const policies = (h['content-security-policy'] || '').split(',');
  let sawCsp = false;
  for (const pol of policies) {
    const d = pol.split(';').map((x) => x.trim()).find((x) => /^frame-ancestors(\s|$)/i.test(x));
    if (!d) continue;
    sawCsp = true;
    const src = d.split(/\s+/).slice(1);
    if (!src.some((s) => sourceMatches(s, myOrigin))) return true;
  }
  if (sawCsp) return false;
  const xfo = (h['x-frame-options'] || '').trim().toLowerCase();
  return xfo === 'deny' || xfo === 'sameorigin' || xfo.startsWith('allow-from');
}
function sourceMatches(s, origin) {
  const src = s.replace(/\/$/, '').toLowerCase(), me = String(origin).toLowerCase();
  if (src === '*') return true;
  if (src === "'none'" || src === "'self'") return false;
  if (/^[a-z][a-z0-9+.-]*:$/.test(src)) return me.startsWith(src); // https: のような scheme だけの指定
  if (src === me) return true;
  const wild = /^(?:([a-z][a-z0-9+.-]*):\/\/)?\*\.([^/:]+)(?::(\d+|\*))?$/.exec(src);
  if (wild) {
    try { const u = new URL(me); return (!wild[1] || u.protocol === wild[1] + ':') && u.hostname.endsWith('.' + wild[2]); } catch { return false; }
  }
  return false;
}

// 中継したページの中で動かす短いスクリプト。リンクの押下と GET のフォームを拾って、OS のブラウザへ知らせる。
// ページの中のアンカー（#）への移動は、そのままにする
const RELAY_SCRIPT = `(()=>{const send=(m)=>parent.postMessage(m,'*');const base=()=>document.baseURI.split('#')[0];
const link=(e,newTab)=>{if(e.defaultPrevented)return;const a=e.composedPath().find((n)=>n&&n.tagName==='A'&&n.href);if(!a)return;const href=a.href;
if(!/^https?:/i.test(href))return;if(href.includes('#')&&href.split('#')[0]===base())return;e.preventDefault();
send({type:'arcadia-nav',href,newTab:newTab||e.ctrlKey||e.metaKey||e.shiftKey||a.target==='_blank'});};
addEventListener('click',(e)=>{if(e.button===0)link(e,false);},true);addEventListener('auxclick',(e)=>{if(e.button===1)link(e,true);},true);
addEventListener('submit',(e)=>{const f=e.target;e.preventDefault();if((f.method||'get').toLowerCase()!=='get'){send({type:'arcadia-post'});return;}
const u=new URL(f.getAttribute('action')||base(),base());let fd;try{fd=new FormData(f,e.submitter);}catch{fd=new FormData(f);}
u.search=new URLSearchParams(fd).toString();send({type:'arcadia-nav',href:u.href,newTab:false});},true);
addEventListener('DOMContentLoaded',()=>send({type:'arcadia-title',title:document.title}));})();`;
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 中継したページを、sandbox の iframe に srcdoc で出せる形にする。
// 元の base と CSP の meta を除き、head の先頭に「base（元の住所）」とリンクを拾うスクリプトを入れる
export function relayDocument(html, url) {
  let src = String(html)
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '');
  let href = url;
  try { href = new URL(url).href; } catch { /* そのまま */ }
  const inject = `<base href="${attr(href)}"><script>${RELAY_SCRIPT}</script>`;
  if (/<head\b[^>]*>/i.test(src)) return src.replace(/<head\b[^>]*>/i, (m) => m + inject);
  if (/<html\b[^>]*>/i.test(src)) return src.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${inject}</head>`);
  const dt = /^\s*<!doctype[^>]*>/i.exec(src);
  if (dt) return dt[0] + `<head>${inject}</head>` + src.slice(dt[0].length);
  return `<head>${inject}</head>` + src;
}

// 読む表示で許すリンクの住所。http と https だけで、相対の住所は base から解決する。許さないものは null
export function safeHref(href, base) {
  try { const u = new URL(href, base); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null; } catch { return null; }
}

/* ---------- 百科事典（Wikipedia の公開の API。CORS を許しているので公開版でも読める） ---------- */
export const wikiSearchUrl = (lang, q) => `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=20&srsearch=${encodeURIComponent(q)}`;
export const wikiHtmlUrl = (lang, title) => `https://${lang}.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, '_'))}`;
export const wikiPageUrl = (lang, title) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
// 記事の中の「./題名」のリンクを、内部の住所（arcadia://wiki/言語/題名）にする。ほかのリンクは null
export function wikiLink(href, lang) {
  const m = /^\.\/([^#?]+)/.exec(String(href));
  return m ? `arcadia://wiki/${lang}/${decode(m[1]).replace(/_/g, ' ')}` : null;
}
// Wikipedia の記事の住所（https://ja.wikipedia.org/wiki/題名）から、言語と題名を取り出す。記事でなければ null
export function wikiFromUrl(url) {
  try {
    const u = new URL(url);
    const h = /^([a-z-]{2,12})\.(?:m\.)?wikipedia\.org$/.exec(u.hostname), p = /^\/wiki\/(.+)$/.exec(u.pathname);
    return h && p ? { lang: h[1], title: decode(p[1]).replace(/_/g, ' ') } : null;
  } catch { return null; }
}
// 検索結果の抜き出し（HTML の印が入っている）を文字だけにする
export function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/* ---------- 履歴とサイト ---------- */
// 新しいものを先頭に入れ、同じ住所は1つにまとめ、max を超えたら古いものを捨てる
export function addHistory(list, entry, max = 200, time = Date.now()) {
  return [{ ...entry, time }, ...(list || []).filter((e) => e.url !== entry.url)].slice(0, max);
}
export function hostOf(url) { try { return new URL(url).hostname; } catch { return ''; } }
