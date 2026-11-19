// 図鑑の項目「コードで描いたずんだもんを立体的に動かす」（entries/zunda.js）の core（画面を使わない計算）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(readFileSync(join(ROOT, 'js/registry.js'), 'utf8'), sb);
vm.runInContext(readFileSync(join(ROOT, 'entries/zunda.js'), 'utf8'), sb, { filename: 'entries/zunda.js' });
const e = sb.dekiru.entries.find((x) => x.id === '3d-zunda-move');
const ctx = vm.createContext({ Math, Float32Array, Float64Array, Int16Array, Uint8Array, Array, Object, Number, JSON });
vm.runInContext(sb.dekiru.src(e.core) + '\n;globalThis.__x = Z;', ctx);
const Z = ctx.__x;

const names = (blend) => Array.from(blend, (v) => v.view); // vm の中で作った配列を、ここの配列に写して比べる
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} と ${b} の差が ${tol} を超える`);

// ---- 曲線のデータ ----
test('曲線: M・c・l・z の相対の命令を、絶対座標の 3 次ベジェにする（直線もベジェにし、閉じる線を足す）', () => {
  const subs = Z.parsePath('M10 20c1 0 2 1 3 2l4 0z', [100, 200]);
  assert.equal(subs.length, 1);
  const s = [...subs[0]].map((v) => +v.toFixed(4));
  // 始点 (110,220) → c で (113,222) → l で (117,222) → z で始点へ
  assert.deepEqual(s.slice(0, 8), [110, 220, 111, 220, 112, 221, 113, 222]);
  assert.deepEqual(s.slice(6, 14).map((v) => +v.toFixed(3)), [113, 222, 114.333, 222, 115.667, 222, 117, 222]);
  assert.deepEqual(s.slice(-2), [110, 220]);
  assert.equal((s.length - 2) % 6, 0);
});

test('曲線: 区切りを省いた数（1.5.5、-.5、12-3）を正しく読み、続く同じ命令をくり返しとして扱う', () => {
  const subs = Z.parsePath('M0 0l1.5.5-.5 1l12-3z', [0, 0]);
  const s = [...subs[0]];
  assert.deepEqual([s[6], s[7]], [1.5, 0.5]);
  assert.deepEqual([s[12], s[13]], [1, 1.5]);
  assert.deepEqual([s[18], s[19]], [13, -1.5]);
});

test('曲線: 長い区間は半分ずつに分け、どの区間も弦の長さが上限以下になる。形（中点）は変わらない', () => {
  const [s] = Z.parsePath('M0 0c10 0 30 20 40 20z', [0, 0]);
  const fine = Z.subdivide(s, 5);
  for (let i = 0; i + 8 <= fine.length; i += 6) near(Math.hypot(fine[i + 6] - fine[i], fine[i + 7] - fine[i + 1]), 0, 5.0001, '弦');
  // 元の曲線の t=0.5 の点が、細かくした点のどれかと一致する
  const mid = [0.125 * 0 + 0.375 * 10 + 0.375 * 30 + 0.125 * 40, 0.375 * 20 + 0.125 * 20];
  let best = Infinity; for (let i = 0; i < fine.length; i += 2) best = Math.min(best, Math.hypot(fine[i] - mid[0], fine[i + 1] - mid[1]));
  near(best, 0, 1e-6, '中点');
});

// ---- 立体の形（楕円の断面）----
// 正面の幅 a = 40、横の奥行き c = 60、奥行きの中心 cz = -10 の楕円柱を、正面と横の輪郭で表す
function cylinderRows(y0, n, a, c, cz) {
  const fx = [], sz = [];
  for (let i = 0; i < n; i++) { fx.push([-a, a]); sz.push([cz - c, cz + c]); }
  return { y0, fx, sz };
}

test('立体の形: 正面の幅と横の奥行きから、行ごとの楕円（中心と半径）を作る', () => {
  const r = cylinderRows(100, 20, 40, 60, -10);
  const P = Z.buildProxy(r.y0, r.fx, r.sz, { smooth: 0 });
  const k = 5;
  near(P.cx[k], 0, 1e-9); near(P.a[k], 40, 1e-9); near(P.cz[k], -10, 1e-9); near(P.c[k], 60, 1e-9);
});

test('立体の形: 片方の向きにしかない行は、両方そろった近い行の値を使う', () => {
  const fx = [null, null, [-10, 10], [-20, 20], null], sz = [[-5, 5], [-6, 6], [-7, 7], [-8, 8], [-9, 9]];
  const P = Z.buildProxy(50, fx, sz, { smooth: 0 });
  near(P.a[0], 10, 1e-9, '上'); near(P.c[0], 7, 1e-9, '上の奥行き'); near(P.a[4], 20, 1e-9, '下');
});

test('持ち上げ: 正面の絵の点は楕円の前の面に乗り、横の絵の点は楕円の左の面に乗る', () => {
  const r = cylinderRows(0, 10, 40, 60, -10);
  const P = Z.buildProxy(r.y0, r.fx, r.sz, { smooth: 0 });
  // 正面の真ん中: 前の面のいちばん前（Z = cz + c）
  let p = Z.lift(P, 'front', 0, 5);
  near(p[0], 0, 1e-9); near(p[2], 50, 1e-9); near(p[3], 0, 1e-9); near(p[5], 1, 1e-9, '法線は前');
  // 正面の右の端（X = a）: 楕円の横の端
  p = Z.lift(P, 'front', 40, 5); near(p[0], 40, 1e-9); near(p[2], -10, 1e-9); near(p[3], 1, 1e-9, '法線は左');
  // 横の絵の点（Z = 20）: 左の面（X ≥ 0）にある
  p = Z.lift(P, 'left', 20, 5);
  near(p[2], 20, 1e-9); assert.ok(p[0] > 0);
  near((p[0] / 40) ** 2 + ((p[2] + 10) / 60) ** 2, 1, 1e-9, '楕円の上');
  // 後ろの絵の点: 後ろの面（Z = cz - c まで）
  p = Z.lift(P, 'back', 0, 5); near(p[2], -70, 1e-9); near(p[5], -1, 1e-9);
  // 右の横（左の横を鏡に写す）: X ≤ 0
  p = Z.lift(P, 'right', 20, 5); assert.ok(p[0] < 0);
});

test('持ち上げ: 楕円より外の点（髪の先が出ている所）は、楕円の端から外へ出たまま置く', () => {
  const r = cylinderRows(0, 10, 40, 60, -10);
  const P = Z.buildProxy(r.y0, r.fx, r.sz, { smooth: 0 });
  const p = Z.lift(P, 'front', 46, 5);
  near(p[0], 46, 1e-9); near(p[2], -10, 1e-9);
});

test('回して写す: 正面の絵の点を 90 度回すと、横から見た楕円の上の位置に来る（輪郭が横の絵と一致する）', () => {
  const r = cylinderRows(0, 10, 40, 60, -10);
  const P = Z.buildProxy(r.y0, r.fx, r.sz, { smooth: 0 });
  // 横の輪郭は、横の絵の幅（x = -Z、-(cz + c) から -(cz - c)）。正面の絵の前の半分の点を回したとき、写した x はその中に入る
  const R = Z.rotY(-Math.PI / 2); // 右へ 90 度回る → キャラの左側が見える
  for (const u of [-39, -20, 0, 20, 39]) {
    const p = Z.lift(P, 'front', u, 5), w = Z.applyMat3(R, p);
    assert.ok(w[0] >= -50 - 1e-6 && w[0] <= 70 + 1e-6, `x ${w[0]}`);
  }
  near(Z.applyMat3(R, Z.lift(P, 'front', 0, 5))[0], -50, 1e-9, '正面の真ん中は横の輪郭の前の端');
  // 横の絵の点をそのまま横から見ると、絵と同じ位置（x = -Z）に来る
  const q = Z.lift(P, 'left', 25, 5), wq = Z.applyMat3(R, q);
  near(wq[0], -25, 1e-9, '横の絵の x');
});

test('凸包: 点の集まりを包む凸の多角形を返す（内側の点と、辺の上の点は入らない）', () => {
  const h = Array.from(Z.hull([[0, 0], [4, 0], [4, 4], [0, 4], [2, 2], [1, 3], [2, 0]]), (p) => p.join(','));
  assert.equal(h.length, 4);
  for (const c of ['0,0', '4,0', '4,4', '0,4']) assert.ok(h.includes(c), c);
});

test('立体の形: 正面と横の両方にある行に印を付ける（下地はこの行だけに塗る）', () => {
  const P = Z.buildProxy(0, [null, [-1, 1], [-1, 1]], [[-1, 1], [-1, 1], null], { smooth: 0 });
  assert.deepEqual(Array.from(P.both), [0, 1, 0]);
});

// ---- 向きと絵の混ぜ方 ----
test('絵の選び方: 近い方の絵を 1 枚だけ描く（2 枚を半透明で重ねると二重に見える）。入れ替える角度の前後 2 度は前の絵を保つ', () => {
  const v = (t, prev) => Z.viewPick(t, prev).view;
  assert.equal(v(0, null), 'front'); assert.equal(v(90, null), 'left'); assert.equal(v(-90, null), 'right');
  assert.equal(v(180, null), 'back'); assert.equal(v(-180, null), 'back');
  // 正面と横の間は 68 度で入れ替える。正面の絵の方が、回しても崩れにくいため（横の絵は、正面寄りに回すと顔がくさびの形に広がる）
  assert.equal(v(45, null), 'front'); assert.equal(v(67.9, null), 'front'); assert.equal(v(68.1, null), 'left');
  assert.equal(v(-67.9, null), 'front'); assert.equal(v(-68.1, null), 'right');
  // 息や揺れで角度が入れ替える角度の前後を行き来しても、絵が毎コマ入れ替わらない（前の絵を 2 度まで保つ）
  assert.equal(v(69.9, 'front'), 'front'); assert.equal(v(70.1, 'front'), 'left');
  assert.equal(v(66.1, 'left'), 'left'); assert.equal(v(65.9, 'left'), 'front');
  // 横と後ろの間は 135 度
  assert.equal(v(134.9, null), 'left'); assert.equal(v(135.1, null), 'back'); assert.equal(v(135, 'left'), 'left'); assert.equal(v(-135.5, 'back'), 'back');
  // 前の絵がとなりの絵でない（大きく回った）ときは、近い方
  assert.equal(v(30, 'back'), 'front');
});

test('となりの絵: 描く絵と、下に敷くとなりの絵と、描く絵の向きからのずれ（度）', () => {
  const p = (t, prev = null) => { const r = Z.viewPick(t, prev); return [r.view, r.neighbor, +r.offset.toFixed(6)]; };
  assert.deepEqual(p(30), ['front', 'left', 30]);
  assert.deepEqual(p(80), ['left', 'front', 10]);
  assert.deepEqual(p(-30), ['front', 'right', 30]);
  assert.deepEqual(p(150), ['back', 'left', 30]);
  assert.deepEqual(p(0), ['front', 'left', 0]);
  // 前の絵を保っているときは、保っている絵からのずれ
  assert.deepEqual(p(69, 'front'), ['front', 'left', 69]);
});

// ---- 骨格 ----
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
test('骨格: 絵の姿勢に戻す回転を入れると、関節は絵の位置に来て、絵を描く回転は 0 になる', () => {
  const S = Z.buildSkeleton(Z.SKEL);
  const P = Z.fk(S, Z.restLocals(S), S.bones[0].at);
  S.bones.forEach((b, i) => {
    near(dist(P.p[i], b.at), 0, 1e-6, b.name);
    const d = Z.boneDraw(S, P, i).q;
    near(Math.abs(d[3]), 1, 1e-6, b.name + ' の回転');
  });
});

test('骨格: 回転を 0 にすると T ポーズ（腕が水平）になる。腕の長さは絵のまま', () => {
  const S = Z.buildSkeleton(Z.SKEL), I = S.bones.map(() => [0, 0, 0, 1]);
  const P = Z.fk(S, I, S.bones[0].at), k = (n) => S.index[n];
  for (const [arm, low, sign] of [['leftUpperArm', 'leftLowerArm', 1], ['rightUpperArm', 'rightLowerArm', -1]]) {
    const len = dist(S.bones[k(low)].at, S.bones[k(arm)].at), e = P.p[k(low)], s = P.p[k(arm)];
    near(e[0] - s[0], sign * len, 1e-6, arm + ' の横'); near(e[1] - s[1], 0, 1e-6, arm + ' の高さ');
  }
  // 脚はまっすぐ下（絵の脚は前後に開いているが、動きはまっすぐな脚を基準に当てる）。長さは絵のまま
  const hip = P.p[k('leftUpperLeg')], knee = P.p[k('leftLowerLeg')], len = dist(S.bones[k('leftLowerLeg')].at, S.bones[k('leftUpperLeg')].at);
  near(knee[0] - hip[0], 0, 1e-6, 'ひざは脚の付け根の真下'); near(knee[2] - hip[2], 0, 1e-6); near(knee[1] - hip[1], len, 1e-6, '脚の長さ');
  // 背骨は絵の向きのまま
  near(dist(P.p[k('neck')], S.bones[k('neck')].at), 0, 1e-6);
});

test('骨格: 腰を縦の軸で 90 度回すと、体全体が回る（左の脚の付け根が、前に来る）', () => {
  const S = Z.buildSkeleton(Z.SKEL), L = Z.restLocals(S), k = (n) => S.index[n];
  L[0] = Z.qaxis([0, 1, 0], -Math.PI / 2);
  const P = Z.fk(S, L, S.bones[0].at), hip = S.bones[0].at, leg = S.bones[k('leftUpperLeg')].at;
  const before = [leg[0] - hip[0], leg[2] - hip[2]], after = [P.p[k('leftUpperLeg')][0] - hip[0], P.p[k('leftUpperLeg')][2] - hip[2]];
  near(Math.hypot(...after), Math.hypot(...before), 1e-6, '距離');
  // 回す前は左（+X）にあった付け根が、回したあとは前（+Z）に来る（rotY の決まり: +Z が +X へ回る向きの逆）
  assert.ok(after[1] > 40, `前 ${after[1]}`);
});

test('床: 立っているときは床までの差が 0。腰を上げると、その分だけ下げて床に着ける。座ると腰の下が床に着く', () => {
  const S = Z.buildSkeleton(Z.SKEL), L = Z.restLocals(S), at = S.bones[0].at;
  near(Z.groundOffset(S, Z.fk(S, L, at)), 0, 1, '立つ');
  near(Z.groundOffset(S, Z.fk(S, L, [at[0], at[1] - 40, at[2]])), 40, 1, '浮いた分を下げる');
  // 両脚を前へ 90 度上げる（床に座る）: 腰の下（半ズボンの下）が床に着く
  const K = L.map((q) => q.slice()), k = (n) => S.index[n];
  for (const n of ['leftUpperLeg', 'rightUpperLeg']) K[k(n)] = Z.qmul(Z.qaxis([1, 0, 0], -Math.PI / 2), K[k(n)]);
  const P = Z.fk(S, K, at), off = Z.groundOffset(S, P);
  near(at[1] + off + Z.HIPS_BOTTOM, Z.FLOOR_Y, 1, '腰の下が床');
});

test('動きの腰の位置: VRM 0.x（メートル、上が +Y、顔が -Z）を、絵の画素（下が +Y、前が +Z）に直す', () => {
  const S = Z.buildSkeleton(Z.SKEL), h = S.bones[0].at;
  const a = Z.hipsFromMotion([0, Z.HIPS_REST, 0], S);
  near(dist(a, h), 0, 1e-9, '休みの高さは絵の腰');
  const b = Z.hipsFromMotion([0.1, Z.HIPS_REST + 0.1, -0.2], S);
  near(b[0] - h[0], -0.1 * Z.PX_PER_M, 1e-9, 'X は逆');
  near(b[1] - h[1], -0.1 * Z.PX_PER_M, 1e-9, '上へ');
  near(b[2] - h[2], 0.2 * Z.PX_PER_M, 1e-9, '前へ');
});

test('動きの再生: 前後のコマの間をつなぎ、歩いて進んだ分（始めから終わりへのまっすぐな進み）を引いて、その場で動かす', () => {
  const frames = 5, I = [0, 0, 0, 32767];
  const rotA = Int16Array.from({ length: frames * 4 }, (_, i) => I[i % 4]);
  // 腰: z は 1 コマに 0.5 ずつ前へ進み、x は左右に揺れる、y は一定
  const hipsA = Float32Array.from([0, 0.9, 0, 0.1, 0.9, -0.5, 0, 0.9, -1, -0.1, 0.9, -1.5, 0, 0.9, -2]);
  const clip = { frames, fps: 10, rotA, hipsA };
  const a = Z.sampleClip(clip, 0), b = Z.sampleClip(clip, 0.4), c = Z.sampleClip(clip, 0.1);
  near(a.hips[2], 0, 1e-6, '始めの前後'); near(b.hips[2], 0, 1e-4, '終わりの前後（進んだ分を引く）');
  near(c.hips[0], 0.1, 1e-6, '左右の揺れは残る'); near(c.hips[1], 0.9, 1e-6, '高さはそのまま');
  near(a.rot[0][3], 1, 1e-4, '回転');
});

// ---- 表情 ----
test('まばたき: 白目の上より上（まつげ）は形を保って閉じた線まで下がり、白目の中は閉じた線へつぶれる', () => {
  // 目の幅 x 10〜30、白目の上 y 100、下 y 120 → 閉じた線は y 113（上から 65%）
  const E = Z.eyeCloser({ x0: 10, top: new Array(21).fill(100), bot: new Array(21).fill(120) });
  const top = E(20, 100 - 4), mid = E(20, 110), low = E(20, 119);
  near(top[1], 96 + 13, 1e-6, 'まつげは 13 下がる'); near(mid[1], 113, 0.5, '白目の中は閉じた線へ'); near(low[1], 113, 0.5, '下のまぶたも閉じた線へ');
  near(top[0], 20, 1e-9, '横には動かない');
  // 目の幅の外（まつげの先）は、いちばん近い端の高さで閉じる
  near(E(36, 98)[1], 98 + 13, 1e-6);
  // 瞳の左右から遠い所（目の横の髪の線）は動かない（瞳の端から 24 画素より外）
  near(E(60, 96)[1], 96, 1e-9, '目の横の線は動かない');
  // 塗り（線でないもの）は、まつげより上を動かさない（まつげの上の肌の白い塗りが下がって、横の髪を隠さないように）
  near(E(20, 96, false)[1], 96, 1e-9, 'まつげの上の塗りは動かない'); near(E(20, 110, false)[1], 113, 0.5, '瞳の中の塗りはつぶれる');
  // まつげより上（前髪のふちなど）は動かない。その間はなめらかに下げる量を減らす
  near(E(20, 80)[1], 80, 1e-9, '上の線は動かない');
  near(E(20, 91)[1], 91 + 13, 1e-9, '二重の線（瞳の上から 10 画素まで）は丸ごと下がる');
  const mid2 = E(20, 86)[1] - 86; assert.ok(mid2 > 0 && mid2 < 13, `間 ${mid2}`);
});

test('口の形: 開き 0 では点の幅がなく、開くほど縦に広がる。幅の指定で横に広がる', () => {
  const h = (pts) => Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
  const w = (pts) => Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const a = Z.mouthShape(0, 0.5), b = Z.mouthShape(0.5, 0.5), c = Z.mouthShape(1, 0.5), d = Z.mouthShape(1, 1);
  near(h(a), 0, 1e-6); assert.ok(h(b) > 0 && h(c) > h(b)); assert.ok(w(d) > w(c));
});

test('話す: かなを母音の並びにし、母音ごとの口の開きと幅にする（「ん」と記号は閉じる）', () => {
  const v = Array.from(Z.vowels('ずんだもんなのだ！'));
  assert.deepEqual(v, ['u', 'n', 'a', 'o', 'n', 'a', 'o', 'a', 'n']);
  const o = Z.VOWEL_SHAPE;
  assert.ok(o.a[0] > o.i[0] && o.i[1] > o.u[1] && o.n[0] === 0);
});

// ---- 髪の束 ----
test('髪の束: 根元は付け根に付いたまま、ほかの点は休みの形へ戻り、区間の長さは保つ', () => {
  const rest = [[0, 0, 0], [0, 10, 0], [0, 20, 0], [0, 30, 0]];
  const T = Z.tailInit(rest);
  // 根元を横へ 5 動かして、しばらく進める
  const targets = rest.map((p) => [p[0] + 5, p[1], p[2]]);
  for (let i = 0; i < 400; i++) Z.tailStep(T, targets, 1 / 60, { grav: 0 });
  near(T.p[0][0], 5, 1e-9, '根元');
  for (let i = 1; i < 4; i++) { near(T.p[i][0], 5, 0.05, `点 ${i} の横`); near(T.p[i][1], rest[i][1], 0.05, `点 ${i} の高さ`); }
  for (let i = 1; i < 4; i++) near(Math.hypot(T.p[i][0] - T.p[i - 1][0], T.p[i][1] - T.p[i - 1][1], T.p[i][2] - T.p[i - 1][2]), 10, 1e-6, `区間 ${i} の長さ`);
});

test('髪の束: 根元を急に動かすと、先は遅れてついて来る（揺れる）', () => {
  const rest = [[0, 0, 0], [0, 10, 0], [0, 20, 0], [0, 30, 0]];
  const T = Z.tailInit(rest), targets = rest.map((p) => [p[0] + 8, p[1], p[2]]);
  Z.tailStep(T, targets, 1 / 60, { grav: 0 });
  assert.ok(T.p[3][0] < 4, `先はまだ動いていない ${T.p[3][0]}`);
});

// ---- 手足の板 ----
test('手足の板: 休みの骨の向きの絵を、画面に写した骨の向きに合わせて曲げる。幅は保ち、長さは写した長さに縮む', () => {
  const f = Z.cardMap([0, 0], [0, 100], [10, 10], [10, 60], 2);
  const a = f(0, 0), b = f(0, 100), c = f(5, 50);
  near(a[0], 10, 1e-9); near(a[1], 10, 1e-9); near(b[0], 10, 1e-9); near(b[1], 60, 1e-9);
  near(c[1], 35, 1e-9, '長さの半分'); near(Math.abs(c[0] - 10), 10, 1e-9, '幅は 2 倍（画面の縮尺）のまま');
  // 横へ向けても、幅の側は変わらない（骨の右側の点は、骨の右側に来る）
  const g = Z.cardMap([0, 0], [0, 100], [0, 0], [100, 0], 1), d = g(5, 50);
  near(d[0], 50, 1e-9); near(Math.abs(d[1]), 5, 1e-9);
  // 縮尺を負にすると、幅の向きだけが左右逆になる（後ろから見た手足）
  const m = Z.cardMap([0, 0], [0, 100], [10, 10], [10, 60], -2), e2 = m(5, 50), e1 = f(5, 50);
  near(e2[1], e1[1], 1e-9, '長さの向きは同じ'); near(e2[0] - 10, -(e1[0] - 10), 1e-9, '幅の向きは逆');
});

test('手足の幅: 正面から見ると正面の幅、真横から見ると横の幅の割合、その間は楕円の断面の見かけの幅', () => {
  near(Z.widthAt(1, 0.6), 1, 1e-9); near(Z.widthAt(0, 0.6), 0.6, 1e-9);
  near(Z.widthAt(Math.SQRT1_2, 0.6), Math.sqrt(0.5 + 0.36 * 0.5), 1e-9);
  assert.ok(Z.SIDE_W.leftUpperLeg < 1 && !Z.SIDE_W.leftUpperArm, '脚は薄く、腕は筒');
});

test('手足の重み: 関節から遠い所は 1 本の骨だけ、関節の上は 2 本を半分ずつ', () => {
  near(Z.jointBlend(-30, 12), 0, 1e-9); near(Z.jointBlend(0, 12), 0.5, 1e-9); near(Z.jointBlend(30, 12), 1, 1e-9);
  assert.ok(Z.jointBlend(6, 12) > 0.5 && Z.jointBlend(6, 12) < 1);
});

test('向き: 頭から見た見る人の向きから、正面 0・左 90・後ろ 180・右 -90 の角度を出す', () => {
  near(Z.viewAngle(Z.rotY(0)), 0, 1e-9);
  near(Z.viewAngle(Z.rotY(-Math.PI / 2)), 90, 1e-9);  // キャラが右を向く → 左側が見える
  near(Z.viewAngle(Z.rotY(Math.PI / 2)), -90, 1e-9);
  near(Math.abs(Z.viewAngle(Z.rotY(Math.PI))), 180, 1e-9);
});

test('頭の前後の傾き: 頭の上の向きが画面から前後へ傾く角度だけを上限で抑え、画面の中の向きと、横から見た傾き（画面の中の回転）は変えない', () => {
  const up = (M) => [-M[1], -M[4], -M[7]], tiltOf = (M) => { const u = up(M); return Math.atan2(u[2], Math.hypot(u[0], u[1])); };
  // 上限より小さい傾きは、そのまま
  const small = Z.rotX(0.2), a = Z.limitTilt(small, 0.45);
  for (let i = 0; i < 9; i++) near(a[i], small[i], 1e-9, `小さい傾き ${i}`);
  // 正面から見た深いお辞儀（見る人の方へ 1 ラジアン傾く）は、0.45 ラジアンまで戻す。画面の中の上の向き（真上）は保つ
  const deep = Z.mul3(Z.rotY(0.3), Z.rotX(1.0)), b = Z.limitTilt(deep, 0.45);
  near(Math.abs(tiltOf(b)), 0.45, 1e-6, '抑えた傾き');
  const u0 = up(deep), u1 = up(b);
  near(Math.atan2(u1[0], -u1[1]), Math.atan2(u0[0], -u0[1]), 1e-6, '画面の中の向き');
  // 回転のまま（列が直交して長さ 1）
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const d = b[i] * b[j] + b[3 + i] * b[3 + j] + b[6 + i] * b[6 + j];
    near(d, i === j ? 1 : 0, 1e-9, `直交 ${i}${j}`);
  }
  // 真横から見たお辞儀は、画面の中の回転なので変えない
  const side = Z.mul3(Z.rotY(-Math.PI / 2), Z.rotX(1.0)), c = Z.limitTilt(side, 0.45);
  for (let i = 0; i < 9; i++) near(c[i], side[i], 1e-9, `横 ${i}`);
});
