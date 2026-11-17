/* 立体・3D（続き）
 * WebGL・Canvas 2D・CSS の 3D 変形の3つの道具で、それぞれ別の作り方の立体を並べる */
dekiru.add({
  id: '3d-raycaster', c: '3d', lv: 3,
  t: '一人称で歩く迷路（レイキャスティング）', y: 'いちにんしょうであるくめいろれいきゃすてぃんぐ',
  tags: ['レイキャスティング', '迷路', '一人称', '画素の描画'],
  d: '画面の縦1列ごとに視線を1本飛ばし、壁に当たるまでの距離から壁の高さを決めて描く。昔の3Dゲームと同じ方法で、平面の地図から立体の迷路を歩ける。床と天井にも模様を貼っている。矢印キーか WASD、画面下のボタンで歩き、金色の床を目指す。',
  p: '視線はマス目の境界ごとに進める（DDA）。距離は視線の向きに対する垂直な距離を使うので、壁が魚眼のように曲がらない。',
  html: `<canvas id="c"></canvas><p class="msg" id="msg">金色の床を探そう</p><div class="pad"><button data-k="ArrowLeft" aria-label="左を向く">◀</button><button data-k="ArrowUp" aria-label="前へ">▲</button><button data-k="ArrowDown" aria-label="後ろへ">▼</button><button data-k="ArrowRight" aria-label="右を向く">▶</button></div>`,
  css: `
    body { background: #000; overflow: hidden; }
    canvas { width: 100vw; height: 100vh; display: block; image-rendering: pixelated; }
    .msg { position: fixed; left: 10px; top: 6px; margin: 0; color: #ffd166; font: 700 13px system-ui, sans-serif; text-shadow: 0 1px 2px #000; }
    .pad { position: fixed; left: 50%; bottom: 10px; translate: -50% 0; display: flex; gap: 6px; }
    .pad button { width: 44px; height: 40px; background: #fff2; color: #fff; border: 1px solid #fff4; border-radius: 8px; font-size: 16px; touch-action: none; }`,
  js() {
    const MAP = [
      '################',
      '#......#.......#',
      '#.RR.#.#.#####.#',
      '#.R..#...#...#.#',
      '#.R.####.#.G.#.#',
      '#...#....#.G...#',
      '###.#.####.###.#',
      '#...#......#...#',
      '#.######.#.#.###',
      '#.#....#.#.#...#',
      '#.#.GG.#.#.###.#',
      '#...G..#.#...#.#',
      '#.###.##.###.#.#',
      '#.....#......#E#',
      '#.###...####...#',
      '################'];
    const N = MAP.length, cell = (x, y) => (MAP[Math.floor(y)] || '')[Math.floor(x)] || '#';
    const solid = (x, y) => '#RG'.includes(cell(x, y));
    const W = 320, H = 200, c = document.getElementById('c'), ctx = c.getContext('2d');
    c.width = W; c.height = H;
    const img = ctx.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
    const rgb = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
    // 32×32 の模様を作り、遠くほど暗い16段階をあらかじめ用意しておく
    function texture(fn) {
      return Array.from({ length: 16 }, (_, lv) => {
        const k = 1 - lv / 17, t = new Uint32Array(1024);
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const [r, g, b] = fn(x, y); t[y * 32 + x] = rgb(r * k, g * k, b * k); }
        return t;
      });
    }
    const brick = (base) => (x, y) => { const row = y >> 3, off = row % 2 ? 8 : 0, mortar = y % 8 === 7 || (x + off) % 16 === 15; const n = ((x * 7 + y * 13) % 5) * 6; return mortar ? [70, 70, 75] : [base[0] - n, base[1] - n, base[2] - n]; };
    const TEX = { '#': texture(brick([130, 140, 170])), R: texture(brick([180, 70, 55])), G: texture(brick([80, 150, 90])) };
    const FLOOR = texture((x, y) => (((x >> 3) + (y >> 3)) % 2 ? [92, 84, 70] : [110, 100, 84]));
    const CEIL = texture((x, y) => (x % 16 === 0 || y % 16 === 0 ? [30, 34, 52] : [44, 50, 76]));
    const GOAL = texture((x, y) => ((x + y) % 8 < 4 ? [255, 210, 70] : [230, 170, 40]));
    let px = 1.5, py = 1.5, a = 0;
    const keys = new Set();
    addEventListener('keydown', (e) => { const k = { w: 'ArrowUp', s: 'ArrowDown', a: 'ArrowLeft', d: 'ArrowRight' }[e.key] || e.key; if (k.startsWith('Arrow')) { e.preventDefault(); keys.add(k); } });
    addEventListener('keyup', (e) => keys.delete({ w: 'ArrowUp', s: 'ArrowDown', a: 'ArrowLeft', d: 'ArrowRight' }[e.key] || e.key));
    for (const b of document.querySelectorAll('[data-k]')) {
      b.addEventListener('pointerdown', () => keys.add(b.dataset.k));
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => keys.delete(b.dataset.k));
    }
    function render() {
      const dx = Math.cos(a), dy = Math.sin(a), plx = -dy * 0.66, ply = dx * 0.66;
      // 床と天井: 画面の行ごとに「床までの距離」が決まる
      for (let y = H / 2 + 1; y < H; y++) {
        const rowD = (0.5 * H) / (y - H / 2), lv = Math.min(15, (rowD * 1.6) | 0);
        let fx = px + rowD * (dx - plx), fy = py + rowD * (dy - ply);
        const sx = (rowD * 2 * plx) / W, sy = (rowD * 2 * ply) / W;
        for (let x = 0; x < W; x++, fx += sx, fy += sy) {
          const t = ((((fy - Math.floor(fy)) * 32) | 0) << 5) | (((fx - Math.floor(fx)) * 32) | 0);
          buf[y * W + x] = (cell(fx, fy) === 'E' ? GOAL : FLOOR)[lv][t];
          buf[(H - y - 1) * W + x] = CEIL[lv][t];
        }
      }
      // 壁: 列ごとに視線を1本飛ばす
      for (let x = 0; x < W; x++) {
        const cam = (2 * x) / W - 1, rx = dx + plx * cam, ry = dy + ply * cam;
        let mx = Math.floor(px), my = Math.floor(py), side = 0;
        const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry), sx = rx < 0 ? -1 : 1, sy = ry < 0 ? -1 : 1;
        let sdx = (rx < 0 ? px - mx : mx + 1 - px) * ddx, sdy = (ry < 0 ? py - my : my + 1 - py) * ddy;
        for (let i = 0; i < 64; i++) {
          if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
          if (solid(mx + 0.5, my + 0.5)) break;
        }
        const dist = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy), lh = H / dist;
        let wx = side === 0 ? py + dist * ry : px + dist * rx; wx -= Math.floor(wx);
        let tx = (wx * 32) | 0; if ((side === 0 && rx > 0) || (side === 1 && ry < 0)) tx = 31 - tx;
        const T = TEX[cell(mx + 0.5, my + 0.5)] || TEX['#'], lv = Math.min(15, (dist * 1.3 + side * 2) | 0), top = (H - lh) / 2;
        for (let y = Math.max(0, top | 0); y < Math.min(H, top + lh); y++) buf[y * W + x] = T[lv][((((y - top) / lh) * 32) & 31) * 32 + tx];
      }
      ctx.putImageData(img, 0, 0);
      // 右上の地図
      const S = 4, ox = W - N * S - 6, oy = 6;
      ctx.globalAlpha = 0.75;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const ch = MAP[y][x]; ctx.fillStyle = ch === '.' ? '#222' : ch === 'E' ? '#ffd166' : ch === 'R' ? '#b4463a' : ch === 'G' ? '#4f9660' : '#8890aa'; ctx.fillRect(ox + x * S, oy + y * S, S, S); }
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillRect(ox + px * S - 1.5, oy + py * S - 1.5, 3, 3);
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(ox + px * S, oy + py * S); ctx.lineTo(ox + (px + dx * 2) * S, oy + (py + dy * 2) * S); ctx.stroke();
    }
    let last = performance.now();
    (function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let fwd = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0), turn = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
      if (window.THUMB) { const ahead = solid(px + Math.cos(a) * 0.8, py + Math.sin(a) * 0.8); fwd = ahead ? 0 : 1; turn = ahead ? 1 : 0; }
      a += turn * dt * 2.4;
      const step = fwd * dt * 2.6, m = 0.22;
      const nx = px + Math.cos(a) * step, ny = py + Math.sin(a) * step;
      if (!solid(nx + Math.sign(Math.cos(a) * step) * m, py)) px = nx;
      if (!solid(px, ny + Math.sign(Math.sin(a) * step) * m)) py = ny;
      if (cell(px, py) === 'E') { document.getElementById('msg').textContent = 'ゴール！ 最初の場所に戻ります'; px = 1.5; py = 1.5; a = 0; }
      render();
      requestAnimationFrame(loop);
    })(last);
  },
}, {
  id: '3d-webgl-galaxy', c: '3d', lv: 3,
  t: 'WebGLで10万個の星の銀河', y: 'うぇぶじーえるでじゅうまんこのほしのぎんが',
  tags: ['WebGL', '銀河', '点の描画', 'シェーダー'],
  d: '10万個の星を GPU に一度だけ送り、回転は頂点シェーダーで計算する。中心に近い星ほど速く回るので、渦巻きの腕が少しずつ巻き込まれていく。ドラッグで傾き、ホイールで近づける。',
  p: 'JS は星の初期位置を一度送るだけ。毎フレーム送るのは「時刻」1つで、10万個の位置は GPU が並列に計算する。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; touch-action: none; cursor: grab; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl', { antialias: false });
    if (!gl) { document.body.textContent = 'WebGL が使えない環境です'; throw new Error('WebGL が使えません'); }
    function prog(vs, fs) {
      const p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); gl.attachShader(p, s); }
      gl.linkProgram(p); gl.useProgram(p); return p;
    }
    const pg = prog(`
      attribute vec4 a; uniform float t, sz; uniform mat4 m; varying vec3 col;
      void main() {
        float r = a.x, th = a.y - t * 0.35 / (0.25 + r);
        vec4 q = m * vec4(cos(th) * r, a.z, sin(th) * r, 1.0);
        gl_Position = q;
        gl_PointSize = sz * (0.6 + a.w * 2.5) / q.w;
        col = mix(vec3(1.0, 0.82, 0.55), vec3(0.45, 0.62, 1.0), clamp(r / 1.4, 0.0, 1.0));
        col = mix(col, vec3(1.0, 0.45, 0.7), step(0.985, fract(a.w * 91.7)) * 0.8) * (0.35 + a.w);
      }`, `
      precision mediump float; varying vec3 col;
      void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(col * smoothstep(0.5, 0.0, d), 1.0); }`);
    const N = 100000, data = new Float32Array(N * 4), g = () => Math.random() + Math.random() + Math.random() - 1.5;
    for (let i = 0; i < N; i++) {
      const r = Math.min(2.2, -Math.log(1 - Math.random() * 0.999) * 0.45), arm = Math.floor(Math.random() * 3);
      data[i * 4] = r;
      data[i * 4 + 1] = (arm * Math.PI * 2) / 3 + r * 2.8 + (g() * 0.5) / (r + 0.4);
      data[i * 4 + 2] = g() * 0.05 * (1 + 3 * Math.exp(-r * 4));
      data[i * 4 + 3] = Math.random() ** 6;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const aA = gl.getAttribLocation(pg, 'a'); gl.enableVertexAttribArray(aA); gl.vertexAttribPointer(aA, 4, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    const uT = gl.getUniformLocation(pg, 't'), uM = gl.getUniformLocation(pg, 'm'), uS = gl.getUniformLocation(pg, 'sz');
    const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[i * 4 + j] += a[k * 4 + j] * b[i * 4 + k]; return o; };
    const persp = (f, asp, n, fr) => { const t = 1 / Math.tan(f / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, (2 * fr * n) / (n - fr), 0]; };
    const rotX = (a) => [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1];
    const rotY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
    const move = (z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1];
    let tilt = 0.55, spin = 0, dist = 4.2, drag = null;
    c.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY, spin, tilt]; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (drag) { spin = drag[2] + (e.clientX - drag[0]) / 200; tilt = Math.max(-1.5, Math.min(1.5, drag[3] + (e.clientY - drag[1]) / 200)); } });
    c.addEventListener('pointerup', () => { drag = null; });
    c.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.max(1.2, Math.min(9, dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
    (function draw(t) {
      const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.clearColor(0, 0, 0.02, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!drag) spin += 0.0008;
      gl.uniform1f(uT, t / 1000); gl.uniform1f(uS, h / 260);
      gl.uniformMatrix4fv(uM, false, new Float32Array(mul(persp(0.9, w / h, 0.05, 50), mul(move(-dist), mul(rotX(tilt), rotY(spin))))));
      gl.drawArrays(gl.POINTS, 0, N);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-webgl-terrain', c: '3d', lv: 3,
  t: '日が昇って沈む地形（WebGL）', y: 'ひがのぼってしずむちけいうぇぶじーえる',
  tags: ['WebGL', '地形', '陰影', 'ノイズ'],
  d: 'ノイズから山と谷の高さを作り、2万5千個の頂点の網にして GPU へ送る。太陽が回ると、斜面の明るさ・空の色・遠くのかすみが朝から夜へ移り変わる。高さと傾きで、砂浜・草地・岩・雪を塗り分けている。',
  p: '明るさは「面の向き（法線）と太陽の向きの内積」。法線は隣の頂点との高さの差から求める。',
  html: `<canvas id="c"></canvas><p class="clock" id="clock"></p>`,
  css: `body { background: #000; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; } .clock { position: fixed; left: 10px; top: 6px; margin: 0; font: 700 14px ui-monospace, monospace; color: #fff; text-shadow: 0 1px 3px #000; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl');
    if (!gl) { document.body.textContent = 'WebGL が使えない環境です'; throw new Error('WebGL が使えません'); }
    function prog(vs, fs) {
      const p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); gl.attachShader(p, s); }
      gl.linkProgram(p); gl.useProgram(p); return p;
    }
    const pg = prog(`
      attribute vec3 p, n, col; uniform mat4 m; varying vec3 vn, vc; varying float vd;
      void main() { vec4 q = m * vec4(p, 1.0); vn = n; vc = col; vd = q.w; gl_Position = q; }`, `
      precision mediump float; uniform vec3 L, sun, sky; varying vec3 vn, vc; varying float vd;
      void main() {
        float dif = max(dot(normalize(vn), L), 0.0);
        vec3 c = vc * (sky * 0.45 + sun * dif * 1.1);
        float fog = 1.0 - exp(-vd * vd * 0.006);
        gl_FragColor = vec4(mix(c, sky, clamp(fog, 0.0, 1.0)), 1.0);
      }`);
    const rnd = (i, j) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const noise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), a = rnd(i, j), b = rnd(i + 1, j), cc = rnd(i, j + 1), d = rnd(i + 1, j + 1); return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v; };
    const fbm = (x, y) => { let s = 0, amp = 0.5, f = 1; for (let o = 0; o < 6; o++) { s += amp * noise(x * f, y * f); amp *= 0.5; f *= 2.03; } return s; };
    const G = 160, S = 8, WATER = 0.32;
    const H = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) H[j * G + i] = Math.max(WATER, Math.pow(fbm(i / 32, j / 32), 2.2) * 3.2);
    const at = (i, j) => H[Math.max(0, Math.min(G - 1, j)) * G + Math.max(0, Math.min(G - 1, i))];
    const data = new Float32Array(G * G * 9), cell = S / G;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const h = at(i, j), nx = at(i - 1, j) - at(i + 1, j), nz = at(i, j - 1) - at(i, j + 1), ny = 2 * cell, l = Math.hypot(nx, ny, nz), k = (j * G + i) * 9;
      const steep = ny / l < 0.75;
      const col = h <= WATER + 0.001 ? [0.12, 0.32, 0.55] : h < WATER + 0.06 ? [0.78, 0.72, 0.52] : steep ? [0.45, 0.4, 0.36] : h < 1.25 ? [0.28, 0.52, 0.22] : h < 1.7 ? [0.42, 0.38, 0.32] : [0.95, 0.96, 1.0];
      data.set([(i / (G - 1) - 0.5) * S, h, (j / (G - 1) - 0.5) * S, nx / l, ny / l, nz / l, ...col], k);
    }
    const idx = new Uint16Array((G - 1) * (G - 1) * 6);
    let q = 0;
    for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) { const a = j * G + i; idx.set([a, a + G, a + 1, a + 1, a + G, a + G + 1], q); q += 6; }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    [['p', 0], ['n', 12], ['col', 24]].forEach(([name, off]) => { const l = gl.getAttribLocation(pg, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 36, off); });
    gl.enable(gl.DEPTH_TEST);
    const U = (n) => gl.getUniformLocation(pg, n), uM = U('m'), uL = U('L'), uSun = U('sun'), uSky = U('sky');
    const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[i * 4 + j] += a[k * 4 + j] * b[i * 4 + k]; return o; };
    const persp = (f, asp, n, fr) => { const t = 1 / Math.tan(f / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, (2 * fr * n) / (n - fr), 0]; };
    const rotX = (a) => [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1];
    const rotY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
    const move = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
    const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    (function draw(t) {
      const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      const day = (t / 1000) * 0.18, sy = Math.sin(day), L = [Math.cos(day), Math.max(-0.2, sy), 0.35];
      const ll = Math.hypot(...L), up = Math.max(0, Math.min(1, sy * 3 + 0.3)), dusk = Math.max(0, 1 - Math.abs(sy) * 4);
      const sky = mix(mix([0.02, 0.03, 0.08], [0.45, 0.65, 0.95], up), [0.95, 0.5, 0.3], dusk * 0.6);
      const sun = mix([0.05, 0.06, 0.12], mix([1, 0.95, 0.85], [1, 0.55, 0.3], dusk), up);
      gl.clearColor(sky[0], sky[1], sky[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform3f(uL, L[0] / ll, L[1] / ll, L[2] / ll); gl.uniform3fv(uSun, sun); gl.uniform3fv(uSky, sky);
      gl.uniformMatrix4fv(uM, false, new Float32Array(mul(persp(0.9, w / h, 0.1, 40), mul(move(0, -1.6, -6.2), mul(rotX(0.42), rotY(t / 9000))))));
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      const hour = ((day / (Math.PI * 2)) * 24 + 6) % 24;
      document.getElementById('clock').textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-software-renderer', c: '3d', lv: 3,
  t: '自作の3D描画（面の塗りと陰影）', y: 'じさくのすりーでぃーびょうがめんのぬりといんえい',
  tags: ['3D描画', '陰影', '隠面消去', '結び目'],
  d: 'WebGL を使わず、Canvas 2D の多角形の塗りだけで立体を描く。管を巻いた結び目（トーラスノット）の面を、奥から手前の順に並べ替えて塗り（画家のアルゴリズム）、光の向きとの角度で明るさを変える。ドラッグで回せる。',
  p: '裏を向いた面は、画面上での頂点の並びが時計回りか反時計回りかで見分けて描かない。これだけで描く面が半分に減る。',
  html: `<canvas id="c"></canvas><div class="ui"><select id="mode" aria-label="描き方"><option value="shade">塗り＋陰影</option><option value="flat">塗りだけ</option><option value="wire">線だけ</option></select><span id="info"></span></div>`,
  css: `body { background: radial-gradient(#2b2f3a, #101217); overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; cursor: grab; touch-action: none; } .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 8px; align-items: center; color: #ccd; font: 12px system-ui, sans-serif; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const P = 2, Q = 3, SEG = 140, TUBE = 10, R = 0.42;
    const curve = (u) => { const cu = Math.cos(u), su = Math.sin(u), r = 2 + Math.cos((Q / P) * u); return [r * cu * 0.5, r * su * 0.5, Math.sin((Q / P) * u) * 0.5]; };
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const verts = [], outs = [];
    for (let i = 0; i < SEG; i++) {
      const u = (i / SEG) * P * Math.PI * 2, p1 = curve(u), p2 = curve(u + 0.01);
      const T = sub(p2, p1), B = norm(cross(T, add(p2, p1))), N = norm(cross(B, T));
      for (let j = 0; j < TUBE; j++) {
        const v = (j / TUBE) * Math.PI * 2, cx = -Math.cos(v), cy = Math.sin(v), o = [cx * N[0] + cy * B[0], cx * N[1] + cy * B[1], cx * N[2] + cy * B[2]];
        outs.push(o); verts.push(add(p1, o.map((q) => q * R * 0.5))); // 管の中心から外へ向かう向きが、そのまま面の外向き
      }
    }
    const quads = [];
    for (let i = 0; i < SEG; i++) for (let j = 0; j < TUBE; j++) { const i2 = (i + 1) % SEG, j2 = (j + 1) % TUBE; quads.push([i * TUBE + j, i2 * TUBE + j, i2 * TUBE + j2, i * TUBE + j2, i / SEG]); }
    let ay = 0.4, ax = 0.6, drag = null;
    c.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY, ay, ax]; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (drag) { ay = drag[2] + (e.clientX - drag[0]) / 150; ax = drag[3] + (e.clientY - drag[1]) / 150; } });
    c.addEventListener('pointerup', () => { drag = null; });
    const L = norm([-0.5, -0.7, 0.8]);
    (function draw() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      x.clearRect(0, 0, W, H);
      if (!drag) { ay += 0.006; ax += 0.0023; }
      const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax), F = Math.min(W, H) * 1.1, D = 4;
      const rot = ([a, b, z]) => { const x1 = a * cy + z * sy, z1 = -a * sy + z * cy; return [x1, b * cx - z1 * sx, b * sx + z1 * cx]; };
      const cam = verts.map(rot), nrm = outs.map(rot);
      const scr = cam.map(([a, b, z]) => [W / 2 + (a * F) / (D - z), H / 2 + (b * F) / (D - z)]);
      const mode = document.getElementById('mode').value, list = [];
      for (const q of quads) {
        const n = norm([0, 1, 2].map((k) => nrm[q[0]][k] + nrm[q[1]][k] + nrm[q[2]][k] + nrm[q[3]][k]));
        const z = (cam[q[0]][2] + cam[q[1]][2] + cam[q[2]][2] + cam[q[3]][2]) / 4, p = cam[q[0]];
        // 裏向きの面は描かない: 目（0, 0, D）から面へ向かう線と、面の外向きが同じ向きなら裏
        if (mode !== 'wire' && n[0] * p[0] + n[1] * p[1] + n[2] * (p[2] - D) > 0) continue;
        list.push([q, z, n]);
      }
      list.sort((a, b) => a[1] - b[1]);
      for (const [q, , n] of list) {
        x.beginPath(); for (let k = 0; k < 4; k++) x[k ? 'lineTo' : 'moveTo'](...scr[q[k]]); x.closePath();
        const hue = q[4] * 360;
        if (mode === 'wire') { x.strokeStyle = `hsl(${hue} 80% 65% / .6)`; x.lineWidth = 0.7; x.stroke(); continue; }
        const d = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]), spec = Math.pow(d, 24) * 40;
        const col = mode === 'shade' ? `hsl(${hue} 70% ${12 + d * 50 + spec}%)` : `hsl(${hue} 70% 50%)`;
        x.fillStyle = col; x.strokeStyle = col; x.lineWidth = 0.6; x.fill(); x.stroke();
      }
      document.getElementById('info').textContent = `描いた面 ${list.length} / ${quads.length}`;
      requestAnimationFrame(draw);
    })();
  },
}, {
  id: '3d-css-sphere', c: '3d', lv: 2,
  t: 'CSSの板を並べた球', y: 'しーえすえすのいたをならべたきゅう',
  tags: ['CSS 3D', '球', 'ミラーボール', 'transform'],
  d: '数百枚の小さな板を、緯度と経度の角度だけ回して奥へ押し出すと球になる。板ごとに光り方の時間をずらしてミラーボールのように瞬かせる。ドラッグで傾き、ボタンで色の球に切り替えられる。',
  p: '板1枚の置き方は transform: rotateY(経度) rotateX(緯度) translateZ(半径) の1行だけ。角度は CSS 変数で渡している。',
  html: `<div class="scene" id="scene"><div class="tilt"><div class="ball" id="ball"></div></div></div><div class="ui"><button id="mode">色の球にする</button><span id="n"></span></div>`,
  css: `
    body { background: radial-gradient(circle at 50% 40%, #2a2340, #08070d); overflow: hidden; height: 100vh; display: grid; place-items: center; touch-action: none; }
    .scene { perspective: 800px; width: 300px; height: 300px; position: relative; }
    .tilt { position: absolute; inset: 0; transform-style: preserve-3d; transform: rotateX(var(--tx, -12deg)); }
    .ball { position: absolute; inset: 0; transform-style: preserve-3d; animation: spin 18s linear infinite; }
    @keyframes spin { to { transform: rotateY(360deg); } }
    .tile { position: absolute; left: 50%; top: 50%; height: 20px; width: var(--w); margin: -10px 0 0 calc(var(--w) / -2);
      transform: rotateY(var(--lon)) rotateX(var(--lat)) translateZ(min(32vmin, 140px)); backface-visibility: hidden; border-radius: 2px;
      background: linear-gradient(135deg, #fff, #9aa3b8 45%, #e8ecf5 55%, #6d7488);
      animation: glint 2.4s var(--d) infinite; }
    @keyframes glint { 0%, 85%, 100% { filter: brightness(.75); } 90% { filter: brightness(2.2) drop-shadow(0 0 6px #fff); } }
    .color .tile { background: hsl(var(--h) 85% 60%); animation: none; filter: brightness(calc(.6 + var(--lit))); }
    .ui { position: fixed; left: 10px; top: 8px; display: flex; gap: 8px; align-items: center; color: #ccd; font: 12px system-ui, sans-serif; }`,
  js() {
    const ball = document.getElementById('ball');
    let n = 0;
    for (let lat = -78; lat <= 78; lat += 12) {
      const count = Math.max(4, Math.round(30 * Math.cos((lat * Math.PI) / 180)));
      const w = (2 * Math.PI * 140 * Math.cos((lat * Math.PI) / 180)) / count - 3;
      for (let k = 0; k < count; k++) {
        const lon = (k / count) * 360, t = document.createElement('div');
        t.className = 'tile';
        t.style.cssText = `--lon:${lon}deg;--lat:${lat}deg;--w:${w.toFixed(1)}px;--h:${(lon + lat * 2).toFixed(0)};--lit:${(0.5 + 0.5 * Math.sin((lat * Math.PI) / 180)).toFixed(2)};--d:${(-Math.random() * 2.4).toFixed(2)}s`;
        ball.append(t); n++;
      }
    }
    document.getElementById('n').textContent = `板 ${n} 枚`;
    document.getElementById('mode').onclick = (e) => { const on = ball.classList.toggle('color'); e.target.textContent = on ? 'ミラーボールにする' : '色の球にする'; };
    addEventListener('pointermove', (e) => { if (e.buttons) document.getElementById('scene').style.setProperty('--tx', `${(-(e.clientY / innerHeight) * 60 + 30).toFixed(1)}deg`); });
    if (window.THUMB) setTimeout(() => ball.classList.add('color'), 2500);
  },
}, {
  id: '3d-css-room', c: '3d', lv: 3,
  t: 'CSSで作る箱の部屋', y: 'しーえすえすでつくるはこのへや',
  tags: ['CSS 3D', '部屋', 'ジオラマ', 'transform'],
  d: '壁・床・机・本棚・ベッド・電気スタンドを、すべて div の板を組み合わせて作ったジオラマ。マウスを動かすと部屋をのぞく角度が変わり、ボタンで昼と夜を切り替えると窓の外と明かりが変わる。',
  p: '箱は6枚の板。どの板も「回して、厚みの半分だけ押し出す」の組み合わせで置ける。部品を足す関数1つで家具が増やせる。',
  html: `<div class="view"><div class="room" id="room"></div></div><div class="ui"><button id="night">夜にする</button><button id="lamp">電気をつける</button></div>`,
  css: `
    body { background: #1b1a20; overflow: hidden; height: 100vh; display: grid; place-items: center; }
    .view { perspective: 700px; perspective-origin: 50% 35%; width: 1px; height: 1px; }
    .room { transform-style: preserve-3d; transform: translateZ(-120px) rotateX(var(--rx, -14deg)) rotateY(var(--ry, -24deg)) scale(var(--k, .8)); transition: transform .4s ease-out; }
    .room * { position: absolute; transform-style: preserve-3d; }
    .f { left: 0; top: 0; backface-visibility: hidden; }
    .room .f { filter: brightness(var(--lit, 1)); transition: filter .6s; }
    .night .f { --lit: .45; } .night.lamp .f { --lit: .85; }
    .window { background: linear-gradient(#7cc6ff, #d9f1ff); border: 10px solid #f3eee4; box-shadow: inset 0 0 0 4px #f3eee4; transition: background .6s; }
    .window::before, .window::after { content: ''; position: absolute; background: #f3eee4; }
    .window::before { left: 50%; top: 0; bottom: 0; width: 6px; margin-left: -3px; } .window::after { top: 50%; left: 0; right: 0; height: 6px; margin-top: -3px; }
    .night .window { background: radial-gradient(circle at 70% 30%, #fff8d0 0 6px, transparent 7px), radial-gradient(1px 1px at 20% 40%, #fff, transparent), radial-gradient(1px 1px at 40% 70%, #fff, transparent), linear-gradient(#0b1030, #233066); }
    .pool { border-radius: 50%; background: radial-gradient(#ffe9a8cc, transparent 70%); opacity: 0; transition: opacity .6s; }
    .lamp .pool { opacity: 1; } .lamp .bulb .f { background: #fff3c4 !important; box-shadow: 0 0 30px 10px #ffd96a; --lit: 1.3; }
    .ui { position: fixed; left: 10px; top: 8px; display: flex; gap: 6px; }`,
  js() {
    const room = document.getElementById('room');
    const RW = 520, RH = 300, RD = 460, FY = RH / 2;
    const shade = (col, k) => `color-mix(in oklab, ${col}, black ${k}%)`;
    // 1枚の板: 幅 w・高さ h の div を、中心を原点にして transform で置く
    function plate(parent, w, h, tf, bg, extra = '') {
      const d = document.createElement('div');
      d.className = 'f';
      d.style.cssText = `width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px;transform:${tf};background:${bg};${extra}`;
      parent.append(d); return d;
    }
    // 箱: 中心 (x, y, z)、大きさ w×h×d。面ごとに少しずつ暗くして立体に見せる
    function box(x, y, z, w, h, d, col, extra = '') {
      const g = document.createElement('div');
      g.style.transform = `translate3d(${x}px, ${y}px, ${z}px)`;
      plate(g, w, h, `translateZ(${d / 2}px)`, shade(col, 12), extra);
      plate(g, w, h, `rotateY(180deg) translateZ(${d / 2}px)`, shade(col, 30), extra);
      plate(g, d, h, `rotateY(90deg) translateZ(${w / 2}px)`, shade(col, 22), extra);
      plate(g, d, h, `rotateY(-90deg) translateZ(${w / 2}px)`, shade(col, 22), extra);
      plate(g, w, d, `rotateX(90deg) translateZ(${h / 2}px)`, col);
      plate(g, w, d, `rotateX(-90deg) translateZ(${h / 2}px)`, shade(col, 45));
      room.append(g); return g;
    }
    // 床・壁（手前の壁は無い）
    const floor = plate(room, RW, RD, `translateY(${FY}px) rotateX(90deg)`, 'repeating-linear-gradient(90deg, #b98a5e 0 40px, #a87b52 40px 42px)');
    plate(room, RW, RH, `translateZ(${-RD / 2}px)`, '#e9e1d2');
    plate(room, RD, RH, `translateX(${-RW / 2}px) rotateY(90deg)`, '#ddd3c1');
    plate(room, RD, RH, `translateX(${RW / 2}px) rotateY(-90deg)`, '#d6ccb9');
    plate(room, RW, RD, `translateY(${-FY}px) rotateX(-90deg)`, '#f2ede4');
    const rug = document.createElement('div'); rug.style.cssText = 'left:140px;top:150px;width:240px;height:160px;border-radius:12px;background:repeating-radial-gradient(#c23b22 0 8px,#e8b04b 8px 14px,#26407c 14px 20px);opacity:.85'; floor.append(rug);
    const pool = document.createElement('div'); pool.className = 'pool'; pool.style.cssText = 'left:270px;top:-10px;width:260px;height:200px'; floor.append(pool);
    // 窓と絵
    plate(room, 170, 120, `translate3d(60px, -40px, ${-RD / 2 + 1}px)`, '', '').classList.add('window');
    plate(room, 70, 90, `translate3d(-140px, -50px, ${-RD / 2 + 1}px)`, 'linear-gradient(#f7d488, #e0532f 60%, #26407c)', 'border:6px solid #5a3b22');
    // 机・椅子・電気スタンド
    box(110, FY - 76, -150, 200, 10, 100, '#8a5a3a');
    for (const [dx, dz] of [[-90, -40], [90, -40], [-90, 40], [90, 40]]) box(110 + dx, FY - 36, -150 + dz, 8, 72, 8, '#6b4329');
    box(110, FY - 44, -70, 70, 8, 60, '#26407c'); box(110, FY - 80, -42, 70, 70, 6, '#26407c');
    for (const [dx, dz] of [[-30, -25], [30, -25], [-30, 25], [30, 25]]) box(110 + dx, FY - 20, -70 + dz, 6, 40, 6, '#1d2f5c');
    box(170, FY - 110, -175, 6, 60, 6, '#333'); box(170, FY - 146, -175, 40, 22, 40, '#f2c14e');
    box(170, FY - 132, -175, 14, 8, 14, '#ddd').classList.add('bulb');
    // 本棚とベッド
    box(-RW / 2 + 22, FY - 110, -110, 40, 220, 150, '#6b4329');
    box(-RW / 2 + 44, FY - 110, -110, 4, 210, 140, 'repeating-linear-gradient(90deg,#c23b22 0 12px,#e8b04b 12px 20px,#26407c 20px 33px,#2f855a 33px 41px)');
    box(-120, FY - 24, 60, 150, 48, 220, '#f4f1ea'); box(-120, FY - 56, -30, 120, 18, 44, '#fff');
    box(-120, FY - 50, 100, 154, 6, 140, '#7a9cc6');
    const setView = (px, py) => { room.style.setProperty('--ry', `${-24 + px * 40}deg`); room.style.setProperty('--rx', `${-14 - py * 16}deg`); };
    addEventListener('pointermove', (e) => setView(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5));
    const fit = () => room.style.setProperty('--k', Math.max(0.3, Math.min(1, Math.min(innerWidth / 780, innerHeight / 520))).toFixed(2));
    addEventListener('resize', fit); fit();
    document.getElementById('night').onclick = (e) => { const on = room.classList.toggle('night'); e.target.textContent = on ? '昼にする' : '夜にする'; };
    document.getElementById('lamp').onclick = (e) => { const on = room.classList.toggle('lamp'); e.target.textContent = on ? '電気を消す' : '電気をつける'; };
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.05; setView(Math.sin(t) * 0.5, Math.cos(t * 0.7) * 0.3); if (Math.round(t * 20) % 80 === 0) { room.classList.toggle('night'); room.classList.toggle('lamp'); } }, 50); }
  },
}, {
  id: '3d-isometric-city', c: '3d', lv: 3,
  t: '昼と夜がめぐるアイソメトリックの街', y: 'ひるとよるがめぐるあいそめとりっくのまち',
  tags: ['アイソメトリック', '街', '夜景', 'Canvas'],
  d: '斜め上から見下ろす投影（アイソメトリック）で、道路とビルと公園の街を描く。時間が進むと空が夕焼けから夜になり、ビルの窓に明かりがともり、車がヘッドライトをつけて走る。クリックするたびに別の街ができる。',
  p: '奥のマスから手前のマスへ（i + j の小さい順に）描けば、手前のビルが奥のビルを自然に隠す。',
  html: `<canvas id="c" aria-label="街"></canvas><p class="t" id="t"></p>`,
  css: `body { overflow: hidden; background: #000; } canvas { width: 100vw; height: 100vh; display: block; cursor: pointer; } .t { position: fixed; left: 10px; top: 6px; margin: 0; color: #fff; font: 700 13px ui-monospace, monospace; text-shadow: 0 1px 3px #000; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), G = 14;
    let seed = 1, city = [];
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    function build() {
      seed = Math.floor(Math.random() * 1e9) + 1;
      city = [];
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const road = i % 5 === 2 || j % 5 === 2, park = !road && rand() < 0.12;
        const d = Math.hypot(i - G / 2, j - G / 2);
        city.push({ i, j, road, park, h: road || park ? 0 : 14 + rand() * (90 - d * 5) + (rand() < 0.08 ? 60 : 0), hue: [210, 30, 0, 160, 45][Math.floor(rand() * 5)], lights: Array.from({ length: 40 }, () => rand()) });
      }
    }
    const cars = Array.from({ length: 22 }, (_, k) => ({ line: 2 + 5 * (k % 3), dir: k % 2, pos: Math.random() * G, v: (0.6 + Math.random() * 0.8) * (k % 4 < 2 ? 1 : -1) }));
    build();
    c.addEventListener('click', build);
    const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    function draw(t) {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      // phase 0 が正午、0.5 が真夜中。夜の濃さは「太陽がどれだけ地平線の下にあるか」
      const phase = (t / 24000) % 1, sun = Math.cos(phase * Math.PI * 2), night = Math.max(0, Math.min(1, 0.5 - sun * 2)), dusk = Math.max(0, 1 - Math.abs(sun) * 3);
      const top = mix(mix([110, 170, 230], [12, 16, 40], night), [250, 140, 90], dusk * 0.5), bot = mix(mix([200, 225, 245], [30, 30, 70], night), [255, 190, 120], dusk * 0.7);
      const sky = x.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, `rgb(${top})`); sky.addColorStop(1, `rgb(${bot})`); x.fillStyle = sky; x.fillRect(0, 0, W, H);
      const k = Math.min(W / (G * 52), H / (G * 26 + 220)), TW = 52 * k, TH = 26 * k, ox = W / 2, oy = H / 2 - (G * TH) / 2 + 60 * k;
      const P = (i, j, z = 0) => [ox + ((i - j) * TW) / 2, oy + ((i + j) * TH) / 2 - z * k];
      const poly = (pts, fill) => { x.beginPath(); pts.forEach((p, n) => x[n ? 'lineTo' : 'moveTo'](...p)); x.closePath(); x.fillStyle = fill; x.fill(); };
      const lit = 1 - night * 0.6;
      const tone = (h, s, l) => `hsl(${h} ${s}% ${l * lit}%)`;
      for (const car of cars) car.pos = (car.pos + car.v * 0.016 + G) % G;
      for (let s = 0; s < G * 2 - 1; s++) {
        for (const b of city) {
          if (b.i + b.j !== s) continue;
          const { i, j } = b;
          poly([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], b.road ? tone(220, 8, 32) : b.park ? tone(110, 45, 42) : tone(30, 10, 60));
          if (b.road) { x.strokeStyle = `rgba(255,255,255,${0.35 * lit})`; x.setLineDash([3 * k, 4 * k]); x.beginPath(); if (i % 5 === 2) { x.moveTo(...P(i + 0.5, j)); x.lineTo(...P(i + 0.5, j + 1)); } if (j % 5 === 2) { x.moveTo(...P(i, j + 0.5)); x.lineTo(...P(i + 1, j + 0.5)); } x.stroke(); x.setLineDash([]); }
          if (b.park) { for (const [a, d] of [[0.3, 0.3], [0.7, 0.55], [0.4, 0.75]]) { const [tx, ty] = P(i + a, j + d); x.fillStyle = tone(130, 50, 28); x.beginPath(); x.arc(tx, ty - 6 * k, 5 * k, 0, 7); x.fill(); } }
          if (b.h) {
            const m = 0.12, h = b.h, a = [i + m, j + 1 - m], bb = [i + 1 - m, j + 1 - m], cc = [i + 1 - m, j + m];
            poly([P(...a), P(...bb), P(...bb, h), P(...a, h)], tone(b.hue, 18, 48));
            poly([P(...bb), P(...cc), P(...cc, h), P(...bb, h)], tone(b.hue, 18, 36));
            poly([P(i + m, j + m, h), P(...cc, h), P(...bb, h), P(...a, h)], tone(b.hue, 20, 70));
            const rows = Math.floor(h / 10);
            for (let r = 0; r < rows; r++) for (let w = 0; w < 3; w++) {
              const on = night > 0.3 && b.lights[(r * 3 + w) % 40] > 0.45 - night * 0.2;
              x.fillStyle = on ? `rgba(255, 220, 130, ${0.4 + night * 0.6})` : `rgba(20, 30, 50, ${0.25 + night * 0.3})`;
              const f = (w + 0.6) / 3.6, z = 6 + r * 10;
              const [p1x, p1y] = P(a[0] + (bb[0] - a[0]) * f, a[1], z), [p2x, p2y] = P(cc[0], bb[1] + (cc[1] - bb[1]) * f, z);
              x.fillRect(p1x - 2 * k, p1y - 5 * k, 3.5 * k, 4 * k); x.fillRect(p2x - 1.5 * k, p2y - 5 * k, 3.5 * k, 4 * k);
            }
          }
        }
        for (const car of cars) {
          const ci = car.dir ? car.pos : car.line + 0.5 + (car.v > 0 ? 0.18 : -0.18), cj = car.dir ? car.line + 0.5 + (car.v > 0 ? 0.18 : -0.18) : car.pos;
          if (Math.floor(ci) + Math.floor(cj) !== s) continue;
          const [px, py] = P(ci, cj, 3);
          x.fillStyle = `hsl(${(car.line * 70 + car.dir * 140) % 360} 70% ${45 * lit + 10}%)`; x.fillRect(px - 4 * k, py - 3 * k, 8 * k, 5 * k);
          if (night > 0.3) { x.fillStyle = `rgba(255,240,180,${night})`; x.beginPath(); x.arc(px + (car.dir ? 1 : -1) * Math.sign(car.v) * 5 * k, py, 3 * k, 0, 7); x.fill(); }
        }
      }
      const hr = (phase * 24 + 12) % 24;
      document.getElementById('t').textContent = `${String(Math.floor(hr)).padStart(2, '0')}時 ・ クリックで別の街`;
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  },
}, {
  id: '3d-voxel-island', c: '3d', lv: 3,
  t: '積み木でできた島（ボクセル）', y: 'つみきでできたしまぼくせる',
  tags: ['ボクセル', 'アイソメトリック', 'ノイズ', '地形生成'],
  d: 'ノイズで決めた高さの数だけ立方体を積み、砂浜・草原・岩山・雪の島を作る。作り直すたびに地面が下からせり上がり、木が生え、雲が流れる。ボタンで島を90度回して裏側も見られる。',
  p: '見えるのは柱の上面と手前の2面だけ。立方体を1個ずつではなく「柱」として描き、段の線を足すと、少ない手数で積み木に見える。',
  html: `<canvas id="c"></canvas><div class="ui"><button id="again">島を作り直す</button><button id="turn">90度回す</button></div>`,
  css: `body { background: linear-gradient(#8fd3ff, #e6f6ff); overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; } .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 6px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), G = 40, WL = 3;
    let hmap = [], trees = [], rot = 0, grow = 0, land = null;
    function make() {
      const s = Math.random() * 1000, rnd = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7 + s) * 43758.5453; return v - Math.floor(v); };
      const noise = (px, py) => { const i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return rnd(i, j) * (1 - u) * (1 - v) + rnd(i + 1, j) * u * (1 - v) + rnd(i, j + 1) * (1 - u) * v + rnd(i + 1, j + 1) * u * v; };
      hmap = []; trees = new Set();
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const d = Math.hypot(i - G / 2, j - G / 2) / (G / 2), n = noise(i / 8, j / 8) * 0.6 + noise(i / 4, j / 4) * 0.3 + noise(i / 2, j / 2) * 0.1;
        const h = Math.max(1, Math.round((n * 1.5 - d * d * 1.1) * 18));
        hmap.push(h);
        if (h >= 5 && h <= 8 && rnd(i * 3.1, j * 7.7) < 0.12) trees.add(j * G + i);
      }
      grow = 0;
    }
    const mat = (h, z) => (z >= 12 ? '#f4f7fb' : z >= 9 ? '#8c8a86' : z >= 5 ? (z === h ? '#6abf4b' : '#8a6243') : '#e8d39a');
    const at = (i, j) => { let a = i, b = j; for (let r = 0; r < rot; r++) [a, b] = [G - 1 - b, a]; return [a, b]; };
    function render(target, k, W, H) {
      const TW = 20 * k, TH = 10 * k, UH = 7 * k, ox = W / 2, oy = H / 2 - (G * TH) / 2 + 40 * k;
      const P = (i, j, z) => [ox + ((i - j) * TW) / 2, oy + ((i + j) * TH) / 2 - z * UH];
      const poly = (pts, fill) => { target.beginPath(); pts.forEach((p, n) => target[n ? 'lineTo' : 'moveTo'](...p)); target.closePath(); target.fillStyle = fill; target.fill(); };
      const dark = (col, f) => { const n = parseInt(col.slice(1), 16); return `rgb(${((n >> 16) & 255) * f},${((n >> 8) & 255) * f},${(n & 255) * f})`; };
      // 画面上の (i, j) に見える柱の、いまの高さ（せり上がりの途中も含む）
      const shown = new Int16Array(G * G);
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const [si, sj] = at(i, j), f = Math.max(0, Math.min(1, grow * 1.7 - ((si + sj) / (G * 2)) * 0.7)); shown[j * G + i] = Math.max(1, Math.round(hmap[sj * G + si] * f)); }
      const hAt = (i, j) => (i >= G || j >= G ? 0 : shown[j * G + i]);
      for (let s = 0; s < G * 2 - 1; s++) for (let i = Math.max(0, s - G + 1); i <= Math.min(G - 1, s); i++) {
        const j = s - i, [si, sj] = at(i, j), idx = sj * G + si, full = hmap[idx], h = shown[j * G + i];
        // 手前の柱に隠れる段は描かない。見える段だけ描くので手数が大きく減る
        for (let z = hAt(i, j + 1) + 1; z <= h; z++) poly([P(i, j + 1, z - 1), P(i + 1, j + 1, z - 1), P(i + 1, j + 1, z), P(i, j + 1, z)], dark(mat(h, z), 0.78));
        for (let z = hAt(i + 1, j) + 1; z <= h; z++) poly([P(i + 1, j + 1, z - 1), P(i + 1, j, z - 1), P(i + 1, j, z), P(i + 1, j + 1, z)], dark(mat(h, z), 0.62));
        poly([P(i, j, h), P(i + 1, j, h), P(i + 1, j + 1, h), P(i, j + 1, h)], mat(h, h));
        if (h < WL) poly([P(i, j, WL - 0.3), P(i + 1, j, WL - 0.3), P(i + 1, j + 1, WL - 0.3), P(i, j + 1, WL - 0.3)], 'rgba(40, 120, 220, .62)');
        if (trees.has(idx) && h === full) {
          poly([P(i + 0.4, j + 0.6, h), P(i + 0.6, j + 0.6, h), P(i + 0.6, j + 0.6, h + 1.5), P(i + 0.4, j + 0.6, h + 1.5)], '#6b4329');
          poly([P(i + 0.15, j + 0.85, h + 1.4), P(i + 0.85, j + 0.85, h + 1.4), P(i + 0.85, j + 0.85, h + 3), P(i + 0.15, j + 0.85, h + 3)], '#2f7d32');
          poly([P(i + 0.85, j + 0.85, h + 1.4), P(i + 0.85, j + 0.15, h + 1.4), P(i + 0.85, j + 0.15, h + 3), P(i + 0.85, j + 0.85, h + 3)], '#25632a');
          poly([P(i + 0.15, j + 0.15, h + 3), P(i + 0.85, j + 0.15, h + 3), P(i + 0.85, j + 0.85, h + 3), P(i + 0.15, j + 0.85, h + 3)], '#43a047');
        }
      }
    }
    const clouds = Array.from({ length: 6 }, () => ({ x: Math.random(), y: Math.random() * 0.4, s: 0.6 + Math.random() }));
    function frame() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; land = null; }
      const k = Math.min(W / (G * 20 + 40), H / (G * 10 + 180));
      if (grow < 1 || !land) {
        grow = Math.min(1, grow + 0.02);
        land = land || document.createElement('canvas'); land.width = W; land.height = H;
        const lx = land.getContext('2d'); lx.clearRect(0, 0, W, H); render(lx, k, W, H);
      }
      x.clearRect(0, 0, W, H); x.drawImage(land, 0, 0);
      x.fillStyle = 'rgba(255,255,255,.85)';
      for (const cl of clouds) { cl.x = (cl.x + 0.0004 * cl.s) % 1.2; const cx = cl.x * W * 1.1 - W * 0.1, cy = cl.y * H; for (let n = 0; n < 4; n++) { x.beginPath(); x.ellipse(cx + n * 18 * cl.s * k * 2, cy + (n % 2) * 6, 26 * cl.s * k * 2, 12 * cl.s * k * 2, 0, 0, 7); x.fill(); } }
      requestAnimationFrame(frame);
    }
    document.getElementById('again').onclick = () => { make(); land = null; };
    document.getElementById('turn').onclick = () => { rot = (rot + 1) % 4; grow = 1; land = null; };
    make(); frame();
    if (window.THUMB) setInterval(() => { rot = (rot + 1) % 4; land = null; }, 3000);
  },
}, {
  id: '3d-mandelbulb', c: '3d', lv: 3,
  t: '立体のフラクタル（マンデルバルブ）', y: 'りったいのふらくたるまんでるばるぶ',
  tags: ['フラクタル', 'レイマーチング', 'シェーダー', 'WebGL'],
  d: 'マンデルブロ集合を立体に広げた図形を、画素ごとに視線を進めて描く（レイマーチング）。式の「べき」の数がゆっくり変わり、形が芽吹くように変わり続ける。ドラッグで回せる。',
  p: '「この点から図形まで少なくともこれだけ離れている」という距離の見積もりを使い、その分だけ一気に視線を進める。三角形を1枚も使わない立体の描き方。',
  html: `<canvas id="c"></canvas><p class="pw" id="pw"></p>`,
  css: `body { background: #000; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; cursor: grab; touch-action: none; } .pw { position: fixed; left: 10px; top: 6px; margin: 0; color: #fff9; font: 12px ui-monospace, monospace; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl');
    if (!gl) { document.body.textContent = 'WebGL が使えない環境です'; throw new Error('WebGL が使えません'); }
    const vs = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
    const fs = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 res; uniform float pw; uniform vec2 rot;
      float de(vec3 p, out float trap) {
        vec3 z = p; float dr = 1.0, r = 0.0; trap = 1e9;
        for (int i = 0; i < 8; i++) {
          r = length(z); if (r > 2.0) break;
          float th = acos(clamp(z.z / r, -1.0, 1.0)) * pw, ph = atan(z.y, z.x) * pw;
          dr = pow(r, pw - 1.0) * pw * dr + 1.0;
          z = pow(r, pw) * vec3(sin(th) * cos(ph), sin(th) * sin(ph), cos(th)) + p;
          trap = min(trap, dot(z, z));
        }
        return 0.5 * log(max(r, 1e-6)) * r / dr;
      }
      void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - res) / res.y;
        float a = rot.x, b = rot.y;
        vec3 ro = 2.6 * vec3(sin(a) * cos(b), sin(b), cos(a) * cos(b));
        vec3 f = normalize(-ro), r = normalize(cross(vec3(0.0, 1.0, 0.0), f)), u = cross(f, r);
        vec3 rd = normalize(f * 1.8 + uv.x * r + uv.y * u);
        float t = 0.0, trap = 0.0; int steps = 0; bool hit = false;
        for (int i = 0; i < 96; i++) {
          float d = de(ro + rd * t, trap);
          if (d < 0.0008 * t) { hit = true; break; }
          t += d; steps = i; if (t > 6.0) break;
        }
        vec3 col = mix(vec3(0.02, 0.02, 0.06), vec3(0.12, 0.08, 0.2), uv.y * 0.5 + 0.5);
        if (hit) {
          vec3 p = ro + rd * t; float tt; vec2 e = vec2(0.0008, 0.0);
          vec3 n = normalize(vec3(de(p + e.xyy, tt) - de(p - e.xyy, tt), de(p + e.yxy, tt) - de(p - e.yxy, tt), de(p + e.yyx, tt) - de(p - e.yyx, tt)));
          float ao = 1.0 - float(steps) / 96.0;
          vec3 base = 0.5 + 0.5 * cos(vec3(0.0, 0.6, 1.2) + sqrt(trap) * 3.0 + 2.5);
          vec3 L = normalize(vec3(0.6, 0.8, 0.4));
          float dif = max(dot(n, L), 0.0), rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
          col = base * (0.15 + dif * 0.9) * ao + rim * vec3(0.4, 0.5, 1.0) * 0.5;
        }
        gl_FragColor = vec4(pow(col, vec3(0.85)), 1.0);
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(pg, 'p'); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(pg, 'res'), uPw = gl.getUniformLocation(pg, 'pw'), uRot = gl.getUniformLocation(pg, 'rot');
    let ra = 0.6, rb = 0.3, drag = null;
    c.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY, ra, rb]; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (drag) { ra = drag[2] - (e.clientX - drag[0]) / 200; rb = Math.max(-1.4, Math.min(1.4, drag[3] + (e.clientY - drag[1]) / 200)); } });
    c.addEventListener('pointerup', () => { drag = null; });
    const SCALE = 0.5; // 重い計算なので画素を半分にして描き、CSS で引き伸ばす
    (function draw(t) {
      const w = Math.max(1, Math.round(innerWidth * SCALE)), h = Math.max(1, Math.round(innerHeight * SCALE));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      if (!drag) ra += 0.003;
      const pw = 8 + Math.sin(t / 6000) * 2.5;
      gl.uniform2f(uRes, w, h); gl.uniform1f(uPw, pw); gl.uniform2f(uRot, ra, rb);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      document.getElementById('pw').textContent = `べき ${pw.toFixed(2)}`;
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-ocean-shader', c: '3d', lv: 3,
  t: '夕暮れの海（シェーダー）', y: 'ゆうぐれのうみしぇーだー',
  tags: ['海', '波', 'シェーダー', 'WebGL'],
  d: '向きと長さの違う波を6つ重ねて海面を作り、空の映り込み・太陽のきらめき・波頭の白い泡を画素ごとに計算する。マウスを左右に動かすと見る向きが、上下に動かすと太陽の高さが変わる。',
  p: '水面の明るさは「どれだけ空を映すか」で決まる。真下を見ると水の色、水平線に近いほど空が映る（フレネル反射）。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl');
    if (!gl) { document.body.textContent = 'WebGL が使えない環境です'; throw new Error('WebGL が使えません'); }
    const vs = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
    const fs = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 res, ms; uniform float t;
      float sea(vec2 p) {
        float h = 0.0, a = 0.55, f = 0.32; vec2 d = vec2(1.0, 0.35);
        for (int i = 0; i < 6; i++) {
          float ph = dot(normalize(d), p) * f + t * sqrt(f) * 1.4;
          float w = 1.0 - abs(sin(ph));
          h += a * w * w;
          d = mat2(0.8, -0.6, 0.6, 0.8) * d; a *= 0.5; f *= 1.95;
        }
        return h;
      }
      vec3 sky(vec3 rd, vec3 sun) {
        float s = max(dot(rd, sun), 0.0), y = max(rd.y, 0.0);
        vec3 c = mix(vec3(1.0, 0.55, 0.3), vec3(0.18, 0.28, 0.55), pow(y, 0.45));
        c = mix(c, vec3(1.0, 0.75, 0.5), pow(1.0 - y, 8.0) * 0.6);
        return c + vec3(1.0, 0.8, 0.5) * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.4);
      }
      void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - res) / res.y;
        vec3 sun = normalize(vec3(0.0, mix(0.02, 0.5, ms.y), -1.0));
        float yaw = (ms.x - 0.5) * 1.2;
        vec3 ro = vec3(0.0, 2.2, t * 1.5);
        vec3 rd = normalize(vec3(uv.x, uv.y - 0.25, -1.6));
        rd.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * rd.xz;
        vec3 col;
        if (rd.y >= 0.0) col = sky(rd, sun);
        else {
          float d = (ro.y - 1.2) / -rd.y;
          for (int i = 0; i < 40; i++) { vec3 p = ro + rd * d; float hh = p.y - sea(p.xz); if (abs(hh) < 0.002 * d) break; d += hh * 0.7; }
          vec3 p = ro + rd * d; float e = 0.02 + d * 0.002, h0 = sea(p.xz);
          vec3 n = normalize(vec3(h0 - sea(p.xz + vec2(e, 0.0)), e, h0 - sea(p.xz + vec2(0.0, e))));
          float fre = pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * 0.85 + 0.04;
          vec3 water = vec3(0.02, 0.12, 0.18) + vec3(0.05, 0.25, 0.22) * pow(h0, 2.0) * 0.6;
          col = mix(water, sky(reflect(rd, n), sun), fre);
          col += vec3(1.0, 0.85, 0.6) * pow(max(dot(reflect(rd, n), sun), 0.0), 220.0) * 3.0;
          col = mix(col, vec3(0.9), smoothstep(0.75, 1.0, h0) * 0.35);
          col = mix(col, sky(vec3(rd.x, 0.0, rd.z), sun), 1.0 - exp(-d * 0.012));
        }
        gl_FragColor = vec4(pow(col, vec3(0.9)), 1.0);
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(pg, 'p'); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(pg, 'res'), uT = gl.getUniformLocation(pg, 't'), uMs = gl.getUniformLocation(pg, 'ms');
    let mx = 0.5, my = 0.15;
    addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth; my = 1 - e.clientY / innerHeight; });
    (function draw(t) {
      const w = Math.max(1, Math.round(innerWidth * 0.6)), h = Math.max(1, Math.round(innerHeight * 0.6));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uRes, w, h); gl.uniform1f(uT, t / 1000); gl.uniform2f(uMs, mx, Math.max(0, Math.min(1, my)));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-anaglyph', c: '3d', lv: 2,
  t: '赤青めがねで飛び出す立体', y: 'あかあおめがねでとびだすりったい',
  tags: ['立体視', 'アナグリフ', '赤青めがね', '投影'],
  d: '左目用の絵を赤、右目用の絵を水色で重ねて描く。赤と青のセロハンを貼っためがね（左が赤）で見ると、針金の立体が画面から飛び出して見える。目の幅を変えると飛び出し方が変わる。',
  p: '左右の目の位置を少しずらして2回投影するだけ。赤いレンズの目には赤の線だけ、水色のレンズの目には水色の線だけが見え、脳が奥行きを組み立てる。',
  html: `<canvas id="c"></canvas><div class="ui"><select id="shape" aria-label="形"><option value="torus">ドーナツ</option><option value="cube">箱の格子</option><option value="wave">波の面</option></select><label>目の幅 <input type="range" id="eye" min="0" max="0.5" step="0.01" value="0.22"></label><label><input type="checkbox" id="mono"> めがね無しで見る</label></div>`,
  css: `body { background: #000; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; } .ui { position: fixed; left: 8px; top: 8px; display: flex; flex-wrap: wrap; gap: 10px; color: #ccc; font: 12px system-ui, sans-serif; align-items: center; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    function lines(kind) {
      const L = [];
      if (kind === 'torus') {
        const pt = (u, v) => [(1 + 0.4 * Math.cos(v)) * Math.cos(u), 0.4 * Math.sin(v), (1 + 0.4 * Math.cos(v)) * Math.sin(u)];
        for (let i = 0; i < 24; i++) for (let j = 0; j < 12; j++) { const u = (i / 24) * 6.283, v = (j / 12) * 6.283; L.push([pt(u, v), pt(u + 6.283 / 24, v)], [pt(u, v), pt(u, v + 6.283 / 12)]); }
      } else if (kind === 'cube') {
        for (let a = -1; a <= 1; a += 0.5) for (let b = -1; b <= 1; b += 0.5) { L.push([[a, b, -1], [a, b, 1]], [[a, -1, b], [a, 1, b]], [[-1, a, b], [1, a, b]]); }
      } else {
        const f = (u, v) => [u, Math.sin(u * 3) * Math.cos(v * 3) * 0.3, v];
        for (let i = -10; i <= 10; i++) for (let j = -10; j < 10; j++) { const u = i / 10, v = j / 10; L.push([f(u, v), f(u, v + 0.1)], [f(v, u), f(v + 0.1, u)]); }
      }
      return L;
    }
    (function draw(t) {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      x.globalCompositeOperation = 'source-over'; x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'lighter'; x.lineWidth = 2;
      const L = lines(document.getElementById('shape').value), eye = +document.getElementById('eye').value, mono = document.getElementById('mono').checked;
      const a = t / 2400, b = t / 3700, F = Math.min(W, H) * 0.9, D = 3.2;
      const rot = ([px, py, pz]) => { const x1 = px * Math.cos(a) + pz * Math.sin(a), z1 = -px * Math.sin(a) + pz * Math.cos(a); return [x1, py * Math.cos(b) - z1 * Math.sin(b), py * Math.sin(b) + z1 * Math.cos(b)]; };
      const R = L.map(([p, q]) => [rot(p), rot(q)]);
      for (const [ex, col] of mono ? [[0, '#fff']] : [[-eye / 2, '#ff2020'], [eye / 2, '#00e5ff']]) {
        // 目の位置を横にずらし、同じ点に向かって投影する
        const pr = ([px, py, pz]) => [W / 2 + ((px - ex) * F) / (D - pz) + (ex * F) / D, H / 2 + (py * F) / (D - pz)];
        x.strokeStyle = col; x.beginPath();
        for (const [p, q] of R) { x.moveTo(...pr(p)); x.lineTo(...pr(q)); }
        x.stroke();
      }
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-stereogram', c: '3d', lv: 3,
  t: '隠し絵が浮かぶ立体視（ステレオグラム）', y: 'かくしえがうかぶりったいしすてれおぐらむ',
  tags: ['立体視', 'ステレオグラム', '奥行き', '画素の描画'],
  d: 'ただの点の模様に見える絵に、球や文字が隠れている。画面のずっと奥を見るように目の焦点をぼかすと浮かび上がる。奥行きの図から、左右の目で同じ色に見えるべき点どうしを結んで模様を作っている。',
  p: '近い所ほど「同じ色にする2点」の間隔を狭くする。行ごとに、その制約を満たすよう点の色を決めていくだけで描ける。',
  html: `<canvas id="c"></canvas><div class="ui"><select id="shape" aria-label="隠す形"><option value="text">文字</option><option value="sphere">球</option><option value="rings">波紋</option></select><button id="ans" aria-pressed="false">答えを見る</button><button id="pat">模様を変える</button></div><p class="how">画面から目を30cmほど離し、画面の奥を見るように焦点をぼかす</p>`,
  css: `body { background: #111; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; } .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 6px; } .how { position: fixed; left: 8px; bottom: 6px; margin: 0; color: #fff; font: 12px system-ui, sans-serif; background: #0008; padding: 2px 6px; border-radius: 4px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let showAns = false, palette = [];
    const newPal = () => { const h = Math.random() * 360; palette = Array.from({ length: 8 }, (_, i) => { const col = `hsl(${(h + i * 40) % 360} 75% ${40 + (i % 3) * 15}%)`; const t = document.createElement('canvas').getContext('2d'); t.fillStyle = col; t.fillRect(0, 0, 1, 1); const d = t.getImageData(0, 0, 1, 1).data; return (255 << 24) | (d[2] << 16) | (d[1] << 8) | d[0]; }); };
    function depth(W, H) {
      const o = document.createElement('canvas'); o.width = W; o.height = H; const g = o.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const kind = document.getElementById('shape').value, m = Math.min(W, H);
      if (kind === 'text') { g.filter = `blur(${m / 120}px)`; g.fillStyle = '#fff'; g.font = `900 ${m * 0.38}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('出来る', W / 2, H / 2); }
      if (kind === 'sphere') { const r = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, m * 0.35); for (let k = 0; k <= 10; k++) r.addColorStop(k / 10, `rgb(${255 * Math.sqrt(1 - (k / 10) ** 2) | 0},0,0)`); r.addColorStop(1, '#000'); g.fillStyle = r; g.beginPath(); g.arc(W / 2, H / 2, m * 0.35, 0, 7); g.fill(); }
      if (kind === 'rings') { const d = g.createImageData(W, H); for (let y = 0; y < H; y++) for (let x0 = 0; x0 < W; x0++) { const r = Math.hypot(x0 - W / 2, y - H / 2); d.data[(y * W + x0) * 4] = r < m * 0.45 ? 128 + 127 * Math.cos(r / (m * 0.025)) * (1 - r / (m * 0.45)) : 0; d.data[(y * W + x0) * 4 + 3] = 255; } g.putImageData(d, 0, 0); }
      const px = g.getImageData(0, 0, W, H).data, z = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) z[i] = px[i * 4] / 255;
      return z;
    }
    function render() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      c.width = W; c.height = H;
      const z = depth(W, H), img = x.createImageData(W, H), out = new Uint32Array(img.data.buffer);
      if (showAns) { for (let i = 0; i < W * H; i++) { const v = (z[i] * 255) | 0; out[i] = (255 << 24) | (v << 16) | (v << 8) | v; } x.putImageData(img, 0, 0); return; }
      const E = Math.max(40, Math.min(120, Math.round(W / 7))), mu = 1 / 3, same = new Int32Array(W);
      for (let y = 0; y < H; y++) {
        for (let i = 0; i < W; i++) same[i] = i;
        for (let i = 0; i < W; i++) {
          const zz = z[y * W + i], s = Math.round(((1 - mu * zz) * E) / (2 - mu * zz));
          let left = i - (s >> 1), right = left + s;
          if (left < 0 || right >= W) continue;
          let l = same[left];
          while (l !== left && l !== right) { if (l < right) { left = l; l = same[left]; } else { same[left] = right; left = right; l = same[left]; right = l; } }
          same[left] = right;
        }
        for (let i = W - 1; i >= 0; i--) out[y * W + i] = same[i] === i ? palette[(Math.random() * 8) | 0] : out[y * W + same[i]];
      }
      x.putImageData(img, 0, 0);
    }
    newPal(); render();
    document.getElementById('shape').onchange = render;
    document.getElementById('pat').onclick = () => { newPal(); render(); };
    document.getElementById('ans').onclick = (e) => { showAns = !showAns; e.target.setAttribute('aria-pressed', showAns); e.target.textContent = showAns ? '模様に戻す' : '答えを見る'; render(); };
    let tm = 0; addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(render, 200); });
    if (window.THUMB) setInterval(() => document.getElementById('ans').click(), 2500);
  },
}, {
  id: '3d-perspective-crawl', c: '3d', lv: 1,
  t: '奥へ流れていく字幕', y: 'おくへながれていくじまく',
  tags: ['CSS 3D', 'perspective', '字幕', '演出'],
  d: '文章の板を CSS で後ろへ倒し、下から奥へ向かって流す。手前の字は大きく、奥へ行くほど小さく細くなって星空へ消えていく。速さを変えたり、文を自分で書き換えたりできる。',
  p: '奥行きの見た目は perspective と rotateX の2つだけ。動かすのは translateY の1か所で、奥への吸い込まれ方は遠近法が勝手に作る。',
  html: `
    <div class="stars" id="stars"></div>
    <div class="stage"><div class="crawl" id="crawl"></div></div>
    <div class="ui"><button id="pause">止める</button><label>速さ <input type="range" id="sp" min="0.2" max="3" step="0.1" value="1"></label>
    <details><summary>文を書き換える</summary><textarea id="src" rows="8" cols="34"></textarea><button id="apply">流し直す</button></details></div>`,
  css: `
    body { background: #000; overflow: hidden; height: 100vh; margin: 0; }
    .stars { position: fixed; left: 0; top: 0; width: 2px; height: 2px; border-radius: 50%; }
    .stage { position: fixed; inset: 0; perspective: 320px; perspective-origin: 50% 20%; overflow: hidden; mask-image: linear-gradient(transparent 5%, #000 45%); }
    .crawl { position: absolute; left: 50%; top: 100%; width: min(92vw, 560px); translate: -50% 0; transform-origin: 50% 0; transform: rotateX(28deg) translateY(var(--y, 0px)); color: #ffd54a; font: 700 clamp(18px, 4.6vw, 30px)/1.55 "Hiragino Sans", "Yu Gothic", sans-serif; text-align: justify; }
    .crawl h1 { text-align: center; font-size: 1.8em; margin: 0 0 .3em; letter-spacing: .2em; } .crawl .ep { text-align: center; margin: 0; letter-spacing: .3em; }
    .crawl p { margin: 0 0 1em; }
    .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 8px; align-items: flex-start; color: #ccc; font: 12px system-ui, sans-serif; flex-wrap: wrap; z-index: 1; }
    details { background: #000c; padding: 4px; border-radius: 6px; }`,
  js() {
    const stars = document.getElementById('stars');
    stars.style.boxShadow = Array.from({ length: 220 }, () => `${(Math.random() * innerWidth) | 0}px ${(Math.random() * innerHeight) | 0}px 0 ${Math.random() < 0.1 ? 1 : 0}px rgba(255,255,255,${(0.3 + Math.random() * 0.7).toFixed(2)})`).join(',');
    const src = document.getElementById('src'), crawl = document.getElementById('crawl');
    src.value = '第一章\n小さなナイフ\nブラウザの国には、たくさんの道具があふれていた。重たい箱に入った道具を、誰もが背負って旅をしていた。\nある日、ひとりの旅人が、何も背負わずに現れた。持っているのは HTML と CSS と JavaScript という、小さなナイフが一本だけ。\n人々は笑った。そんな物で何ができるのかと。\n旅人は黙って、光を描き、音を鳴らし、立体を回してみせた。\nこれは、小さなナイフ一本で、どこまで行けるかを確かめる旅の記録である。';
    function setText() {
      const [ep, title, ...rest] = src.value.split('\n');
      crawl.innerHTML = '<p class="ep"></p><h1></h1>' + rest.map(() => '<p></p>').join('');
      crawl.querySelector('.ep').textContent = ep || ''; crawl.querySelector('h1').textContent = title || '';
      [...crawl.querySelectorAll('p:not(.ep)')].forEach((p, i) => { p.textContent = rest[i]; });
      y = 0;
    }
    let y = 0, run = true, last = performance.now();
    (function loop(now) {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (run) y -= dt * 38 * +document.getElementById('sp').value;
      if (-y > crawl.offsetHeight + innerHeight * 2.5) y = 0;
      crawl.style.setProperty('--y', y + 'px');
      requestAnimationFrame(loop);
    })(last);
    document.getElementById('pause').onclick = (e) => { run = !run; e.target.textContent = run ? '止める' : '流す'; };
    document.getElementById('apply').onclick = setText;
    setText();
    if (window.THUMB) y = -innerHeight * 0.6;
  },
}, {
  id: '3d-phong-lighting', c: '3d', lv: 3,
  t: '光の当たり方を調べる（WebGL）', y: 'ひかりのあたりかたをしらべるうぇぶじーえる',
  tags: ['WebGL', '照明', 'フォン', 'シェーダー'],
  d: '光の当たり方を「まわりの光」「面の明るさ」「つやの照り返し」の3つに分け、それぞれの強さをつまみで変える。光の玉はマウスに付いてくる。頂点ごとに計算する方法と画素ごとに計算する方法を切り替えると、照り返しの滑らかさの違いが分かる。',
  p: '頂点ごとの計算（グーロー）は速いが、頂点の間は色を混ぜるだけなので照り返しがかくつく。画素ごと（フォン）は1画素ずつ同じ式を計算する。',
  html: `<canvas id="c"></canvas><div class="light" id="light"></div>
    <div class="ui"><select id="mode" aria-label="計算の仕方"><option value="1">画素ごと（フォン）</option><option value="0">頂点ごと（グーロー）</option></select>
    <label>まわりの光 <input type="range" id="ka" min="0" max="1" step="0.01" value="0.12"></label><label>面の明るさ <input type="range" id="kd" min="0" max="1.5" step="0.01" value="0.85"></label>
    <label>照り返し <input type="range" id="ks" min="0" max="1.5" step="0.01" value="0.8"></label><label>つや <input type="range" id="sh" min="2" max="200" step="1" value="40"></label></div>`,
  css: `body { background: #0b0d12; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; } .light { position: fixed; width: 14px; height: 14px; margin: -7px; border-radius: 50%; background: #fff; box-shadow: 0 0 20px 6px #ffe9a8; pointer-events: none; }
    .ui { position: fixed; left: 8px; top: 8px; display: flex; flex-wrap: wrap; gap: 8px 12px; color: #ccd; font: 12px system-ui, sans-serif; max-width: 96vw; } .ui label { display: flex; gap: 4px; align-items: center; } .ui input { width: 80px; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl');
    if (!gl) { document.body.textContent = 'WebGL が使えない環境です'; throw new Error('WebGL が使えません'); }
    const LIGHT = `
      uniform vec3 lp, base; uniform float ka, kd, ks, sh;
      vec3 shade(vec3 P, vec3 N) {
        vec3 L = normalize(lp - P), V = normalize(-P), R = reflect(-L, N);
        float d = max(dot(N, L), 0.0), s = d > 0.0 ? pow(max(dot(R, V), 0.0), sh) : 0.0;
        return base * (ka + kd * d) + vec3(1.0) * ks * s;
      }`;
    // 頂点ごと: 頂点シェーダーで色を決め、間は混ぜるだけ
    const gouraud = [`attribute vec3 p, n; uniform mat4 pm, mv; varying vec3 col; ${LIGHT}
      void main() { vec4 q = mv * vec4(p, 1.0); col = shade(q.xyz, normalize((mv * vec4(n, 0.0)).xyz)); gl_Position = pm * q; }`,
      'precision mediump float; varying vec3 col; void main() { gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0); }'];
    // 画素ごと: 位置と向きだけ渡し、画素ごとに同じ式を計算する
    const phong = [`attribute vec3 p, n; uniform mat4 pm, mv; varying vec3 vp, vn;
      void main() { vec4 q = mv * vec4(p, 1.0); vp = q.xyz; vn = (mv * vec4(n, 0.0)).xyz; gl_Position = pm * q; }`,
      `precision mediump float; varying vec3 vp, vn; ${LIGHT} void main() { gl_FragColor = vec4(pow(shade(vp, normalize(vn)), vec3(1.0 / 2.2)), 1.0); }`];
    function make([vs, fs]) {
      const p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); gl.attachShader(p, s); }
      gl.linkProgram(p); return p;
    }
    const progs = [make(gouraud), make(phong)];
    const SU = 48, SV = 24, data = [], idx = [];
    for (let i = 0; i <= SU; i++) for (let j = 0; j <= SV; j++) {
      const u = (i / SU) * Math.PI * 2, v = (j / SV) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
      data.push((1 + 0.42 * cv) * cu, 0.42 * sv, (1 + 0.42 * cv) * su, cv * cu, sv, cv * su);
    }
    for (let i = 0; i < SU; i++) for (let j = 0; j < SV; j++) { const a = i * (SV + 1) + j, b = a + SV + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[i * 4 + j] += a[k * 4 + j] * b[i * 4 + k]; return o; };
    const persp = (f, asp, n, fr) => { const t = 1 / Math.tan(f / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, (2 * fr * n) / (n - fr), 0]; };
    const rotX = (a) => [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1];
    const rotY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
    let lx = innerWidth * 0.7, ly = innerHeight * 0.3;
    addEventListener('pointermove', (e) => { lx = e.clientX; ly = e.clientY; });
    const $ = (id) => document.getElementById(id);
    (function draw(t) {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; gl.viewport(0, 0, W, H); }
      if (window.THUMB) { lx = W / 2 + Math.cos(t / 700) * W * 0.35; ly = H / 2 + Math.sin(t / 900) * H * 0.3; }
      $('light').style.translate = `${lx}px ${ly}px`;
      const pg = progs[+$('mode').value]; gl.useProgram(pg);
      const U = (n) => gl.getUniformLocation(pg, n);
      [['p', 0], ['n', 12]].forEach(([name, off]) => { const l = gl.getAttribLocation(pg, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 24, off); });
      gl.clearColor(0.04, 0.05, 0.07, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const asp = W / H, f = 1 / Math.tan(0.45);
      gl.uniformMatrix4fv(U('pm'), false, new Float32Array(persp(0.9, asp, 0.1, 30)));
      const mv = mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -4, 1], mul(rotX(0.6 + Math.sin(t / 3000) * 0.3), rotY(t / 2500)));
      gl.uniformMatrix4fv(U('mv'), false, new Float32Array(mv));
      // マウスの位置を、目から 1.6 の距離（ドーナツより手前）の面にある光の位置へ直す
      gl.uniform3f(U('lp'), (((lx / W) * 2 - 1) * asp * 1.6) / f, ((1 - (ly / H) * 2) * 1.6) / f, -1.6);
      gl.uniform3f(U('base'), 0.85, 0.32, 0.18);
      for (const k of ['ka', 'kd', 'ks', 'sh']) gl.uniform1f(U(k), +$(k).value);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-globe', c: '3d', lv: 3,
  t: 'いまの昼と夜が分かる地球儀', y: 'いまのひるとよるがわかるちきゅうぎ',
  tags: ['地球儀', '正射図法', '大圏航路', '日時'],
  d: '球を画素ごとに描き、今の日付と時刻から太陽の真下の地点を計算して、昼の側を明るく、夜の側を暗く塗る。東京から世界の都市へ向かう飛行機の道（大圏航路）を弧で結び、光の点が飛ぶ。ドラッグで回せる。陸地の形は描いていない。',
  p: '画面の1点を球の上の緯度・経度へ逆算し、太陽の方向との内積で昼か夜かを決める。弧は2地点のあいだの球面上の補間（slerp）。',
  html: `<canvas id="c"></canvas><p class="now" id="now"></p>`,
  css: `body { background: radial-gradient(#101a33, #03050c); overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; cursor: grab; touch-action: none; } .now { position: fixed; left: 10px; top: 6px; margin: 0; color: #cde; font: 12px ui-monospace, monospace; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const CITIES = [['東京', 35.68, 139.69], ['ロンドン', 51.51, -0.13], ['ニューヨーク', 40.71, -74.01], ['シドニー', -33.87, 151.21], ['カイロ', 30.04, 31.24], ['サンパウロ', -23.55, -46.63], ['ホノルル', 21.31, -157.86], ['ケープタウン', -33.92, 18.42], ['モスクワ', 55.76, 37.62], ['シンガポール', 1.35, 103.82]];
    const rad = Math.PI / 180, vec = (lat, lon) => [Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad), Math.cos(lat * rad) * Math.cos(lon * rad)];
    let lon0 = 139, tilt = 20, drag = null, vel = -0.04;
    c.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY, lon0, tilt]; vel = 0; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (drag) { const nl = drag[2] - (e.clientX - drag[0]) / 3; vel = nl - lon0; lon0 = nl; tilt = Math.max(-80, Math.min(80, drag[3] + (e.clientY - drag[1]) / 3)); } });
    c.addEventListener('pointerup', () => { drag = null; });
    function sunVec(d) {
      const start = Date.UTC(d.getUTCFullYear(), 0, 0), doy = (d - start) / 864e5;
      const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
      const hours = d.getUTCHours() + d.getUTCMinutes() / 60;
      return vec(decl, (12 - hours) * 15);
    }
    // 球の画素は小さめの画用紙に計算してから拡大して貼る（1コマの計算量を抑える）
    const off = document.createElement('canvas'), ox = off.getContext('2d'), img = { w: 0, data: null };
    (function draw() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      if (!drag) { lon0 += vel; vel = vel * 0.97 - 0.04 * 0.03; }
      const R = Math.max(2, Math.floor(Math.min(W, H) * 0.4)), cx = W / 2, cy = H / 2, now = new Date(), S = sunVec(now);
      // 見ている向き: 経度 lon0 を手前に、tilt だけ傾ける
      const cl = Math.cos(lon0 * rad), sl = Math.sin(lon0 * rad), ct = Math.cos(tilt * rad), st = Math.sin(tilt * rad);
      const view = ([a, b, z]) => { const x1 = a * cl - z * sl, z1 = a * sl + z * cl; return [x1, b * ct - z1 * st, b * st + z1 * ct]; };
      const r0 = Math.min(R, 170), D = 2 * r0;
      if (img.w !== D) { img.w = D; off.width = off.height = D; img.data = ox.createImageData(D, D); }
      const px = new Uint32Array(img.data.data.buffer);
      for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
        const u = (i - r0) / r0, v = -(j - r0) / r0, rr = u * u + v * v;
        if (rr > 1) { px[j * D + i] = 0; continue; }
        const w = Math.sqrt(1 - rr), b0 = v * ct + w * st, z1 = -v * st + w * ct, a = u * cl + z1 * sl, z = -u * sl + z1 * cl;
        const day = a * S[0] + b0 * S[1] + z * S[2], k = Math.max(0, Math.min(1, day * 6 + 0.5)), limb = 0.55 + 0.45 * w;
        const r = (8 + 30 * k) * limb, g = (20 + 100 * k) * limb, bl = (55 + 150 * k) * limb;
        px[j * D + i] = (255 << 24) | ((bl | 0) << 16) | ((g | 0) << 8) | (r | 0);
      }
      x.clearRect(0, 0, W, H);
      ox.putImageData(img.data, 0, 0);
      x.drawImage(off, cx - R, cy - R, 2 * R, 2 * R);
      const pr = (p) => { const q = view(p); return [cx + q[0] * R, cy - q[1] * R, q[2]]; };
      // 経緯線
      x.lineWidth = 1;
      const path = (pts) => { x.beginPath(); let on = false; for (const p of pts) { const [sx, sy, z] = pr(p); if (z > 0) { x[on ? 'lineTo' : 'moveTo'](sx, sy); on = true; } else on = false; } x.stroke(); };
      x.strokeStyle = 'rgba(200,230,255,.25)';
      for (let la = -75; la <= 75; la += 15) path(Array.from({ length: 73 }, (_, k) => vec(la, k * 5)));
      for (let lo = 0; lo < 360; lo += 15) path(Array.from({ length: 37 }, (_, k) => vec(-90 + k * 5, lo)));
      // 東京から各都市への弧と、飛ぶ光
      const tk = vec(CITIES[0][1], CITIES[0][2]), tm = performance.now() / 4000;
      CITIES.slice(1).forEach(([, la, lo], n) => {
        const b = vec(la, lo), om = Math.acos(Math.max(-1, Math.min(1, tk[0] * b[0] + tk[1] * b[1] + tk[2] * b[2])));
        const at = (f) => { const s1 = Math.sin((1 - f) * om) / Math.sin(om), s2 = Math.sin(f * om) / Math.sin(om), h = 1 + 0.12 * Math.sin(Math.PI * f) * (om / 2); return [(tk[0] * s1 + b[0] * s2) * h, (tk[1] * s1 + b[1] * s2) * h, (tk[2] * s1 + b[2] * s2) * h]; };
        x.strokeStyle = `hsla(${n * 40}, 90%, 70%, .7)`; x.lineWidth = 1.5;
        path(Array.from({ length: 50 }, (_, k) => at(k / 49)));
        const [sx, sy, z] = pr(at((tm + n * 0.13) % 1));
        if (z > 0) { x.fillStyle = '#fff'; x.beginPath(); x.arc(sx, sy, 2.5, 0, 7); x.fill(); }
      });
      x.font = '12px system-ui, sans-serif';
      for (const [name, la, lo] of CITIES) { const [sx, sy, z] = pr(vec(la, lo)); if (z <= 0) continue; x.fillStyle = '#ffd166'; x.beginPath(); x.arc(sx, sy, 3, 0, 7); x.fill(); x.fillStyle = '#fff'; x.fillText(name, sx + 5, sy - 4); }
      document.getElementById('now').textContent = `${now.toLocaleString('ja-JP')} の昼と夜`;
      requestAnimationFrame(draw);
    })();
  },
}, {
  id: '3d-boids-3d', c: '3d', lv: 3,
  t: '立体の空間を泳ぐ群れ', y: 'りったいのくうかんをおよぐむれ',
  tags: ['群れ', 'ボイド', 'シミュレーション', '投影'],
  d: '「近すぎたら離れる」「まわりと向きをそろえる」「群れの中心へ寄る」の3つの決まりだけで、300匹の魚が立体の箱の中で群れを作って泳ぐ。カメラがゆっくり回り、クリックすると群れが驚いて散る。',
  p: '1匹ずつは近くの仲間しか見ていない。それでも全体としては大きな群れの動きが生まれる。',
  html: `<canvas id="c"></canvas><p class="hint">クリックで群れを驚かせる</p>`,
  css: `body { background: linear-gradient(#0b2f4a, #04121f); overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; } .hint { position: fixed; left: 10px; top: 6px; margin: 0; color: #9cd; font: 12px system-ui, sans-serif; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), N = 300;
    const B = Array.from({ length: N }, () => ({ p: [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1], v: [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5].map((q) => q * 0.02) }));
    let scare = 0;
    c.addEventListener('click', () => { scare = 40; });
    (function draw(t) {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      for (const b of B) {
        const sep = [0, 0, 0], ali = [0, 0, 0], coh = [0, 0, 0];
        let n = 0;
        for (const o of B) {
          if (o === b) continue;
          const d0 = o.p[0] - b.p[0], d1 = o.p[1] - b.p[1], d2 = o.p[2] - b.p[2], dd = d0 * d0 + d1 * d1 + d2 * d2;
          if (dd > 0.09) continue;
          n++;
          for (let k = 0; k < 3; k++) { ali[k] += o.v[k]; coh[k] += o.p[k]; }
          if (dd < 0.012) { sep[0] -= d0 / dd; sep[1] -= d1 / dd; sep[2] -= d2 / dd; }
        }
        for (let k = 0; k < 3; k++) {
          if (n) b.v[k] += (ali[k] / n - b.v[k]) * 0.05 + (coh[k] / n - b.p[k]) * 0.002;
          b.v[k] += sep[k] * 0.00004;
          if (Math.abs(b.p[k]) > 0.85) b.v[k] -= Math.sign(b.p[k]) * 0.0015;
          if (scare) b.v[k] += b.p[k] * 0.004;
        }
        const sp = Math.hypot(...b.v), mx = scare ? 0.05 : 0.022, mn = 0.008;
        if (sp > mx || sp < mn) { const f = Math.max(mn, Math.min(mx, sp)) / (sp || 1); b.v = b.v.map((q) => q * f); }
        for (let k = 0; k < 3; k++) b.p[k] += b.v[k];
      }
      if (scare) scare--;
      x.clearRect(0, 0, W, H);
      const a = t / 9000, ca = Math.cos(a), sa = Math.sin(a), F = Math.min(W, H) * 0.9, D = 3.4;
      const pr = ([px, py, pz]) => { const x1 = px * ca + pz * sa, z1 = -px * sa + pz * ca; const y1 = py * 0.94 - z1 * 0.34, z2 = py * 0.34 + z1 * 0.94; const s = F / (D - z2); return [W / 2 + x1 * s, H / 2 + y1 * s, z2, s]; };
      x.strokeStyle = 'rgba(150,210,255,.18)'; x.lineWidth = 1; x.beginPath();
      const cs = [-1, 1];
      for (const p of cs) for (const q of cs) { for (const [u, v] of [[[-1, p, q], [1, p, q]], [[p, -1, q], [p, 1, q]], [[p, q, -1], [p, q, 1]]]) { x.moveTo(...pr(u).slice(0, 2)); x.lineTo(...pr(v).slice(0, 2)); } }
      x.stroke();
      const list = B.map((b) => [pr(b.p), pr(b.p.map((q, k) => q + b.v[k] * 3))]).sort((m, n2) => m[0][2] - n2[0][2]);
      for (const [p, q] of list) {
        const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, w = p[3] * 0.012, len = p[3] * 0.035, nx = -dy / l, ny = dx / l;
        const depth = (p[2] + 1.2) / 2.4;
        x.fillStyle = `hsl(${190 + depth * 30} 80% ${35 + depth * 45}%)`;
        x.beginPath(); x.moveTo(p[0] + (dx / l) * len, p[1] + (dy / l) * len); x.lineTo(p[0] + nx * w, p[1] + ny * w); x.lineTo(p[0] - nx * w, p[1] - ny * w); x.fill();
      }
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-lorenz', c: '3d', lv: 2,
  t: 'ローレンツ・アトラクター（バタフライ効果）', y: 'ろーれんつあとらくたーばたふらいこうか',
  tags: ['カオス', '微分方程式', '軌跡', 'バタフライ効果'],
  d: '気象の簡単なモデルから生まれた3つの式に従って、ほんの少しだけ出発点の違う7つの点を動かす。最初は1本の線に重なっているのに、やがてまったく別の道を進む。ドラッグで回し、3つの数を変えると形が変わる。',
  p: '式は dx = σ(y − x)、dy = x(ρ − z) − y、dz = xy − βz の3行。ルンゲ＝クッタ法で少しずつ時間を進めている。',
  html: `<canvas id="c"></canvas><div class="ui"><label>σ <input type="range" id="s" min="1" max="20" step="0.1" value="10"></label><label>ρ <input type="range" id="r" min="1" max="50" step="0.1" value="28"></label><label>β <input type="range" id="b" min="0.5" max="5" step="0.01" value="2.67"></label><button id="reset">最初から</button></div>`,
  css: `body { background: #06070b; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; cursor: grab; touch-action: none; } .ui { position: fixed; left: 8px; top: 8px; display: flex; flex-wrap: wrap; gap: 10px; color: #ccd; font: 13px serif; align-items: center; } .ui input { width: 90px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), K = 7, MAX = 1600;
    let P, trails, ay = 0.5, ax = 0.2, drag = null;
    const reset = () => { P = Array.from({ length: K }, (_, i) => [1 + i * 1e-5, 1, 1]); trails = P.map(() => []); };
    reset();
    document.getElementById('reset').onclick = reset;
    c.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY, ay, ax]; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (drag) { ay = drag[2] + (e.clientX - drag[0]) / 150; ax = drag[3] + (e.clientY - drag[1]) / 150; } });
    c.addEventListener('pointerup', () => { drag = null; });
    const f = ([px, py, pz], s, r, b) => [s * (py - px), px * (r - pz) - py, px * py - b * pz];
    function rk4(p, h, s, r, b) {
      const k1 = f(p, s, r, b), k2 = f(p.map((v, i) => v + (h / 2) * k1[i]), s, r, b), k3 = f(p.map((v, i) => v + (h / 2) * k2[i]), s, r, b), k4 = f(p.map((v, i) => v + h * k3[i]), s, r, b);
      return p.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    }
    (function draw() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const s = +document.getElementById('s').value, r = +document.getElementById('r').value, b = +document.getElementById('b').value;
      for (let k = 0; k < K; k++) { for (let n = 0; n < 4; n++) P[k] = rk4(P[k], 0.004, s, r, b); trails[k].push(P[k]); if (trails[k].length > MAX) trails[k].shift(); }
      if (!drag) ay += 0.003;
      const ca = Math.cos(ay), sa = Math.sin(ay), cb = Math.cos(ax), sb = Math.sin(ax), F = Math.min(W, H) / 60, zc = r - 1;
      const pr = ([px, py, pz]) => { const z0 = pz - zc, x1 = px * ca + py * sa, y0 = -px * sa + py * ca; const y1 = -z0 * cb + y0 * sb, d = 1 / (1 + (y0 * cb + z0 * sb) / 140); return [W / 2 + x1 * F * d, H / 2 + y1 * F * d]; };
      x.fillStyle = 'rgba(6,7,11,.35)'; x.fillRect(0, 0, W, H);
      x.lineWidth = 1.2; x.globalCompositeOperation = 'lighter';
      trails.forEach((tr, k) => {
        x.strokeStyle = `hsla(${k * 50}, 90%, 60%, .55)`; x.beginPath();
        tr.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](...pr(p))); x.stroke();
        const [hx, hy] = pr(P[k]); x.fillStyle = `hsl(${k * 50} 90% 75%)`; x.beginPath(); x.arc(hx, hy, 3, 0, 7); x.fill();
      });
      x.globalCompositeOperation = 'source-over';
      requestAnimationFrame(draw);
    })();
  },
}, {
  id: '3d-css-polyhedra', c: '3d', lv: 3,
  t: 'CSSの板で組む正多面体', y: 'しーえすえすのいたでくむせいためんたい',
  tags: ['CSS 3D', '多面体', 'matrix3d', 'clip-path'],
  d: '正四面体・立方体・正八面体・正十二面体・正二十面体の5つを、div の板だけで組み立てる。頂点の座標から面を見つけ、面ごとの向きを計算して CSS の matrix3d に渡す。面の形は clip-path で三角や五角に切り抜く。',
  p: '面を見つけるのは総当たり。3つの頂点で決まる平面に対して、ほかの頂点が全部片側にあればそれが面になる。',
  html: `<div class="ui" role="group" aria-label="形"></div><div class="scene"><div class="solid" id="solid"></div></div>`,
  css: `
    body { background: radial-gradient(#26314d, #0b0e18); overflow: hidden; height: 100vh; display: grid; place-items: center; }
    .scene { perspective: 900px; width: 1px; height: 1px; }
    .solid { transform-style: preserve-3d; animation: spin 14s linear infinite; }
    @keyframes spin { from { transform: rotateX(-20deg) rotateY(0); } to { transform: rotateX(-20deg) rotateY(360deg); } }
    .face { position: absolute; left: 0; top: 0; background: linear-gradient(135deg, hsl(var(--h) 85% 70% / .85), hsl(var(--h) 80% 45% / .85)); transition: opacity .3s; }
    .ui { position: fixed; left: 8px; top: 8px; display: flex; flex-wrap: wrap; gap: 4px; } .ui [aria-pressed=true] { background: #ffd166; color: #222; }`,
  js() {
    const phi = (1 + Math.sqrt(5)) / 2, ip = 1 / phi;
    const pm = (arr) => arr.flatMap((v) => { let out = [[]]; for (const c0 of v) out = out.flatMap((o) => (c0 === 0 ? [[...o, 0]] : [[...o, c0], [...o, -c0]])); return out; });
    const SOLIDS = {
      正四面体: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
      立方体: pm([[1, 1, 1]]),
      正八面体: pm([[1, 0, 0], [0, 1, 0], [0, 0, 1]]),
      正十二面体: pm([[1, 1, 1], [0, ip, phi], [ip, phi, 0], [phi, 0, ip]]),
      正二十面体: pm([[0, 1, phi], [1, phi, 0], [phi, 0, 1]]),
    };
    const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const unit = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
    // 面を総当たりで探す: 3点が作る平面の片側にほかの全部の点があれば、その平面は面
    function faces(V) {
      const seen = new Set(), out = [];
      for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) for (let k = j + 1; k < V.length; k++) {
        let n = cross(sub(V[j], V[i]), sub(V[k], V[i]));
        if (Math.hypot(...n) < 1e-9) continue;
        n = unit(n);
        const d = dot(n, V[i]), side = V.map((v) => dot(n, v) - d);
        if (!(side.every((s) => s < 1e-6) || side.every((s) => s > -1e-6))) continue;
        const on = V.map((_, m) => m).filter((m) => Math.abs(side[m]) < 1e-6), key = on.join(',');
        if (!seen.has(key)) { seen.add(key); out.push(on); }
      }
      return out;
    }
    const solid = document.getElementById('solid'), ui = document.querySelector('.ui');
    function show(name) {
      const raw = SOLIDS[name], R = Math.max(...raw.map((v) => Math.hypot(...v))), K = Math.min(innerWidth, innerHeight) * 0.3;
      const V = raw.map((v) => v.map((q) => q / R));
      solid.innerHTML = '';
      faces(V).forEach((f, n) => {
        const ctr = [0, 1, 2].map((a) => f.reduce((s, m) => s + V[m][a], 0) / f.length);
        let nrm = unit(cross(sub(V[f[1]], V[f[0]]), sub(V[f[2]], V[f[0]])));
        if (dot(nrm, ctr) < 0) nrm = nrm.map((v) => -v);
        const u = unit(sub(V[f[0]], ctr)), w = cross(nrm, u);
        const pts = f.map((m) => { const d = sub(V[m], ctr); return [dot(d, u), dot(d, w)]; }).sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
        const r = Math.max(...pts.map((p) => Math.hypot(...p))), size = 2 * r * K;
        const el = document.createElement('div'); el.className = 'face';
        el.style.cssText = `width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;--h:${(n * 360) / 12 + 200};clip-path:polygon(${pts.map(([a, b]) => `${(50 + (a / r) * 50).toFixed(2)}% ${(50 + (b / r) * 50).toFixed(2)}%`).join(',')})`;
        // 板の x 方向を u、y 方向を w、z 方向を法線に向け、面の中心まで動かす行列
        el.style.transform = `matrix3d(${[...u, 0, ...w, 0, ...nrm, 0, ...ctr.map((v) => v * K), 1].map((v) => +v.toFixed(5)).join(',')})`;
        solid.append(el);
      });
      ui.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.textContent === name));
    }
    ui.innerHTML = Object.keys(SOLIDS).map((k) => `<button aria-pressed="false">${k}</button>`).join('');
    ui.addEventListener('click', (e) => { if (e.target.matches('button')) show(e.target.textContent); });
    show('正十二面体');
    if (window.THUMB) { const names = Object.keys(SOLIDS); let i = 3; setInterval(() => show(names[++i % 5]), 2000); }
  },
}, {
  id: '3d-noise-blob', c: '3d', lv: 3,
  t: '脈打つ球（頂点シェーダー）', y: 'みゃくうつきゅうちょうてんしぇーだー',
  tags: ['WebGL2', '頂点シェーダー', '変形', '虹色'],
  d: '正二十面体を4回細かく分けて球を作り、頂点シェーダーで1つ1つの頂点を波のように押し出す。面の向きは画素ごとに求め、見る角度で虹色に変わる。クリックするとぶるんと大きく揺れる。',
  p: '形を変えるのは GPU 側の数行だけで、JS は毎フレーム時刻と揺れの大きさを送るだけ。面の向きは dFdx・dFdy（隣の画素との位置の差）で求めている。',
  html: `<canvas id="c"></canvas><p class="hint">クリックで揺らす</p>`,
  css: `body { background: radial-gradient(#1d1430, #07050c); overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; cursor: pointer; } .hint { position: fixed; left: 10px; top: 6px; margin: 0; color: #b9a8e0; font: 12px system-ui, sans-serif; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2');
    if (!gl) { document.body.textContent = 'WebGL2 が使えない環境です'; throw new Error('WebGL2 が使えません'); }
    const vs = `#version 300 es
      in vec3 p; uniform mat4 pm, mv; uniform float t, amp; out vec3 vp;
      float bump(vec3 q) { return sin(q.x * 3.1 + t * 1.3) * sin(q.y * 2.7 + t * 1.7) * sin(q.z * 3.3 + t) + 0.5 * sin(q.x * 6.0 - t * 2.1) * sin(q.z * 5.0 + t * 1.4); }
      void main() { vec3 q = p * (1.0 + amp * bump(p)); vec4 e = mv * vec4(q, 1.0); vp = e.xyz; gl_Position = pm * e; }`;
    const fs = `#version 300 es
      precision highp float; in vec3 vp; out vec4 o;
      void main() {
        vec3 n = normalize(cross(dFdx(vp), dFdy(vp))), v = normalize(-vp), L = normalize(vec3(0.5, 0.8, 0.6));
        float d = max(dot(n, L), 0.0), f = 1.0 - max(dot(n, v), 0.0), s = pow(max(dot(reflect(-L, n), v), 0.0), 40.0);
        vec3 iri = 0.5 + 0.5 * cos(6.2831 * (f * 1.4 + vec3(0.0, 0.33, 0.67)));
        o = vec4(iri * (0.25 + d * 0.8) + s * 0.8 + f * f * vec3(0.4, 0.2, 0.8), 1.0);
      }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    // 正二十面体を細かく分けて球にする
    const t0 = (1 + Math.sqrt(5)) / 2;
    const V0 = [[-1, t0, 0], [1, t0, 0], [-1, -t0, 0], [1, -t0, 0], [0, -1, t0], [0, 1, t0], [0, -1, -t0], [0, 1, -t0], [t0, 0, -1], [t0, 0, 1], [-t0, 0, -1], [-t0, 0, 1]];
    let tris = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]].map((f) => f.map((i) => V0[i]));
    const unit = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); }, mid = (a, b) => unit([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    tris = tris.map((f) => f.map(unit));
    for (let k = 0; k < 4; k++) tris = tris.flatMap(([a, b, cc]) => { const ab = mid(a, b), bc = mid(b, cc), ca = mid(cc, a); return [[a, ab, ca], [b, bc, ab], [cc, ca, bc], [ab, bc, ca]]; });
    const data = new Float32Array(tris.flat(2));
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(pg, 'p'); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    const U = (n) => gl.getUniformLocation(pg, n);
    const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[i * 4 + j] += a[k * 4 + j] * b[i * 4 + k]; return o; };
    const persp = (f, asp, n, fr) => { const t = 1 / Math.tan(f / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, (2 * fr * n) / (n - fr), 0]; };
    const rotY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
    let kick = 0;
    c.addEventListener('click', () => { kick = 1; });
    (function draw(t) {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; gl.viewport(0, 0, W, H); }
      kick *= 0.97;
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(U('pm'), false, new Float32Array(persp(0.8, W / H, 0.1, 20)));
      gl.uniformMatrix4fv(U('mv'), false, new Float32Array(mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3.6, 1], rotY(t / 4000))));
      gl.uniform1f(U('t'), t / 1000); gl.uniform1f(U('amp'), 0.12 + 0.1 * Math.sin(t / 900) + kick * 0.35 * Math.sin(t / 60));
      gl.drawArrays(gl.TRIANGLES, 0, data.length / 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: '3d-coverflow', c: '3d', lv: 2,
  t: '奥行きのある札の並び', y: 'おくゆきのあるふだのならび',
  tags: ['CSS 3D', 'カルーセル', 'キーボード操作', '反射'],
  d: '真ん中の札だけ正面を向き、両側の札は斜めに傾いて奥へ重なる。矢印キー・ホイール・スワイプ・クリックで選び直すと、札が滑らかに回り込む。床に映る影も CSS だけで描いている。',
  p: '札の位置は「真ん中からいくつ離れているか」だけで決まる。その数から傾きと奥行きを計算し、あとは transition に任せる。',
  html: `<div class="flow" id="flow" role="listbox" tabindex="0" aria-label="分類の札"></div><p class="cap" id="cap" aria-live="polite"></p>`,
  css: `
    body { background: linear-gradient(#111, #000 60%); overflow: hidden; height: 100vh; display: grid; place-items: center; touch-action: pan-y; }
    .flow { position: relative; width: 100%; height: 300px; perspective: 900px; outline: none; }
    .card { position: absolute; left: 50%; top: 30px; width: 180px; height: 180px; margin-left: -90px; border-radius: 10px; transition: transform .55s cubic-bezier(.2,.8,.2,1), filter .55s; cursor: pointer;
      display: grid; place-items: center; color: #fff; font: 900 44px "Hiragino Mincho ProN", "Yu Mincho", serif; text-shadow: 0 2px 6px #0006; }
    .card::after { content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 60%; margin-top: 4px; border-radius: inherit; background: inherit; transform: scaleY(-1); mask-image: linear-gradient(to top, #0007, transparent 70%); }
    .card[aria-selected=true] { box-shadow: 0 0 0 3px #fff8; }
    .flow:focus-visible .card[aria-selected=true] { box-shadow: 0 0 0 4px #ffd166; }
    .cap { position: fixed; bottom: 14%; left: 0; right: 0; text-align: center; color: #ddd; font: 15px system-ui, sans-serif; margin: 0; }`,
  js() {
    const ITEMS = [['図形', 20], ['動き', 200], ['光', 50], ['立体', 265], ['描画', 330], ['粒子', 170], ['画素', 110], ['文字', 5], ['部品', 225], ['音', 305], ['遊戯', 70], ['数理', 245], ['変換', 125], ['道具', 85], ['合技', 160], ['実用', 15]];
    const flow = document.getElementById('flow');
    flow.innerHTML = ITEMS.map(([name, h], i) => `<div class="card" role="option" id="cf${i}" aria-selected="false" style="background: radial-gradient(circle at 30% 25%, hsl(${h} 90% 70%), hsl(${h} 70% 40%) 60%, hsl(${(h + 40) % 360} 60% 25%))">${name}</div>`).join('');
    const cards = [...flow.children];
    let cur = 3;
    function go(i) {
      cur = Math.max(0, Math.min(cards.length - 1, i));
      cards.forEach((el, k) => {
        const off = k - cur, a = Math.abs(off), s = Math.sign(off);
        el.style.transform = off === 0 ? 'translateZ(120px)' : `translateX(${s * (130 + a * 46)}px) translateZ(${-a * 30}px) rotateY(${-s * 62}deg)`;
        el.style.zIndex = 100 - a; el.style.filter = `brightness(${1 - Math.min(a, 6) * 0.1})`;
        el.setAttribute('aria-selected', off === 0);
      });
      flow.setAttribute('aria-activedescendant', cards[cur].id);
      document.getElementById('cap').textContent = `${cur + 1} / ${cards.length} ・ ${ITEMS[cur][0]}`;
    }
    flow.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1, Home: -99, End: 99 }[e.key];
      if (d === undefined) return;
      const next = Math.max(0, Math.min(cards.length - 1, cur + d));
      if (next === cur) return; // 端ではキーを横取りしない
      e.preventDefault(); go(next);
    });
    flow.addEventListener('click', (e) => { const el = e.target.closest('.card'); if (el) { go(cards.indexOf(el)); flow.focus(); } });
    let acc = 0;
    flow.addEventListener('wheel', (e) => { e.preventDefault(); acc += e.deltaX || e.deltaY; if (Math.abs(acc) > 60) { go(cur + Math.sign(acc)); acc = 0; } }, { passive: false });
    let sx = null;
    flow.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    flow.addEventListener('pointerup', (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 40) go(cur - Math.sign(e.clientX - sx)); sx = null; });
    go(cur);
    if (window.THUMB) { let d = 1; setInterval(() => { if (cur + d < 0 || cur + d >= cards.length) d = -d; go(cur + d); }, 1100); }
  },
});
/* キャラクターの 3D モデル
 * 権利上自由に使えるモデル（VRoid の公式サンプル）を、変換の道具（tools/vrm2js.mjs）で JavaScript のデータにして描く。
 * データは大きいので、項目の data に書いたファイルを、その項目を開いたときだけ読み込む（一覧の小さな絵は出さない）。 */
