/* ゲーム（どれもジャンルとして一般的な遊びを、独自の見た目で作ったもの） */
dekiru.add({
  id: 'gm-brick', c: 'game', lv: 2,
  t: 'ブロック崩し', y: 'ぶろっくくずし',
  tags: ['canvas', '衝突判定', 'マウス', 'アクション'],
  d: '板で玉を打ち返し、上に並んだブロックを全部壊す。マウス・指・左右キーで板を動かす。玉が板のどこに当たったかで跳ね返る角度が変わる。',
  html: `<canvas id="c" width="480" height="360"></canvas><p id="s"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #101422; color: #cde; touch-action: none; } canvas { width: min(94vw, 600px); border-radius: 10px; background: #0b0f1a; cursor: none; } p { margin: 4px; font: 14px ui-monospace, monospace; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), W = 480, H = 360;
    let pad, ball, bricks, score, lives, keys = {};
    function reset() {
      pad = { x: W / 2, w: 80 }; ball = { x: W / 2, y: H - 60, vx: 3, vy: -3.5, r: 6 }; score = 0; lives = 3;
      bricks = []; for (let r = 0; r < 6; r++) for (let k = 0; k < 10; k++) bricks.push({ x: 8 + k * 47, y: 30 + r * 20, w: 42, h: 14, h2: r * 40 });
    }
    reset();
    c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); pad.x = ((e.clientX - r.left) / r.width) * W; });
    addEventListener('keydown', (e) => { keys[e.key] = true; }); addEventListener('keyup', (e) => { keys[e.key] = false; });
    (function loop() {
      if (keys.ArrowLeft) pad.x -= 7; if (keys.ArrowRight) pad.x += 7;
      if (window.THUMB) pad.x += (ball.x - pad.x) * 0.2;
      pad.x = Math.max(pad.w / 2, Math.min(W - pad.w / 2, pad.x));
      ball.x += ball.vx; ball.y += ball.vy;
      if (ball.x < ball.r || ball.x > W - ball.r) ball.vx *= -1;
      if (ball.y < ball.r) ball.vy *= -1;
      if (ball.y > H - 24 && ball.y < H - 12 && Math.abs(ball.x - pad.x) < pad.w / 2 + ball.r && ball.vy > 0) {
        const k = (ball.x - pad.x) / (pad.w / 2), sp = Math.hypot(ball.vx, ball.vy) * 1.01;
        ball.vx = sp * Math.sin(k * 1.05); ball.vy = -sp * Math.cos(k * 1.05);
      }
      if (ball.y > H + 10) { lives--; Object.assign(ball, { x: pad.x, y: H - 60, vx: 3, vy: -3.5 }); if (lives < 0) reset(); }
      for (const b of bricks) {
        if (b.dead) continue;
        if (ball.x > b.x - ball.r && ball.x < b.x + b.w + ball.r && ball.y > b.y - ball.r && ball.y < b.y + b.h + ball.r) {
          b.dead = true; score += 10;
          const fromSide = ball.x < b.x || ball.x > b.x + b.w;
          if (fromSide) ball.vx *= -1; else ball.vy *= -1;
          break;
        }
      }
      if (bricks.every((b) => b.dead)) reset();
      x.clearRect(0, 0, W, H);
      for (const b of bricks) if (!b.dead) { x.fillStyle = `hsl(${b.h2} 75% 58%)`; x.fillRect(b.x, b.y, b.w, b.h); }
      x.fillStyle = '#e8f0ff'; x.fillRect(pad.x - pad.w / 2, H - 20, pad.w, 8);
      x.fillStyle = '#ffd166'; x.beginPath(); x.arc(ball.x, ball.y, ball.r, 0, 7); x.fill();
      document.getElementById('s').textContent = `得点 ${score} ・ 残り ${Math.max(0, lives)}`;
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'gm-snake', c: 'game', lv: 2,
  t: 'のびるヘビ', y: 'のびるへび',
  tags: ['canvas', 'キーボード操作', 'スワイプ', 'グリッド'],
  d: '矢印キーか WASD、またはスワイプでヘビの向きを変え、えさを食べるたびに体が1マス伸びる。自分の体に当たるとやり直し。',
  html: `<canvas id="c" width="400" height="300"></canvas><p id="s">矢印キー / WASD / スワイプ</p>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #1d2a1f; color: #cfe8d4; touch-action: none; } canvas { width: min(94vw, 560px); image-rendering: pixelated; border-radius: 8px; background: #a8c98f; } p { margin: 6px; font: 13px ui-monospace, monospace; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), S = 20, CW = 20, CH = 15;
    let snake, dir, next, food, score, best = 0;
    const reset = () => { snake = [[10, 7], [9, 7], [8, 7]]; dir = next = [1, 0]; score = 0; place(); };
    const place = () => { do { food = [Math.floor(Math.random() * CW), Math.floor(Math.random() * CH)]; } while (snake.some(([a, b]) => a === food[0] && b === food[1])); };
    reset();
    const turn = (d) => { if (d[0] !== -dir[0] || d[1] !== -dir[1]) next = d; };
    addEventListener('keydown', (e) => { const d = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[e.key]; if (d) { e.preventDefault(); turn(d); } });
    let sx, sy;
    c.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
    c.addEventListener('pointerup', (e) => { const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 20) turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]); });
    setInterval(() => {
      if (window.THUMB) { const h = snake[0], opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter((d) => !(d[0] === -dir[0] && d[1] === -dir[1]) && !snake.some(([a, b]) => a === (h[0] + d[0] + CW) % CW && b === (h[1] + d[1] + CH) % CH)); opts.sort((p, q) => Math.hypot(h[0] + p[0] - food[0], h[1] + p[1] - food[1]) - Math.hypot(h[0] + q[0] - food[0], h[1] + q[1] - food[1])); if (opts[0]) next = opts[0]; }
      dir = next;
      const head = [(snake[0][0] + dir[0] + CW) % CW, (snake[0][1] + dir[1] + CH) % CH];
      if (snake.some(([a, b]) => a === head[0] && b === head[1])) { best = Math.max(best, score); reset(); return; }
      snake.unshift(head);
      if (head[0] === food[0] && head[1] === food[1]) { score++; place(); } else snake.pop();
      x.fillStyle = '#a8c98f'; x.fillRect(0, 0, 400, 300);
      x.fillStyle = '#c0392b'; x.beginPath(); x.arc(food[0] * S + 10, food[1] * S + 10, 8, 0, 7); x.fill();
      snake.forEach(([a, b], i) => { x.fillStyle = i ? '#2d4a2f' : '#1a2e1c'; x.fillRect(a * S + 1, b * S + 1, S - 2, S - 2); });
      document.getElementById('s').textContent = `長さ ${snake.length} ・ 最高 ${Math.max(best, score) + 3}`;
    }, 110);
  },
}, {
  id: 'gm-memory', c: 'game', lv: 2,
  t: '神経衰弱', y: 'しんけいすいじゃく',
  tags: ['カード', '3D変形', '記憶', 'ペア'],
  d: '伏せた16枚の札から2枚ずつめくり、同じ字の組をそろえる。札は CSS の3D回転で裏返る。何手でそろえたかを数える。',
  html: `<div class="board" id="b"></div><p id="s"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #2c3e2f; color: #eee; } .board { display: grid; grid-template-columns: repeat(4, min(18vmin, 90px)); gap: 8px; perspective: 800px; } .card { aspect-ratio: 3 / 4; position: relative; border: 0; padding: 0; background: none; transform-style: preserve-3d; transition: transform .4s; } .card.open, .card.done { transform: rotateY(180deg); } .card span { position: absolute; inset: 0; border-radius: 8px; backface-visibility: hidden; display: grid; place-items: center; } .back { background: repeating-linear-gradient(45deg, #8a2a14 0 6px, #a8361c 0 12px); } .face { background: #fffaf0; transform: rotateY(180deg); font: 800 min(9vmin, 44px) serif; color: #26407c; } .done .face { background: #e7f6d7; } p { font-size: 14px; }`,
  js() {
    const b = document.getElementById('b');
    let first = null, lock = false, moves = 0, done = 0;
    function deal() {
      b.innerHTML = ''; moves = 0; done = 0;
      const chars = [...'花鳥風月雪山海空'], deck = [...chars, ...chars].sort(() => Math.random() - 0.5);
      deck.forEach((ch) => { const card = document.createElement('button'); card.className = 'card'; card.dataset.v = ch; card.setAttribute('aria-label', '伏せた札'); card.innerHTML = `<span class="back"></span><span class="face">${ch}</span>`; card.onclick = () => flip(card); b.append(card); });
      show();
    }
    const show = () => { document.getElementById('s').textContent = done === 8 ? `${moves} 手でそろいました！` : `${moves} 手`; };
    function flip(card) {
      if (lock || card === first || card.classList.contains('done')) return;
      card.classList.add('open'); card.setAttribute('aria-label', card.dataset.v);
      if (!first) { first = card; return; }
      moves++;
      if (first.dataset.v === card.dataset.v) { first.classList.add('done'); card.classList.add('done'); first = null; done++; show(); if (done === 8) setTimeout(deal, 2500); return; }
      lock = true;
      setTimeout(() => { first.classList.remove('open'); card.classList.remove('open'); first.setAttribute('aria-label', '伏せた札'); card.setAttribute('aria-label', '伏せた札'); first = null; lock = false; show(); }, 700);
    }
    deal();
    if (window.THUMB) setInterval(() => { const cs = [...b.querySelectorAll('.card:not(.done)')]; if (cs.length) flip(cs[Math.floor(Math.random() * cs.length)]); }, 450);
  },
}, {
  id: 'gm-15puzzle', c: 'game', lv: 2,
  t: '15パズル', y: 'じゅうごぱずる',
  tags: ['パズル', 'スライド', 'transform', '並べ替え'],
  d: '空いたマスの隣の札を押すと、札が空きへ滑る。1〜15を順に並べたら完成。混ぜるときは「正しい手」を何百回も打つので、必ず解ける並びになる。',
  html: `<div class="board" id="b"></div><p><button id="mix">混ぜる</button> <span id="s"></span></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #f0e6d2; } .board { position: relative; width: min(80vmin, 360px); aspect-ratio: 1; background: #6b4f3a; border-radius: 12px; } .tile { position: absolute; width: 25%; height: 25%; padding: 4px; border: 0; background: none; transition: transform .15s; } .tile span { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 8px; background: linear-gradient(#fff8e6, #e9d7b3); font: 800 min(7vmin, 32px) serif; color: #4a3424; box-shadow: inset 0 -3px 0 #c7ad7e; } .tile.ok span { color: #2f855a; }`,
  js() {
    const b = document.getElementById('b');
    let pos = [...Array(16).keys()], moves = 0;
    const tiles = [];
    for (let n = 1; n <= 15; n++) { const t = document.createElement('button'); t.className = 'tile'; t.innerHTML = `<span>${n}</span>`; t.onclick = () => move(n); b.append(t); tiles[n] = t; }
    function draw() {
      for (let n = 1; n <= 15; n++) { const p = pos.indexOf(n); tiles[n].style.transform = `translate(${(p % 4) * 100}%, ${Math.floor(p / 4) * 100}%)`; tiles[n].classList.toggle('ok', p === n - 1); }
      const solved = pos.every((v, i) => v === (i + 1) % 16);
      document.getElementById('s').textContent = solved ? `完成！（${moves} 手）` : `${moves} 手`;
    }
    function move(n, quiet) {
      const p = pos.indexOf(n), e = pos.indexOf(0);
      if (Math.abs((p % 4) - (e % 4)) + Math.abs(Math.floor(p / 4) - Math.floor(e / 4)) !== 1) return false;
      [pos[p], pos[e]] = [pos[e], pos[p]];
      if (!quiet) { moves++; draw(); }
      return true;
    }
    function mix() { pos = [...Array(15).keys()].map((i) => i + 1).concat(0); for (let k = 0; k < 400; k++) { const e = pos.indexOf(0), nb = [e - 4, e + 4, e % 4 ? e - 1 : -1, e % 4 < 3 ? e + 1 : -1].filter((i) => i >= 0 && i < 16); move(pos[nb[Math.floor(Math.random() * nb.length)]], true); } moves = 0; draw(); }
    document.getElementById('mix').onclick = mix;
    mix();
    if (window.THUMB) setInterval(() => { const e = pos.indexOf(0), nb = [e - 4, e + 4, e % 4 ? e - 1 : -1, e % 4 < 3 ? e + 1 : -1].filter((i) => i >= 0 && i < 16); move(pos[nb[Math.floor(Math.random() * nb.length)]]); }, 300);
  },
}, {
  id: 'gm-reversi', c: 'game', lv: 3,
  t: 'リバーシ（対コンピューター）', y: 'りばーしたいこんぴゅーたー',
  tags: ['ボードゲーム', 'AI', '盤面評価', '8方向'],
  d: '相手の石を自分の石ではさむと裏返る。あなたは黒、コンピューターは白。コンピューターは「何枚返せるか」と「盤のどこが有利か」の点数表で次の手を選ぶ。',
  p: '四隅は取られると返されないので高い点、隅の隣は隅を取られやすいので低い点にしてある。',
  html: `<div class="board" id="b"></div><p id="s"></p><button id="re">最初から</button>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 6px; background: #20302a; color: #eee; } .board { display: grid; grid-template-columns: repeat(8, min(10vmin, 50px)); gap: 2px; padding: 4px; background: #143d22; border-radius: 6px; } .board button { aspect-ratio: 1; border: 0; padding: 0; background: #2e8b4a; display: grid; place-items: center; } .board button.can::after { content: ""; width: 24%; aspect-ratio: 1; border-radius: 50%; background: #0003; } .board i { width: 82%; aspect-ratio: 1; border-radius: 50%; box-shadow: 0 2px 2px #0006; transition: background .25s; } .b { background: #111; } .w { background: #f4f4f4; } p { margin: 0; font-size: 14px; }`,
  js() {
    const B = document.getElementById('b'), W8 = [[100, -20, 10, 5, 5, 10, -20, 100], [-20, -50, -2, -2, -2, -2, -50, -20], [10, -2, -1, -1, -1, -1, -2, 10], [5, -2, -1, -1, -1, -1, -2, 5]];
    const weight = (r, c) => W8[r < 4 ? r : 7 - r][c];
    const D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    let g, turn, busy = false;
    function flips(r, c, who) {
      if (g[r][c]) return [];
      const out = [];
      for (const [dr, dc] of D) { const line = []; let y = r + dr, x = c + dc; while (y >= 0 && y < 8 && x >= 0 && x < 8 && g[y][x] === -who) { line.push([y, x]); y += dr; x += dc; } if (line.length && y >= 0 && y < 8 && x >= 0 && x < 8 && g[y][x] === who) out.push(...line); }
      return out;
    }
    const moves = (who) => { const m = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const f = flips(r, c, who); if (f.length) m.push([r, c, f]); } return m; };
    function put(r, c, who) { for (const [y, x] of flips(r, c, who)) g[y][x] = who; g[r][c] = who; }
    function draw() {
      const legal = turn === 1 && !window.THUMB ? moves(1) : [];
      B.innerHTML = '';
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const b = document.createElement('button'); const v = g[r][c];
        b.setAttribute('aria-label', `${r + 1}行${c + 1}列 ${v === 1 ? '黒' : v === -1 ? '白' : '空き'}`);
        if (v) b.innerHTML = `<i class="${v === 1 ? 'b' : 'w'}"></i>`;
        if (legal.some(([y, x]) => y === r && x === c)) { b.classList.add('can'); b.onclick = () => play(r, c); }
        B.append(b);
      }
      const n = (w) => g.flat().filter((v) => v === w).length;
      document.getElementById('s').textContent = `黒 ${n(1)} ・ 白 ${n(-1)} ・ ${turn === 1 ? 'あなたの番' : 'コンピューターの番'}`;
    }
    function ai(who) {
      const m = moves(who);
      if (!m.length) return false;
      m.sort((a, b) => (weight(b[0], b[1]) + b[2].length * 2) - (weight(a[0], a[1]) + a[2].length * 2) || Math.random() - 0.5);
      put(m[0][0], m[0][1], who);
      return true;
    }
    function next() {
      if (!moves(1).length && !moves(-1).length) { draw(); const n = (w) => g.flat().filter((v) => v === w).length; document.getElementById('s').textContent += n(1) > n(-1) ? ' ・ あなたの勝ち！' : n(1) < n(-1) ? ' ・ コンピューターの勝ち' : ' ・ 引き分け'; if (window.THUMB) setTimeout(reset, 1500); return; }
      if (!moves(turn).length) turn = -turn;
      draw();
      if (turn === -1 || window.THUMB) { busy = true; setTimeout(() => { ai(turn); turn = -turn; busy = false; next(); }, window.THUMB ? 250 : 500); }
    }
    function play(r, c) { if (busy || turn !== 1) return; put(r, c, 1); turn = -1; next(); }
    function reset() { g = Array.from({ length: 8 }, () => Array(8).fill(0)); g[3][3] = g[4][4] = -1; g[3][4] = g[4][3] = 1; turn = 1; next(); }
    document.getElementById('re').onclick = reset;
    reset();
  },
}, {
  id: 'gm-tictactoe', c: 'game', lv: 3,
  t: '三目並べ（負けないAI）', y: 'さんもくならべまけないえーあい',
  tags: ['ミニマックス法', 'AI', '探索', 'ボードゲーム'],
  d: 'コンピューターは、この先に起こりうる全部の手を最後まで読み、相手が最善を尽くしたときに一番よい手を選ぶ（ミニマックス法）。何度やっても負けない。',
  p: '盤が9マスしかないので、全部の展開を読んでも一瞬で終わる。将棋や囲碁ではこれが不可能になる。',
  html: `<div class="b" id="b"></div><p id="s"></p><button id="re">もう一回</button>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #fdf6e3; } .b { display: grid; grid-template-columns: repeat(3, min(22vmin, 100px)); gap: 6px; } .b button { aspect-ratio: 1; border: 0; border-radius: 12px; background: #fff; box-shadow: 0 2px 6px #0002; font: 900 min(14vmin, 64px)/1 sans-serif; } .x { color: #26407c; } .o { color: #c23b22; } .win { background: #ffe9a8 !important; } p { margin: 0; font-weight: 700; }`,
  js() {
    const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    let g, over;
    const win = (s) => L.find((l) => l.every((i) => g[i] === s));
    function minimax(s, depth) {
      if (win('o')) return 10 - depth; if (win('x')) return depth - 10; if (g.every(Boolean)) return 0;
      let best = s === 'o' ? -99 : 99;
      for (let i = 0; i < 9; i++) if (!g[i]) { g[i] = s; const v = minimax(s === 'o' ? 'x' : 'o', depth + 1); g[i] = null; best = s === 'o' ? Math.max(best, v) : Math.min(best, v); }
      return best;
    }
    function aiMove(s) {
      let best = -99, idx = -1;
      for (let i = 0; i < 9; i++) if (!g[i]) { g[i] = s; let v = minimax(s === 'o' ? 'x' : 'o', 1); if (s === 'x') v = -v; g[i] = null; if (v > best || (v === best && Math.random() < 0.3)) { best = v; idx = i; } }
      return idx;
    }
    function draw(msg) {
      const b = document.getElementById('b'); b.innerHTML = '';
      const w = win('x') || win('o');
      g.forEach((v, i) => { const btn = document.createElement('button'); btn.textContent = v === 'x' ? '×' : v === 'o' ? '○' : ''; btn.className = (v || '') + (w && w.includes(i) ? ' win' : ''); btn.setAttribute('aria-label', `${i + 1}番 ${v === 'x' ? 'バツ' : v === 'o' ? 'マル' : '空き'}`); btn.onclick = () => play(i); b.append(btn); });
      document.getElementById('s').textContent = msg;
    }
    function check() { if (win('x')) return 'あなたの勝ち（めったにないこと）'; if (win('o')) return 'コンピューターの勝ち'; if (g.every(Boolean)) return '引き分け'; return ''; }
    function play(i) {
      if (over || g[i]) return;
      g[i] = 'x'; let m = check();
      if (!m) { g[aiMove('o')] = 'o'; m = check(); }
      over = !!m; draw(m || 'あなたの番（×）');
    }
    function reset() { g = Array(9).fill(null); over = false; draw('あなたの番（×）'); }
    document.getElementById('re').onclick = reset;
    reset();
    if (window.THUMB) setInterval(() => { if (over) { reset(); return; } play(aiMove('x')); }, 700);
  },
}, {
  id: 'gm-minesweeper', c: 'game', lv: 2,
  t: '地雷探し', y: 'じらいさがし',
  tags: ['パズル', '塗りつぶし', '右クリック', '長押し'],
  d: 'マスを開けると、周りの8マスにある地雷の数が出る。数字を手がかりに、地雷以外を全部開ける。右クリックか長押しで旗を立てられる。最初の1マスは必ず安全。',
  html: `<p id="s"></p><div class="b" id="b"></div><button id="re">やり直す</button>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 6px; background: #d9dee6; user-select: none; } .b { display: grid; grid-template-columns: repeat(9, min(9vmin, 36px)); gap: 2px; } .b button { aspect-ratio: 1; padding: 0; border: 0; border-radius: 4px; background: linear-gradient(#a8b4c8, #8a98b0); font: 800 min(5vmin, 18px) sans-serif; } .b button.open { background: #f1f3f6; } .n1 { color: #2b6cb0; } .n2 { color: #2f855a; } .n3 { color: #c53030; } .n4 { color: #553c9a; } .n5 { color: #9c4221; } .boom { background: #e53e3e !important; } p { margin: 0; font-weight: 700; }`,
  js() {
    const N = 9, M = 10, b = document.getElementById('b');
    let mines, open, flag, started, over;
    const nb = (i) => { const r = Math.floor(i / N), c = i % N, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const y = r + dr, x = c + dc; if ((dr || dc) && y >= 0 && y < N && x >= 0 && x < N) out.push(y * N + x); } return out; };
    const count = (i) => nb(i).filter((j) => mines.has(j)).length;
    function reset() { mines = new Set(); open = new Set(); flag = new Set(); started = false; over = false; draw('地雷は10個'); }
    function lay(safe) { while (mines.size < M) { const i = Math.floor(Math.random() * N * N); if (i !== safe && !nb(safe).includes(i)) mines.add(i); } }
    function reveal(i) {
      if (open.has(i) || flag.has(i)) return;
      open.add(i);
      if (!mines.has(i) && count(i) === 0) nb(i).forEach(reveal);
    }
    function click(i) {
      if (over || flag.has(i)) return;
      if (!started) { lay(i); started = true; }
      if (mines.has(i)) { over = true; mines.forEach((m) => open.add(m)); draw('ドカン！ もう一度どうぞ', i); return; }
      reveal(i);
      if (open.size === N * N - M) { over = true; draw('全部見つけました！'); return; }
      draw(`残りの旗 ${M - flag.size}`);
    }
    function toggleFlag(i) { if (over || open.has(i)) return; if (flag.has(i)) flag.delete(i); else flag.add(i); draw(`残りの旗 ${M - flag.size}`); }
    function draw(msg, boom) {
      b.innerHTML = '';
      for (let i = 0; i < N * N; i++) {
        const btn = document.createElement('button');
        if (open.has(i)) { btn.className = 'open'; if (mines.has(i)) { btn.textContent = '●'; if (i === boom) btn.classList.add('boom'); } else { const n = count(i); if (n) { btn.textContent = n; btn.classList.add('n' + n); } } }
        else if (flag.has(i)) btn.textContent = '⚑';
        btn.setAttribute('aria-label', `${Math.floor(i / N) + 1}行${(i % N) + 1}列`);
        btn.onclick = () => click(i);
        btn.oncontextmenu = (e) => { e.preventDefault(); toggleFlag(i); };
        let t; btn.onpointerdown = (e) => { if (e.pointerType === 'touch') t = setTimeout(() => { toggleFlag(i); t = 'done'; }, 450); }; btn.onpointerup = () => clearTimeout(t);
        b.append(btn);
      }
      document.getElementById('s').textContent = msg;
    }
    document.getElementById('re').onclick = reset;
    reset();
    if (window.THUMB) setInterval(() => { if (over) { reset(); return; } const c = [...Array(N * N).keys()].filter((i) => !open.has(i) && (!started || !mines.has(i))); click(c[Math.floor(Math.random() * c.length)]); }, 600);
  },
}, {
  id: 'gm-balloon-flyer', c: 'game', lv: 2,
  t: 'ふわふわ風船', y: 'ふわふわふうせん',
  tags: ['ワンボタン', 'canvas', '重力', 'アクション'],
  d: '押すたびに風船がふわっと上がり、放っておくと落ちる。流れてくる竹のすき間をくぐり抜けるたびに1点。操作は「押す」だけ。',
  html: `<canvas id="c" width="360" height="480"></canvas>`,
  css: `body { display: grid; place-items: center; background: #8fd3ff; touch-action: none; } canvas { height: 92vh; max-width: 96vw; border-radius: 10px; cursor: pointer; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), W = 360, H = 480;
    let y, vy, cols, score, best = 0, alive;
    const reset = () => { y = H / 2; vy = 0; cols = []; score = 0; alive = true; };
    reset();
    const flap = () => { if (!alive) reset(); vy = -6.2; };
    c.addEventListener('pointerdown', flap);
    addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); flap(); } });
    let frame = 0;
    (function loop() {
      frame++;
      if (alive) {
        vy += 0.32; y += vy;
        if (frame % 90 === 0) cols.push({ x: W, gap: 90 + Math.random() * (H - 260), passed: false });
        for (const cl of cols) { cl.x -= 2.4; if (!cl.passed && cl.x + 50 < 80) { cl.passed = true; score++; } if (80 + 16 > cl.x && 80 - 16 < cl.x + 50 && (y - 18 < cl.gap || y + 18 > cl.gap + 150)) alive = false; }
        cols = cols.filter((cl) => cl.x > -60);
        if (y > H - 30 || y < 0) alive = false;
        if (window.THUMB) { const nx = cols.find((cl) => cl.x + 50 > 60); if (y > (nx ? nx.gap + 100 : H / 2) && vy > 0) vy = -6.2; if (!alive) setTimeout(reset, 400); }
        best = Math.max(best, score);
      }
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#8fd3ff'); g.addColorStop(1, '#e8f7ff');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      for (const cl of cols) { x.fillStyle = '#3f8f3a'; x.fillRect(cl.x, 0, 50, cl.gap); x.fillRect(cl.x, cl.gap + 150, 50, H); x.fillStyle = '#2d6b2a'; for (let k = 20; k < H; k += 40) { if (k < cl.gap || k > cl.gap + 150) x.fillRect(cl.x, k, 50, 4); } }
      x.fillStyle = '#7a5c3a'; x.fillRect(0, H - 20, W, 20);
      x.strokeStyle = '#555'; x.beginPath(); x.moveTo(80, y + 18); x.lineTo(80 - vy, y + 46); x.stroke();
      x.fillStyle = '#e8336d'; x.beginPath(); x.ellipse(80, y, 16, 19, 0, 0, 7); x.fill();
      x.fillStyle = '#fff8'; x.beginPath(); x.ellipse(74, y - 7, 4, 6, -0.5, 0, 7); x.fill();
      x.fillStyle = '#222'; x.font = '700 28px sans-serif'; x.textAlign = 'center'; x.fillText(score, W / 2, 50);
      if (!alive) { x.font = '700 18px sans-serif'; x.fillText(`押してもう一度（最高 ${best}）`, W / 2, H / 2); }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'gm-whack', c: 'game', lv: 1,
  t: 'もぐらたたき', y: 'もぐらたたき',
  tags: ['反射神経', 'タイマー', 'クリック', 'CSSアニメーション'],
  d: '9つの穴からでたらめに顔を出すもぐらを、引っ込む前に叩く。30秒で何匹叩けるか。出る間隔は時間がたつほど短くなる。',
  html: `<p id="s"></p><div class="field" id="f"></div><button id="go">始める</button>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #7cb342; user-select: none; } .field { display: grid; grid-template-columns: repeat(3, min(24vmin, 110px)); gap: 12px; } .hole { aspect-ratio: 1; border-radius: 50%; background: radial-gradient(#3e2a1c 55%, #5d4030 56%); overflow: hidden; position: relative; border: 0; padding: 0; } .mole { position: absolute; left: 15%; width: 70%; height: 80%; bottom: -80%; border-radius: 50% 50% 30% 30%; background: #8d6e63; transition: bottom .12s; } .mole::before { content: "・ ・"; position: absolute; top: 22%; width: 100%; text-align: center; font: 900 min(6vmin, 26px)/1 sans-serif; color: #222; } .mole::after { content: ""; position: absolute; left: 38%; top: 45%; width: 24%; height: 14%; border-radius: 50%; background: #f48fb1; } .up .mole { bottom: 0; } .hit .mole { background: #e57373; } p { margin: 0; font: 700 18px sans-serif; color: #fff; }`,
  js() {
    const f = document.getElementById('f'), holes = [];
    for (let i = 0; i < 9; i++) { const h = document.createElement('button'); h.className = 'hole'; h.setAttribute('aria-label', `${i + 1}番の穴`); h.innerHTML = '<span class="mole"></span>'; h.onclick = () => whack(h); f.append(h); holes.push(h); }
    let score = 0, left = 0, running = false, timer = 0;
    const show = () => { document.getElementById('s').textContent = `${score} 匹 ・ 残り ${left} 秒`; };
    function whack(h) { if (!h.classList.contains('up') || h.classList.contains('hit')) return; score++; h.classList.add('hit'); setTimeout(() => h.classList.remove('up', 'hit'), 200); show(); }
    function pop() {
      if (!running) return;
      const h = holes[Math.floor(Math.random() * 9)];
      if (!h.classList.contains('up')) { h.classList.add('up'); setTimeout(() => h.classList.remove('up'), 700 - (30 - left) * 12); if (window.THUMB && Math.random() < 0.7) setTimeout(() => whack(h), 300); }
      setTimeout(pop, 450 + Math.random() * 500 - (30 - left) * 8);
    }
    function start() { score = 0; left = 30; running = true; show(); pop(); clearInterval(timer); timer = setInterval(() => { left--; show(); if (left <= 0) { running = false; clearInterval(timer); document.getElementById('s').textContent = `おしまい！ ${score} 匹`; if (window.THUMB) setTimeout(start, 1000); } }, 1000); }
    document.getElementById('go').onclick = start;
    show();
    if (window.THUMB) start();
  },
}, {
  id: 'gm-romaji-typing', c: 'game', lv: 3,
  t: 'ローマ字タイピング', y: 'ろーまじたいぴんぐ',
  tags: ['タイピング', 'ローマ字', 'キーボード操作', '入力判定'],
  d: 'ひらがなの言葉をローマ字で打つ。「し」は si でも shi でも、「っ」は子音を重ねても xtu でもよいなど、いくつもの打ち方を受け付ける。60秒で何文字打てるか。',
  p: '言葉を「打つ単位」に分け、単位ごとに受け付ける綴りの一覧を持つ。打った文字がどれかの綴りの頭と合っていれば正解として進める。',
  html: `<div class="box"><p class="kana" id="kana"></p><p class="roma" id="roma"></p><p id="s">キーボードで打つと始まります</p></div>`,
  css: `body { display: grid; place-items: center; background: #1e2433; color: #eef; } .box { text-align: center; } .kana { font: 800 9vmin serif; margin: 0; } .roma { font: 4.6vmin ui-monospace, monospace; letter-spacing: .08em; margin: 8px 0; color: #789; } .roma b { color: #ffd166; } .roma .miss { color: #ff6b6b; } p { font-size: 15px; }`,
  js() {
    const T = { あ: ['a'], い: ['i', 'yi'], う: ['u', 'wu'], え: ['e'], お: ['o'], か: ['ka', 'ca'], き: ['ki'], く: ['ku', 'cu', 'qu'], け: ['ke'], こ: ['ko', 'co'], さ: ['sa'], し: ['si', 'shi', 'ci'], す: ['su'], せ: ['se', 'ce'], そ: ['so'], た: ['ta'], ち: ['ti', 'chi'], つ: ['tu', 'tsu'], て: ['te'], と: ['to'], な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'], は: ['ha'], ひ: ['hi'], ふ: ['hu', 'fu'], へ: ['he'], ほ: ['ho'], ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'], や: ['ya'], ゆ: ['yu'], よ: ['yo'], ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'], わ: ['wa'], を: ['wo'], が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'], ざ: ['za'], じ: ['zi', 'ji'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'], だ: ['da'], ぢ: ['di'], づ: ['du'], で: ['de'], ど: ['do'], ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'], ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'], ー: ['-'], ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'], っ: ['xtu', 'ltu', 'xtsu'] };
    const Y = { き: ['ky'], ぎ: ['gy'], に: ['ny'], ひ: ['hy'], び: ['by'], ぴ: ['py'], み: ['my'], り: ['ry'], し: ['sy', 'sh'], ち: ['ty', 'ch', 'cy'], じ: ['zy', 'j', 'jy'] };
    const SMALL = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
    const opts = (k) => {
      if (k.length === 2 && SMALL[k[1]]) return [...(Y[k[0]] || []).map((c) => c + SMALL[k[1]]), ...T[k[0]].flatMap((a) => T[k[1]].map((b) => a + b))];
      return T[k] || [k];
    };
    function units(word) {
      const ch = [...word], raw = [];
      for (let i = 0; i < ch.length; i++) { let k = ch[i]; if (SMALL[ch[i + 1]] && Y[k]) { k += ch[i + 1]; i++; } raw.push(k); }
      const out = [];
      for (let i = 0; i < raw.length; i++) {
        const k = raw[i];
        if (k === 'っ' && raw[i + 1]) { const nx = opts(raw[i + 1]); out.push({ k: k + raw[i + 1], o: [...nx.filter((o) => /^[bcdfghjklmpqrstvwxyz]/.test(o)).map((o) => o[0] + o), ...T['っ'].flatMap((a) => nx.map((b) => a + b))] }); i++; continue; }
        if (k === 'ん') { const nx = raw[i + 1] ? opts(raw[i + 1]) : null; const o = ['nn', "n'", 'xn']; if (nx && nx.every((s) => /^[bcdfghjkmpqrstvwxz]/.test(s))) o.push('n'); out.push({ k, o }); continue; }
        out.push({ k, o: opts(k) });
      }
      return out;
    }
    const WORDS = ['すし', 'さくら', 'でんしゃ', 'がっこう', 'きょうと', 'ほっかいどう', 'こんにちは', 'たんぽぽ', 'ちょうちょ', 'しんかんせん', 'ふじさん', 'ぱそこん', 'ぶらうざ', 'きゃべつ', 'じゃんけん', 'まっちゃ', 'でんき', 'ろーまじ'];
    let word, us, ui, buf, typed, done = 0, miss = 0, t0 = 0, left = 60, timer = 0;
    function nextWord() { word = WORDS[Math.floor(Math.random() * WORDS.length)]; us = units(word); ui = 0; buf = ''; typed = ''; draw(); }
    function draw(isMiss) {
      document.getElementById('kana').textContent = word;
      const rest = (ui < us.length ? (us[ui].o.find((o) => o.startsWith(buf)) || us[ui].o[0]).slice(buf.length) : '') + us.slice(ui + 1).map((u) => u.o[0]).join('');
      document.getElementById('roma').innerHTML = `<b>${typed}${buf}</b>${isMiss ? `<span class="miss">${rest[0] || ''}</span>${rest.slice(1)}` : rest}`;
      document.getElementById('s').textContent = t0 ? `残り ${left} 秒 ・ 打った文字 ${done} ・ ミス ${miss}` : 'キーボードで打つと始まります';
    }
    function key(c) {
      const u = us[ui];
      if (u.o.some((o) => o.startsWith(buf + c))) {
        buf += c;
        if (u.o.includes(buf) && !u.o.some((o) => o !== buf && o.startsWith(buf))) { typed += buf; buf = ''; ui++; }
        done++;
        if (ui >= us.length) nextWord(); else draw();
        return true;
      }
      if (u.o.includes(buf)) { typed += buf; buf = ''; ui++; return key(c); }
      miss++; draw(true);
      return false;
    }
    function start() { t0 = performance.now(); left = 60; done = 0; miss = 0; clearInterval(timer); timer = setInterval(() => { left--; if (left <= 0) { clearInterval(timer); t0 = 0; document.getElementById('s').textContent = `おしまい！ ${done} 文字、ミス ${miss}（1分あたり ${done} 打）`; return; } draw(); }, 1000); }
    addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      e.preventDefault();
      if (!t0) start();
      key(e.key.toLowerCase() === '－' ? '-' : e.key.toLowerCase());
    });
    nextWord();
    if (window.THUMB) setInterval(() => { const u = us[ui]; const o = u.o.find((s) => s.startsWith(buf)) || u.o[0]; key(o[buf.length]); }, 140);
  },
}, {
  id: 'gm-shooter', c: 'game', lv: 3,
  t: '縦スクロールの撃ち合い', y: 'たてすくろーるのうちあい',
  tags: ['シューティング', 'canvas', '当たり判定', '粒子'],
  d: '自機をマウス・指・左右キーで動かし、自動で撃つ弾で上から来る敵を落とす。敵は波の形で揺れながら降りてくる。当たると火花が散る。',
  html: `<canvas id="c" width="360" height="520"></canvas>`,
  css: `body { display: grid; place-items: center; background: #05060f; touch-action: none; } canvas { height: 94vh; max-width: 96vw; border-radius: 8px; background: #070a1c; cursor: none; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), W = 360, H = 520;
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 2 + 0.5 }));
    let px = W / 2, shots = [], foes = [], sparks = [], score = 0, life = 3, frame = 0, keys = {};
    c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); px = ((e.clientX - r.left) / r.width) * W; });
    addEventListener('keydown', (e) => { keys[e.key] = true; }); addEventListener('keyup', (e) => { keys[e.key] = false; });
    const boom = (bx, by, col) => { for (let i = 0; i < 18; i++) { const a = Math.random() * 7, s = Math.random() * 4; sparks.push({ x: bx, y: by, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1, col }); } };
    (function loop() {
      frame++;
      if (keys.ArrowLeft) px -= 6; if (keys.ArrowRight) px += 6;
      if (window.THUMB) { const t = foes[0]; if (t) px += (t.x - px) * 0.08; }
      px = Math.max(16, Math.min(W - 16, px));
      if (frame % 8 === 0) shots.push({ x: px, y: H - 50 });
      if (frame % 40 === 0) { const base = Math.random() * (W - 80) + 40, h = Math.random() * 360; for (let k = 0; k < 4; k++) foes.push({ x0: base, x: base, y: -20 - k * 34, ph: k, hp: 2, h }); }
      shots.forEach((s) => { s.y -= 8; }); shots = shots.filter((s) => s.y > -10);
      foes.forEach((f) => { f.y += 1.6; f.ph += 0.05; f.x = f.x0 + Math.sin(f.ph) * 40; });
      for (const f of foes) for (const s of shots) if (!s.hit && Math.abs(f.x - s.x) < 14 && Math.abs(f.y - s.y) < 14) { s.hit = true; if (--f.hp <= 0) { f.dead = true; score += 10; boom(f.x, f.y, `hsl(${f.h} 90% 60%)`); } }
      for (const f of foes) if (!f.dead && Math.abs(f.x - px) < 18 && Math.abs(f.y - (H - 40)) < 18) { f.dead = true; life--; boom(px, H - 40, '#fff'); if (life < 0) { score = 0; life = 3; foes = []; } }
      foes = foes.filter((f) => !f.dead && f.y < H + 20); shots = shots.filter((s) => !s.hit);
      x.fillStyle = '#070a1c'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff'; for (const st of stars) { st.y = (st.y + st.s) % H; x.fillRect(st.x, st.y, st.s, st.s); }
      x.fillStyle = '#7fffd4'; for (const s of shots) x.fillRect(s.x - 1.5, s.y - 6, 3, 10);
      for (const f of foes) { x.fillStyle = `hsl(${f.h} 80% 60%)`; x.beginPath(); x.moveTo(f.x, f.y + 12); x.lineTo(f.x - 12, f.y - 8); x.lineTo(f.x, f.y - 2); x.lineTo(f.x + 12, f.y - 8); x.fill(); }
      x.fillStyle = '#e8f0ff'; x.beginPath(); x.moveTo(px, H - 58); x.lineTo(px - 14, H - 26); x.lineTo(px, H - 32); x.lineTo(px + 14, H - 26); x.fill();
      x.fillStyle = '#ff9a3c'; x.fillRect(px - 3, H - 30, 6, 6 + (frame % 4));
      for (const sp of sparks) { sp.x += sp.vx; sp.y += sp.vy; sp.l -= 0.03; x.globalAlpha = Math.max(0, sp.l); x.fillStyle = sp.col; x.fillRect(sp.x, sp.y, 3, 3); }
      x.globalAlpha = 1; sparks = sparks.filter((s) => s.l > 0);
      x.fillStyle = '#fff'; x.font = '700 16px ui-monospace, monospace'; x.fillText(`得点 ${score}  残機 ${life}`, 10, 22);
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'gm-runner', c: 'game', lv: 2,
  t: '障害物を跳び越える', y: 'しょうがいぶつをとびこえる',
  tags: ['ランナー', 'ジャンプ', 'canvas', 'ワンボタン'],
  d: '走り続ける毛玉を、押すかスペースキーで跳ばせて岩をよける。長く押すと高く跳ぶ。進むほど速くなり、空の色も朝から夜へ移っていく。',
  html: `<canvas id="c" width="640" height="240"></canvas>`,
  css: `body { display: grid; place-items: center; background: #222; touch-action: none; } canvas { width: min(96vw, 900px); border-radius: 10px; cursor: pointer; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), W = 640, H = 240, G = 200;
    let y, vy, hold, rocks, speed, dist, alive, best = 0;
    const reset = () => { y = G; vy = 0; rocks = []; speed = 5; dist = 0; alive = true; };
    reset();
    const down = () => { if (!alive) { reset(); return; } if (y >= G) { vy = -9; hold = true; } };
    const up = () => { hold = false; };
    c.addEventListener('pointerdown', down); c.addEventListener('pointerup', up);
    addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); if (!e.repeat) down(); } });
    addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'ArrowUp') up(); });
    (function loop(t) {
      if (alive) {
        vy += hold && vy < 0 ? 0.35 : 0.8; y = Math.min(G, y + vy); if (y >= G) vy = 0;
        dist += speed; speed += 0.002;
        if (!rocks.length || rocks[rocks.length - 1].x < W - 200 - Math.random() * 300) rocks.push({ x: W + 20, w: 16 + Math.random() * 20, h: 20 + Math.random() * 30 });
        rocks.forEach((r) => { r.x -= speed; }); rocks = rocks.filter((r) => r.x > -40);
        for (const r of rocks) if (80 + 14 > r.x && 80 - 14 < r.x + r.w && y > G - r.h + 4) { alive = false; best = Math.max(best, Math.floor(dist / 10)); }
        if (window.THUMB) { const r = rocks.find((q) => q.x > 60); if (r && r.x - 80 < speed * 14 && y >= G) { vy = -9; hold = true; setTimeout(up, 120); } if (!alive) setTimeout(reset, 500); }
      }
      const k = (Math.sin(dist / 3000) + 1) / 2;
      const sky = x.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, `hsl(${210 - k * 20} 60% ${70 - k * 55}%)`); sky.addColorStop(1, `hsl(${30 + k * 200} 60% ${75 - k * 50}%)`);
      x.fillStyle = sky; x.fillRect(0, 0, W, H);
      x.fillStyle = '#5b4636'; x.fillRect(0, G + 14, W, H);
      x.fillStyle = '#7a8b99'; for (const r of rocks) { x.beginPath(); x.moveTo(r.x, G + 14); x.lineTo(r.x + r.w * 0.2, G + 14 - r.h); x.lineTo(r.x + r.w * 0.8, G + 14 - r.h * 0.9); x.lineTo(r.x + r.w, G + 14); x.fill(); }
      const bob = y >= G ? Math.sin(t / 60) * 2 : 0;
      x.fillStyle = '#f2a65a'; x.beginPath(); x.arc(80, y + bob, 14, 0, 7); x.fill();
      x.fillStyle = '#222'; x.beginPath(); x.arc(86, y - 3 + bob, 2.5, 0, 7); x.fill();
      x.fillStyle = k > 0.5 ? '#fff' : '#222'; x.font = '700 16px ui-monospace, monospace'; x.fillText(`${Math.floor(dist / 10)} m  最高 ${best} m`, 14, 24);
      if (!alive) x.fillText('押してもう一度', W / 2 - 60, H / 2);
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'gm-sudoku', c: 'game', lv: 3,
  t: '数独（問題づくりと自動解答）', y: 'すうどくもんだいづくりとじどうかいとう',
  tags: ['パズル', 'バックトラック', '再帰', '数字'],
  d: '空の盤にでたらめな順で数字を入れていき、行き詰まったら戻ってやり直す（バックトラック）と完成した盤ができる。そこから数字を消して問題にする。同じ手順で「解く」ボタンも動く。',
  html: `<div class="g" id="g"></div><div class="bar"><button id="new">新しい問題</button><button id="solve">解く</button></div><p id="s"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 6px; background: #f2efe8; } .g { display: grid; grid-template-columns: repeat(9, min(9.4vmin, 40px)); border: 3px solid #333; } .g input { width: 100%; aspect-ratio: 1; text-align: center; border: 1px solid #ccc; border-radius: 0; padding: 0; font: 700 min(5vmin, 20px) sans-serif; color: #26407c; } .g input[readonly] { color: #222; background: #ece7dc; } .g input:nth-child(9n+3), .g input:nth-child(9n+6) { border-right: 2px solid #333; } .g input:nth-child(n+19):nth-child(-n+27), .g input:nth-child(n+46):nth-child(-n+54) { border-bottom: 2px solid #333; } .g input.bad { background: #ffd6d6; } .bar { display: flex; gap: 8px; } p { margin: 0; font-weight: 700; }`,
  js() {
    const g = document.getElementById('g'), cells = [];
    for (let i = 0; i < 81; i++) { const inp = document.createElement('input'); inp.inputMode = 'numeric'; inp.maxLength = 1; inp.setAttribute('aria-label', `${Math.floor(i / 9) + 1}行${(i % 9) + 1}列`); inp.addEventListener('input', () => { inp.value = inp.value.normalize('NFKC').replace(/[^1-9]/g, ''); check(); }); g.append(inp); cells.push(inp); }
    const ok = (b, i, n) => { const r = Math.floor(i / 9), c = i % 9, br = r - (r % 3), bc = c - (c % 3); for (let k = 0; k < 9; k++) { if (b[r * 9 + k] === n || b[k * 9 + c] === n || b[(br + Math.floor(k / 3)) * 9 + bc + (k % 3)] === n) return false; } return true; };
    function solve(b) {
      const i = b.indexOf(0);
      if (i < 0) return true;
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5)) { if (ok(b, i, n)) { b[i] = n; if (solve(b)) return true; b[i] = 0; } }
      return false;
    }
    function make() {
      const full = Array(81).fill(0); solve(full);
      const puz = full.slice(); let holes = 0;
      for (const i of [...Array(81).keys()].sort(() => Math.random() - 0.5)) { if (holes >= 46) break; puz[i] = 0; holes++; }
      cells.forEach((c, i) => { c.value = puz[i] || ''; c.readOnly = !!puz[i]; c.classList.remove('bad'); });
      document.getElementById('s').textContent = '空いたマスに1〜9を入れてください';
    }
    function check() {
      const b = cells.map((c) => +c.value || 0);
      let bad = 0;
      cells.forEach((c, i) => { const n = b[i]; b[i] = 0; const wrong = n && !ok(b, i, n); b[i] = n; c.classList.toggle('bad', !!wrong); if (wrong) bad++; });
      document.getElementById('s').textContent = !bad && b.every(Boolean) ? '完成です！' : bad ? 'ぶつかっている数字があります' : '';
    }
    document.getElementById('new').onclick = make;
    document.getElementById('solve').onclick = () => { const b = cells.map((c) => (c.readOnly ? +c.value : 0)); if (solve(b)) cells.forEach((c, i) => { c.value = b[i]; }); check(); };
    make();
  },
}, {
  id: 'gm-omikuji', c: 'game', lv: 1,
  t: 'おみくじ', y: 'おみくじ',
  tags: ['ランダム', '縦書き', '和風', '占い'],
  d: '箱を振ると、大吉から凶までのくじを重み付きの確率で引き、願望・待人・失物などの運勢も添えて縦書きの紙で見せる。',
  html: `<div class="scene"><button class="box" id="box" aria-label="おみくじの箱を振る">御<br>神<br>籤</button><article class="paper" id="paper" hidden></article></div>`,
  css: `
    body { display: grid; place-items: center; background: radial-gradient(#7a1f1f, #3a0c0c); color: #222; }
    .scene { display: flex; gap: 6vmin; align-items: center; }
    .box { width: 18vmin; height: 34vmin; border: 0; border-radius: 1vmin; background: linear-gradient(90deg, #6b3a1a, #a0612e 50%, #6b3a1a); color: #fff3d6; font: 900 5vmin/1.3 serif; box-shadow: 0 2vmin 4vmin #0008; }
    .box.shake { animation: shake .5s ease-in-out 2; }
    @keyframes shake { 25% { rotate: -25deg; } 75% { rotate: 25deg; } }
    .paper { writing-mode: vertical-rl; height: 70vh; padding: 3vmin; background: #fffaf0; border-top: 1vmin solid #c23b22; border-bottom: 1vmin solid #c23b22; font: 2.4vmin/2 serif; box-shadow: 0 2vmin 4vmin #0008; animation: open .5s ease-out; }
    @keyframes open { from { scale: 1 .1; opacity: 0; } }
    .paper h2 { font-size: 8vmin; margin: 0 0 0 2vmin; color: #c23b22; letter-spacing: .2em; }
    .paper dt { font-weight: 900; } .paper dd { margin: 0 0 0 1.5vmin; }`,
  js() {
    const fortunes = [['大吉', 10], ['中吉', 18], ['小吉', 22], ['吉', 25], ['末吉', 15], ['凶', 10]];
    const topics = { 願望: ['思いのほか早く叶う', '焦らず待てば叶う', '人の助けで叶う'], 待人: ['便りあり、来る', '遅れて来る', '来たらず、こちらから訪ねよ'], 失物: ['身近な所から出る', '高い所を探せ', '出にくいが諦めるな'], 旅行: ['東が吉', '近場がよい', '思い立ったら行け'], 学問: ['努力が実る', '基礎を固めよ', '人に教えると身に付く'], 商売: ['利益あり', '急がず進め', '新しいことに吉'] };
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    function draw() {
      let r = Math.random() * 100, f = fortunes[0][0];
      for (const [name, w] of fortunes) { if ((r -= w) < 0) { f = name; break; } }
      const p = document.getElementById('paper');
      p.innerHTML = `<h2>${f}</h2><dl>${Object.entries(topics).map(([k, v]) => `<dt>${k}</dt><dd>${pick(v)}</dd>`).join('')}</dl>`;
      p.hidden = false;
      p.style.animation = 'none'; p.offsetHeight; p.style.animation = '';
    }
    const box = document.getElementById('box');
    box.onclick = () => { document.getElementById('paper').hidden = true; box.classList.remove('shake'); box.offsetWidth; box.classList.add('shake'); setTimeout(draw, 1000); };
    if (window.THUMB) { box.click(); setInterval(() => box.click(), 2600); }
  },
}, {
  id: 'gm-slot', c: 'game', lv: 2,
  t: '絵合わせスロット', y: 'えあわせすろっと',
  tags: ['スロット', 'リール', 'アニメーション', 'ランダム'],
  d: '3つのリールを回し、止めるボタンで1つずつ止める。そろった絵で点数が増える。リールは絵を縦に並べた帯を translate で動かしているだけ。（お金は一切かからない遊びです）',
  html: `<div class="machine"><div class="reels" id="reels"></div><div class="bar"><button id="spin">回す</button><button class="st">止</button><button class="st">止</button><button class="st">止</button></div><p id="s"></p></div>`,
  css: `body { display: grid; place-items: center; background: #2b0f2e; color: #ffe; } .machine { padding: 16px; border-radius: 18px; background: linear-gradient(#c23b22, #7a1a10); box-shadow: 0 10px 30px #000a; text-align: center; } .reels { display: flex; gap: 8px; } .reel { width: 90px; height: 100px; overflow: hidden; background: #fff; border-radius: 8px; box-shadow: inset 0 10px 10px -6px #0006, inset 0 -10px 10px -6px #0006; } .strip { display: grid; } .strip span { height: 100px; display: grid; place-items: center; font: 900 56px serif; } .bar { display: flex; gap: 6px; margin-top: 10px; justify-content: center; } p { margin: 8px 0 0; font-weight: 700; min-height: 1.4em; }`,
  js() {
    const SYM = ['桜', '鈴', '七', '星', '柿', '福'], COL = { 桜: '#e8336d', 鈴: '#d4a017', 七: '#c23b22', 星: '#26407c', 柿: '#e0532f', 福: '#2f855a' };
    const reels = document.getElementById('reels'), strips = [];
    let points = 100;
    for (let r = 0; r < 3; r++) {
      const reel = document.createElement('div'); reel.className = 'reel';
      const strip = document.createElement('div'); strip.className = 'strip';
      for (let k = 0; k < 4; k++) for (const s of SYM) strip.insertAdjacentHTML('beforeend', `<span style="color:${COL[s]}">${s}</span>`);
      reel.append(strip); reels.append(reel);
      strips.push({ el: strip, pos: 0, spinning: false, v: 0 });
    }
    const show = (m = '') => { document.getElementById('s').textContent = `${m} 持ち点 ${points}`; };
    function stop(i) {
      const s = strips[i]; if (!s.spinning) return;
      s.spinning = false; s.pos = Math.round(s.pos / 100) * 100; s.el.style.transition = 'transform .25s cubic-bezier(.3, 1.6, .5, 1)'; s.el.style.transform = `translateY(${-(s.pos % 600)}px)`;
      if (strips.every((q) => !q.spinning)) setTimeout(judge, 300);
    }
    function judge() {
      const got = strips.map((q) => SYM[(q.pos % 600) / 100]);
      const same = new Set(got).size;
      const win = same === 1 ? (got[0] === '七' ? 100 : 30) : same === 2 ? 5 : 0;
      points += win; show(win ? `${got.join('')} ＋${win}点！` : got.join(''));
    }
    document.getElementById('spin').onclick = () => { if (strips.some((q) => q.spinning) || points <= 0) return; points -= 3; strips.forEach((q) => { q.spinning = true; q.v = 22 + Math.random() * 8; q.el.style.transition = 'none'; }); show(); };
    document.querySelectorAll('.st').forEach((b, i) => { b.onclick = () => stop(i); });
    (function loop() { for (const q of strips) if (q.spinning) { q.pos = (q.pos + q.v) % 600; q.el.style.transform = `translateY(${-q.pos}px)`; } requestAnimationFrame(loop); })();
    show();
    if (window.THUMB) setInterval(() => { if (strips.every((q) => !q.spinning)) document.getElementById('spin').click(); else stop(strips.findIndex((q) => q.spinning)); }, 600);
  },
}, {
  id: 'gm-janken', c: 'game', lv: 2,
  t: '癖を読むじゃんけん', y: 'くせをよむじゃんけん',
  tags: ['じゃんけん', '予測', 'マルコフ連鎖', '統計'],
  d: 'コンピューターは「あなたが前に出した手の次に、何を出しがちか」を数えて覚え、一番出しそうな手に勝つ手を出す。適当に出しているつもりでも、癖があると負けが込んでくる。',
  p: '直前の手ごとに次の手の回数を数える表（3×3）を持つだけ。これがマルコフ連鎖による予測のいちばん簡単な形。',
  html: `<div class="hands" id="hands"></div><div class="vs"><span id="you">？</span><b>対</b><span id="cpu">？</span></div><p id="s"></p><p id="stat"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #fff7e6; } .hands { display: flex; gap: 10px; } .hands button { width: 90px; height: 90px; border-radius: 50%; border: 0; background: #fff; box-shadow: 0 3px 8px #0002; font: 800 18px sans-serif; } .vs { display: flex; gap: 20px; align-items: center; font: 900 36px serif; } p { margin: 0; } #s { font-weight: 800; font-size: 20px; }`,
  js() {
    const H = ['グー', 'チョキ', 'パー'], beat = (h) => (h + 2) % 3;
    const table = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
    let last = -1, win = 0, lose = 0, draw = 0;
    function cpuHand() { if (last < 0) return Math.floor(Math.random() * 3); const row = table[last], guess = row.indexOf(Math.max(...row)); return beat(guess); }
    function play(h) {
      const c = cpuHand();
      if (last >= 0) table[last][h]++;
      last = h;
      document.getElementById('you').textContent = H[h]; document.getElementById('cpu').textContent = H[c];
      const r = (h - c + 3) % 3;
      if (r === 0) { draw++; document.getElementById('s').textContent = 'あいこ'; } else if (r === 2) { win++; document.getElementById('s').textContent = 'あなたの勝ち'; } else { lose++; document.getElementById('s').textContent = 'コンピューターの勝ち'; }
      document.getElementById('stat').textContent = `${win}勝 ${lose}敗 ${draw}分 ・ コンピューターの勝率 ${Math.round((lose / Math.max(1, win + lose)) * 100)}%`;
    }
    const hands = document.getElementById('hands');
    H.forEach((n, i) => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => play(i); hands.append(b); });
    if (window.THUMB) { let k = 0; setInterval(() => play([0, 0, 1, 2, 0, 1][k++ % 6]), 700); }
  },
}, {
  id: 'gm-lights-out', c: 'game', lv: 2,
  t: '反転パズル', y: 'はんてんぱずる',
  tags: ['パズル', '反転', 'グリッド', '論理'],
  d: 'マスを押すと、そのマスと上下左右のマスの明かりが入れ替わる。全部の明かりを消したら完成。問題は「完成した盤をでたらめに押した」状態から作るので、必ず解ける。',
  html: `<div class="b" id="b"></div><p id="s"></p><button id="new">新しい問題</button>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #101820; color: #dde; } .b { display: grid; grid-template-columns: repeat(5, min(15vmin, 64px)); gap: 6px; } .b button { aspect-ratio: 1; border: 0; border-radius: 10px; background: #26303c; transition: background .15s, box-shadow .15s; } .b button.on { background: #ffd23f; box-shadow: 0 0 18px #ffd23f88; } p { margin: 0; }`,
  js() {
    const N = 5, b = document.getElementById('b');
    let g = [], moves = 0;
    const btns = Array.from({ length: N * N }, (_, i) => { const btn = document.createElement('button'); btn.setAttribute('aria-label', `${Math.floor(i / N) + 1}行${(i % N) + 1}列`); btn.onclick = () => { press(i); moves++; draw(); }; b.append(btn); return btn; });
    function press(i) { const r = Math.floor(i / N), c = i % N; for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const y = r + dr, x = c + dc; if (y >= 0 && y < N && x >= 0 && x < N) g[y * N + x] ^= 1; } }
    function draw() { btns.forEach((btn, i) => { btn.classList.toggle('on', !!g[i]); btn.setAttribute('aria-pressed', !!g[i]); }); document.getElementById('s').textContent = g.every((v) => !v) ? `消えました！（${moves} 手）` : `${moves} 手 ・ 点いている明かり ${g.filter(Boolean).length}`; }
    function fresh() { g = Array(N * N).fill(0); for (let k = 0; k < 12; k++) press(Math.floor(Math.random() * N * N)); if (g.every((v) => !v)) press(12); moves = 0; draw(); }
    document.getElementById('new').onclick = fresh;
    fresh();
    if (window.THUMB) setInterval(() => { press(Math.floor(Math.random() * N * N)); draw(); }, 500);
  },
}, {
  id: 'gm-bingo', c: 'game', lv: 2,
  t: 'ビンゴの抽選機', y: 'びんごのちゅうせんき',
  tags: ['ビンゴ', '抽選', 'ランダム', 'パーティー'],
  d: '1〜75の玉を重なりなく1つずつ引き、自分のカードに同じ数があれば穴を開ける。縦・横・斜めのどれかが1列そろったらビンゴ。カードは列ごとに決まった範囲の数から作る。',
  html: `<div class="wrap"><div class="ball" id="ball">?</div><button id="draw">玉を引く</button><div class="card" id="card"></div><button id="new">新しいカード</button></div><p id="hist"></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; background: #ffefd5; } .wrap { display: grid; justify-items: center; gap: 8px; } .ball { width: 90px; height: 90px; border-radius: 50%; display: grid; place-items: center; font: 900 36px sans-serif; color: #fff; background: radial-gradient(circle at 35% 30%, #ff9a8b, #c23b22); box-shadow: 0 6px 14px #0004; } .ball.roll { animation: roll .5s linear; } @keyframes roll { to { rotate: 1turn; } } .card { display: grid; grid-template-columns: repeat(5, 48px); gap: 3px; } .card b { text-align: center; font: 900 20px sans-serif; color: #c23b22; } .card span { height: 48px; display: grid; place-items: center; background: #fff; border-radius: 6px; font: 700 18px sans-serif; } .card span.hit { background: #26407c; color: #fff; } .card span.line { background: #ffd23f; color: #222; } #hist { max-width: 90vw; font-size: 12px; color: #666; text-align: center; }`,
  js() {
    let pool, card, hits, drawn;
    function newCard() {
      card = []; hits = new Set(['free']);
      for (let col = 0; col < 5; col++) { const nums = [...Array(15).keys()].map((n) => n + 1 + col * 15).sort(() => Math.random() - 0.5).slice(0, 5); nums.forEach((n, row) => { card[row * 5 + col] = row === 2 && col === 2 ? 'free' : n; }); }
      pool = [...Array(75).keys()].map((n) => n + 1); drawn = [];
      render();
    }
    const LINES = [...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)), ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)), [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]];
    function render() {
      const win = LINES.filter((l) => l.every((i) => hits.has(card[i])));
      const winSet = new Set(win.flat());
      document.getElementById('card').innerHTML = [...'BINGO'].map((ch) => `<b>${ch}</b>`).join('') + card.map((n, i) => `<span class="${hits.has(n) ? 'hit' : ''} ${winSet.has(i) ? 'line' : ''}">${n === 'free' ? '★' : n}</span>`).join('');
      document.getElementById('hist').textContent = (win.length ? `ビンゴ！（${win.length} 列） ・ ` : '') + `引いた玉: ${drawn.join(' ')}`;
    }
    document.getElementById('draw').onclick = () => {
      if (!pool.length) return;
      const n = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      drawn.push(n);
      const ball = document.getElementById('ball');
      ball.classList.remove('roll'); ball.offsetWidth; ball.classList.add('roll');
      setTimeout(() => { ball.textContent = n; if (card.includes(n)) hits.add(n); render(); }, 450);
    };
    document.getElementById('new').onclick = newCard;
    newCard();
    if (window.THUMB) setInterval(() => { if (drawn.length > 40) newCard(); document.getElementById('draw').click(); }, 700);
  },
});
dekiru.add({
  id: 'game-fps-skeleton', c: 'game', lv: 3,
  t: '箱だけで作る FPS の骨組み（動き・当たり・光線で描く）', y: 'はこだけでつくるえふぴーえすのほねぐみうごきあたりこうせんでえがく',
  tags: ['FPS', '当たり判定', 'レイトレーシング', '固定ステップ', 'Pointer Lock'],
  d: '1 つの HTML で遊べる FPS（gokayfem の dust2-shader、2026-11-19）を調べ、その骨組みを自分で書き直した。地面・壁・木箱・的は全部「箱」で、同じ箱のリストを、動きの当たり判定にも、シェーダーの光線の描画にも使う。動きは Quake や Half-Life と同じ決まり（摩擦・加速・空中の加速の上限・段差の乗り越え・しゃがみ）を、1 秒 120 回の決まった刻みで計算する。画面を押すと視点が固定され、マウスで向き、WASD で歩き、スペースで跳び、C でしゃがみ、クリックで撃つ（Esc で解除）。右上の地図の点線は、体の幅だけ太らせた壁。',
  p: '当たり判定は「壁を体の大きさだけ太らせ、足もとの 1 点の動きとして調べる」と、箱と線分の交わりの計算だけで済む（元の作品のマップは、この太らせた形を前もって木の形で持っている）。動きは描くコマとは別に、決まった刻み（1/120 秒）で進める。刻みが一定なので、同じ入力なら同じ結果になり、跳ぶ高さも描くコマの速さに左右されない。',
  html: `<canvas id="c" role="img" aria-label="砂色の中庭の FPS の場面。高台と階段、木箱、低いトンネル、壁に付いた赤い的がある"></canvas>
<div class="cross" aria-hidden="true"></div>
<canvas id="map" class="ui" width="168" height="168" aria-label="上から見た地図。灰色は箱、点線は体の幅だけ太らせた壁、黄色の点が自分"></canvas>
<p class="ui hud" id="hud" aria-live="off"></p>
<div class="ui bar">
  <button type="button" id="hull" aria-pressed="true">地図に太らせた壁</button>
  <button type="button" id="reset">最初から</button>
  <span class="help">画面を押す → マウスで向く・WASD・スペース・C・クリックで撃つ・Esc</span>
</div>
<div class="ui pad" aria-label="さわる操作">
  <button type="button" data-k="fwd" aria-label="前へ">▲</button>
  <button type="button" data-k="left" aria-label="左へ">◀</button>
  <button type="button" data-k="back" aria-label="後ろへ">▼</button>
  <button type="button" data-k="right" aria-label="右へ">▶</button>
  <button type="button" data-k="jump">跳ぶ</button>
  <button type="button" data-k="crouch">しゃがむ</button>
  <button type="button" data-k="shoot">撃つ</button>
</div>
<details class="ui how">
  <summary>dust2-shader を調べて分かったこと</summary>
  <ul>
    <li>99,476 バイトの 1 つの HTML で、Counter-Strike 1.5 の元のマップ（de_dust2.bsp）と、縮めた元のテクスチャを詰めて遊べるようにしている。リポジトリにライセンスの表示はない（この項目では、コードも絵も使っていない）。</li>
    <li>1 コマに GPU で 2 回描く。1 回目は、プレイヤーの動きをフラグメントシェーダーで計算し、位置と速さを 6 画素の浮動小数点のテクスチャに書く（2 枚を交互に使う）。2 回目は、三角形を木構造（BVH）にまとめたデータをテクスチャに入れ、点ごとに光線で当たりを調べて描く。</li>
    <li>動きの決まりは Half-Life と同じ形: 1 秒 120 回の刻み、地上の摩擦（止まる目安 75・摩擦 4）、加速 10、空中は目標の速さを 30 までに抑える、重力 800、跳ぶ高さ 45、段差 18、しゃがむと箱の高さ 72 → 36（単位はマップの単位、1 単位 ≒ 2.5 cm）。</li>
    <li>当たりは、マップの作成の道具が前もって作った「体の大きさだけ太らせた壁」の木（BSP のクリップノード）を、線分でたどって調べる。立ったときとしゃがんだときの 2 つの木がある。</li>
    <li>木構造は、12 個の区切りで面積の見積もり（SAH）が最も小さい分け方を選び、葉に三角形を 8 個まで入れる。木は前から順に並べ、外れたら部分の木を飛ばす番号を持たせて、スタックなしでたどる。</li>
    <li>光の当たり方は、元のマップの焼き込んだ明るさ（ライトマップ）を使い、テクスチャは光線の広がりから細かさ（ミップ）を選ぶ。</li>
  </ul>
  <p>この項目は、同じ型を、箱だけの小さな中庭（オリジナル）で自分で書いたもの。動きは JS で計算し（テストできるように）、描画は 1 枚のフラグメントシェーダーで箱と光線の交わりを調べる。</p>
</details>
<p class="ui credit">調べたもの: <a href="https://github.com/gokayfem/dust2-shader" target="_blank" rel="noopener">gokayfem/dust2-shader</a>（場面とコードはオリジナル）</p>`,
  css: `
:root { color-scheme: dark; }
[hidden] { display: none !important; }
body { margin: 0; overflow: hidden; background: #000; color: #f3eee6; font: 13px/1.5 system-ui, sans-serif; }
#c { display: block; width: 100vw; height: 100vh; cursor: crosshair; touch-action: none; }
.cross { position: fixed; left: 50%; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; pointer-events: none;
  background: linear-gradient(#fff, #fff) center / 2px 14px no-repeat, linear-gradient(#fff, #fff) center / 14px 2px no-repeat; mix-blend-mode: difference; }
#map { position: fixed; right: 8px; top: 8px; width: 168px; height: 168px; background: rgb(10 10 14 / .6); border-radius: 6px; }
.hud { position: fixed; left: 8px; top: 8px; margin: 0; padding: 4px 8px; background: rgb(10 10 14 / .6); border-radius: 6px; font-variant-numeric: tabular-nums; white-space: pre; }
.bar { position: fixed; left: 8px; right: 8px; bottom: 26px; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.bar button, .pad button { min-height: 32px; min-width: 32px; padding: 4px 10px; font: inherit; color: inherit; background: rgb(10 10 14 / .65); border: 1px solid rgb(255 255 255 / .5); border-radius: 6px; cursor: pointer; }
.bar button[aria-pressed="true"] { background: rgb(240 200 120 / .9); color: #1a1208; }
.help { padding: 2px 8px; background: rgb(10 10 14 / .55); border-radius: 6px; }
:where(button, summary, a):focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
.pad { position: fixed; right: 8px; bottom: 70px; display: none; grid-template-columns: repeat(3, 44px); gap: 4px; }
.pad [data-k="fwd"] { grid-column: 2; } .pad [data-k="left"] { grid-column: 1; grid-row: 2; } .pad [data-k="back"] { grid-column: 2; grid-row: 2; } .pad [data-k="right"] { grid-column: 3; grid-row: 2; }
.pad [data-k="jump"], .pad [data-k="crouch"], .pad [data-k="shoot"] { grid-row: 3; padding: 4px 2px; font-size: 12px; }
@media (pointer: coarse) { .pad { display: grid; } .help { display: none; } }
.how { position: fixed; z-index: 2; left: 8px; top: 64px; max-width: min(560px, calc(100vw - 200px)); max-height: calc(100vh - 150px); overflow: auto; background: rgb(10 10 14 / .85); border: 1px solid rgb(255 255 255 / .3); border-radius: 8px; padding: 4px 10px; }
.how summary { cursor: pointer; min-height: 28px; line-height: 28px; font-weight: 700; }
.how ul { margin: 4px 0; padding-left: 1.2em; } .how li { margin: 3px 0; }
.credit { position: fixed; left: 8px; bottom: 4px; margin: 0; font-size: 12px; } .credit a { color: #ffd9a0; }
@media (max-width: 640px) { #map { width: 112px; height: 112px; } .how { max-width: calc(100vw - 16px); top: 70px; } }
.thumb .ui, .thumb .cross { display: none; }`,
  core() {
    // 箱だけで作る FPS の骨組みの計算（画面を使わない）。座標は x が右・y が上・z が前、長さはメートル。
    // 値は Half-Life の動きの決まりを、1 単位 ≒ 2.54 cm としてメートルに直したもの
    const FP = (() => {
      const P = {
        TICK: 1 / 120, G: 20, JUMP_H: 1.14, SPEED: 6.35, CROUCH_SPEED: 2.54, ACCEL: 10, AIR_CAP: 0.76,
        FRICTION: 4, STOP: 1.9, STEP: 0.46, HALF: 0.4, STAND_H: 1.8, CROUCH_H: 1.1, EYE_STAND: 1.62, EYE_CROUCH: 0.95, WALKABLE: 0.7,
      };
      const height = (st) => (st.crouch ? P.CROUCH_H : P.STAND_H);
      // 掃引: 足もとの点が a から b へ動くとき、体の箱が最初に当たる割合 t（0〜1）と、当たった面の外向きの向き n と、箱の番号 i。
      // 箱を体の大きさだけ太らせると（横は半分の幅、下は背の高さ）、体の箱の動きが、点の動きと箱の交わりの計算になる。
      // 面に触れているだけ（外側の面にちょうど乗っている）は当たりにしない。深く中にいる箱は無視する（抜け出せるように）
      function trace(boxes, a, b, crouch) {
        const H = crouch ? P.CROUCH_H : P.STAND_H, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        let best = { t: 1, n: [0, 0, 0], i: -1 };
        for (let i = 0; i < boxes.length; i++) {
          const B = boxes[i], lo = [B.min[0] - P.HALF, B.min[1] - H, B.min[2] - P.HALF], hi = [B.max[0] + P.HALF, B.max[1], B.max[2] + P.HALF];
          let t0 = -Infinity, t1 = Infinity, axis = -1, sgn = 0, miss = false;
          for (let k = 0; k < 3; k++) {
            if (Math.abs(d[k]) < 1e-12) { if (a[k] <= lo[k] || a[k] >= hi[k]) { miss = true; break; } continue; }
            let ta = (lo[k] - a[k]) / d[k], tb = (hi[k] - a[k]) / d[k], s = -1;
            if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
            if (ta > t0) { t0 = ta; axis = k; sgn = s; }
            if (tb < t1) t1 = tb;
          }
          if (miss || t0 >= t1 || t1 <= 0 || t0 < -1e-6 || axis < 0) continue;
          const t = Math.max(0, t0);
          if (t < best.t) { const n = [0, 0, 0]; n[axis] = sgn; best = { t, n, i }; }
        }
        return best;
      }
      // 撃つ: 光線と箱（太らせない）の交わり。いちばん近い箱の番号 i と距離 t（当たらなければ i = -1）
      function rayBoxes(boxes, o, d, maxT) {
        let best = { t: maxT, i: -1 };
        for (let i = 0; i < boxes.length; i++) {
          const B = boxes[i]; let t0 = -Infinity, t1 = Infinity, miss = false;
          for (let k = 0; k < 3; k++) {
            if (Math.abs(d[k]) < 1e-12) { if (o[k] < B.min[k] || o[k] > B.max[k]) { miss = true; break; } continue; }
            let ta = (B.min[k] - o[k]) / d[k], tb = (B.max[k] - o[k]) / d[k];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          }
          if (!miss && t0 <= t1 && t0 > 0 && t0 < best.t) best = { t: t0, i };
        }
        return best;
      }
      // 地上の摩擦: 速さから「速さと止まる目安の大きい方 × 摩擦 × 時間」を引く（ゆっくりのときも、すぐ止まる）
      function friction(v, dt) {
        const s = Math.hypot(v[0], v[2]); if (s < 1e-9) return;
        const k = Math.max(0, s - Math.max(s, P.STOP) * P.FRICTION * dt) / s; v[0] *= k; v[2] *= k;
      }
      // 加速: 向き dir の速さが目標に届くまで足す。空中は目標を cap までに抑えるが、1 コマに足せる量は地上と同じ
      // （進む向きと直角に入力すると、cap 以下の速さの成分を毎コマ足せるので、曲がりながら速くなれる）
      function accelerate(v, dir, wish, accel, dt, cap) {
        const target = cap === undefined ? wish : Math.min(cap, wish), add = target - (v[0] * dir[0] + v[2] * dir[2]);
        if (add <= 0) return;
        const acc = Math.min(accel * wish * dt, add); v[0] += dir[0] * acc; v[2] += dir[2] * acc;
      }
      // 滑る動き: 当たったら当たった所まで進み、面に向かう速さの成分だけを消して、残りの時間で動く（4 回まで）
      function slide(boxes, p, v, dt, crouch) {
        let left = 1, blocked = false;
        for (let it = 0; it < 4; it++) {
          if (v[0] * v[0] + v[1] * v[1] + v[2] * v[2] < 1e-12) break;
          const end = [p[0] + v[0] * dt * left, p[1] + v[1] * dt * left, p[2] + v[2] * dt * left], h = trace(boxes, p, end, crouch);
          for (let k = 0; k < 3; k++) p[k] += (end[k] - p[k]) * h.t;
          if (h.t >= 1) break;
          blocked = true;
          const vn = v[0] * h.n[0] + v[1] * h.n[1] + v[2] * h.n[2];
          if (vn < 0) for (let k = 0; k < 3; k++) v[k] -= vn * h.n[k];
          left *= 1 - h.t;
        }
        return { p, v, blocked };
      }
      // 足もとを調べる: 少し下に、歩ける傾きの面があれば地上。足を面の高さにそろえる
      function groundCheck(st, boxes) {
        if (st.v[1] > 0) { st.ground = false; return; }
        const h = trace(boxes, st.p, [st.p[0], st.p[1] - 0.05, st.p[2]], st.crouch);
        if (h.t < 1 && h.n[1] >= P.WALKABLE) { st.ground = true; st.p[1] = boxes[h.i].max[1]; st.v[1] = 0; } else st.ground = false;
      }
      // 動く: まず滑る。地上で何かに当たったら、段差の高さだけ持ち上げて滑り、下ろしてみて、遠くまで進めた方を採る
      function move(st, boxes, dt) {
        const from = st.p.slice(), v0 = st.v.slice(), A = slide(boxes, st.p.slice(), st.v.slice(), dt, st.crouch);
        if (A.blocked && st.ground) {
          const up = trace(boxes, from, [from[0], from[1] + P.STEP, from[2]], st.crouch);
          const B = slide(boxes, [from[0], from[1] + P.STEP * up.t, from[2]], v0.slice(), dt, st.crouch);
          const dn = trace(boxes, B.p, [B.p[0], B.p[1] - P.STEP - 0.05, B.p[2]], st.crouch);
          if (dn.t < 1 && dn.n[1] >= P.WALKABLE) {
            B.p[1] -= (P.STEP + 0.05) * dn.t;
            if (Math.hypot(B.p[0] - from[0], B.p[2] - from[2]) > Math.hypot(A.p[0] - from[0], A.p[2] - from[2]) + 1e-6) { st.p = B.p; st.v = [B.v[0], A.v[1], B.v[2]]; return; }
          }
        }
        st.p = A.p; st.v = A.v;
      }
      const spawn = (p) => ({ p: p.slice(), v: [0, 0, 0], ground: false, crouch: false, jumpHeld: false });
      // 1 刻み（1/120 秒）。input: fwd・side（-1〜1）、jump・crouch（真偽）、yaw（向き。0 で +z、増やすと右へ回る）
      function tick(st, input, boxes) {
        const dt = P.TICK;
        if (input.crouch && !st.crouch) st.crouch = true;
        else if (!input.crouch && st.crouch && trace(boxes, st.p, [st.p[0], st.p[1] + P.STAND_H - P.CROUCH_H, st.p[2]], true).t >= 1) st.crouch = false;
        groundCheck(st, boxes);
        if (st.ground) friction(st.v, dt);
        const yaw = input.yaw || 0, fw = Math.max(-1, Math.min(1, input.fwd || 0)), sd = Math.max(-1, Math.min(1, input.side || 0));
        const w = [Math.sin(yaw) * fw + Math.cos(yaw) * sd, 0, Math.cos(yaw) * fw - Math.sin(yaw) * sd], m = Math.hypot(w[0], w[2]);
        if (m > 1e-9) accelerate(st.v, [w[0] / m, 0, w[2] / m], Math.min(1, m) * (st.crouch ? P.CROUCH_SPEED : P.SPEED), P.ACCEL, dt, st.ground ? undefined : P.AIR_CAP);
        if (input.jump && st.ground && !st.jumpHeld) { st.v[1] = Math.sqrt(2 * P.G * P.JUMP_H); st.ground = false; }
        st.jumpHeld = !!input.jump;
        // 重力は、動く前と後に半分ずつ当てる（一定の加速なら、位置が正しく出る。跳ぶ高さが刻みでずれない）
        if (!st.ground) st.v[1] -= P.G * dt / 2;
        move(st, boxes, dt);
        if (!st.ground) st.v[1] -= P.G * dt / 2;
        groundCheck(st, boxes);
        return st;
      }
      return { P, height, trace, rayBoxes, friction, accelerate, slide, spawn, tick };
    })();
  },
  js() {
    const dlog = (ev, args, res) => console.info('[dlog] ' + ev + ' ' + JSON.stringify(args) + ' ' + res);
    const c = document.getElementById('c'), gl = c.getContext('webgl2', { antialias: false });
    if (!gl) { dlog('fps.error', { why: 'webgl2' }, 'ng'); document.body.textContent = 'この見本には WebGL2 が必要です。'; throw new Error('WebGL2 が使えません'); }
    if (window.THUMB) document.body.classList.add('thumb');
    const P = FP.P;
    // 場面（オリジナルの中庭）。地面・壁・高台・階段・木箱・トンネル・的は全部、箱 [最小の角, 最大の角, 材質]
    // 材質: 0 砂 1 砂岩の壁 2 石の高台 3 木箱 4 的 5 当たった的 6 青い板
    const B = (x0, y0, z0, x1, y1, z1, m) => ({ min: [x0, y0, z0], max: [x1, y1, z1], m });
    const LEVEL = [
      B(-16, -1, -16, 16, 0, 16, 0),
      B(-16, 0, -16, 16, 5, -15, 1), B(-16, 0, 15, 16, 5, 16, 1), B(-16, 0, -15, -15, 5, 15, 1), B(15, 0, -15, 16, 5, 15, 1),
      B(-4, 0, 3, 4, 1.5, 9, 2),
      ...[1, 2, 3, 4, 5, 6].map((k) => B(-1.5, 0, 3 - 0.5 * (7 - k), 1.5, 0.25 * k, 3 - 0.5 * (6 - k), 2)),
      B(-11, 0, -7, -10, 1, -6, 3), B(-10, 0, -7, -9, 1, -6, 3), B(-11, 1, -7, -10, 2, -6, 3), B(-11, 0, -6, -10, 1, -5, 3),
      B(8, 0, 5, 9.2, 1.2, 6.2, 3), B(9.2, 0, 5.4, 10.2, 1, 6.4, 3),
      B(5, 0, -10, 8, 3, -9, 1), B(10, 0, -10, 13, 3, -9, 1), B(8, 1.2, -10, 10, 3, -9, 1),
      B(-8, 0, 9, -7, 4, 10, 1), B(7, 0, -3, 8, 4, -2, 1), B(-15, 0, -2, -9, 1.1, -1.6, 1),
      B(-3, 1.5, 8.6, 3, 2.6, 9, 6),
      B(-6, 2, 14.85, -5.4, 2.6, 15, 4), B(5, 1.4, 14.85, 5.6, 2.0, 15, 4), B(14.85, 2, -6, 15, 2.6, -5.4, 4),
      B(-15, 1.5, 4, -14.85, 2.1, 4.6, 4), B(10.6, 3.2, -10.15, 11.2, 3.8, -10, 4), B(-0.3, 1.9, 8.45, 0.3, 2.5, 8.6, 4),
    ];
    const boxes = LEVEL.map((b) => ({ ...b, min: b.min.slice(), max: b.max.slice() }));
    const TARGETS = boxes.filter((b) => b.m === 4).length;
    const fs = `#version 300 es
precision highp float;
uniform vec2 R; uniform vec3 EYE, CF, CR, CU; uniform int N; uniform vec3 BMIN[${boxes.length}], BMAX[${boxes.length}]; uniform int BMAT[${boxes.length}];
out vec4 O;
const vec3 SUN = vec3(${(() => { const v = [0.45, 0.8, 0.35], l = Math.hypot(...v); return v.map((x) => (x / l).toFixed(5)).join(', '); })()});
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
// 光線と箱の交わり（箱の外から入る距離と、入った面の向き）
bool hitBox(vec3 ro, vec3 inv, vec3 sg, vec3 lo, vec3 hi, out float t, out vec3 n) {
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv, tn3 = min(a, b), tf3 = max(a, b);
  float tn = max(max(tn3.x, tn3.y), tn3.z), tf = min(min(tf3.x, tf3.y), tf3.z);
  if (tn > tf || tn <= 0.0) return false;
  t = tn; n = tn == tn3.x ? vec3(-sg.x, 0, 0) : tn == tn3.y ? vec3(0, -sg.y, 0) : vec3(0, 0, -sg.z);
  return true;
}
int trace(vec3 ro, vec3 rd, out float tBest, out vec3 nBest) {
  vec3 inv = 1.0 / rd, sg = sign(rd); int hit = -1; tBest = 1e9;
  for (int i = 0; i < ${boxes.length}; i++) {
    if (i >= N) break;
    float t; vec3 n;
    if (hitBox(ro, inv, sg, BMIN[i], BMAX[i], t, n) && t < tBest) { tBest = t; nBest = n; hit = i; }
  }
  return hit;
}
// 影: 太陽へ向かう光線が、どれかの箱に当たるか
float shadow(vec3 p) {
  vec3 inv = 1.0 / SUN, sg = sign(SUN);
  for (int i = 0; i < ${boxes.length}; i++) { if (i >= N) break; float t; vec3 n; if (hitBox(p, inv, sg, BMIN[i], BMAX[i], t, n)) return 0.0; }
  return 1.0;
}
vec3 sky(vec3 rd) {
  float y = max(rd.y, 0.0), mu = max(dot(rd, SUN), 0.0);
  return mix(vec3(0.8, 0.78, 0.74), vec3(0.22, 0.42, 0.8), pow(y, 0.45)) + vec3(1.0, 0.85, 0.6) * pow(mu, 300.0) * 6.0 + vec3(1.0, 0.8, 0.55) * pow(mu, 8.0) * 0.25;
}
// 材質ごとの色（面の上の位置から、模様を作る）
vec3 albedo(int i, int m, vec3 p, vec3 n) {
  vec2 uv = abs(n.y) > 0.5 ? p.xz : abs(n.x) > 0.5 ? p.zy : p.xy;
  if (m == 0) { float r = 0.5 + 0.5 * sin(p.x * 3.0 + noise(p.xz * 0.7) * 6.0); return vec3(0.7, 0.55, 0.37) * (0.82 + 0.25 * noise(p.xz * 3.0) + 0.05 * r); }
  if (m == 1 || m == 2) {
    vec2 b = uv * vec2(1.0, 2.0); b.x += 0.5 * floor(b.y);
    vec2 f = fract(b); float mortar = step(f.x, 0.04) + step(f.y, 0.06);
    vec3 base = m == 1 ? vec3(0.8, 0.64, 0.45) : vec3(0.58, 0.52, 0.46);
    return base * (0.85 + 0.2 * hash(floor(b))) * (1.0 - 0.35 * min(1.0, mortar)) * (0.9 + 0.15 * noise(uv * 6.0));
  }
  if (m == 3) { float pl = fract(uv.y * 4.0); vec3 lo = BMIN[i], hi = BMAX[i]; float edge = min(min(abs(uv.x - (abs(n.x) > 0.5 ? lo.z : lo.x)), abs(uv.x - (abs(n.x) > 0.5 ? hi.z : hi.x))), min(abs(uv.y - (abs(n.y) > 0.5 ? lo.z : lo.y)), abs(uv.y - (abs(n.y) > 0.5 ? hi.z : hi.y))));
    return vec3(0.58, 0.4, 0.22) * (0.8 + 0.25 * noise(vec2(uv.x * 30.0, floor(uv.y * 4.0)))) * (pl < 0.06 ? 0.6 : 1.0) * (edge < 0.08 ? 0.7 : 1.0); }
  if (m == 4) { vec3 cc = (BMIN[i] + BMAX[i]) * 0.5; float r = length((p - cc) - dot(p - cc, n) * n); return fract(r * 8.0) < 0.5 ? vec3(0.85, 0.12, 0.1) : vec3(0.95); }
  if (m == 5) return vec3(0.3);
  return vec3(0.22, 0.34, 0.58) * (0.9 + 0.1 * noise(uv * 4.0));
}
vec3 aces(vec3 x) { return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * R) / R.y;
  vec3 rd = normalize(CF * 1.25 + CR * uv.x + CU * uv.y);
  rd = mix(rd, vec3(1e-5), lessThan(abs(rd), vec3(1e-5)));
  float t; vec3 n; int i = trace(EYE, rd, t, n);
  vec3 col;
  if (i < 0) col = sky(rd);
  else {
    vec3 p = EYE + rd * t, a = albedo(i, BMAT[i], p, n);
    float sh = shadow(p + n * 0.002), dif = max(dot(n, SUN), 0.0);
    // 壁ぎわを少し暗くする（床から近いほど、空から届く光が少ない）
    float occ = 0.55 + 0.45 * clamp(p.y * 0.6 + 0.4, 0.0, 1.0);
    // 日なた（太陽）＋空からの光＋砂の照り返し（横と下を向いた面ほど受ける。日陰の壁が灰色にならない）
    col = a * (vec3(1.0, 0.9, 0.74) * 3.0 * dif * sh + vec3(0.36, 0.45, 0.62) * (0.5 + 0.3 * n.y) * occ + vec3(0.8, 0.6, 0.38) * 0.42 * (0.6 - 0.4 * n.y) * occ);
    col = mix(col, sky(normalize(vec3(rd.x, 0.05, rd.z))), 1.0 - exp(-t * 0.006));
  }
  O = vec4(pow(aces(col * 0.62), vec3(1.0 / 2.2)), 1.0);
}`;
    let pg;
    try {
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      pg = gl.createProgram();
      gl.attachShader(pg, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }'));
      gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pg);
      if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pg));
      gl.useProgram(pg);
    } catch (err) { dlog('fps.error', { why: 'shader', msg: String(err.message).slice(0, 300) }, 'ng'); throw err; }
    const U = (n) => gl.getUniformLocation(pg, n);
    const u = { R: U('R'), EYE: U('EYE'), CF: U('CF'), CR: U('CR'), CU: U('CU'), N: U('N'), BMIN: U('BMIN'), BMAX: U('BMAX'), BMAT: U('BMAT') };
    const uploadBoxes = () => {
      gl.uniform1i(u.N, boxes.length);
      gl.uniform3fv(u.BMIN, boxes.flatMap((b) => b.min)); gl.uniform3fv(u.BMAX, boxes.flatMap((b) => b.max)); gl.uniform1iv(u.BMAT, boxes.map((b) => b.m));
    };
    uploadBoxes();
    // 状態
    const SPAWN = [0, 0, -12];
    let st = FP.spawn(SPAWN), prev = st.p.slice(), yaw = 0, pitch = -0.05, eyeH = P.EYE_STAND, hits = 0, ticks = 0, acc = 0, last = null, showHull = true;
    const keys = new Set(), pad = new Set();
    const map = document.getElementById('map'), mg = map.getContext('2d'), hud = document.getElementById('hud');
    // 入力: 画面を押すと視点を固定（Pointer Lock）。固定できない所では、ドラッグで向きを変える
    let locked = false, drag = null;
    c.addEventListener('click', () => {
      if (window.THUMB) return;
      if (!locked && c.requestPointerLock) { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => dlog('fps.lock', { ok: false }, 'ng')); return; }
      if (locked) shoot();
    });
    document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === c; dlog('fps.lock', { locked }, 'ok'); });
    addEventListener('mousemove', (e) => { if (!locked) return; yaw += e.movementX * 0.0022; pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY * 0.0022)); });
    c.addEventListener('pointerdown', (e) => { if (!locked && e.pointerType !== 'mouse') { drag = { x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); } });
    c.addEventListener('pointermove', (e) => { if (!drag) return; yaw += (e.clientX - drag.x) * 0.006; pitch = Math.max(-1.45, Math.min(1.45, pitch - (e.clientY - drag.y) * 0.006)); drag = { x: e.clientX, y: e.clientY }; });
    const endDrag = () => { drag = null; }; c.addEventListener('pointerup', endDrag); c.addEventListener('pointercancel', endDrag);
    const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyC', 'KeyF'];
    addEventListener('keydown', (e) => {
      if (!GAME_KEYS.includes(e.code) || e.target.closest?.('button, summary, a')) return;
      e.preventDefault(); keys.add(e.code); if (e.code === 'KeyF' && !e.repeat) shoot();
    });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('blur', () => { keys.clear(); pad.clear(); });
    for (const b of document.querySelectorAll('.pad button')) {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (k === 'shoot') shoot(); else pad.add(k); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => pad.delete(k));
    }
    const hullBtn = document.getElementById('hull');
    hullBtn.addEventListener('click', () => { showHull = !showHull; hullBtn.setAttribute('aria-pressed', String(showHull)); dlog('fps.hull', { on: showHull }, 'ok'); });
    document.getElementById('reset').addEventListener('click', () => {
      st = FP.spawn(SPAWN); prev = st.p.slice(); yaw = 0; pitch = -0.05; hits = 0;
      boxes.forEach((b, i) => { b.m = LEVEL[i].m; }); uploadBoxes(); dlog('fps.reset', {}, 'ok');
    });
    const basis = () => {
      const cp = Math.cos(pitch);
      const F = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp], Rt = [Math.cos(yaw), 0, -Math.sin(yaw)];
      return { F, R: Rt, U: [F[1] * Rt[2] - F[2] * Rt[1], F[2] * Rt[0] - F[0] * Rt[2], F[0] * Rt[1] - F[1] * Rt[0]] };
    };
    const eye = (a) => [prev[0] + (st.p[0] - prev[0]) * a, prev[1] + (st.p[1] - prev[1]) * a + eyeH, prev[2] + (st.p[2] - prev[2]) * a];
    function shoot() {
      const { F } = basis(), o = eye(1), r = FP.rayBoxes(boxes, o, F, 100), b = boxes[r.i];
      const hit = !!b && b.m === 4;
      if (hit) { b.m = 5; hits++; uploadBoxes(); }
      dlog('fps.shot', { box: r.i, dist: +r.t.toFixed(2), hit, hits }, 'ok');
    }
    function inputNow() {
      const k = (...codes) => codes.some((x) => keys.has(x));
      return {
        fwd: (k('KeyW', 'ArrowUp') || pad.has('fwd') ? 1 : 0) - (k('KeyS', 'ArrowDown') || pad.has('back') ? 1 : 0),
        side: (k('KeyD', 'ArrowRight') || pad.has('right') ? 1 : 0) - (k('KeyA', 'ArrowLeft') || pad.has('left') ? 1 : 0),
        jump: k('Space') || pad.has('jump'), crouch: k('KeyC') || pad.has('crouch'), yaw,
      };
    }
    // 地図: 箱を上から描き、太らせた壁を点線で重ねる
    function drawMap() {
      const W = map.width, S = W / 34, X = (x) => W / 2 + x * S, Z = (z) => W / 2 - z * S;
      mg.clearRect(0, 0, W, W);
      for (const b of boxes) {
        if (b.max[1] <= 0) continue;
        mg.fillStyle = b.m === 4 ? '#e2463b' : b.m === 5 ? '#666' : b.max[1] - Math.max(0, b.min[1]) > 2 ? '#b9a98c' : '#80735e';
        mg.fillRect(X(b.min[0]), Z(b.max[2]), (b.max[0] - b.min[0]) * S, (b.max[2] - b.min[2]) * S);
      }
      if (showHull) {
        mg.setLineDash([3, 3]); mg.strokeStyle = 'rgba(140,200,255,.9)'; mg.lineWidth = 1;
        for (const b of boxes) {
          if (b.max[1] <= 0 || b.max[1] <= st.p[1] + P.STEP + 1e-6 || b.min[1] >= st.p[1] + FP.height(st)) continue;   // いまの高さで当たる箱だけ
          mg.strokeRect(X(b.min[0] - P.HALF), Z(b.max[2] + P.HALF), (b.max[0] - b.min[0] + 2 * P.HALF) * S, (b.max[2] - b.min[2] + 2 * P.HALF) * S);
        }
        mg.setLineDash([]);
      }
      const px = X(st.p[0]), pz = Z(st.p[2]);
      mg.strokeStyle = '#ffd34d'; mg.beginPath(); mg.moveTo(px, pz); mg.lineTo(px + Math.sin(yaw) * 14, pz - Math.cos(yaw) * 14); mg.stroke();
      mg.fillStyle = '#ffd34d'; mg.beginPath(); mg.arc(px, pz, 3, 0, Math.PI * 2); mg.fill();
    }
    const gaps = []; let frames = 0; const t0 = performance.now();
    window.__fps = { get st() { return st; }, set: (o) => { if (o.p) { st.p = o.p.slice(); prev = o.p.slice(); } if (o.yaw != null) yaw = o.yaw; if (o.pitch != null) pitch = o.pitch; if (o.crouch != null) st.crouch = o.crouch; }, shoot, perf: () => { const a = [...gaps].sort((x, y) => x - y); return { n: a.length, mean: a.reduce((x, y) => x + y, 0) / (a.length || 1), p95: a[Math.floor(a.length * 0.95)] || 0, w: c.width, h: c.height }; } };
    function frame(now) {
      const dt = last == null ? 0 : Math.min(0.1, (now - last) / 1000); last = now;
      // 動きは、描くコマとは別に、決まった刻み（1/120 秒）で進める
      if (!window.THUMB) {
        acc += dt;
        const input = inputNow();
        while (acc >= P.TICK) { prev = st.p.slice(); FP.tick(st, input, boxes); acc -= P.TICK; ticks++; }
      }
      const alpha = window.THUMB ? 1 : acc / P.TICK;
      eyeH += ((st.crouch ? P.EYE_CROUCH : P.EYE_STAND) - eyeH) * Math.min(1, dt * 14);
      const q = window.THUMB ? 0.5 : Math.min(1, 720 / Math.max(1, innerHeight));
      const w = Math.max(1, Math.round(innerWidth * q)), h = Math.max(1, Math.round(innerHeight * q));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      const { F, R, U: Up } = basis();
      gl.uniform2f(u.R, w, h); gl.uniform3fv(u.EYE, eye(alpha)); gl.uniform3fv(u.CF, F); gl.uniform3fv(u.CR, R); gl.uniform3fv(u.CU, Up);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!window.THUMB) {
        drawMap();
        const sp = Math.hypot(st.v[0], st.v[2]);
        hud.textContent = `速さ ${sp.toFixed(2)} m/秒　${st.ground ? '地上' : '空中'}${st.crouch ? '・しゃがみ' : ''}\n的 ${hits} / ${TARGETS}　刻み ${ticks}`;
      }
      if (dt > 0) { gaps.push(dt * 1000); if (gaps.length > 240) gaps.shift(); }
      if (++frames === 30) dlog('fps.ready', { ms: Math.round(performance.now() - t0), boxes: boxes.length, w, h }, 'ok');
      if (frames === 300) { const pf = window.__fps.perf(); dlog('fps.perf', { mean: +pf.mean.toFixed(1), p95: +pf.p95.toFixed(1), w, h }, 'ok'); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  },
});
