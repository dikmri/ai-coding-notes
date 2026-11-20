// Névoa exponencial em altura com dispersão do sol para a frente. Requer F e tEnv/sClamp.
fn fogOD(cam: vec3f, dir: vec3f, dist: f32) -> f32 {
  let a = F.fog.x; let b = F.fog.y; let dy = dir.y * dist;
  let base = a * exp(-b * (cam.y - F.fog.z));
  let k = b * dy;
  let f = select((1.0 - exp(-k)) / k, 1.0 - k * 0.5, abs(k) < 1e-3);
  return base * dist * f;
}
// g era 0,6: contra o sol, a névoa ficava ~14x mais clara que de lado e lavava a tela inteira de branco (pose 6)
fn fogPhase(c: f32) -> f32 { let g = 0.5; let g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
// 0,9 → 0,6: o véu leitoso contra o sol (pose 6) ainda tomava o fundo inteiro (revisão 2)
fn fogSunCol(dir: vec3f) -> vec3f { return F.sunCol.rgb * (fogPhase(dot(dir, F.sunDir.xyz)) * 0.6 + 0.035) * F.fog.w; }
fn fogAmbCol(dir: vec3f) -> vec3f {
  let d = normalize(vec3f(dir.x, max(dir.y, 0.0) * 0.5 + 0.06, dir.z));
  return textureSampleLevel(tEnv, sClamp, d, ENV_MIPS - 2.0).rgb * F.fogCol.a + F.fogCol.rgb;
}
