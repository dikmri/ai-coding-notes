// 人の動きの記録（BVH）を、キャラ（VRM を変換したデータ）の骨に付け替えて、図鑑の項目が読める data/<id>.js にする道具。
//
// 使い方（プロジェクトの直下で）:
//   node tools/bvh2js.mjs <キャラのデータ id> <出力の id> <名前=表示名=BVH ファイル> ... [--credit 出典の表記]
//   例: node tools/bvh2js.mjs vroid-b motion-bn1 bow=お辞儀=runtime/assets/motion/a.bvh wave=手を振る=runtime/assets/motion/b.bvh
//
// 付け替えの計算は tools/lib/retarget.mjs。キャラを正面（+Z）に向けた空間で計算し、VRM 0.x の向き（-Z が正面）に戻して書き出す。
// 回転は 1 成分を Int16 に、腰の位置も Int16 に詰める（1 コマ 約 170 バイト）。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as B from './lib/bvh.mjs';
import { retarget, toVrm0Rotation, toVrm0Position } from './lib/retarget.mjs';
import * as M from './lib/meshpack.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [charId, outId, ...clipArgs] = pos;
if (!charId || !/^[a-z0-9-]+$/.test(outId || '') || !clipArgs.length) { console.error('使い方: node tools/bvh2js.mjs <キャラの id> <出力の id> <名前=表示名=BVH> ...'); process.exit(1); }

// キャラの立った姿（VRM の骨の位置）。基準の回転はすべて「回転なし」の前提
const sb = { window: {} }; sb.window = sb; vm.createContext(sb);
vm.runInContext(readFileSync(join(ROOT, 'data', charId + '.js'), 'utf8'), sb);
const D = sb.DEKIRU_DATA[charId];
for (const [b, n] of Object.entries(D.humanoid)) if (JSON.stringify(D.nodes[n].r) !== '[0,0,0,1]') throw new Error(`${b} の基準の回転が「回転なし」ではありません`);
const wpos = (n) => { let p = [0, 0, 0]; for (let i = n; i >= 0; i = D.nodes[i].parent) p = p.map((v, k) => v + D.nodes[i].t[k]); return p; };
const toFront = (p) => [-p[0], p[1], -p[2]];   // VRM 0.x（-Z が正面）を、+Z が正面の向きへ（縦の軸で 180 度）
const BONES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes'];
const PARENT = { hips: null, spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck', leftShoulder: 'upperChest', leftUpperArm: 'leftShoulder', leftLowerArm: 'leftUpperArm', leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest', rightUpperArm: 'rightShoulder', rightLowerArm: 'rightUpperArm', rightHand: 'rightLowerArm', leftUpperLeg: 'hips', leftLowerLeg: 'leftUpperLeg', leftFoot: 'leftLowerLeg', leftToes: 'leftFoot',
  rightUpperLeg: 'hips', rightLowerLeg: 'rightUpperLeg', rightFoot: 'rightLowerLeg', rightToes: 'rightFoot' };
for (const b of BONES) if (D.humanoid[b] == null) throw new Error(`キャラに ${b} の骨がありません`);
const rest = Object.fromEntries(BONES.map((b) => [b, toFront(wpos(D.humanoid[b]))]));
// Bandai Namco Research Motiondataset の関節の名前
const MAP = { hips: 'Hips', spine: 'Spine', chest: 'Chest', neck: 'Neck', head: 'Head', leftShoulder: 'Shoulder_L', leftUpperArm: 'UpperArm_L', leftLowerArm: 'LowerArm_L', leftHand: 'Hand_L',
  rightShoulder: 'Shoulder_R', rightUpperArm: 'UpperArm_R', rightLowerArm: 'LowerArm_R', rightHand: 'Hand_R', leftUpperLeg: 'UpperLeg_L', leftLowerLeg: 'LowerLeg_L', leftFoot: 'Foot_L', leftToes: 'Toes_L',
  rightUpperLeg: 'UpperLeg_R', rightLowerLeg: 'LowerLeg_R', rightFoot: 'Foot_R', rightToes: 'Toes_R' };
const OUT = Object.keys(MAP);   // 書き出す骨（上の胸は親と同じ向きなので書かない）

const pk = new M.Pack(), clips = [];
for (const a of clipArgs) {
  const [name, label, file] = a.split('=');
  const bvh = B.parse(readFileSync(file, 'utf8'));
  const r = retarget({ rest, parent: PARENT, map: MAP, bvh });
  const n = r.frames.length, rot = new Int16Array(n * OUT.length * 4), hips = new Float32Array(n * 3);
  r.frames.forEach((f, i) => {
    OUT.forEach((b, k) => {
      const q = toVrm0Rotation(f.rot[b]);   // VRM の向きの骨へ（tools/lib/retarget.mjs の説明）
      for (let c = 0; c < 4; c++) rot[(i * OUT.length + k) * 4 + c] = Math.round(Math.max(-1, Math.min(1, q[c])) * 32767);
    });
    hips.set(toVrm0Position(f.hips), i * 3);
  });
  const hq = M.quantizePositions(hips);
  clips.push({ name, label, fps: r.fps, frames: n, rot: pk.add(rot), hips: { ...pk.add(hq.q), min: hq.min, max: hq.max } });
  console.log(`${name}（${label}）: ${n} コマ・${(n / r.fps).toFixed(1)} 秒`);
}
const credit = opt('credit', 'Bandai Namco Research Motiondataset（Bandai Namco Research Inc.、CC BY-NC 4.0）を VRoid の骨へ付け替えて変換');
const data = { bones: OUT, clips, credit, bin: M.toBase64(pk.bytes()) };
const out = join(ROOT, 'data', outId + '.js');
writeFileSync(out, `/* 人の動きの記録を、キャラ「${charId}」の骨に付け替えたデータ。図鑑の項目が、開いたときだけ読み込む。
 * 出典: ${credit}
 * 元のデータ: https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset （ライセンス: https://creativecommons.org/licenses/by-nc/4.0/ 。非商用に限る）
 * tools/bvh2js.mjs で変換した（回転は Int16、腰の位置は箱の中の Uint16 に詰めてある）。 */\n(window.DEKIRU_DATA ??= {})[${JSON.stringify(outId)}] = ${JSON.stringify(data)};\n`);
console.log(`書き出し: data/${outId}.js ・ ${(readFileSync(out).length / 1024).toFixed(0)} KB`);
