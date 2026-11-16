/* スクロール
 * スクロール駆動アニメーション（animation-timeline）は、使えないブラウザでは JS で同じ見た目にする */
dekiru.add({
  id: 'sc-progress-bar', c: 'scroll', lv: 1,
  t: '読んだ量を示すバー', y: 'よんだりょうをしめすばー',
  tags: ['スクロール駆動アニメーション', 'animation-timeline', '読書進捗', 'scroll()'],
  d: '画面上端の細い帯が、ページをどこまで読んだかに合わせて伸びる。animation-timeline: scroll() を使うと、JS を書かずにスクロール量をアニメーションの進み具合として使える。',
  html: `<div class="bar" id="bar"></div><article id="art"></article>`,
  css: `
    body { background: #fbf8f1; }
    .bar { position: fixed; top: 0; left: 0; right: 0; height: 6px; background: #e0532f; transform-origin: 0 50%; scale: var(--p, 0) 1; z-index: 1; }
    @supports (animation-timeline: scroll()) { .bar { animation: grow linear both; animation-timeline: scroll(root); } }
    @keyframes grow { from { scale: 0 1; } to { scale: 1 1; } }
    article { max-width: 36em; margin: 0 auto; padding: 30px 16px; line-height: 2; }`,
  js() {
    document.getElementById('art').innerHTML = Array.from({ length: 14 }, (_, i) => `<h2>第${i + 1}節</h2><p>スクロールすると上の帯が伸びます。これはスクロール量そのものをアニメーションの時計にしているからです。読み進めるほど帯は右へ伸び、最後まで読むと画面の端に届きます。</p>`).join('');
    if (!CSS.supports('animation-timeline', 'scroll()')) {
      const bar = document.getElementById('bar'), de = document.documentElement;
      addEventListener('scroll', () => bar.style.setProperty('--p', scrollY / (de.scrollHeight - innerHeight)), { passive: true });
    }
    if (window.THUMB) setInterval(() => { scrollTo(0, scrollY + 6 >= document.documentElement.scrollHeight - innerHeight ? 0 : scrollY + 6); }, 16);
  },
}, {
  id: 'sc-reveal', c: 'scroll', lv: 2,
  t: '画面に入ると現れる', y: 'がめんにはいるとあらわれる',
  tags: ['view-timeline', 'IntersectionObserver', 'フェードイン', 'スクロール駆動アニメーション'],
  d: '項目が画面の下から入ってくるにつれて、薄い状態から浮かび上がる。view() タイムラインで「その要素が画面のどこにいるか」を進み具合にする。使えないときは IntersectionObserver でクラスを付ける。',
  html: `<div class="list" id="l"></div>`,
  css: `
    body { background: #10141c; color: #fff; }
    .list { display: grid; gap: 40px; padding: 60vh 16px 40vh; max-width: 520px; margin: 0 auto; }
    .item { padding: 24px; border-radius: 16px; background: linear-gradient(135deg, hsl(var(--h) 60% 45%), hsl(calc(var(--h) + 50) 60% 35%)); font: 700 20px sans-serif; }
    @supports (animation-timeline: view()) {
      @media (prefers-reduced-motion: no-preference) {
        .item { animation: rise linear both; animation-timeline: view(); animation-range: entry 0% cover 35%; }
      }
    }
    @keyframes rise { from { opacity: 0; translate: 0 60px; scale: .9; } }
    .js .item { opacity: 0; translate: 0 60px; transition: opacity .6s, translate .6s; }
    .js .item.in { opacity: 1; translate: 0 0; }`,
  js() {
    const l = document.getElementById('l');
    l.innerHTML = Array.from({ length: 12 }, (_, i) => `<div class="item" style="--h:${i * 30}">${i + 1}. 下から浮かび上がる項目</div>`).join('');
    if (!CSS.supports('animation-timeline', 'view()')) {
      document.body.classList.add('js');
      const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.2 });
      l.querySelectorAll('.item').forEach((it) => io.observe(it));
    }
    if (window.THUMB) setInterval(() => { scrollTo(0, scrollY + 5 >= document.documentElement.scrollHeight - innerHeight ? 0 : scrollY + 5); }, 16);
  },
}, {
  id: 'sc-parallax', c: 'scroll', lv: 2,
  t: '奥行きのあるスクロール', y: 'おくゆきのあるすくろーる',
  tags: ['パララックス', '視差', 'スクロール', 'translate'],
  d: 'スクロールしたとき、遠くの山ほどゆっくり、手前の木ほど速く動かす。動く速さの違いで、平らな画面に奥行きが生まれる。',
  html: `<div class="scene"><div class="l sky"></div><div class="l far" data-k=".2"></div><div class="l mid" data-k=".45"></div><div class="l near" data-k=".8"></div><h1 class="title" data-k="-.3">奥行き</h1></div><div class="tall"></div>`,
  css: `
    body { background: #2b1e3c; }
    .scene { position: fixed; inset: 0; overflow: hidden; }
    .l { position: absolute; left: -5%; right: -5%; }
    .sky { inset: 0; background: linear-gradient(#ffb88c, #de6262 50%, #2b1e3c); }
    .far { bottom: -30%; height: 70%; background: #8a4f7d; clip-path: polygon(0 40%, 15% 15%, 30% 35%, 48% 5%, 65% 30%, 82% 10%, 100% 30%, 100% 100%, 0 100%); }
    .mid { bottom: -40%; height: 70%; background: #5a2e5b; clip-path: polygon(0 30%, 20% 50%, 35% 20%, 55% 45%, 75% 15%, 100% 40%, 100% 100%, 0 100%); }
    .near { bottom: -60%; height: 80%; background: #24142c; clip-path: polygon(0 20%, 8% 5%, 16% 20%, 24% 0, 34% 25%, 46% 8%, 58% 30%, 70% 5%, 82% 25%, 92% 10%, 100% 20%, 100% 100%, 0 100%); }
    .title { position: absolute; left: 0; right: 0; top: 25%; text-align: center; margin: 0; font: 900 14vmin serif; color: #fff; text-shadow: 0 4px 20px #0006; }
    .tall { height: 300vh; }`,
  js() {
    const layers = [...document.querySelectorAll('[data-k]')];
    const move = () => { for (const l of layers) l.style.translate = `0 ${-scrollY * l.dataset.k}px`; };
    addEventListener('scroll', move, { passive: true });
    move();
    if (window.THUMB) { let d = 4; setInterval(() => { if (scrollY > innerHeight * 1.2) d = -4; if (scrollY <= 0) d = 4; scrollBy(0, d); }, 16); }
  },
}, {
  id: 'sc-snap-pages', c: 'scroll', lv: 1,
  t: '1枚ずつ止まるスクロール', y: 'いちまいずつとまるすくろーる',
  tags: ['scroll-snap', '全画面', 'スライド', 'CSSだけ'],
  d: 'scroll-snap-type: y mandatory を付けた箱の中で、各区画に scroll-snap-align: start を付ける。どれだけ勢いよくスクロールしても、区画の頭でぴたりと止まる。',
  html: `<main id="m"><section style="--c:#e0532f">壱</section><section style="--c:#f0a43a">弐</section><section style="--c:#2f855a">参</section><section style="--c:#26407c">肆</section><section style="--c:#7a5cff">伍</section></main>`,
  css: `
    main { height: 100%; overflow-y: auto; scroll-snap-type: y mandatory; }
    section { height: 100%; scroll-snap-align: start; display: grid; place-items: center; background: var(--c); color: #fff; font: 900 30vmin/1 serif; }`,
  js() {
    if (window.THUMB) { const m = document.getElementById('m'); let i = 0; setInterval(() => { i = (i + 1) % 5; m.scrollTo({ top: i * m.clientHeight, behavior: 'smooth' }); }, 1200); }
  },
}, {
  id: 'sc-horizontal', c: 'scroll', lv: 3,
  t: '縦に回すと横へ進む', y: 'たてにまわすとよこへすすむ',
  tags: ['position: sticky', '横スクロール', 'スクロール量', '展示'],
  d: '高い箱の中に画面ぴったりの区画を sticky で貼り付け、縦にスクロールした割合だけ中の帯を横へずらす。ホイールを縦に回すと、展示室を横に歩いていくように進む。',
  html: `<div class="tall" id="tall"><div class="stick"><div class="track" id="tr"></div></div></div>`,
  css: `
    body { background: #121212; }
    .tall { height: 500vh; }
    .stick { position: sticky; top: 0; height: 100vh; overflow: hidden; display: flex; align-items: center; }
    .track { display: flex; gap: 4vw; padding: 0 10vw; will-change: transform; }
    .track div { flex: none; width: 60vw; height: 60vh; border-radius: 20px; display: grid; place-items: center; font: 900 12vmin serif; color: #fff; background: linear-gradient(135deg, hsl(var(--h) 70% 55%), hsl(calc(var(--h) + 60) 70% 35%)); }`,
  js() {
    const tr = document.getElementById('tr'), tall = document.getElementById('tall');
    tr.innerHTML = ['一', '二', '三', '四', '五', '六'].map((t, i) => `<div style="--h:${i * 55}">第${t}室</div>`).join('');
    const move = () => { const k = Math.min(1, Math.max(0, scrollY / (tall.offsetHeight - innerHeight))); tr.style.transform = `translateX(${-k * (tr.scrollWidth - innerWidth)}px)`; };
    addEventListener('scroll', move, { passive: true });
    addEventListener('resize', move);
    move();
    if (window.THUMB) setInterval(() => { scrollTo(0, scrollY + 12 >= tall.offsetHeight - innerHeight ? 0 : scrollY + 12); }, 16);
  },
}, {
  id: 'sc-shrink-header', c: 'scroll', lv: 2,
  t: 'スクロールで縮む見出し帯', y: 'すくろーるでちぢむみだしおび',
  tags: ['ヘッダー', 'スクロール駆動アニメーション', 'sticky', '影'],
  d: '最初は大きな見出し帯が、下へスクロールすると細く縮み、影が付いて本文の上に浮く。スクロール量の最初の 200px だけを animation-range に使う。',
  html: `<header class="hd"><h1>出来る新聞</h1></header><main id="m"></main>`,
  css: `
    body { background: #f5f1e8; }
    .hd { position: sticky; top: 0; z-index: 1; height: var(--h, 160px); display: grid; place-items: center; background: #26407c; color: #fff; box-shadow: 0 0 0 #0000; }
    .hd h1 { margin: 0; font: 900 calc(var(--h, 160px) * .32) serif; }
    @supports (animation-timeline: scroll()) {
      .hd { animation: shrink linear both; animation-timeline: scroll(root); animation-range: 0 200px; }
      @keyframes shrink { to { --h: 56px; box-shadow: 0 4px 12px #0004; } }
    }
    @property --h { syntax: "<length>"; inherits: true; initial-value: 160px; }
    main { max-width: 36em; margin: 0 auto; padding: 16px; line-height: 2; }`,
  js() {
    document.getElementById('m').innerHTML = Array.from({ length: 20 }, (_, i) => `<p>${i + 1}. 下へスクロールすると、上の見出し帯が縮んで影が付きます。見出しの文字の大きさも帯の高さに合わせて小さくなります。</p>`).join('');
    if (!CSS.supports('animation-timeline', 'scroll()')) {
      const hd = document.querySelector('.hd');
      addEventListener('scroll', () => { const k = Math.min(1, scrollY / 200); hd.style.setProperty('--h', 160 - k * 104 + 'px'); hd.style.boxShadow = `0 4px 12px rgba(0,0,0,${k * 0.25})`; }, { passive: true });
    }
    if (window.THUMB) setInterval(() => { scrollTo(0, scrollY > 400 ? 0 : scrollY + 4); }, 16);
  },
}, {
  id: 'sc-scrollspy', c: 'scroll', lv: 2,
  t: '目次に今いる場所を示す', y: 'もくじにいまいるばしょをしめす',
  tags: ['スクロールスパイ', 'IntersectionObserver', '目次', 'aria-current'],
  d: '本文の見出しが画面の上の方に入ったら、横の目次の対応する項目に印を付ける。目次を押すとその見出しまで滑らかに移動する。',
  html: `<div class="wrap"><nav id="toc"></nav><main id="main"></main></div>`,
  css: `
    .wrap { display: grid; grid-template-columns: 150px 1fr; height: 100%; }
    nav { padding: 12px; background: #f3efe6; display: grid; align-content: start; gap: 2px; }
    nav a { padding: 6px 10px; border-radius: 8px; color: #555; text-decoration: none; font-size: 14px; border-left: 3px solid transparent; }
    nav a[aria-current] { background: #fff; color: #c23b22; border-left-color: #c23b22; font-weight: 700; }
    main { overflow-y: auto; padding: 0 20px; scroll-behavior: smooth; }
    section { min-height: 70vh; padding-top: 10px; }
    h2 { font: 800 24px serif; }`,
  js() {
    const names = ['はじめに', '道具', '作り方', '使い方', 'おわりに'];
    const main = document.getElementById('main'), toc = document.getElementById('toc');
    main.innerHTML = names.map((n, i) => `<section id="s${i}"><h2>${n}</h2><p>「${n}」の本文です。スクロールすると左の目次の印が動きます。</p></section>`).join('');
    toc.innerHTML = names.map((n, i) => `<a href="#s${i}">${n}</a>`).join('');
    toc.addEventListener('click', (e) => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); document.querySelector(a.getAttribute('href')).scrollIntoView(); });
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) toc.querySelectorAll('a').forEach((a) => (a.getAttribute('href') === '#' + e.target.id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    }, { root: main, rootMargin: '0px 0px -70% 0px' });
    main.querySelectorAll('section').forEach((s) => io.observe(s));
    if (window.THUMB) setInterval(() => { main.scrollTop = main.scrollTop + 6 >= main.scrollHeight - main.clientHeight ? 0 : main.scrollTop + 6; }, 16);
  },
}, {
  id: 'sc-scroll-shadow', c: 'scroll', lv: 2,
  t: '続きがあることを示す影', y: 'つづきがあることをしめすかげ',
  tags: ['スクロール影', 'background-attachment', 'CSSだけ', 'ヒント'],
  d: 'スクロールできる箱の上下に、まだ続きがあるときだけ影が出る。背景を「中身と一緒に動く覆い」と「箱に固定の影」の2層にする昔からの技で、JS はいらない。',
  p: 'background-attachment: local の層は中身と一緒にスクロールし、scroll の層は箱に貼り付く。端に着くと覆いが影を隠す。',
  html: `<ul class="box"></ul>`,
  css: `
    body { display: grid; place-items: center; background: #eceff3; }
    .box {
      width: min(320px, 90vw); height: 60vh; overflow: auto; margin: 0; padding: 0 14px; list-style: none; border-radius: 12px;
      background:
        linear-gradient(#fff 30%, #fff0) center top / 100% 40px no-repeat local,
        linear-gradient(#fff0, #fff 70%) center bottom / 100% 40px no-repeat local,
        radial-gradient(farthest-side at 50% 0, #0003, #0000) center top / 100% 14px no-repeat scroll,
        radial-gradient(farthest-side at 50% 100%, #0003, #0000) center bottom / 100% 14px no-repeat scroll,
        #fff;
    }
    li { padding: 12px 0; border-bottom: 1px solid #f0f0f0; }`,
  js() {
    const box = document.querySelector('.box');
    box.innerHTML = Array.from({ length: 30 }, (_, i) => `<li>${i + 1} 番目の項目</li>`).join('');
    if (window.THUMB) setInterval(() => { box.scrollTop = box.scrollTop + 3 >= box.scrollHeight - box.clientHeight ? 0 : box.scrollTop + 3; }, 16);
  },
}, {
  id: 'sc-scrollytelling', c: 'scroll', lv: 3,
  t: 'スクロールで進む図解', y: 'すくろーるですすむずかい',
  tags: ['スクロリーテリング', 'sticky', 'IntersectionObserver', '図解'],
  d: '左に図を貼り付けたまま、右の文章を読み進めると段落ごとに図が変わる。段落が画面の真ん中に来たかどうかを IntersectionObserver で見張っている。',
  html: `<div class="wrap"><div class="fig"><div class="shape" id="sh"></div><p id="cap"></p></div><div class="steps" id="st"></div></div>`,
  css: `
    .wrap { display: grid; grid-template-columns: 1fr 1fr; }
    .fig { position: sticky; top: 0; height: 100vh; display: grid; place-content: center; justify-items: center; gap: 12px; background: #0f1a2b; color: #fff; }
    .shape { width: 30vmin; aspect-ratio: 1; background: #e0532f; transition: all .7s cubic-bezier(.3, 1.3, .5, 1); }
    .steps { padding: 40vh 16px; display: grid; gap: 60vh; }
    .steps p { margin: 0; padding: 16px; background: #fff; border-radius: 12px; box-shadow: 0 2px 10px #0002; opacity: .35; transition: opacity .3s; }
    .steps p.on { opacity: 1; }`,
  js() {
    const steps = [['四角から始めます', { borderRadius: '0', background: '#e0532f', rotate: '0deg', scale: '1' }], ['角を丸めると円になります', { borderRadius: '50%', background: '#f0a43a', rotate: '0deg', scale: '1' }], ['回して色を変えます', { borderRadius: '30%', background: '#2f855a', rotate: '45deg', scale: '1' }], ['大きくします', { borderRadius: '50% 0', background: '#7a5cff', rotate: '180deg', scale: '1.4' }], ['最後はまた四角へ', { borderRadius: '0', background: '#3fb7e8', rotate: '360deg', scale: '.8' }]];
    const st = document.getElementById('st'), sh = document.getElementById('sh');
    st.innerHTML = steps.map(([t], i) => `<p data-i="${i}">${i + 1}. ${t}</p>`).join('');
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting) return; const i = +e.target.dataset.i; st.querySelectorAll('p').forEach((p) => p.classList.toggle('on', p === e.target)); Object.assign(sh.style, steps[i][1]); document.getElementById('cap').textContent = steps[i][0]; }), { rootMargin: '-45% 0px -45% 0px' });
    st.querySelectorAll('p').forEach((p) => io.observe(p));
    if (window.THUMB) setInterval(() => { scrollTo(0, scrollY + 8 >= document.documentElement.scrollHeight - innerHeight ? 0 : scrollY + 8); }, 16);
  },
}, {
  id: 'sc-back-to-top', c: 'scroll', lv: 1,
  t: '先頭へ戻るボタン', y: 'せんとうへもどるぼたん',
  tags: ['スクロール', 'scrollTo', 'prefers-reduced-motion', 'ボタン'],
  d: '少し下までスクロールすると右下にボタンが現れ、押すとページの先頭へ戻る。動きを減らす設定の人には、滑らかに流さず一瞬で戻す。',
  html: `<main id="m" tabindex="-1"></main><button id="top" class="top" aria-label="先頭へ戻る" hidden>↑</button>`,
  css: `
    main { max-width: 36em; margin: 0 auto; padding: 16px; line-height: 2; }
    .top { position: fixed; right: 16px; bottom: 16px; width: 52px; height: 52px; border-radius: 50%; border: 0; background: #26407c; color: #fff; font-size: 22px; box-shadow: 0 6px 16px #0004; transition: opacity .3s, translate .3s; }
    .top[hidden] { display: block; opacity: 0; translate: 0 20px; pointer-events: none; }`,
  js() {
    document.getElementById('m').innerHTML = Array.from({ length: 30 }, (_, i) => `<p>${i + 1}. 下へスクロールすると、右下に先頭へ戻るボタンが現れます。</p>`).join('');
    const b = document.getElementById('top');
    addEventListener('scroll', () => { b.hidden = scrollY < 300; }, { passive: true });
    b.onclick = () => { scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); document.getElementById('m').focus({ preventScroll: true }); };
    if (window.THUMB) { let d = 8; setInterval(() => { if (scrollY > 800) { b.click(); } else scrollBy(0, d); }, 16); }
  },
}, {
  id: 'sc-zoom-in', c: 'scroll', lv: 2,
  t: 'スクロールで広がる窓', y: 'すくろーるでひろがるまど',
  tags: ['スクロール駆動アニメーション', 'clip-path', '拡大', 'view()'],
  d: '小さな丸い窓が、スクロールに合わせて画面いっぱいまで広がり、向こうの景色が見えてくる。窓は clip-path の円の大きさを変えて表している。',
  html: `<div class="space"></div><section class="reveal" id="r"><div class="view"><h2>窓の向こう</h2></div></section><div class="space"></div>`,
  css: `
    body { background: #0e0e12; }
    .space { height: 80vh; display: grid; place-items: center; color: #555; }
    .reveal { height: 220vh; }
    .view { position: sticky; top: 0; height: 100vh; display: grid; place-items: center; clip-path: circle(var(--r, 10%) at 50% 50%);
      background: radial-gradient(circle at 50% 120%, #ffd56b, #ff7e5f 40%, #3b3f7a 80%); }
    .view h2 { margin: 0; font: 900 12vmin serif; color: #fff; }
    @property --r { syntax: "<percentage>"; inherits: false; initial-value: 10%; }
    @supports (animation-timeline: view()) {
      .view { animation: open linear both; animation-timeline: view(block); }
      .reveal { view-timeline: --rv block; } .view { animation-timeline: --rv; animation-range: contain 0% contain 60%; }
      @keyframes open { to { --r: 75%; } }
    }`,
  js() {
    document.querySelectorAll('.space')[0].textContent = '↓ スクロール';
    if (!CSS.supports('animation-timeline', 'view()')) {
      const r = document.getElementById('r'), v = r.firstElementChild;
      addEventListener('scroll', () => { const box = r.getBoundingClientRect(); const k = Math.min(1, Math.max(0, -box.top / (box.height - innerHeight) / 0.6)); v.style.setProperty('--r', 10 + k * 65 + '%'); }, { passive: true });
    }
    if (window.THUMB) setInterval(() => { scrollTo(0, scrollY + 10 >= document.documentElement.scrollHeight - innerHeight ? 0 : scrollY + 10); }, 16);
  },
});
