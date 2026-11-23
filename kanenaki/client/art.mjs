// 絵の部品: 目録（assets/manifest.json）の読み込み、絵が無い id の仮のスライス、重ねて描いて焼き付ける処理。
// 重ね描きの数字はスキル sprite-stacking のとおり: 縦の縮み 0.75、1 枚ごとに 1 ドット持ち上げ、整数の位置、
// 最近傍、輪郭は焼き付けた後に 1 回だけ、影は足元の形を日の向きへずらし、縁を Bayer の網目にする。
import { TILE_PX } from '../shared/schema.mjs';
import { SQUASH, SPACING, hashStr, rng, ditherOn, clamp } from './core.mjs';

const TURN_STEPS = 64; // 焼き付けの角度の刻み（5.625°）。止まっているときの角度（22.5° の倍数）はちょうど乗る

export function createArt({ base = './', log = () => {} } = {}) {
  let manifest = { version: 1, tile: TILE_PX, art: {} };
  const sheets = new Map();   // `${id}|${pose}` → { w, h, count, slices, anchor, real }
  const loading = new Set();
  const bakes = new Map();
  const tiles = new Map();
  let bakeCount = 0;

  async function load() {
    try {
      const res = await fetch(new URL('assets/manifest.json', new URL(base, location.href)), { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      manifest = await res.json();
      manifest.art ||= {};
      log('art.manifest', { count: Object.keys(manifest.art).length }, 'ok');
    } catch (e) {
      log('art.manifest', {}, 'missing:' + e.message);
    }
  }
  const info = (id) => manifest.art[id] || null;

  function loadSheet(id, pose, p) {
    const key = `${id}|${pose}`;
    if (loading.has(key)) return;
    loading.add(key);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const count = p.count || Math.max(1, Math.round(img.width / (p.w || img.height)));
        const w = p.w || Math.floor(img.width / count), h = p.h || img.height;
        const cv = new OffscreenCanvas(img.width, img.height), cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0);
        const slices = [];
        for (let z = 0; z < count; z++) slices.push(cx.getImageData(z * w, 0, w, h).data);
        const a = info(id)?.anchor;
        sheets.set(key, { w, h, count, slices, anchor: a ? [a[0], a[1]] : null, real: true });
        for (const k of [...bakes.keys()]) if (k.startsWith(key + '|')) bakes.delete(k);
        log('art.sheet', { id, pose, w, h, count }, 'ok');
      } catch (e) { log('art.sheet', { id, pose }, 'error:' + e.message); }
    };
    img.onerror = () => log('art.sheet', { id, pose, file: p.file }, 'error:load');
    img.src = new URL(p.file, new URL(base, location.href)).href;
  }

  // 重ねる元のスライス。目録に無ければ仮の箱
  function sheet(id, pose = 'idle', hint) {
    const a = info(id);
    if (a && a.kind !== 'tile') {
      const p = a.poses?.[pose] || a.poses?.idle;
      const usePose = a.poses?.[pose] ? pose : 'idle';
      if (p?.file) {
        const s = sheets.get(`${id}|${usePose}`);
        if (s) return s;
        loadSheet(id, usePose, p);
      }
    }
    const key = `${id}|${pose}|ph`;
    let s = sheets.get(key);
    if (!s) { s = placeholder(id, pose, hint); sheets.set(key, s); }
    return s;
  }

  // 床の 16×16 の模様（canvas）
  function tile(id) {
    let t = tiles.get(id);
    if (t) return t;
    const a = info(id);
    const p = a?.poses?.idle;
    if (p?.file) {
      const key = `tile|${id}`;
      if (!loading.has(key)) {
        loading.add(key);
        const img = new Image();
        img.onload = () => {
          const cv = new OffscreenCanvas(TILE_PX, TILE_PX);
          cv.getContext('2d').drawImage(img, 0, 0, p.w || TILE_PX, p.h || TILE_PX, 0, 0, TILE_PX, TILE_PX);
          tiles.set(id, cv); onTileLoaded?.(id);
        };
        img.src = new URL(p.file, new URL(base, location.href)).href;
      }
    }
    t = placeholderTile(id);
    tiles.set(id, t);
    return t;
  }
  let onTileLoaded = null;

  // 焼き付けた 1 枚。opts: { outline:[r,g,b], tint:[r,g,b], flash, dead, shadow, spacing }
  function frame(id, pose, turn, opts = {}, hint) {
    const s = sheet(id, pose, hint);
    const q = ((Math.round((turn / (Math.PI * 2)) * TURN_STEPS) % TURN_STEPS) + TURN_STEPS) % TURN_STEPS;
    const key = `${id}|${pose}|${s.real ? 'r' : 'p'}|${q}|${opts.outline === false ? 'none' : opts.outline || ''}|${opts.tint || ''}|${opts.flash ? 1 : 0}|${opts.dead ? 1 : 0}|${opts.shadow === false ? 0 : 1}|${opts.spacing ?? ''}|${opts.topLight ? 1 : 0}`;
    let f = bakes.get(key);
    if (!f) {
      if (bakes.size > 4000) bakes.clear();
      f = bake(s, (q / TURN_STEPS) * Math.PI * 2, opts);
      bakes.set(key, f);
      bakeCount++;
    }
    return f;
  }

  return {
    load, info, sheet, tile, frame,
    set onTileLoaded(fn) { onTileLoaded = fn; },
    get bakeCount() { return bakeCount; },
    get cacheSize() { return bakes.size; },
    has: (id) => !!info(id),
  };
}

