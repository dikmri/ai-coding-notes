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

dekiru.add({
  id: 'tr-20261118-mutation-test', c: 'trend', lv: 3, date: '2026-11-18',
  t: 'コードをわざと書き換えて、テストが気づくかを調べる（ミューテーションテスト）', y: 'みゅーてーしょんてすと こーどをわざとかきかえててすとがきづくかしらべる',
  tags: ['ミューテーションテスト', '@mizchi/mutator', '構文解析', 'テストの質', 'container queries'],
  d: 'mizchi さんが 2026年11月17日に Zenn へ書いた「おい、 Mutation Test をやれ」が、日別の人気記事の1位になった。ミューテーションテストは、コードの演算子などを1か所だけわざと書き換えた「変異」を作り、テストが落ちるか（書き換えに気づくか）を調べて、テストの質を測る方法である。この見本では、小さな関数を自前の構文解析器で読み、比較・計算・論理の演算子の置き換え、true と false の入れ替え、条件を true や false に固定する変異を作って、全部のテストを流す。生き残った変異には、元のコードと答えが変わる入力を総当たりで探し、テストに足せる。どの入力でも答えが変わらない変異は「等価の変異」として点数から外す。元の道具の @mizchi/mutator は Vitest のテストを TypeScript のコードに対して流し、変えた所だけを調べて速くしている。この見本が読めるのは if と return だけの小さな関数で、等価かどうかも決めた範囲の入力でしか確かめていない。',
  p: 'コードは1回だけ構文木にし、変異は「この節点の代わりにこの節点を使う」という差し替えとして持つ。評価する関数はその節点に来たときだけ差し替えるので、変異ごとにコードを組み立て直したり eval したりしなくて済む。答えは Object.is で比べる（Vitest の toBe と同じ）。倒す入力は、関数に出てくる数の前後（境界値）を先に試し、見つからなければ範囲全体を調べる。画面の並びは container queries で、表示枠の幅に合わせて2列と1列を切り替える。',
  refs: [
    { title: 'おい、 Mutation Test をやれ。テスト品質を、測るために（Zenn・mizchi）', url: 'https://zenn.dev/mizchi/articles/mutation-test-quality' },
    { title: 'mizchi/mutator（GitHub）', url: 'https://github.com/mizchi/mutator' },
    { title: 'mizchi/mutator を入れてみた（Zenn）', url: 'https://zenn.dev/polyco/articles/e05cb28c569801' },
  ],
  html: `<div class="app">
  <div class="bar">
    <label>関数 <select id="pick"></select></label>
    <button id="run" type="button">テストを流す</button>
    <button id="fix" type="button">生き残りを倒すテストを足す</button>
    <button id="reset" type="button">最初に戻す</button>
  </div>
  <p id="msg" role="status"></p>
  <div class="score"><meter id="meter" min="0" max="100" low="60" high="80" optimum="100" value="0" aria-label="変異を倒した割合"></meter><span id="score"></span></div>
  <div class="cols">
    <section aria-labelledby="h-code">
      <h2 id="h-code">関数のコード（変異を選ぶと、書き換えた所を示す）</h2>
      <div class="src"><pre class="gut" id="gut" aria-hidden="true"></pre><pre id="code"></pre></div>
      <details>
        <summary>コードを書き換える</summary>
        <textarea id="edit" rows="7" spellcheck="false" aria-label="関数のコード"></textarea>
        <button id="apply" type="button">このコードで変異を作り直す</button>
        <p id="err" class="fail" aria-live="polite"></p>
        <p class="note">使えるのは if (条件) return 値; と return 値; だけ。式には数、true と false、引数、+ - * / %、比較、&amp;&amp; || !、三項演算子を書ける。</p>
      </details>
      <h2 id="h-tests">テスト（入力 → 期待する答え）</h2>
      <ul id="tests" aria-labelledby="h-tests"></ul>
      <div class="add" id="add"></div>
      <p class="note">足すテストの期待する答えには、いまのコードの答えをそのまま使う。</p>
    </section>
    <section>
      <div class="tw" tabindex="0" role="region" aria-labelledby="cap">
        <table>
          <caption id="cap">作った変異と結果</caption>
          <thead><tr><th scope="col">変異</th><th scope="col">行</th><th scope="col">種類</th><th scope="col">結果</th></tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <div id="detail"></div>
    </section>
  </div>
</div>`,
  css: `:root { color-scheme: dark; --bg: #0f1420; --panel: #161d2d; --line: #2a3450; --ink: #dfe6ff; --dim: #97a2c4; --ok: #5ee69a; --bad: #ffab66; --eq: #b4bddc; --now: #8cc0ff; }
    body { margin: 0; background: var(--bg); color: var(--ink); font: 13px/1.5 system-ui, sans-serif; }
    .app { container-type: inline-size; padding: 10px; display: grid; gap: 8px; }
    .bar { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
    button, select, input, textarea { font: inherit; color: inherit; }
    button { background: #24304d; border: 1px solid #3a4870; border-radius: 6px; padding: 3px 10px; cursor: pointer; }
    button:hover { background: #2e3c60; }
    select, input[type=number], textarea { background: #0b0f19; border: 1px solid #3a4870; border-radius: 6px; padding: 2px 6px; }
    #msg { margin: 0; min-height: 1.5em; }
    .score { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-variant-numeric: tabular-nums; }
    meter { inline-size: 160px; block-size: 12px; }
    .cols { display: grid; gap: 10px; }
    @container (min-width: 640px) { .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); } }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; min-inline-size: 0; }
    h2 { font-size: 12px; color: var(--dim); margin: 4px 0; font-weight: 600; }
    .src { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0 10px; overflow-x: auto; }
    .src pre { margin: 0; font: 12px/1.6 ui-monospace, Consolas, monospace; }
    .gut { color: #5d6890; text-align: end; user-select: none; }
    .gut .hit { color: var(--now); font-weight: 700; }
    del { background: rgba(255, 110, 120, 0.22); color: #ffc0c6; text-decoration: line-through; }
    ins { background: rgba(94, 230, 154, 0.2); color: #b6f7d2; text-decoration: underline; }
    details { margin: 6px 0; }
    summary { cursor: pointer; color: var(--dim); }
    textarea { display: block; inline-size: 100%; box-sizing: border-box; margin: 4px 0; font: 12px/1.5 ui-monospace, Consolas, monospace; resize: vertical; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
    li { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; border-radius: 4px; padding: 0 4px; }
    li label { display: inline-flex; gap: 6px; align-items: center; }
    li.fresh { background: rgba(94, 230, 154, 0.12); }
    code { font: 12px ui-monospace, Consolas, monospace; }
    button.del { padding: 0 6px; font-size: 12px; }
    .add { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; margin-top: 6px; }
    .add input[type=number] { inline-size: 6.5em; }
    .note { color: var(--dim); margin: 4px 0 0; font-size: 12px; }
    .fail { color: #ff9aa3; margin: 0; }
    .tw { container-type: inline-size; overflow: auto; max-block-size: 22em; }
    table { border-collapse: separate; border-spacing: 0; inline-size: 100%; }
    caption { text-align: start; color: var(--dim); font-weight: 600; font-size: 12px; padding-block-end: 4px; }
    th, td { text-align: start; padding: 3px 6px; border-block-end: 1px solid var(--line); white-space: nowrap; }
    thead th { position: sticky; inset-block-start: 0; background: var(--panel); color: var(--dim); font-weight: 600; z-index: 1; }
    tbody th { font-weight: normal; white-space: normal; }
    tbody th button { font: 12px ui-monospace, Consolas, monospace; padding: 1px 6px; text-align: start; }
    tr.sel { background: rgba(140, 192, 255, 0.12); }
    .killed { color: var(--ok); }
    .survived { color: var(--bad); font-weight: 700; }
    .equiv { color: var(--eq); }
    .wait { color: #6b76a0; }
    .now { color: var(--now); }
    @container (width < 360px) {
      table, thead, tbody, tr, th, td { display: block; }
      thead { display: none; }
      tr { border: 1px solid var(--line); border-radius: 6px; margin-block-end: 6px; }
      th, td { border: 0; padding: 1px 6px; }
      td:nth-child(2)::before { content: "行: "; color: var(--dim); }
      td:nth-child(3)::before { content: "種類: "; color: var(--dim); }
      td:nth-child(4)::before { content: "結果: "; color: var(--dim); }
    }
    #detail { margin-top: 8px; display: grid; gap: 4px; }
    #detail p { margin: 0; }`,
  core() {
    // ---- 字句に分ける（数・名前・記号）----
    // 「=」は式では使えないが、let a = 1; のような文に「使える形」を案内できるよう記号として読む
    const OPS = ['===', '!==', '<=', '>=', '&&', '||', '<', '>', '=', '+', '-', '*', '/', '%', '!', '(', ')', '{', '}', ',', ';', '?', ':'];
    const NUM = /\d+(?:\.\d+)?/y, NAME = /[A-Za-z_$][\w$]*/y, SPACE = /\s+/y;
    function lineOf(src, pos) { return src.slice(0, pos).split('\n').length; }
    function tokenize(src) {
      const out = [];
      let i = 0;
      while (i < src.length) {
        SPACE.lastIndex = i;
        if (SPACE.test(src)) { i = SPACE.lastIndex; continue; }
        if (src.startsWith('//', i)) { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
        let m;
        NUM.lastIndex = i;
        if ((m = NUM.exec(src))) { out.push({ t: 'num', v: Number(m[0]), s: i, e: NUM.lastIndex }); i = NUM.lastIndex; continue; }
        NAME.lastIndex = i;
        if ((m = NAME.exec(src))) { out.push({ t: 'name', v: m[0], s: i, e: NAME.lastIndex }); i = NAME.lastIndex; continue; }
        const op = OPS.find((o) => src.startsWith(o, i));
        if (!op) throw new SyntaxError(`${lineOf(src, i)} 行目: 読めない文字「${src[i]}」`);
        out.push({ t: 'op', v: op, s: i, e: i + op.length });
        i += op.length;
      }
      return out;
    }
    // ---- 構文木を作る。読めるのは if (条件) return 値; と return 値; だけ ----
    const PREC = { '||': 1, '&&': 2, '===': 3, '!==': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
    function parse(src) {
      const T = tokenize(src), params = [];
      let p = 0;
      const at = (v) => p < T.length && T[p].v === v;
      const fail = (msg) => { throw new SyntaxError((p < T.length ? `${lineOf(src, T[p].s)} 行目: ` : '最後で: ') + msg); };
      const eat = (v) => { if (!at(v)) fail(`「${v}」が要ります`); return T[p++]; };
      const name = () => { if (p >= T.length || T[p].t !== 'name') fail('名前が要ります'); return T[p++].v; };
      function primary() {
        const tk = T[p];
        if (!tk) return fail('値が要ります');
        if (tk.v === '!' || tk.v === '-') { p++; const a = primary(); return { k: tk.v === '!' ? 'not' : 'neg', a, s: tk.s, e: a.e, os: tk.s, oe: tk.e }; }
        if (tk.v === '(') { p++; const a = expr(); const end = eat(')'); return { ...a, s: tk.s, e: end.e }; }
        if (tk.t === 'num') { p++; return { k: 'num', v: tk.v, s: tk.s, e: tk.e }; }
        if (tk.v === 'true' || tk.v === 'false') { p++; return { k: 'bool', v: tk.v === 'true', s: tk.s, e: tk.e }; }
        if (tk.t === 'name' && params.includes(tk.v)) { p++; return { k: 'var', name: tk.v, s: tk.s, e: tk.e }; }
        return fail(tk.t === 'name' ? `「${tk.v}」は引数にありません` : `ここに「${tk.v}」は書けません`);
      }
      // 演算子の強さの順に読む（強いものほど先にまとまる）
      function binary(min) {
        let a = primary();
        for (;;) {
          const tk = T[p], pr = tk && tk.t === 'op' ? PREC[tk.v] : 0;
          if (!pr || pr < min) return a;
          p++;
          const b = binary(pr + 1);
          a = { k: 'bin', op: tk.v, a, b, s: a.s, e: b.e, os: tk.s, oe: tk.e };
        }
      }
      function expr() {
        const c = binary(1);
        if (!at('?')) return c;
        p++;
        const a = expr();
        eat(':');
        const b = expr();
        return { k: 'cond', c, a, b, s: c.s, e: b.e };
      }
      function ret() { eat('return'); const r = expr(); return { r, end: eat(';').e }; }
      eat('function');
      const fname = name();
      eat('(');
      while (!at(')')) { if (params.length) eat(','); params.push(name()); }
      eat(')');
      eat('{');
      const body = [];
      while (!at('}')) {
        if (p >= T.length) fail('「}」が要ります');
        const s = T[p].s;
        if (at('if')) {
          p++;
          eat('(');
          const c = expr();
          eat(')');
          const brace = at('{');
          if (brace) p++;
          const { r, end } = ret();
          body.push({ k: 'if', c, r, s, e: brace ? eat('}').e : end });
        } else if (at('return')) {
          const { r, end } = ret();
          body.push({ k: 'ret', r, s, e: end });
        } else fail('使えるのは「if (条件) return 値;」と「return 値;」だけです');
      }
      eat('}');
      if (p < T.length) fail('関数の後ろに余分なものがあります');
      return { name: fname, params, body, src };
    }
    // ---- 評価する。sw = { node, repl } を渡すと、node の所だけ repl を使う（これが変異）----
    function evaluate(n, env, sw) {
      if (sw && n === sw.node) n = sw.repl;
      const v = (x) => evaluate(x, env, sw);
      switch (n.k) {
        case 'num': case 'bool': return n.v;
        case 'var': return env[n.name];
        case 'not': return !v(n.a);
        case 'neg': return -v(n.a);
        case 'cond': return v(n.c) ? v(n.a) : v(n.b);
        case 'bin': {
          if (n.op === '&&') return v(n.a) && v(n.b);
          if (n.op === '||') return v(n.a) || v(n.b);
          const a = v(n.a), b = v(n.b);
          switch (n.op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': return a / b;
            case '%': return a % b;
            case '<': return a < b;
            case '<=': return a <= b;
            case '>': return a > b;
            case '>=': return a >= b;
            case '===': return a === b;
            case '!==': return a !== b;
          }
        }
      }
      throw new Error('知らない形: ' + n.k + (n.op ? ' ' + n.op : ''));
    }
    function run(fn, args, sw) {
      const env = Object.create(null);
      fn.params.forEach((name, i) => { env[name] = args[i]; });
      for (const st of fn.body) if (st.k === 'ret' || evaluate(st.c, env, sw)) return evaluate(st.r, env, sw);
      return undefined;
    }
    // ---- 変異を作る。1つの変異は「この節点の代わりにこの節点を使う」という差し替え ----
    const SWAP = { '<': ['<=', '>='], '<=': ['<', '>'], '>': ['>=', '<='], '>=': ['>', '<'], '===': ['!=='], '!==': ['==='], '+': ['-'], '-': ['+'], '*': ['/'], '/': ['*'], '%': ['*'], '&&': ['||'], '||': ['&&'] };
    const BOUND = ['<:<=', '<=:<', '>:>=', '>=:>'];
    function kindOf(from, to) {
      if (BOUND.includes(from + ':' + to)) return '境界';
      if (['<', '<=', '>', '>=', '===', '!=='].includes(from)) return '比較の反転';
      return from === '&&' || from === '||' ? '論理' : '計算';
    }
    function listMutants(fn) {
      const out = [], src = fn.src;
      const add = (node, repl, s, e, to, kind) => out.push({ node, repl, s, e, from: src.slice(s, e), to, kind, line: lineOf(src, s) });
      // 条件を true と false に固定する
      const fix = (c) => {
        if (c.k === 'bool') return;
        add(c, { k: 'bool', v: true }, c.s, c.e, 'true', '条件を固定');
        add(c, { k: 'bool', v: false }, c.s, c.e, 'false', '条件を固定');
      };
      const walk = (n) => {
        if (n.k === 'bin') {
          walk(n.a);
          for (const op of SWAP[n.op]) add(n, { ...n, op }, n.os, n.oe, op, kindOf(n.op, op));
          walk(n.b);
        } else if (n.k === 'bool') add(n, { k: 'bool', v: !n.v }, n.s, n.e, String(!n.v), '真偽の反転');
        else if (n.k === 'not' || n.k === 'neg') { add(n, n.a, n.os, n.oe, '', n.k === 'not' ? '否定を外す' : '符号を外す'); walk(n.a); }
        else if (n.k === 'cond') { fix(n.c); walk(n.c); walk(n.a); walk(n.b); }
      };
      for (const st of fn.body) {
        if (st.k === 'if') { fix(st.c); walk(st.c); }
        walk(st.r);
      }
      return out.map((m, id) => ({ ...m, id }));
    }
    function mutatedSource(src, m) { return src.slice(0, m.s) + m.to + src.slice(m.e); }
    // ---- テストを流す。答えは Object.is で比べる（Vitest の toBe と同じ）----
    function check(fn, t, sw) {
      let got;
      try { got = run(fn, t.args, sw); } catch (err) { return { ok: false, err: true }; }
      return { ok: Object.is(got, t.expect), got };
    }
    // 外したテスト（on が false）は流さない。最初に落ちたテストで「倒した」とする
    function judge(fn, m, tests) {
      const sw = { node: m.node, repl: m.repl };
      for (let i = 0; i < tests.length; i++) if (tests[i].on !== false && !check(fn, tests[i], sw).ok) return { status: 'killed', by: i };
      return { status: 'survived', by: -1 };
    }
    // ---- 倒す入力を探す。関数に出てくる数の前後（境界値）を先に、範囲全体を後に試す ----
    function valuesOf(d) {
      if (d.type === 'bool') return [false, true];
      const v = [];
      for (let x = d.min; x <= d.max; x++) v.push(x);
      return v.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
    }
    function literals(fn) {
      const out = [];
      const walk = (n) => {
        if (!n) return;
        if (n.k === 'num' && !out.includes(n.v)) out.push(n.v);
        walk(n.a); walk(n.b); walk(n.c);
      };
      for (const st of fn.body) { walk(st.c); walk(st.r); }
      return out;
    }
    function tryAll(lists, test) {
      const args = [];
      const go = (i) => {
        if (i === lists.length) return test(args.slice());
        for (const v of lists[i]) { args[i] = v; const r = go(i + 1); if (r) return r; }
        return null;
      };
      return go(0);
    }
    function findWitness(fn, m, domain) {
      const sw = { node: m.node, repl: m.repl }, lits = literals(fn), all = domain.map(valuesOf);
      const near = all.map((vals, i) => {
        const d = domain[i];
        if (d.type === 'bool') return vals;
        const pick = [];
        for (const n of lits) for (const v of [n - 1, n, n + 1]) if (v >= d.min && v <= d.max && !pick.includes(v)) pick.push(v);
        return pick.length ? pick : vals;
      });
      const answer = (s, args) => { try { return { v: run(fn, args, s) }; } catch (err) { return { err: true }; } };
      const differs = (args) => {
        const a = answer(null, args), b = answer(sw, args);
        if (a.err) return null; // 元のコードが答えを出せない入力は使わない
        return b.err || !Object.is(a.v, b.v) ? { args, expect: a.v, got: b.err ? '例外' : b.v } : null;
      };
      return tryAll(near, differs) || tryAll(all, differs);
    }
    // 点数 = 倒した ÷ (倒した + 生き残り)。等価の変異は数えない
    function score(results) {
      const n = (s) => results.filter((r) => r.status === s).length;
      const killed = n('killed'), survived = n('survived'), equiv = n('equiv');
      return { killed, survived, equiv, pct: killed + survived ? Math.round((killed / (killed + survived)) * 100) : null };
    }
    function sameArgs(a, b) { return a.length === b.length && a.every((v, i) => Object.is(v, b[i])); }
    function fmt(v) { return Object.is(v, -0) ? '-0' : String(v); }
    // 見本の関数。domain は倒す入力を探す範囲、tests は最初から入っているテスト（[引数, 期待する答え]）
    const SAMPLES = [
      { key: 'leap', title: 'うるう年かどうか',
        code: ['function isLeap(y) {', '  if (y % 400 === 0) return true;', '  if (y % 100 === 0) return false;', '  return y % 4 === 0;', '}'].join('\n'),
        domain: [{ type: 'int', min: 1, max: 2400, start: 2000 }], tests: [[[2024], true], [[2023], false]] },
      { key: 'ship', title: '送料（5000円を超えるか、会員は3000円から無料）',
        code: ['function shipping(price, member) {', '  if (member && price >= 3000) return 0;', '  if (price > 5000) return 0;', '  if (price < 1000) return 500;', '  return 300;', '}'].join('\n'),
        domain: [{ type: 'int', min: 0, max: 10000, start: 3000 }, { type: 'bool' }], tests: [[[500, false], 500], [[2000, false], 300], [[8000, false], 0], [[4000, true], 0]] },
      { key: 'gap', title: '2つの数の差（大きい方から小さい方を引く）',
        code: ['function gap(a, b) {', '  return a > b ? a - b : b - a;', '}'].join('\n'),
        domain: [{ type: 'int', min: -10, max: 10, start: 4 }, { type: 'int', min: -10, max: 10, start: 7 }], tests: [[[5, 2], 3]] },
    ];
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const LABEL = { wait: '待ち', now: '流しています', killed: '倒した', survived: '生き残り', equiv: '等価' };
    let S = null, fn = null, mutants = [], tests = [], results = [], sel = -1, token = 0, timer = 0, nextId = 0, said = '', demoAt = 0;
    const equiv = new Set(), wit = new Map();
    function el(tag, props, ...kids) { const n = document.createElement(tag); if (props) Object.assign(n, props); n.append(...kids); return n; }
    function btn(text, key, onclick) { const b = el('button', { type: 'button', textContent: text, onclick }); b.dataset.f = key; return b; }
    function say(t) { if (t !== said) { $('msg').textContent = t; said = t; } }
    const call = (args) => `${fn.name}(${args.map(fmt).join(', ')})`;
    const rangeText = () => S.domain.map((d, i) => (d.type === 'bool' ? `${fn.params[i]} = true / false` : `${fn.params[i]} = ${d.min}〜${d.max}`)).join('、');
    const broken = () => tests.filter((t) => t.on && !check(fn, t).ok);
    function clearFresh() { for (const t of tests) t.fresh = false; }
    // 作り直す前にフォーカスのあった部品を覚えておき、作り直した後に同じ部品へ戻す（キーボードで操作している人のため）
    function keepFocus(box, build) {
      const a = document.activeElement, key = a && box.contains(a) ? a.dataset.f : '';
      build();
      if (key) { const n = box.querySelector(`[data-f="${key}"]`); if (n) n.focus(); }
    }

    function load(i) {
      S = SAMPLES[i];
      $('pick').value = String(i);
      tests = S.tests.map(([args, expect]) => ({ id: nextId++, args, expect, on: true }));
      $('edit').value = S.code;
      $('err').textContent = '';
      setCode(parse(S.code));
    }
    function setCode(f) {
      token++;
      clearTimeout(timer);
      fn = f;
      mutants = listMutants(fn);
      equiv.clear();
      wit.clear();
      results = mutants.map(() => ({ status: 'wait' }));
      sel = -1;
      buildAdd();
      renderTests();
      renderAll();
    }
    // テストを足す欄: 引数ごとに入力を1つ作る
    function buildAdd() {
      const kids = S.domain.map((d, i) => {
        const inp = d.type === 'bool' ? el('input', { type: 'checkbox' }) : el('input', { type: 'number', min: d.min, max: d.max, step: 1, value: d.start, required: true });
        return el('label', null, `${fn.params[i]} `, inp);
      });
      $('add').replaceChildren(...kids, el('button', { type: 'button', id: 'addbtn', textContent: 'このテストを足す', onclick: addFromForm }));
    }
    function addFromForm() {
      const ins = [...$('add').querySelectorAll('input')];
      const bad = ins.findIndex((n) => !n.checkValidity());
      if (bad >= 0) { say(`${fn.params[bad]} には ${S.domain[bad].min}〜${S.domain[bad].max} の整数を入れてください`); return; }
      clearFresh();
      if (addTest(ins.map((n, i) => (S.domain[i].type === 'bool' ? n.checked : n.valueAsNumber)))) { renderTests(); runAll(true, null, 45); }
    }
    // 期待する答えには、いまのコードの答えを使う
    function addTest(args, quiet) {
      const old = tests.find((t) => sameArgs(t.args, args));
      if (old && old.on) { if (!quiet) say(`${call(args)} のテストはもうあります`); return false; }
      if (old) { old.on = true; old.fresh = true; return true; }
      tests.push({ id: nextId++, args, expect: run(fn, args), on: true, fresh: true });
      return true;
    }

    // 全部の変異に全部のテストを流す。animate のときは1つずつ順に結果を出す
    function runAll(animate, done, delay) {
      const my = ++token;
      clearTimeout(timer);
      renderTests();
      const bad = broken();
      if (bad.length) {
        results = mutants.map(() => ({ status: 'wait' }));
        renderAll();
        say(`元のコードで落ちるテストが ${bad.length} 件あります。変異を調べる前に、元のコードでテストが全部通るようにしてください（そのテストを外すか、コードを直す）`);
        if (done) done();
        return;
      }
      const next = mutants.map((m) => { const r = judge(fn, m, tests); return r.status === 'survived' && equiv.has(m.id) ? { ...r, status: 'equiv' } : r; });
      const finish = () => {
        results = next;
        const s = results.findIndex((r) => r.status === 'survived');
        if (s >= 0) sel = s;
        else if (sel >= mutants.length) sel = -1;
        renderAll();
        const sc = score(results);
        if (!mutants.length) say('このコードには書き換えられる所がありません');
        else if (sc.survived) say(`${mutants.length} 個の変異のうち ${sc.survived} 個が生き残りました。テストが見逃している書き換えです`);
        else say(`生き残った変異はありません${sc.equiv ? `（等価の変異 ${sc.equiv} 個は点数に入れていません）` : ''}`);
        if (done) done();
      };
      if (!animate || calm.matches || !mutants.length) { finish(); return; }
      say(`変異を1つずつ作り、テストを ${tests.filter((t) => t.on).length} 件ずつ流しています`);
      results = mutants.map(() => ({ status: 'wait' }));
      let k = 0;
      const step = () => {
        if (my !== token) return;
        if (k > 0) results[k - 1] = next[k - 1];
        if (k === mutants.length) { finish(); return; }
        results[k] = { status: 'now' };
        sel = k;
        k++;
        renderAll();
        timer = setTimeout(step, delay || 110);
      };
      step();
    }
    // 生き残った変異ごとに倒す入力を探してテストに足す。見つからなければ等価の変異とする
    function autoFix(done) {
      token++;
      clearTimeout(timer);
      if (broken().length) { runAll(false, done); return; }
      clearFresh();
      let added = 0, eq = 0;
      for (const m of mutants) {
        if (equiv.has(m.id) || judge(fn, m, tests).status === 'killed') continue;
        if (!wit.has(m.id)) wit.set(m.id, findWitness(fn, m, S.domain));
        const w = wit.get(m.id);
        if (!w) { equiv.add(m.id); eq++; continue; }
        if (addTest(w.args, true)) added++;
      }
      runAll(true, () => {
        if (added || eq) say(`テストを ${added} 件足しました${eq ? `。${eq} 個は、どの入力でも答えが同じ等価の変異でした` : ''}`);
        if (done) done();
      }, 60);
    }
    function findFor(m) {
      const w = findWitness(fn, m, S.domain);
      wit.set(m.id, w);
      if (w) { say(`${call(w.args)} で、元のコードと変異したコードの答えが分かれます`); return; }
      equiv.add(m.id);
      const i = mutants.indexOf(m);
      if (results[i] && results[i].status === 'survived') results[i] = { ...results[i], status: 'equiv' };
      say(`${rangeText()} の入力を全部試しても、答えが分かれませんでした。等価の変異です`);
    }

    function renderAll() { renderCode(); renderRows(); renderDetail(); renderScore(); }
    // コード: 選んだ変異の所を、消した文字（del）と入れた文字（ins）で示す
    function renderCode() {
      const m = mutants[sel], src = fn.src, lines = src.split('\n');
      $('gut').replaceChildren(...lines.map((_, i) => el('span', { className: m && m.line === i + 1 ? 'hit' : '', textContent: `${i + 1}${i + 1 < lines.length ? '\n' : ''}` })));
      if (!m) { $('code').textContent = src; return; }
      $('code').replaceChildren(src.slice(0, m.s), el('del', { textContent: m.from }), el('ins', { textContent: m.to }), src.slice(m.e));
    }
    function renderRows() {
      keepFocus($('rows'), () => $('rows').replaceChildren(...mutants.map((m, i) => {
        const r = results[i] || { status: 'wait' };
        const b = btn(`${m.from} → ${m.to || '（消す）'}`, 'm' + i, () => { sel = i; renderAll(); });
        if (i === sel) b.setAttribute('aria-current', 'true');
        return el('tr', { className: i === sel ? 'sel' : '' }, el('th', { scope: 'row' }, b), el('td', { textContent: String(m.line) }), el('td', { textContent: m.kind }), el('td', { className: r.status, textContent: LABEL[r.status] }));
      })));
    }
    function renderDetail() {
      const box = $('detail'), m = mutants[sel];
      keepFocus(box, () => {
        if (!m) { box.replaceChildren(el('p', { className: 'note', textContent: '表の「変異」を押すと、コードのどこを書き換えたかと、どのテストが気づいたかを表示します。' })); return; }
        const r = results[sel] || { status: 'wait' };
        const what = m.to ? `「${m.from}」を「${m.to}」に変える` : `「${m.from}」を消す`;
        const kids = [el('p', null, el('strong', { textContent: `${m.line} 行目の${what}` }), `（${m.kind}）`)];
        const w = wit.get(m.id);
        if (r.status === 'killed') {
          const t = tests[r.by], got = check(fn, t, { node: m.node, repl: m.repl });
          kids.push(el('p', { className: 'killed', textContent: `テスト ${call(t.args)} → ${fmt(t.expect)} が気づいて、この変異を倒しました。変異したコードは ${got.err ? '例外' : fmt(got.got)} を返しました。` }));
        } else if (r.status === 'equiv' || (r.status === 'survived' && w === null)) {
          kids.push(el('p', { className: 'equiv', textContent: `${rangeText()} のどの入力でも、元のコードと同じ答えになりました。等価の変異なので、テストを足しても倒せません。点数からは外します。` }));
        } else if (r.status === 'survived' && w) {
          kids.push(el('p', { className: 'survived', textContent: `どのテストも気づきませんでした。${call(w.args)} のとき、元のコードは ${fmt(w.expect)}、変異したコードは ${fmt(w.got)} を返します。` }));
          kids.push(el('p', null, btn('この入力をテストに足す', 'addw', () => { clearFresh(); if (addTest(w.args)) { renderTests(); runAll(true, null, 45); } })));
        } else if (r.status === 'survived') {
          kids.push(el('p', { className: 'survived', textContent: 'どのテストも、この書き換えに気づきませんでした。' }));
          kids.push(el('p', null, btn('倒す入力を探す', 'find', () => {
            findFor(m);
            renderAll();
            const n = box.querySelector('[data-f="addw"]') || $('rows').querySelector(`[data-f="m${sel}"]`);
            if (n) n.focus();
          })));
        } else kids.push(el('p', { className: r.status === 'now' ? 'now' : 'note', textContent: r.status === 'now' ? 'この変異にテストを流しています' : 'まだテストを流していません' }));
        box.replaceChildren(...kids);
      });
    }
    function renderScore() {
      const sc = score(results), done = results.length > 0 && results.every((r) => r.status !== 'wait' && r.status !== 'now');
      $('meter').value = done && sc.pct !== null ? sc.pct : 0;
      $('score').textContent = `変異 ${mutants.length} 個 ・ 倒した ${sc.killed} ・ 生き残り ${sc.survived} ・ 等価 ${sc.equiv}` + (done && sc.pct !== null ? ` ・ 点数 ${sc.pct}%` : '');
    }
    function renderTests() {
      keepFocus($('tests'), () => {
        const items = tests.map((t) => {
          const cb = el('input', { type: 'checkbox', checked: t.on, onchange: () => { t.on = cb.checked; runAll(false); } });
          cb.dataset.f = `t${t.id}`;
          const del = el('button', { type: 'button', className: 'del', textContent: '消す', onclick: () => {
            const i = tests.indexOf(t);
            tests.splice(i, 1);
            runAll(false);
            const rest = $('tests').querySelectorAll('button.del');
            const n = rest[Math.min(i, rest.length - 1)] || $('addbtn');
            if (n) n.focus();
          } });
          del.setAttribute('aria-label', `テスト ${call(t.args)} を消す`);
          const li = el('li', { className: t.fresh ? 'fresh' : '' }, el('label', null, cb, el('code', { textContent: `${call(t.args)} → ${fmt(t.expect)}` })), del);
          const c = t.on ? check(fn, t) : null;
          if (c && !c.ok) li.append(el('span', { className: 'fail', textContent: `元のコードでは ${c.err ? '例外' : fmt(c.got)} になり、落ちます` }));
          return li;
        });
        if (!items.length) items.push(el('li', { className: 'note', textContent: 'テストがありません。これでは、どの変異も生き残ります。' }));
        $('tests').replaceChildren(...items);
      });
    }

    SAMPLES.forEach((s, i) => $('pick').append(new Option(s.title, String(i))));
    $('pick').addEventListener('change', () => { load(+$('pick').value); runAll(true); });
    $('run').addEventListener('click', () => runAll(true));
    $('fix').addEventListener('click', () => autoFix());
    $('reset').addEventListener('click', () => { load(+$('pick').value); runAll(true); });
    $('apply').addEventListener('click', () => {
      let f;
      try { f = parse($('edit').value); } catch (err) { $('err').textContent = err.message; return; }
      if (f.params.length !== S.domain.length) { $('err').textContent = `引数は ${S.domain.length} 個のままにしてください（いまは ${f.params.length} 個）`; return; }
      $('err').textContent = '';
      setCode(f);
      runAll(true);
    });
    // 一覧の小窓では、テストを流す → 生き残りを倒すテストを足す → 次の関数、を繰り返して見せる
    function demo() {
      runAll(true, () => setTimeout(() => {
        if (score(results).survived) autoFix(() => setTimeout(nextDemo, 2600));
        else setTimeout(nextDemo, 1600);
      }, 1400), 90);
    }
    function nextDemo() { demoAt = (demoAt + 1) % SAMPLES.length; load(demoAt); demo(); }
    load(0);
    if (window.THUMB) demo();
    else runAll(true);
  },
});
