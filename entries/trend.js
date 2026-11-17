/* 今日の話題を再現
 * 定時の処理（1日3回）が、その日話題になった道具や処理を調べ、ブラウザだけで再現した見本をここへ足していく。
 * 各項目には date（"YYYY-MM-DD"）と refs（[{ title, url }]、元の X の URL も含む）を必ず付ける。
 * 新しい項目はこのファイルの末尾に足す。表示の順番は registry.js が日付の新しい順に並べ替える。 */
dekiru.add({
  id: 'tr-20261117-rupert-passage', c: 'trend', lv: 3, date: '2026-11-17',
  t: '立体が自分と同じ形の穴を通り抜ける向きを探す', y: 'りったいがじぶんとおなじかたちのあなをとおりぬけるむきをさがす',
  tags: ['Septopert', 'ルパートの立方体', '凸包', '四元数', '山登り法'],
  d: 'tom7 さんが 2026年11月に、自分と同じ形の穴を通り抜けられない多面体のうち頂点がいちばん少ないもの（Septopert、頂点7つ）を発表し、Hacker News で取り上げられた。逆に立方体は、穴をうまくあければ同じ大きさの立方体を通せる（ルパートの立方体）。この見本では正多面体を2つ用意し、向きとずらし方を少しずつ変えながら、一方の影がもう一方の影の内側に収まる向きを探す。見つかったら、その穴を通り抜ける様子を立体で見せる。Septopert そのものの形は扱っていない。また、探して見つからなくても「通れない」ことの証明にはならない。元の発表は、通れないことを Lean という証明の道具で確かめている。',
  p: '通り抜けられるかどうかは「同じ向きから見た2つの影で、内側の影が外側の影の内側に収まるか」で決まる。外側の影の凸包の各辺について、内側の頂点が辺の内側にあるかを外積で調べ、いちばん狭い所のすき間を点数にする。向きを少し変えて点数が上がったときだけ採り（山登り法）、行き詰まったら変え幅を縮め、縮めきっても届かなければ最初からやり直す。',
  refs: [
    { title: 'tom7/noperts: The Septopert（GitHub）', url: 'https://github.com/tom7/noperts/blob/main/septopert.md' },
    { title: 'Hacker News: Smallest possible nopert polyhedra: the Septopert', url: 'https://news.ycombinator.com/item?id=50497746' },
    { title: "Prince Rupert's cube（Wikipedia）", url: 'https://en.wikipedia.org/wiki/Prince_Rupert%27s_cube' },
  ],
  html: `<canvas id="c" role="img" aria-label="同じ形の立体2つと、通り抜ける向きから見た2つの影の図。ドラッグで見る向きを変えられる"></canvas>
<div class="ui">
  <label>形 <select id="shape"><option value="cube">立方体</option><option value="octa">正八面体</option><option value="tetra">正四面体</option><option value="dodeca">正十二面体</option><option value="icosa">正二十面体</option></select></label>
  <label>速さ <select id="speed"><option value="3">ゆっくり</option><option value="30" selected>ふつう</option><option value="400">速く</option></select></label>
  <button id="again">もう一度探す</button><button id="pass" disabled>通してみる</button>
  <p id="msg" aria-live="polite"></p><p id="num"></p>
</div>`,
  css: `:root { color-scheme: dark; }
    body { margin: 0; background: #0b1020; color: #d6defc; overflow: hidden; font: 12px system-ui, sans-serif; }
    canvas { width: 100vw; height: 100vh; display: block; touch-action: none; cursor: grab; }
    .ui { position: fixed; left: 8px; top: 8px; right: 8px; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; pointer-events: none; }
    .ui label, .ui button { pointer-events: auto; }
    .ui p { margin: 0; flex-basis: 100%; }
    #num { color: #9aa6d0; font-variant-numeric: tabular-nums; }`,
  core() {
    const PHI = (1 + Math.sqrt(5)) / 2;
    // 正多面体の頂点。外接球の半径を1にそろえる
    function solid(name) {
      const S = [1, -1];
      let v = [];
      if (name === 'cube' || name === 'dodeca') for (const a of S) for (const b of S) for (const c of S) v.push([a, b, c]);
      if (name === 'dodeca') for (const a of S) for (const b of S) v.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [a * PHI, 0, b / PHI]);
      if (name === 'octa') v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      if (name === 'tetra') v = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
      if (name === 'icosa') for (const a of S) for (const b of S) v.push([0, a, b * PHI], [a, b * PHI, 0], [a * PHI, 0, b]);
      if (!v.length) throw new Error('知らない形: ' + name);
      return v.map((p) => { const r = Math.hypot(p[0], p[1], p[2]); return [p[0] / r, p[1] / r, p[2] / r]; });
    }
    // 辺: 正多面体では、いちばん近い頂点どうしが辺でつながっている
    function edgesOf(v) {
      const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      let min = Infinity;
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) min = Math.min(min, d(v[i], v[j]));
      const E = [];
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (d(v[i], v[j]) < min * 1.0001) E.push([i, j]);
      return E;
    }
    // 向きは四元数 [w, x, y, z] で持つ
    function quatMul(a, b) {
      return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
    }
    function quatNorm(q) { const r = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / r, q[1] / r, q[2] / r, q[3] / r]; }
    // 軸 axis のまわりに角度 a（ラジアン）だけ回す四元数
    function quatAxis(axis, a) { const r = Math.hypot(axis[0], axis[1], axis[2]) || 1, s = Math.sin(a / 2) / r; return [Math.cos(a / 2), axis[0] * s, axis[1] * s, axis[2] * s]; }
    function quatToMat(q) {
      const [w, x, y, z] = q;
      return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
    }
    // 偏りのない向きを、でたらめに1つ選ぶ（シューメイクの方法）
    function randomQuat(rand) {
      const u = rand(), v = rand() * 2 * Math.PI, w = rand() * 2 * Math.PI, a = Math.sqrt(1 - u), b = Math.sqrt(u);
      return [a * Math.sin(v), a * Math.cos(v), b * Math.sin(w), b * Math.cos(w)];
    }
    function turn(v, m) { return v.map((p) => [m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2], m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2], m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2]]); }
    // 向き q に回した立体を z の向きから見た影（z を捨てて x, y だけにし、t だけずらす）
    function shadow(v, q, t) { return turn(v, quatToMat(q)).map((p) => [p[0] + t[0], p[1] + t[1]]); }
    // 凸包（左回り）。アンドリューの方法
    function hull(pts) {
      const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (P.length < 3) return P;
      const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], up = [];
      for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-12) lo.pop(); lo.push(p); }
      for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 1e-12) up.pop(); up.push(p); }
      return lo.slice(0, -1).concat(up.slice(0, -1));
    }
    // すき間: 内側の点が、外側の影の辺からどれだけ内側にあるか（いちばん狭い所）。1つでもはみ出すと負になる
    function fitMargin(outer, inner) {
      const H = hull(outer);
      if (H.length < 3) return -Infinity;
      let m = Infinity;
      for (const p of inner) {
        for (let i = 0; i < H.length; i++) {
          const a = H[i], b = H[(i + 1) % H.length], ex = b[0] - a[0], ey = b[1] - a[1];
          m = Math.min(m, (ex * (p[1] - a[1]) - ey * (p[0] - a[0])) / Math.hypot(ex, ey));
        }
      }
      return m;
    }
    // 内側の影を重心を中心に何倍まで大きくしても収まるか（二分法）
    function spareScale(outer, inner) {
      const H = hull(outer), n = inner.length || 1;
      const cx = inner.reduce((s, p) => s + p[0], 0) / n, cy = inner.reduce((s, p) => s + p[1], 0) / n;
      const fits = (k) => fitMargin(H, inner.map((p) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k])) > 0;
      let lo = 0, hi = 4;
      for (let i = 0; i < 40; i++) { const k = (lo + hi) / 2; if (fits(k)) lo = k; else hi = k; }
      return lo;
    }
    // 外側の向き qo、内側の向き qi、内側のずれ t のときのすき間
    function passMargin(v, s) { return fitMargin(shadow(v, s.qo, [0, 0]), shadow(v, s.qi, s.t)); }
    function freshState(v, rand) { const s = { qo: randomQuat(rand), qi: randomQuat(rand), t: [0, 0], step: 0.6, stall: 0 }; s.m = passMargin(v, s); return s; }
    // 山登り法の1手: 向きとずれを少しだけ変え、すき間が広がったら採る。
    // 120 回続けて広がらなければ変え幅を縮め、縮めきったら、すき間が正なら終わり、負なら最初からやり直す
    function climb(v, s, rand) {
      const k = s.step, r = () => (rand() - 0.5) * k;
      const c = { qo: quatNorm(quatMul([1, r(), r(), r()], s.qo)), qi: quatNorm(quatMul([1, r(), r(), r()], s.qi)), t: [s.t[0] + r() * 0.3, s.t[1] + r() * 0.3], step: k, stall: 0 };
      c.m = passMargin(v, c);
      if (c.m > s.m) return c;
      const n = { ...s, stall: s.stall + 1, restarted: false };
      if (n.stall > 120) { n.step = k * 0.7; n.stall = 0; }
      if (n.step < 2e-4) return n.m > 0 ? { ...n, done: true } : { ...freshState(v, rand), restarted: true };
      return n;
    }
    // 決まった種から毎回同じ並びを出す乱数（テストで結果をそろえるため）
    function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  },
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), $ = (id) => document.getElementById(id);
    const NAMES = { cube: '立方体', octa: '正八面体', tetra: '正四面体', dodeca: '正十二面体', icosa: '正二十面体' }, ORDER = Object.keys(NAMES);
    // 動きを減らす設定のときは、見る向きを勝手に回さず、通り抜けもボタンを押したときだけ見せる
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const view = { yaw: 0.65, pitch: -0.3 }, FRONT = 2.6;
    let V = [], E = [], st = null, tries = 0, restarts = 0, found = false, spare = 0, passAt = -1, passes = 0, drag = null, said = '';
    function say(text) { if (text !== said) { $('msg').textContent = text; said = text; } }
    function start() {
      V = solid($('shape').value); E = edgesOf(V);
      st = freshState(V, Math.random); tries = 0; restarts = 0; found = false; spare = 0; passAt = -1; passes = 0;
      $('pass').disabled = true;
      say(`${NAMES[$('shape').value]}が、自分と同じ形の穴を通り抜けられる向きを探しています`);
    }
    function nextShape() { const s = $('shape'); s.value = ORDER[(ORDER.indexOf(s.value) + 1) % ORDER.length]; start(); }
    function search(now) {
      if (found) return;
      const n = +$('speed').value;
      for (let i = 0; i < n && !st.done; i++) { st = climb(V, st, Math.random); tries++; if (st.restarted) restarts++; }
      if (!st.done) return;
      found = true;
      spare = spareScale(shadow(V, st.qo, [0, 0]), shadow(V, st.qi, st.t));
      $('pass').disabled = false;
      say(`見つかりました。${tries.toLocaleString()} 回目の試しで、内側の${NAMES[$('shape').value]}が外側の穴を通る向きになりました`);
      if (!calm.matches) passAt = now + 300;
    }
    // 3D の見た目: 外側の立体、穴（内側の影を手前から奥へ伸ばした筒）、内側の立体
    function draw3d(ax, ay, aw, ah, z, ink) {
      const k = Math.max(1, Math.min(aw, ah)) * 0.21, ox = ax + aw / 2, oy = ay + ah / 2 + (ay === 0 ? 24 : 0);
      const cyw = Math.cos(view.yaw), syw = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
      const P = (p) => { const X = cyw * p[0] + syw * p[2], Z1 = -syw * p[0] + cyw * p[2], Y = cp * p[1] - sp * Z1, Z = sp * p[1] + cp * Z1, f = 8 / (8 - Z); return [ox + X * k * f, oy - Y * k * f, Z]; };
      const line = (a, b, color, w) => {
        const A = P(a), B = P(b);
        x.globalAlpha = Math.max(0.2, Math.min(1, 0.6 + (A[2] + B[2]) * 0.18));
        x.strokeStyle = color; x.lineWidth = w; x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0], B[1]); x.stroke();
      };
      const outer = turn(V, quatToMat(st.qo)), inner = turn(V, quatToMat(st.qi)).map((p) => [p[0] + st.t[0], p[1] + st.t[1], p[2] + z]);
      x.setLineDash([3, 6]); line([st.t[0], st.t[1], FRONT + 1], [st.t[0], st.t[1], -FRONT - 1], '#7d8bc0', 1); x.setLineDash([]);
      if (st.m > 0) {
        const zs = outer.map((p) => p[2]), zf = Math.max(...zs) + 0.03, zb = Math.min(...zs) - 0.03, ring = hull(shadow(V, st.qi, st.t));
        for (const zz of [zf, zb]) {
          x.globalAlpha = 0.16; x.fillStyle = ink; x.beginPath();
          ring.forEach((q, i) => { const s = P([q[0], q[1], zz]); if (i) x.lineTo(s[0], s[1]); else x.moveTo(s[0], s[1]); });
          x.closePath(); x.fill();
        }
        ring.forEach((q, i) => { const r = ring[(i + 1) % ring.length]; line([q[0], q[1], zf], [r[0], r[1], zf], ink, 1); line([q[0], q[1], zb], [r[0], r[1], zb], ink, 1); line([q[0], q[1], zf], [q[0], q[1], zb], ink, 0.7); });
      }
      for (const [i, j] of E) line(outer[i], outer[j], '#d6defc', 2);
      for (const [i, j] of E) line(inner[i], inner[j], ink, 2.2);
      x.globalAlpha = 1;
    }
    // 影の図: 外側の影（凸包）と内側の影。はみ出した頂点は赤い点で示す
    function drawShadow(bx, by, bw, bh, ink) {
      const s = Math.max(1, Math.min(bw, bh)) * 0.36, ox = bx + bw / 2, oy = by + bh / 2 + 8;
      const S = (q) => [ox + q[0] * s, oy - q[1] * s];
      const outer = hull(shadow(V, st.qo, [0, 0])), pts = shadow(V, st.qi, st.t), inner = hull(pts);
      const poly = (list) => { x.beginPath(); list.forEach((q, i) => { const p = S(q); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.closePath(); };
      x.fillStyle = '#9aa6d0'; x.font = '12px system-ui, sans-serif'; x.textAlign = 'center';
      x.fillText('通り抜ける向きから見た影', ox, oy - s * 1.12 - 6);
      poly(outer); x.fillStyle = 'rgba(214,222,252,0.14)'; x.fill(); x.strokeStyle = '#d6defc'; x.lineWidth = 1.5; x.stroke();
      poly(inner); x.strokeStyle = ink; x.lineWidth = 2; x.stroke();
      for (const q of pts) {
        const out = fitMargin(outer, [q]) <= 0, p = S(q);
        x.fillStyle = out ? '#ff5d6c' : ink; x.beginPath(); x.arc(p[0], p[1], out ? 4 : 2.5, 0, 7); x.fill();
      }
    }
    function frame(now) {
      const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight), dpr = Math.min(2, devicePixelRatio || 1);
      const cw = Math.max(1, Math.round(W * dpr)), ch = Math.max(1, Math.round(H * dpr));
      if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = '#0b1020'; x.fillRect(0, 0, W, H);
      search(now);
      let z = FRONT;
      if (passAt >= 0 && now >= passAt) {
        const p = (now - passAt) / 3600;
        if (p >= 1) {
          passes++;
          passAt = calm.matches ? -1 : now + 900;
          if (window.THUMB && passes >= 2) nextShape();
        } else { const e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p); z = FRONT - 2 * FRONT * e; }
      }
      if (!drag && !calm.matches) view.yaw += 0.003;
      const ink = st.m > 0 ? '#5ef0a0' : '#ffb347', wide = W > H * 1.2;
      if (wide) { draw3d(0, 0, W * 0.6, H, z, ink); drawShadow(W * 0.6, 0, W * 0.4, H, ink); }
      else { draw3d(0, 0, W, H * 0.62, z, ink); drawShadow(0, H * 0.62, W, H * 0.38, ink); }
      const k = found ? spare : st.m > 0 ? spareScale(shadow(V, st.qo, [0, 0]), shadow(V, st.qi, st.t)) : 0;
      $('num').textContent = `試した向き ${tries.toLocaleString()} 回 ・ やり直し ${restarts} 回 ・ いちばん狭い所のすき間 ${st.m >= 0 ? '+' : ''}${st.m.toFixed(3)}` +
        (st.m > 0 ? ` ・ 内側を ${((k - 1) * 100).toFixed(1)}% 大きくしても通る` : '（影がはみ出している）');
      requestAnimationFrame(frame);
    }
    c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch }; c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing'; });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      view.yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
      view.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch - (e.clientY - drag.y) * 0.01));
    });
    const release = () => { drag = null; c.style.cursor = ''; };
    c.addEventListener('pointerup', release); c.addEventListener('pointercancel', release);
    $('shape').addEventListener('change', start);
    $('again').addEventListener('click', start);
    $('pass').addEventListener('click', () => { passAt = performance.now(); passes = 0; });
    start();
    requestAnimationFrame(frame);
  },
});
