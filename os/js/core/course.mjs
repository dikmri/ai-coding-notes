// 講座の窓（apps/course.mjs）と、講座を自動で確かめる道具（tools/yugure-lessons-check.mjs）が共通に使う、画面に関係しない計算。
//   composeState  : 課の始め・終わりのファイルの組を作る（前の課の終わり + この課の始めのファイル + 終わりのファイル）
//   captureScript : プレビューの中の console.log を覚えておくスクリプト（答え合わせで「コンソールに出たか」を見る）
//   checkerScript : プレビューの中で答え合わせをするスクリプト。結果は parent へ postMessage し、window.__courseCheck にも置く
//   renderMarkdown: 課の文（Markdown の一部: 見出し・段落・箇条書き・表・引用・コード、:::answer 〜 ::: の答えの箱）を HTML にする
//   lineDiff      : 2 つの文字の、行ごとの違い（手本との違いを見せる）

// lessons: [{ id, start: { 相対パス: 文字 }, end: { 相対パス: 文字 } }]。index 番目の課の phase（'start' か 'end'）の状態
export function composeState(lessons, index, phase) {
  const files = {};
  for (let i = 0; i <= index; i++) {
    Object.assign(files, lessons[i].start || {});
    if (i < index || phase === 'end') Object.assign(files, lessons[i].end || {});
  }
  return files;
}

// プレビューで最初に動き、console.log などの文字を window.__courseLogs に覚えておく
export function captureScript() {
  return `(()=>{const logs=window.__courseLogs=[];const fmt=(v)=>{if(typeof v==='string')return v;try{return JSON.stringify(v)??String(v);}catch{return String(v);}};
for(const level of ['log','info','warn','error']){const orig=console[level].bind(console);console[level]=(...a)=>{logs.push(a.map(fmt).join(' '));orig(...a);};}})();`;
}

// checks: [{ label, code }]。code は async 関数の中身で、true を返せば合格。使える道具:
//   $ / $$（要素を探す）、wait(ms)、css(選ぶ文字, 見た目の名前)、click(選ぶ文字)、key(キー, 'down' | 'up')、
//   module(相対パス)（プロジェクトのモジュールを読む）、source(相対パス)（ファイルの中身の文字）、logs（console に出た文字の並び）
export function checkerScript(checks, root, sources = {}) {
  const data = JSON.stringify({ checks, root, sources }).replace(/</g, '\\u003c');
  return `<script type="module">
const { checks, root, sources } = ${data};
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const css = (s, name) => { const el = s === ':root' ? document.documentElement : document.querySelector(s); return el ? getComputedStyle(el).getPropertyValue(name).trim() : ''; };
const click = (s) => { const el = $(s); if (!el) return; el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); el.click(); };
const key = (k, phase = 'down') => document.dispatchEvent(new KeyboardEvent(phase === 'up' ? 'keyup' : 'keydown', { key: k, bubbles: true, cancelable: true }));
const module = (p) => import('vfs://' + root + '/' + p);
const source = async (p) => sources[p] ?? '';
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
if (document.readyState !== 'complete') await new Promise((ok) => addEventListener('load', ok, { once: true }));
await wait(300);
const results = [];
for (const c of checks) {
  let ok = false, error = '';
  try {
    const run = new AsyncFunction('$', '$$', 'wait', 'css', 'click', 'key', 'module', 'source', 'logs', c.code);
    ok = !!(await Promise.race([run($, $$, wait, css, click, key, module, source, window.__courseLogs || []), wait(8000).then(() => { throw new Error('8 秒たっても終わらない'); })]));
  } catch (e) { error = String((e && e.message) || e); }
  results.push({ label: c.label, ok, error });
}
window.__courseCheck = results;
parent.postMessage({ type: 'yugure-check', results }, '*');
</script>`;
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 1 行の中: `コード`、**強調**
function inline(text) {
  return text.split(/(`[^`]+`)/).map((part) => {
    if (/^`[^`]+`$/.test(part)) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
    return escapeHtml(part).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }).join('');
}

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^:::answer\s*$/.test(line)) { // 答えの箱（最初は閉じている）
      const body = [];
      for (i++; i < lines.length && !/^:::\s*$/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      out.push(`<details class="answer"><summary>答えを見る</summary>${renderMarkdown(body.join('\n'))}</details>`);
    } else if (/^```/.test(line)) { // コードの塊
      const lang = line.slice(3).trim();
      const body = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      out.push(`<pre class="code"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>${escapeHtml(body.join('\n'))}</code></pre>`);
    } else if (/^#{1,4} /.test(line)) {
      const level = line.match(/^#+/)[0].length;
      out.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
      i++;
    } else if (/^\s*[-*] /.test(line)) {
      const items = [];
      for (; i < lines.length && /^\s*[-*] /.test(lines[i]); i++) items.push(`<li>${inline(lines[i].replace(/^\s*[-*] /, ''))}</li>`);
      out.push(`<ul>${items.join('')}</ul>`);
    } else if (/^\s*\d+\. /.test(line)) {
      const items = [];
      for (; i < lines.length && /^\s*\d+\. /.test(lines[i]); i++) items.push(`<li>${inline(lines[i].replace(/^\s*\d+\. /, ''))}</li>`);
      out.push(`<ol>${items.join('')}</ol>`);
    } else if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const head = cells(line).map((c) => `<th>${inline(c)}</th>`).join('');
      const rows = [];
      for (i += 2; i < lines.length && /^\|/.test(lines[i]); i++) rows.push(`<tr>${cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`);
    } else if (/^> ?/.test(line)) {
      const body = [];
      for (; i < lines.length && /^> ?/.test(lines[i]); i++) body.push(lines[i].replace(/^> ?/, ''));
      out.push(`<blockquote><p>${body.map(inline).join('<br>')}</p></blockquote>`);
    } else if (/^---+\s*$/.test(line)) {
      out.push('<hr>');
      i++;
    } else if (line.trim() === '') {
      i++;
    } else {
      const body = [];
      for (; i < lines.length && lines[i].trim() !== '' && !/^(```|:::|#{1,4} |\s*[-*] |\s*\d+\. |\||> ?|---+\s*$)/.test(lines[i]); i++) body.push(lines[i]);
      out.push(`<p>${body.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

// 行ごとの違い（いちばん長く共通する行の並びを求めて、残りを消した行・足した行にする）
export function lineDiff(before, after) {
  const a = before.replace(/\r\n/g, '\n').split('\n'), b = after.replace(/\r\n/g, '\n').split('\n');
  const n = a.length, m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) out.push({ type: 'remove', text: a[i++] });
    else out.push({ type: 'add', text: b[j++] });
  }
  while (i < n) out.push({ type: 'remove', text: a[i++] });
  while (j < m) out.push({ type: 'add', text: b[j++] });
  return out;
}
