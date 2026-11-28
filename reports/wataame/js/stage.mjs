// 「わたあめ衛星の受信機」の画面。1920×1080 の Canvas に、時刻 t だけで 1 コマを描く（状態を持たない）。
// 再生ページは音の時計の t、動画の撮影は 1/60 秒ずつの t で同じ関数を呼ぶので、同じ絵になる。
import { between, lastBefore, sectionAt, chordIndexAt, fmtTime } from './data.mjs';

export const W = 1920;
export const H = 1080;
export const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif';
const font = (size, weight = 700) => `${weight} ${size}px ${FONT}`;

// 区間ごとの空の色（上・下）と文字・差し色
const PAL = {
  intro: { top: '#F9D7E6', bot: '#D4EBFF', ink: '#2B3160', accent: '#F2679A', accent2: '#4FAFE0', star: 0.0 },
  verse: { top: '#BCE4FF', bot: '#FFF0D6', ink: '#25305C', accent: '#EE5F86', accent2: '#2FA88A', star: 0.0 },
  build1: { top: '#FFE7A1', bot: '#FFC6DC', ink: '#3A2B4F', accent: '#F0603C', accent2: '#4F8FE8', star: 0.0 },
  drop1: { top: '#86CFFF', bot: '#FFBCDC', ink: '#1E2A5A', accent: '#F2478C', accent2: '#1597CF', star: 0.0 },
  break: { top: '#FFC09C', bot: '#C4B2F4', ink: '#3B2A55', accent: '#E9604A', accent2: '#7563E0', star: 0.25 },
  build2: { top: '#5E6BC8', bot: '#F9A9C9', ink: '#FFF6EC', accent: '#FFD166', accent2: '#FF8FC2', star: 0.55 },
  drop2: { top: '#151D46', bot: '#463A88', ink: '#FFF6EC', accent: '#FF79B8', accent2: '#5FE0D0', star: 1.0 },
  outro: { top: '#F4D3E7', bot: '#CCE5FF', ink: '#2B3160', accent: '#F2679A', accent2: '#4FAFE0', star: 0.15 },
};
const SEC_JA = { intro: 'イントロ', verse: 'ヴァース', build1: 'ビルド', build2: 'ビルド', drop1: 'ドロップ', drop2: 'ドロップ', break: 'ブレイク', outro: 'アウトロ' };
export const STEMS = [
  ['kick', 'キック', '#FF6B8B'], ['snare', 'スネア', '#FF9F43'], ['hats', 'ハイハット', '#E2B308'], ['perc', 'シェイカー', '#B58E6E'],
  ['bass', 'ベース', '#5B7CFA'], ['chords', '和音', '#2EBF98'], ['lead', '鈴', '#A47BFF'], ['chops', '声（チョップ）', '#F25FC2'],
  ['keys', '鍵盤', '#27A9E6'], ['fx', '効果音', '#7F8CFF'],
];
const BODY_INK = '#2B2F55';
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

// ------------------------------------------------------------------ 小さな道具
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const easeOut = (u) => 1 - (1 - clamp(u)) ** 3;
const easeBack = (u) => { u = clamp(u); const c = 1.6; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixRgb = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
}
function star4(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
}

