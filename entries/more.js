/* いろいろな分類への追加（2026-11-17） */
dekiru.add({
  id: 'shape-yin-yang', c: 'shape', lv: 1,
  t: 'CSSだけの太極図', y: 'しーえすえすだけのたいきょくず',
  tags: ['CSSアート', '円', 'グラデーション', '回転'],
  d: '要素は div が1つだけ。左右で色を分けた円に、::before と ::after で小さな円を2つ重ねると太極図になる。つまみで回る速さを変えられる。',
  p: '小さな円の中の点は radial-gradient で描く。図形を足さずに「色の境目」で形を作っている。',
  html: `<div class="yy" id="yy"></div><label class="ui">回る速さ <input type="range" id="sp" min="0" max="20" value="6"></label>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 24px; min-height: 100vh; background: #c9c2b4; }
    .yy { --s: 6s; width: min(60vmin, 300px); aspect-ratio: 1; border-radius: 50%; position: relative; background: linear-gradient(90deg, #1d1b19 50%, #f4efe6 50%); box-shadow: 0 0 0 4px #1d1b19, 0 10px 30px #0004; animation: spin var(--s) linear infinite; }
    .yy::before, .yy::after { content: ''; position: absolute; left: 25%; width: 50%; height: 50%; border-radius: 50%; }
    .yy::before { top: 0; background: radial-gradient(circle, #1d1b19 0 16%, #f4efe6 17%); }
    .yy::after { bottom: 0; background: radial-gradient(circle, #f4efe6 0 16%, #1d1b19 17%); }
    @keyframes spin { to { rotate: 1turn; } }
    .ui { font: 13px system-ui, sans-serif; }`,
  js() {
    const yy = document.getElementById('yy');
    document.getElementById('sp').addEventListener('input', (e) => {
      const v = +e.target.value;
      yy.style.animationPlayState = v ? 'running' : 'paused';
      if (v) yy.style.setProperty('--s', (60 / v).toFixed(2) + 's');
    });
  },
}, {
  id: 'shape-flower', c: 'shape', lv: 2,
  t: '花びらを回して並べる花', y: 'はなびらをまわしてならべるはな',
  tags: ['CSSアート', 'CSS変数', 'transform', '花'],
  d: '同じ形の花びらを、番号 × (360 ÷ 枚数) 度ずつ回して並べると花になる。花びらの枚数・重ねる段の数・色をつまみで変えると、菊にもひまわりにも見える。花はゆっくり呼吸するように開閉する。',
  p: '花びらの角度は CSS の calc(var(--i) * 1turn / var(--n)) で決まる。JS は番号を振るだけ。',
  html: `<div class="fl" id="fl"></div><div class="ui"><label>枚数 <input type="range" id="n" min="5" max="36" value="16"></label><label>段 <input type="range" id="r" min="1" max="4" value="3"></label><label>色 <input type="range" id="h" min="0" max="360" value="340"></label></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 12px; min-height: 100vh; background: radial-gradient(#fff8ec, #f0e2c8); overflow: hidden; }
    .fl { position: relative; width: min(70vmin, 340px); aspect-ratio: 1; animation: breathe 5s ease-in-out infinite; }
    @keyframes breathe { 50% { scale: 1.06; rotate: 8deg; } }
    .pt { position: absolute; left: 50%; top: 50%; width: calc(var(--len) * .38); height: var(--len); margin: calc(var(--len) * -1) 0 0 calc(var(--len) * -.19); transform-origin: 50% 100%;
      transform: rotate(calc(var(--i) * 1turn / var(--n) + var(--off))); border-radius: 50% 50% 50% 50% / 70% 70% 30% 30%;
      background: linear-gradient(hsl(var(--h) 85% 80%), hsl(var(--h) 75% 55%)); box-shadow: inset 0 -6px 12px #0002; }
    .core { position: absolute; left: 50%; top: 50%; width: 16%; aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; background: radial-gradient(#ffe27a, #e0a400); box-shadow: 0 0 0 4px #c98a00aa; }
    .ui { display: flex; gap: 12px; flex-wrap: wrap; font: 12px system-ui, sans-serif; }`,
  js() {
    const fl = document.getElementById('fl'), $ = (id) => +document.getElementById(id).value;
    function draw() {
      const n = $('n'), rings = $('r'), h = $('h');
      let s = '';
      for (let k = rings - 1; k >= 0; k--) {
        const len = 50 - k * 9, off = (k % 2) * (180 / n);
        for (let i = 0; i < n; i++) s += `<div class="pt" style="--i:${i};--n:${n};--len:${len}%;--off:${off}deg;--h:${h + k * 12}"></div>`;
      }
      fl.innerHTML = s + '<div class="core"></div>';
    }
    for (const id of ['n', 'r', 'h']) document.getElementById(id).addEventListener('input', draw);
    draw();
  },
}, {
  id: 'sv-gears', c: 'svg', lv: 3,
  t: 'かみ合って回る歯車', y: 'かみあってまわるはぐるま',
  tags: ['SVG', '歯車', '回転', 'パス生成'],
  d: '歯の数から SVG の歯車の形を計算して描き、3つの歯車をかみ合わせて回す。歯の少ない歯車ほど速く回り、向きは隣と逆になる。「歯の数を変える」を押すと、別の組み合わせでも歯がきちんとかみ合ったまま回る。',
  p: '回る速さの比は歯の数の逆比。隣の歯車の角度は「相手の角度 × 歯数の比」に、歯と溝がそろうずれ（半歯ぶん）を足して決める。',
  html: `<svg id="svg" viewBox="-300 -200 600 400" aria-label="歯車"></svg><div class="ui"><button id="re">歯の数を変える</button><label>速さ <input type="range" id="sp" min="0" max="3" step="0.1" value="1"></label><span id="info"></span></div>`,
  css: `body { background: #1e2228; overflow: hidden; } svg { width: 100vw; height: 100vh; display: block; } .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 10px; align-items: center; color: #ccd; font: 12px system-ui, sans-serif; }`,
  js() {
    const svg = document.getElementById('svg'), NS = 'http://www.w3.org/2000/svg', M = 9;
    function gearPath(n) {
      const r = (M * n) / 2, ro = r + M, ri = r - 1.25 * M, p = (Math.PI * 2) / n, pt = (rad, a) => `${(rad * Math.cos(a)).toFixed(2)} ${(rad * Math.sin(a)).toFixed(2)}`;
      let d = '';
      for (let k = 0; k < n; k++) { const c = k * p; d += `${k ? 'L' : 'M'}${pt(ri, c - p / 2)} L${pt(ri, c - p * 0.27)} L${pt(ro, c - p * 0.15)} L${pt(ro, c + p * 0.15)} L${pt(ri, c + p * 0.27)} `; }
      return d + 'Z';
    }
    let gears = [];
    function build() {
      const ns = [8 + Math.floor(Math.random() * 20), 8 + Math.floor(Math.random() * 14), 14 + Math.floor(Math.random() * 22)];
      svg.innerHTML = '';
      gears = [];
      let x = 0, y = 0;
      const dirs = [0, -0.5, 0.6];
      ns.forEach((n, i) => {
        const r = (M * n) / 2;
        if (i) { const prev = gears[i - 1], dist = prev.r + r; x = prev.x + Math.cos(dirs[i]) * dist; y = prev.y + Math.sin(dirs[i]) * dist; }
        const g = document.createElementNS(NS, 'g'), body = document.createElementNS(NS, 'path'), hole = document.createElementNS(NS, 'circle');
        body.setAttribute('d', gearPath(n)); body.setAttribute('fill', ['#e0a24a', '#7aa2c9', '#c96f5a'][i]); body.setAttribute('stroke', '#0006'); body.setAttribute('stroke-width', 2);
        hole.setAttribute('r', Math.max(6, r * 0.18)); hole.setAttribute('fill', '#1e2228');
        g.append(body, hole);
        for (let k = 0; k < 4; k++) { const s = document.createElementNS(NS, 'rect'); s.setAttribute('x', -r * 0.06); s.setAttribute('y', r * 0.25); s.setAttribute('width', r * 0.12); s.setAttribute('height', r * 0.45); s.setAttribute('fill', '#0003'); s.setAttribute('transform', `rotate(${k * 90})`); g.append(s); }
        svg.append(g);
        gears.push({ n, r, x, y, g, dir: dirs[i] });
      });
      const cx = (Math.min(...gears.map((q) => q.x - q.r)) + Math.max(...gears.map((q) => q.x + q.r))) / 2, cy = (Math.min(...gears.map((q) => q.y - q.r)) + Math.max(...gears.map((q) => q.y + q.r))) / 2;
      gears.forEach((q) => { q.x -= cx; q.y -= cy; });
      document.getElementById('info').textContent = `歯の数 ${ns.join(' → ')} ・ 回転の比 1 : ${(ns[0] / ns[1]).toFixed(2)} : ${(ns[0] / ns[2]).toFixed(2)}`;
    }
    let a0 = 0, last = performance.now();
    (function tick(now) {
      a0 += ((now - last) / 1000) * 0.8 * +document.getElementById('sp').value; last = now;
      let a = a0;
      gears.forEach((q, i) => {
        if (i) { const p = gears[i - 1], th = q.dir; a = (-(p.n / q.n)) * (a - th) + th + Math.PI + Math.PI / q.n; }
        q.g.setAttribute('transform', `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) rotate(${((a * 180) / Math.PI).toFixed(2)})`);
      });
      requestAnimationFrame(tick);
    })(last);
    document.getElementById('re').onclick = build;
    build();
  },
}, {
  id: 'anim-flip-clock', c: 'anim', lv: 2,
  t: 'パタパタめくれる時計', y: 'ぱたぱためくれるとけい',
  tags: ['時計', 'めくり', 'CSS 3D', 'アニメーション'],
  d: '数字の札が上半分から倒れてめくれる時計。1枚の札を「上半分・下半分・倒れる上半分・起き上がる下半分」の4つの部品で作り、数字が変わるたびに2段階で回す。',
  p: '下半分は「数字全体を上へ半分ずらして、はみ出しを隠す」と作れる。同じ数字を2つの窓からのぞいているだけ。',
  html: `<div class="clock" id="clock"></div><p class="date" id="date"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 14px; min-height: 100vh; background: #26282c; }
    .clock { display: flex; gap: .12em; font: 700 clamp(40px, 15vw, 110px)/1 ui-monospace, "SF Mono", Menlo, monospace; color: #f2f2f2; }
    .sep { align-self: center; color: #777; }
    .d { position: relative; width: .8em; height: 1.2em; perspective: 4em; }
    .half { position: absolute; left: 0; right: 0; height: 50%; overflow: hidden; background: #3a3d44; border-radius: .08em .08em 0 0; backface-visibility: hidden; }
    .half i { display: block; height: 200%; line-height: 1.2em; text-align: center; font-style: normal; }
    .lo { bottom: 0; border-radius: 0 0 .08em .08em; background: #34373d; } .lo i { translate: 0 -50%; }
    .d::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px; background: #1c1d20; z-index: 3; }
    .ft { transform-origin: 50% 100%; z-index: 2; animation: down .25s ease-in forwards; }
    .fb { transform-origin: 50% 0; transform: rotateX(90deg); z-index: 2; animation: up .25s .25s ease-out forwards; }
    @keyframes down { to { transform: rotateX(-90deg); } } @keyframes up { to { transform: rotateX(0); } }
    .date { margin: 0; color: #aaa; font: 15px system-ui, sans-serif; }`,
  js() {
    const clock = document.getElementById('clock'), cards = [];
    for (let k = 0; k < 6; k++) {
      if (k === 2 || k === 4) clock.insertAdjacentHTML('beforeend', '<span class="sep">:</span>');
      const d = document.createElement('div'); d.className = 'd';
      d.innerHTML = '<div class="half up"><i></i></div><div class="half lo"><i></i></div>';
      clock.append(d); cards.push({ d, v: null });
    }
    function set(card, v) {
      if (card.v === v) return;
      const old = card.v ?? v, [up, lo] = card.d.querySelectorAll('.up i, .lo i');
      up.textContent = v; lo.textContent = old;
      card.d.querySelectorAll('.ft, .fb').forEach((e) => e.remove());
      card.d.insertAdjacentHTML('beforeend', `<div class="half up ft"><i>${old}</i></div><div class="half lo fb"><i>${v}</i></div>`);
      card.d.querySelector('.fb').addEventListener('animationend', () => { lo.textContent = v; }, { once: true });
      card.v = v;
    }
    function tick() {
      const d = new Date(), s = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join('');
      [...s].forEach((ch, i) => set(cards[i], ch));
      document.getElementById('date').textContent = d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    }
    tick(); setInterval(tick, 250);
  },
}, {
  id: 'anim-text-morph', c: 'anim', lv: 2,
  t: '溶けて別の言葉に変わる文字', y: 'とけてべつのことばにかわるもじ',
  tags: ['文字', 'ぼかし', 'SVGフィルター', 'モーフィング'],
  d: '今の言葉をぼかしながら消し、次の言葉をぼけた状態から浮かび上がらせる。そこへ「半透明の所をくっきり切り分ける」SVG フィルターを掛けると、2つの言葉が液体のようにつながって形を変えて見える。',
  p: 'ぼかしで広がった薄い部分を、色行列のフィルターで「濃いか薄いか」の2つに分ける。重なった所がつながって、溶け合うように見える。',
  html: `<svg width="0" height="0" aria-hidden="true"><filter id="th"><feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 255 -140"/></filter></svg><div class="wrap" aria-live="polite"><span id="a"></span><span id="b"></span></div><input id="words" value="小さく / 作って / つなげて / 出来る！" aria-label="言葉（/ で区切る）">`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 30px; min-height: 100vh; background: #0f1020; color: #ffe08a; }
    .wrap { filter: url(#th); position: relative; width: 90vw; height: 1.4em; font: 900 clamp(40px, 13vw, 110px)/1.4 "Hiragino Sans", "Yu Gothic", sans-serif; }
    .wrap span { position: absolute; inset: 0; text-align: center; user-select: none; }
    input { width: min(90vw, 420px); }`,
  js() {
    const a = document.getElementById('a'), b = document.getElementById('b');
    let words = [], i = 0, morph = 0, cool = 1;
    const read = () => { words = document.getElementById('words').value.split('/').map((s) => s.trim()).filter(Boolean); if (!words.length) words = ['出来る！']; };
    read(); document.getElementById('words').addEventListener('input', read);
    a.textContent = words[0]; b.textContent = words[1 % words.length];
    function show(f) {
      b.style.filter = `blur(${Math.min(8 / f - 8, 100)}px)`; b.style.opacity = `${Math.pow(f, 0.4) * 100}%`;
      const r = 1 - f; a.style.filter = `blur(${Math.min(8 / r - 8, 100)}px)`; a.style.opacity = `${Math.pow(r, 0.4) * 100}%`;
    }
    let last = performance.now();
    (function loop(now) {
      const dt = (now - last) / 1000; last = now;
      cool -= dt;
      if (cool <= 0) {
        morph += dt;
        if (morph >= 1) { cool = 1.4; morph = 0; i = (i + 1) % words.length; a.textContent = words[i]; b.textContent = words[(i + 1) % words.length]; a.style.filter = ''; a.style.opacity = '100%'; b.style.filter = ''; b.style.opacity = '0%'; }
        else show(morph);
      } else { a.style.filter = ''; a.style.opacity = '100%'; b.style.filter = ''; b.style.opacity = '0%'; }
      requestAnimationFrame(loop);
    })(last);
  },
}, {
  id: 'fx-pixel-fire', c: 'effect', lv: 2,
  t: 'ドットで燃える炎', y: 'どっとでもえるほのお',
  tags: ['炎', '画素の描画', 'セル', 'レトロ'],
  d: '一番下の行を最も熱くし、熱が上のマスへ少しずつ冷めながら伝わっていく、という規則だけで炎が揺らめく。熱さを黒・赤・橙・黄・白の色に置き換えて描く。風の向きを変えたり、マウスでなぞって火を足したりできる。',
  p: '各マスは「すぐ下のマスの熱さ − 少しの乱数」。乱数で横にもずらすので、炎がちらちら揺れる。',
  html: `<canvas id="c"></canvas><div class="ui"><label>風 <input type="range" id="wind" min="-2" max="2" step="1" value="0"></label><button id="toggle">火を消す</button></div>`,
  css: `body { background: #000; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; image-rendering: pixelated; touch-action: none; } .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 10px; color: #ccc; font: 12px system-ui, sans-serif; align-items: center; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), W = 160, H = 100;
    c.width = W; c.height = H;
    const heat = new Uint8Array(W * H), img = x.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
    const PAL = Array.from({ length: 37 }, (_, i) => { const t = i / 36; const r = Math.min(255, t * 3 * 255), g = Math.min(255, Math.max(0, t * 3 - 1) * 255), b = Math.min(255, Math.max(0, t * 3 - 2) * 255); return (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0); });
    let on = true;
    const base = () => { for (let i = 0; i < W; i++) heat[(H - 1) * W + i] = on ? 36 : 0; };
    base();
    document.getElementById('toggle').onclick = (e) => { on = !on; base(); e.target.textContent = on ? '火を消す' : '火をつける'; };
    c.addEventListener('pointermove', (e) => {
      const px = Math.floor((e.clientX / innerWidth) * W), py = Math.floor((e.clientY / innerHeight) * H);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = px + dx, yy = py + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) heat[yy * W + xx] = 36; }
    });
    (function loop() {
      const wind = +document.getElementById('wind').value;
      for (let xx = 0; xx < W; xx++) for (let yy = 1; yy < H; yy++) {
        const src = yy * W + xx, r = (Math.random() * 3) | 0, v = heat[src] - (r & 1);
        const dst = src - W - r + 1 + wind;
        if (dst >= 0 && dst < W * H) heat[dst] = v < 0 ? 0 : v;
      }
      for (let i = 0; i < W * H; i++) buf[i] = PAL[heat[i]];
      x.putImageData(img, 0, 0);
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'cv-ink-marbling', c: 'canvas', lv: 3,
  t: '墨流し（マーブリング）', y: 'すみながしまーぶりんぐ',
  tags: ['マーブリング', '墨流し', '変形', '幾何学'],
  d: 'クリックで水面に絵の具を一滴落とすと、前に落とした色の輪が外へ押し広げられる。ドラッグすると櫛で水をなでたように模様が引きずられる。何度も繰り返すと、紙に写し取る前の墨流しの模様ができる。',
  p: '一滴落とすと、まわりの全部の点が「中心からの距離² + 半径²」の平方根の距離まで押し出される。色の境目を点の列で持ち、その点を数式で動かしている。',
  html: `<canvas id="c"></canvas><div class="ui"><button id="clear">水を替える</button><span>クリックで一滴・ドラッグでなでる</span></div>`,
  css: `body { background: #efe7d6; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; touch-action: none; cursor: crosshair; } .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 10px; color: #665; font: 12px system-ui, sans-serif; align-items: center; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const COLORS = ['#26407c', '#c23b22', '#1d1b19', '#b7791f', '#3b7d5a', '#f2ede2', '#7a5cff'];
    let drops = [], ci = 0;
    function drop(cx, cy, r) {
      const r2 = r * r;
      for (const d of drops) for (const p of d.pts) { const dx = p[0] - cx, dy = p[1] - cy, s = Math.sqrt(1 + r2 / (dx * dx + dy * dy || 1e-6)); p[0] = cx + dx * s; p[1] = cy + dy * s; }
      const pts = Array.from({ length: 140 }, (_, i) => { const a = (i / 140) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
      drops.push({ pts, col: COLORS[ci++ % COLORS.length] });
      if (drops.length > 120) drops.shift();
    }
    // 櫛でなでる: 動かした線からの距離 d に応じて、z・λ/(d+λ) だけ線の向きへずらす
    function tine(ax, ay, bx, by) {
      const len = Math.hypot(bx - ax, by - ay); if (len < 0.5) return;
      const mx = (bx - ax) / len, my = (by - ay) / len, z = len * 1.4, L = 26;
      for (const d of drops) {
        for (const p of d.pts) { const dist = Math.abs((p[0] - ax) * -my + (p[1] - ay) * mx), k = (z * L) / (dist + L); p[0] += mx * k; p[1] += my * k; }
        const out = [];
        for (let i = 0; i < d.pts.length; i++) { const p = d.pts[i], q = d.pts[(i + 1) % d.pts.length]; out.push(p); if (d.pts.length + out.length < 1600 && Math.hypot(q[0] - p[0], q[1] - p[1]) > 8) out.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); }
        d.pts = out;
      }
    }
    function draw() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      x.fillStyle = '#efe7d6'; x.fillRect(0, 0, W, H);
      for (const d of drops) { x.fillStyle = d.col; x.beginPath(); d.pts.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p[0], p[1])); x.closePath(); x.fill(); }
    }
    let down = null, moved = false;
    c.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; moved = false; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (!down) return; if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) { moved = true; tine(down[0], down[1], e.clientX, e.clientY); down = [e.clientX, e.clientY]; draw(); } });
    c.addEventListener('pointerup', (e) => { if (down && !moved) { drop(e.clientX, e.clientY, 18 + Math.random() * 40); draw(); } down = null; });
    document.getElementById('clear').onclick = () => { drops = []; draw(); };
    addEventListener('resize', draw);
    for (let k = 0; k < 14; k++) drop(innerWidth / 2 + (Math.random() - 0.5) * 40, innerHeight / 2 + (Math.random() - 0.5) * 40, 20 + Math.random() * 30);
    for (let k = 0; k < 6; k++) tine(0, (innerHeight * (k + 0.5)) / 6, innerWidth, (innerHeight * (k + 0.5)) / 6 + (k % 2 ? 20 : -20));
    draw();
    if (window.THUMB) setInterval(() => { drop(Math.random() * innerWidth, Math.random() * innerHeight, 10 + Math.random() * 30); draw(); }, 400);
  },
}, {
  id: 'cv-snowflake', c: 'canvas', lv: 2,
  t: '育っていく雪の結晶', y: 'そだっていくゆきのけっしょう',
  tags: ['雪の結晶', '対称', '乱数', '成長'],
  d: '1本の腕と枝分かれの形を乱数で決め、それを60度ずつ6回、左右反転も付けて描くと雪の結晶になる。中心から少しずつ伸びていく様子を見せ、育ちきると次の結晶ができる。同じ形は二度と出ない。',
  p: '描くのは12分の1だけ。残りは回転と反転でそろえるので、どんな乱数でも必ず整った結晶になる。',
  html: `<canvas id="c"></canvas><button id="next" class="next">次の結晶</button>`,
  css: `body { background: radial-gradient(#1b3557, #07121f); overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; } .next { position: fixed; left: 8px; top: 8px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let flake, g = 0;
    function make() {
      const R = Math.random, branches = Array.from({ length: 3 + Math.floor(R() * 4) }, () => { const t = 0.15 + R() * 0.7; return { t, len: (1 - t) * (0.25 + R() * 0.5), sub: R() < 0.5 ? 0.3 + R() * 0.4 : 0, w: 1 + R() * 2 }; });
      flake = { branches, plate: R() < 0.6 ? 0.06 + R() * 0.14 : 0, tipHex: R() < 0.5, angle: R() < 0.8 ? Math.PI / 3 : Math.PI / 4, hue: 190 + R() * 30 };
      g = 0;
    }
    function arm(L, mirror) {
      const f = flake, grow = Math.min(1, g) * L;
      x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.lineTo(grow, 0); x.stroke();
      for (const b of f.branches) {
        const at = b.t * L; if (grow <= at) continue;
        const len = Math.min(b.len * L, (grow - at) * 0.9), a = f.angle * mirror;
        x.lineWidth = b.w; x.beginPath(); x.moveTo(at, 0); x.lineTo(at + Math.cos(a) * len, Math.sin(a) * len); x.stroke();
        if (b.sub && len > b.len * L * 0.5) { const sx = at + Math.cos(a) * len * b.sub, sy = Math.sin(a) * len * b.sub, sl = len * 0.35; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + sl, sy); x.stroke(); }
      }
      if (f.tipHex && g >= 1) hex(L, 0, L * 0.06);
    }
    function hex(cx, cy, r) { x.beginPath(); for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 2; x[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.stroke(); }
    make();
    document.getElementById('next').onclick = make;
    (function loop() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      x.clearRect(0, 0, W, H);
      g += 0.006;
      if (g > 1.6) make();
      const L = Math.min(W, H) * 0.42;
      x.save(); x.translate(W / 2, H / 2); x.rotate(g * 0.2);
      x.strokeStyle = `hsl(${flake.hue} 80% 88%)`; x.shadowColor = `hsl(${flake.hue} 100% 70%)`; x.shadowBlur = 12; x.lineCap = 'round';
      for (let k = 0; k < 6; k++) { x.save(); x.rotate((k * Math.PI) / 3); arm(L, 1); arm(L, -1); x.restore(); }
      if (flake.plate) { x.lineWidth = 2; hex(0, 0, flake.plate * L * Math.min(1, g * 2)); hex(0, 0, flake.plate * L * 0.6 * Math.min(1, g * 2)); }
      x.restore();
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'pt-fluid', c: 'particle', lv: 3,
  t: '煙のように渦巻く流体', y: 'けむりのようにうずまくりゅうたい',
  tags: ['流体', 'シミュレーション', '渦', '安定流体法'],
  d: '画面を細かいマス目に分け、マスごとの流れの速さと色の濃さを計算して、煙や絵の具が混ざるような渦を描く。マウスやタッチでなぞると、その向きに流れが生まれて色が流れ込む。何もしなくても、2か所から色が吹き出し続ける。',
  p: '流れを運ぶ（移流）、「どこにも水が溜まらない」ように直す（圧力の投影）の2つを毎フレーム繰り返す。Jos Stam の安定流体法という方法。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; touch-action: none; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), N = 84, S = (N + 2) * (N + 2), IX = (i, j) => i + (N + 2) * j;
    let u = new Float32Array(S), v = new Float32Array(S), u0 = new Float32Array(S), v0 = new Float32Array(S), p = new Float32Array(S), div = new Float32Array(S);
    const dye = [new Float32Array(S), new Float32Array(S), new Float32Array(S)], dye0 = new Float32Array(S);
    const off = document.createElement('canvas'); off.width = off.height = N; const ox = off.getContext('2d'), img = ox.createImageData(N, N);
    function bnd(b, f) {
      for (let i = 1; i <= N; i++) { f[IX(0, i)] = b === 1 ? -f[IX(1, i)] : f[IX(1, i)]; f[IX(N + 1, i)] = b === 1 ? -f[IX(N, i)] : f[IX(N, i)]; f[IX(i, 0)] = b === 2 ? -f[IX(i, 1)] : f[IX(i, 1)]; f[IX(i, N + 1)] = b === 2 ? -f[IX(i, N)] : f[IX(i, N)]; }
    }
    function advect(b, d, d0, uu, vv, dt) {
      const dt0 = dt * N;
      for (let j = 1; j <= N; j++) for (let i = 1; i <= N; i++) {
        let px = i - dt0 * uu[IX(i, j)], py = j - dt0 * vv[IX(i, j)];
        px = Math.max(0.5, Math.min(N + 0.5, px)); py = Math.max(0.5, Math.min(N + 0.5, py));
        const i0 = px | 0, j0 = py | 0, s1 = px - i0, t1 = py - j0, s0 = 1 - s1, t0 = 1 - t1;
        d[IX(i, j)] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j0 + 1)]) + s1 * (t0 * d0[IX(i0 + 1, j0)] + t1 * d0[IX(i0 + 1, j0 + 1)]);
      }
      bnd(b, d);
    }
    // 流れの湧き出しをなくす: 圧力を解いて、その傾きを速度から引く
    function project() {
      const h = 1 / N;
      for (let j = 1; j <= N; j++) for (let i = 1; i <= N; i++) { div[IX(i, j)] = -0.5 * h * (u[IX(i + 1, j)] - u[IX(i - 1, j)] + v[IX(i, j + 1)] - v[IX(i, j - 1)]); p[IX(i, j)] = 0; }
      bnd(0, div); bnd(0, p);
      for (let k = 0; k < 14; k++) { for (let j = 1; j <= N; j++) for (let i = 1; i <= N; i++) p[IX(i, j)] = (div[IX(i, j)] + p[IX(i - 1, j)] + p[IX(i + 1, j)] + p[IX(i, j - 1)] + p[IX(i, j + 1)]) / 4; bnd(0, p); }
      for (let j = 1; j <= N; j++) for (let i = 1; i <= N; i++) { u[IX(i, j)] -= (0.5 * (p[IX(i + 1, j)] - p[IX(i - 1, j)])) / h; v[IX(i, j)] -= (0.5 * (p[IX(i, j + 1)] - p[IX(i, j - 1)])) / h; }
      bnd(1, u); bnd(2, v);
    }
    function splat(gx, gy, fx, fy, col) {
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const i = Math.round(gx) + di, j = Math.round(gy) + dj; if (i < 1 || j < 1 || i > N || j > N) continue;
        const w = Math.exp(-(di * di + dj * dj) / 3), k = IX(i, j);
        u[k] += fx * w; v[k] += fy * w; for (let ch = 0; ch < 3; ch++) dye[ch][k] = Math.min(1.5, dye[ch][k] + col[ch] * w * 0.6);
      }
    }
    const hsl = (h) => { const f = (n) => { const k = (n + h / 30) % 12; return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
    let last = null, hue = 0;
    c.addEventListener('pointermove', (e) => {
      const gx = (e.clientX / innerWidth) * N + 1, gy = (e.clientY / innerHeight) * N + 1;
      if (last) splat(gx, gy, (gx - last[0]) * 0.6, (gy - last[1]) * 0.6, hsl(hue));
      last = [gx, gy]; hue = (hue + 2) % 360;
    });
    c.addEventListener('pointerleave', () => { last = null; });
    let t = 0;
    (function step() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      t += 0.016;
      // 何もしなくても動くように、回りながら色を吹き出す口を2つ置く
      splat(N * 0.3, N * 0.5 + Math.sin(t) * N * 0.2, Math.cos(t * 0.7) * 0.25, Math.sin(t * 1.1) * 0.25, hsl((t * 40) % 360));
      splat(N * 0.7, N * 0.5 + Math.cos(t * 0.9) * N * 0.2, -Math.cos(t * 0.6) * 0.25, Math.cos(t * 1.3) * 0.25, hsl((t * 40 + 180) % 360));
      u0.set(u); v0.set(v); advect(1, u, u0, u0, v0, 0.016); advect(2, v, v0, u0, v0, 0.016); project();
      for (const d of dye) { dye0.set(d); advect(0, d, dye0, u, v, 0.016); for (let k = 0; k < S; k++) d[k] *= 0.993; }
      const px = img.data;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = IX(i + 1, j + 1), o = (j * N + i) * 4; px[o] = Math.min(255, dye[0][k] * 255); px[o + 1] = Math.min(255, dye[1][k] * 255); px[o + 2] = Math.min(255, dye[2][k] * 255); px[o + 3] = 255; }
      ox.putImageData(img, 0, 0);
      x.imageSmoothingEnabled = true; x.drawImage(off, 0, 0, W, H);
      requestAnimationFrame(step);
    })();
  },
}, {
  id: 'pt-chain-reaction', c: 'particle', lv: 2,
  t: '一度だけ押せる連鎖反応', y: 'いちどだけおせるれんさはんのう',
  tags: ['連鎖', '当たり判定', 'ゲーム', '粒子'],
  d: '漂っている60個の玉の中で、1回だけクリックできる。押した所に光の輪が広がり、輪に触れた玉も輪になって広がる。うまい場所を選ぶと、連鎖が画面じゅうに広がっていく。',
  p: '輪は「広がる → しばらく留まる → 縮む」の3段階を時間で決めているだけ。触れた玉を新しい輪に変えると連鎖になる。',
  html: `<canvas id="c"></canvas><div class="ui"><b id="score"></b><button id="again">もう一度</button></div>`,
  css: `body { background: #0b0d1a; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; cursor: pointer; } .ui { position: fixed; left: 10px; top: 8px; display: flex; gap: 10px; align-items: center; color: #fff; font: 14px system-ui, sans-serif; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let balls, rings, used, best = 0;
    function reset() {
      const W = innerWidth, H = innerHeight;
      balls = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 2.4, vy: (Math.random() - 0.5) * 2.4, hue: Math.random() * 360 }));
      rings = []; used = false;
    }
    const R = () => Math.min(innerWidth, innerHeight) * 0.07;
    function boom(px, py, hue) { rings.push({ x: px, y: py, t: 0, hue }); }
    c.addEventListener('click', (e) => { if (used) return; used = true; boom(e.clientX, e.clientY, 50); });
    document.getElementById('again').onclick = reset;
    reset();
    (function loop() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      x.fillStyle = 'rgba(11,13,26,.35)'; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'lighter';
      for (const r of rings) {
        r.t += 1 / 60;
        const rad = r.t < 0.4 ? (r.t / 0.4) * R() : r.t < 1.6 ? R() : Math.max(0, R() * (1 - (r.t - 1.6) / 0.4));
        r.rad = rad;
        x.fillStyle = `hsla(${r.hue}, 90%, 60%, .35)`; x.beginPath(); x.arc(r.x, r.y, rad, 0, 7); x.fill();
      }
      rings = rings.filter((r) => r.t < 2);
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        b.x += b.vx; b.y += b.vy; if (b.x < 0 || b.x > W) b.vx *= -1; if (b.y < 0 || b.y > H) b.vy *= -1;
        if (rings.some((r) => Math.hypot(r.x - b.x, r.y - b.y) < r.rad + 6)) { boom(b.x, b.y, b.hue); balls.splice(i, 1); continue; }
        x.fillStyle = `hsl(${b.hue} 90% 65%)`; x.beginPath(); x.arc(b.x, b.y, 6, 0, 7); x.fill();
      }
      x.globalCompositeOperation = 'source-over';
      const n = 60 - balls.length; if (!rings.length && used) best = Math.max(best, n);
      document.getElementById('score').textContent = !used ? '好きな所を1回だけクリック' : rings.length ? `連鎖 ${n} 個` : `結果 ${n} / 60 個（最高 ${best}）`;
      if (window.THUMB && !used) { used = true; boom(W / 2, H / 2, 50); }
      if (window.THUMB && used && !rings.length) reset();
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'px-seam-carving', c: 'pixel', lv: 3,
  t: '大事な所を残して縮める（シームカービング）', y: 'だいじなところをのこしてちぢめるしーむかーびんぐ',
  tags: ['画像処理', '動的計画法', '縮小', 'エネルギー'],
  d: '画像の横幅を縮めるとき、ただ押しつぶすのではなく、空のような「何もない所」を通る線を1本ずつ抜いていく。家や木の形は残ったまま幅だけが縮む。下の段には、同じ幅に押しつぶした画像を並べて比べられる。自分の画像も選べる。',
  p: '色の変化が小さい画素ほど「抜いても目立たない」。上から下まで、その合計が一番小さい道筋を、動的計画法で1回の表の計算で見つける。',
  html: `<div class="sc"><div class="ui"><button id="go">縮める</button><button id="back">元に戻す</button><label>画像 <input type="file" id="file" accept="image/*"></label><span id="info"></span></div><figure><canvas id="a"></canvas><figcaption>線を抜いて縮めた</figcaption></figure><figure><canvas id="b"></canvas><figcaption>押しつぶした</figcaption></figure></div>`,
  css: `body { background: #e8e6e1; font: 12px system-ui, sans-serif; } .sc { padding: 8px; display: grid; gap: 6px; } .ui { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } figure { margin: 0; } canvas { max-width: 100%; display: block; image-rendering: auto; background: #fff; } figcaption { color: #666; }`,
  js() {
    const A = document.getElementById('a'), B = document.getElementById('b'), ax = A.getContext('2d', { willReadFrequently: true }), bx = B.getContext('2d');
    let W0 = 420, H = 240, w, pix, orig, timer = 0;
    function sample() {
      const c = document.createElement('canvas'); c.width = W0; c.height = H; const g = c.getContext('2d');
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#7fb8ec'); sky.addColorStop(1, '#d9eefc'); g.fillStyle = sky; g.fillRect(0, 0, W0, H);
      g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(340, 50, 22, 0, 7); g.fill();
      g.fillStyle = '#7d9a6a'; g.beginPath(); g.moveTo(0, 170); g.quadraticCurveTo(110, 120, 210, 165); g.quadraticCurveTo(320, 130, 420, 170); g.lineTo(420, 240); g.lineTo(0, 240); g.fill();
      g.fillStyle = '#5b7f4a'; g.fillRect(0, 195, W0, 45);
      g.fillStyle = '#e8dcc6'; g.fillRect(60, 140, 70, 60); g.fillStyle = '#b4463a'; g.beginPath(); g.moveTo(50, 142); g.lineTo(95, 105); g.lineTo(140, 142); g.fill(); g.fillStyle = '#6b4329'; g.fillRect(85, 170, 18, 30); g.fillStyle = '#9cd0f0'; g.fillRect(68, 152, 14, 12);
      for (const tx of [250, 290]) { g.fillStyle = '#6b4329'; g.fillRect(tx - 4, 160, 8, 40); g.fillStyle = '#2f7d32'; g.beginPath(); g.arc(tx, 150, 22, 0, 7); g.fill(); }
      return g.getImageData(0, 0, W0, H);
    }
    function load(imgData) { W0 = imgData.width; H = imgData.height; orig = new Uint32Array(imgData.data.buffer.slice(0)); reset(); }
    function reset() { clearInterval(timer); w = W0; pix = orig.slice(); show(); }
    function show(seam) {
      A.width = w; A.height = H;
      const id = new ImageData(new Uint8ClampedArray(pix.buffer.slice(0, w * H * 4)), w, H); ax.putImageData(id, 0, 0);
      if (seam) { ax.fillStyle = '#ff2020'; seam.forEach((sx, y) => ax.fillRect(sx, y, 1, 1)); }
      B.width = w; B.height = H;
      const o = document.createElement('canvas'); o.width = W0; o.height = H; o.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(orig.buffer.slice(0)), W0, H), 0, 0);
      bx.drawImage(o, 0, 0, w, H);
      document.getElementById('info').textContent = `幅 ${W0} → ${w} 画素`;
    }
    // 1本の道筋（各行で抜く x）を求める
    function findSeam() {
      const e = new Float32Array(w * H), ch = (v, k) => (v >> k) & 255;
      for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) {
        const l = pix[y * w + Math.max(0, x - 1)], r = pix[y * w + Math.min(w - 1, x + 1)], u = pix[Math.max(0, y - 1) * w + x], d = pix[Math.min(H - 1, y + 1) * w + x];
        let s = 0; for (const k of [0, 8, 16]) { const dx = ch(r, k) - ch(l, k), dy = ch(d, k) - ch(u, k); s += dx * dx + dy * dy; }
        e[y * w + x] = Math.sqrt(s);
      }
      for (let y = 1; y < H; y++) for (let x = 0; x < w; x++) { const a = e[(y - 1) * w + Math.max(0, x - 1)], b = e[(y - 1) * w + x], c2 = e[(y - 1) * w + Math.min(w - 1, x + 1)]; e[y * w + x] += Math.min(a, b, c2); }
      const seam = new Int32Array(H); let bx2 = 0;
      for (let x = 1; x < w; x++) if (e[(H - 1) * w + x] < e[(H - 1) * w + bx2]) bx2 = x;
      seam[H - 1] = bx2;
      for (let y = H - 2; y >= 0; y--) { const px = seam[y + 1]; let best = px; for (const cx of [px - 1, px + 1]) if (cx >= 0 && cx < w && e[y * w + cx] < e[y * w + best]) best = cx; seam[y] = best; }
      return seam;
    }
    function removeSeam(seam) {
      const out = new Uint32Array((w - 1) * H);
      for (let y = 0; y < H; y++) { const s = seam[y]; out.set(pix.subarray(y * w, y * w + s), y * (w - 1)); out.set(pix.subarray(y * w + s + 1, (y + 1) * w), y * (w - 1) + s); }
      pix = out; w--;
    }
    document.getElementById('go').onclick = () => {
      clearInterval(timer);
      const target = Math.round(W0 * 0.55);
      timer = setInterval(() => { if (w <= target) { clearInterval(timer); show(); return; } const s = findSeam(); show(s); removeSeam(s); }, 16);
    };
    document.getElementById('back').onclick = reset;
    document.getElementById('file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const bmp = await createImageBitmap(f), k = Math.min(1, 480 / bmp.width), c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, c.width, c.height);
      load(g.getImageData(0, 0, c.width, c.height));
    };
    load(sample());
    if (window.THUMB) setTimeout(() => document.getElementById('go').click(), 300);
  },
}, {
  id: 'tx-genkou', c: 'text', lv: 2,
  t: '原稿用紙に縦書きで清書', y: 'げんこうようしにたてがきでせいしょ',
  tags: ['縦書き', '原稿用紙', 'writing-mode', '禁則'],
  d: '書いた文章を、400字詰めの原稿用紙のマス目に縦書きで1字ずつ置く。段落の頭は1マス空け、行の頭に来てしまう句読点は前の行の最後のマスにぶら下げる。英数字は全角にそろえ、長音や括弧は縦書き用の向きになる。',
  p: 'マス1つ1つに writing-mode: vertical-rl を付けておくと、「ー」や「「」はブラウザが縦書き用の字形に替えて描く。',
  html: `<div class="gk"><textarea id="src" rows="4" aria-label="文章"></textarea><p id="info"></p><div class="paper" id="paper"></div></div>`,
  css: `body { background: #e9e4d8; } .gk { padding: 8px; display: grid; gap: 6px; justify-items: center; } textarea { width: min(96vw, 700px); }
    #info { margin: 0; font: 12px system-ui, sans-serif; color: #666; }
    .paper { --c: min(4.2vw, 26px); display: flex; flex-direction: row-reverse; background: #fffdf6; padding: calc(var(--c) * .8); box-shadow: 0 4px 16px #0002; }
    .col { display: grid; grid-template-rows: repeat(20, var(--c)); border-left: 1px solid #d9a69a; }
    .col:first-child { border-right: 1px solid #d9a69a; }
    .cell { width: var(--c); height: var(--c); border-bottom: 1px solid #ecc9c0; writing-mode: vertical-rl; font: calc(var(--c) * .72)/var(--c) "Hiragino Mincho ProN", "Yu Mincho", serif; text-align: center; color: #222; display: grid; place-items: center; }
    .cell:first-child { border-top: 1px solid #d9a69a; }
    .cell .hang { position: absolute; translate: 0 calc(var(--c) * .45); }
    .cell { position: relative; }
    .fold { width: calc(var(--c) * .9); display: grid; place-items: center; writing-mode: vertical-rl; font: calc(var(--c) * .4) serif; color: #c9877a; letter-spacing: .4em; }`,
  js() {
    const src = document.getElementById('src');
    src.value = '小さなナイフ一本で、どこまで行けるだろう。\nHTMLとCSSとJavaScriptだけで、光を描き、音を鳴らし、立体を回す。「出来る！」と言えることが、毎日少しずつ増えていく。\n明日もまた、新しい道具を作ってみよう。';
    const toFull = (s) => s.replace(/[!-~]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0)).replace(/ /g, '　');
    function layout(text) {
      const cols = [];
      let col = [];
      const push = () => { cols.push(col); col = []; };
      for (const para of text.split('\n')) {
        if (!para.trim()) continue;
        col.push('　');
        for (const ch of [...toFull(para)]) {
          if (col.length === 20) {
            // 行頭禁則: 句読点・閉じ括弧が次の行の頭に来るなら、この行の最後のマスにぶら下げる
            if ('、。」』）'.includes(ch)) { col[19] = col[19] + '\u0000' + ch; continue; }
            push();
          }
          col.push(ch);
        }
        push();
      }
      return cols;
    }
    function render() {
      const cols = layout(src.value), chars = [...src.value.replace(/\s/g, '')].length;
      document.getElementById('info').textContent = `${chars} 字 ・ ${cols.length} 行 ・ 原稿用紙 ${Math.max(1, Math.ceil(cols.length / 20))} 枚（1枚目を表示）`;
      const page = Array.from({ length: 20 }, (_, i) => cols[i] || []);
      let html = '';
      page.forEach((c, i) => {
        if (i === 10) html += '<div class="fold">出来る原稿用紙</div>';
        html += '<div class="col">' + Array.from({ length: 20 }, (_, k) => { const v = c[k] || ''; const [a, b] = v.split('\u0000'); return `<div class="cell">${esc(a || '')}${b ? `<span class="hang">${esc(b)}</span>` : ''}</div>`; }).join('') + '</div>';
      });
      document.getElementById('paper').innerHTML = html;
    }
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    src.addEventListener('input', render);
    render();
  },
}, {
  id: 'tx-kinetic', c: 'text', lv: 2,
  t: '言葉が次々に飛び込む演出', y: 'ことばがつぎつぎにとびこむえんしゅつ',
  tags: ['モーショングラフィックス', 'Web Animations', '文字', '演出'],
  d: '言葉を1つずつ、毎回ちがう動き（拡大して着地・1字ずつ落ちる・回転して起き上がる・横から滑り込む）で画面に出しては消していく。背景の色も言葉ごとに変わる。下の欄の言葉を書き換えると、その言葉で演出し直す。',
  p: '動きは element.animate() で作り、.finished（終わったら解決する Promise）を await でつなぐ。時間の段取りがそのまま上から下へ読めるコードになる。',
  html: `<div class="stage" id="stage"></div><input id="words" value="小さな / ナイフ / 一本で / ここまで / 出来る！" aria-label="言葉（/ で区切る）">`,
  css: `body { overflow: hidden; height: 100vh; transition: background .6s; background: #111; }
    .stage { position: fixed; inset: 0; display: grid; place-items: center; font: 900 clamp(40px, 14vw, 140px)/1 "Hiragino Sans", "Yu Gothic", sans-serif; color: #fff; perspective: 600px; }
    .w { display: inline-block; white-space: nowrap; } .w span { display: inline-block; }
    input { position: fixed; left: 50%; bottom: 10px; translate: -50% 0; width: min(90vw, 460px); }`,
  js() {
    const stage = document.getElementById('stage'), BG = ['#111', '#c23b22', '#26407c', '#2f855a', '#f0a43a', '#7a5cff'];
    const ease = 'cubic-bezier(.2,.9,.2,1)', pop = 'cubic-bezier(.3,1.6,.5,1)';
    const INS = [
      (el) => [el.animate([{ transform: 'scale(4)', opacity: 0, filter: 'blur(12px)' }, { transform: 'scale(1)', opacity: 1, filter: 'blur(0)' }], { duration: 600, easing: ease, fill: 'both' })],
      (el, cs) => cs.map((s, i) => s.animate([{ transform: 'translateY(-140%) rotate(-25deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: i * 70, easing: pop, fill: 'both' })),
      (el, cs) => cs.map((s, i) => s.animate([{ transform: 'rotateX(-100deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, delay: i * 60, easing: ease, fill: 'both' })),
      (el) => [el.animate([{ transform: 'translateX(120vw) skewX(-30deg)' }, { transform: 'translateX(-4%) skewX(10deg)', offset: 0.7 }, { transform: 'none' }], { duration: 650, easing: ease, fill: 'both' })],
      (el, cs) => cs.map((s, i) => s.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 400, delay: (cs.length - i) * 50, easing: pop, fill: 'both' })),
    ];
    const OUTS = [
      (el) => el.animate([{ opacity: 1 }, { transform: 'scale(.6)', opacity: 0, filter: 'blur(8px)' }], { duration: 350, easing: 'ease-in', fill: 'both' }),
      (el) => el.animate([{ transform: 'none' }, { transform: 'translateY(60%)', opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'both' }),
      (el) => el.animate([{ transform: 'none' }, { transform: 'scale(2.4)', opacity: 0 }], { duration: 380, easing: 'ease-in', fill: 'both' }),
    ];
    let run = 0;
    async function play(id) {
      const words = document.getElementById('words').value.split('/').map((s) => s.trim()).filter(Boolean);
      for (let i = 0; id === run; i = (i + 1) % Math.max(1, words.length)) {
        const el = document.createElement('div'); el.className = 'w';
        el.innerHTML = [...(words[i] || '出来る！')].map((ch) => `<span>${ch.replace(/</g, '&lt;')}</span>`).join('');
        stage.replaceChildren(el);
        document.body.style.background = BG[i % BG.length];
        const anims = INS[i % INS.length](el, [...el.children]);
        await Promise.all(anims.map((a) => a.finished));
        await new Promise((r) => setTimeout(r, 650));
        await OUTS[i % OUTS.length](el).finished;
      }
    }
    document.getElementById('words').addEventListener('change', () => play(++run));
    play(run);
  },
}, {
  id: 'sv-bar-race', c: 'svg', lv: 3,
  t: '順位が入れ替わる棒グラフ', y: 'じゅんいがいれかわるぼうぐらふ',
  tags: ['グラフ', 'アニメーション', 'SVG', '補間'],
  d: '期間ごとの数字の変化を、棒の長さと順位の入れ替わりで見せる「バーチャートレース」。値は期間と期間の間をなめらかにつなぎ、順位が変わると棒が上下に滑って入れ替わる。数字は図のための架空のもの。',
  p: '値は2つの期間の間を割合で補間し、毎フレーム並べ替える。棒の縦位置は「目標の順位」へ少しずつ近づけるので、入れ替わりが滑らかになる。',
  html: `<svg id="svg" aria-label="架空の売り上げの推移"></svg><div class="ui"><button id="play">最初から</button><span>架空の果物の売り上げ（単位なし）</span></div>`,
  css: `body { background: #faf8f3; overflow: hidden; } svg { width: 100vw; height: 100vh; display: block; font-family: system-ui, sans-serif; } .ui { position: fixed; left: 8px; bottom: 8px; display: flex; gap: 10px; align-items: center; font: 12px system-ui, sans-serif; color: #666; }`,
  js() {
    const svg = document.getElementById('svg'), NS = 'http://www.w3.org/2000/svg';
    const NAMES = ['りんご', 'みかん', 'ぶどう', 'もも', 'なし', 'いちご', 'すいか', 'かき', 'くり', 'メロン'], COLORS = ['#c23b22', '#f0a43a', '#7a5cff', '#f78fb3', '#b5c76a', '#e8336d', '#2f855a', '#e0812f', '#8a5a3a', '#7fc8a9'];
    const STEPS = 24;
    let data;
    function gen() {
      data = NAMES.map((_, i) => { let v = 20 + Math.random() * 40; const g = 0.5 + Math.random() * 3, swing = Math.random() * 6; return Array.from({ length: STEPS }, (_, s) => (v += g + Math.sin(s / 2 + i) * swing + Math.random() * 4)); });
    }
    const rows = NAMES.map((n, i) => {
      const g = document.createElementNS(NS, 'g'), r = document.createElementNS(NS, 'rect'), t = document.createElementNS(NS, 'text'), v = document.createElementNS(NS, 'text');
      r.setAttribute('fill', COLORS[i]); r.setAttribute('rx', 4); t.textContent = n; t.setAttribute('text-anchor', 'end'); t.setAttribute('font-weight', 700); v.setAttribute('font-size', 13);
      g.append(r, t, v); svg.append(g); return { g, r, t, v, y: i };
    });
    const period = document.createElementNS(NS, 'text'); period.setAttribute('font-size', 48); period.setAttribute('font-weight', 900); period.setAttribute('fill', '#0002'); period.setAttribute('text-anchor', 'end'); svg.append(period);
    let t0 = performance.now();
    gen();
    document.getElementById('play').onclick = () => { gen(); t0 = performance.now(); };
    (function frame(now) {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight), pos = Math.min(STEPS - 1, (now - t0) / 700), s = Math.floor(pos), f = pos - s;
      const vals = data.map((d) => d[s] + ((d[Math.min(STEPS - 1, s + 1)] - d[s]) * f));
      const order = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map((p) => p[1]), max = Math.max(...vals);
      const left = 80, top = 30, bh = (H - top - 50) / NAMES.length;
      rows.forEach((row, i) => {
        const rank = order.indexOf(i);
        row.y += (rank - row.y) * 0.12;
        const y = top + row.y * bh, w = Math.max(2, (vals[i] / max) * (W - left - 80));
        row.r.setAttribute('x', left); row.r.setAttribute('y', y + 3); row.r.setAttribute('width', w); row.r.setAttribute('height', bh - 6);
        row.t.setAttribute('x', left - 8); row.t.setAttribute('y', y + bh / 2 + 5);
        row.v.setAttribute('x', left + w + 6); row.v.setAttribute('y', y + bh / 2 + 5); row.v.textContent = Math.round(vals[i]).toLocaleString('ja-JP');
      });
      period.setAttribute('x', W - 20); period.setAttribute('y', H - 60); period.textContent = `第${s + 1}週`;
      if (window.THUMB && pos >= STEPS - 1 && now - t0 > STEPS * 700 + 1500) { gen(); t0 = now; }
      requestAnimationFrame(frame);
    })(t0);
  },
}, {
  id: 'ui-date-picker', c: 'ui', lv: 3,
  t: 'キーボードで選べる日付の部品', y: 'きーぼーどでえらべるひづけのぶひん',
  tags: ['日付', 'カレンダー', 'キーボード操作', 'popover'],
  d: 'ボタンを押すとカレンダーが開き、矢印キーで1日・1週ずつ、PageUp と PageDown で1か月ずつ動いて Enter で選ぶ。Home と End で週の初めと終わりへ飛ぶ。選んだ日は「2026-11-17」の形の文字で持つので、時差でずれない。',
  p: '日付は Date の「瞬間」ではなく、年・月・日の文字で持つ。日数の足し引きだけ Date.UTC で計算するので、どの国で開いても1日ずれない。',
  html: `<div class="dp"><label for="btn">予約の日</label><button id="btn" class="pick" popovertarget="cal" aria-haspopup="dialog"><span id="shown">日付を選ぶ</span> ▾</button><p id="out"></p>
    <div id="cal" popover class="cal" role="dialog" aria-label="日付を選ぶ"><div class="head"><button id="pm" aria-label="前の月">‹</button><b id="ym" aria-live="polite"></b><button id="nm" aria-label="次の月">›</button></div><table role="grid" id="grid"></table><p class="help">矢印・PageUp/Down・Home/End・Enter</p></div></div>`,
  css: `body { padding: 16px; background: #f4f2ee; font-family: system-ui, sans-serif; } .dp { display: grid; gap: 6px; justify-items: start; }
    .pick { font-size: 16px; padding: 6px 14px; } #out { margin: 0; font-size: 13px; color: #555; }
    .cal { margin: 0; inset: auto; position: fixed; padding: 10px; border: 1px solid #ccc; border-radius: 12px; box-shadow: 0 8px 24px #0003; background: #fff; }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    table { border-collapse: collapse; } th { font-size: 11px; color: #888; padding: 2px; } th:first-child { color: #c23b22; } th:last-child { color: #26407c; }
    td button { width: 36px; height: 34px; border: 0; border-radius: 8px; background: none; font: 14px ui-monospace, monospace; }
    td button:hover { background: #f0ece4; } td button.out { color: #bbb; } td button.today { box-shadow: inset 0 0 0 2px #e0a400; } td button[aria-selected=true] { background: #c23b22; color: #fff; }
    td button:focus-visible { outline: 3px solid #26407c; outline-offset: 1px; } .help { margin: 6px 0 0; font-size: 10px; color: #999; }`,
  js() {
    const $ = (id) => document.getElementById(id), cal = $('cal'), grid = $('grid');
    // 日付は "YYYY-MM-DD" の文字。足し引きは UTC の日数で計算してから文字に戻す
    const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
    const parts = (iso) => iso.split('-').map(Number);
    const addDays = (iso, n) => { const [y, m, d] = parts(iso); return toIso(Date.UTC(y, m - 1, d + n)); };
    const addMonths = (iso, n) => { const [y, m, d] = parts(iso); const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate(); return toIso(Date.UTC(y, m - 1 + n, Math.min(d, last))); };
    const weekday = (iso) => { const [y, m, d] = parts(iso); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
    const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let focus = today, selected = null;
    const fmt = (iso) => { const [y, m, d] = parts(iso); return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'full', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d)); };
    function render() {
      const [y, m] = parts(focus), first = `${y}-${String(m).padStart(2, '0')}-01`, start = addDays(first, -weekday(first));
      $('ym').textContent = `${y}年${m}月`;
      let html = '<tr>' + '日月火水木金土'.split('').map((w) => `<th scope="col" abbr="${w}曜日">${w}</th>`).join('') + '</tr>';
      for (let r = 0; r < 6; r++) {
        html += '<tr>';
        for (let k = 0; k < 7; k++) { const iso = addDays(start, r * 7 + k), [, mm, dd] = parts(iso); html += `<td role="gridcell"><button data-d="${iso}" tabindex="${iso === focus ? 0 : -1}" class="${mm !== m ? 'out' : ''} ${iso === today ? 'today' : ''}" aria-selected="${iso === selected}" aria-label="${fmt(iso)}">${dd}</button></td>`; }
        html += '</tr>';
      }
      grid.innerHTML = html;
    }
    function moveTo(iso) { focus = iso; render(); grid.querySelector(`[data-d="${iso}"]`).focus(); }
    function choose(iso) { selected = iso; $('shown').textContent = fmt(iso); $('out').textContent = `送る値: ${iso}`; cal.hidePopover(); $('btn').focus(); }
    grid.addEventListener('keydown', (e) => {
      const keys = { ArrowLeft: () => addDays(focus, -1), ArrowRight: () => addDays(focus, 1), ArrowUp: () => addDays(focus, -7), ArrowDown: () => addDays(focus, 7), PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1), PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1), Home: () => addDays(focus, -weekday(focus)), End: () => addDays(focus, 6 - weekday(focus)) };
      if (keys[e.key]) { e.preventDefault(); moveTo(keys[e.key]()); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(focus); }
    });
    grid.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) choose(b.dataset.d); });
    $('pm').onclick = () => { focus = addMonths(focus, -1); render(); };
    $('nm').onclick = () => { focus = addMonths(focus, 1); render(); };
    cal.addEventListener('toggle', (e) => {
      if (e.newState !== 'open') return;
      const r = $('btn').getBoundingClientRect();
      cal.style.left = Math.max(8, Math.min(r.left, innerWidth - cal.offsetWidth - 8)) + 'px'; cal.style.top = Math.min(r.bottom + 6, innerHeight - cal.offsetHeight - 8) + 'px';
      focus = selected || today; render(); if (!window.THUMB) grid.querySelector('[tabindex="0"]').focus();
    });
    render();
    if (window.THUMB) { cal.showPopover(); let n = 0; setInterval(() => { focus = addDays(focus, ++n % 9 === 0 ? -8 : 1); render(); }, 500); }
  },
}, {
  id: 'ui-lightbox', c: 'ui', lv: 2,
  t: '写真をなめらかに拡大する表示', y: 'しゃしんをなめらかにかくだいするひょうじ',
  tags: ['ライトボックス', 'dialog', 'View Transitions', '拡大'],
  d: '並んだ小さな絵を押すと、その絵が画面いっぱいへ伸びるように拡大される。矢印キーやスワイプで前後の絵へ移り、ホイールかダブルクリックで拡大してドラッグで動かせる。Esc か外側を押すと元の場所へ縮んで戻る。',
  p: '小さな絵と大きな絵に同じ view-transition-name を付け替えると、ブラウザが2つの間の動きを自動で作る。',
  html: `<div class="gal" id="gal"></div><dialog id="box" closedby="any" aria-label="拡大表示"><div class="view" id="view"><img id="big" alt=""></div><p id="cap"></p><button class="nav p" id="prev" aria-label="前の絵">‹</button><button class="nav n" id="next" aria-label="次の絵">›</button><button class="close" id="close" aria-label="閉じる">✕</button></dialog>`,
  css: `body { background: #1b1c20; padding: 10px; } .gal { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
    .gal button { padding: 0; border: 0; border-radius: 8px; overflow: hidden; aspect-ratio: 4 / 3; background: #333; cursor: zoom-in; } .gal img { width: 100%; height: 100%; object-fit: cover; display: block; }
    dialog { width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: #000e; color: #fff; }
    dialog::backdrop { background: #0008; }
    .view { position: absolute; inset: 40px 10px 40px; display: grid; place-items: center; overflow: hidden; touch-action: none; }
    #big { max-width: 100%; max-height: 100%; border-radius: 6px; transform-origin: center; cursor: grab; user-select: none; -webkit-user-drag: none; }
    #cap { position: absolute; left: 0; right: 0; bottom: 8px; margin: 0; text-align: center; font: 13px system-ui, sans-serif; }
    .nav, .close { position: absolute; background: #fff2; color: #fff; border: 0; border-radius: 50%; width: 40px; height: 40px; font-size: 22px; }
    .nav { top: 50%; translate: 0 -50%; } .p { left: 10px; } .n { right: 10px; } .close { right: 10px; top: 8px; font-size: 16px; }`,
  js() {
    const gal = document.getElementById('gal'), box = document.getElementById('box'), big = document.getElementById('big');
    const TITLES = ['夕焼けの丘', '深い海', '朝もや', '花畑', '夜の街', '砂漠', '氷の湖', '秋の森', '雷雲', '月夜', '珊瑚', '星雲'];
    // 見本の絵はその場で canvas に描いて画像にする
    const art = (i) => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'), h = i * 30;
      const bg = g.createLinearGradient(0, 0, 0, 480); bg.addColorStop(0, `hsl(${h} 70% 25%)`); bg.addColorStop(1, `hsl(${h + 60} 80% 65%)`); g.fillStyle = bg; g.fillRect(0, 0, 640, 480);
      for (let k = 0; k < 5; k++) { g.fillStyle = `hsla(${h + k * 20}, 70%, ${20 + k * 10}%, .8)`; g.beginPath(); g.moveTo(0, 480); for (let x = 0; x <= 640; x += 20) g.lineTo(x, 300 + k * 30 + Math.sin(x / (40 + k * 10) + i) * (30 - k * 4)); g.lineTo(640, 480); g.fill(); }
      g.fillStyle = `hsl(${h + 180} 90% 85%)`; g.beginPath(); g.arc(120 + (i * 97) % 400, 110, 36, 0, 7); g.fill();
      return c.toDataURL('image/jpeg', 0.85);
    };
    const imgs = TITLES.map((_, i) => art(i));
    gal.innerHTML = imgs.map((src, i) => `<button data-i="${i}" aria-label="${TITLES[i]}を拡大"><img src="${src}" alt=""></button>`).join('');
    let cur = 0, zoom = 1, pan = [0, 0];
    const apply = () => { big.style.transform = `translate(${pan[0]}px, ${pan[1]}px) scale(${zoom})`; };
    const setImg = (i) => { cur = (i + imgs.length) % imgs.length; big.src = imgs[cur]; big.alt = TITLES[cur]; document.getElementById('cap').textContent = `${cur + 1} / ${imgs.length} ・ ${TITLES[cur]}`; zoom = 1; pan = [0, 0]; apply(); };
    const vt = (fn) => (document.startViewTransition ? document.startViewTransition(fn) : fn());
    function open(i) {
      const th = gal.children[i].querySelector('img');
      th.style.viewTransitionName = 'pic';
      vt(() => { th.style.viewTransitionName = ''; big.style.viewTransitionName = 'pic'; setImg(i); box.showModal(); });
    }
    function close() {
      const th = gal.children[cur].querySelector('img');
      vt(() => { big.style.viewTransitionName = ''; th.style.viewTransitionName = 'pic'; box.close(); });
      setTimeout(() => { th.style.viewTransitionName = ''; }, 600);
    }
    gal.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) open(+b.dataset.i); });
    document.getElementById('prev').onclick = () => setImg(cur - 1);
    document.getElementById('next').onclick = () => setImg(cur + 1);
    document.getElementById('close').onclick = close;
    box.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    box.addEventListener('click', (e) => { if (e.target === box || e.target.id === 'view') close(); });
    box.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') setImg(cur - 1); if (e.key === 'ArrowRight') setImg(cur + 1); });
    const view = document.getElementById('view');
    view.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(1, Math.min(5, zoom * (e.deltaY < 0 ? 1.15 : 0.87))); if (zoom === 1) pan = [0, 0]; apply(); }, { passive: false });
    big.addEventListener('dblclick', () => { zoom = zoom > 1 ? 1 : 2.5; pan = [0, 0]; apply(); });
    let drag = null, sx = 0;
    big.addEventListener('pointerdown', (e) => { drag = [e.clientX - pan[0], e.clientY - pan[1]]; sx = e.clientX; big.setPointerCapture(e.pointerId); });
    big.addEventListener('pointermove', (e) => { if (drag && zoom > 1) { pan = [e.clientX - drag[0], e.clientY - drag[1]]; apply(); } });
    big.addEventListener('pointerup', (e) => { if (drag && zoom === 1 && Math.abs(e.clientX - sx) > 50) setImg(cur + (e.clientX < sx ? 1 : -1)); drag = null; });
    // 一覧の小窓では焦点を動かさないよう、open 属性を直接付け外しして見せるだけにする
    if (window.THUMB) { let i = 0; setInterval(() => { if (box.open) box.removeAttribute('open'); else { setImg(i++); box.setAttribute('open', ''); } }, 1500); }
  },
}, {
  id: 'ui-tree-view', c: 'ui', lv: 3,
  t: '開け閉めできる木の一覧（ツリー表示）', y: 'あけしめできるきのいちらんつりーひょうじ',
  tags: ['ツリー', 'キーボード操作', 'アクセシビリティ', 'role=tree'],
  d: 'フォルダとファイルを入れ子で見せる一覧。↑↓で見えている項目を移動し、→でフォルダを開くか中へ入り、←で閉じるか親へ戻る。Home と End で端へ、文字キーでその字で始まる項目へ飛ぶ。読み上げソフトにも開閉の状態が伝わる。',
  p: '一覧の中でフォーカスを持つのは1つだけ（ほかは tabindex="-1"）。Tab で入ると前に選んでいた項目へ戻れる。',
  html: `<div class="tv"><ul role="tree" id="tree" aria-label="この図鑑のファイル"></ul><div class="pane" id="pane" aria-live="polite"></div></div>`,
  css: `body { background: #f6f6f3; font: 14px system-ui, sans-serif; } .tv { display: grid; grid-template-columns: minmax(200px, 1fr) 1.2fr; gap: 10px; padding: 10px; }
    ul { list-style: none; margin: 0; padding: 0; } [role=group] { padding-left: 18px; } [role=group][hidden] { display: none; }
    [role=treeitem] > span { display: flex; gap: 6px; align-items: center; padding: 3px 6px; border-radius: 6px; cursor: pointer; }
    [role=treeitem]:focus { outline: none; } [role=treeitem]:focus > span { outline: 2px solid #26407c; } [role=treeitem][aria-selected=true] > span { background: #dfe7f5; }
    .ic { width: 14px; text-align: center; color: #888; font-size: 11px; } .pane { background: #fff; border-radius: 10px; padding: 10px; box-shadow: 0 1px 4px #0001; white-space: pre-wrap; font: 12px/1.6 ui-monospace, monospace; }
    @media (width < 520px) { .tv { grid-template-columns: 1fr; } }`,
  js() {
    const DATA = ['dekiru-html', [
      ['index.html', '画面の骨組み。見出し・検索欄・一覧・索引・パイプ工房・診断の入れ物。'],
      ['css', [['site.css', '紙と墨と朱の配色。明るい・暗い表示の両方に対応する。']]],
      ['js', [['app.js', '一覧・詳しい画面・索引・ページの切り替え。'], ['search.js', 'ひらがな・ローマ字・言い換え・打ち間違いに強い検索。'], ['pipe-core.js', 'パイプの式を読んで、順に部品へ値を流す。'], ['registry.js', '項目を登録して、使っている技術を自動で拾う。']]],
      ['entries', [['3d.js', '立体の見本。'], ['3d-more.js', '立体の見本の続き。'], ['combo.js', '合わせ技の小品。'], ['app.js', 'そのまま使えるアプリ。']]],
      ['tests', [['search.test.mjs', '検索のテスト。'], ['apps.test.mjs', 'アプリの中核のテスト。']]],
      ['tools', [['serve.mjs', '手元で開く小さなサーバー。'], ['check.mjs', '項目の書き方の検査。']]],
    ]];
    const tree = document.getElementById('tree'), pane = document.getElementById('pane');
    let uid = 0;
    function build(node, level) {
      const [name, body] = node, folder = Array.isArray(body), id = 'ti' + uid++;
      return `<li role="treeitem" id="${id}" tabindex="-1" aria-level="${level}" aria-selected="false" ${folder ? `aria-expanded="${level === 1}"` : ''} data-name="${name}" ${folder ? '' : `data-text="${body}"`}><span><i class="ic" aria-hidden="true">${folder ? (level === 1 ? '▼' : '▶') : '・'}</i>${folder ? '📁' : '📄'} ${name}</span>${folder ? `<ul role="group" ${level === 1 ? '' : 'hidden'}>${body.map((n) => build(n, level + 1)).join('')}</ul>` : ''}</li>`;
    }
    tree.innerHTML = build(DATA, 1);
    const items = () => [...tree.querySelectorAll('[role=treeitem]')].filter((li) => !li.parentElement.closest('[role=group][hidden]'));
    let cur = tree.querySelector('[role=treeitem]');
    cur.tabIndex = 0;
    function focus(li) { if (!li) return; cur.tabIndex = -1; cur = li; li.tabIndex = 0; li.focus(); }
    function setOpen(li, open) { if (!li.hasAttribute('aria-expanded')) return; li.setAttribute('aria-expanded', open); li.querySelector(':scope > ul').hidden = !open; li.querySelector(':scope > span .ic').textContent = open ? '▼' : '▶'; }
    function select(li) {
      tree.querySelectorAll('[aria-selected=true]').forEach((x) => x.setAttribute('aria-selected', 'false'));
      li.setAttribute('aria-selected', 'true');
      const path = []; for (let n = li; n; n = n.parentElement.closest('[role=treeitem]')) path.unshift(n.dataset.name);
      pane.textContent = path.join('/') + '\n\n' + (li.dataset.text || `中に ${li.querySelectorAll(':scope > ul > li').length} 個あります`);
    }
    tree.addEventListener('keydown', (e) => {
      const list = items(), i = list.indexOf(cur), open = cur.getAttribute('aria-expanded');
      const act = {
        ArrowDown: () => focus(list[i + 1]), ArrowUp: () => focus(list[i - 1]), Home: () => focus(list[0]), End: () => focus(list[list.length - 1]),
        ArrowRight: () => (open === 'false' ? setOpen(cur, true) : open === 'true' ? focus(cur.querySelector('[role=treeitem]')) : null),
        ArrowLeft: () => (open === 'true' ? setOpen(cur, false) : focus(cur.parentElement.closest('[role=treeitem]'))),
        Enter: () => { select(cur); if (open) setOpen(cur, open === 'false'); }, ' ': () => select(cur),
      }[e.key];
      // 動ける先がない（一番上で↑など）ときは何もしない。キーもブラウザに任せる
      const target = { ArrowDown: list[i + 1], ArrowUp: list[i - 1] }[e.key];
      if (act && !(e.key in { ArrowDown: 1, ArrowUp: 1 } && !target)) { e.preventDefault(); act(); return; }
      if (e.key.length === 1 && /\S/.test(e.key)) { const k = e.key.toLowerCase(), next = [...list.slice(i + 1), ...list.slice(0, i)].find((li) => li.dataset.name.toLowerCase().startsWith(k)); if (next) focus(next); }
    });
    tree.addEventListener('click', (e) => { const li = e.target.closest('[role=treeitem]'); if (!li) return; e.stopPropagation(); focus(li); select(li); if (li.hasAttribute('aria-expanded')) setOpen(li, li.getAttribute('aria-expanded') === 'false'); });
    select(cur);
  },
}, {
  id: 'ly-magazine', c: 'layout', lv: 2,
  t: '雑誌のような段組みの記事', y: 'ざっしのようなだんぐみのきじ',
  tags: ['段組み', 'columns', 'shape-outside', '組版'],
  d: '文章を新聞や雑誌のように複数の段へ流し込み、最初の字を大きく沈めて置き、引用を全段にまたがせ、丸い図のまわりに文字を回り込ませる。幅に合わせて段の数が自動で変わる。ボタンで縦組みにも切り替えられる。',
  p: 'column-width を指定すると、入る数だけ段ができる。図の回り込みは shape-outside: circle() で、四角い箱ではなく円の形に沿って文字が流れる。',
  html: `<button id="tg" class="tg">縦組みにする</button><article class="mag" id="mag">
    <header><p class="kicker">特集 ・ ブラウザの道具箱</p><h1>小さなナイフで、どこまで行けるか</h1><p class="lead">ライブラリを使わず、ブラウザに最初から入っている道具だけで作る。その限界を確かめる旅の記録。</p></header>
    <div class="body">
      <figure class="fig"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#f0a43a"/><path d="M30 70 L55 25 L62 30 L40 75 Z" fill="#f4f7fb" stroke="#556" stroke-width="2"/><rect x="34" y="68" width="10" height="20" rx="3" transform="rotate(30 39 78)" fill="#8a5a3a"/></svg></figure>
      <p class="first">ウェブの画面を作るとき、多くの人はまず大きな道具箱を開く。部品の詰め合わせ、便利な関数の束、画面を組み立てる仕組み。それはそれで頼もしい。けれども、ブラウザそのものにも、思っている以上に多くの道具が最初から入っている。</p>
      <p>光を描くには canvas がある。音を鳴らすには Web Audio がある。立体を回すには CSS の 3D 変形と WebGL がある。文字を縦に組むことも、段に分けることも、図のまわりに回り込ませることも、数行の CSS で済む。</p>
      <blockquote class="pull">「何も足さずに、ここまで出来る」</blockquote>
      <p>この記事の段組みそのものも、その一例である。段の数は画面の幅に合わせてブラウザが決め、最初の字を大きく沈める飾りも、右の丸い図への回り込みも、CSS の指定だけで動いている。</p>
      <p>道具が小さいと、中で何が起きているかが見える。見えると、直せる。直せると、組み合わせられる。小さな部品をつないで大きなものを作る楽しさは、ここから始まる。</p>
      <p>明日もまた、新しい道具をひとつ作ってみよう。小さなナイフは、使うほど手になじんでいく。</p>
    </div></article>`,
  css: `body { background: #ebe6db; padding: 12px; } .tg { position: sticky; top: 0; z-index: 1; }
    .mag { background: #fffdf8; max-width: 1000px; margin: 8px auto; padding: 22px 26px; box-shadow: 0 4px 18px #0002; font: 15px/1.9 "Hiragino Mincho ProN", "Yu Mincho", serif; color: #2b2520; }
    .kicker { margin: 0; color: #c23b22; font: 700 12px system-ui, sans-serif; letter-spacing: .2em; }
    h1 { margin: .2em 0; font: 800 clamp(24px, 5vw, 40px)/1.3 "Hiragino Mincho ProN", "Yu Mincho", serif; text-wrap: balance; }
    .lead { margin: 0 0 1em; font-weight: 700; color: #554; border-bottom: 2px solid #2b2520; padding-bottom: .8em; }
    .body { column-width: 16em; column-gap: 2em; column-rule: 1px solid #e3dccd; }
    .body p { margin: 0 0 1em; text-indent: 1em; text-align: justify; }
    .first { text-indent: 0 !important; }
    .first::first-letter { float: left; font-size: 3.4em; line-height: 1; margin: .05em .1em 0 0; color: #c23b22; font-weight: 800; }
    @supports (initial-letter: 3) { .first::first-letter { float: none; initial-letter: 3; margin-right: .2em; } }
    .pull { column-span: all; margin: .6em 0 1.2em; padding: .5em 0; border-block: 3px double #2b2520; text-align: center; font: 800 clamp(20px, 4vw, 30px)/1.4 "Hiragino Mincho ProN", "Yu Mincho", serif; }
    .fig { float: right; width: 9em; height: 9em; margin: 0 0 .5em 1em; shape-outside: circle(50%); }
    .fig svg { width: 100%; height: 100%; }
    .v { writing-mode: vertical-rl; max-width: none; height: min(80vh, 640px); overflow-x: auto; } .v .body { column-width: auto; columns: auto; } .v .fig { float: left; margin: 0 .5em 1em 0; } .v .pull { border-block: 0; border-inline: 3px double #2b2520; }`,
  js() {
    document.getElementById('tg').onclick = (e) => { const v = document.getElementById('mag').classList.toggle('v'); e.target.textContent = v ? '横組みにする' : '縦組みにする'; };
  },
}, {
  id: 'sd-karplus', c: 'sound', lv: 3,
  t: '弦をはじく音（ギターのコード）', y: 'げんをはじくおとぎたーのこーど',
  tags: ['音の合成', 'ギター', 'カープラス・ストロング', 'Web Audio'],
  d: '雑音を短い輪の中で回しながら少しずつ平均していくと、本物の弦のような音になる。6本の弦をコードの押さえ方で少しずつずらしてはじき、ギターをかき鳴らす。弦を1本ずつ押して鳴らすこともでき、弦は鳴っている間だけ震える。',
  p: '輪の長さが音の高さを決める。毎周少しずつ高い音が削れていくので、はじいた直後は明るく、だんだん丸い音になる。',
  html: `<div class="gt"><div class="chords" id="chords"></div><svg id="neck" viewBox="0 0 600 220" aria-label="弦"></svg><div class="ui"><label>音の明るさ <input type="range" id="bright" min="0" max="1" step="0.05" value="0.6"></label><label><input type="checkbox" id="down" checked> 下向きにかき鳴らす</label></div></div>`,
  css: `body { background: #2b1d14; color: #f3e6d4; font: 13px system-ui, sans-serif; } .gt { padding: 10px; display: grid; gap: 8px; }
    .chords { display: flex; gap: 6px; flex-wrap: wrap; } .chords button { min-width: 52px; padding: 8px; border-radius: 10px; font-weight: 800; background: #f3e6d4; color: #2b1d14; border: 0; } .chords button.on { background: #ffd166; }
    svg { width: 100%; height: auto; background: linear-gradient(#5a3a22, #3e2716); border-radius: 10px; } .ui { display: flex; gap: 14px; flex-wrap: wrap; }`,
  js() {
    const OPEN = [40, 45, 50, 55, 59, 64], NAMES = ['6弦 E', '5弦 A', '4弦 D', '3弦 G', '2弦 B', '1弦 E'];
    const CHORDS = { C: [-1, 3, 2, 0, 1, 0], G: [3, 2, 0, 0, 0, 3], Am: [-1, 0, 2, 2, 1, 0], F: [1, 3, 3, 2, 1, 1], D: [-1, -1, 0, 2, 3, 2], Em: [0, 2, 2, 0, 0, 0], E: [0, 2, 2, 1, 0, 0], Dm: [-1, -1, 0, 2, 3, 1] };
    let ac = null, chord = 'C';
    const amp = [0, 0, 0, 0, 0, 0], svg = document.getElementById('neck');
    svg.innerHTML = '<g id="frets"></g>' + OPEN.map((_, i) => `<path id="s${i}" stroke="#e8d9b8" stroke-width="${3.4 - i * 0.45}" fill="none"/><rect data-s="${i}" x="0" y="${22 + i * 35}" width="600" height="30" fill="transparent" style="cursor:pointer"/>`).join('');
    document.getElementById('frets').innerHTML = Array.from({ length: 6 }, (_, k) => `<line x1="${60 + k * 100}" x2="${60 + k * 100}" y1="20" y2="210" stroke="#c8b08a" stroke-width="3"/>`).join('');
    // カープラス・ストロング法: 雑音を輪に入れ、隣と平均しながら回す
    function pluck(midi, when, gain = 0.5) {
      const sr = ac.sampleRate, len = Math.floor(sr * 3), buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0);
      const f = 440 * 2 ** ((midi - 69) / 12), N = Math.max(2, Math.round(sr / f)), ring = new Float32Array(N), b = +document.getElementById('bright').value;
      let lp = 0; for (let i = 0; i < N; i++) { const n = Math.random() * 2 - 1; lp += (n - lp) * (0.25 + b * 0.75); ring[i] = lp; }
      let idx = 0;
      for (let i = 0; i < len; i++) { const a = ring[idx], nx = ring[(idx + 1) % N]; d[i] = a; ring[idx] = 0.996 * 0.5 * (a + nx); idx = (idx + 1) % N; }
      const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf; g.gain.value = gain; s.connect(g).connect(ac.destination); s.start(when);
    }
    function strum(name) {
      ac = ac || new AudioContext();
      chord = name;
      document.querySelectorAll('.chords button').forEach((b) => b.classList.toggle('on', b.textContent === name));
      const shape = CHORDS[name], order = document.getElementById('down').checked ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
      order.forEach((s, k) => { if (shape[s] < 0) return; const when = ac.currentTime + k * 0.022; pluck(OPEN[s] + shape[s], when, 0.35); setTimeout(() => { amp[s] = 1; }, k * 22); });
    }
    const box = document.getElementById('chords');
    box.innerHTML = Object.keys(CHORDS).map((k) => `<button>${k}</button>`).join('');
    box.addEventListener('click', (e) => { if (e.target.matches('button')) strum(e.target.textContent); });
    svg.addEventListener('pointerdown', (e) => { const s = e.target.dataset.s; if (s === undefined) return; ac = ac || new AudioContext(); const fret = Math.max(0, CHORDS[chord][s]); pluck(OPEN[s] + fret, ac.currentTime, 0.5); amp[s] = 1; });
    addEventListener('keydown', (e) => { const k = Object.keys(CHORDS)[+e.key - 1]; if (k) strum(k); });
    (function draw(t) {
      OPEN.forEach((_, i) => {
        const y = 37 + i * 35, a = amp[i] * 7; amp[i] *= 0.97;
        let d = `M0 ${y}`; for (let x = 0; x <= 600; x += 10) d += ` L${x} ${(y + Math.sin((x / 600) * Math.PI) * Math.sin(t / 18 + i) * a).toFixed(1)}`;
        document.getElementById('s' + i).setAttribute('d', d);
      });
      requestAnimationFrame(draw);
    })(0);
    if (window.THUMB) setInterval(() => { for (let i = 0; i < 6; i++) amp[i] = 1; }, 900);
  },
}, {
  id: 'sd-wind-chime', c: 'sound', lv: 3,
  t: '風に揺れて鳴る風鈴', y: 'かぜにゆれてなるふうりん',
  tags: ['風鈴', '音の合成', '振り子', 'Web Audio'],
  d: '短冊が風を受けて揺れ、つながった舌（ぜつ）が鈴の縁に当たると「チリン」と鳴る。鳴り方の強さは当たる勢いで変わり、風の強さはつまみで変えられる。画面を押すと、ひと吹きの風が来る。',
  p: 'ガラスの鈴の音は、高さが整数倍に並ばない4つの音を重ねて作る。それぞれ消えるまでの長さを変えると、澄んだ余韻になる。',
  html: `<canvas id="c"></canvas><div class="ui"><button id="go">音を出す</button><label>風 <input type="range" id="wind" min="0" max="1" step="0.05" value="0.35"></label></div>`,
  css: `body { background: linear-gradient(#ffb36b, #f7e3b5 45%, #a8d8ea); overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; cursor: pointer; } .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 10px; align-items: center; font: 12px system-ui, sans-serif; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let ac = null, phi = 0, w = 0, beta = 0, gust = 0, lastDing = 0;
    function ding(vol) {
      if (!ac || performance.now() - lastDing < 90) return;
      lastDing = performance.now();
      const t = ac.currentTime, f0 = 1900 + Math.random() * 60;
      [[1, 1, 3.2], [2.32, 0.5, 1.6], [4.25, 0.3, 0.9], [6.63, 0.18, 0.5]].forEach(([r, a, dur]) => {
        const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f0 * r;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * vol * 0.25, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
      });
    }
    document.getElementById('go').onclick = (e) => { ac = ac || new AudioContext(); ac.resume(); e.target.textContent = '音が出ています'; ding(0.8); };
    c.addEventListener('pointerdown', () => { ac = ac || new AudioContext(); gust = 1.6; });
    let last = performance.now();
    (function loop(now) {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const dt = Math.min(0.033, (now - last) / 1000); last = now;
      const wind = +document.getElementById('wind').value;
      gust *= 0.97; if (Math.random() < wind * 0.02) gust = Math.max(gust, wind * (0.5 + Math.random()));
      // 舌の振り子: 風の力・重力・空気の抵抗
      const force = (wind * 0.6 + gust) * (0.6 + 0.4 * Math.sin(now / 370) * Math.sin(now / 910)) * 6;
      w += (force - 9 * Math.sin(phi) - 0.9 * w) * dt; phi += w * dt;
      beta += ((wind * 0.08 + gust * 0.05) * Math.sin(now / 800) - beta) * dt * 2;
      const LIM = 0.32;
      if (Math.abs(phi - beta) > LIM) { const rel = Math.abs(w); phi = beta + Math.sign(phi - beta) * LIM; w = -w * 0.45; if (rel > 0.25) ding(Math.min(1, rel / 2)); }
      x.clearRect(0, 0, W, H);
      const s = Math.min(W, H) / 400, cx = W / 2, top = H * 0.12;
      x.strokeStyle = '#555'; x.lineWidth = 1.5 * s; x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, top); x.stroke();
      x.save(); x.translate(cx, top); x.rotate(beta);
      // 鈴（ガラス）
      const g = x.createLinearGradient(-60 * s, 0, 60 * s, 0); g.addColorStop(0, '#ffffffaa'); g.addColorStop(0.5, '#e0f4ffdd'); g.addColorStop(1, '#ffffff88');
      x.fillStyle = g; x.strokeStyle = '#8ab'; x.lineWidth = 1.5 * s;
      x.beginPath(); x.moveTo(-60 * s, 70 * s); x.bezierCurveTo(-62 * s, 0, 62 * s, 0, 60 * s, 70 * s); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#e0533f'; for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse((-30 + k * 30) * s, 45 * s, 9 * s, 5 * s, 0.3, 0, 7); x.fill(); }
      // 舌と短冊
      x.save(); x.translate(0, 20 * s); x.rotate(phi - beta);
      x.strokeStyle = '#444'; x.lineWidth = 1 * s; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 140 * s); x.stroke();
      x.fillStyle = '#f2c14e'; x.fillRect(-5 * s, 50 * s, 10 * s, 14 * s);
      x.translate(0, 140 * s); x.rotate((phi - beta) * 0.8 + Math.sin(now / 140) * gust * 0.05);
      x.fillStyle = '#c23b22'; x.fillRect(-20 * s, 0, 40 * s, 110 * s);
      x.fillStyle = '#fff'; x.font = `${22 * s}px serif`; x.textAlign = 'center'; x.fillText('夏', 0, 40 * s); x.fillText('風', 0, 75 * s);
      x.restore(); x.restore();
      requestAnimationFrame(loop);
    })(last);
  },
}, {
  id: 'gm-air-hockey', c: 'game', lv: 2,
  t: 'コンピューターと対戦するエアホッケー', y: 'こんぴゅーたーとたいせんするえあほっけー',
  tags: ['エアホッケー', '衝突', '対戦', 'ゲーム'],
  d: '手前の丸い打具をマウスか指で動かし、パックを相手のゴールへ打ち込む。打具を動かす勢いがそのままパックに伝わる。相手はパックの位置を見て守りと攻めを切り替える。先に7点取った方の勝ち。',
  p: '打具とパックの衝突は「2つの円の中心を結ぶ向き」で跳ね返す。打具の速さを差し引いた相対速度で計算すると、振り抜いたときに強く飛ぶ。',
  html: `<canvas id="c"></canvas><p class="sc" id="sc"></p>`,
  css: `body { background: #12202e; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; touch-action: none; cursor: none; } .sc { position: fixed; left: 10px; top: 8px; margin: 0; color: #fff; font: 800 18px ui-monospace, monospace; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let T, puck, me, cpu, score = [0, 0], msg = '', pause = 0;
    // 画面が極端に小さい（0 のこともある）ときも台の大きさが負にならないよう、下限を付ける
    const tbl = () => { const H = Math.max(100, innerHeight - 20), W = Math.max(60, Math.min(innerWidth - 20, H * 0.6)), h = Math.min(H, W / 0.6); return { x: (innerWidth - W) / 2, y: (innerHeight - h) / 2, w: W, h }; };
    function serve(toMe) { T = tbl(); puck = { x: T.x + T.w / 2, y: T.y + T.h / 2, vx: (Math.random() - 0.5) * 2, vy: toMe ? 3 : -3, r: T.w * 0.035 }; }
    T = tbl(); me = { x: T.x + T.w / 2, y: T.y + T.h * 0.85, vx: 0, vy: 0, r: T.w * 0.065 }; cpu = { x: T.x + T.w / 2, y: T.y + T.h * 0.15, vx: 0, vy: 0, r: T.w * 0.065 };
    serve(true);
    let target = [me.x, me.y];
    c.addEventListener('pointermove', (e) => { target = [e.clientX, e.clientY]; });
    c.addEventListener('pointerdown', (e) => { target = [e.clientX, e.clientY]; if (msg.includes('勝')) { score = [0, 0]; msg = ''; serve(true); } });
    function moveTo(p, tx, ty, maxV, ymin, ymax) {
      const nx = Math.max(T.x + p.r, Math.min(T.x + T.w - p.r, tx)), ny = Math.max(ymin + p.r, Math.min(ymax - p.r, ty));
      let dx = nx - p.x, dy = ny - p.y; const d = Math.hypot(dx, dy); if (d > maxV) { dx *= maxV / d; dy *= maxV / d; }
      p.vx = dx; p.vy = dy; p.x += dx; p.y += dy;
    }
    function hit(p) {
      const dx = puck.x - p.x, dy = puck.y - p.y, d = Math.hypot(dx, dy), min = puck.r + p.r;
      if (d >= min || d === 0) return;
      const nx = dx / d, ny = dy / d; puck.x = p.x + nx * min; puck.y = p.y + ny * min;
      const rv = (puck.vx - p.vx) * nx + (puck.vy - p.vy) * ny;
      if (rv < 0) { puck.vx -= 1.9 * rv * nx; puck.vy -= 1.9 * rv * ny; }
      const sp = Math.hypot(puck.vx, puck.vy), mx = T.w * 0.05; if (sp > mx) { puck.vx *= mx / sp; puck.vy *= mx / sp; }
    }
    (function loop() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; T = tbl(); }
      const goal = T.w * 0.36, gx0 = T.x + (T.w - goal) / 2, gx1 = gx0 + goal, mid = T.y + T.h / 2;
      if (window.THUMB) target = [puck.x + Math.sin(performance.now() / 300) * 20, Math.max(mid + 40, puck.y + 30)];
      moveTo(me, target[0], target[1], T.w * 0.06, mid, T.y + T.h);
      // 相手: 自分の陣地にパックがあれば打ちに行き、なければゴール前へ戻る
      const attack = puck.y < mid && puck.vy < 2;
      moveTo(cpu, attack ? puck.x : T.x + T.w / 2 + (puck.x - (T.x + T.w / 2)) * 0.5, attack ? puck.y - puck.r : T.y + T.h * 0.12, T.w * 0.018, T.y, mid);
      if (pause > 0) pause--;
      else {
        for (let k = 0; k < 2; k++) {
          puck.x += puck.vx / 2; puck.y += puck.vy / 2;
          if (puck.x < T.x + puck.r || puck.x > T.x + T.w - puck.r) { puck.vx *= -0.95; puck.x = Math.max(T.x + puck.r, Math.min(T.x + T.w - puck.r, puck.x)); }
          const inGoal = puck.x > gx0 && puck.x < gx1;
          if (puck.y < T.y + puck.r && !inGoal) { puck.vy *= -0.95; puck.y = T.y + puck.r; }
          if (puck.y > T.y + T.h - puck.r && !inGoal) { puck.vy *= -0.95; puck.y = T.y + T.h - puck.r; }
          hit(me); hit(cpu);
        }
        puck.vx *= 0.996; puck.vy *= 0.996;
        if (puck.y < T.y - puck.r) { score[0]++; msg = score[0] >= 7 ? 'あなたの勝ち！ 押すともう一度' : 'ゴール！'; pause = 40; serve(false); }
        if (puck.y > T.y + T.h + puck.r) { score[1]++; msg = score[1] >= 7 ? 'コンピューターの勝ち 押すともう一度' : '取られた…'; pause = 40; serve(true); }
        if ((score[0] >= 7 || score[1] >= 7) && window.THUMB) score = [0, 0];
      }
      x.fillStyle = '#12202e'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#e8f3fb'; x.beginPath(); x.roundRect(T.x, T.y, T.w, T.h, 20); x.fill();
      x.strokeStyle = '#c23b2280'; x.lineWidth = 3; x.beginPath(); x.moveTo(T.x, mid); x.lineTo(T.x + T.w, mid); x.stroke(); x.beginPath(); x.arc(T.x + T.w / 2, mid, T.w * 0.15, 0, 7); x.stroke();
      x.fillStyle = '#12202e'; x.fillRect(gx0, T.y - 4, goal, 8); x.fillRect(gx0, T.y + T.h - 4, goal, 8);
      const disc = (p, col) => { x.fillStyle = col; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill(); x.fillStyle = '#fff5'; x.beginPath(); x.arc(p.x, p.y, p.r * 0.45, 0, 7); x.fill(); };
      disc(cpu, '#26407c'); disc(me, '#c23b22');
      x.fillStyle = '#222'; x.beginPath(); x.arc(puck.x, puck.y, puck.r, 0, 7); x.fill();
      document.getElementById('sc').textContent = `あなた ${score[0]} − ${score[1]} コンピューター　${pause > 0 || msg.includes('勝') ? msg : ''}`;
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'gm-hanoi', c: 'game', lv: 2,
  t: 'ハノイの塔', y: 'はのいのとう',
  tags: ['パズル', '再帰', 'ジェネレーター', 'ゲーム'],
  d: '左の棒に積まれた円盤を、すべて右の棒へ移す。一度に動かせるのは一番上の1枚だけで、小さい円盤の上に大きい円盤は置けない。棒を2回押して動かす（キーボードは 1・2・3）。「自動で解く」で最短の手順を見せる。',
  p: '解き方は「上の n−1 枚を真ん中へ、一番下を右へ、n−1 枚を右へ」の3行の再帰。function* で手を1つずつ取り出すと、好きな速さで再生できる。',
  html: `<div class="hn"><div class="ui"><label>枚数 <select id="n"><option>3</option><option selected>4</option><option>5</option><option>6</option><option>7</option></select></label><button id="solve">自動で解く</button><button id="reset">やり直す</button><span id="info"></span></div><div class="board" id="board"><button class="peg" data-p="0" aria-label="左の棒"></button><button class="peg" data-p="1" aria-label="真ん中の棒"></button><button class="peg" data-p="2" aria-label="右の棒"></button></div></div>`,
  css: `body { background: #f1ece2; font: 13px system-ui, sans-serif; } .hn { padding: 10px; display: grid; gap: 10px; } .ui { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .board { position: relative; height: 260px; display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 10px solid #8a5a3a; }
    .peg { position: relative; background: none; border: 0; border-radius: 8px; } .peg::before { content: ''; position: absolute; left: 50%; bottom: 0; width: 10px; height: 85%; margin-left: -5px; background: #a9784f; border-radius: 5px 5px 0 0; }
    .peg.sel { background: #ffd16655; } .peg:focus-visible { outline: 3px solid #26407c; }
    .disk { position: absolute; height: 24px; border-radius: 12px; transition: left .25s, bottom .25s; box-shadow: inset 0 -4px #0002; pointer-events: none; }
    .disk.up { bottom: 236px !important; }`,
  js() {
    const board = document.getElementById('board'), pegs = [...board.querySelectorAll('.peg')];
    let n, towers, disks, sel = null, moves = 0, timer = 0;
    function reset() {
      clearInterval(timer); n = +document.getElementById('n').value; towers = [Array.from({ length: n }, (_, i) => n - i), [], []]; moves = 0; sel = null;
      board.querySelectorAll('.disk').forEach((d) => d.remove());
      disks = {};
      for (let s = 1; s <= n; s++) { const d = document.createElement('div'); d.className = 'disk'; d.style.background = `hsl(${(s * 360) / n} 70% 55%)`; board.append(d); disks[s] = d; }
      place();
    }
    function place() {
      const W = board.clientWidth / 3;
      towers.forEach((t, p) => t.forEach((s, h) => { const d = disks[s], w = W * (0.3 + (0.65 * s) / n); d.style.width = w + 'px'; d.style.left = p * W + (W - w) / 2 + 'px'; d.style.bottom = h * 26 + 'px'; d.classList.toggle('up', sel === p && h === t.length - 1); }));
      pegs.forEach((g, p) => g.classList.toggle('sel', sel === p));
      const done = towers[2].length === n;
      document.getElementById('info').textContent = `${moves} 手（最短は ${2 ** n - 1} 手）${done ? ' ・ 完成！' : ''}`;
    }
    function move(a, b) {
      const ta = towers[a], tb = towers[b];
      if (!ta.length || (tb.length && tb[tb.length - 1] < ta[ta.length - 1])) return false;
      tb.push(ta.pop()); moves++; return true;
    }
    function press(p) {
      if (sel === null) { if (towers[p].length) sel = p; }
      else { if (sel !== p) move(sel, p); sel = null; }
      place();
    }
    pegs.forEach((g, p) => g.addEventListener('click', () => press(p)));
    addEventListener('keydown', (e) => { if ('123'.includes(e.key) && e.key) press(+e.key - 1); });
    function* solve(k, from, to, via) { if (!k) return; yield* solve(k - 1, from, via, to); yield [from, to]; yield* solve(k - 1, via, to, from); }
    document.getElementById('solve').onclick = () => {
      reset();
      const it = solve(n, 0, 2, 1);
      timer = setInterval(() => { const r = it.next(); if (r.done) { clearInterval(timer); return; } move(...r.value); place(); }, Math.max(80, 600 - n * 70));
    };
    document.getElementById('reset').onclick = reset;
    document.getElementById('n').onchange = reset;
    addEventListener('resize', place);
    reset();
    if (window.THUMB) { document.getElementById('solve').click(); setInterval(() => { if (towers[2].length === n) document.getElementById('solve').click(); }, 1500); }
  },
}, {
  id: 'gm-shiritori', c: 'game', lv: 2,
  t: 'コンピューターとしりとり', y: 'こんぴゅーたーとしりとり',
  tags: ['しりとり', '言葉遊び', 'ひらがな', 'IME'],
  d: 'ひらがなかカタカナで言葉を入れると、コンピューターが続きの言葉を返す。「ー」で終わる言葉は1つ前の字から、「ゃ」のような小さい字は大きい字にして続ける。同じ言葉は2度使えず、「ん」で終わったら負け。コンピューターが言葉に詰まったら勝ち。',
  p: '日本語入力の変換中に押した Enter で送られないよう、isComposing を見て、変換が確定してからの Enter だけを受け付ける。',
  core() {
    const SMALL = { ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', っ: 'つ', ゎ: 'わ', ゕ: 'か', ゖ: 'け' };
    // カタカナ → ひらがな（全角に直してから）
    function toHira(s) { return s.normalize('NFKC').replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)); }
    // しりとりで次に続ける字: 最後の「ー」は飛ばし、小さい字は大きくする
    function tailKana(word) {
      const cs = [...toHira(word.trim())];
      while (cs.length > 1 && cs[cs.length - 1] === 'ー') cs.pop();
      const last = cs[cs.length - 1] || '';
      return SMALL[last] || last;
    }
    function checkMove(prev, word, used) {
      const w = toHira(word.trim());
      if (!/^[ぁ-ゖー]+$/.test(w) || [...w].length < 2) return { ok: false, lose: false, reason: 'ひらがなかカタカナで、2文字以上の言葉を入れてください' };
      if (prev && w[0] !== tailKana(prev)) return { ok: false, lose: false, reason: `「${tailKana(prev)}」から始まる言葉にしてください` };
      if (used.includes(w)) return { ok: false, lose: false, reason: 'その言葉はもう使いました' };
      if (tailKana(w) === 'ん') return { ok: true, lose: true, reason: '「ん」で終わったので負けです' };
      return { ok: true, lose: false, reason: '' };
    }
  },
  html: `<div class="sr"><ol id="log" aria-live="polite"></ol><form id="f"><input id="w" autocomplete="off" placeholder="ことばを入れる" aria-label="ことば"><button>言う</button><button type="button" id="re">はじめから</button></form><p id="msg"></p></div>`,
  css: `body { background: #fdf6e6; font: 15px system-ui, sans-serif; } .sr { max-width: 520px; margin: 0 auto; padding: 10px; display: grid; gap: 8px; }
    ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 62vh; overflow: auto; }
    li { padding: 6px 12px; border-radius: 14px; width: fit-content; max-width: 80%; } li.me { justify-self: end; background: #c23b22; color: #fff; } li.cpu { background: #fff; box-shadow: 0 1px 3px #0002; }
    li b { font-size: 1.15em; } li small { opacity: .75; margin-left: 6px; }
    form { display: flex; gap: 6px; } form input { flex: 1; min-width: 0; font-size: 16px; } #msg { margin: 0; color: #c23b22; min-height: 1.4em; }`,
  js() {
    const WORDS = 'あめ あひる あさがお あり あたま あし あいす あくび いぬ いか いちご いす いるか いのしし いと いけ うさぎ うし うみ うちわ うま うめ えんぴつ えび えき えのぐ おに おにぎり おばけ おりがみ おもち おかし かめ かさ かえる からす かき かがみ かぼちゃ かみなり きつね きのこ きって きもの きゅうり くま くり くじら くつ くるま くも けむし けいと けしごむ けいさつ こま こあら こども こおり こけし ことり さる さかな さくら さとう さいふ しか しまうま しろ しお しゃもじ すいか すずめ すし すな すいとう せみ せんたく そら そり そば そうじき たこ たぬき たまご たいこ たけ ちず ちくわ ちょう ちきゅう つき つくえ つばめ つる つみき てがみ てぶくろ てれび とけい とら とまと とり なす なし なべ なみ なまず にわとり にじ にもつ ぬいぐるみ ぬりえ ぬの ねこ ねずみ ねぎ のり のこぎり のーと はさみ はと はし はな はち はがき ひこうき ひよこ ひつじ ひまわり ひげ ふね ふくろう ふえ へび へいわ へちま ほし ほたる ほうき ほね まど まくら まめ まり まつり みみ みず みそしる むし むぎ むら めがね めだか もも もぐら もち もり やま やさい やぎ ゆき ゆびわ ゆかた よる よっと ようふく らっこ らくだ らっぱ らじお りす りぼん りゅう るす るびー るーる れたす れいぞうこ ろうそく ろけっと ろば わに わかめ わたあめ わなげ がっこう がいこつ ぎたー ぐみ げた ごりら ごま ざりがに じしょ ずかん ぜりー ぞう だるま でんわ どんぐり どあ ばなな ばす びすけっと ぶどう べんとう ぼうし ぼーる ぱんだ ぴあの ぷりん ぽすと'.split(' ');
    const log = document.getElementById('log'), msg = document.getElementById('msg'), input = document.getElementById('w');
    let prev = '', used = [], over = false;
    const say = (who, w, note = '') => { const li = document.createElement('li'); li.className = who; li.innerHTML = '<b></b><small></small>'; li.querySelector('b').textContent = w; li.querySelector('small').textContent = note; log.append(li); log.scrollTop = log.scrollHeight; };
    function start() { log.innerHTML = ''; used = []; over = false; prev = 'しりとり'; say('cpu', 'しりとり', '「り」からどうぞ'); msg.textContent = ''; if (!window.THUMB) input.focus(); }
    function cpuTurn() {
      const head = tailKana(prev), cand = WORDS.filter((w) => w[0] === head && !used.includes(w) && tailKana(w) !== 'ん');
      if (!cand.length) { say('cpu', 'まいりました…', `「${head}」の言葉が出てきません`); msg.textContent = 'あなたの勝ち！'; over = true; return; }
      const w = cand[Math.floor(Math.random() * cand.length)];
      used.push(w); prev = w; say('cpu', w, `次は「${tailKana(w)}」`);
    }
    document.getElementById('f').addEventListener('submit', (e) => {
      e.preventDefault();
      if (over) return;
      const r = checkMove(prev, input.value, used);
      if (!r.ok) { msg.textContent = r.reason; return; }
      const w = input.value.normalize('NFKC').replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).trim();
      used.push(w); prev = w; say('me', input.value.trim()); input.value = ''; msg.textContent = '';
      if (r.lose) { msg.textContent = r.reason; over = true; return; }
      setTimeout(cpuTurn, 500);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.preventDefault(); });
    document.getElementById('re').onclick = start;
    start();
    if (window.THUMB) setInterval(() => { if (over) start(); const head = tailKana(prev), c = WORDS.find((w) => w[0] === head && !used.includes(w) && tailKana(w) !== 'ん'); if (c) { input.value = c; document.getElementById('f').requestSubmit(); } else start(); }, 1300);
  },
}, {
  id: 'mt-convex-hull', c: 'math', lv: 3,
  t: '点を包む輪（凸包）を作る手順', y: 'てんをつつむわとつほうをつくるてじゅん',
  tags: ['凸包', '計算幾何', 'アルゴリズム', '外積'],
  d: 'ばらまいた点を、ゴムひもで囲んだような一番外側の輪（凸包）を求める手順を、1手ずつ見せる。点を左から順に見ていき、内側へ曲がってしまう点は外す。点は画面を押して足したり、つかんで動かしたりできる。',
  p: '3点が「左回りか右回りか」は外積の符号1つで分かる。点を x の順に並べてから、下側と上側を別々に作る（アンドリューの方法）。',
  html: `<canvas id="c"></canvas><div class="ui"><button id="play">手順を見る</button><button id="all">一気に</button><button id="rnd">点を作り直す</button><span id="info"></span></div>`,
  css: `body { background: #0f1420; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; touch-action: none; } .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 8px; align-items: center; color: #bcd; font: 12px system-ui, sans-serif; flex-wrap: wrap; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let pts = [], steps = [], at = -1, timer = 0;
    const rnd = () => { pts = Array.from({ length: 28 }, () => [0.12 + Math.random() * 0.76, 0.15 + Math.random() * 0.75]); compute(); at = steps.length - 1; };
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    // 手順を全部記録しておき、再生で1つずつ見せる
    function compute() {
      const P = pts.map((p, i) => [...p, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      steps = [];
      const half = (list) => { const st = []; for (const p of list) { while (st.length >= 2 && cross(st[st.length - 2], st[st.length - 1], p) <= 0) { steps.push({ st: st.map((q) => q[2]), cand: p[2], pop: st[st.length - 1][2] }); st.pop(); } st.push(p); steps.push({ st: st.map((q) => q[2]), cand: p[2] }); } return st; };
      const lower = half(P), lowIds = lower.map((q) => q[2]);
      const upper = half([...P].reverse());
      steps.push({ hull: [...lowIds.slice(0, -1), ...upper.map((q) => q[2]).slice(0, -1)] });
    }
    function draw() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      x.clearRect(0, 0, W, H);
      const P = (i) => [pts[i][0] * W, pts[i][1] * H], s = steps[Math.max(0, at)];
      if (s && s.hull) { x.fillStyle = '#ffd16622'; x.strokeStyle = '#ffd166'; x.lineWidth = 3; x.beginPath(); s.hull.forEach((i, k) => x[k ? 'lineTo' : 'moveTo'](...P(i))); x.closePath(); x.fill(); x.stroke(); }
      else if (s) {
        x.strokeStyle = '#5aa9ff'; x.lineWidth = 3; x.beginPath(); s.st.forEach((i, k) => x[k ? 'lineTo' : 'moveTo'](...P(i))); x.stroke();
        if (s.pop !== undefined) { x.strokeStyle = '#ff5d5d'; x.setLineDash([6, 5]); x.beginPath(); x.moveTo(...P(s.st[s.st.length - 2])); x.lineTo(...P(s.pop)); x.lineTo(...P(s.cand)); x.stroke(); x.setLineDash([]); }
        x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.arc(...P(s.cand), 11, 0, 7); x.stroke();
      }
      pts.forEach((_, i) => { x.fillStyle = s && s.pop === i ? '#ff5d5d' : '#e8eef8'; x.beginPath(); x.arc(...P(i), 5, 0, 7); x.fill(); });
      document.getElementById('info').textContent = s ? (s.hull ? `完成: 外側の点は ${s.hull.length} 個 / 全部で ${pts.length} 個` : `${at + 1} / ${steps.length} 手目 ${s.pop !== undefined ? '・ 内側へ曲がるので外す' : '・ 輪に足す'}`) : '';
    }
    function play() { clearInterval(timer); at = -1; timer = setInterval(() => { at++; draw(); if (at >= steps.length - 1) clearInterval(timer); }, 260); }
    document.getElementById('play').onclick = play;
    document.getElementById('all').onclick = () => { clearInterval(timer); at = steps.length - 1; draw(); };
    document.getElementById('rnd').onclick = () => { clearInterval(timer); rnd(); draw(); };
    let drag = -1;
    c.addEventListener('pointerdown', (e) => {
      const px = e.clientX / innerWidth, py = e.clientY / innerHeight;
      drag = pts.findIndex((p) => Math.hypot((p[0] - px) * innerWidth, (p[1] - py) * innerHeight) < 14);
      if (drag < 0) { pts.push([px, py]); drag = pts.length - 1; }
      clearInterval(timer); compute(); at = steps.length - 1; draw(); c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => { if (drag < 0) return; pts[drag] = [e.clientX / innerWidth, e.clientY / innerHeight]; compute(); at = steps.length - 1; draw(); });
    c.addEventListener('pointerup', () => { drag = -1; });
    addEventListener('resize', draw);
    rnd(); draw();
    if (window.THUMB) setInterval(() => { if (at >= steps.length - 1) { rnd(); play(); } }, 1500);
  },
}, {
  id: 'mt-collatz', c: 'math', lv: 2,
  t: 'コラッツの数列が描く珊瑚', y: 'こらっつのすうれつがえがくさんご',
  tags: ['コラッツ予想', '数列', '可視化', '数学'],
  d: '「偶数なら2で割る、奇数なら3倍して1を足す」を繰り返すと、どの数も最後は1になると考えられている（コラッツ予想）。1から逆にたどり、偶数なら左、奇数なら右へ少し曲がる線を何千本も重ねると、海の中の珊瑚のような形が現れる。',
  p: '線はどれも1から出発するので、共通の道筋ほど何度も重ねて描かれて濃くなる。曲がる角度を変えると形ががらりと変わる。',
  html: `<canvas id="c"></canvas><div class="ui"><label>偶数で曲がる <input type="range" id="ea" min="0" max="0.4" step="0.005" value="0.15"></label><label>奇数で曲がる <input type="range" id="oa" min="0" max="0.6" step="0.005" value="0.3"></label><label>本数 <input type="range" id="n" min="200" max="8000" step="100" value="3000"></label><label>調べる数 <input type="number" id="q" value="27" min="1" style="width:6em"></label><span id="info"></span></div>`,
  css: `body { background: #04141c; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; } .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 10px; flex-wrap: wrap; color: #9cc; font: 12px system-ui, sans-serif; align-items: center; } .ui input[type=range] { width: 90px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), $ = (id) => document.getElementById(id);
    let job = 0;
    const seq = (n) => { const s = [n]; while (n !== 1) { n = n % 2 ? 3 * n + 1 : n / 2; s.push(n); } return s; };
    function run() {
      const id = ++job, W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      c.width = W; c.height = H;
      const ea = +$('ea').value, oa = +$('oa').value, N = +$('n').value, L = Math.min(W, H) / 70;
      x.fillStyle = '#04141c'; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'lighter'; x.lineWidth = 1;
      let n = 1;
      const path = (num, style, width) => {
        const s = seq(num).reverse(); let px = W * 0.35, py = H, a = -Math.PI / 2;
        x.strokeStyle = style; x.lineWidth = width; x.beginPath(); x.moveTo(px, py);
        for (let k = 1; k < s.length; k++) { a += s[k] % 2 ? -oa : ea; px += Math.cos(a) * L; py += Math.sin(a) * L; x.lineTo(px, py); }
        x.stroke();
      };
      (function chunk() {
        if (id !== job) return;
        for (let k = 0; k < 150 && n <= N; k++, n++) path(n, `hsla(${170 + (n / N) * 90}, 80%, 55%, .05)`, 1);
        if (n <= N) requestAnimationFrame(chunk);
        else { x.globalCompositeOperation = 'source-over'; const q = Math.max(1, Math.floor(+$('q').value)), s = seq(q); path(q, '#ffd166', 2.5); $('info').textContent = `${q} は ${s.length - 1} 回で 1 になる（途中の最大 ${Math.max(...s).toLocaleString('ja-JP')}）`; }
      })();
    }
    for (const id of ['ea', 'oa', 'n', 'q']) $(id).addEventListener('change', run);
    let tm = 0; addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(run, 200); });
    run();
  },
}, {
  id: 'dt-mini-sql', c: 'data', lv: 3,
  t: 'ブラウザの中で動く小さなSQL', y: 'ぶらうざのなかでうごくちいさなえすきゅーえる',
  tags: ['SQL', '構文解析', 'データベース', '集計'],
  d: '表を相手に、SELECT・WHERE・GROUP BY・ORDER BY・LIMIT を使った問い合わせができる。条件には AND・OR・NOT・かっこ・LIKE、集計には COUNT・SUM・AVG・MIN・MAX が使える。間違いがあると日本語で場所を教える。',
  p: '文をまず単語に分け、SELECT の後ろ、FROM の後ろ…と順に読んでいく。WHERE の条件は「行を受け取って真か偽を返す関数」に組み立ててから、表に当てる。',
  core() {
    function tokenize(sql) {
      const re = /\s*(?:('(?:[^']|'')*')|(\d+(?:\.\d+)?)|([A-Za-z_\u3040-\u30ff\u4e00-\u9fff][\w\u3040-\u30ff\u4e00-\u9fff]*)|(<=|>=|<>|!=|[=<>(),*]))/y;
      const out = [];
      let i = 0;
      while (i < sql.length) {
        re.lastIndex = i;
        const m = re.exec(sql);
        if (!m) { if (/^\s*$/.test(sql.slice(i))) break; throw new Error(`「${sql.slice(i).trim().slice(0, 10)}」の所が読めません`); }
        i = re.lastIndex;
        if (m[1]) out.push({ t: 'str', v: m[1].slice(1, -1).replace(/''/g, "'") });
        else if (m[2]) out.push({ t: 'num', v: +m[2] });
        else if (m[3]) out.push({ t: 'id', v: m[3], u: m[3].toUpperCase() });
        else out.push({ t: 'op', v: m[4] });
      }
      return out;
    }
    const AGG = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
    function compare(a, b) { return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ja'); }
    function runSql(sql, tables) {
      const T = tokenize(sql.trim().replace(/;\s*$/, ''));
      let p = 0;
      const kw = (w) => T[p] && T[p].t === 'id' && T[p].u === w, isOp = (v) => T[p] && T[p].t === 'op' && T[p].v === v, take = () => T[p++];
      const expect = (w) => { if (!kw(w)) throw new Error(`${w} が必要です`); p++; };
      expect('SELECT');
      const sel = [];
      do {
        if (isOp('*')) { take(); sel.push({ star: true }); continue; }
        const t = take();
        if (!t) throw new Error('選ぶ列が必要です');
        let item;
        if (t.t === 'id' && AGG.includes(t.u) && isOp('(')) {
          take(); let arg = '*';
          if (isOp('*')) take(); else { const a = take(); if (!a || a.t !== 'id') throw new Error('集計する列が必要です'); arg = a.v; }
          if (!isOp(')')) throw new Error(') が必要です'); take();
          item = { agg: t.u, arg, label: `${t.u}(${arg})` };
        } else if (t.t === 'id' && !['FROM'].includes(t.u)) item = { col: t.v, label: t.v };
        else throw new Error(`「${t.v}」は列の名前ではありません`);
        if (kw('AS')) { take(); item.alias = take().v; }
        sel.push(item);
      } while (isOp(',') && take());
      expect('FROM');
      const tn = take();
      if (!tn || !tables[tn.v]) throw new Error(`表「${tn ? tn.v : ''}」はありません`);
      const rows = tables[tn.v], cols = Object.keys(rows[0] || {});
      const needCol = (c) => { if (!cols.includes(c)) throw new Error(`列「${c}」はありません`); return c; };
      // 条件式を「行 → 真偽」の関数に組み立てる
      function value() {
        const t = take();
        if (!t) throw new Error('値が必要です');
        if (t.t === 'num' || t.t === 'str') return () => t.v;
        if (t.t === 'id') { needCol(t.v); return (r) => r[t.v]; }
        throw new Error(`「${t.v}」が読めません`);
      }
      function cmp() {
        if (isOp('(')) { take(); const e = orExpr(); if (!isOp(')')) throw new Error(') が必要です'); take(); return e; }
        const l = value();
        if (kw('LIKE')) { take(); const pat = value(); return (r) => new RegExp('^' + String(pat(r)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$').test(String(l(r))); }
        const op = take();
        if (!op || op.t !== 'op' || !['=', '!=', '<>', '<', '>', '<=', '>='].includes(op.v)) throw new Error('比べる記号（= < > など）が必要です');
        const rv = value();
        return (r) => { const c = compare(l(r), rv(r)); return { '=': c === 0, '!=': c !== 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[op.v]; };
      }
      function notExpr() { if (kw('NOT')) { take(); const e = notExpr(); return (r) => !e(r); } return cmp(); }
      function andExpr() { let a = notExpr(); while (kw('AND')) { take(); const b = notExpr(), A = a; a = (r) => A(r) && b(r); } return a; }
      function orExpr() { let a = andExpr(); while (kw('OR')) { take(); const b = andExpr(), A = a; a = (r) => A(r) || b(r); } return a; }
      let where = null, group = null, limit = Infinity;
      const order = [];
      if (kw('WHERE')) { take(); where = orExpr(); }
      if (kw('GROUP')) { take(); expect('BY'); const g = take(); if (!g || g.t !== 'id') throw new Error('まとめる列が必要です'); group = needCol(g.v); }
      if (kw('ORDER')) { take(); expect('BY'); do { const o = take(); if (!o || o.t !== 'id') throw new Error('並べ替える列が必要です'); let desc = false; if (kw('DESC')) { take(); desc = true; } else if (kw('ASC')) take(); order.push({ c: o.v, desc }); } while (isOp(',') && take()); }
      if (kw('LIMIT')) { take(); const n = take(); if (!n || n.t !== 'num') throw new Error('LIMIT の後には数が必要です'); limit = n.v; }
      if (p < T.length) throw new Error(`「${T[p].v}」の所が読めません`);
      const items = sel.flatMap((s) => (s.star ? cols.map((c) => ({ col: c, label: c })) : [s]));
      items.forEach((s) => { if (s.col) needCol(s.col); if (s.agg && s.arg !== '*') needCol(s.arg); });
      const names = items.map((s) => s.alias || s.label);
      const data = where ? rows.filter(where) : rows.slice();
      const agg = (s, g) => {
        if (s.agg === 'COUNT') return s.arg === '*' ? g.length : g.filter((r) => r[s.arg] !== null && r[s.arg] !== undefined).length;
        const v = g.map((r) => Number(r[s.arg])).filter((n) => !Number.isNaN(n));
        if (!v.length) return null;
        if (s.agg === 'SUM') return v.reduce((a, b) => a + b, 0);
        if (s.agg === 'AVG') return v.reduce((a, b) => a + b, 0) / v.length;
        return s.agg === 'MIN' ? Math.min(...v) : Math.max(...v);
      };
      let out;
      if (group || items.some((s) => s.agg)) {
        const groups = new Map();
        for (const r of data) { const k = group ? r[group] : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
        if (!groups.size && !group) groups.set('', []);
        out = [...groups.values()].map((g) => items.map((s) => (s.agg ? agg(s, g) : g[0] ? g[0][s.col] : null)));
        const keys = order.map((o) => { const i = names.indexOf(o.c); if (i < 0) throw new Error(`並べ替える列「${o.c}」は選んだ列にありません`); return { i, desc: o.desc }; });
        out.sort((a, b) => { for (const k of keys) { const c = compare(a[k.i], b[k.i]); if (c) return k.desc ? -c : c; } return 0; });
      } else {
        // 選んでいない列でも並べ替えられるよう、元の行で並べてから列を取り出す
        const keys = order.map((o) => { const s = items.find((it) => it.alias === o.c); return { c: s ? s.col : needCol(o.c), desc: o.desc }; });
        data.sort((a, b) => { for (const k of keys) { const c = compare(a[k.c], b[k.c]); if (c) return k.desc ? -c : c; } return 0; });
        out = data.map((r) => items.map((s) => r[s.col]));
      }
      return { columns: names, rows: out.slice(0, limit) };
    }
  },
  html: `<div class="sq"><div class="tables" id="tables"></div><div class="samples" id="samples"></div><textarea id="q" rows="4" spellcheck="false" aria-label="SQL"></textarea><div class="run"><button id="go">実行（Ctrl+Enter）</button><span id="msg"></span></div><div class="res" id="res"></div></div>`,
  css: `body { background: #f3f4f1; font: 13px system-ui, sans-serif; } .sq { padding: 10px; display: grid; gap: 8px; max-width: 900px; margin: 0 auto; }
    .tables { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: #555; } .tables code { background: #e7e9e3; padding: 1px 6px; border-radius: 4px; }
    .samples { display: flex; gap: 4px; flex-wrap: wrap; } .samples button { font: 11px ui-monospace, monospace; }
    textarea { font: 14px/1.6 ui-monospace, monospace; padding: 8px; } .run { display: flex; gap: 10px; align-items: center; } #msg.err { color: #c23b22; font-weight: 700; }
    table { border-collapse: collapse; background: #fff; font: 13px ui-monospace, monospace; } th, td { border: 1px solid #ddd; padding: 4px 10px; text-align: left; } th { background: #26407c; color: #fff; } td.n { text-align: right; }`,
  js() {
    const TABLES = {
      fruits: [['りんご', 'red', 150, 12], ['みかん', 'orange', 80, 40], ['いちご', 'red', 400, 6], ['ぶどう', 'purple', 300, 9], ['れもん', 'yellow', 120, 15], ['もも', 'pink', 250, 8], ['ばなな', 'yellow', 100, 30], ['さくらんぼ', 'red', 600, 4]].map(([name, color, price, stock]) => ({ name, color, price, stock })),
      students: [['あおい', 'A', 82, '美術'], ['かいと', 'B', 67, 'サッカー'], ['さくら', 'A', 95, '吹奏楽'], ['たいが', 'C', 58, 'サッカー'], ['なな', 'B', 88, '美術'], ['はると', 'C', 74, '吹奏楽'], ['みお', 'A', 91, '科学'], ['ゆうと', 'B', 79, '科学'], ['りこ', 'C', 85, '美術']].map(([name, cls, score, club]) => ({ name, cls, score, club })),
    };
    const SAMPLES = ["SELECT name, price FROM fruits WHERE price >= 200 ORDER BY price DESC", "SELECT color, COUNT(*) AS 種類, SUM(stock) AS 在庫 FROM fruits GROUP BY color ORDER BY 種類 DESC", "SELECT name FROM fruits WHERE name LIKE '%ん%'", "SELECT cls, AVG(score) AS 平均, MAX(score) FROM students GROUP BY cls ORDER BY 平均 DESC", "SELECT * FROM students WHERE (club = '美術' OR club = '科学') AND score > 80"];
    const $ = (id) => document.getElementById(id);
    $('tables').innerHTML = Object.entries(TABLES).map(([n, r]) => `<span>表 <code>${n}</code>（${Object.keys(r[0]).join(', ')}）${r.length} 行</span>`).join('');
    $('samples').innerHTML = SAMPLES.map((s, i) => `<button data-i="${i}">例${i + 1}</button>`).join('');
    $('samples').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { $('q').value = SAMPLES[+b.dataset.i]; run(); } });
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    function run() {
      try {
        const t0 = performance.now(), r = runSql($('q').value, TABLES), ms = performance.now() - t0;
        $('res').innerHTML = `<table><tr>${r.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${r.rows.map((row) => `<tr>${row.map((v) => `<td class="${typeof v === 'number' ? 'n' : ''}">${esc(typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : v ?? 'NULL')}</td>`).join('')}</tr>`).join('')}</table>`;
        $('msg').className = ''; $('msg').textContent = `${r.rows.length} 行 ・ ${ms.toFixed(2)} ミリ秒`;
      } catch (err) { $('msg').className = 'err'; $('msg').textContent = err.message; }
    }
    $('go').onclick = run;
    $('q').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });
    $('q').value = SAMPLES[1]; run();
  },
}, {
  id: 'ut-meeting-timezones', c: 'util', lv: 3,
  t: '時差のある会議の時間を探す', y: 'じさのあるかいぎのじかんをさがす',
  tags: ['時差', 'タイムゾーン', 'Intl', '日程調整'],
  d: '会議に出る人の都市を選ぶと、1日24時間の各時刻が、それぞれの都市で何時になるかを並べて見せる。全員が9時から18時の間に入る時間は緑で示す。列を押すと、各都市の日時を並べた案内文をコピーできる。夏時間も自動で反映される。',
  p: '時差は自分で表に持たず、Intl.DateTimeFormat に timeZone を渡してその土地の時刻を聞く。夏時間の切り替えもブラウザが知っている。',
  html: `<div class="mt"><div class="ui"><label>日付 <input type="date" id="day"></label><span id="hint">都市を選ぶ（先頭の都市が基準）</span></div><div class="cities" id="cities"></div><div class="wrap"><table id="tbl"></table></div><p id="out"></p></div>`,
  css: `body { background: #f5f6f8; font: 13px system-ui, sans-serif; } .mt { padding: 10px; display: grid; gap: 8px; } .ui { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .cities { display: flex; flex-wrap: wrap; gap: 6px; } .cities label { background: #fff; padding: 3px 8px; border-radius: 999px; box-shadow: 0 1px 2px #0001; }
    .wrap { overflow-x: auto; } table { border-collapse: separate; border-spacing: 2px; } th { text-align: right; padding-right: 6px; white-space: nowrap; font-weight: 600; }
    td { width: 30px; min-width: 30px; height: 30px; text-align: center; border-radius: 6px; font: 12px ui-monospace, monospace; cursor: pointer; }
    td.work { background: #cfead6; } td.edge { background: #fdf0c8; } td.night { background: #dde1ea; color: #889; } td.next::after { content: '+1'; font-size: 8px; vertical-align: super; } td.prev::after { content: '-1'; font-size: 8px; vertical-align: super; }
    tr.all td { height: 8px; } tr.all td.ok { background: #2f855a; } td.sel { outline: 3px solid #26407c; }
    #out { white-space: pre-wrap; background: #fff; padding: 8px; border-radius: 8px; margin: 0; min-height: 2em; }`,
  js() {
    const ZONES = [['東京', 'Asia/Tokyo'], ['ソウル', 'Asia/Seoul'], ['シンガポール', 'Asia/Singapore'], ['インド', 'Asia/Kolkata'], ['ドバイ', 'Asia/Dubai'], ['ベルリン', 'Europe/Berlin'], ['ロンドン', 'Europe/London'], ['ニューヨーク', 'America/New_York'], ['シカゴ', 'America/Chicago'], ['ロサンゼルス', 'America/Los_Angeles'], ['サンパウロ', 'America/Sao_Paulo'], ['シドニー', 'Australia/Sydney']];
    const $ = (id) => document.getElementById(id), now = new Date();
    $('day').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    $('cities').innerHTML = ZONES.map(([n, z], i) => `<label><input type="checkbox" value="${z}" ${[0, 6, 7].includes(i) ? 'checked' : ''}> ${n}</label>`).join('');
    const fmts = new Map();
    // その瞬間の、その土地の年・月・日・時・分
    function local(zone, ms) {
      if (!fmts.has(zone)) fmts.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
      const o = {}; for (const p of fmts.get(zone).formatToParts(ms)) o[p.type] = p.value;
      return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute };
    }
    const offsetMs = (zone, ms) => { const l = local(zone, ms); return Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi) - Math.floor(ms / 60000) * 60000; };
    let sel = -1;
    function render() {
      const zones = [...$('cities').querySelectorAll('input:checked')].map((c) => c.value);
      if (!zones.length) { $('tbl').innerHTML = ''; return; }
      const [y, m, d] = $('day').value.split('-').map(Number), guess = Date.UTC(y, m - 1, d), start = guess - offsetMs(zones[0], guess);
      const slots = Array.from({ length: 24 }, (_, h) => start + h * 3600000);
      const name = (z) => ZONES.find((q) => q[1] === z)[0];
      let html = '', good = slots.map(() => true);
      for (const z of zones) {
        html += `<tr><th>${name(z)}</th>`;
        slots.forEach((ms, i) => {
          const l = local(z, ms), base = local(zones[0], ms), dd = Date.UTC(l.y, l.m - 1, l.d) - Date.UTC(base.y, base.m - 1, base.d);
          const cls = l.h >= 9 && l.h < 18 ? 'work' : l.h >= 7 && l.h < 22 ? 'edge' : 'night';
          if (cls !== 'work') good[i] = false;
          html += `<td data-i="${i}" class="${cls} ${dd > 0 ? 'next' : dd < 0 ? 'prev' : ''} ${i === sel ? 'sel' : ''}" title="${name(z)} ${l.m}/${l.d} ${l.h}:${String(l.mi).padStart(2, '0')}">${l.h}</td>`;
        });
        html += '</tr>';
      }
      html += `<tr class="all"><th>全員が9〜18時</th>${good.map((g, i) => `<td data-i="${i}" class="${g ? 'ok' : ''}"></td>`).join('')}</tr>`;
      $('tbl').innerHTML = html;
      $('hint').textContent = good.some(Boolean) ? `全員の仕事時間が重なるのは ${good.filter(Boolean).length} 時間` : '全員の仕事時間が重なる時間はありません（黄色はぎりぎりの時間）';
      if (sel >= 0) {
        const lines = zones.map((z) => { const l = local(z, slots[sel]); return `${name(z)}: ${l.m}月${l.d}日 ${l.h}:${String(l.mi).padStart(2, '0')}`; });
        $('out').textContent = '会議の時間の案\n' + lines.join('\n');
      }
    }
    $('tbl').addEventListener('click', async (e) => { const td = e.target.closest('[data-i]'); if (!td) return; sel = +td.dataset.i; render(); try { await navigator.clipboard.writeText($('out').textContent); $('out').textContent += '\n（コピーしました）'; } catch { /* コピーできない環境 */ } });
    $('cities').addEventListener('change', render); $('day').addEventListener('input', render);
    render();
  },
}, {
  id: 'ut-loan', c: 'util', lv: 2,
  t: 'ローンの返済表', y: 'ろーんのへんさいひょう',
  tags: ['ローン', '返済', '金利', '計算'],
  d: '借りる金額・年利・年数から、毎月の返済額・返す総額・利息の合計を計算し、1年ごとに「元金と利息の内訳」を積み上げ棒グラフで見せる。毎月同じ額を返す方法（元利均等）と、元金を同じ額ずつ返す方法（元金均等）を切り替えて比べられる。',
  p: '毎月の返済額は「借りた額 × 月利 ÷ (1 − (1 + 月利)^−回数)」。円未満の端数は最後の月で調整して、残りがちょうど0円になるようにしている。',
  core() {
    function loanSchedule(principal, ratePct, months, method) {
      const r = ratePct / 100 / 12, rows = [];
      const pay = r === 0 ? Math.round(principal / months) : Math.round((principal * r) / (1 - Math.pow(1 + r, -months)));
      const fixed = Math.round(principal / months);
      let bal = principal;
      for (let n = 1; n <= months; n++) {
        const interest = Math.round(bal * r);
        let prin = method === 'equal-principal' ? fixed : pay - interest;
        if (n === months || prin > bal) prin = bal;
        bal -= prin;
        rows.push({ n, payment: prin + interest, interest, principal: prin, balance: bal });
      }
      const totalPayment = rows.reduce((a, b) => a + b.payment, 0);
      return { rows, totalPayment, totalInterest: totalPayment - principal };
    }
  },
  html: `<div class="ln"><form id="f"><label>借りる額 <input type="number" id="p" value="3000" min="1" step="10"> 万円</label><label>年利 <input type="number" id="r" value="1.2" min="0" max="20" step="0.05"> %</label><label>年数 <input type="number" id="y" value="30" min="1" max="50"> 年</label>
    <fieldset><label><input type="radio" name="m" value="equal-payment" checked> 元利均等</label><label><input type="radio" name="m" value="equal-principal"> 元金均等</label></fieldset></form>
    <dl id="sum"></dl><svg id="chart" role="img" aria-label="年ごとの元金と利息"></svg><details><summary>毎月の返済表</summary><div class="tw"><table id="tbl"></table></div></details></div>`,
  css: `body { background: #f6f4ef; font: 13px system-ui, sans-serif; } .ln { padding: 10px; display: grid; gap: 10px; max-width: 860px; margin: 0 auto; }
    form { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; } form input[type=number] { width: 6em; } fieldset { border: 0; padding: 0; margin: 0; display: flex; gap: 10px; }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 0; } dl div { background: #fff; border-radius: 10px; padding: 8px 12px; } dt { color: #777; font-size: 12px; } dd { margin: 0; font: 800 20px ui-monospace, monospace; }
    svg { width: 100%; height: 220px; background: #fff; border-radius: 10px; } .tw { max-height: 300px; overflow: auto; } table { border-collapse: collapse; width: 100%; font: 12px ui-monospace, monospace; background: #fff; } th, td { padding: 3px 8px; border-bottom: 1px solid #eee; text-align: right; } th { position: sticky; top: 0; background: #26407c; color: #fff; }`,
  js() {
    const $ = (id) => document.getElementById(id), yen = (n) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(n);
    function render() {
      const P = Math.round(+$('p').value * 10000), months = Math.round(+$('y').value * 12), method = document.querySelector('[name=m]:checked').value;
      if (!(P > 0 && months > 0)) return;
      const s = loanSchedule(P, +$('r').value, months, method);
      $('sum').innerHTML = `<div><dt>${method === 'equal-payment' ? '毎月の返済' : '最初の月の返済'}</dt><dd>${yen(s.rows[0].payment)}</dd></div><div><dt>返す総額</dt><dd>${yen(s.totalPayment)}</dd></div><div><dt>利息の合計</dt><dd>${yen(s.totalInterest)}</dd></div><div><dt>利息の割合</dt><dd>${((s.totalInterest / s.totalPayment) * 100).toFixed(1)}%</dd></div>`;
      const years = []; s.rows.forEach((r) => { const k = Math.floor((r.n - 1) / 12); years[k] = years[k] || [0, 0]; years[k][0] += r.principal; years[k][1] += r.interest; });
      const W = $('chart').clientWidth || 600, H = 220, bw = (W - 40) / years.length, max = Math.max(...years.map((v) => v[0] + v[1]));
      $('chart').setAttribute('viewBox', `0 0 ${W} ${H}`);
      $('chart').innerHTML = years.map(([pr, it], i) => { const hp = (pr / max) * (H - 40), hi = (it / max) * (H - 40), x = 30 + i * bw; return `<rect x="${x}" y="${H - 20 - hp}" width="${Math.max(1, bw - 2)}" height="${hp}" fill="#26407c"><title>${i + 1}年目 元金 ${yen(pr)}</title></rect><rect x="${x}" y="${H - 20 - hp - hi}" width="${Math.max(1, bw - 2)}" height="${hi}" fill="#e0812f"><title>${i + 1}年目 利息 ${yen(it)}</title></rect>${(i + 1) % 5 === 0 ? `<text x="${x + bw / 2}" y="${H - 5}" font-size="10" text-anchor="middle" fill="#777">${i + 1}年</text>` : ''}`; }).join('') + `<text x="${W - 10}" y="16" text-anchor="end" font-size="11"><tspan fill="#26407c">■ 元金</tspan> <tspan fill="#e0812f">■ 利息</tspan></text>`;
      $('tbl').innerHTML = '<tr><th>回</th><th>返済額</th><th>元金</th><th>利息</th><th>残り</th></tr>' + s.rows.map((r) => `<tr><td>${r.n}</td><td>${r.payment.toLocaleString('ja-JP')}</td><td>${r.principal.toLocaleString('ja-JP')}</td><td>${r.interest.toLocaleString('ja-JP')}</td><td>${r.balance.toLocaleString('ja-JP')}</td></tr>`).join('');
    }
    $('f').addEventListener('input', render);
    addEventListener('resize', render);
    render();
  },
}, {
  id: 'ap-paste-image', c: 'api', lv: 2,
  t: '貼り付けた画像や文字を調べる', y: 'はりつけたがぞうやもじをしらべる',
  tags: ['クリップボード', '貼り付け', 'ドラッグ＆ドロップ', 'ファイル'],
  d: 'Ctrl+V で貼り付けるか、ファイルを落とすと、中身の種類ごとに見せる。画像なら縦横の画素数と大きさ、文字ならその文字、Web ページからコピーした装飾付きの文字なら元の HTML も表示する。何も送信せず、ブラウザの中だけで調べる。',
  p: '貼り付けは paste イベントの clipboardData から読む。利用者が自分で貼り付けた時だけ中身が渡るので、許可の確認は出ない。',
  html: `<div class="pz" id="zone" tabindex="0"><p class="big">ここを押してから Ctrl+V（⌘+V）で貼り付け<br>またはファイルをここへ落とす</p><ul id="list"></ul></div>`,
  css: `body { background: #eef1f4; font: 13px system-ui, sans-serif; padding: 10px; } .pz { min-height: 80vh; border: 3px dashed #9aa7b6; border-radius: 16px; padding: 12px; outline: none; } .pz:focus { border-color: #26407c; background: #f6f9ff; } .pz.over { background: #e1ecff; }
    .big { text-align: center; color: #667; font-size: 15px; } ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    li { background: #fff; border-radius: 10px; padding: 8px; display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: start; box-shadow: 0 1px 3px #0001; }
    li img { max-width: 180px; max-height: 140px; border-radius: 6px; background: repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 12px 12px; } li b { display: block; } li pre { margin: 4px 0 0; white-space: pre-wrap; word-break: break-all; max-height: 140px; overflow: auto; background: #f4f5f7; padding: 6px; border-radius: 6px; font-size: 12px; }`,
  js() {
    const zone = document.getElementById('zone'), list = document.getElementById('list');
    const size = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB');
    function add(kind, info, body) { const li = document.createElement('li'); li.innerHTML = `<div class="v"></div><div><b></b><span></span></div>`; li.querySelector('b').textContent = kind; li.querySelector('span').textContent = info; if (body) li.querySelector(body.tagName === 'IMG' ? '.v' : 'div:last-child').append(body); list.prepend(li); }
    async function file(f) {
      if (f.type.startsWith('image/')) {
        const url = URL.createObjectURL(f), img = new Image(); img.src = url; await img.decode().catch(() => {});
        add('画像', `${f.name || '貼り付けた画像'} ・ ${f.type} ・ ${img.naturalWidth}×${img.naturalHeight} 画素 ・ ${size(f.size)}`, img);
      } else {
        const pre = document.createElement('pre'); pre.textContent = f.size < 200000 && /text|json|xml|javascript|csv/.test(f.type) ? (await f.text()).slice(0, 2000) : '（中身の表示は省略）';
        add('ファイル', `${f.name} ・ ${f.type || '種類不明'} ・ ${size(f.size)}`, pre);
      }
    }
    function text(kind, s) { const pre = document.createElement('pre'); pre.textContent = s.slice(0, 4000); add(kind, `${[...s].length} 文字`, pre); }
    document.addEventListener('paste', (e) => {
      e.preventDefault();
      const dt = e.clipboardData;
      for (const f of dt.files) file(f);
      const html = dt.getData('text/html'), plain = dt.getData('text/plain');
      if (plain) text('文字', plain);
      if (html) text('装飾付きの文字（元の HTML）', html);
    });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); for (const f of e.dataTransfer.files) file(f); const t = e.dataTransfer.getData('text/plain'); if (t && !e.dataTransfer.files.length) text('文字', t); });
    if (!window.THUMB) zone.focus();
  },
});