dekiru.add({
  id: '3d-vroid-toon', c: '3d', lv: 3,
  t: 'VRoid のキャラをアニメ調で描く', y: 'ぶいろいどのきゃらをあにめちょうでえがく',
  tags: ['3D', 'VRM', 'アニメ調', 'スキニング', 'WebGL'],
  data: ['data/vroid-b.js'], nt: true,
  d: 'VRoid の公式サンプル「AvatarSample_B」を、ライブラリを使わずに WebGL2 で描く。元の VRM（28MB）を道具で JavaScript のデータ（約 1.4MB）に変換し、開いたときだけ読み込む。113 本の骨の向きから頂点の位置を毎回計算する（スキニング）。陰影は VRM 標準の MToon にならい、光の当たり方で基本の色と影の色を切り替える。輪郭線は、裏返した形を少し膨らませて描く。カメラは全身の周りを回り、14 秒ごとに顔に寄る。画面か左上のボタンを押すと全身と顔が切り替わる。まばたきはモデルの表情データで動かす。',
  p: '3D のモデルも、つまるところ数の並び。位置や法線を小さな整数に詰めて文字列にすれば、3D のファイルを開く仕組みを使わずに、JavaScript のデータとして扱える。',
  html: `<canvas id="c" role="img" aria-label="紫の長い髪の女の子の 3D モデルが、アニメ調の陰影で描かれ、カメラがゆっくり周りを回る"></canvas>
<p class="credit">3D モデル: AvatarSample_B（VRoid Project）</p>
<button class="zoom" id="zoom" type="button">顔に寄る</button>`,
  css: `body { background: #1a1820; overflow: hidden; }
canvas { display: block; width: 100vw; height: 100vh; }
.credit { position: fixed; left: 12px; bottom: 8px; margin: 0; font-size: 11px; color: #fff9; }
.zoom { position: fixed; left: 12px; top: 8px; font-size: 13px; color: #fff; background: #0007; border: 0; padding: 2px 8px; border-radius: 4px; }
.zoom:hover { background: #000a; }
.zoom:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }`,
  core() {
    // データを戻す計算（変換の道具 tools/lib/meshpack.mjs の逆）と、骨の行列の計算。DOM を使わない
    const TYPES = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Float32Array };
    const view = (bytes, r) => new TYPES[r.t](bytes.buffer, bytes.byteOffset + r.o, r.n);
    // 箱の中を 0〜65535 に分けた整数を、元の小数に戻す（k は 1 組の数: 位置は 3、UV は 2）
    function dequant(q, min, max, k) {
      const out = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) { const a = i % k; out[i] = min[a] + q[i] / 65535 * (max[a] - min[a]); }
      return out;
    }
    // 八面体に写した 2 つの整数から、法線（長さ 1 の向き）に戻す
    function octDecode(e) {
      const out = new Float32Array(e.length / 2 * 3);
      for (let i = 0, j = 0; i < e.length; i += 2, j += 3) {
        let x = e[i] / 127, y = e[i + 1] / 127; const z = 1 - Math.abs(x) - Math.abs(y);
        if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1); y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1); }
        const l = Math.hypot(x, y, z) || 1; out[j] = x / l; out[j + 1] = y / l; out[j + 2] = z / l;
      }
      return out;
    }
    // 表情: 元の位置に、動く頂点の差分を重みを掛けて足す
    function morphInto(dst, base, morphs) {
      dst.set(base);
      for (const { idx, d, scale, w } of morphs) {
        if (!w) continue;
        for (let k = 0; k < idx.length; k++) { const v = idx[k] * 3; dst[v] += d[k * 3] * scale * w; dst[v + 1] += d[k * 3 + 1] * scale * w; dst[v + 2] += d[k * 3 + 2] * scale * w; }
      }
      return dst;
    }
    // 4x4 の行列（列の順に並べる）。位置 t・回転 r（四元数）・大きさ s から作る
    function trs(t, r, s) {
      const [x, y, z, w] = r, m = new Float32Array(16);
      m[0] = (1 - 2 * (y * y + z * z)) * s[0]; m[1] = 2 * (x * y + z * w) * s[0]; m[2] = 2 * (x * z - y * w) * s[0];
      m[4] = 2 * (x * y - z * w) * s[1]; m[5] = (1 - 2 * (x * x + z * z)) * s[1]; m[6] = 2 * (y * z + x * w) * s[1];
      m[8] = 2 * (x * z + y * w) * s[2]; m[9] = 2 * (y * z - x * w) * s[2]; m[10] = (1 - 2 * (x * x + y * y)) * s[2];
      m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
      return m;
    }
    function mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    }
    const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    const qaxis = (ax, ang) => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };
    // 全部の骨の、世界での行列。pose は「骨の番号 → 足す回転（四元数）」
    function worldMatrices(nodes, pose) {
      const out = new Array(nodes.length);
      const get = (i) => {
        if (out[i]) return out[i];
        const n = nodes[i], r = pose.has(i) ? qmul(n.r, pose.get(i)) : n.r, local = trs(n.t, r, n.s);
        return (out[i] = n.parent < 0 ? local : mul(get(n.parent), local));
      };
      for (let i = 0; i < nodes.length; i++) get(i);
      return out;
    }
  },
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: true });
    if (!gl) { document.body.textContent = 'この作品には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const D = window.DEKIRU_DATA?.['vroid-b'];
    if (!D) { document.body.textContent = 'モデルのデータ（data/vroid-b.js）を読み込めませんでした。'; throw new Error('データがありません'); }
    const t0 = performance.now();
    const raw = atob(D.bin), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const program = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };

    // ---- 骨で形を動かし、アニメ調の陰影をつけるシェーダー（outline が 1 のときは、裏返して膨らませた輪郭線） ----
    const VS = `#version 300 es
uniform highp sampler2D J; uniform mat4 VP; uniform float outline; uniform sampler2D TW;
in vec3 aP; in vec3 aN; in vec2 aUV; in uvec4 aJ; in vec4 aW;
out vec3 vN; out vec3 vP; out vec2 vUV;
mat4 jm(uint i) { int k = int(i); return mat4(texelFetch(J, ivec2(0, k), 0), texelFetch(J, ivec2(1, k), 0), texelFetch(J, ivec2(2, k), 0), texelFetch(J, ivec2(3, k), 0)); }
void main() {
  mat4 S = jm(aJ.x) * aW.x + jm(aJ.y) * aW.y + jm(aJ.z) * aW.z + jm(aJ.w) * aW.w;
  vec4 p = S * vec4(aP, 1.); vN = normalize(mat3(S) * aN); vUV = aUV;
  if (outline > 0.) p.xyz += vN * outline * texture(TW, aUV).r;
  vP = p.xyz; gl_Position = VP * p;
}`;
    const FS = `#version 300 es
precision highp float;
uniform sampler2D TM, TA, TS; uniform int mode, isOutline; uniform float cutoff, shadeShift, shadeToony, outlineMix;
uniform vec3 color, shadeColor, outlineColor, L; uniform float alphaFromMask;
in vec3 vN; in vec3 vP; in vec2 vUV; out vec4 O;
void main() {
  vec4 m = texture(TM, vUV); float a = alphaFromMask > .5 ? texture(TA, vUV).r : 1.;
  if (mode == 1 && a < cutoff) discard;
  vec3 lit = color * m.rgb, shade = shadeColor * texture(TS, vUV).rgb;
  vec3 N = normalize(vN) * (gl_FrontFacing ? 1. : -1.);
  // MToon の陰影: 半分のランバートを [-1, 1] に広げ、影の位置（shadeShift）と硬さ（shadeToony）で 0〜1 に写す
  float li = dot(N, L) * .5 + .5; li = li * 2. - 1.;
  float hi = mix(1., shadeShift, shadeToony);
  li = clamp((li - shadeShift) / max(1e-4, hi - shadeShift), 0., 1.);
  vec3 col = mix(shade, lit, li) + lit * .1;                                     // 周りから回り込む弱い光
  if (isOutline == 1) col = outlineColor * mix(vec3(1.), col, outlineMix);
  col = pow(clamp(col, 0., 1.), vec3(1. / 2.2));
  O = vec4(col, mode == 2 ? a * m.a : 1.);
}`;
    const prog = program(VS, FS);
    const U = (n) => gl.getUniformLocation(prog, n);
    const u = Object.fromEntries(['J', 'VP', 'outline', 'TW', 'TM', 'TA', 'TS', 'mode', 'isOutline', 'cutoff', 'shadeShift', 'shadeToony', 'outlineMix', 'color', 'shadeColor', 'outlineColor', 'L', 'alphaFromMask'].map((n) => [n, U(n)]));

    // ---- 画像（色と透明度を分けた WebP）を読む ----
    const white = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    async function tex(url, srgb) {
      const im = new Image(); im.src = url; await im.decode();
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      return t;
    }
    const texColor = {}, texAlpha = {};
    const ready = Promise.all(Object.entries(D.images).map(async ([k, im]) => {
      texColor[k] = await tex(im.color, true);
      if (im.alpha) texAlpha[k] = await tex(im.alpha, false);
    }));

    // ---- 形（頂点と面）を GPU へ ----
    // view・dequant・octDecode・morphInto・worldMatrices・mul・qaxis は、上の core にある
    const draws = [];
    const faces = [];   // 表情で形が変わる部分
    for (const m of D.meshes) {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const buf = (data, loc, size, type, norm, int) => {
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, int === 'dyn' ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
        const L2 = gl.getAttribLocation(prog, loc); gl.enableVertexAttribArray(L2);
        if (int === true) gl.vertexAttribIPointer(L2, size, type, 0, 0); else gl.vertexAttribPointer(L2, size, type, norm, 0, 0);
        return b;
      };
      const pos = dequant(view(bytes, m.pos), m.pos.min, m.pos.max, 3);
      const posBuf = buf(pos, 'aP', 3, gl.FLOAT, false, m.morphs.length ? 'dyn' : false);
      buf(octDecode(view(bytes, m.nrm)), 'aN', 3, gl.FLOAT, false);
      buf(dequant(view(bytes, m.uv), m.uv.min, m.uv.max, 2), 'aUV', 2, gl.FLOAT, false);
      buf(view(bytes, m.jnt), 'aJ', 4, gl.UNSIGNED_BYTE, false, true);
      buf(view(bytes, m.wgt), 'aW', 4, gl.UNSIGNED_BYTE, true);
      if (m.morphs.length) faces.push({ m, base: pos, cur: new Float32Array(pos), buf: posBuf, morphs: m.morphs.map((x) => ({ idx: view(bytes, x.idx), d: view(bytes, x.d), scale: x.scale, w: 0 })) });
      for (const p of m.prims) {
        const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, view(bytes, p.idx), gl.STATIC_DRAW);
        draws.push({ vao, ib, count: p.idx.n, mat: D.materials[p.mat] });   // 面の番号の入れ物は、描く直前に結び直す（VAO には最後に結んだ1つしか残らない）
      }
    }
    gl.bindVertexArray(null);
    draws.sort((a, b) => a.mat.queue - b.mat.queue);
    const blinkBind = D.expressions.find((e) => e.preset === 'blink')?.binds || [];

    // ---- 骨: 腕を下ろした姿（T の字から A の字へ）。VRM 0.x は後ろ（-Z）を向いているので 180 度回して正面に ----
    const H = D.humanoid, pose = new Map();
    pose.set(H.leftUpperArm, qaxis([0, 0, 1], 1.15));
    pose.set(H.rightUpperArm, qaxis([0, 0, 1], -1.15));
    pose.set(H.leftLowerArm, qaxis([0, 1, 0], -0.15));
    pose.set(H.rightLowerArm, qaxis([0, 1, 0], 0.15));
    const root = new Float32Array([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
    const skin = D.skins[0], ibm = view(bytes, skin.ibm);
    const jtex = gl.createTexture(), jdata = new Float32Array(4 * 4 * skin.joints.length);
    gl.bindTexture(gl.TEXTURE_2D, jtex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    let world = null;
    function updateBones() {
      world = worldMatrices(D.nodes, pose).map((m) => mul(root, m));
      skin.joints.forEach((n, j) => jdata.set(mul(world[n], ibm.subarray(j * 16, j * 16 + 16)), j * 16));
      gl.bindTexture(gl.TEXTURE_2D, jtex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, skin.joints.length, 0, gl.RGBA, gl.FLOAT, jdata);
    }
    updateBones();

    // ---- カメラ（透視と、見る位置）----
    const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); };
    function lookAt(e, t) {
      const z = [e[0] - t[0], e[1] - t[1], e[2] - t[2]], zl = Math.hypot(...z); z.forEach((v, i) => (z[i] = v / zl));
      const x = [z[2], 0, -z[0]], xl = Math.hypot(...x); x.forEach((v, i) => (x[i] = v / xl));
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]);
    }

    // ---- 背景: やわらかい色の壁と、足もとの丸い影 ----
    const bgProg = program(`#version 300 es
out vec2 q; void main() { vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1.; q = p; gl_Position = vec4(p, .999, 1); }`, `#version 300 es
precision highp float; in vec2 q; out vec4 O;
void main() { vec3 c = mix(vec3(.62, .58, .68), vec3(.9, .87, .92), q.y * .5 + .5); c *= 1. - .25 * dot(q * .7, q * .7); O = vec4(c, 1); }`);
    const shadowProg = program(`#version 300 es
uniform mat4 VP; out vec2 q; void main() { vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2. - 1.; q = p; gl_Position = VP * vec4(p.x * .45, 0., p.y * .3, 1); }`, `#version 300 es
precision highp float; in vec2 q; out vec4 O; void main() { O = vec4(.15, .1, .2, .35 * smoothstep(1., .2, length(q))); }`);

    const L = (() => { const v = [-.45, .65, .6], l = Math.hypot(...v); return v.map((x) => x / l); })();
    let blinkAt = 2, start = null, ok = false, near = 0, picked = 0, pickedAt = -99, shown = 0, last = 0, dt = 0;
    const zoomBtn = document.getElementById('zoom'), toggle = () => { picked = shown ? 0 : 1; pickedAt = last; };
    c.addEventListener('pointerdown', toggle);   // 押すと、顔に寄る・全身に戻る
    zoomBtn.addEventListener('click', toggle);   // ボタンなので、キーボードでも切り替えられる
    ready.then(() => { ok = true; console.log(`読み込み ${Math.round(performance.now() - t0)} ms・頂点 ${D.meshes.reduce((a, m) => a + m.count, 0)}・骨 ${skin.joints.length}`); });

    function frame(now) {
      requestAnimationFrame(frame);
      if (!ok) return;
      start ??= now;
      const t = (now - start) / 1000; dt = Math.min(.1, t - last); last = t;
      const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      gl.viewport(0, 0, w, h);
      // まばたき（3〜6 秒ごと、0.15 秒）
      if (t > blinkAt + .15) blinkAt = t + 3 + Math.random() * 3;
      const bt = (t - blinkAt) / .15, blink = bt > 0 && bt < 1 ? Math.sin(bt * Math.PI) : 0;
      for (const f of faces) {
        let changed = false;
        f.morphs.forEach((mo, k) => { const b = blinkBind.find((x) => D.meshes[x.mesh] === f.m && x.morph === k), w2 = b ? blink * b.weight : 0; if (mo.w !== w2) { mo.w = w2; changed = true; } });
        if (changed) { morphInto(f.cur, f.base, f.morphs); gl.bindBuffer(gl.ARRAY_BUFFER, f.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.cur); }
      }
      // カメラ: 全身の周りを 16 秒で 1 周する。14 秒ごと（押したときはすぐ）に、少し斜めの正面から顔に寄る
      const head = world[H.head], hp = [head[12], head[13] + .09, head[14]];
      const want = t - pickedAt < 30 ? picked : Math.floor(t / 14) % 2;   // 14 秒ごとに全身と顔を切り替える。押したらしばらくそれに従う
      if (shown !== want) zoomBtn.textContent = want ? '全身に戻る' : '顔に寄る';
      shown = want; near += (want - near) * Math.min(1, dt * 1.5);
      const k = near * near * (3 - 2 * near);
      const a0 = t * Math.PI * 2 / 16, sw = .3 + Math.sin(t * .35) * .35;           // 全身は 16 秒で 1 周、顔は斜めの正面で左右に振れる
      const ang = sw + Math.atan2(Math.sin(a0 - sw), Math.cos(a0 - sw)) * (1 - k);   // 近い向きへ回る
      const tgt = [hp[0] * k, .85 + (hp[1] - .85) * k, hp[2] * k], dist = 3.4 + (.9 - 3.4) * k;   // 顔に寄っても、頭の上のリボンまで入る距離
      const eye = [tgt[0] + Math.sin(ang) * dist, tgt[1] + .15 * (1 - k) + .02, tgt[2] + Math.cos(ang) * dist];
      const VP = mul(persp(.5, w / h, .05, 50), lookAt(eye, tgt));
      gl.disable(gl.DEPTH_TEST); gl.useProgram(bgProg); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(shadowProg); gl.uniformMatrix4fv(gl.getUniformLocation(shadowProg, 'VP'), false, VP); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniformMatrix4fv(u.VP, false, VP); gl.uniform3fv(u.L, L);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, jtex); gl.uniform1i(u.J, 0);
      for (const pass of [0, 1]) for (const d of draws) {
        const m = d.mat;
        if (pass === 1 && !(m.outlineWidth > 0)) continue;
        const blend = m.mode === 'blend';
        gl.depthMask(!blend); if (blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
        if (pass === 1) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); }
        else if (m.cull === 2) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); }
        else gl.disable(gl.CULL_FACE);
        const bind = (unit, name, t2) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t2 || white); gl.uniform1i(u[name], unit); };
        bind(1, 'TM', texColor[m.tex.main]); bind(2, 'TA', texAlpha[m.tex.main]); bind(3, 'TS', texColor[m.tex.shade]); bind(4, 'TW', texColor[m.tex.outline]);
        gl.uniform1f(u.alphaFromMask, texAlpha[m.tex.main] ? 1 : 0);
        gl.uniform1i(u.mode, { opaque: 0, cutout: 1, blend: 2 }[m.mode]); gl.uniform1i(u.isOutline, pass);
        gl.uniform1f(u.outline, pass ? m.outlineWidth : 0); gl.uniform1f(u.cutoff, m.cutoff);
        gl.uniform1f(u.shadeShift, m.shadeShift); gl.uniform1f(u.shadeToony, m.shadeToony); gl.uniform1f(u.outlineMix, m.outlineMix);
        gl.uniform3fv(u.color, m.color.slice(0, 3)); gl.uniform3fv(u.shadeColor, m.shadeColor.slice(0, 3)); gl.uniform3fv(u.outlineColor, m.outlineColor.slice(0, 3));
        gl.bindVertexArray(d.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.ib); gl.drawElements(gl.TRIANGLES, d.count, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.CULL_FACE);
    }
    requestAnimationFrame(frame);
  },
});
dekiru.add({
  id: '3d-vroid-motion', c: '3d', lv: 3,
  t: 'VRoid のキャラを人の動きで動かす', y: 'ぶいろいどのきゃらをひとのうごきでうごかす',
  tags: ['3D', 'VRM', 'モーションキャプチャー', '揺れもの', 'WebGL'],
  data: ['data/vroid-b.js', 'data/motion-bn1.js'], nt: true,
  d: 'VRoid の公式サンプル「AvatarSample_B」を、俳優の動きを記録したデータ（モーションキャプチャー）で動かす。お辞儀・手を振る・嬉しそうに手を振る・歩く・案内する・短いダンスの 6 つを順に演じ、動きと動きの間は 0.5 秒かけて混ぜる。記録の関節の回転は、変換の道具で VRoid の骨へ付け替えてある。髪・スカート・袖・胸は、モデルに入っている揺れものの設定で、遅れてついてくる動きを毎回計算する。体の当たり判定にはめり込まない。目はカメラを追い、嬉しいときは笑顔になる。画面か左上のボタンを押すと次の動きへ進む。',
  p: '手で姿勢を付けた動きは、どこか機械的になる。実際の人の動きを記録したデータには、体の重さや手足の動きの小さなずれがそのまま入っている。そこに髪や服の揺れを物理で足すと、生きた動きになる。',
  html: `<canvas id="c" role="img" aria-label="紫の長い髪の女の子の 3D モデルが、お辞儀や手を振るなどの動きを演じ、髪とスカートが揺れる"></canvas>
<button class="now" id="now" type="button"></button>
<p class="credit">3D モデル: AvatarSample_B（VRoid Project）・動き: Bandai Namco Research Motiondataset（CC BY-NC 4.0）</p>`,
  css: `body { background: #1a1820; overflow: hidden; }
canvas { display: block; width: 100vw; height: 100vh; }
.now, .credit { position: fixed; left: 12px; margin: 0; color: #fff; background: #0007; padding: 2px 8px; border-radius: 4px; }
.now { top: 8px; font-size: 13px; border: 0; }
.now:hover { background: #000a; }
.now:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.credit { bottom: 8px; font-size: 11px; }`,
  core() {
    // データを戻す計算（変換の道具の逆）・四元数・動きの再生・揺れもの。DOM を使わない
    const TYPES = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Float32Array };
    const view = (bytes, r) => new TYPES[r.t](bytes.buffer, bytes.byteOffset + r.o, r.n);
    function dequant(q, min, max, k) {
      const out = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) { const a = i % k; out[i] = min[a] + q[i] / 65535 * (max[a] - min[a]); }
      return out;
    }
    function octDecode(e) {
      const out = new Float32Array(e.length / 2 * 3);
      for (let i = 0, j = 0; i < e.length; i += 2, j += 3) {
        let x = e[i] / 127, y = e[i + 1] / 127; const z = 1 - Math.abs(x) - Math.abs(y);
        if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1); y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1); }
        const l = Math.hypot(x, y, z) || 1; out[j] = x / l; out[j + 1] = y / l; out[j + 2] = z / l;
      }
      return out;
    }
    function morphInto(dst, base, morphs) {
      dst.set(base);
      for (const { idx, d, scale, w } of morphs) {
        if (!w) continue;
        for (let k = 0; k < idx.length; k++) { const v = idx[k] * 3; dst[v] += d[k * 3] * scale * w; dst[v + 1] += d[k * 3 + 1] * scale * w; dst[v + 2] += d[k * 3 + 2] * scale * w; }
      }
      return dst;
    }
    // ---- 四元数 [x, y, z, w] と向き ----
    const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
    const qaxis = (ax, ang) => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };
    function qrot(q, v) {
      const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
      return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
    }
    const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    function qfromTo(a, b) {
      a = norm3(a); b = norm3(b);
      const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      if (d < -0.999999) return [0, 0, 1, 0];
      const q = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + d], l = Math.hypot(...q);
      return q.map((v) => v / l);
    }
    // 2 つの回転の間を、球面の上でなめらかにつなぐ
    function qslerp(a, b, t) {
      let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
      if (d < 0) { b = b.map((v) => -v); d = -d; }
      if (d > 0.9995) { const q = a.map((v, i) => v + (b[i] - v) * t), l = Math.hypot(...q); return q.map((v) => v / l); }
      const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
      return a.map((v, i) => v * wa + b[i] * wb);
    }
    // 動きの t 秒の姿勢: 前後のコマの回転を球面でつなぎ、腰の位置を直線でつなぐ
    function sampleClip(clip, rot, hips, t) {
      const n = clip.frames, B = rot.length / n / 4, f = Math.max(0, Math.min(n - 1.0001, t * clip.fps)), i = Math.floor(f), u = f - i;
      const out = [];
      for (let k = 0; k < B; k++) {
        const a = [0, 1, 2, 3].map((c) => rot[(i * B + k) * 4 + c] / 32767), b = [0, 1, 2, 3].map((c) => rot[((i + 1) * B + k) * 4 + c] / 32767);
        out.push(qslerp(a, b, u));
      }
      return { rot: out, hips: [0, 1, 2].map((c) => hips[i * 3 + c] + (hips[(i + 1) * 3 + c] - hips[i * 3 + c]) * u) };
    }
    // 揺れもの 1 つ分（VRM 0.x の決まり）: 先端を、慣性・元の向きへ戻る力・重さで動かし、長さを保ち、当たり判定の球から押し出す
    function springStep(s, pos, rest, dt, spheres) {
      const tail = [pos[0] + rest[0] * s.len, pos[1] + rest[1] * s.len, pos[2] + rest[2] * s.len];
      if (!s.cur) { s.cur = tail; s.prev = tail.slice(); }
      let nx = [0, 1, 2].map((c) => s.cur[c] + (s.cur[c] - s.prev[c]) * (1 - s.drag) + rest[c] * s.stiff * dt + s.gdir[c] * s.grav * dt);
      const fix = () => { const d = norm3([nx[0] - pos[0], nx[1] - pos[1], nx[2] - pos[2]]); nx = [pos[0] + d[0] * s.len, pos[1] + d[1] * s.len, pos[2] + d[2] * s.len]; };
      fix();
      for (const c of spheres) {
        const r = s.hit + c.r, d = [nx[0] - c.p[0], nx[1] - c.p[1], nx[2] - c.p[2]], l = Math.hypot(...d);
        if (l < r && l > 1e-6) { nx = [c.p[0] + d[0] / l * r, c.p[1] + d[1] / l * r, c.p[2] + d[2] / l * r]; fix(); }
      }
      s.prev = s.cur; s.cur = nx;
      return qfromTo(rest, [nx[0] - pos[0], nx[1] - pos[1], nx[2] - pos[2]]);   // 元の向きから、いまの先端の向きへの回転
    }
    // 4x4 の行列（列の順）
    function trs(t, r) {
      const [x, y, z, w] = r, m = new Float32Array(16);
      m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + z * w); m[2] = 2 * (x * z - y * w);
      m[4] = 2 * (x * y - z * w); m[5] = 1 - 2 * (x * x + z * z); m[6] = 2 * (y * z + x * w);
      m[8] = 2 * (x * z + y * w); m[9] = 2 * (y * z - x * w); m[10] = 1 - 2 * (x * x + y * y);
      m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
      return m;
    }
    function mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    }
  },
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: true });
    if (!gl) { document.body.textContent = 'この作品には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const D = window.DEKIRU_DATA?.['vroid-b'], MO = window.DEKIRU_DATA?.['motion-bn1'];
    if (!D || !MO) { document.body.textContent = 'モデルか動きのデータを読み込めませんでした。'; throw new Error('データがありません'); }
    const b64 = (s) => { const r = atob(s), u = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return u; };
    const bytes = b64(D.bin), mbytes = b64(MO.bin);
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const program = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };

    // ---- 骨で形を動かし、アニメ調の陰影をつけるシェーダー（「VRoid のキャラをアニメ調で描く」と同じ） ----
    const prog = program(`#version 300 es
uniform highp sampler2D J; uniform mat4 VP; uniform float outline; uniform sampler2D TW;
in vec3 aP; in vec3 aN; in vec2 aUV; in uvec4 aJ; in vec4 aW;
out vec3 vN; out vec2 vUV;
mat4 jm(uint i) { int k = int(i); return mat4(texelFetch(J, ivec2(0, k), 0), texelFetch(J, ivec2(1, k), 0), texelFetch(J, ivec2(2, k), 0), texelFetch(J, ivec2(3, k), 0)); }
void main() {
  mat4 S = jm(aJ.x) * aW.x + jm(aJ.y) * aW.y + jm(aJ.z) * aW.z + jm(aJ.w) * aW.w;
  vec4 p = S * vec4(aP, 1.); vN = normalize(mat3(S) * aN); vUV = aUV;
  if (outline > 0.) p.xyz += vN * outline * texture(TW, aUV).r;
  gl_Position = VP * p;
}`, `#version 300 es
precision highp float;
uniform sampler2D TM, TA, TS; uniform int mode, isOutline; uniform float cutoff, shadeShift, shadeToony, outlineMix, alphaFromMask;
uniform vec3 color, shadeColor, outlineColor, L;
in vec3 vN; in vec2 vUV; out vec4 O;
void main() {
  vec4 m = texture(TM, vUV); float a = alphaFromMask > .5 ? texture(TA, vUV).r : 1.;
  if (mode == 1 && a < cutoff) discard;
  vec3 lit = color * m.rgb, shade = shadeColor * texture(TS, vUV).rgb;
  vec3 N = normalize(vN) * (gl_FrontFacing ? 1. : -1.);
  float li = dot(N, L) * .5 + .5; li = li * 2. - 1.;
  float hi = mix(1., shadeShift, shadeToony);
  li = clamp((li - shadeShift) / max(1e-4, hi - shadeShift), 0., 1.);
  vec3 col = mix(shade, lit, li) + lit * .1;
  if (isOutline == 1) col = outlineColor * mix(vec3(1.), col, outlineMix);
  O = vec4(pow(clamp(col, 0., 1.), vec3(1. / 2.2)), mode == 2 ? a * m.a : 1.);
}`);
    const u = Object.fromEntries(['J', 'VP', 'outline', 'TW', 'TM', 'TA', 'TS', 'mode', 'isOutline', 'cutoff', 'shadeShift', 'shadeToony', 'outlineMix', 'color', 'shadeColor', 'outlineColor', 'L', 'alphaFromMask'].map((n) => [n, gl.getUniformLocation(prog, n)]));
    const white = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    async function tex(url, srgb) {
      const im = new Image(); im.src = url; await im.decode();
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      return t;
    }
    const texColor = {}, texAlpha = {};
    const ready = Promise.all(Object.entries(D.images).map(async ([k, im]) => { texColor[k] = await tex(im.color, true); if (im.alpha) texAlpha[k] = await tex(im.alpha, false); }));

    // ---- 形を GPU へ（面の番号の入れ物は、描く直前に結び直す） ----
    const draws = [], faces = [];
    for (const m of D.meshes) {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const buf = (data, name, size, type, norm, mode2) => {
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, mode2 === 'dyn' ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(loc);
        if (mode2 === 'int') gl.vertexAttribIPointer(loc, size, type, 0, 0); else gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
        return b;
      };
      const pos = dequant(view(bytes, m.pos), m.pos.min, m.pos.max, 3);
      const posBuf = buf(pos, 'aP', 3, gl.FLOAT, false, m.morphs.length ? 'dyn' : '');
      buf(octDecode(view(bytes, m.nrm)), 'aN', 3, gl.FLOAT, false);
      buf(dequant(view(bytes, m.uv), m.uv.min, m.uv.max, 2), 'aUV', 2, gl.FLOAT, false);
      buf(view(bytes, m.jnt), 'aJ', 4, gl.UNSIGNED_BYTE, false, 'int');
      buf(view(bytes, m.wgt), 'aW', 4, gl.UNSIGNED_BYTE, true);
      if (m.morphs.length) faces.push({ mi: D.meshes.indexOf(m), base: pos, cur: new Float32Array(pos), buf: posBuf, morphs: m.morphs.map((x) => ({ idx: view(bytes, x.idx), d: view(bytes, x.d), scale: x.scale, w: 0 })) });
      for (const p of m.prims) {
        const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, view(bytes, p.idx), gl.STATIC_DRAW);
        draws.push({ vao, ib, count: p.idx.n, mat: D.materials[p.mat] });
      }
    }
    gl.bindVertexArray(null);
    draws.sort((a, b) => a.mat.queue - b.mat.queue);

    // ---- 骨の並び: 親から順にたどる順番と、揺れもの・当たり判定の準備 ----
    const N = D.nodes, H = D.humanoid, kids = N.map(() => []);
    N.forEach((n, i) => { if (n.parent >= 0) kids[n.parent].push(i); });
    const order = []; (function walk(i) { order.push(i); kids[i].forEach(walk); })(0);
    N.forEach((n, i) => { if (n.parent < 0 && i !== 0) (function walk(j) { order.push(j); kids[j].forEach(walk); })(i); });
    const flipZ = (v) => [v[0], v[1], -v[2]];   // VRM 0.x の揺れものの向きと当たり判定の位置は、Z が逆向きで書かれている
    const springs = new Map();
    for (const g of D.springs) {
      const setup = (n) => {
        const ch = kids[n], local = ch.length ? N[ch[0]].t : (() => { const t = N[n].t, l = Math.hypot(...t) || 1; return t.map((v) => v / l * 0.07); })();   // 先端の骨は 7cm 先に仮の先端
        springs.set(n, { axis: norm3(local), len: Math.hypot(...local), stiff: g.stiffness, grav: g.gravityPower, gdir: flipZ(g.gravityDir), drag: g.drag, hit: g.hitRadius, cols: g.colliderGroups, cur: null, prev: null });
        ch.forEach(setup);
      };
      g.bones.forEach(setup);
    }
    let spheres = D.colliders.map(() => []);   // 当たり判定の球（前のコマの位置を使う）

    // ---- 動き ----
    const BI = Object.fromEntries(MO.bones.map((b, k) => [b, k]));
    const clips = MO.clips.map((cl) => ({ ...cl, rotA: view(mbytes, cl.rot), hipsA: dequant(view(mbytes, cl.hips), cl.hips.min, cl.hips.max, 3), len: (cl.frames - 1) / cl.fps }));
    const FACE = { byehappy: { joy: 0.85 }, byebye: { joy: 0.45 }, dance: { fun: 0.7 }, bow: { joy: 0.25 } };   // 動きごとの表情
    let ci = 0, ct = 0, prevPose = null, fade = 1, offset = [0, 0, 0];
    const nowEl = document.getElementById('now');
    const showName = () => { nowEl.textContent = `動き ${ci + 1}/${clips.length}: ${clips[ci].label} ▶ 次へ`; };
    function nextClip(pose) {
      // 次の動きは、いまの腰の位置から始める（歩いて進んだ分を引き継ぐ）
      const nc = (ci + 1) % clips.length, h0 = [0, 1, 2].map((k) => clips[nc].hipsA[k]);
      offset = [offset[0] + pose.hips[0] - h0[0], 0, offset[2] + pose.hips[2] - h0[2]];
      prevPose = { rot: pose.rot.map((q) => q.slice()), hips: [h0[0], pose.hips[1], h0[2]] };
      ci = nc; ct = 0; fade = 0; showName();
    }
    let lastPose = null;
    c.addEventListener('pointerdown', () => { if (lastPose) nextClip(lastPose); });
    nowEl.addEventListener('click', () => { if (lastPose) nextClip(lastPose); });   // ボタンなので、キーボード（Tab と Enter）でも次へ進める
    showName();

    // ---- 1 コマの骨の姿勢（動き → 揺れもの → 目線）を計算し、骨の行列にする ----
    const skin = D.skins[0], ibm = view(bytes, skin.ibm);
    const jtex = gl.createTexture(), jdata = new Float32Array(16 * skin.joints.length);
    gl.bindTexture(gl.TEXTURE_2D, jtex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const R = [0, 1, 0, 0];   // VRM 0.x は -Z を向いているので、縦の軸で 180 度回して正面へ
    const local = N.map((n) => n.r.slice()), Wp = N.map(() => [0, 0, 0]), Wq = N.map(() => [0, 0, 0, 1]);
    const humanNode = Object.fromEntries(MO.bones.map((b) => [H[b], b]));
    function pose(dt, camModel) {
      let p = sampleClip(clips[ci], clips[ci].rotA, clips[ci].hipsA, ct);
      if (fade < 1 && prevPose) { const k = fade * fade * (3 - 2 * fade); p = { rot: p.rot.map((q, i) => qslerp(prevPose.rot[i], q, k)), hips: p.hips.map((v, i) => prevPose.hips[i] + (v - prevPose.hips[i]) * k) }; }
      lastPose = p;
      for (const [n, b] of Object.entries(humanNode)) local[n] = p.rot[BI[b]];
      const hipsT = [p.hips[0] + offset[0], p.hips[1], p.hips[2] + offset[2]];
      for (const i of order) {
        const n = N[i], par = n.parent;
        const t = i === H.hips ? hipsT : n.t;
        const pp = par >= 0 ? Wp[par] : [0, 0, 0], pq = par >= 0 ? Wq[par] : [0, 0, 0, 1];
        const d = qrot(pq, t); Wp[i] = [pp[0] + d[0], pp[1] + d[1], pp[2] + d[2]];
        const s = springs.get(i);
        if (s) {
          const restDir = qrot(pq, s.axis), sph = [];
          for (const g of s.cols) for (const c2 of spheres[g]) sph.push(c2);
          Wq[i] = qmul(springStep(s, Wp[i], restDir, dt, sph), pq);
        } else if (i === H.leftEye || i === H.rightEye) {
          // 目線: 頭から見たカメラの向きへ、上下左右に少しだけ回す（VRM 0.x の顔は -Z 向き）
          const v = qrot(qconj(pq), [camModel[0] - Wp[i][0], camModel[1] - Wp[i][1], camModel[2] - Wp[i][2]]), l = Math.hypot(...v) || 1;
          const yaw = Math.max(-.25, Math.min(.25, Math.atan2(-v[0], -v[2]))), pit = Math.max(-.18, Math.min(.18, Math.asin(v[1] / l)));
          Wq[i] = qmul(pq, qmul(qaxis([0, 1, 0], yaw), qaxis([1, 0, 0], pit)));
        } else Wq[i] = qmul(pq, local[i]);
      }
      spheres = D.colliders.map((cg) => cg.colliders.map((k) => { const o = qrot(Wq[cg.node], flipZ(k.offset)); return { p: [Wp[cg.node][0] + o[0], Wp[cg.node][1] + o[1], Wp[cg.node][2] + o[2]], r: k.radius }; }));
      const root = trs([0, 0, 0], R);
      skin.joints.forEach((n, j) => jdata.set(mul(mul(root, trs(Wp[n], Wq[n])), ibm.subarray(j * 16, j * 16 + 16)), j * 16));
      gl.bindTexture(gl.TEXTURE_2D, jtex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, skin.joints.length, 0, gl.RGBA, gl.FLOAT, jdata);
      const foot = (a, b) => [-(Wp[a][0] + Wp[b][0]) / 2, -(Wp[a][2] + Wp[b][2]) / 2];
      return { hips: [-hipsT[0], hipsT[1], -hipsT[2]], feet: [foot(H.leftFoot, H.leftToes), foot(H.rightFoot, H.rightToes)] };   // 正面向きの空間での腰と足の位置
    }

    // ---- 表情: まばたき＋動きごとの表情 ----
    const exprOf = Object.fromEntries(D.expressions.map((e) => [e.preset, e.binds]));
    const face = { joy: 0, fun: 0 };
    function expressions(t, dt) {
      const want = FACE[clips[ci].name] || {};
      for (const k of Object.keys(face)) face[k] += ((want[k] || 0) - face[k]) * Math.min(1, dt * 3);
      if (t > blinkAt + .15) blinkAt = t + 2.5 + Math.random() * 3;
      const bt = (t - blinkAt) / .15, blink = (bt > 0 && bt < 1 ? Math.sin(bt * Math.PI) : 0) * (1 - Math.min(1, face.joy + face.fun));   // 笑顔で目を細めているときは、まばたきしない
      const w = new Map(), add = (preset, k) => { for (const b of exprOf[preset] || []) { const key = b.mesh + '/' + b.morph; w.set(key, Math.min(1, (w.get(key) || 0) + b.weight * k)); } };
      add('blink', blink); add('joy', face.joy); add('fun', face.fun);
      for (const f of faces) {
        let changed = false;
        f.morphs.forEach((mo, k) => { const v = w.get(f.mi + '/' + k) || 0; if (Math.abs(mo.w - v) > 1e-3) { mo.w = v; changed = true; } });
        if (changed) { morphInto(f.cur, f.base, f.morphs); gl.bindBuffer(gl.ARRAY_BUFFER, f.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.cur); }
      }
    }

    // ---- カメラと背景 ----
    const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); };
    function lookAt(e, t) {
      const z = norm3([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), x = norm3([z[2], 0, -z[0]]), y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]);
    }
    const bgProg = program(`#version 300 es
out vec2 q; void main() { vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1.; q = p; gl_Position = vec4(p, .999, 1); }`, `#version 300 es
precision highp float; in vec2 q; out vec4 O;
void main() { vec3 c = mix(vec3(.62, .58, .68), vec3(.9, .87, .92), q.y * .5 + .5); c *= 1. - .25 * dot(q * .7, q * .7); O = vec4(c, 1); }`);
    // 床: 足もとを中心に半径 6m。奥ほど背景に溶け、50cm ごとの薄い目盛りと、腰・両足の影を落とす（足が床に着いて見える）
    const shadowProg = program(`#version 300 es
uniform mat4 VP; uniform vec2 at; out vec2 w; void main() { vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2. - 1.; w = at + p * 6.; gl_Position = VP * vec4(w.x, 0., w.y, 1); }`, `#version 300 es
precision highp float; uniform vec2 at, S0, S1, S2; in vec2 w; out vec4 O;
float blob(vec2 c, vec2 r) { return smoothstep(1., .05, length((w - c) / r)); }
void main() {
  float fade = smoothstep(5.5, 1.2, length(w - at));
  vec2 gw = fwidth(w * 2.), gg = abs(fract(w * 2. - .5) - .5) / max(gw, vec2(1e-4));
  float line = (1. - min(min(gg.x, gg.y), 1.)) * .22;
  float sh = max(blob(S0, vec2(.4, .3)) * .45, max(blob(S1, vec2(.08, .13)), blob(S2, vec2(.08, .13))) * .7);
  vec3 col = mix(vec3(.6, .56, .66) * (1. - line), vec3(.18, .13, .24), sh);
  O = vec4(col, fade * (.75 + .25 * sh));
}`);
    const L = norm3([-.45, .65, .6]);
    let blinkAt = 2, start = null, last = 0, ok = false, look = null;
    ready.then(() => { ok = true; console.log(`動き ${clips.length} 個・合わせて ${clips.reduce((a, cl) => a + cl.len, 0).toFixed(0)} 秒・揺れもの ${springs.size} 本`); });

    function frame(now) {
      requestAnimationFrame(frame);
      if (!ok) return;
      start ??= now;
      const t = (now - start) / 1000, dt = Math.min(1 / 30, Math.max(1e-3, t - last)); last = t;
      const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      gl.viewport(0, 0, w, h);
      // 動きを進める。終わったら次の動きへ
      ct += dt; fade = Math.min(1, fade + dt / .5);
      if (ct > clips[ci].len && lastPose) nextClip(lastPose);
      // カメラ: 腰を追いかけ、正面の少し斜めから左右にゆっくり振れる
      const hp = look || [0, .8, 0], ang = .35 + Math.sin(t * .2) * .4, dist = 3.5;   // 歩いて近づいても足まで入る距離
      const eye = [hp[0] + Math.sin(ang) * dist, 1.05, hp[2] + Math.cos(ang) * dist];
      const P = pose(dt, [-eye[0], eye[1], -eye[2]]), hipsNow = P.hips;
      look = look ? look.map((v, i) => v + ([hipsNow[0], .85, hipsNow[2]][i] - v) * Math.min(1, dt * 4)) : [hipsNow[0], .85, hipsNow[2]];   // 歩いて近づいても、全身が画面に入るように追う
      expressions(t, dt);
      const VP = mul(persp(.55, w / h, .05, 50), lookAt(eye, [look[0], .8, look[2]]));
      gl.disable(gl.DEPTH_TEST); gl.useProgram(bgProg); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(shadowProg); gl.uniformMatrix4fv(gl.getUniformLocation(shadowProg, 'VP'), false, VP); const su = (n) => gl.getUniformLocation(shadowProg, n);
      gl.uniform2f(su('at'), look[0], look[2]); gl.uniform2f(su('S0'), hipsNow[0], hipsNow[2]); gl.uniform2fv(su('S1'), P.feet[0]); gl.uniform2fv(su('S2'), P.feet[1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog); gl.uniformMatrix4fv(u.VP, false, VP); gl.uniform3fv(u.L, L);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, jtex); gl.uniform1i(u.J, 0);
      for (const pass of [0, 1]) for (const d of draws) {
        const m = d.mat;
        if (pass === 1 && !(m.outlineWidth > 0)) continue;
        const blend = m.mode === 'blend';
        gl.depthMask(!blend); if (blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
        if (pass === 1) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); } else if (m.cull === 2) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); } else gl.disable(gl.CULL_FACE);
        const bind = (unit, name, t2) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t2 || white); gl.uniform1i(u[name], unit); };
        bind(1, 'TM', texColor[m.tex.main]); bind(2, 'TA', texAlpha[m.tex.main]); bind(3, 'TS', texColor[m.tex.shade]); bind(4, 'TW', texColor[m.tex.outline]);
        gl.uniform1f(u.alphaFromMask, texAlpha[m.tex.main] ? 1 : 0); gl.uniform1i(u.mode, { opaque: 0, cutout: 1, blend: 2 }[m.mode]); gl.uniform1i(u.isOutline, pass);
        gl.uniform1f(u.outline, pass ? m.outlineWidth : 0); gl.uniform1f(u.cutoff, m.cutoff); gl.uniform1f(u.shadeShift, m.shadeShift); gl.uniform1f(u.shadeToony, m.shadeToony); gl.uniform1f(u.outlineMix, m.outlineMix);
        gl.uniform3fv(u.color, m.color.slice(0, 3)); gl.uniform3fv(u.shadeColor, m.shadeColor.slice(0, 3)); gl.uniform3fv(u.outlineColor, m.outlineColor.slice(0, 3));
        gl.bindVertexArray(d.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.ib); gl.drawElements(gl.TRIANGLES, d.count, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.CULL_FACE);
    }
    requestAnimationFrame(frame);
  },
});

