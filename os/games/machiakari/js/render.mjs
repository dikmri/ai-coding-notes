// 街を描く。地面は表示の範囲だけを別の絵に作り置きし（カメラか地図か明るさが変わったときだけ描きなおす）、
// 建物・木・車・人は、奥の斜めの列から手前の列へ順に毎コマ描く（手前の建物が奥の車を隠すように）。
// 遠くから見ているとき（拡大率が小さいとき）は、建物も作り置きに入れて、車は光の点にする
import * as Art from './art.mjs';
import { BLD } from './core/city.mjs';
import { SVC, SVC_BY_ID, ZONES } from './core/defs.mjs';
import { vehiclePose, signalColor } from './core/traffic.mjs';
import { PROB } from './core/sim.mjs';

export const ZOOMS = [0.25, 0.35, 0.5, 0.7, 1, 1.4, 2];
const FAR = 0.42;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 時刻（分）から明るさ: night 夜の濃さ、dusk 夕焼けと朝焼け、late 深夜（明かりが減る）
export function lighting(tod) {
  const h = tod / 60, sun = Math.cos(((h - 12) / 24) * Math.PI * 2);
  // 18時ごろが夕焼け、19時半ごろに夜になる（朝は 5時半ごろから明るくなる）
  const night = clamp(0.3 - sun * 2.4, 0, 1), dusk = clamp(1 - Math.abs(sun + 0.04) * 3.2, 0, 1);
  let late = 0;
  if (h >= 22) late = (h - 22) / 2; else if (h < 4) late = 1; else if (h < 5.5) late = 1 - (h - 4) / 1.5;
  return { h, sun, night, dusk, late: clamp(late, 0, 1) };
}
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

const CAR_COLORS = [[242, 242, 240], [242, 242, 240], [190, 194, 200], [190, 194, 200], [36, 38, 44], [36, 38, 44], [120, 124, 130], [170, 40, 44], [40, 70, 140], [30, 40, 70], [200, 186, 150], [60, 110, 80], [230, 120, 40]];
const PROB_ICON = [[PROB.FIRE, '火', '#ff5a3c'], [PROB.POWER, '電', '#ffd23c'], [PROB.WATER, '水', '#4cb4ff'], [PROB.SEWER, '下', '#b08a5a'], [PROB.ROAD, '道', '#c8c8c8'], [PROB.REACH, '行', '#ff9f4c'], [PROB.POLLUTION, '煙', '#9a9a9a'], [PROB.CRIME, '犯', '#b06cff']];

export function makeRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const R = { canvas, ctx, cam: { x: 0, y: 320, z: 4 }, W: 1, H: 1, dpr: 1, gcan: document.createElement('canvas'), gkey: '', particles: [], fx: [], stars: [], frame: 0, stats: { draws: 0 } };
  for (let k = 0; k < 120; k++) R.stars.push([Math.random(), Math.random() * 0.6, Math.random() * 1.5 + 0.4, Math.random() * 6]);

  R.resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    R.W = canvas.width; R.H = canvas.height; R.dpr = dpr;
  };
  R.scale = () => ZOOMS[R.cam.z] * R.dpr;
  R.tileTop = (i, j, z = 0) => { const sc = R.scale(); return [((i - j) * 32 - R.cam.x) * sc + R.W / 2, ((i + j) * 16 - z - R.cam.y) * sc + R.H / 2]; };
  // 画面の点（端末の画素）→ マス（小数）
  R.screenToTile = (sx, sy) => {
    const sc = R.scale(), X = (sx - R.W / 2) / sc + R.cam.x, Y = (sy - R.H / 2) / sc + R.cam.y;
    return [(X / 32 + Y / 16) / 2, (Y / 16 - X / 32) / 2];
  };
  R.centerOn = (i, j) => { R.cam.x = (i - j) * 32; R.cam.y = (i + j) * 16; };
  R.clampCam = (N) => { R.cam.x = clamp(R.cam.x, -N * 32, N * 32); R.cam.y = clamp(R.cam.y, 0, N * 32); };
  R.zoomAt = (dz, sx, sy, N) => {
    const nz = clamp(R.cam.z + dz, 0, ZOOMS.length - 1);
    if (nz === R.cam.z) return false;
    const [ti, tj] = R.screenToTile(sx ?? R.W / 2, sy ?? R.H / 2);
    R.cam.z = nz;
    // 指している所が動かないようにカメラをずらす
    const [ax, ay] = R.tileTop(ti, tj);
    const sc = R.scale();
    R.cam.x += (ax - (sx ?? R.W / 2)) / sc; R.cam.y += (ay - (sy ?? R.H / 2)) / sc;
    R.clampCam(N);
    return true;
  };
  // 見えているマスの範囲（だいたい）
  R.view = () => {
    const pts = [[0, 0], [R.W, 0], [0, R.H], [R.W, R.H]].map(([x, y]) => R.screenToTile(x, y));
    const is = pts.map((p) => p[0]), js = pts.map((p) => p[1]);
    return { i0: Math.min(...is), i1: Math.max(...is), j0: Math.min(...js), j1: Math.max(...js) };
  };
  return R;
}