/* ---------------- 焼き付け（スキルの viewer.html の renderStackBuffer と同じ考え方） ---------------- */
const OUTLINE = [22, 18, 30];
export function bake(s, angle, opts = {}) {
  const { w, h, count, slices } = s;
  const spacing = opts.dead ? 0.25 : (opts.spacing ?? SPACING);
  // 目録の anchor は [w/2, h/2]（回転の中心と足元の中心）。ドットの番号ではなく位置なので、そのまま使う
  const ax = s.anchor ? s.anchor[0] : w * 0.5, ay = s.anchor ? s.anchor[1] : h * 0.5;
  const reach = Math.ceil(Math.hypot(Math.max(ax, w - ax), Math.max(ay, h - ay))) + 2;
  const lift = Math.ceil((count - 1) * spacing);
  const shadowLen = opts.shadow === false ? 0 : Math.ceil(count * 0.5) + 3;
  const cw = reach * 2 + 4 + shadowLen;
  const ch = Math.ceil(reach * 2 * SQUASH) + lift + 6 + Math.ceil(shadowLen * 0.5);
  const cx = reach + 2, baseY = lift + 3 + Math.ceil(reach * SQUASH);
  const ca = Math.cos(angle), sa = Math.sin(angle), inv = 1 / SQUASH;
  const body = new Uint8ClampedArray(cw * ch * 4);
  const mask = new Uint8Array(cw * ch);
  const shadow = new Uint8Array(cw * ch);
  const tint = opts.tint, flash = opts.flash, dark = opts.dead ? 0.6 : 1;
  // topLight: 上の 2 枚を明るくする（暗い迷宮でも壁の上の面と通路の形が分かるように）
  const topFrom = opts.topLight ? count - 2 : Infinity;
  const xMin = Math.max(0, cx - reach - 1), xMax = Math.min(cw - 1, cx + reach + 1);

  for (let z = 0; z < count; z++) {
    const sl = slices[z];
    const yCenter = baseY - Math.round(z * spacing);
    const yMin = Math.max(0, Math.floor(yCenter - reach * SQUASH) - 1), yMax = Math.min(ch - 1, Math.ceil(yCenter + reach * SQUASH) + 1);
    // 影: 地面の高さで、日の向き（画面の右下）へ z に応じてずらす
    const shx = shadowLen ? Math.round(z * 0.5) : 0, shy = shadowLen ? Math.round(z * 0.25) : 0;
    for (let y = yMin; y <= yMax; y++) {
      const dy = (y - yCenter) * inv;
      for (let x = xMin; x <= xMax; x++) {
        const dx = x - cx;
        const sx = Math.floor(dx * ca + dy * sa + ax), sy = Math.floor(-dx * sa + dy * ca + ay);
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
        const sp = (sy * w + sx) * 4;
        if (sl[sp + 3] < 128) continue;
        const idx = y * cw + x, dp = idx * 4;
        let r = sl[sp], g = sl[sp + 1], b = sl[sp + 2];
        if (tint) { r = (r * tint[0]) / 255; g = (g * tint[1]) / 255; b = (b * tint[2]) / 255; }
        if (flash) { r = r + (255 - r) * 0.6; g = g + (255 - g) * 0.6; b = b + (255 - b) * 0.6; }
        if (z >= topFrom) { r = r * 1.25 + 28; g = g * 1.25 + 28; b = b * 1.25 + 32; }
        body[dp] = r * dark; body[dp + 1] = g * dark; body[dp + 2] = b * dark; body[dp + 3] = 255;
        mask[idx] = 1;
        if (shadowLen) {
          const gy = y + Math.round(z * spacing) + shy, gx = x + shx;
          if (gx < cw && gy < ch) shadow[gy * cw + gx] = 1;
        }
      }
    }
  }
  const out = new Uint8ClampedArray(cw * ch * 4);
  // 影（縁は網目）
  if (shadowLen) {
    for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x;
      if (!shadow[i] || mask[i]) continue;
      const edge = !shadow[i - 1] || !shadow[i + 1] || !shadow[i - cw] || !shadow[i + cw];
      if (edge && !ditherOn(0.5, x, y)) continue;
      const p = i * 4;
      out[p] = 10; out[p + 1] = 6; out[p + 2] = 18; out[p + 3] = 110;
    }
  }
  // 輪郭は全体に 1 回だけ（壁は隣どうしがつながるように輪郭なし）
  const oc = opts.outline || OUTLINE;
  if (opts.outline !== false) for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
    const i = y * cw + x;
    if (mask[i]) continue;
    // 体（1）の隣だけ。いま付けた輪郭（2）を体と見なすと、輪郭が右下へ広がって四角になる
    if (mask[i - 1] === 1 || mask[i + 1] === 1 || mask[i - cw] === 1 || mask[i + cw] === 1) {
      const p = i * 4;
      out[p] = oc[0]; out[p + 1] = oc[1]; out[p + 2] = oc[2]; out[p + 3] = 255;
      mask[i] = 2; // 輪郭も選ぶときの当たりに含める
    }
  }
  for (let i = 0; i < cw * ch; i++) {
    if (mask[i] !== 1) continue;
    const p = i * 4;
    out[p] = body[p]; out[p + 1] = body[p + 1]; out[p + 2] = body[p + 2]; out[p + 3] = 255;
  }
  const canvas = new OffscreenCanvas(cw, ch);
  canvas.getContext('2d').putImageData(new ImageData(out, cw, ch), 0, 0);
  return { canvas, w: cw, h: ch, ox: cx, oy: baseY, mask, top: baseY - lift - Math.ceil(reach * SQUASH) };
}

