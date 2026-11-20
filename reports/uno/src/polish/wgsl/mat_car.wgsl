// Materiais do carro (Fiat Uno Mille EP): pintura metálica com verniz, plásticos, borracha, pneus, calotas, lentes, alumínio...
// id (mat.x): 1 pintura | 2 plástico preto | 3 borracha | 4 pneu | 5 calota | 6 aço | 7 cromado | 8 interior | 9 lente opaca
//             10 alumínio | 11 cinta | 12 decalque do atlas | 13 fundo | 14 refletor do farol | 15 espelho | 16 palhetas da grade
//             17 casco do capacete
// O.p0 da carroceria: x = luz de freio, y = luz de ré, z = faróis. O.p0.x das rodas = |velocidade angular|.
#include mesh_vert
@group(3) @binding(0) var tAtlas: texture_2d<f32>;
const PAINT_COL = vec3f(0.158, 0.269, 0.431);
fn carBulgeW(x: f32) -> f32 { return 0.055 * smoothstep(-0.15, 0.25, x) - 0.036 * smoothstep(-1.15, -1.42, x); }
fn surf(in: V2F, ff: bool) -> Surface {
  var s = surfDefault(normalize(in.nrm));
  let id = matId(in.mat); let pa = matA(in.mat) * 255.0;
  let lp = in.ext.xyz;
  s.albedo = in.col.rgb;
  switch (id) {
    case 1u: {   // pintura azul-claro metálica com verniz
      // flocos metálicos: ruído 3D no espaço do carro (sem estrias em nenhum painel)
      // (ruído 2D com mips, projetado pelos três eixos do carro: com a distância ou em ângulo rasante os mips levam à média
      //  e o floco some sozinho — o ruído 3D sem mips virava uma trama diagonal no capô)
      let nO = normalize((vec4f(s.normal, 0.0) * O.model).xyz); let wt = abs(nO) / (abs(nO.x) + abs(nO.y) + abs(nO.z));
      let grain = textureSample(tNoise, sLin, lp.zy * 2.15).ra * wt.x + textureSample(tNoise, sLin, lp.xz * 2.15).ra * wt.y + textureSample(tNoise, sLin, lp.xy * 2.15).ra * wt.z;
      let V = normalize(F.camPos.xyz - in.wpos);
      let face = sat(dot(s.normal, V));
      let lightFace = sat(dot(s.normal, normalize(V + F.sunDir.xyz)));
      let fl = grain.y - 0.5;
      let glint = smoothstep(0.065, 0.26, fl) * (0.10 + 0.48 * pow(lightFace, 4.0));
      let top = smoothstep(0.6, 0.96, nO.y);
      // A base metálica espalha o reflexo solar no topo; fora dele o verniz ainda mostra o céu.
      let sunLobe = top * smoothstep(0.70, 0.97, lightFace);
      let dust = (1.0 - smoothstep(0.25, 0.57, lp.y)) * smoothstep(0.34, 0.66, grain.x);
      s.albedo = mix(PAINT_COL * mix(vec3f(1.10,1.08,1.02), vec3f(0.85,0.92,1.0), face) * (1.0 + fl * 0.14), vec3f(0.48,0.56,0.62), glint * 0.32);
      s.albedo = mix(s.albedo, vec3f(0.19,0.16,0.12), dust * 0.085);
      // metal era 0,85 (Astra-3): com os reflexos escuros da mata a lataria lia azul-médio; 0,72 devolve parte do difuso e o
      // azul-claro das fotos, mantendo o reflexo colorido do metálico
      s.metal = 0.68 - 0.26 * sunLobe - 0.035 * dust;
      s.rough = mix(0.165, 0.225, top) + 0.20 * sunLobe - 0.025 * glint + 0.035 * dust;
      s.coat = mix(0.99, 0.9, top) - 0.54 * sunLobe - 0.05 * dust;
      // abas dos recortes junto ao chão (base das caixas de roda): escuras, para não sobrar lasca clara pendurada
      { let under = (1.0 - smoothstep(0.31, 0.345, lp.y)) * smoothstep(1.4, 1.5, abs(lp.x)); s.albedo = mix(s.albedo, vec3f(0.01), under); s.coat *= 1.0 - under; s.metal *= 1.0 - under; s.rough = mix(s.rough, 0.95, under); }
      if (pa > 0.5) { let low = max(1.0 - smoothstep(0.2, 0.26, lp.y), (1.0 - smoothstep(0.54, 0.6, lp.y)) * smoothstep(1.2, 1.3, abs(lp.x))); s.albedo = mix(s.albedo, vec3f(0.012), low); s.coat *= 1.0 - low; s.metal *= 1.0 - low; s.rough = mix(s.rough, 0.9, low); }
      if (pa < 0.5) {
        var d = abs(in.uv.x);
        // tampa de combustível (lado esquerdo)
        if (lp.z < -0.5) { d = min(d, abs(length(vec2f(lp.x + 1.04, lp.y - 0.715)) - 0.062)); }
        // vão entre painéis: núcleo escuro de ~4 mm + sombra suave em volta (lê como fresta, não como traço);
        // quando fica menor que o pixel, some por cobertura em vez de engrossar
        let w = max(fwidth(d), 1e-5); let hw = 0.002;
        let line = sat((hw - d) / w + 0.5) * min(1.0, 2.0 * hw / w);
        let halo = (1.0 - smoothstep(hw, hw + 0.007, d)) * sat(0.0035 / w);
        s.albedo *= 1.0 - 0.22 * halo; s.ao = min(s.ao, 1.0 - 0.4 * halo);
        // faixa lateral mais escura entre os dois vincos + friso fino escuro na borda de cima + soleira sombreada
        let side = step(in.uv.y, 0.4);
        // (nas fotos de estúdio tudo abaixo do friso é um tom mais escuro)
        let band = smoothstep(0.215, 0.25, lp.y) * (1.0 - smoothstep(0.575, 0.59, lp.y)) * side;
        s.albedo *= 1.0 - 0.3 * band; s.rough += 0.03 * band;
        let wy = max(fwidth(lp.y), 1e-5);
        // friso lateral: faixa larga de borracha preta (~5 cm) na altura do topo dos para-choques, entre as caixas de roda
        let sx = smoothstep(-0.83, -0.80, lp.x) * (1.0 - smoothstep(0.80, 0.83, lp.x));
        let sdy = lp.y - 0.607; let strip = sat((0.025 - abs(sdy)) / wy + 0.5) * min(1.0, 0.05 / wy) * side * sx;
        { let upS = normalize((O.model * vec4f(0.0, 1.0, 0.0, 0.0)).xyz); let eb = smoothstep(0.014, 0.024, abs(sdy)) * strip; s.normal = normalize(s.normal + upS * sign(sdy) * eb * 0.8); }
        // soleira: faixa preta fosca sob a porta, entre as caixas de roda
        let sill = (1.0 - smoothstep(0.222, 0.234, lp.y)) * side;
        s.albedo = mix(s.albedo, vec3f(0.014), sill * 0.92); s.coat *= 1.0 - sill; s.metal *= 1.0 - sill; s.rough = mix(s.rough, 0.85, sill); s.ao = min(s.ao, 1.0 - 0.3 * sill);
        // vinco horizontal da tampa traseira (na altura do topo das lanternas): dobra a normal numa faixa estreita
        if (lp.x < -1.5 && in.uv.y > 0.66) {
          let t = (lp.y - 0.836) / 0.007; let upW = normalize((O.model * vec4f(0.0, 1.0, 0.0, 0.0)).xyz);
          s.normal = normalize(s.normal + upW * (t * exp(-t * t) * 0.55) * (1.0 - smoothstep(0.44, 0.48, abs(lp.z))));
          // rebaixo da placa: degrau sombreado em volta da placa (retângulo arredondado) e fundo levemente mais escuro
          let q = abs(vec2f(lp.z, lp.y - 0.717)) - vec2f(0.203, 0.064); let pr = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - 0.014;
          let stepb = 1.0 - smoothstep(0.0, 0.007, abs(pr));
          s.albedo *= 1.0 - 0.3 * stepb - 0.07 * (1.0 - smoothstep(-0.004, 0.0, pr)); s.ao = min(s.ao, 1.0 - 0.5 * stepb);
        }
        var black = max(line, strip); var lvShade = 1.0;
        if (in.uv.y > 0.66) {
          let zz = lp.z / 0.72; let xe = lp.x - carBulgeW(lp.x) * (1.0 - zz * zz);
          // grade plástica na base do para-brisa
          let cowl = smoothstep(0.6, 0.61, xe) * (1.0 - smoothstep(0.741, 0.745, xe));
          black = max(black, cowl);
          // grelha de ventilação do capô: fileira de aletas ~10 cm à frente da borda traseira, centrada (como na foto)
          let lz = lp.z / 0.021; let cz = fract(lz) - 0.5; let slot = smoothstep(0.3, 0.42, abs(cz) * 2.0);
          let lin = smoothstep(0.843, 0.846, xe) * (1.0 - smoothstep(0.876, 0.879, xe)) * (1.0 - smoothstep(0.218, 0.222, abs(lp.z)));
          let lv = (1.0 - slot) * lin;
          // rebaixo: a borda de cada aleta dobra a normal (pega brilho de um lado, sombra do outro) e o fundo tem degradê
          let rightW = normalize((O.model * vec4f(0.0, 0.0, 1.0, 0.0)).xyz); let fwdW = normalize((O.model * vec4f(1.0, 0.0, 0.0, 0.0)).xyz);
          let bev = smoothstep(0.22, 0.36, abs(cz) * 2.0) * (1.0 - smoothstep(0.44, 0.58, abs(cz) * 2.0)) * lin;
          let endb = (smoothstep(0.836, 0.845, xe) * (1.0 - smoothstep(0.845, 0.851, xe)) - smoothstep(0.871, 0.877, xe) * (1.0 - smoothstep(0.877, 0.886, xe))) * (1.0 - slot) * (1.0 - smoothstep(0.218, 0.222, abs(lp.z)));
          s.normal = normalize(s.normal - rightW * sign(cz) * bev * 0.7 + fwdW * endb * 0.6);
          s.ao = min(s.ao, 1.0 - 0.35 * bev); s.ao = min(s.ao, 1.0 - 0.7 * lv);   // o fundo da fenda não devolve céu nem sol
          lvShade = mix(1.0, mix(0.3, 1.1, sat(cz * 2.6 + 0.5)) * mix(0.5, 1.0, sat((xe - 0.846) / 0.03)), lin);   // só dentro das aletas (a base do para-brisa fica lisa)
          // pé dos dois vincos longitudinais: linha de sombra fina que acompanha o ressalto
          let zc = 0.515 - 0.145 * sat((lp.x - 0.72) / 1.03);
          let hx = smoothstep(0.78, 0.9, xe) * (1.0 - smoothstep(1.68, 1.76, xe));
          // aresta viva do ressalto: a normal dobra para fora numa faixa estreita (a face do degrau pega o céu de um lado e
          // sombra do outro), com uma linha de sombra fina no pé — o vinco lê de qualquer ângulo, inclusive da câmera de capô
          let dz = abs(lp.z) - zc; let wz = max(fwidth(lp.z), 1e-5);
          let face = (1.0 - smoothstep(0.004, 0.0085, abs(dz))) * hx;
          let foot = (1.0 - smoothstep(0.003, 0.02 + 2.0 * wz, abs(dz - 0.013))) * hx;   // faixa de sombra larga e suave (lê a 1 m em ângulo rasante, sem tracejar)
          let crest = (1.0 - smoothstep(0.003, 0.016 + 2.0 * wz, abs(dz + 0.012))) * hx;
          s.normal = normalize(s.normal + rightW * sign(lp.z) * (face * 0.26 + foot * 0.08));
          s.albedo *= (1.0 - 0.34 * foot) * (1.0 + 0.14 * crest); s.ao = min(s.ao, 1.0 - 0.45 * foot);
          s.coat *= 1.0 - 0.8 * foot; s.rough = mix(s.rough, 0.7, foot);   // no pé do degrau o verniz não devolve o céu: a linha de sombra aparece também em ângulo rasante
          black = max(black, lv);
        }
        s.albedo = mix(s.albedo, vec3f(0.016) * lvShade, black); s.coat *= 1.0 - black; s.rough = mix(s.rough, 0.95, black); s.metal *= 1.0 - black; s.ao = min(s.ao, 1.0 - line * 0.6);
      }
    }
    case 2u: {   // plástico preto: granulado finíssimo (quase liso a 3 m), arestas vivas, um pouco de difuso para ler na sombra
      let g = textureSample(tNoise, sLin, lp.xz * 57.0 + lp.yy * 43.0).b;
      let g2 = textureSample(tNoise, sLin, lp.zy * 131.0 + lp.xx * 97.0).a;
      let chalk = smoothstep(0.46, 0.60, lp.y) * smoothstep(1.40, 1.68, abs(lp.x));
      s.albedo = in.col.rgb * vec3f(0.96, 1.0, 1.05) * (0.2 + 0.13 * g + 0.09 * g2 + 0.075 * chalk); s.rough = select(0.94 + 0.05 * g2, 0.4, pa > 0.5); s.ao = 0.38 + 0.2 * g2; s.metal = select(0.0, 0.55, pa > 0.5);
    }
    case 3u: { s.albedo = in.col.rgb * vec3f(0.96, 1.0, 1.05) * 1.0; s.rough = 0.84; s.ao = 0.6; s.metal = 0.5; }
    case 4u: {   // pneu de passeio
      let r = length(lp.xy); let ang = atan2(lp.y, lp.x);
      let blur = sat(O.p0.x / 25.0);
      if (pa < 0.5) {
        // banda: lamelas finas e discretas, só entre os ombros (os sulcos longitudinais são geometria)
        let lane = floor((lp.z + 0.055) / 0.022);
        let k = fract(ang / 6.2831853 * 118.0 + lane * 0.5);
        let sipe = (1.0 - smoothstep(0.05, 0.1, abs(k - 0.5))) * (1.0 - blur) * (1.0 - smoothstep(0.03, 0.038, abs(lp.z)));
        s.albedo = in.col.rgb * vec3f(0.96, 1.0, 1.05) * 0.5 * (1.0 - 0.5 * sipe); s.ao = 0.45 - 0.2 * sipe; s.rough = 0.95; s.metal = 0.0;
      } else {
        // flanco liso: dois frisos concêntricos e poucas inscrições pequenas em relevo suave
        let ring = (1.0 - smoothstep(0.0006, 0.0014, abs(r - 0.243))) + (1.0 - smoothstep(0.0006, 0.0014, abs(r - 0.196)));
        let markUV = vec2f(0.5 - ang / (2.0 * PI), (320.0 + clamp((0.224 - r) * 740.0, -24.0, 24.0)) / 512.0);
        let letters = textureSample(tAtlas, sLin, markUV).a * (1.0 - blur);
        // friso largo junto ao ombro e nervuras radiais finas no flanco (pneu de verdade, não massa lisa)
        let ribs = (0.5 + 0.5 * sin(ang * 150.0)) * smoothstep(0.222, 0.226, r) * (1.0 - smoothstep(0.238, 0.242, r)) * (1.0 - blur) * sat(1.0 - fwidth(ang) * 150.0 * 0.4);
        let band2 = smoothstep(0.247, 0.249, r) * (1.0 - smoothstep(0.256, 0.258, r));
        s.albedo = in.col.rgb * vec3f(0.96, 1.0, 1.05) * 0.5 * (1.0 + 1.8 * letters + 0.8 * ring * (1.0 - blur) + 0.35 * ribs + 0.3 * band2); s.rough = 0.9 - 0.2 * letters; s.ao = 0.5 - 0.15 * ribs + 0.25 * letters; s.metal = 0.0;
      }
    }
    case 5u: {   // calota prateada
      let r = length(lp.xy);
      s.albedo = in.col.rgb; s.metal = 0.75; s.rough = 0.36; s.coat = 0.25;
      if (pa > 0.5) {
        // disco de borrão: cobre os rasgos por pontilhado conforme a roda gira (média radial: anel dos rasgos mais escuro)
        let cov = smoothstep(9.0, 34.0, O.p0.x);
        if (ign(in.pos.xy, F.misc.y) >= cov) { discard; }
        let ringd = 1.0 - smoothstep(0.016, 0.03, abs(r - 0.123));
        let rim = 1.0 - smoothstep(0.001, 0.003, abs(r - 0.156)); let hub = 1.0 - smoothstep(0.016, 0.024, r); let bolts = 1.0 - smoothstep(0.005, 0.01, abs(r - 0.058));
        let streak = 0.5 + 0.5 * sin(atan2(lp.y, lp.x) * 16.0);   // resto dos 16 rasgos, quase apagado pelo giro
        s.albedo = in.col.rgb * (1.0 - 0.5 * ringd * (0.85 + 0.15 * streak) - 0.35 * rim - 0.4 * hub - 0.22 * bolts); s.rough = 0.42; s.coat = 0.15; s.ao = 1.0 - 0.35 * ringd;
        return s;
      }
      let far = smoothstep(0.004, 0.011, fwidth(r)) * (1.0 - smoothstep(0.019, 0.026, abs(r - 0.123)));
      s.albedo *= 1.0 - 0.3 * far;
      let c = 1.0 - smoothstep(0.0012, 0.0024, abs(r - 0.031));
      // emblema central: cinco barras inclinadas em baixo-relevo
      let q = lp.x + lp.y * 0.3;
      let bars = (1.0 - smoothstep(0.2, 0.3, abs(fract(q / 0.0078 + 0.5) - 0.5))) * step(abs(lp.y), 0.0155) * step(abs(q), 0.0195) * (1.0 - sat(O.p0.x / 20.0));
      s.albedo *= 1.0 - 0.5 * bars; s.rough += 0.1 * bars;
      // friso na borda e sombra suave para dentro dos rasgos
      s.albedo *= 1.0 - 0.3 * (1.0 - smoothstep(0.001, 0.0025, abs(r - 0.156)));
      // cinco rebaixos de parafuso em volta do centro
      let a5 = atan2(lp.y, lp.x) / 6.2831853 * 5.0; let da = (a5 - round(a5)) / 5.0 * 6.2831853 * r;
      let dimple = 1.0 - smoothstep(0.006, 0.008, length(vec2f(da, r - 0.058)));
      s.albedo *= 1.0 - 0.5 * c - 0.6 * dimple; s.ao = 1.0 - 0.5 * dimple;
    }
    case 6u: { s.metal = 0.5; s.rough = select(0.45, 0.6, pa > 0.5); }
    case 7u: { s.metal = 1.0; s.rough = select(0.07, 0.26, pa > 0.5); if (pa > 1.5) { s.metal = 0.72; s.rough = 0.3; } }   // a=2: cromado claro acetinado (emblema)
    case 8u: {   // interior
      s.rough = 0.92;
      // forro interno atrás dos para-choques (a pele externa é cortada ali): escuro, para não aparecer por baixo do carro
      { let under = (1.0 - smoothstep(0.56, 0.62, lp.y)) * smoothstep(1.2, 1.3, abs(lp.x)); s.albedo = mix(s.albedo, vec3f(0.006), under); }
      if ((pa > 1.5 && pa < 2.5) || (pa > 3.5 && pa < 4.5)) { let w = sin(lp.z * 900.0) * sin(lp.x * 900.0 + lp.y * 900.0); s.albedo = in.col.rgb * (1.0 + 0.1 * w); }
      if (pa > 3.5 && pa < 4.5) {
        // bancos: gomos horizontais com costura (sulco escuro) a cada ~8 cm
        let k = (fract(lp.y / 0.082 + 0.3 * lp.x) - 0.5) * 0.082; let seam = 1.0 - smoothstep(0.0025, 0.008, abs(k));
        s.albedo *= (1.0 - 0.5 * seam) * (0.86 + 0.14 * cos(k / 0.082 * 6.2831853)); s.ao = 1.0 - 0.4 * seam;
      }
      if (pa > 2.5 && pa < 3.5) { s.rough = 0.55; }
      if (pa > 4.5 && pa < 5.5) {
        // Região exposta da balaclava; sobrancelha, pálpebra e pupila acompanham o rosto.
        let a = abs(in.uv.x); let h = in.uv.y;
        let socket = length(vec2f((a - 0.40) * 2.65, (h - 0.53) * 5.5));
        let brow = length(vec2f((a - 0.41) * 3.0, (h - 0.635 + 0.065 * a) * 24.0));
        let mask = smoothstep(0.86, 1.13, a) + 1.0 - smoothstep(0.06, 0.20, h);
        s.albedo *= 1.0 - 0.37 * (1.0 - smoothstep(0.35, 1.1, socket));
        s.albedo = mix(s.albedo, vec3f(0.048,0.030,0.023), 1.0 - smoothstep(0.52,1.0,brow));
        let eye = length(vec2f((a - 0.39) * 5.5, (h - 0.50) * 30.0));
        s.albedo = mix(s.albedo, mix(vec3f(0.047,0.035,0.029), vec3f(0.47,0.36,0.29), smoothstep(0.038,0.074,abs(a - 0.37))), 1.0 - smoothstep(0.70,1.0,eye));
        s.albedo = mix(s.albedo, vec3f(0.035,0.033,0.032), sat(mask)); s.rough = 0.79;
      } else if (pa > 5.5) {
        let top = cos(in.uv.x);
        let seam = (1.0 - smoothstep(0.027, 0.10, abs(top - 0.50))) * smoothstep(0.35,1.0,in.uv.y);
        s.albedo = mix(in.col.rgb, vec3f(0.050,0.052,0.054), smoothstep(0.40,0.60,top));
        s.albedo = mix(s.albedo, vec3f(0.26,0.224,0.18), 0.65 * seam);
      }
    }
    case 9u: {   // lentes (lanterna traseira, piscas): prismas finos sobre refletor, cores profundas mesmo ao sol
      s.rough = 0.38; s.coat = 0.0;
      let rib = 0.86 + 0.14 * sin(lp.y * 6.2831853 / 0.0042);
      if (pa < 1.5) {
        // lanterna traseira: faixa superior âmbar-escuro (pisca), vermelho-rubi (posição/freio) no meio, ré clara embaixo
        let v = in.uv.y; let u = in.uv.x; let br = sat(O.p0.x);
        // o albedo fica sempre escuro (ao sol não lava para rosa); o freio aceso vem só do emissivo, em vermelho puro
        var c = mix(vec3f(0.17, 0.003, 0.002), vec3f(0.2, 0.004, 0.002), br); var e = mix(0.03, 0.66, br);
        if (v > 0.66) { c = vec3f(0.19, 0.05, 0.002); e = 0.006; }
        else if (v < 0.2 && u < 0.36) { c = mix(vec3f(0.1, 0.1, 0.098), vec3f(1.0, 1.0, 0.95), sat(O.p0.y)); e = 0.004 + sat(O.p0.y) * 0.5; }   // ré: pequeno retângulo interno
        // divisórias em relevo entre as seções (horizontais) e uma vertical a 1/3 da largura: barras escuras com chanfro
        let fy = max(fwidth(v), 1e-4); let fu = max(fwidth(u), 1e-4);
        let dh = min(abs(v - 0.66), select(9.0, abs(v - 0.2), u < 0.36)); let dvv = select(9.0, abs(u - 0.36), v < 0.2);
        // moldura escura fina em volta da lente (bordas de cima, de baixo e interna)
        let vh = (0.5 - abs(v - 0.5)) ; let edge = max(sat(1.0 - (vh - 0.0) / max(0.028, fy)), sat(1.0 - u / max(0.03, fu)));
        let k = sat(max(max(sat(1.0 - dh / max(0.02, fy)), sat(1.0 - dvv / max(0.014, fu))), edge));
        // prismas: pirâmides de ~4,5 mm que dobram a normal (brilhos pontuais do sol) e dão claro/escuro por célula
        let cell = vec2f(abs(lp.z) + lp.x + 1.68, lp.y) / vec2f(0.009,0.006);
        let fade = 1.0 - smoothstep(vec2f(0.18), vec2f(0.7), fwidth(cell));
        let pc = (fract(cell) - 0.5) * fade;
        let tangent = normalize((O.model * vec4f(0.6, 0.0, sign(lp.z), 0.0)).xyz);
        let upW = O.model[1].xyz;
        s.normal = normalize(s.normal + (tangent * pc.x * 0.34 + upW * pc.y * 0.52) * (1.0 - k));
        let prism = 1.0 + 0.26 * pc.x + 0.52 * pc.y;
        // Uma cavidade para cada lâmpada, atrás da lente frisada.
        let lampY = select(select(0.43,0.84,v > 0.66),0.10,v < 0.2 && u < 0.36);
        let lampX = select(0.54,0.18,v < 0.2 && u < 0.36);
        let bowl = length(vec2f((u - lampX) * 1.85, (v - lampY) * select(3.05,5.5,v > 0.66)));
        let depth = 0.56 + 0.56 * (1.0 - smoothstep(0.16,1.02,bowl)) + 0.22 * (1.0 - smoothstep(0.0,0.17,abs(bowl - 0.83)));
        s.albedo = mix(c * prism * depth, vec3f(0.008,0.006,0.005), k);
        s.emissive = e * (1.0 - k) * depth; s.coat = 0.25 * (1.0 - k);
        s.rough = mix(0.355, 0.74, k);
      } else {
        // piscas: lente âmbar translúcida (mais escura e saturada) com o brilho do refletor por trás e verniz
// (uv.x = x + z: coordenada ao longo da frente/lateral) — frisos verticais finos e um degradê de refletor por trás
        let fl2 = 0.5 + 0.5 * sin(in.uv.x * 6.2831853 / 0.0075); let fadeP = sat(1.0 - fwidth(in.uv.x) / 0.0075 * 2.0);
        let gy = 1.0 - 0.45 * abs((lp.y - 0.693) / 0.062);
        s.albedo = in.col.rgb * vec3f(0.9, 0.62, 0.3) * mix(1.0, 0.74 + 0.4 * fl2, fadeP) * gy * (0.9 + 0.1 * rib); s.rough = 0.3; s.coat = 0.7; s.emissive = 0.03;   // lente lisa translúcida, só com frisos horizontais finos
      }
    }
    case 10u: {  // alumínio da escada
      let n = textureSample(tNoise, sLin, vec2f(lp.x * 0.7, (lp.y + lp.z) * 30.0)).r;
      s.albedo = in.col.rgb * (0.94 + 0.08 * n); s.metal = 0.55; s.rough = 0.5 + 0.1 * n;
      if (pa > 0.5) { let k = sin(lp.z * 900.0); s.rough = 0.55; s.albedo *= 0.9 + 0.1 * k; }
      else if (abs(abs(lp.z) - 0.205) > 0.0105 && lp.x > -1.97 && lp.x < 1.21) {
        // extremidade rebitada de cada degrau, visível nas faces laterais das longarinas
        let kx = (fract((lp.x + 1.78) / 0.28 + 0.5) - 0.5) * 0.28; let d = length(vec2f(kx, lp.y - 1.515));
        let ring = smoothstep(0.0215, 0.0195, d) * smoothstep(0.0135, 0.0155, d); let core = 1.0 - smoothstep(0.012, 0.014, d);
        s.albedo *= 1.0 - 0.55 * ring - 0.2 * core; s.ao = 1.0 - 0.5 * ring;
      }
    }
    case 11u: {  // cinta de poliéster
      let w = sin((lp.z + lp.y) * 1800.0) * sin(lp.x * 1800.0);
      s.albedo = in.col.rgb * (0.9 + 0.12 * w); s.rough = 0.8;
    }
    case 12u: {  // decalque (placa / emblemas)
      let t = textureSample(tAtlas, sLin, in.uv);
      if (pa > 0.5 && t.a < 0.5) { discard; }
      s.albedo = t.rgb * select(0.7, 1.0, pa > 0.5); s.rough = select(0.62, 0.28, pa > 0.5); s.metal = select(0.0, 0.4, pa > 0.5); s.coat = select(0.0, 0.6, pa > 0.5);
    }
    case 13u: { s.rough = 1.0; s.ao = 0.3; s.metal = 0.9; }
    case 14u: {  // refletor do farol: cuba prateada com aparência própria (pouco dependente do céu) / bulbo
      let u = in.uv.x; let v = in.uv.y;
      // gradação: mais claro no centro (em volta do bulbo), escurecendo para as bordas e para baixo; facetas verticais em colunas
      let rightW = normalize((O.model * vec4f(0.0, 0.0, 1.0, 0.0)).xyz);
      // facetas mais finas e mais fracas (eram 14,5 x 21 mm com inclinação 0,29/0,21 e ±30% de brilho: liam como mosaico de
      // quadrados claros no farol de frente)
      let cell = vec2f(abs(lp.z), lp.y) / vec2f(0.008,0.012);
      let facet = (fract(cell) - 0.5) * (1.0 - smoothstep(vec2f(0.15),vec2f(0.5),fwidth(cell)));
      s.normal = normalize(s.normal + rightW * sign(lp.z) * facet.x * 0.12 + O.model[1].xyz * facet.y * 0.09);
      let rr = length(vec2f(u * 0.88, v));
      let edge = smoothstep(0.78,1.05,max(abs(u),abs(v)));
      let cup = 0.56 + 0.34 * smoothstep(-0.85,0.65,-v) + 0.28 * (1.0 - smoothstep(0.08,0.40,abs(rr - 0.68)));
      s.albedo = vec3f(0.74,0.76,0.77) * cup * (1.0 - 0.61 * edge) * (1.0 + 0.10 * facet.x + 0.06 * facet.y);
      s.metal = 0.78; s.rough = 0.25; s.ao = 1.0 - 0.38 * edge;
      s.emissive = 0.023 + O.p0.z * 0.18 * (1.0 - smoothstep(0.15,0.97,rr));
      if (pa > 0.5) {
        // bulbo claro (a > 0,5) e sua capa prateada na ponta (a > 1,5): discretos, sem ponto preto
        s.normal = normalize(in.nrm);
        if (pa > 1.5) { s.metal = 0.3; s.albedo = vec3f(0.5, 0.5, 0.51); s.rough = 0.35; s.emissive = 0.06; }
        else { s.metal = 0.2; s.albedo = vec3f(0.8, 0.79, 0.74); s.rough = 0.25; s.emissive = 0.09 + O.p0.z * 0.1; }
      }
    }
    case 15u: {   // espelho retrovisor: reflexo FIXO (céu / horizonte de mata / chão), escurecido — não depende do cubemap
      let g = sat((lp.y - 0.961) / 0.072);
      let ground = vec3f(0.03, 0.03, 0.032); let trees = vec3f(0.018, 0.03, 0.014); let sky = mix(vec3f(0.2, 0.25, 0.3), vec3f(0.1, 0.16, 0.26), sat((g - 0.52) / 0.48));
      var c = mix(ground, trees, smoothstep(0.36, 0.42, g)); c = mix(c, sky, smoothstep(0.5, 0.56, g));
      s.albedo = c; s.metal = 0.0; s.rough = 0.5; s.coat = 0.25; s.emissive = 0.045;
    }
    case 16u: {  // palhetas no fundo das fendas: quase pretas
      let k = fract(lp.y / select(0.0105, 0.0175, pa > 0.5));
      s.albedo = in.col.rgb * mix(0.1, 1.0, smoothstep(0.25, 0.5, k)); s.rough = 0.92; s.metal = 0.3; s.ao = mix(0.2, 0.7, smoothstep(0.25, 0.5, k));
    }
    case 17u: {   // casco acetinado; friso de borracha e duas entradas na queixeira
      let a = abs(in.uv.x);
      let lip = 1.0 - smoothstep(0.85, 1.18, in.uv.y);
      let vent = length(vec2f((a - 0.36) * 4.3, (in.uv.y - 2.20 - 0.33 * a) * 5.6));
      let stripe = abs(in.uv.y - 2.15 - 2.43 * smoothstep(0.85,2.78,a));
      let band = (1.0 - smoothstep(0.105,0.18,stripe)) * smoothstep(0.60,0.95,a);
      s.albedo = mix(in.col.rgb, vec3f(0.065,0.116,0.143), band);
      s.albedo = mix(s.albedo, vec3f(0.027,0.034,0.038), max(lip, 1.0 - smoothstep(0.72,1.0,vent)));
      s.rough = mix(0.32, 0.7, lip); s.coat = 0.28 * (1.0 - lip);
    }
    default: {}
  }
  return s;
}
