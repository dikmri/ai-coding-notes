/* 図形・CSSアート */
dekiru.add({
  id: 'shape-heart', c: 'shape', lv: 1,
  t: 'ハート', y: 'はーと',
  tags: ['CSSだけ', '疑似要素', '鼓動', 'アニメーション'],
  d: '正方形を45度回し、左と上に円を2つ重ねるとハートになる。鼓動のように脈打たせる。',
  p: '::before と ::after は「要素をもう2つ足す」道具。1つの div で3つの形を扱える。',
  html: `<div class="heart" role="img" aria-label="脈打つハート"></div>`,
  css: `
    body { display: grid; place-items: center; background: #ffe8ee; }
    .heart {
      position: relative; width: 30vmin; aspect-ratio: 1;
      background: #e8336d; rotate: 45deg;
      animation: beat 1.2s infinite;
      filter: drop-shadow(0 1vmin 2vmin #e8336d66);
    }
    .heart::before, .heart::after {
      content: ""; position: absolute; inset: 0;
      background: inherit; border-radius: 50%;
    }
    .heart::before { translate: -50% 0; }
    .heart::after  { translate: 0 -50%; }
    @keyframes beat {
      0%, 100% { scale: 1; }
      15% { scale: 1.15; }
      30% { scale: 1; }
      45% { scale: 1.1; }
    }`,
}, {
  id: 'shape-triangles', c: 'shape', lv: 1,
  t: '枠線でつくる三角形', y: 'わくせんでつくるさんかくけい',
  tags: ['border', '三角形', '吹き出し', 'CSSだけ'],
  d: '幅と高さが0の箱に太い枠線を付け、3辺を透明にすると三角形が残る。吹き出しの角もこの技。',
  p: '枠線は斜めに接している。どの辺に色を残すかで向きが決まる。',
  html: `
    <div class="row">
      <i class="t up"></i><i class="t right"></i><i class="t down"></i><i class="t left"></i>
    </div>
    <p class="bubble">吹き出しの角も三角形です</p>`,
  css: `
    body { display: grid; place-content: center; gap: 6vmin; background: #f6f1e7; color: #222; }
    .row { display: flex; gap: 5vmin; justify-content: center; }
    .t { width: 0; height: 0; border: 7vmin solid transparent; }
    .up    { border-bottom-color: #e0532f; border-top-width: 0; }
    .right { border-left-color: #2b6cb0; border-right-width: 0; }
    .down  { border-top-color: #2f855a; border-bottom-width: 0; }
    .left  { border-right-color: #b7791f; border-left-width: 0; }
    .bubble {
      position: relative; margin: 0 auto; padding: 1em 1.4em; border-radius: 14px;
      background: #26407c; color: #fff; font-size: 4vmin;
    }
    .bubble::after {
      content: ""; position: absolute; left: 2em; bottom: -18px;
      border: 18px solid transparent; border-top-color: #26407c; border-bottom-width: 0;
    }`,
}, {
  id: 'shape-clip-morph', c: 'shape', lv: 2,
  t: '変身する図形', y: 'へんしんするずけい',
  tags: ['clip-path', 'polygon', '変形', 'アニメーション'],
  d: 'clip-path の polygon() は点の数が同じなら滑らかに変形できる。星から十角形、正方形へと形を変え続ける。',
  p: '3つの形をどれも10個の点で表しているのがコツ。点が足りない形は同じ座標を重ねて数を合わせる。',
  html: `<div class="shape"></div>`,
  css: `
    body { display: grid; place-items: center; background: #1b1a2e; }
    .shape {
      width: 50vmin; aspect-ratio: 1;
      background: linear-gradient(135deg, #ffcf5c, #ff5e7e 50%, #7a5cff);
      animation: morph 6s ease-in-out infinite, spin 18s linear infinite;
    }
    @keyframes morph {
      0%, 100% { clip-path: polygon(50% 0%, 61.8% 33.8%, 97.6% 34.5%, 69% 56.2%, 79.4% 90.5%, 50% 70%, 20.6% 90.5%, 31% 56.2%, 2.4% 34.5%, 38.2% 33.8%); }
      33% { clip-path: polygon(50% 0%, 79.4% 9.5%, 97.6% 34.5%, 97.6% 65.5%, 79.4% 90.5%, 50% 100%, 20.6% 90.5%, 2.4% 65.5%, 2.4% 34.5%, 20.6% 9.5%); }
      66% { clip-path: polygon(50% 0%, 100% 0%, 100% 35%, 100% 65%, 100% 100%, 50% 100%, 0% 100%, 0% 65%, 0% 35%, 0% 0%); }
    }
    @keyframes spin { to { rotate: 1turn; } }`,
}, {
  id: 'shape-moon', c: 'shape', lv: 2,
  t: '月の満ち欠け', y: 'つきのみちかけ',
  tags: ['box-shadow', '@property', '月', '夜空'],
  d: '内側の影（inset の box-shadow）を左右にずらすだけで、新月から満月、また新月へと満ち欠けする。',
  p: '@property で --p を数として登録すると、カスタムプロパティも滑らかにアニメーションできる。',
  html: `<div class="sky"><div class="moon"></div></div>`,
  css: `
    @property --p { syntax: "<number>"; inherits: false; initial-value: 0; }
    body { margin: 0; }
    .sky {
      height: 100%; display: grid; place-items: center;
      background:
        radial-gradient(1px 1px at 20% 30%, #fff, transparent),
        radial-gradient(1.5px 1.5px at 70% 20%, #fff, transparent),
        radial-gradient(1px 1px at 40% 80%, #fff, transparent),
        radial-gradient(1px 1px at 85% 65%, #fff, transparent),
        radial-gradient(1.5px 1.5px at 10% 70%, #fff, transparent),
        radial-gradient(circle at 50% 120%, #26305a, #0b0e1c 70%);
    }
    .moon {
      width: 40vmin; aspect-ratio: 1; border-radius: 50%;
      background: #1c2038;
      box-shadow: inset calc(var(--p) * 1vmin) 0 0 0 #f6e7a6, 0 0 6vmin #f6e7a633;
      animation: phase 8s linear infinite;
    }
    @keyframes phase {
      0% { --p: 0; }
      50% { --p: -40; }
      50.01% { --p: 40; }
      100% { --p: 0; }
    }`,
}, {
  id: 'shape-conic-pie', c: 'shape', lv: 1,
  t: '円グラフ（conic-gradient）', y: 'えんぐらふこにっくぐらでーしょん',
  tags: ['conic-gradient', 'グラフ', 'ドーナツ', 'CSSだけ'],
  d: '扇形のグラデーションで円グラフを描き、中央をくり抜いてドーナツにする。割合はCSS変数で渡す。',
  p: 'conic-gradient は「角度で色を切り替える」グラデーション。色の境目を同じ位置に置くとくっきり分かれる。',
  html: `
    <figure>
      <div class="pie" style="--a:38; --b:27; --c:20; --d:15" role="img" aria-label="HTML 38%、CSS 27%、JavaScript 20%、その他 15%"></div>
      <figcaption>
        <span style="--k:#e0532f">HTML 38%</span><span style="--k:#f0a43a">CSS 27%</span>
        <span style="--k:#2f855a">JS 20%</span><span style="--k:#26407c">その他 15%</span>
      </figcaption>
    </figure>`,
  css: `
    @property --t { syntax: "<percentage>"; inherits: false; initial-value: 0%; }
    body { display: grid; place-items: center; }
    figure { display: flex; align-items: center; gap: 5vmin; margin: 0; }
    .pie {
      width: 46vmin; aspect-ratio: 1; border-radius: 50%;
      background: conic-gradient(
        #e0532f 0 calc(var(--a) * 1%),
        #f0a43a 0 calc((var(--a) + var(--b)) * 1%),
        #2f855a 0 calc((var(--a) + var(--b) + var(--c)) * 1%),
        #26407c 0);
      mask: radial-gradient(circle, transparent 38%, #000 39%), conic-gradient(#000 var(--t), transparent 0);
      mask-composite: intersect;
      animation: grow 1.6s ease-out forwards;
    }
    @keyframes grow { to { --t: 100%; } }
    figcaption { display: grid; gap: .5em; font-size: 3.4vmin; }
    figcaption span::before { content: ""; display: inline-block; width: .8em; height: .8em; border-radius: 3px; background: var(--k); margin-right: .5em; }`,
}, {
  id: 'shape-wagara', c: 'shape', lv: 2,
  t: '和柄', y: 'わがら',
  tags: ['グラデーション', '模様', '和風', '市松', '青海波'],
  d: '市松・鱗・青海波・七宝・水玉・縞を、画像を使わずCSSのグラデーションだけで敷き詰める。',
  p: 'background-size で1枚の「タイル」の大きさを決めると、グラデーションが繰り返されて模様になる。',
  html: `
    <ul>
      <li class="ichimatsu">市松</li><li class="uroko">鱗</li><li class="seigaiha">青海波</li>
      <li class="shippo">七宝</li><li class="mizutama">水玉</li><li class="shima">縞</li>
    </ul>`,
  css: `
    body { background: #f4efe4; }
    ul { list-style: none; margin: 0; padding: 3vmin; height: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3vmin; }
    li { border-radius: 12px; display: grid; align-items: end; padding: .6em; font: 700 3.6vmin serif; color: #222; box-shadow: inset 0 0 0 1px #0002; }
    li::first-line { background: #f4efe4cc; }
    .ichimatsu { background: conic-gradient(#2d5a3d 25%, #f4efe4 0 50%, #2d5a3d 0 75%, #f4efe4 0) 0 0 / 40px 40px; }
    .uroko {
      background:
        conic-gradient(from 150deg at 50% 100%, #c23b22 60deg, transparent 0) 0 0 / 40px 34px,
        conic-gradient(from 150deg at 50% 100%, #c23b22 60deg, transparent 0) 20px 17px / 40px 34px,
        #f7e6d0;
    }
    .seigaiha {
      --w: radial-gradient(circle at 50% 100%, #26407c 0 4px, #f4efe4 0 7px, #26407c 0 10px, #f4efe4 0 13px, #26407c 0 16px, #f4efe4 0 18px, #26407c 0 20px, transparent 0);
      background: var(--w) 20px 10px / 40px 20px, var(--w) 0 0 / 40px 20px, #f4efe4;
    }
    .shippo {
      --c: radial-gradient(circle, transparent 66%, #b8860b 67% 71%, transparent 72%);
      background: var(--c) 0 0 / 40px 40px, var(--c) 20px 20px / 40px 40px, #fff8e6;
    }
    .mizutama {
      --d: radial-gradient(#26407c 30%, transparent 32%);
      background: var(--d) 0 0 / 24px 24px, var(--d) 12px 12px / 24px 24px, #e8eefc;
    }
    .shima { background: repeating-linear-gradient(90deg, #6b3fa0 0 10px, #f4efe4 0 20px, #c9b6e4 0 24px, #f4efe4 0 34px); }`,
}, {
  id: 'shape-loaders', c: 'shape', lv: 1,
  t: '読み込み中の印', y: 'よみこみちゅうのしるし',
  tags: ['ローディング', 'スピナー', 'アニメーション', 'CSSだけ'],
  d: '待ち時間を伝える回転や点滅の印を9種類。どれも要素1つとCSSのアニメーションだけで動く。',
  html: `
    <div class="grid">
      <i class="ring"></i><i class="dots"></i><i class="bars"></i>
      <i class="pulse"></i><i class="dual"></i><i class="flip"></i>
      <i class="orbit"></i><i class="stripe"></i><i class="hour"></i>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #14161f; color: #ffb454; }
    .grid { display: grid; grid-template-columns: repeat(3, 14vmin); gap: 8vmin; }
    .grid i { width: 14vmin; aspect-ratio: 1; display: block; position: relative; }
    .ring { border: 1.4vmin solid #ffb45433; border-top-color: currentColor; border-radius: 50%; animation: r 1s linear infinite; }
    .dots { background: radial-gradient(circle closest-side, currentColor 90%, transparent) 0 50% / 33% 33% no-repeat; animation: d 1s steps(1) infinite; }
    .bars { background: linear-gradient(currentColor 0 0) 10% 100% / 18% 30% no-repeat, linear-gradient(currentColor 0 0) 50% 100% / 18% 60% no-repeat, linear-gradient(currentColor 0 0) 90% 100% / 18% 90% no-repeat; animation: b .9s ease-in-out infinite alternate; }
    .pulse { border-radius: 50%; background: currentColor; animation: p 1.2s ease-out infinite; }
    .dual { border-radius: 50%; border: 1.2vmin solid; border-color: currentColor transparent; animation: r 1.2s linear infinite; }
    .flip { background: currentColor; animation: f 1.6s ease-in-out infinite; }
    .orbit { border-radius: 50%; border: 2px dashed #ffb45455; animation: r 1.4s linear infinite; }
    .orbit::after { content: ""; position: absolute; top: -1.5vmin; left: 50%; width: 3vmin; aspect-ratio: 1; margin-left: -1.5vmin; border-radius: 50%; background: currentColor; }
    .stripe { height: 4vmin; align-self: center; border-radius: 99px; background: repeating-linear-gradient(-45deg, currentColor 0 1.5vmin, #ffb45433 0 3vmin) 0 0 / 200% 100%; animation: s 1s linear infinite; }
    .hour { border: 1vmin solid; border-color: currentColor transparent; border-radius: 50%; animation: h 1.6s ease-in-out infinite; }
    @keyframes r { to { rotate: 1turn; } }
    @keyframes d { 33% { background-position: 50% 50%; } 66% { background-position: 100% 50%; } }
    @keyframes b { to { background-size: 18% 90%, 18% 30%, 18% 60%; } }
    @keyframes p { from { scale: .2; opacity: 1; } to { scale: 1; opacity: 0; } }
    @keyframes f { 50% { transform: perspective(200px) rotateY(180deg); } 100% { transform: perspective(200px) rotateY(180deg) rotateX(180deg); } }
    @keyframes s { to { background-position: 100% 0; } }
    @keyframes h { 50% { rotate: 180deg; scale: .7; } 100% { rotate: 360deg; } }`,
}, {
  id: 'shape-pixel-shadow', c: 'shape', lv: 2,
  t: 'box-shadowのドット絵', y: 'ぼっくすしゃどうのどっとえ',
  tags: ['box-shadow', 'ドット絵', 'ピクセルアート', 'おにぎり'],
  d: '1つの小さな四角に影を何十個も付けると、影の1つ1つがドットになる。文字で描いた地図から影を組み立てる。',
  p: 'box-shadow はカンマ区切りでいくつでも重ねられる。影の位置をずらせば、要素を増やさずに絵が描ける。',
  html: `<div class="stage"><div class="px" id="px"></div></div>`,
  css: `
    body { display: grid; place-items: center; background: #cfe8d6; }
    .stage { width: 14vmin; height: 13vmin; animation: hop 1.4s ease-in-out infinite; }
    .px { width: 1vmin; height: 1vmin; }
    @keyframes hop { 50% { translate: 0 -3vmin; } }`,
  js() {
    const map = [
      '.....oooo.....',
      '....owwwwo....',
      '...owwwwwwo...',
      '..owwwwwwwwo..',
      '..owwbwwbwwo..',
      '.owwwwwwwwwwo.',
      '.owwpwwwwpwwo.',
      '.owwwwwmmwwwwo',
      'owwwnnnnnnwwwo',
      'ownnnnnnnnnnwo',
      'onnnnnnnnnnnno',
      'onnnnnnnnnnnno',
      '.oooooooooooo.',
    ];
    const color = { o: '#2b2b2b', w: '#fffdf6', b: '#2b2b2b', p: '#f59fb0', m: '#c0392b', n: '#1f3b2a' };
    const size = 1; // vmin
    const shadows = [];
    map.forEach((row, y) => [...row].forEach((ch, x) => {
      if (color[ch]) shadows.push(`${x * size}vmin ${y * size}vmin 0 ${color[ch]}`);
    }));
    document.getElementById('px').style.boxShadow = shadows.join(',');
    console.log(`影の数: ${shadows.length}`);
  },
}, {
  id: 'shape-blob', c: 'shape', lv: 1,
  t: 'うねうね動く形', y: 'うねうねうごくかたち',
  tags: ['border-radius', '有機的', 'アニメーション', 'グラデーション'],
  d: 'border-radius に8つの値を渡すと、角ごとに縦と横の丸みを別々に決められる。値を動かすと生き物のようにうねる。',
  p: '「30% 70% 70% 30% / 30% 30% 70% 70%」のように / の前が横、後ろが縦の半径。',
  html: `<div class="blob"></div><div class="blob b2"></div>`,
  css: `
    body { display: grid; place-items: center; background: #0f1020; overflow: hidden; }
    .blob {
      grid-area: 1 / 1; width: 55vmin; aspect-ratio: 1;
      background: linear-gradient(120deg, #00e0c6, #3a7bff 60%, #b44cff);
      animation: wob 8s ease-in-out infinite, turn 20s linear infinite;
      filter: blur(.4vmin);
    }
    .b2 { width: 40vmin; mix-blend-mode: screen; background: linear-gradient(45deg, #ff6a88, #ffcc70); animation-duration: 6s, 14s; animation-direction: alternate, reverse; opacity: .8; }
    @keyframes wob {
      0%, 100% { border-radius: 42% 58% 70% 30% / 45% 45% 55% 55%; }
      33% { border-radius: 70% 30% 46% 54% / 30% 29% 71% 70%; }
      66% { border-radius: 30% 70% 30% 70% / 65% 35% 65% 35%; }
    }
    @keyframes turn { to { rotate: 1turn; } }`,
}, {
  id: 'shape-mesh-gradient', c: 'shape', lv: 2,
  t: 'メッシュグラデーション', y: 'めっしゅぐらでーしょん',
  tags: ['radial-gradient', '@property', '背景', '色'],
  d: '位置をずらした円形グラデーションを何枚も重ねて、絵の具がにじむような背景にする。中心の座標をゆっくり動かす。',
  p: '中心の座標を @property で <percentage> として登録しているので、グラデーションの位置そのものが補間される。',
  html: `<main><h1>にじむ色</h1></main>`,
  css: `
    @property --x1 { syntax: "<percentage>"; inherits: false; initial-value: 20%; }
    @property --y1 { syntax: "<percentage>"; inherits: false; initial-value: 20%; }
    @property --x2 { syntax: "<percentage>"; inherits: false; initial-value: 80%; }
    @property --y2 { syntax: "<percentage>"; inherits: false; initial-value: 30%; }
    main {
      height: 100%; display: grid; place-items: center;
      background:
        radial-gradient(at var(--x1) var(--y1), #ff8a5c 0, transparent 50%),
        radial-gradient(at var(--x2) var(--y2), #6a5cff 0, transparent 55%),
        radial-gradient(at 30% 85%, #00d3a7 0, transparent 50%),
        radial-gradient(at 85% 90%, #ffd23f 0, transparent 45%),
        #f6e9ff;
      animation: drift 10s ease-in-out infinite alternate;
    }
    h1 { font: 800 12vmin/1 serif; color: #fff; mix-blend-mode: overlay; margin: 0; }
    @keyframes drift {
      to { --x1: 70%; --y1: 75%; --x2: 15%; --y2: 60%; }
    }`,
}, {
  id: 'shape-css-clock', c: 'shape', lv: 2,
  t: 'CSSで動く時計', y: 'しーえすえすでうごくとけい',
  tags: ['時計', 'animation-delay', 'repeating-conic-gradient', 'アナログ'],
  d: '針は CSS のアニメーションで回るだけ。JS は読み込んだ瞬間に一度だけ「今の時刻ぶん先に進めておく」負の遅延を設定する。',
  p: 'animation-delay にマイナスの値を入れると、アニメーションをその時間だけ進めた状態から始められる。',
  html: `
    <div class="clock">
      <i class="h"></i><i class="m"></i><i class="s"></i><b></b>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #ece6da; }
    .clock {
      position: relative; width: 60vmin; aspect-ratio: 1; border-radius: 50%;
      background:
        repeating-conic-gradient(#222 0 .4deg, transparent 0 30deg) ,
        repeating-conic-gradient(#999 0 .2deg, transparent 0 6deg),
        #fffdf7;
      mask: radial-gradient(circle, #000 88%, transparent 0) , none;
      box-shadow: 0 2vmin 5vmin #0003, inset 0 0 0 1.4vmin #2b2b2b;
    }
    .clock::before { content: ""; position: absolute; inset: 9%; border-radius: 50%; background: #fffdf7; }
    .clock i { position: absolute; left: 50%; bottom: 50%; transform-origin: 50% 100%; border-radius: 99px; translate: -50% 0; }
    .h { width: 2vmin; height: 26%; background: #222; animation: spin 43200s linear infinite; }
    .m { width: 1.3vmin; height: 38%; background: #222; animation: spin 3600s linear infinite; }
    .s { width: .5vmin; height: 42%; background: #e0532f; animation: spin 60s steps(60) infinite; }
    .clock b { position: absolute; inset: 47%; border-radius: 50%; background: #e0532f; }
    @keyframes spin { to { rotate: 1turn; } }`,
  js() {
    const d = new Date();
    const sec = d.getSeconds() + d.getMinutes() * 60 + (d.getHours() % 12) * 3600;
    for (const el of document.querySelectorAll('.clock i')) el.style.animationDelay = `-${sec}s`;
  },
}, {
  id: 'shape-candle', c: 'shape', lv: 2,
  t: 'ゆらめくろうそく', y: 'ゆらめくろうそく',
  tags: ['炎', 'filter', 'blur', '光'],
  d: '涙の形にした要素をぼかして重ね、形と明るさを少しずつ揺らすと炎に見える。周りの光は大きな円形グラデーション。',
  html: `
    <div class="scene">
      <div class="glow"></div>
      <div class="flame"><i></i></div>
      <div class="wick"></div>
      <div class="candle"></div>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #0d0a08; overflow: hidden; }
    .scene { position: relative; width: 20vmin; height: 70vmin; display: grid; justify-items: center; align-content: end; }
    .glow { position: absolute; top: 2vmin; width: 90vmin; aspect-ratio: 1; translate: 0 -40%; border-radius: 50%; background: radial-gradient(#ffb34755, transparent 60%); animation: glow 3s ease-in-out infinite; }
    .flame { position: relative; width: 6vmin; height: 14vmin; border-radius: 50% 50% 35% 35% / 60% 60% 40% 40%; background: linear-gradient(#fff6 0, #ffd36b 30%, #ff8a1f 70%, #0000); filter: blur(.5vmin); transform-origin: 50% 100%; animation: flick .18s ease-in-out infinite alternate, sway 3s ease-in-out infinite; }
    .flame i { position: absolute; left: 30%; bottom: 8%; width: 40%; height: 35%; border-radius: 50%; background: #5ab0ff; filter: blur(.6vmin); opacity: .8; }
    .wick { width: .8vmin; height: 2.5vmin; background: #222; margin-top: -1vmin; }
    .candle { width: 16vmin; height: 32vmin; border-radius: 1vmin 1vmin .5vmin .5vmin; background: linear-gradient(90deg, #e9dcc3, #fff8ea 40%, #d4c3a3); box-shadow: inset 0 3vmin 3vmin -2vmin #ffb34766; }
    @keyframes flick { to { scale: .96 1.05; opacity: .92; } }
    @keyframes sway { 25% { rotate: -2deg; } 75% { rotate: 2.5deg; } }
    @keyframes glow { 50% { opacity: .75; scale: .97; } }`,
}, {
  id: 'shape-one-div-face', c: 'shape', lv: 2,
  t: '1つのdivで描く顔', y: 'ひとつのでぃぶでかくかお',
  tags: ['radial-gradient', '1要素アート', 'まばたき', '背景'],
  d: '背景画像は何枚でも重ねられる。目・ほっぺ・口を円形グラデーションで1枚ずつ描き、目の高さを縮めてまばたきさせる。',
  p: '背景を重ねるときは、先に書いたものほど手前に描かれる。',
  html: `<div class="face" role="img" aria-label="まばたきする顔"></div>`,
  css: `
    body { display: grid; place-items: center; background: #ffe7b8; }
    .face {
      --eye: radial-gradient(closest-side, #2b2118 92%, transparent);
      width: 50vmin; aspect-ratio: 1; border-radius: 50%;
      background:
        var(--eye) 32% 40% / 9% 14% no-repeat,
        var(--eye) 68% 40% / 9% 14% no-repeat,
        radial-gradient(closest-side, #ff8a8a 80%, transparent) 20% 60% / 14% 9% no-repeat,
        radial-gradient(closest-side, #ff8a8a 80%, transparent) 80% 60% / 14% 9% no-repeat,
        radial-gradient(50% 60% at 50% 0, #2b2118 92%, transparent) 50% 70% / 18% 12% no-repeat,
        #ffd27a;
      box-shadow: inset -3vmin -3vmin 0 #f4b84f;
      animation: blink 4s infinite;
    }
    @keyframes blink {
      0%, 92%, 100% { background-size: 9% 14%, 9% 14%, 14% 9%, 14% 9%, 18% 12%, auto; }
      95% { background-size: 9% 1%, 9% 1%, 14% 9%, 14% 9%, 18% 12%, auto; }
    }`,
}, {
  id: 'shape-icons', c: 'shape', lv: 2,
  t: '1要素でつくるアイコン', y: 'いちようそでつくるあいこん',
  tags: ['アイコン', '疑似要素', 'CSSだけ', 'currentColor'],
  d: 'メニュー・閉じる・検索・再生・追加・確認・矢印・家を、画像なしで i 要素1つずつから描く。色は文字色に追従する。',
  p: 'currentColor を使うと、親の color を変えるだけでアイコン全部の色が変わる。',
  html: `
    <ul>
      <li><i class="menu"></i>メニュー</li><li><i class="close"></i>閉じる</li>
      <li><i class="search"></i>検索</li><li><i class="play"></i>再生</li>
      <li><i class="plus"></i>追加</li><li><i class="check"></i>確認</li>
      <li><i class="arrow"></i>進む</li><li><i class="home"></i>家</li>
    </ul>`,
  css: `
    body { display: grid; place-items: center; background: #f4f1ea; color: #26407c; }
    ul { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(4, 18vmin); gap: 5vmin 3vmin; font-size: 2.6vmin; text-align: center; }
    li:hover { color: #e0532f; }
    i { display: block; position: relative; width: 8vmin; height: 8vmin; margin: 0 auto 1.5vmin; }
    i::before, i::after { content: ""; position: absolute; }
    .menu { background: linear-gradient(currentColor 0 0) 0 15% / 100% 14% no-repeat, linear-gradient(currentColor 0 0) 0 50% / 100% 14% no-repeat, linear-gradient(currentColor 0 0) 0 85% / 100% 14% no-repeat; }
    .close::before, .close::after, .plus::before, .plus::after { inset: 43% 0; background: currentColor; border-radius: 1vmin; }
    .close::before { rotate: 45deg; } .close::after { rotate: -45deg; }
    .plus::after { rotate: 90deg; }
    .search::before { inset: 0 25% 25% 0; border: 1.2vmin solid; border-radius: 50%; }
    .search::after { width: 45%; height: 14%; right: -6%; bottom: 10%; background: currentColor; rotate: 45deg; border-radius: 1vmin; }
    .play { width: 0; height: 0; border: 4vmin solid transparent; border-left: 7vmin solid currentColor; border-right: 0; translate: 1vmin 0; }
    .check::before { left: 10%; top: 10%; width: 40%; height: 70%; border: solid currentColor; border-width: 0 1.4vmin 1.4vmin 0; rotate: 45deg; translate: 30% -10%; }
    .arrow::before { inset: 43% 10% 43% 0; background: currentColor; }
    .arrow::after { right: 5%; top: 22%; width: 50%; height: 50%; border: solid currentColor; border-width: 1.2vmin 1.2vmin 0 0; rotate: 45deg; }
    .home::before { left: 10%; right: 10%; bottom: 0; height: 55%; background: currentColor; }
    .home::after { left: 50%; top: 4%; width: 60%; aspect-ratio: 1; translate: -50% 0; background: currentColor; rotate: 45deg; }`,
}, {
  id: 'shape-sunset', c: 'shape', lv: 2,
  t: '夕焼けの海', y: 'ゆうやけのうみ',
  tags: ['グラデーション', '風景', 'アニメーション', '夕日'],
  d: '空・太陽・海・光の帯をグラデーションだけで描き、太陽が沈むのに合わせて空の色も変えていく。',
  html: `<div class="sky"><div class="sun"></div><div class="sea"></div></div>`,
  css: `
    @property --k { syntax: "<number>"; inherits: true; initial-value: 0; }
    .sky {
      height: 100%; position: relative; overflow: hidden;
      background: linear-gradient(
        hsl(calc(220 - var(--k) * 20) 60% calc(55% - var(--k) * 35%)),
        hsl(calc(30 - var(--k) * 20) 90% calc(65% - var(--k) * 30%)) 70%);
      animation: dusk 12s ease-in-out infinite alternate;
    }
    .sun {
      position: absolute; left: 50%; width: 22vmin; aspect-ratio: 1; translate: -50% 0; border-radius: 50%;
      top: calc(18% + var(--k) * 52%);
      background: radial-gradient(#fff6c8, #ffb347 60%, #ff6a3d);
      box-shadow: 0 0 10vmin #ffb347aa;
    }
    .sea {
      position: absolute; inset: 70% 0 0;
      background:
        repeating-linear-gradient(#fff3 0 1px, transparent 1px 1.4vmin),
        linear-gradient(90deg, transparent 38%, #ffd58066 45% 55%, transparent 62%),
        linear-gradient(hsl(calc(215 - var(--k) * 15) 50% calc(35% - var(--k) * 22%)), #0b1530);
      animation: shimmer 2s linear infinite;
    }
    @keyframes dusk { to { --k: 1; } }
    @keyframes shimmer { to { background-position: 0 1.4vmin, 0 0, 0 0; } }`,
});