/* ---------------- 仮のスライス（絵の係の絵が届くまでの代わり） ---------------- */
// vox(w, h, count, fn) : fn(x, y, z) が [r,g,b] を返す所を塗る
function vox(w, h, count, fn, anchor = null) {
  const slices = [];
  for (let z = 0; z < count; z++) {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = fn(x, y, z);
      if (!c) continue;
      const p = (y * w + x) * 4;
      const shade = 0.72 + 0.28 * (z / Math.max(1, count - 1));
      d[p] = clamp(c[0] * shade, 0, 255); d[p + 1] = clamp(c[1] * shade, 0, 255); d[p + 2] = clamp(c[2] * shade, 0, 255); d[p + 3] = 255;
    }
    slices.push(d);
  }
  return { w, h, count, slices, anchor, real: false };
}
const ell = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const mix = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const hsl = (hh, s, l) => {
  const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + hh / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};

const CLASS_COLORS = {
  adventurer: [150, 108, 64], swordsman: [86, 112, 168], warrior: [158, 62, 52], rogue: [62, 96, 66],
  priest: [214, 204, 172], necromancer: [86, 52, 108], monk: [204, 132, 52],
};
const SKIN = [226, 186, 146], HAIR = [70, 48, 36], STEEL = [196, 204, 214], GLOW = [255, 236, 150];

