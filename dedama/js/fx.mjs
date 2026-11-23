// pixelfx（MIT、vendor/pixelfx）の効果を、ゲームの画面（384×216）の上に重ねる。
// 効果は色の層と光の層に描かれ、composite() で今の画面の画素と合わせる（光は足し算）。
import { createFrame, clearFrame, createFx, composite } from '../vendor/pixelfx/src/core/index.js';
import * as collectBurst from '../vendor/pixelfx/src/fx/pickups/collect-burst.js';
import * as fireworkBurst from '../vendor/pixelfx/src/fx/explosions/firework-burst.js';
import * as confetti from '../vendor/pixelfx/src/fx/ui/confetti.js';
import * as rain from '../vendor/pixelfx/src/fx/weather/rain.js';
import * as goldDust from '../vendor/pixelfx/src/fx/ui/gold-dust.js';

const MODS = { hit: collectBurst, firework: fireworkBurst, confetti, rain, goldDust };

// 1 色から暗い → 明るい の段階（collect-burst の palette は 8 段）
export function rampFrom(hex, n = 8) {
  const v = parseInt(hex.slice(1), 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const mix = (c) => Math.round(k < 0.75 ? c * (0.12 + (k / 0.75) * 0.88) : c + (255 - c) * ((k - 0.75) / 0.25));
    out.push(`#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`);
  }
  return out;
}

export class FxLayer {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.frame = createFrame(w, h);
    this.list = [];
  }
  // kind: hit | firework | confetti | rain | goldDust。opts は効果の選択肢（palette, seed など）
  spawn(kind, x, y, opts = {}) {
    const mod = MODS[kind];
    if (!mod) return null;
    const fx = createFx(mod, { x, y, seed: (Math.random() * 1e6) | 0, ...opts });
    this.list.push(fx);
    return fx;
  }
  stopAll(kind) {
    for (const f of this.list) if (!kind || f.kind === kind) f.stop();
  }
  update(dt) {
    for (const f of this.list) f.update(dt);
    this.list = this.list.filter((f) => !f.done());
  }
  get active() { return this.list.length > 0; }
  clear() { this.list.length = 0; }
  // 今の画面（ctx）の上に重ねる
  draw(ctx) {
    if (!this.list.length) return;
    clearFrame(this.frame);
    for (const f of this.list) f.draw(this.frame);
    const img = ctx.getImageData(0, 0, this.w, this.h);
    composite(this.frame, img.data, new Uint32Array(img.data.buffer));
    ctx.putImageData(img, 0, 0);
  }
}
