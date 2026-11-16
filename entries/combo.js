/* 合わせ技の小品
 * 図鑑の小さな技（音・描画・保存・入力・時刻の計算など）を2つ以上組み合わせて、ひとまとまりの作品にしたもの */
dekiru.add({
  id: 'cb-music-visualizer', c: 'combo', lv: 3,
  t: '自動で作曲して光る音楽プレイヤー', y: 'じどうでさっきょくしてひかるおんがくぷれいやー',
  tags: ['自動作曲', 'Web Audio', '音の可視化', '粒子'],
  d: '和音の進行・ベース・太鼓・旋律を、その場で乱数を使って作りながら演奏する。音の強さを周波数ごとに測って円形の棒グラフにし、旋律の音が鳴るたびに音の高さに合わせた色の粒子がはじける。速さと調を変えられる。',
  p: '音を鳴らす予定を 0.1 秒先まで AudioContext の時計で組んでおく。画面の更新が遅れても、音のタイミングはずれない。',
  html: `<canvas id="c"></canvas><button id="go" class="go">▶ 演奏をはじめる</button><div class="ui"><label>速さ <input type="range" id="bpm" min="70" max="160" value="108"></label><button id="key">調を変える</button><span id="info"></span></div>`,
  css: `body { background: #05060a; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; }
    .go { position: fixed; left: 50%; top: 50%; translate: -50% -50%; padding: 12px 22px; border-radius: 999px; background: #fff; color: #111; font-weight: 800; border: 0; box-shadow: 0 0 30px #7af8; }
    .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 10px; align-items: center; color: #aab; font: 12px system-ui, sans-serif; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), $ = (id) => document.getElementById(id);
    let ac = null, an = null, master, noiseBuf, bins = new Uint8Array(256), next = 0, step = 0, root = 57, mel = 3, timer = 0;
    const NAMES = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'];
    const CHORDS = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    const events = [], P = [];
    const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
    function tone(m, t, dur, type, vol) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = mtof(m);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(t, f, dur, vol) { const s = ac.createBufferSource(), g = ac.createGain(), hp = ac.createBiquadFilter(); s.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(hp).connect(g).connect(master); s.start(t); s.stop(t + dur); }
    function kick(t) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g).connect(master); o.start(t); o.stop(t + 0.32); }
    // 0.1 秒先までの音を予約する。16分音符1つずつ、何を鳴らすかを決めていく
    function schedule() {
      const s16 = 60 / +$('bpm').value / 4;
      while (next < ac.currentTime + 0.1) {
        const bar = Math.floor(step / 16) % 4, k = step % 16, ch = CHORDS[bar].map((v) => v + root);
        if (k % 4 === 0) kick(next);
        if (k % 4 === 2) noise(next, 8000, 0.05, 0.12);
        if (k === 4 || k === 12) noise(next, 1800, 0.16, 0.3);
        if (k % 8 === 0) tone(ch[0] - 24, next, s16 * 7, 'triangle', 0.35);
        if (k % 2 === 0) tone(ch[(k / 2) % 3] + (k % 8 === 6 ? 12 : 0), next, s16 * 1.5, 'square', 0.04);
        if (k % 2 === 0 && Math.random() < 0.6) {
          mel = Math.max(0, Math.min(PENTA.length - 1, mel + [-2, -1, -1, 1, 1, 2][(Math.random() * 6) | 0]));
          const m = root + 12 + PENTA[mel];
          tone(m, next, s16 * 3, 'sine', 0.22);
          events.push({ t: next, m });
        }
        next += s16; step++;
      }
    }
    function start() {
      ac = new AudioContext();
      master = ac.createGain(); master.gain.value = 0.5;
      an = ac.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.8;
      master.connect(an); an.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      next = ac.currentTime + 0.05; timer = setInterval(schedule, 25);
    }
    $('go').onclick = () => {
      if (!ac) start();
      else if (ac.state === 'running') ac.suspend(); else ac.resume();
      setTimeout(() => { $('go').textContent = ac.state === 'running' ? '❚❚ 止める' : '▶ 続ける'; $('go').style.cssText = ac.state === 'running' ? 'top:auto;bottom:10px;translate:-50% 0;padding:6px 14px' : ''; }, 50);
    };
    $('key').onclick = () => { root = 52 + ((Math.random() * 10) | 0); };
    function burst(m) {
      const hue = ((m % 12) / 12) * 360, n = 26, R = Math.min(innerWidth, innerHeight) * 0.18;
      for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + Math.random() * 0.2, v = 2 + Math.random() * 3; P.push({ x: innerWidth / 2 + Math.cos(a) * R, y: innerHeight / 2 + Math.sin(a) * R, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue }); }
    }
    (function draw(t) {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      x.fillStyle = 'rgba(5,6,10,.28)'; x.fillRect(0, 0, W, H);
      if (an) an.getByteFrequencyData(bins);
      else for (let i = 0; i < bins.length; i++) bins[i] = window.THUMB ? 120 + 100 * Math.sin(t / 300 + i / 9) * Math.sin(t / 700 + i / 23) : 30 + 20 * Math.sin(t / 900 + i / 12);
      if (ac) while (events.length && events[0].t <= ac.currentTime) burst(events.shift().m);
      if (window.THUMB && !ac && Math.random() < 0.05) burst(60 + ((Math.random() * 24) | 0));
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.18, low = (bins[2] + bins[3] + bins[4]) / 765;
      x.globalCompositeOperation = 'lighter';
      const N = 96;
      for (let i = 0; i < N; i++) {
        const v = bins[Math.floor((i / N) * 160) + 2] / 255, a = (i / N) * 6.283 - 1.571, len = v * R * 1.4;
        x.strokeStyle = `hsl(${(i / N) * 360 + t / 50} 90% ${40 + v * 30}%)`; x.lineWidth = Math.max(2, (R * 6.283) / N - 3);
        x.beginPath(); x.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len)); x.stroke();
      }
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, R * (0.9 + low * 0.4)); g.addColorStop(0, `hsla(${t / 40}, 90%, 70%, ${0.25 + low * 0.5})`); g.addColorStop(1, 'transparent');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R * 1.3, 0, 7); x.fill();
      for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.x += p.vx; p.y += p.vy; p.vx *= 0.98; p.vy *= 0.98; p.life -= 0.012; if (p.life <= 0) { P.splice(i, 1); continue; } x.fillStyle = `hsla(${p.hue}, 100%, 65%, ${p.life})`; x.beginPath(); x.arc(p.x, p.y, 2 + p.life * 3, 0, 7); x.fill(); }
      x.globalCompositeOperation = 'source-over';
      $('info').textContent = `${NAMES[root % 12]}の調 ・ ${$('bpm').value} BPM`;
      requestAnimationFrame(draw);
    })(0);
    addEventListener('pagehide', () => clearInterval(timer));
  },
}, {
  id: 'cb-note-balls', c: 'combo', lv: 3,
  t: '線に当たると音が鳴る玉', y: 'せんにあたるとおとがなるたま',
  tags: ['物理', '音', '当たり判定', 'おもちゃ'],
  d: '上から落ちる玉が、ドラッグで引いた線に当たって跳ねるたびに音が鳴る。短い線ほど高い音になり、左右の位置で音の聞こえる向きも変わる。線を並べ方しだいで、玉が勝手に旋律を奏でる。ダブルクリックで線を消せる。',
  p: '玉と線の当たり判定は「線分上で玉の中心に一番近い点」までの距離が半径より小さいかどうか。跳ね返りはその点から玉へ向かう向きで速度を折り返す。',
  html: `<canvas id="c"></canvas><div class="ui"><label><input type="checkbox" id="auto" checked> 自動で落とす</label><button id="clear">線を全部消す</button><span>ドラッグで線を引く・クリックで玉</span></div>`,
  css: `body { background: #101418; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; touch-action: none; cursor: crosshair; } .ui { position: fixed; left: 8px; top: 8px; display: flex; gap: 10px; align-items: center; color: #9ab; font: 12px system-ui, sans-serif; flex-wrap: wrap; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    let segs = [[[0.18, 0.3], [0.42, 0.42], 0], [[0.5, 0.5], [0.78, 0.4], 0], [[0.22, 0.68], [0.5, 0.78], 0], [[0.62, 0.74], [0.84, 0.66], 0]];
    const balls = [];
    let ac = null, W = 1, H = 1, drawing = null;
    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
    function ping(len, pan) {
      if (!ac) return;
      const idx = Math.max(0, Math.min(PENTA.length - 1, Math.round((1 - Math.min(1, len / (Math.min(W, H) * 0.6))) * (PENTA.length - 1))));
      const f = 220 * 2 ** (PENTA[idx] / 12), t = ac.currentTime, o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner();
      o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.01;
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      p.pan.value = Math.max(-1, Math.min(1, pan));
      o.connect(g); o2.connect(g); g.connect(p).connect(ac.destination);
      o.start(t); o2.start(t); o.stop(t + 1.25); o2.stop(t + 1.25);
    }
    const drop = (px, py) => { if (balls.length < 60) balls.push({ x: px, y: py, vx: (Math.random() - 0.5) * 30, vy: 0, r: 7 + Math.random() * 5, hue: Math.random() * 360 }); };
    c.addEventListener('pointerdown', (e) => {
      ac = ac || new AudioContext();
      drawing = { a: [e.clientX, e.clientY], b: [e.clientX, e.clientY] }; c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => { if (drawing) drawing.b = [e.clientX, e.clientY]; });
    c.addEventListener('pointerup', () => {
      if (!drawing) return;
      const { a, b } = drawing; drawing = null;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 15) drop(a[0], a[1]);
      else segs.push([[a[0] / W, a[1] / H], [b[0] / W, b[1] / H], 0]);
    });
    c.addEventListener('dblclick', (e) => {
      let best = -1, bd = 20;
      segs.forEach(([a, b], i) => { const d = distToSeg(e.clientX, e.clientY, a[0] * W, a[1] * H, b[0] * W, b[1] * H).d; if (d < bd) { bd = d; best = i; } });
      if (best >= 0) segs.splice(best, 1);
    });
    document.getElementById('clear').onclick = () => { segs = []; };
    function distToSeg(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
      const qx = ax + t * dx, qy = ay + t * dy; return { d: Math.hypot(px - qx, py - qy), qx, qy };
    }
    let last = performance.now(), spawn = 0;
    (function loop(now) {
      W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const dt = Math.min(0.033, (now - last) / 1000); last = now;
      spawn += dt;
      if (document.getElementById('auto').checked && spawn > 0.9) { spawn = 0; drop(W * (0.25 + Math.random() * 0.1), 10); }
      for (let sub = 0; sub < 3; sub++) {
        const h = dt / 3;
        for (const b of balls) {
          b.vy += 900 * h; b.x += b.vx * h; b.y += b.vy * h;
          for (const s of segs) {
            const ax = s[0][0] * W, ay = s[0][1] * H, bx = s[1][0] * W, by = s[1][1] * H, q = distToSeg(b.x, b.y, ax, ay, bx, by);
            if (q.d >= b.r || q.d === 0) continue;
            const nx = (b.x - q.qx) / q.d, ny = (b.y - q.qy) / q.d, vn = b.vx * nx + b.vy * ny;
            b.x = q.qx + nx * b.r; b.y = q.qy + ny * b.r;
            if (vn < 0) { b.vx -= 1.85 * vn * nx; b.vy -= 1.85 * vn * ny; if (-vn > 60) { ping(Math.hypot(bx - ax, by - ay), (b.x / W) * 2 - 1); s[2] = 1; } }
          }
        }
      }
      for (let i = balls.length - 1; i >= 0; i--) if (balls[i].y > H + 40 || balls[i].x < -40 || balls[i].x > W + 40) balls.splice(i, 1);
      x.fillStyle = 'rgba(16,20,24,.5)'; x.fillRect(0, 0, W, H);
      x.lineCap = 'round';
      for (const s of segs) { s[2] *= 0.92; x.strokeStyle = `hsl(${180 + s[2] * 60} 80% ${55 + s[2] * 35}%)`; x.lineWidth = 4 + s[2] * 6; x.shadowColor = '#7ff'; x.shadowBlur = s[2] * 25; x.beginPath(); x.moveTo(s[0][0] * W, s[0][1] * H); x.lineTo(s[1][0] * W, s[1][1] * H); x.stroke(); }
      x.shadowBlur = 0;
      if (drawing) { x.strokeStyle = '#fff8'; x.setLineDash([6, 6]); x.lineWidth = 3; x.beginPath(); x.moveTo(...drawing.a); x.lineTo(...drawing.b); x.stroke(); x.setLineDash([]); }
      for (const b of balls) { x.fillStyle = `hsl(${b.hue} 85% 62%)`; x.beginPath(); x.arc(b.x, b.y, b.r, 0, 7); x.fill(); }
      x.fillStyle = '#9ab'; x.fillRect(W * 0.25, 0, W * 0.1, 6);
      requestAnimationFrame(loop);
    })(last);
  },
}, {
  id: 'cb-picture-book', c: 'combo', lv: 3,
  t: '読み上げてくれる飛び出す絵本', y: 'よみあげてくれるとびだすえほん',
  tags: ['絵本', '音声合成', 'CSS 3D', '読み上げ'],
  d: 'ページを開くと、寝ていた絵が順番に起き上がる飛び出す絵本。「読み上げる」を押すと、ブラウザの音声合成が文を読み、読んでいる所の字に色が付く。「自動でめくる」にすると最後のページまで読み聞かせを続ける。',
  p: '絵は rotateX で床に寝かせておき、ページが開いたら 0 度へ戻すだけ。読んでいる場所は、音声合成が出す boundary イベントの文字位置から分かる。',
  html: `
    <div class="book"><div class="pages" id="pages"></div>
      <div class="ctl"><button id="prev" aria-label="前のページ">◀</button><button id="read">読み上げる</button><label><input type="checkbox" id="auto"> 自動でめくる</label><span id="pg"></span><button id="next" aria-label="次のページ">▶</button></div></div>`,
  css: `
    body { background: #e9dfcf; overflow: hidden; height: 100vh; display: grid; place-items: center; }
    .book { width: min(96vw, 640px); height: min(94vh, 520px); background: #fffaf0; border-radius: 10px; box-shadow: 0 10px 30px #0003, inset 0 0 0 10px #f3e7d0; display: grid; grid-template-rows: 1fr auto; overflow: hidden; }
    .pages { position: relative; }
    .page { position: absolute; inset: 0; display: grid; grid-template-rows: 1fr auto; opacity: 0; translate: 30px 0; transition: opacity .5s, translate .5s; pointer-events: none; }
    .page.on { opacity: 1; translate: 0 0; pointer-events: auto; }
    .scene { position: relative; margin: 14px 14px 0; border-radius: 8px; perspective: 600px; perspective-origin: 50% -40%; overflow: hidden; }
    .pop { position: absolute; transform-origin: 50% 100%; transform: rotateX(84deg); transition: transform .8s cubic-bezier(.3, 1.6, .5, 1) calc(.3s + var(--d, 0) * .18s); }
    .page.on .pop { transform: rotateX(0deg); }
    .txt { margin: 0; padding: 12px 22px 8px; font: 700 clamp(16px, 3.4vw, 22px)/1.8 "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif; color: #3b2f22; min-height: 3.6em; }
    .txt span.now { color: #c23b22; } .txt span.done { color: #b5a58f; }
    .ctl { display: flex; gap: 8px; align-items: center; justify-content: center; padding: 8px; font-size: 13px; }
    .sun { width: 64px; height: 64px; border-radius: 50%; background: radial-gradient(#fff6c0, #ffb400); box-shadow: 0 0 40px #ffd34d; }
    .hill { border-radius: 50% 50% 0 0; }
    .knife { width: 30px; height: 96px; } .knife::before { content: ''; position: absolute; left: 4px; right: 4px; top: 0; height: 64%; background: linear-gradient(90deg, #f4f7fb, #aab4c2); clip-path: polygon(50% 0, 100% 22%, 100% 100%, 0 100%, 0 22%); }
    .knife::after { content: ''; position: absolute; left: 6px; right: 6px; bottom: 0; height: 36%; border-radius: 4px; background: #8a5a3a; box-shadow: inset 0 -6px #6b4329; }
    .eye { position: absolute; width: 4px; height: 6px; border-radius: 50%; background: #333; top: 34%; z-index: 1; }
    .bld { background: repeating-linear-gradient(#0000 0 8px, #ffe27a 8px 14px), #6d7a99; background-size: 100% 100%; border-radius: 3px 3px 0 0; box-shadow: inset 6px 0 #0001; }
    .pack { width: 34px; height: 60px; } .pack::before { content: ''; position: absolute; left: 6px; bottom: 0; width: 22px; height: 30px; border-radius: 11px 11px 0 0; background: #555; } .pack::after { content: ''; position: absolute; left: -8px; top: 0; width: 40px; height: 38px; border-radius: 6px; background: #b07d4f; }
    .star { width: 34px; height: 34px; background: #ffd34d; clip-path: polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); filter: drop-shadow(0 0 6px #fff6); }
    .note { font: 900 46px serif; color: #e0532f; }
    .cube { width: 50px; height: 50px; transform-style: preserve-3d; animation: spin 4s linear infinite; } @keyframes spin { to { transform: rotateX(360deg) rotateY(360deg); } } .cube i { position: absolute; inset: 0; border: 2px solid #26407c; background: #7aa2f7aa; }
    .cube i:nth-child(1) { transform: translateZ(25px); } .cube i:nth-child(2) { transform: rotateY(90deg) translateZ(25px); } .cube i:nth-child(3) { transform: rotateX(90deg) translateZ(25px); }
    .rainbow { width: 80%; height: 46%; border-radius: 50% 50% 0 0 / 100% 100% 0 0; background: radial-gradient(circle at 50% 100%, #0000 38%, #e8336d 38% 44%, #f0a43a 44% 50%, #ffd34d 50% 56%, #6abf4b 56% 62%, #3fb7e8 62% 68%, #7a5cff 68% 74%, #0000 74%); }`,
  js() {
    const knife = (left, bottom, d) => `<div class="pop knife" style="left:${left};bottom:${bottom};--d:${d}"><i class="eye" style="left:9px"></i><i class="eye" style="right:9px"></i></div>`;
    const PAGES = [
      { sky: 'linear-gradient(#8fd3ff, #dff4ff)', text: 'ちいさな ナイフの たび。', art: `<div class="pop sun" style="left:72%;top:12%;--d:0"></div><div class="pop hill" style="left:-10%;bottom:0;width:70%;height:38%;background:#6abf4b;--d:1"></div><div class="pop hill" style="right:-12%;bottom:0;width:70%;height:30%;background:#4f9a3a;--d:2"></div>${knife('46%', '20%', 3)}` },
      { sky: 'linear-gradient(#bcd0ea, #eef3fa)', text: 'まちには、おおきな にもつを せおった ひとが たくさん いました。', art: `<div class="pop bld" style="left:4%;bottom:0;width:16%;height:70%;--d:0"></div><div class="pop bld" style="left:22%;bottom:0;width:14%;height:52%;--d:1"></div><div class="pop bld" style="right:6%;bottom:0;width:18%;height:78%;--d:2"></div><div class="pop pack" style="left:44%;bottom:6%;--d:3"></div><div class="pop pack" style="left:60%;bottom:6%;--d:4"></div>${knife('78%', '6%', 5)}` },
      { sky: 'linear-gradient(#141a3a, #2b3a77)', text: 'ナイフは よぞらに、ひかりを えがきました。', art: `<div class="pop star" style="left:14%;top:14%;--d:0"></div><div class="pop star" style="left:40%;top:28%;--d:1"></div><div class="pop star" style="left:66%;top:10%;--d:2"></div><div class="pop star" style="left:82%;top:40%;--d:3"></div>${knife('46%', '8%', 4)}` },
      { sky: 'linear-gradient(#ffe7c2, #fff6e6)', text: 'おとを ならし、かたちを まわして みせました。', art: `<div class="pop note" style="left:14%;top:20%;--d:0">♪</div><div class="pop note" style="left:30%;top:6%;--d:1">♫</div><div class="pop" style="left:66%;top:22%;--d:2"><div class="cube"><i></i><i></i><i></i></div></div>${knife('46%', '8%', 3)}` },
      { sky: 'linear-gradient(#a9e4ff, #fff8e8)', text: 'ちいさくても、つなげれば とおくまで いける。おしまい。', art: `<div class="pop rainbow" style="left:10%;bottom:0;--d:0"></div><div class="pop hill" style="left:-10%;bottom:0;width:60%;height:22%;background:#6abf4b;--d:1"></div>${knife('30%', '14%', 2)}${knife('48%', '14%', 3)}${knife('66%', '14%', 4)}` },
    ];
    const box = document.getElementById('pages');
    box.innerHTML = PAGES.map((p) => `<section class="page" aria-hidden="true"><div class="scene" style="background:${p.sky}">${p.art}</div><p class="txt">${[...p.text].map((ch) => `<span>${ch}</span>`).join('')}</p></section>`).join('');
    const pages = [...box.children];
    let cur = 0;
    const can = 'speechSynthesis' in window;
    function go(i) {
      cur = Math.max(0, Math.min(PAGES.length - 1, i));
      pages.forEach((p, k) => { p.classList.toggle('on', k === cur); p.setAttribute('aria-hidden', k !== cur); p.querySelectorAll('span').forEach((s) => s.className = ''); });
      document.getElementById('pg').textContent = `${cur + 1} / ${PAGES.length}`;
    }
    function mark(from, len) { pages[cur].querySelectorAll('span').forEach((s, k) => { s.className = k < from ? 'done' : k < from + len ? 'now' : ''; }); }
    function speak() {
      if (!can) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(PAGES[cur].text);
      u.lang = 'ja-JP'; u.rate = 0.9;
      const v = speechSynthesis.getVoices().find((vv) => vv.lang.startsWith('ja')); if (v) u.voice = v;
      u.onstart = () => mark(0, 1);
      u.onboundary = (e) => mark(e.charIndex, e.charLength || 2);
      u.onend = () => { mark(PAGES[cur].text.length, 0); if (document.getElementById('auto').checked && cur < PAGES.length - 1) { setTimeout(() => { go(cur + 1); setTimeout(speak, 1100); }, 600); } };
      speechSynthesis.speak(u);
    }
    document.getElementById('read').onclick = speak;
    if (!can) { document.getElementById('read').disabled = true; document.getElementById('read').textContent = '読み上げは使えません'; }
    document.getElementById('prev').onclick = () => { if (can) speechSynthesis.cancel(); go(cur - 1); };
    document.getElementById('next').onclick = () => { if (can) speechSynthesis.cancel(); go(cur + 1); };
    addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); });
    requestAnimationFrame(() => go(0));
    if (window.THUMB) setInterval(() => go((cur + 1) % PAGES.length), 2600);
  },
}, {
  id: 'cb-rhythm-game', c: 'combo', lv: 3,
  t: '音に合わせて叩くリズムゲーム', y: 'おとにあわせてたたくりずむげーむ',
  tags: ['リズムゲーム', 'Web Audio', 'キーボード操作', '判定'],
  d: '4本の道を落ちてくる音符を、線に重なった瞬間に D・F・J・K のキー（スマホは道をタップ）で叩く。叩くとその音符の音が鳴り、自分で旋律を演奏しているように聞こえる。ずれの大きさで「ぴったり・よい・おしい」を判定し、連続成功数と点数を出す。',
  p: '時刻は画面の時計ではなく AudioContext.currentTime を使う。伴奏の音と判定の基準が同じ時計なので、ずれない。',
  html: `<canvas id="c"></canvas><div class="hud"><b id="score">0</b><span id="combo"></span></div><div class="ov" id="ov"><h1>リズムゲーム</h1><p>D F J K のキー、または道をタップ</p><label>ずれの補正 <input type="range" id="lat" min="-150" max="150" value="0"> <output id="latv">0</output> ms</label><button id="start">▶ はじめる</button><div id="result"></div></div>`,
  css: `body { background: #0c0a18; overflow: hidden; color: #fff; } canvas { width: 100vw; height: 100vh; display: block; touch-action: none; }
    .hud { position: fixed; right: 12px; top: 8px; text-align: right; font: 800 22px ui-monospace, monospace; } .hud span { display: block; font-size: 14px; color: #ffd166; }
    .ov { position: fixed; inset: 0; display: grid; place-content: center; justify-items: center; gap: 8px; background: #0c0a18cc; text-align: center; font: 14px system-ui, sans-serif; } .ov[hidden] { display: none; }
    .ov h1 { margin: 0; font-size: 28px; } .ov button { padding: 10px 24px; border-radius: 999px; border: 0; font-weight: 800; background: #ffd166; color: #222; } #result { font: 15px/1.7 ui-monospace, monospace; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), $ = (id) => document.getElementById(id);
    const KEYS = ['d', 'f', 'j', 'k'], BPM = 124, BEAT = 60 / BPM, COLORS = ['#ff5d8f', '#ffd166', '#4dd4ac', '#5aa9ff'];
    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
    let ac = null, t0 = 0, notes = [], score = 0, combo = 0, maxCombo = 0, counts, playing = false, pressed = [0, 0, 0, 0], fx = [], auto = !!window.THUMB, pt0 = performance.now() / 1000;
    function makeChart() {
      let s = 7, mel = 3;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const out = [];
      for (let k = 8; k < 8 + 16 * 8; k++) {
        const onBeat = k % 2 === 0, p = onBeat ? 0.72 : 0.3;
        if (rnd() > p) continue;
        mel = Math.max(0, Math.min(7, mel + [-2, -1, 1, 2][(rnd() * 4) | 0]));
        out.push({ time: (k * BEAT) / 2, lane: mel % 4, m: 64 + PENTA[mel], hit: null });
        if (onBeat && k % 8 === 0 && rnd() < 0.3) out.push({ time: (k * BEAT) / 2, lane: (mel + 2) % 4, m: 64 + PENTA[Math.max(0, mel - 2)], hit: null });
      }
      return out;
    }
    const tone = (m, when, dur, type, vol) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = 440 * 2 ** ((m - 69) / 12); g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.001, when + dur); o.connect(g).connect(ac.destination); o.start(when); o.stop(when + dur + 0.02); };
    function start() {
      ac = ac || new AudioContext();
      notes = makeChart(); score = 0; combo = 0; maxCombo = 0; counts = { ぴったり: 0, よい: 0, おしい: 0, ミス: 0 };
      t0 = ac.currentTime + 1.2; playing = true; $('ov').hidden = true;
      const end = notes[notes.length - 1].time + 2;
      // 伴奏は最初に全部予約しておく
      for (let b = 0; b * BEAT < end; b++) {
        const t = t0 + b * BEAT, o = ac.createOscillator(), g = ac.createGain();
        o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.26);
        if (b % 4 === 0) tone([40, 45, 41, 43][(b / 4) % 4], t, BEAT * 3.8, 'triangle', 0.25);
      }
    }
    const now = () => (auto ? performance.now() / 1000 - pt0 : ac ? ac.currentTime - t0 - +$('lat').value / 1000 : -1);
    function judge(lane) {
      pressed[lane] = 1;
      if (!playing && !auto) return;
      const t = now();
      let best = null;
      for (const n of notes) if (!n.hit && n.lane === lane && Math.abs(n.time - t) < 0.15 && (!best || Math.abs(n.time - t) < Math.abs(best.time - t))) best = n;
      if (!best) return;
      const d = Math.abs(best.time - t), j = d < 0.045 ? 'ぴったり' : d < 0.09 ? 'よい' : 'おしい';
      best.hit = j; counts && counts[j]++; combo++; maxCombo = Math.max(maxCombo, combo); score += { ぴったり: 100, よい: 70, おしい: 40 }[j] + Math.min(combo, 50);
      if (ac && !auto) tone(best.m, ac.currentTime, 0.4, 'sine', 0.3);
      fx.push({ lane, j, life: 1 });
    }
    addEventListener('keydown', (e) => { const l = KEYS.indexOf(e.key.toLowerCase()); if (l >= 0 && !e.repeat) judge(l); });
    c.addEventListener('pointerdown', (e) => judge(Math.min(3, Math.floor((e.clientX / innerWidth) * 4))));
    $('start').onclick = start;
    $('lat').oninput = () => { $('latv').textContent = $('lat').value; };
    if (auto) { $('ov').hidden = true; notes = makeChart(); counts = { ぴったり: 0, よい: 0, おしい: 0, ミス: 0 }; playing = true; }
    (function draw() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const t = now(), lw = W / 4, jy = H * 0.85, speed = H * 0.75;
      x.fillStyle = '#0c0a18'; x.fillRect(0, 0, W, H);
      for (let l = 0; l < 4; l++) {
        const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0000'); g.addColorStop(1, COLORS[l] + (pressed[l] > 0.1 ? '55' : '18'));
        x.fillStyle = g; x.fillRect(l * lw + 2, 0, lw - 4, H); pressed[l] *= 0.85;
        x.fillStyle = '#fff6'; x.font = `700 ${Math.min(24, lw / 3)}px ui-monospace, monospace`; x.textAlign = 'center'; x.fillText(KEYS[l].toUpperCase(), l * lw + lw / 2, H - 14);
      }
      x.fillStyle = '#fff'; x.fillRect(0, jy - 2, W, 4);
      if (playing) {
        for (const n of notes) {
          if (!n.hit && t - n.time > 0.15) { n.hit = 'ミス'; counts.ミス++; combo = 0; fx.push({ lane: n.lane, j: 'ミス', life: 1 }); }
          if (auto && !n.hit && t >= n.time) judge(n.lane);
          if (n.hit) continue;
          const y = jy - (n.time - t) * speed;
          if (y < -30 || y > H + 30) continue;
          x.fillStyle = COLORS[n.lane]; x.shadowColor = COLORS[n.lane]; x.shadowBlur = 14;
          x.beginPath(); x.roundRect(n.lane * lw + 8, y - 10, lw - 16, 20, 8); x.fill(); x.shadowBlur = 0;
        }
        if (notes.length && t > notes[notes.length - 1].time + 1.5) {
          if (auto) { pt0 = performance.now() / 1000; notes = makeChart(); score = 0; combo = 0; }
          else {
            playing = false; $('ov').hidden = false;
            const total = notes.length, rate = (counts.ぴったり + counts.よい * 0.7 + counts.おしい * 0.4) / total;
            $('result').innerHTML = `点数 ${score} ・ 最大の連続 ${maxCombo}<br>ぴったり ${counts.ぴったり} ／ よい ${counts.よい} ／ おしい ${counts.おしい} ／ ミス ${counts.ミス}<br>評価 <b>${rate > 0.92 ? 'S' : rate > 0.8 ? 'A' : rate > 0.6 ? 'B' : 'C'}</b>`;
            $('start').textContent = '▶ もう一度';
          }
        }
      }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.life -= 0.03; if (f.life <= 0) { fx.splice(i, 1); continue; }
        x.globalAlpha = f.life; x.strokeStyle = COLORS[f.lane]; x.lineWidth = 3; x.beginPath(); x.arc(f.lane * lw + lw / 2, jy, (1 - f.life) * lw * 0.6 + 10, 0, 7); x.stroke();
        x.fillStyle = f.j === 'ミス' ? '#888' : '#fff'; x.font = `800 ${Math.min(20, lw / 4)}px system-ui, sans-serif`; x.fillText(f.j, f.lane * lw + lw / 2, jy - 30 - (1 - f.life) * 30);
        x.globalAlpha = 1;
      }
      $('score').textContent = score; $('combo').textContent = combo > 1 ? `${combo} 連続` : '';
      requestAnimationFrame(draw);
    })();
  },
}, {
  id: 'cb-home-widgets', c: 'combo', lv: 3, so: 1,
  t: '並べ替えられるウィジェットの画面', y: 'ならべかえられるうぃじぇっとのがめん',
  tags: ['ウィジェット', 'ドラッグ＆ドロップ', 'コンテナクエリ', 'Intl'],
  d: '時計・カレンダー・月の満ち欠け・世界の時刻・やること・メモ・今年の残りを、スマホのホーム画面のように並べた。見出しをドラッグするか ◀ ▶ ボタンで並べ替えられ、並び順・やること・メモはブラウザに保存される。部品の幅に合わせて中身の並びが変わる。',
  p: '部品ごとに container-type を付けると、画面の幅ではなく「その部品の幅」で見た目を切り替えられる。並びを変えても中身が崩れない。',
  html: `<main class="board" id="board">
      <section class="w" data-k="clock"><header>時計</header><div class="clock"><svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="47" class="face"/><g id="ticks"></g><line id="hh" y2="-24" class="h"/><line id="mm" y2="-36" class="m"/><line id="ss" y2="-40" class="s"/><circle r="2.5"/></svg><div><b id="dig"></b><small id="date"></small></div></div></section>
      <section class="w wide" data-k="cal"><header>カレンダー <span class="nav"><button id="cp" aria-label="前の月">‹</button><button id="cn" aria-label="次の月">›</button></span></header><div id="cal"></div></section>
      <section class="w" data-k="moon"><header>月の満ち欠け</header><div class="moon"><svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="40" fill="#2a2f45"/><path id="lit" fill="#ffe9a8"/></svg><div><b id="mname"></b><small id="mage"></small></div></div></section>
      <section class="w" data-k="world"><header>世界の時刻</header><ul id="world" class="world"></ul></section>
      <section class="w tall" data-k="todo"><header>やること</header><form id="tf"><input id="ti" placeholder="足す" aria-label="やることを足す"></form><ul id="todo" class="todo"></ul></section>
      <section class="w" data-k="memo"><header>メモ</header><textarea id="memo" aria-label="メモ" placeholder="ここに書くと保存されます"></textarea></section>
      <section class="w" data-k="year"><header>今年の進み具合</header><div class="year"><b id="ypct"></b><div class="bar"><i id="ybar"></i></div><small id="yleft"></small></div></section>
    </main>`,
  css: `
    body { background: linear-gradient(135deg, #3a4a7a, #a05a7a); min-height: 100vh; font-family: system-ui, sans-serif; }
    .board { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); grid-auto-rows: 160px; grid-auto-flow: dense; gap: 12px; padding: 12px; }
    .w { container-type: inline-size; background: #ffffffd9; backdrop-filter: blur(8px); border-radius: 18px; padding: 8px 12px; box-shadow: 0 6px 20px #0003; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
    .w.wide { grid-column: span 2; } .w.tall { grid-row: span 2; } .w.dragging { opacity: .4; } .w.over { outline: 3px dashed #fff; }
    header { font: 700 12px system-ui, sans-serif; color: #666; display: flex; justify-content: space-between; align-items: center; cursor: grab; gap: 4px; }
    header .mv { border: 0; background: none; padding: 0 3px; color: #999; font-size: 11px; }
    .clock, .moon { flex: 1; display: flex; align-items: center; gap: 8px; } .clock svg, .moon svg { height: 100%; max-height: 110px; aspect-ratio: 1; }
    .clock div, .moon div { display: grid; } .clock b { font: 800 20px ui-monospace, monospace; } small { color: #777; font-size: 11px; }
    .face { fill: #fff; stroke: #ddd; } .h, .m { stroke: #333; stroke-linecap: round; } .h { stroke-width: 4; } .m { stroke-width: 2.5; } .s { stroke: #c23b22; stroke-width: 1; } #ticks line { stroke: #bbb; }
    @container (width < 230px) { .clock, .moon { flex-direction: column; justify-content: center; gap: 2px; text-align: center; } .clock svg, .moon svg { max-height: 80px; } }
    #cal table { width: 100%; border-collapse: collapse; font: 12px ui-monospace, monospace; text-align: center; } #cal caption { font-weight: 700; text-align: left; } #cal td { padding: 1px 0; } #cal .today { background: #c23b22; color: #fff; border-radius: 50%; } #cal .sun { color: #c23b22; } #cal .sat { color: #26407c; }
    .world { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 4px; font-size: 13px; } .world li { display: flex; justify-content: space-between; } .world b { font-family: ui-monospace, monospace; }
    #tf input { width: 100%; margin: 4px 0; } .todo { list-style: none; margin: 0; padding: 0; overflow: auto; font-size: 13px; } .todo li { display: flex; gap: 6px; align-items: center; padding: 2px 0; } .todo li.done span { text-decoration: line-through; color: #aaa; } .todo button { margin-left: auto; border: 0; background: none; color: #c23b22; }
    textarea { flex: 1; resize: none; border: 0; background: #fffbe6; border-radius: 8px; padding: 6px; font-size: 13px; margin-top: 4px; }
    .year { flex: 1; display: grid; align-content: center; gap: 6px; } .year b { font: 800 28px ui-monospace, monospace; } .bar { height: 10px; border-radius: 5px; background: #eee; overflow: hidden; } .bar i { display: block; height: 100%; background: linear-gradient(90deg, #f0a43a, #c23b22); }`,
  js() {
    const $ = (id) => document.getElementById(id), board = $('board'), KEY = 'dekiru-widgets';
    let st;
    try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { st = {}; }
    st.todo = st.todo || [{ t: '図鑑の立体を見る', done: true }, { t: 'ウィジェットを並べ替える', done: false }];
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* 保存できない */ } };
    // 並び順
    const widgets = () => [...board.children];
    if (st.order) st.order.forEach((k) => { const w = board.querySelector(`[data-k="${k}"]`); if (w) board.append(w); });
    const saveOrder = () => { st.order = widgets().map((w) => w.dataset.k); save(); };
    for (const w of widgets()) {
      const h = w.querySelector('header');
      h.insertAdjacentHTML('beforeend', '<span><button class="mv" data-d="-1" aria-label="前へ移動">◀</button><button class="mv" data-d="1" aria-label="後ろへ移動">▶</button></span>');
      h.draggable = true;
      h.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', w.dataset.k); e.dataTransfer.effectAllowed = 'move'; w.classList.add('dragging'); });
      h.addEventListener('dragend', () => { w.classList.remove('dragging'); widgets().forEach((v) => v.classList.remove('over')); });
      w.addEventListener('dragover', (e) => { e.preventDefault(); w.classList.add('over'); });
      w.addEventListener('dragleave', () => w.classList.remove('over'));
      w.addEventListener('drop', (e) => {
        e.preventDefault(); w.classList.remove('over');
        const from = board.querySelector(`[data-k="${e.dataTransfer.getData('text/plain')}"]`);
        if (!from || from === w) return;
        const list = widgets(); board.insertBefore(from, list.indexOf(from) < list.indexOf(w) ? w.nextSibling : w); saveOrder();
      });
    }
    board.addEventListener('click', (e) => {
      const b = e.target.closest('.mv'); if (!b) return;
      const w = b.closest('.w'), list = widgets(), i = list.indexOf(w), j = i + +b.dataset.d;
      if (j < 0 || j >= list.length) return;
      board.insertBefore(w, +b.dataset.d < 0 ? list[j] : list[j].nextSibling); saveOrder(); b.focus();
    });
    // 時計
    $('ticks').innerHTML = Array.from({ length: 12 }, (_, i) => `<line y1="-41" y2="-46" transform="rotate(${i * 30})"/>`).join('');
    // 世界の時刻（Intl の timeZone で、その土地の時刻を出す）
    const ZONES = [['東京', 'Asia/Tokyo'], ['ロンドン', 'Europe/London'], ['ニューヨーク', 'America/New_York'], ['シドニー', 'Australia/Sydney']];
    const fmt = ZONES.map(([, z]) => new Intl.DateTimeFormat('ja-JP', { timeZone: z, hour: '2-digit', minute: '2-digit', weekday: 'short' }));
    function tick() {
      const d = new Date(), s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      $('hh').setAttribute('transform', `rotate(${h * 30})`); $('mm').setAttribute('transform', `rotate(${m * 6})`); $('ss').setAttribute('transform', `rotate(${s * 6})`);
      $('dig').textContent = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      $('date').textContent = d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
      $('world').innerHTML = ZONES.map(([n], i) => `<li><span>${n}</span><b>${fmt[i].format(d)}</b></li>`).join('');
      const y0 = new Date(d.getFullYear(), 0, 1), y1 = new Date(d.getFullYear() + 1, 0, 1), pct = ((d - y0) / (y1 - y0)) * 100;
      $('ypct').textContent = pct.toFixed(2) + '%'; $('ybar').style.width = pct + '%';
      $('yleft').textContent = `${d.getFullYear()}年はあと ${Math.ceil((y1 - d) / 864e5)} 日`;
      // 月齢: 2000年1月6日 18:14（世界時）の新月から、朔望月 29.53 日で割った余り
      const age = (((d - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530588853 + 29.530588853) % 29.530588853, p = age / 29.530588853, k = Math.cos(2 * Math.PI * p), rx = Math.abs(k) * 40;
      const wax = p < 0.5;
      $('lit').setAttribute('d', `M0 -40 A40 40 0 0 ${wax ? 1 : 0} 0 40 A${rx} 40 0 0 ${wax ? (k > 0 ? 0 : 1) : k > 0 ? 1 : 0} 0 -40`);
      $('mname').textContent = age < 1.5 ? '新月' : age < 5.5 ? '三日月' : age < 9 ? '上弦の月' : age < 13.5 ? '十三夜' : age < 16.5 ? '満月' : age < 21 ? '寝待月' : age < 24.5 ? '下弦の月' : age < 28 ? '有明月' : '新月';
      $('mage').textContent = `月齢 ${age.toFixed(1)}`;
    }
    // カレンダー（日付は年・月・日の数として扱う）
    const now = new Date();
    let cy = now.getFullYear(), cm = now.getMonth();
    function cal() {
      const first = new Date(cy, cm, 1).getDay(), days = new Date(cy, cm + 1, 0).getDate(), cells = [];
      for (let i = 0; i < first; i++) cells.push('<td></td>');
      for (let d = 1; d <= days; d++) { const w = (first + d - 1) % 7, today = cy === now.getFullYear() && cm === now.getMonth() && d === now.getDate(); cells.push(`<td class="${today ? 'today' : ''} ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}">${d}</td>`); }
      const rows = []; for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
      $('cal').innerHTML = `<table><caption>${cy}年${cm + 1}月</caption><tr>${'日月火水木金土'.split('').map((w, i) => `<th class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</th>`).join('')}</tr>${rows.join('')}</table>`;
    }
    $('cp').onclick = () => { cm--; if (cm < 0) { cm = 11; cy--; } cal(); };
    $('cn').onclick = () => { cm++; if (cm > 11) { cm = 0; cy++; } cal(); };
    // やること
    function todo() {
      $('todo').innerHTML = st.todo.map((t, i) => `<li class="${t.done ? 'done' : ''}"><input type="checkbox" data-i="${i}" ${t.done ? 'checked' : ''} aria-label="済み"><span></span><button data-x="${i}" aria-label="消す">✕</button></li>`).join('');
      [...$('todo').children].forEach((li, i) => { li.querySelector('span').textContent = st.todo[i].t; });
    }
    $('tf').addEventListener('submit', (e) => { e.preventDefault(); const v = $('ti').value.trim(); if (v) { st.todo.push({ t: v, done: false }); $('ti').value = ''; save(); todo(); } });
    $('todo').addEventListener('change', (e) => { const i = e.target.dataset.i; if (i !== undefined) { st.todo[i].done = e.target.checked; save(); todo(); } });
    $('todo').addEventListener('click', (e) => { const i = e.target.dataset.x; if (i !== undefined) { st.todo.splice(+i, 1); save(); todo(); } });
    $('memo').value = st.memo || '';
    let mt = 0; $('memo').addEventListener('input', () => { clearTimeout(mt); mt = setTimeout(() => { st.memo = $('memo').value; save(); }, 400); });
    tick(); cal(); todo();
    setInterval(tick, 1000);
  },
}, {
  id: 'cb-node-editor', c: 'combo', lv: 3,
  t: '線でつなぐ部品で絵を動かす', y: 'せんでつなぐぶひんでえをうごかす',
  tags: ['ノードエディタ', 'ビジュアルプログラミング', 'SVG', 'ドラッグ'],
  d: '「時間」「数」「掛ける」「sin」などの部品を線でつなぐと、右の画面の点が動き出す。部品の出口（右の丸）から入口（左の丸）へドラッグしてつなぎ、線をクリックすると外れる。つなぎ方を変えると、軌跡がその場で変わる。',
  p: '毎フレーム、出力の部品から入口をたどって値を計算する。一度計算した部品の値は覚えておき、同じフレームでは使い回す。',
  html: `<div class="ne"><div class="bar" id="bar"></div><div class="work" id="work"><svg id="wires"></svg></div><canvas id="out" aria-label="結果"></canvas></div>`,
  css: `
    body { background: #1b1e26; color: #dde; overflow: hidden; font: 12px system-ui, sans-serif; }
    .ne { height: 100vh; display: grid; grid-template: auto 1fr / 1fr minmax(160px, 34%); }
    .bar { grid-column: 1 / -1; display: flex; gap: 4px; padding: 6px; flex-wrap: wrap; background: #14161c; } .bar button { font-size: 12px; }
    .work { position: relative; overflow: auto; background: radial-gradient(#ffffff10 1px, transparent 1px) 0 0 / 20px 20px; touch-action: none; }
    #wires { position: absolute; left: 0; top: 0; width: 1400px; height: 900px; overflow: visible; }
    #wires path { fill: none; stroke-width: 3; } #wires path.hit { stroke: transparent; stroke-width: 14; cursor: pointer; }
    .node { position: absolute; min-width: 110px; background: #2b2f3a; border: 1px solid #454b5c; border-radius: 8px; box-shadow: 0 4px 12px #0006; user-select: none; }
    .node header { padding: 4px 8px; font-weight: 700; border-radius: 8px 8px 0 0; cursor: grab; display: flex; justify-content: space-between; gap: 6px; }
    .node header button { border: 0; background: none; color: #fff9; padding: 0 2px; }
    .node .row { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 2px 0; min-height: 20px; }
    .port { display: flex; align-items: center; gap: 4px; } .port i { width: 12px; height: 12px; border-radius: 50%; background: #9ab; border: 2px solid #1b1e26; cursor: crosshair; }
    .port.in i { margin-left: -7px; } .port.out i { margin-right: -7px; }
    .node input { width: 64px; margin: 2px 8px; } .val { color: #ffd166; font-family: ui-monospace, monospace; padding-right: 2px; }
    canvas { width: 100%; height: 100%; display: block; background: #0b0c10; }
    @media (width < 600px) { .ne { grid-template: auto 1fr 40% / 1fr; } }`,
  js() {
    const TYPES = {
      time: { name: '時間', col: '#26407c', ins: [], outs: ['t'], f: (_, n, T) => [T] },
      num: { name: '数', col: '#2f855a', ins: [], outs: ['値'], f: (_, n) => [n.v] },
      add: { name: '足す', col: '#7a5cff', ins: [['a', 0], ['b', 0]], outs: ['和'], f: ([a, b]) => [a + b] },
      mul: { name: '掛ける', col: '#7a5cff', ins: [['a', 1], ['b', 1]], outs: ['積'], f: ([a, b]) => [a * b] },
      sin: { name: 'sin', col: '#b7791f', ins: [['x', 0]], outs: ['値'], f: ([v]) => [Math.sin(v)] },
      cos: { name: 'cos', col: '#b7791f', ins: [['x', 0]], outs: ['値'], f: ([v]) => [Math.cos(v)] },
      out: { name: '点を描く', col: '#c23b22', ins: [['x', 0], ['y', 0], ['大きさ', 6], ['色相', 200]], outs: [], f: (v) => { draws.push(v); return []; } },
    };
    let nodes = [], links = [], uid = 1, draws = [];
    const add = (type, x, y, v = 1) => { const n = { id: uid++, type, x, y, v }; nodes.push(n); return n; };
    const link = (a, o, b, i) => { links = links.filter((l) => !(l.to[0] === b.id && l.to[1] === i)); links.push({ from: [a.id, o], to: [b.id, i] }); };
    // 最初から動く見本: x = sin(t×速さ), y = sin(t×速さ×比), 色相 = t×60
    const t = add('time', 20, 30), sp = add('num', 20, 120, 1.3), m1 = add('mul', 170, 60), s1 = add('sin', 330, 40), r = add('num', 170, 170, 2), m2 = add('mul', 330, 130), s2 = add('sin', 480, 130), k = add('num', 20, 220, 60), m3 = add('mul', 170, 250), o = add('out', 640, 70);
    link(t, 0, m1, 0); link(sp, 0, m1, 1); link(m1, 0, s1, 0); link(s1, 0, o, 0); link(m1, 0, m2, 0); link(r, 0, m2, 1); link(m2, 0, s2, 0); link(s2, 0, o, 1); link(t, 0, m3, 0); link(k, 0, m3, 1); link(m3, 0, o, 3);
    const work = document.getElementById('work'), svg = document.getElementById('wires'), out = document.getElementById('out'), ox = out.getContext('2d');
    function render() {
      work.querySelectorAll('.node').forEach((e) => e.remove());
      for (const n of nodes) {
        const T = TYPES[n.type], el = document.createElement('div');
        el.className = 'node'; el.dataset.id = n.id; el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
        el.innerHTML = `<header style="background:${T.col}">${T.name}<button aria-label="消す">×</button></header>` +
          (n.type === 'num' ? `<input type="number" step="0.1" value="${n.v}" aria-label="値">` : '') +
          T.ins.map(([nm], i) => `<div class="row"><span class="port in" data-i="${i}"><i></i>${nm}</span></div>`).join('') +
          T.outs.map((nm, i) => `<div class="row"><span class="val"></span><span class="port out" data-o="${i}">${nm}<i></i></span></div>`).join('');
        work.append(el);
      }
    }
    const nodeEl = (id) => work.querySelector(`.node[data-id="${id}"]`);
    const portPos = (id, sel) => { const p = nodeEl(id)?.querySelector(sel + ' i'); if (!p) return null; const r = p.getBoundingClientRect(), w = work.getBoundingClientRect(); return [r.left + r.width / 2 - w.left + work.scrollLeft, r.top + r.height / 2 - w.top + work.scrollTop]; };
    const curve = (a, b) => { const dx = Math.max(40, Math.abs(b[0] - a[0]) / 2); return `M${a[0]} ${a[1]} C${a[0] + dx} ${a[1]} ${b[0] - dx} ${b[1]} ${b[0]} ${b[1]}`; };
    let temp = null, drag = null;
    function wires() {
      let s = '';
      links.forEach((l, i) => { const a = portPos(l.from[0], `.port.out[data-o="${l.from[1]}"]`), b = portPos(l.to[0], `.port.in[data-i="${l.to[1]}"]`); if (a && b) { const d = curve(a, b); s += `<path d="${d}" stroke="#9ab"/><path class="hit" d="${d}" data-l="${i}"/>`; } });
      if (temp) s += `<path d="${curve(temp.a, temp.b)}" stroke="#ffd166" stroke-dasharray="6 4"/>`;
      svg.innerHTML = s;
    }
    work.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.node');
      if (e.target.closest('.port.out i')) { const p = e.target.closest('.port'); temp = { from: [+el.dataset.id, +p.dataset.o], a: portPos(+el.dataset.id, `.port.out[data-o="${p.dataset.o}"]`) }; temp.b = temp.a; work.setPointerCapture(e.pointerId); return; }
      if (e.target.closest('header') && !e.target.closest('button')) { const n = nodes.find((v) => v.id === +el.dataset.id); drag = { n, el, dx: e.clientX - n.x, dy: e.clientY - n.y }; work.setPointerCapture(e.pointerId); }
    });
    work.addEventListener('pointermove', (e) => {
      if (temp) { const w = work.getBoundingClientRect(); temp.b = [e.clientX - w.left + work.scrollLeft, e.clientY - w.top + work.scrollTop]; }
      if (drag) { drag.n.x = Math.max(0, e.clientX - drag.dx); drag.n.y = Math.max(0, e.clientY - drag.dy); drag.el.style.left = drag.n.x + 'px'; drag.el.style.top = drag.n.y + 'px'; }
    });
    work.addEventListener('pointerup', (e) => {
      if (temp) {
        const hit = document.elementFromPoint(e.clientX, e.clientY), p = hit && hit.closest('.port.in');
        if (p) { const to = +p.closest('.node').dataset.id; if (to !== temp.from[0]) { links = links.filter((l) => !(l.to[0] === to && l.to[1] === +p.dataset.i)); links.push({ from: temp.from, to: [to, +p.dataset.i] }); } }
        temp = null;
      }
      drag = null;
    });
    work.addEventListener('click', (e) => {
      if (e.target.matches('path.hit')) { links.splice(+e.target.dataset.l, 1); return; }
      if (e.target.matches('header button')) { const id = +e.target.closest('.node').dataset.id; nodes = nodes.filter((n) => n.id !== id); links = links.filter((l) => l.from[0] !== id && l.to[0] !== id); render(); }
    });
    work.addEventListener('input', (e) => { if (e.target.matches('input')) nodes.find((n) => n.id === +e.target.closest('.node').dataset.id).v = +e.target.value || 0; });
    const bar = document.getElementById('bar');
    bar.innerHTML = Object.entries(TYPES).map(([k, T]) => `<button data-t="${k}">＋ ${T.name}</button>`).join('') + '<button id="wipe">点の跡を消す</button>';
    bar.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { add(b.dataset.t, 30 + work.scrollLeft + Math.random() * 60, 30 + work.scrollTop + Math.random() * 60); render(); } if (e.target.id === 'wipe') ox.clearRect(0, 0, out.width, out.height); });
    render();
    (function frame(ms) {
      const T = ms / 1000, cache = new Map(), busy = new Set();
      draws = [];
      // 値の計算: 入口につながった部品を先に計算する。輪になっていたら 0 として止める
      function val(id) {
        if (cache.has(id)) return cache.get(id);
        if (busy.has(id)) return [];
        busy.add(id);
        const n = nodes.find((v) => v.id === id), D = TYPES[n.type];
        const ins = D.ins.map(([, def], i) => { const l = links.find((q) => q.to[0] === id && q.to[1] === i); return l ? (val(l.from[0])[l.from[1]] ?? 0) : def; });
        const r = D.f(ins, n, T); cache.set(id, r); busy.delete(id); return r;
      }
      nodes.forEach((n) => val(n.id));
      for (const n of nodes) { const el = nodeEl(n.id); if (!el) continue; const r = cache.get(n.id) || []; el.querySelectorAll('.val').forEach((v, i) => { v.textContent = typeof r[i] === 'number' ? r[i].toFixed(2) : ''; }); }
      const W = Math.max(1, out.clientWidth), H = Math.max(1, out.clientHeight);
      if (out.width !== W || out.height !== H) { out.width = W; out.height = H; }
      ox.fillStyle = 'rgba(11,12,16,.06)'; ox.fillRect(0, 0, W, H);
      for (const [px, py, size, hue] of draws) { ox.fillStyle = `hsl(${hue % 360} 90% 60%)`; ox.beginPath(); ox.arc(W / 2 + px * W * 0.4, H / 2 - py * H * 0.4, Math.max(0.5, Math.abs(size)), 0, 7); ox.fill(); }
      wires();
      requestAnimationFrame(frame);
    })(0);
  },
}, {
  id: 'cb-paint-replay', c: 'combo', lv: 3, so: 1,
  t: '描いた手順を再生できるお絵かき', y: 'かいたてじゅんをさいせいできるおえかき',
  tags: ['お絵かき', '記録と再生', 'Pointer Events', '筆圧'],
  d: 'ペン・マーカー・光るペンで描いた線を、点の位置と時刻ごと記録しておき、「再生」で描いた順番どおりに描き直して見せる。速さを変えたり、つまみで好きな時点に飛んだりできる。筆圧に対応したペンでは線の太さも変わる。',
  p: '保存しているのは画像ではなく「どの時刻にどこを通ったか」の列。線と線の間の待ち時間は最大 0.3 秒に縮めて、再生が間延びしないようにしている。',
  html: `<div class="pr"><div class="bar"><select id="tool" aria-label="道具"><option value="pen">ペン</option><option value="marker">マーカー</option><option value="neon">光るペン</option></select><input type="color" id="col" value="#26407c" aria-label="色"><input type="range" id="size" min="1" max="30" value="6" aria-label="太さ"><button id="undo">1本戻す</button><button id="clear">全部消す</button><span class="sp"></span><button id="play">▶ 再生</button><select id="speed" aria-label="再生の速さ"><option value="1">等速</option><option value="2" selected>2倍</option><option value="4">4倍</option></select></div><canvas id="c"></canvas><input type="range" id="seek" min="0" max="1000" value="1000" aria-label="再生の位置"></div>`,
  css: `body { background: #f1efe9; overflow: hidden; } .pr { height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; } .bar { display: flex; gap: 6px; align-items: center; padding: 6px; flex-wrap: wrap; font-size: 12px; } .sp { flex: 1; }
    canvas { width: 100%; height: 100%; background: #fff; touch-action: none; cursor: crosshair; display: block; } #seek { width: calc(100% - 16px); margin: 6px 8px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), $ = (id) => document.getElementById(id), KEY = 'dekiru-replay';
    let strokes = [], cur = null, playT = null, total = 0, plan = [];
    try { strokes = JSON.parse(localStorage.getItem(KEY)) || []; } catch { strokes = []; }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(strokes)); } catch { /* 保存できない */ } };
    function fit() { const r = c.getBoundingClientRect(); c.width = Math.max(1, r.width); c.height = Math.max(1, r.height); drawUpTo(Infinity); }
    // 再生の時刻表: 線ごとの開始時刻（線の間の待ちは最大 0.3 秒）
    function timeline() { let t = 0; plan = strokes.map((s) => { const start = t, dur = s.pts[s.pts.length - 1][2] - s.pts[0][2]; t += dur + 300; return start; }); total = Math.max(1, t); }
    function drawStroke(s, upTo) {
      const W = c.width, H = c.height, t0 = s.pts[0][2];
      x.save(); x.lineCap = x.lineJoin = 'round'; x.strokeStyle = s.col;
      if (s.tool === 'marker') { x.globalAlpha = 0.35; x.globalCompositeOperation = 'multiply'; }
      if (s.tool === 'neon') { x.shadowColor = s.col; x.shadowBlur = s.size * 2; }
      for (let i = 1; i < s.pts.length; i++) {
        const [ax, ay] = s.pts[i - 1], [bx, by, bt, bp] = s.pts[i];
        if (bt - t0 > upTo) break;
        x.lineWidth = s.tool === 'marker' ? s.size * 2.4 : s.size * (0.4 + bp * 1.2);
        x.beginPath(); x.moveTo(ax * W, ay * H); x.lineTo(bx * W, by * H); x.stroke();
      }
      if (s.tool === 'neon') { x.shadowBlur = 0; x.strokeStyle = '#fff'; x.lineWidth = Math.max(1, s.size * 0.3); x.beginPath(); s.pts.forEach(([px, py, pt], i) => { if (pt - t0 <= upTo) x[i ? 'lineTo' : 'moveTo'](px * W, py * H); }); x.stroke(); }
      x.restore();
    }
    function drawUpTo(T) {
      x.clearRect(0, 0, c.width, c.height);
      timeline();
      strokes.forEach((s, i) => { if (T >= plan[i]) drawStroke(s, T - plan[i]); });
      if (cur) drawStroke(cur, Infinity);
    }
    c.addEventListener('pointerdown', (e) => {
      if (playT !== null) stop();
      const r = c.getBoundingClientRect();
      cur = { tool: $('tool').value, col: $('col').value, size: +$('size').value, pts: [[(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.timeStamp, e.pressure || 0.5]] };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const r = c.getBoundingClientRect();
      for (const ev of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) cur.pts.push([(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height, ev.timeStamp, ev.pressure || 0.5]);
      drawUpTo(Infinity);
    });
    c.addEventListener('pointerup', () => { if (cur && cur.pts.length > 1) { strokes.push(cur); save(); } cur = null; drawUpTo(Infinity); $('seek').value = 1000; });
    let raf = 0, startAt = 0, from = 0;
    function stop() { cancelAnimationFrame(raf); playT = null; $('play').textContent = '▶ 再生'; }
    function play() {
      timeline(); from = +$('seek').value >= 1000 ? 0 : (+$('seek').value / 1000) * total; startAt = performance.now(); $('play').textContent = '❚❚ 止める';
      (function step(now) {
        playT = from + (now - startAt) * +$('speed').value;
        drawUpTo(playT); $('seek').value = Math.min(1000, (playT / total) * 1000);
        if (playT < total) raf = requestAnimationFrame(step); else stop();
      })(startAt);
    }
    $('play').onclick = () => (playT !== null ? stop() : play());
    $('seek').addEventListener('input', () => { stop(); timeline(); drawUpTo((+$('seek').value / 1000) * total); });
    $('undo').onclick = () => { strokes.pop(); save(); drawUpTo(Infinity); };
    $('clear').onclick = () => { strokes = []; save(); drawUpTo(Infinity); };
    new ResizeObserver(fit).observe(c);
    if (!strokes.length) {
      // 見本: 花びらを1枚ずつ描いた記録を作っておく
      let t = 0;
      for (let k = 0; k < 6; k++) { const pts = []; for (let i = 0; i <= 40; i++) { const a = (k / 6) * 6.283, u = i / 40, r = Math.sin(u * Math.PI) * 0.18; pts.push([0.5 + Math.cos(a) * u * 0.3 - Math.sin(a) * r * 0.5, 0.5 + Math.sin(a) * u * 0.3 + Math.cos(a) * r * 0.5, (t += 16), 0.5]); } strokes.push({ tool: k % 2 ? 'neon' : 'pen', col: `hsl(${k * 60} 70% 50%)`, size: 5, pts }); }
    }
    if (window.THUMB) setInterval(() => { if (playT === null) { $('seek').value = 0; play(); } }, 600);
  },
}, {
  id: 'cb-kitchen-timer', c: 'combo', lv: 2, so: 1,
  t: '同時に使えるキッチンタイマー', y: 'どうじにつかえるきっちんたいまー',
  tags: ['タイマー', 'アラーム', 'Web Audio', 'localStorage'],
  d: 'ゆで卵・パスタ・カップ麺など、いくつものタイマーを同時に動かせる。残り時間は円の色の減り方でも分かり、終わると音と点滅で知らせる。終わる時刻を保存しているので、ページを閉じて開き直しても続きから数える。',
  p: '1秒ごとに数を減らすのではなく、「終わる時刻 − 今の時刻」を毎回計算する。画面を裏にしてタイマーの呼び出しが遅れても、表示はずれない。',
  html: `<div class="kt"><form id="f"><input id="nm" placeholder="名前" value="タイマー" aria-label="名前"><input id="mi" type="number" min="0" max="600" value="3" aria-label="分">分<input id="se" type="number" min="0" max="59" value="0" aria-label="秒">秒<button>足す</button></form>
    <div class="pre" id="pre"></div><ul id="list"></ul></div>`,
  css: `body { background: #fff7ec; font-family: system-ui, sans-serif; } .kt { max-width: 760px; margin: 0 auto; padding: 10px; display: grid; gap: 10px; }
    form { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; font-size: 13px; } form input[type=number] { width: 60px; } #nm { width: 9em; }
    .pre { display: flex; gap: 6px; flex-wrap: wrap; } .pre button { border-radius: 999px; font-size: 12px; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
    li { background: #fff; border-radius: 16px; padding: 10px; box-shadow: 0 3px 10px #0001; display: grid; justify-items: center; gap: 6px; }
    li.ring { animation: blink .5s steps(2) infinite; } @keyframes blink { 50% { background: #ffd8c9; } }
    .dial { width: 110px; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--c) calc(var(--p) * 1turn), #f0e8dc 0); }
    .dial b { width: 82%; aspect-ratio: 1; border-radius: 50%; background: #fff; display: grid; place-items: center; font: 800 22px ui-monospace, monospace; }
    .name { font-weight: 700; } .btns { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; } .btns button { font-size: 12px; padding: 2px 8px; }`,
  js() {
    const KEY = 'dekiru-kitchen', $ = (id) => document.getElementById(id);
    let timers, ac = null, beep = 0;
    try { timers = JSON.parse(localStorage.getItem(KEY)) || []; } catch { timers = []; }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(timers)); } catch { /* 保存できない */ } };
    const PRESETS = [['ゆで卵', 7 * 60], ['パスタ', 9 * 60], ['カップ麺', 3 * 60], ['お茶', 2 * 60], ['ご飯を蒸らす', 10 * 60]];
    $('pre').innerHTML = PRESETS.map(([n, s]) => `<button data-n="${n}" data-s="${s}">${n} ${s / 60}分</button>`).join('');
    // 動いているタイマーは「終わる時刻」、止めたタイマーは「残り」を持つ
    const left = (t) => (t.end ? Math.max(0, t.end - Date.now()) : t.rest);
    const COLORS = ['#e0532f', '#2f855a', '#26407c', '#b7791f', '#7a5cff'];
    function addTimer(name, sec) { ac = ac || new AudioContext(); timers.push({ id: Date.now() + Math.random(), name, total: sec * 1000, rest: sec * 1000, end: Date.now() + sec * 1000, done: false }); save(); render(); }
    $('f').addEventListener('submit', (e) => { e.preventDefault(); const s = +$('mi').value * 60 + +$('se').value; if (s > 0) addTimer($('nm').value.trim() || 'タイマー', s); });
    $('pre').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) addTimer(b.dataset.n, +b.dataset.s); });
    const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    function render() {
      $('list').innerHTML = timers.map((t, i) => `<li data-id="${t.id}" style="--c:${COLORS[i % 5]}"><span class="name"></span><div class="dial"><b></b></div><div class="btns"><button data-a="toggle"></button><button data-a="plus">+1分</button><button data-a="reset">最初から</button><button data-a="del" aria-label="消す">✕</button></div></li>`).join('');
      [...$('list').children].forEach((li, i) => { li.querySelector('.name').textContent = timers[i].name; });
      update();
    }
    function update() {
      let ringing = false;
      [...$('list').children].forEach((li, i) => {
        const t = timers[i], ms = left(t);
        if (t.end && ms === 0 && !t.done) { t.done = true; save(); }
        li.classList.toggle('ring', t.done);
        if (t.done) ringing = true;
        li.querySelector('.dial').style.setProperty('--p', t.total ? ms / t.total : 0);
        li.querySelector('b').textContent = t.done ? '時間！' : fmt(ms);
        li.querySelector('[data-a=toggle]').textContent = t.done ? '止める' : t.end ? '一時停止' : '再開';
      });
      document.title = ringing ? '⏰ 時間です' : 'キッチンタイマー';
      if (ringing && ac && performance.now() - beep > 900) { beep = performance.now(); const tt = ac.currentTime; [0, 0.18, 0.36].forEach((d) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 1320; g.gain.setValueAtTime(0.25, tt + d); g.gain.exponentialRampToValueAtTime(0.001, tt + d + 0.15); o.connect(g).connect(ac.destination); o.start(tt + d); o.stop(tt + d + 0.16); }); navigator.vibrate?.(200); }
    }
    $('list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      ac = ac || new AudioContext();
      const t = timers.find((v) => String(v.id) === b.closest('li').dataset.id);
      const a = b.dataset.a;
      if (a === 'toggle') { if (t.done) { t.done = false; t.end = 0; t.rest = t.total; } else if (t.end) { t.rest = left(t); t.end = 0; } else t.end = Date.now() + t.rest; }
      if (a === 'plus') { if (t.done) { t.done = false; t.end = Date.now(); } t.total += 60000; if (t.end) t.end += 60000; else t.rest += 60000; }
      if (a === 'reset') { t.done = false; t.rest = t.total; t.end = 0; }
      if (a === 'del') timers = timers.filter((v) => v !== t);
      save(); render();
    });
    if (!timers.length) { timers = [{ id: 1, name: 'カップ麺', total: 180000, rest: 180000, end: Date.now() + 180000, done: false }, { id: 2, name: 'ゆで卵', total: 420000, rest: 300000, end: 0, done: false }]; }
    if (window.THUMB) timers = [{ id: 1, name: 'カップ麺', total: 8000, rest: 8000, end: Date.now() + 8000, done: false }, { id: 2, name: 'パスタ', total: 20000, rest: 20000, end: Date.now() + 20000, done: false }];
    render();
    setInterval(update, 200);
  },
}, {
  id: 'cb-generative-poster', c: 'combo', lv: 3,
  t: '言葉から作るポスター', y: 'ことばからつくるぽすたー',
  tags: ['ポスター', 'ジェネラティブ', '縦書き', 'シード付き乱数'],
  d: '入れた言葉から数を作り、その数をもとに配色・図形・配置を決めて、縦書きの題字が入ったポスターを描く。同じ言葉なら毎回同じ絵になり、「別の案」で同じ言葉の別のデザインが出る。できた絵は画像なので、長押しや右クリックで保存できる。',
  p: '乱数の種に言葉のハッシュ値を使う。Math.random ではなく自前の乱数なので、同じ言葉からは必ず同じポスターができる。',
  html: `<div class="gp"><div class="bar"><input id="title" value="小さなナイフ" aria-label="題字"><input id="sub" value="HTML / CSS / JavaScript" aria-label="小さな文字"><select id="style" aria-label="図柄"><option value="geo">図形</option><option value="wave">波</option><option value="dots">点描</option></select><button id="alt">別の案</button></div><img id="img" alt="できたポスター"></div>`,
  css: `body { background: #2a2a2e; overflow: hidden; } .gp { height: 100vh; display: grid; grid-template-rows: auto 1fr; } .bar { display: flex; gap: 6px; padding: 6px; flex-wrap: wrap; } .bar input { min-width: 0; flex: 1; }
    img { height: calc(100vh - 56px); max-width: 100%; object-fit: contain; justify-self: center; align-self: center; box-shadow: 0 10px 30px #000a; }`,
  js() {
    const $ = (id) => document.getElementById(id), cv = document.createElement('canvas'), W = 600, H = 848;
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    let variant = 0;
    const PALETTES = [['#f4efe6', '#1f1a17', '#e0532f', '#26407c'], ['#0f1a2b', '#f5f1e8', '#ffb400', '#e8336d'], ['#e9e3d3', '#2b2b2b', '#2f855a', '#c23b22'], ['#ffd8c9', '#3b1f2b', '#7a5cff', '#ff6f3c'], ['#101010', '#f2f2f2', '#3fb7e8', '#ffd34d'], ['#f6f0dd', '#173a5e', '#f08a4b', '#8fb339']];
    // 言葉 → 32ビットの数（FNV-1a）。これを乱数の種にする
    const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
    function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function draw() {
      const title = $('title').value.trim() || '無題', sub = $('sub').value, style = $('style').value;
      const R = mulberry(hash(title + '|' + style + '|' + variant)), pick = (a) => a[Math.floor(R() * a.length)];
      const [bg, ink, a1, a2] = pick(PALETTES);
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      if (style === 'geo') {
        for (let i = 0; i < 7; i++) { x.fillStyle = pick([a1, a2, ink + '22']); const r = 40 + R() * 180, cx = R() * W, cy = R() * H * 0.8; x.beginPath(); if (R() < 0.5) x.arc(cx, cy, r, 0, 7); else x.arc(cx, cy, r, R() * 6, R() * 6 + Math.PI); x.fill(); }
        x.strokeStyle = ink; x.lineWidth = 3; for (let i = 0; i < 6; i++) { const y = 80 + R() * (H - 200); x.beginPath(); x.moveTo(0, y); x.lineTo(W * (0.3 + R() * 0.5), y); x.stroke(); }
      } else if (style === 'wave') {
        for (let k = 0; k < 9; k++) { x.fillStyle = [a1, a2, ink + '30'][k % 3]; const base = H * (0.25 + k * 0.07), amp = 10 + R() * 40, f = 0.005 + R() * 0.02, ph = R() * 6; x.beginPath(); x.moveTo(0, H); for (let px = 0; px <= W; px += 6) x.lineTo(px, base + Math.sin(px * f + ph) * amp); x.lineTo(W, H); x.fill(); }
      } else {
        const step = 16, fx = 0.004 + R() * 0.01, fy = 0.004 + R() * 0.01, ph = R() * 6;
        for (let py = step / 2; py < H; py += step) for (let px = step / 2; px < W; px += step) { const v = (Math.sin(px * fx + ph) + Math.cos(py * fy - ph) + 2) / 4; x.fillStyle = v > 0.55 ? a1 : a2; x.beginPath(); x.arc(px, py, v * step * 0.55, 0, 7); x.fill(); }
      }
      // 縦書きの題字: 1文字ずつ上から置く。長音や波線は90度回す
      const chars = [...title], cols = chars.length > 8 ? 2 : 1, per = Math.ceil(chars.length / cols), fs = Math.min(110, (H * 0.72) / per);
      x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 ${fs}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
      chars.forEach((ch, i) => {
        const col = Math.floor(i / per), cx = W - 70 - col * fs * 1.15 - (fs - 80) / 2, cy = 70 + fs / 2 + (i % per) * fs * 1.02;
        x.save(); x.translate(cx, cy);
        if ('ー〜～—…'.includes(ch)) x.rotate(Math.PI / 2);
        if ('、。'.includes(ch)) x.translate(fs * 0.3, -fs * 0.3);
        x.fillText(ch, 0, 0); x.restore();
      });
      x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.font = '700 22px system-ui, sans-serif'; x.fillText(sub, 36, H - 60);
      const d = new Date(); x.font = '14px ui-monospace, monospace'; x.fillText(`${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}  No.${hash(title).toString(16).slice(0, 6)}-${variant}`, 36, H - 34);
      // 紙のざらつき
      const img = x.getImageData(0, 0, W, H), p = img.data;
      for (let i = 0; i < p.length; i += 4) { const n = (R() - 0.5) * 18; p[i] += n; p[i + 1] += n; p[i + 2] += n; }
      x.putImageData(img, 0, 0);
      $('img').src = cv.toDataURL('image/png');
    }
    let tm = 0;
    for (const id of ['title', 'sub', 'style']) $(id).addEventListener('input', () => { variant = 0; clearTimeout(tm); tm = setTimeout(draw, 150); });
    $('alt').onclick = () => { variant++; draw(); };
    draw();
    if (window.THUMB) setInterval(() => { variant++; draw(); }, 1800);
  },
}, {
  id: 'cb-planetarium', c: 'combo', lv: 3,
  t: 'いまの星空と星座のプラネタリウム', y: 'いまのほしぞらとせいざのぷらねたりうむ',
  tags: ['星空', '星座', '天文計算', '日時'],
  d: '今の日時と場所から、明るい星と星座が空のどこに見えるかを計算して、見上げた空の形に描く。時刻を進めると星が東から昇って西へ沈み、場所をシドニーにすると南半球の空になる。ドラッグで向きを回せる。暗い小さな星は飾りで、実在の星ではない。',
  p: '星の位置（赤経・赤緯）は動かない。動くのは地球の向きで、「恒星時」を出せば、各地の空での高さと方角が三角関数で求まる。',
  html: `<canvas id="c"></canvas><div class="ui"><select id="loc" aria-label="場所"><option value="35.68,139.69">東京</option><option value="43.06,141.35">札幌</option><option value="26.21,127.68">那覇</option><option value="-33.87,151.21">シドニー</option></select><label>時刻 <input type="range" id="off" min="-720" max="720" value="0" step="10"></label><button id="now">今</button><label><input type="checkbox" id="names" checked> 名前</label><span id="time"></span></div>`,
  css: `body { background: #02030a; overflow: hidden; } canvas { width: 100vw; height: 100vh; display: block; cursor: grab; touch-action: none; } .ui { position: fixed; left: 8px; top: 8px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; color: #bcd; font: 12px system-ui, sans-serif; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), $ = (id) => document.getElementById(id);
    // [名前, 赤経（時）, 赤緯（度）, 等級]。名前が「・」で始まる星は名前を出さない
    const STARS = [
      ['ベテルギウス', 5.919, 7.41, 0.5], ['リゲル', 5.242, -8.2, 0.13], ['ベラトリックス', 5.419, 6.35, 1.6], ['・ミンタカ', 5.533, -0.3, 2.2], ['・アルニラム', 5.604, -1.2, 1.7], ['・アルニタク', 5.679, -1.94, 1.8], ['・サイフ', 5.796, -9.67, 2.1], ['・メイサ', 5.585, 9.93, 3.4],
      ['・ドゥーベ', 11.062, 61.75, 1.8], ['・メラク', 11.031, 56.38, 2.4], ['・フェクダ', 11.897, 53.69, 2.4], ['・メグレズ', 12.257, 57.03, 3.3], ['・アリオト', 12.9, 55.96, 1.8], ['・ミザール', 13.399, 54.93, 2.2], ['・アルカイド', 13.792, 49.31, 1.9], ['北極星', 2.53, 89.26, 2.0],
      ['・カフ', 0.153, 59.15, 2.3], ['・シェダル', 0.675, 56.54, 2.2], ['・γ', 0.945, 60.72, 2.2], ['・ルクバー', 1.43, 60.24, 2.7], ['・セギン', 1.907, 63.67, 3.4],
      ['デネブ', 20.69, 45.28, 1.25], ['・サドル', 20.37, 40.26, 2.2], ['・ギェナー', 20.77, 33.97, 2.5], ['・δ', 19.75, 45.13, 2.9], ['・アルビレオ', 19.512, 27.96, 3.1], ['ベガ', 18.616, 38.78, 0.03], ['アルタイル', 19.846, 8.87, 0.77],
      ['アンタレス', 16.49, -26.43, 1.0], ['・β', 16.091, -19.81, 2.6], ['・δ', 16.006, -22.62, 2.3], ['・π', 15.981, -26.11, 2.9], ['・σ', 16.353, -25.59, 2.9], ['・τ', 16.598, -28.22, 2.8], ['・ε', 16.836, -34.29, 2.3], ['・μ', 16.864, -38.05, 3.0], ['・ζ', 16.91, -42.36, 3.6], ['・η', 17.203, -43.24, 3.3], ['・θ', 17.622, -43.0, 1.9], ['・ι', 17.793, -40.13, 3.0], ['・κ', 17.708, -39.03, 2.4], ['・シャウラ', 17.56, -37.1, 1.6],
      ['シリウス', 6.752, -16.72, -1.46], ['プロキオン', 7.655, 5.22, 0.34], ['カペラ', 5.278, 46.0, 0.08], ['アルデバラン', 4.599, 16.51, 0.85], ['アークトゥルス', 14.261, 19.18, -0.05], ['スピカ', 13.42, -11.16, 0.97], ['レグルス', 10.14, 11.97, 1.35], ['フォーマルハウト', 22.961, -29.62, 1.16], ['カノープス', 6.4, -52.7, -0.74], ['すばる', 3.79, 24.1, 1.6],
    ];
    const CONS = [
      ['オリオン座', [[0, 2], [0, 5], [2, 3], [3, 4], [4, 5], [5, 6], [3, 1], [0, 7], [7, 2]]],
      ['北斗七星', [[8, 9], [9, 10], [10, 11], [11, 8], [11, 12], [12, 13], [13, 14]]],
      ['カシオペヤ座', [[16, 17], [17, 18], [18, 19], [19, 20]]],
      ['はくちょう座', [[21, 22], [22, 25], [24, 22], [22, 23]]],
      ['さそり座', [[29, 30], [30, 31], [30, 32], [32, 28], [28, 33], [33, 34], [34, 35], [35, 36], [36, 37], [37, 38], [38, 39], [39, 40], [40, 41]]],
    ];
    const TRI = [[26, 21, 27, '夏の大三角'], [0, 42, 43, '冬の大三角']];
    const rnd = (() => { let s = 3; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const FAINT = Array.from({ length: 700 }, () => [rnd() * 24, (Math.asin(rnd() * 2 - 1) * 180) / Math.PI, 4 + rnd() * 2]);
    const rad = Math.PI / 180;
    let rot = 0, drag = null;
    c.addEventListener('pointerdown', (e) => { drag = [e.clientX, rot]; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (drag) rot = drag[1] + (e.clientX - drag[0]) / 4; });
    c.addEventListener('pointerup', () => { drag = null; });
    $('now').onclick = () => { $('off').value = 0; };
    // 赤経・赤緯 → その場所・その時刻の高度と方位（北から東回り）
    function altAz(raH, decD, lst, lat) {
      const H = (lst - raH) * 15 * rad, d = decD * rad, p = lat * rad;
      const sa = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(H);
      const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H));
      return [Math.asin(sa) / rad, az / rad];
    }
    function sunRaDec(D) {
      const L = (280.46 + 0.9856474 * D) * rad, g = (357.528 + 0.9856003 * D) * rad, lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, e = 23.439 * rad;
      return [((Math.atan2(Math.cos(e) * Math.sin(lam), Math.cos(lam)) / rad + 360) % 360) / 15, Math.asin(Math.sin(e) * Math.sin(lam)) / rad];
    }
    (function draw() {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      if (window.THUMB) $('off').value = (+$('off').value + 2) % 720;
      const when = new Date(Date.now() + +$('off').value * 60000), [lat, lon] = $('loc').value.split(',').map(Number);
      const D = when.getTime() / 864e5 + 2440587.5 - 2451545.0, lst = (((18.697374558 + 24.06570982441908 * D + lon / 15) % 24) + 24) % 24;
      const [sra, sdec] = sunRaDec(D), [salt] = altAz(sra, sdec, lst, lat), day = Math.max(0, Math.min(1, (salt + 12) / 18));
      const cx = W / 2, cy = H / 2 + 10, R = Math.min(W, H) * 0.46;
      x.fillStyle = '#02030a'; x.fillRect(0, 0, W, H);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, `rgb(${10 + day * 60},${14 + day * 90},${40 + day * 150})`); g.addColorStop(1, `rgb(${20 + day * 120},${24 + day * 110},${60 + day * 120})`);
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
      // 立体射影: 天頂が中心、地平線が円のふち。見上げた空なので東が左になる
      const proj = (alt, az) => { const r = R * Math.tan(((90 - alt) / 2) * rad), a = (az + rot) * rad; return [cx - r * Math.sin(a), cy - r * Math.cos(a)]; };
      x.save(); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.clip();
      x.fillStyle = `rgba(255,255,255,${0.5 * (1 - day)})`;
      for (const [ra, dec, m] of FAINT) { const [al, az] = altAz(ra, dec, lst, lat); if (al < 0) continue; const [px, py] = proj(al, az); x.fillRect(px, py, 6.5 - m, 6.5 - m); }
      const pos = STARS.map(([, ra, dec]) => { const [al, az] = altAz(ra, dec, lst, lat); return al > -2 ? proj(al, az) : null; });
      x.lineWidth = 1.2; x.strokeStyle = 'rgba(120,180,255,.55)';
      for (const [name, lines] of CONS) {
        let lx = 0, ly = 0, n = 0;
        x.beginPath(); for (const [a, b] of lines) if (pos[a] && pos[b]) { x.moveTo(...pos[a]); x.lineTo(...pos[b]); lx += pos[a][0]; ly += pos[a][1]; n++; } x.stroke();
        if (n && $('names').checked) { x.fillStyle = 'rgba(150,200,255,.8)'; x.font = '13px system-ui, sans-serif'; x.fillText(name, lx / n + 12, ly / n + 24); }
      }
      x.setLineDash([4, 6]); x.strokeStyle = 'rgba(255,220,150,.35)';
      for (const [a, b, cc, name] of TRI) if (pos[a] && pos[b] && pos[cc]) { x.beginPath(); x.moveTo(...pos[a]); x.lineTo(...pos[b]); x.lineTo(...pos[cc]); x.closePath(); x.stroke(); if ($('names').checked) { x.fillStyle = 'rgba(255,220,150,.7)'; x.fillText(name, (pos[a][0] + pos[b][0] + pos[cc][0]) / 3 - 30, (pos[a][1] + pos[b][1] + pos[cc][1]) / 3); } }
      x.setLineDash([]);
      STARS.forEach(([name, , , m], i) => {
        if (!pos[i]) return;
        const [px, py] = pos[i], r = Math.max(1, 4.2 - m * 0.9);
        if (name === 'すばる') { x.fillStyle = '#cfe0ff'; for (let k = 0; k < 6; k++) x.fillRect(px + Math.cos(k * 1.1) * 5, py + Math.sin(k * 1.7) * 4, 1.6, 1.6); }
        else { x.fillStyle = name === 'ベテルギウス' || name === 'アンタレス' ? '#ffb38a' : name === 'リゲル' || name === 'ベガ' || name === 'シリウス' ? '#cfe0ff' : '#fff6e0'; x.shadowColor = x.fillStyle; x.shadowBlur = r * 3; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); x.shadowBlur = 0; }
        if ($('names').checked && !name.startsWith('・')) { x.fillStyle = '#fffc'; x.font = '12px system-ui, sans-serif'; x.fillText(name, px + 6, py - 6); }
      });
      x.restore();
      x.strokeStyle = '#445'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke();
      x.fillStyle = '#ffd166'; x.font = '700 14px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      [['北', 0], ['東', 90], ['南', 180], ['西', 270]].forEach(([n, az]) => { const a = (az + rot) * rad; x.fillText(n, cx - (R + 14) * Math.sin(a), cy - (R + 14) * Math.cos(a)); });
      x.textAlign = 'start'; x.textBaseline = 'alphabetic';
      $('time').textContent = `${when.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}（日本時間）${salt > 0 ? ' ・ 昼間は本当は星が見えません' : ''}`;
      requestAnimationFrame(draw);
    })();
  },
});