function humanoid({ body, head = SKIN, hair = HAIR, pose = 'idle', w = 12, count = 20, robe = false, bone = false, scale = 1 }) {
  const c = w / 2, legTop = Math.round(6 * scale), torsoTop = Math.round(13 * scale), headTop = count;
  const walk = pose === 'walk1' ? 1 : pose === 'walk2' ? -1 : 0;
  return vox(w, w, count, (x, y, z) => {
    // 足
    if (z < legTop && !robe) {
      const lx = c - 2, rx = c + 1, ly = c - 0.5 + walk, ry = c - 0.5 - walk;
      if ((Math.abs(x + 0.5 - lx) <= 1 && Math.abs(y + 0.5 - ly - 0.5) <= 1) || (Math.abs(x + 0.5 - rx - 0.5) <= 1 && Math.abs(y + 0.5 - ry - 0.5) <= 1)) return z < 2 ? mix(body, 0.45) : mix(body, 0.7);
      return null;
    }
    if (z < legTop && robe) return ell(x, y, c, c, 3.6 + (legTop - z) * 0.15, 3.2) ? mix(body, 0.85) : null;
    // 胴
    if (z < torsoTop) {
      if (ell(x, y, c, c, 3.6, 2.8)) return bone && (x + z) % 3 === 0 ? mix(body, 0.7) : body;
      // 腕（横）
      const armZ = z >= torsoTop - 6;
      if (armZ && Math.abs(y + 0.5 - c) <= 1 && (Math.abs(x + 0.5 - (c - 4.5)) <= 0.9 || Math.abs(x + 0.5 - (c + 4.5)) <= 0.9)) {
        if (pose === 'attack' && x > c) return null;
        return mix(body, 0.85);
      }
      // 攻撃: 右手を前へ（武器）
      if (pose === 'attack' && z >= torsoTop - 4 && z <= torsoTop - 3 && Math.abs(x + 0.5 - (c + 2.5)) <= 0.9 && y + 0.5 > c && y + 0.5 <= c + 6) return y + 0.5 > c + 2 ? STEEL : mix(body, 0.85);
      return null;
    }
    // 頭
    const hz = z - torsoTop;
    if (hz < 6) {
      if (ell(x, y, c, c, 2.6, 2.6)) {
        if (hz >= 4) return hair;
        if (hz === 2 && y + 0.5 > c + 1.2 && Math.abs(x + 0.5 - c) >= 0.8 && Math.abs(x + 0.5 - c) <= 1.6) return [30, 24, 30]; // 目（前）
        return head;
      }
      // 詠唱: 両手を上げる
      if (pose === 'cast' && hz >= 3 && Math.abs(y + 0.5 - c) <= 1 && (Math.abs(x + 0.5 - (c - 4)) <= 0.9 || Math.abs(x + 0.5 - (c + 4)) <= 0.9)) return hz === 5 ? GLOW : mix(body, 0.85);
      return null;
    }
    return null;
  });
}

