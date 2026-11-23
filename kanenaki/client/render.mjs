// 描画。絵の解像度の小さな canvas（view）に描き、整数倍で拡大して見せる。文字は重ねた canvas（over）に端末の解像度で描く。
// 視点: 向き 45°（Q/E で 90° ずつ、0.25 秒）、縦の縮み 0.75。地面は区域ごとに 1 枚へ焼き付けて回して描く。
// 壁・物・人・魔物はスライスを重ねて描き（art.frame が焼き付けて覚えておく）、足元の奥行きで並べ替える。
import { TILE_PX, ANIM, RARITIES } from '../shared/schema.mjs';
import { worldToScreen, screenToWorld, dirToTurn, stepAngle, SQUASH, BAYER4, clamp, hashStr } from './core.mjs';
import { drawPixelText, drawCcIcon, TYPE_COLORS } from './fx.mjs';
import { TILE_COLORS } from './art.mjs';
import { vecFromDir } from '../shared/mapgen.mjs';

const BASE_THETA = Math.PI / 4;
const LIGHT_LEVELS = { day: 0, town: 0, dusk: 0.55, evening: 0.55, night: 0.8, dark: 0.9, dungeon: 0.9 };
const LIGHT_PROPS = { torch: [4.5, 1], brazier: [6, 1], warp_pad: [3, 0.7], belltower_ruin: [0, 0] };
const SEL_ENEMY = [255, 214, 110], SEL_FRIEND = [150, 255, 170], SEL_NPC = [255, 236, 170];
const ELITE_TINT = [210, 160, 255];