dekiru.add({
  id: '3d-vroid-shore', c: '3d', lv: 3,
  t: '夕暮れの浅瀬で手を振るキャラ（アニメ映画風の合成）', y: 'ゆうぐれのあさせでてをふるきゃら',
  tags: ['3D', 'VRM', '合成', '撮影処理', 'WebGL'],
  data: ['data/vroid-b.js', 'data/motion-bn1.js'], nt: true,
  d: '夕暮れの浅瀬に、VRoid の公式サンプル「AvatarSample_B」が立つアニメ映画風の場面。背景は「夕凪の浅瀬を歩く人の影」と同じ計算の夕日と海で、キャラはそれと同じ高さ・同じ焦点距離のカメラで写すので、足が水面に正しく乗る。沖からこちらへ歩いてきて、嬉しそうに手を振り、お辞儀をして、もう一度手を振る。キャラは正面から空の色の柔らかい光で照らし、後ろの夕日が輪郭を光らせる。くるぶしまで水に浸かり、水面には揺れる逆さの姿が映る。仕上げに、背景の光がキャラの縁へ回り込む処理、背景のぼかし、明るい所のにじみ、太陽からのレンズの光、逆光に浮かぶ光の粒を重ねる。夕方の風で髪とスカートがなびき、足もとから波紋が広がる。',
  p: 'アニメ映画の画面は、絵を描いた後の「撮影」で決まる。背景と人物を同じカメラで写して光の向きをそろえ、縁に光を回り込ませて全体をにじませると、別々に作った絵が 1 つの場面になる。',
  html: `<canvas id="c" role="img" aria-label="夕暮れの浅瀬を紫の長い髪の女の子が歩いてきて、逆光の中で手を振る"></canvas>
<div class="bar"><button id="next" type="button">▶ 次の動き</button><button id="pause" type="button">❚❚ 止める</button></div>
<p class="credit">3D モデル: AvatarSample_B（VRoid Project）・動き: Bandai Namco Research Motiondataset（CC BY-NC 4.0）</p>`,
  css: `body { background: #000; overflow: hidden; }
canvas { display: block; width: 100vw; height: 100vh; }
.bar { position: fixed; top: 8px; left: 12px; display: flex; gap: 6px; }
.bar button, .credit { margin: 0; color: #fff; background: #0007; padding: 2px 8px; border-radius: 4px; }
.bar button { font-size: 13px; border: 0; }
.bar button:hover { background: #000a; }
.bar button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.credit { position: fixed; left: 12px; bottom: 8px; font-size: 11px; }`,
  core() {
    // データを戻す計算・四元数・動きの再生・揺れもの・背景と同じカメラの写し方。DOM を使わない
    const TYPES = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Float32Array };
    const view = (bytes, r) => new TYPES[r.t](bytes.buffer, bytes.byteOffset + r.o, r.n);
    function dequant(q, min, max, k) {
      const out = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) { const a = i % k; out[i] = min[a] + q[i] / 65535 * (max[a] - min[a]); }
      return out;
    }
    function octDecode(e) {
      const out = new Float32Array(e.length / 2 * 3);
      for (let i = 0, j = 0; i < e.length; i += 2, j += 3) {
        let x = e[i] / 127, y = e[i + 1] / 127; const z = 1 - Math.abs(x) - Math.abs(y);
        if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1); y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1); }
        const l = Math.hypot(x, y, z) || 1; out[j] = x / l; out[j + 1] = y / l; out[j + 2] = z / l;
      }
      return out;
    }
    function morphInto(dst, base, morphs) {
      dst.set(base);
      for (const { idx, d, scale, w } of morphs) {
        if (!w) continue;
        for (let k = 0; k < idx.length; k++) { const v = idx[k] * 3; dst[v] += d[k * 3] * scale * w; dst[v + 1] += d[k * 3 + 1] * scale * w; dst[v + 2] += d[k * 3 + 2] * scale * w; }
      }
      return dst;
    }
    const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
    const qaxis = (ax, ang) => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };
    function qrot(q, v) {
      const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
      return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
    }
    const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    function qfromTo(a, b) {
      a = norm3(a); b = norm3(b);
      const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      if (d < -0.999999) return [0, 0, 1, 0];
      const q = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + d], l = Math.hypot(...q);
      return q.map((v) => v / l);
    }
    function qslerp(a, b, t) {
      let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
      if (d < 0) { b = b.map((v) => -v); d = -d; }
      if (d > 0.9995) { const q = a.map((v, i) => v + (b[i] - v) * t), l = Math.hypot(...q); return q.map((v) => v / l); }
      const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
      return a.map((v, i) => v * wa + b[i] * wb);
    }
    function sampleClip(clip, rot, hips, t) {
      const n = clip.frames, B = rot.length / n / 4, f = Math.max(0, Math.min(n - 1.0001, t * clip.fps)), i = Math.floor(f), u = f - i, out = [];
      for (let k = 0; k < B; k++) {
        const a = [0, 1, 2, 3].map((c) => rot[(i * B + k) * 4 + c] / 32767), b = [0, 1, 2, 3].map((c) => rot[((i + 1) * B + k) * 4 + c] / 32767);
        out.push(qslerp(a, b, u));
      }
      return { rot: out, hips: [0, 1, 2].map((c) => hips[i * 3 + c] + (hips[(i + 1) * 3 + c] - hips[i * 3 + c]) * u) };
    }
    // 揺れもの 1 つ分（VRM 0.x の決まり）。ext は風などの外からの力（1 秒あたりの動き）
    function springStep(s, pos, rest, dt, spheres, ext) {
      const tail = [pos[0] + rest[0] * s.len, pos[1] + rest[1] * s.len, pos[2] + rest[2] * s.len];
      if (!s.cur) { s.cur = tail; s.prev = tail.slice(); }
      const e = ext || [0, 0, 0];
      let nx = [0, 1, 2].map((c) => s.cur[c] + (s.cur[c] - s.prev[c]) * (1 - s.drag) + rest[c] * s.stiff * dt + (s.gdir[c] * s.grav + e[c]) * dt);
      const fix = () => { const d = norm3([nx[0] - pos[0], nx[1] - pos[1], nx[2] - pos[2]]); nx = [pos[0] + d[0] * s.len, pos[1] + d[1] * s.len, pos[2] + d[2] * s.len]; };
      fix();
      for (const c of spheres) {
        const r = s.hit + c.r, d = [nx[0] - c.p[0], nx[1] - c.p[1], nx[2] - c.p[2]], l = Math.hypot(...d);
        if (l < r && l > 1e-6) { nx = [c.p[0] + d[0] / l * r, c.p[1] + d[1] / l * r, c.p[2] + d[2] / l * r]; fix(); }
      }
      s.prev = s.cur; s.cur = nx;
      return qfromTo(rest, [nx[0] - pos[0], nx[1] - pos[1], nx[2] - pos[2]]);
    }
    // 背景と同じカメラ: 高さ CH から +Z を水平に見る。焦点距離は画面の高さ 1、水平線は HZ だけ上。画面の右は世界の -X
    const HZ = .02, CH = .876;
    const toScreen = (w, cam) => { const v = [w[0] - cam[0], w[1] - cam[1], w[2] - cam[2]]; return [-v[0] / v[2], HZ + v[1] / v[2]]; };
    function trs(t, r) {
      const [x, y, z, w] = r, m = new Float32Array(16);
      m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + z * w); m[2] = 2 * (x * z - y * w);
      m[4] = 2 * (x * y - z * w); m[5] = 1 - 2 * (x * x + z * z); m[6] = 2 * (y * z + x * w);
      m[8] = 2 * (x * z + y * w); m[9] = 2 * (y * z - x * w); m[10] = 1 - 2 * (x * x + y * y);
      m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
      return m;
    }
    function mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    }
  },
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) { document.body.textContent = 'この作品には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const D = window.DEKIRU_DATA?.['vroid-b'], MO = window.DEKIRU_DATA?.['motion-bn1'];
    if (!D || !MO) { document.body.textContent = 'モデルか動きのデータを読み込めませんでした。'; throw new Error('データがありません'); }
    const HDR = !!gl.getExtension('EXT_color_buffer_float');   // 明るさの幅の広い絵（浮動小数）に描けるか
    const b64 = (s) => { const r = atob(s), u = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return u; };
    const bytes = b64(D.bin), mbytes = b64(MO.bin);
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const program = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
    const FULL = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }`;
    const NOISE = `float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }`;

    // ---- 1. 背景: 夕日の空と浅瀬（「夕凪の浅瀬を歩く人の影」と同じ計算）。カメラが前へ寄った分だけ床の模様もずらす ----
    const bgProg = program(FULL, `#version 300 es
