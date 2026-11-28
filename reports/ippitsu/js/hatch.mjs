// 暗い所を斜線（ハッチング）の筆で埋める。依存なし。2 つの方式がある。
//
// hatchStrokes（格子）: 種の点を格子に置き、模様の向きに沿って両側へ線を伸ばす（流線の配置。Jobard と Lefer の考え方）。
//   すでに引いた斜線の近くには入らないので、線の間隔はおよそ spacing になる。暗い段は直角に重ねる。
//
// hatchHuman（人の描き方）: デッサンやペン画の解説と、手で描くハッチングの研究（Philbrick と Kaplan 2021）に合わせた方式。
//   - 平行な線の束（パッチ）を単位にし、最初の線から横へ spacing ずつずらして隣の線を順に引く（片側が終わったら反対側）
//   - 1 段目は「/」の向き（baseAngle）にそろえ、模様の向きがはっきりした所だけ follow の分だけ沿わせる
//   - 2 段目・3 段目は直角を避け、angle だけ回して重ねる（30〜45° がよいとされる）
//   - 暗い所ほど線を太く、間隔を狭くする。束の縁は線ごとに少しずらしてそろえすぎない
//   - 線は上の端（横に近い線は左の端）から引く。束の中は作った順に描く（group と seq を付ける）

export const DEFAULT_LEVELS = [
  { below: 0.5, spacing: 6, angle: 0 },
  { below: 0.3, spacing: 6, angle: 90 },
  { below: 0.14, spacing: 4, angle: 45 },
];

// 格子の位置から決まる 0〜1 の値（毎回同じ斜線にするため、乱数は使わない）
function hash(x, y, k) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(k | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function hatchStrokes(tone, flow, w, h, { levels = DEFAULT_LEVELS, minLen = 6, maxLen = 44, width = 1.0, fallbackAngle = 45 } = {}) {
  const strokes = [];
  const clampI = (x, y) => (Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x))));
  levels.forEach((lv, li) => {
    const occ = new Uint8Array(w * h);
    const rot = ((lv.angle ?? 0) * Math.PI) / 180;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const fa = (fallbackAngle * Math.PI) / 180 + rot;
    const fdx = Math.cos(fa), fdy = Math.sin(fa);
    // follow: 流れにどれだけ沿わせるか（0 = 決まった向きのまっすぐな斜線、1 = 流れのまま）。
    // 流れを angle だけ回し、向きがそろっていない所ほど決まった斜めの向きに寄せる
    const follow = lv.follow ?? 1;
    const dirAt = (x, y) => {
      const i = clampI(x, y);
      const tx = flow.tx[i], ty = flow.ty[i];
      let dx = tx * cr - ty * sr, dy = tx * sr + ty * cr;
      if (dx * fdx + dy * fdy < 0) { dx = -dx; dy = -dy; }
      const c = flow.coherence[i] * follow;
      dx = c * dx + (1 - c) * fdx; dy = c * dy + (1 - c) * fdy;
      const n = Math.hypot(dx, dy) || 1;
      return [dx / n, dy / n];
    };
    const inertia = lv.inertia ?? 0;
    const inside = (x, y) => x >= 0 && y >= 0 && x <= w - 1 && y <= h - 1 && tone[clampI(x, y)] < lv.below;
    const free = (x, y) => !occ[clampI(x, y)];
    const trace = (x, y, sign, lim) => {
      const pts = [];
      let [dx, dy] = dirAt(x, y);
      dx *= sign; dy *= sign;
      for (let len = 0; len < lim; len++) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny) || !free(nx, ny)) break;
        pts.push({ x: nx, y: ny });
        x = nx; y = ny;
        let [ex, ey] = dirAt(x, y);
        if (ex * dx + ey * dy < 0) { ex = -ex; ey = -ey; }
        // 向きの変わり方をなめらかにして、ジグザグを抑える
        ex = inertia * dx + (1 - inertia) * ex; ey = inertia * dy + (1 - inertia) * ey;
        const en = Math.hypot(ex, ey) || 1;
        dx = ex / en; dy = ey / en;
      }
      return pts;
    };
    const sp = lv.spacing;
    const r = Math.max(1, Math.round(sp * 0.85));
    for (let gy = sp / 2; gy < h; gy += sp) for (let gx = sp / 2; gx < w; gx += sp) {
      const jx = gx + (hash(gx, gy, li * 2) - 0.5) * sp * 0.6;
      const jy = gy + (hash(gx, gy, li * 2 + 1) - 0.5) * sp * 0.6;
      if (!inside(jx, jy) || !free(jx, jy)) continue;
      const lim = maxLen * (0.55 + 0.45 * hash(gy, gx, li + 7));
      const fwd = trace(jx, jy, 1, lim / 2);
      const bwd = trace(jx, jy, -1, lim / 2);
      const pts = [...bwd.reverse(), { x: jx, y: jy }, ...fwd];
      if (pts.length - 1 < minLen) continue;
      for (const p of pts) {
        const cx = Math.round(p.x), cy = Math.round(p.y);
        for (let yy = Math.max(0, cy - r); yy <= Math.min(h - 1, cy + r); yy++)
          for (let xx = Math.max(0, cx - r); xx <= Math.min(w - 1, cx + r); xx++)
            if ((xx - cx) ** 2 + (yy - cy) ** 2 <= r * r) occ[yy * w + xx] = 1;
      }
      strokes.push({
        points: pts.map((p) => ({ x: p.x, y: p.y, w: width * (0.8 + 0.5 * (1 - tone[clampI(p.x, p.y)])) })),
        kind: 'hatch', level: li, closed: false,
      });
    }
  });
  return strokes;
}

