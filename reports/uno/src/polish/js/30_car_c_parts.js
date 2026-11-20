// Peças do carro: para-choques, caixas de roda, faróis, retrovisores, limpadores, interior, rack + escada, rodas, volante, atlas.
// polilinha 2D com cantos arredondados (filete parabólico): pts = [[a,b,raio]...]; at(s) → [a, b, ta, tb]
function carPath(pts) {
  const n = pts.length, cum = [0], dir = [];
  for (let i = 0; i < n - 1; i++) { const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dy); cum.push(cum[i] + l); dir.push([dx / l, dy / l]); }
  const L = cum[n - 1];
  return {
    L, at(s, o) {
      s = clamp(s, 0, L); let k = 0; while (k < n - 2 && s > cum[k + 1]) k++;
      const t = s - cum[k]; let a = pts[k][0] + dir[k][0] * t, b = pts[k][1] + dir[k][1] * t, ta = dir[k][0], tb = dir[k][1];
      for (let i = 1; i < n - 1; i++) {
        const r = pts[i][2] || 0; if (!r) continue; const d = s - cum[i]; if (d <= -r || d >= r) continue;
        const g = d < 0 ? (r + d) * (r + d) / (4 * r) : (r - d) * (r - d) / (4 * r), h = d < 0 ? (r + d) / (2 * r) : -(r - d) / (2 * r);
        const ex = dir[i][0] - dir[i - 1][0], ey = dir[i][1] - dir[i - 1][1];
        a += ex * g; b += ey * g; ta += ex * h; tb += ey * h;
      }
      o[0] = a; o[1] = b; o[2] = ta; o[3] = tb; return o;
    }
  };
}
// x da superfície do topo (frente ou traseira) em (z, y)
function carTopX(z, y, rear) {
  let a = rear ? -1.76 : 1.6, b = rear ? -1.35 : 1.95;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2, f = carYtop(m, z) - y; if ((f > 0) === !rear) a = m; else b = m; }
  return (a + b) / 2;
}
const _cp = new Float64Array(4), _cq = new Float64Array(4);
function carBumper(mb, path, prof, sign, field, nu, nv, sC, side, yTop, taper) {
  // sign: +1 normal para fora = (tz, -tx) (frente), -1 = (-tz, tx) (traseira)
  // side: fator do ressalto na lateral; taper: quanto a borda inferior sobe ao chegar na caixa de roda
  mb.patch((u, v, o) => {
    const sp = u * path.L; path.at(sp, _cp); prof.at(v * prof.L, _cq);
    const l = 1 / Math.hypot(_cp[2], _cp[3]), nx = _cp[3] * l * sign, nz = -_cp[2] * l * sign;
    const k = _cq[0] > 0 ? lerp(1, side, smooth(sC - 0.06, sC + 0.14, sp)) : 1;
    const hk = 1 - taper * smooth(sC + 0.05, path.L, sp);
    o[0] = _cp[0] + nx * _cq[0] * k; o[1] = yTop - (yTop - _cq[1]) * hk; o[2] = _cp[1] + nz * _cq[0] * k;
  }, 0, 1, 0, 1, { nu, nv, flip: sign < 0, field, rim: 0.02, uv: (u, v, P) => { _cuv[0] = P[2]; _cuv[1] = P[1]; return _cuv; } });
}
function carBuildParts(mb, gl) {
  const v0 = mb.nv, i0 = mb.ni, gv0 = gl.nv, gi0 = gl.ni;
  // ================= para-choques (plástico preto texturizado) =================
  mb.mat(CM.PLASTIC).color(0.02, 0.02, 0.021);
  // dianteiro: peça baixa (0,30–0,60 m), rente à frente, logo abaixo dos faróis; a lateral acompanha o para-lama até a caixa de roda
  const fPath = carPath([[1.869, 0], [1.862, 0.30, 0.15], [1.838, 0.56, 0.12], [1.822, 0.686, 0.07], [1.70, 0.702, 0.06], [1.49, 0.722, 0.1], [1.25, 0.742]]);
  // perfil: borda superior saliente (lábio), face, friso rebaixado, saia
  const fProf = carPath([[-0.09, 0.600], [0.026, 0.598, 0.004], [0.034, 0.590, 0.004], [0.034, 0.574, 0.004], [0.029, 0.568, 0.004], [0.029, 0.474, 0.003], [0.023, 0.470, 0.003], [0.023, 0.458, 0.003], [0.029, 0.454, 0.003], [0.028, 0.340, 0.012], [0.006, 0.308, 0.008], [-0.07, 0.300]]);
  const fSC = 0.30 + 0.261 + 0.127;
  carBumper(mb, fPath, fProf, 1, (u, v, P) => {
    let f = carArchF(P) - 0.004;
    // entradas de ar laterais, fenda acima da placa e rebaixo da placa
    if (P[0] > 1.78) f = Math.min(f, carRRect(P[2] - 0.45, P[1] - 0.386, 0.15, 0.026, 0.01), carRRect(P[2], P[1] - 0.538, 0.21, 0.0075, 0.006), carRRect(P[2], P[1] - 0.476, 0.212, 0.072, 0.008), carRRect(P[2], P[1] - 0.352, 0.19, 0.03, 0.01));   // + entrada de ar central abaixo da placa
    return -f;
  }, 150, 46, fSC, 0.3, 0.600, 0.3);
  const rPath = carPath([[-1.692, 0], [-1.688, 0.30, 0.15], [-1.674, 0.58, 0.1], [-1.657, 0.70, 0.07], [-1.60, 0.722, 0.05], [-1.49, 0.735, 0.1], [-1.26, 0.751]]);
  const rProf = carPath([[-0.09, 0.572], [0.023, 0.570, 0.004], [0.031, 0.562, 0.004], [0.031, 0.547, 0.004], [0.026, 0.541, 0.004], [0.026, 0.468, 0.003], [0.02, 0.464, 0.003], [0.02, 0.452, 0.003], [0.026, 0.448, 0.003], [0.025, 0.376, 0.014], [0.006, 0.346, 0.008], [-0.07, 0.338]]);
  carBumper(mb, rPath, rProf, -1, (u, v, P) => -(carArchF(P) - 0.004), 124, 42, 0.30 + 0.28 + 0.121, 0.4, 0.572, 0.22);
  // fundo das entradas de ar dianteiras (palhetas)
  mb.mat(CM.GRILLE, 1).color(0.008, 0.008, 0.009);
  mb.quad(1.862, 0.33, 0.62, 1.862, 0.33, 0, 1.862, 0.425, 0, 1.862, 0.425, 0.62);
  mb.quad(1.876, 0.522, 0.23, 1.876, 0.522, 0, 1.876, 0.552, 0, 1.876, 0.552, 0.23);
  // fundo do rebaixo da placa
  mb.mat(CM.PLASTIC).color(0.016, 0.016, 0.017);
  mb.quad(1.886, 0.396, 0.222, 1.886, 0.396, 0, 1.886, 0.556, 0, 1.886, 0.556, 0.222);
  // ================= caixas de roda e fundo =================
  mb.mat(CM.UNDER).color(0.006, 0.006, 0.007);
  for (const ax of [CS.AXF, CS.AXR]) {
    const R0 = CS.ARCH_R + 0.006, N = 28, zo = carZL(ax, 0.55) - 0.012, zi = 0.33;
    for (let i = 0; i < N; i++) {
      // o forro termina na altura da borda inferior do para-choque no lado do balanço (não fica pendurado abaixo dele)
      const aS = ax > 0 ? 12 : -18, aE = ax > 0 ? 198 : 163;
      const a0 = (aS + (aE - aS) * i / N) * PI / 180, a1 = (aS + (aE - aS) * (i + 1) / N) * PI / 180;
      const x0 = ax + Math.cos(a0) * R0, y0 = CS.ARCH_Y + Math.sin(a0) * R0, x1 = ax + Math.cos(a1) * R0, y1 = CS.ARCH_Y + Math.sin(a1) * R0;
      const a = mb.v(x0, y0, zo, -Math.cos(a0), -Math.sin(a0), 0, 0, 0), b = mb.v(x0, y0, zi, -Math.cos(a0), -Math.sin(a0), 0, 0, 1), c = mb.v(x1, y1, zi, -Math.cos(a1), -Math.sin(a1), 0, 1, 1), d = mb.v(x1, y1, zo, -Math.cos(a1), -Math.sin(a1), 0, 1, 0);
      mb.quadI(a, d, c, b);
    }
    mb.quad(ax - 0.33, 0.25, zi, ax + 0.33, 0.25, zi, ax + 0.33, 0.66, zi, ax - 0.33, 0.66, zi);
  }
  // fechamentos sob os para-choques (escuros) + assoalho por baixo (meio carro; espelhado depois)
  mb.quad(1.56, 0.2, 0.56, 1.56, 0.2, 0, 1.56, 0.42, 0, 1.56, 0.42, 0.56);
  mb.quad(-1.33, 0.2, 0, -1.33, 0.2, 0.56, -1.33, 0.42, 0.56, -1.33, 0.42, 0);
  // fundo elevado sob os balanços (não aparece por baixo dos para-choques)
  mb.quad(1.56, 0.42, 0, 1.86, 0.42, 0, 1.86, 0.42, 0.72, 1.56, 0.42, 0.72);
  mb.quad(-1.68, 0.42, 0, -1.33, 0.42, 0, -1.33, 0.42, 0.74, -1.68, 0.42, 0.74);
  // fundo: largura inteira só entre as rodas; ao lado das rodas fica estreito (o plano inteiro atravessava pneu e calota e
  // aparecia como um risco fino horizontal na calota)
  mb.quad(-0.84, 0.2, 0, 0.84, 0.2, 0, 0.84, 0.2, 0.705, -0.84, 0.2, 0.705);
  mb.quad(0.84, 0.2, 0, 1.56, 0.2, 0, 1.56, 0.2, 0.5, 0.84, 0.2, 0.5);
  mb.quad(-1.33, 0.2, 0, -0.84, 0.2, 0, -0.84, 0.2, 0.5, -1.33, 0.2, 0.5);
  // ================= farol: refletor cromado em cuba atrás da lente =================
  {
    const z0 = CL.hlZ0 + 0.003, z1 = CL.hlZ1 - 0.003, y0 = CL.lY - CL.lH + 0.003, y1 = CL.lY + CL.lH - 0.003, D = 0.062;
    const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2, hz = (z1 - z0) / 2, hy = (y1 - y0) / 2;
    const dep = (a, b) => 0.006 + D * (1 - a * a) * (1 - b * b);
    mb.mat(CM.REFLECTOR).color(0.9, 0.9, 0.92);
    mb.patch((u, v, o) => { const z = zc + u * hz, y = yc + v * hy, d = dep(u, v), x = carTopX(z, y, false); o[0] = x - d * 0.97; o[1] = y - d * 0.2; o[2] = z; }, -1, 1, -1, 1, { nu: 22, nv: 12, flip: true, uv: (u, v, P) => { _cuv[0] = u; _cuv[1] = v; return _cuv; } });
    // lâmpada (pequena, no fundo da cuba)
    const xb = carTopX(zc, yc, false) - (dep(0, 0) - 0.012) * 0.97, ybb = yc - (dep(0, 0) - 0.012) * 0.2;
    // Bulbo arredondado junto ao soquete metálico.
    mb.push(m4translate(m4(), xb, ybb, zc)); mb.push(m4rotZ(m4(), 0.2));
    mb.mat(CM.REFLECTOR, 2).color(0.85, 0.85, 0.86);
    mb.lathe([[-0.016,0.012],[-0.009,0.012],[-0.006,0.008]], 14);
    mb.mat(CM.REFLECTOR, 1).color(1, 0.95, 0.8);
    mb.lathe([[-0.007,0.006],[0.005,0.008],[0.013,0.0075],[0.018,0.005],[0.020,0.0002]], 12);
    mb.pop(); mb.pop();
  }
  // ================= retrovisores externos: carcaça retangular, braço sanfonado, base na porta =================
  mb.mat(CM.PLASTIC).color(0.013, 0.013, 0.014);
  mb.push(m4translate(m4(), 0.566, 0.997, 0.849)); mb.push(m4rotY(m4(), 0.12));
  const mirrorSection = (a, radius, x, o) => {
    const c = Math.cos(a), s = Math.sin(a);
    const z = Math.sign(c) * Math.pow(Math.abs(c), 0.48);
    o[0] = x; o[2] = radius * 0.075 * z;
    o[1] = radius * (0.0415 * Math.sign(s) * Math.pow(Math.abs(s), 0.55) * (1 - 0.13 * z) + 0.004 * z);
  };
  const shellX = [-0.031, -0.031, -0.026, -0.014, 0.012, 0.027, 0.035, 0.037];
  const shellR = [0.001, 0.91, 0.98, 1, 0.95, 0.77, 0.42, 0.001];
  mb.patch((a, v, o) => { const i = Math.min(Math.floor(v), shellR.length - 2), t = v - i;
    mirrorSection(a, lerp(shellR[i], shellR[i + 1], t), lerp(shellX[i], shellX[i + 1], t), o);
  }, -PI, PI, 0, shellR.length - 1, { nu: 28, nv: shellR.length - 1, flip: true });
  mb.mat(CM.MIRROR).color(0.62, 0.64, 0.67);
  mb.patch((a, r, o) => mirrorSection(a, r, -0.032, o), -PI, PI, 0.0001, 0.865, { nu: 28, nv: 1, flip: true });
  mb.pop(); mb.pop();
  mb.mat(CM.RUBBER).color(0.012, 0.012, 0.013);
  mb.push(m4translate(m4(), 0.576, 0.994, 0.742)); mb.push(m4rotY(m4(), -PI / 2));
  { const pr = []; for (let i = 0; i <= 8; i++) pr.push([i * 0.006, 0.021 + (i & 1 ? 0.003 : 0)]); mb.lathe(pr, 14); }
  mb.pop(); mb.pop();
  mb.mat(CM.PLASTIC).color(0.013, 0.013, 0.014);
  mb.rbox(0.585, 0.991, 0.742, 0.089, 0.062, 0.018, 0.007, 2);
  // ================= interior (metade direita; espelhado) =================
  mb.mat(CM.INTERIOR).color(0.05, 0.05, 0.055);
  mb.quad(-0.86, 0.235, 0.72, 0.85, 0.235, 0.72, 0.85, 0.235, 0, -0.86, 0.235, 0);
  mb.quad(-1.33, 0.235, 0.5, -0.86, 0.235, 0.5, -0.86, 0.235, 0, -1.33, 0.235, 0);   // ao lado das rodas traseiras o carpete é estreito (o plano inteiro atravessava a calota: risco fino horizontal)
  mb.quad(-1.63, 0.45, 0.72, -1.33, 0.45, 0.72, -1.33, 0.45, 0, -1.63, 0.45, 0);                         // assoalho do porta-malas (acima do fundo elevado)                       // assoalho (carpete)
  mb.quad(0.82, 0.2, 0, 0.82, 0.2, 0.72, 0.82, 0.93, 0.72, 0.82, 0.93, 0);                               // parede corta-fogo
  mb.mat(CM.INTERIOR, 3).color(0.045, 0.045, 0.05);
  mb.rbox(0.60, 0.80, 0.34, 0.40, 0.22, 0.70, 0.05, 4);                                                  // painel
  mb.rbox(0.45, 0.52, 0.05, 0.3, 0.34, 0.12, 0.03, 2);                                                   // console
  mb.mat(CM.INTERIOR, 3).color(0.075, 0.075, 0.082); mb.rbox(0.62, 0.915, 0.34, 0.34, 0.024, 0.69, 0.01, 2);              // tampo do painel (mais claro)
  mb.mat(CM.GRILLE).color(0.02, 0.02, 0.022);                                                                              // saídas de ar (palhetas)
  mb.box(0.397, 0.862, 0.615, 0.008, 0.045, 0.1); mb.box(0.397, 0.862, 0.09, 0.008, 0.045, 0.1);
  mb.mat(CM.INTERIOR, 3).color(0.03, 0.03, 0.034); mb.rbox(0.396, 0.775, 0.34, 0.012, 0.085, 0.3, 0.005, 2);               // tampa do porta-luvas / rádio
  // banco dianteiro
  const seat = (x, z, w, color) => {
    mb.mat(CM.INTERIOR, 4).color(color[0], color[1], color[2]);
    mb.rbox(x, 0.43, z, 0.5, 0.15, w, 0.055, 4);
    mb.push(m4translate(m4(), x - 0.26, 0.47, z)); mb.push(m4rotZ(m4(), 0.33)); mb.rbox(0, 0.3, 0, 0.13, 0.6, w - 0.02, 0.055, 4);
    mb.color(color[0] * 1.9, color[1] * 1.9, color[2] * 2.1); mb.rbox(0.058, 0.3, 0, 0.03, 0.46, w - 0.2, 0.012, 2); mb.pop(); mb.pop();   // inserto de tecido claro no encosto
    mb.rbox(x + 0.02, 0.498, z, 0.36, 0.03, w - 0.2, 0.012, 2);                                                                          // e no assento
  };
  seat(-0.03, 0.345, 0.5, [0.07, 0.072, 0.08]);
  mb.push(m4translate(m4(), -0.29, 0.47, 0.345)); mb.push(m4rotZ(m4(), 0.33));
  mb.mat(CM.INTERIOR, 2).color(0.065, 0.067, 0.075); mb.rbox(0.005, 0.71, 0, 0.1, 0.17, 0.25, 0.04, 4);
  mb.mat(CM.STEEL).color(0.3, 0.3, 0.3); mb.cyl(0, 0.58, -0.06, 0.006, 0.64, 0.006, 6); mb.cyl(0, 0.58, 0.06, 0.006, 0.64, 0.006, 6);
  mb.pop(); mb.pop();
  // banco traseiro (inteiriço) e tampão
  mb.mat(CM.INTERIOR, 4).color(0.07, 0.072, 0.08);
  mb.rbox(-0.93, 0.45, 0.31, 0.46, 0.15, 0.62, 0.055, 4);
  mb.push(m4translate(m4(), -1.16, 0.5, 0.31)); mb.push(m4rotZ(m4(), 0.36)); mb.rbox(0, 0.25, 0, 0.12, 0.52, 0.62, 0.05, 4); mb.pop(); mb.pop();
  mb.mat(CM.INTERIOR).color(0.04, 0.04, 0.045); mb.box(-1.40, 0.925, 0.3, 0.28, 0.02, 0.6);
  // ================= rack de teto (pés) =================
  mb.mat(CM.STEEL).color(0.03, 0.03, 0.032);
  for (const xb of [CRK.x0, CRK.x1]) {
    const st = carStation(xb);
    mb.rbox(xb, st.yE + 0.045, st.zE - 0.035, 0.075, 0.07, 0.06, 0.012, 2);
    mb.push(m4translate(m4(), xb, st.yE - 0.012, st.zE + 0.012)); mb.push(m4rotX(m4(), 0.34)); mb.box(0, 0, 0, 0.06, 0.07, 0.006); mb.pop(); mb.pop();
  }
  mb.mirror(v0, i0, 2); gl.mirror(gv0, gi0, 2);
  // ======================= peças não simétricas =======================
  // barras do rack + escada + cintas
  mb.mat(CM.STEEL).color(0.035, 0.035, 0.038);
  for (const xb of [CRK.x0, CRK.x1]) mb.rbox(xb, CRK.barY, 0, 0.036, 0.028, 1.2, 0.006, 2);
  carLadder(mb);
  // limpadores
  carWipers(mb);
  // escapamento: silencioso transversal (aço fosco) + ponteira curta saindo para trás, como na foto
  mb.mat(CM.STEEL, 1).color(0.03, 0.03, 0.032);
  mb.push(m4translate(m4(), -1.43, 0.272, 0.0)); mb.push(m4rotX(m4(), PI / 2)); mb.cyl(0, 0, 0, 0.062, 0.34, 0.062, 20, true, true); mb.pop(); mb.pop();
  mb.mat(CM.STEEL, 1).color(0.035, 0.035, 0.038);
  mb.tube([[-1.44, 0.268, -0.2], [-1.56, 0.26, -0.2], [-1.705, 0.256, -0.2]], 0.019, 10);   // ponteira curta, escura, reta para trás
  // volante: coluna fixa
  mb.mat(CM.INTERIOR, 3).color(0.04, 0.04, 0.045);
  mb.tube([[0.36, 0.875, -0.36], [0.56, 0.80, -0.36]], 0.03, 10);
  mb.rbox(0.47, 0.925, -0.36, 0.2, 0.07, 0.32, 0.03, 3);        // capela dos instrumentos
  // retrovisor interno, alavanca de câmbio, freio de mão
  mb.rbox(0.23, 1.29, 0, 0.025, 0.055, 0.2, 0.012, 2); mb.tube([[0.24, 1.29, 0], [0.2, 1.35, 0]], 0.008, 6);
  mb.tube([[0.2, 0.42, 0.0], [0.17, 0.6, 0.0]], 0.01, 6); mb.rbox(0.168, 0.62, 0, 0.045, 0.045, 0.045, 0.02, 3);
  mb.rbox(-0.12, 0.40, 0, 0.3, 0.05, 0.04, 0.015, 2);
  carDriver(mb, gl);
  // emblema dianteiro: cinco barras cromadas inclinadas sobrepostas ao centro da grade (ocupam a altura das duas fendas)
  if (false) {   // 公開版: 実在のメーカーの印（前のグリルの斜めの棒 5 本）を外す
    const y = 0.694, x = carTopX(0, y, false), xu = carTopX(0, y + 0.02, false), sl = (xu - x) / 0.02, l = Math.hypot(1, sl);
    const B = m4basis(m4(), 0, 0, -1, sl / l, 1 / l, 0, 1 / l, -sl / l, 0, x + 0.002, y, 0);
    mb.mat(CM.CHROME, 2).color(0.93, 0.93, 0.95); mb.push(B);
    const sh = m4(); sh[4] = 0.3;
    mb.push(sh); for (let i = 0; i < 5; i++) mb.rbox((i - 2) * 0.0165, 0, 0.004, 0.0072, 0.09, 0.008, 0.002, 2); mb.pop(); mb.pop();
  }
  // placas e emblemas traseiros (decalques do atlas)
  carDecals(mb);
}
// Perfis em anéis: a mesma superfície define o casco, a borda da abertura e a viseira.
function carDriver(mb, gl) {
  const zd = -0.345;
  const profile = (rows, v, out) => {
    const i = clamp(Math.floor(v), 0, rows.length - 2);
    for (let k = 0; k < rows[i].length; k++) out[k] = lerp(rows[i][k], rows[i + 1][k], v - i);
  };
  const row = new Float64Array(5);
  const rings = (rows, chin = false, offset = 0) => (a, v, o) => {
    profile(rows, v, row);
    const c = Math.cos(a), s = Math.sin(a);
    o[0] = row[1] + (row[2] + offset) * c;
    o[1] = row[0] + (chin ? 0.035 * (1 - smooth(0, 4, v)) * (1 - c) * 0.5 : 0);
    o[2] = zd + (row[3] + offset) * s;
  };

  // Do quadril ao colar: cintura estreita, peito inclinado e ombros em queda.
  const torso = [[0.48,-0.12,0.095,0.142], [0.57,-0.14,0.115,0.157], [0.69,-0.17,0.11,0.15],
    [0.84,-0.21,0.122,0.174], [0.943,-0.238,0.116,0.20], [0.987,-0.246,0.087,0.173], [1.018,-0.25,0.060,0.078]];
  mb.mat(CM.INTERIOR, 2).color(0.119, 0.027, 0.020);
  mb.patch(rings(torso), -PI, PI, 0, torso.length - 1, { nu: 20, nv: torso.length - 1, flip: true });
  mb.rbox(0.02, 0.535, zd, 0.44, 0.13, 0.34, 0.06, 2);
  mb.mat(CM.INTERIOR, 3).color(0.024, 0.026, 0.028);
  const collar = [[0.997,-0.251,0.067,0.077],[1.013,-0.249,0.072,0.079],[1.026,-0.246,0.067,0.073],
    [1.034,-0.243,0.063,0.066],[1.040,-0.241,0.066,0.069],[1.061,-0.23,0.058,0.060],[1.096,-0.216,0.062,0.059]];
  mb.push(m4translate(m4(),0.018,0,0.015));
  mb.patch(rings(collar), -PI, PI, 0, collar.length - 1, { nu: 18, nv: collar.length - 1, flip: true }); mb.pop();
  mb.mat(CM.INTERIOR, 3).color(0.018, 0.019, 0.020);
  mb.sweep([[-0.28,0.975,zd-0.161],[-0.202,1.001,zd-0.133],[-0.137,0.934,zd-0.095],[-0.095,0.81,zd-0.025],[-0.08,0.67,zd+0.106],[-0.094,0.60,zd+0.15]],
    [[-0.023,0.003],[0.023,0.003],[0.023,-0.003],[-0.023,-0.003]], { closedProfile: true, hard: true, up: [1,0.25,0] });

  // A manga afina no punho. Os dois vincos sobre o cotovelo ficam na silhueta.
  const sleeve = [[-0.285,0.96,0.144,0.04,0.048],[-0.236,0.95,0.177,0.062,0.065],[-0.165,0.918,0.195,0.053,0.053],
    [-0.095,0.853,0.212,0.045,0.045],[-0.065,0.835,0.215,0.052,0.049],[-0.044,0.834,0.215,0.044,0.044],
    [-0.024,0.835,0.214,0.049,0.048],[0.035,0.852,0.214,0.047,0.046],[0.155,0.892,0.201,0.042,0.041],
    [0.243,0.923,0.187,0.034,0.035],[0.287,0.935,0.179,0.032,0.031]];
  for (const side of [-1, 1]) {
    mb.mat(CM.INTERIOR, 6).color(0.174, 0.033, 0.022);
    mb.patch((a, v, o) => {
      profile(sleeve, v, row);
      o[0] = row[0]; o[1] = row[1] + row[3] * Math.cos(a);
      o[2] = zd + row[2] * side + row[4] * Math.sin(a);
    }, -PI, PI, 0, sleeve.length - 1, { nu: 14, nv: sleeve.length - 1 });
    const z = -0.36 + side * 0.17;
    mb.mat(CM.INTERIOR, 3).color(0.028, 0.030, 0.032);
    mb.tube([[0.263,0.924,zd+side*0.184],[0.296,0.939,zd+side*0.178],[0.325,0.945,z]], 0.034, 10);
    // Palma atrás do aro, dedos dobrados sobre a frente e polegar por dentro.
    mb.rbox(0.348, 0.954, z, 0.080, 0.062, 0.061, 0.027, 3);
    for (let j = 0; j < 4; j++) {
      const h = 0.932 + j * 0.013, fz = z + side * (0.015 - j * 0.003);
      mb.tube([[0.35,h,fz],[0.376,h+0.004,fz+side*0.009],[0.391,h+0.008,fz],[0.387,h+0.009,fz-side*0.015]], 0.009, 7);
    }
    mb.tube([[0.345,0.974,z],[0.36,0.976,z-side*0.024],[0.377,0.964,z-side*0.027]], 0.012, 8);
  }

  const headPose = m4translate(m4(), 0.075, -0.014, 0.035);
  mb.push(headPose); gl.push(headPose);
  const shell = [[1.054,-0.238,0.075,0.073],[1.066,-0.224,0.106,0.090],[1.087,-0.224,0.124,0.101],
    [1.126,-0.239,0.134,0.111],[1.163,-0.249,0.132,0.117],[1.199,-0.250,0.130,0.119],
    [1.228,-0.258,0.123,0.115],[1.254,-0.264,0.110,0.102],[1.278,-0.267,0.086,0.080],
    [1.296,-0.267,0.054,0.051],[1.303,-0.265,0.001,0.001]];
  const port = (a, v, p) => {
    const side = 1 - Math.cos(a);
    return Math.hypot(Math.max(0, Math.abs(a) - 1.04) / 0.69,
      (p[1] - (1.173 + 0.010 * side)) / (0.036 - 0.006 * side)) - 1;
  };
  mb.mat(CM.GLOSS).color(0.40, 0.42, 0.425);
  mb.patch(rings(shell, true), -PI, PI, 0, shell.length - 1, { nu: 44, nv: 30, flip: true,
    field: (a, v, p) => -port(a, v, p), rim: 0.008, rimMat: m => m.mat(CM.RUBBER).color(0.018,0.021,0.023) });
  // Rosto recuado em relação à borda: ponte do nariz em relevo e têmporas sob a balaclava.
  mb.mat(CM.INTERIOR, 5).color(0.37,0.197,0.12);
  mb.patch((a, v, o) => {
    const nose = 0.014 * Math.max(0, 1 - Math.abs(a) * 3) * (1 - v);
    o[0] = -0.248 + (0.103 + nose) * Math.cos(a);
    o[1] = 1.125 + 0.102 * v; o[2] = zd + 0.098 * Math.sin(a);
  }, -1.95, 1.95, 0, 1, { nu: 32, nv: 6, flip: true });
  gl.mat(2).color(0.52,0.595,0.62);
  gl.patch(rings(shell, true, 0.0025), -1.9, 1.9, 3, 6, {
    nu: 30, nv: 10, flip: true, field: (a,v,p) => port(a,v,p) - 0.14 });
  for (const side of [-1, 1]) {
    mb.push(m4translate(m4(),-0.278,1.182,zd+side*0.114)); mb.push(m4rotX(m4(),side*PI/2));
    mb.mat(CM.RUBBER).color(0.022,0.025,0.027); mb.cyl(0,0,0,0.012,0.004,0.011,16,false,true);
    mb.mat(CM.STEEL,1).color(0.20,0.21,0.22); mb.cyl(0,0.004,0,0.0055,0.005,0.005,12,false,true);
    mb.pop(); mb.pop();
  }
  mb.pop(); gl.pop();
}
const CRK = { x0: 0.0, x1: -0.98, barY: 1.47, railZ: 0.205, lx0: -1.98, lx1: 1.22 };
function carLadder(mb) {
  const yb = CRK.barY + 0.014, h = 0.062, yc = yb + h / 2, L = CRK.lx1 - CRK.lx0, xc = (CRK.lx0 + CRK.lx1) / 2;
  // longarinas (perfil retangular) e ponteiras de borracha
  for (const s of [-1, 1]) {
    mb.mat(CM.ALU).color(0.86, 0.87, 0.88); mb.rbox(xc, yc, s * CRK.railZ, L, h, 0.024, 0.004, 1);
    mb.mat(CM.RUBBER).color(0.02, 0.02, 0.02);
    mb.rbox(CRK.lx0 - 0.012, yc, s * CRK.railZ, 0.04, h + 0.008, 0.034, 0.006, 1); mb.rbox(CRK.lx1 + 0.012, yc, s * CRK.railZ, 0.04, h + 0.008, 0.034, 0.006, 1);
  }
  // degraus
  mb.mat(CM.ALU, 1).color(0.88, 0.89, 0.9);
  const n = 11, sp = 0.28, xs = xc - (n - 1) * sp / 2;
  mb.push(m4rotX(m4(), PI / 2));
  for (let i = 0; i < n; i++) mb.cyl(xs + i * sp, -CRK.railZ - 0.0135, -yc, 0.017, CRK.railZ + 0.0135, 0.017, 14, true, true);
  mb.pop();
  // cintas com catraca, uma em cada barra
  for (const xb of [CRK.x0, CRK.x1]) {
    const z0 = CRK.railZ + 0.0165, y0 = CRK.barY - 0.0165, y1 = yb + h + 0.0025, r = 0.008, path = [];
    const corner = (cz, cy, a0) => { for (let k = 0; k <= 4; k++) { const a = a0 + k * PI / 8; path.push([xb, cy + Math.sin(a) * r, cz + Math.cos(a) * r]); } };
    corner(z0 - r, y1 - r, 0); corner(-z0 + r, y1 - r, PI / 2); corner(-z0 + r, y0 + r, PI); corner(z0 - r, y0 + r, 1.5 * PI);
    mb.mat(CM.STRAP).color(0.85, 0.28, 0.02);
    mb.sweep(path, [[-0.0013, -0.019], [0.0013, -0.019], [0.0013, 0.019], [-0.0013, 0.019]], { closed: true, closedProfile: true, hard: true, up: [1, 0, 0], vScale: 0.02 });
    // catraca e sobra da cinta
    mb.mat(CM.CHROME, 1).color(0.62, 0.62, 0.64); mb.rbox(xb, y1 + 0.011, 0.07, 0.052, 0.02, 0.085, 0.004, 1);
    mb.rbox(xb, y1 + 0.028, 0.1, 0.04, 0.012, 0.07, 0.004, 1);
    mb.mat(CM.STRAP).color(0.85, 0.28, 0.02); mb.box(xb, y1 + 0.004, -0.06, 0.036, 0.004, 0.14);
  }
}
function carWipers(mb) {
  const wip = (zp, z1, xe0, lift) => {
    // braço do pivô até o meio da palheta; palheta deitada na base do para-brisa
    const P = (z, xe) => { const zz = z / 0.72, x = xe + carBulge(xe) * (1 - zz * zz); return [x, carYtop(x, z) + 0.016, z]; };
    mb.mat(CM.RUBBER).color(0.015, 0.015, 0.015);
    const zm = (zp + z1) / 2, a = P(zp, 0.69), m = P(zm + (z1 - zp) * 0.1, xe0 - lift * 0.5);
    mb.rbox(a[0], a[1] - 0.004, a[2], 0.03, 0.022, 0.03, 0.008, 2);
    mb.sweep([a, [(a[0] + m[0]) / 2, (a[1] + m[1]) / 2 + 0.006, (a[2] + m[2]) / 2], m], [[-0.006, -0.003], [0.006, -0.003], [0.006, 0.003], [-0.006, 0.003]], { closedProfile: true, hard: true });
    const pts = []; for (let k = 0; k <= 8; k++) { const z = lerp(zp + (z1 - zp) * 0.12, z1, k / 8); pts.push(P(z, lerp(xe0, xe0 - lift, k / 8))); }
    mb.sweep(pts, [[-0.007, -0.008], [0.007, -0.008], [0.004, 0.006], [-0.004, 0.006]], { closedProfile: true, hard: true });
  };
  wip(0.30, -0.22, 0.655, 0.03); wip(-0.24, -0.66, 0.655, 0.05);
  // limpador traseiro
  mb.mat(CM.RUBBER).color(0.015, 0.015, 0.015);
  const PR = (z, y) => { const x = carTopX(z, y, true); return [x - 0.016, y + 0.006, z]; };
  const a = PR(0.02, 0.975), b = PR(-0.2, 1.01);
  mb.rbox(a[0], a[1], a[2], 0.03, 0.03, 0.03, 0.008, 2);
  mb.sweep([a, b], [[-0.005, -0.003], [0.005, -0.003], [0.005, 0.003], [-0.005, 0.003]], { closedProfile: true, hard: true });
  const pts = []; for (let k = 0; k <= 6; k++) pts.push(PR(lerp(0.0, -0.4, k / 6), 1.015 + 0.012 * k / 6));
  mb.sweep(pts, [[-0.006, -0.006], [0.006, -0.006], [0.003, 0.006], [-0.003, 0.006]], { closedProfile: true, hard: true });
}
// regiões do atlas (u0, v0, u1, v1)
const CAT = { plate: [0, 0, 0.5, 0.332], fiat: [0.5, 0, 0.75, 0.16], mille: [0.5, 0.18, 0.95, 0.4] };
function carDecals(mb) {
  // quad sobre a superfície traseira/dianteira: centro (z, y), largura w, altura h; rear: texto lido por quem olha de trás
  const dq = (reg, zc, y0, w, h, rear, lift) => {
    const P = (z, y) => { const x = rear ? carTopX(z, y, true) - lift : lift; return [x, y, z]; };
    const s = rear ? 1 : -1, a = P(zc - s * w / 2, y0), b = P(zc + s * w / 2, y0), c = P(zc + s * w / 2, y0 + h), d = P(zc - s * w / 2, y0 + h);
    mb.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], reg[0], reg[3], reg[2], reg[1]);
  };
  mb.mat(CM.DECAL).color(1, 1, 1);
  dq(CAT.plate, 0, 0.652, 0.40, 0.13, true, 0.006);
  dq(CAT.plate, 0, 0.411, 0.40, 0.13, false, 1.8885);
  mb.mat(CM.DECAL, 1).color(1, 1, 1);
  // 公開版: 実在のメーカーのエンブレムを外す
  // dq(CAT.fiat, -0.40, 0.925, 0.145, 0.046, true, 0.003);
  // dq(CAT.mille, 0.37, 0.932, 0.175, 0.043, true, 0.003);
  // moldura preta das placas e fechadura da tampa
  mb.mat(CM.PLASTIC).color(0.02, 0.02, 0.02);
  const lk = [carTopX(0.33, 0.7, true) - 0.006, 0.7, 0.33];
  mb.rbox(lk[0], lk[1], lk[2], 0.014, 0.036, 0.11, 0.006, 2);
}
// ---------- atlas de emblemas e placa (canvas 2D por caminhos; letras em traços) ----------
const CGLYPH = {
  F: [[[0, 0], [0, 1], [0.75, 1]], [[0, 0.52], [0.55, 0.52]]], I: [[[0.2, 0], [0.2, 1]]], A: [[[0, 0], [0.4, 1], [0.8, 0]], [[0.15, 0.36], [0.65, 0.36]]], T: [[[0, 1], [0.8, 1]], [[0.4, 1], [0.4, 0]]],
  M: [[[0, 0], [0, 1], [0.45, 0.3], [0.9, 1], [0.9, 0]]], i: [[[0.12, 0], [0.12, 0.6]], [[0.12, 0.84], [0.12, 0.88]]], l: [[[0.12, 0], [0.12, 1]]],
  e: [[[0.06, 0.32], [0.62, 0.32], [0.6, 0.48], [0.46, 0.62], [0.24, 0.62], [0.09, 0.48], [0.06, 0.28], [0.13, 0.09], [0.3, 0], [0.5, 0.02], [0.62, 0.12]]],
  E: [[[0.72, 0], [0, 0], [0, 1], [0.72, 1]], [[0, 0.52], [0.52, 0.52]]], P: [[[0, 0], [0, 1], [0.52, 1], [0.72, 0.88], [0.72, 0.62], [0.52, 0.5], [0, 0.5]]],
  U: [[[0, 1], [0, 0.25], [0.14, 0.05], [0.4, 0], [0.66, 0.05], [0.8, 0.25], [0.8, 1]]], N: [[[0, 0], [0, 1], [0.8, 0], [0.8, 1]]],
  O: [[[0.4, 0], [0.14, 0.08], [0, 0.3], [0, 0.7], [0.14, 0.92], [0.4, 1], [0.66, 0.92], [0.8, 0.7], [0.8, 0.3], [0.66, 0.08], [0.4, 0]]],
  1: [[[0.12, 0.74], [0.42, 1], [0.42, 0]]], 9: [[[0.7, 0.62], [0.55, 0.46], [0.3, 0.46], [0.1, 0.6], [0.1, 0.85], [0.3, 1], [0.52, 1], [0.7, 0.85], [0.7, 0.3], [0.55, 0.05], [0.3, 0], [0.12, 0.1]]],
  6: [[[0.66, 0.9], [0.5, 1], [0.3, 1], [0.12, 0.82], [0.1, 0.3], [0.25, 0.03], [0.5, 0], [0.68, 0.15], [0.7, 0.4], [0.52, 0.56], [0.3, 0.56], [0.12, 0.42]]],
  '-': [[[0.1, 0.48], [0.5, 0.48]]],
};
const CADV = { I: 0.45, i: 0.3, l: 0.3, M: 1.12, '-': 0.6, 1: 0.7, e: 0.82 };
function carText(g, txt, x, y, h, lw, skew) {
  g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const ch of txt) {
    const gl = CGLYPH[ch];
    if (gl) for (const st of gl) { g.beginPath(); st.forEach((p, i) => { const px = x + (p[0] + (skew || 0) * p[1]) * h * 0.72, py = y - p[1] * h; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); }
    x += (CADV[ch] || 1.0) * h * 0.72 + lw * 0.6;
  }
  return x;
}
function carAtlas() {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  // placa cinza (padrão brasileiro dos anos 90): fundo cinza-claro, letras pretas, tarja do município
  g.fillStyle = '#b9bcbc'; g.fillRect(0, 0, 512, 170); g.strokeStyle = '#1a1a1a'; g.lineWidth = 6; g.strokeRect(5, 5, 502, 160);
  g.fillStyle = '#9fa3a3'; g.fillRect(150, 12, 212, 26); g.strokeStyle = '#222'; carText(g, 'UNO Mille', 178, 34, 17, 2.4, 0);
  g.strokeStyle = '#141414'; carText(g, 'UNO-1996', 30, 146, 76, 11, 0);
  g.fillStyle = '#777'; g.beginPath(); g.arc(28, 24, 6, 0, TAU); g.arc(484, 24, 6, 0, TAU); g.fill();
  // emblema FIAT: quatro losangos azuis com letras prateadas
  for (let i = 0; i < 4; i++) {
    const x = 518 + i * 60; g.fillStyle = '#16327a'; g.beginPath(); g.moveTo(x + 10, 6); g.lineTo(x + 58, 6); g.lineTo(x + 48, 74); g.lineTo(x, 74); g.closePath(); g.fill();
    g.strokeStyle = '#e4e8ec'; carText(g, 'FIAT'[i], x + 13 + (i === 1 ? 7 : 0), 66, 52, 12.5, 0.14);
  }
  // "Mille EP": Mille em cinza-escuro itálico, EP em vermelho
  // "Mille" em letra cursiva ligada (curvas), "EP" em itálico vermelho
  const SCR = {
    M: [1.02, [0, 0, 0.03, 0.62, 0.17, 1.0], [0.25, 0.5, 0.34, 0.08], [0.43, 0.62, 0.57, 1.0], [0.63, 0.5, 0.7, 0.1], [0.77, -0.05, 0.98, 0.13]],
    i: [0.36, [0, 0.13, 0.1, 0.32, 0.14, 0.62], [0.1, 0.2, 0.17, 0.06], [0.23, -0.03, 0.36, 0.13]],
    l: [0.36, [0, 0.13, 0.2, 0.5, 0.2, 0.9], [0.18, 1.07, 0.12, 0.9], [0.06, 0.5, 0.14, 0.08], [0.2, -0.03, 0.36, 0.13]],
    e: [0.5, [0, 0.13, 0.25, 0.3, 0.31, 0.48], [0.3, 0.67, 0.18, 0.62], [0.04, 0.5, 0.1, 0.2], [0.19, -0.05, 0.47, 0.15]],
  };
  let xs = 526; const hs = 84, sk = 0.3, ys = 190, T = (x, y) => [xs + (x + sk * y) * hs, ys - y * hs];
  g.strokeStyle = '#1c1e22'; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const ch of 'Mille') {
    const d = SCR[ch]; g.beginPath(); let p = T(d[1][0], d[1][1]); g.moveTo(p[0], p[1]);
    let c = T(d[1][2], d[1][3]), e = T(d[1][4], d[1][5]); g.quadraticCurveTo(c[0], c[1], e[0], e[1]);
    for (let k = 2; k < d.length; k++) { c = T(d[k][0], d[k][1]); e = T(d[k][2], d[k][3]); g.quadraticCurveTo(c[0], c[1], e[0], e[1]); }
    g.stroke();
    if (ch === 'i') { const q = T(0.17, 0.86); g.beginPath(); g.arc(q[0], q[1], 6, 0, TAU); g.fillStyle = '#1c1e22'; g.fill(); }
    xs += d[0] * hs;
  }
  const xe = xs + 4;
  g.strokeStyle = '#d0281a'; carText(g, 'EP', xe + 20, 190, 86, 16, 0.24);
  // Faixa livre do atlas: inscrições moldadas no flanco, um giro por toda a largura.
  g.fillStyle = '#fff'; g.font = 'bold 18px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('145/80 R13', 256, 320); g.fillText('RADIAL', 768, 320);
  const im = g.getImageData(0, 0, W, H);
  const tex = mkTex(W, H, 'rgba8unorm-srgb', TU.RT | TU.TB | TU.CD, { mipLevelCount: 6 });
  G.dev.queue.writeTexture({ texture: tex }, im.data, { bytesPerRow: W * 4 }, [W, H]);
  genMips(tex, 'rgba8unorm-srgb');
  return tex;
}
// ---------- roda (eixo Z local; face externa em +Z) ----------
function carBuildWheel(mb, mbBlur) {
  mb.push(m4rotY(m4(), -PI / 2));    // X local do torno → +Z
  mb.push(m4translate(m4(), -0.015, 0, 0));   // roda 1,5 cm para dentro: a face externa do pneu fica atrás do lábio do para-lama
  const R = CAR.wheelR, hw = 0.0725, seg = 72;
  // flanco interno, banda com sulcos, flanco externo
  const tj = [0.5, 1];
  mb.mat(CM.TIRE, 255).color(0.02, 0.02, 0.021);
  mb.lathe([[-0.058, 0.168], [-0.066, 0.18], [-0.0735, 0.205], [-0.074, 0.228], [-0.071, 0.25], [-0.066, 0.264, 0.5, 1]], seg);
  mb.lathe([[0.066, 0.264, 0.5, -1], [0.071, 0.25], [0.074, 0.228], [0.0735, 0.205], [0.066, 0.18], [0.058, 0.168]], seg);
  mb.mat(CM.TIRE, 0);
  const tread = [[-0.066, 0.264, 0.5, 1], [-0.061, 0.2745], [-0.052, 0.2795]];
  const groove = (x) => { tread.push([x - 0.0045, R], [x - 0.0036, R - 0.0065], [x + 0.0036, R - 0.0065], [x + 0.0045, R]); };
  tread.push([-0.041, R]); groove(-0.033); groove(-0.011); groove(0.011); groove(0.033); tread.push([0.041, R]);
  tread.push([0.052, 0.2795], [0.061, 0.2745], [0.066, 0.264, 0.5, -1]);
  mb.lathe(tread, seg);
  // aro de aço: borda aparente, fundo atrás da calota, lado interno
  mb.mat(CM.STEEL, 1).color(0.035, 0.035, 0.038);
  mb.lathe([[0.058, 0.168], [0.062, 0.171], [0.064, 0.168], [0.062, 0.164], [0.04, 0.16], [0.03, 0.13], [0.03, 0.0]], 40);
  mb.lathe([[-0.02, 0.0], [-0.02, 0.1], [-0.05, 0.158], [-0.06, 0.166], [-0.058, 0.168]], 32);
  // calota prateada com 14 rasgos radiais
  mb.mat(CM.HUBCAP).color(0.62, 0.63, 0.65);
  const NS = 16, prof = r => { const t = r / 0.166; return 0.0715 - 0.021 * t * t - 0.004 * smooth(0.028, 0.036, r) + 0.004 * smooth(0.06, 0.09, r) - 0.004 * smooth(0.15, 0.166, r); };
  mb.patch((u, v, o) => { const a = u * TAU, r = v * 0.1665; o[0] = prof(r); o[1] = r * Math.cos(a); o[2] = r * Math.sin(a); }, 0, 1.003, 0.0, 1, {   // 1.003: sobrepõe a emenda angular (sem fresta)
    nu: 210, nv: 30, flip: true, rim: 0.018, rimMat: m => m.mat(CM.STEEL, 1).color(0.03, 0.03, 0.03),
    uv: (u, v, P) => { _cuv[0] = u; _cuv[1] = v; return _cuv; },
    field: (u, v, P) => { const r = v * 0.1665, da = (u * NS - Math.round(u * NS)) / NS * TAU, t = r * Math.sin(da), q = Math.max(Math.abs(r - 0.123) - 0.019, 0); return -(Math.hypot(t, q) - 0.0082); }
  });
  // disco de borrão em malha própria (fora do passe de sombra: sem ele a sombra do disco riscava a calota parada)
  const bm = mbBlur || mb; if (mbBlur) { bm.push(m4rotY(m4(), -PI / 2)); bm.push(m4translate(m4(), -0.015, 0, 0)); }
  bm.mat(CM.HUBCAP, 1).color(0.62, 0.63, 0.65);
  bm.patch((u, v, o) => { const a = u * TAU, r = 0.036 + v * 0.127; o[0] = prof(r) + 0.002; o[1] = r * Math.cos(a); o[2] = r * Math.sin(a); }, 0, 1, 0, 1, { nu: 56, nv: 8, flip: true, uv: (u, v, P) => { _cuv[0] = u; _cuv[1] = v; return _cuv; } });
  if (mbBlur) { bm.pop(); bm.pop(); }
  mb.pop(); mb.pop();
}
// ---------- volante (eixo da coluna = X local) ----------
function carBuildSteer(mb) {
  mb.mat(CM.INTERIOR, 3).color(0.035, 0.035, 0.038);
  const ring = []; for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; ring.push([0, 0.185 * Math.cos(a), 0.185 * Math.sin(a)]); }
  mb.tube(ring, 0.0135, 10, { closed: true, up: [1, 0, 0] });
  mb.rbox(-0.035, -0.01, 0, 0.05, 0.1, 0.16, 0.025, 3);
  mb.rbox(-0.02, 0.0, 0.1, 0.022, 0.03, 0.17, 0.008, 1); mb.rbox(-0.02, 0.0, -0.1, 0.022, 0.03, 0.17, 0.008, 1); mb.rbox(-0.02, -0.1, 0, 0.022, 0.17, 0.035, 0.008, 1);
  m4translate(CAR._t, 0.345, 0.885, -0.36); m4rotZ(CAR._t2, 158 * PI / 180); m4mul(CAR.steerMat, CAR._t, CAR._t2);
}
