// 戦いの見た目の効果: スキルの vfx ごとの粒、ダメージの数字（ドットの数字）、明かり、宝の光の柱、文字の知らせ。
// 粒は地図の座標（マス）と高さ z（ドット）で持ち、描くときに画面へ写す。
import { rng } from './core.mjs';

const R = rng(99);
const rand = (a, b) => a + (b - a) * R();

// 3×5 のドットの数字
const GLYPHS = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
  '+': '000010111010000', '-': '000000111000000',
};

// 色（ダメージの種類ごと）
export const TYPE_COLORS = {
  phys: [255, 240, 220], fire: [255, 140, 50], cold: [130, 200, 255], lightning: [255, 240, 110],
  poison: [140, 220, 90], holy: [255, 230, 150], shadow: [190, 120, 255], heal: [120, 255, 140], mana: [120, 160, 255],
};

// vfx の id → 見た目の型と色。データの係が新しい id を足しても、名前の一部で近い型を選ぶ
// 上から順に、最初に合ったものを使う
const PRESETS = [
  [/drain|leech/, 'line', [220, 60, 90]],
  [/holy_bolt|smite/, 'pillar', [255, 236, 170]],
  [/revive|resurrect|cheat_?death/i, 'pillar', [255, 236, 160]],
  [/bandage|heal|spring|cure|mend|cleanse|chakra/, 'rise', [120, 255, 150]],
  [/stance_fire|flame_coat/, 'orbit', [255, 140, 60]],
  [/stance_water/, 'orbit', [110, 180, 255]],
  [/stance_rock|rock_skin|diamond/, 'orbit', [200, 170, 120]],
  [/bone_mantle|grave_guard|bone_fence/, 'orbit', [230, 225, 200]],
  [/aura_holy|holy_shield/, 'orbit', [255, 236, 170]],
  [/aura|stance|shield|ward|guard|barrier|parry|reflect|counter|mantle/, 'orbit', [160, 210, 255]],
  [/toll|sound_ring|bell/, 'ring', [230, 180, 100]],
  [/white_ring|harmony|banner|light_step|pillar|holy|bless/, 'ring', [255, 240, 190]],
  [/roar|howl|challenge|shout|cry|taunt|enrage|frenzy|call/, 'ring', [255, 120, 80]],
  [/dark_bolt|dark|curse|doom|death_sentence|dread|mark|sentence/, 'rune', [190, 80, 230]],
  [/torch|ember|fire|flame|burn|corpse|explo/, 'burst', [255, 140, 50]],
  [/frost|ice|cold|freeze/, 'burst', [140, 210, 255]],
  [/mist|fog/, 'cloud', [170, 190, 210]],
  [/bolt|spark|shock|lightning|thunder/, 'burst', [255, 240, 120]],
  [/venom|poison|toxic|acid|spit/, 'cloud', [140, 220, 90]],
  [/smoke|dust/, 'cloud', [150, 150, 160]],
  [/hook|chain|tether|grasp/, 'line', [200, 200, 210]],
  [/rewind|time|clock/, 'spiral', [190, 150, 255]],
  [/dash|charge|leap|jump|blink|step|sprint|tumble|pounce|gale|wind/, 'trail', [220, 210, 190]],
  [/quake|earth|split|fissure|stomp|slam|caltrops|stone|rock|sweep|wall/, 'debris', [150, 120, 80]],
  [/swap|clone|shadow|stealth|shade/, 'burst', [170, 110, 240]],
  [/bone|summon|raise|minion|skeleton/, 'rise', [230, 225, 200]],
  [/blood/, 'burst', [200, 30, 40]],
  [/trap/, 'ring', [220, 200, 160]],
  [/blade|slash|cut|cleave|strike|sword|thousand|spin|iai|execute|backstab|cross|flurry/, 'slash', [255, 250, 230]],
  [/kick|fist|punch|smash|bash|hit|palm/, 'impact', [255, 230, 200]],
  [/knife|arrow|shot|throw|sling|fan|stake/, 'impact', [230, 230, 230]],
  [/mana/, 'rise', [120, 160, 255]],
];
export function presetFor(vfx, type) {
  const s = String(vfx || type || '');
  for (const [re, kind, col] of PRESETS) if (re.test(s)) return { kind, col };
  return { kind: 'burst', col: TYPE_COLORS[type] || [255, 230, 200] };
}