function groundSprite(s, k, N, overlayOn) {
  const i = k % N, j = (k - i) / N;
  const nb = (di, dj) => { const a = i + di, b = j + dj; return a >= 0 && b >= 0 && a < N && b < N ? b * N + a : -1; };
  const E = nb(1, 0), S = nb(0, 1), W = nb(-1, 0), No = nb(0, -1);
  const v = (k * 2654435761) >>> 30;
  if (s.road[k]) {
    const r = (m) => (m >= 0 && s.road[m] ? 1 : 0);
    const mask = r(E) | (r(S) << 1) | (r(W) << 2) | (r(No) << 3);
    return Art.ground(s.terrain[k] === 1 ? 'bridge' : 'road', { mask, road: s.road[k] });
  }
  if (s.terrain[k] === 1) {
    const l = (m) => (m >= 0 && s.terrain[m] !== 1 ? 1 : 0);
    return Art.ground('water', { mask: l(E) | (l(S) << 1) | (l(W) << 2) | (l(No) << 3), v });
  }
  const w = (m) => (m >= 0 && s.terrain[m] === 1 && !s.road[m] ? 1 : 0);
  const shore = w(E) | (w(S) << 1) | (w(W) << 2) | (w(No) << 3);
  if (s.zone[k]) return s.bld[k] ? Art.ground('lot', { zone: s.zone[k] }) : Art.ground('zone', { zone: s.zone[k], v, shore });
  void overlayOn;
  return Art.ground('grass', { v, shore });
}

// 情報の色分け: 値から色（良い=緑、悪い=赤）。null なら塗らない
export const OVERLAYS = {
  lv: { name: '地価', get: (sim, k) => sim.d.lv[k] / 100 },
  pol: { name: '公害', get: (sim, k) => 1 - Math.min(1, sim.d.pol[k] / 60) },
  noise: { name: '騒音', get: (sim, k) => 1 - Math.min(1, sim.d.noise[k] / 60) },
  crime: { name: '犯罪', get: (sim, k) => 1 - Math.min(1, sim.d.crime[k] / 70) },
  power: { name: '電気', get: (sim, k) => (sim.s.zone[k] || sim.s.svc[k] || sim.s.pw[k] ? (sim.d.power.on[k] ? 1 : 0) : null), colors: ['#ff4a3c', '#ffe14a'] },
  water: { name: '水道', get: (sim, k) => (sim.s.zone[k] && sim.s.bld[k] ? (sim.d.water.on[k] ? 1 : 0) : null), colors: ['#ff4a3c', '#4cb4ff'] },
  sewer: { name: '下水', get: (sim, k) => (sim.s.zone[k] && sim.s.bld[k] ? (sim.d.sewer.on[k] ? 1 : 0) : null), colors: ['#ff4a3c', '#4ce0c0'] },
  fire: { name: '消防', get: (sim, k) => Math.min(1, sim.d.cov.fire[k]) },
  police: { name: '警察', get: (sim, k) => Math.min(1, sim.d.cov.police[k]) },
  health: { name: '医療', get: (sim, k) => Math.min(1, sim.d.cov.health[k]) },
  edu: { name: '教育', get: (sim, k) => Math.min(1, sim.d.cov.edu[k]) },
  transit: { name: '地下鉄', get: (sim, k) => (sim.d.cov.transit[k] > 0 ? 1 : null), colors: ['#000', '#7fd0ff'] },
  happy: { name: '満足', get: (sim, k) => (sim.s.zone[k] && sim.s.bld[k] === BLD.BUILT && ZONES[sim.s.zone[k]].cls === 'R' ? sim.happy[k] / 100 : null) },
  traffic: { name: '交通', get: (sim, k) => (sim.s.road[k] ? 1 - Math.min(1, sim.tr.density[k] * 1.4) : null) },
  district: { name: '地区', get: () => null },
};
function heat(v, colors) {
  if (colors) return v >= 0.5 ? colors[1] : colors[0];
  const hue = Math.round(clamp(v, 0, 1) * 125);
  return `hsl(${hue} 68% 48%)`;
}

function rebuildGround(R, sim, L, ui, far) {
  const s = sim.s, N = s.N, g = R.gcan.getContext('2d'), sc = R.scale();
  Art.setScale(sc);
  if (R.gcan.width !== R.W || R.gcan.height !== R.H) { R.gcan.width = R.W; R.gcan.height = R.H; }
  g.clearRect(0, 0, R.W, R.H);
  const TW = 64 * sc, TH = 32 * sc;
  // 箱庭の側面（手前の2辺から下へ土の層）
  const D = 26;
  const side = (a, b, water, f) => {
    const [x1, y1] = a, [x2, y2] = b;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x2, y2 + D * sc); g.lineTo(x1, y1 + D * sc); g.closePath();
    g.fillStyle = water ? `rgb(${40 * f},${90 * f},${150 * f})` : `rgb(${120 * f},${88 * f},${60 * f})`; g.fill();
    g.beginPath(); g.moveTo(x1, y1 + D * sc * 0.6); g.lineTo(x2, y2 + D * sc * 0.6); g.lineTo(x2, y2 + D * sc); g.lineTo(x1, y1 + D * sc); g.closePath();
    g.fillStyle = water ? `rgb(${30 * f},${60 * f},${110 * f})` : `rgb(${88 * f},${70 * f},${58 * f})`; g.fill();
  };
  for (let x = 0; x < N; x++) {
    side(R.tileTop(x, N), R.tileTop(x + 1, N), s.terrain[(N - 1) * N + x] === 1, 0.95);
    side(R.tileTop(N, x), R.tileTop(N, x + 1), s.terrain[x * N + N - 1] === 1, 0.75);
  }
  const ov = ui.overlay && OVERLAYS[ui.overlay];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const [x, y] = R.tileTop(i, j);
    if (x < -TW || x > R.W + TW || y < -TH * 2 || y > R.H + TH) continue;
    const k = j * N + i, sp = groundSprite(s, k, N);
    g.drawImage(sp.img, x - sp.ox, y - sp.oy);
  }
  const drawOverlay = () => {
    g.globalAlpha = 0.72;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const [x, y] = R.tileTop(i, j);
      if (x < -TW || x > R.W + TW || y < -TH * 2 || y > R.H + TH) continue;
      const k = j * N + i;
      let fill = null;
      if (ui.overlay === 'district') { if (s.dist[k]) fill = ui.districtColor(s.dist[k]); }
      else if (s.terrain[k] !== 1 || s.road[k]) { const v = ov.get(sim, k); if (v !== null && v !== undefined) fill = heat(v, ov.colors); }
      if (!fill) continue;
      g.fillStyle = fill;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + TW / 2, y + TH / 2); g.lineTo(x, y + TH); g.lineTo(x - TW / 2, y + TH / 2); g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  };
  // 地区の色はいつでも薄く見せる（地区の道具を持っているとき）
  if (ov) drawOverlay();
  // 夜と夕焼けの色をかぶせる（地面の上だけ）
  const nl = ov ? L.night * 0.35 : L.night;
  if (nl > 0.01 || L.dusk > 0.01) {
    g.globalCompositeOperation = 'source-atop';
    if (L.dusk > 0.01) { g.fillStyle = `rgba(255,120,60,${L.dusk * 0.16})`; g.fillRect(0, 0, R.W, R.H); }
    if (nl > 0.01) { g.fillStyle = `rgba(10,14,40,${nl * 0.72})`; g.fillRect(0, 0, R.W, R.H); }
    g.globalCompositeOperation = 'source-over';
  }
  // 街灯の光だまり
  if (nl > 0.05 && sc >= 0.3) {
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = nl;
    const lamp = Art.glow('255,206,130', 0.8);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (!s.road[k] || s.terrain[k] === 1 && (i + j) & 1) continue;
      const [x, y] = R.tileTop(i + ((i + j) & 1 ? 0.15 : 0.85), j + 0.5);
      if (x < -TW || x > R.W + TW || y < -TH || y > R.H + TH) continue;
      g.drawImage(lamp.img, x - lamp.ox, y - lamp.oy);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  if (far) drawObjects(R, g, sim, L, ui, 0, true);
}

