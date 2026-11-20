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
