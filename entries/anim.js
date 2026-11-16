/* 動き・アニメーション */
dekiru.add({
  id: 'anim-bounce', c: 'anim', lv: 1,
  t: '弾むボール', y: 'はずむぼーる',
  tags: ['@keyframes', 'イージング', '物理', 'つぶれと伸び'],
  d: '落ちるときは加速、上がるときは減速。床に着いた一瞬だけ横につぶすと、重さのある弾み方に見える。',
  p: '@keyframes の途中ごとに animation-timing-function を変えられる。落下と上昇で速さの変わり方を変えている。',
  html: `<div class="stage"><div class="ball"></div><div class="shadow"></div></div>`,
  css: `
    body { display: grid; place-items: center; background: linear-gradient(#e9f3ff, #fff 70%, #e6dccb 70%); }
    .stage { display: grid; justify-items: center; align-content: end; height: 70vmin; }
    .ball {
      width: 14vmin; aspect-ratio: 1; border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #fff9, #e0532f 40%, #8a2a14);
      transform-origin: 50% 100%;
      animation: bounce 1.1s infinite;
    }
    .shadow { width: 14vmin; height: 3vmin; border-radius: 50%; background: #0004; margin-top: -1vmin; animation: shadow 1.1s infinite; }
    @keyframes bounce {
      0%   { translate: 0 -48vmin; animation-timing-function: cubic-bezier(.55, 0, 1, .45); }
      46%  { translate: 0 0; scale: 1 1; }
      50%  { translate: 0 0; scale: 1.3 .7; animation-timing-function: cubic-bezier(0, .55, .45, 1); }
      56%  { scale: .95 1.08; }
      100% { translate: 0 -48vmin; scale: 1 1; }
    }
    @keyframes shadow {
      0%, 100% { scale: .35; opacity: .3; animation-timing-function: cubic-bezier(.55, 0, 1, .45); }
      50% { scale: 1.1; opacity: 1; animation-timing-function: cubic-bezier(0, .55, .45, 1); }
    }`,
}, {
  id: 'anim-waapi-fling', c: 'anim', lv: 2,
  t: '飛んでいくカード', y: 'とんでいくかーど',
  tags: ['Web Animations', 'element.animate', 'クリック', 'カード'],
  d: 'カードを押すと、でたらめな方向へ回りながら飛んでいき、また元の場所に生えてくる。動きは JS の element.animate で指定する。',
  p: 'animate() は Animation オブジェクトを返す。finished の Promise を待てば「動き終わったら次」を素直に書ける。',
  html: `<p class="hint">カードを押してみてください</p><div class="deck" id="deck"></div>`,
  css: `
    body { display: grid; place-content: center; gap: 3vmin; background: #1d2a1f; color: #e8f0e0; overflow: hidden; }
    .hint { text-align: center; margin: 0; }
    .deck { display: grid; grid-template-columns: repeat(6, 11vmin); gap: 2vmin; }
    .card {
      aspect-ratio: 5 / 7; border: 0; border-radius: 1.4vmin; padding: 0;
      font: 800 5vmin/1 serif; color: var(--c); background: #fffdf5;
      box-shadow: 0 .6vmin 1.4vmin #0006;
    }`,
  js() {
    const deck = document.getElementById('deck');
    const marks = '一二三四五六七八九十百千';
    [...marks].forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.textContent = m;
      b.style.setProperty('--c', i % 2 ? '#c23b22' : '#1f2a44');
      b.addEventListener('click', () => fling(b));
      deck.append(b);
    });
    async function fling(card) {
      if (card.getAnimations().length) return;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.max(innerWidth, innerHeight);
      await card.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) rotate(${(Math.random() - 0.5) * 1440}deg)`, opacity: 0.2 },
      ], { duration: 900, easing: 'cubic-bezier(.3, .1, .6, 1)' }).finished;
      await card.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.15)' }, { transform: 'none' }], { duration: 450, easing: 'ease-out' }).finished;
    }
    if (window.THUMB) setInterval(() => fling(deck.children[Math.floor(Math.random() * deck.children.length)]), 700);
  },
}, {
  id: 'anim-ripple-dots', c: 'anim', lv: 2,
  t: '波打つ点の海', y: 'なみうつてんのうみ',
  tags: ['animation-delay', 'CSS変数', '波紋', 'グリッド'],
  d: '点ごとに「中心からの距離」に比例した遅れをつけると、同じアニメーションが波紋になる。押した点が新しい中心になる。',
  p: '遅れはマイナスの animation-delay にしているので、最初から波の途中の姿で始まる。',
  html: `<div class="g" id="g"></div>`,
  css: `
    body { display: grid; place-items: center; background: #0e1726; overflow: hidden; }
    .g { display: grid; grid-template-columns: repeat(24, 3.4vmin); gap: .6vmin; }
    .g i {
      aspect-ratio: 1; border-radius: 50%; background: #3fb7e8; cursor: pointer;
      animation: wave 2.2s ease-in-out infinite;
      animation-delay: calc(var(--d) * -0.11s);
    }
    @keyframes wave { 50% { scale: .25; background: #ffb454; } }`,
  js() {
    const g = document.getElementById('g');
    const cols = 24, rows = 15;
    const dots = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = document.createElement('i');
      i.addEventListener('click', () => center(x, y));
      g.append(i);
      dots.push([i, x, y]);
    }
    function center(cx, cy) {
      for (const [el, x, y] of dots) el.style.setProperty('--d', Math.hypot(x - cx, y - cy).toFixed(2));
    }
    center(cols / 2, rows / 2);
  },
}, {
  id: 'anim-typewriter', c: 'anim', lv: 1,
  t: 'タイプライター', y: 'たいぷらいたー',
  tags: ['steps()', '文字送り', 'カーソル', '点滅'],
  d: '上は CSS だけ。幅を ch 単位で steps() を使って1文字ずつ広げる。下の日本語は JS で1文字ずつ足しては消す。',
  p: 'steps(21) は動きを21段に区切る。等幅フォントなら1段がちょうど1文字ぶんになる。',
  html: `
    <p class="tw">Hello, vanilla world.</p>
    <p class="jp"><span id="jp"></span><span class="caret">|</span></p>`,
  css: `
    body { display: grid; place-content: center; gap: 4vmin; background: #101418; color: #d8f5c8; }
    .tw {
      font: 6vmin/1.2 ui-monospace, Consolas, monospace; margin: 0;
      width: 21ch; white-space: nowrap; overflow: hidden; border-right: .12em solid;
      animation: type 3s steps(21) infinite alternate, caret .6s step-end infinite;
    }
    @keyframes type { from { width: 0; } }
    @keyframes caret { 50% { border-color: transparent; } }
    .jp { font: 600 5vmin/1.4 sans-serif; color: #ffd27a; margin: 0; min-height: 1.4em; }
    .caret { animation: blink .7s step-end infinite; margin-left: .05em; }
    @keyframes blink { 50% { opacity: 0; } }`,
  js() {
    const el = document.getElementById('jp');
    const lines = ['ライブラリは使いません。', 'ブラウザだけで出来ます。', '小さな部品をつなげよう。'];
    let li = 0, i = 0, del = false;
    (function tick() {
      const s = [...lines[li]];
      if (!del) { i++; if (i > s.length) { del = true; return setTimeout(tick, 1400); } }
      else { i--; if (i === 0) { del = false; li = (li + 1) % lines.length; } }
      el.textContent = s.slice(0, i).join('');
      setTimeout(tick, del ? 40 : 110);
    })();
  },
}, {
  id: 'anim-flip-shuffle', c: 'anim', lv: 3,
  t: '並べ替えを滑らかに（FLIP）', y: 'ならべかえをなめらかにふりっぷ',
  tags: ['FLIP', 'Web Animations', '並べ替え', 'getBoundingClientRect'],
  d: '並べ替える前と後の位置を測り、差のぶんだけ元の位置へ戻してから「何もしない状態」へ動かす。DOM は一瞬で並び替わり、見た目だけが滑らかに移る。',
  p: 'First（最初の位置）・Last（最後の位置）・Invert（逆に戻す）・Play（再生）の頭文字で FLIP と呼ぶ。',
  html: `<div class="bar"><button id="mix">混ぜる</button><button id="sort">番号順</button></div><div class="grid" id="grid"></div>`,
  css: `
    body { display: grid; place-content: center; gap: 3vmin; background: #f6f1e7; }
    .bar { display: flex; gap: 1em; justify-content: center; }
    .grid { display: grid; grid-template-columns: repeat(6, 11vmin); gap: 1.6vmin; }
    .grid div {
      aspect-ratio: 1; border-radius: 1.6vmin; display: grid; place-items: center;
      font: 800 5vmin/1 serif; color: #fff; background: hsl(var(--h) 65% 50%);
      box-shadow: 0 .5vmin 1vmin #0002;
    }`,
  js() {
    const grid = document.getElementById('grid');
    for (let n = 1; n <= 18; n++) {
      const d = document.createElement('div');
      d.textContent = n;
      d.dataset.n = n;
      d.style.setProperty('--h', n * 20);
      grid.append(d);
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function rearrange(order) {
      const items = [...grid.children];
      const first = new Map(items.map((el) => [el, el.getBoundingClientRect()]));
      order(items).forEach((el) => grid.append(el));
      for (const el of items) {
        const a = first.get(el), b = el.getBoundingClientRect();
        const dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: reduce ? 0 : 650, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      }
    }
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    document.getElementById('mix').onclick = () => rearrange(shuffle);
    document.getElementById('sort').onclick = () => rearrange((a) => a.sort((x, y) => x.dataset.n - y.dataset.n));
    if (window.THUMB) setInterval(() => rearrange(shuffle), 1600);
  },
}, {
  id: 'anim-view-transition', c: 'anim', lv: 3,
  t: '画面遷移のつなぎ（View Transitions）', y: 'がめんせんいのつなぎびゅーとらんじしょん',
  tags: ['View Transitions', 'startViewTransition', '画面遷移', '拡大'],
  d: '小さな札を押すと、その札が大きく広がって詳しい画面になる。戻ると元の札へ縮んで帰る。前後の画面を同じ名前で結ぶだけでブラウザが補間する。',
  p: 'view-transition-name が同じ要素どうしが「同じもの」として扱われる。同じ名前は一度に1つだけにする。',
  html: `
    <div class="list" id="list"></div>
    <article class="detail" id="detail" hidden>
      <button id="back">← もどる</button>
      <div class="big" id="big"></div>
      <h2 id="dt" tabindex="-1"></h2>
      <p id="dd"></p>
    </article>`,
  css: `
    body { background: #fbf8f2; padding: 4vmin; }
    .list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3vmin; }
    .list button { aspect-ratio: 4 / 3; border: 0; border-radius: 2vmin; font: 800 9vmin/1 serif; color: #fff; background: var(--c); box-shadow: 0 1vmin 2vmin #0002; }
    .detail { display: grid; gap: 2vmin; }
    .big { height: 45vh; border-radius: 3vmin; background: var(--c); display: grid; place-items: center; font: 800 22vmin/1 serif; color: #fff; }
    h2 { margin: 0; font: 800 6vmin serif; outline: none; }
    ::view-transition-group(*) { animation-duration: .45s; animation-timing-function: cubic-bezier(.2, .8, .2, 1); }
    @media (prefers-reduced-motion: reduce) { ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; } }`,
  js() {
    const data = [['春', '#e88aa8', '桜が咲いて、風がやわらかくなる。'], ['夏', '#2ba3d6', '海と入道雲、長い夕暮れ。'], ['秋', '#d9752f', '紅葉と月見、実りの季節。'],
      ['冬', '#6f86ad', '雪が降り、空気が澄みわたる。'], ['朝', '#e6b23a', '一日のはじまりの光。'], ['夜', '#343a74', '街の灯りと星。']];
    const list = document.getElementById('list'), detail = document.getElementById('detail');
    const big = document.getElementById('big'), dt = document.getElementById('dt'), dd = document.getElementById('dd');
    let current = null;
    const go = (update) => (document.startViewTransition ? document.startViewTransition(update).finished : (update(), Promise.resolve()));
    for (const [k, c, text] of data) {
      const b = document.createElement('button');
      b.textContent = k;
      b.style.setProperty('--c', c);
      b.onclick = () => {
        current = b;
        b.style.viewTransitionName = 'hero';
        go(() => {
          b.style.viewTransitionName = 'none';
          big.style.viewTransitionName = 'hero';
          big.textContent = k; big.style.setProperty('--c', c);
          dt.textContent = k + 'の札'; dd.textContent = text;
          list.hidden = true; detail.hidden = false;
        }).finally(() => dt.focus());
      };
      list.append(b);
    }
    document.getElementById('back').onclick = () => {
      go(() => {
        big.style.viewTransitionName = 'none';
        current.style.viewTransitionName = 'hero';
        detail.hidden = true; list.hidden = false;
      }).finally(() => { current.style.viewTransitionName = 'none'; current.focus(); });
    };
    if (window.THUMB) { let i = 0; setInterval(() => { if (list.hidden) document.getElementById('back').click(); else list.children[i++ % 6].click(); }, 1400); }
  },
}, {
  id: 'anim-spring-chain', c: 'anim', lv: 2,
  t: 'バネでついてくる玉', y: 'ばねでついてくるたま',
  tags: ['バネ', '物理', 'マウス', 'requestAnimationFrame'],
  d: '玉がひとつ前の玉をバネで追いかける。速度に「引っぱる力」を足し、少しずつ減らすだけで、ぷるんとした動きになる。',
  p: '速度 = (速度 + (目標 − 位置) × 硬さ) × 減衰。この1行がバネの正体。',
  html: `<div id="box"></div><p class="hint">マウスを動かしてください</p>`,
  css: `
    body { background: #120f1d; overflow: hidden; cursor: crosshair; }
    .hint { position: fixed; bottom: 2vmin; width: 100%; text-align: center; color: #fff8; margin: 0; }
    .dot { position: fixed; left: 0; top: 0; border-radius: 50%; translate: -50% -50%; pointer-events: none; mix-blend-mode: screen; }`,
  js() {
    const box = document.getElementById('box');
    const N = 16;
    const dots = Array.from({ length: N }, (_, i) => {
      const el = document.createElement('div');
      el.className = 'dot';
      const s = 60 - i * 3;
      el.style.width = el.style.height = s + 'px';
      el.style.background = `hsl(${280 - i * 12} 90% 60%)`;
      box.append(el);
      return { el, x: innerWidth / 2, y: innerHeight / 2, vx: 0, vy: 0 };
    });
    const target = { x: innerWidth / 2, y: innerHeight / 2 };
    let auto = true;
    addEventListener('pointermove', (e) => { auto = false; target.x = e.clientX; target.y = e.clientY; });
    (function loop(t) {
      if (auto) { target.x = innerWidth / 2 + Math.cos(t / 700) * innerWidth * 0.3; target.y = innerHeight / 2 + Math.sin(t / 430) * innerHeight * 0.3; }
      dots.forEach((d, i) => {
        const tx = i ? dots[i - 1].x : target.x, ty = i ? dots[i - 1].y : target.y;
        d.vx = (d.vx + (tx - d.x) * 0.22) * 0.62;
        d.vy = (d.vy + (ty - d.y) * 0.22) * 0.62;
        d.x += d.vx; d.y += d.vy;
        d.el.style.transform = `translate(${d.x}px, ${d.y}px)`;
      });
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'anim-easing-race', c: 'anim', lv: 1,
  t: 'イージング見本帳', y: 'いーじんぐみほんちょう',
  tags: ['イージング', 'cubic-bezier', 'linear()', 'steps()'],
  d: '同じ距離を同じ時間で進むのに、速さの変わり方だけが違う8本の線。linear() を使うと跳ね返りも CSS だけで書ける。',
  p: 'cubic-bezier の値が 0〜1 をはみ出すと、行き過ぎて戻る動きになる。',
  html: `<div class="lanes" id="lanes"></div>`,
  css: `
    body { display: grid; place-items: center; background: #f4f1ea; }
    .lanes { width: 86vw; display: grid; gap: 1.6vmin; }
    .lane { position: relative; height: 6vmin; border-bottom: 1px dashed #0002; }
    .lane code { position: absolute; left: 0; bottom: 100%; font-size: max(10px, 1.8vmin); color: #555; }
    .lane i {
      position: absolute; left: 0; bottom: .6vmin; width: 5vmin; aspect-ratio: 1; border-radius: 50%;
      background: hsl(var(--h) 70% 50%);
      animation: go 2.4s infinite alternate;
      animation-timing-function: var(--e);
    }
    @keyframes go { to { left: calc(100% - 5vmin); } }`,
  js() {
    const easings = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'steps(6)',
      'cubic-bezier(.68, -.6, .32, 1.6)', 'linear(0, .06 8%, .25 17%, .56 26%, 1 35%, .74 44%, .64 49%, .74 55%, 1 63%, .9 71%, 1 79%, .97 86%, 1)'];
    const lanes = document.getElementById('lanes');
    easings.forEach((e, k) => {
      const d = document.createElement('div');
      d.className = 'lane';
      d.innerHTML = `<code></code><i></i>`;
      d.querySelector('code').textContent = e.length > 40 ? 'linear(…)  跳ね返り' : e;
      d.style.setProperty('--e', e);
      d.style.setProperty('--h', k * 45);
      lanes.append(d);
    });
  },
}, {
  id: 'anim-offset-path', c: 'anim', lv: 2,
  t: '線に沿って進む', y: 'せんにそってすすむ',
  tags: ['offset-path', 'offset-distance', '経路', 'SVG'],
  d: 'offset-path に SVG と同じ書式の道を渡すと、要素がその上を進む。offset-rotate: auto で進行方向を向く。',
  html: `
    <div class="track" id="track">
      <svg viewBox="0 0 400 200" aria-hidden="true"><path d="M20,100 C80,0 140,0 200,100 S320,200 380,100"/></svg>
      <i></i><i></i><i></i><i></i>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #0f1c2e; overflow: hidden; }
    .track { position: relative; width: 400px; height: 200px; }
    svg { position: absolute; inset: 0; overflow: visible; }
    path { fill: none; stroke: #ffffff30; stroke-width: 3; stroke-dasharray: 6 8; }
    .track i {
      position: absolute; left: 0; top: 0; width: 26px; height: 18px;
      background: linear-gradient(90deg, #ffcf5c, #ff6a3d);
      clip-path: polygon(0 0, 100% 50%, 0 100%, 25% 50%);
      offset-path: path("M20,100 C80,0 140,0 200,100 S320,200 380,100");
      offset-rotate: auto;
      animation: move 4s cubic-bezier(.45, .05, .55, .95) infinite;
    }
    .track i:nth-of-type(2) { animation-delay: -1s; filter: hue-rotate(60deg); }
    .track i:nth-of-type(3) { animation-delay: -2s; filter: hue-rotate(160deg); }
    .track i:nth-of-type(4) { animation-delay: -3s; filter: hue-rotate(240deg); }
    @keyframes move { from { offset-distance: 0%; } to { offset-distance: 100%; } }`,
  js() {
    const t = document.getElementById('track');
    const fit = () => { t.style.scale = Math.min(innerWidth / 440, innerHeight / 260); };
    fit();
    addEventListener('resize', fit);
  },
}, {
  id: 'anim-marquee', c: 'anim', lv: 1,
  t: '流れる帯', y: 'ながれるおび',
  tags: ['マーキー', '無限スクロール', 'translate', '一時停止'],
  d: '同じ中身を2回並べ、半分の長さだけ横に動かして最初に戻す。つなぎ目が見えないので、帯が終わりなく流れ続ける。',
  p: '5秒より長く自動で動くものには止めるボタンを付ける（WCAG 2.2.2）。',
  html: `
    <button id="pause">止める</button>
    <div class="m"><div class="row">
      <span>HTML</span><span>CSS</span><span>JavaScript</span><span>Canvas</span><span>SVG</span><span>Web Audio</span>
      <span aria-hidden="true">HTML</span><span aria-hidden="true">CSS</span><span aria-hidden="true">JavaScript</span><span aria-hidden="true">Canvas</span><span aria-hidden="true">SVG</span><span aria-hidden="true">Web Audio</span>
    </div></div>
    <div class="m rev"><div class="row">
      <span>描く</span><span>鳴らす</span><span>動かす</span><span>遊ぶ</span><span>計算する</span><span>保存する</span>
      <span aria-hidden="true">描く</span><span aria-hidden="true">鳴らす</span><span aria-hidden="true">動かす</span><span aria-hidden="true">遊ぶ</span><span aria-hidden="true">計算する</span><span aria-hidden="true">保存する</span>
    </div></div>`,
  css: `
    body { display: grid; align-content: center; gap: 3vmin; background: #111; color: #fff; overflow: hidden; }
    #pause { justify-self: center; }
    .m { overflow: hidden; rotate: -3deg; background: #ffcf2e; color: #111; padding: 1.5vmin 0; }
    .m.rev { rotate: 2deg; background: #e0532f; color: #fff; }
    .row { display: flex; width: max-content; animation: slide 14s linear infinite; }
    .rev .row { animation-direction: reverse; animation-duration: 18s; }
    .row span { font: 800 7vmin/1 sans-serif; padding: 0 4vmin; white-space: nowrap; }
    .row span::after { content: "✦"; margin-left: 8vmin; font-size: .6em; vertical-align: middle; }
    .m:hover .row, body.paused .row { animation-play-state: paused; }
    @keyframes slide { to { translate: -50% 0; } }`,
  js() {
    const b = document.getElementById('pause');
    b.onclick = () => { const p = document.body.classList.toggle('paused'); b.textContent = p ? '動かす' : '止める'; };
  },
}, {
  id: 'anim-pendulum-wave', c: 'anim', lv: 2,
  t: '振り子の波', y: 'ふりこのなみ',
  tags: ['振り子', '周期', 'animation-duration', '干渉'],
  d: '少しずつ周期の違う振り子を並べると、ヘビのような波、ばらばら、また一列、と模様が移り変わる。30秒ごとに全員がそろう。',
  p: 'i 番目の振り子は 30 秒で (20 + i) 回振れるように周期を決めている。',
  html: `<div class="row" id="row"></div>`,
  css: `
    body { display: grid; place-items: start center; padding-top: 6vmin; background: #0c0d12; overflow: hidden; }
    .row { display: flex; gap: 1.4vmin; border-top: 3px solid #555; }
    .p {
      width: 3vmin; height: calc(40vmin + var(--i) * 1.6vmin); position: relative; transform-origin: 50% 0;
      animation: swing var(--t) ease-in-out infinite alternate;
      animation-delay: calc(var(--t) * -0.5);
    }
    .p::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 3vmin; border-left: 1px solid #ffffff55; }
    .p::after { content: ""; position: absolute; left: 0; bottom: 0; width: 3vmin; aspect-ratio: 1; border-radius: 50%; background: hsl(calc(var(--i) * 20) 85% 60%); box-shadow: 0 0 2vmin hsl(calc(var(--i) * 20) 85% 60%); }
    @keyframes swing { from { rotate: 28deg; } to { rotate: -28deg; } }`,
  js() {
    const row = document.getElementById('row');
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('div');
      p.className = 'p';
      p.style.setProperty('--i', i);
      p.style.setProperty('--t', (30 / (20 + i) / 2).toFixed(4) + 's');
      row.append(p);
    }
  },
}, {
  id: 'anim-starting-style', c: 'anim', lv: 2,
  t: '現れて消える項目', y: 'あらわれてきえるこうもく',
  tags: ['@starting-style', 'transition', '追加', '削除'],
  d: '@starting-style で「登場前の姿」を書くと、要素を足したときにそこから CSS の transition で現れる。消すときはクラスを付けて動かしてから取り除く。',
  html: `
    <div class="wrap">
      <button id="add">項目を足す</button>
      <ul id="list"></ul>
      <p class="hint">項目を押すと消えます</p>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #eef3ec; }
    .wrap { width: min(420px, 80vw); }
    ul { list-style: none; padding: 0; display: grid; gap: 8px; }
    li {
      padding: 10px 14px; border-radius: 10px; background: #fff; box-shadow: 0 2px 6px #0001; cursor: pointer;
      border-left: 6px solid hsl(var(--h) 60% 50%);
      transition: opacity .4s, translate .4s cubic-bezier(.2, .8, .2, 1);
    }
    @starting-style { li { opacity: 0; translate: -40px 0; } }
    li.out { opacity: 0; translate: 60px 0; }
    .hint { color: #666; font-size: 13px; }`,
  js() {
    const list = document.getElementById('list');
    const words = ['りんご', 'みかん', 'ぶどう', 'もも', 'なし', 'かき', 'いちご', 'すいか'];
    let n = 0;
    function add() {
      const li = document.createElement('li');
      li.textContent = `${++n}. ${words[n % words.length]}`;
      li.style.setProperty('--h', (n * 47) % 360);
      li.onclick = () => remove(li);
      list.prepend(li);
      if (list.children.length > 7) remove(list.lastElementChild);
    }
    function remove(li) {
      if (li.classList.contains('out')) return;
      li.classList.add('out');
      li.addEventListener('transitionend', () => li.remove(), { once: true });
      setTimeout(() => li.remove(), 600);
    }
    document.getElementById('add').onclick = add;
    for (let i = 0; i < 3; i++) add();
    if (window.THUMB) setInterval(add, 900);
  },
}, {
  id: 'anim-hamburger', c: 'anim', lv: 1,
  t: '三本線が×になるボタン', y: 'さんぼんせんがばつになるぼたん',
  tags: ['ハンバーガーメニュー', 'aria-expanded', 'メニュー', 'transition'],
  d: 'メニューボタンの3本の線が、開くと×印に組み変わる。開閉の状態は aria-expanded で持ち、見た目もその属性で切り替える。',
  p: '状態を属性に置くと、読み上げソフトにも「開いている」が伝わり、CSS もその属性だけを見ればよい。',
  html: `
    <button class="burger" id="b" aria-expanded="false" aria-controls="nav" aria-label="メニュー">
      <span></span><span></span><span></span>
    </button>
    <nav id="nav"><a href="#">図鑑</a><a href="#">工房</a><a href="#">索引</a></nav>`,
  css: `
    body { display: grid; place-items: center; background: #f2ede3; overflow: hidden; }
    .burger { position: relative; z-index: 2; width: 16vmin; aspect-ratio: 1; border-radius: 50%; border: 0; background: #1f2a44; display: grid; place-content: center; gap: 1.6vmin; }
    .burger span { display: block; width: 7vmin; height: 1vmin; border-radius: 1vmin; background: #fff; transition: translate .3s, rotate .3s, opacity .2s; }
    [aria-expanded="true"] span:nth-child(1) { translate: 0 2.6vmin; rotate: 45deg; }
    [aria-expanded="true"] span:nth-child(2) { opacity: 0; }
    [aria-expanded="true"] span:nth-child(3) { translate: 0 -2.6vmin; rotate: -45deg; }
    nav { position: fixed; inset: 0; display: grid; place-content: center; gap: 4vmin; background: #e0532f; clip-path: circle(0 at 50% 50%); transition: clip-path .5s cubic-bezier(.6, 0, .2, 1); }
    nav a { color: #fff; font: 800 8vmin serif; text-decoration: none; text-align: center; }
    [aria-expanded="true"] + nav { clip-path: circle(75% at 50% 50%); }`,
  js() {
    const b = document.getElementById('b');
    b.onclick = () => b.setAttribute('aria-expanded', b.getAttribute('aria-expanded') !== 'true');
    if (window.THUMB) setInterval(() => b.click(), 1500);
  },
}, {
  id: 'anim-orbit', c: 'anim', lv: 2,
  t: '惑星の公転', y: 'わくせいのこうてん',
  tags: ['回転', '入れ子', '宇宙', 'transform-origin'],
  d: '回る輪の中に惑星を置き、その惑星の中にさらに回る輪を置くと月になる。回転を入れ子にするだけで太陽系になる。',
  html: `
    <div class="sys">
      <div class="sun"></div>
      <div class="o" style="--r:14vmin;--t:3s"><i style="--s:2vmin;--c:#b9b3a8"></i></div>
      <div class="o" style="--r:22vmin;--t:7s"><i style="--s:3.4vmin;--c:#e8c46a"></i></div>
      <div class="o" style="--r:32vmin;--t:11s"><i style="--s:3.8vmin;--c:#3f8fe0"><b class="o moon" style="--r:7vmin;--t:1.6s"><i style="--s:1.2vmin;--c:#ddd"></i></b></i></div>
      <div class="o" style="--r:42vmin;--t:20s"><i style="--s:3vmin;--c:#d95b3a"></i></div>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: radial-gradient(#141a33, #05060c); overflow: hidden; }
    .sys { position: relative; width: 90vmin; aspect-ratio: 1; display: grid; place-items: center; }
    .sun { width: 10vmin; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(#fff6c0, #ffb000 60%, #ff6a00); box-shadow: 0 0 6vmin #ffae00; }
    .o { position: absolute; width: calc(var(--r) * 2); aspect-ratio: 1; border-radius: 50%; border: 1px solid #ffffff1c; animation: spin var(--t) linear infinite; }
    .o > i { position: absolute; top: calc(var(--s) / -2); left: calc(50% - var(--s) / 2); width: var(--s); aspect-ratio: 1; border-radius: 50%; background: var(--c); display: grid; place-items: center; }
    .moon { border-color: #ffffff22; }
    @keyframes spin { to { rotate: 1turn; } }`,
}, {
  id: 'anim-eyes', c: 'anim', lv: 1,
  t: '目で追いかける', y: 'めでおいかける',
  tags: ['マウス', 'atan2', '角度', 'キャラクター'],
  d: 'マウスの位置と目の中心から角度を求め、黒目をその方向へ少しだけずらす。Math.atan2 が角度を出してくれる。',
  html: `<div class="face"><div class="eye"><i></i></div><div class="eye"><i></i></div></div>`,
  css: `
    body { display: grid; place-items: center; background: #8fd3c7; overflow: hidden; }
    .face { display: flex; gap: 4vmin; }
    .eye { width: 22vmin; aspect-ratio: 1; border-radius: 50%; background: #fff; display: grid; place-items: center; box-shadow: inset 0 -1.5vmin 0 #0001, 0 1vmin 0 #0002; }
    .eye i { width: 9vmin; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff 0 12%, #1b1b1b 14%); }`,
  js() {
    const eyes = [...document.querySelectorAll('.eye')];
    function look(x, y) {
      for (const e of eyes) {
        const r = e.getBoundingClientRect();
        const a = Math.atan2(y - (r.top + r.height / 2), x - (r.left + r.width / 2));
        const d = Math.min(r.width * 0.25, Math.hypot(x - r.left - r.width / 2, y - r.top - r.height / 2) / 6);
        e.firstElementChild.style.translate = `${Math.cos(a) * d}px ${Math.sin(a) * d}px`;
      }
    }
    let moved = false;
    addEventListener('pointermove', (e) => { moved = true; look(e.clientX, e.clientY); });
    (function wander(t) { if (!moved) look(innerWidth / 2 + Math.cos(t / 600) * innerWidth, innerHeight / 2 + Math.sin(t / 900) * innerHeight); requestAnimationFrame(wander); })(0);
  },
}, {
  id: 'anim-throw', c: 'anim', lv: 2,
  t: '投げられる札', y: 'なげられるふだ',
  tags: ['ドラッグ', 'Pointer Events', '慣性', '跳ね返り'],
  d: '札をつかんで投げると、離した瞬間の速さのまま飛び、壁で跳ね返り、摩擦でゆっくり止まる。マウスでも指でも動く。',
  p: 'setPointerCapture を使うと、指が札の外へはみ出しても動きを追い続けられる。',
  html: `<div class="card" id="c">投げて</div>`,
  css: `
    body { background: #2b2d42; overflow: hidden; touch-action: none; }
    .card { position: fixed; left: 0; top: 0; width: 22vmin; aspect-ratio: 5 / 7; border-radius: 2vmin; display: grid; place-items: center; font: 800 5vmin serif; color: #2b2d42; background: linear-gradient(135deg, #fff, #edf2f4); box-shadow: 0 2vmin 4vmin #0006; cursor: grab; user-select: none; }
    .card:active { cursor: grabbing; }`,
  js() {
    const c = document.getElementById('c');
    let x = innerWidth / 2 - 60, y = innerHeight / 2 - 80, vx = 6, vy = -4, rot = 0, drag = null;
    const place = () => { c.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`; };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); drag = { dx: e.clientX - x, dy: e.clientY - y, lx: e.clientX, ly: e.clientY, t: performance.now() }; vx = vy = 0; });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const now = performance.now(), dt = Math.max(1, now - drag.t);
      vx = ((e.clientX - drag.lx) / dt) * 16; vy = ((e.clientY - drag.ly) / dt) * 16;
      drag.lx = e.clientX; drag.ly = e.clientY; drag.t = now;
      x = e.clientX - drag.dx; y = e.clientY - drag.dy; place();
    });
    c.addEventListener('pointerup', () => { drag = null; });
    (function loop() {
      if (!drag) {
        const w = c.offsetWidth, h = c.offsetHeight;
        x += vx; y += vy; vx *= 0.985; vy *= 0.985; rot += vx * 0.3;
        if (x < 0) { x = 0; vx = -vx * 0.8; } if (x > innerWidth - w) { x = innerWidth - w; vx = -vx * 0.8; }
        if (y < 0) { y = 0; vy = -vy * 0.8; } if (y > innerHeight - h) { y = innerHeight - h; vy = -vy * 0.8; }
        place();
      }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'anim-ripple-button', c: 'anim', lv: 1,
  t: '押すと広がる波紋', y: 'おすとひろがるはもん',
  tags: ['ボタン', 'クリック', '波紋', 'animationend'],
  d: '押した位置に丸い要素を置き、広げながら消していく。アニメーションが終わったら animationend で取り除く。',
  html: `<div class="row"><button>保存</button><button class="b2">送信</button><button class="b3">共有</button></div>`,
  css: `
    body { display: grid; place-items: center; background: #f7f7fb; }
    .row { display: flex; gap: 3vmin; }
    button { position: relative; overflow: hidden; border: 0; border-radius: 1.4vmin; padding: 2.4vmin 6vmin; font: 700 4vmin sans-serif; color: #fff; background: #3e5bd8; }
    .b2 { background: #e0532f; } .b3 { background: #2f855a; }
    .rip { position: absolute; border-radius: 50%; background: #fff8; translate: -50% -50%; pointer-events: none; animation: rip .65s ease-out forwards; }
    @keyframes rip { from { width: 0; height: 0; opacity: 1; } to { width: 500px; height: 500px; opacity: 0; } }`,
  js() {
    function ripple(b, x, y) {
      const s = document.createElement('span');
      s.className = 'rip';
      s.style.left = x + 'px'; s.style.top = y + 'px';
      b.append(s);
      s.addEventListener('animationend', () => s.remove());
    }
    for (const b of document.querySelectorAll('button')) {
      b.addEventListener('pointerdown', (e) => { const r = b.getBoundingClientRect(); ripple(b, e.clientX - r.left, e.clientY - r.top); });
    }
    if (window.THUMB) setInterval(() => { const bs = document.querySelectorAll('button'); const b = bs[Math.floor(Math.random() * 3)]; ripple(b, Math.random() * b.offsetWidth, Math.random() * b.offsetHeight); }, 500);
  },
}, {
  id: 'anim-odometer', c: 'anim', lv: 2,
  t: 'くるくる回る数字', y: 'くるくるまわるすうじ',
  tags: ['カウンター', 'translate', 'transition', '数字'],
  d: '0〜9を縦に並べた帯を桁ごとに用意し、表示したい数字の位置まで帯をずらす。走行距離計のように数字が回る。',
  html: `<div class="odo" id="odo" aria-live="polite"></div><button id="up">数を増やす</button>`,
  css: `
    body { display: grid; place-content: center; gap: 4vmin; justify-items: center; background: #161616; color: #fff; }
    .odo { display: flex; gap: .6vmin; font: 800 14vmin/1 ui-monospace, monospace; }
    .digit { height: 1em; overflow: hidden; background: linear-gradient(#000, #333 50%, #000); border-radius: 1vmin; padding: 0 .1em; }
    .strip { display: grid; transition: translate 1.2s cubic-bezier(.2, .9, .3, 1); }
    .strip span { height: 1em; text-align: center; color: #ffd27a; }`,
  js() {
    const odo = document.getElementById('odo');
    const N = 6;
    const strips = Array.from({ length: N }, () => {
      const d = document.createElement('div');
      d.className = 'digit';
      d.innerHTML = `<div class="strip">${[...'0123456789'].map((x) => `<span>${x}</span>`).join('')}</div>`;
      odo.append(d);
      return d.firstElementChild;
    });
    let value = 0;
    function show(v) {
      const s = String(v).padStart(N, '0');
      strips.forEach((st, i) => { st.style.translate = `0 -${s[i] * 10}%`; });
      odo.setAttribute('aria-label', v.toLocaleString('ja-JP'));
    }
    document.getElementById('up').onclick = () => show((value += Math.floor(Math.random() * 5000) + 1));
    show(value);
    setInterval(() => show((value += Math.floor(Math.random() * 300))), 1800);
  },
}, {
  id: 'anim-like-burst', c: 'anim', lv: 2,
  t: 'はじける「いいね」', y: 'はじけるいいね',
  tags: ['いいねボタン', 'aria-pressed', '粒', 'ボタン'],
  d: '押すとハートがふくらみ、周りに小さな粒がはじける。粒は1つの疑似要素に影を8つ付けて描いている。',
  html: `<button class="like" id="like" aria-pressed="false" aria-label="いいね"><svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.5 1.3 4.3 2.6.8-1.3 2.1-2.6 4.3-2.6 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg></button><p id="n">128</p>`,
  css: `
    body { display: grid; place-content: center; justify-items: center; background: #fff5f6; }
    .like { position: relative; width: 24vmin; aspect-ratio: 1; border-radius: 50%; border: 0; background: #fff; box-shadow: 0 1vmin 3vmin #e8336d33; display: grid; place-items: center; }
    .like svg { width: 55%; fill: #ddd; transition: fill .2s; }
    .like[aria-pressed="true"] svg { fill: #e8336d; animation: pop .45s cubic-bezier(.2, 1.6, .4, 1); }
    .like::after { content: ""; position: absolute; left: 50%; top: 50%; width: 2vmin; aspect-ratio: 1; margin: -1vmin; border-radius: 50%; opacity: 0;
      box-shadow: 0 -14vmin #e8336d, 10vmin -10vmin #ffb454, 14vmin 0 #3fb7e8, 10vmin 10vmin #e8336d, 0 14vmin #ffb454, -10vmin 10vmin #3fb7e8, -14vmin 0 #e8336d, -10vmin -10vmin #ffb454; }
    .like[aria-pressed="true"]::after { animation: burst .6s ease-out; }
    @keyframes pop { 0% { scale: .3; } 100% { scale: 1; } }
    @keyframes burst { 0% { opacity: 1; scale: .3; } 100% { opacity: 0; scale: 1.2; } }
    p { font: 700 5vmin sans-serif; color: #e8336d; }`,
  js() {
    const b = document.getElementById('like'), n = document.getElementById('n');
    b.onclick = () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on);
      n.textContent = +n.textContent + (on ? 1 : -1);
    };
    if (window.THUMB) setInterval(() => b.click(), 1200);
  },
});
