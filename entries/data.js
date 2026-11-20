/* データ変換 */
dekiru.add({
  id: 'dt-json-viewer', c: 'data', lv: 2,
  t: 'JSONの整形と木の表示', y: 'じぇいそんのせいけいときのひょうじ',
  tags: ['JSON', '整形', 'ツリー表示', 'details'],
  d: '貼り付けた JSON を読み込み、字下げした形と、開閉できる木の形の両方で見せる。書き方に誤りがあれば、その位置を知らせる。木は details 要素の入れ子で作る。',
  html: `<div class="wrap"><textarea id="in" spellcheck="false" aria-label="JSON"></textarea><div class="out"><div class="tree" id="tree"></div><pre id="pretty"></pre></div></div>`,
  css: `body { padding: 8px; background: #f6f6f3; } .wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; height: 100%; } textarea { font: 12px/1.5 ui-monospace, monospace; height: 100%; } .out { overflow: auto; background: #fff; border-radius: 8px; padding: 8px; font: 12px/1.6 ui-monospace, monospace; } details { margin-left: 14px; } summary { cursor: pointer; } .k { color: #7a3e9d; } .s { color: #2f855a; } .n { color: #c05621; } .b { color: #2b6cb0; } .err { color: #c23b22; } pre { margin: 8px 0 0; border-top: 1px dashed #ddd; padding-top: 6px; }`,
  js() {
    const inp = document.getElementById('in');
    inp.value = '{"名前":"ブラウザ図鑑","収録":290,"道具":["HTML","CSS","JavaScript"],"設定":{"暗い配色":true,"言語":"ja","ライブラリ":null}}';
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    function node(v, key) {
      const k = key !== undefined ? `<span class="k">${esc(key)}</span>: ` : '';
      if (v && typeof v === 'object') {
        const arr = Array.isArray(v), entries = Object.entries(v);
        return `<details open><summary>${k}${arr ? `[ ${entries.length} 件 ]` : `{ ${entries.length} 項目 }`}</summary>${entries.map(([kk, vv]) => node(vv, arr ? Number(kk) : kk)).join('')}</details>`;
      }
      const cls = typeof v === 'string' ? 's' : typeof v === 'number' ? 'n' : 'b';
      return `<div style="margin-left:14px">${k}<span class="${cls}">${esc(JSON.stringify(v))}</span></div>`;
    }
    function run() {
      try { const v = JSON.parse(inp.value); document.getElementById('tree').innerHTML = node(v); document.getElementById('pretty').textContent = JSON.stringify(v, null, 2); }
      catch (e) { document.getElementById('tree').innerHTML = `<p class="err">読めません: ${esc(e.message)}</p>`; document.getElementById('pretty').textContent = ''; }
    }
    inp.addEventListener('input', run);
    run();
  },
}, {
  id: 'dt-csv-table', c: 'data', lv: 2,
  t: 'CSVを並べ替えできる表に', y: 'しーえすぶいをならべかえできるひょうに',
  tags: ['CSV', '表', 'JSON', '変換'],
  d: 'カンマ区切りの文字（CSV）を、引用符の中のカンマや改行も正しく扱って読み込み、見出しを押すと並べ替えられる表にする。JSON としても取り出せる。',
  html: `<textarea id="in" rows="6" spellcheck="false" aria-label="CSV"></textarea><div class="bar"><button id="json">JSONとして保存</button></div><div class="tw"><table id="t"></table></div>`,
  css: `body { padding: 8px; background: #f3f5f2; display: grid; gap: 6px; align-content: start; } textarea { font: 12px ui-monospace, monospace; } .tw { overflow: auto; } table { border-collapse: collapse; background: #fff; font-size: 13px; } th, td { border: 1px solid #ddd; padding: 4px 8px; } th { background: #eef; cursor: pointer; } th[aria-sort=ascending]::after { content: " ▲"; } th[aria-sort=descending]::after { content: " ▼"; }`,
  js() {
    const inp = document.getElementById('in');
    inp.value = '名前,県,人口（万人）,メモ\n札幌,北海道,197,"雪まつり, ラーメン"\n仙台,宮城県,109,牛たん\n名古屋,愛知県,232,"味噌カツ"\n福岡,福岡県,164,"屋台, 明太子"\n那覇,沖縄県,32,"海, ""ゴーヤー"""';
    function parse(s) { const rows = []; let row = [], cell = '', q = false; for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c; } if (cell || row.length) { row.push(cell); rows.push(row); } return rows; }
    let head = [], body = [], key = -1, dir = 1;
    function render() {
      const rows = body.slice();
      if (key >= 0) rows.sort((a, b) => { const x = a[key], y = b[key], nx = Number(x), ny = Number(y); return dir * (isFinite(nx) && isFinite(ny) ? nx - ny : String(x).localeCompare(String(y), 'ja')); });
      const t = document.getElementById('t'); t.innerHTML = '';
      const tr = t.createTHead().insertRow();
      head.forEach((h, i) => { const th = document.createElement('th'); th.textContent = h; if (i === key) th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending'); th.onclick = () => { dir = key === i ? -dir : 1; key = i; render(); }; tr.append(th); });
      const tb = t.createTBody();
      rows.forEach((r) => { const row = tb.insertRow(); r.forEach((v) => { row.insertCell().textContent = v; }); });
    }
    function run() { const rows = parse(inp.value); head = rows[0] || []; body = rows.slice(1); render(); }
    inp.addEventListener('input', run);
    document.getElementById('json').onclick = () => { const data = body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'table.json'; a.click(); };
    run();
  },
}, {
  id: 'dt-base64', c: 'data', lv: 1,
  t: 'Base64の変換', y: 'べーすろくじゅうよんのへんかん',
  tags: ['Base64', 'TextEncoder', 'データURL', 'エンコード'],
  d: '日本語の文字を UTF-8 のバイト列にしてから Base64 に直し、また元に戻す。ファイルを選ぶと、そのファイルを丸ごと埋め込める data URL にもする。',
  p: 'btoa() は1文字1バイトの文字しか受け付けない。日本語はまず TextEncoder でバイト列にする。',
  html: `<label>元の文字 <textarea id="a" rows="3">AI コーディングノート</textarea></label><label>Base64 <textarea id="b" rows="3"></textarea></label><label>ファイルを data URL に <input type="file" id="f"></label><textarea id="url" rows="3" readonly aria-label="data URL"></textarea>`,
  css: `body { display: grid; gap: 8px; padding: 10px; background: #f6f4ff; align-content: start; } label { display: grid; gap: 4px; font-size: 13px; } textarea { font: 13px ui-monospace, monospace; word-break: break-all; }`,
  js() {
    const a = document.getElementById('a'), b = document.getElementById('b');
    const enc = (s) => { let bin = ''; for (const x of new TextEncoder().encode(s)) bin += String.fromCharCode(x); return btoa(bin); };
    const dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0)));
    a.addEventListener('input', () => { b.value = enc(a.value); });
    b.addEventListener('input', () => { try { a.value = dec(b.value); } catch { a.value = '（Base64 として読めません）'; } });
    document.getElementById('f').addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => { document.getElementById('url').value = r.result; }; r.readAsDataURL(file); });
    b.value = enc(a.value);
  },
}, {
  id: 'dt-hash', c: 'data', lv: 2,
  t: 'ハッシュ値を求める', y: 'はっしゅちをもとめる',
  tags: ['Web Crypto', 'SHA-256', 'ハッシュ', '改ざん検出'],
  d: '文字やファイルから SHA-1・SHA-256・SHA-384・SHA-512 のハッシュ値（指紋のような値）を計算する。1文字でも変わると全く違う値になる様子が見られる。計算はブラウザの Web Crypto API が行う。',
  html: `<label>文字 <input id="t" value="出来る"></label><label>またはファイル <input type="file" id="f"></label><dl id="out"></dl>`,
  css: `body { display: grid; gap: 8px; padding: 10px; background: #f2f6f4; align-content: start; } label { display: grid; gap: 4px; font-size: 13px; } dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; } dt { font: 700 12px ui-monospace, monospace; } dd { margin: 0; font: 12px ui-monospace, monospace; word-break: break-all; }`,
  js() {
    async function show(buf) {
      if (!crypto.subtle) { document.getElementById('out').innerHTML = '<dd>この環境では crypto.subtle が使えません</dd>'; return; }
      const rows = [];
      for (const alg of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) { const h = await crypto.subtle.digest(alg, buf); rows.push(`<dt>${alg}</dt><dd>${[...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')}</dd>`); }
      document.getElementById('out').innerHTML = rows.join('');
    }
    const t = document.getElementById('t');
    t.addEventListener('input', () => show(new TextEncoder().encode(t.value)));
    document.getElementById('f').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) show(await f.arrayBuffer()); });
    show(new TextEncoder().encode(t.value));
    if (window.THUMB) { const w = ['出来る', '出来る！', '出来るよ']; let i = 0; setInterval(() => { t.value = w[i++ % 3]; show(new TextEncoder().encode(t.value)); }, 900); }
  },
}, {
  id: 'dt-uuid', c: 'data', lv: 1,
  t: 'UUIDとランダムな文字列', y: 'ゆーゆーあいでぃーとらんだむなもじれつ',
  tags: ['UUID', 'crypto.randomUUID', '乱数', 'ID'],
  d: '世界で重ならない識別子 UUID（v4）を crypto.randomUUID() で作る。英数字だけの短い ID や、紛らわしい文字（0 と O など）を除いた ID も作れる。',
  html: `<div class="bar"><button id="u">UUID</button><button id="s">短いID（12文字）</button><button id="r">読み間違えにくいID</button></div><ol id="o"></ol>`,
  css: `body { padding: 12px; background: #f5f5f0; } .bar { display: flex; gap: 6px; flex-wrap: wrap; } ol { font: 15px ui-monospace, monospace; } li { padding: 3px 0; }`,
  js() {
    const pick = (chars, n) => { const r = crypto.getRandomValues(new Uint32Array(n)); return [...r].map((v) => chars[v % chars.length]).join(''); };
    const add = (s) => { const li = document.createElement('li'); li.textContent = s; document.getElementById('o').prepend(li); };
    document.getElementById('u').onclick = () => add(crypto.randomUUID ? crypto.randomUUID() : '（randomUUID に未対応）');
    document.getElementById('s').onclick = () => add(pick('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 12));
    document.getElementById('r').onclick = () => add(pick('ACDEFGHJKLMNPQRTUVWXY34679', 4) + '-' + pick('ACDEFGHJKLMNPQRTUVWXY34679', 4));
    for (let i = 0; i < 3; i++) document.getElementById('u').click();
    if (window.THUMB) setInterval(() => document.getElementById('u').click(), 600);
  },
}, {
  id: 'dt-password-generator', c: 'data', lv: 2,
  t: '安全なパスワードを作る', y: 'あんぜんなぱすわーどをつくる',
  tags: ['パスワード', 'getRandomValues', 'エントロピー', 'セキュリティ'],
  d: '長さと使う文字の種類を選ぶと、予測できない乱数（crypto.getRandomValues）でパスワードを作る。何通りあり得るかを「ビット」で表し、強さの目安を出す。',
  p: 'Math.random() は予測される恐れがあるので、秘密の値には使わない。',
  html: `<output id="pw" class="pw"></output><div class="ctl"><label>長さ <input type="range" id="len" min="6" max="40" value="16"> <span id="lv">16</span></label><label><input type="checkbox" id="up" checked> 大文字</label><label><input type="checkbox" id="lo" checked> 小文字</label><label><input type="checkbox" id="nu" checked> 数字</label><label><input type="checkbox" id="sy"> 記号</label><button id="go">作る</button><button id="cp">コピー</button></div><p id="bits"></p>`,
  css: `body { display: grid; place-content: center; gap: 10px; background: #1b2230; color: #eef; } .pw { font: 700 22px ui-monospace, monospace; background: #0f141e; padding: 12px 16px; border-radius: 10px; word-break: break-all; min-width: min(80vw, 480px); } .ctl { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; font-size: 13px; } p { margin: 0; }`,
  js() {
    const sets = { up: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lo: 'abcdefghijklmnopqrstuvwxyz', nu: '0123456789', sy: '!@#$%^&*-_=+?' };
    function gen() {
      const pool = Object.keys(sets).filter((k) => document.getElementById(k).checked).map((k) => sets[k]).join('') || sets.lo;
      const n = +document.getElementById('len').value;
      const out = []; const max = Math.floor(0x100000000 / pool.length) * pool.length;
      while (out.length < n) { for (const v of crypto.getRandomValues(new Uint32Array(n))) if (v < max && out.length < n) out.push(pool[v % pool.length]); }
      document.getElementById('pw').textContent = out.join('');
      const bits = Math.round(n * Math.log2(pool.length));
      document.getElementById('bits').textContent = `約 ${bits} ビット（${bits >= 80 ? 'とても強い' : bits >= 60 ? '強い' : bits >= 40 ? 'ふつう' : '弱い'}）`;
    }
    document.getElementById('len').oninput = (e) => { document.getElementById('lv').textContent = e.target.value; gen(); };
    document.querySelector('.ctl').addEventListener('change', gen);
    document.getElementById('go').onclick = gen;
    document.getElementById('cp').onclick = async () => { try { await navigator.clipboard.writeText(document.getElementById('pw').textContent); document.getElementById('cp').textContent = 'コピーしました'; } catch { document.getElementById('cp').textContent = 'コピーできません'; } };
    gen();
    if (window.THUMB) setInterval(gen, 700);
  },
}, {
  id: 'dt-markdown-editor', c: 'data', lv: 3,
  t: 'Markdownを見ながら書く', y: 'まーくだうんをみながらかく',
  tags: ['Markdown', 'パーサー', 'プレビュー', '正規表現'],
  d: '左に Markdown を書くと、右に整形した結果がすぐに出る。見出し・太字・斜体・コード・リンク・箇条書き・引用・表に対応した小さな変換器を自前で書いている。',
  p: '危ない HTML を混ぜられないよう、最初に < と & をエスケープしてから記法を置き換えている。',
  html: `<div class="wrap"><textarea id="md" spellcheck="false" aria-label="Markdown"></textarea><article id="out"></article></div>`,
  css: `body { padding: 8px; background: #f4f2ec; } .wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; height: 100%; } textarea { font: 13px/1.6 ui-monospace, monospace; height: 100%; } article { background: #fff; border-radius: 8px; padding: 6px 16px; overflow: auto; line-height: 1.8; } article code { background: #f2eee6; padding: 0 4px; border-radius: 4px; } article pre { background: #23211c; color: #eee; padding: 8px; border-radius: 6px; } article blockquote { border-left: 4px solid #e0532f; margin: 0; padding-left: 10px; color: #666; } table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: 3px 8px; }`,
  js() {
    const md = document.getElementById('md');
    md.value = '# 出来る！メモ\n\n**太字**、*斜体*、`コード`、[リンク](https://developer.mozilla.org/ja/)。\n\n## やること\n\n- 図鑑を読む\n- パイプを試す\n\n> 小さく作って、つなげる。\n\n| 道具 | 役目 |\n| --- | --- |\n| HTML | 骨組み |\n| CSS | 見た目 |\n\n```\nconsole.log("出来る");\n```';
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    function render(src) {
      const lines = src.split('\n'); let html = '', i = 0;
      while (i < lines.length) {
        const l = lines[i];
        if (/^```/.test(l)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; html += `<pre><code>${esc(buf.join('\n'))}</code></pre>`; continue; }
        let m;
        if ((m = /^(#{1,6}) (.*)/.exec(l))) { html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; i++; continue; }
        if (/^[-*] /.test(l)) { html += '<ul>'; while (i < lines.length && /^[-*] /.test(lines[i])) html += `<li>${inline(lines[i++].slice(2))}</li>`; html += '</ul>'; continue; }
        if (/^> /.test(l)) { html += `<blockquote>${inline(l.slice(2))}</blockquote>`; i++; continue; }
        if (/^\|/.test(l) && /^\|[\s-:|]+\|$/.test(lines[i + 1] || '')) { const cells = (r) => r.slice(1, -1).split('|').map((c) => c.trim()); html += `<table><thead><tr>${cells(l).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>`; i += 2; while (i < lines.length && /^\|/.test(lines[i])) html += `<tr>${cells(lines[i++]).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`; html += '</tbody></table>'; continue; }
        if (!l.trim()) { i++; continue; }
        const buf = []; while (i < lines.length && lines[i].trim() && !/^(#|[-*] |> |```|\|)/.test(lines[i])) buf.push(lines[i++]); html += `<p>${inline(buf.join(' '))}</p>`;
      }
      return html;
    }
    const run = () => { document.getElementById('out').innerHTML = render(md.value); };
    md.addEventListener('input', run);
    run();
  },
}, {
  id: 'dt-diff', c: 'data', lv: 3,
  t: '2つの文章の違いを見つける', y: 'ふたつのぶんしょうのちがいをみつける',
  tags: ['差分', 'LCS', '動的計画法', '比較'],
  d: '2つの文章を1文字ずつ比べ、消えた所を赤、増えた所を緑で示す。両方に共通する一番長い並び（最長共通部分列）を表で求めてから、残りを差分として取り出す。',
  html: `<div class="two"><textarea id="a" rows="4" aria-label="前の文章">ライブラリを使わずに、ブラウザだけで図鑑を作りました。</textarea><textarea id="b" rows="4" aria-label="後の文章">ライブラリもフレームワークも使わずに、ブラウザだけで大きな図鑑を作った。</textarea></div><p class="out" id="out"></p><p id="stat"></p>`,
  css: `body { padding: 10px; background: #f7f6f2; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } textarea { font-size: 15px; } .out { font-size: 18px; line-height: 2; background: #fff; padding: 8px 12px; border-radius: 8px; } del { background: #ffd6d6; color: #a12; } ins { background: #d6f5dd; color: #185; text-decoration: none; } #stat { font-size: 12px; color: #666; }`,
  js() {
    function diff(a, b) {
      const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      const out = []; let i = 0, j = 0;
      while (i < n && j < m) { if (a[i] === b[j]) { out.push(['=', a[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', a[i++]]); else out.push(['+', b[j++]]); }
      while (i < n) out.push(['-', a[i++]]); while (j < m) out.push(['+', b[j++]]);
      return out;
    }
    function run() {
      const A = [...document.getElementById('a').value], B = [...document.getElementById('b').value];
      const d = diff(A, B), out = document.getElementById('out'); out.innerHTML = '';
      let cur = null;
      for (const [op, ch] of d) { const tag = op === '=' ? 'span' : op === '-' ? 'del' : 'ins'; if (!cur || cur.tagName.toLowerCase() !== tag) { cur = document.createElement(tag); out.append(cur); } cur.textContent += ch; }
      document.getElementById('stat').textContent = `消えた文字 ${d.filter((x) => x[0] === '-').length} ・ 増えた文字 ${d.filter((x) => x[0] === '+').length} ・ 同じ文字 ${d.filter((x) => x[0] === '=').length}`;
    }
    document.getElementById('a').addEventListener('input', run);
    document.getElementById('b').addEventListener('input', run);
    run();
  },
}, {
  id: 'dt-regex-tester', c: 'data', lv: 2,
  t: '正規表現の試し場', y: 'せいきひょうげんのためしば',
  tags: ['正規表現', 'RegExp', 'matchAll', '名前付きグループ'],
  d: 'パターンと対象の文章を入れると、一致した部分に色を付け、括弧で取り出した部分（グループ）を一覧にする。書き方を間違えると、その理由を表示する。',
  html: `<div class="row"><span>/</span><input id="p" value="(?<year>\\d{4})年(?<month>\\d{1,2})月"><span>/</span><input id="fl" value="g" size="4" aria-label="フラグ"></div><textarea id="t" rows="4" aria-label="対象の文章">2026年11月に公開。2025年4月に企画、1999年12月生まれ。</textarea><p class="out" id="out"></p><ol id="g"></ol>`,
  css: `body { padding: 10px; background: #f3f4f8; display: grid; gap: 8px; align-content: start; } .row { display: flex; gap: 4px; align-items: center; font: 16px ui-monospace, monospace; } #p { flex: 1; font: inherit; } .out { font-size: 16px; line-height: 2; background: #fff; padding: 8px; border-radius: 8px; margin: 0; } mark { background: #ffe066; border-radius: 3px; } .err { color: #c23b22; } ol { font: 13px ui-monospace, monospace; margin: 0; }`,
  js() {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    function run() {
      const out = document.getElementById('out'), g = document.getElementById('g'), text = document.getElementById('t').value;
      let re;
      try { re = new RegExp(document.getElementById('p').value, document.getElementById('fl').value.includes('g') ? document.getElementById('fl').value : document.getElementById('fl').value + 'g'); }
      catch (e) { out.innerHTML = `<span class="err">${esc(e.message)}</span>`; g.innerHTML = ''; return; }
      let html = '', at = 0; const list = [];
      for (const m of text.matchAll(re)) { if (m[0] === '') break; html += esc(text.slice(at, m.index)) + `<mark>${esc(m[0])}</mark>`; at = m.index + m[0].length; list.push(m); }
      out.innerHTML = html + esc(text.slice(at));
      g.innerHTML = list.map((m) => `<li>${esc(m[0])} ${m.groups ? '→ ' + Object.entries(m.groups).map(([k, v]) => `${k}=${esc(String(v))}`).join(', ') : m.length > 1 ? '→ ' + m.slice(1).map((v) => esc(String(v))).join(', ') : ''}</li>`).join('');
    }
    ['p', 'fl', 't'].forEach((id) => document.getElementById(id).addEventListener('input', run));
    run();
  },
}, {
  id: 'dt-compress', c: 'data', lv: 3,
  t: '圧縮して大きさを比べる', y: 'あっしゅくしておおきさをくらべる',
  tags: ['CompressionStream', 'gzip', 'Streams', '圧縮'],
  d: '文章を CompressionStream で gzip と deflate に圧縮し、元の大きさと比べる。同じ言葉の繰り返しが多いほどよく縮む。縮めたものを元に戻して、内容が同じかも確かめる。',
  html: `<textarea id="t" rows="6" aria-label="圧縮する文章"></textarea><button id="rep">同じ文を10回に増やす</button><table id="o"></table>`,
  css: `body { padding: 10px; background: #f2f4f1; display: grid; gap: 8px; align-content: start; } textarea { font-size: 14px; } table { border-collapse: collapse; font-size: 14px; } td, th { padding: 4px 10px; border-bottom: 1px solid #ddd; text-align: left; } .bar { height: 10px; background: #2f855a; border-radius: 3px; }`,
  js() {
    const t = document.getElementById('t');
    t.value = 'ブラウザには、圧縮と展開の道具も最初から入っています。ライブラリを読み込まなくても、gzip で縮められます。';
    async function size(data, fmt) { const s = new Blob([data]).stream().pipeThrough(new CompressionStream(fmt)); return new Uint8Array(await new Response(s).arrayBuffer()); }
    async function back(bytes, fmt) { const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(fmt)); return new TextDecoder().decode(await new Response(s).arrayBuffer()); }
    async function run() {
      if (!('CompressionStream' in window)) { document.getElementById('o').innerHTML = '<tr><td>この環境は CompressionStream に未対応です</td></tr>'; return; }
      const raw = new TextEncoder().encode(t.value), rows = [['元のまま', raw.length, true]];
      for (const f of ['gzip', 'deflate']) { const z = await size(raw, f); rows.push([f, z.length, (await back(z, f)) === t.value]); }
      document.getElementById('o').innerHTML = '<tr><th>形式</th><th>バイト数</th><th></th><th>元に戻るか</th></tr>' + rows.map(([n, b, ok]) => `<tr><td>${n}</td><td>${b}</td><td><div class="bar" style="width:${(b / raw.length) * 200}px"></div></td><td>${ok ? '○' : '×'}</td></tr>`).join('');
    }
    t.addEventListener('input', run);
    document.getElementById('rep').onclick = () => { t.value = Array(10).fill(t.value.split('\n')[0]).join('\n'); run(); };
    run();
  },
}, {
  id: 'dt-encrypt', c: 'data', lv: 3,
  t: '合言葉で暗号化する', y: 'あいことばであんごうかする',
  tags: ['Web Crypto', 'AES-GCM', 'PBKDF2', '暗号'],
  d: '合言葉から鍵を作り（PBKDF2）、文章を AES-GCM で暗号化して Base64 の文字にする。同じ合言葉なら元に戻せ、違う合言葉では戻せない。計算はすべてブラウザの中で行う。',
  p: '暗号文には、鍵を作るときの塩（salt）と暗号化のときの一度きりの値（IV）も一緒に入れている。毎回違う暗号文になるのはそのため。',
  html: `<label>合言葉 <input id="k" value="ひらけごま"></label><label>文章 <textarea id="p" rows="3">今夜8時に、いつもの場所で。</textarea></label><div class="bar"><button id="enc">暗号化 ↓</button><button id="dec">↑ 元に戻す</button></div><label>暗号文 <textarea id="c" rows="4"></textarea></label><p id="msg"></p>`,
  css: `body { padding: 10px; display: grid; gap: 8px; align-content: start; background: #f1f0f6; } label { display: grid; gap: 4px; font-size: 13px; } textarea { font: 13px ui-monospace, monospace; word-break: break-all; } .bar { display: flex; gap: 8px; } #msg { margin: 0; color: #c23b22; }`,
  js() {
    const te = new TextEncoder(), td = new TextDecoder();
    const b64 = (u8) => btoa(String.fromCharCode(...u8)), un64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    async function key(pass, salt) { const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
    const msg = (s) => { document.getElementById('msg').textContent = s; };
    document.getElementById('enc').onclick = async () => {
      if (!crypto.subtle) return msg('この環境では crypto.subtle が使えません');
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const k = await key(document.getElementById('k').value, salt);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, te.encode(document.getElementById('p').value)));
      document.getElementById('c').value = b64(new Uint8Array([...salt, ...iv, ...ct])); msg('');
    };
    document.getElementById('dec').onclick = async () => {
      try {
        const all = un64(document.getElementById('c').value.trim()), salt = all.slice(0, 16), iv = all.slice(16, 28), ct = all.slice(28);
        const k = await key(document.getElementById('k').value, salt);
        document.getElementById('p').value = td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, ct)); msg('');
      } catch { msg('戻せませんでした（合言葉が違うか、暗号文が壊れています）'); }
    };
    document.getElementById('enc').click();
  },
}, {
  id: 'dt-url-parse', c: 'data', lv: 1,
  t: 'URLを分解して組み立てる', y: 'ゆーあーるえるをぶんかいしてくみたてる',
  tags: ['URL', 'URLSearchParams', 'クエリ', '分解'],
  d: 'new URL() に渡すと、URL をプロトコル・ホスト・パス・クエリ・ハッシュなどに分けてくれる。クエリの値を書き換えると、正しくエスケープされた URL に組み立て直す。',
  html: `<input id="u" value="https://example.com:8080/図鑑/項目?q=さくら&amp;lv=2&amp;tag=canvas#コード" aria-label="URL"><table id="t"></table><h3>クエリ（書き換えられます）</h3><div id="qs"></div><p>組み立て直した URL: <code id="re"></code></p>`,
  css: `body { padding: 10px; background: #f5f6f8; font-size: 13px; } #u { width: 100%; font: 13px ui-monospace, monospace; } table { border-collapse: collapse; margin: 8px 0; } td { padding: 3px 10px; border-bottom: 1px solid #ddd; font-family: ui-monospace, monospace; } td:first-child { color: #888; } h3 { font-size: 13px; margin: 8px 0 4px; } #qs label { display: flex; gap: 6px; margin: 2px 0; } code { word-break: break-all; }`,
  js() {
    const u = document.getElementById('u');
    function run() {
      let url;
      try { url = new URL(u.value); } catch { document.getElementById('t').innerHTML = '<tr><td>URL として読めません</td></tr>'; return; }
      const parts = ['protocol', 'username', 'hostname', 'port', 'pathname', 'search', 'hash', 'origin'];
      document.getElementById('t').innerHTML = parts.map((p) => `<tr><td>${p}</td><td></td></tr>`).join('');
      [...document.querySelectorAll('#t tr')].forEach((tr, i) => { tr.lastChild.textContent = url[parts[i]] + (parts[i] === 'pathname' ? `（読むと: ${decodeURIComponent(url.pathname)}）` : ''); });
      const qs = document.getElementById('qs'); qs.innerHTML = '';
      for (const [k, v] of url.searchParams) { const l = document.createElement('label'); l.innerHTML = `<span></span><input>`; l.firstChild.textContent = k; l.lastChild.value = v; l.lastChild.oninput = () => { url.searchParams.set(k, l.lastChild.value); document.getElementById('re').textContent = url.href; }; qs.append(l); }
      document.getElementById('re').textContent = url.href;
    }
    u.addEventListener('input', run);
    run();
  },
}, {
  id: 'dt-color-convert', c: 'data', lv: 2,
  t: '色の書き方を相互に変換', y: 'いろのかきかたをそうごにへんかん',
  tags: ['色', 'HEX', 'HSL', 'OKLCH'],
  d: '1つの色を、16進数・RGB・HSL・OKLCH の4つの書き方で並べる。どれかを書き換えると、他の書き方も計算し直す。OKLCH への変換式も JS で書いている。',
  html: `<div class="sw" id="sw"></div><input type="color" id="pick" value="#e0532f" aria-label="色を選ぶ"><div class="rows" id="rows"></div>`,
  css: `body { display: grid; justify-items: center; align-content: center; gap: 10px; background: #f7f6f2; } .sw { width: 160px; height: 90px; border-radius: 14px; box-shadow: inset 0 0 0 1px #0002; } .rows { display: grid; grid-template-columns: auto 18em; gap: 6px 10px; font: 14px ui-monospace, monospace; align-items: center; } .rows input { font: inherit; }`,
  js() {
    const rows = document.getElementById('rows');
    const F = ['HEX', 'RGB', 'HSL', 'OKLCH'];
    rows.innerHTML = F.map((f) => `<label for="f-${f}">${f}</label><input id="f-${f}">`).join('');
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    function toOklch(r, g, b) {
      [r, g, b] = [r, g, b].map((v) => lin(v / 255));
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
      return [L * 100, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
    }
    function toHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let h = 0, s = 0; if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; } return [h, s * 100, l * 100]; }
    function set(css, from) {
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''), [h, s, l] = toHsl(r, g, b), [L, C, H] = toOklch(r, g, b);
      const vals = { HEX: hex, RGB: `rgb(${r} ${g} ${b})`, HSL: `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`, OKLCH: `oklch(${L.toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)})` };
      for (const f of F) if (f !== from) document.getElementById('f-' + f).value = vals[f];
      document.getElementById('sw').style.background = hex; document.getElementById('pick').value = hex;
    }
    F.forEach((f) => document.getElementById('f-' + f).addEventListener('input', (e) => { if (CSS.supports('color', e.target.value)) set(e.target.value, f); }));
    document.getElementById('pick').addEventListener('input', (e) => set(e.target.value, null));
    set('#e0532f', null);
  },
}, {
  id: 'dt-unit-convert', c: 'data', lv: 1,
  t: '単位の換算（尺貫法つき）', y: 'たんいのかんさんしゃっかんほうつき',
  tags: ['単位換算', '尺貫法', '坪', '温度'],
  d: '長さ・重さ・面積・体積・温度を換算する。メートルやインチに加えて、尺・寸・間・坪・畳・合・升・貫など昔の日本の単位にも対応する。',
  html: `<select id="kind"><option value="len">長さ</option><option value="w">重さ</option><option value="area">面積</option><option value="vol">体積</option><option value="temp">温度</option></select><div class="row"><input id="v" type="number" value="1" step="any" aria-label="値"><select id="from" aria-label="元の単位"></select></div><table id="t"></table>`,
  css: `body { padding: 12px; background: #f6f2e8; display: grid; gap: 8px; align-content: start; justify-items: start; } .row { display: flex; gap: 6px; } #v { width: 8em; font-size: 16px; } table { border-collapse: collapse; font-size: 14px; } td { padding: 3px 12px; border-bottom: 1px dashed #d8cdb4; } td:first-child { text-align: right; font-variant-numeric: tabular-nums; }`,
  js() {
    const U = {
      len: { メートル: 1, センチメートル: 0.01, キロメートル: 1000, インチ: 0.0254, フィート: 0.3048, マイル: 1609.344, 尺: 10 / 33, 寸: 1 / 33, 間: 60 / 33, 里: 43200 / 11 },
      w: { キログラム: 1, グラム: 0.001, トン: 1000, ポンド: 0.45359237, オンス: 0.0283495, 貫: 3.75, 匁: 0.00375, 斤: 0.6 },
      area: { 平方メートル: 1, ヘクタール: 10000, 坪: 400 / 121, 畳: 400 / 242, エーカー: 4046.86, 平方フィート: 0.092903 },
      vol: { リットル: 1, ミリリットル: 0.001, 立方メートル: 1000, 合: 0.180391, 升: 1.80391, 斗: 18.0391, ガロン: 3.78541, カップ: 0.2 },
    };
    const kind = document.getElementById('kind'), from = document.getElementById('from'), v = document.getElementById('v');
    function fill() { const k = kind.value; from.innerHTML = (k === 'temp' ? ['摂氏', '華氏', '絶対温度'] : Object.keys(U[k])).map((u) => `<option>${u}</option>`).join(''); run(); }
    function run() {
      const k = kind.value, x = +v.value, fmt = (n) => new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 6 }).format(n);
      let rows;
      if (k === 'temp') { const c = from.value === '摂氏' ? x : from.value === '華氏' ? ((x - 32) * 5) / 9 : x - 273.15; rows = [['摂氏', c, '℃'], ['華氏', (c * 9) / 5 + 32, '°F'], ['絶対温度', c + 273.15, 'K']].map(([n, val, u]) => [fmt(val) + ' ' + u, n]); }
      else { const base = x * U[k][from.value]; rows = Object.entries(U[k]).map(([n, f]) => [fmt(base / f), n]); }
      document.getElementById('t').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    }
    kind.onchange = fill; from.onchange = run; v.oninput = run;
    fill();
  },
}, {
  id: 'dt-date-calc', c: 'data', lv: 1,
  t: '日付の計算', y: 'ひづけのけいさん',
  tags: ['Date', '日数', '曜日', 'カウントダウン'],
  d: '2つの日付の間が何日・何週・何か月かを数え、ある日から何日後が何月何日の何曜日かを出す。月の日数の違いやうるう年は Date が面倒を見てくれる。',
  html: `<fieldset><legend>2つの日付の間</legend><input type="date" id="a"> から <input type="date" id="b"><p id="o1"></p></fieldset><fieldset><legend>何日後</legend><input type="date" id="c"> の <input type="number" id="n" value="100" style="width:6em"> 日後<p id="o2"></p></fieldset>`,
  css: `body { padding: 12px; display: grid; gap: 10px; align-content: start; background: #f2f5f8; } fieldset { border-radius: 10px; border: 1px solid #ccd; background: #fff; } p { font-weight: 700; margin: 6px 0 0; }`,
  js() {
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const today = new Date();
    document.getElementById('a').value = iso(today);
    document.getElementById('b').value = `${today.getFullYear() + 1}-01-01`;
    document.getElementById('c').value = iso(today);
    function run() {
      const a = parse(document.getElementById('a').value), b = parse(document.getElementById('b').value);
      const days = Math.round((b - a) / 86400000), months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0);
      document.getElementById('o1').textContent = `${days} 日（${(days / 7).toFixed(1)} 週、約 ${months} か月）`;
      const c = parse(document.getElementById('c').value); c.setDate(c.getDate() + +document.getElementById('n').value);
      document.getElementById('o2').textContent = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'full' }).format(c);
    }
    document.body.addEventListener('input', run);
    run();
  },
}, {
  id: 'dt-kana-romaji', c: 'data', lv: 2,
  t: 'かなとローマ字の変換', y: 'かなとろーまじのへんかん',
  tags: ['ローマ字', 'ヘボン式', 'ひらがな', '変換'],
  d: 'ひらがな・カタカナをヘボン式のローマ字に直す。「っ」は次の子音を重ね、「ん」は b・m・p の前で m にする、などのきまりも入れてある。パスポートの名前の確認などに使える。',
  html: `<label>かな <input id="k" value="しんばし きっぷ まっちゃ じょうほう"></label><output id="o" class="out"></output><label><input type="checkbox" id="mac"> 長音を ō のように書く</label>`,
  css: `body { display: grid; gap: 10px; align-content: center; padding: 14px; background: #f3f0fa; } input[type=text], #k { font-size: 18px; width: 100%; } .out { font: 700 22px ui-monospace, monospace; background: #fff; padding: 10px; border-radius: 8px; min-height: 1.6em; }`,
  js() {
    const B = { あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho', ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'o', ん: 'n', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ー: '' };
    const Y = { き: 'ky', ぎ: 'gy', し: 'sh', じ: 'j', ち: 'ch', に: 'ny', ひ: 'hy', び: 'by', ぴ: 'py', み: 'my', り: 'ry' };
    function conv(s, mac) {
      s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
      let out = '';
      for (let i = 0; i < s.length; i++) {
        const c = s[i], n = s[i + 1];
        if (Y[c] && 'ゃゅょ'.includes(n)) { out += Y[c] + { ゃ: 'a', ゅ: 'u', ょ: 'o' }[n]; i++; continue; }
        if (c === 'っ') { const nx = Y[n] || B[n] || ''; out += nx.startsWith('ch') ? 't' : nx[0] || ''; continue; }
        if (c === 'ん') { const nx = B[n] || Y[n] || ''; out += /^[bmp]/.test(nx) ? 'm' : 'n'; continue; }
        out += B[c] ?? c;
      }
      if (mac) out = out.replace(/ou|oo/g, 'ō').replace(/uu/g, 'ū');
      return out.toUpperCase();
    }
    const run = () => { document.getElementById('o').textContent = conv(document.getElementById('k').value, document.getElementById('mac').checked); };
    document.getElementById('k').addEventListener('input', run);
    document.getElementById('mac').addEventListener('change', run);
    run();
  },
}, {
  id: 'dt-char-types', c: 'data', lv: 2,
  t: '文字の種類を数える', y: 'もじのしゅるいをかぞえる',
  tags: ['文字種', 'Unicode', '正規表現', '読了時間'],
  d: '文章の中のひらがな・カタカナ・漢字・英字・数字・記号を数え、割合を帯で見せる。Unicode の文字の分類（\\p{Script=Han} など）を正規表現で使う。読むのにかかる時間の目安も出す。',
  html: `<textarea id="t" rows="5" aria-label="文章">ブラウザ（Browser）だけで、HTML5 と CSS3 と JavaScript を使い、290 個以上の見本を作りました！ 漢字・ひらがな・カタカナが混ざった日本語は、文字の種類を数えると面白い。</textarea><div class="bar" id="bar"></div><ul id="l"></ul>`,
  css: `body { padding: 10px; display: grid; gap: 8px; align-content: start; background: #faf8f3; } textarea { font-size: 15px; } .bar { display: flex; height: 22px; border-radius: 6px; overflow: hidden; } .bar i { transition: flex-grow .3s; } ul { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px; font-size: 13px; } li::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; background: var(--c); }`,
  js() {
    const K = [['ひらがな', /\p{Script=Hiragana}/u, '#e0532f'], ['カタカナ', /\p{Script=Katakana}/u, '#f0a43a'], ['漢字', /\p{Script=Han}/u, '#26407c'], ['英字', /\p{Script=Latin}/u, '#2f855a'], ['数字', /\p{Nd}/u, '#7a5cff'], ['記号など', /[^\s]/u, '#999']];
    function run() {
      const chars = [...document.getElementById('t').value].filter((c) => c.trim());
      const n = K.map(() => 0);
      for (const c of chars) n[K.findIndex(([, re]) => re.test(c))]++;
      document.getElementById('bar').innerHTML = K.map(([, , col], i) => `<i style="flex-grow:${n[i]};background:${col}"></i>`).join('');
      document.getElementById('l').innerHTML = K.map(([name, , col], i) => `<li style="--c:${col}">${name} ${n[i]}（${chars.length ? Math.round((n[i] / chars.length) * 100) : 0}%）</li>`).join('') + `<li style="--c:transparent">合計 ${chars.length} 文字 ・ 約 ${Math.max(1, Math.round(chars.length / 500 * 60))} 秒で読めます</li>`;
    }
    document.getElementById('t').addEventListener('input', run);
    run();
  },
}, {
  id: 'dt-number-base', c: 'data', lv: 2,
  t: '2進数のスイッチ', y: 'にしんすうのすいっち',
  tags: ['2進数', '16進数', 'ビット', '負の数'],
  d: '8個のスイッチが1つずつのビット。押して0と1を切り替えると、10進数・16進数・8進数と、符号付き（2の補数）で読んだ値がすぐに変わる。10進数を打って逆向きにも変換できる。',
  html: `<div class="bits" id="bits"></div><dl><dt>10進数</dt><dd><input id="dec" type="number" min="0" max="255" value="42"></dd><dt>16進数</dt><dd id="hex"></dd><dt>8進数</dt><dd id="oct"></dd><dt>符号付き</dt><dd id="sgn"></dd><dt>文字</dt><dd id="ch"></dd></dl>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 12px; background: #11161d; color: #dde; } .bits { display: flex; gap: 6px; } .bits button { width: 46px; height: 70px; border-radius: 8px; border: 0; font: 800 24px ui-monospace, monospace; background: #26303c; color: #6b7a8c; display: grid; grid-template-rows: 1fr auto; padding: 6px 0 4px; } .bits button.on { background: #ffd23f; color: #222; } .bits small { font-size: 9px; } dl { display: grid; grid-template-columns: auto 10em; gap: 6px 12px; font: 16px ui-monospace, monospace; margin: 0; } dt { color: #889; } dd { margin: 0; } #dec { width: 7em; font: inherit; }`,
  js() {
    let v = 42;
    const bits = document.getElementById('bits');
    const btns = [7, 6, 5, 4, 3, 2, 1, 0].map((b) => { const el = document.createElement('button'); el.innerHTML = `<span></span><small>${2 ** b}</small>`; el.setAttribute('aria-label', `${2 ** b} の位`); el.onclick = () => { v ^= 1 << b; show(); }; bits.append(el); return [el, b]; });
    function show() {
      btns.forEach(([el, b]) => { const on = (v >> b) & 1; el.classList.toggle('on', !!on); el.firstChild.textContent = on; el.setAttribute('aria-pressed', !!on); });
      document.getElementById('dec').value = v;
      document.getElementById('hex').textContent = '0x' + v.toString(16).toUpperCase().padStart(2, '0');
      document.getElementById('oct').textContent = '0o' + v.toString(8);
      document.getElementById('sgn').textContent = v > 127 ? v - 256 : v;
      document.getElementById('ch').textContent = v >= 32 && v < 127 ? `'${String.fromCharCode(v)}'` : '（表示できない文字）';
    }
    document.getElementById('dec').oninput = (e) => { v = Math.max(0, Math.min(255, e.target.value | 0)); show(); };
    show();
    if (window.THUMB) setInterval(() => { v = (v + 1) % 256; show(); }, 200);
  },
}, {
  id: 'dt-mail-merge', c: 'data', lv: 2,
  t: '差し込み印刷', y: 'さしこみいんさつ',
  tags: ['テンプレート', 'CSV', '差し込み', '一括作成'],
  d: '{名前} のような差し込み口を書いた文面と、名前の一覧（CSV）から、宛名の違う文面をまとめて作る。年賀状や案内状の文面づくりに。',
  html: `<div class="two"><label>文面 <textarea id="tpl" rows="7">{名前} 様

いつもお世話になっております。
{日付} の{会}にて、{名前}様にお目にかかれるのを楽しみにしております。</textarea></label><label>一覧（1行目は見出し） <textarea id="csv" rows="7">名前,会,日付
山田 花子,勉強会,12月1日
佐藤 一郎,忘年会,12月20日
鈴木 次郎,発表会,1月10日</textarea></label></div><div id="out" class="out"></div>`,
  css: `body { padding: 10px; background: #f7f3ea; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } label { display: grid; gap: 4px; font-size: 13px; } textarea { font-size: 13px; } .out { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; margin-top: 8px; } .out article { background: #fff; padding: 10px; border-radius: 8px; white-space: pre-wrap; font: 13px/1.8 serif; box-shadow: 0 1px 4px #0002; border-top: 4px solid #c23b22; }`,
  js() {
    function run() {
      const [head, ...rows] = document.getElementById('csv').value.trim().split('\n').map((l) => l.split(',').map((s) => s.trim()));
      const tpl = document.getElementById('tpl').value;
      document.getElementById('out').replaceChildren(...rows.map((r) => {
        const a = document.createElement('article');
        a.textContent = tpl.replace(/\{([^}]+)\}/g, (m, k) => { const i = head.indexOf(k); return i >= 0 ? r[i] ?? '' : m; });
        return a;
      }));
    }
    document.getElementById('tpl').addEventListener('input', run);
    document.getElementById('csv').addEventListener('input', run);
    run();
  },
}, {
  id: 'dt-text-tools', c: 'data', lv: 1,
  t: '文字の一括変換', y: 'もじのいっかつへんかん',
  tags: ['文字変換', '全角半角', '重複削除', '並べ替え'],
  d: '貼り付けた文字に、大文字・小文字・全角・半角・ひらがな・カタカナ・空白の削除・行の並べ替え・重複行の削除をボタン1つでかける。続けて押せば重ねがけになる。',
  html: `<textarea id="t" rows="8" aria-label="変換する文字">ｈｅｌｌｏ　ワールド
みかん
りんご
みかん
  前後に空白
ﾊﾝｶｸｶﾅ</textarea><div class="bar" id="bar"></div>`,
  css: `body { padding: 10px; display: grid; gap: 8px; align-content: start; background: #f2f3f6; } textarea { font: 14px ui-monospace, monospace; } .bar { display: flex; flex-wrap: wrap; gap: 6px; }`,
  js() {
    const t = document.getElementById('t');
    const ops = {
      大文字: (s) => s.toUpperCase(), 小文字: (s) => s.toLowerCase(),
      半角に: (s) => s.normalize('NFKC'), 全角に: (s) => s.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)),
      ひらがなに: (s) => s.normalize('NFKC').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)),
      カタカナに: (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)),
      '前後の空白を削除': (s) => s.split('\n').map((l) => l.trim()).join('\n'),
      '行を並べ替え': (s) => s.split('\n').sort((a, b) => a.localeCompare(b, 'ja')).join('\n'),
      '重複行を削除': (s) => [...new Set(s.split('\n'))].join('\n'),
      '空行を削除': (s) => s.split('\n').filter((l) => l.trim()).join('\n'),
    };
    const bar = document.getElementById('bar');
    Object.entries(ops).forEach(([k, f]) => { const b = document.createElement('button'); b.textContent = k; b.onclick = () => { t.value = f(t.value); }; bar.append(b); });
  },
});
