/* 粒子・物理 */
dekiru.add({
  id: 'pt-text-particles', c: 'particle', lv: 2,
  t: '粒になる文字', y: 'つぶになるもじ',
  tags: ['粒子', '文字', 'マウス', 'getImageData'],
  d: '入力した文字を見えない場所に一度描き、塗られた画素の位置を粒の目的地にする。粒はバネで目的地へ戻り、マウスが近づくと逃げる。',
  p: '文字の形を得る道具は getImageData。描いた画素の不透明度を調べれば、どこに文字があるか分かる。',
  html: `<label class="in">文字を入れる <input id="t" value="出来る！" maxlength="8"></label><canvas id="c"></canvas>`,
  css: `body { background: #0f0f18; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; } .in { position: fixed; top: 10px; left: 10px; color: #aaa; font-size: 13px; z-index: 1; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const inp = document.getElementById('t');
    let ps = [];
    const mouse = { x: -1e4, y: -1e4 };
    function build() {
      c.width = innerWidth; c.height = innerHeight;
      if (!c.width || !c.height) return; // 表示前で幅が0のときは、resize を待って作り直す
      const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
      const ox = o.getContext('2d', { willReadFrequently: true });
      const size = Math.min(c.height * 0.5, (c.width * 0.9) / Math.max(1, [...inp.value].length));
      ox.font = `900 ${size}px serif`; ox.textAlign = 'center'; ox.textBaseline = 'middle';
      ox.fillText(inp.value || '空', c.width / 2, c.height / 2);
      const d = ox.getImageData(0, 0, c.width, c.height).data, step = 5, pts = [];
      for (let y = 0; y < c.height; y += step) for (let xx = 0; xx < c.width; xx += step) if (d[(y * c.width + xx) * 4 + 3] > 128) pts.push([xx, y]);
      ps = pts.map(([tx, ty], i) => { const old = ps[i]; return { x: old ? old.x : Math.random() * c.width, y: old ? old.y : Math.random() * c.height, vx: 0, vy: 0, tx, ty, h: (tx / c.width) * 120 + 180 }; });
    }
    build();
    inp.addEventListener('input', build);
    addEventListener('resize', build);
    addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
    (function loop(t) {
      if (window.THUMB) { mouse.x = c.width / 2 + Math.cos(t / 500) * c.width * 0.3; mouse.y = c.height / 2 + Math.sin(t / 300) * c.height * 0.2; }
      x.fillStyle = '#0f0f1840'; x.fillRect(0, 0, c.width, c.height);
      for (const p of ps) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 8000) { const f = 600 / (d2 + 50); p.vx += dx * f; p.vy += dy * f; }
        p.vx = (p.vx + (p.tx - p.x) * 0.02) * 0.88; p.vy = (p.vy + (p.ty - p.y) * 0.02) * 0.88;
        p.x += p.vx; p.y += p.vy;
        x.fillStyle = `hsl(${p.h} 85% 65%)`;
        x.fillRect(p.x, p.y, 3, 3);
      }
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'pt-fireworks', c: 'particle', lv: 2,
  t: '花火', y: 'はなび',
  tags: ['粒子', '重力', '夜空', 'クリック'],
  d: '打ち上げた玉が頂点で止まったら、全方向へ百個ほどの火花を散らす。火花には重力と空気抵抗をかけ、少しずつ暗くする。押した所に向けても打ち上がる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #04050d; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const rockets = [], sparks = [];
    function launch(tx, ty) {
      const sx = c.width * (0.3 + Math.random() * 0.4);
      const vy = -Math.sqrt(2 * 0.12 * (c.height - ty));
      rockets.push({ x: sx, y: c.height, vx: (tx - sx) / (-vy / 0.12), vy, hue: Math.random() * 360 });
    }
    function burst(r) {
      const n = 90 + Math.random() * 60, ring = Math.random() < 0.3;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = ring ? 4 : Math.random() * 5;
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, hue: r.hue + Math.random() * 40 - 20 });
      }
    }
    addEventListener('click', (e) => launch(e.clientX, e.clientY));
    setInterval(() => launch(c.width * (0.15 + Math.random() * 0.7), c.height * (0.15 + Math.random() * 0.3)), 900);
    (function loop() {
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = '#04050d33'; x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'lighter';
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx; r.y += r.vy; r.vy += 0.12;
        x.fillStyle = `hsl(${r.hue} 100% 70%)`; x.fillRect(r.x - 1.5, r.y - 1.5, 3, 3);
        if (r.vy >= 0) { burst(r); rockets.splice(i, 1); }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vx *= 0.98; s.vy = s.vy * 0.98 + 0.05; s.x += s.vx; s.y += s.vy; s.life -= 0.012;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        x.fillStyle = `hsla(${s.hue} 100% ${50 + s.life * 30}% / ${s.life})`;
        x.beginPath(); x.arc(s.x, s.y, 1.8, 0, Math.PI * 2); x.fill();
      }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'pt-sakura', c: 'particle', lv: 2,
  t: '桜吹雪', y: 'さくらふぶき',
  tags: ['桜', '粒子', '回転', '風'],
  d: '花びらを、揺れながら落ちる粒として描く。横幅を cos で伸び縮みさせると、くるくる裏返りながら舞っているように見える。マウスを左右に動かすと風向きが変わる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: linear-gradient(#bfe2ff, #fef6f8); overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    let wind = 0.6;
    addEventListener('pointermove', (e) => { wind = (e.clientX / innerWidth - 0.5) * 4; });
    const make = (top) => ({ x: Math.random() * c.width, y: top ? -20 : Math.random() * c.height, s: 6 + Math.random() * 8, vy: 0.6 + Math.random() * 1.2, ph: Math.random() * 6, spin: 0.02 + Math.random() * 0.05, rot: Math.random() * 6 });
    const ps = Array.from({ length: 130 }, () => make(false));
    (function loop(t) {
      x.clearRect(0, 0, c.width, c.height);
      for (const p of ps) {
        p.ph += p.spin; p.rot += p.spin * 0.6;
        p.x += wind + Math.sin(p.ph) * 0.8; p.y += p.vy;
        if (p.y > c.height + 20 || p.x < -40 || p.x > c.width + 40) Object.assign(p, make(true), { x: wind > 0 ? Math.random() * c.width - 100 : Math.random() * c.width + 100 });
        x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.scale(Math.cos(p.ph), 1);
        x.fillStyle = '#ffc7d6';
        x.beginPath();
        x.moveTo(0, -p.s); x.bezierCurveTo(p.s, -p.s, p.s * 0.8, p.s * 0.6, 0, p.s);
        x.bezierCurveTo(-p.s * 0.8, p.s * 0.6, -p.s, -p.s, 0, -p.s * 0.6);
        x.fill();
        x.restore();
      }
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'pt-snow-pile', c: 'particle', lv: 2,
  t: '降り積もる雪', y: 'ふりつもるゆき',
  tags: ['雪', '粒子', '積もる', '冬'],
  d: '雪の粒が地面の高さに届いたら、その場所の地面を少し高くする。地面の高さを横方向になめらかに平らしていくと、雪が積もった丘ができる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: linear-gradient(#1b2a4a, #3d5a80); overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let ground;
    const fit = () => { c.width = innerWidth; c.height = innerHeight; ground = new Float32Array(Math.ceil(c.width / 4) + 1); };
    fit(); addEventListener('resize', fit);
    const flakes = Array.from({ length: 260 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, r: 1 + Math.random() * 2.6, ph: Math.random() * 6 }));
    (function loop() {
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = '#fff';
      for (const f of flakes) {
        f.ph += 0.02; f.y += f.r * 0.5; f.x += Math.sin(f.ph) * 0.5;
        const gi = Math.max(0, Math.min(ground.length - 1, Math.round(f.x / 4)));
        if (f.y > c.height - ground[gi]) {
          for (let k = -3; k <= 3; k++) { const j = gi + k; if (j >= 0 && j < ground.length) ground[j] += (f.r * 0.25) / (1 + Math.abs(k)); }
          f.y = -5; f.x = Math.random() * c.width;
        }
        x.globalAlpha = 0.5 + f.r / 6;
        x.beginPath(); x.arc(f.x, f.y, f.r, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
      for (let i = 1; i < ground.length - 1; i++) ground[i] = ground[i] * 0.9 + (ground[i - 1] + ground[i + 1]) * 0.05;
      if (Math.max(...ground) > c.height * 0.45) ground.fill(0);
      x.beginPath(); x.moveTo(0, c.height);
      for (let i = 0; i < ground.length; i++) x.lineTo(i * 4, c.height - ground[i]);
      x.lineTo(c.width, c.height); x.closePath();
      x.fillStyle = '#f4f8ff'; x.fill();
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'pt-confetti', c: 'particle', lv: 1,
  t: '紙吹雪', y: 'かみふぶき',
  tags: ['紙吹雪', 'お祝い', '粒子', 'クリック'],
  d: '押した場所から色とりどりの紙片を吹き出す。紙片は重力で落ち、空気抵抗で減速し、縦の長さを cos で変えてひらひら回る。',
  html: `<canvas id="c"></canvas><h1>おめでとう！</h1>`,
  css: `body { background: #fff8ee; overflow: hidden; display: grid; place-items: center; } canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; } h1 { font: 900 10vmin serif; color: #c23b22; pointer-events: none; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const cols = ['#e0532f', '#f0a43a', '#2f855a', '#26407c', '#e8336d', '#7a5cff', '#3fb7e8'];
    let ps = [];
    function pop(px, py) {
      for (let i = 0; i < 160; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, s = 6 + Math.random() * 10;
        ps.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, w: 6 + Math.random() * 6, h: 10 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, ph: Math.random() * 6, col: cols[i % cols.length] });
      }
    }
    addEventListener('click', (e) => pop(e.clientX, e.clientY));
    pop(innerWidth / 2, innerHeight * 0.8);
    setInterval(() => pop(c.width * (0.2 + Math.random() * 0.6), c.height), 2200);
    (function loop() {
      x.clearRect(0, 0, c.width, c.height);
      for (const p of ps) {
        p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.25; p.x += p.vx + Math.sin(p.ph) * 0.6; p.y += p.vy; p.rot += p.vr; p.ph += 0.12;
        x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.scale(1, Math.cos(p.ph));
        x.fillStyle = p.col; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        x.restore();
      }
      ps = ps.filter((p) => p.y < c.height + 40);
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'pt-boids', c: 'particle', lv: 3,
  t: '鳥の群れ（ボイド）', y: 'とりのむれぼいど',
  tags: ['群れ', 'ボイド', '人工生命', 'シミュレーション'],
  d: '1羽ずつに「近すぎたら離れる」「近くの仲間と向きをそろえる」「群れの中心へ寄る」の3つだけを守らせると、全体として本物の群れのように動く。マウスは天敵で、鳥は逃げる。',
  p: '全体を指揮する人はいない。近所の様子だけを見て動くのに、群れの形が生まれる（創発）。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: linear-gradient(#ffcf9a, #f78f6b 60%, #5b3a6b); overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const B = Array.from({ length: 160 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, vx: Math.random() * 2 - 1, vy: Math.random() * 2 - 1 }));
    const enemy = { x: -1e4, y: -1e4 };
    addEventListener('pointermove', (e) => { enemy.x = e.clientX; enemy.y = e.clientY; });
    addEventListener('pointerleave', () => { enemy.x = enemy.y = -1e4; });
    (function loop() {
      for (const b of B) {
        let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
        for (const o of B) {
          if (o === b) continue;
          const dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < 2500) { n++; ax += o.vx; ay += o.vy; cx += o.x; cy += o.y; if (d2 < 400) { sx -= dx / d2; sy -= dy / d2; } }
        }
        if (n) { b.vx += (ax / n - b.vx) * 0.05 + (cx / n - b.x) * 0.002; b.vy += (ay / n - b.vy) * 0.05 + (cy / n - b.y) * 0.002; }
        b.vx += sx * 1.5; b.vy += sy * 1.5;
        const ex = b.x - enemy.x, ey = b.y - enemy.y, ed = ex * ex + ey * ey;
        if (ed < 15000) { b.vx += (ex / ed) * 60; b.vy += (ey / ed) * 60; }
        const sp = Math.hypot(b.vx, b.vy), max = 3.2, min = 1.6;
        if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; } else if (sp < min) { b.vx *= min / sp; b.vy *= min / sp; }
        b.x = (b.x + b.vx + c.width) % c.width; b.y = (b.y + b.vy + c.height) % c.height;
      }
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = '#2b1a2e';
      for (const b of B) {
        const a = Math.atan2(b.vy, b.vx);
        x.save(); x.translate(b.x, b.y); x.rotate(a);
        x.beginPath(); x.moveTo(7, 0); x.lineTo(-5, 4); x.lineTo(-3, 0); x.lineTo(-5, -4); x.closePath(); x.fill();
        x.restore();
      }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'pt-cloth', c: 'particle', lv: 3,
  t: '引っぱれる布', y: 'ひっぱれるぬの',
  tags: ['ベルレ積分', '布', '拘束', 'ドラッグ'],
  d: '格子状の点を「前の位置との差」で動かし（ベルレ積分）、隣どうしの距離を一定に保つよう何度も補正すると布になる。つかんで引っぱり、強く引くと破れる。',
  p: '速度を持たず、前回の位置から次の位置を決めるので、距離を直接書き換えても計算が破綻しにくい。',
  html: `<canvas id="c"></canvas><p>布をつかんで引っぱってください（強く引くと破れます）</p>`,
  css: `body { background: #e9e4d8; overflow: hidden; touch-action: none; } canvas { display: block; width: 100vw; height: 100vh; } p { position: fixed; bottom: 8px; width: 100%; text-align: center; margin: 0; font-size: 12px; color: #555; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let P, L, gap;
    function build() {
      c.width = innerWidth; c.height = innerHeight;
      const cols = 34, rows = 20; gap = Math.min(c.width / (cols + 4), c.height / (rows + 8));
      const ox = (c.width - gap * (cols - 1)) / 2, oy = 30;
      P = []; L = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        P.push({ x: ox + i * gap, y: oy + j * gap, px: ox + i * gap, py: oy + j * gap, pin: j === 0 && i % 3 === 0 });
        const k = P.length - 1;
        if (i) L.push([k - 1, k]);
        if (j) L.push([k - cols, k]);
      }
    }
    build(); addEventListener('resize', build);
    let grab = null;
    c.addEventListener('pointerdown', (e) => {
      let best = null, bd = 900;
      for (const p of P) { const d = (p.x - e.clientX) ** 2 + (p.y - e.clientY) ** 2; if (d < bd) { bd = d; best = p; } }
      grab = best; c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => { if (grab) { grab.x = e.clientX; grab.y = e.clientY; } });
    c.addEventListener('pointerup', () => { grab = null; });
    (function loop(t) {
      if (window.THUMB) { const p = P[P.length - 17]; p.x += Math.sin(t / 300) * 4; }
      for (const p of P) {
        if (p.pin || p === grab) continue;
        const vx = (p.x - p.px) * 0.99, vy = (p.y - p.py) * 0.99;
        p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + 0.35;
      }
      for (let it = 0; it < 4; it++) {
        for (let k = L.length - 1; k >= 0; k--) {
          const a = P[L[k][0]], b = P[L[k][1]];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d > gap * 4.5) { L.splice(k, 1); continue; }
          const f = (d - gap) / d / 2;
          if (!a.pin && a !== grab) { a.x += dx * f; a.y += dy * f; }
          if (!b.pin && b !== grab) { b.x -= dx * f; b.y -= dy * f; }
        }
      }
      x.clearRect(0, 0, c.width, c.height);
      x.lineWidth = 1;
      for (const [i, j] of L) {
        const a = P[i], b = P[j];
        x.strokeStyle = `hsl(${200 + (a.y / c.height) * 120} 60% 40%)`;
        x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
      }
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'pt-rope', c: 'particle', lv: 2,
  t: 'ぶら下がるロープ', y: 'ぶらさがるろーぷ',
  tags: ['ベルレ積分', 'ロープ', '振り子', 'マウス'],
  d: '点をひもでつないだ鎖の先頭をマウスに合わせる。残りの点は重力で垂れ下がり、揺れが先端まで伝わる。先端には重りの玉が付いている。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #14202b; overflow: hidden; cursor: grab; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const N = 30, SEG = 12;
    const P = Array.from({ length: N }, (_, i) => ({ x: innerWidth / 2, y: 40 + i * SEG, px: innerWidth / 2, py: 40 + i * SEG }));
    let mx = innerWidth / 2, my = 60, moved = false;
    addEventListener('pointermove', (e) => { moved = true; mx = e.clientX; my = e.clientY; });
    (function loop(t) {
      if (!moved) { mx = c.width / 2 + Math.sin(t / 700) * c.width * 0.25; my = 60 + Math.abs(Math.sin(t / 1300)) * 40; }
      P[0].x = mx; P[0].y = my;
      for (let i = 1; i < N; i++) { const p = P[i]; const vx = (p.x - p.px) * 0.995, vy = (p.y - p.py) * 0.995; p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + 0.5; }
      for (let it = 0; it < 8; it++) for (let i = 1; i < N; i++) {
        const a = P[i - 1], b = P[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - SEG) / d;
        if (i - 1 === 0) { b.x -= dx * f; b.y -= dy * f; } else { a.x += dx * f / 2; a.y += dy * f / 2; b.x -= dx * f / 2; b.y -= dy * f / 2; }
      }
      x.clearRect(0, 0, c.width, c.height);
      x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = 6; x.strokeStyle = '#d9b382';
      x.beginPath(); P.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.stroke();
      const e = P[N - 1];
      const g = x.createRadialGradient(e.x - 6, e.y - 6, 2, e.x, e.y, 22);
      g.addColorStop(0, '#fff'); g.addColorStop(0.3, '#e0532f'); g.addColorStop(1, '#6b1d0e');
      x.fillStyle = g; x.beginPath(); x.arc(e.x, e.y, 20, 0, Math.PI * 2); x.fill();
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'pt-bouncing-balls', c: 'particle', lv: 3,
  t: '弾き合う玉', y: 'はじきあうたま',
  tags: ['衝突', '弾性', '運動量', '物理'],
  d: '重さの違う玉どうしがぶつかると、運動量を保ったまま跳ね返る。重力つきの箱の中で転がり、つかんで投げることもできる。',
  p: '2つの玉を結ぶ線の向きの速度成分だけを交換するのが、弾性衝突の計算のかなめ。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #f3efe6; overflow: hidden; touch-action: none; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const balls = Array.from({ length: 22 }, (_, i) => { const r = 14 + Math.random() * 26; return { x: Math.random() * innerWidth, y: Math.random() * innerHeight * 0.5, vx: (Math.random() - 0.5) * 8, vy: 0, r, m: r * r, h: i * 16 }; });
    let grab = null, last = null;
    c.addEventListener('pointerdown', (e) => { grab = balls.find((b) => Math.hypot(b.x - e.clientX, b.y - e.clientY) < b.r) || null; last = [e.clientX, e.clientY]; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (grab) { grab.vx = e.clientX - last[0]; grab.vy = e.clientY - last[1]; grab.x = e.clientX; grab.y = e.clientY; last = [e.clientX, e.clientY]; } });
    c.addEventListener('pointerup', () => { grab = null; });
    (function loop() {
      for (const b of balls) {
        if (b !== grab) { b.vy += 0.3; b.x += b.vx; b.y += b.vy; }
        if (b.x < b.r) { b.x = b.r; b.vx *= -0.9; } if (b.x > c.width - b.r) { b.x = c.width - b.r; b.vx *= -0.9; }
        if (b.y > c.height - b.r) { b.y = c.height - b.r; b.vy *= -0.82; b.vx *= 0.995; } if (b.y < b.r) { b.y = b.r; b.vy *= -0.9; }
      }
      for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
        if (d >= min || d === 0) continue;
        const nx = dx / d, ny = dy / d, over = (min - d) / 2;
        a.x -= nx * over; a.y -= ny * over; b.x += nx * over; b.y += ny * over;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel > 0) continue;
        const imp = (-(1 + 0.9) * rel) / (1 / a.m + 1 / b.m);
        a.vx -= (imp / a.m) * nx; a.vy -= (imp / a.m) * ny; b.vx += (imp / b.m) * nx; b.vy += (imp / b.m) * ny;
      }
      x.clearRect(0, 0, c.width, c.height);
      for (const b of balls) {
        const g = x.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
        g.addColorStop(0, '#fff'); g.addColorStop(0.35, `hsl(${b.h} 70% 58%)`); g.addColorStop(1, `hsl(${b.h} 70% 30%)`);
        x.fillStyle = g; x.beginPath(); x.arc(b.x, b.y, b.r, 0, Math.PI * 2); x.fill();
      }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'pt-nbody', c: 'particle', lv: 3,
  t: '引き合う星たち', y: 'ひきあうほしたち',
  tags: ['万有引力', 'N体問題', '軌道', '宇宙'],
  d: '星どうしが距離の2乗に反比例する力で引き合う。重い星のまわりを軽い星が回り、近づくと振り回される。画面をドラッグすると、その向きと勢いで新しい星を投げ入れられる。',
  html: `<canvas id="c"></canvas><p>ドラッグして星を投げ入れる</p>`,
  css: `body { background: #02030a; overflow: hidden; touch-action: none; } canvas { display: block; width: 100vw; height: 100vh; } p { position: fixed; bottom: 8px; width: 100%; text-align: center; margin: 0; font-size: 12px; color: #fff6; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; x.fillStyle = '#02030a'; x.fillRect(0, 0, c.width, c.height); };
    fit(); addEventListener('resize', fit);
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const S = [{ x: cx, y: cy, vx: 0, vy: 0, m: 2000, h: 45 }];
    for (let i = 0; i < 6; i++) {
      const r = 60 + i * 35, v = Math.sqrt(2000 / r) * 0.7;
      S.push({ x: cx + r, y: cy, vx: 0, vy: v * (i % 2 ? 1 : -1), m: 2 + Math.random() * 6, h: 180 + i * 30 });
    }
    let start = null;
    c.addEventListener('pointerdown', (e) => { start = [e.clientX, e.clientY]; });
    c.addEventListener('pointerup', (e) => { if (start) S.push({ x: start[0], y: start[1], vx: (start[0] - e.clientX) * -0.05, vy: (start[1] - e.clientY) * -0.05, m: 4, h: Math.random() * 360 }); start = null; });
    (function loop() {
      for (let k = 0; k < 2; k++) {
        for (const a of S) for (const b of S) {
          if (a === b) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy + 100, f = (b.m / d2) * 0.35 / Math.sqrt(d2);
          a.vx += dx * f; a.vy += dy * f;
        }
        for (const s of S) { s.x += s.vx * 0.5; s.y += s.vy * 0.5; }
      }
      x.fillStyle = '#02030a22'; x.fillRect(0, 0, c.width, c.height);
      for (const s of S) {
        x.fillStyle = `hsl(${s.h} 90% 70%)`;
        x.beginPath(); x.arc(s.x, s.y, Math.max(1.5, Math.cbrt(s.m)), 0, Math.PI * 2); x.fill();
      }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'pt-rain-ripples', c: 'particle', lv: 2,
  t: '雨と波紋', y: 'あめとはもん',
  tags: ['雨', '波紋', '粒子', '夜'],
  d: '斜めに降る雨粒が地面の高さに届いたら、その場に横長の輪（楕円）を生み、広げながら薄くする。奥の地面ほど輪を小さくすると奥行きが出る。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: linear-gradient(#0c1424, #1d2b3f 60%, #24344a 60%, #0d141f); overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const drops = [], rings = [];
    (function loop() {
      for (let i = 0; i < 5; i++) { const gy = c.height * (0.62 + Math.random() * 0.38); drops.push({ x: Math.random() * c.width * 1.2, y: -20, gy, v: 12 + Math.random() * 6 }); }
      x.clearRect(0, 0, c.width, c.height);
      x.strokeStyle = '#a8c4e866'; x.lineWidth = 1;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.y += d.v; d.x -= d.v * 0.2;
        x.beginPath(); x.moveTo(d.x, d.y); x.lineTo(d.x + 3, d.y - 14); x.stroke();
        if (d.y >= d.gy) { rings.push({ x: d.x, y: d.gy, r: 1, k: (d.gy - c.height * 0.6) / (c.height * 0.4) }); drops.splice(i, 1); }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.r += 0.8;
        const max = 10 + r.k * 30, a = 1 - r.r / max;
        if (a <= 0) { rings.splice(i, 1); continue; }
        x.strokeStyle = `rgba(190, 215, 255, ${a * 0.7})`;
        x.beginPath(); x.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, Math.PI * 2); x.stroke();
      }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'pt-smoke', c: 'particle', lv: 2,
  t: '立ちのぼる煙', y: 'たちのぼるけむり',
  tags: ['煙', '粒子', 'ぼかし', '合成'],
  d: 'ぼかした丸を1枚だけ別のキャンバスに作っておき、それを大きさと濃さを変えて何百回も貼る。上へ漂いながら広がり薄れていく粒が煙になる。マウスの位置から立ちのぼる。',
  p: '毎回グラデーションを作らず、あらかじめ描いた画像を drawImage で貼ると速い。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #1a1612; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const puff = document.createElement('canvas'); puff.width = puff.height = 64;
    const px = puff.getContext('2d'), g = px.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(220, 215, 205, .5)'); g.addColorStop(1, 'rgba(220, 215, 205, 0)');
    px.fillStyle = g; px.fillRect(0, 0, 64, 64);
    let ex = innerWidth / 2, ey = innerHeight * 0.85, moved = false;
    addEventListener('pointermove', (e) => { moved = true; ex = e.clientX; ey = e.clientY; });
    const ps = [];
    (function loop(t) {
      if (!moved) ex = c.width / 2 + Math.sin(t / 1500) * 40;
      for (let i = 0; i < 3; i++) ps.push({ x: ex, y: ey, vx: (Math.random() - 0.5) * 0.6, vy: -1 - Math.random(), s: 20, life: 1, ph: Math.random() * 6 });
      x.clearRect(0, 0, c.width, c.height);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.ph += 0.03; p.x += p.vx + Math.sin(p.ph) * 0.6; p.y += p.vy; p.s += 0.9; p.life -= 0.006;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        x.globalAlpha = p.life * 0.6;
        x.drawImage(puff, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
      x.globalAlpha = 1;
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'pt-constellation', c: 'particle', lv: 1,
  t: '点と線の星座', y: 'てんとせんのせいざ',
  tags: ['ネットワーク', '距離', '線', '背景'],
  d: 'ゆっくり漂う点のうち、近いものどうしを線で結ぶ。距離が近いほど線を濃くする。マウスのまわりの点はマウスとも結ばれる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: radial-gradient(#1c2a44, #0a0f1b); overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const P = Array.from({ length: 90 }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6 }));
    const m = { x: -1e4, y: -1e4 };
    addEventListener('pointermove', (e) => { m.x = e.clientX; m.y = e.clientY; });
    (function loop() {
      x.clearRect(0, 0, c.width, c.height);
      const all = [...P, m];
      for (const p of P) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > c.width) p.vx *= -1; if (p.y < 0 || p.y > c.height) p.vy *= -1; }
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
        if (d < 130) { x.strokeStyle = `rgba(140, 200, 255, ${1 - d / 130})`; x.beginPath(); x.moveTo(all[i].x, all[i].y); x.lineTo(all[j].x, all[j].y); x.stroke(); }
      }
      x.fillStyle = '#d6ecff';
      for (const p of P) { x.beginPath(); x.arc(p.x, p.y, 2, 0, Math.PI * 2); x.fill(); }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'pt-falling-sand', c: 'particle', lv: 2,
  t: '落ちる砂', y: 'おちるすな',
  tags: ['セル・オートマトン', '砂', 'お絵かき', 'ピクセル'],
  d: '格子の1マスずつが「下が空いていれば落ちる、ふさがっていれば斜め下へ転がる」だけの規則で動く。なぞった所から砂が出て、山を作って崩れていく。',
  html: `<canvas id="c"></canvas><p>なぞると砂が出ます</p>`,
  css: `body { background: #12100e; overflow: hidden; touch-action: none; } canvas { display: block; width: 100vw; height: 100vh; image-rendering: pixelated; } p { position: fixed; top: 6px; width: 100%; text-align: center; margin: 0; font-size: 12px; color: #fff7; pointer-events: none; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const W = 160, H = 100;
    c.width = W; c.height = H;
    const g = new Uint16Array(W * H);
    const img = x.createImageData(W, H);
    let hue = 30, pour = null;
    const add = (px, py) => { for (let k = 0; k < 5; k++) { const ax = px + Math.floor(Math.random() * 5 - 2), ay = py + Math.floor(Math.random() * 3 - 1); if (ax >= 0 && ay >= 0 && ax < W && ay < H && !g[ay * W + ax]) g[ay * W + ax] = 1 + Math.floor(hue); } };
    const pos = (e) => { const r = c.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * W), Math.floor(((e.clientY - r.top) / r.height) * H)]; };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); pour = pos(e); });
    c.addEventListener('pointermove', (e) => { if (pour) pour = pos(e); });
    c.addEventListener('pointerup', () => { pour = null; });
    (function loop(t) {
      hue = (hue + 0.4) % 360;
      if (pour) add(...pour);
      else add(Math.floor(W / 2 + Math.sin(t / 900) * W * 0.35), 2);
      for (let y = H - 2; y >= 0; y--) {
        const ltr = Math.random() < 0.5;
        for (let k = 0; k < W; k++) {
          const xx = ltr ? k : W - 1 - k, i = y * W + xx, v = g[i];
          if (!v) continue;
          const below = i + W;
          if (!g[below]) { g[below] = v; g[i] = 0; continue; }
          const dir = Math.random() < 0.5 ? -1 : 1;
          for (const d of [dir, -dir]) { const nx = xx + d; if (nx >= 0 && nx < W && !g[below + d]) { g[below + d] = v; g[i] = 0; break; } }
        }
      }
      let full = 0;
      for (let i = 0; i < W * H; i++) {
        const v = g[i], o = i * 4;
        if (v) { full++; const h = (v - 1) / 60; img.data[o] = 200 + 55 * Math.sin(h); img.data[o + 1] = 150 + 60 * Math.sin(h + 2); img.data[o + 2] = 90 + 80 * Math.sin(h + 4); }
        else { img.data[o] = 18; img.data[o + 1] = 16; img.data[o + 2] = 14; }
        img.data[o + 3] = 255;
      }
      if (full > W * H * 0.6) g.fill(0);
      x.putImageData(img, 0, 0);
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'pt-double-pendulum', c: 'particle', lv: 3,
  t: '二重振り子', y: 'にじゅうふりこ',
  tags: ['カオス', '振り子', '運動方程式', '軌跡'],
  d: '振り子の先にもう1つ振り子を付けると、動きがまったく予測できなくなる（カオス）。運動方程式を少しずつ数値で解き、先端の軌跡を描き残す。',
  p: '最初の角度がほんの少し違うだけで、数秒後の動きは別物になる。',
  html: `<canvas id="trail"></canvas><canvas id="c"></canvas><button id="re">やり直す</button>`,
  css: `body { background: #0b0b10; overflow: hidden; } canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; } button { position: fixed; right: 10px; bottom: 10px; }`,
  js() {
    const tc = document.getElementById('trail'), tx = tc.getContext('2d');
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = tc.width = innerWidth; c.height = tc.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const g = 9.8, m1 = 1, m2 = 1;
    let a1, a2, w1, w2, prev;
    const reset = () => { a1 = Math.PI * (0.6 + Math.random() * 0.4); a2 = Math.PI * (0.6 + Math.random() * 0.4); w1 = w2 = 0; prev = null; tx.clearRect(0, 0, tc.width, tc.height); };
    reset();
    document.getElementById('re').onclick = reset;
    (function loop(t) {
      const L = Math.min(c.width, c.height) * 0.22, L1 = 1, L2 = 1;
      for (let s = 0; s < 10; s++) {
        const dt = 0.004, d = a1 - a2, den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
        const al1 = (-g * (2 * m1 + m2) * Math.sin(a1) - m2 * g * Math.sin(a1 - 2 * a2) - 2 * Math.sin(d) * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * Math.cos(d))) / (L1 * den);
        const al2 = (2 * Math.sin(d) * (w1 * w1 * L1 * (m1 + m2) + g * (m1 + m2) * Math.cos(a1) + w2 * w2 * L2 * m2 * Math.cos(d))) / (L2 * den);
        w1 += al1 * dt; w2 += al2 * dt; a1 += w1 * dt; a2 += w2 * dt;
      }
      const ox = c.width / 2, oy = c.height * 0.4;
      const x1 = ox + L * Math.sin(a1), y1 = oy + L * Math.cos(a1), x2 = x1 + L * Math.sin(a2), y2 = y1 + L * Math.cos(a2);
      tx.fillStyle = '#0b0b1006'; tx.fillRect(0, 0, tc.width, tc.height);
      if (prev) { tx.strokeStyle = `hsl(${(t / 30) % 360} 90% 60%)`; tx.lineWidth = 2; tx.beginPath(); tx.moveTo(prev[0], prev[1]); tx.lineTo(x2, y2); tx.stroke(); }
      prev = [x2, y2];
      x.clearRect(0, 0, c.width, c.height);
      x.strokeStyle = '#ddd'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(ox, oy); x.lineTo(x1, y1); x.lineTo(x2, y2); x.stroke();
      x.fillStyle = '#fff'; for (const [px, py, r] of [[ox, oy, 4], [x1, y1, 10], [x2, y2, 10]]) { x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill(); }
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'pt-galaxy', c: 'particle', lv: 2,
  t: '渦巻く銀河', y: 'うずまくぎんが',
  tags: ['銀河', '渦巻き', '粒子', '加算合成'],
  d: '星を数本の腕に沿って並べ、中心に近い星ほど速く回す。回る速さの違いで腕がねじれ、渦巻き銀河の形になる。縦方向を縮めて斜めから見た姿にしている。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const ARMS = 3;
    const stars = Array.from({ length: 4000 }, (_, i) => {
      const r = Math.pow(Math.random(), 1.6);
      const arm = (i % ARMS) * ((Math.PI * 2) / ARMS);
      return { r, a: arm + r * 5 + (Math.random() - 0.5) * (0.5 + (1 - r)), h: r < 0.15 ? 45 : 200 + Math.random() * 60, s: Math.random() * 1.6 + 0.3 };
    });
    (function loop() {
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = '#0000004d'; x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'lighter';
      const R = Math.min(c.width, c.height * 1.6) * 0.45, cx = c.width / 2, cy = c.height / 2;
      const core = x.createRadialGradient(cx, cy, 0, cx, cy, R * 0.25);
      core.addColorStop(0, '#fff3c466'); core.addColorStop(1, '#0000');
      x.fillStyle = core; x.fillRect(cx - R, cy - R, R * 2, R * 2);
      for (const s of stars) {
        s.a += 0.002 / (s.r + 0.08);
        const px = cx + Math.cos(s.a) * s.r * R, py = cy + Math.sin(s.a) * s.r * R * 0.45;
        x.fillStyle = `hsla(${s.h} 80% 75% / .8)`;
        x.fillRect(px, py, s.s, s.s);
      }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'pt-softbody', c: 'particle', lv: 3,
  t: 'ぷるぷるの生き物', y: 'ぷるぷるのいきもの',
  tags: ['ソフトボディ', 'バネ', '圧力', 'ドラッグ'],
  d: '輪につないだ点をバネで結び、中の面積が元より小さくなったら外へ押し返す力（圧力）を加える。落ちて弾み、つまむと伸びる、ぷるぷるの物体になる。',
  html: `<canvas id="c"></canvas><p>つまんで投げられます</p>`,
  css: `body { background: #e9f6ef; overflow: hidden; touch-action: none; } canvas { display: block; width: 100vw; height: 100vh; } p { position: fixed; top: 8px; width: 100%; text-align: center; margin: 0; font-size: 12px; color: #567; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const N = 26, R = Math.min(innerWidth, innerHeight) * 0.16;
    const P = Array.from({ length: N }, (_, i) => { const a = (i / N) * Math.PI * 2; return { x: innerWidth / 2 + Math.cos(a) * R, y: innerHeight * 0.3 + Math.sin(a) * R, vx: 0, vy: 0 }; });
    const rest = 2 * R * Math.sin(Math.PI / N), area0 = Math.PI * R * R;
    let grab = null;
    c.addEventListener('pointerdown', (e) => { let bd = 1e9; for (const p of P) { const d = (p.x - e.clientX) ** 2 + (p.y - e.clientY) ** 2; if (d < bd) { bd = d; grab = p; } } c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (grab) { grab.vx = (e.clientX - grab.x) * 0.5; grab.vy = (e.clientY - grab.y) * 0.5; grab.x = e.clientX; grab.y = e.clientY; } });
    c.addEventListener('pointerup', () => { grab = null; });
    (function loop() {
      for (let s = 0; s < 3; s++) {
        let area = 0;
        for (let i = 0; i < N; i++) { const a = P[i], b = P[(i + 1) % N]; area += (a.x * b.y - b.x * a.y) / 2; }
        const press = (area0 / Math.max(area, 1) - 1) * 4;
        for (let i = 0; i < N; i++) {
          const a = P[i], b = P[(i + 1) % N], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          const f = (d - rest) * 0.4, fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
          const nx = dy / d, ny = -dx / d;
          a.vx += nx * press; a.vy += ny * press; b.vx += nx * press; b.vy += ny * press;
        }
        for (const p of P) {
          if (p === grab) continue;
          p.vy += 0.15; p.vx *= 0.985; p.vy *= 0.985;
          p.x += p.vx / 3; p.y += p.vy / 3;
          if (p.y > c.height - 4) { p.y = c.height - 4; p.vy *= -0.5; p.vx *= 0.9; }
          if (p.x < 4) { p.x = 4; p.vx *= -0.5; } if (p.x > c.width - 4) { p.x = c.width - 4; p.vx *= -0.5; }
          if (p.y < 4) { p.y = 4; p.vy *= -0.5; }
        }
      }
      x.clearRect(0, 0, c.width, c.height);
      x.beginPath();
      for (let i = 0; i <= N; i++) { const a = P[i % N], b = P[(i + 1) % N], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; i ? x.quadraticCurveTo(a.x, a.y, mx, my) : x.moveTo(mx, my); }
      x.fillStyle = '#ff8fb1'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#d9577f'; x.stroke();
      const cx = P.reduce((s, p) => s + p.x, 0) / N, cy = P.reduce((s, p) => s + p.y, 0) / N;
      x.fillStyle = '#2b1b22';
      x.beginPath(); x.arc(cx - R * 0.3, cy - R * 0.1, R * 0.09, 0, 7); x.arc(cx + R * 0.3, cy - R * 0.1, R * 0.09, 0, 7); x.fill();
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'pt-magnet-field', c: 'particle', lv: 3,
  t: '磁石と砂鉄の模様', y: 'じしゃくとさてつのもよう',
  tags: ['磁場', 'ベクトル場', 'ドラッグ', '物理'],
  d: '2つの棒磁石が作る磁場の向きを、画面の格子点ごとに計算し、短い線（砂鉄）をその向きに並べる。磁石をドラッグすると模様がその場で変わる。',
  p: '棒磁石を「N極の点」と「S極の点」の組と考え、各点からの力を距離の2乗で割って足し合わせている。',
  html: `<canvas id="c"></canvas><p>磁石をドラッグできます</p>`,
  css: `body { background: #ece6d8; overflow: hidden; touch-action: none; } canvas { display: block; width: 100vw; height: 100vh; } p { position: fixed; top: 6px; width: 100%; text-align: center; margin: 0; font-size: 12px; color: #555; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const mags = [{ x: innerWidth * 0.35, y: innerHeight / 2, a: 0 }, { x: innerWidth * 0.65, y: innerHeight / 2, a: 0.6 }];
    let grab = null;
    c.addEventListener('pointerdown', (e) => { grab = mags.find((m) => Math.hypot(m.x - e.clientX, m.y - e.clientY) < 50) || null; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (grab) { grab.x = e.clientX; grab.y = e.clientY; } });
    c.addEventListener('pointerup', () => { grab = null; });
    const poles = () => mags.flatMap((m) => [[m.x + Math.cos(m.a) * 40, m.y + Math.sin(m.a) * 40, 1], [m.x - Math.cos(m.a) * 40, m.y - Math.sin(m.a) * 40, -1]]);
    (function loop(t) {
      if (window.THUMB) mags[1].a = t / 1000;
      x.fillStyle = '#ece6d8'; x.fillRect(0, 0, c.width, c.height);
      const ps = poles(), G = 14;
      x.strokeStyle = '#2a2622'; x.lineWidth = 1.2;
      for (let py = G / 2; py < c.height; py += G) for (let px = G / 2; px < c.width; px += G) {
        let bx = 0, by = 0;
        for (const [qx, qy, q] of ps) { const dx = px - qx, dy = py - qy, d2 = dx * dx + dy * dy + 30, d = Math.sqrt(d2); bx += (q * dx) / (d2 * d); by += (q * dy) / (d2 * d); }
        const mag = Math.hypot(bx, by);
        if (!mag) continue;
        const len = 5, ux = (bx / mag) * len, uy = (by / mag) * len;
        x.globalAlpha = Math.min(1, mag * 4000);
        x.beginPath(); x.moveTo(px - ux, py - uy); x.lineTo(px + ux, py + uy); x.stroke();
      }
      x.globalAlpha = 1;
      for (const m of mags) {
        x.save(); x.translate(m.x, m.y); x.rotate(m.a);
        x.fillStyle = '#d33'; x.fillRect(0, -12, 46, 24); x.fillStyle = '#36c'; x.fillRect(-46, -12, 46, 24);
        x.fillStyle = '#fff'; x.font = 'bold 14px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('N', 30, 0); x.fillText('S', -30, 0);
        x.restore();
      }
      requestAnimationFrame(loop);
    })(0);
  },
});
