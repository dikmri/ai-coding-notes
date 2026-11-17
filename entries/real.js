/* 実写のような映像
 * 画像も3Dモデルも読み込まず、光と物の振る舞いの計算だけで、カメラで撮った映像のように見せる。
 * どの項目にも「撮った映像に見せる仕上げ」を入れる: 明るさの幅を広く計算して縮める（トーンマッピング）、光のにじみ（ブルーム）、
 * レンズの周辺の暗さ、フィルムの粒子、わずかな手ぶれ。一覧の小さな絵（THUMB）では解像度を下げて軽くする。 */
dekiru.add({
  id: 'real-fireworks', c: 'real', lv: 3,
  t: '川面に映る打ち上げ花火', y: 'かわもにうつるうちあげはなび',
  tags: ['花火', '夜景', '映り込み', '煙', 'ブルーム'],
  d: '夏の夜の川辺から見上げた花火。火花を球の表面に配置して画面に映すため、縁が濃い立体的な玉になる。燃え始めは白く、消える間際は橙色にちらつく。開いた瞬間に空と煙が花火の色に照らされ、川面には揺れる光が映り込む。画面を押すと、その場所へ向けても花火が打ち上がる。',
  p: '実写らしさは、光が周りを照らすことで生まれる。火花だけでなく、煙や空、川面にも花火の色が映ると、そこに空気があるように見える。',
  html: `<canvas id="c" role="img" aria-label="夜の川の上に花火が開き、川面に映り込む映像"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const mk = (w, h) => { const k = document.createElement('canvas'); k.width = w; k.height = h; return k; };
    const tr = mk(1, 1), tx = tr.getContext('2d');   // 火花の光跡（少しずつ消す）
    const sk = mk(1, 1), kx = sk.getContext('2d');   // 街のシルエット（一度だけ描く）
    const b1 = mk(1, 1), b2 = mk(1, 1);              // にじみ（縮めて引き伸ばすとぼける）
    const rf = mk(1, 1), rx = rf.getContext('2d');   // 映り込みの元（水平線より上を一度だけ写す）
    const gr = mk(128, 128);                         // フィルムの粒子
    { const g = gr.getContext('2d'), d = g.createImageData(128, 128); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); }
    const grain = x.createPattern(gr, 'repeat');
    let W = 1, H = 1, hz = 1, S = 1;                  // 幅・高さ・水平線・大きさの基準（高さ 700 で 1）
    const towers = [], stars = [];
    function fit() {
      const q = window.THUMB ? 0.5 : Math.min(1, 1600 / innerWidth);
      W = Math.max(1, Math.round(innerWidth * q)); H = Math.max(1, Math.round(innerHeight * q));
      for (const k of [c, tr, sk, rf]) { k.width = W; k.height = H; }
      b1.width = Math.ceil(W / 6); b1.height = Math.ceil(H / 6); b2.width = Math.ceil(W / 20); b2.height = Math.ceil(H / 20);
      hz = Math.round(H * 0.68); S = H / 700;
      // 向こう岸の街。奥の列はかすみで少し明るく、手前の列は暗い。窓の灯りは小さな点にする
      kx.clearRect(0, 0, W, H); towers.length = 0;
      for (const [col, hmax, lit] of [['#0a0b13', 75, 0.1], ['#020309', 42, 0.22]]) {
        for (let px = -10; px < W;) {
          const w = (7 + Math.random() * 24) * S, tall = Math.random() < 0.07;
          const h = (tall ? hmax * (0.8 + Math.random() * 0.6) : 3 + Math.random() ** 2 * hmax * 0.55) * S;
          kx.fillStyle = col; kx.fillRect(px, hz - h, w + 0.6, h + 1);
          for (let i = w * h / (14 * S * S) * lit; i > 0; i--) {
            kx.fillStyle = `hsla(${30 + Math.random() * 20} 90% ${55 + Math.random() * 30}% / ${0.3 + Math.random() * 0.5})`;
            kx.fillRect(px + 1 + Math.random() * (w - 2), hz - h + 2 + Math.random() * (h - 3), 0.9 * S, 1.1 * S);
          }
          if (tall && hmax > 50) towers.push([px + w / 2, hz - h - 1.5 * S, Math.random() * 6]);
          px += w + (Math.random() < 0.15 ? Math.random() * 12 * S : 0);
        }
      }
      // 川に架かる橋と、川岸の街灯の列
      const b0 = W * 0.04, b1x = W * 0.58, by = hz - 11 * S;
      kx.fillStyle = '#010206'; kx.fillRect(b0, by, b1x - b0, 3 * S);
      for (let px = b0; px < b1x; px += 46 * S) kx.fillRect(px, by, 3 * S, hz - by);
      for (let px = b0; px < b1x; px += 9 * S) { kx.fillStyle = 'rgba(255,214,160,0.9)'; kx.fillRect(px, by - 1.2 * S, 1.1 * S, 1.1 * S); }
      for (let px = Math.random() * 20 * S; px < W; px += (14 + Math.random() * 40) * S) {
        if (px > b0 && px < b1x) continue;
        const g = kx.createRadialGradient(px, hz - 2 * S, 0, px, hz - 2 * S, 3 * S), a = 0.35 + Math.random() * 0.4;
        g.addColorStop(0, `rgba(255,${170 + Math.random() * 50 | 0},110,${a})`); g.addColorStop(1, 'rgba(255,190,120,0)');
        kx.fillStyle = g; kx.fillRect(px - 3 * S, hz - 5 * S, 6 * S, 6 * S);
      }
      stars.length = 0;
      for (let i = 0; i < 70; i++) stars.push([Math.random() * W, Math.random() * hz * 0.8, Math.random()]);
    }
    fit(); addEventListener('resize', fit);

    // 花火の色（炎色反応の色）。燃え始めは白く、燃え尽きる前は橙になる
    const PAL = [[255, 60, 45], [80, 255, 120], [90, 140, 255], [255, 200, 100], [255, 245, 235], [205, 105, 255]];
    const shells = [], sparks = [], smoke = [], flash = [0, 0, 0];
    const G = 0.07, WIND = 0.12;
    function launch(px, py) {
      const ty = py ?? H * (0.16 + Math.random() * 0.2), sx = px ?? W * (0.15 + Math.random() * 0.7);
      const vy = -Math.sqrt(2 * G * S * (hz - ty)), frames = -vy / (G * S);
      for (let i = 0; i < 2; i++) smoke.push({ x: sx, y: hz - Math.random() * 30 * S, r: (20 + Math.random() * 20) * S, a: 0.5, lit: [0.5, 0.35, 0.2] });
      const r = Math.random();
      shells.push({ x: sx + (Math.random() - 0.5) * 40 * S, y: hz, vx: (Math.random() - 0.5) * 0.3 * S, vy, frames, type: r < 0.28 ? 'willow' : r < 0.33 ? 'ring' : r < 0.66 ? 'chrys' : 'peony', col: PAL[Math.random() * PAL.length | 0] });
    }
    function ember(x0, y0, col, life, v = 0.3) {
      sparks.push({ x: x0, y: y0, px: x0, py: y0, vx: (Math.random() - 0.5) * v * S, vy: (Math.random() - 0.5) * v * S, life, dec: 0.03 + Math.random() * 0.03, drag: 0.92, col, small: true });
    }
    function burst(s) {
      const willow = s.type === 'willow', n = willow ? 130 : 170, sp = (willow ? 3.4 : 4.6) * S * (0.75 + Math.random() * 0.5);
      const tilt = Math.random() * Math.PI, col = willow ? [255, 175, 70] : s.col;
      for (let i = 0; i < n; i++) {
        // 球の表面に均等に散らす。画面に映すと縁が濃くなる
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        let vx = r * Math.cos(a), vy = r * Math.sin(a);
        if (s.type === 'ring') { const cx = Math.cos(a), cy = Math.sin(a) * 0.3; vx = cx * Math.cos(tilt) - cy * Math.sin(tilt); vy = cx * Math.sin(tilt) + cy * Math.cos(tilt); }
        const v = sp * (0.93 + Math.random() * 0.07);
        sparks.push({ x: s.x, y: s.y, px: s.x, py: s.y, vx: vx * v, vy: vy * v, life: 1, dec: willow ? 0.0045 : 0.008 + Math.random() * 0.004, drag: willow ? 0.972 : 0.965, col, tail: willow || s.type === 'chrys' });
      }
      const L = col.map((v) => v / 255);
      for (let k = 0; k < 3; k++) flash[k] += L[k] * 1.1;
      for (let i = 0; i < 9; i++) smoke.push({ x: s.x + (Math.random() - 0.5) * 120 * S, y: s.y + (Math.random() - 0.5) * 120 * S, r: (40 + Math.random() * 60) * S, a: 0.8, lit: [0, 0, 0] });
      // 近くの煙ほど強く照らす
      for (const m of smoke) { const d = Math.hypot(m.x - s.x, m.y - s.y) / (110 * S), k = 1.4 / (1 + d * d); for (let j = 0; j < 3; j++) m.lit[j] += L[j] * k; }
    }
    function colorOf(p) {
      const c0 = p.col, l = p.life;
      if (l > 0.85) { const k = (l - 0.85) / 0.15; return c0.map((v) => v + (255 - v) * k); }
      if (l < 0.3) { const k = 1 - l / 0.3; return [c0[0] + (255 - c0[0]) * k, c0[1] + (120 - c0[1]) * k, c0[2] + (35 - c0[2]) * k]; }
      return c0;
    }
    addEventListener('pointerdown', (e) => { const r = c.getBoundingClientRect(), py = (e.clientY - r.top) / r.height * H; launch((e.clientX - r.left) / r.width * W, Math.min(py, hz - 60 * S)); });
    let next = performance.now() + 900;
    for (let i = 0; i < 3; i++) setTimeout(launch, 80 + i * 260);   // 開いた直後から花火が見えるように
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = performance.now();
    (function loop(now) {
      const dt = Math.min(3, (now - last) / 16.7); last = now;
      const t = now / 1000;
      if (now > next) { const salvo = Math.random() < 0.2 ? 4 + (Math.random() * 3 | 0) : 1 + (Math.random() < 0.4); for (let i = 0; i < salvo; i++) setTimeout(launch, i * 200); next = now + 450 + Math.random() * 900 + (salvo > 2 ? 1800 : 0); }
      // 空。花火が開いた瞬間は、空がその色に染まる
      const f = flash.map((v) => Math.min(1.2, v));
      const sky = x.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, `rgb(${1 + f[0] * 18},${3 + f[1] * 18},${8 + f[2] * 22})`);
      sky.addColorStop(1, `rgb(${22 + f[0] * 50},${17 + f[1] * 45},${22 + f[2] * 50})`);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      x.fillStyle = sky; x.fillRect(0, 0, W, hz + 1);
      x.fillStyle = '#fff';
      for (const [sx, sy, b] of stars) { x.globalAlpha = 0.15 + b * 0.35; x.fillRect(sx, sy, S, S); }
      x.globalAlpha = 1;
      // 煙。風に流れて広がり、照らされた色をゆっくり失う
      for (let i = smoke.length - 1; i >= 0; i--) {
        const m = smoke[i];
        m.x += WIND * S * dt; m.y -= 0.04 * S * dt; m.r += 0.05 * S * dt; m.a *= 0.9986 ** dt;
        for (let j = 0; j < 3; j++) m.lit[j] *= 0.93 ** dt;
        if (m.a < 0.03 || smoke.length > 140) { smoke.splice(i, 1); continue; }
        const r = Math.min(255, 20 + m.lit[0] * 150 + f[0] * 25) | 0, g = Math.min(255, 20 + m.lit[1] * 150 + f[1] * 25) | 0, b = Math.min(255, 26 + m.lit[2] * 150 + f[2] * 25) | 0;
        const gd = x.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
        gd.addColorStop(0, `rgba(${r},${g},${b},${m.a * 0.45})`); gd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        x.fillStyle = gd; x.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
      }
      // 火花。前の位置から今の位置へ線を引くと、シャッターが開いている間の動きのぶれになる
      tx.globalCompositeOperation = 'destination-out'; tx.fillStyle = `rgba(0,0,0,${0.2 * dt})`; tx.fillRect(0, 0, W, H);
      tx.globalCompositeOperation = 'lighter'; tx.lineCap = 'round';
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i];
        s.x += s.vx * dt; s.y += s.vy * dt; s.vy += G * S * dt; s.frames -= dt;
        ember(s.x, s.y, [255, 190, 110], 0.5);
        if (s.frames <= 0) { burst(s); shells.splice(i, 1); }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.px = p.x; p.py = p.y;
        const dr = p.drag ** dt;
        p.vx = p.vx * dr + WIND * 0.02 * S * dt; p.vy = p.vy * dr + G * S * 0.55 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.dec * dt;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        if (p.tail && Math.random() < 0.12 * dt) ember(p.x, p.y, [255, 150, 60], 0.55, 0.15);
        const [r, g, b] = colorOf(p);
        let a = Math.min(1, p.life * 1.8);
        if (p.life < 0.35 && Math.random() < 0.45) a *= 0.15;   // 燃え尽きる前のちらつき
        tx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
        tx.lineWidth = (p.small ? 0.8 : 1.3 + p.life * 2) * S;
        tx.beginPath(); tx.moveTo(p.px, p.py); tx.lineTo(p.x + 0.01, p.y); tx.stroke();
      }
      x.globalCompositeOperation = 'lighter'; x.drawImage(tr, 0, 0);
      // 向こう岸の街。花火の光がビルの縁を照らす
      x.globalCompositeOperation = 'source-over'; x.drawImage(sk, 0, 0);
      const lit = x.createLinearGradient(0, hz - 140 * S, 0, hz);
      lit.addColorStop(0, 'rgba(0,0,0,0)'); lit.addColorStop(1, `rgba(${f[0] * 90 | 0},${f[1] * 90 | 0},${f[2] * 90 | 0},0.2)`);
      x.fillStyle = lit; x.fillRect(0, hz - 140 * S, W, 140 * S);
      for (const [lx, ly, ph] of towers) if ((t + ph) % 1.6 < 0.8) { x.fillStyle = '#ff3a2a'; x.fillRect(lx - S, ly - S, 2.2 * S, 2.2 * S); }
      // 川面の映り込み。水平線より上の1行ずつを、波で横にずらして下へ写す
      rx.clearRect(0, 0, W, hz); rx.drawImage(c, 0, 0, W, hz, 0, 0, W, hz);   // 自分自身から何度も写すと遅いので、先に1回だけ写しておく
      x.globalAlpha = 0.6;
      for (let y = hz; y < H; y += 2) {
        // 遠くの水面ほど波が細かく、近いほど大きく揺れる。縦にもずらすと、映り込みが縦の筋に崩れる
        const d = y - hz, sy = hz - 2 - d * 1.2 + Math.sin(d * 0.9 + t * 3.1) * Math.min(14, d * 0.12) * S;
        if (sy < 0) break;
        const off = (Math.sin(d * 0.23 + t * 1.8) * (0.6 + d * 0.04) + Math.sin(d * 0.061 - t * 1.2) * 1.4) * S;
        x.drawImage(rf, 0, sy, W, 2, off, y, W, 2);
      }
      x.globalAlpha = 1;
      const water = x.createLinearGradient(0, hz, 0, H);
      water.addColorStop(0, 'rgba(2,4,10,0.25)'); water.addColorStop(1, 'rgba(1,2,5,0.85)');
      x.fillStyle = water; x.fillRect(0, hz, W, H - hz);
      // にじみ。縮めた絵を引き伸ばして足すと、明るい所の周りに光がにじむ
      b1.getContext('2d').drawImage(c, 0, 0, b1.width, b1.height);
      b2.getContext('2d').drawImage(b1, 0, 0, b2.width, b2.height);
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = 0.5; x.drawImage(b1, 0, 0, W, H);
      x.globalAlpha = 0.35; x.drawImage(b2, 0, 0, W, H);
      // フィルムの粒子と、レンズの周辺の暗さ
      x.globalCompositeOperation = 'soft-light'; x.globalAlpha = 0.18;
      const ox = Math.random() * 128, oy = Math.random() * 128;
      x.translate(-ox, -oy); x.fillStyle = grain; x.fillRect(0, 0, W + 128, H + 128); x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
      x.fillStyle = vg; x.fillRect(0, 0, W, H);
      for (let k = 0; k < 3; k++) flash[k] *= 0.87 ** dt;
      // 手持ちのカメラのわずかな揺れ
      if (!calm) c.style.transform = `translate(${Math.sin(t * 1.3) * 1.5 + Math.sin(t * 3.1) * 0.6}px,${Math.cos(t * 1.1) * 1.2}px) scale(1.01)`;
      requestAnimationFrame(loop);
    })(performance.now());
  },
}, {
  id: 'real-candle', c: 'real', lv: 3,
  t: '闇に揺れるろうそくの炎', y: 'やみにゆれるろうそくのほのお',
  tags: ['炎', 'ろうそく', 'シェーダー', 'WebGL', '接写'],
  d: '真っ暗な部屋で、ろうそくの芯の先に寄って撮ったような映像。炎は高さごとの幅で形を決め、上に行くほど大きく揺らす。根もとは青く、芯の近くは白に近い黄色、縁は橙色になる。ろうの上部は、炎の光が中を通って明るく透ける。マウスを左右に動かすと、風を受けたように炎が傾く。',
  p: '炎の色は温度で決まる。温度の高い中心ほど白く、外側ほど橙色から赤になる。根もとが青いのは、ガスが完全に近い形で燃えているため。',
  html: `<canvas id="c" role="img" aria-label="暗い部屋で揺れるろうそくの炎の接写"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R, M; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
// 撮った映像に見せる仕上げ: トーンマッピング（ACES）・周辺の暗さ・フィルムの粒子
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .035;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y * 1.1 + vec2(0., .05);
  float sway = (noise(vec2(T * .7, 1.)) - .5) * .08 + (M.x - .5) * .12;   // 炎全体の傾き
  float len = .30 + (noise(vec2(T * 2.3, 5.)) - .5) * .05;                 // 炎の長さ
  float L = .85 + .15 * noise(vec2(T * 6., 2.));                           // 明るさの揺らぎ（周りの光も一緒に揺れる）
  vec2 base = vec2(0., -.07), q = p - base;
  float ty = q.y / len;                                                    // 炎の中の高さ 0〜1
  q.x -= sway * ty * ty + (noise(vec2(q.y * 9. - T * 7., T)) - .5) * .02 * ty;
  float w = .1 * pow(max(ty, 0.), .45) * pow(max(1. - ty, 0.), .75);      // 高さごとの炎の幅
  float d = abs(q.x) / max(w, 1e-3), inside = step(0., ty) * step(ty, 1.);
  float I = inside * smoothstep(1., .15, d);
  vec3 flame = (vec3(1., .42, .08) * I * 2.2 + vec3(1., .82, .5) * pow(I, 3.) * 3.5 + vec3(1., .97, .9) * pow(I, 8.) * 3.) * smoothstep(0., .12, ty);
  flame += vec3(.15, .3, 1.) * inside * smoothstep(1.3, .4, d) * smoothstep(.22, .02, ty) * smoothstep(-.02, .05, ty) * .9;
  vec2 fc = base + vec2(sway * .3, len * .45);
  // 暗い部屋。遠くの灯りが大きくぼける
  vec3 col = vec3(.012, .008, .006);
  for (int i = 0; i < 7; i++) {
    float fi = float(i), br = .025 + hash(vec2(fi, 9.)) * .04;
    vec2 bp = vec2(hash(vec2(fi, 3.)) * 1.8 - .9, hash(vec2(fi, 7.)) * .8 - .1);
    col += vec3(1., .55, .22) * smoothstep(br, br * .75, length(p - bp)) * (.004 + .014 * hash(vec2(fi, 1.))) * step(.35, hash(vec2(fi, 4.)));
  }
  col += vec3(1., .5, .2) * .12 * L * exp(-length(p - fc) * 3.5);
  // ろうそくの本体（円柱）。上の方ほど炎の光が中を通って明るく透ける
  float r0 = .17, top = -.16 + .006 * cos(p.x * 20.);
  if (abs(p.x) < r0 && p.y < top) {
    float nx = p.x / r0, nz = sqrt(max(0., 1. - nx * nx));
    float dif = max(dot(vec3(nx, 0., nz), normalize(vec3(fc - p, .25))), 0.);
    float sss = exp((p.y - top) * 11.);
    col = vec3(.42, .34, .26) * (.03 + dif * .2 + .25 * nz) * exp((p.y - top) * 4.) * L + vec3(.95, .6, .3) * sss * (.3 + .2 * nz) * L;
    col += vec3(1., .5, .2) * pow(1. - nz, 3.) * sss * .3;
    col *= .9 + .1 * noise(p * 40.);
  }
  col += vec3(1., .75, .45) * smoothstep(.006, 0., abs(p.y - top)) * step(abs(p.x), r0) * .6 * L;
  // 芯。黒く、先だけ赤く光る
  vec2 wq = p - vec2(sway * .1, -.11);
  col = mix(col, vec3(.02), smoothstep(.006, .003, abs(wq.x + wq.y * wq.y * 2.)) * step(-.05, wq.y) * step(wq.y, .04) * .9);
  col += vec3(1., .3, .05) * smoothstep(.012, 0., length(wq - vec2(0., .04))) * 2.;
  col += flame * L + vec3(1., .6, .25) * .18 * L * exp(-length((p - fc) * vec2(1., .6)) * 9.);
  O = vec4(film(col), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uM = gl.getUniformLocation(pg, 'M');
    let mx = 0.5, my = 0.5;
    addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth; my = 1 - e.clientY / innerHeight; });
    const q = window.THUMB ? 0.35 : 0.6;   // 画面より小さく描いて引き伸ばす（軽くするため）
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform2f(uM, mx, my);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-campfire', c: 'real', lv: 3,
  t: '夜のたき火と舞う火の粉', y: 'よるのたきびとまうひのこ',
  tags: ['炎', 'たき火', '火の粉', 'シェーダー', 'WebGL'],
  d: '夜のキャンプ場で、地面すれすれから薪の炎を撮ったような映像。上へ流れるゆらぎを何枚も重ね、炎の先ほど細く暗くする。薪の割れ目は熾火で赤く光り、火の粉は揺れながら昇って消える。火の上の煙は、熱気の陽炎でゆがんで見える。',
  p: '火の粉を点ではなく短い線で描くのがコツ。カメラのシャッターが開いている間に動いた跡になり、本物の映像らしく見える。',
  html: `<canvas id="c" role="img" aria-label="夜のたき火の炎と、昇っていく火の粉"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R, M; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .035;
}
// 炎の濃さ。p は炎の根もとが原点。上へ流れるゆらぎを重ね、上ほど細く、高いほど消える
float fire(vec2 p) {
  float y = p.y;
  vec2 q = vec2(p.x * (1. + max(y, 0.) * 2.2), y);
  q.x += (noise(vec2(y * 3. - T * 2., 7.)) - .5) * .14 * max(y, 0.);
  float n = fbm(vec2(q.x * 4.5, q.y * 3. - T * 3.4)) * .9 + noise(vec2(q.x * 11., q.y * 8. - T * 6.)) * .25;
  float tongue = .55 + .7 * noise(vec2(q.x * 9. + 3., q.y * 1.5 - T * 2.6));   // 炎の舌: 横に分かれ、上でちぎれる
  float w = .2 - y * .05;
  return clamp((n * mix(1., tongue, smoothstep(0., .25, y)) - y * 1.55 + .02) * smoothstep(w, w * .3, abs(q.x)) * 1.6, 0., 1.) * smoothstep(-.06, .02, y);
}
// 濃さを色に: 暗い赤 → 橙 → 黄 → 芯だけ白
vec3 ramp(float f) { return vec3(.9, .18, .02) * smoothstep(.02, .3, f) + vec3(1., .5, .1) * smoothstep(.25, .6, f) + vec3(1., .85, .5) * smoothstep(.55, .9, f) * 1.3 + vec3(.8) * smoothstep(.85, 1., f); }
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  float L = .8 + .2 * noise(vec2(T * 7., 1.));
  // 真っ暗な夜。地面は火の近くほど明るく照らされる
  vec3 col = vec3(.003, .004, .007);
  float g = smoothstep(-.17, -.2, p.y), dist = length(vec2(p.x, (p.y + .29) * 3.2));
  col = mix(col, vec3(.07, .04, .022) * (.03 + 1.1 * exp(-dist * 2.6)) * L * (.6 + .6 * fbm(p * vec2(30., 70.))), g);
  // 薪: 4本を組む。円柱として丸みの陰をつけ、上の面ほど火に照らされ、火に近い割れ目は熾火で光る
  for (int i = 0; i < 4; i++) {
    float a = vec4(.35, -.4, .1, -.06)[i], len = vec4(.24, .25, .3, .2)[i], th = vec4(.03, .032, .026, .028)[i];
    vec2 c0 = vec2(vec4(-.09, .1, 0., .02)[i], vec4(-.3, -.31, -.27, -.33)[i]);
    vec2 dir = vec2(cos(a), sin(a)), lp = p - c0;
    float al = dot(lp, dir), ac = dot(lp, vec2(-dir.y, dir.x));
    float inside = step(abs(al), len) * smoothstep(th, th * .8, abs(ac));
    float sh = sqrt(max(0., 1. - pow(ac / th, 2.))), up = .5 + .5 * ac / th;
    vec3 bark = vec3(.09, .055, .035) * (.4 + .8 * fbm(vec2(al * 25., ac * 90.) + float(i) * 9.));
    float ember = smoothstep(.55, .8, fbm(vec2(al * 14. + float(i) * 3., ac * 30.) + T * .15)) * smoothstep(.22, 0., abs(p.x));
    col = mix(col, bark * sh * (.1 + up * L * exp(-abs(p.x) * 4.)) + vec3(1.4, .35, .05) * ember * L * 1.6, inside);
  }
  // 陽炎: 火の上の景色を熱でゆがめる
  vec2 hp = p + vec2(noise(p * 8. + vec2(0, -T * 3.)) - .5, 0.) * .015 * smoothstep(-.2, .3, p.y);
  float sm = fbm(vec2(hp.x * 2. + T * .05, hp.y * 1.5 - T * .35)) * smoothstep(-.05, .45, hp.y) * smoothstep(.55, 0., abs(hp.x + (hp.y - .1) * .2));
  col += vec3(.08, .07, .065) * sm * .7 + vec3(.3, .12, .04) * sm * .25 * L * smoothstep(.6, 0., hp.y);
  col += ramp(fire(hp - vec2(0., -.27))) * L * 1.4;
  // 火の粉。昇りながら揺れて消える。動いた向きに短い線を引く（シャッター中の動き）
  for (int i = 0; i < 40; i++) {
    float fi = float(i), h1 = hash(vec2(fi, 1.)), h2 = hash(vec2(fi, 2.));
    float life = fract(T * (.18 + h1 * .2) + h2);
    vec2 sp = vec2((h1 - .5) * .25 + sin(life * 9. + fi) * .06 * life + life * .08, -.15 + life * (.7 + h2 * .5));
    vec2 v = vec2(cos(life * 9. + fi) * .5, 1.) * .012, pa = p - sp;
    float k = clamp(dot(pa, v) / dot(v, v), -1., 0.);
    col += vec3(1., .5, .15) * smoothstep(.0035, 0., length(pa - v * k)) * (1. - life) * smoothstep(0., .1, life) * 3.;
  }
  col += vec3(1., .45, .12) * .07 * L * exp(-length(p - vec2(0., -.1)) * 3.);
  O = vec4(film(col), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uM = gl.getUniformLocation(pg, 'M');
    const q = window.THUMB ? 0.35 : 0.6;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform2f(uM, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-rain-window', c: 'real', lv: 3,
  t: '雨粒が伝う夜の窓ガラス', y: 'あまつぶがつたうよるのまどがらす',
  tags: ['雨', '窓', 'ぼけ', 'シェーダー', 'WebGL'],
  d: '暗い部屋から、雨に濡れた窓ガラスにピントを合わせたような映像。くもったガラス越しの街灯は、大きく丸くぼける。しずくの中だけは、外の景色が小さく逆さまにくっきり映る。しずくは止まったり滑ったりしながら落ち、通った跡のくもりを拭っていく。',
  p: 'しずくは小さな凸レンズの働きをする。中心からのずれを表面の傾きとみなし、逆向きにずらした位置の景色を描くと、光が屈折して見える。',
  html: `<canvas id="c" role="img" aria-label="雨粒が流れる窓ガラスと、その向こうでぼける夜の街の灯り"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R, M; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .035;
}
// 窓の外の街の灯り。blur が大きいほど大きく丸くぼけ、ぼけの縁が少し明るくなる
vec3 city(vec2 p, float blur) {
  vec3 c = mix(vec3(.01, .012, .02), vec3(.026, .025, .032), smoothstep(-.6, .4, p.y));
  for (int l = 0; l < 3; l++) {
    float fl = float(l), sc = 3.5 + fl * 3.;
    vec2 g = p * sc + vec2(fl * 7.3 + T * .03 * (fl - 1.), fl * 2.1), id0 = floor(g);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 id = id0 + vec2(i, j);
      float h = hash(id + fl * 13.);
      if (h < .68) continue;
      vec2 o = id + .5 + (vec2(hash(id + 3.1), hash(id + 7.7)) - .5) * .8;
      float r = (.05 + blur * .45) * (.6 + .8 * hash(id + 5.5)), d = length(g - o);
      float disc = smoothstep(r, r * (.8 - blur * .35), d) * (.75 + .25 * smoothstep(r * .3, r, d) * blur);
      vec3 lc = h > .96 ? vec3(1., .1, .05) : h > .9 ? vec3(1., .93, .82) : h > .84 ? vec3(.08, .75, .65) : h > .8 ? vec3(.25, .4, 1.) : vec3(1., .48, .1);
      c += lc * disc * (.3 + .7 * hash(id + 1.3)) * min(1.6, .025 / (r * r)) / (1. + fl * .6);
    }
  }
  return c;
}
// しずく。返す値の xy は屈折でずらす向き、z はしずくの濃さ（1 ならガラスがくもっていない）
vec3 drops(vec2 uv) {
  vec3 r = vec3(0);
  // 止まっている小さな粒。ゆっくり乾いて、また付く
  vec2 g = uv * vec2(26., 16.), id = floor(g), f = fract(g) - .5;
  float h = hash(id);
  vec2 o = (vec2(hash(id + .3), hash(id + .7)) - .5) * .7, dv = f - o;
  float rad = .1 + .18 * hash(id + .9);
  float m = smoothstep(rad, rad * .6, length(dv * vec2(1., .9))) * step(.3, h) * smoothstep(.95, .6, fract(T * .03 + h));
  r += vec3(dv / rad, 1.) * m;
  // 流れ落ちる粒。列ごとに1粒が、止まったり滑ったりしながら落ちる
  vec2 g2 = uv * vec2(8., 1.2), id2 = floor(g2), f2 = fract(g2) - .5;
  float h2 = hash(id2 + 21.), ph = fract(T * (.1 + h2 * .08) + h2 * 10.);
  float y = .45 - (ph + .25 * sin(ph * 12.566) / 6.283) * 1.1;
  float x = (hash(id2 + 3.) - .5) * .5 + sin(f2.y * 8. + h2 * 6.) * .04;
  vec2 dp = (f2 - vec2(x, y)) * vec2(1., 1.7);
  float rad2 = .06 + .05 * h2, m2 = smoothstep(rad2, rad2 * .55, length(dp));
  r += vec3(dp / rad2 * .8, 1.) * m2;
  // 通った跡: くもりが拭われた筋と、取り残された小さな粒
  float trail = smoothstep(.035, .015, abs(f2.x - x)) * step(y, f2.y) * smoothstep(.5, 0., f2.y - y);
  float tg = fract(f2.y * 16.) - .5;
  float tm = smoothstep(.3, .1, length(vec2((f2.x - x) * 16., tg))) * trail * step(.45, hash(vec2(floor(f2.y * 16.), id2.x)));
  r += vec3(vec2((f2.x - x) * 16., tg) * .5, 1.) * tm;
  r.z = max(r.z, trail * .3);
  return r;
}
void main() {
  vec2 uv = gl_FragCoord.xy / R, p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec3 d = drops(uv * vec2(R.x / R.y, 1.));
  float m = clamp(d.z, 0., 1.);
  // くもった所は大きくぼけて白っぽく、粒の中は逆さに縮んでくっきり見える
  vec3 fog = city(p, 1.) * .8 + vec3(.02, .022, .028);
  // 粒の中は、外の景色が逆さに縮んで、くっきり映る。縁ほど暗い
  vec3 clear = city(p * .9 - d.xy * .35, .1) * 1.3 + fog * .75;
  clear *= 1. - smoothstep(.6, 1., length(d.xy)) * .35;
  vec3 col = mix(fog, clear, m);
  col += vec3(.7, .75, .8) * pow(max(0., dot(normalize(vec3(d.xy, 1.)), normalize(vec3(-.4, .7, 1.)))), 60.) * m * .5;
  O = vec4(film(col * 2.), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uM = gl.getUniformLocation(pg, 'M');
    const q = window.THUMB ? 0.35 : 0.7;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform2f(uM, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-milkyway', c: 'real', lv: 3,
  t: '天の川と夜空の日周運動', y: 'あまのがわとよぞらのにっしゅううんどう',
  tags: ['星空', '天の川', 'タイムラプス', 'シェーダー', 'WebGL'],
  d: '標高の高い山で、満天の星を超広角レンズで撮ったような映像。星は天の北極を中心にゆっくり回る。天の川には暗い塵の帯が通り、地平線の近くは大気の光でかすかに明るい。画面を押すと長時間露光に切り替わり、星が円を描く光の跡になる。',
  p: '星ごとに、回転の中心からの距離と今の角度を決めておく。その円の上で、少し前までの角度の範囲を光らせれば、星の光跡が描ける。',
  html: `<canvas id="c" role="img" aria-label="山の稜線の上で回る満天の星と天の川"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R, M; uniform float T, K; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
const vec2 POLE = vec2(-.55, .62);   // 天の北極（ここを中心に星が回る）
mat2 rot(float a) { return mat2(cos(a), sin(a), -sin(a), cos(a)); }
// 星: 格子ごとに1つ。明るい星ほど少ない。色は温度で青白〜橙
vec3 stars(vec2 p, float sc, float dens) {
  vec2 g = p * sc, id = floor(g), f = fract(g) - .5;
  float h = hash(id);
  if (h > dens) return vec3(0);
  vec2 o = (vec2(hash(id + .3), hash(id + .7)) - .5) * .8;
  float px = length(f - o) / sc * R.y;   // 画面の点の数で測った距離
  float b = pow(hash(id + 1.1), 20.) * 5. + .05 * pow(hash(id + 2.2), 3.);
  return mix(vec3(1., .78, .55), vec3(.72, .84, 1.), hash(id + 4.)) * b * exp(-px * px * 2.2);
}
// 長時間露光の光跡: 回転の中心からの距離ごとに輪を分け、輪ごとに数個の星の弧を描く
vec3 trails(vec2 p) {
  vec2 d = p - POLE;
  float r = length(d), a = atan(d.y, d.x), band = floor(r * 110.);
  vec3 c = vec3(0);
  for (int k = -1; k <= 1; k++) for (int s = 0; s < 3; s++) {
    vec2 key = vec2(band + float(k), float(s));
    if (hash(key) < .35) continue;
    float rr = (key.x + .5 + (hash(key + .5) - .5) * .6) / 110.;
    float da = mod(hash(key + 1.7) * 6.2832 + T * .05 - a, 6.2832);
    float w = abs(r - rr) * R.y;
    c += mix(vec3(1., .78, .55), vec3(.72, .84, 1.), hash(key + 4.4)) * (pow(hash(key + 3.3), 6.) * 1.5 + .08) * step(da, K) * (1. - da / max(K, 1e-3) * .6) * exp(-w * w * 1.6);
  }
  return c;
}
float ridge(float x) { return -.3 + fbm(vec2(x * 1.6, 3.)) * .24 + fbm(vec2(x * 8., 9.)) * .025; }
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec2 sp = rot(T * .05) * (p - POLE);                 // 星と天の川は回る空に貼りつける
  // 空: 上は深い紺、地平線の近くは大気の光（緑）と遠い街の光（橙）
  vec3 col = mix(vec3(.004, .007, .018), vec3(.03, .045, .05), smoothstep(.4, -.3, p.y));
  col += vec3(.06, .03, .01) * exp(-(p.y + .3) * 6.) * smoothstep(-.2, .8, p.x);
  // 天の川: 帯の中に明るい雲と暗い塵の筋
  vec2 n = normalize(vec2(.55, 1.));
  float bd = dot(sp - vec2(.9, -.2), n);
  float band = exp(-bd * bd * 16.), cl = fbm(sp * 3.), dust = fbm(sp * 7. + 4.);
  float core = exp(-pow(dot(sp - vec2(1.1, -.3), vec2(n.y, -n.x)) * 1.2, 2.));
  vec3 mw = mix(vec3(.55, .62, .8), vec3(1., .85, .62), core) * band * (.15 + cl * .9) * (1. - smoothstep(.45, .72, dust) * .85 * band);
  col += mw * .2;
  float dens = .12 + band * .3;
  vec3 st = K > .01 ? trails(p) : stars(sp, 60., dens) + stars(sp + 17., 140., dens * 1.3) * .6 + stars(sp + 41., 300., dens * 1.6) * .35;
  col += st;
  // 山の稜線（手前は黒、奥の峰は霧で少し明るい）
  float r1 = ridge(p.x), r2 = ridge(p.x * .6 + 3.) + .06;
  col = mix(col, vec3(.006, .008, .014), smoothstep(.003, -.003, p.y - r2));
  col = mix(col, vec3(.002, .003, .006), smoothstep(.003, -.003, p.y - r1));
  O = vec4(film(col * 1.4), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uM = gl.getUniformLocation(pg, 'M'), uK = gl.getUniformLocation(pg, 'K');
    // 押すと長時間露光（光跡）に切り替える。光跡はシャッターを開けている時間の分だけ伸びる
    let longExp = false, k = 0;
    addEventListener('pointerdown', () => { longExp = !longExp; });
    if (window.THUMB) setInterval(() => { longExp = !longExp; }, 5000);
    const q = window.THUMB ? 0.5 : 1;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      k = longExp ? Math.min(2.4, k + 0.012) : 0;
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform2f(uM, 0.5, 0.5); gl.uniform1f(uK, k);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-cumulus', c: 'real', lv: 3,
  t: '夕焼けの巨大積乱雲', y: 'ゆうやけのきょだいせきらんうん',
  tags: ['雲', '夕焼け', 'レイマーチング', 'シェーダー', 'WebGL'],
  d: '日没直前、遠くの入道雲を望遠で早送り撮影したような映像。3次元のゆらぎで雲の形を作る。視線に沿って少しずつ進み、雲の濃さを足していく（レイマーチング）。各点から太陽の向きにも数歩進み、届く光の量を調べる。これで日の当たる側は金色に、奥は青く暗くなる。',
  p: '雲の明るさは、太陽の光が雲の中をどれだけ通り抜けたかで決まる。通った雲が濃いほど、光は指数関数で弱くなる（ランベルト・ベールの法則）。',
  html: `<canvas id="c" role="img" aria-label="夕日に照らされてゆっくり湧き上がる巨大な積乱雲"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R, M; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float h3(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
const vec3 SUN = normalize(vec3(-1., .14, .12));
// 雲の形: 高さの違う3つの塔（上が丸い円柱）をなめらかにつなぎ、いちばん高い塔の上に平たい金床を置く。負なら雲の中
float tower(vec3 p, vec3 c, float h, float r) { vec3 q = p - c; return length(vec3(q.x, max(q.y - h + r, 0.), q.z)) - r; }
float smin(float a, float b, float k) { float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float shape(vec3 p) {
  float d = tower(p, vec3(0., 0., 0.), 5., 2.1);
  d = smin(d, tower(p, vec3(-2.9, 0., .8), 3.1, 1.8), 1.2);
  d = smin(d, tower(p, vec3(2.7, 0., -.6), 3.8, 1.7), 1.2);
  vec3 a = (p - vec3(1.8, 5.35, 0.)) / vec3(4.8, .55, 2.8);     // 金床（風下へ広がる平たい雲）
  d = smin(d, (length(a) - 1.) * .55, .8);
  return max(d, -p.y);
}
// 濃さ。ゆっくり湧き上がる2段のゆらぎで、もくもくした縁を作る
float dens(vec3 p, bool fine) {
  vec3 q = p - vec3(0., T * .06, 0.);
  float n = noise3(q * .7) * .55 + noise3(q * 1.6) * .28;
  if (fine) n += noise3(q * 3.6) * .15 + noise3(q * 7.9) * .06;     // カリフラワーのような細かいもくもく
  return clamp(-(shape(p) - (n - .45) * 2.6) * 1.7, 0., 1.);
}
vec3 sky(vec3 rd) {
  float y = max(rd.y, 0.), s = max(dot(rd, SUN), 0.);
  vec3 c = mix(vec3(1., .48, .22), vec3(.1, .18, .4), pow(y, .45));
  return c + vec3(1., .55, .25) * (pow(s, 6.) * .7 + pow(s, 300.) * 4.);
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec3 ro = vec3(0., .3, -19.), ta = vec3(.4, 2.6, 0.);
  vec3 f = normalize(ta - ro), r = normalize(cross(f, vec3(0, 1, 0))), u = cross(r, f);
  vec3 rd = normalize(f * 2.1 + p.x * r + p.y * u);
  vec3 col = sky(rd);
  // 雲が入っている箱との交わり（ここだけを進む）
  vec3 lo = vec3(-6.5, -.2, -6.5), hi = vec3(8.5, 6.3, 6.5);
  vec3 t0 = (lo - ro) / rd, t1 = (hi - ro) / rd, tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
  if (b > a) {
    const int N = 56;
    float dt = (b - a) / float(N), t = a + dt * hash(gl_FragCoord.xy + fract(T * 7.) * 300.);   // 帯の模様を消すため、出発点を少しずらす（毎回変わるので粒子に見える）
    vec3 acc = vec3(0); float tr = 1.;
    float ph = .6 + .8 * pow(max(dot(rd, SUN), 0.), 6.);   // 太陽の向きを見るほど光が前へ散る
    for (int i = 0; i < N; i++) {
      vec3 pos = ro + rd * t;
      float d = dens(pos, true);
      if (d > .01) {
        float ld = 0.;
        for (int j = 1; j <= 3; j++) ld += dens(pos + SUN * float(j) * .5, false);
        float lit = exp(-ld * 2.4);                         // 太陽の光がどれだけ届くか
        float powder = 1. - exp(-d * 5.);                   // 薄い縁は暗く、中は明るい
        vec3 L = vec3(1.4, .55, .2) * 2.1 * lit * powder * ph + mix(vec3(.1, .12, .18), vec3(.28, .27, .33), pos.y / 6.);
        float k = exp(-d * dt * 3.);
        acc += tr * (1. - k) * L;
        tr *= k;
        if (tr < .02) break;
      }
      t += dt;
    }
    col = col * tr + acc;
  }
  // 地平線の木立のシルエット
  float hz = -.36 + noise3(vec3(p.x * 9., 1., 2.)) * .04 + noise3(vec3(p.x * 40., 3., 2.)) * .012;
  col = mix(col, vec3(.02, .015, .02), smoothstep(1.5 / R.y, -1.5 / R.y, p.y - hz));   // 境目を画素1つ半ぶんぼかす（引き伸ばしたときのギザギザを抑える）
  O = vec4(film(col * .9), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uM = gl.getUniformLocation(pg, 'M');
    const q = window.THUMB ? 0.3 : 0.45;   // 重いので小さく描いて引き伸ばす
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform2f(uM, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-beach', c: 'real', lv: 3,
  t: '濡れた砂浜と引き波', y: 'ぬれたすなはまとひきなみ',
  tags: ['海', '波', '砂浜', '夕焼け', 'シェーダー', 'WebGL'],
  d: '夕暮れの海岸で、少し先の波打ち際を斜めに見下ろしたような映像。波は数秒かけて砂の上を駆け上がり、ゆっくり引いていく。波の縁には白い泡の模様ができる。波が引いた後の濡れた砂は、鏡のように夕空を映す。乾いた砂はつやがなく、細かい粒のざらつきが見える。',
  p: '濡れた砂が光るのは、表面に薄い水の膜があるため。見る角度が浅いほど、空をよく映す（フレネル反射）。乾いた砂との境目を描くと、本物らしさが増す。',
  html: `<canvas id="c" role="img" aria-label="夕暮れの砂浜に寄せては引く波と、空を映す濡れた砂"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R, M; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
const vec3 SUN = normalize(vec3(-.35, .07, 1.));
vec3 sky(vec3 rd) {
  float y = max(rd.y, 0.), s = max(dot(rd, SUN), 0.);
  vec3 c = mix(vec3(1.1, .45, .18), vec3(.14, .2, .42), pow(y, .4));
  c = mix(c, vec3(1.2, .62, .3), pow(1. - y, 12.) * .6);
  return c + vec3(1., .65, .35) * (pow(s, 1200.) * 10. + pow(s, 30.) * .6);
}
// 波が砂を駆け上がる度合い（0: 引いた 1: 一番上まで）。速く上がって、ゆっくり引く
float swash(float t) { float ph = fract(t / 7.); return ph < .3 ? smoothstep(0., .3, ph) : 1. - smoothstep(.3, 1., ph); }
float edge(float x, float t) { return 7. - 3.2 * swash(t + noise(vec2(x * .15, 1.)) * .8) + (noise(vec2(x * .7, t * .15)) - .5) * 1.2; }
float waves(vec2 p) { return fbm(p * vec2(.9, 1.8) + vec2(T * .2, T * .5)) + noise(p * 4. - T) * .15; }
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec3 ro = vec3(0., 1.3, 0.), rd = normalize(vec3(p.x, p.y - .22, 1.2));
  vec3 col;
  if (rd.y >= 0.) col = sky(rd);
  else {
    float t = -ro.y / rd.y;
    vec2 g = (ro + rd * t).xz;                        // 地面の上の位置（z が沖の向き）
    float zw = edge(g.x, T), zr = edge(g.x, T - fract(T / 7.) * 7. + 2.1);   // 今の波の縁と、さっき届いた所
    float sea = smoothstep(zw - .05, zw + .05, g.y);  // 水がある所
    float depth = clamp((g.y - zw) * .25, 0., 1.);
    // 砂: 乾いた砂はつやがなく明るい。濡れた砂は暗く、空を映す
    float wet = smoothstep(min(zr, zw) - .6, min(zr, zw) + .1, g.y);
    float grain = fbm(g * 30.) * .5 + noise(g * 300.) * .2;
    vec3 sand = mix(vec3(.46, .38, .3), vec3(.12, .09, .07), wet) * (.5 + .45 * grain) * vec3(.72, .58, .47);
    float fre = .04 + .96 * pow(1. - max(-rd.y, 0.), 5.);
    vec3 wn = normalize(vec3((noise(g * 40.) - .5) * .06, 1., (noise(g * 40. + 9.) - .5) * .06));   // 濡れた砂の面のわずかなでこぼこ
    vec3 col0 = sand + sky(reflect(rd, wn)) * wet * (.35 + .65 * fre) * .9;
    // 水: 浅い所は透けて砂が見え、深い所は空を映す。波で面が傾く
    float e = .05, h0 = waves(g);
    vec3 n = normalize(vec3((h0 - waves(g + vec2(e, 0.))) * .3 * (.3 + depth), 1., (h0 - waves(g + vec2(0., e))) * .3 * (.3 + depth)));
    float fw = .02 + .98 * pow(1. - max(dot(n, -rd), 0.), 5.);
    vec3 water = mix(sand * vec3(.6, .75, .75), vec3(.03, .09, .1), smoothstep(0., .8, depth));
    water = mix(water, sky(reflect(rd, n)), fw);
    water += vec3(1., .75, .45) * pow(max(dot(reflect(rd, n), SUN), 0.), 400.) * 6.;
    // 泡: 波の縁のレースと、水の中に残る模様
    float lace = smoothstep(.62, .78, noise(g * vec2(3., 6.) + T * .3) + noise(g * 9.) * .3);
    float foam = exp(-abs(g.y - zw) * 7.) * (.6 + .5 * noise(vec2(g.x * 6., T))) + lace * exp(-(g.y - zw) * 1.2) * .7 * sea;
    water = mix(water, vec3(.95, .9, .85) * (.6 + .4 * fre) * vec3(1., .82, .65), clamp(foam, 0., 1.));
    // 沖の白い波頭
    float crest = smoothstep(.9, 1., sin(g.y * 1.3 + T * 1.2 + noise(vec2(g.x * .3, 0.)) * 3.)) * smoothstep(9., 14., g.y);
    water = mix(water, vec3(.85, .8, .75), crest * .5);
    col = mix(col0, water, sea);
    col = mix(col, sky(vec3(rd.x, .02, rd.z)), 1. - exp(-t * .012));   // 遠くはかすむ
  }
  O = vec4(film(col * .85), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uM = gl.getUniformLocation(pg, 'M');
    const q = window.THUMB ? 0.35 : 0.65;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform2f(uM, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-aurora', c: 'real', lv: 3,
  t: '氷湖に映るオーロラの幕', y: 'ひょうこにうつるおーろらのまく',
  tags: ['オーロラ', '星空', '湖', '映り込み', 'シェーダー', 'WebGL'],
  d: '冬の夜、湖の岸から空と水面を広角で撮ったような映像。高さの違う薄い層を何十枚も重ねてオーロラを描く。層ごとに同じ横の位置へ縦の筋を入れると、カーテンのようなひだになる。下は緑、上は赤紫に光る。静かな湖面には、少し揺れてにじんだオーロラが映る。',
  p: 'オーロラの色は高さで変わる。低い所は酸素が出す緑になり、高い所は酸素の赤が混じる。層の高さに合わせて色を変えると、本物の見え方に近づく。',
  html: `<canvas id="c" role="img" aria-label="雪山の上で揺れる緑のオーロラと、それを映す静かな湖"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R, M; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
// オーロラ: 高さの違う層を下から順に重ねる
vec3 aurora(vec3 rd) {
  vec3 c = vec3(0);
  float jit = hash(gl_FragCoord.xy + fract(T) * 91.);
  for (int i = 0; i < 36; i++) {
    float k = (float(i) + jit) / 36., h = .8 + k * 2.6;
    vec2 g = rd.xz * (h / max(rd.y, .03));            // この高さの層で、視線が通る位置
    float z0 = 5.5 + (fbm(vec2(g.x * .14 + T * .015, 1.)) - .5) * 9. + sin(g.x * .23 + T * .05) * 1.5;   // カーテンのうねり（ひだ）
    float curtain = exp(-pow((g.y - z0) * 1.1, 2.));
    float rays = pow(noise(vec2(g.x * 4. + T * .25 + sin(g.y * .3) * .5, 3.)), 3.) * 2.2 + .1;   // 縦の筋
    rays *= .3 + .9 * smoothstep(.25, .7, fbm(vec2(g.x * .2 - T * .03, 5.)));                   // 明るい所と暗い所
    float shimmer = .7 + .3 * noise(vec2(g.x * .5 - T * 1.3, k * 4.));
    vec3 tint = mix(vec3(.2, 1., .45), vec3(.9, .2, .55), smoothstep(.4, .95, k));
    c += tint * curtain * rays * shimmer * pow(1. - k, 1.5) * smoothstep(0., .05, k) * .1;
  }
  return c;
}
vec3 stars(vec2 p) {
  vec2 g = p * 140., id = floor(g), f = fract(g) - .5;
  float h = hash(id);
  return vec3(.85, .9, 1.) * step(.88, h) * pow(hash(id + 3.), 6.) * 2. * exp(-dot(f, f) * 40.);
}
vec3 skyc(vec3 rd, vec2 p) {
  vec3 c = mix(vec3(.01, .02, .035), vec3(.002, .004, .012), clamp(rd.y * 2., 0., 1.));
  return c + stars(rd.xy / max(rd.z, .1)) + aurora(rd);
}
float ridge(float x) { return .02 + fbm(vec2(x * 3., 7.)) * .14 + noise(vec2(x * 25., 2.)) * .012; }
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec3 rd = normalize(vec3(p.x, p.y + .12, 1.));
  float hz = 0.;
  vec3 col;
  if (rd.y > hz) {
    col = skyc(rd, p);
    // 雪山: 稜線は空の光でかすかに青く、ふもとは暗い
    float r = ridge(rd.x);
    float m = smoothstep(.003, -.003, rd.y - r);
    vec3 snow = mix(vec3(.02, .045, .05), vec3(.05, .09, .1), smoothstep(0., r, rd.y)) * (.7 + .5 * fbm(rd.xy * 60.));
    col = mix(col, snow + aurora(vec3(rd.x, .4, 1.)) * .05, m);
  } else {
    // 湖面: 空と山を上下逆に映す。かすかな波で揺らし、少しにじませる
    float t = .25 / -rd.y;
    vec2 g = vec2(rd.x, 1.) * t;
    vec2 w = vec2(noise(g * vec2(2., 9.) + T * .3), noise(g * vec2(2.3, 8.) - T * .25)) - .5;
    vec3 rr = normalize(vec3(rd.x + w.x * .01, -rd.y + w.y * .012, rd.z));
    col = skyc(rr, p) * .75;
    float r = ridge(rr.x);
    col = mix(col, vec3(.01, .02, .025), smoothstep(.003, -.003, rr.y - r) * .9);
    col *= .9 + .2 * w.y;
    // 手前の岸の雪
    float shore = smoothstep(-.33, -.36, p.y + noise(vec2(p.x * 6., 1.)) * .03);
    col = mix(col, vec3(.05, .08, .09) * (.6 + .5 * fbm(p * 40.)) + aurora(vec3(p.x, .5, 1.)) * .08, shore);
  }
  O = vec4(film(col * 1.3), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uM = gl.getUniformLocation(pg, 'M');
    const q = window.THUMB ? 0.35 : 0.6;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform2f(uM, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-forest-rays', c: 'real', lv: 3,
  t: '朝霧の森に差す光芒', y: 'あさぎりのもりにさすこうぼう',
  tags: ['森', '霧', '光芒', '木漏れ日', 'シェーダー', 'WebGL'],
  d: '夜明けの針葉樹の森を、霧の中で横へ移動しながら撮ったような映像。木は奥行きの違う6枚の層に並べ、遠い層ほど霧で白くかすませる。画面の各点から太陽へ向けて少しずつ進み、木に遮られなかった分だけ光を足す。これで霧の中に光の筋（光芒）が立つ。',
  p: '光の筋が見えるのは、霧の粒が光を散らすため。太陽までの道筋に木がない場所だけが明るくなり、木のすき間から筋になって伸びる。',
  html: `<canvas id="c" role="img" aria-label="霧の針葉樹の森に、木々のすき間から差し込む朝日の光の筋"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R, M; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
// 1枚の層の針葉樹。格子ごとに1本で、高さと太さを変え、枝の段をぎざぎざにする。1 なら木の中
float trees(vec2 p, float seed, float dens, float px) {
  float m = 0., cell = floor(p.x * dens);
  for (int k = -1; k <= 1; k++) {
    float id = cell + float(k), h = hash(vec2(id, seed));
    if (h < .15) continue;
    float cx = (id + .2 + .6 * hash(vec2(id, seed + 1.))) / dens;
    float top = .35 + .55 * hash(vec2(id, seed + 2.)), y = p.y + .5, tip = top - y, dx = abs(p.x - cx);
    float trunk = smoothstep(px, 0., dx - (.004 + .006 * h) * clamp(tip * 8., 0., 1.)) * step(y, top);   // 幹は梢に向かって細くなる
    float tier = fract(tip * (9. + 4. * h) + h * 7.);                     // 枝の段（段ごとに下が広く垂れる）
    float side = p.x > cx ? 3.1 : 0.;
    float w = tip * (.16 + .06 * h) * (.65 + .45 * smoothstep(0., .85, tier)) * (.8 + .4 * noise(vec2(y * 30., id + side)));
    w += (noise(vec2(y * 160., id * 7. + side)) - .5) * .012 * min(tip * 6., 1.);   // 葉先のぎざぎざ
    float crown = smoothstep(px, 0., dx - w) * step(0., tip) * smoothstep(.0, .04, y);
    m = max(m, max(trunk, crown));
  }
  return m;
}
const vec2 SUN = vec2(.42, .33);
float layerX(float x, float k) { return x * (1. + k * .25) + T * .015 / (1. + k * .7) + k * 13.7; }
// 太陽への道をさえぎる木（手前の3層）
float occl(vec2 p) {
  float o = 0.;
  for (int k = 0; k < 3; k++) { float fk = float(k); o = max(o, trees(vec2(layerX(p.x, fk), p.y * (1. + fk * .12)), fk, 3. + fk * 2., .004)); }
  return o;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  float px = 1.5 / R.y;
  // 霧の空。太陽の近くは暖かく明るい
  float sd = length(p - SUN);
  vec3 fogc = mix(vec3(.5, .55, .55), vec3(1.25, 1., .7), exp(-sd * 2.2));
  vec3 col = fogc + vec3(1.5, 1.2, .8) * exp(-sd * 18.);
  // 木の層を奥から手前へ。奥ほど霧にかすむ
  for (int k = 5; k >= 0; k--) {
    float fk = float(k);
    float m = trees(vec2(layerX(p.x, fk), p.y * (1. + fk * .12)), fk, 3. + fk * 2., px * (1. + fk));
    float haze = 1. - exp(-fk * .45);
    vec3 tc = mix(vec3(.02, .03, .025), fogc * .92, haze);
    col = mix(col, tc, m * (.85 + .15 * (1. - haze)));
  }
  // 地面の下草
  float g = smoothstep(-.36, -.42, p.y + noise(vec2(p.x * 14., 1.)) * .05 + noise(vec2(p.x * 60., 3.)) * .015);
  col = mix(col, vec3(.015, .02, .012), g);
  // 光芒: 太陽へ向かって進み、木にさえぎられなかった分だけ光を足す
  vec2 dir = SUN - p;
  float acc = 0., wsum = 0.;
  vec2 q = p + dir * hash(gl_FragCoord.xy) / 24.;
  for (int i = 0; i < 24; i++) {
    float wgt = 1. - float(i) / 24.;
    acc += (1. - occl(q)) * wgt;
    wsum += wgt;
    q += dir / 24.;
  }
  float rays = acc / wsum;
  col += vec3(1., .85, .6) * pow(rays, 3.) * .55 * exp(-sd * .8) * (1. - g * .7);
  O = vec4(film(col * .95), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uM = gl.getUniformLocation(pg, 'M');
    const q = window.THUMB ? 0.35 : 0.6;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform2f(uM, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-underwater', c: 'real', lv: 3,
  t: '浅瀬に揺れる水中の光網', y: 'あさせにゆれるすいちゅうのこうもう',
  tags: ['水中', '海', 'コースティクス', '光芒', 'シェーダー', 'WebGL'],
  d: '晴れた南の海の浅瀬で、水中から白い砂底を撮ったような映像。水面の波で曲がった日光が、砂の上に揺れる網目模様（コースティクス）を作る。上から光の筋が差し、遠くほど赤い光が水に吸われて青緑にかすむ。マウスを上下に動かすと見上げる角度が変わり、水面に丸く明るい空が見える。',
  p: '水は赤い光を最もよく吸収する。進んだ距離に応じて、赤・緑・青の光を別々の速さで弱くする（指数関数の減衰）と、水中らしい青緑色になる。',
  html: `<canvas id="c" role="img" aria-label="水中から見た白い砂の底に揺れる光の網目と、上から差す光の筋"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R, M; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
// 光の網目: 動く点の集まりの「境目」が明るい（ボロノイ図の縁）。2枚をずらして重ねる
float cell(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9., d2 = 9.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(x, y), h = vec2(hash(i + o), hash(i + o + 7.1));
    vec2 r = o + .5 + .4 * sin(T * .9 + 6.28 * h) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
float caustic(vec2 p) {
  p += (vec2(noise(p * .7 + T * .2), noise(p * .7 - T * .2)) - .5) * .8;
  return pow(1. - smoothstep(0., .25, cell(p)), 3.) * .7 + pow(1. - smoothstep(0., .3, cell(p * 1.6 + 5.)), 3.) * .4;
}
const vec3 ABS = vec3(.42, .085, .06);   // 赤・緑・青の吸われやすさ
const vec3 WATER = vec3(.05, .3, .38);
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  float tilt = (M.y - .5) * .6 + sin(T * .23) * .04;
  vec3 ro = vec3(sin(T * .3) * .1, 1.4 + sin(T * .5) * .05, T * .15);
  vec3 rd = normalize(vec3(p.x + sin(T * .4) * .02, p.y - .18 + tilt, 1.));
  vec3 col;
  float dist;
  if (rd.y < 0.) {
    // 砂の底: 砂紋と粒のむらに、光の網目
    float t = -ro.y / rd.y; dist = t;
    vec2 g = (ro + rd * t).xz;
    float ripple = sin(g.x * 4. + fbm(g * .8) * 4.) * .5 + .5;
    vec3 sand = vec3(.9, .82, .62) * (.6 + .25 * ripple + .25 * fbm(g * 12.));
    float cs = caustic(g * 1.2);
    vec3 cc = vec3(caustic(g * 1.2 + .03), cs, caustic(g * 1.2 - .03));   // 色ごとに少しずれる
    col = sand * (.25 + cc * 1.8);
  } else {
    // 水面を下から見る: 真上に近い所だけ空が丸く抜け（スネルの窓）、外は水の中が映る
    float t = (3. - ro.y) / rd.y; dist = t;
    vec2 g = (ro + rd * t).xz;
    vec2 w = vec2(noise(g * 2. + T * .6), noise(g * 2. - T * .5)) - .5;
    float win = smoothstep(.62, .78, normalize(rd + vec3(w.x, 0., w.y) * .25).y);
    col = mix(WATER * .6, vec3(.7, .9, 1.) * 2., win) + vec3(1.5, 1.4, 1.1) * pow(win, 8.) * smoothstep(.8, .95, rd.y) * 2.;
  }
  // 水に吸われて遠くほど青緑にかすむ
  col = col * exp(-dist * ABS) + WATER * (1. - exp(-dist * .12));
  // 光の筋: 視線の上の数か所で、上から差す光の強さを足す
  float sh = 0.;
  for (int i = 1; i <= 10; i++) {
    float s = float(i) * .9 * (1. + hash(gl_FragCoord.xy) * .2);
    vec3 q = ro + rd * s;
    vec2 sp = q.xz - vec2(.25, .4) * (3. - q.y);           // 光が水面から斜めに差す
    sh += pow(noise(sp * vec2(1.2, .3) + vec2(T * .15, 0.)), 3.) * exp(-s * .12) * smoothstep(3.2, 1., q.y);
  }
  col += vec3(.55, .85, .9) * sh * .12;
  // 漂う細かい粒
  vec2 g2 = (p + vec2(T * .01, T * .02)) * 40., id = floor(g2);
  col += vec3(.7, .9, 1.) * step(.97, hash(id)) * exp(-length(fract(g2) - .5) * 14.) * .4;
  O = vec4(film(col * 1.25), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uM = gl.getUniformLocation(pg, 'M');
    let my = 0.5;
    addEventListener('pointermove', (e) => { my = 1 - e.clientY / innerHeight; });
    const q = window.THUMB ? 0.35 : 0.6;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform2f(uM, 0.5, my);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-storm-sea', c: 'real', lv: 3,
  t: '嵐の黒海原と走る稲妻', y: 'あらしのくろうなばらとはしるいなずま',
  tags: ['嵐', '海', '稲妻', '雷', 'シェーダー', 'WebGL'],
  d: '深夜の嵐の海を、揺れる船の甲板から撮ったような映像。ふだんは月明かりほどの暗さで、白い波頭しか見えない。稲妻が光った瞬間だけ、低い黒雲と荒波の形が現れる。本物の雷と同じように、1回の落雷で同じ道筋が2〜3回続けて光る。雲の中だけが光る雷もある。画面を押すと、その場所に雷が落ちる。',
  p: '暗い場面ほど、光った瞬間との明るさの差で迫力が出る。ふだんの明るさを思い切って下げ、雷が光ったときだけ雲と波を照らす。',
  html: `<canvas id="c" role="img" aria-label="夜の荒れた海と、黒雲から海へ落ちる稲妻"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T, F, X, B; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .4 + .6 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .04;
}
// 頂上が丸く盛り上がる波を6つ重ねた海面の高さ
float sea(vec2 p) {
  float h = 0., a = .9, f = .25; vec2 d = vec2(1., .3);
  for (int i = 0; i < 6; i++) {
    float w = .5 + .5 * sin(dot(normalize(d), p) * f + T * sqrt(f) * 1.6);
    h += a * pow(w, 2.5);
    d = mat2(.8, -.6, .6, .8) * d; a *= .48; f *= 1.9;
  }
  return h;
}
// 稲妻の道: 高さごとの横のずれを、いくつもの細かさのゆらぎで決める（ぎざぎざに折れ曲がる）
float boltX(float y, float seed) { return (noise(vec2(y * 3., seed)) - .5) * .25 + (noise(vec2(y * 11., seed + 3.)) - .5) * .09 + (noise(vec2(y * 40., seed + 7.)) - .5) * .025; }
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  float roll = sin(T * .6) * .04, bob = sin(T * .8) * .03;           // 船の揺れ
  p = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * p; p.y += bob;
  float hz = -.02;
  vec2 lp = vec2(X, .45);                                             // 稲妻の光の中心（雲の中）
  float fl = F * F;
  vec3 col;
  if (p.y > hz) {
    // 低い黒雲。光った瞬間だけ、内側から照らされて形が浮かぶ
    vec2 cp = vec2(p.x * 1.2 + T * .03, (p.y - hz) * 2.5);
    float cl = fbm(cp * 2.) * .7 + fbm(cp * 5. + T * .05) * .3;
    float glow = exp(-length((p - lp) * vec2(.8, 1.4)) * 2.2);
    col = vec3(.002, .0025, .004) + vec3(.008, .01, .015) * cl;
    col += vec3(.75, .8, 1.) * F * cl * (glow * 3.5 + .45);
    // 稲妻（B が 0 より大きいときだけ海まで落ちる）
    if (B > 0.) {
      float y = p.y, top = .5;
      float bx = X + boltX(y, B) * smoothstep(top, hz, y) * 1.4;
      float d = abs(p.x - bx) * R.y;
      float core = exp(-d * d * .35) * step(hz, y) * step(y, top);
      float br = 0.;
      for (int k = 0; k < 2; k++) {                                   // 枝分かれ
        float fk = float(k), y0 = .35 - fk * .12, dir = fk > .5 ? 1. : -1.;
        float bx2 = X + boltX(y0, B) * 1.4 + dir * (y0 - y) * .45 + boltX(y * 1.7, B + 9. + fk) * .5;
        float d2 = abs(p.x - bx2) * R.y;
        br += exp(-d2 * d2 * .6) * step(y, y0) * smoothstep(y0 - .25, y0 - .05, y) * .6;
      }
      col += vec3(.85, .9, 1.) * (core * 6. + br * 3.) * F + vec3(.5, .55, .8) * exp(-abs(p.x - bx) * 25.) * F * .4 * step(hz, y);
    }
    // 雨の筋（光ったときによく見える）
    vec2 rp = vec2(p.x * 1. + p.y * .35, p.y) * vec2(90., 4.) + vec2(0., T * 18.);
    col += vec3(.6, .65, .75) * step(.95, hash(floor(rp))) * fract(rp.y) * (.006 + fl * .3);
  } else {
    // 荒れた海: 視線を海面まで進め、面の傾きで稲妻と空の光を映す
    vec3 ro = vec3(0., 2., T * 2.), rd = normalize(vec3(p.x, p.y - hz - .02, 1.4));
    float t = (ro.y - 1.5) / -rd.y;
    for (int i = 0; i < 40; i++) { vec3 q = ro + rd * t; float hh = q.y - sea(q.xz); if (abs(hh) < .003 * t) break; t += hh * .6; }
    vec3 q = ro + rd * t; float e = .08 + t * .004, h0 = sea(q.xz);
    vec3 n = normalize(vec3(h0 - sea(q.xz + vec2(e, 0.)), e, h0 - sea(q.xz + vec2(0., e))));
    float fre = .02 + .98 * pow(1. - max(dot(n, -rd), 0.), 5.);
    vec3 ld = normalize(vec3(X * 6., 4., 12.) - q);
    float foam = smoothstep(.8, 1.3, h0) * smoothstep(.45, .75, noise(q.xz * 1.5 + T * .3));   // 波頭のまだらな白い泡
    col = vec3(.0015, .003, .004) * (1. + fre) + vec3(.025, .03, .04) * foam;
    col += vec3(.7, .75, .9) * F * (fre * 1.1 + max(dot(n, ld), 0.) * .12 + foam * 1.4) * exp(-t * .02);
    col *= exp(-t * .015);
  }
  O = vec4(film(col * 1.4), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const u = (n) => gl.getUniformLocation(pg, n), uR = u('R'), uT = u('T'), uF = u('F'), uX = u('X'), uB = u('B');
    // 雷の予定: 本流のあと、同じ道を2〜3回光り直す（リターンストローク）。雲の中だけ光る雷もある
    let strikes = [], bx = 0, seed = -1, next = 1500;
    function strike(now, x, cloudOnly) {
      bx = x; seed = cloudOnly ? -1 : 1 + Math.random() * 90;
      strikes = [[now, 1]];
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 1; i <= n; i++) strikes.push([now + i * (90 + Math.random() * 160), 0.5 + Math.random() * 0.5]);
    }
    addEventListener('pointerdown', (e) => strike(performance.now(), (e.clientX / innerWidth - 0.5) * innerWidth / innerHeight, false));
    const q = window.THUMB ? 0.35 : 0.6;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      if (now > next) { strike(now, (Math.random() - 0.5) * 1.2, Math.random() < 0.35); next = now + 2500 + Math.random() * 5000; }
      let f = 0;
      for (const [t0, a] of strikes) { const d = now - t0; if (d >= 0) f = Math.max(f, a * Math.exp(-d / 160) * (0.85 + 0.15 * Math.random())); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform1f(uF, f); gl.uniform1f(uX, bx); gl.uniform1f(uB, seed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-stream', c: 'real', lv: 3,
  t: '苔むした岩をすり抜ける渓流', y: 'こけむしたいわをすりぬけるけいりゅう',
  tags: ['川', '渓流', '水', '岩', '長時間露光', 'シェーダー', 'WebGL'],
  d: '深い谷の渓流を、シャッターを長く開けて撮ったような映像。苔むした丸い岩の間を水がすり抜け、流れは絹の糸のような筋になる。水の向きは、岩を避けて回り込む流れの式（流線関数）で決める。水の筋はその向きに沿って引き伸ばす。岩の前で流れがぶつかる所と、すき間で速くなる所は白く泡立つ。濡れた岩は光を反射し、上の面には苔がつく。',
  p: '長時間露光では、動く水は通った道筋の線になり、止まっている岩はくっきり写る。流れの向きに沿って模様を伸ばすだけで、写真で見る絹のような水になる。',
  html: `<canvas id="c" role="img" aria-label="苔むした岩の間を絹のように流れる渓流"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
// 岩: 川床の上に置いた丸い岩（中心・半径）。斜めに見下ろすので、奥ほど小さい
const int NR = 6;
vec3 ROCK(int i) { return vec3[6](vec3(-.55, .7, .26), vec3(.05, 1.25, .32), vec3(.6, .55, .22), vec3(-.15, 2.2, .3), vec3(.7, 1.9, .25), vec3(-.8, 1.6, .2))[i]; }
// 流線関数: 一様な流れ（手前へ）に、岩ごとの「わき出しと吸い込みの対」を足すと、流れが岩を避けて回り込む
float psi(vec2 g) {
  float s = g.x;
  for (int i = 0; i < NR; i++) { vec3 r = ROCK(i); vec2 d = g - r.xy; s -= r.z * r.z * d.x / max(dot(d, d), r.z * r.z); }
  return s;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  // 川床の平面を斜めに見下ろす
  float z = .55 / max(.06, .42 - p.y);
  vec2 g = vec2(p.x * z * 1.6, z * 1.4 - .3);
  float s = psi(g) + (fbm(g * 1.8) - .5) * .06 + (noise(g * 7.) - .5) * .01, e = .01;   // ゆらぎでずらして、きれいすぎる形を崩す
  vec2 grad = vec2(psi(g + vec2(e, 0.)) - s, psi(g + vec2(0., e)) - s) / e;
  float speed = length(grad);                                   // 流線が詰まる所ほど速い
  // 絹の筋: 流線関数の値に沿った細かい縞を、流れの向きに引き伸ばす（長時間露光）
  float along = g.y * .3 + T * .02;
  float silk = noise(vec2(s * 40., along * 3.)) * .6 + noise(vec2(s * 100., along * 6.)) * .4;
  silk = mix(silk, .5, smoothstep(1.6, 3.5, z));                // 遠くは細かい筋が見分けられないので平均する
  float turb = smoothstep(.3, .8, fbm(g * 1.5 + 3.)) * .6 + .4;          // 乱れの強い所ほど白い
  vec3 water = mix(vec3(.04, .055, .05), vec3(.62, .66, .66), clamp(.18 + (silk - .5) * .7 * turb + speed * .22 * turb, 0., 1.));
  // 岩の前でぶつかる所と、すき間で速い所が白く泡立つ
  float rocks = 0., foam = 0.;
  vec3 rc = vec3(0);
  for (int i = 0; i < NR; i++) {
    vec3 r = ROCK(i);
    vec2 d = g - r.xy;
    float dist = length(d * vec2(1., 1.3)) - r.z * (1. + (noise(vec2(atan(d.y, d.x) * 2., float(i))) - .5) * .4 + (noise(vec2(atan(d.y, d.x) * 7., float(i) + 3.)) - .5) * .12);
    float inside = smoothstep(.02, -.02, dist);
    // 丸い岩の陰: 上から見て、手前の上の面ほど明るく、苔が付く
    vec2 nn = d / r.z;
    vec3 n = normalize(vec3(nn.x, sqrt(max(0., 1. - dot(nn, nn))), -nn.y));   // 丸い岩の面の向き
    float dif = max(dot(n, normalize(vec3(-.3, .9, .3))), 0.);
    float spec = pow(max(dot(reflect(vec3(0., -.6, .8), n), normalize(vec3(-.3, .9, .3))), 0.), 24.);
    float moss = smoothstep(.62, .75, fbm(g * 7. + float(i) * 3.) * .7 + n.y * .35);
    vec3 stone = vec3(.035, .033, .032) * (.2 + dif * .9) * (.7 + .5 * fbm(g * 20.)) + vec3(.6, .65, .7) * spec * .18 * (1. - moss);
    stone = mix(stone, vec3(.03, .05, .02) * (.4 + dif), moss);
    rc = mix(rc, stone, inside); rocks = max(rocks, inside);
    foam = max(foam, exp(-max(dist, 0.) * 18.) * smoothstep(.0, .4, -d.y / r.z + .2));   // 岩の上手（奥側）で泡立つ
  }
  water = mix(water, vec3(.85, .88, .9), foam * (.5 + .5 * silk));
  vec3 col = mix(water, rc, rocks);
  col *= mix(.55, 1., smoothstep(-.5, .3, p.y));                 // 手前は少し暗い（谷の影）
  col = mix(col, vec3(.02, .035, .02), smoothstep(.15, .42, p.y) * .75);   // 奥は森の暗い緑が映る
  float trees = smoothstep(.33, .37, p.y - (fbm(vec2(p.x * 8., 2.)) - .5) * .06);     // 奥の岸の森（霧にかすむ）
  col = mix(col, vec3(.03, .045, .035) * (.6 + .6 * fbm(p * vec2(30., 6.))), trees);
  O = vec4(film(col * 1.), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T');
    const q = window.THUMB ? 0.35 : 0.7;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-volcano', c: 'real', lv: 3,
  t: '夜を焦がす火口の溶岩', y: 'よるをこがすかこうのようがん',
  tags: ['火山', '溶岩', '噴煙', 'シェーダー', 'WebGL'],
  d: '日が沈んだあとの薄明かりの中、噴火する火口を高台から望遠で撮ったような映像。火口の溶岩は、冷えて黒く固まった殻がゆっくり動きながら割れる。そのすき間から、まぶしい橙色のマグマが見える。噴き上がる火山弾は、大きな放物線を描いてゆっくり落ちる。もくもくと昇る噴煙は、真下の溶岩の光で下側だけが赤く照らされる。',
  p: '大きな物ほどゆっくり動いて見える。火山弾にかかる重力を小さくして動きを遅くすると、数百メートルの高さを飛ぶ重い岩に見える。',
  html: `<canvas id="c" role="img" aria-label="夜の火口で光る溶岩と、赤く照らされた噴煙"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .4 + .6 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .035;
}
// 溶岩の殻: 動く点の集まりの境目（ボロノイ図の縁）が割れ目になり、そこからマグマが光る
float crack(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9., d2 = 9.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(x, y), h = vec2(hash(i + o), hash(i + o + 3.3));
    vec2 r = o + .5 + .38 * sin(T * .15 + 6.28 * h) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
vec3 heat(float t) { return vec3(1.6, .45, .06) * t + vec3(1.2, .9, .4) * t * t * t * 1.5; }   // 熱い所ほど白っぽい黄
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  // 薄明の空
  vec3 col = mix(vec3(.06, .045, .07), vec3(.01, .015, .035), smoothstep(-.2, .5, p.y));
  // 火口の縁（手前の黒い稜線）と、溶岩の湖（楕円）
  float rim = -.2 + noise(vec2(p.x * 3., 1.)) * .05 + noise(vec2(p.x * 15., 2.)) * .012 - p.x * p.x * .3;
  vec2 lq = (p - vec2(.02, -.21)) * vec2(1.25, 6.);
  float lake = smoothstep(.5, .46, length(lq));
  // 噴煙: 火口から昇って広がる。下ほど溶岩の光で赤い
  vec2 hp = p + vec2(noise(p * 6. + vec2(0, -T)) - .5, 0.) * .01 * smoothstep(.3, -.1, p.y);   // 陽炎
  float py = hp.y + .18;
  vec2 sp = vec2((hp.x - py * .2) / (.2 + py * .8), py * 1.2 - T * .05);
  float plume = (fbm(sp * 1.6 + vec2(0., -T * .02)) * .7 + fbm(sp * 5. - T * .03) * .3 + fbm(sp * 13. + 7.) * .15) * smoothstep(1., .1, abs(sp.x + (fbm(vec2(py * 3., 2.)) - .5) * .6)) * smoothstep(-.02, .08, py) + smoothstep(.6, .0, abs(sp.x)) * .2 * smoothstep(-.02, .1, py);
  float dens = smoothstep(.3, .6, plume);
  vec3 smoke = mix(vec3(.012, .011, .013), vec3(.05, .045, .05), plume) + vec3(1., .28, .05) * exp(-py * 4.) * plume * plume * 1.2;
  col = mix(col, smoke, dens);
  // 火山弾: 大きな放物線をゆっくり描き、光の尾を引く
  for (int i = 0; i < 16; i++) {
    float fi = float(i), h1 = hash(vec2(fi, 4.)), h2 = hash(vec2(fi, 9.)), sz = .2 + 1.6 * pow(hash(vec2(fi, 13.)), 3.);
    float life = fract(T * (.07 + h1 * .05) + h2), t = life * 6.;
    vec2 v0 = vec2((h1 - .5) * .22, .32 + h2 * .18);
    vec2 bp = vec2(.02, -.2) + v0 * t + vec2(0., -.5 * .028 * t * t);
    vec2 vel = v0 + vec2(0., -.028 * t), pa = p - bp, v = vel * .06;
    float k = clamp(dot(pa, v) / dot(v, v), 0., 1.), d = length(pa - v * k) * R.y;
    float cool = 1. - life;
    col += heat(cool) * exp(-d * d * .25 / sz) * cool * step(-.25, bp.y) * 1.2 * sz * step(.25, hash(vec2(fi, floor(T * (.07 + h1 * .05) + h2))));
  }
  // 溶岩の湖: 冷えた殻のすき間で光るマグマ
  if (lake > 0.) {
    vec2 lp = vec2(p.x * 12., (p.y + .21) * 70.) + vec2(T * .05, 0.);
    float cr = crack(lp);
    float hot = pow(1. - smoothstep(0., .07, cr), 3.) * (.5 + .5 * noise(lp * .7 + T * .2)) + smoothstep(.82, 1., noise(lp * .4 + T * .1)) * .5;
    vec3 lava = mix(vec3(.025, .008, .006) + vec3(.12, .02, .0) * noise(lp * 2.), heat(.85), clamp(hot, 0., 1.));
    col = mix(col, lava, lake);
  }
  col += vec3(1., .3, .05) * .25 * exp(-length((p - vec2(.02, -.2)) * vec2(1.2, 3.)) * 3.);   // 溶岩の光で空気が赤い
  float back = -.17 + noise(vec2(p.x * 5., 8.)) * .025;                                     // 奥の火口の壁
  col = mix(col, vec3(.01, .005, .004) + vec3(.4, .08, .01) * smoothstep(.06, 0., back - p.y) * .25, smoothstep(1.5 / R.y, -1.5 / R.y, p.y - back) * smoothstep(-.235, -.2, p.y) * (1. - lake) * smoothstep(.45, .3, abs(p.x)));
  col = mix(col, vec3(.004, .003, .004) + vec3(.35, .06, .01) * exp(-abs(p.y - rim) * 60.) * smoothstep(.4, .0, abs(p.x)) * .5, smoothstep(1.5 / R.y, -1.5 / R.y, p.y - rim));
  O = vec4(film(col * 1.3), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T');
    const q = window.THUMB ? 0.35 : 0.6;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-snow-lamp', c: 'real', lv: 3,
  t: '街灯に舞う深夜のぼたん雪', y: 'がいとうにまうしんやのぼたんゆき',
  tags: ['雪', '街灯', 'ぼけ', '夜', 'シェーダー', 'WebGL'],
  d: '冬の深夜に、暗い路地の街灯を真下近くから見上げて撮ったような映像。雪を奥行きの違う8つの層に分け、ピントが合う中ほどの層だけを小さくくっきり描く。手前の雪は大きく丸くぼけ、奥の雪は細かい粒になる。街灯の光の円すいに入った雪だけが明るく光り、外の雪は暗いままになる。街灯の周りには、湿った空気による大きな光の輪ができる。',
  p: 'ピントが外れた物は、大きくて薄い丸になる。層ごとに雪のぼけの大きさと明るさを変えて重ねると、レンズで撮ったような奥行きが出る。',
  html: `<canvas id="c" role="img" aria-label="夜の街灯の光の中を舞う大粒の雪"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .4 + .6 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .035;
}
const vec2 LAMP = vec2(.18, .42);
// 光の円すいの中ほど明るい（街灯から下へ広がる）
float cone(vec2 p) { vec2 d = p - LAMP; return d.y < 0. ? smoothstep(.85, .15, abs(d.x) / (-d.y + .05)) : 0.; }
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  // 暗い路地: 左右の壁と、街灯の柱
  vec3 col = vec3(.004, .005, .009);
  float wall = smoothstep(.0, .02, abs(p.x) - .55);
  col += vec3(.03, .022, .015) * wall * (.5 + .5 * noise(p * vec2(20., 4.))) * exp(-length(p - LAMP) * 1.5);
  col = mix(col, vec3(.01), smoothstep(.006, .004, abs(p.x - LAMP.x - .02)) * step(LAMP.y + .02, p.y));
  // 湿った空気の中の光の円すいと、街灯の周りの大きな光の輪
  float cn = cone(p);
  col += vec3(1., .55, .2) * cn * .06 * (.8 + .2 * noise(p * 3. + T * .2));
  float ld = length(p - LAMP);
  col += vec3(1., .6, .25) * (exp(-ld * 40.) * 4. + exp(-ld * 7.) * .3 + exp(-ld * 2.5) * .03);
  col += vec3(1., .85, .6) * smoothstep(.025, .015, length((p - LAMP) * vec2(1., 2.5))) * 3.;   // 電球
  // 雪: 奥から手前へ8層。中ほどの層にピントが合う
  for (int k = 7; k >= 0; k--) {
    float fk = float(k), z = 1. + fk * .55;
    float focus = abs(z - 2.6);                                // ピントからの遠さ
    float sc = 5. * z;
    vec2 g = p * sc + vec2(T * .3 + sin(T * .5 + fk) * .4 + fk * 13.7, T * (1.6 / z + .6) + fk * 5.3);   // 層ごとに格子をずらす
    vec2 id = floor(g), f = fract(g) - .5;
    float h = hash(id + fk * 17.);
    if (h < .8 + fk * .015) continue;
    vec2 o = (vec2(hash(id + 3.), hash(id + 7.)) - .5) * .5 + vec2(sin(T * 1.3 + h * 20.) * .12, 0.);   // ひらひら横に揺れる
    float rad = min((.1 + focus * .16) * (.7 + .5 * hash(id + 5.)), .49 - max(abs(o.x), abs(o.y)));   // 格子の外にはみ出さない
    float d = length(f - o);
    float disc = smoothstep(rad, rad * (focus < .4 ? .55 : .15), d);
    float lit = .008 + cone(p) * 1.5 + exp(-length(p - LAMP) * 4.) * .4;
    col += vec3(1., .88, .74) * disc * lit * (1.1 / (1. + focus * focus * 5.)) * (fk < 1.5 ? .5 : 1.);
  }
  // 濡れた地面の照り返し
  col += vec3(1., .55, .2) * smoothstep(-.32, -.5, p.y) * .05 * exp(-abs(p.x - LAMP.x) * 3.);
  O = vec4(film(col * 1.3), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T');
    const q = window.THUMB ? 0.35 : 0.65;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-eclipse', c: 'real', lv: 3,
  t: '皆既日食と真珠色のコロナ', y: 'かいきにっしょくとしんじゅいろのころな',
  tags: ['日食', '太陽', 'コロナ', '天体', 'シェーダー', 'WebGL'],
  d: '望遠鏡で太陽を捉え、月が太陽を隠していく様子を撮ったような映像。最後の光が月の縁の谷間から漏れる瞬間は、強い光の筋を放つダイヤモンドリングになる。皆既日食に入るとカメラの露出が一気に上がり、羽毛のような白いコロナが現れる。コロナは太陽の赤道の向きには長く曲がって伸び、極の向きには短い筆のような筋になる。月の縁には赤いプロミネンスが見える。',
  p: '日食の写真らしさは、露出の変化で出る。太陽が見えている間は露出を下げておく。太陽が隠れた瞬間に露出を上げると、それまで見えなかった淡いコロナが現れる。',
  html: `<canvas id="c" role="img" aria-label="黒い月の周りに広がる白いコロナと、ダイヤモンドリング"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T, D, E; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .5 + .5 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
const float RS = .16, RM = .163;   // 太陽と月の見かけの半径（月が少し大きい）
// 月の縁の山と谷（角度ごとの高さ）
float limb(float a) { return RM + (noise(vec2(a * 18., 3.)) - .5) * .0016 + (noise(vec2(a * 60., 5.)) - .5) * .0007; }
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec2 mc = vec2(D, D * .25);                         // 月の中心（太陽の前を横切る）
  float r = length(p), a = atan(p.y, p.x);
  // コロナ: 太陽からの距離で弱まり、角度ごとに筋が入る。赤道（横）は長く、極（縦）は短い筆のよう
  float eq = pow(abs(cos(a)), 2.);
  float len = mix(.35, 1.6, eq);
  float streak = fbm(vec2(a * 22., log(r) * 1.5)) * .6 + fbm(vec2(a * 70., log(r) * 3.)) * .4;
  float helmet = exp(-pow((abs(a) - 0.) * 3., 2.)) + exp(-pow((abs(a) - 3.14159) * 3., 2.));   // 赤道のヘルメット状の流れ
  float cor = pow(RS / max(r, RS), 3.5 / len) * (.4 + streak * 1.1 + helmet * .5) * smoothstep(RS * .98, RS * 1.02, r);
  vec3 col = vec3(.92, .95, 1.) * cor * .9;
  // プロミネンス（月の縁の赤い炎）
  for (int i = 0; i < 4; i++) {
    float fi = float(i), pa = hash(vec2(fi, 2.)) * 6.28;
    vec2 pp = vec2(cos(pa), sin(pa)) * RS;
    float d = length(p - pp) / (.012 + .01 * hash(vec2(fi, 5.)));
    col += vec3(1., .2, .35) * exp(-d * d) * (.6 + .4 * noise(vec2(a * 80., T))) * 1.5;
  }
  // 太陽の光球（見えている所はとても明るい。縁は暗い = 周辺減光）
  float sun = smoothstep(RS, RS - .002, r) * (.55 + .45 * sqrt(max(0., 1. - r * r / (RS * RS))));
  col += vec3(1., .96, .9) * sun * 60.;
  // 月: 縁の山と谷で切り取る。皆既中は地球からの照り返しで、うっすら地形が見える
  vec2 mp = p - mc;
  float ma = atan(mp.y, mp.x), inMoon = smoothstep(limb(ma) + .0006, limb(ma) - .0006, length(mp));
  vec3 moon = vec3(.012, .013, .016) * (.6 + .8 * fbm(mp * 30.)) * .15;
  col = mix(col, moon, inMoon);
  // ダイヤモンドリング: 縁から漏れる最後の光が強い光の筋と、虹色のゴーストを作る
  vec2 bead = mc + normalize(-mc + vec2(1e-4)) * RM;
  float bb = clamp(1. - abs(D) / .006, 0., 1.) * step(.0004, abs(D));
  vec2 bq = p - bead;
  float star = exp(-length(bq) * 60.) * 4. + (exp(-abs(bq.x) * 900.) * exp(-abs(bq.y) * 9.) + exp(-abs(bq.y) * 900.) * exp(-abs(bq.x) * 9.)) * .8;
  col += vec3(1., .97, .92) * star * bb * 3.;
  vec2 gh = -bead * .7 - p;
  col += vec3(.3, .8, .5) * bb * .15 * smoothstep(.03, .02, length(gh)) + vec3(.7, .3, .9) * bb * .1 * smoothstep(.05, .04, length(-bead * 1.3 - p));
  // 皆既中の空に見える星
  vec2 g = p * 50., id = floor(g);
  col += vec3(.9, .95, 1.) * step(.985, hash(id)) * exp(-length(fract(g) - .5) * 20.) * .02;
  O = vec4(film(col * E), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const u = (n) => gl.getUniformLocation(pg, n), uR = u('R'), uT = u('T'), uD = u('D'), uE = u('E');
    // 月の位置（30秒で太陽の前を横切る）と、それに合わせて自動で変わる露出
    let exp = 0.02;
    const q = window.THUMB ? 0.35 : 0.75;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      const ph = (now / 1000 / 30) % 1, x = ph * 2 - 1;
      const xx = Math.sign(x) * Math.max(0, Math.abs(x) - 0.2) / 0.8;   // 真ん中の 2 割（約 6 秒）は皆既のまま
      const d = Math.sign(xx) * Math.pow(Math.abs(xx), 3) * 0.35;          // 皆既の近くはゆっくり進む
      const seen = Math.min(1, Math.max(0, (Math.abs(d) - 0.0035) / 0.05));   // 太陽の見えている割合のめやす
      const target = seen > 0 ? 0.02 + 0.03 * (1 - seen) : 1.6;
      exp += (target - exp) * (target > exp ? 0.12 : 0.2);
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform1f(uD, d); gl.uniform1f(uE, exp);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-earth-dawn', c: 'real', lv: 3,
  t: '軌道上から見る地球の夜明け', y: 'きどうじょうからみるちきゅうのよあけ',
  tags: ['地球', '宇宙', '大気', '夜景', 'シェーダー', 'WebGL'],
  d: '高度 400 km の宇宙ステーションの窓から、地球の縁と昇る太陽を撮ったような映像。地球の縁では、地球の半径の 1.5% ほどの薄い大気が青い線になって光る。昼と夜の境目の向こうには、海岸に沿って街の灯りが広がる。昼の側の海は太陽の光を鈍く反射し、雲がゆっくり流れる。太陽が地球の縁から現れると大気の色が変わり、光の筋が伸びる。',
  p: '大気の光の強さは、視線が大気の層を通る長さで決まる。地球の縁ぎりぎりを見る視線ほど、大気を長く通るので明るくなる。地球に比べて大気をとても薄くすると、模型ではなく本物の大きさに見える。',
  html: `<canvas id="c" role="img" aria-label="宇宙から見た地球の縁と、薄く光る大気、昇る太陽"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T, S; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float h3(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + 1.7; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .5 + .5 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
const float H = .063, ATM = .015;   // 高度と大気の厚さ（地球の半径を 1 とする）
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec3 sun = normalize(vec3(-.85, S, .9));              // S が大きいほど太陽が昇る
  vec3 ro = vec3(0., 1. + H, 0.);
  vec3 f = normalize(vec3(-.18, -.27, 1.)), r = normalize(cross(f, vec3(0, 1, 0))), u = cross(r, f);
  vec3 rd = normalize(f * 1.15 + p.x * r + p.y * u);
  float b = dot(-ro, rd), c2 = dot(ro, ro) - b * b, h = sqrt(max(c2, 0.));   // 視線が地球の中心へ最も近づく距離
  vec3 col = vec3(0);
  // 星（太陽が出ている間は露出が下がって見えない）
  float bs = dot(-ro, sun), cs = dot(ro, ro) - bs * bs;
  float vis = (bs > 0. && cs < 1.) ? 0. : 1.;              // 太陽が地球に隠れていないか
  vec2 sg = rd.xy / (1. + rd.z) * 300., sid = floor(sg);
  col += vec3(.9, .95, 1.) * step(.993, hash(sid)) * exp(-dot(fract(sg) - .5, fract(sg) - .5) * 60.) * .5 * (1. - vis);
  bool hit = b > 0. && h < 1.;
  if (hit) {
    float t = b - sqrt(1. - c2);
    vec3 n = normalize(ro + rd * t);
    float a = T * .004;                                  // 地球の自転（速めている）
    vec3 m = vec3(n.x * cos(a) - n.z * sin(a), n.y, n.x * sin(a) + n.z * cos(a)) * 3.;
    float l = fbm3(m), landm = smoothstep(.52, .55, l);  // 陸と海
    float sd = dot(n, sun), day = smoothstep(-.06, .12, sd);
    float cl = smoothstep(.5, .75, fbm3(m * 2.3 + vec3(T * .002, 0, 0)));   // 雲
    vec3 ocean = vec3(.006, .02, .06) + vec3(1., .9, .75) * pow(max(dot(reflect(rd, n), sun), 0.), 40.) * .8;   // 海の照り返し
    vec3 ground = vec3(.09, .085, .05) * (.6 + .6 * fbm3(m * 6.));
    vec3 dc = mix(ocean, ground, landm);
    dc = mix(dc, vec3(.9, .92, .95), cl * .85);
    col = dc * day * 1.6;
    // 夜の側: 海岸の近くに街の灯りが集まる。ときどき雷雲が光る
    float coast = exp(-abs(l - .535) * 40.);
    float city = pow(noise3(m * 22.), 4.) * 5. * (.3 + coast * 2.5) + pow(noise3(m * 70.), 6.) * 4.;
    col += vec3(1., .68, .32) * city * landm * (1. - day) * (1. - cl * .85) * 1.2;
    float bolt = step(.997, hash(floor(m.xz * 8.) + floor(T * 3.))) * cl * (1. - day);
    col += vec3(.7, .8, 1.) * bolt * 2.;
    // 縁に近いほど大気が重なり、青く白くかすむ
    float rim = pow(1. - max(dot(n, -rd), 0.), 4.);
    col = col * (1. - rim * .4 * day) + vec3(.35, .6, 1.) * smoothstep(-.2, .2, sd) * rim * .7;
  }
  // 大気の層: 縁ぎりぎりを通る視線ほど明るい。昼の側は青く、昼と夜の境目は赤く
  float alt = h - 1.;
  if (alt > -.002 && alt < ATM * 2. && b > 0.) {
    vec3 L = normalize(ro + rd * b);
    float sl = dot(L, sun);
    float glow = exp(-max(alt, 0.) / (ATM * .28)) * (hit ? .25 : 1.);
    vec3 ac = mix(vec3(1., .97, .92), vec3(.2, .45, 1.), smoothstep(0., ATM * .6, alt));
    col += ac * glow * smoothstep(-.25, .1, sl) * 1.6 + vec3(1., .35, .08) * glow * exp(-pow((sl + .05) * 7., 2.)) * 1.4;
  }
  // 太陽と光の筋（地球に隠れていない間だけ）
  float s = max(dot(rd, sun), 0.);
  col += vec3(1., .95, .85) * vis * (pow(s, 3000.) * 40. + pow(s, 400.) * .8);
  col += vec3(1., .85, .6) * vis * exp(-abs(dot(rd - sun, u)) * 400.) * pow(s, 4.) * .6;   // 横の光の筋
  O = vec4(film(col), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uS = gl.getUniformLocation(pg, 'S');
    const q = window.THUMB ? 0.4 : 0.9;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      const ph = (now / 1000 / 40) % 1;                         // 40 秒で、夜から日の出まで
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform1f(uS, -0.48 + ph * 0.32);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-sea-of-clouds', c: 'real', lv: 3,
  t: '山稜を越える雲海の日の出', y: 'さんりょうをこえるうんかいのひので',
  tags: ['雲海', '山', '日の出', 'レイマーチング', 'シェーダー', 'WebGL'],
  d: '標高の高い山の上から、眼下に広がる雲海と遠い山並みを見下ろして撮ったような映像。山の高さと雲の頂の高さの2つの地形を、視線に沿って一緒にたどる。低い朝日が雲の頂だけを橙色に照らし、谷間には青い影が落ちる。雲は尾根を越えてゆっくり流れ、山と雲の境目はなだらかになじむ。太陽の方向は金色にかすむ。',
  p: '雲海の立体感は、低い位置の太陽で出る。光が横から当たると、雲の頂だけが明るくなり、くぼみは影になる。面の傾きと太陽の向きの内積で明るさを決めればよい。',
  html: `<canvas id="c" role="img" aria-label="山の上から見下ろす雲海と、朝日に染まる雲の頂"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
const vec3 SUN = normalize(vec3(.35, .06, 1.));
// 山: 尾根のとがった地形（ゆらぎの絶対値を折り返す）
float mount(vec2 p) {
  float h = 0., a = 1., f = .12;
  for (int i = 0; i < 5; i++) { float n = 1. - abs(noise(p * f) * 2. - 1.); h += a * n * n; a *= .45; f *= 2.1; }
  return h * 1.5 - 1.25;
}
// 雲海の頂の高さ。ゆっくり流れる
float cloudTop(vec2 p) { return .18 + (fbm(p * .35 + vec2(T * .015, T * .006)) - .5) * .35 + (noise(p * 1.6 + T * .03) - .5) * .05; }
vec3 sky(vec3 rd) {
  float y = max(rd.y, 0.), s = max(dot(rd, SUN), 0.);
  vec3 c = mix(vec3(1.1, .6, .32), vec3(.3, .42, .65), pow(y, .35));
  return c + vec3(1., .75, .45) * (pow(s, 6.) * .8 + pow(s, 600.) * 12.);
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec3 ro = vec3(T * .08, 1.9, T * .15);
  vec3 rd = normalize(vec3(p.x, p.y - .2, 1.3));
  vec3 col = sky(rd), haze = mix(vec3(.42, .5, .66), vec3(1.25, .8, .48), pow(max(dot(rd, SUN), 0.), 3.));
  float t = .3 + hash(gl_FragCoord.xy) * .05, hitT = -1.; int kind = 0;
  for (int i = 0; i < 140; i++) {
    vec3 q = ro + rd * t;
    float hm = mount(q.xz), hc = cloudTop(q.xz);
    if (q.y < hm) { kind = 1; hitT = t; break; }
    if (q.y < hc) { kind = 2; hitT = t; break; }
    t += max(.012, min(q.y - hm, q.y - hc) * .35) + t * .0025;
    if (t > 45.) break;
  }
  if (kind > 0) {
    float lo = max(.3, hitT - .05), hi = hitT;                // 当たった位置を二分法で詰め直す
    for (int k = 0; k < 5; k++) { float m = (lo + hi) * .5; vec3 qm = ro + rd * m; if (qm.y < (kind == 1 ? mount(qm.xz) : cloudTop(qm.xz))) hi = m; else lo = m; }
    hitT = hi;
    vec3 q = ro + rd * hitT; float e = .02 + hitT * .002;
    if (kind == 1) {
      // 山肌: ほぼ影。太陽を向いた尾根だけが少し光る
      float h0 = mount(q.xz);
      vec3 n = normalize(vec3(h0 - mount(q.xz + vec2(e, 0.)), e, h0 - mount(q.xz + vec2(0., e))));
      col = vec3(.02, .028, .045) + vec3(1., .6, .35) * pow(max(dot(n, SUN), 0.), 3.) * .3;
    } else {
      // 雲の頂: 太陽を向いた所は橙、くぼみは青い影。山に近い所は薄く、下の森が透ける
      float h0 = cloudTop(q.xz);
      vec3 n = normalize(vec3((h0 - cloudTop(q.xz + vec2(e, 0.))) * 3., e, (h0 - cloudTop(q.xz + vec2(0., e))) * 3.));
      float lit = smoothstep(-.15, .7, dot(n, SUN));
      vec3 cc = mix(vec3(.28, .34, .52), vec3(1.35, .78, .45), lit) + vec3(1., .7, .45) * pow(max(dot(reflect(rd, n), SUN), 0.), 8.) * .4;
      float thin = smoothstep(.0, .12, h0 - mount(q.xz));
      col = mix(vec3(.04, .05, .06), cc, .35 + .65 * thin);
    }
    col = mix(col, haze, 1. - exp(-hitT * .045));         // 遠いほどかすむ（太陽の向きは金色）
  }
  O = vec4(film(col * .95), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T');
    const q = window.THUMB ? 0.3 : 0.6;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-incense', c: 'real', lv: 3,
  t: '黒背景に昇る一筋の香煙', y: 'くろはいけいにのぼるひとすじのこうえん',
  tags: ['煙', '線香', '流体', 'シェーダー', 'WebGL', '接写'],
  d: '暗い和室で、窓から差す一筋の光の中を昇る線香の煙を接写したような映像。煙は、火種から数センチの間はまっすぐな糸のように昇る（層流）。ある高さからは急に揺れが大きくなり、渦になって崩れる（乱流）。煙は丸い粒の集まりではなく、ねじれる薄い膜として描く。膜を横から見た所ほど、光が重なって明るく見える。火種の先は小さく赤く光り、白い灰が残る。',
  p: '煙の膜は、真横から見ると細く濃く見え、正面から見ると広く薄く見える。膜の向き（ねじれの角度）から見かけの幅を求め、幅が狭い所ほど明るくする。',
  html: `<canvas id="c" role="img" aria-label="暗い部屋で光の中を昇る、一筋の線香の煙"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .4 + .6 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
const float TIP = -.4;   // 火種の高さ
// 1本の煙の膜の明るさ。y は火種からの高さ、k は膜ごとのずらし
float ribbon(vec2 p, float k) {
  float y = p.y - TIP;
  if (y < 0.) return 0.;
  float tur = smoothstep(.12, .45, y);                   // 0: 層流 1: 乱流
  float x = .015 * sin(y * 7. + T * .9 + k) * tur
          + (fbm(vec2(y * (1.6 + fract(k * .29)), k * 3.1 - T * .22)) - .5) * .7 * tur * tur
          + (noise(vec2(y * 8. - T * .8, k + 5.)) - .5) * .1 * tur;
  float w = .003 + .022 * tur * (1. + y);               // 膜の幅（上へ行くほど少し広がる）
  float tw = y * (4. + 9. * fract(k * .37) + 6. * tur) + fbm(vec2(y * 4., k + T * .1)) * 14. + T * (.4 + fract(k * .53));   // 膜のねじれ（筋ごとに周期を変える）
  float pw = w * abs(cos(tw)) + .002 + w * .3;          // 見かけの幅
  float d = (p.x - x) / pw;
  return exp(-d * d) * min(1.8, w / pw) * smoothstep(1.1, .3, y) * (1. - tur * .35);
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  // 窓から斜めに差す光の帯。この中の煙だけが明るく見える
  float beam = smoothstep(.35, .05, abs(dot(p - vec2(-.1, .2), normalize(vec2(1., .65)))));
  vec3 col = vec3(.004, .004, .005) + vec3(.02, .018, .016) * beam;
  float s = ribbon(p, 0.);
  for (int i = 1; i < 5; i++) s += ribbon(p + vec2(float(i) * .004, 0.), float(i) * 3.7) * smoothstep(-.25 + float(i) * .04, .05 + float(i) * .05, p.y) * (.75 - float(i) * .1);   // 乱流で分かれる細い筋
  col += vec3(.72, .78, .9) * s * (.12 + beam * 1.1) * .3;
  // 線香と、火種、白い灰
  float stick = smoothstep(.004, .002, abs(p.x)) * step(p.y, TIP - .012);
  col = mix(col, vec3(.035, .02, .012) * (.6 + beam), stick);
  float ash = smoothstep(.0045, .003, abs(p.x)) * step(TIP - .012, p.y) * step(p.y, TIP - .003);
  col = mix(col, vec3(.35, .34, .32) * (.5 + beam), ash);
  float L = .8 + .2 * noise(vec2(T * 5., 1.));
  col += vec3(1., .25, .05) * exp(-length((p - vec2(0., TIP - .004)) * vec2(1., 1.5)) * 260.) * 3. * L + vec3(1., .3, .1) * exp(-length(p - vec2(0., TIP)) * 60.) * .05 * L;
  O = vec4(film(col * 1.4), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T');
    const q = window.THUMB ? 0.4 : 0.75;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-headlights', c: 'real', lv: 3,
  t: '雨の夜道を裂くヘッドライト', y: 'あめのよみちをさくへっどらいと',
  tags: ['車', '夜', '雨', '濡れた路面', 'シェーダー', 'WebGL'],
  d: '雨の深夜に郊外の道端の低い位置から、向かってくる車を望遠で撮ったような映像。車体は細かく描かず、黒いシルエットと縁の光だけにする。濡れたアスファルトには、ヘッドライトや街灯の光が手前まで長い縦の筋になって映る。雨の中ではヘッドライトの周りに光がにじむ。車が近づくと、レンズの中の反射が緑や紫の小さな丸になって現れる。',
  p: '濡れた路面では、細かいでこぼこの面が少しずつ違う向きに光を反射する。そのため映り込みは縦に長く伸びる。映り込みを縦にだけ引き伸ばすと、濡れた夜道らしくなる。',
  html: `<canvas id="c" role="img" aria-label="雨の夜道を近づいてくる車のヘッドライトと、濡れた路面に伸びる光の筋"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T, Z; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .4 + .6 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .035;
}
// カメラ: 道の脇の低い位置から、道の奥を望遠で見る
const vec3 CAM = vec3(-1.2, .55, 0.);
const float ZOOM = 3.2;
vec2 proj(vec3 w) { vec3 d = w - CAM; d.x -= d.z * .1; return vec2(d.x, d.y - d.z * .006) / d.z * ZOOM; }
// 光の点。近いほど大きく明るい。sharp が大きいほど芯が小さい
vec3 light(vec2 p, vec3 w, vec3 c, float pw) {
  float z = w.z - CAM.z;
  if (z < .5) return vec3(0);
  vec2 s = proj(w);
  float d = length(p - s) * R.y * z / 40.;
  vec3 r = c * pw * (1. / (1. + d * d * 1.5) + exp(-d * .25) * .06);
  // 濡れた路面の映り込み: 地面の下に反転した位置で、縦にだけ長く伸ばす
  vec2 m = proj(vec3(w.x, -w.y, w.z));
  float down = max(0., m.y - p.y);
  vec2 q = (p - m) * R.y * vec2(z / 40. / (1. + down * 6.), z / 900.);   // 手前ほど横にも広がる
  float wob = smoothstep(.3, .8, noise(vec2(p.y * 90., w.x * 3. + w.z))) * .8 + noise(vec2(p.x * 300., p.y * 40.)) * .3;   // 路面のでこぼこで途切れる
  r += c * pw * .35 * exp(-q.x * q.x * .5 - q.y * q.y * .08) * wob * step(p.y, m.y + .002);
  return r;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  float hz = proj(vec3(0., 0., 1e4)).y;
  vec3 col = vec3(.006, .007, .011);
  // 濡れたアスファルトと車線の白線
  if (p.y < hz) {
    float t = (CAM.y) / max(1e-3, (hz - p.y) / ZOOM);
    vec2 g = vec2(CAM.x + (p.x / ZOOM + .1) * t, t);
    col = vec3(.006, .006, .008) * (.7 + .6 * noise(g * vec2(8., 2.)));
    float lane = smoothstep(.08, .04, abs(g.x - 2.)) * step(.5, fract(g.y * .08)) + smoothstep(.1, .05, abs(g.x - 5.2));
    col += vec3(.03) * lane * exp(-t * .02);
  }
  // 街灯（ナトリウム灯）の列
  for (int i = 0; i < 9; i++) {
    float fi = float(i), z = 12. + fi * 22. + (hash(vec2(fi, 3.)) - .5) * 8.;
    col += light(p, vec3(-1.8 - hash(vec2(fi, 5.)) * .6, 5.2 + hash(vec2(fi, 6.)) * .8, z), vec3(1., .5 + hash(vec2(fi, 9.)) * .12, .2), 1.4 + hash(vec2(fi, 7.)) * 1.5);
    if (hash(vec2(fi, 8.)) > .25) col += light(p, vec3(7. + hash(vec2(fi, 4.)) * .5, 5.4, z + 9. + hash(vec2(fi, 2.)) * 6.), vec3(1., .58, .25), 1.2 + hash(vec2(fi, 1.)) * 1.2);
  }
  // 向こうから来る車。近づくほど明るく大きく、黒い車体の縁が街灯に光る
  vec3 hl = vec3(1., .96, .9);
  float near = smoothstep(80., 6., Z);
  col += light(p, vec3(3.4, .65, Z), hl, 22.) + light(p, vec3(4.9, .65, Z), hl, 22.);
  if (Z > 1.5 && Z < 60.) {
    vec2 a = proj(vec3(3.1, 0., Z)), b = proj(vec3(5.2, 1.45, Z));
    vec2 bc = (a + b) * .5, bh = (b - a) * .5;
    float box = smoothstep(.004, 0., max(abs(p.x - bc.x) - bh.x, abs(p.y - bc.y) - bh.y * (1. - .25 * smoothstep(bc.y, b.y, p.y) * abs(p.x - bc.x) / bh.x)));
    float glowMask = exp(-pow(max(0., length((p - proj(vec3(3.4, .65, Z))) * R.y) - 1.), .5) * .2) + exp(-pow(max(0., length((p - proj(vec3(4.9, .65, Z))) * R.y) - 1.), .5) * .2);
    col = mix(col, vec3(.004), box * (1. - clamp(glowMask, 0., 1.)) * .9);
    col += vec3(.5, .45, .4) * box * smoothstep(.006, 0., abs(p.y - (bc.y + bh.y * .85))) * .15;
  }
  // 遠ざかる車の赤いテールランプ
  float zt = 20. + mod(T * 9., 140.);
  col += light(p, vec3(.6, .7, zt), vec3(1., .08, .04), 3.) + light(p, vec3(1.9, .7, zt), vec3(1., .08, .04), 3.);
  // 雨: 光の近くでだけ見える細い斜めの筋
  vec2 rp = vec2(p.x + p.y * .12, p.y) * vec2(160., 6.) + vec2(0., T * 25.);
  float rain = step(.93, hash(floor(rp))) * fract(rp.y);
  col += vec3(.7, .72, .75) * rain * smoothstep(.02, .3, dot(col, vec3(.3))) * .6;
  // レンズの中の反射（ゴースト）: 明るいヘッドライトを画面の中心について反対側へ
  vec2 hs = proj(vec3(4.15, .65, Z));
  col += vec3(.2, .9, .4) * smoothstep(.03, .02, length(p + hs * .6)) * near * .04 + vec3(.7, .3, 1.) * smoothstep(.05, .04, length(p + hs * 1.1)) * near * .025;
  O = vec4(film(col), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uZ = gl.getUniformLocation(pg, 'Z');
    const q = window.THUMB ? 0.35 : 0.7;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      const ph = (now / 1000 / 9) % 1;                         // 9 秒ごとに1台が近づいて通り過ぎる
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform1f(uZ, 160 - ph * 162);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-highway', c: 'real', lv: 3,
  t: '都市高速を流れる光の河', y: 'としこうそくをながれるひかりのかわ',
  tags: ['高速道路', '夜景', '光跡', '長時間露光', 'シェーダー', 'WebGL'],
  d: '夜の高い建物から大きく S 字に曲がる都市高速を見下ろし、シャッターを長く開けて撮ったような映像。こちらへ来る車線は白いヘッドライトの帯になり、向こうへ行く車線は赤いテールランプの帯になる。車線ごとに速さが違い、ところどころにウインカーの橙色の点線やトラックの高い灯りが混じる。画面を押すとシャッターを開ける時間が短くなり、車の光が一つ一つの粒に戻る。もう一度押すと、光の帯に戻る。',
  p: '長時間露光の光跡は、シャッターが開いている間だけ車の灯りの粒を道に沿って引き伸ばすと描ける。粒の位置を時間で動かし、伸ばす長さを露光時間に合わせれば、粒と帯を切り替えられる。',
  html: `<canvas id="c" role="img" aria-label="夜の都市高速を流れる白と赤の光の帯"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T, K; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
// 道の中心線: S 字に曲がる
float cx(float z) { return sin(z * .028) * 22. + sin(z * .011) * 10.; }
// 1本の車線の光。s は道に沿った位置、dir は向き、sp は速さ
float lane(float s, float dir, float sp, float seed) {
  float pos = s * .05 - dir * T * sp * .05;
  float cell = floor(pos), f = fract(pos);
  float h = hash(vec2(cell, seed));
  float car = step(.22, h);                               // この区間に車がいるか
  float at = .2 + .6 * hash(vec2(cell, seed + 3.));        // 区間の中の車の位置
  float len = mix(.02, 1.4, K) * (.7 + .6 * hash(vec2(cell, seed + 5.)));   // 露光の長さの分だけ伸びる（長いと前の車の光跡とつながる）
  float d = (f - at) * dir;
  float prev = step(.22, hash(vec2(cell - dir, seed))) * smoothstep(len, len * .6, d + 1.) * step(d, 0.);   // ひとつ前の区間の車の光跡の続き
  return max(car * smoothstep(len, len * .6, d) * smoothstep(-.015, .0, d), prev * K);
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  // 高い所から斜めに見下ろす。地面の上の位置を求める
  vec3 ro = vec3(0., 34., -8.), rd = normalize(vec3(p.x, p.y - .55, 1.));
  float t = -ro.y / rd.y;
  vec2 g = (ro + rd * t).xz + vec2(0., T * .6);
  float v = g.x - cx(g.y);                                // 道の中心からの横のずれ
  vec3 col = vec3(.008, .01, .016);
  // 周りの街: ビルの屋上と窓の灯り
  vec2 bc = floor(g / vec2(9., 11.));
  float roof = step(.3, hash(bc)) * step(14., abs(v));
  col += vec3(.006, .007, .011) * roof * (.6 + .8 * hash(bc + 1.)) * (.8 + .4 * noise(g * .7));
  vec2 wg = g * vec2(4., 3.);
  col += vec3(1., .82, .55) * step(.975, hash(floor(wg))) * roof * .25 * (.4 + .6 * hash(floor(wg) + 2.)) * exp(-dot(fract(wg) - .5, fract(wg) - .5) * 8.);
  // 道路（防音壁で囲まれた暗い面）と、街灯の光のたまり
  float road = smoothstep(13., 12., abs(v));
  col = mix(col, vec3(.018, .019, .024), road);
  float lampS = fract(g.y / 30.);
  col += vec3(.9, .85, 1.) * road * exp(-pow((lampS - .5) * 30. / 6., 2.)) * exp(-pow((abs(v) - 12.5) / 4., 2.)) * .08;
  col += vec3(1., .9, .8) * exp(-pow((lampS - .5) * 30. * .9, 2.)) * exp(-pow((abs(v) - 12.8) * 2., 2.)) * .6;   // 街灯そのもの
  // 車線: 左の3本は向こうへ（赤）、右の3本はこちらへ（白）
  float s = g.y;
  for (int i = 0; i < 6; i++) {
    float fi = float(i), off = -10. + fi * 4.;
    float dir = fi < 3. ? 1. : -1.;
    float sp = 38. + hash(vec2(fi, 1.)) * 30.;
    float w = .55;
    float L = lane(s, dir, sp, fi) * exp(-pow((v - off) / w, 2.));
    vec3 lc = dir > 0. ? vec3(1., .07, .03) * 1.2 : vec3(1., .93, .82) * 1.6;
    col += lc * L;
    // トラックの高い位置の橙の灯りと、ウインカーの点線
    float truck = step(.85, hash(vec2(floor(s * .05 - dir * T * sp * .05), fi + 9.)));
    col += vec3(1., .5, .1) * lane(s, dir, sp, fi) * truck * exp(-pow((v - off - 1.1) / .35, 2.)) * .8;
    float blink = step(.5, fract(s * .3 - T * 2.)) * step(.92, hash(vec2(floor(s * .05 - dir * T * sp * .05), fi + 4.)));
    col += vec3(1., .55, .1) * blink * lane(s, dir, sp, fi) * exp(-pow((v - off + 1.4) / .3, 2.)) * .9;
  }
  col = mix(col, vec3(.02, .025, .04), 1. - exp(-t * .004));   // 遠くはかすむ
  O = vec4(film(col * 1.3), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uK = gl.getUniformLocation(pg, 'K');
    // 押すと露光時間を切り替える（長いと光の帯、短いと光の粒）
    let longExp = true, k = 1;
    addEventListener('pointerdown', () => { longExp = !longExp; });
    if (window.THUMB) setInterval(() => { longExp = !longExp; }, 4000);
    const q = window.THUMB ? 0.35 : 0.7;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      k += ((longExp ? 1 : 0) - k) * 0.06;
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform1f(uK, k);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-airliner-wing', c: 'real', lv: 3,
  t: '機窓から見る夕暮れの主翼', y: 'きそうからみるゆうぐれのしゅよく',
  tags: ['飛行機', '雲海', '夕焼け', 'シェーダー', 'WebGL'],
  d: '高度1万メートルを飛ぶ旅客機の窓から、夕暮れの主翼と眼下の雲海を撮ったような映像。翼には外板の継ぎ目があり、夕日を鈍く照り返す。乱気流で翼の先が細かく震え、ゆっくり大きくしなる。翼の先の白い閃光灯が2回ずつ瞬き、赤い航法灯が光る。下の雲海は後ろへ速く流れ、窓の縁は丸く暗い。',
  p: '機体の外から全体を描くより、誰もが見たことのある「窓から見た翼」の構図のほうが実写に見えやすい。止まった翼は静止画に見えるので、細かい震えとゆっくりしたしなりを重ねる。',
  html: `<canvas id="c" role="img" aria-label="旅客機の窓から見た夕暮れの主翼と雲海"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .5 + .5 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
const float HZ = .06;   // 雲海の地平線の高さ
vec3 sky(vec2 p) {
  float h = max(p.y - HZ, 0.);
  vec3 c = mix(vec3(1.2, .42, .12), vec3(.3, .1, .08), smoothstep(.0, .07, h));   // 地平線の近くだけ橙
  c = mix(c, vec3(.05, .07, .18), smoothstep(.04, .22, h));                       // 少し上で暗い青へ
  c = mix(c, vec3(.015, .025, .08), smoothstep(.2, .5, h));                       // 上は夜に近い
  return c + vec3(1., .5, .2) * exp(-length((p - vec2(-.42, HZ + .015)) * vec2(1., 2.5)) * 4.) * 1.2;
}
// 下に広がる雲海: 遠近をつけ、後ろ（左）へ流れる。日の沈む側の雲の頭だけが橙に光る
vec3 clouds(vec2 p) {
  float z = 1. / max(.004, HZ - p.y);                          // 雲海までの奥行き（画面の下で約2、地平線で数百）
  vec2 g = vec2(p.x * z * .9 + T * .5, z * 1.3 + T * .35);     // 後ろ（左）と手前へ流れる
  float cl = fbm(g * .45) * .7 + fbm(g * 1.6 + 4.) * .3;
  vec3 top = mix(vec3(.01, .014, .035), vec3(.06, .055, .09), smoothstep(.3, .6, cl));
  top += vec3(1., .45, .18) * pow(smoothstep(.45, .8, cl), 2.) * smoothstep(.5, -.7, p.x) * .7 * (.2 + .8 * smoothstep(2.5, 9., z));   // 光が当たるのは奥の雲だけ
  return mix(top, sky(vec2(p.x, HZ)), 1. - exp(-z * .035));
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec3 col = p.y > HZ ? sky(p) : clouds(p);
  // 翼: 根もと（左下）から先（右）へ伸び、わずかに奥へ反る後退翼。しなりと乱気流の細かい震え
  float flex = sin(T * .55) * .01 + (noise(vec2(T * 11., 1.)) - .5) * .004;
  float s = clamp((p.x + .62) / .98, 0., 1.);
  float le = mix(-.06, .03, s) + flex * s * s;              // 前縁
  float te = mix(-.5, -.03, pow(s, .7)) + flex * s * s;     // 後縁
  float wing = step(p.x, .36) * smoothstep(te - .002, te + .002, p.y) * smoothstep(le + .002, le - .002, p.y);
  if (wing > 0.) {
    float v = clamp((p.y - te) / (le - te), 0., 1.);
    // 白い塗装の翼が、上の空を映して鈍く光る。前縁の近くと夕日の向きが明るい
    // 奥（前縁）ほど浅い角度で見るので、地平線の橙をよく映す。手前は上の青い空を映す
    vec3 refl = sky(vec2(p.x * .5 - .25, HZ + .01 + (1. - v) * .3));
    vec3 base = vec3(.045, .05, .06) * (.5 + .5 * v);
    float fs = fract(s * 7.);
    float seam = smoothstep(.012, .0, min(fs, 1. - fs)) * .6 + smoothstep(.006, .0, abs(v - .72)) * .5;   // 外板の継ぎ目
    col = (base + refl * (.12 + .5 * v * v)) * (1. - seam * .4);
    col += vec3(1., .55, .25) * exp(-pow((v - .82) * 9., 2.)) * exp(-abs(p.x + .38) * 3.) * .8;            // 前縁の近くの照り返し
    col *= .92 + .08 * noise(p * vec2(60., 15.));
  }
  // 翼の先の小さな縦の翼と灯り（赤い航法灯、2回ずつ瞬く白い閃光灯）
  vec2 tip = vec2(.36, .03 + flex);
  float winglet = smoothstep(.004, .0, abs(p.x - tip.x + (p.y - tip.y) * .3) - .006) * step(tip.y - .01, p.y) * step(p.y, tip.y + .07);
  col = mix(col, vec3(.04, .045, .055) + sky(p) * .2, winglet);
  float ph = fract(T / 1.3), strobe = step(ph, .03) + step(.1, ph) * step(ph, .13);
  col += vec3(1., .08, .05) * (exp(-length(p - tip - vec2(-.005, .005)) * 220.) * 4. + exp(-length(p - tip) * 30.) * .12);
  col += vec3(1.) * strobe * (exp(-length(p - tip - vec2(.0, .01)) * 160.) * 10. + exp(-length(p - tip) * 9.) * .5);
  // 窓: 角の丸い旅客機の窓。縁の近くは二重ガラスのくもりで少し白む。外は内装の壁
  vec2 wq = p * vec2(1.15, 1.);
  float win = length(max(abs(wq) - vec2(.36, .3), 0.)) - .17;
  col += vec3(.05, .045, .04) * smoothstep(-.12, .0, win) * (.6 + .4 * noise(p * 3.));
  vec3 wall = vec3(.03, .028, .026) * (.35 + .65 * smoothstep(.6, -.3, p.y)) * (1. - smoothstep(.06, 0., win) * .6);
  wall += vec3(1., .55, .25) * .12 * smoothstep(.025, .0, win) * smoothstep(-.1, .4, p.x) * smoothstep(-.3, .2, p.y);   // 差し込む夕日が、窓の右の縁に当たる
  col = mix(col, wall, smoothstep(-.002, .004, win));
  O = vec4(film(col * .9), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T');
    const q = window.THUMB ? 0.35 : 0.7;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-rocket', c: 'real', lv: 3,
  t: '夜明けを貫くロケット発射', y: 'よあけをつらぬくろけっとはっしゃ',
  tags: ['ロケット', '打ち上げ', '噴射炎', '煙', 'シェーダー', 'WebGL'],
  d: '夜明け前の海岸から遠くの発射台を超望遠で狙い、上がるロケットを追いかけて撮ったような映像。点火すると、本体より何倍も明るい噴射炎が周りの雲と海を照らす。発射台からは白い水蒸気が横へ噴き出し、上がるにつれて太い白煙の柱が伸びる。ロケットは最初とても重そうにゆっくり上がり、だんだん速くなる。カメラは少し遅れて追いかける。',
  p: '大きな物の打ち上げは、最初の数秒がとても遅い。一定の加速度で上がると、高さは時間の2乗で増える（等加速度運動）。そのため、初めはほとんど動かず、あとで一気に速くなる。',
  html: `<canvas id="c" role="img" aria-label="夜明け前の空へ噴射炎と白煙を残して昇るロケット"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T, A, H, C; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .035;
}
// A: 点火してからの秒数（負なら点火前）、H: ロケットの高さ、C: カメラが見ている高さ
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec2 w = vec2(p.x, p.y + C);                       // 世界の位置（カメラが上を追うと、景色は下へ）
  float ign = smoothstep(0., .4, A) * (A > 0. ? 1. : 0.);
  vec2 rk = vec2(0., H);                             // ロケットの位置
  // 夜明け前の空: 上は深い紺、地平線の近くは橙。高く上がるほど暗い
  vec3 col = mix(vec3(.32, .16, .1), vec3(.015, .025, .07), smoothstep(-.3, .5, w.y * .7));
  col = mix(col, vec3(.01, .015, .04), smoothstep(.8, 3., w.y));
  // 発射台の塔と地平線
  float ground = step(w.y, -.33 + noise(vec2(w.x * 6., 1.)) * .01);
  float tower = step(abs(w.x + .06), .012) * step(w.y, -.08) * step(-.33, w.y);
  vec3 lit = vec3(1., .55, .2) * ign * exp(-length(w - vec2(0., -.3)) * 2.5);   // 噴射炎に照らされる
  col = mix(col, vec3(.01, .012, .02) + lit * .5, max(ground, tower));
  // 白煙: 発射台から横へ広がる水蒸気と、ロケットまで伸びる柱
  float side = fbm(vec2(w.x * 3. - sign(w.x) * A * .4, w.y * 6. - A * .1)) * smoothstep(.02, -.15, w.y + .26 - abs(w.x) * .08) * smoothstep(min(A * .25, 1.4), .0, abs(w.x)) * step(0., A);
  float colw = .035 + max(0., H - w.y) * .09;
  float colm = smoothstep(colw, colw * .3, abs(w.x + (noise(vec2(w.y * 2., 3.)) - .5) * .05)) * step(-.32, w.y) * step(w.y, H - .02);
  float column = colm * (.5 + fbm(vec2(w.x * 8., w.y * 3. - A * .2)) * 1.2);
  float smoke = clamp(side + column, 0., 1.);
  vec3 sc = mix(vec3(.1, .1, .13), vec3(.45, .44, .46), fbm(w * 7.));
  sc += vec3(1., .5, .15) * ign * exp(-abs(w.y - rk.y + .05) * 4.) * 2.;   // 炎の近くは橙に照らされる
  col = mix(col, sc, smoothstep(.15, .6, smoke));
  // ロケット本体と噴射炎
  vec2 q = w - rk;
  float body = smoothstep(.006, .004, abs(q.x)) * step(0., q.y) * step(q.y, .09);
  col = mix(col, vec3(.85, .85, .9) * (.6 + .4 * ign), body);
  float flame = exp(-abs(q.x) * (90. - min(q.y, 0.) * 200.)) * exp(min(q.y, 0.) * 18.) * step(q.y, 0.) * ign;
  col += vec3(1., .85, .55) * flame * 6. + vec3(1., .5, .15) * ign * exp(-length(q * vec2(1., .5)) * 9.) * 1.2;
  // 高く上がると、上空の朝日を受けた排気が青白く広がる
  float jelly = smoothstep(1.5, 3., H) * exp(-length((q - vec2(0., -.25)) * vec2(1.2, .8)) * 3.) * fbm(q * 5. + T * .05);
  col += vec3(.55, .75, 1.) * jelly * 1.2;
  O = vec4(film(col), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const u = (n) => gl.getUniformLocation(pg, n), uR = u('R'), uT = u('T'), uA = u('A'), uH = u('H'), uC = u('C');
    let cam = 0;
    const q = window.THUMB ? 0.35 : 0.7;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      // 30 秒ごとに打ち上げをくり返す。点火の 2 秒前から始め、離床後は一定の加速度で上がる
      const a = ((now / 1000) % 30) - 2;
      const hgt = -0.24 + (a > 1.5 ? 0.5 * 0.035 * (a - 1.5) ** 2 : 0);
      const target = Math.max(0, hgt + 0.1);
      cam += (target - cam) * 0.04;                   // カメラは少し遅れて追いかける
      if (a < 0) cam = 0;
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000); gl.uniform1f(uA, a); gl.uniform1f(uH, hgt); gl.uniform1f(uC, cam);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-neon-alley', c: 'real', lv: 3,
  t: '雨上がりの路地裏と水たまり', y: 'あめあがりのろじうらとみずたまり',
  tags: ['路地', 'ネオン', '水たまり', '夜', 'シェーダー', 'WebGL'],
  d: '雨上がりの夜の細い路地で、地面すれすれの水たまりにカメラを近づけて撮ったような映像。壁の看板は文字のない形だけのネオンで、芯は白く飛び、周りの濡れた壁に色がにじむ。水たまりには看板の灯りが逆さに映る。軒先から落ちるしずくが、同心円の波紋を作る。奥の換気口からは白い湯気が出て、逆光で浮かび上がる。',
  p: 'ネオンの色を原色のまま塗ると古いCGに見える。明るさを大きく計算してトーンマッピングで縮めると、芯は白く飛び、縁だけに色が残る。',
  html: `<canvas id="c" role="img" aria-label="雨上がりの路地のネオンと、それを映す水たまりの波紋"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .035;
}
// 路地の中の1点の色（壁・看板・奥の湯気）。rd は視線の向き
vec3 scene(vec3 ro, vec3 rd) {
  vec3 col = vec3(.01, .012, .02);
  float tx = rd.x > 0. ? (1.6 - ro.x) / rd.x : (-1.6 - ro.x) / rd.x;   // 左右の壁まで
  float ty = rd.y > 0. ? (5. - ro.y) / rd.y : 1e9;
  float t = min(tx, ty);
  vec3 q = ro + rd * t;
  if (t == tx) {
    float side = sign(rd.x);
    vec3 wall = vec3(.014, .012, .013) * (.4 + .9 * fbm(q.zy * vec2(2., 6.))) * (.7 + .5 * smoothstep(.0, 1.5, q.y));
    // 看板: 区画ごとに色と形の違う、文字のないネオン
    vec2 cell = floor(vec2(q.z / 3., q.y / 1.2));
    float h = hash(cell + side * 7.);
    vec2 f = vec2(fract(q.z / 3.), fract(q.y / 1.2));
    vec3 nc = h < .33 ? vec3(.1, .9, 1.) : h < .66 ? vec3(1., .15, .6) : vec3(1., .55, .1);
    float flick = h > .85 ? step(.25, noise(vec2(T * 12., h))) : 1.;   // ちらつく蛍光灯
    float tube = smoothstep(.025, .0, abs(f.x - .5) - .12 + .08 * h) * smoothstep(.025, .0, abs(f.y - .5) - .025) + smoothstep(.02, .0, abs(length((f - .5) * vec2(1., 1.6)) - .12)) * step(.5, h);
    float on = step(.68, hash(cell + 2.)) * step(1.3, q.y) * step(q.y, 4.2);
    col = wall + nc * tube * on * flick * 6.;
    col += nc * on * flick * exp(-length((f - .5) * vec2(1., 1.6)) * 4.) * .25;       // 濡れた壁ににじむ色
    // 壁を這う配管（縦と横の細い影）
    float pipe = smoothstep(.03, .0, abs(fract(q.z / 5.7 + side * .3) - .5) * 5.7 - .04) + smoothstep(.02, .0, abs(q.y - 2.6 - side * .3) - .025);
    col *= 1. - min(pipe, 1.) * .6;
  } else col = vec3(.015, .02, .04);
  col = mix(col, vec3(.02, .025, .04), 1. - exp(-t * .025));
  return col;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec3 ro = vec3(0., .12, 0.), rd = normalize(vec3(p.x, p.y + .08, 1.));
  vec3 col;
  if (rd.y > -.002) col = scene(ro, rd);
  else {
    float t = ro.y / -rd.y; vec2 g = (ro + rd * t).xz;
    // 水たまり（手前の広い所）と、粒の見えるアスファルト
    float puddle = smoothstep(.5, .56, fbm(g * .5 + 3.) + .12 - t * .03);
    // 波紋: 軒先から落ちるしずくが、同心円に広がる
    vec2 nrm = vec2(0);
    for (int i = 0; i < 4; i++) {
      float fi = float(i), per = 2. + fi * .7, ph = fract(T / per + hash(vec2(fi, 2.)));
      vec2 c0 = vec2((hash(vec2(fi, floor(T / per + hash(vec2(fi, 2.))))) - .5) * 1.4, 1.2 + hash(vec2(fi, 5.)) * 2.5);
      float d = length(g - c0), r = ph * .9;
      float ring = sin((d - r) * 50.) * exp(-abs(d - r) * 25.) * (1. - ph);
      nrm += normalize(g - c0 + 1e-4) * ring * .05;
    }
    vec3 n = normalize(vec3(nrm.x, 1., nrm.y));
    vec3 rr = reflect(rd, n);
    vec3 refl = scene(ro * vec3(1., -1., 1.) + vec3(0., 0., 0.), normalize(vec3(rr.x, rr.y, rr.z)));
    float fre = .3 + .7 * pow(1. - max(-rd.y, 0.), 5.);
    vec3 asphalt = vec3(.01, .01, .012) * (.5 + 1. * noise(g * 60.)) + refl * .05 * noise(g * 8.);
    col = mix(asphalt, refl * fre * 1.1, puddle);
    col = mix(col, vec3(.02, .025, .04), 1. - exp(-t * .03));
  }
  // 奥の換気口の湯気（逆光で浮かぶ）
  float steam = fbm(vec2(p.x * 4. + T * .1, p.y * 3. - T * .4)) * exp(-length((p - vec2(.18, .12)) * vec2(2.5, 1.5)) * 3.);
  col += vec3(.5, .55, .7) * steam * steam * .6;
  O = vec4(film(col * 1.3), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T');
    const q = window.THUMB ? 0.35 : 0.7;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-train-window', c: 'real', lv: 3,
  t: '夜行列車の車窓を流れる街灯り', y: 'やこうれっしゃのしゃそうをながれるまちあかり',
  tags: ['列車', '車窓', '夜景', '視差', 'シェーダー', 'WebGL'],
  d: '明かりを落とした夜行列車の座席から、窓の外を流れる街の灯りを撮ったような映像。景色は遠い・中ほど・すぐ前の3層に分け、近いほど速く流す（視差）。遠くの高い建物の赤い灯りはゆっくり動く。中ほどの家の窓や踏切の赤い点滅は速く、すぐ前の架線柱の影は一瞬で横切って大きくぶれる。ときどき駅を通り過ぎ、白い光が車内まで照らす。線路の継ぎ目で窓が小さく揺れ、ガラスには車内の暖かい灯りが薄く映る。',
  p: '奥行きは、動く速さの違いで伝わる。遠い物ほど遅く、近い物ほど速く流すだけで、平らな画面に立体の景色が生まれる（運動視差）。',
  html: `<canvas id="c" role="img" aria-label="夜行列車の窓の外を流れていく街の灯り"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .035;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  float jolt = exp(-fract(T / .55) * 18.) * .006 + exp(-fract(T / .55 - .18) * 18.) * .004;   // 線路の継ぎ目の揺れ
  p.y += jolt;
  float run = T * 1.;
  // 駅（約 22 秒ごとに数秒）とトンネル（約 37 秒ごとに数秒）
  float st = smoothstep(.0, .05, fract(T / 22.)) * smoothstep(.2, .15, fract(T / 22.));
  float tn = smoothstep(.55, .57, fract(T / 37.)) * smoothstep(.68, .66, fract(T / 37.));
  vec3 col = vec3(.008, .01, .02) + vec3(.02, .02, .03) * smoothstep(.1, -.3, p.y);
  // 遠い層: 高い建物と赤い航空障害灯（ゆっくり）
  float xf = p.x + run * .02;
  float bh = .05 + hash(vec2(floor(xf * 8.), 1.)) * .22;
  col = mix(col, vec3(.012, .013, .02), step(p.y, -.02 + bh) * step(-.2, p.y));
  col += vec3(1., .2, .1) * step(.6, hash(vec2(floor(xf * 8.), 3.))) * exp(-length(vec2(fract(xf * 8.) - .5, (p.y + .02 - bh) * 8.)) * 9.) * step(.5, fract(T * .8 + hash(vec2(floor(xf * 8.), 5.)))) * 1.5;
  // 中ほどの層: 家の窓の灯りと街灯、踏切の赤い点滅（速い）
  float xm = p.x + run * .45;
  vec2 hc = floor(vec2(xm * 14., (p.y + .25) * 30.));
  float house = step(p.y, -.15 + hash(vec2(floor(xm * 4.), 7.)) * .07) * step(-.32, p.y);
  col = mix(col, vec3(.01, .009, .012), house);
  col += vec3(1., .72, .4) * step(.86, hash(hc)) * house * .5 * smoothstep(.5, .2, abs(fract(xm * 14.) - .5)) * smoothstep(.5, .3, abs(fract((p.y + .25) * 30.) - .5));
  float lamp = exp(-length(vec2((fract(xm * 1.3) - .5) * 1.5, (p.y + .05) * 2.)) * 12.);
  col += vec3(1., .8, .55) * lamp * .5;
  float crossing = step(.85, hash(vec2(floor(xm * .7), 9.)));
  col += vec3(1., .05, .02) * crossing * step(.5, fract(T * 1.5)) * exp(-length(vec2(fract(xm * .7) - .5, p.y + .12) * vec2(3., 6.)) * 10.) * 3.;
  // 駅: 白い光の柱が並び、車内まで照らす
  col += vec3(.9, .95, 1.) * st * (.4 + .6 * step(.5, fract(p.x * 3. + run * 2.))) * smoothstep(.4, -.2, p.y) * .8;
  // すぐ前の架線柱: 一瞬で横切り、大きくぶれる
  float xn = fract(p.x * .5 + run * 1.7);
  float pole = smoothstep(.06, .0, abs(xn - .5) - .02) * step(.4, hash(vec2(floor(p.x * .5 + run * 1.7), 2.)));
  col *= 1. - pole * .85;
  col *= 1. - tn * .95;                               // トンネルの中は暗い
  // 窓のガラス: 車内の暖かい灯りが薄く映る（トンネルの中では強く見える）
  vec3 inside = vec3(.06, .04, .025) * (smoothstep(.1, -.4, p.y) + exp(-length(p - vec2(-.5, .35)) * 4.) * .6) * (1. + tn * 2.);
  col += inside * .6 + vec3(.15, .14, .12) * st * .4;
  // 窓枠
  vec2 wq = abs(p) - vec2(.78, .4);
  float frame = smoothstep(-.005, .005, length(max(wq, 0.)) + min(max(wq.x, wq.y), 0.) - .04);
  col = mix(col, vec3(.03, .025, .022) * (1. + st * 4. + tn * 0.), frame);
  O = vec4(film(col * 1.3), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T');
    const q = window.THUMB ? 0.35 : 0.7;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
}, {
  id: 'real-lighthouse', c: 'real', lv: 3,
  t: '濃霧の岬を回す灯台の光', y: 'のうむのみさきをまわすとうだいのひかり',
  tags: ['灯台', '霧', '光の帯', '夜', 'シェーダー', 'WebGL'],
  d: '夜の岬で、深い海霧の中に立つ白い灯台を、少し離れた岩場から撮ったような映像。灯台から出る2本の光の帯が、霧の中で奥から手前へ立体的に回る。視線に沿って霧の中を少しずつ進み、光の帯にある霧の濃さを足し合わせて描く（レイマーチング）。光がこちらを向いた瞬間は、前へ強く散る光で画面が白く飛ぶ。霧は風に流されて濃い所と薄い所ができる。足元の岩に打ち寄せる波のしぶきが、上からの光で照らされる。',
  p: '霧の粒は、光を進む向きへ強く散らす（ミー散乱）。光の帯がカメラの方を向いたときだけ急に明るくすると、ただの半透明の三角形ではなく、霧の中の本物の光に見える。',
  html: `<canvas id="c" role="img" aria-label="霧の夜の岬で回る灯台の2本の光の帯"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .035;
}
const vec3 LAMP = vec3(1.2, 2.6, 9.);
// 霧の濃さ: 風に流される濃淡。上ほど薄い
float fog(vec3 q) { return (.35 + .9 * fbm(q.xz * .25 + vec2(T * .12, T * .03) + q.y * .3)) * exp(-max(q.y, 0.) * .25); }
// 回る光の帯の強さ（2本、反対向き）
float beam(vec3 q) {
  vec3 d = q - LAMP; float a = T * .9;
  vec2 bd = vec2(cos(a), sin(a));
  float al = dot(d.xz, bd);
  float w = length(d.xz - bd * al) + abs(d.y) * .6;
  float k = exp(-w * w / max(.06, abs(al) * .1) * .5) / (1. + abs(al) * .04);
  return k;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec3 ro = vec3(0., 1.2, 0.), rd = normalize(vec3(p.x, p.y + .05, 1.4));
  // 視線に沿って霧の中を進み、光の帯の中の霧の濃さを足す
  vec3 acc = vec3(0); float tr = 1.;
  float a = T * .9;
  vec3 bdir = normalize(vec3(cos(a), 0., sin(a)));
  float face = max(max(dot(-rd, bdir), dot(-rd, -bdir)), 0.);           // 光がこちらを向いている度合い
  float mie = .25 + 6. * pow(face, 30.);                                    // 前へ強く散る（ミー散乱）
  float jit = hash(gl_FragCoord.xy + fract(T) * 41.);
  for (int i = 0; i < 28; i++) {
    float t = (float(i) + jit) * .55;
    vec3 q = ro + rd * t;
    float f = fog(q) * .09;
    acc += tr * f * vec3(1., .92, .75) * beam(q) * mie * 9.;
    acc += tr * f * vec3(.03, .04, .055);                                   // 霧そのもののかすかな明るさ
    tr *= exp(-f * .9);
  }
  vec3 col = acc;
  // 灯台: 白い塔と光る灯室（霧の向こうでかすむ）
  vec2 lp = vec2(.12, .36);
  float towerW = mix(.035, .022, smoothstep(-.25, .3, p.y));
  float tower = smoothstep(.003, -.003, abs(p.x - lp.x) - towerW) * step(-.25, p.y) * step(p.y, lp.y - .02);
  col = mix(col, vec3(.06, .065, .075) * (.6 + .4 * smoothstep(lp.x + towerW, lp.x - towerW, p.x)), tower * .8);
  col += vec3(1., .9, .7) * exp(-length(p - lp) * 70.) * (3. + 30. * pow(face, 40.)) + vec3(1., .85, .6) * exp(-length(p - lp) * 6.) * .2 * (1. + 4. * pow(face, 30.));
  // 岩場と、打ち寄せる波の飛沫
  float rock = step(p.y, -.22 + fbm(vec2(p.x * 4., 1.)) * .12 - smoothstep(.2, -.6, p.x) * .1);
  col = mix(col, vec3(.008, .009, .011), rock);
  float spray = fbm(vec2(p.x * 6. - T * .3, p.y * 8. + T)) * smoothstep(-.1, -.25, p.y) * smoothstep(-.32, -.22, p.y) * step(.55, fbm(vec2(p.x * 2. + T * .2, 3.)));
  col += vec3(.5, .55, .6) * spray * .25 * (1. + pow(face, 10.) * 3.);
  O = vec4(film(col * 1.4), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T');
    const q = window.THUMB ? 0.3 : 0.55;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
});
dekiru.add({
  id: 'real-shore-walker', c: 'real', lv: 3,
  t: '夕凪の浅瀬を歩く人の影', y: 'ゆうなぎのあさせをあるくひとのかげ',
  tags: ['人物', '歩き', '逆光', '夕日', 'シェーダー', 'WebGL'],
  d: '夕日の沈む浅瀬を、人が逆光の中で歩いていく映像。体は影になり、輪郭だけが夕日で金色に縁取られる。地面に着いた足が滑らないよう、足を置く場所を先に決めてから膝の曲がりを逆算している（逆運動学）。スカートの裾と髪の束は、体より少し遅れて揺れる。足を下ろすたびに水面に輪が広がり、人の姿が逆さに映る。太陽の前を通ると、まぶしさが一瞬さえぎられる。',
  p: '人の動きは、少しでも不自然だとすぐに気づかれる。逆光の影にすると顔や服の細部を描かずに済む。歩き方の自然さと輪郭の光だけで本物らしく見せられる。',
  html: `<canvas id="c" role="img" aria-label="夕日の浅瀬を、逆光の中で人が歩いていく映像"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; uniform vec2 B; uniform float S; uniform float V; uniform vec2 J[18]; uniform vec4 RP[4]; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .5 + .5 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .035;
}
const float HZ = .02, CH = .876, WD = .03;   // 水平線の高さ、カメラの高さ（m）、足首までの水の深さ（身長が1）
const vec2 SUN = vec2(.16, .055);
vec3 sky(vec2 p) {
  float h = p.y - HZ, ds = length((p - SUN) * vec2(1., 1.3));
  vec3 c = mix(vec3(1.25, .5, .18), vec3(.45, .2, .17), smoothstep(.0, .1, h));
  c = mix(c, vec3(.07, .07, .15), smoothstep(.06, .32, h));
  c = mix(c, vec3(.012, .018, .05), smoothstep(.28, .6, h));
  c += vec3(1., .5, .2) * (exp(-ds * 5.) * .7 + exp(-ds * 18.) * 1.1);
  // 横に伸びた薄い雲。下から照らされて、太陽の近くほど橙に光る
  float cl = fbm(vec2(p.x * 1.4 + T * .004, h * 13.)) * smoothstep(.06, .13, h) * smoothstep(.42, .16, h);
  cl = smoothstep(.42, .72, cl);
  c = mix(c, vec3(.1, .06, .09) + vec3(1., .45, .2) * exp(-ds * 3.) * .9, cl * .85);
  float sd = length(p - SUN);
  c += vec3(1.6, .9, .45) * 6. * smoothstep(.029, .026, sd) * (.7 + .3 * sqrt(max(0., 1. - sd / .028))) * smoothstep(HZ - .004, HZ + .006, p.y);
  return c;
}
float cap(vec2 p, vec2 a, vec2 b, float r1, float r2) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - mix(r1, r2, h); }
float smin(float a, float b, float k) { float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float quad(vec2 p, vec2 v0, vec2 v1, vec2 v2, vec2 v3) {
  vec2 v[4] = vec2[4](v0, v1, v2, v3);
  float d = dot(p - v0, p - v0), s = 1.;
  for (int i = 0, j = 3; i < 4; j = i, i++) {
    vec2 e = v[j] - v[i], w = p - v[i], b = w - e * clamp(dot(w, e) / dot(e, e), 0., 1.);
    d = min(d, dot(b, b));
    bvec3 k = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(k) || all(not(k))) s = -s;
  }
  return s * sqrt(d);
}
float leg(vec2 p, vec2 k, vec2 a, vec2 t) {
  float d = cap(p, J[0], k, .056, .037);
  d = smin(d, cap(p, k, a, .036, .021), .02);
  return smin(d, cap(p, a + vec2(-.028, -.024), t, .02, .011), .02);
}
float arm(vec2 p, vec2 e, vec2 w) {
  float d = cap(p, J[9], e, .03, .024);
  d = smin(d, cap(p, e, w, .023, .016), .01);
  return smin(d, cap(p, w, w + normalize(w - e) * .055, .019, .011), .008);
}
// 人の形（身長を1とする長さ。J は腰・首・頭・膝・足首・つま先・肩・ひじ・手首・裾・髪の束の位置）
float person(vec2 p) {
  vec2 bb = p - vec2(0., .5);
  if (dot(bb, bb) > .6) return length(bb) - .7;
  float d = cap(p, J[0] + vec2(-.005, .02), J[1], .06, .05);
  d = smin(d, cap(p, J[0] + vec2(.02, .17), J[1] + vec2(.02, -.08), .045, .05), .03);
  d = smin(d, cap(p, J[1] + vec2(0., -.01), J[2] + vec2(-.012, -.05), .026, .023), .02);
  float hd = (length((p - J[2]) / vec2(.058, .066)) - 1.) * .058;
  hd = smin(hd, length(p - J[2] - vec2(.054, -.018)) - .011, .01);   // 鼻
  hd = smin(hd, length(p - J[2] - vec2(.036, -.056)) - .017, .015);  // あご
  d = smin(d, hd, .015);
  d = min(d, length(p - J[2] - vec2(-.013, .013)) - .066);          // 髪
  vec2 tb = J[2] + vec2(-.062, .03);
  d = smin(d, cap(p, tb, J[16], .026, .02), .015);
  d = smin(d, cap(p, J[16], J[17], .02, .006), .012);
  d = min(d, leg(p, J[3], J[4], J[5]));
  d = min(d, leg(p, J[6], J[7], J[8]));
  d = min(d, arm(p, J[10], J[11]));
  d = min(d, arm(p, J[12], J[13]));
  d = smin(d, quad(p, J[0] + vec2(-.066, .1), J[0] + vec2(.056, .1), J[15], J[14]) - .006, .012);   // スカート
  return d;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y + vec2(sin(T * .7), sin(T * .93 + 1.)) * .0015;   // わずかな手ぶれ
  float px = 1. / R.y;
  vec3 col;
  if (p.y >= HZ) col = sky(p);
  else {
    // 水面: 遠い沖ほど波で荒れて夕日の光の道ができ、手前の浅瀬は鏡のように静か
    float z = CH / max(1e-4, HZ - p.y);
    vec2 g = vec2(p.x * z, z);
    float rough = mix(.01, .07, smoothstep(5., 30., z));
    vec2 sl = vec2(noise(g * vec2(1.5, 3.) + vec2(3., -T * .7)) - .5, noise(g * vec2(.7, 1.6) + vec2(0., -T * .45)) - .5) * rough * 2.;
    sl.y += (noise(g * vec2(4., 9.) + vec2(T * .3, -T * 1.4)) - .5) * rough;
    sl.y += sin(g.y * 16. + noise(g * 1.5) * 5. - T * 1.8) * .006 * smoothstep(12., 3., z);   // 手前のさざ波
    float zp = CH / max(1e-4, HZ - B.y);
    for (int i = 0; i < 4; i++) {            // 足を下ろした所から広がる輪
      vec4 r = RP[i];
      vec2 dv = g - vec2(r.x * zp, zp);
      float dd = length(dv), rr = r.y * .3;
      sl += dv / (dd + .01) * sin((dd - rr) * 45.) * exp(-abs(dd - rr) * 20.) * exp(-r.y * 1.1) * r.z * .03;
    }
    vec3 refl = sky(vec2(p.x + sl.x * .5, 2. * HZ - p.y + sl.y));
    if (p.y < B.y) {                         // 人の姿が水面に逆さに映る
      vec2 rp = vec2(p.x + sl.x * .3, 2. * B.y - p.y + sl.y * .5);
      float dr = person((rp - B) / S + vec2(0., WD)) * S;
      refl = mix(refl, vec3(.012, .009, .01), smoothstep(px * 1.5, -px * 1.5, dr) * .92);
    }
    float cs = CH / sqrt(CH * CH + z * z), fre = .02 + .98 * pow(1. - cs, 5.);   // 浅い角度ほどよく映す
    float rip = smoothstep(-.3, .9, sin(g.y * 45. + g.x * 6. + noise(g * 3.) * 9.)) * smoothstep(9., 3., z);   // 砂紋（10cm ほどの間隔。遠くは細かすぎるので消す）
    vec3 sand = vec3(.03, .022, .018) * (.55 + .5 * rip) * (.7 + .6 * noise(g * 8.));   // 水の底の砂（逆光で暗い）
    col = mix(sand, refl, fre);
    float bar = smoothstep(.6, .66, fbm(g * vec2(.35, .6) + 2.)) * smoothstep(14., 6., z);   // 水から少し出た砂州
    col = mix(col, sand * 1.3 + refl * .14, bar);
  }
  // 人: 体は影になり、輪郭だけが夕日で光る。太陽に近い所ほど強く、髪の縁は光が外へにじむ
  vec2 pp = (p - B) / S + vec2(0., WD);
  float d = person(pp), ds = d * S;
  if (ds < .04) {
    float e = .002;
    vec2 n = normalize(vec2(person(pp + vec2(e, 0.)) - d, person(pp + vec2(0., e)) - d) + 1e-7);
    float above = smoothstep(WD - .004, WD + .004, pp.y);
    float m = smoothstep(px, -px, ds) * above;
    float near = exp(-length(p - SUN) * 4.);
    float rim = (.2 + .8 * max(0., dot(n, normalize(SUN - p)))) * (.3 + near * 3.5);
    float hair = smoothstep(.84, .92, pp.y);
    vec3 body = vec3(.006, .005, .005) + vec3(.004, .004, .007) * (.5 + .5 * n.y);
    float band = smoothstep(-px * (1.8 + 3. * hair), 0., ds);           // 輪郭の内側の、ごく細い帯だけが光る
    body += vec3(1.3, .65, .3) * rim * band * band * .8;
    col = mix(col, body, m);
    col += vec3(1.2, .6, .28) * rim * exp(-max(ds, 0.) / (px * (1. + 4. * hair))) * .3 * (1. - m) * above;
  }
  // 太陽のまぶしさ（人が前を通るとさえぎられる）と、レンズの中で反射した光
  float dsn = length(p - SUN);
  col += vec3(1., .55, .25) * (exp(-dsn * 9.) * .25 + exp(-dsn * 35.) * .9) * V + vec3(.008, .005, .003) * V;
  for (int i = 0; i < 3; i++) {
    float k = float(i), t = -.5 - k * .45;
    col += vec3(.5, .35, .2) * (.3 + .3 * k) * smoothstep(.05 + k * .03, .04 + k * .025, length(p - SUN * t)) * .05 * V;
  }
  O = vec4(film(col * 1.1), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const U = n => gl.getUniformLocation(pg, n);
    const uR = U('R'), uT = U('T'), uB = U('B'), uS = U('S'), uV = U('V'), uJ = U('J'), uRP = U('RP');
    const q = window.THUMB ? 0.35 : 0.75;
    // 歩き方（長さは身長を1とする）。一歩の長さ・1秒の歩数・太もも・すね・足首の高さ
    const LS = .33, F = 1.3, TL = .25, SL = .25, AH = .045, WD = .03;
    const SC = .33, FY = -.17, SUN = [.16, .055], SR = .028;   // 画面での背の高さ、足元の水面の高さ、太陽
    const J = new Float32Array(36), RPa = new Float32Array(16);
    const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    // 2本の骨の長さから、腰と足首を結ぶ膝の位置を逆算する（膝は前へ曲がる）
    function knee(hx, hy, ax, ay) {
      const dx = ax - hx, dy = ay - hy, d = Math.min(Math.hypot(dx, dy), TL + SL - 1e-4);
      const a = (TL * TL - SL * SL + d * d) / (2 * d), h = Math.sqrt(Math.max(0, TL * TL - a * a));
      const ux = dx / d, uy = dy / d;
      let px = -uy, py = ux; if (px < 0) { px = -px; py = -py; }
      return [hx + ux * a + px * h, hy + uy * a + py * h];
    }
    // 片足の足首とつま先。着いている足はつま先を支点にかかとを上げ、浮いている足は次の置き場所へ弧を描いて進む
    function foot(n, u, swing, hipX) {
      if (!swing) {
        const plant = LS * n + LS / 2, a = .55 * ss(-.06, -.2, plant - hipX);
        const tx = plant + .12, ty = .01, v = rot(-.12, .035, -a);
        let ax = tx + v[0], ay = ty + v[1], toe = [tx, ty];
        if (u < .12) { const w = rot(.12, -.035, .22 * (1 - u / .12)); toe = [ax + w[0], ay + w[1]]; }   // かかとから着いた直後はつま先が上がる
        return [ax, ay, toe[0], toe[1]];
      }
      const from = LS * (n - 1) + LS / 2, a0 = .55 * ss(-.06, -.2, -LS / 2);
      const v0 = rot(-.12, .035, -a0), A0x = from + .12 + v0[0], A0y = .01 + v0[1];
      const es = ss(.05, .95, u), to = LS * (n + 1) + LS / 2;
      const ax = A0x + (to - A0x) * es, ay = A0y + (AH - A0y) * es + .055 * Math.sin(Math.PI * es);
      const w = rot(.12, -.035, -a0 + (.22 + a0) * es);
      return [ax, ay, ax + w[0], ay + w[1]];
    }
    let tail = null, hemB = -.08, hemF = .08, last = 0, lastN = -1, cyc = -1, start = -1, lastBase = null;
    const plants = [];
    function frame(now) {
      if (start < 0) start = now;
      const t = (now - start) / 1000, asp = innerWidth / innerHeight, X0 = -asp / 2 - .25;
      const vx = LS * F * SC, P = (asp + .5) / vx + 2.5;            // 画面を横切る速さと、1周の秒数
      const t0 = (SUN[0] - .45 - X0) / vx;                           // 最初は太陽の左から歩き始め、数秒で太陽の前を通る
      const tt = t + t0, ci = Math.floor(tt / P), tw = tt - ci * P;
      const dt = Math.min(.05, Math.max(0, t - last)); last = t;
      if (ci !== cyc) { cyc = ci; tail = null; lastBase = null; plants.length = 0; lastN = -1; }
      const st = tw * F, n = Math.floor(st), u = st - n, hipX = LS * st;
      const hipY = .5 + .012 * Math.cos(2 * Math.PI * (u - .5));     // 着いた足の真上に来たとき、腰がいちばん高い
      const fe = [foot(n, u, n % 2 === 0, hipX), foot(n, u, n % 2 === 1, hipX)];
      if (n !== lastN) {                                             // 足を下ろした場所を、水面の輪のために覚える
        if (lastN >= 0) plants.unshift([X0 + SC * (LS * n + LS / 2 + .03), tw]);
        plants.length = Math.min(plants.length, 4); lastN = n;
      }
      const Bx = X0 + SC * hipX;
      const nk = [hipX + .035, hipY + .3], hd = [nk[0] + .025, nk[1] + .115], sh = [nk[0] - .01, nk[1] - .03];
      const put = (i, x, y) => { J[i * 2] = x - hipX; J[i * 2 + 1] = y; };
      put(0, hipX, hipY); put(1, nk[0], nk[1]); put(2, hd[0], hd[1]); put(9, sh[0], sh[1]);
      const ks = [];
      fe.forEach((f, k) => {
        const kn = knee(hipX, hipY, f[0], f[1]); ks.push(kn[0]);
        put(3 + k * 3, kn[0], kn[1]); put(4 + k * 3, f[0], f[1]); put(5 + k * 3, f[2], f[3]);
        const a = -1.3 * (f[0] - hipX), b = a + .2 + .3 * Math.max(0, a);   // 腕は反対側の脚と逆に振れ、前に出るとひじが曲がる
        const el = [sh[0] + Math.sin(a) * .16, sh[1] - Math.cos(a) * .16];
        put(10 + k * 2, el[0], el[1]); put(11 + k * 2, el[0] + Math.sin(b) * .15, el[1] - Math.cos(b) * .15);
      });
      // スカートの裾は膝を追いかけて、少し遅れて揺れる。海風で後ろへなびく
      const k8 = 1 - Math.exp(-dt * 7);
      hemF += (Math.max(...ks) + .05 - hipX - hemF) * k8; hemB += (Math.min(...ks) - .09 - hipX - hemB) * k8;
      J[28] = hemB + Math.sin(t * 2.3) * .008; J[29] = .29 + Math.sin(t * 3.1) * .006; J[30] = hemF; J[31] = .31;
      // 髪の束: 2つの点を、重さとばねで頭の動きに遅れてついてこさせる
      const base = [hd[0] - .062, hd[1] + .03];
      if (!tail) tail = [[base[0] - .02, base[1] - .07], [base[0] - .03, base[1] - .14]].map(v => [v[0], v[1], v[0], v[1]]);
      const bv = lastBase ? [base[0] - lastBase[0], base[1] - lastBase[1]] : [0, 0]; lastBase = base;
      for (const pt of tail) {   // 揺れは頭の動きを基準に弱める（地面を基準にすると、向かい風を受けたように後ろへなびく）
        const vx2 = bv[0] + (pt[0] - pt[2] - bv[0]) * .9, vy2 = bv[1] + (pt[1] - pt[3] - bv[1]) * .9;
        pt[2] = pt[0]; pt[3] = pt[1];
        pt[0] += vx2 - .8 * dt * dt; pt[1] += vy2 - 5.8 * dt * dt;   // 重さ（身長1.7mなら 9.8m/s² が 5.8）と海風
      }
      for (let it = 0; it < 3; it++) {
        let prev = base;
        for (const pt of tail) {
          const dx = pt[0] - prev[0], dy = pt[1] - prev[1], l = Math.hypot(dx, dy) || 1e-6;
          pt[0] = prev[0] + dx / l * .072; pt[1] = prev[1] + dy / l * .072; prev = pt;
        }
      }
      put(16, tail[0][0], tail[0][1]); put(17, tail[1][0], tail[1][1]);
      // 太陽がどれだけ見えているか（胴・頭・脚との距離から、太陽の5点を調べる）
      const segs = [[0, 1, .06], [3, 4, .04], [6, 7, .04], [0, 3, .05], [0, 6, .05]];
      const sd = (x, y) => {
        let d = Math.hypot(x - J[4], y - J[5]) - .07;
        for (const [a, b, r] of segs) {
          const ax = J[a * 2], ay = J[a * 2 + 1], bx = J[b * 2] - ax, by = J[b * 2 + 1] - ay;
          const h = Math.min(1, Math.max(0, ((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by)));
          d = Math.min(d, Math.hypot(x - ax - bx * h, y - ay - by * h) - r);
        }
        return d;
      };
      let vis = 0;
      for (let i = 0; i < 5; i++) {
        const o = i === 0 ? [0, 0] : [Math.cos(i * 1.57) * SR * .7, Math.sin(i * 1.57) * SR * .7];
        vis += Math.min(1, Math.max(0, sd((SUN[0] + o[0] - Bx) / SC, (SUN[1] + o[1] - FY) / SC + WD) / .03 + .5)) / 5;
      }
      for (let i = 0; i < 4; i++) {
        const pl = plants[i];
        RPa[i * 4] = pl ? pl[0] : 0; RPa[i * 4 + 1] = pl ? tw - pl[1] : 99; RPa[i * 4 + 2] = pl ? 1 : 0;
      }
      return [Bx, vis, t];
    }
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      const [Bx, vis, t] = frame(now);
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, t); gl.uniform2f(uB, Bx, FY); gl.uniform1f(uS, SC); gl.uniform1f(uV, vis);
      gl.uniform2fv(uJ, J); gl.uniform4fv(uRP, RPa);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
});
dekiru.add({
  id: 'real-face-profile', c: 'real', lv: 3,
  t: '木漏れ日を受ける横顔の接写', y: 'こもれびをうけるよこがおのせっしゃ',
  tags: ['人物', '横顔', '木漏れ日', '肌', 'シェーダー', 'WebGL'],
  d: '木漏れ日の下で目を閉じた人の横顔を、すぐ近くから撮ったような映像。顔の輪郭は、額・鼻・唇・あごを通る点を滑らかにつないで作る。輪郭からの距離と、頬骨やまぶたの小さなふくらみから面の向きを決め、陰影をつける。葉の間から差す光の斑点がゆっくり動く。光と影の境目は、皮膚の中で散った光でわずかに赤くなる。逆光を受けた輪郭では産毛が光り、髪のほつれが金色に浮かぶ。背景の木々はぼけて、丸い光の玉になる。',
  p: '人の顔は誰もが見慣れているので、細部まで描くと不自然さが目立つ。横顔の輪郭と光で見せるのがよい。皮膚の境目の赤み、産毛の光、背景のぼけといった写真に写る特徴を重ねると本物らしく見える。',
  html: `<canvas id="c" role="img" aria-label="木漏れ日の下で目を閉じた人の横顔の接写"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    // 横顔の輪郭（右を向く。鼻先がおよそ (0.48, 0.34)、あごの下が y = 0 の単位）。前側は細かく、後ろ頭は髪で隠れるので粗く
    const ctrl = [
      [.10, 1.2], [.24, 1.06], [.31, .95], [.355, .84], [.375, .74], [.385, .655], [.372, .6], [.355, .565],
      [.365, .53], [.39, .48], [.42, .43], [.452, .385], [.478, .352], [.486, .334], [.473, .314], [.446, .302],
      [.418, .297], [.417, .274], [.428, .246], [.424, .222], [.408, .207], [.419, .193], [.425, .172], [.413, .145],
      [.386, .118], [.384, .09], [.398, .055], [.396, .02], [.375, -.012], [.34, -.036], [.29, -.052], [.24, -.072],
      [.205, -.11], [.19, -.2], [.185, -.35], [.19, -.7],
      [-.38, -.7], [-.36, -.3], [-.4, .05], [-.48, .4], [-.5, .8], [-.38, 1.1], [-.15, 1.25],
    ];
    const poly = [];
    for (let i = 0; i < ctrl.length; i++) {   // 点と点の間を、なめらかな曲線（Catmull-Rom）で1回ずつ分ける
      const [a, b, c2, d] = [-1, 0, 1, 2].map(k => ctrl[(i + k + ctrl.length) % ctrl.length]);
      poly.push(b[0], b[1]);
      poly.push((-a[0] + 9 * b[0] + 9 * c2[0] - d[0]) / 16, (-a[1] + 9 * b[1] + 9 * c2[1] - d[1]) / 16);
    }
    const N = poly.length / 2;
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; uniform vec2 P[${N}]; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s; }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .45 + .55 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .03;
}
// 輪郭までの距離（内側が負）と、外へ向かう向き
vec3 sdPoly(vec2 p) {
  float d = 1e9, s = 1.; vec2 gb = vec2(0.);
  for (int i = 0, j = ${N - 1}; i < ${N}; j = i, i++) {
    vec2 e = P[j] - P[i], w = p - P[i], b = w - e * clamp(dot(w, e) / dot(e, e), 0., 1.);
    float bb = dot(b, b);
    if (bb < d) { d = bb; gb = b; }
    bvec3 k = bvec3(p.y >= P[i].y, p.y < P[j].y, e.x * w.y > e.y * w.x);
    if (all(k) || all(not(k))) s = -s;
  }
  d = sqrt(d);
  return vec3(s * d, s * gb / max(d, 1e-6));
}
float G(vec2 q, vec2 c, float r) { vec2 d = (q - c) / r; return exp(-dot(d, d)); }
// 顔の小さな凹凸（頬骨・目のくぼみ・まぶた・眉の骨・唇・あご）
float bumps(vec2 q) {
  return G(q, vec2(.2, .43), .14) * .022 + G(q, vec2(.25, .3), .12) * .015 - G(q, vec2(.3, .57), .03) * .006
       + G(q, vec2(.305, .555), .025) * .012 + G(q, vec2(.33, .645), .04) * .01 + G(q, vec2(.4, .23), .03) * .008
       + G(q, vec2(.4, .18), .03) * .01 + G(q, vec2(.36, .05), .05) * .015 - G(q, vec2(.12, .66), .08) * .01;
}
const vec3 L = normalize(vec3(.62, .55, .3));   // 木漏れ日の向き（右上の少し手前から）
// 葉の影が落ちる模様。光の当たる斑点がゆっくり揺れる
float dapple(vec2 p) {
  vec2 w = vec2(sin(T * .45) * .05 + T * .012, cos(T * .37) * .04);
  vec2 pw = p * 3.2 + w + fbm(p * 1.5 - T * .03) * .5;
  return smoothstep(.47, .62, fbm(pw)) * (.55 + .45 * smoothstep(.3, .7, noise(pw * 1.7 + 4.)));   // 重なる葉で明るさにむらがある
}
vec3 background(vec2 p) {
  float f = fbm(p * 1.3 + vec2(T * .01, 0.));
  vec3 c = mix(vec3(.012, .03, .012), vec3(.07, .13, .035), smoothstep(.35, .7, f));
  c += vec3(.45, .5, .18) * smoothstep(.55, .85, fbm(p * 2.1 + 5. + vec2(T * .015, 0.))) * .45;   // 日の当たる葉
  c += vec3(.25, .3, .32) * smoothstep(.15, .5, p.y) * .1;
  // ぼけた光の玉: 格子の1つに1個まで。玉が格子からはみ出さない大きさにする
  for (int k = 0; k < 2; k++) {
    float gs = k == 0 ? .24 : .13;
    vec2 cp = p / gs + float(k) * 3.7, cell = floor(cp), f2 = fract(cp) - .5;
    float h = hash(cell + float(k) * 17.);
    vec2 o = (vec2(hash(cell + 3.), hash(cell + 7.)) - .5) * .35;
    float r = min(.2 + .2 * h, .48 - max(abs(o.x), abs(o.y)));
    float dd = length(f2 - o), disc = smoothstep(r, r - .07, dd), ring = smoothstep(r - .12, r - .02, dd) * disc;
    float on = step(.62, h) * smoothstep(.4, .8, noise(cell * 3. + T * .35)) * smoothstep(.45, .65, fbm(p * 1.1 + 3.)) * smoothstep(-.3, .3, p.x + p.y * .5);
    c += mix(vec3(1., .82, .5), vec3(.75, .95, .45), hash(cell + 9.)) * (disc * .35 + ring * .25) * on * (k == 0 ? 1.1 : .7);
  }
  return c;
}
// 髪の範囲（負が内側）。生え際より前には出ない
float hairD(vec2 q) {
  float d = (length((q - vec2(-.12, .78)) / vec2(.66, .58)) - 1.) * .58;
  vec2 pa = q - vec2(-.25, .55), ba = vec2(-.12, -1.25);
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  d = min(d, length(pa - ba * h) - mix(.25, .2, h));
  float hl = q.y > .62 ? mix(.04, .31, smoothstep(.62, .98, q.y)) : .04 - (.62 - q.y) * .35;   // 生え際
  return max(d, q.x - hl + (noise(vec2(q.y * 9., 1.)) - .5) * .02);
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  float px = 1. / R.y;
  // 頭の位置: 呼吸でわずかに上下し、ゆっくり傾く
  float k = .72, tilt = sin(T * .4) * .012;
  vec2 o = vec2(.22, .06 + sin(T * 1.3) * .002) - k * vec2(.486, .334);
  vec2 q = (p - o) / k; q = mat2(cos(tilt), sin(tilt), -sin(tilt), cos(tilt)) * (q - vec2(.2, .4)) + vec2(.2, .4);
  float qpx = px / k;
  vec3 col = background(p);
  float dap = dapple(p);
  vec3 sp = sdPoly(q);
  float d = sp.x;
  vec2 gOut = sp.yz;
  float hd = hairD(q);
  // 肌
  if (d < .02) {
    float di = max(-d, 0.), edge = exp(-di / .06);
    vec2 n2 = gOut * edge + vec2(-.75, -.1) * smoothstep(.2, -.25, q.x) * (1. - edge);
    float e = .004;
    vec2 dh = vec2(bumps(q + vec2(e, 0.)) - bumps(q - vec2(e, 0.)), bumps(q + vec2(0., e)) - bumps(q - vec2(0., e))) / (2. * e);
    vec3 Nn = normalize(vec3(n2 - dh * 1.7, sqrt(max(.02, 1. - dot(n2, n2)))));
    float ndl = dot(Nn, L), diff = max(0., (ndl + .25) / 1.25);
    float neck = smoothstep(-.005, -.04, q.y - (-.03 + (.33 - q.x) * .62)) * step(q.x, .35);   // あごの下の首は影になる
    float lit = diff * dap * (1. - neck * .65 * (1. - edge * .6));   // 首でも前の縁には光が回る
    vec3 alb = vec3(.74, .48, .38) * (.94 + .12 * noise(q * 180.));
    alb = mix(alb, vec3(.8, .42, .36), G(q, vec2(.24, .36), .09) * .5 + G(q, vec2(.47, .34), .03) * .5);   // 頬と鼻先の赤み
    // 唇
    float lipU = smoothstep(.004, -.004, abs(q.y - .228) - .02) * smoothstep(.04, .025, di);
    float lipL = smoothstep(.004, -.004, abs(q.y - .186) - .02) * smoothstep(.045, .03, di);
    alb = mix(alb, vec3(.62, .28, .27), max(lipU, lipL) * .8);
    vec3 skin = alb * (vec3(2.3, 1.85, 1.4) * lit + vec3(.05, .07, .05) * (.6 + .4 * Nn.y) * (1. - neck * .5) + vec3(.07, .09, .05) * max(0., .4 + .6 * Nn.x) * (1. - neck * .4) + vec3(.015, .03, .012));   // 空・周りの葉・前から返る光
    float sss = smoothstep(.0, .25, lit) * (1. - smoothstep(.25, .7, lit));   // 光と影の境目が赤くなる
    skin += vec3(.9, .2, .08) * sss * .35;
    skin += vec3(1., .3, .15) * exp(-di / .012) * max(0., dot(gOut, L.xy)) * dap * .35;   // 鼻先や唇の薄い所を光が透ける
    vec3 H = normalize(L + vec3(0., 0., 1.));
    float oil = .4 + G(q, vec2(.46, .37), .05) + G(q, vec2(.35, .8), .1) * .6 + max(lipU, lipL);
    skin += vec3(1., .9, .75) * pow(max(dot(Nn, H), 0.), 40.) * dap * oil * .35 * (.6 + .8 * noise(q * 260.));   // 毛穴でつやがまだらになる
    // 閉じた目: まつ毛の線、まぶたのしわ、下を向いたまつ毛
    float te = clamp((q.x - .265) / .07, 0., 1.), inEye = step(.262, q.x) * step(q.x, .338);
    float yl = mix(.548, .552, te) - .013 * sin(3.1416 * te);
    float lash = smoothstep(.0035, .0, abs(q.y - yl)) * inEye;
    float crease = smoothstep(.004, .0, abs(q.y - yl - .024 - .006 * sin(3.1416 * te))) * inEye * .5;
    float lashes = smoothstep(.55, .85, noise(vec2((q.x + (yl - q.y) * .9) * 520., 1.))) * smoothstep(-.001, .004, yl - q.y) * smoothstep(.026, .0, yl - q.y) * smoothstep(.2, .6, te) * inEye;
    // 眉: 毛の流れに沿った細い線
    vec2 bq = (q - vec2(.29, .656)) / vec2(.075, .017);
    float brow = smoothstep(1., .5, length(bq)) * (.5 + .5 * smoothstep(.3, .7, noise(vec2((q.x * .8 - q.y) * 260., q.y * 30.))));
    // 小鼻のしわと鼻の穴
    float ala = smoothstep(.006, .0, abs(length(q - vec2(.425, .335)) - .032)) * step(q.x, .43) * step(.305, q.y) * .55;
    float nost = smoothstep(1., .6, length((q - vec2(.442, .311)) / vec2(.018, .007)));
    float mouth = smoothstep(.003, .0, abs(q.y - .206 - (q.x - .408) * .1)) * step(.36, q.x) * step(q.x, .41) * .6;
    float dark = max(max(lash, crease), max(max(lashes * .9, brow * .8), max(max(ala, nost * .85), mouth)));
    skin = mix(skin, vec3(.012, .008, .006) + skin * .15, dark);
    float m = smoothstep(qpx, -qpx, d);
    col = mix(col, skin, m);
  }
  // 産毛: 逆光を受けた輪郭のすぐ外が、細かくけば立って光る
  float lf = max(0., dot(gOut, normalize(L.xy))) * dap;
  float fuzz = .55 + .45 * noise(vec2(atan(gOut.y, gOut.x) * 300., d * 900.));
  col += vec3(1., .8, .6) * exp(-max(d, 0.) / .005) * step(0., d) * lf * fuzz * .6 * step(0., hd);
  // 髪: 頭のてっぺんから流れる毛の筋。光の向きの縁が金色に光り、外へほつれ毛が出る
  vec2 hc = q - vec2(.12, 1.45);   // 毛の流れの中心（画面の上の外）
  float rr = length(hc), ang = atan(hc.y, hc.x) + (noise(vec2(rr * 2.5, 4.)) - .5) * .25;   // 筋はゆるく曲がる
  float strand = noise(vec2(ang * 70., rr * 1.2)) * .55 + noise(vec2(ang * 230., rr * 2.)) * .45;
  if (hd < .02) {
    float e = .004;
    vec2 hg = normalize(vec2(hairD(q + vec2(e, 0.)) - hd, hairD(q + vec2(0., e)) - hd) + 1e-6);
    float rim = exp(hd / .035) * max(0., dot(hg, normalize(L.xy)));
    vec3 hair = vec3(.016, .01, .007) * (.6 + .8 * strand);
    hair += vec3(1., .7, .38) * rim * (.3 + .7 * strand) * (.25 + dap) * .8;
    hair += vec3(.9, .65, .4) * smoothstep(.75, .95, strand) * dap * .15;   // 筋に沿ったつや
    hair += vec3(.5, .4, .3) * exp(-pow((rr - .5 - noise(vec2(ang * 3., 1.)) * .08) / .045, 2.)) * (.3 + .7 * strand) * (.15 + dap) * .25;   // 頭の丸みに沿ったつやの帯
    col = mix(col, hair, smoothstep(.006, -.006, hd + (strand - .5) * .016));   // 縁は毛の筋に沿ってほどける
  }
  float fly = smoothstep(.72, .95, noise(vec2((ang + sin(rr * 9. + ang * 3.) * .04) * 45., rr * .6 + T * .05))) * exp(-max(hd, 0.) / .035) * step(0., hd) * step(0., d);
  col += vec3(1., .72, .4) * fly * (.3 + dap) * .45 * smoothstep(.4, 1., q.y);
  // 服の襟（下の端）
  col *= mix(1., .35 + .65 * smoothstep(-.7, -.35, q.y), step(d, 0.));   // 首の下のほうは、あごと肩の影で暗い
  O = vec4(film(col), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T');
    gl.uniform2fv(gl.getUniformLocation(pg, 'P'), new Float32Array(poly));
    const q = window.THUMB ? 0.35 : 0.7;
    (function draw(now) {
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
});
dekiru.add({
  id: 'real-shiori-window', c: 'real', lv: 3,
  t: '図書室の窓辺に立つシオリ', y: 'としょしつのまどべにたつしおり',
  tags: ['キャラクター', 'シオリ', '逆光', 'ぼけ', 'Canvas'],
  d: 'この図鑑のために作ったキャラクター「シオリ」が、午後の図書室の窓辺に立つ映像。髪・顔・目・服を、画像を使わずに曲線だけで描く。息に合わせて肩と頭がわずかに上下し、ときどきまばたきをして視線を動かす。アホ毛と横の髪は、ばねの計算で頭の動きに少し遅れて揺れる。窓からの逆光が、髪と肩の輪郭を光らせる。ぼけた本棚の前では、光の筋の中をほこりが舞う。ときどき字幕付きで話しかけてくる。',
  p: '絵柄はアニメでも、光の当て方とレンズの写り方を実写に合わせると「撮った映像」に見える。輪郭の逆光、ぼけた背景、光の筋に舞うほこりがその役目を果たす。',
  html: `<canvas id="c" role="img" aria-label="図書室の窓辺で、逆光の中に立つキャラクター「シオリ」"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const mk = () => document.createElement('canvas');
    const bg = mk(), cv = mk(), rim = mk(), b1 = mk(), b2 = mk(), sm = mk(), gr = mk();
    const bx = bg.getContext('2d'), vx = cv.getContext('2d'), rx = rim.getContext('2d');
    gr.width = gr.height = 128;
    { const g = gr.getContext('2d'), d = g.createImageData(128, 128); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); }
    const grain = x.createPattern(gr, 'repeat');
    const NAVY = '#1E2640', WHITE = '#F4F5F8', AMBER = '#F2A93B', GRAY = '#4A5268', SKIN = '#FCE2D2', SKIN2 = '#E2B19C', ORANGE = '#E8823A';
    let W = 1, H = 1, S = 1, CX = 0, CY = 0;
    const dust = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), p: Math.random() * 6.28 }));
    // 背景: 窓と本棚を一度描き、縮めて引き伸ばしてぼかす（レンズのぼけ）
    function makeBg() {
      sm.width = Math.ceil(W / 6); sm.height = Math.ceil(H / 6);
      const s = sm.getContext('2d'), w = sm.width, h = sm.height;
      let g = s.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#3a2a1c'); g.addColorStop(1, '#1a130e');
      s.fillStyle = g; s.fillRect(0, 0, w, h);
      // 窓: 外は明るく飛んでいて、木の緑がわずかに見える
      const wx0 = -w * .02, wx1 = w * .3, wy0 = h * .02, wy1 = h * .62;
      s.fillStyle = '#fff6e2'; s.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
      for (let i = 0; i < 14; i++) { s.fillStyle = `rgba(${150 + Math.random() * 60},${190 + Math.random() * 40},${120 + Math.random() * 40},.35)`; s.beginPath(); s.arc(wx0 + Math.random() * (wx1 - wx0), wy0 + Math.random() * (wy1 - wy0) * .7, w * (.02 + Math.random() * .04), 0, 7); s.fill(); }
      s.fillStyle = '#2a1e14'; s.fillRect((wx0 + wx1) / 2 - w * .006, wy0, w * .012, wy1 - wy0); s.fillRect(wx0, (wy0 + wy1) / 2 - h * .006, wx1 - wx0, h * .012);
      s.fillRect(wx1, wy0, w * .015, wy1 - wy0 + h * .02); s.fillRect(wx0, wy1, wx1 - wx0 + w * .015, h * .02);
      // 本棚: 段ごとに背表紙の色と高さを変える
      const pal = ['#6b2a22', '#2f4a3a', '#7a5a2a', '#3a3a5a', '#8a6a4a', '#5a2f3f', '#2a3f5f', '#9a8a6a', '#4a2a1a'];
      for (let sy = h * .08; sy < h; sy += h * .2) {
        for (let bx2 = w * .38; bx2 < w;) {
          const bw = w * (.008 + Math.random() * .014), bh = h * .2 * (.62 + Math.random() * .3);
          s.fillStyle = pal[(Math.random() * pal.length) | 0]; s.fillRect(bx2, sy + h * .2 - bh, bw, bh);
          if (Math.random() < .3) { s.fillStyle = 'rgba(230,200,140,.35)'; s.fillRect(bx2, sy + h * .2 - bh * .7, bw, h * .006); }
          bx2 += bw + (Math.random() < .1 ? w * .02 : w * .001);
        }
        s.fillStyle = '#20160e'; s.fillRect(w * .36, sy + h * .2 - h * .012, w, h * .014);
      }
      g = s.createLinearGradient(0, 0, w * .9, 0);   // 窓からの光で左ほど明るい
      g.addColorStop(0, 'rgba(255,220,170,.25)'); g.addColorStop(.6, 'rgba(255,200,150,0)');
      s.fillStyle = g; s.fillRect(0, 0, w, h);
      bx.clearRect(0, 0, W, H); bx.imageSmoothingQuality = 'high';
      const t2 = mk(); t2.width = Math.ceil(w / 2); t2.height = Math.ceil(h / 2);
      t2.getContext('2d').drawImage(sm, 0, 0, t2.width, t2.height);
      bx.drawImage(t2, 0, 0, W, H);
    }
    function fit() {
      const q = window.THUMB ? .5 : Math.min(1, 1600 / innerWidth);
      W = Math.max(1, Math.round(innerWidth * q)); H = Math.max(1, Math.round(innerHeight * q));
      for (const k of [c, bg, cv, rim]) { k.width = W; k.height = H; }
      b1.width = Math.ceil(W / 4); b1.height = Math.ceil(H / 4); b2.width = Math.ceil(W / 16); b2.height = Math.ceil(H / 16);
      S = Math.min(H / 790, W / 470); CX = W * (W > H ? .6 : .5); CY = H * .5;
      makeBg();
    }
    fit(); addEventListener('resize', fit);
    // 動きの状態（ばね）。v は速さ
    const sp = { ah: 0, ahv: 0, lk: 0, lkv: 0 };
    let blinkAt = 1.5, gaze = [0, 0], gazeT = [0, 0], gazeAt = 2, last = 0;
    const spring = (k, v, target, kk, damp, dt) => { const a = (target - sp[k]) * kk - sp[v] * damp; sp[v] += a * dt; sp[k] += sp[v] * dt; };
    let x2 = vx;
    function lin(y0, y1, stops) { const g = x2.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
    function taper(pts, w0, w1, col) {   // 先が細くなる線（アホ毛）
      x2.strokeStyle = col; x2.lineCap = 'round';
      for (let i = 0; i < pts.length - 1; i++) { x2.lineWidth = w0 + (w1 - w0) * i / (pts.length - 2); x2.beginPath(); x2.moveTo(...pts[i]); x2.lineTo(...pts[i + 1]); x2.stroke(); }
    }
    function eye(sx, open, gx, gy) {   // sx: 左目 -1、右目 +1（形は左右反転、目の光は同じ側）
      const X = v => v * sx, Y = (y) => -63 + (y + 63) * open;
      if (open < .12) {
        x2.strokeStyle = '#2B2234'; x2.lineWidth = 4; x2.lineCap = 'round';
        x2.beginPath(); x2.moveTo(X(68), -70); x2.quadraticCurveTo(X(42), -60, X(16), -72); x2.stroke(); return;
      }
      x2.save();
      x2.beginPath(); x2.moveTo(X(68), Y(-80)); x2.bezierCurveTo(X(62), Y(-104), X(36), Y(-114), X(15), Y(-96));
      x2.quadraticCurveTo(X(16), -78, X(22), -66); x2.quadraticCurveTo(X(42), -58, X(62), -64); x2.quadraticCurveTo(X(68), -70, X(68), Y(-80)); x2.closePath();
      x2.fillStyle = '#fff'; x2.fill(); x2.clip();
      const ix = X(40) + gx, iy = -84 + gy;
      let g = x2.createLinearGradient(0, iy - 21, 0, iy + 21);
      g.addColorStop(0, '#6e380a'); g.addColorStop(.45, '#E2902C'); g.addColorStop(1, '#FFD98A');
      x2.fillStyle = g; x2.beginPath(); x2.ellipse(ix, iy, 15.5, 21, 0, 0, 7); x2.fill();
      x2.strokeStyle = '#5a2c06'; x2.lineWidth = 1.6; x2.stroke();
      x2.fillStyle = 'rgba(58,29,6,.85)'; x2.beginPath(); x2.ellipse(ix, iy - 2, 6.5, 9.5, 0, 0, 7); x2.fill();
      x2.strokeStyle = 'rgba(255,230,160,.6)'; x2.lineWidth = 1.2; x2.beginPath(); x2.arc(ix, iy + 2, 11, .5, 2.6); x2.stroke();
      g = x2.createLinearGradient(0, Y(-112), 0, Y(-112) + 22);   // 上まぶたの影
      g.addColorStop(0, 'rgba(120,110,150,.75)'); g.addColorStop(1, 'rgba(120,110,150,0)');
      x2.fillStyle = g; x2.fillRect(-100, Y(-115), 200, 30);
      x2.fillStyle = '#fff';
      x2.beginPath(); x2.ellipse(ix - 7 + gx * .3, iy - 11, 5.5, 7, -.3, 0, 7); x2.fill();
      x2.beginPath(); x2.arc(ix + 7, iy + 10, 2.6, 0, 7); x2.fill();
      x2.fillStyle = 'rgba(220,240,255,.7)'; x2.fillRect(ix + 2, iy - 13, 4, 6);   // 窓の映り込み
      x2.restore();
      x2.strokeStyle = '#2B2234'; x2.lineCap = 'round'; x2.lineJoin = 'round';
      x2.lineWidth = 5.5; x2.beginPath(); x2.moveTo(X(68), Y(-80)); x2.bezierCurveTo(X(62), Y(-104), X(36), Y(-114), X(15), Y(-96)); x2.stroke();
      x2.fillStyle = '#2B2234'; x2.beginPath(); x2.moveTo(X(64), Y(-86)); x2.lineTo(X(77), Y(-92)); x2.lineTo(X(70), Y(-80)); x2.fill();   // 目尻のまつ毛
      x2.strokeStyle = 'rgba(106,74,80,.8)'; x2.lineWidth = 1.6; x2.beginPath(); x2.moveTo(X(58), -63); x2.quadraticCurveTo(X(44), -59, X(30), -61); x2.stroke();
      x2.strokeStyle = 'rgba(200,143,128,.7)'; x2.lineWidth = 1.4; x2.beginPath(); x2.moveTo(X(62), Y(-104) - 2); x2.quadraticCurveTo(X(44), Y(-120), X(24), Y(-109)); x2.stroke();
    }
    function wrap() {   // 窓の側（左）に暖かい光が回り込み、反対側は青く沈む
      x2.setTransform(1, 0, 0, 1, 0, 0); x2.globalCompositeOperation = 'source-atop';
      const g = x2.createLinearGradient(CX - 200 * S, 0, CX + 200 * S, 0);
      g.addColorStop(0, 'rgba(255,205,150,.22)'); g.addColorStop(.5, 'rgba(255,205,150,0)'); g.addColorStop(.75, 'rgba(30,40,80,0)'); g.addColorStop(1, 'rgba(30,40,80,.22)');
      x2.fillStyle = g; x2.fillRect(0, 0, W, H); x2.globalCompositeOperation = 'source-over';
    }
    function draw(t, dt) {
      // 呼吸・頭の傾き・まばたき・視線
      const br = Math.sin(t * 1.6), talk = (t % 14) > 6 && (t % 14) < 9.6;
      const tilt = Math.sin(t * .35) * .03 + (talk ? Math.sin((t % 14 - 6) * 1.2) * .03 : 0);
      const headY = br * 1.4 + (talk ? Math.sin((t % 14 - 6) * 2.4) * 1.5 : 0);
      if (t > blinkAt + .18) blinkAt = t + 2 + Math.random() * 3.5;
      const bt = (t - blinkAt) / .16, open = bt > 0 && bt < 1 ? Math.abs(Math.cos(bt * Math.PI)) ** .7 : 1;
      if (t > gazeAt) { gazeT = [(Math.random() - .5) * 6, (Math.random() - .5) * 3]; gazeAt = t + 2 + Math.random() * 3; }
      gaze = gaze.map((g, i) => g + (gazeT[i] - g) * Math.min(1, dt * 8));
      const breeze = Math.sin(t * .7) * .5 + Math.sin(t * 1.9 + 1) * .3;
      spring('ah', 'ahv', tilt * 2.5 + breeze * .12, 70, 5, dt);
      spring('lk', 'lkv', -tilt * 60 + breeze * 4, 35, 4, dt);
      x2 = vx; x2.setTransform(1, 0, 0, 1, 0, 0); x2.clearRect(0, 0, W, H);
      const base = [S, 0, 0, S, CX, CY];
      const head = () => { x2.setTransform(...base); x2.translate(0, 30 + headY); x2.rotate(tilt); x2.translate(0, -30); };
      // 後ろ髪（毛先の内側は空色）
      head();
      x2.fillStyle = lin(-262, 8, [[0, '#262f50'], [.7, NAVY], [1, '#6EC6F5']]);
      const sl = sp.lk;
      x2.beginPath(); x2.moveTo(-122, -120); x2.bezierCurveTo(-128, -210, -74, -262, 0, -262); x2.bezierCurveTo(74, -262, 128, -210, 122, -120);
      x2.bezierCurveTo(126, -60, 122, -14, 100 + sl * .6, 6); x2.quadraticCurveTo(84, 10, 70, -4); x2.lineTo(40, 8); x2.lineTo(-40, 8); x2.lineTo(-70, -4); x2.quadraticCurveTo(-84, 10, -100 + sl * .6, 6);
      x2.bezierCurveTo(-122, -14, -126, -60, -122, -120); x2.fill();
      // 首（あごの下は影）
      head();
      x2.fillStyle = SKIN; x2.fillRect(-19, -20, 38, 62);
      x2.fillStyle = SKIN2; x2.beginPath(); x2.moveTo(-19, -14); x2.quadraticCurveTo(0, 26, 19, -14); x2.lineTo(19, -20); x2.lineTo(-19, -20); x2.fill();
      // 体: シャツ、スカートの上の端、ケープ、襟、リボンタイ
      x2.setTransform(...base); x2.translate(0, br * 1.2); x2.scale(1 + br * .004, 1);
      x2.fillStyle = lin(40, 340, [[0, WHITE], [1, '#d8dce8']]);
      x2.beginPath(); x2.moveTo(-30, 40); x2.lineTo(-70, 80); x2.lineTo(-74, 360); x2.lineTo(74, 360); x2.lineTo(70, 80); x2.lineTo(30, 40); x2.fill();
      x2.fillStyle = 'rgba(150,160,190,.35)'; x2.beginPath(); x2.moveTo(10, 60); x2.lineTo(70, 80); x2.lineTo(74, 360); x2.lineTo(20, 360); x2.fill();
      for (let i = 0; i < 5; i++) { x2.fillStyle = '#e6e8f0'; x2.strokeStyle = '#a8aec0'; x2.lineWidth = 1; x2.beginPath(); x2.arc(0, 150 + i * 48, 3.5, 0, 7); x2.fill(); x2.stroke(); }
      x2.fillStyle = GRAY; x2.beginPath(); x2.moveTo(-78, 312); x2.lineTo(78, 312); x2.lineTo(118, 420); x2.lineTo(-118, 420); x2.fill();   // プリーツスカート
      x2.strokeStyle = 'rgba(20,24,40,.6)'; x2.lineWidth = 1.5;
      for (let i = -3; i <= 3; i++) { x2.beginPath(); x2.moveTo(i * 22, 316); x2.lineTo(i * 34, 420); x2.stroke(); }
      x2.fillStyle = 'rgba(255,255,255,.08)'; for (let i = -3; i < 3; i += 2) { x2.beginPath(); x2.moveTo(i * 22, 316); x2.lineTo((i + 1) * 22, 316); x2.lineTo((i + 1) * 34, 420); x2.lineTo(i * 34, 420); x2.fill(); }
      for (const s of [-1, 1]) {   // 白い袖の腕と手（ケープの下から出る）
        x2.fillStyle = s < 0 ? '#eef0f6' : '#cfd4e2';
        x2.beginPath(); x2.moveTo(s * 120, 100); x2.bezierCurveTo(s * 134, 180, s * 128, 260, s * 112, 336); x2.lineTo(s * 78, 334);
        x2.bezierCurveTo(s * 86, 260, s * 88, 180, s * 80, 100); x2.fill();
        x2.fillStyle = s < 0 ? '#dfe2ec' : '#bcc2d2'; x2.beginPath(); x2.moveTo(s * 113, 318); x2.lineTo(s * 112, 338); x2.lineTo(s * 78, 336); x2.lineTo(s * 80, 316); x2.fill();
        x2.fillStyle = s < 0 ? SKIN : '#f0cdb8'; x2.beginPath(); x2.ellipse(s * 96, 356, 15, 23, s * .1, 0, 7); x2.fill();
      }
      for (const s of [-1, 1]) {
        x2.fillStyle = lin(40, 220, [[0, s < 0 ? '#2e3a62' : '#222a48'], [1, '#141a2e']]);
        x2.beginPath(); x2.moveTo(s * 26, 40); x2.bezierCurveTo(s * 60, 44, s * 112, 56, s * 150, 92); x2.bezierCurveTo(s * 170, 112, s * 176, 150, s * 178, 214);
        x2.lineTo(s * 112, 190); x2.lineTo(s * 46, 212); x2.bezierCurveTo(s * 42, 160, s * 36, 100, s * 26, 40); x2.fill();
        x2.strokeStyle = 'rgba(242,169,59,.55)'; x2.lineWidth = 2; x2.beginPath(); x2.moveTo(s * 176, 208); x2.lineTo(s * 112, 185); x2.lineTo(s * 48, 206); x2.stroke();
      }
      x2.fillStyle = WHITE; x2.strokeStyle = '#b8bccc'; x2.lineWidth = 1.5;
      x2.beginPath(); x2.moveTo(-26, 16); x2.lineTo(-29, 46); x2.quadraticCurveTo(0, 58, 29, 46); x2.lineTo(26, 16); x2.quadraticCurveTo(0, 28, -26, 16); x2.fill(); x2.stroke();
      x2.fillStyle = '#c86a2a'; x2.beginPath(); x2.moveTo(-2, 56); x2.lineTo(10, 56); x2.lineTo(22, 122); x2.lineTo(14, 113); x2.lineTo(10, 126); x2.fill();
      x2.fillStyle = lin(56, 150, [[0, ORANGE], [1, '#d06a28']]);
      x2.beginPath(); x2.moveTo(-9, 56); x2.lineTo(6, 56); x2.lineTo(2, 152); x2.lineTo(-5, 140); x2.lineTo(-13, 152); x2.fill();
      x2.setLineDash([3, 3]); x2.lineWidth = 1.4;
      x2.strokeStyle = '#3B7DD8'; x2.beginPath(); x2.moveTo(-6.5, 60); x2.lineTo(-10, 144); x2.stroke();
      x2.strokeStyle = '#F5D04A'; x2.beginPath(); x2.moveTo(3.5, 60); x2.lineTo(0, 144); x2.stroke();
      x2.setLineDash([]);
      x2.fillStyle = ORANGE; x2.beginPath(); x2.roundRect(-9, 44, 18, 14, 3); x2.fill();
      head();
      // 顔
      x2.fillStyle = SKIN;
      x2.beginPath(); x2.moveTo(-82, -175); x2.bezierCurveTo(-84, -120, -80, -82, -64, -50); x2.bezierCurveTo(-48, -20, -22, -3, 0, 0);
      x2.bezierCurveTo(22, -3, 48, -20, 64, -50); x2.bezierCurveTo(80, -82, 84, -120, 82, -175); x2.closePath(); x2.fill();
      x2.save(); x2.clip();
      x2.fillStyle = lin(-180, -118, [[0, 'rgba(226,177,156,.9)'], [1, 'rgba(226,177,156,0)']]); x2.fillRect(-90, -180, 180, 64);   // 前髪の影
      x2.fillStyle = 'rgba(226,177,156,.5)'; x2.beginPath(); x2.ellipse(70, -80, 30, 70, 0, 0, 7); x2.fill();   // 窓と反対側の頬の影
      for (const s of [-1, 1]) {
        const g = x2.createRadialGradient(s * 50, -56, 0, s * 50, -56, 24); g.addColorStop(0, 'rgba(255,130,130,.38)'); g.addColorStop(1, 'rgba(255,130,130,0)');
        x2.fillStyle = g; x2.fillRect(s * 50 - 26, -82, 52, 52);
        x2.strokeStyle = 'rgba(235,120,120,.55)'; x2.lineWidth = 1.3;
        for (let i = 0; i < 3; i++) { x2.beginPath(); x2.moveTo(s * 42 + i * 6 - 2, -54); x2.lineTo(s * 42 + i * 6 + 2, -61); x2.stroke(); }
      }
      x2.restore();
      eye(-1, open, gaze[0], gaze[1]); eye(1, open, gaze[0], gaze[1]);
      x2.strokeStyle = '#D49A88'; x2.lineWidth = 1.6; x2.beginPath(); x2.moveTo(3, -58); x2.quadraticCurveTo(5, -54, 1, -52); x2.stroke();
      const mo = talk && (t % 14) < 8.7 ? Math.max(0, Math.sin(t * 17) * .5 + Math.sin(t * 11) * .5) : 0;   // 話している間は口が動く
      if (mo > .15) {
        x2.fillStyle = '#8a3c3c'; x2.beginPath(); x2.moveTo(-9, -31); x2.quadraticCurveTo(0, -27, 9, -31); x2.quadraticCurveTo(0, -31 + 10 * mo, -9, -31); x2.fill();
        x2.fillStyle = '#e88a8a'; x2.beginPath(); x2.ellipse(0, -31 + 6 * mo, 4, 2 * mo, 0, 0, 7); x2.fill();
      } else { x2.strokeStyle = '#A85A50'; x2.lineWidth = 2; x2.beginPath(); x2.moveTo(-10, -31); x2.quadraticCurveTo(0, -25, 10, -31); x2.stroke(); }
      // 横の髪（毛先が空色）
      for (const s of [-1, 1]) {
        x2.fillStyle = lin(-205, 12, [[0, NAVY], [.72, '#25305a'], [1, '#6EC6F5']]);
        const tip = s * 90 + sl * (s < 0 ? 1 : .8);
        x2.beginPath(); x2.moveTo(s * 82, -205); x2.bezierCurveTo(s * 106, -160, s * 110, -80, s * 100, -24); x2.quadraticCurveTo(s * 96, 0, tip - s * 6, 12);
        x2.bezierCurveTo(s * 82, -24, s * 78, -80, s * 74, -140); x2.bezierCurveTo(s * 72, -170, s * 76, -190, s * 70, -205); x2.fill();
        x2.beginPath(); x2.moveTo(s * 74, -150); x2.bezierCurveTo(s * 80, -110, s * 78, -70, s * 70, -38); x2.lineTo(s * 66 + sl * .5, -16);
        x2.bezierCurveTo(s * 66, -70, s * 66, -110, s * 62, -150); x2.fill();
      }
      // 前髪: 毛束の先をぎざぎざに並べる
      const tips = [[86, -160], [79, -178], [72, -132], [63, -162], [54, -114], [44, -152], [34, -126], [24, -150], [14, -110], [4, -156], [-6, -124], [-17, -150], [-28, -112], [-37, -152], [-46, -128], [-56, -154], [-66, -118], [-75, -166], [-84, -150]];
      x2.fillStyle = lin(-262, -110, [[0, '#2a3458'], [1, NAVY]]);
      x2.beginPath(); x2.moveTo(-92, -200); x2.bezierCurveTo(-90, -252, -40, -264, 0, -264); x2.bezierCurveTo(40, -264, 90, -252, 92, -200);
      let pv = [92, -200];
      for (const [tx, ty] of tips) { x2.quadraticCurveTo((pv[0] + tx) / 2 + 3, (pv[1] + ty) / 2, tx, ty); pv = [tx, ty]; }
      x2.closePath(); x2.fill();
      x2.strokeStyle = 'rgba(8,10,24,.5)'; x2.lineWidth = 1.5;
      for (let i = 1; i < tips.length; i += 2) { const [nx, ny] = tips[i]; x2.beginPath(); x2.moveTo(nx, ny); x2.quadraticCurveTo(nx - 4, ny - 40, nx - 8, -232); x2.stroke(); }
      x2.fillStyle = 'rgba(120,150,210,.16)';   // 髪のつやの輪
      x2.beginPath(); x2.moveTo(-74, -214);
      for (let i = 0; i <= 10; i++) x2.lineTo(-74 + i * 14.8, -224 + (i % 2) * 12 - Math.abs(i - 5) * 1.6);
      for (let i = 10; i >= 0; i--) x2.lineTo(-74 + i * 14.8, -232 - Math.abs(i - 5) * 1.6);
      x2.fill();
      // 眉は前髪から少し透けて見せる
      x2.globalAlpha = .55; x2.strokeStyle = '#3a3048'; x2.lineWidth = 3; x2.lineCap = 'round';
      for (const s of [-1, 1]) { x2.beginPath(); x2.moveTo(s * 64, -130); x2.quadraticCurveTo(s * 46, -141, s * 24, -133); x2.stroke(); }
      x2.globalAlpha = 1;
      // アホ毛: ばねで揺れる1本の毛
      const a = sp.ah, R2 = (px, py) => [6 + px * Math.cos(a) - py * Math.sin(a), -260 + px * Math.sin(a) + py * Math.cos(a)];
      const ap = []; for (let i = 0; i <= 12; i++) { const u = i / 12; ap.push(R2(-14 * Math.sin(u * 2.4) + 40 * u * u, -70 * Math.sin(u * 1.9) + 30 * u * u * u)); }
      taper(ap, 9, 2, NAVY);
      // 琥珀色の「＜ ＞」の髪留め
      for (const [px, py, d] of [[-100, -182, -1], [-80, -182, 1]]) {
        for (const [col, lw] of [['#9a5c14', 7.5], [AMBER, 4.5]]) {
          x2.strokeStyle = col; x2.lineWidth = lw; x2.lineJoin = 'round'; x2.beginPath();
          x2.moveTo(px - d * 6, py - 10); x2.lineTo(px + d * 6, py); x2.lineTo(px - d * 6, py + 10); x2.stroke();
        }
      }
    }
    let start = -1;
    (function frame(now) {
      if (start < 0) start = now;
      const t = (now - start) / 1000 + (window.THUMB ? 6.8 : 0), dt = Math.min(.05, Math.max(.001, t - last)); last = t;
      draw(t, dt); wrap();
      // 逆光: 人物の形から、光と反対へずらした形を抜くと、窓の側の縁だけが細く残る
      rx.globalCompositeOperation = 'source-over'; rx.clearRect(0, 0, W, H); rx.drawImage(cv, 0, 0);
      rx.globalCompositeOperation = 'source-in'; rx.fillStyle = '#ffd9a0'; rx.fillRect(0, 0, W, H);
      rx.globalCompositeOperation = 'destination-out'; rx.drawImage(cv, 3 * S, 1.5 * S);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      x.drawImage(bg, 0, 0);
      // 窓からの光の筋
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const f = .07 + .03 * Math.sin(t * .4 + i * 2);
        const g = x.createLinearGradient(0, 0, W * .8, H);
        g.addColorStop(0, `rgba(255,220,160,${f})`); g.addColorStop(1, 'rgba(255,220,160,0)');
        x.fillStyle = g; x.beginPath();
        x.moveTo(W * (.02 + i * .09), H * .05); x.lineTo(W * (.1 + i * .09), H * .05); x.lineTo(W * (.75 + i * .1), H); x.lineTo(W * (.45 + i * .1), H); x.fill();
      }
      x.globalCompositeOperation = 'source-over';
      x.drawImage(cv, 0, 0);
      x.globalCompositeOperation = 'lighter'; x.globalAlpha = .55; x.drawImage(rim, 0, 0); x.globalAlpha = .35; x.drawImage(rim, -S, 0); x.drawImage(rim, 0, -S);
      // ほこり: 光の筋の中だけ明るく、手前の大きな粒はぼけて丸くなる
      for (const p of dust) {
        p.y -= .004 * (p.z + .3) * (1 / 60); p.x += Math.sin(t * .3 + p.p) * .00015;
        if (p.y < -.05) p.y = 1.05;
        const px = p.x * W, py = (p.y + Math.sin(t * .5 + p.p) * .01) * H;
        const beam = Math.max(0, 1 - Math.abs((px / W) - (.05 + (py / H) * .55)) * 3.5);
        if (beam <= 0) continue;
        const r = p.z > .85 ? (6 + p.z * 10) * S : (.8 + p.z * 1.5) * S;
        x.globalAlpha = beam * (p.z > .85 ? .12 : .7) * (.6 + .4 * Math.sin(t * 2 + p.p * 3));
        x.fillStyle = '#ffe8c0'; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
      }
      // 光のにじみ（縮めて引き伸ばす）、周辺の暗さ、フィルムの粒子
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      b1.getContext('2d').drawImage(c, 0, 0, b1.width, b1.height); b2.getContext('2d').drawImage(b1, 0, 0, b2.width, b2.height);
      x.globalCompositeOperation = 'screen'; x.globalAlpha = .28; x.drawImage(b1, 0, 0, W, H); x.globalAlpha = .25; x.drawImage(b2, 0, 0, W, H);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .6);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,5,0,.55)');
      x.fillStyle = vg; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'overlay'; x.globalAlpha = .08; x.fillStyle = grain;
      x.save(); x.translate(Math.random() * 128, Math.random() * 128); x.fillRect(-128, -128, W + 128, H + 128); x.restore();
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      // 字幕
      const ts = t % 14;
      if (ts > 6 && ts < 9.6 && !window.THUMB) {
        const fsz = Math.max(14, H * .04);
        x.font = `600 ${fsz}px system-ui, sans-serif`; x.textAlign = 'center';
        x.globalAlpha = Math.min(1, (ts - 6) * 4, (9.6 - ts) * 4);
        x.fillStyle = 'rgba(0,0,0,.6)'; x.fillText('ここ、しおり挟んでおきますね', W / 2 + 2, H * .92 + 2);
        x.fillStyle = '#fff'; x.fillText('ここ、しおり挟んでおきますね', W / 2, H * .92);
        x.globalAlpha = 1;
      }
      requestAnimationFrame(frame);
    })(performance.now());
  },
});
dekiru.add({
  id: 'real-shiori-wave', c: 'real', lv: 3,
  t: '夕焼けの坂道で手を振るシオリ', y: 'ゆうやけのさかみちでてをふるしおり',
  tags: ['キャラクター', 'シオリ', '関節', '逆光', 'Canvas'],
  d: '夕日を背にしたシオリが、坂道の上で手を振る映像。腕は肩・ひじ・手首の3つの関節の角度をつないで動かす（順運動学）。それぞれの角度が、固さの違うばねで目標へ近づく。そのため腕を上げると手先が遅れてついてきて、振る手首は腕より少し遅れてしなる。背中の長いリボンとスカートの裾は風になびき、逆光が全身の輪郭を金色に縁取る。太陽からレンズの中に反射した光の輪が並び、足元から長い影が手前へ伸びる。',
  p: '関節ごとに少しずつ遅れて動くと、動きに重さと柔らかさが出る。アニメーターが「フォロースルー」と呼ぶ動きを、ばねの固さの違いだけで作っている。',
  html: `<canvas id="c" role="img" aria-label="夕日の坂道で、こちらへ手を振るキャラクター「シオリ」"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const mk = () => document.createElement('canvas');
    const bg = mk(), cv = mk(), rim = mk(), b1 = mk(), b2 = mk(), sm = mk(), gr = mk();
    const bx = bg.getContext('2d'), vx = cv.getContext('2d'), rx = rim.getContext('2d');
    gr.width = gr.height = 128;
    { const g = gr.getContext('2d'), d = g.createImageData(128, 128); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); }
    const grain = x.createPattern(gr, 'repeat');
    const NAVY = '#1E2640', WHITE = '#F4F5F8', AMBER = '#F2A93B', GRAY = '#4A5268', SKIN = '#FCE2D2', SKIN2 = '#E2B19C', ORANGE = '#E8823A';
    let W = 1, H = 1, S = 1, CX = 0, FY = 0, SX = 0, SY = 0;
    // 背景: 夕焼けの空、電線、坂の上の町並み、道。一度描いて、縮めて引き伸ばしてぼかす
    function makeBg() {
      sm.width = Math.ceil(W / 5); sm.height = Math.ceil(H / 5);
      const s = sm.getContext('2d'), w = sm.width, h = sm.height, hz = h * .6, sx = SX / 5, sy = SY / 5;
      let g = s.createLinearGradient(0, 0, 0, hz);
      g.addColorStop(0, '#26315c'); g.addColorStop(.45, '#a8566a'); g.addColorStop(.8, '#f39a5a'); g.addColorStop(1, '#ffd08a');
      s.fillStyle = g; s.fillRect(0, 0, w, hz + 1);
      g = s.createRadialGradient(sx, sy, 0, sx, sy, h * .5); g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(.15, 'rgba(255,200,130,.6)'); g.addColorStop(1, 'rgba(255,160,90,0)');
      s.fillStyle = g; s.fillRect(0, 0, w, h);
      for (let i = 0; i < 7; i++) {   // 横に伸びた雲。下の縁が夕日で光る
        const cy = h * (.12 + Math.random() * .3), cx = Math.random() * w, cw = w * (.15 + Math.random() * .3);
        s.fillStyle = 'rgba(90,60,90,.55)'; s.beginPath(); s.ellipse(cx, cy, cw, h * .015, 0, 0, 7); s.fill();
        s.fillStyle = 'rgba(255,170,110,.5)'; s.beginPath(); s.ellipse(cx, cy + h * .008, cw * .9, h * .006, 0, 0, 7); s.fill();
      }
      s.fillStyle = '#fff6dc'; s.beginPath(); s.arc(sx, sy, h * .045, 0, 7); s.fill();
      // 坂の上の町並み（家と屋根）
      s.fillStyle = '#3a2a48';
      for (let px = 0; px < w;) {
        const bw = w * (.03 + Math.random() * .05), bh = h * (.03 + Math.random() * .06);
        if (Math.abs(px + bw / 2 - w / 2) > w * .09) {
          s.fillRect(px, hz - bh, bw, bh + 2);
          s.beginPath(); s.moveTo(px - bw * .05, hz - bh); s.lineTo(px + bw / 2, hz - bh - bw * .3); s.lineTo(px + bw * 1.05, hz - bh); s.fill();
          if (Math.random() < .5) { s.fillStyle = 'rgba(255,200,120,.8)'; s.fillRect(px + bw * .3, hz - bh * .6, bw * .15, bh * .2); s.fillStyle = '#3a2a48'; }
        }
        px += bw + w * .005;
      }
      // 道: 手前が広く、坂の上で細くなる。中央線と、夕日の照り返し
      g = s.createLinearGradient(0, hz, 0, h); g.addColorStop(0, '#6a4a50'); g.addColorStop(1, '#2a2028');
      s.fillStyle = g; s.beginPath(); s.moveTo(w * .46, hz); s.lineTo(w * .54, hz); s.lineTo(w * 1.1, h); s.lineTo(-w * .1, h); s.fill();
      g = s.createLinearGradient(0, hz, 0, h); g.addColorStop(0, 'rgba(255,190,120,.7)'); g.addColorStop(1, 'rgba(255,190,120,0)');
      s.fillStyle = g; s.beginPath(); s.moveTo(w * .48, hz); s.lineTo(w * .52, hz); s.lineTo(w * .62, h); s.lineTo(w * .38, h); s.fill();
      s.fillStyle = '#2a2030'; s.beginPath(); s.moveTo(0, hz); s.lineTo(w * .46, hz); s.lineTo(-w * .1, h); s.lineTo(0, h); s.fill();
      s.beginPath(); s.moveTo(w, hz); s.lineTo(w * .54, hz); s.lineTo(w * 1.1, h); s.lineTo(w, h); s.fill();
      // 電柱と電線
      s.strokeStyle = '#1e1826'; s.lineCap = 'round';
      const poles = [[.08, 1], [.3, .45], [.42, .22], [.7, .3], [.9, .7]];
      for (const [px, sc] of poles) { s.lineWidth = Math.max(1, 3 * sc); s.beginPath(); s.moveTo(px * w, hz + h * .4 * sc * .3); s.lineTo(px * w, hz - h * .55 * sc); s.stroke(); s.beginPath(); s.moveTo(px * w - w * .03 * sc, hz - h * .5 * sc); s.lineTo(px * w + w * .03 * sc, hz - h * .5 * sc); s.stroke(); }
      s.lineWidth = .7;
      for (let k = 0; k < 3; k++) for (let i = 0; i < poles.length - 1; i++) {
        const [a, sa] = poles[i], [b, sb] = poles[i + 1], ya = hz - h * .5 * sa + k * 2 * sa, yb = hz - h * .5 * sb + k * 2 * sb;
        s.beginPath(); s.moveTo(a * w, ya); s.quadraticCurveTo((a + b) / 2 * w, Math.max(ya, yb) + h * .04, b * w, yb); s.stroke();
      }
      bx.clearRect(0, 0, W, H);
      const t2 = mk(); t2.width = Math.ceil(w / 2); t2.height = Math.ceil(h / 2);
      t2.getContext('2d').drawImage(sm, 0, 0, t2.width, t2.height);
      bx.drawImage(t2, 0, 0, W, H);
    }
    function fit() {
      const q = window.THUMB ? .5 : Math.min(1, 1600 / innerWidth);
      W = Math.max(1, Math.round(innerWidth * q)); H = Math.max(1, Math.round(innerHeight * q));
      for (const k of [c, bg, cv, rim]) { k.width = W; k.height = H; }
      b1.width = Math.ceil(W / 4); b1.height = Math.ceil(H / 4); b2.width = Math.ceil(W / 16); b2.height = Math.ceil(H / 16);
      S = Math.min(H * .8 / 860, W * .9 / 520); CX = W * .46; FY = H * .93; SX = W * .55; SY = H * .5;
      makeBg();
    }
    fit(); addEventListener('resize', fit);
    const sp = { ah: 0, ahv: 0, lk: 0, lkv: 0, sk: 0, skv: 0, a1: .12, a1v: 0, a2: .1, a2v: 0, a3: .05, a3v: 0 };
    let blinkAt = 1.5, last = 0;
    const spring = (k, v, target, kk, damp, dt) => { const a = (target - sp[k]) * kk - sp[v] * damp; sp[v] += a * dt; sp[k] += sp[v] * dt; };
    let x2 = vx;
    function lin(y0, y1, stops) { const g = x2.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
    function taper(pts, w0, w1, col) {   // 先が細くなる線（アホ毛）
      x2.strokeStyle = col; x2.lineCap = 'round';
      for (let i = 0; i < pts.length - 1; i++) { x2.lineWidth = w0 + (w1 - w0) * i / (pts.length - 2); x2.beginPath(); x2.moveTo(...pts[i]); x2.lineTo(...pts[i + 1]); x2.stroke(); }
    }
    function eye(sx, open, gx, gy) {   // sx: 左目 -1、右目 +1（形は左右反転、目の光は同じ側）
      const X = v => v * sx, Y = (y) => -63 + (y + 63) * open;
      if (open < .12) {
        x2.strokeStyle = '#2B2234'; x2.lineWidth = 4; x2.lineCap = 'round';
        x2.beginPath(); x2.moveTo(X(68), -70); x2.quadraticCurveTo(X(42), -60, X(16), -72); x2.stroke(); return;
      }
      x2.save();
      x2.beginPath(); x2.moveTo(X(68), Y(-80)); x2.bezierCurveTo(X(62), Y(-104), X(36), Y(-114), X(15), Y(-96));
      x2.quadraticCurveTo(X(16), -78, X(22), -66); x2.quadraticCurveTo(X(42), -58, X(62), -64); x2.quadraticCurveTo(X(68), -70, X(68), Y(-80)); x2.closePath();
      x2.fillStyle = '#fff'; x2.fill(); x2.clip();
      const ix = X(40) + gx, iy = -84 + gy;
      let g = x2.createLinearGradient(0, iy - 21, 0, iy + 21);
      g.addColorStop(0, '#6e380a'); g.addColorStop(.45, '#E2902C'); g.addColorStop(1, '#FFD98A');
      x2.fillStyle = g; x2.beginPath(); x2.ellipse(ix, iy, 15.5, 21, 0, 0, 7); x2.fill();
      x2.strokeStyle = '#5a2c06'; x2.lineWidth = 1.6; x2.stroke();
      x2.fillStyle = 'rgba(58,29,6,.85)'; x2.beginPath(); x2.ellipse(ix, iy - 2, 6.5, 9.5, 0, 0, 7); x2.fill();
      x2.strokeStyle = 'rgba(255,230,160,.6)'; x2.lineWidth = 1.2; x2.beginPath(); x2.arc(ix, iy + 2, 11, .5, 2.6); x2.stroke();
      g = x2.createLinearGradient(0, Y(-112), 0, Y(-112) + 22);   // 上まぶたの影
      g.addColorStop(0, 'rgba(120,110,150,.75)'); g.addColorStop(1, 'rgba(120,110,150,0)');
      x2.fillStyle = g; x2.fillRect(-100, Y(-115), 200, 30);
      x2.fillStyle = '#fff';
      x2.beginPath(); x2.ellipse(ix - 7 + gx * .3, iy - 11, 5.5, 7, -.3, 0, 7); x2.fill();
      x2.beginPath(); x2.arc(ix + 7, iy + 10, 2.6, 0, 7); x2.fill();
      x2.fillStyle = 'rgba(220,240,255,.7)'; x2.fillRect(ix + 2, iy - 13, 4, 6);   // 窓の映り込み
      x2.restore();
      x2.strokeStyle = '#2B2234'; x2.lineCap = 'round'; x2.lineJoin = 'round';
      x2.lineWidth = 5.5; x2.beginPath(); x2.moveTo(X(68), Y(-80)); x2.bezierCurveTo(X(62), Y(-104), X(36), Y(-114), X(15), Y(-96)); x2.stroke();
      x2.fillStyle = '#2B2234'; x2.beginPath(); x2.moveTo(X(64), Y(-86)); x2.lineTo(X(77), Y(-92)); x2.lineTo(X(70), Y(-80)); x2.fill();   // 目尻のまつ毛
      x2.strokeStyle = 'rgba(106,74,80,.8)'; x2.lineWidth = 1.6; x2.beginPath(); x2.moveTo(X(58), -63); x2.quadraticCurveTo(X(44), -59, X(30), -61); x2.stroke();
      x2.strokeStyle = 'rgba(200,143,128,.7)'; x2.lineWidth = 1.4; x2.beginPath(); x2.moveTo(X(62), Y(-104) - 2); x2.quadraticCurveTo(X(44), Y(-120), X(24), Y(-109)); x2.stroke();
    }
    function draw(t, dt) {
      const cyc = t % 9, waving = cyc > .6 && cyc < 6;   // 9秒ごとに、手を振っては下ろす
      const talk = cyc > 1.2 && cyc < 2.6;
      const br = Math.sin(t * 1.6);
      const wv = waving ? 1 : 0, om = 11;
      // 腕の関節: 目標の角度へ、固さの違うばねで近づく（先の関節ほど遅れてついてくる）
      spring('a1', 'a1v', wv ? 2.25 + .07 * Math.sin(t * om) : .12, 38, 9, dt);
      spring('a2', 'a2v', wv ? 2.95 + .34 * Math.sin(t * om) : .1, 26, 6, dt);
      spring('a3', 'a3v', wv ? sp.a2 + .35 * Math.sin(t * om - 1.2) : .05, 45, 6, dt);
      const lean = sp.a1 / 2.25 * .035, tilt = lean * .9 + Math.sin(t * .5) * .02;
      if (t > blinkAt + .18) blinkAt = t + 2 + Math.random() * 3.5;
      const bt = (t - blinkAt) / .16, open = bt > 0 && bt < 1 ? Math.abs(Math.cos(bt * Math.PI)) ** .7 : 1;
      const gaze = [0, 1];
      const wind = Math.sin(t * .8) * .5 + Math.sin(t * 2.1) * .3 + .6;
      spring('ah', 'ahv', tilt * 2 - wind * .15, 70, 5, dt);
      spring('lk', 'lkv', -tilt * 50 - wind * 7, 35, 4, dt);
      spring('sk', 'skv', -wind * 6 - sp.a1v * 2, 30, 4, dt);
      x2 = vx; x2.setTransform(1, 0, 0, 1, 0, 0); x2.clearRect(0, 0, W, H);
      const base = [S, 0, 0, S, CX, FY];
      const body = () => { x2.setTransform(...base); x2.translate(0, -520); x2.rotate(lean); x2.translate(0, 520 + br * 1.2); };
      const up = () => { body(); x2.translate(0, -698); x2.scale(.5, .5); };   // 1つ目と同じ絵の、胸から上（半分の大きさ）
      const head = () => { body(); x2.translate(0, -683 + br * .6); x2.rotate(tilt); x2.scale(.5, .5); x2.translate(0, -30); };
      // 背中から垂れる、先を栞の形に切った長いリボン。風で左へなびく
      body();
      for (const s of [-1, 1]) {
        const L = [], R = [];
        for (let i = 0; i <= 14; i++) {
          const u = i / 14, wave = Math.sin(t * 5 - u * 7 + s) * 22 * u, cx = s * (10 + u * 34) - wind * 90 * u * u + wave, cy = -690 + u * 470;
          L.push([cx - 7, cy]); R.push([cx + 7, cy]);
        }
        x2.fillStyle = lin(-690, -220, [[0, '#c86a2a'], [1, s < 0 ? ORANGE : '#f09a4a']]);
        x2.beginPath(); x2.moveTo(...L[0]); for (const p of L) x2.lineTo(...p);
        const e = L[14], f = R[14]; x2.lineTo((e[0] + f[0]) / 2, e[1] - 12); for (let i = 14; i >= 0; i--) x2.lineTo(...R[i]); x2.fill();
      }
      // 後ろ髪
      head();
      x2.fillStyle = lin(-262, 8, [[0, '#262f50'], [.7, NAVY], [1, '#6EC6F5']]);
      const sl = sp.lk;
      x2.beginPath(); x2.moveTo(-122, -120); x2.bezierCurveTo(-128, -210, -74, -262, 0, -262); x2.bezierCurveTo(74, -262, 128, -210, 122, -120);
      x2.bezierCurveTo(126, -60, 122, -14, 100 + sl * .6, 6); x2.quadraticCurveTo(84, 10, 70, -4); x2.lineTo(40, 8); x2.lineTo(-40, 8); x2.lineTo(-70, -4); x2.quadraticCurveTo(-84, 10, -100 + sl * .6, 6);
      x2.bezierCurveTo(-122, -14, -126, -60, -122, -120); x2.fill();
      x2.fillStyle = SKIN; x2.fillRect(-19, -20, 38, 62);
      x2.fillStyle = SKIN2; x2.beginPath(); x2.moveTo(-19, -14); x2.quadraticCurveTo(0, 26, 19, -14); x2.lineTo(19, -20); x2.lineTo(-19, -20); x2.fill();
      // 脚と短いブーツ
      x2.setTransform(...base);
      for (const s of [-1, 1]) {
        const g = x2.createLinearGradient(s * 44, 0, s * 10, 0); g.addColorStop(0, s < 0 ? '#fff0e4' : '#d9a890'); g.addColorStop(1, SKIN);
        x2.fillStyle = g; x2.beginPath(); x2.moveTo(s * 38, -280); x2.bezierCurveTo(s * 46, -220, s * 40, -160, s * 30, -110); x2.lineTo(s * 15, -110); x2.bezierCurveTo(s * 13, -160, s * 11, -220, s * 10, -280); x2.fill();   // ふくらはぎの丸み
        x2.fillStyle = s < 0 ? '#4a3a32' : '#2e2420';
        x2.beginPath(); x2.moveTo(s * 36, -128); x2.lineTo(s * 40, -22); x2.quadraticCurveTo(s * 46, 0, s * 26, 0); x2.lineTo(s * 8, 0); x2.quadraticCurveTo(s * -2, 0, s * 4, -16); x2.lineTo(s * 13, -128); x2.fill();
        x2.fillStyle = AMBER; x2.fillRect(s * 26 - 4, -104, 8, 6);
      }
      // プリーツスカート（風と動きで裾が揺れる）
      body();
      const sw = sp.sk;
      x2.fillStyle = GRAY; x2.beginPath(); x2.moveTo(-60, -528); x2.lineTo(60, -528);
      for (let i = 8; i >= -8; i--) x2.lineTo(i * 14 + sw, -262 + (i % 2 ? 7 : 0));   // 膝丈
      x2.fill();
      for (let i = -8; i < 8; i += 2) {
        x2.fillStyle = 'rgba(255,255,255,.07)'; x2.beginPath(); x2.moveTo(i * 7.5, -526); x2.lineTo((i + 1) * 7.5, -526); x2.lineTo((i + 1) * 14 + sw, -262); x2.lineTo(i * 14 + sw, -262); x2.fill();
        x2.strokeStyle = 'rgba(20,24,40,.55)'; x2.lineWidth = 1.2; x2.beginPath(); x2.moveTo(i * 7.5, -526); x2.lineTo(i * 14 + sw, -260); x2.stroke();
      }
      // シャツの胴（1つ目と同じ形を半分の大きさで）
      up();
      x2.fillStyle = lin(40, 360, [[0, WHITE], [1, '#d8dce8']]);
      x2.beginPath(); x2.moveTo(-30, 40); x2.lineTo(-70, 80); x2.lineTo(-74, 360); x2.lineTo(74, 360); x2.lineTo(70, 80); x2.lineTo(30, 40); x2.fill();
      // 腕: 袖は白い太い線。左の手は本を持ち、右の腕は肩・ひじ・手首の順に角度をつなげる
      body();
      const arm = (pts, w) => {
        for (const [col, ww] of [['#9aa2b8', w + 3], ['#eef0f6', w]]) { x2.strokeStyle = col; x2.lineWidth = ww; x2.lineCap = 'round'; x2.lineJoin = 'round'; x2.beginPath(); x2.moveTo(...pts[0]); for (const p of pts) x2.lineTo(...p); x2.stroke(); }
      };
      arm([[-58, -664], [-74, -546], [-68, -445]], 20);
      x2.save(); x2.translate(-72, -420); x2.rotate(-.12);   // 本（しおりの紐がはみ出す）
      x2.fillStyle = '#5a2f3f'; x2.fillRect(-28, -34, 52, 70); x2.fillStyle = '#efe6d2'; x2.fillRect(22, -32, 4, 66);
      x2.strokeStyle = ORANGE; x2.lineWidth = 2.5; x2.beginPath(); x2.moveTo(-6, 36); x2.quadraticCurveTo(-2, 50, -8, 60); x2.stroke();
      x2.fillStyle = SKIN; x2.beginPath(); x2.ellipse(4, -4, 10, 13, .3, 0, 7); x2.fill();
      x2.restore();
      const dir = a => [Math.sin(a), Math.cos(a)];
      const sh = [60, -664], d1 = dir(sp.a1), el = [sh[0] + d1[0] * 120, sh[1] + d1[1] * 120], d2 = dir(sp.a2), wr = [el[0] + d2[0] * 105, el[1] + d2[1] * 105];
      arm([sh, el, wr], 19);
      x2.strokeStyle = '#c4cad8'; x2.lineWidth = 20; x2.beginPath(); x2.moveTo(wr[0] - d2[0] * 9, wr[1] - d2[1] * 9); x2.lineTo(wr[0] - d2[0] * 2, wr[1] - d2[1] * 2); x2.stroke();
      x2.save(); x2.translate(wr[0] + d2[0] * 6, wr[1] + d2[1] * 6); x2.rotate(-sp.a3);   // 開いた手のひら
      x2.fillStyle = SKIN; x2.strokeStyle = '#c99482'; x2.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) { x2.save(); x2.rotate((i - 1.5) * .2); x2.beginPath(); x2.roundRect(-2.6, 8, 5.2, 15 - Math.abs(i - 1.5) * 2, 2.6); x2.fill(); x2.stroke(); x2.restore(); }
      x2.save(); x2.rotate(-1.1); x2.beginPath(); x2.roundRect(-2.8, 4, 5.6, 12, 2.8); x2.fill(); x2.stroke(); x2.restore();
      x2.beginPath(); x2.ellipse(0, 6, 9.5, 9, 0, 0, 7); x2.fill();
      x2.restore();
      // ケープ・襟・リボンタイ（1つ目と同じ形を半分の大きさで）
      up();
      for (const s of [-1, 1]) {
        x2.fillStyle = lin(40, 220, [[0, s < 0 ? '#2e3a62' : '#222a48'], [1, '#141a2e']]);
        x2.beginPath(); x2.moveTo(s * 26, 40); x2.bezierCurveTo(s * 60, 44, s * 112, 56, s * 150, 92); x2.bezierCurveTo(s * 170, 112, s * 176, 150, s * 178, 214);
        x2.lineTo(s * 112, 190); x2.lineTo(s * 46, 212); x2.bezierCurveTo(s * 42, 160, s * 36, 100, s * 26, 40); x2.fill();
        x2.strokeStyle = 'rgba(242,169,59,.55)'; x2.lineWidth = 2; x2.beginPath(); x2.moveTo(s * 176, 208); x2.lineTo(s * 112, 185); x2.lineTo(s * 48, 206); x2.stroke();
      }
      x2.fillStyle = WHITE; x2.strokeStyle = '#b8bccc'; x2.lineWidth = 1.5;
      x2.beginPath(); x2.moveTo(-26, 16); x2.lineTo(-29, 46); x2.quadraticCurveTo(0, 58, 29, 46); x2.lineTo(26, 16); x2.quadraticCurveTo(0, 28, -26, 16); x2.fill(); x2.stroke();
      x2.fillStyle = lin(56, 150, [[0, ORANGE], [1, '#d06a28']]);
      x2.beginPath(); x2.moveTo(-9, 56); x2.lineTo(6, 56); x2.lineTo(2, 152); x2.lineTo(-5, 140); x2.lineTo(-13, 152); x2.fill();
      x2.fillStyle = ORANGE; x2.beginPath(); x2.roundRect(-9, 44, 18, 14, 3); x2.fill();
      // 首と顔
      head();
      // 顔
      x2.fillStyle = SKIN;
      x2.beginPath(); x2.moveTo(-82, -175); x2.bezierCurveTo(-84, -120, -80, -82, -64, -50); x2.bezierCurveTo(-48, -20, -22, -3, 0, 0);
      x2.bezierCurveTo(22, -3, 48, -20, 64, -50); x2.bezierCurveTo(80, -82, 84, -120, 82, -175); x2.closePath(); x2.fill();
      x2.save(); x2.clip();
      x2.fillStyle = lin(-180, -118, [[0, 'rgba(226,177,156,.9)'], [1, 'rgba(226,177,156,0)']]); x2.fillRect(-90, -180, 180, 64);   // 前髪の影
      x2.fillStyle = 'rgba(226,177,156,.5)'; x2.beginPath(); x2.ellipse(70, -80, 30, 70, 0, 0, 7); x2.fill();   // 窓と反対側の頬の影
      for (const s of [-1, 1]) {
        const g = x2.createRadialGradient(s * 50, -56, 0, s * 50, -56, 24); g.addColorStop(0, 'rgba(255,130,130,.38)'); g.addColorStop(1, 'rgba(255,130,130,0)');
        x2.fillStyle = g; x2.fillRect(s * 50 - 26, -82, 52, 52);
        x2.strokeStyle = 'rgba(235,120,120,.55)'; x2.lineWidth = 1.3;
        for (let i = 0; i < 3; i++) { x2.beginPath(); x2.moveTo(s * 42 + i * 6 - 2, -54); x2.lineTo(s * 42 + i * 6 + 2, -61); x2.stroke(); }
      }
      x2.restore();
      eye(-1, open, gaze[0], gaze[1]); eye(1, open, gaze[0], gaze[1]);
      x2.strokeStyle = '#D49A88'; x2.lineWidth = 1.6; x2.beginPath(); x2.moveTo(3, -58); x2.quadraticCurveTo(5, -54, 1, -52); x2.stroke();
      const mo = talk ? Math.max(0, Math.sin(t * 17) * .5 + Math.sin(t * 11) * .5) : 0;   // 話している間は口が動く
      if (mo > .15) {
        x2.fillStyle = '#8a3c3c'; x2.beginPath(); x2.moveTo(-9, -31); x2.quadraticCurveTo(0, -27, 9, -31); x2.quadraticCurveTo(0, -31 + 10 * mo, -9, -31); x2.fill();
        x2.fillStyle = '#e88a8a'; x2.beginPath(); x2.ellipse(0, -31 + 6 * mo, 4, 2 * mo, 0, 0, 7); x2.fill();
      } else { x2.strokeStyle = '#A85A50'; x2.lineWidth = 2; x2.beginPath(); x2.moveTo(-10, -31); x2.quadraticCurveTo(0, -25, 10, -31); x2.stroke(); }
      // 横の髪（毛先が空色）
      for (const s of [-1, 1]) {
        x2.fillStyle = lin(-205, 12, [[0, NAVY], [.72, '#25305a'], [1, '#6EC6F5']]);
        const tip = s * 90 + sl * (s < 0 ? 1 : .8);
        x2.beginPath(); x2.moveTo(s * 82, -205); x2.bezierCurveTo(s * 106, -160, s * 110, -80, s * 100, -24); x2.quadraticCurveTo(s * 96, 0, tip - s * 6, 12);
        x2.bezierCurveTo(s * 82, -24, s * 78, -80, s * 74, -140); x2.bezierCurveTo(s * 72, -170, s * 76, -190, s * 70, -205); x2.fill();
        x2.beginPath(); x2.moveTo(s * 74, -150); x2.bezierCurveTo(s * 80, -110, s * 78, -70, s * 70, -38); x2.lineTo(s * 66 + sl * .5, -16);
        x2.bezierCurveTo(s * 66, -70, s * 66, -110, s * 62, -150); x2.fill();
      }
      // 前髪: 毛束の先をぎざぎざに並べる
      const tips = [[86, -160], [79, -178], [72, -132], [63, -162], [54, -114], [44, -152], [34, -126], [24, -150], [14, -110], [4, -156], [-6, -124], [-17, -150], [-28, -112], [-37, -152], [-46, -128], [-56, -154], [-66, -118], [-75, -166], [-84, -150]];
      x2.fillStyle = lin(-262, -110, [[0, '#2a3458'], [1, NAVY]]);
      x2.beginPath(); x2.moveTo(-92, -200); x2.bezierCurveTo(-90, -252, -40, -264, 0, -264); x2.bezierCurveTo(40, -264, 90, -252, 92, -200);
      let pv = [92, -200];
      for (const [tx, ty] of tips) { x2.quadraticCurveTo((pv[0] + tx) / 2 + 3, (pv[1] + ty) / 2, tx, ty); pv = [tx, ty]; }
      x2.closePath(); x2.fill();
      x2.strokeStyle = 'rgba(8,10,24,.5)'; x2.lineWidth = 1.5;
      for (let i = 1; i < tips.length; i += 2) { const [nx, ny] = tips[i]; x2.beginPath(); x2.moveTo(nx, ny); x2.quadraticCurveTo(nx - 4, ny - 40, nx - 8, -232); x2.stroke(); }
      x2.fillStyle = 'rgba(120,150,210,.16)';   // 髪のつやの輪
      x2.beginPath(); x2.moveTo(-74, -214);
      for (let i = 0; i <= 10; i++) x2.lineTo(-74 + i * 14.8, -224 + (i % 2) * 12 - Math.abs(i - 5) * 1.6);
      for (let i = 10; i >= 0; i--) x2.lineTo(-74 + i * 14.8, -232 - Math.abs(i - 5) * 1.6);
      x2.fill();
      // 眉は前髪から少し透けて見せる
      x2.globalAlpha = .55; x2.strokeStyle = '#3a3048'; x2.lineWidth = 3; x2.lineCap = 'round';
      for (const s of [-1, 1]) { x2.beginPath(); x2.moveTo(s * 64, -130); x2.quadraticCurveTo(s * 46, -141, s * 24, -133); x2.stroke(); }
      x2.globalAlpha = 1;
      // アホ毛: ばねで揺れる1本の毛
      const a = sp.ah, R2 = (px, py) => [6 + px * Math.cos(a) - py * Math.sin(a), -260 + px * Math.sin(a) + py * Math.cos(a)];
      const ap = []; for (let i = 0; i <= 12; i++) { const u = i / 12; ap.push(R2(-14 * Math.sin(u * 2.4) + 40 * u * u, -70 * Math.sin(u * 1.9) + 30 * u * u * u)); }
      taper(ap, 9, 2, NAVY);
      // 琥珀色の「＜ ＞」の髪留め
      for (const [px, py, d] of [[-100, -182, -1], [-80, -182, 1]]) {
        for (const [col, lw] of [['#9a5c14', 7.5], [AMBER, 4.5]]) {
          x2.strokeStyle = col; x2.lineWidth = lw; x2.lineJoin = 'round'; x2.beginPath();
          x2.moveTo(px - d * 6, py - 10); x2.lineTo(px + d * 6, py); x2.lineTo(px - d * 6, py + 10); x2.stroke();
        }
      }
    }
    let start = -1;
    (function frame(now) {
      if (start < 0) start = now;
      const t = (now - start) / 1000 + (window.THUMB ? 2.4 : 0), dt = Math.min(.05, Math.max(.001, t - last)); last = t;
      draw(t, dt);
      // 逆光で全身はやや暗く沈み、輪郭だけが光る（形を上下左右にずらして抜くと、縁だけが残る）
      vx.setTransform(1, 0, 0, 1, 0, 0); vx.globalCompositeOperation = 'source-atop';
      vx.fillStyle = 'rgba(70,40,80,.3)'; vx.fillRect(0, 0, W, H); vx.globalCompositeOperation = 'source-over';
      rx.globalCompositeOperation = 'source-over'; rx.clearRect(0, 0, W, H); rx.drawImage(cv, 0, 0);
      rx.globalCompositeOperation = 'source-in'; rx.fillStyle = '#ffcf8a'; rx.fillRect(0, 0, W, H);
      rx.globalCompositeOperation = 'destination-out';
      for (const [dx, dy] of [[0, 3], [2.2, 1], [-2.2, 1]]) rx.drawImage(cv, dx * S, dy * S);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      x.drawImage(bg, 0, 0);
      // 足元から手前へ伸びる長い影
      const g = x.createLinearGradient(0, FY, 0, H);
      g.addColorStop(0, 'rgba(20,10,25,.75)'); g.addColorStop(1, 'rgba(20,10,25,.25)');
      x.fillStyle = g; x.beginPath(); x.moveTo(CX - 40 * S, FY); x.lineTo(CX + 40 * S, FY); x.lineTo(CX + 130 * S, H + 5); x.lineTo(CX - 110 * S, H + 5); x.fill();
      x.drawImage(cv, 0, 0);
      x.globalCompositeOperation = 'lighter'; x.globalAlpha = .9; x.drawImage(rim, 0, 0); x.globalAlpha = .4; x.drawImage(rim, 0, -S);
      // レンズの中で反射した光の輪と、横に伸びる光の筋
      x.globalAlpha = 1;
      const ccx = W / 2, ccy = H / 2;
      [[.45, .05, '255,200,120', .1], [.9, .025, '160,220,255', .12], [1.35, .08, '255,150,100', .06], [1.75, .04, '200,255,180', .1]].forEach(([k, r, col, a]) => {
        const px = SX + (ccx - SX) * k * 1.6, py = SY + (ccy - SY) * k * 1.6, rr = r * H;
        const gg = x.createRadialGradient(px, py, rr * .6, px, py, rr);
        gg.addColorStop(0, `rgba(${col},${a * .4})`); gg.addColorStop(.85, `rgba(${col},${a})`); gg.addColorStop(1, `rgba(${col},0)`);
        x.fillStyle = gg; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill();
      });
      const st = x.createLinearGradient(0, 0, W, 0);
      st.addColorStop(0, 'rgba(255,190,120,0)'); st.addColorStop(SX / W, 'rgba(255,210,150,.35)'); st.addColorStop(1, 'rgba(255,190,120,0)');
      x.fillStyle = st; x.fillRect(0, SY - H * .003, W, H * .006);
      // 光のにじみ・周辺の暗さ・フィルムの粒子
      x.globalCompositeOperation = 'source-over';
      b1.getContext('2d').drawImage(c, 0, 0, b1.width, b1.height); b2.getContext('2d').drawImage(b1, 0, 0, b2.width, b2.height);
      x.globalCompositeOperation = 'screen'; x.globalAlpha = .3; x.drawImage(b1, 0, 0, W, H); x.globalAlpha = .3; x.drawImage(b2, 0, 0, W, H);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .6);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,5,10,.55)');
      x.fillStyle = vg; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'overlay'; x.globalAlpha = .08; x.fillStyle = grain;
      x.save(); x.translate(Math.random() * 128, Math.random() * 128); x.fillRect(-128, -128, W + 128, H + 128); x.restore();
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      const cyc = t % 9;
      if (cyc > 1.2 && cyc < 2.9 && !window.THUMB) {
        const fsz = Math.max(14, H * .045);
        x.font = `600 ${fsz}px system-ui, sans-serif`; x.textAlign = 'center';
        x.globalAlpha = Math.min(1, (cyc - 1.2) * 4, (2.9 - cyc) * 4);
        x.fillStyle = 'rgba(0,0,0,.6)'; x.fillText('またね！', W / 2 + 2, H * .9 + 2);
        x.fillStyle = '#fff'; x.fillText('またね！', W / 2, H * .9);
        x.globalAlpha = 1;
      }
      requestAnimationFrame(frame);
    })(performance.now());
  },
});
dekiru.add({
  id: 'real-shiori-figure', c: 'real', lv: 3,
  t: '回転台の上のシオリのフィギュア', y: 'かいてんだいのうえのしおりのふぃぎゅあ',
  tags: ['キャラクター', 'シオリ', '3D', 'レイマーチング', 'WebGL'],
  d: 'シオリの小さなフィギュアを、撮影用の回転台に載せて撮ったような映像。頭・髪・ケープ・プリーツスカート・ブーツを、距離関数を組み合わせて立体にし、レイマーチングで描く。部品どうしは材質が混ざらないよう別々に扱う。目・頬・口は、本物のフィギュアと同じように顔の面に印刷する。照明は撮影スタジオと同じく、正面の主光、後ろからの輪郭光、反対側の補助光の3つを使う。机には柔らかい影が落ち、塗装した樹脂のつやが回るにつれて表面を流れていく。ときどきまばたきもする。',
  p: 'キャラクターをそのまま実写に寄せるより、「撮影したフィギュア」として見せると本物らしくなる。光の映り込み、柔らかい影、周りの物に遮られた暗さ（環境遮蔽）で、表面の質感や立体感が出る。',
  html: `<canvas id="c" role="img" aria-label="回転台の上でゆっくり回る、キャラクター「シオリ」の小さなフィギュア"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { display: block; width: 100vw; height: 100vh; }`,
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T; uniform float A; uniform float BL; out vec4 O;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 film(vec3 c) {
  vec2 q = gl_FragCoord.xy / R;
  c = c * (2.51 * c + .03) / (c * (2.43 * c + .59) + .14);
  c *= .55 + .45 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .25);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2)) + (hash(gl_FragCoord.xy + fract(T * 7.) * 517.) - .5) * .025;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdCap(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float sdEll(vec3 p, vec3 r) { float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.) / k1; }
float sdBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }
float sdCyl(vec3 p, float r, float h) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }
vec2 U(vec2 a, vec2 b) { return a.x < b.x ? a : b; }
// 材質: 0 机、1 回転台、2 肌、3 髪、4 白いシャツ、5 紺のケープ、6 灰色のスカート、7 ブーツ、8 琥珀色、9 橙のリボン
vec2 figure(vec3 q) {
  vec3 qb = vec3(abs(q.x), q.y, q.z);
  vec2 r = vec2(sdBox(qb - vec3(.07, .055, .02), vec3(.026, .045, .05), .02), 7.);
  r = U(r, vec2(min(sdCap(qb, vec3(.066, .1, 0.), vec3(.06, .56, 0.), .033), sdCap(qb, vec3(.06, .56, 0.), vec3(.068, .95, 0.), .043)), 2.));
  float ang = atan(q.z, q.x);
  float sy = clamp((q.y - .7) / .47, 0., 1.);
  float sk = max((length(q.xz) - mix(.2, .095, sy) - .01 * cos(ang * 14.) * (1. - sy)) * .85, max(q.y - 1.17, .7 - q.y + .008 * cos(ang * 14.)));
  r = U(r, vec2(sk, 6.));
  r = U(r, vec2(sdEll(q - vec3(0., 1.38, 0.), vec3(.1, .25, .075)), 4.));
  float cy = clamp((q.y - 1.3) / .3, 0., 1.);
  float cone = (length(q.xz) - mix(.165, .07, cy)) * .9;
  float hem = 1.305 + .03 * abs(fract(ang / 6.2832 * 6. + .25) - .5) * 2.;   // 裾は栞のようなV字の切れ込み
  float cape = max(abs(cone) - .011, max(q.y - 1.6, hem - q.y));
  cape = max(cape, -max(.03 - abs(q.x), -q.z));                             // 前は開いている
  r = U(r, vec2(cape, 5.));
  r = U(r, vec2(min(sdCap(qb, vec3(.105, 1.56, 0.), vec3(.15, 1.3, 0.), .03), sdCap(qb, vec3(.15, 1.3, 0.), vec3(.16, 1.08, .03), .026)), 4.));
  r = U(r, vec2(length(qb - vec3(.163, 1.045, .035)) - .03, 2.));
  r = U(r, vec2(sdCap(q, vec3(0., 1.58, 0.), vec3(0., 1.7, 0.), .03), 2.));
  r = U(r, vec2(sdBox(q - vec3(0., 1.605, 0.), vec3(.032, .012, .03), .01), 4.));
  r = U(r, vec2(sdBox(q - vec3(0., 1.585, .044), vec3(.014, .01, .006), .004), 9.));
  r = U(r, vec2(sdBox(q - vec3(0., 1.535, .056), vec3(.011, .035, .003), .002), 9.));
  for (int i = 0; i < 2; i++) {   // 背中の長いリボン（2本に分かれて揺れる）
    float s = float(i) * 2. - 1.;
    vec3 rp = q - vec3(s * .02, 1.22, -.1 - (1.6 - q.y) * .08);
    rp.x -= sin(q.y * 8. + T * 2. + s) * .015 * (1.6 - q.y);
    r = U(r, vec2(sdBox(rp, vec3(.011, .38, .003), .002) * .9, 9.));
  }
  vec3 hq = q - vec3(0., 1.83, 0.);
  r = U(r, vec2(sdEll(hq, vec3(.145, .165, .14)), 2.));
  float hang = atan(hq.x, hq.z);
  float hair = sdEll(hq - vec3(0., .02, -.01), vec3(.17, .18, .17)) + (1. - abs(sin(hang * 7. + hq.y * 5.))) * (.002 + .004 * smoothstep(.1, -.1, hq.y));   // 毛束のみぞ
  float cut = sdEll(hq - vec3(0., -.065, .1), vec3(.12, .115 + .01 * abs(sin(hq.x * 70.)), .115));   // 顔の前を切り抜く（上の縁が前髪のぎざぎざ）
  hair = max(hair, -cut);
  hair = max(hair, -.135 - hq.y + .008 * cos(hang * 6.));                                       // ボブの裾（あごの高さ）
  hair = min(hair, sdCap(q, vec3(0., 1.99, -.01), vec3(.012, 2.07, 0.), .007));                 // アホ毛
  hair = min(hair, sdCap(q, vec3(.012, 2.07, 0.), vec3(.05, 2.08, .01), .005));
  r = U(r, vec2(hair, 3.));
  vec3 pq = q - vec3(-.11, 1.88, .125);                                                         // 髪留め「＜ ＞」
  float pin = min(sdCap(pq, vec3(0., .012, 0.), vec3(-.014, 0., 0.), .0045), sdCap(pq, vec3(-.014, 0., 0.), vec3(0., -.012, 0.), .0045));
  pq = q - vec3(-.14, 1.88, .09);
  pin = min(pin, min(sdCap(pq, vec3(-.014, .012, 0.), vec3(0., 0., 0.), .0045), sdCap(pq, vec3(0., 0., 0.), vec3(-.014, -.012, 0.), .0045)));
  r = U(r, vec2(pin, 8.));
  return r;
}
vec2 map(vec3 p) {
  vec2 r = vec2(p.y, 0.);
  r = U(r, vec2(sdCyl(p - vec3(0., .03, 0.), .5, .026) - .008, 1.));
  vec3 q = p - vec3(0., .064, 0.); q.xz = rot(A) * q.xz;
  float bound = max(length(q.xz) - .55, max(q.y - 2.15, -q.y));
  if (bound > .1) return U(r, vec2(bound, 0.));
  return U(r, figure(q));
}
vec3 normal(vec3 p) { vec2 e = vec2(.0007, -.0007); return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x); }
float shadow(vec3 ro, vec3 rd) {
  float res = 1., t = .02 + hash(gl_FragCoord.xy) * .02;   // 歩き始めを画素ごとにずらし、縞を崩す
  for (int i = 0; i < 40; i++) { float h = map(ro + rd * t).x; res = min(res, 9. * h / t); t += clamp(h, .01, .15); if (res < .002 || t > 3.) break; }
  return clamp(res, 0., 1.);
}
float ao(vec3 p, vec3 n) { float o = 0., s = 1.; for (int i = 1; i <= 5; i++) { float h = .025 * float(i); o += (h - map(p + n * h).x) * s; s *= .7; } return clamp(1. - o * 3.5, 0., 1.); }
const vec3 KEY = normalize(vec3(-.55, .75, .65)), RIM = normalize(vec3(.75, .45, -.7)), FILL = normalize(vec3(.8, .25, .5));
// 撮影スタジオの背景紙と、天井の大きな四角い照明（つやのある面に映り込む）
vec3 env(vec3 d) {
  vec3 c = mix(vec3(.16, .17, .2), vec3(.62, .64, .7), smoothstep(-.2, .6, d.y));
  c += vec3(3.) * smoothstep(.9, .97, dot(d, KEY)) + vec3(1.2, 1.4, 1.7) * smoothstep(.93, .98, dot(d, RIM));
  return c;
}
// 顔に印刷した目・頬・口（寸法は半径0.4ほどの頭で決めてあり、呼ぶ側で座標を縮めて渡す）
vec3 decal(vec3 hq, vec3 col) {
  if (hq.z < .12) return col;
  vec2 uv = hq.xy;
  for (int i = 0; i < 2; i++) {
    vec2 ce = vec2(float(i) * .28 - .14, -.06);
    vec2 e2 = (uv - ce) / vec2(.068, .09);
    float e = length(e2);
    if (BL > .15) {
      vec2 eb = (uv - ce) / vec2(.068, .09 * BL);
      float eo = length(eb);
      if (eo < 1.) {
        col = mix(vec3(.4, .17, .03), vec3(1., .68, .2), smoothstep(-.06, .07, uv.y - ce.y));
        if (length((uv - ce - vec2(0., .008)) / vec2(.028, .042 * BL)) < 1.) col = vec3(.2, .08, .02);
        if (length(uv - ce - vec2(-.024, .038 * BL)) < .02) col = vec3(1.);
        if (length(uv - ce - vec2(.022, -.035 * BL)) < .009) col = vec3(1.);
      }
      if (eo > .96 && eo < 1.28 && uv.y > ce.y + .03 * BL) col = vec3(.08, .06, .09);   // 上のまつ毛
    } else if (abs(uv.y - ce.y + .02 - 2.5 * (uv.x - ce.x) * (uv.x - ce.x)) < .008 && abs(uv.x - ce.x) < .07) col = vec3(.08, .06, .09);
    float bl = length((uv - vec2(float(i) * .44 - .22, -.16)) / vec2(.06, .028));
    col = mix(col, vec3(1., .55, .55), smoothstep(1., .2, bl) * .45);
  }
  if (abs(uv.y + .21 - 3. * uv.x * uv.x) < .0055 && abs(uv.x) < .032) col = vec3(.55, .2, .18);
  return col;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  vec3 ro = vec3(sin(T * .13) * .2, 1.4, 5.3), ta = vec3(0., 1.06, 0.);
  vec3 f = normalize(ta - ro), r = normalize(cross(f, vec3(0., 1., 0.))), u = cross(r, f);
  vec3 rd = normalize(p.x * r + p.y * u + 2.3 * f);
  float t = 0.; vec2 h = vec2(0.);
  for (int i = 0; i < 120; i++) { h = map(ro + rd * t); if (h.x < .0006 * t || t > 9.) break; t += h.x * .85; }
  vec3 col = env(rd);
  if (t < 9.) {
    vec3 pos = ro + rd * t, n = normal(pos);
    vec3 q = pos - vec3(0., .064, 0.); q.xz = rot(A) * q.xz;
    float id = h.y;
    vec3 alb = vec3(.55, .55, .58); float shin = 8., spec = .05;
    if (id > .5 && id < 1.5) { alb = vec3(.02); shin = 120.; spec = .5; }
    else if (id < 2.5) { alb = vec3(1., .8, .66); shin = 30.; spec = .2; if (q.y > 1.7) alb = decal((q - vec3(0., 1.83, 0.)) / .42, alb); }
    else if (id < 3.5) { alb = mix(vec3(.02, .03, .085), vec3(.2, .55, .9), smoothstep(1.74, 1.68, q.y)); shin = 30.; spec = .3; }
    else if (id < 4.5) { alb = vec3(.86, .87, .9); shin = 25.; spec = .2; }
    else if (id < 5.5) { alb = vec3(.025, .035, .09); shin = 50.; spec = .4; if (q.y < 1.34) alb = mix(alb, vec3(.95, .6, .15), smoothstep(1.345, 1.325, q.y) * .6); }
    else if (id < 6.5) { alb = vec3(.075, .085, .12); shin = 20.; spec = .2; }
    else if (id < 7.5) { alb = vec3(.18, .1, .07); shin = 60.; spec = .5; }
    else if (id < 8.5) { alb = vec3(1., .62, .15); shin = 90.; spec = .8; }
    else if (id < 9.5) { alb = vec3(.92, .45, .17); shin = 40.; spec = .35; }
    float sh = shadow(pos + n * .003, KEY), oc = ao(pos, n);
    float dk = max(dot(n, KEY), 0.), dr = max(dot(n, RIM), 0.), df = max(dot(n, FILL), 0.);
    if (id > 1.5 && id < 2.5) dk = max((dot(n, KEY) + .3) / 1.3, 0.);   // 肌は光が中で回り込み、影の境目がやわらかい
    vec3 lig = vec3(1., .95, .88) * 1.7 * dk * sh + vec3(.75, .85, 1.) * 1.1 * dr + vec3(.9, .9, 1.) * .35 * df + vec3(.55, .6, .7) * .35 * (.5 + .5 * n.y);
    col = alb * lig * oc;
    vec3 hv = normalize(KEY - rd);
    float fr = .04 + .96 * pow(1. - max(dot(n, -rd), 0.), 5.);
    col += spec * (vec3(1.) * pow(max(dot(n, hv), 0.), shin) * 2. * sh + env(reflect(rd, n)) * fr * .5) * oc;
    if (id < .5) col = mix(col, env(rd), smoothstep(2.5, 7., t));   // 机の奥は背景紙へ溶ける
  }
  O = vec4(film(col * .8), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const U = n => gl.getUniformLocation(pg, n);
    const uR = U('R'), uT = U('T'), uA = U('A'), uBL = U('BL');
    const q = window.THUMB ? 0.3 : 0.6;
    let blinkAt = 2, start = -1;
    (function draw(now) {
      if (start < 0) start = now;
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      const t = (now - start) / 1000;   // 最初の描画から数える（開いたときは正面に近い向きから回り始める）
      if (t > blinkAt + .2) blinkAt = t + 2.5 + Math.random() * 3;
      const bt = (t - blinkAt) / .18, bl = bt > 0 && bt < 1 ? Math.abs(Math.cos(bt * Math.PI)) : 1;
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, t); gl.uniform1f(uA, t * .45 - .9); gl.uniform1f(uBL, bl);   // 開いてから約2秒で正面を向く
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
});