// ---------------------------------------------------------------- 人の描き方
export const HUMAN_LEVELS = [
  { below: 0.48, spacing: 7.5, angle: 0, follow: 0.55 },
  { below: 0.23, spacing: 7.5, angle: 45 },
  { below: 0.085, spacing: 6, angle: -40 },
];

// barrier: 斜線が越えない画素（長い輪郭など）。null なら壁なし
// levels[k].between = j: 新しい向きを足さず、j 段目の線の間に同じ間隔で線を足して暗くする（三角の網目を作らない）
export function hatchHuman(tone, flow, w, h, {
  levels = HUMAN_LEVELS, baseAngle = 60, follow = 0, jitter = 2.5, minLen = 8, maxLen = 56, width = 0.9, inertia = 0.85, barrier = null,
} = {}) {
  const strokes = [];
  const clampI = (x, y) => (Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x))));
  let group = 0;
  const stamp = (occ, p, r) => {
    const cx = Math.round(p.x), cy = Math.round(p.y);
    for (let yy = Math.max(0, cy - r); yy <= Math.min(h - 1, cy + r); yy++)
      for (let xx = Math.max(0, cx - r); xx <= Math.min(w - 1, cx + r); xx++)
        if ((xx - cx) ** 2 + (yy - cy) ** 2 <= r * r) occ[yy * w + xx] = 1;
  };
  levels.forEach((lv, li) => {
    const occ = new Uint8Array(w * h);
    // 2 段目より上は、1 段目と同じ向きの場（形に沿う分も含む）を angle だけ回して使う。
    // 1 段目が形に沿って曲がる所では一緒に曲がるので、交わる角度がどこでも angle に保たれる
    const fol = lv.follow ?? follow;
    const below = lv.below;
    const rot = ((lv.angle ?? 0) * Math.PI) / 180;
    const rc = Math.cos(rot), rs = Math.sin(rot);
    // 線の間隔。間を埋める段は、埋める相手の段と同じ間隔にして、相手の線の間に入るようにする
    const ref = lv.between !== undefined ? levels[lv.between] : lv;
    const sp = ref.spacing;
    // 段の中での暗さ（0 = しきい値ちょうど、1 = 真っ黒）
    const dark = (t) => Math.min(1, Math.max(0, (ref.below - t) / Math.max(0.05, ref.below)));
    const spacingAt = (x, y) => sp * (1.3 - 0.6 * dark(tone[clampI(x, y)]));
    if (lv.between !== undefined) {
      for (const s of strokes) if (s.level === lv.between) for (const p of s.points) stamp(occ, p, Math.max(1, Math.round(0.3 * spacingAt(p.x, p.y))));
    }
    let bx = 1, by = 0; // いまの束の 1 段目の基本の向き（画像の座標。y は下向き）
    // 画面の向きで +rot 回す（画像の座標は y が下向きなので、回す向きが逆になる）
    const turn = (dx, dy) => [dx * rc + dy * rs, -dx * rs + dy * rc];
    const dirAt = (x, y) => {
      if (fol <= 0) return turn(bx, by);
      const i = clampI(x, y);
      let tx = flow.tx[i], ty = flow.ty[i];
      if (tx * bx + ty * by < 0) { tx = -tx; ty = -ty; }
      // 向きのそろい具合が 0.5 以下の所（平らな壁の模様など）では沿わせない。0.85 以上で follow いっぱいに沿わせる
      const c = Math.min(1, Math.max(0, (flow.coherence[i] - 0.5) / 0.35)) * fol;
      const dx = (1 - c) * bx + c * tx, dy = (1 - c) * by + c * ty;
      const n = Math.hypot(dx, dy) || 1;
      return turn(dx / n, dy / n);
    };
    // 線ごとに少しずらしたしきい値の内側で、壁でも他の線のそばでもなければ、引いてよい
    const inside = (x, y, thr) => {
      if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return false;
      const i = clampI(x, y);
      return tone[i] < thr && !occ[i] && !(barrier && barrier[i]);
    };
    const trace = (x, y, sign, lim, thr) => {
      const pts = [];
      let [dx, dy] = dirAt(x, y);
      dx *= sign; dy *= sign;
      for (let len = 0; len < lim; len++) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny, thr)) break;
        pts.push({ x: nx, y: ny });
        x = nx; y = ny;
        let [ex, ey] = dirAt(x, y);
        if (ex * dx + ey * dy < 0) { ex = -ex; ey = -ey; }
        ex = inertia * dx + (1 - inertia) * ex; ey = inertia * dy + (1 - inertia) * ey;
        const en = Math.hypot(ex, ey) || 1;
        dx = ex / en; dy = ey / en;
      }
      return pts;
    };
    // 種の点から 1 本引く。短すぎれば null。
    // 長さと、種の点が線のどこに来るかを線ごとに変え、束の両端が一直線にそろわないようにする
    const lineFrom = (x, y, salt, minL = minLen) => {
      const thr = below + (hash(x * 7, y * 7, li + salt) - 0.5) * 0.09;
      if (!inside(x, y, thr)) return null;
      const lim = maxLen * (0.6 + 0.4 * hash(y, x, li + 31 + salt));
      const u = 0.3 + 0.4 * hash(x * 3, y * 5, li + 47 + salt);
      const pts = [...trace(x, y, -1, lim * u, thr).reverse(), { x, y }, ...trace(x, y, 1, lim * (1 - u), thr)];
      if (pts.length - 1 < minL) return null;
      // 上の端から（横に近い線は左の端から）引く
      const a = pts[0], b = pts[pts.length - 1];
      const steep = Math.abs(b.y - a.y) >= Math.abs(b.x - a.x) * 0.35;
      if (steep ? a.y > b.y : a.x > b.x) pts.reverse();
      return pts;
    };
    // 引いた線のまわりに「使用中」の印を付ける（半径は間隔の 0.42 倍）。
    // 線の先端には付けず、隣の束の線が先端のそばまで入れるようにする（束の継ぎ目に白い筋を残さない）
    const accept = (pts) => {
      const tip = Math.max(1, Math.round(0.5 * sp));
      pts.forEach((p, i) => { if (i >= tip && i < pts.length - tip) stamp(occ, p, Math.max(1, Math.round(0.42 * spacingAt(p.x, p.y)))); });
      const line = {
        points: pts.map((p) => {
          const t = tone[clampI(p.x, p.y)];
          return { x: p.x, y: p.y, w: width * (0.45 + 1.5 * (1 - t)) };
        }),
        kind: 'hatch', level: li, group, seq: 0, closed: false, fixedDir: true,
      };
      strokes.push(line);
      return line;
    };
    // 線の長さの割合 f の点と、その点での線の向き
    const anchor = (pts, f) => {
      const i = Math.min(pts.length - 2, Math.max(0, Math.round((pts.length - 1) * f)));
      const a = pts[i], b = pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: a.x, y: a.y, dx: (b.x - a.x) / L, dy: (b.y - a.y) / L };
    };
    const seedStep = Math.max(3, sp);
    for (let gy = seedStep / 2; gy < h; gy += seedStep) for (let gx = seedStep / 2; gx < w; gx += seedStep) {
      const sx = gx + (hash(gx, gy, li * 2 + 101) - 0.5) * seedStep * 0.5;
      const sy = gy + (hash(gx, gy, li * 2 + 102) - 0.5) * seedStep * 0.5;
      if (occ[clampI(sx, sy)] || tone[clampI(sx, sy)] >= below) continue;
      // 束ごとに向きを少し変える（回す前の、1 段目の向き）
      const ang = ((baseAngle + (hash(sx, sy, li + 55) - 0.5) * 2 * jitter) * Math.PI) / 180;
      bx = Math.cos(ang); by = -Math.sin(ang);
      const first = lineFrom(sx, sy, 0);
      if (!first) continue;
      const start = accept(first);
      // 片側へ、行き止まりまで隣の線を引く。終わったら反対側
      const sides = { 1: [], [-1]: [] };
      for (const side of [1, -1]) {
        let cur = start.points;
        for (let guard = 0; guard < 400; guard++) {
          let next = null;
          // 間隔ちょうどで置けないとき（隣の束が近いとき）は、0.8 倍に詰めた所も試す
          for (const k of [1, 0.8]) {
            for (const f of [0.5, 0.3, 0.7]) {
              const a = anchor(cur, f);
              const s = spacingAt(a.x, a.y) * k;
              const nx = a.x - a.dy * s * side, ny = a.y + a.dx * s * side;
              next = lineFrom(nx, ny, guard + 1);
              if (next) break;
            }
            if (next) break;
          }
          if (!next) break;
          const line = accept(next);
          sides[side].push(line);
          cur = line.points;
        }
      }
      // 描く順: 反対側の端の線から、最初の線を通って、こちら側の端の線まで 1 回で横切る
      [...sides[-1].reverse(), start, ...sides[1]].forEach((l, i) => { l.seq = i; });
      group++;
    }
    // 仕上げ: 細かい間隔でもう一度種をまき、束の間に残った白い筋に短い線を足す
    const fillStep = Math.max(2, sp * 0.5);
    for (let gy = fillStep / 2; gy < h; gy += fillStep) for (let gx = fillStep / 2; gx < w; gx += fillStep) {
      const sx = gx + (hash(gx, gy, li * 2 + 301) - 0.5) * fillStep * 0.5;
      const sy = gy + (hash(gx, gy, li * 2 + 302) - 0.5) * fillStep * 0.5;
      if (occ[clampI(sx, sy)] || tone[clampI(sx, sy)] >= below) continue;
      // 種の点のまわり（間隔の 0.35 倍の円）が空いている、まとまった隙間だけを埋める
      const rr = Math.max(1, Math.round(0.35 * spacingAt(sx, sy)));
      let open = true;
      for (let dy = -rr; dy <= rr && open; dy++) for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > rr * rr) continue;
        if (occ[clampI(sx + dx, sy + dy)]) { open = false; break; }
      }
      if (!open) continue;
      const ang = ((baseAngle + (hash(sx, sy, li + 56) - 0.5) * 2 * jitter) * Math.PI) / 180;
      bx = Math.cos(ang); by = -Math.sin(ang);
      const pts = lineFrom(sx, sy, 900, Math.max(6, Math.round(minLen * 0.75)));
      if (!pts) continue;
      accept(pts);
      group++;
    }
  });
  return strokes;
}