// 建物の絵を時刻に合わせて重ねる（昼 → 宵 → 深夜）
function layered(g, fn, x, y, L, alpha = 1) {
  const day = fn('day');
  g.globalAlpha = alpha; g.drawImage(day.img, x - day.ox, y - day.oy);
  let sp = day;
  if (L.night > 0.01) {
    const eve = 1 - L.late;
    if (eve > 0.01) { sp = fn('eve'); g.globalAlpha = alpha * L.night * (L.late > 0.01 ? 1 : 1); g.drawImage(sp.img, x - sp.ox, y - sp.oy); }
    if (L.late > 0.01) { sp = fn('late'); g.globalAlpha = alpha * L.night * L.late; g.drawImage(sp.img, x - sp.ox, y - sp.oy); }
  }
  g.globalAlpha = 1;
  return sp;
}

function drawObjects(R, g, sim, L, ui, t, far) {
  const s = sim.s, N = s.N, sc = R.scale(), TW = 64 * sc, TH = 32 * sc, W = R.W, H = R.H;
  const ovOn = !!ui.overlay;
  const Lx = ovOn ? { ...L, night: L.night * 0.35 } : L;
  const [ox, oy] = R.tileTop(0, 0);
  const sMin = Math.max(0, Math.floor((-TH * 2 - oy) / (TH / 2))), sMax = Math.min(2 * N - 2, Math.ceil((H + 230 * sc - oy) / (TH / 2)));
  // 車と人と信号を斜めの列ごとに分ける
  const carsBy = new Map(), pedsBy = new Map();
  const push = (m, key, v) => { let a = m.get(key); if (!a) m.set(key, (a = [])); a.push(v); };
  if (!far) {
    for (const v of sim.tr.vehicles) { const p = vehiclePose(s, v); const dg = Math.floor(p.i) + Math.floor(p.j); if (dg >= sMin - 1 && dg <= sMax) push(carsBy, dg, [v, p]); }
    if (sc >= 0.45 * R.dpr) for (const p of R.crowd.peds) { const dg = Math.floor(p.i) + Math.floor(p.j); if (dg >= sMin - 1 && dg <= sMax) push(pedsBy, dg, p); }
  }
  const lightsTodo = [];
  const alpha = ovOn ? 0.5 : 1;
  for (let d = sMin; d <= sMax; d++) {
    const iA = Math.max(0, d - N + 1), iB = Math.min(d, N - 1);
    // 画面の横の範囲に入る i だけ
    const xi0 = Math.floor((d + (-TW - ox) * 2 / TW) / 2) - 1, xi1 = Math.ceil((d + (W + TW - ox) * 2 / TW) / 2) + 1;
    const i0 = Math.max(iA, xi0), i1 = Math.min(iB, xi1);
    // 2×2 の施設は、一番手前の角の列で、その列のほかのものより先に描く
    for (let i = Math.max(iA, xi0 - 2); i <= Math.min(iB, xi1 + 2); i++) {
      const j = d - i, k = j * N + i;
      if (!s.svc[k]) continue;
      const def = SVC_BY_ID[s.svc[k]];
      if (def.size !== 2) continue;
      const a = s.anchor[k];
      if (a !== k - 1 - N) continue; // 手前の角のマス（anchor + (1,1)）のときだけ
      const ai = a % N, aj = (a - ai) / N, [x, y] = R.tileTop(ai, aj);
      const sp = layered(g, (lt) => Art.service(def.key, lt), x, y, Lx, alpha);
      emit(R, sim, sp, ai, aj, Lx, lightsTodo, x, y);
    }
    for (let i = i0; i <= i1; i++) {
      const j = d - i, k = j * N + i, [x, y] = R.tileTop(i, j);
      let sp = null;
      if (s.svc[k]) {
        const def = SVC_BY_ID[s.svc[k]];
        if (def.size === 1) {
          sp = layered(g, (lt) => Art.service(def.key, lt), x, y, Lx, alpha);
          if (def.key === 'wind' && !far) drawWind(g, R, i, j, t, sim, Lx);
          emit(R, sim, sp, i, j, Lx, lightsTodo, x, y);
        }
      } else if (s.bld[k] === BLD.BUILT || s.bld[k] === BLD.ABANDONED) {
        const ab = s.bld[k] === BLD.ABANDONED;
        sp = layered(g, (lt) => Art.building(s.zone[k], s.lvl[k] || 1, s.vari[k], lt, ab), x, y, Lx, alpha);
        if (!ab) emit(R, sim, sp, i, j, Lx, lightsTodo, x, y, s.zone[k] === 5 ? 1 : 0);
      } else if (s.bld[k] === BLD.BUILDING) {
        sp = layered(g, (lt) => Art.construction(s.zone[k], s.vari[k], lt === 'day' ? 'day' : 'eve'), x, y, { ...Lx, late: 0 }, alpha);
        if (Lx.night > 0.3) for (const l of sp.lights) lightsTodo.push([x + l[0], y + l[1], l[2]]);
      } else if (s.bld[k] === BLD.RUBBLE) {
        sp = layered(g, (lt) => Art.rubble(lt), x, y, { ...Lx, late: 0 }, alpha);
      } else if (s.trees[k] && !s.road[k]) {
        layered(g, (lt) => Art.trees(s.trees[k], s.vari[k], lt === 'day' ? 'day' : 'eve'), x, y, { ...Lx, late: 0 }, alpha);
      }
      if (s.pw[k] && !far) drawPole(g, R, s, i, j, Lx);
      if (!far && s.burn[k]) drawFire(g, R, i, j, t, sp);
      if (!far && ui.icons && sim.prob[k] && sc >= 0.45 * R.dpr && (s.zone[k] || s.anchor[k] === k)) drawIcon(g, R, sim.prob[k], x, sp ? y - sp.oy + 14 * sc : y - 20 * sc, t);
    }
    if (far) continue;
    if (sc >= 0.45 * R.dpr) drawSignals(g, R, sim, d, i0, i1, Lx);
    const cars = carsBy.get(d);
    if (cars) for (const [v, p] of cars) drawCar(g, R, v, p, Lx, t);
    const peds = pedsBy.get(d);
    if (peds) for (const p of peds) drawPed(g, R, p, Lx, t);
  }
  // 光る点（ネオン・航空障害灯・噴水）は加算で重ねる
  if (lightsTodo.length) {
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, c, kind] of lightsTodo) {
      if (c === 'none') continue;
      if (c === 'fountain') { continue; }
      if (c === '#ff4040' || c === '#ff3030') { if (Math.floor(t / 700) % 2) continue; }
      const gl = Art.glow(c === '#ff4040' || c === '#ff3030' ? '255,60,60' : hexToRgbStr(c), kind || 0.35);
      g.globalAlpha = Lx.night; g.drawImage(gl.img, x - gl.ox, y - gl.oy);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}
