import { fit, cycle, TAU, WHITE } from "../../core/index.js";

export const meta = {
  name: "Gold dust",
  desc: "Flakes of gold leaf drift down over a scene, swaying and tumbling; each one flashes white as it turns its face to the light, then settles and winks out on the floor.",
  tags: ["ui", "gold", "gold leaf", "celebration", "luxury", "win", "ambient", "loop"],
  size: [224, 136],
  origin: [112, 132],
  duration: 6,
  loop: true,
  fps: 30,
  bg: "dark",
  options: { palette: ["#1e1206", "#4a2c08", "#86520c", "#c48412", "#f0b424", "#ffe066", "#fff6c4", "#ffffff"], seed: 7, count: 56 },
};

const D = 6, TOP = -128, W = 98;

// one flake of gold leaf: a fall timed to its life, a sway on the breeze, a tumble that squashes it edge-on
export function draw(p, t, o) {
  const C = fit(o.palette, 8), n = o.count ?? 56;
  cycle(t, D, n, o.seed, (g) => 3.8 + g.next() * 2.2, (age, life, r) => {
    const k = age / life;
    const x0 = r.range(-W, W), sway = r.range(4, 12), sw = r.range(0.7, 1.6), ph = r.range(0, TAU);
    const spin = r.range(2.5, 6) * (r.next() < 0.5 ? -1 : 1), sph = r.range(0, TAU);
    const roll = r.next(), size = roll < 0.12 ? 4 : roll < 0.45 ? 3 : roll < 0.85 ? 2 : 1;
    const x = x0 + Math.sin(age * sw + ph) * sway, y = TOP + k * (-TOP);
    const f = Math.abs(Math.cos(age * spin + sph)); // 1: full face to the light, 0: edge-on
    // gold mid tones on the face, a deeper step edge-on; white only when it flashes
    const face = f > 0.7 ? C[5] : f > 0.35 ? C[4] : C[3];
    const fade = k > 0.9 ? (1 - k) / 0.1 : k < 0.05 ? k / 0.05 : 1;
    if (fade <= 0.2) return;
    const w = Math.max(1, Math.round(size * (0.3 + 0.7 * f))), h = Math.max(1, size - (size > 2 && f < 0.5 ? 1 : 0));
    const x1 = Math.round(x - w / 2), y1 = Math.round(y - h / 2);
    // the leaf, its shaded underside (bottom-right step) and its lit top-left corner
    p.rect(x1, y1, w, h, face, fade);
    if (size > 1) {
      p.rect(x1 + w - 1, y1 + h - 1, 1, 1, C[2], fade);
      if (f > 0.35) p.dot(x1, y1, C[6], fade);
    }
    // a leaf turned square to the light flashes: a white core and a short warm glow
    if (size > 2 && f > 0.97) {
      p.dot(x1 + (w >> 1), y1 + (h >> 1), WHITE, fade);
      p.glow(x, y, 4 + size * 2, C[5], 0.3 * fade);
    }
  });
}