precision highp float;
uniform vec2 R, shake; uniform float T, camX, camZ; uniform vec4 RP[4]; out vec4 O;
${NOISE}
const float HZ = .02, CH = .876; const vec2 SUN = vec2(.16, .055);
vec3 sky(vec2 p) {
  float h = p.y - HZ, ds = length((p - SUN) * vec2(1., 1.3));
  vec3 c = mix(vec3(1.25, .5, .18), vec3(.45, .2, .17), smoothstep(.0, .1, h));
  c = mix(c, vec3(.07, .07, .15), smoothstep(.06, .32, h));
  c = mix(c, vec3(.012, .018, .05), smoothstep(.28, .6, h));
  c += vec3(1., .5, .2) * (exp(-ds * 5.) * .7 + exp(-ds * 18.) * 1.1);
  float cl = fbm(vec2(p.x * 1.4 + T * .004, h * 13.)) * smoothstep(.06, .13, h) * smoothstep(.42, .16, h);
  cl = smoothstep(.42, .72, cl);
  c = mix(c, vec3(.1, .06, .09) + vec3(1., .45, .2) * exp(-ds * 3.) * .9, cl * .85);
  float sd = length(p - SUN);
  c += vec3(1.6, .9, .45) * 6. * smoothstep(.029, .026, sd) * (.7 + .3 * sqrt(max(0., 1. - sd / .028))) * smoothstep(HZ - .004, HZ + .006, p.y);
  return c;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y + shake;
  vec3 col;
  if (p.y >= HZ) col = sky(p);
  else {
    float z = CH / max(1e-4, HZ - p.y);
    vec2 g = vec2(-p.x * z + camX, z + camZ);   // 世界の床の位置（画面の右は -X）
    float rough = mix(.01, .07, smoothstep(5., 30., z));
    vec2 sl = vec2(noise(g * vec2(1.5, 3.) + vec2(3., -T * .7)) - .5, noise(g * vec2(.7, 1.6) + vec2(0., -T * .45)) - .5) * rough * 2.;
    sl.y += (noise(g * vec2(4., 9.) + vec2(T * .3, -T * 1.4)) - .5) * rough;
    sl.y += sin(g.y * 16. + noise(g * 1.5) * 5. - T * 1.8) * .006 * smoothstep(12., 3., z);
    float ring = 0.;
    for (int i = 0; i < 4; i++) {            // 足のまわりから広がる輪
      vec4 r = RP[i]; vec2 dv = g - r.xy; float dd = length(dv), rr = .05 + r.z * .35;
      sl += dv / (dd + .01) * sin((dd - rr) * 45.) * exp(-abs(dd - rr) * 20.) * exp(-r.z * 1.3) * r.w * .03;
      ring += exp(-abs(dd - rr) * 60.) * exp(-r.z * 1.6) * r.w;
    }
    vec3 refl = sky(vec2(p.x + sl.x * .5, 2. * HZ - p.y + sl.y));
    float cs = CH / sqrt(CH * CH + z * z), fre = .02 + .98 * pow(1. - cs, 5.);
    float rip = smoothstep(-.3, .9, sin(g.y * 45. + g.x * 6. + noise(g * 3.) * 9.)) * smoothstep(9., 3., z);
    vec3 sand = vec3(.03, .022, .018) * (.55 + .5 * rip) * (.7 + .6 * noise(g * 8.));
    col = mix(sand, refl, fre);
    float bar = smoothstep(.6, .66, fbm(g * vec2(.35, .6) + 2.)) * smoothstep(14., 6., z);
    col = mix(col, sand * 1.3 + refl * .14, bar);
    col += vec3(1., .55, .3) * ring * .07;    // 輪の山が夕日を映して光る
  }
  O = vec4(col, 1.);
}`);

    // ---- 2. キャラ: 背景と同じカメラで写す。正面から空の色の光、後ろの夕日で縁が光る。水の中は描かず、水面に逆さに映す ----
    const prog = program(`#version 300 es
