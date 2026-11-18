/* 数理・可視化 */
dekiru.add({
  id: 'mt-mandelbrot', c: 'math', lv: 3,
  t: 'マンデルブロ集合', y: 'まんでるぶろしゅうごう',
  tags: ['フラクタル', '複素数', 'canvas', '拡大'],
  d: 'z = z² + c を繰り返して、z が無限に大きくならない点 c を黒、すぐ大きくなる点ほど明るく塗る。押した所を3倍に拡大でき、どこまで拡大しても複雑な模様が現れる。',
  p: '何回目で大きくなったかの回数をそのまま色にすると縞が出る。対数で補正すると色がなめらかにつながる。',
  html: `<canvas id="c"></canvas><p class="info">押すと拡大、右クリックかShift＋押すで縮小 <button id="home">最初に戻す</button></p>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; cursor: zoom-in; } .info { position: fixed; left: 8px; bottom: 6px; margin: 0; color: #fff9; font-size: 12px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let cx = -0.6, cy = 0, scale = 3.2, job = 0;
    function render() {
      const my = ++job, W = (c.width = Math.max(1, Math.floor(innerWidth / 1.5))), H = (c.height = Math.max(1, Math.floor(innerHeight / 1.5)));
      const img = x.createImageData(W, 1), maxIt = Math.floor(120 + Math.log2(3.2 / scale) * 30);
      let row = 0;
      (function chunk() {
        if (my !== job) return;
        const end = Math.min(H, row + 12);
        for (; row < end; row++) {
          for (let px = 0; px < W; px++) {
            const a = cx + ((px - W / 2) / W) * scale, b = cy + ((row - H / 2) / W) * scale;
            let zr = 0, zi = 0, n = 0;
            while (zr * zr + zi * zi < 16 && n < maxIt) { const t = zr * zr - zi * zi + a; zi = 2 * zr * zi + b; zr = t; n++; }
            const k = (px) * 4;
            if (n === maxIt) { img.data[k] = img.data[k + 1] = img.data[k + 2] = 0; }
            else { const s = n + 1 - Math.log2(Math.log2(Math.sqrt(zr * zr + zi * zi))); img.data[k] = 128 + 127 * Math.sin(s * 0.16 + 0); img.data[k + 1] = 128 + 127 * Math.sin(s * 0.16 + 2); img.data[k + 2] = 128 + 127 * Math.sin(s * 0.16 + 4); }
            img.data[k + 3] = 255;
          }
          x.putImageData(img, 0, row);
        }
        if (row < H) requestAnimationFrame(chunk);
      })();
    }
    c.addEventListener('click', (e) => { const W = c.width; cx += ((e.clientX / innerWidth - 0.5) * W / W) * scale; cy += ((e.clientY / innerHeight - 0.5) * c.height / W) * scale; scale /= e.shiftKey ? 1 / 3 : 3; render(); });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); scale *= 3; render(); });
    document.getElementById('home').onclick = () => { cx = -0.6; cy = 0; scale = 3.2; render(); };
    addEventListener('resize', render);
    render();
    if (window.THUMB) { const targets = [[-0.745, 0.113], [-1.25, 0.02], [0.28, 0.008]]; let k = 0; setInterval(() => { if (scale < 0.002) { scale = 3.2; cx = -0.6; cy = 0; k++; } else { const [tx, ty] = targets[k % 3]; cx = tx; cy = ty; scale /= 2.2; } render(); }, 1400); }
  },
}, {
  id: 'mt-julia', c: 'math', lv: 3,
  t: 'ジュリア集合', y: 'じゅりあしゅうごう',
  tags: ['フラクタル', '複素数', 'マウス', 'ピクセル操作'],
  d: 'マンデルブロ集合と同じ式で、c を1つに決めて z の初めの値を画面の各点にすると、ジュリア集合になる。マウスで c を動かすと、形がつながったり砕けたりする。',
  html: `<canvas id="c"></canvas><p id="o"></p>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; } p { position: fixed; left: 8px; bottom: 4px; margin: 0; color: #fff8; font: 12px ui-monospace, monospace; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const W = 240, H = 150; c.width = W; c.height = H;
    const img = x.createImageData(W, H);
    let ca = -0.8, cb = 0.156, moved = false;
    addEventListener('pointermove', (e) => { moved = true; ca = (e.clientX / innerWidth) * 2 - 1.2; cb = (e.clientY / innerHeight) * 2 - 1; });
    (function loop(t) {
      if (!moved) { ca = 0.7885 * Math.cos(t / 3000); cb = 0.7885 * Math.sin(t / 3000); }
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        let zr = ((px - W / 2) / W) * 3.2, zi = ((py - H / 2) / W) * 3.2, n = 0;
        while (zr * zr + zi * zi < 4 && n < 60) { const tt = zr * zr - zi * zi + ca; zi = 2 * zr * zi + cb; zr = tt; n++; }
        const k = (py * W + px) * 4, v = n / 60;
        img.data[k] = 255 * Math.sqrt(v); img.data[k + 1] = 255 * v * v; img.data[k + 2] = 120 + 135 * Math.sin(v * 3); img.data[k + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      document.getElementById('o').textContent = `c = ${ca.toFixed(3)} ${cb >= 0 ? '+' : '−'} ${Math.abs(cb).toFixed(3)}i`;
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'mt-bar-chart', c: 'math', lv: 2,
  t: '伸びる棒グラフ（SVG）', y: 'のびるぼうぐらふえすぶいじー',
  tags: ['グラフ', 'SVG', 'データ可視化', 'transition'],
  d: 'データの数に応じて SVG の棒を並べ、値が変わると棒が伸び縮みする。棒に触れると値が出る。目盛りも最大値に合わせて引き直す。',
  html: `<button id="re">データを変える</button><svg id="s" viewBox="0 0 600 320" role="img" aria-label="月ごとの値の棒グラフ"></svg>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 6px; background: #fbfaf6; } svg { width: min(94vw, 680px); font: 12px sans-serif; } .bar { fill: #e0532f; transform-box: fill-box; transform-origin: 50% 100%; transition: transform .7s cubic-bezier(.3, 1.3, .5, 1), fill .2s; } .bar:hover { fill: #26407c; } .grid line { stroke: #0001; } .val { opacity: 0; transition: opacity .2s; font-weight: 700; } g:hover .val { opacity: 1; }`,
  js() {
    const s = document.getElementById('s'), months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const L = 40, B = 290, T = 20, bw = (560 - L) / 12;
    s.innerHTML = '<g class="grid"></g>' + months.map((m, i) => `<g><rect class="bar" x="${L + i * bw + bw * 0.15}" y="${T}" width="${bw * 0.7}" height="${B - T}"></rect><text class="val" text-anchor="middle" x="${L + i * bw + bw / 2}"></text><text x="${L + i * bw + bw / 2}" y="${B + 18}" text-anchor="middle">${m}</text></g>`).join('');
    function update() {
      const data = months.map(() => Math.round(20 + Math.random() * 180)), max = Math.ceil(Math.max(...data) / 50) * 50;
      s.querySelector('.grid').innerHTML = [0, 0.25, 0.5, 0.75, 1].map((k) => `<line x1="${L}" x2="590" y1="${B - k * (B - T)}" y2="${B - k * (B - T)}"/><text x="${L - 6}" y="${B - k * (B - T) + 4}" text-anchor="end">${max * k}</text>`).join('');
      s.querySelectorAll('.bar').forEach((r, i) => { r.style.transform = `scaleY(${data[i] / max})`; const t = r.nextElementSibling; t.textContent = data[i]; t.setAttribute('y', B - (data[i] / max) * (B - T) - 6); });
    }
    document.getElementById('re').onclick = update;
    update();
    if (window.THUMB) setInterval(update, 1500);
  },
}, {
  id: 'mt-line-chart', c: 'math', lv: 2,
  t: '触れると値が出る折れ線グラフ', y: 'ふれるとあたいがでるおれせんぐらふ',
  tags: ['グラフ', 'SVG', 'ツールチップ', 'データ可視化'],
  d: '2本の折れ線をSVGで描き、マウスを横に動かすと一番近い日付に縦線を引いて、その日の値を吹き出しで見せる。線は描かれるように現れる。',
  html: `<svg id="s" viewBox="0 0 600 300" role="img" aria-label="気温の折れ線グラフ"><g id="axes"></g><path id="p1" class="ln a"/><path id="p2" class="ln b"/><line id="cross" y1="20" y2="270"/><g id="tip"><rect rx="6" width="120" height="44"/><text x="8" y="18" id="t1"></text><text x="8" y="36" id="t2"></text></g><rect id="hit" x="40" y="20" width="550" height="250" fill="transparent"/></svg>`,
  css: `body { display: grid; place-items: center; background: #f7f8fa; } svg { width: min(94vw, 720px); font: 12px sans-serif; } .ln { fill: none; stroke-width: 3; stroke-linejoin: round; stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: draw 1.6s ease-out forwards; } .a { stroke: #e0532f; } .b { stroke: #26407c; animation-delay: .3s; } @keyframes draw { to { stroke-dashoffset: 0; } } #cross { stroke: #0004; stroke-dasharray: 4 3; display: none; } #tip { display: none; } #tip rect { fill: #222d; } #tip text { fill: #fff; } #axes line { stroke: #0001; }`,
  js() {
    const N = 30, a = [], b = [];
    let va = 15, vb = 8;
    for (let i = 0; i < N; i++) { va += (Math.random() - 0.45) * 3; vb += (Math.random() - 0.45) * 3; a.push(+va.toFixed(1)); b.push(+vb.toFixed(1)); }
    const max = Math.ceil(Math.max(...a, ...b) + 2), min = Math.floor(Math.min(...a, ...b) - 2);
    const X = (i) => 40 + (i / (N - 1)) * 550, Y = (v) => 270 - ((v - min) / (max - min)) * 250;
    const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    document.getElementById('p1').setAttribute('d', path(a));
    document.getElementById('p2').setAttribute('d', path(b));
    document.getElementById('axes').innerHTML = [0, 0.5, 1].map((k) => { const v = min + (max - min) * k; return `<line x1="40" x2="590" y1="${Y(v)}" y2="${Y(v)}"/><text x="34" y="${Y(v) + 4}" text-anchor="end">${v.toFixed(0)}℃</text>`; }).join('');
    const cross = document.getElementById('cross'), tip = document.getElementById('tip'), s = document.getElementById('s');
    function show(i) {
      cross.style.display = tip.style.display = 'block';
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i));
      tip.setAttribute('transform', `translate(${Math.min(X(i) + 8, 470)} ${Math.max(20, Y(Math.max(a[i], b[i])) - 50)})`);
      document.getElementById('t1').textContent = `11月${i + 1}日`;
      document.getElementById('t2').textContent = `東京 ${a[i]}℃ / 札幌 ${b[i]}℃`;
    }
    document.getElementById('hit').addEventListener('pointermove', (e) => { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(s.getScreenCTM().inverse()); show(Math.max(0, Math.min(N - 1, Math.round(((p.x - 40) / 550) * (N - 1))))); });
    document.getElementById('hit').addEventListener('pointerleave', () => { cross.style.display = tip.style.display = 'none'; });
    if (window.THUMB) { let i = 0; setInterval(() => show(i++ % N), 120); }
  },
}, {
  id: 'mt-donut-chart', c: 'math', lv: 2,
  t: 'ドーナツグラフ（線の破線で描く）', y: 'どーなつぐらふせんのはせんでかく',
  tags: ['グラフ', 'SVG', 'stroke-dasharray', '割合'],
  d: '円の線を「描く長さ・空ける長さ」の破線にし、開始位置をずらして何本も重ねるとドーナツグラフになる。項目に触れると、その部分が太くなって割合を表示する。',
  html: `<div class="wrap"><svg viewBox="0 0 42 42" id="s" role="img" aria-label="時間の使い方の割合"><circle cx="21" cy="21" r="15.915" fill="none" stroke="#eee" stroke-width="6"/></svg><ul id="leg"></ul></div>`,
  css: `body { display: grid; place-items: center; background: #fbfaf7; } .wrap { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; justify-content: center; } svg { width: min(60vmin, 320px); rotate: -90deg; } circle.seg { fill: none; stroke-width: 6; transition: stroke-width .2s; cursor: pointer; } circle.seg:hover, circle.seg.on { stroke-width: 8.5; } ul { list-style: none; padding: 0; display: grid; gap: 6px; font-size: 14px; } li { cursor: pointer; } li i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; } .center { font: 800 5px sans-serif; }`,
  js() {
    const data = [['睡眠', 30, '#26407c'], ['仕事', 33, '#e0532f'], ['食事', 8, '#f0a43a'], ['趣味', 17, '#2f855a'], ['移動', 12, '#7a5cff']];
    const s = document.getElementById('s'), leg = document.getElementById('leg');
    let off = 0;
    data.forEach(([n, v, col], i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      Object.entries({ cx: 21, cy: 21, r: 15.915, class: 'seg', stroke: col, 'stroke-dasharray': `${v} ${100 - v}`, 'stroke-dashoffset': -off }).forEach(([k, val]) => c.setAttribute(k, val));
      c.dataset.i = i; s.append(c); off += v;
      leg.insertAdjacentHTML('beforeend', `<li data-i="${i}"><i style="background:${col}"></i>${n} ${v}%</li>`);
    });
    const hl = (i) => s.querySelectorAll('.seg').forEach((c) => c.classList.toggle('on', c.dataset.i == i));
    s.addEventListener('pointerover', (e) => e.target.dataset.i && hl(e.target.dataset.i));
    leg.addEventListener('pointerover', (e) => { const li = e.target.closest('li'); if (li) hl(li.dataset.i); });
    if (window.THUMB) { let i = 0; setInterval(() => hl(i++ % data.length), 700); }
  },
}, {
  id: 'mt-function-plot', c: 'math', lv: 3,
  t: '関数のグラフ電卓', y: 'かんすうのぐらふでんたく',
  tags: ['グラフ電卓', 'canvas', '数式', 'ズーム'],
  d: '式を入れると y = f(x) のグラフを描く。sin・cos・sqrt・log などの関数と ^ によるべき乗が使える。ホイールで拡大縮小、ドラッグで移動できる。',
  html: `<div class="bar"><label>y = <input id="f" value="sin(x) * x / 2"></label><select id="pre"><option>sin(x) * x / 2</option><option>x^3 - 4*x</option><option>exp(-x*x)*3</option><option>tan(x)</option><option>sqrt(abs(x))*sign(x)</option><option>sin(1/x)</option><option>floor(x)</option></select><span id="err"></span></div><canvas id="c"></canvas>`,
  css: `body { display: flex; flex-direction: column; background: #fff; touch-action: none; } .bar { display: flex; gap: 8px; align-items: center; padding: 8px; font: 14px ui-monospace, monospace; } #f { width: 16em; font: inherit; } #err { color: #c23b22; font-size: 12px; } canvas { flex: 1; width: 100%; min-height: 0; cursor: grab; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), inp = document.getElementById('f');
    let ox = 0, oy = 0, sc = 40, fn = null;
    function compile() {
      const src = inp.value.replace(/\^/g, '**');
      if (/[^0-9a-zA-Z_+\-*/(). ,]/.test(src)) { document.getElementById('err').textContent = '使えない記号があります'; return; }
      try { fn = new Function('x', `with (Math) { return (${src}); }`); fn(1); document.getElementById('err').textContent = ''; }
      catch (e) { document.getElementById('err').textContent = e.message; fn = null; }
      draw();
    }
    function draw() {
      const W = (c.width = c.clientWidth), H = (c.height = c.clientHeight), cx = W / 2 + ox, cy = H / 2 + oy;
      x.clearRect(0, 0, W, H);
      const step = sc > 60 ? 1 : sc > 20 ? 2 : 5;
      x.strokeStyle = '#eee'; x.lineWidth = 1; x.font = '11px sans-serif'; x.fillStyle = '#999';
      for (let k = Math.floor(-cx / sc / step) * step; k * sc + cx < W; k += step) { const px = cx + k * sc; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, H); x.stroke(); if (k) x.fillText(k, px + 2, cy + 12); }
      for (let k = Math.floor(-cy / sc / step) * step; k * sc + cy < H; k += step) { const py = cy + k * sc; x.beginPath(); x.moveTo(0, py); x.lineTo(W, py); x.stroke(); if (k) x.fillText(-k, cx + 4, py - 2); }
      x.strokeStyle = '#555'; x.beginPath(); x.moveTo(0, cy); x.lineTo(W, cy); x.moveTo(cx, 0); x.lineTo(cx, H); x.stroke();
      if (!fn) return;
      x.strokeStyle = '#e0532f'; x.lineWidth = 2.5; x.beginPath();
      let pen = false, lastY = 0;
      for (let px = 0; px <= W; px++) {
        const xv = (px - cx) / sc; let yv; try { yv = fn(xv); } catch { yv = NaN; }
        const py = cy - yv * sc;
        if (!isFinite(py) || Math.abs(py - lastY) > H) { pen = false; lastY = py; continue; }
        pen ? x.lineTo(px, py) : x.moveTo(px, py); pen = true; lastY = py;
      }
      x.stroke();
    }
    inp.addEventListener('input', compile);
    document.getElementById('pre').onchange = (e) => { inp.value = e.target.value; compile(); };
    c.addEventListener('wheel', (e) => { e.preventDefault(); sc = Math.max(4, Math.min(800, sc * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); draw(); }, { passive: false });
    let drag = null;
    c.addEventListener('pointerdown', (e) => { drag = [e.clientX - ox, e.clientY - oy]; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (drag) { ox = e.clientX - drag[0]; oy = e.clientY - drag[1]; draw(); } });
    c.addEventListener('pointerup', () => { drag = null; });
    addEventListener('resize', draw);
    compile();
    if (window.THUMB) { const sel = document.getElementById('pre'); setInterval(() => { sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length; inp.value = sel.value; compile(); }, 1300); }
  },
}, {
  id: 'mt-fourier', c: 'math', lv: 3,
  t: 'フーリエ級数の回る円', y: 'ふーりえきゅうすうのまわるえん',
  tags: ['フーリエ級数', '円運動', '波', '三角関数'],
  d: '大きさと速さの違う円をつなげて回すと、先端の上下の動きが方形波（角ばった波）に近づいていく。円の数を増やすほど角がはっきりする。',
  p: '奇数番目の円だけを、半径 4/(πk) で k 倍の速さで回すと方形波になる。',
  html: `<canvas id="c"></canvas><label class="ctl">円の数 <input type="range" id="n" min="1" max="40" value="5"> <output id="o">5</output></label>`,
  css: `body { background: #0b1220; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; } .ctl { position: fixed; left: 10px; bottom: 8px; color: #cde; font-size: 13px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const wave = [];
    let t = 0;
    const nIn = document.getElementById('n');
    nIn.oninput = () => { document.getElementById('o').textContent = nIn.value; };
    (function loop() {
      const R = Math.min(c.height * 0.2, c.width * 0.12), ox = c.width * 0.25, oy = c.height / 2;
      x.fillStyle = '#0b1220'; x.fillRect(0, 0, c.width, c.height);
      let px = ox, py = oy;
      for (let i = 0; i < +nIn.value; i++) {
        const k = 2 * i + 1, r = (R * 4) / (k * Math.PI), nx = px + r * Math.cos(k * t), ny = py + r * Math.sin(k * t);
        x.strokeStyle = '#ffffff30'; x.beginPath(); x.arc(px, py, r, 0, 7); x.stroke();
        x.strokeStyle = '#ffffffa0'; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
        px = nx; py = ny;
      }
      wave.unshift(py); if (wave.length > c.width) wave.pop();
      const wx = ox + R * 2;
      x.strokeStyle = '#ffd16688'; x.beginPath(); x.moveTo(px, py); x.lineTo(wx, wave[0]); x.stroke();
      x.strokeStyle = '#ffd166'; x.lineWidth = 2; x.beginPath(); wave.forEach((v, i) => (i ? x.lineTo(wx + i, v) : x.moveTo(wx, v))); x.stroke(); x.lineWidth = 1;
      t += 0.025;
      requestAnimationFrame(loop);
    })();
    if (window.THUMB) setInterval(() => { nIn.value = (+nIn.value % 20) + 1; nIn.oninput(); }, 600);
  },
}, {
  id: 'mt-monte-carlo-pi', c: 'math', lv: 2,
  t: '点を撒いて円周率を求める', y: 'てんをまいてえんしゅうりつをもとめる',
  tags: ['円周率', 'モンテカルロ法', '確率', '乱数'],
  d: '正方形の中にでたらめに点を撒くと、内側の円に入る点の割合は「円の面積÷正方形の面積 = π/4」に近づく。点が増えるほど、推定値が 3.14159… に寄っていく。',
  html: `<div class="wrap"><canvas id="c" width="400" height="400"></canvas><dl><dt>点の数</dt><dd id="n">0</dd><dt>円の中</dt><dd id="in">0</dd><dt>推定した π</dt><dd id="pi">-</dd><dt>本当の π との差</dt><dd id="err">-</dd></dl></div>`,
  css: `body { display: grid; place-items: center; background: #f5f3ee; } .wrap { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; justify-content: center; } canvas { width: min(70vmin, 400px); background: #fff; box-shadow: 0 2px 8px #0002; } dl { display: grid; grid-template-columns: auto auto; gap: 6px 14px; font: 16px ui-monospace, monospace; } dt { color: #888; font-family: sans-serif; font-size: 13px; } dd { margin: 0; font-weight: 700; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let n = 0, inside = 0;
    x.strokeStyle = '#26407c'; x.beginPath(); x.arc(200, 200, 200, 0, 7); x.stroke();
    (function loop() {
      for (let k = 0; k < 300; k++) {
        const px = Math.random() * 2 - 1, py = Math.random() * 2 - 1, inC = px * px + py * py <= 1;
        n++; if (inC) inside++;
        x.fillStyle = inC ? '#e0532f' : '#26407c66';
        x.fillRect((px + 1) * 200, (py + 1) * 200, 1.5, 1.5);
      }
      const pi = (4 * inside) / n;
      document.getElementById('n').textContent = n.toLocaleString();
      document.getElementById('in').textContent = inside.toLocaleString();
      document.getElementById('pi').textContent = pi.toFixed(6);
      document.getElementById('err').textContent = (pi - Math.PI).toFixed(6);
      if (n < 300000) requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'mt-ulam-spiral', c: 'math', lv: 2,
  t: '素数の螺旋（ウラムの螺旋）', y: 'そすうのらせんうらむのらせん',
  tags: ['素数', '螺旋', 'エラトステネスのふるい', '数論'],
  d: '1から順に数を渦巻き状に並べ、素数のマスだけに点を打つと、なぜか斜めの線がたくさん浮かび上がる。素数はふるいで先にまとめて求めておく。',
  html: `<canvas id="c"></canvas>`,
  css: `body { display: grid; place-items: center; background: #0a0a12; } canvas { width: min(96vmin, 900px); aspect-ratio: 1; image-rendering: pixelated; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const S = 201; c.width = c.height = S;
    const N = S * S, sieve = new Uint8Array(N + 1);
    for (let i = 2; i * i <= N; i++) if (!sieve[i]) for (let j = i * i; j <= N; j += i) sieve[j] = 1;
    let px = (S - 1) / 2, py = px, dir = 0, len = 1, done = 0, n = 1;
    const D = [[1, 0], [0, -1], [-1, 0], [0, 1]];
    x.fillStyle = '#0a0a12'; x.fillRect(0, 0, S, S);
    (function loop() {
      for (let k = 0; k < 400 && n <= N; k++) {
        if (n > 1 && !sieve[n]) { x.fillStyle = `hsl(${(n / N) * 300} 90% 65%)`; x.fillRect(px, py, 1, 1); }
        n++;
        px += D[dir][0]; py += D[dir][1]; done++;
        if (done === len) { done = 0; dir = (dir + 1) % 4; if (dir % 2 === 0) len++; }
      }
      if (n <= N) requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'mt-chaos-game', c: 'math', lv: 1,
  t: 'でたらめから生まれる三角形', y: 'でたらめからうまれるさんかくけい',
  tags: ['フラクタル', 'カオスゲーム', 'シェルピンスキー', '乱数'],
  d: '三角形の3つの頂点のどれかをでたらめに選び、今の点からその頂点までの真ん中に移って点を打つ。これを何万回も繰り返すだけで、規則正しいシェルピンスキーの三角形が現れる。',
  html: `<canvas id="c" width="600" height="540"></canvas><p><button id="re">最初から</button> 頂点の数 <select id="v"><option>3</option><option>5</option><option>6</option></select></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #fffaf0; } canvas { width: min(90vmin, 600px); } p { margin: 4px; font-size: 13px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let V, px = 300, py = 270, last = -1;
    function reset() {
      const n = +document.getElementById('v').value;
      V = Array.from({ length: n }, (_, i) => [300 + 280 * Math.cos(-Math.PI / 2 + (i / n) * Math.PI * 2), 290 + 260 * Math.sin(-Math.PI / 2 + (i / n) * Math.PI * 2)]);
      x.fillStyle = '#fffaf0'; x.fillRect(0, 0, 600, 540);
    }
    document.getElementById('re').onclick = reset;
    document.getElementById('v').onchange = reset;
    reset();
    (function loop() {
      const n = V.length, k = n === 3 ? 0.5 : n === 5 ? 0.382 : 0.333;
      for (let i = 0; i < 400; i++) {
        let j; do { j = Math.floor(Math.random() * n); } while (n > 3 && j === last);
        last = j;
        px += (V[j][0] - px) * (1 - k); py += (V[j][1] - py) * (1 - k);
        x.fillStyle = `hsl(${j * (360 / n)} 70% 45%)`; x.fillRect(px, py, 1, 1);
      }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'mt-phyllotaxis', c: 'math', lv: 2,
  t: 'ひまわりの種と黄金角', y: 'ひまわりのたねとおうごんかく',
  tags: ['黄金角', '葉序', '螺旋', '自然'],
  d: 'n 番目の種を、角度 n×137.5°、中心からの距離 √n の所に置くと、ひまわりの種の並びになる。角度を少し変えるだけで、すき間だらけの放射線に崩れる。',
  p: '137.5° は円を黄金比で分けた角度（黄金角）。どの分数にも近くないので、種が重ならずに広がる。',
  html: `<canvas id="c" width="600" height="600"></canvas><label>角度 <input type="range" id="a" min="130" max="145" step="0.01" value="137.51"> <output id="o">137.51°</output></label>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #1b2a12; color: #dfe; } canvas { width: min(84vmin, 600px); } label { font-size: 13px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), a = document.getElementById('a');
    function draw() {
      const ang = (+a.value * Math.PI) / 180;
      document.getElementById('o').textContent = a.value + '°';
      x.fillStyle = '#1b2a12'; x.fillRect(0, 0, 600, 600);
      for (let n = 1; n < 900; n++) {
        const r = 9.6 * Math.sqrt(n), th = n * ang;
        x.fillStyle = `hsl(${40 + (n % 21) * 2} 90% ${35 + (n / 900) * 30}%)`;
        x.beginPath(); x.arc(300 + r * Math.cos(th), 300 + r * Math.sin(th), 5, 0, 7); x.fill();
      }
    }
    a.oninput = draw;
    draw();
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.03; a.value = (137.51 + Math.sin(t) * 2).toFixed(2); draw(); }, 40); }
  },
}, {
  id: 'mt-lsystem', c: 'math', lv: 3,
  t: '書き換え規則で育つ植物と曲線', y: 'かきかえきそくでそだつしょくぶつときょくせん',
  tags: ['L-system', 'フラクタル', 'タートルグラフィックス', '再帰'],
  d: '「F を F+F−−F+F に置き換える」のような文字の書き換えを何度も繰り返し、できた文字列を「F=進む、+=左を向く、−=右を向く、[ ]=位置を覚えて戻る」と読んで線を描く（L-system）。',
  html: `<div class="bar"><select id="k"><option value="plant">植物</option><option value="koch">雪の結晶（コッホ曲線）</option><option value="dragon">ドラゴン曲線</option><option value="tri">シェルピンスキー曲線</option></select><label>世代 <input type="range" id="g" min="1" max="7" value="5"></label><span id="len"></span></div><canvas id="c"></canvas>`,
  css: `body { display: flex; flex-direction: column; background: #f4f6ef; } .bar { display: flex; gap: 10px; align-items: center; padding: 8px; font-size: 13px; } canvas { flex: 1; width: 100%; min-height: 0; }`,
  js() {
    const SYS = {
      plant: { ax: 'X', r: { X: 'F+[[X]-X]-F[-FX]+X', F: 'FF' }, a: 25, start: -90, max: 6, col: '#3f7d2a' },
      koch: { ax: 'F--F--F', r: { F: 'F+F--F+F' }, a: 60, start: 0, max: 5, col: '#26407c' },
      dragon: { ax: 'FX', r: { X: 'X+YF+', Y: '-FX-Y' }, a: 90, start: 0, max: 12, col: '#c23b22' },
      tri: { ax: 'F-G-G', r: { F: 'F-G+F+G-F', G: 'GG' }, a: 120, start: 0, max: 7, col: '#7a5cff' },
    };
    const c = document.getElementById('c'), x = c.getContext('2d');
    function build() {
      const s = SYS[document.getElementById('k').value], gIn = document.getElementById('g');
      gIn.max = s.max; const gen = Math.min(+gIn.value, s.max);
      let str = s.ax;
      for (let i = 0; i < gen; i++) str = [...str].map((ch) => s.r[ch] ?? ch).join('');
      document.getElementById('len').textContent = `文字数 ${str.length.toLocaleString()}`;
      const pts = [], stack = [];
      let px = 0, py = 0, ang = (s.start * Math.PI) / 180;
      const turn = (s.a * Math.PI) / 180;
      const segs = [];
      for (const ch of str) {
        if (ch === 'F' || ch === 'G') { const nx = px + Math.cos(ang), ny = py + Math.sin(ang); segs.push([px, py, nx, ny]); px = nx; py = ny; pts.push([px, py]); }
        else if (ch === '+') ang -= turn; else if (ch === '-') ang += turn;
        else if (ch === '[') stack.push([px, py, ang]); else if (ch === ']') [px, py, ang] = stack.pop();
      }
      const W = (c.width = c.clientWidth), H = (c.height = c.clientHeight);
      const xs = segs.flatMap((q) => [q[0], q[2]]), ys = segs.flatMap((q) => [q[1], q[3]]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const k = Math.min((W - 30) / (maxX - minX || 1), (H - 30) / (maxY - minY || 1));
      x.clearRect(0, 0, W, H); x.strokeStyle = s.col; x.lineWidth = 1; x.beginPath();
      for (const [a1, b1, a2, b2] of segs) { x.moveTo(15 + (a1 - minX) * k, 15 + (b1 - minY) * k); x.lineTo(15 + (a2 - minX) * k, 15 + (b2 - minY) * k); }
      x.stroke();
    }
    document.getElementById('k').onchange = build;
    document.getElementById('g').oninput = build;
    addEventListener('resize', build);
    build();
    if (window.THUMB) { const k = document.getElementById('k'); setInterval(() => { k.selectedIndex = (k.selectedIndex + 1) % 4; build(); }, 1500); }
  },
}, {
  id: 'mt-sorting', c: 'math', lv: 3,
  t: 'ソートの見える化', y: 'そーとのみえるか',
  tags: ['ソート', 'アルゴリズム', 'ジェネレーター', '比較'],
  d: 'バブル・挿入・選択・クイック・マージ・ヒープの6つの並べ替えを、棒の入れ替わりとして目で見る。比較した棒は黄色、書き換えた棒は赤で光る。音を付けると値の大きさが音の高さになる。',
  p: '各ソートを function* のジェネレーターで書き、1回比べるごとに yield で一時停止させている。止めた所を1コマずつ描けば動画になる。',
  html: `<div class="bar"><select id="alg"><option value="bubble">バブル</option><option value="insertion">挿入</option><option value="selection">選択</option><option value="quick" selected>クイック</option><option value="merge">マージ</option><option value="heap">ヒープ</option></select><button id="go">並べ替える</button><label>速さ <input type="range" id="sp" min="1" max="60" value="12"></label><label><input type="checkbox" id="snd"> 音</label><span id="st"></span></div><canvas id="c"></canvas>`,
  css: `body { display: flex; flex-direction: column; background: #111318; color: #ccd; font-size: 13px; } .bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 8px; } canvas { flex: 1; width: 100%; min-height: 0; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), N = 80;
    let a = [], mark = {}, gen = null, cmp = 0, ac;
    const shuffle = () => { a = Array.from({ length: N }, (_, i) => i + 1); for (let i = N - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } };
    const algs = {
      *bubble() { for (let i = 0; i < N; i++) for (let j = 0; j < N - i - 1; j++) { yield { c: [j, j + 1] }; if (a[j] > a[j + 1]) { [a[j], a[j + 1]] = [a[j + 1], a[j]]; yield { s: [j, j + 1] }; } } },
      *insertion() { for (let i = 1; i < N; i++) { let j = i; while (j > 0) { yield { c: [j - 1, j] }; if (a[j - 1] <= a[j]) break; [a[j - 1], a[j]] = [a[j], a[j - 1]]; yield { s: [j - 1, j] }; j--; } } },
      *selection() { for (let i = 0; i < N; i++) { let m = i; for (let j = i + 1; j < N; j++) { yield { c: [m, j] }; if (a[j] < a[m]) m = j; } [a[i], a[m]] = [a[m], a[i]]; yield { s: [i, m] }; } },
      *quick(lo = 0, hi = N - 1) { if (lo >= hi) return; const p = a[hi]; let i = lo; for (let j = lo; j < hi; j++) { yield { c: [j, hi] }; if (a[j] < p) { [a[i], a[j]] = [a[j], a[i]]; yield { s: [i, j] }; i++; } } [a[i], a[hi]] = [a[hi], a[i]]; yield { s: [i, hi] }; yield* algs.quick(lo, i - 1); yield* algs.quick(i + 1, hi); },
      *merge(lo = 0, hi = N) { if (hi - lo < 2) return; const m = (lo + hi) >> 1; yield* algs.merge(lo, m); yield* algs.merge(m, hi); const L = a.slice(lo, m), R = a.slice(m, hi); let i = 0, j = 0, k = lo; while (i < L.length || j < R.length) { if (j >= R.length || (i < L.length && L[i] <= R[j])) a[k] = L[i++]; else a[k] = R[j++]; yield { s: [k] }; k++; } },
      *heap() { const sift = function* (st, end) { let r = st; while (2 * r + 1 <= end) { let ch = 2 * r + 1; yield { c: [ch, r] }; if (ch + 1 <= end && a[ch] < a[ch + 1]) ch++; if (a[r] < a[ch]) { [a[r], a[ch]] = [a[ch], a[r]]; yield { s: [r, ch] }; r = ch; } else return; } }; for (let s = (N >> 1) - 1; s >= 0; s--) yield* sift(s, N - 1); for (let e = N - 1; e > 0; e--) { [a[0], a[e]] = [a[e], a[0]]; yield { s: [0, e] }; yield* sift(0, e - 1); } },
    };
    function beep(v) { if (!document.getElementById('snd').checked) return; ac = ac || new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 200 + v * 12; g.gain.setValueAtTime(0.05, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.06); }
    function draw() {
      const W = (c.width = c.clientWidth), H = (c.height = c.clientHeight), bw = W / N;
      x.clearRect(0, 0, W, H);
      a.forEach((v, i) => { x.fillStyle = mark.s && mark.s.includes(i) ? '#ff5a3c' : mark.c && mark.c.includes(i) ? '#ffd23f' : `hsl(${(v / N) * 260} 70% 55%)`; x.fillRect(i * bw + 1, H - (v / N) * H, bw - 2, (v / N) * H); });
    }
    function start() { shuffle(); cmp = 0; gen = algs[document.getElementById('alg').value](); }
    document.getElementById('go').onclick = start;
    start();
    (function loop() {
      if (gen) for (let k = 0; k < +document.getElementById('sp').value; k++) {
        const r = gen.next();
        if (r.done) { gen = null; mark = {}; document.getElementById('st').textContent = `完了 ・ 比較 ${cmp} 回`; if (window.THUMB) setTimeout(() => { const s = document.getElementById('alg'); s.selectedIndex = (s.selectedIndex + 1) % 6; start(); }, 800); break; }
        mark = r.value; if (mark.c) cmp++; if (k === 0 && (mark.s || mark.c)) beep(a[(mark.s || mark.c)[0]]);
        document.getElementById('st').textContent = `比較 ${cmp} 回`;
      }
      draw();
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'mt-astar', c: 'math', lv: 3,
  t: '最短経路を探す（A*）', y: 'さいたんけいろをさがすえーすたー',
  tags: ['A*', '経路探索', 'グラフ探索', 'ゲームAI'],
  d: '壁をよけてスタートからゴールまでの最短の道を探す。「ここまでの距離 + ゴールまでの見込み距離」が小さいマスから順に調べる A* 法の様子を色で見せる。マウスでなぞると壁を描ける。',
  p: '見込み距離（ヒューリスティック）を0にすると、全方向を同じように調べるダイクストラ法になる。',
  html: `<div class="bar"><button id="go">探す</button><button id="wall">壁をでたらめに</button><button id="clr">壁を消す</button><span id="st"></span></div><canvas id="c"></canvas>`,
  css: `body { display: flex; flex-direction: column; background: #f4f2ed; touch-action: none; font-size: 13px; } .bar { display: flex; gap: 8px; align-items: center; padding: 8px; } canvas { flex: 1; width: 100%; min-height: 0; cursor: crosshair; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), CW = 48, CH = 28;
    let wall = new Uint8Array(CW * CH), S = 3 * CW + 3, G = (CH - 4) * CW + CW - 4, open, came, gs, closed, path, run = null;
    const h = (i) => Math.abs((i % CW) - (G % CW)) + Math.abs(Math.floor(i / CW) - Math.floor(G / CW));
    function rnd() { wall = new Uint8Array(CW * CH).map(() => (Math.random() < 0.28 ? 1 : 0)); wall[S] = wall[G] = 0; reset(); }
    function reset() { open = new Map([[S, h(S)]]); came = new Map(); gs = new Map([[S, 0]]); closed = new Set(); path = []; run = null; draw(); }
    function step() {
      if (!open.size) { run = null; document.getElementById('st').textContent = '道がありません'; return; }
      let cur = null, best = Infinity;
      for (const [i, f] of open) if (f < best) { best = f; cur = i; }
      if (cur === G) { for (let k = G; k !== undefined; k = came.get(k)) path.push(k); run = null; document.getElementById('st').textContent = `見つかりました（${path.length - 1} 歩、調べたマス ${closed.size}）`; return; }
      open.delete(cur); closed.add(cur);
      const cx = cur % CW, cy = Math.floor(cur / CW);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, n = ny * CW + nx;
        if (nx < 0 || ny < 0 || nx >= CW || ny >= CH || wall[n] || closed.has(n)) continue;
        const g = gs.get(cur) + 1;
        if (g < (gs.get(n) ?? Infinity)) { gs.set(n, g); came.set(n, cur); open.set(n, g + h(n)); }
      }
    }
    function draw() {
      const W = (c.width = c.clientWidth), H = (c.height = c.clientHeight), s = Math.min(W / CW, H / CH);
      x.clearRect(0, 0, W, H);
      for (let i = 0; i < CW * CH; i++) {
        const px = (i % CW) * s, py = Math.floor(i / CW) * s;
        x.fillStyle = wall[i] ? '#2b2b2b' : closed.has(i) ? '#ffd6a8' : open.has(i) ? '#a8e6c4' : '#fff';
        x.fillRect(px + 0.5, py + 0.5, s - 1, s - 1);
      }
      x.fillStyle = '#e0532f'; for (const i of path) x.fillRect((i % CW) * s + s * 0.25, Math.floor(i / CW) * s + s * 0.25, s * 0.5, s * 0.5);
      for (const [i, col] of [[S, '#2f855a'], [G, '#26407c']]) { x.fillStyle = col; x.fillRect((i % CW) * s, Math.floor(i / CW) * s, s, s); }
    }
    let painting = null;
    const cellAt = (e) => { const r = c.getBoundingClientRect(), s = Math.min(r.width / CW, r.height / CH), px = Math.floor((e.clientX - r.left) / s), py = Math.floor((e.clientY - r.top) / s); return px >= 0 && py >= 0 && px < CW && py < CH ? py * CW + px : -1; };
    c.addEventListener('pointerdown', (e) => { const i = cellAt(e); if (i < 0 || i === S || i === G) return; painting = wall[i] ? 0 : 1; wall[i] = painting; c.setPointerCapture(e.pointerId); reset(); });
    c.addEventListener('pointermove', (e) => { if (painting === null) return; const i = cellAt(e); if (i >= 0 && i !== S && i !== G) { wall[i] = painting; draw(); } });
    c.addEventListener('pointerup', () => { painting = null; });
    document.getElementById('go').onclick = () => { reset(); run = true; };
    document.getElementById('wall').onclick = rnd;
    document.getElementById('clr').onclick = () => { wall.fill(0); reset(); };
    addEventListener('resize', draw);
    rnd();
    (function loop() { if (run) { for (let k = 0; k < 6 && run; k++) step(); draw(); } requestAnimationFrame(loop); })();
    if (window.THUMB) setInterval(() => { rnd(); run = true; }, 3500); else run = true;
  },
}, {
  id: 'mt-heatmap-calendar', c: 'math', lv: 2,
  t: '1年分の活動カレンダー', y: 'いちねんぶんのかつどうかれんだー',
  tags: ['ヒートマップ', 'カレンダー', 'グリッド', 'Date'],
  d: '今日までの53週ぶんの日を、縦に曜日・横に週で並べ、その日の活動量を5段階の濃さで塗る。マスに触れると日付と回数を出す。日付の並べ方は Date の計算だけで作る。',
  html: `<div class="wrap"><div class="months" id="m"></div><div class="grid" id="g" role="img" aria-label="1年分の活動量"></div><p id="tip">マスに触れると詳しく出ます</p><div class="legend">少ない <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> 多い</div></div>`,
  css: `body { display: grid; place-items: center; background: #fff; font-size: 11px; color: #555; } .wrap { overflow-x: auto; max-width: 96vw; } .grid { display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 11px); gap: 3px; } .grid i, .legend i { width: 11px; height: 11px; border-radius: 2px; display: inline-block; } .months { display: grid; grid-auto-flow: column; grid-auto-columns: 14px; height: 16px; } .l0 { background: #ebedf0; } .l1 { background: #c6e48b; } .l2 { background: #7bc96f; } .l3 { background: #239a3b; } .l4 { background: #196127; } .legend { display: flex; gap: 3px; align-items: center; justify-content: flex-end; margin-top: 6px; } #tip { min-height: 1.4em; margin: 6px 0 0; }`,
  js() {
    const g = document.getElementById('g'), m = document.getElementById('m');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(today); start.setDate(start.getDate() - 52 * 7 - today.getDay());
    let html = '', lastMonth = -1, months = '';
    for (let d = new Date(start), w = 0; d <= today; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay(), weekend = dow === 0 || dow === 6;
      const n = Math.max(0, Math.round((Math.random() * 10 - (weekend ? 5 : 2)) * (1 + Math.sin(d.getMonth()) * 0.5)));
      const lv = n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 9 ? 3 : 4;
      html += `<i class="l${lv}" data-t="${d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })} ・ ${n} 回"></i>`;
      if (dow === 0) { if (d.getMonth() !== lastMonth) { months += `<span style="grid-column:${w + 1}">${d.getMonth() + 1}月</span>`; lastMonth = d.getMonth(); } w++; }
    }
    g.innerHTML = html; m.innerHTML = months;
    g.addEventListener('pointerover', (e) => { if (e.target.dataset.t) document.getElementById('tip').textContent = e.target.dataset.t; });
  },
}, {
  id: 'mt-bezier', c: 'math', lv: 3,
  t: 'ベジェ曲線の作図', y: 'べじぇきょくせんのさくず',
  tags: ['ベジェ曲線', 'ド・カステリョ', '補間', 'ドラッグ'],
  d: '4つの点を結んだ線を、どれも同じ割合 t で区切る点を取り、その点どうしをまた結んで区切る。最後に残る1点が t とともに描く跡がベジェ曲線になる。点はドラッグで動かせる。',
  html: `<canvas id="c"></canvas><label class="t">t <input type="range" id="t" min="0" max="1" step="0.001" value="0.5"> <output id="o"></output></label>`,
  css: `body { background: #fbfaf7; overflow: hidden; touch-action: none; } canvas { display: block; width: 100vw; height: 100vh; } .t { position: fixed; left: 10px; bottom: 8px; font: 13px ui-monospace, monospace; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const P = [[0.12, 0.8], [0.25, 0.15], [0.75, 0.15], [0.88, 0.8]];
    const tIn = document.getElementById('t');
    let grab = -1, auto = true;
    const at = (p) => [p[0] * c.width, p[1] * c.height];
    c.addEventListener('pointerdown', (e) => { grab = P.findIndex((p) => Math.hypot(at(p)[0] - e.clientX, at(p)[1] - e.clientY) < 20); if (grab >= 0) c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (grab >= 0) P[grab] = [e.clientX / c.width, e.clientY / c.height]; });
    c.addEventListener('pointerup', () => { grab = -1; });
    tIn.oninput = () => { auto = false; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const cols = ['#999', '#2f855a', '#26407c', '#e0532f'];
    (function loop(time) {
      if (auto) tIn.value = (Math.sin(time / 1200) + 1) / 2;
      const t = +tIn.value; document.getElementById('o').textContent = t.toFixed(3);
      x.clearRect(0, 0, c.width, c.height);
      x.strokeStyle = '#e0532f55'; x.lineWidth = 4; x.beginPath();
      for (let k = 0; k <= 100; k++) { let L = P.map(at); while (L.length > 1) L = L.slice(1).map((p, i) => lerp(L[i], p, k / 100)); k ? x.lineTo(...L[0]) : x.moveTo(...L[0]); }
      x.stroke();
      x.strokeStyle = '#e0532f'; x.beginPath();
      for (let k = 0; k <= t * 100; k++) { let L = P.map(at); while (L.length > 1) L = L.slice(1).map((p, i) => lerp(L[i], p, k / 100)); k ? x.lineTo(...L[0]) : x.moveTo(...L[0]); }
      x.stroke();
      let L = P.map(at), lvl = 0;
      while (L.length >= 1) {
        x.strokeStyle = cols[lvl]; x.fillStyle = cols[lvl]; x.lineWidth = 1.5; x.beginPath(); L.forEach((p, i) => (i ? x.lineTo(...p) : x.moveTo(...p))); x.stroke();
        for (const p of L) { x.beginPath(); x.arc(p[0], p[1], lvl ? 4 : 8, 0, 7); x.fill(); }
        if (L.length === 1) break;
        L = L.slice(1).map((p, i) => lerp(L[i], p, t)); lvl++;
      }
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'mt-galton-board', c: 'math', lv: 2,
  t: 'ガルトンボード', y: 'がるとんぼーど',
  tags: ['確率', '正規分布', '二項分布', 'シミュレーション'],
  d: '玉が釘に当たるたびに、左か右へ半々の確率で落ちていく。1つ1つはでたらめなのに、たくさん落とすと下の箱の山は真ん中が高い釣り鐘の形（正規分布）になる。',
  html: `<canvas id="c" width="420" height="560"></canvas><button id="re">やり直す</button>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #f0ebe0; } canvas { height: 88vh; max-width: 94vw; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), ROWS = 12, GAP = 28, TOP = 50, W = 420;
    let bins, balls;
    const reset = () => { bins = new Array(ROWS + 1).fill(0); balls = []; };
    reset();
    document.getElementById('re').onclick = reset;
    (function loop() {
      if (balls.length < 60 && Math.random() < 0.5) balls.push({ row: 0, k: 0, t: 0, path: Array.from({ length: ROWS }, () => (Math.random() < 0.5 ? 0 : 1)) });
      x.clearRect(0, 0, W, 560);
      x.fillStyle = '#6b4f3a';
      for (let r = 0; r < ROWS; r++) for (let k = 0; k <= r; k++) { x.beginPath(); x.arc(W / 2 + (k - r / 2) * GAP, TOP + r * GAP, 3.5, 0, 7); x.fill(); }
      const max = Math.max(1, ...bins), base = 556, by = TOP + ROWS * GAP;
      bins.forEach((n, i) => { const bx = W / 2 + (i - ROWS / 2) * GAP; x.fillStyle = '#26407c'; const h = (n / max) * (base - by - 20); x.fillRect(bx - GAP / 2 + 2, base - h, GAP - 4, h); });
      x.fillStyle = '#e0532f';
      for (const b of balls) {
        b.t += 0.12;
        if (b.t >= 1) { b.t = 0; b.k += b.path[b.row]; b.row++; }
        if (b.row >= ROWS) { bins[b.k]++; b.done = true; continue; }
        const x0 = W / 2 + (b.k - b.row / 2) * GAP, x1 = W / 2 + (b.k + b.path[b.row] - (b.row + 1) / 2) * GAP;
        const px = x0 + (x1 - x0) * b.t, py = TOP + (b.row + b.t) * GAP - 8 - Math.sin(b.t * Math.PI) * 8;
        x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill();
      }
      balls = balls.filter((b) => !b.done);
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'mt-force-graph', c: 'math', lv: 3,
  t: '力で配置される関係図', y: 'ちからではいちされるかんけいず',
  tags: ['力学モデル', 'ネットワーク図', 'バネ', 'グラフ理論'],
  d: 'つながった点どうしはバネで引き合い、すべての点どうしは磁石の同じ極のように反発し合う。この力の釣り合いで、関係図が自然に見やすく広がる。点はドラッグで動かせる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #0f1420; overflow: hidden; touch-action: none; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const names = ['HTML', 'CSS', 'JS', 'Canvas', 'SVG', 'WebGL', 'Audio', 'DOM', 'Grid', 'Flex', 'fetch', 'Worker', 'Storage', 'Intl', 'Crypto', 'Popover', 'dialog', 'Animation', 'Shader', 'File'];
    const N = names.map((n, i) => ({ n, x: c.width / 2 + Math.cos(i) * 100, y: c.height / 2 + Math.sin(i) * 100, vx: 0, vy: 0 }));
    const E = [[0, 1], [0, 2], [1, 8], [1, 9], [1, 17], [2, 3], [2, 7], [2, 10], [2, 11], [2, 12], [2, 13], [2, 14], [3, 5], [5, 18], [4, 0], [4, 1], [2, 6], [0, 15], [0, 16], [2, 19], [3, 17]];
    let grab = null;
    c.addEventListener('pointerdown', (e) => { grab = N.find((p) => Math.hypot(p.x - e.clientX, p.y - e.clientY) < 30) || null; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (grab) { grab.x = e.clientX; grab.y = e.clientY; grab.vx = grab.vy = 0; } });
    c.addEventListener('pointerup', () => { grab = null; });
    (function loop() {
      for (const a of N) for (const b of N) { if (a === b) continue; const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01, f = 1800 / d2; a.vx += dx * f / Math.sqrt(d2); a.vy += dy * f / Math.sqrt(d2); }
      for (const [i, j] of E) { const a = N[i], b = N[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - 90) * 0.02; a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f; }
      for (const p of N) { if (p === grab) continue; p.vx += (c.width / 2 - p.x) * 0.002; p.vy += (c.height / 2 - p.y) * 0.002; p.vx *= 0.82; p.vy *= 0.82; p.x += p.vx; p.y += p.vy; }
      x.clearRect(0, 0, c.width, c.height);
      x.strokeStyle = '#ffffff40'; x.lineWidth = 1.5;
      for (const [i, j] of E) { x.beginPath(); x.moveTo(N[i].x, N[i].y); x.lineTo(N[j].x, N[j].y); x.stroke(); }
      x.font = '700 12px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      N.forEach((p, i) => { const deg = E.filter((e) => e.includes(i)).length; x.fillStyle = `hsl(${i * 18} 70% 55%)`; x.beginPath(); x.arc(p.x, p.y, 10 + deg * 3, 0, 7); x.fill(); x.fillStyle = '#fff'; x.fillText(p.n, p.x, p.y + 20 + deg * 3); });
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'mt-random-walk', c: 'math', lv: 1,
  t: 'でたらめに歩く点たち', y: 'でたらめにあるくてんたち',
  tags: ['ランダムウォーク', '確率', '酔歩', '軌跡'],
  d: '中心から出発した点たちが、1歩ごとに上下左右のどれかへでたらめに進む。同じ規則なのに道筋はみんな違い、遠くへ行く点と近くをさまよう点に分かれる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #0a0d12; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; x.fillStyle = '#0a0d12'; x.fillRect(0, 0, c.width, c.height); };
    fit(); addEventListener('resize', fit);
    const W = Array.from({ length: 24 }, (_, i) => ({ x: c.width / 2, y: c.height / 2, h: i * 15 }));
    let steps = 0;
    (function loop() {
      for (let k = 0; k < 6; k++) for (const w of W) {
        const d = [[3, 0], [-3, 0], [0, 3], [0, -3]][Math.floor(Math.random() * 4)];
        x.strokeStyle = `hsla(${w.h} 85% 60% / .6)`; x.beginPath(); x.moveTo(w.x, w.y); w.x += d[0]; w.y += d[1]; x.lineTo(w.x, w.y); x.stroke();
      }
      if (++steps > 1500) { steps = 0; fit(); W.forEach((w) => { w.x = c.width / 2; w.y = c.height / 2; }); }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'mt-hilbert', c: 'math', lv: 2,
  t: '平面を埋める一筆書き（ヒルベルト曲線）', y: 'へいめんをうめるひとふでがきひるべるときょくせん',
  tags: ['空間充填曲線', 'フラクタル', '再帰', '一筆書き'],
  d: '正方形を4つに分けて順に回る道を、分けた中でも同じように繰り返すと、平面のすべてのマスを1回ずつ通る一筆書きになる。次数を上げるほど細かく埋め尽くす。',
  html: `<canvas id="c" width="600" height="600"></canvas><label>次数 <input type="range" id="o" min="1" max="7" value="5"></label>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #101010; color: #ccc; } canvas { width: min(88vmin, 600px); } label { font-size: 13px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    function d2xy(n, d) { let rx, ry, t = d, px = 0, py = 0; for (let s = 1; s < n; s *= 2) { rx = 1 & (t / 2); ry = 1 & (t ^ rx); if (ry === 0) { if (rx === 1) { px = s - 1 - px; py = s - 1 - py; } [px, py] = [py, px]; } px += s * rx; py += s * ry; t = Math.floor(t / 4); } return [px, py]; }
    let job = 0;
    function draw() {
      const my = ++job, order = +document.getElementById('o').value, n = 2 ** order, total = n * n, s = 600 / n;
      x.fillStyle = '#101010'; x.fillRect(0, 0, 600, 600);
      x.lineWidth = Math.max(1, s * 0.3); x.lineCap = 'round';
      let i = 1, prev = d2xy(n, 0);
      (function step() {
        if (my !== job) return;
        for (let k = 0; k < Math.max(4, total / 120) && i < total; k++, i++) {
          const p = d2xy(n, i);
          x.strokeStyle = `hsl(${(i / total) * 360} 80% 60%)`;
          x.beginPath(); x.moveTo((prev[0] + 0.5) * s, (prev[1] + 0.5) * s); x.lineTo((p[0] + 0.5) * s, (p[1] + 0.5) * s); x.stroke();
          prev = p;
        }
        if (i < total) requestAnimationFrame(step);
      })();
    }
    document.getElementById('o').oninput = draw;
    draw();
    if (window.THUMB) setInterval(() => { const o = document.getElementById('o'); o.value = (+o.value % 7) + 1; draw(); }, 2200);
  },
}, {
  id: 'mt-wave-interference', c: 'math', lv: 3,
  t: '2つの波の干渉', y: 'ふたつのなみのかんしょう',
  tags: ['波', '干渉', '物理', 'ピクセル操作'],
  d: '2か所から同じ波を出すと、山と山が重なる所は強め合い、山と谷が重なる所は打ち消し合って、縞模様ができる。波を出す点はドラッグで動かせる。',
  html: `<canvas id="c"></canvas><p>白い点をドラッグできます</p>`,
  css: `body { background: #000; overflow: hidden; touch-action: none; } canvas { display: block; width: 100vw; height: 100vh; } p { position: fixed; top: 6px; width: 100%; text-align: center; margin: 0; color: #fff8; font-size: 12px; pointer-events: none; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const W = 220, H = 140; c.width = W; c.height = H;
    const img = x.createImageData(W, H);
    const S = [[W * 0.4, H / 2], [W * 0.6, H / 2]];
    let grab = -1;
    const pos = (e) => [(e.clientX / innerWidth) * W, (e.clientY / innerHeight) * H];
    c.addEventListener('pointerdown', (e) => { const p = pos(e); grab = S.findIndex((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 10); if (grab >= 0) c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (grab >= 0) S[grab] = pos(e); });
    c.addEventListener('pointerup', () => { grab = -1; });
    (function loop(t) {
      const w = t / 150;
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        let v = 0;
        for (const [sx, sy] of S) { const d = Math.hypot(px - sx, py - sy); v += Math.sin(d * 0.6 - w) / (1 + d * 0.02); }
        const k = (py * W + px) * 4, u = v / 2;
        img.data[k] = 40 + 120 * Math.max(0, u); img.data[k + 1] = 90 + 120 * Math.max(0, u) + 40 * Math.max(0, -u); img.data[k + 2] = 160 + 95 * u; img.data[k + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      x.fillStyle = '#fff'; for (const [sx, sy] of S) { x.beginPath(); x.arc(sx, sy, 2.5, 0, 7); x.fill(); }
      requestAnimationFrame(loop);
    })(0);
  },
});

// ---- 数式で動く、見て美しい作品（2026-11-18 追加） ----
dekiru.add({
  id: 'mt-clifford', c: 'math', lv: 3,
  t: 'ストレンジ・アトラクターの光の雲', y: 'すとれんじあとらくたーのひかりのくも',
  tags: ['アトラクター', 'カオス', '反復写像', '密度', '対数'],
  d: '2 行の式「x ← sin(a·y) + c·cos(a·x)、y ← sin(b·x) + d·cos(b·y)」（クリフォード・アトラクター）を、1 つの点に何百万回もくり返し当てはめる。点は決まった形の上を、でたらめのように飛び回る。点が通った回数を光の濃さにし、飛んだ向きで色を付けると、絹の布のような模様が浮かぶ。4 つの係数をゆっくり変えるので、模様が流れるように形を変えていく。',
  p: '1 つ 1 つの点の行き先は予測できないのに、たくさん集めると同じ形が現れる（カオスの中の秩序）。通った回数は場所によって何千倍も違うので、そのままでは明るい所しか見えない。対数で明るさに直すと、薄い所の細い糸まで見える。',
  html: `<canvas id="c" role="img" aria-label="細い光の糸が何層にも重なった、絹の布のような模様がゆっくり形を変える"></canvas>
<div class="bar"><button id="pause" type="button">❚❚ 止める</button><button id="jump" type="button">別の形へ</button><span id="eq"></span></div>`,
  css: `body { margin: 0; background: #04050c; color: #cfd6ff; overflow: hidden; }
canvas { display: block; width: 100vw; height: 100vh; }
.bar { position: fixed; left: 10px; top: 8px; right: 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
.bar button { color: #fff; background: #ffffff1a; border: 1px solid #ffffff33; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
.bar button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#eq { font-family: ui-monospace, monospace; opacity: .75; white-space: pre; }`,
  core() {
    // クリフォード・アトラクターの 1 歩
    const clifford = (p, x, y) => [Math.sin(p.a * y) + p.c * Math.cos(p.a * x), Math.sin(p.b * x) + p.d * Math.cos(p.b * y)];
    // 通った回数 v を明るさ 0〜1 に。対数にして、薄い所を持ち上げる
    const toneMap = (v, max) => (v <= 0 || max <= 0 ? 0 : Math.min(1, Math.log1p(v) / Math.log1p(max)));
    // 0〜1 の値から色（余弦の重ね合わせで作る、青・紫・金の帯）
    const palette = (t) => [0, 1, 2].map((k) => Math.min(1, Math.max(0, 0.5 + 0.5 * Math.cos(6.2832 * (t + [0.0, 0.15, 0.32][k] + 0.55)))));
  },
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const pauseBtn = document.getElementById('pause'), eqEl = document.getElementById('eq');
    let W = 0, H = 0, R, G, B, img, t = 0, phase = 0, px = 0.1, py = 0.1, last = 0, still = 0;
    let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;   // 動きを減らす設定なら、止めた形から始める
    pauseBtn.textContent = paused ? '▶ 動かす' : '❚❚ 止める';
    // 飛んだ向き（64 段）ごとの色
    const COL = Array.from({ length: 64 }, (_, i) => palette(i / 64));
    const CR = Float32Array.from(COL, (v) => v[0]), CG = Float32Array.from(COL, (v) => v[1]), CB = Float32Array.from(COL, (v) => v[2]);
    const LUT = new Float32Array(1024);   // 明るさの表（濃さの平方根の段 → 対数の明るさ）。1 コマに 1 回だけ作り直す
    let peak = 0;
    function size() {
      const dpr = Math.min(1.5, devicePixelRatio || 1), k = Math.min(1, Math.sqrt(450000 / (innerWidth * innerHeight * dpr * dpr)));   // 画素は 45 万までに抑える
      W = Math.max(2, Math.round(innerWidth * dpr * k)); H = Math.max(2, Math.round(innerHeight * dpr * k));
      c.width = W; c.height = H; R = new Float32Array(W * H); G = new Float32Array(W * H); B = new Float32Array(W * H); img = x.createImageData(W, H); still = 0; peak = 0;
    }
    addEventListener('resize', size); size();
    // 係数は、形のきれいな範囲をゆっくり巡る
    const params = (t) => ({ a: -1.55 + 0.35 * Math.sin(0.071 * t + phase), b: 1.6 + 0.3 * Math.sin(0.053 * t + 1 + phase * 1.3), c: 1.0 + 0.45 * Math.sin(0.061 * t + 2 + phase * 0.7), d: 0.8 + 0.3 * Math.sin(0.083 * t + 3 + phase * 1.9) });
    // 止めたらその場で描くのをやめる（形はもう出来ている）。止めたまま「別の形へ」を押したときや、動きを減らす設定で始めたときだけ、形が出来るまで描く
    pauseBtn.addEventListener('click', () => { paused = !paused; pauseBtn.textContent = paused ? '▶ 動かす' : '❚❚ 止める'; still = paused ? 999 : 0; });
    document.getElementById('jump').addEventListener('click', () => { phase += 1.7 + Math.random() * 2; R.fill(0); G.fill(0); B.fill(0); still = 0; });
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      if (paused && still > 90) return;   // 止めている間は、形が出来上がったら計算を休む
      if (!paused) t += dt;
      still++;
      const p = params(t), N = 120000, pa = p.a, pb = p.b, pc = p.c, pd = p.d;
      const sc = Math.min(W / (2 * (1 + Math.abs(pc))), H / (2 * (1 + Math.abs(pd)))) * 0.94, cx = W / 2, cy = H / 2;
      for (let k = 0; k < N; k++) {
        const nx = Math.sin(pa * py) + pc * Math.cos(pa * px), ny = Math.sin(pb * px) + pd * Math.cos(pb * py);   // clifford と同じ式
        // 飛んだ向き: atan2 の代わりに「菱形の角度」（0〜4、向きと同じ順に増える）で色の段を決める
        const dx = nx - px, dy = ny - py, q = dy / (Math.abs(dx) + Math.abs(dy) + 1e-12), ci = ((dx >= 0 ? (q >= 0 ? q : 4 + q) : 2 - q) * 16) & 63;
        const ix = (cx + nx * sc) | 0, iy = (cy - ny * sc) | 0;
        px = nx; py = ny;
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        const i = iy * W + ix; R[i] += CR[ci]; G[i] += CG[ci]; B[i] += CB[ci];
      }
      // 明るさの表: 前のコマのいちばん濃い所の 35% を「真っ白」の手前にする（中くらいの濃さを持ち上げる）
      for (let u = 0; u < 1024; u++) { const v = (u / 1023) * (u / 1023) * peak; LUT[u] = toneMap(v, peak); }
      // 1 回の繰り返しで、色を塗り、いちばん濃い所を探し、少し消す（形が変わっても、前の形がすぐ消える）
      const d = img.data;
      let max = 0;
      for (let i = 0, j = 0; i < R.length; i++, j += 4) {
        const s = R[i] + G[i] + B[i];
        if (s > max) max = s;
        if (s <= 1e-3 || peak <= 0) { d[j] = 4; d[j + 1] = 5; d[j + 2] = 12; d[j + 3] = 255; }
        else {
          const L = LUT[Math.min(1023, (Math.sqrt(s / peak) * 1023) | 0)], w = L * L * L * L, k = L / s;   // とても濃い所は白へ近づける
          d[j] = 4 + (R[i] * k * (1 - w) + w * L) * 251; d[j + 1] = 5 + (G[i] * k * (1 - w) + w * L) * 250; d[j + 2] = 12 + (B[i] * k * (1 - w) + w * L) * 243; d[j + 3] = 255;
        }
        R[i] *= 0.965; G[i] *= 0.965; B[i] *= 0.965;
      }
      peak = max * 0.35;
      x.putImageData(img, 0, 0);
      eqEl.textContent = `x ← sin(${p.a.toFixed(2)}·y) + ${p.c.toFixed(2)}·cos(${p.a.toFixed(2)}·x)\ny ← sin(${p.b.toFixed(2)}·x) + ${p.d.toFixed(2)}·cos(${p.b.toFixed(2)}·y)`;
    }
    requestAnimationFrame(frame);
  },
}, {
  id: 'mt-domain-coloring', c: 'math', lv: 3,
  t: '複素関数の色の地図', y: 'ふくそかんすうのいろのちず',
  tags: ['複素数', '零点', '極', '偏角', 'WebGL'],
  d: '複素数の関数 f(z) = (z−a)(z−b)(z−c) / ((z−d)(z−e)) の値を、平面の 1 点ごとに塗る。値の向き（偏角）を色の環、大きさを 2 倍ごとに繰り返す濃淡の縞で表す。色の環が 1 周する点が零点（白い輪、値が 0）と極（黒い輪、値が無限大）で、零点のまわりでは色が反時計回り、極のまわりでは時計回りに並ぶ。5 つの点はゆっくり巡り、指やマウスでつかんで動かすこともできる。',
  p: '複素関数は「入力も出力も平面」なので、そのままではグラフを描けない。出力を色と明るさに置き換えると、零点と極の位置と重なり（色が何周するか）が 1 枚の絵で読める。',
  html: `<canvas id="c" role="img" aria-label="虹色の渦が 5 つ並び、白い輪と黒い輪のまわりで色の環が回る。渦はゆっくり動く"></canvas>
<div class="bar"><button id="pause" type="button">❚❚ 止める</button><button id="shuffle" type="button">点を並べ直す</button><span>f(z) = (z−a)(z−b)(z−c) / ((z−d)(z−e))</span></div>
<p class="legend">色＝値の向き（偏角）・縞＝大きさ（2 倍ごと）・白い輪＝零点・黒い輪＝極。輪はつかんで動かせる</p>`,
  css: `body { margin: 0; background: #000; color: #fff; overflow: hidden; }
canvas { display: block; width: 100vw; height: 100vh; touch-action: none; }
.bar { position: fixed; left: 10px; top: 8px; right: 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
.bar span, .legend { background: #000a; padding: 2px 8px; border-radius: 4px; }
.bar button { color: #fff; background: #000a; border: 1px solid #ffffff55; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
.bar button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.legend { position: fixed; left: 10px; bottom: 8px; margin: 0; font-size: 11px; }`,
  core() {
    const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
    // f(z) = Π(z − 零点) / Π(z − 極)
    function evalF(z, roots, poles) {
      let f = [1, 0];
      for (const r of roots) f = cmul(f, [z[0] - r[0], z[1] - r[1]]);
      for (const p of poles) f = cdiv(f, [z[0] - p[0], z[1] - p[1]]);
      return f;
    }
    // 偏角を 0〜1 の色の向きに（正の実数が 0、反時計回りに増える）
    const hueOf = (f) => (((Math.atan2(f[1], f[0]) / (2 * Math.PI)) % 1) + 1) % 1;
  },
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2');
    if (!gl) { document.body.textContent = 'この作品には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const pauseBtn = document.getElementById('pause');
    const vs = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }`;
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float S; uniform vec2 Z[3], P[2]; out vec4 O;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }
vec3 hue(float h) { return clamp(abs(mod(h * 6. + vec3(0, 4, 2), 6.) - 3.) - 1., 0., 1.); }
void main() {
  vec2 z = (gl_FragCoord.xy - .5 * R) / R.y * S, f = vec2(1, 0);
  for (int i = 0; i < 3; i++) f = cmul(f, z - Z[i]);   // core の evalF と同じ式
  for (int i = 0; i < 2; i++) f = cdiv(f, z - P[i]);
  float h = fract(atan(f.y, f.x) / 6.2831853 + 1.), lm = log2(length(f) + 1e-30);
  vec3 col = mix(vec3(1), hue(h), .82);
  float band = fract(lm), aa = fwidth(lm);
  col *= .62 + .38 * smoothstep(0., .9, band) * smoothstep(1., 1. - aa * 1.5, band);   // 2 倍ごとの縞（境目はなめらかに）
  float ph = fract(h * 12.), pw = fwidth(h * 12.) * 1.2;
  col *= 1. - .22 * (1. - smoothstep(0., pw, min(ph, 1. - ph)));                       // 30 度ごとの細い線
  col *= .35 + .65 * (.5 + atan(lm * .35) / 3.14159);                                // 0 に近いほど暗く、大きいほど明るく
  float px = S / R.y;
  for (int i = 0; i < 3; i++) { float d = length(z - Z[i]); col = mix(col, vec3(1), smoothstep(px * 1.5, 0., abs(d - px * 9.))); }
  for (int i = 0; i < 2; i++) { float d = length(z - P[i]); col = mix(col, vec3(0), smoothstep(px * 1.8, 0., abs(d - px * 9.))); }
  O = vec4(pow(col, vec3(.95)), 1);
}`;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    const u = (n) => gl.getUniformLocation(prog, n), S = 3.2;
    // 5 つの点（3 つの零点・2 つの極）。それぞれ中心のまわりを、違う速さの楕円で巡る
    const pts = Array.from({ length: 5 }, (_, i) => ({ zero: i < 3, base: [0, 0], amp: [0, 0], w: [0, 0], ph: Math.random() * 6.28, held: false, pos: [0, 0] }));
    function shuffle() {
      pts.forEach((p, i) => {
        const a = i * 2.4 + Math.random() * 0.8, r = 0.35 + Math.random() * 0.75;
        p.base = [Math.cos(a) * r * 1.4, Math.sin(a) * r]; p.amp = [0.15 + Math.random() * 0.25, 0.1 + Math.random() * 0.2]; p.w = [0.13 + Math.random() * 0.2, 0.11 + Math.random() * 0.2]; p.held = false;
      });
    }
    shuffle();
    let t = 0, last = 0, paused = matchMedia('(prefers-reduced-motion: reduce)').matches, dirty = true, drag = null;
    pauseBtn.textContent = paused ? '▶ 動かす' : '❚❚ 止める';
    pauseBtn.addEventListener('click', () => { paused = !paused; pauseBtn.textContent = paused ? '▶ 動かす' : '❚❚ 止める'; });
    document.getElementById('shuffle').addEventListener('click', () => { shuffle(); dirty = true; });
    // つかんで動かす: 画面の点を複素平面の点に直し、いちばん近い輪をつかむ
    const toZ = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width - 0.5) * (r.width / r.height) * S, (0.5 - (e.clientY - r.top) / r.height) * S]; };
    c.addEventListener('pointerdown', (e) => {
      const z = toZ(e); let best = null, bd = 0.25;
      for (const p of pts) { const d = Math.hypot(p.pos[0] - z[0], p.pos[1] - z[1]); if (d < bd) { bd = d; best = p; } }
      if (best) { drag = best; best.held = true; c.setPointerCapture(e.pointerId); }
    });
    c.addEventListener('pointermove', (e) => { if (drag) { drag.pos = toZ(e); dirty = true; } });
    const drop = () => { if (drag) { drag.base = drag.pos.slice(); drag.amp = [0, 0]; drag.held = false; drag = null; } };
    c.addEventListener('pointerup', drop); c.addEventListener('pointercancel', drop);
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      if (!paused) { t += dt; dirty = true; }
      if (!dirty) return;
      dirty = false;
      for (const p of pts) if (!p.held) p.pos = [p.base[0] + p.amp[0] * Math.sin(t * p.w[0] + p.ph), p.base[1] + p.amp[1] * Math.cos(t * p.w[1] + p.ph * 1.3)];
      const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      gl.viewport(0, 0, w, h); gl.useProgram(prog);
      gl.uniform2f(u('R'), w, h); gl.uniform1f(u('S'), S);
      gl.uniform2fv(u('Z'), pts.slice(0, 3).flatMap((p) => p.pos)); gl.uniform2fv(u('P'), pts.slice(3).flatMap((p) => p.pos));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    addEventListener('resize', () => { dirty = true; });
    requestAnimationFrame(frame);
  },
}, {
  id: 'mt-chladni', c: 'math', lv: 2,
  t: 'クラドニ図形（振動する板と砂）', y: 'くらどにずけい',
  tags: ['振動', '定在波', '節', '物理', 'パーティクル'],
  d: '金属の板に砂を撒いて振動させると、砂は揺れの大きい所から跳ね飛ばされ、揺れない線（節）に集まって模様を描く（クラドニ図形）。正方形の板の揺れの形を cos(nπx)·cos(mπy) − cos(mπx)·cos(nπy) で表し、1 万 4 千粒の砂を、揺れの大きさに比例した歩幅でばらばらの向きに動かす。n と m が変わるたびに、砂が次の模様へ流れていく。',
  p: '砂は「節へ向かえ」とは命令されていない。揺れの大きい所ほど大きく跳ねるだけで、跳ねにくい節に自然とたまる。1 粒ずつの単純な規則から、全体の模様が現れる。',
  html: `<canvas id="c" role="img" aria-label="暗い板の上で、白い砂が幾何学模様の線に集まり、しばらくすると別の模様へ流れていく"></canvas>
<div class="bar"><button id="pause" type="button">❚❚ 止める</button><button id="next" type="button">次の模様</button><span id="mode"></span></div>`,
  css: `body { margin: 0; background: #0b0c10; color: #e8e2d4; overflow: hidden; }
canvas { display: block; width: 100vw; height: 100vh; }
.bar { position: fixed; left: 10px; top: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
.bar button { color: #fff; background: #ffffff14; border: 1px solid #ffffff33; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
.bar button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#mode { font-family: ui-monospace, monospace; opacity: .8; }`,
  core() {
    // 正方形の板の揺れの形（x, y は 0〜1）。値が 0 の線が節
    const chladni = (n, m, x, y) => Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y) - Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y);
    // 砂 1 粒の 1 歩: 揺れが大きいほど大きな歩幅（揺れの 0.7 乗）で、でたらめな向きへ跳ねる（板の外へは落ちない）
    function sandStep([x, y], n, m, rnd, k) {
      const a = Math.pow(Math.abs(chladni(n, m, x, y)) / 2, 0.7), ang = rnd() * 2 * Math.PI, r = k * (a + 0.004);
      return [Math.min(1, Math.max(0, x + Math.cos(ang) * r)), Math.min(1, Math.max(0, y + Math.sin(ang) * r))];
    }
  },
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), modeEl = document.getElementById('mode'), pauseBtn = document.getElementById('pause');
    const MODES = [[3, 5], [2, 5], [4, 7], [1, 4], [3, 4], [2, 7], [4, 5], [1, 6], [3, 7], [5, 6], [2, 3], [5, 8]];   // 細かい模様から始める
    const N = 14000, sand = Float32Array.from({ length: N * 2 }, () => Math.random());
    let mi = 0, since = 0, last = 0, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const show = () => { modeEl.textContent = `n = ${MODES[mi][0]}、m = ${MODES[mi][1]}`; };
    function step(times) {   // 全部の砂を times 歩進める（sandStep と同じ規則を、配列のまま計算する）
      const [n, m] = MODES[mi], k = 0.02;
      for (let s = 0; s < times; s++) for (let i = 0; i < N * 2; i += 2) {
        const px = sand[i], py = sand[i + 1], a = Math.pow(Math.abs(chladni(n, m, px, py)) / 2, 0.7), ang = Math.random() * 6.2832, r = k * (a + 0.004);
        sand[i] = Math.min(1, Math.max(0, px + Math.cos(ang) * r)); sand[i + 1] = Math.min(1, Math.max(0, py + Math.sin(ang) * r));
      }
    }
    function next() { mi = (mi + 1) % MODES.length; since = 0; show(); }
    pauseBtn.textContent = paused ? '▶ 動かす' : '❚❚ 止める';
    if (paused) step(250);   // 動きを減らす設定では、模様が出来上がった姿から始める
    pauseBtn.addEventListener('click', () => { paused = !paused; pauseBtn.textContent = paused ? '▶ 動かす' : '❚❚ 止める'; });
    document.getElementById('next').addEventListener('click', () => { next(); if (paused) step(250); draw(); });
    show();
    function draw() {
      const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const L = Math.min(w, h) * 0.86, ox = (w - L) / 2, oy = (h - L) / 2;
      x.fillStyle = '#0b0c10'; x.fillRect(0, 0, w, h);
      const g = x.createRadialGradient(w * 0.42, h * 0.38, L * 0.05, w / 2, h / 2, L * 0.75);
      g.addColorStop(0, '#2a2e38'); g.addColorStop(1, '#14161c');
      x.fillStyle = g; x.fillRect(ox, oy, L, L);
      x.strokeStyle = '#3a3f4b'; x.lineWidth = dpr; x.strokeRect(ox, oy, L, L);
      const s = Math.max(1, dpr * 1.1);
      x.fillStyle = '#f3e6c8';
      for (let i = 0; i < N * 2; i += 2) x.fillRect(ox + sand[i] * L, oy + sand[i + 1] * L, s, s);
    }
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      if (!paused) { step(3); since += dt; if (since > 7) next(); }
      draw();
    }
    requestAnimationFrame(frame);
  },
}, {
  id: 'mt-times-table', c: 'math', lv: 2,
  t: '円の掛け算が描く曲線', y: 'えんのかけざんがえがくきょくせん',
  tags: ['掛け算', '包絡線', 'カージオイド', 'エピサイクロイド', '余り'],
  d: '円周に 360 個の点を並べ、点 i を点 k×i（360 で割った余り）と線で結ぶ。たくさんの線が重なった所に、線の包む曲線（包絡線）が浮かぶ。k = 2 で心臓の形（カージオイド）、k = 3 で腎臓の形（ネフロイド）、整数の k では尖りが k−1 個の曲線になる。k をゆっくり増やすと、曲線が次々に生まれては崩れる。',
  p: '1 本 1 本はただの線分なのに、重なると曲線が見える。整数の k の包絡線は、円のまわりを転がる円の 1 点が描くエピサイクロイドと同じ形になる。',
  html: `<canvas id="c" role="img" aria-label="円の中に光る線が何百本も重なり、心臓の形や花のような曲線が次々に現れる"></canvas>
<div class="bar"><button id="pause" type="button">❚❚ 止める</button><label>k <input type="range" id="k" min="2" max="100" step="0.01" value="2"></label><output id="ko"></output></div>`,
  css: `body { margin: 0; background: #05060a; color: #e6e9ff; overflow: hidden; }
canvas { display: block; width: 100vw; height: 100vh; }
.bar { position: fixed; left: 10px; top: 8px; right: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; }
.bar button { color: #fff; background: #ffffff14; border: 1px solid #ffffff33; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
.bar button:focus-visible, .bar input:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.bar input { width: min(320px, 50vw); }`,
  core() {
    // 点 i を結ぶ相手（点 k×i を N で割った余り。k が整数でなければ、点と点の間の位置になる）
    const chord = (i, k, N) => [i, ((k * i) % N + N) % N];
    // 整数の k の包絡線は、尖りが k − 1 個のエピサイクロイド。整数でなければ閉じた形にならない
    const cusps = (k) => (Math.abs(k - Math.round(k)) < 1e-9 && Math.round(k) >= 2 ? Math.round(k) - 1 : null);
  },
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), kIn = document.getElementById('k'), kOut = document.getElementById('ko'), pauseBtn = document.getElementById('pause');
    const N = 360, NAME = { 2: 'カージオイド（心臓形）', 3: 'ネフロイド（腎臓形）' };
    let k = 2, last = 0, paused = matchMedia('(prefers-reduced-motion: reduce)').matches, dirty = true;
    pauseBtn.textContent = paused ? '▶ 動かす' : '❚❚ 止める';
    pauseBtn.addEventListener('click', () => { paused = !paused; pauseBtn.textContent = paused ? '▶ 動かす' : '❚❚ 止める'; });
    kIn.addEventListener('input', () => { k = +kIn.value; dirty = true; });
    function label() {
      const n = cusps(+k.toFixed(2));
      kOut.textContent = `k = ${k.toFixed(2)}${n ? `（${NAME[Math.round(k)] || `尖りが ${n} 個の曲線`}）` : ''}`;
    }
    function draw() {
      const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const r = Math.min(w, h) * 0.42, cx = w / 2, cy = h / 2 + 10 * dpr;
      x.globalCompositeOperation = 'source-over'; x.fillStyle = '#05060a'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#ffffff22'; x.lineWidth = dpr; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
      x.globalCompositeOperation = 'lighter'; x.lineWidth = dpr * 0.9;
      const at = (j) => { const a = (j / N) * 2 * Math.PI - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
      for (let i = 0; i < N; i++) {
        const [a, b] = chord(i, k, N), p = at(a), q = at(b);
        x.strokeStyle = `hsla(${(i / N) * 300 + 200}, 85%, 62%, .32)`;
        x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke();
      }
      label();
    }
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      if (!paused) {
        // 整数の近くではゆっくり、間は少し速く進める（形がまとまる所をよく見せる）
        const near = Math.abs(k - Math.round(k));
        k += dt * (0.08 + 0.5 * near); if (k > 60) k = 2;
        kIn.value = k.toFixed(2); dirty = true;
      }
      if (dirty) { dirty = false; draw(); }
    }
    addEventListener('resize', () => { dirty = true; });
    requestAnimationFrame(frame);
  },
});
