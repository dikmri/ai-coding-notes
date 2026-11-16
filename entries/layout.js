/* レイアウト */
dekiru.add({
  id: 'ly-holy-grail', c: 'layout', lv: 1,
  t: '聖杯レイアウト', y: 'せいはいれいあうと',
  tags: ['CSS Grid', 'grid-template-areas', 'レスポンシブ', '段組み'],
  d: '見出し・左メニュー・本文・右欄・足元の5区画を、grid-template-areas に文字の地図として書く。幅が狭くなったら地図を書き換えるだけで縦1列に並び直る。',
  p: '区画の名前を文字で並べると、CSS がそのまま配置の見取り図になる。',
  html: `<div class="page"><header>見出し</header><nav>メニュー</nav><main>本文</main><aside>右欄</aside><footer>足元</footer></div>`,
  css: `
    body { padding: 10px; background: #f3f0ea; }
    .page { height: 100%; display: grid; gap: 8px; grid-template: "h h h" 60px "n m a" 1fr "f f f" 50px / 140px 1fr 140px; }
    header { grid-area: h; background: #26407c; } nav { grid-area: n; background: #2f855a; } main { grid-area: m; background: #fff; color: #333 !important; }
    aside { grid-area: a; background: #b7791f; } footer { grid-area: f; background: #555; }
    .page > * { border-radius: 10px; display: grid; place-items: center; color: #fff; font-weight: 700; }
    @media (width < 600px) { .page { grid-template: "h" 50px "n" 50px "m" 1fr "a" 60px "f" 40px / 1fr; } }`,
}, {
  id: 'ly-masonry', c: 'layout', lv: 1,
  t: '石積みレイアウト', y: 'いしづみれいあうと',
  tags: ['columns', '段組み', 'Pinterest風', '高さが違う'],
  d: '高さのばらばらな札を、段組み（columns）で上から詰めていく。すき間なく石垣のように並び、画面の幅に応じて段の数も変わる。',
  html: `<div class="wall" id="w"></div>`,
  css: `body { padding: 10px; background: #efeae0; } .wall { columns: 160px; column-gap: 10px; } .wall div { break-inside: avoid; margin-bottom: 10px; border-radius: 10px; display: grid; place-items: center; font: 800 22px serif; color: #fff; background: hsl(var(--h) 55% 55%); }`,
  js() {
    const w = document.getElementById('w');
    for (let i = 1; i <= 24; i++) { const d = document.createElement('div'); d.textContent = i; d.style.height = 60 + ((i * 53) % 140) + 'px'; d.style.setProperty('--h', (i * 29) % 360); w.append(d); }
  },
}, {
  id: 'ly-container-query', c: 'layout', lv: 2,
  t: '置き場所で形が変わる部品', y: 'おきばしょでかたちがかわるぶひん',
  tags: ['コンテナクエリ', '@container', 'レスポンシブ', '部品'],
  d: '同じ札の部品が、置かれた枠の幅に応じて「縦並び」「横並び」「大きな横長」に形を変える。画面の幅ではなく、部品のいる場所の幅を見て決めるのがコンテナクエリ。',
  html: `
    <div class="frames">
      <div class="slot" style="width:180px"><article class="card"><div class="img"></div><div><h3>出来る札</h3><p>狭い場所では縦に並ぶ</p></div></article></div>
      <div class="slot" style="width:360px"><article class="card"><div class="img"></div><div><h3>出来る札</h3><p>中くらいなら横に並ぶ</p></div></article></div>
      <div class="slot resizable"><article class="card"><div class="img"></div><div><h3>出来る札</h3><p>右下をつまんで幅を変えてください</p></div></article></div>
    </div>`,
  css: `
    body { padding: 10px; background: #eef2f5; }
    .frames { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
    .slot { container-type: inline-size; }
    .resizable { width: 520px; resize: horizontal; overflow: hidden; min-width: 140px; max-width: 95vw; border: 2px dashed #9ab; padding: 4px; }
    .card { display: grid; gap: 10px; padding: 10px; background: #fff; border-radius: 12px; box-shadow: 0 1px 4px #0002; }
    .img { aspect-ratio: 4 / 3; border-radius: 8px; background: linear-gradient(135deg, #f7b267, #f25c54); }
    h3 { margin: 0; font-size: 16px; } p { margin: 4px 0 0; font-size: 13px; color: #555; }
    @container (width > 300px) { .card { grid-template-columns: 120px 1fr; align-items: center; } }
    @container (width > 480px) { .card { grid-template-columns: 200px 1fr; } h3 { font-size: 22px; } }`,
  js() {
    if (window.THUMB) { const r = document.querySelector('.resizable'); let t = 0; setInterval(() => { t += 0.05; r.style.width = 330 + Math.sin(t) * 190 + 'px'; }, 30); }
  },
}, {
  id: 'ly-sticky-index', c: 'layout', lv: 1,
  t: '付いてくる見出し（辞書の柱）', y: 'ついてくるみだしじしょのはしら',
  tags: ['position: sticky', '見出し', '辞書', 'スクロール'],
  d: '「あ行」「か行」の見出しに position: sticky を付けると、その行の項目を読んでいる間は上に貼り付き、次の行が来ると押し出される。辞書の柱と同じ見え方になる。',
  html: `<div class="dict" id="d"></div>`,
  css: `body { background: #fbf8f1; } .dict { height: 100%; overflow-y: auto; } h2 { position: sticky; top: 0; margin: 0; padding: 6px 14px; font: 800 18px serif; color: #fff; background: #c23b22; box-shadow: 0 2px 4px #0002; } ul { margin: 0; padding: 6px 14px 16px 32px; } li { padding: 4px 0; border-bottom: 1px dashed #e2d9c6; font-family: serif; }`,
  js() {
    const data = { あ行: ['あさがお', 'いちょう', 'うめ', 'えのき', 'おおばこ'], か行: ['かえで', 'きく', 'くすのき', 'けやき', 'こぶし'], さ行: ['さくら', 'しだれやなぎ', 'すすき', 'せんだん', 'そてつ'], た行: ['たんぽぽ', 'ちがや', 'つばき', 'てっせん', 'とちのき'], な行: ['なでしこ', 'にれ', 'ぬるで', 'ねむのき', 'のばら'] };
    document.getElementById('d').innerHTML = Object.entries(data).map(([k, list]) => `<section><h2>${k}</h2><ul>${list.concat(list.map((x) => x + 'の仲間')).map((x) => `<li>${x}</li>`).join('')}</ul></section>`).join('');
    if (window.THUMB) { const d = document.getElementById('d'); setInterval(() => { d.scrollTop = d.scrollTop + 2 >= d.scrollHeight - d.clientHeight ? 0 : d.scrollTop + 2; }, 16); }
  },
}, {
  id: 'ly-centering', c: 'layout', lv: 1,
  t: '真ん中に置く7つの方法', y: 'まんなかにおくななつのほうほう',
  tags: ['中央寄せ', 'CSS Grid', 'Flexbox', '位置指定'],
  d: '「箱を真ん中に置く」だけでも書き方はたくさんある。グリッド・フレックス・絶対配置・margin: auto など7通りを並べ、それぞれの1行の決め手を添えた。',
  html: `<div class="g" id="g"></div>`,
  css: `
    body { padding: 10px; background: #f1efe9; }
    .g { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .box { position: relative; height: 120px; background: #fff; border-radius: 10px; box-shadow: inset 0 0 0 1px #0001; }
    .box i { display: block; width: 44px; height: 44px; border-radius: 8px; background: #e0532f; }
    .box code { position: absolute; left: 6px; bottom: 4px; font-size: 10px; color: #555; }
    .m1 { display: grid; place-items: center; }
    .m2 { display: flex; justify-content: center; align-items: center; }
    .m3 i { position: absolute; left: 50%; top: 50%; translate: -50% -50%; }
    .m4 { display: flex; } .m4 i { margin: auto; }
    .m5 i { position: absolute; inset: 0; margin: auto; }
    .m6 { display: grid; } .m6 i { place-self: center; }
    .m7 { display: table-cell; width: 999px; vertical-align: middle; text-align: center; } .m7 i { display: inline-block; }`,
  js() {
    const ways = [['m1', 'place-items: center'], ['m2', 'justify+align: center'], ['m3', 'left/top 50% + translate'], ['m4', 'flex + margin: auto'], ['m5', 'inset: 0 + margin: auto'], ['m6', 'place-self: center'], ['m7', 'table-cell + middle']];
    document.getElementById('g').innerHTML = ways.map(([c, t]) => `<div><div class="box ${c}"><i></i><code>${t}</code></div></div>`).join('');
  },
}, {
  id: 'ly-auto-grid', c: 'layout', lv: 1,
  t: '列の数が自動で変わるグリッド', y: 'れつのかずがじどうでかわるぐりっど',
  tags: ['auto-fill', 'minmax', 'CSS Grid', 'レスポンシブ'],
  d: 'grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)) の1行だけで、幅に合わせて列の数が勝手に増減する。メディアクエリは1つも書かない。',
  html: `<div class="wrap" id="w"><div class="g" id="g"></div></div>`,
  css: `body { padding: 10px; background: #edf1ee; } .wrap { width: 90%; resize: horizontal; overflow: hidden; border: 2px dashed #8ab; padding: 8px; min-width: 140px; max-width: 98vw; } .g { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; } .g div { aspect-ratio: 1; border-radius: 10px; display: grid; place-items: center; font: 800 20px serif; color: #fff; background: hsl(var(--h) 50% 50%); }`,
  js() {
    const g = document.getElementById('g');
    for (let i = 1; i <= 12; i++) { const d = document.createElement('div'); d.textContent = i; d.style.setProperty('--h', i * 30); g.append(d); }
    if (window.THUMB) { const w = document.getElementById('w'); let t = 0; setInterval(() => { t += 0.04; w.style.width = 60 + Math.sin(t) * 35 + '%'; }, 30); }
  },
}, {
  id: 'ly-subgrid', c: 'layout', lv: 2,
  t: '中身の高さがそろうカード', y: 'なかみのたかさがそろうかーど',
  tags: ['subgrid', 'CSS Grid', 'カード', '揃え'],
  d: '横に並べたカードの見出し・本文・ボタンの高さを、カードをまたいでそろえる。カードが親のグリッドの行をそのまま借りる subgrid を使う。',
  p: 'grid-row: span 3 で親の3行ぶんを占め、grid-template-rows: subgrid でその3行を自分の行として使う。',
  html: `
    <div class="cards">
      <article><h3>短い見出し</h3><p>本文が短い。</p><button>詳しく</button></article>
      <article><h3>とても長い見出しが二行に折り返す場合</h3><p>本文がそこそこ長い場合でも、下のボタンの位置はそろう。</p><button>詳しく</button></article>
      <article><h3>中くらいの見出し</h3><p>本文がとても長く、何行にもわたって続いていく。それでも見出しの高さと、ボタンの位置は、となりのカードとぴったりそろったまま。</p><button>詳しく</button></article>
    </div>`,
  css: `
    body { padding: 12px; background: #f4f1ea; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    article { display: grid; grid-row: span 3; grid-template-rows: subgrid; gap: 8px; padding: 12px; background: #fff; border-radius: 12px; box-shadow: 0 1px 4px #0002; }
    h3 { margin: 0; font-size: 16px; background: #fde4dc; padding: 4px; border-radius: 6px; } p { margin: 0; font-size: 13px; } button { align-self: end; }`,
}, {
  id: 'ly-bento', c: 'layout', lv: 1,
  t: '弁当箱のグリッド', y: 'べんとうばこのぐりっど',
  tags: ['CSS Grid', 'span', 'ベントーグリッド', '紹介ページ'],
  d: '大きさの違う区画を、grid-column と grid-row の span で縦横に何マスぶん使うか決めて詰め込む。製品紹介でよく見る弁当箱のような並びになる。',
  html: `<div class="bento"><div class="a">出来る！</div><div class="b">0 個の<br>ライブラリ</div><div class="c">Canvas</div><div class="d">Web Audio</div><div class="e">SVG</div><div class="f">パイプ</div></div>`,
  css: `
    body { padding: 12px; background: #111318; }
    .bento { height: 100%; display: grid; gap: 10px; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(3, 1fr); }
    .bento div { border-radius: 16px; padding: 14px; display: grid; align-items: end; color: #fff; font: 800 clamp(14px, 3vw, 28px)/1.2 sans-serif; }
    .a { grid-column: span 2; grid-row: span 2; background: linear-gradient(135deg, #e0532f, #f0a43a); font-size: clamp(24px, 6vw, 60px) !important; }
    .b { background: #26407c; } .c { background: #2f855a; grid-row: span 2; } .d { background: #7a5cff; }
    .e { grid-column: span 2; background: #333a48; } .f { grid-column: span 2; background: #c23b55; }`,
}, {
  id: 'ly-flex-lab', c: 'layout', lv: 1,
  t: 'Flexboxの実験台', y: 'ふれっくすぼっくすのじっけんだい',
  tags: ['Flexbox', 'justify-content', 'align-items', '実験'],
  d: '並べる向き・折り返し・主軸の寄せ方・交差軸の寄せ方・すき間を選ぶと、その場で箱の並びが変わる。今の指定は CSS として下に表示する。',
  html: `<div class="ctl" id="ctl"></div><div class="stage" id="st"><i>1</i><i style="height:60px">2</i><i>3</i><i style="width:90px">4</i><i>5</i></div><code id="css"></code>`,
  css: `body { padding: 10px; background: #f2f4f7; font-size: 12px; } .ctl { display: flex; flex-wrap: wrap; gap: 6px 12px; } .stage { display: flex; height: 55vh; margin: 8px 0; padding: 8px; background: #fff; border: 2px dashed #b9c3d1; border-radius: 10px; transition: all .3s; } .stage i { display: grid; place-items: center; min-width: 50px; min-height: 40px; border-radius: 8px; background: #26407c; color: #fff; font: 700 16px sans-serif; } code { display: block; white-space: pre; }`,
  js() {
    const props = { 'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'], 'flex-wrap': ['nowrap', 'wrap'], 'justify-content': ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'], 'align-items': ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'], gap: ['0', '8px', '20px'] };
    const ctl = document.getElementById('ctl'), st = document.getElementById('st');
    ctl.innerHTML = Object.entries(props).map(([p, vs]) => `<label>${p} <select data-p="${p}">${vs.map((v) => `<option>${v}</option>`).join('')}</select></label>`).join('');
    const apply = () => { const lines = []; ctl.querySelectorAll('select').forEach((s) => { st.style.setProperty(s.dataset.p, s.value); lines.push(`  ${s.dataset.p}: ${s.value};`); }); document.getElementById('css').textContent = `.stage {\n  display: flex;\n${lines.join('\n')}\n}`; };
    ctl.addEventListener('change', apply);
    apply();
    if (window.THUMB) { const s = ctl.querySelector('[data-p=justify-content]'); setInterval(() => { s.selectedIndex = (s.selectedIndex + 1) % s.options.length; apply(); }, 900); }
  },
}, {
  id: 'ly-grid-lab', c: 'layout', lv: 2,
  t: 'Gridの実験台', y: 'ぐりっどのじっけんだい',
  tags: ['CSS Grid', 'grid-template-columns', 'dense', '実験'],
  d: '列の決め方を文字で入れると、その場で格子が組み変わる。「1fr 2fr」「repeat(4, 1fr)」「100px auto 1fr」などを試せる。大きな札を混ぜ、dense で穴を埋める様子も見られる。',
  html: `<div class="ctl"><label>grid-template-columns <input id="cols" value="repeat(4, 1fr)"></label><label><input type="checkbox" id="dense"> grid-auto-flow: dense</label></div><div class="stage" id="st"></div>`,
  css: `body { padding: 10px; background: #f3f1ec; font-size: 12px; } .ctl { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; } #cols { font: 13px ui-monospace, monospace; width: 18em; } .stage { display: grid; gap: 6px; margin-top: 8px; grid-auto-rows: 50px; } .stage i { display: grid; place-items: center; border-radius: 8px; color: #fff; font: 700 15px sans-serif; background: hsl(var(--h) 55% 50%); } .stage .w { grid-column: span 2; } .stage .t { grid-row: span 2; }`,
  js() {
    const st = document.getElementById('st'), cols = document.getElementById('cols'), dense = document.getElementById('dense');
    for (let i = 1; i <= 14; i++) { const d = document.createElement('i'); d.textContent = i; d.style.setProperty('--h', i * 25); if (i % 5 === 2) d.className = 'w'; if (i % 7 === 3) d.className = 't'; st.append(d); }
    const apply = () => { st.style.gridTemplateColumns = cols.value; st.style.gridAutoFlow = dense.checked ? 'dense' : 'row'; };
    cols.addEventListener('input', apply); dense.addEventListener('change', apply);
    apply();
    if (window.THUMB) { const v = ['repeat(4, 1fr)', '1fr 2fr 1fr', '80px 1fr 1fr 80px 1fr', 'repeat(6, 1fr)']; let i = 0; setInterval(() => { cols.value = v[++i % 4]; dense.checked = i % 2 === 0; apply(); }, 1000); }
  },
}, {
  id: 'ly-has-parent', c: 'layout', lv: 2,
  t: '子の状態で親を変える（:has）', y: 'このじょうたいでおやをかえるはず',
  tags: [':has()', '親セレクタ', 'JSなし', 'カード'],
  d: '中のチェックボックスが選ばれたらカード全体の色を変える。中に画像（ここでは図形）があるカードだけ横並びにする。どちらも :has() だけで書け、JS はいらない。',
  html: `
    <div class="list">
      <label class="card"><input type="checkbox"> <span>図形なしのカード。選ぶと色が変わる。</span></label>
      <label class="card"><input type="checkbox" checked> <span class="pic"></span><span>図形ありのカードは横並びになる。</span></label>
      <label class="card"><input type="checkbox"> <span class="pic"></span><span>これも図形あり。</span></label>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #f0f4f7; }
    .list { display: grid; gap: 10px; width: min(420px, 92vw); }
    .card { display: grid; gap: 8px; padding: 14px; background: #fff; border-radius: 12px; border: 2px solid transparent; cursor: pointer; transition: .2s; }
    .card:has(.pic) { grid-template-columns: auto 60px 1fr; align-items: center; }
    .card:has(input:checked) { border-color: #2f855a; background: #eaf7ef; }
    .pic { width: 60px; aspect-ratio: 1; border-radius: 10px; background: linear-gradient(135deg, #7fd0ff, #26407c); }`,
  js() {
    if (window.THUMB) { const cs = document.querySelectorAll('input'); let i = 0; setInterval(() => { cs[i++ % 3].click(); }, 700); }
  },
}, {
  id: 'ly-fluid-type', c: 'layout', lv: 2,
  t: '幅に合わせてなめらかに変わる文字', y: 'はばにあわせてなめらかにかわるもじ',
  tags: ['clamp()', '流体タイポグラフィ', 'cqi', 'レスポンシブ'],
  d: 'clamp(最小, 好みの値, 最大) で、文字の大きさを枠の幅に比例させつつ、小さくなりすぎず大きくなりすぎないようにする。枠の幅を変えると今の大きさが数値で出る。',
  html: `<div class="box" id="b"><h1 id="h">流れる見出し</h1><p id="o"></p></div>`,
  css: `body { padding: 10px; background: #fbf7ee; } .box { container-type: inline-size; width: 80%; resize: horizontal; overflow: hidden; border: 2px dashed #c9b; padding: 10px; min-width: 120px; max-width: 98vw; } h1 { margin: 0; font: 900 clamp(18px, 8cqi, 72px)/1.2 serif; color: #26407c; } p { margin: 4px 0 0; font: 12px ui-monospace, monospace; color: #666; }`,
  js() {
    const h = document.getElementById('h'), o = document.getElementById('o'), b = document.getElementById('b');
    new ResizeObserver(() => { o.textContent = `枠の幅 ${Math.round(b.clientWidth)}px → 文字 ${getComputedStyle(h).fontSize}（clamp(18px, 8cqi, 72px)）`; }).observe(b);
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.04; b.style.width = 55 + Math.sin(t) * 40 + '%'; }, 30); }
  },
}, {
  id: 'ly-aspect-ratio', c: 'layout', lv: 1,
  t: '縦横比を保つ箱', y: 'たてよこひをたもつはこ',
  tags: ['aspect-ratio', '動画枠', '正方形', '黄金比'],
  d: 'aspect-ratio を指定すると、幅が変わっても縦横の比を保ったまま高さが決まる。動画の 16:9、写真の 4:3、正方形、黄金比を並べた。',
  html: `<div class="row"><div style="aspect-ratio:16/9">16 : 9</div><div style="aspect-ratio:4/3">4 : 3</div><div style="aspect-ratio:1">1 : 1</div><div style="aspect-ratio:1.618">黄金比</div><div style="aspect-ratio:1/1.414">白銀比（紙）</div></div>`,
  css: `body { padding: 12px; background: #eef0f4; } .row { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; align-items: start; } .row div { display: grid; place-items: center; border-radius: 10px; background: linear-gradient(135deg, #5b5bf0, #b44cff); color: #fff; font-weight: 700; }`,
}, {
  id: 'ly-stack-overlap', c: 'layout', lv: 1,
  t: '重ねて置くグリッド', y: 'かさねておくぐりっど',
  tags: ['CSS Grid', 'grid-area', '重ね合わせ', 'ヒーロー'],
  d: '同じ grid-area: 1 / 1 を指定した子どうしは同じマスに重なる。position: absolute を使わずに、背景・暗幕・文字を重ねた大きな見出し画面が作れる。',
  html: `<section class="hero"><div class="bg"></div><div class="veil"></div><div class="txt"><h1>重ねるだけ</h1><p>grid-area: 1 / 1</p></div></section>`,
  css: `
    .hero { height: 100%; display: grid; }
    .hero > * { grid-area: 1 / 1; }
    .bg { background: conic-gradient(from 200deg at 70% 40%, #ffcf5c, #ff5e7e, #7a5cff, #3fb7e8, #ffcf5c); }
    .veil { background: linear-gradient(transparent 30%, #000a); }
    .txt { align-self: end; padding: 6vmin; color: #fff; }
    h1 { margin: 0; font: 900 12vmin/1 serif; } p { margin: .4em 0 0; font: 3vmin ui-monospace, monospace; opacity: .8; }`,
});
