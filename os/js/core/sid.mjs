// SID 風の音の計算（AudioWorklet と画面の両方から使う）。値は公開されている SID の仕組みにならう
export const TRI = 1, SAW = 2, PUL = 4, NOI = 8;
export const noteFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export function parseNote(s) {
  const m = /^([A-G])([-#])(-?\d)$/i.exec(String(s).trim());
  if (!m) return null;
  const i = NAMES.indexOf(m[1].toUpperCase() + m[2]);
  return i < 0 ? null : (+m[3] + 1) * 12 + i;
}
// 位相 0〜1 から 12 ビットの値（0〜4095）を作り、選んだ波形どうしは AND で重ねる（SID の合成波形と同じ考え方）
export function waveSample(bits, phase, pw, noise) {
  let v = 4095, any = false;
  if (bits & TRI) { v &= Math.round((phase < 0.5 ? phase * 2 : 2 - phase * 2) * 4095); any = true; }
  if (bits & SAW) { v &= Math.round(phase * 4095); any = true; }
  if (bits & PUL) { v &= phase < pw ? 4095 : 0; any = true; }
  if (bits & NOI) { v &= noise & 4095; any = true; }
  return any ? (v / 4095) * 2 - 1 : 0;
}
// 23 ビットの雑音レジスタ（17 と 22 ビット目の排他的論理和を戻す）
export const lfsrNext = (s) => ((s << 1) | (((s >> 22) ^ (s >> 17)) & 1)) & 0x7fffff;
// レジスタの決まったビットを拾って 12 ビットの雑音の値にする
export const noiseValue = (s) => (((s >> 22) & 1) << 11) | (((s >> 20) & 1) << 10) | (((s >> 16) & 1) << 9) | (((s >> 13) & 1) << 8) | (((s >> 11) & 1) << 7) | (((s >> 7) & 1) << 6) | (((s >> 4) & 1) << 5) | (((s >> 2) & 1) << 4);
// エンベロープ（立ち上がり→減衰→保持→余韻）。dt 秒だけ進めた新しい状態を返す
export function envStep(e, gate, p, dt) {
  let { stage, level } = e;
  if (gate && (stage === 'off' || stage === 'r')) stage = 'a';
  if (!gate && stage !== 'off' && stage !== 'r') stage = 'r';
  if (stage === 'a') { level += dt / Math.max(p.a, 1e-4); if (level >= 1) { level = 1; stage = 'd'; } }
  else if (stage === 'd') { level -= (dt / Math.max(p.d, 1e-4)) * (1 - p.s); if (level <= p.s) { level = p.s; stage = 's'; } }
  else if (stage === 's') level = p.s;
  else if (stage === 'r') { level -= dt / Math.max(p.r, 1e-4); if (level <= 0) { level = 0; stage = 'off'; } }
  return { stage, level };
}
// 状態変数型フィルター（チェンバリン）。1 サンプル進めて lp・bp・hp を返す。res は 0〜1（大きいほど鋭い）
export function svf(st, x, cutoff, res, sr) {
  const f = 2 * Math.sin((Math.PI * Math.min(cutoff, sr / 6)) / sr), q = 2 - 1.9 * Math.min(Math.max(res, 0), 1);
  const lp = st.lp + f * st.bp, hp = x - lp - q * st.bp, bp = st.bp + f * hp;
  return { lp, bp, hp };
}