uniform highp sampler2D J; uniform sampler2D TW; uniform vec3 cam, base; uniform vec2 shake; uniform float asp, outline, mirror, T, waterY;
in vec3 aP; in vec3 aN; in vec2 aUV; in uvec4 aJ; in vec4 aW;
out vec3 vN, vW; out vec2 vUV; out float vY;
mat4 jm(uint i) { int k = int(i); return mat4(texelFetch(J, ivec2(0, k), 0), texelFetch(J, ivec2(1, k), 0), texelFetch(J, ivec2(2, k), 0), texelFetch(J, ivec2(3, k), 0)); }
void main() {
  mat4 S = jm(aJ.x) * aW.x + jm(aJ.y) * aW.y + jm(aJ.z) * aW.z + jm(aJ.w) * aW.w;
  vec4 p = S * vec4(aP, 1.); vec3 n = normalize(mat3(S) * aN);
  if (outline > 0.) p.xyz += n * outline * texture(TW, aUV).r;
  vec3 w = p.xyz + base;          // キャラは VRM のまま -Z（カメラの方）を向く
  vY = w.y;
  if (mirror > .5) { w.y = 2. * waterY - w.y; n.y = -n.y; w.x += sin(w.y * 40. + T * 3.) * .008 * (waterY - w.y); }   // 水面に逆さに映り、さざ波で揺れる
  vN = n; vW = w; vUV = aUV;
  vec3 v = w - cam;
  gl_Position = vec4(-2. * v.x / asp, 2. * (.02 * v.z + v.y), 1.002 * v.z - .2002, v.z);   // 背景と同じ写し方（近い面 0.1m、遠い面 100m）
  gl_Position.xy -= 2. * shake * vec2(1. / asp, 1.) * gl_Position.w;
}`, `#version 300 es
precision highp float;
uniform sampler2D TM, TA, TS; uniform int mode, isOutline; uniform float cutoff, shadeShift, shadeToony, outlineMix, alphaFromMask, mirror, waterY;
uniform vec3 color, shadeColor, outlineColor, Lk, Ls, cam, skyCol, sunCol;
in vec3 vN, vW; in vec2 vUV; in float vY; out vec4 O;
void main() {
  if (vY < waterY) discard;                       // くるぶしから下は水の中
  vec4 m = texture(TM, vUV); float a = alphaFromMask > .5 ? texture(TA, vUV).r : 1.;
  if (mode == 1 && a < cutoff) discard;
  vec3 lit = color * m.rgb, shade = shadeColor * texture(TS, vUV).rgb;
  vec3 N = normalize(vN) * (gl_FrontFacing ? 1. : -1.);
  float li = dot(N, Lk) * .5 + .5; li = li * 2. - 1.;
  float hi = mix(1., shadeShift, shadeToony);
  li = clamp((li - shadeShift) / max(1e-4, hi - shadeShift), 0., 1.);
  vec3 col = mix(shade, lit, li) * skyCol;
  vec3 V = normalize(cam - vW);
  float rim = pow(1. - max(dot(N, V), 0.), 3.) * max(0., dot(N, Ls) * .6 + .45);   // 後ろの夕日が縁を光らせる
  if (isOutline == 1) col = outlineColor * mix(vec3(1.), col, outlineMix);
  else col += sunCol * (rim + .12 * smoothstep(.01, 0., vY - waterY));   // 水に入る所は夕日を受けて光る
  float alpha = mode == 2 ? a * m.a : 1.;
  if (mirror > .5) { col *= vec3(.5, .45, .55); alpha *= .55; }   // 水面に映る姿は暗く、半ば透ける
  O = vec4(col * alpha, alpha);                                   // 透明度を掛けた色で持つ
}`);
    const u = Object.fromEntries(['J', 'TW', 'cam', 'base', 'shake', 'asp', 'outline', 'mirror', 'T', 'waterY', 'TM', 'TA', 'TS', 'mode', 'isOutline', 'cutoff', 'shadeShift', 'shadeToony', 'outlineMix', 'alphaFromMask',
      'color', 'shadeColor', 'outlineColor', 'Lk', 'Ls', 'skyCol', 'sunCol'].map((n) => [n, gl.getUniformLocation(prog, n)]));

    // ---- 3. 重ねる: 背景のぼかし（被写界深度）と、背景の光がキャラの縁へ回り込む処理 ----
    const compProg = program(FULL, `#version 300 es