// ------------------------------------------------------------------ 本体
export function createStage(data) {
  const S = data.score;
  const BEAT = S.beat, BAR = S.bar, STEP = BEAT / 4;
  const END = S.bars * BAR;
  const pal = Object.fromEntries(Object.entries(PAL).map(([k, p]) => [k, {
    ...p, topC: hexRgb(p.top), botC: hexRgb(p.bot), inkC: hexRgb(p.ink), accentC: hexRgb(p.accent), accent2C: hexRgb(p.accent2),
  }]));
  const overview = data.overview(300);
  const bandsBuf = new Float32Array(data.nBands);
  const kicks = data.drums.kick, snares = data.drums.snare.filter((d) => d.vel >= 0.5);
  const stabs = data.stabs;
  const allChops = [...data.chops, ...data.harmony].sort((a, b) => a.t - b.t);
  const keyNotes = [...S.notes.keys.map((n) => ({ ...n, src: 'keys', d: Math.max(0.16, Math.min(n.d, 0.5)) })),
    ...S.notes.chip.map((n) => ({ ...n, src: 'keys' })), ...S.notes.bell.map((n) => ({ ...n, src: 'bell' }))].sort((a, b) => a.t - b.t);
  const fx = data.fxBy;

  // 小節ごとのリズムの格子（16 分に丸める）
  const grid = [];
  const put = (rows, list, row, minVel = 0) => {
    for (const e of list) {
      if ((e.vel ?? 1) < minVel) continue;
      const b = Math.floor(e.t / BAR + 1e-6);
      const s = Math.round((e.t - b * BAR) / STEP);
      const bb = s >= 16 ? b + 1 : b, ss = s >= 16 ? s - 16 : s;
      (rows[bb] ||= [[], [], [], []]);
      const cell = rows[bb][row].find((c) => c.s === ss);
      if (cell) cell.v = Math.max(cell.v, e.vel ?? 1); else rows[bb][row].push({ s: ss, v: e.vel ?? 1, t: e.t });
    }
  };
  put(grid, data.chops, 0);
  put(grid, data.drums.kick, 1);
  put(grid, data.drums.snare, 2, 0.3);
  put(grid, data.drums.hat, 3);

  // 時刻 t の色（区間が変わると 1.2 秒かけて移る。Build の終わりは次の区間の色へ近づく）
  function palAt(t) {
    const i = S.sections.findIndex((s) => t >= s.t0 && t < s.t1);
    const k = i < 0 ? S.sections.length - 1 : i;
    const sec = S.sections[k];
    let P = pal[sec.id];
    const prev = k > 0 ? pal[S.sections[k - 1].id] : P;
    const u = smooth((t - sec.t0) / 1.2);
    const blend = (A, B, w) => ({
      topC: mixRgb(A.topC, B.topC, w), botC: mixRgb(A.botC, B.botC, w), inkC: mixRgb(A.inkC, B.inkC, w),
      accentC: mixRgb(A.accentC, B.accentC, w), accent2C: mixRgb(A.accent2C, B.accent2C, w), star: lerp(A.star, B.star, w),
    });
    let out = blend(prev, P, u);
    if (sec.id.startsWith('build') && k + 1 < S.sections.length) {
      const pr = clamp((t - sec.t0) / (sec.t1 - sec.t0));
      out = blend(out, pal[S.sections[k + 1].id], 0.35 * pr ** 2.2);
    }
    const dark = clamp((0.62 - lum(out.topC)) / 0.32);
    out.dark = dark;
    out.card = css(mixRgb([255, 252, 247], [26, 30, 70], dark), lerp(0.88, 0.72, dark));
    out.cardLine = css(mixRgb([255, 255, 255], [140, 150, 230], dark), lerp(0.9, 0.35, dark));
    out.ink = css(out.inkC);
    out.inkSoft = css(out.inkC, 0.62);
    out.accent = css(out.accentC);
    out.accent2 = css(out.accent2C);
    out.sec = sec;
    return out;
  }

  const lastHit = (list, t, win) => {
    const i = lastBefore(list, t);
    if (i < 0) return null;
    const e = list[i];
    return t - e.t <= win ? e : null;
  };

  // ================================================================ 背景
  function sky(ctx, P) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(P.topC));
    g.addColorStop(1, css(P.botC));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  function stars(ctx, t, P) {
    if (P.star < 0.01) return;
    for (let i = 0; i < 110; i++) {
      const x = hash(i) * W, y = hash(i + 500) * H * 0.82;
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * (0.5 + hash(i + 900) * 1.2) + hash(i + 77) * 6.28));
      const r = 1 + hash(i + 33) * 2.2;
      ctx.fillStyle = `rgba(255,250,235,${P.star * tw * 0.9})`;
      if (r > 2.6) { star4(ctx, x, y, r * 2.4); ctx.fill(); } else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  const CLOUDS = [
    { x: 80, y: 250, s: 1.25, v: 9 }, { x: 760, y: 140, s: 0.8, v: 14 }, { x: 1250, y: 330, s: 1.1, v: 7 },
    { x: 1700, y: 210, s: 0.9, v: 11 }, { x: 420, y: 470, s: 0.7, v: 16 }, { x: 1500, y: 560, s: 0.75, v: 13 },
  ];
  function clouds(ctx, t, P) {
    const a = lerp(0.62, 0.1, P.dark);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    for (const c of CLOUDS) {
      const x = ((c.x + t * c.v) % 2300) - 220;
      const s = c.s;
      ctx.beginPath();
      for (const [dx, dy, r] of [[0, 0, 60], [60, -22, 72], [130, 0, 58], [65, 18, 62], [-50, 14, 44], [180, 16, 40]]) {
        ctx.moveTo(x + dx * s + r * s, c.y + dy * s);
        ctx.arc(x + dx * s, c.y + dy * s, r * s, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
  function skyline(ctx, P, bands) {
    const n = bands.length, w = W / n;
    ctx.fillStyle = P.dark > 0.5 ? css(P.accent2C, 0.22) : 'rgba(255,255,255,0.32)';
    for (let i = 0; i < n; i++) {
      const h = 18 + 190 * bands[i] ** 1.25;
      rrect(ctx, i * w + 6, H - h + 14, w - 12, h, 14);
      ctx.fill();
    }
  }

  // ================================================================ 衛星
  const CX = 640, CY = 548, R = 168;

  function satellite(ctx, t, P, o) {
    const red = o.reduced ? 0.3 : 1;
    const kick = lastHit(kicks, t, 0.6);
    const kv = kick ? Math.exp(-(t - kick.t) / 0.11) * kick.vel : 0;
    const sn = lastHit(snares, t, 0.8);
    const sv = sn ? Math.exp(-(t - sn.t) / 0.13) : 0;
    const st = lastHit(stabs, t, 0.4);
    const stabGlow = st ? Math.exp(-(t - st.t) / 0.12) : 0;
    const pump = data.level('pump', t);
    const chopsLv = data.level('chops', t);
    const chordsLv = data.level('chords', t);
    const [ts0, ts1] = S.tapeStop;
    const tape = t >= ts0 && t < ts1 + 0.6 ? smooth((t - ts0) / (ts1 - ts0)) * (1 - smooth((t - ts1) / 0.6)) : 0;
    let jx = 0;
    for (const w of fx.wob || []) {
      if (t >= w.t && t < w.t + w.d) {
        const rate = (t - w.t < 2 * BEAT ? 6 : 8) / BEAT;
        jx = Math.sin((t - w.t) * rate * Math.PI * 2) * 7 * chordsLv * red;
      }
    }
    const sx = 1 + 0.05 * kv * red, sy = 1 - 0.07 * kv * red;
    const cx = CX + jx;
    const cy = CY + Math.sin(t * 1.3) * 8 * red - 16 * sv * red + 46 * tape;

    // 軌道（奥の半分）
    const orbit = (front) => {
      ctx.save();
      ctx.translate(cx, cy + 24);
      ctx.rotate(-0.17);
      ctx.strokeStyle = css(P.inkC, 0.26);
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.ellipse(0, 0, 390, 112, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const barFrac = (t % BAR) / BAR;
      for (let k = 0; k < 4; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 2;
        const isFront = Math.sin(a) >= 0;
        if (isFront !== front) continue;
        const since = ((t - k * BEAT) % BAR + BAR) % BAR;
        const g = since < BEAT ? Math.exp(-since / 0.22) : 0;
        ctx.fillStyle = css(P.accentC, 0.35 + 0.65 * g);
        ctx.beginPath();
        ctx.arc(390 * Math.cos(a), 112 * Math.sin(a), 7 + 6 * g * red, 0, Math.PI * 2);
        ctx.fill();
      }
      const a = -Math.PI / 2 + barFrac * Math.PI * 2;
      if ((Math.sin(a) >= 0) === front) {
        ctx.fillStyle = '#FFF8E7';
        ctx.strokeStyle = css(P.accent2C);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(390 * Math.cos(a), 112 * Math.sin(a), 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    };
    orbit(false);

    // 太陽電池の板（サイドチェインで少し傾く）
    for (const side of [-1, 1]) {
      ctx.save();
      const px = cx + side * (R + 128), py = cy + 4;
      ctx.strokeStyle = BODY_INK;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + side * (R - 10), cy + 4);
      ctx.lineTo(px - side * 78, py);
      ctx.stroke();
      ctx.translate(px, py);
      ctx.rotate(side * (-0.05 - 0.13 * (1 - pump) * red));
      rrect(ctx, -82, -50, 164, 100, 16);
      ctx.fillStyle = css(P.accent2C);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      for (let gx = 0; gx < 4; gx++) {
        for (let gy = 0; gy < 2; gy++) {
          rrect(ctx, -72 + gx * 37, -40 + gy * 41, 32, 36, 7);
          ctx.fillStyle = `rgba(255,255,255,${0.32 + 0.5 * stabGlow * ((gx + gy + (side > 0 ? 1 : 0)) % 2)})`;
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // アンテナ（拍ごとに光る）
    const beatAge = t % BEAT;
    const glow = Math.exp(-beatAge / 0.1);
    const ax = cx + Math.sin(t * 2) * 8 * red, ay = cy - R * sy - 66;
    ctx.strokeStyle = BODY_INK;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * sy + 12);
    ctx.quadraticCurveTo(cx + 4, cy - R * sy - 30, ax, ay);
    ctx.stroke();
    ctx.fillStyle = css(P.accentC, 0.35 * glow);
    ctx.beginPath();
    ctx.arc(ax, ay, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(P.accentC);
    ctx.beginPath();
    ctx.arc(ax, ay, 12 + 4 * glow * red, 0, Math.PI * 2);
    ctx.fill();

    // わたあめの体（輪郭が周波数でふくらむ。上が高い音、下が低い音）
    const bands = data.bands(t, bandsBuf);
    const N = 120, pts = [];
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      const phi = th <= Math.PI ? th / Math.PI : (2 * Math.PI - th) / Math.PI;
      const bf = (1 - phi) * (bands.length - 1);
      const b0 = Math.floor(bf), b1 = Math.min(bands.length - 1, b0 + 1);
      const v = lerp(bands[b0], bands[b1], bf - b0);
      const r = R * (1 + 0.13 * v ** 1.3 * (o.reduced ? 0.5 : 1) + 0.022 * Math.sin(th * 14 + t * 0.7) + 0.01 * Math.sin(th * 5 + t * 1.9));
      pts.push([cx + r * Math.sin(th) * sx, cy - r * Math.cos(th) * sy]);
    }
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const p = pts[i % N], q = pts[(i + 1) % N];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0], p[1], mx, my);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.08, cx, cy, R * 1.25);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.38, '#FFE2EF');
    g.addColorStop(0.74, '#FFBFDA');
    g.addColorStop(1, '#B5DEFF');
    ctx.shadowColor = 'rgba(40,30,90,0.22)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
    ctx.clip();
    // ふわふわの模様
    for (let i = 0; i < 9; i++) {
      const a = hash(i + 40) * Math.PI * 2 + t * 0.08 * (i % 2 ? 1 : -1);
      const rr = R * (0.25 + 0.55 * hash(i + 60));
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8, R * (0.18 + 0.12 * hash(i + 80)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 顔
    const sq = lastHit(fx.squeak || [], t, 0.38);
    const ex = 60 * sx, ey = cy - 16;
    const blinkPhase = (t + 0.7) % 3.9;
    const blink = blinkPhase < 0.12 ? 1 - Math.sin((blinkPhase / 0.12) * Math.PI) : 1;
    const sleepy = Math.max(tape, clamp((t - END - 0.3) / 1.5));
    ctx.fillStyle = BODY_INK;
    ctx.strokeStyle = BODY_INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    for (const side of [-1, 1]) {
      const x = cx + side * ex;
      if (sq) {
        ctx.beginPath();
        ctx.moveTo(x - side * 14, ey - 12);
        ctx.lineTo(x + side * 8, ey);
        ctx.lineTo(x - side * 14, ey + 12);
        ctx.stroke();
      } else if (sleepy > 0.5) {
        ctx.beginPath();
        ctx.arc(x, ey - 4, 14, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(x, ey, 15, 21 * blink * (1 - sleepy), 0, 0, Math.PI * 2);
        ctx.fill();
        if (blink > 0.6) {
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(x - 4, ey - 8, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = BODY_INK;
        }
      }
    }
    // ほっぺ（声が出ているときに赤くなる）
    ctx.fillStyle = `rgba(255,120,160,${0.32 + 0.4 * chopsLv})`;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * 104 * sx, cy + 24, 27, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 口（いま鳴っているチョップの母音の形）
    const ci = lastBefore(allChops, t);
    let chop = null;
    for (let i = ci; i >= 0 && i > ci - 3; i--) {
      const c = allChops[i];
      if (!c.h && t < c.t + c.d + 0.04) { chop = c; break; }
    }
    const mx = cx, my = cy + 40;
    if (chop) {
      const open = clamp(0.35 + chopsLv * 1.1);
      const shape = { a: [17, 15], i: [21, 5], u: [8, 9], e: [17, 10], o: [12, 14], n: [12, 2] }[chop.v] || [14, 10];
      const w = shape[0], h = Math.max(3, shape[1] * open);
      ctx.fillStyle = '#7A2E4A';
      ctx.beginPath();
      ctx.ellipse(mx, my, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      if (h > 7) {
        ctx.fillStyle = '#FF8FAB';
        ctx.beginPath();
        ctx.ellipse(mx, my + h * 0.45, w * 0.6, h * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(mx, my - 8, 13, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }

    orbit(true);

    // 和音の札（ぶら下がって揺れる）
    const idx = chordIndexAt(S, t);
    const ch = S.chords[idx];
    const next = S.chords[idx + 1];
    const swing = 0.05 * Math.sin(t * 1.9) * red + 0.06 * stabGlow * red;
    ctx.save();
    ctx.translate(cx, cy + R * sy - 6);
    ctx.rotate(swing);
    ctx.strokeStyle = BODY_INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-40, 0);
    ctx.lineTo(-58, 56);
    ctx.moveTo(40, 0);
    ctx.lineTo(58, 56);
    ctx.stroke();
    const tagS = 1 + 0.05 * stabGlow * red;
    ctx.translate(0, 98);
    ctx.scale(tagS, tagS);
    rrect(ctx, -140, -44, 280, 92, 26);
    ctx.fillStyle = 'rgba(255,253,249,0.95)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = css(P.accentC);
    ctx.stroke();
    ctx.fillStyle = BODY_INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(40, 800);
    ctx.fillText(ch.name.replace('#', '♯').replace('b5', '♭5').replace('Bb', 'B♭').replace('b9', '♭9'), 0, 8);
    ctx.font = font(19, 700);
    ctx.fillStyle = css(P.accentC);
    ctx.fillText(ch.roman.replace('#', '♯').replace('b', '♭'), 0, 36);
    ctx.restore();
    if (next) {
      ctx.font = font(19, 700);
      ctx.textAlign = 'left';
      ctx.fillStyle = P.inkSoft;
      ctx.fillText(`つぎ ${next.name.replace('#', '♯')}`, cx + 162, cy + R + 104);
    }

    // チョップのかな（口から吹き出しが上がる）
    const recent = between(allChops, t - 1.3, t + 1e-6);
    for (const c of recent) {
      const age = t - c.t;
      const u = age / 1.3;
      const hx = hash(c.t * 13.7), hy = hash(c.t * 7.3 + 1);
      const side = c.h ? -1 : 1;
      const x = mx + side * (150 + (110 + 110 * hx) * easeOut(u) * (o.reduced ? 0.6 : 1));
      const y = my - 10 - (220 + 90 * hy) * easeOut(u);
      const s = (age < 0.09 ? easeBack(age / 0.09) : 1) * (c.h ? 0.7 : 0.75 + 0.35 * c.vel);
      const a = 1 - u ** 2.2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.strokeStyle = c.radio ? css(P.inkC, 0.4) : css(P.accentC);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = BODY_INK;
      ctx.font = font(40, 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.kana, 0, 2);
      ctx.restore();
    }
    // 「キュッ」
    if (sq) {
      const u = (t - sq.t) / 0.38;
      ctx.save();
      ctx.globalAlpha = 1 - u;
      ctx.font = font(36, 800);
      ctx.fillStyle = css(P.accentC);
      ctx.textAlign = 'center';
      ctx.fillText('キュッ', cx - 250, cy - R + 10 - 30 * u);
      ctx.restore();
    }
    return { cx, cy, kv, sv };
  }

  // ================================================================ 効果
  function sparkles(ctx, t, P, cx, cy, o) {
    for (const e of between(fx.sparkle || [], t - 1.8, t + 1e-6)) {
      const age = t - e.t;
      for (let i = 0; i < 16; i++) {
        const d = i * 0.045;
        const u = (age - d) / 1.1;
        if (u < 0 || u > 1) continue;
        const a = hash(e.t + i * 3.1) * Math.PI * 2;
        const rr = R + 50 + 260 * hash(e.t * 2 + i) + 60 * u * (o.reduced ? 0.3 : 1);
        const r = 16 * Math.sin(u * Math.PI) * (0.6 + 0.6 * hash(i + e.t));
        ctx.fillStyle = i % 3 === 0 ? css(P.accentC, 0.9) : 'rgba(255,248,214,0.95)';
        star4(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.75, r);
        ctx.fill();
      }
    }
  }
  function impacts(ctx, t, P, cx, cy) {
    for (const e of between(fx.impact || [], t - 1.0, t + 1e-6)) {
      const u = (t - e.t) / 0.95;
      ctx.strokeStyle = css(P.accentC, 0.55 * (1 - u));
      ctx.lineWidth = 14 * (1 - u);
      ctx.beginPath();
      ctx.arc(cx, cy, R + 1000 * easeOut(u), 0, Math.PI * 2);
      ctx.stroke();
    }
    const sn = lastHit(snares, t, 0.7);
    if (sn) {
      const u = (t - sn.t) / 0.7;
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - u)})`;
      ctx.lineWidth = 6 * (1 - u);
      ctx.beginPath();
      ctx.arc(cx, cy, R + 30 + 220 * easeOut(u), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  function riserParticles(ctx, t, P) {
    const sec = P.sec;
    if (!sec.id.startsWith('build')) return;
    const pr = clamp((t - sec.t0) / (sec.t1 - sec.t0));
    const speed = 60 + 620 * pr ** 2;
    ctx.fillStyle = P.dark > 0.5 ? `rgba(255,240,200,${0.25 + 0.55 * pr})` : css(P.accentC, 0.2 + 0.5 * pr);
    for (let i = 0; i < 46; i++) {
      const x = 40 + hash(i + 300) * 1100;
      const y = H - (((t - sec.t0) * speed * (0.6 + 0.8 * hash(i + 400)) + hash(i + 200) * 1300) % 1300);
      const r = 2.5 + 3 * hash(i + 100);
      rrect(ctx, x - r / 2, y, r, r * (2 + 8 * pr), r);
      ctx.fill();
    }
  }

  // ================================================================ 鍵盤と泡
  const KX0 = 64, KX1 = 1136, KLO = 60, KHI = 96;
  const whiteIdx = [];
  for (let m = KLO; m <= KHI; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whiteIdx.push(m);
  const KW = (KX1 - KX0) / whiteIdx.length;
  const KY = 934, KH = 116, BKH = 70;
  const keyX = (m) => {
    if (m < KLO || m > KHI) return null;
    const isBlack = [1, 3, 6, 8, 10].includes(m % 12);
    if (!isBlack) return KX0 + whiteIdx.indexOf(m) * KW + KW / 2;
    return KX0 + whiteIdx.indexOf(m - 1) * KW + KW;
  };
  function keyboard(ctx, t, P) {
    const lit = new Map();
    const take = (list, color, release = 0.22) => {
      for (const n of between(list, t - 2.0, t + 1e-6)) {
        let m = n.m;
        while (m > KHI) m -= 12;
        const end = n.t + Math.max(0.1, n.d);
        const v = t < end ? 1 : Math.exp(-(t - end) / release);
        if (v < 0.03) continue;
        const cur = lit.get(m);
        if (!cur || cur.v < v) lit.set(m, { v, color });
      }
    };
    take(keyNotes.filter((n) => n.src === 'keys'), hexRgb('#27A9E6'));
    take(allChops, hexRgb('#F25FC2'));
    // 台
    rrect(ctx, KX0 - 24, KY - 40, KX1 - KX0 + 48, KH + 62, 28);
    ctx.fillStyle = P.card;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = P.cardLine;
    ctx.stroke();
    ctx.fillStyle = P.ink;
    ctx.font = font(18, 800);
    ctx.textAlign = 'left';
    ctx.fillText('わたあめ鍵盤', KX0, KY - 13);
    ctx.font = font(15, 600);
    ctx.fillStyle = P.inkSoft;
    ctx.fillText('ピンク = 声（チョップ）　青 = オルゴール・カリンバ・ピコピコ', KX0 + 140, KY - 13);
    for (let i = 0; i < whiteIdx.length; i++) {
      const m = whiteIdx[i];
      const L = lit.get(m);
      const x = KX0 + i * KW;
      const press = L ? 4 * L.v : 0;
      rrect(ctx, x + 2, KY + press, KW - 4, KH - press, 9);
      ctx.fillStyle = L ? css(mixRgb([255, 255, 255], L.color, 0.85 * L.v)) : '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = 'rgba(43,47,85,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (m % 12 === 0) {
        ctx.fillStyle = 'rgba(43,47,85,0.42)';
        ctx.font = font(13, 700);
        ctx.textAlign = 'center';
        ctx.fillText(noteName(m), x + KW / 2, KY + KH - 10);
      }
    }
    for (let m = KLO; m <= KHI; m++) {
      if (![1, 3, 6, 8, 10].includes(m % 12)) continue;
      const L = lit.get(m);
      const x = keyX(m);
      const press = L ? 3 * L.v : 0;
      rrect(ctx, x - KW * 0.31, KY + press, KW * 0.62, BKH, 7);
      ctx.fillStyle = L ? css(mixRgb(hexRgb(BODY_INK), L.color, 0.9 * L.v)) : BODY_INK;
      ctx.fill();
    }
  }
  function bubbles(ctx, t, P) {
    const life = 2.4;
    const list = [...between(data.chops, t - life, t + 1e-6), ...between(keyNotes, t - life, t + 1e-6).filter((n) => n.src === 'keys' && n.k === 'musicbox')];
    for (const n of list) {
      let m = n.m;
      while (m > KHI) m -= 12;
      const kx = keyX(m);
      if (kx == null) continue;
      const age = t - n.t, u = age / life;
      const big = n.syl ? 1 : 0.55;
      const x = kx + 14 * Math.sin(age * 3 + hash(n.t) * 6.28);
      const y = KY - 46 - 300 * u ** 0.85;
      const r = (6 + 9 * (n.vel ?? 0.6)) * big;
      if (u > 0.9) {
        const k = (u - 0.9) / 0.1;
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r * (1 + 1.2 * k), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    // 「ぽん」の効果音
    for (const e of between(fx.pop || [], t - 0.35, t + 1e-6)) {
      const u = (t - e.t) / 0.35;
      const x = KX0 + 60 + hash(e.t * 3.3) * (KX1 - KX0 - 120), y = KY - 120 - 160 * hash(e.t * 5.1);
      ctx.strokeStyle = css(P.accent2C, 0.8 * (1 - u));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 8 + 30 * easeOut(u), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ================================================================ 右の板
  function card(ctx, P, x, y, w, h, title, note) {
    rrect(ctx, x, y, w, h, 26);
    ctx.fillStyle = P.card;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = P.cardLine;
    ctx.stroke();
    ctx.fillStyle = P.ink;
    ctx.font = font(23, 800);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, x + 28, y + 40);
    if (note) {
      ctx.font = font(16, 600);
      ctx.fillStyle = P.inkSoft;
      ctx.textAlign = 'right';
      ctx.fillText(note, x + w - 26, y + 39);
    }
  }
  function chordPath(ctx, t, P) {
    const x = 1180, y = 232, w = 680, h = 236;
    card(ctx, P, x, y, w, h, 'いまの和音', '帯の長さ = 和音が続く長さ');
    const L = x + 28, Rr = x + w - 28, pps = (Rr - L) / 4.2;
    const tx = (tt) => L + (tt - (t - 1.0)) * pps;
    ctx.save();
    rrect(ctx, L - 4, y + 54, Rr - L + 8, h - 64, 14);
    ctx.clip();
    const idx = chordIndexAt(S, t);
    const from = Math.max(0, idx - 4), to = Math.min(S.chords.length, idx + 10);
    for (let i = from; i < to; i++) {
      const c = S.chords[i];
      const x0 = tx(c.t0) + 3, x1 = tx(c.t1) - 3;
      if (x1 < L - 10 || x0 > Rr + 10) continue;
      const cur = i === idx;
      rrect(ctx, x0, y + 62, x1 - x0, 70, 16);
      ctx.fillStyle = cur ? css(P.accentC) : (c.t1 <= t ? css(P.inkC, 0.12) : 'rgba(255,255,255,0.72)');
      ctx.fill();
      if (x1 - x0 > 30) {
        const wide = x1 - x0 > 96;
        ctx.save();
        rrect(ctx, x0 + 4, y + 62, x1 - x0 - 8, 70, 12);
        ctx.clip();
        ctx.fillStyle = cur ? '#FFFFFF' : BODY_INK;
        if (!cur && c.t1 <= t) ctx.fillStyle = P.inkSoft;
        ctx.textAlign = 'left';
        ctx.font = font(wide ? 23 : 16, 800);
        ctx.fillText(c.name.replace('#', '♯').replace('Bb', 'B♭').replace('b5', '♭5').replace('b9', '♭9'), x0 + (wide ? 12 : 8), y + (wide ? 96 : 102));
        if (wide) {
          ctx.font = font(14, 700);
          ctx.fillText(c.roman.replace('#', '♯').replace('b', '♭'), x0 + 12, y + 120);
        }
        ctx.restore();
      }
    }
    // ベースの動き
    const by = (m) => y + 214 - ((m - 28) / 13) * 64;
    ctx.strokeStyle = '#5B7CFA';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let first = true;
    for (let i = from; i < to; i++) {
      const c = S.chords[i];
      const x0 = tx(c.t0), x1 = tx(c.t1);
      if (first) { ctx.moveTo(x0, by(c.bass)); first = false; } else ctx.lineTo(x0, by(c.bass));
      ctx.lineTo(x1, by(c.bass));
    }
    ctx.stroke();
    ctx.restore();
    const cur = S.chords[idx];
    ctx.fillStyle = '#5B7CFA';
    ctx.beginPath();
    ctx.arc(tx(t), by(cur.bass), 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(16, 800);
    ctx.textAlign = 'left';
    ctx.fillStyle = P.ink;
    ctx.fillText(`ベース ${noteName(cur.bass)}`, tx(t) + 14, by(cur.bass) - 10);
    // いま
    ctx.strokeStyle = css(P.inkC, 0.7);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx(t), y + 56);
    ctx.lineTo(tx(t), y + h - 10);
    ctx.stroke();
  }
  function rhythm(ctx, t, P) {
    const x = 1180, y = 488, w = 680, h = 252;
    card(ctx, P, x, y, w, h, 'リズム', 'この小節の 16 分音符');
    const b = Math.floor(t / BAR + 1e-9);
    const rows = grid[b] || [[], [], [], []];
    const labels = [['声', '#F25FC2'], ['キック', '#FF6B8B'], ['スネア', '#FF9F43'], ['ハイハット', '#E2B308']];
    const gx = x + 150, gw = w - 178, cw = gw / 16, ry0 = y + 84, rh = 44;
    const curStep = Math.floor((t - b * BAR) / STEP);
    for (let s = 0; s < 16; s += 4) {
      rrect(ctx, gx + s * cw, ry0 - 22, cw * 4 - 4, rh * 4, 12);
      ctx.fillStyle = css(P.inkC, (s / 4) % 2 ? 0.05 : 0.09);
      ctx.fill();
    }
    rrect(ctx, gx + curStep * cw, ry0 - 26, cw - 2, rh * 4 + 8, 10);
    ctx.fillStyle = css(P.accentC, 0.22);
    ctx.fill();
    for (let r = 0; r < 4; r++) {
      const yy = ry0 + r * rh;
      ctx.fillStyle = P.ink;
      ctx.font = font(18, 800);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[r][0], x + 28, yy);
      const col = hexRgb(labels[r][1]);
      for (const c of rows[r]) {
        const cx = gx + c.s * cw + cw / 2;
        const done = c.s <= curStep;
        const pulse = done && t - c.t < 0.2 ? Math.exp(-(t - c.t) / 0.08) : 0;
        const rad = 5 + 9 * clamp(c.v) + 5 * pulse;
        ctx.beginPath();
        ctx.arc(cx, yy, rad, 0, Math.PI * 2);
        if (done) { ctx.fillStyle = css(col); ctx.fill(); } else { ctx.strokeStyle = css(col, 0.75); ctx.lineWidth = 3; ctx.stroke(); }
      }
    }
    ctx.textBaseline = 'alphabetic';
  }
  function meters(ctx, t, P) {
    const x = 1180, y = 760, w = 680, h = 290;
    card(ctx, P, x, y, w, h, '楽器ごとの音量', '');
    for (let i = 0; i < STEMS.length; i++) {
      const [id, label, color] = STEMS[i];
      const col = i < 5 ? 0 : 1, row = i % 5;
      const lx = x + 28 + col * 322, ly = y + 74 + row * 36;
      const v = data.level(id, t);
      ctx.fillStyle = P.ink;
      ctx.font = font(16, 700);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly);
      const bx = lx + 128, bw = 166;
      rrect(ctx, bx, ly - 8, bw, 16, 8);
      ctx.fillStyle = css(P.inkC, 0.12);
      ctx.fill();
      if (v > 0.02) {
        rrect(ctx, bx, ly - 8, Math.max(16, bw * v), 16, 8);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    // サイドチェイン（直近 1.5 秒の音量の曲線）
    const gx = x + 190, gy = y + 262, gw = w - 218, gh = 34;
    ctx.fillStyle = P.ink;
    ctx.font = font(16, 700);
    ctx.textAlign = 'left';
    ctx.fillText('サイドチェイン', x + 28, gy - 10);
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const tt = t - 1.5 + (i / 90) * 1.5;
      const v = tt < 0 ? 1 : data.level('pump', tt);
      const px = gx + (i / 90) * gw, py = gy - v * gh;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.lineTo(gx + gw, gy);
    ctx.lineTo(gx, gy);
    ctx.closePath();
    ctx.fillStyle = css(P.accent2C, 0.25);
    ctx.fill();
    ctx.strokeStyle = css(P.accent2C);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textBaseline = 'alphabetic';
  }

  // ================================================================ 上の帯と進み具合
  function chip(ctx, P, xr, y, text) {
    ctx.font = font(22, 800);
    const w = ctx.measureText(text).width + 40;
    rrect(ctx, xr - w, y, w, 48, 24);
    ctx.fillStyle = P.card;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = P.cardLine;
    ctx.stroke();
    ctx.fillStyle = P.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, xr - w / 2, y + 25);
    ctx.textBaseline = 'alphabetic';
    return xr - w - 12;
  }
  function header(ctx, t, P) {
    // 小さな衛星の印
    ctx.fillStyle = css(P.accent2C);
    rrect(ctx, 40, 62, 26, 18, 4); ctx.fill();
    rrect(ctx, 106, 62, 26, 18, 4); ctx.fill();
    ctx.fillStyle = '#FFD3E6';
    ctx.beginPath(); ctx.arc(86, 71, 22, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
    ctx.fillStyle = BODY_INK;
    ctx.beginPath(); ctx.arc(79, 68, 3, 0, Math.PI * 2); ctx.arc(93, 68, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.font = font(42, 800);
    ctx.textAlign = 'left';
    ctx.fillText(S.title, 150, 84);
    ctx.font = font(19, 600);
    ctx.fillStyle = P.inkSoft;
    ctx.fillText(`${S.titleEn}　・　kawaii future bass　・　作曲・音・画面: Claude`, 152, 114);
    const b = Math.floor(t / BAR + 1e-9), beat = Math.floor((t % BAR) / BEAT);
    let xr = 1860;
    xr = chip(ctx, P, xr, 46, `${fmtTime(Math.min(t, END))} / ${fmtTime(END)}`);
    xr = chip(ctx, P, xr, 46, `${Math.min(S.bars, b + 1)} 小節 ・ ${beat + 1} 拍`);
    xr = chip(ctx, P, xr, 46, 'D メジャー');
    chip(ctx, P, xr, 46, `${S.bpm} BPM`);
  }
  function progress(ctx, t, P) {
    const x0 = 60, x1 = 1860, w = x1 - x0, y = 178;
    const n = overview.length, cw = w / n;
    const pos = clamp(t / END);
    for (let i = 0; i < n; i++) {
      const tt = ((i + 0.5) / n) * END;
      const sec = sectionAt(S, tt);
      const c = pal[sec.id].accentC;
      const v = overview[i];
      const hh = 6 + 40 * v;
      rrect(ctx, x0 + i * cw + 1, y - hh / 2, cw - 2, hh, 3);
      ctx.fillStyle = css(c, i / n <= pos ? 0.95 : 0.32);
      ctx.fill();
    }
    ctx.font = font(15, 800);
    ctx.textAlign = 'left';
    for (const s of S.sections) {
      const sx = x0 + (s.t0 / END) * w;
      ctx.fillStyle = P.inkSoft;
      ctx.fillText(s.name, sx + 4, y - 30);
      ctx.fillStyle = css(P.inkC, 0.25);
      ctx.fillRect(sx, y - 44, 2, 70);
    }
    const px = x0 + pos * w;
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, y - 34);
    ctx.lineTo(px, y + 28);
    ctx.stroke();
    ctx.fillStyle = '#FFE2EF';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(px, y + 30, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  function banner(ctx, t, P) {
    const sec = P.sec;
    const age = t - sec.t0;
    if (age < 0 || age > 2.8) return;
    const xIn = lerp(-520, 76, easeBack(age / 0.5));
    const a = 1 - smooth((age - 2.1) / 0.7);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = P.ink;
    ctx.textAlign = 'left';
    ctx.font = font(76, 800);
    ctx.fillText(sec.name, xIn, 320);
    ctx.font = font(30, 700);
    ctx.fillStyle = css(P.accentC);
    ctx.fillText(SEC_JA[sec.id] || '', xIn + 4, 362);
    ctx.restore();
  }

  // ================================================================ 1 コマ
  return function draw(ctx, t, o = {}) {
    const P = palAt(t);
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    sky(ctx, P);
    stars(ctx, t, P);
    clouds(ctx, t, P);
    skyline(ctx, P, data.bands(t, bandsBuf));
    // 衛星のまわり（打った瞬間に少し寄る）
    let zoom = 1;
    if (!o.reduced) {
      for (const e of between(fx.impact || [], t - 0.8, t + 1e-6)) zoom += 0.03 * Math.exp(-(t - e.t) / 0.22);
    }
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(zoom, zoom);
    ctx.translate(-CX, -CY);
    riserParticles(ctx, t, P);
    bubbles(ctx, t, P);
    const sat = satellite(ctx, t, P, o);
    impacts(ctx, t, P, sat.cx, sat.cy);
    sparkles(ctx, t, P, sat.cx, sat.cy, o);
    ctx.restore();
    keyboard(ctx, t, P);
    chordPath(ctx, t, P);
    rhythm(ctx, t, P);
    meters(ctx, t, P);
    header(ctx, t, P);
    progress(ctx, t, P);
    banner(ctx, t, P);
    // drop の始まりの光（1 回だけ）
    for (const e of between(fx.impact || [], t - 0.6, t + 1e-6)) {
      ctx.fillStyle = `rgba(255,255,255,${0.26 * e.vel * Math.exp(-(t - e.t) / 0.16)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // テープを止める演出: 色が抜ける
    const [ts0, ts1] = S.tapeStop;
    if (t >= ts0 && t < ts1 + 0.6) {
      const u = smooth((t - ts0) / (ts1 - ts0)) * (1 - smooth((t - ts1) / 0.6));
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = `rgba(128,128,128,${0.85 * u})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  };
}

// 書体を先に読んでおく（Canvas の文字は、読み終える前に描くと別の書体になる）
export async function loadFonts() {
  if (!document.fonts) return 'unsupported';
  const sample = 'わたあめサテライトWataameSatellite0123456789:/・いまの和音帯の長さ続くベースリズムこの小節分音符声キックスネアハイハットシェイカー鈴チョップ鍵盤効果音サイドチェイン楽器ごとの量つぎ拍メジャーピンク青オルゴールカリンバピコイントロヴァースビルドドロップブレイクアウトロキュッあいうえおらりるれろなにぬねのまみむめもやゆよわをぱぴぷぺぽたてとかきくけこはひふへほん♯♭øABCDEFGmaj79/#b';
  const t0 = performance.now();
  await Promise.all([600, 700, 800].map((w) => document.fonts.load(`${w} 40px "M PLUS Rounded 1c"`, sample)));
  await document.fonts.ready;
  return Math.round(performance.now() - t0);
}
