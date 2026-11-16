/* 小さなシンタックスハイライター（HTML / CSS / JavaScript）。
 * 返り値はエスケープ済みの HTML 文字列。元の文字は1つも欠けない。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DekiruHighlight = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 要素の中身に入れる文字列用。属性値に入れるときは escapeAttr を使う
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttr = (s) => esc(String(s)).replace(/"/g, '&quot;');
  const span = (cls, s) => `<span class="${cls}">${s}</span>`;

  const JS_KW = 'const|let|var|function|return|if|else|for|while|do|of|in|new|class|extends|this|await|async|yield|break|continue|switch|case|default|try|catch|finally|throw|typeof|instanceof|null|undefined|true|false|import|export|from|delete|void|super|static|get|set';
  const JS_RE = new RegExp(
    '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$))' + // 1 comment
    '|("(?:\\\\[\\s\\S]|[^"\\\\\\n])*"?|\'(?:\\\\[\\s\\S]|[^\'\\\\\\n])*\'?|`(?:\\\\[\\s\\S]|[^`\\\\])*`?)' + // 2 string
    '|(\\b0x[\\da-fA-F]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b)' + // 3 number
    '|\\b(' + JS_KW + ')\\b' + // 4 keyword
    '|([A-Za-z_$][\\w$]*)(?=\\s*\\()' + // 5 call
    '|([A-Za-z_$][\\w$]*|\\s+|[\\s\\S])', // 6 other
    'g');
  function hlJs(src) {
    return src.replace(JS_RE, (m, c, s, n, k, f) =>
      c ? span('c', esc(c)) : s ? span('s', esc(s)) : n ? span('n', esc(n)) : k ? span('k', esc(k)) : f ? span('f', esc(f)) : esc(m));
  }

  const CSS_RE = /(\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(@[\w-]+)|(--[\w-]+|[a-zA-Z-]+(?=\s*:(?!:)))|(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|vmin|vmax|deg|ms|s|fr|turn|ch|dvh|svh|lvh|dvw)?)|([\w-]+|\s+|[\s\S])/g;
  function hlCss(src) {
    return src.replace(CSS_RE, (m, c, s, at, p, n) =>
      c ? span('c', esc(c)) : s ? span('s', esc(s)) : at ? span('k', esc(at)) : p ? span('p', esc(p)) : n ? span('n', esc(n)) : esc(m));
  }

  function hlHtml(src) {
    let out = '', i = 0;
    const tagRe = /<\/?[a-zA-Z!][\w:-]*/y;
    const wsRe = /\s+/y, strRe = /"[^"]*"?|'[^']*'?/y, attrRe = /[^\s=>"'\/]+/y, entRe = /&(?:#\d+|#x[\da-fA-F]+|\w+);/y;
    const at = (re) => { re.lastIndex = i; return re.exec(src); };
    while (i < src.length) {
      if (src.startsWith('<!--', i)) {
        const e = src.indexOf('-->', i + 4);
        const end = e < 0 ? src.length : e + 3;
        out += span('c', esc(src.slice(i, end)));
        i = end;
        continue;
      }
      let m;
      if (src[i] === '<' && (m = at(tagRe))) {
        const lt = m[0].startsWith('</') ? '</' : '<';
        out += span('o', esc(lt)) + span('t', esc(m[0].slice(lt.length)));
        i += m[0].length;
        while (i < src.length && src[i] !== '>') {
          if ((m = at(wsRe))) { out += esc(m[0]); i += m[0].length; continue; }
          if ((m = at(strRe))) { out += span('s', esc(m[0])); i += m[0].length; continue; }
          if ((m = at(attrRe))) { out += span('a', esc(m[0])); i += m[0].length; continue; }
          out += esc(src[i]); i++;
        }
        if (src[i] === '>') { out += span('o', '&gt;'); i++; }
        continue;
      }
      if (src[i] === '&' && (m = at(entRe))) { out += span('e', esc(m[0])); i += m[0].length; continue; }
      let j = i + 1;
      while (j < src.length && src[j] !== '<' && src[j] !== '&') j++;
      out += esc(src.slice(i, j));
      i = j;
    }
    return out;
  }

  function highlight(src, lang) {
    src = String(src ?? '');
    if (lang === 'js') return hlJs(src);
    if (lang === 'css') return hlCss(src);
    return hlHtml(src);
  }
  return { highlight, escapeHtml: esc, escapeAttr };
});