export function createRenderer({ view, over, game, art, fx, data, settings, log }) {
  const ctx = view.getContext('2d', { alpha: false });
  const octx = over.getContext('2d');
  const G = game.g;
  let W = 320, H = 200, scale = 2, dpr = 1, devW = 640, devH = 400;
  let theta = BASE_THETA, thetaTarget = BASE_THETA;
  let ground = null, groundVer = -1, mini = null;
  const lightCv = new OffscreenCanvas(1, 1), lightCtx = lightCv.getContext('2d');
  let lightImg = null, dark = null;
  let drawnEnts = [];   // 選ぶための並び { e, px, py, f }
  let labels = [];      // 落ちている物の名札 { e, x0, y0, x1, y1 }（端末のドット）
  let marker = null;    // 押した地点の印
  const stat = { draws: 0, ents: 0, frameMs: 0 };

  function resize() {
    dpr = window.devicePixelRatio || 1;
    devW = Math.max(1, Math.round(innerWidth * dpr));
    devH = Math.max(1, Math.round(innerHeight * dpr));
    const want = settings.get('scale');
    let s = want === 'auto' ? Math.max(1, Math.round(devW / 440)) : Number(want) || 2;
    while (s > 1 && devH / s < 200) s--;
    scale = s;
    W = Math.max(1, Math.ceil(devW / s)); H = Math.max(1, Math.ceil(devH / s));
    view.width = W; view.height = H;
    view.style.width = `${(W * s) / dpr}px`; view.style.height = `${(H * s) / dpr}px`;
    over.width = devW; over.height = devH;
    over.style.width = `${devW / dpr}px`; over.style.height = `${devH / dpr}px`;
    lightCv.width = W; lightCv.height = H;
    lightImg = lightCtx.createImageData(W, H); dark = new Float32Array(W * H);
    log('render.resize', { devW, devH, scale, W, H });
  }

  /* ---------------- 地面の焼き付け ---------------- */
  function bakeGround() {
    const m = G.map, types = game.tileTypes;
    const cv = new OffscreenCanvas(m.w * TILE_PX, m.h * TILE_PX), c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    const mc = new OffscreenCanvas(m.w, m.h), mctx = mc.getContext('2d'), mimg = mctx.createImageData(m.w, m.h);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      let name = types[m.ground[i]] || 'grass';
      const isWall = name.startsWith('wall');
      const floor = isWall ? (name === 'wall_dungeon' ? 'dungeon_floor' : 'cobble') : name;
      c.drawImage(art.tile(floor), x * TILE_PX, y * TILE_PX);
      const col = isWall ? [40, 36, 44] : TILE_COLORS[floor] || [90, 90, 90];
      const k = m.solid[i] && !isWall && floor !== 'water' ? 0.7 : 1;
      mimg.data.set([col[0] * k, col[1] * k, col[2] * k, 255], i * 4);
    }
    mctx.putImageData(mimg, 0, 0);
    ground = cv; mini = mc; groundVer = G.mapVersion;
    log('render.ground', { map: G.mapId, w: m.w, h: m.h });
  }
  art.onTileLoaded = () => { groundVer = -1; };

  /* ---------------- 毎コマ ---------------- */
  let camX = 0, camY = 0, O = { x: 0, y: 0 };
  const rel = (x, y) => worldToScreen(x, y, { x: 0, y: 0 }, theta);
  const toScreen = (x, y) => { const r = rel(x, y); return { x: O.x + Math.round(r.x), y: O.y + Math.round(r.y) }; };

  function poseOf(e, anim, t) {
    if (anim === ANIM.walk) return ((Math.floor(t / 180) + (hashStr(String(e.id)) & 1)) & 1) ? 'walk1' : 'walk2';
    if (anim === ANIM.attack) return 'attack';
    if (anim === ANIM.cast) return e.kind === 'monster' ? 'attack' : 'cast';
    return 'idle';
  }

  function frame(dt) {
    const t0 = performance.now();
    theta = stepAngle(theta, thetaTarget, dt);
    const m = G.map;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(0, 0, W, H);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, devW, devH);
    drawnEnts = []; labels = [];
    if (!m) { stat.frameMs = performance.now() - t0; return; }
    if (groundVer !== G.mapVersion || !ground) bakeGround();
    const now = performance.now();

    if (G.pred.has) { camX = G.pred.x; camY = G.pred.y; }
    const org = rel(0, 0);
    const c0 = rel(camX, camY);
    O = { x: Math.round(W / 2 - c0.x + org.x), y: Math.round(H / 2 + 8 - c0.y + org.y) };

    // 地面
    ctx.setTransform(1, 0, 0, 1, O.x, O.y);
    ctx.scale(1, SQUASH);
    ctx.rotate(theta);
    ctx.drawImage(ground, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 見えている範囲（地図の座標）
    const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([sx, sy]) => screenToWorld(sx - O.x, sy - O.y, { x: 0, y: 0 }, theta));
    const pad = 4;
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x)) - pad)), maxX = Math.min(m.w - 1, Math.ceil(Math.max(...corners.map((p) => p.x)) + pad));
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y)) - pad)), maxY = Math.min(m.h - 1, Math.ceil(Math.max(...corners.map((p) => p.y)) + pad));
    const inView = (x, y) => x >= minX - 2 && x <= maxX + 2 && y >= minY - 2 && y <= maxY + 2;

    // 地面の上の印（輪、選んだ物の足元、押した地点）
    drawGroundMarks(now);

    // 並べる物を集める
    const list = [];
    const types = game.tileTypes;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const i = y * m.w + x;
      const name = types[m.ground[i]];
      if (name && name.startsWith('wall')) {
        const r = rel(x + 0.5, y + 0.5);
        list.push({ d: r.y, x: x + 0.5, y: y + 0.5, art: art.has(name) ? name : name, wall: true });
      }
    }
    for (const p of m.props) {
      if (!inView(p.x, p.y)) continue;
      const r = rel(p.x, p.y);
      list.push({ d: r.y, x: p.x, y: p.y, art: p.art, rot: p.rot || 0, prop: true });
    }
    // 出口・ワープ（地図の portals の x, y はマスの中心）
    for (const p of G.portals || []) {
      if (!inView(p.x, p.y)) continue;
      if ([...G.ents.values()].some((e) => e.kind === 'object' && Math.hypot(e.x - p.x, e.y - p.y) < 1)) continue;
      const r = rel(p.x, p.y);
      list.push({ d: r.y - 100, x: p.x, y: p.y, art: 'warp_pad', prop: true, portal: p });
    }
    stat.ents = 0;
    for (const e of G.ents.values()) {
      const pos = game.entPos(e);
      if (!inView(pos.x, pos.y)) continue;
      const r = rel(pos.x, pos.y);
      const flat = e.kind === 'item' || e.kind === 'object' && /pad|portal/.test(e.art);
      list.push({ d: r.y - (flat ? 100 : 0), x: pos.x, y: pos.y, e });
      stat.ents++;
    }
    list.sort((a, b) => a.d - b.d || a.x - b.x);

    // 描く
    let draws = 0;
    const meEnt = G.ents.get(G.meId);
    let meDraw = null;
    for (const it of list) {
      const s = toScreen(it.x, it.y);
      if (it.e) {
        const e = it.e;
        if (e.kind === 'missile') { drawMissile(e, s); continue; }
        const isMe = e.id === G.meId;
        const anim = isMe ? game.myAnim() : e.castUntil > now ? ANIM.cast : e.anim;
        const dir = isMe ? G.pred.dir : e.dir;
        const sel = G.selected === e.id || G.hover === e.id;
        const opts = {};
        if (sel) opts.outline = e.kind === 'monster' ? SEL_ENEMY : e.kind === 'npc' ? SEL_NPC : SEL_FRIEND;
        if (e.rarity === 'elite' || e.rarity === 'champion') opts.tint = ELITE_TINT;
        if (e.flashUntil > now) opts.flash = true;
        if (anim === ANIM.dead) opts.dead = true;
        const pose = e.kind === 'item' ? 'idle' : poseOf(e, anim, now);
        const hint = e.kind === 'item' ? 'item' : e.kind === 'object' ? 'prop' : 'actor';
        let artId = e.art;
        if (e.kind === 'item' && !art.has(artId)) { artId = 'item:' + (e.rarity || 'normal'); opts.tint = itemTint(e.rarity); }
        const f = art.frame(artId, pose, dirToTurn(dir || 0, theta), opts, hint);
        const hidden = e.cc.stealth || e.raw?.stealth;
        if (hidden) ctx.globalAlpha = 0.4;
        ctx.drawImage(f.canvas, s.x - f.ox, s.y - f.oy);
        ctx.globalAlpha = 1;
        draws++;
        drawnEnts.push({ e, px: s.x - f.ox, py: s.y - f.oy, f, s });
        if (isMe) { const fw = f.w ?? f.canvas.width, fh = f.h ?? f.canvas.height; meDraw = { f, s, cx: s.x - f.ox + fw / 2, cy: s.y - f.oy + fh / 2, hh: fh / 4, hidden: false }; }
      } else {
        // 地図の物の rot は度（0・90・180・270 など）
        const turn = it.wall ? theta : theta + ((it.rot || 0) * Math.PI) / 180;
        const f = art.frame(it.art, 'idle', turn, it.wall ? { outline: false, topLight: true } : {}, 'prop');
        const px = s.x - f.ox, py = s.y - f.oy;
        ctx.drawImage(f.canvas, px, py);
        draws++;
        // 自分より後に描いた壁の絵が、自分の体の真ん中（上・中・下の 3 点）を覆ったら、自分は壁に隠れている
        if (it.wall && meDraw && !meDraw.hidden && f.mask) {
          for (const dy of [-meDraw.hh, 0, meDraw.hh]) {
            const lx = Math.floor(meDraw.cx - px), ly = Math.floor(meDraw.cy + dy - py);
            if (lx >= 0 && ly >= 0 && lx < f.w && ly < f.h && f.mask[ly * f.w + lx] === 1) { meDraw.hidden = true; break; }
          }
        }
      }
    }
    stat.draws = draws;

    // 光らない粒（煙・土）
    drawParticles(false);
    // 暗さ
    drawLighting(list, now);
    // 壁の向こうの自分を薄く見せる（壁に隠れたときだけ。暗さの後に描く。先に描くと迷宮では暗さに消されて見えない）
    if (meDraw && meEnt && meDraw.hidden) {
      ctx.globalAlpha = 0.32;
      ctx.drawImage(meDraw.f.canvas, meDraw.s.x - meDraw.f.ox, meDraw.s.y - meDraw.f.oy);
      ctx.globalAlpha = 1;
    }
    // 光る粒、宝の光の柱
    drawBeams(now);
    drawParticles(true);
    // 体力の帯・状態異常・数字
    drawWorldUi(now);
    // 文字（名前・吹き出し・名札）
    drawOverlay(now);
    stat.frameMs = performance.now() - t0;
  }

  function itemTint(r) {
    const c = RARITIES[r]?.color || '#d8d4c8';
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }

  function drawMissile(e, s) {
    const col = /fire|ember/.test(e.art) ? TYPE_COLORS.fire : /ice|frost|cold/.test(e.art) ? TYPE_COLORS.cold : /shadow|bone|doom/.test(e.art) ? TYPE_COLORS.shadow : /holy/.test(e.art) ? TYPE_COLORS.holy : [240, 236, 220];
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillRect(s.x - 1, s.y - 9, 3, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x, s.y - 8, 1, 1);
    ctx.fillStyle = 'rgba(10,6,18,0.5)';
    ctx.fillRect(s.x - 1, s.y, 3, 1);
  }

  function ellipseDots(cx, cy, r, col, alpha = 1, step = 0.25) {
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
    const n = Math.max(12, Math.round(r * 16 * 6.28 * step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r * TILE_PX), Math.round(cy + Math.sin(a) * r * TILE_PX * SQUASH), 1, 1);
    }
  }
  // 前触れの印: 当たる範囲を地面に塗り、当たる時に近づくほど濃くする。敵の技は赤、自分の技は青
  function drawWarns() {
    for (const w of fx.warns) {
      const k = 1 - w.life / w.max;
      const col = w.hostile ? [230, 50, 40] : [90, 160, 255];
      const fill = `rgba(${col[0]},${col[1]},${col[2]},${(w.hostile ? 0.16 : 0.08) + k * (w.hostile ? 0.28 : 0.12)})`;
      ctx.fillStyle = fill;
      ctx.beginPath();
      if (w.shape === 'cone' || w.shape === 'line') {
        const [dx, dy] = vecFromDir(w.dir ?? 0);
        if (w.shape === 'line') {
          const L = w.len ?? 6, hw = (w.width ?? 1) / 2, nx = -dy, ny = dx;
          for (const [a, b] of [[0, -hw], [L, -hw], [L, hw], [0, hw]]) { const s = toScreen(w.x + dx * a + nx * b, w.y + dy * a + ny * b); ctx.lineTo(s.x, s.y); }
        } else {
          const R = w.r ?? 3, half = (((w.angle ?? 90) * Math.PI) / 180) / 2, base = Math.atan2(dy, dx);
          const c0 = toScreen(w.x, w.y); ctx.moveTo(c0.x, c0.y);
          for (let i = 0; i <= 12; i++) { const a = base - half + (2 * half * i) / 12; const s = toScreen(w.x + Math.cos(a) * R, w.y + Math.sin(a) * R); ctx.lineTo(s.x, s.y); }
        }
        ctx.closePath(); ctx.fill();
      } else {
        const s = toScreen(w.x, w.y), R = (w.r ?? 3) * TILE_PX;
        ctx.ellipse(s.x, s.y, R, R * SQUASH, 0, 0, Math.PI * 2); ctx.fill();
        // 縁の点線と、当たる時へ向けて広がる内側の輪
        ellipseDots(s.x, s.y, w.r ?? 3, col, 0.95, 0.5);
        ellipseDots(s.x, s.y, (w.r ?? 3) * k, col, 0.7, 0.35);
      }
    }
  }
  function drawGroundMarks(now) {
    drawWarns();
    for (const rg of fx.rings) {
      const k = 1 - rg.life / rg.max;
      const s = toScreen(rg.x, rg.y);
      ellipseDots(s.x, s.y, rg.r0 + (rg.r1 - rg.r0) * k, rg.col, rg.life / rg.max);
    }
    const sel = G.selected != null ? G.ents.get(G.selected) : null;
    if (sel) {
      const p = game.entPos(sel), s = toScreen(p.x, p.y);
      const col = sel.kind === 'monster' ? SEL_ENEMY : SEL_FRIEND;
      ellipseDots(s.x, s.y, 0.55 + Math.sin(now / 200) * 0.04, col, 0.9);
    }
    if (marker && marker.until > now) {
      const s = toScreen(marker.x, marker.y), k = (marker.until - now) / 500;
      ctx.fillStyle = `rgba(255,236,170,${k})`;
      const r = Math.round(3 + (1 - k) * 3);
      for (const [dx, dy] of [[-r, 0], [r, 0], [0, -Math.round(r * 0.75)], [0, Math.round(r * 0.75)]]) ctx.fillRect(s.x + dx, s.y + dy, 1, 1);
    }
  }

  function drawParticles(glow) {
    if (glow) ctx.globalCompositeOperation = 'lighter';
    for (const p of fx.parts) {
      if (!!p.glow !== glow) continue;
      const r = rel(p.x, p.y);
      const x = O.x + Math.round(r.x), y = O.y + Math.round(r.y - p.z);
      const a = Math.min(1, (p.life / p.max) * 1.6);
      ctx.fillStyle = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${a})`;
      ctx.fillRect(x, y, p.size, p.size);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBeams() {
    ctx.globalCompositeOperation = 'lighter';
    for (const b of fx.beams) {
      const s = toScreen(b.x, b.y), c = itemTint(b.col), k = b.life / b.max;
      for (let y = 0; y < 40; y++) {
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${k * (1 - y / 40) * 0.6})`;
        ctx.fillRect(s.x - 1, s.y - y, 2, 1);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function lightLevel() {
    const l = G.mapDef?.light;
    if (typeof l === 'number') return clamp(l, 0, 1);
    return LIGHT_LEVELS[l] ?? 0;
  }

  function drawLighting(list, now) {
    const base = lightLevel();
    if (base <= 0) return;
    // 夕暮れ・暗がりの色
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = base < 0.7 ? 'rgb(255,196,184)' : 'rgb(170,168,214)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    dark.fill(base);
    const lit = (x, y, rTiles, inten = 1) => {
      const s = toScreen(x, y);
      const R = rTiles * TILE_PX, Ry = R * SQUASH;
      const sx = s.x, sy = s.y - 6;
      const x0 = Math.max(0, Math.floor(sx - R)), x1 = Math.min(W - 1, Math.ceil(sx + R));
      const y0 = Math.max(0, Math.floor(sy - Ry)), y1 = Math.min(H - 1, Math.ceil(sy + Ry));
      if (x0 > x1 || y0 > y1) return;
      const invR = 1 / R;
      for (let y = y0; y <= y1; y++) {
        const dy = (y - sy) / SQUASH;
        let i = y * W + x0;
        for (let x = x0; x <= x1; x++, i++) {
          const dx = x - sx, d = Math.sqrt(dx * dx + dy * dy) * invR;
          if (d >= 1) continue;
          let L = 1 - d; L = L * L * (3 - 2 * L) * inten;
          const v = base * (1 - L);
          if (v < dark[i]) dark[i] = v;
        }
      }
    };
    const myLight = 7 + (G.me.lightRadius ?? G.me.stats?.lightRadius ?? 0) / 20 + (G.me.torch ? 3 : 0);
    if (G.pred.has) lit(G.pred.x, G.pred.y, myLight, 1);
    for (const it of list) {
      if (it.e) {
        const e = it.e;
        if (e.kind === 'player' && e.id !== G.meId) lit(it.x, it.y, 4, 0.9);
        else if (e.kind === 'missile') lit(it.x, it.y, 2.2, 0.8);
        else if (e.kind === 'object' && LIGHT_PROPS[e.art]) lit(it.x, it.y, LIGHT_PROPS[e.art][0], LIGHT_PROPS[e.art][1]);
      } else if (it.prop && LIGHT_PROPS[it.art]) {
        const [r, k] = LIGHT_PROPS[it.art];
        if (r > 0) lit(it.x, it.y, r * (1 + Math.sin(now / 130 + it.x) * 0.04), k);
      }
    }
    for (const l of fx.lights) lit(l.x, l.y, l.r, l.life / l.max);
    // 網目で段にする（Bayer 4×4）
    const d = lightImg.data;
    const col = base < 0.7 ? [24, 12, 34] : [4, 4, 10];
    for (let y = 0, i = 0; y < H; y++) {
      const by = (y & 3) << 2;
      for (let x = 0; x < W; x++, i++) {
        const lv = Math.floor(dark[i] * 4 + (BAYER4[by | (x & 3)] + 0.5) / 16) / 4;
        const p = i * 4;
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = lv >= 1 ? 250 : lv * 255;
      }
    }
    lightCtx.putImageData(lightImg, 0, 0);
    ctx.drawImage(lightCv, 0, 0);
  }

  function drawWorldUi(now) {
    for (const de of drawnEnts) {
      const e = de.e;
      const topY = de.py + de.f.top;
      if ((e.kind === 'monster' || (e.kind === 'player' && e.id !== G.meId)) && e.anim !== ANIM.dead && (e.hp < 100 || G.hover === e.id || G.selected === e.id)) {
        const w = e.raw?.boss ? 30 : 14, x = de.s.x - (w >> 1), y = topY - 4;
        ctx.fillStyle = 'rgb(16,10,20)'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
        ctx.fillStyle = 'rgb(70,20,24)'; ctx.fillRect(x, y, w, 2);
        ctx.fillStyle = e.kind === 'player' ? 'rgb(110,230,120)' : 'rgb(226,58,52)'; ctx.fillRect(x, y, Math.max(0, Math.round((w * e.hp) / 100)), 2);
      }
      let cx = de.s.x - (Object.keys(e.cc).length - 1) * 4;
      for (const k of Object.keys(e.cc)) cx += drawCcIcon(ctx, k, cx, topY - 7, now / 1000) ? 8 : 0;
    }
    for (const n of fx.numbers) {
      const r = rel(n.x, n.y);
      const k = n.life / n.max;
      drawPixelText(ctx, n.text, O.x + r.x, O.y + r.y - n.z - (n.big ? 6 : 0), n.big ? [255, 236, 120] : n.col, n.big ? 2 : 1, Math.min(1, k * 2));
    }
  }

  /* ---------------- 文字（端末の解像度） ---------------- */
  function drawOverlay(now) {
    const k = scale;
    const font = (px, w = 600) => `${w} ${Math.round(px * dpr)}px system-ui, "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif`;
    octx.textAlign = 'center';
    octx.textBaseline = 'bottom';
    octx.lineJoin = 'round';
    const showNames = settings.get('names');
    for (const de of drawnEnts) {
      const e = de.e;
      const x = de.s.x * k, y = (de.py + de.f.top - (e.kind === 'monster' ? 6 : 3)) * k;
      let name = null, col = '#f2ede0';
      if (e.kind === 'player') { name = showNames && e.id !== G.meId ? e.name : null; }
      else if (e.kind === 'npc') { name = e.name; col = '#ffe3a0'; }
      else if (e.kind === 'monster' && (G.hover === e.id || G.selected === e.id)) { name = `${e.name}${e.level != null ? ` Lv${e.level}` : ''}`; col = e.rarity === 'elite' ? '#d6b4ff' : e.raw?.boss ? '#ff9b6a' : '#ffd0c4'; }
      else if (e.kind === 'object' && G.hover === e.id) { name = e.name; }
      if (name) {
        octx.font = font(12);
        octx.lineWidth = 3 * dpr; octx.strokeStyle = 'rgba(12,8,16,0.9)';
        octx.strokeText(name, x, y); octx.fillStyle = col; octx.fillText(name, x, y);
      }
      if (e.kind === 'item') {
        const text = e.name || 'アイテム';
        octx.font = font(11, 500);
        const w = octx.measureText(text).width + 8 * dpr, h = 16 * dpr;
        const lx = x - w / 2, ly = de.s.y * k - 14 * k - h;
        const hov = G.hover === e.id;
        octx.fillStyle = hov ? 'rgba(40,30,50,0.95)' : 'rgba(14,10,18,0.78)';
        octx.fillRect(lx, ly, w, h);
        octx.strokeStyle = hov ? '#fff' : 'rgba(255,255,255,0.18)'; octx.lineWidth = 1 * dpr; octx.strokeRect(lx + 0.5, ly + 0.5, w - 1, h - 1);
        octx.fillStyle = RARITIES[e.rarity]?.color || '#d8d4c8';
        octx.fillText(text, x, ly + h - 3 * dpr);
        labels.push({ e, x0: lx, y0: ly, x1: lx + w, y1: ly + h });
      }
    }
    for (const t of fx.texts) {
      const r = rel(t.x, t.y);
      const a = Math.min(1, (t.life / t.max) * 2);
      octx.globalAlpha = a;
      octx.font = font(13, 700);
      octx.lineWidth = 3 * dpr; octx.strokeStyle = 'rgba(12,8,16,0.9)';
      const x = (O.x + r.x) * k, y = (O.y + r.y - t.z) * k;
      octx.strokeText(t.text, x, y); octx.fillStyle = `rgb(${t.col[0]},${t.col[1]},${t.col[2]})`; octx.fillText(t.text, x, y);
      octx.globalAlpha = 1;
    }
  }
  /* ---------------- 選ぶ ---------------- */
  // cx, cy は画面（CSS）の位置。戻り値は物、無ければ null
  function pick(cx, cy) {
    const dx = cx * dpr, dy = cy * dpr;
    for (let i = labels.length - 1; i >= 0; i--) { const l = labels[i]; if (dx >= l.x0 && dx <= l.x1 && dy >= l.y0 && dy <= l.y1) return l.e; }
    const ax = Math.floor(dx / scale), ay = Math.floor(dy / scale);
    for (let i = drawnEnts.length - 1; i >= 0; i--) {
      const de = drawnEnts[i];
      if (de.e.id === G.meId || de.e.anim === ANIM.dead && de.e.kind !== 'item') continue;
      const lx = ax - de.px, ly = ay - de.py;
      if (lx < 0 || ly < 0 || lx >= de.f.w || ly >= de.f.h) continue;
      if (de.f.mask[ly * de.f.w + lx]) return de.e;
    }
    // 小さな物と町の人は足元の近くでも選べる（細い絵の隙間を押しても外れないように）
    let best = null, bd = 7;
    for (const de of drawnEnts) {
      if (de.e.id === G.meId || (de.e.kind !== 'monster' && de.e.kind !== 'item' && de.e.kind !== 'npc') || de.e.anim === ANIM.dead) continue;
      const d = Math.hypot(ax - de.s.x, ay - (de.s.y - 6));
      if (d < bd) { bd = d; best = de.e; }
    }
    return best;
  }
  function screenToMap(cx, cy) {
    const ax = (cx * dpr) / scale, ay = (cy * dpr) / scale;
    return screenToWorld(ax - O.x, ay - O.y, { x: 0, y: 0 }, theta);
  }

  return {
    resize, frame, pick, screenToMap, stat,
    rotate(step) { thetaTarget += step * Math.PI / 2; log('view.rotate', { step, deg: Math.round((thetaTarget * 180) / Math.PI) }); },
    get theta() { return theta; },
    get scale() { return scale; },
    get mini() { return mini; },
    get cam() { return { x: camX, y: camY }; },
    setMarker(x, y) { marker = { x, y, until: performance.now() + 500 }; },
    // 地図の位置 → 画面（CSS）の位置。lift は足元から上へずらすドット数（絵の解像度）
    toCss(x, y, lift = 0) { const r = rel(x, y); return { x: ((O.x + r.x) * scale) / dpr, y: ((O.y + r.y - lift) * scale) / dpr }; },
    get size() { return { W, H, scale, dpr }; },
  };
}
