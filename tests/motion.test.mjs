// 人の動きの記録（BVH）を読み、キャラの骨へ付け替える計算（tools/lib/quat.mjs・bvh.mjs・retarget.mjs）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Q from '../tools/lib/quat.mjs';
import * as B from '../tools/lib/bvh.mjs';
import { retarget } from '../tools/lib/retarget.mjs';

const close = (a, b, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const deg = Math.PI / 180;

test('四元数: Z・X・Y の順の角度は、Z 回転 × X 回転 × Y 回転と同じ', () => {
  const q = Q.fromEuler(['Z', 'X', 'Y'], [30, -50, 70]);
  const r = Q.mul(Q.mul(Q.fromAxis([0, 0, 1], 30 * deg), Q.fromAxis([1, 0, 0], -50 * deg)), Q.fromAxis([0, 1, 0], 70 * deg));
  for (const v of [[1, 0, 0], [0, 1, 0], [0.3, -0.4, 0.8]]) assert.ok(close(Q.rotate(q, v), Q.rotate(r, v)));
});

test('四元数: fromTo は向き a を向き b へ最短で回す（反対向きでも壊れない）', () => {
  for (const [a, b] of [[[1, 0, 0], [0, 1, 0]], [[0, 0, 1], [0.6, 0, 0.8]], [[0, 1, 0], [0, -1, 0]]]) {
    assert.ok(close(Q.rotate(Q.fromTo(a, b), a), b, 1e-6), JSON.stringify([a, b]));
  }
});

test('四元数: 3 本の軸（基底）から作った回転は、x・y・z 軸をその軸へ移す', () => {
  const x = [0, 0, -1], y = [0, 1, 0], z = [1, 0, 0];
  const q = Q.fromBasis(x, y, z);
  assert.ok(close(Q.rotate(q, [1, 0, 0]), x) && close(Q.rotate(q, [0, 1, 0]), y) && close(Q.rotate(q, [0, 0, 1]), z));
});

const BVH = `HIERARCHY
ROOT Hips
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0 10 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0 5 0
    }
  }
}
MOTION
Frames: 2
Frame Time: 0.0333333
1 2 3 0 0 0 0 0 0
0 0 0 90 0 0 0 0 0
`;

test('BVH: 骨の並び・回転の順・コマの数と値を読む', () => {
  const b = B.parse(BVH);
  assert.deepEqual(b.joints.map((j) => j.name), ['Hips', 'Spine']);
  assert.equal(b.joints[1].parent, 0);
  assert.deepEqual(b.joints[0].channels, ['Xposition', 'Yposition', 'Zposition', 'Zrotation', 'Xrotation', 'Yrotation']);
  assert.deepEqual(b.joints[1].end, [0, 5, 0]);
  assert.equal(b.frames.length, 2); assert.ok(Math.abs(b.frameTime - 1 / 30) < 1e-6);
  assert.deepEqual([...b.frames[0]], [1, 2, 3, 0, 0, 0, 0, 0, 0]);
});

test('BVH: 関節の世界での位置と回転（親の回転は子の位置も回す）', () => {
  const b = B.parse(BVH);
  const f0 = B.fk(b, 0);
  assert.ok(close(f0.pos[0], [1, 2, 3]) && close(f0.pos[1], [1, 12, 3]));
  const f1 = B.fk(b, 1);   // 腰を Z 軸で 90 度: 上向きの背骨が -X を向く
  assert.ok(close(f1.pos[1], [-10, 0, 0], 1e-6), JSON.stringify(f1.pos[1]));
  assert.ok(close(Q.rotate(f1.rot[1], b.joints[1].end), [-5, 0, 0], 1e-6));
});

// ---- 付け替え: 向きを埋め込んだ BVH でも、キャラの骨の向きが毎コマ一致する ----
// キャラ（VRM）: 立った T の字。背骨は上、腕は横、脚は下
const VRM = {
  hips: [0, 0.9, 0], spine: [0, 1.0, 0], chest: [0, 1.15, 0], upperChest: [0, 1.25, 0], neck: [0, 1.4, 0], head: [0, 1.5, 0],
  leftShoulder: [0.03, 1.35, 0], leftUpperArm: [0.12, 1.35, 0], leftLowerArm: [0.35, 1.35, 0], leftHand: [0.57, 1.35, 0],
  rightShoulder: [-0.03, 1.35, 0], rightUpperArm: [-0.12, 1.35, 0], rightLowerArm: [-0.35, 1.35, 0], rightHand: [-0.57, 1.35, 0],
  leftUpperLeg: [0.09, 0.85, 0], leftLowerLeg: [0.09, 0.48, 0], leftFoot: [0.09, 0.08, 0], leftToes: [0.09, 0.02, 0.12],
  rightUpperLeg: [-0.09, 0.85, 0], rightLowerLeg: [-0.09, 0.48, 0], rightFoot: [-0.09, 0.08, 0], rightToes: [-0.09, 0.02, 0.12],
};
const VPARENT = { hips: null, spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck',
  leftShoulder: 'upperChest', leftUpperArm: 'leftShoulder', leftLowerArm: 'leftUpperArm', leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest', rightUpperArm: 'rightShoulder', rightLowerArm: 'rightUpperArm', rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips', leftLowerLeg: 'leftUpperLeg', leftFoot: 'leftLowerLeg', leftToes: 'leftFoot',
  rightUpperLeg: 'hips', rightLowerLeg: 'rightUpperLeg', rightFoot: 'rightLowerLeg', rightToes: 'rightFoot' };
const MAP = { hips: 'Hips', spine: 'Spine', chest: 'Chest', neck: 'Neck', head: 'Head', leftShoulder: 'Shoulder_L', leftUpperArm: 'UpperArm_L', leftLowerArm: 'LowerArm_L', leftHand: 'Hand_L',
  rightShoulder: 'Shoulder_R', rightUpperArm: 'UpperArm_R', rightLowerArm: 'LowerArm_R', rightHand: 'Hand_R', leftUpperLeg: 'UpperLeg_L', leftLowerLeg: 'LowerLeg_L', leftFoot: 'Foot_L', leftToes: 'Toes_L',
  rightUpperLeg: 'UpperLeg_R', rightLowerLeg: 'LowerLeg_R', rightFoot: 'Foot_R', rightToes: 'Toes_R' };

// BVH 側: 体の大きさが違い（1.1 倍、cm）、どの関節にも「骨の向きを決める回転」が埋め込まれていて、角度 0 の姿勢には意味がない
// animOf(f, k, name) を渡すと、コマ f の関節 k の動き（世界での回転）を決められる。省くと、毎コマ少しずつ回す
const wobble = (f, k) => (f === 0 ? [0, 0, 0, 1] : Q.fromAxis(Q.normalize([Math.sin(k + f), 1, Math.cos(k * 2 - f)]), 0.4 * Math.sin(f * 0.7 + k)));
function makeBvh(frameCount, animOf = wobble) {
  const names = Object.values(MAP), vOf = Object.fromEntries(Object.entries(MAP).map(([v, b]) => [b, v]));
  const parentB = (b) => { let p = VPARENT[vOf[b]]; while (p && !MAP[p]) p = VPARENT[p]; return p ? MAP[p] : null; };
  const orient = Object.fromEntries(names.map((n, i) => [n, Q.normalize([Math.sin(i * 1.3), Math.cos(i * 0.7), Math.sin(i * 2.1 + 1), 1.2])]));
  const tipDir = { Head: [0, 0.12, 0], Hand_L: [0.08, 0, 0], Hand_R: [-0.08, 0, 0], Toes_L: [0, 0, 0.05], Toes_R: [0, 0, 0.05] };
  const joints = names.map((n) => {
    const p = parentB(n), wp = VRM[vOf[n]].map((x) => x * 110), pp = p ? VRM[vOf[p]].map((x) => x * 110) : [0, 0, 0];
    const op = p ? orient[p] : [0, 0, 0, 1];
    return { name: n, parent: p ? names.indexOf(p) : -1, offset: Q.rotate(Q.conj(op), wp.map((x, i) => x - pp[i])),
      channels: ['Xposition', 'Yposition', 'Zposition', 'Zrotation', 'Xrotation', 'Yrotation'], end: tipDir[n] ? Q.rotate(Q.conj(orient[n]), tipDir[n].map((x) => x * 110)) : null };
  });
  // 動き: 毎コマ、関節ごとに少しずつ回す（世界での回転 = 動き × 埋め込みの向き）
  const frames = [];
  for (let f = 0; f < frameCount; f++) {
    const world = {}, row = [];
    for (const [k, j] of joints.entries()) {
      const anim = animOf(f, k, j.name);
      const w = Q.mul(anim, orient[j.name]); world[k] = w;
      const local = j.parent < 0 ? w : Q.mul(Q.conj(world[j.parent]), w);
      const e = Q.toEuler(['Z', 'X', 'Y'], local);
      row.push(...(j.parent < 0 ? [0, 99 + f, 0] : j.offset), ...e);
    }
    frames.push(Float32Array.from(row));
  }
  return { joints, frames, frameTime: 1 / 30 };
}

test('付け替え: 角度 0 に意味がない BVH でも、どのコマもキャラの骨の向きが BVH の骨の向きと一致する', () => {
  const bvh = makeBvh(6);
  const out = retarget({ rest: VRM, parent: VPARENT, map: MAP, bvh });
  assert.equal(out.frames.length, 6);
  for (let f = 0; f < 6; f++) {
    const fk = B.fk(bvh, f), idx = Object.fromEntries(bvh.joints.map((j, i) => [j.name, i]));
    // キャラの骨の世界での回転を、局所の回転から組み立てる
    const W = {};
    for (const v of Object.keys(VPARENT)) W[v] = VPARENT[v] ? Q.mul(W[VPARENT[v]], out.frames[f].rot[v] || [0, 0, 0, 1]) : out.frames[f].rot[v];
    for (const [v, child] of [['spine', 'chest'], ['leftUpperArm', 'leftLowerArm'], ['leftLowerArm', 'leftHand'], ['rightUpperLeg', 'rightLowerLeg'], ['rightLowerLeg', 'rightFoot'], ['neck', 'head']]) {
      const restDir = Q.normalize3(VRM[child].map((x, i) => x - VRM[v][i]));
      const got = Q.rotate(W[v], restDir);
      const want = Q.normalize3(fk.pos[idx[MAP[child]]].map((x, i) => x - fk.pos[idx[MAP[v]]][i]));
      const dot = got[0] * want[0] + got[1] * want[1] + got[2] * want[2];
      assert.ok(dot > 0.9999, `コマ ${f} ${v}: ${dot}`);
    }
  }
});

test('付け替え: 腰の高さは体の大きさの比で縮め、最初のコマで腰はキャラの腰の位置にある', () => {
  const out = retarget({ rest: VRM, parent: VPARENT, map: MAP, bvh: makeBvh(3) });
  assert.ok(close(out.frames[0].hips, VRM.hips, 1e-6), JSON.stringify(out.frames[0].hips));
  assert.ok(Math.abs(out.frames[2].hips[1] - (0.9 + 2 * 0.9 / 99)) < 1e-6, String(out.frames[2].hips[1]));
});

test('VRM の向きへの移し方: VRM の骨（180 度回った基準の姿）で組んでから回すと、正面向きの空間で組んだ姿と同じ位置になる', async () => {
  const { toVrm0Rotation, toVrm0Position } = await import('../tools/lib/retarget.mjs');
  // 2 つの骨: 腰（位置 h）と、その子（正面向きの空間で親から t 離れている）
  const h = [0.1, 0.9, 0.2], t = [0.08, -0.05, 0.02], Lh = Q.fromAxis([0.3, 1, 0.2], 0.8), Lc = Q.fromAxis([1, 0.2, -0.4], 1.1);
  const want = h.map((v, i) => v + Q.rotate(Lh, t)[i]);                       // 正面向きの空間で組んだ子の位置
  const R = [0, 1, 0, 0], tm = toVrm0Position(t), hm = toVrm0Position(h);    // VRM の向きの骨（位置は R⁻¹ 済み）
  const Wm = toVrm0Rotation(Lh), childM = hm.map((v, i) => v + Q.rotate(Wm, tm)[i]);
  const got = Q.rotate(R, childM);                                            // 描くときに 180 度回す
  assert.ok(close(got, want, 1e-9), JSON.stringify([got, want]));
  // 子の向きも一致する（子の局所の回転も同じ式で移す）
  const dirWant = Q.rotate(Q.mul(Lh, Lc), [0, 1, 0]), dirGot = Q.rotate(R, Q.rotate(Q.mul(Wm, toVrm0Rotation(Lc)), toVrm0Position([0, 1, 0])));
  assert.ok(close(dirGot, dirWant, 1e-9));
});

// キャラの骨の世界での回転を、付け替えた局所の回転から組み立て、顔の前（+Z）の向きを返す
const faceOf = (frame) => {
  const W = {};
  for (const v of Object.keys(VPARENT)) W[v] = VPARENT[v] ? Q.mul(W[VPARENT[v]], frame.rot[v] || [0, 0, 0, 1]) : frame.rot[v];
  return { face: Q.rotate(W.head, [0, 0, 1]), hipsFwd: Q.rotate(W.hips, [0, 0, 1]) };
};

test('付け替え: 頭が動かない動きでは、顔は水平で腰と同じ向きを向く（BVH の頭の先の向きが傾いていても、あごが上がらない）', () => {
  const bvh = makeBvh(3, () => [0, 0, 0, 1]);
  bvh.joints.find((j) => j.name === 'Head').end = [0, 13, -6];   // 頭の先が後ろへ傾いた BVH
  const out = retarget({ rest: VRM, parent: VPARENT, map: MAP, bvh });
  for (const fr of out.frames) {
    const { face, hipsFwd } = faceOf(fr);
    assert.ok(Math.abs(face[1]) < 1e-6, `顔が上下を向いている: ${face}`);
    const h = Q.normalize3([hipsFwd[0], 0, hipsFwd[2]]);
    assert.ok(face[0] * h[0] + face[2] * h[2] > 0.9999, `顔が腰と違う向き: ${face} / ${h}`);
  }
});

test('付け替え: 最初のコマだけ頭を大きく下げた動きでも、ふだんのコマの顔は水平で、最初のコマはうつむく（踊りの最初の構え）', () => {
  // 最初のコマだけ、頭を左右の軸で 0.7 ラジアン（40 度）前へ倒す。ほかのコマと関節はずっと動かない
  const bvh = makeBvh(10, (f, k, name) => (f === 0 && name === 'Head' ? Q.fromAxis([1, 0, 0], 0.7) : [0, 0, 0, 1]));
  const out = retarget({ rest: VRM, parent: VPARENT, map: MAP, bvh });
  for (let f = 1; f < 10; f++) assert.ok(Math.abs(faceOf(out.frames[f]).face[1]) < 1e-6, `コマ ${f} の顔が上下を向いている: ${faceOf(out.frames[f]).face}`);
  const f0 = faceOf(out.frames[0]).face;
  assert.ok(Math.abs(f0[1] + Math.sin(0.7)) < 1e-6, `最初のコマがうつむいていない: ${f0}`);
});
