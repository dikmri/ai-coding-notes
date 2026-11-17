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
  float s = psi(g), e = .01;
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
    float dist = length(d * vec2(1., 1.3)) - r.z * (1. + (noise(vec2(atan(d.y, d.x) * 2., float(i))) - .5) * .25);
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
  float plume = (fbm(sp * 1.6 + vec2(0., -T * .02)) * .75 + fbm(sp * 5. - T * .03) * .3) * smoothstep(1., .1, abs(sp.x)) * smoothstep(-.02, .08, py) + smoothstep(.6, .0, abs(sp.x)) * .25 * smoothstep(-.02, .1, py);
  float dens = smoothstep(.3, .6, plume);
  vec3 smoke = mix(vec3(.012, .011, .013), vec3(.05, .045, .05), plume) + vec3(1., .28, .05) * exp(-py * 4.) * plume * plume * 1.2;
  col = mix(col, smoke, dens);
  // 火山弾: 大きな放物線をゆっくり描き、光の尾を引く
  for (int i = 0; i < 24; i++) {
    float fi = float(i), h1 = hash(vec2(fi, 4.)), h2 = hash(vec2(fi, 9.));
    float life = fract(T * (.07 + h1 * .05) + h2), t = life * 6.;
    vec2 v0 = vec2((h1 - .5) * .22, .32 + h2 * .18);
    vec2 bp = vec2(.02, -.2) + v0 * t + vec2(0., -.5 * .028 * t * t);
    vec2 vel = v0 + vec2(0., -.028 * t), pa = p - bp, v = vel * .06;
    float k = clamp(dot(pa, v) / dot(v, v), 0., 1.), d = length(pa - v * k) * R.y;
    float cool = 1. - life;
    col += heat(cool) * exp(-d * d * .25) * cool * step(-.25, bp.y) * 1.5;
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
    vec2 g = p * sc + vec2(T * .3 + sin(T * .5 + fk) * .4, T * (1.6 / z + .6));
    vec2 id = floor(g), f = fract(g) - .5;
    float h = hash(id + fk * 17.);
    if (h < .8 + fk * .015) continue;
    vec2 o = (vec2(hash(id + 3.), hash(id + 7.)) - .5) * .5 + vec2(sin(T * 1.3 + h * 20.) * .12, 0.);   // ひらひら横に揺れる
    float rad = (.1 + focus * .16) * (.7 + .5 * hash(id + 5.));
    float d = length(f - o);
    float disc = smoothstep(rad, rad * (focus < .4 ? .55 : .15), d);
    vec2 wp = (id + .5 + o) / sc - vec2(T * .3, 0.) / sc;      // その雪の画面の上の位置（光の円すいを調べる）
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
      const d = Math.sign(x) * Math.pow(Math.abs(x), 3) * 0.35;           // 皆既の近くはゆっくり進む
      const seen = Math.min(1, Math.max(0, (Math.abs(d) - 0.0035) / 0.05));   // 太陽の見えている割合のめやす
      const target = seen > 0 ? 0.02 + 0.03 * (1 - seen) : 1.6;
      exp += (target - exp) * 0.04;
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
    float city = pow(noise3(m * 22.), 5.) * 4. * (.25 + coast * 2.5) + pow(noise3(m * 70.), 7.) * 3.;
    col += vec3(1., .68, .32) * city * landm * (1. - day) * (1. - cl * .85) * .8;
    float bolt = step(.997, hash(floor(m.xz * 8.) + floor(T * 3.))) * cl * (1. - day);
    col += vec3(.7, .8, 1.) * bolt * 2.;
    // 縁に近いほど大気が重なり、青く白くかすむ
    float rim = pow(1. - max(dot(n, -rd), 0.), 4.);
    col = mix(col, vec3(.35, .6, 1.) * smoothstep(-.2, .2, sd) * 1.2, rim * .8);
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
  vec3 sp = sun - rd * dot(sun, rd);
  col += vec3(1., .85, .6) * vis * exp(-abs(dot(rd - sun, u)) * 400.) * pow(s, 4.) * .6;   // 横の光の筋
  O = vec4(film(col), 1.);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
    gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg); gl.useProgram(pg);
    const uR = gl.getUniformLocation(pg, 'R'), uT = gl.getUniformLocation(pg, 'T'), uS = gl.getUniformLocation(pg, 'S');
    const q = window.THUMB ? 0.35 : 0.6;
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
  float t = .3, hitT = -1.; int kind = 0;
  for (int i = 0; i < 90; i++) {
    vec3 q = ro + rd * t;
    float hm = mount(q.xz), hc = cloudTop(q.xz);
    if (q.y < hm) { kind = 1; hitT = t; break; }
    if (q.y < hc) { kind = 2; hitT = t; break; }
    t += max(.02, min(q.y - hm, q.y - hc) * .5) + t * .004;
    if (t > 45.) break;
  }
  if (kind > 0) {
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
    const q = window.THUMB ? 0.3 : 0.5;
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
          + (fbm(vec2(y * 2.2 - T * .22, k)) - .5) * .5 * tur * tur
          + (noise(vec2(y * 8. - T * .8, k + 5.)) - .5) * .1 * tur;
  float w = .003 + .022 * tur * (1. + y);               // 膜の幅（上へ行くほど少し広がる）
  float tw = y * (5. + 7. * tur) + fbm(vec2(y * 4., k + T * .1)) * 14. + T * .6;   // 膜のねじれ（周期を乱す）
  float pw = w * abs(cos(tw)) + .002 + w * .08;         // 見かけの幅
  float d = (p.x - x) / pw;
  return exp(-d * d) * min(4., w / pw) * smoothstep(1.1, .3, y) * (1. - tur * .35);
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
  vec2 q = (p - m) * R.y * vec2(z / 40., z / 900.);
  float wob = noise(vec2(p.y * 140., w.x * 3.)) * .7 + .3;
  r += c * pw * .35 * exp(-q.x * q.x * .5 - q.y * q.y * .08) * wob * step(p.y, m.y + .002);
  return r;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * R) / R.y;
  float hz = proj(vec3(0., 0., 1e4)).y;
  vec3 col = vec3(.006, .007, .011) + vec3(.02, .016, .014) * smoothstep(-.1, .2, p.y - hz) * 0.;
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
    float z = 12. + float(i) * 22.;
    col += light(p, vec3(-1.8, 5.5, z), vec3(1., .55, .2), 2.2);
    col += light(p, vec3(7., 5.5, z + 11.), vec3(1., .55, .2), 1.8);
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
  col += vec3(.2, .9, .4) * smoothstep(.03, .02, length(p + hs * .6)) * near * .12 + vec3(.7, .3, 1.) * smoothstep(.05, .04, length(p + hs * 1.1)) * near * .08;
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
});
