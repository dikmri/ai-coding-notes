// 起動の演出（FUTURE OS // ARCADIA-91）。Gemini 4 Carbon の設計書の絵コンテ（約13秒、7場面）を canvas 2D で描く。
//   1 光の線が走って画面が開き、点検の文字が打たれる / 2 市松の床が奥へ伸び、ワイヤーフレームの柱がせり上がる /
//   3 縞の夕陽が昇り、空が網点の夕焼けに染まる / 4 円錐・トーラス・地球儀が泳ぐ / 5 正二十面体の水晶が現れ、光が虹色に分かれる /
//   6 虹色の立体の題字が1文字ずつ弾んで着地する / 7 進み具合の表示が満ち、光の輪に包まれてデスクトップへ移る
// 3D の図形は core/boot-math.mjs の投影で描く。空は低い解像度で網点の色に塗ってから拡大する（256色の時代のざらつき）。
// 音は sound.mjs の bootScore() が、始まりの時刻に合わせて全部を予約する。
// Esc・Enter・スペース・画面を押すと飛ばせる。動きを減らす設定のときは、止まった題字の絵を短く見せるだけにする。
import * as sound from './sound.mjs';
import * as M from './core/boot-math.mjs';
import * as fs from './fs.mjs';

const C = { ink: '#241734', void: '#140c24', paper: '#fffdf9', marble: '#f4eef8', aqua: '#6bf2e3', lav: '#cfaeff', pink: '#ff8ec7', apricot: '#ffd37a', plum: '#2d1b46' };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const SKY_DARK = ['#140c24', '#1b1238', '#2a1a4a'].map(rgb);
const SKY_SUN = ['#2d1b46', '#6b4aa8', '#cfaeff', '#ff8ec7', '#ffd37a'].map(rgb);
const LETTER_COLORS = ['#ff6b6b', '#ffd37a', '#6b8bff', '#6bdc7a', '#b48cff', '#ffa94d', '#6bf2e3', '#ff8ec7'];
const MONO = '"BIZ UDGothic", "MS Gothic", "Osaka-Mono", ui-monospace, monospace';
const UI = '"Hiragino Kaku Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif';
const BLOCK = (s) => `900 ${s}px "Arial Black", "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif`;
const END = 13000;
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// 3D の図形（頂点と面）
function coneMesh(n = 18, h = 1.6, r = 0.6) {
  const v = [[0, h / 2, 0]], f = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; v.push([Math.cos(a) * r, -h / 2, Math.sin(a) * r]); }
  v.push([0, -h / 2, 0]);
  for (let i = 0; i < n; i++) { const a = 1 + i, b = 1 + ((i + 1) % n); f.push([0, b, a]); f.push([n + 1, a, b]); }
  return { v, f };
}
function torusMesh(n = 20, m = 10, R = 0.75, r = 0.28) {
  const v = [], f = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const u = (i / n) * Math.PI * 2, w = (j / m) * Math.PI * 2;
    v.push([(R + r * Math.cos(w)) * Math.cos(u), r * Math.sin(w), (R + r * Math.cos(w)) * Math.sin(u)]);
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * m + j, b = ((i + 1) % n) * m + j, c = ((i + 1) % n) * m + ((j + 1) % m), d = i * m + ((j + 1) % m);
    f.push([a, b, c, d]);
  }
  return { v, f };
}
const CONE = coneMesh(), TORUS = torusMesh(), ICO = M.icosahedron();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((c) => c / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LIGHT = norm([-0.5, 0.75, -0.6]);

export function runBoot(canvas, info) {
  const x = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  canvas.hidden = false; canvas.classList.remove('fading');
  let W = 1, H = 1, HY = 1, F = 1, vignette = null, scan = null, letters = null;
  const sky = document.createElement('canvas'), sx = sky.getContext('2d');
  let skyKey = '';
  const fit = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    HY = H * 0.6; F = H * 0.95; skyKey = ''; letters = null;
    vignette = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vignette.addColorStop(0, 'rgba(20,12,36,0)'); vignette.addColorStop(1, 'rgba(20,12,36,0.5)');
    const sc = document.createElement('canvas'); sc.width = 1; sc.height = 3;
    const g = sc.getContext('2d'); g.fillStyle = 'rgba(20,12,36,0.09)'; g.fillRect(0, 2, 1, 1);
    scan = x.createPattern(sc, 'repeat');
  };
  fit();
  addEventListener('resize', fit);
  const ditherPat = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const g = c.getContext('2d');
    for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { const v = M.BAYER4[yy][xx]; if (v < 4) { g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(xx, yy, 1, 1); } else if (v > 11) { g.fillStyle = 'rgba(36,23,52,.22)'; g.fillRect(xx, yy, 1, 1); } }
    return c;
  })();

  // ---- 空（低い解像度で網点の色に塗り、拡大して描く）----
  function drawSky(sunset) {
    const q = Math.round(sunset * 48), key = `${W}x${H}:${q}`;
    if (key !== skyKey) {
      skyKey = key;
      const sw = Math.ceil(W / 3), sh = Math.ceil(HY / 3) + 1;
      sky.width = sw; sky.height = sh;
      const img = sx.createImageData(sw, sh), d = img.data, rev = q / 48;
      for (let yy = 0; yy < sh; yy++) {
        const v = yy / (sh - 1), up = 1 - v;
        for (let xx = 0; xx < sw; xx++) {
          const sunSide = up < rev * 1.08 - (M.BAYER4[yy & 3][xx & 3] / 16) * 0.08;
          const pal = sunSide ? SKY_SUN : SKY_DARK;
          const c = pal[M.ditherLevel(v, xx, yy, pal.length)], o = (yy * sw + xx) * 4;
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
      }
      sx.putImageData(img, 0, 0);
    }
    x.imageSmoothingEnabled = false;
    x.drawImage(sky, 0, 0, sky.width * 3, sky.height * 3);
    x.imageSmoothingEnabled = true;
  }
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = Array.from({ length: 160 }, () => [rnd(), rnd() * 0.9, rnd() < 0.1 ? 2 : 1, rnd() * 6]);
  function drawStars(ms, sunset) {
    for (const [sxp, syp, s, ph] of stars) {
      const yy = syp * HY;
      if ((1 - syp) < sunset * 1.08) continue;
      x.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(ms * 0.0015 + ph));
      x.fillStyle = '#fff'; x.fillRect(sxp * W, yy, s, s);
    }
    x.globalAlpha = 1;
  }

  // ---- 夕陽 ----
  function drawSun(ms) {
    const rise = M.easeOutCubic(M.ramp(ms, 2800, 4400));
    if (rise <= 0) return;
    const R = Math.min(W, H) * 0.21, cy = HY + R * 0.95 - rise * R * 1.3;
    const glow = x.createRadialGradient(W / 2, cy, R * 0.6, W / 2, cy, R * 2.2);
    glow.addColorStop(0, 'rgba(255,211,122,0.45)'); glow.addColorStop(1, 'rgba(255,142,199,0)');
    x.save(); x.beginPath(); x.rect(0, 0, W, HY); x.clip();
    x.fillStyle = glow; x.fillRect(0, 0, W, HY);
    x.beginPath(); x.arc(W / 2, cy, R, 0, Math.PI * 2); x.clip();
    const g = x.createLinearGradient(0, cy - R, 0, cy + R); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.35, C.apricot); g.addColorStop(1, C.pink);
    x.fillStyle = g; x.fillRect(W / 2 - R, cy - R, R * 2, R * 2);
    x.fillStyle = 'rgba(207,174,255,0.9)';
    const drift = (ms * 0.012) % (R * 0.16);
    for (let i = 0; i < 7; i++) { const yy = cy - R * 0.3 + i * R * 0.15 + drift, hh = R * (0.02 + i * 0.012); x.fillRect(W / 2 - R, yy, R * 2, hh); }
    x.restore();
  }

  // ---- 市松の床 ----
  function drawFloor(ms, reveal, grid, scroll, warm) {
    const T = 1.4, zN = (F / (H - HY)) * 0.98, rows = 28, cols = 9, off = scroll % (T * 2);
    const horizon = mix(rgb('#2a1a4a'), rgb('#ffb3d1'), warm);
    const light = rgb('#f4eef8'), dark = rgb('#2d1b46');
    for (let j = rows - 1; j >= 0; j--) {
      const z0 = Math.max(0.05, zN + j * T - off), z1 = zN + (j + 1) * T - off;
      if (z1 <= 0.06) continue;
      const y0 = HY + F / z0, y1 = HY + F / z1, fog = M.clamp01((z0 - 5) / 34);
      const shown = M.clamp01(reveal * (rows + 6) - j);
      for (let i = -cols; i < cols; i++) {
        const xa0 = W / 2 + (i * T * F) / z0, xa1 = W / 2 + ((i + 1) * T * F) / z0;
        const xb0 = W / 2 + (i * T * F) / z1, xb1 = W / 2 + ((i + 1) * T * F) / z1;
        if (shown > Math.abs(i + 0.5) / cols) {
          const par = (((i + j) % 2) + 2) % 2;
          x.fillStyle = css(mix(par ? light : dark, horizon, fog * 0.85));
          x.beginPath(); x.moveTo(xa0, y0); x.lineTo(xa1, y0); x.lineTo(xb1, y1); x.lineTo(xb0, y1); x.closePath(); x.fill();
        }
      }
    }
    if (grid > 0) {
      x.lineWidth = 1.2; x.strokeStyle = `rgba(107,242,227,${0.75 * grid})`;
      x.beginPath();
      const len = M.easeOutCubic(grid);
      for (let i = -cols; i <= cols; i++) { const xn = W / 2 + (i * T * F) / zN; x.moveTo(xn, H); x.lineTo(xn + (W / 2 - xn) * len, H - (H - HY) * len); }
      for (let j = 0; j < rows; j++) { const z = zN + j * T - off; if (z <= 0.06) continue; const yy = HY + F / z; if (yy < H - (H - HY) * len) continue; x.moveTo(0, yy); x.lineTo(W, yy); }
      x.stroke();
    }
    const glow = x.createLinearGradient(0, HY - 4, 0, HY + 40); glow.addColorStop(0, `rgba(255,142,199,${0.55 * warm})`); glow.addColorStop(1, 'rgba(255,142,199,0)');
    x.fillStyle = glow; x.fillRect(0, HY - 4, W, 44);
  }

  // ---- 柱（ワイヤーフレームでせり上がり、大理石になる）----
  function drawColumn(ms, xw, zw, wire, warm) {
    const rise = M.easeOutCubic(M.ramp(ms, 1250, 2300)), solid = M.ramp(ms, 2000, 2800);
    if (rise <= 0) return;
    const hgt = 3.6, r = 0.42, s = F / zw, cx = W / 2 + xw * s;
    const baseY = -1 - (1 - rise) * (hgt + 0.8);
    const yBase = HY - baseY * s, yTop = HY - (baseY + hgt) * s, yFloor = HY + F / zw, rw = r * s;
    x.save(); x.beginPath(); x.rect(0, 0, W, yFloor); x.clip();
    if (solid > 0) {
      x.globalAlpha = solid;
      const g = x.createLinearGradient(cx - rw, 0, cx + rw, 0);
      g.addColorStop(0, '#8a7aa8'); g.addColorStop(0.3, '#ffffff'); g.addColorStop(0.65, '#e9e1f4'); g.addColorStop(1, '#7d6c9e');
      x.fillStyle = g; x.fillRect(cx - rw, yTop, rw * 2, yBase - yTop);
      x.fillStyle = '#f4eef8'; x.fillRect(cx - rw * 1.5, yTop - rw * 0.6, rw * 3, rw * 0.6); x.fillRect(cx - rw * 1.3, yBase - rw * 0.45, rw * 2.6, rw * 0.45);
      x.fillStyle = '#cbbce0'; x.fillRect(cx - rw * 1.5, yTop - rw * 0.12, rw * 3, rw * 0.12);
      if (warm > 0) {
        const wg = x.createLinearGradient(cx - rw, 0, cx + rw, 0), toward = xw < 0 ? 1 : 0;
        wg.addColorStop(toward, `rgba(255,211,122,${0.5 * warm})`); wg.addColorStop(1 - toward, 'rgba(255,142,199,0)');
        x.fillStyle = wg; x.fillRect(cx - rw, yTop, rw * 2, yBase - yTop);
      }
      x.globalAlpha = 1;
    }
    // ワイヤーフレーム（回る溝の線）
    const a = 1 - solid * 0.8;
    if (a > 0.02) {
      x.globalAlpha = a; x.strokeStyle = wire; x.lineWidth = 1.5;
      x.strokeRect(cx - rw, yTop, rw * 2, yBase - yTop);
      x.strokeRect(cx - rw * 1.5, yTop - rw * 0.6, rw * 3, rw * 0.6);
      x.beginPath();
      for (let k = 0; k < 8; k++) { const ang = (k / 8) * Math.PI * 2 + ms * 0.003, c = Math.cos(ang); if (Math.sin(ang) < 0) continue; x.moveTo(cx + rw * c, yTop); x.lineTo(cx + rw * c, yBase); }
      for (let k = 1; k < 6; k++) { const yy = yTop + ((yBase - yTop) * k) / 6; x.moveTo(cx - rw, yy); x.lineTo(cx + rw, yy); }
      x.stroke(); x.globalAlpha = 1;
    }
    x.restore();
  }

  // ---- 3D の図形を描く（面を奥から順に塗る）----
  function drawMesh(mesh, place, shade, alpha = 1, edge = null) {
    const cam = { cx: W / 2, cy: HY, f: F };
    const pts = mesh.v.map((p) => place(p));
    const faces = [];
    for (const fc of mesh.f) {
      const P = fc.map((i) => pts[i]);
      const n = norm(cross(sub(P[1], P[0]), sub(P[2], P[0])));
      const c = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length, s[2] + p[2] / P.length], [0, 0, 0]);
      if (dot(n, c) >= 0) continue;
      faces.push({ P, n, z: c[2] });
    }
    faces.sort((a, b) => b.z - a.z);
    x.globalAlpha = alpha;
    for (const fc of faces) {
      const S = fc.P.map((p) => M.project(p, cam));
      if (S.some((s) => !Number.isFinite(s[0]))) continue;
      x.beginPath(); S.forEach(([sx2, sy2], k) => (k ? x.lineTo(sx2, sy2) : x.moveTo(sx2, sy2))); x.closePath();
      x.fillStyle = shade(fc.n, fc); x.fill();
      if (edge) { x.strokeStyle = edge; x.lineWidth = 1; x.stroke(); }
      else { x.strokeStyle = x.fillStyle; x.lineWidth = 0.6; x.stroke(); }
    }
    x.globalAlpha = 1;
  }
  const chrome = (n) => {
    const k = M.clamp01(0.5 + 0.5 * dot(n, LIGHT)), stops = ['#2d1b46', '#6b8bff', '#cfaeff', '#ffffff', '#ff8ec7', '#ffd37a'].map(rgb);
    const s = k * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(s));
    return css(mix(stops[i], stops[i + 1], s - i));
  };
  const pastel = (base) => (n) => {
    const l = M.clamp01(dot(n, LIGHT)), spec = M.clamp01(dot(n, LIGHT)) ** 12;
    return css(mix(mix(rgb('#2d1b46'), rgb(base), 0.35 + 0.65 * l), [255, 255, 255], spec * 0.8));
  };
  function shadowAt(xw, zw, size, a) {
    if (zw <= 0.3) return;
    const s = F / zw, sx2 = W / 2 + xw * s, sy2 = HY + s;
    x.fillStyle = `rgba(45,27,70,${0.35 * a})`;
    x.beginPath(); x.ellipse(sx2, sy2, size * s, size * s * 0.22, 0, 0, Math.PI * 2); x.fill();
  }
  function drawPrimitives(ms) {
    const go = M.ramp(ms, 4600, 6800), back = M.ramp(ms, 6800, 7700);
    if (go <= 0 || back >= 1) return;
    const e = M.easeInOut(go), fade = 1 - back, t = ms / 1000;
    const path = (a, b, k) => a + (b - a) * k;
    const objs = [
      { mesh: CONE, from: [-6, 1.6, 26], to: [-2.2, 0.5, 6.2], out: -9, rot: (p) => M.rotX(M.rotY(p, t * 1.6), 0.5), shade: chrome, size: 0.7 },
      { mesh: TORUS, from: [6, 2.2, 28], to: [2.4, 1.0, 6.8], out: 9, rot: (p) => M.rotX(M.rotY(p, -t * 1.2), 1.0 + Math.sin(t) * 0.3), shade: pastel('#b48cff'), size: 0.9 },
    ];
    for (const o of objs) {
      const px = path(o.from[0], o.to[0], e) + (o.out - o.to[0]) * M.easeInOut(back), py = path(o.from[1], o.to[1], e) + Math.sin(t * 2 + o.out) * 0.15, pz = path(o.from[2], o.to[2], e);
      shadowAt(px, pz, o.size, fade);
      drawMesh(o.mesh, (p) => { const r = o.rot(p); return [r[0] + px, r[1] + py, r[2] + pz]; }, o.shade, fade);
    }
    // ワイヤーフレームの地球儀
    const gx = path(0.4, -0.1, e), gy = path(3.6, 2.4, e) + 3 * M.easeInOut(back), gz = path(32, 11, e), R = 1.3;
    const cam = { cx: W / 2, cy: HY, f: F };
    x.globalAlpha = fade; x.strokeStyle = C.aqua; x.lineWidth = 1.3;
    for (let lat = -60; lat <= 60; lat += 30) {
      x.beginPath();
      for (let k = 0; k <= 36; k++) { const u = (k / 36) * Math.PI * 2, cl = Math.cos((lat * Math.PI) / 180); const p = M.rotY([Math.cos(u) * cl * R, Math.sin((lat * Math.PI) / 180) * R, Math.sin(u) * cl * R], t * 0.8); const s2 = M.project([p[0] + gx, p[1] + gy, p[2] + gz], cam); k ? x.lineTo(s2[0], s2[1]) : x.moveTo(s2[0], s2[1]); }
      x.stroke();
    }
    for (let lon = 0; lon < 180; lon += 30) {
      x.beginPath();
      for (let k = 0; k <= 36; k++) { const v = (k / 36) * Math.PI * 2; const p = M.rotY([Math.cos(v) * R * Math.cos((lon * Math.PI) / 180), Math.sin(v) * R, Math.cos(v) * R * Math.sin((lon * Math.PI) / 180)], t * 0.8); const s2 = M.project([p[0] + gx, p[1] + gy, p[2] + gz], cam); k ? x.lineTo(s2[0], s2[1]) : x.moveTo(s2[0], s2[1]); }
      x.stroke();
    }
    x.globalAlpha = 1;
  }

  // ---- 正二十面体の水晶と、虹色に分かれる光 ----
  const crystalPos = () => { const s = F / 8; return [W / 2, HY - 2.75 * s, 0.95 * s]; };
  function drawCrystal(ms) {
    const [cx, cy, R] = crystalPos();
    // 光の輪が縮んで集まる
    const ring = M.ramp(ms, 6800, 7400);
    if (ring > 0 && ring < 1) {
      x.strokeStyle = `rgba(255,255,255,${0.9 * (1 - ring * 0.5)})`; x.lineWidth = 3 + 6 * (1 - ring);
      x.beginPath(); x.arc(cx, cy, R + (Math.max(W, H) * 0.7 - R) * (1 - M.easeOutCubic(ring)), 0, Math.PI * 2); x.stroke();
    }
    const appear = M.ramp(ms, 7200, 7800);
    if (appear <= 0) return;
    const sc = M.easeOutBack(appear) * R, t = ms / 1000;
    const halo = x.createRadialGradient(cx, cy, sc * 0.2, cx, cy, sc * 2.4);
    halo.addColorStop(0, 'rgba(255,255,255,0.55)'); halo.addColorStop(0.5, 'rgba(107,242,227,0.18)'); halo.addColorStop(1, 'rgba(255,142,199,0)');
    x.fillStyle = halo; x.beginPath(); x.arc(cx, cy, sc * 2.4, 0, Math.PI * 2); x.fill();
    const cols = ['#6bf2e3', '#ff8ec7', '#ffd37a', '#cfaeff'];
    const faces = ICO.f.map((fc, i) => {
      const P = fc.map((k) => M.rotX(M.rotY(ICO.v[k], t * 0.9), 0.35 + Math.sin(t * 0.7) * 0.15));
      const n = norm(cross(sub(P[1], P[0]), sub(P[2], P[0]))), z = (P[0][2] + P[1][2] + P[2][2]) / 3;
      return { P, n, z, col: cols[i % 4] };
    }).filter((f) => f.n[2] < 0).sort((a, b) => b.z - a.z);
    for (const f of faces) {
      const l = M.clamp01(0.45 + 0.55 * dot(f.n, LIGHT));
      x.beginPath(); f.P.forEach((p, k) => { const X = cx + p[0] * sc, Y = cy - p[1] * sc; k ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.closePath();
      x.fillStyle = css(mix(mix(rgb('#2d1b46'), rgb(f.col), 0.4 + 0.6 * l), [255, 255, 255], l ** 6 * 0.6), 0.92); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 1.4; x.stroke();
    }
  }
  function drawBeams(ms) {
    const [cx, cy, R] = crystalPos();
    const hit = M.ramp(ms, 7850, 8000);
    if (hit > 0 && ms < 8300) {
      x.strokeStyle = `rgba(255,255,255,${1 - M.ramp(ms, 8000, 8300)})`; x.lineWidth = 4;
      x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, (cy - R) * hit); x.stroke();
    }
    const spread = M.easeOutCubic(M.ramp(ms, 8000, 8450));
    if (spread <= 0) return;
    const a = (ms < 11400 ? 0.34 - 0.14 * M.ramp(ms, 8450, 9600) : 0.2 * (1 - M.ramp(ms, 11400, 12300)));
    if (a <= 0) return;
    const rainbow = ['#ff6b6b', '#ffa94d', '#ffd37a', '#6bdc7a', '#6bf2e3', '#6b8bff', '#b48cff'];
    const len = Math.hypot(W, H) * spread;
    for (const side of [-1, 1]) rainbow.forEach((col, i) => {
      const ang = -Math.PI / 2 + side * (0.42 + i * 0.075), ang2 = ang + side * 0.06;
      x.fillStyle = col; x.globalAlpha = a;
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len); x.lineTo(cx + Math.cos(ang2) * len, cy + Math.sin(ang2) * len); x.closePath(); x.fill();
    });
    x.globalAlpha = 1;
    if (ms >= 8000 && ms < 8350) { x.fillStyle = `rgba(255,255,255,${0.4 * (1 - M.ramp(ms, 8000, 8350))})`; x.fillRect(0, 0, W, H); }
  }

  // ---- 題字（1文字ずつの絵を先に作っておく）----
  function shade(hexc, k) { return css(mix(rgb(hexc), k < 0 ? [36, 23, 52] : [255, 255, 255], Math.abs(k))); }
  function buildLetters() {
    const fs = Math.round(Math.min(W * 0.115, H * 0.17)), font = BLOCK(fs), ext = Math.max(3, Math.round(fs * 0.07));
    const items = []; let total = 0, n = 0;
    x.font = font;
    for (const ch of 'FUTURE OS') {
      if (ch === ' ') { total += fs * 0.32; continue; }
      const w = Math.ceil(x.measureText(ch).width), cw = w + ext + 10, chh = Math.ceil(fs * 1.2) + ext + 10;
      const c = document.createElement('canvas'); c.width = cw; c.height = chh;
      const g = c.getContext('2d'); g.font = font; g.textBaseline = 'top';
      for (let d = ext; d >= 1; d--) { g.fillStyle = C.ink; g.fillText(ch, 5 + d, 5 + d); }
      // 文字の面（上を明るく、文字ごとに色を変え、網点を重ねる）
      const face = document.createElement('canvas'); face.width = cw; face.height = chh;
      const fg = face.getContext('2d'); fg.font = font; fg.textBaseline = 'top';
      const col = LETTER_COLORS[n % LETTER_COLORS.length], lg = fg.createLinearGradient(0, 5, 0, 5 + fs);
      lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.3, col); lg.addColorStop(1, shade(col, -0.3));
      fg.fillStyle = lg; fg.fillText(ch, 5, 5);
      fg.globalCompositeOperation = 'source-atop'; fg.fillStyle = fg.createPattern(ditherPat, 'repeat'); fg.fillRect(0, 0, cw, chh);
      g.drawImage(face, 0, 0);
      g.lineWidth = Math.max(1.5, fs * 0.022); g.strokeStyle = C.ink; g.strokeText(ch, 5, 5);
      items.push({ c, w, ox: total, n }); total += w + fs * 0.03; n++;
    }
    return { items, total, fs, ext };
  }
  const titleY = () => H * 0.53;
  function drawTitle(ms) {
    if (ms < 8900) return;
    if (!letters) letters = buildLetters();
    const { items, total, fs } = letters, x0 = W / 2 - total / 2, ty = titleY() - fs * 0.6;
    for (const it of items) {
      const p = M.ramp(ms, 8900 + it.n * 190, 8900 + it.n * 190 + 460);
      if (p <= 0) continue;
      const e = M.easeOutBack(p), s = 2.4 - 1.4 * e, dy = (1 - e) * -H * 0.22;
      const cx = x0 + it.ox + it.w / 2, cy = ty + fs * 0.6 + dy;
      x.save(); x.globalAlpha = M.clamp01(p * 3); x.translate(cx, cy); x.scale(s, s);
      x.drawImage(it.c, -it.w / 2 - 5, -fs * 0.6 - 5); x.restore();
    }
    // 着地のあとのきらめき
    const sp = M.ramp(ms, 10800, 11500);
    if (sp > 0 && sp < 1) {
      const a = Math.sin(sp * Math.PI), sz = fs * 0.35 * a;
      for (const [px, py] of [[x0 - fs * 0.05, ty + fs * 0.05], [x0 + total, ty + fs * 0.05]]) {
        x.fillStyle = `rgba(255,255,255,${a})`;
        x.beginPath(); x.moveTo(px, py - sz); x.lineTo(px + sz * 0.18, py - sz * 0.18); x.lineTo(px + sz, py); x.lineTo(px + sz * 0.18, py + sz * 0.18); x.lineTo(px, py + sz); x.lineTo(px - sz * 0.18, py + sz * 0.18); x.lineTo(px - sz, py); x.lineTo(px - sz * 0.18, py - sz * 0.18); x.closePath(); x.fill();
      }
    }
    // 副題をドット風の文字で打つ
    const subt = M.typed('// ARCADIA-91', ms, 10300, 70), sfs = Math.max(14, fs * 0.26);
    x.font = `700 ${sfs}px ${MONO}`; x.textAlign = 'center'; x.textBaseline = 'top';
    const sy = titleY() + fs * 0.72, cursor = Math.floor(ms / 260) % 2 && subt.length < 13 ? '_' : '';
    x.fillStyle = C.ink; x.fillText(subt + cursor, W / 2 + 2, sy + 2);
    x.fillStyle = C.aqua; x.fillText(subt + cursor, W / 2, sy);
    x.textAlign = 'left';
  }

  // ---- 場面1: 光の線と点検の文字 ----
  function drawPower(ms) {
    x.fillStyle = C.void; x.fillRect(0, 0, W, H);
    const wline = M.easeOutCubic(M.ramp(ms, 0, 160)), open = M.easeOutCubic(M.ramp(ms, 160, 460));
    if (open > 0) {
      const h = H * open;
      x.save(); x.beginPath(); x.rect(0, (H - h) / 2, W, h); x.clip();
      drawSky(0); drawStars(ms, 0);
      x.restore();
      x.fillStyle = '#fff'; x.fillRect(0, (H - h) / 2 - 1, W, 2); x.fillRect(0, (H + h) / 2 - 1, W, 2);
    } else {
      const w = W * wline; x.fillStyle = '#fff'; x.fillRect((W - w) / 2, H / 2 - 1, w, 2);
    }
  }
  function drawRomText(ms) {
    const a = 1 - M.ramp(ms, 1300, 2000);
    if (ms < 450 || a <= 0) return;
    const fs = Math.max(12, Math.min(18, W / 60)), lh = fs * 1.5;
    const lines = [
      'ARCADIA-91 MULTIMEDIA ROM v2.4',
      '256-COLOR PALETTE DAC ...... OK',
      'WAVE-SYNTH DSP ............. ONLINE',
      `OPTICAL DRIVE ${info.free} FREE ... OK`,
      `CPU x${info.cores}  SCREEN ${info.screen}  ${info.webgl2 ? '3D BOARD OK' : '3D BOARD --'}`,
    ];
    x.globalAlpha = a; x.font = `700 ${fs}px ${MONO}`; x.textBaseline = 'top';
    lines.forEach((ln, i) => { const s = M.typed(ln, ms, 450 + i * 120, 9); x.fillStyle = C.ink; x.fillText(s, fs * 2 + 2, fs * 2 + i * lh + 2); x.fillStyle = C.aqua; x.fillText(s, fs * 2, fs * 2 + i * lh); });
    // 右上: 256色のパレットの点検
    const cell = Math.max(5, Math.min(10, W * 0.007)), gx = W - cell * 16 - fs * 2, gy = fs * 2, lit = Math.floor(M.ramp(ms, 300, 1100) * 256);
    for (let i = 0; i < lit; i++) { const r = Math.floor(i / 16), c = i % 16; x.fillStyle = `hsl(${(c / 16) * 360} 85% ${28 + (r / 15) * 55}%)`; x.fillRect(gx + c * cell, gy + r * cell, cell - 1, cell - 1); }
    x.globalAlpha = 1;
  }

  // ---- 場面7: 進み具合の表示と光の輪 ----
  function drawProgress(ms) {
    const show = M.ramp(ms, 11400, 11600), p = M.easeInOut(M.ramp(ms, 11500, 12150));
    if (show <= 0) return;
    const bw = Math.min(440, W * 0.5), bh = 24, bx = (W - bw) / 2, by = H * 0.83;
    x.globalAlpha = show;
    x.fillStyle = C.ink; roundRect(bx + 3, by + 3, bw, bh, bh / 2); x.fill();
    x.fillStyle = '#fff6e3'; roundRect(bx, by, bw, bh, bh / 2); x.fill();
    if (p > 0) {
      x.save(); roundRect(bx, by, bw, bh, bh / 2); x.clip();
      const g = x.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, C.aqua); g.addColorStop(0.5, C.lav); g.addColorStop(1, C.pink);
      x.fillStyle = g; x.fillRect(bx, by, bw * p, bh);
      x.fillStyle = x.createPattern(ditherPat, 'repeat'); x.fillRect(bx, by, bw * p, bh);
      x.restore();
    }
    x.lineWidth = 2; x.strokeStyle = C.ink; roundRect(bx, by, bw, bh, bh / 2); x.stroke();
    const fs = Math.max(12, Math.min(15, W / 80));
    x.font = `700 ${fs}px ${MONO}`; x.textAlign = 'center'; x.textBaseline = 'bottom';
    x.fillStyle = C.ink; x.fillText(`MOUNTING ARCADIA DESKTOP... ${Math.round(p * 100)}%`, W / 2, by - 6);
    x.textAlign = 'left'; x.globalAlpha = 1;
  }
  function drawIris(ms) {
    const k = M.ramp(ms, 12200, 13000);
    if (k <= 0) return;
    const [cx, cy] = crystalPos(), r = Math.hypot(W, H) * 1.1 * M.easeInOut(k);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
    g.addColorStop(0, 'rgba(255,253,249,1)'); g.addColorStop(0.75, 'rgba(255,253,249,0.95)'); g.addColorStop(0.92, 'rgba(107,242,227,0.6)'); g.addColorStop(1, 'rgba(107,242,227,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  function roundRect(rx, ry, rw, rh, rr) { x.beginPath(); x.roundRect(rx, ry, rw, rh, rr); }
  function drawSkip(ms) {
    if (ms < 300 || ms > 12200) return;
    const fs = 12, w = 74, h = 24, bx = W - w - 22, by = H - h - 20;
    x.globalAlpha = 0.9;
    x.fillStyle = C.ink; roundRect(bx + 2, by + 2, w, h, h / 2); x.fill();
    x.fillStyle = '#fff6e3'; roundRect(bx, by, w, h, h / 2); x.fill();
    x.lineWidth = 1.5; x.strokeStyle = C.ink; x.stroke();
    x.font = `700 ${fs}px ${MONO}`; x.fillStyle = C.ink; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SKIP ▸', bx + w / 2, by + h / 2 + 1);
    x.font = `${fs}px ${UI}`; x.textAlign = 'right'; x.fillStyle = 'rgba(255,253,249,0.85)'; x.fillText('クリックか Esc で飛ばせます', bx - 10, by + h / 2 + 1);
    x.textAlign = 'left'; x.globalAlpha = 1;
  }

  // ---- 1コマ ----
  function render(ms) {
    if (ms < 1100) {
      drawPower(ms); drawRomText(ms);
    } else {
      const sunset = M.easeInOut(M.ramp(ms, 2800, 4600)), warm = sunset;
      drawSky(sunset); drawStars(ms, sunset); drawSun(ms);
      const reveal = M.ramp(ms, 1300, 2700), grid = M.ramp(ms, 1100, 1700), scroll = ms > 2800 ? (ms - 2800) * 0.0009 : 0;
      drawFloor(ms, reveal, grid * (1 - 0.6 * M.ramp(ms, 2600, 3400)), scroll, warm);
      drawColumn(ms, -3.4, 6.5, C.aqua, warm); drawColumn(ms, 3.4, 6.5, '#ff5cd6', warm);
      drawPrimitives(ms); drawBeams(ms); drawCrystal(ms); drawTitle(ms); drawProgress(ms); drawRomText(ms);
    }
    x.fillStyle = vignette; x.fillRect(0, 0, W, H);
    x.fillStyle = scan; x.fillRect(0, 0, W, H);
    drawIris(ms); drawSkip(ms);
  }

  let t0 = 0, done = false, resolveFn, score = null;
  const finish = (skipped) => {
    if (done) return;
    done = true;
    removeEventListener('keydown', onKey, true); canvas.removeEventListener('pointerdown', onTap); removeEventListener('resize', fit);
    if (score && skipped) score.stop();
    resolveFn();
    // デスクトップの上で、起動の絵を薄くして消す
    canvas.classList.add('fading');
    setTimeout(() => { canvas.hidden = true; canvas.classList.remove('fading'); }, reduce ? 150 : 480);
  };
  const onKey = (e) => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); finish(true); } };
  const onTap = () => finish(true);
  addEventListener('keydown', onKey, true);
  canvas.addEventListener('pointerdown', onTap);

  function frame(now) {
    if (done) return;
    if (!t0) t0 = now;
    const ms = now - t0;
    if (reduce) {
      render(11300);
      if (ms >= 1600) { finish(false); return; }
    } else {
      render(Math.min(ms, END));
      if (ms >= END) { finish(false); return; }
    }
    requestAnimationFrame(frame);
  }
  return new Promise((r) => {
    resolveFn = r;
    if (reduce) sound.play('startup'); else score = sound.bootScore();
    requestAnimationFrame(frame);
  });
}

