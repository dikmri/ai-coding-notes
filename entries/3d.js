/* 立体・3D */
dekiru.add({
  id: '3d-cube', c: '3d', lv: 2,
  t: 'つかんで回す立方体', y: 'つかんでまわすりっぽうたい',
  tags: ['3D変形', 'preserve-3d', 'ドラッグ', '立方体'],
  d: '6枚の板をそれぞれ回して前へ押し出すと箱になる。ドラッグで回し、手を離すと慣性で回り続けてから止まる。',
  p: '親に transform-style: preserve-3d を付けないと、子の奥行きが平らにつぶれてしまう。',
  html: `
    <div class="scene" id="scene"><div class="cube" id="cube">
      <div class="f" style="--t:translateZ(var(--h));--c:#e0532f">前</div>
      <div class="f" style="--t:rotateY(180deg) translateZ(var(--h));--c:#26407c">後</div>
      <div class="f" style="--t:rotateY(90deg) translateZ(var(--h));--c:#2f855a">右</div>
      <div class="f" style="--t:rotateY(-90deg) translateZ(var(--h));--c:#b7791f">左</div>
      <div class="f" style="--t:rotateX(90deg) translateZ(var(--h));--c:#805ad5">上</div>
      <div class="f" style="--t:rotateX(-90deg) translateZ(var(--h));--c:#319795">下</div>
    </div></div>`,
  css: `
    body { display: grid; place-items: center; background: #f1ece2; overflow: hidden; touch-action: none; }
    .scene { perspective: 1000px; cursor: grab; padding: 10vmin; }
    .cube { --h: 15vmin; position: relative; width: 30vmin; aspect-ratio: 1; transform-style: preserve-3d; }
    .f { position: absolute; inset: 0; display: grid; place-items: center; font: 800 10vmin serif; color: #fff; background: color-mix(in srgb, var(--c) 88%, transparent); border: .4vmin solid #fff6; transform: var(--t); }`,
  js() {
    const cube = document.getElementById('cube'), scene = document.getElementById('scene');
    let rx = -25, ry = 35, vx = 0.15, vy = 0.35, drag = null;
    scene.addEventListener('pointerdown', (e) => { scene.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY }; });
    scene.addEventListener('pointermove', (e) => {
      if (!drag) return;
      vy = (e.clientX - drag.x) * 0.5; vx = -(e.clientY - drag.y) * 0.5;
      drag = { x: e.clientX, y: e.clientY };
    });
    scene.addEventListener('pointerup', () => { drag = null; });
    (function loop() {
      rx += vx; ry += vy;
      if (!drag) { vx = vx * 0.96 + 0.15 * 0.04; vy = vy * 0.96 + 0.35 * 0.04; } else { vx *= 0.5; vy *= 0.5; }
      cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: '3d-card-flip', c: '3d', lv: 1,
  t: '裏返るカード', y: 'うらがえるかーど',
  tags: ['backface-visibility', 'rotateY', 'カード', '裏表'],
  d: '表と裏の2枚を背中合わせに重ね、裏側を見せない設定（backface-visibility: hidden）にしてから、カードごと180度回す。',
  html: `
    <div class="row">
      <button class="card"><span class="front">問</span><span class="back">HTML</span></button>
      <button class="card"><span class="front">問</span><span class="back">CSS</span></button>
      <button class="card"><span class="front">問</span><span class="back">JS</span></button>
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #1f2937; }
    .row { display: flex; gap: 4vmin; perspective: 1200px; }
    .card { position: relative; width: 22vmin; aspect-ratio: 5 / 7; border: 0; padding: 0; background: none; transform-style: preserve-3d; transition: transform .7s cubic-bezier(.3, 1.4, .5, 1); }
    .card.on { transform: rotateY(180deg); }
    .card span { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 2vmin; backface-visibility: hidden; font: 800 6vmin serif; box-shadow: 0 1vmin 3vmin #0006; }
    .front { background: repeating-linear-gradient(45deg, #c23b22 0 2vmin, #a82f19 0 4vmin); color: #fff; }
    .back { background: #fffdf5; color: #1f2937; transform: rotateY(180deg); }`,
  js() {
    const cards = [...document.querySelectorAll('.card')];
    for (const c of cards) c.onclick = () => c.classList.toggle('on');
    if (window.THUMB) { let i = 0; setInterval(() => cards[i++ % 3].classList.toggle('on'), 700); }
  },
}, {
  id: '3d-carousel', c: '3d', lv: 2,
  t: '立体の回転棚', y: 'りったいのかいてんだな',
  tags: ['カルーセル', 'rotateY', 'translateZ', '3D変形'],
  d: '板を円周上に並べる。i 枚目を (360÷枚数)×i 度回してから外へ押し出すと輪になる。輪ごと回せば回転棚になる。',
  p: '押し出す距離は「板の幅の半分 ÷ tan(180°÷枚数)」。この式で板どうしがぴったり接する。',
  html: `<div class="stage"><div class="ring" id="ring"></div></div><div class="bar"><button id="prev">←</button><button id="next">→</button></div>`,
  css: `
    body { display: grid; place-content: center; gap: 4vmin; background: radial-gradient(#2c2348, #0e0b18); overflow: hidden; }
    .stage { perspective: 1100px; }
    .ring { position: relative; width: 22vmin; height: 30vmin; transform-style: preserve-3d; transition: transform .8s cubic-bezier(.3, 1, .4, 1); }
    .ring div { position: absolute; inset: 0; border-radius: 2vmin; display: grid; place-items: center; font: 800 8vmin serif; color: #fff; background: linear-gradient(160deg, hsl(var(--h) 70% 60%), hsl(var(--h) 70% 35%)); border: 2px solid #fff4; -webkit-box-reflect: below 1vmin linear-gradient(transparent 70%, #fff3); }
    .bar { display: flex; justify-content: center; gap: 2vmin; }`,
  js() {
    const ring = document.getElementById('ring');
    const words = ['春', '夏', '秋', '冬', '朝', '昼', '夕', '夜'];
    const n = words.length;
    const w = ring.offsetWidth;
    const r = Math.round(w / 2 / Math.tan(Math.PI / n)) + 20;
    words.forEach((t, i) => {
      const d = document.createElement('div');
      d.textContent = t;
      d.style.setProperty('--h', i * 45);
      d.style.transform = `rotateY(${(360 / n) * i}deg) translateZ(${r}px)`;
      ring.append(d);
    });
    let k = 0;
    const show = () => { ring.style.transform = `translateZ(${-r}px) rotateY(${(-360 / n) * k}deg)`; };
    document.getElementById('prev').onclick = () => { k--; show(); };
    document.getElementById('next').onclick = () => { k++; show(); };
    show();
    setInterval(() => { k++; show(); }, 2200);
  },
}, {
  id: '3d-book', c: '3d', lv: 3,
  t: 'めくれる本', y: 'めくれるほん',
  tags: ['3D変形', '本', 'ページめくり', 'transform-origin'],
  d: 'ページを左端を軸に回すと、めくれる紙になる。めくった紙は左に積み、めくっていない紙は右に積むよう重なり順も入れ替える。',
  p: 'transform-origin: left center で、回転の軸を背表紙の位置に置いている。',
  html: `<div class="desk"><div class="book" id="book"></div></div><p class="hint">右半分を押すと進み、左半分を押すと戻ります</p>`,
  css: `
    body { display: grid; place-content: center; gap: 2vmin; background: #6b4f3a radial-gradient(#8a6a4f, #4a3424); }
    .desk { perspective: 1800px; }
    .book { position: relative; width: 70vmin; height: 46vmin; }
    .book::before { content: ""; position: absolute; inset: -1vmin; border-radius: 1vmin; background: #2b1d14; box-shadow: 0 2vmin 4vmin #0008; }
    .page { position: absolute; left: 50%; top: 0; width: 50%; height: 100%; transform-origin: left center; transform-style: preserve-3d; transition: transform .9s cubic-bezier(.4, .1, .3, 1); cursor: pointer; }
    .page.turned { transform: rotateY(-180deg); }
    .page > div { position: absolute; inset: 0; padding: 4vmin; backface-visibility: hidden; background: #fbf6ea; font: 3vmin/1.8 serif; color: #333; box-shadow: inset 2vmin 0 2vmin -1.5vmin #0002; }
    .page .back { transform: rotateY(180deg); box-shadow: inset -2vmin 0 2vmin -1.5vmin #0002; }
    .page h2 { font: 800 5vmin serif; margin: 0 0 1vmin; color: #8a2a14; }
    .hint { color: #f2e6d4; text-align: center; font-size: 13px; margin: 0; }`,
  js() {
    const pages = [
      ['<h2>出来る！</h2>素の道具だけで作る小さな本。', '<h2>第一章</h2>HTML は骨組み。'],
      ['<h2>第二章</h2>CSS は見た目。', '<h2>第三章</h2>JavaScript は動き。'],
      ['<h2>第四章</h2>つなげば大きな仕事になる。', '<h2>第五章</h2>道具は小さく。'],
      ['<h2>あとがき</h2>めくってくれてありがとう。', '<h2>おしまい</h2>'],
    ];
    const book = document.getElementById('book');
    const els = pages.map(([f, b], i) => {
      const p = document.createElement('div');
      p.className = 'page';
      p.innerHTML = `<div class="front">${f}</div><div class="back">${b}</div>`;
      p.style.zIndex = pages.length - i;
      book.append(p);
      return p;
    });
    let at = 0;
    const turn = (dir) => {
      if (dir > 0 && at < els.length) { els[at].classList.add('turned'); els[at].style.zIndex = at + 1; at++; }
      else if (dir < 0 && at > 0) { at--; els[at].classList.remove('turned'); els[at].style.zIndex = els.length - at; }
    };
    book.addEventListener('click', (e) => { const r = book.getBoundingClientRect(); turn(e.clientX > r.left + r.width / 2 ? 1 : -1); });
    if (window.THUMB) { let d = 1; setInterval(() => { if (at === els.length) d = -1; if (at === 0) d = 1; turn(d); }, 1000); }
  },
}, {
  id: '3d-wireframe', c: '3d', lv: 3,
  t: '自作の3D投影（針金のドーナツ）', y: 'じさくのすりーでぃーとうえいはりがねのどーなつ',
  tags: ['canvas', '3D投影', '回転行列', 'ワイヤーフレーム'],
  d: '3D の点を回転の式で回し、奥にあるほど小さく見えるよう z で割って画面に写す。WebGL を使わずに針金細工のドーナツを描く。',
  p: '遠近法の正体は「x ÷ 奥行き」。この割り算だけで遠くの物が小さく見える。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #06080f; overflow: hidden; } canvas { width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const U = 36, V = 14, R = 1, r = 0.42;
    const pts = [];
    for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
      const u = (i / U) * Math.PI * 2, v = (j / V) * Math.PI * 2;
      pts.push([(R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)]);
    }
    let mx = 0, my = 0;
    addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });
    (function draw(t) {
      const a = t / 1500 + mx * 3, b = t / 2300 + my * 3;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const f = Math.min(c.width, c.height) * 0.9;
      const P = pts.map(([px, py, pz]) => {
        const x1 = px * ca - pz * sa, z1 = px * sa + pz * ca;
        const y2 = py * cb - z1 * sb, z2 = py * sb + z1 * cb;
        const z = z2 + 3.2;
        return [c.width / 2 + (x1 / z) * f, c.height / 2 + (y2 / z) * f, z];
      });
      x.fillStyle = '#06080f'; x.fillRect(0, 0, c.width, c.height);
      x.lineWidth = 1.2;
      for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
        const k = i * V + j, k1 = ((i + 1) % U) * V + j, k2 = i * V + ((j + 1) % V);
        for (const m of [k1, k2]) {
          const z = (P[k][2] + P[m][2]) / 2, alpha = Math.max(0.1, 1.6 - (z - 2) * 0.6);
          x.strokeStyle = `hsla(${180 + j * 12} 90% 60% / ${alpha})`;
          x.beginPath(); x.moveTo(P[k][0], P[k][1]); x.lineTo(P[m][0], P[m][1]); x.stroke();
        }
      }
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-terrain', c: '3d', lv: 3,
  t: '地形の上を飛ぶ', y: 'ちけいのうえをとぶ',
  tags: ['canvas', '3D投影', 'レトロ', '地形'],
  d: '格子の各点に山の高さを与え、遠近法で画面に写して線で結ぶ。格子を手前へ少しずつ流すと、夕日に向かって飛び続ける景色になる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #12002a; overflow: hidden; } canvas { width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const COLS = 40, ROWS = 36, SP = 1;
    const height = (gx, gz) => {
      const side = Math.min(1, Math.max(0, (Math.abs(gx) - 2.5) / 6));
      return side * (Math.sin(gx * 0.7 + gz * 0.3) + Math.sin(gz * 0.45 - gx * 0.2) * 1.4 + 1.6) * 1.3;
    };
    (function draw(t) {
      const W = c.width, H = c.height, hor = H * 0.48, f = H * 0.9;
      const travel = t / 260, base = Math.floor(travel), frac = travel - base;
      const sky = x.createLinearGradient(0, 0, 0, hor);
      sky.addColorStop(0, '#12002a'); sky.addColorStop(1, '#ff3d8b');
      x.fillStyle = sky; x.fillRect(0, 0, W, hor);
      x.fillStyle = '#12002a'; x.fillRect(0, hor, W, H - hor);
      const sun = x.createLinearGradient(0, hor - H * 0.3, 0, hor);
      sun.addColorStop(0, '#ffe56b'); sun.addColorStop(1, '#ff4fa3');
      x.save(); x.beginPath(); x.arc(W / 2, hor, H * 0.22, Math.PI, 0); x.clip();
      x.fillStyle = sun; x.fillRect(0, 0, W, hor);
      x.fillStyle = '#ff3d8b';
      for (let i = 0; i < 6; i++) x.fillRect(0, hor - H * 0.02 - i * H * 0.035, W, H * 0.006 + i * 1.2);
      x.restore();
      const proj = (gx, z, y) => [W / 2 + (gx / z) * f, hor + ((2.2 - y) / z) * f];
      const rows = [];
      for (let r = ROWS - 1; r >= 0; r--) {
        const z = r * SP - frac + 1.2;
        if (z < 0.3) continue;
        const row = [];
        for (let k = 0; k <= COLS; k++) {
          const gx = (k - COLS / 2) * SP;
          row.push(proj(gx, z, height(gx, r + base)));
        }
        rows.push([z, row]);
      }
      x.lineWidth = 1.3;
      rows.forEach(([z, row], ri) => {
        x.strokeStyle = `rgba(80, 230, 255, ${Math.min(1, 1.6 - z / ROWS)})`;
        x.beginPath(); row.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
        const next = rows[ri + 1];
        if (next) {
          x.strokeStyle = `rgba(255, 80, 200, ${Math.min(0.8, 1.4 - z / ROWS)})`;
          x.beginPath();
          row.forEach(([px, py], k) => { x.moveTo(px, py); x.lineTo(next[1][k][0], next[1][k][1]); });
          x.stroke();
        }
      });
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-ascii-donut', c: '3d', lv: 3,
  t: '文字で描く回転ドーナツ', y: 'もじでかくかいてんどーなつ',
  tags: ['アスキーアート', '3D', 'Zバッファ', '文字'],
  d: 'ドーナツの表面の点を回転させて文字の升目に写し、手前の点だけを残す（Zバッファ）。面の向きと光の向きから明るさを決め、明るいほど濃い文字を置く。',
  p: '明るさの段階を「.,-~:;=!*#$@」という文字の並びで表している。',
  html: `<pre id="o"></pre>`,
  css: `body { display: grid; place-items: center; background: #0b0b0b; overflow: hidden; } pre { margin: 0; font: min(1.9vw, 2.6vh)/1 ui-monospace, Consolas, monospace; color: #ffb454; text-shadow: 0 0 6px #ff8a0066; }`,
  js() {
    const out = document.getElementById('o');
    const W = 80, H = 40, shades = '.,-~:;=!*#$@';
    let A = 0, B = 0;
    (function frame() {
      const chars = new Array(W * H).fill(' '), zbuf = new Array(W * H).fill(0);
      const cA = Math.cos(A), sA = Math.sin(A), cB = Math.cos(B), sB = Math.sin(B);
      for (let th = 0; th < 6.28; th += 0.07) {
        const ct = Math.cos(th), st = Math.sin(th);
        for (let ph = 0; ph < 6.28; ph += 0.02) {
          const cp = Math.cos(ph), sp = Math.sin(ph);
          const cx = 2 + ct, cy = st;
          const x3 = cx * (cB * cp + sA * sB * sp) - cy * cA * sB;
          const y3 = cx * (sB * cp - sA * cB * sp) + cy * cA * cB;
          const z3 = 5 + cA * cx * sp + cy * sA;
          const ooz = 1 / z3;
          const xp = Math.floor(W / 2 + 30 * ooz * x3), yp = Math.floor(H / 2 - 15 * ooz * y3);
          const L = cp * ct * sB - cA * ct * sp - sA * st + cB * (cA * st - ct * sA * sp);
          const k = xp + W * yp;
          if (yp >= 0 && yp < H && xp >= 0 && xp < W && ooz > zbuf[k]) {
            zbuf[k] = ooz;
            chars[k] = shades[Math.max(0, Math.floor(L * 8))];
          }
        }
      }
      let s = '';
      for (let i = 0; i < H; i++) s += chars.slice(i * W, i * W + W).join('') + '\n';
      out.textContent = s;
      A += 0.04; B += 0.02;
      requestAnimationFrame(frame);
    })();
  },
}, {
  id: '3d-webgl-tunnel', c: '3d', lv: 3,
  t: 'WebGLのシェーダーで光のトンネル', y: 'うぇぶじーえるのしぇーだーでひかりのとんねる',
  tags: ['WebGL', 'シェーダー', 'GLSL', 'GPU'],
  d: '画面いっぱいの四角形を1枚描き、すべての画素の色を GPU 上の小さなプログラム（フラグメントシェーダー）に計算させる。極座標で模様を作ると奥へ続くトンネルになる。',
  p: 'WebGL もブラウザに最初から入っている。three.js などは、この生の API を使いやすく包んだもの。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; }`,
  js() {
    const c = document.getElementById('c');
    const gl = c.getContext('webgl');
    if (!gl) { document.body.textContent = 'WebGL が使えない環境です'; throw new Error('WebGL が使えません'); }
    const vs = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
    const fs = `precision mediump float;
      uniform vec2 r; uniform float t; uniform vec2 m;
      void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - r) / min(r.x, r.y) - m * 0.6;
        float a = atan(uv.y, uv.x), d = length(uv);
        float u = 0.35 / d + t * 0.6, v = a / 3.14159 * 4.0 + t * 0.1;
        float grid = step(0.5, fract(u * 2.0)) * 0.5 + step(0.5, fract(v)) * 0.5;
        vec3 col = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + u * 0.25 + grid * 0.2));
        col *= smoothstep(0.0, 0.6, d) * (0.6 + grid * 0.4);
        gl_FragColor = vec4(col, 1.0);
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pg); gl.useProgram(pg);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pg, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(pg, 'r'), uT = gl.getUniformLocation(pg, 't'), uM = gl.getUniformLocation(pg, 'm');
    let mx = 0, my = 0;
    addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = 0.5 - e.clientY / innerHeight; });
    (function draw(time) {
      if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; gl.viewport(0, 0, c.width, c.height); }
      gl.uniform2f(uR, c.width, c.height); gl.uniform1f(uT, time / 1000); gl.uniform2f(uM, mx, my);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-raymarch', c: '3d', lv: 3,
  t: 'レイマーチングで溶け合う球', y: 'れいまーちんぐでとけあうきゅう',
  tags: ['WebGL', 'レイマーチング', '距離関数', '影'],
  d: '画素ごとに視線を飛ばし、「一番近い物までの距離」だけ進むことを繰り返して物に当てる。2つの球をなめらかにつなぎ、柔らかい影と市松の床も付ける。3D モデルのデータは1つもない。',
  p: '形は「点から表面までの距離」を返す関数で表す。球なら length(p) − 半径 の1行。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #111; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; }`,
  js() {
    const c = document.getElementById('c');
    const gl = c.getContext('webgl');
    if (!gl) { document.body.textContent = 'WebGL が使えない環境です'; throw new Error('WebGL が使えません'); }
    const fs = `precision highp float;
      uniform vec2 r; uniform float t;
      float map(vec3 p) {
        float plane = p.y + 1.0;
        float a = length(p - vec3(sin(t) * 1.1, 0.0, 0.0)) - 0.6;
        float b = length(p - vec3(-sin(t * 0.8) * 1.1, 0.25 * cos(t * 1.3), 0.3)) - 0.5;
        float k = 0.5, h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return min(plane, mix(b, a, h) - k * h * (1.0 - h));
      }
      vec3 nor(vec3 p) { vec2 e = vec2(0.001, 0.0); return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx))); }
      float shadow(vec3 ro, vec3 rd) {
        float res = 1.0, d = 0.02;
        for (int i = 0; i < 40; i++) { float h = map(ro + rd * d); res = min(res, 8.0 * h / d); d += clamp(h, 0.02, 0.2); if (h < 0.001 || d > 10.0) break; }
        return clamp(res, 0.0, 1.0);
      }
      void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - r) / r.y;
        vec3 ro = vec3(0.0, 0.4, -4.0), rd = normalize(vec3(uv, 1.7));
        float d = 0.0; bool hit = false;
        for (int i = 0; i < 100; i++) { float h = map(ro + rd * d); if (h < 0.001) { hit = true; break; } d += h; if (d > 20.0) break; }
        vec3 bg = mix(vec3(0.09, 0.1, 0.18), vec3(0.55, 0.62, 0.8), uv.y * 0.5 + 0.5), col = bg;
        if (hit) {
          vec3 p = ro + rd * d, n = nor(p), l = normalize(vec3(0.6, 0.8, -0.4));
          float dif = max(dot(n, l), 0.0) * shadow(p + n * 0.01, l);
          float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 32.0);
          vec3 base = p.y < -0.99 ? (mod(floor(p.x) + floor(p.z), 2.0) < 1.0 ? vec3(0.85) : vec3(0.3)) : vec3(1.0, 0.42, 0.28);
          col = base * (0.15 + dif) + spec * 0.6;
          col = mix(col, bg, 1.0 - exp(-0.015 * d * d));
        }
        gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pg); gl.useProgram(pg);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(pg, 'r'), uT = gl.getUniformLocation(pg, 't');
    const scale = 0.6;
    (function draw(time) {
      const w = Math.round(innerWidth * scale), h = Math.round(innerHeight * scale);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, time / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-webgl-cube', c: '3d', lv: 3,
  t: 'WebGLで回す色つきの箱', y: 'うぇぶじーえるでまわすいろつきのはこ',
  tags: ['WebGL', '行列', '頂点', '深度テスト'],
  d: '頂点の座標と色を GPU に送り、回転・遠近の行列を自分で掛け算して箱を描く。3D の描画で何が起きているのかを、いちばん下の層から見られる。',
  p: '行列はただの16個の数。回転・平行移動・遠近を掛け合わせて1つの行列にまとめ、シェーダーに渡す。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #0d1117; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; }`,
  js() {
    const c = document.getElementById('c');
    const gl = c.getContext('webgl');
    if (!gl) { document.body.textContent = 'WebGL が使えない環境です'; throw new Error('WebGL が使えません'); }
    const vs = 'attribute vec3 p; attribute vec3 col; uniform mat4 m; varying vec3 v; void main() { v = col; gl_Position = m * vec4(p, 1.0); }';
    const fs = 'precision mediump float; varying vec3 v; void main() { gl_FragColor = vec4(v, 1.0); }';
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pg); gl.useProgram(pg);
    const faces = [
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0.88, 0.33, 0.18]],
      [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [0.15, 0.25, 0.49]],
      [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], [0.18, 0.52, 0.35]],
      [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [0.72, 0.47, 0.12]],
      [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], [0.5, 0.35, 0.84]],
      [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [0.19, 0.59, 0.58]],
    ];
    const data = [], idx = [];
    faces.forEach((f, i) => {
      for (let k = 0; k < 4; k++) data.push(...f[k], ...f[4].map((v) => v * (0.8 + k * 0.07)));
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(pg, 'p'), aC = gl.getAttribLocation(pg, 'col');
    gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 24, 12);
    const uM = gl.getUniformLocation(pg, 'm');
    gl.enable(gl.DEPTH_TEST);
    const mul = (a, b) => { const o = new Array(16).fill(0); for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) o[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k]; return o; };
    const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]; };
    const rotY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
    const rotX = (a) => [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1];
    const move = (z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1];
    (function draw(t) {
      if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; gl.viewport(0, 0, c.width, c.height); }
      gl.clearColor(0.05, 0.07, 0.09, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const m = mul(persp(0.9, c.width / c.height, 0.1, 50), mul(move(-6), mul(rotX(t / 1700), rotY(t / 1100))));
      gl.uniformMatrix4fv(uM, false, new Float32Array(m));
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-css-tunnel', c: '3d', lv: 2,
  t: 'CSSだけの3Dトンネル', y: 'しーえすえすだけのすりーでぃーとんねる',
  tags: ['translateZ', 'perspective', 'トンネル', 'CSSだけ'],
  d: '輪を奥へ一定間隔で並べ、全体を輪1つぶんだけ手前へ動かしては戻す。つなぎ目が分からないので、終わりのないトンネルを進んでいるように見える。',
  html: `<div class="view"><div class="tube" id="tube"></div></div>`,
  css: `
    body { background: #000; overflow: hidden; }
    .view { position: fixed; inset: 0; perspective: 300px; display: grid; place-items: center; }
    .tube { position: relative; width: 60vmin; aspect-ratio: 1; transform-style: preserve-3d; animation: fly 1s linear infinite; }
    .tube i { position: absolute; inset: 0; border-radius: 50%; border: .8vmin solid hsl(var(--h) 90% 60%); box-shadow: 0 0 3vmin hsl(var(--h) 90% 50%), inset 0 0 3vmin hsl(var(--h) 90% 50%); transform: translateZ(calc(var(--i) * -120px)) rotate(calc(var(--i) * 12deg)); }
    @keyframes fly { to { transform: translateZ(120px); } }`,
  js() {
    const tube = document.getElementById('tube');
    for (let i = 0; i < 26; i++) {
      const r = document.createElement('i');
      r.style.setProperty('--i', i);
      r.style.setProperty('--h', (i * 14) % 360);
      if (i % 3 === 0) r.style.borderRadius = '18%';
      tube.append(r);
    }
  },
}, {
  id: '3d-dice', c: '3d', lv: 2,
  t: 'サイコロを振る', y: 'さいころをふる',
  tags: ['3D変形', 'サイコロ', 'ランダム', 'transition'],
  d: '6面にそれぞれ目を並べた立方体を、出したい目がこちらを向く角度まで、余分に何回転かさせて transition で回す。',
  html: `<div class="scene"><div class="die" id="die"></div></div><button id="roll">振る</button><p id="res" aria-live="polite"></p>`,
  css: `
    body { display: grid; place-content: center; justify-items: center; gap: 3vmin; background: #2f6b46 radial-gradient(#3d8a5b, #1f4a30); }
    .scene { perspective: 900px; padding: 6vmin; }
    .die { position: relative; width: 24vmin; aspect-ratio: 1; transform-style: preserve-3d; transition: transform 1.4s cubic-bezier(.2, .8, .25, 1); transform: rotateX(-20deg) rotateY(30deg); }
    .face { position: absolute; inset: 0; display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr); padding: 2.4vmin; border-radius: 3vmin; background: #fffdf6; box-shadow: inset 0 0 2vmin #0002; }
    .face b { width: 70%; aspect-ratio: 1; place-self: center; border-radius: 50%; background: #1d1d1d; }
    .face.one b { background: #d62828; width: 90%; }
    #res { color: #fff; font: 700 4vmin sans-serif; min-height: 1.5em; margin: 0; }`,
  js() {
    const die = document.getElementById('die');
    const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
    const T = { 1: 'translateZ(12vmin)', 6: 'rotateY(180deg) translateZ(12vmin)', 3: 'rotateY(90deg) translateZ(12vmin)', 4: 'rotateY(-90deg) translateZ(12vmin)', 5: 'rotateX(90deg) translateZ(12vmin)', 2: 'rotateX(-90deg) translateZ(12vmin)' };
    const VIEW = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 2: [90, 0] };
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const f = document.createElement('div');
      f.className = 'face' + (n === 1 ? ' one' : '');
      f.style.transform = T[n];
      for (const p of PIPS[n]) { const b = document.createElement('b'); b.style.gridArea = `${Math.ceil(p / 3)} / ${((p - 1) % 3) + 1}`; f.append(b); }
      die.append(f);
    }
    let spins = 0;
    function roll() {
      const n = 1 + Math.floor(Math.random() * 6);
      spins += 2;
      const [x, y] = VIEW[n];
      die.style.transform = `rotateX(${x + spins * 360}deg) rotateY(${y + spins * 360}deg)`;
      document.getElementById('res').textContent = '';
      setTimeout(() => { document.getElementById('res').textContent = `${n} の目`; }, 1400);
    }
    document.getElementById('roll').onclick = roll;
    if (window.THUMB) setInterval(roll, 2000);
  },
}, {
  id: '3d-word-sphere', c: '3d', lv: 3,
  t: '言葉の球', y: 'ことばのきゅう',
  tags: ['球面', 'フィボナッチ', '3D投影', 'マウス'],
  d: '言葉を球の表面に均等に散らし（フィボナッチ球面）、マウスの位置に応じて球を回す。手前の言葉ほど大きく濃く表示する。',
  html: `<div id="s" class="sphere"></div>`,
  css: `
    body { display: grid; place-items: center; background: #0e1424; overflow: hidden; }
    .sphere { position: relative; width: 1px; height: 1px; }
    .sphere span { position: absolute; left: 0; top: 0; white-space: nowrap; font: 700 3vmin sans-serif; color: #9fd8ff; translate: -50% -50%; will-change: transform; }`,
  js() {
    const words = ['HTML', 'CSS', 'JavaScript', 'Canvas', 'SVG', 'WebGL', 'Web Audio', 'Grid', 'Flexbox', 'dialog', 'popover', 'fetch', 'Promise', 'Worker', 'IndexedDB', 'クリップボード', '縦書き', 'アニメーション', 'シェーダー', 'カメラ', 'マイク', '検索', 'パイプ', '図鑑', '出来る！', 'Intl', 'URL', 'Blob', 'View Transitions', ':has()', '@property', 'clip-path', 'mask', 'filter'];
    const s = document.getElementById('s');
    const n = words.length;
    const items = words.map((w, i) => {
      const y = 1 - (i / (n - 1)) * 2, rad = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i;
      const el = document.createElement('span');
      el.textContent = w;
      if (i % 5 === 0) el.style.color = '#ffb454';
      s.append(el);
      return { el, x: Math.cos(th) * rad, y, z: Math.sin(th) * rad };
    });
    let vx = 0.004, vy = 0.006;
    addEventListener('pointermove', (e) => { vy = (e.clientX / innerWidth - 0.5) * 0.04; vx = (e.clientY / innerHeight - 0.5) * -0.04; });
    (function loop() {
      const R = Math.min(innerWidth, innerHeight) * 0.38;
      const cx = Math.cos(vx), sx = Math.sin(vx), cy = Math.cos(vy), sy = Math.sin(vy);
      for (const it of items) {
        const y1 = it.y * cx - it.z * sx, z1 = it.y * sx + it.z * cx;
        const x2 = it.x * cy + z1 * sy, z2 = -it.x * sy + z1 * cy;
        it.x = x2; it.y = y1; it.z = z2;
        const k = (z2 + 2) / 3;
        it.el.style.transform = `translate(${x2 * R}px, ${y1 * R}px) scale(${k})`;
        it.el.style.opacity = 0.25 + k * 0.75;
        it.el.style.zIndex = Math.round(k * 100);
      }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: '3d-parallax-layers', c: '3d', lv: 1,
  t: '奥行きのある山並み', y: 'おくゆきのあるやまなみ',
  tags: ['視差', 'パララックス', 'マウス', 'clip-path'],
  d: '山を何枚も重ね、マウスが動いたら遠い山ほど少なく、近い山ほど大きくずらす。平らな絵なのに奥行きが生まれる。',
  html: `
    <div class="land" id="land">
      <div class="l sun" data-d=".05"></div>
      <div class="l m1" data-d=".1"></div><div class="l m2" data-d=".25"></div>
      <div class="l m3" data-d=".45"></div><div class="l m4" data-d=".8"></div>
    </div>`,
  css: `
    .land { position: fixed; inset: 0; overflow: hidden; background: linear-gradient(#ffd6a5, #ffadad 45%, #bdb2ff); }
    .l { position: absolute; left: -10%; right: -10%; bottom: -5%; height: 70%; transition: translate .15s ease-out; }
    .sun { left: 60%; right: auto; bottom: 45%; width: 20vmin; height: 20vmin; border-radius: 50%; background: #fff3c4; box-shadow: 0 0 8vmin #fff3c4; }
    .m1 { background: #a59ad8; clip-path: polygon(0 55%, 10% 35%, 22% 50%, 35% 20%, 50% 45%, 62% 25%, 78% 50%, 90% 30%, 100% 45%, 100% 100%, 0 100%); }
    .m2 { height: 60%; background: #7d6bbf; clip-path: polygon(0 50%, 15% 25%, 28% 55%, 42% 30%, 58% 60%, 72% 35%, 86% 55%, 100% 30%, 100% 100%, 0 100%); }
    .m3 { height: 45%; background: #534496; clip-path: polygon(0 40%, 18% 60%, 30% 30%, 48% 55%, 64% 25%, 80% 55%, 100% 35%, 100% 100%, 0 100%); }
    .m4 { height: 28%; background: #2b2259; clip-path: polygon(0 30%, 12% 45%, 25% 20%, 40% 50%, 55% 35%, 70% 60%, 85% 30%, 100% 50%, 100% 100%, 0 100%); }`,
  js() {
    const layers = [...document.querySelectorAll('.l')];
    const move = (px, py) => { for (const l of layers) { const d = +l.dataset.d; l.style.translate = `${-px * d * 80}px ${-py * d * 40}px`; } };
    let moved = false;
    addEventListener('pointermove', (e) => { moved = true; move(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5); });
    (function auto(t) { if (!moved) move(Math.sin(t / 1400) * 0.8, Math.cos(t / 1900) * 0.3); requestAnimationFrame(auto); })(0);
  },
}, {
  id: '3d-starfield', c: '3d', lv: 2,
  t: '星の中をワープ', y: 'ほしのなかをわーぷ',
  tags: ['canvas', '3D投影', '星', '宇宙'],
  d: '星に奥行き z を持たせ、毎フレーム手前へ近づける。画面の位置は x ÷ z で求め、前のフレームの位置と線で結ぶと光の筋になる。マウスで速さが変わる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const stars = Array.from({ length: 700 }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() }));
    let speed = 0.012;
    addEventListener('pointermove', (e) => { speed = 0.003 + (e.clientX / innerWidth) * 0.03; });
    (function loop() {
      const W = c.width, H = c.height, f = Math.min(W, H) * 0.5;
      x.fillStyle = '#000a'; x.fillRect(0, 0, W, H);
      for (const s of stars) {
        const px = W / 2 + (s.x / s.z) * f, py = H / 2 + (s.y / s.z) * f;
        s.z -= speed;
        if (s.z <= 0.01) { s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; s.z = 1; continue; }
        const nx = W / 2 + (s.x / s.z) * f, ny = H / 2 + (s.y / s.z) * f;
        const b = 1 - s.z;
        x.strokeStyle = `hsla(${200 + b * 60} 80% ${60 + b * 40}% / ${b})`;
        x.lineWidth = b * 3;
        x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
      }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: '3d-extruded-text', c: '3d', lv: 2,
  t: '厚みのある回転文字', y: 'あつみのあるかいてんもじ',
  tags: ['translateZ', '厚み', '文字', '3D変形'],
  d: '同じ文字を少しずつ奥へずらして何十枚も重ねると、文字に厚みが生まれる。全体をゆっくり回すと立体の看板になる。',
  html: `<div class="stage"><div class="word" id="w"></div></div>`,
  css: `
    body { display: grid; place-items: center; background: linear-gradient(#20263a, #0b0d14); overflow: hidden; }
    .stage { perspective: 900px; }
    .word { position: relative; transform-style: preserve-3d; animation: turn 6s ease-in-out infinite alternate; }
    .word span { position: absolute; left: 0; top: 0; font: 900 16vmin/1 serif; white-space: nowrap; translate: -50% -50%; }
    @keyframes turn { from { transform: rotateY(-40deg) rotateX(10deg); } to { transform: rotateY(40deg) rotateX(-10deg); } }`,
  js() {
    const w = document.getElementById('w');
    const N = 24;
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span');
      s.textContent = '出来る';
      s.setAttribute('aria-hidden', i ? 'true' : 'false');
      s.style.transform = `translateZ(${-i * 1.5}px)`;
      s.style.color = i === 0 ? '#ffe3a3' : `hsl(${20 + i} 70% ${48 - i * 1.5}%)`;
      w.prepend(s);
    }
  },
});
