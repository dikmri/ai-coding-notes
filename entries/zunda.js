/* 図鑑の項目「コードで描いたずんだもんを立体的に動かす」。
 * 絵は、東北ずん子・ずんだもんプロジェクトの公式イラスト「202012_ずんだもん三面」の正面・横・後ろを、
 * 曲線のデータ（data/zunda-front.js・data/zunda-side.js・data/zunda-back.js）に写したもの。設計は MyWiki の zundamon-25d.md。 */
dekiru.add({
  id: '3d-zunda-move', c: '3d', lv: 3,
  t: 'コードで描いたずんだもんを立体的に動かす', y: 'こーどでかいたずんだもんをりったいてきにうごかす',
  tags: ['2.5D', 'ベクター', 'モーションキャプチャー', 'Canvas', 'キャラクター'],
  data: ['data/zunda-front.js', 'data/zunda-side.js', 'data/zunda-back.js'], nt: true,
  d: '公式の三面図（正面・横・後ろ）を曲線で写したずんだもんを、頭と体の立体の形に貼り、向きを変えて描く。',
  p: '正面の幅と横の奥行きから、高さごとに楕円の断面を作ると、頭や胴のおおまかな立体の形になる。3 方向の絵をその形に貼り、見る向きに近い 2 枚を重ねて描く。',
  html: `<canvas id="c" role="img" aria-label="緑の髪に枝豆の飾りを付けた女の子（ずんだもん）が、首を左右に回す"></canvas>`,
  css: `body { background: #f4f1ea; overflow: hidden; }
canvas { display: block; width: 100vw; height: 100vh; }`,
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
    const SWITCH = [0.7, 0.5, 0.5, 0.3], BAND = 0.08;
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
    const REGIONS = [
      { name: 'head', joint: [923.5, 330, 235], groups: [
        { name: 'hair', base: 'green', parts: { front: ['hair_back', 'hair_side_r', 'hair_side_l', 'hair_front'], side: ['hair'], back: ['hair'] },
          shape: { front: ['hair_back', 'hair_side_r', 'hair_side_l', 'hair_front', 'face'], side: ['hair', 'face'] } },
        { name: 'face', parts: { front: ['face', 'eye_r', 'eye_l', 'mouth'], side: ['face', 'eye_l'], back: [] }, shareFront: 'hair', facing: -0.4 },
      ] },
    ];

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

    const Z = { parsePath, subdivide, buildProxy, lift, hull, rotX, rotY, rotZ, mul3, applyMat3, viewAngle, viewBlend, VIEWS, AXIS, REGIONS };
  },
  js() {
    const cv = document.getElementById('c'), g = cv.getContext('2d');
    const D = window.DEKIRU_DATA, SRC = { front: D['zunda-front'], side: D['zunda-side'], back: D['zunda-back'] };
    // ---- 曲線を読む ----
    const prep = (V) => V.shapes.map((s, i) => ({ i, part: s.part, kind: s.kind, color: V.palette[s.color], subs: Z.parsePath(s.d, V.origin).map((q) => Z.subdivide(q, 6)) }));
    const ART = { front: prep(SRC.front), side: prep(SRC.side), back: prep(SRC.back) };
    // ---- 部分ごとに、立体の形を作り、3 方向の絵の点を 3D に持ち上げる ----
    // 輪郭は、その部分の塗りを画素に描いて、行ごとの左右の端を数える
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
    function addSub(p, s, f) {
      let q = f(s[0], s[1]); p.moveTo(q[0], q[1]);
      for (let i = 2; i + 6 <= s.length; i += 6) { const a = f(s[i], s[i + 1]), b = f(s[i + 2], s[i + 3]), c = f(s[i + 4], s[i + 5]); p.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]); }
      p.closePath();
    }
    // 確かめ用の状態（spread は貼るときの広げ方。force は 1 枚の絵だけを描く。outline は輪郭の線の太さ（元の絵の画素）。base は下地を塗るか）
    const state = { yaw: 0, pitch: 0, roll: 0, auto: true, view: null, force: null, spread: 1.3, outline: 1.2, base: true };
    const PAL = SRC.front.palette;
    // まとまりごとに、正面と横の輪郭から立体の形を作り、3 方向の絵の点を 3D に持ち上げる（right は left の絵を右の面に貼る）
    function buildGroup(G, jx, jy, jz, done) {
      const pick = (v, list) => ART[v].filter((s) => list.includes(s.part));
      const art = { front: pick('front', G.parts.front), side: pick('side', G.parts.side), back: pick('back', G.parts.back) };
      // 立体の形は shape の部品（なければ自分の部品）の輪郭から作る
      const fr = rows(pick('front', G.shape?.front ?? G.parts.front), SRC.front), sr = rows(pick('side', G.shape?.side ?? G.parts.side), SRC.side);
      // 正面と横の行を、同じ高さでそろえる（どちらも元の絵の y）
      const y0 = Math.min(fr.y0, sr.y0), y1 = Math.max(fr.y0 + fr.rows.length, sr.y0 + sr.rows.length);
      const fx = [], sz = [];
      for (let y = y0; y < y1; y++) {
        const f = fr.rows[y - fr.y0], s = sr.rows[y - sr.y0];
        fx.push(f ? [f[0] - jx, f[1] - jx] : null);
        sz.push(s ? [jz - s[1], jz - s[0]] : null);
      }
      const P = Z.buildProxy(y0, fx, sz, { smooth: 2 });
      // 下地は、自分の部品だけの輪郭から作った形に塗る（髪の形を顔の輪郭まで含めて作っても、あごの下に髪の色を塗らない）
      let Pbase = P;
      if (G.shape) {
        const fo = rows(art.front, SRC.front), so = rows(art.side, SRC.side), bx = [], bz = [];
        for (let y = y0; y < y1; y++) { const f = fo.rows[y - fo.y0], s = so.rows[y - so.y0]; bx.push(f ? [f[0] - jx, f[1] - jx] : null); bz.push(s ? [jz - s[1], jz - s[0]] : null); }
        Pbase = Z.buildProxy(y0, bx, bz, { smooth: 2 });
      }
      const Pfront = G.shareFront ? done.find((d) => d.name === G.shareFront).P : P;
      const liftArt = (shapes, view, toU) => shapes.map((s) => ({ ...s, pts: s.subs.map((q) => {
        const o = new Float32Array(q.length / 2 * 3), PP = view === 'front' || view === 'back' ? Pfront : P;
        for (let i = 0, j = 0; i < q.length; i += 2, j += 3) { const p = Z.lift(PP, view, toU(q[i]), q[i + 1], state.spread); o[j] = p[0]; o[j + 1] = p[1] - jy; o[j + 2] = p[2]; }
        return o;
      }) }));
      const lifted = {
        front: liftArt(art.front, 'front', (x) => x - jx),
        left: liftArt(art.side, 'left', (x) => jz - x),
        back: liftArt(art.back, 'back', (x) => Z.AXIS.back - x),
        right: liftArt(art.side, 'right', (x) => jz - x),
      };
      return { ...G, P, Pbase, lifted, jy };
    }
    function buildRegions() {
      return Z.REGIONS.map((R) => {
        const [jx, jy, jz] = R.joint, groups = [];
        for (const G of R.groups) groups.push(buildGroup(G, jx, jy, jz, groups));
        // 描く順は、元の絵のデータの順（部品の奥から手前、塗り → 線）
        // 描く形には、どのまとまりのものかを付ける（facing: 前の向きが見る人からこれより向こうを向いたら、そのまとまりを描かない）
        const lifted = {};
        for (const v of Z.VIEWS) lifted[v] = groups.flatMap((G) => G.lifted[v].map((s) => ({ ...s, facing: G.facing ?? -2 }))).sort((a, b) => a.i - b.i);
        return { ...R, groups, lifted, jx, jy };
      });
    }
    let REG = buildRegions();
    const regionParts = new Set(Z.REGIONS.flatMap((R) => R.groups.flatMap((G) => G.parts.front)));

    // ---- 描く ----
    let W = 1, H = 1, dpr = 1;
    const mk = () => { const c = new OffscreenCanvas(1, 1); return { c, g: c.getContext('2d') }; };
    const A = mk(), B = mk(), T = mk(); // A: 部分 1 つ分、B: 重ねる絵、T: 輪郭の線の色に塗った写し
    function resize() {
      dpr = Math.min(2, devicePixelRatio || 1); W = Math.max(1, Math.round(cv.clientWidth * dpr)); H = Math.max(1, Math.round(cv.clientHeight * dpr));
      cv.width = W; cv.height = H; for (const L of [A, B, T]) { L.c.width = W; L.c.height = H; }
    }
    resize(); addEventListener('resize', resize);
    const clear = (L) => { L.g.setTransform(1, 0, 0, 1, 0, 0); L.g.globalAlpha = 1; L.g.globalCompositeOperation = 'source-over'; L.g.clearRect(0, 0, W, H); };
    // 持ち上げた絵を、回転 M で回して写して塗る
    function drawArt(tg, shapes, M, J, S) {
      for (const s of shapes) {
        if (M[8] < s.facing) continue; // M[8]: 部分の前（+Z）の向きの、見る人の側への成分
        const p = new Path2D();
        for (const q of s.pts) {
          const f = (k) => { const v = Z.applyMat3(M, [q[k], q[k + 1], q[k + 2]]); return [J[0] + v[0] * S, J[1] + v[1] * S]; };
          const a = f(0); p.moveTo(a[0], a[1]);
          for (let k = 3; k + 9 <= q.length; k += 9) { const b = f(k), c = f(k + 3), d = f(k + 6); p.bezierCurveTo(b[0], b[1], c[0], c[1], d[0], d[1]); }
          p.closePath();
        }
        tg.fillStyle = s.color; tg.fill(p);
      }
    }
    // 下地: 立体の形（楕円の断面を重ねたもの）を写した影。となり合う 2 つの断面を包む形（凸包）を、断面ごとに塗る
    function drawBase(tg, G, M, J, S) {
      const P = G.Pbase, p = new Path2D(), STEP = 3, K = 20;
      const ring = (r) => { const out = []; for (let k = 0; k < K; k++) { const t = k / K * Math.PI * 2, v = Z.applyMat3(M, [P.cx[r] + P.a[r] * Math.cos(t), P.y0 + r - G.jy, P.cz[r] + P.c[r] * Math.sin(t)]); out.push([J[0] + v[0] * S, J[1] + v[1] * S]); } return out; };
      for (let r = 0; r + STEP < P.n; r += STEP) {
        if (!P.both[r] || !P.both[r + STEP]) continue;
        const h = Z.hull([...ring(r), ...ring(r + STEP)]);
        h.forEach((q, k) => (k ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]))); p.closePath();
      }
      tg.fillStyle = PAL[G.base]; tg.fill(p);
    }
    // 部分 1 つ: 下地 → 絵（入れ替えの間は 2 枚を重ねる）→ 外形に輪郭の線
    function drawRegion(R, M, J, S) {
      const theta = state.view ?? Z.viewAngle(M), blend = state.force ? [{ view: state.force, alpha: 1 }] : Z.viewBlend(theta);
      clear(A);
      if (state.base) for (const G of R.groups) if (G.base) drawBase(A.g, G, M, J, S);
      for (const { view, alpha } of blend) {
        if (alpha >= 1) { drawArt(A.g, R.lifted[view], M, J, S); continue; }
        clear(B); drawArt(B.g, R.lifted[view], M, J, S);
        A.g.globalAlpha = alpha; A.g.drawImage(B.c, 0, 0); A.g.globalAlpha = 1;
      }
      // 輪郭の線: 部分の形を線の色に塗った写しを、まわり 8 方向にずらして下に描く（どの向きでも、その向きの外形に線が付く）
      clear(T); T.g.drawImage(A.c, 0, 0); T.g.globalCompositeOperation = 'source-in'; T.g.fillStyle = PAL.line; T.g.fillRect(0, 0, W, H);
      const r = state.outline * S;
      for (let k = 0; k < 8; k++) g.drawImage(T.c, Math.cos(k * Math.PI / 4) * r, Math.sin(k * Math.PI / 4) * r);
      g.drawImage(A.c, 0, 0);
    }
    // 画面の座標: 元の絵の (x, y) を、キャラの中心の線と足元が画面の真ん中・下に来るように縮める
    function frame(t) {
      const S = Math.min(H / 1260, W / 760), ox = W / 2, oy = H * 0.5 - 690 * S;
      const toScr = (x, y) => [ox + (x - Z.AXIS.front) * S, oy + y * S];
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
      // 体（まだ正面の絵のまま。回す部分はあとで描く）
      for (const s of ART.front) {
        if (regionParts.has(s.part)) continue;
        const p = new Path2D(); for (const q of s.subs) addSub(p, q, toScr); g.fillStyle = s.color; g.fill(p);
      }
      if (state.auto) { state.yaw = Math.sin(t / 1000 * 0.8) * 0.9; state.pitch = Math.sin(t / 1000 * 0.53) * 0.25; }
      const M = Z.mul3(Z.rotY(state.yaw), Z.mul3(Z.rotX(state.pitch), Z.rotZ(state.roll)));
      for (const R of REG) drawRegion(R, M, toScr(R.jx, R.jy), S);
      requestAnimationFrame(frame);
    }
    // 確かめ用の入口（撮影の道具が向きを決めて撮る）
    window.__zunda = { state, ready: true, rebuild: (o) => { Object.assign(state, o); REG = buildRegions(); return true; } };
    requestAnimationFrame(frame);
  },
});
