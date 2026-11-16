/* SVG */
dekiru.add({
  id: 'sv-draw-line', c: 'svg', lv: 1,
  t: '線が描かれていく', y: 'せんがえがかれていく',
  tags: ['stroke-dasharray', 'stroke-dashoffset', '手書き', 'アニメーション'],
  d: '線を「長い破線」と見なし、破線のずれ（stroke-dashoffset）を全長から0まで動かす。線がペンで描かれていくように現れる。',
  p: 'pathLength="1" を付けると線の全長を1として扱えるので、長さを測らずに済む。',
  html: `
    <svg viewBox="0 0 400 220" role="img" aria-label="山と太陽と波を描く線">
      <path pathLength="1" d="M20 180 L110 70 L160 130 L220 50 L300 160 L380 180"/>
      <path pathLength="1" d="M300 60 m-30 0 a30 30 0 1 0 60 0 a30 30 0 1 0 -60 0" style="--d:.6s"/>
      <path pathLength="1" d="M20 200 Q60 185 100 200 T180 200 T260 200 T340 200 T400 200" style="--d:1.2s"/>
    </svg>`,
  css: `
    body { display: grid; place-items: center; background: #fbf6ea; }
    svg { width: min(92vw, 720px); }
    path { fill: none; stroke: #2b2118; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round;
      stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 3s ease-in-out var(--d, 0s) infinite; }
    path:nth-child(2) { stroke: #e0532f; }
    path:nth-child(3) { stroke: #26407c; }
    @keyframes draw { 0% { stroke-dashoffset: 1; } 50%, 80% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -1; } }`,
}, {
  id: 'sv-morph', c: 'svg', lv: 2,
  t: '形が変わるSVG（SMIL）', y: 'かたちがかわるえすぶいじーすまいる',
  tags: ['SMIL', 'animate', 'モーフィング', 'path'],
  d: 'SVG の中に animate 要素を書くと、JS なしで属性そのものを動かせる。path の形（d 属性）を、命令の並びが同じ別の形へ滑らかに変える。',
  p: '補間できるのは、命令の種類と数がそろっている形どうしだけ。',
  html: `
    <svg viewBox="0 0 200 200" role="img" aria-label="形を変え続ける図形">
      <path fill="#e0532f">
        <animate attributeName="d" dur="6s" repeatCount="indefinite" calcMode="spline" keySplines=".5 0 .5 1;.5 0 .5 1;.5 0 .5 1;.5 0 .5 1"
          values="M100 20 C140 20 180 60 180 100 C180 140 140 180 100 180 C60 180 20 140 20 100 C20 60 60 20 100 20Z;
                  M100 10 C120 70 190 80 190 100 C190 120 120 130 100 190 C80 130 10 120 10 100 C10 80 80 70 100 10Z;
                  M60 30 C100 30 170 30 170 30 C170 70 170 170 170 170 C130 170 30 170 30 170 C30 130 30 30 60 30Z;
                  M100 40 C150 0 200 60 150 110 C120 140 100 170 100 170 C100 170 80 140 50 110 C0 60 50 0 100 40Z;
                  M100 20 C140 20 180 60 180 100 C180 140 140 180 100 180 C60 180 20 140 20 100 C20 60 60 20 100 20Z"/>
        <animate attributeName="fill" dur="6s" repeatCount="indefinite" values="#e0532f;#f0a43a;#26407c;#e8336d;#e0532f"/>
      </path>
    </svg>`,
  css: `body { display: grid; place-items: center; background: #f4efe4; } svg { width: 60vmin; }`,
}, {
  id: 'sv-water-ripple', c: 'svg', lv: 2,
  t: '水面のように揺らぐ文字', y: 'すいめんのようにゆらぐもじ',
  tags: ['feTurbulence', 'feDisplacementMap', 'SVGフィルター', '水'],
  d: 'feTurbulence で作ったノイズを「ずらす量の地図」として使い、feDisplacementMap で文字の画素を押しずらす。ノイズの細かさを時間で変えると水面越しのように揺れる。',
  p: 'SVG のフィルターは HTML の要素にも filter: url(#id) で掛けられる。',
  html: `
    <svg width="0" height="0" aria-hidden="true">
      <filter id="water">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.04" numOctaves="2" seed="3">
          <animate attributeName="baseFrequency" dur="12s" values="0.012 0.04;0.02 0.07;0.012 0.04" repeatCount="indefinite"/>
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" scale="14"/>
      </filter>
    </svg>
    <div class="pool"><h1>水鏡</h1><p>みずかがみ</p></div>`,
  css: `
    body { display: grid; place-items: center; background: linear-gradient(#0e5f7a, #0a2f4a); }
    .pool { filter: url(#water); text-align: center; color: #dff6ff; }
    h1 { margin: 0; font: 900 22vmin/1 serif; text-shadow: 0 0 3vmin #7fe3ff88; }
    p { margin: 0; font: 4vmin serif; letter-spacing: .5em; }`,
}, {
  id: 'sv-gooey-menu', c: 'svg', lv: 3,
  t: 'くっつく玉のメニュー', y: 'くっつくたまのめにゅー',
  tags: ['SVGフィルター', 'goo', 'メニュー', 'feColorMatrix'],
  d: '丸いボタンをぼかしてから、透明度の段差を急にする（feColorMatrix）と、近い玉どうしが水滴のようにくっついて見える。押すと玉が飛び出して離れていく。',
  p: 'ぼかすと形の端が半透明になる。その半透明を「ある値より上なら不透明」に変えると、重なったぼかしが1つの形になる。',
  html: `
    <svg width="0" height="0" aria-hidden="true"><filter id="goo"><feGaussianBlur in="SourceGraphic" stdDeviation="10"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/></filter></svg>
    <nav class="menu" id="m">
      <button class="item" style="--a:-90deg">家</button>
      <button class="item" style="--a:-30deg">音</button>
      <button class="item" style="--a:30deg">絵</button>
      <button class="item" style="--a:90deg">字</button>
      <button class="item" style="--a:150deg">遊</button>
      <button class="item" style="--a:210deg">道</button>
      <button class="main" id="b" aria-expanded="false">＋</button>
    </nav>`,
  css: `
    body { display: grid; place-items: center; background: #f6efe1; }
    .menu { position: relative; width: 16vmin; aspect-ratio: 1; filter: url(#goo); }
    .menu button { position: absolute; inset: 0; border: 0; border-radius: 50%; background: #e0532f; color: #fff; font: 800 5vmin serif; }
    .item { transition: transform .5s cubic-bezier(.3, 1.6, .5, 1); transform: rotate(var(--a)) translateX(0) rotate(calc(-1 * var(--a))) scale(.8); }
    .menu.open .item { transform: rotate(var(--a)) translateX(22vmin) rotate(calc(-1 * var(--a))) scale(.8); }
    .main { font-size: 8vmin; transition: rotate .4s; }
    .menu.open .main { rotate: 45deg; }`,
  js() {
    const m = document.getElementById('m'), b = document.getElementById('b');
    b.onclick = () => { const o = m.classList.toggle('open'); b.setAttribute('aria-expanded', o); };
    if (window.THUMB) setInterval(() => b.click(), 1400);
  },
}, {
  id: 'sv-pattern-maker', c: 'svg', lv: 2,
  t: '模様を作ってSVGで保存', y: 'もようをつくってえすぶいじーでほぞん',
  tags: ['ジェネラティブアート', 'SVG生成', 'ダウンロード', 'Blob'],
  d: '升目ごとに、円・半円・三角・四分円の中からでたらめに選んで並べ、幾何学模様を作る。できた模様は SVG ファイルとして保存でき、どこまで拡大してもにじまない。',
  html: `<div id="art"></div><div class="bar"><button id="new">作り直す</button><button id="save">SVGで保存</button></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #e7e1d4; } #art svg { width: min(80vmin, 560px); box-shadow: 0 1vmin 3vmin #0003; } .bar { display: flex; gap: 8px; }`,
  js() {
    const pals = [['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'], ['#1d3557', '#e63946', '#f1faee', '#a8dadc', '#457b9d'], ['#2b2118', '#c23b22', '#f2c14e', '#f4efe4', '#26407c']];
    let svg = '';
    function make() {
      const pal = pals[Math.floor(Math.random() * pals.length)], N = 8, S = 50;
      const pick = () => pal[Math.floor(Math.random() * pal.length)];
      let body = '';
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const px = x * S, py = y * S, bg = pick();
        let fg = pick(); while (fg === bg) fg = pick();
        body += `<rect x="${px}" y="${py}" width="${S}" height="${S}" fill="${bg}"/>`;
        const r = Math.floor(Math.random() * 4) * 90, k = Math.floor(Math.random() * 4);
        const shape = [`<circle cx="25" cy="25" r="18" fill="${fg}"/>`, `<path d="M0 0 A50 50 0 0 1 50 50 L0 50Z" fill="${fg}"/>`, `<path d="M0 0 L50 0 L0 50Z" fill="${fg}"/>`, `<path d="M0 25 A25 25 0 0 1 50 25Z" fill="${fg}"/>`][k];
        body += `<g transform="translate(${px} ${py}) rotate(${r} 25 25)">${shape}</g>`;
      }
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N * S} ${N * S}">${body}</svg>`;
      document.getElementById('art').innerHTML = svg;
    }
    document.getElementById('new').onclick = make;
    document.getElementById('save').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      a.download = 'pattern.svg'; a.click();
    };
    make();
    if (window.THUMB) setInterval(make, 1500);
  },
}, {
  id: 'sv-clock', c: 'svg', lv: 1,
  t: 'SVGのアナログ時計', y: 'えすぶいじーのあなろぐとけい',
  tags: ['時計', 'transform', 'rotate', 'SVG'],
  d: '目盛りは JS で60本の線を回転させて並べ、針は毎フレーム今の時刻から角度を計算して回す。秒針は滑らかに動き続ける。',
  html: `
    <svg viewBox="-100 -100 200 200" role="img" aria-label="アナログ時計">
      <circle r="96" fill="#fffdf7" stroke="#2b2b2b" stroke-width="4"/>
      <g id="ticks"></g>
      <line id="h" y2="-48" stroke="#222" stroke-width="7" stroke-linecap="round"/>
      <line id="m" y2="-70" stroke="#222" stroke-width="4" stroke-linecap="round"/>
      <line id="s" y1="14" y2="-80" stroke="#e0532f" stroke-width="2" stroke-linecap="round"/>
      <circle r="5" fill="#e0532f"/>
    </svg>`,
  css: `body { display: grid; place-items: center; background: #e7eef3; } svg { width: 70vmin; filter: drop-shadow(0 2vmin 3vmin #0003); }`,
  js() {
    const ticks = document.getElementById('ticks');
    for (let i = 0; i < 60; i++) {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('y1', -88); l.setAttribute('y2', i % 5 ? -84 : -76);
      l.setAttribute('stroke', '#333'); l.setAttribute('stroke-width', i % 5 ? 1 : 3);
      l.setAttribute('transform', `rotate(${i * 6})`);
      ticks.append(l);
    }
    const rot = (id, deg) => document.getElementById(id).setAttribute('transform', `rotate(${deg})`);
    (function tick() {
      const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      rot('s', s * 6); rot('m', m * 6); rot('h', h * 30);
      requestAnimationFrame(tick);
    })();
  },
}, {
  id: 'sv-text-path', c: 'svg', lv: 2,
  t: '曲線の上を流れる文字', y: 'きょくせんのうえをながれるもじ',
  tags: ['textPath', '曲線', '文字', 'startOffset'],
  d: 'textPath を使うと、文字を好きな曲線の上に並べられる。文字の開始位置（startOffset）を少しずつずらすと、波の上を文字が流れていく。',
  html: `
    <svg viewBox="0 0 600 260" role="img" aria-label="波の上を流れる文字">
      <path id="wave" d="M-200 150 C-100 60 0 240 100 150 S300 60 400 150 S600 240 700 150 S900 60 1000 150" fill="none" stroke="#9bd3ff" stroke-width="2" stroke-dasharray="4 6"/>
      <text font-size="34" font-weight="800" fill="#26407c"><textPath href="#wave" id="tp">ライブラリなしで、文字は波にも乗る。HTML・CSS・JavaScript だけで出来る。</textPath></text>
    </svg>`,
  css: `body { display: grid; place-items: center; background: #eaf6ff; } svg { width: 96vw; }`,
  js() {
    const tp = document.getElementById('tp');
    (function loop(t) { tp.setAttribute('startOffset', ((t / 30) % 1000) - 800); requestAnimationFrame(loop); })(0);
  },
}, {
  id: 'sv-blob-maker', c: 'svg', lv: 2,
  t: 'ゆるい形のブロブを作る', y: 'ゆるいかたちのぶろぶをつくる',
  tags: ['ベジェ曲線', 'ブロブ', 'SVG生成', 'Catmull-Rom'],
  d: '円の上にでたらめに少しずらした点を置き、点を滑らかな曲線で結んで（キャットマル＝ロム曲線をベジェに変換）有機的な形を作る。押すたびに形が変わり、SVG のコードもコピーできる。',
  html: `<div id="blob"></div><div class="bar"><button id="new">作り直す</button><button id="copy">SVGをコピー</button></div><textarea id="code" readonly rows="3" aria-label="SVGのコード"></textarea>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #f5f0ff; } #blob svg { width: 50vmin; } #blob path { transition: d .8s cubic-bezier(.3, 1, .4, 1); } textarea { width: min(90vw, 560px); font: 11px ui-monospace, monospace; } .bar { display: flex; gap: 8px; }`,
  js() {
    let path;
    function make() {
      const N = 6 + Math.floor(Math.random() * 4), pts = [];
      for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, r = 60 + Math.random() * 35; pts.push([100 + Math.cos(a) * r, 100 + Math.sin(a) * r]); }
      let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 0; i < N; i++) {
        const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += ` C${c1.map((v) => v.toFixed(1)).join(' ')} ${c2.map((v) => v.toFixed(1)).join(' ')} ${p2.map((v) => v.toFixed(1)).join(' ')}`;
      }
      d += 'Z';
      const hue = Math.floor(Math.random() * 360);
      if (!path) {
        document.getElementById('blob').innerHTML = `<svg viewBox="0 0 200 200"><path/></svg>`;
        path = document.querySelector('#blob path');
      }
      path.setAttribute('d', d);
      path.setAttribute('fill', `hsl(${hue} 75% 62%)`);
      document.getElementById('code').value = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="hsl(${hue} 75% 62%)" d="${d}"/></svg>`;
    }
    document.getElementById('new').onclick = make;
    document.getElementById('copy').onclick = async () => { try { await navigator.clipboard.writeText(document.getElementById('code').value); document.getElementById('copy').textContent = 'コピーしました'; } catch { document.getElementById('code').select(); } };
    make();
    if (window.THUMB) setInterval(make, 1300);
  },
}, {
  id: 'sv-symbol-icons', c: 'svg', lv: 1,
  t: 'symbolで使い回すアイコン', y: 'しんぼるでつかいまわすあいこん',
  tags: ['symbol', 'use', 'アイコン', 'currentColor'],
  d: 'アイコンの形を symbol 要素に1度だけ書き、use 要素で何度でも呼び出す。色は currentColor にしておけば、置いた場所の文字色に合わせて変わる。',
  html: `
    <svg width="0" height="0" aria-hidden="true">
      <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 2l3 7 7 .6-5.3 4.6 1.6 7.1L12 17.6 5.7 21.3l1.6-7.1L2 9.6 9 9z" fill="currentColor"/></symbol>
      <symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 21s-8-5-10-10C.8 7.6 3 4 6.6 4c2.1 0 3.5 1.2 5.4 3.3C13.9 5.2 15.3 4 17.4 4 21 4 23.2 7.6 22 11c-2 5-10 10-10 10z" fill="currentColor"/></symbol>
      <symbol id="i-bell" viewBox="0 0 24 24"><path d="M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zM19 17V11a7 7 0 0 0-5-6.7V3a2 2 0 0 0-4 0v1.3A7 7 0 0 0 5 11v6l-2 2v1h18v-1z" fill="currentColor"/></symbol>
    </svg>
    <div class="row">
      <span style="color:#e0532f"><svg><use href="#i-star"/></svg>星</span>
      <span style="color:#e8336d"><svg><use href="#i-heart"/></svg>心</span>
      <span style="color:#26407c"><svg><use href="#i-bell"/></svg>鈴</span>
      <span class="big" style="color:#f0a43a"><svg><use href="#i-star"/></svg></span>
      <span class="small" style="color:#2f855a"><svg><use href="#i-heart"/></svg><svg><use href="#i-heart"/></svg><svg><use href="#i-heart"/></svg></span>
    </div>`,
  css: `body { display: grid; place-items: center; background: #fbf8f2; } .row { display: flex; flex-wrap: wrap; gap: 5vmin; align-items: center; justify-content: center; font: 700 4vmin sans-serif; } .row span { display: inline-flex; align-items: center; gap: .3em; } .row svg { width: 1.6em; height: 1.6em; } .big svg { width: 20vmin; height: 20vmin; } .small svg { width: 1em; height: 1em; } span:hover { filter: brightness(1.3); }`,
}, {
  id: 'sv-text-mask', c: 'svg', lv: 2,
  t: '文字の形にくり抜いた窓', y: 'もじのかたちにくりぬいたまど',
  tags: ['mask', 'clipPath', '文字', 'グラデーション'],
  d: 'SVG の mask に白い文字を置くと、白い部分だけが見える窓になる。窓の向こうで模様を動かすと、文字の中だけで景色が流れる。',
  html: `
    <svg viewBox="0 0 600 260" role="img" aria-label="文字の中で模様が流れる">
      <defs>
        <mask id="m"><rect width="600" height="260" fill="#000"/><text x="300" y="190" text-anchor="middle" font-size="170" font-weight="900" fill="#fff" font-family="serif">出来る</text></mask>
        <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#ff5e7e"/><stop offset=".33" stop-color="#ffcf5c"/><stop offset=".66" stop-color="#5ce1e6"/><stop offset="1" stop-color="#ff5e7e"/></linearGradient>
      </defs>
      <g mask="url(#m)">
        <rect id="bg" x="0" y="0" width="1200" height="260" fill="url(#g)"/>
        <g id="dots" fill="#fff8"></g>
      </g>
    </svg>`,
  css: `body { display: grid; place-items: center; background: #14121c; } svg { width: 94vw; }`,
  js() {
    const dots = document.getElementById('dots');
    for (let i = 0; i < 60; i++) { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', Math.random() * 600); c.setAttribute('cy', Math.random() * 260); c.setAttribute('r', 3 + Math.random() * 10); dots.append(c); }
    const bg = document.getElementById('bg');
    (function loop(t) { bg.setAttribute('x', -((t / 8) % 600)); dots.setAttribute('transform', `translate(0 ${-((t / 40) % 260)})`); requestAnimationFrame(loop); })(0);
  },
}, {
  id: 'sv-waves', c: 'svg', lv: 2,
  t: '重なり合う波', y: 'かさなりあうなみ',
  tags: ['path', 'sin', '波', 'ヘッダー'],
  d: '波の線を sin の値から点を並べて作り、毎フレーム path の d 属性を書き換える。速さと色の違う波を3枚重ねると、海の奥行きが出る。',
  html: `<svg id="s" viewBox="0 0 800 300" preserveAspectRatio="none" role="img" aria-label="揺れる波"><path fill="#7fd0ff99"/><path fill="#3fa9e3aa"/><path fill="#1f6fb2"/></svg>`,
  css: `body { background: linear-gradient(#fff6e0, #ffd9a8); overflow: hidden; } svg { position: fixed; left: 0; bottom: 0; width: 100vw; height: 60vh; }`,
  js() {
    const ps = [...document.querySelectorAll('path')];
    const cfg = [[30, 0.012, 0.0012, 150], [24, 0.017, -0.0018, 180], [18, 0.022, 0.0025, 210]];
    (function loop(t) {
      ps.forEach((p, k) => {
        const [amp, f, sp, base] = cfg[k];
        let d = 'M0 300 L0 ' + base;
        for (let x = 0; x <= 800; x += 10) d += ` L${x} ${(base + Math.sin(x * f + t * sp) * amp + Math.sin(x * f * 2.3 + t * sp * 1.7) * amp * 0.3).toFixed(1)}`;
        p.setAttribute('d', d + ' L800 300Z');
      });
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'sv-signature', c: 'svg', lv: 2,
  t: '手書きのサインをSVGに', y: 'てがきのさいんをえすぶいじーに',
  tags: ['署名', 'Pointer Events', 'path', 'SVG生成'],
  d: 'なぞった軌跡を SVG の path として記録する。画像ではなく線のデータなので、拡大してもぼやけず、色や太さを後から変えられる。SVG ファイルとして保存もできる。',
  html: `<svg id="pad" viewBox="0 0 600 260"><path id="p" fill="none" stroke="#1d2b5c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="bar"><button id="clr">消す</button><button id="save">SVGで保存</button><span id="len"></span></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #efece4; touch-action: none; } svg { width: min(94vw, 640px); background: #fff; border-radius: 10px; box-shadow: inset 0 -40px 0 -38px #ccc; cursor: crosshair; } .bar { display: flex; gap: 8px; align-items: center; font-size: 12px; color: #666; }`,
  js() {
    const pad = document.getElementById('pad'), p = document.getElementById('p');
    let d = '', down = false;
    const pt = (e) => { const r = pad.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 600, ((e.clientY - r.top) / r.height) * 260].map((v) => v.toFixed(1)).join(' '); };
    const show = () => { p.setAttribute('d', d); document.getElementById('len').textContent = `パスの長さ: ${d.length} 文字`; };
    pad.addEventListener('pointerdown', (e) => { down = true; pad.setPointerCapture(e.pointerId); d += ` M${pt(e)}`; show(); });
    pad.addEventListener('pointermove', (e) => { if (down) { d += ` L${pt(e)}`; show(); } });
    pad.addEventListener('pointerup', () => { down = false; });
    document.getElementById('clr').onclick = () => { d = ''; show(); };
    document.getElementById('save').onclick = () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 260"><path d="${d.trim()}" fill="none" stroke="#1d2b5c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); a.download = 'signature.svg'; a.click();
    };
    if (window.THUMB) { let t = 0; d = ''; setInterval(() => { t += 0.12; if (t > 14) { t = 0; d = ''; } d += `${d ? ' L' : 'M'}${(40 + t * 38).toFixed(1)} ${(130 + Math.sin(t * 3) * 50 + Math.cos(t * 7) * 15).toFixed(1)}`; show(); }, 30); }
  },
}, {
  id: 'sv-filter-gallery', c: 'svg', lv: 3,
  t: 'SVGフィルター見本', y: 'えすぶいじーふぃるたーみほん',
  tags: ['SVGフィルター', 'feColorMatrix', 'feDiffuseLighting', 'feComponentTransfer'],
  d: '同じ絵に、影・ツートーン・ポスター化・光の当たった凹凸・ざらつき・色ずれの6種類の SVG フィルターをかけて並べる。フィルターは小さな部品を数珠つなぎにして作る。',
  p: 'SVG フィルターは、前の部品の出力（result）を次の部品の入力（in）につなぐ。パイプと同じ考え方。',
  html: `
    <svg width="0" height="0" aria-hidden="true">
      <filter id="f1"><feDropShadow dx="4" dy="6" stdDeviation="4" flood-color="#0006"/></filter>
      <filter id="f2"><feColorMatrix type="matrix" values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues=".15 1"/><feFuncG type="table" tableValues=".1 .8"/><feFuncB type="table" tableValues=".35 .3"/></feComponentTransfer></filter>
      <filter id="f3"><feComponentTransfer><feFuncR type="discrete" tableValues="0 .5 1"/><feFuncG type="discrete" tableValues="0 .5 1"/><feFuncB type="discrete" tableValues="0 .5 1"/></feComponentTransfer></filter>
      <filter id="f4"><feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b"/><feDiffuseLighting in="b" surfaceScale="5" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="40"/></feDiffuseLighting><feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/></filter>
      <filter id="f5"><feTurbulence baseFrequency=".8" numOctaves="2" result="n"/><feColorMatrix in="n" type="saturate" values="0" result="g"/><feBlend in="SourceGraphic" in2="g" mode="multiply"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <filter id="f6"><feOffset in="SourceGraphic" dx="-5" result="r"/><feColorMatrix in="r" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="R"/><feOffset in="SourceGraphic" dx="5" result="c"/><feColorMatrix in="c" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="C"/><feBlend in="R" in2="C" mode="screen"/></filter>
    </svg>
    <div class="grid" id="g"></div>`,
  css: `body { padding: 10px; background: #f0ece4; } .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; } figure { margin: 0; text-align: center; font-size: 12px; } .art { aspect-ratio: 1; border-radius: 12px; display: grid; place-items: center; background: linear-gradient(135deg, #f7b267, #f25c54); font: 900 64px/1 serif; color: #fff; }`,
  js() {
    const names = ['影', 'ツートーン', 'ポスター化', '光と凹凸', 'ざらつき', '色ずれ'];
    document.getElementById('g').innerHTML = names.map((n, i) => `<figure><div class="art" style="filter:url(#f${i + 1})">出</div><figcaption>${n}</figcaption></figure>`).join('');
  },
});