precision highp float;
uniform sampler2D BG, CHR; uniform vec2 R; uniform float dof; out vec4 O;
void main() {
  vec2 uv = gl_FragCoord.xy / R;
  vec3 bg = mix(texture(BG, uv).rgb, textureLod(BG, uv, 2.5).rgb, dof);
  vec4 ch = texture(CHR, uv);
  vec3 col = bg * (1. - ch.a) + ch.rgb;
  col += textureLod(BG, uv, 3.).rgb * clamp(ch.a - textureLod(CHR, uv, 1.5).a, 0., 1.) * .6;   // 光の回り込み（輪郭から数画素だけ）
  O = vec4(col, 1.);
}`);
    // ---- 4. 仕上げ: 明るい所のにじみ、太陽のレンズの光（キャラが隠すと弱まる）、色の調子、周辺の暗さ、粒子、場面の切り替えの暗転 ----
    const finalProg = program(FULL, `#version 300 es
precision highp float;
uniform sampler2D C, CHR; uniform vec2 R, sunUV; uniform float T, fade, asp; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  vec2 uv = gl_FragCoord.xy / R;
  vec3 col = texture(C, uv).rgb;
  vec3 bl = textureLod(C, uv, 3.).rgb * .45 + textureLod(C, uv, 5.).rgb * .35 + textureLod(C, uv, 6.5).rgb * .25;
  col += max(bl - 1., 0.) * .35 + bl * .04;
  float vis = (1. - textureLod(CHR, sunUV, 2.).a * .85) * (1. - texture(CHR, uv).a * .7);   // キャラが太陽を隠すと弱まり、キャラの上では薄くなる
  vec2 p = (uv - .5) * vec2(asp, 1.), s = (sunUV - .5) * vec2(asp, 1.);
  col += vec3(1., .55, .25) * exp(-length(p - s) * 9.) * .22 * vis;
  col += vec3(1., .6, .35) * exp(-abs(p.y - s.y) * 260.) * exp(-abs(p.x - s.x) * 1.8) * .25 * vis;   // 横に伸びる光の筋
  for (int i = 0; i < 3; i++) { float k = float(i), t = -.5 - k * .45; col += vec3(.5, .35, .2) * (.3 + .3 * k) * smoothstep(.05 + k * .03, .04 + k * .025, length(p - s * t)) * .05 * vis; }
  for (int i = 0; i < 24; i++) {   // 逆光に浮かぶ光の粒（ピントの外れた丸いぼけ）。ゆっくり漂い、太陽に近いほど明るい
    float k = float(i), sp = .008 + .015 * hash(vec2(k, 3.)), r = .005 + .018 * hash(vec2(k, 4.));
    vec2 c = (fract(vec2(hash(vec2(k, 1.)), hash(vec2(k, 2.))) + vec2(-.6, .35) * sp * T) - .5) * vec2(asp, 1.);
    float tw = .55 + .45 * sin(T * (.8 + 1.5 * hash(vec2(k, 5.))) + k * 2.1);
    col += vec3(1., .62, .32) * smoothstep(r, r * .65, length(p - c)) * (.03 + .25 * exp(-length(c - s) * 2.5)) * tw;
  }
  col = col * (2.51 * col + .03) / (col * (2.43 * col + .59) + .14);
  col *= .55 + .45 * pow(16. * uv.x * uv.y * (1. - uv.x) * (1. - uv.y), .25);
  col = pow(clamp(col, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
  O = vec4(col * fade, 1.);
}`);

    // ---- 絵を描く入れ物（浮動小数の絵。細かさを落とした段も作れるようにする） ----
    // キャラの絵は 1 画素を 4 か所で調べて描き（マルチサンプル）、輪郭のぎざぎざを抑える。使えない環境では 1 か所で描く
    const FMT = HDR ? gl.RGBA16F : gl.RGBA8, SAMPLES = Math.min(4, gl.getInternalformatParameter(gl.RENDERBUFFER, FMT, gl.SAMPLES)?.[0] || 0);
    function target(withDepth) {
      const t = { tex: gl.createTexture(), fb: gl.createFramebuffer(), w: 0, h: 0 };
      if (withDepth) { t.depth = gl.createRenderbuffer(); t.ms = SAMPLES ? gl.createFramebuffer() : t.fb; t.color = SAMPLES ? gl.createRenderbuffer() : null; }
      t.size = (w, h) => {
        if (t.w === w && t.h === h) return;
        t.w = w; t.h = h;
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, FMT, w, h, 0, gl.RGBA, HDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
        if (!withDepth) return;
        if (t.color) {
          gl.bindRenderbuffer(gl.RENDERBUFFER, t.color); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, FMT, w, h);
          gl.bindFramebuffer(gl.FRAMEBUFFER, t.ms); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, t.color);
        }
        gl.bindRenderbuffer(gl.RENDERBUFFER, t.depth);
        if (t.color) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, gl.DEPTH_COMPONENT24, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.depth);
      };
      // マルチサンプルの絵を、普通の絵（テクスチャ）へ移す
      t.resolve = () => { if (!t.color) return; gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.fb); gl.blitFramebuffer(0, 0, t.w, t.h, 0, 0, t.w, t.h, gl.COLOR_BUFFER_BIT, gl.NEAREST); };
      t.mip = () => { gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.generateMipmap(gl.TEXTURE_2D); };
      return t;
    }
    const tBG = target(false), tCH = target(true), tC = target(false);

    // ---- モデルの画像と形（「VRoid のキャラを人の動きで動かす」と同じ） ----
    const white = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    async function tex(url, srgb) {
      const im = new Image(); im.src = url; await im.decode();
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      return t;
    }
    const texColor = {}, texAlpha = {};
    const ready = Promise.all(Object.entries(D.images).map(async ([k, im]) => { texColor[k] = await tex(im.color, true); if (im.alpha) texAlpha[k] = await tex(im.alpha, false); }));
    const draws = [], faces = [];
    for (const m of D.meshes) {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const buf = (data, name, size, type, norm, mode2) => {
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, mode2 === 'dyn' ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(loc);
        if (mode2 === 'int') gl.vertexAttribIPointer(loc, size, type, 0, 0); else gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
        return b;
      };
      const pos = dequant(view(bytes, m.pos), m.pos.min, m.pos.max, 3);
      const posBuf = buf(pos, 'aP', 3, gl.FLOAT, false, m.morphs.length ? 'dyn' : '');
      buf(octDecode(view(bytes, m.nrm)), 'aN', 3, gl.FLOAT, false);
      buf(dequant(view(bytes, m.uv), m.uv.min, m.uv.max, 2), 'aUV', 2, gl.FLOAT, false);
      buf(view(bytes, m.jnt), 'aJ', 4, gl.UNSIGNED_BYTE, false, 'int');
      buf(view(bytes, m.wgt), 'aW', 4, gl.UNSIGNED_BYTE, true);
      if (m.morphs.length) faces.push({ mi: D.meshes.indexOf(m), base: pos, cur: new Float32Array(pos), buf: posBuf, morphs: m.morphs.map((x) => ({ idx: view(bytes, x.idx), d: view(bytes, x.d), scale: x.scale, w: 0 })) });
      for (const p of m.prims) {
        const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, view(bytes, p.idx), gl.STATIC_DRAW);
        draws.push({ vao, ib, count: p.idx.n, mat: D.materials[p.mat] });
      }
    }
    gl.bindVertexArray(null);
    draws.sort((a, b) => a.mat.queue - b.mat.queue);

    // ---- 骨・揺れもの・当たり判定 ----
    const N = D.nodes, H = D.humanoid, kids = N.map(() => []);
    N.forEach((n, i) => { if (n.parent >= 0) kids[n.parent].push(i); });
    const order = []; (function walk(i) { order.push(i); kids[i].forEach(walk); })(0);
    N.forEach((n, i) => { if (n.parent < 0 && i !== 0) (function walk(j) { order.push(j); kids[j].forEach(walk); })(i); });   // 根が分かれたデータでも全部の骨をたどる
    const flipZ = (v) => [v[0], v[1], -v[2]];
    const springs = new Map();
    for (const g of D.springs) {
      const setup = (n) => {
        const ch = kids[n], local = ch.length ? N[ch[0]].t : (() => { const t = N[n].t, l = Math.hypot(...t) || 1; return t.map((v) => v / l * 0.07); })();
        springs.set(n, { axis: norm3(local), len: Math.hypot(...local), stiff: g.stiffness, grav: g.gravityPower, gdir: flipZ(g.gravityDir), drag: g.drag, hit: g.hitRadius, cols: g.colliderGroups, cur: null, prev: null });
        ch.forEach(setup);
      };
      g.bones.forEach(setup);
    }
    let spheres = D.colliders.map(() => []);

    // ---- 場面: 沖から歩いてくる → 嬉しそうに手を振る → お辞儀 → 手を振る → 暗転して最初へ ----
    const BI = Object.fromEntries(MO.bones.map((b, k) => [b, k]));
    const byName = Object.fromEntries(MO.clips.map((cl) => [cl.name, { ...cl, rotA: view(mbytes, cl.rot), hipsA: dequant(view(mbytes, cl.hips), cl.hips.min, cl.hips.max, 3), len: (cl.frames - 1) / cl.fps }]));
    const SHOT = ['walk', 'byehappy', 'bow', 'byebye'].map((n) => byName[n]);
    const FACE = { walk: { joy: .2 }, byehappy: { joy: .85 }, bow: { joy: .3 }, byebye: { joy: .5 } };
    const START = [0.15, -0.11, 6.6];   // 歩き始める位置（世界）。水面が高さ 0 で、足は 11cm 下の砂を踏む（動きの足首は床から約 14cm なので、くるぶしまで水に入る）
    let ci = 0, ct = 0, prevPose = null, fade = 1, offset = [0, 0, 0], lastPose = null, cutAt = -1, clock = 0, paused = false;
    function nextClip(pose) {
      if (ci === SHOT.length - 1) { cutAt = clock; return; }   // 最後の動きのあとは暗転して最初に戻る
      const nc = ci + 1, h0 = [0, 1, 2].map((k) => SHOT[nc].hipsA[k]);
      offset = [offset[0] + pose.hips[0] - h0[0], 0, offset[2] + pose.hips[2] - h0[2]];
      prevPose = { rot: pose.rot.map((q) => q.slice()), hips: [h0[0], pose.hips[1], h0[2]] };
      ci = nc; ct = 0; fade = 0;
    }
    function restart() { ci = 0; ct = 0; fade = 1; prevPose = null; offset = [0, 0, 0]; for (const s of springs.values()) s.cur = s.prev = null; camZ = null; }
    document.getElementById('next').addEventListener('click', () => { if (lastPose) nextClip(lastPose); });   // ボタンなので、キーボードでも押せる
    const pauseBtn = document.getElementById('pause');
    pauseBtn.addEventListener('click', () => { paused = !paused; pauseBtn.textContent = paused ? '▶ 動かす' : '❚❚ 止める'; });
    const calm = matchMedia('(prefers-reduced-motion: reduce)');   // 動きを減らす設定のときは、カメラの手ぶれをなくす

    // ---- 1 コマの骨の姿勢（動き → 海風を受ける揺れもの → 目線） ----
    const skin = D.skins[0], ibm = view(bytes, skin.ibm);
    const jtex = gl.createTexture(), jdata = new Float32Array(16 * skin.joints.length);
    gl.bindTexture(gl.TEXTURE_2D, jtex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const local = N.map((n) => n.r.slice()), Wp = N.map(() => [0, 0, 0]), Wq = N.map(() => [0, 0, 0, 1]);
    const humanNode = Object.fromEntries(MO.bones.map((b) => [H[b], b]));
    function pose(dt, t, camModel) {
      const clip = SHOT[ci];
      let p = sampleClip(clip, clip.rotA, clip.hipsA, ct);
      if (fade < 1 && prevPose) { const k = fade * fade * (3 - 2 * fade); p = { rot: p.rot.map((q, i) => qslerp(prevPose.rot[i], q, k)), hips: p.hips.map((v, i) => prevPose.hips[i] + (v - prevPose.hips[i]) * k) }; }
      lastPose = p;
      for (const [n, b] of Object.entries(humanNode)) local[n] = p.rot[BI[b]];
      const hipsT = [p.hips[0] + offset[0], p.hips[1], p.hips[2] + offset[2]];
      const gust = .6 + .4 * Math.sin(t * .9) + .25 * Math.sin(t * 2.3 + 1), wind = [WIND[0] * gust, WIND[1], WIND[2] * gust];   // 海風（強さが波のように変わる）
      for (const i of order) {
        const n = N[i], par = n.parent, t2 = i === H.hips ? hipsT : n.t;
        const pp = par >= 0 ? Wp[par] : [0, 0, 0], pq = par >= 0 ? Wq[par] : [0, 0, 0, 1];
        const d = qrot(pq, t2); Wp[i] = [pp[0] + d[0], pp[1] + d[1], pp[2] + d[2]];
        const s = springs.get(i);
        if (s) {
          const restDir = qrot(pq, s.axis), sph = [];
          for (const g of s.cols) for (const c2 of spheres[g]) sph.push(c2);
          Wq[i] = qmul(springStep(s, Wp[i], restDir, dt, sph, wind), pq);
        } else if (i === H.leftEye || i === H.rightEye) {
          const v = qrot(qconj(pq), [camModel[0] - Wp[i][0], camModel[1] - Wp[i][1], camModel[2] - Wp[i][2]]), l = Math.hypot(...v) || 1;
          Wq[i] = qmul(pq, qmul(qaxis([0, 1, 0], Math.max(-.25, Math.min(.25, Math.atan2(-v[0], -v[2])))), qaxis([1, 0, 0], Math.max(-.18, Math.min(.18, Math.asin(v[1] / l))))));
        } else Wq[i] = qmul(pq, local[i]);
      }
      spheres = D.colliders.map((cg) => cg.colliders.map((k) => { const o = qrot(Wq[cg.node], flipZ(k.offset)); return { p: [Wp[cg.node][0] + o[0], Wp[cg.node][1] + o[1], Wp[cg.node][2] + o[2]], r: k.radius }; }));
      skin.joints.forEach((n, j) => jdata.set(mul(trs(Wp[n], Wq[n]), ibm.subarray(j * 16, j * 16 + 16)), j * 16));
      gl.bindTexture(gl.TEXTURE_2D, jtex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, skin.joints.length, 0, gl.RGBA, gl.FLOAT, jdata);
      return { hips: hipsT, feet: [Wp[H.leftFoot], Wp[H.rightFoot]] };
    }

    // ---- 表情 ----
    const exprOf = Object.fromEntries(D.expressions.map((e) => [e.preset, e.binds]));
    const face = { joy: 0 };
    let blinkAt = 2;
    function expressions(t, dt) {
      const want = FACE[SHOT[ci].name] || {};
      face.joy += ((want.joy || 0) - face.joy) * Math.min(1, dt * 3);
      if (t > blinkAt + .15) blinkAt = t + 2.5 + Math.random() * 3;
      const bt = (t - blinkAt) / .15, blink = (bt > 0 && bt < 1 ? Math.sin(bt * Math.PI) : 0) * (1 - Math.min(1, face.joy * 1.5));
      const w = new Map(), add = (preset, k) => { for (const b of exprOf[preset] || []) { const key = b.mesh + '/' + b.morph; w.set(key, Math.min(1, (w.get(key) || 0) + b.weight * k)); } };
      add('blink', blink); add('joy', face.joy);
      for (const f of faces) {
        let changed = false;
        f.morphs.forEach((mo, k) => { const v = w.get(f.mi + '/' + k) || 0; if (Math.abs(mo.w - v) > 1e-3) { mo.w = v; changed = true; } });
        if (changed) { morphInto(f.cur, f.base, f.morphs); gl.bindBuffer(gl.ARRAY_BUFFER, f.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.cur); }
      }
    }

    // ---- 光: 正面（カメラの側）から空の色、後ろの夕日（画面の太陽の向き）から縁の光 ----
    const SUN = [.16, .055], Ls = norm3([-SUN[0], SUN[1] - HZ, 1]), Lk = norm3([.35, .55, -1]);
    const skyCol = [.62, .5, .55], sunCol = [1.7, .8, .4], WATER = 0, WIND = [.55, .05, .5];   // 夕方の陸風: カメラの側（陸）から沖へ、少し画面の左（世界の +X）へ吹く
    const DIST = { walk: 3.1, byehappy: 2.35, bow: 2.7, byebye: 2.35 };   // 動きごとのカメラの距離（ゆっくり寄ったり引いたりする）
    let ok = false, camZ = null, camX = 0, lastNow = null, drawnW = 0, drawnH = 0, lastP = null;
    ready.then(() => { ok = true; console.log(`場面 ${SHOT.length} カット・明るさの幅の広い絵: ${HDR ? 'あり' : 'なし（8 ビット）'}`); });

    function frame(now) {
      requestAnimationFrame(frame);
      if (!ok) return;
      const dpr = Math.min(1.5, devicePixelRatio || 1), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr), asp = w / h;
      const step = lastNow == null ? 1 / 60 : Math.min(1 / 30, Math.max(1e-3, (now - lastNow) / 1000)); lastNow = now;
      if (paused && w === drawnW && h === drawnH) return;   // 止めている間は描き直さない（大きさが変わったときだけ描く）
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      drawnW = w; drawnH = h;
      const dt = paused ? 0 : step; clock += dt;
      const t = clock;
      // 場面を進める。最後の動きのあとは暗転（0.6 秒）して最初へ
      ct += dt; fade = Math.min(1, fade + dt / .5);
      if (cutAt < 0 && ct > SHOT[ci].len && lastPose) nextClip(lastPose);
      let dark = 1;
      if (cutAt >= 0) { const k = (t - cutAt) / .6; dark = Math.abs(1 - 2 * Math.min(1, k)); if (k >= .5 && ci !== 0) restart(); if (k >= 1) cutAt = -1; }
      // 姿勢を先に決める（目線は前のコマのカメラを見る）
      const shake = calm.matches ? [0, 0] : [Math.sin(t * .7) * .0012, Math.sin(t * .93 + 1) * .001];   // ほんの少しの手ぶれ
      const P = dt > 0 || !lastPose ? pose(Math.max(dt, 1e-3), t, [camX - START[0], CH - START[1], (camZ ?? 0) - START[2]]) : lastP;
      lastP = P;
      expressions(t, Math.max(dt, 1e-3));
      // カメラ: 腰から 3.7m 手前（手を振る間は 3.0m までゆっくり寄る）
      const hipsW = [P.hips[0] + START[0], 0, P.hips[2] + START[2]];
      const want = hipsW[2] - DIST[SHOT[ci].name];
      camZ = camZ == null ? want : camZ + (want - camZ) * Math.min(1, dt * (ci === 0 ? 2 : .5));
      camX += (hipsW[0] * .4 - camX) * Math.min(1, dt);
      const cam = [camX, CH, camZ];
      const feetW = P.feet.map((f) => [f[0] + START[0], f[2] + START[2]]);

      // 1. 背景
      tBG.size(w, h); tCH.size(w, h); tC.size(w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, tBG.fb); gl.viewport(0, 0, w, h); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(bgProg);
      const bu = (n) => gl.getUniformLocation(bgProg, n);
      gl.uniform2f(bu('R'), w, h); gl.uniform2fv(bu('shake'), shake); gl.uniform1f(bu('T'), t); gl.uniform1f(bu('camX'), camX); gl.uniform1f(bu('camZ'), camZ);
      const rp = new Float32Array(16);
      feetW.forEach((f, k) => { for (let j = 0; j < 2; j++) { const i = k * 2 + j, age = (t / 1.7 + i * .43) % 1 * 1.7; rp.set([f[0], f[1], age, 1], i * 4); } });   // 足のまわりに、ずらして広がる輪
      gl.uniform4fv(bu('RP'), rp);
      gl.drawArrays(gl.TRIANGLES, 0, 3); tBG.mip();

      // 2. キャラ（先に水面の逆さの姿、次に本体）
      gl.bindFramebuffer(gl.FRAMEBUFFER, tCH.ms); gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.useProgram(prog);
      gl.uniform3fv(u.cam, cam); gl.uniform3fv(u.base, START); gl.uniform2fv(u.shake, shake); gl.uniform1f(u.asp, asp); gl.uniform1f(u.T, t); gl.uniform1f(u.waterY, WATER);
      gl.uniform3fv(u.Lk, Lk); gl.uniform3fv(u.Ls, Ls); gl.uniform3fv(u.skyCol, skyCol); gl.uniform3fv(u.sunCol, sunCol);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, jtex); gl.uniform1i(u.J, 0);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // 透明度を掛けた色どうしを重ねる
      // 水面の姿は半ば透けるので、先に奥行きだけ描き（depthOnly）、いちばん手前の面だけに色を付ける。こうしないと髪と体が重なった所が濃くなる
      for (const [mirror, depthOnly] of [[1, 1], [1, 0], [0, 0]]) {
        gl.frontFace(mirror ? gl.CW : gl.CCW);   // 上下を返すと、面の表と裏が入れ替わる
        gl.uniform1f(u.mirror, mirror);
        gl.colorMask(!depthOnly, !depthOnly, !depthOnly, !depthOnly);
        for (const pass of [0, 1]) for (const d of draws) {
          const m = d.mat;
          if (pass === 1 && !(m.outlineWidth > 0)) continue;
          if (depthOnly && m.mode === 'blend') continue;
          const blend = m.mode === 'blend' || mirror;
          gl.depthMask(m.mode !== 'blend' && (!mirror || depthOnly)); if (blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
          if (pass === 1) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); } else if (m.cull === 2) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); } else gl.disable(gl.CULL_FACE);
          const bind = (unit, name, t2) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t2 || white); gl.uniform1i(u[name], unit); };
          bind(1, 'TM', texColor[m.tex.main]); bind(2, 'TA', texAlpha[m.tex.main]); bind(3, 'TS', texColor[m.tex.shade]); bind(4, 'TW', texColor[m.tex.outline]);
          gl.uniform1f(u.alphaFromMask, texAlpha[m.tex.main] ? 1 : 0); gl.uniform1i(u.mode, { opaque: 0, cutout: 1, blend: 2 }[m.mode]); gl.uniform1i(u.isOutline, pass);
          gl.uniform1f(u.outline, pass ? m.outlineWidth : 0); gl.uniform1f(u.cutoff, m.cutoff); gl.uniform1f(u.shadeShift, m.shadeShift); gl.uniform1f(u.shadeToony, m.shadeToony); gl.uniform1f(u.outlineMix, m.outlineMix);
          gl.uniform3fv(u.color, m.color.slice(0, 3)); gl.uniform3fv(u.shadeColor, m.shadeColor.slice(0, 3)); gl.uniform3fv(u.outlineColor, m.outlineColor.slice(0, 3));
          gl.bindVertexArray(d.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.ib); gl.drawElements(gl.TRIANGLES, d.count, gl.UNSIGNED_SHORT, 0);
        }
        if (mirror && !depthOnly) gl.clear(gl.DEPTH_BUFFER_BIT);   // 逆さの姿は本体より奥なので、本体は上から描く
      }
      gl.colorMask(true, true, true, true); gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.frontFace(gl.CCW); gl.disable(gl.DEPTH_TEST);
      tCH.resolve(); tCH.mip();

      // 3. 重ねる
      gl.bindFramebuffer(gl.FRAMEBUFFER, tC.fb); gl.viewport(0, 0, w, h);
      gl.useProgram(compProg);
      const cu = (n) => gl.getUniformLocation(compProg, n);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tBG.tex); gl.uniform1i(cu('BG'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tCH.tex); gl.uniform1i(cu('CHR'), 1);
      gl.uniform2f(cu('R'), w, h); gl.uniform1f(cu('dof'), .45 + .35 * Math.max(0, Math.min(1, (3.7 - (hipsW[2] - camZ)) / .7)));   // 寄るほど背景をぼかす
      gl.drawArrays(gl.TRIANGLES, 0, 3); tC.mip();

      // 4. 仕上げ
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
      gl.useProgram(finalProg);
      const fu = (n) => gl.getUniformLocation(finalProg, n);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tC.tex); gl.uniform1i(fu('C'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tCH.tex); gl.uniform1i(fu('CHR'), 1);
      gl.uniform2f(fu('R'), w, h); gl.uniform2f(fu('sunUV'), (SUN[0] - shake[0]) / asp + .5, SUN[1] - shake[1] + .5);
      gl.uniform1f(fu('T'), t); gl.uniform1f(fu('fade'), dark); gl.uniform1f(fu('asp'), asp);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(frame);
  },
});
