// 絵（ドット絵の PNG）の読み込みと、スプライトシートから 1 コマを描く道具。
// 絵は dedama/art/ の台本で作る（CyberSprite・Frostwind）。読み込めなかった絵は null になり、各場面が仮の図形で代わりに描く。
import { log } from './log.mjs';

// 名前: [ファイル, 1 コマの幅, 高さ]
export const ART = {
  street: ['img/street.png', 384, 216],
  streetNight: ['img/street-night.png', 384, 216],
  doors: ['img/doors.png', 48, 44],       // 0 閉 1 半分 2 開
  folks: ['img/folks.png', 20, 30],       // 開店待ちの人（Frostwind）。人ごとに 2 コマ（待つ・歩く）
  hero: ['img/hero.png', 32, 32],         // 主人公: 0-5 走る 6-7 立つ 8 話す 9-10 跳ぶ 11 よろける 12 倒れる
  bust: ['img/bust.png', 48, 48],         // 主人公の顔: 0 ふつう 1 まばたき 2 喜ぶ 3 脳汁 4 落ちこむ 5 絶望
  parlor: ['img/parlor.png', 384, 216],
  machines: ['img/machines.png', 60, 104],
  mealS: ['img/meal-s.png', 208, 136],
  mealA: ['img/meal-a.png', 208, 136],
  mealB: ['img/meal-b.png', 208, 136],
  mealC: ['img/meal-c.png', 208, 136],
  mealD: ['img/meal-d.png', 208, 136],
};
export const HERO = { run: [0, 1, 2, 3, 4, 5], idle: [6, 7], talk: 8, jump: [9, 10], fall: [11, 12] };
export const BUST = { normal: 0, blink: 1, happy: 2, joy: 3, sad: 4, despair: 5 };

const images = {};
export async function loadArt(base) {
  await Promise.all(Object.entries(ART).map(([key, [file]]) => new Promise((done) => {
    const img = new Image();
    img.onload = () => { images[key] = img; done(); };
    img.onerror = () => { images[key] = null; log('art.missing', { key, file }, 'warn'); done(); };
    img.src = new URL(file, base).href;
  })));
  const got = Object.values(images).filter(Boolean).length;
  log('art.load', { total: Object.keys(ART).length, got });
}
export const art = (key) => images[key] || null;

// シートの i コマ目を (x, y) に描く（左上）。flip で左右反転
export function frame(ctx, key, i, x, y, { flip = false, alpha = 1 } = {}) {
  const img = images[key];
  if (!img) return false;
  const [, w, h] = ART[key];
  const cols = Math.max(1, Math.floor(img.width / w));
  const sx = (i % cols) * w, sy = Math.floor(i / cols) * h;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save(); ctx.translate(Math.round(x) + w, Math.round(y)); ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
    ctx.restore();
  } else ctx.drawImage(img, sx, sy, w, h, Math.round(x), Math.round(y), w, h);
  ctx.globalAlpha = a;
  return true;
}
export const frameCount = (key) => { const img = images[key]; if (!img) return 0; const [, w, h] = ART[key]; return Math.floor(img.width / w) * Math.floor(img.height / h); };
