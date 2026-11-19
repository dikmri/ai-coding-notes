/* 新しい Web の機能
 * 2025〜2026 年にブラウザで使えるようになった機能を、1 項目 1 機能で試す。
 * どの項目も、機能に対応していないブラウザでは何が足りないかを #ng に出し、できるだけ代わりの見た目で読めるようにする。 */
(() => {
  // どの項目にも入れる下地: 明るい配色と暗い配色の色、hidden を確実に効かせる規則、未対応のときの知らせ
  const BASE = `
    :root {
      --bg: light-dark(#f4f2ec, #1a1916);
      --card: light-dark(#ffffff, #26231e);
      --line: light-dark(#d8d1c3, #47423a);
      --mute: light-dark(#625c51, #aaa293);
      --accent: light-dark(#c2410c, #fb923c);
    }
    body { background: var(--bg); }
    [hidden] { display: none !important; }
    .ng { margin: 0; padding: 6px 10px; border-radius: 8px; font-size: 13px; line-height: 1.5; background: light-dark(#fff3d1, #3a311f); color: light-dark(#5c4300, #f2d58c); border: 1px solid light-dark(#e8cf8a, #6d5b2d); }
    .mute { margin: 0; font-size: 13px; color: var(--mute); }`;

  dekiru.add({
    id: 'nw-sibling-index', c: 'new', lv: 2,
    t: '何番目かで角度と色を決める（sibling-index）', y: 'なんばんめかでかくどといろをきめるしぶりんぐいんでっくす',
    tags: ['sibling-index()', 'sibling-count()', '扇形', '時間差アニメーション', 'Chrome 138'],
    d: 'sibling-index() は自分が兄弟の中で何番目か、sibling-count() は兄弟が全部で何個かを、CSS の値として返す。カードを足したり減らしたりすると、扇の角度・色・現れる時間差を CSS が計算し直す。前は :nth-child() の規則を枚数分書くか、JS で番号を style に書き込む必要があった。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <ul id="fan" class="fan" aria-label="扇に並んだカード">
        <li>1</li><li>2</li><li>3</li><li>4</li><li>5</li>
      </ul>
      <div class="bar">
        <button id="add" type="button">1 枚足す</button>
        <button id="del" type="button">1 枚減らす</button>
        <button id="again" type="button">配り直す</button>
      </div>
      <p id="n" class="mute" aria-live="polite"></p>`,
    css: BASE + `
      body { display: grid; place-content: center; justify-items: center; gap: 12px; padding: 12px; }
      .fan { position: relative; list-style: none; margin: 0; padding: 0; width: min(520px, 92vw); height: 240px; }
      .fan > li {
        /* 未対応のブラウザでは、JS が入れた番号と枚数を使う */
        --i: var(--sibling-index, 1);
        --n: var(--sibling-count, 1);
        position: absolute; left: 50%; top: 8px; width: 64px; height: 100px; margin-left: -32px;
        display: grid; place-items: center; border-radius: 10px;
        font: 800 24px/1 system-ui, sans-serif; color: #fff; text-shadow: 0 1px 2px #0006;
        background: oklch(55% 0.16 calc(360deg / var(--n) * var(--i)));
        box-shadow: 0 6px 14px #0003;
        transform-origin: 50% 300%;
        rotate: calc(min(15deg, 100deg / var(--n)) * (var(--i) - (var(--n) + 1) / 2));
        transition: rotate .35s, background-color .35s;
        animation: deal .45s backwards;
        animation-delay: calc(var(--i) * 70ms);
      }
      /* 対応しているブラウザだけ、本物の関数で上書きする */
      @supports (top: calc(sibling-index() * 1px)) {
        .fan > li { --i: sibling-index(); --n: sibling-count(); }
      }
      @keyframes deal { from { opacity: 0; translate: 0 60px; rotate: 0deg; } }
      @media (prefers-reduced-motion: reduce) { .fan > li { animation: none; transition: none; } }
      .bar { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }`,
    js() {
      const fan = document.getElementById('fan');
      const native = CSS.supports('top: calc(sibling-index() * 1px)');
      const ng = document.getElementById('ng');
      if (!native) {
        ng.textContent = 'このブラウザは sibling-index() と sibling-count() に対応していません（Chrome 138 以降で動きます）。代わりに JS で番号を振って、同じ見た目にしています。';
        ng.hidden = false;
      }
      // 未対応のときだけ、1 から数えた番号と枚数を style に書き込む
      function number() {
        if (native) return;
        [...fan.children].forEach((li, i) => {
          li.style.setProperty('--sibling-index', i + 1);
          li.style.setProperty('--sibling-count', fan.children.length);
        });
      }
      function report() {
        document.getElementById('n').textContent = `いま ${fan.children.length} 枚。角度・色・時間差は、${native ? 'CSS の sibling-index() と sibling-count()' : 'JS が振った番号を使って CSS'} が計算しています。`;
      }
      document.getElementById('add').onclick = () => {
        if (fan.children.length >= 12) return;
        const li = document.createElement('li');
        li.textContent = fan.children.length + 1;
        fan.append(li);
        number(); report();
      };
      document.getElementById('del').onclick = () => {
        if (fan.children.length <= 1) return;
        fan.lastElementChild.remove();
        number(); report();
      };
      // 作り直すとアニメーションが最初から動く
      document.getElementById('again').onclick = () => { fan.replaceChildren(...[...fan.children].map((li) => li.cloneNode(true))); number(); };
      number(); report();
      if (window.THUMB) {
        let up = true;
        setInterval(() => { const n = fan.children.length; if (n >= 9) up = false; if (n <= 3) up = true; document.getElementById(up ? 'add' : 'del').click(); }, 700);
      }
    },
  }, {
    id: 'nw-corner-shape', c: 'new', lv: 1,
    t: '角の形を選ぶ（corner-shape）', y: 'かどのかたちをえらぶこーなーしぇいぷ',
    tags: ['corner-shape', 'border-radius', 'スクワークル', '面取り', 'Chrome 139'],
    d: 'corner-shape は、border-radius で決めた角の大きさのまま、角の形を丸・スクワークル（なめらかな角丸）・面取り・内側へのくぼみなどに変える。枠線と影も同じ形に沿う。前は SVG の画像を敷くか clip-path で切り抜く必要があり、切り抜くと枠線と影まで消えた。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <div class="top">
        <div id="big" class="big"><b id="name">superellipse(2)</b></div>
        <div class="ctl">
          <label for="k">形の値 k（-4〜4）</label>
          <input id="k" type="range" min="-4" max="4" step="0.5" value="2">
          <label for="r">角の大きさ</label>
          <input id="r" type="range" min="0" max="64" value="44">
          <p class="mute">k が 1 なら普通の丸、2 ならスクワークル、0 なら面取り、マイナスなら内側へくぼみます。</p>
        </div>
      </div>
      <ul class="grid">
        <li style="corner-shape: round">round</li>
        <li style="corner-shape: squircle">squircle</li>
        <li style="corner-shape: bevel">bevel</li>
        <li style="corner-shape: scoop">scoop</li>
        <li style="corner-shape: notch">notch</li>
        <li style="corner-shape: squircle scoop bevel round">角ごとに別の形</li>
      </ul>`,
    css: BASE + `
      body { display: grid; gap: 14px; align-content: center; padding: 14px; }
      .top { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: center; }
      .big {
        --r: 44px;
        width: 180px; height: 130px; display: grid; place-items: center;
        border-radius: var(--r); corner-shape: superellipse(2);
        background: linear-gradient(135deg, #0284c7, #4f46e5); color: #fff;
        border: 4px solid light-dark(#1e1b4b, #c7d2fe);
        box-shadow: 0 10px 24px #4338ca55;
      }
      .big b { font: 700 13px/1.4 ui-monospace, monospace; text-align: center; padding: 0 10px; white-space: pre-line; }
      .ctl { display: grid; gap: 4px; width: min(260px, 90vw); font-size: 13px; }
      .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 14px; }
      .grid li {
        height: 70px; display: grid; place-items: center; padding: 4px; text-align: center;
        font: 600 12px/1.3 ui-monospace, monospace;
        border-radius: 22px; background: var(--card); border: 3px solid var(--accent); box-shadow: 0 6px 12px #0002;
      }`,
    js() {
      const big = document.getElementById('big'), k = document.getElementById('k'), r = document.getElementById('r');
      const ng = document.getElementById('ng');
      if (!CSS.supports('corner-shape', 'superellipse(2)')) {
        ng.textContent = 'このブラウザは corner-shape に対応していません（Chrome 139 以降で動きます）。どの箱も普通の丸い角で表示しています。';
        ng.hidden = false;
      }
      const same = { '1': 'round と同じ', '2': 'squircle と同じ', '0': 'bevel と同じ', '-1': 'scoop と同じ' };
      function apply() {
        big.style.setProperty('--r', r.value + 'px');
        big.style.setProperty('corner-shape', `superellipse(${k.value})`);
        document.getElementById('name').textContent = `superellipse(${k.value})` + (same[k.value] ? `\n${same[k.value]}` : '');
      }
      k.addEventListener('input', apply);
      r.addEventListener('input', apply);
      apply();
      if (window.THUMB) { let t = 0; setInterval(() => { t += 0.06; k.value = Math.round(Math.sin(t) * 6) / 2; apply(); }, 60); }
    },
  }, {
    id: 'nw-css-function', c: 'new', lv: 2,
    t: 'CSS の中で関数を作る（@function）', y: 'しーえすえすのなかでかんすうをつくるふぁんくしょん',
    tags: ['@function', 'CSS カスタム関数', 'color-mix()', 'しま模様', 'Chrome 139'],
    d: '@function で、引数を受け取って値を返す自分の関数を CSS の中に作れる。ここでは「しま模様」と「暗い色」を返す 2 つの関数を作った。色と幅を変えると、関数を呼んでいるすべての札が一緒に変わる。前は同じ長い式を何か所にもコピーするか、Sass などの前処理で関数を書く必要があった。',
    p: '引数に var() を渡す宣言は、未対応のブラウザでも読み込みの時点では捨てられず、表示の直前に無効になる。そのため代わりの値を先に書くだけでは足りず、@supports (color: --foo()) で囲んでいる。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <div class="ctl">
        <label>元の色 <input id="c" type="color" value="#2f7dd1"></label>
        <label>しまの幅 <input id="w" type="range" min="4" max="24" value="10"></label>
      </div>
      <div class="cards">
        <div class="card a"><b>お知らせ</b><code>--stripe(var(--c))</code></div>
        <div class="card b"><b>セール</b><code>--stripe(var(--c), var(--w))</code></div>
        <div class="card d"><b>終了</b><code>--stripe(--shade(var(--c), 45%), var(--w))</code></div>
      </div>
      <p class="mute" id="out"></p>`,
    css: BASE + `
      /* しま模様を返す関数。--w を省くと 8px になる */
      @function --stripe(--base <color>, --w <length>: 8px) returns <image> {
        result: repeating-linear-gradient(-45deg, var(--base) 0 var(--w), color-mix(in oklab, var(--base), white 35%) 0 calc(var(--w) * 2));
      }
      /* 色を暗くする関数。--amount を省くと 30% */
      @function --shade(--base <color>, --amount <percentage>: 30%) returns <color> {
        result: color-mix(in oklab, var(--base), black var(--amount));
      }
      body { --c: #2f7dd1; --w: 10px; display: grid; gap: 12px; align-content: center; padding: 14px; }
      .ctl { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; font-size: 14px; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
      .card {
        min-height: 92px; padding: 12px; border-radius: 12px; display: grid; gap: 6px; align-content: center; justify-items: start;
        border: 4px solid color-mix(in oklab, var(--c), black 30%);
        /* 未対応のブラウザでの見た目: 塗りつぶし */
        background: var(--c);
      }
      .card b, .card code { padding: 2px 8px; border-radius: 6px; background: var(--card); }
      .card code { font-size: 11px; }
      @supports (color: --foo()) {
        .card { border-color: --shade(var(--c)); }
        .a { background: --stripe(var(--c)); }
        .b { background: --stripe(var(--c), var(--w)); }
        .d { background: --stripe(--shade(var(--c), 45%), var(--w)); border-color: --shade(var(--c), 60%); }
      }`,
    js() {
      const c = document.getElementById('c'), w = document.getElementById('w'), out = document.getElementById('out');
      const ok = CSS.supports('color: --foo()');
      const ng = document.getElementById('ng');
      if (!ok) {
        ng.textContent = 'このブラウザは CSS の @function に対応していません（Chrome 139 以降で動きます）。関数を使わない塗りつぶしの色で表示しています。';
        ng.hidden = false;
      }
      function apply() {
        document.body.style.setProperty('--c', c.value);
        document.body.style.setProperty('--w', w.value + 'px');
        const v = getComputedStyle(document.querySelector('.b')).backgroundImage;
        out.textContent = ok ? `2 枚目の札で関数が返した値: ${v.length > 150 ? v.slice(0, 150) + '…' : v}` : '';
      }
      c.addEventListener('input', apply);
      w.addEventListener('input', apply);
      apply();
      if (window.THUMB) { let t = 0; setInterval(() => { t += 0.08; w.value = Math.round(14 + Math.sin(t) * 9); apply(); }, 80); }
    },
  }, {
    id: 'nw-css-if', c: 'new', lv: 2,
    t: '条件で値を切り替える（if()）', y: 'じょうけんであたいをきりかえるいふ',
    tags: ['if()', 'style()', 'media()', 'カスタムプロパティ', 'Chrome 137'],
    d: 'if() は 1 つの宣言の中で、条件ごとに違う値を選ぶ。条件には style()（カスタムプロパティの値）・media()（画面の幅など）・supports()（対応しているか）を使える。種類を選ぶと、色と印が --tone の値に合わせて変わる。前は条件ごとに別のセレクターや @media の塊を書き、同じプロパティを何度も書き直す必要があった。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <fieldset class="pick">
        <legend>知らせの種類（--tone の値）</legend>
        <label><input type="radio" name="tone" value="info" checked> info</label>
        <label><input type="radio" name="tone" value="ok"> ok</label>
        <label><input type="radio" name="tone" value="warn"> warn</label>
        <label><input type="radio" name="tone" value="ng"> ng</label>
      </fieldset>
      <div class="note" id="note">
        <span class="ic" id="ic" aria-hidden="true"></span>
        <p><b>知らせの見本</b><br>同じ CSS の宣言が、--tone の値を見て色と印を選びます。枠が 380px より狭いと、印と文を縦に並べます。</p>
      </div>
      <p class="mute" id="wide"></p>`,
    css: BASE + `
      body { --tone: info; display: grid; gap: 12px; align-content: center; justify-items: center; padding: 14px; }
      /* 選んだ種類を --tone に入れる。if() はこの値を見て値を選ぶ */
      body:has([value="ok"]:checked) { --tone: ok; }
      body:has([value="warn"]:checked) { --tone: warn; }
      body:has([value="ng"]:checked) { --tone: ng; }
      .pick { display: flex; flex-wrap: wrap; gap: 4px 14px; border: 1px solid var(--line); border-radius: 10px; font-size: 14px; }
      .note {
        display: flex; gap: 12px; align-items: center; width: min(440px, 92vw); padding: 14px; border-radius: 12px; border: 3px solid;
        /* 先に書いた値は、if() に未対応のブラウザで使われる */
        background: light-dark(#e0f2fe, #0c3a57);
        border-color: #0284c7;
        background: if(style(--tone: ok): light-dark(#dcfce7, #14462a); style(--tone: warn): light-dark(#fef3c7, #4a3a0c); style(--tone: ng): light-dark(#fee2e2, #4f1a1a); else: light-dark(#e0f2fe, #0c3a57));
        border-color: if(style(--tone: ok): #16a34a; style(--tone: warn): #d97706; style(--tone: ng): #dc2626; else: #0284c7);
        flex-direction: if(media(width < 380px): column; else: row);
      }
      .note p { margin: 0; }
      .ic {
        flex: none; width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center;
        color: #fff; font: 800 24px/1 system-ui, sans-serif;
        background: #0284c7;
        background: if(style(--tone: ok): #16a34a; style(--tone: warn): #b45309; style(--tone: ng): #dc2626; else: #0284c7);
      }
      .ic::before {
        content: attr(data-mark);
        content: if(style(--tone: ok): "✓"; style(--tone: warn): "!"; style(--tone: ng): "×"; else: "i");
      }`,
    js() {
      const ok = CSS.supports('color: if(style(--x: 1): red; else: blue)');
      const note = document.getElementById('note'), ic = document.getElementById('ic'), wide = document.getElementById('wide');
      const ng = document.getElementById('ng');
      if (!ok) {
        ng.textContent = 'このブラウザは CSS の if() に対応していません（Chrome 137 以降で動きます）。代わりに JS で枠と印の色を書き込んでいます（背景の色と、狭いときに縦に並ぶ動きは変わりません）。';
        ng.hidden = false;
        // 未対応のときだけ: 選んだ種類に合わせて色と印を style に書く
        const map = { info: ['#0284c7', 'i'], ok: ['#16a34a', '✓'], warn: ['#b45309', '!'], ng: ['#dc2626', '×'] };
        const paint = () => {
          const [col, mark] = map[document.querySelector('[name="tone"]:checked').value];
          note.style.borderColor = col; ic.style.background = col; ic.dataset.mark = mark;
        };
        document.querySelector('.pick').addEventListener('change', paint);
        paint();
      }
      const show = () => { wide.textContent = `この画面の幅: ${innerWidth}px（380px より狭いと縦に並びます）`; };
      addEventListener('resize', show);
      show();
      if (window.THUMB) { const rs = [...document.querySelectorAll('[name="tone"]')]; let i = 0; setInterval(() => { i = (i + 1) % rs.length; rs[i].checked = true; rs[i].dispatchEvent(new Event('change', { bubbles: true })); }, 700); }
    },
  }, {
    id: 'nw-contrast-color', c: 'new', lv: 1,
    t: '背景に合わせて読める文字色にする（contrast-color）', y: 'はいけいにあわせてよめるもじいろにするこんとらすとからー',
    tags: ['contrast-color()', '文字色', 'コントラスト', 'アクセシビリティ', 'Chrome 147'],
    d: 'contrast-color() に背景の色を渡すと、その上で読みやすい文字色（白か黒）をブラウザが選ぶ。色を選び直しても、並んだ色見本のどれでも、文字は読める色になる。前は JS で色の明るさを計算するか、背景の色ごとに文字色を手で決めておく必要があった。',
    p: '未対応のブラウザでは、相対色の color(from … xyz-d65 …) で明るさ（y）を取り出し、WCAG の境目の値と比べて白か黒を選ぶ式を代わりに使う。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <div class="pick">
        <label>背景の色 <input id="c" type="color" value="#ffcc33"></label>
        <label><input id="fix" type="checkbox"> 比べるために、いつも白い文字にする</label>
      </div>
      <div id="big" class="chip big"><b>読めますか？</b><span id="info"></span></div>
      <ul id="sw" class="sw" aria-label="色見本"></ul>`,
    css: BASE + `
      body { display: grid; gap: 12px; align-content: center; padding: 14px; }
      .pick { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; font-size: 14px; }
      .chip {
        background: var(--bg-c);
        /* 未対応のときの代わり: 背景の明るさ y を測り、境目より明るければ黒、暗ければ白にする */
        --wcag-y-threshold: 0.17913;
        --y: max(0, sign(var(--wcag-y-threshold) - y));
        color: color(from var(--bg-c) xyz-d65 calc(var(--y) * 0.9505) var(--y) calc(var(--y) * 1.089));
      }
      @supports (color: contrast-color(red)) {
        .chip { color: contrast-color(var(--bg-c)); }
      }
      body.fixed .chip { color: #fff; }
      .big { --bg-c: #ffcc33; display: grid; gap: 4px; place-items: center; min-height: 110px; padding: 10px; border-radius: 14px; font-size: 28px; text-align: center; }
      .big span { font-size: 13px; }
      .sw { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
      .sw li { padding: 10px 4px; border-radius: 8px; text-align: center; font: 600 12px/1.2 ui-monospace, monospace; }`,
    js() {
      const ok = CSS.supports('color: contrast-color(red)');
      const ng = document.getElementById('ng');
      if (!ok) {
        ng.textContent = 'このブラウザは contrast-color() に対応していません（Chrome 147 以降・Firefox 146 以降・Safari 26 以降で動きます）。代わりに相対色の式で白か黒を選んでいます。';
        ng.hidden = false;
      }
      const big = document.getElementById('big'), c = document.getElementById('c'), info = document.getElementById('info');
      const COLORS = ['#fef08a', '#facc15', '#f97316', '#dc2626', '#be185d', '#7c3aed', '#4338ca', '#0ea5e9', '#22d3ee', '#10b981', '#166534', '#a3e635', '#e5e7eb', '#6b7280', '#111827', '#ffffff'];
      document.getElementById('sw').replaceChildren(...COLORS.map((h) => {
        const li = document.createElement('li');
        li.className = 'chip';
        li.style.setProperty('--bg-c', h);
        li.textContent = h;
        return li;
      }));
      // WCAG の相対輝度とコントラスト比（確かめるための計算）
      const lum = (hex) => {
        const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      function apply() {
        big.style.setProperty('--bg-c', c.value);
        const L = lum(c.value);
        // 計算された文字色の最初の数が大きければ白、0 なら黒
        const first = parseFloat((getComputedStyle(big).color.match(/[\d.]+/) || ['0'])[0]);
        const white = first > 0.5;
        info.textContent = `選ばれた文字色: ${white ? '白' : '黒'}（白なら ${ratio(1, L).toFixed(1)} : 1、黒なら ${ratio(0, L).toFixed(1)} : 1）`;
      }
      c.addEventListener('input', apply);
      document.getElementById('fix').addEventListener('change', (e) => { document.body.classList.toggle('fixed', e.target.checked); apply(); });
      apply();
      if (window.THUMB) { let i = 0; setInterval(() => { i = (i + 1) % COLORS.length; c.value = COLORS[i]; apply(); }, 700); }
    },
  }, {
    id: 'nw-css-random', c: 'new', lv: 2,
    t: 'CSS だけでばらつきを作る（random()）', y: 'しーえすえすだけでばらつきをつくるらんだむ',
    tags: ['random()', '乱数', '星空', 'カスタムプロパティ'],
    d: 'random(最小, 最大) は、要素ごとに範囲の中から値を 1 つ選ぶ。星の位置・大きさ・またたく速さを CSS が決めるので、JS は要素を並べるだけでよい。random(--名前, 最小, 最大) と名前を付けると、同じ名前どうしは同じ値になる。前は JS の Math.random() で値を作り、要素ごとに style へ書き込む必要があった。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <div id="sky" class="sky" aria-hidden="true"></div>
      <div class="rows">
        <div class="row"><span>名前なし（ばらばら）</span><i class="each"></i><i class="each"></i><i class="each"></i><i class="each"></i><i class="each"></i></div>
        <div class="row"><span>名前付き（そろう）</span><i class="same"></i><i class="same"></i><i class="same"></i><i class="same"></i><i class="same"></i></div>
      </div>
      <button id="again" type="button">並べ直す</button>`,
    css: BASE + `
      body { display: grid; gap: 10px; align-content: center; justify-items: center; padding: 12px; }
      .sky { position: relative; width: min(560px, 94vw); height: 190px; border-radius: 14px; overflow: hidden; background: radial-gradient(ellipse at 50% 120%, #3b2a6b, #0b1026 70%); }
      .sky i {
        position: absolute; aspect-ratio: 1; border-radius: 50%; background: #fff; box-shadow: 0 0 6px #fff;
        /* 先の 3 行は未対応のブラウザ用（JS が --x などを入れる）。random() に対応していれば後の行が勝つ */
        left: var(--x, 50%); top: var(--y, 50%); width: var(--s, 3px);
        left: random(0%, 100%); top: random(0%, 100%); width: random(1px, 5px);
        animation: tw var(--d, 2s) ease-in-out infinite alternate;
        animation-duration: random(0.8s, 3s);
      }
      @keyframes tw { to { opacity: .15; scale: .6; } }
      @media (prefers-reduced-motion: reduce) { .sky i { animation: none; } }
      .rows { display: grid; gap: 6px; font-size: 13px; }
      .row { display: flex; align-items: center; gap: 6px; }
      .row span { width: 150px; color: var(--mute); }
      .row i { display: inline-block; height: 14px; border-radius: 7px; background: var(--accent); }
      .row .each { width: var(--x, 40px); width: random(14px, 70px); }
      /* 名前付きの値を要素どうしで分け合う。仕様の新しい書き方（element-shared）が読めるブラウザでは 3 行目が使われる */
      .row .same { width: var(--x, 40px); width: random(--bar, 14px, 70px); width: random(--bar element-shared, 14px, 70px); }`,
    js() {
      const ok = CSS.supports('width: random(10px, 20px)');
      const ng = document.getElementById('ng');
      const sky = document.getElementById('sky');
      if (!ok) {
        ng.textContent = 'このブラウザは CSS の random() に対応していません。代わりに JS の Math.random() で値を作って書き込んでいます。';
        ng.hidden = false;
      }
      const r = (a, b) => a + Math.random() * (b - a);
      // 未対応のときだけ、random() の代わりの値を JS で作る
      function fallback() {
        if (ok) return;
        for (const s of sky.children) {
          s.style.setProperty('--x', r(0, 100) + '%'); s.style.setProperty('--y', r(0, 100) + '%');
          s.style.setProperty('--s', r(1, 5) + 'px'); s.style.setProperty('--d', r(0.8, 3) + 's');
        }
        document.querySelectorAll('.each').forEach((e) => e.style.setProperty('--x', r(14, 70) + 'px'));
        const one = r(14, 70) + 'px';
        document.querySelectorAll('.same').forEach((e) => e.style.setProperty('--x', one));
      }
      // 要素を作り直すと、random() が新しい値を選ぶ
      function build() {
        sky.replaceChildren(...Array.from({ length: 70 }, () => document.createElement('i')));
        document.querySelectorAll('.row').forEach((row) => row.replaceChildren(...[...row.children].map((x) => x.cloneNode(true))));
        fallback();
      }
      document.getElementById('again').onclick = build;
      build();
      if (window.THUMB) setInterval(build, 1500);
    },
  }, {
    id: 'nw-shape-func', c: 'new', lv: 2,
    t: '大きさに合わせて伸びる切り抜き（shape()）', y: 'おおきさにあわせてのびるきりぬきしぇいぷ',
    tags: ['shape()', 'clip-path', 'path()', '吹き出し', 'Chrome 135'],
    d: 'clip-path の shape() は、path() と同じように線・曲線・円弧で形を描けるうえ、座標に % や calc() を使える。吹き出しの幅を変えると、shape() の方は角の丸みとしっぽの形を保ったまま伸び縮みする。前の path() は px の数しか書けないので、大きさが変わると形がずれ、JS で path を作り直すか SVG を使う必要があった。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <label class="ctl">吹き出しの幅 <input id="w" type="range" min="160" max="440" value="260"> <output id="wv">260px</output></label>
      <div class="pair">
        <figure><div class="bubble sh">shape() は幅に合わせて伸びます</div><figcaption>shape()（% と calc() で書く）</figcaption></figure>
        <figure><div class="bubble ph">path() は幅 260px の形のままです</div><figcaption>path()（px の数だけで書く）</figcaption></figure>
      </div>`,
    css: BASE + `
      body { display: grid; gap: 12px; align-content: center; justify-items: center; padding: 12px; }
      .ctl { display: flex; gap: 8px; align-items: center; font-size: 14px; }
      .pair { display: grid; gap: 12px; justify-items: center; }
      figure { margin: 0; display: grid; gap: 4px; justify-items: center; }
      figcaption { font: 12px ui-monospace, monospace; color: var(--mute); }
      .bubble { width: var(--w, 260px); max-width: 94vw; height: 110px; padding: 18px 20px 40px; color: #fff; font-weight: 700; background: linear-gradient(135deg, #c2410c, #be185d); }
      .sh {
        /* 未対応のときの代わり: 角が丸くない多角形 */
        clip-path: polygon(0 0, 100% 0, 100% calc(100% - 22px), calc(30% + 18px) calc(100% - 22px), 30% 100%, calc(30% - 4px) calc(100% - 22px), 0 calc(100% - 22px));
        clip-path: shape(from 16px 0, hline to calc(100% - 16px), arc to 100% 16px of 16px cw, vline to calc(100% - 38px),
          arc to calc(100% - 16px) calc(100% - 22px) of 16px cw, hline to calc(30% + 18px), line to 30% 100%,
          line to calc(30% - 4px) calc(100% - 22px), hline to 16px, arc to 0 calc(100% - 38px) of 16px cw, vline to 16px, arc to 16px 0 of 16px cw, close);
      }
      /* 同じ形を幅 260px・高さ 110px のときの px の数で書いたもの */
      .ph { clip-path: path("M16 0 H244 A16 16 0 0 1 260 16 V72 A16 16 0 0 1 244 88 H96 L78 110 L74 88 H16 A16 16 0 0 1 0 72 V16 A16 16 0 0 1 16 0 Z"); }`,
    js() {
      const ng = document.getElementById('ng');
      if (!CSS.supports('clip-path', 'shape(from 0 0, line to 100% 0, line to 50% 100%, close)')) {
        ng.textContent = 'このブラウザは clip-path の shape() に対応していません（Chrome 135 以降・Safari 18.4 以降で動きます）。上の吹き出しは、角が丸くない多角形で代わりに表示しています。';
        ng.hidden = false;
      }
      const w = document.getElementById('w');
      const apply = () => { document.body.style.setProperty('--w', w.value + 'px'); document.getElementById('wv').textContent = w.value + 'px'; };
      w.addEventListener('input', apply);
      apply();
      if (window.THUMB) { let t = 0; setInterval(() => { t += 0.07; w.value = Math.round(300 + Math.sin(t) * 130); apply(); }, 50); }
    },
  }, {
    id: 'nw-scroll-state', c: 'new', lv: 2,
    t: 'スクロールの状態で見た目を変える（scroll-state）', y: 'すくろーるのじょうたいでみためをかえるすくろーるすてーと',
    tags: ['@container scroll-state()', 'position: sticky', 'stuck', 'scrollable', 'Chrome 144'],
    d: '@container scroll-state() で、position: sticky の見出しが上に貼り付いているか（stuck）、まだ上や下へスクロールできるか（scrollable）を CSS の条件にできる。貼り付いた見出しは色が変わり、続きがある側にだけ影が出る。前は scroll イベントや IntersectionObserver で状態を調べ、JS でクラスを付け外しする必要があった。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <div id="box" class="box" tabindex="0" role="region" aria-label="今週の予定"></div>
      <p class="mute">枠の中をスクロールしてください。見出しが上に貼り付くと色が変わり、続きがある側に影が出ます。</p>`,
    css: BASE + `
      body { display: grid; gap: 8px; align-content: center; justify-items: center; padding: 12px; }
      .box {
        width: min(460px, 94vw); height: 250px; overflow-y: auto; overscroll-behavior-y: contain; scroll-padding-top: 40px;
        border: 1px solid var(--line); border-radius: 12px; background: var(--card);
        container-type: scroll-state;
      }
      /* 枠の上と下の影。続きがある側だけ見せる */
      .box::before, .box::after { content: ""; display: block; position: sticky; block-size: 14px; z-index: 2; pointer-events: none; opacity: 0; transition: opacity .2s; }
      .box::before { inset-block-start: 0; margin-block-end: -14px; background: radial-gradient(farthest-side at 50% 0, rgb(0 0 0 / .3), transparent); }
      .box::after { inset-block-end: 0; margin-block-start: -14px; background: radial-gradient(farthest-side at 50% 100%, rgb(0 0 0 / .3), transparent); }
      @container scroll-state(scrollable: block-start) { .box::before { opacity: 1; } }
      @container scroll-state(scrollable: block-end) { .box::after { opacity: 1; } }
      /* 見出しを貼り付ける。貼り付いたかどうかを、中の span が調べる */
      section { overflow-anchor: none; }
      .head { position: sticky; top: 0; z-index: 1; margin: 0; container-type: scroll-state; container-name: day-head; }
      .head > span { display: block; padding: 8px 14px; font-size: 15px; background: var(--card); border-bottom: 1px solid var(--line); transition: background-color .2s, color .2s, padding .2s, font-size .2s; }
      @container day-head scroll-state(stuck: top) {
        .head > span { padding-block: 4px; font-size: 13px; background: light-dark(#c2410c, #fdba74); color: light-dark(#fff, #1a1208); box-shadow: 0 3px 8px rgb(0 0 0 / .2); }
      }
      .box ul { margin: 0; padding: 6px 14px 12px 34px; }
      .box li { padding: 3px 0; }`,
    js() {
      const ng = document.getElementById('ng');
      if (!CSS.supports('container-type: scroll-state')) {
        ng.textContent = 'このブラウザは scroll-state の条件に対応していません（Chrome 144 以降で動きます）。見出しは貼り付きますが、色と影は変わりません。';
        ng.hidden = false;
      }
      const DAYS = [
        ['月曜日', ['朝の打ち合わせ', '資料の下書き', '図書館で本を返す']],
        ['火曜日', ['歯医者', '夕飯の買い出し', '植木に水をやる', '日記を書く']],
        ['水曜日', ['ノー残業の日', 'ギターの練習']],
        ['木曜日', ['発表の練習', '友だちに手紙', '燃えないごみの日']],
        ['金曜日', ['週のふり返り', '映画を見に行く', '部屋の片付け']],
        ['土曜日', ['朝の散歩', 'パンを焼く', '自転車の空気を入れる']],
      ];
      const box = document.getElementById('box');
      box.replaceChildren(...DAYS.map(([day, items]) => {
        const sec = document.createElement('section');
        const h = document.createElement('h3');
        h.className = 'head';
        h.append(Object.assign(document.createElement('span'), { textContent: day }));
        const ul = document.createElement('ul');
        ul.append(...items.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
        sec.append(h, ul);
        return sec;
      }));
      if (window.THUMB) { let t = 0; setInterval(() => { t += 0.03; box.scrollTop = (Math.sin(t) * 0.5 + 0.5) * (box.scrollHeight - box.clientHeight); }, 40); }
    },
  }, {
    id: 'nw-text-box', c: 'new', lv: 1,
    t: '文字の上下のすき間を切る（text-box）', y: 'もじのじょうげのすきまをきるてきすとぼっくす',
    tags: ['text-box', 'text-box-trim', '余白', '縦の位置合わせ', 'Chrome 133'],
    d: 'text-box: trim-both cap alphabetic と書くと、文字の上下にある見えないすき間を、大文字の高さから基準線までに切り詰める。ボタンや札の余白が見た目どおりにそろい、見出しの頭を絵の上端にぴったり合わせられる。前は書体ごとにすき間を測って、負の margin などの調整値を手で入れる必要があった。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <label class="sw"><input id="on" type="checkbox" checked> text-box で上下を切る</label>
      <div class="demo trim" id="demo">
        <button type="button" class="btn"><span class="ico" aria-hidden="true"></span><span class="t">Save</span></button>
        <span class="badge"><span class="t">NEW</span></span>
        <div class="hero"><div class="pic" aria-hidden="true"></div><h2 class="t">Hello 2026</h2></div>
      </div>
      <p class="mute">黄色の帯は、文字が占める箱です。切ると、箱が大文字の上端から基準線までになります。</p>
      <p id="m" class="mute"></p>`,
    css: BASE + `
      body { display: grid; gap: 12px; align-content: center; justify-items: center; padding: 14px; }
      .sw { font-size: 14px; }
      .demo { display: flex; flex-wrap: wrap; gap: 20px; align-items: center; justify-content: center; }
      /* 文字の箱を見えるように塗る */
      .t { display: inline-block; background: light-dark(#fde68a, #6b5313); }
      .demo.trim .t { text-box: trim-both cap alphabetic; }
      .btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 16px; font: 700 20px/1.6 system-ui, sans-serif; border-radius: 10px; }
      .ico { width: 18px; height: 18px; border-radius: 4px; background: var(--accent); }
      .badge { display: inline-flex; padding: 8px; border-radius: 8px; background: #be185d; color: #fff; font: 800 18px/1.8 system-ui, sans-serif; }
      .badge .t { background: #831843; }
      .hero { display: flex; gap: 10px; align-items: flex-start; }
      .pic { width: 54px; height: 54px; border-radius: 8px; background: linear-gradient(135deg, #0284c7, #4f46e5); }
      .hero h2 { margin: 0; font: 800 40px/1.5 system-ui, sans-serif; }`,
    js() {
      const ok = CSS.supports('text-box: trim-both cap alphabetic');
      const demo = document.getElementById('demo'), on = document.getElementById('on'), m = document.getElementById('m');
      const ng = document.getElementById('ng');
      if (!ok) {
        ng.textContent = 'このブラウザは text-box に対応していません（Chrome 133 以降・Safari 18.2 以降で動きます）。文字はいつもの上下のすき間のまま表示しています。';
        ng.hidden = false;
        on.disabled = true;
      }
      const ts = [...demo.querySelectorAll('.t')];
      // 切る前と切った後の、文字の箱の高さを測って並べる
      function measure() {
        const was = demo.classList.contains('trim');
        demo.classList.remove('trim');
        const before = ts.map((t) => t.getBoundingClientRect().height);
        demo.classList.add('trim');
        const after = ts.map((t) => t.getBoundingClientRect().height);
        demo.classList.toggle('trim', was);
        // 開いた直後で幅や高さが 0 のときは書かず、大きさが決まってから測り直す
        if (!before.some((h) => h > 0)) return;
        m.textContent = '文字の箱の高さ（切る前 → 切った後）: ' + ts.map((t, i) => `${t.textContent} ${Math.round(before[i])}px → ${Math.round(after[i])}px`).join('、');
      }
      on.addEventListener('change', () => demo.classList.toggle('trim', on.checked));
      measure();
      new ResizeObserver(measure).observe(document.body);
      if (window.THUMB) setInterval(() => { on.checked = !on.checked; demo.classList.toggle('trim', on.checked); }, 1200);
    },
  }, {
    id: 'nw-css-scope', c: 'new', lv: 2,
    t: '効く範囲を決めて CSS を書く（@scope）', y: 'きくはんいをきめてしーえすえすをかくすこーぷ',
    tags: ['@scope', '入れ子', '近さ', 'テーマ', 'Chrome 118'],
    d: '@scope (.light) { … } と書くと、中の規則は指定した要素の内側だけに効き、範囲が入れ子になったときは近い方の規則が勝つ。to (.slot) を付けると、そこから先を範囲の外にできる。前は入れ子のときの勝ち負けを、詳細度を上げたり :not() を重ねたりして調整する必要があった。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <div class="cols">
        <section>
          <h3>ふつうのセレクター</h3>
          <div class="old light"><button type="button" class="btn">明るい枠</button>
            <div class="old dark"><button type="button" class="btn">暗い枠</button>
              <div class="old light"><button type="button" class="btn">明るい枠</button></div>
            </div>
          </div>
          <p class="mute">いちばん内側のボタンにも、後に書いた「暗い枠」の色が当たります。</p>
        </section>
        <section>
          <h3>@scope</h3>
          <div class="new light"><button type="button" class="btn">明るい枠</button>
            <div class="new dark"><button type="button" class="btn">暗い枠</button>
              <div class="new light"><button type="button" class="btn">明るい枠</button></div>
            </div>
          </div>
          <p class="mute">いちばん内側のボタンは、近い「明るい枠」の色になります。</p>
        </section>
      </div>
      <section>
        <h3>ここから先は除く（@scope (.card) to (.slot)）</h3>
        <article class="card"><p>カードの文には、カードの CSS で色が付きます。</p><div class="slot"><p>差し込まれた文は範囲の外なので、色が付きません。</p></div></article>
      </section>`,
    css: BASE + `
      body { display: grid; gap: 12px; align-content: center; padding: 12px; }
      .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
      h3 { margin: 0 0 6px; font-size: 13px; }
      .light, .dark { padding: 8px; border-radius: 10px; border: 1px solid #8886; display: grid; gap: 6px; justify-items: start; }
      .light { background: #f8fafc; color: #0f172a; }
      .dark { background: #1e293b; color: #f1f5f9; }
      .btn { border: 0; font-weight: 700; }
      .cols .mute { margin-top: 6px; }
      /* ふつうのセレクター: 入れ子の深さは関係なく、詳細度が同じなら後に書いた規則が勝つ */
      .old.light .btn { background: #0f172a; color: #fff; }
      .old.dark .btn { background: #fde047; color: #0f172a; }
      /* @scope: 範囲の根が近い方の規則が勝つ */
      @scope (.new.light) { .btn { background: #0f172a; color: #fff; } }
      @scope (.new.dark) { .btn { background: #fde047; color: #0f172a; } }
      /* .card の中で、.slot より内側は除く */
      @scope (.card) to (.slot) { p { color: light-dark(#b45309, #fbbf24); font-weight: 700; } }
      .card { padding: 10px; border-radius: 10px; background: var(--card); border: 1px solid var(--line); }
      .card p { margin: 0; }
      .slot { margin-top: 6px; padding: 8px; border: 2px dashed var(--line); border-radius: 8px; }`,
    js() {
      const ng = document.getElementById('ng');
      if (typeof CSSScopeRule === 'undefined') {
        ng.textContent = 'このブラウザは @scope に対応していません（Chrome 118 以降・Safari 17.4 以降で動きます）。@scope の側のボタンと文は、色の付かない表示になります。';
        ng.hidden = false;
      }
    },
  }, {
    id: 'nw-reading-flow', c: 'new', lv: 2,
    t: '見た目の順に Tab で進む（reading-flow）', y: 'みためのじゅんにたぶですすむりーでぃんぐふろー',
    tags: ['reading-flow', 'Tab キー', 'グリッド', 'アクセシビリティ', 'Chrome 137'],
    d: 'グリッドで置き場所を変えた要素は、Tab キーでは HTML に書いた順に進むので、見た目の順とずれる。コンテナに reading-flow: grid-rows を付けると、Tab の順と読み上げの順が、見た目の行の順になる。前は HTML の順番そのものを書き換えるか、tabindex に数字を振る必要があった（tabindex の数字はページ全体の順まで変えてしまう）。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <p class="mute">左の枠の「ア」を押してから、Tab キーを何度か押してください。止まった順に番号が付きます。右の枠でも試してください。</p>
      <div class="cols">
        <section>
          <h3>そのまま</h3>
          <div class="g" id="a">
            <button type="button" style="grid-area: 2 / 1">エ</button><button type="button" style="grid-area: 1 / 1">ア</button>
            <button type="button" style="grid-area: 2 / 3">カ</button><button type="button" style="grid-area: 1 / 2">イ</button>
            <button type="button" style="grid-area: 2 / 2">オ</button><button type="button" style="grid-area: 1 / 3">ウ</button>
          </div>
        </section>
        <section>
          <h3>reading-flow: grid-rows</h3>
          <div class="g flow" id="b">
            <button type="button" style="grid-area: 2 / 1">エ</button><button type="button" style="grid-area: 1 / 1">ア</button>
            <button type="button" style="grid-area: 2 / 3">カ</button><button type="button" style="grid-area: 1 / 2">イ</button>
            <button type="button" style="grid-area: 2 / 2">オ</button><button type="button" style="grid-area: 1 / 3">ウ</button>
          </div>
        </section>
      </div>
      <button id="reset" type="button">番号を消す</button>`,
    css: BASE + `
      body { display: grid; gap: 12px; align-content: center; justify-items: center; padding: 14px; }
      .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; width: min(480px, 94vw); }
      h3 { margin: 0 0 6px; font: 600 13px ui-monospace, monospace; }
      .g { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
      .g.flow { reading-flow: grid-rows; }
      .g button { position: relative; height: 46px; font-weight: 800; }
      .g button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
      .g button[data-step]::after {
        content: attr(data-step); position: absolute; top: -8px; right: -8px; min-width: 22px; height: 22px; border-radius: 11px;
        background: #c2410c; color: #fff; font-size: 12px; line-height: 22px;
      }`,
    js() {
      const ng = document.getElementById('ng');
      if (!CSS.supports('reading-flow: grid-rows')) {
        ng.textContent = 'このブラウザは reading-flow に対応していません（Chrome 137 以降で動きます）。どちらの枠も、Tab は HTML に書いた順に進みます。';
        ng.hidden = false;
      }
      const boxes = [document.getElementById('a'), document.getElementById('b')];
      const count = new Map(boxes.map((g) => [g, 0]));
      // 枠の中でフォーカスが止まった順に、番号を付ける
      for (const g of boxes) {
        g.addEventListener('focusin', (e) => {
          const b = e.target.closest('button');
          if (!b || b.dataset.step) return;
          count.set(g, count.get(g) + 1);
          b.dataset.step = count.get(g);
        });
      }
      document.getElementById('reset').onclick = () => {
        for (const g of boxes) { count.set(g, 0); g.querySelectorAll('[data-step]').forEach((b) => delete b.dataset.step); }
      };
      // 一覧の小さな絵では、両方の枠を Tab で回った結果を先に見せる
      if (window.THUMB) {
        [...boxes[0].children].forEach((b, i) => { b.dataset.step = i + 1; });
        const order = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ'];
        [...boxes[1].children].forEach((b) => { b.dataset.step = order.indexOf(b.textContent) + 1; });
      }
    },
  }, {
    id: 'nw-interestfor', c: 'new', lv: 2,
    t: '乗せるだけで説明を出す（interestfor）', y: 'のせるだけでせつめいをだすいんたれすとふぉー',
    tags: ['interestfor', 'popover="hint"', 'ツールチップ', 'アンカー配置', 'Chrome 149'],
    d: 'ボタンやリンクに interestfor="説明の id" を付けると、マウスを乗せる・Tab キーで選ぶ・長押しするだけで popover="hint" の説明が出て、離れると消える。説明の位置は CSS のアンカー配置で決める。前は mouseenter・mouseleave・focus・blur と待ち時間の処理を JS で書く必要があった。',
    p: '説明の文がボタンの名前と同じときは何も足さない。言葉のボタンは押しても説明を出す（popovertarget）ので、role="tooltip" と aria-expanded を小さな JS で付けている。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <div class="tools" role="toolbar" aria-label="文字の飾り">
        <button type="button" interestfor="h-b" aria-label="太字"><b>B</b></button>
        <button type="button" interestfor="h-i" aria-label="斜体"><i>I</i></button>
        <button type="button" interestfor="h-u" aria-label="下線"><u>U</u></button>
      </div>
      <div popover="hint" id="h-b">太字</div>
      <div popover="hint" id="h-i">斜体</div>
      <div popover="hint" id="h-u">下線</div>
      <p class="text">みかんの皮を干したものは<button type="button" class="term" interestfor="h-chinpi" popovertarget="h-chinpi" popovertargetaction="show">陳皮</button>と呼ばれ、七味の材料になります。冬は<button type="button" class="term" interestfor="h-kotatsu" popovertarget="h-kotatsu" popovertargetaction="show">こたつ</button>でみかんをむく人が多いです。</p>
      <div popover="hint" id="h-chinpi"><b>陳皮（ちんぴ）</b><br>みかんの皮を乾かしたもの。香りがよく、薬味や漢方薬に使われます。</div>
      <div popover="hint" id="h-kotatsu"><b>こたつ</b><br>机の下に熱源があり、布団をかけて足を温める暖房器具です。</div>
      <p class="mute">ボタンや下線の言葉にマウスを乗せるか、Tab キーで選ぶと説明が出ます。言葉は押しても説明が出ます。</p>`,
    css: BASE + `
      body { display: grid; gap: 14px; align-content: center; justify-items: center; padding: 40px 16px 16px; }
      .tools { display: flex; gap: 6px; }
      .tools button { width: 40px; height: 40px; padding: 0; font-size: 17px; }
      .text { max-width: 30em; margin: 0; font-size: 16px; line-height: 2; }
      .term { padding: 0 2px; border: 0; border-radius: 4px; background: none; font: inherit; color: var(--accent); text-decoration: underline dotted; text-underline-offset: 4px; cursor: help; }
      [interestfor] { interest-delay-start: 0.2s; }
      [popover] {
        max-width: 260px; padding: 8px 10px; font-size: 13px; line-height: 1.6;
        border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: light-dark(#1f1d1a, #ece7dc);
        box-shadow: 0 6px 18px #0003;
      }
      /* アンカー配置に対応していれば、ボタンの上（入らなければ下）に出す。未対応ならブラウザの既定の位置（画面の中央）のまま */
      @supports (position-area: block-end) {
        [popover] { inset: auto; margin: 6px 0; position-area: block-start; position-try-fallbacks: flip-block; }
      }`,
    js() {
      const ng = document.getElementById('ng');
      const owned = new Set();
      const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      // 説明と、それを出すボタンの関係を、読み上げにも伝わる形にする（最初に 1 回だけ、どのブラウザでも行う）
      function wire() {
        for (const t of document.querySelectorAll('[interestfor]')) {
          const hint = document.getElementById(t.getAttribute('interestfor'));
          if (!hint || hint.getAttribute('popover') !== 'hint') continue;
          if (norm(hint.textContent) === norm(t.getAttribute('aria-label') || t.textContent)) continue;
          if (!hint.hasAttribute('role')) hint.setAttribute('role', 'tooltip');
          const opens = t.getAttribute('popovertarget') === hint.id || t.getAttribute('commandfor') === hint.id;
          if (opens) {
            if (!t.hasAttribute('aria-expanded')) { t.setAttribute('aria-expanded', String(hint.matches(':popover-open'))); owned.add(t); }
          } else if (!t.hasAttribute('aria-describedby')) t.setAttribute('aria-describedby', hint.id);
        }
      }
      wire();
      // toggle は泡立たないので、捕まえる段階で受け取る
      document.addEventListener('toggle', (e) => {
        for (const t of owned) if (t.getAttribute('interestfor') === e.target.id) t.setAttribute('aria-expanded', String(e.newState === 'open'));
      }, true);
      // popover="hint" に未対応なら、押して開く説明は auto として開く（manual のままだと閉じなくなる）
      const probe = document.createElement('div');
      probe.popover = 'hint';
      if (probe.popover !== 'hint') {
        document.addEventListener('beforetoggle', (e) => {
          const tip = e.target.getAttribute('popover') === 'hint' && document.querySelector(`[popovertarget="${CSS.escape(e.target.id)}"]`);
          if (e.newState === 'open' && tip) e.target.popover = 'auto';
        }, true);
      }
      if (!('interestForElement' in HTMLButtonElement.prototype)) {
        ng.textContent = 'このブラウザは interestfor に対応していません（Chrome 149 以降で動きます）。代わりに、短い JS でマウスやフォーカスに合わせて説明を出し入れしています。';
        ng.hidden = false;
        // 代わりの動き: 乗せたら少し待って出し、離れたら少し待って消す
        for (const t of document.querySelectorAll('[interestfor]')) {
          const hint = document.getElementById(t.getAttribute('interestfor'));
          if (!hint || !hint.showPopover) continue;
          let timer = 0;
          const show = () => { clearTimeout(timer); timer = setTimeout(() => { try { hint.showPopover({ source: t }); } catch { /* 開いている */ } }, 200); };
          const hide = () => { clearTimeout(timer); timer = setTimeout(() => { if (!hint.matches(':hover')) try { hint.hidePopover(); } catch { /* 閉じている */ } }, 250); };
          t.addEventListener('pointerenter', show); t.addEventListener('focus', show);
          t.addEventListener('pointerleave', hide); t.addEventListener('blur', hide);
          hint.addEventListener('pointerleave', hide);
        }
      }
      if (window.THUMB) { const h = document.getElementById('h-chinpi'); try { h.showPopover({ source: document.querySelector('[interestfor="h-chinpi"]') }); } catch { /* 開けない */ } }
    },
  }, {
    id: 'nw-commandfor', c: 'new', lv: 2,
    t: 'JS を書かずにボタンで開け閉めする（commandfor）', y: 'じぇいえすをかかずにぼたんであけしめするこまんどふぉー',
    tags: ['commandfor', 'command', 'dialog', 'popover', 'Chrome 135'],
    d: 'ボタンに commandfor="相手の id" と command="show-modal" などを書くと、JS なしでダイアログを開け閉めしたり、ポップオーバーを出し入れしたりできる。-- で始まる自分の命令も送れて、相手の要素が command イベントで受け取る。前はボタンごとに click の処理を書き、aria-expanded の更新も自分で行う必要があった。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <div class="bar">
        <button type="button" commandfor="dlg" command="show-modal">設定を開く</button>
        <button type="button" id="menuBtn" commandfor="menu" command="toggle-popover">メニュー</button>
        <button type="button" commandfor="pic" command="--turn">風車を回す</button>
        <button type="button" commandfor="pic" command="--reset">元に戻す</button>
      </div>
      <div id="menu" popover>
        <p>ここはポップオーバーです。外を押すか Esc キーでも閉じます。</p>
        <button type="button" commandfor="menu" command="hide-popover">閉じる</button>
      </div>
      <dialog id="dlg" aria-labelledby="dlg-h">
        <h2 id="dlg-h">設定</h2>
        <p>このダイアログは、JS を書かずにボタンだけで開いています。Esc キーでも閉じます。</p>
        <button type="button" commandfor="dlg" command="close">閉じる</button>
      </dialog>
      <div id="pic" class="pic" role="img" aria-label="風車の絵"></div>
      <ol id="log" class="log" aria-label="届いた命令"></ol>`,
    css: BASE + `
      body { display: grid; gap: 14px; align-content: center; justify-items: center; padding: 14px; }
      .bar { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
      .pic {
        width: 96px; height: 96px; border-radius: 50%; rotate: var(--deg, 0deg); transition: rotate .4s;
        background: repeating-conic-gradient(#f97316 0 30deg, #fde047 0 60deg, #16a34a 0 90deg);
        box-shadow: 0 0 0 6px var(--card), 0 6px 16px #0003;
      }
      @media (prefers-reduced-motion: reduce) { .pic { transition: none; } }
      .log { margin: 0; padding-left: 1.4em; width: min(440px, 94vw); min-height: 4.8em; font-size: 13px; color: var(--mute); }
      dialog, #menu { border: 1px solid var(--line); border-radius: 14px; padding: 14px 18px; background: var(--card); color: light-dark(#1f1d1a, #ece7dc); box-shadow: 0 10px 30px #0004; max-width: min(360px, 90vw); }
      dialog::backdrop { background: rgb(0 0 0 / .45); }
      dialog h2 { margin: 0 0 6px; font-size: 18px; }
      #menu p { margin: 0 0 8px; font-size: 14px; }
      /* メニューは押したボタンの下に出す。アンカー配置に未対応なら画面の中央のまま */
      @supports (position-area: block-end) {
        #menu { inset: auto; margin: 6px 0; position-area: block-end span-inline-end; position-try-fallbacks: flip-block; }
      }`,
    js() {
      const ng = document.getElementById('ng');
      const log = document.getElementById('log'), pic = document.getElementById('pic'), menu = document.getElementById('menu');
      const add = (s) => { const li = document.createElement('li'); li.textContent = s; log.prepend(li); while (log.children.length > 4) log.lastElementChild.remove(); };
      // command イベントは泡立たないので、命令を受ける要素ごとに聞く
      for (const t of [document.getElementById('dlg'), menu, pic]) {
        t.addEventListener('command', (e) => add(`#${t.id} が「${e.command}」を受け取りました（ボタン: ${e.source ? e.source.textContent : '不明'}）`));
      }
      // 自分で作った命令（-- で始まる）は、受け取った側が処理する
      let deg = 0;
      pic.addEventListener('command', (e) => {
        if (e.command === '--turn') deg += 45;
        if (e.command === '--reset') deg = 0;
        pic.style.setProperty('--deg', deg + 'deg');
      });
      // ポップオーバーの中の「閉じる」で閉じたとき、フォーカスが行き場を失ったら開いたボタンへ戻す
      menu.addEventListener('toggle', (e) => { if (e.newState === 'closed' && (!document.activeElement || document.activeElement === document.body)) document.getElementById('menuBtn').focus(); });
      if (!('commandForElement' in HTMLButtonElement.prototype)) {
        ng.textContent = 'このブラウザは commandfor と command に対応していません（Chrome 135 以降・Firefox 144 以降・Safari 26.2 以降で動きます）。代わりに、短い JS でボタンの命令を相手に伝えています。';
        ng.hidden = false;
        // 代わりの動き: 押されたボタンの命令を読み、相手の要素へ command イベントを送ってから動かす
        document.addEventListener('click', (ev) => {
          const b = ev.target.closest('button[commandfor]');
          const t = b && document.getElementById(b.getAttribute('commandfor'));
          if (!t) return;
          const cmd = b.getAttribute('command') || '';
          const ce = new Event('command', { cancelable: true });
          Object.assign(ce, { command: cmd, source: b });
          if (!t.dispatchEvent(ce)) return;
          try {
            if (cmd === 'show-modal') t.showModal();
            else if (cmd === 'close') t.close();
            else if (cmd === 'toggle-popover') t.togglePopover();
            else if (cmd === 'show-popover') t.showPopover();
            else if (cmd === 'hide-popover') t.hidePopover();
          } catch { /* すでにその状態 */ }
        });
      }
      if (window.THUMB) setInterval(() => document.querySelector('[command="--turn"]').click(), 900);
    },
  }, {
    id: 'nw-temporal', c: 'new', lv: 2,
    t: '日付と時刻を正しく計算する（Temporal）', y: 'ひづけとじこくをただしくけいさんするてんぽらる',
    tags: ['Temporal', '日付', 'タイムゾーン', '夏時間', 'Chrome 144'],
    d: 'Temporal は Date に代わる日付と時刻の道具。「1 月 31 日の 1 か月後」を 2 月の末日にそろえ、東京の会議の時刻を世界の都市の時刻に直し、夏時間で存在しない時刻を見つけ、目標の日までを「何か月と何日」で数える。前は Date の月の繰り越しや時差を自分で計算するか、日付のライブラリを読み込む必要があった。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <div class="grid">
        <section>
          <h3>1 か月後はいつ？</h3>
          <label>日付 <input id="d" type="date" value="2026-01-31"></label>
          <dl><dt>Temporal</dt><dd id="t1"></dd><dt>Date</dt><dd id="d1"></dd></dl>
        </section>
        <section>
          <h3>東京の会議は、各地で何時？</h3>
          <label>東京の日時 <input id="dt" type="datetime-local" value="2026-03-09T09:00"></label>
          <ul id="zones"></ul>
        </section>
        <section>
          <h3>夏時間で消える時刻</h3>
          <label>ニューヨークの日時 <input id="ny" type="datetime-local" value="2026-03-08T02:30"></label>
          <p id="gap"></p>
        </section>
        <section>
          <h3>あとどれくらい？</h3>
          <label>目標の日 <input id="goal" type="date"></label>
          <p id="left"></p>
        </section>
      </div>`,
    css: BASE + `
      body { display: grid; gap: 10px; align-content: center; padding: 12px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; }
      section { padding: 10px 12px; border-radius: 12px; background: var(--card); border: 1px solid var(--line); font-size: 13px; }
      h3 { margin: 0 0 6px; font-size: 14px; }
      label { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 8px 0 0; }
      dt { font-weight: 700; } dd { margin: 0; }
      ul { margin: 8px 0 0; padding-left: 1.2em; }
      p { margin: 8px 0 0; }`,
    js() {
      const T = globalThis.Temporal;
      const has = typeof T !== 'undefined';
      const $ = (id) => document.getElementById(id);
      if (!has) {
        $('ng').textContent = 'このブラウザは Temporal に対応していません（Chrome 144 以降・Firefox 139 以降で動きます）。比べるために、Date と Intl で計算できる所だけを表示しています。';
        $('ng').hidden = false;
      }
      const DAY = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
      const TIME = { month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' };
      // 1 か月後: Date は「2 月 31 日」を 3 月に繰り越す。Temporal はその月の末日にそろえる
      function monthLater() {
        const v = $('d').value;
        if (!v) return;
        const [y, m, dd] = v.split('-').map(Number);
        const x = new Date(y, m - 1, dd);
        x.setMonth(x.getMonth() + 1);
        $('d1').textContent = x.toLocaleDateString('ja-JP', DAY);
        $('t1').textContent = has ? T.PlainDate.from(v).add({ months: 1 }).toLocaleString('ja-JP', DAY) : '（Temporal が必要です）';
      }
      const ZONES = [['Asia/Tokyo', '東京'], ['Europe/London', 'ロンドン'], ['America/New_York', 'ニューヨーク'], ['America/Los_Angeles', 'ロサンゼルス'], ['Australia/Sydney', 'シドニー']];
      function world() {
        const v = $('dt').value;
        if (!v) return;
        const tokyo = has ? T.PlainDateTime.from(v).toZonedDateTime('Asia/Tokyo') : null;
        $('zones').replaceChildren(...ZONES.map(([z, label]) => {
          let text;
          if (tokyo) text = tokyo.withTimeZone(z).toLocaleString('ja-JP', TIME);
          else {
            // 代わりの計算: 東京は夏時間がないので、9 時間引いた世界時から Intl で各地の時刻にする
            const [date, time] = v.split('T');
            const [y, m, dd] = date.split('-').map(Number);
            const [h, mi] = time.split(':').map(Number);
            text = new Date(Date.UTC(y, m - 1, dd, h - 9, mi)).toLocaleString('ja-JP', { ...TIME, timeZone: z });
          }
          const li = document.createElement('li');
          li.append(Object.assign(document.createElement('b'), { textContent: label }), ' ' + text);
          return li;
        }));
      }
      // 夏時間の切り替えで、時計が飛んで存在しない時刻・2 回来る時刻を見つける
      function gap() {
        const v = $('ny').value;
        if (!v) return;
        if (!has) { $('gap').textContent = 'この確かめには Temporal が必要です。'; return; }
        const pdt = T.PlainDateTime.from(v);
        try {
          const z = pdt.toZonedDateTime('America/New_York', { disambiguation: 'reject' });
          $('gap').textContent = `この時刻は 1 つに決まります。東京では ${z.withTimeZone('Asia/Tokyo').toLocaleString('ja-JP', TIME)} です。`;
        } catch (e) {
          if (!(e instanceof RangeError)) throw e;
          const z = pdt.toZonedDateTime('America/New_York', { disambiguation: 'compatible' });
          $('gap').textContent = `夏時間の切り替えのため、この時刻はないか 2 回あります。compatible で選ぶと ${z.toLocaleString('ja-JP', { ...TIME, timeZoneName: 'short' })} になります。`;
        }
      }
      // 目標の日まで: 「何か月と何日」と「全部で何日」の 2 通りで数える
      function left() {
        const v = $('goal').value;
        if (!v) return;
        if (!has) {
          const [y, m, dd] = v.split('-').map(Number);
          const n = new Date();
          const days = Math.round((Date.UTC(y, m - 1, dd) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
          $('left').textContent = `全部で ${days} 日（何か月と何日、の数え方には Temporal が必要です）`;
          return;
        }
        const today = T.Now.plainDateISO(), g = T.PlainDate.from(v);
        const dur = today.until(g, { largestUnit: 'month' });
        const days = today.until(g, { largestUnit: 'day' }).days;
        if (dur.sign === 0) $('left').textContent = '今日です。';
        else if (dur.sign < 0) $('left').textContent = `${dur.negated().toLocaleString('ja-JP', { style: 'long' })}前に過ぎました（${-days} 日前）。`;
        else $('left').textContent = `あと ${dur.toLocaleString('ja-JP', { style: 'long' })}（全部で ${days} 日）です。`;
      }
      const y = has ? T.Now.plainDateISO().year : new Date().getFullYear();
      $('goal').value = `${y + 1}-01-01`;
      $('d').addEventListener('input', monthLater);
      $('dt').addEventListener('input', world);
      $('ny').addEventListener('input', gap);
      $('goal').addEventListener('input', left);
      monthLater(); world(); gap(); left();
    },
  }, {
    id: 'nw-sethtml', c: 'new', lv: 2,
    t: '危ない所を除いて HTML を入れる（setHTML）', y: 'あぶないところをのぞいてえいちてぃーえむえるをいれるせっとえいちてぃーえむえる',
    tags: ['setHTML', 'Sanitizer API', 'XSS', '安全', 'Chrome 146'],
    d: 'Element.setHTML() は、渡された HTML から script や onerror などの危ない部分を取り除いてから要素に入れる（Sanitizer API）。許すタグを自分で絞ることもできる。前は innerHTML に入れる前に DOMPurify などのライブラリで消毒する必要があり、忘れると書き込まれた script が動いてしまった。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <label for="src">外から届いた HTML（書き換えて試せます）</label>
      <textarea id="src" rows="7" spellcheck="false"></textarea>
      <div class="bar">
        <label><input type="radio" name="mode" value="default" checked> 既定の設定</label>
        <label><input type="radio" name="mode" value="strict"> h3・p・b・em だけ許し、属性は外す</label>
      </div>
      <div class="out">
        <section><h3>入った結果</h3><div id="view" class="view"></div></section>
        <section><h3>取り除かれた物</h3><ul id="gone"></ul></section>
      </div>`,
    css: BASE + `
      body { display: grid; gap: 8px; align-content: center; padding: 12px; }
      textarea { width: 100%; font: 12px/1.5 ui-monospace, monospace; resize: vertical; }
      .bar { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 14px; }
      .out { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
      section { padding: 8px 10px; border-radius: 10px; background: var(--card); border: 1px solid var(--line); min-width: 0; }
      section h3 { margin: 0 0 4px; font-size: 13px; color: var(--mute); }
      .view { font-size: 14px; overflow-wrap: anywhere; }
      .view h3 { margin: 0; font-size: 16px; }
      .view p { margin: 4px 0; }
      .view img { display: inline-block; width: 1em; height: 1em; }
      #gone { margin: 0; padding-left: 1.2em; font: 12px/1.6 ui-monospace, monospace; }`,
    js() {
      const SAMPLE = [
        '<h3>読者のコメント</h3>',
        '<p>とても<b>参考に</b>なりました。<a href="https://example.com/" onclick="alert(\'ねらわれた\')">私のページ</a></p>',
        '<img src="x:broken" onerror="alert(\'ねらわれた\')" alt="壊れた画像">',
        '<script>alert(\'ねらわれた\')</script>',
        '<p style="color: red" data-id="7">色を付けた<em>段落</em></p>',
        '<a href="javascript:alert(\'ねらわれた\')">押してはいけないリンク</a>',
        '<iframe src="https://example.com/"></iframe>',
      ].join('\n');
      const src = document.getElementById('src'), view = document.getElementById('view'), gone = document.getElementById('gone');
      const ok = 'setHTML' in Element.prototype;
      const ng = document.getElementById('ng');
      src.value = SAMPLE;
      if (!ok) {
        ng.textContent = 'このブラウザは Sanitizer API（setHTML）に対応していません（Chrome 146 以降・Firefox 148 以降で動きます）。安全のため、HTML として入れずに文字のまま表示しています。';
        ng.hidden = false;
      }
      // 要素と属性を「タグ」「タグ の 属性」の形で数える
      function census(root) {
        const n = new Map();
        const up = (k) => n.set(k, (n.get(k) || 0) + 1);
        for (const el of root.querySelectorAll('*')) {
          const tag = el.localName;
          up(`<${tag}>`);
          for (const a of el.attributes) up(a.name === 'href' && /^\s*javascript:/i.test(a.value) ? `<${tag}> の href（javascript:）` : `<${tag}> の ${a.name} 属性`);
        }
        return n;
      }
      function run() {
        if (!ok) { view.textContent = src.value; gone.replaceChildren(Object.assign(document.createElement('li'), { textContent: '（setHTML が必要です）' })); return; }
        const strict = document.querySelector('[name="mode"]:checked').value === 'strict';
        // 許す要素の一覧に無い要素は中身ごと消える。a は中の文字だけ残す
        if (strict) view.setHTML(src.value, { sanitizer: { elements: ['h3', 'p', 'b', 'em'], attributes: [], replaceWithChildrenElements: ['a'] } });
        else view.setHTML(src.value);
        // 比べるための解析: DOMParser の文書の中では script は動かず、画像も読まない
        const raw = census(new DOMParser().parseFromString(src.value, 'text/html').body);
        const now = census(view);
        const lost = (k) => (raw.get(k) || 0) - (now.get(k) || 0);
        // 要素ごと取り除かれたときは、その要素の属性は並べない
        const list = [...raw.keys()].filter((k) => lost(k) > 0 && !(k.includes(' の ') && lost(k.split(' の ')[0]) > 0)).map((k) => `${k} ${lost(k)} 個`);
        gone.replaceChildren(...(list.length ? list : ['（取り除かれた物はありません）']).map((s) => Object.assign(document.createElement('li'), { textContent: s })));
      }
      let timer = 0;
      src.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 200); });
      document.querySelector('.bar').addEventListener('change', run);
      run();
    },
  }, {
    id: 'nw-move-before', c: 'new', lv: 2,
    t: '状態を保ったまま要素を動かす（moveBefore）', y: 'じょうたいをたもったままようそをうごかすむーぶびふぉあ',
    tags: ['moveBefore', 'DOM', 'iframe', 'フォーカス', 'Chrome 133'],
    d: 'parent.moveBefore(要素, 基準) は、要素を取り外さずに別の場所へ移す。中の iframe は読み込み直さず、CSS アニメーションは続き、入力欄のフォーカスも残る。前の appendChild や insertBefore は「取り外して入れ直す」動きなので、iframe が最初から読み込み直し、アニメーションも最初に戻った。',
    html: `
      <p id="ng" class="ng" role="status" hidden></p>
      <div class="bar">
        <button id="mv" type="button">moveBefore で移す</button>
        <button id="ins" type="button">insertBefore で移す（前の方法）</button>
        <label>2 秒ごとに自動で移す <select id="auto"><option value="">しない</option><option value="move">moveBefore</option><option value="insert">insertBefore</option></select></label>
      </div>
      <div class="shelves">
        <section id="left" class="shelf" aria-label="左の棚">
          <h3>左の棚</h3>
          <div id="card" class="card">
            <div class="meter" aria-hidden="true"><i></i></div>
            <iframe id="fr" title="数え続ける小窓"></iframe>
            <input id="memo" placeholder="ここに文字を打ってみてください" aria-label="メモ">
          </div>
        </section>
        <section id="right" class="shelf" aria-label="右の棚"><h3>右の棚</h3></section>
      </div>
      <p id="log" class="mute" role="status"></p>`,
    css: BASE + `
      body { display: grid; gap: 10px; align-content: center; padding: 12px; }
      .bar { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 13px; }
      .shelves { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .shelf { min-height: 190px; padding: 8px; border: 2px dashed var(--line); border-radius: 12px; min-width: 0; }
      .shelf h3 { margin: 0 0 6px; font-size: 13px; color: var(--mute); }
      .card { display: grid; gap: 6px; padding: 8px; border-radius: 10px; background: var(--card); box-shadow: 0 4px 12px #0002; }
      /* 6 秒かけて満ちる帯。取り外されると最初からやり直す */
      .meter { height: 10px; border-radius: 5px; background: light-dark(#e7e2d6, #3a362f); overflow: hidden; }
      .meter i { display: block; height: 100%; width: 100%; background: var(--accent); transform-origin: 0 50%; animation: fill 6s linear infinite; }
      @keyframes fill { from { scale: 0 1; } }
      @media (prefers-reduced-motion: reduce) { .meter i { animation-duration: 30s; } }
      iframe { width: 100%; height: 60px; border: 0; border-radius: 8px; }
      input { width: 100%; }`,
    js() {
      const card = document.getElementById('card'), left = document.getElementById('left'), right = document.getElementById('right');
      const memo = document.getElementById('memo'), out = document.getElementById('log');
      const has = 'moveBefore' in Element.prototype;
      const ng = document.getElementById('ng');
      if (!has) {
        ng.textContent = 'このブラウザは moveBefore() に対応していません（Chrome 133 以降・Firefox 144 以降で動きます）。どちらのボタンも insertBefore で移すので、小窓と帯は最初からやり直します。';
        ng.hidden = false;
      }
      // 小窓の中で、読み込んでからの時間を数え続ける
      document.getElementById('fr').srcdoc = '<meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#111827;color:#7dd3fc;font:700 22px system-ui,sans-serif"><span id="n">0.0 秒</span><script>const s=performance.now();setInterval(()=>{document.getElementById("n").textContent=((performance.now()-s)/1000).toFixed(1)+" 秒"},100)<\/script></body>';
      function moveCard(way) {
        const to = card.parentElement === left ? right : left;
        const hadFocus = document.activeElement === memo;
        if (way === 'move' && has) to.moveBefore(card, null);
        else to.insertBefore(card, null);
        const name = to === left ? '左の棚' : '右の棚';
        out.textContent = `${way === 'move' && has ? 'moveBefore' : 'insertBefore'} で${name}へ移しました。` +
          (hadFocus ? `入力欄のフォーカスは${document.activeElement === memo ? '残っています' : '外れました'}。` : '');
      }
      document.getElementById('mv').onclick = () => moveCard('move');
      document.getElementById('ins').onclick = () => moveCard('insert');
      let timer = 0;
      document.getElementById('auto').addEventListener('change', (e) => {
        clearInterval(timer);
        if (e.target.value) { timer = setInterval(() => moveCard(e.target.value), 2000); memo.focus(); }
      });
      if (window.THUMB) setInterval(() => moveCard('move'), 1500);
    },
  }, {
    id: 'nw-js-tools', c: 'new', lv: 2,
    t: 'JS に入った小さな道具 7 つ', y: 'じぇいえすにはいったちいさなどうぐななつ',
    tags: ['Uint8Array.fromBase64', 'Iterator helpers', 'Math.sumPrecise', 'RegExp.escape', 'Promise.try', 'Error.isError', 'Float16Array'],
    d: '2025〜2026 年に JavaScript に入った小さな道具を、前の書き方と並べて試す。バイト列と Base64・16 進の変換、終わりのない並びから必要な分だけ取り出す Iterator のメソッド、誤差の出ない合計、記号を文字として探す RegExp.escape、同期の例外も Promise で受ける Promise.try、本物のエラーかを調べる Error.isError、2 バイトの小数 Float16Array。使えない物は、前の書き方で計算した結果を出す。',
    html: `
      <div class="cards">
        <section class="card" id="c-b64">
          <h3>Uint8Array の Base64・16 進 <span class="st"></span></h3>
          <label>文字 <input id="b64in" value="出来る！🎉"></label>
          <dl><dt>toBase64()</dt><dd id="b64"></dd><dt>toHex()</dt><dd id="hex"></dd><dt>fromBase64() で戻す</dt><dd id="back"></dd></dl>
          <p class="old">前: btoa() は日本語をそのまま渡せず、String.fromCharCode で 1 バイトずつ文字にしてから変換した。</p>
        </section>
        <section class="card" id="c-iter">
          <h3>Iterator のメソッド <span class="st"></span></h3>
          <label>素数をいくつ <input id="cnt" type="number" min="1" max="40" value="10"></label>
          <p class="res" id="primes"></p>
          <p class="old">終わりのない並び naturals() から filter(素数).take(個数) で取り出す。前は配列にできないので、for と break で書いた。</p>
        </section>
        <section class="card" id="c-sum">
          <h3>Math.sumPrecise <span class="st"></span></h3>
          <label>数（, で区切る） <input id="nums" value="0.1, 0.2, 0.3"></label>
          <dl><dt>reduce で足す</dt><dd id="s1"></dd><dt>sumPrecise</dt><dd id="s2"></dd></dl>
          <p class="old">1e20, 0.1, -1e20 も試してください。前は誤差を自分で補う足し算（Neumaier 法など）を書いた。</p>
        </section>
        <section class="card" id="c-esc">
          <h3>RegExp.escape <span class="st"></span></h3>
          <label>探す文字 <input id="q" value="1+1=2?"></label>
          <p class="res" id="hit"></p>
          <p class="res small" id="pat"></p>
          <p class="old">前は + や ? などの記号の前にバックスラッシュ（＼）を付ける関数を自分で書いた。</p>
        </section>
        <section class="card" id="c-try">
          <h3>Promise.try <span class="st"></span></h3>
          <label>JSON <input id="json" value='{"a": 1,}'></label>
          <p class="res" id="tried"></p>
          <p class="old">JSON.parse の同期の例外も .catch で受け取れる。前は new Promise((ok) =&gt; ok(関数())) と書いた。</p>
        </section>
        <section class="card" id="c-iserr">
          <h3>Error.isError <span class="st"></span></h3>
          <table><thead><tr><th>調べる物</th><th>instanceof</th><th>isError</th></tr></thead><tbody id="errs"></tbody></table>
          <p class="old">instanceof Error は、形だけまねた物にだまされる。前は確実に見分ける方法がなかった。</p>
        </section>
        <section class="card" id="c-f16">
          <h3>Float16Array <span class="st"></span></h3>
          <table><thead><tr><th>入れた数</th><th>Float16Array に入った数</th></tr></thead><tbody id="f16"></tbody></table>
          <p class="old">1 つ 2 バイトで、Float32Array の半分の大きさ。前は Uint16Array に自分でビットを詰めて変換した。</p>
        </section>
      </div>`,
    css: BASE + `
      body { padding: 12px; }
      .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
      .card { padding: 10px 12px; border-radius: 12px; background: var(--card); border: 1px solid var(--line); font-size: 13px; min-width: 0; }
      h3 { margin: 0 0 6px; font: 700 14px ui-monospace, monospace; }
      .st { display: inline-block; margin-left: 4px; padding: 1px 6px; border-radius: 6px; font: 600 11px system-ui, sans-serif; vertical-align: 1px; }
      .st.yes { background: light-dark(#dcfce7, #14462a); color: light-dark(#14532d, #bbf7d0); }
      .st.no { background: light-dark(#fff3d1, #3a311f); color: light-dark(#5c4300, #f2d58c); }
      label { display: flex; gap: 6px; align-items: center; }
      label input { flex: 1; min-width: 0; }
      /* 日本語の書体ではバックスラッシュが ¥ に見えるので、等幅は Consolas などを先に選ぶ */
      .card { --mono: Consolas, "Cascadia Mono", Menlo, ui-monospace, monospace; }
      dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; margin: 6px 0 0; }
      dt { color: var(--mute); } dd { margin: 0; font-family: var(--mono); overflow-wrap: anywhere; }
      .res { margin: 6px 0 0; font-family: var(--mono); overflow-wrap: anywhere; }
      .small { font-size: 12px; color: var(--mute); }
      .old { margin: 6px 0 0; font-size: 12px; color: var(--mute); }
      mark { background: #fde047; color: #1f1d1a; border-radius: 3px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { padding: 2px 4px; border-bottom: 1px solid var(--line); text-align: left; overflow-wrap: anywhere; }
      td + td { font-family: ui-monospace, monospace; }`,
    js() {
      const $ = (id) => document.getElementById(id);
      // 使えるかどうかを札に出す
      const mark = (card, yes) => { const s = document.querySelector(`#${card} .st`); s.textContent = yes ? '使える' : '未対応・前の書き方で計算'; s.className = 'st ' + (yes ? 'yes' : 'no'); };

      // 1. バイト列と Base64・16 進
      const B64 = typeof Uint8Array.fromBase64 === 'function' && typeof Uint8Array.prototype.toBase64 === 'function';
      mark('c-b64', B64);
      function b64() {
        const bytes = new TextEncoder().encode($('b64in').value);
        let s, h, back;
        if (B64) { s = bytes.toBase64(); h = bytes.toHex(); back = new TextDecoder().decode(Uint8Array.fromBase64(s)); }
        else {
          // 前の書き方: 1 バイトを 1 文字にした文字列を、少しずつ作って btoa に渡す
          let bin = '';
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          s = btoa(bin);
          h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
          back = new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
        }
        $('b64').textContent = s; $('hex').textContent = h; $('back').textContent = back;
      }

      // 2. Iterator のメソッド
      const ITER = typeof Iterator !== 'undefined' && typeof Iterator.prototype.take === 'function';
      mark('c-iter', ITER);
      function* naturals() { for (let n = 2; ; n++) yield n; }
      const isPrime = (n) => { for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
      function primes() {
        const k = Math.min(40, Math.max(1, Math.floor(+$('cnt').value) || 1));
        let list;
        if (ITER) list = naturals().filter(isPrime).take(k).toArray();
        else { list = []; for (const n of naturals()) { if (isPrime(n)) list.push(n); if (list.length >= k) break; } }
        $('primes').textContent = list.join(', ');
      }

      // 3. 誤差の出ない合計
      const SUM = typeof Math.sumPrecise === 'function';
      mark('c-sum', SUM);
      // 前の書き方: 足すときに落ちた端数を別に覚えておく（Neumaier 法）
      const neumaier = (xs) => { let s = 0, c = 0; for (const x of xs) { const t = s + x; c += Math.abs(s) >= Math.abs(x) ? (s - t) + x : (x - t) + s; s = t; } return s + c; };
      function sum() {
        const xs = $('nums').value.split(',').filter((t) => t.trim()).map(Number).filter(Number.isFinite);
        $('s1').textContent = String(xs.reduce((a, b) => a + b, 0));
        $('s2').textContent = String(SUM ? Math.sumPrecise(xs) : neumaier(xs)) + (SUM ? '' : '（Neumaier 法）');
      }

      // 4. 記号を文字として探す
      const ESC = typeof RegExp.escape === 'function';
      mark('c-esc', ESC);
      const TEXT = '問題: 1+1=2? 答え: はい、1+1=2 です。11=2 ではありません。';
      function find() {
        const q = $('q').value;
        if (!q) { $('hit').textContent = TEXT; $('pat').textContent = ''; return; }
        const pattern = ESC ? RegExp.escape(q) : q.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        const re = new RegExp(pattern, 'g');
        const parts = [];
        let last = 0, hits = 0;
        for (const m of TEXT.matchAll(re)) {
          parts.push(TEXT.slice(last, m.index), Object.assign(document.createElement('mark'), { textContent: m[0] }));
          last = m.index + m[0].length; hits++;
        }
        parts.push(TEXT.slice(last));
        $('hit').replaceChildren(...parts);
        let raw;
        try {
          const ms = [...TEXT.matchAll(new RegExp(q, 'g'))].map((m) => m[0]).filter(Boolean);
          raw = `${ms.length} 件${ms.length ? `（${ms.join('、')}）` : ''}`;
        } catch { raw = '正規表現として読めないのでエラー'; }
        $('pat').textContent = `作った正規表現: /${pattern}/ で ${hits} 件。そのまま正規表現にすると ${raw}。`;
      }

      // 5. 同期の例外も Promise で受ける
      const TRY = typeof Promise.try === 'function';
      mark('c-try', TRY);
      const attempt = (fn) => (TRY ? Promise.try(fn) : new Promise((ok) => ok(fn())));
      function parse() {
        attempt(() => JSON.parse($('json').value))
          .then((v) => { $('tried').textContent = '読めました: ' + JSON.stringify(v); })
          .catch((e) => { $('tried').textContent = '.catch で受け取りました: ' + e.name + ': ' + e.message; });
      }

      // 6. 本物のエラーかを見分ける
      const ISERR = typeof Error.isError === 'function';
      mark('c-iserr', ISERR);
      const CASES = [
        ['new Error()', new Error('本物')],
        ['new DOMException()', new DOMException('本物', 'AbortError')],
        ['Error をまねた物', Object.create(Error.prototype)],
        ['名札だけ Error', { name: 'Error', message: '偽物', [Symbol.toStringTag]: 'Error' }],
      ];
      $('errs').replaceChildren(...CASES.map(([label, v]) => {
        const tr = document.createElement('tr');
        for (const t of [label, v instanceof Error ? '○' : '×', ISERR ? (Error.isError(v) ? '○' : '×') : '未対応']) tr.append(Object.assign(document.createElement('td'), { textContent: t }));
        return tr;
      }));

      // 7. 2 バイトの小数
      const F16 = typeof Float16Array === 'function';
      mark('c-f16', F16);
      // 前の書き方の代わり: 半精度（仮数 10 ビット）に丸める
      const f16 = (x) => {
        if (!Number.isFinite(x) || x === 0) return x;
        const a = Math.abs(x);
        if (a >= 65520) return Math.sign(x) * Infinity;
        const q = 2 ** (Math.max(Math.floor(Math.log2(a)), -14) - 10);
        return Math.sign(x) * Math.round(a / q) * q;
      };
      const VALUES = [0.1, 1 / 3, 1000.5, 2049, 65504, 70000];
      const stored = F16 ? [...new Float16Array(VALUES)] : VALUES.map(f16);
      $('f16').replaceChildren(...VALUES.map((v, i) => {
        const tr = document.createElement('tr');
        tr.append(Object.assign(document.createElement('td'), { textContent: i === 1 ? '1 / 3' : String(v) }), Object.assign(document.createElement('td'), { textContent: String(stored[i]) }));
        return tr;
      }));

      $('b64in').addEventListener('input', b64);
      $('cnt').addEventListener('input', primes);
      $('nums').addEventListener('input', sum);
      $('q').addEventListener('input', find);
      $('json').addEventListener('input', parse);
      b64(); primes(); sum(); find(); parse();
    },
  });
})();
