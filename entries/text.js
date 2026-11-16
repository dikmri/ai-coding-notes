/* 文字・組版 */
dekiru.add({
  id: 'tx-gradient-text', c: 'text', lv: 1,
  t: 'グラデーションの文字', y: 'ぐらでーしょんのもじ',
  tags: ['background-clip', 'グラデーション', '見出し', 'アニメーション'],
  d: '背景にグラデーションを敷き、background-clip: text で文字の形に切り抜く。文字色を透明にすると、文字の中だけに色の帯が流れる。',
  html: `<h1>彩りの文字</h1><p>background-clip: text</p>`,
  css: `
    body { display: grid; place-content: center; text-align: center; background: #12121a; color: #888; }
    h1 {
      margin: 0; font: 900 16vmin/1.1 serif;
      background: linear-gradient(90deg, #ff5e7e, #ffcf5c, #5ce1e6, #9b7bff, #ff5e7e) 0 0 / 200% 100%;
      -webkit-background-clip: text; background-clip: text; color: transparent;
      animation: flow 4s linear infinite;
    }
    p { font: 2.6vmin ui-monospace, monospace; }
    @keyframes flow { to { background-position: -200% 0; } }`,
}, {
  id: 'tx-extruded-shadow', c: 'text', lv: 1,
  t: '立体に見える文字', y: 'りったいにみえるもじ',
  tags: ['text-shadow', '立体', '影', 'レトロ'],
  d: 'text-shadow を1ピクセルずつずらして十数枚重ねると、文字に厚みができる。最後にぼかした影を足すと、浮き上がって見える。',
  html: `<h1>POP</h1><h2>立体文字</h2>`,
  css: `
    body { display: grid; place-content: center; text-align: center; background: #ffd23f; }
    h1, h2 { margin: 0; color: #fff; font-family: "Arial Black", sans-serif; }
    h1 { font-size: 26vmin; line-height: 1; text-shadow: 1px 1px #e0532f, 2px 2px #e0532f, 3px 3px #e0532f, 4px 4px #e0532f, 5px 5px #e0532f, 6px 6px #e0532f, 7px 7px #e0532f, 8px 8px #e0532f, 9px 9px #c43f1d, 10px 10px #c43f1d, 11px 11px #c43f1d, 12px 12px #c43f1d, 16px 18px 20px #0005; }
    h2 { font: 900 8vmin serif; color: #26407c; text-shadow: 1px 1px #fff, 2px 2px #fff, 3px 3px #fff, 4px 4px #fff, 6px 6px 0 #26407c55; }`,
}, {
  id: 'tx-vertical', c: 'text', lv: 2,
  t: '縦書きの紙面', y: 'たてがきのしめん',
  tags: ['縦書き', 'writing-mode', '縦中横', '傍点'],
  d: 'writing-mode: vertical-rl で日本語を縦に組む。数字の「20」を1文字分に収める縦中横、ふりがな（ルビ）、傍点（圏点）、罫線まで CSS だけで再現する。',
  p: 'text-combine-upright: all で、縦書きの中の短い数字や英字を横向きのまま1マスに収められる。',
  html: `
    <article class="tate">
      <h1>縦書きの<ruby>頁<rt>ページ</rt></ruby></h1>
      <p>日本語の文章は、ブラウザでもこのように縦に組めます。<span class="tcy">20</span>26年<span class="tcy">11</span>月の今では、どの主要なブラウザでも同じように表示されます。</p>
      <p><ruby>傍点<rt>ぼうてん</rt></ruby>は<em class="dot">このように</em>打てます。英語の HTML という語は、横に寝かせて置かれます。</p>
      <p>段落の頭の字下げや、句読点のぶら下がりも、ふつうの CSS の書き方で決められます。</p>
    </article>`,
  css: `
    body { display: grid; place-items: center; background: #e9e2d0; }
    .tate {
      writing-mode: vertical-rl; height: 82vh; max-width: 94vw; overflow-x: auto; padding: 4vmin;
      font: 2.6vh/2 "Hiragino Mincho ProN", "Yu Mincho", serif; letter-spacing: .05em;
      background: repeating-linear-gradient(to left, #fffdf6 0 calc(2em * 1 - 1px), #e6c9b8 calc(2em - 1px) 2em) , #fffdf6;
      box-shadow: 0 1vmin 3vmin #0002; border-radius: 4px;
    }
    h1 { font-size: 1.6em; margin: 0 0 0 1em; }
    p { margin: 0; text-indent: 1em; }
    .tcy { text-combine-upright: all; }
    .dot { font-style: normal; text-emphasis: filled sesame #c23b22; }
    rt { font-size: .5em; }`,
}, {
  id: 'tx-ruby-toggle', c: 'text', lv: 1,
  t: 'ふりがなの出し入れ', y: 'ふりがなのだしいれ',
  tags: ['ルビ', 'ruby', 'ふりがな', '学習'],
  d: 'ruby と rt 要素で漢字にふりがなを付け、チェックボックスでまとめて表示・非表示を切り替える。ふりがなを下に付けることもできる。',
  html: `
    <div class="ctl"><label><input type="checkbox" id="on" checked> ふりがな</label><label><input type="checkbox" id="under"> 下に付ける</label></div>
    <p class="txt" id="txt"><ruby>春<rt>はる</rt></ruby>は<ruby>曙<rt>あけぼの</rt></ruby>。<ruby>漸<rt>やうや</rt></ruby>う<ruby>白<rt>しろ</rt></ruby>くなりゆく<ruby>山際<rt>やまぎは</rt></ruby>、<ruby>少<rt>すこ</rt></ruby>し<ruby>明<rt>あか</rt></ruby>りて、<ruby>紫<rt>むらさき</rt></ruby>だちたる<ruby>雲<rt>くも</rt></ruby>の<ruby>細<rt>ほそ</rt></ruby>くたなびきたる。</p>
    <p class="src">（清少納言『枕草子』より）</p>`,
  css: `
    body { display: grid; place-content: center; gap: 2vmin; padding: 4vmin; background: #fbf7ee; }
    .ctl { display: flex; gap: 1.5em; font-size: 14px; }
    .txt { font: 4.6vmin/2.4 "Hiragino Mincho ProN", "Yu Mincho", serif; margin: 0; max-width: 34em; }
    rt { color: #c23b22; font-size: .5em; }
    .txt.off rt { visibility: hidden; }
    .txt.under ruby { ruby-position: under; }
    .src { color: #888; font-size: 12px; margin: 0; }`,
  js() {
    const t = document.getElementById('txt');
    document.getElementById('on').onchange = (e) => t.classList.toggle('off', !e.target.checked);
    document.getElementById('under').onchange = (e) => t.classList.toggle('under', e.target.checked);
  },
}, {
  id: 'tx-scramble', c: 'text', lv: 2,
  t: '解読されて現れる文字', y: 'かいどくされてあらわれるもじ',
  tags: ['文字化け', 'ランダム', '登場演出', 'requestAnimationFrame'],
  d: 'でたらめな記号がぱらぱら入れ替わったあと、左から1文字ずつ正しい文字に落ち着いていく。暗号が解ける演出。',
  html: `<h1 id="h" aria-live="polite"></h1>`,
  css: `body { display: grid; place-items: center; background: #0d1117; } h1 { margin: 0; font: 700 7vmin ui-monospace, Consolas, monospace; color: #7ee787; letter-spacing: .05em; } h1 span { color: #3f8f4f; }`,
  js() {
    const h = document.getElementById('h');
    const pool = '!<>-_\\/[]{}=+*^?#ｱｲｳｴｵｶｷｸｹｺ01';
    const words = ['ACCESS GRANTED', '出来る！図鑑', 'HELLO, BROWSER', 'ライブラリ不要'];
    let wi = 0;
    function play(target) {
      const start = performance.now(), len = [...target].length;
      (function frame(now) {
        const done = Math.floor((now - start) / 60);
        let html = '';
        [...target].forEach((ch, i) => { html += i < done ? ch : `<span>${pool[Math.floor(Math.random() * pool.length)]}</span>`; });
        h.innerHTML = html;
        if (done < len) requestAnimationFrame(frame);
        else setTimeout(() => play(words[++wi % words.length]), 1800);
      })(start);
    }
    play(words[0]);
  },
}, {
  id: 'tx-bounce-letters', c: 'text', lv: 1,
  t: '1文字ずつ跳ねる', y: 'いちもじずつはねる',
  tags: ['文字分割', 'animation-delay', 'CSS変数', '見出し'],
  d: '文字を1文字ずつ span で包み、それぞれに番号を CSS 変数で渡す。番号に比例して動き出しを遅らせると、波のように順に跳ねる。',
  html: `<h1 id="h" aria-label="ようこそ出来る図鑑へ">ようこそ出来る図鑑へ</h1>`,
  css: `
    body { display: grid; place-items: center; background: #fdf0d5; }
    h1 { margin: 0; font: 900 9vmin serif; color: #c23b22; }
    h1 span { display: inline-block; animation: hop 1.6s ease-in-out infinite; animation-delay: calc(var(--i) * .08s); }
    @keyframes hop { 0%, 40%, 100% { translate: 0 0; } 20% { translate: 0 -.4em; color: #26407c; } }`,
  js() {
    const h = document.getElementById('h');
    const chars = [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(h.textContent)].map((s) => s.segment);
    h.textContent = '';
    chars.forEach((ch, i) => { const s = document.createElement('span'); s.textContent = ch; s.setAttribute('aria-hidden', 'true'); s.style.setProperty('--i', i); h.append(s); });
  },
}, {
  id: 'tx-countup', c: 'text', lv: 1,
  t: '数字のカウントアップ', y: 'すうじのかうんとあっぷ',
  tags: ['数字', 'Intl.NumberFormat', 'イージング', '実績'],
  d: '0 から目標の数まで、最初は速く最後はゆっくり数を増やす。桁区切りや通貨記号は Intl.NumberFormat に任せるので、国ごとの書き方にも対応できる。',
  html: `
    <div class="stats">
      <div><b data-to="1234567">0</b><span>利用者</span></div>
      <div><b data-to="98.6" data-fmt="pct">0</b><span>満足度</span></div>
      <div><b data-to="4800000" data-fmt="yen">0</b><span>売上</span></div>
    </div>
    <button id="again">もう一度</button>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 4vmin; background: #102a43; color: #fff; } .stats { display: flex; gap: 6vmin; flex-wrap: wrap; justify-content: center; } .stats div { display: grid; text-align: center; } b { font: 800 8vmin/1.2 ui-monospace, monospace; color: #ffd166; font-variant-numeric: tabular-nums; } span { font-size: 3vmin; opacity: .7; }`,
  js() {
    const fmt = { def: new Intl.NumberFormat('ja-JP'), pct: new Intl.NumberFormat('ja-JP', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }), yen: new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }) };
    function run() {
      for (const el of document.querySelectorAll('[data-to]')) {
        const to = +el.dataset.to, f = fmt[el.dataset.fmt || 'def'], t0 = performance.now(), dur = 1800;
        (function tick(now) {
          const k = Math.min(1, (now - t0) / dur), v = to * (1 - (1 - k) ** 4);
          el.textContent = f.format(el.dataset.fmt === 'pct' ? v / 100 : Math.round(v));
          if (k < 1) requestAnimationFrame(tick);
        })(t0);
      }
    }
    document.getElementById('again').onclick = run;
    run();
    if (window.THUMB) setInterval(run, 3000);
  },
}, {
  id: 'tx-marker', c: 'text', lv: 1,
  t: '蛍光ペンを引く', y: 'けいこうぺんをひく',
  tags: ['マーカー', 'background-size', '強調', 'IntersectionObserver'],
  d: '文字の下半分に色の帯を背景として敷き、帯の幅を 0% から 100% まで広げる。画面に入ったときに引かれるので、読み進めるとペンが走る。',
  html: `<p>大事なのは<mark>小さく作ってつなぐこと</mark>です。道具は<mark>ブラウザに最初から入っている</mark>ものだけ。<mark>ライブラリは使いません</mark>。</p><button id="re">引き直す</button>`,
  css: `
    body { display: grid; place-content: center; justify-items: start; gap: 3vmin; padding: 6vmin; background: #fff; }
    p { font: 600 5vmin/2 sans-serif; margin: 0; max-width: 22em; }
    mark { color: inherit; background: linear-gradient(transparent 55%, #ffe066 55%) no-repeat 0 0 / 0% 100%; transition: background-size 1s ease-out; }
    mark.on { background-size: 100% 100%; }
    mark:nth-of-type(2) { transition-delay: .6s; } mark:nth-of-type(3) { transition-delay: 1.2s; }`,
  js() {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('on', e.isIntersecting)));
    document.querySelectorAll('mark').forEach((m) => io.observe(m));
    const re = () => { document.querySelectorAll('mark').forEach((m) => m.classList.remove('on')); setTimeout(() => document.querySelectorAll('mark').forEach((m) => m.classList.add('on')), 300); };
    document.getElementById('re').onclick = re;
    if (window.THUMB) setInterval(re, 3200);
  },
}, {
  id: 'tx-outline-text', c: 'text', lv: 1,
  t: '袋文字と二重の縁取り', y: 'ふくろもじとにじゅうのふちどり',
  tags: ['text-stroke', 'paint-order', '縁取り', '看板'],
  d: '-webkit-text-stroke で文字の縁を描く。paint-order: stroke を付けると縁が文字の外側だけに付き、太くしても字がつぶれない。さらに影を重ねて二重の縁取りにする。',
  html: `<h1 class="a">袋文字</h1><h1 class="b">縁取り</h1><h1 class="c">OUTLINE</h1>`,
  css: `
    body { display: grid; place-content: center; text-align: center; gap: 1vmin; background: #3fb7e8; }
    h1 { margin: 0; font: 900 13vmin/1.1 sans-serif; }
    .a { color: #fff; -webkit-text-stroke: 1.6vmin #e0532f; paint-order: stroke fill; }
    .b { color: #ffd23f; -webkit-text-stroke: 1.2vmin #26407c; paint-order: stroke fill; text-shadow: 0 0 0 #fff, .8vmin .8vmin 0 #fff, 1.4vmin 1.4vmin 0 #26407c; }
    .c { color: transparent; -webkit-text-stroke: .4vmin #fff; letter-spacing: .05em; }`,
}, {
  id: 'tx-wave-text', c: 'text', lv: 1,
  t: '波打つ文字', y: 'なみうつもじ',
  tags: ['文字分割', 'sin', '波', 'requestAnimationFrame'],
  d: '1文字ずつの縦位置と回転を、時刻と文字の番号を入れた sin で決める。毎フレーム計算し直すと、文字の列がうねり続ける。',
  html: `<h1 id="h">なみなみとゆれる文字の列</h1>`,
  css: `body { display: grid; place-items: center; background: linear-gradient(#0f2b4c, #1f6fb2); overflow: hidden; } h1 { margin: 0; font: 800 7vmin serif; color: #e6f4ff; white-space: nowrap; } h1 span { display: inline-block; }`,
  js() {
    const h = document.getElementById('h');
    const spans = [...h.textContent].map((ch) => { const s = document.createElement('span'); s.textContent = ch; return s; });
    h.replaceChildren(...spans);
    h.setAttribute('aria-label', spans.map((s) => s.textContent).join(''));
    (function loop(t) {
      spans.forEach((s, i) => { const k = Math.sin(t / 300 + i * 0.5); s.style.transform = `translateY(${k * 0.35}em) rotate(${k * 10}deg)`; s.style.color = `hsl(${190 + k * 30} 90% ${75 + k * 15}%)`; });
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'tx-segmenter', c: 'text', lv: 2,
  t: '日本語を単語に分ける', y: 'にほんごをたんごにわける',
  tags: ['Intl.Segmenter', '分かち書き', '形態素', '文字数'],
  d: 'Intl.Segmenter に日本語の文を渡すと、単語・文字・文のどれの単位でも区切ってくれる。辞書もライブラリも用意せずに分かち書きができる。',
  p: '絵文字や「が」に濁点を後付けした文字も、grapheme（書記素）単位なら1文字として数えられる。',
  html: `
    <textarea id="t" rows="3" aria-label="分けたい文">すもももももももものうち。東京特許許可局で、新しい図鑑を作りました。</textarea>
    <div class="tabs"><label><input type="radio" name="g" value="word" checked> 単語</label><label><input type="radio" name="g" value="grapheme"> 文字</label><label><input type="radio" name="g" value="sentence"> 文</label></div>
    <div id="out" class="out"></div><p id="n"></p>`,
  css: `body { display: grid; align-content: center; gap: 10px; padding: 16px; background: #f6f3ec; } textarea { width: 100%; font-size: 16px; } .tabs { display: flex; gap: 14px; font-size: 14px; } .out { display: flex; flex-wrap: wrap; gap: 6px; } .out span { padding: 3px 9px; border-radius: 6px; background: #fff; box-shadow: 0 1px 3px #0002; font-size: 18px; } .out span.w { background: #ffe8b0; } p { margin: 0; color: #666; font-size: 13px; }`,
  js() {
    const t = document.getElementById('t'), out = document.getElementById('out');
    function run() {
      const g = document.querySelector('[name=g]:checked').value;
      const segs = [...new Intl.Segmenter('ja', { granularity: g }).segment(t.value)];
      out.replaceChildren(...segs.filter((s) => s.segment.trim()).map((s) => { const e = document.createElement('span'); e.textContent = s.segment; if (s.isWordLike) e.className = 'w'; return e; }));
      document.getElementById('n').textContent = `${segs.filter((s) => s.segment.trim()).length} 個に分かれました（色付きは単語らしいもの）`;
    }
    t.addEventListener('input', run);
    document.querySelectorAll('[name=g]').forEach((r) => r.addEventListener('change', run));
    run();
  },
}, {
  id: 'tx-intl-showcase', c: 'text', lv: 2,
  t: '和暦と世界の書き方', y: 'われきとせかいのかきかた',
  tags: ['Intl', '和暦', '国際化', '日付'],
  d: '同じ日時・数・一覧を、和暦・タイの仏暦・アラビア語・中国の旧暦など、国ごとの書き方で並べる。「3日前」のような相対表現や国名の日本語表記も Intl が作ってくれる。',
  html: `<table id="tb"></table>`,
  css: `body { padding: 12px; background: #fbfaf6; font-size: 14px; } table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e3ddd0; } th { color: #777; font-weight: 600; white-space: nowrap; width: 9em; } td { font-size: 15px; }`,
  js() {
    const tb = document.getElementById('tb');
    function render() {
      const d = new Date();
      const rows = [
        ['日本（和暦）', new Intl.DateTimeFormat('ja-JP-u-ca-japanese', { dateStyle: 'full', timeStyle: 'medium' }).format(d)],
        ['日本（西暦）', new Intl.DateTimeFormat('ja-JP', { dateStyle: 'full', timeStyle: 'medium' }).format(d)],
        ['アメリカ', new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'medium' }).format(d)],
        ['ドイツ', new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeStyle: 'medium' }).format(d)],
        ['タイ（仏暦）', new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { dateStyle: 'full' }).format(d)],
        ['エジプト', new Intl.DateTimeFormat('ar-EG', { dateStyle: 'full' }).format(d)],
        ['中国（旧暦）', new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { dateStyle: 'long' }).format(d)],
        ['相対の時間', [-3, -1, 0, 2].map((n) => new Intl.RelativeTimeFormat('ja', { numeric: 'auto' }).format(n, 'day')).join(' ・ ')],
        ['お金', [['ja-JP', 'JPY'], ['en-US', 'USD'], ['de-DE', 'EUR'], ['en-IN', 'INR']].map(([l, c]) => new Intl.NumberFormat(l, { style: 'currency', currency: c }).format(1234567.89)).join(' ・ ')],
        ['大きな数', new Intl.NumberFormat('ja-JP', { notation: 'compact' }).format(123456789) + ' ・ ' + new Intl.NumberFormat('en', { notation: 'compact' }).format(123456789)],
        ['一覧', new Intl.ListFormat('ja', { type: 'conjunction' }).format(['りんご', 'みかん', 'ぶどう']) + ' ・ ' + new Intl.ListFormat('en', { type: 'disjunction' }).format(['tea', 'coffee', 'milk'])],
        ['国名', ['US', 'FR', 'BR', 'EG', 'KR'].map((r) => new Intl.DisplayNames('ja', { type: 'region' }).of(r)).join('、')],
        ['言語名', ['en', 'de', 'ar', 'hi'].map((l) => new Intl.DisplayNames('ja', { type: 'language' }).of(l)).join('、')],
      ];
      tb.innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
    }
    render();
    setInterval(render, 1000);
  },
}, {
  id: 'tx-kansuji', c: 'text', lv: 2,
  t: '数を漢数字・大字で書く', y: 'かずをかんすうじだいじでかく',
  tags: ['漢数字', '大字', '変換', '和文'],
  d: '入力した数を「千二百三十四万五千六百七十八」のような漢数字と、小切手や証書に使う「壱萬弐阡…」の大字に直す。4桁ごとに万・億・兆を付けるのが組み立ての要。',
  html: `<label>数 <input id="n" type="number" value="12345678" min="0" step="1"></label><dl><dt>漢数字</dt><dd id="a"></dd><dt>大字</dt><dd id="b"></dd><dt>位取り</dt><dd id="c"></dd></dl>`,
  css: `body { display: grid; place-content: center; gap: 10px; padding: 16px; background: #fbf6ea; } input { font-size: 18px; width: 14em; } dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; align-items: baseline; } dt { color: #888; font-size: 13px; } dd { margin: 0; font: 700 5vmin/1.4 serif; color: #2b2118; word-break: break-all; }`,
  js() {
    const SMALL = ['', '十', '百', '千'], BIG = ['', '万', '億', '兆', '京'];
    function conv(n, digits, small, big, oneOmit) {
      if (n === 0n) return digits[0];
      let out = '', k = 0;
      while (n > 0n && k < big.length) {
        const part = Number(n % 10000n);
        if (part) {
          let s = '';
          for (let i = 3; i >= 0; i--) { const d = Math.floor(part / 10 ** i) % 10; if (d) s += (oneOmit && d === 1 && i > 0 ? '' : digits[d]) + small[i]; }
          out = s + big[k] + out;
        }
        n /= 10000n; k++;
      }
      return out;
    }
    function render() {
      let n;
      try { n = BigInt(document.getElementById('n').value || '0'); } catch { return; }
      if (n < 0n) n = -n;
      document.getElementById('a').textContent = conv(n, '〇一二三四五六七八九', SMALL, BIG, true);
      document.getElementById('b').textContent = conv(n, '零壱弐参肆伍陸漆捌玖', ['', '拾', '佰', '阡'], ['', '萬', '億', '兆', '京'], false);
      document.getElementById('c').textContent = n.toString().replace(/\B(?=(\d{4})+(?!\d))/g, ' ') + '（4桁区切り）';
    }
    document.getElementById('n').addEventListener('input', render);
    render();
  },
}, {
  id: 'tx-fit-text', c: 'text', lv: 2,
  t: '枠いっぱいに広がる文字', y: 'わくいっぱいにひろがるもじ',
  tags: ['コンテナクエリ', 'cqi', '見出し', 'レスポンシブ'],
  d: '箱をコンテナとして登録し、文字の大きさを「箱の幅の何%」（cqi 単位）で決める。右下をつまんで箱の大きさを変えると、文字が常に幅いっぱいに収まる。',
  p: 'vw は画面の幅、cqi はいちばん近いコンテナの幅が基準。部品ごとに大きさを合わせられる。',
  html: `<div class="box"><p class="fit">出来る！</p><p class="sub">右下の角をつまんで大きさを変えてください</p></div>`,
  css: `
    body { display: grid; place-items: center; background: #e9eef6; }
    .box { container-type: inline-size; width: 60vw; height: 50vh; resize: both; overflow: hidden; min-width: 120px; max-width: 96vw; border: 2px dashed #26407c; border-radius: 10px; background: #fff; display: grid; place-content: center; text-align: center; }
    .fit { margin: 0; font: 900 25cqi/1 serif; color: #c23b22; }
    .sub { margin: 0; font-size: max(10px, 3cqi); color: #666; }`,
  js() {
    if (window.THUMB) { const b = document.querySelector('.box'); let t = 0; setInterval(() => { t += 0.05; b.style.width = 40 + Math.sin(t) * 25 + 'vw'; }, 30); }
  },
}, {
  id: 'tx-circle-text', c: 'text', lv: 2,
  t: '円に沿って回る文字', y: 'えんにそってまわるもじ',
  tags: ['円', '回転', '文字分割', 'transform-origin'],
  d: '文字を1つずつ、円の中心を軸にして少しずつ角度をずらして置く。全体を回すと、スタンプやバッジのような回転する文字の輪になる。',
  html: `<div class="badge"><div class="ring" id="ring"></div><b>出</b></div>`,
  css: `
    body { display: grid; place-items: center; background: #fdf1e3; }
    .badge { position: relative; width: 60vmin; aspect-ratio: 1; display: grid; place-items: center; }
    .ring { position: absolute; inset: 0; animation: spin 14s linear infinite; }
    .ring span { position: absolute; left: 50%; top: 0; height: 50%; translate: -50% 0; transform-origin: 50% 100%; font: 700 4.6vmin serif; color: #2b2118; }
    b { width: 34vmin; aspect-ratio: 1; border-radius: 50%; background: #c23b22; color: #fff; display: grid; place-items: center; font: 900 20vmin/1 serif; }
    @keyframes spin { to { rotate: 1turn; } }`,
  js() {
    const text = 'ライブラリなし・フレームワークなし・ビルドなし・';
    const ring = document.getElementById('ring');
    const chars = [...text];
    ring.setAttribute('aria-label', text);
    chars.forEach((ch, i) => { const s = document.createElement('span'); s.textContent = ch; s.setAttribute('aria-hidden', 'true'); s.style.rotate = (360 / chars.length) * i + 'deg'; ring.append(s); });
  },
}, {
  id: 'tx-highlight-api', c: 'text', lv: 3,
  t: 'DOMを変えずに文字を強調する', y: 'どむをかえずにもじをきょうちょうする',
  tags: ['CSS Custom Highlight API', '検索', 'Range', '強調'],
  d: '検索語に一致する場所を Range（文書中の範囲）として集め、CSS.highlights に登録すると ::highlight() で色を塗れる。本文の HTML には一切手を加えない。',
  p: '使えないブラウザでは、本文を mark 要素で包み直す昔ながらの方法に切り替える。',
  html: `
    <label>探す <input id="q" value="ブラウザ"></label> <span id="n"></span>
    <article id="art">
      <p>ブラウザは文書を表示するだけの道具ではありません。ブラウザの中には、絵を描く道具、音を鳴らす道具、計算を速くする道具まで揃っています。</p>
      <p>この図鑑では、そうしたブラウザの道具だけを使って、どこまで出来るかを試しています。検索語を変えると、強調する場所もすぐに変わります。</p>
    </article>`,
  css: `body { padding: 16px; background: #fff; line-height: 1.9; } input { font-size: 16px; } article { max-width: 40em; font-size: 16px; } ::highlight(hit) { background: #ffe066; color: #000; } mark { background: #ffe066; }`,
  js() {
    const art = document.getElementById('art'), q = document.getElementById('q'), original = art.innerHTML;
    function run() {
      const word = q.value.trim();
      let count = 0;
      if (window.CSS && CSS.highlights) {
        const ranges = [];
        if (word) {
          const walker = document.createTreeWalker(art, NodeFilter.SHOW_TEXT);
          for (let node; (node = walker.nextNode());) {
            let at = 0;
            while ((at = node.data.indexOf(word, at)) >= 0) { const r = new Range(); r.setStart(node, at); r.setEnd(node, at + word.length); ranges.push(r); at += word.length; }
          }
        }
        CSS.highlights.set('hit', new Highlight(...ranges));
        count = ranges.length;
      } else {
        art.innerHTML = original;
        if (word) for (const p of art.querySelectorAll('p')) { const parts = p.textContent.split(word); count += parts.length - 1; p.replaceChildren(...parts.flatMap((s, i) => (i ? [Object.assign(document.createElement('mark'), { textContent: word }), s] : [s]))); }
      }
      document.getElementById('n').textContent = `${count} 件`;
    }
    q.addEventListener('input', run);
    run();
  },
}, {
  id: 'tx-text-wrap-balance', c: 'text', lv: 1,
  t: '見出しの折り返しをそろえる', y: 'みだしのおりかえしをそろえる',
  tags: ['text-wrap', 'balance', 'pretty', '見出し'],
  d: '長い見出しが2行になるとき、普通は1行目がいっぱいで2行目が短く残る。text-wrap: balance を付けると、各行の長さがそろうように折り返す。幅を変えて見比べられる。',
  html: `
    <label>幅 <input type="range" id="w" min="180" max="600" value="340"></label>
    <div class="cols" id="cols">
      <section><small>ふつう</small><h2>素の HTML と CSS と JavaScript だけで作る小さな見本の図鑑</h2></section>
      <section><small>text-wrap: balance</small><h2 class="bal">素の HTML と CSS と JavaScript だけで作る小さな見本の図鑑</h2></section>
    </div>`,
  css: `body { padding: 14px; background: #f6f4ef; } .cols { display: flex; flex-wrap: wrap; gap: 16px; } section { width: var(--w, 340px); background: #fff; padding: 10px 14px; border-radius: 8px; box-shadow: 0 1px 4px #0001; } small { color: #c23b22; font-family: ui-monospace, monospace; } h2 { font: 800 22px/1.4 serif; margin: 4px 0 0; } .bal { text-wrap: balance; }`,
  js() {
    const w = document.getElementById('w'), cols = document.getElementById('cols');
    const set = () => cols.style.setProperty('--w', w.value + 'px');
    w.addEventListener('input', set);
    set();
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.04; w.value = 260 + Math.sin(t) * 80; set(); }, 30); }
  },
}, {
  id: 'tx-line-clamp', c: 'text', lv: 1,
  t: '3行で省略して続きを開く', y: 'さんぎょうでしょうりゃくしてつづきをひらく',
  tags: ['line-clamp', '省略', '続きを読む', '三点リーダー'],
  d: '長い文章を3行で切り、最後に「…」を付ける。ボタンを押すと全文を表示する。行数での省略は CSS の line-clamp だけで書ける。',
  html: `
    <article>
      <p id="p" class="clamp">ブラウザには、文字を表示するだけでなく、絵を描き、音を鳴らし、動画を撮り、計算をし、データを保存する力が最初から備わっています。この図鑑はそうした力を一つずつ取り出し、小さな見本として並べたものです。見本はどれも数十行ほどで、組み合わせればもっと大きなものも作れます。気になった見本は、コードを書き換えて自分好みに改造してみてください。</p>
      <button id="b" aria-expanded="false" aria-controls="p">続きを読む</button>
    </article>`,
  css: `body { display: grid; place-items: center; background: #eef2f5; } article { width: min(480px, 90vw); background: #fff; padding: 18px; border-radius: 12px; box-shadow: 0 2px 10px #0001; } p { margin: 0 0 10px; line-height: 1.8; } .clamp { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; }`,
  js() {
    const p = document.getElementById('p'), b = document.getElementById('b');
    b.onclick = () => { const open = p.classList.toggle('clamp') === false; b.setAttribute('aria-expanded', open); b.textContent = open ? 'たたむ' : '続きを読む'; };
    if (window.THUMB) setInterval(() => b.click(), 1500);
  },
}, {
  id: 'tx-drop-cap', c: 'text', lv: 1,
  t: '段落の最初の大きな文字', y: 'だんらくのさいしょのおおきなもじ',
  tags: ['initial-letter', '::first-letter', '雑誌風', '組版'],
  d: '雑誌の記事のように、段落の最初の1文字だけを数行ぶんの高さに大きくする。initial-letter が使えるブラウザではそれを、使えないブラウザでは float で代わりに組む。',
  html: `<article><p>むかしむかし、ある所に、素の道具だけで何でも作ってしまう職人がいました。職人の道具箱には、文字を並べる道具、色を塗る道具、物を動かす道具の三つだけ。それでも、頼まれた物はたいてい作ってしまうのでした。</p></article>`,
  css: `
    body { display: grid; place-items: center; background: #f7f1e3; }
    article { width: min(520px, 90vw); font: 17px/1.9 serif; color: #2b2118; }
    p::first-letter { float: left; font-size: 3.6em; line-height: 1; margin: .05em .12em 0 0; color: #c23b22; font-weight: 900; }
    @supports (initial-letter: 3) {
      p::first-letter { float: none; font-size: inherit; margin: 0 .12em 0 0; initial-letter: 3; }
    }`,
}, {
  id: 'tx-shape-outside', c: 'text', lv: 2,
  t: '図形に沿って回り込む文章', y: 'ずけいにそってまわりこむぶんしょう',
  tags: ['shape-outside', '回り込み', 'float', '雑誌風'],
  d: '丸い絵を float で置き、shape-outside: circle() で回り込みの形も丸にする。文章が四角ではなく円の縁に沿って流れる。',
  html: `<article><div class="moon" role="img" aria-label="月"></div><p>夜空に浮かぶ月のまわりを、文章が回り込んで流れていきます。ふつうの回り込みは四角い箱に沿いますが、shape-outside を使うと円や多角形、画像の不透明な部分の形にまで沿わせられます。雑誌のような紙面も、HTML と CSS だけで組めるというわけです。月の大きさを変えれば、回り込み方もそれに合わせて変わります。文章を長くすると、円の下でまた全幅に戻ります。</p></article>`,
  css: `
    body { display: grid; place-items: center; background: #0f1630; color: #e8ecff; }
    article { width: min(560px, 92vw); font: 16px/1.9 serif; }
    .moon { float: left; width: 200px; aspect-ratio: 1; margin-right: 16px; border-radius: 50%; shape-outside: circle(50%); shape-margin: 10px; background: radial-gradient(circle at 35% 35%, #fffbe0, #f2d27a 60%, #c8a24a); box-shadow: 0 0 40px #f2d27a66; }`,
}, {
  id: 'tx-emphasis', c: 'text', lv: 1,
  t: '傍点・波線・下線の飾り', y: 'ぼうてんなみせんかせんのかざり',
  tags: ['text-emphasis', 'text-decoration', '強調', '下線'],
  d: '圏点（傍点）の種類、波線や二重線の下線、線の太さや文字からの距離。強調の飾りの多くは CSS のプロパティで細かく決められる。',
  html: `
    <ul>
      <li><span style="text-emphasis: filled sesame">胡麻の傍点</span></li>
      <li><span style="text-emphasis: filled circle #c23b22">黒丸の圏点</span></li>
      <li><span style="text-emphasis: open triangle #26407c">白三角の圏点</span></li>
      <li><span style="text-decoration: underline wavy #e0532f 2px; text-underline-offset: .3em">波線の下線</span></li>
      <li><span style="text-decoration: underline double #2f855a">二重の下線</span></li>
      <li><span style="text-decoration: line-through 3px #c23b22">太い取り消し線</span></li>
      <li><span style="text-decoration: underline dotted 4px #7a5cff; text-underline-offset: .4em">点線を離して</span></li>
    </ul>`,
  css: `body { display: grid; place-items: center; background: #fbf8f1; } ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 1.6vmin; font: 600 4.4vmin/2.2 serif; }`,
}, {
  id: 'tx-counter-style', c: 'text', lv: 2,
  t: '箇条書きの番号いろいろ', y: 'かじょうがきのばんごういろいろ',
  tags: ['list-style-type', '@counter-style', 'いろは', '漢数字'],
  d: '箇条書きの番号は、漢数字・いろは・ひらがな・大字・ローマ数字などから選べる。@counter-style を使えば十干十二支のような自前の番号も作れる。',
  html: `<div class="grid" id="g"></div>`,
  css: `
    @counter-style eto { system: cyclic; symbols: "子" "丑" "寅" "卯" "辰" "巳" "午" "未" "申" "酉" "戌" "亥"; suffix: "　"; }
    @counter-style maru { system: fixed; symbols: "①" "②" "③" "④" "⑤" "⑥" "⑦" "⑧" "⑨" "⑩"; suffix: " "; }
    body { padding: 10px; background: #f8f5ee; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    section { background: #fff; border-radius: 8px; padding: 6px 10px; box-shadow: 0 1px 3px #0001; }
    h3 { margin: 0; font: 11px ui-monospace, monospace; color: #c23b22; }
    ol { margin: 4px 0 0; padding-left: 3.2em; font: 14px/1.6 serif; }`,
  js() {
    const types = ['cjk-decimal', 'japanese-informal', 'japanese-formal', 'hiragana', 'hiragana-iroha', 'katakana', 'katakana-iroha', 'upper-roman', 'lower-greek', 'eto', 'maru', 'disclosure-closed'];
    document.getElementById('g').innerHTML = types.map((t) => `<section><h3>${t}</h3><ol style="list-style-type:${t}" start="1"><li>はじめ</li><li>つぎ</li><li>そのつぎ</li><li>おわり</li></ol></section>`).join('');
  },
});