function beast({ body, pose = 'idle', w = 14, count = 9, long = 1 }) {
  const c = w / 2, walk = pose === 'walk1' ? 1 : pose === 'walk2' ? -1 : 0;
  return vox(w, w, count, (x, y, z) => {
    if (z < 3) { // 足 4 本
      for (const [lx, ly] of [[c - 2, c - 3 * long + walk], [c + 1, c - 3 * long - walk], [c - 2, c + 2 * long - walk], [c + 1, c + 2 * long + walk]]) if (Math.abs(x + 0.5 - lx - 0.5) <= 0.9 && Math.abs(y + 0.5 - ly - 0.5) <= 0.9) return mix(body, 0.6);
      return null;
    }
    if (z < 7 && ell(x, y, c, c, 2.8, 4.2 * long)) return body;
    // 頭（前 = +y）
    const hy = c + 4.5 * long + (pose === 'attack' ? 1.5 : 0);
    if (z >= 4 && z < count && ell(x, y, c, hy, 2.2, 2)) return z === count - 2 && Math.abs(x + 0.5 - c) > 0.9 ? [240, 220, 120] : mix(body, 1.1);
    return null;
  });
}

function placeholder(id, pose, hint) {
  const h = hashStr(id), r = rng(h);
  const hue = h % 360;
  const col = hsl(hue, 0.45, 0.45);
  // 職業
  if (CLASS_COLORS[id]) return humanoid({ body: CLASS_COLORS[id], pose, robe: id === 'priest' || id === 'necromancer' });
  if (id.startsWith('npc_master_')) {
    const cls = id.slice('npc_master_'.length);
    return humanoid({ body: mix(CLASS_COLORS[cls] || col, 0.8), pose, hair: [200, 200, 200], robe: cls === 'priest' || cls === 'necromancer' });
  }
  if (id.startsWith('npc_')) return humanoid({ body: hsl(hue, 0.35, 0.5), pose, robe: /innkeeper|apothecary|warp/.test(id), hair: hsl((hue + 180) % 360, 0.3, 0.3) });
  // 魔物
  if (/dog|crow|toad|leech/.test(id)) {
    const body = /dog/.test(id) ? [120, 96, 70] : /crow/.test(id) ? [52, 48, 64] : /toad/.test(id) ? [96, 140, 70] : [110, 60, 70];
    return beast({ body, pose, w: /leech|crow/.test(id) ? 12 : 14, count: /toad|leech/.test(id) ? 6 : 9, long: /toad/.test(id) ? 0.7 : 1 });
  }
  if (/imp/.test(id)) return humanoid({ body: [104, 84, 56], head: [130, 106, 70], hair: [80, 60, 40], pose, w: 10, count: 14, scale: 0.7 });
  if (/skeleton|bone/.test(id)) return humanoid({ body: [214, 208, 186], head: [230, 226, 206], hair: [214, 208, 186], pose, bone: true });
  if (/wight|ghoul/.test(id)) return humanoid({ body: [92, 112, 104], head: [150, 170, 150], hair: [60, 70, 66], pose });
  if (/witch|acolyte/.test(id)) return humanoid({ body: /witch/.test(id) ? [90, 70, 120] : [120, 40, 50], head: [190, 190, 200], hair: [30, 30, 40], pose, robe: true });
  if (/sentinel/.test(id)) return humanoid({ body: [176, 128, 66], head: [190, 140, 80], hair: [150, 110, 60], pose, w: 16, count: 26, scale: 1.3 });
  if (/warden/.test(id)) return bellBoss(pose);
  // 物
  if (id.startsWith('tree_')) return treePh(id, h);
  if (id.startsWith('rock')) {
    const big = id.endsWith('a');
    const w = big ? 14 : 10, n = big ? 8 : 6, c = w / 2;
    return vox(w, w, n, (x, y, z) => (ell(x, y, c + (z % 2) * 0.3, c, c - 0.5 - z * 0.45, c - 1 - z * 0.35) ? ((x * 7 + y * 3 + z) % 5 ? [128, 124, 120] : [104, 100, 98]) : null));
  }
  if (id.startsWith('house')) return housePh(id, h);
  if (id === 'belltower_ruin') return towerPh(r);
  if (id === 'fence') return vox(16, 4, 8, (x, y, z) => ((x % 7 < 2 && y >= 1 && y <= 2) || ((z === 3 || z === 6) && y >= 1 && y <= 2) ? [120, 90, 58] : null));
  if (id === 'grave') return vox(8, 4, 11, (x, y, z) => (y >= 1 && y <= 2 && x >= 1 && x <= 6 && !(z >= 9 && (x === 1 || x === 6)) ? (z === 7 && x > 2 && x < 5 ? [90, 90, 96] : [140, 140, 148]) : null));
  if (id === 'crate') return vox(10, 10, 10, (x, y, z) => { const e = x === 0 || x === 9 || y === 0 || y === 9; return e && (z === 0 || z === 9 || x === y || x + y === 9 || (x === 0 || x === 9) && (y === 0 || y === 9)) ? [110, 76, 40] : [160, 116, 66]; });
  if (id === 'barrel') return vox(10, 10, 12, (x, y, z) => (ell(x, y, 5, 5, 4 + (z > 2 && z < 9 ? 0.6 : 0), 4 + (z > 2 && z < 9 ? 0.6 : 0)) ? (z === 2 || z === 9 ? [80, 80, 86] : [134, 92, 52]) : null));
  if (id === 'chest') return vox(12, 8, 9, (x, y, z) => (x >= 1 && x <= 10 && y >= 1 && y <= 6 ? (z === 5 || x === 1 || x === 10 ? [216, 176, 70] : [120, 70, 40]) : null));
  if (id === 'torch') return vox(6, 6, 16, (x, y, z) => (z < 11 ? (x >= 2 && x <= 3 && y >= 2 && y <= 3 ? [96, 70, 44] : null) : ell(x, y, 3, 3, 2.2 - (z - 11) * 0.3, 2.2 - (z - 11) * 0.3) ? (z > 13 ? [255, 236, 140] : [255, 150, 50]) : null));
  if (id === 'brazier') return vox(12, 12, 12, (x, y, z) => (z < 4 ? ((x === 3 || x === 8) && (y === 3 || y === 8) ? [70, 60, 60] : null) : z < 7 ? (ell(x, y, 6, 6, 5, 5) ? [96, 86, 84] : null) : ell(x, y, 6, 6, 3.5 - (z - 7) * 0.6, 3.5 - (z - 7) * 0.6) ? (z > 9 ? [255, 236, 140] : [255, 140, 40]) : null));
  if (id === 'bell_shard') return vox(8, 8, 5, (x, y, z) => (ell(x, y, 4, 4, 3 - z * 0.4, 2) && (x + y) % 5 ? [196, 146, 70] : null));
  if (id === 'warp_pad') return vox(16, 16, 3, (x, y, z) => { if (!ell(x, y, 8, 8, 7.5, 7.5)) return null; if (z === 2) return ell(x, y, 8, 8, 5, 5) && !ell(x, y, 8, 8, 3.6, 3.6) ? [140, 220, 255] : null; return [110, 110, 130]; });
  if (id === 'wall_town') return vox(16, 16, 22, (x, y, z) => (z >= 20 ? [168, 160, 150] : ((z % 4 === 0) || ((x + (Math.floor(z / 4) % 2) * 4) % 8 === 0) || ((y + (Math.floor(z / 4) % 2) * 4) % 8 === 0) ? [104, 98, 94] : [140, 132, 124])));
  if (id === 'wall_dungeon') return vox(16, 16, 26, (x, y, z) => (z >= 24 ? [76, 72, 84] : ((z % 5 === 0) || ((x + (Math.floor(z / 5) % 2) * 5) % 10 === 0) || ((y + (Math.floor(z / 5) % 2) * 5) % 10 === 0) ? [40, 38, 48] : [62, 58, 70])));
  if (id === 'door') return vox(16, 4, 20, (x, y, z) => (y >= 1 && y <= 2 ? (x === 0 || x === 15 || z === 19 ? [70, 60, 56] : x % 4 === 0 ? [90, 60, 36] : [124, 84, 48]) : null));
  if (hint === 'item') return vox(8, 8, 4, (x, y, z) => (ell(x, y, 4, 4, 3, 3) ? (z === 3 ? [255, 240, 180] : col) : null));
  // 分からない物: 色付きの箱
  const isActor = hint === 'actor';
  return isActor ? humanoid({ body: col, pose }) : vox(12, 12, 12, (x, y, z) => (x > 0 && x < 11 && y > 0 && y < 11 ? (z === 11 ? mix(col, 1.25) : col) : null));
}

