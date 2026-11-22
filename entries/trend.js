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

dekiru.add({
  id: 'tr-20261118-romer-light', c: 'trend', lv: 3, date: '2026-11-18',
  t: '木星の衛星イオの時刻のずれから、光の速さを測る', y: 'もくせいのえいせいいおのじこくのずれからひかりのはやさをはかる',
  tags: ['Ole Rømer', '光の速さ', '最小二乗法', '天体の軌道', 'canvas'],
  d: '1676年、デンマークの天文学者オーレ・レーマーは、木星の衛星イオが木星の影に入る時刻や影から出る時刻が、地球が木星から遠ざかる時期には予定より遅れ、近づく時期には早まることに気づいた。その年の9月には「11月9日にイオが影から出るのは、予定より10分遅れる」と予言して当て、光の速さに限りがあることを示した。それから350年という記事が、2026年11月に Hacker News で話題になった。この見本では、地球と木星を太陽のまわりで動かし、イオが影に出入りする瞬間を、光が地球に届くまでの時間だけ遅らせて「観測」する。たまった観測の時刻を式に当てはめ、光の速さを推定する。光の速さや時計の誤差を変えると、推定がどう変わるかを確かめられる。軌道は円で近似しており、楕円の軌道、木星の影の広がり、イオの大きさ、昼と夜の区別は扱っていない。晴れた夜かどうかは乱数で決めている。',
  p: 'イオは約1.77日ごとに木星の影に入るので、時計として使える。観測した時刻を「切片 ＋ 周期 × 回数 ＋ 遅れの係数 × 地球と木星の距離 ＋ 入るか出るかの補正」という式に当てはめ、4つの数を最小二乗法で同時に求める（正規方程式をガウスの消去法で解く）。遅れの係数は「光が1天文単位進むのにかかる時間」なので、1天文単位の長さをその秒数で割ると光の速さになる。係数の標準誤差も計算して ± で示す。グラフの点線は、求めた式から計算したこの先の予想で、レーマーの予言と同じ考え方である。',
  refs: [
    { title: '350 years ago, this man discovered that light has a finite speed（Science Norway）', url: 'https://www.sciencenorway.no/culture-history-history-of-science/350-years-ago-this-man-discovered-that-light-has-a-finite-speed/2737969' },
    { title: 'Hacker News: 350 years ago, Ole Rømer discovered that light has a finite speed', url: 'https://news.ycombinator.com/item?id=50536813' },
    { title: "Rømer's determination of the speed of light（Wikipedia）", url: 'https://en.wikipedia.org/wiki/R%C3%B8mer%27s_determination_of_the_speed_of_light' },
  ],
  html: `<div class="wrap">
  <canvas id="orbit" role="img" aria-label="太陽のまわりを回る地球と木星の図。右上は、木星のまわりを回るイオと木星の影の拡大図"></canvas>
  <div class="side">
    <div class="ui">
      <button type="button" id="play">止める</button>
      <button type="button" id="skip">最後まで進める</button>
      <button type="button" id="again">天気を変えてやり直す</button>
      <label>進み方 <select id="speed"><option value="3">1秒で3日</option><option value="12" selected>1秒で12日</option><option value="45">1秒で45日</option></select></label>
      <label>光の速さ <select id="light"><option value="1" selected>本当の速さ</option><option value="0.5">半分</option><option value="2">2倍</option><option value="inf">限りなく速い</option></select></label>
      <label>時計の誤差 <select id="noise"><option value="0">なし</option><option value="1" selected>±1分くらい</option><option value="3">±3分くらい</option></select></label>
    </div>
    <p id="date"></p>
    <canvas id="chart" role="img" aria-label="イオが影に入った時刻と影から出た時刻が、予定より何分ずれて見えたかのグラフ"></canvas>
    <p class="legend"><span class="in">●</span> 影に入るのを見た　<span class="out">●</span> 影から出るのを見た　<span class="fit">━</span> 距離から計算したずれ（点線はこの先の予想）　<span class="band">■</span> 木星が太陽の近くに見えて観測できない時期</p>
    <dl>
      <dt>いま光が届くまで</dt><dd id="now"></dd>
      <dt>推定した光の速さ</dt><dd id="est"></dd>
      <dt>地球の軌道の直径を光が横切る時間</dt><dd id="cross"></dd>
      <dt>比べる値</dt><dd id="ref"></dd>
    </dl>
  </div>
</div>`,
  css: `:root { color-scheme: dark; }
    body { margin: 0; background: #0b1020; color: #d6defc; font: 12px/1.5 system-ui, sans-serif; }
    .wrap { display: grid; grid-template-columns: minmax(0, 1fr); }
    #orbit { width: 100%; height: 56vh; display: block; }
    .side { padding: 6px 8px 10px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .ui { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
    p { margin: 0; }
    #date { color: #9aa6d0; font-variant-numeric: tabular-nums; }
    #chart { width: 100%; height: 190px; display: block; border-radius: 4px; }
    .legend { color: #9aa6d0; }
    .legend .in { color: #7fd1ff; } .legend .out { color: #ffb36b; } .legend .fit { color: #5ef0a0; } .legend .band { color: #2a335c; }
    dl { margin: 0; font-variant-numeric: tabular-nums; }
    dt { color: #9aa6d0; font-size: 11px; }
    dd { margin: 0 0 4px; }
    @media (min-width: 480px) and (min-aspect-ratio: 5 / 4) {
      .wrap { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); height: 100vh; }
      #orbit { height: 100vh; }
      .side { overflow: auto; }
      #chart { height: max(120px, 38vh); }
    }`,
  core() {
    // 単位: 時間は日、距離は天文単位（地球と太陽の平均の距離。1天文単位 = 約1億4960万 km）
    const AU_KM = 149597870.7, C_KMS = 299792.458;
    const LIGHT_DAY_PER_AU = AU_KM / C_KMS / 86400; // 光が1天文単位進むのにかかる日数（約8.32分）
    // 軌道は円で近似する。L0 は 2000年1月1日12時（世界時）の平均黄経（度）、P は公転周期（日）
    const EARTH = { r: 1, P: 365.256, L0: 100.464 };
    const JUPITER = { r: 5.2026, P: 4332.59, L0: 34.396 };
    const IO_P = 1.769137786; // イオが木星のまわりを1周する日数（星に対して）
    const IO_SYN = 1 / (1 / IO_P - 1 / JUPITER.P); // 影に入る間隔。木星も動くので少し長い（約1.76986日）
    const SHADOW = Math.asin(71492 / 421700); // イオの軌道から見た、木星の影の幅の半分（ラジアン）
    const HALF = (SHADOW / (2 * Math.PI)) * IO_SYN; // 影の真ん中から、入る・出る瞬間までの日数（約1.15時間）
    const IO_OFF = 0.3; // イオが最初にどこにいるか（決まった値でなくてよい）
    const START_MS = Date.UTC(1676, 0, 1), J2000_MS = Date.UTC(2000, 0, 1, 12);
    const MIN_ELONG = (25 * Math.PI) / 180; // 太陽からこれより近くに見える木星は、空が明るくて観測できないことにする
    // t は 1676年1月1日からの日数
    function angleOf(b, t) { return (b.L0 * Math.PI) / 180 + (2 * Math.PI * ((START_MS - J2000_MS) / 864e5 + t)) / b.P; }
    function posOf(b, t) { const a = angleOf(b, t); return [b.r * Math.cos(a), b.r * Math.sin(a)]; }
    // 時刻 tE の地球と、時刻 tJ の木星の距離
    function distAU(tE, tJ = tE) { const e = posOf(EARTH, tE), j = posOf(JUPITER, tJ); return Math.hypot(e[0] - j[0], e[1] - j[1]); }
    // 地球から見て、太陽と木星が何ラジアン離れて見えるか
    function elongation(t) {
      const e = posOf(EARTH, t), j = posOf(JUPITER, t), ax = -e[0], ay = -e[1], bx = j[0] - e[0], by = j[1] - e[1];
      return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)))));
    }
    function observable(t) { return elongation(t) > MIN_ELONG; }
    // 木星から見たイオの向き。木星の影は太陽と反対、つまり木星の黄経の向きにのびる
    function ioAngle(t) { return angleOf(JUPITER, t) + 2 * Math.PI * (t / IO_SYN - IO_OFF); }
    function ioInShadow(t) { let f = t / IO_SYN - IO_OFF; f -= Math.round(f); return Math.abs(f) * 2 * Math.PI < SHADOW; }
    // 時刻 t に木星のそばで起きたことが、地球で見える時刻。lag は1天文単位あたりの遅れ（日）
    function seenAt(t, lag) {
      let o = t + distAU(t, t) * lag;
      for (let i = 0; i < 2; i++) o = t + distAU(o, t) * lag;
      return o;
    }
    function dateOf(t) { const d = new Date(START_MS + t * 864e5); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
    // 決まった種から毎回同じ並びを出す乱数（天気と時計の誤差に使う）
    function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    // 観測の記録を作る。地球が木星に近づく時期は影に入る瞬間が、遠ざかる時期は影から出る瞬間が見える。
    // 天気と誤差の乱数は毎回同じ順に引くので、光の速さだけ変えても同じ夜が晴れる
    function simulate({ days, lag, noiseMin = 0, clear = 0.5, seed = 1 }) {
      const rand = seeded(seed), list = [];
      const gauss = () => { const u = Math.max(1e-12, rand()), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
      for (let k = 0; (k + IO_OFF) * IO_SYN <= days; k++) {
        const mid = (k + IO_OFF) * IO_SYN, sg = distAU(mid + 0.5) < distAU(mid - 0.5) ? -1 : 1;
        const t = mid + sg * HALF, seen = seenAt(t, lag), sky = rand(), err = (gauss() * noiseMin) / 1440;
        if (observable(seen) && sky < clear) { const o = seen + err; list.push({ k, sg, t, o, D: distAU(o) }); }
      }
      return list;
    }
    // 連立一次方程式 A x = b をガウスの消去法で解く。解けなければ null
    function solve(A, b) {
      const n = b.length, M = A.map((row, i) => [...row, b[i]]);
      for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        if (!(Math.abs(M[p][c]) > 1e-12)) return null;
        [M[c], M[p]] = [M[p], M[c]];
        for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
      }
      const x = new Array(n).fill(0);
      for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j]; x[r] = s / M[r][r]; }
      return x;
    }
    // 観測した時刻 o を「a ＋ P ×（回数 − 平均）＋ s ×（距離 − 平均）＋ h × 入る(-1)/出る(+1)」に当てはめる。
    // s が1天文単位あたりの光の遅れ（日）。距離があまり変わっていないうちは求めない
    function fitLight(obs) {
      const n = obs.length;
      if (n < 6) return null;
      let kM = 0, dM = 0, lo = Infinity, hi = -Infinity, ins = 0;
      for (const q of obs) { kM += q.k; dM += q.D; lo = Math.min(lo, q.D); hi = Math.max(hi, q.D); if (q.sg < 0) ins++; }
      kM /= n; dM /= n;
      if (hi - lo < 0.3) return null;
      const both = ins > 0 && ins < n, m = both ? 4 : 3;
      const row = (q) => (both ? [1, q.k - kM, q.D - dM, q.sg] : [1, q.k - kM, q.D - dM]);
      const A = Array.from({ length: m }, () => new Array(m).fill(0)), b = new Array(m).fill(0);
      for (const q of obs) { const x = row(q); for (let i = 0; i < m; i++) { b[i] += x[i] * q.o; for (let j = 0; j < m; j++) A[i][j] += x[i] * x[j]; } }
      const beta = solve(A, b);
      if (!beta) return null;
      let rss = 0;
      for (const q of obs) { const x = row(q); let f = 0; for (let i = 0; i < m; i++) f += x[i] * beta[i]; rss += (q.o - f) ** 2; }
      const v = n > m ? rss / (n - m) : 0, unit = new Array(m).fill(0);
      unit[2] = 1;
      const col = solve(A, unit), se = col ? Math.sqrt(Math.max(0, v * col[2])) : NaN;
      return { a: beta[0], P: beta[1], s: beta[2], h: both ? beta[3] : 0, kMean: kM, dMean: dM, se, n };
    }
    // 観測が、周期だけで決めた予定の時刻より何分遅れて見えたか
    function lateMin(q, f) { return (q.o - f.a - f.P * (q.k - f.kMean) - f.h * q.sg) * 1440; }
    // 1天文単位あたりの遅れ（日）から光の速さ（km/秒）へ
    function speedKms(s) { return s > 0 ? AU_KM / (s * 86400) : Infinity; }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const oc = $('orbit'), ox = oc.getContext('2d'), cc = $('chart'), cx = cc.getContext('2d');
    // 動きを減らす設定のときは、ボタンを押すまで時間を進めない
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const END = 365.25 * 3, FONT = '11px system-ui, sans-serif';
    const IN = '#7fd1ff', OUT = '#ffb36b', FIT = '#5ef0a0', DIM = '#9aa6d0';
    const man = (v) => (v >= 1e3 ? `${(v / 1e4).toFixed(2)}万` : `${Math.round(v)}`);
    let seed = 11, obs = [], shown = 0, fit = null, t = 0, last = 0, flash = -1, doneAt = -1;
    let playing = !!window.THUMB || !calm.matches;
    const said = {};
    function say(id, text) { if (said[id] !== text) { $(id).textContent = text; said[id] = text; } }
    function lagNow() { const v = $('light').value; return v === 'inf' ? 0 : LIGHT_DAY_PER_AU / Number(v); }
    // 観測できない時期（太陽と木星が近くに見える時期）を、グラフの帯にするため先に求めておく
    const bands = [];
    for (let d = 0, from = -1; d <= END + 1; d += 0.5) {
      const no = d <= END && !observable(d);
      if (no && from < 0) from = d;
      if (!no && from >= 0) { bands.push([from, d]); from = -1; }
    }
    function catchUp() {
      let added = false;
      while (shown < obs.length && obs[shown].o <= t) { shown++; added = true; }
      if (added) fit = fitLight(obs.slice(0, shown));
      return added;
    }
    function rebuild() { obs = simulate({ days: END, lag: lagNow(), noiseMin: Number($('noise').value), seed }); shown = 0; fit = null; catchUp(); }
    function fitCanvas(cv, g) {
      const W = Math.max(1, cv.clientWidth), H = Math.max(1, cv.clientHeight), dpr = Math.min(2, devicePixelRatio || 1);
      const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return [W, H];
    }
    function dot(g, p, r, color) { g.fillStyle = color; g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill(); }
    function seg(g, a, b) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    function drawOrbit(now) {
      const [W, H] = fitCanvas(oc, ox), g = ox;
      g.fillStyle = '#0b1020'; g.fillRect(0, 0, W, H);
      const R = Math.max(1, Math.min(W, H) / 2 - 14), k = R / 5.45, mx = W / 2, my = H / 2;
      const P = (p) => [mx + p[0] * k, my - p[1] * k];
      g.lineWidth = 1; g.strokeStyle = 'rgba(154,166,208,0.35)';
      for (const b of [EARTH, JUPITER]) { g.beginPath(); g.arc(mx, my, b.r * k, 0, Math.PI * 2); g.stroke(); }
      const e = posOf(EARTH, t), j = posOf(JUPITER, t), E = P(e), J = P(j), lag = lagNow(), D = distAU(t), ok = observable(t);
      // 木星の影の向き（太陽と反対）
      const u = [j[0] / JUPITER.r, j[1] / JUPITER.r];
      g.setLineDash([2, 4]); g.strokeStyle = 'rgba(154,166,208,0.55)'; seg(g, J, P([j[0] + u[0] * 0.7, j[1] + u[1] * 0.7])); g.setLineDash([]);
      // 木星から地球へ届く光の道
      g.strokeStyle = ok ? 'rgba(127,209,255,0.75)' : 'rgba(154,166,208,0.22)'; g.lineWidth = ok ? 1.5 : 1; seg(g, J, E);
      dot(g, [mx, my], 7, '#ffd34d');
      if (flash >= 0 && now - flash < 450 && !calm.matches) {
        const f = (now - flash) / 450;
        g.strokeStyle = `rgba(127,209,255,${1 - f})`; g.lineWidth = 1.5; g.beginPath(); g.arc(E[0], E[1], 5 + f * 12, 0, Math.PI * 2); g.stroke();
      }
      dot(g, E, 4.5, '#5aa9ff');
      dot(g, J, 6.5, '#e8b27a');
      g.font = FONT; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = DIM;
      // 地球と木星の名前は、太陽から離れる側（上か下）に書き、枠からはみ出さないようにする
      g.fillText('太陽', mx + 10, my);
      g.textAlign = 'center';
      const inside = (v, max) => Math.max(16, Math.min(max - 16, v));
      g.fillText('地球', inside(E[0], W), E[1] + (e[1] >= 0 ? -13 : 13));
      g.fillText('木星', inside(J[0], W), inside(J[1] + (j[1] >= 0 ? -15 : 15), H));
      g.fillStyle = ok ? IN : DIM;
      g.fillText(ok ? (lag ? `光で ${(D * lag * 1440).toFixed(1)} 分` : '光は一瞬で届く') : '観測できない時期', (E[0] + J[0]) / 2, (E[1] + J[1]) / 2 - 10);
      drawInset(W, H, e, j);
    }
    // 右上の拡大図: 木星・木星の影・イオ。黄色の点線は太陽の光、青の線は地球の向き
    function drawInset(W, H, e, j) {
      const g = ox, s = Math.max(60, Math.min(W, H) * 0.3), x0 = W - s - 6, y0 = 6, c = [x0 + s / 2, y0 + s / 2 + 4];
      g.fillStyle = 'rgba(20,27,51,0.94)'; g.strokeStyle = 'rgba(154,166,208,0.45)'; g.lineWidth = 1;
      g.beginPath(); g.rect(x0, y0, s, s); g.fill(); g.stroke();
      g.save(); g.beginPath(); g.rect(x0, y0, s, s); g.clip();
      const ri = s * 0.34, rj = ri * Math.sin(SHADOW), aJ = angleOf(JUPITER, t), u = [Math.cos(aJ), -Math.sin(aJ)], v = [-u[1], u[0]], L = s;
      g.fillStyle = 'rgba(0,0,0,0.65)'; g.beginPath();
      g.moveTo(c[0] + v[0] * rj, c[1] + v[1] * rj); g.lineTo(c[0] + v[0] * rj + u[0] * L, c[1] + v[1] * rj + u[1] * L);
      g.lineTo(c[0] - v[0] * rj + u[0] * L, c[1] - v[1] * rj + u[1] * L); g.lineTo(c[0] - v[0] * rj, c[1] - v[1] * rj); g.closePath(); g.fill();
      g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255,211,77,0.7)'; seg(g, [c[0] - u[0] * s * 0.48, c[1] - u[1] * s * 0.48], [c[0] - u[0] * (rj + 3), c[1] - u[1] * (rj + 3)]);
      g.strokeStyle = 'rgba(154,166,208,0.35)'; g.beginPath(); g.arc(c[0], c[1], ri, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      const ex = e[0] - j[0], ey = e[1] - j[1], el = Math.hypot(ex, ey) || 1;
      g.strokeStyle = 'rgba(127,209,255,0.6)'; seg(g, [c[0] + (ex / el) * (rj + 3), c[1] - (ey / el) * (rj + 3)], [c[0] + (ex / el) * s * 0.48, c[1] - (ey / el) * s * 0.48]);
      dot(g, c, rj, '#e8b27a');
      const a = ioAngle(t), io = [c[0] + Math.cos(a) * ri, c[1] - Math.sin(a) * ri], dark = ioInShadow(t);
      dot(g, io, 3.2, dark ? '#4a4f68' : '#f3e27a');
      g.restore();
      g.font = FONT; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = DIM;
      g.fillText('木星とイオ（拡大）', x0 + 5, y0 + 4);
      g.textBaseline = 'bottom'; g.fillText(dark ? 'イオは影の中' : 'イオ（黄色の点）', x0 + 5, y0 + s - 3);
    }
    function drawChart() {
      const [W, H] = fitCanvas(cc, cx), g = cx;
      g.fillStyle = '#10163a'; g.fillRect(0, 0, W, H);
      const L = 36, R = 8, T = 18, B = 18, pw = Math.max(1, W - L - R), ph = Math.max(1, H - T - B);
      const pts = [];
      let ymax = 6;
      if (fit) for (let i = 0; i < shown; i++) { const q = obs[i], m = lateMin(q, fit); pts.push([q.o, m, q.sg]); ymax = Math.max(ymax, Math.abs(m) * 1.15); }
      ymax = Math.min(60, Math.ceil(ymax / 5) * 5);
      const X = (d) => L + (d / END) * pw, Y = (m) => T + (1 - (m + ymax) / (2 * ymax)) * ph;
      g.fillStyle = '#2a335c';
      for (const [a, b] of bands) g.fillRect(X(a), T, Math.max(1, X(b) - X(a)), ph);
      g.font = FONT; g.lineWidth = 1; g.fillStyle = DIM; g.textBaseline = 'middle'; g.textAlign = 'right';
      const step = ymax > 20 ? 10 : 5;
      for (let m = -ymax; m <= ymax; m += step) {
        g.strokeStyle = m === 0 ? 'rgba(214,222,252,0.45)' : 'rgba(154,166,208,0.15)';
        seg(g, [L, Y(m)], [L + pw, Y(m)]);
        g.fillText(`${m > 0 ? '+' : ''}${m}分`, L - 4, Y(m));
      }
      g.textAlign = 'left'; g.textBaseline = 'bottom';
      for (let y = 1676; y <= 1679; y++) {
        const d = (Date.UTC(y, 0, 1) - Date.UTC(1676, 0, 1)) / 864e5;
        if (d > END) break;
        g.strokeStyle = 'rgba(154,166,208,0.25)'; seg(g, [X(d), T], [X(d), T + ph]);
        g.fillText(`${y}年`, X(d) + 3, H - 2);
      }
      g.textBaseline = 'top'; g.fillText('予定の時刻より何分遅れて見えたか（上ほど遅い）', L, 3);
      g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
      // 曲線は、1天文単位あたりの遅れの誤差が0.75分より小さくなってから描く（観測が少ないうちは大きく外れるため）
      if (fit && fit.se * 1440 < 0.75) {
        g.strokeStyle = FIT; g.lineWidth = 1.5;
        for (const [from, to, dash] of [[0, t, []], [t, END, [4, 4]]]) {
          if (to <= from) continue;
          g.setLineDash(dash); g.beginPath();
          for (let d = from; ; d = Math.min(to, d + 2)) {
            const p = [X(d), Y(fit.s * (distAU(d) - fit.dMean) * 1440)];
            if (d === from) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
            if (d >= to) break;
          }
          g.stroke();
        }
        g.setLineDash([]);
      }
      for (const [d, m, sg] of pts) dot(g, [X(d), Y(m)], 2.2, sg < 0 ? IN : OUT);
      g.strokeStyle = 'rgba(255,255,255,0.5)'; seg(g, [X(t), T], [X(t), T + ph]);
      g.restore();
      if (!fit) {
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#d6defc';
        g.fillText(t === 0 && !playing ? '「動かす」か「最後まで進める」を押すと観測を始めます' : '観測がたまったらグラフを描きます', L + pw / 2, T + ph / 2);
      }
    }
    function writeText() {
      const d = dateOf(t), lag = lagNow(), D = distAU(t);
      say('play', playing ? '止める' : t >= END ? 'はじめから' : '動かす');
      say('date', `${d.y}年${d.m}月${d.d}日 ・ 観測できた回数 ${shown} 回` + (t >= END ? '（3年分の観測が終わりました）' : ''));
      say('now', (lag ? `${(D * lag * 1440).toFixed(1)} 分` : '一瞬（遅れなし）') + `（地球と木星の距離 ${D.toFixed(2)} 天文単位）` + (observable(t) ? '' : '。いまは木星が太陽の近くに見えて観測できない'));
      if (!fit) { say('est', shown < 6 ? 'まだ観測が足りません' : '地球と木星の距離がもう少し変わるまで観測を続けます'); say('cross', '—'); }
      else {
        say('cross', `${(2 * fit.s * 1440).toFixed(1)} 分 ± ${(2 * fit.se * 1440).toFixed(1)}`);
        if (fit.s > 2 * fit.se && fit.s * 1440 > 0.05) { const v = speedKms(fit.s); say('est', `秒速 約${man(v)} km ± ${man((v * fit.se) / fit.s)}`); }
        else say('est', 'はっきりした遅れは見えません（誤差の範囲で、遅れ0と区別できない）');
      }
      say('ref', `この見本の光は${lag ? `秒速 約${man(speedKms(lag))} km` : '限りなく速い'}。実際の光は秒速 約29.98万 km で、地球の軌道の直径を約16.6分で横切る。レーマーはこれを約22分と見積もった。`);
    }
    function frame(now) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (playing) {
        t = Math.min(END, t + dt * Number($('speed').value) * (window.THUMB ? 5 : 1));
        if (t >= END) { playing = false; doneAt = now; }
      }
      // 一覧の小窓では、終わったら天気を変えて最初から観測し直す
      if (window.THUMB && !playing && doneAt >= 0 && now - doneAt > 2500) { seed++; t = 0; doneAt = -1; playing = true; rebuild(); }
      if (catchUp()) flash = now;
      drawOrbit(now);
      drawChart();
      writeText();
      requestAnimationFrame(frame);
    }
    $('play').addEventListener('click', () => {
      if (t >= END) { t = 0; rebuild(); playing = true; } else playing = !playing;
    });
    $('skip').addEventListener('click', () => { t = END; playing = false; catchUp(); });
    $('again').addEventListener('click', () => { seed++; t = 0; rebuild(); playing = true; });
    $('light').addEventListener('change', rebuild);
    $('noise').addEventListener('change', rebuild);
    rebuild();
    requestAnimationFrame(frame);
  },
});

dekiru.add({
  id: 'tr-20261118-solid-signals', c: 'trend', lv: 3, date: '2026-11-18',
  t: 'シグナルで、変わった所だけを計算し直す（Solid 2.0 の反応の仕組み）', y: 'しぐなるでかわったところだけをけいさんしなおす',
  tags: ['Solid 2.0', 'シグナル', 'リアクティブ', '依存グラフ', 'Promise', 'SVG'],
  d: '2026年11月16日、画面を作るための JavaScript のライブラリ Solid の 2.0 が公開され、Hacker News で話題になった。Solid は「シグナル」という値の入れ物を使い、値が変わったときに、その値を使っている計算と画面の部分だけを計算し直す。2.0 では、計算が Promise を返しても依存の図にそのまま組み込めるようになり、答えを待っている間かどうかを isPending で調べられるようになった。この見本では、シグナル（入力の値）・メモ（計算した値を覚えておく節）・エフェクト（画面を書き換える節）を一から作り、買い物の合計を計算する図にした。入力を変えると、計算し直した節が白い枠になり、計算した回数が増える。送料は、0.3〜1.8秒かかる「問い合わせ」を Promise で返す。答えが届く前に配送先を変えると、古い問い合わせの答えは捨てる。Solid そのもののコードは使っていない。2.0 のサーバー関数、Loading の境界、先に見せた値の巻き戻し、書き込んだ値がいつ読めるようになるかといった細かい決まりは再現していない。',
  p: '値を書き込んだときは、すぐには計算しない。その値を読んでいる節に「計算し直す」、さらにその先の節に「確かめる」という印を付けるだけにする。エフェクトを走らせるときに、印の付いた節を元の方からたどり、必要な物だけを計算し直す。こうすると「割引後 → 税 → 合計」と「割引後 → 合計」のように道が2本ある所でも、合計は1回しか計算しない。計算し直した値が前と同じなら、その先へは伝えない（送料無料かどうかが変わらない限り、送料は問い合わせ直さない）。どの値を読んだかは計算のたびに記録し直すので、税を足さないときは割引後を読まず、図の線も薄い点線に変わる。Promise を返した計算には問い合わせごとに番号を付け、いちばん新しい番号の答えだけを受け取る。続けて書き込んだ値は、次のマイクロタスクでまとめて1回だけエフェクトを走らせる。',
  refs: [
    { title: 'Solid 2.0（Solid の公式ブログ）', url: 'https://www.solidjs.com/blog/solid-2-0-the-long-hold/' },
    { title: 'Hacker News: Solid 2.0', url: 'https://news.ycombinator.com/item?id=50536387' },
    { title: 'solidjs/solid（GitHub）', url: 'https://github.com/solidjs/solid' },
  ],
  html: `<div class="wrap">
  <figure>
    <svg id="g" role="img" aria-labelledby="gt"><title id="gt">買い物の合計を計算する依存の図。左（または上）の入力から、小計・割引後・税・送料無料・送料・合計を通って、画面へ値が伝わる。値を変えると、計算し直した所が白い枠になる。</title></svg>
    <figcaption>
      <span class="sw s">■</span> 入力（シグナル）　<span class="sw m">■</span> 計算（メモ）　<span class="sw a">■</span> Promise を返す計算　<span class="sw e">■</span> 画面を書き換える（エフェクト）<br>
      白い枠: 今の変更で計算し直した　黄色の点線の枠: 計算したが値が同じなので先へ伝えなかった　動く点線の枠: 答えを待っている　薄い点線: 前は読んでいたが今は読んでいない値
    </figcaption>
  </figure>
  <form class="side" id="f">
    <p class="total">合計 <output id="total">—</output></p>
    <p id="busy"></p>
    <div class="row"><label for="price">単価（円）</label><input id="price" name="price" type="number" min="100" max="5000" step="100" value="1200"></div>
    <div class="row"><label for="qty">個数</label><input id="qty" name="qty" type="range" min="1" max="9" value="3"><output id="qtyOut" for="qty">3</output></div>
    <fieldset>
      <legend>割引</legend>
      <span><input type="radio" id="off0" name="off" value="0" checked><label for="off0">なし</label></span>
      <span><input type="radio" id="off10" name="off" value="10"><label for="off10">10%</label></span>
      <span><input type="radio" id="off30" name="off" value="30"><label for="off30">30%</label></span>
    </fieldset>
    <div class="row"><input type="checkbox" id="taxOn" name="taxOn" checked><label for="taxOn">消費税（10%）を足す</label></div>
    <fieldset aria-describedby="areaHint">
      <legend>配送先</legend>
      <p class="hint" id="areaHint">送料は問い合わせて決まる（答えが届くまで0.3〜1.8秒）。割引後が5,000円以上なら無料。</p>
      <span><input type="radio" id="aNear" name="area" value="near"><label for="aNear">近く</label></span>
      <span><input type="radio" id="aHonshu" name="area" value="honshu" checked><label for="aHonshu">本州</label></span>
      <span><input type="radio" id="aHokkaido" name="area" value="hokkaido"><label for="aHokkaido">北海道</label></span>
      <span><input type="radio" id="aOkinawa" name="area" value="okinawa"><label for="aOkinawa">沖縄・離島</label></span>
    </fieldset>
    <div class="row"><button type="button" id="auto">自動で値を変える</button><button type="button" id="reset">回数を0に戻す</button></div>
    <p id="count"></p>
    <h2>計算の記録（新しい順）</h2>
    <ul id="log"></ul>
  </form>
</div>`,
  css: `:root { color-scheme: dark; --bg: #0e1118; --fg: #dfe5f2; --mut: #97a3bf; --line: #2a3348; --sig: #4ea1ff; --memo: #46d39a; --async: #b48cff; --eff: #ffad4d; --same: #ffe066; --drop: #ff9090; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.5 system-ui, sans-serif; }
    .wrap { display: grid; grid-template-columns: minmax(0, 1fr); }
    figure { margin: 0; padding: 6px; min-width: 0; display: flex; flex-direction: column; gap: 4px; box-sizing: border-box; }
    #g { display: block; width: 100%; height: auto; }
    figcaption { color: var(--mut); font-size: 11px; }
    .sw.s { color: var(--sig); } .sw.m { color: var(--memo); } .sw.a { color: var(--async); } .sw.e { color: var(--eff); }
    .side { padding: 6px 10px 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0; box-sizing: border-box; }
    .side p { margin: 0; }
    .row { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
    fieldset { border: 1px solid var(--line); border-radius: 6px; margin: 0; padding: 2px 8px 6px; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; }
    legend { color: var(--mut); padding: 0 4px; }
    .hint { flex-basis: 100%; color: var(--mut); font-size: 11px; }
    input, button, output { font: inherit; }
    input[type="number"] { width: 6em; }
    input[type="range"] { flex: 1; min-width: 100px; }
    button { min-block-size: 28px; padding: 2px 10px; }
    .total { font-size: 20px; font-variant-numeric: tabular-nums; }
    #busy { color: var(--async); min-height: 1.5em; }
    #count { color: var(--mut); font-size: 12px; font-variant-numeric: tabular-nums; }
    h2 { font-size: 12px; margin: 0; color: var(--mut); font-weight: 600; }
    #log { margin: 0; padding-left: 1.2em; font-size: 12px; color: var(--mut); }
    #log li:first-child { color: var(--fg); }
    #log li.drop { color: var(--drop); }
    .node .box { stroke-width: 1.5; }
    .k-signal .box { stroke: var(--sig); fill: #102540; }
    .k-memo .box { stroke: var(--memo); fill: #0f2c22; }
    .k-async .box { stroke: var(--async); fill: #221a3a; }
    .k-effect .box { stroke: var(--eff); fill: #33210f; }
    .node.ran .box { stroke: #fff; stroke-width: 3; }
    .node.same .box { stroke: var(--same); stroke-width: 2.5; stroke-dasharray: 3 3; }
    .node.pending .box { stroke-dasharray: 6 4; stroke-width: 2.5; }
    .node.pending .box {
      @media (prefers-reduced-motion: no-preference) { animation: march 0.8s linear infinite; }
    }
    @keyframes march { to { stroke-dashoffset: -10; } }
    .node .glow { fill: #fff; opacity: 0; pointer-events: none; }
    .node text { fill: var(--fg); text-anchor: middle; }
    .node .nm { font-size: 11px; fill: var(--mut); }
    .node .val { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .v .node .val { font-size: 12px; }
    .node .cnt { font-size: 9.5px; fill: var(--mut); }
    .edge { fill: none; stroke: #4a5672; stroke-width: 1.5; }
    .edge.off { stroke-dasharray: 2 4; opacity: 0.5; }
    .edge.pend { stroke: var(--async); stroke-dasharray: 1 3; }
    .edge.hot { stroke: #fff; stroke-width: 2.5; opacity: 1; }
    @media (min-width: 640px) {
      .wrap { grid-template-columns: minmax(0, 1fr) 270px; height: 100vh; }
      figure { height: 100vh; }
      #g { flex: 1 1 0; min-height: 0; height: 100%; }
      .side { height: 100vh; overflow: auto; }
    }
    .thumb .wrap { grid-template-columns: minmax(0, 1fr); height: 100vh; }
    .thumb figure { height: 100vh; }
    .thumb #g { flex: 1 1 0; min-height: 0; height: 100%; }
    .thumb .side, .thumb figcaption { display: none; }`,
  core() {
    // 送料の表（円）。問い合わせると、この値が少し後に返ってくる
    const SHIP = { near: 500, honshu: 800, hokkaido: 1200, okinawa: 1600 };
    // 小さな反応の仕組み。シグナル（入力の値）・メモ（計算した値を覚える節）・エフェクト（画面を書き換える節）
    // 書き込んだときは印を付けるだけにし、エフェクトを走らせるときに、印の付いた所のうち必要な物だけを計算し直す
    function createGraph(opt) {
      const o = opt || {};
      const emit = o.onEvent || function () {};
      const later = o.schedule || function (f) { Promise.resolve().then(f); };
      const CLEAN = 0, CHECK = 1, DIRTY = 2; // そのまま使える / 元の値が変わったか確かめる / 計算し直す
      const nodes = [];
      let current = null;  // 今計算している節。ここで読んだ値を「この節が読んだ値」として覚える
      const queue = [];    // 走らせるエフェクト
      let planned = false, flushing = false;
      function make(kind, name, fn, value) {
        const n = { id: nodes.length, kind: kind, name: name, fn: fn, value: value, sources: [], observers: new Set(),
          state: kind === 'signal' ? CLEAN : DIRTY, runs: 0, pending: false, token: 0, hidden: false, owner: null, pendingNode: null };
        nodes.push(n);
        return n;
      }
      function track(n) {
        if (current && current.sources.indexOf(n) < 0) { current.sources.push(n); n.observers.add(current); }
      }
      function mark(n, st) {
        if (n.state >= st) return;
        const was = n.state;
        n.state = st;
        if (n.kind === 'effect' && queue.indexOf(n) < 0) queue.push(n);
        if (was === CLEAN) for (const ob of n.observers) mark(ob, CHECK);
      }
      function plan() {
        if (planned) return;
        planned = true;
        later(flush);
      }
      // 値を入れ替え、読んでいる節に「計算し直す」の印を付ける。前の値を返す
      function replace(n, v) {
        const old = n.value;
        n.value = v;
        for (const ob of Array.from(n.observers)) mark(ob, DIRTY);
        return old;
      }
      function set(n, v) {
        if (n.kind !== 'signal') throw new Error('書き込めるのはシグナルだけ: ' + n.name);
        if (Object.is(n.value, v)) return false;
        const old = replace(n, v);
        emit({ type: 'write', node: n, old: old, value: v });
        plan();
        return true;
      }
      function setPending(n, flag) {
        n.pending = flag;
        if (n.pendingNode) set(n.pendingNode, flag);
      }
      function update(n) {
        if (n.state === CHECK) {
          for (const s of n.sources.slice()) {
            if (s.kind === 'memo') update(s);
            if (n.state === DIRTY) break;
          }
          if (n.state === CHECK) n.state = CLEAN;
        }
        if (n.state === DIRTY) run(n);
      }
      function run(n) {
        for (const s of n.sources) s.observers.delete(n);
        n.sources = [];
        n.state = CLEAN;
        const prev = current;
        current = n;
        let v;
        try { v = n.fn(n.value); } finally { current = prev; }
        n.runs++;
        if (n.kind === 'effect') { emit({ type: 'run', node: n }); return; }
        if (v && typeof v.then === 'function') {
          // 問い合わせごとに番号を付け、いちばん新しい番号の答えだけを受け取る。待つ間は前の値のまま
          const token = ++n.token;
          emit({ type: 'run', node: n, pending: true });
          setPending(n, true);
          v.then(function (res) {
            if (token !== n.token) { emit({ type: 'drop', node: n, value: res }); return; }
            setPending(n, false);
            const changed = !Object.is(n.value, res);
            const old = changed ? replace(n, res) : n.value;
            emit({ type: 'resolve', node: n, old: old, value: res, changed: changed });
            plan();
          }, function (err) {
            if (token !== n.token) return;
            setPending(n, false);
            emit({ type: 'error', node: n, error: err });
            plan();
          });
          return;
        }
        if (n.pending) { n.token++; setPending(n, false); } // 待っていた問い合わせの答えは、届いても捨てる
        const changed = !Object.is(n.value, v);
        const old = changed ? replace(n, v) : n.value;
        emit({ type: 'run', node: n, old: old, value: v, changed: changed });
      }
      // 先に計算し直してから「読んだ」と覚える（逆にすると、計算中の自分に印が付いて2回計算する）
      function get(n) {
        if (n.kind === 'memo') update(n);
        track(n);
        return n.value;
      }
      // 答えを待っているかどうかも、隠れたシグナルとして読めるようにする
      function isPending(n) {
        if (!n.pendingNode) {
          n.pendingNode = make('signal', n.name + 'を待っているか', null, n.pending);
          n.pendingNode.hidden = true;
          n.pendingNode.owner = n;
        }
        return get(n.pendingNode);
      }
      function flush() {
        planned = false;
        if (flushing) return;
        flushing = true;
        emit({ type: 'flush-start' });
        try {
          let guard = 0;
          while (queue.length) {
            if (++guard > 10000) throw new Error('エフェクトが止まらない');
            update(queue.shift());
          }
        } finally { flushing = false; }
        emit({ type: 'flush-end' });
      }
      return {
        nodes: nodes,
        signal: function (name, v) { return make('signal', name, null, v); },
        memo: function (name, fn) { return make('memo', name, fn, undefined); },
        effect: function (name, fn) { const n = make('effect', name, fn, undefined); queue.push(n); plan(); return n; },
        get: get, set: set, isPending: isPending, flush: flush,
      };
    }
    // 買い物の合計の図。ask(配送先) は送料を Promise で返す
    function buildShop(G, ask) {
      const price = G.signal('単価', 1200), qty = G.signal('個数', 3), off = G.signal('割引', 0);
      const taxOn = G.signal('税込', true), area = G.signal('配送先', 'honshu');
      const sub = G.memo('小計', () => G.get(price) * G.get(qty));
      const net = G.memo('割引後', () => Math.round((G.get(sub) * (100 - G.get(off))) / 100));
      const tax = G.memo('税', () => (G.get(taxOn) ? Math.floor(G.get(net) / 10) : 0));
      const free = G.memo('送料無料', () => G.get(net) >= 5000);
      const ship = G.memo('送料', () => (G.get(free) ? 0 : ask(G.get(area))));
      const total = G.memo('合計', () => {
        const a = G.get(net), b = G.get(tax), c = G.get(ship);
        return c == null ? null : a + b + c;
      });
      return { price: price, qty: qty, off: off, taxOn: taxOn, area: area, sub: sub, net: net, tax: tax, free: free, ship: ship, total: total };
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const SVGNS = 'http://www.w3.org/2000/svg';
    const AREA_NAME = { near: '近く', honshu: '本州', hokkaido: '北海道', okinawa: '沖縄・離島' };
    const AREAS = Object.keys(AREA_NAME);
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const yen = (v) => (v == null ? '—' : v.toLocaleString('ja-JP') + '円');
    if (window.THUMB) document.documentElement.classList.add('thumb');

    let batch = [];        // 前に描いてから起きた出来事
    let plannedDelays = []; // 自動で動かすときに決めておく、問い合わせの答えが届くまでの時間
    const G = createGraph({ onEvent: onEvent });
    const shop = buildShop(G, (area) => new Promise((ok) => {
      const ms = plannedDelays.length ? plannedDelays.shift() : 300 + Math.random() * 1500;
      setTimeout(() => ok(SHIP[area]), ms);
    }));
    let shown = '—';
    const viewEffect = G.effect('画面', () => {
      const t = G.get(shop.total);           // 先に合計を読む（送料の問い合わせが始まるのはここ）
      const busy = G.isPending(shop.ship);
      shown = yen(t);
      $('total').textContent = shown;
      $('busy').textContent = busy ? (t == null ? '送料を問い合わせ中…' : '送料を問い合わせ中…（いまは前の合計）') : '';
    });

    const FMT = {
      単価: yen, 個数: (v) => v + '個', 割引: (v) => (v ? v + '%引き' : 'なし'), 税込: (v) => (v ? '足す' : '足さない'), 配送先: (v) => AREA_NAME[v],
      小計: yen, 割引後: yen, 税: yen, 送料無料: (v) => (v == null ? '—' : v ? 'はい' : 'いいえ'), 送料: yen, 合計: yen,
    };
    const fmt = (n, v) => (n.kind === 'effect' ? shown : (FMT[n.name] || String)(v));
    const NODES = [shop.price, shop.qty, shop.off, shop.taxOn, shop.area, shop.sub, shop.net, shop.tax, shop.free, shop.ship, shop.total, viewEffect];
    const COMPUTED = NODES.filter((n) => n.kind !== 'signal').length;
    // 置き場所 [列, 行]。横長のときは列が左から右、縦長のときは列が上から下
    const POS = { 単価: [0, 0], 個数: [0, 1], 割引: [0, 2], 税込: [0, 3], 配送先: [0, 4], 小計: [1, 0.5], 割引後: [2, 1.3], 税: [3, 2.5], 送料無料: [3, 3.4], 送料: [4, 3.9], 合計: [5, 2], 画面: [6, 2] };
    const svg = $('g');
    let vertical = null, edgeLayer = null;
    let views = new Map(), edgeEls = new Map();
    const seenEdges = new Map();
    let lastRan = new Map(), lastSent = new Set();
    const flashAt = new Map();
    let started = false, runsSum = 0, fullSum = 0;

    function el(tag, attrs, parent) {
      const e = document.createElementNS(SVGNS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    }
    function kindClass(n) { return n === shop.ship ? 'k-async' : 'k-' + n.kind; }
    function chooseVertical() {
      const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
      if (window.THUMB) return w / h < 1;
      if (w >= 640) return (w - 270) / h < 1.05;
      return w < 520;
    }
    // 縦長のときは横の間が狭いので、同じ段に並ぶ税と送料無料を少し離す
    const VPOS = { 税: 2.2, 送料無料: 3.3 };
    function geom() { return vertical ? { W: 392, H: 572, w: 64, h: 52 } : { W: 712, H: 342, w: 74, h: 52 }; }
    function boxOf(n) {
      const p = POS[n.name], g = geom();
      if (vertical) return { x: 6 + (VPOS[n.name] ?? p[1]) * 76 + (76 - g.w) / 2, y: 6 + p[0] * 80 + 14 };
      return { x: 6 + p[0] * 100 + (100 - g.w) / 2, y: 6 + p[1] * 66 + (66 - g.h) / 2 };
    }
    function pathOf(e) {
      const a = boxOf(e.from), b = boxOf(e.to), g = geom();
      if (vertical) {
        const x1 = a.x + g.w / 2, y1 = a.y + g.h, x2 = b.x + g.w / 2, y2 = b.y, m = (y2 - y1) / 2;
        return `M${x1} ${y1} C${x1} ${y1 + m} ${x2} ${y2 - m} ${x2} ${y2}`;
      }
      const x1 = a.x + g.w, y1 = a.y + g.h / 2, x2 = b.x, y2 = b.y + g.h / 2, m = (x2 - x1) / 2;
      return `M${x1} ${y1} C${x1 + m} ${y1} ${x2 - m} ${y2} ${x2} ${y2}`;
    }
    function build() {
      const v = chooseVertical();
      if (v === vertical) return;
      vertical = v;
      const g = geom();
      svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
      svg.classList.toggle('v', vertical);
      for (const c of Array.from(svg.children)) if (c.tagName.toLowerCase() !== 'title') c.remove();
      edgeLayer = el('g', {}, svg);
      const nodeLayer = el('g', {}, svg);
      edgeEls = new Map();
      views = new Map();
      for (const n of NODES) {
        const b = boxOf(n);
        const gr = el('g', { class: 'node ' + kindClass(n), transform: `translate(${b.x} ${b.y})` }, nodeLayer);
        el('rect', { class: 'box', width: g.w, height: g.h, rx: 7 }, gr);
        const glow = el('rect', { class: 'glow', width: g.w, height: g.h, rx: 7 }, gr);
        el('text', { class: 'nm', x: g.w / 2, y: 14 }, gr).textContent = n.name;
        const val = el('text', { class: 'val', x: g.w / 2, y: 32 }, gr);
        const cnt = el('text', { class: 'cnt', x: g.w / 2, y: 46 }, gr);
        views.set(n, { g: gr, glow: glow, val: val, cnt: cnt });
      }
      paint(false);
    }
    // 今それぞれの節が読んでいる値を線にする。前に読んでいた線も薄く残す
    function currentEdges() {
      const now = new Map();
      for (const n of NODES) {
        if (n.kind === 'signal') continue;
        for (const s of n.sources) {
          const from = s.hidden ? s.owner : s;
          if (!from || !POS[from.name]) continue;
          now.set(from.id + '>' + n.id + (s.hidden ? 'p' : ''), { from: from, to: n, pend: !!s.hidden });
        }
      }
      for (const [k, e] of now) seenEdges.set(k, e);
      return now;
    }
    function paint(doFlash) {
      const now = currentEdges();
      for (const [k, e] of seenEdges) {
        let p = edgeEls.get(k);
        if (!p) { p = el('path', { d: pathOf(e) }, edgeLayer); edgeEls.set(k, p); }
        const live = now.has(k);
        const hot = live && lastRan.has(e.to) && lastSent.has(e.from);
        p.setAttribute('class', 'edge' + (e.pend ? ' pend' : '') + (live ? '' : ' off') + (hot ? ' hot' : ''));
      }
      const t = performance.now();
      for (const [n, v] of views) {
        const r = lastRan.get(n);
        const same = !!r && r.changed === false;
        v.g.classList.toggle('ran', (!!r && !same) || (n.kind === 'signal' && lastSent.has(n)));
        v.g.classList.toggle('same', same);
        v.g.classList.toggle('pending', !!n.pending);
        v.val.textContent = n.pending && n.value == null ? '待ち…' : fmt(n, n.value);
        v.cnt.textContent = n.kind === 'signal' ? '入力' : '×' + n.runs + (same ? ' 同じ' : '') + (n.pending ? ' 待ち' : '');
        // 光らせるのは動きを減らす設定でないときだけ。同じ節は0.4秒に1回まで
        if (doFlash && (r || lastSent.has(n)) && !calm.matches && t - (flashAt.get(n) || -1e9) > 400) {
          flashAt.set(n, t);
          v.glow.animate([{ opacity: 0.4 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' });
        }
      }
    }
    function addLog(text, cls) {
      const li = document.createElement('li');
      li.textContent = text;
      if (cls) li.className = cls;
      const log = $('log');
      log.prepend(li);
      while (log.children.length > 8) log.lastElementChild.remove();
    }
    function render() {
      const ev = batch;
      batch = [];
      const ran = new Map(), sent = new Set(), causes = [];
      for (const e of ev) {
        if (e.type === 'write') { sent.add(e.node); causes.push(`${e.node.name}を ${fmt(e.node, e.old)} → ${fmt(e.node, e.value)}`); }
        else if (e.type === 'resolve') { if (e.changed) sent.add(e.node); causes.push(`送料の答えが届いた（${yen(e.value)}）`); }
        else if (e.type === 'run') { ran.set(e.node, e); if (e.changed) sent.add(e.node); }
      }
      if (!causes.length && !ran.size) return;
      lastRan = ran;
      lastSent = sent;
      paint(true);
      const parts = NODES.filter((n) => ran.has(n)).map((n) => {
        const r = ran.get(n);
        return n.name + (r.pending ? `（${AREA_NAME[shop.area.value]}へ問い合わせ開始）` : r.changed === false ? '（同じ値なので先へ伝えない）' : '');
      });
      const head = started ? causes.join('、') : '最初の計算';
      started = true;
      runsSum += ran.size;
      fullSum += COMPUTED;
      addLog(`${head} → ${parts.length ? '計算: ' + parts.join('、') : '計算なし（今この値を読んでいる節が無い）'}［${ran.size}/${COMPUTED}］`);
      $('count').textContent = `この変更で計算した節: ${ran.size} 個（全部やり直す方式なら ${COMPUTED} 個）。これまでの合計: ${runsSum} 回（全部やり直す方式なら ${fullSum} 回）`;
    }
    function onEvent(e) {
      if (e.node && e.node.hidden) return;
      if (e.type === 'drop') { addLog(`送料: 前の問い合わせの答え（${yen(e.value)}）が後から届いたが、もっと新しい問い合わせがあるので捨てた`, 'drop'); return; }
      if (e.type === 'flush-end') { render(); return; }
      if (e.type !== 'flush-start') batch.push(e);
    }

    // 入力欄とシグナルをつなぐ
    function sync() {
      $('price').value = shop.price.value;
      $('qty').value = shop.qty.value;
      $('qtyOut').textContent = shop.qty.value;
      for (const r of document.querySelectorAll('input[name="off"]')) r.checked = Number(r.value) === shop.off.value;
      $('taxOn').checked = shop.taxOn.value;
      for (const r of document.querySelectorAll('input[name="area"]')) r.checked = r.value === shop.area.value;
    }
    function put(sig, v) { G.set(sig, v); sync(); }
    $('f').addEventListener('submit', (e) => e.preventDefault());
    $('price').addEventListener('input', () => {
      const v = $('price').valueAsNumber;
      if (Number.isFinite(v) && v >= 100 && v <= 5000) G.set(shop.price, Math.round(v));
    });
    $('qty').addEventListener('input', () => { G.set(shop.qty, $('qty').valueAsNumber); $('qtyOut').textContent = $('qty').value; });
    for (const r of document.querySelectorAll('input[name="off"]')) r.addEventListener('change', () => G.set(shop.off, Number(r.value)));
    $('taxOn').addEventListener('change', () => G.set(shop.taxOn, $('taxOn').checked));
    for (const r of document.querySelectorAll('input[name="area"]')) r.addEventListener('change', () => { plannedDelays = []; G.set(shop.area, r.value); });

    // 自動で値を変える（止めるボタン付き）
    const nextArea = () => AREAS[(AREAS.indexOf(shop.area.value) + 1) % AREAS.length];
    const STEPS = [
      () => put(shop.qty, (shop.qty.value % 9) + 1),
      () => put(shop.off, { 0: 10, 10: 30, 30: 0 }[shop.off.value]),
      () => put(shop.taxOn, !shop.taxOn.value),
      () => { plannedDelays = [700]; put(shop.area, nextArea()); },
      () => put(shop.price, { 800: 1200, 1200: 2400, 2400: 800 }[shop.price.value] || 1200),
      () => {
        // 遅い問い合わせの後に速い問い合わせを出して、古い答えが後から届く様子を見せる
        if (G.get(shop.free)) put(shop.qty, 2);
        plannedDelays = [1500, 300];
        put(shop.area, nextArea());
        setTimeout(() => { if (auto) put(shop.area, nextArea()); }, 250);
      },
    ];
    let auto = null, step = 0;
    function setAuto(on) {
      if (auto) { clearInterval(auto); auto = null; }
      if (on) auto = setInterval(() => { STEPS[step % STEPS.length](); step++; }, window.THUMB ? 1500 : 1900);
      $('auto').textContent = on ? '止める' : '自動で値を変える';
      $('total').setAttribute('aria-live', on ? 'off' : 'polite');
    }
    $('auto').addEventListener('click', () => setAuto(!auto));
    $('reset').addEventListener('click', () => {
      for (const n of NODES) n.runs = 0;
      runsSum = 0; fullSum = 0;
      lastRan = new Map(); lastSent = new Set();
      paint(false);
      $('count').textContent = '計算した回数を0に戻した';
    });
    addEventListener('resize', build);
    sync();
    build();
    setAuto(!!window.THUMB);
  },
});
dekiru.add({
  id: 'tr-20261119-partial-eval', c: 'trend', lv: 3, date: '2026-11-19',
  t: '部分評価で、インタプリタからコンパイルしたコードを作る（二村射影）', y: 'ぶぶんひょうかでいんたぷりたからこんぱいるしたこーどをつくる',
  tags: ['部分評価', '二村射影', 'インタプリタ', 'コンパイラ', 'new Function'],
  d: '2026年11月18日、Jimmy Miller さんの記事「The Magic of Partial Evaluation」が Hacker News で話題になった。部分評価は、プログラムの入力の一部が先に分かっているとき、その値で決まる所を前もって計算し、残りの入力だけを受け取る専用のプログラムを作る技術である。記事は、べき乗の関数から始めて、brainfuck のインタプリタなどを部分評価し、「インタプリタに動かすプログラムを渡して部分評価すると、そのプログラムをコンパイルしたものが出来る」こと（第一の二村射影）を説明している。この見本では、数・if・let・配列の読み出し・関数の呼び出しだけの小さな言語と、その評価器と部分評価器を一から作った。べき乗では、n を先に決めると x だけを受け取る掛け算の式が出来る。小さな機械（レジスタ4つ、命令8種類）のインタプリタでは、命令の列を先に渡すと、命令を読んで種類で振り分ける部分が消え、ループ1つ分の関数だけが残る。出来たコードは new Function で本物の JavaScript として動かし、答えが同じことを確かめる（new Function が止められている所では省く）。記事の筆者が Rust で書いている JavaScript 用の部分評価器、部分評価器を自分自身に当てはめる第二・第三の二村射影、値が増え続けるときに打ち切る工夫（一般化）は再現していない。また、この部分評価器は「先に分かる値かどうか」を引数ごとに1通りだけ決めるので、「2 の n 乗」の b のように、いつも同じ値でもコードに埋め込めない所がある。',
  p: '値を「先に分かっている値」と「実行するまで分からない値」の2種類に分けて式をたどる。両方とも分かっていればその場で計算し、そうでなければ式のまま残す。if の条件が分かっていれば、片方の枝だけを残す。関数の呼び出しは、先に分かっている引数の組ごとに専用の関数を1つ作り、同じ組がもう一度来たら作った関数を呼ぶので、ループのあるプログラムでも作業が終わる。どの引数が先に分かるかは、部分評価の前に呼び出しをたどって決めておく。最後に、1か所からしか呼ばれない関数と小さな関数を呼び出し元へ埋め込み、どこでも使われない引数を消す。インタプリタの「命令を読む・種類で振り分ける・レジスタを選ぶ」部分は、命令の列と今の位置が先に分かっているので全部消え、レジスタの計算だけが残る。',
  refs: [
    { title: 'The Magic of Partial Evaluation（Jimmy Miller）', url: 'https://jimmyhmiller.com/magic-of-partial-evaluation' },
    { title: 'Hacker News: The Magic of Partial Evaluation', url: 'https://news.ycombinator.com/item?id=50550096' },
    { title: 'Partial evaluation（Wikipedia）', url: 'https://en.wikipedia.org/wiki/Partial_evaluation' },
  ],
  html: `<div class="wrap">
  <section class="cols" aria-label="部分評価の前と後">
    <div class="pane">
      <h2 id="leftTitle">機械の命令（インタプリタに渡すデータ）</h2>
      <ol id="asm" start="0"></ol>
      <pre id="powSrc" tabindex="0" aria-label="べき乗の元のプログラム" hidden></pre>
      <details id="srcBox">
        <summary>この命令を動かすインタプリタのコード</summary>
        <pre id="src" tabindex="0" aria-label="インタプリタのコード"></pre>
      </details>
    </div>
    <div class="pane">
      <h2>部分評価で出来た JavaScript</h2>
      <pre id="out" tabindex="0" aria-label="部分評価で出来た JavaScript"></pre>
      <p id="info" class="mut"></p>
    </div>
  </section>
  <section class="run" aria-labelledby="runH">
    <h2 id="runH">同じ入力で動かして比べる（式を計算した回数）</h2>
    <div class="bar"><span>そのまま動かす</span><span class="track"><span id="b1" class="fill"></span></span><output id="r1"></output></div>
    <div class="bar"><span>部分評価した後</span><span class="track"><span id="b2" class="fill two"></span></span><output id="r2"></output></div>
    <p id="real" role="status"></p>
  </section>
  <form id="f" class="ctl">
    <fieldset>
      <legend>例</legend>
      <span><input type="radio" id="exM" name="ex" value="machine" checked><label for="exM">小さな機械のインタプリタ</label></span>
      <span><input type="radio" id="exP" name="ex" value="pow"><label for="exP">べき乗 x の n 乗</label></span>
    </fieldset>
    <fieldset id="progSet">
      <legend>機械で動かすプログラム（先に分かっている値）</legend>
      <span><input type="radio" id="pgFact" name="prog" value="fact" checked><label for="pgFact">階乗</label></span>
      <span><input type="radio" id="pgFib" name="prog" value="fib"><label for="pgFib">フィボナッチ数</label></span>
      <span><input type="radio" id="pgSum" name="prog" value="sum"><label for="pgSum">1 から n までの和</label></span>
      <span><input type="radio" id="pgPow2" name="prog" value="pow2"><label for="pgPow2">2 の n 乗</label></span>
    </fieldset>
    <div class="row" id="knownRow" hidden><label for="kn">先に分かっている n</label><input type="range" id="kn" name="kn" min="0" max="24" value="10"><output id="knOut" for="kn">10</output></div>
    <div class="row"><label for="inp" id="inpLabel">実行するときの入力 n</label><input type="range" id="inp" name="inp" min="0" max="20" value="10"><output id="inpOut" for="inp">10</output></div>
    <fieldset>
      <legend>部分評価の途中の形</legend>
      <span><input type="radio" id="st0" name="stage" value="0"><label for="st0">① 関数を作った直後</label></span>
      <span><input type="radio" id="st1" name="stage" value="1"><label for="st1">② 埋め込んだ後</label></span>
      <span><input type="radio" id="st2" name="stage" value="2" checked><label for="st2">③ 仕上げ</label></span>
    </fieldset>
  </form>
</div>`,
  css: `:root { color-scheme: dark; --bg: #10131a; --fg: #e2e6ef; --mut: #98a2b8; --line: #2b3346; --code: #0a0d13; --acc: #6fb3ff; --kw: #ff9e64; --nu: #9ece6a; --fn: #7dcfff; --one: #8b95ab; --two: #46d39a; --err: #ff8f8f; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.5 system-ui, sans-serif; accent-color: var(--acc); }
    [hidden] { display: none !important; }
    .wrap { display: flex; flex-direction: column; gap: 8px; padding: 8px; box-sizing: border-box; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
    @media (min-width: 380px) { .cols { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); } }
    .pane { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    h2 { margin: 0; font-size: 12px; color: var(--mut); font-weight: 600; }
    pre, #asm { margin: 0; background: var(--code); border: 1px solid var(--line); border-radius: 6px; font: 12px/1.5 ui-monospace, Consolas, monospace; }
    pre { padding: 6px 8px; overflow: auto; max-height: 360px; }
    #asm { padding: 4px 8px 4px 2.6em; }
    #asm li.head { color: var(--two); }
    #asm .tag { margin-inline-start: .5em; padding: 0 .4em; border: 1px solid currentColor; border-radius: 4px; font-size: 11px; }
    details summary { cursor: pointer; color: var(--mut); font-size: 12px; }
    details pre { margin-top: 4px; }
    .kw { color: var(--kw); } .nu { color: var(--nu); } .fn { color: var(--fn); }
    .mut { margin: 0; color: var(--mut); font-size: 12px; }
    .err { margin: 0; color: var(--err); font-size: 12px; }
    .run { display: flex; flex-direction: column; gap: 4px; }
    .bar { display: grid; grid-template-columns: 7.5em minmax(0, 1fr) auto; align-items: center; gap: 6px; }
    .track { height: 10px; background: #1b2130; border-radius: 5px; overflow: hidden; }
    .fill { display: block; height: 100%; width: 0; background: var(--one); border-radius: 5px; transition: width .3s; }
    .fill.two { background: var(--two); }
    @media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
    output { font-variant-numeric: tabular-nums; }
    #real { margin: 0; font-size: 12px; color: var(--mut); }
    .ctl { display: flex; flex-direction: column; gap: 6px; }
    fieldset { border: 1px solid var(--line); border-radius: 6px; margin: 0; padding: 2px 8px 6px; display: flex; flex-wrap: wrap; gap: 4px 12px; }
    legend { color: var(--mut); padding: 0 4px; }
    .row { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
    input, output, button { font: inherit; }
    input[type="range"] { flex: 1; min-width: 120px; }
    .thumb .ctl, .thumb details, .thumb .run h2 { display: none; }
    @supports not (accent-color: red) {
      input[type="range"] { appearance: none; background: transparent; }
      input[type="range"]::-webkit-slider-runnable-track { height: 6px; background: var(--line); border-radius: 3px; }
      input[type="range"]::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; margin-top: -5px; border-radius: 50%; background: var(--acc); }
      input[type="range"]::-moz-range-track { height: 6px; background: var(--line); border-radius: 3px; }
      input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: var(--acc); }
    }`,
  core() {
    // ── 小さな言語の式（木）。数・変数・計算・if・let・配列の読み出し・関数の呼び出しだけ ──
    const N = (v) => ({ k: 'num', v });
    const V = (n) => ({ k: 'var', n });
    const O = (o, a, b) => ({ k: 'op', o, a, b });
    const IF = (c, t, e) => ({ k: 'if', c, t, e });
    const LET = (n, v, body) => ({ k: 'let', n, v, body });
    const CALL = (f, ...args) => ({ k: 'call', f, args });
    const AT = (a, i) => ({ k: 'at', a, i });
    const FN = (params, body) => ({ params, body });
    const OPS = {
      '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b,
      '/': (a, b) => Math.floor(a / b), '%': (a, b) => a % b,
      '==': (a, b) => a === b, '<': (a, b) => a < b,
    };
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const kids = (e) => e.k === 'op' ? [e.a, e.b] : e.k === 'if' ? [e.c, e.t, e.e] : e.k === 'let' ? [e.v, e.body] : e.k === 'at' ? [e.a, e.i] : e.k === 'call' ? e.args : [];
    const mapKids = (e, f) => {
      switch (e.k) {
        case 'op': return O(e.o, f(e.a), f(e.b));
        case 'if': return IF(f(e.c), f(e.t), f(e.e));
        case 'let': return LET(e.n, f(e.v), f(e.body));
        case 'at': return AT(f(e.a), f(e.i));
        case 'call': return CALL(e.f, ...e.args.map(f));
        default: return e;
      }
    };
    const walk = (e, f) => { f(e); for (const x of kids(e)) walk(x, f); };
    const callsIn = (e) => { const out = []; walk(e, (x) => { if (x.k === 'call') out.push(x.f); }); return out; };
    const sizeOf = (e) => { let n = 0; walk(e, () => { n++; }); return n; };
    const countVar = (e, name) => { let n = 0; walk(e, (x) => { if (x.k === 'var' && x.n === name) n++; }); return n; };
    const isNum = (e, v) => e.k === 'num' && e.v === v;
    const bindArgs = (params, vals) => { const env = {}; params.forEach((p, i) => { env[p] = vals[i]; }); return env; };
    function makeFresh() { let k = 0; return (s) => s.replace(/_\d+$/, '') + '_' + (++k); }
    function readAt(arr, i) {
      if (!Array.isArray(arr)) throw new Error('配列ではない値から読もうとしました');
      if (!(Number.isInteger(i) && i >= 0 && i < arr.length)) throw new Error('配列の範囲の外（' + i + ' 番）を読もうとしました');
      return arr[i];
    }

    // そのまま動かす評価器。式を1つ計算するたびに steps を1増やす
    function evaluate(prog, fname, args, limit = 200000) {
      let steps = 0, depth = 0;
      const ev = (e, env) => {
        if (++steps > limit) throw new Error('計算が ' + limit + ' 回を超えました');
        switch (e.k) {
          case 'num': return e.v;
          case 'var':
            if (!has(env, e.n)) throw new Error('変数 ' + e.n + ' がありません');
            return env[e.n];
          case 'op': return OPS[e.o](ev(e.a, env), ev(e.b, env));
          case 'if': return ev(e.c, env) ? ev(e.t, env) : ev(e.e, env);
          case 'let': return ev(e.body, { ...env, [e.n]: ev(e.v, env) });
          case 'at': return readAt(ev(e.a, env), ev(e.i, env));
          case 'call': {
            if (!has(prog, e.f)) throw new Error('関数 ' + e.f + ' がありません');
            const f = prog[e.f];
            const vals = e.args.map((x) => ev(x, env));
            if (++depth > 500) throw new Error('関数の呼び出しが深すぎます（500 段を超えました）');
            const v = ev(f.body, bindArgs(f.params, vals));
            depth--;
            return v;
          }
        }
        throw new Error('知らない式: ' + e.k);
      };
      if (!has(prog, fname)) throw new Error('関数 ' + fname + ' がありません');
      const value = ev(prog[fname].body, bindArgs(prog[fname].params, args));
      return { value, steps };
    }

    // 関数ごとに、どの引数が「先に分かっている値」かを決める。分からない値が1度でも流れ込んだ引数は「実行するまで分からない値」にする
    function bindingTimes(prog, fname, known) {
      const div = {};
      for (const f of Object.keys(prog)) div[f] = prog[f].params.map(() => true);
      div[fname] = prog[fname].params.map((p) => known.includes(p));
      let changed = true;
      const bt = (e, env) => {
        switch (e.k) {
          case 'num': return true;
          case 'var': return env[e.n] === true;
          case 'let': return bt(e.body, { ...env, [e.n]: bt(e.v, env) });
          case 'call': {
            const s = e.args.map((x) => bt(x, env));
            const d = div[e.f];
            if (!d) throw new Error('関数 ' + e.f + ' がありません');
            s.forEach((ok, j) => { if (!ok && d[j]) { d[j] = false; changed = true; } });
            return s.every(Boolean);
          }
          default: return kids(e).map((x) => bt(x, env)).every(Boolean);
        }
      };
      while (changed) {
        changed = false;
        for (const f of Object.keys(prog)) bt(prog[f].body, bindArgs(prog[f].params, div[f]));
      }
      return div;
    }

    // 式の整理: 定数の計算、x*1 や x+0 を外す、let を外へ出す、1回しか使わない let を埋め込む
    function subst(e, map, fresh) {
      if (e.k === 'var') return has(map, e.n) ? map[e.n] : e;
      if (e.k === 'let') {
        const v = subst(e.v, map, fresh);
        const n = fresh ? fresh(e.n) : e.n;
        return LET(n, v, subst(e.body, { ...map, [e.n]: V(n) }, fresh));
      }
      return mapKids(e, (x) => subst(x, map, fresh));
    }
    function simplify(e) {
      switch (e.k) {
        case 'op': {
          const a = simplify(e.a), b = simplify(e.b);
          if (a.k === 'let') return LET(a.n, a.v, simplify(O(e.o, a.body, b)));
          if (b.k === 'let') return LET(b.n, b.v, simplify(O(e.o, a, b.body)));
          if (a.k === 'num' && b.k === 'num') return N(OPS[e.o](a.v, b.v));
          if (e.o === '+' && isNum(a, 0)) return b;
          if ((e.o === '+' || e.o === '-') && isNum(b, 0)) return a;
          if (e.o === '*' && isNum(a, 1)) return b;
          if (e.o === '*' && isNum(b, 1)) return a;
          if (e.o === '*' && (isNum(a, 0) || isNum(b, 0))) return N(0);
          return O(e.o, a, b);
        }
        case 'if': {
          const c = simplify(e.c);
          if (c.k === 'num') return simplify(c.v ? e.t : e.e);
          if (c.k === 'let') return LET(c.n, c.v, simplify(IF(c.body, e.t, e.e)));
          const t = simplify(e.t), f = simplify(e.e);
          return JSON.stringify(t) === JSON.stringify(f) ? t : IF(c, t, f);
        }
        case 'let': {
          const v = simplify(e.v);
          if (v.k === 'let') return simplify(LET(v.n, v.v, LET(e.n, v.body, e.body)));
          const uses = countVar(e.body, e.n);
          if (uses === 0) return simplify(e.body);
          if (v.k === 'num' || v.k === 'var' || uses === 1) return simplify(subst(e.body, { [e.n]: v }));
          return LET(e.n, v, simplify(e.body));
        }
        case 'call': {
          const args = e.args.map(simplify);
          const i = args.findIndex((x) => x.k === 'let');
          if (i < 0) return CALL(e.f, ...args);
          const l = args[i];
          args[i] = l.body;
          return LET(l.n, l.v, simplify(CALL(e.f, ...args)));
        }
        default: return mapKids(e, simplify);
      }
    }

    // 1か所からしか呼ばれない関数と、呼び出しを含まない小さな関数を、呼び出し元へ埋め込む
    function inlineAll(fns0, entry, fresh) {
      const fns = clone(fns0);
      for (const f of Object.keys(fns)) fns[f].body = simplify(fns[f].body);
      const replaceCalls = (e, g, make) => {
        if (e.k !== 'call') return mapKids(e, (x) => replaceCalls(x, g, make));
        const args = e.args.map((x) => replaceCalls(x, g, make));
        return e.f === g ? make(args) : CALL(e.f, ...args);
      };
      const instantiate = (def, args) => {
        const map = {}, binds = [];
        def.params.forEach((p, i) => {
          const a = args[i];
          if (a.k === 'num' || a.k === 'var') map[p] = a;
          else { const n = fresh(p); map[p] = V(n); binds.push([n, a]); }
        });
        let body = subst(def.body, map, fresh);
        for (let i = binds.length - 1; i >= 0; i--) body = LET(binds[i][0], binds[i][1], body);
        return body;
      };
      for (let guard = 0; guard < 2000; guard++) {
        const seen = new Set([entry]), todo = [entry];
        while (todo.length) for (const g of callsIn(fns[todo.pop()].body)) if (!seen.has(g)) { seen.add(g); todo.push(g); }
        for (const g of Object.keys(fns)) if (!seen.has(g)) delete fns[g];
        const sites = {};
        for (const f of Object.keys(fns)) for (const g of callsIn(fns[f].body)) (sites[g] ||= []).push(f);
        const target = Object.keys(fns).find((g) => g !== entry && (
          (callsIn(fns[g].body).length === 0 && sizeOf(fns[g].body) <= 12) ||
          (sites[g].length === 1 && sites[g][0] !== g)));
        if (!target) break;
        const def = fns[target];
        delete fns[target];
        for (const f of Object.keys(fns)) fns[f].body = simplify(replaceCalls(fns[f].body, target, (args) => instantiate(def, args)));
      }
      return fns;
    }

    // どこでも使われない引数を消す（自分自身へそのまま渡しているだけの引数も消える）
    function dropDeadParams(fns0, entry) {
      const fns = clone(fns0);
      const live = new Set(fns[entry].params.map((p, i) => entry + '#' + i));
      const uses = (e, n) => {
        if (e.k === 'var') return e.n === n;
        if (e.k === 'let') return uses(e.body, n) || (uses(e.v, n) && uses(e.body, e.n));
        if (e.k === 'call') return e.args.some((x, j) => live.has(e.f + '#' + j) && uses(x, n));
        return kids(e).some((x) => uses(x, n));
      };
      let changed = true;
      while (changed) {
        changed = false;
        for (const f of Object.keys(fns)) fns[f].params.forEach((p, i) => {
          if (!live.has(f + '#' + i) && uses(fns[f].body, p)) { live.add(f + '#' + i); changed = true; }
        });
      }
      const keep = {};
      for (const f of Object.keys(fns)) keep[f] = fns[f].params.map((p, i) => live.has(f + '#' + i));
      const dropArgs = (e) => e.k === 'call' && keep[e.f]
        ? CALL(e.f, ...e.args.filter((x, j) => keep[e.f][j]).map(dropArgs))
        : mapKids(e, dropArgs);
      for (const f of Object.keys(fns)) {
        fns[f].body = simplify(dropArgs(fns[f].body));
        fns[f].params = fns[f].params.filter((p, i) => keep[f][i]);
      }
      return fns;
    }

    // 見せるための名前の付け直し（h_7 → h、v_3 と v_12 → v1 と v2）
    function tidy(fns) {
      const rename = (e, map) => e.k === 'var' ? (has(map, e.n) ? V(map[e.n]) : e)
        : e.k === 'let' ? LET(has(map, e.n) ? map[e.n] : e.n, rename(e.v, map), rename(e.body, map))
        : mapKids(e, (x) => rename(x, map));
      for (const f of Object.keys(fns)) {
        const lets = [];
        walk(fns[f].body, (x) => { if (x.k === 'let') lets.push(x.n); });
        const base = (s) => s.replace(/_\d+$/, '');
        const total = {}, idx = {}, map = {};
        for (const n of lets) total[base(n)] = (total[base(n)] || 0) + 1;
        const used = new Set(fns[f].params);
        for (const n of lets) {
          const b = base(n);
          idx[b] = (idx[b] || 0) + 1;
          let c = total[b] === 1 ? b : b + idx[b];
          while (used.has(c) || has(fns, c)) c += '_';
          used.add(c);
          map[n] = c;
        }
        fns[f].body = rename(fns[f].body, map);
      }
      return fns;
    }

    // 部分評価器。known に先に分かっている引数の値を入れる
    function specialize(prog, fname, known, maxFns = 300) {
      if (!has(prog, fname)) throw new Error('関数 ' + fname + ' がありません');
      const div = bindingTimes(prog, fname, Object.keys(known));
      const fresh = makeFresh();
      const fns = {}, memo = new Map();
      const S = (v) => ({ s: true, v }), D = (code) => ({ s: false, code });
      const lift = (x) => {
        if (!x.s) return x.code;
        if (typeof x.v === 'number' || typeof x.v === 'boolean') return N(x.v);
        throw new Error('配列を実行時のコードに書き込むことはできません');
      };
      const nameOf = (f, statics) => {
        const parts = statics.filter((v) => typeof v === 'number' || typeof v === 'boolean').map((v) => String(v).replace(/[^A-Za-z0-9]/g, 'm'));
        const b = parts.length ? f + '_' + parts.join('_') : f;
        let name = b;
        for (let i = 2; has(fns, name); i++) name = b + 'v' + i;
        return name;
      };
      // 先に分かっている引数の組ごとに、専用の関数を1つだけ作る
      const callSpec = (f, args) => {
        const d = div[f];
        args.forEach((x, j) => { if (d[j] && !x.s) throw new Error('内部の誤り: ' + f + ' の ' + j + ' 番の引数'); });
        const key = f + JSON.stringify(args.map((x, j) => (d[j] ? x.v : null)));
        let name = memo.get(key);
        if (!name) {
          if (memo.size >= maxFns) throw new Error('作る関数が ' + maxFns + ' 個を超えました（部分評価が終わりません）');
          const def = prog[f];
          name = nameOf(f, args.filter((x, j) => d[j]).map((x) => x.v));
          memo.set(key, name);
          fns[name] = { params: def.params.filter((p, j) => !d[j]), body: null };
          const env = {};
          def.params.forEach((p, j) => { env[p] = d[j] ? args[j] : D(V(p)); });
          fns[name].body = lift(pe(def.body, env));
        }
        return CALL(name, ...args.filter((x, j) => !d[j]).map(lift));
      };
      const pe = (e, env) => {
        switch (e.k) {
          case 'num': return S(e.v);
          case 'var':
            if (!has(env, e.n)) throw new Error('変数 ' + e.n + ' がありません');
            return env[e.n];
          case 'op': {
            const a = pe(e.a, env), b = pe(e.b, env);
            return a.s && b.s ? S(OPS[e.o](a.v, b.v)) : D(O(e.o, lift(a), lift(b)));
          }
          case 'if': {
            const c = pe(e.c, env);
            if (c.s) return c.v ? pe(e.t, env) : pe(e.e, env);
            return D(IF(c.code, lift(pe(e.t, env)), lift(pe(e.e, env))));
          }
          case 'let': {
            const v = pe(e.v, env);
            if (v.s || v.code.k === 'var' || v.code.k === 'num') return pe(e.body, { ...env, [e.n]: v });
            const n = fresh(e.n);
            return D(LET(n, v.code, lift(pe(e.body, { ...env, [e.n]: D(V(n)) }))));
          }
          case 'at': {
            const a = pe(e.a, env), i = pe(e.i, env);
            if (a.s && i.s) return S(readAt(a.v, i.v));
            throw new Error('配列を読む位置が実行するまで分かりません');
          }
          case 'call': {
            if (!has(prog, e.f)) throw new Error('関数 ' + e.f + ' がありません');
            const args = e.args.map((x) => pe(x, env));
            if (args.every((x) => x.s)) return S(evaluate(prog, e.f, args.map((x) => x.v)).value);
            return D(callSpec(e.f, args));
          }
        }
        throw new Error('知らない式: ' + e.k);
      };
      const top = callSpec(fname, prog[fname].params.map((p) => (has(known, p) ? S(known[p]) : D(V(p)))));
      const entry = top.f;
      const raw = clone(fns);
      const inl = inlineAll(raw, entry, fresh);
      const fin = dropDeadParams(inl, entry);
      return {
        entry, params: fns[entry].params.slice(), made: Object.keys(raw).length,
        stages: [
          { label: '関数を作った直後', fns: tidy(clone(raw)) },
          { label: '埋め込んだ後', fns: tidy(clone(inl)) },
          { label: '仕上げ', fns: tidy(clone(fin)) },
        ],
      };
    }

    // 式の木を JavaScript の文字列にする
    const PREC = { '==': 9, '<': 10, '+': 12, '-': 12, '*': 13, '%': 13 };
    function expr(e, p = 0) {
      switch (e.k) {
        case 'num': return e.v < 0 ? '(' + e.v + ')' : String(e.v);
        case 'var': return e.n;
        case 'op': {
          if (e.o === '/') return 'Math.floor(' + expr(e.a, 13) + ' / ' + expr(e.b, 14) + ')';
          const q = PREC[e.o];
          const s = expr(e.a, q) + ' ' + (e.o === '==' ? '===' : e.o) + ' ' + expr(e.b, q + 1);
          return q < p ? '(' + s + ')' : s;
        }
        case 'if': {
          const s = expr(e.c, 4) + ' ? ' + expr(e.t, 3) + ' : ' + expr(e.e, 3);
          return 3 < p ? '(' + s + ')' : s;
        }
        case 'let': return '(() => { ' + stmts(e, '').replace(/\n/g, ' ').trim() + ' })()';
        case 'at': return expr(e.a, 20) + '[' + expr(e.i) + ']';
        case 'call': return e.f + '(' + e.args.map((x) => expr(x)).join(', ') + ')';
      }
      throw new Error('知らない式: ' + e.k);
    }
    function stmts(e, ind) {
      if (e.k === 'let') return ind + 'const ' + e.n + ' = ' + expr(e.v) + ';\n' + stmts(e.body, ind);
      if (e.k === 'if') {
        const head = ind + 'if (' + expr(e.c) + ') ';
        const t = e.t.k === 'let' || e.t.k === 'if' ? head + '{\n' + stmts(e.t, ind + '  ') + ind + '}\n' : head + 'return ' + expr(e.t) + ';\n';
        return t + stmts(e.e, ind);
      }
      return ind + 'return ' + expr(e) + ';\n';
    }
    function emitJS(fns, entry) {
      const names = [entry, ...Object.keys(fns).filter((f) => f !== entry)];
      return names.map((f) => 'function ' + f + '(' + fns[f].params.join(', ') + ') {\n' + stmts(fns[f].body, '  ') + '}\n').join('\n');
    }

    // 例1: べき乗（n が偶数なら半分の n で計算して2乗する）
    const POW = {
      pow: FN(['x', 'n'],
        IF(O('==', V('n'), N(0)), N(1),
          IF(O('==', O('%', V('n'), N(2)), N(0)),
            LET('h', CALL('pow', V('x'), O('/', V('n'), N(2))), O('*', V('h'), V('h'))),
            O('*', V('x'), CALL('pow', V('x'), O('-', V('n'), N(1))))))),
    };

    // 例2: 小さな機械。レジスタは a b c n の4つ（n に入力が入り、ほかは 0 から始まる）。命令は [種類, x, y] の3つ組
    const OPC = { SET: 0, ADD: 1, MUL: 2, DEC: 3, JZ: 4, JMP: 5, MOV: 6, RET: 7 };
    const REGS = ['a', 'b', 'c', 'n'];
    const regVars = () => REGS.map(V);
    const getR = (r) => CALL('get', r, ...regVars());
    const putR = (r, v) => CALL('put', V('p'), O('+', V('pc'), N(1)), r, v, ...regVars());
    const isOp = (name) => O('==', V('op'), N(OPC[name]));
    const field = (k) => AT(V('p'), k ? O('+', O('*', V('pc'), N(3)), N(k)) : O('*', V('pc'), N(3)));
    const INTERP = {
      main: FN(['p', 'n'], CALL('run', V('p'), N(0), N(0), N(0), N(0), V('n'))),
      run: FN(['p', 'pc', ...REGS],
        LET('op', field(0), LET('x', field(1), LET('y', field(2),
          IF(isOp('SET'), putR(V('x'), V('y')),
          IF(isOp('ADD'), putR(V('x'), O('+', getR(V('x')), getR(V('y')))),
          IF(isOp('MUL'), putR(V('x'), O('*', getR(V('x')), getR(V('y')))),
          IF(isOp('DEC'), putR(V('x'), O('-', getR(V('x')), N(1))),
          IF(isOp('JZ'), IF(O('==', getR(V('x')), N(0)),
            CALL('run', V('p'), V('y'), ...regVars()),
            CALL('run', V('p'), O('+', V('pc'), N(1)), ...regVars())),
          IF(isOp('JMP'), CALL('run', V('p'), V('x'), ...regVars()),
          IF(isOp('MOV'), putR(V('x'), getR(V('y'))),
            getR(V('x'))))))))))))),
      get: FN(['r', ...REGS],
        IF(O('==', V('r'), N(0)), V('a'), IF(O('==', V('r'), N(1)), V('b'), IF(O('==', V('r'), N(2)), V('c'), V('n'))))),
      put: FN(['p', 'pc', 'r', 'v', ...REGS],
        IF(O('==', V('r'), N(0)), CALL('run', V('p'), V('pc'), V('v'), V('b'), V('c'), V('n')),
        IF(O('==', V('r'), N(1)), CALL('run', V('p'), V('pc'), V('a'), V('v'), V('c'), V('n')),
        IF(O('==', V('r'), N(2)), CALL('run', V('p'), V('pc'), V('a'), V('b'), V('v'), V('n')),
          CALL('run', V('p'), V('pc'), V('a'), V('b'), V('c'), V('v')))))),
    };
    const MACHINE = {
      fact: { title: '階乗', code: [['SET', 'a', 1], ['JZ', 'n', 5], ['MUL', 'a', 'n'], ['DEC', 'n'], ['JMP', 1], ['RET', 'a']] },
      fib: { title: 'フィボナッチ数', code: [['SET', 'b', 1], ['JZ', 'n', 8], ['MOV', 'c', 'a'], ['ADD', 'c', 'b'], ['MOV', 'a', 'b'], ['MOV', 'b', 'c'], ['DEC', 'n'], ['JMP', 1], ['RET', 'a']] },
      sum: { title: '1 から n までの和', code: [['JZ', 'n', 4], ['ADD', 'a', 'n'], ['DEC', 'n'], ['JMP', 0], ['RET', 'a']] },
      pow2: { title: '2 の n 乗', code: [['SET', 'a', 1], ['SET', 'b', 2], ['JZ', 'n', 6], ['MUL', 'a', 'b'], ['DEC', 'n'], ['JMP', 2], ['RET', 'a']] },
    };
    // 命令を数の列にする（レジスタの名前は番号に）
    function assemble(code) {
      const out = [];
      for (const [op, x = 0, y = 0] of code) {
        if (!has(OPC, op)) throw new Error('知らない命令: ' + op);
        const v = (o) => {
          if (typeof o === 'number') return o;
          if (REGS.includes(o)) return REGS.indexOf(o);
          throw new Error('知らないレジスタ: ' + o);
        };
        out.push(OPC[op], v(x), v(y));
      }
      return out;
    }
    function describe([op, x, y]) {
      switch (op) {
        case 'SET': return x + ' ← ' + y;
        case 'ADD': return x + ' ← ' + x + ' + ' + y;
        case 'MUL': return x + ' ← ' + x + ' × ' + y;
        case 'DEC': return x + ' ← ' + x + ' − 1';
        case 'JZ': return x + ' が 0 なら ' + y + ' 番へ';
        case 'JMP': return x + ' 番へ';
        case 'MOV': return x + ' ← ' + y;
        case 'RET': return x + ' を答えにする';
      }
      return op;
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const form = $('f');
    const st = { ex: 'machine', prog: 'fact', stage: 2, known: 10, input: 10, P: null, res: null, err: '' };
    const num = (v) => (typeof v !== 'number' ? String(v) : Math.abs(v) >= 1e15 ? v.toExponential(6) : v.toLocaleString('ja-JP'));

    // コードを色分けして pre に入れる（文字列は textContent で入れる）
    function paint(pre, code) {
      pre.textContent = '';
      const re = /\b(function|return|if|const)\b|\b(\d+)\b|([A-Za-z_]\w*)(?=\()/g;
      let last = 0, m;
      while ((m = re.exec(code))) {
        if (m.index > last) pre.append(code.slice(last, m.index));
        const s = document.createElement('span');
        s.className = m[1] ? 'kw' : m[2] ? 'nu' : 'fn';
        s.textContent = m[0];
        pre.append(s);
        last = re.lastIndex;
      }
      pre.append(code.slice(last));
    }

    function compute() {
      st.err = '';
      try {
        if (st.ex === 'pow') st.res = specialize(POW, 'pow', { n: st.known });
        else {
          st.P = assemble(MACHINE[st.prog].code);
          st.res = specialize(INTERP, 'main', { p: st.P });
        }
      } catch (err) {
        st.res = null;
        st.err = err.message;
      }
    }

    function renderLeft() {
      const isPow = st.ex === 'pow';
      $('asm').hidden = isPow;
      $('srcBox').hidden = isPow;
      $('powSrc').hidden = !isPow;
      $('progSet').hidden = isPow;
      $('knownRow').hidden = !isPow;
      $('leftTitle').textContent = isPow ? '元のプログラム（小さな言語。JavaScript の形で表示）' : '機械の命令（インタプリタに渡すデータ）';
      if (isPow) { paint($('powSrc'), emitJS(POW, 'pow')); return; }
      const fns = st.res ? st.res.stages[st.stage].fns : {};
      const ol = $('asm');
      ol.textContent = '';
      MACHINE[st.prog].code.forEach((ins, i) => {
        const li = document.createElement('li');
        li.textContent = describe(ins);
        const name = 'run_' + i;
        if (Object.hasOwn(fns, name)) {
          li.className = 'head';
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = name;
          li.append(tag);
        }
        ol.append(li);
      });
    }

    const NOTE = [
      '① 呼び出しのたびに、先に分かっている引数の組ごとの専用の関数を作った。',
      '② 1か所からしか呼ばれない関数と、呼び出しを含まない小さな関数を呼び出し元へ埋め込んだ。',
      '③ どこでも使われない引数を消した。',
    ];
    function renderOut() {
      const info = $('info');
      if (!st.res) {
        $('out').textContent = '';
        info.className = 'err';
        info.textContent = '部分評価できませんでした: ' + st.err;
        return;
      }
      const s = st.res.stages[st.stage];
      paint($('out'), emitJS(s.fns, st.res.entry));
      info.className = 'mut';
      info.textContent = NOTE[st.stage] + ' 関数は ' + Object.keys(s.fns).length + ' 個（途中で作ったのは ' + st.res.made + ' 個）。';
    }

    function runCompare() {
      const real = $('real');
      if (!st.res) {
        $('r1').value = '';
        $('r2').value = '';
        $('b1').style.width = '0';
        $('b2').style.width = '0';
        real.textContent = '';
        return;
      }
      const isPow = st.ex === 'pow';
      const inputs = isPow ? { x: st.input } : { n: st.input };
      const s = st.res.stages[st.stage];
      const args = st.res.params.map((p) => inputs[p]);
      let a, b;
      try {
        a = isPow ? evaluate(POW, 'pow', [st.input, st.known]) : evaluate(INTERP, 'main', [st.P, st.input]);
        b = evaluate(s.fns, st.res.entry, args);
      } catch (err) {
        real.textContent = '動かせませんでした: ' + err.message;
        return;
      }
      $('r1').value = '答え ' + num(a.value) + '・' + num(a.steps) + ' 回';
      $('r2').value = '答え ' + num(b.value) + '・' + num(b.steps) + ' 回';
      const most = Math.max(a.steps, b.steps, 1);
      $('b1').style.width = (a.steps / most * 100) + '%';
      $('b2').style.width = (b.steps / most * 100) + '%';
      let msg = '部分評価した後は、式を計算する回数が ' + (a.steps / Math.max(1, b.steps)).toFixed(1) + ' 分の 1 になった。';
      try {
        const f = new Function(emitJS(s.fns, st.res.entry) + '\nreturn ' + st.res.entry + ';')();
        const v = f(...args);
        msg += ' 出来たコードを new Function で JavaScript として動かした答えは ' + num(v) + (Object.is(v, a.value) ? '（同じ）。' : '（違う）。');
      } catch (err) {
        msg += ' ここでは new Function が使えないので、JavaScript としての実行は省いた。';
      }
      real.textContent = msg;
    }

    function render() {
      renderLeft();
      renderOut();
      runCompare();
    }

    function setInputRange() {
      const inp = $('inp');
      const isPow = st.ex === 'pow';
      inp.max = isPow ? 12 : 20;
      st.input = isPow ? 3 : 10;
      inp.value = st.input;
      $('inpOut').value = st.input;
      $('inpLabel').textContent = '実行するときの入力 ' + (isPow ? 'x' : 'n');
    }

    form.addEventListener('submit', (ev) => ev.preventDefault());
    form.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.name === 'ex') { st.ex = t.value; setInputRange(); compute(); }
      else if (t.name === 'prog') { st.prog = t.value; compute(); }
      else if (t.name === 'kn') { st.known = Number(t.value); $('knOut').value = t.value; compute(); }
      else if (t.name === 'inp') { st.input = Number(t.value); $('inpOut').value = t.value; }
      else if (t.name === 'stage') st.stage = Number(t.value);
      render();
    });

    paint($('src'), emitJS(INTERP, 'main'));
    setInputRange();
    compute();
    render();

    // 一覧の小窓では、途中の形と入力を自動で切り替えて見せる
    if (window.THUMB) {
      document.body.classList.add('thumb');
      let k = 0;
      setInterval(() => {
        k++;
        st.stage = (2 + k) % 3;
        st.input = 3 + (k % 8);
        render();
      }, 1400);
    }
  },
});

dekiru.add({
  id: 'tr-20261119-h2-window-underflow', c: 'trend', lv: 2, date: '2026-11-19',
  t: '符号なしの引き算で上限の確かめが働かなくなる（nginx の HTTP/2 の脆弱性）',
  y: 'ふごうなしのひきざんでじょうげんのたしかめがはたらかなくなる',
  tags: ['nginx', 'HTTP/2', 'BigInt', '整数の桁あふれ', 'セキュリティ'],
  d: '2026年11月18日、Wiz Research などが nginx の HTTP/2 の処理にある2つの重大な脆弱性（CVE-2026-123633 と CVE-2026-123007）を公表し、Hacker News で1000点を超える話題になった。この見本は後者の「送信枠（send_window）の整数の桁あふれ」の流れを、計算だけの小さな模型で再現する。HTTP/2 では、相手が受け取れる量（枠）を超えて応答を送らないように、送る側が枠の残りを数える。記事によると nginx は、応答を積んだ時点でその分を枠から引き、ストリームが取り消されると、まだ送っていない分を上限を確かめずに枠へ返していた。そのあと WINDOW_UPDATE（枠を増やす知らせ）を受けると「上限 − 今の枠」で余裕を計算するが、符号なしの整数なので、今の枠が上限を超えていると答えが負にならずに巨大な数になり、確かめが通ってしまう。枠を増やし続けると、符号付き（off_t）で読んだときに負になり、送る長さが負になる。見本では、元の書き方と直した書き方（返すときに上限で止め、確かめを足し算で書く一例で、nginx の実際の修正と同じとは限らない）を並べ、同じ操作を両方に送る。整数は BigInt.asUintN と BigInt.asIntN で 64 ビットの符号なし・符号付きを再現した。実際の通信やフレームのバイト列、nginx のコード、負の長さから先の範囲外のメモリのコピー（攻撃の手順）は扱わない。もう1つの脆弱性（接続の use-after-free）も扱わない。記事の表では、影響があるのは 1.9.5 から 1.31.8 までで、1.30.7 と 1.31.9 で直っている。',
  p: '符号なしの整数は負の数を表せないので、引き算の答えが負になると 2 の 64 乗を足した大きな数になる。「増やす量 > 上限 − 今の値」という確かめは、今の値が上限以下のときだけ正しく働き、今の値が上限を超えていると逆の答えを返す。だから「値が上限を超えない」という決まりを、値を変えるすべての場所（ここでは取り消して返す所）で守る必要がある。確かめは「今の値 + 増やす量 > 上限」のように、桁あふれしない広さの型で足し算として書くと安全になる。JavaScript の BigInt.asUintN(64, x) と BigInt.asIntN(64, x) を使うと、C の 64 ビット整数の一回りと型の変換を、そのままの数で確かめられる。何十億回の WINDOW_UPDATE は、次に答えが変わるまでの回数を割り算で求めてまとめて足すので、すぐ終わる。',
  refs: [
    { title: 'Unauthenticated Remote Code Execution in NGINX: CVE-2026-123633 and CVE-2026-123007（Wiz Blog）', url: 'https://www.wiz.io/blog/nginx-http2-rce-vulnerabilities' },
    { title: 'Hacker News: Unauthenticated remote code execution in Nginx', url: 'https://news.ycombinator.com/item?id=50547374' },
    { title: 'RFC 9113 HTTP/2 6.9 Flow Control', url: 'https://www.rfc-editor.org/rfc/rfc9113#section-6.9' },
  ],
  html: `<div class="wrap">
  <p id="cap" class="cap" role="status"></p>
  <section id="cols" class="cols" aria-label="元の書き方と直した書き方"></section>
  <div class="ctl">
    <fieldset>
      <legend>サーバー（nginx の役）</legend>
      <button type="button" data-ev="queue">応答を積む（16KB まで）</button>
      <button type="button" data-ev="send">積んだ分を送り終える</button>
    </fieldset>
    <fieldset>
      <legend>相手（クライアントの役）</legend>
      <label>増やす量
        <select id="inc">
          <option value="fill">上限まで（サーバーの残りに合わせる）</option>
          <option value="65535">65,535</option>
          <option value="1000000">1,000,000</option>
          <option value="2147483647" selected>2,147,483,647（1回の最大）</option>
        </select>
      </label>
      <label>回数
        <select id="times">
          <option value="1" selected>1 回</option>
          <option value="1000">1,000 回</option>
          <option value="1000000">100 万回</option>
          <option value="4294967296">約 43 億回（2 の 32 乗）</option>
          <option value="6442450944">約 64 億回</option>
        </select>
      </label>
      <button type="button" data-ev="update">WINDOW_UPDATE を送る</button>
      <button type="button" data-ev="cancel">ストリームを取り消す（RST_STREAM）</button>
    </fieldset>
    <div class="row">
      <button type="button" id="auto" aria-pressed="false">手順どおりに進める</button>
      <button type="button" id="reset">最初から</button>
      <span class="mut">回数の多い WINDOW_UPDATE は、1回ずつ確かめたときと同じ結果をまとめて計算する</span>
    </div>
  </div>
</div>`,
  css: `:root { color-scheme: dark; --bg: #10131a; --fg: #e2e6ef; --mut: #98a2b8; --line: #2b3346; --code: #0a0d13; --acc: #6fb3ff; --ok: #46d39a; --warn: #ffc562; --bad: #ff7a7a; --safe: #7dcfff; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.5 system-ui, sans-serif; accent-color: var(--acc); }
    [hidden] { display: none !important; }
    .wrap { display: flex; flex-direction: column; gap: 8px; padding: 8px; box-sizing: border-box; }
    .cap { margin: 0; min-height: 3em; padding: 6px 8px; border-left: 3px solid var(--acc); background: #161b26; border-radius: 4px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
    @media (min-width: 560px) { .cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .pane { --lv: var(--ok); min-width: 0; display: flex; flex-direction: column; gap: 4px; padding: 8px; border: 1px solid var(--line); border-top: 3px solid var(--lv); border-radius: 6px; }
    .pane[data-lv="warn"] { --lv: var(--warn); }
    .pane[data-lv="bad"] { --lv: var(--bad); }
    .pane[data-lv="safe"] { --lv: var(--safe); }
    h2 { margin: 0; font-size: 14px; }
    .sub, .mut { margin: 0; color: var(--mut); font-size: 12px; }
    pre.code { margin: 0; padding: 6px 8px; background: var(--code); border: 1px solid var(--line); border-radius: 6px; font: 11.5px/1.6 ui-monospace, Consolas, monospace; overflow-x: auto; }
    .code .cm { color: var(--mut); }
    .code .hit { background: #2a3550; outline: 1px solid var(--acc); border-radius: 2px; }
    dl { margin: 0; display: grid; gap: 2px; }
    dl div { display: grid; grid-template-columns: minmax(0, 10.5em) minmax(0, 1fr); gap: 6px; }
    dt { color: var(--mut); font-size: 12px; }
    dd { margin: 0; font: 12px/1.5 ui-monospace, Consolas, monospace; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .neg { color: var(--bad); }
    .meter { position: relative; height: 12px; background: #1b2130; border-radius: 6px; overflow: hidden; }
    .meter .fill { position: absolute; top: 0; bottom: 0; left: 0; width: 0; background: var(--lv); transition: width .4s; }
    .meter .fill.off { background: repeating-linear-gradient(135deg, var(--bad) 0 6px, #7a2f2f 6px 12px); }
    .meter .maxline { position: absolute; top: 0; bottom: 0; left: 75%; width: 2px; background: var(--fg); }
    .chk { margin: 0; font-size: 12px; overflow-wrap: anywhere; }
    .buf { position: relative; height: 18px; background: #1b2130; border-radius: 4px; overflow: hidden; }
    .buf .seg { position: absolute; top: 4px; bottom: 4px; left: 40%; width: 0; background: var(--ok); border-radius: 2px; transition: left .4s, width .4s; }
    .buf .seg.bad { background: repeating-linear-gradient(135deg, var(--bad) 0 5px, #7a2f2f 5px 10px); }
    .buf .pt { position: absolute; top: 0; left: 40%; font: 10px/18px system-ui, sans-serif; transform: translateX(-50%); transition: left .4s; text-shadow: 0 0 3px #000; }
    .bufcap { margin: 0; font-size: 12px; color: var(--mut); overflow-wrap: anywhere; }
    .state { margin: 0; font-weight: 600; color: var(--lv); }
    .log { margin: 0; padding-left: 1.4em; font-size: 12px; color: var(--mut); max-height: 9.5em; overflow: auto; }
    .log li:last-child { color: var(--fg); }
    .ctl { display: flex; flex-direction: column; gap: 6px; }
    fieldset { border: 1px solid var(--line); border-radius: 6px; margin: 0; padding: 4px 8px 8px; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
    legend { color: var(--mut); padding: 0 4px; }
    .row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
    button, select { font: inherit; min-block-size: 28px; }
    button { padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; background: #1d2433; color: var(--fg); cursor: pointer; }
    button:hover { background: #26304a; }
    button[aria-pressed="true"] { background: #2a3f66; border-color: var(--acc); }
    select { background: #1d2433; color: var(--fg); border: 1px solid var(--line); border-radius: 6px; }
    :focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .meter .fill, .buf .seg, .buf .pt { transition: none; } }
    .thumb .ctl, .thumb .code, .thumb .sub, .thumb .log, .thumb .chk, .thumb .bufcap, .thumb dl div:not(:first-child) { display: none; }
    .thumb .wrap { padding: 6px; gap: 6px; }
    .thumb .cols { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .thumb .cap { font-size: 11.5px; min-height: 0; padding: 4px 6px; }
    .thumb .pane { padding: 6px; }
    .thumb dl div { grid-template-columns: minmax(0, 1fr); }`,
  core() {
    // HTTP/2 の接続の送信枠（send_window）の模型。枠は 64 ビットの符号なし整数として BigInt で数える
    const MAX = 2147483647n;   // 2 の 31 乗 − 1。HTTP/2 の枠の上限
    const INIT = 65535n;       // 接続の枠の最初の値
    const CHUNK = 16384n;      // 1回に積む応答の大きさ
    const TWO64 = 1n << 64n;
    const u64 = (x) => BigInt.asUintN(64, x);   // C の 64 ビット符号なし整数のように一回りさせる
    const s64 = (x) => BigInt.asIntN(64, x);    // 同じビットを符号付き（off_t）として読む
    const bmin = (a, b) => (a < b ? a : b);
    const newConn = () => ({ sw: INIT, queued: 0n, sent: 0n, closed: false });

    // 応答を積む。送る長さは枠を符号付きで読んで決め、積んだ時点でその分を枠から引く
    function queueData(c) {
      if (c.closed) return { conn: c, kind: 'closed', len: null };
      const len = bmin(CHUNK, s64(c.sw));
      if (len < 0n) return { conn: c, kind: 'negative', len };
      if (len === 0n) return { conn: c, kind: 'wait', len };
      return { conn: { ...c, sw: u64(c.sw - len), queued: c.queued + len }, kind: 'ok', len };
    }

    // 積んだ応答を送り終える（枠は積んだときに引いてあるので変わらない）
    function sendQueued(c) {
      if (c.closed) return { conn: c, kind: 'closed', amount: 0n };
      return { conn: { ...c, queued: 0n, sent: c.sent + c.queued }, kind: c.queued > 0n ? 'ok' : 'none', amount: c.queued };
    }

    // ストリームの取り消し。まだ送っていない分を枠に返す
    function cancelStream(c, mode) {
      if (c.closed) return { conn: c, kind: 'closed', back: 0n };
      const back = c.queued;
      if (mode === 'old') {
        const sw = u64(c.sw + back);   // 上限を確かめずに足す
        return { conn: { ...c, sw, queued: 0n }, kind: sw > MAX ? 'over' : 'ok', back };
      }
      if (back > MAX - c.sw) return { conn: { ...c, sw: MAX, queued: 0n }, kind: 'capped', back };
      return { conn: { ...c, sw: c.sw + back, queued: 0n }, kind: 'ok', back };
    }

    // WINDOW_UPDATE を times 回受ける。同じ答えが続く所はまとめて数えるので、何十億回でもすぐ終わる
    function windowUpdate(c, inc, times, mode) {
      if (inc < 1n || inc > MAX) throw new RangeError('増やす量は 1 から 2147483647 まで');
      if (times < 1n) throw new RangeError('回数は 1 以上');
      if (c.closed) return { conn: c, kind: 'closed', accepted: 0n };
      // 確かめの式の右辺。元の書き方は符号なしの引き算なので、負になると 2 の 64 乗を足した数になる
      const roomOf = (sw) => (mode === 'old' ? u64(MAX - sw) : MAX - sw);
      let sw = c.sw, left = times, accepted = 0n, swCheck = sw;
      for (let guard = 0; left > 0n; guard++) {
        if (guard > 64) throw new Error('計算が終わりません');
        if (inc > roomOf(sw)) {
          return { conn: { ...c, sw, closed: true }, kind: 'rejected', accepted, swCheck: sw, room: roomOf(sw), pass: false };
        }
        // 次に答えが変わるまでの回数 k をまとめて足す
        let k;
        if (sw > MAX) {
          // 枠が上限を超えていると、確かめはいつも通る。2 の 64 乗に届いて一回りするまで増え続ける
          k = (TWO64 - sw + inc - 1n) / inc;
        } else {
          // 枠が上限以下なら、上限を超えない間だけ通る（inc <= MAX - sw なので k は 1 以上）
          k = (MAX - sw) / inc;
        }
        k = bmin(k, left);
        swCheck = u64(sw + (k - 1n) * inc);   // まとめた中で最後に確かめたときの枠
        sw = u64(sw + k * inc);
        accepted += k;
        left -= k;
      }
      return { conn: { ...c, sw }, kind: 'ok', accepted, swCheck, room: roomOf(swCheck), pass: true };
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const fmt = (b) => b.toLocaleString('ja-JP');
    const compact = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 });
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const MODES = [
      { key: 'old', title: '元の書き方', sub: '返すときに上限を確かめず、確かめの式を符号なしの引き算で書く', code: [
        [null, '// ストリームを取り消したとき（送っていない分を返す）'],
        ['cancel', 'send_window += unsent;'],
        [null, '// WINDOW_UPDATE を受けたとき（符号なしで引く）'],
        ['update', 'if (inc > MAX - send_window) 接続を切る;'],
        ['update', 'send_window += inc;'],
        [null, '// 応答を積むとき'],
        ['queue', 'len = min(16384, (off_t) send_window);'],
      ] },
      { key: 'new', title: '直した書き方（一例）', sub: '返すときに上限で止め、確かめの式を足し算で書く', code: [
        [null, '// ストリームを取り消したとき'],
        ['cancel', 'send_window = min(send_window + unsent, MAX);'],
        [null, '// WINDOW_UPDATE を受けたとき（足しても 2^32 未満）'],
        ['update', 'if (send_window + inc > MAX) 接続を切る;'],
        ['update', 'send_window += inc;'],
        [null, '// 応答を積むとき'],
        ['queue', 'len = min(16384, (off_t) send_window);'],
      ] },
    ];

    // 2つの欄を作る
    const P = {};
    for (const m of MODES) {
      const k = m.key;
      const el = document.createElement('article');
      el.className = 'pane';
      el.setAttribute('aria-labelledby', 'h-' + k);
      const code = m.code.map(([tag, s]) => (tag ? `<span data-k="${tag}">${esc(s)}</span>` : `<span class="cm">${esc(s)}</span>`)).join('\n');
      el.innerHTML = `<h2 id="h-${k}">${m.title}</h2>
        <p class="sub">${m.sub}</p>
        <pre class="code" tabindex="0" aria-label="${m.title}の要点のコード">${code}</pre>
        <dl>
          <div><dt>送信枠 send_window</dt><dd id="sw-${k}"></dd></div>
          <div><dt>符号付きで読むと</dt><dd id="sg-${k}"></dd></div>
          <div><dt>積んだまま送っていない応答</dt><dd id="q-${k}"></dd></div>
        </dl>
        <div class="meter" aria-hidden="true"><span class="fill" id="bar-${k}"></span><span class="maxline"></span></div>
        <p class="chk" id="chk-${k}"></p>
        <div class="buf" aria-hidden="true" id="buf-${k}"><span class="seg"></span><span class="pt s">始</span><span class="pt e">終</span></div>
        <p class="bufcap" id="bufc-${k}"></p>
        <p class="state" id="st-${k}"></p>
        <ol class="log" id="log-${k}" aria-label="${m.title}の記録"></ol>`;
      $('cols').append(el);
      P[k] = { el, conn: newConn(), lastLen: null, chk: null, hit: null, log: [] };
    }

    function render() {
      for (const m of MODES) {
        const k = m.key, p = P[k], c = p.conn;
        const signed = s64(c.sw);
        const ratio = Number(c.sw) / Number(MAX);
        let extra = '';
        if (c.sw > MAX) extra = ratio < 2 ? '（上限より ' + fmt(c.sw - MAX) + ' 多い）' : '（上限の約 ' + compact.format(ratio) + ' 倍）';
        $('sw-' + k).textContent = fmt(c.sw) + extra;
        const sg = $('sg-' + k);
        sg.textContent = fmt(signed);
        sg.classList.toggle('neg', signed < 0n);
        $('q-' + k).textContent = fmt(c.queued) + ' バイト';
        const bar = $('bar-' + k);
        bar.style.width = Math.min(100, ratio * 75) + '%';
        bar.classList.toggle('off', ratio * 75 > 100);

        // 最後に確かめた式
        const chk = $('chk-' + k);
        if (!p.chk) chk.textContent = '確かめの式: まだ WINDOW_UPDATE を受けていない';
        else {
          const { inc, room, swCheck, pass } = p.chk;
          const end = pass ? '。偽なので通す' : '。真なので接続を切る';
          chk.textContent = k === 'old'
            ? 'inc > MAX − send_window を計算すると ' + fmt(inc) + ' > ' + fmt(room) + end + (swCheck > MAX ? '（上限 − 枠が負になり、2 の 64 乗を足した数に変わった）' : '')
            : 'send_window + inc > MAX を計算すると ' + fmt(swCheck + inc) + ' > ' + fmt(MAX) + end;
        }

        // 今回積んだ範囲（始まりと終わり）
        const buf = $('buf-' + k), seg = buf.querySelector('.seg'), ps = buf.querySelector('.s'), pe = buf.querySelector('.e');
        const L = p.lastLen, cap = $('bufc-' + k);
        seg.classList.toggle('bad', L !== null && L < 0n);
        ps.style.left = '40%';
        if (c.closed) {
          cap.textContent = '接続を閉じたので、これ以上は積まない（最後に積んだ範囲のまま）';
        } else if (L === null || L === 0n) {
          seg.style.left = '40%'; seg.style.width = '0'; pe.style.left = '40%';
          cap.textContent = L === null ? '応答を積むと、今回の範囲の始まりと終わりがここに出る' : '今回の範囲: 長さ 0（枠が空くのを待つ）';
        } else if (L > 0n) {
          const w = Number(L) / 16384 * 45;
          seg.style.left = '40%'; seg.style.width = w + '%'; pe.style.left = (40 + w) + '%';
          cap.textContent = '今回の範囲: 始まり 0、終わり ' + fmt(L) + '（' + fmt(L) + ' バイト）';
        } else {
          seg.style.left = '0'; seg.style.width = '40%'; pe.style.left = '4%';
          cap.textContent = '今回の範囲: 終わりが始まりより ' + fmt(-L) + ' バイト前を指す。実物ではこの先で長さの型が何度も変わり、範囲の外のメモリをコピーする（この模型はここで止める）';
        }

        // 状態
        let lv = 'ok', st = '正常（枠は 0 から上限までの間）';
        if (c.closed) { lv = 'safe'; st = 'FLOW_CONTROL_ERROR で接続を閉じた。枠はこれ以上増えない'; }
        else if (L !== null && L < 0n) { lv = 'bad'; st = '送る長さが負になった'; }
        else if (signed < 0n) { lv = 'bad'; st = '枠が上限を大きく超え、符号付きで読むと負になった'; }
        else if (c.sw > MAX) { lv = 'warn'; st = '枠が上限を超えた（HTTP/2 では起きないはずの値）'; }
        p.el.dataset.lv = lv;
        $('st-' + k).textContent = st;

        for (const s of p.el.querySelectorAll('[data-k]')) s.classList.toggle('hit', s.dataset.k === p.hit);
        const ol = $('log-' + k);
        ol.replaceChildren(...p.log.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
        ol.scrollTop = ol.scrollHeight;
      }
    }

    // 同じ操作を両方の欄に送る
    function apply(ev) {
      let inc = ev.inc;
      if (ev.fill) { const s = P.old.conn.sw; inc = s < MAX ? MAX - s : 1n; }
      for (const m of MODES) {
        const k = m.key, p = P[k], before = p.conn.sw;
        let r, text;
        if (ev.type === 'queue') {
          r = queueData(p.conn);
          if (r.kind !== 'closed') p.lastLen = r.len;
          text = r.kind === 'ok' ? '応答を ' + fmt(r.len) + ' バイト積み、枠から引いた（' + fmt(before) + ' → ' + fmt(r.conn.sw) + '）'
            : r.kind === 'wait' ? '枠が 0 なので積めない。WINDOW_UPDATE を待つ'
            : r.kind === 'negative' ? '送る長さが ' + fmt(r.len) + ' になった'
            : '接続は閉じている';
        } else if (ev.type === 'send') {
          r = sendQueued(p.conn);
          text = r.kind === 'closed' ? '接続は閉じている' : r.kind === 'none' ? '送るものが無い' : fmt(r.amount) + ' バイトを送り終えた（枠は積んだときに引いてある）';
        } else if (ev.type === 'cancel') {
          r = cancelStream(p.conn, k);
          text = r.kind === 'closed' ? '接続は閉じている'
            : r.back === 0n ? 'ストリームを取り消した。返す分は無い'
            : r.kind === 'capped' ? '取り消して ' + fmt(r.back) + ' バイト分を返すと上限を超えるので、上限 ' + fmt(MAX) + ' で止めた'
            : '取り消して、送っていない ' + fmt(r.back) + ' バイト分を枠に返した（→ ' + fmt(r.conn.sw) + (r.kind === 'over' ? '。上限を超えた）' : '）');
        } else {
          r = windowUpdate(p.conn, inc, ev.times, k);
          if (r.kind !== 'closed') p.chk = { inc, room: r.room, swCheck: r.swCheck, pass: r.pass };
          const n = ev.times === 1n ? '' : ' を ' + fmt(ev.times) + ' 回';
          text = r.kind === 'closed' ? '接続は閉じている'
            : r.kind === 'ok' ? 'WINDOW_UPDATE +' + fmt(inc) + n + ': 確かめを通り、枠は ' + fmt(r.conn.sw)
            : (r.accepted > 0n ? fmt(r.accepted) + ' 回目までは通ったが、次で' : 'WINDOW_UPDATE +' + fmt(inc) + ' で') + '枠が上限を超えるので FLOW_CONTROL_ERROR で接続を閉じた';
        }
        p.conn = r.conn;
        p.hit = r.kind === 'closed' || ev.type === 'send' ? null : ev.type;
        p.log.push(text);
        if (p.log.length > 40) p.log.shift();
      }
      render();
    }

    function reset() {
      for (const m of MODES) Object.assign(P[m.key], { conn: newConn(), lastLen: null, chk: null, hit: null, log: ['接続を開いた。枠は ' + fmt(INIT) + ' バイト'] });
      step = 0;
      render();
    }

    // 手順どおりに進める
    const STEPS = [
      { ev: { type: 'queue' }, say: '① サーバーが応答を 16,384 バイト積む。nginx は積んだ時点で、その分を枠から引く。' },
      { ev: { type: 'update', fill: true, times: 1n }, say: '② 相手が WINDOW_UPDATE を送り、サーバーの残りの枠を上限（2,147,483,647）ちょうどまで増やす。ここまでは決まりどおり。' },
      { ev: { type: 'cancel' }, say: '③ 相手がストリームを取り消す。送っていない 16,384 バイト分が枠に返され、元の書き方では枠が上限を超える。直した書き方は上限で止める。' },
      { ev: { type: 'update', inc: MAX, times: 1n }, say: '④ 相手がもう一度 WINDOW_UPDATE を送る。元の書き方では「上限 − 枠」が負になり、符号なしなので巨大な数に変わって確かめを通る。直した書き方は接続を切る。' },
      { ev: { type: 'update', inc: MAX, times: 6442450944n }, say: '⑤ 同じ WINDOW_UPDATE を約 64 億回送ったとして、まとめて計算する。枠は 2 の 63 乗を超え、符号付きで読むと負になる。' },
      { ev: { type: 'queue' }, say: '⑥ サーバーが次の応答を積む。送る長さを符号付きの枠から決めるので、長さが負になり、範囲の終わりが始まりより前を指す。' },
    ];
    const START_SAY = 'nginx の元の書き方と直した書き方に、同じ操作を送って比べる。';
    let timer = 0, step = 0;
    const autoBtn = $('auto');
    function stopAuto() {
      clearTimeout(timer);
      timer = 0;
      autoBtn.setAttribute('aria-pressed', 'false');
      autoBtn.textContent = '手順どおりに進める';
    }
    function tick() {
      if (step < STEPS.length) {
        const s = STEPS[step++];
        apply(s.ev);
        $('cap').textContent = s.say;
        timer = setTimeout(tick, window.THUMB ? 1700 : 3400);
      } else if (window.THUMB) {
        reset();
        $('cap').textContent = START_SAY;
        timer = setTimeout(tick, 1200);
      } else {
        stopAuto();
        $('cap').textContent = '手順の終わり。下のボタンで1つずつ試すこともできる（「最初から」で枠を戻す）。';
      }
    }
    function startAuto() {
      stopAuto();
      reset();
      autoBtn.setAttribute('aria-pressed', 'true');
      autoBtn.textContent = '止める';
      $('cap').textContent = START_SAY;
      timer = setTimeout(tick, 1500);
    }

    autoBtn.addEventListener('click', () => {
      if (timer) { stopAuto(); $('cap').textContent = '止めた。下のボタンで1つずつ進められる。'; }
      else startAuto();
    });
    $('reset').addEventListener('click', () => {
      stopAuto();
      reset();
      $('cap').textContent = '最初に戻した。枠は ' + fmt(INIT) + ' バイト。';
    });
    document.querySelector('.ctl').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-ev]');
      if (!b) return;
      stopAuto();
      const type = b.dataset.ev;
      const ev = { type };
      if (type === 'update') {
        const v = $('inc').value;
        if (v === 'fill') ev.fill = true;
        else ev.inc = BigInt(v);
        ev.times = BigInt($('times').value);
      }
      apply(ev);
      $('cap').textContent = '操作: ' + b.textContent + (type === 'update' ? '（' + $('inc').selectedOptions[0].textContent + '、' + $('times').selectedOptions[0].textContent + '）' : '');
    });

    if (window.THUMB) document.documentElement.classList.add('thumb');
    reset();
    startAuto();
  },
});

dekiru.add({
  id: 'tr-20261119-upcase-overflow', c: 'trend', lv: 2, date: '2026-11-19',
  t: '大文字にすると長くなる文字で、領域を1バイト越えて書く（Ruby の ß の脆弱性）',
  y: 'おおもじにするとながくなるもじでりょういきをいちばいとこえてかく',
  tags: ['Ruby', 'Unicode', 'toUpperCase', 'ヒープのあふれ', 'セキュリティ'],
  d: '2026年11月18日、Ruby の開発チームが、正規表現と文字列の大文字・小文字の変換にある7つの脆弱性を公表した（Ruby 4.0.10・3.4.13・3.3.14 で修正）。告知は Hacker News で250点を超え、そのうちの1つ（GHSA-34m4-m9fh-gqp5）を見つけた Veria Labs の解説「ruby2ßhell」も話題になった。ISO-8859-1 などの1文字1バイトの文字コードには大文字の ß が無いので、upcase は ß を「SS」の2バイトにする。ところが変換の繰り返しは、書く前に空きを1バイト分しか確かめない。そのため、領域（入力の長さ + 20 バイト）の最後の1バイトの位置で ß を変換すると、2バイト目が領域の外へ書かれる。解説によると、Rails と Sinatra は既定の設定のままこの処理に届く。前半の見本は、その繰り返しを1文字ずつ動かし、領域と隣の領域のバイトを並べて、どこに何を書いたかを見せる。ß が 21 個ならあふれ、22 個ならあふれない理由も確かめられる。直した書き方（書く前に2バイト分の空きを確かめ、足りなければ次の領域へ回す）は一例で、Ruby の実際の修正と同じとは限らない。後半は、ブラウザの toUpperCase と toLowerCase を全部の文字（約111万）に当て、文字の数や UTF-8 のバイト数が変わる文字を探す。Ruby の実物のコード、メモリの管理の仕組み、1バイトの書き換えから先の攻撃の手順は扱わない。正規表現の脆弱性も扱わない。',
  p: '大文字・小文字の変換では、1文字が1文字になるとは限らない。ß は大文字にすると SS の2文字になり、合字の ﬁ は FI、点付きの İ は小文字にすると i と結合用の点の2つになる。UTF-8 では、ȿ（2バイト）の大文字の Ȿ が3バイトになるように、文字の数が同じでもバイト数が変わることがある。だから変換の後の長さを変換の前と同じと決めて領域を用意すると、足りなくなる。1回に何バイトも書く処理では、書く前に、書くバイト数の分の空きを確かめる。JavaScript の toUpperCase は Unicode の決まりどおりに長さの変わった文字列を返すので、String.fromCodePoint で全部のコードポイントを順に作って変換すれば、長さが変わる文字を数えられる。この繰り返しは約111万回あるので、50ミリ秒ごとに scheduler.yield()（無いブラウザでは setTimeout）で区切り、画面が止まらないようにした。',
  refs: [
    { title: 'Security advisories: multiple vulnerabilities in Regexp and String case conversion（ruby-lang.org）', url: 'https://www.ruby-lang.org/en/news/2026/11/18/multiple-vulnerabilities-in-regexp-and-string/' },
    { title: 'ruby2ßhell（Veria Labs）', url: 'https://verialabs.com/ruby2shell/' },
    { title: 'Hacker News: Multiple vulnerabilities in Regexp and String case conversion', url: 'https://news.ycombinator.com/item?id=50554038' },
    { title: 'Hacker News: Ruby2ßhell: Pre-authentication RCE on stock Rails', url: 'https://news.ycombinator.com/item?id=50556287' },
    { title: 'Unicode SpecialCasing.txt（長さが変わる大文字・小文字の対応表）', url: 'https://www.unicode.org/Public/UCD/latest/ucd/SpecialCasing.txt' },
  ],
  html: `<div class="wrap">
  <section class="part sim" aria-labelledby="h-sim">
    <h2 id="h-sim">1. Ruby の upcase の繰り返しを1文字ずつ動かす（ISO-8859-1、1文字1バイト）</h2>
    <p id="cap" class="cap" role="status"></p>
    <div class="ctl">
      <label class="txt">入力の文字列（40文字まで。ISO-8859-1 に無い文字は ? になる）
        <input id="in" type="text" maxlength="40" spellcheck="false" autocomplete="off">
      </label>
      <div class="row" role="group" aria-label="入力の例">
        <span class="mut">例:</span>
        <button type="button" data-pre="word">Straße</button>
        <button type="button" data-pre="s20">ß × 20</button>
        <button type="button" data-pre="s21">ß × 21</button>
        <button type="button" data-pre="s22">ß × 22</button>
        <button type="button" data-pre="as21">a + ß × 21</button>
      </div>
      <div class="row">
        <button type="button" id="step">1文字進める</button>
        <button type="button" id="auto" aria-pressed="false">自動で進める</button>
        <button type="button" id="all">最後まで</button>
        <button type="button" id="reset">最初から</button>
      </div>
      <p id="note" class="mut"></p>
    </div>
    <div id="cols" class="cols"></div>
    <p class="mut legend"><span class="sw sw-w"></span>領域に書いたバイト<span class="sw sw-nb"></span>隣の領域（別のデータ。値は例）<span class="sw sw-bad"></span>領域の外に書いたバイト。黄色の線が to_end（領域の終わり）、点線の枠は次に書く位置 to。</p>
  </section>
  <section class="part scan" aria-labelledby="h-scan">
    <h2 id="h-scan">2. ブラウザの toUpperCase と toLowerCase で、長さが変わる文字を全部探す</h2>
    <div class="row">
      <button type="button" id="scan">全部の文字を調べる（約111万文字）</button>
      <progress id="prog" max="1" value="0" aria-label="調べた割合"></progress>
      <span id="scanMsg" class="mut" role="status"></span>
    </div>
    <div id="cats" class="cats"></div>
    <label class="txt">試す文字列（上の文字を押すとここに入る）
      <input id="try" type="text" spellcheck="false" autocomplete="off">
    </label>
    <div class="tw" tabindex="0" role="region" aria-labelledby="tcap">
      <table>
        <caption id="tcap">変換の前と後の長さ</caption>
        <thead><tr><th scope="col">変換</th><th scope="col">文字列</th><th scope="col">.length（UTF-16）</th><th scope="col">文字の数</th><th scope="col">UTF-8 のバイト数</th></tr></thead>
        <tbody id="tb"></tbody>
      </table>
    </div>
  </section>
</div>`,
  css: `:root { color-scheme: dark; --bg: #10131a; --fg: #e2e6ef; --mut: #98a2b8; --line: #2b3346; --code: #0a0d13; --acc: #6fb3ff; --ok: #46d39a; --warn: #ffc562; --bad: #ff7a7a; --safe: #7dcfff; --cell: #1b2130; --w: #22406a; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.5 system-ui, sans-serif; accent-color: var(--acc); }
    [hidden] { display: none !important; }
    .wrap { display: flex; flex-direction: column; gap: 16px; padding: 8px; box-sizing: border-box; }
    .part { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    h2 { margin: 0; font-size: 14px; }
    h3 { margin: 0; font-size: 13.5px; }
    .cap { margin: 0; min-height: 3em; padding: 6px 8px; border-left: 3px solid var(--acc); background: #161b26; border-radius: 4px; }
    .mut, .sub { margin: 0; color: var(--mut); font-size: 12px; }
    .ctl { display: flex; flex-direction: column; gap: 6px; }
    .row { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
    .txt { display: flex; flex-direction: column; gap: 2px; color: var(--mut); font-size: 12px; }
    input[type="text"] { font: 14px/1.4 ui-monospace, Consolas, monospace; padding: 4px 8px; background: var(--code); color: var(--fg); border: 1px solid var(--line); border-radius: 6px; min-block-size: 32px; box-sizing: border-box; max-width: 100%; }
    button { font: inherit; min-block-size: 28px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; background: #1d2433; color: var(--fg); cursor: pointer; }
    button:hover { background: #26304a; }
    button:disabled { opacity: .6; cursor: default; }
    button[aria-pressed="true"] { background: #2a3f66; border-color: var(--acc); }
    :focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
    @media (min-width: 640px) { .cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .pane { --lv: var(--ok); min-width: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--line); border-top: 3px solid var(--lv); border-radius: 6px; }
    .pane[data-lv="bad"] { --lv: var(--bad); }
    .pane[data-lv="safe"] { --lv: var(--safe); }
    .pane[data-lv="wait"] { --lv: var(--mut); }
    pre.code { margin: 0; padding: 6px 8px; background: var(--code); border: 1px solid var(--line); border-radius: 6px; font: 11.5px/1.6 ui-monospace, Consolas, monospace; overflow-x: auto; }
    .code .cm { color: var(--mut); }
    .code .hit { background: #2a3550; outline: 1px solid var(--acc); border-radius: 2px; }
    .mem { display: grid; grid-template-columns: repeat(auto-fill, minmax(26px, 1fr)); gap: 3px; }
    .cell { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 32px; background: var(--cell); border-radius: 3px; font: 13px/1.1 ui-monospace, Consolas, monospace; color: var(--mut); }
    .cell .hx { font-size: 9px; color: var(--mut); }
    .cell.w { background: var(--w); color: var(--fg); }
    .cell.new { background: #2f5f9e; }
    .cell.nb { background: repeating-linear-gradient(135deg, #2a3142 0 4px, var(--cell) 4px 8px); color: var(--fg); }
    .cell.end { box-shadow: -3px 0 0 var(--warn); }
    .cell.bad { background: var(--bad); color: #1a0a0a; }
    .cell.bad .hx { color: #1a0a0a; }
    .cell.at { outline: 2px dashed var(--acc); outline-offset: -2px; }
    dl { margin: 0; display: flex; flex-wrap: wrap; gap: 2px 14px; }
    dl div { display: flex; gap: 6px; }
    dt { color: var(--mut); font-size: 12px; }
    dd { margin: 0; font: 12px/1.5 ui-monospace, Consolas, monospace; font-variant-numeric: tabular-nums; }
    .state { margin: 0; font-weight: 600; color: var(--lv); }
    .out { margin: 0; font: 12px/1.5 ui-monospace, Consolas, monospace; overflow-wrap: anywhere; color: var(--mut); }
    .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 2px; vertical-align: -2px; margin: 0 4px 0 10px; }
    .legend .sw:first-child { margin-left: 0; }
    .sw-w { background: var(--w); }
    .sw-nb { background: repeating-linear-gradient(135deg, #2a3142 0 3px, var(--cell) 3px 6px); outline: 1px solid var(--line); }
    .sw-bad { background: var(--bad); }
    progress { inline-size: 160px; }
    .cats { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
    @media (min-width: 640px) { .cats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .cat { min-width: 0; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; }
    .cat h3 .n { color: var(--acc); font-weight: 400; margin-left: 6px; }
    .chips { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
    .chips button { min-block-size: 26px; padding: 1px 6px; font: 13px/1.3 ui-monospace, Consolas, monospace; }
    .chips small { color: var(--mut); font-size: 10px; margin-left: 4px; }
    .chips .more { color: var(--mut); font-size: 12px; align-self: center; }
    .tw { overflow: auto; max-inline-size: 100%; border: 1px solid var(--line); border-radius: 6px; }
    table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 12px; }
    caption { text-align: left; padding: 4px 8px; color: var(--mut); }
    th, td { padding: 4px 8px; border-top: 1px solid var(--line); text-align: left; white-space: nowrap; }
    thead th { color: var(--mut); font-weight: 400; }
    tbody th { position: sticky; inset-inline-start: 0; background: var(--bg); font: 600 12px/1.5 ui-monospace, Consolas, monospace; }
    td.s { font: 14px/1.4 ui-monospace, Consolas, monospace; white-space: normal; overflow-wrap: anywhere; min-width: 8em; }
    td.n { font-variant-numeric: tabular-nums; }
    td.more { color: var(--warn); }
    td.less { color: var(--safe); }
    .thumb .ctl, .thumb .code, .thumb .sub, .thumb .scan, .thumb dl, .thumb .out, .thumb .legend, .thumb h2, .thumb .pane.new { display: none; }
    .thumb .wrap { padding: 6px; }
    .thumb .cols { grid-template-columns: minmax(0, 1fr); }
    .thumb .cap { font-size: 11.5px; min-height: 0; padding: 4px 6px; }
    .thumb .mem { grid-template-columns: repeat(auto-fill, minmax(22px, 1fr)); }
    .thumb .cell { min-height: 26px; }
    .thumb .pane { padding: 6px; gap: 4px; }`,
  core() {
    // ISO-8859-1（1文字1バイト）の文字列を大文字にする繰り返しの模型
    const SHARP_S = 0xDF;     // ß
    const SLACK = 20;         // 最初の領域は「入力の長さ + 20」バイト
    const NEIGHBOR = [0x31, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];   // 隣の領域の先頭の8バイト（値は例）

    // 文字列を ISO-8859-1 のバイトの列にする。入らない文字は ?（0x3F）にして数える
    function toLatin1(str) {
      const bytes = [];
      let bad = 0;
      for (const ch of str) {
        const c = ch.codePointAt(0);
        if (c <= 0xFF) bytes.push(c);
        else { bytes.push(0x3F); bad++; }
      }
      return { bytes, bad };
    }

    // ISO-8859-1 の1バイトを大文字にする。ª º µ ÿ はこの文字コードの中に大文字が無いのでそのまま
    function upByte(c) {
      if (c >= 0x61 && c <= 0x7A) return c - 0x20;
      if (c >= 0xE0 && c <= 0xFE && c !== 0xF7) return c - 0x20;
      return c;
    }
    // 1文字を大文字にしたときに書くバイトの列。ß だけ2バイトになる
    function upcaseBytes(c) { return c === SHARP_S ? [0x53, 0x53] : [upByte(c)]; }
    function upcaseAll(bytes) { return bytes.flatMap(upcaseBytes); }

    // 最初の領域に書く様子を、入力1文字ずつの記録にする
    // mode 'old': 書く前に空きを1バイト分だけ確かめる（ß の2バイト目は確かめずに書く）
    // mode 'new': 書く前に、書くバイト数の分の空きを確かめ、足りなければ止める
    function simulate(bytes, mode) {
      if (mode !== 'old' && mode !== 'new') throw new RangeError('mode は old か new');
      const n = bytes.length, cap = n + SLACK;
      const mem = new Array(cap).fill(null).concat(NEIGHBOR);
      const steps = [];
      let i = 0, to = 0, end;
      for (;;) {
        if (i >= n) { end = 'done'; break; }
        if (to >= cap) { end = 'full'; break; }
        const code = bytes[i];
        const out = upcaseBytes(code);
        if (mode === 'new' && to + out.length > cap) { end = 'room'; break; }
        const writes = [];
        for (const b of out) {
          if (to >= mem.length) throw new Error('隣の領域よりも外に書こうとした');
          writes.push({ pos: to, before: mem[to], byte: b, outside: to >= cap });
          mem[to] = b;
          to++;
        }
        steps.push({ i, code, sharp: code === SHARP_S, writes, to });
        i++;
      }
      const overflow = steps.flatMap((s) => s.writes.filter((w) => w.outside));
      return { n, cap, steps, end, consumed: i, used: to, mem, overflow };
    }

    // 文字列の長さを3通りに数える
    function utf8Len(s) {
      let b = 0;
      for (const ch of s) {
        const c = ch.codePointAt(0);
        b += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
      }
      return b;
    }
    function cpLen(s) { let k = 0; for (const _ of s) k++; return k; }
    function measure(s) { return { units: s.length, cps: cpLen(s), bytes: utf8Len(s) }; }

    // 1つのコードポイントを大文字・小文字にしたとき、長さがどう変わるか。変わらなければ null
    function caseInfo(cp) {
      if (cp >= 0xD800 && cp <= 0xDFFF) return null;
      const ch = String.fromCodePoint(cp);
      const up = ch.toUpperCase(), low = ch.toLowerCase();
      if (up === ch && low === ch) return null;
      const b = utf8Len(ch), kinds = [];
      const judge = (s, pre) => {
        if (s === ch) return;
        if (cpLen(s) > 1) kinds.push(pre + 'More');
        else if (utf8Len(s) > b) kinds.push(pre + 'Bytes');
        else if (utf8Len(s) < b) kinds.push(pre + 'Fewer');
      };
      judge(up, 'up');
      judge(low, 'low');
      return kinds.length ? { cp, ch, up, low, kinds } : null;
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const hex = (b) => b.toString(16).toUpperCase().padStart(2, '0');
    const show = (b) => (b === 0x20 ? '␠' : (b > 0x20 && b < 0x7F) || b >= 0xA0 ? String.fromCharCode(b) : '·');
    const latin = (arr) => arr.map((b) => String.fromCharCode(b)).join('');
    const PRESETS = { word: 'Straße', s20: 'ß'.repeat(20), s21: 'ß'.repeat(21), s22: 'ß'.repeat(22), as21: 'a' + 'ß'.repeat(21) };
    const MODES = [
      { key: 'old', title: '元の書き方', sub: '書く前に空きを1バイト分だけ確かめる。ß のときは2バイト書く', code: [
        [null, '// 領域の大きさは「入力の長さ + 20」バイト'],
        ['check', 'while (i < 入力の長さ && to < to_end) {'],
        ['read', '  c = 入力[i++];'],
        ['sharp', '  if (c == ß) {          // この文字コードに大文字の ß は無い'],
        ['sharp', "    *to++ = 'S';         // 1バイト目"],
        ['sharp', "    c = 'S';"],
        ['other', '  } else if (c が小文字) c = 大文字;'],
        ['write', '  *to++ = c;             // ß なら2バイト目。空きは確かめていない'],
        [null, '}'],
      ] },
      { key: 'new', title: '直した書き方（一例）', sub: '書く前に、書くバイト数の分の空きを確かめる', code: [
        [null, '// 領域の大きさは同じ'],
        ['check', 'while (i < 入力の長さ && to < to_end) {'],
        ['read', '  c = 入力[i];  n = (c == ß) ? 2 : 1;'],
        ['room', '  if (to + n > to_end) break;   // 足りなければ次の領域へ'],
        ['sharp', "  if (c == ß) { *to++ = 'S'; *to++ = 'S'; }"],
        ['other', '  else *to++ = (小文字なら大文字、ほかはそのまま);'],
        ['read', '  i++;'],
        [null, '}'],
      ] },
    ];

    // 2つの欄を作る
    const P = {};
    for (const m of MODES) {
      const k = m.key;
      const el = document.createElement('article');
      el.className = 'pane ' + k;
      el.setAttribute('aria-labelledby', 'h-' + k);
      const code = m.code.map(([tag, s]) => (tag ? `<span data-k="${tag}">${esc(s)}</span>` : `<span class="cm">${esc(s)}</span>`)).join('\n');
      el.innerHTML = `<h3 id="h-${k}">${m.title}</h3>
        <p class="sub">${m.sub}</p>
        <pre class="code" tabindex="0" aria-label="${m.title}の要点のコード">${code}</pre>
        <div class="mem" id="mem-${k}" role="img"></div>
        <dl>
          <div><dt>入力の位置 i</dt><dd id="i-${k}"></dd></div>
          <div><dt>書く位置 to</dt><dd id="to-${k}"></dd></div>
          <div><dt>領域の終わり to_end</dt><dd id="end-${k}"></dd></div>
        </dl>
        <p class="state" id="st-${k}"></p>
        <p class="out" id="out-${k}"></p>`;
      $('cols').append(el);
      P[k] = { m, el, sim: null };
    }

    let bytes = [], stage = 0, maxStage = 1;

    function load(str) {
      const r = toLatin1(str);
      bytes = r.bytes;
      for (const m of MODES) P[m.key].sim = simulate(bytes, m.key);
      maxStage = Math.max(...MODES.map((m) => P[m.key].sim.steps.length)) + 1;
      stage = 0;
      const ns = bytes.filter((b) => b === SHARP_S).length;
      $('note').textContent = `入力 ${bytes.length} バイト（ß は ${ns} 個）。最初の領域は ${bytes.length} + 20 = ${bytes.length + SLACK} バイトで、大文字にした結果は ${upcaseAll(bytes).length} バイトになる。` + (r.bad ? `ISO-8859-1 に無い文字 ${r.bad} 個は ? にした。` : '');
      render();
    }

    // stage 段目の欄の様子。stage = 手の数 + 1 で、繰り返しの終わりを見せる
    function paneAt(sim, s) {
      const k = Math.min(s, sim.steps.length);
      const mem = new Array(sim.cap).fill(null).concat(NEIGHBOR);
      for (let j = 0; j < k; j++) for (const w of sim.steps[j].writes) mem[w.pos] = w.byte;
      const to = k ? sim.steps[k - 1].to : 0;
      const i = k ? sim.steps[k - 1].i + 1 : 0;
      const ended = s > sim.steps.length;
      const last = s >= 1 && !ended ? sim.steps[s - 1] : null;
      const outside = sim.steps.slice(0, k).flatMap((x) => x.writes).filter((w) => w.outside);
      return { mem, to, i, ended, last, outside, justEnded: s === sim.steps.length + 1 };
    }

    function renderPane(p) {
      const { sim, m } = p, k = m.key;
      const st = paneAt(sim, stage);
      const fresh = new Set(st.last ? st.last.writes.map((w) => w.pos) : []);
      const bad = new Set(st.outside.map((w) => w.pos));
      const cells = [];
      for (let j = 0; j < st.mem.length; j++) {
        const b = st.mem[j], nb = j >= sim.cap;
        const cls = ['cell'];
        if (nb) cls.push(bad.has(j) ? 'bad' : 'nb');
        else if (b !== null) cls.push('w');
        if (!nb && fresh.has(j)) cls.push('new');
        if (j === sim.cap) cls.push('end');
        if (j === st.to && !st.ended) cls.push('at');
        let big, small;
        if (nb && !bad.has(j)) { big = hex(b); small = '隣'; }
        else if (b === null) { big = '·'; small = ''; }
        else { big = show(b); small = hex(b); }
        cells.push(`<span class="${cls.join(' ')}"><b>${esc(big)}</b><span class="hx">${small}</span></span>`);
      }
      const mem = $('mem-' + k);
      mem.innerHTML = cells.join('');
      mem.setAttribute('aria-label', `領域 ${sim.cap} バイトと隣の領域 ${NEIGHBOR.length} バイト。${Math.min(st.to, sim.cap)} バイト書いた` + (st.outside.length ? `。領域の外に ${st.outside.length} バイト書き、隣の領域が書き換わった` : ''));
      $('i-' + k).textContent = st.i + ' / ' + sim.n;
      $('to-' + k).textContent = String(st.to);
      $('end-' + k).textContent = String(sim.cap);

      let lv = 'ok', msg;
      const ov = st.last ? st.last.writes.find((w) => w.outside) : null;
      const rest = sim.n - sim.consumed;
      if (stage === 0) { lv = 'wait'; msg = 'まだ何も書いていない'; }
      else if (st.last) {
        const L = st.last;
        if (ov) { lv = 'bad'; msg = `${L.i + 1} 文字目の ß: 1バイト目を ${L.writes[0].pos} に、2バイト目を ${ov.pos}（領域の外）に書いた。隣の領域の 0x${hex(ov.before)} が 0x${hex(ov.byte)}（${show(ov.byte)}）に変わった`; }
        else {
          lv = st.outside.length ? 'bad' : 'ok';
          msg = `${L.i + 1} 文字目の ${show(L.code)} を ${L.writes.map((w) => show(w.byte)).join('')} にして、${L.writes.map((w) => w.pos).join(' と ')} に書いた`;
        }
      } else if (st.outside.length) { lv = 'bad'; msg = '繰り返しを終えた。隣の領域の1バイトは書き換わったまま' + (rest ? `（残り ${rest} 文字は次の領域へ書く）` : ''); }
      else if (sim.end === 'room') { lv = 'safe'; msg = `残りの空きは ${sim.cap - sim.used} バイトで、ß には2バイト要るので止めた。残り ${rest} 文字は次の領域へ書く`; }
      else if (sim.end === 'full') { msg = `to が to_end に届いたので繰り返しを終えた。残り ${rest} 文字は次の領域へ書く`; }
      else { msg = `入力を全部書き終えた（${sim.cap} バイトのうち ${sim.used} バイトを使った）`; }
      p.el.dataset.lv = lv;
      $('st-' + k).textContent = msg;

      const inside = st.mem.slice(0, Math.min(st.to, sim.cap)).filter((b) => b !== null);
      let out = '書いた文字列: ' + (inside.length ? latin(inside) : '（なし）');
      if (st.outside.length) out += ' ＋ 領域の外に ' + latin(st.outside.map((w) => w.byte));
      if (st.ended) out += ' ／ 次の領域の分も含めた結果: ' + latin(upcaseAll(bytes)) + (st.outside.length ? '（結果の文字列は正しい）' : '');
      $('out-' + k).textContent = out;

      let hits = [];
      if (st.last) hits = k === 'old' ? ['check', 'read', st.last.sharp ? 'sharp' : 'other', 'write'] : ['check', 'read', 'room', st.last.sharp ? 'sharp' : 'other'];
      else if (st.justEnded) hits = sim.end === 'room' ? ['check', 'read', 'room'] : ['check'];
      for (const s of p.el.querySelectorAll('[data-k]')) s.classList.toggle('hit', hits.includes(s.dataset.k));
    }

    function caption() {
      const o = P.old.sim, w = P.new.sim;
      if (stage === 0) return `入力 ${o.n} 文字を大文字にする。最初の領域は ${o.n} + 20 = ${o.cap} バイト。ß は大文字にすると SS の2バイトになるので、ß 1個につき空きが1バイト減る。`;
      const L = stage <= o.steps.length ? o.steps[stage - 1] : null;
      if (L) {
        const ov = L.writes.find((x) => x.outside);
        if (ov) return `${L.i + 1} 文字目の ß: to = ${L.writes[0].pos} は to_end = ${o.cap} より小さいので確かめを通る。1バイト目は領域の最後に入り、2バイト目は確かめないまま領域の外（${ov.pos}）に書かれた。` + (w.end === 'room' ? '直した書き方は、2バイト分の空きが無いので、この文字の手前で止めた。' : '');
        return `${L.i + 1} 文字目: ${show(L.code)} → ${L.writes.map((x) => show(x.byte)).join('')}。元の書き方の to は ${L.to}、to_end は ${o.cap}。`;
      }
      if (o.overflow.length) return '元の書き方は領域の外に1バイト書いた。結果の文字列は正しいので、変換の結果を見ても気づけない。';
      if (o.end === 'full') return '元の書き方は、to がちょうど to_end に届いて止まったので、あふれなかった。ß の数が多くても、領域の最後の1バイトの位置に ß が来なければあふれない。';
      return '元の書き方でもあふれなかった。あふれるのは ß が 21 個以上あり、領域の最後の1バイトの位置で ß を変換したときだけ。';
    }

    function render() {
      for (const m of MODES) renderPane(P[m.key]);
      $('cap').textContent = caption();
    }

    // 自動で進める
    let timer = 0;
    const autoBtn = $('auto');
    function stopAuto() {
      clearTimeout(timer);
      timer = 0;
      autoBtn.setAttribute('aria-pressed', 'false');
      autoBtn.textContent = '自動で進める';
    }
    function tick() {
      if (stage < maxStage) {
        stage++;
        render();
        const near = stage >= maxStage - 2;   // あふれる手と終わりの手は長めに見せる
        timer = setTimeout(tick, window.THUMB ? (near ? 1500 : 150) : (near ? 900 : 420));
        return;
      }
      if (window.THUMB) { stage = 0; render(); timer = setTimeout(tick, 600); return; }
      stopAuto();
    }
    function startAuto() {
      stopAuto();
      if (stage >= maxStage) { stage = 0; render(); }
      autoBtn.setAttribute('aria-pressed', 'true');
      autoBtn.textContent = '止める';
      timer = setTimeout(tick, 500);
    }

    autoBtn.addEventListener('click', () => { if (timer) stopAuto(); else startAuto(); });
    $('step').addEventListener('click', () => { stopAuto(); if (stage < maxStage) stage++; render(); });
    $('all').addEventListener('click', () => { stopAuto(); stage = maxStage; render(); });
    $('reset').addEventListener('click', () => { stopAuto(); stage = 0; render(); });
    $('in').addEventListener('input', (e) => { stopAuto(); load(e.target.value); });
    document.querySelector('[aria-label="入力の例"]').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-pre]');
      if (!b) return;
      $('in').value = PRESETS[b.dataset.pre];
      load($('in').value);
      startAuto();
    });

    // 後半: 長さが変わる文字を全部探す
    const KIND_INFO = [
      ['upMore', '大文字にすると文字の数が増える', 'up'],
      ['upBytes', '大文字にすると UTF-8 のバイト数が増える（文字の数は同じ）', 'up'],
      ['upFewer', '大文字にすると UTF-8 のバイト数が減る', 'up'],
      ['lowMore', '小文字にすると文字の数が増える', 'low'],
      ['lowBytes', '小文字にすると UTF-8 のバイト数が増える', 'low'],
      ['lowFewer', '小文字にすると UTF-8 のバイト数が減る', 'low'],
    ];
    const SHOW_MAX = 48;
    const yieldMain = () => ('scheduler' in window && 'yield' in window.scheduler ? window.scheduler.yield() : new Promise((r) => setTimeout(r, 0)));
    let scanning = false;

    function renderCats(found) {
      $('cats').replaceChildren(...KIND_INFO.map(([k, title, dir]) => {
        const list = found[k];
        const sec = document.createElement('section');
        sec.className = 'cat';
        const h = document.createElement('h3');
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = list.length + ' 文字';
        h.append(title, n);
        const ul = document.createElement('ul');
        ul.className = 'chips';
        for (const it of list.slice(0, SHOW_MAX)) {
          const after = dir === 'up' ? it.up : it.low;
          const li = document.createElement('li');
          const b = document.createElement('button');
          b.type = 'button';
          b.title = 'U+' + it.cp.toString(16).toUpperCase().padStart(4, '0');
          const sm = document.createElement('small');
          sm.textContent = k.endsWith('More') ? cpLen(it.ch) + '→' + cpLen(after) + '文字' : utf8Len(it.ch) + '→' + utf8Len(after) + 'バイト';
          b.append(it.ch + '→' + after, sm);
          b.addEventListener('click', () => { $('try').value = it.ch; renderTry(); });
          li.append(b);
          ul.append(li);
        }
        if (list.length > SHOW_MAX) {
          const li = document.createElement('li');
          li.className = 'more';
          li.textContent = `ほか ${list.length - SHOW_MAX} 文字`;
          ul.append(li);
        }
        sec.append(h, ul);
        return sec;
      }));
    }

    async function scanAll() {
      if (scanning) return;
      scanning = true;
      const btn = $('scan'), prog = $('prog'), msg = $('scanMsg');
      btn.disabled = true;
      prog.value = 0;
      msg.textContent = '調べています…';
      const found = {};
      for (const [k] of KIND_INFO) found[k] = [];
      const t0 = performance.now();
      let deadline = t0 + 50, count = 0;
      const uniq = new Set();
      for (let cp = 0; cp <= 0x10FFFF; cp++) {
        if (cp === 0xD800) cp = 0xE000;   // サロゲートの範囲は1文字にならないので飛ばす
        count++;
        const info = caseInfo(cp);
        if (info) { uniq.add(cp); for (const k of info.kinds) found[k].push(info); }
        if ((cp & 0x3FF) === 0 && performance.now() >= deadline) {
          prog.value = cp / 0x110000;
          await yieldMain();
          deadline = performance.now() + 50;
        }
      }
      prog.value = 1;
      const sec = (performance.now() - t0) / 1000;
      msg.textContent = `${count.toLocaleString('ja-JP')} 文字を調べた（${sec.toFixed(1)} 秒）。長さが変わる文字は ${uniq.size} 個`;
      renderCats(found);
      btn.disabled = false;
      btn.textContent = 'もう一度調べる';
      scanning = false;
    }

    function renderTry() {
      const s = $('try').value;
      const base = measure(s);
      const rows = [
        ['元の文字列', s],
        ['toUpperCase()', s.toUpperCase()],
        ['toLowerCase()', s.toLowerCase()],
        ["toLocaleUpperCase('tr')", s.toLocaleUpperCase('tr')],
      ];
      $('tb').replaceChildren(...rows.map(([label, v], idx) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = label;
        const td = document.createElement('td');
        td.className = 's';
        td.textContent = v;
        tr.append(th, td);
        const mv = measure(v);
        for (const key of ['units', 'cps', 'bytes']) {
          const c = document.createElement('td');
          c.className = 'n';
          const d = mv[key] - base[key];
          c.textContent = String(mv[key]) + (idx && d ? (d > 0 ? '（+' + d + '）' : '（' + d + '）') : '');
          if (idx && d) c.classList.add(d > 0 ? 'more' : 'less');
          tr.append(c);
        }
        return tr;
      }));
    }

    $('scan').addEventListener('click', scanAll);
    $('try').addEventListener('input', renderTry);

    if (window.THUMB) document.documentElement.classList.add('thumb');
    $('in').value = PRESETS.s21;
    load(PRESETS.s21);
    $('try').value = 'Straße ﬁx İ ȿ ı';
    renderTry();
    startAuto();
    if (!window.THUMB) setTimeout(scanAll, 800);
  },
});

dekiru.add({
  id: 'tr-20261120-one-sheet-zine', c: 'trend', lv: 2, date: '2026-11-20',
  t: 'A4 の紙1枚で作る8ページの本を、面付けして画面の上で折る',
  y: 'えーよんのかみいちまいでつくるはちぺーじのほんをめんつけしてがめんのうえでおる',
  tags: ['fanzines.app', 'zine', '面付け', 'matrix3d', 'preserve-3d'],
  d: '2026年11月19日、Wilson Tovar さんの記事「Paper, folds, and what’s new in fanzines.app」が Hacker News で200点近くを集めた。A4 の紙1枚を8マスに折り、真ん中を切って十字に折りたたむと、ホチキスも糊も使わない8ページの小さな本（zine）になる。記事の fanzines.app は、ページを正しい向きで作ると、上の段を逆さまにした印刷用の配置（面付け）をブラウザの中で作る。この見本は、その面付けの計算と紙を折る動きを再現した。8つの面を CSS の 3D 変形で動かし、上の段を裏へ折る・両端を寄せて十字にする・閉じる・めくるの順に見せる。ページの文字は書きかえられ、右綴じ（縦書き）にすると配置が左右反転する。切り込みの長さを変えると、本にならない理由も面付けの図で分かる。折り方の模型は簡単にしてあり、紙の厚みは小さな隙間で代わりにして、折り目の丸みや紙のたわみは描かない。写真の配置、300 DPI の PDF への書き出し、印刷は再現していない。',
  p: '切り込みを入れた紙の8マスは、隣どうしのつながりをたどると1つの輪になる。真ん中の4マスは上下を切り離すので、どのマスも2つのマスとだけつながる。読む順番はこの輪を表紙から一周する順番なので、下の段に 裏表紙・表紙・1・2、上の段に 6・5・4・3 が並ぶ。上の段は裏へ折り返すので、180度回して刷る。動きは面ごとに4×4の行列を掛け合わせて作る。「上の段を横の折り目のまわりに回す」「両端を寄せて、真ん中の縦の折り目を開く」「十字の4枚の葉を背のまわりに回す」の3つを順に掛け、matrix3d() で各面へ渡す。transform-style: preserve-3d の中では、重なった面の前後をブラウザが奥行きから決める。',
  refs: [
    { title: 'Paper, folds, and what’s new in fanzines.app（Wilson Tovar）', url: 'https://krthr.co/paper-folds-and-whats-new-in-fanzines-app/' },
    { title: 'Hacker News: Making 8-page foldable zines from a single A4 sheet in the browser', url: 'https://news.ycombinator.com/item?id=50559719' },
  ],
  html: `<div class="wrap">
  <div class="stage" id="stage" role="img" aria-label="8ページの本を折る様子の立体の図。下の説明の文で今の段階を伝える">
    <div class="scene" id="scene" aria-hidden="true"></div>
  </div>
  <p id="cap" class="cap"></p>
  <div class="ctl">
    <label class="sl">折る・めくる
      <input type="range" id="t" min="0" max="700" step="1" value="0">
    </label>
    <div class="row">
      <button type="button" id="play">止める</button>
      <span class="mut">段階へ:</span>
      <button type="button" data-go="0">広げる</button>
      <button type="button" data-go="100">上を裏へ</button>
      <button type="button" data-go="200">十字にする</button>
      <button type="button" data-go="300">閉じる</button>
      <button type="button" data-go="700">最後までめくる</button>
    </div>
    <label class="row">綴じ方
      <select id="bind">
        <option value="left">左綴じ（横書き）</option>
        <option value="right">右綴じ（縦書き）</option>
      </select>
    </label>
  </div>
  <div class="cols">
    <section class="side" aria-labelledby="h-map">
      <h2 id="h-map">面付けの図（印刷する面）</h2>
      <svg id="map" viewBox="0 0 300 220" role="img" aria-labelledby="h-map map-note"></svg>
      <fieldset class="row">
        <legend>切り込みの長さを変えてみる</legend>
        <label><input type="radio" name="cut" value="none"> 切らない</label>
        <label><input type="radio" name="cut" value="mid" checked> 真ん中の2マス</label>
        <label><input type="radio" name="cut" value="all"> 端から端まで</label>
      </fieldset>
      <p id="map-note" class="mut" role="status"></p>
    </section>
    <section class="edit" aria-labelledby="h-edit">
      <h2 id="h-edit">ページの文字を書きかえる</h2>
      <p class="mut">入力欄を選ぶと、本がそのページまで開く。</p>
      <div id="fields" class="fields"></div>
    </section>
  </div>
</div>`,
  css: `:root { color-scheme: dark; --bg: #12141b; --fg: #e4e6ee; --mut: #9aa3b6; --line: #2c3344; --acc: #ff8f6b; --paper: #fbf7ee; --ink: #2b2620; --back: #e4ddcf; --cut: #e0453a; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.5 system-ui, sans-serif; accent-color: var(--acc); }
    [hidden] { display: none !important; }
    .wrap { display: flex; flex-direction: column; gap: 10px; padding: 8px; box-sizing: border-box; }
    h2 { margin: 0; font-size: 14px; }
    .stage { position: relative; inline-size: 100%; aspect-ratio: 16 / 10; overflow: hidden; border-radius: 8px;
      background: radial-gradient(120% 90% at 50% 35%, #2a3042, #151821 70%); }
    .scene { position: absolute; inset: 0; transform-style: preserve-3d; }
    .pn { position: absolute; left: 0; top: 0; transform-origin: 0 0; transform-style: preserve-3d; }
    .pn > .f, .pn > .b { position: absolute; inset: 0; backface-visibility: hidden; }
    .pn > .f { container-type: inline-size; }
    .pn > .b { transform: rotateY(180deg); background: var(--back); box-shadow: inset 0 0 0 1px rgb(0 0 0 / .12); }
    .pn > .f::after, .pn > .b::after { content: ''; position: absolute; inset: 0; background: #000; pointer-events: none; }
    .pn > .f::after { opacity: var(--sf, 0); }
    .pn > .b::after { opacity: var(--sb, 0); }
    /* 文字の大きさは面の横幅（cqw）で決める。縦書きの要素では cqi が縦の長さを指すので使わない */
    .pg { --h: 20; position: absolute; inset: 0; overflow: hidden; box-sizing: border-box; padding: 9cqw 8cqw;
      background: var(--paper); color: var(--ink); box-shadow: inset 0 0 0 1px rgb(0 0 0 / .14);
      display: grid; grid-template-rows: auto 1fr auto; gap: 4cqw; }
    .cutline .pg[data-k="0"], .cutline .pg[data-k="1"] { box-shadow: inset 0 1.6cqw 0 var(--cut), inset 0 0 0 1px rgb(0 0 0 / .14); }
    .pg .no { font-size: 6.5cqw; color: hsl(var(--h) 55% 42%); letter-spacing: .05em; }
    .pg .tx { margin: 0; font-size: 9cqw; line-height: 1.55; white-space: pre-line; overflow-wrap: anywhere; }
    .pg .art { inline-size: 100%; block-size: auto; color: hsl(var(--h) 45% 38%); }
    .pg[data-k="0"] { background: hsl(var(--h) 70% 88%); }
    .pg[data-k="0"] .tx { font-size: 12.5cqw; font-weight: 700; line-height: 1.4; }
    .pg[data-k="7"] { background: hsl(var(--h) 35% 90%); }
    .pg[data-k="7"] .tx { font-size: 7.2cqw; }
    .art .pp { fill: #fff; stroke: currentColor; stroke-width: 2; }
    .art .dash { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-dasharray: 4 3; }
    .art .cutl { fill: none; stroke: var(--cut); stroke-width: 3.5; }
    .art .thick { fill: none; stroke: currentColor; stroke-width: 7; stroke-linecap: round; }
    .art .ac { fill: hsl(var(--h) 70% 55%); }
    .art .big { fill: #fff; font: 700 30px system-ui, sans-serif; text-anchor: middle; }
    .art .ln { fill: none; stroke: currentColor; stroke-width: 2; }
    .rtl .pg { grid-template-rows: auto 1fr; grid-template-columns: 1fr auto; }
    .rtl .pg .no { grid-column: 1 / -1; }
    .rtl .pg .tx { grid-column: 2; grid-row: 2; writing-mode: vertical-rl; }
    .rtl .pg .art { grid-column: 1; grid-row: 2; align-self: end; }
    .cap { margin: 0; min-height: 3em; padding: 6px 8px; border-left: 3px solid var(--acc); background: #1a1e29; border-radius: 4px; }
    .mut { margin: 0; color: var(--mut); font-size: 12px; }
    .ctl { display: flex; flex-direction: column; gap: 6px; }
    .row { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
    .sl { display: flex; align-items: center; gap: 8px; }
    .sl input { flex: 1; min-inline-size: 0; }
    button, select { font: inherit; min-block-size: 28px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; background: #1e2433; color: var(--fg); cursor: pointer; }
    button:hover { background: #283048; }
    :focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    @media (min-width: 640px) { .cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    section { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    fieldset { border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px 6px; margin: 0; }
    legend { color: var(--mut); font-size: 12px; padding: 0 4px; }
    #map { inline-size: 100%; block-size: auto; }
    #map .sheet { fill: var(--paper); }
    #map .fold { stroke: #8a8070; stroke-width: 1; stroke-dasharray: 4 3; }
    #map .cut { stroke: var(--cut); stroke-width: 3; }
    #map .lab { fill: var(--ink); font: 600 15px system-ui, sans-serif; text-anchor: middle; dominant-baseline: middle; }
    #map .lab.up { fill: #b04a1c; }
    #map .seg { stroke: #2f7de0; stroke-width: 2; fill: none; }
    #map .tip { fill: #2f7de0; }
    .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
    .fields label { display: flex; flex-direction: column; gap: 2px; color: var(--mut); font-size: 12px; }
    textarea { font: 13px/1.4 system-ui, sans-serif; resize: vertical; padding: 4px 6px; background: #0c0f15; color: var(--fg); border: 1px solid var(--line); border-radius: 6px; }
    .thumb .wrap { padding: 0; }
    .thumb .stage { aspect-ratio: auto; block-size: 100vh; border-radius: 0; }
    .thumb .cap, .thumb .ctl, .thumb .cols { display: none; }`,
  core() {
    // A4 の紙1枚（横4マス × 縦2マス）を切って折り、8ページの本にする計算
    const COLS = 4;
    const H = Math.SQRT2;        // 1マスの縦の長さ（横を1とする）。A判の紙は縦と横の比が √2
    const GAP = 0.01;            // 重なった紙の間にあける隙間（紙の厚みの代わり）
    const NAMES = ['表紙', '1', '2', '3', '4', '5', '6', '裏表紙'];
    const DEG = Math.PI / 180;

    // マスどうしのつながり。同じ段の隣は縦の折り目でつながり、上下は cut に入っている列だけ切り離す
    function links(cols, cut) {
      const nb = Array.from({ length: cols * 2 }, () => []);
      const key = (r, c) => r * cols + c;
      const join = (a, b) => { nb[a].push(b); nb[b].push(a); };
      for (let r = 0; r < 2; r++) for (let c = 0; c + 1 < cols; c++) join(key(r, c), key(r, c + 1));
      for (let c = 0; c < cols; c++) if (!cut.includes(c)) join(key(0, c), key(1, c));
      return nb;
    }
    function middleCut(cols) { const cut = []; for (let c = 1; c < cols - 1; c++) cut.push(c); return cut; }

    // 紙がいくつに分かれるか、3つ以上のマスとつながるマス、1つ以下としかつながらないマスの数
    function inspect(cols = COLS, cut = middleCut(cols)) {
      const nb = links(cols, cut);
      const seen = new Array(nb.length).fill(false);
      let parts = 0;
      for (let s = 0; s < nb.length; s++) {
        if (seen[s]) continue;
        parts++;
        seen[s] = true;
        const stack = [s];
        while (stack.length) { const a = stack.pop(); for (const b of nb[a]) if (!seen[b]) { seen[b] = true; stack.push(b); } }
      }
      return { parts, branch: nb.filter((x) => x.length >= 3).length, ends: nb.filter((x) => x.length <= 1).length };
    }

    // つながりが1つの輪なら、表紙のマス（下の段の左から2つ目）から右へ一周した順に [行, 列] を返す。輪でなければ null
    function cycle(cols = COLS, cut = middleCut(cols)) {
      if (cols < 3) return null;
      const nb = links(cols, cut);
      if (nb.some((x) => x.length !== 2)) return null;
      const start = cols + 1;
      const path = [start];
      let prev = start, cur = cols + 2;
      while (cur !== start && path.length <= nb.length) {
        path.push(cur);
        const next = nb[cur][0] === prev ? nb[cur][1] : nb[cur][0];
        prev = cur;
        cur = next;
      }
      if (path.length !== nb.length) return null;   // 輪が2つ以上に分かれている
      return path.map((k) => [Math.floor(k / cols), k % cols]);
    }
    const LOOP = cycle(COLS);

    // 面付け: ページ k を紙のどのマスに、何度回して刷るか。右綴じは左右を入れ替える
    function impose(binding = 'left') {
      return LOOP.map(([row, col], k) => ({
        page: k, name: NAMES[k], row, col: binding === 'right' ? COLS - 1 - col : col, rot: row === 0 ? 180 : 0,
      }));
    }

    // 4×4 の行列（行優先の16個の数）
    const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    function mul(a, b) {
      const o = new Array(16);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
        o[r * 4 + c] = s;
      }
      return o;
    }
    const chain = (...ms) => ms.reduce(mul);
    const tr = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
    const sc = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
    function rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; }
    function ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; }
    function apply(m, p) {
      const [x, y, z] = p;
      return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
    }
    const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
    const lerp = (a, b, t) => a + (b - a) * t;

    // 時刻 T: 0〜1 上の段を裏へ折る、1〜2 両端を寄せて十字に、2〜3 閉じる、3〜7 1枚ずつめくる
    const END = 7;
    const TMAX = Math.acos(GAP / 2);                         // 両端を寄せきったときの、真ん中の折り目の開き
    const PSI0 = [90, 0, -90, -180].map((d) => d * DEG);     // 十字にしたときの4枚の葉の向き（上から見た角度）
    const LEAF_TILT = 3 * DEG;                               // 閉じた本の葉どうしの小さな開き
    // マスがどの葉に入るか。0: 表紙と1、1: 2と3、2: 4と5、3: 6と裏表紙
    function leafOf(row, col) { return col === 1 || col === 2 ? (row === 1 ? 0 : 2) : (col === 3 ? 1 : 3); }
    function pose(T) {
      const psi = PSI0.map((p0, i) => {
        const closed = (3 - i) * LEAF_TILT, turned = Math.PI - i * LEAF_TILT;
        if (T <= 2) return p0;
        if (T <= 3) return lerp(p0, closed, smooth(T - 2));
        return lerp(closed, turned, smooth(T - 3 - i));
      });
      return { s: smooth(T), th: smooth(T - 1) * TMAX, psi };
    }
    // 広げた紙の上の位置。面の中の座標 (u, v) は u が右へ 0〜1、v が下へ 0〜H。上の段は180度回して置く
    function flat(row, col) { return row === 1 ? mul(tr(col - 2, 0, 0), sc(1, -1, 1)) : mul(tr(col - 1, 0, 0), sc(-1, 1, 1)); }
    // 上の段を、横の折り目（y = 0）のまわりに裏へ回す
    function foldTop(row, s) { return row === 1 ? I4() : chain(tr(0, 0, -GAP / 2), rx(-Math.PI * s), tr(0, 0, GAP / 2)); }
    // 両端を寄せる。端の葉は平行に動き、真ん中の4面は縦の折り目で回って菱形に開く
    function pushEnds(row, col, th) {
      const z0 = row === 1 ? 0 : -GAP, d = Math.cos(th);
      if (col === 0) return tr(1 - d, 0, 0);
      if (col === 3) return tr(d - 1, 0, 0);
      if (col === 1) return chain(tr(-d, 0, z0), ry(row === 1 ? -th : th), tr(1, 0, -z0));
      return chain(tr(d, 0, z0), ry(row === 1 ? th : -th), tr(-1, 0, -z0));
    }
    // 葉を背（x = 0 の縦の線）のまわりに回す
    function turnLeaf(i, psi) { return chain(tr(0, 0, -GAP / 2), ry(PSI0[i] - psi), tr(0, 0, GAP / 2)); }
    const MIRROR = sc(-1, 1, 1), FLIP_U = mul(tr(1, 0, 0), sc(-1, 1, 1));
    // ページ k の面を、時刻 T の位置へ移す行列（y は上、z は手前）。右綴じは全体を鏡に映し、面の中身だけ戻す
    function pageMatrix(k, T, binding = 'left') {
      const [row, col] = LOOP[k];
      const p = pose(T), leaf = leafOf(row, col);
      const m = chain(turnLeaf(leaf, p.psi[leaf]), pushEnds(row, col, p.th), foldTop(row, p.s), flat(row, col));
      return binding === 'right' ? chain(MIRROR, m, FLIP_U) : m;
    }

    // 見る向きと大きさ。段階ごとの値をなめらかにつなぐ
    const VIEW = [
      { T: 0, rx: 8, ry: 0, tx: 0, ty: 0, zoom: 1 },
      { T: 1, rx: 16, ry: -22, tx: 0, ty: -H / 2, zoom: 1.08 },
      { T: 2, rx: 52, ry: -30, tx: 0, ty: -H / 2, zoom: 1.2 },
      { T: 3, rx: 14, ry: -6, tx: 0.5, ty: -H / 2, zoom: 1.6 },
      { T: 4, rx: 18, ry: 0, tx: 0, ty: -H / 2, zoom: 1.6 },
      { T: 6, rx: 18, ry: 0, tx: 0, ty: -H / 2, zoom: 1.6 },
      { T: 7, rx: 14, ry: 0, tx: -0.5, ty: -H / 2, zoom: 1.6 },
    ];
    function camera(T, binding = 'left') {
      let i = 0;
      while (i < VIEW.length - 2 && T > VIEW[i + 1].T) i++;
      const a = VIEW[i], b = VIEW[i + 1], f = smooth((T - a.T) / (b.T - a.T));
      const sg = binding === 'right' ? -1 : 1;
      return { rx: lerp(a.rx, b.rx, f) * DEG, ry: sg * lerp(a.ry, b.ry, f) * DEG, tx: sg * lerp(a.tx, b.tx, f), ty: lerp(a.ty, b.ty, f), zoom: lerp(a.zoom, b.zoom, f) };
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    if (window.THUMB) document.documentElement.classList.add('thumb');
    const stage = $('stage'), scene = $('scene'), slider = $('t'), cap = $('cap'), playBtn = $('play'), bindSel = $('bind');
    const TEXT = [
      '1枚で作る\n8ページの本',
      'A4 の紙を\n横に置く',
      '半分に3回折って開くと、8マスの折り目ができる',
      '真ん中の横の線を、2マス分だけ切る',
      '横長に半分に折る',
      '両端を押して寄せると、切った所が開いて十字になる',
      '表紙が上になるように閉じれば出来あがり',
      '出来る！\nHTML/CSS/JavaScript',
    ];
    const ART = [
      '<circle cx="50" cy="36" r="26" class="ac"/><text x="50" y="47" class="big">8</text>',
      '<rect x="12" y="8" width="76" height="54" class="pp"/>',
      '<rect x="12" y="8" width="76" height="54" class="pp"/><path d="M31 8V62M50 8V62M69 8V62M12 35H88" class="dash"/>',
      '<rect x="12" y="8" width="76" height="54" class="pp"/><path d="M31 8V62M50 8V62M69 8V62M12 35H31M69 35H88" class="dash"/><path d="M31 35H69" class="cutl"/>',
      '<rect x="12" y="22" width="76" height="27" class="pp"/><path d="M31 22V49M50 22V49M69 22V49" class="dash"/>',
      '<path d="M50 35H18M50 35H82M50 35V8M50 35V62" class="thick"/>',
      '<rect x="36" y="8" width="34" height="54" class="pp"/><path d="M36 8V62" class="thick" style="stroke-width:3"/>',
      '<rect x="20" y="14" width="60" height="42" class="pp"/><path d="M35 42H65V28H35Z" class="ln"/><circle cx="35" cy="42" r="3" class="ac"/>',
    ];
    const HUE = [18, 200, 150, 5, 260, 40, 320, 18];
    const pages = TEXT.map((text, k) => {
      const pn = document.createElement('div');
      pn.className = 'pn';
      pn.innerHTML = `<div class="f"><div class="pg" data-k="${k}" style="--h:${HUE[k]}"><span class="no"></span><p class="tx"></p><svg class="art" viewBox="0 0 100 70" aria-hidden="true">${ART[k]}</svg></div></div><div class="b"></div>`;
      pn.querySelector('.no').textContent = k === 0 || k === 7 ? NAMES[k] : `― ${k} ―`;
      const tx = pn.querySelector('.tx');
      tx.textContent = text;
      scene.append(pn);
      return { pn, tx };
    });

    let bind = 'left', T = 0, playing = !!window.THUMB || !calm.matches, aim = null, hold = 0, last = 0, L = 0, cutMode = 'mid';

    // 行列を CSS の matrix3d() の並び（列ごと）にする
    function css(m) { const o = []; for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o.push(+m[r * 4 + c].toFixed(5)); return o.join(','); }

    function render() {
      const W = Math.max(1, stage.clientWidth), Hs = Math.max(1, stage.clientHeight);
      const unit = Math.max(1, Math.min(W / 4.5, Hs / (2 * H + 0.5)));
      const size = Math.max(1, Math.round(unit * 1.6));   // 面は拡大したときの大きさで作り、縮めて置く（文字がぼやけない）
      if (size !== L) {
        L = size;
        for (const p of pages) { p.pn.style.width = L + 'px'; p.pn.style.height = L * H + 'px'; }
      }
      const c = camera(T, bind), k = unit * c.zoom;
      const view = chain(tr(W / 2, Hs / 2, 0), sc(k, -k, k), rx(c.rx), ry(c.ry), tr(-c.tx, -c.ty, 0));
      const local = sc(1 / L, 1 / L, 1 / L);
      stage.style.perspective = Math.round(W * 2.4) + 'px';
      pages.forEach((p, i) => {
        const m = chain(view, pageMatrix(i, T, bind), local);
        p.pn.style.transform = `matrix3d(${css(m)})`;
        // 手前を向く面ほど明るく、横や奥を向く面ほど暗くする
        const nz = m[10] / Math.max(1e-9, Math.hypot(m[2], m[6], m[10]));
        p.pn.style.setProperty('--sf', (0.45 * (1 - Math.max(0, nz))).toFixed(3));
        p.pn.style.setProperty('--sb', (0.45 * (1 - Math.max(0, -nz))).toFixed(3));
      });
    }

    const SPREAD = ['表紙', '1 と 2 の見開き', '3 と 4 の見開き', '5 と 6 の見開き', '裏表紙'];
    function stageText() {
      if (T < 0.01) return ['広げた紙', '広げた紙。8マスのうち上の段は逆さまに刷る。赤い線が切り込み（真ん中の2マス分）。'];
      if (T <= 1) return ['上の段を裏へ折る', '上の段を裏へ折る。逆さまに刷った面は、裏から見ると正しい向きになる。'];
      if (T <= 2) return ['両端を寄せる', '両端を押して寄せる。切り込みが菱形に開き、8つの面は1つの輪につながったまま十字になる。'];
      if (T <= 3) return ['十字を閉じる', '十字の4枚の葉を、表紙が上になるように閉じる。'];
      const u = T - 3, j = Math.floor(u + 1e-6), f = u - j;
      const now = f < 0.05 || j >= 4 ? SPREAD[Math.min(4, j)] : `${SPREAD[j]} → ${SPREAD[j + 1]}`;
      return ['めくる: ' + now, `めくる。今は${now}。表紙 → 1・2 → 3・4 → 5・6 → 裏表紙の順は、紙の8マスを輪に沿って一周する順番と同じ。`];
    }
    function sync() {
      slider.value = String(Math.round(T * 100));
      const [short, long] = stageText();
      slider.setAttribute('aria-valuetext', short);
      if (cap.textContent !== long) cap.textContent = long;
      scene.classList.toggle('cutline', T < 2);   // 閉じるまでは、切り込みの辺を赤く見せる
      render();
    }
    function setPlaying(on) {
      playing = on;
      playBtn.textContent = on ? '止める' : '動かす';
    }

    function tick(now) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      let moved = false;
      if (aim !== null) {
        const step = dt * 1.8;
        if (Math.abs(aim - T) <= step) { T = aim; aim = null; } else T += Math.sign(aim - T) * step;
        moved = true;
      } else if (playing) {
        if (hold > 0) hold -= dt;
        else if (T >= END) { T = 0; hold = 0.8; moved = true; }
        else {
          const speed = (T < 3 ? 0.42 : 0.75) * (window.THUMB ? 1.6 : 1);
          const next = Math.min(END, T + dt * speed);
          if (Math.floor(next) > Math.floor(T)) { T = Math.floor(next); hold = T >= END ? 1.8 : 0.45; } else T = next;
          moved = true;
        }
      }
      if (moved) sync();
      requestAnimationFrame(tick);
    }

    // 面付けの図。印刷する面に、ページの名前と読む順番の矢印（輪）を描く
    const NS = 'http://www.w3.org/2000/svg';
    function drawMap() {
      const svg = $('map');
      const cut = cutMode === 'none' ? [] : cutMode === 'all' ? [0, 1, 2, 3] : [1, 2];
      const cw = 70, ch = 99, x0 = 10, y0 = 10;
      const cx = (col) => x0 + col * cw + cw / 2, cy = (row) => y0 + row * ch + ch / 2;
      let s = `<defs><marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" class="tip"/></marker></defs>`;
      s += `<rect x="${x0}" y="${y0}" width="${cw * 4}" height="${ch * 2}" class="sheet"/>`;
      for (let c = 1; c < 4; c++) s += `<line x1="${x0 + c * cw}" y1="${y0}" x2="${x0 + c * cw}" y2="${y0 + ch * 2}" class="fold"/>`;
      for (let c = 0; c < 4; c++) s += `<line x1="${x0 + c * cw}" y1="${y0 + ch}" x2="${x0 + (c + 1) * cw}" y2="${y0 + ch}" class="${cut.includes(c) ? 'cut' : 'fold'}"/>`;
      for (const p of impose(bind)) {
        const x = cx(p.col), y = cy(p.row) + (p.row === 0 ? 20 : -20);
        s += `<text x="${x}" y="${y}" class="lab${p.rot ? ' up' : ''}"${p.rot ? ` transform="rotate(180 ${x} ${y})"` : ''}>${NAMES[p.page]}</text>`;
      }
      const loop = cycle(4, cut);
      if (loop) {
        const pts = loop.map(([r, c]) => [cx(bind === 'right' ? 3 - c : c), cy(r) + (r === 0 ? -16 : 16)]);
        pts.forEach((a, i) => {
          const b = pts[(i + 1) % pts.length];
          const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
          s += `<line x1="${(a[0] + ux * 12).toFixed(1)}" y1="${(a[1] + uy * 12).toFixed(1)}" x2="${(b[0] - ux * 14).toFixed(1)}" y2="${(b[1] - uy * 14).toFixed(1)}" class="seg" marker-end="url(#arw)"/>`;
        });
      }
      svg.innerHTML = s;
      const info = inspect(4, cut);
      let note;
      if (loop) note = '8マスが1つの輪につながる。表紙から矢印をたどる順番が、そのまま読む順番になる。上の段は裏へ折るので、逆さま（茶色の字）に刷る。';
      else if (info.parts > 1) note = `紙が${info.parts}枚に分かれてしまう。上の段と下の段が別々の帯になり、1冊の本にならない。`;
      else note = `${info.branch}つのマスが3方向（左右と上下）につながり、輪にならない。紙を十字に開けないので、ページを順にめくれない。`;
      $('map-note').textContent = note;
    }

    const fields = $('fields');
    TEXT.forEach((text, k) => {
      const lab = document.createElement('label');
      const span = document.createElement('span');
      span.textContent = k === 0 || k === 7 ? NAMES[k] : `${k} ページ`;
      const ta = document.createElement('textarea');
      ta.rows = 2;
      ta.maxLength = 40;
      ta.spellcheck = false;
      ta.value = text;
      ta.addEventListener('input', () => { pages[k].tx.textContent = ta.value; });
      // そのページが見える見開きまで本を開く
      ta.addEventListener('focus', () => { setPlaying(false); aim = 3 + Math.ceil(k / 2); });
      lab.append(span, ta);
      fields.append(lab);
    });

    slider.addEventListener('input', () => { setPlaying(false); aim = null; T = Number(slider.value) / 100; sync(); });
    playBtn.addEventListener('click', () => {
      aim = null;
      if (!playing && T >= END) T = 0;
      setPlaying(!playing);
      hold = 0;
    });
    for (const b of document.querySelectorAll('[data-go]')) {
      b.addEventListener('click', () => { setPlaying(false); aim = Number(b.dataset.go) / 100; });
    }
    bindSel.addEventListener('change', () => {
      bind = bindSel.value;
      document.documentElement.classList.toggle('rtl', bind === 'right');
      drawMap();
      render();
    });
    for (const r of document.querySelectorAll('input[name="cut"]')) {
      r.addEventListener('change', () => { if (r.checked) { cutMode = r.value; drawMap(); } });
    }
    new ResizeObserver(render).observe(stage);

    setPlaying(playing);
    drawMap();
    sync();
    requestAnimationFrame(tick);
  },
});

dekiru.add({
  id: 'tr-20261120-zram-compress', c: 'trend', lv: 2, date: '2026-11-20',
  t: 'RAM を買い足さずに、メモリのページを圧縮して詰める（zram の仕組み）',
  y: 'らむをかいたさずにめもりのぺーじをあっしゅくしてつめる',
  tags: ['zram', 'LZ4', 'メモリ圧縮', 'LRU', 'Uint8Array'],
  d: '2026年11月19日、Therry van Neerven さんの記事「Do not buy RAM, compress!」が Hacker News で260点を超え、200件以上のコメントが付いた。AI を使って作業を並べて進めるうちにメモリが足りなくなり、RAM を買い足す代わりに Linux の zram を有効にしたという話である。ブラウザのタブを大量に開いた状態で、zram の中では 5.7 GB のデータが 1.7 GB の RAM に収まっていた（1 : 3.35）。zram は、しばらく使われていないページを圧縮して RAM の中の置き場へ移し、また使うときに展開して戻す。この見本は、その動きを 64 マス（1マス 4 KiB）の小さな RAM で再現した。タブを開くと、文章・JSON・プログラムの変数（ヒープ）・画像・0 だけのページを本物のバイト列で作る。RAM が足りなくなると、一番長く使われていないページを LZ4 のブロック形式で圧縮して zram へ移す。古いタブへ切り替えると、ページを展開して戻し、元の中身と1バイトずつ同じかを確かめる。zram を「なし」にすると、5つ目のタブを開いた時点で一番古いタブが閉じられる。RAM と同じ大きさの zram なら6つ、2倍なら8つまで閉じずに開ける。半分では4つのままで、zram が小さすぎると効かないことも分かる。圧縮方式は LZ4 だけを一から書いた（実際の zram は zstd なども選べる）。カーネルが追い出すページを選ぶ細かい仕組み、zsmalloc の大きさの区分による無駄、管理用の情報の大きさ、ディスクへの書き出しは再現していない。',
  p: 'LZ4 は「前に同じ並びがあれば、何バイト前から何バイト写すかだけを書く」圧縮方式。4バイトの並びにかけ算をして 12 ビットの番号にし、その番号の表に「最後に見た位置」を入れておくと、前の同じ並びを1回の表引きで探せる。出力は、1バイトの印（上の4ビットがそのまま書く長さ、下の4ビットが写す長さ − 4）、そのまま書くバイト、2バイトの距離の繰り返しで、15 以上の長さは 255 ずつ足すバイトを後ろに付けて表す。展開は印を読んで写すだけなので、圧縮より速い。zram はこれをページごとに行い、全部が同じ値のページは値だけを覚え、あまり縮まないページは生のまま置く。圧縮した分だけ置き場が小さくなり、空いたマスに別のタブのページが入る。追い出すページは、最後に使った時刻が一番古いもの（LRU）を選ぶ。',
  refs: [
    { title: 'Do not buy RAM, compress!（Therry van Neerven）', url: 'https://curiousbits.nl/blog/do-not-buy-ram-compress/' },
    { title: 'Hacker News: Do not buy RAM, compress', url: 'https://news.ycombinator.com/item?id=50557661' },
    { title: 'zram: Compressed RAM-based block devices（Linux カーネルの文書）', url: 'https://docs.kernel.org/admin-guide/blockdev/zram.html' },
    { title: 'LZ4 Block Format Description', url: 'https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md' },
  ],
  html: `<div class="wrap">
  <div class="cols">
    <section>
      <div class="hd">RAM <span class="mut">64 マス（1マス = 4 KiB のページ。数字はタブの番号）</span></div>
      <div id="ram" class="ram" role="img" aria-label="RAM の使われ方"></div>
      <ul class="legend" aria-label="色の意味">
        <li><i class="text"></i>文章（HTML）</li>
        <li><i class="json"></i>JSON</li>
        <li><i class="heap"></i>ヒープ</li>
        <li><i class="media"></i>画像</li>
        <li><i class="zero"></i>0 だけ</li>
        <li><i class="z"></i>zram の置き場</li>
        <li><i class="free"></i>空き</li>
      </ul>
    </section>
    <section>
      <dl id="st" class="st"></dl>
      <p id="msg" class="msg" role="status"></p>
    </section>
  </div>
  <div class="ctl">
    <button type="button" id="bOpen">タブを開く</button>
    <button type="button" id="bOld">一番古いタブへ切り替える</button>
    <label>zram の大きさ
      <select id="zsize">
        <option value="0">なし</option>
        <option value="0.5">RAM の半分</option>
        <option value="1" selected>RAM と同じ</option>
        <option value="2">RAM の2倍</option>
      </select>
    </label>
    <label class="sw"><input type="checkbox" switch id="auto"> 自動で動かす</label>
    <button type="button" id="bReset">最初から</button>
  </div>
  <div id="tabs" class="tabs" role="group" aria-label="開いたタブ（押すとそのタブへ切り替える）"></div>
  <section class="view">
    <div class="hd">1ページ（4,096 バイト）を LZ4 で圧縮した中身</div>
    <div class="row" id="kinds" role="radiogroup" aria-label="ページの種類"></div>
    <div class="vcols">
      <canvas id="bytes" width="64" height="64" role="img" aria-label="ページのバイトの図"></canvas>
      <div class="vinfo">
        <p id="vnum"></p>
        <pre id="vtext" class="vtext"></pre>
      </div>
    </div>
    <p class="mut small"><i class="sq lit"></i>そのまま書いたバイト　<i class="sq cp"></i>前から写したバイト　<i class="sq same"></i>同じ値だけ（左の図は 1 バイトを 1 マスにして 64 × 64 に並べた。明るいほど値が大きい）</p>
  </section>
  <p id="bench" class="mut small"></p>
</div>`,
  css: `:root { color-scheme: dark; --bg: #11141b; --fg: #e3e7ef; --mut: #98a2b8; --line: #2b3346; --text: #6fb3ff; --json: #46d39a; --heap: #b892ff; --media: #ffc562; --zero: #566176; --z: #ff7fa8; --lit: #ffb057; --cp: #3f86e0; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, sans-serif; }
    .wrap { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    @media (min-width: 620px) { .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    section { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .hd { font-weight: 600; }
    .mut { color: var(--mut); font-weight: 400; }
    .small { font-size: 12px; margin: 0; }
    .ram { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 3px; max-inline-size: 340px; }
    .ram div { aspect-ratio: 1; border-radius: 3px; border: 1px solid var(--line); display: grid; place-items: center; font-size: 11px; font-weight: 700; color: #0b0e14; transition: background-color .3s; }
    .ram .text, .legend .text { background: var(--text); }
    .ram .json, .legend .json { background: var(--json); }
    .ram .heap, .legend .heap { background: var(--heap); }
    .ram .media, .legend .media { background: var(--media); }
    .ram .zero, .legend .zero { background: var(--zero); }
    .ram .text, .ram .json, .ram .heap, .ram .media, .ram .zero { border-color: transparent; }
    .ram .z { border-color: var(--z); color: var(--z); background: linear-gradient(to top, #6a2c44 var(--f, 100%), #1a1219 var(--f, 100%)); }
    .legend .z { background: #6a2c44; outline: 1px solid var(--z); }
    .legend .free { outline: 1px solid var(--line); }
    .ram .cur { outline: 2px solid #fff; outline-offset: -2px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--mut); }
    .legend li { display: flex; align-items: center; gap: 4px; }
    .legend i, .sq { display: inline-block; inline-size: 10px; block-size: 10px; border-radius: 2px; }
    .sq { vertical-align: -1px; margin-inline-end: 4px; }
    .sq.lit { background: var(--lit); } .sq.cp { background: var(--cp); } .sq.same { background: var(--zero); }
    .st { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; margin: 0; font-size: 13px; }
    .st dt { color: var(--mut); }
    .st dd { margin: 0; font-variant-numeric: tabular-nums; }
    .st .big { font-size: 18px; font-weight: 700; color: var(--z); }
    .msg { margin: 0; padding: 6px 8px; border-inline-start: 3px solid var(--z); background: #181c26; border-radius: 4px; font-size: 13px; min-block-size: 3em; }
    .ctl, .row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
    button, select { font: inherit; min-block-size: 28px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; background: #1e2433; color: var(--fg); cursor: pointer; }
    button:hover:not(:disabled) { background: #283048; }
    :focus-visible { outline: 2px solid #ffd27a; outline-offset: 2px; }
    .sw { display: inline-flex; align-items: center; gap: 6px; }
    input[type="checkbox"][switch] { accent-color: var(--z); margin: 0; cursor: pointer; }
    input[type="checkbox"][switch]:focus-visible { outline: 3px solid #ffd27a; outline-offset: 4px; }
    .tabs { display: flex; flex-wrap: wrap; gap: 6px; }
    .tab { display: flex; flex-direction: column; gap: 3px; min-inline-size: 104px; padding: 4px 8px; text-align: start; font-size: 12px; }
    .tab b { font-size: 13px; }
    .tab .bar { display: flex; block-size: 6px; background: #0c0f15; border-radius: 3px; overflow: hidden; }
    .tab .bar .r { background: #9fb4d8; } .tab .bar .q { background: var(--z); }
    .tab.cur { border-color: #fff; }
    .tab:disabled { opacity: .5; cursor: default; }
    .tab:disabled b { text-decoration: line-through; }
    .view { border-block-start: 1px solid var(--line); padding-block-start: 8px; }
    .row label { display: inline-flex; align-items: center; gap: 4px; }
    .vcols { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
    @media (min-width: 560px) { .vcols { grid-template-columns: 220px minmax(0, 1fr); } }
    #bytes { inline-size: min(100%, 220px); block-size: auto; aspect-ratio: 1; image-rendering: pixelated; border: 1px solid var(--line); border-radius: 4px; }
    .vinfo { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .vinfo p { margin: 0; font-size: 13px; }
    .vtext { margin: 0; padding: 6px 8px; background: #0c0f15; border: 1px solid var(--line); border-radius: 4px; font: 12px/1.5 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-all; max-block-size: 15em; overflow: auto; }
    .vtext .lit { color: var(--lit); }
    .vtext .cp { color: #cfe2ff; background: rgb(63 134 224 / .35); }
    .vtext .same { color: var(--mut); }
    @media (prefers-reduced-motion: reduce) { .ram div { transition: none; } }
    .thumb .wrap { padding: 6px; }
    .thumb .ctl, .thumb .view, .thumb #bench, .thumb .legend, .thumb .tabs, .thumb .hd .mut { display: none; }
    .thumb .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }`,
  core() {
    // メモリの 1 ページ（4 KiB）を LZ4 で圧縮して置く zram の動きを、小さな模型で計算する
    const PAGE = 4096;
    const HUGE = 3072;   // 圧縮してもこれより大きいページは、生のまま置く（実際の値は zsmalloc の区分で決まる）

    // LZ4 のブロック形式で圧縮する。前に同じ4バイト以上の並びがあれば「何バイト前から何バイト写す」に置きかえる
    function compress(src) {
      const n = src.length;
      const out = new Uint8Array(n + Math.ceil(n / 255) + 16);
      const table = new Int32Array(4096).fill(-1);   // 4バイトの並びの番号 → 最後に見た位置
      let op = 0, anchor = 0, i = 0;
      const read4 = (p) => src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24);
      const hash = (v) => Math.imul(v, 2654435761) >>> 20;
      const putLen = (v) => { while (v >= 255) { out[op++] = 255; v -= 255; } out[op++] = v; };
      const lastStart = n - 12;   // 写しはここより後ろで始めない（LZ4 の決まり）
      while (i <= lastStart) {
        const v = read4(i), h = hash(v), ref = table[h];
        table[h] = i;
        if (ref < 0 || i - ref > 65535 || read4(ref) !== v) { i++; continue; }
        let len = 4;
        const max = n - 5 - i;    // 最後の5バイトは必ずそのまま書く
        while (len < max && src[ref + len] === src[i + len]) len++;
        const lit = i - anchor, ml = len - 4, off = i - ref;
        out[op++] = (Math.min(lit, 15) << 4) | Math.min(ml, 15);
        if (lit >= 15) putLen(lit - 15);
        for (let k = anchor; k < i; k++) out[op++] = src[k];
        out[op++] = off & 255;
        out[op++] = off >> 8;
        if (ml >= 15) putLen(ml - 15);
        i += len;
        anchor = i;
        if (i - 2 <= lastStart) table[hash(read4(i - 2))] = i - 2;
      }
      const lit = n - anchor;
      out[op++] = Math.min(lit, 15) << 4;
      if (lit >= 15) putLen(lit - 15);
      for (let k = anchor; k < n; k++) out[op++] = src[k];
      return out.slice(0, op);
    }

    // 圧縮した列を読んで、[そのまま書く長さ, 写す長さ, 何バイト前から] の並びにする
    function sequences(c) {
      const seqs = [];
      let ip = 0;
      const getLen = (v) => {
        let b;
        do {
          if (ip >= c.length) throw new Error('長さの途中で終わっている');
          b = c[ip++];
          v += b;
        } while (b === 255);
        return v;
      };
      while (ip < c.length) {
        const tok = c[ip++];
        let lit = tok >> 4;
        if (lit === 15) lit = getLen(lit);
        const at = ip;
        ip += lit;
        if (ip > c.length) throw new Error('そのまま書くバイトが足りない');
        if (ip === c.length) { seqs.push({ lit, at, len: 0, off: 0 }); break; }
        if (ip + 2 > c.length) throw new Error('距離が足りない');
        const off = c[ip] | (c[ip + 1] << 8);
        ip += 2;
        let ml = tok & 15;
        if (ml === 15) ml = getLen(ml);
        seqs.push({ lit, at, len: ml + 4, off });
      }
      return seqs;
    }

    // 展開する。印を読み、そのまま書くバイトを写し、前の出力から写す（重なってもよい）
    function decompress(c, size) {
      const out = new Uint8Array(size);
      let op = 0;
      for (const q of sequences(c)) {
        if (op + q.lit > size) throw new Error('元の大きさを超える');
        for (let k = 0; k < q.lit; k++) out[op++] = c[q.at + k];
        if (!q.len) continue;
        if (q.off === 0 || q.off > op || op + q.len > size) throw new Error('壊れた写し');
        for (let k = 0, from = op - q.off; k < q.len; k++) out[op++] = out[from + k];
      }
      if (op !== size) throw new Error('大きさが合わない');
      return out;
    }

    // 全部のバイトが同じ値なら、その値。違うバイトがあれば -1
    function sameFill(page) {
      const v = page[0];
      for (let i = 1; i < page.length; i++) if (page[i] !== v) return -1;
      return page.length ? v : -1;
    }

    // 種から毎回同じ並びを作る乱数（mulberry32）
    function rng(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const pick = (r, a) => a[(r() * a.length) | 0];

    // 文字列を UTF-8 のバイトにしてページへ書く。ページの端で文字の途中でも切れる
    function putText(p, pos, s) {
      for (let i = 0; i < s.length && pos < p.length; i++) {
        const ch = s.charCodeAt(i);
        if (ch < 0x80) p[pos++] = ch;
        else if (ch < 0x800) {
          p[pos++] = 0xc0 | (ch >> 6);
          if (pos < p.length) p[pos++] = 0x80 | (ch & 63);
        } else {
          p[pos++] = 0xe0 | (ch >> 12);
          if (pos < p.length) p[pos++] = 0x80 | ((ch >> 6) & 63);
          if (pos < p.length) p[pos++] = 0x80 | (ch & 63);
        }
      }
      return pos;
    }

    const WORDS = ['駅前', '新しい店', '雨', '電車', '遅れ', '市役所', '図書館', '夏祭り', '気温', '天気予報', '試合', '映画', '値下げ', '道路工事', '公園', '花火大会', '選手', '発表', '開店', '休み'];
    const JOIN = ['の', 'が', 'で', 'と', 'を'];
    const GOODS = ['りんご', 'みかん', '牛乳', '食パン', '卵', 'お茶', 'ノート', '鉛筆', '電池', '傘'];
    const TAGS = ['食べ物', '飲み物', '文房具', '日用品', 'セール', '新商品'];
    const two = (v) => String(v).padStart(2, '0');
    function newsLine(r) {
      let title = pick(r, WORDS);
      for (let i = 1, n = 3 + ((r() * 3) | 0); i < n; i++) title += pick(r, JOIN) + pick(r, WORDS);
      return `<li class="item"><a href="/news/2026/11/${10000 + ((r() * 90000) | 0)}">${title}</a><span class="time">${two((r() * 24) | 0)}:${two((r() * 60) | 0)}</span></li>\n`;
    }
    function jsonRow(r) {
      return `{"id":${1000 + ((r() * 9000) | 0)},"name":"${pick(r, GOODS)}","price":${(1 + ((r() * 50) | 0)) * 20},"stock":${(r() * 40) | 0},"tags":["${pick(r, TAGS)}","${pick(r, TAGS)}"]},\n`;
    }
    const KIND_NO = { text: 1, json: 2, heap: 3, media: 4, zero: 5 };

    // ページの中身を作る。text: HTML の一覧、json: 商品の表、heap: プログラムの変数の並び、media: 圧縮済みの画像、zero: 0 だけ
    function makePage(kind, seed) {
      const p = new Uint8Array(PAGE);
      if (!KIND_NO[kind]) throw new Error('知らない種類: ' + kind);
      if (kind === 'zero') return p;
      const r = rng(Math.imul(seed, 7919) + KIND_NO[kind]);
      if (kind === 'media') {
        for (let i = 0; i < PAGE; i++) p[i] = (r() * 256) | 0;
      } else if (kind === 'heap') {
        // 4バイトずつ: 先頭に型の番号、続けて小さな整数・近くを指す番地・決まった値。後ろはまだ使っていない 0
        const MAPS = [0x08123a41, 0x08123b91, 0x08124001, 0x08125c29, 0x08126e71, 0x08127aa9];
        const end = (PAGE * (0.45 + r() * 0.45)) & ~3;
        let pos = 0;
        const w32 = (v) => {
          if (pos + 4 > end) { pos = end; return; }
          p[pos] = v & 255; p[pos + 1] = (v >>> 8) & 255; p[pos + 2] = (v >>> 16) & 255; p[pos + 3] = v >>> 24;
          pos += 4;
        };
        while (pos < end) {
          w32(pick(r, MAPS));
          for (let f = 0, nf = 2 + ((r() * 5) | 0); f < nf; f++) {
            const k = r();
            w32(k < 0.4 ? ((r() * 1000) | 0) << 1 : k < 0.8 ? 0x08400001 + (((r() * 16384) | 0) << 2) : 0x08000071);
          }
        }
      } else {
        let pos = 0;
        while (pos < PAGE) pos = putText(p, pos, kind === 'text' ? newsLine(r) : jsonRow(r));
      }
      return p;
    }

    // タブの種類と、そのタブが使うページ（合わせて16）
    const PROFILES = [
      { name: 'ニュース', mix: { text: 7, heap: 5, media: 2, zero: 2 } },
      { name: '動画', mix: { media: 7, heap: 4, text: 2, zero: 3 } },
      { name: '表計算', mix: { json: 7, heap: 5, zero: 4 } },
      { name: '地図', mix: { media: 4, json: 5, heap: 4, zero: 3 } },
      { name: '文書', mix: { text: 8, heap: 5, zero: 3 } },
      { name: 'SNS', mix: { text: 5, media: 4, json: 3, heap: 2, zero: 2 } },
      { name: 'AI と会話', mix: { text: 6, json: 6, heap: 3, zero: 1 } },
    ];
    function tabKinds(mix, seed) {
      const list = [];
      for (const [k, n] of Object.entries(mix)) for (let i = 0; i < n; i++) list.push(k);
      const r = rng(seed);
      for (let i = list.length - 1; i > 0; i--) {
        const j = (r() * (i + 1)) | 0;
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }

    // 模型。RAM は slots マス。zram は元の大きさで zcap ページまで入る。置き場は圧縮後の合計を 4 KiB で割って切り上げたマスを使う
    function createSim(slots, zcap) {
      return { slots, zcap, clock: 0, seed: 1, pages: [], tabs: [], ram: 0, zbytes: 0, zcount: 0, same: 0, huge: 0,
        n: { out: 0, in: 0, ok: 0, kill: 0 }, ev: null };
    }
    const poolFrames = (s) => Math.ceil(s.zbytes / PAGE);
    const usedFrames = (s) => s.ram + poolFrames(s);
    const newEv = () => ({ out: 0, in: 0, ok: 0, killed: [] });

    function swapOut(s, p) {
      const fill = sameFill(p.data);
      if (fill >= 0) { p.z = { type: 'same', size: 0, fill }; s.same++; }
      else {
        const c = compress(p.data);
        if (c.length > HUGE) { p.z = { type: 'huge', size: PAGE, bytes: p.data }; s.huge++; }
        else p.z = { type: 'lz', size: c.length, bytes: c };
      }
      s.zbytes += p.z.size;
      s.zcount++;
      s.ram--;
      p.where = 'zram';
      p.data = null;
      s.n.out++;
      s.ev.out++;
    }
    function dropZ(s, p) {
      if (p.z.type === 'same') s.same--;
      if (p.z.type === 'huge') s.huge--;
      s.zbytes -= p.z.size;
      s.zcount--;
      p.z = null;
    }
    function swapIn(s, p) {
      const z = p.z;
      const d = z.type === 'same' ? new Uint8Array(PAGE).fill(z.fill) : z.type === 'huge' ? z.bytes : decompress(z.bytes, PAGE);
      dropZ(s, p);
      s.ram++;
      p.where = 'ram';
      p.data = d;
      s.n.in++;
      s.ev.in++;
      // 元の中身を作り直して、1バイトずつ比べる
      const want = makePage(p.kind, p.seed);
      let same = d.length === want.length;
      for (let i = 0; same && i < want.length; i++) same = d[i] === want[i];
      if (same) { s.n.ok++; s.ev.ok++; }
    }
    function kill(s, t) {
      for (const p of t.pages) {
        if (p.where === 'ram') s.ram--;
        if (p.where === 'zram') dropZ(s, p);
        p.where = 'gone';
        p.data = null;
      }
      t.alive = false;
      s.pages = s.pages.filter((p) => p.where !== 'gone');
      s.n.kill++;
      s.ev.killed.push(t);
    }
    // マスを1つ空ける。まず長く使われていないページを zram へ移し、それも出来なければ一番古いタブを閉じる
    function makeRoom(s, pin) {
      while (usedFrames(s) + 1 > s.slots) {
        if (s.zcount < s.zcap) {
          let victim = null;
          for (const p of s.pages) if (p.where === 'ram' && p.tab !== pin.id && (!victim || p.last < victim.last)) victim = p;
          if (victim) { swapOut(s, victim); continue; }
        }
        let old = null;
        for (const t of s.tabs) if (t.alive && t !== pin && (!old || t.last < old.last)) old = t;
        if (!old) return false;
        kill(s, old);
      }
      return true;
    }
    function openTab(s, prof) {
      s.clock++;
      s.ev = newEv();
      const t = { id: s.tabs.length, name: prof.name, alive: true, last: s.clock, pages: [] };
      s.tabs.push(t);
      for (const kind of tabKinds(prof.mix, s.seed * 31 + t.id)) {
        if (!makeRoom(s, t)) { kill(s, t); break; }
        const p = { id: s.seed, tab: t.id, kind, seed: s.seed++, where: 'ram', last: s.clock, data: null, z: null };
        p.data = makePage(kind, p.seed);
        s.ram++;
        s.pages.push(p);
        t.pages.push(p);
      }
      return t;
    }
    // タブへ切り替える。zram にあるページは展開して戻し、全部のページを「今使った」にする
    function touchTab(s, t) {
      s.ev = newEv();
      if (!t.alive) return false;
      s.clock++;
      t.last = s.clock;
      for (const p of t.pages) {
        if (p.where === 'zram') {
          if (!makeRoom(s, t)) { kill(s, t); return false; }
          swapIn(s, p);
        }
        p.last = s.clock;
      }
      return true;
    }
    function stats(s) {
      const pool = poolFrames(s);
      return {
        slots: s.slots, ram: s.ram, pool, free: s.slots - s.ram - pool,
        stored: s.zcount, same: s.same, huge: s.huge,
        orig: s.zcount * PAGE, compr: s.zbytes, memUsed: pool * PAGE,
        ratio: pool ? (s.zcount * PAGE) / (pool * PAGE) : Infinity,
        holds: s.ram + s.zcount,
        opened: s.tabs.length, alive: s.tabs.filter((t) => t.alive).length, killed: s.n.kill,
      };
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    if (window.THUMB) document.documentElement.classList.add('thumb');
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const ramEl = $('ram'), stEl = $('st'), msgEl = $('msg'), tabsEl = $('tabs'), zsel = $('zsize'), autoSw = $('auto');
    const N = 64;
    const cells = Array.from({ length: N }, () => ramEl.appendChild(document.createElement('div')));
    const num = (v) => v.toLocaleString('ja-JP');
    const kib = (b) => (b / 1024).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + ' KiB';
    let sim, slotKeys, cur = -1, profNo = 0, timer = 0, steps = 0;

    function say(text) { msgEl.textContent = text; }

    // マスの並びを前回からなるべく変えない。いなくなったものだけ外し、新しいものを空いたマスへ入れる
    function layout() {
      const want = new Map();
      for (const p of sim.pages) if (p.where === 'ram') want.set('p' + p.id, p);
      const pool = poolFrames(sim);
      for (let k = 0; k < pool; k++) want.set('z' + k, k);
      for (let i = 0; i < N; i++) if (slotKeys[i] && !want.has(slotKeys[i])) slotKeys[i] = null;
      const placed = new Set(slotKeys.filter(Boolean));
      let at = 0;
      for (const key of want.keys()) {
        if (placed.has(key)) continue;
        while (at < N && slotKeys[at]) at++;
        if (at < N) slotKeys[at] = key;
      }
      return want;
    }

    function render() {
      const want = layout();
      const pool = poolFrames(sim);
      const lastFill = pool ? (sim.zbytes - (pool - 1) * PAGE) / PAGE : 1;
      for (let i = 0; i < N; i++) {
        const key = slotKeys[i], c = cells[i];
        let cls = 'free', txt = '', f = '100%';
        if (key && key[0] === 'p') {
          const p = want.get(key);
          cls = p.kind + (p.tab === cur ? ' cur' : '');
          txt = String(p.tab + 1);
        } else if (key) {
          cls = 'z';
          txt = 'z';
          if (want.get(key) === pool - 1) f = Math.round(lastFill * 100) + '%';
        }
        if (c.className !== cls) c.className = cls;
        if (c.textContent !== txt) c.textContent = txt;
        c.style.setProperty('--f', f);
      }
      const s = stats(sim);
      ramEl.setAttribute('aria-label', `RAM ${N} マスのうち、ページ ${s.ram} マス、zram の置き場 ${s.pool} マス、空き ${s.free} マス`);
      const rows = [
        ['RAM の中', `ページ ${s.ram}・zram ${s.pool}・空き ${s.free} マス`],
        ['持っているデータ', `<span class="big">${kib(s.holds * PAGE)}</span>（RAM は ${kib(N * PAGE)}。${(s.holds / N).toFixed(2)} 倍）`],
      ];
      if (sim.zcap) {
        rows.push(['zram のページ', `${s.stored} / ${sim.zcap}（0 だけ ${s.same}・縮まず生のまま ${s.huge}）`]);
        rows.push(['zram の圧縮率', s.pool ? `元 ${kib(s.orig)} → 置き場 ${kib(s.memUsed)}（<b>1 : ${s.ratio.toFixed(2)}</b>）` : '—']);
      } else {
        rows.push(['zram', 'なし（足りなくなったらタブを閉じる）']);
      }
      rows.push(['タブ', `開いた ${s.opened}・生きている ${s.alive}・閉じられた ${s.killed}`]);
      rows.push(['展開して戻した', `${num(sim.n.in)} ページ（元と同じ ${num(sim.n.ok)}）`]);
      stEl.replaceChildren();
      for (const [k, v] of rows) {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = k;
        dd.innerHTML = v;   // 中身はこのコードで作った数と決まった言葉だけ
        stEl.append(dt, dd);
      }
      tabsEl.replaceChildren();
      for (const t of sim.tabs) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tab' + (t.id === cur && t.alive ? ' cur' : '');
        b.dataset.id = t.id;
        b.disabled = !t.alive;
        const inRam = t.pages.filter((p) => p.where === 'ram').length, inZ = t.pages.filter((p) => p.where === 'zram').length;
        const nm = document.createElement('b');
        nm.textContent = `${t.id + 1} ${t.name}`;
        const bar = document.createElement('span');
        bar.className = 'bar';
        const r1 = document.createElement('i'), r2 = document.createElement('i');
        r1.className = 'r'; r1.style.flex = String(inRam);
        r2.className = 'q'; r2.style.flex = String(inZ);
        bar.append(r1, r2);
        const info = document.createElement('span');
        info.className = 'mut';
        info.textContent = t.alive ? `RAM ${inRam}・zram ${inZ}` : '閉じられた';
        b.append(nm, bar, info);
        tabsEl.append(b);
      }
    }

    function report(head) {
      const e = sim.ev, parts = [head];
      if (e.in) parts.push(`zram から ${e.in} ページを展開して戻した（元と1バイトずつ同じ: ${e.ok} ページ）。`);
      if (e.out) parts.push(`RAM が足りないので、長く使われていないページ ${e.out} 個を圧縮して zram へ移した。`);
      if (e.killed.length) {
        const names = e.killed.map((t) => `「${t.id + 1} ${t.name}」`).join('');
        parts.push(`${sim.zcap ? 'RAM も zram も足りないので' : 'RAM が足りないので'}、一番長く使われていない${names}のタブを閉じた。`);
      }
      say(parts.join(''));
    }
    function reset() {
      sim = createSim(N, Math.round(N * Number(zsel.value)));
      slotKeys = new Array(N).fill(null);
      cur = -1;
      profNo = 0;
      steps = 0;
      say('RAM は空です。');
      render();
    }
    function doOpen() {
      const t = openTab(sim, PROFILES[profNo++ % PROFILES.length]);
      cur = t.alive ? t.id : -1;
      report(`「${t.id + 1} ${t.name}」のタブを開いた（${t.pages.length} ページ）。`);
      render();
    }
    function oldest() {
      let o = null;
      for (const t of sim.tabs) if (t.alive && t.id !== cur && (!o || t.last < o.last)) o = t;
      return o;
    }
    function doTouch(t) {
      if (!t || !t.alive) { say('切り替えられるタブがありません。'); return; }
      touchTab(sim, t);
      cur = t.alive ? t.id : -1;
      report(`「${t.id + 1} ${t.name}」のタブへ切り替えた。`);
      render();
    }

    // 自動で動かす: タブを開き、ときどき一番古いタブへ戻る。12 個開いたら最初から
    function autoStep() {
      steps++;
      if (sim.tabs.length >= 12) { reset(); doOpen(); }
      else if (steps % 3 === 0 && oldest()) doTouch(oldest());
      else doOpen();
    }
    function loop() {
      timer = setTimeout(() => { autoStep(); loop(); }, window.THUMB ? 650 : 1500);
    }
    function setAuto(on) {
      autoSw.checked = on;
      clearTimeout(timer);
      if (on) loop();
    }

    $('bOpen').addEventListener('click', () => { setAuto(false); doOpen(); });
    $('bOld').addEventListener('click', () => { setAuto(false); doTouch(oldest()); });
    $('bReset').addEventListener('click', () => { reset(); doOpen(); });
    zsel.addEventListener('change', () => { reset(); doOpen(); });
    autoSw.addEventListener('change', () => setAuto(autoSw.checked));
    tabsEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (!b || b.disabled) return;
      setAuto(false);
      doTouch(sim.tabs[Number(b.dataset.id)]);
    });

    // 1ページの中を見る
    const KINDS = [['text', '文章（HTML）'], ['json', 'JSON'], ['heap', 'ヒープ'], ['media', '画像'], ['zero', '0 だけ']];
    const kindsEl = $('kinds'), canvas = $('bytes'), vnum = $('vnum'), vtext = $('vtext');
    const ctx = canvas.getContext('2d');
    const dec = new TextDecoder();
    for (const [k, label] of KINDS) {
      const lab = document.createElement('label');
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = 'kind';
      r.value = k;
      r.checked = k === 'text';
      lab.append(r, label);
      kindsEl.append(lab);
    }
    kindsEl.addEventListener('change', (e) => { if (e.target.name === 'kind') showPage(e.target.value); });

    function span(text, flag) {
      const s = document.createElement('span');
      s.className = flag === 1 ? 'cp' : flag === 2 ? 'same' : 'lit';
      s.textContent = text;
      return s;
    }
    function showPage(kind) {
      const page = makePage(kind, 11);
      const flags = new Uint8Array(PAGE);   // 0: そのまま、1: 写した、2: 同じ値だけ
      const fill = sameFill(page);
      let text;
      if (fill >= 0) {
        flags.fill(2);
        text = `全部のバイトが ${fill} なので、zram は圧縮せずに「${fill} で埋まっている」とだけ覚える。置き場は使わない。`;
      } else {
        const c = compress(page);
        let pos = 0, copied = 0, times = 0;
        for (const q of sequences(c)) {
          pos += q.lit;
          if (q.len) { flags.fill(1, pos, pos + q.len); pos += q.len; copied += q.len; times++; }
        }
        text = `4,096 バイト → ${num(c.length)} バイト（1 : ${(PAGE / c.length).toFixed(2)}）。前から写したバイトは ${num(copied)}（${Math.round((copied / PAGE) * 100)}%）、写しの回数は ${num(times)} 回。`;
        if (c.length > HUGE) text += '同じ並びがほとんど無く、圧縮すると逆に大きくなるので、zram はこのページを生のまま置く。';
      }
      vnum.textContent = text;
      canvas.setAttribute('aria-label', text);
      const img = ctx.createImageData(64, 64);
      const COL = [[255, 176, 87], [63, 134, 224], [86, 97, 118]];
      for (let i = 0; i < PAGE; i++) {
        const c = COL[flags[i]], k = 0.45 + 0.55 * (page[i] / 255);
        img.data[i * 4] = c[0] * k;
        img.data[i * 4 + 1] = c[1] * k;
        img.data[i * 4 + 2] = c[2] * k;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      vtext.replaceChildren();
      if (kind === 'text' || kind === 'json') {
        // 文字の切れ目でまとめてから UTF-8 として読む
        let start = 0, flag = flags[0], i = 0;
        while (i < 480) {
          const b = page[i], step = b < 0x80 ? 1 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
          if (flags[i] !== flag) { vtext.append(span(dec.decode(page.subarray(start, i)), flag)); start = i; flag = flags[i]; }
          i += step;
        }
        vtext.append(span(dec.decode(page.subarray(start, i)), flag), document.createTextNode(' …'));
      } else {
        // 先頭の 128 バイトを 16 進数で並べる
        for (let i = 0; i < 128; i++) {
          vtext.append(span(page[i].toString(16).padStart(2, '0'), flags[i]), document.createTextNode(i % 16 === 15 ? '\n' : ' '));
        }
        vtext.append(document.createTextNode('…'));
      }
    }

    // この端末で 1 ページの圧縮と展開にかかる時間を測る
    function bench() {
      const page = makePage('text', 3), R = 200;
      let c = compress(page);
      let t0 = performance.now();
      for (let k = 0; k < R; k++) c = compress(page);
      const tc = (performance.now() - t0) / R;
      t0 = performance.now();
      for (let k = 0; k < R; k++) decompress(c, PAGE);
      const td = (performance.now() - t0) / R;
      const us = (ms) => (ms * 1000).toFixed(1) + ' μs';
      const mb = (ms) => (ms > 0 ? Math.round(PAGE / 1048576 / (ms / 1000)) + ' MB' : '—');
      $('bench').textContent = `この端末での速さ（文章のページを ${R} 回ずつ処理した平均）: 1ページの圧縮 ${us(tc)}、展開 ${us(td)}。1秒あたり、圧縮は約 ${mb(tc)}、展開は約 ${mb(td)} のページを処理できる。`;
    }

    reset();
    doOpen();
    showPage('text');
    setAuto(!!window.THUMB || !calm.matches);
    if (!window.THUMB) setTimeout(bench, 600);
  },
});

dekiru.add({
  id: 'tr-20261120-jj-auto-rebase', c: 'trend', lv: 3, date: '2026-11-20',
  t: '下の変更を直すと、上に重なった変更が自動で付け替わる版管理（jj / Jujutsu の仕組み）',
  y: 'したのへんこうをなおすとうえにかさなったへんこうがじどうでつけかわるばんかんり',
  tags: ['Jujutsu', 'jj', '版管理', 'リベース', '三方向マージ'],
  d: '2026年11月18日に Ethan Lowman さんが書いた入門記事「Jujutsu Primer」が、11月20日に Hacker News で110点を超えた。Git を使う人に向けて、版管理の道具 jj（Jujutsu）を紹介する記事である。jj では作業中のファイルもいつも1つのコミット（@）として記録される。変更には、中身が変わっても同じままの change ID と、中身ごとに変わるコミット ID の2つが付く。下にある変更を直すと、その上に重なった変更を jj が自動で付け替え（リベース）、同じ行がぶつかっても止まらずに「衝突した変更」として記録する。どの操作も jj undo で取り消せる。この見本は、その仕組みを2つのファイルの行を単位にした小さな模型で一から作った。左のグラフで変更を選び、jj new・jj edit・jj squash・jj abandon・jj describe・jj rebase・jj undo・jj redo を押すと、グラフ・ファイル・端末の出力・操作の記録（op log）が変わる。@ を選ぶと、ファイルの行を書き換えられる。「自動で流れを見る」をオンにすると、記事とほぼ同じ流れを順に見せる。税率を直すと上の変更が衝突し、新しい変更で直して squash し、undo と redo をして、最後に rebase で一本にする。行の挿入と削除、親が2つあるマージのコミット、revset、ブックマークの移動、Git との同期は再現していない。コミット ID は SHA-1 ではなく、この見本で作った短いハッシュである。本物の jj は次に jj のコマンドを動かしたときに作業コピーを記録するが、この見本は行の欄で Enter を押したときか、欄から離れたときに記録する。',
  p: 'jj は、衝突した中身を「足す項と引く項の並び」で持つ（A + (C − B) のような形）。変更を新しい親へ移すときは、行ごとに「子 + 新しい親 − 古い親」を作り、同じ値の足す項と引く項を打ち消す。子がその行を変えていなければ「子 = 古い親」なので打ち消し合い、新しい親の値だけが残る。親がその行を変えていなければ「新しい親 = 古い親」なので、子の値が残る。両方が別の値に変えていると3つの項が残り、それが衝突になる（両方が同じ値に変えたときは、その値に決める）。衝突した変更の上にさらに変更を付け替えても同じ計算で済み、衝突をそのまま持つ子は打ち消し合って親と同じ衝突になる。だから jj は衝突で止まらずに先へ進める。コミット ID は中身・説明・親のコミット ID・時刻から作るので、付け替えられた変更はすべて新しいコミット ID になる。操作の記録は、操作のたびにリポジトリ全体の状態を1つ残すだけで、undo は1つ前の状態へ戻す新しい操作として記録する。',
  refs: [
    { title: 'Jujutsu Primer（Ethan Lowman）', url: 'https://ethanlowman.com/posts/jj-primer/' },
    { title: 'Hacker News: Jujutsu Primer', url: 'https://news.ycombinator.com/item?id=50570628' },
    { title: 'Jujutsu docs: First-class conflicts（衝突の持ち方）', url: 'https://jj-vcs.github.io/jj/latest/technical/conflicts/' },
    { title: 'jj-vcs/jj（GitHub）', url: 'https://github.com/jj-vcs/jj' },
  ],
  html: `<div class="wrap">
  <div class="cols">
    <section>
      <div class="hd">jj log <span class="mut">（押すと右に中身を出す）</span></div>
      <div id="log" class="log" role="group" aria-label="変更のグラフ（上ほど新しい）"></div>
      <p class="mut small">左の英字が change ID、右の16進数がコミット ID。太字は、ほかと区別できる最短の頭の文字。@ が作業コピー、× は衝突、◆ は変えられない変更（main）。</p>
    </section>
    <section>
      <div class="hd" id="selhd"></div>
      <p id="evo" class="mut small"></p>
      <div id="files" class="files"></div>
    </section>
  </div>
  <p id="msg" class="msg" role="status"></p>
  <div class="ctl">
    <div role="toolbar" id="bar" focusgroup="toolbar wrap" aria-label="jj のコマンド（選んだ変更に対して動く）">
      <button type="button" data-op="new">jj new</button>
      <button type="button" data-op="edit">jj edit</button>
      <button type="button" data-op="squash">jj squash</button>
      <button type="button" data-op="abandon">jj abandon</button>
      <span role="separator" aria-orientation="vertical"></span>
      <button type="button" data-op="undo">jj undo</button>
      <button type="button" data-op="redo">jj redo</button>
    </div>
  </div>
  <div class="ctl">
    <form id="fDesc" class="f">
      <label for="desc">説明</label>
      <input id="desc" type="text" autocomplete="off" maxlength="40">
      <button type="submit" id="bDesc">jj describe -m</button>
    </form>
    <form id="fReb" class="f">
      <button type="submit" id="bReb">jj rebase -s -o</button>
      <label for="dest">移す先</label>
      <select id="dest"></select>
    </form>
  </div>
  <div class="ctl">
    <label class="sw"><input type="checkbox" switch id="auto"> 自動で流れを見る</label>
    <button type="button" id="bReset">最初から</button>
  </div>
  <div class="cols under">
    <section>
      <div class="hd">端末</div>
      <pre id="term" class="term" tabindex="0" aria-label="端末の出力"></pre>
    </section>
    <section>
      <div class="hd">jj op log <span class="mut">（押すと、その操作の直後へ戻す）</span></div>
      <ol id="ops" class="ops"></ol>
    </section>
  </div>
</div>`,
  css: `:root { color-scheme: dark; --bg: #11141b; --fg: #e3e7ef; --mut: #98a2b8; --line: #2b3346; --panel: #181c26; --cid: #e09cff; --cmt: #6fb3ff; --wc: #46d39a; --bad: #ff7a7a; --chg: #ffc562; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, sans-serif; }
    .wrap { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    @media (min-width: 640px) { .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    section { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .hd { font-weight: 600; }
    .mut { color: var(--mut); font-weight: 400; }
    .small { font-size: 12px; margin: 0; }
    .log, .files, .term, .ops, .cid, .cmt, .ctl button, .f button { font-family: ui-monospace, Consolas, monospace; }
    .log { position: relative; }
    .log svg { position: absolute; inset-block-start: 0; inset-inline-start: 0; z-index: 1; pointer-events: none; }
    .log path { fill: none; stroke: #6c7891; stroke-width: 1.5; }
    .log .n { fill: var(--bg); stroke: #c9d1e3; stroke-width: 1.5; }
    .log .n.wc { stroke: var(--wc); }
    .log .n.im { fill: #c9d1e3; }
    .log .n.cf { stroke: var(--bad); }
    .log .x { stroke: var(--bad); stroke-width: 2; }
    .log .at { fill: var(--wc); font: 700 11px ui-monospace, Consolas, monospace; text-anchor: middle; }
    .row { position: absolute; inset-inline: 0; block-size: 44px; display: flex; flex-direction: column; justify-content: center; gap: 0; text-align: start; padding-block: 0; padding-inline-end: 6px; border: 1px solid transparent; border-radius: 6px; background: none; color: inherit; font: inherit; font-size: 13px; line-height: 1.4; cursor: pointer; }
    .row .l1, .row .l2 { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row .l2 { color: var(--mut); font-family: system-ui, sans-serif; }
    .row[aria-pressed="true"] { background: #1d2333; border-color: #3b4660; }
    @media (hover: hover) { .row:hover { background: #1a2030; } }
    .cid { color: var(--cid); }
    .cmt { color: var(--cmt); }
    .cid b, .cmt b { font-weight: 800; }
    .cid .r, .cmt .r { opacity: .55; }
    .bm { color: var(--wc); }
    .tag { color: var(--mut); }
    .tag.bad { color: var(--bad); }
    .flash { border-radius: 3px; animation: fl 1.4s ease-out; }
    @keyframes fl { from { background: rgb(111 179 255 / .5); } to { background: transparent; } }
    .files { display: flex; flex-direction: column; gap: 8px; }
    .file { border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
    .fname { padding: 3px 8px; background: var(--panel); color: var(--mut); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ln { display: grid; grid-template-columns: 2.4em minmax(0, 1fr); align-items: start; font-size: 13px; border-inline-start: 3px solid transparent; }
    .ln.chg { border-inline-start-color: var(--chg); background: rgb(255 197 98 / .07); }
    .ln.cf { border-inline-start-color: var(--bad); background: rgb(255 122 122 / .08); }
    .ln .no { color: #5d6780; text-align: end; padding: 3px 8px 3px 0; user-select: none; }
    .lb { display: flex; flex-direction: column; gap: 3px; padding: 1px 4px 1px 0; min-width: 0; }
    .lb code { white-space: pre; padding: 2px 4px; overflow: hidden; text-overflow: ellipsis; min-block-size: 1.5em; }
    .lb input { font: inherit; inline-size: 100%; box-sizing: border-box; padding: 1px 4px; margin: 1px 0; background: #0c0f15; color: var(--fg); border: 1px solid #2f3a52; border-radius: 4px; }
    .lb .mk { margin: 2px 0; padding: 4px 6px; font: inherit; font-size: 12px; white-space: pre; overflow-x: auto; color: #f0d0d0; background: #1c1418; border-radius: 4px; }
    .msg { margin: 0; padding: 6px 8px; border-inline-start: 3px solid var(--cmt); background: var(--panel); border-radius: 4px; font-size: 13px; min-block-size: 3em; }
    .ctl { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
    [role="toolbar"] { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    [role="separator"] { block-size: 20px; border-inline-start: 1px solid var(--line); }
    .f { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0; }
    button, select { font: inherit; min-block-size: 28px; min-inline-size: 24px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; background: #1e2433; color: var(--fg); cursor: pointer; }
    .ctl button, .f button { font-size: 13px; }
    #desc { font: inherit; inline-size: 13em; max-inline-size: 100%; min-block-size: 28px; box-sizing: border-box; padding: 2px 6px; border: 1px solid var(--line); border-radius: 6px; background: #0c0f15; color: var(--fg); }
    @media (hover: hover) { button:hover:not([aria-disabled="true"]) { background: #283048; } }
    button[aria-disabled="true"] { opacity: .45; cursor: default; }
    :focus-visible { outline: 2px solid #ffd27a; outline-offset: 2px; }
    @media (pointer: coarse) { button, select, #desc { min-block-size: 36px; } }
    .sw { display: inline-flex; align-items: center; gap: 6px; }
    input[type="checkbox"][switch] { accent-color: var(--wc); margin: 0; cursor: pointer; }
    .term { margin: 0; padding: 6px 8px; background: #0a0d13; border: 1px solid var(--line); border-radius: 6px; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; block-size: 16em; overflow: auto; }
    .term .cmd { color: var(--wc); }
    .term .o { color: #c4cbe0; }
    .term .err { color: var(--bad); }
    .ops { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-block-size: 16em; overflow: auto; }
    .ops button { inline-size: 100%; text-align: start; font-size: 12px; padding: 2px 8px; background: none; border-color: transparent; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ops button[aria-current="true"] { border-color: #3b4660; background: #1d2333; }
    .ops .opid { color: var(--cmt); }
    @media (forced-colors: active) { .row[aria-pressed="true"], .ops button[aria-current="true"] { border-color: Highlight; } }
    @media (prefers-reduced-motion: reduce) { .flash { animation: none; } }
    .thumb .wrap { padding: 6px; gap: 6px; }
    .thumb .ctl, .thumb .under, .thumb .small, .thumb #evo, .thumb .msg { display: none; }
    .thumb .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }`,
  core() {
    // jj（Jujutsu）の変更・コミット・自動の付け替え・衝突・操作の記録を、ファイルの行を単位にした小さな模型で計算する
    const LETTERS = 'klmnopqrstuvwxyz';   // jj の change ID は k〜z の 16 文字で書く
    const FILES = ['main.py', 'README.md'];
    const BASE = {
      'main.py': ['def price(n):', '    return n * 100', '', 'print(price(3))', ''],
      'README.md': ['# 値段の計算', '', ''],
    };

    // 1行の中身は「足す項と引く項」の並びで持つ（jj の衝突の持ち方）: adds[0] − removes[0] + adds[1] − …
    // 衝突していない行は、足す項が1つで引く項が無い
    const one = (s) => ({ adds: [s], removes: [] });
    const resolved = (m) => m.adds.length === 1 && m.removes.length === 0;
    function simplify(m) {
      const adds = m.adds.slice(), removes = [];
      for (const r of m.removes) {
        const i = adds.lastIndexOf(r);   // 後ろから打ち消すと、子の値が先頭に残る
        if (i >= 0) adds.splice(i, 1); else removes.push(r);
      }
      // 両側が同じ値に書き換えたなら、その値に決める
      if (removes.length && adds.every((a) => a === adds[0]) && removes.every((r) => r === removes[0])) return one(adds[0]);
      return { adds, removes };
    }
    // 子の行 + 新しい親の行 − 古い親の行
    const rebaseLine = (ch, nb, ob) => simplify({ adds: [...ch.adds, ...nb.adds, ...ob.removes], removes: [...ch.removes, ...nb.removes, ...ob.adds] });
    function mapTree(t, f) {
      const o = {};
      for (const k of FILES) o[k] = t[k].map((m, i) => f(m, k, i));
      return o;
    }
    const rebaseTree = (ch, nb, ob) => mapTree(ch, (m, k, i) => rebaseLine(m, nb[k][i], ob[k][i]));
    const lineKey = (m) => JSON.stringify([m.adds.slice().sort(), m.removes.slice().sort()]);
    const treeKey = (t) => FILES.map((k) => t[k].map(lineKey).join('|')).join('/');
    const conflicts = (t) => FILES.reduce((n, k) => n + t[k].filter((m) => !resolved(m)).length, 0);

    // 文字列から16進数の指紋を作る（本物は SHA-1。ここでは 32 ビットのハッシュを2つ並べた短いもの）
    function hex(str, n) {
      let a = 0x811c9dc5, b = 0x9e3779b9;
      for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        a = Math.imul(a ^ ch, 0x01000193);
        b = Math.imul(b ^ ch, 0x5bd1e995);
        b ^= b >>> 15;
      }
      return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')).slice(0, n);
    }
    // ほかの ID と区別できる最短の頭の文字数
    function prefixLen(all, s) {
      let n = 1;
      while (n < s.length && all.some((o) => o !== s && o.startsWith(s.slice(0, n)))) n++;
      return n;
    }
    const short = (r, id) => id.slice(0, prefixLen(Object.keys(r.changes), id));

    function rand(r) {
      let t = (r.rng = (r.rng + 0x6d2b79f5) | 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function newId(r) {
      let id;
      do {
        id = '';
        for (let i = 0; i < 8; i++) id += LETTERS[Math.floor(rand(r) * 16)];
      } while (r.changes[id]);
      return id;
    }
    // コミット ID は、change ID・親のコミット ID・中身・説明・時刻から作る
    function stamp(r, c) {
      const p = c.parent && r.changes[c.parent] ? r.changes[c.parent].commit : '';
      c.commit = hex(JSON.stringify([c.id, p, treeKey(c.tree), c.desc, r.time]), 12);
      if (c.evo[c.evo.length - 1] !== c.commit) c.evo.push(c.commit);
    }
    const children = (r, id) => Object.values(r.changes).filter((c) => c.parent === id).sort((a, b) => a.born - b.born);
    const isEmpty = (r, c) => !!c.parent && !!r.changes[c.parent] && treeKey(c.tree) === treeKey(r.changes[c.parent].tree);
    function isAncestor(r, a, b) {
      for (let c = r.changes[b]; c; c = r.changes[c.parent]) if (c.id === a) return true;
      return false;
    }
    function make(r, parent, tree) {
      const c = { id: newId(r), parent, tree: JSON.parse(JSON.stringify(tree)), desc: '', commit: '', evo: [], immutable: false, born: r.born++ };
      r.changes[c.id] = c;
      stamp(r, c);
      return c;
    }
    function initRepo() {
      const r = { changes: {}, wc: '', main: '', time: 1, rng: 20261120, born: 0 };
      const base = {};
      for (const k of FILES) base[k] = BASE[k].map(one);
      const m = make(r, null, base);
      m.desc = '値段の計算を作る';
      m.immutable = true;
      m.evo = [];
      stamp(r, m);
      r.main = m.id;
      r.wc = make(r, m.id, m.tree).id;
      return r;
    }

    // 変更 id の中身を tree にし、上に重なった変更を自動で付け替える（skip の子は中身を変えずにつなぎ直すだけ）
    function rewrite(r, id, tree, desc, skip = []) {
      const x = { rebased: [], conflicted: [], fixed: [] };
      const c = r.changes[id], old = c.tree;
      c.tree = tree;
      if (desc != null) c.desc = desc;
      stamp(r, c);
      for (const k of children(r, id)) follow(r, k, tree, skip.includes(k.id) ? tree : old, x);
      return x;
    }
    function follow(r, ch, nb, ob, x) {
      const old = ch.tree, was = conflicts(old) > 0;
      ch.tree = rebaseTree(old, nb, ob);
      stamp(r, ch);
      x.rebased.push(ch.id);
      const now = conflicts(ch.tree) > 0;
      if (now && !was) x.conflicted.push(ch.id);
      if (!now && was) x.fixed.push(ch.id);
      for (const k of children(r, ch.id)) follow(r, k, ch.tree, old, x);
    }

    function fail(msg) { throw new Error(msg); }
    const get = (r, id) => r.changes[id] || fail('その変更は見つからない');
    function mutable(c) {
      if (c.immutable) fail(`${c.id} は main に入った変更なので変えられない（immutable）`);
      return c;
    }
    // 作業コピーから離れるとき、空で説明も無い変更は jj が自動で捨てる
    function leave(r, id, res) {
      const w = r.changes[id];
      if (w && !w.immutable && !w.desc && isEmpty(r, w) && !children(r, id).length) {
        delete r.changes[id];
        res.out.push(`空で説明も無い変更 ${id} は自動で捨てた`);
      }
    }
    function tell(r, x, res) {
      if (x.rebased.length) res.out.push(`上に重なった変更 ${x.rebased.length} 個を自動で付け替えた（${x.rebased.map((id) => short(r, id)).join('・')}）`);
      if (x.conflicted.length) res.out.push(`衝突した変更: ${x.conflicted.join('・')}。止まらずに、衝突をコミットの中に記録した`);
      if (x.fixed.length) res.out.push(`衝突が解けた変更: ${x.fixed.join('・')}`);
    }
    const ID8 = (s) => s.slice(0, 8);

    // コマンドの中身。res.cmd に打ったコマンド、res.out に出力を書く。断るときは fail で投げる
    const OPS = {
      snap(r, s, res) {
        const w = r.changes[r.wc];
        res.cmd = `# ${s.file} の ${s.line + 1} 行目を書き換えた（jj が作業コピーを記録する）`;
        const tree = mapTree(w.tree, (m, k, i) => (k === s.file && i === s.line ? one(String(s.text)) : m));
        if (treeKey(tree) === treeKey(w.tree)) fail('中身は変わっていない');
        const before = w.commit, was = conflicts(w.tree) > 0;
        const x = rewrite(r, w.id, tree);
        res.out.push(`@ ${w.id} のコミット ID: ${ID8(before)} → ${ID8(w.commit)}（change ID は同じまま）`);
        if (was && !conflicts(w.tree)) res.out.push('@ の衝突が解けた');
        tell(r, x, res);
      },
      describe(r, s, res) {
        const id = s.id || r.wc, c = get(r, id), text = String(s.text || '');
        res.cmd = `jj describe${id === r.wc ? '' : ' ' + short(r, id)} -m "${text}"`;
        mutable(c);
        if (c.desc === text) fail('説明は前と同じ');
        const before = c.commit;
        const x = rewrite(r, id, c.tree, text);
        res.out.push(`${id} に説明を付けた。コミット ID: ${ID8(before)} → ${ID8(c.commit)}（説明もコミットの中身）`);
        tell(r, x, res);
      },
      new(r, s, res) {
        const p = s.id || r.wc, pc = get(r, p);
        res.cmd = p === r.wc ? 'jj new' : `jj new ${short(r, p)}`;
        const old = r.wc;
        const c = make(r, p, pc.tree);
        r.wc = c.id;
        if (old !== p) leave(r, old, res);
        res.out.push(`作業コピー (@) は新しい空の変更 ${c.id}。親は ${p}${conflicts(c.tree) ? '（親の衝突も引き継ぐ）' : ''}`);
      },
      commit(r, s, res) {
        const w = r.changes[r.wc], text = String(s.text || '');
        res.cmd = `jj commit -m "${text}"`;
        rewrite(r, w.id, w.tree, text);
        const c = make(r, w.id, w.tree);
        r.wc = c.id;
        res.out.push(`${w.id} に説明「${text}」を付け、その上に新しい空の作業コピー ${c.id} を作った`);
      },
      edit(r, s, res) {
        const c = get(r, s.id);
        res.cmd = `jj edit ${short(r, s.id)}`;
        mutable(c);
        if (s.id === r.wc) fail('その変更はもう作業コピー (@) になっている');
        const old = r.wc;
        r.wc = s.id;
        leave(r, old, res);
        res.out.push(`作業コピー (@) を ${s.id} に移した。ファイルはこの変更の中身になる${conflicts(c.tree) ? '（衝突が残っている）' : ''}`);
      },
      squash(r, s, res) {
        const w = r.changes[r.wc];
        res.cmd = 'jj squash';
        const p = mutable(get(r, w.parent));
        if (isEmpty(r, w)) fail('@ に変更が無いので、親へまとめるものが無い');
        const kids = children(r, w.id), was = conflicts(p.tree) > 0;
        delete r.changes[w.id];
        for (const k of kids) k.parent = p.id;
        const x = rewrite(r, p.id, w.tree, p.desc || w.desc, kids.map((k) => k.id));
        const c = make(r, p.id, p.tree);
        r.wc = c.id;
        res.out.push(`@ の中身を親の ${p.id} へまとめた。作業コピー (@) は新しい空の変更 ${c.id}`);
        if (was && !conflicts(p.tree)) res.out.push(`${p.id} の衝突が解けた`);
        tell(r, x, res);
      },
      abandon(r, s, res) {
        const c = get(r, s.id);
        res.cmd = `jj abandon ${short(r, s.id)}`;
        mutable(c);
        const p = get(r, c.parent);
        const kids = children(r, c.id), x = { rebased: [], conflicted: [], fixed: [] };
        delete r.changes[c.id];
        for (const k of kids) { k.parent = p.id; follow(r, k, p.tree, c.tree, x); }
        res.out.push(`${c.id} を捨てた`);
        if (r.wc === c.id) {
          const n = make(r, p.id, p.tree);
          r.wc = n.id;
          res.out.push(`作業コピー (@) は新しい空の変更 ${n.id}`);
        }
        tell(r, x, res);
      },
      rebase(r, s, res) {
        const c = get(r, s.id), d = get(r, s.to);
        res.cmd = `jj rebase -s ${short(r, s.id)} -o ${short(r, s.to)}`;
        mutable(c);
        if (isAncestor(r, s.id, s.to)) fail('移す先が、移す変更そのものか、その上に重なった変更になっている');
        if (c.parent === s.to) fail('もうその上にある');
        const ob = r.changes[c.parent].tree, x = { rebased: [], conflicted: [], fixed: [] };
        c.parent = s.to;
        follow(r, c, d.tree, ob, x);
        res.out.push(`${x.rebased.length} 個の変更を ${s.to} の上へ移した`);
        tell(r, { rebased: [], conflicted: x.conflicted, fixed: x.fixed }, res);
      },
    };
    function run(r0, s) {
      const r = JSON.parse(JSON.stringify(r0));
      r.time++;
      const res = { ok: true, cmd: '', out: [] };
      try {
        OPS[s.op](r, s, res);
        res.repo = r;
      } catch (e) {
        res.ok = false;
        res.out = [e.message];
        res.repo = r0;
      }
      return res;
    }

    // 操作の記録（op log）: 操作のたびにリポジトリ全体の状態を1つ残す。undo と redo は記録の上を行き来する
    function addOp(h, r, cmd, kind) {
      const state = JSON.stringify(r);
      h.ops.push({ id: hex(state + '#' + h.ops.length, 12), cmd, kind, state });
      if (kind === 'real') {
        h.real.length = h.cur + 1;
        h.real.push(h.ops.length - 1);
        h.cur = h.real.length - 1;
      }
    }
    function session() {
      const repo = initRepo(), hist = { ops: [], real: [], cur: -1 };
      addOp(hist, repo, 'リポジトリを作る', 'real');
      return { repo, hist };
    }
    const byDesc = (r, text) => (Object.values(r.changes).find((c) => c.desc === text) || {}).id;
    function act(S, step) {
      const h = S.hist;
      if (step.op === 'undo' || step.op === 'redo') {
        const back = step.op === 'undo', res = { ok: true, cmd: 'jj ' + step.op, out: [] };
        if (back ? h.cur <= 0 : h.cur >= h.real.length - 1) {
          res.ok = false;
          res.out = [back ? 'これより前の操作は無い' : 'やり直す操作は無い'];
          return res;
        }
        const target = h.ops[h.real[back ? h.cur : h.cur + 1]];
        h.cur += back ? -1 : 1;
        const state = h.ops[h.real[h.cur]].state;
        S.repo = JSON.parse(state);
        h.ops.push({ id: hex(state + '#' + h.ops.length, 12), cmd: `${step.op}: ${target.cmd}`, kind: step.op, state });
        res.out.push(back ? `操作「${target.cmd}」を取り消した` : `操作「${target.cmd}」をやり直した`);
        return res;
      }
      if (step.op === 'restore') {
        const o = h.ops[step.i], res = { ok: true, cmd: `jj op restore ${o ? o.id : '?'}`, out: [] };
        if (!o || step.i === h.ops.length - 1) {
          res.ok = false;
          res.out = [o ? 'もうこの時点にいる' : 'その操作は無い'];
          return res;
        }
        S.repo = JSON.parse(o.state);
        addOp(h, S.repo, res.cmd, 'real');
        res.out.push(`操作「${o.cmd}」の直後の状態に戻した`);
        return res;
      }
      const s = Object.assign({}, step);
      if (s.find) s.id = byDesc(S.repo, s.find);
      if (s.findTo) s.to = byDesc(S.repo, s.findTo);
      const res = run(S.repo, s);
      if (res.ok) {
        S.repo = res.repo;
        addOp(h, S.repo, res.cmd, 'real');
      }
      return res;
    }

    // jj log の並び（上ほど新しい）と、各変更を描く列。親へ向かう線が通る列は、親に着くまでほかに使わせない
    function graphRows(r) {
      const order = [];
      const visit = (c) => {
        for (const k of children(r, c.id).reverse()) visit(k);
        order.push(c.id);
      };
      for (const c of Object.values(r.changes)) if (!c.parent || !r.changes[c.parent]) visit(c);
      const lanes = [], rows = [];
      for (const id of order) {
        let col = lanes.indexOf(id);
        if (col < 0) {
          col = lanes.indexOf(null);
          if (col < 0) col = lanes.push(null) - 1;
        }
        for (let i = 0; i < lanes.length; i++) if (i !== col && lanes[i] === id) lanes[i] = null;
        const p = r.changes[id].parent;
        lanes[col] = p && r.changes[p] ? p : null;
        rows.push({ id, col });
      }
      return rows;
    }

    // 「自動で流れを見る」の手順（記事の流れに合わせた）。find は説明で変更を探す
    const TOUR = [
      { op: 'snap', file: 'main.py', line: 1, text: '    return n * 110' },
      { op: 'describe', text: '税込みにする' },
      { op: 'new' },
      { op: 'snap', file: 'main.py', line: 1, text: '    return n * 110 + 500' },
      { op: 'commit', text: '送料を足す' },
      { op: 'new', find: '税込みにする' },
      { op: 'snap', file: 'README.md', line: 1, text: 'price(n) は n 個の税込みの値段を返す' },
      { op: 'describe', text: '使い方を書く' },
      { op: 'edit', find: '税込みにする' },
      { op: 'snap', file: 'main.py', line: 1, text: '    return round(n * 108)', show: '送料を足す' },
      { op: 'new', find: '送料を足す' },
      { op: 'snap', file: 'main.py', line: 1, text: '    return round(n * 108) + 500' },
      { op: 'squash', show: '送料を足す' },
      { op: 'undo' },
      { op: 'redo', show: '送料を足す' },
      { op: 'rebase', find: '送料を足す', findTo: '使い方を書く', show: '送料を足す' },
    ];
  },
  js() {
    const $ = (id) => document.getElementById(id);
    if (window.THUMB) document.documentElement.classList.add('thumb');
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const logEl = $('log'), filesEl = $('files'), selHd = $('selhd'), evoEl = $('evo'), msgEl = $('msg');
    const termEl = $('term'), opsEl = $('ops'), bar = $('bar'), descIn = $('desc'), destSel = $('dest'), autoSw = $('auto');
    const RH = 46, CW = 16;   // グラフの1行の高さと1列の幅（px）
    const FOLLOW = new Set(['snap', 'new', 'edit', 'commit', 'squash', 'undo', 'redo', 'restore']);
    const CAP0 = 'main（◆）の上に、空の作業コピー（@）がある。jj では、作業中のファイルもいつも1つのコミットとして記録される。「自動で流れを見る」を切ると、自分で操作できる。';
    const CAPS = [
      'main.py の2行目を書き換えた。@ のコミット ID（右の16進数）は変わったが、change ID（左の英字）は同じまま。jj には git add のような準備の場所が無い。',
      'jj describe で説明を付けた。説明もコミットの中身なので、コミット ID がまた変わる。',
      'jj new で、@ の上に新しい空の変更を作り、そこを作業コピーにした。',
      '送料を足す行に書き換えた。',
      'jj commit は「説明を付けて、その上に新しい空の変更を作る」を1回で行う。',
      'jj new で「税込みにする」の上に別の変更を作った。前の @ は空で説明も無いので、jj が自動で捨てた。',
      'README.md に使い方を書いた。',
      '説明を付けた。グラフが2本に分かれた。',
      'jj edit で、下にある「税込みにする」を作業コピーにした。この変更を直接書き換えられる。',
      '税率を 108 に直した。上に重なった2つの変更を、jj が自動で付け替えた。「送料を足す」は同じ行を書き換えていたので衝突したが、jj は止まらずに衝突をコミットの中に記録した（×）。',
      '衝突した変更の上に新しい変更を作った。親の衝突をそのまま引き継いでいる。',
      '両方の変更を合わせた行に書き換えた。この変更では衝突が解けた。',
      'jj squash で、直した分を親の「送料を足す」へまとめた。× が消えた。',
      'jj undo で、まとめる前に戻した。下の op log には、すべての操作が残っている。',
      'jj redo で、もう一度まとめた。',
      'jj rebase で「送料を足す」を「使い方を書く」の上へ移し、一本にした。その上の @ も一緒に移った。今度は衝突しない。',
    ];
    let S, sel = '', seen = new Map(), term = [], tourAt = 0, timer = 0;

    const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    // 区別できる最短の頭の文字を太字にし、残りを薄くする
    function idHtml(s, all, n) {
      const k = Math.min(prefixLen(all, s), n);
      return `<b>${esc(s.slice(0, k))}</b><span class="r">${esc(s.slice(k, n))}</span>`;
    }
    function say(text) { msgEl.textContent = text; }

    function renderLog() {
      const r = S.repo, rows = graphRows(r), at = new Map(rows.map((x, i) => [x.id, i]));
      const cols = Math.max(1, ...rows.map((x) => x.col + 1));
      const w = cols * CW + 6, h = rows.length * RH + 16;
      const X = (c) => 10 + c * CW, Y = (i) => i * RH + 13;
      let lines = '', nodes = '';
      rows.forEach((x, i) => {
        const c = r.changes[x.id], cx = X(x.col), cy = Y(i);
        if (c.parent && at.has(c.parent)) {
          const j = at.get(c.parent), px = X(rows[j].col), py = Y(j);
          lines += cx === px ? `<path d="M${cx} ${cy}V${py}"/>` : `<path d="M${cx} ${cy}V${py - RH * 0.55}Q${cx} ${py} ${px} ${py}"/>`;
        } else {
          lines += `<path d="M${cx} ${cy}v16" stroke-dasharray="2 3"/>`;   // この下にも歴史が続く
        }
        if (x.id === r.wc) nodes += `<circle cx="${cx}" cy="${cy}" r="7" class="n wc${conflicts(c.tree) ? ' cf' : ''}"/><text x="${cx}" y="${cy + 3.5}" class="at">@</text>`;
        else if (c.immutable) nodes += `<path d="M${cx} ${cy - 6}l6 6-6 6-6-6z" class="n im"/>`;
        else if (conflicts(c.tree)) nodes += `<circle cx="${cx}" cy="${cy}" r="6" class="n cf"/><path d="M${cx - 3.5} ${cy - 3.5}l7 7M${cx + 3.5} ${cy - 3.5}l-7 7" class="x"/>`;
        else nodes += `<circle cx="${cx}" cy="${cy}" r="5" class="n"/>`;
      });
      const allIds = Object.keys(r.changes), allCommits = Object.values(r.changes).map((c) => c.commit);
      let html = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${lines}${nodes}</svg>`;
      rows.forEach((x, i) => {
        const c = r.changes[x.id], tags = [];
        if (c.id === r.main) tags.push('<span class="bm">main</span>');
        if (isEmpty(r, c)) tags.push('<span class="tag">(empty)</span>');
        if (conflicts(c.tree)) tags.push('<span class="tag bad">(conflict)</span>');
        const moved = seen.has(c.id) && seen.get(c.id) !== c.commit;
        html += `<button type="button" class="row" data-id="${c.id}" aria-pressed="${c.id === sel}" style="inset-block-start:${i * RH}px;padding-inline-start:${w + 2}px">`
          + `<span class="l1"><span class="cid">${idHtml(c.id, allIds, 8)}</span> <span class="cmt${moved ? ' flash' : ''}">${idHtml(c.commit, allCommits, 8)}</span> ${tags.join(' ')}</span>`
          + `<span class="l2">${c.id === r.wc ? '@ ' : ''}${c.desc ? esc(c.desc) : '(説明なし)'}</span></button>`;
      });
      logEl.style.blockSize = h + 'px';
      logEl.innerHTML = html;   // 中身は、このコードで作った ID と、esc を通した説明だけ
      seen = new Map(Object.values(r.changes).map((c) => [c.id, c.commit]));
    }

    // jj と同じ形の衝突の印（親の変化を差分で、この変更の中身をそのまま見せる）
    function markers(m) {
      const L = ['<<<<<<< 衝突'];
      m.removes.forEach((rm, i) => {
        L.push(`%%%%%%% 親の変化${m.removes.length > 1 ? ' ' + (i + 1) : ''}（前 → 後）`, '-' + rm, '+' + m.adds[i + 1]);
      });
      L.push('+++++++ この変更の中身', ' ' + m.adds[0], '>>>>>>> 衝突ここまで');
      return L.join('\n');
    }
    function renderFiles() {
      const r = S.repo, c = r.changes[sel], p = c.parent ? r.changes[c.parent] : null, isWc = sel === r.wc;
      selHd.innerHTML = `${isWc ? '@ 作業コピー' : '変更'} <span class="cid">${esc(c.id)}</span> <span class="mut">コミット</span> <span class="cmt">${esc(c.commit.slice(0, 8))}</span>${p ? ` <span class="mut">親</span> <span class="cid">${esc(p.id)}</span>` : ''}`;
      const evo = c.evo.slice(-5).map((x) => x.slice(0, 8));
      evoEl.textContent = `この変更のコミット ID の移り変わり（jj evolog）: ${c.evo.length > 5 ? '… → ' : ''}${evo.join(' → ')}。change ID は ${c.id} のまま。`;
      filesEl.replaceChildren();
      for (const f of FILES) {
        const box = document.createElement('div');
        box.className = 'file';
        const hd = document.createElement('div');
        hd.className = 'fname';
        hd.textContent = f + (isWc ? '（行を書き換えて Enter で記録）' : p ? '（色の付いた行が、親から変えた行）' : '');
        box.append(hd);
        c.tree[f].forEach((m, i) => {
          const ok = resolved(m), changed = !!p && lineKey(m) !== lineKey(p.tree[f][i]);
          const row = document.createElement('div');
          row.className = 'ln' + (changed ? ' chg' : '') + (ok ? '' : ' cf');
          const no = document.createElement('span');
          no.className = 'no';
          no.textContent = String(i + 1);
          const body = document.createElement('div');
          body.className = 'lb';
          if (!ok) {
            const pre = document.createElement('pre');
            pre.className = 'mk';
            pre.textContent = markers(m);
            body.append(pre);
          }
          if (isWc) {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'lv';
            inp.spellcheck = false;
            inp.autocomplete = 'off';
            inp.dataset.f = f;
            inp.dataset.i = String(i);
            inp.value = m.adds[0];
            inp.setAttribute('aria-label', `${f} の ${i + 1} 行目${ok ? '' : '（衝突を直した行を書いて Enter）'}`);
            body.append(inp);
          } else if (ok) {
            const code = document.createElement('code');
            code.textContent = m.adds[0];
            body.append(code);
          }
          row.append(no, body);
          box.append(row);
        });
        filesEl.append(box);
      }
    }

    function renderBar() {
      const r = S.repo, p = short(r, sel), isWc = sel === r.wc, h = S.hist;
      bar.querySelector('[data-op="new"]').textContent = isWc ? 'jj new' : `jj new ${p}`;
      bar.querySelector('[data-op="edit"]').textContent = `jj edit ${p}`;
      bar.querySelector('[data-op="abandon"]').textContent = `jj abandon ${p}`;
      bar.querySelector('[data-op="undo"]').setAttribute('aria-disabled', String(h.cur <= 0));
      bar.querySelector('[data-op="redo"]').setAttribute('aria-disabled', String(h.cur >= h.real.length - 1));
      $('bDesc').textContent = isWc ? 'jj describe -m' : `jj describe ${p} -m`;
      $('bReb').textContent = `jj rebase -s ${p} -o`;
      if (document.activeElement !== descIn) descIn.value = r.changes[sel].desc;
      const keep = destSel.value;
      destSel.replaceChildren();
      for (const c of Object.values(r.changes).sort((a, b) => a.born - b.born)) {
        if (isAncestor(r, sel, c.id)) continue;   // 自分と、自分の上に重なった変更へは移せない
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = `${short(r, c.id)} ${c.desc || (c.id === r.wc ? '@' : '(説明なし)')}`;
        destSel.append(o);
      }
      if ([...destSel.options].some((o) => o.value === keep)) destSel.value = keep;
    }

    function renderTerm() {
      termEl.replaceChildren();
      for (const t of term) {
        const a = document.createElement('span');
        a.className = 'cmd';
        a.textContent = (t.cmd.startsWith('#') ? '' : '$ ') + t.cmd + '\n';
        termEl.append(a);
        for (const o of t.out) {
          const b = document.createElement('span');
          b.className = t.ok ? 'o' : 'err';
          b.textContent = (t.ok ? '' : 'Error: ') + o + '\n';
          termEl.append(b);
        }
      }
      termEl.scrollTop = termEl.scrollHeight;
    }
    function renderOps() {
      opsEl.replaceChildren();
      const ops = S.hist.ops, last = ops.length - 1;
      for (let i = last; i >= Math.max(0, last - 40); i--) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.i = String(i);
        if (i === last) b.setAttribute('aria-current', 'true');
        const id = document.createElement('span');
        id.className = 'opid';
        id.textContent = (i === last ? '@ ' : '○ ') + ops[i].id;
        b.append(id, ' ' + ops[i].cmd);
        li.append(b);
        opsEl.append(li);
      }
    }
    function render() {
      renderLog();
      renderFiles();
      renderBar();
      renderTerm();
      renderOps();
    }

    function doStep(step) {
      const res = act(S, step);
      term.push({ ok: res.ok, cmd: res.cmd, out: res.out });
      if (term.length > 30) term.shift();
      const shown = res.ok && step.show && byDesc(S.repo, step.show);
      if (shown) sel = shown;
      else if (res.ok && FOLLOW.has(step.op)) sel = S.repo.wc;
      if (!S.repo.changes[sel]) sel = S.repo.wc;
      say(res.ok ? res.out.join('。') + '。' : `Error: ${res.out[0]}。`);
      render();
      return res;
    }
    function start() {
      S = session();
      sel = S.repo.wc;
      seen = new Map();
      term = [{ ok: true, cmd: 'jj git init', out: ['main の上に、空の作業コピー (@) を作った'] }];
      tourAt = 0;
      render();
      say(CAP0);
    }

    // 自動で流れを見る: 手順を1つずつ進め、終わったら少し待って最初から
    function tourStep() {
      if (tourAt >= TOUR.length + 2) { start(); return; }
      if (tourAt < TOUR.length) {
        const res = doStep(TOUR[tourAt]);
        if (res.ok) say(CAPS[tourAt]);
      }
      tourAt++;
    }
    function loop() {
      timer = setTimeout(() => { tourStep(); loop(); }, window.THUMB ? 900 : 2800);
    }
    function setAuto(on) {
      autoSw.checked = on;
      clearTimeout(timer);
      if (on) loop();
    }
    function stopTour() { if (autoSw.checked) setAuto(false); }

    // @ の行を書き換えて記録する（本物の jj は、次のコマンドを動かしたときに記録する）
    function snapFrom(inp, refocus) {
      const f = inp.dataset.f, i = Number(inp.dataset.i);
      const m = S.repo.changes[S.repo.wc].tree[f][i];
      if (resolved(m) && m.adds[0] === inp.value) return;
      stopTour();
      doStep({ op: 'snap', file: f, line: i, text: inp.value });
      if (refocus) {
        const again = filesEl.querySelector(`input[data-f="${f}"][data-i="${i}"]`);
        if (again) again.focus();
      }
    }
    filesEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches('input.lv')) return;
      e.preventDefault();
      if (e.isComposing || e.keyCode === 229) return;   // 日本語の変換を確定する Enter では記録しない
      snapFrom(e.target, true);
    });
    filesEl.addEventListener('change', (e) => {
      if (e.target.matches('input.lv') && e.target.isConnected) snapFrom(e.target, false);
    });
    logEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      stopTour();
      sel = b.dataset.id;
      render();
      const again = logEl.querySelector(`button[data-id="${sel}"]`);
      if (again) again.focus();
    });
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-op]');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      stopTour();
      const op = b.dataset.op;
      if (op === 'new') doStep(sel === S.repo.wc ? { op } : { op, id: sel });
      else if (op === 'edit' || op === 'abandon') doStep({ op, id: sel });
      else doStep({ op });
    });
    $('fDesc').addEventListener('submit', (e) => {
      e.preventDefault();
      stopTour();
      doStep({ op: 'describe', id: sel, text: descIn.value.trim() });
    });
    $('fReb').addEventListener('submit', (e) => {
      e.preventDefault();
      stopTour();
      doStep({ op: 'rebase', id: sel, to: destSel.value });
    });
    opsEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      stopTour();
      doStep({ op: 'restore', i: Number(b.dataset.i) });
    });
    autoSw.addEventListener('change', () => {
      if (autoSw.checked) start();
      setAuto(autoSw.checked);
    });
    $('bReset').addEventListener('click', () => start());

    // ツールバーは Tab で1回だけ止まり、矢印キーでボタンを移る。focusgroup が無いブラウザでは同じ動きを自分で作る
    if (!('focusGroup' in HTMLElement.prototype)) {
      const items = [...bar.querySelectorAll('button')];
      items.forEach((b, i) => { b.tabIndex = i ? -1 : 0; });
      bar.addEventListener('focusin', (e) => {
        if (items.includes(e.target)) items.forEach((b) => { b.tabIndex = b === e.target ? 0 : -1; });
      });
      bar.addEventListener('keydown', (e) => {
        const i = items.indexOf(document.activeElement);
        if (i < 0) return;
        const rtl = getComputedStyle(bar).direction === 'rtl';
        let j = null;
        if (e.key === 'ArrowRight') j = i + (rtl ? -1 : 1);
        else if (e.key === 'ArrowLeft') j = i + (rtl ? 1 : -1);
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = items.length - 1;
        if (j === null) return;
        e.preventDefault();
        items[(j + items.length) % items.length].focus();
      });
    }

    start();
    setAuto(!!window.THUMB || !calm.matches);
  },
});

dekiru.add({
  id: 'tr-20261121-grh-zeros', c: 'trend', lv: 3, date: '2026-11-21',
  t: '一般化リーマン予想の零点を、ブラウザで探して数える（ディリクレの L 関数）',
  y: 'いっぱんかりーまんよそうのれいてんをぶらうざでさがしてかぞえる',
  tags: ['一般化リーマン予想', 'ディリクレの L 関数', 'オイラー・マクローリンの和公式', '明示公式', 'Canvas'],
  d: '2026年11月20日、一般化リーマン予想（GRH）を証明したという発表が2つ続いた。Anthropic の数学者 Levent Alpöge さんは、Claude と一緒に作ったという Lean の証明を公開した。Scott Aaronson さんのブログによると、その長さは約1740万行である。Hacker News では 2100 点を超え、コメントは 1400 件を超えた。同じ日に、Stanford の Ravi Vakil さんが、Alessandro Masullo さんの証明の原稿を公開した。こちらは AI を使っていない人の手による証明で、Brian Conrad さんが数か月かけて確かめている。どちらも、専門家の確認はまだ終わっていない。GRH は「ディリクレの L 関数の、自明でない零点は、すべて実部が 1/2 の直線（臨界線）の上にある」という予想である。この見本は、リーマンのゼータ関数と、法 3・4・5・7・11・13 の実数の値をとる指標の L 関数を、一から計算する。臨界線の上で実数になる Z(t) の符号が変わる所から、零点を探して数える。偏角の原理で求めた「臨界帯の中にある零点の数」と比べ、同じなら、その高さまでの零点はすべて臨界線の上にある。上の色の図では、すべての色が集まる点が零点で、それが σ = 1/2 の線の上に並ぶ。後半は、見つけた零点を波として足し合わせ、素数の階段 ψ(x, χ) を組み立てる（明示公式）。浮動小数点の数値計算なので、厳密な証明ではない。複素数の値をとる指標、t が 100 より上の零点、発表された証明の中身は扱っていない。',
  p: 'L(s, χ) = q^(−s) Σ χ(a) ζ(s, a/q) と書き直し、フルヴィッツのゼータ ζ(s, a) をオイラー・マクローリンの和公式で計算する。最初の N 項の和に、積分の項とベルヌーイ数の補正 10 項を足すと、級数が収束しない σ ≦ 1 の所でも値が出る。関数等式から、θ(t) = arg Γ((1/2 + κ + it)/2) + (t/2) log(q/π) を使った Z(t) = e^(iθ(t)) L(1/2 + it, χ) は実数になる（κ は χ(−1) = −1 なら 1、それ以外は 0）。Z(t) の符号が変わる所に零点があり、はさみうち法で 10 桁まで詰める。帯の中の零点の数は N(T) = (θ(T) + arg L(1/2 + iT)) / π（ζ では + 1）で、arg は 2 + iT から 1/2 + iT へ少しずつたどって求める。明示公式 ψ(x, χ) = −Σ x^ρ/ρ + 定数 + 自明な零点の項 では、零点 ρ = 1/2 + iγ の1つ1つが、大きさ 2√x/|ρ| で、log x について周期 2π/γ の波になる。零点が臨界線より右にあると、その波は √x より速く大きくなる。GRH が素数の数え方の誤差を決めるのは、このためである。',
  refs: [
    { title: 'Hacker News: Levent Alpöge claims proof of the Generalized Riemann Hypothesis', url: 'https://news.ycombinator.com/item?id=50574968' },
    { title: 'Levent Alpöge の覚え書き（remark.pdf、Lean の証明へのリンク付き）', url: 'https://alpo.ge/remark.pdf' },
    { title: 'Hurried Announcement: Alessandro Masullo GRH（Ravi Vakil）', url: 'https://math216.wordpress.com/2026/11/20/hurried-announcement-alessandro-masullo-grh/' },
    { title: 'Unforced Euler singularity, unforced Navier-Stokes singularity, and the Generalized Riemann Hypothesis（Terence Tao）', url: 'https://terrytao.wordpress.com/2026/11/20/unforced-euler-singularity-unforced-navier-stokes-singularity-and-the-generalized-riemann-hypothesis/' },
    { title: 'The stochastic parrots have apparently proved the Riemann Hypothesis（Scott Aaronson）', url: 'https://scottaaronson.blog/?p=10344' },
  ],
  html: `<div class="wrap">
  <div class="ctl">
    <label>関数
      <select id="fn">
        <option value="1">ζ(s)　リーマンのゼータ関数</option>
        <option value="3">L(s, χ)　法 3</option>
        <option value="4" selected>L(s, χ)　法 4</option>
        <option value="5">L(s, χ)　法 5</option>
        <option value="7">L(s, χ)　法 7</option>
        <option value="11">L(s, χ)　法 11</option>
        <option value="13">L(s, χ)　法 13</option>
      </select>
    </label>
    <label>調べる高さ T
      <input type="range" id="T" min="20" max="100" step="10" value="50">
      <output id="Tv" for="T">50</output>
    </label>
  </div>
  <p id="chi" class="mut small"></p>
  <section>
    <div class="hd">臨界帯 <span class="mut">横が t（0〜T）、縦が σ。色は L(σ + it) の向き（偏角）で、すべての色が集まる点が零点</span></div>
    <canvas id="strip" role="img" aria-label="臨界帯の色の図"></canvas>
    <div class="hd">σ = 1/2 での Z(t) <span class="mut">0 を横切る所が零点（桃色の点）</span></div>
    <canvas id="zt" role="img" aria-label="Z(t) のグラフ"></canvas>
  </section>
  <div class="res">
    <dl id="st" class="st"></dl>
    <p id="msg" class="msg" role="status"></p>
  </div>
  <section class="part2">
    <div class="hd">零点の波で素数の階段を組み立てる <span class="mut">明示公式 ψ(x, χ) = −Σ x^ρ/ρ + 定数 + …</span></div>
    <div class="ctl">
      <label>使う零点 <input type="range" id="K" min="0" max="0" value="0"> <output id="Kv" for="K">0</output> 組</label>
      <label>x の範囲
        <select id="X">
          <option value="30">2〜30</option>
          <option value="60" selected>2〜60</option>
          <option value="100">2〜100</option>
        </select>
      </label>
      <label class="sw"><input type="checkbox" switch id="auto"> 零点を1組ずつ足していく</label>
    </div>
    <canvas id="psi" role="img" aria-label="素数の階段と、零点の波の和のグラフ"></canvas>
    <p class="legend mut small"><span><i class="s"></i>素数の階段 ψ(x, χ) = Σ χ(n) Λ(n)</span><span><i class="w"></i>零点 1/2 ± iγ の波の和</span></p>
    <p id="race" class="small"></p>
  </section>
</div>`,
  css: `:root { color-scheme: dark; --bg: #10131a; --fg: #e4e8f0; --mut: #9aa3b6; --line: #2b3346; --zline: #7fd4ff; --dot: #ff8fb3; --step: #ffc562; --wave: #7fd4ff; --panel: #161a23; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, sans-serif; }
    .wrap { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .ctl { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; }
    .ctl label { display: inline-flex; align-items: center; gap: 6px; }
    select { font: inherit; min-block-size: 28px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 6px; background: #1e2433; color: var(--fg); }
    input[type="range"] { accent-color: var(--zline); inline-size: 140px; margin: 0; }
    output { display: inline-block; min-inline-size: 2em; font-variant-numeric: tabular-nums; }
    :focus-visible { outline: 2px solid #ffd27a; outline-offset: 2px; }
    .hd { font-weight: 600; }
    .hd .mut { font-weight: 400; font-size: 12px; }
    .mut { color: var(--mut); }
    .small { font-size: 12px; margin: 0; }
    section { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    canvas { display: block; inline-size: 100%; }
    #strip { block-size: 110px; }
    #zt { block-size: 140px; }
    #psi { block-size: 200px; }
    .res { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
    @media (min-width: 640px) { .res { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    .st { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; margin: 0; font-size: 13px; }
    .st dt { color: var(--mut); }
    .st dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .msg { margin: 0; padding: 6px 8px; border-inline-start: 3px solid var(--dot); background: var(--panel); border-radius: 4px; font-size: 13px; }
    .part2 { border-block-start: 1px solid var(--line); padding-block-start: 8px; gap: 6px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; }
    .legend i { display: inline-block; inline-size: 16px; block-size: 3px; vertical-align: middle; margin-inline-end: 6px; border-radius: 2px; }
    .legend .s { background: var(--step); }
    .legend .w { background: var(--wave); }
    input[type="checkbox"][switch] { accent-color: var(--dot); margin: 0; cursor: pointer; }
    .thumb .wrap { padding: 6px; gap: 4px; }
    .thumb .ctl, .thumb #chi, .thumb .res, .thumb .legend, .thumb #race, .thumb .hd { display: none; }
    .thumb #strip { block-size: 24vh; }
    .thumb #zt { block-size: 21vh; }
    .thumb #psi { block-size: 44vh; }
    .thumb .part2 { padding-block-start: 4px; }`,
  core() {
    // ディリクレの L 関数を、オイラー・マクローリンの和公式で一から計算する。複素数は [実部, 虚部] の配列で表す
    const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
    const clog = (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
    // 正の実数 x について x^(−s)
    function powNeg(x, s) {
      const L = Math.log(x), r = Math.exp(-s[0] * L);
      return [r * Math.cos(s[1] * L), -r * Math.sin(s[1] * L)];
    }

    const MODS = [1, 3, 4, 5, 7, 11, 13];
    // B2, B4, …, B20 と (2k)!
    const BERN = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66, -691 / 2730, 7 / 6, -3617 / 510, 43867 / 798, -174611 / 330];
    const FACT2K = [2, 24, 720, 40320, 3628800, 479001600, 87178291200, 20922789888000, 6402373705728000, 2432902008176640000];

    function powMod(b, e, m) {
      let r = 1;
      b %= m;
      while (e > 0) { if (e & 1) r = (r * b) % m; b = (b * b) % m; e >>= 1; }
      return r;
    }

    // 法 q の、実数の値をとる原始的な指標 χ。q = 1 はリーマンのゼータ関数（どの n でも 1）
    function makeFn(q) {
      let chi;
      if (q === 1) chi = [1];
      else if (q === 4) chi = [0, 1, 0, -1];
      else if (q > 2 && MODS.includes(q)) {
        chi = new Array(q).fill(0);
        for (let a = 1; a < q; a++) chi[a] = powMod(a, (q - 1) / 2, q) === 1 ? 1 : -1;   // ルジャンドル記号
      } else throw new Error('この法には対応していません: ' + q);
      const kappa = chi[q - 1] === -1 ? 1 : 0;   // χ(−1) = −1 なら奇の指標
      return { q, chi, kappa };
    }
    const chiOf = (f, n) => f.chi[n % f.q];

    // 足す項の数。|s + 2k| / (2π(N + a)) が 1/2 以下になるように選ぶ
    const nTerms = (s) => Math.max(6, Math.ceil((Math.hypot(s[0], s[1]) + 20) / Math.PI));

    // フルヴィッツのゼータ ζ(s, a) = Σ (n + a)^(−s) を、N 項の和 + 積分の項 + ベルヌーイ数の補正 10 項で求める
    function hurwitz(s, a, N) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) { const p = powNeg(n + a, s); re += p[0]; im += p[1]; }
      const x = N + a, xs = powNeg(x, s);
      const integral = cdiv([x * xs[0], x * xs[1]], [s[0] - 1, s[1]]);
      re += integral[0] + xs[0] / 2; im += integral[1] + xs[1] / 2;
      let rise = [s[0], s[1]];           // s(s+1)…(s+2k−2)
      let pw = [xs[0] / x, xs[1] / x];   // x^(−s−2k+1)
      for (let k = 1; k <= 10; k++) {
        const c = BERN[k - 1] / FACT2K[k - 1], term = cmul(rise, pw);
        re += c * term[0]; im += c * term[1];
        rise = cmul(cmul(rise, [s[0] + 2 * k - 1, s[1]]), [s[0] + 2 * k, s[1]]);
        pw = [pw[0] / (x * x), pw[1] / (x * x)];
      }
      return [re, im];
    }

    // L(s, χ) = q^(−s) Σ χ(a) ζ(s, a/q)
    function lfun(s, f) {
      const N = nTerms(s);
      if (f.q === 1) return hurwitz(s, 1, N);
      let re = 0, im = 0;
      for (let a = 1; a < f.q; a++) {
        if (!f.chi[a]) continue;
        const h = hurwitz(s, a / f.q, N);
        re += f.chi[a] * h[0]; im += f.chi[a] * h[1];
      }
      return cmul([re, im], powNeg(f.q, s));
    }

    // log Γ(z)（実部が正の z）。10 以上へずらしてスターリングの級数を使うので、虚部は t についてつながる
    function lgamma(z) {
      let re = z[0], sr = 0, si = 0;
      const im = z[1];
      while (re < 10) { const l = clog([re, im]); sr += l[0]; si += l[1]; re += 1; }
      const w = [re, im], r = cmul([re - 0.5, im], clog(w));
      r[0] += -re + 0.5 * Math.log(2 * Math.PI); r[1] -= im;
      const inv = cdiv([1, 0], w), inv2 = cmul(inv, inv);
      let p = inv;
      for (let k = 1; k <= 7; k++) {
        const c = BERN[k - 1] / (2 * k * (2 * k - 1));
        r[0] += c * p[0]; r[1] += c * p[1];
        p = cmul(p, inv2);
      }
      return [r[0] - sr, r[1] - si];
    }

    // θ(t) = arg Γ((1/2 + κ + it)/2) + (t/2) log(q/π)
    const theta = (t, f) => lgamma([(0.5 + f.kappa) / 2, t / 2])[1] + (t / 2) * Math.log(f.q / Math.PI);

    // Z(t) = e^(iθ(t)) L(1/2 + it, χ) は関数等式から実数になる。2つ目の値は計算で残った虚部（誤差の目安）
    function hardyZ(t, f) {
      const L = lfun([0.5, t], f), th = theta(t, f), c = Math.cos(th), sn = Math.sin(th);
      return [L[0] * c - L[1] * sn, L[0] * sn + L[1] * c];
    }

    // 符号が変わる区間 [a, b] の中の零点を、はさみうち法（イリノイ法）で詰める
    function refineZero(f, a, b, za, zb) {
      if (za === undefined) za = hardyZ(a, f)[0];
      if (zb === undefined) zb = hardyZ(b, f)[0];
      if (za * zb > 0) throw new Error('符号が変わっていません');
      // 直線で結んで 0 になる点 m へ b を動かす。動かなかった側の値は半分にして、片側だけが動き続けるのを防ぐ
      for (let i = 0; i < 100 && Math.abs(b - a) > 1e-12; i++) {
        let m = b - zb * (b - a) / (zb - za);
        if (!(m > Math.min(a, b) && m < Math.max(a, b))) m = (a + b) / 2;
        const zm = hardyZ(m, f)[0];
        if (zm === 0) return m;
        if (zm * zb < 0) { a = b; za = zb; } else za /= 2;
        b = m; zb = zm;
      }
      return b;
    }

    // 偏角の原理で、臨界帯の 0 < Im s < T にある零点の数を求める（N(T) = (θ(T) + arg L(1/2 + iT)) / π、ζ では + 1）
    // arg L は 2 + iT（実部が正なので主値でよい）から 1/2 + iT まで、向きの変わり方が小さくなる刻みでたどる
    function countZeros(f, T) {
      let sig = 2, v = lfun([sig, T], f), arg = Math.atan2(v[1], v[0]), h = 0.05;
      while (sig > 0.5) {
        const next = Math.max(0.5, sig - h), w = lfun([next, T], f);
        let d = Math.atan2(w[1], w[0]) - Math.atan2(v[1], v[0]);
        d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
        if (Math.abs(d) > 0.3 && h > 1e-5) { h /= 2; continue; }
        arg += d; v = w; sig = next;
        if (Math.abs(d) < 0.1) h = Math.min(0.05, h * 1.5);
      }
      return (theta(T, f) + arg) / Math.PI + (f.q === 1 ? 1 : 0);
    }

    // フォン・マンゴルトの関数 Λ(n)（n が素数 p の累乗なら log p、それ以外は 0）を n ≤ M まで並べる
    function mangoldt(M) {
      const lam = new Float64Array(M + 1), comp = new Uint8Array(M + 1);
      for (let p = 2; p <= M; p++) {
        if (comp[p]) continue;
        for (let m = p * p; m <= M; m += p) comp[m] = 1;
        for (let pk = p; pk <= M; pk *= p) lam[pk] = Math.log(p);
      }
      return lam;
    }

    // 明示公式の定数の項。ζ は log 2π、奇の指標は L'/L(0, χ)、偶の指標は L'/L(s, χ) − 1/s の s → 0 の値
    function constTerm(f) {
      if (f.q === 1) return Math.log(2 * Math.PI);
      const h = 0.01, L = (x) => lfun([x, 0], f)[0];
      const p2 = L(2 * h), p1 = L(h), z0 = L(0), m1 = L(-h), m2 = L(-2 * h);
      const d1 = (-p2 + 8 * p1 - 8 * m1 + m2) / (12 * h);
      if (f.kappa === 1) return d1 / z0;
      const d2 = (-p2 + 16 * p1 - 30 * z0 + 16 * m1 - m2) / (12 * h * h);
      return d2 / (2 * d1);
    }

    // ψ(x, χ) = Σ_{n ≤ x} χ(n) Λ(n)（素数の階段）
    function psiStep(x, f, lam) {
      let s = 0;
      for (let n = 2; n <= x && n < lam.length; n++) if (lam[n]) s += chiOf(f, n) * lam[n];
      return s;
    }

    // 明示公式で、零点 1/2 ± iγ（γ は gammas の先頭 K 個）から ψ(x, χ) を組み立てる
    function psiWave(x, f, gammas, K, c0) {
      const lx = Math.log(x), sx = Math.sqrt(x);
      let wave = 0;
      for (let k = 0; k < K && k < gammas.length; k++) {
        const g = gammas[k];
        wave += 2 * sx * (0.5 * Math.cos(g * lx) + g * Math.sin(g * lx)) / (0.25 + g * g);   // 2 Re(x^ρ / ρ)
      }
      if (f.q === 1) return x - wave - c0 - 0.5 * Math.log(1 - 1 / (x * x));
      if (f.kappa === 1) return -wave - c0 + 0.5 * Math.log((x + 1) / (x - 1));
      return -wave - lx - c0 - 0.5 * Math.log(1 - 1 / (x * x));
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    if (window.THUMB) document.documentElement.classList.add('thumb');
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const fnSel = $('fn'), tIn = $('T'), tOut = $('Tv'), kIn = $('K'), kOut = $('Kv'), xSel = $('X'), autoSw = $('auto');
    const stripCv = $('strip'), ztCv = $('zt'), psiCv = $('psi');
    const stEl = $('st'), msgEl = $('msg'), chiEl = $('chi'), raceEl = $('race');
    const PAD_L = 34, PAD_R = 10, SIG_HI = 1.25, SIG_LO = -0.25;
    const lam = mangoldt(1000);
    const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
    const COL = { mut: cssVar('--mut'), line: cssVar('--line'), z: cssVar('--zline'), dot: cssVar('--dot'), step: cssVar('--step'), wave: cssVar('--wave') };
    const FONT = '11px system-ui, sans-serif';
    // 長い計算の途中で、ときどきブラウザへ順番を返す（scheduler.yield が無いブラウザでは setTimeout）
    const pause = () => (globalThis.scheduler && typeof scheduler.yield === 'function') ? scheduler.yield() : new Promise((r) => setTimeout(r, 0));
    let run = 0, cur = null, autoTimer = 0, autoK = 0;

    function say(text) { msgEl.textContent = text; }

    // canvas の大きさを表示の大きさに合わせる。幅や高さが 0 のときも 1 にする
    function fit(cv) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      if (cv.width !== W) cv.width = W;
      if (cv.height !== H) cv.height = H;
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      return { g, w, h };
    }

    // 色相（0〜1）・彩度・明るさから RGB（0〜255）を作る
    function hsl(hu, sa, li) {
      const a = sa * Math.min(li, 1 - li);
      const ch = (n) => { const k = (n + hu * 12) % 12; return 255 * (li - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
      return [ch(0), ch(8), ch(4)];
    }
    // L の値の向きを色相に、大きさを明るさにする。0 に近いほど暗い
    function phaseColor(re, im) {
      const mag = Math.hypot(re, im);
      return hsl(Math.atan2(im, re) / (2 * Math.PI) + 0.5, 0.85, 0.1 + 0.55 * (1 - 1 / (1 + Math.pow(mag, 0.6))));
    }

    function drawStrip() {
      const { g, w, h } = fit(stripCv);
      if (!cur) return;
      const T = cur.T, pw = Math.max(1, w - PAD_L - PAD_R), y0 = 4, ph = Math.max(1, h - 8);
      const sy = (s) => y0 + (SIG_HI - s) / (SIG_HI - SIG_LO) * ph;
      g.fillStyle = '#0a0c11';
      g.fillRect(PAD_L, y0, pw, ph);
      if (cur.filled > 0) {
        cur.offCtx.putImageData(cur.img, 0, 0);
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(cur.off, 0, 0, cur.filled, cur.rows, PAD_L, y0, pw * cur.filled / cur.cols, ph);
      }
      // 臨界帯の端（σ = 0 と 1）と、臨界線（σ = 1/2）
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      for (const s of [0, 1]) { g.beginPath(); g.moveTo(PAD_L, sy(s)); g.lineTo(PAD_L + pw, sy(s)); g.stroke(); }
      g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(PAD_L, sy(0.5)); g.lineTo(PAD_L + pw, sy(0.5)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = COL.mut; g.font = FONT; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText('1', PAD_L - 5, sy(1)); g.fillText('σ=½', PAD_L - 3, sy(0.5)); g.fillText('0', PAD_L - 5, sy(0));
      g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      for (const z of cur.zeros) {
        if (z > T) continue;
        g.beginPath(); g.arc(PAD_L + z / T * pw, sy(0.5), 3.2, 0, 2 * Math.PI); g.stroke();
      }
    }

    function drawZ() {
      const { g, w, h } = fit(ztCv);
      if (!cur) return;
      const T = cur.T, pw = Math.max(1, w - PAD_L - PAD_R), y0 = 6, ph = Math.max(1, h - 24);
      let zmax = 1;
      for (const p of cur.samples) if (p[0] <= T) zmax = Math.max(zmax, Math.abs(p[1]));
      const lim = zmax * 1.08;
      const X = (t) => PAD_L + t / T * pw, Y = (z) => y0 + ph / 2 - z / lim * ph / 2;
      g.strokeStyle = COL.line; g.lineWidth = 1;
      g.beginPath(); g.moveTo(PAD_L, Y(0)); g.lineTo(PAD_L + pw, Y(0)); g.stroke();
      g.fillStyle = COL.mut; g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'top';
      const tick = T <= 30 ? 5 : 10;
      for (let t = 0; t <= T + 1e-9; t += tick) {
        g.beginPath(); g.moveTo(X(t), y0 + ph); g.lineTo(X(t), y0 + ph + 3); g.stroke();
        g.fillText(t === 0 ? 't = 0' : String(t), X(t) + (t === 0 ? 10 : 0), y0 + ph + 5);
      }
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText('0', PAD_L - 5, Y(0));
      g.fillText('+' + zmax.toFixed(1), PAD_L - 3, Y(zmax));
      g.fillText('−' + zmax.toFixed(1), PAD_L - 3, Y(-zmax));
      g.strokeStyle = COL.z; g.lineWidth = 1.5;
      g.beginPath();
      let first = true;
      for (const p of cur.samples) {
        if (p[0] > T) break;
        if (first) { g.moveTo(X(p[0]), Y(p[1])); first = false; } else g.lineTo(X(p[0]), Y(p[1]));
      }
      g.stroke();
      g.fillStyle = COL.dot;
      for (const z of cur.zeros) {
        if (z > T) continue;
        g.beginPath(); g.arc(X(z), Y(0), 3, 0, 2 * Math.PI); g.fill();
      }
    }

    function drawPsi() {
      const { g, w, h } = fit(psiCv);
      kOut.textContent = kIn.value;
      if (!cur || cur.c0 === null) {
        g.fillStyle = COL.mut; g.font = '12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('零点を探しています…', w / 2, h / 2);
        return;
      }
      const f = cur.f, XM = +xSel.value, K = +kIn.value, gam = cur.zeros.filter((z) => z <= cur.T);
      const x0 = 2, y0 = 8, ph = Math.max(1, h - 28), pw = Math.max(1, w - PAD_L - PAD_R);
      const steps = [];
      let acc = 0, lo = 0, hi = 0, plus = 0, minus = 0, primes = 0;
      for (let n = 2; n <= XM; n++) {
        if (lam[n]) {
          acc += chiOf(f, n) * lam[n];
          if (Math.abs(lam[n] - Math.log(n)) < 1e-12) {   // n が素数
            primes++;
            if (chiOf(f, n) > 0) plus++; else if (chiOf(f, n) < 0) minus++;
          }
        }
        steps.push([n, acc]);
        lo = Math.min(lo, acc); hi = Math.max(hi, acc);
      }
      const span = Math.max(2, hi - lo);
      lo -= span * 0.25; hi += span * 0.25;
      const X = (x) => PAD_L + (x - x0) / (XM - x0) * pw;
      const Y = (v) => y0 + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * ph;
      g.strokeStyle = COL.line; g.lineWidth = 1;
      g.beginPath(); g.moveTo(PAD_L, Y(0)); g.lineTo(PAD_L + pw, Y(0)); g.stroke();
      g.fillStyle = COL.mut; g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'top';
      const tick = XM <= 30 ? 5 : 10;
      for (let x = tick; x <= XM; x += tick) {
        g.beginPath(); g.moveTo(X(x), y0 + ph); g.lineTo(X(x), y0 + ph + 3); g.stroke();
        g.fillText(String(x), X(x), y0 + ph + 5);
      }
      g.fillText('x', X(x0) + 4, y0 + ph + 5);
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText('0', PAD_L - 5, Y(0));
      // 素数の階段
      g.strokeStyle = COL.step; g.lineWidth = 2;
      g.beginPath();
      steps.forEach(([n, v], i) => {
        if (i === 0) g.moveTo(X(n), Y(v)); else g.lineTo(X(n), Y(v));
        g.lineTo(X(Math.min(XM, n + 1)), Y(v));
      });
      g.stroke();
      // 零点の波の和
      const M = Math.max(60, Math.round(pw * 1.5));
      g.strokeStyle = COL.wave; g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i <= M; i++) {
        const x = x0 + (XM - x0) * i / M, y = Y(psiWave(x, f, gam, K, cur.c0));
        if (i === 0) g.moveTo(X(x), y); else g.lineTo(X(x), y);
      }
      g.stroke();
      const used = K > 0 ? `使っている零点は 1/2 ± iγ の ${K} 組（γ は ${gam[K - 1].toFixed(2)} まで）。` : '零点を 1 組も使っていないので、波の和は定数と自明な零点の項だけになる。';
      let race;
      if (f.q === 1) race = `x ≤ ${XM} の素数は ${primes} 個。ψ(x) は、素数の累乗 pᵏ ごとに log p ずつ上がる階段で、x に近づいていく（素数定理）。x からのずれを零点の波が表す。`;
      else if (f.q === 4) race = `x ≤ ${XM} の素数のうち、4 で割って 1 余るもの（χ = +1）は ${plus} 個、3 余るもの（χ = −1）は ${minus} 個。階段は +1 の素数とその累乗で上がり、−1 の側で下がる。`;
      else race = `x ≤ ${XM} の素数のうち、χ = +1 のもの（法 ${f.q} の平方剰余）は ${plus} 個、χ = −1 のものは ${minus} 個（${f.q} 自身は 0）。階段は +1 の側で上がり、−1 の側で下がる。`;
      raceEl.textContent = race + used;
      psiCv.setAttribute('aria-label', `素数の階段と、零点 ${K} 組の波の和のグラフ（x は 2 から ${XM}）`);
    }

    function drawAll() { drawStrip(); drawZ(); drawPsi(); }

    function describeChi(f) {
      let text;
      if (f.q === 1) text = 'ζ(s) = 1 + 1/2ˢ + 1/3ˢ + …。どの n でも χ(n) = 1 とした場合にあたる。リーマン予想は、この関数の零点についての予想。';
      else if (f.q === 4) text = 'L(s, χ) = 1 − 1/3ˢ + 1/5ˢ − 1/7ˢ + …。χ(n) は、n を 4 で割った余りが 1 なら +1、3 なら −1、偶数なら 0。';
      else {
        const res = [];
        for (let a = 1; a < f.q; a++) if (f.chi[a] === 1) res.push(a);
        text = `χ(n) は、n を ${f.q} で割った余りが ${res.join('・')}（ある数の 2 乗を ${f.q} で割った余りになる数）なら +1、それ以外なら −1、${f.q} の倍数なら 0（ルジャンドル記号）。`;
      }
      chiEl.textContent = text;
    }

    function renderStats() {
      const st = cur, rows = [];
      const nLine = st.lineN !== null ? st.lineN : st.zeros.filter((z) => z < st.T).length;
      rows.push(['臨界線の上で見つけた零点', `${nLine} 個${st.count === null ? '（探しています）' : ''}`]);
      rows.push(['帯の中の零点（偏角の原理）', st.count === null ? '—' : `N(${+st.Tc.toFixed(2)}) = ${st.count.toFixed(4)}`]);
      rows.push(['一番低い零点', st.zeros.length ? `1/2 + ${st.zeros[0].toFixed(10)} i` : '—']);
      rows.push(['計算の誤差の目安', st.maxIm ? `Z(t) に残った虚部の最大 ${st.maxIm.toExponential(1)}` : '—']);
      rows.push(['かかった時間', st.msZero ? `零点 ${Math.round(st.msZero).toLocaleString('ja-JP')} ms、色の図 ${st.msAll ? Math.round(st.msAll - st.msZero).toLocaleString('ja-JP') + ' ms' : '（描いています）'}` : '—']);
      stEl.replaceChildren(...rows.flatMap(([k, v]) => {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = k; dd.textContent = v;
        return [dt, dd];
      }));
    }

    function verdict() {
      const st = cur, N = Math.round(st.count), name = st.f.q === 1 ? 'リーマン予想' : '一般化リーマン予想';
      const Tc = +st.Tc.toFixed(2);
      if (Math.abs(st.count - N) > 0.05) say(`偏角の原理で数えた値が整数から離れた（${st.count.toFixed(3)}）。計算の誤差が大きい。`);
      else if (st.lineN === N) say(`0 < t < ${Tc} の帯の中にある零点は ${N} 個で、${N} 個とも臨界線 σ = 1/2 の上で見つかった。この高さまでは${name}のとおりになっている。浮動小数点の計算なので、厳密な確かめではない。`);
      else if (st.lineN < N) say(`帯の中の零点は ${N} 個なのに、臨界線の上では ${st.lineN} 個しか見つからなかった。刻みが粗くて、近い 2 つの零点を見落とした可能性がある。`);
      else say(`臨界線の上で ${st.lineN} 個見つかり、帯の中の数 ${N} 個より多い。計算の誤差が大きい。`);
      stripCv.setAttribute('aria-label', `臨界帯の色の図。零点 ${st.lineN} 個が σ = 1/2 の線の上に並ぶ`);
      ztCv.setAttribute('aria-label', `Z(t) のグラフ（t は 0 から ${st.T}）。0 を横切る所が ${st.lineN} か所ある`);
    }

    // Z(t) を刻み step で並べ、符号が変わる所で零点を詰める。設定が変わったら false を返して止める
    async function scan(st, my, step) {
      const f = st.f, n = Math.ceil((st.T + 0.6) / step), samples = [], zeros = [];
      let prev = null, deadline = performance.now() + 40;
      for (let i = 0; i <= n; i++) {
        const t = 0.05 + i * step, z = hardyZ(t, f);
        st.maxIm = Math.max(st.maxIm, Math.abs(z[1]));
        samples.push([t, z[0]]);
        if (prev && prev[1] * z[0] < 0) zeros.push(refineZero(f, prev[0], t, prev[1], z[0]));
        prev = [t, z[0]];
        if (performance.now() >= deadline) {
          st.samples = samples; st.zeros = zeros.slice();
          drawZ(); drawStrip(); renderStats();
          await pause();
          if (my !== run) return false;
          deadline = performance.now() + 40;
        }
      }
      st.samples = samples; st.zeros = zeros;
      return true;
    }

    async function compute() {
      const my = ++run;
      const f = makeFn(+fnSel.value), T = +tIn.value;
      const cols = Math.max(8, Math.round(T * (window.THUMB ? 1.6 : 2.4))), rows = window.THUMB ? 14 : 28;
      const off = document.createElement('canvas');
      off.width = cols; off.height = rows;
      const offCtx = off.getContext('2d');
      cur = { f, T, samples: [], zeros: [], maxIm: 0, count: null, lineN: null, Tc: T, c0: null, off, offCtx, img: offCtx.createImageData(cols, rows), cols, rows, filled: 0, msZero: 0, msAll: 0 };
      const st = cur, t0 = performance.now();
      describeChi(f);
      kIn.max = '0'; kIn.value = '0'; autoK = 0;
      say('臨界線 σ = 1/2 の上で Z(t) を計算しています…');
      renderStats(); drawAll();
      if (!(await scan(st, my, 0.1))) return;
      // 偏角の原理で帯の中の零点を数える。T のすぐ近くに零点があるときは、T を少し上へずらして数える
      let Tc = T;
      while (Tc < T + 0.5 && st.zeros.some((z) => Math.abs(z - Tc) < 0.05)) Tc += 0.07;
      st.Tc = Tc;
      st.count = countZeros(f, Tc);
      st.lineN = st.zeros.filter((z) => z < Tc).length;
      if (st.lineN < Math.round(st.count)) {
        say('数が合わないので、刻みを 0.02 にして探し直しています…');
        if (!(await scan(st, my, 0.02))) return;
        st.lineN = st.zeros.filter((z) => z < Tc).length;
      }
      if (my !== run) return;
      st.c0 = constTerm(f);
      const nz = st.zeros.filter((z) => z <= T).length;
      kIn.max = String(nz);
      kIn.value = String(autoSw.checked ? 0 : nz);
      st.msZero = performance.now() - t0;
      renderStats(); verdict(); drawAll();
      // 臨界帯の色の図を、列ごとに描き足す
      const data = st.img.data;
      let deadline = performance.now() + 40;
      for (let i = 0; i < cols; i++) {
        const t = (i + 0.5) * T / cols;
        for (let j = 0; j < rows; j++) {
          const v = lfun([SIG_HI - (j + 0.5) * (SIG_HI - SIG_LO) / rows, t], f), c = phaseColor(v[0], v[1]), k = (j * cols + i) * 4;
          data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255;
        }
        st.filled = i + 1;
        if (performance.now() >= deadline) {
          drawStrip();
          await pause();
          if (my !== run) return;
          deadline = performance.now() + 40;
        }
      }
      st.msAll = performance.now() - t0;
      renderStats(); drawStrip();
    }

    function stepAuto() {
      if (!cur || cur.c0 === null) return;
      const max = +kIn.max;
      autoK = autoK >= max + 8 ? 0 : autoK + 1;   // 全部を足したら少し止まってから、0 組に戻る
      kIn.value = String(Math.min(autoK, max));
      drawPsi();
    }
    function setAuto(on) {
      autoSw.checked = on;
      clearInterval(autoTimer);
      autoTimer = 0;
      if (on) {
        autoK = +kIn.value >= +kIn.max ? 0 : +kIn.value;
        autoTimer = setInterval(stepAuto, window.THUMB ? 160 : 240);
      }
    }

    fnSel.addEventListener('change', compute);
    tIn.addEventListener('input', () => { tOut.textContent = tIn.value; });
    tIn.addEventListener('change', compute);
    kIn.addEventListener('input', () => { setAuto(false); drawPsi(); });
    xSel.addEventListener('change', drawPsi);
    autoSw.addEventListener('change', () => setAuto(autoSw.checked));
    new ResizeObserver(() => drawAll()).observe(document.querySelector('.wrap'));

    if (window.THUMB) tIn.value = '40';
    tOut.textContent = tIn.value;
    setAuto(!!window.THUMB || !calm.matches);
    compute();
  },
});

dekiru.add({
  id: 'tr-20261121-skiplist-btree', c: 'trend', lv: 2, date: '2026-11-21',
  t: '同じ集合を skiplist と B+ 木で作り、探すときに読むメモリの塊を数える（Valkey 9.2）',
  y: 'おなじしゅうごうをすきっぷりすととびーぷらすぎでつくりさがすときによむめもりのかたまりをかぞえる',
  tags: ['Valkey', 'skiplist', 'B+ 木', 'キャッシュ', 'Canvas'],
  d: '2026年11月16日、Redis から分かれたデータベース Valkey のブログに、Rain Valentine さんと Dragos Andriciuc さんの記事が載った。9.2 から、並べ替え済みの集合（sorted set）の作り方を変えたという内容である。これまでの skiplist をやめ、枝が 61 本の B+ 木「fbtree」にした（PR #4206）。記事によると、1件あたりの余分なメモリは 50.3 バイトから、小さい順に入れた場合は 28.5 バイト（43% 減）、ばらばらに入れた場合は 32.0 バイトになった。300 万件の集合で、点数を書き換える ZADD は 105%、ZREM は 76% 速くなった。Hacker News でも 11月21日に上位に載っている。skiplist は1件ごとに別々のメモリの塊を作り、印（ポインタ）でつなぐ。探すときは、1つの塊を読むまで次の塊の場所が分からない。だから、キャッシュに無い塊を読む待ち時間が何度も続く。B+ 木は 61 件を1つの塊にまとめて並べるので、読む塊の数が少ない。この見本は、同じ集合を skiplist（Valkey と同じく、1段上がる確率は 1/4）と B+ 木の両方で作る。そして、1つの値を探すときにたどる道を描き、読んだ塊の数と比べた回数を数える。横軸は、目当ての値の近くを広げて描いている。下のボタンを押すと、この端末の JavaScript で、実際に探す時間も測れる。本物の fbtree は、葉に値（点数と名前をまとめたもの）への印を置き、内側のノードでは目印の先頭 4 バイト（特徴）を SIMD でまとめて比べる。この見本の B+ 木は、点数をノードの中にそのまま並べる簡単な形にした。メモリの数字は記事の形に合わせた大まかな見積もりで、ハッシュ表、メモリ管理の切り上げ、名前の文字列は含めない。消す処理、範囲の取り出し、名前から点数を引くためのハッシュ表は作っていない。',
  p: 'skiplist で値を探すときは、いちばん上の段から右へ進み、行き過ぎる手前で1段下りる。1段で右へ進む回数は多くても平均 3 回（1/p − 1）で、行き過ぎた塊も1つ読む。だから、比べる回数は段の数（log₄ n）の 3〜4 倍になる。3721 件なら段は約 6 で、読む塊は約 20 個になる。B+ 木は、根から葉まで、1段につき1つの塊しか読まない。読む塊の数は木の高さ（log₆₁ n ほど）で、3721 件なら 2〜3 個になる。その代わり、1つの塊の中で2分探索をするので、比べる回数の差は、読む塊の数の差ほど大きくない（3721 件では、19 回ほどと 12 回ほど）。比べるのは CPU の中の計算で、キャッシュに無い塊をメモリから読む待ち時間よりずっと短い。だから、読む塊の数が速さを決める。小さい順に入れるときは、満杯の右端の葉を半分に分けず、新しい1件だけを新しい葉へ移す。こうすると葉が満杯のまま並び、メモリの無駄が減る（記事の 28.5 バイトと 32.0 バイトの差に当たる）。1件あたりのメモリの見積もりは、skiplist が「戻る印 8 + 段ごとに（次の印 8 + 飛ぶ件数 8）+ 点数 8」バイトである。B+ 木は、葉の大きさ（16 + 8 × 枝の数）と内側のノードの大きさ（16 + 20 × 枝の数）を足して件数で割り、点数の 8 バイトを足した。',
  refs: [
    { title: 'From Skiplists to B+ Trees: Making Valkey Sorted Sets More Memory Efficient（Valkey ブログ、2026-11-16）', url: 'https://valkey.io/blog/from-skiplist-to-b+tree/' },
    { title: 'Hacker News: Valkey kills the skiplist, cuts sorted set overhead by up to 43%', url: 'https://news.ycombinator.com/item?id=50534387' },
    { title: 'valkey-io/valkey PR #4206: ZSET B+ Tree PR 3: Replace skiplist with FB+ Tree implementation', url: 'https://github.com/valkey-io/valkey/pull/4206' },
  ],
  html: `<div class="wrap">
  <div class="ctl">
    <label>件数
      <select id="n">
        <option value="61">61</option>
        <option value="3721" selected>3721（61 × 61）</option>
        <option value="20000">2 万</option>
        <option value="100000">10 万</option>
      </select>
    </label>
    <label>B+ 木の枝の数
      <select id="F">
        <option value="4">4</option>
        <option value="8">8</option>
        <option value="16">16</option>
        <option value="61" selected>61（fbtree と同じ）</option>
      </select>
    </label>
    <label>入れる順
      <select id="ord">
        <option value="rand" selected>ばらばらに</option>
        <option value="seq">小さい順に</option>
      </select>
    </label>
  </div>
  <div class="ctl">
    <button type="button" id="go">別の値を探す</button>
    <label class="sw"><input type="checkbox" switch id="auto"> 自動で探し続ける</label>
    <label class="sw"><input type="checkbox" switch id="fish" checked> 目当ての近くを広げて描く</label>
  </div>
  <section>
    <div class="hd"><span class="nm">skiplist</span> <span class="mut">Valkey 9.1 まで。1件ごとに別の塊で、高さは 1/4 の確率で1段ずつ増える</span> <span class="cnt">読んだ塊 <b id="sr">0</b> 個・比べた <b id="sc">0</b> 回</span></div>
    <canvas id="cs" role="img" aria-label="skiplist の段と、探した道の図"></canvas>
    <div class="hd"><span class="nm">B+ 木</span> <span class="mut">Valkey 9.2 の fbtree を簡単にしたもの。色の濃さはノードの詰まり具合</span> <span class="cnt">読んだ塊 <b id="br">0</b> 個・比べた <b id="bc">0</b> 回</span></div>
    <canvas id="cb" role="img" aria-label="B+ 木の段と、探した道の図"></canvas>
    <p class="legend mut small"><span><i class="lp"></i>進んだ道</span><span><i class="lm"></i>読んだが行き過ぎだった塊</span><span><i class="lh"></i>見つけた値</span><span><i class="lt"></i>目当ての値の位置</span></p>
  </section>
  <p id="msg" class="msg" role="status"></p>
  <div class="res">
    <dl id="st" class="st"></dl>
    <div class="mem">
      <div class="hd">1件あたりの、並べるためのメモリ <span class="mut">見積もり</span></div>
      <div class="bar"><span>skiplist</span><span class="trk"><i id="ms"></i></span><output id="msv">0</output></div>
      <div class="bar"><span>B+ 木</span><span class="trk"><i id="mb" class="b"></i></span><output id="mbv">0</output></div>
      <p class="small mut">記事の実測（ハッシュ表なども含む）: skiplist 50.3 バイト → fbtree 28.5 バイト（小さい順に入れた場合）・32.0 バイト（ばらばらに入れた場合）</p>
    </div>
  </div>
  <section class="bench">
    <div class="hd">この端末で速さを比べる <span class="mut">20 万件をばらばらに入れ、10 万回探す時間</span></div>
    <div class="ctl"><button type="button" id="bench">測る</button> <span id="bres" class="small" role="status"></span></div>
    <p class="small mut">JavaScript では、オブジェクトをメモリのどこに置くかを決められない。だから、C で書かれた Valkey と同じ差にはならない。結果は端末と回ごとに変わる。</p>
  </section>
</div>`,
  css: `:root { color-scheme: dark; --bg: #10131a; --fg: #e4e8f0; --mut: #9aa3b6; --line: #2b3346; --tower: #6f86b8; --box: #4fb79a; --path: #ffc562; --miss: #ff8fb3; --hit: #7dffb0; --tgt: #7fd4ff; --panel: #161a23; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .wrap { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .ctl { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; }
    .ctl label { display: inline-flex; align-items: center; gap: 6px; }
    select, button { font: inherit; min-block-size: 30px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; background: #1e2433; color: var(--fg); }
    button { cursor: pointer; }
    button:disabled { opacity: 0.55; cursor: default; }
    :focus-visible { outline: 2px solid #ffd27a; outline-offset: 2px; }
    input[type="checkbox"][switch] { accent-color: var(--path); margin: 0; cursor: pointer; }
    .hd { font-weight: 600; display: flex; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; }
    .hd .mut { font-weight: 400; font-size: 12px; }
    .hd .cnt { margin-inline-start: auto; font-weight: 400; font-size: 13px; font-variant-numeric: tabular-nums; }
    .hd .cnt b { color: var(--path); }
    .mut { color: var(--mut); }
    .small { font-size: 12px; margin: 0; }
    section { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    canvas { display: block; inline-size: 100%; background: #0b0d12; border-radius: 4px; }
    #cs { block-size: 180px; }
    #cb { block-size: 110px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; }
    .legend i { display: inline-block; inline-size: 14px; block-size: 3px; vertical-align: middle; margin-inline-end: 6px; border-radius: 2px; }
    .legend .lp { background: var(--path); }
    .legend .lm { background: var(--miss); }
    .legend .lh { background: var(--hit); }
    .legend .lt { background: var(--tgt); }
    .msg { margin: 0; padding: 6px 8px; border-inline-start: 3px solid var(--path); background: var(--panel); border-radius: 4px; font-size: 13px; }
    .res { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
    @media (min-width: 640px) { .res { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    .st { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; margin: 0; font-size: 13px; }
    .st dt { color: var(--mut); }
    .st dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .mem { display: flex; flex-direction: column; gap: 6px; }
    .bar { display: grid; grid-template-columns: 5em minmax(0, 1fr) 6.5em; gap: 8px; align-items: center; font-size: 13px; }
    .trk { block-size: 10px; background: var(--line); border-radius: 5px; overflow: hidden; }
    .trk i { display: block; block-size: 100%; inline-size: 0; background: var(--tower); transition: inline-size 0.4s; }
    .trk i.b { background: var(--box); }
    .bar output { font-variant-numeric: tabular-nums; text-align: end; }
    .bench { border-block-start: 1px solid var(--line); padding-block-start: 8px; gap: 6px; }
    @media (prefers-reduced-motion: reduce) { .trk i { transition: none; } }
    .thumb .wrap { padding: 6px; gap: 4px; }
    .thumb .ctl, .thumb .legend, .thumb #msg, .thumb .res, .thumb .bench, .thumb .hd .mut { display: none; }
    .thumb .hd { font-size: 12px; }
    .thumb #cs { block-size: 44vh; }
    .thumb #cb { block-size: 28vh; }`,
  core() {
    // 決まった種から同じ乱数の列を作る（mulberry32）
    function rng(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    // 0〜n−1 を、小さい順（seq）か、混ぜた順（rand）に並べる
    function makeKeys(n, order, rand) {
      const a = Array.from({ length: n }, (_, i) => i);
      if (order === 'rand') {
        for (let i = n - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          const t = a[i]; a[i] = a[j]; a[j] = t;
        }
      }
      return a;
    }

    // ---- skiplist（Redis・Valkey と同じく、1段上がる確率 1/4、最高 32 段） ----
    const SKIP_P = 0.25, SKIP_MAX = 32;
    function skipNew() {
      return { head: { key: -Infinity, next: new Array(SKIP_MAX).fill(null) }, level: 1, n: 0 };
    }
    function skipLevel(rand) {
      let l = 1;
      while (l < SKIP_MAX && rand() < SKIP_P) l++;
      return l;
    }
    function skipInsert(sl, key, rand) {
      const upd = new Array(SKIP_MAX);
      let x = sl.head;
      for (let i = sl.level - 1; i >= 0; i--) {
        while (x.next[i] && x.next[i].key < key) x = x.next[i];
        upd[i] = x;
      }
      const lv = skipLevel(rand);
      if (lv > sl.level) {
        for (let i = sl.level; i < lv; i++) upd[i] = sl.head;
        sl.level = lv;
      }
      const node = { key, next: new Array(lv).fill(null), rank: 0 };
      for (let i = 0; i < lv; i++) { node.next[i] = upd[i].next[i]; upd[i].next[i] = node; }
      sl.n++;
      return node;
    }
    // いちばん下の段をたどって、何番目かを書き込む。小さい順の配列を返す
    function skipRanks(sl) {
      const out = [];
      for (let x = sl.head.next[0]; x; x = x.next[0]) { x.rank = out.length; out.push(x); }
      return out;
    }
    // 探した道を記録しながら探す。reads は読んだ別々の塊の数（入口も 1 と数える）
    function skipSearch(sl, key) {
      const steps = [], seen = new Set();
      let x = sl.head, cmps = 0;
      for (let i = sl.level - 1; i >= 0; i--) {
        for (;;) {
          const y = x.next[i];
          if (!y) break;
          cmps++;
          const again = seen.has(y);
          seen.add(y);
          const go = y.key < key;
          steps.push({ node: y, lv: i, go, again });
          if (!go) break;
          x = y;
        }
      }
      const hit = x.next[0];
      return { found: !!hit && hit.key === key, steps, reads: seen.size + 1, cmps };
    }
    // 速さを測るための、記録をしない探し方
    function skipHas(sl, key) {
      let x = sl.head;
      for (let i = sl.level - 1; i >= 0; i--) {
        let y = x.next[i];
        while (y && y.key < key) { x = y; y = x.next[i]; }
      }
      const y = x.next[0];
      return !!y && y.key === key;
    }
    // 1件あたりのメモリの見積もり: 戻る印 8 + 段ごとに（次の印 8 + 飛ぶ件数 8）+ 点数 8
    function skipBytes(nodes) {
      let lv = 0;
      for (const x of nodes) lv += x.next.length;
      const avgLv = nodes.length ? lv / nodes.length : 0;
      return { avgLv, bytes: nodes.length ? 16 + 16 * avgLv : 0 };
    }

    // ---- B+ 木（枝の数 F。葉は F 件まで、内側のノードは子を F 個まで） ----
    function btNew(F) {
      return { F: Math.max(3, F | 0), root: { leaf: true, keys: [], next: null }, depth: 1, n: 0 };
    }
    // 並んだ数のうち key 以下がいくつあるか（upper）、key 未満がいくつあるか（lower）。比べた回数も返す
    function upper(a, key) {
      let lo = 0, hi = a.length, c = 0;
      while (lo < hi) { const m = (lo + hi) >> 1; c++; if (a[m] <= key) lo = m + 1; else hi = m; }
      return [lo, c];
    }
    function lower(a, key) {
      let lo = 0, hi = a.length, c = 0;
      while (lo < hi) { const m = (lo + hi) >> 1; c++; if (a[m] < key) lo = m + 1; else hi = m; }
      return [lo, c];
    }
    function btInsert(bt, key) {
      const F = bt.F, path = [];
      let x = bt.root, rightmost = true;
      while (!x.leaf) {
        const i = upper(x.keys, key)[0];
        path.push([x, i]);
        if (i < x.kids.length - 1) rightmost = false;
        x = x.kids[i];
      }
      const pos = lower(x.keys, key)[0];
      if (x.keys[pos] === key) return false;
      x.keys.splice(pos, 0, key);
      bt.n++;
      if (x.keys.length <= F) return true;
      // 葉があふれた。右端の葉の末尾に足したときは、新しい1件だけを右の葉へ移す（小さい順に入れると満杯の葉が並ぶ）
      const app = rightmost && pos === x.keys.length - 1;
      const cut = app ? F : Math.ceil(x.keys.length / 2);
      const right = { leaf: true, keys: x.keys.splice(cut), next: x.next };
      x.next = right;
      let sep = right.keys[0], child = right;
      for (let d = path.length - 1; d >= 0; d--) {
        const p = path[d][0], i = path[d][1];
        p.keys.splice(i, 0, sep);
        p.kids.splice(i + 1, 0, child);
        if (p.kids.length <= F) return true;
        // 内側のノードもあふれた。左に kc 個の子を残し、その境目の目印を親へ上げる
        const kc = app ? F : Math.ceil(p.kids.length / 2);
        const rKids = p.kids.splice(kc);
        const upKey = p.keys[kc - 1];
        const rKeys = p.keys.splice(kc);
        p.keys.length = kc - 1;
        sep = upKey;
        child = { leaf: false, keys: rKeys, kids: rKids };
      }
      bt.root = { leaf: false, keys: [sep], kids: [bt.root, child] };
      bt.depth++;
      return true;
    }
    // 段ごとのノードの配列を返す。各ノードに、受け持つ順位の範囲 lo〜hi を書き込む
    function btLevels(bt) {
      const rows = [];
      let r = 0;
      (function walk(x, d) {
        if (!rows[d]) rows[d] = [];
        rows[d].push(x);
        if (x.leaf) { x.lo = r; r += x.keys.length; x.hi = r; return; }
        for (const k of x.kids) walk(k, d + 1);
        x.lo = x.kids[0].lo;
        x.hi = x.kids[x.kids.length - 1].hi;
      })(bt.root, 0);
      return rows;
    }
    function btSearch(bt, key) {
      const steps = [];
      let x = bt.root, cmps = 0;
      while (!x.leaf) {
        const [i, c] = upper(x.keys, key);
        cmps += c;
        steps.push({ node: x, c });
        x = x.kids[i];
      }
      const [j, c] = lower(x.keys, key);
      cmps += c;
      steps.push({ node: x, c });
      return { found: x.keys[j] === key, steps, reads: steps.length, cmps };
    }
    function btHas(bt, key) {
      let x = bt.root;
      while (!x.leaf) {
        const a = x.keys;
        let lo = 0, hi = a.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= key) lo = m + 1; else hi = m; }
        x = x.kids[lo];
      }
      const a = x.keys;
      let lo = 0, hi = a.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < key) lo = m + 1; else hi = m; }
      return a[lo] === key;
    }
    // 葉の詰まり具合（0〜1）
    function btFill(rows, F) {
      const leaves = rows[rows.length - 1] || [];
      let k = 0;
      for (const x of leaves) k += x.keys.length;
      return leaves.length ? k / (leaves.length * F) : 0;
    }
    // 1件あたりのメモリの見積もり: 葉（16 + 8F）と内側のノード（16 + 20F）を件数で割り、点数の 8 を足す
    function btBytes(rows, n, F) {
      let leaves = 0, inner = 0;
      for (const row of rows) for (const x of row) { if (x.leaf) leaves++; else inner++; }
      return n ? (leaves * (16 + 8 * F) + inner * (16 + 20 * F)) / n + 8 : 0;
    }
    // ばらばらに count 回探し、読んだ塊と比べた回数の平均を出す
    function sampleAvg(sl, bt, n, count, rand) {
      let sr = 0, sc = 0, br = 0, bc = 0;
      for (let i = 0; i < count; i++) {
        const k = Math.floor(rand() * n);
        const a = skipSearch(sl, k), b = btSearch(bt, k);
        sr += a.reads; sc += a.cmps; br += b.reads; bc += b.cmps;
      }
      return { sr: sr / count, sc: sc / count, br: br / count, bc: bc / count };
    }
    // 目当ての近くを広げる横軸。u（0〜n）を 0〜1 に写す。c は目当ての位置、s が小さいほど近くを大きく広げる
    function fish(u, c, n, s) {
      if (!(n > 0)) return 0;
      const uu = Math.min(n, Math.max(0, u)), xc = c / n;
      if (uu <= c) return c <= 0 ? 0 : xc - xc * Math.log1p((c - uu) / s) / Math.log1p(c / s);
      const D = n - c;
      return D <= 0 ? 1 : xc + (1 - xc) * Math.log1p((uu - c) / s) / Math.log1p(D / s);
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    if (window.THUMB) document.documentElement.classList.add('thumb');
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const nSel = $('n'), fSel = $('F'), oSel = $('ord'), fishSw = $('fish'), goBtn = $('go'), autoSw = $('auto');
    const cs = $('cs'), cb = $('cb'), stEl = $('st'), msgEl = $('msg');
    const srEl = $('sr'), scEl = $('sc'), brEl = $('br'), bcEl = $('bc');
    const benchBtn = $('bench'), bresEl = $('bres');
    const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';
    const COL = { mut: cssVar('--mut'), line: cssVar('--line'), tower: cssVar('--tower'), box: cssVar('--box'), path: cssVar('--path'), miss: cssVar('--miss'), hit: cssVar('--hit'), tgt: cssVar('--tgt') };
    const FONT = '10px system-ui, sans-serif';
    const PAD_L = 46, PAD_R = 10, PAD_Y = 6, SPREAD = 1;
    // 長い処理の途中で、ときどきブラウザへ順番を返す（scheduler.yield が無いブラウザでは setTimeout）
    const pause = () => (globalThis.scheduler && typeof scheduler.yield === 'function') ? scheduler.yield() : new Promise((r) => setTimeout(r, 0));
    let S = null, Q = null, gen = 0, stepTimer = 0, nextTimer = 0, qDd = null;
    const layers = [
      { cv: cs, bg: document.createElement('canvas'), key: '', paint: paintSkip, over: overSkip },
      { cv: cb, bg: document.createElement('canvas'), key: '', paint: paintTree, over: overTree },
    ];

    function sizeOf(cv) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
      return { dpr, w, h, W: Math.max(1, Math.round(w * dpr)), H: Math.max(1, Math.round(h * dpr)) };
    }
    function xOf(u, z) {
      const pw = Math.max(1, z.w - PAD_L - PAD_R);
      return PAD_L + pw * (fishSw.checked ? fish(u, Q.key + 0.5, S.n, SPREAD) : u / S.n);
    }
    const xMid = (r, z) => (xOf(r, z) + xOf(r + 1, z)) / 2;
    function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    function dot(g, x, y, r, fill) {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
      if (fill) g.fill(); else g.stroke();
    }
    function targetLine(g, z) {
      const tx = xMid(Q.key, z);
      g.strokeStyle = COL.tgt; g.globalAlpha = 0.8; g.lineWidth = 1; g.setLineDash([3, 3]);
      line(g, tx, 0, tx, z.h);
      g.setLineDash([]); g.globalAlpha = 1;
    }

    // ---- skiplist の図: 段ごとの横の線と、1件ごとの塔 ----
    function geoSkip(z) {
      const L = S.sl.level, lh = Math.max(1, (z.h - 2 * PAD_Y) / L);
      return { L, lh, y: (i) => PAD_Y + (L - 1 - i + 0.5) * lh };
    }
    function paintSkip(g, z) {
      const { L, lh, y } = geoSkip(z);
      g.font = FONT; g.textBaseline = 'middle'; g.fillStyle = COL.mut;
      for (let i = 0; i < L; i++) if (lh >= 10 || i === 0 || i === L - 1) g.fillText('段 ' + (i + 1), 4, y(i));
      g.strokeStyle = COL.line; g.lineWidth = 1;
      for (let i = 0; i < L; i++) line(g, PAD_L - 10, y(i), z.w - PAD_R, y(i));
      g.fillStyle = COL.mut;
      g.fillRect(PAD_L - 10, PAD_Y + lh * 0.2, 5, L * lh - lh * 0.4);   // 入口（どの段にも印を持つ塊）
      g.fillStyle = COL.tower; g.globalAlpha = 0.65;
      const bottom = PAD_Y + L * lh - lh * 0.2;
      for (const nd of S.nodes) {
        const x0 = xOf(nd.rank, z), wd = xOf(nd.rank + 1, z) - x0;
        const yTop = PAD_Y + (L - nd.next.length) * lh + lh * 0.2;
        if (wd >= 3) g.fillRect(x0 + 0.5, yTop, wd - 1, bottom - yTop);
        else g.fillRect(x0, yTop, Math.max(0.5, wd), bottom - yTop);
      }
      g.globalAlpha = 1;
      targetLine(g, z);
    }
    function overSkip(g, z, k) {
      const { L, y } = geoSkip(z), steps = Q.sk.steps;
      let cx = PAD_L - 7.5, lvl = L - 1;
      g.lineWidth = 2;
      g.fillStyle = COL.path; dot(g, cx, y(lvl), 3, true);
      for (let i = 0; i < k && i < steps.length; i++) {
        const s = steps[i];
        if (s.lv < lvl) { g.strokeStyle = COL.path; line(g, cx, y(lvl), cx, y(s.lv)); lvl = s.lv; }
        const nx = xMid(s.node.rank, z), cy = y(lvl);
        const last = i === steps.length - 1 && Q.sk.found && s.node.key === Q.key;
        if (s.go) {
          g.strokeStyle = COL.path; line(g, cx, cy, nx, cy);
          g.fillStyle = COL.path; dot(g, nx, cy, 3, true);
          cx = nx;
        } else if (last) {
          g.strokeStyle = COL.path; line(g, cx, cy, nx, cy);
          g.fillStyle = COL.hit; dot(g, nx, cy, 4.5, true);
        } else {
          g.strokeStyle = COL.miss; g.globalAlpha = 0.7; g.setLineDash([2, 3]);
          line(g, cx, cy, nx, cy);
          g.setLineDash([]); g.globalAlpha = 1;
          g.lineWidth = 1.5; dot(g, nx, cy, 3.5, false); g.lineWidth = 2;
        }
      }
    }

    // ---- B+ 木の図: 段ごとに、ノードが受け持つ範囲を箱で描く ----
    function geoTree(z) {
      const D = S.levels.length, lh = Math.max(1, (z.h - 2 * PAD_Y) / D);
      return { D, lh, y: (d) => PAD_Y + (d + 0.5) * lh };
    }
    function paintTree(g, z) {
      const { D, lh, y } = geoTree(z);
      g.font = FONT; g.textBaseline = 'middle'; g.fillStyle = COL.mut;
      for (let d = 0; d < D; d++) {
        const name = D === 1 ? '根・葉' : d === 0 ? '根' : d === D - 1 ? '葉' : '内側';
        if (lh >= 10 || d === 0 || d === D - 1) g.fillText(name, 4, y(d));
      }
      g.fillStyle = COL.box;
      for (let d = 0; d < D; d++) {
        for (const nd of S.levels[d]) {
          const x0 = xOf(nd.lo, z), wd = xOf(nd.hi, z) - x0, gap = wd > 4 ? 1 : 0;
          const full = (nd.leaf ? nd.keys.length : nd.kids.length) / S.F;
          g.globalAlpha = 0.18 + 0.72 * Math.min(1, full);
          g.fillRect(x0 + gap, y(d) - lh * 0.3, Math.max(0.5, wd - 2 * gap), lh * 0.6);
        }
      }
      g.globalAlpha = 1;
      targetLine(g, z);
    }
    function overTree(g, z, k) {
      const { lh, y } = geoTree(z), steps = Q.bt.steps, tx = xMid(Q.key, z);
      g.lineWidth = 2;
      for (let i = 0; i < k && i < steps.length; i++) {
        const nd = steps[i].node, x0 = xOf(nd.lo, z), x1 = xOf(nd.hi, z);
        g.strokeStyle = COL.path;
        g.strokeRect(x0 + 1, y(i) - lh * 0.3, Math.max(1, x1 - x0 - 2), lh * 0.6);
        if (i > 0) line(g, tx, y(i - 1), tx, y(i));
        const last = i === steps.length - 1 && Q.bt.found;
        g.fillStyle = last ? COL.hit : COL.path;
        dot(g, tx, y(i), last ? 4.5 : 3, true);
      }
    }

    function draw() {
      if (!S || !Q) return;
      for (const L of layers) {
        const z = sizeOf(L.cv);
        const key = gen + '|' + Q.key + '|' + z.W + 'x' + z.H + '|' + fishSw.checked;
        if (L.key !== key) {
          L.bg.width = z.W; L.bg.height = z.H;
          const gb = L.bg.getContext('2d');
          gb.setTransform(z.dpr, 0, 0, z.dpr, 0, 0);
          gb.clearRect(0, 0, z.w, z.h);
          L.paint(gb, z);
          L.key = key;
        }
        if (L.cv.width !== z.W) L.cv.width = z.W;
        if (L.cv.height !== z.H) L.cv.height = z.H;
        const g = L.cv.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, z.W, z.H);
        g.drawImage(L.bg, 0, 0);
        g.setTransform(z.dpr, 0, 0, z.dpr, 0, 0);
        L.over(g, z, Q.k);
      }
      const ks = Math.min(Q.k, Q.sk.steps.length), kb = Math.min(Q.k, Q.bt.steps.length);
      let reads = 1;
      for (let i = 0; i < ks; i++) if (!Q.sk.steps[i].again) reads++;
      let bcm = 0;
      for (let i = 0; i < kb; i++) bcm += Q.bt.steps[i].c;
      srEl.textContent = reads; scEl.textContent = ks;
      brEl.textContent = kb; bcEl.textContent = bcm;
    }

    function fmt(v, d) { return v.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d }); }
    function renderStats() {
      stEl.replaceChildren();
      const row = (a, b) => {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = a; dd.textContent = b;
        stEl.append(dt, dd);
        return dd;
      };
      qDd = row('探した値', '');
      const A = S.avg;
      row('平均（400 回探す）', `skiplist ${fmt(A.sr, 1)} 塊・${fmt(A.sc, 1)} 回 ／ B+ 木 ${fmt(A.br, 1)} 塊・${fmt(A.bc, 1)} 回`);
      row('skiplist の形', `最高 ${S.sl.level} 段。1件の高さの平均 ${fmt(S.sb.avgLv, 2)} 段`);
      const leaves = S.levels[S.levels.length - 1].length;
      row('B+ 木の形', `${S.levels.length} 段。葉 ${leaves.toLocaleString('ja-JP')} 個、葉の詰まり具合 ${fmt(S.fill * 100, 0)}%`);
      const mx = Math.max(S.sb.bytes, S.bb, 1);
      $('ms').style.inlineSize = (S.sb.bytes / mx * 100) + '%';
      $('mb').style.inlineSize = (S.bb / mx * 100) + '%';
      $('msv').textContent = fmt(S.sb.bytes, 1) + ' バイト';
      $('mbv').textContent = fmt(S.bb, 1) + ' バイト';
    }

    function finish() {
      const sr = Q.sk.reads, br = Q.bt.reads;
      msgEl.textContent = `skiplist は ${sr} 個の塊を読み、${Q.sk.cmps} 回比べた。B+ 木は ${br} 個の塊を読み、${Q.bt.cmps} 回比べた。` +
        '速さを決めるのは、比べた回数より読んだ塊の数である。キャッシュに無い塊を読むと、比べる1回よりずっと長く待つ。';
      clearTimeout(nextTimer);
      if (autoSw.checked) nextTimer = setTimeout(nextSearch, window.THUMB ? 1300 : 1900);
    }
    function step() {
      Q.k++;
      draw();
      if (Q.k < Q.total) stepTimer = setTimeout(step, window.THUMB ? 75 : 120);
      else finish();
    }
    function startSearch(key) {
      clearTimeout(stepTimer); clearTimeout(nextTimer);
      const sk = skipSearch(S.sl, key), bt = btSearch(S.bt, key);
      Q = { key, sk, bt, k: 0, total: Math.max(sk.steps.length, bt.steps.length) };
      if (qDd) qDd.textContent = `小さい方から ${(key + 1).toLocaleString('ja-JP')} 番目（全 ${S.n.toLocaleString('ja-JP')} 件）`;
      msgEl.textContent = '探しています…';
      if (calm.matches && !window.THUMB) { Q.k = Q.total; draw(); finish(); }
      else step();
    }
    function nextSearch() { if (S) startSearch(Math.floor(S.rand() * S.n)); }

    async function build() {
      const my = ++gen;
      clearTimeout(stepTimer); clearTimeout(nextTimer);
      msgEl.textContent = '集合を作っています…';
      await pause();
      if (my !== gen) return;
      const n = +nSel.value, F = +fSel.value, ord = oSel.value;
      const rand = rng(20261121 + n * 3 + F);
      const keys = makeKeys(n, ord, rand);
      const sl = skipNew(), bt = btNew(F);
      let deadline = performance.now() + 40;
      for (let i = 0; i < n; i++) {
        skipInsert(sl, keys[i], rand);
        btInsert(bt, keys[i]);
        if ((i & 255) === 255 && performance.now() >= deadline) {
          await pause();
          if (my !== gen) return;
          deadline = performance.now() + 40;
        }
      }
      const nodes = skipRanks(sl), levels = btLevels(bt);
      S = { n, F, sl, nodes, bt, levels, rand: rng(7 + n + F), avg: sampleAvg(sl, bt, n, 400, rng(99)),
        sb: skipBytes(nodes), bb: btBytes(levels, n, F), fill: btFill(levels, F) };
      renderStats();
      startSearch(Math.floor(n * 0.62));
    }

    // この端末で、記録をしない探し方の時間を測る。1回の区切りは 2 万回にして、間でブラウザへ順番を返す
    async function bench() {
      benchBtn.disabled = true;
      bresEl.textContent = '20 万件を入れています…';
      await pause();
      const N = 200000, M = 100000, CH = 20000, r = rng(42);
      const keys = makeKeys(N, 'rand', r);
      const sl = skipNew(), bt = btNew(61);
      let deadline = performance.now() + 40;
      for (let i = 0; i < N; i++) {
        skipInsert(sl, keys[i], r);
        btInsert(bt, keys[i]);
        if ((i & 255) === 255 && performance.now() >= deadline) { await pause(); deadline = performance.now() + 40; }
      }
      const qs = new Int32Array(M);
      for (let i = 0; i < M; i++) qs[i] = Math.floor(r() * N);
      bresEl.textContent = '測っています…';
      async function timeIt(has, s) {
        let ms = 0, hit = 0;
        for (let a = 0; a < M; a += CH) {
          await pause();
          const t = performance.now();
          for (let i = a; i < a + CH; i++) if (has(s, qs[i])) hit++;
          ms += performance.now() - t;
        }
        if (hit !== M) throw new Error('見つからない値があった');
        return ms;
      }
      await timeIt(skipHas, sl); await timeIt(btHas, bt);   // 慣らし
      const ts = [], tb = [];
      for (let k = 0; k < 3; k++) { ts.push(await timeIt(skipHas, sl)); tb.push(await timeIt(btHas, bt)); }
      const mid = (a) => a.slice().sort((p, q) => p - q)[1];
      const a = mid(ts), b = mid(tb), ratio = a / Math.max(1e-6, b);
      bresEl.textContent = `skiplist ${fmt(a, 1)} ms、B+ 木 ${fmt(b, 1)} ms（10 万回、3 回測った真ん中の値）。` +
        (ratio >= 1 ? `B+ 木の方が ${fmt(ratio, 1)} 倍速かった。` : `skiplist の方が ${fmt(1 / ratio, 1)} 倍速かった。`);
      benchBtn.disabled = false;
    }

    nSel.addEventListener('change', build);
    fSel.addEventListener('change', build);
    oSel.addEventListener('change', build);
    fishSw.addEventListener('change', draw);
    goBtn.addEventListener('click', nextSearch);
    autoSw.addEventListener('change', () => {
      clearTimeout(nextTimer);
      if (autoSw.checked && Q && Q.k >= Q.total) nextTimer = setTimeout(nextSearch, 400);
    });
    benchBtn.addEventListener('click', () => {
      bench().catch((err) => { bresEl.textContent = '測れなかった: ' + err.message; benchBtn.disabled = false; });
    });
    new ResizeObserver(() => draw()).observe(document.querySelector('.wrap'));

    autoSw.checked = !!window.THUMB || !calm.matches;
    build();
  },
});

dekiru.add({
  id: 'tr-20261121-interaction-nets', c: 'trend', lv: 3, date: '2026-11-21',
  t: 'グラフの書き換えだけで計算し、順番を変えても同じ答えになるのを確かめる（Frostbite の interaction nets）',
  y: 'ぐらふのかきかえだけでけいさんしじゅんばんをかえてもおなじこたえになるのをたしかめるふろすとばいとのいんたらくしょんねっつ',
  tags: ['Frostbite', 'interaction nets', 'グラフの書き換え', '並列', 'Canvas'],
  d: '2026年11月18日、Architect Labs が CPU「Frostbite」を発表した。AI のエージェントが、命令セットから回路の配置（GDS）までを設計し、確かめたという。同じくらいの面積の普通の CPU と比べると、電力あたりの性能は 25 種類の処理の幾何平均で 4.59 倍だった（同社の記事による。比べた CPU の名前は伏せてある）。Hacker News では 11月20日に 646 点・コメント 333 件を集めた。Frostbite の土台は、1990年に Yves Lafont が考えた interaction nets という計算の仕組みである。プログラムは節点と線でできたグラフで、どの節点も主の口を1つだけ持つ。2つの節点の主の口どうしが線でつながると「書き換えられる組」になり、決まりに従って、その2つを別の小さなグラフに置き換える。これを繰り返して計算する。1回の書き換えは近くの節点しか変えず、組どうしは重ならない。だから、組をどの順番で書き換えても、全部同時に書き換えても、同じ答えになる。どの値も持ち主が1つしかないので、普通の CPU が多くの電力を使う、共有のキャッシュと、その中身をそろえる仕組みも要らないという。この見本は、記事が入門として勧める Tendrils の解説と同じく、0・+1・足し算・掛け算・複製（δ）・消去（ε）の6種類の節点を使う。入力した式からグラフを作り、書き換えて答えを出す。書き換える順番は5通りから選べる。古い組から1つずつ、ばらばらに1つずつ、全部同時に、それと、タイル 4 枚か 16 枚で分け合う順番である。タイルの動きは、記事がエージェントが作ったと書いている3つの決まりをまねた。自分の仕事があれば先にする。無ければ、隣のタイルから余っている仕事をもらう。それも無ければ休む。下の表で、順番を変えても答えと書き換えた回数は変わらず、かかった手数だけが変わることを確かめられる。Frostbite の命令セット、Rust に似た言語 Vine から中間の形 Ivy への変換、タイルの間の通信路、電力の数字は再現していない。本物の Ivy のネットは、データ・計算の節点・制御の節点の3種類の部品でできている。この見本のタイルは1手に1回だけ書き換え、仕事をもらうのに時間はかからないものとした。数は +1 の節点を数の分だけ並べて表すので、大きな数は扱えない。',
  p: '足し算の決まりは「0 + y = y」と「(1 + x) + y = 1 + (x + y)」の2つである。＋ の節点の主の口は1つ目の数を向く。1つ目の数の先頭が +1 なら、+1 を1つ答えの側へ送り出し、残りでもう一度足し算をする。答えの +1 は計算の途中から上へ出ていくので、その答えを使う次の足し算は、計算が全部終わるのを待たずに始められる。掛け算は「0 × y = 0」と「(1 + x) × y = x × y + y」である。0 のときは y を消去の節点 ε に渡して消し、1 + x のときは y を複製の節点 δ で2つに写す。δ と ε も、数と出会うと +1 を1つずつ写したり消したりする。主の口は1つだけなので、1つの節点が2つの組に入ることはない。だから、ある組を書き換えても、ほかの組は書き換えられるまま残る。Lafont は、この性質から、どの順番で最後まで書き換えても書き換えの回数が同じになることを示した。全部同時に書き換えるときの手数は、前の書き換えを待たなければならない列のうち、いちばん長いものの長さになる。タイルをいくら増やしても、これより少ない手数にはならない。記事の 5 クイーンの例では、3183 回の書き換えに対して、いちばん長い列は 262 手だった。1手あたり平均 12 組を同時に書き換えられる計算である。タイルの見本では、書き換えで新しくできた組を、それを作ったタイルの仕事にする。自分の仕事は新しいものから取り、隣からもらうときは古いものから取る。',
  refs: [
    { title: 'Introducing Frostbite: A new CPU architecture discovered, designed, and verified end-to-end by AI（Architect Labs、2026-11-18）', url: 'https://architectlabs.com/blog/frostbite' },
    { title: 'Hacker News: Frostbite: A new CPU architecture discovered, designed and verified by AI', url: 'https://news.ycombinator.com/item?id=50572503' },
    { title: 'Architect Labs の X の投稿（2026-11-18）', url: 'https://x.com/architectlabs/status/2123187520276152487' },
    { title: 'On Interaction Nets（Tendrils、2026-04-26）', url: 'https://tendrils.co/blog/2026-04-26/on-inets' },
    { title: 'Yves Lafont: Interaction Nets（POPL 1990）', url: 'https://doi.org/10.1145/96709.96718' },
  ],
  html: `<div class="wrap">
  <form class="ctl" id="f">
    <label>式 <input type="text" id="ex" value="2 × 3 + 3 × 2" autocomplete="off" spellcheck="false" aria-describedby="exh"></label>
    <button type="submit">この式で作り直す</button>
    <label>例
      <select id="pre">
        <option value="">選ぶ</option>
        <option>2 + 3</option>
        <option>2 × 2</option>
        <option>2 × 3 + 3 × 2</option>
        <option>(1 + 2) × (2 + 2)</option>
        <option>0 × 7</option>
        <option>3 × 3 × 3</option>
      </select>
    </label>
  </form>
  <p id="exh" class="small mut">足し算（+）・掛け算（× か *）・括弧が使えます。数は 20 まで、途中の数と答えは 64 までです。</p>
  <div class="ctl">
    <label>書き換える順番
      <select id="mode">
        <option value="fifo">古い組から1つずつ</option>
        <option value="rand">ばらばらに1つずつ</option>
        <option value="t4">タイル 4 枚（2×2）で分け合う</option>
        <option value="t16" selected>タイル 16 枚（4×4）で分け合う</option>
        <option value="par">全部同時に</option>
      </select>
    </label>
    <label>速さ
      <select id="spd">
        <option value="700">ゆっくり</option>
        <option value="300" selected>ふつう</option>
        <option value="90">速い</option>
      </select>
    </label>
  </div>
  <div class="ctl">
    <button type="button" id="one">1手進める</button>
    <label><input type="checkbox" switch id="auto"> 自動で進める</label>
    <button type="button" id="reset">最初から</button>
  </div>
  <canvas id="cv" role="img" aria-label="interaction net の図。上の「答」から下へ、演算と数の節点が線でつながる。太い線が書き換えられる組"></canvas>
  <p class="legend small mut"><span><i class="n"></i>数（0 と +1）</span><span><i class="o"></i>足し算と掛け算</span><span><i class="d"></i>複製 δ と消去 ε</span><span><i class="w"></i>書き換えられる組（タイルで分け合うときはタイルの色）</span><span><i class="p"></i>主の口</span></p>
  <div id="tiles" class="tiles" role="group" aria-label="タイルの様子" hidden></div>
  <p id="tlg" class="small mut" hidden>緑はその手に自分の仕事をしたタイル、橙は隣から仕事をもらったタイル、暗いのは休んだタイル。数は、手の終わりに持っている仕事（書き換えられる組）の数。上の線の色がタイルの色。</p>
  <p id="msg" class="msg" role="status"></p>
  <div class="res">
    <dl id="st" class="st"></dl>
    <div>
      <div class="hd">手ごとの、書き換えられる組の数</div>
      <canvas id="rd" role="img" aria-label="手ごとの、書き換えられる組の数の棒グラフ"></canvas>
    </div>
  </div>
  <div class="tw" tabindex="0" role="region" aria-labelledby="cap">
    <table>
      <caption id="cap">同じ式を、順番だけ変えて最後まで書き換えた結果</caption>
      <thead><tr><th scope="col">順番</th><th scope="col">答え</th><th scope="col">書き換えた回数</th><th scope="col">手数</th><th scope="col">1手あたり</th></tr></thead>
      <tbody id="tb"></tbody>
    </table>
  </div>
</div>`,
  css: `:root { color-scheme: dark; --bg: #10131a; --fg: #e4e8f0; --mut: #9aa3b6; --line: #2b3346; --wire: #5a6582; --num: #5fc8b0; --op: #f0b45a; --dup: #b49cff; --out: #d6dcea; --act: #ff7a59; --own: #2f6f5c; --steal: #8a5a1e; --idle: #1b2130; --panel: #161a23; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .wrap { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .ctl { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; margin: 0; }
    .ctl label { display: inline-flex; align-items: center; gap: 6px; }
    input[type="text"], select, button { font: inherit; min-block-size: 30px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; background: #1e2433; color: var(--fg); }
    input[type="text"] { inline-size: 12em; max-inline-size: 55vw; }
    button { cursor: pointer; }
    :focus-visible { outline: 2px solid #ffd27a; outline-offset: 2px; }
    input[type="checkbox"][switch] { accent-color: var(--act); margin: 0; cursor: pointer; }
    .mut { color: var(--mut); }
    .small { font-size: 12px; margin: 0; }
    canvas { display: block; inline-size: 100%; background: #0b0d12; border-radius: 4px; }
    #cv { block-size: 380px; }
    #rd { block-size: 80px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; }
    .legend i { display: inline-block; inline-size: 10px; block-size: 10px; border-radius: 50%; vertical-align: -1px; margin-inline-end: 5px; }
    .legend .n { background: var(--num); }
    .legend .o { background: var(--op); }
    .legend .d { background: var(--dup); }
    .legend .w { inline-size: 16px; block-size: 4px; border-radius: 2px; vertical-align: middle; background: var(--act); }
    .legend .p { inline-size: 6px; block-size: 6px; vertical-align: 1px; background: var(--fg); }
    .tiles { display: grid; gap: 4px; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); max-inline-size: 440px; }
    .tile { border-radius: 4px; padding: 2px 6px; font-size: 11px; line-height: 1.35; background: var(--idle); border-block-start: 3px solid var(--hue, #888); font-variant-numeric: tabular-nums; display: flex; flex-direction: column; }
    .tile.own { background: var(--own); }
    .tile.steal { background: var(--steal); }
    .tile span:first-child { color: var(--mut); }
    .msg { margin: 0; padding: 6px 8px; border-inline-start: 3px solid var(--act); background: var(--panel); border-radius: 4px; font-size: 13px; min-block-size: 1.5em; }
    .res { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
    @media (min-width: 640px) { .res { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    .st { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; margin: 0; font-size: 13px; }
    .st dt { color: var(--mut); }
    .st dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .hd { font-weight: 600; font-size: 13px; margin-block-end: 4px; }
    .tw { overflow-x: auto; max-inline-size: 100%; }
    table { border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; min-inline-size: 100%; }
    caption { text-align: start; font-weight: 600; padding-block-end: 4px; }
    th, td { padding: 3px 8px; border-block-end: 1px solid var(--line); text-align: end; white-space: nowrap; }
    th[scope="row"], thead th:first-child { text-align: start; font-weight: 400; }
    thead th { color: var(--mut); font-weight: 400; }
    tr.cur th, tr.cur td { background: #22293a; }
    tr.cur th[scope="row"] { font-weight: 600; }
    .thumb .wrap { padding: 4px; gap: 4px; }
    .thumb .ctl, .thumb #exh, .thumb .legend, .thumb #msg, .thumb .res, .thumb .tw, .thumb .tiles, .thumb #tlg { display: none; }
    .thumb #cv { block-size: 94vh; }`,
  core() {
    // ---- 式を読む（足し算・掛け算・括弧。数は 0〜20、途中の数と答えは 64 まで） ----
    const LIMIT = { num: 20, value: 64, len: 40 };
    function evalTree(t) {
      if (!t.op) return t.n;
      const a = evalTree(t.l), b = evalTree(t.r);
      return t.op === '+' ? a + b : a * b;
    }
    // 表示用の文字列。グラフの形が分かるように、右側の同じ演算にも括弧を付ける
    function showTree(t) {
      if (!t.op) return String(t.n);
      const wrap = (u, right) => (u.op && ((u.op === '+' && t.op === '*') || (right && u.op === t.op))) ? '(' + showTree(u) + ')' : showTree(u);
      return wrap(t.l, false) + (t.op === '+' ? ' + ' : ' × ') + wrap(t.r, true);
    }
    function parseExpr(text) {
      const s = String(text)
        .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[×xX＊]/g, '*').replace(/＋/g, '+').replace(/（/g, '(').replace(/）/g, ')')
        .replace(/\s+/g, '');
      if (!s) throw new Error('式が空です');
      if (s.length > LIMIT.len) throw new Error('式が長すぎます（' + LIMIT.len + ' 文字まで）');
      let i = 0;
      function expr() {
        let t = term();
        while (s[i] === '+') { i++; t = { op: '+', l: t, r: term() }; }
        return t;
      }
      function term() {
        let t = fac();
        while (s[i] === '*') { i++; t = { op: '*', l: t, r: fac() }; }
        return t;
      }
      function fac() {
        if (s[i] === '(') {
          i++;
          const t = expr();
          if (s[i] !== ')') throw new Error((i + 1) + ' 文字目に ) が要ります');
          i++;
          return t;
        }
        const m = /^\d+/.exec(s.slice(i));
        if (!m) throw new Error((i + 1) + ' 文字目に数が要ります');
        i += m[0].length;
        const n = Number(m[0]);
        if (n > LIMIT.num) throw new Error('数は ' + LIMIT.num + ' までにしてください');
        return { n };
      }
      const t = expr();
      if (i < s.length) throw new Error((i + 1) + ' 文字目の「' + s[i] + '」は使えません');
      (function check(u) {
        if (evalTree(u) > LIMIT.value) throw new Error('途中の数と答えは ' + LIMIT.value + ' までにしてください（数の分だけ +1 の節点を並べるため）');
        if (u.op) { check(u.l); check(u.r); }
      })(t);
      return t;
    }

    // ---- interaction net ----
    // 節点の種類と補助の口の数。口 0 が主の口（OUT は答えの受け口で、主の口を持たない）
    const ARITY = { Z: 0, S: 1, ADD: 2, MUL: 2, DUP: 2, ERA: 0, OUT: 0 };
    function newNet() { return { nodes: new Map(), next: 1, fresh: [], born: [], died: [], count: 0, out: 0 }; }
    function mk(net, k) {
      const nd = { id: net.next++, k, p: new Array(ARITY[k] + 1).fill(null) };
      net.nodes.set(nd.id, nd);
      return nd;
    }
    // 2つの口を線でつなぐ。両方が主の口なら、書き換えられる組として控える
    function link(net, a, pa, b, pb) {
      a.p[pa] = [b.id, pb];
      b.p[pb] = [a.id, pa];
      if (pa === 0 && pb === 0 && a.k !== 'OUT' && b.k !== 'OUT') net.fresh.push({ a: a.id, b: b.id });
    }
    // 外へ出ている線の端 e = [節点, 口] に、新しい節点の口をつなぐ
    function attach(net, nd, port, e, dying) {
      if (!e || dying.has(e[0])) throw new Error('組の中で輪になった線は扱えません');
      link(net, nd, port, net.nodes.get(e[0]), e[1]);
    }
    function join(net, e1, e2, dying) {
      if (!e1 || !e2 || dying.has(e1[0]) || dying.has(e2[0])) throw new Error('組の中で輪になった線は扱えません');
      link(net, net.nodes.get(e1[0]), e1[1], net.nodes.get(e2[0]), e2[1]);
    }
    // 式の木からグラフを作る。数 n は +1 を n 個つないだ列の下に 0 を置く
    function buildNet(tree) {
      const net = newNet();
      function num(n) {
        let top = mk(net, 'Z');
        for (let i = 0; i < n; i++) { const s = mk(net, 'S'); link(net, s, 1, top, 0); top = s; }
        return [top, 0];
      }
      function go(t) {
        if (!t.op) return num(t.n);
        const l = go(t.l), r = go(t.r);
        const op = mk(net, t.op === '+' ? 'ADD' : 'MUL');
        link(net, op, 0, l[0], l[1]);   // 主の口は1つ目の数を向く
        link(net, op, 1, r[0], r[1]);
        return [op, 2];                  // 口 2 から答えを出す
      }
      const res = go(tree);
      const out = mk(net, 'OUT');
      link(net, out, 0, res[0], res[1]);
      net.out = out.id;
      const init = net.fresh;
      net.fresh = [];
      return { net, init };
    }
    // 組を1つ書き換え、新しくできた組の配列を返す
    function rewrite(net, pair) {
      let x = net.nodes.get(pair.a), y = net.nodes.get(pair.b);
      if (!x || !y) throw new Error('もう無い節点の組です');
      if (x.k === 'Z' || x.k === 'S') { const t = x; x = y; y = t; }   // x を演算、y を数にそろえる
      if (y.k !== 'Z' && y.k !== 'S') throw new Error('決まりの無い組です: ' + x.k + ' と ' + y.k);
      const dying = new Set([x.id, y.id]);
      const zero = y.k === 'Z', rest = zero ? null : y.p[1];   // rest は「1 + rest」の rest
      const born = (k) => { const nd = mk(net, k); net.born.push([nd.id, x.id, y.id]); return nd; };
      net.fresh = [];
      switch (x.k) {
        case 'ADD':   // 0 + y = y、(1 + x) + y = 1 + (x + y)
          if (zero) join(net, x.p[1], x.p[2], dying);
          else {
            const s = born('S'), a = born('ADD');
            attach(net, s, 0, x.p[2], dying);
            link(net, s, 1, a, 2);
            attach(net, a, 0, rest, dying);
            attach(net, a, 1, x.p[1], dying);
          }
          break;
        case 'MUL':   // 0 × y = 0（y は消す）、(1 + x) × y = x × y + y（y は写す）
          if (zero) {
            attach(net, born('ERA'), 0, x.p[1], dying);
            attach(net, born('Z'), 0, x.p[2], dying);
          } else {
            const d = born('DUP'), m = born('MUL'), a = born('ADD');
            attach(net, d, 0, x.p[1], dying);
            attach(net, m, 0, rest, dying);
            link(net, m, 1, d, 1);
            link(net, a, 0, m, 2);
            link(net, a, 1, d, 2);
            attach(net, a, 2, x.p[2], dying);
          }
          break;
        case 'DUP':   // 数を2つに写す
          if (zero) {
            attach(net, born('Z'), 0, x.p[1], dying);
            attach(net, born('Z'), 0, x.p[2], dying);
          } else {
            const s1 = born('S'), s2 = born('S'), d = born('DUP');
            attach(net, s1, 0, x.p[1], dying);
            attach(net, s2, 0, x.p[2], dying);
            attach(net, d, 0, rest, dying);
            link(net, d, 1, s1, 1);
            link(net, d, 2, s2, 1);
          }
          break;
        case 'ERA':   // 数を消す
          if (!zero) attach(net, born('ERA'), 0, rest, dying);
          break;
        default:
          throw new Error('決まりの無い組です: ' + x.k + ' と ' + y.k);
      }
      net.nodes.delete(x.id);
      net.nodes.delete(y.id);
      net.died.push(x.id, y.id);
      net.count++;
      const made = net.fresh;
      net.fresh = [];
      return made;
    }
    // 答えの受け口から +1 を数える。done は 0 まで届いたか（途中なら、そこまでに出た +1 の数）
    function decode(net) {
      const out = net.nodes.get(net.out);
      let e = out ? out.p[0] : null, v = 0;
      while (e) {
        const nd = net.nodes.get(e[0]);
        if (!nd || e[1] !== 0) break;
        if (nd.k === 'Z') return { v, done: true };
        if (nd.k !== 'S') break;
        v++;
        e = nd.p[1];
      }
      return { v, done: false };
    }

    // ---- 書き換える順番 ----
    // 決まった種から同じ乱数の列を作る（mulberry32）
    function rng(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    // mode: fifo（古い組から1つずつ）、rand（ばらばらに1つずつ）、par（全部同時に）、tiles（k 枚のタイルが分け合う）
    function makeRunner(tree, mode, opt) {
      opt = opt || {};
      const { net, init } = buildNet(tree);
      const k = mode === 'tiles' ? Math.max(1, (opt.k | 0) || 4) : 1;
      const cols = Math.ceil(Math.sqrt(k));
      const rand = rng(opt.seed || 1);
      const queues = Array.from({ length: k }, () => []);
      queues[0].push(...init);   // 最初の仕事は全部タイル 0 が持つ
      const nb = (t) => {
        const r = Math.floor(t / cols), c = t % cols, out = [];
        if (c > 0) out.push(t - 1);
        if (c < cols - 1 && t + 1 < k) out.push(t + 1);
        if (r > 0) out.push(t - cols);
        if (t + cols < k) out.push(t + cols);
        return out;
      };
      const R = { net, mode, k, cols, queues, steps: 0, ready: [], tiles: null, nb };
      R.pending = () => queues.reduce((s, q) => s + q.length, 0);
      R.done = () => R.pending() === 0;
      const doOne = (pr, tile, how, did, made) => {
        did.push({ a: pr.a, b: pr.b, ka: net.nodes.get(pr.a).k, kb: net.nodes.get(pr.b).k, tile, how });
        made.push(...rewrite(net, pr));
      };
      R.step = () => {
        net.born = []; net.died = [];
        const did = [];
        if (R.done()) return did;
        R.ready.push(R.pending());
        if (mode !== 'tiles') {
          const q = queues[0];
          let batch;
          if (mode === 'par') batch = q.splice(0);   // 今ある組を全部。新しくできた組は次の手へ回す
          else if (mode === 'rand') batch = q.splice(Math.floor(rand() * q.length), 1);
          else batch = q.splice(0, 1);
          const made = [];
          for (const pr of batch) doOne(pr, 0, 'own', did, made);
          q.push(...made);
        } else {
          const run = new Array(k).fill(null), how = new Array(k).fill('idle');
          // 1. 自分の仕事があれば、いちばん新しいものをする
          for (let t = 0; t < k; t++) if (queues[t].length) { run[t] = queues[t].pop(); how[t] = 'own'; }
          // 2. 無ければ、余っている仕事がいちばん多い隣から、いちばん古いものをもらう
          for (let t = 0; t < k; t++) {
            if (run[t]) continue;
            let best = -1;
            for (const u of nb(t)) if (queues[u].length && (best < 0 || queues[u].length > queues[best].length)) best = u;
            if (best >= 0) { run[t] = queues[best].shift(); how[t] = 'steal'; }
          }
          // 3. それも無ければ休む。新しくできた組は、作ったタイルの仕事になる
          const made = queues.map(() => []);
          for (let t = 0; t < k; t++) if (run[t]) doOne(run[t], t, how[t], did, made[t]);
          for (let t = 0; t < k; t++) queues[t].push(...made[t]);
          R.tiles = how.map((h, t) => ({ how: h, q: queues[t].length }));
        }
        R.steps++;
        return did;
      };
      return R;
    }
    // 最後まで書き換えて、答え・書き換えた回数・手数を返す
    function runAll(tree, mode, opt) {
      const R = makeRunner(tree, mode, opt);
      let maxNodes = R.net.nodes.size, guard = 0;
      while (!R.done()) {
        R.step();
        if (R.net.nodes.size > maxNodes) maxNodes = R.net.nodes.size;
        if (++guard > 200000) throw new Error('終わりませんでした');
      }
      const ans = decode(R.net);
      let maxReady = 0;
      for (const v of R.ready) if (v > maxReady) maxReady = v;
      return { value: ans.done ? ans.v : null, interactions: R.net.count, steps: R.steps, maxReady, nodes: R.net.nodes.size, maxNodes };
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    if (window.THUMB) document.documentElement.classList.add('thumb');
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const cv = $('cv'), rd = $('rd'), form = $('f'), exIn = $('ex'), preSel = $('pre'), modeSel = $('mode'), spdSel = $('spd');
    const oneBtn = $('one'), autoSw = $('auto'), resetBtn = $('reset'), tilesEl = $('tiles'), tlgEl = $('tlg');
    const msgEl = $('msg'), stEl = $('st'), tbEl = $('tb');
    const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';
    const COL = { fg: cssVar('--fg'), mut: cssVar('--mut'), wire: cssVar('--wire'), num: cssVar('--num'), op: cssVar('--op'), dup: cssVar('--dup'), out: cssVar('--out'), act: cssVar('--act'), bg: cssVar('--bg') };
    const FILL = { Z: COL.num, S: COL.num, ADD: COL.op, MUL: COL.op, DUP: COL.dup, ERA: COL.dup, OUT: COL.out };
    const LABEL = { Z: '0', S: '+1', ADD: '+', MUL: '×', DUP: 'δ', ERA: 'ε', OUT: '答' };
    // 口の向き。1 は下にある数を受け取る口、-1 は上へ値を渡す口。図では受け取る側を上に置く
    const DIR = { Z: [-1], S: [-1, 1], ADD: [1, 1, -1], MUL: [1, 1, -1], DUP: [1, -1, -1], ERA: [1], OUT: [1] };
    const MODES = {
      fifo: { name: '古い組から1つずつ', mode: 'fifo', opt: {} },
      rand: { name: 'ばらばらに1つずつ', mode: 'rand', opt: { seed: 7 } },
      t4: { name: 'タイル 4 枚', mode: 'tiles', opt: { k: 4 } },
      t16: { name: 'タイル 16 枚', mode: 'tiles', opt: { k: 16 } },
      par: { name: '全部同時に', mode: 'par', opt: {} },
    };
    const OPS = new Set(['ADD', 'MUL', 'DUP', 'ERA']);
    const RULE = {
      'ADD-Z': '0 + y = y。＋ と 0 が消え、y が答えの側へつながった',
      'ADD-S': '(1 + x) + y = 1 + (x + y)。+1 を1つ答えの側へ送り出した',
      'MUL-Z': '0 × y = 0。y は消去の節点 ε に渡した',
      'MUL-S': '(1 + x) × y = x × y + y。y を複製の節点 δ で2つに写す',
      'DUP-Z': '複製 δ が 0 を2つに写した',
      'DUP-S': '複製 δ が +1 を1つ写し、残りを写し続ける',
      'ERA-Z': '消去 ε が 0 を消した',
      'ERA-S': '消去 ε が +1 を1つ消し、残りを消し続ける',
    };
    const tileHue = (t, k) => 'hsl(' + (Math.round((t * 360) / Math.max(1, k)) + 20) % 360 + ' 80% 64%)';
    let tree = null, R = null, pos = new Map(), flash = new Map();
    let timer = 0, nextTimer = 0, raf = 0, seed = 1, peak = 0;

    function sizeOf(c) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, c.clientWidth), h = Math.max(1, c.clientHeight);
      return { dpr, w, h, W: Math.max(1, Math.round(w * dpr)), H: Math.max(1, Math.round(h * dpr)) };
    }
    function geo(z) {
      const L = Math.max(14, Math.min(34, Math.min(z.w, z.h * 1.4) / 13));
      return { L, r: Math.max(6, Math.min(12, L * 0.36)) };
    }

    // 最初の並べ方: 答えの受け口から下へ、受け取る口をたどって木の形に置く
    function treeLayout() {
      const net = R.net, z = sizeOf(cv), { L } = geo(z);
      const depth = new Map(), xs = new Map();
      let leaves = 0, maxD = 0;
      (function visit(id, d) {
        depth.set(id, d);
        if (d > maxD) maxD = d;
        const nd = net.nodes.get(id), dir = DIR[nd.k], kids = [];
        for (let i = 0; i < nd.p.length; i++) {
          const e = nd.p[i];
          if (dir[i] === 1 && e && !depth.has(e[0])) kids.push(e[0]);
        }
        if (!kids.length) { xs.set(id, leaves++); return; }
        let s = 0;
        for (const c of kids) { visit(c, d + 1); s += xs.get(c); }
        xs.set(id, s / kids.length);
      })(net.out, 0);
      pos = new Map(); flash = new Map();
      const dy = Math.min(L, Math.max(4, (z.h - 36) / Math.max(1, maxD)));
      for (const nd of net.nodes.values()) {
        const known = depth.has(nd.id);
        const x = known ? 20 + (xs.get(nd.id) + 0.5) / Math.max(1, leaves) * Math.max(1, z.w - 40) : z.w / 2;
        const y = known ? 18 + depth.get(nd.id) * dy : z.h / 2;
        pos.set(nd.id, { x: x + (Math.random() - 0.5) * 2, y, vx: 0, vy: 0 });
      }
    }

    // 力で並べ直す: 節点どうしは離れ、線はばねで引き合い、受け取る側を上に保つ
    function physics(z) {
      const { L, r } = geo(z), net = R.net, P = [];
      for (const id of net.nodes.keys()) { const p = pos.get(id); if (p) P.push(p); }
      const n = P.length, rep = L * L * 0.9, far = 16 * L * L;
      for (let i = 0; i < n; i++) {
        const a = P[i];
        for (let j = i + 1; j < n; j++) {
          const b = P[j];
          let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 > far) continue;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy + 0.01; }
          const d = Math.sqrt(d2), f = Math.min(4, rep / d2);
          const fx = dx / d * f, fy = dy / d * f;
          a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
        }
      }
      for (const nd of net.nodes.values()) {
        const a = pos.get(nd.id);
        if (!a) continue;
        const dir = DIR[nd.k];
        for (let i = 0; i < nd.p.length; i++) {
          const e = nd.p[i];
          if (!e || dir[i] !== 1) continue;   // 線は、受け取る口の側から1回だけ数える
          const b = pos.get(e[0]);
          if (!b) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(0.1, Math.hypot(dx, dy));
          const f = (d - L) * 0.05;
          a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
          const gap = dy - L * 0.55;
          if (gap < 0) { a.vy += gap * 0.04; b.vy -= gap * 0.04; }
        }
      }
      let E = 0;
      const x0 = r + 2, x1 = Math.max(x0, z.w - r - 2), y0 = r + 2, y1 = Math.max(y0, z.h - r - 2);
      for (const p of P) {
        p.vx += (z.w / 2 - p.x) * 0.0015;
        p.vx *= 0.78; p.vy *= 0.78;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 12) { p.vx *= 12 / sp; p.vy *= 12 / sp; }
        p.x = Math.min(x1, Math.max(x0, p.x + p.vx));
        p.y = Math.min(y1, Math.max(y0, p.y + p.vy));
        E += p.vx * p.vx + p.vy * p.vy;
      }
      const o = pos.get(net.out);
      if (o) { o.x = z.w / 2; o.y = Math.min(y1, r + 6); o.vx = 0; o.vy = 0; }
      return E / Math.max(1, n);
    }

    function draw() {
      const z = sizeOf(cv);
      if (cv.width !== z.W) cv.width = z.W;
      if (cv.height !== z.H) cv.height = z.H;
      const g = cv.getContext('2d');
      g.setTransform(z.dpr, 0, 0, z.dpr, 0, 0);
      g.clearRect(0, 0, z.w, z.h);
      if (!R) return;
      const { r } = geo(z), net = R.net, now = performance.now();
      const owner = new Map();   // 書き換えられる組を、どのタイルが持っているか
      if (R.mode === 'tiles') R.queues.forEach((q, t) => { for (const pr of q) { owner.set(pr.a, t); owner.set(pr.b, t); } });
      g.lineCap = 'round';
      for (const nd of net.nodes.values()) {
        const a = pos.get(nd.id);
        if (!a) continue;
        const dir = DIR[nd.k];
        for (let i = 0; i < nd.p.length; i++) {
          const e = nd.p[i];
          if (!e || dir[i] !== 1) continue;
          const b = pos.get(e[0]);
          if (!b) continue;
          if (i === 0 && e[1] === 0 && nd.k !== 'OUT') {
            const t = owner.get(nd.id);
            g.strokeStyle = R.mode === 'tiles' && t !== undefined ? tileHue(t, R.k) : COL.act;
            g.lineWidth = 4;
          } else {
            g.strokeStyle = COL.wire;
            g.lineWidth = 1.4;
          }
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '600 ' + Math.round(r * 1.05) + 'px system-ui, sans-serif';
      for (const nd of net.nodes.values()) {
        const a = pos.get(nd.id);
        if (!a) continue;
        const fl = flash.get(nd.id);
        if (fl !== undefined) {
          const k = 1 - (now - fl) / 600;
          if (k > 0) {
            g.globalAlpha = k * 0.55; g.fillStyle = COL.fg;
            g.beginPath(); g.arc(a.x, a.y, r + 5, 0, Math.PI * 2); g.fill();
            g.globalAlpha = 1;
          } else flash.delete(nd.id);
        }
        g.fillStyle = FILL[nd.k];
        g.beginPath(); g.arc(a.x, a.y, nd.k === 'OUT' ? r * 1.25 : r, 0, Math.PI * 2); g.fill();
        g.fillStyle = COL.bg;
        g.fillText(LABEL[nd.k], a.x, a.y + 0.5);
        if (nd.k !== 'OUT' && nd.p[0]) {   // 主の口の向きに点を打つ
          const b = pos.get(nd.p[0][0]);
          if (b) {
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(0.1, Math.hypot(dx, dy));
            g.fillStyle = COL.fg;
            g.beginPath(); g.arc(a.x + dx / d * r, a.y + dy / d * r, Math.max(1.6, r * 0.24), 0, Math.PI * 2); g.fill();
          }
        }
      }
    }

    function drawReady() {
      const z = sizeOf(rd);
      if (rd.width !== z.W) rd.width = z.W;
      if (rd.height !== z.H) rd.height = z.H;
      const g = rd.getContext('2d');
      g.setTransform(z.dpr, 0, 0, z.dpr, 0, 0);
      g.clearRect(0, 0, z.w, z.h);
      if (!R) return;
      const a = R.ready, n = a.length;
      let mx = 1;
      for (const v of a) if (v > mx) mx = v;
      const padL = 26, w = Math.max(1, z.w - padL - 4), h = Math.max(1, z.h - 18);
      const bw = w / Math.max(n, 24);
      g.fillStyle = COL.act;
      for (let i = 0; i < n; i++) {
        const bh = a[i] / mx * h;
        g.fillRect(padL + i * bw, 4 + h - bh, Math.max(0.6, bw - (bw > 3 ? 1 : 0)), bh);
      }
      g.fillStyle = COL.mut; g.font = '10px system-ui, sans-serif';
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(String(mx), padL - 4, 9);
      g.fillText('0', padL - 4, 4 + h);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillText('手 →', padL, z.h - 2);
    }

    function renderStats() {
      const net = R.net, ans = decode(net);
      let answer;
      if (R.done()) answer = ans.done ? String(ans.v) : '出なかった';
      else answer = ans.v ? '+1 が ' + ans.v + ' 個まで出た（計算中）' : 'まだ出ていない';
      const rows = [
        ['式', showTree(tree) + ' = ' + evalTree(tree)],
        ['答え（グラフから読んだ値）', answer],
        ['書き換えた回数', String(net.count)],
        ['手数', String(R.steps)],
        ['今書き換えられる組', R.pending() + ' 組'],
        ['節点の数', net.nodes.size + ' 個（いちばん多いとき ' + peak + ' 個）'],
      ];
      stEl.replaceChildren();
      for (const [k, v] of rows) {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = k; dd.textContent = v;
        stEl.append(dt, dd);
      }
    }
    function buildTiles() {
      const isT = R.mode === 'tiles';
      tilesEl.hidden = !isT; tlgEl.hidden = !isT;
      tilesEl.replaceChildren();
      if (!isT) return;
      tilesEl.style.setProperty('--cols', R.cols);
      for (let t = 0; t < R.k; t++) {
        const d = document.createElement('div'), a = document.createElement('span'), b = document.createElement('span');
        d.className = 'tile';
        d.style.setProperty('--hue', tileHue(t, R.k));
        a.textContent = 'タイル ' + t;
        d.append(a, b);
        tilesEl.append(d);
      }
    }
    function renderTiles() {
      if (R.mode !== 'tiles') return;
      const word = { own: '自分の仕事', steal: 'もらった', idle: '休み' };
      Array.from(tilesEl.children).forEach((d, t) => {
        const how = R.tiles ? R.tiles[t].how : 'idle';
        d.className = 'tile ' + how;
        d.lastChild.textContent = (R.steps ? word[how] : '待ち') + ' ・ ' + R.queues[t].length;
      });
    }
    function update() { renderStats(); renderTiles(); drawReady(); }

    function renderTable() {
      tbEl.replaceChildren();
      for (const [key, m] of Object.entries(MODES)) {
        const r = runAll(tree, m.mode, m.opt);
        const tr = document.createElement('tr');
        tr.dataset.k = key;
        const cells = [m.name, r.value === null ? '-' : String(r.value), String(r.interactions), String(r.steps), (r.interactions / Math.max(1, r.steps)).toFixed(1)];
        cells.forEach((c, i) => {
          const el = document.createElement(i ? 'td' : 'th');
          if (!i) el.scope = 'row';
          el.textContent = c;
          tr.append(el);
        });
        tbEl.append(tr);
      }
      markRow();
    }
    function markRow() { for (const tr of tbEl.children) tr.classList.toggle('cur', tr.dataset.k === modeSel.value); }

    function frame() {
      raf = 0;
      if (!R) return;
      const z = sizeOf(cv);
      let e = 0;
      for (let i = 0; i < 2; i++) e = physics(z);
      draw();
      if (e > 0.004 || flash.size || (timer && autoSw.checked)) raf = requestAnimationFrame(frame);
    }
    function kick() {
      if (!R) return;
      if (calm.matches && !window.THUMB) {   // 動きを減らす設定では、並べ終えた形だけを描く
        const z = sizeOf(cv);
        for (let i = 0; i < 300; i++) if (physics(z) < 0.004) break;
        flash.clear();
        draw();
        return;
      }
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function ruleOf(d) {
      const op = OPS.has(d.ka) ? d.ka : d.kb, nm = op === d.ka ? d.kb : d.ka;
      return RULE[op + '-' + nm] || '';
    }
    function stepText(did) {
      const n = R.steps;
      if (R.mode === 'tiles') {
        let own = 0;
        for (const d of did) if (d.how === 'own') own++;
        return n + ' 手目: ' + did.length + ' 組を同時に書き換えた。自分の仕事をしたタイルが ' + own + ' 枚、隣から仕事をもらったタイルが ' + (did.length - own) + ' 枚、休んだタイルが ' + (R.k - did.length) + ' 枚。';
      }
      if (R.mode === 'par') return n + ' 手目: 重ならない ' + did.length + ' 組を同時に書き換えた。' + (did.length === 1 ? ruleOf(did[0]) + '。' : '');
      return n + ' 手目: ' + ruleOf(did[0]) + '。';
    }
    function doStep() {
      const z = sizeOf(cv), did = R.step(), now = performance.now();
      for (const [id, a, b] of R.net.born) {
        const pa = pos.get(a) || pos.get(b) || { x: z.w / 2, y: z.h / 2 }, pb = pos.get(b) || pa;
        pos.set(id, { x: (pa.x + pb.x) / 2 + (Math.random() - 0.5) * 10, y: (pa.y + pb.y) / 2 + (Math.random() - 0.5) * 10, vx: 0, vy: 0 });
        flash.set(id, now);
      }
      for (const id of R.net.died) { pos.delete(id); flash.delete(id); }
      if (R.net.nodes.size > peak) peak = R.net.nodes.size;
      msgEl.textContent = stepText(did);
      update();
      kick();
    }
    function finish() {
      const net = R.net, ans = decode(net), avg = net.count / Math.max(1, R.steps);
      let s = 'グラフから読んだ答えは ' + (ans.done ? ans.v : '?') + '（式の値は ' + evalTree(tree) + '）。' + net.count + ' 回の書き換えを ' + R.steps + ' 手で終えた。1手あたり平均 ' + avg.toFixed(1) + ' 組。';
      if (R.mode === 'tiles') s += 'タイルが働いていた割合は ' + Math.round(net.count / Math.max(1, R.steps * R.k) * 100) + '%。';
      s += '表のとおり、どの順番でも答えと書き換えた回数は同じで、手数だけが違う。';
      msgEl.textContent = s;
      update();
      clearTimeout(nextTimer);
      if (autoSw.checked) nextTimer = setTimeout(restart, window.THUMB ? 2000 : 3500);
    }
    function tick() {
      timer = 0;
      if (!R) return;
      if (R.done()) { finish(); return; }
      doStep();
      if (R.done()) finish();
      else if (autoSw.checked) timer = setTimeout(tick, +spdSel.value);
    }
    function restart() {
      clearTimeout(timer); clearTimeout(nextTimer); timer = 0;
      if (!tree) return;
      const m = MODES[modeSel.value];
      R = makeRunner(tree, m.mode, m.mode === 'rand' ? { seed: seed++ } : m.opt);
      peak = R.net.nodes.size;
      treeLayout();
      buildTiles();
      msgEl.textContent = '「' + showTree(tree) + '」のグラフを作った。書き換えられる組が ' + R.pending() + ' 組ある。';
      update();
      kick();
      if (autoSw.checked) timer = setTimeout(tick, Math.max(500, +spdSel.value));
    }
    function apply(src) {
      let t;
      try {
        t = parseExpr(src);
        const r = runAll(t, 'par', {});
        if (r.maxNodes > 420) throw new Error('途中の節点が ' + r.maxNodes + ' 個になり、図が読めなくなります。小さい数にしてください');
      } catch (err) {
        msgEl.textContent = 'この式は使えません: ' + err.message;
        return;
      }
      tree = t;
      renderTable();
      restart();
    }

    form.addEventListener('submit', (ev) => { ev.preventDefault(); preSel.value = ''; apply(exIn.value); });
    preSel.addEventListener('change', () => { if (preSel.value) { exIn.value = preSel.value; apply(preSel.value); } });
    modeSel.addEventListener('change', () => { markRow(); restart(); });
    resetBtn.addEventListener('click', restart);
    oneBtn.addEventListener('click', () => {
      autoSw.checked = false;
      clearTimeout(timer); clearTimeout(nextTimer); timer = 0;
      if (!R) return;
      if (R.done()) { restart(); return; }
      doStep();
      if (R.done()) finish();
    });
    autoSw.addEventListener('change', () => {
      clearTimeout(timer); clearTimeout(nextTimer); timer = 0;
      if (!autoSw.checked || !R) return;
      if (R.done()) restart();
      else { timer = setTimeout(tick, 200); kick(); }
    });
    new ResizeObserver(() => { kick(); drawReady(); }).observe(document.querySelector('.wrap'));

    autoSw.checked = !!window.THUMB || !calm.matches;
    apply(exIn.value);
  },
});

dekiru.add({
  id: 'tr-20261122-mixed-quant', c: 'trend', lv: 3, date: '2026-11-22',
  t: '同じ大きさのまま、量子化のビット数を部品ごとに配り分けて、元との差を小さくする（LookAtMyQuant）',
  y: 'おなじおおきさのままりょうしかのびっとすうをぶひんごとにくばりわけてもととのさをちいさくするるっくあっとまいくおんと',
  tags: ['LookAtMyQuant', 'Inkling 2 Mini', '量子化', '動的計画法', 'Canvas'],
  d: '2026年11月20日、Thinking Machines が、ノートパソコンで動く言語モデル Inkling 2 Mini（重み 264 億個）を公開した。Hacker News では 1333 点を集めた。翌日、ShinMegamiBoson さんの量子化の道具 LookAtMyQuant が、このモデルの文章の部分の重みを 18.89 GB から 5.38 GB（重み1つあたり平均 1.63 ビット）に縮めたと発表し、こちらも Hacker News で 269 点を集めた。よく使われる量子化の形式は、ほとんどの行列を同じビット数で保存する。LookAtMyQuant は、モデルの部品を1つだけ圧縮したとき、モデル全体の出力がどれだけ悪くなるかを部品ごとに測る。そして、決めた大きさに収まる中で悪化の合計が最も小さくなるように、部品ごとに保存の仕方を選ぶ。解説のページには、Gemma 4 E2B で、llama.cpp の Q4_K_M と同じ大きさのまま、元のモデルとの差（KL）が 12 分の 1 になったと書かれている。この見本は、その考え方を小さなネットワークで再現する。開くと、3本の腕のうずまきを見分けるネットワーク（2→32→32→32→3、重み 2,208 個）をその場で学習させる。重みを 32 個ずつ 69 個の部品に分け、部品ごとに 0（消す）・1・2・3・4・6・8 ビットで量子化したときの悪化を、学習に使った点の上で全部測る。次に、全部の部品を同じビット数にしたときと同じバイト数の中で、悪化の合計が最も小さい配り方を動的計画法で求める。上の3つの図は、元のネットワーク・そろえた量子化・配分した量子化が平面をどう見分けるかを示し、学習に使っていない 360 点での正解率と、元との差（KL）を出す。下の図は、部品ごとの悪化と配ったビット数、それと大きさと KL の関係である。再現していない所: 本物は、言語モデルの行列、語の出現の多さで分けた埋め込みの区分、KV キャッシュを部品にして、トレリス符号など多くの保存の仕方から選ぶ。少しの部品を測った結果から残りの悪化を予測し、量子化の後に元のモデルを手本にした学習（蒸留）で直す。この見本の保存の仕方は、目盛り1つの一様な量子化と、部品を消すことの2つだけである。悪化は予測せずに全部測り、量子化の後の学習もしない。',
  p: '部品ごとの悪化は、重みが変わった層から後ろだけを計算し直して測る。行の部品なら、その行が受け持つ出口1つの値だけが変わるので、前の層までの計算は覚えておいた値をそのまま使える。配り方を決めるのは「部品ごとに保存の仕方を1つ選び、ビット数の合計を予算以下にして、悪化の合計を最小にする」問題である。ビット数を 16 ビット単位で数えると、部品の数 × 予算 × 選び方の数に比例する手間の動的計画法で、最適な組み合わせが求まる。ただし、これは「部品ごとの悪化は足し算できる」と仮定したときの最適である。表の「足し算の予想 → 実際」で、全部を同時に量子化して測り直した値と比べられる。3〜4 ビットあたりでは予想とほぼ合い、大きく削るほど予想から外れる。外れ方は、予想より悪くなることも、良くなることもある。入力の層の2つの部品（x の重み 32 個と y の重み 32 個）は、ほかの部品より何桁も大きく効くので、多くのビットを受け取る。ビット数が少ないときは、効かない出口の行を丸ごと消し、浮いたビットを効く部品へ回す。一様な量子化は、0 を持たない 2^b 段の値を等間隔に並べ、いちばん外の段の高さを、部品の重みの二乗誤差が最小になるように探す。部品ごとに 16 ビットの目盛りを持つので、そろえた b ビットは重み1つあたり b + 0.5 ビットになる。',
  refs: [
    { title: 'LookAtMyQuant（GitHub。README に Inkling-2-Mini の 5.4 GB 版の結果）', url: 'https://github.com/ShinMegamiBoson/lookatmyquant' },
    { title: 'LookAtMyQuant の解説（方法と Gemma 4 E2B の結果）', url: 'https://lookatmyquant.pages.dev' },
    { title: 'LookAtMyQuant 2（行ごとにビット数を配る作り方）', url: 'https://lookatmyquant2.pages.dev' },
    { title: 'Hacker News: Inkling-2-Mini in 5.4 GB Memory', url: 'https://news.ycombinator.com/item?id=50591853' },
    { title: 'Hacker News: Inkling 2 Mini', url: 'https://news.ycombinator.com/item?id=50581260' },
    { title: 'Thinking Machines の X の投稿（2026-11-20）', url: 'https://x.com/thinkymachines/status/2123871643797995872' },
  ],
  html: `<div class="wrap">
  <p id="msg" class="msg" role="status">学習の準備をしています</p>
  <div class="ctl">
    <label for="bits">そろえる側のビット数</label>
    <input type="range" id="bits" min="1" max="4" step="1" value="2">
    <output id="bitsv" for="bits">2 ビット</output>
  </div>
  <div class="ctl">
    <label><input type="checkbox" switch id="prune" checked> 部品を消す（0 ビット）も選べる</label>
    <button type="button" id="again">別の種で学習し直す</button>
  </div>
  <div class="panels">
    <figure><canvas id="c0" role="img" aria-label="元のネットワークが平面をどう見分けるかの図"></canvas><figcaption><b>元</b><small class="ex">（16 ビット）</small><span id="s0"></span></figcaption></figure>
    <figure><canvas id="c1" role="img" aria-label="全部の部品を同じビット数にしたネットワークの図"></canvas><figcaption><b id="h1">そろえた 2 ビット</b><span id="s1"></span></figcaption></figure>
    <figure><canvas id="c2" role="img" aria-label="ビット数を配り分けたネットワークの図"></canvas><figcaption><b>配分した</b><small class="ex">（同じ大きさ）</small><span id="s2"></span></figcaption></figure>
  </div>
  <p class="legend small mut"><span><i class="k0"></i><i class="k1"></i><i class="k2"></i>3本の腕（色が濃いほど自信がある）</span><span><i class="ng"></i>白い縁の点は、見分けを間違えた点</span></p>
  <p id="sum" class="sum"></p>
  <div class="box">
    <div class="hd">部品ごとの悪化と、配ったビット数</div>
    <canvas id="map" role="img" aria-label="部品ごとの悪化と配ったビット数の図"></canvas>
    <p class="small mut">橙の棒: その部品だけを 2 ビットにしたときの悪化（KL、対数目盛り。1 マス上がると 10 倍）。下の数: 配分で配ったビット数。× は 0 ビットで消した部品。入力の層は列（x と y の重み）、ほかの層は行（1つの出口に入る重み）を部品にした。</p>
  </div>
  <div class="box">
    <div class="hd">大きさと、元との差（KL、対数目盛り）</div>
    <canvas id="crv" role="img" aria-label="大きさと元との差の図"></canvas>
    <p class="legend small mut"><span><i class="u"></i>そろえた量子化（数はビット数）</span><span><i class="a"></i>配分した量子化</span><span><i class="cur"></i>今の大きさ</span></p>
  </div>
  <div class="tw" tabindex="0" role="region" aria-labelledby="cap">
    <table>
      <caption id="cap">同じ大きさでの比べ（KL と正解率は学習に使っていない 360 点で測った）</caption>
      <thead><tr><th scope="col">大きさ</th><th scope="col">そろえた KL</th><th scope="col">正解率</th><th scope="col">配分した KL</th><th scope="col">正解率</th><th scope="col">足し算の予想 → 実際</th><th scope="col">消した部品</th></tr></thead>
      <tbody id="tb"></tbody>
    </table>
  </div>
</div>`,
  css: `:root { color-scheme: dark; --bg: #10131a; --fg: #e4e8f0; --mut: #9aa3b6; --line: #2b3346; --panel: #161a23; --k0: #5fc8b0; --k1: #f0b45a; --k2: #b49cff; --uni: #f07a8a; --alloc: #6fb6ff; --dmg: #f08c5a; --act: #6fb6ff; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .wrap { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .ctl { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; margin: 0; }
    .ctl label { display: inline-flex; align-items: center; gap: 6px; }
    input[type="range"] { accent-color: var(--act); inline-size: 10em; margin: 0; cursor: pointer; }
    output { font-variant-numeric: tabular-nums; }
    button { font: inherit; min-block-size: 30px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; background: #1e2433; color: var(--fg); cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    :focus-visible { outline: 2px solid #ffd27a; outline-offset: 2px; }
    input[type="checkbox"][switch] { accent-color: var(--act); margin: 0; cursor: pointer; }
    .mut { color: var(--mut); }
    .small { font-size: 12px; margin: 0; }
    .msg { margin: 0; padding: 6px 8px; border-inline-start: 3px solid var(--act); background: var(--panel); border-radius: 4px; font-size: 13px; min-block-size: 1.5em; }
    .panels { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
    figure { margin: 0; display: flex; flex-direction: column; gap: 4px; }
    figcaption { font-size: 12px; line-height: 1.45; color: var(--mut); }
    figcaption b { color: var(--fg); font-weight: 600; }
    figcaption small { font-size: inherit; }
    figcaption span { display: block; font-variant-numeric: tabular-nums; }
    canvas { display: block; inline-size: 100%; background: #0b0d12; border-radius: 4px; }
    .panels canvas { aspect-ratio: 1; block-size: auto; }
    #map { block-size: 184px; }
    #crv { block-size: 220px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; }
    .legend i { display: inline-block; inline-size: 10px; block-size: 10px; border-radius: 50%; vertical-align: -1px; margin-inline-end: 4px; }
    .legend .k0 { background: var(--k0); margin-inline-end: 2px; }
    .legend .k1 { background: var(--k1); margin-inline-end: 2px; }
    .legend .k2 { background: var(--k2); }
    .legend .ng { background: transparent; border: 2px solid #fff; inline-size: 8px; block-size: 8px; }
    .legend .u { background: var(--uni); }
    .legend .a { inline-size: 16px; block-size: 3px; border-radius: 2px; vertical-align: middle; background: var(--alloc); }
    .legend .cur { inline-size: 0; block-size: 12px; border-radius: 0; border-inline-start: 2px dashed var(--fg); vertical-align: -2px; }
    .sum { margin: 0; font-size: 13px; line-height: 1.6; min-block-size: 1.6em; }
    .box { display: flex; flex-direction: column; gap: 4px; }
    .hd { font-size: 12px; color: var(--mut); }
    .tw { overflow-x: auto; }
    table { border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
    caption { text-align: start; color: var(--mut); padding-block-end: 4px; }
    th, td { padding: 3px 8px; border-block-end: 1px solid var(--line); text-align: end; white-space: nowrap; }
    th[scope="row"], thead th:first-child { text-align: start; font-weight: 400; }
    thead th { color: var(--mut); font-weight: 400; }
    tr.cur th, tr.cur td { background: #22293a; }
    tr.cur th[scope="row"] { font-weight: 600; }
    .thumb .wrap { padding: 4px; gap: 4px; }
    .thumb .ctl, .thumb .legend, .thumb .sum, .thumb .box, .thumb .tw { display: none; }
    .thumb .msg { font-size: 11px; padding: 2px 6px; }
    .thumb .panels { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
    .thumb figcaption { font-size: 10px; }
    .thumb .ex { display: none; }`,
  core() {
    // ---- 乱数（種から同じ列が出る） ----
    function rng(seed) {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function gauss(r) {
      const u = Math.max(1e-12, r());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
    }

    // ---- 3本の腕のうずまき（平面の点と、0・1・2 の組） ----
    function makeSpiral(seed, perClass) {
      const r = rng(seed), K = 3, n = perClass * K;
      const X = new Float64Array(n * 2), Y = new Int32Array(n);
      for (let k = 0; k < K; k++) {
        for (let i = 0; i < perClass; i++) {
          const j = k * perClass + i;
          const t = (i + r()) / perClass;
          const rad = 0.08 + 0.92 * t;
          const ang = k * 2 * Math.PI / K + t * 4.2 + gauss(r) * 0.13;
          X[j * 2] = rad * Math.cos(ang);
          X[j * 2 + 1] = rad * Math.sin(ang);
          Y[j] = k;
        }
      }
      return { X, Y, n };
    }

    // ---- 小さなネットワーク 2 → 32 → 32 → 32 → 3（間は tanh、最後は softmax） ----
    const SIZES = [2, 32, 32, 32, 3];
    const FLOAT_BITS = 16, SCALE_BITS = 16;
    function initNet(seed) {
      const r = rng(seed), layers = [];
      for (let l = 0; l + 1 < SIZES.length; l++) {
        const nin = SIZES[l], nout = SIZES[l + 1];
        const W = new Float64Array(nin * nout), b = new Float64Array(nout);
        const sd = Math.sqrt(1 / nin) * (l === 0 ? 2.5 : 1);
        for (let i = 0; i < W.length; i++) W[i] = gauss(r) * sd;
        layers.push({ nin, nout, W, b });
      }
      return layers;
    }
    function cloneNet(net) {
      return net.map((L) => ({ nin: L.nin, nout: L.nout, W: Float64Array.from(L.W), b: Float64Array.from(L.b) }));
    }
    function makeActs() { return SIZES.map((n) => new Float64Array(n)); }
    function softmax(z) {
      let m = -Infinity;
      for (let i = 0; i < z.length; i++) if (z[i] > m) m = z[i];
      const p = new Float64Array(z.length);
      let s = 0;
      for (let i = 0; i < z.length; i++) { p[i] = Math.exp(z[i] - m); s += p[i]; }
      for (let i = 0; i < z.length; i++) p[i] /= s;
      return p;
    }
    // 1点を流して確率を返す。acts を渡すと、各層の出力（tanh の後。最後の層は softmax の前）をそこに入れる
    function forward(net, x0, x1, acts) {
      const A = acts || makeActs();
      A[0][0] = x0; A[0][1] = x1;
      const last = net.length - 1;
      for (let l = 0; l <= last; l++) {
        const L = net[l], a = A[l], o = A[l + 1];
        for (let r = 0; r < L.nout; r++) {
          let s = L.b[r];
          const base = r * L.nin;
          for (let j = 0; j < L.nin; j++) s += L.W[base + j] * a[j];
          o[r] = l === last ? s : Math.tanh(s);
        }
      }
      return softmax(A[last + 1]);
    }

    // ---- 学習（Adam。32 点ずつの束で、正解の確率を少しならす）。step(k, lr) を何度も呼んで少しずつ進める ----
    function makeTrainer(net, data, seed) {
      const r = rng(seed ^ 0x5bd1e995);
      const zeros = () => net.map((L) => ({ W: new Float64Array(L.W.length), b: new Float64Array(L.b.length) }));
      const m = zeros(), v = zeros(), g = zeros();
      const acts = makeActs(), deltas = SIZES.map((n) => new Float64Array(n));
      const B = 32, SMOOTH = 0.1;
      let t = 0;
      function step(k, lr) {
        let lossSum = 0;
        for (let it = 0; it < k; it++) {
          for (const G of g) { G.W.fill(0); G.b.fill(0); }
          let loss = 0;
          for (let bi = 0; bi < B; bi++) {
            const j = Math.floor(r() * data.n);
            const p = forward(net, data.X[j * 2], data.X[j * 2 + 1], acts);
            loss -= Math.log(Math.max(1e-12, p[data.Y[j]]));
            const dl = deltas[net.length];
            for (let c = 0; c < p.length; c++) dl[c] = p[c] - (c === data.Y[j] ? 1 - SMOOTH * (p.length - 1) / p.length : SMOOTH / p.length);
            for (let l = net.length - 1; l >= 0; l--) {
              const L = net[l], d = deltas[l + 1], a = acts[l], G = g[l];
              for (let o = 0; o < L.nout; o++) {
                const dv = d[o];
                G.b[o] += dv;
                const base = o * L.nin;
                for (let i = 0; i < L.nin; i++) G.W[base + i] += dv * a[i];
              }
              if (l > 0) {
                const dp = deltas[l];
                for (let i = 0; i < L.nin; i++) {
                  let s = 0;
                  for (let o = 0; o < L.nout; o++) s += L.W[o * L.nin + i] * d[o];
                  dp[i] = s * (1 - a[i] * a[i]);
                }
              }
            }
          }
          t++;
          const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
          for (let l = 0; l < net.length; l++) {
            for (const key of ['W', 'b']) {
              const P = net[l][key], G = g[l][key], M = m[l][key], V = v[l][key];
              for (let i = 0; i < P.length; i++) {
                const gi = G[i] / B;
                M[i] = b1 * M[i] + (1 - b1) * gi;
                V[i] = b2 * V[i] + (1 - b2) * gi * gi;
                P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8);
              }
            }
          }
          lossSum += loss / B;
        }
        return lossSum / Math.max(1, k);
      }
      return { step, get t() { return t; } };
    }

    // ---- 部品（量子化の単位）: 重み 32 個と、16 ビットの目盛り1つ ----
    // 入力の層は列（x の重み 32 個と y の重み 32 個）、ほかの層は行（1つの出口に入る重み）を部品にする
    function makePieces(net) {
      const out = [];
      net.forEach((L, l) => {
        if (l === 0) {
          for (let c = 0; c < L.nin; c++) {
            const idx = new Int32Array(L.nout);
            for (let r = 0; r < L.nout; r++) idx[r] = r * L.nin + c;
            out.push({ layer: l, kind: 'col', k: c, idx });
          }
        } else {
          for (let r = 0; r < L.nout; r++) {
            const idx = new Int32Array(L.nin);
            for (let i = 0; i < L.nin; i++) idx[i] = r * L.nin + i;
            out.push({ layer: l, kind: 'row', k: r, idx });
          }
        }
      });
      return out;
    }
    function pieceBits(nw, b) { return b === 0 ? 0 : nw * b + SCALE_BITS; }

    // ---- 一様な量子化。0 を持たない 2^b 段を等間隔に並べ、いちばん外の段の高さを二乗誤差が最小になるように探す ----
    // b = 0 は部品を消す（全部 0 にする）
    function quantize(vals, b) {
      const n = vals.length;
      if (b === 0) {
        let e = 0;
        for (let i = 0; i < n; i++) e += vals[i] * vals[i];
        return { q: new Float64Array(n), mse: n ? e / n : 0, edge: 0 };
      }
      let amax = 0;
      for (let i = 0; i < n; i++) amax = Math.max(amax, Math.abs(vals[i]));
      if (amax === 0) return { q: new Float64Array(n), mse: 0, edge: 0 };
      const levels = 2 ** b;
      let best = null;
      for (let k = 20; k <= 100; k += 4) {
        const edge = amax * k / 100;                 // いちばん外の段の高さ
        const half = edge / (1 - 1 / levels);        // 段の高さは -half + (c + 0.5) × 幅
        const w = 2 * half / levels;
        const q = new Float64Array(n);
        let e = 0;
        for (let i = 0; i < n; i++) {
          let c = Math.floor((vals[i] + half) / w);
          if (c < 0) c = 0; else if (c > levels - 1) c = levels - 1;
          q[i] = -half + (c + 0.5) * w;
          const d = vals[i] - q[i];
          e += d * d;
        }
        if (!best || e < best.e) best = { e, q, edge };
      }
      return { q: best.q, mse: best.e / n, edge: best.edge };
    }

    // ---- 配り方（部品ごとのビット数の並び）を当てたネットワークと、その大きさ ----
    function applyPlan(net, pcs, plan) {
      const qn = cloneNet(net);
      pcs.forEach((pc, i) => {
        const W = net[pc.layer].W, vals = new Float64Array(pc.idx.length);
        pc.idx.forEach((wi, j) => { vals[j] = W[wi]; });
        const { q } = quantize(vals, plan[i]);
        pc.idx.forEach((wi, j) => { qn[pc.layer].W[wi] = q[j]; });
      });
      return qn;
    }
    // バイアスは 16 ビットのまま数える
    function planBits(net, pcs, plan) {
      let bits = 0;
      pcs.forEach((pc, i) => { bits += pieceBits(pc.idx.length, plan[i]); });
      for (const L of net) bits += L.b.length * FLOAT_BITS;
      return bits;
    }
    function fullBits(net) {
      let n = 0;
      for (const L of net) n += L.W.length + L.b.length;
      return n * FLOAT_BITS;
    }
    function weightCount(net) {
      let n = 0;
      for (const L of net) n += L.W.length;
      return n;
    }

    // ---- 元との差（KL(元 ‖ 量子化)、点の平均）と正解率 ----
    function klDiv(p, q) {
      let s = 0;
      for (let c = 0; c < p.length; c++) if (p[c] > 0) s += p[c] * Math.log(p[c] / Math.max(1e-12, q[c]));
      return s;
    }
    function compare(orig, qn, data) {
      const a1 = makeActs(), a2 = makeActs();
      let kl = 0, ok = 0;
      for (let j = 0; j < data.n; j++) {
        const x = data.X[j * 2], y = data.X[j * 2 + 1];
        const p = forward(orig, x, y, a1), q = forward(qn, x, y, a2);
        kl += klDiv(p, q);
        let arg = 0;
        for (let c = 1; c < q.length; c++) if (q[c] > q[arg]) arg = c;
        if (data.Y && arg === data.Y[j]) ok++;
      }
      return { kl: kl / Math.max(1, data.n), acc: data.Y ? ok / Math.max(1, data.n) : null };
    }

    // ---- 部品を1つだけ量子化したときの悪化（KL）を測る。measure(i) で部品 i の全部のビット数を埋める ----
    // 元の各層の値を覚えておき、重みが変わった層から後ろだけを計算し直す
    function damageMeter(net, pcs, calib, bitsList) {
      const n = calib.n, NL = net.length, last = NL - 1;
      const post = [], pre = [], probs = [];
      const acts = makeActs();
      for (let j = 0; j < n; j++) {
        probs.push(forward(net, calib.X[j * 2], calib.X[j * 2 + 1], acts));
        post.push(acts.map((a) => Float64Array.from(a)));
        const pr = [];
        for (let l = 0; l < NL; l++) {
          const L = net[l], a = post[j][l], o = new Float64Array(L.nout);
          for (let r = 0; r < L.nout; r++) {
            let s = L.b[r];
            for (let i = 0; i < L.nin; i++) s += L.W[r * L.nin + i] * a[i];
            o[r] = s;
          }
          pr.push(o);
        }
        pre.push(pr);
      }
      const table = pcs.map(() => new Float64Array(bitsList.length));
      const mseTable = pcs.map(() => new Float64Array(bitsList.length));
      const work = SIZES.map((s) => new Float64Array(s));
      function measure(pi) {
        const pc = pcs[pi], l0 = pc.layer, L = net[l0];
        const vals = new Float64Array(pc.idx.length);
        pc.idx.forEach((wi, k) => { vals[k] = L.W[wi]; });
        bitsList.forEach((b, bi) => {
          const { q, mse } = quantize(vals, b);
          mseTable[pi][bi] = mse;
          const dw = new Float64Array(q.length);
          for (let k = 0; k < q.length; k++) dw[k] = q[k] - vals[k];
          let kl = 0;
          for (let j = 0; j < n; j++) {
            const z = work[l0 + 1];
            z.set(pre[j][l0]);
            if (pc.kind === 'col') {
              const xin = post[j][0][pc.k];
              for (let r = 0; r < L.nout; r++) z[r] += dw[r] * xin;
            } else {
              const a = post[j][l0];
              let s = 0;
              for (let i = 0; i < L.nin; i++) s += dw[i] * a[i];
              z[pc.k] += s;
            }
            let a = new Float64Array(z.length);
            for (let r = 0; r < z.length; r++) a[r] = l0 === last ? z[r] : Math.tanh(z[r]);
            for (let l = l0 + 1; l < NL; l++) {
              const M = net[l], o = new Float64Array(M.nout);
              for (let r = 0; r < M.nout; r++) {
                let s = M.b[r];
                const base = r * M.nin;
                for (let i = 0; i < M.nin; i++) s += M.W[base + i] * a[i];
                o[r] = l === last ? s : Math.tanh(s);
              }
              a = o;
            }
            kl += klDiv(probs[j], softmax(a));
          }
          table[pi][bi] = kl / Math.max(1, n);
        });
      }
      return { table, mseTable, measure };
    }
    function damageTable(net, pcs, calib, bitsList) {
      const m = damageMeter(net, pcs, calib, bitsList);
      for (let i = 0; i < pcs.length; i++) m.measure(i);
      return m;
    }

    // ---- 予算の中で悪化の合計が最小になる組み合わせ ----
    // 部品ごとに選び方を1つ選ぶナップサック問題を、16 ビット単位の動的計画法で解く。
    // costs[i][k] は部品 i を k 番目の選び方にしたときのビット数（16 の倍数）。allowed[k] が false の選び方は使わない
    function allocate(table, costs, budgetBits, allowed) {
      const U = 16, N = table.length;
      const cap = Math.floor(budgetBits / U);
      if (!(cap >= 0)) return null;
      let dp = new Float64Array(cap + 1).fill(Infinity);
      dp[0] = 0;
      const pick = [];
      for (let i = 0; i < N; i++) {
        const nd = new Float64Array(cap + 1).fill(Infinity);
        const pk = new Int8Array(cap + 1).fill(-1);
        for (let k = 0; k < table[i].length; k++) {
          if (allowed && !allowed[k]) continue;
          if (costs[i][k] % U) throw new Error('ビット数は 16 の倍数にする');
          const c = costs[i][k] / U, d = table[i][k];
          for (let u = c; u <= cap; u++) {
            const val = dp[u - c] + d;
            if (val < nd[u]) { nd[u] = val; pk[u] = k; }
          }
        }
        pick.push(pk);
        dp = nd;
      }
      let bestU = -1;
      for (let u = 0; u <= cap; u++) if (dp[u] < Infinity && (bestU < 0 || dp[u] < dp[bestU])) bestU = u;
      if (bestU < 0) return null;
      const choice = new Int32Array(N);
      let u = bestU;
      for (let i = N - 1; i >= 0; i--) {
        const k = pick[i][u];
        choice[i] = k;
        u -= costs[i][k] / U;
      }
      return { choice, predicted: dp[bestU], bits: bestU * U };
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const thumb = !!window.THUMB;
    if (thumb) document.documentElement.classList.add('thumb');
    const BITS = [0, 1, 2, 3, 4, 6, 8];       // 部品ごとに選べるビット数（0 は消す）
    const UNI = [1, 2, 3, 4];                 // そろえる側のビット数
    const CURVE_UNI = [1, 2, 3, 4, 6, 8];
    const STEPS = thumb ? 1200 : 1600, RES = 72, EXT = 1.15;
    const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';
    const COL = { fg: cssVar('--fg'), mut: cssVar('--mut'), line: cssVar('--line'), uni: cssVar('--uni'), alloc: cssVar('--alloc'), dmg: cssVar('--dmg') };
    const CLS = [[95, 200, 176], [240, 180, 90], [180, 156, 255]];
    const BG = [11, 13, 18];
    const BIT_COL = { 0: '#2a2f3b', 1: '#22405e', 2: '#295582', 3: '#316ca6', 4: '#3c84c6', 6: '#5fa3df', 8: '#9ccaf2' };
    const msgEl = $('msg'), bitsIn = $('bits'), bitsOut = $('bitsv'), pruneSw = $('prune'), againBtn = $('again');
    const sumEl = $('sum'), tbEl = $('tb'), h1El = $('h1'), mapCv = $('map'), crvCv = $('crv');
    const cvs = [$('c0'), $('c1'), $('c2')], caps = [$('s0'), $('s1'), $('s2')];
    const pause = () => (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function'
      ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0)));
    const say = (t) => { msgEl.textContent = t; };
    const bytes = (bits) => Math.round(bits / 8).toLocaleString('ja-JP') + ' バイト';
    const fmtKL = (v) => (v >= 0.01 ? v.toFixed(3) : v >= 0.0001 ? v.toFixed(4) : v.toExponential(1));
    const pct = (a) => (a * 100).toFixed(1) + '%';
    let gen = 0, S = null, seed = 1;

    // 学習 → 部品ごとの悪化を測る。50 ms を超えないように区切り、間で画面と操作に順番を譲る
    async function build(sd) {
      const my = ++gen;
      S = null;
      againBtn.disabled = true;
      sumEl.textContent = '';
      tbEl.replaceChildren();
      const train = makeSpiral(sd, 120), test = makeSpiral(sd + 1000, 120);
      const net = initNet(sd);
      const tr = makeTrainer(net, train, sd);
      let until = performance.now() + 40;
      say(`学習しています（0 / ${STEPS} 回）`);
      while (tr.t < STEPS) {
        tr.step(10, tr.t < STEPS * 0.62 ? 0.01 : 0.003);
        if (performance.now() >= until) {
          say(`学習しています（${tr.t} / ${STEPS} 回）`);
          await pause();
          if (my !== gen) return;
          until = performance.now() + 40;
        }
      }
      const pcs = makePieces(net);
      // 小窓では測る点を減らして早く描く
      const calib = thumb ? makeSpiral(sd + 2000, 40) : train;
      const meter = damageMeter(net, pcs, calib, BITS);
      for (let i = 0; i < pcs.length; i++) {
        meter.measure(i);
        if (performance.now() >= until) {
          say(`部品を1つずつ量子化して、悪化を測っています（${i + 1} / ${pcs.length}）`);
          await pause();
          if (my !== gen) return;
          until = performance.now() + 40;
        }
      }
      const W = weightCount(net), full = fullBits(net);
      const st = {
        seed: sd, net, train: calib, test, pcs, table: meter.table, W, full, fixed: full - W * FLOAT_BITS,
        costs: pcs.map((p) => BITS.map((b) => pieceBits(p.idx.length, b))),
        orig: compare(net, net, test), rows: new Map(), curves: new Map(), imgs: new Map([['orig', probImage(net)]]),
      };
      S = st;
      againBtn.disabled = false;
      msgEl.hidden = thumb;
      say(`種 ${sd} で学習しました。重み ${W.toLocaleString('ja-JP')} 個を 32 個ずつ ${pcs.length} 個の部品に分け、部品ごとに ${BITS.length} 通りのビット数で悪化を測りました。`);
      render();
      if (!thumb) await ensureCurve(st, pruneSw.checked);
    }

    // そろえた b ビットと、同じ大きさで配分したもの
    function row(st, b, prune) {
      const key = b + (prune ? 'p' : 'n');
      if (st.rows.has(key)) return st.rows.get(key);
      const uplan = st.pcs.map(() => b);
      const uq = applyPlan(st.net, st.pcs, uplan);
      const ubits = planBits(st.net, st.pcs, uplan);
      const allowed = BITS.map((x) => prune || x > 0);
      const a = allocate(st.table, st.costs, ubits - st.fixed, allowed);
      const plan = Array.from(a.choice, (k) => BITS[k]);
      const aq = applyPlan(st.net, st.pcs, plan);
      const r = {
        b, key, uq, aq, plan, ubits, abits: planBits(st.net, st.pcs, plan),
        u: compare(st.net, uq, st.test), al: compare(st.net, aq, st.test),
        predicted: a.predicted, actual: compare(st.net, aq, st.train).kl,
        pruned: plan.filter((x) => x === 0).length,
      };
      st.rows.set(key, r);
      return r;
    }

    // 予算を 40 バイトずつ変えて配分し、大きさと KL の線を作る
    async function ensureCurve(st, prune) {
      const key = prune ? 'p' : 'n';
      if (st.curves.has(key) || st.curves.has(key + '-busy')) return;
      st.curves.set(key + '-busy', true);
      const allowed = BITS.map((x) => prune || x > 0);
      const pts = [];
      let until = performance.now() + 40;
      for (let B = 400; B <= 2600; B += 40) {
        const a = allocate(st.table, st.costs, B * 8 - st.fixed, allowed);
        if (a) {
          const plan = Array.from(a.choice, (k) => BITS[k]);
          pts.push({ bits: planBits(st.net, st.pcs, plan), kl: compare(st.net, applyPlan(st.net, st.pcs, plan), st.test).kl });
        }
        if (performance.now() >= until) {
          await pause();
          if (S !== st) return;
          until = performance.now() + 40;
        }
      }
      const uni = CURVE_UNI.map((b) => {
        const plan = st.pcs.map(() => b);
        return { b, bits: planBits(st.net, st.pcs, plan), kl: compare(st.net, applyPlan(st.net, st.pcs, plan), st.test).kl };
      });
      st.curves.delete(key + '-busy');
      st.curves.set(key, { pts, uni });
      if (S === st) render();
    }

    // 平面の各点で確率を求め、3色を混ぜた小さな絵にする（自信があるほど濃い）
    function probImage(net) {
      const c = document.createElement('canvas');
      c.width = RES; c.height = RES;
      const g = c.getContext('2d');
      const im = g.createImageData(RES, RES);
      const acts = makeActs();
      for (let py = 0; py < RES; py++) {
        for (let px = 0; px < RES; px++) {
          const x = ((px + 0.5) / RES * 2 - 1) * EXT, y = (1 - (py + 0.5) / RES * 2) * EXT;
          const p = forward(net, x, y, acts);
          let r = 0, gg = 0, bb = 0, mx = 0;
          for (let k = 0; k < 3; k++) {
            r += p[k] * CLS[k][0]; gg += p[k] * CLS[k][1]; bb += p[k] * CLS[k][2];
            mx = Math.max(mx, p[k]);
          }
          const t = 0.2 + 0.6 * (mx - 1 / 3) * 1.5;
          const o = (py * RES + px) * 4;
          im.data[o] = BG[0] + (r - BG[0]) * t;
          im.data[o + 1] = BG[1] + (gg - BG[1]) * t;
          im.data[o + 2] = BG[2] + (bb - BG[2]) * t;
          im.data[o + 3] = 255;
        }
      }
      g.putImageData(im, 0, 0);
      return c;
    }

    function fit(c) {
      const rc = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rc.width * dpr)), h = Math.max(1, Math.round(rc.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      return { g: c.getContext('2d'), w, h, dpr };
    }

    // 見分け方の図と、学習に使っていない点（間違えた点は白い縁）
    function drawPanel(c, img, net, st) {
      const { g, w, h, dpr } = fit(c);
      g.imageSmoothingEnabled = true;
      g.drawImage(img, 0, 0, w, h);
      const acts = makeActs(), T = st.test;
      const rad = Math.max(1.2, (thumb ? 1.4 : 2.2) * dpr * Math.min(1, w / (220 * dpr)));
      let wrong = 0;
      for (let j = 0; j < T.n; j++) {
        const x = T.X[j * 2], y = T.X[j * 2 + 1];
        const p = forward(net, x, y, acts);
        let arg = 0;
        for (let k = 1; k < 3; k++) if (p[k] > p[arg]) arg = k;
        const ok = arg === T.Y[j];
        if (!ok) wrong++;
        const cc = CLS[T.Y[j]];
        g.beginPath();
        g.arc((x / EXT + 1) / 2 * w, (1 - y / EXT) / 2 * h, ok ? rad : rad * 1.3, 0, Math.PI * 2);
        g.fillStyle = `rgb(${cc[0]},${cc[1]},${cc[2]})`;
        g.fill();
        g.lineWidth = ok ? (thumb ? 0.4 : 0.8) * dpr : (thumb ? 1 : 1.6) * dpr;
        g.strokeStyle = ok ? 'rgba(0,0,0,.7)' : '#fff';
        g.stroke();
      }
      return wrong;
    }

    // 上に「その部品だけを 2 ビットにしたときの悪化」の棒、下に配ったビット数
    function drawMap(st, r) {
      const { g, w, h, dpr } = fit(mapCv);
      g.clearRect(0, 0, w, h);
      const groups = [['入力', 0], ['1 層', 1], ['2 層', 2], ['出力', 3]];
      const lw = 40 * dpr, rowH = h / groups.length, cw = (w - lw - 4 * dpr) / 32;
      const k2 = BITS.indexOf(2), barH = rowH * 0.48, gap = 3 * dpr;
      g.textBaseline = 'middle';
      groups.forEach(([label, layer], gi) => {
        const y0 = gi * rowH;
        g.fillStyle = COL.mut;
        g.font = `${11 * dpr}px system-ui, sans-serif`;
        g.textAlign = 'left';
        g.fillText(label, 2 * dpr, y0 + rowH / 2);
        // 10 倍ごとの目盛りの線（1e-7 〜 1）
        g.strokeStyle = COL.line;
        g.lineWidth = 1;
        for (let e = 0; e <= 7; e++) {
          const yy = Math.round(y0 + gap + barH * (e / 7)) + 0.5;
          g.globalAlpha = e === 0 || e === 7 ? 0.9 : 0.35;
          g.beginPath(); g.moveTo(lw, yy); g.lineTo(w - 4 * dpr, yy); g.stroke();
        }
        g.globalAlpha = 1;
        let j = 0;
        st.pcs.forEach((pc, pi) => {
          if (pc.layer !== layer) return;
          const x = lw + j * cw;
          j++;
          const d = st.table[pi][k2];
          const v = Math.max(0, Math.min(1, (Math.log10(Math.max(d, 1e-7)) + 7) / 7));
          g.fillStyle = COL.dmg;
          g.fillRect(x + 1, y0 + gap + barH * (1 - v), Math.max(1, cw - 2), barH * v);
          const b = r.plan[pi], cy = y0 + gap * 2 + barH, ch = rowH - barH - gap * 3;
          g.fillStyle = BIT_COL[b];
          g.fillRect(x + 1, cy, Math.max(1, cw - 2), ch);
          if (cw >= 10 * dpr) {
            g.fillStyle = b >= 6 ? '#0d1420' : '#e4e8f0';
            g.textAlign = 'center';
            g.font = `${Math.min(12, cw / dpr - 1) * dpr}px system-ui, sans-serif`;
            g.fillText(b === 0 ? '×' : String(b), x + cw / 2, cy + ch / 2);
          }
        });
      });
    }

    // 横は大きさ（バイト）、縦は KL（対数目盛り）
    function drawCurve(st, r, prune) {
      const { g, w, h, dpr } = fit(crvCv);
      g.clearRect(0, 0, w, h);
      const cur = st.curves.get(prune ? 'p' : 'n');
      const L = 44 * dpr, R = 10 * dpr, T = 10 * dpr, B = 22 * dpr;
      const x0 = 400, x1 = 2600, y0 = -5, y1 = 0.5;
      const X = (bits) => L + (bits / 8 - x0) / (x1 - x0) * (w - L - R);
      const Y = (kl) => T + (y1 - Math.max(y0, Math.min(y1, Math.log10(Math.max(kl, 1e-9))))) / (y1 - y0) * (h - T - B);
      g.strokeStyle = COL.line;
      g.lineWidth = 1;
      g.fillStyle = COL.mut;
      g.font = `${10.5 * dpr}px system-ui, sans-serif`;
      for (let e = y0; e <= 0; e++) {
        const y = Math.round(Y(10 ** e)) + 0.5;
        g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
        g.textAlign = 'right'; g.textBaseline = 'middle';
        g.fillText(e === 0 ? '1' : '1e' + e, L - 4 * dpr, y);
      }
      for (let bx = 500; bx <= 2500; bx += 500) {
        const x = Math.round(X(bx * 8)) + 0.5;
        g.beginPath(); g.moveTo(x, T); g.lineTo(x, h - B); g.stroke();
        g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText(bx.toLocaleString('ja-JP') + ' B', x, h - B + 5 * dpr);
      }
      const xc = Math.round(X(r.ubits)) + 0.5;
      g.strokeStyle = COL.fg;
      g.setLineDash([4 * dpr, 4 * dpr]);
      g.beginPath(); g.moveTo(xc, T); g.lineTo(xc, h - B); g.stroke();
      g.setLineDash([]);
      if (!cur) {
        g.fillStyle = COL.mut; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('配分の線を計算しています', (L + w - R) / 2, h / 2);
        return;
      }
      g.strokeStyle = COL.alloc;
      g.lineWidth = 2 * dpr;
      g.lineJoin = 'round';
      g.beginPath();
      cur.pts.forEach((p, i) => { const x = X(p.bits), y = Y(p.kl); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
      cur.uni.forEach((u) => {
        const x = X(u.bits), y = Y(u.kl);
        g.fillStyle = COL.uni;
        g.beginPath(); g.arc(x, y, 4 * dpr, 0, Math.PI * 2); g.fill();
        g.fillStyle = COL.fg; g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.fillText(String(u.b), x, y - 5 * dpr);
      });
    }

    function renderTable(st, prune) {
      const b0 = +bitsIn.value;
      tbEl.replaceChildren(...UNI.map((b) => {
        const r = row(st, b, prune);
        const tr = document.createElement('tr');
        if (b === b0) tr.className = 'cur';
        const cells = [`${b} ビット・${bytes(r.ubits)}`, fmtKL(r.u.kl), pct(r.u.acc), fmtKL(r.al.kl), pct(r.al.acc), `${fmtKL(r.predicted)} → ${fmtKL(r.actual)}`, `${r.pruned} 個`];
        cells.forEach((t, i) => {
          const c = document.createElement(i ? 'td' : 'th');
          if (!i) c.scope = 'row';
          c.textContent = t;
          tr.append(c);
        });
        return tr;
      }));
    }

    function render() {
      const b = +bitsIn.value, prune = pruneSw.checked;
      bitsOut.textContent = `${b} ビット（目盛りを入れて重み1つあたり ${b + 0.5} ビット）`;
      bitsIn.setAttribute('aria-valuetext', `${b} ビット`);
      h1El.textContent = `そろえた ${b} ビット`;
      const st = S;
      if (!st) return;
      const r = row(st, b, prune);
      if (!st.imgs.has('u' + b)) st.imgs.set('u' + b, probImage(r.uq));
      if (!st.imgs.has('a' + r.key)) st.imgs.set('a' + r.key, probImage(r.aq));
      drawPanel(cvs[0], st.imgs.get('orig'), st.net, st);
      drawPanel(cvs[1], st.imgs.get('u' + b), r.uq, st);
      drawPanel(cvs[2], st.imgs.get('a' + r.key), r.aq, st);
      if (thumb) {
        caps[0].textContent = `正解率 ${pct(st.orig.acc)}`;
        caps[1].textContent = `正解率 ${pct(r.u.acc)}`;
        caps[2].textContent = `正解率 ${pct(r.al.acc)}`;
      } else {
        caps[0].textContent = `${bytes(st.full)}・正解率 ${pct(st.orig.acc)}`;
        caps[1].textContent = `${bytes(r.ubits)}・KL ${fmtKL(r.u.kl)}・正解率 ${pct(r.u.acc)}`;
        caps[2].textContent = `${bytes(r.abits)}・KL ${fmtKL(r.al.kl)}・正解率 ${pct(r.al.acc)}`;
      }
      cvs[0].setAttribute('aria-label', `元のネットワークが平面をどう見分けるかの図。正解率 ${pct(st.orig.acc)}`);
      cvs[1].setAttribute('aria-label', `全部の部品を ${b} ビットにしたネットワークの図。正解率 ${pct(r.u.acc)}`);
      cvs[2].setAttribute('aria-label', `同じ大きさでビット数を配り分けたネットワークの図。正解率 ${pct(r.al.acc)}`);
      if (thumb) return;
      const cur = st.curves.get(prune ? 'p' : 'n');
      let same = '';
      if (cur) {
        let hit = null;
        for (const p of cur.pts) if (p.kl <= r.u.kl && (!hit || p.bits < hit.bits)) hit = p;
        if (hit && hit.bits < r.ubits) same = `そろえた ${b} ビットと同じくらい元に近いもの（KL ${fmtKL(r.u.kl)} 以下）は、配分すると約 ${bytes(hit.bits)}（${Math.round(hit.bits / r.ubits * 100)}%）で作れた。`;
      }
      const inBits = r.plan.slice(0, 2).join('・');
      const samePlan = !prune && r.plan.every((x) => x === b);
      sumEl.textContent = samePlan
        ? `部品を消せないときは、${b} ビットより少ない選び方が無いので、${bytes(r.ubits)}では配分しても全部 ${b} ビットのままになる。` + same
        : `同じ ${bytes(r.ubits)}で、そろえた ${b} ビットは正解率 ${pct(r.u.acc)}、配分すると ${pct(r.al.acc)}。入力の層の2つの部品には ${inBits} ビットを配り、${r.pruned} 個の部品を消した。` + same;
      drawMap(st, r);
      mapCv.setAttribute('aria-label', `部品ごとの悪化と配ったビット数の図。入力の層の部品に ${inBits} ビット、消した部品は ${r.pruned} 個`);
      drawCurve(st, r, prune);
      crvCv.setAttribute('aria-label', `大きさと元との差の図。今の大きさは ${bytes(r.ubits)}`);
      renderTable(st, prune);
    }

    bitsIn.addEventListener('input', render);
    pruneSw.addEventListener('change', () => {
      render();
      if (S && !thumb) ensureCurve(S, pruneSw.checked);
    });
    againBtn.addEventListener('click', () => { seed++; build(seed); });
    // 幅が変わったときだけ描き直す。表や文の書き換えで高さが変わっても、観察の通知の中では描かない
    let lastW = -1;
    new ResizeObserver((ents) => {
      const w = Math.round(ents[0].contentRect.width);
      if (w === lastW) return;
      lastW = w;
      setTimeout(render, 0);
    }).observe(document.querySelector('.wrap'));

    if (thumb) {
      // 小窓では、そろえる側のビット数を 1 → 2 → 3 → 2 と自動で変えて見せる
      const seq = [1, 2, 3, 2];
      let i = 0;
      bitsIn.value = seq[0];
      setInterval(() => {
        if (!S) return;
        i = (i + 1) % seq.length;
        bitsIn.value = seq[i];
        render();
      }, 2400);
    }
    build(seed);
  },
});

dekiru.add({
  id: 'tr-20261122-model-check', c: 'trend', lv: 3, date: '2026-11-22',
  t: 'ルールを1つ書くだけで、操作の順番を全部調べて、ルールが破れるいちばん短い手順を見つける（TLA+ / Quint のモデル検査）',
  y: 'るーるをひとつかくだけでそうさのじゅんばんをぜんぶしらべてるーるがやぶれるいちばんみじかいてじゅんをみつけるてぃーえるえーぷらすくいんとのもでるけんさ',
  tags: ['TLA+', 'Quint', 'モデル検査', '決定的シミュレーションテスト', '幅優先探索', 'Canvas'],
  d: '2026年11月21日、karamage さんが Zenn に「【TLA+】AIにテストケースを書かせるな。ルールを書け」を公開した。AI が実装とテストの両方を書くと、テストは実装と同じ思い込みを引き継ぐ。そこで人は「どんな順番で操作しても守られるべきルール」だけを書き、どの順番を試すかは機械に任せる、という記事である。記事は TLA+ 系の言語 Quint で、在庫 2 枚のチケットを 3 人が買う設計を書く。確認画面で在庫を見て、確定では在庫を見ずに減らす書き方では、quint run が 12 ミリ秒で「3 枚売れて在庫が −1」になる手順を見つけた。確定のときにもう一度在庫を見るように直すと、モデル検査器の TLC が 29 通りの状態を全部調べて、違反は無いと答えた。前日の 11 月 20 日には、Outdata の記事「Deterministic Simulation Testing Is For Everyone」が Hacker News に載った。乱数の種から環境（入力・時刻・通信など）を作り、同じ種なら同じ失敗が必ず出るようにするテストの方法を、分散データベース以外でも使おうという記事である。この見本は、2 つの記事の中心の部分をブラウザだけで作り直す。題材は、チケット販売、2 人の係が同じ口座から送金する処理、1 人用の部屋の札（相互排除）の 3 つである。題材ごとに元の書き方と直した書き方があり、操作とルールを JavaScript の状態機械で書いてある。「ランダムに試す」は、種から作った乱数で操作をでたらめに選び、200 本の手順を流す（quint run と、決定的シミュレーションテストにあたる）。同じ種でもう一度押すと、同じ手順がもう一度出る。「全部調べる」は、最初の状態から幅優先で、たどり着ける状態を 1 つ残らず作る（TLC にあたる）。ルールが破れる状態と、誰も動けなくなる状態（行き詰まり）を探し、そこまでのいちばん短い手順を表に出す。図の点は状態で、左から右へ手数が増える。点を押すと、その状態までのいちばん短い手順が表に出る。直した書き方のチケット販売を全部調べると、記事の TLC と同じく 29 通りの状態になり、作った状態（重なりを含む）も同じ 55 になる。再現していない所: TLA+ や Quint の言語は読めず、題材は見本の中に JavaScript で書いた 3 つだけである。TLC が持つ対称性による削減、「いつかは必ず入れる」のような時間についての性質（活性）の検査、記事の後半にあるモデルベーステスト（作った手順を本物の実装に流して状態を比べる）は作っていない。決定的シミュレーションテストのうち、通信の遅れや故障、時刻、ディスクを真似る部分も無く、乱数で選ぶのは操作の順番だけである。',
  p: '操作は next(状態) が「今できる操作」を全部返す形で書く。誰がいつ動くかを決めないので、ランダムな実行も、全部を調べる探索も、同じ関数を使える。全部を調べる探索は、状態を文字列のキーにして Map に入れ、同じ状態を 2 度たどらないようにする。新しい状態を見つけたときに、どの状態からどの操作で来たか（親）を覚えておく。幅優先で探すので、親を最初の状態までさかのぼった手順が、その状態へのいちばん短い手順になる。ルールが破れる状態のうち見つけた順で最初のものを選べば、最短の反例が得られる。行き詰まりは「ルールは守られているが、できる操作が 1 つも無く、全員が終わった状態でもない」状態として数える。部屋の札で「自分の札を立ててから相手の札を見る」書き方は、2 人とも札を立てたところで止まる。ランダムな実行は、種から同じ列を出す小さな乱数（mulberry32）だけで操作を選ぶので、種が同じなら手順も同じになる。ランダムな実行で違反が出なくても「出なかった」としか言えないが、全部を調べる探索は、調べ残しが 0 であることを数で示せる。ただし、確かめたのは在庫 2 枚・3 人のような小さな世界だけである。',
  refs: [
    { title: '【TLA+】AIにテストケースを書かせるな。ルールを書け（karamage さん、Zenn、2026-11-21）', url: 'https://zenn.dev/karamage/articles/73027ee36796dc' },
    { title: 'Deterministic Simulation Testing Is For Everyone（Outdata、2026-11-20）', url: 'https://outdata.net/blog/261120' },
    { title: 'Hacker News: Deterministic Simulation Testing Is for Everyone', url: 'https://news.ycombinator.com/item?id=50574264' },
    { title: 'Quint（公式サイト）', url: 'https://quint.sh/' },
    { title: 'Reliable Software in the LLM Era（Quint のブログ）', url: 'https://quint.sh/posts/llm_era' },
  ],
  html: `<div class="wrap">
  <div class="sel">
    <label for="spec">題材</label><select id="spec"></select>
    <label for="ver">書き方</label><select id="ver"></select>
  </div>
  <div class="box">
    <div class="hd">操作とルール（色の付いた行が、書き方の違う所）</div>
    <pre id="code" class="code"></pre>
  </div>
  <div class="ctl">
    <button type="button" id="run">ランダムに試す（200 本）</button>
    <label>種 <input type="number" id="seed" min="0" max="4294967295" step="1" value="1" inputmode="numeric"></label>
    <button type="button" id="all">全部調べる</button>
  </div>
  <p id="msg" class="msg" role="status"></p>
  <canvas id="graph" role="img" aria-label="状態の図"></canvas>
  <p class="legend small mut"><span><i class="n"></i>調べた状態</span><span><i class="b"></i>ルールが破れる</span><span><i class="s"></i>行き詰まり</span><span><i class="e"></i>全員が終わった</span><span><i class="r"></i>ランダムの手順が通った</span><span><i class="p"></i>表の手順</span></p>
  <p class="small mut">点は状態です。左端が最初の状態で、右へ行くほど手数が多くなります。点を押すと、その状態までのいちばん短い手順が表に出ます。</p>
  <p id="cov" class="small"></p>
  <div class="tw" tabindex="0" role="region" aria-labelledby="cap">
    <table>
      <caption id="cap"></caption>
      <thead><tr id="hd"></tr></thead>
      <tbody id="tb"></tbody>
    </table>
  </div>
</div>`,
  css: `:root { color-scheme: dark; --bg: #10131a; --fg: #e4e8f0; --mut: #9aa3b6; --line: #2f3850; --panel: #161a23; --node: #8592ad; --bad: #ff6b6b; --stuck: #f0a040; --end: #5fc8a0; --seen: #6fb6ff; --path: #ffd27a; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .wrap { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .ctl { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
    .ctl label { display: inline-flex; align-items: center; gap: 6px; }
    select, input, button { font: inherit; color: var(--fg); background: #1e2433; border: 1px solid var(--line); border-radius: 6px; }
    select { min-block-size: 30px; padding: 2px 6px; max-inline-size: 100%; }
    input[type="number"] { inline-size: 7em; min-block-size: 30px; padding: 2px 6px; font-variant-numeric: tabular-nums; }
    button { min-block-size: 30px; padding: 2px 12px; cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    :focus-visible { outline: 2px solid var(--path); outline-offset: 2px; }
    .mut { color: var(--mut); }
    .small { font-size: 12px; margin: 0; }
    .box { display: flex; flex-direction: column; gap: 4px; }
    .hd { font-size: 12px; color: var(--mut); }
    .code { margin: 0; padding: 8px 10px; background: var(--panel); border-radius: 6px; font: 12.5px/1.6 ui-monospace, Consolas, monospace; overflow-x: auto; white-space: pre; }
    .code > * { display: block; }
    .code mark { background: #3a3320; color: #ffe2a0; }
    .code .cm { color: var(--mut); }
    .code .rl { color: #9fe0c0; }
    .msg { margin: 0; padding: 6px 8px; border-inline-start: 3px solid var(--seen); background: var(--panel); border-radius: 4px; font-size: 13px; min-block-size: 1.5em; }
    canvas { display: block; inline-size: 100%; block-size: 260px; background: #0b0d12; border-radius: 6px; cursor: pointer; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; }
    .legend i { display: inline-block; inline-size: 10px; block-size: 10px; border-radius: 50%; vertical-align: -1px; margin-inline-end: 4px; }
    .legend .n { background: var(--node); }
    .legend .b { background: var(--bad); }
    .legend .s { background: var(--stuck); }
    .legend .e { background: var(--end); }
    .legend .r { background: transparent; border: 2px solid var(--seen); inline-size: 8px; block-size: 8px; }
    .legend .p { inline-size: 16px; block-size: 3px; border-radius: 2px; vertical-align: middle; background: var(--path); }
    #cov { min-block-size: 1.2em; }
    .tw { overflow-x: auto; }
    table { border-collapse: separate; border-spacing: 0; font-size: 12px; font-variant-numeric: tabular-nums; }
    caption { text-align: start; color: var(--mut); padding-block-end: 4px; }
    th, td { padding: 3px 8px; border-block-end: 1px solid var(--line); text-align: start; white-space: nowrap; }
    thead th { color: var(--mut); font-weight: 400; }
    tbody th { position: sticky; inset-inline-start: 0; background: var(--bg); font-weight: 400; color: var(--mut); text-align: end; }
    td.chg { color: var(--path); }
    tr.bad td, tr.bad th { background: #3a1e24; }
    tr.stuck td, tr.stuck th { background: #3a2c18; }
    .sel { display: grid; grid-template-columns: auto minmax(0, 26em); gap: 6px 8px; align-items: center; justify-content: start; }
    .sel select { inline-size: 100%; }
    .code .tt { color: var(--fg); font-weight: 600; }
    .thumb, .thumb body { overflow: hidden; }
    .thumb .wrap { padding: 4px; gap: 4px; }
    .thumb .sel, .thumb .ctl, .thumb .box, .thumb .legend, .thumb .small, .thumb .tw { display: none; }
    .thumb .msg { font-size: 11px; padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .thumb canvas { block-size: calc(100vh - 40px); min-block-size: 40px; }`,
  core() {
    // ---- 乱数（種から同じ列が出る） ----
    function rng(seed) {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);

    // ---- 題材 ----
    // init: 最初の状態 / key: 状態を表す文字列 / next(s, v): 今できる操作を全部返す（誰が動くかは決めない）
    // ok(s, v): ルールが守られているか / done(s, v): 全員が終わったか（操作が無くても行き詰まりではない）
    const PHASE = { I: '待ち', C: '確認済み', B: '購入', S: '売り切れ' };
    const SPECS = {
      ticket: {
        short: 'チケット販売',
        title: 'チケット販売（在庫 2 枚を 3 人が買う）',
        versions: [
          { id: 'bug', label: '元の書き方（確定のときに在庫を見ない）' },
          { id: 'fix', label: '直した書き方（確定のときにもう一度見る）' },
        ],
        code: {
          bug: [
            '#毎回、誰か 1 人が、今できる操作を 1 つする（順番は決めない）',
            '確認(u)  u が「待ち」のときだけ',
            '         u ← 在庫 > 0 なら「確認済み」、0 なら「売り切れ」',
            '確定(u)  u が「確認済み」のときだけ',
            '*        在庫 ← 在庫 − 1、売れた ← 売れた + 1、u ← 「購入」',
            '!ルール   売れた ≤ 2（最初の在庫）',
          ],
          fix: [
            '#毎回、誰か 1 人が、今できる操作を 1 つする（順番は決めない）',
            '確認(u)  u が「待ち」のときだけ',
            '         u ← 在庫 > 0 なら「確認済み」、0 なら「売り切れ」',
            '確定(u)  u が「確認済み」のときだけ',
            '*        在庫 > 0 なら 在庫 ← 在庫 − 1、売れた ← 売れた + 1、u ← 「購入」',
            '*        0 なら u ← 「売り切れ」',
            '!ルール   売れた ≤ 2（最初の在庫）',
          ],
        },
        steps: 12,
        cols: ['在庫', '売れた', 'A', 'B', 'C'],
        init: () => ({ stock: 2, sold: 0, ph: 'III' }),
        key: (s) => `${s.stock}/${s.sold}/${s.ph}`,
        next(s, v) {
          const out = [];
          for (let i = 0; i < 3; i++) {
            const u = 'ABC'[i], p = s.ph[i];
            if (p === 'I') {
              out.push({ act: `${u} が確認画面を開く${s.stock > 0 ? '' : '（売り切れ）'}`, s: { stock: s.stock, sold: s.sold, ph: put(s.ph, i, s.stock > 0 ? 'C' : 'S') } });
            } else if (p === 'C') {
              if (v === 'bug' || s.stock > 0) out.push({ act: `${u} が確定を押す`, s: { stock: s.stock - 1, sold: s.sold + 1, ph: put(s.ph, i, 'B') } });
              else out.push({ act: `${u} が確定を押す（売り切れ）`, s: { stock: s.stock, sold: s.sold, ph: put(s.ph, i, 'S') } });
            }
          }
          return out;
        },
        ok: (s) => s.sold <= 2,
        done: (s) => !/[IC]/.test(s.ph),
        row: (s) => [s.stock, s.sold, ...Array.from(s.ph, (c) => PHASE[c])],
      },
      bank: {
        short: '2 人の送金',
        title: '2 人の送金（甲の 100 円から、係1 が 30 円、係2 が 50 円を乙へ）',
        versions: [
          { id: 'bug', label: '元の書き方（残高を読んでから、計算した値を書く）' },
          { id: 'fix', label: '直した書き方（読むと書くを 1 回で行う）' },
        ],
        code: {
          bug: [
            '#係1 と係2 が同時に動く。毎回、どちらか 1 人が 1 手進む',
            '送金(a)',
            '*  t ← 甲の残高を読む',
            '*  甲 ← t − a',
            '*  t ← 乙の残高を読む',
            '*  乙 ← t + a',
            '!ルール   2 人とも終わったら、甲 + 乙 = 100',
          ],
          fix: [
            '#係1 と係2 が同時に動く。毎回、どちらか 1 人が 1 手進む',
            '送金(a)',
            '*  甲 ← 甲 − a（読むと書くを 1 回で。データベースの UPDATE など）',
            '*  乙 ← 乙 + a',
            '!ルール   2 人とも終わったら、甲 + 乙 = 100',
          ],
        },
        steps: 12,
        cols: ['甲', '乙', '係1', '係2'],
        init: () => ({ x: 100, y: 0, pc: [0, 0], t: [0, 0] }),
        key: (s) => `${s.x}/${s.y}/${s.pc}/${s.t}`,
        next(s, v) {
          const out = [], AMT = [30, 50];
          for (let i = 0; i < 2; i++) {
            const pc = s.pc[i], a = AMT[i], who = `係${i + 1}`;
            const mk = (np, nt, x, y, act) => {
              const P = s.pc.slice(), T = s.t.slice();
              P[i] = np; T[i] = nt;
              out.push({ act, s: { x, y, pc: P, t: T } });
            };
            if (v === 'bug') {
              if (pc === 0) mk(1, s.x, s.x, s.y, `${who} が甲の残高を読む（${s.x} 円）`);
              else if (pc === 1) mk(2, 0, s.t[i] - a, s.y, `${who} が甲に ${s.t[i] - a} 円を書く`);
              else if (pc === 2) mk(3, s.y, s.x, s.y, `${who} が乙の残高を読む（${s.y} 円）`);
              else if (pc === 3) mk(4, 0, s.x, s.t[i] + a, `${who} が乙に ${s.t[i] + a} 円を書く`);
            } else {
              if (pc === 0) mk(2, 0, s.x - a, s.y, `${who} が甲から ${a} 円を引く`);
              else if (pc === 2) mk(4, 0, s.x, s.y + a, `${who} が乙に ${a} 円を足す`);
            }
          }
          return out;
        },
        ok: (s) => !(s.pc[0] === 4 && s.pc[1] === 4) || s.x + s.y === 100,
        done: (s) => s.pc[0] === 4 && s.pc[1] === 4,
        row(s, v) {
          const st = (i) => {
            const pc = s.pc[i];
            if (pc === 0) return '始める前';
            if (pc === 1) return `甲を読んだ（t = ${s.t[i]}）`;
            if (pc === 2) return v === 'bug' ? '甲に書いた' : '甲から引いた';
            if (pc === 3) return `乙を読んだ（t = ${s.t[i]}）`;
            return '終わり';
          };
          return [s.x, s.y, st(0), st(1)];
        },
      },
      room: {
        short: '1 人用の部屋の札',
        title: '1 人用の部屋の札（A と B が出入りをくり返す）',
        versions: [
          { id: 'look', label: '相手の札を見てから、自分の札を立てる' },
          { id: 'flag', label: '自分の札を立ててから、相手の札を見る' },
          { id: 'peterson', label: 'ピーターソンの方法（自分の札と、譲る札）' },
        ],
        code: {
          look: [
            '#A と B が、外 → 部屋 → 外 を何度でもくり返す。毎回、どちらか 1 人が 1 手進む',
            '入る  *相手の札が下りているのを見る',
            '      *自分の札を立てて、部屋に入る',
            '出る   自分の札を下ろして、外へ出る',
            '!ルール   A と B が同時に部屋の中にいない（誰も動けなくなる状態も探す）',
          ],
          flag: [
            '#A と B が、外 → 部屋 → 外 を何度でもくり返す。毎回、どちらか 1 人が 1 手進む',
            '入る  *自分の札を立てる',
            '      *相手の札が下りるまで待ってから、部屋に入る',
            '出る   自分の札を下ろして、外へ出る',
            '!ルール   A と B が同時に部屋の中にいない（誰も動けなくなる状態も探す）',
          ],
          peterson: [
            '#A と B が、外 → 部屋 → 外 を何度でもくり返す。毎回、どちらか 1 人が 1 手進む',
            '入る   自分の札を立てる',
            '      *1 枚しかない「お先にどうぞ」の札を、相手に向ける',
            '      *相手の札が下りているか、譲る札が自分を向くまで待ってから、部屋に入る',
            '出る   自分の札を下ろして、外へ出る',
            '!ルール   A と B が同時に部屋の中にいない（誰も動けなくなる状態も探す）',
          ],
        },
        steps: 40,
        cols: ['A', 'B', 'A の札', 'B の札', '譲る札'],
        init: () => ({ pc: [0, 0], f: [0, 0], turn: 0 }),
        key: (s) => `${s.pc}/${s.f}/${s.turn}`,
        next(s, v) {
          const out = [], IN = v === 'peterson' ? 3 : 2;
          for (let i = 0; i < 2; i++) {
            const o = 1 - i, who = 'AB'[i], other = 'AB'[o], pc = s.pc[i];
            const mk = (np, nf, turn, act) => {
              const P = s.pc.slice(), F = s.f.slice();
              P[i] = np; F[i] = nf;
              out.push({ act, s: { pc: P, f: F, turn } });
            };
            if (pc === IN) mk(0, 0, s.turn, `${who} が札を下ろして外へ出る`);
            else if (v === 'look') {
              if (pc === 0 && !s.f[o]) mk(1, 0, s.turn, `${who} が ${other} の札を見る（下りている）`);
              else if (pc === 1) mk(2, 1, s.turn, `${who} が札を立てて部屋に入る`);
            } else if (v === 'flag') {
              if (pc === 0) mk(1, 1, s.turn, `${who} が札を立てる`);
              else if (pc === 1 && !s.f[o]) mk(2, 1, s.turn, `${who} が ${other} の札を見て（下りている）部屋に入る`);
            } else {
              if (pc === 0) mk(1, 1, s.turn, `${who} が札を立てる`);
              else if (pc === 1) mk(2, 1, o, `${who} が譲る札を ${other} に向ける`);
              else if (pc === 2 && (!s.f[o] || s.turn === i)) mk(3, 1, s.turn, `${who} が部屋に入る（${!s.f[o] ? `${other} の札が下りている` : '譲る札が自分を向いている'}）`);
            }
          }
          return out;
        },
        ok(s, v) {
          const IN = v === 'peterson' ? 3 : 2;
          return !(s.pc[0] === IN && s.pc[1] === IN);
        },
        done: () => false,
        row(s, v) {
          const NAMES = { look: ['外', '札を見た', '部屋の中'], flag: ['外', '待つ', '部屋の中'], peterson: ['外', '札を立てた', '待つ', '部屋の中'] }[v];
          const fl = (b) => (b ? '立てた' : '下ろした');
          return [NAMES[s.pc[0]], NAMES[s.pc[1]], fl(s.f[0]), fl(s.f[1]), v === 'peterson' ? `${'AB'[s.turn]} に向く` : '—'];
        },
      },
    };

    // ---- 全部調べる（幅優先）: たどり着ける状態を全部作り、親を覚える ----
    function explore(spec, v, limit = 20000) {
      const s0 = spec.init(v);
      const nodes = [s0], index = new Map([[spec.key(s0), 0]]);
      const depth = [0], parent = [-1], via = ['最初の状態'], edges = [], outdeg = [];
      let generated = 1;
      for (let i = 0; i < nodes.length; i++) {
        const outs = spec.next(nodes[i], v);
        outdeg.push(outs.length);
        generated += outs.length;
        for (const o of outs) {
          const k = spec.key(o.s);
          let j = index.get(k);
          if (j === undefined) {
            if (nodes.length >= limit) throw new Error('状態が多すぎます');
            j = nodes.length;
            index.set(k, j);
            nodes.push(o.s);
            depth.push(depth[i] + 1);
            parent.push(i);
            via.push(o.act);
          }
          edges.push([i, j]);
        }
      }
      const bad = [], stuck = [], ends = [];
      nodes.forEach((s, i) => {
        if (!spec.ok(s, v)) bad.push(i);
        else if (!outdeg[i]) (spec.done(s, v) ? ends : stuck).push(i);
      });
      let maxDepth = 0;
      for (const d of depth) if (d > maxDepth) maxDepth = d;
      return { nodes, index, depth, parent, via, edges, generated, bad, stuck, ends, maxDepth };
    }

    // 親をさかのぼって、最初の状態から i までの手順（状態の番号の並び）を作る
    function pathTo(g, i) {
      const p = [];
      for (let k = i; k >= 0; k = g.parent[k]) p.push(k);
      return p.reverse();
    }

    // ---- ランダムに試す: 種から作った乱数で操作を選び、手順を traces 本流す ----
    function simulate(spec, v, seed, traces, maxSteps) {
      const r = rng(seed), seen = new Set();
      let steps = 0, trace = [];
      for (let t = 1; t <= traces; t++) {
        let s = spec.init(v);
        trace = [{ act: '最初の状態', s }];
        seen.add(spec.key(s));
        for (let k = 0; k < maxSteps; k++) {
          const outs = spec.next(s, v);
          if (!outs.length) {
            if (!spec.done(s, v)) return { kind: 'stuck', t, steps, trace, seen };
            break;
          }
          const o = outs[Math.floor(r() * outs.length)];
          s = o.s;
          steps++;
          trace.push(o);
          seen.add(spec.key(s));
          if (!spec.ok(s, v)) return { kind: 'bad', t, steps, trace, seen };
        }
      }
      return { kind: 'ok', t: traces, steps, trace, seen };
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const thumb = !!window.THUMB;
    if (thumb) document.documentElement.classList.add('thumb');
    const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
    const COL = { line: cssVar('--line'), node: cssVar('--node'), bad: cssVar('--bad'), stuck: cssVar('--stuck'), end: cssVar('--end'), seen: cssVar('--seen'), path: cssVar('--path') };
    const specSel = $('spec'), verSel = $('ver'), codeEl = $('code'), runBtn = $('run'), allBtn = $('all'), seedIn = $('seed');
    const msgEl = $('msg'), cv = $('graph'), covEl = $('cov'), capEl = $('cap'), hdEl = $('hd'), tbEl = $('tb');
    const ctx = cv.getContext('2d');
    const TRACES = 200;
    let spec = null, ver = '', g = null, kinds = [], pos = [], rad = 5, revealed = 0, seen = new Set(), path = null, anim = 0, lastSim = null;
    let W = 1, H = 1, dpr = 1;
    const say = (t) => { msgEl.textContent = t; };

    for (const [id, sp] of Object.entries(SPECS)) specSel.add(new Option(sp.short, id));
    function fillVer() {
      const sp = SPECS[specSel.value];
      verSel.replaceChildren(...sp.versions.map((x) => new Option(x.label, x.id)));
    }

    function setup() {
      anim++;
      spec = SPECS[specSel.value];
      ver = verSel.value;
      g = explore(spec, ver);
      kinds = g.nodes.map(() => 'node');
      for (const i of g.ends) kinds[i] = 'end';
      for (const i of g.stuck) kinds[i] = 'stuck';
      for (const i of g.bad) kinds[i] = 'bad';
      revealed = 0;
      seen = new Set();
      path = null;
      lastSim = null;
      allBtn.disabled = false;
      renderCode();
      covEl.textContent = '';
      showTrace(null, '');
      say('まだ調べていません。「ランダムに試す」は操作の順番をでたらめに選んで流し、「全部調べる」はたどり着ける状態を 1 つ残らず作ります。');
      cv.setAttribute('aria-label', '状態の図（まだ調べていない）');
      resize();
    }

    // 行の印: * がある行は書き方の違う行（* は空白にして桁をそろえる）。行頭の # は説明、! はルール
    function renderCode() {
      const tt = document.createElement('span');
      tt.className = 'tt';
      tt.textContent = spec.title;
      codeEl.replaceChildren(tt, ...spec.code[ver].map((ln) => {
        const head = /^[#!]/.test(ln) ? ln[0] : '';
        const el = document.createElement(ln.includes('*') ? 'mark' : 'span');
        if (head === '#') el.className = 'cm';
        if (head === '!') el.className = 'rl';
        el.textContent = (head ? ln.slice(1) : ln).replace('*', ' ');
        return el;
      }));
    }

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, cv.clientWidth);
      H = Math.max(1, cv.clientHeight);
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
      layout();
      draw();
    }

    // 列 = 手数（幅優先の深さ）。列の中は、前の列の親の高さの平均で並べて、線の交差を減らす
    function layout() {
      if (!g) return;
      const D = Math.max(1, g.maxDepth), padX = 16, padY = 14;
      const cols = [];
      g.depth.forEach((d, i) => { (cols[d] = cols[d] || []).push(i); });
      const preds = g.nodes.map(() => []);
      for (const [a, b] of g.edges) if (g.depth[a] + 1 === g.depth[b]) preds[b].push(a);
      pos = new Array(g.nodes.length);
      let minRow = Infinity;
      cols.forEach((ids, d) => {
        const x = padX + (W - 2 * padX) * (g.maxDepth ? d / D : 0.5);
        if (d > 0) {
          const bary = (i) => preds[i].reduce((s, a) => s + pos[a][1], 0) / Math.max(1, preds[i].length);
          const by = new Map(ids.map((i) => [i, bary(i)]));
          ids.sort((a, b) => by.get(a) - by.get(b) || a - b);
        }
        const gap = (H - 2 * padY) / ids.length;
        minRow = Math.min(minRow, gap);
        ids.forEach((i, k) => { pos[i] = [x, padY + gap * (k + 0.5)]; });
      });
      rad = Math.max(2, Math.min(7, ((W - 2 * padX) / D) * 0.2, minRow * 0.36));
    }

    function edge(a, b) {
      const [x1, y1] = pos[a], [x2, y2] = pos[b];
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      if (g.depth[b] === g.depth[a] + 1) ctx.lineTo(x2, y2);
      else {
        // 手数が戻る線（出入りのくり返しなど）は、上へ曲げて描く
        const my = Math.max(2, Math.min(y1, y2) - 16 - Math.abs(x1 - x2) * 0.15);
        ctx.quadraticCurveTo((x1 + x2) / 2, my, x2, y2);
      }
      ctx.stroke();
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!g || !pos.length) return;
      const vis = (i) => i < revealed || seen.has(i);
      ctx.lineWidth = 1;
      ctx.strokeStyle = COL.line;
      for (const [a, b] of g.edges) if (vis(a) && vis(b)) edge(a, b);
      if (path && path.length > 1) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = COL.path;
        for (let k = 0; k + 1 < path.length; k++) edge(path[k], path[k + 1]);
      }
      const onPath = new Set(path || []);
      for (let i = 0; i < g.nodes.length; i++) {
        if (!vis(i)) continue;
        const [x, y] = pos[i];
        const r = onPath.has(i) ? rad * 1.35 : rad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = i >= revealed && kinds[i] === 'node' ? COL.seen : COL[kinds[i]];
        ctx.fill();
        if (seen.has(i)) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = COL.seen;
          ctx.beginPath();
          ctx.arc(x, y, r + 2.2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    function showTrace(rows, title) {
      capEl.textContent = rows ? `${title}（${rows.length - 1} 手）` : '手順はまだありません';
      const th = (t) => { const e = document.createElement('th'); e.scope = 'col'; e.textContent = t; return e; };
      hdEl.replaceChildren(th('手'), th('操作'), ...spec.cols.map(th));
      let prev = null;
      tbEl.replaceChildren(...(rows || []).map((r, k) => {
        const tr = document.createElement('tr');
        const h = document.createElement('th');
        h.scope = 'row';
        h.textContent = k;
        const a = document.createElement('td');
        a.textContent = r.act;
        const vals = spec.row(r.s, ver);
        tr.append(h, a, ...vals.map((x, j) => {
          const td = document.createElement('td');
          td.textContent = x;
          if (prev && prev[j] !== x) td.className = 'chg';
          return td;
        }));
        prev = vals;
        if (!spec.ok(r.s, ver)) tr.className = 'bad';
        else if (!spec.next(r.s, ver).length && !spec.done(r.s, ver)) tr.className = 'stuck';
        return tr;
      }));
    }
    const bfsRows = (p) => p.map((i) => ({ act: g.via[i], s: g.nodes[i] }));

    function coverage() {
      if (!seen.size) { covEl.textContent = ''; return; }
      covEl.textContent = revealed >= g.nodes.length
        ? `ランダムの手順が通った状態: 全部の ${g.nodes.length} 通りのうち ${seen.size} 通り（青い輪）`
        : `ランダムの手順が通った状態: ${seen.size} 通り（全部で何通りあるかは「全部調べる」で分かります）`;
    }

    // 全部調べる: 幅優先で見つけた順に点を出していき、最後に最短の反例を示す
    function exploreAll() {
      const my = ++anim, N = g.nodes.length, dur = thumb ? 1300 : 1600, t0 = performance.now();
      path = null;
      showTrace(null, '');
      revealed = 0;
      allBtn.disabled = true;
      const tick = () => {
        if (my !== anim) return;
        const f = Math.min(1, (performance.now() - t0) / dur);
        revealed = Math.max(1, Math.ceil(N * f));
        say(thumb ? `${spec.short}: 幅優先でたどっています（${revealed} 通り）` : `最初の状態から幅優先でたどっています（見つけた状態 ${revealed} 通り）`);
        draw();
        if (f < 1) setTimeout(tick, 33);
        else finish();
      };
      tick();
    }
    function finish() {
      allBtn.disabled = false;
      revealed = g.nodes.length;
      const N = g.nodes.length;
      const target = g.bad.length ? g.bad[0] : g.stuck.length ? g.stuck[0] : -1;
      let s = `全部で ${N} 通りの状態を調べました（作った状態は重なりを含めて ${g.generated}、調べ残し 0）。`;
      if (g.bad.length) s += `ルールが破れる状態が ${g.bad.length} 通りあります。そこまでのいちばん短い手順は ${g.depth[target]} 手です（表）。`;
      if (g.stuck.length) s += `誰も動けなくなる状態（行き詰まり）が ${g.stuck.length} 通りあります。${g.bad.length ? '' : `そこまでのいちばん短い手順は ${g.depth[target]} 手です（表）。`}`;
      if (!g.bad.length && !g.stuck.length) s += 'ルールが破れる状態も、行き詰まりもありません。この小さな世界では、どの順番で操作してもルールが守られます。';
      // 小窓では 1 行に収まる短い要約にする
      if (thumb) s = `${spec.short}: ${N} 通りを全部調べ、${g.bad.length ? `${g.depth[target]} 手でルールが破れる` : g.stuck.length ? `${g.depth[target]} 手で行き詰まる` : '違反なし'}`;
      say(s);
      cv.setAttribute('aria-label', `状態の図: 全部で ${N} 通り。ルールが破れる状態 ${g.bad.length} 通り、行き詰まり ${g.stuck.length} 通り`);
      if (target >= 0) {
        path = pathTo(g, target);
        showTrace(bfsRows(path), g.bad.length ? 'ルールが破れるまでのいちばん短い手順' : '行き詰まるまでのいちばん短い手順');
      } else if (g.ends.length) {
        path = pathTo(g, g.ends[0]);
        showTrace(bfsRows(path), '全員が終わるまでの手順の 1 つ');
      }
      coverage();
      draw();
    }

    // ランダムに試す: 同じ種なら、同じ手順がもう一度出る
    function runRandom() {
      anim++;
      allBtn.disabled = false;
      const sd = Math.min(4294967295, Math.max(0, Math.floor(Number(seedIn.value) || 0)));
      seedIn.value = String(sd);
      const res = simulate(spec, ver, sd, TRACES, spec.steps);
      for (const k of res.seen) {
        const i = g.index.get(k);
        if (i !== undefined) seen.add(i);
      }
      const sig = `${res.kind}|${res.t}|${res.steps}|${res.trace.map((x) => spec.key(x.s)).join(' ')}`;
      let again = '種を変えずにもう一度押すと、同じ手順がもう一度出ます。';
      if (lastSim && lastSim.seed === sd) again = lastSim.sig === sig ? '前と同じ種なので、前とまったく同じ手順がもう一度出ました。' : '前と同じ種なのに、手順が変わりました。';
      lastSim = { seed: sd, sig };
      const n = res.trace.length - 1;
      if (res.kind === 'bad') say(`種 ${sd}: ${res.t} 本目の手順の ${n} 手目で、ルールが破れました（ここまでに試した手は合わせて ${res.steps}）。${again}`);
      else if (res.kind === 'stuck') say(`種 ${sd}: ${res.t} 本目の手順の ${n} 手目で、誰も動けなくなりました（行き詰まり。ここまでに試した手は合わせて ${res.steps}）。${again}`);
      else say(`種 ${sd}: ${TRACES} 本の手順（合わせて ${res.steps} 手）を試し、ルールが破れる場面も行き詰まりも出ませんでした。ただし、出なかったと言えるのは試した手順だけです。表は最後の 1 本です。${again}`);
      path = res.trace.map((x) => g.index.get(spec.key(x.s))).filter((i) => i !== undefined);
      showTrace(res.trace, res.kind === 'ok' ? `種 ${sd} の最後の手順` : `種 ${sd} で見つかった手順`);
      coverage();
      draw();
    }

    // 点を押すと、その状態までのいちばん短い手順を表に出す
    cv.addEventListener('click', (ev) => {
      if (!g) return;
      const rc = cv.getBoundingClientRect();
      const x = ev.clientX - rc.left, y = ev.clientY - rc.top;
      let best = -1, bd = 14 * 14;
      for (let i = 0; i < g.nodes.length; i++) {
        if (!(i < revealed || seen.has(i))) continue;
        const d2 = (pos[i][0] - x) ** 2 + (pos[i][1] - y) ** 2;
        if (d2 < bd) { bd = d2; best = i; }
      }
      if (best < 0) return;
      path = pathTo(g, best);
      showTrace(bfsRows(path), '押した状態までのいちばん短い手順');
      draw();
    });

    specSel.addEventListener('change', () => { fillVer(); setup(); });
    verSel.addEventListener('change', setup);
    runBtn.addEventListener('click', runRandom);
    allBtn.addEventListener('click', exploreAll);

    let lastW = -1;
    new ResizeObserver((ents) => {
      const w = Math.round(ents[0].contentRect.width);
      if (w === lastW) return;
      lastW = w;
      setTimeout(resize, 0);
    }).observe(cv);

    fillVer();
    if (thumb) {
      // 小窓では、題材と書き方を順に変えながら、全部調べる様子を見せる
      const plan = [['ticket', 'bug'], ['ticket', 'fix'], ['room', 'flag'], ['bank', 'bug']];
      let k = 0;
      const loop = () => {
        const [sp, ve] = plan[k % plan.length];
        k++;
        specSel.value = sp;
        fillVer();
        verSel.value = ve;
        setup();
        exploreAll();
        setTimeout(loop, 4200);
      };
      loop();
    } else {
      setup();
    }
  },
});
