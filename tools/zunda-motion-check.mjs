// 図鑑の項目「コードで描いたずんだもんを立体的に動かす」の動きを、項目の core（entries/zunda.js）で全コマ計算して確かめる道具。
// 使い方: node tools/zunda-motion-check.mjs [--json logs/zunda-motion.json]
// 数（背の高さに対する割合）:
//   moved: 床に合わせた量（体のいちばん低い所を床に着けるために上下させた量。VRoid の体の比率との違いの大きさ）
//   floor: 合わせたあとの、体のいちばん低い所と床とのずれ（目安 3% 以内。設計書の段階 3）
//   ankleLift: 低い方の足首の浮き（立っているときの足首の高さから。座る・脚を上げる振り付けで大きくなる）
//   jointJump: 1 コマの間に関節が動く距離のいちばん大きい値（動きのつなぎ目や、床に合わせる量の切り替わりで、体が飛んでいないか）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const OUT = join(ROOT, args.includes('--json') ? args[args.indexOf('--json') + 1] : 'logs/zunda-motion.json');
const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sb);
vm.runInContext(readFileSync(join(ROOT, 'entries/zunda.js'), 'utf8'), sb);
const e = sb.dekiru.entries.find((x) => x.id === '3d-zunda-move');
const ctx = vm.createContext({ Math, Float32Array, Float64Array, Int16Array, Uint16Array, Uint8Array, Int8Array, Uint32Array, Array, Object, Number, JSON });
vm.runInContext(sb.dekiru.src(e.core) + '\n;globalThis.__x = Z;', ctx);
const Z = ctx.__x;
const w = {}; new Function('window', readFileSync(join(ROOT, 'data/motion-bn1.js'), 'utf8'))(w);
const MO = w.DEKIRU_DATA['motion-bn1'], bytes = new Uint8Array(Buffer.from(MO.bin, 'base64'));

const SK = Z.buildSkeleton(Z.SKEL), REST = Z.restLocals(SK), BI = SK.index;
const HEIGHT = Z.FLOOR_Y - 140;   // 背の高さ（足の裏から頭のてっぺんまで、元の絵の画素）
const ankleRest = SK.bones[BI.leftFoot].at[1];
const stat = (a) => ({ min: +Math.min(...a).toFixed(4), max: +Math.max(...a).toFixed(4), meanAbs: +(a.reduce((s, v) => s + Math.abs(v), 0) / a.length).toFixed(4) });
const result = { date: new Date().toISOString(), heightPx: HEIGHT, clips: [] };
for (const cl of MO.clips) {
  const clip = { ...cl, rotA: Z.view(bytes, cl.rot), hipsA: Z.dequant(Z.view(bytes, cl.hips), cl.hips.min, cl.hips.max, 3) };
  const moved = [], floor = [], ankle = [], jump = [];
  let prev = null;
  for (let f = 0; f < cl.frames; f++) {
    const s = Z.sampleClip(clip, f / cl.fps), L = REST.map((q) => q.slice());
    s.rot.forEach((q, k) => { L[BI[MO.bones[k]]] = q; });
    const P = Z.fk(SK, L, Z.hipsFromMotion(s.hips, SK)), g = Z.groundOffset(SK, P);
    for (const p of P.p) p[1] += g;   // 項目と同じく、体のいちばん低い所を床に着ける
    moved.push(g / HEIGHT); floor.push(-Z.groundOffset(SK, P) / HEIGHT);
    ankle.push((ankleRest - Math.max(P.p[BI.leftFoot][1], P.p[BI.rightFoot][1])) / HEIGHT);
    if (prev) jump.push(Math.max(...P.p.map((p, i) => Math.hypot(p[0] - prev[i][0], p[1] - prev[i][1], p[2] - prev[i][2]))) / HEIGHT);
    prev = P.p.map((p) => p.slice());
  }
  result.clips.push({ name: cl.name, label: cl.label, frames: cl.frames, moved: stat(moved), floor: stat(floor), ankleLift: stat(ankle), jointJump: stat(jump), pass: Math.max(...floor.map(Math.abs)) <= 0.03 });
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
for (const c of result.clips) console.log(`${c.label.padEnd(10, '　')} 合わせた量 ${c.moved.min}〜${c.moved.max}  床とのずれ ${c.floor.min}〜${c.floor.max}  足首の浮き ${c.ankleLift.min}〜${c.ankleLift.max}  1 コマの最大の動き ${c.jointJump.max}${c.pass ? ' 合格' : ' 不合格'}`);
