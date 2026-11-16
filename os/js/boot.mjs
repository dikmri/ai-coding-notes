// 起動の演出: BIOS 風の文字 → ブラウン管が点く → レトロフューチャーの場面とロゴ → 進行状況バー
// Esc・Enter・スペース・画面を押すと飛ばせる。prefers-reduced-motion のときはロゴを短く見せるだけにする
import * as sound from './sound.mjs';

const MSG = ['仮想ドライブを接続しています...', '音声装置を暖めています...', '窓の部品を並べています...', '壁紙を描いています...', '準備ができました。'];

export function runBoot(canvas, info) {
  const x = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const END = reduce ? 1.6 : 9.6;
  canvas.hidden = false;
  let W = 1, H = 1, dpr = 1;
  const fit = () => { dpr = Math.min(2, devicePixelRatio || 1); W = Math.max(1, innerWidth); H = Math.max(1, innerHeight); canvas.width = W * dpr; canvas.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); };
  fit();
  addEventListener('resize', fit);
  // 星と山は最初に一度だけ決める（毎回ちらつかないように）
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = Array.from({ length: 220 }, () => [rnd(), rnd() * 0.62, rnd() * 1.6 + 0.3, rnd() * 6]);
  const ridge = (n, amp) => Array.from({ length: n + 1 }, (_, i) => (i === 0 || i === n ? 0 : rnd() * amp + amp * 0.3));
  const far = ridge(14, 0.12), near = ridge(9, 0.2);
  const bios = [
    ['FUTURE BIOS 4.01   (C) 1998-2026 Dekiru Systems', 0.15],
    ['', 0.2],
    [`CPU    : JavaScript エンジン ${info.cores} コア`, 0.35],
    ['MEMORY : ', 0.55, 'mem'],
    [`画面   : ${info.screen}  ${info.dpr} 倍  ${info.depth} ビット色`, 1.35],
    [`音声   : Web Audio ${info.rate} Hz ........ OK`, 1.55],
    [`描画   : Canvas 2D / WebGL2 ........ ${info.webgl2 ? 'OK' : 'なし'}`, 1.75],
    [`ドライブ C: 仮想ドライブ（IndexedDB） 空き ${info.free} ... OK`, 1.95],
    ['', 2.1],
    ['Future OS を起動しています...', 2.3],
  ];
  const beeps = new Set();
  const cue = (key, t, at, name) => { if (t >= at && !beeps.has(key)) { beeps.add(key); sound.play(name); } };
  let t0 = 0, done = false, resolveFn;
  const finish = () => { if (done) return; done = true; removeEventListener('keydown', onKey, true); canvas.removeEventListener('pointerdown', finish); removeEventListener('resize', fit); canvas.hidden = true; resolveFn(); };
  const onKey = (e) => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); finish(); } };
  addEventListener('keydown', onKey, true);
  canvas.addEventListener('pointerdown', finish);

  const mono = (px) => `${px}px "MS Gothic", "Osaka-Mono", ui-monospace, monospace`;
  function drawBios(t) {
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    const fs = Math.max(12, Math.min(22, W / 48));
    x.font = mono(fs); x.textBaseline = 'top';
    let y = fs * 1.5;
    for (const [text, at, kind] of bios) {
      if (t < at) break;
      x.fillStyle = kind ? '#c0c0c0' : '#c0c0c0';
      let s = text;
      if (kind === 'mem') { const k = Math.min(1, (t - at) / 0.75); s += `${String(Math.round(info.memKB * k)).padStart(7)}K ${k >= 1 ? 'OK' : ''}`; }
      if (at === 0.15) x.fillStyle = '#fff';
      x.fillText(s, fs * 1.5, y);
      y += fs * 1.45;
    }
    // 右上の「エネルギー」風の印（当時の BIOS 画面にあった飾りを、自分の図柄で）
    const r = fs * 2.2, cx = W - fs * 4, cy = fs * 3.4;
    x.strokeStyle = '#00ffff'; x.lineWidth = 2;
    for (let k = 0; k < 4; k++) { x.beginPath(); x.ellipse(cx, cy, r, r * 0.35, (k * Math.PI) / 4 + t, 0, Math.PI * 2); x.stroke(); }
    x.fillStyle = '#ffff00'; x.beginPath(); x.arc(cx, cy, r * 0.25, 0, 7); x.fill();
    if (Math.floor(t * 3) % 2) { x.fillStyle = '#c0c0c0'; x.fillRect(fs * 1.5, y, fs * 0.6, fs); }
    x.fillStyle = '#808080'; x.font = mono(fs * 0.85); x.fillText('Esc キーで飛ばせます', fs * 1.5, H - fs * 2.2);
  }
  function horizonY() { return H * 0.62; }
  function drawScene(t, k) {
    const hy = horizonY();
    const sky = x.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, '#05030f'); sky.addColorStop(0.55, '#2b0f5a'); sky.addColorStop(0.85, '#a3218f'); sky.addColorStop(1, '#ff4fb8');
    x.fillStyle = sky; x.fillRect(0, 0, W, hy + 1);
    for (const [sx, sy, sz, ph] of stars) { x.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + ph)); x.fillStyle = '#fff'; x.fillRect(sx * W, sy * hy * 0.95, sz, sz); }
    x.globalAlpha = 1;
    // 縞の太陽（少しずつ昇る）
    const R = Math.min(W, H) * 0.19, scy = hy - R * 0.35 - Math.min(1, k * 0.25) * R * 0.25;
    x.save(); x.beginPath(); x.arc(W / 2, scy, R, 0, Math.PI * 2); x.clip();
    const sg = x.createLinearGradient(0, scy - R, 0, scy + R); sg.addColorStop(0, '#fff37a'); sg.addColorStop(0.5, '#ff9a3c'); sg.addColorStop(1, '#ff2bd6');
    x.fillStyle = sg; x.fillRect(W / 2 - R, scy - R, R * 2, R * 2);
    x.fillStyle = '#2b0f5a';
    for (let i = 0; i < 7; i++) { const yy = scy + R * (0.05 + i * 0.14), hh = R * (0.02 + i * 0.022); x.fillRect(W / 2 - R, yy + ((t * 12) % (R * 0.14)) * 0.3, R * 2, hh); }
    x.restore();
    // 山（遠く・近く）
    const mount = (arr, col, edge, base) => { x.beginPath(); x.moveTo(0, hy); arr.forEach((h, i) => x.lineTo((i / (arr.length - 1)) * W, hy - h * H * base)); x.lineTo(W, hy); x.closePath(); x.fillStyle = col; x.fill(); x.strokeStyle = edge; x.lineWidth = 1.5; x.stroke(); };
    mount(far, '#3a1466', '#ff7ae0', 1); mount(near, '#1d0838', '#00e5ff', 0.8);
    // 遠近のグリッドの床
    x.fillStyle = '#12051f'; x.fillRect(0, hy, W, H - hy);
    x.strokeStyle = '#ff3bd0'; x.lineWidth = 1.5; x.beginPath();
    for (let i = -16; i <= 16; i++) { x.moveTo(W / 2 + i * W * 0.012, hy); x.lineTo(W / 2 + i * W * 0.16, H); }
    const off = (t * 0.9) % 1;
    for (let j = 1; j < 18; j++) { const z = j - off, yy = hy + (H - hy) * (1.4 / (z + 0.4)) - (H - hy) * 0.05; if (yy > hy && yy <= H) { x.moveTo(0, yy); x.lineTo(W, yy); } }
    x.stroke();
    const glow = x.createLinearGradient(0, hy - 6, 0, hy + 30); glow.addColorStop(0, '#ff4fd8aa'); glow.addColorStop(1, 'transparent'); x.fillStyle = glow; x.fillRect(0, hy - 6, W, 36);
    // ギリシャ風の柱（左右に1本ずつ）
    const pillar = (cx, scale) => {
      const pw = W * 0.045 * scale, ph = H * 0.42 * scale, base = hy + (H - hy) * 0.55;
      const g = x.createLinearGradient(cx - pw / 2, 0, cx + pw / 2, 0); g.addColorStop(0, '#6e6a8a'); g.addColorStop(0.4, '#f2eefc'); g.addColorStop(1, '#5a557a');
      x.fillStyle = g; x.fillRect(cx - pw / 2, base - ph, pw, ph);
      x.fillStyle = '#d8d2f0'; x.fillRect(cx - pw * 0.8, base - ph - pw * 0.35, pw * 1.6, pw * 0.35); x.fillRect(cx - pw * 0.7, base - pw * 0.25, pw * 1.4, pw * 0.25);
      x.strokeStyle = '#00000033'; x.lineWidth = 1; x.beginPath(); for (let s = 1; s < 5; s++) { x.moveTo(cx - pw / 2 + (pw / 5) * s, base - ph); x.lineTo(cx - pw / 2 + (pw / 5) * s, base - pw * 0.25); } x.stroke();
    };
    pillar(W * 0.12, 1); pillar(W * 0.88, 1);
  }
  function drawLogo(t, k) {
    const a = Math.min(1, Math.max(0, (k - 1.0) / 0.8));
    if (a <= 0) return;
    const fs = Math.min(W * 0.11, H * 0.16), cy = H * 0.3, s = 1 + (1 - a) * 0.6;
    x.save(); x.translate(W / 2, cy); x.scale(s, s); x.globalAlpha = a;
    x.font = `italic 900 ${fs}px "Arial Black", "Helvetica Neue", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const g = x.createLinearGradient(0, -fs / 2, 0, fs / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#9ad7ff'); g.addColorStop(0.5, '#1b2a6b'); g.addColorStop(0.56, '#ff9a3c'); g.addColorStop(1, '#fff6d8');
    x.shadowColor = '#2a0c4f'; x.shadowOffsetY = fs * 0.06; x.fillStyle = g; x.fillText('FUTURE OS', 0, 0);
    x.shadowColor = 'transparent'; x.lineWidth = Math.max(1, fs * 0.015); x.strokeStyle = '#ffffffcc'; x.strokeText('FUTURE OS', 0, 0);
    // 光の筋がロゴの上を走る
    const gk = (k - 2.6) / 0.7;
    if (gk > 0 && gk < 1) {
      x.globalCompositeOperation = 'source-atop';
      const w = x.measureText('FUTURE OS').width, gx = -w / 2 + gk * w * 1.4 - w * 0.2;
      const lg = x.createLinearGradient(gx - fs * 0.4, 0, gx + fs * 0.4, 0); lg.addColorStop(0, 'transparent'); lg.addColorStop(0.5, '#ffffffee'); lg.addColorStop(1, 'transparent');
      x.fillStyle = lg; x.fillRect(-w, -fs, w * 2, fs * 2);
      x.globalCompositeOperation = 'source-over';
    }
    x.restore();
    const sub = '98.7 ・ 出来る！エディション', n = Math.floor(Math.max(0, (k - 1.8) / 1.2) * sub.length);
    x.font = `700 ${Math.max(13, fs * 0.2)}px var(--font-ui), sans-serif`; x.textAlign = 'center'; x.fillStyle = '#ffd36e'; x.globalAlpha = 1;
    x.fillText(sub.slice(0, n), W / 2, cy + fs * 0.75);
  }
  function drawProgress(k) {
    const p = Math.min(1, Math.max(0, (k - 0.7) / 4.6)), bw = Math.min(360, W * 0.6), bh = 18, bx = (W - bw) / 2, by = H * 0.86;
    x.font = '12px "MS UI Gothic", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
    x.fillText(MSG[Math.min(MSG.length - 1, Math.floor(p * MSG.length))], W / 2, by - 6);
    // 当時の区切りのある進行状況バー（へこんだ枠の中に紺のブロック）
    x.fillStyle = '#808080'; x.fillRect(bx, by, bw, 1); x.fillRect(bx, by, 1, bh);
    x.fillStyle = '#fff'; x.fillRect(bx, by + bh - 1, bw, 1); x.fillRect(bx + bw - 1, by, 1, bh);
    x.fillStyle = '#c0c0c0'; x.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
    x.fillStyle = '#000080';
    const blocks = Math.floor(((bw - 6) / 10) * p);
    for (let i = 0; i < blocks; i++) x.fillRect(bx + 3 + i * 10, by + 3, 8, bh - 6);
  }
  function frame(now) {
    if (done) return;
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;
    if (reduce) {
      drawScene(0, 3); drawLogo(0, 3); drawProgress(Math.min(5.3, t * 4));
      cue('s', t, 0.1, 'startup');
    } else if (t < 2.8) {
      cue('b', t, 0.1, 'beep'); drawBios(t);
    } else if (t < 3.35) {
      // ブラウン管: 横の線へつぶれ → 点 → 白い光が広がる
      cue('c', t, 2.8, 'crt');
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      const k = (t - 2.8) / 0.55;
      if (k < 0.4) { const h = Math.max(2, H * (1 - k / 0.4)); x.fillStyle = '#fff'; x.globalAlpha = 0.6 + k; x.fillRect(0, (H - h) / 2, W, h); }
      else if (k < 0.6) { const w = W * (1 - (k - 0.4) / 0.2); x.fillStyle = '#fff'; x.fillRect((W - w) / 2, H / 2 - 1, Math.max(4, w), 3); }
      else { const r = Math.max(W, H) * ((k - 0.6) / 0.4); const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r + 1); g.addColorStop(0, '#fff'); g.addColorStop(1, '#ff4fd800'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
      x.globalAlpha = 1;
    } else {
      const k = t - 3.35;
      cue('s', t, 3.4, 'startup');
      drawScene(t, k); drawLogo(t, k); drawProgress(k);
      if (k < 0.5) { x.fillStyle = `rgba(255,255,255,${1 - k / 0.5})`; x.fillRect(0, 0, W, H); }
      // 走査線（起動の演出の中だけ）
      x.fillStyle = 'rgba(0,0,0,.12)'; for (let yy = 0; yy < H; yy += 3) x.fillRect(0, yy, W, 1);
      if (t > END - 0.5) { x.fillStyle = `rgba(0,0,0,${(t - (END - 0.5)) / 0.5})`; x.fillRect(0, 0, W, H); }
    }
    if (t >= END) { finish(); return; }
    requestAnimationFrame(frame);
  }
  return new Promise((r) => { resolveFn = r; requestAnimationFrame(frame); });
}

// 壁紙も同じ場面を止めた絵として描く（ほかの壁紙と選べる）
export const WALLPAPERS = [
  ['dusk', '夕暮れのグリッド'], ['pillars', '紫の空と柱'], ['stars', '星の海'], ['teal', '青緑（標準）'], ['checker', '市松模様'],
];
export function drawWallpaper(canvas, kind) {
  const W = Math.max(1, canvas.clientWidth), H = Math.max(1, canvas.clientHeight), dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  const x = canvas.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
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