function bellBoss(pose) {
  // 大きな鐘の形をした亡者（ボス）
  const w = 26, n = 36, c = w / 2;
  const raise = pose === 'attack' ? 2 : 0;
  return vox(w, w, n, (x, y, z) => {
    if (z < 26) {
      const rr = 11 - (z / 26) ** 1.6 * 6.5;
      if (ell(x, y, c, c, rr, rr)) {
        if (z < 2) return [110, 80, 40];
        if (z === 6 || z === 7) return [220, 170, 80];
        return (x + z) % 7 === 0 ? [120, 92, 48] : [158, 118, 58];
      }
      return null;
    }
    const hz = z - 26;
    if (ell(x, y, c, c, 3.5, 3.5)) return hz === 4 && y > c + 1 && Math.abs(x + 0.5 - c) > 0.8 ? [140, 255, 200] : [80, 96, 90];
    if (hz < 3 + raise && Math.abs(y + 0.5 - c) < 1 && Math.abs(Math.abs(x + 0.5 - c) - 7) < 1.2) return [96, 110, 100];
    return null;
  });
}

function treePh(id, h) {
  if (id === 'tree_pine') {
    return vox(14, 14, 30, (x, y, z) => {
      if (z < 6) return ell(x, y, 7, 7, 1.3, 1.3) ? [92, 64, 40] : null;
      const rr = 6.5 * (1 - (z - 6) / 25) + ((z - 6) % 6 < 2 ? 0.6 : 0);
      return ell(x, y, 7, 7, rr, rr) ? ((x + y + z) % 4 ? [44, 92, 60] : [34, 72, 50]) : null;
    });
  }
  if (id === 'tree_dead') {
    return vox(14, 14, 24, (x, y, z) => {
      if (ell(x, y, 7, 7, 1.4, 1.4)) return [96, 84, 74];
      const b = [[10, 1, 0], [14, -1, 1], [18, 0, -1], [21, 1, 1]];
      for (const [bz, dx, dy] of b) if (z >= bz && z <= bz + 1) { const k = (z - bz + 2); const tx = 7 + dx * k * 1.5, ty = 7 + dy * k * 1.5; if (Math.abs(x + 0.5 - tx) <= 1 && Math.abs(y + 0.5 - ty) <= 1) return [86, 76, 68]; }
      return null;
    });
  }
  return vox(18, 18, 26, (x, y, z) => {
    if (z < 9) return ell(x, y, 9, 9, 1.6, 1.6) ? [98, 70, 44] : null;
    const zz = (z - 17) / 9;
    const rr = 8.2 * Math.sqrt(Math.max(0, 1 - zz * zz));
    if (ell(x, y, 9, 9, rr, rr)) return (x * 3 + y * 5 + z * 7 + h) % 9 < 2 ? [56, 108, 50] : (z > 21 ? [96, 150, 70] : [70, 126, 58]);
    return null;
  });
}

