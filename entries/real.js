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
});