const hexCache = new Map();
function hexToRgbStr(c) {
  if (!c.startsWith('#')) return c.replace(/rgb\(|\)/g, '');
  let v = hexCache.get(c);
  if (!v) { v = Art.rgb(c).join(','); hexCache.set(c, v); }
  return v;
}

// 煙の出口と光る点を集める
function emit(R, sim, sp, i, j, L, lightsTodo, x, y, factory = 0) {
  if (!sp) return;
  if (sp.smoke.length && R.particles.length < 420 && R.scale() >= 0.3) {
    for (const [dx, dy] of sp.smoke) if (Math.random() < 0.08 * (factory ? 1 : 1.5)) {
      const sc = R.scale();
      R.particles.push({ X: (x + dx - R.W / 2) / sc + R.cam.x, Y: (y + dy - R.H / 2) / sc + R.cam.y, vx: 2 + Math.random() * 3, vy: -6 - Math.random() * 4, r: 2 + Math.random() * 2, life: 0, max: 2.5 + Math.random() * 2, c: factory ? 200 : 225 });
    }
  }
  if (L.night > 0.2) for (const l of sp.lights) lightsTodo.push([x + l[0], y + l[1], l[2]]);
}

function drawWind(g, R, i, j, t, sim, L) {
  const sc = R.scale(), [x, y] = R.tileTop(i + 0.5, j + 0.5), h = 46 * sc, r = 16 * sc;
  const c = L.night > 0.5 ? '#5a6070' : '#f2f2f2';
  g.strokeStyle = c; g.lineWidth = Math.max(1.2, 2 * sc); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
  const a = (t / 1000) * (1.5 + sim.wind * 3);
  g.lineWidth = Math.max(1, 1.6 * sc);
  for (let k = 0; k < 3; k++) { const b = a + (k * Math.PI * 2) / 3; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + Math.cos(b) * r, y - h + Math.sin(b) * r * 0.9); g.stroke(); }
  if (L.night > 0.3 && Math.floor(t / 800) % 2) { g.fillStyle = '#ff4040'; g.fillRect(x - sc, y - h - 2 * sc, 2 * sc, 2 * sc); }
}
function drawPole(g, R, s, i, j, L) {
  const sc = R.scale(), N = s.N, h = 15;
  const [x, y] = R.tileTop(i + 0.5, j + 0.5, h);
  const [bx, by] = R.tileTop(i + 0.5, j + 0.5);
  g.strokeStyle = L.night > 0.5 ? '#3a3226' : '#6b5a44'; g.lineWidth = Math.max(1, 1.5 * sc);
  g.beginPath(); g.moveTo(bx, by); g.lineTo(x, y); g.stroke();
  g.strokeStyle = L.night > 0.5 ? 'rgba(30,30,40,0.8)' : 'rgba(40,40,40,0.7)'; g.lineWidth = Math.max(0.7, 0.7 * sc);
  for (const [di, dj] of [[1, 0], [0, 1]]) {
    const a = i + di, b = j + dj;
    if (a >= N || b >= N) continue;
    const m = b * N + a;
    if (!(s.pw[m] || s.zone[m] || s.svc[m])) continue;
    const [x2, y2] = R.tileTop(a + 0.5, b + 0.5, h);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x2) / 2, (y + y2) / 2 + 4 * sc, x2, y2); g.stroke();
  }
}
function drawFire(g, R, i, j, t, sp) {
  const sc = R.scale(), [x, y] = R.tileTop(i + 0.5, j + 0.5);
  const top = sp ? Math.min(30 * sc, sp.oy * 0.6) : 14 * sc;
  for (let k = 0; k < 5; k++) {
    const f = Math.sin(t / 90 + k * 1.7) * 0.5 + 0.5, px = x + (k - 2) * 5 * sc, ph = (10 + f * 12) * sc;
    g.fillStyle = k % 2 ? `rgba(255,${120 + f * 80 | 0},40,0.9)` : 'rgba(255,220,90,0.9)';
    g.beginPath(); g.moveTo(px - 3 * sc, y - top * 0.3); g.quadraticCurveTo(px, y - top * 0.3 - ph * 1.4, px + 3 * sc, y - top * 0.3); g.fill();
  }
  if (Math.random() < 0.3 && R.particles.length < 420) R.particles.push({ X: (x - R.W / 2) / sc + R.cam.x, Y: (y - top - R.H / 2) / sc + R.cam.y, vx: 3, vy: -10, r: 3, life: 0, max: 3, c: 70 });
}
function drawIcon(g, R, prob, x, y, t) {
  const ic = PROB_ICON.find(([b]) => prob & b);
  if (!ic || Math.floor(t / 600) % 3 === 2) return;
  const sc = R.scale(), r = 7 * Math.max(sc, 0.7 * R.dpr);
  g.fillStyle = 'rgba(20,18,34,0.85)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.strokeStyle = ic[2]; g.lineWidth = Math.max(1, 1.4 * sc); g.stroke();
  g.fillStyle = ic[2]; g.font = `700 ${r * 1.15}px "BIZ UDPGothic","Yu Gothic UI",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ic[1], x, y + r * 0.05);
}
function drawSignals(g, R, sim, d, i0, i1, L) {
  const s = sim.s, N = s.N, tr = sim.tr, sc = R.scale();
  for (let i = i0; i <= i1; i++) {
    const j = d - i, k = j * N + i;
    if (!tr.signal[k]) continue;
    for (const [axis, pi, pj] of [[0, 0.9, 0.1], [1, 0.1, 0.9], [0, 0.1, 0.9 + 0.001], [1, 0.9, 0.1 + 0.001]].slice(0, 2)) {
      const [bx, by] = R.tileTop(i + pi, j + pj), [x, y] = R.tileTop(i + pi, j + pj, 13);
      g.strokeStyle = '#30343c'; g.lineWidth = Math.max(1, sc); g.beginPath(); g.moveTo(bx, by); g.lineTo(x, y); g.stroke();
      const c = signalColor(tr, k, axis), color = c === 'g' ? '#3cff8a' : c === 'y' ? '#ffd23c' : '#ff3c3c';
      g.fillStyle = '#1a1c22'; g.fillRect(x - 2.4 * sc, y - 2 * sc, 4.8 * sc, 4 * sc);
      g.fillStyle = color; g.beginPath(); g.arc(x, y, 1.5 * Math.max(sc, 0.6), 0, 7); g.fill();
      if (L.night > 0.2) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = L.night * 0.8; const gl = Art.glow(c === 'g' ? '60,255,140' : c === 'y' ? '255,210,60' : '255,60,60', 0.25); g.drawImage(gl.img, x - gl.ox, y - gl.oy); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    }
  }
}

// 車: 進む向きにそった小さな箱。夜は前照灯と尾灯
function drawCar(g, R, v, p, L, t) {
  const sc = R.scale();
  const P = (i, j, z = 0) => R.tileTop(i, j, z);
  const hl = Math.hypot(p.hx, p.hy) || 1, fx = p.hx / hl, fy = p.hy / hl, nx = -fy, ny = fx;
  const len = v.len / 2, wid = v.kind === 'truck' || v.kind === 'bus' || v.kind === 'fire' ? 0.11 : 0.085;
  const q = (a, b, z) => P(p.i + fx * a + nx * b, p.j + fy * a + ny * b, z);
  const base = v.kind === 'taxi' ? [250, 196, 40] : v.kind === 'fire' ? [210, 40, 36] : v.kind === 'police' ? [245, 245, 245] : v.kind === 'ambulance' ? [245, 245, 245] : v.kind === 'truck' ? [235, 235, 232] : CAR_COLORS[v.id % CAR_COLORS.length];
  const dark = L.night;
  const shade = (c, f) => `rgb(${(c[0] * f * (1 - dark * 0.72) + dark * 10) | 0},${(c[1] * f * (1 - dark * 0.72) + dark * 12) | 0},${(c[2] * f * (1 - dark * 0.7) + dark * 26) | 0})`;
  const quad = (a, fill) => { g.beginPath(); g.moveTo(...a[0]); g.lineTo(...a[1]); g.lineTo(...a[2]); g.lineTo(...a[3]); g.closePath(); g.fillStyle = fill; g.fill(); };
  const zb = v.kind === 'truck' || v.kind === 'fire' ? 6 : 3.4;
  quad([q(len, wid, 0), q(len, -wid, 0), q(-len, -wid, 0), q(-len, wid, 0)], 'rgba(0,0,0,0.3)');
  quad([q(len, wid, 1), q(len, -wid, 1), q(-len, -wid, 1), q(-len, wid, 1)], shade(base, 0.62));
  quad([q(len, wid, zb), q(len, -wid, zb), q(-len, -wid, zb), q(-len, wid, zb)], shade(base, 1));
  if (v.kind === 'truck') quad([q(len, wid, zb), q(len * 0.55, wid, zb), q(len * 0.55, -wid, zb), q(len, -wid, zb)], shade([60, 90, 150], 1));
  else if (sc >= 0.6 * R.dpr) { const c0 = len * 0.45, c1 = -len * 0.5, w2 = wid * 0.82; quad([q(c0, w2, zb + 2.2), q(c0, -w2, zb + 2.2), q(c1, -w2, zb + 2.2), q(c1, w2, zb + 2.2)], shade([70, 90, 110], 1)); }
  if (v.kind === 'fire' || v.kind === 'police' || v.kind === 'ambulance') {
    const on = Math.floor(t / 180) % 2, [lx, ly] = q(0, 0, zb + 3);
    g.fillStyle = v.kind === 'police' ? (on ? '#ff3030' : '#3060ff') : on ? '#ff3030' : '#ffffff';
    g.fillRect(lx - 1.5 * sc, ly - 1.5 * sc, 3 * sc, 3 * sc);
    if (L.night > 0.1) { g.globalCompositeOperation = 'lighter'; const gl = Art.glow(v.kind === 'police' && !on ? '60,100,255' : '255,60,60', 0.4); g.globalAlpha = 0.9; g.drawImage(gl.img, lx - gl.ox, ly - gl.oy); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  }
  if (L.night > 0.15) {
    g.globalCompositeOperation = 'lighter';
    // 前を照らす光（道に落ちる三角）と前照灯
    const a = L.night;
    const [h1x, h1y] = q(len, wid * 0.7, 1.5), [h2x, h2y] = q(len, -wid * 0.7, 1.5);
    const [c1x, c1y] = q(len + 0.55, wid * 2.2, 0), [c2x, c2y] = q(len + 0.55, -wid * 2.2, 0);
    g.fillStyle = `rgba(255,236,170,${0.13 * a})`;
    g.beginPath(); g.moveTo(h1x, h1y); g.lineTo(c1x, c1y); g.lineTo(c2x, c2y); g.lineTo(h2x, h2y); g.closePath(); g.fill();
    g.fillStyle = `rgba(255,248,220,${0.95 * a})`;
    g.fillRect(h1x - sc, h1y - sc, 2 * sc, 2 * sc); g.fillRect(h2x - sc, h2y - sc, 2 * sc, 2 * sc);
    // 尾灯（止まっているときは明るい）
    const brake = v.v < 0.25;
    const [t1x, t1y] = q(-len, wid * 0.7, 1.8), [t2x, t2y] = q(-len, -wid * 0.7, 1.8);
    g.fillStyle = `rgba(255,40,40,${(brake ? 1 : 0.6) * a})`;
    g.fillRect(t1x - sc, t1y - sc, 2 * sc, 2 * sc); g.fillRect(t2x - sc, t2y - sc, 2 * sc, 2 * sc);
    g.globalCompositeOperation = 'source-over';
  } else if (v.v < 0.25 && sc >= 0.6 * R.dpr) {
    const [t1x, t1y] = q(-len, wid * 0.7, 1.8);
    g.fillStyle = '#ff4040'; g.fillRect(t1x - 0.8 * sc, t1y - 0.8 * sc, 1.6 * sc, 1.6 * sc);
  }
}
// 夜の色: 元の色を藍色へ寄せる（色と濃さの組ごとに覚えておく）
const darkCache = new Map();
function darken(c, k) {
  if (k <= 0.05) return c;
  const key = c + k;
  let v = darkCache.get(key);
  if (!v) { const [r, g, b] = Art.rgb(c); v = `rgb(${(r + (10 - r) * k) | 0},${(g + (12 - g) * k) | 0},${(b + (32 - b) * k) | 0})`; darkCache.set(key, v); }
  return v;
}
// 人: 体と頭、歩くときは足を交互に
function drawPed(g, R, p, L, t) {
  const sc = R.scale(), [x, y] = R.tileTop(p.i, p.j);
  const h = (p.small ? 5 : 7) * sc, dark = Math.round(L.night * 6) / 10;
  const sh = (c) => darken(c, dark);
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x - 1.5 * sc, y - 0.5 * sc, 3 * sc, sc);
  const ph = p.moving ? Math.sin((t / 1000) * 9 + p.t * 3) : 0;
  g.strokeStyle = sh('#2a2a36'); g.lineWidth = Math.max(0.8, 0.9 * sc);
  g.beginPath(); g.moveTo(x, y - h * 0.42); g.lineTo(x - ph * 1.2 * sc, y); g.moveTo(x, y - h * 0.42); g.lineTo(x + ph * 1.2 * sc, y); g.stroke();
  g.fillStyle = sh(p.color); g.fillRect(x - 1.1 * sc, y - h * 0.88, 2.2 * sc, h * 0.5);
  if (p.bag) { g.fillStyle = sh('#5a4030'); g.fillRect(x + 1.1 * sc, y - h * 0.62, 1.2 * sc, 1.6 * sc); }
  g.fillStyle = sh(p.skin); g.beginPath(); g.arc(x, y - h, 1.1 * sc, 0, 7); g.fill();
}

// 1コマ描く
export function draw(R, sim, ui, t) {
  const g = R.ctx, s = sim.s, sc = R.scale();
  Art.setScale(sc);
  const L0 = lighting(s.time.tod), L = ui.forceDay ? { ...L0, night: 0, dusk: 0, late: 0 } : L0;
  // 空
  const top = mix(mix([110, 170, 230], [10, 14, 38], L.night), [250, 140, 90], L.dusk * 0.5), bot = mix(mix([200, 225, 245], [28, 30, 66], L.night), [255, 190, 120], L.dusk * 0.7);
  const sky = g.createLinearGradient(0, 0, 0, R.H);
  sky.addColorStop(0, `rgb(${top})`); sky.addColorStop(1, `rgb(${bot})`);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = sky; g.fillRect(0, 0, R.W, R.H);
  if (L.night > 0.05) {
    for (const [x, y, r, ph] of R.stars) { g.fillStyle = `rgba(255,255,240,${L.night * (0.5 + 0.5 * Math.sin(t / 900 + ph))})`; g.fillRect(x * R.W, y * R.H, r * R.dpr, r * R.dpr); }
    const mx = R.W * 0.86, my = R.H * 0.12, mr = 18 * R.dpr;
    g.fillStyle = `rgba(255,248,220,${L.night})`; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
    g.fillStyle = `rgb(${top})`; g.globalAlpha = L.night; g.beginPath(); g.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.9, 0, 7); g.fill(); g.globalAlpha = 1;
  }
  const far = sc < FAR * R.dpr;
  const lstep = `${Math.round(L.night * 20)}|${Math.round(L.dusk * 10)}|${far ? Math.round(L.late * 6) : 0}`;
  const key = `${R.cam.x.toFixed(2)}|${R.cam.y.toFixed(2)}|${R.cam.z}|${R.W}|${R.H}|${s.rev}|${lstep}|${ui.overlay || ''}|${ui.overlay ? sim.overlayRev : 0}|${far && ui.icons}`;
  if (key !== R.gkey) { rebuildGround(R, sim, L, ui, far); R.gkey = key; R.rebuilds = (R.rebuilds || 0) + 1; }
  g.drawImage(R.gcan, 0, 0);
  if (!far) {
    // 水面のきらめき
    if (sc >= 0.5) {
      const N = s.N, v = R.view();
      g.fillStyle = L.night > 0.5 ? 'rgba(255,240,200,0.35)' : 'rgba(255,255,255,0.6)';
      for (let j = Math.max(0, Math.floor(v.j0)); j <= Math.min(N - 1, Math.ceil(v.j1)); j++) for (let i = Math.max(0, Math.floor(v.i0)); i <= Math.min(N - 1, Math.ceil(v.i1)); i++) {
        const k = j * N + i;
        if (s.terrain[k] !== 1 || s.road[k]) continue;
        const ph = ((k * 73) % 100) / 100, w = Math.sin(t / 700 + ph * 6.28);
        if (w < 0.6) continue;
        const [x, y] = R.tileTop(i + 0.3 + ph * 0.4, j + 0.5);
        g.fillRect(x, y, 5 * sc * (w - 0.5), Math.max(1, sc));
      }
    }
    drawObjects(R, g, sim, L, ui, t, false);
  } else {
    // 遠くからは車を光の点で
    g.fillStyle = L.night > 0.3 ? 'rgba(255,236,170,0.95)' : 'rgba(250,250,250,0.9)';
    for (const v of sim.tr.vehicles) { const p = vehiclePose(s, v), [x, y] = R.tileTop(p.i, p.j); g.fillRect(x - R.dpr, y - R.dpr, 2 * R.dpr, 2 * R.dpr); }
  }
  // 煙
  const dt = Math.min(0.05, (t - (R.lastT || t)) / 1000) * (ui.speed || 1);
  R.lastT = t;
  for (let x = R.particles.length - 1; x >= 0; x--) {
    const p = R.particles[x];
    p.life += dt; p.X += p.vx * dt; p.Y += p.vy * dt; p.r += dt * 3;
    if (p.life > p.max) { R.particles.splice(x, 1); continue; }
    const a = (1 - p.life / p.max) * 0.45, [sx, sy] = [(p.X - R.cam.x) * sc + R.W / 2, (p.Y - R.cam.y) * sc + R.H / 2], c = p.c * (1 - L.night * 0.7);
    g.fillStyle = `rgba(${c | 0},${c | 0},${(c + 6) | 0},${a})`; g.beginPath(); g.arc(sx, sy, p.r * sc, 0, 7); g.fill();
  }
  drawFx(R, g, sim, t, dt, L);
  // 夕焼けと朝焼け: 街全体に、上は桃色、下は橙の光をうっすらかける
  if (L.dusk > 0.02 && !ui.overlay) {
    const gr = g.createLinearGradient(0, 0, 0, R.H);
    gr.addColorStop(0, `rgba(255,120,150,${L.dusk * 0.32})`); gr.addColorStop(1, `rgba(255,150,60,${L.dusk * 0.4})`);
    g.globalCompositeOperation = 'soft-light'; g.fillStyle = gr; g.fillRect(0, 0, R.W, R.H); g.globalCompositeOperation = 'source-over';
  }
  drawPreview(R, g, sim, ui, t);
}

// 建った・水準が上がった・マイルストーン（花火）の演出
function drawFx(R, g, sim, t, dt, L) {
  const sc = R.scale(), N = sim.s.N;
  while (sim.fx.length) {
    const f = sim.fx.shift();
    if (f.type === 'milestone' || f.type === 'goal') {
      for (let n = 0; n < (f.type === 'milestone' ? 14 : 5); n++) R.fx.push({ type: 'firework', delay: n * 0.35 + Math.random() * 0.3, life: 0, X: (Math.random() - 0.5) * N * 30 + R.cam.x, Y: R.cam.y - 60 - Math.random() * 120, hue: Math.floor(Math.random() * 360) });
    } else if (f.k !== undefined) R.fx.push({ type: f.type, k: f.k, life: 0 });
  }
  g.globalCompositeOperation = 'lighter';
  for (let x = R.fx.length - 1; x >= 0; x--) {
    const f = R.fx[x];
    if (f.delay > 0) { f.delay -= dt; continue; }
    f.life += dt;
    if (f.type === 'firework') {
      if (f.life > 2.2) { R.fx.splice(x, 1); continue; }
      const cx = (f.X - R.cam.x) * sc + R.W / 2, cy = (f.Y - R.cam.y) * sc + R.H / 2;
      const r = f.life * 60 * sc, a = Math.max(0, 1 - f.life / 2.2);
      for (let n = 0; n < 28; n++) { const b = (n / 28) * Math.PI * 2; g.fillStyle = `hsla(${f.hue + n * 3} 100% 65% / ${a})`; g.fillRect(cx + Math.cos(b) * r - sc, cy + Math.sin(b) * r + f.life * f.life * 14 * sc - sc, 2.4 * sc, 2.4 * sc); }
      continue;
    }
    if (f.life > 1.4 || f.k === undefined) { R.fx.splice(x, 1); continue; }
    const i = f.k % N, j = (f.k - i) / N, [px, py] = R.tileTop(i + 0.5, j + 0.5, 10 + f.life * 30);
    const a = 1 - f.life / 1.4;
    g.fillStyle = f.type === 'levelup' ? `rgba(255,230,120,${a})` : f.type === 'fire' ? `rgba(255,90,40,${a})` : `rgba(220,255,220,${a * 0.8})`;
    for (let n = 0; n < 5; n++) { const b = n * 1.26 + f.life * 3; g.fillRect(px + Math.cos(b) * 8 * sc - sc, py + Math.sin(b) * 4 * sc - sc, 2 * sc, 2 * sc); }
  }
  g.globalCompositeOperation = 'source-over';
  void L;
}

// 道具を当てる前の見積もり（緑は置ける、赤は置けない）とカーソル
function drawPreview(R, g, sim, ui, t) {
  const sc = R.scale(), TW = 64 * sc, TH = 32 * sc, N = sim.s.N;
  const dia = (i, j, fill, stroke) => {
    const [x, y] = R.tileTop(i, j);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + TW / 2, y + TH / 2); g.lineTo(x, y + TH); g.lineTo(x - TW / 2, y + TH / 2); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = Math.max(1, 2 * sc); g.stroke(); }
  };
  const p = ui.preview;
  if (p && p.tiles) {
    const fill = p.ok ? (p.tool.kind === 'bulldoze' ? 'rgba(255,120,60,0.45)' : 'rgba(80,255,170,0.42)') : 'rgba(255,60,60,0.45)';
    for (const k of p.tiles) dia(k % N, Math.floor(k / N), fill);
    if (p.tool.kind === 'svc' && p.a) {
      const def = SVC_BY_ID_KEY(p.tool.key);
      for (let dj = 0; dj < def.size; dj++) for (let di = 0; di < def.size; di++) dia(p.a[0] + di, p.a[1] + dj, p.ok ? 'rgba(80,255,170,0.35)' : 'rgba(255,60,60,0.45)');
      const sp = Art.service(p.tool.key, 'day'), [x, y] = R.tileTop(p.a[0], p.a[1]);
      g.globalAlpha = 0.65; g.drawImage(sp.img, x - sp.ox, y - sp.oy); g.globalAlpha = 1;
    }
  }
  if (ui.cursor) {
    const blink = 0.55 + 0.45 * Math.sin(t / 160);
    dia(ui.cursor[0], ui.cursor[1], null, `rgba(255,236,120,${blink})`);
    if (ui.dragStart) dia(ui.dragStart[0], ui.dragStart[1], null, 'rgba(120,220,255,0.95)');
  }
}
const SVC_BY_ID_KEY = (key) => SVC[key];

// 小さな地図（全体）。点を1マスに対応させ、表示の範囲を四角で示す
export function drawMinimap(mc, sim, R, ui) {
  const g = mc.getContext('2d'), s = sim.s, N = s.N, W = mc.width, H = mc.height;
  const cell = Math.min(W / (2 * N), H / N);
  const ox = W / 2, oy = (H - N * cell) / 2;
  g.clearRect(0, 0, W, H);
  const L = lighting(s.time.tod);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    let c;
    if (s.road[k]) c = s.road[k] === 3 ? '#e8e8f0' : s.road[k] === 2 ? '#c8c8d0' : '#a0a0aa';
    else if (s.terrain[k] === 1) c = '#3f7fc0';
    else if (s.svc[k]) c = '#e08fd0';
    else if (s.zone[k]) c = s.bld[k] === BLD.BUILT ? ZONES[s.zone[k]].color : s.bld[k] ? '#9a8a70' : '#6f8f5f';
    else c = s.trees[k] ? '#3f7a3a' : '#7aaa5a';
    if (ui.overlay && OVERLAYS[ui.overlay] && ui.overlay !== 'district') { const v = OVERLAYS[ui.overlay].get(sim, k); if (v !== null && v !== undefined && (s.terrain[k] !== 1 || s.road[k])) c = heat(v, OVERLAYS[ui.overlay].colors); }
    g.fillStyle = c;
    g.fillRect(ox + (i - j) * cell - cell, oy + (i + j) * cell / 2, cell * 2, Math.max(1, cell));
  }
  if (L.night > 0.2) { g.fillStyle = `rgba(10,14,40,${L.night * 0.45})`; g.fillRect(0, 0, W, H); }
  // 表示の範囲
  const v = [[0, 0], [R.W, 0], [R.W, R.H], [0, R.H]].map(([x, y]) => R.screenToTile(x, y)).map(([i, j]) => [ox + (i - j) * cell, oy + (i + j) * cell / 2]);
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); v.forEach((p, n) => (n ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); g.stroke();
  return { cell, ox, oy };
}