function housePh(id, h) {
  const v = id.endsWith('a') ? 0 : id.endsWith('b') ? 1 : 2;
  const W = 40, D = 34, n = 34, wallH = 18;
  const wallC = [[196, 180, 150], [160, 120, 84], [150, 150, 160]][v], roofC = [[150, 64, 52], [70, 80, 110], [90, 100, 70]][v];
  return vox(W, D, n, (x, y, z) => {
    if (z < wallH) {
      if (x < 2 || x > W - 3 || y < 2 || y > D - 3) return null;
      // 前（+y）の戸と窓
      if (y === D - 3 && x >= W / 2 - 3 && x <= W / 2 + 2 && z < 10) return [70, 46, 30];
      if ((y === D - 3 || x === 2 || x === W - 3) && z >= 9 && z <= 12 && (x % 9 === 4 || y % 9 === 4)) return [250, 214, 120];
      if (z % 6 === 0 || x === 2 || x === W - 3) return mix(wallC, 0.8);
      return wallC;
    }
    // 切妻の屋根（x 方向に棟）
    const rz = z - wallH, half = D / 2;
    const reach = half + 1 - rz * 1.15;
    if (reach <= 0.5) return null;
    if (Math.abs(y + 0.5 - half) <= reach && x >= 0 && x < W) return Math.abs(y + 0.5 - half) > reach - 1.2 ? mix(roofC, 1.15) : (rz % 3 === 0 ? mix(roofC, 0.8) : roofC);
    return null;
  }, [W / 2, D / 2]);
}

