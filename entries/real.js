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
  float aa = 1.3 / R.y;   // 縁を1画素ほどぼかして、斜めの輪郭のぎざぎざを消す
  float wing = smoothstep(.36 + aa, .36 - aa, p.x) * smoothstep(te - aa, te + aa, p.y) * smoothstep(le + aa, le - aa, p.y);
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
    const q = window.THUMB ? 0.35 : 0.9;
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
  // 塔の作業灯と、点滅する赤い灯。地上の投光器が、点火前の機体を下から照らす
  for (int i = 0; i < 4; i++) col += vec3(1., .78, .45) * exp(-length(w - vec2(-.046, -.3 + float(i) * .06)) * 420.) * .9;
  col += vec3(1., .1, .05) * exp(-length(w - vec2(-.06, -.074)) * 300.) * step(.5, fract(T * .7)) * 1.5;
  for (int i = 0; i < 2; i++) {
    vec2 a = vec2(float(i) * .3 - .15, -.33), tg = rk + vec2(0., .04) - a, d = normalize(tg), e = w - a;
    float along = dot(e, d), off = abs(e.x * d.y - e.y * d.x);
    col += vec3(.65, .72, .85) * exp(-off * 70. / max(.3 + along, .05)) * smoothstep(.0, .1, along) * smoothstep(length(tg) + .02, length(tg) - .03, along) * (1. - ign) * .06;   // 光源の後ろでは数が無限大にならないよう下限を置き、機体の所で止める
  }
  // 白煙: 発射台から横へ広がる水蒸気と、ロケットまで伸びる柱
  float side = fbm(vec2(w.x * 3. - sign(w.x) * A * .4, w.y * 6. - A * .1)) * smoothstep(.02, -.15, w.y + .26 - abs(w.x) * .08) * smoothstep(min(A * .25, 1.4), .0, abs(w.x)) * step(0., A);
  float colw = .035 + max(0., H - w.y) * .09;
  float colm = smoothstep(colw, colw * .3, abs(w.x + (noise(vec2(w.y * 2., 3.)) - .5) * .05)) * step(-.32, w.y) * step(w.y, H - .02);
  float column = colm * (.5 + fbm(vec2(w.x * 8., w.y * 3. - A * .2)) * 1.2) * step(0., A);   // 白煙は点火してから
  float smoke = clamp(side + column, 0., 1.);
  vec3 sc = mix(vec3(.1, .1, .13), vec3(.45, .44, .46), fbm(w * 7.));
  sc += vec3(1., .5, .15) * ign * exp(-abs(w.y - rk.y + .05) * 4.) * 2.;   // 炎の近くは橙に照らされる
  col = mix(col, sc, smoothstep(.15, .6, smoke));
  // ロケット本体と噴射炎
  vec2 q = w - rk;
  float wd = .005 * (1. - smoothstep(.07, .092, q.y) * .85);                     // 先端は細くなる
  float body = smoothstep(wd + .0015, wd - .0005, abs(q.x)) * step(0., q.y) * step(q.y, .092);
  vec3 bc = mix(vec3(.95, .95, 1.), vec3(.32, .34, .4), smoothstep(-wd, wd, q.x));   // 左から光が当たる
  bc *= 1. - .6 * smoothstep(.003, .0, abs(q.y - .056));                            // 段の継ぎ目
  col = mix(col, bc * (.6 + .4 * ign), body);
  float flame = exp(-abs(q.x) * (90. - min(q.y, 0.) * 200.)) * exp(min(q.y, 0.) * 18.) * step(q.y, 0.) * ign * smoothstep(-.335, -.325, w.y);   // 炎は地面の下へは見えない
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
  // 駅（約 22 秒ごとに数秒。開いた直後に白くならないよう、11 秒ずらす）とトンネル（約 37 秒ごとに数秒）
  float st = smoothstep(.0, .05, fract((T + 11.) / 22.)) * smoothstep(.2, .15, fract((T + 11.) / 22.));
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
  // 窓ごとに大きさ・色（電球の暖色と蛍光灯の白）・明るさを変え、速く流れるので横にぶれる
  vec2 wf = vec2(fract(xm * 14.), fract((p.y + .25) * 30.)) - .5;
  float ww = .12 + .25 * hash(hc + 3.), wh = .18 + .2 * hash(hc + 5.);
  float win = smoothstep(ww + .25, ww - .05, abs(wf.x)) * smoothstep(wh + .04, wh - .04, abs(wf.y));
  vec3 wc = mix(vec3(1., .66, .34), vec3(.8, .9, 1.), step(.7, hash(hc + 9.)));
  col += wc * step(.82, hash(hc)) * house * win * (.25 + .45 * hash(hc + 11.));
  float lamp = exp(-length(vec2((fract(xm * 1.3) - .5) * 1.5, (p.y + .05) * 2.)) * 12.);
  col += vec3(1., .8, .55) * lamp * .5;
  float crossing = step(.85, hash(vec2(floor(xm * .7), 9.)));
  col += vec3(1., .05, .02) * crossing * step(.5, fract(T * 1.5)) * exp(-length(vec2(fract(xm * .7) - .5, p.y + .12) * vec2(3., 6.)) * 10.) * 3.;
  // 駅: 白い光の柱が並び、車内まで照らす
  col += vec3(.9, .95, 1.) * st * (.4 + .6 * step(.5, fract(p.x * 3. + run * 2.))) * smoothstep(.4, -.2, p.y) * .8;
  // すぐ前の架線柱: 一瞬で横切り、大きくぶれる
  float xc = p.x * .5 + run * 1.7, ci = floor(xc), xn = fract(xc) + (hash(vec2(ci, 6.)) - .5) * .5;   // 間隔は不ぞろい
  float pole = smoothstep(.07, .0, abs(xn - .5) - .015) * step(.35, hash(vec2(ci, 2.)));
  col *= 1. - pole * .97;
  // 架線: 柱と柱の間でたわむ線が、窓の上のほうを上下する
  float sag = .3 - .05 * (1. - 4. * (fract(xc) - .5) * (fract(xc) - .5));
  col *= 1. - smoothstep(.006, .0, abs(p.y - sag)) * .8 - smoothstep(.005, .0, abs(p.y - sag - .025)) * .6;
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
  float rtop = -.22 + fbm(vec2(p.x * 4., 1.)) * .12 - smoothstep(.2, -.6, p.x) * .1;   // 岩の上の縁
  float rock = smoothstep(.002, -.002, p.y - rtop);
  col = mix(col, vec3(.008, .009, .011), rock);
  // しぶき: 岩の縁から上へ、場所ごとに時々ふくらんでは消える。縁は霧のようにやわらかい
  float hgt = p.y - rtop;
  float burst = smoothstep(.5, .8, fbm(vec2(p.x * 2.5 + 7., T * .35)));
  float spray = fbm(vec2(p.x * 7. - T * .2, hgt * 10. - T * .8)) * exp(-max(hgt, 0.) / (.02 + .06 * burst)) * smoothstep(-.004, .006, hgt) * burst;
  col += vec3(.5, .55, .6) * spray * .4 * (1. + pow(face, 10.) * 3.);
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
  cape = max(cape, -max(abs(q.x) - .035, -q.z));                            // 前の真ん中だけを切り抜いて開ける
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
      gl.uniform2f(uR, w, h); gl.uniform1f(uT, t); gl.uniform1f(uA, Math.max(0, t - 1.5) * .45); gl.uniform1f(uBL, bl);   // 開いてすぐは正面を向き、1.5秒後に回り始める
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(draw);
    })(0);
  },
});
dekiru.add({
  id: 'real-dusk-ride', c: 'real', lv: 3,
  t: '1枚のシェーダーで描く、夕暮れの道を走る自転車', y: 'いちまいのしぇーだーでえがくゆうぐれのみちをはしるじてんしゃ',
  tags: ['シェーダー', 'WebGL2', 'レイマーチング', 'IK', 'ループ映像'],
  d: 'X で「この映像は 10KB のコード」と紹介された、夕暮れの道を自転車で走る映像（gokaygokay、2026-11-18）を調べ、公開されたシェーダーの仕組みを同じ考え方で書き直した。映像は 1 枚のフラグメントシェーダーが、画面の点ごとに光線を飛ばして色を計算して作る。道の形、木の並び、ペダルと車輪の回転を 1 周の時間に合わせてあるので、10 秒でつなぎ目なく繰り返す。下のボタンで、曲がるときの傾き・ぶれ・雲の立体感・色の仕上げを 1 つずつ切って、違いを見られる。',
  p: 'つなぎ目のない繰り返しは「1 周で進む距離 ＝ 世界の繰り返しの長さ」で作る。道の形は距離 D ごとに同じに戻る sin の和にし、木は区画の番号を D の中の区画の数で割った余りから決める。ペダルは 1 周でちょうど整数回、車輪はスポークの間の角度のちょうど整数倍だけ回るように、回転の速さと車輪の半径を選ぶ。',
  html: `<canvas id="c" role="img" aria-label="夕暮れの丘の道を、自転車に乗った人が走り続ける映像。10 秒でつなぎ目なく繰り返す"></canvas>
<div class="ui bar" role="toolbar" aria-label="映像の仕組みの切り替え">
  <button type="button" id="pause">止める</button>
  <button type="button" class="tg" data-k="lean" aria-pressed="true">曲がるときの傾き</button>
  <button type="button" class="tg" data-k="blur" aria-pressed="true">ぶれと縁のなめらかさ</button>
  <button type="button" class="tg" data-k="cloud" aria-pressed="true">雲の立体感</button>
  <button type="button" class="tg" data-k="tone" aria-pressed="true">色の仕上げ</button>
  <progress id="loop" max="1" value="0" aria-label="10 秒の 1 周のうち進んだ割合"></progress>
</div>
<details class="ui how">
  <summary>元の映像を調べて分かったこと</summary>
  <ul>
    <li>全体は 1 枚のフラグメントシェーダー（Shadertoy の mainImage の形）。WebGL2 で画面を覆う三角形を 1 つ描き、640×360 の点ごとに色を計算する。時刻を 7 秒で割った余りを使い、60 コマ/秒の 420 コマで元に戻る。</li>
    <li>道の中心は sin の和で曲がり、木や柵は区画の番号の余りとハッシュで置く。進む速さは 7 秒で 144 単位。車輪は 7 秒で、スポークの間の角度（30 度）のちょうど 814 倍回る。</li>
    <li>車体の傾きは、道の曲がり具合 κ と速さ v から atan(v²κ / 9.81)。遠心力と重力が釣り合う角度。</li>
    <li>脚は、ペダルの位置と腰から膝を求める 2 本の骨の IK（長さ 0.431 と 0.384）。体の多くと車輪は、楕円体・先の細い円柱・厚みのある輪と光線の交わりを式で解く。胴まわりだけは、箱で範囲を絞ってから距離関数を最大 49 回たどる。</li>
    <li>地面は高さの関数を最大 70 回たどって当たりを探し、6 回の二分法で詰める。</li>
    <li>雲は 2D の楕円を重ねてなめらかにつなぎ、楕円を半球と見たときの向き（法線）で光の当たり方を決める。立体の雲を計算せずに、立体らしく見せる。</li>
    <li>人と自転車は、1 点につき 4 回、位置と時刻を少しずつずらして計算して平均する（回転格子の 4 点。動きのぶれも同時に出る）。画面の下の道は、前後の時刻の絵を重ねてぶらす。</li>
    <li>色は HLG（放送の HDR の決まり）で表した値で計算し、最後に BT.2020 から BT.709 へ行列で直し、明るさの曲線で縮めて sRGB にする。乱数は PCG のハッシュ（GPU によって結果が変わらない）。</li>
    <li>公開されたファイルは 41,886 バイト（gzip 17,087 バイト）。名前を 2 文字に縮めてある。投稿の「10KB」が何を数えたかは書かれていない。作者は、自作の MIT のライブラリ shader-skills（GLSL の部品 197 個と、まとめる道具・点検する道具）を AI（GPT Astra 6.2）に使わせて作ったと書いている。</li>
  </ul>
  <p>この項目のコードは、上の仕組みをもとに自分で書いたもの（元のコードは使っていない）。人の骨組み・車体の傾き・カメラは JS で 1 コマに 2 回（シャッターの始めと終わり）計算し、シェーダーへ渡している（元の映像は、これもシェーダーの中で点ごとに計算する）。</p>
</details>
<p class="ui info" id="info"></p>
<p class="ui credit">元の投稿: <a href="https://x.com/gokayfem/status/2123083869562003745" target="_blank" rel="noopener">gokaygokay の投稿（X）</a>・<a href="https://github.com/gokayfem/sunset-ride" target="_blank" rel="noopener">sunset-ride</a>・<a href="https://github.com/gokayfem/shader-skills" target="_blank" rel="noopener">shader-skills（MIT）</a></p>`,
  css: `
:root { color-scheme: dark; }
[hidden] { display: none !important; }
body { margin: 0; background: #000; overflow: hidden; font: 13px/1.5 system-ui, sans-serif; color: #f4ece4; }
canvas { display: block; width: 100vw; height: 100vh; }
.bar { position: fixed; left: 8px; right: 8px; bottom: 30px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.bar button { min-height: 32px; padding: 4px 10px; font: inherit; color: inherit; background: rgb(20 14 12 / .72); border: 1px solid rgb(255 236 220 / .55); border-radius: 6px; cursor: pointer; }
.bar .tg[aria-pressed="true"] { background: rgb(255 170 110 / .85); color: #1c0f08; border-color: #ffd2b0; }
.bar button:focus-visible, .how summary:focus-visible, .credit a:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
#loop { flex: 1 1 120px; min-width: 80px; height: 8px; accent-color: #ffb27a; }
.how { position: fixed; z-index: 2; left: 8px; top: 8px; max-width: min(560px, calc(100vw - 16px)); max-height: calc(100vh - 110px); overflow: auto; background: rgb(20 14 12 / .82); border: 1px solid rgb(255 236 220 / .4); border-radius: 8px; padding: 4px 10px; }
.how summary { cursor: pointer; min-height: 28px; line-height: 28px; font-weight: 700; }
.how ul { margin: 4px 0; padding-left: 1.2em; } .how li { margin: 3px 0; } .how p { margin: 6px 0; }
.info { position: fixed; right: 8px; top: 8px; margin: 0; padding: 2px 8px; background: rgb(20 14 12 / .6); border-radius: 6px; font-variant-numeric: tabular-nums; }
.credit { position: fixed; left: 8px; bottom: 4px; margin: 0; font-size: 12px; text-shadow: 0 1px 2px #000; }
.credit a { color: #ffd2b0; }
@media (max-width: 760px) { .info { top: 46px; left: 8px; right: auto; } }
.thumb .ui { display: none; }`,
  core() {
    // 映像の骨組み（画面を使わない計算）。道・自転車の傾き・脚と腕の IK・カメラを、時刻 t から決める
    const RD = (() => {
      const P = {
        T: 10, V: 10, D: 100,                 // 1 周の秒数・速さ（m/秒）・道の形が繰り返す長さ（m）。V × T = D
        A1: 4.2, A2: 1.7, PH2: 1.3,           // 道の中心の左右のうねり（2 つの sin）
        H1: 0.8, PHH: 0.5,                    // 道の高さのうねり
        LANE: 0.95, RW: 2.6, Z0: 30, G: 9.81, // 走る位置（中心から右）・道の幅の半分・始めの位置・重力
        CAD: 1.5, SPOKES: 12,                 // ペダルの回転（回/秒）・スポークの数
        CRANK: 0.17, PEDAL_X: 0.11, THIGH: 0.44, SHIN: 0.44, UPPER: 0.29, FORE: 0.29,
      };
      P.K = 2 * Math.PI / P.D;
      // 車輪の半径: 1 周で進む D を半径で割った回転の量が、スポークの間の角度のちょうど整数倍になる値（0.34 m に近いもの）
      const m = Math.round(P.D * P.SPOKES / (2 * Math.PI * 0.34));
      P.WHEEL_R = P.D * P.SPOKES / (2 * Math.PI * m);
      const roadX = (z) => P.A1 * Math.sin(P.K * z) + P.A2 * Math.sin(2 * P.K * z + P.PH2);
      const roadDX = (z) => P.A1 * P.K * Math.cos(P.K * z) + 2 * P.A2 * P.K * Math.cos(2 * P.K * z + P.PH2);
      const roadDDX = (z) => -P.A1 * P.K * P.K * Math.sin(P.K * z) - 4 * P.A2 * P.K * P.K * Math.sin(2 * P.K * z + P.PH2);
      const roadY = (z) => P.H1 * Math.sin(P.K * z + P.PHH);
      const roadDY = (z) => P.H1 * P.K * Math.cos(P.K * z + P.PHH);
      const curv = (z) => roadDDX(z) / Math.pow(1 + roadDX(z) ** 2, 1.5);   // 上から見た道の曲がり（右へ曲がると正）
      const lean = (v, k, g) => Math.atan(v * v * k / g);                  // 遠心力 v²κ と重力 g が釣り合う傾き
      const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const norm = (a) => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
      // 2 本の骨の IK: 根元 a と先 c の間に、長さ l1・l2 の骨をつなぐ関節を、目印の向き pole の側に置く（余弦定理）
      function ik2(a, c, l1, l2, pole) {
        const ac = sub(c, a), d = Math.min(Math.hypot(ac[0], ac[1], ac[2]), l1 + l2 - 1e-9), e = norm(ac);
        const x = (l1 * l1 + d * d - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
        const side = norm(sub(pole, mul(e, dot(pole, e))));
        return add(add(a, mul(e, x)), mul(side, h));
      }
      // 時刻 t の姿。opt.lean が false なら、曲がっても傾けない
      function rig(t, opt) {
        const z = P.Z0 + P.V * t, o = [roadX(z) + P.LANE, roadY(z), z];
        const F = norm([roadDX(z), roadDY(z), 1]), R0 = norm(cross([0, 1, 0], F)), U0 = cross(F, R0);
        const theta = opt && opt.lean === false ? 0 : lean(P.V, curv(z), P.G);
        const c = Math.cos(theta), s = Math.sin(theta);
        const U = add(mul(U0, c), mul(R0, s)), R = sub(mul(R0, c), mul(U0, s));
        const W = (l) => add(add(add(o, mul(R, l[0])), mul(U, l[1])), mul(F, l[2]));   // 自転車の中の位置（右, 上, 前）を世界へ
        const ph = 2 * Math.PI * P.CAD * t + 0.4, tt = 2 * Math.PI * t / P.T;
        const bb = [0, 0.29, 0], J = { bb: W(bb) };
        const L = {};
        for (const [k, sg, a] of [['R', 1, ph], ['L', -1, ph + Math.PI]]) {
          const pedal = [sg * P.PEDAL_X, bb[1] - P.CRANK * Math.cos(a), -P.CRANK * Math.sin(a)];
          L['pedal' + k] = pedal;
          L['ankle' + k] = add(pedal, [0, 0.075, -0.045]);
          L['heel' + k] = add(pedal, [0, 0.05, -0.1]);
          L['toe' + k] = add(pedal, [0, 0.03 + 0.025 * Math.sin(a), 0.11]);
        }
        const bob = 0.006 * Math.sin(2 * ph), sway = 0.012 * Math.sin(ph);
        L.pelvis = [sway * 0.5, 1.0 + bob, -0.24];
        L.chest = [sway, 1.42 + bob * 0.5, 0.12];
        L.head = add(L.chest, [sway * 0.5, 0.2, 0.13]);
        for (const [k, sg] of [['R', 1], ['L', -1]]) {
          L['hip' + k] = add(L.pelvis, [sg * 0.09, -0.02, 0]);
          L['shoulder' + k] = add(L.chest, [sg * 0.17, 0, -0.02]);
          L['hand' + k] = [sg * 0.21, 0.99, 0.44];
        }
        L.rearAxle = [0, P.WHEEL_R, -0.52]; L.frontAxle = [0, P.WHEEL_R, 0.5];
        L.seat = [0, 0.93, -0.24]; L.headTube = [0, 0.88, 0.38]; L.downTop = [0, 0.8, 0.4]; L.bar = [0, 0.99, 0.44];
        for (const k of Object.keys(L)) J[k] = W(L[k]);
        // 膝と肘は世界の中で IK を解く（目印: 膝は前、肘は外と後ろ）
        for (const [k, sg] of [['R', 1], ['L', -1]]) {
          J['knee' + k] = ik2(J['hip' + k], J['ankle' + k], P.THIGH, P.SHIN, add(mul(F, 1), mul(R, sg * 0.08)));
          J['elbow' + k] = ik2(J['shoulder' + k], J['hand' + k], P.UPPER, P.FORE, add(add(mul(R, sg), mul(U, -0.4)), mul(F, -0.5)));
        }
        // カメラ: 人の 4.6 m 後ろ、道の左寄りの少し高い所から、人の少し前を見る。揺れは 1 周で元に戻る
        const cz = z - 4.6, cp = [roadX(cz) - 1.5 + 0.12 * Math.sin(tt), roadY(cz) + 1.5 + 0.04 * Math.sin(2 * tt + 1), cz];
        const tg = add(o, [0, 0.8, 2.2]), cF = norm(sub(tg, cp)), cR = norm(cross([0, 1, 0], cF)), cU = cross(cF, cR);
        return { z, o, F, R, U, theta, crank: ph, wheel: P.V * t / P.WHEEL_R, J, cam: { p: cp, F: cF, R: cR, U: cU } };
      }
      return { P, roadX, roadDX, roadDDX, roadY, roadDY, curv, lean, ik2, rig };
    })();
  },
  js() {
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    const dlog = (ev, args, res) => console.info('[dlog] ' + ev + ' ' + JSON.stringify(args) + ' ' + res);
    if (!gl) { dlog('ride.error', { why: 'webgl2' }, 'ng'); document.body.textContent = 'この映像には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    if (window.THUMB) document.body.classList.add('thumb');
    const P = RD.P, NAMES = Object.keys(RD.rig(0, { lean: true }).J), NJ = NAMES.length;
    const f = (v) => v.toFixed(6);
    const fs = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 RES; uniform float TT; uniform int FL;
uniform vec3 J0[${NJ}], J1[${NJ}];   // 骨組みの点（シャッターの始めと終わり）
uniform vec3 B0[4], B1[4];         // 自転車: 原点・前・右・上
uniform vec3 C0[4], C1[4];         // カメラ: 位置・前・右・上
uniform vec2 WA;                   // 車輪の回転角（始めと終わり）
out vec4 O;
const float PI = 3.14159265, D = ${f(P.D)}, K = ${f(P.K)}, A1 = ${f(P.A1)}, A2 = ${f(P.A2)}, PH2 = ${f(P.PH2)}, H1 = ${f(P.H1)}, PHH = ${f(P.PHH)};
const float RW = ${f(P.RW)}, WR = ${f(P.WHEEL_R)}, CELL = 5.0, SPOKE = ${f(2 * Math.PI / P.SPOKES)};
const int NCELL = ${Math.round(P.D / 5)};
const vec3 SUN = vec3(${(() => { const v = [-0.32, 0.115, 1], l = Math.hypot(...v); return v.map((x) => f(x / l)).join(', '); })()});
const vec3 SUNC = vec3(1.0, 0.56, 0.3) * 4.0, SKYC = vec3(0.24, 0.29, 0.6) * 0.5, BOUNCE = vec3(0.5, 0.3, 0.18) * 0.2;
${NAMES.map((n, i) => `#define J_${n} ${i}`).join('\n')}
float gS; vec3 gB[4]; float gW;   // 今の標本のシャッターの中の位置、自転車の向き、車輪の角度
vec3 jp(int i) { return mix(J0[i], J1[i], gS); }

// ---- 乱数とノイズ（PCG のハッシュ: 整数だけで計算するので、GPU によって結果が変わらない）----
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float h21(ivec2 p) { uvec2 q = uvec2(p + 1048576); return float(pcg(q.x + pcg(q.y)) >> 8) / 16777216.0; }   // 負の数は足して正にしてから使う
// z の向きに nz 個の格子で繰り返す値のノイズ（世界が D ごとに同じになる）
float vnz(vec2 p, int nz) {
  vec2 i = floor(p), q = fract(p); q = q * q * (3.0 - 2.0 * q);
  ivec2 c = ivec2(i); int z0 = ((c.y % nz) + nz) % nz, z1 = (z0 + 1) % nz;
  return mix(mix(h21(ivec2(c.x, z0)), h21(ivec2(c.x + 1, z0)), q.x), mix(h21(ivec2(c.x, z1)), h21(ivec2(c.x + 1, z1)), q.x), q.y);
}

// ---- 道と地面 ----
float roadX(float z) { return A1 * sin(K * z) + A2 * sin(2.0 * K * z + PH2); }
float roadY(float z) { return H1 * sin(K * z + PHH); }
float hills(vec2 q) {
  float x = q.x, a = q.y * K;   // z を、1 周で 2π のラジアンに直す（sin の中の z の係数を整数にして繰り返させる）
  float h = 3.2 * sin(0.042 * x + a + 0.7) + 2.0 * sin(0.083 * x - 2.0 * a + 1.9) + 1.1 * sin(0.16 * x + 3.0 * a + 4.1);
  return h + 2.4 * vnz(vec2(x * 0.09, q.y * 24.0 / D), 24) + 2.5;
}
float ground(vec2 q) {
  float dx = abs(q.x - roadX(q.y)), m = smoothstep(RW + 0.8, RW + 12.0, dx);
  return roadY(q.y) - 0.06 * smoothstep(RW + 0.2, RW + 0.9, dx) * (1.0 - m) + m * hills(q);
}
// 高さの関数をたどって地面との当たりを探し、通り過ぎたら二分法で詰める
float marchGround(vec3 ro, vec3 rd, float tmax) {
  float t = 0.3, lt = 0.3;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd * t; float h = p.y - ground(p.xz);
    if (h < 0.0) {
      for (int j = 0; j < 6; j++) { float m = 0.5 * (t + lt); vec3 q = ro + rd * m; if (q.y < ground(q.xz)) t = m; else lt = m; }
      return t;
    }
    if (rd.y > 0.0 && p.y > 16.0) break;
    lt = t; t += max(0.05 + 0.012 * t, 0.45 * h);
    if (t > tmax) break;
  }
  return -1.0;
}

// ---- 木: 区画の番号を NCELL で割った余りから、あるか・位置・形を決める ----
bool treeAt(int i, int s, out vec3 cc, out vec3 r, out float tall) {
  int k = ((i % NCELL) + NCELL) % NCELL;
  float a = h21(ivec2(k, s * 7 + 3)), b = h21(ivec2(k * 3 + 1, s * 11 + 5)), e = h21(ivec2(k * 5 + 2, s * 13 + 1));
  if (a < 0.38) return false;
  float z = (float(i) + b) * CELL, x = roadX(z) + float(s) * (RW + 3.4 + e * 15.0), sz = 0.75 + 0.5 * b;
  tall = a > 0.8 ? 1.0 : 0.0;
  r = tall > 0.5 ? vec3(0.75, 2.5, 0.75) * sz : vec3(2.0, 1.7, 2.0) * sz;
  cc = vec3(x, ground(vec2(x, z)) + (tall > 0.5 ? 2.3 : 3.2) * sz, z);
  return true;
}
float hitEll(vec3 ro, vec3 rd, vec3 c, vec3 r) {
  vec3 o = (ro - c) / r, d = rd / r; float a = dot(d, d), b = dot(o, d), h = b * b - a * (dot(o, o) - 1.0);
  return h < 0.0 ? -1.0 : (-b - sqrt(h)) / a;
}
float hitTrunk(vec3 ro, vec3 rd, vec3 base, float rad, float hgt) {
  vec2 o = ro.xz - base.xz, d = rd.xz; float a = dot(d, d), b = dot(o, d), h = b * b - a * (dot(o, o) - rad * rad);
  if (h < 0.0) return -1.0; float t = (-b - sqrt(h)) / a, y = ro.y + rd.y * t;
  return (y > base.y - 0.5 && y < base.y + hgt) ? t : -1.0;
}
// 光線が当たるいちばん近い木（kind: 1 葉、2 幹）
float traceTrees(vec3 ro, vec3 rd, float tmax, out vec3 nrm, out float kind) {
  float best = tmax; kind = 0.0; int i0 = int(floor(ro.z / CELL)) - 1;
  for (int j = 0; j < 46; j++) {
    int i = i0 + j; if (float(i) * CELL - ro.z > best + 4.0) break;
    for (int s = -1; s <= 1; s += 2) {
      vec3 c, r; float tl; if (!treeAt(i, s, c, r, tl)) continue;
      float tz = (c.z - ro.z) / max(rd.z, 0.05); vec3 pz = ro + rd * tz;
      if (abs(pz.x - c.x) > r.x + 3.0 || pz.y > c.y + r.y + 2.0) continue;   // その z で光線が遠ければ捨てる
      float t = hitEll(ro, rd, c, r);
      if (t > 0.0 && t < best) { best = t; kind = 1.0; nrm = normalize((ro + rd * t - c) / (r * r)); }
      if (tl < 0.5) {
        vec3 c2 = c + vec3(0.45 * r.x * float(s), 0.75 * r.y, 0.2 * r.z), r2 = r * vec3(0.62, 0.7, 0.62);
        t = hitEll(ro, rd, c2, r2);
        if (t > 0.0 && t < best) { best = t; kind = 1.0; nrm = normalize((ro + rd * t - c2) / (r2 * r2)); }
        vec3 base = vec3(c.x, c.y - r.y * 1.6, c.z); float tt = hitTrunk(ro, rd, base, 0.17 * r.x / 2.2, r.y * 1.2);
        if (tt > 0.0 && tt < best) { best = tt; kind = 2.0; vec3 p = ro + rd * tt; nrm = normalize(vec3(p.x - base.x, 0.0, p.z - base.z)); }
      }
    }
  }
  return kind > 0.0 ? best : -1.0;
}
// 太陽の向きへの光線が木に当たるか（地面の影）
float treeShadow(vec3 p) {
  int i0 = int(floor(p.z / CELL)) - 1;
  for (int j = 0; j < 13; j++) for (int s = -1; s <= 1; s += 2) {
    vec3 c, r; float tl; if (!treeAt(i0 + j, s, c, r, tl)) continue;
    if (hitEll(p, SUN, c, r) > 0.0) return 0.0;
    if (tl < 0.5 && hitEll(p, SUN, c + vec3(0.45 * r.x * float(s), 0.75 * r.y, 0.2 * r.z), r * vec3(0.62, 0.7, 0.62)) > 0.0) return 0.0;
  }
  return 1.0;
}

// ---- 人と自転車: 距離関数（いちばん近い面までの距離）を、カプセル・円錐・輪で作る ----
float sdCap(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
vec2 sdCone(vec3 p, vec3 a, vec3 b, float ra, float rb) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return vec2(length(pa - ba * h) - mix(ra, rb, h), h); }
void un(inout vec2 m, float d, float id) { if (d < m.x) m = vec2(d, id); }
// id: 1 肌、2 上着、3 ズボン、4 車体、5 タイヤ、6 帽子、7 靴、8 金属、9 黒
vec2 rider(vec3 p) {
  vec3 Fw = gB[1], R = gB[2], U = gB[3]; vec2 m = vec2(1e9, 0.0);
  for (int w = 0; w < 2; w++) {
    vec3 c = jp(w == 0 ? J_rearAxle : J_frontAxle), q = p - c; float y = dot(q, R); vec3 pl = q - y * R; float rr = length(pl);
    un(m, length(vec2(rr - (WR - 0.018), y)) - 0.018, 5.0);
    un(m, length(vec2(rr - (WR - 0.046), y)) - 0.007, 8.0);
    float an = atan(dot(pl, U), dot(pl, Fw)) + gW;            // 車輪の面の中の角度。回転の分だけずらす
    an = mod(an + 0.5 * SPOKE, SPOKE) - 0.5 * SPOKE;          // スポークの間の角度で折り返す
    vec2 pp = vec2(cos(an), sin(an)) * rr;
    un(m, max(length(vec2(pp.y, y)) - 0.0035, max(0.03 - pp.x, pp.x - WR + 0.046)), 8.0);
    un(m, sdCap(p, c - R * 0.05, c + R * 0.05, 0.022), 8.0);
  }
  vec3 bb = jp(J_bb), seat = jp(J_seat), ht = jp(J_headTube);
  un(m, sdCap(p, bb, seat, 0.017), 4.0);
  un(m, sdCap(p, seat - U * 0.06, ht, 0.016), 4.0);
  un(m, sdCap(p, bb, jp(J_downTop), 0.021), 4.0);
  un(m, sdCap(p, bb, jp(J_rearAxle), 0.012), 4.0);
  un(m, sdCap(p, seat - U * 0.08, jp(J_rearAxle), 0.011), 4.0);
  un(m, sdCap(p, ht, jp(J_frontAxle), 0.014), 4.0);
  un(m, sdCap(p, ht, jp(J_bar), 0.015), 9.0);
  un(m, sdCap(p, jp(J_handL), jp(J_handR), 0.012), 9.0);
  un(m, sdCap(p, seat - Fw * 0.08 + U * 0.035, seat + Fw * 0.11 + U * 0.03, 0.03), 9.0);
  un(m, length(vec2(length((p - bb) - dot(p - bb, R) * R) - 0.1, dot(p - bb, R) - 0.05)) - 0.006, 8.0);   // 前のギア
  for (int k = 0; k < 2; k++) {
    float sg = k == 0 ? 1.0 : -1.0;
    vec3 pd = jp(k == 0 ? J_pedalR : J_pedalL), hip = jp(k == 0 ? J_hipR : J_hipL), knee = jp(k == 0 ? J_kneeR : J_kneeL), ank = jp(k == 0 ? J_ankleR : J_ankleL);
    un(m, sdCap(p, bb + R * sg * 0.06, pd - R * sg * 0.03, 0.011), 8.0);
    un(m, sdCap(p, pd - R * sg * 0.035, pd + R * sg * 0.035, 0.016), 9.0);
    un(m, sdCap(p, jp(k == 0 ? J_heelR : J_heelL), jp(k == 0 ? J_toeR : J_toeL), 0.04), 7.0);
    vec2 th = sdCone(p, hip, knee, 0.078, 0.056); un(m, th.x, th.y < 0.55 ? 3.0 : 1.0);
    un(m, sdCone(p, knee, ank, 0.052, 0.036).x, 1.0);
    vec3 sh = jp(k == 0 ? J_shoulderR : J_shoulderL), el = jp(k == 0 ? J_elbowR : J_elbowL), hd = jp(k == 0 ? J_handR : J_handL);
    vec2 ua = sdCone(p, sh, el, 0.05, 0.04); un(m, ua.x, ua.y < 0.45 ? 2.0 : 1.0);
    un(m, sdCone(p, el, hd, 0.038, 0.03).x, 1.0);
    un(m, length(p - hd) - 0.037, 9.0);
  }
  vec3 pel = jp(J_pelvis), ch = jp(J_chest), hc = jp(J_head);
  un(m, length(p - pel) - 0.125, 3.0);
  un(m, sdCone(p, pel + U * 0.05, ch, 0.125, 0.15).x, 2.0);
  un(m, sdCap(p, mix(jp(J_shoulderL), jp(J_shoulderR), 0.12), mix(jp(J_shoulderR), jp(J_shoulderL), 0.12), 0.06), 2.0);
  un(m, sdCap(p, ch + U * 0.04, mix(ch, hc, 0.62), 0.045), 1.0);
  un(m, length(p - hc) - 0.1, 1.0);
  un(m, max(length(p - hc - U * 0.02) - 0.122, -dot(p - hc, U) - 0.005), 6.0);   // 帽子（球の上半分）
  return m;
}
vec4 riderBound() { return vec4(gB[0] + gB[3] * 0.78, 1.2); }
float marchRider(vec3 ro, vec3 rd, float tmax, out float id) {
  vec4 bs = riderBound(); vec3 oc = ro - bs.xyz; float b = dot(oc, rd), h = b * b - dot(oc, oc) + bs.w * bs.w;
  if (h < 0.0) return -1.0; h = sqrt(h);
  float t = max(-b - h, 0.0), t1 = min(-b + h, tmax);
  for (int i = 0; i < 80; i++) {
    if (t > t1) break;
    vec2 d = rider(ro + rd * t);
    if (d.x < 0.0004 + 0.0004 * t) { id = d.y; return t; }
    t += d.x * 0.9;
  }
  return -1.0;
}
vec3 riderNormal(vec3 p) {
  const vec2 e = vec2(0.0012, -0.0012);
  return normalize(e.xyy * rider(p + e.xyy).x + e.yyx * rider(p + e.yyx).x + e.yxy * rider(p + e.yxy).x + e.xxx * rider(p + e.xxx).x);
}
// 人と自転車の、やわらかい影（太陽へ向かう光線が、どれだけ近くを通るか）
float riderShadow(vec3 p) {
  vec4 bs = riderBound(); vec3 oc = p - bs.xyz; float b = dot(oc, SUN), h = b * b - dot(oc, oc) + bs.w * bs.w;
  if (h < 0.0 || -b + sqrt(h) < 0.0) return 1.0;
  float t = max(-b - sqrt(h), 0.02), res = 1.0;
  for (int i = 0; i < 40; i++) { float d = rider(p + SUN * t).x; res = min(res, 9.0 * d / t); if (res < 0.02) return 0.0; t += clamp(d, 0.01, 0.2); if (t > -b + sqrt(h)) break; }
  return clamp(res, 0.0, 1.0);
}

// ---- 空と雲 ----
vec3 skyCol(vec3 rd) {
  float y = max(rd.y, 0.0), mu = max(dot(rd, SUN), 0.0);
  vec3 c = mix(vec3(1.0, 0.5, 0.28) * 0.9, vec3(0.1, 0.12, 0.34), pow(y, 0.4));
  c = mix(c, vec3(1.0, 0.34, 0.16), exp(-y * 14.0) * 0.45);
  c += vec3(1.0, 0.5, 0.22) * pow(mu, 6.0) * 0.7 + vec3(1.0, 0.72, 0.4) * (pow(mu, 40.0) * 0.6 + pow(mu, 400.0) * 1.5);
  c += vec3(1.0, 0.86, 0.62) * smoothstep(0.99982, 0.99992, mu) * 40.0;   // 太陽の円（見かけの半径 約 0.8 度）
  if (rd.y < 0.0) c = mix(c, vec3(0.45, 0.24, 0.16), smoothstep(0.0, -0.08, rd.y));
  return c;
}
// 雲: 2D の楕円をなめらかにつなぎ、楕円を半球と見たときの向き（法線）で光の当たり方を決める
vec4 blob(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; float w = 1.0 - dot(q, q); return vec4(q, sqrt(max(w, 0.0)), w); }
vec4 smax4(vec4 a, vec4 b) { float k = clamp(0.5 + 0.5 * (b.w - a.w) / 0.35, 0.0, 1.0); vec4 m = mix(a, b, k); m.w += 0.35 * k * (1.0 - k) * 0.5; return m; }
vec3 clouds(vec3 rd, vec3 col, bool solid) {
  if (rd.y < -0.01) return col;
  vec2 sp = vec2(atan(rd.x, rd.z), rd.y), sun = vec2(atan(SUN.x, SUN.z), SUN.y);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 cc = vec2(-1.2 + 0.42 * fi + 0.2 * h21(ivec2(i, 1)) + 0.012 * sin(2.0 * PI * TT / ${f(P.T)} + fi), 0.06 + 0.16 * h21(ivec2(i, 2)));
    float sc = 0.06 + 0.04 * h21(ivec2(i, 3));
    vec2 p = (sp - cc) / sc;
    if (abs(p.x) > 2.4 || abs(p.y) > 1.2) continue;
    p += 0.18 * (vec2(vnz(p * 3.1 + fi * 7.0, 64), vnz(p * 3.1 + fi * 3.0 + 9.0, 64)) - 0.5);   // 縁をふわふわにする
    vec4 z = vec4(0.0, 0.0, 0.0, -9.0);
    for (int j = 0; j < 6; j++) {
      vec2 o = vec2((h21(ivec2(i, 10 + j)) - 0.5) * 2.6, h21(ivec2(i, 20 + j)) * 0.35 - 0.05), r = vec2(0.45 + 0.35 * h21(ivec2(i, 30 + j)), 0.22 + 0.16 * h21(ivec2(i, 40 + j)));
      z = smax4(z, blob(p, o, r));
    }
    z.w = min(z.w, 3.0 * (p.y + 0.32));   // 雲の底を平らにする
    float a = smoothstep(0.0, 0.18, z.w) * 0.95;
    if (a <= 0.0) continue;
    vec3 n = normalize(vec3(z.x, z.y, z.z + 0.25));
    vec2 ls = sun - cc; vec3 L = normalize(vec3(ls / max(length(ls), 1e-3) * 0.85, 0.5));
    float lit = solid ? clamp(dot(n, L), 0.0, 1.0) : 0.55;
    float near = exp(-3.5 * length(sp - sun));
    vec3 cl = mix(vec3(0.3, 0.17, 0.3), vec3(1.1, 0.52, 0.28), lit) * (0.8 + 1.6 * near);
    if (solid) cl += vec3(1.0, 0.78, 0.5) * pow(1.0 - n.z, 2.0) * near * 3.0;   // 太陽の近くでは縁が光る
    col = mix(col, cl, a);
  }
  return col;
}

// ---- 1 本の光線の色（明るさは実際の光の量の比のまま。あとで縮める）----
vec3 shade(vec3 ro, vec3 rd) {
  float tmax = 260.0, tg = marchGround(ro, rd, tmax); if (tg > 0.0) tmax = tg;
  vec3 tn; float tk, tt = traceTrees(ro, rd, tmax, tn, tk); if (tt > 0.0) tmax = tt;
  float rid, tr = marchRider(ro, rd, tmax, rid);
  vec3 col; float dist = tmax;
  if (tr > 0.0) {
    dist = tr; vec3 p = ro + rd * tr, n = riderNormal(p);
    vec3 alb = rid < 1.5 ? vec3(0.62, 0.42, 0.32) : rid < 2.5 ? vec3(0.06, 0.3, 0.38) : rid < 3.5 ? vec3(0.04, 0.04, 0.05) : rid < 4.5 ? vec3(0.55, 0.06, 0.05)
             : rid < 5.5 ? vec3(0.03) : rid < 6.5 ? vec3(0.85, 0.84, 0.8) : rid < 7.5 ? vec3(0.1, 0.1, 0.12) : rid < 8.5 ? vec3(0.45, 0.46, 0.48) : vec3(0.02);
    float sh = riderShadow(p + n * 0.01), dif = max(dot(n, SUN), 0.0);
    col = alb * (SUNC * dif * sh + SKYC * (0.5 + 0.5 * n.y) + BOUNCE * (0.5 - 0.5 * n.y));
    float spec = (rid > 3.5 && rid < 4.5) || (rid > 7.5 && rid < 8.5) || (rid > 5.5 && rid < 6.5) ? 0.7 : 0.06;
    col += SUNC * spec * pow(max(dot(n, normalize(SUN - rd)), 0.0), 48.0) * sh;
    col += SUNC * alb * 1.5 * pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * pow(max(dot(rd, SUN), 0.0), 2.0);   // 逆光の縁の光
  } else if (tt > 0.0) {
    vec3 p = ro + rd * tt;
    float leaf = tk < 1.5 ? 1.0 : 0.0, nz = vnz(vec2(p.x * 1.7 + p.y * 2.3, p.z * 170.0 / D), 170);   // z の格子の数を D の中の数にして繰り返させる
    vec3 alb = leaf > 0.5 ? mix(vec3(0.07, 0.11, 0.03), vec3(0.16, 0.18, 0.05), nz) : vec3(0.12, 0.08, 0.05);
    float sh = treeShadow(p + tn * 0.05), dif = max(dot(tn, SUN) * 0.7 + 0.3, 0.0);
    col = alb * (SUNC * dif * sh * (0.6 + 0.6 * nz) + SKYC * (0.6 + 0.4 * tn.y));
    col += leaf * SUNC * vec3(0.5, 0.35, 0.1) * 0.25 * pow(max(dot(rd, SUN), 0.0), 4.0) * pow(1.0 - abs(dot(tn, rd)), 2.0);   // 逆光で葉の縁が透ける
  } else if (tg > 0.0) {
    vec3 p = ro + rd * tg; float e = 0.04 + 0.002 * tg;
    vec3 n = normalize(vec3(ground(p.xz - vec2(e, 0.0)) - ground(p.xz + vec2(e, 0.0)), 2.0 * e, ground(p.xz - vec2(0.0, e)) - ground(p.xz + vec2(0.0, e))));
    float dx = p.x - roadX(p.z), adx = abs(dx), nz = vnz(vec2(p.x * 0.7, p.z * 70.0 / D), 70);
    vec3 alb = mix(vec3(0.2, 0.24, 0.07), vec3(0.4, 0.31, 0.13), smoothstep(0.35, 0.75, nz));
    alb = mix(alb, vec3(0.24, 0.2, 0.15), 1.0 - smoothstep(RW + 0.5, RW + 1.1, adx));
    float road = 1.0 - smoothstep(RW - 0.02, RW + 0.02, adx), gloss = 0.0;
    if (road > 0.0) {
      vec3 asph = vec3(0.075, 0.07, 0.065) * (0.85 + 0.3 * vnz(vec2(p.x * 9.0, p.z * 900.0 / D), 900));
      float line = (adx < 0.06 && fract(p.z / 5.0) < 0.5) || (adx > RW - 0.16 && adx < RW - 0.06) ? 1.0 : 0.0;
      alb = mix(alb, mix(asph, vec3(0.75, 0.72, 0.62), line), road); gloss = road * (1.0 - line);
    }
    float sh = tg < 120.0 ? min(treeShadow(p + n * 0.05), riderShadow(p + n * 0.02)) : 1.0;
    col = alb * (SUNC * max(dot(n, SUN), 0.0) * sh + SKYC * (0.5 + 0.5 * n.y));
    col += gloss * SUNC * 0.35 * pow(max(dot(reflect(rd, n), SUN), 0.0), 24.0) * sh;   // 低い太陽の照り返し
  } else {
    col = skyCol(rd);
    col = clouds(rd, col, (FL & 4) != 0);
    dist = 1e4;
  }
  // 遠くほど空の色に近づける（空気の層）
  if (dist < 1e4) col = mix(col, skyCol(normalize(vec3(rd.x, max(rd.y, 0.02), rd.z))) * 0.7, 1.0 - exp(-dist * 0.0045));
  col += SUNC * 0.012 * pow(max(dot(rd, SUN), 0.0), 8.0);   // レンズの中で散る光
  return col;
}
vec3 aces(vec3 x) { return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  bool blur = (FL & 2) != 0, tone = (FL & 8) != 0;
  int N = blur ? 4 : 1;
  vec2 offs[4] = vec2[4](vec2(-0.125, -0.375), vec2(0.375, -0.125), vec2(0.125, 0.375), vec2(-0.375, 0.125));   // 回転格子の 4 点
  vec3 acc = vec3(0.0);
  vec2 uv0 = gl_FragCoord.xy / RES;
  float vig = 0.72 + 0.28 * pow(16.0 * uv0.x * uv0.y * (1.0 - uv0.x) * (1.0 - uv0.y), 0.3);
  for (int s = 0; s < 4; s++) {
    if (s >= N) break;
    gS = blur ? (float(s) + 0.5) / 4.0 : 0.0;   // 4 点を、シャッターが開いている間の別々の時刻にする（動きのぶれ）
    for (int k = 0; k < 4; k++) gB[k] = mix(B0[k], B1[k], gS);
    gB[1] = normalize(gB[1]); gB[2] = normalize(gB[2]); gB[3] = normalize(gB[3]);
    gW = mix(WA.x, WA.y, gS);
    vec3 cp = mix(C0[0], C1[0], gS), cf = normalize(mix(C0[1], C1[1], gS)), cr = normalize(mix(C0[2], C1[2], gS)), cu = normalize(mix(C0[3], C1[3], gS));
    vec2 uv = (gl_FragCoord.xy + (blur ? offs[s] : vec2(0.0)) - 0.5 * RES) / RES.y;
    vec3 col = shade(cp, normalize(cf * 1.55 + cr * uv.x + cu * uv.y)) * vig;
    acc += tone ? aces(col * 0.9) : clamp(col * 0.9, 0.0, 1.0);   // 標本ごとに縮めてから平均する
  }
  vec3 c = toSrgb(acc / float(N));
  if (tone) c = c * vec3(1.02, 1.0, 0.96) + vec3(0.012, 0.004, 0.02);   // 仕上げ: 少し暖かく、暗い所に紫を足す
  c += (float(pcg(uint(gl_FragCoord.x) + pcg(uint(gl_FragCoord.y) + pcg(uint(TT * 60.0))))) / 4294967295.0 - 0.5) / 255.0;   // 縞が出ないように散らす
  O = vec4(c, 1.0);
}`;
    let pg = null;
    try {
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      pg = gl.createProgram();
      gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
      gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg);
      if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pg));
      gl.useProgram(pg);
    } catch (err) { dlog('ride.error', { why: 'shader', msg: String(err.message).slice(0, 300) }, 'ng'); throw err; }
    const U = (n) => gl.getUniformLocation(pg, n);
    const u = { RES: U('RES'), TT: U('TT'), FL: U('FL'), J0: U('J0'), J1: U('J1'), B0: U('B0'), B1: U('B1'), C0: U('C0'), C1: U('C1'), WA: U('WA') };
    const st = { t: window.THUMB ? 2.4 : 0, paused: !window.THUMB && matchMedia('(prefers-reduced-motion: reduce)').matches, lean: true, blur: true, cloud: true, tone: true, q: 1 };
    const SHUT = 0.8 / 60;   // シャッターが開いている時間（1 コマの 8 割）
    const flat = (r) => NAMES.flatMap((n) => r.J[n]);
    function upload() {
      const opt = { lean: st.lean }, a = RD.rig(st.t, opt), b = RD.rig(st.t + SHUT, opt);
      gl.uniform3fv(u.J0, flat(a)); gl.uniform3fv(u.J1, flat(b));
      gl.uniform3fv(u.B0, [...a.o, ...a.F, ...a.R, ...a.U]); gl.uniform3fv(u.B1, [...b.o, ...b.F, ...b.R, ...b.U]);
      gl.uniform3fv(u.C0, [...a.cam.p, ...a.cam.F, ...a.cam.R, ...a.cam.U]); gl.uniform3fv(u.C1, [...b.cam.p, ...b.cam.F, ...b.cam.R, ...b.cam.U]);
      gl.uniform2f(u.WA, a.wheel % (2 * Math.PI), a.wheel % (2 * Math.PI) + (b.wheel - a.wheel));
      gl.uniform1f(u.TT, st.t);
      gl.uniform1i(u.FL, (st.blur ? 2 : 0) | (st.cloud ? 4 : 0) | (st.tone ? 8 : 0));
    }
    // 切り替えのボタン
    const pause = document.getElementById('pause'), loopBar = document.getElementById('loop');
    const setPause = (v) => { st.paused = v; pause.textContent = v ? '動かす' : '止める'; dirty = true; };
    pause.addEventListener('click', () => { setPause(!st.paused); dlog('ride.pause', { paused: st.paused, t: +st.t.toFixed(2) }, 'ok'); });
    for (const b of document.querySelectorAll('.tg')) b.addEventListener('click', () => {
      const k = b.dataset.k; st[k] = !st[k]; b.setAttribute('aria-pressed', String(st[k])); dirty = true;
      dlog('ride.toggle', { key: k, on: st[k], t: +st.t.toFixed(2) }, 'ok');
    });
    let dirty = true; setPause(st.paused);
    // シェーダーの大きさ（gzip で縮めた大きさも数える）
    const info = document.getElementById('info'), raw = new TextEncoder().encode(fs).length;
    info.textContent = `このシェーダー ${raw.toLocaleString()} バイト`;
    if (window.CompressionStream) new Response(new Blob([fs]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then((buf) => {
      info.textContent = `このシェーダー ${raw.toLocaleString()} バイト（gzip ${buf.byteLength.toLocaleString()}）／元の映像 41,886 バイト（gzip 17,087）`;
      dlog('ride.size', { raw, gzip: buf.byteLength }, 'ok');
    }).catch((err) => dlog('ride.size', { raw, err: String(err) }, 'ng'));
    // 速さ: 1 コマの間隔が長すぎるときは、描く解像度を下げる
    const gaps = []; let last = null, frames = 0, perfLogged = false;
    const t0 = performance.now();
    window.__ride = { st, perf: () => { const a = [...gaps].sort((x, y) => x - y); return { n: a.length, mean: a.reduce((x, y) => x + y, 0) / (a.length || 1), p95: a[Math.floor(a.length * 0.95)] || 0, w: c.width, h: c.height, q: st.q }; } };
    function frame(now) {
      const dt = last == null ? 0 : Math.min(0.1, (now - last) / 1000); last = now;
      if (!window.THUMB && !st.paused) { st.t = (st.t + dt) % P.T; dirty = true; }
      const base = window.THUMB ? 0.45 : Math.min(1, 540 / Math.max(1, innerHeight));
      const w = Math.max(1, Math.round(innerWidth * base * st.q)), h = Math.max(1, Math.round(innerHeight * base * st.q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); dirty = true; }
      if (dirty) {
        upload(); gl.uniform2f(u.RES, w, h); gl.drawArrays(gl.TRIANGLES, 0, 3); dirty = false;
        loopBar.value = st.t / P.T;
        if (dt > 0 && !st.paused) { gaps.push(dt * 1000); if (gaps.length > 240) gaps.shift(); }
        frames++;
        if (frames === 30) dlog('ride.ready', { ms: Math.round(performance.now() - t0), w, h, names: NJ }, 'ok');
        if (!perfLogged && gaps.length >= 120) {
          perfLogged = true; const pf = window.__ride.perf();
          dlog('ride.perf', { mean: +pf.mean.toFixed(1), p95: +pf.p95.toFixed(1), w, h }, 'ok');
          if (pf.mean > 26 && st.q > 0.5) { st.q *= 0.75; dlog('ride.scale', { q: st.q }, 'ok'); gaps.length = 0; perfLogged = false; }
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  },
});
