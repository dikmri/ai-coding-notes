/* 便利道具 */
dekiru.add({
  id: 'ut-stopwatch', c: 'util', lv: 1,
  t: 'ストップウォッチ', y: 'すとっぷうぉっち',
  tags: ['タイマー', 'performance.now', 'ラップ', '時間'],
  d: '開始・一時停止・ラップ・リセットができる。時間は performance.now() で測るので、画面の書き換えが遅れても計測そのものはずれない。',
  html: `<div class="w"><output id="o">00:00.00</output><div class="bar"><button id="ss">開始</button><button id="lap" disabled>ラップ</button><button id="rs">リセット</button></div><ol id="laps" reversed></ol></div>`,
  css: `body { display: grid; place-items: center; background: #101418; color: #e6edf3; } .w { text-align: center; } output { display: block; font: 300 16vmin/1 ui-monospace, Consolas, monospace; font-variant-numeric: tabular-nums; } .bar { display: flex; gap: 8px; justify-content: center; margin: 12px 0; } ol { font: 14px ui-monospace, monospace; max-height: 30vh; overflow: auto; text-align: left; }`,
  js() {
    let start = 0, acc = 0, running = false, lastLap = 0;
    const o = document.getElementById('o'), ss = document.getElementById('ss');
    const fmt = (ms) => { const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), cs = Math.floor((ms % 1000) / 10); return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`; };
    const now = () => acc + (running ? performance.now() - start : 0);
    ss.onclick = () => { if (running) { acc = now(); running = false; ss.textContent = '再開'; } else { start = performance.now(); running = true; ss.textContent = '一時停止'; } document.getElementById('lap').disabled = !running; };
    document.getElementById('lap').onclick = () => { const t = now(); const li = document.createElement('li'); li.textContent = `${fmt(t)}（+${fmt(t - lastLap)}）`; lastLap = t; document.getElementById('laps').prepend(li); };
    document.getElementById('rs').onclick = () => { acc = 0; lastLap = 0; running = false; ss.textContent = '開始'; document.getElementById('laps').innerHTML = ''; document.getElementById('lap').disabled = true; };
    (function loop() { o.textContent = fmt(now()); requestAnimationFrame(loop); })();
    if (window.THUMB) ss.click();
  },
}, {
  id: 'ut-pomodoro', c: 'util', lv: 2,
  t: 'ポモドーロタイマー', y: 'ぽもどーろたいまー',
  tags: ['タイマー', '集中', 'conic-gradient', 'Web Audio'],
  d: '25分集中して5分休む、を繰り返すタイマー。残り時間を円の減り具合とタブの題名に出し、切り替わるときに音で知らせる。',
  html: `<div class="ring" id="ring"><div><b id="mode">集中</b><output id="o">25:00</output></div></div><div class="bar"><button id="go">開始</button><button id="skip">次へ</button><label><input type="checkbox" id="fast"> 早回し（確認用）</label></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 14px; background: #fdf3ec; } .ring { --p: 1; --c: #e0532f; width: min(64vmin, 320px); aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--c) calc(var(--p) * 360deg), #f1ddd0 0); } .ring > div { width: 82%; aspect-ratio: 1; border-radius: 50%; background: #fdf3ec; display: grid; place-content: center; text-align: center; } output { font: 700 12vmin ui-monospace, monospace; } b { color: var(--c); } .bar { display: flex; gap: 8px; align-items: center; font-size: 13px; }`,
  js() {
    const ring = document.getElementById('ring');
    let mode = 'work', left = 25 * 60, total = left, timer = 0, ac;
    const beep = () => { ac = ac || new AudioContext(); [0, 0.25, 0.5].forEach((d) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.2, ac.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d + 0.2); o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + d); o.stop(ac.currentTime + d + 0.2); }); };
    function show() {
      const t = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
      document.getElementById('o').textContent = t; document.getElementById('mode').textContent = mode === 'work' ? '集中' : '休憩';
      ring.style.setProperty('--p', left / total); ring.style.setProperty('--c', mode === 'work' ? '#e0532f' : '#2f855a');
      document.title = `${t} ${mode === 'work' ? '集中' : '休憩'}`;
    }
    function next() { mode = mode === 'work' ? 'rest' : 'work'; left = total = (mode === 'work' ? 25 : 5) * 60; beep(); show(); }
    document.getElementById('go').onclick = (e) => {
      if (timer) { clearInterval(timer); timer = 0; e.target.textContent = '開始'; return; }
      timer = setInterval(() => { left -= document.getElementById('fast').checked ? 30 : 1; if (left <= 0) next(); show(); }, 1000);
      e.target.textContent = '一時停止';
    };
    document.getElementById('skip').onclick = next;
    show();
    if (window.THUMB) { document.getElementById('fast').checked = true; document.getElementById('go').click(); }
  },
}, {
  id: 'ut-calculator', c: 'util', lv: 3,
  t: '電卓（自前の数式の読み取り）', y: 'でんたくじまえのすうしきのよみとり',
  tags: ['電卓', '構文解析', '操車場アルゴリズム', 'キーボード操作'],
  d: 'ボタンでもキーボードでも打てる電卓。eval を使わず、数式を「数」と「記号」に分け、掛け算を足し算より先にする規則に沿って計算する（操車場アルゴリズム）。',
  p: '文字列をそのまま eval に渡すと、数式以外のコードも実行できてしまう。自分で読み取れば安全。',
  html: `<div class="calc"><div class="disp"><small id="hist"></small><output id="o">0</output></div><div class="keys" id="keys"></div></div>`,
  css: `body { display: grid; place-items: center; background: #e8e6e1; } .calc { width: min(320px, 92vw); background: #22252b; border-radius: 22px; padding: 16px; box-shadow: 0 10px 30px #0004; } .disp { text-align: right; color: #fff; padding: 6px 4px 12px; } .disp small { display: block; color: #8a919c; min-height: 1.3em; font: 13px ui-monospace, monospace; } output { font: 300 36px ui-monospace, monospace; word-break: break-all; } .keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .keys button { height: 56px; border-radius: 14px; border: 0; font: 600 20px sans-serif; background: #3a3f48; color: #fff; } .keys .op { background: #e0532f; } .keys .fn { background: #5c6370; } .keys .eq { grid-column: span 2; background: #2f855a; }`,
  js() {
    const KEYS = [['C', 'fn'], ['(', 'fn'], [')', 'fn'], ['÷', 'op'], ['7'], ['8'], ['9'], ['×', 'op'], ['4'], ['5'], ['6'], ['−', 'op'], ['1'], ['2'], ['3'], ['+', 'op'], ['0'], ['.'], ['=', 'eq']];
    const keys = document.getElementById('keys'), o = document.getElementById('o');
    let expr = '';
    KEYS.forEach(([k, cls]) => { const b = document.createElement('button'); b.textContent = k; if (cls) b.className = cls; b.onclick = () => press(k); keys.append(b); });
    function evaluate(s) {
      const toks = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').match(/\d+\.?\d*|\.\d+|[-+*/()]/g) || [];
      const out = [], ops = [], prec = { '+': 1, '-': 1, '*': 2, '/': 2, u: 3 };
      let prev = null;
      for (const t of toks) {
        if (/[\d.]/.test(t)) out.push(parseFloat(t));
        else if (t === '(') ops.push(t);
        else if (t === ')') { while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()); ops.pop(); }
        else { const op = t === '-' && (prev === null || /[-+*/(]/.test(prev)) ? 'u' : t; while (ops.length && ops[ops.length - 1] !== '(' && prec[ops[ops.length - 1]] >= prec[op] && op !== 'u') out.push(ops.pop()); ops.push(op); }
        prev = t;
      }
      while (ops.length) out.push(ops.pop());
      const st = [];
      for (const t of out) {
        if (typeof t === 'number') st.push(t);
        else if (t === 'u') st.push(-st.pop());
        else { const b = st.pop(), a = st.pop(); if (a === undefined || b === undefined) throw new Error('式が途中です'); st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : a / b); }
      }
      if (st.length !== 1 || !isFinite(st[0])) throw new Error('計算できません');
      return +st[0].toPrecision(12);
    }
    function press(k) {
      if (k === 'C') expr = '';
      else if (k === '=') { try { const r = evaluate(expr); document.getElementById('hist').textContent = expr + ' ='; expr = String(r); } catch (e) { document.getElementById('hist').textContent = e.message; } }
      else expr += k;
      o.textContent = expr || '0';
    }
    addEventListener('keydown', (e) => { const map = { '*': '×', '/': '÷', '-': '−', Enter: '=', Escape: 'C', Backspace: 'BS' }; const k = map[e.key] || e.key; if (k === 'BS') { expr = expr.slice(0, -1); o.textContent = expr || '0'; return; } if (/^[0-9.()+=C×÷−]$/.test(k)) { e.preventDefault(); press(k); } });
    if (window.THUMB) { const seq = [...'12×(3+4)−5=']; let i = 0; setInterval(() => { if (i >= seq.length) { i = 0; press('C'); } else press(seq[i++].replace('-', '−')); }, 300); }
  },
}, {
  id: 'ut-new-year-countdown', c: 'util', lv: 1,
  t: '年越しまでのカウントダウン', y: 'としこしまでのかうんとだうん',
  tags: ['カウントダウン', 'Date', '残り時間', 'お正月'],
  d: '次の元日の0時までの残りを、日・時・分・秒で数える。数字が変わるたびにぱたんとめくれる。日付の引き算だけで残り時間が求まる。',
  html: `<h1 id="ttl"></h1><div class="cd" id="cd"></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 2vmin; background: radial-gradient(#3a1018, #12060a); color: #fff; } h1 { margin: 0; font: 700 4vmin serif; color: #ffd27a; } .cd { display: flex; gap: 2vmin; } .u { display: grid; justify-items: center; gap: 1vmin; } .u b { min-width: 2.2ch; padding: 1vmin 1.6vmin; border-radius: 1.4vmin; background: linear-gradient(#2a2a2a 50%, #1c1c1c 50%); font: 800 11vmin/1 ui-monospace, monospace; text-align: center; box-shadow: 0 1vmin 2vmin #0008; } .u b.flip { animation: flip .35s ease-out; } @keyframes flip { from { transform: perspective(300px) rotateX(-80deg); } } .u span { font-size: 3vmin; color: #ccc; }`,
  js() {
    const cd = document.getElementById('cd'), labels = ['日', '時間', '分', '秒'];
    cd.innerHTML = labels.map((l) => `<div class="u"><b>--</b><span>${l}</span></div>`).join('');
    const bs = [...cd.querySelectorAll('b')];
    (function tick() {
      const now = new Date(), target = new Date(now.getFullYear() + 1, 0, 1);
      document.getElementById('ttl').textContent = `${target.getFullYear()}年 元日まで`;
      let s = Math.floor((target - now) / 1000);
      const vals = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
      vals.forEach((v, i) => { const t = String(v).padStart(2, '0'); if (bs[i].textContent !== t) { bs[i].textContent = t; bs[i].classList.remove('flip'); bs[i].offsetWidth; bs[i].classList.add('flip'); } });
      setTimeout(tick, 1000 - (Date.now() % 1000));
    })();
  },
}, {
  id: 'ut-world-clock', c: 'util', lv: 2,
  t: '世界時計', y: 'せかいどけい',
  tags: ['タイムゾーン', 'Intl.DateTimeFormat', '時差', '昼夜'],
  d: '東京・ロンドン・ニューヨークなど世界の街の今の時刻を、Intl.DateTimeFormat の timeZone 指定で並べる。夏時間も自動で反映される。昼か夜かで札の色を変え、東京との時差も出す。',
  html: `<div class="grid" id="g"></div>`,
  css: `body { padding: 10px; background: #e9edf2; } .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; } .city { padding: 12px; border-radius: 14px; color: #fff; } .city.day { background: linear-gradient(135deg, #58a6ff, #8fd3ff); color: #102030; } .city.night { background: linear-gradient(135deg, #1b2440, #3b3f7a); } .city b { display: block; font: 700 14px sans-serif; } .city time { font: 700 30px ui-monospace, monospace; } .city small { display: block; opacity: .8; font-size: 12px; }`,
  js() {
    const cities = [['東京', 'Asia/Tokyo'], ['ソウル', 'Asia/Seoul'], ['ニューデリー', 'Asia/Kolkata'], ['ドバイ', 'Asia/Dubai'], ['カイロ', 'Africa/Cairo'], ['パリ', 'Europe/Paris'], ['ロンドン', 'Europe/London'], ['サンパウロ', 'America/Sao_Paulo'], ['ニューヨーク', 'America/New_York'], ['ロサンゼルス', 'America/Los_Angeles'], ['ホノルル', 'Pacific/Honolulu'], ['シドニー', 'Australia/Sydney']];
    const g = document.getElementById('g');
    const offset = (tz, d) => { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(d).reduce((o, x) => ((o[x.type] = x.value), o), {}); return (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - Math.floor(d / 60000) * 60000) / 3600000; };
    function render() {
      const d = new Date(), base = offset('Asia/Tokyo', d);
      g.innerHTML = cities.map(([n, tz]) => {
        const h = +new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(d) % 24, diff = Math.round((offset(tz, d) - base) * 10) / 10;
        return `<div class="city ${h >= 6 && h < 18 ? 'day' : 'night'}"><b>${n}</b><time>${new Intl.DateTimeFormat('ja-JP', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d)}</time><small>${new Intl.DateTimeFormat('ja-JP', { timeZone: tz, month: 'long', day: 'numeric', weekday: 'short' }).format(d)} ・ 東京と ${diff === 0 ? '同じ' : (diff > 0 ? '+' : '') + diff + ' 時間'}</small></div>`;
      }).join('');
    }
    render(); setInterval(render, 1000);
  },
}, {
  id: 'ut-todo', c: 'util', lv: 2, so: 1,
  t: '保存されるやることリスト', y: 'ほぞんされるやることりすと',
  tags: ['ToDo', 'localStorage', '保存', 'フィルター'],
  d: 'やることを足し、済んだら印を付け、要らなくなったら消す。中身は localStorage に保存するので、ページを開き直しても残っている。「残り」「済み」で絞り込める。',
  html: `<div class="app"><form id="f"><input id="in" placeholder="やることを入力" aria-label="やること" autocomplete="off"><button>追加</button></form><div class="tabs" role="group" aria-label="絞り込み"><button data-f="all" aria-pressed="true">すべて</button><button data-f="open" aria-pressed="false">残り</button><button data-f="done" aria-pressed="false">済み</button></div><ul id="list"></ul><p id="n"></p></div>`,
  css: `body { display: grid; place-items: start center; padding-top: 4vh; background: #eef1f4; } .app { width: min(420px, 92vw); background: #fff; border-radius: 14px; padding: 14px; box-shadow: 0 2px 10px #0001; } form { display: flex; gap: 6px; } #in { flex: 1; } .tabs { display: flex; gap: 4px; margin: 8px 0; } [aria-pressed=true] { background: #26407c; color: #fff; } ul { list-style: none; padding: 0; margin: 0; } li { display: flex; align-items: center; gap: 8px; padding: 8px 4px; border-bottom: 1px solid #eee; } li.done span { text-decoration: line-through; color: #999; } li span { flex: 1; } li button { border: 0; background: none; color: #c23b22; } p { color: #666; font-size: 13px; margin: 8px 0 0; }`,
  js() {
    const KEY = 'dekiru-todo';
    let items, filter = 'all';
    try { items = JSON.parse(localStorage.getItem(KEY)) || [{ t: '図鑑を開く', d: true }, { t: '気に入った見本を改造する', d: false }]; } catch { items = []; }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* 保存できない環境 */ } };
    function render() {
      const list = document.getElementById('list'); list.innerHTML = '';
      items.forEach((it, i) => {
        if ((filter === 'open' && it.d) || (filter === 'done' && !it.d)) return;
        const li = document.createElement('li'); li.className = it.d ? 'done' : '';
        li.innerHTML = `<input type="checkbox" ${it.d ? 'checked' : ''} aria-label="済み"><span></span><button aria-label="消す">✕</button>`;
        li.querySelector('span').textContent = it.t;
        li.firstChild.onchange = () => { it.d = !it.d; save(); render(); };
        li.lastChild.onclick = () => { items.splice(i, 1); save(); render(); };
        list.append(li);
      });
      document.getElementById('n').textContent = `残り ${items.filter((x) => !x.d).length} 件 ・ 全 ${items.length} 件`;
    }
    document.getElementById('f').onsubmit = (e) => { e.preventDefault(); const v = document.getElementById('in').value.trim(); if (v) { items.push({ t: v, d: false }); save(); render(); } document.getElementById('in').value = ''; };
    document.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-pressed', x === b)); render(); };
    render();
  },
}, {
  id: 'ut-autosave-memo', c: 'util', lv: 1, so: 1,
  t: '自動で保存されるメモ帳', y: 'じどうでほぞんされるめもちょう',
  tags: ['メモ', 'localStorage', '自動保存', 'デバウンス'],
  d: '書くのをやめて少したつと、自動で localStorage に保存する。打つたびに保存せず「止まってから保存」にする工夫をデバウンスと呼ぶ。保存した時刻も表示する。',
  html: `<textarea id="t" placeholder="ここに書くと自動で保存されます" aria-label="メモ"></textarea><p id="st">　</p>`,
  css: `body { display: flex; flex-direction: column; padding: 10px; background: #fffbea; } textarea { flex: 1; font: 16px/1.8 serif; background: repeating-linear-gradient(transparent 0 calc(1.8em - 1px), #e8dcb0 calc(1.8em - 1px) 1.8em) , #fffdf2; border: 1px solid #e8dcb0; padding: 0 10px; } p { margin: 6px 0 0; font-size: 12px; color: #8a7a4a; }`,
  js() {
    const t = document.getElementById('t'), st = document.getElementById('st'), KEY = 'dekiru-memo';
    try { t.value = localStorage.getItem(KEY) || ''; } catch { st.textContent = 'この環境では保存できません'; }
    let timer = 0;
    t.addEventListener('input', () => {
      st.textContent = '書いています…';
      clearTimeout(timer);
      timer = setTimeout(() => { try { localStorage.setItem(KEY, t.value); st.textContent = `保存しました（${new Date().toLocaleTimeString('ja-JP')}、${[...t.value].length} 文字）`; } catch { st.textContent = '保存できませんでした'; } }, 800);
    });
  },
}, {
  id: 'ut-amidakuji', c: 'util', lv: 2,
  t: 'あみだくじ', y: 'あみだくじ',
  tags: ['あみだくじ', '抽選', 'canvas', 'アニメーション'],
  d: '縦線の間にでたらめに横線を引き、上の名前を押すと、横線に出会うたびに曲がりながら下までたどる様子を描く。どの結果に着くかは、たどってみるまで分からない。',
  html: `<div class="names" id="top"></div><canvas id="c"></canvas><div class="names" id="bot"></div><button id="re">引き直す</button>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 4px; background: #fbf5e6; } .names { display: grid; grid-template-columns: repeat(var(--n), 90px); } .names button, .names span { margin: 0 6px; text-align: center; font-weight: 700; } .names span { padding: 4px; border-radius: 6px; background: #fff; } canvas { width: calc(var(--n) * 90px); height: 50vh; }`,
  js() {
    const names = ['あおい', 'けんた', 'さくら', 'たろう', 'みお'], prizes = ['掃除', 'お菓子', '買い出し', '休み', '料理'], N = names.length;
    document.body.style.setProperty('--n', N);
    const c = document.getElementById('c'), x = c.getContext('2d');
    let rungs = [], shuffled = [];
    function make() {
      rungs = []; for (let r = 0; r < 14; r++) { const k = Math.floor(Math.random() * (N - 1)); if (!rungs.some((q) => q.r === r && Math.abs(q.k - k) < 2)) rungs.push({ r, k }); }
      for (let k = 0; k < N - 1; k++) rungs.push({ r: 14 + k, k });
      shuffled = prizes.slice().sort(() => Math.random() - 0.5);
      document.getElementById('bot').innerHTML = shuffled.map((p) => `<span>？</span>`).join('');
      draw();
    }
    const geo = () => { c.width = c.clientWidth; c.height = c.clientHeight; return { cx: (k) => (k + 0.5) * (c.width / N), ry: (r) => 10 + (r + 0.5) * ((c.height - 20) / (14 + N)) }; };
    function draw(path) {
      const { cx, ry } = geo();
      x.clearRect(0, 0, c.width, c.height); x.lineWidth = 3; x.strokeStyle = '#6b4f3a';
      for (let k = 0; k < N; k++) { x.beginPath(); x.moveTo(cx(k), 0); x.lineTo(cx(k), c.height); x.stroke(); }
      for (const q of rungs) { x.beginPath(); x.moveTo(cx(q.k), ry(q.r)); x.lineTo(cx(q.k + 1), ry(q.r)); x.stroke(); }
      if (path) { x.strokeStyle = '#e0532f'; x.lineWidth = 6; x.beginPath(); path.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke(); }
    }
    function trace(start) {
      const { cx, ry } = geo(), pts = [[cx(start), 0]];
      let k = start;
      for (const q of rungs.slice().sort((a, b) => a.r - b.r)) { if (q.k === k || q.k === k - 1) { pts.push([cx(k), ry(q.r)]); k = q.k === k ? k + 1 : k - 1; pts.push([cx(k), ry(q.r)]); } }
      pts.push([cx(k), c.height]);
      let i = 1, shown = [pts[0]];
      (function step() { if (i < pts.length) { shown.push(pts[i++]); draw(shown); setTimeout(step, 90); } else { const s = document.querySelectorAll('#bot span')[k]; s.textContent = shuffled[k]; s.style.background = '#ffe08a'; } })();
    }
    document.getElementById('top').innerHTML = '';
    names.forEach((n, i) => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => trace(i); document.getElementById('top').append(b); });
    document.getElementById('re').onclick = make;
    make();
    if (window.THUMB) { let i = 0; setInterval(() => { if (i % N === 0) make(); trace(i++ % N); }, 1800); }
  },
}, {
  id: 'ut-palette-generator', c: 'util', lv: 2,
  t: '配色を次々に作る', y: 'はいしょくをつぎつぎにつくる',
  tags: ['配色', 'OKLCH', 'ランダム', 'コピー'],
  d: 'スペースキーを押すたびに、色相をそろえて明るさを段階的に変えた5色の配色を作る。気に入った色は鍵をかけて残し、色をクリックすると16進数をコピーする。',
  html: `<div class="pal" id="p"></div><p class="hint">スペースキーか下のボタンで作り直し ・ 色を押すとコピー</p><button id="go">作り直す</button>`,
  css: `body { display: flex; flex-direction: column; background: #111; color: #ccc; } .pal { flex: 1; display: flex; } .sw { flex: 1; display: grid; align-content: end; justify-items: center; padding-bottom: 16px; cursor: pointer; transition: background .4s; } .sw b { font: 700 15px ui-monospace, monospace; padding: 4px 8px; border-radius: 6px; background: #0004; color: #fff; } .sw button { margin-top: 6px; background: #0004; color: #fff; border: 0; } .hint { text-align: center; font-size: 12px; margin: 6px; } #go { align-self: center; margin-bottom: 8px; }`,
  js() {
    const p = document.getElementById('p');
    const cols = Array.from({ length: 5 }, () => ({ hex: '#000', lock: false }));
    const toHex = (css) => { const x = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); x.fillStyle = css; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); };
    function gen() {
      const h = Math.random() * 360, mode = Math.floor(Math.random() * 3);
      cols.forEach((c, i) => { if (c.lock) return; const hh = mode === 0 ? h + i * 8 : mode === 1 ? h + (i % 2) * 180 : h + i * 72; c.hex = toHex(`oklch(${30 + i * 14}% ${0.08 + Math.random() * 0.1} ${hh % 360})`); });
      render();
    }
    function render() {
      p.innerHTML = '';
      cols.forEach((c) => { const d = document.createElement('div'); d.className = 'sw'; d.style.background = c.hex; d.innerHTML = `<b>${c.hex}</b><button aria-pressed="${c.lock}">${c.lock ? '固定中（押すと解除）' : '固定する'}</button>`; d.onclick = async (e) => { if (e.target.tagName === 'BUTTON') { c.lock = !c.lock; render(); return; } try { await navigator.clipboard.writeText(c.hex); d.querySelector('b').textContent = 'コピーしました'; setTimeout(render, 800); } catch { /* コピー不可 */ } }; p.append(d); });
    }
    addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); gen(); } });
    document.getElementById('go').onclick = gen;
    gen();
    if (window.THUMB) setInterval(gen, 1200);
  },
}, {
  id: 'ut-gradient-maker', c: 'util', lv: 2,
  t: 'グラデーション作成機', y: 'ぐらでーしょんさくせいき',
  tags: ['グラデーション', 'CSS生成', 'conic-gradient', 'コピー'],
  d: '直線・放射・円すいの3種類から選び、角度と色を変えてグラデーションを作る。できた CSS はその場で表示され、ボタン1つでコピーできる。',
  html: `<div class="prev" id="prev"></div><div class="ctl"><select id="type"><option value="linear">直線</option><option value="radial">放射</option><option value="conic">円すい</option></select><label>角度 <input type="range" id="ang" min="0" max="360" value="135"></label><input type="color" id="c1" value="#ff5e7e" aria-label="色1"><input type="color" id="c2" value="#ffcf5c" aria-label="色2"><input type="color" id="c3" value="#5ce1e6" aria-label="色3"><button id="cp">CSSをコピー</button></div><code id="code"></code>`,
  css: `body { display: flex; flex-direction: column; gap: 8px; padding: 10px; background: #f1f1f1; } .prev { flex: 1; border-radius: 14px; } .ctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; } code { font-size: 12px; background: #fff; padding: 6px; border-radius: 6px; word-break: break-all; }`,
  js() {
    const $ = (id) => document.getElementById(id);
    function css() {
      const t = $('type').value, a = $('ang').value, cs = [$('c1').value, $('c2').value, $('c3').value].join(', ');
      return t === 'linear' ? `linear-gradient(${a}deg, ${cs})` : t === 'radial' ? `radial-gradient(circle at ${50 + Math.cos((a * Math.PI) / 180) * 30}% ${50 + Math.sin((a * Math.PI) / 180) * 30}%, ${cs})` : `conic-gradient(from ${a}deg, ${cs}, ${$('c1').value})`;
    }
    const run = () => { const v = css(); $('prev').style.background = v; $('code').textContent = `background: ${v};`; };
    document.querySelector('.ctl').addEventListener('input', run);
    $('cp').onclick = async () => { try { await navigator.clipboard.writeText($('code').textContent); $('cp').textContent = 'コピーしました'; } catch { $('cp').textContent = 'コピーできません'; } };
    run();
    if (window.THUMB) setInterval(() => { $('ang').value = (+$('ang').value + 6) % 360; run(); }, 50);
  },
}, {
  id: 'ut-shadow-maker', c: 'util', lv: 2,
  t: '影の作成機', y: 'かげのさくせいき',
  tags: ['box-shadow', 'CSS生成', 'スライダー', '立体感'],
  d: '横・縦のずれ、ぼかし、広がり、濃さ、内側かどうかをスライダーで決めて box-shadow を作る。影を2枚重ねると自然な立体感になる。CSS をそのままコピーできる。',
  html: `<div class="stage"><div class="box" id="box">影</div></div><div class="ctl" id="ctl"></div><code id="code"></code>`,
  css: `body { display: grid; grid-template-rows: 1fr auto auto; gap: 8px; padding: 10px; background: #eef0f3; } .stage { display: grid; place-items: center; } .box { width: 160px; height: 110px; border-radius: 16px; background: #fff; display: grid; place-items: center; font: 800 30px serif; } .ctl { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 4px 12px; font-size: 12px; } .ctl label { display: grid; } code { font-size: 12px; background: #fff; padding: 6px; border-radius: 6px; }`,
  js() {
    const P = [['x', -40, 40, 0], ['y', -40, 60, 12], ['blur', 0, 80, 30], ['spread', -20, 30, -6], ['alpha', 0, 100, 25]];
    const ctl = document.getElementById('ctl');
    ctl.innerHTML = P.map(([n, a, b, v]) => `<label>${n} <input type="range" id="${n}" min="${a}" max="${b}" value="${v}"></label>`).join('') + '<label><span>内側</span><input type="checkbox" id="inset"></label><label><span>2枚重ねる</span><input type="checkbox" id="two" checked></label>';
    function run() {
      const g = (id) => document.getElementById(id).value, ins = document.getElementById('inset').checked ? 'inset ' : '';
      let s = `${ins}${g('x')}px ${g('y')}px ${g('blur')}px ${g('spread')}px rgb(0 0 0 / ${g('alpha') / 100})`;
      if (document.getElementById('two').checked) s += `, ${ins}0 1px 3px rgb(0 0 0 / .12)`;
      document.getElementById('box').style.boxShadow = s;
      document.getElementById('code').textContent = `box-shadow: ${s};`;
    }
    ctl.addEventListener('input', run);
    run();
  },
}, {
  id: 'ut-keycode', c: 'util', lv: 1,
  t: '押したキーを調べる', y: 'おしたきーをしらべる',
  tags: ['キーボード操作', 'KeyboardEvent', 'key', 'code'],
  d: 'キーを押すと、そのキーの key（入力される文字）と code（キーの物理的な位置）、同時に押している修飾キー、日本語入力の変換中かどうかを大きく表示する。',
  p: 'key は配列やシフトで変わり、code はキーボード上の位置で決まる。ゲームの操作には code、文字入力には key を使う。',
  html: `<div class="big" id="big">何かキーを押してください</div><dl id="d"></dl>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 12px; background: #1d1f27; color: #e6e6e6; } .big { font: 800 14vmin/1.1 ui-monospace, monospace; color: #ffd166; text-align: center; } dl { display: grid; grid-template-columns: auto auto; gap: 4px 14px; font: 15px ui-monospace, monospace; margin: 0; } dt { color: #8a93a6; }`,
  js() {
    addEventListener('keydown', (e) => {
      e.preventDefault();
      document.getElementById('big').textContent = e.key === ' ' ? 'Space' : e.key;
      const rows = { key: e.key, code: e.code, keyCode: e.keyCode, 修飾キー: ['ctrlKey', 'shiftKey', 'altKey', 'metaKey'].filter((k) => e[k]).map((k) => k.replace('Key', '')).join('+') || 'なし', 押しっぱなし: e.repeat ? 'はい' : 'いいえ', 変換中: e.isComposing ? 'はい' : 'いいえ', 位置: ['標準', '左', '右', 'テンキー'][e.location] };
      document.getElementById('d').innerHTML = Object.entries(rows).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    });
    if (window.THUMB) { const ks = ['A', 'Enter', '漢', 'Shift', '7']; let i = 0; setInterval(() => { document.getElementById('big').textContent = ks[i++ % 5]; }, 600); }
  },
}, {
  id: 'ut-split-bill', c: 'util', lv: 1,
  t: '割り勘の計算', y: 'わりかんのけいさん',
  tags: ['割り勘', '計算', '端数', '飲み会'],
  d: '合計金額と人数を入れると、1人いくら払えばよいかを、100円単位などの端数の切り上げも含めて計算する。幹事が多めに払う・少なめに払うといった調整もできる。',
  html: `<form id="f"><label>合計 <input id="total" type="number" value="23800" step="1">円</label><label>人数 <input id="n" type="number" value="6" min="1">人</label><label>端数の単位 <select id="unit"><option value="1">1円</option><option value="10">10円</option><option value="100" selected>100円</option><option value="500">500円</option><option value="1000">1000円</option></select></label><label>幹事の差額 <input id="adj" type="number" value="0" step="100">円（多く払うなら＋）</label></form><output id="o"></output>`,
  css: `body { display: grid; place-content: center; gap: 12px; background: #fff7ea; } form { display: grid; gap: 8px; } label { display: flex; gap: 6px; align-items: center; } input { width: 8em; font-size: 16px; } output { font-size: 16px; line-height: 1.9; background: #fff; padding: 10px 14px; border-radius: 10px; }`,
  js() {
    const $ = (id) => +document.getElementById(id).value;
    function run() {
      const total = $('total'), n = Math.max(1, $('n')), unit = $('unit'), adj = $('adj');
      const rest = (total - adj) / n, each = Math.ceil(rest / unit) * unit, boss = total - each * (n - 1);
      const yen = (v) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(v);
      document.getElementById('o').innerHTML = `参加者 ${n - 1} 人: <b>${yen(each)}</b> ずつ<br>幹事: <b>${yen(boss)}</b><br><small>集まる額 ${yen(each * (n - 1) + boss)}（合計とぴったり）</small>`;
    }
    document.getElementById('f').addEventListener('input', run);
    run();
  },
}, {
  id: 'ut-dummy-text', c: 'util', lv: 1,
  t: '日本語のダミー文章', y: 'にほんごのだみーぶんしょう',
  tags: ['ダミーテキスト', 'デザイン', 'ランダム', 'コピー'],
  d: '画面の見た目を確かめるための、意味のない日本語の文章を作る。主語・目的語・述語を組み合わせて文を作り、段落の数と長さを選べる。',
  html: `<div class="ctl"><label>段落 <input type="number" id="p" value="3" min="1" max="10"></label><label>1段落の文 <input type="number" id="s" value="4" min="1" max="12"></label><button id="go">作る</button><button id="cp">コピー</button></div><article id="out"></article>`,
  css: `body { padding: 12px; background: #fafafa; } .ctl { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 13px; } input { width: 4em; } article { line-height: 2; max-width: 40em; } p { text-indent: 1em; }`,
  js() {
    const S = ['小さな部品は', '静かな画面は', '新しい見本は', 'ブラウザの道具は', '昨日の試作は', '青い四角は', '丸いボタンは'];
    const O = ['文字を', '色を', '音を', '動きを', '数字を', '模様を', '影を'];
    const V = ['ゆっくり並べる。', 'そっと重ねる。', '少しだけ動かす。', '何度も試す。', '軽やかにつなぐ。', '丁寧に整える。', 'すばやく描く。'];
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    function gen() { const out = document.getElementById('out'); out.innerHTML = ''; for (let i = 0; i < +document.getElementById('p').value; i++) { const p = document.createElement('p'); p.textContent = Array.from({ length: +document.getElementById('s').value }, () => pick(S) + pick(O) + pick(V)).join(''); out.append(p); } }
    document.getElementById('go').onclick = gen;
    document.getElementById('cp').onclick = async () => { try { await navigator.clipboard.writeText(document.getElementById('out').innerText); document.getElementById('cp').textContent = 'コピーしました'; } catch { /* コピー不可 */ } };
    gen();
  },
}, {
  id: 'ut-icon-maker', c: 'util', lv: 2,
  t: '文字アイコンを作る', y: 'もじあいこんをつくる',
  tags: ['アイコン', 'canvas', 'PNG保存', 'ファビコン'],
  d: '1〜2文字と背景色と形を選ぶと、512×512 のアイコン画像を canvas で作る。PNG で保存でき、この見本のタブのアイコン（ファビコン）にもその場で使われる。',
  html: `<canvas id="c" width="512" height="512"></canvas><div class="ctl"><input id="t" value="出" maxlength="2" aria-label="文字"><input type="color" id="bg" value="#c23b22" aria-label="背景色"><input type="color" id="fg" value="#ffffff" aria-label="文字色"><select id="shape"><option value="round">角丸</option><option value="circle">丸</option><option value="square">四角</option></select><button id="dl">PNGで保存</button></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 20px 20px; } canvas { width: min(56vmin, 256px); } .ctl { display: flex; gap: 6px; align-items: center; background: #fff; padding: 8px; border-radius: 10px; } #t { width: 4em; font-size: 18px; text-align: center; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d'), $ = (id) => document.getElementById(id);
    function draw() {
      x.clearRect(0, 0, 512, 512); x.fillStyle = $('bg').value;
      const sh = $('shape').value;
      x.beginPath();
      if (sh === 'circle') x.arc(256, 256, 256, 0, 7); else if (sh === 'round') x.roundRect(0, 0, 512, 512, 110); else x.rect(0, 0, 512, 512);
      x.fill();
      const t = $('t').value || '?', size = [...t].length > 1 ? 220 : 330;
      x.fillStyle = $('fg').value; x.font = `900 ${size}px "Hiragino Mincho ProN","Yu Mincho",serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, 256, 270);
      let link = document.querySelector('link[rel=icon]'); if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.append(link); } link.href = c.toDataURL();
    }
    document.querySelector('.ctl').addEventListener('input', draw);
    $('dl').onclick = () => { const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'icon.png'; a.click(); };
    draw();
  },
}, {
  id: 'ut-roulette', c: 'util', lv: 2,
  t: '項目を入れて回すルーレット', y: 'こうもくをいれてまわするーれっと',
  tags: ['ルーレット', '抽選', 'conic-gradient', 'イージング'],
  d: '項目を1行ずつ書くと、その数で円を等分したルーレットになる。回すと減速しながら止まり、上の矢印が指した項目を表示する。止まる位置は最初にでたらめに決めておく。',
  html: `<div class="wrap"><div class="wheel-box"><div class="arrow"></div><div class="wheel" id="w"></div></div><div class="side"><textarea id="items" rows="6" aria-label="項目">カレー
ラーメン
寿司
パスタ
定食
そば</textarea><button id="spin">回す</button><p id="res" aria-live="polite"></p></div></div>`,
  css: `body { display: grid; place-items: center; background: #fdf3e7; } .wrap { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; justify-content: center; } .wheel-box { position: relative; } .arrow { position: absolute; left: 50%; top: -6px; translate: -50% 0; border: 14px solid transparent; border-top: 24px solid #222; z-index: 1; } .wheel { position: relative; width: min(60vmin, 300px); aspect-ratio: 1; border-radius: 50%; box-shadow: 0 6px 20px #0003; transition: transform 4s cubic-bezier(.15, .7, .15, 1); } .wheel span { position: absolute; left: 50%; top: 50%; transform-origin: 0 0; font: 700 14px sans-serif; color: #fff; text-shadow: 0 1px 2px #0008; } .side { display: grid; gap: 6px; } #res { font: 800 22px sans-serif; color: #c23b22; min-height: 1.4em; margin: 0; }`,
  js() {
    const w = document.getElementById('w'), ta = document.getElementById('items');
    let items = [], rot = 0;
    function build() {
      items = ta.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 16);
      const n = items.length || 1, step = 360 / n;
      w.style.background = `conic-gradient(${items.map((_, i) => `hsl(${(i * 360) / n} 70% 55%) ${i * step}deg ${(i + 1) * step}deg`).join(', ')})`;
      w.innerHTML = items.map((t, i) => `<span style="transform: rotate(${(i + 0.5) * step - 90}deg) translate(28px, -0.5em)">${t}</span>`).join('');
    }
    document.getElementById('spin').onclick = () => {
      if (!items.length) return;
      const step = 360 / items.length, k = Math.floor(Math.random() * items.length);
      rot += 360 * 5 + (360 - ((rot % 360) + (k + 0.5) * step) % 360);
      w.style.transform = `rotate(${rot}deg)`;
      document.getElementById('res').textContent = '';
      setTimeout(() => { document.getElementById('res').textContent = `→ ${items[k]}`; }, 4000);
    };
    ta.addEventListener('input', build);
    build();
    if (window.THUMB) setInterval(() => document.getElementById('spin').click(), 4300);
  },
}, {
  id: 'ut-team-split', c: 'util', lv: 1,
  t: 'チーム分け', y: 'ちーむわけ',
  tags: ['チーム分け', 'シャッフル', 'ランダム', 'グループ'],
  d: '名前を並べてチームの数を選ぶと、名前を混ぜてから順番に各チームへ配る。人数ができるだけ均等になる。何度でも分け直せる。',
  html: `<div class="wrap"><textarea id="names" rows="10" aria-label="名前の一覧">あおい
けんた
さくら
たろう
みお
ゆうき
はると
りこ
そうた
ひなた</textarea><div><label>チームの数 <input type="number" id="k" value="3" min="2" max="8"></label> <button id="go">分ける</button><div class="teams" id="teams"></div></div></div>`,
  css: `body { padding: 12px; background: #eef3ee; } .wrap { display: grid; grid-template-columns: 160px 1fr; gap: 12px; } .teams { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; margin-top: 8px; } .team { background: #fff; border-radius: 10px; padding: 8px; border-top: 5px solid hsl(var(--h) 60% 50%); } .team h3 { margin: 0 0 4px; font-size: 14px; } .team ul { margin: 0; padding-left: 1.2em; font-size: 14px; } #k { width: 4em; }`,
  js() {
    function go() {
      const names = document.getElementById('names').value.split('\n').map((s) => s.trim()).filter(Boolean), k = +document.getElementById('k').value;
      for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
      const teams = Array.from({ length: k }, () => []);
      names.forEach((n, i) => teams[i % k].push(n));
      document.getElementById('teams').innerHTML = teams.map((t, i) => `<div class="team" style="--h:${i * 50}"><h3>チーム${'ABCDEFGH'[i]}（${t.length}人）</h3><ul>${t.map((n) => `<li>${n.replace(/[<&]/g, '')}</li>`).join('')}</ul></div>`).join('');
    }
    document.getElementById('go').onclick = go;
    go();
    if (window.THUMB) setInterval(go, 1200);
  },
});
