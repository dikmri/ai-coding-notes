/* そのまま使えるアプリ
 * 中核の計算は core（DOM を使わない純粋な関数）に分け、tests/apps.test.mjs で確かめている。
 * 記録はブラウザの localStorage に保存する（so: 1 で保存を許す）。日付は時差でずれないよう "YYYY-MM-DD" の文字で持つ */
dekiru.add({
  id: 'app-spreadsheet', c: 'app', lv: 3, so: 1,
  t: '数式が使える表計算', y: 'すうしきがつかえるひょうけいさん',
  tags: ['表計算', 'スプレッドシート', '構文解析', '再計算'],
  d: 'セルに数や文字、=B2*C2 や =SUM(D2:D4) のような式を書くと、関係するセルが自動で計算し直される。SUM・AVERAGE・MIN・MAX・COUNT・ROUND・ABS・IF が使え、循環参照や0での割り算はエラーとして表示する。矢印キーで移動し、Enter で編集する。中身はブラウザに保存される。',
  p: '式は「足し算・掛け算・べき乗」の順に強さの違う関数を呼び合う再帰下降構文解析で計算している。計算中のセルにもう一度たどり着いたら循環参照と判定する。',
  html: `
    <div class="sheet-app">
      <div class="bar"><b id="nm" class="nm">A1</b><label class="fxl" for="fx">fx</label><input id="fx" spellcheck="false" autocomplete="off" aria-label="選んだセルの中身">
        <button id="showf" aria-pressed="false">式を表示</button><button id="csv">CSVをコピー</button><button id="reset">見本に戻す</button></div>
      <div class="wrap" id="wrap"><table id="grid" role="grid" aria-label="表計算"></table></div>
      <p class="hint" id="msg">矢印キーで移動、Enter か文字を打つと編集、Delete で消去</p>
    </div>`,
  css: `
    body { background: #eef0ee; }
    .sheet-app { height: 100%; display: flex; flex-direction: column; }
    .bar { display: flex; gap: 6px; align-items: center; padding: 6px 8px; background: #fff; border-bottom: 1px solid #d6dbd6; font-size: 13px; flex-wrap: wrap; }
    .nm { min-width: 3.5em; font: 700 13px ui-monospace, monospace; color: #1d6f42; }
    .fxl { font: italic 700 13px serif; color: #777; }
    #fx { flex: 1; min-width: 160px; font: 13px ui-monospace, monospace; }
    .wrap { flex: 1; overflow: auto; }
    table { border-collapse: collapse; font: 13px system-ui, sans-serif; background: #fff; }
    th { position: sticky; top: 0; background: #f3f5f3; color: #555; font-weight: 600; min-width: 34px; border: 1px solid #dde2dd; padding: 2px 4px; z-index: 1; }
    tbody th { left: 0; position: sticky; z-index: 1; }
    td { width: 92px; min-width: 92px; height: 24px; border: 1px solid #e3e7e3; padding: 0 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 92px; cursor: cell; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.err { color: #c23b22; font-weight: 700; }
    td.f { background: #f7fbf8; }
    td:focus { outline: 2px solid #1d6f42; outline-offset: -2px; }
    td input { width: 100%; border: 0; padding: 0; font: inherit; outline: none; background: #fffbe0; }
    .hint { margin: 0; padding: 4px 8px; font-size: 12px; color: #666; background: #fff; border-top: 1px solid #d6dbd6; }`,
  core() {
    // 列の番号 ⇔ 列の名前（0 → A, 25 → Z, 26 → AA）
    function colName(c) { let s = ''; c += 1; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
    function parseRef(ref) {
      const m = /^([A-Z]+)(\d+)$/.exec(String(ref).toUpperCase());
      if (!m) return null;
      let c = 0;
      for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
      return { c: c - 1, r: +m[2] - 1 };
    }
    const E = (code) => ({ code });
    function tokenize(s) {
      const re = /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"]|"")*")|([A-Za-z]+\d+(?::[A-Za-z]+\d+)?)|([A-Za-z_]+)|(<=|>=|<>|[-+*/^(),=<>&]))/y;
      const out = [];
      let i = 0;
      while (i < s.length) {
        re.lastIndex = i;
        const m = re.exec(s);
        if (!m) { if (/^\s*$/.test(s.slice(i))) break; throw E('#ERROR!'); }
        i = re.lastIndex;
        if (m[1]) out.push({ t: 'num', v: +m[1] });
        else if (m[2]) out.push({ t: 'str', v: m[2].slice(1, -1).replace(/""/g, '"') });
        else if (m[3]) out.push({ t: 'ref', v: m[3].toUpperCase() });
        else if (m[4]) out.push({ t: 'fn', v: m[4].toUpperCase() });
        else out.push({ t: 'op', v: m[5] });
      }
      return out;
    }
    const num = (v) => { if (v === null || v === undefined || v === '') return 0; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; throw E('#VALUE!'); };
    const flat = (args) => args.flat(Infinity).filter((v) => typeof v === 'number');
    const FN = {
      SUM: (a) => flat(a).reduce((x, y) => x + y, 0),
      AVERAGE: (a) => { const n = flat(a); if (!n.length) throw E('#DIV/0!'); return n.reduce((x, y) => x + y, 0) / n.length; },
      MIN: (a) => { const n = flat(a); return n.length ? Math.min(...n) : 0; },
      MAX: (a) => { const n = flat(a); return n.length ? Math.max(...n) : 0; },
      COUNT: (a) => flat(a).length,
      ROUND: (a) => { const k = 10 ** num(a[1] ?? 0); return Math.round(num(a[0]) * k) / k; },
      ABS: (a) => Math.abs(num(a[0])),
      IF: (a) => (a[0] ? a[1] : a[2] ?? false),
    };
    FN.AVG = FN.AVERAGE;
    // 再帰下降構文解析: 比較 < 文字の連結 < 足し引き < 掛け割り < べき乗 < 符号 < かっこ・数・参照・関数
    function evaluate(src, get, range) {
      const toks = tokenize(src);
      let p = 0;
      const peek = () => toks[p], take = () => toks[p++];
      const isOp = (...vs) => peek() && peek().t === 'op' && vs.includes(peek().v);
      function cmp() {
        let a = cat();
        while (isOp('=', '<>', '<', '>', '<=', '>=')) {
          const op = take().v, b = cat();
          a = op === '=' ? a === b : op === '<>' ? a !== b : op === '<' ? num(a) < num(b) : op === '>' ? num(a) > num(b) : op === '<=' ? num(a) <= num(b) : num(a) >= num(b);
        }
        return a;
      }
      function cat() { let a = add(); while (isOp('&')) { take(); a = String(a ?? '') + String(add() ?? ''); } return a; }
      function add() { let a = mul(); while (isOp('+', '-')) { const op = take().v, b = mul(); a = op === '+' ? num(a) + num(b) : num(a) - num(b); } return a; }
      function mul() { let a = pow(); while (isOp('*', '/')) { const op = take().v, b = pow(); if (op === '/') { if (num(b) === 0) throw E('#DIV/0!'); a = num(a) / num(b); } else a = num(a) * num(b); } return a; }
      function pow() { const a = unary(); if (isOp('^')) { take(); return num(a) ** num(pow()); } return a; }
      function unary() { if (isOp('-')) { take(); return -num(unary()); } if (isOp('+')) { take(); return num(unary()); } return primary(); }
      function primary() {
        const t = take();
        if (!t) throw E('#ERROR!');
        if (t.t === 'num' || t.t === 'str') return t.v;
        if (t.t === 'ref') { if (t.v.includes(':')) { const [a, b] = t.v.split(':'); return range(a, b); } return get(t.v); }
        if (t.t === 'fn') {
          if (!isOp('(')) throw E('#NAME?');
          take();
          const args = [];
          if (!isOp(')')) { do { args.push(cmp()); } while (isOp(',') && take()); }
          if (!isOp(')')) throw E('#ERROR!');
          take();
          if (!FN[t.v]) throw E('#NAME?');
          return FN[t.v](args);
        }
        if (t.t === 'op' && t.v === '(') { const v = cmp(); if (!isOp(')')) throw E('#ERROR!'); take(); return v; }
        throw E('#ERROR!');
      }
      const v = cmp();
      if (p < toks.length || Array.isArray(v)) throw E(p < toks.length ? '#ERROR!' : '#VALUE!');
      return v;
    }
    // 全部のセルを計算する。計算中のセルにもう一度来たら循環参照（#CIRC!）
    function computeSheet(raw) {
      const cells = {};
      for (const [k, v] of Object.entries(raw)) cells[k.toUpperCase()] = String(v);
      const out = {}, state = {}, errs = new Set();
      function value(ref) {
        if (state[ref] === 2) return out[ref];
        if (state[ref] === 1) throw E('#CIRC!');
        const src = cells[ref];
        if (src === undefined || src === '') return null;
        state[ref] = 1;
        let v;
        try { v = src.startsWith('=') ? evaluate(src.slice(1), get, range) : /^-?\d+(\.\d+)?$/.test(src.trim()) ? +src : src; }
        catch (e) { v = (e && e.code) || '#ERROR!'; errs.add(ref); }
        state[ref] = 2;
        out[ref] = v;
        return v;
      }
      function get(ref) { ref = ref.toUpperCase(); const v = value(ref); if (errs.has(ref)) throw E(v); return v; }
      function range(a, b) {
        const p = parseRef(a), q = parseRef(b);
        if (!p || !q) throw E('#REF!');
        const vals = [];
        for (let r = Math.min(p.r, q.r); r <= Math.max(p.r, q.r); r++) for (let c = Math.min(p.c, q.c); c <= Math.max(p.c, q.c); c++) vals.push(get(colName(c) + (r + 1)));
        return vals;
      }
      for (const k of Object.keys(cells)) value(k);
      return out;
    }
  },
  js() {
    const COLS = 10, ROWS = 30, KEY = 'dekiru-sheet';
    const SEED = { A1: '品目', B1: '単価', C1: '個数', D1: '小計', A2: 'りんご', B2: '120', C2: '3', D2: '=B2*C2', A3: 'みかん', B3: '80', C3: '10', D3: '=B3*C3', A4: 'ぶどう', B4: '450', C4: '1', D4: '=B4*C4',
      A6: '合計', D6: '=SUM(D2:D4)', A7: '平均の単価', D7: '=ROUND(AVERAGE(B2:B4), 1)', A8: '300円以上の品', D8: '=IF(MAX(B2:B4)>=300, "ある", "ない")', A9: '消費税込み', D9: '=ROUND(D6*1.08)', F1: '好きなセルに =A1+B1 のような式を書けます' };
    let raw;
    try { raw = JSON.parse(localStorage.getItem(KEY)) || { ...SEED }; } catch { raw = { ...SEED }; }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(raw)); } catch { /* 保存できない環境 */ } };
    const grid = document.getElementById('grid'), fx = document.getElementById('fx');
    let values = {}, sel = { c: 0, r: 0 }, editing = null, showF = false;
    const key = (c, r) => colName(c) + (r + 1);
    grid.innerHTML = '<thead><tr><th></th>' + Array.from({ length: COLS }, (_, c) => `<th scope="col">${colName(c)}</th>`).join('') + '</tr></thead><tbody>' +
      Array.from({ length: ROWS }, (_, r) => `<tr><th scope="row">${r + 1}</th>${Array.from({ length: COLS }, (_, c) => `<td role="gridcell" tabindex="-1" data-c="${c}" data-r="${r}"></td>`).join('')}</tr>`).join('') + '</tbody>';
    const td = (c, r) => grid.querySelector(`td[data-c="${c}"][data-r="${r}"]`);
    const fmt = (v) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('ja-JP') : (+v.toFixed(6)).toLocaleString('ja-JP', { maximumFractionDigits: 6 })) : String(v));
    function render() {
      values = computeSheet(raw);
      for (const cell of grid.querySelectorAll('td')) {
        const k = key(+cell.dataset.c, +cell.dataset.r), src = raw[k], v = values[k];
        if (cell === editing) continue;
        cell.textContent = showF ? src ?? '' : fmt(v);
        cell.classList.toggle('num', typeof v === 'number');
        cell.classList.toggle('f', !!src && src.startsWith('='));
        cell.classList.toggle('err', !!src && src.startsWith('=') && typeof v === 'string' && v.startsWith('#'));
      }
    }
    function select(c, r, moveFocus = true) {
      c = Math.max(0, Math.min(COLS - 1, c)); r = Math.max(0, Math.min(ROWS - 1, r));
      td(sel.c, sel.r).tabIndex = -1; td(sel.c, sel.r).removeAttribute('aria-selected');
      sel = { c, r };
      const cell = td(c, r);
      cell.tabIndex = 0; cell.setAttribute('aria-selected', 'true');
      // 開いた直後に焦点を奪ったり、外のページを動かしたりしないよう、操作されたときだけ移す
      if (moveFocus) { cell.focus(); cell.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      fx.value = raw[key(c, r)] ?? '';
      document.getElementById('nm').textContent = key(c, r);
    }
    function commit(text) {
      const k = key(sel.c, sel.r);
      if (text === '') delete raw[k]; else raw[k] = text;
      save(); render(); fx.value = raw[k] ?? '';
    }
    function startEdit(initial) {
      const cell = td(sel.c, sel.r);
      editing = cell;
      const inp = document.createElement('input');
      inp.value = initial ?? raw[key(sel.c, sel.r)] ?? '';
      cell.textContent = ''; cell.append(inp); inp.focus();
      let done = false;
      const finish = (keep, move) => { if (done) return; done = true; editing = null; if (keep) commit(inp.value); else render(); if (move) select(sel.c + move[0], sel.r + move[1]); else cell.focus(); };
      inp.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') { e.preventDefault(); finish(true, [0, 1]); }
        else if (e.key === 'Tab') { e.preventDefault(); finish(true, [e.shiftKey ? -1 : 1, 0]); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        e.stopPropagation();
      });
      inp.addEventListener('blur', () => finish(true));
    }
    grid.addEventListener('click', (e) => { const cell = e.target.closest('td'); if (cell && cell !== editing) select(+cell.dataset.c, +cell.dataset.r); });
    grid.addEventListener('dblclick', (e) => { if (e.target.closest('td')) startEdit(); });
    grid.addEventListener('keydown', (e) => {
      if (editing || e.ctrlKey || e.metaKey || e.altKey) return;
      const mv = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
      if (mv) {
        const nc = sel.c + mv[0], nr = sel.r + mv[1];
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) return; // 端では横取りせず、ページのスクロールに任せる
        e.preventDefault(); select(nc, nr); return;
      }
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(); }
      else if (e.key === 'Tab') { if ((e.shiftKey && sel.c > 0) || (!e.shiftKey && sel.c < COLS - 1)) { e.preventDefault(); select(sel.c + (e.shiftKey ? -1 : 1), sel.r); } }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); commit(''); }
      else if (e.key.length === 1) { e.preventDefault(); startEdit(e.key); }
    });
    fx.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !(e.isComposing || e.keyCode === 229)) { e.preventDefault(); commit(fx.value); select(sel.c, sel.r + 1); } });
    fx.addEventListener('change', () => commit(fx.value));
    document.getElementById('showf').onclick = (e) => { showF = !showF; e.target.setAttribute('aria-pressed', showF); render(); };
    document.getElementById('reset').onclick = () => { raw = { ...SEED }; save(); render(); select(0, 0, false); };
    document.getElementById('csv').onclick = async () => {
      let maxC = 0, maxR = 0;
      for (const k of Object.keys(raw)) { const p = parseRef(k); if (p) { maxC = Math.max(maxC, p.c); maxR = Math.max(maxR, p.r); } }
      const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
      const csv = Array.from({ length: maxR + 1 }, (_, r) => Array.from({ length: maxC + 1 }, (_, c) => q(fmt(values[key(c, r)]).replace(/,/g, ''))).join(',')).join('\n');
      try { await navigator.clipboard.writeText(csv); document.getElementById('msg').textContent = 'CSV をコピーしました（計算した値）'; } catch { document.getElementById('msg').textContent = 'コピーできませんでした'; }
    };
    render();
    td(0, 0).tabIndex = 0;
    select(3, 5, false);
    if (window.THUMB) { let i = 0; setInterval(() => { raw.C3 = String(5 + (i++ % 10)); render(); }, 900); }
  },
}, {
  id: 'app-kakeibo', c: 'app', lv: 3, so: 1,
  t: '家計簿', y: 'かけいぼ',
  tags: ['家計簿', 'グラフ', '集計', 'localStorage'],
  d: '収入と支出を日付・分類・メモ付きで記録し、月ごとの収入・支出・残りと、分類ごとの割合（ドーナツグラフ）、半年間の残りの推移（棒グラフ）を見せる。記録はブラウザに保存され、CSV でも書き出せる。',
  p: '日付は Date ではなく "2026-11-17" という文字のまま保存している。時差の違う場所で開いても日付がずれず、月の絞り込みも文字の先頭が "2026-11" かどうかで済む。',
  html: `
    <div class="kb">
      <header><h1>家計簿</h1><label>月 <input type="month" id="ym"></label></header>
      <section class="sum"><div><small>収入</small><b id="inc"></b></div><div><small>支出</small><b id="exp"></b></div><div class="b"><small>残り</small><b id="bal"></b></div></section>
      <div class="cols">
        <form id="f">
          <label>日付 <input type="date" id="date" required></label>
          <fieldset class="kind"><label><input type="radio" name="kind" value="out" checked> 支出</label><label><input type="radio" name="kind" value="in"> 収入</label></fieldset>
          <label>金額 <input type="number" id="amt" min="1" step="1" required inputmode="numeric"></label>
          <label>分類 <select id="cat"></select></label>
          <label>メモ <input id="memo" maxlength="40"></label>
          <button class="add">記録する</button>
        </form>
        <div class="charts"><svg id="donut" viewBox="0 0 120 120" role="img" aria-label="分類ごとの支出"></svg><ul id="legend"></ul><svg id="bars" viewBox="0 0 320 120" role="img" aria-label="半年間の残り"></svg></div>
      </div>
      <table><thead><tr><th>日付</th><th>分類</th><th>メモ</th><th class="r">金額</th><th></th></tr></thead><tbody id="list"></tbody></table>
      <div class="foot"><button id="csv">この月をCSVでコピー</button><button id="seed">見本の記録を入れる</button><span id="msg"></span></div>
    </div>`,
  css: `
    body { background: #f5f2ea; }
    .kb { max-width: 820px; margin: 0 auto; padding: 12px; display: grid; gap: 10px; }
    header { display: flex; justify-content: space-between; align-items: center; } h1 { margin: 0; font: 800 22px serif; }
    .sum { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .sum div { background: #fff; border-radius: 12px; padding: 8px 12px; box-shadow: 0 1px 3px #0001; } .sum small { color: #888; } .sum b { display: block; font: 800 20px ui-monospace, monospace; font-variant-numeric: tabular-nums; }
    .sum .b b { color: #2f855a; } .sum .b b.minus { color: #c23b22; }
    .cols { display: grid; grid-template-columns: 1fr 1.2fr; gap: 10px; }
    form, .charts { background: #fff; border-radius: 12px; padding: 10px; display: grid; gap: 6px; align-content: start; }
    form label { display: grid; gap: 2px; font-size: 12px; color: #555; } .kind { border: 0; padding: 0; margin: 0; display: flex; gap: 12px; font-size: 13px; }
    .add { background: #c23b22; color: #fff; border-color: #c23b22; font-weight: 700; }
    .charts { grid-template-columns: 120px 1fr; align-items: center; } #bars { grid-column: 1 / -1; }
    #legend { list-style: none; margin: 0; padding: 0; font-size: 12px; display: grid; gap: 2px; } #legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; font-size: 13px; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; } .r { text-align: right; font-variant-numeric: tabular-nums; }
    td.in { color: #2f855a; } td button { border: 0; background: none; color: #c23b22; }
    .foot { display: flex; gap: 8px; align-items: center; font-size: 12px; flex-wrap: wrap; }
    @media (width < 600px) { .cols { grid-template-columns: 1fr; } }`,
  core() {
    // 指定した月（"YYYY-MM"）の収入・支出・残りと、支出の分類ごとの合計（多い順）
    function summarize(items, ym) {
      let income = 0, expense = 0;
      const cats = new Map();
      for (const it of items) {
        if (!it.date.startsWith(ym)) continue;
        if (it.kind === 'in') income += it.amount;
        else { expense += it.amount; cats.set(it.cat, (cats.get(it.cat) || 0) + it.amount); }
      }
      return { income, expense, balance: income - expense, byCategory: [...cats].sort((a, b) => b[1] - a[1]) };
    }
  },
  js() {
    const KEY = 'dekiru-kakeibo';
    const CATS = { out: ['食費', '日用品', '交通', '住まい', '光熱', '通信', '趣味', '医療', 'その他'], in: ['給料', '臨時', 'その他'] };
    const COLORS = ['#c23b22', '#f0a43a', '#2f855a', '#26407c', '#7a5cff', '#3fb7e8', '#e8336d', '#8a6a4f', '#999'];
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date(), today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const ymOf = (y, m) => { const d = new Date(y, m - 1, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
    const yen = (n) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(n);
    let items;
    try { items = JSON.parse(localStorage.getItem(KEY)) || null; } catch { items = null; }
    function seed() {
      const out = [];
      for (let k = 5; k >= 0; k--) {
        const ym = ymOf(now.getFullYear(), now.getMonth() + 1 - k);
        out.push({ date: ym + '-01', kind: 'in', amount: 240000 + (k % 3) * 8000, cat: '給料', memo: '見本' });
        [['食費', 42000], ['住まい', 78000], ['光熱', 12000], ['通信', 6000], ['交通', 9000], ['趣味', 15000 + k * 4000], ['日用品', 7000]].forEach(([cat, a], i) => out.push({ date: `${ym}-${pad(3 + i * 3)}`, kind: 'out', amount: a + ((k * 1731 + i * 977) % 6000), cat, memo: '見本' }));
      }
      return out;
    }
    if (!items) items = seed();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* 保存できない環境 */ } };
    const $ = (id) => document.getElementById(id);
    $('ym').value = today.slice(0, 7); $('date').value = today;
    const fillCats = () => { const k = document.querySelector('[name=kind]:checked').value; $('cat').innerHTML = CATS[k].map((c) => `<option>${c}</option>`).join(''); };
    function render() {
      const ym = $('ym').value, s = summarize(items, ym);
      $('inc').textContent = yen(s.income); $('exp').textContent = yen(s.expense); $('bal').textContent = yen(s.balance); $('bal').classList.toggle('minus', s.balance < 0);
      // ドーナツ: 円周 100 の破線で描く
      let off = 0, svg = '<circle cx="60" cy="60" r="40" fill="none" stroke="#eee" stroke-width="22"/>';
      s.byCategory.forEach(([cat, v]) => { const pct = (v / (s.expense || 1)) * 100, col = COLORS[CATS.out.indexOf(cat)] || '#999'; svg += `<circle cx="60" cy="60" r="40" pathLength="100" fill="none" stroke="${col}" stroke-width="22" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"><title>${cat} ${yen(v)}</title></circle>`; off += pct; });
      $('donut').innerHTML = svg;
      $('legend').innerHTML = s.byCategory.map(([cat, v]) => `<li><i style="background:${COLORS[CATS.out.indexOf(cat)] || '#999'}"></i>${cat} ${yen(v)}（${Math.round((v / s.expense) * 100)}%）</li>`).join('') || '<li>この月の支出はまだありません</li>';
      // 半年の残り
      const [y, m] = ym.split('-').map(Number), months = Array.from({ length: 6 }, (_, i) => ymOf(y, m - 5 + i)), bals = months.map((x) => summarize(items, x).balance), max = Math.max(1, ...bals.map(Math.abs));
      $('bars').innerHTML = '<line x1="0" x2="320" y1="60" y2="60" stroke="#ccc"/>' + months.map((x, i) => { const h = (Math.abs(bals[i]) / max) * 48, px = 10 + i * 52; return `<rect x="${px}" y="${bals[i] >= 0 ? 60 - h : 60}" width="34" height="${Math.max(1, h)}" rx="3" fill="${bals[i] >= 0 ? '#2f855a' : '#c23b22'}"><title>${x} ${yen(bals[i])}</title></rect><text x="${px + 17}" y="116" font-size="10" text-anchor="middle" fill="#777">${+x.slice(5)}月</text>`; }).join('');
      const rows = items.map((it, i) => [it, i]).filter(([it]) => it.date.startsWith(ym)).sort((a, b) => b[0].date.localeCompare(a[0].date));
      $('list').innerHTML = rows.map(([it, i]) => `<tr><td>${+it.date.slice(5, 7)}/${+it.date.slice(8)}</td><td>${it.cat}</td><td></td><td class="r ${it.kind}">${it.kind === 'in' ? '+' : '−'}${yen(it.amount)}</td><td><button data-i="${i}" aria-label="消す">✕</button></td></tr>`).join('') || '<tr><td colspan="5">この月の記録はありません</td></tr>';
      [...$('list').querySelectorAll('tr')].forEach((tr, k) => { if (rows[k]) tr.children[2].textContent = rows[k][0].memo || ''; });
    }
    $('f').addEventListener('submit', (e) => {
      e.preventDefault();
      items.push({ date: $('date').value, kind: document.querySelector('[name=kind]:checked').value, amount: Math.round(+$('amt').value), cat: $('cat').value, memo: $('memo').value.trim() });
      save(); $('amt').value = ''; $('memo').value = ''; $('ym').value = $('date').value.slice(0, 7); render(); $('amt').focus();
    });
    document.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', fillCats));
    $('list').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { items.splice(+b.dataset.i, 1); save(); render(); } });
    $('ym').addEventListener('input', render);
    $('seed').onclick = () => { items = items.filter((x) => x.memo !== '見本').concat(seed()); save(); render(); };
    $('csv').onclick = async () => {
      const ym = $('ym').value, lines = ['日付,種類,分類,金額,メモ', ...items.filter((x) => x.date.startsWith(ym)).map((x) => [x.date, x.kind === 'in' ? '収入' : '支出', x.cat, x.amount, `"${(x.memo || '').replace(/"/g, '""')}"`].join(','))];
      try { await navigator.clipboard.writeText(lines.join('\n')); $('msg').textContent = 'CSV をコピーしました'; } catch { $('msg').textContent = 'コピーできませんでした'; }
    };
    fillCats(); render();
  },
}, {
  id: 'app-flashcards', c: 'app', lv: 3, so: 1,
  t: '忘れる前に復習する単語帳', y: 'わすれるまえにふくしゅうするたんごちょう',
  tags: ['単語帳', '間隔反復', 'SM-2', '学習'],
  d: '表に問題、裏に答えを書いたカードを、覚え具合に応じて「1日後・6日後・15日後…」と間隔を空けて出し直す（間隔反復）。答えを見てから「もう一度・難しい・できた・簡単」を選ぶと次の出題日が決まる。カードの追加・まとめての取り込みもできる。',
  p: '次の間隔 = 前の間隔 × 覚えやすさ。答えるたびに覚えやすさを少しずつ上げ下げする SM-2 という古典的な方式を使っている。',
  html: `
    <div class="fc">
      <nav role="tablist" aria-label="画面"><button role="tab" aria-selected="true" data-v="study">復習</button><button role="tab" aria-selected="false" data-v="cards">カード</button><button role="tab" aria-selected="false" data-v="stats">記録</button></nav>
      <section id="study" class="v">
        <p class="due" id="due"></p>
        <div class="card" id="card"><div class="front" id="front"></div><div class="back" id="back" hidden></div></div>
        <button id="show" class="show">答えを見る（スペース）</button>
        <div class="grade" id="grade" hidden></div>
      </section>
      <section id="cards" class="v" hidden>
        <form id="add"><input id="q" placeholder="表（問題）" required aria-label="表"><input id="a" placeholder="裏（答え）" required aria-label="裏"><button>足す</button></form>
        <details><summary>まとめて取り込む（1行に「表[タブ]裏」）</summary><textarea id="bulk" rows="4"></textarea><button id="import">取り込む</button></details>
        <ul id="list"></ul>
      </section>
      <section id="stats" class="v" hidden><dl id="st"></dl></section>
    </div>`,
  css: `
    body { background: #eef2f7; }
    .fc { max-width: 560px; margin: 0 auto; padding: 12px; display: grid; gap: 10px; }
    nav { display: flex; gap: 4px; } nav button { flex: 1; border-radius: 10px; } nav [aria-selected=true] { background: #26407c; color: #fff; }
    .due { margin: 0; color: #555; font-size: 13px; text-align: center; }
    .card { min-height: 180px; background: #fff; border-radius: 16px; box-shadow: 0 3px 12px #0002; display: grid; place-content: center; text-align: center; padding: 16px; gap: 10px; }
    .front { font: 800 26px serif; } .back { font-size: 18px; color: #26407c; border-top: 1px dashed #ccd; padding-top: 10px; }
    .show { justify-self: center; } .grade { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .grade button { display: grid; gap: 2px; padding: 8px 4px; border-radius: 10px; font-weight: 700; } .grade small { font-weight: 400; color: #777; font-size: 11px; }
    .grade button:nth-child(1) { border-color: #c23b22; } .grade button:nth-child(4) { border-color: #2f855a; }
    #add { display: flex; gap: 6px; } #add input { flex: 1; min-width: 0; }
    #list { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; max-height: 50vh; overflow: auto; font-size: 13px; }
    #list li { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 6px; background: #fff; padding: 6px 8px; border-radius: 8px; align-items: center; } #list small { color: #888; }
    #list button { border: 0; background: none; color: #c23b22; }
    dl { display: grid; grid-template-columns: auto auto; gap: 6px 14px; background: #fff; padding: 14px; border-radius: 12px; margin: 0; } dt { color: #777; } dd { margin: 0; font-weight: 800; }
    textarea { width: 100%; }`,
  core() {
    // "YYYY-MM-DD" → 1970-01-01 からの日数（時差の影響を受けない）
    function dayNumber(iso) { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
    // SM-2: quality は 0〜5。3未満は覚え直し
    function review(card, quality, today) {
      let { reps, interval, ease } = card;
      if (quality < 3) { reps = 0; interval = 1; }
      else { interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(interval * ease); reps += 1; }
      ease = Math.max(1.3, Math.round((ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))) * 100) / 100);
      return { ...card, reps, interval, ease, due: today + interval };
    }
  },
  js() {
    const KEY = 'dekiru-cards';
    const now = new Date(), pad = (n) => String(n).padStart(2, '0');
    const today = dayNumber(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    const SEED = [['dialog', 'モーダルを作る標準の要素'], ['popover', '外を押すと閉じる浮き出し表示の属性'], ['fetch', 'ネットからデータを受け取る関数'], ['Promise', 'あとで決まる結果を表すもの'], ['flex', '一列に並べるレイアウト'], ['grid', '縦横の格子に並べるレイアウト'], ['canvas', '画素を自由に描く要素'], ['localStorage', 'ブラウザに文字を保存する所'], ['Web Worker', '重い計算を別の流れで動かす仕組み'], ['@keyframes', 'CSS アニメーションの途中の姿を書く規則'], ['aria-label', '読み上げ用の名前'], ['requestAnimationFrame', '次の描画の直前に呼んでもらう関数']]
      .map(([front, back]) => ({ front, back, reps: 0, interval: 0, ease: 2.5, due: today }));
    let cards, log;
    try { ({ cards, log } = JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* 読めない */ }
    cards = cards || SEED; log = log || {};
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ cards, log })); } catch { /* 保存できない */ } };
    const $ = (id) => document.getElementById(id);
    let current = null;
    const GR = [[1, 'もう一度'], [3, '難しい'], [4, 'できた'], [5, '簡単']];
    const human = (d) => (d <= 1 ? '明日' : d < 30 ? `${d}日後` : `${Math.round(d / 30)}か月後`);
    function next() {
      const dueCards = cards.filter((c) => c.due <= today);
      $('due').textContent = `今日の復習 残り ${dueCards.length} 枚 ・ 全 ${cards.length} 枚`;
      current = dueCards.sort((a, b) => a.due - b.due)[0] || null;
      $('back').hidden = true; $('grade').hidden = true; $('show').hidden = !current;
      if (!current) { $('front').textContent = '今日の分は終わりました'; return; }
      $('front').textContent = current.front; $('back').textContent = current.back;
    }
    function reveal() {
      if (!current) return;
      $('back').hidden = false; $('show').hidden = true; $('grade').hidden = false;
      $('grade').innerHTML = GR.map(([q, label], i) => `<button data-q="${q}">${label}<small>${human(review(current, q, today).interval)} ・ ${i + 1}</small></button>`).join('');
      if (!window.THUMB) $('grade').querySelector('button:nth-child(3)').focus();
    }
    function grade(q) {
      Object.assign(current, review(current, q, today));
      log[today] = (log[today] || 0) + 1;
      save(); next();
    }
    $('show').onclick = reveal;
    $('grade').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) grade(+b.dataset.q); });
    addEventListener('keydown', (e) => {
      if ($('study').hidden || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.code === 'Space' && !$('show').hidden) { e.preventDefault(); reveal(); }
      else if (!$('grade').hidden && /^[1-4]$/.test(e.key)) grade(GR[+e.key - 1][0]);
    });
    function list() {
      $('list').innerHTML = cards.map((c, i) => `<li><span></span><span></span><small>${c.due <= today ? '今日' : human(c.due - today)}</small><button data-i="${i}" aria-label="消す">✕</button></li>`).join('');
      [...$('list').children].forEach((li, i) => { li.children[0].textContent = cards[i].front; li.children[1].textContent = cards[i].back; });
    }
    $('list').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { cards.splice(+b.dataset.i, 1); save(); list(); } });
    $('add').onsubmit = (e) => { e.preventDefault(); cards.push({ front: $('q').value.trim(), back: $('a').value.trim(), reps: 0, interval: 0, ease: 2.5, due: today }); save(); $('q').value = $('a').value = ''; $('q').focus(); list(); };
    $('import').onclick = () => { for (const line of $('bulk').value.split('\n')) { const [f, b] = line.split(/\t|,/); if (f && b) cards.push({ front: f.trim(), back: b.trim(), reps: 0, interval: 0, ease: 2.5, due: today }); } $('bulk').value = ''; save(); list(); };
    function stats() {
      const learned = cards.filter((c) => c.reps >= 2).length;
      let streak = 0; for (let d = today; log[d]; d--) streak++;
      const week = Array.from({ length: 7 }, (_, i) => log[today - i] || 0).reduce((a, b) => a + b, 0);
      $('st').innerHTML = `<dt>全部のカード</dt><dd>${cards.length} 枚</dd><dt>覚えたカード（2回以上連続で正解）</dt><dd>${learned} 枚</dd><dt>今日の復習</dt><dd>${log[today] || 0} 回</dd><dt>この7日間</dt><dd>${week} 回</dd><dt>続けている日数</dt><dd>${streak} 日</dd><dt>次に一番遠いカード</dt><dd>${human(Math.max(0, ...cards.map((c) => c.due - today)))}</dd>`;
    }
    document.querySelector('nav').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      document.querySelectorAll('nav button').forEach((x) => x.setAttribute('aria-selected', x === b));
      document.querySelectorAll('.v').forEach((s) => { s.hidden = s.id !== b.dataset.v; });
      if (b.dataset.v === 'cards') list(); if (b.dataset.v === 'stats') stats(); if (b.dataset.v === 'study') next();
    });
    next();
    if (window.THUMB) setInterval(() => { if (!current) return; if ($('back').hidden) reveal(); else { Object.assign(current, { due: today }); next(); } }, 1200);
  },
}, {
  id: 'app-pixel-editor', c: 'app', lv: 3, so: 1,
  t: 'ドット絵エディタ', y: 'どっとええでぃた',
  tags: ['ドット絵', 'お絵かき', '塗りつぶし', '元に戻す'],
  d: 'ペン・消しゴム・塗りつぶし・スポイト・左右対称の描き方でドット絵を描く。16〜32マスの大きさ、色の選択、元に戻す・やり直す（Ctrl+Z / Ctrl+Y）ができ、描いた絵はブラウザに保存される。できた絵は等倍と拡大の PNG 画像として表示し、長押しや右クリックで保存できる。',
  p: '塗りつぶしは「同じ色の隣のマスへ広がっていく」探索。再帰ではなく自前の積み上げ（スタック）で回すので、大きな面でも止まらない。',
  html: `
    <div class="px">
      <div class="tools" role="toolbar" aria-label="道具">
        <button data-t="pen" aria-pressed="true">ペン</button><button data-t="erase" aria-pressed="false">消しゴム</button><button data-t="fill" aria-pressed="false">塗りつぶし</button><button data-t="pick" aria-pressed="false">スポイト</button>
        <label><input type="checkbox" id="mirror"> 左右対称</label>
        <select id="size" aria-label="大きさ"><option>16</option><option selected>24</option><option>32</option></select>
        <button id="undo" title="Ctrl+Z">元に戻す</button><button id="redo" title="Ctrl+Y">やり直す</button><button id="clear">全部消す</button>
      </div>
      <div class="main">
        <canvas id="c" aria-label="描くところ"></canvas>
        <div class="side">
          <div class="pal" id="pal"></div>
          <label>好きな色 <input type="color" id="col" value="#e0532f"></label>
          <p>できた絵（長押し・右クリックで保存）</p>
          <div class="out"><img id="o1" alt="等倍"><img id="o8" alt="8倍"></div>
          <button id="dl">PNGで保存</button>
        </div>
      </div>
    </div>`,
  css: `
    body { background: #2a2d36; color: #dde; touch-action: none; }
    .px { padding: 8px; display: grid; gap: 8px; }
    .tools { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 12px; }
    .tools [aria-pressed=true] { background: #ffd23f; color: #222; border-color: #ffd23f; }
    .main { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-start; }
    canvas { width: min(70vw, 60vh, 520px); aspect-ratio: 1; image-rendering: pixelated; cursor: crosshair; background: repeating-conic-gradient(#3a3d48 0 25%, #454856 0 50%) 0 0 / 16px 16px; border-radius: 6px; }
    .side { display: grid; gap: 6px; font-size: 12px; max-width: 200px; }
    .pal { display: grid; grid-template-columns: repeat(8, 22px); gap: 3px; }
    .pal button { width: 22px; height: 22px; padding: 0; border-radius: 4px; border: 2px solid transparent; }
    .pal button[aria-pressed=true] { border-color: #fff; }
    .out { display: flex; gap: 8px; align-items: end; } .out img { image-rendering: pixelated; background: #fff2; } #o8 { width: 96px; }`,
  core() {
    // 塗りつぶし（4方向に同じ色だけ広がる）。元の配列は変えず、新しい配列を返す
    function floodFill(grid, w, h, x, y, color) {
      const out = grid.slice(), from = out[y * w + x];
      if (from === color) return out;
      const stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
        const i = cy * w + cx;
        if (out[i] !== from) continue;
        out[i] = color;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      return out;
    }
    // 2点の間のマス目（ブレゼンハムの線）。速く動かしても線が途切れないようにする
    function linePoints(x0, y0, x1, y1) {
      const pts = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) { pts.push([x0, y0]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
      return pts;
    }
  },
  js() {
    const KEY = 'dekiru-pixel', c = document.getElementById('c'), x = c.getContext('2d');
    const PAL = ['#000000', '#3b3b3b', '#7d7d7d', '#ffffff', '#c23b22', '#e0532f', '#f0a43a', '#ffd23f', '#9bd36b', '#2f855a', '#3fb7e8', '#26407c', '#7a5cff', '#e8336d', '#f6c28b', '#8a5a3a'];
    let N = 24, g = [], tool = 'pen', color = '#e0532f', undo = [], redo = [], last = null;
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.g) { N = s.n; g = s.g; } } catch { /* 読めない */ }
    if (!g.length) { g = Array(N * N).fill(''); const heart = ['..XX...XX..', '.XXXX.XXXX.', 'XXXXXXXXXXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..XXXXXXX..', '...XXXXX...', '....XXX....', '.....X.....']; heart.forEach((row, r) => [...row].forEach((ch, k) => { if (ch === 'X') g[(7 + r) * N + 6 + k] = '#e8336d'; })); }
    document.getElementById('size').value = N;
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ n: N, g })); } catch { /* 保存できない */ } };
    function draw() {
      c.width = c.height = N * 20;
      x.clearRect(0, 0, c.width, c.height);
      g.forEach((col, i) => { if (col) { x.fillStyle = col; x.fillRect((i % N) * 20, Math.floor(i / N) * 20, 20, 20); } });
      x.strokeStyle = '#ffffff14'; x.beginPath();
      for (let k = 0; k <= N; k++) { x.moveTo(k * 20, 0); x.lineTo(k * 20, N * 20); x.moveTo(0, k * 20); x.lineTo(N * 20, k * 20); }
      x.stroke();
      const o = document.createElement('canvas'); o.width = o.height = N; const ox = o.getContext('2d');
      g.forEach((col, i) => { if (col) { ox.fillStyle = col; ox.fillRect(i % N, Math.floor(i / N), 1, 1); } });
      const url = o.toDataURL('image/png');
      document.getElementById('o1').src = url;
      const big = document.createElement('canvas'); big.width = big.height = N * 8; const bx = big.getContext('2d'); bx.imageSmoothingEnabled = false; bx.drawImage(o, 0, 0, N * 8, N * 8);
      document.getElementById('o8').src = big.toDataURL('image/png');
    }
    const cell = (e) => { const r = c.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * N), Math.floor(((e.clientY - r.top) / r.height) * N)]; };
    const push = () => { undo.push(g.slice()); if (undo.length > 100) undo.shift(); redo = []; };
    function plot(px, py) {
      if (px < 0 || py < 0 || px >= N || py >= N) return;
      const v = tool === 'erase' ? '' : color;
      g[py * N + px] = v;
      if (document.getElementById('mirror').checked) g[py * N + (N - 1 - px)] = v;
    }
    c.addEventListener('pointerdown', (e) => {
      const [px, py] = cell(e);
      if (tool === 'pick') { const v = g[py * N + px]; if (v) setColor(v); return; }
      push();
      if (tool === 'fill') { g = floodFill(g, N, N, px, py, color); draw(); save(); return; }
      c.setPointerCapture(e.pointerId); last = [px, py]; plot(px, py); draw();
    });
    c.addEventListener('pointermove', (e) => { if (!last) return; const p = cell(e); for (const [a, b] of linePoints(last[0], last[1], p[0], p[1])) plot(a, b); last = p; draw(); });
    c.addEventListener('pointerup', () => { if (last) save(); last = null; });
    const pal = document.getElementById('pal');
    function setColor(v) { color = v; document.getElementById('col').value = v; pal.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.c === v)); if (tool === 'erase' || tool === 'pick') setTool('pen'); }
    pal.innerHTML = PAL.map((v) => `<button data-c="${v}" style="background:${v}" aria-label="${v}" aria-pressed="false"></button>`).join('');
    pal.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) setColor(b.dataset.c); });
    document.getElementById('col').addEventListener('input', (e) => setColor(e.target.value));
    function setTool(t) { tool = t; document.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === t)); }
    document.querySelector('.tools').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) setTool(b.dataset.t); });
    const doUndo = () => { if (undo.length) { redo.push(g); g = undo.pop(); draw(); save(); } };
    const doRedo = () => { if (redo.length) { undo.push(g); g = redo.pop(); draw(); save(); } };
    document.getElementById('undo').onclick = doUndo; document.getElementById('redo').onclick = doRedo;
    addEventListener('keydown', (e) => { if (!(e.ctrlKey || e.metaKey)) return; if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); } if (e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); } });
    document.getElementById('clear').onclick = () => { push(); g = Array(N * N).fill(''); draw(); save(); };
    document.getElementById('size').onchange = (e) => { push(); const n2 = +e.target.value, ng = Array(n2 * n2).fill(''); for (let i = 0; i < Math.min(N, n2); i++) for (let k = 0; k < Math.min(N, n2); k++) ng[i * n2 + k] = g[i * N + k]; N = n2; g = ng; draw(); save(); };
    document.getElementById('dl').onclick = () => { const a = document.createElement('a'); a.href = document.getElementById('o8').src; a.download = 'dot.png'; a.click(); };
    setColor(color); draw();
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.3; const px = Math.round(N / 2 + Math.cos(t) * N * 0.35), py = Math.round(N / 2 + Math.sin(t * 1.3) * N * 0.35); color = PAL[Math.floor(t) % 16]; plot(px, py); draw(); }, 80); }
  },
}, {
  id: 'app-markdown-notes', c: 'app', lv: 3, so: 1,
  t: 'Markdownメモ帳', y: 'まーくだうんめもちょう',
  tags: ['メモ', 'Markdown', '検索', 'タグ'],
  d: '複数のメモを左の一覧で切り替えながら Markdown で書き、右で整形された見た目を確かめる。本文の #タグ で絞り込み、全文検索もできる。書くのをやめると自動で保存され、ページを閉じても残る。',
  html: `
    <div class="nt">
      <aside><div class="top"><input id="q" type="search" placeholder="メモを探す" aria-label="メモを探す"><button id="new" title="新しいメモ">＋</button></div><div class="tags" id="tags"></div><ul id="list"></ul></aside>
      <main><div class="bar"><span id="st"></span><button id="del">このメモを消す</button><button id="copy">Markdownをコピー</button></div><div class="two"><textarea id="ed" spellcheck="false" aria-label="本文"></textarea><article id="pv"></article></div></main>
    </div>`,
  css: `
    body { background: #f3f1ec; }
    .nt { height: 100%; display: grid; grid-template-columns: 220px 1fr; }
    aside { border-right: 1px solid #ddd5c6; display: flex; flex-direction: column; background: #faf8f3; min-height: 0; }
    .top { display: flex; gap: 4px; padding: 8px; } .top input { flex: 1; min-width: 0; }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 8px 6px; } .tags button { font-size: 11px; padding: 1px 8px; } .tags [aria-pressed=true] { background: #26407c; color: #fff; }
    #list { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; }
    #list li { padding: 8px 10px; border-bottom: 1px solid #eee7da; cursor: pointer; } #list li[aria-current=true] { background: #fff; border-left: 4px solid #c23b22; }
    #list b { display: block; font-size: 14px; } #list small { color: #888; font-size: 11px; }
    main { display: flex; flex-direction: column; min-width: 0; }
    .bar { display: flex; gap: 6px; align-items: center; padding: 6px 8px; font-size: 12px; color: #777; } .bar span { flex: 1; }
    .two { flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: 0; }
    textarea { border: 0; border-right: 1px solid #ddd5c6; padding: 12px; font: 14px/1.7 ui-monospace, monospace; resize: none; border-radius: 0; background: #fff; }
    article { padding: 4px 16px; overflow: auto; line-height: 1.8; background: #fff; } article code { background: #f2eee6; padding: 0 4px; border-radius: 4px; } article pre { background: #23211c; color: #eee; padding: 8px; border-radius: 6px; overflow: auto; } article .tag { color: #26407c; font-size: .9em; }
    @media (width < 640px) { .nt { grid-template-columns: 1fr; } aside { max-height: 34vh; } .two { grid-template-columns: 1fr; } }`,
  js() {
    const KEY = 'dekiru-notes', $ = (id) => document.getElementById(id);
    let notes;
    try { notes = JSON.parse(localStorage.getItem(KEY)); } catch { notes = null; }
    if (!notes || !notes.length) notes = [
      { id: 1, text: '# 買い物\n\n- 牛乳\n- 卵\n- **パン**（食パン）\n\n#買い物 #今週', at: Date.now() },
      { id: 2, text: '# 図鑑の感想\n\n立体の見本が楽しい。`requestAnimationFrame` の使い方を覚えた。\n\n> 小さく作って、つなげる。\n\n#勉強', at: Date.now() - 86400000 },
      { id: 3, text: '# アイデア\n\n1. 自分用の家計簿\n2. ドット絵で年賀状\n\n#アイデア #今週', at: Date.now() - 2 * 86400000 },
    ];
    let cur = notes[0].id, tag = '', timer = 0;
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(notes)); $('st').textContent = `保存しました（${new Date().toLocaleTimeString('ja-JP')}）`; } catch { $('st').textContent = '保存できません'; } };
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/(^|\s)#([^\s#]+)/g, '$1<span class="tag">#$2</span>');
    function md(src) {
      let html = '', list = null, code = null;
      const close = () => { if (list) { html += `</${list}>`; list = null; } };
      for (const l of src.split('\n')) {
        if (code !== null) { if (/^```/.test(l)) { html += `<pre><code>${esc(code)}</code></pre>`; code = null; } else code += (code ? '\n' : '') + l; continue; }
        let m;
        if (/^```/.test(l)) { close(); code = ''; }
        else if ((m = /^(#{1,3}) (.*)/.exec(l))) { close(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
        else if ((m = /^[-*] (.*)/.exec(l))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
        else if ((m = /^\d+\. (.*)/.exec(l))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
        else if ((m = /^> ?(.*)/.exec(l))) { close(); html += `<blockquote>${inline(m[1])}</blockquote>`; }
        else if (!l.trim()) close();
        else { close(); html += `<p>${inline(l)}</p>`; }
      }
      close();
      return html;
    }
    const title = (n) => (n.text.split('\n').find((l) => l.trim()) || '（空のメモ）').replace(/^#+\s*/, '').slice(0, 30);
    const tagsOf = (n) => [...n.text.matchAll(/(?:^|\s)#([^\s#]+)/g)].map((m) => m[1]);
    function renderList() {
      const q = $('q').value.trim().toLowerCase();
      const shown = notes.filter((n) => (!q || n.text.toLowerCase().includes(q)) && (!tag || tagsOf(n).includes(tag))).sort((a, b) => b.at - a.at);
      $('list').innerHTML = shown.map((n) => `<li data-id="${n.id}" aria-current="${n.id === cur}"><b></b><small>${new Date(n.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></li>`).join('') || '<li>見つかりません</li>';
      [...$('list').children].forEach((li, i) => { if (shown[i]) li.querySelector('b').textContent = title(shown[i]); });
      const all = [...new Set(notes.flatMap(tagsOf))];
      $('tags').innerHTML = all.map((t) => `<button data-t="${esc(t)}" aria-pressed="${t === tag}">#${esc(t)}</button>`).join('');
    }
    function open(id) { cur = id; const n = notes.find((x) => x.id === id); $('ed').value = n.text; $('pv').innerHTML = md(n.text); renderList(); }
    $('ed').addEventListener('input', () => {
      const n = notes.find((x) => x.id === cur); n.text = $('ed').value; n.at = Date.now();
      $('pv').innerHTML = md(n.text); $('st').textContent = '書いています…';
      clearTimeout(timer); timer = setTimeout(() => { save(); renderList(); }, 700);
    });
    $('list').addEventListener('click', (e) => { const li = e.target.closest('[data-id]'); if (li) open(+li.dataset.id); });
    $('tags').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { tag = tag === b.dataset.t ? '' : b.dataset.t; renderList(); } });
    $('q').addEventListener('input', renderList);
    $('new').onclick = () => { const id = Math.max(0, ...notes.map((n) => n.id)) + 1; notes.push({ id, text: '# 新しいメモ\n\n', at: Date.now() }); save(); open(id); $('ed').focus(); };
    $('del').onclick = () => { if (notes.length <= 1) { $('st').textContent = '最後の1枚は消せません'; return; } notes = notes.filter((n) => n.id !== cur); save(); open(notes[0].id); };
    $('copy').onclick = async () => { try { await navigator.clipboard.writeText($('ed').value); $('st').textContent = 'コピーしました'; } catch { $('st').textContent = 'コピーできませんでした'; } };
    open(cur);
  },
}, {
  id: 'app-slides', c: 'app', lv: 3, so: 1,
  t: 'テキストで作るスライド', y: 'てきすとでつくるすらいど',
  tags: ['スライド', 'プレゼン', 'Markdown', '全画面'],
  d: '「---」で区切った文章が、そのまま1枚ずつのスライドになる。# は見出し、- は箇条書き。左で書くと右の一覧がすぐ変わり、「発表する」で全画面の発表画面になる。矢印キーやクリックで進み、配色も選べる。',
  html: `
    <div class="sl">
      <div class="bar"><select id="theme" aria-label="配色"><option value="paper">紙</option><option value="night">夜</option><option value="shu">朱</option></select><button id="play" class="go">発表する ▶</button><span id="n"></span></div>
      <div class="two"><textarea id="src" spellcheck="false" aria-label="スライドの文章"></textarea><div class="thumbs" id="thumbs"></div></div>
      <dialog id="show" aria-label="発表画面"><div class="stage" id="stage"></div><div class="prog"><i id="prog"></i></div><p class="pg" id="pg"></p></dialog>
    </div>`,
  css: `
    body { background: #e9e7e2; }
    .sl { height: 100%; display: flex; flex-direction: column; }
    .bar { display: flex; gap: 6px; align-items: center; padding: 6px 8px; font-size: 13px; } .go { background: #c23b22; color: #fff; border-color: #c23b22; font-weight: 700; }
    .two { flex: 1; display: grid; grid-template-columns: 1fr 1.2fr; min-height: 0; }
    textarea { resize: none; border: 0; border-radius: 0; padding: 10px; font: 13px/1.6 ui-monospace, monospace; }
    .thumbs { overflow: auto; padding: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; align-content: start; }
    .slide { container-type: inline-size; aspect-ratio: 16 / 9; border-radius: 6px; overflow: hidden; padding: 6% 7%; display: flex; flex-direction: column; justify-content: center; gap: 2cqi; box-shadow: 0 2px 8px #0002; cursor: pointer; }
    .slide h2 { margin: 0; font: 800 7cqi/1.2 "Hiragino Mincho ProN", "Yu Mincho", serif; } .slide h3 { margin: 0; font-size: 4cqi; opacity: .7; }
    .slide ul { margin: 0; padding-left: 1.2em; font-size: 4.2cqi; line-height: 1.6; } .slide p { margin: 0; font-size: 4.2cqi; line-height: 1.6; }
    .paper { background: #fffdf7; color: #2b2118; } .paper h2 { border-bottom: .6cqi solid #c23b22; padding-bottom: 1cqi; }
    .night { background: radial-gradient(circle at 80% 0, #2b3a67, #0f1424); color: #e8ecff; } .night h2 { color: #ffd166; }
    .shu { background: #c23b22; color: #fff; } .shu h2 { text-shadow: 0 .4cqi 0 #0003; }
    dialog { width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: #000; }
    dialog[open] { display: grid; place-items: center; }
    .stage { width: min(100vw, 177.7vh); }
    .stage .slide { border-radius: 0; box-shadow: none; cursor: default; }
    .prog { position: fixed; left: 0; right: 0; bottom: 0; height: 4px; background: #fff2; } .prog i { display: block; height: 100%; background: #ffd166; transition: width .3s; }
    .pg { position: fixed; right: 12px; bottom: 8px; margin: 0; color: #fff8; font: 12px ui-monospace, monospace; }
    @media (width < 640px) { .two { grid-template-columns: 1fr; } }`,
  core() {
    // 「---」の行で区切り、# を見出し、## を副題、- を箇条書き、それ以外を段落にする
    function parseSlides(text) {
      return text.split(/^---\s*$/m).map((chunk) => {
        const s = { title: '', sub: '', bullets: [], paras: [] };
        for (const raw of chunk.split('\n')) {
          const l = raw.trim();
          if (!l) continue;
          if (l.startsWith('## ')) s.sub = l.slice(3);
          else if (l.startsWith('# ')) s.title = l.slice(2);
          else if (/^[-*] /.test(l)) s.bullets.push(l.slice(2));
          else s.paras.push(l);
        }
        return s;
      }).filter((s) => s.title || s.sub || s.bullets.length || s.paras.length);
    }
  },
  js() {
    const KEY = 'dekiru-slides', $ = (id) => document.getElementById(id);
    const SAMPLE = '# 出来る！のひみつ\n## ブラウザだけで作る図鑑\n---\n# 道具は3つだけ\n- HTML で骨組み\n- CSS で見た目\n- JavaScript で動き\n---\n# 小さく作る\n1つの見本は数十行。\n小さいから、読める。直せる。\n---\n# つなげて大きく\n- パイプ工房\n- 合わせ技の小品\n- そのまま使えるアプリ\n---\n# ありがとうございました\n## 質問をどうぞ';
    try { $('src').value = localStorage.getItem(KEY) || SAMPLE; } catch { $('src').value = SAMPLE; }
    try { $('theme').value = localStorage.getItem(KEY + '-theme') || 'paper'; } catch { /* 読めない */ }
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = (s) => `<div class="slide ${$('theme').value}">${s.title ? `<h2>${esc(s.title)}</h2>` : ''}${s.sub ? `<h3>${esc(s.sub)}</h3>` : ''}${s.paras.map((p) => `<p>${esc(p)}</p>`).join('')}${s.bullets.length ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</div>`;
    let slides = [], at = 0;
    function render() {
      slides = parseSlides($('src').value);
      $('thumbs').innerHTML = slides.map(html).join('');
      $('n').textContent = `${slides.length} 枚`;
      try { localStorage.setItem(KEY, $('src').value); localStorage.setItem(KEY + '-theme', $('theme').value); } catch { /* 保存できない */ }
    }
    function show(i) {
      at = Math.max(0, Math.min(slides.length - 1, i));
      $('stage').innerHTML = html(slides[at] || { title: '（スライドがありません）', sub: '', bullets: [], paras: [] });
      $('prog').style.width = ((at + 1) / slides.length) * 100 + '%';
      $('pg').textContent = `${at + 1} / ${slides.length}`;
    }
    $('src').addEventListener('input', render);
    $('theme').addEventListener('change', render);
    $('thumbs').addEventListener('click', (e) => { const s = e.target.closest('.slide'); if (s) { $('show').showModal(); show([...$('thumbs').children].indexOf(s)); } });
    $('play').onclick = () => { $('show').showModal(); show(0); $('show').requestFullscreen?.().catch(() => { /* 全画面にできない環境 */ }); };
    $('show').addEventListener('click', (e) => show(at + (e.clientX < innerWidth / 3 ? -1 : 1)));
    $('show').addEventListener('keydown', (e) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); show(at + 1); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); show(at - 1); }
      if (e.key === 'Home') show(0); if (e.key === 'End') show(slides.length - 1);
    });
    $('show').addEventListener('close', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); });
    render();
    if (window.THUMB) { const ts = ['paper', 'night', 'shu']; let i = 0; setInterval(() => { $('theme').value = ts[++i % 3]; render(); }, 1400); }
  },
}, {
  id: 'app-proofreader', c: 'app', lv: 3,
  t: '日本語の文章チェッカー', y: 'にほんごのぶんしょうちぇっかー',
  tags: ['文章校正', 'ら抜き言葉', '正規表現', '日本語'],
  d: 'ら抜き言葉・「頭痛が痛い」のような重ね言葉・全角英数・半角カナ・句読点の重なり・長すぎる文・読点の多い文・「です・ます」と「だ・である」の混在・同じ語尾の連続を見つけて印を付ける。直し方がある指摘はボタン1つで直せる。',
  p: '規則はどれも正規表現と文の区切りだけで書いている。「見れば」のように、ら抜きに見えて正しい形は除外している。',
  html: `
    <div class="pr">
      <div class="two"><textarea id="t" spellcheck="false" aria-label="調べる文章"></textarea><div class="view" id="view" aria-live="polite"></div></div>
      <div class="foot"><p id="stat"></p><ul id="issues"></ul></div>
    </div>`,
  css: `
    body { background: #f4f1ea; }
    .pr { height: 100%; display: grid; grid-template-rows: 1fr auto; gap: 8px; padding: 8px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-height: 0; }
    textarea, .view { border-radius: 10px; border: 1px solid #ddd5c6; padding: 10px; font: 15px/1.9 serif; background: #fff; overflow: auto; resize: none; }
    .view { white-space: pre-wrap; } mark { background: #ffe0d6; border-bottom: 2px solid #c23b22; border-radius: 2px; cursor: help; } mark.w { background: #fff2c4; border-color: #e0a400; }
    .foot { max-height: 36vh; overflow: auto; } #stat { margin: 0 0 4px; font-size: 12px; color: #666; }
    #issues { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 13px; }
    #issues li { display: flex; gap: 8px; align-items: center; background: #fff; padding: 6px 8px; border-radius: 8px; border-left: 4px solid #c23b22; } #issues li.w { border-color: #e0a400; }
    #issues b { white-space: nowrap; } #issues span { flex: 1; } #issues button { font-size: 12px; }
    @media (width < 640px) { .two { grid-template-columns: 1fr; } }`,
  core() {
    const RA = ['見', '来', '着', '寝', '食べ', '起き', '出', '考え', '決め', '信じ', '逃げ', '助け', '覚え', '借り', '降り', '生き', '受け', '答え', '止め', '開け', '閉め', '投げ', '教え', '集め', '始め', '続け', '比べ', '調べ', '着替え'];
    const RA_RE = new RegExp(`(${RA.sort((a, b) => b.length - a.length).join('|')})れ(る|ない|ます|ません|た|て|なかっ)`, 'g');
    const DOUBLE = ['頭痛が痛い', '馬から落馬', '一番最初', '一番最後', '後で後悔', '違和感を感じ', '被害を被', '犯罪を犯', '返事を返', '必ず必要', 'まず最初', '過半数を超え', '元旦の朝', '炎天下の下', '今現在', 'あらかじめ予約', 'いまだに未', '射程距離', '各々それぞれ'];
    // 文を位置付きで取り出す
    function sentences(text) { return [...text.matchAll(/[^。！？!?\n]+[。！？!?]?/g)].map((m) => ({ s: m[0], i: m.index })).filter((x) => x.s.trim()); }
    function check(text) {
      const out = [];
      const add = (type, index, length, message, suggest, warn) => out.push({ type, index, length, message, suggest, level: warn ? 'warn' : 'error' });
      for (const m of text.matchAll(RA_RE)) add('ら抜き', m.index, m[0].length, `「${m[0]}」はら抜き言葉`, `${m[1]}られ${m[2]}`);
      for (const w of DOUBLE) { let at = 0; while ((at = text.indexOf(w, at)) >= 0) { add('二重表現', at, w.length, `「${w}」は同じ意味が重なっている`); at += w.length; } }
      for (const m of text.matchAll(/[Ａ-Ｚａ-ｚ０-９]+/g)) add('全角英数', m.index, m[0].length, '英数字は半角にそろえる', m[0].normalize('NFKC'), true);
      for (const m of text.matchAll(/[｡-ﾟ]+/g)) add('半角カナ', m.index, m[0].length, 'カタカナは全角にそろえる', m[0].normalize('NFKC'));
      for (const m of text.matchAll(/[、。]{2,}/g)) add('句読点の重なり', m.index, m[0].length, '句読点が続いている', m[0][0]);
      const ss = sentences(text);
      const POLITE = /(です|ます|でした|ました|ません|でしょう|ください)[。！？!?]?$/, PLAIN = /(だ|である|だった|だろう|ではない|のだ)[。！？!?]?$/;
      const style = ss.map((x) => (POLITE.test(x.s.trim()) ? 'p' : PLAIN.test(x.s.trim()) ? 'd' : ''));
      const np = style.filter((v) => v === 'p').length, nd = style.filter((v) => v === 'd').length;
      ss.forEach((x, k) => {
        const len = [...x.s].length;
        if (len > 80) add('長い文', x.i, x.s.length, `一文が ${len} 文字。60〜80 文字までに分けると読みやすい`, undefined, true);
        if ((x.s.match(/、/g) || []).length >= 4) add('読点が多い', x.i, x.s.length, '読点が4つ以上ある。文を分けられないか', undefined, true);
        if (np && nd && style[k] && style[k] === (np >= nd ? 'd' : 'p')) add('文体の混在', x.i, x.s.length, np >= nd ? '「です・ます」の中に「だ・である」が混ざっている' : '「だ・である」の中に「です・ます」が混ざっている', undefined, true);
        const end = x.s.replace(/[。！？!?]$/, '').slice(-2);
        if (k >= 2 && end.length === 2 && ss[k - 1].s.replace(/[。！？!?]$/, '').slice(-2) === end && ss[k - 2].s.replace(/[。！？!?]$/, '').slice(-2) === end) add('語尾の連続', x.i, x.s.length, `「〜${end}」で終わる文が3つ続いている`, undefined, true);
      });
      for (const m of text.matchAll(/[一-鿿々]{8,}/g)) add('漢字の連続', m.index, m[0].length, '漢字が8字以上続いて読みにくい', undefined, true);
      return out.sort((a, b) => a.index - b.index);
    }
  },
  js() {
    const t = document.getElementById('t');
    t.value = 'このアプリは、ブラウザだけで動きます。朝早く起きれる人は少ない。一番最初に図鑑を開いたとき、立体の見本に驚いた。ＨＴＭＬとCSSだけでも、ﾃﾞｻﾞｲﾝは作れます。。\n毎日練習します。少しずつ上達します。来年は発表します。\nこの文はとても長くて、途中で読点がいくつも入っていて、読む人が息を継ぐ場所に迷ってしまうので、いったん区切って二つか三つの文に分けた方がよい場合が多い。';
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    function run() {
      const text = t.value, iss = check(text);
      let html = '', at = 0;
      const marks = iss.filter((x) => x.index >= at).reduce((acc, x) => { if (!acc.length || x.index >= acc[acc.length - 1].index + acc[acc.length - 1].length) acc.push(x); return acc; }, []);
      for (const m of marks) { html += esc(text.slice(at, m.index)) + `<mark class="${m.level === 'warn' ? 'w' : ''}" title="${esc(m.message)}">${esc(text.slice(m.index, m.index + m.length))}</mark>`; at = m.index + m.length; }
      document.getElementById('view').innerHTML = html + esc(text.slice(at));
      const chars = [...text.replace(/\s/g, '')].length, ss = text.split(/[。！？!?\n]/).filter((s) => s.trim()).length, kan = (text.match(/[一-鿿々]/g) || []).length;
      document.getElementById('stat').textContent = `${chars} 文字 ・ ${ss} 文 ・ 1文の平均 ${ss ? Math.round(chars / ss) : 0} 文字 ・ 漢字 ${chars ? Math.round((kan / chars) * 100) : 0}% ・ 指摘 ${iss.length} 件`;
      const ul = document.getElementById('issues'); ul.innerHTML = '';
      for (const x of iss) {
        const li = document.createElement('li'); li.className = x.level === 'warn' ? 'w' : '';
        li.innerHTML = `<b></b><span></span>${x.suggest !== undefined ? '<button class="fix">直す</button>' : ''}<button class="go">場所へ</button>`;
        li.querySelector('b').textContent = x.type; li.querySelector('span').textContent = x.message + (x.suggest !== undefined ? ` → 「${x.suggest}」` : '');
        li.querySelector('.go').onclick = () => { t.focus(); t.setSelectionRange(x.index, x.index + x.length); };
        const fix = li.querySelector('.fix'); if (fix) fix.onclick = () => { t.value = text.slice(0, x.index) + x.suggest + text.slice(x.index + x.length); run(); };
        ul.append(li);
      }
    }
    t.addEventListener('input', run);
    run();
  },
}, {
  id: 'app-mindmap', c: 'app', lv: 3, so: 1,
  t: 'マインドマップ', y: 'まいんどまっぷ',
  tags: ['マインドマップ', 'SVG', '木構造', 'キーボード操作'],
  d: '中心の言葉から枝を伸ばして考えを広げる。Tab で子、Enter で兄弟の枝を足し、F2 か二度押しで書き換え、Delete で消し、スペースで折りたたむ。矢印キーで枝を移動し、ドラッグで画面を動かし、ホイールで拡大できる。形は自動で整い、ブラウザに保存される。',
  p: '並べ方は「葉は上から順に1段ずつ、親は最初と最後の子の真ん中」という単純な規則。深さで横の位置が決まる。',
  html: `
    <div class="mm">
      <div class="bar"><button id="child">子を足す（Tab）</button><button id="sib">兄弟を足す（Enter）</button><button id="del">消す（Delete）</button><button id="outline">箇条書きでコピー</button><span id="msg"></span></div>
      <svg id="svg" role="tree" aria-label="マインドマップ" tabindex="0"><g id="view"></g></svg>
      <input id="edit" class="edit" hidden aria-label="枝の言葉">
    </div>`,
  css: `
    body { background: #f7f5ef; overflow: hidden; }
    .mm { height: 100%; display: flex; flex-direction: column; position: relative; }
    .bar { display: flex; gap: 6px; align-items: center; padding: 6px 8px; font-size: 12px; flex-wrap: wrap; } #msg { color: #666; }
    svg { flex: 1; width: 100%; cursor: grab; touch-action: none; outline: none; }
    .node rect { fill: #fff; stroke: #c9bfa9; rx: 8; } .node text { font: 14px system-ui, sans-serif; dominant-baseline: middle; }
    .node.root rect { fill: #c23b22; stroke: #c23b22; } .node.root text { fill: #fff; font-weight: 700; font-size: 16px; }
    .node[aria-selected=true] rect { stroke: #26407c; stroke-width: 3; }
    .node .fold { fill: #26407c; font-size: 11px; }
    path.edge { fill: none; stroke-width: 2.5; }
    .edit { position: absolute; font: 14px system-ui, sans-serif; padding: 2px 6px; border: 2px solid #26407c; border-radius: 6px; }`,
  core() {
    // 葉は上から順に1段ずつ、親は最初と最後の子の真ん中。横の位置は深さ × dx
    function layoutTree(root, { dx = 170, dy = 44 } = {}) {
      const pos = {};
      let next = 0;
      (function walk(n, depth) {
        const kids = n.collapsed ? [] : n.children || [];
        if (!kids.length) { pos[n.id] = { x: depth * dx, y: next++ * dy }; return; }
        kids.forEach((k) => walk(k, depth + 1));
        pos[n.id] = { x: depth * dx, y: (pos[kids[0].id].y + pos[kids[kids.length - 1].id].y) / 2 };
      })(root, 0);
      return pos;
    }
  },
  js() {
    const KEY = 'dekiru-mindmap', svg = document.getElementById('svg'), view = document.getElementById('view'), ed = document.getElementById('edit');
    const NS = 'http://www.w3.org/2000/svg';
    let uid = 100;
    const mk = (text, children = []) => ({ id: 'n' + uid++, text, children });
    let root;
    try { root = JSON.parse(localStorage.getItem(KEY)); } catch { root = null; }
    if (!root) root = mk('出来る！図鑑', [mk('見た目', [mk('CSS アート'), mk('光と演出'), mk('立体・3D')]), mk('動き', [mk('アニメーション'), mk('物理')]), mk('使える', [mk('家計簿'), mk('単語帳'), mk('表計算')]), mk('つなげる', [mk('パイプ工房')])]);
    const walk = (n, f, parent = null, depth = 1) => { f(n, parent, depth); (n.children || []).forEach((c) => walk(c, f, n, depth + 1)); };
    walk(root, (n) => { uid = Math.max(uid, parseInt(n.id.slice(1), 10) + 1); });
    let selId = root.id, pan = { x: 60, y: 0 }, zoom = 1;
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(root)); } catch { /* 保存できない */ } };
    const find = (id) => { let hit = null, par = null; walk(root, (n, p) => { if (n.id === id) { hit = n; par = p; } }); return [hit, par]; };
    const COLORS = ['#c23b22', '#26407c', '#2f855a', '#b7791f', '#7a5cff', '#319795'];
    function render() {
      const pos = layoutTree(root, { dx: 170, dy: 44 }), h = svg.clientHeight || 400;
      const ys = Object.values(pos).map((p) => p.y), mid = (Math.min(...ys) + Math.max(...ys)) / 2;
      view.setAttribute('transform', `translate(${pan.x} ${h / 2 - mid * zoom + pan.y}) scale(${zoom})`);
      view.innerHTML = '';
      const edges = document.createElementNS(NS, 'g'); view.append(edges);
      walk(root, (n, parent, depth) => {
        const p = pos[n.id]; if (!p) return;
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'node' + (n === root ? ' root' : '')); g.setAttribute('role', 'treeitem'); g.setAttribute('aria-level', depth);
        g.setAttribute('aria-selected', n.id === selId); g.dataset.id = n.id;
        if (n.children.length) g.setAttribute('aria-expanded', !n.collapsed);
        const t = document.createElementNS(NS, 'text'); t.textContent = n.text || '　'; t.setAttribute('x', p.x + 10); t.setAttribute('y', p.y);
        g.append(t); view.append(g);
        const w = t.getComputedTextLength() + 20;
        const r = document.createElementNS(NS, 'rect'); r.setAttribute('x', p.x); r.setAttribute('y', p.y - 15); r.setAttribute('width', w); r.setAttribute('height', 30); g.prepend(r);
        n._w = w;
        if (n.collapsed && n.children.length) { const f = document.createElementNS(NS, 'text'); f.setAttribute('class', 'fold'); f.setAttribute('x', p.x + w + 6); f.setAttribute('y', p.y); f.textContent = `＋${n.children.length}`; g.append(f); }
        if (parent && pos[parent.id]) {
          const a = pos[parent.id], top = root.children.indexOf(n) >= 0 ? root.children.indexOf(n) : root.children.findIndex((c) => { let inside = false; walk(c, (x) => { if (x === n) inside = true; }); return inside; });
          const e = document.createElementNS(NS, 'path'), sx = a.x + parent._w, mx = (sx + p.x) / 2;
          e.setAttribute('class', 'edge'); e.setAttribute('stroke', COLORS[Math.max(0, top) % COLORS.length]);
          e.setAttribute('d', `M${sx} ${a.y} C${mx} ${a.y} ${mx} ${p.y} ${p.x} ${p.y}`);
          edges.append(e);
        }
      });
      svg.setAttribute('aria-activedescendant', selId);
    }
    function addChild() { const [n] = find(selId); n.collapsed = false; const c = mk('新しい枝'); n.children.push(c); selId = c.id; save(); render(); startEdit(); }
    function addSib() { const [n, p] = find(selId); if (!p) return addChild(); const c = mk('新しい枝'); p.children.splice(p.children.indexOf(n) + 1, 0, c); selId = c.id; save(); render(); startEdit(); }
    function del() { const [n, p] = find(selId); if (!p) return; const i = p.children.indexOf(n); p.children.splice(i, 1); selId = (p.children[i] || p.children[i - 1] || p).id; save(); render(); }
    function startEdit() {
      const g = view.querySelector(`[data-id="${selId}"]`); if (!g) return;
      const [n] = find(selId), r = g.querySelector('rect').getBoundingClientRect(), box = svg.parentElement.getBoundingClientRect();
      Object.assign(ed.style, { left: r.left - box.left + 'px', top: r.top - box.top + 'px', width: Math.max(140, r.width + 40) + 'px' });
      ed.hidden = false; ed.value = n.text; ed.focus(); ed.select();
    }
    function endEdit(keep) { if (ed.hidden) return; const [n] = find(selId); if (keep && n) n.text = ed.value.trim() || n.text; ed.hidden = true; save(); render(); svg.focus(); }
    ed.addEventListener('keydown', (e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') { e.preventDefault(); endEdit(true); } if (e.key === 'Escape') { e.preventDefault(); endEdit(false); } });
    ed.addEventListener('blur', () => endEdit(true));
    svg.addEventListener('keydown', (e) => {
      const [n, p] = find(selId);
      const sib = (d) => { if (!p) return; const i = p.children.indexOf(n) + d; if (p.children[i]) selId = p.children[i].id; };
      const act = { Tab: () => (e.shiftKey ? p && (selId = p.id) : addChild()), Enter: addSib, Delete: del, Backspace: del, F2: startEdit, ' ': () => { n.collapsed = !n.collapsed; save(); },
        ArrowLeft: () => p && (selId = p.id), ArrowRight: () => { if (n.children.length && !n.collapsed) selId = n.children[0].id; }, ArrowUp: () => sib(-1), ArrowDown: () => sib(1) }[e.key];
      if (!act) return;
      e.preventDefault(); act(); render();
    });
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.node');
      if (g) { selId = g.dataset.id; render(); svg.focus(); return; }
      drag = { x: e.clientX - pan.x, y: e.clientY - pan.y }; svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => { if (drag) { pan = { x: e.clientX - drag.x, y: e.clientY - drag.y }; render(); } });
    svg.addEventListener('pointerup', () => { drag = null; });
    svg.addEventListener('dblclick', (e) => { if (e.target.closest('.node')) startEdit(); });
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.4, Math.min(2.5, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); render(); }, { passive: false });
    document.getElementById('child').onclick = addChild; document.getElementById('sib').onclick = addSib; document.getElementById('del').onclick = del;
    document.getElementById('outline').onclick = async () => { let s = ''; walk(root, (n, p, d) => { s += '  '.repeat(d - 1) + '- ' + n.text + '\n'; }); try { await navigator.clipboard.writeText(s); document.getElementById('msg').textContent = '箇条書きでコピーしました'; } catch { document.getElementById('msg').textContent = 'コピーできませんでした'; } };
    new ResizeObserver(render).observe(svg);
    render();
    if (window.THUMB) { const ids = []; walk(root, (n) => ids.push(n.id)); let i = 0; setInterval(() => { selId = ids[i++ % ids.length]; render(); }, 600); }
  },
}, {
  id: 'app-vector-draw', c: 'app', lv: 3, so: 1,
  t: '図形のお絵かきツール', y: 'ずけいのおえかきつーる',
  tags: ['ベクター', 'SVG', 'ドラッグ', '図形編集'],
  d: '四角・丸・線・文字を置き、選んで動かしたり、右下のつまみで大きさを変えたりできる。塗りと線の色、線の太さ、前後の入れ替え、元に戻す（Ctrl+Z）、消す（Delete）ができ、描いた絵は SVG のコードとして取り出せる。',
  html: `
    <div class="vd">
      <div class="tools" role="toolbar" aria-label="道具">
        <button data-t="select" aria-pressed="true">選ぶ</button><button data-t="rect" aria-pressed="false">四角</button><button data-t="ellipse" aria-pressed="false">丸</button><button data-t="line" aria-pressed="false">線</button><button data-t="text" aria-pressed="false">文字</button>
        <label>文字 <input id="txt" value="出来る！" size="8"></label>
        <label>塗り <input type="color" id="fill" value="#ffd166"></label><label>線 <input type="color" id="stroke" value="#26407c"></label><label>太さ <input type="range" id="sw" min="0" max="12" value="3"></label>
        <button id="front">前へ</button><button id="back">後ろへ</button><button id="undo">元に戻す</button><button id="svgcopy">SVGをコピー</button>
      </div>
      <svg id="cv" viewBox="0 0 800 500" aria-label="描くところ"><rect width="800" height="500" fill="#fff"/><g id="shapes"></g><g id="ui"></g></svg>
      <p id="msg">図形を選んでドラッグで移動、右下の四角で大きさを変える</p>
    </div>`,
  css: `
    body { background: #e8eaee; touch-action: none; }
    .vd { height: 100%; display: flex; flex-direction: column; gap: 6px; padding: 8px; }
    .tools { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 12px; } .tools [aria-pressed=true] { background: #26407c; color: #fff; }
    svg { flex: 1; width: 100%; min-height: 0; background: #fff; border-radius: 8px; box-shadow: 0 1px 6px #0002; cursor: crosshair; }
    #ui rect.sel { fill: none; stroke: #e0532f; stroke-dasharray: 5 4; pointer-events: none; } #ui rect.h { fill: #e0532f; cursor: nwse-resize; }
    #msg { margin: 0; font-size: 12px; color: #555; }`,
  js() {
    const KEY = 'dekiru-vector', NS = 'http://www.w3.org/2000/svg', $ = (id) => document.getElementById(id);
    const cv = $('cv'), G = $('shapes'), UI = $('ui');
    let shapes, tool = 'select', sel = null, act = null, hist = [];
    try { shapes = JSON.parse(localStorage.getItem(KEY)); } catch { shapes = null; }
    if (!shapes) shapes = [
      { t: 'rect', x: 80, y: 60, w: 260, h: 160, fill: '#ffd166', stroke: '#26407c', sw: 4 },
      { t: 'ellipse', x: 400, y: 120, w: 180, h: 180, fill: '#e0532f', stroke: '#26407c', sw: 0 },
      { t: 'line', x: 120, y: 360, w: 520, h: -40, fill: 'none', stroke: '#2f855a', sw: 8 },
      { t: 'text', x: 110, y: 150, w: 200, h: 50, fill: '#26407c', stroke: 'none', sw: 0, text: '出来る！' },
    ];
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(shapes)); } catch { /* 保存できない */ } };
    const snap = () => { hist.push(JSON.stringify(shapes)); if (hist.length > 60) hist.shift(); };
    function toSvg(s) {
      const a = (o) => Object.entries(o).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
      const x = Math.min(s.x, s.x + s.w), y = Math.min(s.y, s.y + s.h), w = Math.abs(s.w), h = Math.abs(s.h);
      if (s.t === 'rect') return `<rect ${a({ x, y, width: w, height: h, rx: 6, fill: s.fill, stroke: s.stroke, 'stroke-width': s.sw })}/>`;
      if (s.t === 'ellipse') return `<ellipse ${a({ cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, fill: s.fill, stroke: s.stroke, 'stroke-width': s.sw })}/>`;
      if (s.t === 'line') return `<line ${a({ x1: s.x, y1: s.y, x2: s.x + s.w, y2: s.y + s.h, stroke: s.stroke, 'stroke-width': Math.max(1, s.sw), 'stroke-linecap': 'round' })}/>`;
      return `<text ${a({ x, y: y + h * 0.8, 'font-size': h, 'font-weight': 800, fill: s.fill, 'font-family': 'serif' })}>${String(s.text).replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</text>`;
    }
    const box = (s) => ({ x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) });
    function render() {
      G.innerHTML = shapes.map((s, i) => toSvg(s).replace(/^<(\w+)/, `<$1 data-i="${i}"`)).join('');
      UI.innerHTML = '';
      if (sel !== null && shapes[sel]) {
        const b = box(shapes[sel]);
        UI.innerHTML = `<rect class="sel" x="${b.x - 4}" y="${b.y - 4}" width="${b.w + 8}" height="${b.h + 8}"/><rect class="h" data-h="1" x="${b.x + b.w - 2}" y="${b.y + b.h - 2}" width="12" height="12"/>`;
      }
    }
    const pt = (e) => { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(cv.getScreenCTM().inverse()); return [p.x, p.y]; };
    cv.addEventListener('pointerdown', (e) => {
      const [px, py] = pt(e);
      cv.setPointerCapture(e.pointerId);
      if (e.target.dataset.h) { snap(); act = { mode: 'resize', s: shapes[sel], x0: px, y0: py, w0: shapes[sel].w, h0: shapes[sel].h }; return; }
      if (tool === 'select') {
        const i = e.target.dataset.i;
        sel = i !== undefined ? +i : null; render();
        if (sel !== null && shapes[sel].t === 'text') $('txt').value = shapes[sel].text;
        if (sel !== null) { snap(); act = { mode: 'move', s: shapes[sel], dx: px - shapes[sel].x, dy: py - shapes[sel].y }; }
        return;
      }
      snap();
      const s = { t: tool, x: px, y: py, w: 1, h: 1, fill: tool === 'line' ? 'none' : $('fill').value, stroke: $('stroke').value, sw: +$('sw').value };
      if (tool === 'text') { s.text = $('txt').value || '文字'; s.w = 120; s.h = 48; s.fill = $('stroke').value; }
      shapes.push(s); sel = shapes.length - 1;
      act = tool === 'text' ? null : { mode: 'draw', s, x0: px, y0: py };
      render();
      if (tool === 'text') save();
    });
    // 文字の図形を選んでいるときは、上の欄を書き換えるとその場で変わる
    $('txt').addEventListener('input', () => { if (sel !== null && shapes[sel].t === 'text') { shapes[sel].text = $('txt').value; save(); render(); } });
    cv.addEventListener('pointermove', (e) => {
      if (!act) return;
      const [px, py] = pt(e);
      if (act.mode === 'move') { act.s.x = px - act.dx; act.s.y = py - act.dy; }
      if (act.mode === 'draw') { act.s.w = px - act.x0; act.s.h = py - act.y0; }
      if (act.mode === 'resize') { act.s.w = Math.max(8, act.w0 + px - act.x0); act.s.h = act.s.t === 'line' ? act.h0 + py - act.y0 : Math.max(8, act.h0 + py - act.y0); }
      render();
    });
    cv.addEventListener('pointerup', () => { if (act) { const s = act.s; if (act.mode === 'draw' && Math.abs(s.w) < 4 && Math.abs(s.h) < 4) { s.w = 120; s.h = s.t === 'line' ? 0 : 90; } act = null; save(); render(); } });
    document.querySelector('.tools').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tool = b.dataset.t; document.querySelectorAll('[data-t]').forEach((x) => x.setAttribute('aria-pressed', x === b)); });
    for (const id of ['fill', 'stroke', 'sw']) $(id).addEventListener('input', () => { if (sel === null) return; const s = shapes[sel]; if (id === 'fill' && s.t !== 'line') s.fill = $('fill').value; if (id === 'stroke') { s.stroke = $('stroke').value; if (s.t === 'text') s.fill = $('stroke').value; } if (id === 'sw') s.sw = +$('sw').value; save(); render(); });
    $('front').onclick = () => { if (sel === null) return; snap(); const [s] = shapes.splice(sel, 1); shapes.push(s); sel = shapes.length - 1; save(); render(); };
    $('back').onclick = () => { if (sel === null) return; snap(); const [s] = shapes.splice(sel, 1); shapes.unshift(s); sel = 0; save(); render(); };
    const undo = () => { if (!hist.length) return; shapes = JSON.parse(hist.pop()); sel = null; save(); render(); };
    $('undo').onclick = undo;
    addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null && document.activeElement.tagName !== 'INPUT') { snap(); shapes.splice(sel, 1); sel = null; save(); render(); }
    });
    $('svgcopy').onclick = async () => { const src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">\n${shapes.map(toSvg).join('\n')}\n</svg>`; try { await navigator.clipboard.writeText(src); $('msg').textContent = 'SVG のコードをコピーしました'; } catch { $('msg').textContent = 'コピーできませんでした'; } };
    render();
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.05; shapes[1].x = 400 + Math.cos(t) * 120; shapes[1].y = 120 + Math.sin(t) * 60; sel = 1; render(); }, 40); }
  },
});
