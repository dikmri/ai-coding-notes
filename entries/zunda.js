/* 図鑑の項目「コードで描いたずんだもんを立体的に動かす」。
 * 絵は、東北ずん子・ずんだもんプロジェクトの公式イラスト「202012_ずんだもん三面」の正面・横・後ろを、
 * 曲線のデータ（data/zunda-front.js・data/zunda-side.js・data/zunda-back.js）に写したもの。設計は MyWiki の zundamon-25d.md。 */
dekiru.add({
  id: '3d-zunda-move', c: '3d', lv: 3,
  t: 'コードで描いたずんだもんを立体的に動かす', y: 'こーどでかいたずんだもんをりったいてきにうごかす',
  tags: ['2.5D', 'ベクター', 'モーションキャプチャー', 'Canvas', 'キャラクター'],
  data: ['data/zunda-front.js', 'data/zunda-side.js', 'data/zunda-back.js', 'data/motion-bn1.js'], nt: true,
  d: '公式の三面図（正面・横・後ろ）を曲線で写したずんだもんを、頭と体の立体の形に貼り、人の動きの記録（モーションキャプチャー）で動かす。',
  p: '正面の幅と横の奥行きから、高さごとに楕円の断面を作ると、頭や胴のおおまかな立体の形になる。3 方向の絵をその形に貼り、見る向きに近い絵を描く。手足は、画面に写した骨に沿って正面の絵を曲げる。',
  html: `<canvas id="c" role="img" aria-label="緑の髪に枝豆の飾りを付けた女の子（ずんだもん）が、お辞儀や手を振るなどの動きを、向きを変えながら演じる"></canvas>
<div class="bar" id="bar" role="group" aria-label="動き"></div>
<button class="pause" id="pause" type="button">止める</button>
<p class="say" id="say" aria-live="polite" hidden></p>
<p class="hint">ドラッグか ← → で、見る向きを回す（ダブルクリックで正面）</p>
<p class="credit">絵: 東北ずん子・ずんだもんプロジェクトの公式イラスト（キャラクターデザイン 江戸村ににこ）・動き: Bandai Namco Research Motiondataset（CC BY-NC 4.0）</p>`,
  css: `body { background: #f4f1ea; overflow: hidden; }
canvas { display: block; width: 100vw; height: 100vh; touch-action: none; }
.bar { position: fixed; top: 8px; left: 8px; right: 90px; display: flex; flex-wrap: wrap; gap: 4px; }
.bar button, .pause { font-size: 13px; padding: 2px 10px; border-radius: 4px; border: 1px solid #0003; background: #fffc; color: #222; }
.bar button[aria-pressed="true"] { background: #6d9a23; color: #fff; }
.pause { position: fixed; top: 8px; right: 8px; }
button:focus-visible { outline: 2px solid #234; outline-offset: 2px; }
.hint, .credit { position: fixed; left: 8px; margin: 0; color: #333; background: #fff9; padding: 1px 6px; border-radius: 4px; }
.hint { bottom: 28px; font-size: 12px; }
.credit { bottom: 6px; font-size: 10px; }
.say { position: fixed; max-width: 200px; margin: 0; padding: 6px 10px; font-size: 14px; color: #222; background: #fff; border: 2px solid #6d9a23; border-radius: 12px; }
[hidden] { display: none !important; }`,
  core() {
    // ---- 曲線のデータ ----
    // SVG の path（M と、相対の c・l、z）を、絶対座標の 3 次ベジェの並びにする。直線もベジェにする（あとで曲げても形が保てるように）。
    // 戻りは閉じた線ごとの Float32Array: [始点 x, y, 制御点1 x, y, 制御点2 x, y, 終点 x, y, …]（区間ごとに 6 個）
    function parsePath(d, origin = [0, 0]) {
      const tk = d.match(/[MmCcLlZz]|-?(?:\d+\.?\d*|\.\d+)/g) || [], subs = [], [ox, oy] = origin;
      let cur = null, cmd = '', x = 0, y = 0, sx = 0, sy = 0, i = 0;
      const n = () => parseFloat(tk[i++]);
      const seg = (ax, ay, bx, by, X, Y) => { cur.push(ax + ox, ay + oy, bx + ox, by + oy, X + ox, Y + oy); x = X; y = Y; };
      const line = (X, Y) => seg(x + (X - x) / 3, y + (Y - y) / 3, x + (X - x) * 2 / 3, y + (Y - y) * 2 / 3, X, Y);
      const close = () => { if (!cur) return; if (Math.abs(x - sx) > 1e-9 || Math.abs(y - sy) > 1e-9) line(sx, sy); subs.push(Float32Array.from(cur)); cur = null; };
      while (i < tk.length) {
        const t = tk[i];
        if (/[A-Za-z]/.test(t)) { i++; cmd = t; if (cmd === 'z' || cmd === 'Z') close(); continue; }
        if (cmd === 'M' || cmd === 'm') {
          close();
          const X = n() + (cmd === 'm' ? x : 0), Y = n() + (cmd === 'm' ? y : 0);
          x = sx = X; y = sy = Y; cur = [X + ox, Y + oy]; cmd = cmd === 'm' ? 'l' : 'L';
        } else if (cmd === 'l') line(x + n(), y + n());
        else if (cmd === 'L') line(n(), n());
        else if (cmd === 'c') { const a = n(), b = n(), c = n(), e = n(), f = n(), g = n(); seg(x + a, y + b, x + c, y + e, x + f, y + g); }
        else if (cmd === 'C') { const a = n(), b = n(), c = n(), e = n(), f = n(), g = n(); seg(a, b, c, e, f, g); }
        else i++;
      }
      close();
      return subs;
    }
    // 長い区間を半分ずつに分ける（制御点の折れ線の長さが maxLen 以下になるまで）。曲げる計算を点ごとにするので、区間が短いほど形が正しく曲がる
    function subdivide(s, maxLen) {
      const out = [s[0], s[1]];
      const rec = (x0, y0, x1, y1, x2, y2, x3, y3, depth) => {
        const L = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
        if (L <= maxLen || depth > 12) { out.push(x1, y1, x2, y2, x3, y3); return; }
        const ax = (x0 + x1) / 2, ay = (y0 + y1) / 2, bx = (x1 + x2) / 2, by = (y1 + y2) / 2, cx = (x2 + x3) / 2, cy = (y2 + y3) / 2;
        const dx = (ax + bx) / 2, dy = (ay + by) / 2, ex = (bx + cx) / 2, ey = (by + cy) / 2, mx = (dx + ex) / 2, my = (dy + ey) / 2;
        rec(x0, y0, ax, ay, dx, dy, mx, my, depth + 1); rec(mx, my, ex, ey, cx, cy, x3, y3, depth + 1);
      };
      for (let i = 2; i + 6 <= s.length; i += 6) rec(s[i - 2], s[i - 1], s[i], s[i + 1], s[i + 2], s[i + 3], s[i + 4], s[i + 5], 0);
      return Float32Array.from(out);
    }

    // ---- 立体の形（高さごとの楕円の断面）----
    // 行（画素の高さ）ごとに、正面の絵の左右の端 fx = [左, 右]（キャラの中心からの X。+ がキャラの左）と、
    // 横の絵の前後の端 sz = [後ろ, 前]（Z。+ が前）から、楕円の中心 (cx, cz) と半径 (a, c) を作る。
    // 片方の向きにしかない行は、両方そろったいちばん近い行の値を使う。smooth（行）で上下になめらかにする
    function buildProxy(y0, fx, sz, { smooth = 2 } = {}) {
      const n = Math.max(fx.length, sz.length), both = [];
      for (let i = 0; i < n; i++) if (fx[i] && sz[i]) both.push(i);
      if (!both.length) throw new Error('正面と横の両方にある行がない');
      // both: 正面と横の両方にある行（下地を塗るのはこの行だけ）
      const P = { y0, n, cx: new Float32Array(n), a: new Float32Array(n), cz: new Float32Array(n), c: new Float32Array(n), both: new Uint8Array(n) };
      for (const i of both) P.both[i] = 1;
      let j = 0;
      for (let i = 0; i < n; i++) {
        while (j + 1 < both.length && Math.abs(both[j + 1] - i) <= Math.abs(both[j] - i)) j++;
        const src = fx[i] && sz[i] ? i : both[j], f = fx[src], s = sz[src];
        P.cx[i] = (f[0] + f[1]) / 2; P.a[i] = (f[1] - f[0]) / 2; P.cz[i] = (s[0] + s[1]) / 2; P.c[i] = (s[1] - s[0]) / 2;
      }
      if (smooth > 0) for (const k of ['cx', 'a', 'cz', 'c']) {
        const src = P[k], out = new Float32Array(n), r = Math.ceil(smooth * 3);
        for (let i = 0; i < n; i++) {
          let s = 0, w = 0;
          for (let d = -r; d <= r; d++) { const q = i + d; if (q < 0 || q >= n) continue; const g = Math.exp(-(d * d) / (2 * smooth * smooth)); s += src[q] * g; w += g; }
          out[i] = s / w;
        }
        P[k] = out;
      }
      return P;
    }
    // 絵の点を立体の形の上の 3D の点にする。view は絵の向き（front・left・back・right）。
    // u は絵の横の位置: 正面と後ろは X（+ がキャラの左）、横（left・right）は Z（+ が前）。y は高さ（画素、下が +）。
    // 戻りは [X, Y, Z, 法線 x, y, z]。楕円より外の点（髪の先など）は、楕円の端から外へ出たまま置く。
    // spread（1 以上）: 絵を貼るときだけ、絵の横の向きの半径を spread 倍に見る。絵のふちの点が楕円の真横まで回り込まないので、
    // 回したときにふちの細い帯（輪郭の線）が何倍にも引き伸ばされない。その向きから見た位置は spread によらず元の絵と同じ
    function lift(P, view, u, y, spread = 1) {
      const r = Math.max(0, Math.min(P.n - 1, Math.round(y - P.y0)));
      const cx = P.cx[r], a = Math.max(P.a[r], 1e-3), cz = P.cz[r], c = Math.max(P.c[r], 1e-3);
      let X, Z;
      if (view === 'front' || view === 'back') {
        const s = (u - cx) / (a * spread), sc = Math.max(-1, Math.min(1, s)), co = Math.sqrt(1 - sc * sc);
        X = u; Z = view === 'front' ? cz + c * co : cz - c * co;
      } else {
        const s = (u - cz) / (c * spread), sc = Math.max(-1, Math.min(1, s)), si = Math.sqrt(1 - sc * sc);
        Z = u; X = view === 'left' ? cx + a * si : cx - a * si;
      }
      // 法線: 貼った楕円（spread で広げた方）の上の点の法線（外の点は、楕円の端の点の法線）
      const A = view === 'front' || view === 'back' ? a * spread : a, C = view === 'front' || view === 'back' ? c : c * spread;
      const ex = Math.max(-A, Math.min(A, X - cx)), ez = Math.max(-C, Math.min(C, Z - cz));
      let nx = ex / (A * A), nz = ez / (C * C); const L = Math.hypot(nx, nz) || 1; nx /= L; nz /= L;
      return [X, y, Z, nx, 0, nz];
    }

    // ---- 回転（3×3 の行列、行の順。Y は下が +、Z は見る人の側が +）----
    const rotX = (t) => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; };
    const rotY = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
    const rotZ = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
    const mul3 = (A, B) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; };
    const applyMat3 = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
    // 体の部分の回転 R のとき、その部分から見た見る人の向き（R⁻¹ × (0, 0, 1)）の水平の角度（度）。正面 0・左の横 90・後ろ 180・右の横 -90
    const viewAngle = (R) => Math.atan2(R[6], R[8]) * 180 / Math.PI;
    // 角度（度）から、描く絵とその濃さを決める。正面・左・後ろ・右の 4 枚のうち近い 2 枚を、間の 3 割〜7 割の所で入れ替える。
    // 戻りは描く順（先に描く絵は濃さ 1、あとから重ねる手前の絵は 0.5〜1）
    // 入れ替える所（4 分の 1 周の中の割合）: 正面と横の間は横寄り（正面の絵の方が、回しても崩れにくい）、横と後ろの間は真ん中。
    // band はなめらかに入れ替える幅（割合）
    const VIEWS = ['front', 'left', 'back', 'right'];
    const SWITCH = [0.7, 0.5, 0.5, 0.3], BAND = 0.05;
    function viewBlend(theta) {
      const a = ((theta % 360) + 360) % 360, k = Math.floor(a / 90 + 1e-9), t = a / 90 - k;
      const v0 = VIEWS[k % 4], v1 = VIEWS[(k + 1) % 4], m = SWITCH[k % 4];
      const x = Math.max(0, Math.min(1, (t - m + BAND / 2) / BAND)), s = x * x * (3 - 2 * x);
      if (s <= 1e-6) return [{ view: v0, alpha: 1 }];
      if (s >= 1 - 1e-6) return [{ view: v1, alpha: 1 }];
      return s < 0.5 ? [{ view: v1, alpha: 1 }, { view: v0, alpha: 1 - s }] : [{ view: v0, alpha: 1 }, { view: v1, alpha: s }];
    }

    // ---- 骨格と部分（元の絵の座標）----
    // 体の中心の線: 正面の絵の x、横の絵の x（ここが Z = 0）、後ろの絵の x
    const AXIS = { front: 923.5, side: 235, back: 1566.5 };
    // 部分: 骨の付け根（正面の絵の x, y と、横の絵の x）と、まとまり。まとまりごとに、3 方向の絵のどの部品かと、
    // 下地の色（立体の形そのものを、絵の下に塗る色）を決める。まとまりごとに立体の形を作る（顔は髪より幅が狭く、前に出ている）。
    // shareFront: 正面と後ろの絵は、このまとまりの形ではなく、名前のまとまりの形に貼る（顔と前髪を同じ形に貼ると、回してもずれず、
    // 元の絵で前髪に隠れて写していない額が見えない）。横の絵の顔は、顔の形に貼る（髪の形に貼ると、顔が横に広がる）
    // bone: 付ける骨。ref: 3 方向の絵での付け根（正面の x, y、横の x、後ろの x）。部分の絵は ref からの位置で持ち上げ、骨の付け根に付ける。
    // bias: 重なり順の差（見る人からの近さに足す）。右の靴の横の絵は、左の靴（手前の靴）の絵を使う
    const one = (name, base, parts) => [{ name, base, parts }];
    const REGIONS = [
      { name: 'head', bone: 'head', ref: { front: [923.5, 325], side: 233, back: 1566.5 }, bias: 200, groups: [
        { name: 'hair', base: 'green', parts: { front: ['hair_back', 'hair_side_r', 'hair_side_l', 'hair_front'], side: ['hair'], back: ['hair'] },
          shape: { front: ['hair_back', 'hair_side_r', 'hair_side_l', 'hair_front', 'face'], side: ['hair', 'face'] } },
        // 顔にも白い下地を塗る（元の絵の顔の塗りは、目と口の所が穴になっている。まばたきや口を開くと、そこが見える）
        { name: 'face', base: 'white', parts: { front: ['face', 'eye_r', 'eye_l', 'mouth'], side: ['face', 'eye_l'], back: [] }, shareFront: 'hair', facing: -0.4 },
      ] },
      { name: 'neck', bone: 'neck', ref: { front: [923.5, 345], side: 233, back: 1566.5 }, bias: -20, groups: one('neck', 'white', { front: ['neck'], side: ['neck'], back: ['neck'] }) },
      // 胴の形には、横の絵の袖も含める（横の絵では胴の後ろ半分が袖に隠れていて、含めないと奥行きが浅くなり、斜めから見ると肩まで届かない）
      { name: 'torso', bone: 'chest', ref: { front: [923.5, 455], side: 200, back: 1566.5 }, bias: 0, groups: [{ name: 'torso', base: 'white',
        parts: { front: ['shirt', 'bib', 'ribbon'], side: ['shirt', 'bib', 'ribbon'], back: ['shirt', 'bib', 'ribbon'] }, shape: { front: ['shirt', 'bib', 'ribbon'], side: ['shirt', 'bib', 'ribbon', 'sleeve_l'] }, baseShape: true }] },
      { name: 'shorts', bone: 'hips', ref: { front: [923.5, 610], side: 220, back: 1566.5 }, bias: 0, groups: one('shorts', 'dark', { front: ['shorts'], side: ['shorts'], back: ['shorts'] }) },
      { name: 'bootL', bone: 'leftFoot', ref: { front: [990, 1150], side: 281, back: 1482 }, bias: 10, groups: one('boot', 'dark', { front: ['boot_l'], side: ['boot_l'], back: ['boot_l'] }) },
      { name: 'bootR', bone: 'rightFoot', ref: { front: [858, 1150], side: 281, back: 1650 }, bias: 10, groups: one('boot', 'dark', { front: ['boot_r'], side: ['boot_l'], back: ['boot_r'] }) },
    ];
    // 手足の板（正面の絵を骨に沿って曲げる）。parent・child: 関節のまわりで重みを混ぜる骨
    const CARDS = [
      { part: 'upper_arm_l', bone: 'leftUpperArm', child: 'leftLowerArm', bias: 75 }, { part: 'forearm_l', bone: 'leftLowerArm', parent: 'leftUpperArm', child: 'leftHand', bias: 80 },
      { part: 'hand_l', bone: 'leftHand', parent: 'leftLowerArm', bias: 85 },
      { part: 'upper_arm_r', bone: 'rightUpperArm', child: 'rightLowerArm', bias: 75 }, { part: 'forearm_r', bone: 'rightLowerArm', parent: 'rightUpperArm', child: 'rightHand', bias: 80 },
      { part: 'hand_r', bone: 'rightHand', parent: 'rightLowerArm', bias: 85 },
      { part: 'thigh_l', bone: 'leftUpperLeg', child: 'leftLowerLeg', bias: -50 }, { part: 'shin_l', bone: 'leftLowerLeg', parent: 'leftUpperLeg', bias: -30 },
      { part: 'thigh_r', bone: 'rightUpperLeg', child: 'rightLowerLeg', bias: -50 }, { part: 'shin_r', bone: 'rightLowerLeg', parent: 'rightUpperLeg', bias: -30 },
    ];
    // 袖: ふくらみの形を保ったまま、腕の付け根を中心に腕の向きへ回す
    const SLEEVES = [{ part: 'sleeve_l', bone: 'leftUpperArm', bias: 90 }, { part: 'sleeve_r', bone: 'rightUpperArm', bias: 90 }];

    // ---- 四元数 [x, y, z, w] ----
    const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
    const qaxis = (ax, ang) => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };
    function qrot(q, v) {
      const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
      return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
    }
    const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    // a の向きを b の向きへ、いちばん小さく回す回転
    function qfromTo(a, b) {
      a = norm3(a); b = norm3(b);
      const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      if (d < -0.999999) return [0, 0, 1, 0];
      const q = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + d], l = Math.hypot(...q);
      return q.map((v) => v / l);
    }
    // 2 つの回転の間を、球面の上でなめらかにつなぐ
    function qslerp(a, b, t) {
      let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
      if (d < 0) { b = b.map((v) => -v); d = -d; }
      if (d > 0.9995) { const q = a.map((v, i) => v + (b[i] - v) * t), l = Math.hypot(...q); return q.map((v) => v / l); }
      const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
      return a.map((v, i) => v * wa + b[i] * wb);
    }
    // 回転を 3×3 の行列（行の順）にする
    function qmat(q) {
      const [x, y, z, w] = q;
      return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
    }

    // ---- 骨格 ----
    // 骨は、動きのデータ（data/motion-bn1.js）と同じ名前と親子。at は A ポーズ（元の絵）での付け根の位置:
    // X は正面の絵の中心の線（AXIS.front）から（+ がキャラの左）、Y は絵の y（下が +）、Z は横の絵の AXIS.side から（+ が前）。
    // 先の骨がない骨は、4 つ目に先の位置を書く。腕は絵が A ポーズ（水平から約 59 度下げる）
    const SKEL = [
      ['hips', null, [0, 610, 15]], ['spine', 'hips', [0, 545, 20]], ['chest', 'spine', [0, 455, 35]],
      ['neck', 'chest', [0, 345, 3]], ['head', 'neck', [0, 325, 2], [0, 150, 0]],
      ['leftShoulder', 'chest', [20, 372, -10]], ['leftUpperArm', 'leftShoulder', [74.5, 400, -25]],
      ['leftLowerArm', 'leftUpperArm', [144.5, 515, -25]], ['leftHand', 'leftLowerArm', [216.5, 637, -25], [311, 700, -25]],
      ['rightShoulder', 'chest', [-20, 372, -10]], ['rightUpperArm', 'rightShoulder', [-74.5, 400, -25]],
      ['rightLowerArm', 'rightUpperArm', [-145.5, 515, -25]], ['rightHand', 'rightLowerArm', [-217.5, 637, -25], [-311, 700, -25]],
      ['leftUpperLeg', 'hips', [55.5, 640, 15]], ['leftLowerLeg', 'leftUpperLeg', [59.5, 930, 6]],
      ['leftFoot', 'leftLowerLeg', [66.5, 1150, -3]], ['leftToes', 'leftFoot', [66.5, 1262, 50], [66.5, 1272, 80]],
      ['rightUpperLeg', 'hips', [-55.5, 640, 15]], ['rightLowerLeg', 'rightUpperLeg', [-57.5, 930, 6]],
      ['rightFoot', 'rightLowerLeg', [-65.5, 1150, -3]], ['rightToes', 'rightFoot', [-65.5, 1262, 50], [-65.5, 1272, 80]],
    ];
    // T ポーズ（動きの回転が 0 のとき）の腕の向き。ほかの骨は絵の向きのまま
    const TDIR = { leftUpperArm: [1, 0, 0], leftLowerArm: [1, 0, 0], leftHand: [1, 0, 0], rightUpperArm: [-1, 0, 0], rightLowerArm: [-1, 0, 0], rightHand: [-1, 0, 0] };
    // 骨格を組む: ra は T ポーズから絵の向きへの回転（世界の向きで）、t は親の付け根からの位置を T ポーズで見たもの
    function buildSkeleton(list) {
      const bones = list.map(([name, parent, at, tip]) => ({ name, parent, at, tip })), index = {};
      bones.forEach((b, i) => { index[b.name] = i; });
      for (const b of bones) {
        b.pi = b.parent == null ? -1 : index[b.parent];
        const child = bones.find((c) => c.parent === b.name);
        const end = b.tip || (child ? child.at : null);
        b.dir = end ? norm3([end[0] - b.at[0], end[1] - b.at[1], end[2] - b.at[2]]) : [0, -1, 0];
        b.len = end ? Math.hypot(end[0] - b.at[0], end[1] - b.at[1], end[2] - b.at[2]) : 0;
        b.ra = TDIR[b.name] ? qfromTo(TDIR[b.name], b.dir) : [0, 0, 0, 1];
      }
      for (const b of bones) {
        const p = bones[b.pi], off = p ? [b.at[0] - p.at[0], b.at[1] - p.at[1], b.at[2] - p.at[2]] : b.at;
        b.t = p ? qrot(qconj(p.ra), off) : off;
      }
      return { bones, index };
    }
    // 絵の姿勢になる局所の回転（親の ra の逆 × 自分の ra）
    const restLocals = (S) => S.bones.map((b) => (b.pi < 0 ? b.ra : qmul(qconj(S.bones[b.pi].ra), b.ra)));
    // 順運動学: 局所の回転と腰の位置から、骨ごとの世界の回転 q と付け根の位置 p
    function fk(S, local, hips) {
      const q = [], p = [];
      S.bones.forEach((b, i) => {
        if (b.pi < 0) { q[i] = local[i]; p[i] = hips.slice(); return; }
        q[i] = qmul(q[b.pi], local[i]);
        const d = qrot(q[b.pi], b.t), pp = p[b.pi]; p[i] = [pp[0] + d[0], pp[1] + d[1], pp[2] + d[2]];
      });
      return { q, p };
    }
    // 骨に付けた絵の点を動かす回転（世界の回転 × ra の逆）と位置。絵の点 v は p + q × (v - at)
    const boneDraw = (S, P, i) => ({ q: qmul(P.q[i], qconj(S.bones[i].ra)), p: P.p[i], at: S.bones[i].at });
    // 動きのデータの腰の位置（VRM 0.x のメートル）を、この骨格の座標へ。3 つの軸がすべて逆（回転の行列は同じまま使える）
    const HIPS_REST = 0.875, PX_PER_M = 766;
    const hipsFromMotion = (h, S) => { const a = S.bones[0].at; return [a[0] - h[0] * PX_PER_M, a[1] - (h[1] - HIPS_REST) * PX_PER_M, a[2] - h[2] * PX_PER_M]; };

    // 床: 体のいちばん低い所（靴の裏・つま先・ひざ・腰の下）が床（元の絵の靴の裏の高さ）に着くように、体全体を上下させる量。
    // 動きは VRoid の体の比率で記録されていて、脚の長さの比率が違うと、そのままでは足が浮いたり沈んだりする
    const FLOOR_Y = 1280, KNEE_R = 45, HIPS_BOTTOM = 190;
    function groundOffset(S, P) {
      const B = S.index, at = (n) => S.bones[B[n]].at;
      let low = -Infinity;
      for (const side of ['left', 'right']) {
        const f = B[side + 'Foot'], t = B[side + 'Toes'], df = boneDraw(S, P, f), dt = boneDraw(S, P, t), tip = S.bones[t].tip, ta = at(side + 'Toes');
        const sole = qrot(df.q, [0, FLOOR_Y - at(side + 'Foot')[1], 8]), toe = qrot(dt.q, [tip[0] - ta[0], tip[1] - ta[1], tip[2] - ta[2]]);
        low = Math.max(low, P.p[f][1] + sole[1], P.p[t][1] + toe[1], P.p[B[side + 'LowerLeg']][1] + KNEE_R);
      }
      low = Math.max(low, P.p[0][1] + HIPS_BOTTOM);
      return FLOOR_Y - low;
    }

    // ---- 手足の板 ----
    // 休みの骨（A→B、元の絵の 2D）の向きの絵を、画面に写した骨（A2→B2）に合わせて曲げる関数。骨の長さの向きは写した長さに縮め、
    // 幅の向きは画面の縮尺 S のまま（手足を真正面から見た絵の幅を保つ。腕がこちらを向いても細くならない）
    function cardMap(A, B, A2, B2, S) {
      const ex = B[0] - A[0], ey = B[1] - A[1], L = Math.hypot(ex, ey) || 1, ux = ex / L, uy = ey / L;
      const fx = B2[0] - A2[0], fy = B2[1] - A2[1], L2 = Math.hypot(fx, fy);
      const vx = L2 > 1e-6 ? fx / L2 : ux, vy = L2 > 1e-6 ? fy / L2 : uy;
      return (x, y) => {
        const dx = x - A[0], dy = y - A[1], u = (dx * ux + dy * uy) / L, w = -dx * uy + dy * ux;
        return [A2[0] + fx * u - vy * w * S, A2[1] + fy * u + vx * w * S];
      };
    }
    // 関節のまわりで、2 本の骨の重みをなめらかに入れ替える。d は関節を越えた距離（骨の向きに沿って）、r は入れ替える幅の半分。
    // 戻りは先の骨の重み（関節の手前の遠い所で 0、関節の上で 0.5、越えた遠い所で 1）
    const jointBlend = (d, r) => { const x = Math.max(0, Math.min(1, (d + r) / (2 * r))); return x * x * (3 - 2 * x); };

    // 点の集まりを包む凸の多角形（Andrew の方法）。左回りで返す
    function hull(pts) {
      const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (p.length < 3) return p;
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], hi = [];
      for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
      for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
      return lo.slice(0, -1).concat(hi.slice(0, -1));
    }

    // ---- 表情 ----
    // まばたき: 目の部品の点を「閉じた位置」へ動かす関数を作る。prof は列ごとの瞳の上 top と下 bot（x0 の列から）。
    // 閉じた線は瞳の上から 65% の所。瞳の上より上（まつげ）は形を保ったまま閉じた線まで下げ、瞳の中と下のまぶたは閉じた線へつぶす。
    // 閉じた目は、まつげの線 1 本になる。まつげと二重の線（瞳の上から 10 画素まで）は丸ごと下げ、18 画素より上は動かさず、その間で下げる量をなめらかに減らす
    function eyeCloser(prof) {
      const n = prof.top.length;
      return (x, y) => {
        const i = Math.max(0, Math.min(n - 1, Math.round(x - prof.x0))), t = prof.top[i], b = prof.bot[i], yc = t + 0.65 * (b - t);
        if (y >= t + 1) return [x, yc + (y - yc) * 0.04];
        const u = Math.max(0, Math.min(1, (y - (t - 18)) / 8)), w = u * u * (3 - 2 * u);
        return [x, y + (yc - t) * w];
      };
    }
    // 開いた口の形（口の真ん中からの位置、元の絵の画素）。open は開き（0〜1）、width は横の広がり（0〜1）。
    // 上の辺はわずかに下がる曲線、下は半分の楕円
    function mouthShape(open, width) {
      const w = 7 + 9 * width, h = 15 * open, out = [];
      for (let k = 0; k <= 8; k++) out.push([-w + 2 * w * k / 8, 0.12 * h * Math.sin(Math.PI * k / 8)]);
      for (let k = 1; k < 16; k++) { const t = Math.PI * k / 16; out.push([w * Math.cos(t), h * Math.sin(t)]); }
      return out;
    }
    // 話す: かなを母音の並びにする。小さい「ゃゅょぁぃぅぇぉ」は前の母音を置き換え、「ー」は前の母音をくり返す。
    // 「ん」「っ」と記号と空白は口を閉じる（n）。かなでない文字（漢字など）は a にする
    const KANA = { a: 'あかさたなはまやらわがざだばぱ', i: 'いきしちにひみりぎじぢびぴ', u: 'うくすつぬふむゆるぐずづぶぷゔ', e: 'えけせてねへめれげぜでべぺ', o: 'おこそとのほもよろをごぞどぼぽ' };
    const SMALL = { 'ぁ': 'a', 'ゃ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ゅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ょ': 'o' };
    const VOWEL_OF = {}; for (const [v, s] of Object.entries(KANA)) for (const ch of s) VOWEL_OF[ch] = v;
    function vowels(text) {
      const out = [];
      for (let ch of text) {
        const c = ch.charCodeAt(0); if (c >= 0x30a1 && c <= 0x30f6) ch = String.fromCharCode(c - 0x60);   // カタカナをひらがなに
        if (SMALL[ch] && out.length) out[out.length - 1] = SMALL[ch];
        else if (ch === 'ー' && out.length) out.push(out[out.length - 1]);
        else if (VOWEL_OF[ch]) out.push(VOWEL_OF[ch]);
        else if (ch === 'ん' || ch === 'っ' || /[\s、。，．！？!?…・「」『』（）()〜~]/.test(ch)) out.push('n');
        else out.push('a');
      }
      return out;
    }
    // 母音ごとの口の [開き, 横の広がり]
    const VOWEL_SHAPE = { a: [1, 0.55], i: [0.35, 0.95], u: [0.45, 0.25], e: [0.6, 0.8], o: [0.8, 0.4], n: [0, 0.5] };

    // ---- 髪の束 ----
    // 休みの形（骨格の座標、A ポーズの絵の位置）。三面図の正面・横・後ろから読んだ: 首の後ろの玉から、キャラの右うしろへ垂れる。
    // TAIL_W は点ごとの帯の幅、CURL は先の丸く巻いた所（中心・半径・面の向き）。どれも元の絵の画素
    const TAIL_REST = [[0, 323, -55], [-45, 360, -85], [-90, 422, -122], [-135, 500, -158], [-178, 568, -178]];
    // 巻いた先は、正面・横・後ろのどれから見ても大きな丸なので、玉として描く
    const TAIL_W = [16, 26, 36, 46, 56], CURL = { c: [-235, 648, -172], r: 88 };
    const tailInit = (rest) => ({ p: rest.map((v) => v.slice()), q: rest.map((v) => v.slice()), len: rest.slice(1).map((v, i) => Math.hypot(v[0] - rest[i][0], v[1] - rest[i][1], v[2] - rest[i][2])) });
    // 1 コマ進める: 根元は targets[0] に付け、ほかの点は、慣性（前のコマからの動き）と、休みの形の位置へ戻る力と、重さで動かす。
    // 戻る力は先ほど弱く、先ほどよく揺れる。そのあと根元から順に、区間の長さを休みの形の長さに戻す
    function tailStep(T, targets, dt, opt = {}) {
      // 1 回の計算の間隔は 1/120 秒まで（戻る力 × 間隔² が大きいと、ばねの計算が不安定になって飛ぶ）
      if (dt > 1 / 120) { const n = Math.ceil(dt * 120); for (let k = 0; k < n; k++) tailStep(T, targets, dt / n, opt); return T; }
      const { stiff = 260, damp = 0.06, grav = 900 } = opt, n = T.p.length;
      T.q[0] = T.p[0]; T.p[0] = targets[0].slice();
      for (let i = 1; i < n; i++) {
        const p = T.p[i], q = T.q[i], k = stiff / (1 + i * 0.8), nx = [0, 0, 0];
        for (let c = 0; c < 3; c++) nx[c] = p[c] + (p[c] - q[c]) * (1 - damp) + (k * (targets[i][c] - p[c]) + (c === 1 ? grav : 0)) * dt * dt;
        T.q[i] = p; T.p[i] = nx;
      }
      for (let i = 1; i < n; i++) {
        const a = T.p[i - 1], b = T.p[i], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1, s = T.len[i - 1] / l;
        T.p[i] = [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s];
      }
      return T;
    }

    // ---- 動きのデータ ----
    const TYPES = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Float32Array };
    const view = (bytes, r) => new TYPES[r.t](bytes.buffer, bytes.byteOffset + r.o, r.n);
    function dequant(q, min, max, k) {
      const out = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) { const a = i % k; out[i] = min[a] + q[i] / 65535 * (max[a] - min[a]); }
      return out;
    }
    // 動きの t 秒の姿勢: 前後のコマの回転を球面でつなぎ、腰の位置を直線でつなぐ。
    // その場で動かすため、腰の水平の位置から、始めから終わりまでの進み（まっすぐな分）を引く
    function sampleClip(clip, t) {
      const n = clip.frames, B = clip.rotA.length / n / 4, f = Math.max(0, Math.min(n - 1.0001, t * clip.fps)), i = Math.floor(f), u = f - i;
      const rot = [];
      for (let k = 0; k < B; k++) {
        const a = [0, 1, 2, 3].map((c) => clip.rotA[(i * B + k) * 4 + c] / 32767), b = [0, 1, 2, 3].map((c) => clip.rotA[((i + 1) * B + k) * 4 + c] / 32767);
        rot.push(qslerp(a, b, u));
      }
      const H = clip.hipsA, h = [0, 1, 2].map((c) => H[i * 3 + c] + (H[(i + 1) * 3 + c] - H[i * 3 + c]) * u), s = f / (n - 1), L = (n - 1) * 3;
      for (const c of [0, 2]) h[c] -= H[c] + (H[L + c] - H[c]) * s;
      return { rot, hips: h };
    }

    const Z = { parsePath, subdivide, buildProxy, lift, hull, rotX, rotY, rotZ, mul3, applyMat3, viewAngle, viewBlend, VIEWS, AXIS, REGIONS, CARDS, SLEEVES, view, dequant, sampleClip,
      TAIL_REST, TAIL_W, CURL, tailInit, tailStep, eyeCloser, mouthShape, vowels, VOWEL_SHAPE,
      qmul, qconj, qaxis, qrot, qfromTo, qslerp, qmat, norm3, SKEL, buildSkeleton, restLocals, fk, boneDraw, HIPS_REST, PX_PER_M, hipsFromMotion, cardMap, jointBlend,
      FLOOR_Y, HIPS_BOTTOM, groundOffset };
  },
  js() {
    const cv = document.getElementById('c'), g = cv.getContext('2d');
    const D = window.DEKIRU_DATA, SRC = { front: D['zunda-front'], side: D['zunda-side'], back: D['zunda-back'] }, PAL = SRC.front.palette;
    // ---- 曲線を読む（長い区間は 6 画素以下に分ける）----
    const prep = (V) => V.shapes.map((s, i) => ({ i, part: s.part, kind: s.kind, color: V.palette[s.color], subs: Z.parsePath(s.d, V.origin).map((q) => Z.subdivide(q, 6)) }));
    const ART = { front: prep(SRC.front), side: prep(SRC.side), back: prep(SRC.back) };
    function addSub(p, s, f) {
      let q = f(s[0], s[1]); p.moveTo(q[0], q[1]);
      for (let i = 2; i + 6 <= s.length; i += 6) { const a = f(s[i], s[i + 1]), b = f(s[i + 2], s[i + 3]), c = f(s[i + 4], s[i + 5]); p.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]); }
      p.closePath();
    }
    // 輪郭: 部品の塗りを画素に描いて、行ごとの左右の端を数える
    function rows(shapes, V) {
      const w = V.w, h = V.h, oc = new OffscreenCanvas(w, h), og = oc.getContext('2d');
      og.translate(-V.origin[0], -V.origin[1]); og.fillStyle = '#000';
      for (const s of shapes) if (s.kind === 'fill') { const p = new Path2D(); for (const q of s.subs) addSub(p, q, (x, y) => [x, y]); og.fill(p); }
      const px = og.getImageData(0, 0, w, h).data, out = [];
      for (let y = 0; y < h; y++) {
        let lo = -1, hi = -1;
        for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 127) { if (lo < 0) lo = x; hi = x; }
        out.push(lo < 0 ? null : [lo + V.origin[0], hi + V.origin[0]]);
      }
      return { y0: V.origin[1], rows: out };
    }
    // 確かめ用の状態（spread: 貼るときの広げ方、force: 1 枚の絵だけを描く、cam: 見る向き（ラジアン）、clip・time: 動きと時刻を決める、
    // blink: まばたきを決める（null なら自動）、mouth: 口の [開き, 幅] を決める）
    const state = { spread: 1.3, outline: 1.2, base: true, force: null, cam: 0, camPitch: 0, clip: null, time: null, paused: false, blink: null, mouth: null };
    // 目: 瞳（オレンジと黄色）の塗りを画素に描いて、列ごとの上と下を数え、閉じた位置へ動かす関数を作る。
    // 白い塗りで測らない（目の部品には、まつげの上の肌も入っている）。瞳の塗りがない目（横の絵）は、白い塗りで測る
    function eyeProfile(shapes, V) {
      const w = V.w, h = V.h, oc = new OffscreenCanvas(w, h), og = oc.getContext('2d');
      og.translate(-V.origin[0], -V.origin[1]); og.fillStyle = '#000';
      const iris = shapes.filter((s) => s.kind === 'fill' && (s.color === V.palette.orange || s.color === V.palette.yellow));
      for (const s of iris.length ? iris : shapes.filter((x) => x.kind === 'fill')) { const p = new Path2D(); for (const q of s.subs) addSub(p, q, (x, y) => [x, y]); og.fill(p); }
      const px = og.getImageData(0, 0, w, h).data, top = [], bot = [];
      let x0 = -1;
      for (let x = 0; x < w; x++) {
        let t = -1, b = -1;
        for (let y = 0; y < h; y++) if (px[(y * w + x) * 4 + 3] > 127) { if (t < 0) t = y; b = y; }
        if (t < 0) { if (x0 >= 0) { top.push(NaN); bot.push(NaN); } continue; }
        if (x0 < 0) x0 = x;
        top.push(t + V.origin[1]); bot.push(b + V.origin[1]);
      }
      // 上と下は、瞳全体のいちばん上といちばん下の 1 つずつにする（列ごとにすると、瞳の上の光の切れ込みで下げる量が変わり、まつげが裂ける）
      const t = Math.min(...top.filter((v) => !Number.isNaN(v))), b = Math.max(...bot.filter((v) => !Number.isNaN(v)));
      return Z.eyeCloser({ x0: x0 + V.origin[0], top: top.map(() => t), bot: bot.map(() => b) });
    }
    const EYES = { front: {}, side: {} };
    for (const [v, list] of [['front', ['eye_r', 'eye_l']], ['side', ['eye_l']]]) for (const part of list) EYES[v][part] = eyeProfile(ART[v].filter((s) => s.part === part), SRC[v]);

    // ---- 骨格 ----
    const SK = Z.buildSkeleton(Z.SKEL), REST = Z.restLocals(SK), BI = SK.index;

    // ---- 部分（頭・首・胴・半ズボン・靴）: まとまりごとに立体の形を作り、3 方向の絵の点を持ち上げる ----
    function buildGroup(G, ref, done) {
      const [jx, jy] = ref.front, jz = ref.side, jb = ref.back;
      const pick = (v, list) => ART[v].filter((s) => list.includes(s.part));
      const art = { front: pick('front', G.parts.front), side: pick('side', G.parts.side), back: pick('back', G.parts.back) };
      const fr = rows(pick('front', G.shape?.front ?? G.parts.front), SRC.front), sr = rows(pick('side', G.shape?.side ?? G.parts.side), SRC.side);
      const y0 = Math.min(fr.y0, sr.y0), y1 = Math.max(fr.y0 + fr.rows.length, sr.y0 + sr.rows.length);
      const toRows = (f0, s0) => { const fx = [], sz = []; for (let y = y0; y < y1; y++) { const f = f0.rows[y - f0.y0], s = s0.rows[y - s0.y0]; fx.push(f ? [f[0] - jx, f[1] - jx] : null); sz.push(s ? [jz - s[1], jz - s[0]] : null); } return [fx, sz]; };
      const P = Z.buildProxy(y0, ...toRows(fr, sr), { smooth: 2 });
      // 下地は、自分の部品だけの輪郭から作った形に塗る（baseShape のまとまりは、shape の形に塗る）
      const Pbase = G.shape && !G.baseShape ? Z.buildProxy(y0, ...toRows(rows(art.front, SRC.front), rows(art.side, SRC.side)), { smooth: 2 }) : P;
      const Pfront = G.shareFront ? done.find((d) => d.name === G.shareFront).P : P;
      // 目の部品は、閉じた位置（ptsC）も持ち上げておく（まばたきは、毎コマ開いた位置との間をつなぐ）
      const liftArt = (shapes, view, toU) => shapes.map((s) => {
        const closer = EYES[view === 'front' ? 'front' : 'side']?.[s.part];
        const liftQ = (q, f) => {
          const o = new Float32Array(q.length / 2 * 3), PP = view === 'front' || view === 'back' ? Pfront : P;
          for (let i = 0, j = 0; i < q.length; i += 2, j += 3) { const [x, y] = f(q[i], q[i + 1]), p = Z.lift(PP, view, toU(x), y, state.spread); o[j] = p[0]; o[j + 1] = p[1] - jy; o[j + 2] = p[2]; }
          return o;
        };
        const out = { ...s, facing: G.facing ?? -2, pts: s.subs.map((q) => liftQ(q, (x, y) => [x, y])) };
        if (closer && view !== 'back') out.ptsC = s.subs.map((q) => liftQ(q, closer));
        return out;
      });
      const lifted = { front: liftArt(art.front, 'front', (x) => x - jx), left: liftArt(art.side, 'left', (x) => jz - x), back: liftArt(art.back, 'back', (x) => jb - x), right: liftArt(art.side, 'right', (x) => jz - x) };
      return { ...G, P, Pbase, lifted, jy };
    }
    function buildRegions() {
      return Z.REGIONS.map((R) => {
        const groups = [];
        for (const G of R.groups) groups.push(buildGroup(G, R.ref, groups));
        const lifted = {};
        for (const v of Z.VIEWS) lifted[v] = groups.flatMap((G) => G.lifted[v]).sort((a, b) => a.i - b.i);   // 描く順は元の絵のデータの順
        return { ...R, bi: BI[R.bone], groups, lifted };
      });
    }
    let REG = buildRegions();

    // ---- 手足の板と袖 ----
    const restXY = (bi) => [SK.bones[bi].at[0] + Z.AXIS.front, SK.bones[bi].at[1]];
    const childOf = (bi) => SK.bones.findIndex((c) => c.pi === bi);
    const endXY = (bi) => { const b = SK.bones[bi]; const e = b.tip || SK.bones[childOf(bi)].at; return [e[0] + Z.AXIS.front, e[1]]; };
    const BLEND_R = 14;   // 関節のまわりで重みを混ぜる幅の半分（元の絵の画素）
    const CARD = Z.CARDS.map((C) => {
      const bi = BI[C.bone], pi = C.parent ? BI[C.parent] : -1, ci = C.child ? BI[C.child] : -1;
      const A = restXY(bi), B = endXY(bi), L = Math.hypot(B[0] - A[0], B[1] - A[1]), e = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
      const shapes = ART.front.filter((s) => s.part === C.part).map((s) => ({ ...s, w: s.subs.map((q) => {
        const w = new Float32Array(q.length / 2 * 3);
        for (let i = 0, j = 0; i < q.length; i += 2, j += 3) {
          const proj = (q[i] - A[0]) * e[0] + (q[i + 1] - A[1]) * e[1];
          const wc = ci >= 0 ? Z.jointBlend(proj - L, BLEND_R) : 0, wp = pi >= 0 ? 1 - Z.jointBlend(proj, BLEND_R) : 0;
          w[j] = wp; w[j + 1] = Math.max(0, 1 - wc - wp); w[j + 2] = wc;
        }
        return w;
      }) }));
      return { ...C, bi, pi, ci, shapes };
    });
    const SLEEVE = Z.SLEEVES.map((C) => ({ ...C, bi: BI[C.bone], shapes: ART.front.filter((s) => s.part === C.part) }));
    // 枝豆の飾り: 正面の絵を、頭に付いた平らな板として 3D に置く（外側ほど後ろへ下がる板。横から見ると後ろへ伸びる）
    // base: 根元、tip: 先（根元からいちばん遠い点）、n: 板の表の向き。三面図の後ろの絵の飾りには豆がないので、裏が見えるときは外形だけを描く
    const PODS = [['ornament_l', 1], ['ornament_r', -1]].map(([part, side]) => {
      const ref = Z.REGIONS[0].ref, X0 = side * 55, Z0 = -10 - (Z.AXIS.side - ref.side), k = 1.0;
      const base = [X0, 140 - ref.front[1], Z0];
      const shapes = ART.front.filter((s) => s.part === part).map((s) => ({ ...s, pts: s.subs.map((q) => {
        const o = new Float32Array(q.length / 2 * 3);
        for (let i = 0, j = 0; i < q.length; i += 2, j += 3) { const X = q[i] - ref.front[0]; o[j] = X; o[j + 1] = q[i + 1] - ref.front[1]; o[j + 2] = Z0 - k * Math.max(0, side * (X - X0)); }
        return o;
      }) }));
      let tip = base, far = 0;
      for (const s of shapes) for (const o of s.pts) for (let j = 0; j < o.length; j += 3) { const d = Math.hypot(o[j] - base[0], o[j + 1] - base[1], o[j + 2] - base[2]); if (d > far) { far = d; tip = [o[j], o[j + 1], o[j + 2]]; } }
      return { part, shapes, base, tip, n: Z.norm3([k * side, 0, 1]), sim: null };
    });
    // 飾りの揺れ: 根元と先の 2 点の鎖を、頭の動きに遅れて揺らし、その向きの差（最大 25 度）で飾りの点を根元のまわりに回す
    function podFrame(pod, P, dt) {
      const d = Z.boneDraw(SK, P, BI.head), hp = P.p[BI.head];
      const world = (v) => { const o = Z.qrot(d.q, v); return [hp[0] + o[0], hp[1] + o[1], hp[2] + o[2]]; };
      const targets = [world(pod.base), world(pod.tip)];
      if (!pod.sim) pod.sim = Z.tailInit(targets);
      Z.tailStep(pod.sim, targets, dt, { stiff: 520, damp: 0.1, grav: 250 });
      const t = pod.sim.p[1], tl = Z.qrot(Z.qconj(d.q), [t[0] - hp[0], t[1] - hp[1], t[2] - hp[2]]);
      let q = Z.qfromTo([pod.tip[0] - pod.base[0], pod.tip[1] - pod.base[1], pod.tip[2] - pod.base[2]], [tl[0] - pod.base[0], tl[1] - pod.base[1], tl[2] - pod.base[2]]);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(q[3]))), MAX = 25 * Math.PI / 180;
      if (ang > MAX) q = Z.qslerp([0, 0, 0, 1], q, MAX / ang);
      const b = pod.base, rot = (o) => { const out = new Float32Array(o.length); for (let j = 0; j < o.length; j += 3) { const v = Z.qrot(q, [o[j] - b[0], o[j + 1] - b[1], o[j + 2] - b[2]]); out[j] = b[0] + v[0]; out[j + 1] = b[1] + v[1]; out[j + 2] = b[2] + v[2]; } return out; };
      return { shapes: pod.shapes.map((s) => ({ ...s, pts: s.pts.map(rot) })), n: Z.qrot(q, pod.n) };
    }
    // 髪の束: 根元は頭（首の後ろの玉）に付け、ほかの点は胸に付いた休みの形へ戻りながら揺れる
    let tail = null;
    function tailPoints(P, dt) {
      const at = (i) => SK.bones[i].at, dh = Z.boneDraw(SK, P, BI.head), dc = Z.boneDraw(SK, P, BI.chest);
      const place = (d, bi, v) => { const o = Z.qrot(d.q, [v[0] - at(bi)[0], v[1] - at(bi)[1], v[2] - at(bi)[2]]); return [P.p[bi][0] + o[0], P.p[bi][1] + o[1], P.p[bi][2] + o[2]]; };
      const root = place(dh, BI.head, Z.TAIL_REST[0]), n = Z.TAIL_REST.length;
      const fromChest = Z.TAIL_REST.map((v) => place(dc, BI.chest, v)), off = [0, 1, 2].map((c) => root[c] - fromChest[0][c]);
      const targets = fromChest.map((v, i) => v.map((x, c) => x + off[c] * (1 - i / (n - 1) * 0.7)));
      if (!tail) tail = Z.tailInit(targets);
      Z.tailStep(tail, targets, dt);
      const last = Z.TAIL_REST[n - 1], cc = Z.qrot(dc.q, [Z.CURL.c[0] - last[0], Z.CURL.c[1] - last[1], Z.CURL.c[2] - last[2]]);
      const tip = tail.p[n - 1], center = [tip[0] + cc[0], tip[1] + cc[1], tip[2] + cc[2]];
      return { chain: tail.p, center };
    }

    // ---- 動き ----
    const MO = D['motion-bn1'], MB = Uint8Array.from(atob(MO.bin), (c) => c.charCodeAt(0));
    const CLIPS = MO.clips.map((cl) => ({ ...cl, rotA: Z.view(MB, cl.rot), hipsA: Z.dequant(Z.view(MB, cl.hips), cl.hips.min, cl.hips.max, 3), len: (cl.frames - 1) / cl.fps }));
    const MBI = MO.bones.map((n) => BI[n]);
    let clip = null, ct = 0, from = null, fade = 1, last = null;
    // 立っているとき: 絵の姿勢に、息と小さな揺れを足す
    function idle(t) {
      const L = REST.map((q) => q.slice());
      const br = Math.sin(t * 2.1) * 0.012, sw = Math.sin(t * 0.7) * 0.02;
      L[BI.spine] = Z.qmul(L[BI.spine], Z.qaxis([1, 0, 0], br));
      L[BI.chest] = Z.qmul(L[BI.chest], Z.qaxis([1, 0, 0], br * 0.8));
      L[BI.head] = Z.qmul(L[BI.head], Z.qmul(Z.qaxis([0, 1, 0], sw * 2), Z.qaxis([0, 0, 1], sw)));
      for (const [n, s] of [['leftUpperArm', 1], ['rightUpperArm', -1]]) L[BI[n]] = Z.qmul(L[BI[n]], Z.qaxis([0, 0, 1], s * Math.sin(t * 2.1 + 0.6) * 0.015));
      return { L, hips: SK.bones[0].at.slice() };
    }
    function play(k) { from = last; fade = from ? 0 : 1; clip = k; ct = 0; updateButtons(); }
    function currentPose(t, dt) {
      let p;
      if (clip == null) p = idle(t);
      else {
        const C = CLIPS[clip], s = Z.sampleClip(C, state.time ?? ct), L = REST.map((q) => q.slice());
        s.rot.forEach((q, k) => { L[MBI[k]] = q; });
        p = { L, hips: Z.hipsFromMotion(s.hips, SK) };
        if (state.time == null) { ct += dt; if (ct > C.len) { if (C.name === 'walk' || C.name === 'dance') ct -= C.len; else play(null); } }
      }
      if (from && fade < 1) {
        fade = Math.min(1, fade + dt / 0.4); const k = fade * fade * (3 - 2 * fade);
        p = { L: p.L.map((q, i) => Z.qslerp(from.L[i], q, k)), hips: p.hips.map((v, i) => from.hips[i] + (v - from.hips[i]) * k) };
      }
      last = p;
      return p;
    }

    // ---- 描く ----
    let W = 1, H = 1;
    const mk = () => { const c = new OffscreenCanvas(1, 1); return { c, g: c.getContext('2d') }; };
    const A = mk(), B = mk(), T = mk();   // A: 部分 1 つ分、B: 重ねる絵、T: 輪郭の線の色に塗った写し
    function resize() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = Math.max(1, Math.round(cv.clientWidth * dpr)); H = Math.max(1, Math.round(cv.clientHeight * dpr));
      cv.width = W; cv.height = H; for (const L of [A, B, T]) { L.c.width = W; L.c.height = H; }
    }
    resize(); addEventListener('resize', resize);
    // 描いた範囲（部分の写しを、必要な所だけ重ねる）
    const box = { x0: 0, y0: 0, x1: 0, y1: 0 }, grow = (x, y) => { if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; };
    const clearBox = (L, b) => { L.g.setTransform(1, 0, 0, 1, 0, 0); L.g.globalAlpha = 1; L.g.globalCompositeOperation = 'source-over'; L.g.clearRect(b[0], b[1], b[2], b[3]); };
    // 3D の点の並び（部分の付け根からの位置）を、回転 M・付け根の画面の位置 J・縮尺 S で写して塗る
    let blinkNow = 0;   // いまのまばたき（0 開く〜1 閉じる）
    function fillPts(tg, s, M, J, S) {
      const p = new Path2D(), bl = s.ptsC ? blinkNow : 0;
      for (let n = 0; n < s.pts.length; n++) {
        const q = s.pts[n], qc = bl > 0 ? s.ptsC[n] : null;
        const f = (k) => {
          let X = q[k], Y = q[k + 1], Zz = q[k + 2];
          if (qc) { X += (qc[k] - X) * bl; Y += (qc[k + 1] - Y) * bl; Zz += (qc[k + 2] - Zz) * bl; }
          const x = J[0] + (M[0] * X + M[1] * Y + M[2] * Zz) * S, y = J[1] + (M[3] * X + M[4] * Y + M[5] * Zz) * S; grow(x, y); return [x, y];
        };
        const a = f(0); p.moveTo(a[0], a[1]);
        for (let k = 3; k + 9 <= q.length; k += 9) { const u = f(k), v = f(k + 3), w = f(k + 6); p.bezierCurveTo(u[0], u[1], v[0], v[1], w[0], w[1]); }
        p.closePath();
      }
      tg.fillStyle = s.color; tg.fill(p);
    }
    function drawBase(tg, G, M, J, S) {
      const P = G.Pbase, p = new Path2D(), STEP = 3, K = 20;
      const ring = (r) => { const out = []; for (let k = 0; k < K; k++) { const t = k / K * Math.PI * 2, v = Z.applyMat3(M, [P.cx[r] + P.a[r] * Math.cos(t), P.y0 + r - G.jy, P.cz[r] + P.c[r] * Math.sin(t)]); out.push([J[0] + v[0] * S, J[1] + v[1] * S]); } return out; };
      for (let r = 0; r + STEP < P.n; r += STEP) {
        if (!P.both[r] || !P.both[r + STEP]) continue;
        const h = Z.hull([...ring(r), ...ring(r + STEP)]);
        h.forEach((q, k) => { grow(q[0], q[1]); if (k) p.lineTo(q[0], q[1]); else p.moveTo(q[0], q[1]); }); p.closePath();
      }
      tg.fillStyle = PAL[G.base]; tg.fill(p);
    }
    // 輪郭の線を付けて描く: draw(tg) が下書き A に描いた形のまわりに、線の色に塗った写しを 8 方向にずらして下に描き、
    // その上に形を重ねる（どの向きでも、その向きの外形に線が付く）。描き終えたら、使った範囲の下書きを消す
    function outlined(S, draw) {
      const r = Math.max(1, state.outline * S);
      box.x0 = Infinity; box.y0 = Infinity; box.x1 = -Infinity; box.y1 = -Infinity;
      draw(A.g);
      if (!(box.x1 > box.x0)) return;
      const b = [Math.max(0, Math.floor(box.x0 - r - 2)), Math.max(0, Math.floor(box.y0 - r - 2))];
      b.push(Math.min(W, Math.ceil(box.x1 + r + 2)) - b[0], Math.min(H, Math.ceil(box.y1 + r + 2)) - b[1]);
      if (b[2] > 0 && b[3] > 0) {
        clearBox(T, b); T.g.drawImage(A.c, b[0], b[1], b[2], b[3], b[0], b[1], b[2], b[3]);
        T.g.globalCompositeOperation = 'source-in'; T.g.fillStyle = PAL.line; T.g.fillRect(b[0], b[1], b[2], b[3]); T.g.globalCompositeOperation = 'source-over';
        for (let k = 0; k < 8; k++) g.drawImage(T.c, b[0], b[1], b[2], b[3], b[0] + Math.cos(k * Math.PI / 4) * r, b[1] + Math.sin(k * Math.PI / 4) * r, b[2], b[3]);
        g.drawImage(A.c, b[0], b[1], b[2], b[3], b[0], b[1], b[2], b[3]);
      }
      clearBox(A, [0, 0, W, H]);
    }
    // 部分 1 つ: 下地 → 絵（入れ替えの間は 2 枚を重ねる）→ 頭なら開いた口
    let mouthNow = [0, 0.5];   // いまの口の [開き, 幅]
    const MOUTH_AT = [924, 295], MOUTH_IN = '#8f2a3a', TONGUE = '#ee8a96';
    function drawRegion(R, M, J, S) {
      const theta = Z.viewAngle(M), blend = state.force ? [{ view: state.force, alpha: 1 }] : Z.viewBlend(theta);
      const front = blend[blend.length - 1].view === 'front' && M[8] > 0.2, open = R.name === 'head' && front ? mouthNow[0] : 0;
      outlined(S, (tg) => {
        if (state.base) for (const G of R.groups) if (G.base && M[8] >= (G.facing ?? -2)) drawBase(tg, G, M, J, S);
        for (const { view, alpha } of blend) {
          // 口を開いているときは、閉じた口（:3）の線を描かない
          const list = R.lifted[view].filter((s) => M[8] >= s.facing && !(open > 0.12 && s.part === 'mouth' && s.kind === 'line'));
          if (alpha >= 1) { for (const s of list) fillPts(tg, s, M, J, S); continue; }
          clearBox(B, [0, 0, W, H]); for (const s of list) fillPts(B.g, s, M, J, S);
          tg.globalAlpha = alpha; tg.drawImage(B.c, 0, 0); tg.globalAlpha = 1;
        }
        if (open > 0.04) drawMouth(tg, R, M, J, S, open);
      });
    }
    // 開いた口: 形を元の絵の口の位置に置き、頭の立体の形に貼って描く（口の中 → 舌 → 線）
    function drawMouth(tg, R, M, J, S, open) {
      const G = R.groups.find((x) => x.name === 'hair'), [jx] = R.ref.front, jy = R.ref.front[1];
      const pts = Z.mouthShape(open, mouthNow[1]).map(([dx, dy]) => {
        const p = Z.lift(G.P, 'front', MOUTH_AT[0] + dx - jx, MOUTH_AT[1] + dy, state.spread), X = p[0], Y = p[1] - jy, Zz = p[2];
        return [J[0] + (M[0] * X + M[1] * Y + M[2] * Zz) * S, J[1] + (M[3] * X + M[4] * Y + M[5] * Zz) * S];
      });
      const path = new Path2D(); pts.forEach((q, k) => (k ? path.lineTo(q[0], q[1]) : path.moveTo(q[0], q[1]))); path.closePath();
      tg.fillStyle = MOUTH_IN; tg.fill(path);
      const lo = pts.reduce((a, q) => (q[1] > a[1] ? q : a), pts[0]), xs = pts.map((q) => q[0]), w = (Math.max(...xs) - Math.min(...xs)) / 2;
      tg.save(); tg.clip(path); tg.fillStyle = TONGUE; tg.beginPath(); tg.ellipse(lo[0], lo[1], w * 0.62, Math.max(1, w * 0.42), 0, 0, Math.PI * 2); tg.fill(); tg.restore();
      tg.strokeStyle = PAL.line; tg.lineWidth = Math.max(0.8, 1.4 * S); tg.lineJoin = 'round'; tg.stroke(path);
    }
    // ---- まばたきと話す ----
    let nextBlink = 1.5, blinkT = -1, joy = 0, speech = null;
    const sayEl = document.getElementById('say');
    function say(text, rate = 7) {
      speech = { text, v: Z.vowels(text), t: 0, rate };
      sayEl.textContent = text; sayEl.hidden = false;
    }
    function updateFace(dt) {
      // まばたき: 2〜5 秒ごとに、0.07 秒で閉じ、0.03 秒止まり、0.1 秒で開く
      if (blinkT < 0) { nextBlink -= dt; if (nextBlink <= 0) { blinkT = 0; nextBlink = 2 + Math.random() * 3; } }
      let b = 0;
      if (blinkT >= 0) { blinkT += dt; const t = blinkT; b = t < 0.07 ? t / 0.07 : t < 0.1 ? 1 : t < 0.2 ? 1 - (t - 0.1) / 0.1 : 0; if (t >= 0.2) blinkT = -1; }
      // 嬉しそうに手を振るとき・踊るときは、目を細めて笑う
      const name = clip == null ? '' : CLIPS[clip].name, want = name === 'byehappy' || name === 'dance' ? 1 : 0;
      joy += (want - joy) * Math.min(1, dt * 4);
      blinkNow = state.blink ?? Math.max(b, joy * 0.92);
      // 口: 話している間は、いまの母音の形へ近づける。話し終えたら閉じて、吹き出しを消す
      let target = [0, 0.5];
      if (speech) {
        speech.t += dt;
        const k = Math.floor(speech.t * speech.rate);
        if (k < speech.v.length) target = Z.VOWEL_SHAPE[speech.v[k]];
        else if (speech.t > speech.v.length / speech.rate + 0.8) { speech = null; sayEl.hidden = true; }
      }
      const m = state.mouth ?? target, r = Math.min(1, dt * 18);
      mouthNow = [mouthNow[0] + (m[0] - mouthNow[0]) * r, mouthNow[1] + (m[1] - mouthNow[1]) * r];
    }
    // 髪の束: 鎖の点をなめらかな線（Catmull-Rom）でつなぎ、幅を付けた帯にする。先に丸く巻いた所（3D の円盤を写した楕円）を付ける
    function drawTail(pts, curl, S) {
      outlined(S, (tg) => {
        const sm = [], wd = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
          for (let k = 0; k < 6; k++) {
            const t = k / 6, t2 = t * t, t3 = t2 * t;
            sm.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t3)));
            wd.push((Z.TAIL_W[i] + (Z.TAIL_W[i + 1] - Z.TAIL_W[i]) * t) * S / 2);
          }
        }
        sm.push(pts[pts.length - 1].slice(0, 2)); wd.push(Z.TAIL_W[Z.TAIL_W.length - 1] * S / 2);
        const L = [], R = [];
        sm.forEach((p, i) => {
          const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
          L.push([p[0] - dy / l * wd[i], p[1] + dx / l * wd[i]]); R.push([p[0] + dy / l * wd[i], p[1] - dx / l * wd[i]]);
        });
        // 帯と円盤は別々に塗る（1 つの形にすると、回る向きが逆の所が穴になる）
        tg.fillStyle = PAL.green;
        for (const poly of [[...L, ...R.reverse()], curl]) {
          const p = new Path2D();
          poly.forEach((q, k) => { grow(q[0], q[1]); if (k) p.lineTo(q[0], q[1]); else p.moveTo(q[0], q[1]); }); p.closePath();
          tg.fill(p);
        }
      });
    }
    // 手足の板: 骨ごとの写し方（cardMap）を、点ごとの重みで混ぜる
    function drawCard(C, maps) {
      const mp = C.pi >= 0 ? maps(C.pi) : null, mb = maps(C.bi), mc = C.ci >= 0 ? maps(C.ci) : null;
      for (const s of C.shapes) {
        const p = new Path2D();
        s.subs.forEach((q, n) => {
          const w = s.w[n];
          const f = (i) => {
            const j = i / 2 * 3, x = q[i], y = q[i + 1]; let X = 0, Y = 0;
            if (w[j] > 0) { const v = mp(x, y); X += v[0] * w[j]; Y += v[1] * w[j]; }
            if (w[j + 1] > 0) { const v = mb(x, y); X += v[0] * w[j + 1]; Y += v[1] * w[j + 1]; }
            if (w[j + 2] > 0) { const v = mc(x, y); X += v[0] * w[j + 2]; Y += v[1] * w[j + 2]; }
            return [X, Y];
          };
          const a = f(0); p.moveTo(a[0], a[1]);
          for (let i = 2; i + 6 <= q.length; i += 6) { const b = f(i), c = f(i + 2), d = f(i + 4); p.bezierCurveTo(b[0], b[1], c[0], c[1], d[0], d[1]); }
          p.closePath();
        });
        g.fillStyle = s.color; g.fill(p);
      }
    }
    function drawSleeve(C, scr, S) {
      const A0 = restXY(C.bi), B0 = endXY(C.bi), A2 = scr(C.bi), B2 = scrEnd(C.bi);
      let ang = Math.atan2(B2[1] - A2[1], B2[0] - A2[0]) - Math.atan2(B0[1] - A0[1], B0[0] - A0[0]);
      if (Math.hypot(B2[0] - A2[0], B2[1] - A2[1]) < 0.25 * Math.hypot(B0[0] - A0[0], B0[1] - A0[1]) * S) ang = 0;   // 腕がこちらを向くときは回さない
      const c = Math.cos(ang), s = Math.sin(ang);
      for (const sh of C.shapes) {
        const p = new Path2D();
        for (const q of sh.subs) addSub(p, q, (x, y) => { const dx = (x - A0[0]) * S, dy = (y - A0[1]) * S; return [A2[0] + c * dx - s * dy, A2[1] + s * dx + c * dy]; });
        g.fillStyle = sh.color; g.fill(p);
      }
    }
    let scrEnd = null;
    // ---- 1 コマ ----
    let prevT = null, clock = 0, follow = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const work = [];   // 1 コマの計算と描画にかかった時間（ミリ秒、直近 240 コマ）
    function frame(now) {
      const w0 = performance.now();
      const dt = prevT == null ? 0 : Math.min(0.1, (now - prevT) / 1000); prevT = now;
      if (!state.paused) clock += dt;
      if (state.clip !== null && state.clip !== undefined && state.clip !== clip) play(state.clip);
      const pose = currentPose(clock, state.paused ? 0 : dt), P = Z.fk(SK, pose.L, pose.hips);
      // 体のいちばん低い所を床に着ける（動きは VRoid の体の比率なので、そのままでは足が浮いたり沈んだりする）
      const lift = Z.groundOffset(SK, P); for (const p of P.p) p[1] += lift;
      // 見る向き（縦の軸のまわりに回す）と、画面の縮尺。体の真ん中（高さ 700）を中心に回す
      const S = Math.min(H / 1300, W / 820), oy = H * 0.52 - 700 * S;
      const C = Z.mul3(Z.rotX(state.camPitch), Z.rotY(state.cam));
      const cam = (v) => { const w = Z.applyMat3(C, [v[0], v[1] - 700, v[2]]); return [w[0], w[1] + 700, w[2]]; };
      // 腰が左右へ動く動き（ダンス）では、見る位置を腰の左右の位置へゆっくり追わせる
      follow += (cam(P.p[0])[0] - follow) * (state.time != null ? 1 : Math.min(1, dt * 2.5));
      const ox = W / 2 - follow * S;
      const scr = (bi) => { const w = cam(P.p[bi]); return [ox + w[0] * S, oy + w[1] * S]; };
      scrEnd = (bi) => { const b = SK.bones[bi]; if (!b.tip) return scr(childOf(bi)); const d = Z.boneDraw(SK, P, bi), v = Z.qrot(d.q, [b.tip[0] - b.at[0], b.tip[1] - b.at[1], b.tip[2] - b.at[2]]); const w = cam([P.p[bi][0] + v[0], P.p[bi][1] + v[1], P.p[bi][2] + v[2]]); return [ox + w[0] * S, oy + w[1] * S]; };
      const depth = (v) => cam(v)[2];
      const mapCache = new Map(), maps = (bi) => { if (!mapCache.has(bi)) mapCache.set(bi, Z.cardMap(restXY(bi), endXY(bi), scr(bi), scrEnd(bi), S)); return mapCache.get(bi); };
      // 描くものを、見る人からの近さ（＋部品ごとの差）の順に並べる
      const items = [];
      for (const R of REG) {
        const d = Z.boneDraw(SK, P, R.bi), M = Z.mul3(C, Z.qmat(d.q));
        items.push({ key: depth(P.p[R.bi]) + R.bias, draw: () => drawRegion(R, M, scr(R.bi), S) });
        if (R.name === 'head') for (const pod of PODS) {
          const f = podFrame(pod, P, state.paused ? 0 : dt), J = scr(R.bi), front = M[6] * f.n[0] + M[7] * f.n[1] + M[8] * f.n[2] > 0;
          // 裏が見えるとき（後ろから）は頭より先に描く（後ろの絵では、根元が髪に隠れている）
          items.push({ key: depth(P.p[R.bi]) + R.bias + (front ? 1 : -1), draw: () => {
            if (front) for (const s of f.shapes) fillPts(g, s, M, J, S);
            else outlined(S, (tg) => { for (const s of f.shapes) if (s.kind === 'fill' && s.color === PAL.green) fillPts(tg, s, M, J, S); });
          } });
        }
      }
      for (const Cd of CARD) { const a = P.p[Cd.bi], e = P.p[Cd.ci >= 0 ? Cd.ci : Cd.bi]; items.push({ key: depth([(a[0] + e[0]) / 2, (a[1] + e[1]) / 2, (a[2] + e[2]) / 2]) + Cd.bias, draw: () => drawCard(Cd, maps) }); }
      for (const Sl of SLEEVE) items.push({ key: depth(P.p[Sl.bi]) + Sl.bias, draw: () => drawSleeve(Sl, scr, S) });
      {
        const T3 = tailPoints(P, state.paused ? 0 : dt), toS = (v) => { const w = cam(v); return [ox + w[0] * S, oy + w[1] * S, w[2]]; };
        const chain = T3.chain.map(toS), c = toS(T3.center), disc = [];
        for (let k = 0; k < 32; k++) { const t = k / 32 * Math.PI * 2; disc.push([c[0] + Math.cos(t) * Z.CURL.r * S, c[1] + Math.sin(t) * Z.CURL.r * S * 1.04]); }
        const dz = (chain.reduce((s, q) => s + q[2], 0) + c[2]) / (chain.length + 1);
        // 根元は首の後ろにあるので、首より奥に並べる（後ろから見るときは、平均の近さで胴より手前に来る）
        items.push({ key: dz - 60, draw: () => drawTail(chain, disc, S) });
      }
      items.sort((a, b) => a.key - b.key);
      updateFace(state.paused ? 0 : dt);
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      for (const it of items) it.draw();
      // 吹き出しは頭の右上に置く（画面の画素を CSS の画素に直す）
      if (!sayEl.hidden) { const h = scr(BI.head), k = cv.clientWidth / W; sayEl.style.left = `${Math.min(cv.clientWidth - 220, h[0] * k + 60)}px`; sayEl.style.top = `${Math.max(40, h[1] * k - 150)}px`; }
      work.push(performance.now() - w0); if (work.length > 240) work.shift();
      requestAnimationFrame(frame);
    }

    // ---- 操作 ----
    const bar = document.getElementById('bar'), btns = [];
    const addBtn = (label, k) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', () => play(k)); bar.append(b); btns.push([b, k]); };
    addBtn('立つ', null); CLIPS.forEach((c, k) => addBtn(c.label, k));
    { const b = document.createElement('button'); b.type = 'button'; b.textContent = '話す'; b.addEventListener('click', () => say('ずんだもんなのだ。コードだけで描いて、動いているのだ！')); bar.append(b); }
    function updateButtons() { for (const [b, k] of btns) b.setAttribute('aria-pressed', String(k === clip)); }
    updateButtons();
    const pauseBtn = document.getElementById('pause');
    const setPaused = (v) => { state.paused = v; pauseBtn.textContent = v ? '動かす' : '止める'; };
    pauseBtn.addEventListener('click', () => setPaused(!state.paused));
    setPaused(reduce.matches);   // 動きを減らす設定のときは、止めた状態で始める
    // ドラッグで見る向きを回す（ダブルクリックで正面へ戻す）。左右の矢印のキーでも回せる
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, cam: state.cam }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (drag) state.cam = drag.cam + (e.clientX - drag.x) * 0.01; });
    cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('dblclick', () => { state.cam = 0; });
    addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') state.cam -= 0.2; if (e.key === 'ArrowRight') state.cam += 0.2; });

    // 確かめ用の入口（撮影の道具が、向き・動き・時刻を決めて撮る）
    window.__zunda = { state, ready: true, say, perf: () => { const a = [...work].sort((x, y) => x - y); return { n: a.length, mean: a.reduce((x, y) => x + y, 0) / (a.length || 1), p95: a[Math.floor(a.length * 0.95)] || 0, max: a[a.length - 1] || 0, W, H }; }, clips: CLIPS.map((c) => c.name), pose: () => ({ clip, fade, L: last && last.L.map((q) => q.map((v) => +v.toFixed(3))), hips: last && last.hips }), rebuild: (o) => { Object.assign(state, o); REG = buildRegions(); return true; } };
    requestAnimationFrame(frame);
  },
});
