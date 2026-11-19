// 図鑑の項目「1 枚のシェーダーで描く、夕暮れの道を走る自転車」（entries/real.js の real-dusk-ride）の core（画面を使わない計算）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sb);
vm.runInContext(readFileSync(join(ROOT, 'entries/real.js'), 'utf8'), sb, { filename: 'entries/real.js' });
const e = sb.dekiru.entries.find((x) => x.id === 'real-dusk-ride');
const ctx = vm.createContext({ Math, Float32Array, Array, Object, Number, JSON });
vm.runInContext(sb.dekiru.src(e.core) + '\n;globalThis.__x = RD;', ctx);
const RD = ctx.__x, P = RD.P;

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} と ${b} の差が ${tol} を超える`);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('繰り返しの長さ: 1 周の時間で進む距離が、道の形の繰り返しの長さと同じ。ペダルは 1 周でちょうど整数回まわる', () => {
  near(P.V * P.T, P.D, 1e-9, '進む距離');
  near(P.CAD * P.T, Math.round(P.CAD * P.T), 1e-9, 'ペダルの回数');
  // 車輪は 1 周で、スポークの間の角度のちょうど整数倍だけ回る（スポークの模様がつながる）
  const turns = (P.D / P.WHEEL_R) / (2 * Math.PI / P.SPOKES);
  near(turns, Math.round(turns), 1e-6, 'スポークの間の数');
});

test('道: 中心の線は、繰り返しの長さだけ先で同じ位置と高さに戻る', () => {
  for (const z of [0, 13.7, 55.2, 91]) {
    near(RD.roadX(z + P.D), RD.roadX(z), 1e-9, `x ${z}`);
    near(RD.roadY(z + P.D), RD.roadY(z), 1e-9, `y ${z}`);
  }
});

test('道の曲がり方: 傾き（微分）と曲がり（2 階の微分）は、数値の差分と合う。曲率は x″ / (1 + x′²)^1.5', () => {
  const h = 1e-4;
  for (const z of [3, 27, 64]) {
    near(RD.roadDX(z), (RD.roadX(z + h) - RD.roadX(z - h)) / (2 * h), 1e-6, `x' ${z}`);
    near(RD.roadDDX(z), (RD.roadX(z + h) - 2 * RD.roadX(z) + RD.roadX(z - h)) / (h * h), 1e-4, `x'' ${z}`);
    near(RD.curv(z), RD.roadDDX(z) / Math.pow(1 + RD.roadDX(z) ** 2, 1.5), 1e-12, `κ ${z}`);
  }
});

test('自転車の傾き: 遠心力と重力の釣り合いで atan(v²κ / g)。右へ曲がるときは右へ傾く（正）', () => {
  near(RD.lean(10, 0.0981, 9.81), Math.PI / 4, 1e-12, '45 度');
  assert.equal(RD.lean(10, 0, 9.81), 0);
  assert.ok(RD.lean(10, -0.02, 9.81) < 0);
});

test('2 本の骨の IK: 骨の長さを保ち、膝は目印（pole）の側に出る', () => {
  const a = [0, 1, 0], c = [0, 0.25, 0.3], knee = RD.ik2(a, c, 0.44, 0.44, [0, 0, 1]);
  near(dist(a, knee), 0.44, 1e-9, '太もも');
  near(dist(knee, c), 0.44, 1e-9, 'すね');
  assert.ok(knee[2] > 0.15, '膝が前に出る');
  // 届かない遠さでは、伸び切った向きに置く（長さは保つ）
  const far = RD.ik2(a, [0, -1, 0], 0.44, 0.44, [0, 0, 1]);
  near(dist(a, far), 0.44, 1e-9, '届かないときの太もも');
});

test('骨組み: 1 周後の姿は、繰り返しの長さだけ前へ動かした同じ姿（映像がつなぎ目なく繰り返す）', () => {
  for (const t of [0, 2.3, 7.9]) {
    const a = RD.rig(t, { lean: true }), b = RD.rig(t + P.T, { lean: true });
    for (const k of Object.keys(a.J)) {
      near(b.J[k][0], a.J[k][0], 1e-6, `${k} x`); near(b.J[k][1], a.J[k][1], 1e-6, `${k} y`); near(b.J[k][2], a.J[k][2] + P.D, 1e-6, `${k} z`);
    }
    near(b.cam.p[2], a.cam.p[2] + P.D, 1e-6, 'カメラ z');
    near(b.cam.p[0], a.cam.p[0], 1e-6, 'カメラ x');
  }
});

test('骨組み: 脚と腕の長さは、どの時刻でも変わらない。足はペダルの上にある', () => {
  for (const t of [0, 0.17, 1.3, 4.44]) {
    const J = RD.rig(t, { lean: true }).J;
    for (const s of ['L', 'R']) {
      near(dist(J['hip' + s], J['knee' + s]), P.THIGH, 1e-9, `太もも ${s} ${t}`);
      near(dist(J['knee' + s], J['ankle' + s]), P.SHIN, 1e-9, `すね ${s} ${t}`);
      near(dist(J['shoulder' + s], J['elbow' + s]), P.UPPER, 1e-9, `上腕 ${s} ${t}`);
      near(dist(J['elbow' + s], J['hand' + s]), P.FORE, 1e-9, `前腕 ${s} ${t}`);
      near(dist(J['pedal' + s], J.bb), Math.hypot(P.CRANK, P.PEDAL_X), 1e-9, `クランク ${s} ${t}`);
    }
  }
});

test('傾きを切ると、自転車の上の向きは道の上の向きのまま。切らないと、曲がる側へ傾く', () => {
  const zMax = [...Array(200)].map((_, i) => i * P.D / 200).reduce((a, z) => (Math.abs(RD.curv(z)) > Math.abs(RD.curv(a)) ? z : a), 0);
  const t = ((zMax - P.Z0) / P.V % P.T + P.T) % P.T;
  const on = RD.rig(t, { lean: true }), off = RD.rig(t, { lean: false });
  near(off.theta, 0, 1e-12, '切ったときの角度');
  near(on.theta, RD.lean(P.V, RD.curv(RD.rig(t, { lean: true }).z), P.G), 1e-12, '傾きの角度');
  assert.ok(Math.abs(on.theta) > 5 * Math.PI / 180, `いちばん曲がる所では 5 度より大きく傾く（${(on.theta * 180 / Math.PI).toFixed(1)} 度）`);
  // 上の向き U の、右の向きへの成分の符号が、曲がる向きと同じ
  const side = on.U[0] * off.R[0] + on.U[1] * off.R[1] + on.U[2] * off.R[2];
  assert.equal(Math.sign(side), Math.sign(RD.curv(on.z)));
});