function towerPh(r) {
  const W = 32, n = 60, c = W / 2;
  const tops = Array.from({ length: 16 }, () => 30 + Math.floor(r() * 30));
  return vox(W, W, n, (x, y, z) => {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    if (d > 14 || d < 10) return z < 2 && d <= 14 ? [70, 66, 74] : null;
    const seg = Math.floor(((Math.atan2(y - c, x - c) + Math.PI) / (Math.PI * 2)) * 16) % 16;
    if (z > tops[seg]) return null;
    if (z > 40 && z < 48 && seg % 4 === 1) return null; // 鐘を吊る窓
    return (z % 5 === 0) ? [84, 80, 92] : [112, 106, 118];
  });
}

/* ---------------- 仮の床の模様 ---------------- */
const TILE_BASE = {
  grass: [[64, 104, 54], [72, 116, 58], [56, 92, 50], [90, 130, 64]],
  dirt: [[110, 86, 60], [100, 78, 56], [122, 96, 66], [92, 72, 52]],
  road: [[146, 124, 92], [136, 114, 86], [156, 134, 100], [120, 102, 78]],
  cobble: [[118, 114, 112], [104, 100, 100], [132, 128, 124], [84, 80, 82]],
  swamp: [[58, 70, 48], [50, 60, 44], [70, 82, 54], [42, 52, 46]],
  water: [[44, 70, 108], [40, 64, 100], [56, 86, 124], [36, 58, 92]],
  dungeon_floor: [[62, 60, 68], [56, 54, 62], [70, 68, 76], [46, 44, 52]],
  dungeon_rubble: [[60, 58, 64], [52, 50, 58], [80, 76, 82], [44, 42, 50]],
};
function placeholderTile(id) {
  const cv = new OffscreenCanvas(TILE_PX, TILE_PX), cx = cv.getContext('2d');
  const pal = TILE_BASE[id] || (id.startsWith('wall') ? TILE_BASE.cobble : [[90, 80, 90], [80, 70, 80], [100, 90, 100], [70, 60, 70]]);
  const img = cx.createImageData(TILE_PX, TILE_PX), d = img.data, R = rng(hashStr(id) + 7);
  for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
    let k = R() < 0.6 ? 0 : R() < 0.5 ? 1 : R() < 0.6 ? 2 : 3;
    if (id === 'cobble' || id === 'dungeon_floor') { const gx = (x + (Math.floor(y / 8) % 2) * 4) % 8, gy = y % 8; if (gx === 0 || gy === 0) k = 3; else if (gx === 1 || gy === 1) k = 2; }
    if (id === 'water' && (y + Math.floor(x / 5)) % 6 === 0 && x % 5 < 3) k = 2;
    if (id === 'road' && R() < 0.04) k = 3;
    const c = pal[k], p = (y * TILE_PX + x) * 4;
    d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  return cv;
}
export const TILE_COLORS = Object.fromEntries(Object.entries(TILE_BASE).map(([k, v]) => [k, v[0]]));