// 壁紙。最初の3つは Gemini（Nano Banana 2.1）が設計書に沿って描いた画像（os/img/wall-*.jpg）。残りはその場で canvas に描く
export const WALLPAPERS = [
  ['arcadia-lagoon', 'アルカディア環礁の夕凪'], ['celestial-atrium', '天球と石膏の回廊'], ['prism-playground', 'プリズム幾何学庭園'],
  ['dusk', '夕暮れのグリッド'], ['pillars', '紫の空と柱'], ['stars', '星の海'],
];
export const DEFAULT_WALLPAPER = 'arcadia-lagoon';
const IMAGE_WALLS = new Set(['arcadia-lagoon', 'celestial-atrium', 'prism-playground']);
const wallImages = new Map();
function wallImage(kind) {
  if (!wallImages.has(kind)) {
    const im = new Image(); im.decoding = 'async';
    // 仮想ドライブの画像（'file:/画像/x.png'）は、中身を読んでから src に入れる。読めなければ標準の壁紙に戻す
    // 読み込みが終わったら URL を解放する（描き直して何度も壁紙にしたときに、メモリを使い続けないように）
    if (kind.startsWith('file:')) fs.readBlob(kind.slice(5)).then((b) => { im.addEventListener('load', () => URL.revokeObjectURL(im.src), { once: true }); im.src = URL.createObjectURL(b); }).catch(() => { im.dataset.failed = '1'; im.dispatchEvent(new Event('load')); });
    else im.src = `img/wall-${kind}.jpg`;
    wallImages.set(kind, im);
  }
  return wallImages.get(kind);
}
// 壁紙の名前の読み替え（設定の一覧に出す名前）
export const wallLabel = (kind) => (kind.startsWith('file:') ? '画像: ' + kind.slice(kind.lastIndexOf('/') + 1) : (WALLPAPERS.find(([k]) => k === kind) || [, ''])[1]);
export function forgetWall(kind) { wallImages.delete(kind); }
export function drawWallpaper(canvas, kind) {
  // 前の版の Windows 風の壁紙（青緑、市松）や知らない名前は、標準の壁紙にする
  const isFile = typeof kind === 'string' && kind.startsWith('file:');
  if (!isFile && !WALLPAPERS.some(([k]) => k === kind)) kind = DEFAULT_WALLPAPER;
  canvas.dataset.wall = kind;
  const W = Math.max(1, canvas.clientWidth), H = Math.max(1, canvas.clientHeight), dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  const x = canvas.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (IMAGE_WALLS.has(kind) || isFile) {
    const im = wallImage(kind);
    if (im.dataset.failed) { forgetWall(kind); return drawWallpaper(canvas, DEFAULT_WALLPAPER); }
    if (!im.complete || !im.naturalWidth) {
      // 読み込みの間は夕焼けの色で埋め、読み込めたら描き直す（その間に別の壁紙に変わっていたら描かない）
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#cfaeff'); g.addColorStop(0.6, '#ff8ec7'); g.addColorStop(1, '#6bf2e3');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      im.addEventListener('load', () => { if (canvas.dataset.wall === kind) drawWallpaper(canvas, kind); }, { once: true });
      return;
    }
    // 画面いっぱいに切り抜いて描く（縦横の比を保つ）
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
    x.imageSmoothingQuality = 'high';
    // 小さいドット絵（お絵かきの 32×32 など）は、ぼかさずに大きくする
    if (isFile && im.naturalWidth * 3 < W) x.imageSmoothingEnabled = false;
    x.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
    return;
  }
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (kind === 'teal') { x.fillStyle = '#008080'; x.fillRect(0, 0, W, H); return; }
  if (kind === 'checker') { for (let yy = 0; yy < H; yy += 32) for (let xx = 0; xx < W; xx += 32) { x.fillStyle = ((xx + yy) / 32) % 2 ? '#2b0f5a' : '#00a0a0'; x.fillRect(xx, yy, 32, 32); } return; }
  const hy = kind === 'stars' ? H : H * 0.64;
  const sky = x.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#05030f'); sky.addColorStop(0.55, kind === 'stars' ? '#0d0a2e' : '#2b0f5a'); sky.addColorStop(1, kind === 'stars' ? '#1b1146' : '#ff4fb8');
  x.fillStyle = sky; x.fillRect(0, 0, W, hy);
  for (let i = 0; i < (kind === 'stars' ? 600 : 160); i++) { x.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; const s = rnd() < 0.06 ? 2 : 1; x.fillRect(rnd() * W, rnd() * hy * 0.92, s, s); }
  if (kind === 'stars') { const g = x.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, H * 0.5); g.addColorStop(0, '#ff4fd833'); g.addColorStop(1, 'transparent'); x.fillStyle = g; x.fillRect(0, 0, W, H); return; }
  const R = Math.min(W, H) * 0.17, scy = hy - R * 0.45;
  x.save(); x.beginPath(); x.arc(W / 2, scy, R, 0, Math.PI * 2); x.clip();
  const sg = x.createLinearGradient(0, scy - R, 0, scy + R); sg.addColorStop(0, '#fff37a'); sg.addColorStop(0.5, '#ff9a3c'); sg.addColorStop(1, '#ff2bd6');
  x.fillStyle = sg; x.fillRect(W / 2 - R, scy - R, R * 2, R * 2); x.fillStyle = '#2b0f5a';
  for (let i = 0; i < 7; i++) x.fillRect(W / 2 - R, scy + R * (0.05 + i * 0.14), R * 2, R * (0.02 + i * 0.022));
  x.restore();
  x.fillStyle = '#12051f'; x.fillRect(0, hy, W, H - hy);
  x.strokeStyle = '#ff3bd0'; x.lineWidth = 1; x.beginPath();
  for (let i = -18; i <= 18; i++) { x.moveTo(W / 2 + i * W * 0.012, hy); x.lineTo(W / 2 + i * W * 0.16, H); }
  for (let j = 1; j < 16; j++) { const yy = hy + (H - hy) * (1.4 / (j + 0.4)) - (H - hy) * 0.05; if (yy > hy) { x.moveTo(0, yy); x.lineTo(W, yy); } }
  x.stroke();
  if (kind === 'pillars') {
    for (const cx of [W * 0.18, W * 0.82]) {
      const pw = W * 0.05, ph = H * 0.5, base = hy + (H - hy) * 0.6;
      const g = x.createLinearGradient(cx - pw / 2, 0, cx + pw / 2, 0); g.addColorStop(0, '#6e6a8a'); g.addColorStop(0.4, '#f2eefc'); g.addColorStop(1, '#5a557a');
      x.fillStyle = g; x.fillRect(cx - pw / 2, base - ph, pw, ph);
      x.fillStyle = '#d8d2f0'; x.fillRect(cx - pw * 0.8, base - ph - pw * 0.35, pw * 1.6, pw * 0.35); x.fillRect(cx - pw * 0.7, base - pw * 0.25, pw * 1.4, pw * 0.25);
    }
    // 浮かぶ星（惑星）
    const px = W * 0.75, py = H * 0.2, pr = Math.min(W, H) * 0.06;
    const pg = x.createRadialGradient(px - pr * 0.4, py - pr * 0.4, 0, px, py, pr); pg.addColorStop(0, '#ffe0b0'); pg.addColorStop(1, '#c2552e');
    x.fillStyle = pg; x.beginPath(); x.arc(px, py, pr, 0, 7); x.fill();
    x.strokeStyle = '#ffd36e'; x.lineWidth = 2; x.beginPath(); x.ellipse(px, py, pr * 1.8, pr * 0.45, -0.3, 0, 7); x.stroke();
  }
}
