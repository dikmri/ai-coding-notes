// 人の動きの記録（BVH）を、キャラ（VRM）の骨へ付け替える。
//
// BVH は関節ごとに「骨の向きを決める回転」が角度に埋め込まれていて、角度 0 の姿勢には意味がないことがある。
// そこで次の 2 段で付け替える。
//  1. 最初のコマ: キャラの骨が BVH の骨と同じ向きを指すように、親から順に最小の回転で合わせる（腰は背骨と脚の付け根の線から向きを決める）
//  2. そのときの「BVH の関節の回転」と「キャラの骨の回転」の差を骨ごとの補正 C として覚え、以後のコマは BVH の回転 × C にする
// こうすると、どのコマでも骨の向きは BVH と一致し、腕や手首のひねりも BVH に従う。
// rest はキャラの立った姿（T の字、正面が +Z）での骨の位置、parent はキャラの骨の親子（親が先に並ぶ）、map はキャラの骨 → BVH の関節の名前。
import * as Q from './quat.mjs';
import { fk } from './bvh.mjs';

// 骨の向き: その骨から、この子の骨へ。null は先端の骨（BVH の End Site や、決まった向きを使う）
const DIR = {
  spine: 'chest', chest: 'neck', neck: 'head', head: null,
  leftShoulder: 'leftUpperArm', leftUpperArm: 'leftLowerArm', leftLowerArm: 'leftHand', leftHand: null,
  rightShoulder: 'rightUpperArm', rightUpperArm: 'rightLowerArm', rightLowerArm: 'rightHand', rightHand: null,
  leftUpperLeg: 'leftLowerLeg', leftLowerLeg: 'leftFoot', leftFoot: 'leftToes', leftToes: null,
  rightUpperLeg: 'rightLowerLeg', rightLowerLeg: 'rightFoot', rightFoot: 'rightToes', rightToes: null,
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
// 先端の骨の、キャラでの向き: 頭は上、手は前の骨の続き、つま先は足の続き
const TIP = { head: () => [0, 1, 0], leftHand: (r) => sub(r.leftHand, r.leftLowerArm), rightHand: (r) => sub(r.rightHand, r.rightLowerArm), leftToes: (r) => sub(r.leftToes, r.leftFoot), rightToes: (r) => sub(r.rightToes, r.rightFoot) };
// 腰の向き: 上（背骨へ）と右（左脚の付け根 → 右脚の付け根）から、直交する 3 本の軸を作る
function basis(up, right) {
  const y = Q.normalize3(up), r = Q.normalize3(right), x = Q.normalize3(sub(r, y.map((v) => v * Q.dot3(r, y))));
  return { q: Q.fromBasis(x, y, Q.cross(x, y)), z: Q.cross(x, y) };
}

export function retarget({ rest, parent, map, bvh }) {
  const names = Object.keys(parent), idx = Object.fromEntries(bvh.joints.map((j, i) => [j.name, i]));
  const J = (v) => idx[map[v]];
  for (const v of Object.keys(map)) if (J(v) == null) throw new Error(`BVH に ${map[v]} がありません`);
  const frames0 = fk(bvh, 0);
  // 正面合わせ: 最初のコマで腰の向きがキャラの正面（+Z）を向くように、BVH 全体を縦の軸で回す
  const bb0 = basis(sub(frames0.pos[J('spine')], frames0.pos[J('hips')]), sub(frames0.pos[J('rightUpperLeg')], frames0.pos[J('leftUpperLeg')]));
  const vb = basis(sub(rest.spine, rest.hips), sub(rest.rightUpperLeg, rest.leftUpperLeg));
  const yaw = Math.atan2(vb.z[0], vb.z[2]) - Math.atan2(bb0.z[0], bb0.z[2]), G = Q.fromAxis([0, 1, 0], yaw);
  const world = (f) => { const k = fk(bvh, f); return { pos: k.pos.map((p) => Q.rotate(G, p)), rot: k.rot.map((r) => Q.mul(G, r)) }; };
  const dirOf = (w, v) => (DIR[v] ? sub(w.pos[J(DIR[v])], w.pos[J(v)]) : Q.rotate(w.rot[J(v)], bvh.joints[J(v)].end || [0, 1, 0]));
  const restDir = (v) => (DIR[v] ? sub(rest[DIR[v]], rest[v]) : TIP[v](rest));

  // 1. 最初のコマで向きを合わせ、骨ごとの補正 C を求める
  const w0 = world(0), Wv0 = {}, C = {};
  Wv0.hips = Q.mul(basis(sub(w0.pos[J('spine')], w0.pos[J('hips')]), sub(w0.pos[J('rightUpperLeg')], w0.pos[J('leftUpperLeg')])).q, Q.conj(vb.q));
  for (const v of names) {
    if (v === 'hips') continue;
    const pw = Wv0[parent[v]];
    if (!map[v]) { Wv0[v] = pw; continue; }   // BVH にない骨（上の胸など）は親と同じ向き
    if (v === 'head') {
      // 頭: BVH の「頭の先」は顔の向きと合っていないことがある（後ろへ傾いていると、あごが上がる）。
      // 最初のコマの俳優は正面を見ている前提で、顔を水平にし、腰と同じ向きへ向ける
      const f = Q.rotate(Wv0.hips, [0, 0, 1]);
      Wv0[v] = Q.fromAxis([0, 1, 0], Math.atan2(f[0], f[2]));
      continue;
    }
    Wv0[v] = Q.mul(Q.fromTo(Q.rotate(pw, restDir(v)), dirOf(w0, v)), pw);
  }
  for (const v of Object.keys(map)) C[v] = Q.mul(Q.conj(w0.rot[J(v)]), Wv0[v]);

  // 2. どのコマも BVH の回転 × C。局所の回転は「親の世界の回転の逆 × 自分の世界の回転」
  const s = rest.hips[1] / w0.pos[J('hips')][1], h0 = w0.pos[J('hips')], out = [], prev = {};
  for (let f = 0; f < bvh.frames.length; f++) {
    const w = f === 0 ? w0 : world(f), Wv = {}, rot = {};
    for (const v of names) {
      Wv[v] = map[v] ? Q.normalize(Q.mul(w.rot[J(v)], C[v])) : Wv[parent[v]];
      let q = parent[v] ? Q.mul(Q.conj(Wv[parent[v]]), Wv[v]) : Wv[v];
      if (prev[v] && q[0] * prev[v][0] + q[1] * prev[v][1] + q[2] * prev[v][2] + q[3] * prev[v][3] < 0) q = q.map((x) => -x);   // 前のコマと同じ半球にそろえる（補間で遠回りしない）
      if (map[v]) { rot[v] = q; prev[v] = q; }
    }
    const h = w.pos[J('hips')];
    out.push({ rot, hips: [rest.hips[0] + (h[0] - h0[0]) * s, rest.hips[1] + (h[1] - h0[1]) * s, rest.hips[2] + (h[2] - h0[2]) * s] });
  }
  return { fps: 1 / bvh.frameTime, frames: out };
}

// 正面向きの空間（+Z が正面、骨の基準の回転なし）で求めた局所の回転と位置を、VRM 0.x の骨（-Z が正面）へ移す。
// VRM の骨は正面向きの空間では縦の軸で 180 度（R）回った姿が基準なので、回転は R⁻¹ × q × R ではさむ（x と z の符号が変わる）。
// 位置は R⁻¹ を掛ける（x と z の符号が変わる）。腰も同じ式でよい
export const toVrm0Rotation = (q) => [-q[0], q[1], -q[2], q[3]];
export const toVrm0Position = (p) => [-p[0], p[1], -p[2]];