export function createFx() {
  const parts = [];   // { x, y, z, vx, vy, vz, life, max, col, size, glow, ground }
  const numbers = []; // { x, y, z, text, col, life, max, big }
  const texts = [];   // 画面の上の文字（重ねる canvas に描く）: { x, y, z, text, col, life, max }
  const lights = [];  // { x, y, r, life, max, col }
  const beams = [];   // 宝の光の柱 { x, y, col, life, max }
  const rings = [];   // 地面の輪 { x, y, r0, r1, col, life, max }
  const warns = [];   // 地面の印（前触れ。この時間が過ぎると当たる） { x, y, r, shape, dir, len, width, angle, hostile, life, max }
  const later = [];   // 遅れて出す効果 { t, name, at, opt }

  const P = (x, y, z, vx, vy, vz, life, col, size = 1, glow = true, grav = 0) => parts.push({ x, y, z, vx, vy, vz, life, max: life, col, size, glow, grav });

  function play(vfx, at, opt = {}) {
    const { kind, col } = presetFor(vfx, opt.type);
    const { x, y } = at;
    const to = opt.to;
    switch (kind) {
      case 'rise': for (let i = 0; i < 26; i++) { const a = rand(0, 6.28), r = rand(0, 0.8); P(x + Math.cos(a) * r, y + Math.sin(a) * r, rand(0, 4), 0, 0, rand(14, 30), rand(0.6, 1.2), col); } lights.push({ x, y, r: 3, life: 0.8, max: 0.8, col }); break;
      case 'pillar': for (let i = 0; i < 40; i++) P(x + rand(-0.4, 0.4), y + rand(-0.4, 0.4), rand(0, 10), 0, 0, rand(30, 60), rand(0.5, 1.1), col, R() < 0.3 ? 2 : 1); rings.push({ x, y, r0: 0.2, r1: 2, col, life: 0.6, max: 0.6 }); lights.push({ x, y, r: 5, life: 1, max: 1, col }); break;
      case 'orbit': for (let i = 0; i < 24; i++) { const a = (i / 24) * 6.28; P(x + Math.cos(a) * 0.9, y + Math.sin(a) * 0.9, 6 + (i % 3) * 3, -Math.sin(a) * 1.5, Math.cos(a) * 1.5, 0, 1.0, col); } rings.push({ x, y, r0: 0.9, r1: 1.0, col, life: 1, max: 1 }); break;
      case 'burst': for (let i = 0; i < 34; i++) { const a = rand(0, 6.28), s = rand(1, 4); P(x, y, rand(2, 10), Math.cos(a) * s, Math.sin(a) * s, rand(-10, 30), rand(0.3, 0.7), R() < 0.3 ? [255, 255, 220] : col, R() < 0.2 ? 2 : 1, true, -60); } lights.push({ x, y, r: 4, life: 0.5, max: 0.5, col }); break;
      case 'cloud': for (let i = 0; i < 22; i++) { const a = rand(0, 6.28), s = rand(0.2, 1.2); P(x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3, rand(1, 8), Math.cos(a) * s, Math.sin(a) * s, rand(0, 4), rand(1, 2), col, 2, false); } break;
      case 'line': {
        const tx = to?.x ?? x, ty = to?.y ?? y, fx0 = opt.from?.x ?? x, fy0 = opt.from?.y ?? y;
        const n = Math.max(6, Math.round(Math.hypot(tx - fx0, ty - fy0) * 5));
        for (let i = 0; i <= n; i++) { const k = i / n; P(fx0 + (tx - fx0) * k, fy0 + (ty - fy0) * k, 8, 0, 0, 0, 0.35 + k * 0.2, i % 2 ? col : [120, 120, 130], 1, false); }
        break;
      }
      case 'trail': {
        const fx0 = opt.from?.x ?? x, fy0 = opt.from?.y ?? y;
        const n = Math.max(6, Math.round(Math.hypot(x - fx0, y - fy0) * 4));
        for (let i = 0; i <= n; i++) { const k = i / n; P(fx0 + (x - fx0) * k + rand(-0.2, 0.2), fy0 + (y - fy0) * k + rand(-0.2, 0.2), rand(0, 3), 0, 0, rand(2, 8), rand(0.3, 0.6), col, 2, false); }
        break;
      }
      case 'debris': for (let i = 0; i < 30; i++) { const a = rand(0, 6.28), s = rand(0.5, 3); P(x + rand(-0.6, 0.6), y + rand(-0.6, 0.6), 0, Math.cos(a) * s, Math.sin(a) * s, rand(30, 70), rand(0.5, 0.9), R() < 0.5 ? col : [100, 80, 60], R() < 0.4 ? 2 : 1, false, -160); } rings.push({ x, y, r0: 0.3, r1: 2.2, col, life: 0.4, max: 0.4 }); break;
      case 'ring': rings.push({ x, y, r0: 0.5, r1: opt.r || 5, col, life: 0.6, max: 0.6 }); rings.push({ x, y, r0: 0.3, r1: (opt.r || 5) * 0.7, col, life: 0.45, max: 0.45 }); break;
      case 'spiral': for (let i = 0; i < 36; i++) { const a = i * 0.5, r = 0.2 + i * 0.03; P(x + Math.cos(a) * r, y + Math.sin(a) * r, i * 0.6, -Math.sin(a) * 2, Math.cos(a) * 2, 6, 0.8, col); } break;
      case 'rune': for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.28; P(x + Math.cos(a) * 0.5, y + Math.sin(a) * 0.5, 26, 0, 0, 0, 1.2, col); } P(x, y, 26, 0, 0, 0, 1.2, [255, 255, 255], 2); break;
      case 'slash': {
        const ang = opt.angle ?? 0;
        for (let i = 0; i < 14; i++) { const a = ang - 1 + (i / 13) * 2, r = 0.9; P(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, 8 + Math.sin(i / 13 * 3.14) * 4, Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0, 0.18 + i * 0.008, col, 1); }
        break;
      }
      default: for (let i = 0; i < 12; i++) { const a = rand(0, 6.28), s = rand(1, 3); P(x, y, rand(4, 10), Math.cos(a) * s, Math.sin(a) * s, rand(0, 20), rand(0.15, 0.35), col, 1, true, -40); }
    }
  }

  return {
    play,
    warn(o) { const d = Math.max(0.05, Number(o.delay) || 0.5); warns.push({ ...o, life: d, max: d }); },
    playLater(delay, name, at, opt) { later.push({ t: delay, name, at, opt }); },
    number(at, v, { type = 'phys', crit = false, heal = false } = {}) {
      const col = heal ? TYPE_COLORS.heal : TYPE_COLORS[type] || TYPE_COLORS.phys;
      numbers.push({ x: at.x + rand(-0.2, 0.2), y: at.y, z: 22, text: (heal ? '+' : '') + Math.round(v), col, life: 0.9, max: 0.9, big: crit });
    },
    text(at, text, col = [255, 255, 255], life = 1.2, z = 26) { texts.push({ x: at.x, y: at.y, z, text, col, life, max: life }); },
    beam(at, col) { beams.push({ x: at.x, y: at.y, col, life: 2.2, max: 2.2 }); },
    light(at, r, life, col) { lights.push({ x: at.x, y: at.y, r, life, max: life, col }); },
    hitSpark(at, type) { const col = TYPE_COLORS[type] || TYPE_COLORS.phys; for (let i = 0; i < 6; i++) { const a = rand(0, 6.28); P(at.x, at.y, rand(6, 14), Math.cos(a) * 2, Math.sin(a) * 2, rand(0, 20), 0.2, col); } },
    deathPuff(at) { for (let i = 0; i < 18; i++) { const a = rand(0, 6.28), s = rand(0.3, 1.5); P(at.x, at.y, rand(2, 12), Math.cos(a) * s, Math.sin(a) * s, rand(4, 16), rand(0.5, 1), [60, 50, 70], 2, false); } },
    trailDot(at, col) { P(at.x + rand(-0.05, 0.05), at.y + rand(-0.05, 0.05), 6, 0, 0, 0, 0.25, col, 1); },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz += p.grav * dt;
        p.vx *= 1 - dt * 2; p.vy *= 1 - dt * 2;
        if (p.z < 0) { p.z = 0; p.vz = 0; }
      }
      for (const arr of [numbers, texts, lights, beams, rings, warns]) for (let i = arr.length - 1; i >= 0; i--) { arr[i].life -= dt; if (arr[i].life <= 0) arr.splice(i, 1); }
      for (let i = later.length - 1; i >= 0; i--) { later[i].t -= dt; if (later[i].t <= 0) { const l = later.splice(i, 1)[0]; play(l.name, l.at, l.opt); } }
      for (const n of numbers) n.z += dt * 18;
      for (const t of texts) t.z += dt * 10;
      if (parts.length > 3000) parts.splice(0, parts.length - 3000);
    },
    parts, numbers, texts, lights, beams, rings, warns,
    clear() { parts.length = numbers.length = texts.length = lights.length = beams.length = rings.length = warns.length = later.length = 0; },
  };
}

