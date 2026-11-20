// Vegetação — atlas de folhagem gerado por código (caminhos em canvas 2D), com mips que preservam a cobertura do alfa.
// 8 ladrilhos (4x2): 0 ramo de folhas largas | 1 ramo denso de folhas pequenas | 2 folha de palmeira | 3 fronde de samambaia
//                            4 folha palmada grande  | 5 tufo de capim               | 6 ramo ralo         | 7 folhas grandes brilhantes (arbusto)
const VEG_TS = 1024, VEG_TW = 4, VEG_TH = 2;   // ladrilhos de 1024² (o desenho é feito em coordenadas de 512 e escalado)
function vegAtlasBuild() {
  const TS = VEG_TS, W = TS * VEG_TW, H = TS * VEG_TH;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const rnd = mkRng(90210);
  const rr = (a, b) => a + (b - a) * rnd();
  const hsl = (h, s, l, a) => `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a === undefined ? 1 : a})`;
  // folha simples ao longo de +x: comprimento len, meia largura wid
  const leaf = (x, y, ang, len, wid, hue, sat, lig, tipk) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    const k = tipk || 0.72;
    g.fillStyle = hsl(hue, sat, lig);
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(len * 0.25, -wid * 1.15, len * k, -wid * 0.9, len, 0); g.bezierCurveTo(len * k, wid * 0.9, len * 0.25, wid * 1.15, 0, 0); g.fill();
    // metade mais clara (lado iluminado) e nervuras
    g.fillStyle = hsl(hue + 6, sat + 4, lig + 7, 0.55);
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(len * 0.25, -wid * 1.15, len * k, -wid * 0.9, len, 0); g.closePath(); g.fill();
    g.strokeStyle = hsl(hue + 12, sat - 6, lig + 16, 0.75); g.lineWidth = Math.max(1, wid * 0.09);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.96, 0); g.stroke();
    g.lineWidth = Math.max(0.6, wid * 0.04); g.strokeStyle = hsl(hue + 10, sat - 6, lig + 11, 0.4);
    g.beginPath();
    for (let i = 1; i < 6; i++) { const t = i / 6.5; g.moveTo(len * t, 0); g.lineTo(len * (t + 0.14), -wid * 0.8 * (1 - t * 0.6)); g.moveTo(len * t, 0); g.lineTo(len * (t + 0.14), wid * 0.8 * (1 - t * 0.6)); }
    g.stroke();
    g.restore();
  };
  const stem = (x0, y0, x1, y1, w, h, l) => { g.strokeStyle = hsl(h || 30, 28, l || 20); g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const tile = (i, fn) => { g.save(); g.beginPath(); g.rect((i % VEG_TW) * TS + 3, Math.floor(i / VEG_TW) * TS + 3, TS - 6, TS - 6); g.clip(); g.translate((i % VEG_TW) * TS, Math.floor(i / VEG_TW) * TS); g.scale(TS / 512, TS / 512); fn(); g.restore(); };
  // galho recursivo com folhas alternadas pequenas. ang = direção (rad, -PI/2 = para cima)
  const twig = (x, y, ang, len, depth, P) => {
    const n = Math.max(2, Math.round(len / P.step)); let px = x, py = y, a = ang;
    for (let i = 1; i <= n; i++) {
      a += rr(-0.13, 0.13) + (P.droop || 0) * Math.cos(a) * 0.06;
      const nx = px + Math.cos(a) * len / n, ny = py + Math.sin(a) * len / n;
      stem(px, py, nx, ny, Math.max(1, P.stemW * (depth + 0.6) * (1 - i / n * 0.6)), 26, 15);
      px = nx; py = ny;
      const side = i % 2 ? 1 : -1, t = i / n;
      if (depth > 0 && i > 1 && i < n && rnd() < P.branchP) twig(px, py, a + side * rr(0.55, 1.0), len * rr(0.36, 0.56) * (1 - t * 0.45), depth - 1, P);
      if (i < 2 && depth === P.depth) continue;
      for (let q = 0; q < P.perNode; q++) {
        if (rnd() > P.leafP) continue;
        const s2 = q % 2 ? -side : side, L = P.leafL * rr(0.7, 1.2);
        const dk = rnd() < 0.32 ? -10 : 0;   // parte das folhas em sombra (camada de trás)
        leaf(px, py, a + s2 * rr(0.55, 1.2) + (P.droop || 0) * 0.5 * Math.cos(a), L, L * P.leafW * rr(0.85, 1.15), P.hue + rr(-10, 9) + (rnd() < 0.06 ? -30 : 0), P.sat + rr(-8, 8), P.lig + rr(-5, 6) + dk, P.tipk);
      }
    }
    leaf(px, py, a + rr(-0.2, 0.2), P.leafL * 1.05, P.leafL * P.leafW, P.hue + rr(-8, 8), P.sat, P.lig + rr(-3, 6), P.tipk);
  };
  // massa de folhagem em leque a partir da base: 3 camadas (fundo escuro e cheio → frente clara e rala) dão profundidade
  // e uma silhueta irregular mas cheia (sem "estrela" de galho solto).
  const cluster = (P, nTw, fan, lenMin, lenMax) => {
    for (let layer = 0; layer < 3; layer++) {
      const Q = Object.assign({}, P, { lig: P.lig + [-12, -3, 6][layer], sat: P.sat + [-8, 0, 4][layer], leafP: P.leafP * [0.9, 0.85, 0.7][layer], hue: P.hue + [6, 0, -4][layer] });
      for (let k = 0; k < nTw; k++) {
        const u = (k + rr(0.1, 0.9)) / nTw - 0.5, a = -PI / 2 + u * fan;
        twig(256 + u * 70 + rr(-10, 10), 502, a, rr(lenMin * (layer === 2 ? 0.55 : 0.8), lenMax) * (1 - 0.42 * Math.abs(u) * 2), P.depth, Q);
      }
    }
  };
  // 0: massa de folhas largas
  tile(0, () => cluster({ depth: 2, step: 13, stemW: 1.5, branchP: 0.55, leafL: 20, leafW: 0.42, perNode: 3, leafP: 0.8, hue: 96, sat: 36, lig: 22, tipk: 0.66 }, 6, 2.5, 330, 455));
  // 1: massa densa de folhas pequenas
  tile(1, () => cluster({ depth: 2, step: 10.5, stemW: 1.2, branchP: 0.5, leafL: 14.5, leafW: 0.42, perNode: 3, leafP: 0.8, hue: 102, sat: 35, lig: 20, tipk: 0.62 }, 7, 2.6, 330, 460));
  // 2: folha de palmeira (ráquis de baixo para cima, folíolos longos e caídos)
  tile(2, () => {
    const n = 46; let px = 256, py = 506;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = 256 + Math.sin(t * 1.1) * 14, y = 506 - t * 496;
      if (i) stem(px, py, x, y, 5 * (1 - t) + 1.2, 70, 26); px = x; py = y;
      if (i < 2) continue;
      const L = (60 + 170 * Math.sin(Math.min(1, t * 1.25) * PI * 0.62)) * rr(0.85, 1.1) * (1 - t * t * 0.55);
      for (let s = -1; s <= 1; s += 2) {
        const a = -PI / 2 + s * (1.25 - t * 0.55) + rr(-0.08, 0.08);
        g.strokeStyle = hsl(88 + rr(-5, 5), 40 + rr(-4, 4), 25 + rr(-2, 3)); g.lineWidth = rr(8.5, 11.5) * (1 - t * 0.35); g.lineCap = 'round';   // folíolos largos: a fronde lê como lâmina, não como hachura
        const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L + L * 0.22;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * L * 0.55, y + Math.sin(a) * L * 0.55 - 6, ex, ey); g.stroke();
        g.strokeStyle = hsl(96, 34, 34, 0.22); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * L * 0.55, y + Math.sin(a) * L * 0.55 - 6, ex, ey); g.stroke();
      }
    }
  });
  // 3: fronde de samambaia (bipinada)
  tile(3, () => {
    const n = 30; let px = 256, py = 506;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = 256 + Math.sin(t * 2.2) * 10, y = 506 - t * 494;
      if (i) stem(px, py, x, y, 3.2 * (1 - t) + 1, 80, 24); px = x; py = y;
      if (i < 2) continue;
      const L = 190 * Math.pow(Math.sin(Math.min(1, 0.12 + t * 0.95) * PI), 0.75) * (1 - t * 0.5) * rr(0.9, 1.05);
      for (let s = -1; s <= 1; s += 2) {
        const a = -PI / 2 + s * (1.32 - t * 0.35), m = Math.max(4, Math.round(L / 11));
        for (let q = 1; q <= m; q++) {
          const u = q / m, qx = x + Math.cos(a) * L * u, qy = y + Math.sin(a) * L * u, l2 = 17 * (1 - u * 0.75) + 3;
          leaf(qx, qy, a + 1.25, l2, l2 * 0.3, 104 + rr(-8, 8), 42, 27 + rr(-5, 6), 0.6);
          leaf(qx, qy, a - 1.25, l2, l2 * 0.3, 104 + rr(-8, 8), 42, 27 + rr(-5, 6), 0.6);
        }
        g.strokeStyle = hsl(90, 30, 22); g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
      }
    }
  });
  // 4: roseta de folhas palmadas (lóbulos finos), várias folhas pequenas em pecíolos, em duas camadas
  tile(4, () => {
    const pal = (cx, cy, R, rot, dl) => {
      stem(256, 506, cx, cy, 3, 55, 24 + dl);
      for (let k = 0; k < 11; k++) { const a = rot + (k - 5) * 0.52, L = R * (1 - Math.abs(k - 5) * 0.06) * rr(0.85, 1.1); leaf(cx, cy, a, L, L * 0.13, 90 + rr(-8, 6), 32, 25 + dl + rr(-3, 4), 0.55); }
    };
    for (let layer = 0; layer < 2; layer++) for (let k = 0; k < 9; k++) {
      const a = -PI / 2 + rr(-1.15, 1.15), r0 = rr(120, 400) * (1 - Math.abs(a + PI / 2) * 0.28);
      pal(256 + Math.cos(a) * r0, 504 + Math.sin(a) * r0, rr(62, 92), a + rr(-0.5, 0.5), layer ? 3 : -7);
    }
  });
  // 5: faixa de capim (lâminas finas enraizadas ao longo de toda a largura, alturas bem variadas, pontas curvas, algumas
  //    secas cor de palha e algumas com espiga). Qualquer janela horizontal do ladrilho é uma touceira — sem forma de leque.
  tile(5, () => {
    const blade = (x0, L, w, a, bend, dry, lig) => {
      const x1 = x0 + Math.cos(a) * L * 0.55, y1 = 508 + Math.sin(a) * L * 0.55, x2 = x0 + Math.cos(a) * L + bend, y2 = 508 + Math.sin(a) * L + Math.abs(bend) * 0.45;
      const gr = g.createLinearGradient(x0, 508, x2, y2); const h = dry ? 52 + rr(-8, 8) : 82 + rr(-14, 14), sa = dry ? 34 : 40, l = lig + rr(-5, 6);
      gr.addColorStop(0, hsl(h + 14, sa, l - 10)); gr.addColorStop(0.55, hsl(h, sa, l + 2)); gr.addColorStop(1, hsl(dry ? h - 4 : h - 26, sa - 4, l + (dry ? 20 : 13)));
      g.fillStyle = gr; g.beginPath(); g.moveTo(x0 - w / 2, 508); g.quadraticCurveTo(x1 - w * 0.4, y1, x2, y2); g.quadraticCurveTo(x1 + w * 0.4, y1, x0 + w / 2, 508); g.fill();
      return [x2, y2, a];
    };
    // camada de fundo: baixa, densa e escura (base do tufo); depois médias; por fim poucas lâminas altas e hastes com espiga
    for (let k = 0; k < 150; k++) blade(rr(14, 498), rr(70, 190), rr(3.5, 6), -PI / 2 + rr(-0.42, 0.42), rr(-22, 22), rnd() < 0.1, 19);
    for (let k = 0; k < 120; k++) blade(rr(18, 494), rr(170, 340), rr(3.5, 6.5), -PI / 2 + rr(-0.32, 0.32), rr(-55, 55), rnd() < 0.16, 24);
    for (let k = 0; k < 46; k++) blade(rr(30, 482), rr(320, 480), rr(3, 5.5), -PI / 2 + rr(-0.22, 0.22), rr(-80, 80), rnd() < 0.22, 27);
    for (let k = 0; k < 9; k++) {
      const e = blade(rr(60, 452), rr(380, 470), 2.4, -PI / 2 + rr(-0.12, 0.12), rr(-28, 28), true, 30);
      g.fillStyle = hsl(46 + rr(-6, 6), 38, 34 + rr(-4, 6)); for (let q = 0; q < 7; q++) { g.beginPath(); g.ellipse(e[0] + rr(-3, 3), e[1] + q * 5 - 4, 2.2, 5.5, rr(-0.5, 0.5), 0, TAU); g.fill(); }
    }
  });
  // 6: massa mais rala de folhas estreitas e pendentes (mais céu passando)
  tile(6, () => cluster({ depth: 2, step: 15, stemW: 1.3, branchP: 0.5, leafL: 25, leafW: 0.19, perNode: 3, leafP: 0.66, hue: 88, sat: 27, lig: 25, tipk: 0.58, droop: 1 }, 5, 2.3, 330, 450));
  // 7: folhas grandes brilhantes em leque (arbusto)
  tile(7, () => {
    for (let k = 0; k < 44; k++) {
      const a = -PI / 2 + rr(-1.15, 1.15), r0 = rr(20, 300) * (1 - Math.abs(a + PI / 2) * 0.3), x = 256 + Math.cos(a) * r0, y = 500 + Math.sin(a) * r0, L = rr(80, 140);
      stem(256, 506, x, y, 2, 60, 18);
      leaf(x, y, a + rr(-0.5, 0.5), L, L * 0.26, 112 + rr(-12, 10), 36, 19 + rr(-5, 8), 0.66);
    }
  });
  // --- lê os pixels, dilata a cor para as áreas transparentes e gera mips preservando a cobertura ---
  const img = g.getImageData(0, 0, W, H).data;
  const levels = Math.log2(TS) - 1;   // até ladrilhos de 4 px
  const tex = G.dev.createTexture({ size: [W, H], format: 'rgba8unorm-srgb', usage: TU.TB | TU.CD, mipLevelCount: levels });
  const toLinear = new Float32Array(256), toSRGB = new Uint8Array(65536);
  for (let i = 0; i < 256; i++) {
    const c = i / 255; toLinear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  for (let i = 0; i < toSRGB.length; i++) {
    const c = i / 65535; toSRGB[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  }
  // O nível original já está em bytes sRGB. Só os níveis menores precisam de RGBA linear pré-multiplicado.
  const w1 = W / 2, h1 = H / 2, first = new Float32Array(w1 * h1 * 4);
  let covered = 0;
  for (let y = 0; y < h1; y++) for (let x = 0; x < w1; x++) {
    let r = 0, g = 0, b = 0, alpha = 0;
    for (let dy = 0; dy < 2; dy++) {
      const start = ((2 * y + dy) * W + 2 * x) * 4;
      for (let j = start; j < start + 8; j += 4) {
        const a = img[j + 3]; if (a >= 128) covered++;
        r += toLinear[img[j]] * a; g += toLinear[img[j + 1]] * a; b += toLinear[img[j + 2]] * a; alpha += a;
      }
    }
    const o = (y * w1 + x) * 4;
    first[o] = r / 1020; first[o + 1] = g / 1020; first[o + 2] = b / 1020; first[o + 3] = alpha / 1020;
  }
  const pyr = [null, { d: first, w: w1, h: h1 }], cov0 = covered / (W * H);
  while (pyr[pyr.length - 1].h > 1) {
    const prev = pyr[pyr.length - 1], w = prev.w / 2, h = prev.h / 2, src = prev.d, dst = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, a = (y * 2 * prev.w + x * 2) * 4, c = a + prev.w * 4;
      for (let k = 0; k < 4; k++) dst[o + k] = (src[a + k] + src[a + 4 + k] + src[c + k] + src[c + 4 + k]) * 0.25;
    }
    pyr.push({ d: dst, w, h });
  }
  let firstBytes;
  for (let m = pyr.length - 1; m >= 1; m--) {
    const { d, w, h } = pyr[m], parent = pyr[m + 1], n = w * h;
    const out = m < levels ? new Uint8Array(n * 4) : null;
    let scale = 1;
    if (out) {
      let lo = 0.5, hi = 6;
      for (let it = 0; it < 12; it++) {
        scale = (lo + hi) * 0.5;
        const cutoff = 0.5 / scale;
        let count = 0; for (let j = 3; j < d.length; j += 4) if (d[j] >= cutoff) count++;
        if (count < cov0 * n) lo = scale; else hi = scale;
      }
    }
    // Passagem descendente: o próprio mip guarda a cor dilatada para seus filhos.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, a = d[o + 3], k = a > 1e-3 ? Math.min(1, a * 4) : 0;
      const q = parent ? ((y >> 1) * parent.w + (x >> 1)) * 4 : 0;
      for (let ch = 0; ch < 3; ch++) {
        const up = parent ? parent.d[q + ch] : (ch === 0 ? 0.06 : ch === 1 ? 0.115 : 0.03);
        d[o + ch] = k ? up + (Math.min(1, d[o + ch] / a) - up) * k : up;
        if (out) out[o + ch] = toSRGB[Math.round(d[o + ch] * 65535)];
      }
      if (out) out[o + 3] = Math.round(255 * Math.min(1, a * scale));
    }
    if (out) G.dev.queue.writeTexture({ texture: tex, mipLevel: m }, out, { bytesPerRow: w * 4 }, [w, h]);
    if (m === 1) firstBytes = out;
  }
  // Duas gaussianas [1,4,6,4,1]/16 equivalem a uma [1,8,28,56,70,56,28,8,1]/256 por eixo.
  // Os quatro pixels extras em cada ponta são transparentes, como a margem do atlas.
  const row = new Uint8Array(W + 8), blur = new Uint16Array(W * (H + 8));
  for (let y = 0; y < H; y++) {
    const base = y * W;
    for (let x = 0; x < W; x++) row[x + 4] = img[(base + x) * 4 + 3];
    for (let x = 0; x < W; x++) {
      blur[base + 4 * W + x] = row[x] + row[x + 8] + 8 * (row[x + 1] + row[x + 7]) +
        28 * (row[x + 2] + row[x + 6]) + 56 * (row[x + 3] + row[x + 5]) + 70 * row[x + 4];
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4, a = img[o + 3], q = ((y >> 1) * w1 + (x >> 1)) * 4;
    // Com alfa >= 1/4 a dilatação não altera o RGB original do canvas.
    if (a === 0) {
      img[o] = firstBytes[q]; img[o + 1] = firstBytes[q + 1]; img[o + 2] = firstBytes[q + 2];
    } else if (a < 64) {
      for (let ch = 0; ch < 3; ch++) {
        const up = first[q + ch], c = up + (toLinear[img[o + ch]] - up) * (a * 4 / 255);
        img[o + ch] = toSRGB[Math.round(c * 65535)];
      }
    }
    const sum = blur[i] + blur[i + 8 * W] + 8 * (blur[i + W] + blur[i + 7 * W]) +
      28 * (blur[i + 2 * W] + blur[i + 6 * W]) + 56 * (blur[i + 3 * W] + blur[i + 5 * W]) + 70 * blur[i + 4 * W];
    img[o + 3] = Math.round(sum / 65536);
  }
  G.dev.queue.writeTexture({ texture: tex }, img, { bytesPerRow: W * 4 }, [W, H]);
  return tex;
}
