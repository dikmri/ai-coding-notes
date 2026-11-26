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
dekiru.add({
  id: 'tr-20261122-spread-stack', c: 'trend', lv: 2, date: '2026-11-22',
  t: 'パンにナイフで塗って具を載せる。ナイフの塗り物は塗るほど減り、重心の下に支えが無い具は滑り落ちる（Sandwich Simulator）',
  y: 'ぱんにないふでぬってぐをのせるないふのぬりものはぬるほどへりじゅうしんのしたにささえがないぐはすべりおちるさんどいっちしみゅれーた',
  tags: ['Sandwich Simulator', 'Canvas', 'Pointer Events', '凸包', '重心'],
  d: '2026年11月22日、Hacker News に「Sandwich Simulator」（stulle.app。ドイツ語の名前は Stullensimulator）が載り、取得した時点で 231 点を集めていた。パンに塗り物を塗って具を載せ、ドイツの Stulle（具を載せたパン）を作る遊びである。壺を押すとナイフに塗り物が付き、パンの上をなでると塗れる。説明には、空になったらもう一度壺を押すこと、具は帯からパンへ引いて載せ、取っ手やマウスのホイールで回すこと、ぐらつく具は手を離すと滑り落ちることが書いてある。この見本は、その中心の 3 つの仕組みをブラウザだけで作り直す。1 つ目は塗り方である。パンを 2 単位四方のマスに分け、マスごとに塗り物の厚さと色を持つ。ナイフが通ると、刃の下のマスとナイフの間で塗り物をやり取りする。塗るほどナイフの量は減って薄くしか塗れなくなり、空のナイフでなでると厚い所がならされる。バターの上をジャムのナイフでなでると色が混ざる。2 つ目は具の移動と回転で、具は引いて動かし、取っ手・ホイール・ボタン・キーで回す。3 つ目は具が落ちる判定で、手を離したときに、具の下に支え（パンか、先に置いた具）がある所を調べ、具の重心が支えの範囲の外なら滑り落とす。支えていた具を持ち上げたり外したりすると、上の具も続けて落ちる。塗り物は 4 種類、具は 8 種類で、絵は canvas にその場で描いている。「見本を動かす」を押すと、バターを塗って具を載せ、最後のトマトがパンの縁から滑り落ちるまでを自動で見せる。再現していない所: 元の作品の写真のような絵と多くの具、写真を撮って番号と URL を付けて残す機能は無い。元の作品が具の落ち方をどう決めているかは公開されていないので、落ちる条件はこの見本で決めた。具の厚みは数えず、下に何かがあれば支えとみなす。具の上には塗れない。',
  p: 'ナイフは、上に残っている量から「どのくらいの厚さで塗るか」を決める。量が多いほど厚く（最大 1.5）、空に近いほど薄く（0.25）なる。刃の下のマスがその厚さより薄ければ差の 22% をナイフから足し、厚ければ差の 12% をナイフへ取り込む。足した量と取り込んだ量はナイフの量から引き、ナイフの量へ足すので、パンとナイフの塗り物の合計は変わらない。この 1 つの決まりから、塗るほど薄くなる、空のナイフで厚い所がならされて先へ伸びる、別の塗り物のナイフが通ると色が混ざる、という動きが出る。やり取りの回数はナイフが進んだ道のりで決まるので、止まっている間は塗れない。具が落ちる判定では、具の中に 3 単位おきに点を打ち、下に支えのある点だけを囲む凸包（へこみの無い多角形）を作る。平らな板は、重心がこの凸包の内側にあれば傾かない。外にあれば、支えのある所の中心から重心の向きへ滑らせる。支えのある点が 1 つも無ければ、パンの外へ出したとみなして片付ける。下の具から順に判定するので、下の具が落ちると、その具に支えられていた上の具も同じ回で落ちる。',
  refs: [
    { title: 'Sandwich Simulator（Stullensimulator、stulle.app）', url: 'https://stulle.app/' },
    { title: 'Hacker News: Sandwich Simulator（2026-11-22）', url: 'https://news.ycombinator.com/item?id=50594911' },
    { title: 'Support polygon（Wikipedia）', url: 'https://en.wikipedia.org/wiki/Support_polygon' },
  ],
  html: `<div class="app">
  <div class="bar">
    <div class="grp" role="group" aria-labelledby="potL"><span class="lab" id="potL">塗り物（押すとナイフに付く）</span><span id="pots" class="row"></span></div>
    <div class="grp" role="group" aria-labelledby="trayL"><span class="lab" id="trayL">具（パンへ引いて載せる。押すとパンの上に置く）</span><span id="tray" class="row"></span></div>
  </div>
  <div class="stage"><canvas id="cv" tabindex="0" aria-label="まな板の上のパン。なでると塗れる。具を選び、矢印キーで動かし、Q と E で回す" aria-describedby="help"></canvas></div>
  <div class="foot">
    <span class="row"><label for="loadM">ナイフの上</label><meter id="loadM" min="0" max="1" value="0"></meter><span id="loadT">空</span></span>
    <span id="covT">塗れた所 0%</span>
    <span class="row"><button type="button" id="rotL" aria-label="選んだ具を左へ回す">↺ 回す</button><button type="button" id="rotR" aria-label="選んだ具を右へ回す">↻ 回す</button><button type="button" id="delB">外す</button></span>
    <span class="row"><button type="button" id="demoB">見本を動かす</button><button type="button" id="clearB">最初から</button></span>
  </div>
  <p id="msg" class="msg" role="status"></p>
  <p id="help" class="small">ドラッグしなくても使えます。具のボタンを押すとパンの上の空いた所に置きます。パンの画面を選んでから、矢印キー（Shift で大きく）で動かし、Q と E で回し、N で次の具を選び、Delete で外します。具の上でホイールを回しても回せます。</p>
</div>`,
  css: `:root { color-scheme: light; --bg: #f4eee5; --fg: #2b241f; --mut: #6d6257; --line: #d8ccbd; --panel: #fffaf2; --acc: #b8532c; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .app { box-sizing: border-box; min-block-size: 100vh; display: flex; flex-direction: column; gap: 6px; padding: 8px; }
    .bar { display: flex; flex-direction: column; gap: 4px; }
    .grp { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: center; }
    .lab { font-size: 12px; color: var(--mut); }
    .row { display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    button { font: inherit; font-size: 13px; color: var(--fg); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; min-block-size: 32px; padding: 2px 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
    button:disabled { opacity: .45; cursor: default; }
    :focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    .pot i { inline-size: 16px; block-size: 16px; border-radius: 50%; background: var(--c); box-shadow: inset 0 -2px 0 rgb(0 0 0 / .2); }
    .top { cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none; padding-inline-start: 4px; }
    .top canvas { inline-size: 24px; block-size: 24px; }
    .stage { flex: 1 1 auto; min-block-size: 230px; position: relative; }
    #cv { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; display: block; border-radius: 10px; touch-action: none; -webkit-user-select: none; user-select: none; }
    .foot { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; font-size: 13px; }
    meter { inline-size: 80px; }
    #loadT, #covT { font-variant-numeric: tabular-nums; }
    .msg { margin: 0; padding: 6px 8px; background: var(--panel); border-inline-start: 3px solid var(--acc); border-radius: 4px; font-size: 13px; min-block-size: 1.5em; }
    .small { margin: 0; font-size: 12px; color: var(--mut); }
    .thumb .bar, .thumb .foot, .thumb .msg, .thumb .small { display: none; }
    .thumb .app { padding: 0; }
    .thumb .stage { min-block-size: 0; }
    .thumb #cv { border-radius: 0; }`,
  core() {
    // 画面の座標は横 400 × 縦 300。パン・具・ナイフはこの座標で持つ
    const VW = 400, VH = 300;
    // ナイフ: half は刃の長さの半分、thick は刃の太さの半分、step は道のりを刻む幅、
    // rate は薄い所へ足す割合、up は厚い所から取り込む割合、full は壺から取る量、hMin と hMax は塗る厚さの下限と上限
    const KNIFE = { half: 22, thick: 3.5, step: 1.5, rate: 0.22, up: 0.12, full: 7000, hMin: 0.25, hMax: 1.5 };

    function bboxOf(P) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return [x0, y0, x1, y1];
    }
    // 点が多角形の内側にあるか（右へ伸ばした半直線が辺と交わる回数が奇数なら内側）
    function inPoly(P, x, y) {
      let ins = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
        if ((yi > y) !== (yj > y) && x < xj + (y - yj) * (xi - xj) / (yi - yj)) ins = !ins;
      }
      return ins;
    }
    // 3 次ベジェ曲線を n 個の点に分けて out へ足す
    function bez(a, b, c, d, n, out) {
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t, k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
        out.push([k0 * a[0] + k1 * b[0] + k2 * c[0] + k3 * d[0], k0 * a[1] + k1 * b[1] + k2 * c[1] + k3 * d[1]]);
      }
    }
    // 食パン 1 枚の輪郭。inset を与えると、上下左右からその幅だけ縮めた輪郭（耳の内側）を返す
    function breadPoly(inset = 0) {
      const L = 88, R = 312, B = 262, T0 = 104, TP = 40, cx = 200;
      const P = [[L, B - 10], [L, T0]];
      bez([L, T0], [L - 24, T0 - 14], [L - 20, TP + 14], [L + 38, TP + 4], 14, P);
      bez([L + 38, TP + 4], [cx - 30, TP - 6], [cx + 30, TP - 6], [R - 38, TP + 4], 14, P);
      bez([R - 38, TP + 4], [R + 20, TP + 14], [R + 24, T0 - 14], [R, T0], 14, P);
      P.push([R, B - 10]);
      for (let i = 1; i <= 4; i++) { const a = i / 8 * Math.PI; P.push([R - 10 + 10 * Math.cos(a), B - 10 + 10 * Math.sin(a)]); }
      P.push([L + 10, B]);
      for (let i = 1; i < 4; i++) { const a = Math.PI / 2 + i / 8 * Math.PI; P.push([L + 10 + 10 * Math.cos(a), B - 10 + 10 * Math.sin(a)]); }
      if (!inset) return P;
      const [x0, y0, x1, y1] = bboxOf(P), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const sx = (x1 - x0 - 2 * inset) / (x1 - x0), sy = (y1 - y0 - 2 * inset) / (y1 - y0);
      return P.map(([x, y]) => [mx + (x - mx) * sx, my + (y - my) * sy]);
    }
    // パンを cell 四方のマスに分ける。マスごとに塗り物の厚さ t と色 r, g, b（0〜1）を持つ。
    // mask は塗れるマス（poly の内側。poly が無ければ全部）、cover は具の下に隠れて刃が届かないマス
    function makeGrid(cell, poly) {
      const ox = 60, oy = 30, w = Math.ceil(280 / cell), h = Math.ceil(240 / cell), n = w * h;
      const G = { cell, ox, oy, w, h, t: new Float32Array(n), r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), mask: new Uint8Array(n), cover: new Uint8Array(n) };
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        G.mask[j * w + i] = !poly || inPoly(poly, ox + (i + 0.5) * cell, oy + (j + 0.5) * cell) ? 1 : 0;
      }
      return G;
    }
    // ナイフ K（load は量、r, g, b は色）を (x0, y0) から (x1, y1) へ動かす。刃は動く向きに直角に当たる
    // （ang を与えると、その向きへ動いているものとして刃を置く）。刃の下のマスごとに、ナイフが塗る厚さ h と比べ、
    // 薄ければナイフから足し、厚ければナイフへ取り込む。返り値はパンへ移った正味の量（取り込みが多ければ負）
    function stroke(G, K, x0, y0, x1, y1, P = KNIFE, ang) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 1e-6) return 0;
      const a = ang ?? Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
      const n = Math.max(1, Math.round(len / P.step)), reach = P.half + P.thick, th2 = P.thick * P.thick;
      let net = 0;
      for (let s = 1; s <= n; s++) {
        const px = x0 + (x1 - x0) * s / n, py = y0 + (y1 - y0) * s / n;
        const ax = px - nx * P.half, ay = py - ny * P.half;
        const i0 = Math.max(0, Math.floor((px - reach - G.ox) / G.cell)), i1 = Math.min(G.w - 1, Math.floor((px + reach - G.ox) / G.cell));
        const j0 = Math.max(0, Math.floor((py - reach - G.oy) / G.cell)), j1 = Math.min(G.h - 1, Math.floor((py + reach - G.oy) / G.cell));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * G.w + i;
          if (!G.mask[k] || G.cover[k]) continue;
          const cx = G.ox + (i + 0.5) * G.cell, cy = G.oy + (j + 0.5) * G.cell;
          // マスの中心から刃（長さ 2*half の線分）までの距離が thick 以内のマスだけ
          const u = Math.min(1, Math.max(0, ((cx - ax) * nx + (cy - ay) * ny) / (2 * P.half)));
          const qx = ax + nx * 2 * P.half * u - cx, qy = ay + ny * 2 * P.half * u - cy;
          if (qx * qx + qy * qy > th2) continue;
          const h = P.hMin + (P.hMax - P.hMin) * Math.sqrt(Math.min(1, K.load / P.full));
          const tk = G.t[k];
          if (tk < h) {
            const d = Math.min(P.rate * (h - tk), K.load);
            if (d <= 0) continue;
            const tot = tk + d;
            G.r[k] = (G.r[k] * tk + K.r * d) / tot; G.g[k] = (G.g[k] * tk + K.g * d) / tot; G.b[k] = (G.b[k] * tk + K.b * d) / tot;
            G.t[k] = tot; K.load -= d; net += d;
          } else {
            const d = P.up * (tk - h);
            if (d <= 0) continue;
            const tot = K.load + d;
            K.r = (K.r * K.load + G.r[k] * d) / tot; K.g = (K.g * K.load + G.g[k] * d) / tot; K.b = (K.b * K.load + G.b[k] * d) / tot;
            K.load = tot; G.t[k] = tk - d; net -= d;
          }
        }
      }
      return net;
    }
    // 壺から取る。ナイフの量を full まで足し、前の塗り物が残っていれば量に応じて色が混ざる。足した量を返す
    function takeFromPot(K, rgb, full = KNIFE.full) {
      const add = Math.max(0, full - K.load);
      if (add <= 0) return 0;
      const tot = K.load + add;
      K.r = (K.r * K.load + rgb[0] * add) / tot; K.g = (K.g * K.load + rgb[1] * add) / tot; K.b = (K.b * K.load + rgb[2] * add) / tot;
      K.load = tot;
      return add;
    }
    // 塗れた割合（厚さ thr 以上のマス ÷ 塗れるマス）と、塗れた所の平均の厚さ
    function coverage(G, thr = 0.12) {
      let all = 0, on = 0, sum = 0;
      for (let k = 0; k < G.t.length; k++) {
        if (!G.mask[k]) continue;
        all++;
        if (G.t[k] >= thr) { on++; sum += G.t[k]; }
      }
      return { frac: all ? on / all : 0, mean: on ? sum / on : 0 };
    }

    // 具の形（中心が原点の多角形）
    const ring = (rx, ry, n, f = () => 1) => Array.from({ length: n }, (_, i) => {
      const a = i / n * Math.PI * 2, s = f(a);
      return [rx * s * Math.cos(a), ry * s * Math.sin(a)];
    });
    const SHAPES = {
      lettuce: () => ring(38, 35, 96, (a) => 1 + 0.1 * Math.sin(a * 11) + 0.05 * Math.sin(a * 4 + 1)),
      ham: () => ring(33, 33, 32),
      cheese: () => {
        const P = [], h = 29, r = 4;
        for (const [cx, cy, a0] of [[h - r, h - r, 0], [r - h, h - r, 0.5], [r - h, r - h, 1], [h - r, r - h, 1.5]]) {
          for (let i = 0; i <= 3; i++) { const a = (a0 + i / 6) * Math.PI; P.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
        }
        return P;
      },
      tomato: () => ring(22, 22, 28),
      cucumber: () => ring(14, 14, 20),
      egg: () => ring(16, 20, 24),
      berry: () => Array.from({ length: 28 }, (_, i) => {
        const a = i / 28 * Math.PI * 2, c = Math.cos(a);
        return [15 * Math.sin(a) * (0.62 + 0.38 * c), c > 0 ? -12 * c : -18 * c];
      }),
      banana: () => ring(12, 12, 18),
    };
    // 多角形の中に step おきに点を打つ（輪郭の頂点も入れる）
    function samplesOf(P, step = 3) {
      const [x0, y0, x1, y1] = bboxOf(P), out = P.map((p) => [p[0], p[1]]);
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
        for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) if (inPoly(P, x, y)) out.push([x, y]);
      }
      return out;
    }
    // 具を (x, y) へ置き、角度 a だけ回したときの輪郭・囲む箱・点
    function posed(local, x, y, a) {
      const c = Math.cos(a), s = Math.sin(a), tf = (p) => [x + p[0] * c - p[1] * s, y + p[0] * s + p[1] * c];
      const poly = local.poly.map(tf);
      return { poly, box: bboxOf(poly), pts: local.pts.map(tf) };
    }
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    // 点を全部囲む、へこみの無い多角形（凸包）。x の順に並べ、下側と上側を別々に作る（アンドリューの方法）
    function convexHull(pts) {
      const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (p.length < 3) return p;
      const lo = [], hi = [];
      for (const q of p) {
        while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
        lo.push(q);
      }
      for (let i = p.length - 1; i >= 0; i--) {
        const q = p[i];
        while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
        hi.push(q);
      }
      lo.pop(); hi.pop();
      return lo.concat(hi);
    }
    // 凸包 H の内側に、どの辺からも margin 以上離れて入っているか
    function inHull(H, x, y, margin = 0) {
      if (H.length < 3) return false;
      for (let i = 0; i < H.length; i++) {
        const a = H[i], b = H[(i + 1) % H.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        if (cross(a, b, [x, y]) / len < margin) return false;
      }
      return true;
    }
    const mean = (P) => { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; };
    // 具が載っていられるか。pts は具の中の点、ok[i] はその点の下に支えがあるか。
    // 重心が「支えのある点の凸包」の内側なら stay、外なら slide（dir は滑る向き）、支えが 1 つも無ければ gone
    function judge(pts, ok, margin = 1.5) {
      const sup = pts.filter((_, i) => ok[i]);
      const frac = sup.length / Math.max(1, pts.length);
      if (!sup.length) return { kind: 'gone', frac: 0, dir: [0, 1] };
      const c = mean(pts);
      if (inHull(convexHull(sup), c[0], c[1], margin)) return { kind: 'stay', frac, dir: [0, 0] };
      const s = mean(sup);
      let dx = c[0] - s[0], dy = c[1] - s[1];
      const l = Math.hypot(dx, dy);
      if (l < 1e-9) { dx = 0; dy = 1; } else { dx /= l; dy /= l; }
      return { kind: 'slide', frac, dir: [dx, dy] };
    }
    const inItem = (o, x, y) => x >= o.box[0] && x <= o.box[2] && y >= o.box[1] && y <= o.box[3] && inPoly(o.poly, x, y);
    // 下の具から順に判定する。各具は { poly, box, pts }（世界の座標）。落ちると判定した具は、上の具を支えない
    function settle(items, onBread, margin = 1.5) {
      const down = [];
      return items.map((it) => {
        const ok = it.pts.map(([x, y]) => onBread(x, y) || down.some((o) => inItem(o, x, y)));
        const r = judge(it.pts, ok, margin);
        if (r.kind === 'stay') down.push(it);
        return r;
      });
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const thumb = !!window.THUMB;
    if (thumb) document.documentElement.classList.add('thumb');
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const cv = $('cv'), ctx = cv.getContext('2d');
    const msgEl = $('msg'), loadM = $('loadM'), loadT = $('loadT'), covT = $('covT');
    const rotL = $('rotL'), rotR = $('rotR'), delB = $('delB'), demoB = $('demoB'), clearB = $('clearB');
    const POTS = [
      { id: 'butter', name: 'バター', rgb: [0.97, 0.85, 0.47] },
      { id: 'jam', name: 'いちごジャム', rgb: [0.70, 0.06, 0.15] },
      { id: 'choco', name: 'チョコ', rgb: [0.34, 0.19, 0.11] },
      { id: 'peanut', name: 'ピーナツ', rgb: [0.79, 0.53, 0.25] },
    ];
    const TOPS = [
      { id: 'lettuce', name: 'レタス' }, { id: 'ham', name: 'ハム' }, { id: 'cheese', name: 'チーズ' }, { id: 'tomato', name: 'トマト' },
      { id: 'cucumber', name: 'きゅうり' }, { id: 'egg', name: 'ゆで卵' }, { id: 'berry', name: 'いちご' }, { id: 'banana', name: 'バナナ' },
    ];
    const NAME = Object.fromEntries(TOPS.map((t) => [t.id, t.name]));
    const OUTER = breadPoly(0), CRUMB = breadPoly(9), OB = bboxOf(OUTER);
    const onBread = (x, y) => x >= OB[0] && x <= OB[2] && y >= OB[1] && y <= OB[3] && inPoly(OUTER, x, y);
    const G = makeGrid(2, breadPoly(5));
    const K = { load: 0, r: 0, g: 0, b: 0, name: '' };
    const LOCAL = {};
    for (const t of TOPS) {
      const poly = SHAPES[t.id]();
      LOCAL[t.id] = { poly, pts: samplesOf(poly, 3), rad: Math.max(...poly.map((p) => Math.hypot(p[0], p[1]))) };
    }
    let rs = 12345;   // 毎回同じ順に出る乱数
    const rand = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
    // 塗り物の表面の小さなむら。マスごとの乱数を周りの 9 マスで平均して、粒が目立たないようにする
    const noise = new Float32Array(G.t.length);
    {
      const raw = new Float32Array(G.t.length).map(() => rand() - 0.5);
      for (let j = 0; j < G.h; j++) for (let i = 0; i < G.w; i++) {
        let s = 0, c = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const y = j + dj, x = i + di;
          if (x >= 0 && x < G.w && y >= 0 && y < G.h) { s += raw[y * G.w + x]; c++; }
        }
        noise[j * G.w + i] = s / c;
      }
    }
    const PV_COL = { stay: '#2f9e5a', slide: '#e0702a', gone: '#8a8f99' };

    let items = [];   // 下から上の順
    let sel = null, mode = null, off = [0, 0], pressAt = [0, 0], last = null, hover = null, pv = null, knifeAng = 0.3;
    let nd = null, dragEndAt = -1e9, seq = 0, wasLoaded = false, lastLoadTxt = '', lastCovTxt = '';
    let W = 1, H = 1, dpr = 1, S = 1, OX = 0, OY = 0, breadImg = null, dirty = true, spreadDirty = true, lastT = 0;
    let demoRun = null, demoKnife = null;
    const spreadCv = document.createElement('canvas');
    spreadCv.width = G.w; spreadCv.height = G.h;
    const sctx = spreadCv.getContext('2d'), img = sctx.createImageData(G.w, G.h);
    const say = (s) => { msgEl.textContent = s; };
    const pct = (f) => Math.round(f * 100);
    const clampTo = (v, a, b) => Math.min(b, Math.max(a, v));
    const rgbOf = (r, g, b) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

    // ---- 具 ----
    function pose(it) { Object.assign(it, posed(LOCAL[it.kind], it.x, it.y, it.a)); }
    function makeItem(kind, x, y, a) {
      const it = { kind, x, y, a, id: ++seq, lifted: false, fall: null, poly: null, box: null, pts: null };
      pose(it);
      return it;
    }
    const stack = () => items.filter((o) => !o.fall && !o.lifted);
    function hitItem(x, y) {
      for (let i = items.length - 1; i >= 0; i--) {
        const o = items[i];
        if (!o.fall && !o.lifted && inItem(o, x, y)) return o;
      }
      return null;
    }
    // 持っている具を、今の場所で離したらどうなるか
    function preview(it) {
      const st = stack().filter((o) => o !== it);
      return judge(it.pts, it.pts.map(([x, y]) => onBread(x, y) || st.some((o) => inItem(o, x, y))));
    }
    // 載っている具を下から判定し直し、支えを失った具を落とす。具ごとの判定を Map で返す
    function resettle() {
      const st = stack(), res = settle(st, onBread), M = new Map();
      st.forEach((o, i) => {
        M.set(o, res[i]);
        if (res[i].kind !== 'stay') startFall(o, res[i]);
      });
      updateCover();
      dirty = true;
      return M;
    }
    function startFall(o, r) {
      o.fall = { kind: r.kind, dx: r.dir[0], dy: r.dir[1], v: 30, t: 0, spin: (rand() - 0.5) * 2 };
      if (calm.matches && !thumb) o.fall.t = 5;   // 動きを減らす設定では、すぐ消す
      if (sel === o) sel = null;
    }
    function stepFalls(dt) {
      let any = false;
      for (const o of items) {
        const f = o.fall;
        if (!f) continue;
        any = true;
        f.t += dt;
        if (f.kind === 'slide') {
          f.v += 320 * dt;
          o.x += f.dx * f.v * dt;
          o.y += f.dy * f.v * dt;
          if (!onBread(o.x, o.y)) o.y += 200 * f.t * dt;   // 中心がパンの縁を越えたら、下へも落ちる
          o.a += f.spin * dt;
          pose(o);
        }
      }
      if (!any) return;
      items = items.filter((o) => !o.fall || o.fall.t < (o.fall.kind === 'slide' ? 1.1 : 0.35));
      dirty = true;
      updateSel();
    }
    // 具の下のマスには刃が届かない
    function updateCover() {
      G.cover.fill(0);
      for (const o of stack()) {
        const i0 = Math.max(0, Math.floor((o.box[0] - G.ox) / G.cell)), i1 = Math.min(G.w - 1, Math.floor((o.box[2] - G.ox) / G.cell));
        const j0 = Math.max(0, Math.floor((o.box[1] - G.oy) / G.cell)), j1 = Math.min(G.h - 1, Math.floor((o.box[3] - G.oy) / G.cell));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * G.w + i;
          if (!G.cover[k] && inPoly(o.poly, G.ox + (i + 0.5) * G.cell, G.oy + (j + 0.5) * G.cell)) G.cover[k] = 1;
        }
      }
    }
    const fellNames = (M, but) => [...M].filter(([o, r]) => o !== but && r.kind !== 'stay').map(([o]) => NAME[o.kind]);
    function report(it, M, verb) {
      const r = M.get(it), nm = NAME[it.kind], others = fellNames(M, it);
      let s = '';
      if (r && r.kind === 'stay') s = `${nm}を${verb}。` + (r.frac < 0.995 ? `下に支えがあるのは ${pct(r.frac)}% だが、重心は支えの上にある。` : '');
      else if (r && r.kind === 'slide') s = `${nm}は重心の下に支えが無いので、滑り落ちた（支えがあったのは ${pct(r.frac)}%）。`;
      else if (r) s = `${nm}はパンの外に出たので、片付けた。`;
      if (others.length) s += `支えを失った${others.join('・')}も落ちた。`;
      if (s) say(s);
    }
    let liftFell = [];   // 持ち上げたときに落ちた具の名前（離したときの知らせに足す）
    function lift(o) {
      items = items.filter((x) => x !== o);
      items.push(o);
      o.lifted = true;
      liftFell = fellNames(resettle(), o);
      if (liftFell.length) say(`${NAME[o.kind]}を持ち上げたので、その上の${liftFell.join('・')}が落ちた。`);
    }
    function drop(o, verb = '載せた') {
      o.lifted = false;
      report(o, resettle(), verb);
      if (liftFell.length) say(msgEl.textContent + `持ち上げたときに、上の${liftFell.join('・')}が落ちた。`);
      liftFell = [];
      updateSel();
    }
    function autoPlace(kind) {
      let it = null;
      for (let i = 0; i < 40 && !it; i++) {
        const c = makeItem(kind, 120 + rand() * 160, 85 + rand() * 150, (rand() - 0.5) * 1.2);
        if (preview(c).kind === 'stay') it = c;
      }
      it = it || makeItem(kind, 200, 160, 0);
      items.push(it);
      sel = it;
      drop(it, 'パンの上に置いた');
    }
    function turnSel(d) {
      if (!sel || sel.fall) return;
      stopDemo();
      sel.a += d;
      pose(sel);
      report(sel, resettle(), '回した');
      updateSel();
    }
    function removeSel() {
      if (!sel) return;
      const o = sel;
      items = items.filter((x) => x !== o);
      sel = null;
      const fell = fellNames(resettle(), o);
      say(`${NAME[o.kind]}を外した。` + (fell.length ? `支えを失った${fell.join('・')}も落ちた。` : ''));
      updateSel();
    }
    function updateSel() {
      const on = !!sel && !sel.fall;
      rotL.disabled = rotR.disabled = delB.disabled = !on;
    }
    const handleDist = (o) => LOCAL[o.kind].rad + 14;
    const handlePos = (o) => [o.x + Math.sin(o.a) * handleDist(o), o.y - Math.cos(o.a) * handleDist(o)];
    const nearHandle = (o, p) => { const h = handlePos(o); return Math.hypot(p[0] - h[0], p[1] - h[1]) < Math.max(9, 18 / S); };

    // ---- 塗り物とナイフ ----
    function take(pt) {
      const before = K.load;
      takeFromPot(K, pt.rgb);
      K.name = before > KNIFE.full * 0.05 && K.name !== pt.name ? '混ざった塗り物' : pt.name;
      wasLoaded = true;
      say(`ナイフに${pt.name}を取った。パンの上をなでると塗れる。`);
      updateLoad();
      dirty = true;
    }
    // 刃の向きを、動く向きへ少しずつ寄せる。刃は前へ動いても後ろへ動いても同じ線なので、180 度の差は無いものとする
    function turnTo(cur, target) {
      let d = target - cur;
      d -= Math.round(d / Math.PI) * Math.PI;
      return cur + d * 0.35;
    }
    function knifeTo(from, p) {
      const dx = p[0] - from[0], dy = p[1] - from[1];
      if (dx * dx + dy * dy < 0.36) return false;
      knifeAng = turnTo(knifeAng, Math.atan2(dy, dx));
      stroke(G, K, from[0], from[1], p[0], p[1], KNIFE, knifeAng);
      spreadDirty = true;
      return true;
    }
    function updateLoad() {
      const f = Math.min(1, K.load / KNIFE.full);
      loadM.value = f;
      const empty = K.load < KNIFE.full * 0.005;
      const lt = empty ? '空' : `${K.name} ${pct(f)}%`;
      if (lt !== lastLoadTxt) loadT.textContent = lastLoadTxt = lt;
      const ct = `塗れた所 ${pct(coverage(G).frac)}%`;
      if (ct !== lastCovTxt) covT.textContent = lastCovTxt = ct;
      if (empty && wasLoaded && !demoRun) say('ナイフの塗り物が無くなった。壺をもう一度押す。空のナイフでなでると、塗った所がならされる。');
      if (empty) wasLoaded = false;
    }

    // ---- 描く ----
    function polyPath(c, P) { c.beginPath(); P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }
    function disc(c, x, y, rx, ry = rx) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
    function rrect(c, x, y, w, h, r) {
      c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    }
    function capsule(c, x0, x1, r) { c.beginPath(); c.arc(x0, 0, r, Math.PI / 2, Math.PI * 1.5); c.arc(x1, 0, r, -Math.PI / 2, Math.PI / 2); c.closePath(); }
    const scaled = (P, k) => P.map(([x, y]) => [x * k, y * k]);
    const BASE = { lettuce: '#7fc55a', ham: '#e9959c', cheese: '#f3c443', tomato: '#d4302a', cucumber: '#2e7b33', egg: '#fbf9ef', berry: '#d62a3a', banana: '#f4eac2' };
    const DETAIL = {
      lettuce(c, P) {
        polyPath(c, scaled(P, 0.82)); c.fillStyle = '#a6dc7b'; c.fill();
        c.strokeStyle = '#e4f6c8'; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-2, 28); c.quadraticCurveTo(2, 0, -2, -28);
        for (const sg of [-1, 1]) for (const y of [-16, -4, 8, 20]) { c.moveTo(0, y); c.quadraticCurveTo(sg * 10, y - 4, sg * 22, y - 10); }
        c.stroke();
        polyPath(c, P); c.strokeStyle = '#4f9a3a'; c.lineWidth = 1.4; c.stroke();
      },
      ham(c) {
        disc(c, 0, 0, 27); c.fillStyle = '#f4b3b7'; c.fill();
        c.strokeStyle = 'rgb(255 236 236 / .7)'; c.lineWidth = 2;
        c.beginPath(); c.arc(-6, -4, 14, 0.3, 2.2); c.moveTo(17, 6); c.arc(8, 6, 9, 0, 1.6); c.stroke();
        disc(c, 0, 0, 31.5); c.strokeStyle = '#c86672'; c.lineWidth = 3; c.stroke();
      },
      cheese(c, P) {
        c.fillStyle = '#d9a22a';
        for (const [x, y, r] of [[-14, -12, 5], [10, -5, 6.5], [-6, 14, 4], [16, 16, 3.5], [-19, 8, 2.5], [4, -21, 2.5]]) { disc(c, x, y, r); c.fill(); }
        polyPath(c, P); c.strokeStyle = '#d29b28'; c.lineWidth = 1.2; c.stroke();
      },
      tomato(c) {
        disc(c, 0, 0, 18.5); c.fillStyle = '#ec5440'; c.fill();
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI * 2 / 3 - Math.PI / 2;
          c.save(); c.translate(Math.cos(a) * 9.5, Math.sin(a) * 9.5); c.rotate(a);
          disc(c, 0, 0, 5, 6.5); c.fillStyle = '#f6b26b'; c.fill();
          c.fillStyle = '#fbe7b0';
          for (const [sx, sy] of [[0, -3], [0, 3], [1.5, 0]]) { disc(c, sx, sy, 1.1, 1.6); c.fill(); }
          c.restore();
        }
        disc(c, 0, 0, 4); c.fillStyle = '#f5c39d'; c.fill();
      },
      cucumber(c) {
        disc(c, 0, 0, 12.4); c.fillStyle = '#d3eca8'; c.fill();
        disc(c, 0, 0, 7.5); c.fillStyle = '#bde08e'; c.fill();
        c.fillStyle = '#f1f7da';
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          c.save(); c.translate(Math.cos(a) * 4.6, Math.sin(a) * 4.6); c.rotate(a); disc(c, 0, 0, 1.6, 0.9); c.fill(); c.restore();
        }
      },
      egg(c, P) {
        disc(c, 0, 1.5, 9, 10.5); c.fillStyle = '#f2ae22'; c.fill();
        disc(c, -1, 0, 5, 5.5); c.fillStyle = '#f7c74e'; c.fill();
        polyPath(c, P); c.strokeStyle = '#e2ddcc'; c.lineWidth = 0.8; c.stroke();
      },
      berry(c, P) {
        polyPath(c, scaled(P, 0.74)); c.fillStyle = '#f39aa1'; c.fill();
        c.strokeStyle = 'rgb(255 245 245 / .85)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(0, -7); c.lineTo(0, 11);
        c.moveTo(0, -4); c.quadraticCurveTo(-6, 0, -5, 7); c.moveTo(0, -4); c.quadraticCurveTo(6, 0, 5, 7); c.stroke();
        c.fillStyle = '#f6dd7c';
        P.forEach(([x, y], i) => { if (i % 3 === 0) { disc(c, x * 0.88, y * 0.88, 0.8); c.fill(); } });
      },
      banana(c, P) {
        polyPath(c, P); c.strokeStyle = '#e2cd86'; c.lineWidth = 1.6; c.stroke();
        c.strokeStyle = 'rgb(205 175 105 / .45)'; c.lineWidth = 0.8; c.beginPath();
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.moveTo(Math.cos(a) * 3, Math.sin(a) * 3); c.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); }
        c.stroke();
        c.fillStyle = '#6d4f27';
        for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.5; disc(c, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0.9); c.fill(); }
      },
    };
    // 具を中心が原点の座標で描く。shadow は [色, ぼかし, 横, 縦]（画面の画素）
    function paintItem(c, kind, shadow) {
      const P = LOCAL[kind].poly;
      c.save();
      if (shadow) { c.shadowColor = shadow[0]; c.shadowBlur = shadow[1]; c.shadowOffsetX = shadow[2]; c.shadowOffsetY = shadow[3]; }
      polyPath(c, P);
      c.fillStyle = BASE[kind];
      c.fill();
      c.restore();
      c.save();
      DETAIL[kind](c, P);
      c.restore();
    }
    function drawItem(o) {
      let alpha = 1, k = o.lifted ? 1.06 : 1;
      const f = o.fall;
      if (f && f.kind === 'slide') alpha = 1 - Math.max(0, f.t - 0.55) / 0.55;
      else if (f) { alpha = 1 - f.t / 0.35; k = Math.max(0.05, 1 - f.t); }
      if (alpha <= 0) return;
      const sd = S * dpr;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(o.x, o.y); ctx.rotate(o.a); ctx.scale(k, k);
      paintItem(ctx, o.kind, o.lifted ? ['rgb(40 20 0 / .35)', 10 * sd, 5 * sd, 8 * sd] : ['rgb(40 20 0 / .3)', 3 * sd, 1.2 * sd, 2 * sd]);
      ctx.restore();
    }
    function drawSel(o, color, handle) {
      const L = LOCAL[o.kind];
      ctx.save();
      ctx.translate(o.x, o.y); ctx.rotate(o.a);
      if (o.lifted) ctx.scale(1.06, 1.06);
      polyPath(ctx, L.poly);
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1.6; ctx.strokeStyle = color; ctx.stroke(); ctx.setLineDash([]);
      if (handle) {
        const d = handleDist(o), r = Math.max(5, 9 / S);
        ctx.beginPath(); ctx.moveTo(0, -L.rad); ctx.lineTo(0, -d + r); ctx.lineWidth = 1.4; ctx.stroke();
        disc(ctx, 0, -d, r); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -d, r * 0.55, -2.6, 0.9); ctx.stroke();
      }
      ctx.restore();
    }
    // ナイフ。ang は動く向きで、刃はそれに直角。柄は右下へ出す
    function drawKnife(x, y, ang) {
      let ax = -Math.sin(ang), ay = Math.cos(ang);
      if (ax + ay < 0) { ax = -ax; ay = -ay; }
      const sd = S * dpr, hf = KNIFE.half;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(Math.atan2(ay, ax));
      ctx.shadowColor = 'rgb(0 0 0 / .3)'; ctx.shadowBlur = 6 * sd; ctx.shadowOffsetX = 3 * sd; ctx.shadowOffsetY = 6 * sd;
      capsule(ctx, -hf + 4, hf, 4.6);
      const gr = ctx.createLinearGradient(0, -4.6, 0, 4.6);
      gr.addColorStop(0, '#f1f4f7'); gr.addColorStop(1, '#aeb7c0');
      ctx.fillStyle = gr; ctx.fill();
      capsule(ctx, hf + 8, hf + 46, 5.6); ctx.fillStyle = '#35393f'; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#c6ccd2'; ctx.fillRect(hf, -3.2, 8, 6.4);
      ctx.fillStyle = '#9aa1a8';
      for (const xx of [hf + 20, hf + 34]) { disc(ctx, xx, 0, 1.3); ctx.fill(); }
      capsule(ctx, -hf + 4, hf, 4.6); ctx.strokeStyle = '#8c959e'; ctx.lineWidth = 0.8; ctx.stroke();
      if (K.load > 1) {
        const s = Math.sqrt(Math.min(1.3, K.load / KNIFE.full));
        disc(ctx, -3, 0, 4 + 15 * s, 1.4 + 3 * s); ctx.fillStyle = rgbOf(K.r, K.g, K.b); ctx.fill();
        disc(ctx, -6, -1, 2 + 6 * s, 0.6 + 0.8 * s); ctx.fillStyle = 'rgb(255 255 255 / .35)'; ctx.fill();
      }
      ctx.restore();
    }
    function renderBread() {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(VW * S * dpr)); c.height = Math.max(1, Math.ceil(VH * S * dpr));
      const b = c.getContext('2d'), sd = S * dpr;
      let s0 = 99;
      const r0 = () => { s0 = (s0 * 16807) % 2147483647; return s0 / 2147483647; };
      b.setTransform(sd, 0, 0, sd, 0, 0);
      // まな板
      b.save();
      b.shadowColor = 'rgb(0 0 0 / .35)'; b.shadowBlur = 14 * sd; b.shadowOffsetY = 6 * sd;
      rrect(b, 14, 10, 372, 282, 22);
      const wood = b.createLinearGradient(0, 10, 0, 292);
      wood.addColorStop(0, '#d9ab72'); wood.addColorStop(1, '#c48f55');
      b.fillStyle = wood; b.fill();
      b.restore();
      b.save();
      rrect(b, 14, 10, 372, 282, 22); b.clip();
      b.strokeStyle = 'rgb(120 70 30 / .13)'; b.lineWidth = 1.2;
      for (let i = 0; i < 26; i++) {
        const y0 = 14 + i * 11 + r0() * 4;
        b.beginPath();
        for (let x = 10; x <= 390; x += 10) {
          const y = y0 + Math.sin(x / 47 + i) * 2.5 + Math.sin(x / 13 + i * 3) * 0.6;
          if (x === 10) b.moveTo(x, y); else b.lineTo(x, y);
        }
        b.stroke();
      }
      b.restore();
      // パンの耳と影
      b.save();
      b.shadowColor = 'rgb(70 35 0 / .35)'; b.shadowBlur = 8 * sd; b.shadowOffsetX = 2 * sd; b.shadowOffsetY = 5 * sd;
      polyPath(b, OUTER);
      const crust = b.createLinearGradient(0, 40, 0, 262);
      crust.addColorStop(0, '#b4682c'); crust.addColorStop(1, '#a05827');
      b.fillStyle = crust; b.fill();
      b.restore();
      // 白い所と気泡の粒
      polyPath(b, CRUMB);
      const crumb = b.createRadialGradient(200, 150, 20, 200, 150, 150);
      crumb.addColorStop(0, '#f8e8c6'); crumb.addColorStop(1, '#eccf98');
      b.fillStyle = crumb; b.fill();
      b.save();
      polyPath(b, CRUMB); b.clip();
      const CB = bboxOf(CRUMB);
      for (let i = 0; i < 1400; i++) {
        const x = CB[0] + r0() * (CB[2] - CB[0]), y = CB[1] + r0() * (CB[3] - CB[1]);
        b.fillStyle = r0() < 0.55 ? 'rgb(170 120 60 / .16)' : 'rgb(255 252 240 / .5)';
        disc(b, x, y, 0.5 + r0() * 1.3, 0.4 + r0() * 0.9); b.fill();
      }
      b.restore();
      polyPath(b, CRUMB); b.strokeStyle = 'rgb(150 90 40 / .35)'; b.lineWidth = 1.2; b.stroke();
      breadImg = c;
    }
    // 塗り物のマスを 1 マス 1 画素の絵にする。光は左上から当て、左上へ向いた斜面を明るくする
    function paintSpread() {
      const d = img.data, w = G.w, h = G.h, T = G.t;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, q = k * 4, t = T[k];
        if (t < 0.02) { d[q + 3] = 0; continue; }
        const gx = (i < w - 1 ? T[k + 1] : t) - (i > 0 ? T[k - 1] : t);
        const gy = (j < h - 1 ? T[k + w] : t) - (j > 0 ? T[k - w] : t);
        const sh = clampTo(1 + (gx + gy) * 0.22 + noise[k] * 0.3 * Math.min(1, t), 0.6, 1.4);
        const sp = Math.max(0, sh - 1.12) * 1.6;
        d[q] = (G.r[k] * sh + sp) * 255;
        d[q + 1] = (G.g[k] * sh + sp) * 255;
        d[q + 2] = (G.b[k] * sh + sp) * 255;
        d[q + 3] = Math.min(1, t / 0.6) * 245;
      }
      sctx.putImageData(img, 0, 0);
    }
    const onBoard = (p) => p[0] > 14 && p[0] < 386 && p[1] > 10 && p[1] < 292;
    const wantKnife = (p) => onBoard(p) && !hitItem(p[0], p[1]) && !(sel && !sel.fall && nearHandle(sel, p));
    function draw() {
      dirty = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#4a3528';
      ctx.fillRect(0, 0, cv.width, cv.height);
      if (!breadImg) renderBread();
      ctx.drawImage(breadImg, OX * dpr, OY * dpr);
      ctx.setTransform(S * dpr, 0, 0, S * dpr, OX * dpr, OY * dpr);
      if (spreadDirty) { spreadDirty = false; paintSpread(); updateLoad(); }
      ctx.save();
      polyPath(ctx, OUTER); ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(spreadCv, G.ox, G.oy, G.w * G.cell, G.h * G.cell);
      ctx.restore();
      for (const o of items) if (!o.lifted) drawItem(o);
      for (const o of items) if (o.lifted) drawItem(o);
      if (sel && !sel.fall) drawSel(sel, pv ? PV_COL[pv.kind] : '#2563c9', !sel.lifted && mode !== 'new' && !demoRun);
      const kp = demoKnife || (hover && (mode === 'spread' || (!mode && wantKnife(hover))) ? hover : null);
      if (kp) drawKnife(kp[0], kp[1], knifeAng);
    }

    // ---- 大きさと座標 ----
    function resize() {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
      S = Math.max(0.05, Math.min(W / VW, H / VH));
      OX = (W - VW * S) / 2; OY = (H - VH * S) / 2;
      breadImg = null;
      dirty = true;
    }
    const toW = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - OX) / S, (e.clientY - r.top - OY) / S]; };

    // ---- パンの画面の操作 ----
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      stopDemo();
      const p = toW(e);
      hover = p;
      cv.setPointerCapture(e.pointerId);
      if (sel && !sel.fall && nearHandle(sel, p)) mode = 'rotate';
      else {
        const o = hitItem(p[0], p[1]);
        if (o) { sel = o; mode = 'press'; off = [p[0] - o.x, p[1] - o.y]; pressAt = [e.clientX, e.clientY]; }
        else { sel = null; mode = 'spread'; last = p; }
      }
      updateSel();
      dirty = true;
    });
    cv.addEventListener('pointermove', (e) => {
      const p = toW(e);
      hover = p;
      dirty = true;
      if (!cv.hasPointerCapture(e.pointerId)) {
        cv.style.cursor = sel && !sel.fall && nearHandle(sel, p) ? 'grab' : hitItem(p[0], p[1]) ? 'grab' : onBoard(p) ? 'none' : 'default';
        return;
      }
      if (mode === 'press' && sel && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 4) {
        mode = 'move';
        cv.style.cursor = 'grabbing';
        lift(sel);
      }
      if (mode === 'move' && sel) {
        sel.x = clampTo(p[0] - off[0], 0, VW); sel.y = clampTo(p[1] - off[1], 0, VH);
        pose(sel);
        pv = preview(sel);
      } else if (mode === 'rotate' && sel) {
        sel.a = Math.atan2(p[1] - sel.y, p[0] - sel.x) + Math.PI / 2;
        pose(sel);
      } else if (mode === 'spread' && last) {
        if (knifeTo(last, p)) last = p;
      }
    });
    cv.addEventListener('lostpointercapture', (e) => {
      if (mode === 'move' && sel) drop(sel, '動かした');
      else if (mode === 'rotate' && sel) { report(sel, resettle(), '回した'); updateSel(); }
      if (e.pointerType !== 'mouse') hover = null;
      mode = null; last = null; pv = null; dirty = true;
    });
    cv.addEventListener('pointerleave', () => { if (!mode) { hover = null; dirty = true; } });
    cv.addEventListener('wheel', (e) => {
      const p = toW(e), o = hitItem(p[0], p[1]);
      if (!o) return;
      e.preventDefault();
      sel = o;
      turnSel(Math.sign(e.deltaY) * Math.PI / 18);
    }, { passive: false });
    cv.addEventListener('keydown', (e) => {
      const st = stack();
      if (!st.length) return;
      if (!sel || sel.fall || !st.includes(sel)) sel = st[st.length - 1];
      const o = sel, d = e.shiftKey ? 16 : 4;
      let verb = '動かした';
      switch (e.key) {
        case 'ArrowLeft': o.x -= d; break;
        case 'ArrowRight': o.x += d; break;
        case 'ArrowUp': o.y -= d; break;
        case 'ArrowDown': o.y += d; break;
        case 'q': case 'Q': o.a -= Math.PI / 12; verb = '回した'; break;
        case 'e': case 'E': o.a += Math.PI / 12; verb = '回した'; break;
        case 'n': case 'N':
          e.preventDefault();
          sel = st[(st.indexOf(o) + 1) % st.length];
          say(`${NAME[sel.kind]}を選んだ。`);
          updateSel(); dirty = true;
          return;
        case 'Delete': case 'Backspace': e.preventDefault(); removeSel(); return;
        default: return;
      }
      e.preventDefault();
      stopDemo();
      o.x = clampTo(o.x, 0, VW); o.y = clampTo(o.y, 0, VH);
      pose(o);
      report(o, resettle(), verb);
      updateSel();
    });
    rotL.addEventListener('click', () => turnSel(-Math.PI / 12));
    rotR.addEventListener('click', () => turnSel(Math.PI / 12));
    delB.addEventListener('click', () => { stopDemo(); removeSel(); });

    // ---- 壺と具のボタン ----
    for (const pt of POTS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pot';
      const sw = document.createElement('i');
      sw.style.setProperty('--c', rgbOf(...pt.rgb));
      b.append(sw, pt.name);
      b.addEventListener('click', () => { stopDemo(); take(pt); });
      $('pots').append(b);
    }
    for (const t of TOPS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'top';
      const ic = document.createElement('canvas');
      ic.width = ic.height = 48;
      const ix = ic.getContext('2d'), k = 22 / LOCAL[t.id].rad;
      ix.setTransform(k, 0, 0, k, 24, 24);
      paintItem(ix, t.id);
      b.append(ic, t.name);
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        stopDemo();
        nd = { btn: b, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, up: false, item: null };
        b.setPointerCapture(e.pointerId);
      });
      b.addEventListener('pointermove', (e) => {
        if (!nd || nd.btn !== b || !b.hasPointerCapture(e.pointerId)) return;
        nd.cx = e.clientX; nd.cy = e.clientY;
        const p = toW(e);
        if (!nd.item) {
          if (Math.hypot(e.clientX - nd.sx, e.clientY - nd.sy) <= 4) return;
          nd.item = makeItem(t.id, p[0], p[1], (rand() - 0.5) * 0.8);
          nd.item.lifted = true;
          items.push(nd.item);
          sel = nd.item; mode = 'new';
          updateSel();
        }
        nd.item.x = p[0]; nd.item.y = p[1];
        pose(nd.item);
        pv = preview(nd.item);
        dirty = true;
      });
      b.addEventListener('pointerup', () => {
        if (!nd || nd.btn !== b) return;
        nd.up = true;
        if (nd.item) dragEndAt = performance.now();
      });
      b.addEventListener('lostpointercapture', () => {
        if (!nd || nd.btn !== b) return;
        const d = nd;
        nd = null; mode = null; pv = null; dirty = true;
        if (!d.item) return;   // 動かさずに離したときは click で置く
        dragEndAt = performance.now();
        const r = cv.getBoundingClientRect();
        if (d.up && d.cx >= r.left && d.cx <= r.right && d.cy >= r.top && d.cy <= r.bottom) drop(d.item);
        else {
          items = items.filter((o) => o !== d.item);
          sel = null;
          say(`${t.name}を戻した。`);
          updateSel();
        }
      });
      b.addEventListener('click', () => {
        if (performance.now() - dragEndAt < 500) return;
        stopDemo();
        autoPlace(t.id);
      });
      $('tray').append(b);
    }

    // ---- 見本の自動の動き ----
    function clearAll() {
      items = []; sel = null; mode = null; pv = null;
      for (const a of [G.t, G.r, G.g, G.b, G.cover]) a.fill(0);
      K.load = 0; K.name = ''; wasLoaded = false;
      spreadDirty = dirty = true;
      updateSel();
    }
    function along(P, u) {   // 折れ線の上で、全体の長さに対して u の位置
      const L = [];
      let tot = 0;
      for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); L.push(l); tot += l; }
      let d = u * tot;
      for (let i = 0; i < L.length; i++) {
        if (d <= L[i] || i === L.length - 1) {
          const f = Math.min(1, d / L[i]);
          return [P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f];
        }
        d -= L[i];
      }
      return P[P.length - 1];
    }
    const ease = (u) => u * u * (3 - 2 * u);
    const once = (d, fn) => { let done = false; return { d, f() { if (!done) { done = true; fn(); } } }; };
    function knifePath(P, d) {
      let prev = null;
      return { d, f(u) {
        const p = along(P, u);
        if (!prev || knifeTo(prev, p)) prev = p;
        demoKnife = u < 1 ? p : null;
      } };
    }
    function bringIn(kind, x, y, a) {
      let it = null;
      return { d: 0.6, f(u) {
        if (!it) { it = makeItem(kind, x - 40, VH + 30, a - 0.6); it.lifted = true; items.push(it); }
        const e = ease(u);
        it.x = x - 40 + 40 * e; it.y = VH + 30 + (y - VH - 30) * e; it.a = a - 0.6 + 0.6 * e;
        pose(it);
        if (u >= 1) drop(it);
      } };
    }
    function demoSteps() {
      return [
        once(0.3, () => { clearAll(); take(POTS[0]); }),
        knifePath([[100, 84], [300, 88], [300, 122], [100, 126], [100, 162], [300, 166], [300, 204], [100, 208], [100, 244], [300, 247]], 3.6),
        once(0.25, () => take(POTS[1])),
        knifePath([[110, 70], [170, 74], [170, 96], [110, 98]], 0.8),
        bringIn('lettuce', 165, 140, 0.2),
        bringIn('ham', 238, 150, 0),
        bringIn('cheese', 192, 192, 0.35),
        bringIn('tomato', 168, 122, 0),
        bringIn('egg', 242, 207, 0),
        bringIn('cucumber', 248, 108, 0),
        bringIn('tomato', 322, 178, 0),
        once(1.8, () => {}),
      ];
    }
    function startDemo() {
      demoRun = { steps: demoSteps(), i: 0, t0: performance.now() };
      demoB.textContent = '見本を止める';
    }
    function stopDemo() {
      if (!demoRun) return;
      demoRun = null; demoKnife = null;
      demoB.textContent = '見本を動かす';
      for (const o of items.filter((x) => x.lifted)) drop(o);
      dirty = true;
    }
    function runDemo(now) {
      const R = demoRun;
      if (!R) return;
      while (R.i < R.steps.length) {
        const st = R.steps[R.i], u = Math.min(1, (now - R.t0) / (st.d * 1000));
        st.f(u);
        if (u < 1) break;
        R.i++;
        R.t0 += st.d * 1000;
      }
      dirty = true;
      if (R.i < R.steps.length) return;
      if (thumb) { startDemo(); return; }
      demoRun = null; demoKnife = null;
      demoB.textContent = '見本を動かす';
      say('見本はここまで。最後のトマトは、重心がパンの縁より外にあったので滑り落ちた。自分でも塗って、具を載せてみてください。');
    }
    demoB.addEventListener('click', () => {
      if (demoRun) { stopDemo(); say('見本を止めた。'); return; }
      startDemo();
      say('見本を動かしている。バターを塗り、ジャムを少し重ね、具を順に載せる。');
    });
    clearB.addEventListener('click', () => { stopDemo(); clearAll(); updateLoad(); say('最初からにした。'); });

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
      lastT = now;
      runDemo(now);
      stepFalls(dt);
      if (dirty || spreadDirty) draw();
    }
    new ResizeObserver(resize).observe(cv);
    resize();
    updateSel();
    updateLoad();
    say('壺（バターなど）を押すとナイフに塗り物が付きます。パンの上をなでると塗れます。具は上の帯からパンへ引いて載せます。');
    if (thumb) startDemo();
    requestAnimationFrame(frame);
  },
});

dekiru.add({
  id: 'tr-20261123-perplexity-compress', c: 'trend', lv: 3, date: '2026-11-23',
  t: '次の文字を当てる力をパープレキシティで測り、その予測で文章を本当に圧縮する（OpenAI「Perplexity and Intelligence」）',
  y: 'つぎのもじをあてるちからをぱーぷれきしてぃではかりそのよそくでぶんしょうをほんとうにあっしゅくする',
  tags: ['Perplexity and Intelligence', 'パープレキシティ', '算術符号', 'n-gram', 'CompressionStream', 'Canvas'],
  d: '2026年11月22日、OpenAI の Chief Scientist の Jakub Pachocki さんが記事「Perplexity and Intelligence」を公開し、Hacker News では取得した時点で 396 点・263 件のコメントを集めていた。記事は、言語モデルの事前学習を「圧縮する道具（次を予測する道具と同じもの）を作ること」と説明する。そして、学習に使っていない文での予測の外れ具合（パープレキシティ。交差エントロピーの損失と同じもの）を、各社で比べる共通の物差しにしようと提案している。社内の値として、GPT‑3.5 が約 0.99、GPT‑4 が約 0.91 で、0.8 を下回ってからサイバーセキュリティや数学で大きな能力が現れたと書いている。この見本では、直前の 0〜6 文字から次の 1 文字を当てる小さなモデル（文字の並びの回数を数え、Witten–Bell の方法でなめらかにしたもの）をブラウザの中で学習させ、学習に使わなかった文で損失とパープレキシティを測る。さらに、そのモデルが出す確率で算術符号を作って文を実際にビット列へ圧縮し、元に戻して一致することを確かめ、ブラウザの deflate（CompressionStream）と大きさを比べる。予測が上手いほど小さく縮む、という記事の前提を手元で確かめられる。再現できていない所: 記事の値はトークン単位で、大きなモデルと OpenAI の社内の評価用データで測ったもの。この見本は 1 文字単位の小さな数え上げのモデルなので、数の大きさは記事の値と比べられない。算術符号は、文字の一覧（学習用の文と当てさせる文に出てくる文字）を送る側と受け取る側が同じものを持っている前提で、一覧を送る分は大きさに入れていない。',
  p: '損失は「実際に来た文字に付けていた確率」の −ln の平均で、e の損失乗がパープレキシティになる。パープレキシティが 4 なら、毎回 4 つの候補から同じ確率で選ぶ場合と同じくらい当てにくい。確率 p の文字は算術符号でおよそ −log₂p ビットで書けるので、損失の合計 ÷ ln 2 ÷ 8 がほぼ圧縮後のバイト数になる。符号を作る側は 32 ビットの整数の区間 [low, high] を文字の確率の幅に狭め、上の桁が決まったら書き出す。受け取る側は同じモデルで同じ確率を計算し、同じ順に区間を狭めて文字を取り出す。確率は整数の度数（合計は 65536 以下、どの文字も 1 以上）に直してから使い、両側の計算の結果がずれないようにしている。',
  refs: [
    { title: 'Perplexity and Intelligence（OpenAI、Jakub Pachocki、2026-11-22）', url: 'https://openai.com/index/perplexity-and-intelligence/' },
    { title: 'Hacker News: Perplexity and Intelligence（2026-11-22）', url: 'https://news.ycombinator.com/item?id=50601525' },
    { title: 'Jakub Pachocki さんの X の投稿（2026-11-22）', url: 'https://x.com/merettm/status/2124549218995949967' },
    { title: 'Arithmetic coding（Wikipedia）', url: 'https://en.wikipedia.org/wiki/Arithmetic_coding' },
  ],
  html: `<div class="app">
  <div class="bar">
    <label class="row">文の組 <select id="preset">
      <option value="ja">天気の日記（日本語）</option>
      <option value="en">天気の日記（英語）</option>
      <option value="rnd">でたらめな英字（当てようがない）</option>
    </select></label>
    <span class="row"><label for="ord">直前の何文字を見るか</label><input type="range" id="ord" min="0" max="6" step="1" value="3"><output id="ordOut" for="ord">3 文字</output></span>
  </div>
  <div class="texts">
    <label>学習に使う文<textarea id="trainT" spellcheck="false"></textarea></label>
    <label>当てさせる文（学習には使わない）<textarea id="testT" spellcheck="false"></textarea></label>
  </div>
  <div class="stats">
    <div class="stat"><span>損失（1 文字あたりの log-perplexity）</span><b id="lossO">-</b><span>ナット</span></div>
    <div class="stat"><span>パープレキシティ（e の損失乗）</span><b id="pplO">-</b><span>個の候補から選ぶのと同じ当てにくさ</span></div>
    <div class="stat"><span>1 文字を書くのに要る長さ</span><b id="bpcO">-</b><span>ビット</span></div>
  </div>
  <div id="heat" class="heat" tabindex="0" aria-label="当てさせる文。色が濃い文字ほど当てられなかった。左右の矢印キーで文字を選ぶと、そのときの予想が下に出る"></div>
  <p id="pick" class="pick" role="status"></p>
  <div class="lower">
    <figure>
      <canvas id="cv" role="img" aria-label="直前の文字数と損失のグラフ"></canvas>
      <figcaption><span class="key k1"></span>学習に使わなかった文　<span class="key k2"></span>学習に使った文（低いほどよく当たる）</figcaption>
    </figure>
    <div class="tw"><table>
      <caption>当てさせる文を縮めた大きさ</caption>
      <thead><tr><th scope="col">やり方</th><th scope="col">バイト</th><th scope="col">1 文字あたりのビット</th></tr></thead>
      <tbody id="cmp"></tbody>
    </table></div>
  </div>
  <p id="note" class="small"></p>
  <p class="small">算術符号の実物には、先頭に文字数（4 バイト）が入っている。deflate の 2 行目は「学習用の文と当てさせる文をつないで縮めた大きさ − 学習用の文だけを縮めた大きさ」で、モデルと同じく学習用の文を先に知っている条件にそろえたもの。</p>
</div>`,
  css: `:root { color-scheme: light; --bg: #f4f2ec; --fg: #23211d; --mut: #625d53; --line: #d6d0c3; --panel: #fffdf8; --acc: #1d6a86; --hot: #d4452a; --train: #8a8478; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .app { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 10px; max-inline-size: 980px; margin-inline: auto; }
    .bar { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; }
    .row { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    select, output { font: inherit; }
    select { max-inline-size: 100%; }
    #ord { accent-color: var(--acc); inline-size: min(200px, 46vw); }
    #ord:focus-visible { outline: 2px solid var(--acc); outline-offset: 4px; }
    output { min-inline-size: 3.5em; font-variant-numeric: tabular-nums; }
    .texts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 8px; }
    .texts label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--mut); }
    textarea { box-sizing: border-box; inline-size: 100%; block-size: 6.5em; resize: vertical; font: 13px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 6px; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .stat { min-inline-size: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; }
    .stat span { font-size: 11px; color: var(--mut); line-height: 1.35; }
    .stat b { font-size: 22px; line-height: 1.25; font-variant-numeric: tabular-nums; }
    .heat { position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; max-block-size: 10.5em; overflow: auto; font-size: 15px; line-height: 1.85; }
    .heat:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    .heat span { border-radius: 2px; background: color-mix(in oklab, var(--hot) calc(var(--s, 0) * 85%), transparent); }
    .heat span.sel { outline: 2px solid var(--acc); outline-offset: 1px; }
    .pick { margin: 0; min-block-size: 3em; font-size: 13px; }
    .pick .ctx { background: #e6eef1; border-radius: 3px; padding-inline: 3px; white-space: pre; }
    .pick .hit { font-weight: 700; color: var(--acc); }
    .lower { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 8px; align-items: start; }
    figure { margin: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px; }
    canvas { display: block; inline-size: 100%; block-size: 180px; }
    figcaption { font-size: 12px; color: var(--mut); }
    .key { display: inline-block; inline-size: 18px; block-size: 0; border-block-start: 3px solid var(--acc); vertical-align: middle; margin-inline-end: 4px; }
    .key.k2 { border-block-start: 3px dashed var(--train); }
    .tw { overflow-x: auto; }
    table { border-collapse: collapse; inline-size: 100%; font-size: 12.5px; background: var(--panel); border: 1px solid var(--line); }
    caption { text-align: start; font-size: 12px; color: var(--mut); padding-block-end: 2px; }
    th, td { border-block-end: 1px solid var(--line); padding: 4px 6px; text-align: start; font-weight: normal; }
    thead th { color: var(--mut); font-size: 11.5px; }
    td.num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    tr.best th { font-weight: 700; }
    .small { font-size: 12px; color: var(--mut); margin: 0; }
    .thumb .texts, .thumb .small, .thumb .tw, .thumb .pick { display: none; }
    .thumb .heat { max-block-size: 6.5em; }
    @media (max-width: 420px) { .stat b { font-size: 18px; } }`,
  core() {
    // 直前の何文字まで数えておくか（スライダーの上限）
    const MAX_ORDER = 6;

    // 文字列を「文字」（コードポイント）の配列にする。改行は \n にそろえる
    function charsOf(text) {
      return Array.from(String(text).replace(/\r\n?/g, '\n'));
    }

    // 学習: 長さ 0〜maxOrder の文脈ごとに、その後に来た文字の回数を数える
    // ctx のキーは文脈の文字列（長さ 0 は ''）、値は { n: 回数の合計, m: 文字 → 回数 }
    function train(chars, maxOrder) {
      const ctx = new Map();
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        let key = '';
        for (let k = 0; k <= maxOrder && k <= i; k++) {
          if (k > 0) key = chars[i - k] + key;
          let node = ctx.get(key);
          if (!node) { node = { n: 0, m: new Map() }; ctx.set(key, node); }
          node.n++;
          node.m.set(c, (node.m.get(c) || 0) + 1);
        }
      }
      return { maxOrder, ctx };
    }

    // 文字の一覧（符号にするとき、送る側と受け取る側が同じ一覧を持つ）
    function alphabetOf(...lists) {
      const s = new Set();
      for (const L of lists) for (const c of L) s.add(c);
      return [...s].sort();
    }

    // 位置 i で、実際に使える文脈の長さ（学習用の文に一度も出なかった文脈は使えない）
    function usedOrder(model, hist, i, order) {
      let key = '', used = -1;
      for (let k = 0; k <= order && k <= i; k++) {
        if (k > 0) key = hist[i - k] + key;
        if (!model.ctx.has(key)) break;
        used = k;
      }
      return used;
    }

    // hist の i 文字目に文字 c が来る確率（Witten–Bell の方法）
    // 短い文脈から順に p = (その文脈で c が来た回数 + 種類数 × 1 つ短い文脈での p) ÷ (その文脈の回数 + 種類数)
    // 一番下は、一覧の K 種類の文字が同じ確率 1/K
    function prob(model, hist, i, order, c, K) {
      let p = 1 / K, key = '';
      for (let k = 0; k <= order && k <= i; k++) {
        if (k > 0) key = hist[i - k] + key;
        const node = model.ctx.get(key);
        if (!node) break;
        const T = node.m.size;
        p = ((node.m.get(c) || 0) + T * p) / (node.n + T);
      }
      return p;
    }

    // 位置 i に来る文字について、一覧の全部の文字の確率（合計は 1）。prob と同じ式を全部の文字に使う
    function dist(model, hist, i, order, alphabet) {
      const K = alphabet.length, p = new Float64Array(K).fill(1 / K);
      let key = '';
      for (let k = 0; k <= order && k <= i; k++) {
        if (k > 0) key = hist[i - k] + key;
        const node = model.ctx.get(key);
        if (!node) break;
        const T = node.m.size, den = node.n + T;
        for (let j = 0; j < K; j++) p[j] = ((node.m.get(alphabet[j]) || 0) + T * p[j]) / den;
      }
      return p;
    }

    // 文を 1 文字ずつ当てさせて、外れ具合を測る
    // bits[i] は i 文字目に付けていた確率の −log2。loss は −ln の平均（log-perplexity）、ppl は e の loss 乗
    function evaluate(model, chars, order, K) {
      const bits = new Float64Array(chars.length);
      let nats = 0;
      for (let i = 0; i < chars.length; i++) {
        const p = prob(model, chars, i, order, chars[i], K);
        nats -= Math.log(p);
        bits[i] = -Math.log2(p);
      }
      const loss = nats / Math.max(1, chars.length);
      return { bits, nats, loss, ppl: Math.exp(loss), bpc: loss / Math.LN2, totalBits: nats / Math.LN2 };
    }

    // 文脈の長さ 0〜maxOrder ごとの損失
    function lossCurve(model, chars, K, maxOrder) {
      const out = [];
      for (let k = 0; k <= maxOrder; k++) out.push(chars.length ? evaluate(model, chars, k, K).loss : NaN);
      return out;
    }

    // 確率の高い順に k 個
    function topK(p, alphabet, k) {
      const idx = Array.from(p, (_, j) => j).sort((a, b) => p[b] - p[a] || (alphabet[a] < alphabet[b] ? -1 : 1));
      return idx.slice(0, k).map((j) => ({ c: alphabet[j], p: p[j] }));
    }

    // 算術符号: 32 ビットの区間 [low, high]。HALF・Q1・Q3 は区間の半分と 4 分の 1 の位置
    const AC = { TOP: 2 ** 32, HALF: 2 ** 31, Q1: 2 ** 30, Q3: 3 * 2 ** 30, TOTAL: 2 ** 16 };

    // 確率を整数の度数の累計にする。どの文字も 1 以上にして、幅 0 で区間が消えないようにする
    // cum[j]〜cum[j+1] が j 番目の文字の幅、cum[K] は total 以下
    function cumFreq(p, total) {
      const K = p.length, spare = total - K;
      if (spare < K) throw new Error('文字の種類が多すぎて符号にできません（' + K + ' 種類）');
      const cum = new Float64Array(K + 1);
      for (let j = 0; j < K; j++) cum[j + 1] = cum[j] + 1 + Math.floor(p[j] * spare);
      return cum;
    }

    // 圧縮: 先頭 32 ビットに文字数、続けて算術符号のビット列
    function encode(model, chars, order, alphabet) {
      const index = new Map(alphabet.map((c, j) => [c, j]));
      const out = [];
      let cur = 0, nb = 0, pending = 0;
      const put = (b) => { cur = (cur << 1) | b; nb++; if ((nb & 7) === 0) { out.push(cur); cur = 0; } };
      // 区間が真ん中をまたいで縮んだときは、次に決まる桁の反対を pending 個まとめて書く
      const emit = (b) => { put(b); for (; pending > 0; pending--) put(1 - b); };
      const n = chars.length, K = alphabet.length;
      for (let s = 31; s >= 0; s--) put(Math.floor(n / 2 ** s) % 2);
      let low = 0, high = AC.TOP - 1;
      for (let i = 0; i < n; i++) {
        const j = index.get(chars[i]);
        if (j === undefined) throw new Error('一覧に無い文字です: ' + chars[i]);
        const cum = cumFreq(dist(model, chars, i, order, alphabet), AC.TOTAL), tot = cum[K];
        const range = high - low + 1;
        high = low + Math.floor(range * cum[j + 1] / tot) - 1;
        low = low + Math.floor(range * cum[j] / tot);
        for (;;) {
          if (high < AC.HALF) emit(0);
          else if (low >= AC.HALF) { emit(1); low -= AC.HALF; high -= AC.HALF; }
          else if (low >= AC.Q1 && high < AC.Q3) { pending++; low -= AC.Q1; high -= AC.Q1; }
          else break;
          low *= 2; high = high * 2 + 1;
        }
      }
      // 終わり: 区間の中に入る値を 2 ビット分（と pending）書く
      pending++;
      emit(low < AC.Q1 ? 0 : 1);
      const bits = nb;
      if (nb & 7) out.push(cur << (8 - (nb & 7)));
      return { bytes: Uint8Array.from(out), bits };
    }

    // 元に戻す: 同じモデルで同じ確率を計算し、同じ順に区間を狭める。読み終えた後のビットは 0 とみなす
    function decode(model, bytes, order, alphabet) {
      let pos = 0;
      const bit = () => { const v = bytes[pos >> 3]; const b = v === undefined ? 0 : (v >> (7 - (pos & 7))) & 1; pos++; return b; };
      let n = 0;
      for (let s = 0; s < 32; s++) n = n * 2 + bit();
      if (n > 1e6) throw new Error('文字数が大きすぎます: ' + n);
      let low = 0, high = AC.TOP - 1, value = 0;
      for (let s = 0; s < 32; s++) value = value * 2 + bit();
      const out = [], K = alphabet.length;
      for (let i = 0; i < n; i++) {
        const cum = cumFreq(dist(model, out, i, order, alphabet), AC.TOTAL), tot = cum[K];
        const range = high - low + 1;
        const target = Math.floor(((value - low + 1) * tot - 1) / range);
        let lo = 0, hi = K - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= target) lo = mid; else hi = mid - 1; }
        out.push(alphabet[lo]);
        high = low + Math.floor(range * cum[lo + 1] / tot) - 1;
        low = low + Math.floor(range * cum[lo] / tot);
        for (;;) {
          if (high < AC.HALF) { /* 上の桁が 0 に決まった。区間を広げるだけ */ }
          else if (low >= AC.HALF) { low -= AC.HALF; high -= AC.HALF; value -= AC.HALF; }
          else if (low >= AC.Q1 && high < AC.Q3) { low -= AC.Q1; high -= AC.Q1; value -= AC.Q1; }
          else break;
          low *= 2; high = high * 2 + 1; value = value * 2 + bit();
        }
      }
      return out;
    }

    // でたらめな文字列（種を決めると毎回同じ並びになる）
    function randomLetters(seed, n, letters) {
      let a = seed >>> 0;
      const out = [];
      for (let i = 0; i < n; i++) {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        out.push(letters[Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * letters.length)]);
      }
      return out.join('');
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const thumb = !!window.THUMB;
    if (thumb) document.documentElement.classList.add('thumb');
    const preset = $('preset'), ord = $('ord'), ordOut = $('ordOut'), trainT = $('trainT'), testT = $('testT');
    const lossO = $('lossO'), pplO = $('pplO'), bpcO = $('bpcO');
    const heat = $('heat'), pick = $('pick'), cv = $('cv'), g = cv.getContext('2d'), cmp = $('cmp'), note = $('note');
    const css = getComputedStyle(document.documentElement);
    const col = (name, alt) => (css.getPropertyValue(name).trim() || alt);
    const C = { acc: col('--acc', '#1d6a86'), train: col('--train', '#8a8478'), line: col('--line', '#d6d0c3'), mut: col('--mut', '#625d53'), fg: col('--fg', '#23211d') };
    const LIMIT = { train: 8000, test: 2000 };

    const JA_TRAIN = [
      '十一月一日。朝は晴れ。気温は八度で、少し寒い。昼から雲が出て、夕方に小雨が降った。駅まで歩いて、パンを買って帰った。',
      '十一月二日。朝はくもり。気温は十度で、風が強い。昼は晴れて、少し暖かくなった。駅まで自転車で行って、本を借りて帰った。',
      '十一月三日。朝は雨。気温は九度で、とても寒い。昼も雨が続いて、夕方にやんだ。家で本を読んで、夜にパンを焼いた。',
      '十一月四日。朝は晴れ。気温は七度で、とても寒い。昼は晴れて、空が青かった。駅まで歩いて、牛乳を買って帰った。',
      '十一月五日。朝はくもり。気温は十一度で、風は弱い。昼から晴れて、暖かくなった。公園まで歩いて、写真を撮って帰った。',
      '十一月六日。朝は晴れ。気温は九度で、少し寒い。昼は雲が多く、夕方に風が強くなった。駅まで自転車で行って、パンを買って帰った。',
      '十一月七日。朝は雨。気温は八度で、風が強い。昼から雨がやんで、夕方は晴れた。家で手紙を書いて、夜に本を読んだ。',
    ].join('\n');
    const JA_TEST = [
      '十一月八日。朝はくもり。気温は九度で、少し寒い。昼から雨が降って、夕方にやんだ。駅まで歩いて、本を借りて帰った。',
      '十一月九日。朝は晴れ。気温は十度で、風は弱い。昼は晴れて、暖かくなった。公園まで自転車で行って、パンを買って帰った。',
    ].join('\n');
    const EN_TRAIN = [
      'Nov 1. Morning was sunny. It was 8 degrees and a little cold. Clouds came in the afternoon and light rain fell in the evening. I walked to the station and bought bread.',
      'Nov 2. Morning was cloudy. It was 10 degrees and windy. The afternoon was sunny and a little warm. I rode my bike to the station and borrowed a book.',
      'Nov 3. Morning was rainy. It was 9 degrees and very cold. The rain went on all afternoon and stopped in the evening. I read a book at home and baked bread at night.',
      'Nov 4. Morning was sunny. It was 7 degrees and very cold. The afternoon was clear and the sky was blue. I walked to the station and bought milk.',
      'Nov 5. Morning was cloudy. It was 11 degrees and calm. The afternoon was sunny and warm. I walked to the park and took photos.',
      'Nov 6. Morning was sunny. It was 9 degrees and a little cold. The afternoon was cloudy and the wind got strong in the evening. I rode my bike to the station and bought bread.',
      'Nov 7. Morning was rainy. It was 8 degrees and windy. The rain stopped in the afternoon and the evening was clear. I wrote a letter at home and read a book at night.',
    ].join('\n');
    const EN_TEST = [
      'Nov 8. Morning was cloudy. It was 9 degrees and a little cold. Rain fell in the afternoon and stopped in the evening. I walked to the station and borrowed a book.',
      'Nov 9. Morning was sunny. It was 10 degrees and calm. The afternoon was sunny and warm. I rode my bike to the park and bought bread.',
    ].join('\n');
    const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
    const PRESETS = {
      ja: { train: JA_TRAIN, test: JA_TEST },
      en: { train: EN_TRAIN, test: EN_TEST },
      rnd: { train: randomLetters(7, 1200, LETTERS), test: randomLetters(11, 300, LETTERS) },
    };

    let S = null, sel = -1, ev = null, dfTok = 0, timer = 0;
    const show = (c) => (c === '\n' ? '改行' : c === ' ' ? '空白' : c);
    const pct = (p) => (p >= 0.1 ? (p * 100).toFixed(0) : p >= 0.001 ? (p * 100).toFixed(1) : (p * 100).toFixed(3)) + '%';
    const fmtPpl = (v) => (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : String(Math.round(v)));

    function load(name) {
      const p = PRESETS[name] || PRESETS.ja;
      trainT.value = p.train;
      testT.value = p.test;
      sel = -1;
      rebuild();
    }

    // 文が変わったとき: 学習し直し、文脈の長さごとの損失を測り、当てさせる文の文字を並べ直す
    function rebuild() {
      let trainC = charsOf(trainT.value), testC = charsOf(testT.value);
      const cut = [];
      if (trainC.length > LIMIT.train) { trainC = trainC.slice(0, LIMIT.train); cut.push('学習用の文は先頭の ' + LIMIT.train + ' 文字だけを使います。'); }
      if (testC.length > LIMIT.test) { testC = testC.slice(0, LIMIT.test); cut.push('当てさせる文は先頭の ' + LIMIT.test + ' 文字だけを使います。'); }
      const model = train(trainC, MAX_ORDER);
      const alphabet = alphabetOf(trainC, testC), K = Math.max(1, alphabet.length);
      const curves = { train: lossCurve(model, trainC, K, MAX_ORDER), test: lossCurve(model, testC, K, MAX_ORDER) };
      const frag = document.createDocumentFragment(), spans = [];
      testC.forEach((c, i) => {
        const s = document.createElement('span');
        s.textContent = c === '\n' ? '↵\n' : c;
        s.dataset.i = String(i);
        spans.push(s);
        frag.append(s);
      });
      heat.replaceChildren(frag);
      S = { trainC, testC, model, alphabet, K, curves, cut, spans, df: null, dfMsg: '', code: null, codeErr: '' };
      if (sel >= testC.length) sel = -1;
      update();
      runDeflate();
    }

    // 文脈の長さが変わったとき: 外れ具合・色・算術符号・表・グラフを作り直す
    function update() {
      if (!S) return;
      const order = Number(ord.value);
      ordOut.textContent = order + ' 文字';
      ord.setAttribute('aria-valuetext', '直前の ' + order + ' 文字');
      const n = S.testC.length;
      ev = evaluate(S.model, S.testC, order, S.K);
      lossO.textContent = n ? ev.loss.toFixed(3) : '-';
      pplO.textContent = n ? fmtPpl(ev.ppl) : '-';
      bpcO.textContent = n ? ev.bpc.toFixed(2) : '-';
      for (let i = 0; i < n; i++) S.spans[i].style.setProperty('--s', Math.min(1, ev.bits[i] / 10).toFixed(3));
      S.code = null; S.codeErr = '';
      if (n) {
        try {
          const t0 = performance.now();
          const enc = encode(S.model, S.testC, order, S.alphabet);
          const back = decode(S.model, enc.bytes, order, S.alphabet);
          S.code = { bytes: enc.bytes.length, bits: enc.bits, same: back.join('') === S.testC.join(''), ms: performance.now() - t0 };
        } catch (e) { S.codeErr = e.message; }
      }
      renderTable();
      drawChart();
      showPick();
    }

    async function deflateSize(str) {
      const s = new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return (await new Response(s).arrayBuffer()).byteLength;
    }
    function runDeflate() {
      const tok = ++dfTok, my = S;
      if (!('CompressionStream' in window)) { my.dfMsg = 'この環境は CompressionStream に未対応のため、deflate の行は空けています。'; renderTable(); return; }
      const tr = my.trainC.join(''), te = my.testC.join('');
      Promise.all([deflateSize(te), deflateSize(tr), deflateSize(tr + te)]).then(([alone, a, ab]) => {
        if (tok !== dfTok) return;
        my.df = { alone, cond: Math.max(0, ab - a) };
        renderTable();
      }).catch((e) => {
        if (tok !== dfTok) return;
        my.dfMsg = 'deflate で縮められませんでした（' + e.message + '）。';
        renderTable();
      });
    }

    function renderTable() {
      const n = S.testC.length, raw = new TextEncoder().encode(S.testC.join('')).length;
      // 3 つ目の値は「実際に縮めた大きさか」。太字の印は、実際に縮めた中で一番小さい行に付ける
      const rows = [
        ['元の文字（UTF-8）', n ? raw : null, false],
        ['deflate で当てさせる文だけを縮める', n && S.df ? S.df.alone : null, true],
        ['deflate に学習用の文を先に読ませる', n && S.df ? S.df.cond : null, true],
        ['このモデルの損失から計算した大きさ', n ? Math.ceil(ev.totalBits / 8) : null, false],
        ['このモデルの予測で算術符号にした実物', S.code ? S.code.bytes : null, true],
      ];
      const known = rows.filter((r) => r[2] && r[1] != null).map((r) => r[1]);
      const best = known.length ? Math.min(...known) : -1;
      const frag = document.createDocumentFragment();
      for (const [name, bytes, real] of rows) {
        const tr = document.createElement('tr');
        if (real && bytes === best) tr.className = 'best';
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = name;
        const b = document.createElement('td'), per = document.createElement('td');
        b.className = per.className = 'num';
        b.textContent = bytes == null ? '-' : String(bytes);
        per.textContent = bytes == null || !n ? '-' : (bytes * 8 / n).toFixed(2);
        tr.append(th, b, per);
        frag.append(tr);
      }
      cmp.replaceChildren(frag);
      const msg = [];
      if (S.code) msg.push(S.code.same ? '算術符号から元に戻した文は、元の文と 1 文字も違わなかった（符号化と復元で ' + S.code.ms.toFixed(0) + ' ms）。' : '元に戻した文が元と一致しなかった。');
      if (S.codeErr) msg.push('算術符号にできませんでした: ' + S.codeErr);
      if (S.dfMsg) msg.push(S.dfMsg);
      msg.push(...S.cut);
      msg.push('記事の値（GPT‑4 で約 0.91 など）は 1 トークンあたりで、ここの値は 1 文字あたりなので、数の大きさは比べられない。');
      note.textContent = msg.join(' ');
    }

    function showPick() {
      for (const s of heat.querySelectorAll('.sel')) s.classList.remove('sel');
      const n = S.testC.length;
      if (sel < 0 || sel >= n) {
        pick.textContent = n ? '色の濃い文字ほど、モデルが当てられなかった文字です。文字を押すか、文を選んで左右の矢印キーを押すと、その時の予想が出ます。' : '当てさせる文を入れてください。';
        return;
      }
      const order = Number(ord.value), c = S.testC[sel];
      S.spans[sel].classList.add('sel');
      const p = dist(S.model, S.testC, sel, order, S.alphabet);
      const top = topK(p, S.alphabet, 5), used = usedOrder(S.model, S.testC, sel, order);
      const pc = p[S.alphabet.indexOf(c)];
      const ctxText = S.testC.slice(Math.max(0, sel - Math.max(0, used)), sel).join('').replace(/\n/g, '↵');
      const span = (cls, text) => { const e = document.createElement('span'); e.className = cls; e.textContent = text; return e; };
      const parts = [];
      if (used > 0) parts.push('直前の ', span('ctx', ctxText), ' の次の文字の予想: ');
      else parts.push((sel === 0 ? '文の始まりなので' : '学習用の文に同じ並びが無いので') + '、文字の多さだけで予想: ');
      top.forEach((t, k) => {
        parts.push(k ? '・' : '');
        parts.push(t.c === c ? span('hit', '「' + show(t.c) + '」' + pct(t.p)) : '「' + show(t.c) + '」' + pct(t.p));
      });
      parts.push('。実際は「' + show(c) + '」で、付けていた確率は ' + pct(pc) + '（' + (-Math.log2(pc)).toFixed(1) + ' ビット）。');
      if (used > 0 && used < order && sel >= order) parts.push('直前の ' + order + ' 文字の並びは学習用の文に無かったので、' + used + ' 文字まで縮めて当てた。');
      pick.replaceChildren(...parts);
    }

    function drawChart() {
      const r = cv.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
      const bw = Math.max(1, Math.round(W * dpr)), bh = Math.max(1, Math.round(H * dpr));
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      if (!S) return;
      const order = Number(ord.value);
      const pad = { l: 34, r: 10, t: 10, b: 24 };
      const vals = [...S.curves.train, ...S.curves.test].filter(Number.isFinite);
      const top = Math.max(0.5, ...vals) * 1.08;
      const X = (k) => pad.l + (Math.max(1, W - pad.l - pad.r)) * k / MAX_ORDER;
      const Y = (v) => pad.t + (Math.max(1, H - pad.t - pad.b)) * (1 - v / top);
      // 選んでいる文脈の長さ
      g.fillStyle = 'rgba(29, 106, 134, 0.10)';
      g.fillRect(X(order) - 10, pad.t, 20, Math.max(0, H - pad.t - pad.b));
      // 目盛り
      g.font = '11px system-ui, sans-serif';
      g.lineWidth = 1;
      const step = top > 6 ? 2 : top > 3 ? 1 : 0.5;
      g.textAlign = 'right'; g.textBaseline = 'middle';
      for (let v = 0; v <= top; v += step) {
        g.strokeStyle = C.line;
        g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(W - pad.r, Y(v)); g.stroke();
        g.fillStyle = C.mut; g.fillText(v.toFixed(step < 1 ? 1 : 0), pad.l - 4, Y(v));
      }
      g.textAlign = 'center'; g.textBaseline = 'top';
      for (let k = 0; k <= MAX_ORDER; k++) { g.fillStyle = k === order ? C.fg : C.mut; g.fillText(String(k), X(k), H - pad.b + 5); }
      const line = (arr, color, dash) => {
        g.strokeStyle = color; g.lineWidth = 2; g.setLineDash(dash);
        g.beginPath();
        let started = false;
        arr.forEach((v, k) => { if (!Number.isFinite(v)) return; if (started) g.lineTo(X(k), Y(v)); else { g.moveTo(X(k), Y(v)); started = true; } });
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = color;
        arr.forEach((v, k) => { if (Number.isFinite(v)) { g.beginPath(); g.arc(X(k), Y(v), k === order ? 4 : 2.5, 0, Math.PI * 2); g.fill(); } });
      };
      line(S.curves.train, C.train, [5, 4]);
      line(S.curves.test, C.acc, []);
      const say = (arr) => arr.map((v, k) => k + ' 文字 ' + (Number.isFinite(v) ? v.toFixed(2) : '-')).join('、');
      cv.setAttribute('aria-label', '直前に見る文字数と損失（ナット）のグラフ。学習に使わなかった文: ' + say(S.curves.test) + '。学習に使った文: ' + say(S.curves.train) + '。');
    }

    function choose(i, byKey) {
      sel = i;
      showPick();
      if (byKey && S.spans[i]) {
        // 枠の中だけを動かす（ページ全体は動かさない）
        const s = S.spans[i], t = s.offsetTop;
        if (t < heat.scrollTop) heat.scrollTop = t;
        else if (t + s.offsetHeight > heat.scrollTop + heat.clientHeight) heat.scrollTop = t + s.offsetHeight - heat.clientHeight;
      }
    }
    heat.addEventListener('click', (e) => { const s = e.target.closest('span[data-i]'); if (s) choose(Number(s.dataset.i), false); });
    heat.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse') return; const s = e.target.closest('span[data-i]'); if (s) choose(Number(s.dataset.i), false); });
    heat.addEventListener('keydown', (e) => {
      const n = S ? S.testC.length : 0;
      if (!n) return;
      let k;
      if (e.key === 'ArrowRight') k = sel < 0 ? 0 : Math.min(n - 1, sel + 1);
      else if (e.key === 'ArrowLeft') k = sel < 0 ? 0 : Math.max(0, sel - 1);
      else if (e.key === 'Home') k = 0;
      else if (e.key === 'End') k = n - 1;
      else return;
      e.preventDefault();
      choose(k, true);
    });
    ord.addEventListener('input', update);
    preset.addEventListener('change', () => load(preset.value));
    const later = () => { clearTimeout(timer); timer = setTimeout(rebuild, 300); };
    trainT.addEventListener('input', later);
    testT.addEventListener('input', later);
    new ResizeObserver(() => drawChart()).observe(cv);

    if (thumb) ord.value = '0';
    load('ja');
    if (thumb) {
      // 一覧の小窓: 見る文字数を 0 から 6 まで順に増やし、色と損失が変わる様子を見せる
      let k = 0;
      setInterval(() => {
        k = (k + 1) % (MAX_ORDER + 1);
        ord.value = String(k);
        update();
      }, 1000);
    }
  },
});

dekiru.add({
  id: 'tr-20261123-ntp-offset', c: 'trend', lv: 2, date: '2026-11-23',
  t: '行きと帰りの4つの時刻から時計のずれを計算し、くるった進み方まで直す（NTP の時刻合わせ）',
  y: 'いきとかえりのよっつのじこくからとけいのずれをけいさんしくるったすすみかたまでなおす',
  tags: ['NTP', 'NTP Pool', 'chrony', '時刻合わせ', 'Canvas'],
  d: '2026年11月17日、Jeff Geerling さんが記事「I joined the NTP Pool, but not with my Stratum 1 Pi」を公開した。11月22日に Hacker News に投稿され、取得した時点で 134 点・42 件のコメントを集めていた。記事では、衛星（GNSS）の信号で時刻を合わせた Raspberry Pi（Stratum 1）から VPS の時刻サーバー（Stratum 2）へ時刻を渡し、世界中の機械が時刻を問い合わせる NTP Pool に加わった経緯、chrony の設定、サーバーが止まってから採点が戻るまでの様子を書いている。比べている Cloudflare の時刻サーバーの線がときどき段になって上下するのは、行きと帰りで通る経路が変わるためだろう、とも書いている。この見本では、NTP の問い合わせ1回で記録する4つの時刻から、相手とのずれ θ と往復の時間 δ を計算する様子を図にする。そして、くるった時計を2つのやり方で合わせて比べる。1つは毎回、測ったずれをそのまま足すやり方。もう1つは、直近 8 回のうち往復が一番短い回を選び、ずれを少しずつ直しながら進み方（周波数）も直すやり方（NTP 風）。2つの時計は同じ回線の待ち時間で問い合わせる。行きと帰りの時間に差をつけると、NTP 風のやり方でもその差の半分だけずれたまま落ち着き、測ったずれは 0 に見えることを確かめられる。再現できていない所: 回線と時刻サーバーは乱数で作った模擬で、本物の時刻サーバーには問い合わせない（ブラウザから NTP の UDP の通信は送れない）。直し方は ntpd や chrony の仕組みを大きく省いたもの。複数のサーバーから良いものを選ぶ処理、問い合わせの間隔を 64〜1024 秒で変える処理、chrony の回帰による推定、直す速さの上限などは入れていない。NTP Pool がサーバーを採点する仕組み、衛星の PPS 信号、ネットワークの部品が付ける時刻（ハードウェアのタイムスタンプ）も扱っていない。',
  p: '自分が送った時刻 t1、相手が受け取った時刻 t2、相手が返した時刻 t3、自分が受け取った時刻 t4 の4つがあれば、往復の時間は δ = (t4 − t1) − (t3 − t2)、ずれは θ = ((t2 − t1) + (t3 − t4)) ÷ 2 で出る（RFC 5905 と同じ式）。θ が正しいのは行きと帰りの時間が同じときだけで、違うと「行き − 帰り」の半分だけ外れる。回線の混雑で待たされた回ほど外れが大きくなりやすいので、往復が短い回を選ぶと誤差が小さくなる（右下の図で、どの点も三角形の内側に入り、左の先ほど狭い）。時計の進み方がくるっていると、ずれだけ直しても次の問い合わせまでにまたずれる。そこで θ の一部で時計を動かし（比例）、θ に比例した量を進み方の直しへ足し続ける（積分）。同じ回の θ を2度使わないように、使った回の番号を覚えておく。',
  refs: [
    { title: 'I joined the NTP Pool, but not with my Stratum 1 Pi（Jeff Geerling、2026-11-17）', url: 'https://www.jeffgeerling.com/blog/2026/i-joined-the-ntp-pool/' },
    { title: 'Hacker News: I joined the NTP Pool, but not with my Stratum 1 Pi（2026-11-22）', url: 'https://news.ycombinator.com/item?id=50600622' },
    { title: 'RFC 5905: Network Time Protocol Version 4', url: 'https://www.rfc-editor.org/rfc/rfc5905' },
    { title: 'NTP Pool Project', url: 'https://www.ntppool.org/' },
  ],
  html: `<div class="app">
  <div class="bar">
    <label class="ctl"><span class="nm">自分の時計のくるい <small id="dayO"></small></span><input type="range" id="ppm" min="-200" max="200" step="10" value="80"><output id="ppmO" for="ppm"></output></label>
    <label class="ctl"><span class="nm">回線の混み具合（待たされる時間の平均）</span><input type="range" id="jit" min="0" max="40" step="1" value="12"><output id="jitO" for="jit"></output></label>
    <label class="ctl"><span class="nm">行きと帰りの時間の差（行き − 帰り）</span><input type="range" id="asym" min="-20" max="20" step="1" value="0"><output id="asymO" for="asym"></output></label>
    <div class="btns"><button type="button" id="route">経路を変える</button><button type="button" id="pause">止める</button><button type="button" id="reset">最初から</button></div>
  </div>
  <div class="stats">
    <div class="stat"><span>測ったずれ θ（NTP 風の時計）</span><b id="thO">-</b><span>ms</span></div>
    <div class="stat"><span>往復の時間 δ</span><b id="dlO">-</b><span>ms</span></div>
    <div class="stat"><span>NTP 風の時計の本当のずれ</span><b id="eN" class="n">-</b><span id="rN">ms</span></div>
    <div class="stat"><span>毎回そのまま合わせた時計の本当のずれ</span><b id="eS" class="r">-</b><span id="rS">ms</span></div>
    <div class="stat"><span>NTP 風の時計の進み方の直し</span><b id="fO">-</b><span id="fSub">ppm</span></div>
  </div>
  <figure>
    <canvas id="ex" role="img" aria-label="最新の問い合わせ。自分が t1 に送り、相手が t2 に受け取り、t3 に返し、自分が t4 に受け取る"></canvas>
    <p class="fx">ずれ θ = ((t2 − t1) + (t3 − t4)) ÷ 2 = ((<span id="fa">-</span>) + (<span id="fb">-</span>)) ÷ 2 = <b id="fth">-</b> ms<br>往復 δ = (t4 − t1) − (t3 − t2) = <span id="fc">-</span> − <span id="fd">-</span> = <b id="fdl">-</b> ms</p>
    <p class="small" id="truth"></p>
    <p class="why" id="why"></p>
  </figure>
  <div class="lower">
    <figure>
      <canvas id="gr" role="img" aria-label="2つの時計の本当のずれの移り変わり"></canvas>
      <figcaption><span class="key"></span>NTP 風（往復が一番短い回を選び、進み方も直す）　<span class="key raw"></span>毎回、測ったずれをそのまま足す　<span class="key dash"></span>行きと帰りの差 ÷ 2。縦は本当のずれ（ms）、横は時間（分）</figcaption>
    </figure>
    <figure class="wedge">
      <canvas id="wd" role="img" aria-label="往復の時間と、測ったずれの誤差の散らばり"></canvas>
      <figcaption>横は往復の時間 δ、縦は θ の誤差（ms）。点は直近 60 回（往復が特に長い 1 割は図の外）で、<span class="dot"></span>は NTP 風の時計が直すのに使った回。どの点も色の付いた三角形の中に入る</figcaption>
    </figure>
  </div>
  <p class="small">2つの時計は同じ時刻サーバーに 16 秒ごとに問い合わせ、回線で待たされる時間も同じ乱数を使う。1 回の問い合わせを 0.45 秒で見せている。「本当のずれ」は模擬なので分かる値で、実際の時計からは見えない。</p>
</div>`,
  css: `:root { color-scheme: light; --bg: #f4f2ec; --fg: #23211d; --mut: #625d53; --line: #d6d0c3; --panel: #fffdf8; --ntp: #1d6a86; --raw: #c2492f; --srv: #2f7d4f; --soft: #dcebee; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .app { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 10px; max-inline-size: 980px; margin-inline: auto; }
    .bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 6px 16px; align-items: end; }
    .ctl { display: flex; flex-wrap: wrap; align-items: center; gap: 0 8px; min-inline-size: 0; }
    .ctl .nm { flex: 1 0 100%; font-size: 12px; color: var(--mut); line-height: 1.35; }
    .ctl small { font-size: 11.5px; }
    .ctl input { flex: 1 1 100px; min-inline-size: 0; margin: 4px 0; }
    .ctl output { flex: 0 0 auto; min-inline-size: 5.2em; text-align: end; font-size: 13px; font-variant-numeric: tabular-nums; }
    input[type="range"]:focus-visible, button:focus-visible { outline: 2px solid var(--ntp); outline-offset: 2px; }
    .btns { display: flex; flex-wrap: wrap; gap: 6px; }
    button { font: inherit; font-size: 13px; padding: 4px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; }
    button:hover { border-color: var(--mut); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 6px; }
    .stat { min-inline-size: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; }
    .stat span { font-size: 11px; color: var(--mut); line-height: 1.35; }
    .stat b { font-size: 21px; line-height: 1.25; font-variant-numeric: tabular-nums; }
    .stat b.n { color: var(--ntp); }
    .stat b.r { color: var(--raw); }
    figure { margin: 0; min-inline-size: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px; }
    canvas { display: block; inline-size: 100%; }
    #ex { block-size: 132px; }
    #gr, #wd { block-size: 210px; }
    .fx { margin: 4px 0 2px; font-size: 12.5px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .why { margin: 2px 0 0; font-size: 12.5px; min-block-size: 2.7em; }
    .lower { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 8px; align-items: start; }
    @media (max-width: 640px) { .lower { grid-template-columns: minmax(0, 1fr); } }
    figcaption { font-size: 12px; color: var(--mut); line-height: 1.45; }
    .key { display: inline-block; inline-size: 18px; block-size: 0; border-block-start: 3px solid var(--ntp); vertical-align: middle; margin-inline-end: 4px; }
    .key.raw { border-block-start-color: var(--raw); }
    .key.dash { border-block-start: 2px dashed var(--mut); }
    .dot { display: inline-block; inline-size: 8px; block-size: 8px; border-radius: 50%; background: var(--ntp); vertical-align: middle; margin-inline: 2px; }
    .small { font-size: 12px; color: var(--mut); margin: 0; }
    .thumb .bar, .thumb .stats, .thumb .fx, .thumb .why, .thumb .small, .thumb figcaption, .thumb .wedge { display: none; }
    .thumb .app { padding: 6px; gap: 6px; }
    .thumb #ex { block-size: 96px; }
    .thumb #gr { block-size: 108px; }`,
  core() {
    // 1回の問い合わせで記録する4つの時刻から、相手との時計のずれ θ と往復の時間 δ を出す（RFC 5905 と同じ式）
    //   t1: 自分が送った時刻（自分の時計）  t2: 相手が受け取った時刻（相手の時計）
    //   t3: 相手が返した時刻（相手の時計）  t4: 自分が受け取った時刻（自分の時計）
    // θ は「相手の時計 − 自分の時計」。行きと帰りにかかる時間が同じときだけ正しい値になる
    function offsetDelay(t1, t2, t3, t4) {
      return { offset: ((t2 - t1) + (t3 - t4)) / 2, delay: (t4 - t1) - (t3 - t2) };
    }

    // 往復が一番短かった回の番号。同じ長さなら新しい方（無ければ -1）
    function pickBest(samples) {
      let b = -1;
      for (let i = 0; i < samples.length; i++) if (b < 0 || samples[i].delay <= samples[b].delay) b = i;
      return b;
    }

    // 種を決めると毎回同じ並びになる乱数（0 以上 1 未満）
    function rng(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // 回線の混雑で増える待ち時間（ms）。短いことが多く、ときどき長い（指数分布）
    function queueDelay(mean, rnd) {
      return mean > 0 ? -mean * Math.log(1 - rnd()) : 0;
    }

    // 1回分の回線の様子: 行きの時間 df、帰りの時間 db、相手の中での処理の時間 proc（ms）
    // p.base は混雑が無いときの片道の時間、p.asym は「行き − 帰り」、p.jitter は待ち時間の平均
    function netSample(p, rnd) {
      return {
        df: Math.max(0.2, p.base + p.asym / 2 + queueDelay(p.jitter, rnd)),
        db: Math.max(0.2, p.base - p.asym / 2 + queueDelay(p.jitter, rnd)),
        proc: 0.05 + rnd() * 0.25,
      };
    }

    const FILTER = 8;     // 往復の長さを比べる回数（直近の何回か）
    const KP = 0.4;       // 測ったずれのうち、1回で直す割合
    const KI = 0.03;      // 進み方（周波数）を直す強さ
    const STEP_MS = 128;  // 最初にこれより大きくずれていたら、少しずつではなく一度に合わせる

    // 模擬の時計。e は「自分の時計 − 本当の時刻」（ms）、f は進み方の直し（ppm）
    function makeSim(e0) {
      return { t: 0, e: e0, f: 0, n: 0, used: -1, samples: [] };
    }

    // p.tau 秒待ってから1回問い合わせ、決めたやり方で自分の時計を直す。
    // p.mode: 'step'（毎回そのまま足す）または 'ntp'（往復が一番短い回を選び、進み方も直す）
    // p.ppm: 自分の時計の本当のくるい（100 万分の 1 単位）
    function poll(s, p, net) {
      const tau = p.tau;
      s.t += tau;
      s.e += (p.ppm + s.f) * 1e-3 * tau;              // 待っている間に、くるいと直しの差の分だけずれる
      const before = s.e;
      const T1 = s.t * 1000;                          // 送った瞬間の本当の時刻（ms）
      const t1 = T1 + s.e;
      const t2 = T1 + net.df;                         // 相手の時計は正しいとする
      const t3 = t2 + net.proc;
      const t4 = t3 + net.db + s.e;
      const m = offsetDelay(t1, t2, t3, t4);
      const sample = { id: s.n++, offset: m.offset, delay: m.delay };
      s.samples.push(sample);
      if (s.samples.length > FILTER) s.samples.shift();
      const best = s.samples[pickBest(s.samples)];
      let adj = 0, usedId = -1;
      if (p.mode === 'step' || (sample.id === 0 && Math.abs(m.offset) > STEP_MS)) {
        adj = sample.offset;
        usedId = sample.id;
      } else if (best.id !== s.used) {                // 同じ回の θ は2度使わない
        adj = KP * best.offset;
        s.f += (KI * best.offset / tau) * 1e3;        // ms/秒 を ppm に直して足す
        usedId = best.id;
      }
      if (usedId >= 0) s.used = usedId;
      if (adj) {
        s.e += adj;
        for (const x of s.samples) x.offset -= adj;   // 前の回の θ も、時計を動かした分だけ直しておく
      }
      return { id: sample.id, t1, t2, t3, t4, df: net.df, db: net.db, offset: m.offset, delay: m.delay,
        err: m.offset + before, before, after: s.e, adj, usedId, bestId: best.id, bestDelay: best.delay };
    }

    // 二乗平均（ずれの大きさの目安）
    function rms(list) {
      let sum = 0;
      for (const v of list) sum += v * v;
      return list.length ? Math.sqrt(sum / list.length) : 0;
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const thumb = !!window.THUMB;
    if (thumb) document.documentElement.classList.add('thumb');
    const ex = $('ex'), gr = $('gr'), wd = $('wd');
    const gx = ex.getContext('2d'), gg = gr.getContext('2d'), gw = wd.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const col = (n, alt) => css.getPropertyValue(n).trim() || alt;
    const C = { fg: col('--fg', '#23211d'), mut: col('--mut', '#625d53'), line: col('--line', '#d6d0c3'), ntp: col('--ntp', '#1d6a86'), raw: col('--raw', '#c2492f'), srv: col('--srv', '#2f7d4f'), soft: col('--soft', '#dcebee') };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const TAU = 16, BASE = 12, WINDOW = 120, WEDGE = 60, RECENT = 30, E0 = 25;
    const PERIOD = 450, ANIM = 380;
    const P = { ppm: 80, jitter: 12, asym: 0, base: BASE, tau: TAU };
    const ppmI = $('ppm'), jitI = $('jit'), asymI = $('asym'), pauseB = $('pause');
    let simN, simS, R, histN, histS, dots, lastN = null, lastS = null;
    let running = true, acc = 0, prevT = 0, animAt = -1e9, dirty = true;

    const sg = (v, d = 2) => {
      const a = Math.abs(v).toFixed(d);
      return (Number(a) === 0 ? '' : v < 0 ? '−' : '+') + a;
    };
    // 自分や相手の時計の読み（分:秒、0.1 ms まで）
    function clock(ms) {
      const u = Math.max(0, Math.round(ms * 10));
      const m = Math.floor(u / 600000);
      return String(m).padStart(2, '0') + ':' + ((u - m * 600000) / 10000).toFixed(4).padStart(7, '0');
    }
    function niceStep(m) {
      for (const s of [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]) if (m / s <= 3) return s;
      return 1000;
    }

    function reset() {
      simN = makeSim(E0); simS = makeSim(E0); R = rng(20261123);
      histN = [{ t: 0, before: E0, after: E0 }]; histS = [{ t: 0, before: E0, after: E0 }];
      dots = []; lastN = lastS = null; acc = 0; dirty = true;
    }

    // 同じ回線の様子で、2つの時計が1回ずつ問い合わせる
    function stepOnce() {
      const net = netSample(P, R);
      lastN = poll(simN, { ...P, mode: 'ntp' }, net);
      lastS = poll(simS, { ...P, mode: 'step' }, net);
      histN.push({ t: simN.t, before: lastN.before, after: lastN.after });
      histS.push({ t: simS.t, before: lastS.before, after: lastS.after });
      if (histN.length > WINDOW + 1) { histN.shift(); histS.shift(); }
      dots.push({ id: lastN.id, delay: lastN.delay, err: lastN.err, asym: P.asym, used: false });
      if (dots.length > WEDGE) dots.shift();
      if (lastN.usedId >= 0) { const d = dots.find((x) => x.id === lastN.usedId); if (d) d.used = true; }
      animAt = performance.now();
      dirty = true;
    }

    function fit(cv, ctx) {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const cw = Math.max(1, cv.clientWidth), ch = Math.max(1, cv.clientHeight);
      const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: cw, h: ch };
    }
    function seg(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    function arrow(ctx, x1, y1, x2, y2) {
      seg(ctx, x1, y1, x2, y2);
      const a = Math.atan2(y2 - y1, x2 - x1), k = 7;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - k * Math.cos(a - 0.4), y2 - k * Math.sin(a - 0.4));
      ctx.lineTo(x2 - k * Math.cos(a + 0.4), y2 - k * Math.sin(a + 0.4));
      ctx.closePath();
      ctx.fill();
    }

    // 上: 最新の問い合わせの4つの時刻
    function drawEx(now) {
      const { w, h } = fit(ex, gx);
      gx.clearRect(0, 0, w, h);
      const yS = 30, yC = h - 28, x0 = 6, x1 = w - 6;
      const narrow = w < 380;
      gx.font = (narrow ? '10.5px' : '11.5px') + ' system-ui, sans-serif';
      gx.lineWidth = 2;
      gx.strokeStyle = C.srv; seg(gx, x0, yS, x1, yS);
      gx.strokeStyle = C.ntp; seg(gx, x0, yC, x1, yC);
      gx.textBaseline = 'bottom'; gx.textAlign = 'left';
      gx.fillStyle = C.srv; gx.fillText('相手（時刻サーバー）', x0, yS - 5);
      gx.fillStyle = C.ntp; gx.fillText('自分（NTP 風の時計）', x0, yC - 5);
      if (!lastN) return;
      const o = lastN, total = o.df + (o.t3 - o.t2) + o.db;
      const L = w * (narrow ? 0.34 : 0.3), Rr = w - (narrow ? 12 : 0.12 * w);
      const X = (ms) => L + (ms / total) * (Rr - L);
      const p1 = [X(0), yC], p2 = [X(o.df), yS], p3 = [X(o.df + (o.t3 - o.t2)), yS], p4 = [X(total), yC];
      gx.strokeStyle = C.mut; gx.fillStyle = C.mut; gx.lineWidth = 1.5;
      arrow(gx, p1[0], p1[1], p2[0], p2[1]);
      arrow(gx, p3[0], p3[1], p4[0], p4[1]);
      gx.fillStyle = C.fg;
      for (const q of [p1, p2, p3, p4]) { gx.beginPath(); gx.arc(q[0], q[1], 3, 0, Math.PI * 2); gx.fill(); }
      gx.textBaseline = 'bottom';
      gx.textAlign = 'right'; gx.fillText('t2 ' + clock(o.t2), p2[0] - 4, yS - 5);
      gx.textAlign = 'left'; gx.fillText('t3 ' + clock(o.t3), p3[0] + 4, yS - 5);
      gx.textBaseline = 'top';
      gx.textAlign = 'center'; gx.fillText('t1 ' + clock(o.t1), p1[0], yC + 5);
      gx.textAlign = 'right'; gx.fillText('t4 ' + clock(o.t4), Math.min(w - 4, p4[0] + 40), yC + 5);
      // 行き来する問い合わせの印
      const u = (now - animAt) / ANIM;
      if (!reduce && u >= 0 && u < 1) {
        const ms = u * total;
        let x, y;
        if (ms < o.df) { const k = ms / o.df; x = p1[0] + (p2[0] - p1[0]) * k; y = p1[1] + (p2[1] - p1[1]) * k; }
        else if (ms < o.df + (o.t3 - o.t2)) { x = p2[0]; y = yS; }
        else { const k = (ms - o.df - (o.t3 - o.t2)) / o.db; x = p3[0] + (p4[0] - p3[0]) * k; y = p3[1] + (p4[1] - p3[1]) * k; }
        gx.fillStyle = C.ntp; gx.beginPath(); gx.arc(x, y, 5, 0, Math.PI * 2); gx.fill();
      }
    }

    // 左下: 2つの時計の本当のずれ
    function drawGraph() {
      const { w, h } = fit(gr, gg);
      gg.clearRect(0, 0, w, h);
      const padL = 46, padR = 8, padT = 8, padB = 20;
      const pw = Math.max(1, w - padL - padR), ph = Math.max(1, h - padT - padB);
      const span = WINDOW * TAU;
      const tEnd = Math.max(span, histN[histN.length - 1].t), tStart = tEnd - span;
      const X = (t) => padL + ((t - tStart) / span) * pw;
      let m = Math.abs(P.asym / 2) + 0.25;
      for (const H of [histN, histS]) for (let i = Math.max(0, H.length - 40); i < H.length; i++) m = Math.max(m, Math.abs(H[i].before), Math.abs(H[i].after));
      const st = niceStep(m), n = Math.max(1, Math.ceil((m * 1.08) / st)), topV = n * st;
      const Y = (v) => padT + ph / 2 - (v / topV) * (ph / 2);
      gg.font = '10.5px system-ui, sans-serif';
      gg.lineWidth = 1;
      gg.textAlign = 'right'; gg.textBaseline = 'middle';
      for (let k = -n; k <= n; k++) {
        const v = k * st;
        gg.strokeStyle = k === 0 ? C.mut : C.line;
        seg(gg, padL, Y(v), padL + pw, Y(v));
        gg.fillStyle = C.mut;
        gg.fillText(sg(v, st < 1 ? 2 : 0), padL - 4, Y(v));
      }
      gg.textAlign = 'center'; gg.textBaseline = 'top';
      for (let t = Math.ceil(tStart / 300) * 300; t <= tEnd; t += 300) {
        if (t < 0) continue;
        gg.fillText(Math.round(t / 60) + ' 分', X(t), padT + ph + 4);
      }
      gg.save();
      gg.beginPath(); gg.rect(padL, padT, pw, ph); gg.clip();
      if (P.asym) {
        gg.setLineDash([5, 4]); gg.strokeStyle = C.mut;
        seg(gg, padL, Y(P.asym / 2), padL + pw, Y(P.asym / 2));
        gg.setLineDash([]);
      }
      for (const [H, c, lw] of [[histS, C.raw, 1.4], [histN, C.ntp, 2]]) {
        gg.strokeStyle = c; gg.lineWidth = lw; gg.lineJoin = 'round';
        gg.beginPath();
        gg.moveTo(X(H[0].t), Y(H[0].after));
        for (let i = 1; i < H.length; i++) { gg.lineTo(X(H[i].t), Y(H[i].before)); gg.lineTo(X(H[i].t), Y(H[i].after)); }
        gg.stroke();
      }
      gg.restore();
    }

    // 右下: 往復の時間と θ の誤差。誤差は（行き − 帰り）÷ 2 なので、どの点も三角形の中に入る
    function drawWedge() {
      const { w, h } = fit(wd, gw);
      gw.clearRect(0, 0, w, h);
      const padL = 40, padR = 8, padT = 8, padB = 30;
      const pw = Math.max(1, w - padL - padR), ph = Math.max(1, h - padT - padB);
      const d0 = 2 * BASE, a = P.asym / 2;
      // 横は往復の短い方から 9 割の回まで（まれに来るとても長い往復で、三角形の先がつぶれないように）
      const ds = dots.map((d) => d.delay).sort((p, q) => p - q);
      const d90 = ds.length ? ds[Math.floor((ds.length - 1) * 0.9)] : d0;
      const xMin = d0 - 4, xMax = Math.max(d0 + 12, d90) + 4;
      // 縦は三角形が右端でちょうど収まる高さ
      const eMax = Math.abs(a) + (xMax - d0) / 2;
      const st = niceStep(eMax), n = Math.max(1, Math.ceil((eMax * 1.05) / st)), topV = n * st;
      const X = (d) => padL + ((d - xMin) / (xMax - xMin)) * pw;
      const Y = (e) => padT + ph / 2 - (e / topV) * (ph / 2);
      gw.font = '10.5px system-ui, sans-serif';
      gw.lineWidth = 1;
      gw.textAlign = 'right'; gw.textBaseline = 'middle';
      for (let k = -n; k <= n; k++) {
        gw.strokeStyle = k === 0 ? C.mut : C.line;
        seg(gw, padL, Y(k * st), padL + pw, Y(k * st));
        gw.fillStyle = C.mut;
        gw.fillText(sg(k * st, st < 1 ? 2 : 0), padL - 4, Y(k * st));
      }
      const xs = niceStep((xMax - xMin) / 1.6);
      gw.textAlign = 'center'; gw.textBaseline = 'top';
      for (let d = Math.ceil(xMin / xs) * xs; d <= xMax; d += xs) gw.fillText(String(d), X(d), padT + ph + 3);
      gw.textAlign = 'right';
      gw.fillText('往復 δ（ms）', padL + pw, padT + ph + 16);
      gw.save();
      gw.beginPath(); gw.rect(padL, padT, pw, ph); gw.clip();
      const r = xMax - d0;
      gw.fillStyle = C.soft;
      gw.beginPath(); gw.moveTo(X(d0), Y(a)); gw.lineTo(X(xMax), Y(a + r / 2)); gw.lineTo(X(xMax), Y(a - r / 2)); gw.closePath(); gw.fill();
      for (const d of dots) {
        gw.globalAlpha = d.asym === P.asym ? 1 : 0.3;
        gw.fillStyle = d.used ? C.ntp : C.mut;
        gw.beginPath(); gw.arc(X(d.delay), Y(d.err), d.used ? 3.6 : 2.4, 0, Math.PI * 2); gw.fill();
      }
      gw.globalAlpha = 1;
      const last = dots[dots.length - 1];
      if (last) { gw.strokeStyle = C.fg; gw.lineWidth = 1.5; gw.beginPath(); gw.arc(X(last.delay), Y(last.err), 6, 0, Math.PI * 2); gw.stroke(); }
      gw.restore();
    }

    function showOutputs() {
      $('ppmO').textContent = sg(P.ppm, 0) + ' ppm';
      const day = P.ppm * 0.0864;
      $('dayO').textContent = P.ppm === 0 ? '（くるいなし）' : '（1日に ' + Math.abs(day).toFixed(1) + ' 秒' + (day > 0 ? '進む）' : '遅れる）');
      $('jitO').textContent = P.jitter + ' ms';
      $('asymO').textContent = sg(P.asym, 0) + ' ms';
    }

    function updateText() {
      if (!lastN) {
        for (const id of ['thO', 'dlO', 'eN', 'eS', 'fO', 'fa', 'fb', 'fc', 'fd', 'fth', 'fdl']) $(id).textContent = '-';
        $('rN').textContent = 'ms'; $('rS').textContent = 'ms';
        $('fSub').textContent = 'ppm'; $('truth').textContent = ''; $('why').textContent = '';
        return;
      }
      const o = lastN;
      $('thO').textContent = sg(o.offset);
      $('dlO').textContent = o.delay.toFixed(2);
      $('eN').textContent = sg(o.after);
      $('eS').textContent = sg(lastS.after);
      const pick = (H) => H.slice(-RECENT).flatMap((x) => [x.before, x.after]);
      const k = Math.min(RECENT, histN.length - 1);
      $('rN').textContent = 'ms（直近 ' + k + ' 回の二乗平均 ' + rms(pick(histN)).toFixed(2) + '）';
      $('rS').textContent = 'ms（直近 ' + k + ' 回の二乗平均 ' + rms(pick(histS)).toFixed(2) + '）';
      $('fO').textContent = sg(simN.f, 1);
      $('fSub').textContent = 'ppm（くるいは ' + sg(P.ppm, 0) + ' ppm）';
      $('fa').textContent = sg(o.t2 - o.t1);
      $('fb').textContent = sg(o.t3 - o.t4);
      $('fth').textContent = sg(o.offset);
      $('fc').textContent = (o.t4 - o.t1).toFixed(2);
      $('fd').textContent = (o.t3 - o.t2).toFixed(2);
      $('fdl').textContent = o.delay.toFixed(2);
      $('truth').textContent = '本当の片道（模擬なので分かる）: 行き ' + o.df.toFixed(2) + ' ms、帰り ' + o.db.toFixed(2) + ' ms。θ の誤差は（行き − 帰り）÷ 2 = ' + sg(o.err) + ' ms。';
      let why;
      if (o.usedId === o.id) why = 'この回の往復は直近 8 回で一番短い。この回の θ の 4 割だけ時計を動かし、θ に比例した量を進み方の直しにも足した。';
      else if (o.usedId >= 0) why = 'この回の往復は長いので使わない。直近 8 回で一番短い往復（' + o.bestDelay.toFixed(2) + ' ms、' + (o.id - o.usedId) + ' 回前）はまだ使っていないので、その θ で直した。';
      else why = 'この回の往復は長いので使わない。直近 8 回で一番短い往復（' + o.bestDelay.toFixed(2) + ' ms、' + (o.id - o.bestId) + ' 回前）は前に使ったので、今回は時計を直さない。';
      $('why').textContent = why;
    }

    function readInputs() {
      P.ppm = Number(ppmI.value); P.jitter = Number(jitI.value); P.asym = Number(asymI.value);
      showOutputs();
      dirty = true;
    }
    for (const el of [ppmI, jitI, asymI]) el.addEventListener('input', readInputs);
    $('route').addEventListener('click', () => {
      let v;
      do { v = Math.round((Math.random() * 2 - 1) * 16); } while (Math.abs(v - P.asym) < 6);
      asymI.value = String(v);
      readInputs();
    });
    pauseB.addEventListener('click', () => {
      running = !running;
      pauseB.textContent = running ? '止める' : '動かす';
      prevT = 0; acc = 0;
    });
    $('reset').addEventListener('click', () => { reset(); });

    function render(now) {
      drawGraph(); drawWedge(); updateText(); drawEx(now);
    }
    function frame(now) {
      const dt = prevT ? Math.min(1000, now - prevT) : 0;
      prevT = now;
      if (running) {
        acc += dt;
        let k = 0;
        while (acc >= PERIOD && k < 3) { acc -= PERIOD; stepOnce(); k++; }
        if (acc >= PERIOD) acc = 0;
      }
      if (dirty) { render(now); dirty = false; }
      else if (now - animAt < ANIM + 60) drawEx(now);
      requestAnimationFrame(frame);
    }

    reset();
    showOutputs();
    if (thumb) for (let i = 0; i < WINDOW; i++) stepOnce();
    render(performance.now());
    dirty = false;
    if ('ResizeObserver' in window) new ResizeObserver(() => { dirty = true; }).observe(document.body);
    requestAnimationFrame(frame);
  },
});

dekiru.add({
  id: 'tr-20261123-mini-city', c: 'trend', lv: 3, date: '2026-11-23',
  t: '斜め上から見た小さな街で、信号を守る車を走らせ、建物や木の陰へ1画素ずつ隠す（Small SF）',
  y: 'ななめうえからみたちいさなまちでしんごうをまもるくるまをはしらせたてものやきのかげへいちがそずつかくす',
  tags: ['Small SF', '奥行きの図', '信号と車の流れ', '太陽の位置', 'Canvas'],
  d: '2026年11月22日、Ari Dutilh さんのサイト「Small SF」が Hacker News に投稿され、取得した時点で 272 点・93 件のコメントを集めていた。Small SF は、サンフランシスコを斜め 45 度の上から見た1枚の大きなイラストの地図で、本物の路線バス・電車・船・飛行機の位置と、本物の太陽と霧に合わせた光、模擬の車の流れを重ねている。説明のページ「How it\'s made」によると、車の流れだけは作り物で、OpenStreetMap の 8,673 本の道と 1,562 か所の本物の信号の上で、信号を守り、前の車に付いて走る車を動かしている。建物の陰に入った車は、街の奥行きの図（カメラから見える物までの距離）と車の形を画素ごとに比べ、建物の方が近い部分だけを消している。この見本では、その仕組みを自分で作った小さな街で再現する。交差点が 5 × 5 ある架空の街を 0.5 単位ごとの高さの格子として作り、画面の1画素ごとに視線を伸ばして最初に当たる屋根・壁・地面・木を求め、色と奥行きを記録する。車は毎フレーム、自分の箱と視線の交わりを1画素ずつ計算し、記録した奥行きより手前の画素だけを描く。信号は青・黄・赤のあとに全方向が赤になる間を挟む。車は前の車との間を保つ式（IDM）で速さを決め、黄色になったときは無理なく止まれるなら止まる。走る台数は朝 8 時と夕方 5 時半に多く、夜中に少ない。光は、サンフランシスコの時刻から太陽の高さと方角を計算して当て、影は当たった点から太陽へ向けてもう一度視線を伸ばして決める。夜は窓と街灯とヘッドライトがともる。再現できていない所: 本物のバス・船・飛行機の位置、天気と霧、イラストの絵（Small SF は Google の 3D の街のデータを描き直した画像を使っている）は扱わない。街の形は乱数で作った架空のもので、交差点ではまっすぐ進むか右へ曲がるだけで、左には曲がらない。一時停止の交差点、坂、高架の道、拡大や移動、車への乗り込みも入れていない。',
  p: '斜め上から見る正射影では、画面の上にあるほど「高い」か「奥」のどちらかなので、車をただ上に重ねると屋根や木の上を走って見える。そこで画面の1画素ごとに、視線の向き (0.5, 0.5, −0.707) で高さの格子を1マスずつ進み（DDA）、最初に当たった面までの距離 t を奥行きの図として残す。車の画素では、視線と車の箱の交わり（slab 法）から距離を出し、図の t より小さいときだけ描く。比べるのは画素ごとなので、車は建物の角から少しずつ隠れる。光と影は奥行きの図と別に持ち、時刻を変えたときは影だけを数フレームに分けて計算し直す。車の加速は IDM の式 a × (1 − (v ÷ v0)⁴ − (望む間隔 ÷ 今の間隔)²) で決め、赤信号は「止まる線の上に止まっている車」として同じ式に入れる。黄色では、今の速さで止まるのに要る距離 v² ÷ 2b が止まる線までの距離より短ければ止まり、長ければそのまま進む。',
  refs: [
    { title: 'Small SF: an illustrated, live map of San Francisco（Ari Dutilh）', url: 'https://smallsf.com/' },
    { title: 'Small SF · How it\'s made（2026年11月）', url: 'https://smallsf.com/about' },
    { title: 'Hacker News: A miniature San Francisco with live buses, planes and boats（2026-11-22）', url: 'https://news.ycombinator.com/item?id=50603589' },
    { title: 'Intelligent driver model（Wikipedia）', url: 'https://en.wikipedia.org/wiki/Intelligent_driver_model' },
  ],
  html: `<div class="app">
  <div class="bar">
    <label class="ctl"><span class="nm">サンフランシスコの時刻</span><input type="range" id="hour" min="0" max="1435" step="5" value="720"><output id="hourO" for="hour">12:00</output></label>
    <div class="btns"><button type="button" id="now" aria-pressed="true">今の時刻</button><button type="button" id="fast" aria-pressed="false">早送り</button></div>
    <fieldset class="view"><legend>表示</legend><label><input type="radio" name="view" value="pic" checked>絵</label><label><input type="radio" name="view" value="depth">奥行きの図</label></fieldset>
    <label class="chk"><input type="checkbox" id="ghost">隠れた車をうっすら見せる</label>
  </div>
  <figure class="stage"><canvas id="cv" role="img" aria-label="斜め上から見た小さな街。車が信号を守って走り、建物や木の陰に入った部分は見えなくなる"></canvas></figure>
  <div class="stats">
    <div class="stat"><span>走っている車</span><b id="carsO">-</b><span id="tgtO">台</span></div>
    <div class="stat"><span>太陽の高さ</span><b id="altO">-</b><span id="azO"></span></div>
    <div class="stat"><span>建物や木に隠れている車</span><b id="hidO">-</b><span>台（形の 6 割より多く隠れている車）</span></div>
    <div class="stat"><span>止まっている車</span><b id="stopO">-</b><span>台（信号待ちや前の車待ち）</span></div>
  </div>
  <p class="small">時刻を動かすと、サンフランシスコのその時刻の太陽の位置で光と影を計算し直す（数フレームかかる）。早送りは 1 時間を約 3 秒で進め、車の台数も時刻に合わせて増減する。「奥行きの図」は、画素ごとにカメラから最初に当たる物までの近さを明るさで表したもので、明るいほど近い。橙色の車は、この図より手前にある画素だけが描かれる。</p>
</div>`,
  css: `:root { color-scheme: light; --bg: #eef0ee; --fg: #1f2326; --mut: #596065; --line: #cfd5d2; --panel: #fbfcfb; --acc: #2a6b8a; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .app { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 10px; max-inline-size: 1000px; margin-inline: auto; }
    .bar { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; }
    .ctl { display: flex; align-items: center; gap: 8px; flex: 1 1 280px; min-inline-size: 0; }
    .ctl .nm { font-size: 12px; color: var(--mut); white-space: nowrap; }
    .ctl input { flex: 1 1 120px; min-inline-size: 0; margin: 4px 0; }
    .ctl output { min-inline-size: 3.2em; font-variant-numeric: tabular-nums; font-weight: 600; }
    input { accent-color: var(--acc); }
    .btns { display: flex; flex-wrap: wrap; gap: 6px; }
    button { font: inherit; font-size: 13px; padding: 4px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; }
    button:hover { border-color: var(--mut); }
    button[aria-pressed="true"] { background: var(--acc); border-color: var(--acc); color: #fff; }
    input:focus-visible, button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    .view { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 13px; }
    .view legend { float: left; padding: 0; margin-inline-end: 2px; font-size: 12px; color: var(--mut); }
    .view label, .chk { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; }
    .stage { margin: 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #1c3a46; }
    canvas { display: block; inline-size: 100%; aspect-ratio: 13 / 10; max-block-size: 72vh; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); gap: 6px; }
    .stat { min-inline-size: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; }
    .stat span { font-size: 11px; color: var(--mut); line-height: 1.35; }
    .stat b { font-size: 21px; line-height: 1.25; font-variant-numeric: tabular-nums; }
    .small { font-size: 12px; color: var(--mut); margin: 0; }
    .thumb .bar, .thumb .stats, .thumb .small { display: none; }
    .thumb .app { padding: 0; max-inline-size: none; }
    .thumb .stage { border: 0; border-radius: 0; }
    .thumb canvas { block-size: 100vh; aspect-ratio: auto; max-block-size: none; }`,
  core() {
    // 単位: 1 = 約 4 m。x は東、y は北、h は上。陸の地面の高さは GROUND、陸の外は高さ 0 の海
    const R2 = Math.SQRT1_2, SQ2 = Math.SQRT2, RAD = Math.PI / 180;
    const WORLD = 60, CELL = 0.5, GN = 120, GROUND = 0.3;
    const STREETS = [6, 18, 30, 42, 54];                // 通りの中心線（東西にも南北にも同じ位置）
    const SF = { lat: 37.7749, lon: -122.4194 };
    const SIG = { green: 9, yellow: 2.5, red: 1 };      // 秒。red は全方向が赤になる間
    const CYCLE = 2 * (SIG.green + SIG.yellow + SIG.red);
    const STOP = 2.1;                                   // 交差点の中心から、止まった車の中心までの距離
    const IDM = { v0: 2.6, a: 1.6, b: 2.2, s0: 0.35, T: 0.9 };
    const VIEW = [0.5, 0.5, -R2];                       // 視線: 北東を向き、45 度見下ろす
    // 車の色（白・黒・銀が多く、ときどき黄色のタクシー）と割合
    const VCOL = [[[0.93, 0.93, 0.92], 26], [[0.1, 0.1, 0.11], 18], [[0.68, 0.7, 0.72], 18], [[0.42, 0.43, 0.45], 10], [[0.16, 0.3, 0.55], 8], [[0.62, 0.13, 0.12], 8], [[0.95, 0.76, 0.12], 5], [[0.2, 0.38, 0.3], 4], [[0.76, 0.7, 0.58], 3]];

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
    function hash3(a, b, c) {
      let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
      h = Math.imul(h ^ (h >>> 13), 1103515245);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    // ---- 信号と車 ----
    // 交差点の信号。前半は南北が青→黄→赤、後半は東西。どちらも赤の間は全方向が赤
    function signalAt(t, off) {
      const u = (((t + off) % CYCLE) + CYCLE) % CYCLE, half = CYCLE / 2, k = u % half;
      const st = k < SIG.green ? 'g' : k < SIG.green + SIG.yellow ? 'y' : 'r';
      return u < half ? { ns: st, ew: 'r' } : { ns: 'r', ew: st };
    }
    // 速さ v から、減速 b で dist 以内に止まれるか
    function canStop(v, dist, b) {
      return (v * v) / (2 * b) <= dist;
    }
    // IDM: 前との間隔 gap（車と車のすき間）、近づく速さ dv から加速を決める
    function idm(v, v0, gap, dv, P) {
      const free = 1 - Math.pow(v / Math.max(0.01, v0), 4);
      if (!(gap < Infinity)) return P.a * free;
      const want = P.s0 + Math.max(0, v * P.T + (v * dv) / (2 * Math.sqrt(P.a * P.b)));
      const r = want / Math.max(0.01, gap);
      return P.a * (free - r * r);
    }
    // 時刻ごとの車の量（0〜1）。朝 8 時と夕方 5 時半に多く、夜中に少ない
    function demand(hour) {
      const h = ((hour % 24) + 24) % 24;
      const bump = (c, w) => { let d = Math.abs(h - c); d = Math.min(d, 24 - d); return Math.exp(-((d / w) ** 2)); };
      const day = 0.5 - 0.5 * Math.cos((2 * Math.PI * (h - 3.5)) / 24);
      return Math.min(1, 0.1 + 0.42 * day + 0.45 * bump(8, 1.3) + 0.5 * bump(17.5, 1.7));
    }

    // ---- 太陽 ----
    function dayOfYear(y, m, d) {
      return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
    }
    function declination(doy) {
      return 23.44 * Math.sin((2 * Math.PI * (284 + doy)) / 365);
    }
    // 均時差（分）
    function eqTime(doy) {
      const B = (2 * Math.PI * (doy - 81)) / 364;
      return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    }
    // UTC の時刻と経度から、その場所の太陽の時刻（正午に太陽が真南）
    function solarHour(utcH, lon, doy) {
      return utcH + lon / 15 + eqTime(doy) / 60;
    }
    // 太陽の高さ alt と方角 az（北が 0、東が 90。どちらも度）
    function sunPosition(doy, sh, lat) {
      const d = declination(doy) * RAD, p = lat * RAD, H = (sh - 12) * 15 * RAD;
      const sa = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H);
      const alt = Math.asin(Math.max(-1, Math.min(1, sa)));
      let az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H));
      if (az < 0) az += 2 * Math.PI;
      return { alt: alt / RAD, az: az / RAD };
    }
    // 太陽の方向の単位ベクトル（x 東、y 北、h 上）
    function sunVector(alt, az) {
      const a = alt * RAD, z = az * RAD;
      return [Math.sin(z) * Math.cos(a), Math.cos(z) * Math.cos(a), Math.sin(a)];
    }
    // 太陽の高さから、空の明るさ（amb）・日の光（sun）・空の色（sky）・夜の度合いを決める
    function lightState(alt, az) {
      const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const mv = (a, b, t) => a + (b - a) * t;
      const day = sm(-6, 12, alt), gold = sm(-4, 2, alt) * (1 - sm(6, 22, alt));
      const night = 1 - sm(-7, 0.5, alt), I = sm(-1, 6, alt) * 0.82, warm = sm(2, 30, alt);
      return {
        alt, az, L: sunVector(alt, az), day, gold, night, up: I > 0.005,
        amb: [mv(0.1, 0.5, day) + gold * 0.1, mv(0.12, 0.53, day) + gold * 0.04, mv(0.23, 0.6, day) - gold * 0.03],
        sun: [I, I * mv(0.55, 0.95, warm), I * mv(0.28, 0.88, warm)],
        sky: [mv(0.03, 0.55, day) + gold * 0.32, mv(0.05, 0.7, day) + gold * 0.08, mv(0.13, 0.9, day) + gold * 0.02],
      };
    }

    // ---- 見え方 ----
    // 画面の横 sx（右が正）と縦 sy（上が正）、カメラからの奥行き depth
    function project(x, y, h) {
      return { sx: (x - y) * R2, sy: (x + y) / 2 + h * R2, depth: (x + y) / 2 - h * R2 };
    }
    // 画面の点 (sx, sy) を通る視線の出発点（高さ hTop）
    function rayOrigin(sx, sy, hTop) {
      const s = 2 * (sy - hTop * R2), d = sx * SQ2;
      return [(s + d) / 2, (s - d) / 2, hTop];
    }
    // 一番近い通りの中心線までの距離
    function streetDist(v) {
      const m = (((v - 6) % 12) + 12) % 12;
      return Math.min(m, 12 - m);
    }
    // 地面の色: 車道・横断歩道・中央線・歩道・芝生・岸の遊歩道
    function groundAlbedo(x, y, m, out) {
      const ex = streetDist(x), ey = streetDist(y);
      let r = 0.7, g = 0.68, b = 0.63;
      if (ex < 1 || ey < 1) {
        r = 0.34; g = 0.35; b = 0.37;
        if (ey < 1 && ex >= 1) {
          if (ex < 1.5) { if ((((y + 1) / 0.3) % 1) < 0.55 && ey < 0.92) { r = 0.86; g = 0.86; b = 0.83; } }
          else if (ey < 0.06) { r = 0.88; g = 0.72; b = 0.2; }
        } else if (ex < 1 && ey >= 1) {
          if (ey < 1.5) { if ((((x + 1) / 0.3) % 1) < 0.55 && ex < 0.92) { r = 0.86; g = 0.86; b = 0.83; } }
          else if (ex < 0.06) { r = 0.88; g = 0.72; b = 0.2; }
        }
      } else if (ex < 1.5 || ey < 1.5) { r = 0.75; g = 0.73; b = 0.69; }
      else if (m === -1) { const n = 0.03 * Math.sin(x * 3.1) * Math.sin(y * 2.7); r = 0.4 + n; g = 0.57 + n; b = 0.3; }
      else if (x < 1 || y < 1 || x > WORLD - 1 || y > WORLD - 1) { r = 0.72; g = 0.69; b = 0.62; }
      out[0] = r; out[1] = g; out[2] = b;
      return out;
    }

    // 高さの格子と木から、光線の計算に使う形をまとめる（木がかかるマスの一覧も作る）
    function makeWorld(H, M, buildings, trees) {
      let hi = GROUND;
      for (let i = 0; i < H.length; i++) if (H[i] > hi) hi = H[i];
      for (const t of trees) hi = Math.max(hi, t.z + t.r);
      const cnt = new Int32Array(GN * GN + 1);
      const each = (t, f) => {
        const x0 = Math.max(0, Math.floor((t.x - t.r) / CELL)), x1 = Math.min(GN - 1, Math.floor((t.x + t.r) / CELL));
        const y0 = Math.max(0, Math.floor((t.y - t.r) / CELL)), y1 = Math.min(GN - 1, Math.floor((t.y + t.r) / CELL));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f(y * GN + x);
      };
      for (const t of trees) each(t, (c) => { cnt[c + 1]++; });
      for (let i = 0; i < GN * GN; i++) cnt[i + 1] += cnt[i];
      const idx = new Int32Array(cnt[GN * GN]), fill = cnt.slice(0, GN * GN);
      trees.forEach((t, k) => each(t, (c) => { idx[fill[c]++] = k; }));
      return { H, M, buildings, trees, tStart: cnt, tIdx: idx, maxH: hi, top: hi + 0.5 };
    }

    // 架空の街: 通りの間の街区を区画に分けて建物を建て、公園・岸・歩道に木を植える
    function buildTown(seed) {
      const R = rng(seed);
      const H = new Float32Array(GN * GN).fill(GROUND), M = new Int32Array(GN * GN);
      const buildings = [null], trees = [];
      const PAL = [[0.94, 0.91, 0.86], [0.96, 0.96, 0.94], [0.85, 0.88, 0.9], [0.91, 0.83, 0.77], [0.81, 0.86, 0.82], [0.9, 0.85, 0.66], [0.79, 0.81, 0.85], [0.86, 0.77, 0.79]];
      const TOWER = [[0.72, 0.76, 0.8], [0.6, 0.65, 0.7], [0.82, 0.83, 0.85], [0.68, 0.72, 0.7]];
      const spans = [[2, 9]];
      for (let k = 0; k < 4; k++) spans.push([(STREETS[k] + 1.5) / CELL, (STREETS[k + 1] - 1.5) / CELL]);
      spans.push([(STREETS[4] + 1.5) / CELL, GN - 2]);
      const tree = (x, y, r, z) => trees.push({ x, y, r, z, tr: 0.07, g: R() });
      const cut = (a, b) => {
        const n = b - a, k = n >= 16 && R() < 0.55 ? 3 : 2, out = [a];
        for (let i = 1; i < k; i++) out.push(Math.round(a + (n * i) / k + (R() - 0.5) * 2.5));
        out.push(b);
        return out;
      };
      const last = spans.length - 1;
      for (let bj = 0; bj <= last; bj++) for (let bi = 0; bi <= last; bi++) {
        const [x0, x1] = spans[bi], [y0, y1] = spans[bj];
        const edge = bi === 0 || bj === 0 || bi === last || bj === last, park = bi === 2 && bj === 1;
        if (edge || park) {
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) M[y * GN + x] = -1;
          for (let ty = y0 * CELL + 1.4; ty <= y1 * CELL - 1.4 + 1e-9; ty += 3) {
            for (let tx = x0 * CELL + 1.4; tx <= x1 * CELL - 1.4 + 1e-9; tx += 3) {
              if (!park && R() < 0.2) continue;
              const r = park ? 0.62 + R() * 0.3 : 0.55 + R() * 0.25;
              tree(tx + (R() - 0.5) * 0.6, ty + (R() - 0.5) * 0.6, r, GROUND + 0.5 + r);
            }
          }
          continue;
        }
        const xs = cut(x0, x1), ys = cut(y0, y1);
        for (let a = 0; a < xs.length - 1; a++) for (let c = 0; c < ys.length - 1; c++) {
          let lx0 = xs[a], lx1 = xs[a + 1], ly0 = ys[c], ly1 = ys[c + 1];
          const cx = ((lx0 + lx1) * CELL) / 2, cy = ((ly0 + ly1) * CELL) / 2;
          const tall = Math.max(0, 1 - Math.hypot(cx - 44, cy - 42) / 20);
          let h = GROUND + 1.1 + R() * 2.1, col = PAL[Math.floor(R() * PAL.length)];
          if (tall > 0.15 && R() < 0.35 + tall * 0.6) {
            h += tall * (2.5 + R() * 6);
            col = TOWER[Math.floor(R() * TOWER.length)];
            if (tall > 0.45 && lx1 - lx0 > 6 && ly1 - ly0 > 6 && R() < 0.6) { lx0++; lx1--; ly0++; ly1--; }
          }
          const id = buildings.length, dk = 0.85 + R() * 0.08;
          buildings.push({ id, h, wall: col, roof: R() < 0.4 ? [0.62, 0.6, 0.57] : [col[0] * dk, col[1] * dk, col[2] * dk], tower: h > GROUND + 4 });
          for (let y = ly0; y < ly1; y++) for (let x = lx0; x < lx1; x++) { H[y * GN + x] = h; M[y * GN + x] = id; }
        }
      }
      // 歩道の木（車の屋根より高い所に葉がある）
      for (const c of STREETS) for (const side of [-1.25, 1.25]) for (let k = 0; k < 4; k++) {
        for (let u = STREETS[k] + 3; u <= STREETS[k + 1] - 3 + 1e-9; u += 3) {
          if (R() < 0.42) { const r = 0.42 + R() * 0.14; tree(u, c + side, r, GROUND + 1.2); }
          if (R() < 0.42) { const r = 0.42 + R() * 0.14; tree(c + side, u, r, GROUND + 1.2); }
        }
      }
      return makeWorld(H, M, buildings, trees);
    }

    // 木（葉の球と幹の円柱）と視線の交わり。今までより近ければ out を書き換える
    function hitTree(tr, k, ox, oy, oz, out) {
      const lx = ox - tr.x, ly = oy - tr.y, lz = oz - tr.z;
      const b = lx * 0.5 + ly * 0.5 - lz * R2, c = lx * lx + ly * ly + lz * lz - tr.r * tr.r, disc = b * b - c;
      if (disc >= 0) {
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < out.t) {
          out.t = t; out.kind = 1; out.id = k; out.n = 4;
          out.nx = (lx + 0.5 * t) / tr.r; out.ny = (ly + 0.5 * t) / tr.r; out.nz = (lz - R2 * t) / tr.r;
        }
      }
      const b2 = lx * 0.5 + ly * 0.5, c2 = lx * lx + ly * ly - tr.tr * tr.tr, d2 = b2 * b2 - 0.5 * c2;
      if (d2 >= 0) {
        const t = (-b2 - Math.sqrt(d2)) / 0.5, z = oz - R2 * t;
        if (t > 0 && t < out.t && z >= GROUND && z <= tr.z) {
          out.t = t; out.kind = 2; out.id = k; out.n = 4;
          out.nx = (lx + 0.5 * t) / tr.tr; out.ny = (ly + 0.5 * t) / tr.tr; out.nz = 0;
        }
      }
    }

    // 画面の点から視線を伸ばし、最初に当たる物を求める（高さの格子を1マスずつ進む）
    //   out.t: 出発点からの距離（同じ画素どうしなら、小さいほどカメラに近い）
    //   out.n: 0 上の面、1 西向きの壁、2 南向きの壁、4 木（向きは nx, ny, nz）
    //   out.kind: 0 陸のマス（id はマスの番号）、1 木の葉、2 木の幹（id は木の番号）、3 海
    function castRay(W, sx, sy, out) {
      const hT = W.top, s = 2 * (sy - hT * R2), d = sx * SQ2;
      const ox = (s + d) / 2, oy = (s - d) / 2, oz = hT;
      const H = W.H, T = W.trees, ts = W.tStart, ti = W.tIdx, tD = CELL / 0.5;
      let ix = Math.floor(ox / CELL), iy = Math.floor(oy / CELL);
      let tx = ((ix + 1) * CELL - ox) / 0.5, ty = ((iy + 1) * CELL - oy) / 0.5, t0 = 0, axis = -1;
      out.t = Infinity; out.kind = 3; out.n = 0; out.id = -1;
      for (let guard = 0; guard < 4000; guard++) {
        if (t0 >= out.t) break;
        const t1 = Math.min(tx, ty);
        const inside = ix >= 0 && iy >= 0 && ix < GN && iy < GN, cell = iy * GN + ix;
        const hc = inside ? H[cell] : 0;
        if (inside) for (let k = ts[cell]; k < ts[cell + 1]; k++) hitTree(T[ti[k]], ti[k], ox, oy, oz, out);
        if (oz - t0 * R2 <= hc) {
          if (t0 < out.t) { out.t = t0; out.n = axis === 0 ? 1 : 2; out.kind = inside ? 0 : 3; out.id = inside ? cell : -1; }
          break;
        }
        if (oz - t1 * R2 <= hc) {
          const th = (oz - hc) * SQ2;
          if (th < out.t) { out.t = th; out.n = 0; out.kind = inside ? 0 : 3; out.id = inside ? cell : -1; }
          break;
        }
        if (tx < ty) { ix++; t0 = tx; tx += tD; axis = 0; } else { iy++; t0 = ty; ty += tD; axis = 1; }
      }
      if (!(out.t < Infinity)) { out.t = oz * SQ2; out.kind = 3; out.n = 0; out.id = -1; }
      out.x = ox + 0.5 * out.t; out.y = oy + 0.5 * out.t; out.h = oz - R2 * out.t;
      return out;
    }

    // 点 (x, y, z) から太陽の方向 L へ伸ばした線が、建物か木に当たるか（当たれば影）
    function shadowAt(W, x, y, z, L) {
      const H = W.H, T = W.trees, ts = W.tStart, ti = W.tIdx;
      let ix = Math.floor(x / CELL), iy = Math.floor(y / CELL);
      const hl = Math.hypot(L[0], L[1]);
      const dx = hl > 1e-6 ? L[0] / hl : 0, dy = hl > 1e-6 ? L[1] / hl : 0, slope = hl > 1e-6 ? L[2] / hl : 1e9;
      const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
      const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity, tdy = Math.abs(dy) > 1e-9 ? CELL / Math.abs(dy) : Infinity;
      let tx = Math.abs(dx) > 1e-9 ? (dx > 0 ? (ix + 1) * CELL - x : x - ix * CELL) / Math.abs(dx) : Infinity;
      let ty = Math.abs(dy) > 1e-9 ? (dy > 0 ? (iy + 1) * CELL - y : y - iy * CELL) / Math.abs(dy) : Infinity;
      let u = 0;
      for (let guard = 0; guard < 400; guard++) {
        if (ix < 0 || iy < 0 || ix >= GN || iy >= GN) return false;
        const hz = z + u * slope;
        if (hz > W.maxH) return false;
        const cell = iy * GN + ix;
        if (hz < H[cell] - 1e-4) return true;
        for (let k = ts[cell]; k < ts[cell + 1]; k++) {
          const tr = T[ti[k]];
          const lx = x - tr.x, ly = y - tr.y, lz = z - tr.z;
          const b = lx * L[0] + ly * L[1] + lz * L[2], c = lx * lx + ly * ly + lz * lz - tr.r * tr.r;
          if (b < 0 && b * b - c >= 0) return true;
        }
        if (u > 45 || hl <= 1e-6) return false;
        if (tx < ty) { ix += sx; u = tx; tx += tdx; } else { iy += sy; u = ty; ty += tdy; }
      }
      return false;
    }

    // 道のつながり: 車線ごとの道（交差点と交差点の間）と、交差点の中の動き（まっすぐ・右折）
    function makeTraffic(seed) {
      const links = [], nodes = [], N = STREETS.length;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) nodes.push({ x: STREETS[i], y: STREETS[j], off: (i * 5 + j * 9) % CYCLE });
      const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const inbound = new Map(), outbound = new Map();
      const road = (x0, y0, x1, y1, d, endNode, startNode) => {
        const L = { id: links.length, kind: 'road', x0, y0, dx: d[0], dy: d[1], len: Math.hypot(x1 - x0, y1 - y0), node: endNode, axis: d[0] !== 0 ? 'ew' : 'ns', next: [], cars: [], entry: startNode < 0, exit: endNode < 0, turn: false, curve: null };
        links.push(L);
        return L;
      };
      DIRS.forEach((d, di) => {
        const alongX = d[0] !== 0, sign = alongX ? d[0] : d[1];
        for (let k = 0; k < N; k++) {
          const lane = STREETS[k] + (alongX ? -0.5 * d[0] : 0.5 * d[1]);
          const P = (u) => (alongX ? [u, lane] : [lane, u]);
          const order = sign > 0 ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
          let pos = sign > 0 ? 0 : WORLD, prev = -1;
          for (const m of order) {
            const c = STREETS[m], end = c - sign * STOP, node = alongX ? k * N + m : m * N + k;
            const a = P(pos), b = P(end), L = road(a[0], a[1], b[0], b[1], d, node, prev);
            inbound.set(node + ',' + di, L);
            if (prev >= 0) outbound.set(prev + ',' + di, L);
            pos = c + sign * STOP; prev = node;
          }
          const a = P(pos), b = P(sign > 0 ? WORLD : 0), L = road(a[0], a[1], b[0], b[1], d, -1, prev);
          outbound.set(prev + ',' + di, L);
        }
      });
      nodes.forEach((nd, n) => {
        DIRS.forEach((d, di) => {
          const Lin = inbound.get(n + ',' + di);
          const ex = Lin.x0 + Lin.dx * Lin.len, ey = Lin.y0 + Lin.dy * Lin.len;
          const straight = outbound.get(n + ',' + di);
          const rd = [d[1], -d[0]], ri = DIRS.findIndex((q) => q[0] === rd[0] && q[1] === rd[1]);
          const right = outbound.get(n + ',' + ri);
          const ms = { id: links.length, kind: 'move', x0: ex, y0: ey, dx: d[0], dy: d[1], len: 2 * STOP, node: -1, axis: Lin.axis, next: [straight.id], cars: [], entry: false, exit: false, turn: false, curve: null };
          links.push(ms);
          const p = [ex, ey, nd.x + rd[0] * 0.5 - d[0] * 0.5, nd.y + rd[1] * 0.5 - d[1] * 0.5, right.x0, right.y0];
          const tab = [0];
          let px = p[0], py = p[1], acc = 0;
          for (let i = 1; i <= 24; i++) {
            const u = i / 24, a = 1 - u;
            const qx = a * a * p[0] + 2 * a * u * p[2] + u * u * p[4], qy = a * a * p[1] + 2 * a * u * p[3] + u * u * p[5];
            acc += Math.hypot(qx - px, qy - py); tab.push(acc); px = qx; py = qy;
          }
          const mr = { id: links.length, kind: 'move', x0: ex, y0: ey, dx: 0, dy: 0, len: acc, node: -1, axis: Lin.axis, next: [right.id], cars: [], entry: false, exit: false, turn: true, curve: { p, tab } };
          links.push(mr);
          Lin.next = [ms.id, mr.id];
        });
      });
      // 同じ道へ合流する、交差点の中の動きどうしを覚えておく（直進と、隣の向きからの右折）
      const feeders = new Map();
      for (const L of links) if (L.kind === 'move') { const k = L.next[0]; if (!feeders.has(k)) feeders.set(k, []); feeders.get(k).push(L.id); }
      for (const L of links) if (L.kind === 'move') L.merge = feeders.get(L.next[0]).filter((id) => id !== L.id);
      return { links, nodes, cars: [], entries: links.filter((L) => L.entry).map((L) => L.id), t: 0, rand: rng(seed), max: 100, target: 0, spawnAcc: 0, redRuns: 0, nextId: 1 };
    }

    // 道の上の位置 s から、地図の上の位置と向き
    function posOnLink(L, s, out) {
      if (!L.curve) { out.x = L.x0 + L.dx * s; out.y = L.y0 + L.dy * s; out.th = Math.atan2(L.dy, L.dx); return out; }
      const p = L.curve.p, tab = L.curve.tab, n = tab.length - 1;
      let i = 0;
      while (i < n - 1 && tab[i + 1] < s) i++;
      const f = Math.min(1, Math.max(0, (s - tab[i]) / Math.max(1e-9, tab[i + 1] - tab[i])));
      const u = (i + f) / n, a = 1 - u;
      out.x = a * a * p[0] + 2 * a * u * p[2] + u * u * p[4];
      out.y = a * a * p[1] + 2 * a * u * p[3] + u * u * p[5];
      out.th = Math.atan2(2 * a * (p[3] - p[1]) + 2 * u * (p[5] - p[3]), 2 * a * (p[2] - p[0]) + 2 * u * (p[4] - p[2]));
      return out;
    }
    // 次の交差点での動き（7 割まっすぐ、3 割右折）と、その先の道を決める
    function planNext(sim, c) {
      const L = sim.links[c.link];
      if (L.kind === 'road' && L.node >= 0) { const m = L.next[sim.rand() < 0.7 ? 0 : 1]; c.plan = [m, sim.links[m].next[0]]; }
      else if (L.kind === 'move') c.plan = [L.next[0]];
      else c.plan = [];
    }
    function addCar(sim, link, s, v, kind) {
      const R = sim.rand, k = kind || (R() < 0.12 ? 'van' : 'car');
      let w = R() * 100, col = VCOL[0][0];
      for (const [cc, pp] of VCOL) { w -= pp; if (w < 0) { col = cc; break; } }
      if (k === 'van' && R() < 0.7) col = [0.94, 0.94, 0.93];
      const c = { id: sim.nextId++, link, s, v, a: 0, kind: k, len: k === 'van' ? 1.35 : 1.0, wid: k === 'van' ? 0.56 : 0.48, col, v0: IDM.v0 * (0.88 + R() * 0.2), plan: [], yd: null };
      planNext(sim, c);
      sim.cars.push(c);
      const cs = sim.links[link].cars;
      cs.push(c);
      cs.sort((p, q) => p.s - q.s);
      return c;
    }

    // 車の流れを dt 秒進める。hour は車の量を決める時刻
    function stepTraffic(sim, dt, hour) {
      const links = sim.links;
      sim.t += dt;
      const st = sim.nodes.map((n) => signalAt(sim.t, n.off));
      for (const L of links) {
        const cs = L.cars;
        for (let k = 0; k < cs.length; k++) {
          const c = cs[k];
          let gap = Infinity, vl = 0;
          const lead = cs[k + 1];
          if (lead) { gap = lead.s - c.s - (lead.len + c.len) / 2; vl = lead.v; }
          else {
            let acc = L.len - c.s;
            // 同じ道から別の向きへ進み始めたばかりの車も、交差点の入口では前の車として見る
            if (L.kind === 'road' && L.node >= 0) {
              for (const mid of L.next) {
                if (mid === c.plan[0]) continue;
                const f = links[mid].cars[0];
                if (f && f.s < 1.8) { const g = acc + f.s - (f.len + c.len) / 2; if (g < gap) { gap = g; vl = f.v; } }
              }
            }
            for (const pid of c.plan) {
              const P = links[pid];
              if (P.cars.length) { const f = P.cars[0], g = acc + f.s - (f.len + c.len) / 2; if (g < gap) { gap = g; vl = f.v; } break; }
              acc += P.len;
            }
          }
          // 合流: 相手の方が合流する所に近ければ、相手を前の車として見る（同じ近さなら番号の小さい方が先）
          if (L.kind === 'move') {
            const mine = L.len - c.s;
            for (const mid of L.merge) {
              const O = links[mid];
              for (const o of O.cars) {
                const rest = O.len - o.s;
                if (rest < mine || (rest === mine && o.id < c.id)) { const g = mine - rest - (o.len + c.len) / 2; if (g < gap) { gap = g; vl = o.v; } }
              }
            }
          }
          if (L.kind === 'road' && L.node >= 0) {
            const s = st[L.node][L.axis], dist = L.len - c.s;
            if (s === 'g') c.yd = null;
            else if (c.yd === null) c.yd = s === 'y' && !canStop(c.v, dist, IDM.b) ? 'go' : 'stop';
            let stop = s !== 'g' && c.yd === 'stop';
            // 先の道が詰まっていたら交差点に入らない
            if (!stop && c.yd !== 'go' && dist < 3 && c.plan.length > 1) {
              const O = links[c.plan[1]].cars[0];
              if (O && O.s < O.len / 2 + c.len + 0.3 && O.v < 0.6) stop = true;
            }
            if (stop) { const g = dist - 0.05 + IDM.s0; if (g < gap) { gap = g; vl = 0; } }
          }
          let v0 = c.v0;
          if (L.turn) v0 *= 0.45;
          else if (c.plan.length && links[c.plan[0]].turn) v0 = Math.min(v0, c.v0 * 0.45 + 0.45 * (L.len - c.s));
          c.a = Math.max(-9, Math.min(IDM.a, idm(c.v, v0, gap, c.v - vl, IDM)));
        }
      }
      for (const c of sim.cars) {
        c.v = Math.max(0, c.v + c.a * dt);
        c.s += c.v * dt;
        let L = links[c.link];
        while (c.s >= L.len) {
          if (L.exit || !c.plan.length) { c.dead = true; break; }
          if (L.kind === 'road' && L.node >= 0 && st[L.node][L.axis] !== 'g' && c.yd !== 'go') sim.redRuns++;
          c.s -= L.len; c.link = c.plan.shift(); c.yd = null; L = links[c.link];
          if (!c.plan.length) planNext(sim, c);
        }
      }
      sim.cars = sim.cars.filter((c) => !c.dead);
      for (const L of links) L.cars.length = 0;
      for (const c of sim.cars) links[c.link].cars.push(c);
      for (const L of links) if (L.cars.length > 1) L.cars.sort((p, q) => p.s - q.s);
      // 目安の台数より少なければ、街の端から車を入れる（1 秒に 10 台まで）
      const target = Math.round(sim.max * demand(hour));
      sim.target = target;
      if (sim.cars.length < target) {
        sim.spawnAcc += dt * 10;
        while (sim.spawnAcc >= 1) {
          sim.spawnAcc -= 1;
          const E = links[sim.entries[Math.floor(sim.rand() * sim.entries.length)]], f = E.cars[0];
          if (!f || f.s - f.len / 2 > 2.2) addCar(sim, E.id, 0.5, 1.6 + sim.rand() * 0.6);
          if (sim.cars.length >= target) { sim.spawnAcc = 0; break; }
        }
      } else sim.spawnAcc = 0;
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const thumb = !!window.THUMB;
    if (thumb) document.documentElement.classList.add('thumb');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = $('cv'), ctx = cv.getContext('2d');
    const hourI = $('hour'), hourO = $('hourO'), nowB = $('now'), fastB = $('fast'), ghostI = $('ghost');
    const town = buildTown(20261123);
    const sim = makeTraffic(11);
    sim.max = thumb ? 90 : 120;
    const MAXPX = thumb ? 90000 : 420000;
    const TT = town.top;

    // 画面に入れる範囲（sy は上が大きい）
    let syHi = WORLD;
    for (let iy = 0; iy < GN; iy++) for (let ix = 0; ix < GN; ix++) {
      const v = ((ix + iy + 2) * CELL) / 2 + town.H[iy * GN + ix] * R2;
      if (v > syHi) syHi = v;
    }
    for (const t of town.trees) syHi = Math.max(syHi, (t.x + t.y) / 2 + (t.z + t.r) * R2);
    const SX0 = -WORLD * R2 - 1.2, SX1 = WORLD * R2 + 1.2, SY0 = -1.4, SY1 = syHi + 0.8;

    // サンフランシスコの今の時刻・UTC との差（時間）・1年の何日目
    let fmt = null;
    try {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    } catch (e) { fmt = null; }
    function sfNow() {
      const d = new Date();
      const utc = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
      if (fmt) {
        try {
          const q = {};
          for (const p of fmt.formatToParts(d)) q[p.type] = p.value;
          const hour = (Number(q.hour) % 24) + Number(q.minute) / 60 + Number(q.second) / 3600;
          const off = ((hour - utc + 36) % 24) - 12;
          const doy = dayOfYear(Number(q.year), Number(q.month), Number(q.day));
          if (Number.isFinite(hour) && Number.isFinite(off) && Number.isFinite(doy)) return { hour, off, doy };
        } catch (e) { /* 下の近似を使う */ }
      }
      return { hour: (((utc - 8) % 24) + 24) % 24, off: -8, doy: dayOfYear(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
    }
    let tz = sfNow();
    let mode = thumb ? (reduce ? 'manual' : 'fast') : 'live';
    let hour = thumb ? 15.2 : tz.hour;
    let view = 'pic', ghost = false;
    function sunFor(h) {
      return sunPosition(tz.doy, solarHour(h - tz.off, SF.lon, tz.doy), SF.lat);
    }
    function withMul(Sx) {
      const a = Sx.amb[0] + Sx.amb[1] + Sx.amb[2], u = (Sx.sun[0] + Sx.sun[1] + Sx.sun[2]) * Math.max(0, Sx.L[2]);
      Sx.shMul = a / Math.max(1e-6, a + u);
      return Sx;
    }

    // ---- 画素の入れ物 ----
    let BW = 0, BH = 0, scale = 1, offX = 0, offY = 0, dMin = 0, dSpan = 1;
    let tB, xB, yB, zB, nB, kB, iB, nxB, nyB, nzB, sB, sBack, base, back, depthImg, zbuf, img, frameB;
    let S = null, job = null;
    const pxSx = (px) => SX0 + (px + 0.5 - offX) / scale;
    const pySy = (py) => SY1 - (py + 0.5 - offY) / scale;
    const sxPx = (sx) => (sx - SX0) * scale + offX - 0.5;
    const syPy = (sy) => (SY1 - sy) * scale + offY - 0.5;
    const c8 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0);
    const pack = (r, g, b) => (0xff000000 | (c8(b) << 16) | (c8(g) << 8) | c8(r)) >>> 0;
    function mix(c0, c1, a) {
      const k = 1 - a;
      const r = ((c0 & 255) * k + (c1 & 255) * a) | 0, g = (((c0 >>> 8) & 255) * k + ((c1 >>> 8) & 255) * a) | 0, b = (((c0 >>> 16) & 255) * k + ((c1 >>> 16) & 255) * a) | 0;
      return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
    function shadeFx(c0, mul, add) {
      const r = Math.min(255, (c0 & 255) * mul + add * 255) | 0, g = Math.min(255, ((c0 >>> 8) & 255) * mul + add * 228) | 0, b = Math.min(255, ((c0 >>> 16) & 255) * mul + add * 160) | 0;
      return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
    function depthCol(d, tint) {
      const g = Math.max(0, Math.min(1, 1 - (d - dMin) / dSpan)), v = 0.1 + 0.9 * g;
      return tint ? pack(v, v * 0.55, v * 0.16) : pack(v * 0.86, v * 0.92, v);
    }

    // 1画素ずつ視線を伸ばし、当たった物と奥行きを記録する
    function geometry() {
      const hit = { t: 0, x: 0, y: 0, h: 0, n: 0, kind: 0, id: 0, nx: 0, ny: 0, nz: 0 };
      let lo = Infinity, hi = -Infinity;
      for (let py = 0, p = 0; py < BH; py++) {
        const sy = pySy(py);
        for (let px = 0; px < BW; px++, p++) {
          castRay(town, pxSx(px), sy, hit);
          tB[p] = hit.t; xB[p] = hit.x; yB[p] = hit.y; zB[p] = hit.h; nB[p] = hit.n; kB[p] = hit.kind; iB[p] = hit.id;
          if (hit.n === 4) { nxB[p] = hit.nx; nyB[p] = hit.ny; nzB[p] = hit.nz; }
          const d = (hit.x + hit.y) / 2 - hit.h * R2;
          if (d < lo) lo = d;
          if (d > hi) hi = d;
        }
      }
      dMin = lo; dSpan = Math.max(1e-6, hi - lo);
      for (let p = 0; p < BW * BH; p++) depthImg[p] = depthCol((xB[p] + yB[p]) / 2 - zB[p] * R2, false);
    }

    function lampGlow(x, y) {
      const ex = streetDist(x), ey = streetDist(y);
      if (ex > 3.2 || ey > 3.2) return 0;
      const a = ex - 1.3, b = ey - 1.3, f = Math.max(0, 1 - (a * a + b * b) / 4.4);
      return f * f * 0.85;
    }
    // 記録した当たりの点に、太陽・空・夜の明かりの光を当てて色にする（行 r0〜r1）
    function lightRows(Sx, r0, r1, out, sOut) {
      const L = Sx.L, A = Sx.amb, U = Sx.sun, K = Sx.sky, night = Sx.night;
      const M = town.M, B = town.buildings, T = town.trees, gc = [0, 0, 0];
      for (let p = r0 * BW, end = r1 * BW; p < end; p++) {
        const kind = kB[p], n = nB[p], x = xB[p], y = yB[p], z = zB[p];
        let nx = 0, ny = 0, nz = 1;
        if (n === 1) { nx = -1; nz = 0; } else if (n === 2) { ny = -1; nz = 0; } else if (n === 4) { nx = nxB[p]; ny = nyB[p]; nz = nzB[p]; }
        let ar, ag, ab, er = 0, eg = 0, eb = 0, ao = 1, water = false, ground = false;
        if (kind === 3) {
          water = true;
          const w = 0.025 * Math.sin(x * 1.7 + y * 2.3) + 0.02 * Math.sin(x * 4.1 - y * 3.3);
          ar = 0.13 + w; ag = 0.27 + w; ab = 0.34 + w;
        } else if (kind === 1) {
          const g = T[iB[p]].g;
          ar = 0.24 + g * 0.12; ag = 0.4 + g * 0.14; ab = 0.19 + g * 0.06; ao = 0.78 + 0.22 * nz;
        } else if (kind === 2) {
          ar = 0.32; ag = 0.24; ab = 0.17;
        } else {
          const m = M[iB[p]];
          if (m > 0) {
            const b = B[m];
            if (n === 0) { ar = b.roof[0]; ag = b.roof[1]; ab = b.roof[2]; }
            else {
              ar = b.wall[0]; ag = b.wall[1]; ab = b.wall[2];
              ao = 0.7 + 0.3 * Math.min(1, (z - GROUND) / 1.6);
              const w = n === 1 ? y : x, fz = (z - GROUND) / 0.9, fl = Math.floor(fz), fw = w / 0.7, col = Math.floor(fw);
              const a = fz - fl, c = fw - col;
              if (fl >= 0 && a > 0.32 && a < 0.78 && c > 0.2 && c < 0.74 && z < b.h - 0.2) {
                ar = ar * 0.45 + 0.08; ag = ag * 0.48 + 0.1; ab = ab * 0.5 + 0.15;
                if (night > 0 && hash3(m, fl, col + n * 9973) < (b.tower ? 0.5 : 0.36)) { er = 0.95 * night; eg = 0.74 * night; eb = 0.42 * night; }
              }
            }
          } else if (n !== 0) { ar = 0.5; ag = 0.48; ab = 0.44; ao = 0.8; }
          else { groundAlbedo(x, y, m, gc); ar = gc[0]; ag = gc[1]; ab = gc[2]; ground = true; }
        }
        let ndl = nx * L[0] + ny * L[1] + nz * L[2], sh = 0;
        if (Sx.up && ndl > 0) sh = shadowAt(town, x + nx * 0.02, y + ny * 0.02, z + nz * 0.02, L) ? 0 : 1;
        else ndl = 0;
        sOut[p] = sh;
        let lr = A[0] * ao + U[0] * ndl * sh, lg = A[1] * ao + U[1] * ndl * sh, lb = A[2] * ao + U[2] * ndl * sh;
        if (ground && night > 0.02) { const g = lampGlow(x, y) * night; lr += g; lg += g * 0.8; lb += g * 0.5; }
        let r = ar * lr + er, g = ag * lg + eg, bl = ab * lb + eb;
        if (water) { r = r * 0.6 + K[0] * 0.4; g = g * 0.6 + K[1] * 0.4; bl = bl * 0.6 + K[2] * 0.4; }
        out[p] = pack(r, g, bl);
      }
    }
    // 影の計算は重いので、時刻を変えたときは数フレームに分けて裏の入れ物に描き、できたら入れ替える
    function runJob(budget) {
      if (!job) return;
      const t0 = performance.now();
      while (job.row < BH && performance.now() - t0 < budget) {
        const r1 = Math.min(BH, job.row + 6);
        lightRows(job.S, job.row, r1, back, sBack);
        job.row = r1;
      }
      if (job.row >= BH) {
        const a = base; base = back; back = a;
        const b = sB; sB = sBack; sBack = b;
        S = job.S; job = null;
      }
    }

    function setup() {
      const cw = Math.max(1, cv.clientWidth), ch = Math.max(1, cv.clientHeight);
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      let w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
      const k = Math.min(1, Math.sqrt(MAXPX / (w * h)));
      w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
      if (w === BW && h === BH) return;
      BW = w; BH = h; cv.width = w; cv.height = h;
      scale = Math.min(w / (SX1 - SX0), h / (SY1 - SY0));
      offX = (w - (SX1 - SX0) * scale) / 2; offY = (h - (SY1 - SY0) * scale) / 2;
      const n = w * h;
      tB = new Float32Array(n); xB = new Float32Array(n); yB = new Float32Array(n); zB = new Float32Array(n);
      nxB = new Float32Array(n); nyB = new Float32Array(n); nzB = new Float32Array(n);
      nB = new Uint8Array(n); kB = new Uint8Array(n); iB = new Int32Array(n); sB = new Uint8Array(n); sBack = new Uint8Array(n);
      base = new Uint32Array(n); back = new Uint32Array(n); depthImg = new Uint32Array(n); zbuf = new Float32Array(n);
      img = ctx.createImageData(w, h); frameB = new Uint32Array(img.data.buffer);
      geometry();
      const sp = sunFor(hour);
      S = withMul(lightState(sp.alt, sp.az));
      lightRows(S, 0, BH, base, sB);
      job = null;
    }

    // ---- 車と信号を1画素ずつ描く ----
    let SLAB_F = 0;
    // 視線（車の向きに回した座標）と箱 P[q..q+5] の交わり。入った面の番号を SLAB_F に入れる
    function slab(ox, oy, oz, ix, iy, iz, P, q) {
      let a = (P[q] - ox) * ix, b = (P[q + 1] - ox) * ix, tn, tf, f;
      if (a < b) { tn = a; tf = b; f = 0; } else { tn = b; tf = a; f = 1; }
      a = (P[q + 2] - oy) * iy; b = (P[q + 3] - oy) * iy;
      if (a < b) { if (a > tn) { tn = a; f = 2; } if (b < tf) tf = b; } else { if (b > tn) { tn = b; f = 3; } if (a < tf) tf = a; }
      a = (P[q + 4] - oz) * iz; b = (P[q + 5] - oz) * iz;
      if (a < b) { if (a > tn) { tn = a; f = 4; } if (b < tf) tf = b; } else { if (b > tn) { tn = b; f = 5; } if (a < tf) tf = a; }
      if (tn > tf || tf < 0) return -1;
      SLAB_F = f;
      return tn;
    }
    const oc = { alpha: 1, total: 0, seen: 0 };
    // 箱の集まりを描く。奥行きの図（tB）より手前の画素だけを描き、ほかの車とは zbuf で前後を比べる
    function drawBoxes(x, y, th, P, hmax, rr, paint) {
      const cs = Math.cos(th), sn = Math.sin(th);
      const sx0 = (x - y) * R2, sy0 = (x + y) / 2 + GROUND * R2;
      const pxa = Math.max(0, Math.floor(sxPx(sx0 - rr))), pxb = Math.min(BW - 1, Math.ceil(sxPx(sx0 + rr)));
      const pya = Math.max(0, Math.floor(syPy(sy0 + (rr + hmax) * R2))), pyb = Math.min(BH - 1, Math.ceil(syPy(sy0 - rr * R2)));
      oc.total = 0; oc.seen = 0;
      if (pxa > pxb || pya > pyb) return;
      const dlx = 0.5 * cs + 0.5 * sn, dly = 0.5 * cs - 0.5 * sn, dlz = -R2;
      const ix = 1 / (Math.abs(dlx) < 1e-9 ? 1e-9 : dlx), iy = 1 / (Math.abs(dly) < 1e-9 ? 1e-9 : dly), iz = 1 / dlz;
      const oz = TT - GROUND;
      for (let py = pya; py <= pyb; py++) {
        const sxy = 2 * (pySy(py) - TT * R2);
        for (let px = pxa; px <= pxb; px++) {
          const d = pxSx(px) * SQ2, ox = (sxy + d) / 2 - x, oy = (sxy - d) / 2 - y;
          const lx = ox * cs + oy * sn, ly = oy * cs - ox * sn;
          let best = Infinity, bf = 0, bq = 0;
          for (let q = 0; q < P.length; q += 6) {
            const t = slab(lx, ly, oz, ix, iy, iz, P, q);
            if (t >= 0 && t < best) { best = t; bf = SLAB_F; bq = q; }
          }
          if (best === Infinity) continue;
          oc.total++;
          const p = py * BW + px, front = best < tB[p] - 0.012;
          if (front) { oc.seen++; if (best >= zbuf[p]) continue; zbuf[p] = best; }
          else if (!ghost) continue;
          const hx = lx + dlx * best, hy = ly + dly * best, hz = oz + dlz * best;
          const col = view === 'depth'
            ? depthCol((x + hx * cs - hy * sn + y + hx * sn + hy * cs) / 2 - (hz + GROUND) * R2, true)
            : paint(bq, bf, hx, hy, hz, cs, sn);
          frameB[p] = front ? (oc.alpha < 1 ? mix(frameB[p], col, oc.alpha) : col) : mix(frameB[p], col, 0.32);
        }
      }
    }
    let cur = null, curSig = 'r';
    function paintCar(bq, bf, hx, hy, hz, cs, sn) {
      const c = cur, L = S.L, A = S.amb, U = S.sun, night = S.night;
      let nlx = 0, nly = 0, nlz = 0;
      if (bf === 0) nlx = -1; else if (bf === 1) nlx = 1; else if (bf === 2) nly = -1; else if (bf === 3) nly = 1; else if (bf === 4) nlz = -1; else nlz = 1;
      const nwx = nlx * cs - nly * sn, nwy = nlx * sn + nly * cs;
      const ndl = S.up ? Math.max(0, nwx * L[0] + nwy * L[1] + nlz * L[2]) * c.sh : 0;
      let ar = c.col[0], ag = c.col[1], ab = c.col[2], er = 0, eg = 0, eb = 0;
      if ((bq > 0 && bf < 4) || (c.kind === 'van' && bf === 1 && hz > 0.38)) { ar = 0.12; ag = 0.15; ab = 0.2; }
      else if (bq === 0 && bf < 2 && Math.abs(hy) > c.wid / 2 - 0.13 && hz > 0.12 && hz < 0.25) {
        if (bf === 1) { const k = 0.2 + night * 1.1; er = k; eg = k * 0.93; eb = k * 0.7; }
        else { const k = (c.a < -0.7 ? 0.85 : 0.12) + night * 0.6; er = k; eg = k * 0.1; eb = k * 0.08; }
      }
      const sp = bf === 5 ? 0.05 : 0;
      return pack(ar * (A[0] + U[0] * ndl) + er + sp, ag * (A[1] + U[1] * ndl) + eg + sp, ab * (A[2] + U[2] * ndl) + eb + sp);
    }
    const LAMP = { g: [0.25, 1, 0.55], y: [1, 0.82, 0.15], r: [1, 0.2, 0.15] };
    function paintSig(bq, bf) {
      const A = S.amb, U = S.sun, up = S.up && bf === 5 ? Math.max(0, S.L[2]) : 0;
      if (bq === 0) return pack(0.26 * (A[0] + U[0] * up), 0.27 * (A[1] + U[1] * up), 0.28 * (A[2] + U[2] * up));
      const c = LAMP[curSig];
      return pack(c[0] * 0.9 + 0.05, c[1] * 0.9 + 0.05, c[2] * 0.9 + 0.05);
    }
    function partsOf(c) {
      const hl = c.len / 2, hw = c.wid / 2;
      if (c.kind === 'van') return [-hl, hl, -hw, hw, 0.05, 0.62];
      return [-hl, hl, -hw, hw, 0.05, 0.29, -0.3 * c.len, 0.17 * c.len, -hw * 0.84, hw * 0.84, 0.29, 0.46];
    }
    const SIGS = [];
    sim.nodes.forEach((nd, k) => {
      for (const [dx, dy, axis] of [[-1.3, -1.3, 'ew'], [1.3, 1.3, 'ew'], [1.3, -1.3, 'ns'], [-1.3, 1.3, 'ns']]) SIGS.push({ x: nd.x + dx, y: nd.y + dy, node: k, axis });
    });
    const SIG_PARTS = [-0.05, 0.05, -0.05, 0.05, 0, 1.08, -0.15, 0.15, -0.15, 0.15, 1.02, 1.45];

    // 車の足元の影・日の影・夜のヘッドライトの照らす所を、地面の画素に足す
    function groundFx(c) {
      const x = c.px, y = c.py, cs = Math.cos(c.th), sn = Math.sin(c.th), hl = c.len / 2, hw = c.wid / 2;
      let ox = 0, oy = 0;
      const sunOn = S.up && c.sh > 0 && S.L[2] > 0.04, lamp = S.night > 0.15;
      if (sunOn) {
        const k = 0.32 / S.L[2];
        ox = -S.L[0] * k; oy = -S.L[1] * k;
        const m = Math.hypot(ox, oy);
        if (m > 2.4) { ox *= 2.4 / m; oy *= 2.4 / m; }
      }
      let x0 = x - 0.8, x1 = x + 0.8, y0 = y - 0.8, y1 = y + 0.8;
      if (sunOn) { x0 = Math.min(x0, x + ox - 0.8); x1 = Math.max(x1, x + ox + 0.8); y0 = Math.min(y0, y + oy - 0.8); y1 = Math.max(y1, y + oy + 0.8); }
      if (lamp) {
        const fx = x + cs * (hl + 1.4), fy = y + sn * (hl + 1.4);
        x0 = Math.min(x0, fx - 1.5); x1 = Math.max(x1, fx + 1.5); y0 = Math.min(y0, fy - 1.5); y1 = Math.max(y1, fy + 1.5);
      }
      const pxa = Math.max(0, Math.floor(sxPx((x0 - y1) * R2))), pxb = Math.min(BW - 1, Math.ceil(sxPx((x1 - y0) * R2)));
      const pya = Math.max(0, Math.floor(syPy((x1 + y1) / 2 + GROUND * R2))), pyb = Math.min(BH - 1, Math.ceil(syPy((x0 + y0) / 2 + GROUND * R2)));
      for (let py = pya; py <= pyb; py++) {
        for (let px = pxa, p = py * BW + pxa; px <= pxb; px++, p++) {
          if (kB[p] !== 0 || nB[p] !== 0 || zB[p] > GROUND + 0.01) continue;
          const wx = xB[p] - x, wy = yB[p] - y, lx = wx * cs + wy * sn, ly = wy * cs - wx * sn;
          let mul = 1, add = 0;
          if (Math.abs(lx) < hl + 0.07 && Math.abs(ly) < hw + 0.06) mul = 0.8;
          if (sunOn && sB[p]) {
            for (let f = 0; f <= 1.001; f += 0.25) {
              const qx = wx - ox * f, qy = wy - oy * f, ax = qx * cs + qy * sn, ay = qy * cs - qx * sn;
              if (Math.abs(ax) < hl && Math.abs(ay) < hw) { mul = Math.min(mul, S.shMul); break; }
            }
          }
          if (lamp && lx > hl && lx < hl + 2.6) {
            const w = 0.1 + (lx - hl) * 0.32;
            if (Math.abs(ly) < w) add = S.night * 0.45 * (1 - (lx - hl) / 2.6) * (1 - Math.abs(ly) / w);
          }
          if (mul < 1 || add > 0) frameB[p] = shadeFx(frameB[p], mul, add);
        }
      }
    }

    let hidCount = 0;
    const tmpP = { x: 0, y: 0, th: 0 };
    function draw() {
      frameB.set(view === 'depth' ? depthImg : base);
      zbuf.set(tB);
      for (const c of sim.cars) {
        posOnLink(sim.links[c.link], c.s, tmpP);
        c.px = tmpP.x; c.py = tmpP.y; c.th = tmpP.th;
        c.sh = S.up && !shadowAt(town, c.px, c.py, GROUND + 0.5, S.L) ? 1 : 0;
      }
      if (view === 'pic') for (const c of sim.cars) groundFx(c);
      hidCount = 0;
      for (const c of sim.cars) {
        cur = c;
        const edge = Math.min(c.px, c.py, WORLD - c.px, WORLD - c.py);
        oc.alpha = Math.max(0, Math.min(1, (edge - 0.3) / 1.6));
        if (oc.alpha <= 0) continue;
        if (!c.parts) c.parts = partsOf(c);
        drawBoxes(c.px, c.py, c.th, c.parts, c.kind === 'van' ? 0.62 : 0.46, Math.hypot(c.len, c.wid) / 2 + 0.05, paintCar);
        if (oc.total > 0 && oc.seen < oc.total * 0.4) hidCount++;
      }
      oc.alpha = 1;
      const st = sim.nodes.map((n) => signalAt(sim.t, n.off));
      for (const g of SIGS) { curSig = st[g.node][g.axis]; drawBoxes(g.x, g.y, 0, SIG_PARTS, 1.45, 0.25, paintSig); }
      ctx.putImageData(img, 0, 0);
    }

    // ---- 表示の文字と操作 ----
    const DIR = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
    function showHour() {
      const m = Math.floor(hour * 60 + 1e-6) % 1440, h = Math.floor(m / 60), mi = m % 60;
      hourO.textContent = String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
      hourI.setAttribute('aria-valuetext', h + '時' + mi + '分');
    }
    function syncSlider() {
      if (mode !== 'manual') hourI.value = String(Math.min(1435, Math.round((hour * 60) / 5) * 5 % 1440));
      showHour();
    }
    function stats() {
      $('carsO').textContent = String(sim.cars.length);
      $('tgtO').textContent = '台（この時刻の目安 ' + sim.target + ' 台）';
      $('altO').textContent = (S.alt < 0 ? '−' : '') + Math.abs(S.alt).toFixed(1) + '°';
      $('azO').textContent = S.alt > -0.8 ? '方角は' + DIR[Math.round(S.az / 45) % 8] : '地平線の下（方角は' + DIR[Math.round(S.az / 45) % 8] + '）';
      $('hidO').textContent = String(hidCount);
      let n = 0;
      for (const c of sim.cars) if (c.v < 0.05) n++;
      $('stopO').textContent = String(n);
    }
    function setModeUI() {
      nowB.setAttribute('aria-pressed', String(mode === 'live'));
      fastB.setAttribute('aria-pressed', String(mode === 'fast'));
    }
    hourI.addEventListener('input', () => { mode = 'manual'; hour = Number(hourI.value) / 60; job = null; setModeUI(); showHour(); });
    nowB.addEventListener('click', () => { mode = 'live'; tz = sfNow(); hour = tz.hour; job = null; setModeUI(); syncSlider(); });
    fastB.addEventListener('click', () => { mode = mode === 'fast' ? 'manual' : 'fast'; setModeUI(); });
    for (const r of document.querySelectorAll('input[name="view"]')) r.addEventListener('change', () => { if (r.checked) view = r.value; });
    ghostI.addEventListener('change', () => { ghost = ghostI.checked; });

    let prev = 0, acc = 0, lastStat = -1e9;
    function frame(now) {
      const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0;
      prev = now;
      if (mode === 'live') { tz = sfNow(); hour = tz.hour; }
      else if (mode === 'fast') hour = (hour + dt / 3.2) % 24;
      if (!job) {
        const sp = sunFor(hour);
        if (Math.abs(sp.alt - S.alt) > 0.3 || Math.abs(((sp.az - S.az + 540) % 360) - 180) > 0.8) job = { S: withMul(lightState(sp.alt, sp.az)), row: 0 };
      }
      runJob(thumb ? 9 : 7);
      acc += dt;
      let k = 0;
      while (acc >= 1 / 30 && k < 4) { stepTraffic(sim, 1 / 30, hour); acc -= 1 / 30; k++; }
      if (acc >= 1 / 30) acc = 0;
      draw();
      if (now - lastStat > 300) { lastStat = now; stats(); syncSlider(); }
      requestAnimationFrame(frame);
    }

    for (let i = 0; i < 1350; i++) stepTraffic(sim, 1 / 30, hour);
    setModeUI();
    setup();
    draw();
    stats(); syncSlider();
    let rsT = 0;
    if ('ResizeObserver' in window) new ResizeObserver(() => { clearTimeout(rsT); rsT = setTimeout(() => { setup(); draw(); }, BW > 1 ? 150 : 0); }).observe(cv);
    requestAnimationFrame(frame);
  },
});

dekiru.add({
  id: 'tr-20261124-tiny-engine', c: 'trend', lv: 3, date: '2026-11-24',
  t: 'HTML と CSS を読んで箱を並べ、canvas に描く小さなブラウザエンジンを一から作る（Ladybird のアルファ版）',
  y: 'えいちてぃーえむえるとしーえすえすをよんではこをならべきゃんばすにかくちいさなぶらうざえんじんをいちからつくる',
  tags: ['Ladybird', 'ブラウザエンジン', 'CSS のカスケード', '余白の重なり', 'Shadow DOM', 'Canvas'],
  d: '2026年11月23日、独自のエンジンを持つブラウザ Ladybird がアルファ版になり、macOS と Linux 向けの配布を始めた。Hacker News では取得した時点で 1081 点・271 件のコメント、X の公式の告知（fxtwitter で確認）はいいね 5974 件を集めていた。告知では、エンジンは既存のエンジンを分けて持ってきたもの（フォーク）ではなく一から作ったもので、アルファ版なので動かないサイトもあると書いている。この見本では、ブラウザが画面を描くまでの段階を JavaScript で一から作る。HTML を読んで DOM の木を作り（p の中で div が始まると先に p を閉じる、li が続くと前の li を閉じる、などの決まりを含む）、CSS を読んで、選択子の詳しさ（詳細度）・書いた順・!important・style 属性の順で値を決め、em や % を px に直す。次に箱を上から並べ（隣り合う上下の余白の重なり、親と最初の子の余白の重なり、中身のない箱の通り抜け、display: flow-root で重なりが止まる所を含む）、行を折り返し（英語は空白で、日本語は1文字ずつ区切り、「、」「。」や小さな「っ」を行の頭に置かない）、背景と枠を先に全部塗ってから文字を書く順で canvas に描く。同じ DOM を Shadow DOM の中に作ってこのブラウザにも描かせ、要素ごとの箱の位置と大きさを getBoundingClientRect と比べて、1 px 以内で合った数を出す。HTML の木の形も、このブラウザの読み方（template 要素）と比べる。絵の上で箱を指すと、両方の絵に余白・枠・内側の余白・中身を色分けして重ね、どの規則が勝ったかを出す。再現できていない所: 扱える要素は div・p・見出し・リスト・span・b・code など 30 種類ほどで、表・画像・フォームは描かない（知らない要素は span として扱う）。CSS は display の block・inline・list-item・flow-root・none と、余白・枠・背景色・角の丸み・幅と高さ・max-width・box-sizing・文字の大きさと太さと斜体・行の高さ・text-align・下線だけで、float・position・flex・grid・inline-block・vertical-align・@media は扱わない。選択子は型・class・id・子孫・子・:first-child・:last-child だけ。入れ子を間違えた HTML を直す処理（adoption agency）、inline の中に block がある場合、行の折り返しの細かい規則（Unicode の UAX #14 の全部）は入れていない。作った PC の Chrome で、4つの見本とかっこの多い文を、幅 160〜640 px で 4 px ずつ変えて比べたところ、4598 個の箱がすべて 1 px 以内で合った。ただし、行の高さの丸め方、行の終わりの閉じかっこを半分の幅にする所、行の頭の開きかっこを元の幅に戻す所は、その Chrome の動きを測って合わせた。ほかのブラウザや書体では、合う数が減ることがある。Ladybird の実際のコード（C++ の LibWeb）は読んでおらず、写してもいない。',
  p: 'ブラウザは「HTML を読む → style を決める → 箱を並べる → 描く」を順に進める。style を決める段階では、同じ要素に当たる規則どうしで選択子の詳しさ（id の数、class と疑似クラスの数、要素名の数の順）を比べ、同じなら後に書いた方が勝つ。style 属性はどの選択子より強く、!important はさらにその上に来る。読めない値の宣言は、無かったものとして次の候補を使う。箱を並べる段階で間違えやすいのが上下の余白の重なり（margin collapsing）で、隣り合う余白は足さずに、正の余白の最大と負の余白の最小を足す。親に上の枠も内側の余白もなければ、子の上の余白は親の外へ出る。この見本では、位置がまだ決まらない余白と箱をためておき、枠か文字が出てきた所でまとめて位置を決める。行の高さは、文字の上の高さと下の深さを整数に丸め、line-height との差の半分（上は切り捨て）を上下に足して決める。文字の幅は canvas の measureText で測る。1文字ずつ測って足すと隣の文字との詰め具合が入らず、境目の行で改行の位置が変わる。そこで、段落の文字を先頭から測り、前の塊までの幅を引く。canvas の textRendering を optimizeLegibility にしないと、「べて」「って」のような仮名の組が詰まらない。「。「」のように記号が並ぶと後ろのかっこが半分の幅に詰まるが、行の頭に来たかっこは元の幅に戻す。行の終わりの閉じかっこは、そのままでは入らないときだけ半分の幅にする。',
  refs: [
    { title: 'Ladybird is now in alpha（Andreas Kling、2026-11-23）', url: 'https://ladybird.org/posts/alpha/' },
    { title: 'Hacker News: Ladybird is now in alpha（2026-11-23）', url: 'https://news.ycombinator.com/item?id=50614249' },
    { title: 'X: @ladybirdbrowser「Ladybird is now in alpha」（2026-11-23）', url: 'https://x.com/ladybirdbrowser/status/2124895696516202969' },
    { title: 'CSS 2.1: Collapsing margins', url: 'https://www.w3.org/TR/CSS21/box.html#collapsing-margins' },
    { title: 'HTML Standard: Parsing HTML documents', url: 'https://html.spec.whatwg.org/multipage/parsing.html' },
  ],
  html: `<div class="app">
  <div class="bar">
    <label class="ctl"><span class="nm">見本</span><select id="sample">
      <option value="article">記事</option>
      <option value="margin">余白の重なり</option>
      <option value="ja">日本語の折り返し</option>
      <option value="cascade">どの規則が勝つか</option>
    </select></label>
    <label class="ctl wide"><span class="nm">幅</span><input type="range" id="width" min="160" max="640" step="1" value="400"><output id="widthO" for="width">400px</output></label>
    <label class="chk"><input type="checkbox" id="outline">箱と行の枠を見せる</label>
    <button type="button" id="play">描く順に再生</button>
  </div>
  <div class="eds">
    <label class="ed"><span class="nm">HTML（書き換えるとすぐ描き直す）</span><textarea id="srcH" spellcheck="false" rows="10"></textarea></label>
    <label class="ed"><span class="nm">CSS</span><textarea id="srcC" spellcheck="false" rows="10"></textarea></label>
  </div>
  <div class="panes">
    <figure class="pane"><figcaption>自作のエンジン（canvas に描いた絵）<span id="stepO" class="step"></span></figcaption>
      <div class="paper" id="mineP"><canvas id="cv" role="img" aria-label="自作のエンジンが canvas に描いた絵。となりの、このブラウザが描いた絵と同じ内容"></canvas><canvas id="ov1" class="ov" aria-hidden="true"></canvas></div></figure>
    <figure class="pane"><figcaption>このブラウザ（同じ DOM と CSS）</figcaption>
      <div class="paper" id="realP"><div id="host"></div><canvas id="ov2" class="ov" aria-hidden="true"></canvas></div></figure>
  </div>
  <div class="stats">
    <div class="stat"><span>位置と大きさが合った箱</span><b id="matchO">-</b><span id="matchS">1 px 以内</span></div>
    <div class="stat"><span>要素 / 行 / 描く命令</span><b id="countO">-</b><span id="countS"></span></div>
    <div class="stat"><span>かかった時間</span><b id="timeO">-</b><span id="timeS"></span></div>
    <div class="stat"><span>HTML の木の形</span><b id="treeO">-</b><span id="treeS">このブラウザの読み方と比べる</span></div>
  </div>
  <p class="info" id="info" aria-live="polite">絵の上で箱を指すと、両方の絵に余白（橙）・枠（黄）・内側の余白（緑）・中身（青）を重ねる。押すと、その要素の style の決まり方を下に出す。</p>
  <details open><summary>選んだ要素の style（どの規則が勝ったか）</summary><div id="casc" class="casc"></div></details>
  <details><summary>DOM の木</summary><pre id="domO"></pre></details>
  <details><summary>箱と行</summary><pre id="boxO"></pre></details>
  <details><summary>描く命令（この順に canvas へ描く）</summary><pre id="listO"></pre></details>
  <details><summary>このブラウザとずれた箱</summary><pre id="diffO"></pre></details>
  <p class="small" id="noteO"></p>
</div>`,
  css: `:root { color-scheme: light; --bg: #f3f1ec; --fg: #23211d; --mut: #625d53; --line: #d4cec2; --panel: #fffdf8; --acc: #2f5f9e; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .app { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 10px; max-inline-size: 1400px; margin-inline: auto; }
    .bar { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
    .ctl { display: flex; align-items: center; gap: 6px; min-inline-size: 0; }
    .ctl.wide { flex: 1 1 220px; }
    .nm { font-size: 12px; color: var(--mut); white-space: nowrap; }
    .ctl input { flex: 1 1 120px; min-inline-size: 0; margin: 4px 0; }
    .ctl output { min-inline-size: 3.6em; font-variant-numeric: tabular-nums; font-weight: 600; }
    input { accent-color: var(--acc); }
    select { font: inherit; font-size: 13px; padding: 3px 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); }
    .chk { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; }
    button { font: inherit; font-size: 13px; padding: 4px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; }
    button:hover { border-color: var(--mut); }
    :is(input, button, select, textarea):focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    .eds { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 8px; }
    .ed { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
    textarea { box-sizing: border-box; inline-size: 100%; font: 12.5px/1.45 ui-monospace, Consolas, monospace; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); resize: vertical; }
    .panes { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }
    .pane { margin: 0; min-inline-size: 0; max-inline-size: 100%; display: flex; flex-direction: column; gap: 4px; }
    .pane figcaption { font-size: 12px; color: var(--mut); display: flex; flex-wrap: wrap; gap: 4px 10px; }
    .step { font-variant-numeric: tabular-nums; }
    .paper { position: relative; overflow: auto; max-inline-size: 100%; max-block-size: 75vh; border: 1px solid var(--line); background: #fff; }
    .paper canvas { display: block; }
    .ov { position: absolute; inset-block-start: 0; inset-inline-start: 0; pointer-events: none; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); gap: 6px; }
    .stat { min-inline-size: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; }
    .stat span { font-size: 11px; color: var(--mut); line-height: 1.35; overflow-wrap: anywhere; }
    .stat b { font-size: 20px; line-height: 1.25; font-variant-numeric: tabular-nums; }
    .info { margin: 0; font-size: 13px; min-block-size: 1.6em; overflow-wrap: anywhere; }
    details { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 4px 10px; }
    summary { cursor: pointer; font-size: 13px; }
    pre { margin: 6px 0; font: 12px/1.45 ui-monospace, Consolas, monospace; white-space: pre; overflow: auto; max-block-size: 320px; }
    .casc { display: flex; flex-direction: column; gap: 6px; padding-block: 6px; font: 12px/1.5 ui-monospace, Consolas, monospace; }
    .casc .ch { margin: 0; font-weight: 600; }
    .rule { border-inline-start: 3px solid var(--line); padding-inline-start: 8px; }
    .rule.author { border-color: #c98b3c; }
    .rule.inline { border-color: #3c8f5a; }
    .rule .sel { color: var(--acc); }
    .rule .org { color: var(--mut); font-family: system-ui, sans-serif; font-size: 11px; margin-inline-start: 6px; }
    .decl { padding-inline-start: 1.5em; }
    .decl.won { font-weight: 700; }
    .decl.lost { text-decoration: line-through; color: var(--mut); }
    .decl.unsup, .decl.bad { color: #9a5a1c; }
    .fin { margin: 0; padding: 6px 8px; background: #f4efe4; border-radius: 6px; max-block-size: none; }
    .small { font-size: 12px; color: var(--mut); margin: 0; overflow-wrap: anywhere; }
    .thumb .bar, .thumb .eds, .thumb .stats, .thumb .info, .thumb details, .thumb .small, .thumb figcaption, .thumb .pane + .pane { display: none; }
    .thumb .app { padding: 0; max-inline-size: none; }
    .thumb .paper { border: 0; max-block-size: none; overflow: hidden; }
    html.thumb, .thumb body { overflow: hidden; }`,
  core() {
    // ブラウザエンジンの4つの段階（HTML を読む・style を決める・箱を並べる・描く命令を作る）を、DOM を使わない関数で書く。
    // 文字の幅と高さだけは外から受け取る: M.width(font, text) → 幅、M.metrics(font) → { asc, desc }
    const OK_TAGS = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'blockquote', 'hr', 'br', 'span', 'b', 'strong', 'i', 'em', 'a', 'code', 'small', 'u', 's', 'mark']);
    const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'source', 'area', 'col', 'embed', 'track', 'base']);
    // p の中でこれらが始まると、先に p を閉じる（HTML の読み方の決まり）
    const CLOSE_P = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'blockquote', 'hr']);
    const HEADS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
    // li が始まったとき、前の li を探してさかのぼるのをやめる要素（div と p は通り抜ける）
    const LI_STOP = new Set(['ul', 'ol', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
    const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', hellip: '…', middot: '·' };

    function decodeEnt(s) {
      return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, k) => {
        if (k[0] === '#') {
          const n = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
          return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
        }
        return ENT[k] === undefined ? m : ENT[k];
      });
    }

    // ---- 1. HTML を読んで DOM の木を作る ----
    function parseHTML(src) {
      const root = { type: 'el', tag: '#root', orig: '#root', attrs: {}, children: [], up: null, depth: 0 };
      const stack = [root];
      const notes = { tags: new Set(), attrs: new Set(), fixes: 0 };
      const cur = () => stack[stack.length - 1];
      const openAt = (t) => { for (let k = stack.length - 1; k > 0; k--) if (stack[k].orig === t) return k; return -1; };
      // k 番目より上を閉じる。implied なら全部が「書かれていない閉じタグ」
      const popTo = (k, implied) => { const n = stack.length - k; notes.fixes += implied ? n : n - 1; stack.length = k; };
      const addText = (s) => {
        if (!s) return;
        const t = decodeEnt(s), c = cur(), last = c.children[c.children.length - 1];
        if (last && last.type === 'text') last.text += t;
        else c.children.push({ type: 'text', text: t, up: c });
      };
      const startTag = (tag, attrs) => {
        if (tag === 'li') {
          for (let q = stack.length - 1; q > 0; q--) {
            const t = stack[q].orig;
            if (t === 'li') { popTo(q, true); break; }
            if (LI_STOP.has(t)) break;
          }
        }
        if (CLOSE_P.has(tag)) { const k = openAt('p'); if (k > 0) popTo(k, true); }
        if (HEADS.has(tag) && HEADS.has(cur().orig)) popTo(stack.length - 1, true);
        const known = OK_TAGS.has(tag), isVoid = VOID_TAGS.has(tag);
        if (!known) notes.tags.add(tag);
        const c = cur();
        const e = { type: 'el', tag: known ? tag : (isVoid ? '#skip' : 'span'), orig: tag, attrs, children: [], up: c, depth: c.depth + 1 };
        c.children.push(e);
        if (!isVoid) stack.push(e);
      };
      const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/y;
      const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let i = 0;
      while (i < src.length) {
        const lt = src.indexOf('<', i);
        if (lt < 0) { addText(src.slice(i)); break; }
        addText(src.slice(i, lt));
        if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? src.length : e + 3; continue; }
        if (src[lt + 1] === '!' || src[lt + 1] === '?') { const e = src.indexOf('>', lt); i = e < 0 ? src.length : e + 1; continue; }
        TAG.lastIndex = lt;
        const m = TAG.exec(src);
        if (!m) { addText('<'); i = lt + 1; continue; }
        i = TAG.lastIndex;
        const tag = m[2].toLowerCase();
        if (m[1]) {
          if (tag === 'br') { startTag('br', {}); continue; }
          if (tag === 'p' && openAt('p') < 0) { const c = cur(); c.children.push({ type: 'el', tag: 'p', orig: 'p', attrs: {}, children: [], up: c, depth: c.depth + 1 }); notes.fixes++; continue; }
          let k = -1;
          if (HEADS.has(tag)) { for (let q = stack.length - 1; q > 0; q--) if (HEADS.has(stack[q].orig)) { k = q; break; } }
          else k = openAt(tag);
          if (k > 0) popTo(k, false);
          else notes.fixes++;   // 開いていない要素の閉じタグは捨てる
          continue;
        }
        const attrs = {};
        ATTR.lastIndex = 0;
        let a;
        while ((a = ATTR.exec(m[3]))) {
          const k = a[1].toLowerCase();
          if (k === 'class' || k === 'id' || k === 'style') { if (!(k in attrs)) attrs[k] = decodeEnt(a[2] ?? a[3] ?? a[4] ?? ''); }
          else notes.attrs.add(k);
        }
        startTag(tag, attrs);
      }
      return { root, notes };
    }

    // ---- 2. CSS を読む ----
    // かっこと引用符の外にある区切りで分ける（sep が ' ' なら空白で分ける）
    function splitTop(s, sep) {
      const out = [];
      let depth = 0, q = '', start = 0;
      for (let k = 0; k < s.length; k++) {
        const ch = s[k];
        if (q) { if (ch === q) q = ''; continue; }
        if (ch === '"' || ch === "'") q = ch;
        else if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { out.push(s.slice(start, k)); start = k + 1; }
      }
      out.push(s.slice(start));
      return out.map((x) => x.trim()).filter(Boolean);
    }
    const SEL_RE = /^(\*|[a-zA-Z][a-zA-Z0-9-]*)?((?:[.#]-?[A-Za-z_\u00a0-\uffff][\w\u00a0-\uffff-]*|:(?:first-child|last-child))*)/;
    // 選択子を、右から順に照らし合わせる部品の列にする。扱えない書き方なら null
    function parseSelector(text) {
      const parts = [];
      let s = text.trim(), comb = '';
      while (s) {
        const m = SEL_RE.exec(s);
        if (!m || !m[0]) return null;
        const c = { comb, tag: m[1] && m[1] !== '*' ? m[1].toLowerCase() : '', ids: [], cls: [], ps: [] };
        for (const q of m[2].match(/[.#]-?[A-Za-z_\u00a0-\uffff][\w\u00a0-\uffff-]*|:[\w-]+/g) || []) {
          if (q[0] === '#') c.ids.push(q.slice(1));
          else if (q[0] === '.') c.cls.push(q.slice(1));
          else c.ps.push(q.slice(1));
        }
        parts.push(c);
        s = s.slice(m[0].length);
        if (!s) break;
        const w = /^\s*(>)?\s*/.exec(s);
        if (!w[0]) return null;
        comb = w[1] ? '>' : ' ';
        s = s.slice(w[0].length);
        if (!s) return null;
      }
      if (!parts.length) return null;
      let a = 0, b = 0, c = 0;
      for (const p of parts) { a += p.ids.length; b += p.cls.length + p.ps.length; if (p.tag) c++; }
      return { text: text.trim().replace(/\s+/g, ' '), parts, spec: [a, b, c] };
    }
    function cmpSpec(x, y) { return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }
    function matchCompound(e, c) {
      if (!e || e.type !== 'el' || e.tag === '#root') return false;
      if (c.tag && c.tag !== e.tag) return false;
      for (const id of c.ids) if (e.attrs.id !== id) return false;
      if (c.cls.length) {
        const have = (e.attrs.class || '').split(/\s+/);
        for (const x of c.cls) if (!have.includes(x)) return false;
      }
      if (c.ps.length) {
        const sib = e.up ? e.up.children.filter((k) => k.type === 'el') : [e];
        for (const p of c.ps) {
          if (p === 'first-child' && sib[0] !== e) return false;
          if (p === 'last-child' && sib[sib.length - 1] !== e) return false;
        }
      }
      return true;
    }
    function matchSel(e, sel) {
      const P = sel.parts;
      const at = (k, node) => {
        if (!matchCompound(node, P[k])) return false;
        if (k === 0) return true;
        if (P[k].comb === '>') return at(k - 1, node.up);
        for (let a = node.up; a; a = a.up) if (at(k - 1, a)) return true;
        return false;
      };
      return at(P.length - 1, e);
    }
    function parseDecls(body) {
      const out = [];
      for (const part of splitTop(body, ';')) {
        const c = part.indexOf(':');
        if (c < 1) continue;
        const prop = part.slice(0, c).trim().toLowerCase();
        let value = part.slice(c + 1).trim(), important = false;
        const im = /!\s*important\s*$/i.exec(value);
        if (im) { important = true; value = value.slice(0, im.index).trim(); }
        if (value) out.push({ prop, value, important });
      }
      return out;
    }
    // 規則の列にする。@ で始まる規則と、扱えない選択子を含む規則は捨てて bad に記録する
    function parseCSS(src, origin) {
      const s = src.replace(/\/\*[\s\S]*?\*\//g, '');
      const rules = [], bad = [];
      let i = 0;
      while (i < s.length) {
        const ob = s.indexOf('{', i);
        if (ob < 0) break;
        let head = s.slice(i, ob);
        const sc = head.lastIndexOf(';');
        if (sc >= 0) head = head.slice(sc + 1);
        head = head.trim();
        let depth = 1, j = ob + 1;
        while (j < s.length && depth) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
        const body = s.slice(ob + 1, depth ? j : j - 1);
        i = j;
        if (head[0] === '@') { bad.push(head.split(/\s/)[0]); continue; }
        const sels = splitTop(head, ',').map(parseSelector);
        if (!sels.length || sels.some((x) => !x)) { bad.push(head); continue; }
        rules.push({ sels, decls: parseDecls(body), origin });
      }
      return { rules, bad };
    }

    // ---- 3. style を決める ----
    const SIDES = ['top', 'right', 'bottom', 'left'];
    const SUP = new Set(['display', 'color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family', 'line-height', 'text-align', 'text-decoration', 'list-style-type', 'width', 'height', 'max-width', 'box-sizing', 'border-radius']);
    for (const s of SIDES) { SUP.add('margin-' + s); SUP.add('padding-' + s); for (const k of ['width', 'style', 'color']) SUP.add('border-' + s + '-' + k); }
    const BORDER_STYLES = /^(none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset)$/i;
    const BG_KW = new Set(['none', 'repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round', 'top', 'left', 'right', 'bottom', 'center', 'fixed', 'scroll', 'local', 'cover', 'contain', 'auto', 'padding-box', 'border-box', 'content-box']);
    const four = (v) => { const t = splitTop(v, ' '); if (t.length < 1 || t.length > 4) return null; const [a, b = a, c = a, d = b] = t; return [a, b, c, d]; };
    // まとめて書く指定（margin や border）を、1つずつの指定に分ける
    function expand(prop, value) {
      const v = value.trim();
      if (prop === 'margin' || prop === 'padding') { const t = four(v); return t ? t.map((x, k) => [prop + '-' + SIDES[k], x]) : [[prop, v]]; }
      if (prop === 'border-width' || prop === 'border-style' || prop === 'border-color') {
        const t = four(v), kind = prop.slice(7);
        return t ? t.map((x, k) => ['border-' + SIDES[k] + '-' + kind, x]) : [[prop, v]];
      }
      if (prop === 'border' || /^border-(top|right|bottom|left)$/.test(prop)) {
        const sides = prop === 'border' ? SIDES : [prop.slice(7)];
        let w = 'medium', st = 'none', co = 'currentcolor';
        for (const t of splitTop(v, ' ')) {
          if (BORDER_STYLES.test(t)) st = t.toLowerCase();
          else if (/^(thin|medium|thick)$/i.test(t) || /^-?(\d+\.?\d*|\.\d+)(px|em|rem|pt)?$/i.test(t)) w = t;
          else co = t;
        }
        if (v.toLowerCase() === 'none' || v === '0') { w = '0'; st = 'none'; }
        const out = [];
        for (const s of sides) out.push(['border-' + s + '-width', w], ['border-' + s + '-style', st], ['border-' + s + '-color', co]);
        return out;
      }
      if (prop === 'background') {
        const t = splitTop(v, ' ');
        let co = 'transparent';
        for (const x of t) if (/^(#|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\()/i.test(x) || (/^[a-z]+$/i.test(x) && !BG_KW.has(x.toLowerCase()))) co = x;
        return [['background-color', co]];
      }
      if (prop === 'border-radius') return [['border-radius', splitTop(v.split('/')[0], ' ')[0] || v]];
      if (prop === 'text-decoration-line') return [['text-decoration', v]];
      return [[prop, v]];
    }
    const KW_FS = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 };
    // 長さを読む: { px } か { pct } か 'auto'。読めなければ null
    function lenOf(v, fs) {
      if (v === 'auto') return 'auto';
      const m = /^(-?(?:\d+\.?\d*|\.\d+))(px|em|rem|%|pt)?$/.exec(v);
      if (!m) return null;
      const n = parseFloat(m[1]), u = m[2] || '';
      if (!u) return n === 0 ? { px: 0 } : null;
      if (u === 'px') return { px: n };
      if (u === 'em') return { px: n * fs };
      if (u === 'rem') return { px: n * 16 };
      if (u === 'pt') return { px: n * 4 / 3 };
      return { pct: n };
    }
    function fsOf(v, pfs) {
      if (KW_FS[v]) return KW_FS[v];
      if (v === 'smaller') return pfs / 1.2;
      if (v === 'larger') return pfs * 1.2;
      const L = lenOf(v, pfs);
      if (!L || L === 'auto') return null;
      const px = 'pct' in L ? L.pct / 100 * pfs : L.px;
      return px >= 0 ? px : null;
    }
    function fwOf(v, pfw) {
      if (v === 'normal') return 400;
      if (v === 'bold') return 700;
      if (v === 'bolder') return pfw < 350 ? 400 : pfw < 550 ? 700 : 900;
      if (v === 'lighter') return pfw < 100 ? pfw : pfw < 550 ? 100 : pfw < 750 ? 400 : 700;
      const n = Number(v);
      return n >= 1 && n <= 1000 ? n : null;
    }
    const INHERITED = new Set(['color', 'font-size', 'font-weight', 'font-style', 'font-family', 'line-height', 'text-align', 'list-style-type']);
    const INIT_ALL = { display: 'inline', color: '#000', 'background-color': 'transparent', 'font-size': 16, 'font-weight': 400, 'font-style': 'normal', 'font-family': 'serif', 'line-height': 'normal', 'text-align': 'left', 'text-decoration': [], 'list-style-type': 'disc', width: 'auto', height: 'auto', 'max-width': 'none', 'box-sizing': 'content-box', 'border-radius': 0 };
    for (const s of SIDES) { INIT_ALL['margin-' + s] = { px: 0 }; INIT_ALL['padding-' + s] = { px: 0 }; INIT_ALL['border-' + s + '-width'] = 3; INIT_ALL['border-' + s + '-style'] = 'none'; INIT_ALL['border-' + s + '-color'] = 'currentcolor'; }
    const PROP_ORDER = ['font-size', ...Object.keys(INIT_ALL).filter((p) => p !== 'font-size')];
    // 1つの値を計算済みの値にする。読めない値なら null（その宣言は無かったことになる）
    function computeOne(prop, raw, ps, cs, opt) {
      const v = raw.trim(), lv = v.toLowerCase();
      if (lv === 'inherit') return ps[prop];
      if (lv === 'initial') return INIT_ALL[prop];
      if (lv === 'unset') return INHERITED.has(prop) ? ps[prop] : INIT_ALL[prop];
      const fs = cs['font-size'];
      switch (prop) {
        case 'display': return /^(block|inline|list-item|flow-root|none)$/.test(lv) ? lv : null;
        case 'color': return lv === 'currentcolor' ? ps.color : (opt.isColor(v) ? v : null);
        case 'background-color': return opt.isColor(v) ? v : null;
        case 'font-size': return fsOf(lv, ps['font-size']);
        case 'font-weight': return fwOf(lv, ps['font-weight']);
        case 'font-style': return /^(normal|italic|oblique)$/.test(lv) ? (lv === 'normal' ? 'normal' : 'italic') : null;
        case 'font-family': return /^[^;{}!]+$/.test(v) ? v : null;
        case 'line-height': {
          if (lv === 'normal') return 'normal';
          if (/^(\d+\.?\d*|\.\d+)$/.test(lv)) return { num: parseFloat(lv) };
          const L = lenOf(lv, fs);
          if (!L || L === 'auto') return null;
          const px = 'pct' in L ? L.pct / 100 * fs : L.px;
          return px >= 0 ? { px } : null;
        }
        case 'text-align': return { left: 'left', start: 'left', right: 'right', end: 'right', center: 'center', justify: 'left' }[lv] || null;
        case 'text-decoration': {
          if (lv === 'none') return [];
          const t = lv.split(/\s+/).filter((x) => /^(underline|line-through|overline)$/.test(x));
          return t.length ? t : null;
        }
        case 'list-style-type': return /^(disc|circle|square|decimal|none)$/.test(lv) ? lv : null;
        case 'box-sizing': return /^(content-box|border-box)$/.test(lv) ? lv : null;
        case 'width': case 'height': { const L = lenOf(lv, fs); return L && (L === 'auto' || 'pct' in L || L.px >= 0) ? L : null; }
        case 'max-width': { if (lv === 'none') return 'none'; const L = lenOf(lv, fs); return L && L !== 'auto' && ('pct' in L || L.px >= 0) ? L : null; }
        case 'border-radius': { const L = lenOf(lv, fs); return L && L !== 'auto' && !('pct' in L) && L.px >= 0 ? L.px : null; }
      }
      if (prop.startsWith('margin-')) return lenOf(lv, fs);
      if (prop.startsWith('padding-')) { const L = lenOf(lv, fs); return L && L !== 'auto' && ('pct' in L || L.px >= 0) ? L : null; }
      if (/^border-\w+-width$/.test(prop)) {
        const n = { thin: 1, medium: 3, thick: 5 }[lv];
        if (n !== undefined) return n;
        const L = lenOf(lv, fs);
        return L && L !== 'auto' && !('pct' in L) && L.px >= 0 ? L.px : null;
      }
      if (/^border-\w+-style$/.test(prop)) return BORDER_STYLES.test(lv) ? lv : null;
      if (/^border-\w+-color$/.test(prop)) return lv === 'currentcolor' ? 'currentcolor' : (opt.isColor(v) ? v : null);
      return null;
    }
    const UA_CSS = `
div, p, h1, h2, h3, h4, h5, h6, ul, ol, section, article, header, footer, main, nav, aside, blockquote, hr { display: block }
li { display: list-item }
p { margin: 1em 0 }
h1 { font-size: 2em; margin: .67em 0; font-weight: bold }
h2 { font-size: 1.5em; margin: .83em 0; font-weight: bold }
h3 { font-size: 1.17em; margin: 1em 0; font-weight: bold }
h4 { margin: 1.33em 0; font-weight: bold }
h5 { font-size: .83em; margin: 1.67em 0; font-weight: bold }
h6 { font-size: .67em; margin: 2.33em 0; font-weight: bold }
ul, ol { margin: 1em 0; padding-left: 40px }
ol { list-style-type: decimal }
ul ul, ul ol, ol ul, ol ol { margin-top: 0; margin-bottom: 0 }
ul ul, ol ul { list-style-type: circle }
blockquote { margin: 1em 40px }
b, strong { font-weight: bolder }
i, em { font-style: italic }
code { font-family: monospace }
small { font-size: smaller }
u { text-decoration: underline }
s { text-decoration: line-through }
mark { background-color: yellow; color: black }
hr { color: gray; border-style: inset; border-width: 1px; margin: .5em auto }`;
    function rootStyle(opt) {
      const cs = Object.assign({}, INIT_ALL);
      for (const s of SIDES) cs['border-' + s + '-width'] = 0;
      return Object.assign(cs, { display: 'flow-root', color: opt.color, 'font-family': 'sans-serif', 'line-height': { num: 1.5 } });
    }
    // 木の全部の要素に、当たった規則（matched）と計算済みの値（cs）を付ける
    function styleTree(root, sheets, opt) {
      opt = Object.assign({ isColor: (v) => v.length > 0, dpr: 1, color: '#222' }, opt);
      const all = [];
      for (const sh of sheets) for (const r of sh.rules) all.push(r);
      root.cs = rootStyle(opt); root.matched = []; root.deco = [];
      const styleNode = (e, ps, pdeco) => {
        if (e.type !== 'el') return;
        const cand = new Map(), matched = [];
        const add = (p, item, key) => { let L = cand.get(p); if (!L) cand.set(p, (L = [])); L.push({ item, key }); };
        const take = (m, decls, lvlOf, spec, ri) => decls.forEach((d, di) => {
          for (const [p, v] of expand(d.prop, d.value)) {
            const item = { p, v, imp: d.important, ok: SUP.has(p), won: false, bad: false };
            m.decls.push(item);
            if (item.ok) add(p, item, [lvlOf(d.important), spec[0], spec[1], spec[2], ri, di]);
          }
        });
        all.forEach((r, ri) => {
          let best = null;
          for (const s of r.sels) if (matchSel(e, s) && (!best || cmpSpec(s.spec, best.spec) > 0)) best = s;
          if (!best) return;
          const m = { origin: r.origin, sel: best.text, spec: best.spec, ri, decls: [] };
          matched.push(m);
          // 強さの段: ブラウザ既定 0、作者 1、style 属性 2、作者の !important 3、style 属性の !important 4
          take(m, r.decls, (imp) => (r.origin === 'ua' ? (imp ? 5 : 0) : (imp ? 3 : 1)), best.spec, ri);
        });
        if (e.attrs.style) {
          const m = { origin: 'style', sel: 'style 属性', spec: null, ri: all.length, decls: [] };
          matched.push(m);
          take(m, parseDecls(e.attrs.style), (imp) => (imp ? 4 : 2), [0, 0, 0], all.length);
        }
        for (const L of cand.values()) L.sort((x, y) => { for (let k = 0; k < 6; k++) if (x.key[k] !== y.key[k]) return y.key[k] - x.key[k]; return 0; });
        const cs = {};
        for (const p of PROP_ORDER) {
          let val, got = false;
          for (const c of cand.get(p) || []) {
            const r = computeOne(p, c.item.v, ps, cs, opt);
            if (r === null || r === undefined) { c.item.bad = true; continue; }
            val = r; c.item.won = true; got = true; break;
          }
          cs[p] = got ? val : (INHERITED.has(p) ? ps[p] : INIT_ALL[p]);
        }
        if (e.tag === '#skip') cs.display = 'none';
        for (const s of SIDES) {
          // 枠の線: 線の種類が none なら幅は 0。幅は画面の画素の整数倍に切り捨て、0 より大きく 1 より細い線は 1 にする
          const st = cs['border-' + s + '-style'];
          let w = st === 'none' || st === 'hidden' ? 0 : cs['border-' + s + '-width'];
          if (w > 0) w = w < 1 ? 1 : Math.floor(w * opt.dpr + 1e-6) / opt.dpr;
          cs['border-' + s + '-width'] = w;
          if (cs['border-' + s + '-color'] === 'currentcolor') cs['border-' + s + '-color'] = cs.color;
        }
        e.cs = cs; e.matched = matched;
        e.deco = pdeco.concat(cs['text-decoration'].map((line) => ({ line, color: cs.color })));
        for (const k of e.children) styleNode(k, cs, e.deco);
      };
      for (const k of root.children) styleNode(k, root.cs, root.deco);
      return root;
    }

    // ---- 4. 箱を並べる ----
    const fontOf = (cs) => (cs['font-style'] === 'italic' ? 'italic ' : '') + cs['font-weight'] + ' ' + cs['font-size'] + 'px ' + cs['font-family'];
    // 文字の上の高さ A と下の深さ D（整数に丸める）
    const fontBox = (cs, M) => { const fm = M.metrics(fontOf(cs)); return { A: Math.round(fm.asc), D: Math.round(fm.desc) }; };
    const round64 = (v) => Math.round(v * 64) / 64;
    function lhPx(cs, fb) {
      const lh = cs['line-height'];
      if (lh === 'normal') return fb.A + fb.D;
      return round64('num' in lh ? lh.num * cs['font-size'] : lh.px);
    }
    function sideVals(cs, base, cw) {
      return SIDES.map((s) => { const L = cs[base + '-' + s]; return L === 'auto' ? 'auto' : ('pct' in L ? L.pct / 100 * cw : L.px); });
    }
    const borders = (cs) => SIDES.map((s) => cs['border-' + s + '-width']);
    // 重なる余白: 正の余白の最大と負の余白の最小を足す
    function collapseMargins(list) { let pos = 0, neg = 0; for (const m of list) { if (m > pos) pos = m; if (m < neg) neg = m; } return pos + neg; }
    // F は1つの流れ（block formatting context）。y は次の箱の枠の上の位置、pos・neg はたまっている余白、waiting は位置を待っている箱
    function addMargin(F, v) { if (v > F.pos) F.pos = v; if (v < F.neg) F.neg = v; }
    function resolveF(F) {
      F.y += F.pos + F.neg; F.pos = 0; F.neg = 0;
      for (const w of F.waiting) w.y = F.y;
      F.waiting.length = 0;
      return F.y;
    }
    const isBlockLevel = (n) => n.type === 'el' && (n.cs.display === 'block' || n.cs.display === 'list-item' || n.cs.display === 'flow-root');
    // 子を「block の箱」と「行に並べる中身のまとまり」に分ける
    function flowKids(node) {
      const out = [];
      let run = null;
      for (const k of node.children) {
        if (k.type === 'el' && k.cs.display === 'none') continue;
        if (isBlockLevel(k)) { run = null; out.push({ kind: 'block', node: k }); }
        else { if (!run) { run = { kind: 'inline', nodes: [] }; out.push(run); } run.nodes.push(k); }
      }
      return out;
    }
    function flowChildren(node, lb, cx, cw, F, C) {
      const kids = flowKids(node);
      if (kids.length === 1 && kids[0].kind === 'inline') { layoutLines(kids[0].nodes, node, cx, cw, F, lb, C); return; }
      for (const k of kids) {
        if (k.kind === 'block') { lb.kids.push(layoutBlock(k.node, cx, cw, F, C)); continue; }
        // block と文字が混ざると、文字のまとまりは名前のない箱（匿名の箱）に入る
        const an = { anon: true, node, x: cx, y: 0, w: cw, h: 0, m: [0, 0, 0, 0], b: [0, 0, 0, 0], p: [0, 0, 0, 0], kids: [], lines: [] };
        layoutLines(k.nodes, node, cx, cw, F, an, C);
        if (an.lines.length) {
          const last = an.lines[an.lines.length - 1];
          an.y = an.lines[0].y; an.h = last.y + last.h - an.y;
          lb.kids.push(an);
        }
      }
    }
    function layoutBlock(node, x0, cw, F, C) {
      const cs = node.cs;
      const m = sideVals(cs, 'margin', cw), p = sideVals(cs, 'padding', cw), b = borders(cs);
      const hb = p[1] + p[3] + b[1] + b[3];
      const bbox = cs['box-sizing'] === 'border-box';
      const useW = (L) => { const v = 'pct' in L ? L.pct / 100 * cw : L.px; return Math.max(0, bbox ? v - hb : v); };
      // 幅: auto なら残りを全部使う。決まっていれば、左右の auto の余白で残りを分ける
      let w = cs.width === 'auto' ? null : useW(cs.width);
      if (cs['max-width'] !== 'none') {
        const mx = useW(cs['max-width']);
        const autoW = cw - (m[3] === 'auto' ? 0 : m[3]) - (m[1] === 'auto' ? 0 : m[1]) - hb;
        if (w === null ? autoW > mx : w > mx) w = mx;
      }
      let ml = m[3], mr = m[1];
      if (w === null) {
        if (ml === 'auto') ml = 0;
        if (mr === 'auto') mr = 0;
        w = Math.max(0, cw - ml - mr - hb);
      } else {
        const rest = cw - w - hb, fl = ml === 'auto' ? 0 : ml, fr = mr === 'auto' ? 0 : mr;
        if (rest - fl - fr < 0) { ml = fl; mr = rest - ml; }
        else if (ml === 'auto' && mr === 'auto') { ml = rest / 2; mr = rest - ml; }
        else if (ml === 'auto') ml = rest - mr;
        else mr = rest - ml;
      }
      const mt = m[0] === 'auto' ? 0 : m[0], mb = m[2] === 'auto' ? 0 : m[2];
      const lb = { node, x: x0 + ml, y: F.y, w: w + hb, h: 0, m: [mt, mr, mb, ml], b, p, kids: [], lines: [] };
      C.byNode.set(node, lb);
      const cx = lb.x + b[3] + p[3];
      const hL = cs.height;
      let hSpec = null;
      if (hL !== 'auto' && !('pct' in hL)) hSpec = Math.max(0, bbox ? hL.px - p[0] - p[2] - b[0] - b[2] : hL.px);
      addMargin(F, mt);
      if (cs.display === 'flow-root') {
        // 新しい流れを作る箱: 中の余白は外へ出ず、外の余白とも重ならない
        lb.y = resolveF(F);
        const F2 = { y: lb.y + b[0] + p[0], pos: 0, neg: 0, waiting: [] };
        flowChildren(node, lb, cx, w, F2, C);
        resolveF(F2);
        lb.h = b[0] + p[0] + (hSpec !== null ? hSpec : F2.y - (lb.y + b[0] + p[0])) + p[2] + b[2];
        F.y = lb.y + lb.h;
        addMargin(F, mb);
        return lb;
      }
      // 上に枠か内側の余白があれば、ここで位置が決まる。なければ最初の子と余白を重ねるために待つ
      if (b[0] > 0 || p[0] > 0) { lb.y = resolveF(F); F.y = lb.y + b[0] + p[0]; }
      else F.waiting.push(lb);
      flowChildren(node, lb, cx, w, F, C);
      const waiting = F.waiting.includes(lb);
      if (hSpec !== null) {
        if (waiting) resolveF(F);
        F.pos = 0; F.neg = 0; resolveF(F);   // 高さを決めた箱からは、中の最後の余白は外へ出ない
        lb.h = b[0] + p[0] + hSpec + p[2] + b[2];
        F.y = lb.y + lb.h;
      } else if (b[2] > 0 || p[2] > 0) {
        if (waiting) resolveF(F);
        resolveF(F);
        lb.h = F.y + p[2] + b[2] - lb.y;
        F.y = lb.y + lb.h;
      } else if (waiting) {
        // 中身も枠もない箱: 上の余白と下の余白が重なって通り抜ける。
        // 位置は「下に枠があるとしたときの位置」（自分の下の余白を足す前）にする（CSS 2.1 の決まり）
        lb.h = 0;
        lb.y = F.y + F.pos + F.neg;
        F.waiting.splice(F.waiting.indexOf(lb), 1);
      } else {
        lb.h = F.y - lb.y;       // 最後の子の下の余白は、この箱の下の余白と重なる
      }
      addMargin(F, mb);
      return lb;
    }

    // ---- 行に並べる ----
    const NO_START = new Set([...'、。，．,.・：；？！!?)]）］｝〕〉》」』】〙〗〟’”ー…‥ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々ゝゞヽヾ']);
    const NO_END = new Set([...'(（[［｛〔〈《「『【〘〖〝‘“']);
    const isCJK = (ch) => /[\u2e80-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch);
    function flatten(nodes, chain, out) {
      for (const n of nodes) {
        if (n.type === 'text') { out.push({ t: 'text', text: n.text, st: chain.length ? chain[chain.length - 1].cs : null, chain }); continue; }
        if (n.cs.display === 'none') continue;
        if (n.tag === 'br') { out.push({ t: 'br' }); continue; }
        out.push({ t: 'open', node: n });
        flatten(n.children, chain.concat([n]), out);
        out.push({ t: 'close', node: n });
      }
    }
    // 行の材料（atom）を作る。空白をまとめ、区切ってよい位置（bb: この前で改行してよい）を決め、幅を測る
    function makeAtoms(items, M, cw, ownerCs) {
      const atoms = [];
      let prevSpace = true, afterSpace = false, prevCh = '';
      for (const it of items) {
        if (it.t === 'br') { atoms.push({ kind: 'br', w: 0, bb: false }); prevSpace = true; afterSpace = false; prevCh = ''; continue; }
        if (it.t === 'open' || it.t === 'close') {
          const s = it.t === 'open' ? 3 : 1, cs = it.node.cs;
          const mv = sideVals(cs, 'margin', cw)[s], pv = sideVals(cs, 'padding', cw)[s];
          atoms.push({ kind: it.t, node: it.node, w: (mv === 'auto' ? 0 : mv) + cs['border-' + SIDES[s] + '-width'] + pv, bb: false });
          continue;
        }
        const st = it.st || ownerCs, font = fontOf(st);
        const text = it.text.replace(/[ \t\n\r\f]+/g, ' ');
        // 塊の幅は、この文字の並びの先頭から塊の終わりまでを測って、前の塊までの幅を引く。
        // 1つずつ測って足すと、隣の文字との詰め具合が入らず、1行で 1 px ほど長くなることがある
        let acc = '', accW = 0;
        const widthOf = (s) => { acc += s; const w = M.width(font, acc), d = w - accW; accW = w; return d; };
        let k = 0;
        while (k < text.length) {
          const ch = text[k];
          if (ch === ' ') {
            if (!prevSpace) { atoms.push({ kind: 'space', text: ' ', st, chain: it.chain, w: widthOf(' '), bb: false }); afterSpace = true; }
            prevSpace = true; k++;
            continue;
          }
          // 日本語は1文字ずつ、英語は空白か日本語の文字までを1つの塊にする
          let j = k + 1;
          if (!isCJK(ch)) while (j < text.length && text[j] !== ' ' && !isCJK(text[j])) j++;
          const word = text.slice(k, j);
          let bb = afterSpace;
          if (!bb && prevCh) bb = !NO_START.has(ch) && !NO_END.has(prevCh) && (isCJK(ch) || isCJK(prevCh));
          const at = { kind: 'text', text: word, st, chain: it.chain, w: widthOf(word), bb };
          // 開きかっこは、前の記号と並ぶと半分の幅に詰まる。行の頭に来たときは元の幅に戻すので、元の幅も覚えておく
          if (NO_END.has(word)) at.full = M.width(font, word);
          atoms.push(at);
          prevCh = word[word.length - 1]; prevSpace = false; afterSpace = false; k = j;
        }
      }
      // inline の箱の始まりは、すぐ後の文字と一緒に次の行へ送る
      for (let k = atoms.length - 2; k >= 0; k--) if (atoms[k].kind === 'open' && atoms[k + 1].bb) { atoms[k].bb = true; atoms[k + 1].bb = false; }
      return atoms;
    }
    // 行の終わりにぶら下がる空白の幅（行の幅に数えない）
    function hangW(list) {
      let w = 0;
      for (let k = list.length - 1; k >= 0; k--) {
        const a = list[k];
        if (a.kind === 'space') w += a.w;
        else if (a.kind !== 'close' && a.kind !== 'br') break;
      }
      return w;
    }
    // 行の終わりに来た全角の閉じかっこや句読点は、そのままでは入らないときだけ半分の幅にする（text-spacing-trim の normal）
    const CLOSE_FW = new Set([...'）」』】〕〉》〙〗〟］｝']);
    function endTrim(list) {
      for (let k = list.length - 1; k >= 0; k--) {
        const a = list[k];
        if (a.kind === 'space' || a.kind === 'close' || a.kind === 'br') continue;
        return a.kind === 'text' && CLOSE_FW.has(a.text) ? a : null;
      }
      return null;
    }
    // 区切ってよい位置で塊に分け、入るだけ詰めて行にする（貪欲法）
    function breakLines(atoms, maxW) {
      const segs = [];
      let s = null;
      for (const a of atoms) {
        if (!s || a.bb) { s = { atoms: [], w: 0 }; segs.push(s); }
        s.atoms.push(a); s.w += a.w;
        if (a.kind === 'br') s = null;
      }
      const lines = [];
      let line = { atoms: [], w: 0 };
      const flush = () => { lines.push(line); line = { atoms: [], w: 0 }; };
      // 1/64 px までのはみ出しは入ったものとする（Chrome は長さを 1/64 px 単位で持つ）
      const lim = maxW + 1 / 64;
      // 行の頭に来た開きかっこは、前の記号と並んで詰まった分を元に戻す
      const restoreStart = (sg) => {
        const a = sg.atoms.find((x) => x.kind !== 'open');
        if (a && a.full && a.full > a.w + 1e-6) { sg.w += a.full - a.w; a.w = a.full; }
      };
      for (const sg of segs) {
        if (line.atoms.length) {
          const need = line.w + sg.w - hangW(sg.atoms), t = endTrim(sg.atoms);
          if (need > lim && !(t && need - t.w / 2 <= lim)) { flush(); restoreStart(sg); }
        }
        for (const a of sg.atoms) line.atoms.push(a);
        line.w += sg.w;
        if (sg.atoms[sg.atoms.length - 1].kind === 'br') flush();
      }
      if (line.atoms.length) lines.push(line);
      for (const L of lines) {
        L.hang = hangW(L.atoms);
        const t = endTrim(L.atoms);
        L.trim = t && L.w - L.hang > lim ? t.w / 2 : 0;
        L.trimAtom = L.trim ? t : null;
      }
      return lines;
    }
    function layoutLines(nodes, owner, cx, cw, F, holder, C) {
      const M = C.M, items = [];
      flatten(nodes, [], items);
      const lines = breakLines(makeAtoms(items, M, cw, owner.cs), cw);
      const align = owner.cs['text-align'];
      const openStack = [];
      const pushFrag = (node, x1, x2, first, last, line) => {
        const cs = node.cs, fb = fontBox(cs, M), p = sideVals(cs, 'padding', cw), b = borders(cs);
        const f = { node, x: x1, y: line.base - fb.A - p[0] - b[0], w: Math.max(0, x2 - x1), h: fb.A + fb.D + p[0] + p[2] + b[0] + b[2], first, last, p, b };
        line.frags.push(f);
        if (!C.frags.has(node)) C.frags.set(node, []);
        C.frags.get(node).push(f);
      };
      for (const L of lines) {
        const content = L.atoms.some((a) => a.kind === 'text' || a.kind === 'br' || ((a.kind === 'open' || a.kind === 'close') && a.w > 0));
        if (!content) {
          for (const a of L.atoms) { if (a.kind === 'open') openStack.push(a.node); else if (a.kind === 'close') openStack.splice(openStack.lastIndexOf(a.node), 1); }
          continue;
        }
        const y0 = resolveF(F);
        // 行の高さ: 箱そのもの（支柱）と、行にある inline の箱の、文字の上下に行の高さとの差の半分を足して一番大きいもの
        let above = 0, below = 0;
        const addBox = (cs) => {
          const fb = fontBox(cs, M), lead = lhPx(cs, fb) - (fb.A + fb.D), ha = Math.floor(lead / 2);
          above = Math.max(above, fb.A + ha); below = Math.max(below, fb.D + lead - ha);
        };
        addBox(owner.cs);
        const seen = new Set(openStack);
        for (const a of L.atoms) { if (a.kind === 'open') seen.add(a.node); else if (a.chain) for (const n of a.chain) seen.add(n); }
        for (const n of seen) addBox(n.cs);
        const tw = L.w - L.hang - L.trim;
        const off = Math.max(0, align === 'center' ? (cw - tw) / 2 : align === 'right' ? cw - tw : 0);
        let x = cx + off;
        const line = { x, y: y0, w: tw, h: above + below, base: y0 + above, runs: [], frags: [] };
        const starts = new Map();
        for (const n of openStack) starts.set(n, { x, first: false });
        let run = null;
        for (const a of L.atoms) {
          if (a.kind === 'open') {
            const ml = sideVals(a.node.cs, 'margin', cw)[3];
            starts.set(a.node, { x: x + (ml === 'auto' ? 0 : ml), first: true });
            openStack.push(a.node); x += a.w; run = null;
          } else if (a.kind === 'close') {
            const mr = sideVals(a.node.cs, 'margin', cw)[1], s0 = starts.get(a.node) || { x, first: false };
            pushFrag(a.node, s0.x, x + a.w - (mr === 'auto' ? 0 : mr), s0.first, true, line);
            starts.delete(a.node); openStack.splice(openStack.lastIndexOf(a.node), 1); x += a.w; run = null;
          } else if (a.kind === 'text' || a.kind === 'space') {
            const aw = a === L.trimAtom ? a.w - L.trim : a.w;   // 半分の幅にした閉じかっこ
            if (run && run.st === a.st && run.chain === a.chain) { run.text += a.text; run.w += aw; }
            else { run = { x, base: line.base, text: a.text, w: aw, st: a.st, chain: a.chain }; line.runs.push(run); }
            x += aw;
          }
        }
        for (const n of openStack) { const s0 = starts.get(n); pushFrag(n, s0.x, x - L.hang, s0.first, false, line); }
        // ぶら下がった空白は描かない
        for (let k = line.runs.length - 1, left = L.hang; k >= 0 && left > 0.001; k--) {
          const r = line.runs[k], t = r.text.replace(/ +$/, '');
          if (t === r.text) break;
          const cut = r.text.length - t.length, ws = cut ? (r.w / r.text.length) * cut : 0;
          r.text = t; r.w -= Math.min(ws, left); left -= ws;
          if (t) break;
        }
        holder.lines.push(line);
        C.lines++;
        F.y = y0 + line.h;
      }
    }
    // 根（幅 width の箱。新しい流れを作る）から全部を並べる
    function layoutDoc(root, width, M) {
      const C = { M, lines: 0, byNode: new Map(), frags: new Map() };
      const lb = { node: root, x: 0, y: 0, w: width, h: 0, m: [0, 0, 0, 0], b: [0, 0, 0, 0], p: [0, 0, 0, 0], kids: [], lines: [] };
      const F = { y: 0, pos: 0, neg: 0, waiting: [] };
      C.byNode.set(root, lb);
      flowChildren(root, lb, 0, width, F, C);
      resolveF(F);
      lb.h = F.y;
      return { box: lb, C };
    }

    // ---- 5. 描く命令の列を作る ----
    function label(n) {
      if (!n || n.tag === '#root') return '根';
      let s = n.tag === 'span' && n.orig !== 'span' ? n.orig : n.tag;
      if (n.attrs.id) s += '#' + n.attrs.id;
      if (n.attrs.class) s += '.' + n.attrs.class.trim().split(/\s+/).join('.');
      return s;
    }
    function firstLine(lb) {
      if (lb.lines.length) return lb.lines[0];
      for (const k of lb.kids) { const f = firstLine(k); if (f) return f; }
      return null;
    }
    function boxDeco(cs, x, y, w, h, b, why, list) {
      const r = Math.max(0, Math.min(cs['border-radius'], w / 2, h / 2));
      const bg = cs['background-color'];
      if (bg && !/^transparent$/i.test(bg) && w > 0 && h > 0) list.push({ op: 'rect', x, y, w, h, color: bg, r, why });
      if (b.some((v) => v > 0)) list.push({ op: 'border', x, y, w, h, bw: b.slice(), bc: SIDES.map((s) => cs['border-' + s + '-color']), bs: SIDES.map((s) => cs['border-' + s + '-style']), r, why });
    }
    function paintList(layout) {
      const list = [];
      // CSS の描く順: まず block の箱の背景と枠を木の順に全部塗り、そのあとで行の中身（inline の背景・文字・線）を描く
      const bg = (lb) => {
        if (!lb.anon && lb.node.tag !== '#root') boxDeco(lb.node.cs, lb.x, lb.y, lb.w, lb.h, lb.b, label(lb.node), list);
        for (const k of lb.kids) bg(k);
      };
      const fg = (lb) => {
        if (!lb.anon && lb.node.cs.display === 'list-item' && lb.node.cs['list-style-type'] !== 'none') {
          const cs = lb.node.cs, t = cs['list-style-type'], fs = cs['font-size'], L = firstLine(lb);
          const base = L ? L.base : lb.y + lb.b[0] + lb.p[0] + Math.round(fs * 0.9);
          const cx = lb.x + lb.b[3] + lb.p[3];
          if (t === 'decimal') {
            const n = lb.node.up.children.filter((k) => k.type === 'el' && k.cs.display === 'list-item').indexOf(lb.node) + 1;
            list.push({ op: 'text', x: cx - fs * 0.28, y: base, text: n + '.', font: fontOf(cs), color: cs.color, align: 'right', why: label(lb.node) + ' の番号' });
          } else list.push({ op: 'dot', x: cx - fs * 0.55, y: base - fs * 0.3, r: fs * 0.17, kind: t, color: cs.color, why: label(lb.node) + ' の印' });
        }
        for (const L of lb.lines) {
          const fr = L.frags.slice().sort((a, b) => a.node.depth - b.node.depth);
          for (const f of fr) boxDeco(f.node.cs, f.x, f.y, f.w, f.h, [f.b[0], f.last ? f.b[1] : 0, f.b[2], f.first ? f.b[3] : 0], label(f.node), list);
          for (const r of L.runs) {
            if (!r.text.trim()) continue;
            const owner = r.chain[r.chain.length - 1] || lb.node, fs = r.st['font-size'];
            list.push({ op: 'text', x: r.x, y: r.base, text: r.text, font: fontOf(r.st), color: r.st.color, why: label(owner) });
            for (const d of owner.deco || []) {
              const t = Math.max(1, Math.round(fs / 16));
              const y = d.line === 'underline' ? r.base + Math.max(1, Math.round(fs * 0.1)) : d.line === 'line-through' ? r.base - Math.round(fs * 0.3) : r.base - Math.round(fs * 0.85);
              list.push({ op: 'line', x: r.x, y, w: r.w, t, color: d.color, kind: d.line, why: label(owner) });
            }
          }
        }
        for (const k of lb.kids) fg(k);
      };
      bg(layout.box);
      fg(layout.box);
      return list;
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const thumb = !!window.THUMB;
    if (thumb) document.documentElement.classList.add('thumb');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = $('cv'), ctx = cv.getContext('2d'), ov1 = $('ov1'), ov2 = $('ov2'), host = $('host');
    const srcH = $('srcH'), srcC = $('srcC'), sampleS = $('sample'), widthI = $('width'), widthO = $('widthO'), outlineI = $('outline'), playB = $('play');
    const infoP = $('info'), stepO = $('stepO'), cascD = $('casc');

    const SAMPLES = {
      article: {
        h: `<article class="card">
  <h1>Ladybird がアルファ版に</h1>
  <p class="lead">独自の<b>エンジン</b>を持つブラウザが、<a class="link">macOS と Linux</a> 向けに配布を始めた。</p>
  <p>ブラウザは HTML を読んで <code>DOM</code> の木を作り、CSS で style を決め、箱を並べてから描く。</p>
  <blockquote>A new engine, written from scratch.</blockquote>
  <ul>
    <li>HTML を読む</li>
    <li>style を決める</li>
    <li>箱を並べて描く</li>
  </ul>
  <hr>
  <p class="foot"><small>2026-11-23 公開</small></p>
</article>`,
        c: `.card { margin: 12px; padding: 14px 18px; border: 1px solid #d9d2c3; border-radius: 10px; background: #fffaf0; }
h1 { font-size: 22px; line-height: 1.3; margin: 0 0 8px; color: #8a3b12; }
.lead { margin-top: 0; font-size: 15px; }
.link { color: #1d5fa8; text-decoration: underline; }
code { background: #efe7d6; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
blockquote { margin: 10px 0; padding: 6px 12px; border-left: 4px solid #e0a35b; background: #fbf1df; font-style: italic; }
ul { margin: 8px 0; padding-left: 22px; }
li { margin: 2px 0; }
hr { border: 0; border-top: 1px dashed #c9bfae; margin: 10px 0; }
.foot { margin: 0; text-align: right; color: #7a7266; }`,
        pick: 1,
      },
      margin: {
        h: `<div class="a">上の箱（下の余白 30px）</div>
<div class="b">下の箱（上の余白 20px）。間は 50px ではなく 30px</div>
<div class="wrap">
  <p class="c">親に上の枠も内側の余白もないと、子の上の余白（24px）が親の外へ出る</p>
</div>
<div class="empty"></div>
<div class="d">中身のない箱は、上と下の余白が重なって通り抜ける</div>
<div class="wrap fr">
  <p class="c">display: flow-root の親は、子の余白を外へ出さない</p>
</div>
<div class="e">負の余白（-12px）は、正の余白の最大に足す</div>`,
        c: `div { background: #e8f0fb; border: 1px solid #9db7dd; padding: 4px 8px; }
.a { margin-bottom: 30px; }
.b { margin-top: 20px; }
.wrap { margin-top: 16px; padding: 0 8px; border: 0; background: #fdf0d8; }
.c { margin: 24px 0; background: #fff; border: 1px dashed #d6a24a; padding: 4px 6px; }
.empty { margin: 20px 0 28px; padding: 0; border: 0; }
.d { margin-top: 8px; }
.fr { display: flow-root; }
.e { margin-top: -12px; background: #f6e3ef; }`,
        pick: 3,
      },
      ja: {
        h: `<p>ブラウザは、日本語の文を1文字ずつ区切れるものとして扱う。ただし「、」や「。」、閉じかっこ、小さな「っ」は行の頭に置かない。</p>
<p>English words break only at spaces: <b>supercalifragilistic</b> と、日本語と English が混ざった行。</p>
<p class="c">text-align: center で真ん中にそろえる</p>
<p class="r">右にそろえる。長い行は折り返して、それぞれの行を右にそろえる。</p>
<p>A&nbsp;B&nbsp;C&nbsp;D&nbsp;E&nbsp;F は &amp;nbsp; でつないだので、途中で折り返さない。</p>`,
        c: `p { margin: 0 0 10px; padding: 6px 8px; background: #f2f5ef; border-left: 3px solid #86a873; font-size: 15px; line-height: 1.7; }
.c { text-align: center; }
.r { text-align: right; }
b { color: #a2401f; }`,
        pick: 1,
      },
      cascade: {
        h: `<div id="main">
  <p class="note">この文の色は、どの規則で決まる？</p>
  <p class="note" style="color: #2d7a3e">style 属性は、id の選択子より強い。</p>
  <p class="note imp">!important は style 属性より強い。</p>
  <p>class のない p は、#main p の色になる。</p>
</div>`,
        c: `p { color: #555; padding: 6px 10px; margin: 6px 0; border: 2px solid #ccc; }
.note { color: #b3261e; border-color: #e6a19b; }
#main p { color: #1d4fa0; }
#main .note { border-style: dashed; }
p.note:first-child { background: #fff3c4; }
.imp { color: #7b2cbf !important; }
p { font-weight: bold; }`,
        pick: 2,
      },
    };

    // 文字の幅と高さは、この canvas の measureText で測る（このブラウザと同じ字形を使う）。
    // textRendering が 'auto' のままだと「べて」「って」のような仮名の組の字詰めがかからず、DOM の文字より少し長くなる
    let ctxFont = '';
    const setFont = (f) => {
      if (ctxFont === f) return;
      ctx.font = f;
      if ('textRendering' in ctx) ctx.textRendering = 'optimizeLegibility';
      ctxFont = f;
    };
    const wCache = new Map(), fCache = new Map();
    const M = {
      width(font, text) {
        const key = font + '|' + text;
        let v = wCache.get(key);
        if (v === undefined) { setFont(font); v = ctx.measureText(text).width; wCache.set(key, v); }
        return v;
      },
      metrics(font) {
        let v = fCache.get(font);
        if (!v) {
          setFont(font);
          const t = ctx.measureText('x'), fs = parseFloat((/([\d.]+)px/.exec(font) || [0, 16])[1]);
          v = { asc: t.fontBoundingBoxAscent ?? fs * 0.9, desc: t.fontBoundingBoxDescent ?? fs * 0.25 };
          fCache.set(font, v);
        }
        return v;
      },
    };
    const isColor = (v) => { try { return CSS.supports('color', v); } catch (e) { return v.length > 0; } };
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

    // このブラウザ側: Shadow DOM の中に同じ木を作る。外の CSS は届かず、作者の CSS は外へ漏れない
    const shadow = host.attachShadow({ mode: 'open' });
    const hostSheet = new CSSStyleSheet(), userSheet = new CSSStyleSheet();
    hostSheet.replaceSync(':host { all: initial; display: flow-root; font: 16px/1.5 sans-serif; color: #222; background: #fff; text-align: left; }');
    shadow.adoptedStyleSheets = [hostSheet, userSheet];

    let dom = null, laid = null, list = [], realOf = new Map(), mineOf = new Map(), notes = null, uaSheet = null;
    let W = 400, H = 1, shown = Infinity, sel = null, hov = null, selIdx = 0, playing = 0;
    const times = { parse: 0, style: 0, layout: 0, paint: 0 };
    const f1 = (v) => String(Math.round(v * 10) / 10);
    const f2 = (v) => String(Math.round(v * 100) / 100);

    function buildReal() {
      realOf = new Map(); mineOf = new Map();
      const frag = document.createDocumentFragment();
      const walk = (n, out) => {
        for (const k of n.children) {
          if (k.type === 'text') { out.append(document.createTextNode(k.text)); continue; }
          if (k.tag === '#skip') continue;
          const el = document.createElement(k.tag);   // 決めた名前の要素か span だけを作る
          for (const a of ['class', 'id', 'style']) if (k.attrs[a] != null) el.setAttribute(a, k.attrs[a]);
          realOf.set(k, el); mineOf.set(el, k);
          out.append(el);
          walk(k, el);
        }
      };
      walk(dom, frag);
      shadow.replaceChildren(frag);
    }
    const elementsOf = (n, out = []) => { for (const k of n.children) if (k.type === 'el') { out.push(k); elementsOf(k, out); } return out; };

    function parseAll() {
      const t0 = performance.now();
      const pr = parseHTML(srcH.value);
      const t1 = performance.now();
      if (!uaSheet) uaSheet = parseCSS(UA_CSS, 'ua');
      const au = parseCSS(srcC.value, 'author');
      styleTree(pr.root, [uaSheet, au], { isColor, dpr, color: '#222' });
      const t2 = performance.now();
      dom = pr.root; notes = { html: pr.notes, css: au.bad };
      times.parse = t1 - t0; times.style = t2 - t1;
      buildReal();
      try { userSheet.replaceSync(srcC.value); } catch (e) { userSheet.replaceSync(''); }
      const els = elementsOf(dom);
      sel = els[Math.min(selIdx, els.length - 1)] || null;
      hov = null;
      compareTree();
      relayout();
      showCascade();
      showNotes();
      dumpDom();
    }

    function relayout() {
      W = Number(widthI.value);
      widthO.textContent = W + 'px';
      const t0 = performance.now();
      laid = layoutDoc(dom, W, M);
      const t1 = performance.now();
      list = paintList(laid);
      const t2 = performance.now();
      times.layout = t1 - t0; times.paint = t2 - t1;
      H = Math.max(1, Math.min(8000, Math.ceil(laid.box.h)));
      for (const c of [cv, ov1]) {
        c.width = Math.max(1, Math.round(W * dpr)); c.height = Math.max(1, Math.round(H * dpr));
        c.style.width = W + 'px'; c.style.height = H + 'px';
      }
      ctxFont = '';
      host.style.width = W + 'px';
      draw();
      if (!thumb) { compare(); stats(); dumpBoxes(); dumpList(); }
      overlays();
    }

    // ---- 描く命令を canvas で実行する ----
    function strokeSide(x1, y1, x2, y2, w, color, style) {
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.setLineDash(style === 'dashed' ? [w * 3, w * 2] : style === 'dotted' ? [w, w] : []);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
    }
    function drawBorder(c) {
      const [t, r, b, l] = c.bw, same = c.bw.every((v) => v === t) && c.bc.every((v) => v === c.bc[0]) && c.bs.every((v) => v === c.bs[0]);
      if (same && c.r > 0 && ctx.roundRect) {
        ctx.strokeStyle = c.bc[0]; ctx.lineWidth = t;
        ctx.setLineDash(c.bs[0] === 'dashed' ? [t * 3, t * 2] : c.bs[0] === 'dotted' ? [t, t] : []);
        ctx.beginPath(); ctx.roundRect(c.x + t / 2, c.y + t / 2, Math.max(0, c.w - t), Math.max(0, c.h - t), Math.max(0, c.r - t / 2)); ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      const solid = (s) => s !== 'dashed' && s !== 'dotted';
      const quad = (pts, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]); ctx.closePath(); ctx.fill(); };
      const { x, y, w, h } = c;
      if (t > 0) { if (solid(c.bs[0])) quad([x, y, x + w, y, x + w - r, y + t, x + l, y + t], c.bc[0]); else strokeSide(x, y + t / 2, x + w, y + t / 2, t, c.bc[0], c.bs[0]); }
      if (r > 0) { if (solid(c.bs[1])) quad([x + w, y, x + w, y + h, x + w - r, y + h - b, x + w - r, y + t], c.bc[1]); else strokeSide(x + w - r / 2, y, x + w - r / 2, y + h, r, c.bc[1], c.bs[1]); }
      if (b > 0) { if (solid(c.bs[2])) quad([x, y + h, x + w, y + h, x + w - r, y + h - b, x + l, y + h - b], c.bc[2]); else strokeSide(x, y + h - b / 2, x + w, y + h - b / 2, b, c.bc[2], c.bs[2]); }
      if (l > 0) { if (solid(c.bs[3])) quad([x, y, x + l, y + t, x + l, y + h - b, x, y + h], c.bc[3]); else strokeSide(x + l / 2, y, x + l / 2, y + h, l, c.bc[3], c.bs[3]); }
    }
    function exec(c) {
      if (c.op === 'rect') {
        ctx.fillStyle = c.color;
        if (c.r > 0 && ctx.roundRect) { ctx.beginPath(); ctx.roundRect(c.x, c.y, c.w, c.h, c.r); ctx.fill(); }
        else ctx.fillRect(c.x, c.y, c.w, c.h);
      } else if (c.op === 'border') drawBorder(c);
      else if (c.op === 'text') {
        setFont(c.font); ctx.fillStyle = c.color; ctx.textAlign = c.align || 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(c.text, c.x, c.y);
        ctx.textAlign = 'left';
      } else if (c.op === 'line') { ctx.fillStyle = c.color; ctx.fillRect(c.x, c.y, c.w, c.t); }
      else if (c.op === 'dot') {
        ctx.fillStyle = c.color; ctx.strokeStyle = c.color; ctx.lineWidth = 1;
        if (c.kind === 'square') ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
        else { ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); if (c.kind === 'circle') ctx.stroke(); else ctx.fill(); }
      }
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      const n = Math.min(list.length, shown);
      for (let i = 0; i < n; i++) exec(list[i]);
      if (outlineI.checked || thumb) {
        ctx.save(); ctx.lineWidth = 1;
        const walk = (lb) => {
          if (!lb.anon && lb.node.tag !== '#root') { ctx.strokeStyle = 'rgba(40,90,200,.7)'; ctx.setLineDash([]); ctx.strokeRect(lb.x + 0.5, lb.y + 0.5, Math.max(0, lb.w - 1), Math.max(0, lb.h - 1)); }
          ctx.strokeStyle = 'rgba(214,51,132,.55)'; ctx.setLineDash([3, 2]);
          for (const L of lb.lines) ctx.strokeRect(L.x + 0.5, L.y + 0.5, Math.max(0, L.w - 1), Math.max(0, L.h - 1));
          for (const k of lb.kids) walk(k);
        };
        walk(laid.box);
        ctx.restore();
      }
      stepO.textContent = '描く命令 ' + n + ' / ' + list.length;
    }

    // ---- 箱の色分け（余白・枠・内側の余白・中身） ----
    function modelMine(node) {
      const lb = laid.C.byNode.get(node);
      if (lb) return [{ x: lb.x, y: lb.y, w: lb.w, h: lb.h, m: lb.m, b: lb.b, p: lb.p }];
      return (laid.C.frags.get(node) || []).map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h, m: [0, 0, 0, 0], b: [f.b[0], f.last ? f.b[1] : 0, f.b[2], f.first ? f.b[3] : 0], p: [f.p[0], f.last ? f.p[1] : 0, f.p[2], f.first ? f.p[3] : 0] }));
    }
    function modelReal(node) {
      const el = realOf.get(node);
      if (!el) return [];
      const hr = host.getBoundingClientRect(), cs = getComputedStyle(el);
      const px = (p) => parseFloat(cs.getPropertyValue(p)) || 0;
      const m = SIDES.map((s) => px('margin-' + s)), b = SIDES.map((s) => px('border-' + s + '-width')), p = SIDES.map((s) => px('padding-' + s));
      if (cs.display === 'inline') {
        const rs = [...el.getClientRects()];
        return rs.map((r, i) => ({ x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height, m: [0, 0, 0, 0], b: [b[0], i === rs.length - 1 ? b[1] : 0, b[2], i === 0 ? b[3] : 0], p: [p[0], i === rs.length - 1 ? p[1] : 0, p[2], i === 0 ? p[3] : 0] }));
      }
      const r = el.getBoundingClientRect();
      return [{ x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height, m, b, p }];
    }
    function paintModel(c, boxes, w, h) {
      c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
      c.style.width = w + 'px'; c.style.height = h + 'px';
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const q of boxes) {
        const m = q.m.map((v) => Math.max(0, v));
        const layers = [
          [q.x - m[3], q.y - m[0], q.w + m[1] + m[3], q.h + m[0] + m[2], 'rgba(246,158,74,.45)'],
          [q.x, q.y, q.w, q.h, 'rgba(250,214,90,.6)'],
          [q.x + q.b[3], q.y + q.b[0], q.w - q.b[1] - q.b[3], q.h - q.b[0] - q.b[2], 'rgba(120,190,100,.5)'],
          [q.x + q.b[3] + q.p[3], q.y + q.b[0] + q.p[0], q.w - q.b[1] - q.b[3] - q.p[1] - q.p[3], q.h - q.b[0] - q.b[2] - q.p[0] - q.p[2], 'rgba(90,150,220,.5)'],
        ];
        for (const [x, y, ww, hh, col] of layers) {
          if (ww <= 0 || hh <= 0) continue;
          g.clearRect(x, y, ww, hh); g.fillStyle = col; g.fillRect(x, y, ww, hh);
        }
      }
    }
    function overlays() {
      const node = thumb ? null : (hov || sel);
      paintModel(ov1, node ? modelMine(node) : [], W, H);
      paintModel(ov2, node && !thumb ? modelReal(node) : [], W, Math.max(1, host.offsetHeight));
    }
    const rectOf = (boxes) => {
      if (!boxes.length) return null;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const q of boxes) { x1 = Math.min(x1, q.x); y1 = Math.min(y1, q.y); x2 = Math.max(x2, q.x + q.w); y2 = Math.max(y2, q.y + q.h); }
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    };
    const rectText = (r) => r ? '(' + f1(r.x) + ', ' + f1(r.y) + ') ' + f1(r.w) + '×' + f1(r.h) : 'なし';
    function describeNode(node) {
      const a = rectOf(modelMine(node)), b = rectOf(modelReal(node));
      const d = a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.x + a.w - b.x - b.w), Math.abs(a.y + a.h - b.y - b.h)) : null;
      return '<' + label(node) + '>  自作 ' + rectText(a) + '  このブラウザ ' + rectText(b) + (d === null ? '' : '  ずれ ' + f2(d) + ' px');
    }

    // ---- このブラウザとの比べ ----
    let diffRows = [];
    function compare() {
      const hr = host.getBoundingClientRect();
      diffRows = [];
      for (const k of elementsOf(dom)) {
        if (k.tag === 'br' || k.tag === '#skip') continue;
        let hidden = false;
        for (let a = k; a && a.tag !== '#root'; a = a.up) if (a.cs.display === 'none') hidden = true;
        if (hidden) continue;
        const mine = rectOf(modelMine(k)), el = realOf.get(k);
        if (!mine || !el) continue;
        const r = el.getBoundingClientRect();
        const rr = { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height };
        const d = Math.max(Math.abs(mine.x - rr.x), Math.abs(mine.y - rr.y), Math.abs(mine.x + mine.w - rr.x - rr.w), Math.abs(mine.y + mine.h - rr.y - rr.h));
        diffRows.push({ k, mine, rr, d });
      }
      const ok = diffRows.filter((r) => r.d <= 1).length, worst = diffRows.reduce((s, r) => Math.max(s, r.d), 0);
      $('matchO').textContent = ok + ' / ' + diffRows.length;
      $('matchS').textContent = '1 px 以内（一番大きいずれ ' + f2(worst) + ' px）';
      const rows = diffRows.slice().sort((a, b) => b.d - a.d).filter((r) => r.d > 0.01).slice(0, 40);
      $('diffO').textContent = rows.length ? rows.map((r) => f2(r.d).padStart(6) + ' px  <' + label(r.k) + '>  自作 ' + rectText(r.mine) + '  このブラウザ ' + rectText(r.rr)).join('\n') : 'ずれた箱はない（0.01 px より大きいずれなし）';
    }
    function compareTree() {
      const tpl = document.createElement('template');
      tpl.innerHTML = srcH.value;   // template の中身は動かない（画像も読まず、スクリプトも動かない）
      const a = [], b = [];
      const wa = (n, d) => { for (const k of n.children) { a.push(d + ':' + k.localName); wa(k, d + 1); } };
      const wb = (n, d) => { for (const k of n.children) if (k.type === 'el') { b.push(d + ':' + k.orig); wb(k, d + 1); } };
      wa(tpl.content, 0); wb(dom, 0);
      let k = 0;
      while (k < a.length && k < b.length && a[k] === b[k]) k++;
      if (k === a.length && k === b.length) { $('treeO').textContent = '同じ'; $('treeS').textContent = '要素 ' + a.length + ' 個の並びと深さが、このブラウザの読み方と同じ'; }
      else { $('treeO').textContent = '違う'; $('treeS').textContent = (k + 1) + ' 番目の要素から違う（このブラウザ ' + (a[k] || 'なし') + '、自作 ' + (b[k] || 'なし') + '。数字は深さ）'; }
    }
    function stats() {
      $('countO').textContent = elementsOf(dom).length + ' / ' + laid.C.lines + ' / ' + list.length;
      $('countS').textContent = '箱 ' + laid.C.byNode.size + ' 個（根を含む）';
      const total = times.parse + times.style + times.layout + times.paint;
      $('timeO').textContent = f2(total) + ' ms';
      $('timeS').textContent = 'HTML ' + f2(times.parse) + ' / style ' + f2(times.style) + ' / 並べる ' + f2(times.layout) + ' / 描く命令 ' + f2(times.paint);
    }
    function showNotes() {
      const out = [];
      if (notes.html.tags.size) out.push('扱わない要素: ' + [...notes.html.tags].join('、') + '（span として扱うか、描かない）');
      if (notes.html.attrs.size) out.push('使わない属性: ' + [...notes.html.attrs].join('、'));
      if (notes.html.fixes) out.push('書かれていない閉じタグなどを ' + notes.html.fixes + ' か所で補った');
      if (notes.css.length) out.push('読まなかった CSS の規則: ' + notes.css.join('、'));
      const props = new Set();
      for (const e of elementsOf(dom)) for (const m of e.matched) for (const d of m.decls) if (!d.ok) props.add(d.p);
      if (props.size) out.push('この見本では使わない指定: ' + [...props].join('、'));
      $('noteO').textContent = out.join('。') + (out.length ? '。' : '');
    }
    function dumpDom() {
      const out = [];
      const walk = (n, d) => {
        for (const k of n.children) {
          if (k.type === 'text') { const t = k.text.replace(/\s+/g, ' '); if (t.trim()) out.push('  '.repeat(d) + '"' + (t.length > 48 ? t.slice(0, 48) + '…' : t) + '"'); continue; }
          out.push('  '.repeat(d) + '<' + label(k) + '>' + (k.orig !== k.tag ? '（' + k.orig + ' は' + (k.tag === '#skip' ? '描かない' : ' span として扱う') + '）' : ''));
          walk(k, d + 1);
        }
      };
      walk(dom, 0);
      $('domO').textContent = out.join('\n');
    }
    function dumpBoxes() {
      const out = [];
      const walk = (lb, d) => {
        const ind = '  '.repeat(d);
        if (lb.anon) out.push(ind + '（名前のない箱）  x=' + f2(lb.x) + ' y=' + f2(lb.y) + ' w=' + f2(lb.w) + ' h=' + f2(lb.h));
        else if (lb.node.tag === '#root') out.push('根  幅 ' + f2(lb.w) + '  高さ ' + f2(lb.h));
        else out.push(ind + label(lb.node) + '  x=' + f2(lb.x) + ' y=' + f2(lb.y) + ' w=' + f2(lb.w) + ' h=' + f2(lb.h) + '  外の余白 ' + lb.m.map(f2).join(' '));
        lb.lines.forEach((L, i) => out.push(ind + '  行' + (i + 1) + '  y=' + f2(L.y) + ' 高さ ' + f2(L.h) + ' 基準線 ' + f2(L.base) + '  「' + L.runs.map((r) => r.text).join('').slice(0, 32) + '」'));
        for (const k of lb.kids) walk(k, d + 1);
      };
      walk(laid.box, 0);
      $('boxO').textContent = out.join('\n');
    }
    function describeCmd(c) {
      if (c.op === 'rect') return '背景を塗る  ' + c.why + '  (' + f1(c.x) + ', ' + f1(c.y) + ') ' + f1(c.w) + '×' + f1(c.h) + '  ' + c.color;
      if (c.op === 'border') return '枠を描く  ' + c.why + '  幅 ' + c.bw.map(f2).join(' ') + '  ' + c.bs[0];
      if (c.op === 'text') return '文字を書く  ' + c.why + '  (' + f1(c.x) + ', ' + f1(c.y) + ')  「' + (c.text.length > 24 ? c.text.slice(0, 24) + '…' : c.text) + '」  ' + c.font;
      if (c.op === 'line') return '線を引く  ' + c.why + '  ' + c.kind;
      return '印を描く  ' + c.why;
    }
    function dumpList() {
      $('listO').textContent = list.slice(0, 400).map((c, i) => String(i + 1).padStart(3) + '. ' + describeCmd(c)).join('\n') + (list.length > 400 ? '\n…' : '');
    }

    // ---- 選んだ要素の style の決まり方 ----
    function showCascade() {
      cascD.replaceChildren();
      const node = sel;
      if (!node) { cascD.textContent = '要素がない'; return; }
      const head = document.createElement('p');
      head.className = 'ch';
      head.textContent = '<' + label(node) + '> に当たった規則（強い順）';
      cascD.append(head);
      const rank = (m) => (m.origin === 'style' ? 2 : m.origin === 'author' ? 1 : 0);
      const ms = node.matched.slice().sort((a, b) => rank(b) - rank(a) || (a.spec && b.spec ? cmpSpec(b.spec, a.spec) : 0) || b.ri - a.ri);
      const ORG = { style: 'style 属性', author: '作者の CSS', ua: 'ブラウザの既定の CSS' };
      for (const m of ms) {
        const box = document.createElement('div');
        box.className = 'rule ' + (m.origin === 'style' ? 'inline' : m.origin);
        const s = document.createElement('div');
        s.className = 'sel';
        s.textContent = m.sel;
        const o = document.createElement('span');
        o.className = 'org';
        o.textContent = ORG[m.origin] + (m.spec ? '  詳しさ ' + m.spec.join(',') : '');
        s.append(o);
        box.append(s);
        for (const d of m.decls) {
          const row = document.createElement('div');
          row.className = 'decl ' + (!d.ok ? 'unsup' : d.bad ? 'bad' : d.won ? 'won' : 'lost');
          row.textContent = d.p + ': ' + d.v + (d.imp ? ' !important' : '') + (!d.ok ? '（この見本では使わない）' : d.bad ? '（読めない値）' : d.won ? '  ← 勝ち' : '');
          box.append(row);
        }
        cascD.append(box);
      }
      if (!ms.length) { const p = document.createElement('p'); p.className = 'ch'; p.textContent = '当たった規則はない（値は親から受け継ぐか、初めの値）'; cascD.append(p); }
      const cs = node.cs, L = (v) => (v === 'auto' ? 'auto' : 'pct' in v ? v.pct + '%' : f2(v.px) + 'px');
      const lh = cs['line-height'];
      const fin = document.createElement('pre');
      fin.className = 'fin';
      fin.textContent = '決まった値\n' + [
        'display: ' + cs.display,
        'color: ' + cs.color + '   background-color: ' + cs['background-color'],
        'font: ' + fontOf(cs) + '   line-height: ' + (lh === 'normal' ? 'normal' : 'num' in lh ? lh.num : f2(lh.px) + 'px'),
        'margin: ' + SIDES.map((s) => L(cs['margin-' + s])).join(' ') + '   padding: ' + SIDES.map((s) => L(cs['padding-' + s])).join(' '),
        'border-width: ' + SIDES.map((s) => f2(cs['border-' + s + '-width'])).join(' ') + '   width: ' + L(cs.width) + '   height: ' + L(cs.height),
      ].join('\n');
      cascD.append(fin);
    }

    // ---- 指したときと押したとき ----
    function hitMine(x, y) {
      let best = null, area = Infinity;
      for (const [node, fr] of laid.C.frags) for (const f of fr) if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h && f.w * f.h < area) { best = node; area = f.w * f.h; }
      if (best) return best;
      const walk = (lb) => {
        if (!lb.anon && lb.node.tag !== '#root' && x >= lb.x && x <= lb.x + lb.w && y >= lb.y && y <= lb.y + lb.h) best = lb.node;
        for (const k of lb.kids) walk(k);
      };
      walk(laid.box);
      return best;
    }
    const nodeFromEvent = (ev) => {
      if (ev.currentTarget === $('mineP')) { const r = cv.getBoundingClientRect(); return hitMine(ev.clientX - r.left, ev.clientY - r.top); }
      for (const t of ev.composedPath()) { const n = mineOf.get(t); if (n) return n; if (t === host) break; }
      return null;
    };
    for (const pane of [$('mineP'), $('realP')]) {
      pane.addEventListener('pointermove', (ev) => {
        const n = nodeFromEvent(ev);
        if (n === hov) return;
        hov = n; overlays();
        if (!playing) infoP.textContent = n ? describeNode(n) : '';
      });
      pane.addEventListener('pointerleave', () => { hov = null; overlays(); });
      pane.addEventListener('click', (ev) => {
        const n = nodeFromEvent(ev);
        if (!n) return;
        sel = n; selIdx = elementsOf(dom).indexOf(n);
        showCascade(); overlays();
        infoP.textContent = describeNode(n);
      });
    }

    // ---- 操作 ----
    function loadSample(key) {
      const s = SAMPLES[key] || SAMPLES.article;
      srcH.value = s.h; srcC.value = s.c; selIdx = s.pick;
      parseAll();
    }
    let editT = 0;
    for (const ta of [srcH, srcC]) ta.addEventListener('input', () => { clearTimeout(editT); editT = setTimeout(parseAll, 200); });
    sampleS.addEventListener('change', () => loadSample(sampleS.value));
    let rf = 0;
    widthI.addEventListener('input', () => { if (!rf) rf = requestAnimationFrame(() => { rf = 0; relayout(); }); });
    outlineI.addEventListener('change', draw);
    playB.addEventListener('click', () => {
      if (playing) { cancelAnimationFrame(playing); playing = 0; shown = Infinity; playB.textContent = '描く順に再生'; draw(); return; }
      const N = list.length, dur = reduce ? 0 : Math.min(7000, 800 + N * 70), t0 = performance.now();
      playB.textContent = '止める';
      const step = (now) => {
        const k = dur ? Math.min(N, Math.floor((now - t0) / dur * N) + 1) : N;
        shown = k; draw();
        if (list[k - 1]) infoP.textContent = k + '. ' + describeCmd(list[k - 1]);
        if (k < N) playing = requestAnimationFrame(step);
        else { playing = 0; shown = Infinity; playB.textContent = '描く順に再生'; draw(); }
      };
      playing = requestAnimationFrame(step);
    });

    // 最初の幅: 2つの絵が横に並ぶなら半分ずつ、並ばなければ全部の幅
    const avail = $('mineP').closest('.panes').clientWidth;
    if (thumb) W = Math.max(160, Math.round(innerWidth || 400));
    else if (avail > 0) W = Math.round(Math.max(160, Math.min(460, avail >= 2 * 300 + 14 ? (avail - 14) / 2 - 2 : avail - 2)));
    widthI.max = String(Math.max(640, W));
    widthI.value = String(W);
    loadSample('article');

    // 一覧の小さな絵: 描く順に描いてから、幅を伸び縮みさせて行の折り返しを見せる
    if (thumb && !reduce) {
      const Wmax = W;
      let t0 = 0;
      shown = 0;
      const tick = (now) => {
        if (!t0) t0 = now;
        const t = (now - t0) / 1000;
        shown = t < 1.6 ? Math.floor(t / 1.6 * list.length) : Infinity;
        const w = Math.round(Wmax * (0.68 + 0.32 * Math.cos(Math.max(0, t - 2) * 0.9)));
        if (w !== Number(widthI.value)) { widthI.value = String(w); relayout(); } else draw();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  },
});
dekiru.add({
  id: 'tr-20261124-haptic-voice', c: 'trend', lv: 3, date: '2026-11-24',
  t: '声を2つの正弦波に減らし、声の高さの拍ごとに鳴らし直してしゃべらせる（トラックパッドの振動で話す Nospeaker の仕組み）',
  y: 'こえをふたつのせいげんはにへらしこえのたかさのはくごとにならしなおしてしゃべらせる',
  tags: ['Nospeaker', '線形予測', 'フォルマント', 'Web Audio API', 'Canvas'],
  d: '2026年11月22日、codycollier さんが「MacBook のトラックパッドを、振動モーターの震えだけでしゃべらせた」と X に投稿し、24日夜の時点でいいね 25,909 件を集めている。翌23日には GitHub の Nospeaker（os6/nospeaker）が Hacker News に投稿され、24日夜の時点で 311 点・173 件のコメントが付いている。トラックパッドにはスピーカーが無く、クリックの感触を出す小さなモーターがガラスを揺らすだけである。Nospeaker は macOS の非公開の仕組み MultitouchSupport でこのモーターを 1 秒に最大 4,000 回動かし、聞こえる音にした。声を出すときは、macOS の読み上げの声を 10 ms ごとに線形予測で分析し、強い共鳴（フォルマント）2 つ・強さ・声の高さを取り出す。そして 2 つの共鳴の周波数の正弦波を、声の高さの 1 周期ごとに鳴らし直す。息だけの音（s・f・t など）は、高い音を小刻みに鳴らして作る。この見本は、その流れをブラウザの中で一から作った。ひらがなの文から規則で声を合成し（自分の音声ファイルも読める）、10 ms ごとに自己相関・レビンソン・ダービンの方法・多項式の根（デュラン・ケルナー法）で共鳴を求め、自己相関で声の高さを求める。分析の結果をモーターへの命令（時刻・長さ・強さ・正弦波の一覧）の並びにし、その命令だけから作った音を元の声と聞き比べられる。音の数を 1〜3 に変えたり、鳴らし直しを止めたりもできる。再現できていない所: ブラウザからはトラックパッドのモーターを動かせないので、命令を同じ周波数の正弦波に直して、この端末のスピーカーから鳴らしている。ガラスの鳴りやすさ（周波数ごとの大きさの違い）とモーターの遅れは入れていない。内蔵の声は簡単な規則合成なので、macOS の声より聞き取りにくい。漢字は読めない。元の見せ物にある歌・ラップ・指で弾く楽器の場面は作っていない。',
  p: '声は、声帯が出す周期的な音のうち、口の形で決まる共鳴の周波数が強まったものと考えられる。線形予測は、各サンプルを直前の 18 個のサンプルの重み付きの和で当てる重みを、自己相関からレビンソン・ダービンの方法で求める。この重みを係数にした多項式の根が共鳴を表し、根の角度が周波数、原点からの距離が鋭さ（帯域幅）になる。母音の違いはほぼ低い方の 2 つの共鳴 F1・F2 で決まるので、2 つの正弦波だけでも母音の区別が残る。ただし正弦波を鳴らし続けると口笛のような音になる。声の高さの周期ごとに位相 0 から鳴らし直すと、波形に周期ごとの継ぎ目ができ、その周期の倍音が並ぶ。人はこの倍音の間隔を声の高さとして聞く（下の段の周波数の図に、横の縞が並ぶ）。モーターの強さには上限があるので、正弦波の強さの合計を 1 に収める。音を 3 つにすると、1 つあたりが弱くなる。',
  refs: [
    { title: 'os6/nospeaker（GitHub。README に仕組みと測った音域がある）', url: 'https://github.com/os6/nospeaker' },
    { title: 'Hacker News: Nospeaker ─ Make your MacBook’s trackpad talk using its haptic motor（2026-11-23）', url: 'https://news.ycombinator.com/item?id=50610318' },
    { title: 'codycollier さんの X の投稿（2026-11-22、動画あり）', url: 'https://x.com/codycollier/status/2124505859883716918' },
  ],
  html: `<div class="app">
  <div class="src">
    <label class="fld wide"><span class="nm">話させる文（ひらがな・カタカナ。漢字は読めない）</span><input type="text" id="text" value="こんにちは。わたしは トラックパッドです。" autocomplete="off" spellcheck="false"></label>
    <label class="fld"><span class="nm">例文</span><select id="preset"></select></label>
    <label class="fld"><span class="nm">内蔵の声の高さ</span><select id="voice"><option value="low">低い声（120 Hz 前後）</option><option value="high">高い声（210 Hz 前後）</option></select></label>
    <div class="fld"><button type="button" id="make">この文で声を作る</button></div>
    <label class="fld"><span class="nm">または自分の音声ファイル（先頭 12 秒）</span><input type="file" id="file" accept="audio/*"></label>
  </div>
  <div class="row opts">
    <label class="chk">音の数 <select id="ntones"><option value="1">1 つ（F1）</option><option value="2" selected>2 つ（F1 と F2）</option><option value="3">3 つ（F1〜F3）</option></select></label>
    <label class="chk"><input type="checkbox" id="restart" checked> 声の高さの拍ごとに鳴らし直す</label>
    <label class="chk"><input type="checkbox" id="hiss" checked> 息だけの音（s・sh など）を高い音の小刻みで出す</label>
  </div>
  <div class="row play">
    <button type="button" id="pOrig">元の声を聞く</button>
    <button type="button" id="pMotor" class="main">トラックパッドの声を聞く</button>
    <button type="button" id="stopB">止める</button>
    <span id="status" class="status" role="status"></span>
  </div>
  <div class="stats">
    <div class="stat"><span>長さ</span><b id="stDur">-</b><span>秒</span></div>
    <div class="stat"><span>モーターへの命令</span><b id="stActs">-</b><span>回／秒</span></div>
    <div class="stat"><span>声の高さ（中央値）</span><b id="stF0">-</b><span>Hz</span></div>
    <div class="stat"><span>命令に入っている数</span><b id="stNums">-</b><span>個／秒（元の波形は 16,000 個／秒）</span></div>
  </div>
  <div class="vis">
    <figure>
      <canvas id="sA" role="img" aria-label="元の声の周波数の図。点は線形予測で見つけた共鳴 F1 と F2"></canvas>
      <canvas id="sB" role="img" aria-label="モーターへの命令だけから作った、トラックパッドの声の周波数の図"></canvas>
      <figcaption>横は時間、縦は周波数（0〜4.5 kHz）で、明るいほど強い。<span class="key k1"></span>F1 <span class="key k2"></span>F2 <span class="key k3"></span>F3（音の数を 3 つにしたとき）。白い帯は、息だけの音として高い音を鳴らす所。図をクリックかドラッグすると、見る位置が変わる。</figcaption>
    </figure>
    <figure>
      <canvas id="pad" role="img" aria-label="トラックパッドのガラスと、その下の振動モーター。命令ごとにガラスが揺れる様子"></canvas>
      <p id="now" class="now"></p>
      <pre id="cmd" class="cmd"></pre>
    </figure>
  </div>
  <label class="pos"><span class="nm">見る位置</span><input type="range" id="pos" min="0" max="3000" step="5" value="860"><output id="posO" for="pos"></output></label>
  <figure class="wavefig">
    <canvas id="wave" role="img" aria-label="見る位置の前後 20 ms の波形。上が元の声、下がトラックパッドの声。縦の線は命令の始まり"></canvas>
    <figcaption>見る位置の前後 20 ms の波形。下の段の縦の線は命令の始まりで、そこで正弦波を位相 0 から鳴らし直す。この間隔が声の高さの周期になる。</figcaption>
  </figure>
  <p class="small">実物の Nospeaker は macOS の非公開の仕組みでトラックパッドのモーターを動かす。ブラウザからはモーターを動かせないので、この見本は命令の並びを同じ周波数の正弦波に直し、この端末のスピーカーから鳴らす。音が出るのはボタンを押したときだけ。</p>
</div>`,
  css: `:root { color-scheme: light; --bg: #f3f1ec; --fg: #22201c; --mut: #5f594f; --line: #d8d2c6; --panel: #fffdf9; --acc: #a8432a; --f1: #f2994a; --f2: #56ccf2; --f3: #d9b3ff; --f1d: #b25f17; --f2d: #1d74a0; --head: #ff5a5a; --glass: #e4e9ef; --code: #f2eee6; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .app { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 10px; max-inline-size: 1000px; margin-inline: auto; }
    .src { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 6px 14px; align-items: end; }
    .fld { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
    .fld.wide { grid-column: 1 / -1; }
    .nm { font-size: 12px; color: var(--mut); line-height: 1.35; }
    input[type="text"], select { font: inherit; font-size: 14px; padding: 4px 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); min-inline-size: 0; max-inline-size: 100%; }
    input[type="file"] { font-size: 12.5px; max-inline-size: 100%; }
    input[type="checkbox"], input[type="range"] { accent-color: var(--acc); }
    .row { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
    .chk { display: inline-flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; font-size: 13px; }
    button { font: inherit; font-size: 13px; padding: 5px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; }
    button:hover { border-color: var(--mut); }
    button.main { background: var(--acc); border-color: var(--acc); color: #fff; }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    .status { font-size: 12.5px; color: var(--mut); min-inline-size: 0; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 6px; }
    .stat { min-inline-size: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; }
    .stat span { font-size: 11px; color: var(--mut); line-height: 1.35; }
    .stat b { font-size: 21px; line-height: 1.25; font-variant-numeric: tabular-nums; }
    .vis { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 8px; align-items: start; }
    @media (max-width: 640px) { .vis { grid-template-columns: minmax(0, 1fr); } }
    figure { margin: 0; min-inline-size: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px; }
    canvas { display: block; inline-size: 100%; }
    #sA, #sB { block-size: 150px; touch-action: pan-y; cursor: crosshair; }
    #sB { margin-block-start: 4px; }
    #pad { block-size: 170px; }
    #wave { block-size: 150px; }
    .now { font-size: 12.5px; margin: 4px 0; min-block-size: 4.4em; }
    .cmd { margin: 0; font: 11.5px/1.5 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--code); border-radius: 6px; padding: 4px 6px; }
    .pos { display: flex; flex-wrap: wrap; gap: 0 10px; align-items: center; }
    .pos input { flex: 1 1 200px; min-inline-size: 0; margin: 4px 0; }
    .pos output { min-inline-size: 5em; text-align: end; font-variant-numeric: tabular-nums; font-size: 13px; }
    figcaption { font-size: 12px; color: var(--mut); line-height: 1.45; margin-block-start: 4px; }
    .key { display: inline-block; inline-size: 9px; block-size: 9px; border-radius: 50%; vertical-align: middle; margin-inline: 4px 3px; }
    .k1 { background: var(--f1); } .k2 { background: var(--f2); } .k3 { background: var(--f3); }
    .small { font-size: 12px; color: var(--mut); margin: 0; }
    .thumb .src, .thumb .opts, .thumb .play, .thumb .stats, .thumb .pos, .thumb .wavefig, .thumb .small, .thumb figcaption, .thumb .now, .thumb .cmd { display: none; }
    .thumb .app { padding: 6px; gap: 6px; }
    .thumb .vis { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
    .thumb #sA, .thumb #sB { block-size: 92px; }
    .thumb #pad { block-size: 190px; }`,
  core() {
    // 種を決めると毎回同じ並びになる乱数（0 以上 1 未満）
    function rng(seed) {
      let s = seed >>> 0;
      return function () {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // ---- 1. かなを拍に分ける ----
    // 拍は { c: 子音, v: 母音 } の形。c が 'N'（ん）'Q'（っ）'L'（ー）'P'（区切り）のものは母音を持たない
    const ROWS = {
      '': 'あいうえお', k: 'かきくけこ', g: 'がぎぐげご', s: 'さしすせそ', z: 'ざじずぜぞ',
      t: 'たちつてと', d: 'だぢづでど', n: 'なにぬねの', h: 'はひふへほ', b: 'ばびぶべぼ',
      p: 'ぱぴぷぺぽ', m: 'まみむめも', r: 'らりるれろ',
    };
    // 行の中で子音が変わる字（し・ち・つ など）
    const ODD = { 'し': 'sh', 'じ': 'j', 'ち': 'ch', 'つ': 'ts', 'ぢ': 'j', 'づ': 'z', 'に': 'ny', 'ひ': 'hy', 'ふ': 'f' };
    const KANA = (() => {
      const m = {};
      for (const [c, row] of Object.entries(ROWS)) [...row].forEach((ch, i) => { m[ch] = { c: ODD[ch] || c, v: 'aiueo'[i] }; });
      Object.assign(m, { 'や': { c: 'y', v: 'a' }, 'ゆ': { c: 'y', v: 'u' }, 'よ': { c: 'y', v: 'o' }, 'わ': { c: 'w', v: 'a' }, 'を': { c: '', v: 'o' } });
      return m;
    })();
    const SMALL_Y = { 'ゃ': 'a', 'ゅ': 'u', 'ょ': 'o' };
    const SMALL_V = { 'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o' };
    // 「き」+「ゃ」のように、後ろに小さい や・ゆ・よ が付くときの子音
    const PALATAL = { k: 'ky', g: 'gy', n: 'ny', ny: 'ny', h: 'hy', hy: 'hy', m: 'my', r: 'ry', b: 'by', p: 'py', sh: 'sh', j: 'j', ch: 'ch' };

    function kanaToMora(text) {
      const out = [], skipped = [];
      for (const raw of String(text)) {
        const code = raw.codePointAt(0);
        const ch = code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : raw;   // カタカナ → ひらがな
        const last = out[out.length - 1];
        if (KANA[ch]) out.push({ ...KANA[ch] });
        else if (SMALL_Y[ch] && last && last.v === 'i' && PALATAL[last.c]) { last.c = PALATAL[last.c]; last.v = SMALL_Y[ch]; }
        else if (SMALL_V[ch] && last && last.v) last.v = SMALL_V[ch];
        else if (ch === 'ん') out.push({ c: 'N' });
        else if (ch === 'っ') out.push({ c: 'Q' });
        else if (ch === 'ー' || ch === '〜') { if (last && (last.v || last.c === 'L')) out.push({ c: 'L' }); }
        else if ('、,，'.includes(ch)) out.push({ c: 'P', end: '、' });
        else if ('。.！!'.includes(ch)) out.push({ c: 'P', end: '。' });
        else if ('？?'.includes(ch)) out.push({ c: 'P', end: '？' });
        else if (!/\s/.test(ch)) skipped.push(raw);
      }
      return { morae: out, skipped };
    }

    // ---- 2. 拍から、5 ms ごとの声の設計図を作る（規則による音声合成） ----
    const VOWEL = { a: [750, 1200, 2600, 3500], i: [300, 2250, 3000, 3700], u: [340, 1350, 2400, 3400], e: [480, 1900, 2550, 3500], o: [480, 850, 2500, 3400] };
    const BW = [70, 90, 150, 250];
    const NASAL_BW = [100, 300, 300, 400];
    const VOICELESS = new Set(['k', 'ky', 's', 'sh', 't', 'ch', 'ts', 'h', 'hy', 'f', 'p', 'py']);
    const FRAME = 0.005;

    // 区切りの前後で句に分け、句の中の拍の順番から声の高さ（倍率）を決める。
    // 2 拍目で上がり、句の終わりへ向けて少しずつ下がる。「。」の前は下げ、「？」の前は上げる
    function pitchPlan(morae) {
      const mul = new Array(morae.length).fill(1);
      let start = 0;
      for (let i = 0; i <= morae.length; i++) {
        if (i < morae.length && morae[i].c !== 'P') continue;
        const n = i - start, end = i < morae.length ? morae[i].end : '。';
        for (let k = 0; k < n; k++) {
          let m = k === 0 && n > 1 ? 0.94 : 1.1 - 0.2 * (k - 1) / Math.max(1, n - 2);
          if (k === n - 1) m = end === '？' ? 1.35 : end === '。' ? 0.84 : m;
          mul[start + k] = m;
        }
        start = i + 1;
      }
      return mul;
    }

    // 1 拍を、目標の値が一定の区間（seg）の並びにする
    function moraSegs(m, next, prevF) {
      const segs = [];
      const add = (dur, o) => segs.push({ dur, F: prevF, B: BW, av: 0, an: 0, af: 0, fc: 4000, fbw: 2000, ...o });
      if (m.c === 'P') { add(m.end === '、' ? 0.16 : 0.3, {}); return segs; }
      if (m.c === 'Q') { add(0.08, {}); return segs; }
      if (m.c === 'N') { add(0.1, { F: [250, 1250, 2300, 3300], B: NASAL_BW, av: 0.45 }); return segs; }
      const vf = VOWEL[m.v], front = m.v === 'i' || m.v === 'e';
      const c = m.c, base = c.replace(/y$/, '').replace(/^ny$/, 'n') || '';
      const lo = (f2) => [220, f2, vf[2], vf[3]];
      // 子音の部分
      if ('kgtdpb'.includes(base) && base) {
        const voiced = 'gdb'.includes(base);
        const f2 = base === 'k' || base === 'g' ? (front ? 2300 : 1500) : base === 't' || base === 'd' ? 1800 : 900;
        add(voiced ? 0.045 : 0.06, { F: lo(f2), av: voiced ? 0.12 : 0 });
        const fc = base === 'k' || base === 'g' ? (front ? 3000 : 1800) : base === 't' || base === 'd' ? 4200 : 1200;
        add(0.012, { F: lo(f2), af: voiced ? 0.35 : 0.55, fc, fbw: 1800, av: voiced ? 0.2 : 0 });
        if (!voiced) add(base === 'k' ? 0.03 : 0.02, { F: [500, (f2 + vf[1]) / 2, vf[2], vf[3]], an: 0.35 });
      } else if (c === 's') add(0.1, { F: [300, 1700, vf[2], vf[3]], af: 0.55, fc: 5500, fbw: 3000 });
      else if (c === 'sh') add(0.11, { F: [300, 2100, vf[2], vf[3]], af: 0.6, fc: 3300, fbw: 2200 });
      else if (c === 'z' || c === 'j') {
        add(0.025, { F: lo(1800), av: 0.12 });
        add(0.06, { F: [280, c === 'j' ? 2100 : 1700, vf[2], vf[3]], av: 0.3, af: 0.3, fc: c === 'j' ? 3200 : 5000, fbw: 2500 });
      } else if (c === 'ch' || c === 'ts') {
        add(0.05, { F: lo(1800) });
        add(0.07, { F: [300, c === 'ch' ? 2100 : 1700, vf[2], vf[3]], af: 0.6, fc: c === 'ch' ? 3400 : 5500, fbw: 2500 });
      } else if (c === 'h') add(0.07, { F: vf, an: 0.2 });
      else if (c === 'hy') add(0.08, { F: [300, 2200, vf[2], vf[3]], af: 0.4, an: 0.08, fc: 3200, fbw: 2000 });
      else if (c === 'f') add(0.08, { F: [300, 1000, vf[2], vf[3]], af: 0.25, an: 0.1, fc: 1600, fbw: 3000 });
      else if (base === 'n' || c === 'ny') add(0.055, { F: [250, c === 'ny' || c === 'n' && front ? 2000 : 1500, 2500, 3400], B: NASAL_BW, av: 0.5 });
      else if (base === 'm') add(0.06, { F: [250, 1000, 2300, 3400], B: NASAL_BW, av: 0.5 });
      else if (base === 'r') add(0.025, { F: [320, front ? 1800 : 1300, 2100, 3300], av: 0.5 });
      else if (c === 'w') add(0.05, { F: [320, 750, 2400, 3300], av: 0.85 });
      // や・ゆ・よ と、きゃ・にゅ などは「い」の形から母音へ移る
      if (c === 'y' || (/y$/.test(c) && m.v !== 'i')) add(0.045, { F: [280, 2250, 2950, 3600], av: 0.85 });
      // 母音の部分。無声の子音に挟まれた「い」「う」（「です」の「す」など）は声帯を震わせずに息だけで出す
      const nextC = next ? next.c : 'P';
      const devoice = (m.v === 'i' || m.v === 'u') && VOICELESS.has(c) && (VOICELESS.has(nextC) || nextC === 'P' || nextC === 'Q');
      if (devoice) add(0.06, { F: vf, an: 0.2 });
      else add(c === 'y' || c === 'w' ? 0.1 : 0.11, { F: vf, av: 1 });
      return segs;
    }

    // 区間の値を 5 ms ごとに並べ、なめらかにつなぐ（フォルマントは前後 25 ms、強さは前後 10 ms で平均）
    function smoothTrack(frames, key, idx, half) {
      const n = frames.length, src = frames.map((f) => (idx < 0 ? f[key] : f[key][idx]));
      for (let i = 0; i < n; i++) {
        let s = 0, w = 0;
        for (let k = -half; k <= half; k++) {
          const j = Math.min(n - 1, Math.max(0, i + k)), wt = half + 1 - Math.abs(k);
          s += src[j] * wt; w += wt;
        }
        if (idx < 0) frames[i][key] = s / w; else frames[i][key][idx] = s / w;
      }
    }

    function planSpeech(morae, opt = {}) {
      const base = opt.f0 || 120, fs = opt.formantScale || 1;
      const mul = pitchPlan(morae);
      const frames = [];
      let prevF = VOWEL.a, prevV = null;
      const push = (seg, f0) => {
        const n = Math.max(1, Math.round(seg.dur / FRAME));
        for (let k = 0; k < n; k++) frames.push({ F: seg.F.map((v) => v * fs), B: seg.B.slice(), av: seg.av, an: seg.an, af: seg.af, fc: seg.fc * fs, fbw: seg.fbw, f0 });
      };
      push({ dur: 0.1, F: prevF, B: BW, av: 0, an: 0, af: 0, fc: 4000, fbw: 2000 }, base);
      morae.forEach((m, i) => {
        let segs;
        if (m.c === 'L') segs = prevV ? [{ ...prevV }] : [];
        else segs = moraSegs(m, morae[i + 1], prevF);
        for (const s of segs) push(s, base * mul[i]);
        const last = segs[segs.length - 1];
        if (last) { prevF = last.F; if (m.v || m.c === 'L' || m.c === 'N') prevV = { ...last }; }
      });
      push({ dur: 0.15, F: prevF, B: BW, av: 0, an: 0, af: 0, fc: 4000, fbw: 2000 }, base * 0.8);
      for (let k = 0; k < 4; k++) { smoothTrack(frames, 'F', k, 5); smoothTrack(frames, 'B', k, 5); }
      for (const key of ['av', 'an', 'af']) smoothTrack(frames, key, -1, 2);
      smoothTrack(frames, 'f0', -1, 10);
      return frames;
    }

    // ---- 3. 設計図から波形を作る ----
    // 声帯の音: 開いて閉じる息の流れ（ローゼンバーグの形）の傾き。口から出ると高い音が強まる分も含む
    function glottal(p) {
      const tp = 0.4, tn = 0.16;
      if (p < tp) return 0.5 * (1 - Math.cos(Math.PI * p / tp));
      if (p < tp + tn) return Math.cos(Math.PI * (p - tp) / (2 * tn));
      return 0;
    }

    function synthesize(frames, sr = 16000, seed = 1) {
      const per = Math.round(sr * FRAME), n = frames.length * per;
      const out = new Float32Array(n);
      const rnd = rng(seed);
      const y1 = new Float64Array(4), y2 = new Float64Array(4);
      let ph = 0, gPrev = 0, fx1 = 0, fx2 = 0, fy1 = 0, fy2 = 0, dcx = 0, dcy = 0;
      let b0 = 0, a1 = 0, a2 = 0;
      const T = 1 / sr;
      const ca = new Float64Array(4), cb = new Float64Array(4), cc = new Float64Array(4);
      let peak = 0;
      for (let i = 0; i < n; i++) {
        const fi = Math.min(frames.length - 1, Math.floor(i / per)), u = (i % per) / per;
        const A = frames[fi], Bf = frames[Math.min(frames.length - 1, fi + 1)];
        const lerp = (a, b) => a + (b - a) * u;
        if (i % 16 === 0) {
          // 声の道の共鳴（クラットの共鳴器を 4 つ直列）の係数。DC での増幅を 1 にそろえる
          for (let k = 0; k < 4; k++) {
            const F = lerp(A.F[k], Bf.F[k]), bw = lerp(A.B[k], Bf.B[k]);
            cc[k] = -Math.exp(-2 * Math.PI * bw * T);
            cb[k] = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * F * T);
            ca[k] = 1 - cb[k] - cc[k];
          }
          // 摩擦の音の帯域フィルタ（中心での増幅が 1）
          const w = 2 * Math.PI * Math.min(A.fc, sr * 0.45) * T, q = Math.max(0.5, A.fc / A.fbw), al = Math.sin(w) / (2 * q);
          b0 = al / (1 + al); a1 = -2 * Math.cos(w) / (1 + al); a2 = (1 - al) / (1 + al);
        }
        const f0 = lerp(A.f0, Bf.f0), av = lerp(A.av, Bf.av), an = lerp(A.an, Bf.an), af = lerp(A.af, Bf.af);
        ph += f0 * T; if (ph >= 1) ph -= 1;
        const g = glottal(ph), src = (g - gPrev) * 6; gPrev = g;
        const noise = rnd() * 2 - 1;
        let x = av * src + an * noise * 0.5;
        for (let k = 0; k < 4; k++) { const y = ca[k] * x + cb[k] * y1[k] + cc[k] * y2[k]; y2[k] = y1[k]; y1[k] = y; x = y; }
        // 摩擦の音（s・sh など）は声の道を通さず、帯域を絞った雑音を足す
        const xin = af * noise;
        const fr = b0 * xin - b0 * fx2 - a1 * fy1 - a2 * fy2;
        fx2 = fx1; fx1 = xin; fy2 = fy1; fy1 = fr;
        const s = x + fr * 0.9;
        const d = s - dcx + 0.995 * dcy; dcx = s; dcy = d;   // 直流を取り除く
        out[i] = d;
        peak = Math.max(peak, Math.abs(d));
      }
      if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.9 / peak;
      return out;
    }

    // ---- 4. 声を 10 ms ごとに分析する（線形予測） ----
    // 自己相関から、レビンソン・ダービンの方法で予測の係数 a（a[0] = 1）を求める
    function levinson(r, p) {
      const a = new Float64Array(p + 1); a[0] = 1;
      let err = r[0];
      for (let i = 1; i <= p && err > 0; i++) {
        let acc = r[i];
        for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
        const k = -acc / err;
        const prev = a.slice();
        for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
        a[i] = k;
        err *= 1 - k * k;
      }
      return { a, err };
    }

    function autocorr(x, maxLag) {
      const r = new Float64Array(maxLag + 1);
      for (let l = 0; l <= maxLag; l++) { let s = 0; for (let i = l; i < x.length; i++) s += x[i] * x[i - l]; r[l] = s; }
      return r;
    }

    // z^p + a1 z^(p-1) + … + ap = 0 の根をデュラン・ケルナー法で全部求める（{ re, im } の配列）
    function polyRoots(a) {
      const p = a.length - 1;
      if (p < 1) return [];
      const z = [];
      for (let k = 0; k < p; k++) { const ang = 0.4 + 2 * Math.PI * k / p; z.push([0.9 * Math.cos(ang), 0.9 * Math.sin(ang)]); }
      for (let it = 0; it < 500; it++) {
        let move = 0;
        for (let k = 0; k < p; k++) {
          // 分子: 多項式の値（ホーナー法）
          let pr = 1, pi = 0;
          for (let j = 1; j <= p; j++) { const t = pr * z[k][0] - pi * z[k][1] + a[j]; pi = pr * z[k][1] + pi * z[k][0]; pr = t; }
          // 分母: ほかの根との差の積
          let dr = 1, di = 0;
          for (let j = 0; j < p; j++) {
            if (j === k) continue;
            const er = z[k][0] - z[j][0], ei = z[k][1] - z[j][1];
            const t = dr * er - di * ei; di = dr * ei + di * er; dr = t;
          }
          const den = dr * dr + di * di || 1e-30;
          const qr = (pr * dr + pi * di) / den, qi = (pi * dr - pr * di) / den;
          z[k][0] -= qr; z[k][1] -= qi;
          move = Math.max(move, Math.hypot(qr, qi));
        }
        if (move < 1e-12) break;
      }
      return z.map(([re, im]) => ({ re, im }));
    }

    // 根のうち上半分にあるものを、共鳴の周波数と帯域幅にする（低い順）
    function lpcResonances(a, sr) {
      return polyRoots(a)
        .filter((z) => z.im > 1e-9)
        .map((z) => ({ hz: Math.atan2(z.im, z.re) * sr / (2 * Math.PI), bw: -Math.log(Math.max(1e-9, Math.hypot(z.re, z.im))) * sr / Math.PI }))
        .sort((p, q) => p.hz - q.hz);
    }

    // 予測の係数から、その周波数での声の道の強さ 1 / |A(e^jω)|
    function lpcGain(a, hz, sr) {
      const w = 2 * Math.PI * hz / sr;
      let re = 0, im = 0;
      for (let k = 0; k < a.length; k++) { re += a[k] * Math.cos(w * k); im -= a[k] * Math.sin(w * k); }
      return 1 / Math.max(1e-9, Math.hypot(re, im));
    }

    // 声の高さ: 少しずらした自分自身との似かたが一番大きいずれ（周期）を探す
    function pitchOf(x, sr, lo = 70, hi = 320) {
      const n = x.length;
      let mean = 0; for (let i = 0; i < n; i++) mean += x[i]; mean /= n;
      const minL = Math.floor(sr / hi), maxL = Math.min(n - 40, Math.ceil(sr / lo));
      const r = new Float64Array(maxL + 2);
      let best = -1, bestL = 0;
      for (let l = minL; l <= maxL + 1; l++) {
        let s = 0, e1 = 0, e2 = 0;
        for (let i = 0; i + l < n; i++) { const p = x[i] - mean, q = x[i + l] - mean; s += p * q; e1 += p * p; e2 += q * q; }
        r[l] = e1 > 0 && e2 > 0 ? s / Math.sqrt(e1 * e2) : 0;
        if (l <= maxL && r[l] > best) { best = r[l]; bestL = l; }
      }
      if (bestL === 0) return { f0: 0, r: 0 };
      // 周期の 2 倍のずれも似ているので、半分のずれでも十分似ていればそちらを選ぶ
      const half = Math.round(bestL / 2);
      if (half >= minL && r[half] > 0.85 * best && r[half] >= r[half - 1] && r[half] >= r[half + 1]) bestL = half;
      const L = bestL, y0 = r[L - 1] ?? r[L], y1 = r[L], y2 = r[L + 1] ?? r[L];
      const den = y0 - 2 * y1 + y2;
      const off = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / den)) : 0;
      return { f0: sr / (L + off), r: r[L] };
    }

    function median(list) {
      const s = list.slice().sort((p, q) => p - q), m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    // 声を 10 ms ごとに分析する。窓は 25 ms、予測の次数は sr / 1000 + 2（16 kHz なら 18）
    function analyse(x, sr = 16000) {
      const win = Math.round(0.025 * sr), hop = Math.round(0.01 * sr), order = Math.round(sr / 1000) + 2;
      const count = x.length >= win ? Math.floor((x.length - win) / hop) + 1 : 0;
      const ham = new Float64Array(win);
      for (let i = 0; i < win; i++) ham[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (win - 1));
      const frames = [];
      let prevF = [500, 1500, 2500];
      for (let f = 0; f < count; f++) {
        const s0 = f * hop, seg = x.subarray(s0, s0 + win);
        let e = 0, zc = 0;
        for (let i = 0; i < win; i++) { e += seg[i] * seg[i]; if (i && (seg[i] >= 0) !== (seg[i - 1] >= 0)) zc++; }
        const rms = Math.sqrt(e / win);
        const { f0, r } = pitchOf(seg, sr);
        const fr = { t: (s0 + win / 2) / sr, rms, zcr: zc / win, f0, r, voiced: r > 0.4 && zc / win < 0.25, F: prevF.slice(), A: [0, 0, 0], level: 0 };
        if (rms > 1e-6) {
          const pe = new Float64Array(win);
          for (let i = 0; i < win; i++) pe[i] = (seg[i] - (i ? 0.97 * seg[i - 1] : 0)) * ham[i];
          const rr = autocorr(pe, order); rr[0] *= 1 + 1e-6;
          const { a } = levinson(rr, order);
          const cand = lpcResonances(a, sr).filter((c) => c.hz > 90 && c.bw < 600);
          const pick = (lo, hi) => { const c = cand.find((c) => c.hz >= lo && c.hz <= hi); return c ? c.hz : null; };
          const f1 = pick(200, 1000) ?? prevF[0];
          const f2 = pick(Math.max(f1 + 200, 600), 2800) ?? Math.max(prevF[1], f1 + 200);
          const f3 = pick(Math.max(f2 + 250, 1600), 3900) ?? Math.max(prevF[2], f2 + 250);
          fr.F = [f1, f2, f3];
          fr.A = fr.F.map((hz) => lpcGain(a, hz, sr));
          prevF = fr.F;
        }
        frames.push(fr);
      }
      // 強さ: 一番大きいフレームとの比の平方根（小さい音を聞こえやすくする）。2% 未満は無音
      const top = Math.max(1e-9, ...frames.map((f) => f.rms));
      for (const f of frames) {
        const rel = f.rms / top;
        f.level = rel < 0.02 ? 0 : Math.min(1, Math.sqrt(rel));
        if (!f.level) f.voiced = false;
      }
      // 前後 2 フレームの中央値でならす（たまに外れた値を消す）
      const raw = frames.map((f) => ({ F: f.F.slice(), f0: f.f0, voiced: f.voiced }));
      for (let i = 0; i < frames.length; i++) {
        const nb = raw.slice(Math.max(0, i - 2), i + 3);
        for (let k = 0; k < 3; k++) frames[i].F[k] = median(nb.map((q) => q.F[k]));
        const vf = nb.filter((q) => q.voiced).map((q) => q.f0);
        frames[i].f0 = frames[i].voiced && vf.length ? Math.min(320, Math.max(70, median(vf))) : 0;
      }
      return { hop: hop / sr, dur: x.length / sr, frames };
    }

    // ---- 5. 分析の結果を、振動モーターへの命令の並びにする ----
    // 命令は「いつから・何秒・全体の強さ・正弦波の一覧（周波数と強さ）」。モーターが出せるのは 100〜4000 Hz
    const MOTOR_LO = 100, MOTOR_HI = 4000;
    function voiceTones(f, count) {
      const w = [f.A[0], f.A[1] * 1.8, f.A[2] * 2.5];      // 高い共鳴ほど弱く出るので強めに配る
      const list = [];
      for (let k = 0; k < count; k++) if (f.F[k] >= MOTOR_LO && f.F[k] <= MOTOR_HI && w[k] > 0) list.push({ hz: f.F[k], amp: w[k] });
      const sum = list.reduce((s, t) => s + t.amp, 0) || 1;
      return list.map((t) => ({ hz: t.hz, amp: t.amp / sum }));     // 強さの合計を 1 にする（モーターの上限）
    }

    function planMotor(an, opt = {}) {
      const tones = opt.tones || 2, hiss = opt.hiss !== false, rnd = rng(opt.seed || 7);
      const { frames, hop } = an, total = an.dur, acts = [];
      if (!frames.length) return { acts, total };
      const t0 = frames[0].t;
      let t = 0;
      while (t < total) {
        // その時刻を窓の中心に持つフレーム
        const f = frames[Math.max(0, Math.min(frames.length - 1, Math.round((t - t0) / hop)))];
        if (f.level > 0 && f.voiced && f.f0 > 0) {
          const dur = 1 / f.f0;
          const list = voiceTones(f, tones);
          if (list.length) acts.push({ t, dur, level: f.level, kind: 'voice', tones: list });
          t += dur;
        } else if (f.level > 0 && hiss) {
          // ざらざらした音: 4 ms ごとに 2.7〜4.3 kHz の高い音を 3 つ、でたらめに選んで鳴らす
          const list = [0, 1, 2].map(() => ({ hz: 2700 + 1600 * rnd(), amp: 1 / 3 }));
          acts.push({ t, dur: 0.004, level: f.level * 0.7, kind: 'hiss', tones: list });
          t += 0.004;
        } else t += 0.005;
      }
      return { acts, total };
    }

    // 命令の並びを音にする。restart が true なら命令ごとに正弦波を 0 の位相から始め直す
    function renderMotor(plan, sr = 16000, opt = {}) {
      const restart = opt.restart !== false;
      const n = Math.max(1, Math.ceil(plan.total * sr));
      const out = new Float32Array(n), phase = [0, 0, 0];
      for (const a of plan.acts) {
        const i0 = Math.round(a.t * sr), i1 = Math.min(n, Math.round((a.t + a.dur) * sr));
        if (restart) phase.fill(0);
        a.tones.forEach((tone, k) => {
          const w = 2 * Math.PI * tone.hz / sr, amp = a.level * tone.amp;
          for (let i = i0; i < i1; i++) out[i] += amp * Math.sin(phase[k] + w * (i - i0));
          phase[k] = (phase[k] + w * (i1 - i0)) % (2 * Math.PI);
        });
      }
      return out;
    }

    // ---- 6. 周波数の図（短い区間ごとの FFT） ----
    function fft(re, im) {
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
      }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
          let cr = 1, ci = 0;
          for (let k = 0; k < len / 2; k++) {
            const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
            re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
            re[i + k] += ar; im[i + k] += ai;
            const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
          }
        }
      }
    }

    // 10 ms ごとに 512 点の FFT をかけ、fmax までの強さ（dB）を並べる
    function spectrogram(x, sr = 16000, fmax = 4500) {
      const N = 512, hop = Math.round(0.01 * sr), bins = Math.min(N / 2, Math.ceil(fmax * N / sr));
      const cols = Math.max(1, Math.floor(Math.max(0, x.length - N) / hop) + 1);
      const db = new Float32Array(cols * bins), re = new Float64Array(N), im = new Float64Array(N);
      let top = -200;
      for (let c = 0; c < cols; c++) {
        for (let i = 0; i < N; i++) { const v = x[c * hop + i] || 0; re[i] = v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; }
        fft(re, im);
        for (let b = 0; b < bins; b++) { const v = 10 * Math.log10(re[b] * re[b] + im[b] * im[b] + 1e-12); db[c * bins + b] = v; if (v > top) top = v; }
      }
      return { cols, bins, hop: hop / sr, binHz: sr / N, db, top };
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const thumb = !!window.THUMB;
    if (thumb) document.documentElement.classList.add('thumb');
    const SR = 16000, FMAX = 4500;
    const cssv = getComputedStyle(document.documentElement);
    const col = (n, alt) => cssv.getPropertyValue(n).trim() || alt;
    const C = {
      fg: col('--fg', '#22201c'), mut: col('--mut', '#5f594f'), line: col('--line', '#d8d2c6'),
      f1: col('--f1', '#f2994a'), f2: col('--f2', '#56ccf2'), f3: col('--f3', '#d9b3ff'),
      f1d: col('--f1d', '#b25f17'), f2d: col('--f2d', '#1d74a0'), head: col('--head', '#ff5a5a'), glass: col('--glass', '#e4e9ef'),
    };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const PRESETS = ['こんにちは。わたしは トラックパッドです。', 'スピーカーは ありません。ガラスが ふるえて います。', 'さわって みて ください。', 'あいうえお。'];
    const textI = $('text'), presetS = $('preset'), voiceS = $('voice'), fileI = $('file');
    const ntonesS = $('ntones'), restartC = $('restart'), hissC = $('hiss'), posI = $('pos'), posO = $('posO');
    const sA = $('sA'), sB = $('sB'), wv = $('wave'), pd = $('pad');
    const gA = sA.getContext('2d'), gB = sB.getContext('2d'), gW = wv.getContext('2d'), gP = pd.getContext('2d');
    const S = { src: null, an: null, plan: null, out: null, specA: null, specB: null, imgA: null, imgB: null, dur: 1, pos: 0.86, peakSrc: 1, peakOut: 1 };
    let actx = null, playing = null, dirty = true, thumbT0 = 0;

    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    function setStatus(t) { $('status').textContent = t; }
    function peakOf(x) { let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return Math.max(1e-6, p); }

    for (const p of PRESETS) presetS.add(new Option(p, p));

    // 周波数の図を 1 列 1 画素の画像にしておき、描くときは拡大するだけにする
    function specImage(sp) {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, sp.cols); cv.height = Math.max(1, sp.bins);
      const g = cv.getContext('2d'), img = g.createImageData(cv.width, cv.height);
      const lo = sp.top - 72;
      const stops = [[15, 20, 32], [35, 62, 104], [43, 140, 140], [232, 197, 71], [255, 247, 222]];
      for (let c = 0; c < sp.cols; c++) {
        for (let b = 0; b < sp.bins; b++) {
          const v = clamp((sp.db[c * sp.bins + b] - lo) / 72, 0, 1) * (stops.length - 1);
          const k = Math.min(stops.length - 2, Math.floor(v)), u = v - k;
          const o = ((sp.bins - 1 - b) * cv.width + c) * 4;
          for (let j = 0; j < 3; j++) img.data[o + j] = stops[k][j] + (stops[k + 1][j] - stops[k][j]) * u;
          img.data[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return cv;
    }

    function setSource(wav, label) {
      stopAudio();
      S.src = wav; S.dur = Math.max(0.05, wav.length / SR); S.peakSrc = peakOf(wav);
      S.an = analyse(wav, SR);
      S.specA = spectrogram(wav, SR, FMAX); S.imgA = specImage(S.specA);
      S.pos = clamp(S.pos, 0, S.dur);
      posI.max = String(Math.round(S.dur * 1000));
      remake();
      syncPos();
      setStatus(label);
    }

    // 音の数・鳴らし直し・息の音の設定が変わったら、命令と音だけ作り直す（分析はそのまま）
    function remake() {
      if (!S.an) return;
      S.plan = planMotor(S.an, { tones: Number(ntonesS.value), hiss: hissC.checked });
      S.out = renderMotor(S.plan, SR, { restart: restartC.checked });
      S.peakOut = peakOf(S.out);
      S.specB = spectrogram(S.out, SR, FMAX); S.imgB = specImage(S.specB);
      updateStats();
      dirty = true;
    }

    function buildFromText() {
      const { morae, skipped } = kanaToMora(textI.value);
      if (!morae.some((m) => m.v)) { setStatus('読める字がありません。ひらがなかカタカナで書いてください。'); return; }
      const hi = voiceS.value === 'high';
      const wav = synthesize(planSpeech(morae, { f0: hi ? 210 : 120, formantScale: hi ? 1.1 : 1 }), SR);
      const count = morae.filter((m) => m.c !== 'P').length;
      const odd = [...new Set(skipped)].join('');
      setSource(wav, '内蔵の声で ' + count + ' 拍の文を作り、分析した。' + (odd ? '読めない字（' + odd + '）は飛ばした。' : ''));
    }

    function updateStats() {
      const A = S.plan.acts, d = S.dur;
      const nums = A.reduce((s, a) => s + 3 + 2 * a.tones.length, 0);
      const f0s = S.an.frames.filter((f) => f.voiced).map((f) => f.f0);
      $('stDur').textContent = d.toFixed(2);
      $('stActs').textContent = String(Math.round(A.length / d));
      $('stF0').textContent = f0s.length ? String(Math.round(median(f0s))) : '-';
      $('stNums').textContent = Math.round(nums / d).toLocaleString('ja-JP');
    }

    function syncPos() {
      posI.value = String(Math.round(S.pos * 1000));
      const s = S.pos.toFixed(2) + ' 秒';
      posO.textContent = s;
      posI.setAttribute('aria-valuetext', s);
    }

    function fit(cv, ctx) {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const cw = Math.max(1, cv.clientWidth), ch = Math.max(1, cv.clientHeight);
      const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: cw, h: ch };
    }
    function geo(w, h) { return { x0: 30, y0: 3, pw: Math.max(1, w - 34), ph: Math.max(1, h - 6) }; }
    const tx = (G, t) => G.x0 + (t / S.dur) * G.pw;
    const fy = (G, hz) => G.y0 + (1 - hz / FMAX) * G.ph;
    function vline(g, x, y1, y2) { g.beginPath(); g.moveTo(x, y1); g.lineTo(x, y2); g.stroke(); }

    function drawSpec(cv, g, img, sp, isSrc, t) {
      const { w, h } = fit(cv, g);
      g.clearRect(0, 0, w, h);
      const G = geo(w, h);
      g.fillStyle = '#0f1420'; g.fillRect(G.x0, G.y0, G.pw, G.ph);
      g.save();
      g.beginPath(); g.rect(G.x0, G.y0, G.pw, G.ph); g.clip();
      if (img && sp) {
        const off = 256 / SR - sp.hop / 2;
        const x1 = tx(G, off), x2 = tx(G, off + sp.cols * sp.hop), yT = fy(G, sp.bins * sp.binHz);
        g.imageSmoothingEnabled = true;
        g.drawImage(img, 0, 0, img.width, img.height, x1, yT, Math.max(1, x2 - x1), Math.max(1, fy(G, 0) - yT));
      }
      g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1;
      for (const hz of [1000, 2000, 3000, 4000]) { const y = fy(G, hz); g.beginPath(); g.moveTo(G.x0, y); g.lineTo(G.x0 + G.pw, y); g.stroke(); }
      const nT = Number(ntonesS.value);
      if (isSrc && S.an) {
        const hy1 = fy(G, 4300), hy2 = fy(G, 2700);
        for (const f of S.an.frames) {
          if (!f.level) continue;
          const x = tx(G, f.t);
          if (f.voiced) {
            const pts = [[f.F[0], C.f1, 1], [f.F[1], C.f2, 2], [f.F[2], C.f3, 3]];
            for (const [hz, c, k] of pts) {
              if (k > nT && k !== 2) continue;
              g.globalAlpha = k > nT ? 0.35 : 1;
              g.fillStyle = c; g.fillRect(x - 1.5, fy(G, hz) - 1.5, 3, 3);
            }
            g.globalAlpha = 1;
          } else if (hissC.checked) {
            g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x - 2, hy1, 4, hy2 - hy1);
          }
        }
      }
      // 見る位置（再生中は今の時刻）
      g.strokeStyle = C.head; g.lineWidth = 1.5;
      vline(g, tx(G, t), G.y0, G.y0 + G.ph);
      // 題
      const title = isSrc ? '元の声' : 'トラックパッドの声' + (restartC.checked ? '' : '（鳴らし直さない）');
      g.font = '11.5px system-ui, sans-serif'; g.textBaseline = 'top'; g.textAlign = 'left';
      const tw = g.measureText(title).width;
      g.fillStyle = 'rgba(15,20,32,0.72)'; g.fillRect(G.x0 + 4, G.y0 + 4, tw + 10, 18);
      g.fillStyle = '#fff'; g.fillText(title, G.x0 + 9, G.y0 + 7);
      g.restore();
      // 縦の目盛り
      g.font = '10px system-ui, sans-serif'; g.fillStyle = C.mut; g.textAlign = 'right'; g.textBaseline = 'middle';
      for (const hz of [1000, 2000, 3000, 4000]) g.fillText(hz / 1000 + 'k', G.x0 - 4, fy(G, hz));
      g.textBaseline = 'bottom'; g.fillText('Hz', G.x0 - 4, G.y0 + G.ph);
    }

    // その時刻に始まっている最後の命令の番号（無ければ -1）
    function actIndexAt(t) {
      const A = S.plan ? S.plan.acts : [];
      let lo = 0, hi = A.length - 1, ans = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (A[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
      return ans;
    }
    function frameAt(t) {
      const F = S.an ? S.an.frames : [];
      if (!F.length) return null;
      return F[clamp(Math.round((t - F[0].t) / S.an.hop), 0, F.length - 1)];
    }

    function drawWave(t) {
      const { w, h } = fit(wv, gW);
      gW.clearRect(0, 0, w, h);
      if (!S.src) return;
      const span = 0.04, a = t - span / 2, x0 = 6, pw = Math.max(1, w - 12);
      const X = (tt) => x0 + ((tt - a) / span) * pw;
      const amp = h * 0.19;
      // 命令の始まり（ここで正弦波を鳴らし直す）
      const A = S.plan.acts;
      for (let j = Math.max(0, actIndexAt(a)); j < A.length && A[j].t <= a + span; j++) {
        if (A[j].t < a) continue;
        gW.strokeStyle = A[j].kind === 'voice' ? C.f1d : C.mut; gW.globalAlpha = 0.55; gW.lineWidth = 1;
        vline(gW, X(A[j].t), h * 0.53, h * 0.97);
      }
      gW.globalAlpha = 1;
      const lanes = [{ data: S.src, y: h * 0.26, peak: S.peakSrc, color: C.fg, label: '元の声' }, { data: S.out, y: h * 0.75, peak: S.peakOut, color: C.f2d, label: 'トラックパッドの声' }];
      for (const L of lanes) {
        gW.strokeStyle = C.line; gW.lineWidth = 1;
        gW.beginPath(); gW.moveTo(x0, L.y); gW.lineTo(x0 + pw, L.y); gW.stroke();
        const i0 = Math.max(0, Math.floor(a * SR)), i1 = Math.min(L.data.length - 1, Math.ceil((a + span) * SR));
        gW.strokeStyle = L.color; gW.lineWidth = 1.3;
        gW.beginPath();
        for (let i = i0; i <= i1; i++) {
          const x = X(i / SR), y = L.y - (L.data[i] / L.peak) * amp;
          if (i === i0) gW.moveTo(x, y); else gW.lineTo(x, y);
        }
        gW.stroke();
        gW.font = '11px system-ui, sans-serif'; gW.fillStyle = C.mut; gW.textAlign = 'left'; gW.textBaseline = 'top';
        gW.fillText(L.label, x0 + 2, L.y - h * 0.24);
      }
      gW.strokeStyle = C.head; gW.setLineDash([3, 3]); vline(gW, X(t), 0, h); gW.setLineDash([]);
      gW.font = '10px system-ui, sans-serif'; gW.fillStyle = C.mut; gW.textBaseline = 'bottom';
      gW.textAlign = 'left'; gW.fillText('−20 ms', x0, h);
      gW.textAlign = 'right'; gW.fillText('+20 ms', x0 + pw, h);
    }

    // 上から見たトラックパッド。命令が始まるたびにモーターから輪が広がり、ガラスが横に揺れる
    function drawPad(t) {
      const { w, h } = fit(pd, gP);
      gP.clearRect(0, 0, w, h);
      if (!S.out) return;
      const v = S.out[Math.round(t * SR)] || 0;
      const gw = Math.max(10, Math.min(w - 20, (h - 34) * 1.5)), gh = gw / 1.5;
      const top0 = Math.max(4, (h - gh - 24) / 2);   // ガラスと下の文をまとめて縦の中央に置く
      const cx = w / 2 + (reduce ? 0 : (v / S.peakOut) * 4), cy = top0 + gh / 2;
      const x = cx - gw / 2, y = cy - gh / 2;
      gP.save();
      gP.beginPath();
      if (gP.roundRect) gP.roundRect(x, y, gw, gh, 10); else gP.rect(x, y, gw, gh);
      gP.fillStyle = C.glass; gP.fill();
      gP.strokeStyle = C.line; gP.lineWidth = 1.5; gP.stroke();
      gP.clip();
      // モーター（ガラスの下にある）
      const mw = gw * 0.34, mh = gh * 0.12, my = cy + gh * 0.12;
      gP.setLineDash([4, 3]); gP.strokeStyle = C.mut; gP.lineWidth = 1;
      gP.strokeRect(cx - mw / 2, my - mh / 2, mw, mh); gP.setLineDash([]);
      gP.fillStyle = C.mut; gP.font = '10.5px system-ui, sans-serif'; gP.textAlign = 'center'; gP.textBaseline = 'middle';
      gP.fillText('振動モーター', cx, my);
      // 直近 60 ms の命令の輪
      const A = S.plan.acts;
      for (let j = actIndexAt(t); j >= 0; j--) {
        const age = t - A[j].t;
        if (age > 0.06) break;
        gP.strokeStyle = A[j].kind === 'voice' ? C.f1d : C.mut;
        gP.globalAlpha = Math.max(0, (1 - age / 0.06) * A[j].level);
        gP.lineWidth = 2;
        gP.beginPath(); gP.ellipse(cx, my, 8 + age * gw * 12, 4 + age * gw * 7, 0, 0, Math.PI * 2); gP.stroke();
      }
      gP.globalAlpha = 1;
      gP.restore();
      const f = frameAt(t);
      let s = 'モーターは止まっている', short = '止まっている';
      if (f && f.level && f.voiced && restartC.checked) { s = '1 秒に ' + Math.round(f.f0) + ' 回、鳴らし直す'; short = Math.round(f.f0) + ' 回／秒'; }
      else if (f && f.level && f.voiced) { s = '鳴らし直さず、つないで鳴らす'; short = 'つないで鳴らす'; }
      else if (f && f.level && hissC.checked) { s = '4 ms ごとに高い音を鳴らす'; short = '高い音を小刻みに'; }
      gP.fillStyle = C.fg; gP.font = '12px system-ui, sans-serif'; gP.textAlign = 'center'; gP.textBaseline = 'top';
      if (gP.measureText(s).width > w - 8) s = short;
      gP.fillText(s, w / 2, top0 + gh + 6);
    }

    function describe(t) {
      const f = frameAt(t);
      let s = t.toFixed(2) + ' 秒: ';
      if (!f || !f.level) s += '音が無い所。モーターへの命令も無い。';
      else if (f.voiced) {
        s += '声帯が震えている所（有声）。' + (restartC.checked
          ? '声の高さが ' + Math.round(f.f0) + ' Hz なので、1 秒に ' + Math.round(f.f0) + ' 回、正弦波を鳴らし直す。'
          : '声の高さは ' + Math.round(f.f0) + ' Hz。命令は周期ごとに出すが、鳴らし直さないので正弦波は途切れずに続く。');
        s += '共鳴は F1 ' + Math.round(f.F[0]) + ' Hz、F2 ' + Math.round(f.F[1]) + ' Hz、F3 ' + Math.round(f.F[2]) + ' Hz。';
      }
      else s += hissC.checked ? '息だけの所（無声）。4 ms ごとに 2.7〜4.3 kHz の音を 3 つ、でたらめに選んで鳴らす。' : '息だけの所（無声）。今の設定では鳴らさない。';
      return s;
    }
    function cmdText(t) {
      const A = S.plan.acts, k = actIndexAt(t);
      const lines = ['モーターへの命令（始まり・長さ・全体の強さ・正弦波）'];
      if (!A.length) lines.push('（命令なし）');
      for (let j = Math.max(0, k); j < Math.min(A.length, Math.max(0, k) + 3); j++) {
        const a = A[j];
        lines.push(a.t.toFixed(3) + ' 秒  ' + (a.dur * 1000).toFixed(1) + ' ms  強さ ' + a.level.toFixed(2) + '  ' + a.tones.map((q) => Math.round(q.hz) + ' Hz×' + q.amp.toFixed(2)).join(' ＋ '));
      }
      return lines.join('\n');
    }

    function render() {
      const t = S.pos;
      drawSpec(sA, gA, S.imgA, S.specA, true, t);
      drawSpec(sB, gB, S.imgB, S.specB, false, t);
      drawPad(t);
      if (!thumb) {
        drawWave(t);
        $('now').textContent = describe(t);
        $('cmd').textContent = cmdText(t);
      }
    }

    // 音: 最初にボタンを押したときに AudioContext を作る
    function play(kind) {
      if (!S.src) return;
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { setStatus('このブラウザは Web Audio API に対応していません。'); return; }
        actx = new AC();
      }
      if (actx.state === 'suspended') actx.resume();
      stopAudio();
      const data = kind === 'orig' ? S.src : S.out;
      const buf = actx.createBuffer(1, Math.max(1, data.length), SR);
      buf.copyToChannel(data, 0);
      const node = actx.createBufferSource();
      node.buffer = buf;
      const gain = actx.createGain();
      gain.gain.value = kind === 'orig' ? 0.8 : 0.75 / S.peakOut;
      node.connect(gain).connect(actx.destination);
      const start = actx.currentTime + 0.05;
      node.start(start);
      playing = { node, start };
      node.onended = () => { if (playing && playing.node === node) { playing = null; setStatus('再生が終わった。'); dirty = true; } };
      setStatus(kind === 'orig' ? '元の声を再生している。' : 'モーターへの命令だけから作った声を再生している。');
    }
    function stopAudio() {
      if (!playing) return;
      const p = playing; playing = null;
      try { p.node.stop(); } catch (err) { /* もう止まっている */ }
    }

    $('pOrig').addEventListener('click', () => play('orig'));
    $('pMotor').addEventListener('click', () => play('motor'));
    $('stopB').addEventListener('click', () => { stopAudio(); setStatus('止めた。'); });
    $('make').addEventListener('click', buildFromText);
    textI.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) buildFromText(); });
    presetS.addEventListener('change', () => { textI.value = presetS.value; buildFromText(); });
    voiceS.addEventListener('change', buildFromText);
    for (const el of [ntonesS, restartC, hissC]) el.addEventListener('change', () => { stopAudio(); remake(); });
    posI.addEventListener('input', () => { stopAudio(); S.pos = Number(posI.value) / 1000; syncPos(); dirty = true; });

    function seek(cv, ev) {
      stopAudio();
      const r = cv.getBoundingClientRect(), G = geo(r.width, r.height);
      S.pos = clamp(((ev.clientX - r.left - G.x0) / G.pw) * S.dur, 0, S.dur);
      syncPos(); dirty = true;
    }
    for (const cv of [sA, sB]) {
      cv.addEventListener('pointerdown', (ev) => { cv.setPointerCapture(ev.pointerId); seek(cv, ev); });
      cv.addEventListener('pointermove', (ev) => { if (cv.hasPointerCapture(ev.pointerId)) seek(cv, ev); });
    }

    // 自分の音声ファイル: 16 kHz の OfflineAudioContext で読むと、その速さに変換される
    fileI.addEventListener('change', async () => {
      const file = fileI.files && fileI.files[0];
      if (!file) return;
      setStatus('読み込んで分析している…');
      try {
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OAC) throw new Error('OfflineAudioContext がありません');
        const ab = await new OAC(1, 1, SR).decodeAudioData(await file.arrayBuffer());
        const ratio = ab.sampleRate / SR;
        const n = Math.max(1, Math.min(Math.floor(ab.length / ratio), SR * 12));
        const wav = new Float32Array(n);
        for (let c = 0; c < ab.numberOfChannels; c++) {
          const d = ab.getChannelData(c);
          for (let i = 0; i < n; i++) wav[i] += (d[Math.floor(i * ratio)] || 0) / ab.numberOfChannels;
        }
        const pk = peakOf(wav);
        if (pk < 1e-4) throw new Error('音が入っていません');
        for (let i = 0; i < n; i++) wav[i] *= 0.9 / pk;
        setSource(wav, 'ファイル「' + file.name + '」の先頭 ' + (n / SR).toFixed(1) + ' 秒を分析した。');
      } catch (err) {
        setStatus('読み込めなかった（' + ((err && err.message) || err) + '）。');
      }
    });

    function frame(now) {
      if (thumb && S.src) {
        if (!thumbT0) thumbT0 = now;
        S.pos = ((now - thumbT0) / 1000) % S.dur;
        dirty = true;
      }
      if (playing && actx) {
        S.pos = clamp(actx.currentTime - playing.start, 0, S.dur);
        syncPos(); dirty = true;
      }
      if (dirty) { dirty = false; render(); }
      requestAnimationFrame(frame);
    }

    buildFromText();
    if (thumb) setStatus('');
    render();
    dirty = false;
    if ('ResizeObserver' in window) new ResizeObserver(() => { dirty = true; }).observe(document.body);
    requestAnimationFrame(frame);
  },
});

dekiru.add({
  id: 'tr-20261125-unkernel-syscall', c: 'trend', lv: 3, date: '2026-11-25',
  t: 'ブラウザの中で RISC-V のプログラムを 1 命令ずつ動かし、カーネルだけは JavaScript のまま動かす（Linux を WebAssembly にした unkernel の考え方）',
  y: 'ぶらうざのなかでりすくふぁいぶのぷろぐらむをいちめいれいずつうごかしかーねるだけはじゃばすくりぷとのままうごかす',
  tags: ['unkernel', 'trynix', 'RISC-V', 'エミュレータ', 'システムコール', 'Canvas'],
  d: '2026年11月23日、Farid Zakaria さんが記事「2035 came early」を公開し、24日の Hacker News で 914 点・コメント 344 件を集めた。ブラウザで Nix のパッケージを試せる trynix.dev の土台を、QEMU を WebAssembly にしたものから unkernel に替え、ソリティアや xeyes、Firefox まで、窓のあるプログラムをタブの中で動かした話である。unkernel は Pooya Parsa さんが 11月15日に X で告知したもので（25日朝の時点でいいね 787 件）、Linux のカーネルそのものを WebAssembly にして、利用者のプログラムだけを CPU ごと真似る。システムコールは WebAssembly の普通の関数呼び出しになり、README によると getppid 1 回は約 170 ns で、カーネルも真似る qemu-system の 1.7 µs の 10 分の 1 である。この見本は、その違いを小さく作って確かめる。RV32IM（RISC-V の 32 ビット版に掛け算と割り算を足したもの）の CPU と組み立て器を一から書き、アセンブリで書いた 5 つのプログラムを 1 命令ずつ真似て動かす。カーネルは 2 通り用意した。1 つは JavaScript の関数がシステムコールを直接受ける「そのまま」（unkernel の考え方）、もう 1 つは同じ処理を RISC-V の命令で書き、レジスタ 31 個の保存と復元まで 1 命令ずつ真似る「真似る」（QEMU の考え方）である。eyes は毎回の絵を自分の記憶に描いてからカーネルに渡し、カーネルがそれを端末の上に浮かぶ窓へ写す（trynix が窓を端末の上に重ねる見せ方をまねた）。手元の Chrome で「2 つのカーネルの速さを比べる」を押すと、getpid を 20000 回呼ぶ bench は「そのまま」1.6 ms・「真似る」14〜19 ms（1 回あたり約 80 ns と 720〜950 ns）で、計算ばかりの primes はどちらも約 23 ms だった。再現していない所: 本物の Linux は動かない。ELF の読み込み、ページ表による記憶の仮想化、fork、ファイル、ネットワーク、音、GL、JIT は無い。CPU は 32 ビットで、unkernel の riscv64・aarch64 とは違う。カーネルも WebAssembly ではなく JavaScript で書いた。',
  p: '2 つのカーネルの違いは ecall の扱いだけにした。「そのまま」では、CPU の真似の中で ecall を見つけたら JavaScript の関数を呼び、a0 に答えを入れて次の命令へ進む。「真似る」では、ecall で CPU をカーネルの状態にして KBASE 番地へ飛ばす。RISC-V の命令で書いたカーネルが 31 個のレジスタを保存し、番号で処理を選び、装置の窓口（0x10000000 番地）へ 1 バイトずつ書き、レジスタを戻して mret で帰る。getpid 1 回で 71 命令かかり、bench（getpid を 20000 回）ではカーネルの命令が利用者の命令の 14 倍になる。primes のように計算ばかりのプログラムでは、どちらのカーネルでも時間がほとんど変わらない。unkernel の README も、CPU を多く使うプログラムは本物の CPU よりかなり遅いと書いている。カーネルを速くしても、利用者のプログラムを真似る分の遅さは残る。絵は 0xAABBGGRR の 32 ビットで書くと、記憶のバイトの並びがそのまま ImageData の RGBA になるので、カーネルは putImageData で窓へ写せる。',
  refs: [
    { title: 'Farid Zakaria「2035 came early」（2026-11-23。trynix.dev を unkernel に載せ替えた話）', url: 'https://fzakaria.com/2026/11/23/2035-came-early' },
    { title: 'Hacker News: 2035 came early（2026-11-24、914 点・344 件）', url: 'https://news.ycombinator.com/item?id=50624497' },
    { title: 'pithings/unkernel（GitHub。README に仕組みと測った数字がある）', url: 'https://github.com/pithings/unkernel' },
    { title: 'Pooya Parsa さんの X の投稿（2026-11-15、unkernel の最初の告知）', url: 'https://x.com/_pi0_/status/2122108016845566358' },
    { title: 'trynix の測定の頁（QEMU と unkernel の比べ）', url: 'https://trynix.dev/bench/' },
  ],
  html: `<div class="app">
  <div class="bar">
    <fieldset class="mode">
      <legend>これから起動するプログラムのカーネル</legend>
      <label><input type="radio" name="km" value="native" checked> そのまま（JavaScript の関数が受ける。unkernel の考え方）</label>
      <label><input type="radio" name="km" value="emu"> 真似る（RISC-V の命令で書いたカーネルも 1 命令ずつ真似る。QEMU の考え方）</label>
    </fieldset>
    <div class="cmds" id="cmds">
      <button type="button" data-cmd="hello">hello</button>
      <button type="button" data-cmd="primes">primes</button>
      <button type="button" data-cmd="bench">bench</button>
      <button type="button" data-cmd="eyes &amp;">eyes の窓を開く</button>
      <button type="button" data-cmd="crash">crash</button>
      <button type="button" data-cmd="compare" class="main">2 つのカーネルの速さを比べる</button>
    </div>
  </div>
  <div class="desk" id="desk">
    <div class="term" id="term">
      <pre id="out" role="log" aria-label="端末の出力"></pre>
      <form id="form" class="line" autocomplete="off"><label for="cmd" class="ps1">$</label><input id="cmd" type="text" spellcheck="false" autocapitalize="off" enterkeyhint="send" aria-describedby="hint"></form>
    </div>
  </div>
  <p class="hint" id="hint">端末に help と打つと命令の一覧が出る。eyes の窓は取っ手を引くか、取っ手を選んで矢印キーで動かせる。Ctrl+C で前に動いているプログラムを止める。</p>
  <div class="stats">
    <div class="stat"><span>利用者のプログラムの命令</span><b id="sU">0</b><span>回／秒</span></div>
    <div class="stat"><span>カーネルで真似た命令</span><b id="sK">0</b><span>回／秒</span></div>
    <div class="stat"><span>システムコール</span><b id="sS">0</b><span>回／秒</span></div>
    <div class="stat"><span>動いているプロセス</span><b id="sP">0</b><span id="sPm">-</span></div>
  </div>
  <div class="cmp" id="cmp" hidden>
    <table>
      <caption>同じプログラムを 2 つのカーネルで 3 回ずつ動かし、一番速かった時間</caption>
      <thead><tr><th scope="col">プログラム</th><th scope="col">システムコール</th><th scope="col">そのまま</th><th scope="col">真似る</th><th scope="col">真似たカーネルの命令</th></tr></thead>
      <tbody id="cmpBody"></tbody>
    </table>
  </div>
  <div class="sr" id="live" aria-live="polite"></div>
</div>`,
  css: `:root { color-scheme: light; --bg: #f3f1ec; --fg: #22201c; --mut: #5f594f; --line: #d8d2c6; --panel: #fffdf9; --acc: #2f6f8f; --emu: #b5522b; --tbg: #15181d; --tfg: #d9dee5; --tdim: #8a94a3; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .app { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 10px; max-inline-size: 1000px; margin-inline: auto; }
    .bar { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: end; }
    .mode { border: 1px solid var(--line); border-radius: 8px; padding: 2px 10px 6px; margin: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; min-inline-size: 0; flex: 1 1 300px; }
    .mode legend { font-size: 12px; color: var(--mut); padding-inline: 4px; }
    .mode input { accent-color: var(--acc); }
    .cmds { display: flex; flex-wrap: wrap; gap: 6px; flex: 1 1 300px; }
    button { font: inherit; font-size: 13px; padding: 5px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; }
    button:hover { border-color: var(--mut); }
    button.main { background: var(--acc); border-color: var(--acc); color: #fff; }
    button:focus-visible, input:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    .desk { position: relative; container-type: inline-size; block-size: clamp(260px, 56vh, 460px); border-radius: 8px; overflow: hidden; background: var(--tbg); }
    .term { box-sizing: border-box; block-size: 100%; overflow: auto; padding: 8px 10px; color: var(--tfg); font: 12.5px/1.5 ui-monospace, 'Cascadia Mono', Consolas, monospace; cursor: text; }
    #out { margin: 0; font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
    .line { display: flex; gap: 6px; align-items: baseline; }
    .ps1 { color: #8fd18f; }
    .line.busy .ps1 { color: var(--tdim); }
    #cmd { flex: 1; min-inline-size: 0; font: inherit; color: var(--tfg); background: transparent; border: 0; padding: 0; caret-color: #8fd18f; }
    #cmd:focus-visible { outline: 1px dashed var(--tdim); outline-offset: 2px; }
    .win { position: absolute; inset-inline-start: 0; inset-block-start: 0; background: #e8e4dc; border: 1px solid #0008; border-radius: 7px; box-shadow: 0 6px 22px #0007; overflow: hidden; }
    .tb { display: flex; align-items: stretch; background: #39404b; }
    .grip { flex: 1; min-inline-size: 0; text-align: start; border: 0; border-radius: 0; background: transparent; color: #fff; font-size: 12px; padding: 3px 8px; cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none; display: flex; gap: 6px; align-items: center; white-space: nowrap; overflow: hidden; }
    .grip.dragging { cursor: grabbing; }
    .tag { font-size: 10.5px; padding: 0 5px; border-radius: 4px; background: var(--acc); }
    .tag.emu { background: var(--emu); }
    .x { border: 0; border-radius: 0; background: transparent; color: #fff; padding: 2px 10px; font-size: 15px; line-height: 1; }
    .x:hover { background: #c0392b; }
    .win canvas { display: block; inline-size: min(240px, calc(100cqi - 20px)); image-rendering: pixelated; }
    .wst { font: 10.5px/1.4 ui-monospace, Consolas, monospace; color: #3c3a36; padding: 2px 6px; min-block-size: 2.8em; max-inline-size: min(240px, calc(100cqi - 20px)); }
    .hint { margin: 0; font-size: 12.5px; color: var(--mut); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 6px; }
    .stat { min-inline-size: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; }
    .stat span { font-size: 11px; color: var(--mut); line-height: 1.35; }
    .stat b { font-size: 20px; line-height: 1.25; font-variant-numeric: tabular-nums; }
    .cmp { overflow-x: auto; }
    table { border-collapse: collapse; font-size: 13px; min-inline-size: 100%; background: var(--panel); }
    caption { text-align: start; font-size: 12px; color: var(--mut); padding-block-end: 4px; }
    th, td { border: 1px solid var(--line); padding: 4px 8px; text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    th:first-child, thead th { text-align: start; }
    td.emu { color: var(--emu); }
    .sr { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .thumb .bar, .thumb .hint, .thumb .stats, .thumb .cmp { display: none; }
    .thumb .app { padding: 6px; }
    .thumb .desk { block-size: calc(100vh - 12px); }
    .thumb .term { font-size: 11px; }`,
  core() {
    // ---- 1. 番地の割り当て（1 つのプロセスは 512 KiB の記憶を持つ） ----
    const MEM = 0x80000;          // 記憶の大きさ
    const ULO = 0x1000;           // 利用者のプログラムが使える範囲の始まり（0 番地の近くは使わせない）
    const UHI = 0x40000;          // 利用者の範囲の終わり（スタックはここから下へ伸びる）
    const FBDEV = 0x40000;        // 真似るカーネルが画面の絵を写す、装置の絵の置き場
    const KBASE = 0x70000;        // 真似るカーネルの機械語を置く場所
    const TF = 0x700;             // カーネルがレジスタを保存する場所
    const IO = 0x10000000;        // 装置の窓口（カーネルだけが読み書きできる）
    const MAXW = 256, MAXH = 192; // 1 枚の絵の大きさの上限
    const SYS = { write: 64, exit: 93, getpid: 172, present: 0x400, pointer: 0x401, frame: 0x402 };
    const hex = (v) => '0x' + (v >>> 0).toString(16).padStart(8, '0');
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // 文字列を UTF-8 のバイト列に（TextEncoder の無い所でも動くように自分で書く）
    function utf8(s) {
      const out = [];
      for (const ch of s) {
        const c = ch.codePointAt(0);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      return Uint8Array.from(out);
    }
    const fromUtf8 = (b) => decodeURIComponent(Array.from(b, (v) => '%' + v.toString(16).padStart(2, '0')).join(''));

    // ---- 2. 組み立て器（RV32IM のアセンブリを機械語にする） ----
    const REG = Object.create(null);
    ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
      's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6'].forEach((nm, i) => { REG[nm] = i; REG['x' + i] = i; });
    REG.fp = 8;

    // 文字列の外にある # から後ろを消す
    function stripComment(s) {
      let q = false;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '"' && s[i - 1] !== '\\') q = !q;
        else if (s[i] === '#' && !q) return s.slice(0, i);
      }
      return s;
    }
    // 引数をカンマで分ける（文字列の中のカンマは分けない）
    function splitArgs(s) {
      const out = [];
      let cur = '', q = false;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '"' && s[i - 1] !== '\\') q = !q;
        if (c === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += c;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    }
    // 式（数・名前・+ - * / とかっこ）を計算する。名前がまだ分からないときは undefined
    function evalExpr(src, sym, ln, strict) {
      const t = src.replace(/\s+/g, '');
      let i = 0;
      const bad = () => new Error(ln + ' 行: 式が読めない「' + src + '」');
      function prim() {
        if (t[i] === '-') { i++; const v = prim(); return v === undefined ? undefined : -v; }
        if (t[i] === '+') { i++; return prim(); }
        if (t[i] === '(') {
          i++;
          const v = sum();
          if (t[i] !== ')') throw bad();
          i++;
          return v;
        }
        const rest = t.slice(i);
        let mm = /^(0x[0-9a-fA-F]+|0b[01]+|\d+)/.exec(rest);
        if (mm) { i += mm[0].length; return Number(mm[0]); }
        mm = /^'(.)'/.exec(rest);
        if (mm) { i += 3; return mm[1].charCodeAt(0); }
        mm = /^[A-Za-z_.$][\w.$]*/.exec(rest);
        if (mm) {
          i += mm[0].length;
          if (mm[0] in sym) return sym[mm[0]];
          if (strict) throw new Error(ln + ' 行: 名前「' + mm[0] + '」が見つからない');
          return undefined;
        }
        throw bad();
      }
      function prod() {
        let v = prim();
        while (t[i] === '*' || t[i] === '/') {
          const op = t[i++], w = prim();
          v = v === undefined || w === undefined ? undefined : op === '*' ? v * w : Math.trunc(v / w);
        }
        return v;
      }
      function sum() {
        let v = prod();
        while (t[i] === '+' || t[i] === '-') {
          const op = t[i++], w = prod();
          v = v === undefined || w === undefined ? undefined : op === '+' ? v + w : v - w;
        }
        return v;
      }
      if (!t) throw bad();
      const v = sum();
      if (i !== t.length) throw bad();
      return v;
    }
    // 32 ビットの値を lui（上の 20 ビット）と addi（下の 12 ビット、符号付き）に分ける
    function hiLo(v) {
      v |= 0;
      const lo = (v << 20) >> 20;
      return [((v - lo) >>> 12) & 0xfffff, lo];
    }
    const encR = (f7, rs2, rs1, f3, rd, op) => ((f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0;
    const encI = (imm, rs1, f3, rd, op) => (((imm & 0xfff) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0;
    const encS = (imm, rs2, rs1, f3) => ((((imm >> 5) & 0x7f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((imm & 0x1f) << 7) | 0x23) >>> 0;
    const encB = (imm, rs2, rs1, f3) => ((((imm >> 12) & 1) << 31) | (((imm >> 5) & 0x3f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) |
      (((imm >> 1) & 0xf) << 8) | (((imm >> 11) & 1) << 7) | 0x63) >>> 0;
    const encU = (imm20, rd, op) => (((imm20 & 0xfffff) << 12) | (rd << 7) | op) >>> 0;
    const encJ = (imm, rd) => ((((imm >> 20) & 1) << 31) | (((imm >> 1) & 0x3ff) << 21) | (((imm >> 11) & 1) << 20) |
      (((imm >> 12) & 0xff) << 12) | (rd << 7) | 0x6f) >>> 0;
    const R_OPS = { add: [0, 0], sub: [0x20, 0], sll: [0, 1], slt: [0, 2], sltu: [0, 3], xor: [0, 4], srl: [0, 5], sra: [0x20, 5], or: [0, 6], and: [0, 7],
      mul: [1, 0], mulh: [1, 1], mulhsu: [1, 2], mulhu: [1, 3], div: [1, 4], divu: [1, 5], rem: [1, 6], remu: [1, 7] };
    const I_OPS = { addi: 0, slti: 2, sltiu: 3, xori: 4, ori: 6, andi: 7 };
    const SH_OPS = { slli: [0, 1], srli: [0, 5], srai: [0x20, 5] };
    const L_OPS = { lb: 0, lh: 1, lw: 2, lbu: 4, lhu: 5 };
    const S_OPS = { sb: 0, sh: 1, sw: 2 };
    const B_OPS = { beq: 0, bne: 1, blt: 4, bge: 5, bltu: 6, bgeu: 7 };
    // 2 つのレジスタを入れ替えて書く分岐の別名（bgt a, b → blt b, a）
    const B_SWAP = { bgt: 'blt', ble: 'bge', bgtu: 'bltu', bleu: 'bgeu' };
    // 0 と比べる分岐の別名
    const B_ZERO = { beqz: ['beq', 0], bnez: ['bne', 0], bltz: ['blt', 0], bgez: ['bge', 0], blez: ['bge', 1], bgtz: ['blt', 1] };

    function assemble(src, base) {
      const lines = src.split('\n');
      const sym = Object.create(null);
      const items = [];
      let pc = base, pending = [];
      const strArg = (a, ln) => {
        const mm = /^"(.*)"$/.exec(a || '');
        if (!mm) throw new Error(ln + ' 行: 文字列は "..." で書く');
        return utf8(JSON.parse('"' + mm[1] + '"'));
      };
      // 1 回目: 名前の番地を決める
      for (let k = 0; k < lines.length; k++) {
        const ln = k + 1;
        let s = stripComment(lines[k]).trim();
        let mm;
        while ((mm = /^([A-Za-z_.$][\w.$]*):/.exec(s))) {
          if (mm[1] in sym) throw new Error(ln + ' 行: 名前「' + mm[1] + '」が 2 回ある');
          sym[mm[1]] = pc;
          pending.push(mm[1]);
          s = s.slice(mm[0].length).trim();
        }
        if (!s) continue;
        const sp = s.search(/\s/);
        const op = (sp < 0 ? s : s.slice(0, sp)).toLowerCase();
        const args = splitArgs(sp < 0 ? '' : s.slice(sp));
        const it = { ln, op, args, addr: pc, size: 0, pad: 0 };
        if (op[0] === '.') {
          if (op === '.equ' || op === '.set') {
            const v = evalExpr(args[1] || '', sym, ln, true);
            sym[args[0]] = v;
            continue;
          }
          if (['.text', '.data', '.globl', '.global', '.section'].includes(op)) continue;
          if (op === '.align') { const a = 1 << evalExpr(args[0], sym, ln, true); it.size = (a - (pc % a)) % a; }
          else if (op === '.word') it.size = 4 * args.length;
          else if (op === '.half') it.size = 2 * args.length;
          else if (op === '.byte') it.size = args.length;
          else if (op === '.string' || op === '.asciz') it.size = strArg(args[0], ln).length + 1;
          else if (op === '.ascii') it.size = strArg(args[0], ln).length;
          else if (op === '.space' || op === '.zero') it.size = evalExpr(args[0], sym, ln, true);
          else throw new Error(ln + ' 行: 知らない指示「' + op + '」');
          if (op === '.align') pending = [];
        } else {
          // 命令は 4 の倍数の番地に置く。直前に付けた名前も一緒にずらす
          it.pad = (4 - (pc & 3)) & 3;
          pc += it.pad;
          for (const nm of pending) sym[nm] = pc;
          it.addr = pc;
          if (op === 'li') {
            const v = evalExpr(args[1] || '', sym, ln, false);
            it.size = v !== undefined && v >= -2048 && v <= 2047 ? 4 : 8;
          } else if (op === 'la') it.size = 8;
          else it.size = 4;
        }
        pending = [];
        pc += it.size;
        items.push(it);
      }
      // 2 回目: 機械語を書く
      const bytes = new Uint8Array(pc - base);
      const dv = new DataView(bytes.buffer);
      const words = [];
      for (const it of items) {
        const { ln, op, args } = it;
        let at = it.addr - base;
        const E = (a) => evalExpr(a || '', sym, ln, true);
        const R = (a) => {
          const r = REG[(a || '').trim()];
          if (r === undefined) throw new Error(ln + ' 行: レジスタ名「' + a + '」が分からない');
          return r;
        };
        const imm12 = (v) => {
          if (v < -2048 || v > 2047) throw new Error(ln + ' 行: 即値 ' + v + ' が 12 ビットに入らない');
          return v;
        };
        const mem = (a) => {
          const mm = /^(.*)\(\s*([\w]+)\s*\)$/.exec((a || '').trim());
          if (!mm) throw new Error(ln + ' 行: 番地は「ずれ(レジスタ)」で書く');
          return [mm[1].trim() ? imm12(E(mm[1])) : 0, R(mm[2])];
        };
        const nargs = (n) => { if (args.length !== n) throw new Error(ln + ' 行: ' + op + ' の引数は ' + n + ' つ'); };
        const put = (w) => { dv.setUint32(at, w, true); words.push({ addr: base + at, word: w, ln }); at += 4; };
        const branch = (f3, rs1, rs2, target) => {
          const off = E(target) - (base + at);
          if (off < -4096 || off > 4094 || off & 1) throw new Error(ln + ' 行: 分岐の行き先が遠すぎる');
          put(encB(off, rs2, rs1, f3));
        };
        const jal = (rd, target) => {
          const off = E(target) - (base + at);
          if (off < -(1 << 20) || off >= 1 << 20) throw new Error(ln + ' 行: 飛び先が遠すぎる');
          put(encJ(off, rd));
        };
        if (op[0] === '.') {
          if (op === '.word') args.forEach((a, i) => dv.setUint32(at + 4 * i, E(a) >>> 0, true));
          else if (op === '.half') args.forEach((a, i) => dv.setUint16(at + 2 * i, E(a) & 0xffff, true));
          else if (op === '.byte') args.forEach((a, i) => { bytes[at + i] = E(a) & 0xff; });
          else if (op === '.string' || op === '.asciz' || op === '.ascii') bytes.set(strArg(args[0], ln), at);
          continue;
        }
        if (op in R_OPS) { nargs(3); const [f7, f3] = R_OPS[op]; put(encR(f7, R(args[2]), R(args[1]), f3, R(args[0]), 0x33)); }
        else if (op in I_OPS) { nargs(3); put(encI(imm12(E(args[2])), R(args[1]), I_OPS[op], R(args[0]), 0x13)); }
        else if (op in SH_OPS) {
          nargs(3);
          const sh = E(args[2]);
          if (sh < 0 || sh > 31) throw new Error(ln + ' 行: ずらす量は 0〜31');
          const [f7, f3] = SH_OPS[op];
          put(encR(f7, sh, R(args[1]), f3, R(args[0]), 0x13));
        }
        else if (op in L_OPS) { nargs(2); const [off, rs1] = mem(args[1]); put(encI(off, rs1, L_OPS[op], R(args[0]), 0x03)); }
        else if (op in S_OPS) { nargs(2); const [off, rs1] = mem(args[1]); put(encS(off, R(args[0]), rs1, S_OPS[op])); }
        else if (op in B_OPS) { nargs(3); branch(B_OPS[op], R(args[0]), R(args[1]), args[2]); }
        else if (op in B_SWAP) { nargs(3); branch(B_OPS[B_SWAP[op]], R(args[1]), R(args[0]), args[2]); }
        else if (op in B_ZERO) {
          nargs(2);
          const [b, swap] = B_ZERO[op];
          if (swap) branch(B_OPS[b], 0, R(args[0]), args[1]); else branch(B_OPS[b], R(args[0]), 0, args[1]);
        }
        else if (op === 'lui' || op === 'auipc') { nargs(2); put(encU(E(args[1]), R(args[0]), op === 'lui' ? 0x37 : 0x17)); }
        else if (op === 'jal') { if (args.length === 1) jal(1, args[0]); else { nargs(2); jal(R(args[0]), args[1]); } }
        else if (op === 'jalr') {
          if (args.length === 1) put(encI(0, R(args[0]), 0, 1, 0x67));
          else if (args.length === 2) { const [off, rs1] = mem(args[1]); put(encI(off, rs1, 0, R(args[0]), 0x67)); }
          else { nargs(3); put(encI(imm12(E(args[2])), R(args[1]), 0, R(args[0]), 0x67)); }
        }
        else if (op === 'ecall') put(0x00000073);
        else if (op === 'mret') put(0x30200073);
        else if (op === 'nop') put(encI(0, 0, 0, 0, 0x13));
        else if (op === 'li') {
          nargs(2);
          const v = E(args[1]), rd = R(args[0]);
          if (v < -2147483648 || v > 4294967295) throw new Error(ln + ' 行: 値が 32 ビットに入らない');
          if (it.size === 4) put(encI(v, 0, 0, rd, 0x13));
          else { const [hi, lo] = hiLo(v); put(encU(hi, rd, 0x37)); put(encI(lo, rd, 0, rd, 0x13)); }
        }
        else if (op === 'la') {
          nargs(2);
          const rd = R(args[0]);
          const [hi, lo] = hiLo(E(args[1]) - (base + at));
          put(encU(hi, rd, 0x17)); put(encI(lo, rd, 0, rd, 0x13));
        }
        else if (op === 'mv') { nargs(2); put(encI(0, R(args[1]), 0, R(args[0]), 0x13)); }
        else if (op === 'not') { nargs(2); put(encI(-1, R(args[1]), 4, R(args[0]), 0x13)); }
        else if (op === 'neg') { nargs(2); put(encR(0x20, R(args[1]), 0, 0, R(args[0]), 0x33)); }
        else if (op === 'seqz') { nargs(2); put(encI(1, R(args[1]), 3, R(args[0]), 0x13)); }
        else if (op === 'snez') { nargs(2); put(encR(0, R(args[1]), 0, 3, R(args[0]), 0x33)); }
        else if (op === 'j') { nargs(1); jal(0, args[0]); }
        else if (op === 'call') { nargs(1); jal(1, args[0]); }
        else if (op === 'jr') { nargs(1); put(encI(0, R(args[0]), 0, 0, 0x67)); }
        else if (op === 'ret') put(encI(0, 1, 0, 0, 0x67));
        else throw new Error(ln + ' 行: 知らない命令「' + op + '」');
      }
      return { bytes, sym, words, base, entry: '_start' in sym ? sym._start : base, end: pc };
    }

    // ---- 3. 機械語を 1 行のアセンブリに戻す（表示用） ----
    const RN = Object.keys(REG).filter((k) => !/^x\d/.test(k) && k !== 'fp');
    function disasm(w, addr) {
      w |= 0;
      const op = w & 0x7f, rd = RN[(w >> 7) & 31], f3 = (w >> 12) & 7, rs1 = RN[(w >> 15) & 31], rs2 = RN[(w >> 20) & 31], f7 = w >>> 25;
      const iimm = w >> 20;
      const find = (tab, f) => Object.keys(tab).find((k) => f(tab[k]));
      if (w === 0x73) return 'ecall';
      if ((w >>> 0) === 0x30200073) return 'mret';
      if (op === 0x33) return find(R_OPS, (v) => v[0] === f7 && v[1] === f3) + ' ' + rd + ', ' + rs1 + ', ' + rs2;
      if (op === 0x13) {
        if (f3 === 1 || f3 === 5) return find(SH_OPS, (v) => v[1] === f3 && v[0] === (f7 & 0x20)) + ' ' + rd + ', ' + rs1 + ', ' + ((w >> 20) & 31);
        return find(I_OPS, (v) => v === f3) + ' ' + rd + ', ' + rs1 + ', ' + iimm;
      }
      if (op === 0x03) return find(L_OPS, (v) => v === f3) + ' ' + rd + ', ' + iimm + '(' + rs1 + ')';
      if (op === 0x23) return find(S_OPS, (v) => v === f3) + ' ' + rs2 + ', ' + (((w >> 25) << 5) | ((w >> 7) & 31)) + '(' + rs1 + ')';
      if (op === 0x63) {
        const off = ((w >> 31) << 12) | (((w >> 7) & 1) << 11) | (((w >> 25) & 0x3f) << 5) | (((w >> 8) & 0xf) << 1);
        return find(B_OPS, (v) => v === f3) + ' ' + rs1 + ', ' + rs2 + ', ' + hex(addr + off);
      }
      if (op === 0x37 || op === 0x17) return (op === 0x37 ? 'lui ' : 'auipc ') + rd + ', 0x' + (w >>> 12).toString(16);
      if (op === 0x6f) {
        const off = ((w >> 31) << 20) | (((w >> 12) & 0xff) << 12) | (((w >> 20) & 1) << 11) | (((w >> 21) & 0x3ff) << 1);
        return 'jal ' + rd + ', ' + hex(addr + off);
      }
      if (op === 0x67) return 'jalr ' + rd + ', ' + iimm + '(' + rs1 + ')';
      return '.word ' + hex(w);
    }

    // ---- 4. CPU（RV32IM を 1 命令ずつ真似る） ----
    function newMachine(prog, kernel, pid) {
      const buf = new ArrayBuffer(MEM);
      const m = {
        mem: new Uint8Array(buf), dv: new DataView(buf), w32: new Int32Array(buf), x: new Int32Array(32),
        pc: prog.entry, kmode: false, epc: 0, emu: !!kernel, pid,
        user: 0, kern: 0, sys: 0, halted: false, waiting: false, code: 0, fault: '',
      };
      if (prog.end > UHI) throw new Error('プログラムが大きすぎる');
      m.mem.set(prog.bytes, prog.base);
      if (kernel) m.mem.set(kernel.bytes, KBASE);
      m.x[2] = UHI - 16;
      return m;
    }
    const mulHigh = (a, b) => Number(BigInt.asIntN(32, (a * b) >> 32n));
    function inUser(a, len) { return a >= ULO && a + len <= UHI; }

    // JavaScript で書いたカーネル（unkernel の考え方。システムコールは普通の関数呼び出しになる）
    function nativeSyscall(m, dev) {
      const x = m.x, n = x[17];
      if (n === SYS.write) {
        const buf = x[11] >>> 0, len = x[12] >>> 0;
        if (!inUser(buf, len)) { x[10] = -14; return; }
        if (len) dev.write(m.mem.slice(buf, buf + len));
        x[10] = len;
      } else if (n === SYS.exit) { m.halted = true; m.code = x[10]; }
      else if (n === SYS.getpid) x[10] = m.pid;
      else if (n === SYS.present) {
        const fb = x[10] >>> 0, w = x[11], h = x[12];
        if (w <= 0 || h <= 0 || w > MAXW || h > MAXH) { x[10] = -22; return; }
        if (!inUser(fb, w * h * 4)) { x[10] = -14; return; }
        dev.present(m.mem.subarray(fb, fb + w * h * 4), w, h);
        x[10] = 0;
      } else if (n === SYS.pointer) {
        const p = dev.pointer();
        x[10] = p.x; x[11] = p.y; x[12] = p.b;
      } else if (n === SYS.frame) { m.waiting = true; x[10] = 0; }
      else x[10] = -38;
    }
    // 真似るカーネルが読む装置の窓口
    function ioRead(m, off, dev) {
      if (off === 0x08) return m.pid;
      if (off === 0x0c || off === 0x10 || off === 0x14) { const p = dev.pointer(); return off === 0x0c ? p.x : off === 0x10 ? p.y : p.b; }
      return 0;
    }
    function ioWrite(m, off, v, dev) {
      if (off === 0x00) dev.write(Uint8Array.of(v & 255));
      else if (off === 0x04) { m.halted = true; m.code = v; }
      else if (off === 0x18) { const w = v & 0xffff, h = v >>> 16; dev.present(m.mem.subarray(FBDEV, FBDEV + w * h * 4), w, h); }
      else if (off === 0x1c) m.waiting = true;
    }
    function Fault(msg) { this.msg = msg; }

    // budget 個までの命令を進める。止まった理由は m.halted・m.waiting・m.fault で分かる
    function run(m, budget, dev) {
      const x = m.x, mem = m.mem, dv = m.dv, w32 = m.w32, emu = m.emu;
      let pc = m.pc, kmode = m.kmode, n = 0, uc = 0, kc = 0, stop = false;
      const segv = (a, what) => new Fault('Segmentation fault（' + hex(a) + ' 番地を' + what + 'うとした）');
      try {
        while (n < budget && !stop) {
          if ((pc & 3) !== 0 || (kmode ? pc < KBASE || pc >= MEM : pc < ULO || pc >= UHI)) throw new Fault('Segmentation fault（' + hex(pc) + ' 番地の命令を実行しようとした）');
          const ins = w32[pc >> 2];
          n++;
          if (kmode) kc++; else uc++;
          const op = ins & 0x7f, rd = (ins >> 7) & 31, f3 = (ins >> 12) & 7, rs1 = (ins >> 15) & 31;
          let npc = pc + 4;
          switch (op) {
            case 0x33: {
              const a = x[rs1], b = x[(ins >> 20) & 31], f7 = ins >>> 25;
              let v = 0;
              if (f7 === 1) {
                switch (f3) {
                  case 0: v = Math.imul(a, b); break;
                  case 1: v = mulHigh(BigInt(a), BigInt(b)); break;
                  case 2: v = mulHigh(BigInt(a), BigInt(b >>> 0)); break;
                  case 3: v = mulHigh(BigInt(a >>> 0), BigInt(b >>> 0)); break;
                  case 4: v = b === 0 ? -1 : (a / b) | 0; break;
                  case 5: v = b === 0 ? -1 : Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
                  case 6: v = b === 0 ? a : (a % b) | 0; break;
                  default: v = b === 0 ? a : ((a >>> 0) % (b >>> 0)) | 0;
                }
              } else {
                switch (f3) {
                  case 0: v = f7 === 0x20 ? (a - b) | 0 : (a + b) | 0; break;
                  case 1: v = a << (b & 31); break;
                  case 2: v = a < b ? 1 : 0; break;
                  case 3: v = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
                  case 4: v = a ^ b; break;
                  case 5: v = f7 === 0x20 ? a >> (b & 31) : (a >>> (b & 31)) | 0; break;
                  case 6: v = a | b; break;
                  default: v = a & b;
                }
              }
              if (rd) x[rd] = v;
              break;
            }
            case 0x13: {
              const a = x[rs1], imm = ins >> 20;
              let v = 0;
              switch (f3) {
                case 0: v = (a + imm) | 0; break;
                case 1: v = a << (imm & 31); break;
                case 2: v = a < imm ? 1 : 0; break;
                case 3: v = (a >>> 0) < (imm >>> 0) ? 1 : 0; break;
                case 4: v = a ^ imm; break;
                case 5: v = (ins >>> 30) & 1 ? a >> (imm & 31) : (a >>> (imm & 31)) | 0; break;
                case 6: v = a | imm; break;
                default: v = a & imm;
              }
              if (rd) x[rd] = v;
              break;
            }
            case 0x03: {
              const ad = (x[rs1] + (ins >> 20)) >>> 0;
              let v = 0;
              if (kmode && ad >= IO) v = ioRead(m, ad - IO, dev) | 0;
              else {
                const size = f3 === 2 ? 4 : f3 === 1 || f3 === 5 ? 2 : 1;
                if (kmode ? ad + size > MEM : ad < ULO || ad + size > UHI) throw segv(ad, '読も');
                if (f3 === 2) v = ad & 3 ? dv.getInt32(ad, true) : w32[ad >> 2];
                else if (f3 === 0) v = (mem[ad] << 24) >> 24;
                else if (f3 === 1) v = dv.getInt16(ad, true);
                else if (f3 === 4) v = mem[ad];
                else if (f3 === 5) v = dv.getUint16(ad, true);
                else throw new Fault('知らない命令 ' + hex(ins));
              }
              if (rd) x[rd] = v;
              break;
            }
            case 0x23: {
              const ad = (x[rs1] + (((ins >> 25) << 5) | ((ins >> 7) & 31))) >>> 0, v = x[(ins >> 20) & 31];
              if (kmode && ad >= IO) { ioWrite(m, ad - IO, v, dev); if (m.halted || m.waiting) stop = true; }
              else {
                const size = f3 === 2 ? 4 : f3 === 1 ? 2 : 1;
                if (kmode ? ad + size > MEM : ad < ULO || ad + size > UHI) throw segv(ad, '書こ');
                if (f3 === 2) { if (ad & 3) dv.setInt32(ad, v, true); else w32[ad >> 2] = v; }
                else if (f3 === 0) mem[ad] = v;
                else if (f3 === 1) dv.setInt16(ad, v, true);
                else throw new Fault('知らない命令 ' + hex(ins));
              }
              break;
            }
            case 0x63: {
              const a = x[rs1], b = x[(ins >> 20) & 31];
              let t;
              switch (f3) {
                case 0: t = a === b; break;
                case 1: t = a !== b; break;
                case 4: t = a < b; break;
                case 5: t = a >= b; break;
                case 6: t = (a >>> 0) < (b >>> 0); break;
                case 7: t = (a >>> 0) >= (b >>> 0); break;
                default: throw new Fault('知らない命令 ' + hex(ins));
              }
              if (t) npc = (pc + (((ins >> 31) << 12) | (((ins >> 7) & 1) << 11) | (((ins >> 25) & 0x3f) << 5) | (((ins >> 8) & 0xf) << 1))) | 0;
              break;
            }
            case 0x37: if (rd) x[rd] = ins & 0xfffff000; break;
            case 0x17: if (rd) x[rd] = (pc + (ins & 0xfffff000)) | 0; break;
            case 0x6f:
              if (rd) x[rd] = pc + 4;
              npc = (pc + (((ins >> 31) << 20) | (((ins >> 12) & 0xff) << 12) | (((ins >> 20) & 1) << 11) | (((ins >> 21) & 0x3ff) << 1))) | 0;
              break;
            case 0x67: {
              const t = (x[rs1] + (ins >> 20)) & ~1;
              if (rd) x[rd] = pc + 4;
              npc = t;
              break;
            }
            case 0x73:
              if (ins === 0x73) {
                if (kmode) throw new Fault('カーネルの中で ecall を使った');
                m.sys++;
                if (emu) { m.epc = pc + 4; kmode = true; npc = KBASE; }
                else {
                  nativeSyscall(m, dev);
                  if (m.halted || m.waiting) stop = true;
                }
              } else if ((ins >>> 0) === 0x30200073 && kmode) { npc = m.epc; kmode = false; }
              else throw new Fault('知らない命令 ' + hex(ins));
              break;
            default: throw new Fault('知らない命令 ' + hex(ins) + '（' + hex(pc) + ' 番地）');
          }
          pc = npc;
        }
      } catch (err) {
        if (!(err instanceof Fault)) throw err;
        m.halted = true;
        m.fault = err.msg;
      }
      m.pc = pc; m.kmode = kmode; m.user += uc; m.kern += kc;
      return n;
    }

    // ---- 5. 命令ごとに真似るカーネル（JavaScript のカーネルと同じことを RISC-V の命令で書く） ----
    function kernelSource() {
      const save = [], load = [];
      for (let i = 1; i < 32; i++) {
        save.push('  sw x' + i + ', ' + (TF + 4 * i) + '(zero)');
        load.push('  lw x' + i + ', ' + (TF + 4 * i) + '(zero)');
      }
      return `# 命令ごとに真似るカーネル（QEMU のように、カーネルの仕事も 1 命令ずつ真似る）
# 利用者のプログラムが ecall を使うと、CPU はここへ飛ぶ
.equ TF, ${TF}
.equ ULO, ${ULO}
.equ UHI, ${UHI}
.equ FBDEV, ${FBDEV}
ktrap:
# 入口: 31 個のレジスタを全部保存する（Linux も入口で全部保存する）
${save.join('\n')}
  lui t6, ${IO >>> 12}           # 装置の窓口の番地
  li t0, 64
  beq a7, t0, k_write
  li t0, 172
  beq a7, t0, k_getpid
  li t0, 0x400
  beq a7, t0, k_present
  li t0, 0x401
  beq a7, t0, k_pointer
  li t0, 0x402
  beq a7, t0, k_frame
  li t0, 93
  beq a7, t0, k_exit
  li a0, -38                 # ENOSYS（知らない番号）
  j k_ret
k_getpid:
  lw a0, 8(t6)
  j k_ret
k_write:                     # a1 = 文字の番地、a2 = バイト数
  li t0, ULO
  bltu a1, t0, k_efault
  add t1, a1, a2
  bltu t1, a1, k_efault
  li t0, UHI
  bgtu t1, t0, k_efault
  mv t2, a1
  j kw_test
kw_loop:                     # 1 バイトずつ端末の窓口へ書く
  lbu t3, 0(t2)
  sb t3, 0(t6)
  addi t2, t2, 1
kw_test:
  bltu t2, t1, kw_loop
  mv a0, a2
  j k_ret
k_present:                   # a0 = 絵の番地、a1 = 幅、a2 = 高さ
  blez a1, k_einval
  blez a2, k_einval
  li t0, ${MAXW}
  bgt a1, t0, k_einval
  li t0, ${MAXH}
  bgt a2, t0, k_einval
  li t0, ULO
  bltu a0, t0, k_efault
  mul t1, a1, a2
  slli t1, t1, 2
  add t1, a0, t1
  bltu t1, a0, k_efault
  li t0, UHI
  bgtu t1, t0, k_efault
  li t3, FBDEV
  mv t2, a0
kp_loop:                     # 1 画素ずつ装置の絵の置き場へ写す
  lw t4, 0(t2)
  sw t4, 0(t3)
  addi t2, t2, 4
  addi t3, t3, 4
  bltu t2, t1, kp_loop
  slli t0, a2, 16
  or t0, t0, a1
  sw t0, 0x18(t6)            # 装置に「写し終えた」と知らせる
  li a0, 0
  j k_ret
k_pointer:                   # マウスの位置とボタン
  lw a0, 0x0c(t6)
  lw t0, 0x10(t6)
  sw t0, TF+44(zero)
  lw t0, 0x14(t6)
  sw t0, TF+48(zero)
  j k_ret
k_frame:                     # 次の画面の更新まで待つ
  sw zero, 0x1c(t6)
  li a0, 0
  j k_ret
k_exit:
  sw a0, 4(t6)
k_einval:
  li a0, -22
  j k_ret
k_efault:
  li a0, -14
k_ret:
  sw a0, TF+40(zero)
# 出口: 保存したレジスタを全部戻して、利用者のプログラムへ帰る
${load.join('\n')}
  mret
`;
    }

    // ---- 6. 利用者のプログラム（アセンブリ） ----
    const LIB = `
# ---- 共通の部品 ----
# print_str: a0 の番地から 0 のバイトまでを書く
print_str:
  mv t0, a0
ps_len:
  lbu t1, 0(t0)
  beqz t1, ps_go
  addi t0, t0, 1
  j ps_len
ps_go:
  sub a2, t0, a0
  mv a1, a0
  li a0, 1
  li a7, 64                  # write
  ecall
  ret
# print_num: a0 を 10 進数で書く
print_num:
  addi sp, sp, -32
  sw ra, 28(sp)
  addi t0, sp, 23
  sb zero, 0(t0)
  li t2, 10
pn_loop:
  addi t0, t0, -1
  remu t1, a0, t2
  addi t1, t1, 48
  sb t1, 0(t0)
  divu a0, a0, t2
  bnez a0, pn_loop
  mv a0, t0
  call print_str
  lw ra, 28(sp)
  addi sp, sp, 32
  ret
exit0:
  li a0, 0
  li a7, 93                  # exit
  ecall
`;
    const PROGRAMS = {
      hello: `# hello: あいさつとプロセス番号を書く
_start:
  la a0, msg1
  call print_str
  li a7, 172                 # getpid
  ecall
  call print_num
  la a0, msg2
  call print_str
  j exit0
msg1: .string "こんにちは。ブラウザの中の RISC-V の CPU で動いています。\\nわたしのプロセス番号は "
msg2: .string " です。\\n"
`,
      primes: `# primes: 30000 より小さい素数を、割り算を試して数える（計算ばかりで、システムコールはほとんど使わない）
.equ N, 30000
_start:
  la a0, msg1
  call print_str
  li s0, 2                   # 調べる数
  li s1, 0                   # 見つけた素数の数
  li s2, N
p_outer:
  bge s0, s2, p_done
  li t0, 2                   # 割る数
p_inner:
  mul t1, t0, t0
  bgt t1, s0, p_prime        # 割る数の 2 乗が超えたら素数
  rem t2, s0, t0
  beqz t2, p_next            # 割り切れたら素数ではない
  addi t0, t0, 1
  j p_inner
p_prime:
  addi s1, s1, 1
p_next:
  addi s0, s0, 1
  j p_outer
p_done:
  mv a0, s1
  call print_num
  la a0, msg2
  call print_str
  j exit0
msg1: .string "30000 より小さい素数を数えています。素数の数 = "
msg2: .string "\\n"
`,
      bench: `# bench: getpid を 20000 回呼ぶ（システムコールばかりのプログラム）
.equ N, 20000
_start:
  li s0, N
  li s1, 0
b_loop:
  li a7, 172                 # getpid
  ecall
  add s1, s1, a0
  addi s0, s0, -1
  bnez s0, b_loop
  la a0, msg1
  call print_str
  mv a0, s1
  call print_num
  la a0, msg2
  call print_str
  j exit0
msg1: .string "getpid を 20000 回呼びました（返った番号の合計 "
msg2: .string "）\\n"
`,
      eyes: `# eyes: マウスを目で追う。毎回、絵を全部描いてからカーネルに渡す
.equ W, 120
.equ H, 72
.equ R, 28                   # 白目の半径
.equ RO, 30                  # ふちを含めた半径
.equ PR, 9                   # 黒目の半径
.equ LIM, 16                 # 黒目が中心から動ける距離
.equ CY, 36
.equ CX1, 33
.equ CX2, 87
.equ BG, 0xff4a3a2b          # 色は 0xAABBGGRR
.equ RIM, 0xff1c1a18
.equ WHITE, 0xffeaf4f7
.equ PUPIL, 0xff2a2420
.equ HOT, 0xff3a46d8
_start:
e_loop:
  li a7, 0x401               # マウスの位置（この窓の画素で数える）
  ecall
  mv s4, a0
  mv s5, a1
  li s6, PUPIL
  beqz a2, e_clear
  li s6, HOT                 # ボタンを押している間は黒目を赤くする
e_clear:
  la t0, fb
  li t1, W*H*4
  add t1, t0, t1
  li t2, BG
e_clr:
  sw t2, 0(t0)
  addi t0, t0, 4
  bltu t0, t1, e_clr
  li a0, CX1
  li a1, CY
  call draw_eye
  li a0, CX2
  li a1, CY
  call draw_eye
  la a0, fb
  li a1, W
  li a2, H
  li a7, 0x400               # 描いた絵を画面へ
  ecall
  li a7, 0x402               # 次の画面の更新まで待つ
  ecall
  j e_loop

# draw_eye: a0 = 中心の x、a1 = 中心の y
draw_eye:
  addi sp, sp, -32
  sw ra, 28(sp)
  sw s0, 24(sp)
  sw s1, 20(sp)
  sw s2, 16(sp)
  sw s3, 12(sp)
  sw s7, 8(sp)
  sw s8, 4(sp)
  mv s0, a0
  mv s1, a1
  sub s2, s4, s0             # マウスまでの向き dx, dy
  sub s3, s5, s1
  mul t0, s2, s2
  mul t1, s3, s3
  add a0, t0, t1
  li t2, LIM*LIM
  ble a0, t2, de_in          # 近ければ黒目をマウスの位置へ
  call isqrt                 # 遠ければ長さ LIM にちぢめる
  li t2, LIM
  mul s2, s2, t2
  div s2, s2, a0
  mul s3, s3, t2
  div s3, s3, a0
de_in:
  add s2, s2, s0             # 黒目の中心
  add s3, s3, s1
  addi s7, s1, -RO           # y
de_row:
  addi t0, s1, RO
  bgt s7, t0, de_done
  bltz s7, de_nextrow
  li t1, H
  bge s7, t1, de_done
  sub t2, s7, s1
  mul t2, t2, t2             # (y - 中心)^2
  sub t3, s7, s3
  mul t3, t3, t3             # (y - 黒目)^2
  li t4, W*4
  mul t4, t4, s7
  la t5, fb
  add t4, t4, t5             # この行の始まりの番地
  addi s8, s0, -RO           # x
de_col:
  addi t0, s0, RO
  bgt s8, t0, de_nextrow
  bltz s8, de_nextcol
  li t1, W
  bge s8, t1, de_nextrow
  sub t5, s8, s0
  mul t5, t5, t5
  add t5, t5, t2
  li t6, RO*RO
  bgt t5, t6, de_nextcol     # 目の外は描かない
  li a1, RIM
  li t6, R*R
  bgt t5, t6, de_put         # ふち
  sub a2, s8, s2
  mul a2, a2, a2
  add a2, a2, t3
  li a1, WHITE
  li t6, PR*PR
  bgt a2, t6, de_put         # 白目
  mv a1, s6                  # 黒目
de_put:
  slli t6, s8, 2
  add t6, t6, t4
  sw a1, 0(t6)
de_nextcol:
  addi s8, s8, 1
  j de_col
de_nextrow:
  addi s7, s7, 1
  j de_row
de_done:
  lw ra, 28(sp)
  lw s0, 24(sp)
  lw s1, 20(sp)
  lw s2, 16(sp)
  lw s3, 12(sp)
  lw s7, 8(sp)
  lw s8, 4(sp)
  addi sp, sp, 32
  ret

# isqrt: a0 の平方根の整数部分（ニュートン法）
isqrt:
  mv t0, a0
  addi t1, a0, 1
  srli t1, t1, 1
is_loop:
  bgeu t1, t0, is_done
  mv t0, t1
  divu t2, a0, t0
  add t1, t0, t2
  srli t1, t1, 1
  j is_loop
is_done:
  mv a0, t0
  ret

.align 2
fb: .space W*H*4
`,
      crash: `# crash: 0 番地を読もうとする（カーネルが止める）
_start:
  la a0, msg1
  call print_str
  li t0, 0
  lw a0, 0(t0)
  j exit0
msg1: .string "0 番地を読んでみます……\\n"
`,
    };
    // 名前からプログラムを組み立てる（共通の部品をつなげる）。一度組み立てたものは使い回す
    const BUILT = {};
    function build(name) {
      if (!(name in PROGRAMS)) throw new Error('プログラム「' + name + '」は無い');
      if (!BUILT[name]) BUILT[name] = assemble(PROGRAMS[name] + LIB, ULO);
      return BUILT[name];
    }
    let KERNEL = null;
    function kernelImage() {
      if (!KERNEL) KERNEL = assemble(kernelSource(), KBASE);
      return KERNEL;
    }
    // 端末なしで最後まで動かす（試験と比べる表で使う）
    function runToEnd(name, emu, opts) {
      const o = opts || {};
      const out = [];
      const frames = [];
      const dev = {
        write: (b) => { for (const v of b) out.push(v); },
        present: (px, w, h) => { frames.push({ w, h, sum: px.reduce((s, v, i) => (s + v * ((i % 251) + 1)) % 1000000007, 0) }); },
        pointer: () => (o.pointer ? o.pointer(frames.length) : { x: 0, y: 0, b: 0 }),
      };
      const m = newMachine(build(name), emu ? kernelImage() : null, o.pid || 1);
      const maxFrames = o.frames || 0;
      let guard = 0;
      const t0 = now();
      while (!m.halted && guard++ < 10000) {
        run(m, 1e6, dev);
        if (m.waiting) {
          m.waiting = false;
          if (frames.length >= maxFrames) break;
        }
      }
      const ms = now() - t0;
      return { m, ms, text: fromUtf8(out), frames };
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const thumb = !!window.THUMB;
    if (thumb) document.documentElement.classList.add('thumb');
    const desk = $('desk'), termEl = $('term'), outEl = $('out'), form = $('form'), cmdIn = $('cmd'), liveEl = $('live');
    const nf = new Intl.NumberFormat('ja-JP');
    const fmt = (v) => nf.format(Math.round(v));
    const fmtMs = (ms) => (ms < 10 ? ms.toFixed(2) : ms < 100 ? ms.toFixed(1) : Math.round(ms)) + ' ms';
    let kmode = 'native';
    const procs = [];
    const queue = [];
    const hist = [];
    let histAt = 0, nextPid = 2, fgProc = null, zTop = 10, winCount = 0, pending = '', comparing = false;
    const ptr = { cx: NaN, cy: NaN, b: 0 };
    const acc = { user: 0, kern: 0, sys: 0, t: 0 };

    // ---- 端末への出力（1 回の更新でまとめて書く） ----
    function say(s) { pending += s; }
    function flush() {
      if (!pending) return;
      outEl.append(pending);
      pending = '';
      if (outEl.textContent.length > 40000) outEl.textContent = outEl.textContent.slice(-30000);
      termEl.scrollTop = termEl.scrollHeight;
    }
    function announce(s) {
      liveEl.textContent = s;
      setTimeout(() => { if (liveEl.textContent === s) liveEl.textContent = ''; }, 1200);
    }
    function syncPrompt() { form.classList.toggle('busy', !!fgProc); }
    const modeName = (emu) => (emu ? '真似る' : 'そのまま');

    // ---- プロセスを作る ----
    function spawn(nm, bg) {
      let prog;
      try { prog = build(nm); } catch (err) { say('組み立てに失敗: ' + err.message + '\n'); return; }
      const emu = kmode === 'emu';
      const pid = nextPid++;
      const m = newMachine(prog, emu ? kernelImage() : null, pid);
      const p = { pid, nm, m, emu, bg, win: null, ms: 0, frames: 0, mark: { user: 0, kern: 0, frames: 0, ms: 0 } };
      const bytes = [];
      p.flushText = () => {
        // UTF-8 の途中で切れたバイトは次の書き込みまで持ち越す
        let end = bytes.length, back = 0;
        while (end - back - 1 >= 0 && back < 3 && (bytes[end - back - 1] & 0xc0) === 0x80) back++;
        const lead = bytes[end - back - 1];
        const need = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
        if (back + 1 < need) end -= back + 1;
        if (end <= 0) return;
        let s;
        try { s = fromUtf8(bytes.slice(0, end)); } catch { s = '?'; }
        bytes.splice(0, end);
        say(s);
      };
      p.dev = {
        write: (b) => { for (const v of b) bytes.push(v); },
        present: (px, w, h) => present(p, px, w, h),
        pointer: () => pointerFor(p),
      };
      procs.push(p);
      if (bg) say('[' + pid + '] ' + nm + ' を起動（カーネル: ' + modeName(emu) + '）\n');
      else fgProc = p;
      syncPrompt();
    }
    function finish(p, why) {
      const i = procs.indexOf(p);
      if (i >= 0) procs.splice(i, 1);
      p.flushText();
      if (p.win) { p.win.el.remove(); p.win = null; }
      const m = p.m;
      if (m.fault) say('[' + p.pid + '] ' + m.fault + '\n');
      say('[' + p.pid + ' ' + p.nm + '・' + modeName(p.emu) + '] ' + why + '。利用者の命令 ' + fmt(m.user) + '・カーネルで真似た命令 ' + fmt(m.kern) +
        '・システムコール ' + fmt(m.sys) + ' 回・CPU ' + fmtMs(p.ms) + '\n');
      if (fgProc === p) fgProc = null;
      syncPrompt();
    }

    // ---- 窓（プログラムが描いた絵を端末の上に浮かべる） ----
    function place(win, x, y) {
      const mx = Math.max(0, desk.clientWidth - win.offsetWidth), my = Math.max(0, desk.clientHeight - win.offsetHeight);
      win.style.left = Math.max(0, Math.min(x, mx)) + 'px';
      win.style.top = Math.max(0, Math.min(y, my)) + 'px';
    }
    function openWin(p, w, h) {
      const win = document.createElement('section');
      win.className = 'win';
      win.setAttribute('aria-label', p.nm + ' の窓（pid ' + p.pid + '）');
      const tb = document.createElement('div');
      tb.className = 'tb';
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'grip';
      grip.setAttribute('aria-label', p.nm + ' の窓の取っ手。矢印キーでも動かせる');
      const ttl = document.createElement('span');
      ttl.textContent = p.nm + ' — pid ' + p.pid;
      const tag = document.createElement('span');
      tag.className = 'tag' + (p.emu ? ' emu' : '');
      tag.textContent = 'カーネル: ' + modeName(p.emu);
      grip.append(ttl, tag);
      const xb = document.createElement('button');
      xb.type = 'button';
      xb.className = 'x';
      xb.textContent = '×';
      xb.setAttribute('aria-label', 'pid ' + p.pid + ' の ' + p.nm + ' を閉じる');
      tb.append(grip, xb);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.style.aspectRatio = w + ' / ' + h;
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', p.nm === 'eyes' ? 'マウスの方を見る 2 つの目' : p.nm + ' が描いた絵');
      const st = document.createElement('div');
      st.className = 'wst';
      st.textContent = '1 コマの命令を数えています';
      win.append(tb, cv, st);
      win.style.zIndex = ++zTop;
      desk.append(win);
      const k = winCount++ % 5;
      place(win, desk.clientWidth - win.offsetWidth - 14 - k * 26, 14 + k * 24);
      let ox = 0, oy = 0;
      grip.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const r = win.getBoundingClientRect();
        ox = e.clientX - r.left; oy = e.clientY - r.top;
        grip.setPointerCapture(e.pointerId);
      });
      grip.addEventListener('pointermove', (e) => {
        if (!grip.hasPointerCapture(e.pointerId)) return;
        grip.classList.add('dragging');
        const d = desk.getBoundingClientRect();
        place(win, e.clientX - ox - d.left - desk.clientLeft, e.clientY - oy - d.top - desk.clientTop);
      });
      grip.addEventListener('lostpointercapture', () => grip.classList.remove('dragging'));
      grip.addEventListener('keydown', (e) => {
        const dirs = { ArrowLeft: [-15, 0, '左'], ArrowRight: [15, 0, '右'], ArrowUp: [0, -15, '上'], ArrowDown: [0, 15, '下'] };
        const d = dirs[e.key];
        if (!d) return;
        e.preventDefault();
        place(win, win.offsetLeft + d[0], win.offsetTop + d[1]);
        announce(p.nm + ' の窓を' + d[2] + 'へ動かした');
      });
      win.addEventListener('pointerdown', () => { win.style.zIndex = ++zTop; });
      xb.addEventListener('click', () => {
        if (procs.includes(p)) { finish(p, '窓を閉じたので止めた'); flush(); }
      });
      const g = cv.getContext('2d');
      p.win = { el: win, cv, g, img: g.createImageData(w, h), st };
    }
    function present(p, px, w, h) {
      if (!p.win) openWin(p, w, h);
      const W = p.win;
      if (W.cv.width !== w || W.cv.height !== h) {
        W.cv.width = w; W.cv.height = h;
        W.cv.style.aspectRatio = w + ' / ' + h;
        W.img = W.g.createImageData(w, h);
      }
      W.img.data.set(px);
      W.g.putImageData(W.img, 0, 0);
      p.frames++;
    }
    // マウスの位置を、その窓の絵の画素で数えて返す
    function pointerFor(p) {
      if (!p.win) return { x: 60, y: 200, b: 0 };
      const r = p.win.cv.getBoundingClientRect();
      let cx = ptr.cx, cy = ptr.cy;
      if (thumb) {
        const t = performance.now() / 1000, d = desk.getBoundingClientRect();
        cx = d.left + d.width * (0.5 + 0.45 * Math.cos(t * 1.3));
        cy = d.top + d.height * (0.5 + 0.42 * Math.sin(t * 1.9));
      } else if (Number.isNaN(cx)) { cx = r.left + r.width * 0.3; cy = r.bottom + r.height; }
      const sx = p.win.cv.width / Math.max(1, r.width), sy = p.win.cv.height / Math.max(1, r.height);
      const clampI = (v) => Math.max(-4000, Math.min(4000, Math.round(v)));
      return { x: clampI((cx - r.left) * sx), y: clampI((cy - r.top) * sy), b: ptr.b };
    }
    document.addEventListener('pointermove', (e) => { ptr.cx = e.clientX; ptr.cy = e.clientY; });
    document.addEventListener('pointerdown', (e) => { ptr.cx = e.clientX; ptr.cy = e.clientY; if (e.button === 0) ptr.b = 1; });
    document.addEventListener('pointerup', () => { ptr.b = 0; });
    document.addEventListener('pointercancel', () => { ptr.b = 0; });

    // ---- 2 つのカーネルの速さを比べる ----
    async function compare() {
      if (comparing) { say('いま比べています。\n'); return; }
      comparing = true;
      say('bench と primes を、2 つのカーネルで 3 回ずつ動かします（端末の外で動かし、時間だけを測る）……\n');
      flush();
      const rows = [];
      for (const nm of ['bench', 'primes']) {
        const best = { native: Infinity, emu: Infinity }, info = {};
        for (let k = 0; k < 3; k++) {
          for (const emu of [false, true]) {
            await new Promise((r) => setTimeout(r, 0));
            const r = runToEnd(nm, emu);
            const key = emu ? 'emu' : 'native';
            best[key] = Math.min(best[key], r.ms);
            info[key] = r.m;
          }
        }
        rows.push({ nm, best, info });
      }
      const body = $('cmpBody');
      body.replaceChildren();
      for (const r of rows) {
        const tr = document.createElement('tr');
        const ratio = r.best.emu / Math.max(1e-6, r.best.native);
        const per = (key) => (r.best[key] * 1e6) / Math.max(1, r.info[key].sys);
        const cells = [
          ['th', r.nm],
          ['td', fmt(r.info.native.sys) + ' 回'],
          ['td', fmtMs(r.best.native) + (r.nm === 'bench' ? '（1 回 ' + fmt(per('native')) + ' ns）' : '')],
          ['td', fmtMs(r.best.emu) + '・' + ratio.toFixed(1) + ' 倍' + (r.nm === 'bench' ? '（1 回 ' + fmt(per('emu')) + ' ns）' : ''), 'emu'],
          ['td', fmt(r.info.emu.kern) + ' 命令'],
        ];
        for (const [tag, text, cls] of cells) {
          const c = document.createElement(tag);
          if (tag === 'th') c.scope = 'row';
          if (cls) c.className = cls;
          c.textContent = text;
          tr.append(c);
        }
        body.append(tr);
        say(r.nm.padEnd(7) + 'そのまま ' + fmtMs(r.best.native) + ' ／ 真似る ' + fmtMs(r.best.emu) + '（' + ratio.toFixed(1) + ' 倍）。真似たカーネルの命令 ' +
          fmt(r.info.emu.kern) + '、利用者の命令 ' + fmt(r.info.emu.user) + '\n');
      }
      $('cmp').hidden = false;
      say('システムコールばかりの bench では差が大きく、計算ばかりの primes ではほとんど差が無い。\n');
      comparing = false;
    }

    // ---- 端末の命令 ----
    const HELP = [
      'hello          あいさつとプロセス番号を書く',
      'primes         30000 より小さい素数を数える（計算ばかり）',
      'bench          getpid を 20000 回呼ぶ（システムコールばかり）',
      'eyes &         マウスを目で追う窓を開く（& を付けると端末をすぐ返す）',
      'crash          0 番地を読んでカーネルに止められる',
      'compare        bench と primes を 2 つのカーネルで動かして時間を比べる',
      'mode emu       これから起動するプログラムのカーネルを「真似る」にする（mode native で戻す）',
      'ls             プログラムの一覧',
      'cat 名前.s     アセンブリを見る（kernel.s は真似るカーネル、lib.s は共通の部品）',
      'objdump 名前   組み立てた機械語を見る',
      'ps / kill 番号 / clear',
    ].join('\n');
    function exec(line) {
      const s = line.trim();
      if (!s) return;
      if (fgProc) { say('（pid ' + fgProc.pid + ' の ' + fgProc.nm + ' が動いています。Ctrl+C で止めるか、終わるのを待つ）\n'); return; }
      const bg = /&\s*$/.test(s);
      const parts = s.replace(/&\s*$/, '').trim().split(/\s+/);
      const c = parts[0], arg = parts[1] || '';
      if (c in PROGRAMS) { spawn(c, bg); return; }
      if (c === 'help') say(HELP + '\n');
      else if (c === 'ls') say(Object.keys(PROGRAMS).map((k) => k + '.s').join('  ') + '  lib.s  kernel.s\n');
      else if (c === 'cat') {
        const k = arg.replace(/\.s$/, '');
        if (k === 'kernel') say(kernelSource());
        else if (k === 'lib') say(LIB.replace(/^\n/, ''));
        else if (k in PROGRAMS) say(PROGRAMS[k]);
        else say('cat: ' + (arg || '名前') + ': そのようなファイルはありません\n');
      } else if (c === 'objdump') {
        const k = arg.replace(/\.s$/, '');
        let img = null;
        try { img = k === 'kernel' ? kernelImage() : build(k); } catch { img = null; }
        if (!img) { say('objdump: ' + (arg || '名前') + ' が分かりません（例: objdump hello）\n'); return; }
        const src = (k === 'kernel' ? kernelSource() : PROGRAMS[k] + LIB).split('\n');
        const lim = 48;
        for (const w of img.words.slice(0, lim)) {
          say(w.addr.toString(16).padStart(8, '0') + ':  ' + w.word.toString(16).padStart(8, '0') + '   ' + disasm(w.word, w.addr).padEnd(28) + '# ' + src[w.ln - 1].trim() + '\n');
        }
        say(img.words.length > lim ? '…（命令は全部で ' + img.words.length + ' 個。データを含めて ' + fmt(img.bytes.length) + ' バイト）\n' : '（' + fmt(img.bytes.length) + ' バイト）\n');
      } else if (c === 'ps') {
        say('  PID  名前     カーネル  状態        利用者の命令 ／ カーネルで真似た命令\n');
        for (const p of procs) {
          say(String(p.pid).padStart(5) + '  ' + p.nm.padEnd(8) + ' ' + modeName(p.emu).padEnd(6, '　') + '  ' + (p.m.waiting ? '画面の更新待ち' : '実行中').padEnd(7, '　') + ' ' + fmt(p.m.user) + ' ／ ' + fmt(p.m.kern) + '\n');
        }
        if (!procs.length) say('（動いているプロセスはありません）\n');
      } else if (c === 'kill') {
        const p = procs.find((q) => q.pid === Number(arg));
        if (p) finish(p, 'kill で止めた'); else say('kill: (' + arg + ') - そのようなプロセスはありません\n');
      } else if (c === 'mode') {
        if (arg === 'emu' || arg === 'native') setMode(arg, true);
        else say('いまのカーネル: ' + modeName(kmode === 'emu') + '（mode native か mode emu で切り替える）\n');
      } else if (c === 'compare') compare();
      else if (c === 'clear') { outEl.textContent = ''; pending = ''; }
      else say('sh: ' + c + ': そのような命令はありません（help で一覧）\n');
    }
    function setMode(v, fromTerm) {
      kmode = v;
      for (const r of document.querySelectorAll('input[name="km"]')) r.checked = r.value === v;
      say((fromTerm ? '' : '（カーネルを切り替えた）') + 'これから起動するプログラムのカーネルは「' + modeName(v === 'emu') + '」です。動いているプログラムはそのまま。\n');
    }
    function submit(line) {
      say('$ ' + line + '\n');
      if (line.trim()) { hist.push(line); histAt = hist.length; }
      exec(line);
      flush();
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = cmdIn.value;
      cmdIn.value = '';
      submit(v);
    });
    cmdIn.addEventListener('keydown', (e) => {
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && cmdIn.selectionStart === cmdIn.selectionEnd) {
        e.preventDefault();
        say('$ ' + cmdIn.value + '^C\n');
        cmdIn.value = '';
        if (fgProc) finish(fgProc, 'Ctrl+C で止めた');
        flush();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (!hist.length) return;
        e.preventDefault();
        histAt = Math.max(0, Math.min(hist.length, histAt + (e.key === 'ArrowUp' ? -1 : 1)));
        cmdIn.value = hist[histAt] || '';
      }
    });
    termEl.addEventListener('click', () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) cmdIn.focus({ preventScroll: true });
    });
    for (const b of document.querySelectorAll('#cmds button')) b.addEventListener('click', () => submit(b.dataset.cmd));
    for (const r of document.querySelectorAll('input[name="km"]')) r.addEventListener('change', () => { if (r.checked) { setMode(r.value, false); flush(); } });

    // ---- 毎回の画面の更新で、各プロセスを少しずつ進める ----
    function updateStats(t) {
      const dt = (t - acc.t) / 1000;
      if (dt < 0.5) return;
      $('sU').textContent = fmt(acc.user / dt);
      $('sK').textContent = fmt(acc.kern / dt);
      $('sS').textContent = fmt(acc.sys / dt);
      $('sP').textContent = String(procs.length);
      $('sPm').textContent = procs.length ? procs.map((p) => p.nm + '（' + modeName(p.emu) + '）').join('・') : '-';
      acc.user = 0; acc.kern = 0; acc.sys = 0; acc.t = t;
      for (const p of procs) {
        if (!p.win) continue;
        const k = p.mark, df = p.frames - k.frames;
        if (df > 0) {
          p.win.st.textContent = '1 コマの命令: 利用者 ' + fmt((p.m.user - k.user) / df) + '・カーネル ' + fmt((p.m.kern - k.kern) / df) + '。CPU ' + fmtMs((p.ms - k.ms) / df);
        }
        p.mark = { user: p.m.user, kern: p.m.kern, frames: p.frames, ms: p.ms };
      }
    }
    function tick(t) {
      if (!fgProc && queue.length && !comparing) submit(queue.shift());
      const list = procs.slice();
      const share = 10 / Math.max(1, list.length);
      for (const p of list) {
        const m = p.m;
        if (m.waiting) m.waiting = false;
        const u0 = m.user, k0 = m.kern, s0 = m.sys;
        const t0 = performance.now();
        try {
          do { run(m, 100000, p.dev); } while (!m.halted && !m.waiting && performance.now() - t0 < share);
        } catch (err) {
          m.halted = true;
          m.fault = '計算機の真似が止まった: ' + ((err && err.message) || err);
        }
        p.ms += performance.now() - t0;
        acc.user += m.user - u0; acc.kern += m.kern - k0; acc.sys += m.sys - s0;
        p.flushText();
        if (m.halted) finish(p, m.fault ? 'カーネルが止めた' : '終わった（終了コード ' + m.code + '）');
      }
      updateStats(t);
      flush();
      requestAnimationFrame(tick);
    }
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { for (const p of procs) if (p.win) place(p.win.el, p.win.el.offsetLeft, p.win.el.offsetTop); }).observe(desk);
    }

    say('RISC-V（RV32IM）の小さな計算機を起動しました。1 つのプロセスに 512 KiB の記憶があります。\n' +
      'カーネル（システムコールの処理）は JavaScript で動き、利用者のプログラムだけを 1 命令ずつ真似ます。help で命令の一覧を出します。\n\n');
    queue.push('hello', 'eyes &');
    flush();
    requestAnimationFrame((t) => { acc.t = t; tick(t); });
  },
});

dekiru.add({
  id: 'tr-20261125-matmul-rank', c: 'trend', lv: 3, date: '2026-11-25',
  t: '行列の掛け算を少ない回数で済ませるやり方をブラウザが自分で探し、回数から計算量の指数を出す（行列の積の指数は 9/4 という OpenAI の論文）',
  y: 'ぎょうれつのかけざんをすくないかいすうですませるやりかたをぶらうざがじぶんでさがし かいすうからけいさんりょうのしすうをだす',
  tags: ['行列の積の指数', 'Strassen のアルゴリズム', 'テンソル分解', '交互最小二乗法', 'Canvas'],
  d: '2026年11月24日、OpenAI は数学の成果を置く GitHub のリポジトリ openai/math に、論文「The matrix multiplication exponent is nine fourths」を公開した。2 つの n×n の行列を掛ける計算の回数が n の何乗で増えるかを表す指数 ω が、どの体でもちょうど 9/4（2.25）だと主張している。上界の 9/4 は、10月2日に同じ OpenAI の論文が複素数の場合で示し、その後ほかの研究者がどの体でも成り立つことを示した。今回の論文は下界を示したもので、n×n の掛け算を「足し算で作った 2 つの値の積」を組み合わせて行う（双線形の計算）と、どの n でも少なくとも n^(9/4) 回の掛け算が要るという。25 日の Hacker News では掲載から約 2 時間で 153 点になり、OpenAI の Sebastien Bubeck さんは X に、これまで下界は何も知られていなかったと書いた（いいね 731 件）。まだ第三者による確認は済んでいない。この見本は、その土台にある考え方を 3 つの部分で動かす。1 つ目は Strassen（1969 年）のやり方で、2×2 の積を 8 回ではなく 7 回の掛け算で求める。大きな行列では、このブラウザでの時間も測る。2 つ目では、行列の積を表す 0 と 1 の 3 次元の表（テンソル）を r 個の積の和に分ける計算を、乱数から何度も始める交互最小二乗法で行い、少ない回数のやり方をブラウザが自分で探す。2×2 では r = 7 で誤差がほぼ 0 になる始めがあり、係数を −1・0・1 に丸めても正確なまま残れば、Strassen と同じ 7 回のやり方が見つかったことになる。r = 6 では誤差が 0 に近づかない（2×2 は 7 回より減らせないことが知られている）。3 つ目では、n×n を r 回で掛けられれば指数は log_n r 以下になるという式を計算し、論文の下界 n^(9/4) と、小さな n で知られている回数を並べる。再現していない所: 論文の証明（テンソルの網の圧縮と、いくつかの単語の並びに同じ単語が無いかを調べる計算の下界）は扱っていない。指数 9/4 に届くやり方も作れない。10 月の論文も、具体的な大きさで速いやり方は示していないと書いている。探す計算は 2×2 と 2×2×3 だけにした。3×3 の 23 回（Laderman、1976 年）は、この簡単な探し方では見つからなかった。',
  p: '掛け算の回数は、行列の積を表す 3 次元の表（テンソル）を何個の「3 つの列の積」の和に分けられるか（ランク）と同じになる。U・V・W の t 列目が掛け算 M_t の作り方で、表の全部のマスで Σ_t U[a][t]·V[b][t]·W[c][t] が 0 か 1 に一致すれば、どんな A・B でも正しい積が出る。交互最小二乗法では、V と W を固定すると U の式が一次になるので、r×r の連立一次方程式（係数の行列は (VᵀV)∘(WᵀW)）を 1 つ解けば U の一番よい値が決まる。これを U→V→W の順に繰り返す。誤差がほぼ 0 になったら、係数を −1・0・1 へ少しずつ引き寄せる項を足して解き直し、丸めても誤差が 0 のままなら正確なやり方として採る。n×n を r 回で掛けられれば、N×N の行列を n×n の塊に分けて同じやり方を k 回重ねられ、N = n^k のとき掛け算は r^k = N^(log_n r) 回になる。指数を 9/4 より下げるには、どこかの n で r < n^(9/4) のやり方が要るが、今回の論文はそれが無いと主張している。',
  refs: [
    { title: 'OpenAI「The matrix multiplication exponent is nine fourths」（2026-11-24。下界を示した論文、PDF）', url: 'https://github.com/openai/math/blob/main/preprints/The-matrix-multiplication-exponent-is-nine-fourths-November-24-2026/paper.pdf' },
    { title: 'OpenAI「An Upper Bound of 9/4 for the Matrix Multiplication Exponent」（2026-10-02。上界を示した論文、PDF）', url: 'https://github.com/openai/math/blob/main/preprints/Matrix-Multiplication-Nine-Fourths-October-2-2026/paper.pdf' },
    { title: 'Hacker News: Matrix Multiplication is Θ(n^2.25)（2026-11-25）', url: 'https://news.ycombinator.com/item?id=50637220' },
    { title: 'Sebastien Bubeck さんの X の投稿（2026-11-25、上界の次に下界が示されたことの紹介）', url: 'https://x.com/SebastienBubeck/status/2125402576145572334' },
  ],
  html: `<div class="app">
  <section class="sec" id="s1" aria-labelledby="s1h">
    <h2 id="s1h">1. 2×2 の行列を 7 回の掛け算で掛ける（Strassen、1969 年）</h2>
    <p class="lead">そのまま掛けると、A の行と B の列の組ごとに 2 回ずつ、合わせて 8 回の掛け算が要る。Strassen は足し算と引き算を増やす代わりに、掛け算を 7 回に減らした。</p>
    <div class="mats" id="s1mats"></div>
    <div class="s1cols">
      <ol class="eqs" id="s1prods" aria-label="7 回の掛け算"></ol>
      <ul class="eqs" id="s1outs" aria-label="7 つの積から C を組み立てる"></ul>
    </div>
    <p class="cnt" id="s1cnt"></p>
    <div class="ctl">
      <button type="button" id="s1shuffle">数を変える</button>
      <button type="button" id="s1bench">大きな行列で時間を比べる</button>
      <span class="mut" id="s1bst" aria-live="polite"></span>
    </div>
    <div class="tblwrap" id="s1tbl" hidden>
      <table>
        <caption>乱数の実数の行列で 2 回ずつ測り、速かった方の時間。Strassen は 64×64 まで分けたら、そこからはそのまま掛ける</caption>
        <thead><tr><th scope="col">大きさ</th><th scope="col">そのまま: 掛け算</th><th scope="col">時間</th><th scope="col">Strassen: 掛け算</th><th scope="col">時間</th><th scope="col">時間の比</th><th scope="col">答えの差</th></tr></thead>
        <tbody id="s1tbody"></tbody>
      </table>
    </div>
  </section>

  <section class="sec" id="s2" aria-labelledby="s2h">
    <h2 id="s2h">2. 少ない回数のやり方をブラウザが探す</h2>
    <p class="lead">2×2 の積は、A の 4 個 × B の 4 個 × C の 4 個 = 64 マスの表で表せる。A の (i, j) と B の (j, l) の積が C の (i, l) に足されるマスだけが 1 になる。この表を r 個の「A の係数の列 × B の係数の列 × C の係数の列」の和にちょうど分けられれば、掛け算 r 回のやり方になる。乱数から始め、3 つの係数の表を 1 つずつ最小二乗法で直すことを繰り返す（交互最小二乗法）。</p>
    <div class="ctl">
      <label>大きさ <select id="s2size"><option value="2,2,2">2×2 と 2×2</option><option value="2,2,3">2×2 と 2×3</option></select></label>
      <label>掛け算の回数 r <input id="s2r" type="number" min="1" max="14" step="1" value="7" inputmode="numeric"></label>
      <button type="button" id="s2go" class="main">探す</button>
      <button type="button" id="s2halt" disabled>止める</button>
    </div>
    <canvas id="s2cv" role="img" aria-label="誤差の変わり方のグラフ"></canvas>
    <div class="legend" aria-hidden="true">
      <span><i style="background:#2f6f8f"></i>今動いている始め</span>
      <span><i style="background:#2e7d4f"></i>丸めても正確なまま</span>
      <span><i style="background:#c07a12"></i>誤差はほぼ 0 だが丸めると崩れる</span>
      <span><i style="background:#a39e94"></i>下がらなくなった・決めた回数までに 0 にならなかった</span>
      <span>横は繰り返しの回数、縦は誤差（表と和の差の大きさ、対数の目盛り）</span>
    </div>
    <p class="sum" id="s2sum"></p>
    <p class="sr" id="s2live" aria-live="polite"></p>
    <div class="found" id="s2found" hidden>
      <p class="fhead" id="s2fhead"></p>
      <div class="grids" id="s2grids" aria-hidden="true"></div>
      <pre class="formula" id="s2formula"></pre>
      <p class="check" id="s2check"></p>
    </div>
  </section>

  <section class="sec" id="s3" aria-labelledby="s3h">
    <h2 id="s3h">3. 回数から指数を出す</h2>
    <p class="lead">n×n を r 回の掛け算で掛けられれば、大きな行列を n×n の塊に分け、塊どうしの掛け算にも同じやり方を使える。これを繰り返すと、N×N の掛け算は約 N^(log_n r) 回になる。</p>
    <div class="ctl">
      <label>塊の大きさ n <input id="s3n" type="number" min="2" max="64" step="1" value="2" inputmode="numeric"></label>
      <label>掛け算の回数 r <input id="s3r" type="number" min="1" max="1000000" step="1" value="7" inputmode="numeric"></label>
    </div>
    <p class="om"><output id="s3om" for="s3n s3r"></output></p>
    <div class="tblwrap">
      <table>
        <caption>n×n の掛け算の回数。論文の下界は「双線形の計算なら少なくとも n^(9/4) 回」</caption>
        <thead><tr><th scope="col">n</th><th scope="col">そのまま n³</th><th scope="col">論文の下界</th><th scope="col">知られている回数</th><th scope="col">指数 log_n r</th><th scope="col" class="l">どのやり方か</th></tr></thead>
        <tbody id="s3known"></tbody>
      </table>
    </div>
    <label class="rangel">行列の大きさ N <input id="s3N" type="range" min="1" max="6" step="0.05" value="4"> <output id="s3No" for="s3N"></output></label>
    <canvas id="s3cv" role="img" aria-label="指数ごとの掛け算の回数のグラフ"></canvas>
    <div class="tblwrap">
      <table>
        <caption id="s3cap">N×N の掛け算の回数（定数の倍率は 1 とし、指数の違いだけを比べる）</caption>
        <thead><tr><th scope="col">指数</th><th scope="col" class="l">どの値か</th><th scope="col">掛け算の回数</th><th scope="col">そのままとの比</th></tr></thead>
        <tbody id="s3cnt"></tbody>
      </table>
    </div>
  </section>
</div>`,
  css: `:root { color-scheme: light; --bg: #f6f4ef; --fg: #22201c; --mut: #5f594f; --line: #d8d2c6; --panel: #fffdf9; --acc: #2f6f8f; --ok: #2e7d4f; }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.6 system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .app { box-sizing: border-box; max-inline-size: 980px; margin-inline: auto; padding: 10px 12px 16px; display: grid; gap: 14px; }
    .sec { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px 12px; min-inline-size: 0; }
    h2 { font-size: 15px; line-height: 1.45; margin: 0 0 4px; }
    .lead { margin: 0 0 8px; font-size: 13px; color: var(--mut); }
    .mut { color: var(--mut); font-size: 13px; }
    .ctl { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; margin-block: 8px 6px; }
    .ctl label { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; }
    input[type=number] { inline-size: 6em; }
    button { font-size: 13px; }
    button.main { background: var(--acc); border-color: var(--acc); color: #fff; }
    button:disabled { opacity: .5; cursor: default; }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
    .mats { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
    .matw { display: flex; align-items: center; gap: 5px; }
    .ml { font-weight: 600; }
    .mat { display: grid; gap: 2px 10px; padding: 2px 8px; border-inline: 2px solid var(--fg); border-radius: 7px; font-variant-numeric: tabular-nums; text-align: end; }
    .op { font-size: 18px; color: var(--mut); }
    .s1cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); gap: 0 18px; }
    .eqs { margin: 8px 0 0; padding-inline-start: 1.4em; font: 12.5px/1.75 ui-monospace, Consolas, monospace; }
    #s1outs { list-style: none; padding-inline-start: 0; }
    .eqs li { overflow-wrap: anywhere; }
    .ok { color: var(--ok); font-family: system-ui, sans-serif; }
    .cnt { margin: 6px 0 0; font-size: 13px; }
    .tblwrap { overflow-x: auto; margin-top: 8px; }
    table { border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }
    th, td { border-bottom: 1px solid var(--line); padding: 3px 8px; text-align: end; white-space: nowrap; }
    th { font-weight: 600; color: var(--mut); }
    th:first-child, td:first-child { text-align: start; }
    td.l, th.l { text-align: start; white-space: normal; min-inline-size: 14em; }
    caption { text-align: start; font-size: 12.5px; color: var(--mut); padding-bottom: 4px; }
    canvas { display: block; inline-size: 100%; block-size: 240px; border-radius: 8px; border: 1px solid var(--line); background: #fffdf9; }
    .legend { display: flex; flex-wrap: wrap; gap: 2px 14px; font-size: 12px; color: var(--mut); margin-top: 4px; }
    .legend i { display: inline-block; inline-size: 14px; block-size: 3px; vertical-align: middle; margin-inline-end: 4px; }
    .sum { margin: 6px 0 0; font-size: 13px; min-block-size: 3.2em; }
    .found { margin-top: 10px; border-top: 1px dashed var(--line); padding-top: 8px; }
    .fhead { margin: 0; font-size: 13px; font-weight: 600; }
    .grids { display: flex; flex-wrap: wrap; gap: 10px 22px; margin-block: 8px; }
    .gt { font-size: 12px; color: var(--mut); margin-bottom: 2px; }
    .grid { display: grid; gap: 1px; font: 11px/1 ui-monospace, Consolas, monospace; }
    .grid span { block-size: 1.8em; display: grid; place-items: center; border-radius: 2px; }
    .grid .gh, .grid .rl { color: var(--mut); }
    .grid .rl { justify-items: end; padding-inline-end: 5px; }
    .formula { margin: 6px 0; font: 12.5px/1.65 ui-monospace, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--bg); padding: 6px 8px; border-radius: 6px; }
    .check { margin: 0; font-size: 13px; }
    .om { margin: 0; font-size: 13px; min-block-size: 3.2em; }
    .rangel { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; margin-top: 10px; }
    .rangel input { flex: 1 1 200px; min-inline-size: 0; accent-color: var(--acc); }
    #s3cv { block-size: 250px; margin-top: 6px; }
    .sr { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; margin: 0; }
    .sw { display: inline-block; inline-size: 12px; block-size: 3px; vertical-align: middle; margin-inline-end: 5px; }
    .thumb .app { padding: 6px; gap: 0; }
    .thumb #s1, .thumb #s3, .thumb #s2 .lead, .thumb #s2 .ctl, .thumb #s2found, .thumb .legend { display: none !important; }
    .thumb .sec { padding: 6px 8px; }
    .thumb #s2cv { block-size: 148px; }
    .thumb .sum { font-size: 12px; min-block-size: 0; margin-top: 4px; }`,
  core() {
    // ---- 種を決めると同じ並びになる乱数 ----
    function seeded(seed) {
      let s = seed >>> 0;
      return function () {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // ---- 行列の積を表す 3 次元の表（テンソル） ----
    // m×k の A と k×n の B の積 C（m×n）。A の (i,j) は a = i*k+j、B の (j,l) は b = j*n+l、C の (i,l) は c = i*n+l。
    // A の a 番目と B の b 番目の積が C の c 番目に足されるマスだけ 1 にする。nz は 1 のマスの (a, b, c) の並び
    function mmTensor(m, k, n) {
      const na = m * k, nb = k * n, nc = m * n;
      const T = new Float64Array(na * nb * nc);
      const nz = [];
      for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) for (let l = 0; l < n; l++) {
        const a = i * k + j, b = j * n + l, c = i * n + l;
        T[a * nb * nc + b * nc + c] = 1;
        nz.push(a, b, c);
      }
      return { m, k, n, na, nb, nc, T, nz: Int32Array.from(nz) };
    }
    // 要素の名前（A11, A12, …）
    function entryNames(rows, cols, ch) {
      const out = [];
      for (let i = 1; i <= rows; i++) for (let j = 1; j <= cols; j++) out.push(ch + i + j);
      return out;
    }

    // ---- 掛け算 r 回のやり方（双線形の計算） ----
    // M_t = (Σ_a U[a][t]·A_a)(Σ_b V[b][t]·B_b)、C_c = Σ_t W[c][t]·M_t。係数は行の順の平らな配列（U[a*r+t]）
    function strassen() {
      return {
        m: 2, k: 2, n: 2, r: 7,
        // 行は A11 A12 A21 A22、列は M1〜M7
        U: [1, 0, 1, 0, 1, -1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, -1],
        // 行は B11 B12 B21 B22
        V: [1, 1, 0, -1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, -1, 0, 1, 0, 1],
        // 行は C11 C12 C21 C22
        W: [1, 0, 0, 1, -1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, -1, 1, 0, 0, 1, 0],
      };
    }
    // そのまま掛ける（小さな行列。A は m×k、B は k×n の平らな配列）
    function mulPlain(A, B, m, k, n) {
      const C = new Array(m * n).fill(0);
      for (let i = 0; i < m; i++) for (let l = 0; l < n; l++) {
        let s = 0;
        for (let j = 0; j < k; j++) s += A[i * k + j] * B[j * n + l];
        C[i * n + l] = s;
      }
      return C;
    }
    // t 番目の掛け算が答えに使われるか（U・V・W のどの列も 0 だけではない）
    function isUsed(alg, t) {
      const { m, k, n, r, U, V, W } = alg;
      let u = false, v = false, w = false;
      for (let a = 0; a < m * k; a++) if (U[a * r + t]) u = true;
      for (let b = 0; b < k * n; b++) if (V[b * r + t]) v = true;
      for (let c = 0; c < m * n; c++) if (W[c * r + t]) w = true;
      return u && v && w;
    }
    function usedCount(alg) {
      let s = 0;
      for (let t = 0; t < alg.r; t++) if (isUsed(alg, t)) s++;
      return s;
    }
    // やり方 alg で掛ける。M は各掛け算の値、mults は実際に行った掛け算の回数
    function mulWith(alg, A, B) {
      const { m, k, n, r, U, V, W } = alg;
      const M = new Array(r).fill(0);
      let mults = 0;
      for (let t = 0; t < r; t++) {
        if (!isUsed(alg, t)) continue;
        let x = 0, y = 0;
        for (let a = 0; a < m * k; a++) if (U[a * r + t]) x += U[a * r + t] * A[a];
        for (let b = 0; b < k * n; b++) if (V[b * r + t]) y += V[b * r + t] * B[b];
        M[t] = x * y;
        mults++;
      }
      const C = new Array(m * n).fill(0);
      for (let c = 0; c < m * n; c++) {
        let s = 0;
        for (let t = 0; t < r; t++) if (W[c * r + t]) s += W[c * r + t] * M[t];
        C[c] = s;
      }
      return { C, M, mults };
    }
    // 足し算と引き算の回数（途中の和を使い回さない数え方）
    function countAdds(alg) {
      const { m, k, n, r, U, V, W } = alg;
      let s = 0;
      for (let t = 0; t < r; t++) {
        if (!isUsed(alg, t)) continue;
        let u = 0, v = 0;
        for (let a = 0; a < m * k; a++) if (U[a * r + t]) u++;
        for (let b = 0; b < k * n; b++) if (V[b * r + t]) v++;
        s += u - 1 + v - 1;
      }
      for (let c = 0; c < m * n; c++) {
        let w = 0;
        for (let t = 0; t < r; t++) if (W[c * r + t] && isUsed(alg, t)) w++;
        if (w) s += w - 1;
      }
      return s;
    }
    // 係数と名前の組 [[係数, 名前], …] を「A11 + A22」の形の文字にする
    function sumText(terms) {
      let s = '';
      terms.forEach(([c, nm], i) => {
        const mag = Math.abs(c);
        const body = (mag === 1 ? '' : String(mag) + '·') + nm;
        if (i === 0) s += (c < 0 ? '−' : '') + body;
        else s += (c < 0 ? ' − ' : ' + ') + body;
      });
      return s || '0';
    }
    // やり方を式の文字にする。使わない掛け算は飛ばし、使う物に M1 から番号を振り直す
    function algText(alg) {
      const { m, k, n, r, U, V, W } = alg;
      const an = entryNames(m, k, 'A'), bn = entryNames(k, n, 'B'), cn = entryNames(m, n, 'C');
      const wrap = (ts) => (ts.length > 1 || ts[0][0] !== 1 ? '(' + sumText(ts) + ')' : ts[0][1]);
      const prods = [];
      for (let t = 0; t < r; t++) {
        if (!isUsed(alg, t)) continue;
        const left = [], right = [];
        for (let a = 0; a < an.length; a++) if (U[a * r + t]) left.push([U[a * r + t], an[a]]);
        for (let b = 0; b < bn.length; b++) if (V[b * r + t]) right.push([V[b * r + t], bn[b]]);
        prods.push({ t, name: 'M' + (prods.length + 1), left, right, text: wrap(left) + '·' + wrap(right) });
      }
      const outs = [];
      for (let c = 0; c < cn.length; c++) {
        const terms = [];
        for (const p of prods) if (W[c * r + p.t]) terms.push([W[c * r + p.t], p.name]);
        outs.push({ name: cn[c], terms, text: sumText(terms) });
      }
      return { prods, outs, an, bn, cn };
    }
    // 全部のマスで、表とやり方の和が整数として一致しないマスの数（0 なら正確なやり方）
    function wrongCells(ten, alg) {
      const { r, U, V, W } = alg;
      let bad = 0;
      for (let a = 0; a < ten.na; a++) for (let b = 0; b < ten.nb; b++) for (let c = 0; c < ten.nc; c++) {
        let v = ten.T[a * ten.nb * ten.nc + b * ten.nc + c];
        for (let t = 0; t < r; t++) v -= U[a * r + t] * V[b * r + t] * W[c * r + t];
        if (v !== 0) bad++;
      }
      return bad;
    }

    // ---- 交互最小二乗法で探す ----
    // G X = R（G は r×r、R は r×cols）を部分ピボットのガウスの消去法で解く。解けなければ null
    function solveSmall(G, R, r, cols) {
      const M = Float64Array.from(G), X = Float64Array.from(R);
      for (let p = 0; p < r; p++) {
        let best = p, bv = Math.abs(M[p * r + p]);
        for (let q = p + 1; q < r; q++) { const v = Math.abs(M[q * r + p]); if (v > bv) { bv = v; best = q; } }
        if (!(bv > 1e-300)) return null;
        if (best !== p) {
          for (let j = 0; j < r; j++) { const t = M[p * r + j]; M[p * r + j] = M[best * r + j]; M[best * r + j] = t; }
          for (let j = 0; j < cols; j++) { const t = X[p * cols + j]; X[p * cols + j] = X[best * cols + j]; X[best * cols + j] = t; }
        }
        const d = M[p * r + p];
        for (let q = p + 1; q < r; q++) {
          const f = M[q * r + p] / d;
          if (!f) continue;
          for (let j = p; j < r; j++) M[q * r + j] -= f * M[p * r + j];
          for (let j = 0; j < cols; j++) X[q * cols + j] -= f * X[p * cols + j];
        }
      }
      for (let p = r - 1; p >= 0; p--) {
        const d = M[p * r + p];
        for (let j = 0; j < cols; j++) {
          let s = X[p * cols + j];
          for (let q = p + 1; q < r; q++) s -= M[p * r + q] * X[q * cols + j];
          X[p * cols + j] = s / d;
        }
      }
      for (let i = 0; i < X.length; i++) if (!Number.isFinite(X[i])) return null;
      return X;
    }
    function newSearch(ten, r, seed) {
      const rand = seeded(seed);
      const mk = (len) => { const X = new Float64Array(len * r); for (let i = 0; i < X.length; i++) X[i] = rand() * 2 - 1; return X; };
      return { ten, r, seed, U: mk(ten.na), V: mk(ten.nb), W: mk(ten.nc), it: 0, rit: 0, phase: 'als', lam: 0.1, mu: 0, err: Infinity, mark: Infinity, hist: [], real: null, exact: null, result: '' };
    }
    // md = 0 なら U を、1 なら V を、2 なら W を、ほかの 2 つを固定して最小二乗法で決め直す。
    // tg と mu を渡すと、係数を tg へ引き寄せる項 mu·|X − tg|² も足す
    function updateFactor(st, md, lam, tg, mu) {
      const { ten, r } = st;
      const F = [st.U, st.V, st.W], dims = [ten.na, ten.nb, ten.nc];
      const X = F[md], P = F[(md + 1) % 3], Q = F[(md + 2) % 3];
      const nx = dims[md], np = dims[(md + 1) % 3], nq = dims[(md + 2) % 3];
      const G = new Float64Array(r * r);
      for (let s = 0; s < r; s++) for (let t = s; t < r; t++) {
        let a = 0, b = 0;
        for (let i = 0; i < np; i++) a += P[i * r + s] * P[i * r + t];
        for (let i = 0; i < nq; i++) b += Q[i * r + s] * Q[i * r + t];
        G[s * r + t] = G[t * r + s] = a * b;
      }
      for (let s = 0; s < r; s++) G[s * r + s] += lam + mu;
      const R = new Float64Array(r * nx);
      const nz = ten.nz;
      for (let z = 0; z < nz.length; z += 3) {
        const x = nz[z + md], p = nz[z + (md + 1) % 3], q = nz[z + (md + 2) % 3];
        for (let t = 0; t < r; t++) R[t * nx + x] += P[p * r + t] * Q[q * r + t];
      }
      if (mu) for (let x = 0; x < nx; x++) for (let t = 0; t < r; t++) R[t * nx + x] += mu * tg[x * r + t];
      const S = solveSmall(G, R, r, nx);
      if (!S) return false;
      for (let x = 0; x < nx; x++) for (let t = 0; t < r; t++) X[x * r + t] = S[t * nx + x];
      return true;
    }
    // 表とやり方の和の差の大きさ（全部のマスの差の二乗和の平方根）
    function residual(st) {
      const { ten, r, U, V, W } = st;
      let s = 0;
      for (let a = 0; a < ten.na; a++) for (let b = 0; b < ten.nb; b++) for (let c = 0; c < ten.nc; c++) {
        let v = ten.T[a * ten.nb * ten.nc + b * ten.nc + c];
        for (let t = 0; t < r; t++) v -= U[a * r + t] * V[b * r + t] * W[c * r + t];
        s += v * v;
      }
      return Math.sqrt(s);
    }
    // 1 つの掛け算の 3 つの列の大きさをそろえる（1 つだけ大きくなって計算が止まるのを防ぐ）
    function balance(st) {
      const { ten, r, U, V, W } = st;
      const nrm = (X, len, t) => { let s = 0; for (let i = 0; i < len; i++) s += X[i * r + t] * X[i * r + t]; return Math.sqrt(s); };
      for (let t = 0; t < r; t++) {
        const a = nrm(U, ten.na, t), b = nrm(V, ten.nb, t), c = nrm(W, ten.nc, t);
        if (!(a > 0 && b > 0 && c > 0)) continue;
        const g = Math.cbrt(a * b * c);
        for (let i = 0; i < ten.na; i++) U[i * r + t] *= g / a;
        for (let i = 0; i < ten.nb; i++) V[i * r + t] *= g / b;
        for (let i = 0; i < ten.nc; i++) W[i * r + t] *= g / c;
      }
    }
    // U と V の列の一番大きい値が 1 になるよう、大きさを W の列へ移す（丸める前の準備）
    function normCols(st) {
      const { ten, r, U, V, W } = st;
      for (let t = 0; t < r; t++) {
        let a = 0, b = 0;
        for (let i = 0; i < ten.na; i++) if (Math.abs(U[i * r + t]) > Math.abs(a)) a = U[i * r + t];
        for (let i = 0; i < ten.nb; i++) if (Math.abs(V[i * r + t]) > Math.abs(b)) b = V[i * r + t];
        if (!a || !b) continue;
        for (let i = 0; i < ten.na; i++) U[i * r + t] /= a;
        for (let i = 0; i < ten.nb; i++) V[i * r + t] /= b;
        for (let i = 0; i < ten.nc; i++) W[i * r + t] *= a * b;
      }
    }
    const snap = (X) => Array.from(X, (v) => Math.max(-1, Math.min(1, Math.round(v))) || 0);
    function rounded(st) {
      const { ten, r } = st;
      return { m: ten.m, k: ten.k, n: ten.n, r, U: snap(st.U), V: snap(st.V), W: snap(st.W) };
    }
    function copyReal(st) {
      const { ten, r } = st;
      return { m: ten.m, k: ten.k, n: ten.n, r, U: Array.from(st.U), V: Array.from(st.V), W: Array.from(st.W), err: st.err };
    }
    function sweep(st, lam, tg, mu) {
      for (let md = 0; md < 3; md++) if (!updateFactor(st, md, lam, tg ? tg[md] : null, mu)) return false;
      return true;
    }
    function toRound(st) {
      st.real = copyReal(st);
      normCols(st);
      st.phase = 'round';
      st.mu = 1e-3;
      st.rit = 0;
    }
    // 誤差をほぼ 0 にする段階。5 回ごとに誤差を記録し、減らなくなったらあきらめる
    function stepAls(st, maxIt) {
      if (!sweep(st, st.lam, null, 0)) { st.phase = 'done'; st.result = 'stuck'; return; }
      balance(st);
      st.it++;
      if (st.it % 5) return;
      const e = residual(st);
      if (!Number.isFinite(e)) { st.phase = 'done'; st.result = 'stuck'; return; }
      st.err = e;
      st.hist.push(st.it, e);
      st.lam = e < 1e-4 ? 1e-13 : Math.min(0.1, e * 0.05);
      if (e < 1e-11) { toRound(st); return; }
      if (st.it % 200 === 0) {
        if (st.it >= 600 && e > 1e-3 && e > st.mark * 0.999) { st.phase = 'done'; st.result = 'stuck'; return; }
        st.mark = e;
      }
      if (st.it >= maxIt) {
        if (e < 1e-6) toRound(st);
        else { st.phase = 'done'; st.result = 'stuck'; }
      }
    }
    // 係数を −1・0・1 へ引き寄せる段階。丸めた係数で表と一致したら正確なやり方
    function stepRound(st) {
      const tg = [snap(st.U), snap(st.V), snap(st.W)];
      if (!sweep(st, 1e-9, tg, st.mu)) { st.phase = 'done'; st.result = 'real'; return; }
      st.mu = Math.min(10, st.mu * 1.01);
      st.rit++;
      if (st.rit % 10 && st.rit < 1500) return;
      const alg = rounded(st);
      if (wrongCells(st.ten, alg) === 0) { st.exact = alg; st.phase = 'done'; st.result = 'exact'; return; }
      if (st.rit >= 1500) { st.phase = 'done'; st.result = 'real'; }
    }
    // steps 回だけ進める。終わったら true
    function advance(st, steps, maxIt) {
      for (let s = 0; s < steps && st.phase !== 'done'; s++) {
        if (st.phase === 'als') stepAls(st, maxIt);
        else stepRound(st);
      }
      return st.phase === 'done';
    }
    // 最後まで一度に動かす（テスト用）
    function runStart(ten, r, seed, maxIt) {
      const st = newSearch(ten, r, seed);
      while (!advance(st, 1000, maxIt)) { /* 終わるまで進める */ }
      return st;
    }

    // ---- 大きな行列 ----
    function matPlain(A, B, n) {
      const C = new Float64Array(n * n);
      for (let i = 0; i < n; i++) {
        const ci = i * n;
        for (let k = 0; k < n; k++) {
          const a = A[ci + k];
          if (!a) continue;
          const bk = k * n;
          for (let j = 0; j < n; j++) C[ci + j] += a * B[bk + j];
        }
      }
      return C;
    }
    // Strassen を繰り返す。cut 以下の大きさか奇数になったら、そのまま掛ける
    function matStrassen(A, B, n, cut) {
      if (n <= cut || n % 2) return matPlain(A, B, n);
      const h = n / 2, hh = h * h;
      const part = (X, bi, bj) => {
        const Y = new Float64Array(hh);
        for (let i = 0; i < h; i++) { const o = (bi * h + i) * n + bj * h; Y.set(X.subarray(o, o + h), i * h); }
        return Y;
      };
      const add = (X, Y) => { const Z = new Float64Array(hh); for (let i = 0; i < hh; i++) Z[i] = X[i] + Y[i]; return Z; };
      const sub = (X, Y) => { const Z = new Float64Array(hh); for (let i = 0; i < hh; i++) Z[i] = X[i] - Y[i]; return Z; };
      const A11 = part(A, 0, 0), A12 = part(A, 0, 1), A21 = part(A, 1, 0), A22 = part(A, 1, 1);
      const B11 = part(B, 0, 0), B12 = part(B, 0, 1), B21 = part(B, 1, 0), B22 = part(B, 1, 1);
      const M1 = matStrassen(add(A11, A22), add(B11, B22), h, cut);
      const M2 = matStrassen(add(A21, A22), B11, h, cut);
      const M3 = matStrassen(A11, sub(B12, B22), h, cut);
      const M4 = matStrassen(A22, sub(B21, B11), h, cut);
      const M5 = matStrassen(add(A11, A12), B22, h, cut);
      const M6 = matStrassen(sub(A21, A11), add(B11, B12), h, cut);
      const M7 = matStrassen(sub(A12, A22), add(B21, B22), h, cut);
      const C = new Float64Array(n * n);
      for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) {
        const s = i * h + j;
        C[i * n + j] = M1[s] + M4[s] - M5[s] + M7[s];
        C[i * n + j + h] = M3[s] + M5[s];
        C[(i + h) * n + j] = M2[s] + M4[s];
        C[(i + h) * n + j + h] = M1[s] - M2[s] + M3[s] + M6[s];
      }
      return C;
    }
    // matStrassen が行う掛け算の回数
    function multCount(n, cut) {
      return n <= cut || n % 2 ? n * n * n : 7 * multCount(n / 2, cut);
    }
    function maxDiff(X, Y) {
      let d = 0;
      for (let i = 0; i < X.length; i++) d = Math.max(d, Math.abs(X[i] - Y[i]));
      return d;
    }

    // ---- 指数 ----
    // n×n を r 回で掛けるやり方を重ねたときの指数
    function omegaFrom(n, r) { return Math.log(r) / Math.log(n); }
    // m×k と k×n を r 回で掛けるやり方から出る指数（3 つの向きを回して正方形にする）
    function omegaRect(m, k, n, r) { return (3 * Math.log(r)) / Math.log(m * k * n); }
    // 論文の下界: n×n の双線形の計算に要る掛け算は n^(9/4) 回以上
    function lowerBound(n) { return Math.ceil(Math.pow(n, 2.25) - 1e-9); }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const THUMB_MODE = !!window.THUMB;
    if (THUMB_MODE) document.body.classList.add('thumb');
    const MINUS = '−';
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const fmtE = (v) => (!Number.isFinite(v) ? '-' : v === 0 ? '0' : v.toExponential(1).replace('e+', 'e').replace('-', MINUS));
    const num = (v) => (v < 0 ? '(' + MINUS + (-v) + ')' : String(v));
    const fmtInt = (v) => (v < 0 ? MINUS + (-v) : String(v));
    const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
    const pow10 = (e) => '10' + String(e).split('').map((ch) => SUP[ch] || ch).join('');
    const fmtBig = (lg) => {
      // 10^lg を「1.23 × 10¹²」の形にする
      const e = Math.floor(lg + 1e-9), mant = Math.pow(10, lg - e);
      return e < 4 ? String(Math.round(Math.pow(10, lg))) : mant.toFixed(2) + ' × ' + pow10(e);
    };
    const yieldMain = () => (window.scheduler && 'yield' in window.scheduler
      ? window.scheduler.yield()
      : new Promise((res) => setTimeout(res, 0)));
    function sizeCanvas(c, ctx) {
      const w = Math.max(1, Math.round(c.clientWidth)), h = Math.max(1, Math.round(c.clientHeight));
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return [w, h];
    }

    // ================= 1. Strassen の 7 回 =================
    const ST = strassen();
    const STX = algText(ST);
    let s1A = [], s1B = [];
    const rnd9 = () => 1 + Math.floor(Math.random() * 9);
    function valSum(terms, names, vals) {
      return terms.map(([c, nm], i) => (c < 0 ? (i ? ' ' + MINUS + ' ' : MINUS) : (i ? ' + ' : '')) + num(vals[names.indexOf(nm)])).join('');
    }
    function wrapVal(terms, names, vals) {
      return terms.length > 1 || terms[0][0] !== 1 ? '(' + valSum(terms, names, vals) + ')' : num(vals[names.indexOf(terms[0][1])]);
    }
    function matBox(label, vals, cols) {
      const w = el('div', 'matw');
      w.append(el('span', 'ml', label));
      const g = el('div', 'mat');
      g.style.gridTemplateColumns = 'repeat(' + cols + ', auto)';
      for (const v of vals) g.append(el('span', '', fmtInt(v)));
      w.append(g);
      return w;
    }
    function renderS1() {
      const res = mulWith(ST, s1A, s1B);
      const plain = mulPlain(s1A, s1B, 2, 2, 2);
      $('s1mats').replaceChildren(matBox('A', s1A, 2), el('span', 'op', '×'), matBox('B', s1B, 2), el('span', 'op', '='), matBox('C', res.C, 2));
      const ol = $('s1prods');
      ol.replaceChildren();
      for (const p of STX.prods) {
        const li = el('li');
        li.append(el('b', '', p.name), ' = ' + p.text + ' = ' + wrapVal(p.left, STX.an, s1A) + ' × ' + wrapVal(p.right, STX.bn, s1B) + ' = ', el('b', '', fmtInt(res.M[p.t])));
        ol.append(li);
      }
      const mval = new Map(STX.prods.map((p) => [p.name, res.M[p.t]]));
      const ul = $('s1outs');
      ul.replaceChildren();
      STX.outs.forEach((o, c) => {
        const li = el('li');
        const vs = o.terms.map(([cf, nm], i) => (cf < 0 ? (i ? ' ' + MINUS + ' ' : MINUS) : (i ? ' + ' : '')) + num(mval.get(nm))).join('');
        li.append(el('b', '', o.name), ' = ' + o.text + ' = ' + vs + ' = ', el('b', '', fmtInt(res.C[c])), ' ',
          el('span', 'ok', plain[c] === res.C[c] ? '（そのまま掛けた答えと同じ）' : '（そのまま掛けた答え ' + fmtInt(plain[c]) + ' と違う）'));
        ul.append(li);
      });
      $('s1cnt').textContent = '掛け算: そのままなら 8 回、Strassen は ' + res.mults + ' 回。足し算と引き算: そのままなら 4 回、Strassen は ' + countAdds(ST) + ' 回。'
        + '1 回の掛け算を「塊どうしの行列の掛け算」に置き換えると、足し算より掛け算の方がずっと重いので、この差が効いてくる。';
    }
    function shuffleS1() {
      s1A = [rnd9(), rnd9(), rnd9(), rnd9()];
      s1B = [rnd9(), rnd9(), rnd9(), rnd9()];
      renderS1();
    }
    let benchBusy = false;
    async function runBench() {
      if (benchBusy) return;
      benchBusy = true;
      const btn = $('s1bench');
      btn.disabled = true;
      const body = $('s1tbody');
      body.replaceChildren();
      $('s1tbl').hidden = false;
      const cut = 64;
      try {
        for (const n of [128, 256, 512]) {
          $('s1bst').textContent = n + '×' + n + ' を測っています…';
          await yieldMain();
          const A = new Float64Array(n * n), B = new Float64Array(n * n);
          for (let i = 0; i < n * n; i++) { A[i] = Math.random() * 2 - 1; B[i] = Math.random() * 2 - 1; }
          let tp = Infinity, ts = Infinity, Cp = null, Cs = null;
          for (let rep = 0; rep < 2; rep++) {
            let t0 = performance.now();
            Cp = matPlain(A, B, n);
            tp = Math.min(tp, performance.now() - t0);
            await yieldMain();
            t0 = performance.now();
            Cs = matStrassen(A, B, n, cut);
            ts = Math.min(ts, performance.now() - t0);
            await yieldMain();
          }
          const tr = el('tr');
          const cells = [n + '×' + n, (n * n * n).toLocaleString('ja-JP'), tp.toFixed(1) + ' ms', multCount(n, cut).toLocaleString('ja-JP'), ts.toFixed(1) + ' ms', (ts / tp).toFixed(2), fmtE(maxDiff(Cp, Cs))];
          cells.forEach((v, i) => tr.append(el(i ? 'td' : 'th', '', v)));
          tr.firstChild.setAttribute('scope', 'row');
          body.append(tr);
        }
        $('s1bst').textContent = '済み。時間の比が 1 より小さければ Strassen の方が速い。分けるたびに足し算と新しい配列が増えるので、小さな行列ではそのままの方が速いことが多い。';
      } finally {
        btn.disabled = false;
        benchBusy = false;
      }
    }

    // ================= 2. 少ない回数のやり方を探す =================
    const cv = $('s2cv'), g2 = cv.getContext('2d');
    const COL = { run: '#2f6f8f', exact: '#2e7d4f', real: '#c07a12', stuck: '#a39e94', grid: '#e6e1d6', text: '#5f594f', bg: '#fffdf9' };
    let job = null, lastJob = null, seedBase = 1;
    function startSearch() {
      if (job) job.halt = true;
      const [m, k, n] = $('s2size').value.split(',').map(Number);
      let r = Math.round(Number($('s2r').value));
      if (!(r >= 1)) r = 7;
      r = Math.min(14, r);
      $('s2r').value = String(r);
      const ten = mmTensor(m, k, n);
      // nz は (a, b, c) を 3 つずつ並べた配列なので、1 のマスの数は長さの 3 分の 1
      const me = { halt: false, ten, r, starts: [], cur: null, max: THUMB_MODE ? 6 : 16, maxIt: ten.nz.length / 3 > 8 ? 3000 : 2000, done: false, shown: '' };
      job = me;
      lastJob = me;
      $('s2halt').disabled = false;
      $('s2found').hidden = true;
      requestAnimationFrame(() => frame(me));
    }
    function frame(me) {
      if (me.halt || job !== me) return;
      let left = THUMB_MODE ? 8 : 30;
      while (left > 0) {
        if (!me.cur || me.cur.phase === 'done') {
          if (me.cur) finished(me, me.cur);
          if (me.starts.length >= me.max) { me.done = true; break; }
          me.cur = newSearch(me.ten, me.r, seedBase++);
          me.starts.push(me.cur);
        }
        const n = Math.min(left, 10);
        advance(me.cur, n, me.maxIt);
        left -= n;
      }
      drawSearch(me);
      summarize(me);
      if (me.done) {
        $('s2halt').disabled = true;
        job = null;
        if (THUMB_MODE) setTimeout(() => { if (!job) startSearch(); }, 2500);
        return;
      }
      requestAnimationFrame(() => frame(me));
    }
    function haltSearch() {
      if (!job) return;
      job.halt = true;
      job.stopped = true;
      summarize(job);
      job = null;
      $('s2halt').disabled = true;
    }
    function finished(me, st) {
      if (st.result === 'exact' && me.shown !== 'exact') { me.shown = 'exact'; showAlg(me, st, true); }
      else if (st.result === 'real' && !me.shown) { me.shown = 'real'; showAlg(me, st, false); }
    }
    function counts(me) {
      let exact = 0, real = 0, stuck = 0, best = Infinity;
      for (const st of me.starts) {
        best = Math.min(best, st.real ? st.real.err : st.err);
        if (st.phase !== 'done') continue;
        if (st.result === 'exact') exact++;
        else if (st.result === 'real') real++;
        else stuck++;
      }
      return { exact, real, stuck, best };
    }
    function summarize(me) {
      const c = counts(me);
      const t = me.ten;
      const what = t.m + '×' + t.k + ' と ' + t.k + '×' + t.n + ' の積を ' + me.r + ' 回の掛け算で';
      if (THUMB_MODE) {
        $('s2sum').textContent = what + '。始め ' + me.starts.length + '/' + me.max + '、正確なやり方 ' + c.exact + ' 個、誤差の最小 ' + fmtE(c.best);
        return;
      }
      let s = what + ': 始め ' + me.starts.length + ' / ' + me.max + ' 回目。誤差がほぼ 0 になった始めは ' + (c.exact + c.real) + ' 回（そのうち係数を −1・0・1 に丸めても正確なまま ' + c.exact + ' 回）、誤差が下がらなくなったか ' + me.maxIt + ' 回までに 0 にならなかった始めは ' + c.stuck + ' 回。これまでで一番小さい誤差は ' + fmtE(c.best) + '。';
      if (me.stopped) s += '（途中で止めた）';
      if (me.done || me.stopped) {
        const sq = t.m === 2 && t.k === 2 && t.n === 2;
        const r23 = t.m === 2 && t.k === 2 && t.n === 3;
        if (sq && me.r <= 6) s += ' 2×2 の積は 7 回より減らせないことが 1971 年に示され（Winograd）、誤差をいくらでも小さくする近似のやり方でも 7 回より減らせないことが 2006 年に示された（Landsberg）。どの始めでも誤差が 0 に近づかないのは、探し方のせいではない。';
        else if (sq && me.r === 7) s += ' 2×2 を 7 回で掛けるやり方は、行や列の入れ替えなどの変換で、全部 Strassen のやり方に移せることが知られている（de Groote、1978 年）。';
        else if (r23 && me.r === 10) s += ' 2×2 と 2×3 の積には、係数を限りなく大きくすれば 10 回で誤差をいくらでも小さくできる近似のやり方がある（Bini ほか、1979 年）。この探し方は係数が大きくなりすぎないように抑えているので、誤差 0.1 前後で止まる。';
        else if (me.r >= t.nz.length / 3) s += ' r が ' + (t.nz.length / 3) + ' 以上なら、そのまま掛けるやり方（' + (t.nz.length / 3) + ' 回）も答えの 1 つになる。';
      }
      $('s2sum').textContent = s;
      if (me.done || me.stopped) {
        // 読み上げは終わった時だけ（毎コマ書き換える欄を読み上げさせない）
        $('s2live').textContent = s;
        cv.setAttribute('aria-label', '誤差の変わり方のグラフ。' + s);
      }
    }
    function drawSearch(me) {
      const [w, h] = sizeCanvas(cv, g2);
      g2.fillStyle = COL.bg;
      g2.fillRect(0, 0, w, h);
      const L = 46, R = 12, T = 10, B = 22;
      const pw = Math.max(1, w - L - R), ph = Math.max(1, h - T - B);
      const Y0 = 1, Y1 = -13;
      // 横の目盛りは、ここまでで一番長く進んだ始めに合わせる（早く終わる始めの線をつぶさない）
      let seen = 0;
      for (const st of me.starts) if (st.hist.length) seen = Math.max(seen, st.hist[st.hist.length - 2]);
      const xMax = Math.max(200, Math.ceil(seen / 100) * 100);
      const xOf = (it) => L + pw * Math.min(1, it / xMax);
      const yOf = (e) => {
        const l = Math.max(Y1, Math.min(Y0, Math.log10(Math.max(e, 1e-300))));
        return T + (ph * (Y0 - l)) / (Y0 - Y1);
      };
      g2.font = '11px system-ui, sans-serif';
      g2.lineWidth = 1;
      g2.textBaseline = 'middle';
      g2.textAlign = 'right';
      for (const l of [0, -4, -8, -12]) {
        const y = yOf(Math.pow(10, l));
        g2.strokeStyle = COL.grid;
        g2.beginPath(); g2.moveTo(L, y); g2.lineTo(L + pw, y); g2.stroke();
        g2.fillStyle = COL.text;
        g2.fillText(l === 0 ? '1' : pow10(l), L - 6, y);
      }
      g2.textAlign = 'center';
      g2.textBaseline = 'alphabetic';
      for (const f of [0, 0.5, 1]) {
        const it = Math.round(xMax * f);
        g2.fillText(f === 1 ? it + ' 回' : String(it), Math.min(w - 18, xOf(it)), h - 6);
      }
      const order = me.starts.slice().sort((a, b) => rank(a) - rank(b));
      function rank(st) { return st === me.cur && st.phase !== 'done' ? 3 : st.result === 'stuck' ? 0 : st.result === 'real' ? 1 : 2; }
      for (const st of order) {
        const hst = st.hist;
        if (hst.length < 2) continue;
        const running = st.phase !== 'done';
        g2.strokeStyle = running ? COL.run : COL[st.result] || COL.stuck;
        g2.lineWidth = running ? 2.2 : 1.4;
        g2.beginPath();
        for (let i = 0; i < hst.length; i += 2) {
          const x = xOf(hst[i]), y = yOf(hst[i + 1]);
          if (i) g2.lineTo(x, y); else g2.moveTo(x, y);
        }
        g2.stroke();
        if (st.result === 'exact' || st.result === 'real' || st.phase === 'round') {
          const x = xOf(hst[hst.length - 2]), y = yOf(hst[hst.length - 1]);
          g2.fillStyle = st.result === 'exact' ? COL.exact : st.result === 'real' ? COL.real : COL.run;
          g2.beginPath(); g2.arc(x, y, 3.5, 0, Math.PI * 2); g2.fill();
        }
      }
      g2.strokeStyle = COL.text;
      g2.lineWidth = 1;
      g2.strokeRect(L + 0.5, T + 0.5, pw - 1, ph - 1);
    }
    function cellColor(v) {
      if (!v) return 'transparent';
      const a = Math.min(1, Math.abs(v)) * 0.75 + 0.12;
      return v > 0 ? 'rgba(214, 104, 40, ' + a.toFixed(2) + ')' : 'rgba(47, 111, 143, ' + a.toFixed(2) + ')';
    }
    function gridBox(title, X, names, cols, r, exact) {
      const w = el('div');
      w.append(el('div', 'gt', title));
      const g = el('div', 'grid');
      g.style.gridTemplateColumns = 'auto repeat(' + cols.length + ', 1.9em)';
      g.append(el('span', 'gh', ''));
      for (const c of cols) g.append(el('span', 'gh', c.name));
      names.forEach((nm, i) => {
        g.append(el('span', 'rl', nm));
        for (const c of cols) {
          const v = X[i * r + c.t];
          const s = el('span', '', exact ? (v === 1 ? '1' : v === -1 ? MINUS + '1' : '') : '');
          s.style.background = cellColor(v);
          if (exact && v) s.style.color = '#fff';
          g.append(s);
        }
      });
      w.append(g);
      return w;
    }
    function showAlg(me, st, exact) {
      const alg = exact ? st.exact : st.real;
      const t = me.ten;
      const tx = algText(alg);
      const used = tx.prods.length;
      const idx = me.starts.indexOf(st) + 1;
      const om = omegaRect(t.m, t.k, t.n, used);
      $('s2found').hidden = false;
      $('s2fhead').textContent = exact
        ? idx + ' 回目の始めで見つけた、係数が −1・0・1 だけの正確なやり方: 掛け算 ' + used + ' 回、足し算と引き算 ' + countAdds(alg) + ' 回（途中の和を使い回さない数え方）。このやり方を繰り返すと指数は ' + om.toFixed(3) + '。'
        : idx + ' 回目の始めで見つけた、実数の係数のやり方（誤差 ' + fmtE(alg.err) + '。−1・0・1 に丸めると正確でなくなった）: 掛け算 ' + used + ' 回。';
      const cols = tx.prods.map((p) => ({ t: p.t, name: p.name }));
      $('s2grids').replaceChildren(
        gridBox('A の係数（U）', alg.U, tx.an, cols, alg.r, exact),
        gridBox('B の係数（V）', alg.V, tx.bn, cols, alg.r, exact),
        gridBox('C の係数（W）', alg.W, tx.cn, cols, alg.r, exact));
      const f = $('s2formula');
      if (exact) {
        f.hidden = false;
        f.textContent = tx.prods.map((p) => p.name + ' = ' + p.text).join('\n') + '\n\n' + tx.outs.map((o) => o.name + ' = ' + o.text).join('\n');
      } else {
        f.hidden = true;
      }
      const N = 300;
      if (exact) {
        let ok = 0;
        for (let i = 0; i < N; i++) {
          const A = Array.from({ length: t.na }, () => Math.floor(Math.random() * 19) - 9);
          const B = Array.from({ length: t.nb }, () => Math.floor(Math.random() * 19) - 9);
          const C1 = mulWith(alg, A, B).C, C2 = mulPlain(A, B, t.m, t.k, t.n);
          if (C1.every((v, j) => v === C2[j])) ok++;
        }
        $('s2check').textContent = '確かめ: −9〜9 の乱数の整数の行列 ' + N + ' 組をこのやり方で掛け、そのまま掛けた答えと比べると ' + ok + ' 組が一致した。オレンジは +1、青は −1、空白は 0。';
      } else {
        let d = 0;
        for (let i = 0; i < N; i++) {
          const A = Array.from({ length: t.na }, () => Math.random() * 2 - 1);
          const B = Array.from({ length: t.nb }, () => Math.random() * 2 - 1);
          const C1 = mulWith(alg, A, B).C, C2 = mulPlain(A, B, t.m, t.k, t.n);
          C1.forEach((v, j) => { d = Math.max(d, Math.abs(v - C2[j])); });
        }
        $('s2check').textContent = '確かめ: −1〜1 の乱数の実数の行列 ' + N + ' 組をこのやり方で掛けると、そのまま掛けた答えとの差は最大 ' + fmtE(d) + ' だった。色の濃さは係数の大きさ（オレンジは正、青は負）。';
      }
    }

    // ================= 3. 回数から指数を出す =================
    const KNOWN = [
      { n: 2, r: 7, who: 'Strassen（1969 年）。7 回より減らせないことも 1971 年に示された' },
      { n: 3, r: 23, who: 'Laderman（1976 年）' },
      { n: 4, r: 49, who: 'Strassen を 2 回重ねる（これより少ないやり方も見つかっている）' },
      { n: 8, r: 343, who: 'Strassen を 3 回重ねる' },
      { n: 16, r: 2401, who: 'Strassen を 4 回重ねる' },
    ];
    const EXPS = [
      { w: 3, name: 'そのまま掛ける', col: '#a39e94' },
      { w: Math.log2(7), name: 'Strassen（1969 年）', col: '#2f6f8f' },
      { w: 2.371055, name: '9/4 の前に知られていた一番小さい値（論文が挙げる値）', col: '#c07a12' },
      { w: 2.25, name: '9/4（2026 年 10 月の上界と 11 月の下界）', col: '#b5522b' },
      { w: 2, name: '以前は多くの人がこうなると考えていた値', col: '#6d6a63', dash: true },
    ];
    const cv3 = $('s3cv'), g3 = cv3.getContext('2d');
    function fillKnown() {
      const body = $('s3known');
      body.replaceChildren();
      for (const k of KNOWN) {
        const tr = el('tr');
        const th = el('th', '', String(k.n));
        th.setAttribute('scope', 'row');
        tr.append(th, el('td', '', String(k.n ** 3)), el('td', '', String(lowerBound(k.n))), el('td', '', String(k.r)), el('td', '', omegaFrom(k.n, k.r).toFixed(3)), el('td', 'l', k.who));
        body.append(tr);
      }
    }
    let userW = null;
    function updateOmega() {
      const n = Math.round(Number($('s3n').value)), r = Math.round(Number($('s3r').value));
      const out = $('s3om');
      userW = null;
      if (!(n >= 2) || !(r >= 1)) { out.textContent = 'n は 2 以上、r は 1 以上の整数にする。'; return; }
      const lb = lowerBound(n);
      if (r < n * n) {
        out.textContent = n + '×' + n + ' の答えには ' + (n * n) + ' 個の値があるので、掛け算が ' + (n * n) + ' 回より少ないやり方は無い。';
        return;
      }
      const w = omegaFrom(n, r);
      userW = w;
      let s = n + '×' + n + ' を ' + r + ' 回で掛けられれば、指数は log_' + n + ' ' + r + ' = ' + w.toFixed(4) + ' 以下になる。';
      if (r < lb) s += ' ただし論文によれば、' + n + '×' + n + ' には少なくとも n^(9/4) ≈ ' + Math.pow(n, 2.25).toFixed(2) + '、つまり ' + lb + ' 回が要るので、このやり方は無い（あれば指数が 2.25 より小さくなる）。';
      else if (r >= n ** 3) s += ' そのまま掛ける ' + (n ** 3) + ' 回と同じか多いので、速くならない。';
      else if (n === 2 && r < 7) s += ' ただし 2×2 は 7 回より減らせないことが 1971 年に示されているので、このやり方は無い。論文の下界（' + lb + ' 回）は、小さな n ではこれより弱い。';
      else s += ' 指数を 2.25 に近づけるには、r を n^(9/4) ≈ ' + Math.pow(n, 2.25).toFixed(2) + ' に近づける必要がある。';
      out.textContent = s;
    }
    function updateCounts() {
      const lg = Number($('s3N').value);
      $('s3No').textContent = 'N = ' + fmtBig(lg);
      const body = $('s3cnt');
      body.replaceChildren();
      const rows = EXPS.slice();
      if (userW != null) rows.push({ w: userW, name: '上で入れた n と r のやり方', col: '#2e7d4f', dash: true });
      for (const e of rows) {
        const tr = el('tr');
        const th = el('th', '');
        th.setAttribute('scope', 'row');
        const sw = el('span', 'sw');
        sw.style.background = e.col;
        th.append(sw, e.w.toFixed(4));
        const ratio = Math.pow(10, (e.w - 3) * lg);
        tr.append(th, el('td', 'l', e.name), el('td', '', fmtBig(e.w * lg)), el('td', '', ratio >= 0.9999 ? '1' : '1 / ' + fmtBig(-Math.log10(ratio))));
        body.append(tr);
      }
      drawCounts(lg, rows);
    }
    function drawCounts(lg, rows) {
      const [w, h] = sizeCanvas(cv3, g3);
      g3.fillStyle = '#fffdf9';
      g3.fillRect(0, 0, w, h);
      const L = 50, R = 14, T = 10, B = 24;
      const pw = Math.max(1, w - L - R), ph = Math.max(1, h - T - B);
      const X0 = 1, X1 = 6, Y0 = 2, Y1 = 18;
      const xOf = (x) => L + (pw * (x - X0)) / (X1 - X0);
      const yOf = (y) => T + ph - (ph * (Math.max(Y0, Math.min(Y1, y)) - Y0)) / (Y1 - Y0);
      g3.font = '11px system-ui, sans-serif';
      g3.lineWidth = 1;
      g3.fillStyle = '#5f594f';
      g3.textAlign = 'right';
      g3.textBaseline = 'middle';
      for (let y = 3; y <= 18; y += 3) {
        g3.strokeStyle = '#e6e1d6';
        g3.beginPath(); g3.moveTo(L, yOf(y)); g3.lineTo(L + pw, yOf(y)); g3.stroke();
        g3.fillText(pow10(y), L - 6, yOf(y));
      }
      g3.textAlign = 'center';
      g3.textBaseline = 'alphabetic';
      for (let x = 1; x <= 6; x++) g3.fillText(pow10(x), xOf(x), h - 6);
      for (const e of rows) {
        g3.strokeStyle = e.col;
        g3.lineWidth = 2;
        g3.setLineDash(e.dash ? [5, 4] : []);
        g3.beginPath();
        g3.moveTo(xOf(X0), yOf(e.w * X0));
        // 縦の範囲を出る所で止める
        const xe = Math.min(X1, Y1 / e.w);
        g3.lineTo(xOf(xe), yOf(e.w * xe));
        g3.stroke();
      }
      g3.setLineDash([]);
      g3.strokeStyle = '#22201c';
      g3.lineWidth = 1;
      g3.beginPath(); g3.moveTo(xOf(lg), T); g3.lineTo(xOf(lg), T + ph); g3.stroke();
      for (const e of rows) {
        g3.fillStyle = e.col;
        g3.beginPath(); g3.arc(xOf(lg), yOf(e.w * lg), 3.5, 0, Math.PI * 2); g3.fill();
      }
      g3.strokeStyle = '#5f594f';
      g3.strokeRect(L + 0.5, T + 0.5, pw - 1, ph - 1);
      cv3.setAttribute('aria-label', '横が行列の大きさ N、縦が掛け算の回数の両対数のグラフ。指数が小さいほど線の傾きがゆるい。N = ' + fmtBig(lg) + ' の所に縦の線を引いた。');
    }
    function updateS3() { updateOmega(); updateCounts(); }

    // ================= 起動 =================
    $('s1shuffle').addEventListener('click', shuffleS1);
    $('s1bench').addEventListener('click', runBench);
    $('s2go').addEventListener('click', startSearch);
    $('s2halt').addEventListener('click', haltSearch);
    $('s2size').addEventListener('change', () => { $('s2r').value = $('s2size').value === '2,2,2' ? '7' : '11'; });
    for (const id of ['s3n', 's3r']) $(id).addEventListener('input', updateS3);
    $('s3N').addEventListener('input', updateCounts);
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { if (lastJob) drawSearch(lastJob); }).observe(cv);
      new ResizeObserver(() => updateCounts()).observe(cv3);
    }
    shuffleS1();
    fillKnown();
    updateS3();
    startSearch();
  },
});
dekiru.add({
  id: 'tr-20261125-click-synth', c: 'trend', lv: 2, date: '2026-11-25',
  t: '録音を使わず、ボタンの「押す音」と「離す音」を毎回その場で計算して、少しずつ違う音にする',
  y: 'ろくおんをつかわず ぼたんのおすおととはなすおとをまいかいそのばでけいさんして すこしずつちがうおとにする',
  tags: ['Button Sounds', 'Web Audio', 'モード合成', '効果音', 'AudioBuffer'],
  d: 'Josh W. Comeau さんの Button Sounds（2026-11-25 に Hacker News で 370 点を超えた）は、身の回りのボタンやスイッチの音を録音した 50 種類以上の素材集で、1 つの音につき押す音と離す音を何回分も録ってある。鳴らすたびに録音を選び直すので、続けて押しても同じ音の繰り返しに聞こえない。この見本は録音を使わず、ボタンの音を「何度か当たって、いくつかの高さで響いて消えるもの」と考えて、波をその場で計算する（モード合成）。押す時と離す時で当たり方を変え、種類・大きさ・硬さ・響きの長さを選べる。種（seed）から決まる乱数で、響きの高さや当たる時刻を毎回少しずらす。ばらつきを 0 にすると毎回まったく同じ音になるので、「続けて 8 回」で聞き比べられる。再現できていないのは、本物の録音の細かい質感・部屋の響き・左右の広がり（この見本は 1 チャンネル）。5 種類の響きの周波数は実物を測った値ではなく、それらしく決めた値である。',
  p: 'ボタンの音を、当たった瞬間の短いざらつきと、そのあと減っていくいくつかの正弦波（響き）の足し算として計算する。減っていく正弦波は sin を毎回呼ばずに、y[k+1] = 2d·cos(ω)·y[k] − d²·y[k−1]（d は 1 サンプルごとの減り方）という 2 つ前までの値を使う式で進める。硬い当たりほど高い響きが残るように、周波数 f の響きに 1/(1+(f·当たりの長さ)²) を掛ける。種から決まる乱数で周波数・減り方・当たりの時刻を少しずつずらすと、録音を何回分も用意しなくても毎回違う音になる。できた波は AudioBuffer に入れ、AudioBufferSourceNode で鳴らす。「続けて 8 回」は AudioContext の時計（currentTime）で鳴らす時刻を決めるので、間隔がずれない。',
  refs: [
    { title: 'Button Sounds — tactile SFX for your UI（Josh W. Comeau）', url: 'https://buttons.joshwcomeau.com/' },
    { title: 'joshwcomeau/button-sounds（README に、録音のしかたと、録音を何回分も用意して選び直す理由）', url: 'https://github.com/joshwcomeau/button-sounds' },
    { title: 'Hacker News: Button Sounds – collection of professionally-recorded button clicks and presses', url: 'https://news.ycombinator.com/item?id=50638032' },
  ],
  html: `<div class="wrap">
  <div class="stage">
    <button id="cap" class="cap" type="button" aria-describedby="hint"><span class="face">押す</span></button>
    <div class="side">
      <p id="hint">押した時に「押す音」、離した時に「離す音」が鳴る。録音は使わず、毎回その場で波を計算している。Tab で選んで Space か Enter でも押せる。</p>
      <button id="burst" class="sub" type="button">続けて 8 回鳴らす</button>
    </div>
  </div>
  <fieldset id="kinds"><legend>ボタンの種類</legend></fieldset>
  <div class="sl">
    <label><span>大きさ</span><input type="range" id="size" min="0.6" max="1.6" step="0.01" value="1"><output id="sizeO" for="size"></output></label>
    <label><span>硬さ</span><input type="range" id="hard" min="0" max="1" step="0.01" value="0.6"><output id="hardO" for="hard"></output></label>
    <label><span>響きの長さ</span><input type="range" id="ring" min="0.4" max="2.5" step="0.01" value="1"><output id="ringO" for="ring"></output></label>
    <label><span>ばらつき</span><input type="range" id="vary" min="0" max="1" step="0.01" value="0.5"><output id="varyO" for="vary"></output></label>
  </div>
  <canvas id="wave" role="img" aria-label="押す音と離す音の波の形"></canvas>
  <p class="note">上の段が押す音（薄い線は前の 4 回）、下の段が離す音。▼ は当たった時刻。ばらつきを 0 にして「続けて 8 回」を押すと、同じ録音を繰り返した時の聞こえ方と比べられる。</p>
  <p id="info"></p>
</div>`,
  css: `:root { color-scheme: dark; --ac: #f0b44c; }
body { margin: 0; background: #1f2128; color: #ece8df; font: 14px/1.6 system-ui, sans-serif; accent-color: var(--ac); }
.wrap { display: grid; gap: 12px; padding: 14px; max-width: 760px; margin: 0 auto; }
.stage { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px 18px; align-items: center; }
.side { display: grid; gap: 8px; justify-items: start; }
.side p { margin: 0; color: #cfc9bd; }
.cap { width: 120px; height: 120px; padding: 0; border: 0; border-radius: 22px; background: linear-gradient(#3a3e49, #2b2e37); color: #ece8df; font: 700 18px system-ui, sans-serif; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; box-shadow: 0 8px 0 #121318, 0 10px 18px #0008, inset 0 1px 0 #ffffff22; }
.cap .face { display: grid; place-items: center; width: 84px; height: 84px; margin: auto; border-radius: 14px; background: linear-gradient(#4a4f5c, #3a3e49); box-shadow: inset 0 2px 0 #ffffff1c, inset 0 -3px 0 #0003; }
.cap:hover .face { background: linear-gradient(#565c6a, #414653); }
.cap.down { translate: 0 6px; box-shadow: 0 2px 0 #121318, 0 3px 6px #0008, inset 0 1px 0 #ffffff22; }
@media (prefers-reduced-motion: no-preference) { .cap { transition: translate 40ms ease-out, box-shadow 40ms ease-out; } }
:focus-visible { outline: 2px solid #f6d58e; outline-offset: 3px; }
.sub { padding: 6px 14px; border: 1px solid #4a4f5c; border-radius: 8px; background: #2f333d; color: #ece8df; font: inherit; cursor: pointer; }
.sub:hover { background: #3a3f4b; }
.sub:active { scale: 0.97; }
.sub[aria-disabled="true"] { opacity: 0.6; cursor: default; }
fieldset { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; padding: 6px 12px 10px; border: 1px solid #3b3f4a; border-radius: 10px; }
legend { padding: 0 4px; color: #b8b2a6; }
fieldset label { cursor: pointer; }
.sl { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 4px 18px; }
.sl label { display: grid; grid-template-columns: 5.5em minmax(0, 1fr) 7.5em; align-items: center; gap: 8px; }
.sl input { width: 100%; margin: 0; }
.sl output { font: 12px ui-monospace, monospace; color: #cfc9bd; }
canvas { display: block; width: 100%; height: 190px; border-radius: 10px; background: #16181d; }
.note { margin: 0; color: #b8b2a6; font-size: 13px; }
#info { margin: 0; min-height: 6.4em; color: #cfc9bd; font: 12.5px/1.6 ui-monospace, monospace; white-space: pre-line; overflow-wrap: anywhere; }
@media (max-width: 520px) { .stage { grid-template-columns: minmax(0, 1fr); justify-items: center; } .side { justify-items: center; text-align: center; } }
.thumb .side, .thumb fieldset, .thumb .sl, .thumb .note, .thumb #info { display: none; }
.thumb .wrap { grid-template-columns: auto minmax(0, 1fr); align-items: center; }
.thumb .cap { width: 96px; height: 96px; }
.thumb .cap .face { width: 66px; height: 66px; }
.thumb canvas { height: 170px; }`,
  core() {
    // 種（seed）から決まった乱数の列を出す（mulberry32）。同じ種なら同じ音になる
    function rng(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // ボタンの種類。modes は響き [周波数 Hz, 減る時間 τ 秒, 強さ]（実物を測った値ではなく、それらしく決めた値）。
    // down と up は当たりの並び [時刻 秒, 強さ, 響きの高さの倍率]。noise は当たりの瞬間のざらつきの強さ
    const KINDS = {
      key: {
        name: 'キーボードのキー', sound: 'コトッ', noise: 0.25,
        modes: [[430, 0.02, 1], [1010, 0.012, 0.55], [2350, 0.006, 0.35], [4200, 0.0035, 0.25], [7300, 0.045, 0.035]],
        down: [[0, 0.25, 1.7], [0.0065, 1, 1]],
        up: [[0, 0.5, 1.12], [0.0035, 0.2, 1.6]],
      },
      mouse: {
        name: 'マウスのボタン', sound: 'カチッ', noise: 0.4,
        modes: [[1850, 0.009, 1], [3650, 0.006, 0.7], [6050, 0.004, 0.5], [9100, 0.0025, 0.3]],
        down: [[0, 1, 1], [0.0022, 0.25, 0.8]],
        up: [[0, 0.75, 1.1], [0.0018, 0.15, 0.85]],
      },
      toggle: {
        name: '金属のトグルスイッチ', sound: 'パチン', noise: 0.3,
        modes: [[1180, 0.055, 1], [2950, 0.04, 0.55], [5100, 0.028, 0.4], [7900, 0.018, 0.25]],
        down: [[0, 1, 1], [0.0085, 0.35, 1.04]],
        up: [[0, 0.9, 0.96], [0.0075, 0.3, 1.02]],
      },
      pen: {
        name: 'ボールペンのノック', sound: 'カチャ', noise: 0.35,
        modes: [[2550, 0.012, 1], [4350, 0.008, 0.6], [1150, 0.018, 0.4], [7200, 0.005, 0.35], [5800, 0.07, 0.04]],
        down: [[0, 0.6, 1], [0.011, 1, 0.9]],
        up: [[0, 0.85, 1.08], [0.006, 0.3, 0.7]],
      },
      wood: {
        name: '木の押しボタン', sound: 'コン', noise: 0.15,
        modes: [[310, 0.032, 1], [760, 0.018, 0.5], [1650, 0.009, 0.3], [2900, 0.004, 0.15]],
        down: [[0, 1, 1]],
        up: [[0, 0.45, 1.05]],
      },
    };

    // 硬さ 0〜1 を、当たっている時間（秒）に直す。0 は 1.6 ms（やわらかい）、1 は 0.16 ms（硬い）
    function contactTime(hard) {
      return 0.0016 * Math.pow(0.1, Math.min(1, Math.max(0, hard)));
    }

    // 当たりの長さ ex 秒のとき、周波数 f の響きがどれだけ残るか（硬く短い当たりほど高い響きが残る）
    function softness(f, ex) {
      return 1 / (1 + (f * ex) * (f * ex));
    }

    // 音の大きさをそろえるための基準（ばらつき 0 の押す音の一番大きい値）。同じ設定なら覚えておく
    const refPeak = new Map();

    // ボタンの音を1つ計算する。o = { sr, kind, phase: 'down' | 'up', seed, size, hard, ring, vary }
    // 返す値: { data: Float32Array, sr, dur, events: 当たりの時刻の配列, modes: 響きの配列, peak }
    function synthClick(o) {
      const sr = o.sr || 48000;
      const K = KINDS[o.kind] || KINDS.key;
      const phase = o.phase === 'up' ? 'up' : 'down';
      const size = o.size == null ? 1 : o.size;
      const hard = o.hard == null ? 0.6 : o.hard;
      const ring = o.ring == null ? 1 : o.ring;
      const v = o.vary == null ? 0.5 : Math.min(1, Math.max(0, o.vary));
      const rand = rng(o.seed == null ? 1 : o.seed);
      // 1 ± w·v の範囲でずらす
      const j = (w) => 1 + (rand() - 0.5) * 2 * w * v;
      const ex0 = contactTime(hard);
      const pitch = j(0.015) / size;
      const modes = K.modes.map(([f, tau, gain]) => ({ f: f * pitch * j(0.03), tau: tau * ring * j(0.2), g: gain * j(0.3) }));
      const events = K[phase].map(([t, a, p]) => ({ t: t * j(0.3), a: a * j(0.25), p }));
      // 響きが 1/1000 まで減る時間（τ·ln(強さ/0.001)）。一番遅く消える所までを音の長さにする
      const life = (a, m) => m.tau * Math.log(Math.max(1.001, (a * m.g) / 0.001));
      let end = 0;
      for (const e of events) for (const m of modes) end = Math.max(end, e.t + life(e.a, m));
      end = Math.min(0.6, end + 0.004);
      const n = Math.max(1, Math.round(end * sr));
      const data = new Float32Array(n);
      for (const e of events) {
        const i0 = Math.min(n - 1, Math.round(e.t * sr));
        const ex = ex0 / Math.sqrt(e.p);
        // 立ち上がりを当たりの長さだけなめらかにする
        const ad = Math.exp(-1 / Math.max(1, ex * sr));
        for (const m of modes) {
          const f = m.f * e.p;
          if (f >= sr * 0.45) continue;
          const amp = e.a * m.g * softness(f, ex);
          const w = (2 * Math.PI * f) / sr;
          const d = Math.exp(-1 / (m.tau * sr));
          // 減っていく正弦波 A·d^k·sin(kω) を、sin を呼ばずに2つ前までの値から進める
          const cw = 2 * d * Math.cos(w), d2 = d * d;
          let y0 = 0, y1 = amp * d * Math.sin(w), att = 1;
          const len = Math.min(n - i0, Math.ceil(life(e.a, m) * sr) + 1);
          for (let k = 1; k < len; k++) {
            att *= ad;
            data[i0 + k] += y1 * (1 - att);
            const y2 = cw * y1 - d2 * y0;
            y0 = y1;
            y1 = y2;
          }
        }
        // 当たりの瞬間のざらつき: 白い雑音を1次の低域通過にかけ、すぐ減らす
        const nt = 0.0006 + ex;
        const nd = Math.exp(-1 / (nt * sr));
        const fc = Math.min(sr * 0.45, 4 / (2 * Math.PI * ex));
        const lp = 1 - Math.exp((-2 * Math.PI * fc) / sr);
        const nlen = Math.min(n - i0, Math.ceil(nt * sr * 8));
        let env = e.a * K.noise, z = 0, prev = 0;
        for (let k = 0; k < nlen; k++) {
          z += lp * (rand() * 2 - 1 - z);
          // 差を取って低い音を除く（カチッという音のざらつきだけを残す）
          data[i0 + k] += (z - prev) * env * 4;
          prev = z;
          env *= nd;
        }
      }
      let peak = 0;
      for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
      if (o.raw) return { data, sr, dur: n / sr, events: events.map((e) => e.t), modes, peak };
      // 同じ設定のばらつき 0 の押す音が 0.6 になるように大きさをそろえる（ばらつきによる大小は残る）
      const key = [o.kind, sr, size, hard, ring].join(',');
      if (!refPeak.has(key)) {
        if (refPeak.size > 64) refPeak.clear();
        const r = synthClick({ sr, kind: o.kind, phase: 'down', seed: 7, size, hard, ring, vary: 0, raw: true });
        refPeak.set(key, r.peak || 1);
      }
      const gain = 0.6 / refPeak.get(key);
      peak = 0;
      for (let i = 0; i < n; i++) {
        let x = data[i] * gain;
        // 0.9 を超える所だけ、なめらかに抑える
        if (x > 0.9) x = 0.9 + 0.1 * Math.tanh((x - 0.9) / 0.1);
        else if (x < -0.9) x = -0.9 - 0.1 * Math.tanh((-x - 0.9) / 0.1);
        data[i] = x;
        peak = Math.max(peak, Math.abs(x));
      }
      return { data, sr, dur: n / sr, events: events.map((e) => e.t), modes, peak };
    }

    // 音の中心の高さ（スペクトルの重心、Hz）。先頭の N 個にハン窓をかけて離散フーリエ変換する
    function centroid(data, sr, N) {
      const n = Math.min(N || 1024, data.length);
      if (n < 8) return 0;
      const cosT = new Float64Array(n), sinT = new Float64Array(n), x = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        cosT[i] = Math.cos((2 * Math.PI * i) / n);
        sinT[i] = Math.sin((2 * Math.PI * i) / n);
        x[i] = data[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
      }
      let num = 0, den = 0;
      for (let k = 1; k < n >> 1; k++) {
        let re = 0, im = 0, idx = 0;
        for (let i = 0; i < n; i++) {
          re += x[i] * cosT[idx];
          im -= x[i] * sinT[idx];
          idx += k;
          if (idx >= n) idx -= n;
        }
        const mag = Math.hypot(re, im);
        num += (mag * k * sr) / n;
        den += mag;
      }
      return den > 0 ? num / den : 0;
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const cap = $('cap'), cv = $('wave'), g = cv.getContext('2d'), info = $('info'), burst = $('burst');
    const S = { kind: 'key', size: 1, hard: 0.6, ring: 1, vary: 0.5 };
    let ac = null, master = null, count = 0, isDown = false, busy = false;
    let lastDown = null, lastUp = null, ghosts = [];

    // ボタンの種類の選択肢
    const box = $('kinds');
    for (const id of Object.keys(KINDS)) {
      const k = KINDS[id];
      const lab = document.createElement('label');
      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'kind';
      inp.value = id;
      inp.checked = id === S.kind;
      inp.addEventListener('change', () => { S.kind = id; resetShape(); });
      lab.append(inp, ' ' + k.name + '（' + k.sound + '）');
      box.append(lab);
    }
    function setKind(id) {
      S.kind = id;
      const r = box.querySelector('input[value="' + id + '"]');
      if (r) r.checked = true;
    }

    // つまみ
    const FMT = {
      size: (v) => '×' + v.toFixed(2),
      hard: (v) => Math.round(v * 100) + '%',
      ring: (v) => '×' + v.toFixed(2),
      vary: (v) => (v === 0 ? '0（毎回同じ）' : Math.round(v * 100) + '%'),
    };
    for (const k of Object.keys(FMT)) {
      const inp = $(k), out = $(k + 'O');
      const show = () => { S[k] = Number(inp.value); out.textContent = FMT[k](S[k]); };
      inp.addEventListener('input', () => { show(); if (k !== 'vary') resetShape(); });
      show();
    }

    // 設定を変えたら、鳴らさずに見本の形だけ描き直す
    function resetShape() {
      ghosts = [];
      lastDown = make('down');
      lastUp = make('up');
      draw();
      tell(lastDown, false);
    }

    // 音はクリックやキーを押した後で用意する
    function audio() {
      if (!ac) {
        ac = new AudioContext();
        master = ac.createGain();
        master.gain.value = 0.8;
        master.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
    }
    // ばらつきが 0 なら毎回同じ種（= 同じ録音を繰り返すのと同じ）、それ以外は毎回新しい種
    function make(phase) {
      const seed = S.vary > 0 ? Math.floor(Math.random() * 4294967296) >>> 0 : phase === 'down' ? 101 : 202;
      const r = synthClick({ sr: ac ? ac.sampleRate : 48000, kind: S.kind, phase, seed, size: S.size, hard: S.hard, ring: S.ring, vary: S.vary });
      r.seed = seed;
      r.phase = phase;
      return r;
    }
    function play(snd, when) {
      if (!ac || window.THUMB) return;
      const b = ac.createBuffer(1, snd.data.length, snd.sr);
      b.copyToChannel(snd.data, 0);
      const s = ac.createBufferSource();
      s.buffer = b;
      s.connect(master);
      s.start(when || 0);
    }

    function showDown(snd) {
      count++;
      cap.classList.add('down');
      if (lastDown) ghosts = [lastDown].concat(ghosts).slice(0, 4);
      lastDown = snd;
      lastUp = null;
      draw();
      tell(snd, true);
    }
    function showUp(snd) {
      cap.classList.remove('down');
      lastUp = snd;
      draw();
      tell(snd, true);
    }
    function press() {
      if (isDown || busy) return;
      isDown = true;
      const snd = make('down');
      play(snd);
      showDown(snd);
    }
    function release() {
      if (!isDown) return;
      isDown = false;
      const snd = make('up');
      play(snd);
      showUp(snd);
    }

    function tell(s, pressed) {
      const head = (s.phase === 'down' ? '押す音' : '離す音') + (pressed ? ' #' + count : '（見本の形。まだ鳴らしていない）');
      const c = centroid(s.data, s.sr);
      info.textContent = head + '　種 ' + s.seed +
        '\n当たり ' + s.events.length + ' 回: ' + s.events.map((t) => (t * 1000).toFixed(1) + ' ms').join('・') +
        '\n響き: ' + s.modes.map((m) => Math.round(m.f) + ' Hz').join('・') +
        '\n音の中心 ' + (c / 1000).toFixed(2) + ' kHz・長さ ' + Math.round(s.dur * 1000) + ' ms・一番大きい所 ' + s.peak.toFixed(2);
    }

    // ---- 波の形を描く ----
    function sizeCanvas() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return [w, h];
    }
    // 表に出す長さ: どの音も一番大きい所の 2% より小さくなる時刻まで（10 ms 単位で切り上げ）
    function spanOf(list) {
      let t = 0.02;
      for (const s of list) {
        if (!s) continue;
        const lim = s.peak * 0.02;
        for (let i = s.data.length - 1; i >= 0; i--) {
          if (Math.abs(s.data[i]) > lim) { t = Math.max(t, i / s.sr); break; }
        }
      }
      return Math.min(0.4, Math.ceil(t * 100) / 100);
    }
    // 1 画素の幅に入るサンプルの最小と最大を縦線で描く
    function wave(s, x0, y0, pw, amp, span, color) {
      const n = s.data.length, per = (span * s.sr) / pw;
      g.fillStyle = color;
      for (let px = 0; px < pw; px++) {
        const a = Math.floor(px * per), b = Math.min(n, Math.floor((px + 1) * per) + 1);
        if (a >= n) break;
        let lo = 0, hi = 0;
        for (let i = a; i < b; i++) {
          const v = s.data[i];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        const y1 = y0 - hi * amp, y2 = y0 - lo * amp;
        g.fillRect(x0 + px, y1, 1, Math.max(1, y2 - y1));
      }
    }
    function draw() {
      const [w, h] = sizeCanvas();
      g.fillStyle = '#16181d';
      g.fillRect(0, 0, w, h);
      const L = 46, R = 26, T = 8, B = 22;
      const pw = Math.max(1, Math.floor(w - L - R));
      const rowH = Math.max(1, (h - T - B) / 2);
      const span = spanOf([lastDown, lastUp].concat(ghosts));
      g.font = '12px system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.lineWidth = 1;
      // 時刻の目盛り
      const step = [0.005, 0.01, 0.02, 0.05, 0.1].find((s) => span / s <= 6) || 0.1;
      g.textAlign = 'center';
      for (let t = 0; t <= span + 1e-9; t += step) {
        const x = Math.round(L + (pw * t) / span) + 0.5;
        g.strokeStyle = '#2a2e37';
        g.beginPath();
        g.moveTo(x, T);
        g.lineTo(x, T + rowH * 2);
        g.stroke();
        g.fillStyle = '#8e887c';
        g.fillText(Math.round(t * 1000) + ' ms', x, h - B / 2);
      }
      const rows = [
        { label: '押す', y: T + rowH / 2, list: ghosts, main: lastDown, col: '#f0b44c', ghost: 'rgba(240, 180, 76, 0.22)' },
        { label: '離す', y: T + rowH * 1.5, list: [], main: lastUp, col: '#6cc4e8', ghost: '' },
      ];
      for (const r of rows) {
        g.strokeStyle = '#3b3f4a';
        g.beginPath();
        g.moveTo(L, Math.round(r.y) + 0.5);
        g.lineTo(L + pw, Math.round(r.y) + 0.5);
        g.stroke();
        g.fillStyle = '#cfc9bd';
        g.textAlign = 'left';
        g.fillText(r.label, 6, r.y);
        const amp = rowH * 0.46;
        for (const s of r.list) wave(s, L, r.y, pw, amp, span, r.ghost);
        if (r.main) {
          wave(r.main, L, r.y, pw, amp, span, r.col);
          // 当たった時刻（▼）
          g.fillStyle = r.col;
          const ty = r.y - rowH / 2 + 2;
          for (const t of r.main.events) {
            const x = L + (pw * t) / span;
            g.beginPath();
            g.moveTo(x - 4, ty);
            g.lineTo(x + 4, ty);
            g.lineTo(x, ty + 6);
            g.fill();
          }
        } else {
          g.fillStyle = '#6f6a60';
          g.textAlign = 'center';
          g.fillText('離すと、ここに出る', L + pw / 2, r.y);
        }
      }
      cv.setAttribute('aria-label', '上の段は押す音、下の段は離す音の波の形。横は時刻で、0 から ' + Math.round(span * 1000) + ' ミリ秒まで。');
    }

    // ---- 操作 ----
    cap.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      try { cap.setPointerCapture(e.pointerId); } catch (err) { /* 捕まえられなくても鳴らす */ }
      audio();
      press();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) cap.addEventListener(type, () => { if (ac) audio(); release(); });
    cap.addEventListener('contextmenu', (e) => e.preventDefault());
    cap.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (e.repeat) return;
      audio();
      press();
    });
    cap.addEventListener('keyup', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      release();
    });
    cap.addEventListener('blur', () => release());

    // 続けて 8 回: 先に 16 個の音を作り、AudioContext の時計で並べて鳴らす
    burst.addEventListener('click', () => {
      if (busy || isDown) return;
      audio();
      busy = true;
      burst.setAttribute('aria-disabled', 'true');
      const gap = 0.17, hold = 0.075, lead = 0.06, t0 = ac.currentTime + lead;
      for (let i = 0; i < 8; i++) {
        const d = make('down'), u = make('up');
        play(d, t0 + i * gap);
        play(u, t0 + i * gap + hold);
        setTimeout(() => showDown(d), (lead + i * gap) * 1000);
        setTimeout(() => showUp(u), (lead + i * gap + hold) * 1000);
      }
      setTimeout(() => { busy = false; burst.removeAttribute('aria-disabled'); }, (lead + 8 * gap) * 1000 + 50);
    });

    // 一覧の小窓では、ボタンと波の形だけを並べる
    if (window.THUMB) document.body.classList.add('thumb');
    resetShape();
    if ('ResizeObserver' in window) new ResizeObserver(() => draw()).observe(cv);

    // 一覧の小窓: 音は出さずに、押す・離すをくり返して波の形を見せる
    if (window.THUMB) {
      const ids = Object.keys(KINDS);
      let i = 0;
      const loop = () => {
        showDown(make('down'));
        setTimeout(() => {
          showUp(make('up'));
          i++;
          if (i % 3 === 0) {
            setKind(ids[(i / 3) % ids.length]);
            ghosts = [];
            lastDown = null;
          }
          setTimeout(loop, 520);
        }, 150);
      };
      loop();
    }
  },
});
dekiru.add({
  id: 'tr-20261126-loudness-eq', c: 'trend', lv: 3, date: '2026-11-26',
  t: 'Windows の「ラウドネス イコライゼーション」と同じ計算で、小さい声を持ち上げ、大きな音はすぐ下げて、音量の差を縮める',
  y: 'うぃんどうずのらうどねす いこらいぜーしょんとおなじけいさんで ちいさいこえをもちあげ おおきなおとはすぐさげて おんりょうのさをちぢめる',
  tags: ['pw-loudness-eq', 'Loudness Equalization', 'Web Audio', 'FFT', 'OfflineAudioContext', 'リミッター'],
  d: 'Windows のサウンドの設定にある「ラウドネス イコライゼーション」（Loudness Equalization）は、小さい音を持ち上げ、大きい音を抑えて、音量の差を小さくする機能である。2026-11-25 に Hacker News で 300 点近くを集めた pw-loudness-eq は、これを Windows の WMALFXGFXDSP.dll から逆解析して Linux の PipeWire へ移したもので、README に計算の手順と定数が文章で書かれている。この見本は、その文章をもとに計算を JavaScript で書き、ブラウザの中で動かす。512 サンプルずつ FFT で 25 の帯の力を求めて音の大きさ L を出し、目標のゲイン (1300/L)^1.6（最大 +20 dB）へ、下げる時はすぐ、上げる時は「戻りの速さ」に応じてゆっくり近づける。出口には、Windows の音声エンジンと同じ考え方の先読みリミッターを付けた。見本の場面（声に似せた合成音の会話・爆発・口笛）は Web Audio の OfflineAudioContext で作り、手元の音声ファイルでも試せる（ファイルはブラウザの中だけで扱う）。再現できていない所: Windows の出力と同じになるかは突き合わせていない（README の文章だけを元にし、pw-loudness-eq のコードも DLL も見ていない）。ゲインの初期値は README に無いので 1 とした。リミッターは README の説明どおりに作ると、だんだん大きくなる音で出口が 1 を少し超えたので、下げている途中に新しい山が来たら急な方の傾きを使うように変えた。アプリごとに分けて処理する所と、PipeWire の音量との関係は扱っていない。',
  p: '音の大きさは、窓をかけた 512 サンプルを FFT し、周波数ごとの力を 100 Hz〜24 kHz の 25 帯に足し合わせ、帯ごとの値 T を引いてから 4 乗根を取って足す（L = 1.72·Σ max(E − T, 0)^0.25）。4 乗根を取るので、1 つの帯に集まった音（口笛など）は小さく数えられ、大きく持ち上げられる。ゲインは半分ずつ重ねた 256 サンプルごとに更新し、目標より大きければすぐ目標まで下げ、小さければ g += w·(目標 − g) で近づける。w は戻りの速さ r から (N/128)·(44100/fs)·0.1^min(r,3)·0.316^(min(r,7)−min(r,3)) で決まり、r = 4 で時定数は約 4.6 秒になる。ブロックの間はゲインを直線でつなぐ。リミッターは 64 フレーム先を見て、山が出ていく時までに 0.985/山 へ直線で下げる。聞き比べは、元の音と処理した音の 2 つの AudioBufferSourceNode を同じ時刻から鳴らし、GainNode で片方だけが聞こえるようにする。',
  refs: [
    { title: 'xoxorwr/pw-loudness-eq（README の「The algorithm」と「The limiter」に計算の手順と定数）', url: 'https://github.com/xoxorwr/pw-loudness-eq' },
    { title: 'Hacker News: Windows Loudness Equalization, reverse-engineered and ported to PipeWire', url: 'https://news.ycombinator.com/item?id=50641171' },
  ],
  html: `<div class="wrap">
  <div class="bar">
    <button id="play" class="main" type="button" disabled>再生</button>
    <label class="sw"><input type="checkbox" id="on" switch role="switch" checked> 音量の均一化（Loudness Equalization）</label>
  </div>
  <canvas id="view" role="img" aria-label="元の音と、均一化した後の音の波の形と、かけたゲイン"></canvas>
  <p id="now"></p>
  <div class="ctl">
    <label class="rl"><span>戻りの速さ</span><input type="range" id="rel" min="2" max="7" step="1" value="4"><output id="relO" for="rel"></output></label>
    <div class="fl">
      <label>手元の音声ファイルで試す（最初の 3 分）<input type="file" id="file" accept="audio/*"></label>
      <button id="back" class="sub" type="button" hidden>見本の場面に戻す</button>
    </div>
  </div>
  <p id="msg" role="status"></p>
  <p id="sum"></p>
  <p class="note">上の段が元の音、中の段が均一化した後の音（出口のリミッターまで通したもの）。下の段の線がかけたゲイン（0〜+20 dB）で、赤はリミッターが下げた所。波の上を押すと、その位置から再生する。再生中にスイッチを切り替えると、同じ位置のまま元の音と聞き比べられる。戻りの速さを 2 にすると、爆発のあとの会話がすぐ大きくなり、7 にするとなかなか戻らない。口笛のように 1 つの高さに集まった音は小さく数えられるので、会話よりも大きく持ち上がる（README に書かれている性質と同じ）。</p>
</div>`,
  css: `:root { color-scheme: dark; --ac: #f2b450; }
[hidden] { display: none !important; }
body { margin: 0; background: #1c1e24; color: #ece8df; font: 14px/1.6 system-ui, sans-serif; accent-color: var(--ac); }
.wrap { display: grid; gap: 10px; padding: 14px; max-width: 820px; margin: 0 auto; }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; }
.main { min-width: 6.5em; padding: 8px 18px; border: 0; border-radius: 8px; background: var(--ac); color: #1c1e24; font: 700 15px system-ui, sans-serif; cursor: pointer; }
.main:hover { background: #f6c470; }
.main:disabled { opacity: 0.5; cursor: progress; }
.sw { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
input[type="checkbox"][switch] { margin: 0; cursor: pointer; }
:focus-visible { outline: 2px solid #f6d58e; outline-offset: 3px; }
canvas { display: block; width: 100%; height: 300px; border-radius: 10px; background: #14161b; cursor: pointer; touch-action: manipulation; }
#now { margin: 0; min-height: 3.2em; color: #cfc9bd; font: 12.5px/1.6 ui-monospace, monospace; white-space: pre-line; overflow-wrap: anywhere; }
.ctl { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 8px 20px; align-items: start; }
.rl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; align-items: center; }
.rl input { width: 100%; margin: 0; }
.rl output { grid-column: 1 / -1; color: #cfc9bd; font: 12px ui-monospace, monospace; }
.fl { display: grid; gap: 6px; justify-items: start; min-width: 0; }
.fl label { display: grid; gap: 4px; max-width: 100%; }
.fl input { max-width: 100%; color: #cfc9bd; font: inherit; }
.sub { padding: 5px 12px; border: 1px solid #4a4f5c; border-radius: 8px; background: #2f333d; color: #ece8df; font: inherit; cursor: pointer; }
.sub:hover { background: #3a3f4b; }
#msg, #sum, .note { margin: 0; }
#sum { color: #cfc9bd; font-size: 13px; }
.note { color: #b8b2a6; font-size: 13px; }
.thumb .bar, .thumb .ctl, .thumb #now, .thumb #msg, .thumb #sum, .thumb .note { display: none; }
.thumb .wrap { padding: 8px; }
.thumb canvas { height: 232px; }`,
  core() {
    // 帯の上の端（Hz）。0〜100 Hz から 15500〜24000 Hz までの 25 帯
    const EDGES = [100, 200, 300, 400, 510, 630, 770, 920, 1080, 1270, 1480, 1720, 2000, 2320, 2700, 3150, 3700, 4400, 5300, 6400, 7700, 9500, 12000, 15500, 24000];
    // 帯ごとに差し引く値（これより小さい力は数えない）
    const TH = [1000, 100, 31.6, 10, 3.16, 2, 1, 1, 0.316, 0.316, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 10, 100, 1000];

    // 1 回に調べる長さ N = 2^⌈log2(fs/100)⌉（44.1 kHz と 48 kHz では 512）
    function frameSize(fs) {
      return Math.pow(2, Math.ceil(Math.log2(fs / 100)));
    }

    // 戻りの速さ r（2〜7）のとき、ゲインを上げる時に 1 ブロック（N/2 サンプル）ごとに目標へ近づく割合
    function riseRate(N, fs, r) {
      return (N / 128) * (44100 / fs) * Math.pow(0.1, Math.min(r, 3)) * Math.pow(0.316, Math.min(r, 7) - Math.min(r, 3));
    }

    // 上げる時の時定数（秒）。1 ブロックで割合 w だけ近づくので、約 (ブロックの秒数)/w
    function riseSeconds(fs, r) {
      const N = frameSize(fs);
      return N / 2 / fs / riseRate(N, fs, r);
    }

    // 帯ごとの力 E（25 個）から音の大きさ L を出す
    function loudnessOf(E) {
      let s = 0;
      for (let b = 0; b < 25; b++) s += Math.pow(Math.max(E[b] - TH[b], 1e-32), 0.25);
      return 1.72 * s;
    }

    // L から目標のゲイン（最大 10 倍 = +20 dB）
    function targetGain(L) {
      return Math.min(Math.pow(1300 / Math.max(L, 1e-12), 1.6), 10);
    }

    // その場で書き換える基数 2 の FFT（re と im は長さ N の配列、N は 2 の累乗）
    function fft(re, im) {
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
          let t = re[i]; re[i] = re[j]; re[j] = t;
          t = im[i]; im[i] = im[j]; im[j] = t;
        }
      }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
        for (let i = 0; i < n; i += len) {
          let cr = 1, ci = 0;
          for (let k = 0; k < half; k++) {
            const a = i + k, b = a + half;
            const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
            re[b] = re[a] - xr;
            im[b] = im[a] - xi;
            re[a] += xr;
            im[a] += xi;
            const t = cr * wr - ci * wi;
            ci = cr * wi + ci * wr;
            cr = t;
          }
        }
      }
    }

    // ラウドネス イコライゼーション本体。chs はチャンネルごとの Float32Array の配列、fs はサンプリング周波数、r は戻りの速さ。
    // 返す値: { out: 処理した配列, gains: ブロックごとのゲイン, loud: ブロックごとの L, hop: ブロックの長さ, N }
    function equalize(chs, fs, r, g0) {
      const N = frameSize(fs), H = N >> 1, n = chs[0].length;
      const w = riseRate(N, fs, r == null ? 4 : r);
      const win = new Float64Array(N);
      for (let i = 0; i < N; i++) win[i] = (16384 * (1 - Math.cos((2 * Math.PI * (i + 0.5)) / N))) / (N / 2);
      // 周波数の番号 q が入る帯（24 kHz より上は -1）
      const bandOf = new Int8Array(H + 1);
      for (let q = 0; q <= H; q++) {
        const f = (q * fs) / N;
        let b = 0;
        while (b < 25 && f >= EDGES[b]) b++;
        bandOf[q] = b < 25 ? b : -1;
      }
      const blocks = Math.max(1, Math.ceil(n / H));
      const gains = new Float32Array(blocks), loud = new Float32Array(blocks);
      const out = chs.map(() => new Float32Array(n));
      const re = new Float64Array(N), im = new Float64Array(N), E = new Float64Array(25);
      let g = g0 == null ? 1 : g0;
      for (let k = 0; k < blocks; k++) {
        const s = k * H;
        E.fill(0);
        // チャンネルごとに FFT し、帯ごとの力をチャンネルをまたいで足す
        for (const x of chs) {
          for (let i = 0; i < N; i++) {
            const j = s + i;
            re[i] = j < n ? x[j] * win[i] : 0;
            im[i] = 0;
          }
          fft(re, im);
          for (let q = 0; q <= H; q++) {
            const b = bandOf[q];
            if (b >= 0) E[b] += re[q] * re[q] + im[q] * im[q];
          }
        }
        const L = loudnessOf(E), tg = targetGain(L), prev = g;
        // 下げる時はすぐ、上げる時はゆっくり
        g = tg < g ? tg : g + w * (tg - g);
        gains[k] = g;
        loud[k] = L;
        // 調べた N サンプルの前半に、前のゲインから今のゲインへ直線でつないでかける。
        // 本物は N サンプル遅れて出すので、その遅れの分を先読みに使っているのと同じになる
        const e = Math.min(n, s + H);
        for (let c = 0; c < chs.length; c++) {
          const x = chs[c], y = out[c];
          for (let j = s; j < e; j++) y[j] = x[j] * (prev + ((g - prev) * (j - s)) / H);
        }
      }
      return { out, gains, loud, hop: H, N };
    }

    // 出口のリミッターの先読みの長さ（フレーム数）
    function lookahead(fs) {
      return fs <= 12000 ? 16 : fs <= 24000 ? 32 : fs <= 48000 ? 64 : 128;
    }

    // 先読み付きのリミッター。全チャンネルで同じゲインを使い、chs をその場で書き換える。
    // 返す値: 各サンプルにかけたゲイン（Float32Array）
    function limit(chs, fs) {
      const n = chs[0].length, La = lookahead(fs), up = Math.exp(2.205 / fs);
      const gain = new Float32Array(n);
      const delay = chs.map(() => new Float32Array(La));
      let tp = 0.985, g = 1, step = 0, tgt = 1, ramp = false;
      for (let i = 0; i < n + La; i++) {
        // 入ってくるフレームの一番大きい値
        let pk = 0;
        if (i < n) for (const x of chs) pk = Math.max(pk, Math.abs(x[i]));
        if (pk > tp) {
          // La フレーム後にこのフレームが出ていく時に 0.985/pk になるように下げ始める。
          // 下げている途中なら、前の山にも間に合うように急な方の傾きを使う
          tp = pk;
          tgt = 0.985 / pk;
          step = Math.min(ramp ? step : 0, (tgt - g) / La);
          ramp = true;
        } else if (!ramp && pk <= tp / 2 && g < 1) {
          // 入ってくる音が山の半分以下になったら、ゆっくり戻す（1 秒に約 19 dB）
          g = Math.min(1, g * up);
          tp = Math.max(0.985, tp / up);
        }
        if (ramp) {
          g += step;
          if (g <= tgt) {
            g = tgt;
            ramp = false;
          }
        }
        // 先読みの分だけ遅れて出ていくフレーム
        const j = i - La, slot = i % La;
        for (let c = 0; c < chs.length; c++) {
          const old = delay[c][slot];
          if (i < n) delay[c][slot] = chs[c][i];
          if (j >= 0) chs[c][j] = old * g;
        }
        if (j >= 0) gain[j] = g;
      }
      return gain;
    }

    // t0〜t1 秒の実効値（dBFS）。全チャンネルをまとめて計算する
    function rmsDb(chs, fs, t0, t1) {
      const a = Math.max(0, Math.floor(t0 * fs)), b = Math.min(chs[0].length, Math.floor(t1 * fs));
      if (b <= a) return -Infinity;
      let sum = 0;
      for (const x of chs) for (let i = a; i < b; i++) sum += x[i] * x[i];
      return 10 * Math.log10(sum / ((b - a) * chs.length) + 1e-20);
    }

    // win 秒（既定 0.4 秒）ごとの音の大きさ（dB）を並べ、無音（−50 dB 未満）を除いて、
    // 大きい方から 10% の所と小さい方から 10% の所の差を返す。
    // ref（元の音）を渡すと、無音かどうかを ref の大きさで決める（処理の前と後で同じ区間を比べるため）
    function spread(chs, fs, win, ref) {
      const n = chs[0].length, m = Math.max(1, Math.round(fs * (win || 0.4)));
      const level = (xs, s) => {
        let sum = 0;
        for (const x of xs) for (let i = s; i < s + m; i++) sum += x[i] * x[i];
        return 10 * Math.log10(sum / (m * xs.length) + 1e-20);
      };
      const lv = [];
      for (let s = 0; s + m <= n; s += m) {
        if (level(ref || chs, s) > -50) lv.push(level(chs, s));
      }
      if (lv.length < 2) return 0;
      lv.sort((a, b) => a - b);
      const at = (p) => lv[Math.min(lv.length - 1, Math.max(0, Math.round(p * (lv.length - 1))))];
      return at(0.9) - at(0.1);
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const cv = $('view'), g = cv.getContext('2d');
    const playBtn = $('play'), sw = $('on'), rel = $('rel'), relO = $('relO'), fileIn = $('file'), backBtn = $('back');
    const msg = $('msg'), now = $('now'), sum = $('sum');
    const SR = 48000, DUR = 20;
    // 見本の場面の区切り [始め, 終わり, 名前]（秒）
    const SCENE = [[0, 6.2, '小声の会話'], [6.2, 9.6, '爆発'], [9.6, 15.6, '小声の会話'], [15.6, 20, '口笛']];
    const S = { src: null, eq: null, res: null, limG: null, sr: SR, dur: 0, parts: SCENE, label: '', r: 4, on: true, bufA: null, bufB: null };
    const bg = document.createElement('canvas'), bgc = bg.getContext('2d');
    let ac = null, master = null, gO = null, gE = null, nodes = [], token = 0;
    let playing = false, startAt = 0, startPos = 0, pos = 0, raf = 0, sceneCache = null, lastNow = '';
    let VW = 1, VH = 1, DPR = 1;
    const T0 = performance.now();

    const say = (s) => { msg.textContent = s; };
    const fmt = (t) => {
      const m = Math.floor(t / 60), s = t - m * 60;
      return m + ':' + s.toFixed(1).padStart(4, '0');
    };

    // 種から決まる乱数（mulberry32）。見本の場面を毎回同じにする
    function rng(seed) {
      let a = seed >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // ---- 見本の場面を OfflineAudioContext で作る ----
    // 日本語の母音のおおよその共鳴の高さ（あ・い・う・え・お）
    const VOW = [[800, 1200, 2500], [300, 2300, 3000], [350, 1300, 2400], [500, 1900, 2500], [500, 850, 2500]];
    // 声に似せた音: のこぎり波を 3 つの帯域通過フィルターに通し、音節ごとに母音と高さと大きさを変える
    function voice(ctx, out, nb, t0, t1, f0, rnd) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f0, 0);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, 0);
      amp.connect(out);
      const bps = [0, 1, 2].map((i) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = [6, 9, 12][i];
        bp.frequency.setValueAtTime(VOW[0][i], 0);
        const w = ctx.createGain();
        w.gain.value = [1, 0.7, 0.4][i];
        osc.connect(bp).connect(w).connect(amp);
        return bp;
      });
      // 子音: 雑音の高い所だけを短く鳴らす
      const ns = ctx.createBufferSource();
      ns.buffer = nb;
      ns.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, 0);
      ns.connect(hp).connect(ng).connect(out);
      let t = t0;
      const syl = Math.max(2, Math.round((t1 - t0) / 0.19));
      for (let s = 0; s < syl; s++) {
        const d = 0.13 + rnd() * 0.12;
        if (t + d > t1) break;
        let tv = t;
        if (rnd() < 0.45) {
          ng.gain.setTargetAtTime(0.35, t, 0.004);
          ng.gain.setTargetAtTime(0, t + 0.025, 0.01);
          tv = t + 0.03;
        }
        const v = VOW[Math.floor(rnd() * VOW.length)];
        bps.forEach((bp, i) => bp.frequency.setTargetAtTime(v[i] * (0.95 + rnd() * 0.1), tv, 0.015));
        osc.frequency.setTargetAtTime(f0 * (1.12 - (0.25 * s) / syl) * (0.97 + rnd() * 0.06), tv, 0.03);
        const a = 0.6 + rnd() * 0.4;
        amp.gain.setTargetAtTime(a, tv, 0.012);
        amp.gain.setTargetAtTime(a * 0.2, t + d * 0.75, 0.02);
        t += d;
      }
      amp.gain.setTargetAtTime(0, t, 0.03);
      ng.gain.setTargetAtTime(0, t, 0.01);
      osc.start(t0);
      osc.stop(t1 + 0.3);
      ns.start(t0, rnd() * 1.5);
      ns.stop(t1 + 0.3);
    }
    // 2 人が交互に話す
    function talk(ctx, out, nb, t0, t1, rnd) {
      let t = t0, who = 0;
      while (t < t1 - 0.5) {
        const end = Math.min(t1, t + 1.3 + rnd() * 1.0);
        voice(ctx, out, nb, t, end, who ? 205 : 118, rnd);
        t = end + 0.15 + rnd() * 0.25;
        who = 1 - who;
      }
    }
    // 爆発: 低い所へ閉じていく雑音と、低いドンという音と、飛び散る破片の小さな音
    function boom(ctx, out, nb, te, rnd) {
      const ns = ctx.createBufferSource();
      ns.buffer = nb;
      ns.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(6000, te);
      lp.frequency.exponentialRampToValueAtTime(160, te + 2.6);
      const ga = ctx.createGain();
      ga.gain.setValueAtTime(0, 0);
      ga.gain.setValueAtTime(0, te);
      ga.gain.linearRampToValueAtTime(1, te + 0.012);
      ga.gain.setTargetAtTime(0, te + 0.1, 0.65);
      ns.connect(lp).connect(ga).connect(out);
      ns.start(te);
      ns.stop(te + 3.2);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(75, te);
      o.frequency.exponentialRampToValueAtTime(32, te + 1.2);
      const go = ctx.createGain();
      go.gain.setValueAtTime(0, 0);
      go.gain.setValueAtTime(0, te);
      go.gain.linearRampToValueAtTime(1.6, te + 0.01);
      go.gain.setTargetAtTime(0, te + 0.05, 0.4);
      o.connect(go).connect(out);
      o.start(te);
      o.stop(te + 3);
      for (let k = 0; k < 14; k++) {
        const tk = te + 0.5 + rnd() * 2.2;
        const s = ctx.createBufferSource();
        s.buffer = nb;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1500 + rnd() * 4000;
        bp.Q.value = 3;
        const gk = ctx.createGain();
        gk.gain.setValueAtTime(0, 0);
        gk.gain.setValueAtTime(0.5 * (1 - (tk - te) / 3), tk);
        gk.gain.setTargetAtTime(0, tk + 0.005, 0.02);
        s.connect(bp).connect(gk).connect(out);
        s.start(tk, rnd());
        s.stop(tk + 0.2);
      }
    }
    // 口笛: ゆれのある正弦波で、音階を上がって下りる
    function whistle(ctx, out, t0, t1) {
      const notes = [1568, 1760, 1976, 2093, 1976, 1760, 1568, 1319, 1568];
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(notes[0], 0);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = ctx.createGain();
      lg.gain.value = 18;
      lfo.connect(lg).connect(o.frequency);
      const ga = ctx.createGain();
      ga.gain.setValueAtTime(0, 0);
      o.connect(ga).connect(out);
      const step = (t1 - t0) / notes.length;
      notes.forEach((f, i) => {
        const t = t0 + i * step;
        o.frequency.setTargetAtTime(f, t, 0.02);
        ga.gain.setTargetAtTime(1, t, 0.02);
        ga.gain.setTargetAtTime(0.15, t + step * 0.8, 0.02);
      });
      ga.gain.setTargetAtTime(0, t1, 0.03);
      o.start(t0);
      lfo.start(t0);
      o.stop(t1 + 0.3);
      lfo.stop(t1 + 0.3);
    }
    // 声・爆発・口笛を別々のチャンネルに作り、決めた大きさにそろえてから 1 つに混ぜる
    function buildScene() {
      const rnd = rng(20261126);
      const ctx = new OfflineAudioContext(3, DUR * SR, SR);
      ctx.destination.channelInterpretation = 'discrete';
      const mg = ctx.createChannelMerger(3);
      mg.connect(ctx.destination);
      const vb = ctx.createGain(), eb = ctx.createGain(), wb = ctx.createGain();
      vb.connect(mg, 0, 0);
      eb.connect(mg, 0, 1);
      wb.connect(mg, 0, 2);
      const nb = ctx.createBuffer(1, SR * 2, SR), nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;
      talk(ctx, vb, nb, 0.4, 6.0, rnd);
      talk(ctx, vb, nb, 9.9, 15.4, rnd);
      boom(ctx, eb, nb, 6.4, rnd);
      whistle(ctx, wb, 15.9, 19.7);
      return ctx.startRendering().then((buf) => {
        const v = buf.getChannelData(0), e = buf.getChannelData(1), w = buf.getChannelData(2), n = v.length;
        let sv = 0, cnt = 0, pe = 0, pw = 0;
        for (let i = 0; i < n; i++) {
          const t = i / SR;
          if (t < 6.2 || (t >= 9.6 && t < 15.6)) { sv += v[i] * v[i]; cnt++; }
          pe = Math.max(pe, Math.abs(e[i]));
          pw = Math.max(pw, Math.abs(w[i]));
        }
        // 会話の区間の実効値を −33 dBFS、爆発の山を 0.89、口笛の山を 0.17 にする
        const kv = Math.pow(10, -33 / 20) / Math.sqrt(sv / Math.max(1, cnt) || 1e-12);
        const ke = 0.89 / (pe || 1), kw = 0.17 / (pw || 1);
        const out = new Float32Array(n);
        let z = 0;
        for (let i = 0; i < n; i++) {
          // 部屋のかすかな雑音（約 −60 dBFS）
          z += 0.15 * (rnd() * 2 - 1 - z);
          out[i] = v[i] * kv + e[i] * ke + w[i] * kw + z * 0.006;
        }
        return [out];
      });
    }

    // ---- 処理 ----
    function runEq() {
      const res = equalize(S.src, S.sr, S.r);
      S.limG = limit(res.out, S.sr);
      S.res = res;
      S.eq = res.out;
      S.bufB = null;
      const dB = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
      if (S.parts.length) {
        // 見本の場面: 区間ごとの実効値を、処理の前と後で並べる
        sum.textContent = '区間ごとの音の大きさ（実効値、dBFS）: ' + S.parts.map(([t0, t1, label]) =>
          label + ' ' + dB(rmsDb(S.src, S.sr, t0, t1)) + ' → ' + dB(rmsDb(S.eq, S.sr, t0, t1))).join('　');
      } else {
        const a = spread(S.src, S.sr, 0.4), b = spread(S.eq, S.sr, 0.4, S.src);
        sum.textContent = '0.4 秒ごとの音の大きさの散らばり（元の音で −50 dB 未満の所を除き、大きい方から 10% の所と小さい方から 10% の所の差）: 元の音 ' + a.toFixed(1) + ' dB → 均一化の後 ' + b.toFixed(1) + ' dB';
      }
      layout();
      renderStatic();
      frame();
    }
    function useSource(chs, sr, parts, label) {
      halt();
      playing = false;
      pos = 0;
      S.src = chs;
      S.sr = sr;
      S.dur = chs[0].length / sr;
      S.parts = parts;
      S.label = label;
      S.bufA = null;
      runEq();
      ui();
      if (window.THUMB) kick();
    }
    function useScene() {
      backBtn.hidden = true;
      if (sceneCache) {
        useSource(sceneCache, SR, SCENE, '');
        say('');
        return;
      }
      say('見本の場面（20 秒）を作っています…');
      buildScene().then((chs) => {
        sceneCache = chs;
        useSource(chs, SR, SCENE, '');
        say('');
      }).catch((err) => say('見本の音を作れませんでした: ' + err.message));
    }

    // ---- 再生 ----
    function ensureAudio() {
      if (!ac) {
        ac = new AudioContext();
        master = ac.createGain();
        master.gain.value = 0.9;
        master.connect(ac.destination);
        gO = ac.createGain();
        gE = ac.createGain();
        gO.connect(master);
        gE.connect(master);
        setMix(true);
      }
      if (ac.state === 'suspended') ac.resume();
    }
    function toBuffer(chs) {
      const b = ac.createBuffer(chs.length, chs[0].length, S.sr);
      chs.forEach((x, i) => b.copyToChannel(x, i));
      return b;
    }
    // 元の音と処理した音のどちらを聞かせるか（もう片方は音量 0 で同じ位置を進める）
    function setMix(instant) {
      if (!ac) return;
      const t = ac.currentTime;
      for (const [node, v] of [[gO, S.on ? 0 : 1], [gE, S.on ? 1 : 0]]) {
        node.gain.cancelScheduledValues(t);
        if (instant) node.gain.setValueAtTime(v, t);
        else node.gain.setTargetAtTime(v, t, 0.012);
      }
    }
    function halt() {
      token++;
      for (const s of nodes) {
        try { s.stop(); } catch (err) { /* もう止まっていてもよい */ }
        s.disconnect();
      }
      nodes = [];
    }
    function start(at) {
      ensureAudio();
      halt();
      if (!S.bufA) S.bufA = toBuffer(S.src);
      if (!S.bufB) S.bufB = toBuffer(S.eq);
      startPos = Math.min(Math.max(0, at), Math.max(0, S.dur - 0.01));
      startAt = ac.currentTime + 0.03;
      const tok = ++token;
      nodes = [[S.bufA, gO], [S.bufB, gE]].map(([b, gn]) => {
        const s = ac.createBufferSource();
        s.buffer = b;
        s.connect(gn);
        s.start(startAt, startPos);
        return s;
      });
      nodes[1].onended = () => {
        if (tok !== token) return;
        playing = false;
        pos = 0;
        nodes = [];
        ui();
        frame();
      };
      playing = true;
      ui();
      kick();
    }
    function curPos() {
      if (window.THUMB && S.dur) return ((performance.now() - T0) / 400) % S.dur;
      if (!playing || !ac) return pos;
      return Math.min(S.dur, startPos + Math.max(0, ac.currentTime - startAt));
    }
    function ui() {
      playBtn.textContent = playing ? '止める' : '再生';
      playBtn.disabled = !S.res;
    }

    // ---- 描く ----
    function layout() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      VW = w;
      VH = h;
      DPR = dpr;
      if (cv.width === W && cv.height === H && bg.width === W && bg.height === H) return false;
      cv.width = W;
      cv.height = H;
      bg.width = W;
      bg.height = H;
      return true;
    }
    function geom(w, h) {
      const x0 = 74, pw = Math.max(1, Math.floor(w - x0 - 12));
      const T = 22, B = 22, gap = 6;
      const avail = Math.max(3, h - T - B - gap * 2);
      const ha = avail * 0.36, hc = avail * 0.28;
      return { x0, pw, a: { y: T, h: ha }, b: { y: T + ha + gap, h: ha }, c: { y: T + ha * 2 + gap * 2, h: hc }, base: h - B };
    }
    // ゲインの帯の縦の位置（−12〜+21 dB）
    function dbY(row, db) {
      const lo = -12, hi = 21;
      return row.y + row.h * (1 - (Math.min(hi, Math.max(lo, db)) - lo) / (hi - lo));
    }
    // 1 画素の幅に入るサンプルの最小と最大を縦線で描く
    function wave(c, chs, x0, row, pw, color) {
      const n = chs[0].length, per = n / pw, mid = row.y + row.h / 2, amp = row.h / 2 - 1;
      c.fillStyle = '#1b1e25';
      c.fillRect(x0, row.y, pw, row.h);
      c.fillStyle = color;
      for (let px = 0; px < pw; px++) {
        const a = Math.floor(px * per), b = Math.min(n, Math.max(a + 1, Math.floor((px + 1) * per)));
        if (a >= n) break;
        let lo = 0, hi = 0;
        for (const x of chs) {
          for (let i = a; i < b; i++) {
            const v = x[i];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
        hi = Math.min(1, hi);
        lo = Math.max(-1, lo);
        const y1 = mid - hi * amp, y2 = mid - lo * amp;
        c.fillRect(x0 + px, y1, 1, Math.max(1, y2 - y1));
      }
    }
    // 動かない部分（波の形とゲイン）は別の canvas に 1 回だけ描いておく
    function renderStatic() {
      const c = bgc;
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      c.fillStyle = '#14161b';
      c.fillRect(0, 0, VW, VH);
      if (!S.res) return;
      const G = geom(VW, VH), dur = S.dur;
      c.font = '12px system-ui, sans-serif';
      c.textBaseline = 'middle';
      c.textAlign = 'center';
      for (const [t0, t1, label] of S.parts) {
        const xa = G.x0 + (G.pw * t0) / dur, xb = G.x0 + (G.pw * Math.min(dur, t1)) / dur;
        if (t0 > 0) {
          c.fillStyle = '#343844';
          c.fillRect(Math.round(xa), G.a.y, 1, G.c.y + G.c.h - G.a.y);
        }
        c.fillStyle = '#a49e92';
        c.fillText(label, (xa + xb) / 2, G.a.y - 10);
      }
      c.textAlign = 'left';
      if (S.label) {
        c.fillStyle = '#a49e92';
        c.fillText(S.label, G.x0, G.a.y - 10);
      }
      c.fillStyle = '#cfc9bd';
      c.fillText('元の音', 6, G.a.y + G.a.h / 2);
      c.fillText('均一化の後', 6, G.b.y + G.b.h / 2);
      c.fillText('ゲイン', 6, G.c.y + G.c.h / 2);
      wave(c, S.src, G.x0, G.a, G.pw, '#8fa7c0');
      wave(c, S.eq, G.x0, G.b, G.pw, '#f2b450');
      // ゲインの帯: 0・+10・+20 dB の線
      c.font = '11px system-ui, sans-serif';
      c.textBaseline = 'bottom';
      for (const db of [0, 10, 20]) {
        const y = Math.round(dbY(G.c, db)) + 0.5;
        c.strokeStyle = db === 0 ? '#444956' : '#2a2e37';
        c.beginPath();
        c.moveTo(G.x0, y);
        c.lineTo(G.x0 + G.pw, y);
        c.stroke();
        c.fillStyle = '#8e887c';
        c.fillText((db > 0 ? '+' : '') + db + ' dB', G.x0 + 3, y - 1);
      }
      c.textBaseline = 'middle';
      // リミッターが下げた所（赤、0 dB から下へ）
      const lg = S.limG, n = lg.length, per = n / G.pw, y0 = dbY(G.c, 0);
      c.fillStyle = 'rgba(240, 96, 80, 0.8)';
      for (let px = 0; px < G.pw; px++) {
        const a = Math.floor(px * per), b = Math.min(n, Math.max(a + 1, Math.floor((px + 1) * per)));
        let m = 1;
        for (let i = a; i < b; i++) if (lg[i] < m) m = lg[i];
        if (m < 0.995) c.fillRect(G.x0 + px, y0, 1, Math.max(1, dbY(G.c, 20 * Math.log10(m)) - y0));
      }
      // 均一化のゲイン（線）
      const gs = S.res.gains, hop = S.res.hop;
      c.strokeStyle = '#f2b450';
      c.lineWidth = 1.5;
      c.beginPath();
      for (let px = 0; px <= G.pw; px++) {
        const k = Math.min(gs.length - 1, Math.floor(((px / G.pw) * dur * S.sr) / hop));
        const y = dbY(G.c, 20 * Math.log10(gs[k]));
        if (px === 0) c.moveTo(G.x0 + px, y);
        else c.lineTo(G.x0 + px, y);
      }
      c.stroke();
      c.lineWidth = 1;
      // 時刻の目盛り（文字が重ならないように、間隔を 52 px 以上にする）
      const most = Math.max(1, Math.floor(G.pw / 52));
      const step = [1, 2, 5, 10, 15, 30, 60, 120].find((s) => dur / s <= most) || 300;
      c.font = '11px system-ui, sans-serif';
      c.fillStyle = '#8e887c';
      for (let t = 0; t <= dur + 1e-9; t += step) {
        const x = G.x0 + (G.pw * t) / dur, m = Math.floor(t / 60), s = Math.round(t - m * 60);
        const label = m + ':' + String(s).padStart(2, '0');
        // 右端の文字は切れないように右に寄せる
        const right = x + c.measureText(label).width / 2 > VW - 2;
        c.textAlign = right ? 'right' : 'center';
        c.fillText(label, right ? VW - 2 : x, G.base + 11);
      }
    }
    function frame() {
      if (layout()) renderStatic();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(bg, 0, 0);
      if (!S.res) return;
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      const p = curPos(), G = geom(VW, VH);
      // 聞こえている方の段を枠で囲む
      const row = S.on ? G.b : G.a;
      g.strokeStyle = S.on ? '#f2b450' : '#8fa7c0';
      g.lineWidth = 2;
      g.strokeRect(G.x0 + 1, row.y + 1, Math.max(1, G.pw - 2), Math.max(1, row.h - 2));
      g.lineWidth = 1;
      // 今の位置
      const x = Math.round(G.x0 + (G.pw * p) / S.dur) + 0.5;
      g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      g.beginPath();
      g.moveTo(x, G.a.y);
      g.lineTo(x, G.c.y + G.c.h);
      g.stroke();
      tellNow(p);
    }
    function tellNow(p) {
      const k = Math.min(S.res.gains.length - 1, Math.max(0, Math.floor((p * S.sr) / S.res.hop)));
      const gn = S.res.gains[k], L = S.res.loud[k];
      const li = Math.min(S.limG.length - 1, Math.max(0, Math.floor(p * S.sr)));
      const ldb = 20 * Math.log10(S.limG[li]), gdb = 20 * Math.log10(gn);
      const s = fmt(p) + ' / ' + fmt(S.dur) + '　再生する音:「' + (S.on ? '均一化の後' : '元の音') + '」' +
        '\n均一化のゲイン ' + (gdb >= 0 ? '+' : '−') + Math.abs(gdb).toFixed(1) + ' dB（×' + gn.toFixed(2) + '）　音の大きさ L = ' + Math.round(L) + '（1300 のとき ×1）' +
        (ldb < -0.05 ? '　リミッター −' + Math.abs(ldb).toFixed(1) + ' dB' : '');
      if (s !== lastNow) {
        now.textContent = s;
        lastNow = s;
      }
    }
    function loop() {
      raf = 0;
      frame();
      if (playing || window.THUMB) raf = requestAnimationFrame(loop);
    }
    function kick() {
      if (!raf) raf = requestAnimationFrame(loop);
    }

    // ---- 操作 ----
    playBtn.addEventListener('click', () => {
      if (!S.res) return;
      if (playing) {
        pos = curPos();
        halt();
        playing = false;
        ui();
        frame();
        return;
      }
      start(pos >= S.dur - 0.05 ? 0 : pos);
    });
    sw.addEventListener('change', () => {
      S.on = sw.checked;
      setMix(false);
      frame();
    });
    function showRel() {
      const sec = riseSeconds(SR, S.r);
      relO.textContent = S.r + (S.r === 4 ? '（Windows の既定）' : '') + '　上げる時の時定数 約 ' + (sec < 10 ? sec.toFixed(1) : Math.round(sec)) + ' 秒';
    }
    rel.addEventListener('input', () => {
      S.r = Number(rel.value);
      showRel();
    });
    rel.addEventListener('change', () => {
      if (!S.src) return;
      const p = curPos(), was = playing;
      runEq();
      if (was) start(p);
    });
    cv.addEventListener('pointerdown', (e) => {
      if (!S.res || window.THUMB) return;
      const r = cv.getBoundingClientRect(), G = geom(r.width, r.height);
      const t = Math.min(1, Math.max(0, (e.clientX - r.left - G.x0) / G.pw)) * S.dur;
      if (playing) start(t);
      else {
        pos = t;
        frame();
      }
    });
    fileIn.addEventListener('change', () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      say('「' + f.name + '」を読み込んでいます…');
      f.arrayBuffer()
        .then((ab) => new OfflineAudioContext(2, 1, SR).decodeAudioData(ab))
        .then((b) => {
          const n = Math.min(b.length, SR * 180);
          const chs = [];
          for (let c = 0; c < Math.min(2, b.numberOfChannels); c++) chs.push(b.getChannelData(c).slice(0, n));
          useSource(chs, b.sampleRate, [], f.name);
          backBtn.hidden = false;
          say('「' + f.name + '」の最初の ' + Math.round(n / b.sampleRate) + ' 秒を処理した。ファイルはブラウザの中だけで扱い、どこにも送らない。');
        })
        .catch(() => say('このファイルは読めなかった。mp3・wav・ogg・m4a などの音声ファイルを選んでほしい。'));
    });
    backBtn.addEventListener('click', () => {
      fileIn.value = '';
      useScene();
    });

    if (window.THUMB) document.body.classList.add('thumb');
    showRel();
    ui();
    layout();
    renderStatic();
    frame();
    if (typeof OfflineAudioContext === 'undefined') say('このブラウザでは OfflineAudioContext が使えないため、見本の音を作れない。');
    else useScene();
    if ('ResizeObserver' in window) new ResizeObserver(() => frame()).observe(cv);
  },
});

dekiru.add({
  id: 'tr-20261126-scroll-controller', c: 'trend', lv: 3, date: '2026-11-26',
  t: 'スクロールできる領域を見えないコントローラーにして、慣性と目盛りの吸着をブラウザに任せる',
  y: 'すくろーるできるりょういきをみえないこんとろーらーにして かんせいとめもりのきゅうちゃくをぶらうざにまかせる',
  tags: ['iOS Safari の 60 FPS', 'スクロールのコントローラー', 'MessageChannel', 'scroll-snap', 'scrollsnapchanging', 'OffscreenCanvas', 'Worker'],
  d: 'iPhone の Safari は、120 Hz の画面でも requestAnimationFrame を 1 秒に 60 回に抑え、指の動き（touch と pointer のイベント）も同じ回数に抑える。Rida F\'kih さんの記事（2026-11-20 公開。Hacker News で 2026-11-25 に 441 点・144 件）は、スクロールが JavaScript を通らずにブラウザの合成の処理（compositor）で動くことを使って、この制限を越えた。スクロールできる領域を見えない「コントローラー」として重ね、その位置を読んで入力にする。慣性・端の跳ね返り・目盛りの吸着はブラウザが付ける。位置は MessageChannel と setTimeout で描画の拍に合わせて読み、描く側は transferControlToOffscreen で Worker に渡して、メインの描画の拍を待たずに出す。記事の測定では、ドラッグの 3 秒間で、ポインターのイベントを使う版が 1 秒に 60 枚、コントローラーを使う版が平均 118 枚だった。'
    + 'この見本の 1 枚目（読む速さ）は、同じ格子の位置を scroll イベント・requestAnimationFrame・MessageChannel＋setTimeout（1 拍に 2 回）・MessageChannel だけ（休まず）の 4 通りで読み、1 秒あたりの読んだ回数と新しい位置の数を並べ、読んだ時刻を図にする。黄色い正方形はブラウザがスクロールで動かし、水色の枠は JavaScript が読んだ位置に置く。「4 倍に広げて読む」では、格子を 4 倍の大きさで作って 1/4 に縮めて見せ、小数の位置まで読む。2 枚目は、どこまでも回せるトラックボール（端に近づいたら、止まったときに真ん中へ戻す）と、21 個の目盛りで止まるダイヤル（scroll-snap と scrollsnapchanging）。3 枚目は同じ絵をメインと Worker で描き、「JS を止める」でメインのスレッドを 0.6 秒ごとに 0.4 秒止める。'
    + '145 Hz の画面の Chrome で動かすと、次のようになった。新しい位置の数は、1 拍に 1 回読んでも 2 回読んでも同じだった（Chrome は位置を描画の拍ごとに渡す）。休まず読むと 1 秒に約 10 万回読めたが、新しい位置は増えず、rAF は 1 秒に 145 回から 50 回前後に減った。4 倍に広げると細かさが 1 pt から 0.25 pt になり、ホイール 1 段で動く量も 1/4 になった。メインを止めると、メインの絵は 1 秒に 52 枚に減り、Worker の絵は 144 枚のままだった。'
    + '再現できていない所: パソコンの Chrome などは描画を 60 回に抑えないので、iPhone での 60 と 120 の差はこの見本では見えない。記事の、ProMotion を 120 Hz に上げるために見えない領域をなめらかにスクロールし続ける工夫、ページ全体をコントローラーにする方法、Liquid Glass のタブバーは作っていない。マウスのドラッグではスクロールしないので、ホイール・トラックパッドの 2 本指・スマホの指・矢印キーで動かす。端の跳ね返りは、跳ね返る仕組みのあるブラウザ（Mac や iPhone の Safari など）でだけ見える。X の元の投稿は検索で見つからなかった。',
  p: 'スクロールは JavaScript を通らずに合成の処理で動くので、指に付いてくる動き・慣性・吸着はブラウザに任せられる。見えない領域を重ね、scrollLeft と scrollTop を読むだけで入力になる。ただし、読む回数を増やしても、ブラウザが新しい位置を渡す回数より多くはならない。そこで requestAnimationFrame の時刻で拍の位置を決め、拍を 2 つに分けた時刻ごとに読む。setTimeout の待ち時間は整数の ms に切り捨てられるので切り上げて渡し、深い入れ子の setTimeout は 4 ms 以上に延ばされるので、MessageChannel のメッセージを挟んで入れ子を切る。scrollTop が整数に丸められる場合は、中身を k 倍に広げて外側を scale で 1/k に縮め、読んだ値を k で割ると 1/k pt まで読める。canvas の transferControlToOffscreen で得た OffscreenCanvas を Worker へ送ると、Worker の requestAnimationFrame で描いた絵は、メインのスレッドが止まっていても画面に出る。目盛りは scroll-snap-type: y mandatory で作り、scrollsnapchanging で止まる先を、scrollsnapchange で止まった目盛りを受け取る（無いブラウザでは位置から計算する）。',
  refs: [
    { title: 'Rida F\'kih: Bypassing iOS Safari’s 60 FPS Limit to Build Web Applications That Feel Native（2026-11-20）', url: 'https://rida.dev/blog/bypassing-ios-safari-60-fps-limit' },
    { title: 'Hacker News: Bypassing iOS Safari\'s 60 FPS Limit to Build Web Applications That Feel Native', url: 'https://news.ycombinator.com/item?id=50637890' },
  ],
  html: `<div class="bar">
  <div class="tabs" role="tablist" focusgroup="tablist nomemory" aria-label="見本の切り替え">
    <button type="button" role="tab" id="tab1" aria-selected="true" focusgroupstart>読む速さ</button>
    <button type="button" role="tab" id="tab2" aria-selected="false">慣性と吸着</button>
    <button type="button" role="tab" id="tab3" aria-selected="false">描く処理を分ける</button>
  </div>
  <p class="meta"><span id="hz">画面の書き換え -- 回/秒</span><label><input type="checkbox" id="jank"> JS を止める（0.6 秒ごとに 0.4 秒）</label></p>
</div>
<section role="tabpanel" id="pan1" aria-labelledby="tab1">
  <div class="p1">
    <div class="pad" id="pad">
      <div class="ctl" id="ctl" tabindex="0" role="region" aria-label="コントローラー（スクロールできる格子）"><div class="surf"><div class="sq"></div></div></div>
      <div class="ring" id="ring" aria-hidden="true"></div>
      <p class="tip">ここをスクロール（ホイール・2 本指・指・矢印キー）</p>
    </div>
    <div class="side">
      <p class="pos">位置 <b id="pos">0.00, 0.00</b>　速さ <b id="spd">0</b> pt/秒　細かさ <b id="fine">--</b> pt</p>
      <div class="tw"><table>
        <thead><tr><th scope="col">読み方</th><th scope="col">読んだ回数/秒</th><th scope="col">新しい位置/秒</th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
      <canvas id="lanes" role="img" aria-label="直近 1 秒に読んだ時刻と位置の図。読み方ごとに 1 段。黄色い点は前と違う位置を読めた回"></canvas>
      <div class="opts">
        <label><input type="checkbox" id="busy"> MessageChannel だけで休まず読む（CPU を 1 つ使い切る。10 秒で止まる）</label>
        <label><input type="checkbox" id="wide"> 4 倍に広げて読む（小数の位置を取る）</label>
        <label><input type="checkbox" id="ghost"> 格子を見えなくする</label>
        <button type="button" id="auto" aria-pressed="false">自動で動かす</button>
      </div>
      <p class="note" id="note1" aria-live="polite"></p>
    </div>
  </div>
</section>
<section role="tabpanel" id="pan2" aria-labelledby="tab2" hidden>
  <div class="p2" id="p2">
    <figure>
      <div class="stage"><canvas id="ball" role="img" aria-label="スクロールで回る球"></canvas>
        <div class="over" id="ballCtl" tabindex="0" role="region" aria-label="トラックボールのコントローラー（どこまでもスクロールできる）"><div class="huge"></div></div></div>
      <figcaption>トラックボール（慣性）<br><span id="ballInfo">回る速さ 0°/秒</span></figcaption>
    </figure>
    <figure>
      <div class="stage"><canvas id="dial" role="img" aria-label="目盛りで止まるつまみ"></canvas>
        <div class="over snap" id="dialCtl" tabindex="0" role="region" aria-label="ダイヤルのコントローラー（目盛りで止まる）"></div></div>
      <figcaption>ダイヤル（吸着）<br>値 <output id="dialVal">0</output> <span id="dialPend"></span></figcaption>
    </figure>
  </div>
  <p class="hint">絵の上でスクロールしてください。マウスのドラッグではスクロールしません。
    <label><input type="checkbox" id="show2"> コントローラーを見せる</label>
    <button type="button" id="auto2" aria-pressed="false">自動で動かす</button></p>
</section>
<section role="tabpanel" id="pan3" aria-labelledby="tab3" hidden>
  <div class="p3">
    <figure><canvas id="cvMain" role="img" aria-label="メインのスレッドで描く、回る線と往復する玉"></canvas><figcaption>メインで描く（requestAnimationFrame） <b id="fpsMain">--</b> 枚/秒</figcaption></figure>
    <figure><canvas id="cvWork" role="img" aria-label="Worker で描く、回る線と往復する玉"></canvas><figcaption>Worker で描く（transferControlToOffscreen） <b id="fpsWork">--</b> 枚/秒</figcaption></figure>
  </div>
  <p class="note" id="note3" aria-live="polite">上の「JS を止める」を入れると、0.6 秒ごとに 0.4 秒、メインのスレッドで JavaScript が動き続けて、ほかの処理が止まります。</p>
</section>`,
  css: `:root { color-scheme: dark; --bg: #0e1117; --fg: #d9e1ee; --mut: #8b97ab; --ac: #6fd3ff; --ac2: #ffcf5a; --line: #2a3242; }
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 6px 10px 10px; background: var(--bg); color: var(--fg); font: 13px/1.5 system-ui, sans-serif; }
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 14px; margin-bottom: 6px; }
    .tabs { display: flex; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
    .tabs button { flex: none; position: relative; background: none; border: 0; border-radius: 0; padding: 5px 10px; color: var(--mut); }
    .tabs [aria-selected="true"] { color: var(--fg); }
    .tabs [aria-selected="true"]::after { content: ""; position: absolute; inset: auto 6px 0; border-block-end: 3px solid var(--ac); }
    .meta { margin: 0; display: flex; flex-wrap: wrap; gap: 2px 12px; align-items: center; color: var(--mut); font-variant-numeric: tabular-nums; }
    .p1 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 10px; }
    @media (width < 600px) { .p1 { grid-template-columns: minmax(0, 1fr); } }
    .pad { --k: 1; position: relative; height: 230px; overflow: hidden; border-radius: 10px; border: 1px solid var(--line); background: #0a0d13; }
    .ctl { position: absolute; left: 0; top: 0; width: calc(100% * var(--k)); height: calc(100% * var(--k)); scale: calc(1 / var(--k)); transform-origin: 0 0; overflow: scroll; scrollbar-width: none; overscroll-behavior: contain; outline-offset: -3px; }
    .surf { position: relative; width: calc(3000px * var(--k)); height: calc(3000px * var(--k));
      background-image: linear-gradient(#ffffff1c calc(1px * var(--k)), transparent 0), linear-gradient(90deg, #ffffff1c calc(1px * var(--k)), transparent 0);
      background-size: calc(40px * var(--k)) calc(40px * var(--k)); }
    .sq { position: absolute; left: 50%; top: 50%; width: calc(44px * var(--k)); height: calc(44px * var(--k)); translate: -50% -50%; border-radius: calc(8px * var(--k)); background: var(--ac2); }
    .pad.ghost .ctl { opacity: 0; }
    .ring { position: absolute; left: 0; top: 0; width: 56px; height: 56px; border: 2px solid var(--ac); border-radius: 12px; pointer-events: none; }
    .tip { position: absolute; left: 8px; bottom: 4px; margin: 0; color: var(--mut); font-size: 11px; pointer-events: none; }
    .side p { margin: 0 0 4px; }
    .pos { font-variant-numeric: tabular-nums; }
    .pos b { color: var(--ac2); font-weight: 600; }
    .tw { overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; font-size: 12px; }
    th, td { padding: 2px 6px; text-align: right; border-bottom: 1px solid var(--line); font-weight: normal; white-space: nowrap; }
    th[scope="row"], thead th:first-child { text-align: left; white-space: normal; }
    thead th { color: var(--mut); }
    #lanes { width: 100%; height: 96px; margin-top: 6px; border-radius: 6px; }
    .opts { display: flex; flex-wrap: wrap; gap: 2px 12px; align-items: center; margin-top: 4px; }
    .note { color: var(--mut); font-size: 12px; }
    .p2, .p3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 10px; max-width: 640px; }
    figure { margin: 0; }
    .stage { position: relative; width: min(100%, 230px); aspect-ratio: 1; margin-inline: auto; border-radius: 12px; border: 1px solid var(--line); background: #0a0d13; overflow: hidden; }
    .stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    .over { position: absolute; inset: 0; overflow: scroll; scrollbar-width: none; overscroll-behavior: contain; opacity: 0; outline-offset: -3px; }
    .p2.show .over { opacity: 1; }
    .huge { width: 40000px; height: 40000px; background-image: linear-gradient(#6fd3ff33 1px, transparent 0), linear-gradient(90deg, #6fd3ff33 1px, transparent 0); background-size: 40px 40px; }
    .snap { scroll-snap-type: y mandatory; }
    .snap .n { height: 80px; scroll-snap-align: start; }
    .p2.show .snap .n { border-top: 2px dashed #6fd3ff66; }
    .snap .end { height: calc(100% - 80px); }
    figcaption { margin-top: 4px; text-align: center; color: var(--mut); font-variant-numeric: tabular-nums; }
    figcaption b, output { color: var(--ac2); font-weight: 600; }
    .hint { margin: 8px 0 0; color: var(--mut); }
    .hint label { margin-inline: 8px; color: var(--fg); }
    .p3 canvas { width: 100%; height: 150px; border-radius: 10px; border: 1px solid var(--line); background: #0a0d13; }`,
  core() {
    // 読んだ位置の列 s（{ t, x, y, n }。n は同じ値をまとめた回数）のうち、時刻が (now − win, now] のものから、
    // 1 秒あたりの読んだ回数と、1 つ前に読んだ値から変わった回数を求める
    function rateOf(s, now, win) {
      let reads = 0, changes = 0;
      for (let i = 0; i < s.length; i++) {
        const a = s[i];
        if (a.t <= now - win || a.t > now) continue;
        reads += a.n || 1;
        const b = s[i - 1];
        if (b && (a.x !== b.x || a.y !== b.y)) changes++;
      }
      const k = win > 0 ? 1000 / win : 0;
      return { reads: reads * k, changes: changes * k };
    }
    // 描画の拍に合わせて次に読む時刻。base は最後の requestAnimationFrame の時刻、frame は 1 拍の長さ（ms）、div は 1 拍に読む回数。
    // base + k·frame/div の形の時刻のうち、now より 0.25 ms 以上あとの最初のものを返す
    function nextTick(now, base, frame, div) {
      const step = frame / Math.max(1, Math.floor(div));
      if (!(step > 0) || !Number.isFinite(base)) return now + 16;
      let t = base + (Math.floor((now - base) / step) + 1) * step;
      if (t - now < 0.25) t += step;
      return t;
    }
    // requestAnimationFrame の間隔の並びから 1 拍の長さ（ms）を求める。止まっていた間などの外れた値に引っぱられないよう中央値を使う
    function frameOf(gaps) {
      const a = gaps.filter((d) => d > 2 && d < 100).sort((p, q) => p - q);
      if (!a.length) return 1000 / 60;
      const m = a.length >> 1;
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }
    // 並んだ値の、隣どうしの差のうち 0 でない最小のもの（読める位置の細かさ）。動いていなければ 0
    function finest(v) {
      let m = Infinity;
      for (let i = 1; i < v.length; i++) {
        const d = Math.abs(v[i] - v[i - 1]);
        if (d > 1e-6 && d < m) m = d;
      }
      return m === Infinity ? 0 : m;
    }
    // 直近 span ms に読んだ最初と最後の位置から、速さ（pt/秒）を求める
    function speedOf(s, now, span) {
      let a = null, b = null;
      for (const p of s) if (p.t > now - span && p.t <= now) { if (!a) a = p; b = p; }
      if (!a || b.t - a.t < 1) return 0;
      return (Math.hypot(b.x - a.x, b.y - a.y) * 1000) / (b.t - a.t);
    }
    // どこまでも回せる領域: 位置 pos（0〜max）が端から margin より近ければ真ん中に戻した位置、そうでなければ pos のまま
    function recenter(pos, max, margin) {
      if (!(max > 2 * margin)) return pos;
      return pos < margin || pos > max - margin ? Math.round(max / 2) : pos;
    }
    // ダイヤル: 位置 pos、目盛りの間隔 step、目盛りの数 n から、近い目盛り（0〜n−1）と、つまみの角度（度。目盛り 0 が from、n−1 が to）
    function dialOf(pos, step, n, from, to) {
      const f = step > 0 ? pos / step : 0;
      const per = n > 1 ? (to - from) / (n - 1) : 0;
      return { idx: Math.max(0, Math.min(n - 1, Math.round(f))), angle: from + f * per };
    }
    // 3×3 の回転行列（行ごとに 9 個）。単位ベクトルにした軸 (ax, ay, az) のまわりに a ラジアン回す（ロドリゲスの式）
    function rotAxis(ax, ay, az, a) {
      const L = Math.hypot(ax, ay, az) || 1;
      ax /= L; ay /= L; az /= L;
      const c = Math.cos(a), s = Math.sin(a), C = 1 - c;
      return [c + ax * ax * C, ax * ay * C - az * s, ax * az * C + ay * s,
        ay * ax * C + az * s, c + ay * ay * C, ay * az * C - ax * s,
        az * ax * C - ay * s, az * ay * C + ax * s, c + az * az * C];
    }
    function mul3(A, B) {
      const r = new Array(9);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
      return r;
    }
    function apply3(M, v) {
      return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
    }
    // 掛け続けると誤差で行列がゆがむので、行を長さ 1 で互いに直交する形に戻す（グラム・シュミット）
    function orth(M) {
      const nz = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
      const a = nz([M[0], M[1], M[2]]), b0 = [M[3], M[4], M[5]];
      const d = a[0] * b0[0] + a[1] * b0[1] + a[2] * b0[2];
      const b = nz([b0[0] - d * a[0], b0[1] - d * a[1], b0[2] - d * a[2]]);
      return [...a, ...b, a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    // トラックボール: 画面で (dx, dy) px 動かしたとき、半径 r px の球の手前の面が同じだけ動くように回す（x は右、y は下、z は手前）
    function rollBy(M, dx, dy, r) {
      const d = Math.hypot(dx, dy);
      if (!(d > 0) || !(r > 0)) return M;
      return orth(mul3(rotAxis(-dy / d, dx / d, 0, d / r), M));
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    // 一覧の小窓では、ページのスクロールバーを出さずに格子だけを見せる
    if (window.THUMB) { document.body.classList.add('thumb'); document.documentElement.style.overflow = 'hidden'; }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // スクロールが止まったときの処理。scrollend が無いブラウザでは、scroll が 120 ms 来なければ止まったとみなす
    function onEnd(el, fn) {
      if ('onscrollend' in window) { el.addEventListener('scrollend', fn); return; }
      let t = 0;
      el.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(fn, 120); }, { passive: true });
    }

    // ---- 1. 読む速さ ----
    const pad = $('pad'), ctl = $('ctl'), ring = $('ring'), lanes = $('lanes'), lg = lanes.getContext('2d');
    const SURF = 3000;
    let K = 1, x0 = 0, y0 = 0, padW = 0, padH = 0, panel = 0, frameMs = 1000 / 60, vsync = performance.now();
    const RD = [
      { label: 'scroll イベント', short: 'scroll', s: [] },
      { label: 'requestAnimationFrame（1 拍に 1 回）', short: 'rAF', s: [] },
      { label: 'MessageChannel＋setTimeout（1 拍に 2 回）', short: 'MC＋setTimeout', s: [] },
      { label: 'MessageChannel だけ（休まず）', short: 'MC だけ', s: [], merge: true },
    ];
    $('rows').innerHTML = RD.map((r, i) => `<tr><th scope="row">${r.label}</th><td id="ra${i}">--</td><td id="rc${i}">--</td></tr>`).join('');
    // 位置を読んで記録する。休まず読むときは、同じ値が続いたら 1 つにまとめて回数だけ数える
    function readInto(r) {
      const t = performance.now(), x = ctl.scrollLeft / K - x0, y = ctl.scrollTop / K - y0, s = r.s, last = s[s.length - 1];
      if (r.merge && last && last.x === x && last.y === y && t - last.t < 50) last.n++;
      else s.push({ t, x, y, n: 1 });
      while (s.length && s[0].t < t - 1500) s.shift();
    }
    // 正方形が枠の真ん中に来る位置を 0 にする。今の位置（0 からのずれ）は保つ
    function center() {
      const px = ctl.scrollLeft / K - x0, py = ctl.scrollTop / K - y0;
      padW = pad.clientWidth; padH = pad.clientHeight;
      x0 = SURF / 2 - padW / 2; y0 = SURF / 2 - padH / 2;
      ctl.scrollTo({ left: (x0 + px) * K, top: (y0 + py) * K, behavior: 'instant' });
    }
    ctl.addEventListener('scroll', () => readInto(RD[0]), { passive: true });
    // 1 拍に 2 回: setTimeout で拍の半分ごとの時刻まで待ち、MessageChannel のメッセージを挟んで読む（入れ子の setTimeout は 4 ms 以上に延ばされるため）
    const mcT = new MessageChannel(), mcB = new MessageChannel();
    let tickOn = false, tickGen = 0, busyOn = false, busyGen = 0, busyTimer = 0, noteHold = 0;
    // setTimeout の待ち時間は整数の ms に切り捨てられ、早く来ることがあるので、切り上げて渡し、読み終えた刻みより後の刻みを選ぶ
    let tickAt = 0;
    mcT.port1.onmessage = (e) => {
      if (!tickOn || e.data !== tickGen) return;
      readInto(RD[2]);
      const now = performance.now(), at = nextTick(Math.max(now, tickAt), vsync, frameMs, 2), g = tickGen;
      tickAt = at;
      setTimeout(() => mcT.port2.postMessage(g), Math.max(0, Math.ceil(at - now)));
    };
    function setTick(on) {
      if (on === tickOn) return;
      tickOn = on; tickGen++;
      if (on) mcT.port2.postMessage(tickGen);
    }
    // 休まず読む: メッセージを受けるたびに読んで、すぐ次のメッセージを送る
    mcB.port1.onmessage = (e) => {
      if (!busyOn || e.data !== busyGen) return;
      readInto(RD[3]);
      mcB.port2.postMessage(busyGen);
    };
    function setBusy(on, why) {
      busyOn = on; busyGen++; $('busy').checked = on; clearTimeout(busyTimer);
      if (on) {
        RD[3].s.length = 0;
        mcB.port2.postMessage(busyGen);
        busyTimer = setTimeout(() => setBusy(false, '10 秒たったので、休まず読むのを止めた。'), 10000);
      }
      if (why) { $('note1').textContent = why; noteHold = performance.now() + 3000; }
    }
    $('busy').onchange = (e) => setBusy(e.target.checked);
    $('wide').onchange = (e) => {
      const px = ctl.scrollLeft / K - x0, py = ctl.scrollTop / K - y0;
      K = e.target.checked ? 4 : 1;
      pad.style.setProperty('--k', K);
      ctl.scrollTo({ left: (x0 + px) * K, top: (y0 + py) * K, behavior: 'instant' });
      RD.forEach((r) => (r.s.length = 0));
    };
    $('ghost').onchange = (e) => pad.classList.toggle('ghost', e.target.checked);
    let autoOn = false, autoT = 0;
    const autoBtn = $('auto');
    function setAuto(on) {
      autoOn = on;
      autoBtn.setAttribute('aria-pressed', String(on));
      autoBtn.textContent = on ? '自動を止める' : '自動で動かす';
    }
    autoBtn.onclick = () => setAuto(!autoOn);
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => ctl.addEventListener(t, () => { if (autoOn) setAuto(false); }, { passive: true }));
    setAuto(!!window.THUMB || !reduce);

    function fillTable(now) {
      RD.forEach((r, i) => {
        const off = i === 3 && !busyOn;
        const q = rateOf(r.s, now, 1000);
        $('ra' + i).textContent = off ? '--' : Math.round(q.reads).toLocaleString('ja-JP');
        $('rc' + i).textContent = off ? '--' : String(Math.round(q.changes));
      });
    }
    function noteRead(now) {
      const a = Math.round(rateOf(RD[1].s, now, 1000).changes), b = Math.round(rateOf(RD[2].s, now, 1000).changes);
      let m;
      if (a < 5) m = '格子をスクロールするか「自動で動かす」を押すと、1 秒ごとに数え直します。';
      else if (b > a * 1.15) m = `新しい位置は、1 拍に 1 回読むと ${a} 回/秒、1 拍に 2 回読むと ${b} 回/秒。このブラウザは描画の拍より細かく位置を渡している。`;
      else m = `新しい位置は、1 拍に 1 回読むと ${a} 回/秒、2 回読んでも ${b} 回/秒。このブラウザでは位置が描画の拍ごとに届くので、読む回数を増やしても新しい位置は増えない。記事の iPhone では、60 回/秒の rAF に対して 80〜90 回/秒に増えた。`;
      $('note1').textContent = m;
    }
    // 直近 1 秒に読んだ時刻（横）と位置（縦）を、読み方ごとに 1 段ずつ描く
    function drawLanes(now) {
      const dpr = Math.min(2, devicePixelRatio || 1), W = Math.max(1, lanes.clientWidth), H = Math.max(1, lanes.clientHeight);
      if (lanes.width !== Math.round(W * dpr) || lanes.height !== Math.round(H * dpr)) { lanes.width = Math.round(W * dpr); lanes.height = Math.round(H * dpr); }
      lg.setTransform(dpr, 0, 0, dpr, 0, 0);
      lg.clearRect(0, 0, W, H);
      const t0 = now - 1000, LH = H / RD.length;
      const span = (key) => {
        let a = Infinity, b = -Infinity;
        for (const r of RD) for (const p of r.s) if (p.t > t0) { a = Math.min(a, p[key]); b = Math.max(b, p[key]); }
        return [a, b];
      };
      const [xa, xb] = span('x'), [ya, yb] = span('y');
      const key = xb - xa >= yb - ya ? 'x' : 'y';
      let [lo, hi] = key === 'x' ? [xa, xb] : [ya, yb];
      if (!(hi - lo >= 1)) { const m = Number.isFinite(lo) ? (lo + hi) / 2 : 0; lo = m - 1; hi = m + 1; }
      lg.font = '10px system-ui, sans-serif';
      RD.forEach((r, i) => {
        const top0 = i * LH, Y = (v) => top0 + LH - 4 - ((v - lo) / (hi - lo)) * (LH - 9);
        lg.fillStyle = i % 2 ? '#ffffff07' : '#ffffff0e';
        lg.fillRect(0, top0, W, LH);
        lg.strokeStyle = '#6fd3ff99'; lg.lineWidth = 1; lg.beginPath();
        let prev = null, started = false;
        for (const p of r.s) {
          if (p.t > t0) {
            const X = ((p.t - t0) / 1000) * W;
            if (!started) { lg.moveTo(X, Y(p[key])); started = true; } else { lg.lineTo(X, Y(prev[key])); lg.lineTo(X, Y(p[key])); }
          }
          prev = p;
        }
        if (started) lg.lineTo(W, Y(prev[key]));
        lg.stroke();
        prev = null;
        for (const p of r.s) {
          if (p.t > t0) {
            const X = ((p.t - t0) / 1000) * W, moved = prev && (p.x !== prev.x || p.y !== prev.y);
            lg.fillStyle = moved ? '#ffcf5a' : '#8b97ab88';
            const z = moved ? 3 : 2;
            lg.fillRect(X - z / 2, Y(p[key]) - z / 2, z, z);
          }
          prev = p;
        }
        lg.fillStyle = '#c4cee0';
        lg.fillText(r.short, 4, top0 + 11);
      });
    }
    let lastTable = 0, lastNote = 0;
    function step1() {
      readInto(RD[1]);
      const t = performance.now(), s = RD[1].s, last = s[s.length - 1];
      if (last) {
        $('pos').textContent = `${last.x.toFixed(2)}, ${last.y.toFixed(2)}`;
        ring.style.translate = `${padW / 2 - last.x - 28}px ${padH / 2 - last.y - 28}px`;
      }
      $('spd').textContent = String(Math.round(speedOf(s, t, 150)));
      if (t - lastTable > 250) {
        lastTable = t;
        fillTable(t);
        const fx = finest(s.map((p) => p.x)), fy = finest(s.map((p) => p.y)), f = fx && fy ? Math.min(fx, fy) : fx || fy;
        $('fine').textContent = f ? String(+f.toFixed(3)) : '--';
      }
      if (t - lastNote > 1000 && t > noteHold) { lastNote = t; noteRead(t); }
      drawLanes(t);
      if (autoOn && t - autoT > 1400) {
        autoT = t;
        const r = () => Math.random() * 2 - 1;
        ctl.scrollTo({ left: (x0 + r() * 220) * K, top: (y0 + r() * 130) * K, behavior: 'smooth' });
      }
    }

    // ---- 2. 慣性と吸着 ----
    const p2 = $('p2'), ballCv = $('ball'), bg = ballCv.getContext('2d'), ballCtl = $('ballCtl'), dialCv = $('dial'), dg = dialCv.getContext('2d'), dialCtl = $('dialCtl');
    const STEP = 80, NOTCH = 21, FROM = -135, TO = 135;
    dialCtl.innerHTML = Array.from({ length: NOTCH }, (_, i) => `<div class="n" data-i="${i}"></div>`).join('') + '<div class="end"></div>';
    const PTS = Array.from({ length: 64 }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / 64, r = Math.sqrt(1 - y * y), a = i * 2.399963;
      return { v: [r * Math.cos(a), y, r * Math.sin(a)], c: `hsl(${(i * 47) % 360} 80% 62%)` };
    });
    let M = [1, 0, 0, 0, 1, 0, 0, 0, 1], bLast = null, inited2 = false, dialVal = 0, dialPend = 0, spin = 0, auto2 = false, auto2T = 0;
    function init2() {
      if (inited2) return;
      inited2 = true;
      ballCtl.scrollTo({ left: (ballCtl.scrollWidth - ballCtl.clientWidth) / 2, top: (ballCtl.scrollHeight - ballCtl.clientHeight) / 2, behavior: 'instant' });
      bLast = null;
    }
    // 端に近づいたら、止まったときに真ん中へ戻す（戻した分は回したことにしない）
    onEnd(ballCtl, () => {
      const mx = ballCtl.scrollWidth - ballCtl.clientWidth, my = ballCtl.scrollHeight - ballCtl.clientHeight;
      const nx = recenter(ballCtl.scrollLeft, mx, 6000), ny = recenter(ballCtl.scrollTop, my, 6000);
      if (nx !== ballCtl.scrollLeft || ny !== ballCtl.scrollTop) {
        ballCtl.scrollTo({ left: nx, top: ny, behavior: 'instant' });
        bLast = { x: ballCtl.scrollLeft, y: ballCtl.scrollTop };
      }
    });
    // 目盛り: 動いている間に止まる先を知らせる scrollsnapchanging と、止まった目盛りを知らせる scrollsnapchange。無いブラウザでは位置から計算する
    const snapEvents = 'onscrollsnapchanging' in HTMLElement.prototype;
    if (snapEvents) {
      dialCtl.addEventListener('scrollsnapchanging', (e) => { const t = e.snapTargetBlock; if (t && t.dataset && t.dataset.i) dialPend = +t.dataset.i; });
      dialCtl.addEventListener('scrollsnapchange', (e) => { const t = e.snapTargetBlock; if (t && t.dataset && t.dataset.i) { dialVal = +t.dataset.i; dialPend = dialVal; } });
    } else {
      onEnd(dialCtl, () => { dialVal = dialOf(dialCtl.scrollTop, STEP, NOTCH, FROM, TO).idx; dialPend = dialVal; });
    }
    $('show2').onchange = (e) => p2.classList.toggle('show', e.target.checked);
    $('auto2').onclick = () => {
      auto2 = !auto2; auto2T = 0;
      $('auto2').setAttribute('aria-pressed', String(auto2));
      $('auto2').textContent = auto2 ? '自動を止める' : '自動で動かす';
    };
    function fit(cv) {
      const dpr = Math.min(2, devicePixelRatio || 1), W = Math.max(1, cv.clientWidth), H = Math.max(1, cv.clientHeight);
      const w = Math.round(W * dpr), h = Math.round(H * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      return { W, H, dpr };
    }
    function drawBall() {
      const { W, H, dpr } = fit(ballCv), cx = W / 2, cy = H / 2, R = Math.max(4, Math.min(W, H) * 0.4);
      bg.setTransform(dpr, 0, 0, dpr, 0, 0);
      bg.clearRect(0, 0, W, H);
      const grd = bg.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      grd.addColorStop(0, '#2a4a6e'); grd.addColorStop(1, '#0d1726');
      bg.fillStyle = grd; bg.beginPath(); bg.arc(cx, cy, R, 0, Math.PI * 2); bg.fill();
      // 緯線と経線。手前の線は明るく、奥の線は薄く
      const front = new Path2D(), back = new Path2D();
      const add = (f) => {
        let prev = null;
        for (let k = 0; k <= 48; k++) {
          const p = apply3(M, f(k / 48));
          if (prev) { const P = prev[2] > 0 && p[2] > 0 ? front : back; P.moveTo(cx + prev[0] * R, cy + prev[1] * R); P.lineTo(cx + p[0] * R, cy + p[1] * R); }
          prev = p;
        }
      };
      for (let i = 1; i < 6; i++) {
        const la = -Math.PI / 2 + (i * Math.PI) / 6, c = Math.cos(la), s = Math.sin(la);
        add((u) => [c * Math.cos(u * 2 * Math.PI), s, c * Math.sin(u * 2 * Math.PI)]);
      }
      for (let i = 0; i < 6; i++) {
        const lon = (i * Math.PI) / 6;
        add((u) => { const la = u * 2 * Math.PI; return [Math.cos(la) * Math.cos(lon), Math.sin(la), Math.cos(la) * Math.sin(lon)]; });
      }
      bg.lineWidth = 1;
      bg.strokeStyle = '#9fdcff22'; bg.stroke(back);
      bg.strokeStyle = '#9fdcffcc'; bg.stroke(front);
      for (const q of PTS) {
        const p = apply3(M, q.v);
        if (p[2] <= 0) continue;
        bg.globalAlpha = 0.35 + 0.65 * p[2];
        bg.fillStyle = q.c; bg.beginPath(); bg.arc(cx + p[0] * R, cy + p[1] * R, 1.5 + 3 * p[2], 0, Math.PI * 2); bg.fill();
      }
      bg.globalAlpha = 1;
      bg.strokeStyle = '#6fd3ff'; bg.lineWidth = 1.5; bg.beginPath(); bg.arc(cx, cy, R, 0, Math.PI * 2); bg.stroke();
      return R;
    }
    function drawDial(angle) {
      const { W, H, dpr } = fit(dialCv), cx = W / 2, cy = H / 2 + 4, R = Math.max(4, Math.min(W, H) * 0.32);
      dg.setTransform(dpr, 0, 0, dpr, 0, 0);
      dg.clearRect(0, 0, W, H);
      const rad = (deg) => ((deg - 90) * Math.PI) / 180;
      for (let i = 0; i < NOTCH; i++) {
        const a = rad(FROM + ((TO - FROM) * i) / (NOTCH - 1)), on = i === dialVal, pend = i === dialPend && dialPend !== dialVal;
        const r1 = R * 1.14, r2 = R * (i % 5 === 0 ? 1.36 : 1.26);
        dg.strokeStyle = on ? '#ffcf5a' : pend ? '#6fd3ff' : '#8b97ab99';
        dg.lineWidth = on || pend ? 3 : 1.5;
        dg.beginPath(); dg.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); dg.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); dg.stroke();
      }
      if (angle > FROM) {
        dg.strokeStyle = '#ffcf5a55'; dg.lineWidth = 4;
        dg.beginPath(); dg.arc(cx, cy, R * 1.06, rad(FROM), rad(Math.min(angle, TO + 30))); dg.stroke();
      }
      const grd = dg.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      grd.addColorStop(0, '#3a4456'); grd.addColorStop(1, '#151a24');
      dg.fillStyle = grd; dg.beginPath(); dg.arc(cx, cy, R, 0, Math.PI * 2); dg.fill();
      dg.strokeStyle = '#2a3242'; dg.lineWidth = 2; dg.stroke();
      const a = rad(angle);
      dg.strokeStyle = '#ffcf5a'; dg.lineWidth = 4; dg.lineCap = 'round';
      dg.beginPath(); dg.moveTo(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55); dg.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); dg.stroke();
      dg.lineCap = 'butt';
      dg.fillStyle = '#d9e1ee'; dg.font = `600 ${Math.max(8, Math.round(R * 0.36))}px system-ui, sans-serif`;
      dg.textAlign = 'center'; dg.textBaseline = 'middle';
      dg.fillText(String(dialVal), cx, cy);
    }
    function step2(now) {
      const x = ballCtl.scrollLeft, y = ballCtl.scrollTop, R = Math.max(4, Math.min(ballCv.clientWidth, ballCv.clientHeight) * 0.4);
      let turn = 0;
      if (bLast) {
        // 中身は指と同じ向きに動くので、スクロールの位置の増え方とは逆向きに回す
        const dx = bLast.x - x, dy = bLast.y - y;
        if (dx || dy) { M = rollBy(M, dx, dy, R); turn = Math.hypot(dx, dy) / R; }
      }
      bLast = { x, y };
      spin = spin * 0.85 + ((turn * 180) / Math.PI) * (1000 / frameMs) * 0.15;
      drawBall();
      const q = dialOf(dialCtl.scrollTop, STEP, NOTCH, FROM, TO);
      if (!snapEvents) dialPend = q.idx;
      drawDial(q.angle);
      $('ballInfo').textContent = `回る速さ ${Math.round(spin)}°/秒`;
      $('dialVal').textContent = String(dialVal);
      $('dialPend').textContent = dialPend !== dialVal ? `→ ${dialPend} で止まる` : '';
      if (auto2 && now - auto2T > 1600) {
        auto2T = now;
        ballCtl.scrollBy({ left: (Math.random() * 2 - 1) * 500, top: (Math.random() * 2 - 1) * 300, behavior: 'smooth' });
        dialCtl.scrollTo({ top: Math.floor(Math.random() * NOTCH) * STEP, behavior: 'smooth' });
      }
    }

    // ---- 3. 描く処理を分ける ----
    // メインと Worker の両方で同じ絵を描く。時刻は timeOrigin + now（ページの始まりからではなく、共通の時計）を使う
    function drawSpin(g, w, h, t, dpr) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = w / dpr, H = h / dpr, cx = W / 2, cy = H / 2 - 8, R = Math.max(4, Math.min(W, H - 24) * 0.42);
      g.fillStyle = '#0a0d13'; g.fillRect(0, 0, W, H);
      const a = ((t % 2000) / 2000) * Math.PI * 2;
      g.lineWidth = 3; g.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const b = a - (i * Math.PI) / 16;
        g.strokeStyle = `rgba(111, 211, 255, ${(1 - i / 12).toFixed(3)})`;
        g.beginPath(); g.moveTo(cx + Math.cos(b) * R * 0.3, cy + Math.sin(b) * R * 0.3); g.lineTo(cx + Math.cos(b) * R, cy + Math.sin(b) * R); g.stroke();
      }
      const u = (t % 1600) / 1600, px = 10 + (W - 20) * (u < 0.5 ? u * 2 : 2 - u * 2);
      g.fillStyle = '#ffcf5a'; g.beginPath(); g.arc(px, H - 10, 6, 0, Math.PI * 2); g.fill();
    }
    // Worker の中で動く部分。drawSpin と一緒に文字列にして Worker へ渡す
    function workerMain() {
      let cv = null, g = null, run = true, dpr = 1, n = 0, since = performance.now(), queued = false;
      const raf = typeof requestAnimationFrame === 'function' ? (f) => requestAnimationFrame(f) : (f) => setTimeout(f, 16);
      const loop = () => {
        queued = false;
        if (!run || !g) return;
        drawSpin(g, cv.width, cv.height, performance.timeOrigin + performance.now(), dpr);
        n++;
        const now = performance.now();
        if (now - since >= 500) { postMessage({ fps: (n * 1000) / (now - since) }); n = 0; since = now; }
        queued = true;
        raf(loop);
      };
      onmessage = (e) => {
        const m = e.data || {};
        if (m.canvas) { cv = m.canvas; g = cv.getContext('2d'); }
        if (m.size && cv) { cv.width = Math.max(1, m.size[0]); cv.height = Math.max(1, m.size[1]); dpr = m.size[2] || 1; }
        if ('run' in m) run = m.run;
        if (run && g && !queued) { since = performance.now(); n = 0; queued = true; raf(loop); }
      };
    }
    const cvMain = $('cvMain'), mg = cvMain.getContext('2d'), cvWork = $('cvWork');
    let worker = null, m3n = 0, m3since = 0;
    const say3 = (m) => { $('note3').textContent = m; };
    function sizeOf(cv) {
      const dpr = Math.min(2, devicePixelRatio || 1);
      return [Math.max(1, Math.round(cv.clientWidth * dpr)), Math.max(1, Math.round(cv.clientHeight * dpr)), dpr];
    }
    function start3() {
      if (worker) { worker.postMessage({ run: true, size: sizeOf(cvWork) }); return; }
      if (worker === false) return;
      if (!('transferControlToOffscreen' in HTMLCanvasElement.prototype) || typeof Worker === 'undefined') {
        worker = false;
        say3('このブラウザでは transferControlToOffscreen か Worker が使えないため、右の絵は描けない。');
        return;
      }
      try {
        const url = URL.createObjectURL(new Blob([`${drawSpin}\n(${workerMain})();`], { type: 'text/javascript' }));
        worker = new Worker(url);
        const off = cvWork.transferControlToOffscreen();
        worker.onmessage = (e) => { if (e.data && e.data.fps != null) $('fpsWork').textContent = String(Math.round(e.data.fps)); };
        worker.onerror = (e) => say3('Worker で失敗した: ' + (e.message || '理由は不明'));
        worker.postMessage({ canvas: off, size: sizeOf(cvWork), run: true }, [off]);
      } catch (err) {
        worker = false;
        say3('Worker を作れなかった: ' + err.message);
      }
    }
    function step3(now) {
      const [w, h, dpr] = sizeOf(cvMain);
      if (cvMain.width !== w || cvMain.height !== h) { cvMain.width = w; cvMain.height = h; }
      drawSpin(mg, w, h, performance.timeOrigin + performance.now(), dpr);
      m3n++;
      if (!m3since) m3since = now;
      if (now - m3since >= 500) { $('fpsMain').textContent = String(Math.round((m3n * 1000) / (now - m3since))); m3n = 0; m3since = now; }
    }
    let jankT = 0;
    $('jank').onchange = (e) => {
      clearInterval(jankT);
      if (e.target.checked) jankT = setInterval(() => { const t = performance.now(); while (performance.now() - t < 400) { /* わざとメインを止める */ } }, 600);
    };

    // ---- タブ（focusgroup が無いブラウザでは、矢印キーでの移動を自分で書く） ----
    const tabs = [...document.querySelectorAll('.tabs [role="tab"]')], pans = [$('pan1'), $('pan2'), $('pan3')];
    const nativeFG = 'focusGroup' in HTMLElement.prototype;
    function pick(i) {
      if (i === panel) return;
      panel = i;
      tabs.forEach((t, j) => {
        const on = j === i - 1;
        t.setAttribute('aria-selected', String(on));
        t.toggleAttribute('focusgroupstart', on);
        if (!nativeFG) t.tabIndex = on ? 0 : -1;
      });
      pans.forEach((p, j) => { p.hidden = j !== i - 1; });
      setTick(i === 1);
      if (i !== 1 && busyOn) setBusy(false);
      if (i === 1) center();
      if (i === 2) init2();
      if (i === 3) start3(); else if (worker) worker.postMessage({ run: false });
    }
    tabs.forEach((t, j) => { t.addEventListener('click', () => pick(j + 1)); t.addEventListener('focus', () => pick(j + 1)); });
    if (!nativeFG) {
      tabs[0].parentElement.addEventListener('keydown', (e) => {
        const k = tabs.indexOf(document.activeElement);
        if (k < 0) return;
        let n = -1;
        if (e.key === 'ArrowRight') n = (k + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') n = (k - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        if (n < 0) return;
        e.preventDefault();
        tabs[n].focus();
      });
    }

    // ---- 毎フレームの処理 ----
    const gaps = [];
    let lastNow = 0, lastHz = 0;
    function tickAll(now) {
      if (lastNow) { gaps.push(now - lastNow); if (gaps.length > 90) gaps.shift(); }
      lastNow = now; vsync = now; frameMs = frameOf(gaps);
      if (now - lastHz > 500) { lastHz = now; $('hz').textContent = `画面の書き換え ${Math.round(1000 / frameMs)} 回/秒`; }
      if (panel === 1) step1();
      else if (panel === 2) step2(now);
      else if (panel === 3) step3(now);
      requestAnimationFrame(tickAll);
    }
    pick(1);
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        if (panel === 1) center();
        if (worker) worker.postMessage({ size: sizeOf(cvWork) });
      }).observe(document.body);
    }
    requestAnimationFrame(tickAll);
  },
});

dekiru.add({
  id: 'tr-20261126-quadratic-sieve', c: 'trend', lv: 3, date: '2026-11-26',
  t: '48 桁の数を、二次ふるい法でブラウザの中で 2 秒ほどで素因数分解する',
  y: 'よんじゅうはちけたのかずを にじふるいほうでぶらうざのなかでにびょうほどでそいんすうぶんかいする',
  tags: ['Cogentic', '素因数分解', '二次ふるい法', 'BigInt', 'scheduler.yield', 'canvas'],
  d: '2026-11-25 に Google Research が、Gemini 4 を使ったエージェントの仕組み Cogentic が作った 6 本の論文を GitHub に置いた（Hacker News で 494 点・356 件）。その 1 本「Unconditional Integer Factorization in Time L_N[1/3, O(1)]」は、どんな整数 N でも、期待値で L_N[1/3, 105] 以内の時間に完全に素因数分解する方法を作り、証明されていない仮定を使わずに示したと書いている。L_N[α, c] = exp(c (ln N)^α (ln ln N)^(1−α)) は、素因数分解の速さを表す式で、α が小さいほど速い。今いちばん速い数体ふるい法も L_N[1/3, 1.923] だが、その見積もりは証明されていない仮定に頼っている。論文は Lean 4 で全部を形式化したとも書いているが、その Lean のファイルはまだ公開されていない。X の Ryan Yan さんの投稿（2026-11-25）も「どれもまだ独立に確かめられていない」と書いている。'
    + 'この見本は、論文の方法ではなく、同じ「準指数時間」の仲間で一番わかりやすい二次ふるい法（多項式を取り替える MPQS と、大きな素数 1 つの式を組み合わせる工夫）を一から書き、ブラウザの中で動かす。桁数のボタンを押すと、その桁数の 2 つの素数の積 N を作って分解する。上の図の左は、1 本の多項式でふるった値（割り切れる素数の対数の合計）と、しきい値を越えた点。右は、集めた式の 0 と 1 の表（行が式、列が素数、指数が奇数なら点）で、消去が進む様子と、全部 0 になった行（掛けると平方になる式の組）を見せる。下の欄には、選んだ式から作った X と Y、gcd(X − Y, N) を出す。同じ N を割り算とポラードの ρ 法でも 2 秒ずつ試し、全部やるとどれだけかかるかを出す。最後に、割り算・ρ 法・二次ふるい法・数体ふるい法・論文の上限の 5 つの式を桁数ごとに比べる。'
    + 'パソコンの Chrome（画面を出さずに動かしたもの）で 4〜5 回ずつ動かすと、二次ふるい法は 40 桁で 0.1〜0.3 秒、48 桁で 1.2〜2 秒だった。同じ 40 桁の N（2 つの素数はどちらも 20 桁）を割り算で順に試すと、1 秒に約 1,300 万回の速さで数万年、ρ 法は 1 秒に約 650 万回の速さで十数分という見積もりになった。48 桁では、割り算が数億年、ρ 法が 1 日近くになった。式の上では、論文の上限 L[1/3, 105] が割り算の √N より小さくなるのは約 13,700 桁から、二次ふるい法の式より小さくなるのは約 1.8 × 10^13 桁からで、定数 105 が大きいので、今使われている暗号の大きさ（617 桁の RSA-2048 など）では、この式は割り算よりもずっと大きい。'
    + '再現できていない所: 論文の方法と証明そのもの、数体ふるい法は作っていない（論文の中身は読み比べていない）。L の式は指数の中の小さな項（o(1)）を省いた形なので、入れ替わる桁数は目安。素数かどうかはミラー–ラビン法で決め、3.3 × 10^24 以上では確率的な判定になる。',
  p: '二次ふるい法は、N を法として X² ≡ Y² だが X ≢ ±Y となる組を作り、gcd(X − Y, N) で約数を取り出す。X² ≡ q² · Q(x) (mod N) となる多項式 Q(x) = a x² + 2 b x + c（a = q²、b² ≡ N (mod a)）を作り、小さな素数だけで割り切れる Q(x)（なめらかな値）を集める。どの x で p が割り切れるかは、p を法とした N の平方根 t から x ≡ (±t − b) / a (mod p) と決まるので、割り算をせずに、その位置へ log₂ p を足していき（ふるい）、合計がしきい値を越えた所だけを BigInt で割って確かめる。集めた式の指数を 2 で割った余りを 0 と 1 の表にして、2 を法とした消去（XOR）で、足すと全部 0 になる行の組を探すと、その式を全部掛けた値の指数はすべて偶数になり、平方根 Y が作れる。割り切れずに大きな素数 L が 1 つだけ残った式も取っておき、同じ L の式が 2 つそろったら掛けて L² を平方根の側へ回す。ふるいの配列は Uint8Array、素数ごとの根は Int32Array と Number で計算し、大きな N の割り算の余りは 2^24 ごとに分けた桁から Number だけで求める。長い計算は 30 ms ごとに scheduler.yield()（無いブラウザは setTimeout）で区切り、図と数字を描き直す。',
  refs: [
    { title: 'Google Research: cogentic_research_papers（2026-11-25 に 6 本を追加）', url: 'https://github.com/google-research/google-research/tree/master/cogentic_research_papers' },
    { title: 'Unconditional Integer Factorization in Time L_N[1/3, O(1)]（README と PDF）', url: 'https://github.com/google-research/google-research/tree/master/cogentic_research_papers/integer_factorization' },
    { title: 'Hacker News: Google releases Cogentic papers on integer factorization, discrete logs and more', url: 'https://news.ycombinator.com/item?id=50642086' },
    { title: 'Ryan Yan さんの X の投稿（2026-11-25）', url: 'https://x.com/RyanYanBuilds/status/2125563516119851195' },
  ],
  html: `<div class="wrap">
  <header class="head">
    <p class="nline"><span class="lbl">N =</span> <output id="nOut" class="num">-</output></p>
    <p class="sub" id="nInfo">-</p>
  </header>
  <canvas id="board" class="board" role="img" aria-label="左はふるいの値としきい値、右は集めた式の 0 と 1 の表"></canvas>
  <p id="status" class="status" role="status">準備しています</p>
  <div class="side">
    <div class="row" role="group" aria-label="桁数を選んで新しい N を作って分解する">
      <span class="k">桁数</span>
      <button type="button" class="dg" data-d="20">20</button>
      <button type="button" class="dg" data-d="24">24</button>
      <button type="button" class="dg" data-d="28">28</button>
      <button type="button" class="dg" data-d="32">32</button>
      <button type="button" class="dg" data-d="36">36</button>
      <button type="button" class="dg" data-d="40">40</button>
      <button type="button" class="dg" data-d="44">44</button>
      <button type="button" class="dg" data-d="48">48</button>
    </div>
    <div class="row">
      <label for="nIn">自分で入れる（50 桁まで）</label>
      <input id="nIn" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="例 1000000016000000063">
    </div>
    <div class="row">
      <button type="button" id="go" class="main">二次ふるい法で分解</button>
      <button type="button" id="stop" disabled>止める</button>
      <label class="ck"><input type="checkbox" id="slow"> ゆっくり見せる</label>
    </div>
    <ol class="steps">
      <li><b>① 因数の候補を決める</b><span id="s1">-</span></li>
      <li><b>② ふるって、小さな素数だけで割り切れる値を集める</b><progress id="prog" max="1" value="0" aria-label="集めた式の数"></progress><span id="s2">-</span></li>
      <li><b>③ 0 と 1 の表を消去する</b><span id="s3">-</span></li>
      <li><b>④ 平方の一致から約数を取り出す</b><span id="s4">-</span></li>
    </ol>
    <div id="detail" class="detail"></div>
    <p id="result" class="result"></p>
  </div>
  <section class="box">
    <h3>同じ N を別の方法で（それぞれ 2 秒まで）</h3>
    <button type="button" id="cmp" disabled>割り算と ρ 法でも試す</button>
    <div class="tw"><table><thead><tr><th>方法</th><th>2 秒での結果</th><th>試した回数</th><th>見つかるまでの見積もり</th></tr></thead><tbody id="cmpBody"></tbody></table></div>
  </section>
  <section class="box">
    <h3>この端末での記録（二次ふるい法）</h3>
    <div class="tw"><table><thead><tr><th>桁</th><th>合計</th><th>ふるい / 表</th><th>多項式</th><th>式</th><th>前の行からの伸び（実際 / 式の比）</th></tr></thead><tbody id="logBody"></tbody></table></div>
    <p class="note">桁数の順に並べ、すぐ上の、桁数の少ない行と比べる。式の比は L[1/2, 1] の値の比で、定数や小さな項を省いた式なので目安。「ゆっくり見せる」で動かしたときは待ち時間が入るので記録しない。</p>
  </section>
  <section class="box">
    <h3>計算量の式 L[α, c] を桁数で比べる</h3>
    <canvas id="chart" class="chart" role="img" aria-label="桁数ごとの、5 つの方法の手数の式の値"></canvas>
    <div class="row"><label for="dg">桁数</label><input type="range" id="dg" min="10" max="700" step="1" value="309"><output id="dgOut" for="dg">309</output> 桁</div>
    <div class="tw"><table><thead><tr><th>方法</th><th>式の値（手数）</th><th>1 秒に 10 億回として</th></tr></thead><tbody id="lBody"></tbody></table></div>
    <p id="cross" class="note"></p>
  </section>
</div>`,
  css: `:root { color-scheme: dark; --bg: #0e1117; --fg: #d9e1ee; --mut: #8b97ab; --ac: #6fd3ff; --ac2: #ffcf5a; --line: #2a3242; --card: #151a23; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.6 system-ui, sans-serif; }
.wrap { padding: 12px 16px 24px; display: grid; gap: 10px; max-width: 980px; margin: 0 auto; }
.nline { margin: 0; font: 600 15px/1.45 ui-monospace, Consolas, monospace; overflow-wrap: anywhere; }
.lbl { color: var(--mut); }
.sub, .status { margin: 0; color: var(--mut); font-size: 13px; }
.board { width: 100%; height: 250px; display: block; background: #0a0d12; border: 1px solid var(--line); border-radius: 8px; }
@media (width < 520px) { .board { height: 390px; } }
.side { display: grid; gap: 8px; }
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.k { color: var(--mut); margin-right: 2px; }
button { font: inherit; color: var(--fg); background: #1d2430; border: 1px solid var(--line); border-radius: 6px; padding: 3px 10px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--ac); }
button:disabled { opacity: 0.45; cursor: default; }
button.main { background: #12384a; border-color: #2f6f8a; }
button[aria-pressed="true"] { border-color: var(--ac); color: var(--ac); }
#nIn { font: 14px ui-monospace, Consolas, monospace; width: min(100%, 36em); background: #0a0d12; color: var(--fg); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; }
.ck { color: var(--mut); }
.steps { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.steps li { background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; font-size: 13px; overflow-wrap: anywhere; }
.steps b { display: block; color: var(--ac2); font-weight: 600; }
progress { accent-color: var(--ac); width: min(100%, 260px); display: block; margin: 2px 0; }
.detail { display: grid; gap: 2px; font: 12.5px/1.55 ui-monospace, Consolas, monospace; overflow-wrap: anywhere; color: #c5cfdf; }
.detail:empty { display: none; }
.result { margin: 0; font: 600 14px/1.5 ui-monospace, Consolas, monospace; overflow-wrap: anywhere; color: #7ee787; }
.result:empty { display: none; }
.box { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; display: grid; gap: 8px; }
.box h3 { margin: 0; font-size: 14px; }
.box > button { justify-self: start; }
.tw { overflow-x: auto; }
table { border-collapse: collapse; font-size: 12.5px; }
th, td { padding: 3px 8px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
th { color: var(--mut); font-weight: 500; }
td.n { text-align: right; font-variant-numeric: tabular-nums; }
.chart { width: 100%; height: 270px; display: block; background: #0a0d12; border-radius: 6px; }
#dg { width: min(100%, 360px); accent-color: var(--ac); }
.note { color: var(--mut); font-size: 12.5px; margin: 0; }
.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.thumb .side, .thumb .box, .thumb .status, .thumb .sub { display: none; }
.thumb .wrap { padding: 8px 10px; gap: 6px; }
.thumb .board { height: 205px; }`,
  core() {
    // ---- 大きな整数（BigInt）の道具 ----
    function bmod(a, m) { const r = a % m; return r < 0n ? r + m : r; }
    function powmod(b, e, m) {
      let r = 1n;
      b = bmod(b, m);
      while (e > 0n) {
        if (e & 1n) r = (r * b) % m;
        b = (b * b) % m;
        e >>= 1n;
      }
      return r;
    }
    function gcd(a, b) {
      if (a < 0n) a = -a;
      if (b < 0n) b = -b;
      while (b) { const t = a % b; a = b; b = t; }
      return a;
    }
    function invmod(a, m) {
      let r0 = m, r1 = bmod(a, m), s0 = 0n, s1 = 1n;
      while (r1) {
        const q = r0 / r1;
        [r0, r1] = [r1, r0 - q * r1];
        [s0, s1] = [s1, s0 - q * s1];
      }
      if (r0 !== 1n) throw new RangeError('逆数がない');
      return bmod(s0, m);
    }
    function bitLen(n) { return n <= 0n ? 0 : n.toString(2).length; }
    // n の k 乗根の整数部分（ニュートン法。上から近づける）
    function iroot(n, k) {
      if (n < 2n) return n;
      const K = BigInt(k);
      let x = 1n << BigInt(Math.ceil(bitLen(n) / k));
      for (;;) {
        const y = ((K - 1n) * x + n / x ** (K - 1n)) / K;
        if (y >= x) return x;
        x = y;
      }
    }
    function isqrt(n) { return iroot(n, 2); }
    // n が r の k 乗（k ≥ 2）なら { r, k }、違えば null
    function perfectPower(n) {
      for (let k = 2; k <= bitLen(n); k++) {
        const r = iroot(n, k);
        if (r > 1n && r ** BigInt(k) === n) return { r, k };
      }
      return null;
    }
    // ミラー–ラビン法。最初の 13 個の素数で試すと 3.3×10^24 未満では必ず正しい。それより大きい数では確率的な判定
    const MR = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n];
    function isPrime(n) {
      if (n < 2n) return false;
      for (const p of MR) {
        if (n === p) return true;
        if (n % p === 0n) return false;
      }
      let d = n - 1n, s = 0;
      while ((d & 1n) === 0n) { d >>= 1n; s++; }
      outer: for (const a of MR) {
        let x = powmod(a, d, n);
        if (x === 1n || x === n - 1n) continue;
        for (let i = 1; i < s; i++) {
          x = (x * x) % n;
          if (x === n - 1n) continue outer;
        }
        return false;
      }
      return true;
    }

    // ---- 種を決めた乱数と、桁数を決めた素数・2 つの素数の積 ----
    function seeded(seed) {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function randomDigits(d, rand) {
      let s = String(1 + Math.floor(rand() * 9));
      while (s.length < d) s += Math.floor(rand() * 10);
      return BigInt(s);
    }
    function randomPrime(d, rand) {
      for (;;) {
        let n = randomDigits(d, rand) | 1n;
        while (!isPrime(n)) n += 2n;
        if (n.toString().length === d) return n;
      }
    }
    // ちょうど d 桁で、2 つの素数の桁数がほぼ同じ積 N = p × q（p < q）
    function semiprime(d, rand) {
      const dp = Math.floor(d / 2);
      for (;;) {
        const p = randomPrime(dp, rand), q = randomPrime(d - dp, rand);
        const N = p * q;
        if (p !== q && N.toString().length === d) return p < q ? { N, p, q } : { N, p: q, q: p };
      }
    }

    // ---- 小さな数（Number）の道具。法 m は 2^26 未満とし、掛け算が 2^53 を越えないようにする ----
    function primesUpTo(n) {
      const s = new Uint8Array(n + 1), out = [];
      for (let i = 2; i <= n; i++) {
        if (s[i]) continue;
        out.push(i);
        for (let j = i * i; j <= n; j += i) s[j] = 1;
      }
      return out;
    }
    function powmodN(b, e, m) {
      let r = 1;
      b %= m;
      while (e > 0) {
        if (e & 1) r = (r * b) % m;
        b = (b * b) % m;
        e = Math.floor(e / 2);
      }
      return r;
    }
    function invmodN(a, m) {
      let r0 = m, r1 = a % m, s0 = 0, s1 = 1;
      while (r1) {
        const q = Math.floor(r0 / r1);
        [r0, r1] = [r1, r0 - q * r1];
        [s0, s1] = [s1, s0 - q * s1];
      }
      return r0 === 1 ? ((s0 % m) + m) % m : -1;
    }
    // p を法とした n の平方根（トネリ–シャンクス法）。n は平方剰余とする
    function sqrtModN(n, p) {
      n %= p;
      if (n === 0) return 0;
      if (p === 2) return n;
      if (p % 4 === 3) return powmodN(n, (p + 1) / 4, p);
      let q = p - 1, s = 0;
      while (q % 2 === 0) { q /= 2; s++; }
      let z = 2;
      while (powmodN(z, (p - 1) / 2, p) !== p - 1) z++;
      let m = s, c = powmodN(z, q, p), t = powmodN(n, q, p), r = powmodN(n, (q + 1) / 2, p);
      while (t !== 1) {
        let i = 0, tt = t;
        while (tt !== 1) { tt = (tt * tt) % p; i++; }
        let b = c;
        for (let j = 0; j < m - i - 1; j++) b = (b * b) % p;
        m = i; c = (b * b) % p; t = (t * c) % p; r = (r * b) % p;
      }
      return r;
    }
    // 大きな N を 2^24 ごとの桁に分け、小さな p で割った余りを Number だけで求める（p < 2^29）
    function limbsOf(N) {
      const out = [];
      for (let v = N; v > 0n; v >>= 24n) out.unshift(Number(v & 0xFFFFFFn));
      return out;
    }
    function modSmall(limbs, p) {
      let r = 0;
      for (let i = 0; i < limbs.length; i++) r = (r * 16777216 + limbs[i]) % p;
      return r;
    }

    // ---- 二次ふるい法（多項式を取り替える版 MPQS と、大きな素数 1 つの式の組み合わせ） ----
    // 桁数ごとの、因数の候補の数 F と、ふるう幅の半分 M（実際に動かして決めた）
    const QS_TABLE = [[12, 40, 1000], [16, 60, 1500], [20, 90, 2500], [24, 130, 4000], [28, 190, 6000], [32, 270, 10000], [36, 400, 16000], [40, 580, 26000], [44, 820, 42000], [48, 1100, 55000], [52, 1400, 65536], [56, 1800, 65536]];
    function qsParams(digits) {
      const T = QS_TABLE;
      if (digits <= T[0][0]) return { F: T[0][1], M: T[0][2] };
      for (let i = 1; i < T.length; i++) {
        if (digits <= T[i][0]) {
          const u = (digits - T[i - 1][0]) / (T[i][0] - T[i - 1][0]);
          return { F: Math.round(T[i - 1][1] + u * (T[i][1] - T[i - 1][1])), M: Math.round(T[i - 1][2] + u * (T[i][2] - T[i - 1][2])) };
        }
      }
      const L = T[T.length - 1];
      return { F: L[1], M: L[2] };
    }
    // N は 2 で割れない合成数で、累乗でないこと。因数の候補の素数で N が割れたら { factor } を返す
    function qsStart(N, opt = {}) {
      const digits = N.toString().length, par = qsParams(digits);
      const F = opt.F || par.F, M = opt.M || par.M;
      const limbs = limbsOf(N);
      const P = [-1, 2], T = [0, 1];
      let lim = Math.max(500, F * 24), primes = primesUpTo(lim), k = 1;
      while (P.length < F + 1) {
        if (k >= primes.length) { lim *= 2; primes = primesUpTo(lim); continue; }
        const p = primes[k++];
        const nm = modSmall(limbs, p);
        if (nm === 0) return { factor: BigInt(p) };
        if (powmodN(nm, (p - 1) / 2, p) === 1) { P.push(p); T.push(sqrtModN(nm, p)); }
      }
      const n = P.length, pmax = P[n - 1];
      // 因数の候補より小さい素数で N が割れないかを確かめる（候補にならなかった素数も含む）
      for (let i = 1; i < k; i++) if (modSmall(limbs, primes[i]) === 0) return { factor: BigInt(primes[i]) };
      const LG = new Uint8Array(n);
      for (let i = 1; i < n; i++) LG[i] = Math.round(Math.log2(P[i]));
      const large = Math.min(pmax * pmax, pmax * (opt.lp || 128));
      const logN = Math.log2(Number(N));
      // 値の大きさ |Q(x)| ≤ M √(N/2) の 2 を底とした対数から、大きな素数 1 つ分と、ふるわない小さな素数の分を引いた値を、しきい値にする
      const thr = Math.max(1, Math.round(Math.log2(M) + logN / 2 - 0.5 - Math.log2(large) - (opt.fudge ?? 4)));
      // 多項式の a = q^2 の q は (2N)^(1/4) / √M のあたりで、q ≡ 3 (mod 4)、N が q を法として平方剰余の素数
      let q0 = BigInt(Math.max(pmax + 1, Math.round(Math.sqrt(Math.sqrt(2 * Number(N)) / M))));
      q0 = q0 - (q0 % 4n) + 3n;
      return {
        N, digits, F, M, P, T, LG, PB: P.map((p) => BigInt(p)), pmax, large, largeB: BigInt(large), thr,
        need: n + 10, full: [], combined: [], partial: new Map(),
        qNext: q0, polys: 0, sieved: 0, cand: 0, partials: 0,
        S: new Uint8Array(2 * M), R1: new Int32Array(n), R2: new Int32Array(n), skip: P.findIndex((p) => p > 30),
        last: null,
      };
    }
    function qsCount(st) { return st.full.length + st.combined.length; }
    function qsEnough(st) { return qsCount(st) >= st.need; }
    function nextPoly(st) {
      const N = st.N;
      let q = st.qNext;
      for (;;) {
        if (isPrime(q) && powmod(N % q, (q - 1n) / 2n, q) === 1n) break;
        q += 4n;
      }
      st.qNext = q + 4n;
      const a = q * q;
      const s = powmod(N % q, (q + 1n) / 4n, q);
      // ヘンゼルの持ち上げ: b ≡ s (mod q) で b^2 ≡ N (mod q^2) となる b を作る
      const k = bmod(((N - s * s) / q) * invmod(2n * s, q), q);
      const b = s + q * k;
      const c = (b * b - N) / a;
      return { q, a, b, c };
    }
    // 多項式を 1 本作ってふるい、見つかった式を足す。最後の 1 本のふるいの値は st.last に残す（絵に使う）
    function qsPoly(st) {
      const { P, T, LG, S, R1, R2, M } = st, n = P.length, len = 2 * M;
      const poly = nextPoly(st), qn = Number(poly.q);
      const bh = Number(poly.b >> 26n), bl = Number(poly.b & 0x3FFFFFFn);
      for (let i = 2; i < n; i++) {
        const p = P[i];
        const qm = qn % p, am = (qm * qm) % p, ai = invmodN(am, p);
        const bm = ((bh % p) * (67108864 % p) + bl) % p;
        const t = T[i];
        R1[i] = (((t - bm + p) % p) * ai) % p;
        R2[i] = ((((p - t) % p - bm + p) % p) * ai) % p;
      }
      S.fill(0);
      for (let i = Math.max(2, st.skip); i < n; i++) {
        const p = P[i], lg = LG[i];
        const s1 = (R1[i] + M) % p, s2 = (R2[i] + M) % p;
        for (let j = s1; j < len; j += p) S[j] += lg;
        if (s2 !== s1) for (let j = s2; j < len; j += p) S[j] += lg;
      }
      const hits = [];
      for (let j = 0; j < len; j++) {
        if (S[j] < st.thr) continue;
        st.cand++;
        const r = checkAt(st, poly, j - M);
        if (r) hits.push(j, r);
      }
      st.polys++;
      st.sieved += len;
      st.last = { S, hits, thr: st.thr, M, poly };
      return hits;
    }
    // x の位置の値 Q(x) を因数の候補で割り切れるかを確かめる。全部割れたら 1、大きな素数が 1 つ残ったら 2、だめなら 0
    function checkAt(st, poly, x) {
      const { P, PB, R1, R2, N } = st, n = P.length;
      const xb = BigInt(x);
      const Q = (poly.a * xb + 2n * poly.b) * xb + poly.c;
      let v = Q;
      const ex = [];
      if (v < 0n) { v = -v; ex.push(0, 1); }
      if (v === 0n) return 0;
      let e = 0;
      while ((v & 1n) === 0n) { v >>= 1n; e++; }
      if (e) ex.push(1, e);
      for (let i = 2; i < n; i++) {
        const p = P[i], xm = ((x % p) + p) % p;
        if (xm !== R1[i] && xm !== R2[i]) continue;
        const pb = PB[i];
        e = 0;
        while (v % pb === 0n) { v /= pb; e++; }
        if (e) ex.push(i, e);
      }
      const X = bmod(poly.a * xb + poly.b, N);
      if (v === 1n) {
        st.full.push({ X, sq: poly.q, ex, L: 1, x, Q });
        return 1;
      }
      if (v >= st.largeB) return 0;
      const L = Number(v);
      st.partials++;
      const other = st.partial.get(L);
      const rel = { X, sq: poly.q, ex, L, x, Q };
      if (!other) { st.partial.set(L, rel); return 2; }
      // 同じ大きな素数 L が残った 2 つの式を掛けると、L は 2 乗になって平方根の側へ回せる
      st.combined.push({ X: (other.X * X) % N, sq: (other.sq * poly.q * v) % N, ex: mergeEx(other.ex, ex), L, pair: [other, rel] });
      return 3;
    }
    function mergeEx(a, b) {
      const m = new Map();
      for (const ex of [a, b]) for (let k = 0; k < ex.length; k += 2) m.set(ex[k], (m.get(ex[k]) || 0) + ex[k + 1]);
      const out = [];
      for (const [i, e] of [...m].sort((u, w) => u[0] - w[0])) out.push(i, e);
      return out;
    }
    function qsRelations(st) { return st.full.concat(st.combined).slice(0, st.need); }

    // ---- 2 を法とした行列（0 と 1 の表）の消去 ----
    // 行は式、列は因数の候補（0 列目は符号）。指数が奇数なら 1。右側に、どの式を足し合わせたかの記録（単位行列）を付ける
    function buildMatrix(rels, cols) {
      const n = rels.length, wc = (cols + 31) >>> 5, wh = (n + 31) >>> 5, W = wc + wh;
      const m = new Uint32Array(n * W);
      for (let i = 0; i < n; i++) {
        const ex = rels[i].ex;
        for (let k = 0; k < ex.length; k += 2) if (ex[k + 1] & 1) m[i * W + (ex[k] >>> 5)] ^= 1 << (ex[k] & 31);
        m[i * W + wc + (i >>> 5)] |= 1 << (i & 31);
      }
      return { n, cols, wc, wh, W, m, used: new Uint8Array(n), piv: new Int32Array(cols).fill(-1), col: 0, xors: 0 };
    }
    function bitAt(mx, i, j) { return (mx.m[i * mx.W + (j >>> 5)] >>> (j & 31)) & 1; }
    // 列 mx.col から upto の手前まで消去する。軸に選んだ行を、その列が 1 の他の全部の行へ足す（XOR）
    function elimCols(mx, upto) {
      const { n, W, m, used } = mx, end = Math.min(upto, mx.cols);
      for (; mx.col < end; mx.col++) {
        const j = mx.col, w = j >>> 5, bit = 1 << (j & 31);
        let pr = -1;
        for (let i = 0; i < n; i++) if (!used[i] && (m[i * W + w] & bit)) { pr = i; break; }
        if (pr < 0) continue;
        used[pr] = 1;
        mx.piv[j] = pr;
        const po = pr * W;
        for (let i = 0; i < n; i++) {
          if (i === pr || !(m[i * W + w] & bit)) continue;
          const io = i * W;
          for (let k = w; k < W; k++) m[io + k] ^= m[po + k];
          mx.xors++;
        }
      }
      return mx.col >= mx.cols;
    }
    // 軸にならなかった行は表の側が全部 0 になっている。その行の記録から、足し合わせた式の番号を取り出す
    function dependencies(mx) {
      const out = [];
      for (let i = 0; i < mx.n; i++) {
        if (mx.used[i]) continue;
        let zero = true;
        for (let k = 0; k < mx.wc; k++) if (mx.m[i * mx.W + k]) { zero = false; break; }
        if (!zero) continue;
        const idx = [];
        for (let r = 0; r < mx.n; r++) if ((mx.m[i * mx.W + mx.wc + (r >>> 5)] >>> (r & 31)) & 1) idx.push(r);
        out.push(idx);
      }
      return out;
    }
    // 選んだ式を全部掛けて X^2 ≡ Y^2 (mod N) を作り、gcd(X − Y, N) を求める
    function trySquare(st, rels, idx) {
      const N = st.N, cnt = new Array(st.P.length).fill(0);
      let X = 1n, Y = 1n;
      for (const i of idx) {
        const r = rels[i];
        X = (X * r.X) % N;
        Y = (Y * r.sq) % N;
        for (let k = 0; k < r.ex.length; k += 2) cnt[r.ex[k]] += r.ex[k + 1];
      }
      for (let j = 0; j < cnt.length; j++) if (cnt[j] & 1) throw new Error('指数が偶数になっていない');
      for (let j = 1; j < cnt.length; j++) if (cnt[j]) Y = (Y * powmod(st.PB[j], BigInt(cnt[j] / 2), N)) % N;
      return { X, Y, d: gcd(X - Y, N), cnt };
    }
    // まとめて動かす版（テスト用）。N を 2 つに分ける約数 d を返す
    function qsSplit(N, opt = {}) {
      const st = qsStart(N, opt);
      if (st.factor) return { d: st.factor, st: null };
      for (let round = 0; round < 4; round++) {
        while (!qsEnough(st)) qsPoly(st);
        const rels = qsRelations(st), mx = buildMatrix(rels, st.P.length);
        elimCols(mx, mx.cols);
        for (const idx of dependencies(mx)) {
          const r = trySquare(st, rels, idx);
          if (r.d > 1n && r.d < N) return { d: r.d, st, mx, idx, sq: r };
        }
        st.need += 20;
      }
      return { d: 0n, st };
    }

    // ---- ポラードの ρ 法（ブレントの書き方）。少しずつ進められる ----
    function rhoStart(N, c = 1n) { return { N, c, y: 2n, x: 2n, ys: 2n, q: 1n, r: 1, k: 0, steps: 0, d: 1n, m: 64 }; }
    function rhoSteps(st, budget) {
      const { N, c } = st;
      const f = (v) => (v * v + c) % N;
      let left = budget;
      while (st.d === 1n && left > 0) {
        if (st.k >= st.r) { st.x = st.y; st.k = 0; st.r *= 2; for (let i = 0; i < st.r; i++) st.y = f(st.y); st.steps += st.r; left -= st.r; continue; }
        st.ys = st.y;
        const lim = Math.min(st.m, st.r - st.k);
        for (let i = 0; i < lim; i++) { st.y = f(st.y); st.q = (st.q * (st.x > st.y ? st.x - st.y : st.y - st.x)) % N; }
        st.steps += lim; left -= lim;
        st.d = gcd(st.q, N);
        if (st.d === 1n) { st.k += lim; continue; }
        if (st.d === N) {
          // まとめた範囲で行き過ぎたので、1 歩ずつやり直す
          let g = 1n;
          do { st.ys = f(st.ys); g = gcd(st.x > st.ys ? st.x - st.ys : st.ys - st.x, N); } while (g === 1n);
          st.d = g;
        }
      }
      return st.d !== 1n && st.d !== N ? st.d : st.d === N ? N : 0n;
    }

    // ---- 割り算（小さい奇数から順に） ----
    function tdStart(N) { return { N, limbs: limbsOf(N), d: 3, tried: 0, root: isqrt(N), done: 0n }; }
    function tdSteps(st, count) {
      const L = st.limbs;
      if (st.N % 2n === 0n) { st.done = 2n; return 2n; }
      for (let i = 0; i < count; i++) {
        const d = st.d;
        if (BigInt(d) > st.root) { st.done = st.N; return st.N; }
        if (d > 5e8) return 0n;
        if (modSmall(L, d) === 0) { st.done = BigInt(d); return st.done; }
        st.d += 2;
        st.tried++;
      }
      return 0n;
    }

    // ---- 計算量の式 L_N[α, c] = exp(c (ln N)^α (ln ln N)^(1−α)) の、10 を底とした対数 ----
    function log10L(digits, alpha, c) {
      const ln = digits * Math.LN10, lnln = Math.log(ln);
      return (c * ln ** alpha * lnln ** (1 - alpha)) / Math.LN10;
    }
    const METHODS = [
      { id: 'td', name: '割り算', f: (d) => d / 2 },
      { id: 'rho', name: 'ρ 法', f: (d) => d / 4 },
      { id: 'qs', name: '二次ふるい法 L[1/2, 1]', f: (d) => log10L(d, 1 / 2, 1) },
      { id: 'nfs', name: '数体ふるい法 L[1/3, 1.923]', f: (d) => log10L(d, 1 / 3, Math.cbrt(64 / 9)) },
      { id: 'paper', name: '論文の上限 L[1/3, 105]', f: (d) => log10L(d, 1 / 3, 105) },
    ];
    // 2 つの式の大小が入れ替わる桁数を、桁数の対数で二分探索して求める（f(d) − g(d) の符号が変わる所）
    function crossDigits(f, g, lo = 1, hi = 1e30) {
      let a = Math.log10(lo), b = Math.log10(hi);
      const sa = Math.sign(f(lo) - g(lo));
      if (sa === Math.sign(f(hi) - g(hi))) return NaN;
      for (let i = 0; i < 200; i++) {
        const m = (a + b) / 2, d = 10 ** m;
        if (Math.sign(f(d) - g(d)) === sa) a = m; else b = m;
      }
      return 10 ** ((a + b) / 2);
    }
  },
  js() {
    const $ = (id) => document.getElementById(id);
    const THUMB = !!window.THUMB;
    if (THUMB) document.body.classList.add('thumb');
    const yieldNow = () => (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function'
      ? globalThis.scheduler.yield()
      : new Promise((r) => setTimeout(r, 0)));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const STOP = Symbol('stop');
    const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    const sup = (n) => String(n).replace(/\d/g, (c) => SUP[c]);
    const fmtInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // 負の数の符号は、画面では長い「−」で書く
    const sgn = (v) => String(v).replace(/^-/, '−');
    function short(v, keep = 12) {
      const s = String(v), neg = s.startsWith('-'), u = neg ? s.slice(1) : s;
      return (neg ? '−' : '') + (u.length <= keep * 2 + 2 ? u : `${u.slice(0, keep)}…${u.slice(-keep)}（${u.length} 桁）`);
    }
    function fmtMs(ms) {
      ms = Math.max(0, ms);
      return ms < 1000 ? `${ms.toFixed(ms < 10 ? 1 : 0)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} 秒`;
    }
    // 10 を底とした対数 k を「1.3 × 10¹⁵」の形にする
    function pow10(k) {
      if (!isFinite(k)) return '-';
      if (k < 6) return fmtInt(Math.round(10 ** k));
      let e = Math.floor(k), m = 10 ** (k - e);
      if (m >= 9.95) { m = 1; e++; }
      return `${m.toFixed(1)} × 10${sup(e)}`;
    }
    // 秒の 10 を底とした対数から、ふだんの単位の長さにする
    function fmtDurLog(lg) {
      if (!isFinite(lg)) return '-';
      if (lg < 9) {
        const s = 10 ** lg;
        if (s < 1e-3) return '1 ms 未満';
        if (s < 1) return fmtMs(s * 1000);
        if (s < 120) return `約 ${s.toFixed(0)} 秒`;
        if (s < 7200) return `約 ${(s / 60).toFixed(0)} 分`;
        if (s < 172800) return `約 ${(s / 3600).toFixed(0)} 時間`;
        if (s < 63115200) return `約 ${(s / 86400).toFixed(0)} 日`;
      }
      const ly = lg - Math.log10(31557600);
      return ly < 6 ? `約 ${fmtInt(Math.round(10 ** ly))} 年` : `約 ${pow10(ly)} 年`;
    }
    function fmtEx(ex, P, limit = 14) {
      const parts = [];
      for (let k = 0; k < ex.length; k += 2) {
        const i = ex[k], e = ex[k + 1];
        if (!e) continue;
        parts.push(i === 0 ? `(−1)${e > 1 ? sup(e) : ''}` : `${P[i]}${e > 1 ? sup(e) : ''}`);
      }
      return parts.length > limit ? `${parts.slice(0, limit).join(' · ')} · …（全 ${parts.length} 種類）` : parts.join(' · ');
    }
    function fmtFactors(primes) {
      const m = new Map();
      for (const p of primes) m.set(p, (m.get(p) || 0) + 1);
      return [...m].map(([p, e]) => `${p}${e > 1 ? sup(e) : ''}`).join(' × ');
    }

    const ui = {
      nOut: $('nOut'), nInfo: $('nInfo'), status: $('status'), s1: $('s1'), s2: $('s2'), s3: $('s3'), s4: $('s4'),
      prog: $('prog'), detail: $('detail'), result: $('result'), slow: $('slow'), go: $('go'), stop: $('stop'),
      nIn: $('nIn'), cmp: $('cmp'), cmpBody: $('cmpBody'), logBody: $('logBody'),
    };
    let view = { st: null, rels: null, mx: null, deps: null, idx: null };
    let cur = null, runId = 0, cmpId = 0;
    const records = [];
    const rand = seeded((Math.random() * 4294967296) >>> 0);

    // ---- 上の図（左: ふるい、右: 0 と 1 の表） ----
    const board = $('board'), bctx = board.getContext('2d');
    const off = document.createElement('canvas'), octx = off.getContext('2d');
    function fit(cv) {
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
      return dpr;
    }
    function drawBoard() {
      const dpr = fit(board), W = board.width, H = board.height, g = bctx;
      g.fillStyle = '#0a0d12';
      g.fillRect(0, 0, W, H);
      if (W < 60 || H < 60) return;
      const pad = 8 * dpr, wide = W / dpr >= 520;
      const A = wide ? { x: pad, y: pad, w: W * 0.6 - pad * 1.5, h: H - 2 * pad } : { x: pad, y: pad, w: W - 2 * pad, h: H * 0.45 - pad * 1.5 };
      const B = wide ? { x: W * 0.6 + pad * 0.5, y: pad, w: W * 0.4 - pad * 1.5, h: H - 2 * pad } : { x: pad, y: H * 0.45 + pad * 0.5, w: W - 2 * pad, h: H * 0.55 - pad * 1.5 };
      g.font = `${12 * dpr}px system-ui, sans-serif`;
      g.textBaseline = 'top';
      g.textAlign = 'left';
      drawSieve(g, A, dpr);
      drawMatrix(g, B, dpr);
    }
    const HIT = { 1: '#7ee787', 2: '#ffb35a', 3: '#ff8fc8' };
    function drawSieve(g, A, dpr) {
      const st = view.st, last = st && st.last;
      g.fillStyle = '#8b97ab';
      g.fillText(last ? `ふるいの値（多項式 ${fmtInt(st.polys)} 本目、x = −${fmtInt(st.M)}〜${fmtInt(st.M)}）` : 'ふるいの値', A.x, A.y, A.w);
      const top = A.y + 18 * dpr, bot = A.y + A.h - 18 * dpr, ph = Math.max(1, bot - top), pw = Math.max(1, Math.floor(A.w));
      g.strokeStyle = '#2a3242';
      g.lineWidth = 1;
      g.strokeRect(A.x + 0.5, top + 0.5, pw - 1, ph - 1);
      if (!last) return;
      const S = last.S, len = S.length;
      let hi = last.thr + 8;
      for (let j = 0; j < len; j++) if (S[j] > hi) hi = S[j];
      const sc = (ph - 12 * dpr) / hi;
      for (let c = 0; c < pw; c++) {
        const j0 = Math.floor((c * len) / pw), j1 = Math.max(j0 + 1, Math.floor(((c + 1) * len) / pw));
        let v = 0;
        for (let j = j0; j < j1 && j < len; j++) if (S[j] > v) v = S[j];
        g.fillStyle = v >= last.thr ? '#6fd3ff' : '#2b5068';
        const h = v * sc;
        g.fillRect(A.x + c, bot - h, 1, h);
      }
      const ty = Math.round(bot - last.thr * sc) + 0.5;
      g.strokeStyle = '#ffcf5a';
      g.setLineDash([4 * dpr, 3 * dpr]);
      g.beginPath();
      g.moveTo(A.x, ty);
      g.lineTo(A.x + pw, ty);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ffcf5a';
      g.textBaseline = 'bottom';
      g.fillText(`しきい値 ${last.thr}`, A.x + 4 * dpr, ty - 2 * dpr);
      g.textBaseline = 'top';
      for (let k = 0; k < last.hits.length; k += 2) {
        const x = A.x + ((last.hits[k] + 0.5) / len) * pw;
        g.fillStyle = HIT[last.hits[k + 1]];
        g.beginPath();
        g.arc(x, top + 6 * dpr, 3.2 * dpr, 0, Math.PI * 2);
        g.fill();
      }
      // 色の見分け方
      const items = [[1, '割り切れた'], [2, '大きな素数が 1 つ残った'], [3, '同じ素数の式と組んだ']];
      let lx = A.x;
      const ly = bot + 4 * dpr;
      g.font = `${11 * dpr}px system-ui, sans-serif`;
      for (const [k, s] of items) {
        g.fillStyle = HIT[k];
        g.beginPath();
        g.arc(lx + 4 * dpr, ly + 6 * dpr, 3.2 * dpr, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#8b97ab';
        g.fillText(s, lx + 10 * dpr, ly);
        lx += g.measureText(s).width + 22 * dpr;
      }
      g.font = `${12 * dpr}px system-ui, sans-serif`;
    }
    function drawMatrix(g, B, dpr) {
      const st = view.st, mx = view.mx;
      const top = B.y + 18 * dpr, ph = Math.max(1, Math.floor(B.h - 18 * dpr)), pw = Math.max(1, Math.floor(B.w - 8 * dpr)), x0 = B.x + 6 * dpr;
      g.fillStyle = '#8b97ab';
      if (!st) { g.fillText('0 と 1 の表', B.x, B.y, B.w); return; }
      const cols = st.P.length, rows = mx ? mx.n : st.need;
      g.fillText(`0 と 1 の表（行: 式 ${fmtInt(rows)}、列: 素数 ${fmtInt(cols)}）`, B.x, B.y, B.w);
      const gw = Math.max(1, Math.min(cols, pw)), gh = Math.max(1, Math.min(rows, ph));
      if (off.width !== gw) off.width = gw;
      if (off.height !== gh) off.height = gh;
      const img = octx.createImageData(gw, gh), d = img.data;
      for (let o = 0; o < d.length; o += 4) { d[o] = 18; d[o + 1] = 24; d[o + 2] = 34; d[o + 3] = 255; }
      const put = (gx, gy, r, gg, b) => { const o = (gy * gw + gx) * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; };
      if (!mx) {
        const rels = st.full.concat(st.combined);
        for (let i = 0; i < rels.length && i < rows; i++) {
          const gy = Math.floor((i * gh) / rows), ex = rels[i].ex, pink = !!rels[i].pair;
          for (let k = 0; k < ex.length; k += 2) if (ex[k + 1] & 1) put(Math.floor((ex[k] * gw) / cols), gy, pink ? 255 : 111, pink ? 143 : 211, pink ? 200 : 255);
        }
      } else {
        for (let i = 0; i < mx.n; i++) {
          const gy = Math.floor((i * gh) / mx.n), o = i * mx.W, piv = mx.used[i];
          for (let w = 0; w < mx.wc; w++) {
            let v = mx.m[o + w];
            while (v) {
              const b = 31 - Math.clz32(v & -v);
              v &= v - 1;
              const j = w * 32 + b;
              if (j < cols) put(Math.floor((j * gw) / cols), gy, piv ? 70 : 111, piv ? 140 : 211, piv ? 165 : 255);
            }
          }
        }
        if (mx.col < cols) {
          const gx = Math.floor((mx.col * gw) / cols);
          for (let y = 0; y < gh; y++) put(gx, y, 255, 207, 90);
        }
      }
      octx.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(off, x0, top, pw, ph);
      // 全部 0 になった行（掛けると平方になる組）を左に緑、約数が出た組に使った式を右に桃色で示す
      if (mx && view.deps) {
        const rh = Math.max(1, ph / mx.n);
        g.fillStyle = '#7ee787';
        for (let i = 0; i < mx.n; i++) if (!mx.used[i]) g.fillRect(B.x, top + (i / mx.n) * ph, 4 * dpr, rh);
        if (view.idx) {
          g.fillStyle = '#ff8fc8';
          for (const i of view.idx) g.fillRect(x0 + pw + 1 * dpr, top + (i / mx.n) * ph, 3 * dpr, rh);
        }
      }
    }

    // ---- 段階ごとの数字 ----
    function showGather(st) {
      ui.prog.max = st.need;
      ui.prog.value = Math.min(st.need, qsCount(st));
      ui.s2.textContent = `式 ${fmtInt(qsCount(st))} / ${fmtInt(st.need)}（そのまま割り切れた ${fmtInt(st.full.length)}、大きな素数で組んだ ${fmtInt(st.combined.length)}）。多項式 ${fmtInt(st.polys)} 本、調べた x ${fmtInt(st.sieved)} 個、しきい値を越えた ${fmtInt(st.cand)} 個`;
    }
    function showElim(mx, deps) {
      ui.s3.textContent = `${fmtInt(mx.n)} 行 × ${fmtInt(mx.cols)} 列。${fmtInt(mx.col)} 列目まで消去、行どうしの XOR ${fmtInt(mx.xors)} 回`
        + (deps ? `。軸にならずに全部 0 になった行 ${deps.length} 本（どれも、掛けると平方になる式の組）` : '');
    }
    function line(text) {
      const el = document.createElement('div');
      el.textContent = text;
      ui.detail.append(el);
    }
    function showSquare(st, rels, idx, sq, tried, total) {
      const nComb = idx.filter((i) => rels[i].pair).length;
      ui.s4.textContent = `残った ${total} 本の行のうち ${tried} 本目で約数が出た`;
      ui.detail.replaceChildren();
      line(`選んだ式 ${idx.length} 本（そのうち大きな素数で組んだもの ${nComb} 本）を全部掛ける`);
      const one = rels[idx.find((i) => !rels[i].pair) ?? -1];
      if (one) line(`例の式: x = ${sgn(one.x)}、q = ${one.sq}、(a·x + b)² ≡ q² · Q(x) (mod N)、Q(x) = ${short(one.Q, 10)} = ${fmtEx(one.ex, st.P, 10)}`);
      const pair = rels[idx.find((i) => rels[i].pair) ?? -1];
      if (pair) line(`組んだ式の例: 大きな素数 ${fmtInt(pair.L)} が残った 2 つの式を掛けると、${fmtInt(pair.L)}² になる`);
      const ex = [];
      sq.cnt.forEach((e, i) => { if (e) ex.push(i, e); });
      line(`掛けた値の指数（すべて偶数）: ${fmtEx(ex, st.P, 12)}`);
      line(`X ≡ ${short(sq.X)}　Y ≡ ${short(sq.Y)}（mod N）`);
      line(`X² ≡ Y² (mod N) で X ≢ ±Y なので、gcd(X − Y, N) = ${sq.d}`);
    }
    function resetSteps() {
      ui.s1.textContent = '-';
      ui.s2.textContent = '-';
      ui.s3.textContent = '-';
      ui.s4.textContent = '-';
      ui.prog.value = 0;
      ui.detail.replaceChildren();
      ui.result.textContent = '';
      view = { st: null, rels: null, mx: null, deps: null, idx: null };
    }

    // ---- 二次ふるい法を、区切りながら動かす ----
    // ゆっくり見せた実行は待ち時間が入るので、記録しないように印を付ける
    let slowUsed = false;
    const isSlow = () => {
      const s = THUMB || ui.slow.checked;
      if (s) slowUsed = true;
      return s;
    };
    async function runQS(N, id) {
      const t0 = performance.now();
      slowUsed = false;
      const st = qsStart(N);
      if (st.factor) return { d: st.factor, st: null };
      view = { st, rels: null, mx: null, deps: null, idx: null };
      ui.s1.textContent = `N が平方剰余になる素数を小さい順に ${fmtInt(st.P.length - 1)} 個（最大 ${fmtInt(st.pmax)}）と、符号の −1。割り切れずに残った数が ${fmtInt(st.large)} 未満なら、大きな素数 1 つとして取っておく。ふるう幅は x = −${fmtInt(st.M)}〜${fmtInt(st.M)}`;
      ui.s3.textContent = '-';
      ui.s4.textContent = '-';
      async function gather() {
        let deadline = performance.now() + 30;
        while (!qsEnough(st)) {
          if (id !== runId) throw STOP;
          qsPoly(st);
          if (isSlow()) {
            showGather(st);
            drawBoard();
            await sleep(THUMB ? 45 : 35);
            deadline = performance.now() + 30;
          } else if (performance.now() >= deadline) {
            showGather(st);
            drawBoard();
            await yieldNow();
            deadline = performance.now() + 30;
          }
        }
        if (id !== runId) throw STOP;
        showGather(st);
      }
      await gather();
      const tSieve = performance.now() - t0;
      let tMat = 0, tried = 0;
      for (let round = 0; round < 4; round++) {
        const t1 = performance.now();
        const rels = qsRelations(st), mx = buildMatrix(rels, st.P.length);
        view.rels = rels;
        view.mx = mx;
        view.deps = null;
        view.idx = null;
        let deadline = performance.now() + 30;
        for (;;) {
          if (id !== runId) throw STOP;
          const step = isSlow() ? Math.max(2, Math.ceil(mx.cols / 40)) : 16;
          if (elimCols(mx, mx.col + step)) break;
          if (isSlow()) {
            showElim(mx);
            drawBoard();
            await sleep(30);
            deadline = performance.now() + 30;
          } else if (performance.now() >= deadline) {
            showElim(mx);
            drawBoard();
            await yieldNow();
            deadline = performance.now() + 30;
          }
        }
        const deps = dependencies(mx);
        view.deps = deps;
        tMat += performance.now() - t1;
        showElim(mx, deps);
        for (const idx of deps) {
          tried++;
          const sq = trySquare(st, rels, idx);
          if (sq.d > 1n && sq.d < N) {
            view.idx = idx;
            showSquare(st, rels, idx, sq, tried, deps.length);
            drawBoard();
            return { d: sq.d, st, tSieve, tMat, ms: performance.now() - t0, digits: String(N).length, slow: slowUsed };
          }
        }
        ui.s4.textContent = `${deps.length} 組とも X ≡ ±Y で、約数が出なかった。式を 20 本足して集め直す`;
        st.need += 20;
        await gather();
      }
      throw new Error('二次ふるい法で分けられなかった');
    }
    // N を全部の素数に分ける。小さな素数は割り算、14 桁未満は ρ 法、それより大きな合成数は二次ふるい法
    async function factorAll(N, id) {
      const t0 = performance.now(), primes = [], qsRuns = [];
      let rest = N;
      for (const p of primesUpTo(1000)) {
        const pb = BigInt(p);
        while (rest % pb === 0n) { primes.push(pb); rest /= pb; }
      }
      const stack = rest > 1n ? [rest] : [];
      while (stack.length) {
        const m = stack.pop();
        if (m === 1n) continue;
        if (isPrime(m)) { primes.push(m); continue; }
        const pp = perfectPower(m);
        if (pp) { for (let i = 0; i < pp.k; i++) stack.push(pp.r); continue; }
        if (m < 10n ** 14n) {
          let c = 1n, d = 0n;
          while (!d || d === m) {
            const rs = rhoStart(m, c++);
            d = 0n;
            while (!d) d = rhoSteps(rs, 100000);
          }
          stack.push(d, m / d);
          continue;
        }
        const r = await runQS(m, id);
        if (r.st) qsRuns.push(r);
        stack.push(r.d, m / r.d);
      }
      primes.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return { primes, qsRuns, ms: performance.now() - t0 };
    }
    function setN(N, note) {
      ui.nOut.textContent = String(N);
      ui.nInfo.textContent = `${String(N).length} 桁・${bitLen(N)} ビット${note ? '・' + note : ''}`;
    }
    async function start(N, note) {
      const id = ++runId;
      cmpId++;
      cur = { N, primes: null, qs: null };
      setN(N, note);
      resetSteps();
      ui.cmpBody.replaceChildren();
      ui.stop.disabled = false;
      ui.cmp.disabled = true;
      ui.status.textContent = '分解しています…';
      drawBoard();
      try {
        const out = await factorAll(N, id);
        if (id !== runId) return;
        cur.primes = out.primes;
        cur.qs = out.qsRuns[out.qsRuns.length - 1] || null;
        ui.result.textContent = out.primes.length > 1 ? `N = ${fmtFactors(out.primes)}` : 'N は素数';
        if (out.qsRuns.length) ui.status.textContent = `二次ふるい法で分解した（${fmtMs(out.ms)}）`;
        else if (out.primes.length === 1) ui.status.textContent = 'N は素数だった（ミラー–ラビン法の判定）。二次ふるい法は使っていない';
        else ui.status.textContent = `小さな素数の割り算・累乗の見分け・ρ 法だけで分解できた（${fmtMs(out.ms)}）。二次ふるい法は使っていない`;
        for (const r of out.qsRuns) if (!r.slow) addRecord(r);
        ui.cmp.disabled = out.primes.length < 2;
      } catch (e) {
        if (e === STOP) return;
        if (id === runId) ui.status.textContent = `止まった: ${e.message}`;
        throw e;
      } finally {
        if (id === runId) {
          ui.stop.disabled = true;
          drawBoard();
        }
      }
    }
    // 記録は桁数の順に並べ、それぞれ桁数が 1 段下の記録と比べる。多すぎたら古い記録から消す
    let recNo = 0;
    const fmtRatio = (x) => (x < 10 ? x.toFixed(1) : x < 1000 ? x.toFixed(0) : pow10(Math.log10(x)));
    function addRecord(r) {
      r.no = ++recNo;
      records.push(r);
      if (records.length > 16) records.splice(records.findIndex((a) => a.no === Math.min(...records.map((b) => b.no))), 1);
      records.sort((a, b) => a.digits - b.digits || a.no - b.no);
      const f = METHODS.find((m) => m.id === 'qs').f;
      ui.logBody.replaceChildren();
      records.forEach((a, i) => {
        let prev = null;
        for (let k = i - 1; k >= 0; k--) if (records[k].digits < a.digits) { prev = records[k]; break; }
        const grow = prev ? `×${fmtRatio(a.ms / Math.max(0.1, prev.ms))} / ×${fmtRatio(10 ** (f(a.digits) - f(prev.digits)))}` : '-';
        const cells = [a.digits, fmtMs(a.ms), `${fmtMs(a.tSieve)} / ${fmtMs(a.tMat)}`, fmtInt(a.st.polys), fmtInt(qsCount(a.st)), grow];
        const tr = document.createElement('tr');
        cells.forEach((c, j) => {
          const td = document.createElement('td');
          td.textContent = c;
          if (j < 5) td.className = 'n';
          tr.append(td);
        });
        ui.logBody.append(tr);
      });
    }

    // ---- 割り算と ρ 法で 2 秒ずつ試す ----
    function cmpRow(name) {
      const tr = document.createElement('tr');
      const cells = [name, '試しています…', '-', '-'].map((s, i) => {
        const td = document.createElement('td');
        td.textContent = s;
        if (i === 2) td.className = 'n';
        tr.append(td);
        return td;
      });
      ui.cmpBody.append(tr);
      return cells;
    }
    async function compare() {
      if (!cur || !cur.primes || cur.primes.length < 2) return;
      const id = ++cmpId, N = cur.N, p = cur.primes[0], lp = Math.log10(Number(p));
      ui.cmp.disabled = true;
      ui.cmpBody.replaceChildren();
      const LIMIT = 2000;
      // 割り算: 3, 5, 7, … と奇数で順に割る。小さいほうの素数 p まで試せば見つかる
      const a = cmpRow('割り算（3, 5, 7, … と順に）'), td = tdStart(N);
      let t0 = performance.now(), found = 0n;
      while (performance.now() - t0 < LIMIT && !found && td.d <= 5e8) {
        found = tdSteps(td, 20000);
        if (id !== cmpId) return;
        await yieldNow();
      }
      let el = Math.max(1e-3, (performance.now() - t0) / 1000);
      const tdRate = td.tried / el;
      a[1].textContent = found ? `見つかった: ${found}` : `見つからない（${fmtInt(td.d)} まで）`;
      a[2].textContent = fmtInt(td.tried);
      a[3].textContent = found ? `${fmtMs(el * 1000)}（実際）` : `${fmtDurLog(lp - Math.log10(2) - Math.log10(tdRate))}（1 秒に ${pow10(Math.log10(tdRate))} 回で p まで）`;
      // ρ 法: 平均でおよそ √p 回で見つかる
      const b = cmpRow('ポラードの ρ 法'), rs = rhoStart(N);
      t0 = performance.now();
      found = 0n;
      while (performance.now() - t0 < LIMIT && !found) {
        found = rhoSteps(rs, 4000);
        if (id !== cmpId) return;
        await yieldNow();
      }
      el = Math.max(1e-3, (performance.now() - t0) / 1000);
      const rhoRate = rs.steps / el;
      b[1].textContent = found && found !== N ? `見つかった: ${found}` : '見つからない';
      b[2].textContent = fmtInt(rs.steps);
      b[3].textContent = found && found !== N ? `${fmtMs(el * 1000)}（実際）` : `${fmtDurLog(lp / 2 - Math.log10(rhoRate))}（1 秒に ${pow10(Math.log10(rhoRate))} 回で √p 回）`;
      if (cur.qs) {
        const c = cmpRow('二次ふるい法（上で動かした結果）');
        c[1].textContent = `見つかった: ${cur.qs.d}`;
        c[2].textContent = `多項式 ${fmtInt(cur.qs.st.polys)} 本`;
        c[3].textContent = `${fmtMs(cur.qs.ms)}（実際）`;
      }
      ui.cmp.disabled = false;
    }

    // ---- 計算量の式の図と表 ----
    const chart = $('chart'), cctx = chart.getContext('2d'), range = $('dg'), dgOut = $('dgOut'), lBody = $('lBody');
    const CC = { td: '#8b97ab', rho: '#c792ea', qs: '#6fd3ff', nfs: '#7ee787', paper: '#ffcf5a' };
    const XMIN = 10, XMAX = 700, YMAX = 80;
    function drawChart() {
      const dpr = fit(chart), W = chart.width, H = chart.height, g = cctx;
      g.fillStyle = '#0a0d12';
      g.fillRect(0, 0, W, H);
      if (W < 80 || H < 80) return;
      const L = 46 * dpr, R = 12 * dpr, T = 30 * dpr, B = 26 * dpr, pw = W - L - R, ph = H - T - B;
      const X = (d) => L + ((d - XMIN) / (XMAX - XMIN)) * pw, Y = (k) => T + ph - (k / YMAX) * ph;
      g.font = `${11 * dpr}px system-ui, sans-serif`;
      g.lineWidth = 1;
      g.textBaseline = 'middle';
      for (let k = 0; k <= YMAX; k += 20) {
        g.strokeStyle = '#1e2633';
        g.beginPath(); g.moveTo(L, Math.round(Y(k)) + 0.5); g.lineTo(L + pw, Math.round(Y(k)) + 0.5); g.stroke();
        g.fillStyle = '#8b97ab';
        g.textAlign = 'right';
        g.fillText(`10${sup(k)}`, L - 6 * dpr, Y(k));
      }
      g.textBaseline = 'top';
      g.textAlign = 'center';
      for (let d = 100; d <= XMAX; d += 100) {
        g.strokeStyle = '#1e2633';
        g.beginPath(); g.moveTo(Math.round(X(d)) + 0.5, T); g.lineTo(Math.round(X(d)) + 0.5, T + ph); g.stroke();
        g.fillStyle = '#8b97ab';
        // 右の端の目盛りは、はみ出さないように右に揃える
        g.textAlign = d === XMAX ? 'right' : 'center';
        g.fillText(`${d} 桁`, X(d), T + ph + 6 * dpr);
      }
      g.textAlign = 'center';
      g.textAlign = 'left';
      g.fillStyle = '#ffcf5a';
      g.fillText(`論文の上限 L[1/3, 105] は、この図の上の外（10 桁で ${pow10(METHODS[4].f(10))}）`, L, 8 * dpr, pw);
      g.save();
      g.beginPath();
      g.rect(L, T, pw, ph);
      g.clip();
      for (const m of METHODS) {
        if (m.id === 'paper') continue;
        g.strokeStyle = CC[m.id];
        g.lineWidth = 2 * dpr;
        g.beginPath();
        for (let px = 0; px <= pw; px += 2 * dpr) {
          const d = XMIN + (px / pw) * (XMAX - XMIN), y = Y(m.f(d));
          if (px === 0) g.moveTo(L + px, y); else g.lineTo(L + px, y);
        }
        g.stroke();
      }
      const dv = Number(range.value);
      g.strokeStyle = '#d9e1ee';
      g.lineWidth = 1;
      g.setLineDash([3 * dpr, 3 * dpr]);
      g.beginPath(); g.moveTo(X(dv), T); g.lineTo(X(dv), T + ph); g.stroke();
      g.setLineDash([]);
      for (const m of METHODS) {
        const k = m.f(dv);
        if (k > YMAX) continue;
        g.fillStyle = CC[m.id];
        g.beginPath(); g.arc(X(dv), Y(k), 3.5 * dpr, 0, Math.PI * 2); g.fill();
      }
      g.restore();
      // 線の名前: 図の上へ出る線は出る所に、出ない線は右の端に書く
      g.font = `${11 * dpr}px system-ui, sans-serif`;
      g.textBaseline = 'bottom';
      const NAMES = { td: '割り算 √N', rho: 'ρ 法 N^¼', qs: '二次ふるい法', nfs: '数体ふるい法' };
      for (const m of METHODS) {
        if (m.id === 'paper') continue;
        const out = m.f(XMAX) > YMAX;
        let d = XMAX;
        if (out) { let lo = XMIN, hi = XMAX; for (let i = 0; i < 40; i++) { const md = (lo + hi) / 2; if (m.f(md) > YMAX) hi = md; else lo = md; } d = lo; }
        g.fillStyle = CC[m.id];
        g.textAlign = out ? 'left' : 'right';
        g.fillText(NAMES[m.id], out ? X(d) + 6 * dpr : X(d) - 2 * dpr, out ? T + 14 * dpr : Y(m.f(d)) - 4 * dpr);
      }
    }
    function fillTable() {
      const dv = Number(range.value);
      dgOut.textContent = dv;
      lBody.replaceChildren();
      for (const m of METHODS) {
        const k = m.f(dv), tr = document.createElement('tr');
        const name = document.createElement('td'), sw = document.createElement('span');
        sw.className = 'sw';
        sw.style.background = CC[m.id];
        name.append(sw, m.name);
        const v = document.createElement('td'), t = document.createElement('td');
        v.className = 'n';
        t.className = 'n';
        v.textContent = pow10(k);
        t.textContent = fmtDurLog(k - 9);
        tr.append(name, v, t);
        lBody.append(tr);
      }
    }
    function fillCross() {
      const f = Object.fromEntries(METHODS.map((m) => [m.id, m.f]));
      const a = crossDigits(f.paper, f.td), b = crossDigits(f.paper, f.qs), c = crossDigits(f.nfs, f.qs), e = crossDigits(f.qs, f.rho);
      $('cross').textContent = `式の値が入れ替わる桁数（小さな項を省いた式なので目安）: 二次ふるい法の式が ρ 法の N^¼ より小さくなるのは約 ${Math.round(e)} 桁から、数体ふるい法の式が二次ふるい法の式より小さくなるのは約 ${Math.round(c)} 桁から。論文の上限 L[1/3, 105] が割り算の √N より小さくなるのは約 ${fmtInt(Math.round(a / 100) * 100)} 桁から、二次ふるい法の式より小さくなるのは約 ${pow10(Math.log10(b))} 桁から。数体ふるい法の式とは、同じ 1/3 の形で定数が 105 と 1.923 なので、桁数が増えるほど差が開き、入れ替わらない。`;
    }
    range.addEventListener('input', () => { fillTable(); drawChart(); });

    // ---- 操作 ----
    for (const b of document.querySelectorAll('.dg')) {
      b.addEventListener('click', () => {
        const d = Number(b.dataset.d), s = semiprime(d, rand);
        for (const o of document.querySelectorAll('.dg')) o.setAttribute('aria-pressed', String(o === b));
        ui.nIn.value = String(s.N);
        start(s.N, `${String(s.p).length} 桁と ${String(s.q).length} 桁の素数の積`);
      });
    }
    ui.go.addEventListener('click', () => {
      const raw = ui.nIn.value.replace(/[\s,_]/g, '');
      if (!/^\d+$/.test(raw)) { ui.status.textContent = '0〜9 の数字だけで入れてください'; return; }
      const N = BigInt(raw);
      if (N < 2n) { ui.status.textContent = '2 以上の数を入れてください'; return; }
      if (raw.replace(/^0+/, '').length > 50) { ui.status.textContent = '時間がかかりすぎるので、50 桁までにしています'; return; }
      for (const o of document.querySelectorAll('.dg')) o.setAttribute('aria-pressed', 'false');
      start(N, '入れた数');
    });
    ui.nIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') ui.go.click(); });
    ui.stop.addEventListener('click', () => {
      runId++;
      ui.stop.disabled = true;
      ui.status.textContent = '止めました';
    });
    ui.cmp.addEventListener('click', () => { compare(); });
    new ResizeObserver(() => { drawBoard(); drawChart(); }).observe(document.body);

    fillTable();
    fillCross();
    drawBoard();
    drawChart();
    if (THUMB) {
      (async () => {
        for (;;) {
          const s = semiprime(24, rand);
          await start(s.N);
          await sleep(2500);
        }
      })();
    } else {
      const first = document.querySelector('.dg[data-d="32"]');
      const s = semiprime(32, rand);
      first.setAttribute('aria-pressed', 'true');
      ui.nIn.value = String(s.N);
      start(s.N, `${String(s.p).length} 桁と ${String(s.q).length} 桁の素数の積`);
    }
  },
});