// ドットの数字を描く（ctx は絵の解像度の canvas）
export function drawPixelText(ctx, text, x, y, col, scale = 1, alpha = 1) {
  const w = text.length * 4 * scale - scale;
  let cx = Math.round(x - w / 2);
  const cy = Math.round(y);
  ctx.globalAlpha = alpha;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) {
      // 縁取り
      ctx.fillStyle = 'rgb(16,10,20)';
      for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3) * scale - 1, cy + Math.floor(i / 3) * scale - 1, scale + 2, scale + 2);
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3) * scale, cy + Math.floor(i / 3) * scale, scale, scale);
    }
    cx += 4 * scale;
  }
  ctx.globalAlpha = 1;
}

// 状態異常の小さな印（ドット）。kind: stun|root|slow|silence|fear|sleep
const CC_ICON = {
  stun: { col: [255, 230, 90], px: ['01010', '10101', '01010'] },
  root: { col: [130, 190, 80], px: ['10101', '01110', '11011'] },
  slow: { col: [120, 170, 255], px: ['00110', '01001', '11110'] },
  silence: { col: [220, 220, 230], px: ['10001', '01010', '00100', '01010', '10001'] },
  fear: { col: [190, 110, 255], px: ['01110', '11011', '01110', '00100'] },
  sleep: { col: [180, 200, 255], px: ['1111', '0010', '0100', '1111'] },
};
export function drawCcIcon(ctx, kind, x, y, t) {
  const ic = CC_ICON[kind];
  if (!ic) return 0;
  const bob = Math.round(Math.sin(t * 6) * 1);
  const h = ic.px.length, w = ic.px[0].length;
  const ox = Math.round(x - w / 2), oy = Math.round(y - h + bob);
  ctx.fillStyle = 'rgb(16,10,20)';
  ctx.fillRect(ox - 1, oy - 1, w + 2, h + 2);
  ctx.fillStyle = `rgb(${ic.col[0]},${ic.col[1]},${ic.col[2]})`;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (ic.px[j][i] === '1') ctx.fillRect(ox + i, oy + j, 1, 1);
  return w + 3;
}
export const CC_NAMES = { stun: '気絶', root: '足止め', slow: '鈍足', silence: '沈黙', fear: '恐怖', sleep: '眠り' };
