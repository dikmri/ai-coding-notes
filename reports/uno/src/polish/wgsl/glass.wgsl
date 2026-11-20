// Vidros, lente canelada e viseira. GLASS_MUL transmite o fundo; GLASS_ADD soma o reflexo.
#include mesh_vert
#include fwd_common
fn shade(in: V2F, ff: bool) -> vec4f {
  let outward = normalize(in.nrm);
  var N = select(-outward, outward, ff);
  let V = normalize(F.camPos.xyz - in.wpos);
  let id = matId(in.mat);
  var flute = 1.0;
  if (id == 1u) {
    // O vidro prensado desvia os reflexos em duas direções. As nervuras somem abaixo de um pixel.
    let uv = vec2f(abs(in.ext.z),in.ext.y) / vec2f(0.0105,0.0065);
    let fade = 1.0 - smoothstep(vec2f(0.18),vec2f(0.65),fwidth(uv));
    let ridge = sin(uv * (2.0 * PI)) * fade;
    N = normalize(N + O.model[2].xyz * sign(in.ext.z) * ridge.x * 0.29 + O.model[1].xyz * ridge.y * 0.12);
    flute = 0.925 + 0.055 * ridge.x + 0.015 * ridge.y;
  }
  let nv = clamp(dot(N, V), 0.001, 1.0);
  let nx = dot(outward, O.model[0].xyz);
  let ws = smoothstep(0.32, 0.66, abs(nx));
  let f0 = mix(0.036, 0.094, ws);
  let frWindow = f0 + (0.69 - f0) * pow(1.0 - nv, 1.85);
  let fr = select(frWindow, min(fSchlick1(select(0.05,0.034,id == 2u), nv), 0.46), id != 0u);
#ifdef GLASS_MUL
  var base = in.col.rgb;
  if (id == 0u) {
    base = mix(vec3f(0.92,0.945,0.932), vec3f(0.85,0.89,0.876), ws);
    if (nx > 0.3) { base *= mix(vec3f(1.0), vec3f(0.53,0.68,0.64), smoothstep(1.3,1.4,in.ext.y)); }
  }
  return vec4f(base * (1.0 - fr) * flute, 1.0);
#else
  let R = reflect(-V, N);
  let env = textureSampleLevel(tEnv, sClamp, R, select(0.72,0.4,id == 1u)).rgb;
  // Mantém as árvores escuras; um piso de luz difusa cobriria o piloto de cinza.
  let reflection = mix(vec3f(lum(env)),env,0.81) / (1.0 + 0.06 * lum(env));
  let L = F.sunDir.xyz; let H = normalize(L + V); let nl = sat(dot(N,L));
  let sh = sunShadow(in.wpos, N, in.pos.xy, nl);
  let sun = F.sunCol.rgb * nl * sh * min(dGGX(sat(dot(N,H)), 0.003) * vSmith(nv,nl,0.003), 14.0);
  return vec4f((reflection + sun) * fr * select(0.28, 1.0, ff), 0.0);
#endif
}
