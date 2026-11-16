/* キャンバス描画 */
dekiru.add({
  id: 'cv-paint', c: 'canvas', lv: 2,
  t: 'お絵かき帳', y: 'おえかきちょう',
  tags: ['canvas', 'Pointer Events', '筆圧', 'PNG保存'],
  d: 'マウス・指・ペンで描ける。ペンなら筆圧で線の太さが変わる。色・太さ・消しゴム・全消去・PNG での保存まで、すべて標準の機能で作る。',
  p: 'getCoalescedEvents() を使うと、1回の pointermove の間に起きた細かい動きも拾えて、速く描いても線が角ばらない。',
  html: `
    <div class="tools">
      <label>色 <input type="color" id="col" value="#e0532f"></label>
      <label>太さ <input type="range" id="size" min="1" max="60" value="8"></label>
      <button id="eraser" aria-pressed="false">消しゴム</button>
      <button id="clear">全部消す</button>
      <button id="save">PNGで保存</button>
    </div>
    <canvas id="c"></canvas>`,
  css: `
    body { display: flex; flex-direction: column; background: #e9e4da; touch-action: none; }
    .tools { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding: 8px 12px; background: #fff; border-bottom: 1px solid #ddd; font-size: 13px; }
    .tools label { display: inline-flex; gap: 6px; align-items: center; }
    [aria-pressed="true"] { background: #222; color: #fff; }
    canvas { flex: 1; width: 100%; background: #fffdf7; cursor: crosshair; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const col = document.getElementById('col'), size = document.getElementById('size'), er = document.getElementById('eraser');
    function fit() {
      // 描いた絵を残したまま大きさを変える。幅か高さが0の canvas は drawImage に渡せないので飛ばす
      const old = document.createElement('canvas');
      old.width = c.width; old.height = c.height;
      const hasOld = c.width > 0 && c.height > 0;
      if (hasOld) old.getContext('2d').drawImage(c, 0, 0);
      const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
      c.width = r.width * dpr; c.height = r.height * dpr;
      if (hasOld && c.width > 0 && c.height > 0) x.drawImage(old, 0, 0);
      x.scale(dpr, dpr);
    }
    fit(); addEventListener('resize', fit);
    let last = null;
    const pt = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }; };
    function line(a, b) {
      x.globalCompositeOperation = er.getAttribute('aria-pressed') === 'true' ? 'destination-out' : 'source-over';
      x.strokeStyle = col.value; x.lineCap = x.lineJoin = 'round';
      x.lineWidth = size.value * (e2p(b.p));
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
    }
    const e2p = (p) => (p === 0.5 ? 1 : 0.3 + p * 1.4);
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); last = pt(e); line(last, last); });
    c.addEventListener('pointermove', (e) => {
      if (!last) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) { const p = pt(ev); line(last, p); last = p; }
    });
    c.addEventListener('pointerup', () => { last = null; });
    er.onclick = () => er.setAttribute('aria-pressed', er.getAttribute('aria-pressed') !== 'true');
    document.getElementById('clear').onclick = () => { x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.restore(); };
    document.getElementById('save').onclick = () => c.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = 'oekaki.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    });
    if (window.THUMB) { let t = 0, p = null; setInterval(() => { t += 0.08; const q = { x: c.clientWidth / 2 + Math.sin(t * 1.3) * c.clientWidth * 0.35, y: c.clientHeight / 2 + Math.sin(t * 2.1) * c.clientHeight * 0.3, p: 0.5 }; col.value = `#${Math.floor(((Math.sin(t) + 1) / 2) * 0xffffff).toString(16).padStart(6, '0')}`; if (p) line(p, q); p = q; }, 30); }
  },
}, {
  id: 'cv-flowfield', c: 'canvas', lv: 2,
  t: '流れ場', y: 'ながれば',
  tags: ['ジェネラティブアート', '粒子', 'ノイズ', '軌跡'],
  d: '画面のどの点にも「流れる向き」を決めておき、たくさんの粒をその向きに少しずつ進める。通った跡を薄く残すと、川の流れや髪の毛のような模様が浮かぶ。',
  p: '向きは sin と cos を重ねた滑らかな関数から決めている。時間 t を混ぜると流れ自体がゆっくり変わる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #0b0d14; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; x.fillStyle = '#0b0d14'; x.fillRect(0, 0, c.width, c.height); };
    fit(); addEventListener('resize', fit);
    const ps = Array.from({ length: 1400 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, life: Math.random() * 200 }));
    const angle = (px, py, t) => {
      const s = 0.0035;
      return (Math.sin(px * s + t) + Math.cos(py * s * 1.3 - t * 0.7) + Math.sin((px + py) * s * 0.6 + t * 0.4)) * Math.PI;
    };
    (function loop(time) {
      const t = time / 6000;
      x.fillStyle = '#0b0d1408';
      x.fillRect(0, 0, c.width, c.height);
      x.lineWidth = 1;
      for (const p of ps) {
        const a = angle(p.x, p.y, t);
        const nx = p.x + Math.cos(a) * 1.6, ny = p.y + Math.sin(a) * 1.6;
        x.strokeStyle = `hsla(${(a * 57 + 200) % 360} 80% 65% / .55)`;
        x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(nx, ny); x.stroke();
        p.x = nx; p.y = ny;
        if (--p.life < 0 || nx < 0 || ny < 0 || nx > c.width || ny > c.height) { p.x = Math.random() * c.width; p.y = Math.random() * c.height; p.life = 100 + Math.random() * 200; }
      }
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'cv-tree', c: 'canvas', lv: 2,
  t: '風に揺れる桜の木', y: 'かぜにゆれるさくらのき',
  tags: ['再帰', 'フラクタル', '木', '桜'],
  d: '枝を描いたら、その先から少し短い枝を2本生やす。これを自分自身の呼び出し（再帰）で10段繰り返すと木になる。枝ごとに時間で角度を揺らすと風を受ける。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: linear-gradient(#cfe7ff, #fff3f6); overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    let t = 0;
    function branch(len, depth) {
      x.lineWidth = Math.max(1, depth * 1.4);
      x.strokeStyle = depth > 2 ? '#4a3426' : '#6b4b35';
      x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -len); x.stroke();
      x.translate(0, -len);
      if (depth === 0) {
        x.fillStyle = `hsl(${340 + Math.sin(len) * 10} 80% 85%)`;
        x.beginPath(); x.arc(0, 0, 4, 0, Math.PI * 2); x.fill();
        return;
      }
      const sway = Math.sin(t + depth * 0.7) * 0.03 * (10 - depth);
      for (const dir of [-1, 1]) {
        x.save();
        x.rotate(dir * (0.38 + depth * 0.01) + sway);
        branch(len * 0.76, depth - 1);
        x.restore();
      }
    }
    (function loop() {
      t += 0.02;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = '#7fb06a'; x.fillRect(0, c.height - 20, c.width, 20);
      x.translate(c.width / 2, c.height - 20);
      branch(Math.min(c.height, c.width) * 0.2, 10);
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'cv-spirograph', c: 'canvas', lv: 2,
  t: 'スピログラフ', y: 'すぴろぐらふ',
  tags: ['数式', '曲線', '内サイクロイド', '模様'],
  d: '大きな円の内側を小さな円が転がるとき、小さな円に付けたペン先が描く曲線（内トロコイド）を少しずつ描き足す。描き終わると別の歯車に替えてまた始める。',
  html: `<canvas id="c"></canvas><p id="info"></p>`,
  css: `body { background: #fffaf0; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; } p { position: fixed; left: 12px; bottom: 8px; margin: 0; font: 12px ui-monospace, monospace; color: #777; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let R, r, d, t, end, hue, prev;
    function start() {
      R = 96; r = 20 + Math.floor(Math.random() * 60); d = 20 + Math.random() * 60;
      t = 0; end = (Math.PI * 2 * r) / gcd(R, r); hue = Math.random() * 360; prev = null;
      x.fillStyle = '#fffaf0'; x.fillRect(0, 0, c.width, c.height);
      document.getElementById('info').textContent = `大円 ${R} ・ 小円 ${r} ・ ペン ${d.toFixed(0)}`;
    }
    start();
    (function loop() {
      const k = Math.min(c.width, c.height) / 2 / (R - r + d) * 0.9;
      for (let i = 0; i < 40 && t < end; i++) {
        t += 0.01;
        const px = c.width / 2 + ((R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)) * k;
        const py = c.height / 2 + ((R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)) * k;
        if (prev) { x.strokeStyle = `hsl(${hue + t * 4} 70% 45%)`; x.lineWidth = 1.2; x.beginPath(); x.moveTo(prev[0], prev[1]); x.lineTo(px, py); x.stroke(); }
        prev = [px, py];
      }
      if (t >= end) setTimeout(start, 1500), (t = -Infinity);
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'cv-matrix-rain', c: 'canvas', lv: 1,
  t: '降りそそぐ文字', y: 'ふりそそぐもじ',
  tags: ['カタカナ', '文字の雨', 'canvas', 'サイバー'],
  d: '画面を列に分け、各列で1文字ずつ下へ書いていく。毎回うすい黒で塗り重ねるので、上に書いた文字ほど暗くなり、雨のような尾ができる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789出来る';
    const S = 18;
    let drops = [];
    const fit = () => { c.width = innerWidth; c.height = innerHeight; drops = Array.from({ length: Math.ceil(c.width / S) }, () => Math.random() * -50); };
    fit(); addEventListener('resize', fit);
    setInterval(() => {
      x.fillStyle = '#0000000f';
      x.fillRect(0, 0, c.width, c.height);
      x.font = `${S}px ui-monospace, monospace`;
      drops.forEach((y, i) => {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        x.fillStyle = '#d6ffd6';
        x.fillText(ch, i * S, y * S);
        x.fillStyle = '#2bff6a';
        x.fillText(chars[Math.floor(Math.random() * chars.length)], i * S, (y - 1) * S);
        drops[i] = y * S > c.height && Math.random() > 0.975 ? 0 : y + 1;
      });
    }, 50);
  },
}, {
  id: 'cv-lissajous', c: 'canvas', lv: 1,
  t: 'リサジュー図形', y: 'りさじゅーずけい',
  tags: ['数式', '振動', '曲線', 'sin'],
  d: '横と縦をそれぞれ違う速さで振動させた点の軌跡。速さの比 a:b と位相のずれで、8の字や花びらのような形に変わっていく。',
  html: `<canvas id="c"></canvas><p id="info"></p>`,
  css: `body { background: #0a1018; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; } p { position: fixed; left: 0; right: 0; bottom: 10px; text-align: center; margin: 0; font: 16px ui-monospace, monospace; color: #7fd4ff; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const ratios = [[1, 2], [3, 2], [3, 4], [5, 4], [5, 6], [2, 3], [4, 5], [7, 6]];
    let k = 0;
    (function loop(time) {
      const [a, b] = ratios[Math.floor(time / 4000) % ratios.length];
      const phase = time / 1500;
      document.getElementById('info').textContent = `a : b = ${a} : ${b}`;
      x.fillStyle = '#0a101833'; x.fillRect(0, 0, c.width, c.height);
      const R = Math.min(c.width, c.height) * 0.4;
      x.lineWidth = 2;
      x.beginPath();
      for (let i = 0; i <= 600; i++) {
        const t = (i / 600) * Math.PI * 2;
        const px = c.width / 2 + R * Math.sin(a * t + phase), py = c.height / 2 + R * Math.sin(b * t);
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.strokeStyle = `hsl(${(k += 0.5) % 360} 90% 65%)`;
      x.stroke();
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'cv-voronoi', c: 'canvas', lv: 3,
  t: '動くボロノイ図', y: 'うごくぼろのいず',
  tags: ['ボロノイ', 'ピクセル操作', '最近傍', '幾何'],
  d: '画面のすべての点を「いちばん近い種」の色で塗り分ける。種がゆっくり動くので、細胞の境界がうごめく。小さな解像度で計算して拡大している。',
  p: '1番目と2番目に近い種までの距離がほぼ等しい点を暗くすると、境界線が浮かび上がる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #111; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; image-rendering: auto; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const W = 200, H = 125;
    c.width = W; c.height = H;
    const img = x.createImageData(W, H);
    const seeds = Array.from({ length: 22 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, col: [120 + Math.random() * 135, 80 + Math.random() * 120, 120 + Math.random() * 135] }));
    (function loop() {
      for (const s of seeds) { s.x += s.vx; s.y += s.vy; if (s.x < 0 || s.x > W) s.vx *= -1; if (s.y < 0 || s.y > H) s.vy *= -1; }
      const d = img.data;
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        let b1 = Infinity, b2 = Infinity, best = null;
        for (const s of seeds) {
          const dd = (s.x - px) ** 2 + (s.y - py) ** 2;
          if (dd < b1) { b2 = b1; b1 = dd; best = s; } else if (dd < b2) b2 = dd;
        }
        const edge = Math.sqrt(b2) - Math.sqrt(b1) < 1.2 ? 0.25 : 1;
        const shade = Math.max(0.55, 1 - Math.sqrt(b1) / 60) * edge;
        const i = (py * W + px) * 4;
        d[i] = best.col[0] * shade; d[i + 1] = best.col[1] * shade; d[i + 2] = best.col[2] * shade; d[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'cv-maze', c: 'canvas', lv: 3,
  t: '迷路を作って解く', y: 'めいろをつくってとく',
  tags: ['迷路', '深さ優先探索', '幅優先探索', 'アルゴリズム'],
  d: '深さ優先探索で壁を壊しながら迷路を作り、できあがったら幅優先探索で入口から出口までの最短の道を探す。途中の様子をそのまま描く。',
  p: '作るときは「行き止まりまで進んで戻る」、解くときは「近い所から順に広げる」。同じ格子でも探し方で性格が違う。',
  html: `<canvas id="c"></canvas>`,
  css: `body { display: grid; place-items: center; background: #1a1d24; } canvas { max-width: 96vw; max-height: 96vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const CW = 31, CH = 19, S = 22;
    c.width = CW * S; c.height = CH * S;
    let walls, seen, stack, phase, queue, from, path;
    function init() {
      walls = Array.from({ length: CW * CH }, () => [1, 1, 1, 1]);
      seen = new Uint8Array(CW * CH); stack = [0]; seen[0] = 1; phase = 'make'; path = [];
    }
    const DIRS = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]];
    function stepMake() {
      const cur = stack[stack.length - 1];
      if (cur === undefined) { phase = 'solve'; queue = [0]; from = new Int32Array(CW * CH).fill(-2); from[0] = -1; return; }
      const cx = cur % CW, cy = (cur / CW) | 0;
      const opts = DIRS.filter(([dx, dy]) => { const nx = cx + dx, ny = cy + dy; return nx >= 0 && ny >= 0 && nx < CW && ny < CH && !seen[ny * CW + nx]; });
      if (!opts.length) { stack.pop(); return; }
      const [dx, dy, w, ow] = opts[Math.floor(Math.random() * opts.length)];
      const n = (cy + dy) * CW + cx + dx;
      walls[cur][w] = 0; walls[n][ow] = 0; seen[n] = 1; stack.push(n);
    }
    function stepSolve() {
      const cur = queue.shift();
      if (cur === undefined) return;
      if (cur === CW * CH - 1) { for (let k = cur; k >= 0; k = from[k]) path.push(k); phase = 'done'; setTimeout(init, 2500); return; }
      const cx = cur % CW, cy = (cur / CW) | 0;
      DIRS.forEach(([dx, dy, w]) => { const n = (cy + dy) * CW + cx + dx; if (!walls[cur][w] && from[n] === -2) { from[n] = cur; queue.push(n); } });
    }
    function draw() {
      x.fillStyle = '#f7f3e8'; x.fillRect(0, 0, c.width, c.height);
      if (phase !== 'make') { x.fillStyle = '#ffe2a8'; for (let i = 0; i < from.length; i++) if (from[i] !== -2) x.fillRect((i % CW) * S, ((i / CW) | 0) * S, S, S); }
      x.fillStyle = '#e0532f';
      for (const i of path) x.fillRect((i % CW) * S + S * 0.3, ((i / CW) | 0) * S + S * 0.3, S * 0.4, S * 0.4);
      if (phase === 'make') { x.fillStyle = '#9fd3ff'; for (const i of stack) x.fillRect((i % CW) * S + 3, ((i / CW) | 0) * S + 3, S - 6, S - 6); }
      x.strokeStyle = '#2b2b2b'; x.lineWidth = 2; x.beginPath();
      walls.forEach((w, i) => {
        const px = (i % CW) * S, py = ((i / CW) | 0) * S;
        if (w[0]) { x.moveTo(px, py); x.lineTo(px + S, py); }
        if (w[1]) { x.moveTo(px + S, py); x.lineTo(px + S, py + S); }
        if (w[2]) { x.moveTo(px, py + S); x.lineTo(px + S, py + S); }
        if (w[3]) { x.moveTo(px, py); x.lineTo(px, py + S); }
      });
      x.stroke();
    }
    init();
    (function loop() {
      for (let k = 0; k < 6; k++) { if (phase === 'make') stepMake(); else if (phase === 'solve') stepSolve(); }
      draw();
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'cv-life', c: 'canvas', lv: 2,
  t: 'ライフゲーム', y: 'らいふげーむ',
  tags: ['セル・オートマトン', '生命', 'シミュレーション', 'クリック'],
  d: '周りの8マスのうち生きているマスが3つなら誕生、2つか3つなら生存、それ以外は死ぬ。たったこれだけの規則から、動き回る模様や増え続ける模様が生まれる。',
  html: `<div class="bar"><button id="run">止める</button><button id="rand">でたらめに置く</button><button id="clr">消す</button><span>マスを押す・なぞると置けます</span></div><canvas id="c"></canvas>`,
  css: `body { display: flex; flex-direction: column; background: #0c1116; color: #ccd; touch-action: none; } .bar { display: flex; gap: 8px; align-items: center; padding: 8px; font-size: 12px; } canvas { flex: 1; width: 100%; min-height: 0; image-rendering: pixelated; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const W = 120, H = 70;
    c.width = W; c.height = H;
    let g = new Uint8Array(W * H), age = new Uint16Array(W * H), running = true;
    const rand = () => { for (let i = 0; i < g.length; i++) { g[i] = Math.random() < 0.22 ? 1 : 0; age[i] = 0; } };
    rand();
    const img = x.createImageData(W, H);
    function step() {
      const n = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) k += g[((y + dy + H) % H) * W + ((xx + dx + W) % W)];
        const i = y * W + xx, alive = g[i] ? k === 2 || k === 3 : k === 3;
        n[i] = alive ? 1 : 0;
        age[i] = alive ? Math.min(age[i] + 1, 400) : 0;
      }
      g = n;
    }
    function draw() {
      const d = img.data;
      for (let i = 0; i < g.length; i++) {
        const a = age[i];
        if (g[i]) { d[i * 4] = 255 - Math.min(200, a * 3); d[i * 4 + 1] = 120 + Math.min(130, a * 2); d[i * 4 + 2] = 80 + Math.min(175, a); }
        else { d[i * 4] = 12; d[i * 4 + 1] = 17; d[i * 4 + 2] = 22; }
        d[i * 4 + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    }
    let down = false;
    const paint = (e) => { const r = c.getBoundingClientRect(); const px = Math.floor(((e.clientX - r.left) / r.width) * W), py = Math.floor(((e.clientY - r.top) / r.height) * H); if (px >= 0 && py >= 0 && px < W && py < H) { g[py * W + px] = 1; draw(); } };
    c.addEventListener('pointerdown', (e) => { down = true; c.setPointerCapture(e.pointerId); paint(e); });
    c.addEventListener('pointermove', (e) => down && paint(e));
    c.addEventListener('pointerup', () => { down = false; });
    const runB = document.getElementById('run');
    runB.onclick = () => { running = !running; runB.textContent = running ? '止める' : '動かす'; };
    document.getElementById('rand').onclick = () => { rand(); draw(); };
    document.getElementById('clr').onclick = () => { g.fill(0); age.fill(0); draw(); };
    setInterval(() => { if (running) { step(); draw(); } }, 70);
  },
}, {
  id: 'cv-kaleido-draw', c: 'canvas', lv: 2,
  t: '万華鏡お絵かき', y: 'まんげきょうおえかき',
  tags: ['対称', 'お絵かき', 'rotate', '鏡'],
  d: '描いた線を中心のまわりに8回回して描き、さらに左右を反転してもう8回描く。適当になぞるだけで万華鏡の模様ができる。',
  html: `<canvas id="c"></canvas><button id="clear">まっさらにする</button>`,
  css: `body { background: #08080c; overflow: hidden; touch-action: none; } canvas { display: block; width: 100vw; height: 100vh; } button { position: fixed; right: 12px; bottom: 12px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const N = 8;
    let last = null, hue = 0;
    function seg(a, b) {
      const cx = c.width / 2, cy = c.height / 2;
      x.strokeStyle = `hsl(${(hue += 1.5) % 360} 90% 62%)`; x.lineWidth = 3; x.lineCap = 'round';
      for (let i = 0; i < N; i++) for (const m of [1, -1]) {
        x.save(); x.translate(cx, cy); x.rotate((Math.PI * 2 * i) / N); x.scale(m, 1);
        x.beginPath(); x.moveTo(a[0] - cx, a[1] - cy); x.lineTo(b[0] - cx, b[1] - cy); x.stroke();
        x.restore();
      }
    }
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); last = [e.clientX, e.clientY]; });
    c.addEventListener('pointermove', (e) => { if (!last) return; const p = [e.clientX, e.clientY]; seg(last, p); last = p; });
    c.addEventListener('pointerup', () => { last = null; });
    document.getElementById('clear').onclick = () => x.clearRect(0, 0, c.width, c.height);
    // 触るまでは自動で描いて見本を見せる
    let t = 0, p = null;
    const auto = setInterval(() => {
      t += 0.05;
      const q = [c.width / 2 + Math.cos(t) * (60 + 140 * Math.sin(t * 0.37)), c.height / 2 + Math.sin(t * 1.7) * (40 + 100 * Math.cos(t * 0.23))];
      if (p) seg(p, q); p = q;
    }, 16);
    c.addEventListener('pointerdown', () => clearInterval(auto), { once: true });
  },
}, {
  id: 'cv-lightning', c: 'canvas', lv: 2,
  t: '稲妻', y: 'いなずま',
  tags: ['再帰', '中点変位', '光', 'クリック'],
  d: '始点と終点を結ぶ線の真ん中を横にずらし、できた2本にも同じことを繰り返すと、ぎざぎざの稲妻になる。ときどき枝分かれもさせる。押した所に落ちる。',
  p: 'shadowBlur を付けて描くと線のまわりが光る。画面全体を明るくする演出は弱めにして、点滅しすぎないようにしている。',
  html: `<canvas id="c"></canvas><p>どこかを押すと、そこに落ちます</p>`,
  css: `body { background: #070a17; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; } p { position: fixed; bottom: 8px; width: 100%; text-align: center; color: #fff6; margin: 0; font-size: 12px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    let bolts = [];
    function make(x1, y1, x2, y2, disp, out, depth = 0) {
      if (disp < 3) { out.push([x1, y1, x2, y2, depth]); return; }
      const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * disp, my = (y1 + y2) / 2 + (Math.random() - 0.5) * disp * 0.4;
      make(x1, y1, mx, my, disp / 2, out, depth);
      make(mx, my, x2, y2, disp / 2, out, depth);
      if (depth < 2 && Math.random() < 0.18) make(mx, my, mx + (Math.random() - 0.5) * disp * 2, my + disp * 1.2, disp / 2, out, depth + 1);
    }
    function strike(tx, ty) { const segs = []; make(tx + (Math.random() - 0.5) * 200, 0, tx, ty, 180, segs); bolts.push({ segs, life: 1 }); }
    addEventListener('click', (e) => strike(e.clientX, e.clientY));
    setInterval(() => strike(Math.random() * c.width, c.height * (0.6 + Math.random() * 0.4)), 1600);
    (function loop() {
      x.fillStyle = '#070a17'; x.fillRect(0, 0, c.width, c.height);
      for (const b of bolts) {
        x.fillStyle = `rgba(150, 170, 255, ${b.life * 0.08})`; x.fillRect(0, 0, c.width, c.height);
        x.shadowColor = '#9fb4ff'; x.shadowBlur = 18;
        for (const [a, bb, cc, d, depth] of b.segs) {
          x.strokeStyle = `rgba(230, 236, 255, ${b.life / (1 + depth)})`; x.lineWidth = 2.5 / (1 + depth);
          x.beginPath(); x.moveTo(a, bb); x.lineTo(cc, d); x.stroke();
        }
        x.shadowBlur = 0;
        b.life -= 0.04;
      }
      bolts = bolts.filter((b) => b.life > 0);
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'cv-plasma', c: 'canvas', lv: 2,
  t: 'プラズマ', y: 'ぷらずま',
  tags: ['ピクセル操作', 'ImageData', 'sin', 'デモシーン'],
  d: '画素ごとに、位置と時間を入れた sin をいくつも足し合わせ、その値を色に変える。昔のデモ作品でおなじみの、うねる色の模様になる。',
  p: '計算は 160×100 の小さな画像で行い、CSS で拡大している。拡大の補間で角が取れて、かえって滑らかに見える。',
  html: `<canvas id="c" width="160" height="100"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const W = c.width, H = c.height, img = x.createImageData(W, H), d = img.data;
    (function loop(time) {
      const t = time / 1000;
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
        const v = Math.sin(xx / 16 + t) + Math.sin(y / 9 - t * 1.2) + Math.sin((xx + y) / 20 + t * 0.7) + Math.sin(Math.hypot(xx - W / 2 - Math.sin(t) * 40, y - H / 2) / 8 - t * 2);
        const i = (y * W + xx) * 4;
        d[i] = 128 + 127 * Math.sin(v * Math.PI);
        d[i + 1] = 128 + 127 * Math.sin(v * Math.PI + 2.094);
        d[i + 2] = 128 + 127 * Math.sin(v * Math.PI + 4.188);
        d[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'cv-truchet', c: 'canvas', lv: 2,
  t: 'トゥルシェの敷き詰め', y: 'とぅるしぇのしきつめ',
  tags: ['タイル', '敷き詰め', 'ランダム', '模様'],
  d: '四隅を4分の1円でつないだタイルを、向きだけでたらめに変えて敷き詰める。タイルどうしの線がつながって、迷路のような曲線が現れる。押したタイルは回転する。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #1b2433; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; cursor: pointer; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const S = 48;
    let tiles = [], cols, rows;
    const fit = () => {
      c.width = innerWidth; c.height = innerHeight;
      cols = Math.ceil(c.width / S); rows = Math.ceil(c.height / S);
      tiles = Array.from({ length: cols * rows }, () => { const r = Math.random() < 0.5 ? 0 : 1; return { r, a: r * 90 }; });
    };
    fit(); addEventListener('resize', fit);
    addEventListener('click', (e) => { const t = tiles[Math.floor(e.clientY / S) * cols + Math.floor(e.clientX / S)]; if (t) t.r++; });
    setInterval(() => { if (tiles.length) tiles[Math.floor(Math.random() * tiles.length)].r++; }, 120);
    (function loop() {
      x.fillStyle = '#1b2433'; x.fillRect(0, 0, c.width, c.height);
      x.lineWidth = 7; x.lineCap = 'round';
      tiles.forEach((t, i) => {
        t.a += (t.r * 90 - t.a) * 0.15;
        const cx = (i % cols) * S + S / 2, cy = Math.floor(i / cols) * S + S / 2;
        x.save(); x.translate(cx, cy); x.rotate((t.a * Math.PI) / 180);
        x.strokeStyle = `hsl(${(cx + cy) / 6 + 160} 70% 65%)`;
        x.beginPath(); x.arc(-S / 2, -S / 2, S / 2, 0, Math.PI / 2); x.stroke();
        x.beginPath(); x.arc(S / 2, S / 2, S / 2, Math.PI, Math.PI * 1.5); x.stroke();
        x.restore();
      });
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'cv-circle-packing', c: 'canvas', lv: 2,
  t: '円をすき間なく詰める', y: 'えんをすきまなくつめる',
  tags: ['円', '衝突判定', 'ジェネラティブアート', '充填'],
  d: '空いている場所に小さな円を置き、ほかの円か壁にぶつかるまでふくらませる。これを繰り返すと、大小の円がすき間を埋めていく。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #f6efe2; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const pal = ['#e0532f', '#26407c', '#f0a43a', '#2f855a', '#1f1b16', '#e8a0b4'];
    let circles = [], fails = 0;
    const free = (px, py, r, self) => {
      if (px - r < 0 || py - r < 0 || px + r > c.width || py + r > c.height) return false;
      for (const o of circles) if (o !== self && Math.hypot(o.x - px, o.y - py) < o.r + r + 2) return false;
      return true;
    };
    (function loop() {
      for (let k = 0; k < 6; k++) {
        const px = Math.random() * c.width, py = Math.random() * c.height;
        if (free(px, py, 1)) { circles.push({ x: px, y: py, r: 1, grow: true, col: pal[Math.floor(Math.random() * pal.length)] }); fails = 0; } else fails++;
      }
      for (const o of circles) if (o.grow) { if (free(o.x, o.y, o.r + 0.7, o)) o.r += 0.7; else o.grow = false; }
      x.fillStyle = '#f6efe2'; x.fillRect(0, 0, c.width, c.height);
      for (const o of circles) { x.fillStyle = o.col; x.beginPath(); x.arc(o.x, o.y, o.r, 0, Math.PI * 2); x.fill(); }
      if (fails > 4000) { setTimeout(() => { circles = []; fails = 0; }, 1500); fails = -1e9; }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'cv-times-table', c: 'canvas', lv: 2,
  t: '掛け算の糸かけ', y: 'かけざんのいとかけ',
  tags: ['数学', '剰余', 'カーディオイド', '糸かけ'],
  d: '円周に200個の点を並べ、点 i から点 (i × k を200で割った余り) へ糸を張る。k を少しずつ増やすと、心臓形や花の形が次々に現れる。',
  p: 'k = 2 でカーディオイド、k = 3 でネフロイドと呼ばれる曲線が浮かぶ。',
  html: `<canvas id="c"></canvas><p id="k"></p>`,
  css: `body { background: #0d0d14; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; } p { position: fixed; left: 12px; top: 8px; margin: 0; font: 600 18px ui-monospace, monospace; color: #fff9; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const N = 200;
    let k = 2;
    (function loop() {
      k += 0.004;
      document.getElementById('k').textContent = `k = ${k.toFixed(2)}`;
      x.fillStyle = '#0d0d14'; x.fillRect(0, 0, c.width, c.height);
      const R = Math.min(c.width, c.height) * 0.44, cx = c.width / 2, cy = c.height / 2;
      const p = (i) => [cx + R * Math.cos((i / N) * Math.PI * 2 - Math.PI / 2), cy + R * Math.sin((i / N) * Math.PI * 2 - Math.PI / 2)];
      x.lineWidth = 1;
      for (let i = 0; i < N; i++) {
        const [ax, ay] = p(i), [bx, by] = p((i * k) % N);
        x.strokeStyle = `hsla(${(i / N) * 360 + k * 20} 85% 62% / .6)`;
        x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'cv-reaction-diffusion', c: 'canvas', lv: 3,
  t: '反応拡散の模様', y: 'はんのうかくさんのもよう',
  tags: ['チューリングパターン', 'シミュレーション', 'Gray-Scott', '生物'],
  d: '2種類の物質が広がりながら反応する式（グレイ＝スコット模型）を計算すると、生き物の模様のような斑点や迷路模様が自然にできる。押した所に物質を足せる。',
  p: '物質 B は A を食べて増え、A は外から補給され、B は一定の割合で消える。この3つの釣り合いが模様を決める。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; image-rendering: auto; cursor: crosshair; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const W = 200, H = 125;
    c.width = W; c.height = H;
    let A = new Float32Array(W * H).fill(1), B = new Float32Array(W * H);
    let A2 = new Float32Array(W * H), B2 = new Float32Array(W * H);
    const seed = (cx, cy, r) => { for (let y = -r; y <= r; y++) for (let xx = -r; xx <= r; xx++) { const px = (cx + xx + W) % W, py = (cy + y + H) % H; B[py * W + px] = 1; } };
    for (let i = 0; i < 12; i++) seed(Math.floor(Math.random() * W), Math.floor(Math.random() * H), 3);
    const F = 0.0545, K = 0.062, DA = 1, DB = 0.5;
    function step() {
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
        const i = y * W + xx, l = y * W + ((xx + W - 1) % W), r = y * W + ((xx + 1) % W), u = ((y + H - 1) % H) * W + xx, dn = ((y + 1) % H) * W + xx;
        const ul = ((y + H - 1) % H) * W + ((xx + W - 1) % W), ur = ((y + H - 1) % H) * W + ((xx + 1) % W), dl = ((y + 1) % H) * W + ((xx + W - 1) % W), dr = ((y + 1) % H) * W + ((xx + 1) % W);
        const lapA = -A[i] + 0.2 * (A[l] + A[r] + A[u] + A[dn]) + 0.05 * (A[ul] + A[ur] + A[dl] + A[dr]);
        const lapB = -B[i] + 0.2 * (B[l] + B[r] + B[u] + B[dn]) + 0.05 * (B[ul] + B[ur] + B[dl] + B[dr]);
        const abb = A[i] * B[i] * B[i];
        A2[i] = A[i] + DA * lapA - abb + F * (1 - A[i]);
        B2[i] = B[i] + DB * lapB + abb - (K + F) * B[i];
      }
      [A, A2] = [A2, A]; [B, B2] = [B2, B];
    }
    const img = x.createImageData(W, H);
    c.addEventListener('pointermove', (e) => { if (e.buttons) { const r = c.getBoundingClientRect(); seed(Math.floor(((e.clientX - r.left) / r.width) * W), Math.floor(((e.clientY - r.top) / r.height) * H), 2); } });
    c.addEventListener('pointerdown', (e) => { const r = c.getBoundingClientRect(); seed(Math.floor(((e.clientX - r.left) / r.width) * W), Math.floor(((e.clientY - r.top) / r.height) * H), 3); });
    (function loop() {
      for (let k = 0; k < 10; k++) step();
      const d = img.data;
      for (let i = 0; i < W * H; i++) {
        const v = Math.max(0, Math.min(1, A[i] - B[i]));
        d[i * 4] = 255 * (1 - v) * 0.95 + 20 * v; d[i * 4 + 1] = 90 * (1 - v) + 30 * v; d[i * 4 + 2] = 120 * (1 - v) + 60 * v; d[i * 4 + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'cv-grid-abstract', c: 'canvas', lv: 1,
  t: '格子と原色の抽象画', y: 'こうしとげんしょくのちゅうしょうが',
  tags: ['ジェネラティブアート', '再帰', '分割', '抽象画'],
  d: '四角形を縦か横に1本の線ででたらめに分け、分けた片方をさらに分ける。小さくなったら止め、ところどころを赤・青・黄で塗る。押すたびに新しい絵ができる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { display: grid; place-items: center; background: #ddd6c8; } canvas { width: min(92vw, 92vh * 1.4); aspect-ratio: 7 / 5; box-shadow: 0 2vmin 5vmin #0003; cursor: pointer; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    c.width = 700; c.height = 500;
    const pal = ['#f4f1ea', '#f4f1ea', '#f4f1ea', '#f4f1ea', '#d22d1e', '#1f4fa0', '#f2c500'];
    function split(px, py, w, h, depth) {
      if (depth > 5 || (w < 90 && h < 90) || (depth > 1 && Math.random() < 0.18)) {
        x.fillStyle = pal[Math.floor(Math.random() * pal.length)];
        x.fillRect(px, py, w, h);
        x.strokeRect(px, py, w, h);
        return;
      }
      if (w > h ? Math.random() < 0.75 : Math.random() < 0.25) {
        const k = w * (0.25 + Math.random() * 0.5);
        split(px, py, k, h, depth + 1); split(px + k, py, w - k, h, depth + 1);
      } else {
        const k = h * (0.25 + Math.random() * 0.5);
        split(px, py, w, k, depth + 1); split(px, py + k, w, h - k, depth + 1);
      }
    }
    const draw = () => { x.lineWidth = 8; x.strokeStyle = '#141414'; split(0, 0, c.width, c.height, 0); };
    c.addEventListener('click', draw);
    draw();
    setInterval(draw, 3000);
  },
});
