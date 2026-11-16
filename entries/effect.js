/* 光と演出 */
dekiru.add({
  id: 'fx-neon', c: 'effect', lv: 1,
  t: 'ネオンサイン', y: 'ねおんさいん',
  tags: ['text-shadow', '光', 'ちらつき', '看板'],
  d: '色とぼかし幅の違う text-shadow を何重にも重ね、ときどき暗くなるアニメーションを足して、古いネオン管の看板にする。',
  p: '光のにじみは「白い芯」と「色のついた外側」を重ねると出る。点滅は1秒に3回を超えないようにしている。',
  html: `<div class="sign"><h1 class="a">OPEN</h1><p class="b">深夜営業</p></div>`,
  css: `
    body { display: grid; place-items: center; background: #160d14 radial-gradient(#2a1424, #0b070a 70%); }
    .sign { text-align: center; padding: 4vmin 8vmin; border-radius: 3vmin; border: .5vmin solid #ff2fb3; box-shadow: 0 0 2vmin #ff2fb3, inset 0 0 2vmin #ff2fb3; animation: buzz 7s infinite; }
    .a, .b { margin: 0; color: #fff; }
    .a { font: 900 18vmin/1 "Arial Black", sans-serif; letter-spacing: .05em; text-shadow: 0 0 .03em #fff, 0 0 .1em #ff2fb3, 0 0 .25em #ff2fb3, 0 0 .5em #ff2fb3, 0 0 1em #c4007f; animation: flick 6s infinite; }
    .b { font: 700 7vmin/1.6 sans-serif; color: #e9fdff; text-shadow: 0 0 .1em #fff, 0 0 .3em #19e3ff, 0 0 .8em #19e3ff; animation: flick 9s 1s infinite; }
    @keyframes flick { 0%, 18%, 22%, 62%, 64%, 100% { opacity: 1; } 20%, 63% { opacity: .35; } }
    @keyframes buzz { 0%, 80%, 100% { filter: none; } 81% { filter: brightness(.6); } 82% { filter: none; } }`,
}, {
  id: 'fx-glitch-text', c: 'effect', lv: 2,
  t: 'グリッチ文字', y: 'ぐりっちもじ',
  tags: ['clip-path', 'グリッチ', '疑似要素', 'attr()'],
  d: '同じ文字を ::before と ::after に複製し、色をずらして clip-path で横に細く切ったところだけ見せる。切る位置を激しく変えると映像が乱れたように見える。',
  p: 'content: attr(data-text) で HTML の属性値を疑似要素に流し込める。',
  html: `<h1 class="g" data-text="出来る！">出来る！</h1>`,
  css: `
    body { display: grid; place-items: center; background: #0a0a0f; }
    .g { position: relative; margin: 0; font: 900 20vmin/1 sans-serif; color: #fff; }
    .g::before, .g::after { content: attr(data-text); position: absolute; inset: 0; }
    .g::before { color: #00f0ff; translate: -.03em 0; animation: cut 1.8s steps(1) infinite; mix-blend-mode: screen; }
    .g::after { color: #ff2a6d; translate: .03em 0; animation: cut 1.3s steps(1) infinite reverse; mix-blend-mode: screen; }
    @keyframes cut {
      0% { clip-path: inset(10% 0 80% 0); } 10% { clip-path: inset(60% 0 20% 0); translate: .06em 0; }
      20% { clip-path: inset(30% 0 55% 0); } 30% { clip-path: inset(85% 0 5% 0); translate: -.05em 0; }
      40% { clip-path: inset(45% 0 40% 0); } 50% { clip-path: inset(0 0 95% 0); }
      60% { clip-path: inset(70% 0 15% 0); translate: .02em 0; } 70% { clip-path: inset(20% 0 70% 0); }
      80% { clip-path: inset(50% 0 30% 0); } 90% { clip-path: inset(5% 0 85% 0); translate: -.03em 0; }
    }`,
}, {
  id: 'fx-spotlight', c: 'effect', lv: 1,
  t: '暗闇のスポットライト', y: 'くらやみのすぽっとらいと',
  tags: ['radial-gradient', 'マウス', 'CSS変数', '懐中電灯'],
  d: '画面全体を黒い膜で覆い、マウスの位置だけ円形グラデーションで透明にする。隠れていた絵が懐中電灯で照らしたように見える。',
  p: 'JS はマウス座標を CSS 変数に入れるだけ。描画は CSS のグラデーションに任せている。',
  html: `
    <div class="scene">
      <h1>ここに隠れていた</h1>
      <i style="left:12%;top:20%;--c:#ff5e7e"></i><i style="left:78%;top:30%;--c:#ffcf5c"></i>
      <i style="left:25%;top:70%;--c:#5ce1e6"></i><i style="left:65%;top:75%;--c:#9b7bff"></i>
    </div>
    <div class="dark"></div>`,
  css: `
    body { overflow: hidden; cursor: none; }
    .scene { position: fixed; inset: 0; display: grid; place-items: center; background: repeating-linear-gradient(45deg, #f6e7c8 0 4vmin, #f1dcb2 0 8vmin); }
    h1 { font: 900 10vmin serif; color: #8a2a14; }
    .scene i { position: absolute; width: 14vmin; aspect-ratio: 1; border-radius: 30%; background: var(--c); rotate: 20deg; }
    .dark { position: fixed; inset: 0; pointer-events: none; background: radial-gradient(circle at var(--x, 50%) var(--y, 50%), transparent 0 10vmin, #000000f0 24vmin); }`,
  js() {
    const set = (x, y) => { document.body.style.setProperty('--x', x + 'px'); document.body.style.setProperty('--y', y + 'px'); };
    let moved = false;
    addEventListener('pointermove', (e) => { moved = true; set(e.clientX, e.clientY); });
    (function wander(t) { if (!moved) set(innerWidth * (0.5 + 0.35 * Math.cos(t / 900)), innerHeight * (0.5 + 0.3 * Math.sin(t / 650))); requestAnimationFrame(wander); })(0);
  },
}, {
  id: 'fx-glass', c: 'effect', lv: 1,
  t: 'すりガラス', y: 'すりがらす',
  tags: ['backdrop-filter', 'ぼかし', 'ガラス', 'UI'],
  d: 'backdrop-filter は要素の「後ろに見えているもの」だけをぼかす。動く色の玉の上に板を置くと、すりガラス越しに眺めているようになる。',
  p: 'filter は要素そのもの、backdrop-filter は背面。板の背景を半透明にしないと効果が見えない。',
  html: `
    <div class="blobs"><i></i><i></i><i></i></div>
    <div class="glass"><h2>すりガラス</h2><p>backdrop-filter: blur(16px)</p></div>`,
  css: `
    body { display: grid; place-items: center; background: #101626; overflow: hidden; }
    .blobs i { position: fixed; width: 40vmin; aspect-ratio: 1; border-radius: 50%; animation: float 9s ease-in-out infinite alternate; }
    .blobs i:nth-child(1) { background: #ff5e7e; left: 10%; top: 10%; }
    .blobs i:nth-child(2) { background: #3fb7e8; right: 10%; top: 30%; animation-duration: 7s; }
    .blobs i:nth-child(3) { background: #ffcf5c; left: 35%; bottom: 5%; animation-duration: 11s; }
    @keyframes float { to { translate: 20vmin -15vmin; } }
    .glass {
      position: relative; padding: 6vmin 9vmin; border-radius: 4vmin; color: #fff;
      background: #ffffff1f; border: 1px solid #ffffff55;
      backdrop-filter: blur(16px) saturate(1.6);
      box-shadow: 0 2vmin 6vmin #0005;
    }
    .glass h2 { margin: 0; font: 800 8vmin serif; }
    .glass p { margin: .5em 0 0; font: 3vmin ui-monospace, monospace; opacity: .85; }`,
}, {
  id: 'fx-blend-text', c: 'effect', lv: 1,
  t: '背景に合わせて反転する文字', y: 'はいけいにあわせてはんてんするもじ',
  tags: ['mix-blend-mode', 'difference', '反転', '文字'],
  d: 'mix-blend-mode: difference の白い文字は、明るい背景の上では黒く、暗い背景の上では白く見える。動く縞の上でも常に読める。',
  html: `<div class="stripes"></div><h1>反転する文字</h1>`,
  css: `
    body { display: grid; place-items: center; overflow: hidden; background: #fff; }
    .stripes { position: fixed; inset: -50%; background: repeating-linear-gradient(60deg, #111 0 12vmin, #fff 0 24vmin); animation: move 6s linear infinite; }
    @keyframes move { to { translate: 27.7vmin 0; } }
    h1 { position: relative; margin: 0; font: 900 14vmin/1 sans-serif; color: #fff; mix-blend-mode: difference; }`,
}, {
  id: 'fx-holo-card', c: 'effect', lv: 2,
  t: 'ホログラムのカード', y: 'ほろぐらむのかーど',
  tags: ['3D変形', '光沢', 'color-dodge', 'マウス'],
  d: 'マウスの位置でカードを傾け、同じ位置に合わせて虹色の帯を動かす。color-dodge で重ねると、光を反射しているように見える。',
  html: `<div class="card" id="card"><div class="art"><b>出</b></div><div class="foil"></div><p>No.001 出来る札</p></div>`,
  css: `
    body { display: grid; place-items: center; background: #1a1625; perspective: 900px; overflow: hidden; }
    .card {
      --mx: 50%; --my: 50%; --rx: 0deg; --ry: 0deg;
      position: relative; width: 44vmin; aspect-ratio: 5 / 7; border-radius: 3vmin; overflow: hidden;
      background: #2a2340; box-shadow: 0 3vmin 6vmin #000a;
      transform: rotateX(var(--rx)) rotateY(var(--ry)); transition: transform .1s;
    }
    .art { position: absolute; inset: 6% 6% 22%; border-radius: 2vmin; display: grid; place-items: center; background: radial-gradient(circle at 30% 30%, #ff9a8b, #ff6a88 40%, #6a3093); }
    .art b { font: 900 22vmin/1 serif; color: #fff; text-shadow: 0 1vmin 2vmin #0006; }
    .card p { position: absolute; bottom: 5%; left: 0; right: 0; margin: 0; text-align: center; color: #eee; font: 700 3vmin sans-serif; }
    .foil {
      position: absolute; inset: 0; mix-blend-mode: color-dodge; opacity: .7;
      background:
        radial-gradient(circle at var(--mx) var(--my), #fff8, transparent 40%),
        linear-gradient(115deg, transparent 20%, #ff008066 35%, #ffd70066 45%, #00ffd566 55%, #8a2be266 65%, transparent 80%) var(--mx) var(--my) / 300% 300%;
    }`,
  js() {
    const card = document.getElementById('card');
    function tilt(px, py) {
      card.style.setProperty('--mx', px * 100 + '%');
      card.style.setProperty('--my', py * 100 + '%');
      card.style.setProperty('--ry', (px - 0.5) * 30 + 'deg');
      card.style.setProperty('--rx', (0.5 - py) * 30 + 'deg');
    }
    let moved = false;
    addEventListener('pointermove', (e) => { moved = true; tilt(e.clientX / innerWidth, e.clientY / innerHeight); });
    (function auto(t) { if (!moved) tilt(0.5 + Math.cos(t / 800) * 0.4, 0.5 + Math.sin(t / 1100) * 0.4); requestAnimationFrame(auto); })(0);
  },
}, {
  id: 'fx-aurora', c: 'effect', lv: 2,
  t: 'オーロラ', y: 'おーろら',
  tags: ['blur', 'グラデーション', '夜空', 'skew'],
  d: '緑と紫の帯を大きくぼかし、ゆっくり傾けたり伸ばしたりすると、夜空に揺れるオーロラになる。山の影は clip-path で切り抜いた三角形。',
  html: `<div class="sky"><i class="a1"></i><i class="a2"></i><i class="a3"></i><div class="mount"></div></div>`,
  css: `
    .sky { position: fixed; inset: 0; overflow: hidden; background:
      radial-gradient(1px 1px at 15% 20%, #fff, transparent), radial-gradient(1px 1px at 60% 12%, #fff, transparent),
      radial-gradient(1px 1px at 82% 28%, #fff, transparent), radial-gradient(1px 1px at 35% 35%, #fff9, transparent),
      linear-gradient(#020414, #071a2b 60%, #0c2a3a); }
    .sky i { position: absolute; left: -20%; right: -20%; height: 40%; filter: blur(5vmin); mix-blend-mode: screen; opacity: .8; animation: sway 10s ease-in-out infinite alternate; }
    .a1 { top: 10%; background: linear-gradient(90deg, transparent, #2bff9c 30%, #18c3a0 60%, transparent); }
    .a2 { top: 22%; background: linear-gradient(90deg, transparent 10%, #7b5cff 40%, #2bff9c 70%, transparent); animation-duration: 13s; animation-direction: alternate-reverse; }
    .a3 { top: 5%; height: 25%; background: linear-gradient(90deg, transparent 30%, #ff5ec4aa 50%, transparent 75%); animation-duration: 17s; }
    @keyframes sway { 0% { transform: skewY(-6deg) scaleY(.7); } 50% { transform: skewY(4deg) scaleY(1.2) translateX(5%); } 100% { transform: skewY(-2deg) scaleY(.9) translateX(-6%); } }
    .mount { position: absolute; inset: 62% 0 0; background: #03060c; clip-path: polygon(0 60%, 12% 25%, 22% 50%, 38% 5%, 52% 45%, 63% 20%, 78% 55%, 90% 30%, 100% 50%, 100% 100%, 0 100%); }`,
}, {
  id: 'fx-shine-button', c: 'effect', lv: 1,
  t: '光が走るボタン', y: 'ひかりがはしるぼたん',
  tags: ['ボタン', '光沢', 'linear-gradient', '疑似要素'],
  d: '斜めの白い帯を疑似要素で作り、ボタンの左外から右外へ定期的に通過させる。はみ出しは overflow: hidden で隠す。',
  html: `<button class="shine">今すぐ始める</button><button class="shine gold">特別会員</button>`,
  css: `
    body { display: grid; place-content: center; gap: 4vmin; background: #14141c; }
    .shine { position: relative; overflow: hidden; border: 0; border-radius: 999px; padding: 3vmin 9vmin; font: 800 4.5vmin sans-serif; color: #fff; background: linear-gradient(135deg, #5b5bf0, #b44cff); box-shadow: 0 1vmin 3vmin #5b5bf066; }
    .gold { background: linear-gradient(135deg, #b8860b, #ffd76a 50%, #b8860b); color: #3a2a00; box-shadow: 0 1vmin 3vmin #ffd76a44; }
    .shine::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, #ffffffaa 50%, transparent 70%); translate: -100% 0; animation: run 2.6s ease-in-out infinite; }
    .gold::after { animation-delay: 1.3s; }
    @keyframes run { 60%, 100% { translate: 100% 0; } }`,
}, {
  id: 'fx-gradient-border', c: 'effect', lv: 2,
  t: '回る光の縁', y: 'まわるひかりのふち',
  tags: ['@property', 'conic-gradient', '枠線', '角度'],
  d: '角度を @property で登録し、conic-gradient の開始角度を回し続ける。背景を「内側」と「枠」の2層に分けると、枠だけが虹色に回る。',
  p: 'padding-box と border-box を背景ごとに指定すると、1つの要素で中身と縁を別々に塗れる。',
  html: `<div class="card"><h2>光の縁</h2><p>@property --a { syntax: "&lt;angle&gt;" }</p></div>`,
  css: `
    @property --a { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
    body { display: grid; place-items: center; background: #0b0b12; }
    .card {
      --g: conic-gradient(from var(--a), #ff4d6d, #ffd166, #06d6a0, #4cc9f0, #9b5de5, #ff4d6d);
      position: relative; padding: 7vmin 9vmin; border-radius: 3vmin; color: #fff;
      border: .7vmin solid transparent;
      background: linear-gradient(#15151f, #15151f) padding-box, var(--g) border-box;
      animation: rot 4s linear infinite;
    }
    .card::before { content: ""; position: absolute; inset: -.7vmin; z-index: -1; border-radius: inherit; background: var(--g); filter: blur(3vmin); opacity: .6; }
    h2 { margin: 0; font: 800 8vmin serif; }
    p { margin: .4em 0 0; font: 2.6vmin ui-monospace, monospace; opacity: .7; }
    @keyframes rot { to { --a: 360deg; } }`,
}, {
  id: 'fx-crt', c: 'effect', lv: 2,
  t: 'ブラウン管の画面', y: 'ぶらうんかんのがめん',
  tags: ['走査線', 'レトロ', 'repeating-linear-gradient', '端末'],
  d: '細い横縞を重ねて走査線にし、四隅を暗くし、文字の色を左右にわずかにずらすと、古いブラウン管の端末になる。',
  html: `<div class="crt"><pre id="out"></pre></div>`,
  css: `
    body { display: grid; place-items: center; background: #111; }
    .crt { position: relative; width: 88vmin; height: 64vmin; border-radius: 4vmin / 6vmin; overflow: hidden; background: radial-gradient(#0d2a12, #020803 75%); box-shadow: inset 0 0 6vmin #000, 0 0 0 2vmin #2a2925, 0 0 0 2.6vmin #111; animation: flicker .15s infinite; }
    .crt::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(#0000 0 2px, #0006 2px 4px), radial-gradient(transparent 60%, #0008); }
    pre { margin: 0; padding: 5vmin; font: 3.2vmin/1.5 ui-monospace, Consolas, monospace; color: #6dff8f; text-shadow: .08em 0 #ff00401c, -.08em 0 #00b3ff2c, 0 0 .4em #6dff8f99; white-space: pre-wrap; }
    @keyframes flicker { 50% { opacity: .97; } }`,
  js() {
    const lines = ['> 起動しています……', '> メモリ確認 640K OK', '> ライブラリ: なし', '> フレームワーク: なし', '> 出来る.exe を実行', '', '  ブラウザがあれば、だいたい出来る。', ''];
    const out = document.getElementById('out');
    let i = 0, j = 0;
    (function type() {
      if (i >= lines.length) { setTimeout(() => { out.textContent = ''; i = j = 0; type(); }, 2500); return; }
      if (j <= lines[i].length) { out.textContent = lines.slice(0, i).join('\n') + (i ? '\n' : '') + lines[i].slice(0, j) + '█'; j++; setTimeout(type, 45); }
      else { i++; j = 0; setTimeout(type, 250); }
    })();
  },
}, {
  id: 'fx-film-grain', c: 'effect', lv: 2,
  t: '古いフィルム', y: 'ふるいふぃるむ',
  tags: ['feTurbulence', 'ノイズ', 'セピア', 'フィルム'],
  d: 'SVG のノイズ（feTurbulence）を背景画像にして小刻みにずらすと、粒子のざらつきになる。縦の傷とセピア色を足せば古い映画のよう。',
  html: `<div class="film"><h1>昭和百年</h1><p>ある町の記録</p></div>`,
  css: `
    body { overflow: hidden; background: #000; }
    .film { position: fixed; inset: 0; display: grid; place-content: center; text-align: center; color: #f5e6c4; background: radial-gradient(#8a6a44, #2a1d10 80%); filter: sepia(.6) contrast(1.1); animation: shake .25s steps(2) infinite; }
    h1 { margin: 0; font: 900 14vmin/1 serif; letter-spacing: .1em; }
    p { font: 4vmin serif; letter-spacing: .3em; }
    .film::before { content: ""; position: absolute; inset: -50%; opacity: .35; pointer-events: none;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      animation: grain .4s steps(6) infinite; }
    .film::after { content: ""; position: absolute; top: 0; bottom: 0; left: 30%; width: 2px; background: #fff6; animation: scratch 3s steps(12) infinite; }
    @keyframes grain { 0% { translate: 0 0; } 20% { translate: -5% 3%; } 40% { translate: 4% -6%; } 60% { translate: -7% -2%; } 80% { translate: 6% 5%; } 100% { translate: 2% -4%; } }
    @keyframes scratch { 0% { left: 30%; opacity: 1; } 25% { left: 72%; opacity: .2; } 50% { left: 12%; opacity: .8; } 75% { left: 55%; opacity: 0; } 100% { left: 40%; opacity: .6; } }
    @keyframes shake { 50% { translate: 0 .3vmin; filter: sepia(.6) contrast(1.1) brightness(.95); } }`,
}, {
  id: 'fx-magnifier', c: 'effect', lv: 2,
  t: '虫眼鏡', y: 'むしめがね',
  tags: ['拡大', 'clip-path', 'cloneNode', 'マウス'],
  d: '同じ中身をもう1枚重ね、2倍に拡大して丸く切り抜く。拡大の中心と切り抜く位置をマウスに合わせると、レンズでのぞいているようになる。',
  p: 'transform-origin を切り抜きの中心と同じ点にすると、拡大しても円がマウスの下からずれない。',
  html: `
    <div class="page" id="page">
      <h1>細かい字を読む</h1>
      <p>この段落はわざと小さな文字で書いてあります。虫眼鏡を近づけると、2倍に拡大された文字がレンズの中に見えます。拡大した側は本物の HTML を複製したものなので、画像と違ってどこまで拡大してもにじみません。</p>
      <div class="dots"></div>
    </div>`,
  css: `
    body { overflow: hidden; cursor: none; background: #fbf7ee; }
    .page { position: fixed; inset: 0; padding: 6vmin; color: #333; background: #fbf7ee; }
    .page h1 { margin: 0 0 2vmin; font: 800 6vmin serif; }
    .page p { font-size: 1.8vmin; line-height: 1.7; max-width: 60vw; }
    .dots { width: 40vmin; height: 20vmin; background: radial-gradient(#e0532f 30%, transparent 32%) 0 0 / 2vmin 2vmin, radial-gradient(#26407c 30%, transparent 32%) 1vmin 1vmin / 2vmin 2vmin; }
    .lens { position: fixed; inset: 0; pointer-events: none; scale: 2; transform-origin: var(--x) var(--y); clip-path: circle(9vmin at var(--x) var(--y)); }
    .ring { position: fixed; left: var(--x); top: var(--y); width: 36vmin; aspect-ratio: 1; translate: -50% -50%; border-radius: 50%; border: 1.2vmin solid #6b4f2a; box-shadow: 0 1vmin 3vmin #0005, inset 0 0 2vmin #fff8; pointer-events: none; }`,
  js() {
    const page = document.getElementById('page');
    const lens = page.cloneNode(true);
    lens.removeAttribute('id');
    lens.classList.add('lens');
    const ring = document.createElement('div');
    ring.className = 'ring';
    document.body.append(lens, ring);
    const set = (x, y) => { document.body.style.setProperty('--x', x + 'px'); document.body.style.setProperty('--y', y + 'px'); };
    let moved = false;
    addEventListener('pointermove', (e) => { moved = true; set(e.clientX, e.clientY); });
    (function wander(t) { if (!moved) set(innerWidth * (0.4 + 0.25 * Math.cos(t / 1300)), innerHeight * (0.45 + 0.25 * Math.sin(t / 900))); requestAnimationFrame(wander); })(0);
  },
}, {
  id: 'fx-cursor-trail', c: 'effect', lv: 2,
  t: '光の残像', y: 'ひかりのざんぞう',
  tags: ['canvas', 'マウス', '残像', '加算合成'],
  d: '毎フレーム画面を薄い黒で塗り重ねると、前に描いたものが少しずつ消えて尾を引く。光の粒は加算合成（lighter）で重ねるほど明るくなる。',
  html: `<canvas id="c"></canvas>`,
  css: `body { background: #000; overflow: hidden; } canvas { position: fixed; inset: 0; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    const ps = [];
    let hue = 0, mx = innerWidth / 2, my = innerHeight / 2, moved = false;
    addEventListener('pointermove', (e) => { moved = true; mx = e.clientX; my = e.clientY; });
    (function loop(t) {
      if (!moved) { mx = c.width / 2 + Math.sin(t / 500) * c.width * 0.35; my = c.height / 2 + Math.sin(t / 333) * c.height * 0.3; }
      for (let i = 0; i < 4; i++) ps.push({ x: mx, y: my, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 1, h: hue });
      hue = (hue + 2) % 360;
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = '#0002';
      x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'lighter';
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += p.vx; p.y += p.vy; p.life -= 0.02;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        x.fillStyle = `hsla(${p.h} 100% 60% / ${p.life})`;
        x.beginPath(); x.arc(p.x, p.y, 6 * p.life + 1, 0, Math.PI * 2); x.fill();
      }
      requestAnimationFrame(loop);
    })(0);
  },
}, {
  id: 'fx-circle-reveal', c: 'effect', lv: 3,
  t: '円が広がって切り替わる配色', y: 'えんがひろがってきりかわるはいしょく',
  tags: ['View Transitions', 'clip-path', 'ダークモード', '切り替え'],
  d: '押した場所から円が広がって、明るい配色と暗い配色が入れ替わる。View Transitions で新しい画面の写しを作り、その写しを円で切り抜いて広げる。',
  p: 'animate() の pseudoElement に "::view-transition-new(root)" を渡すと、遷移用の写しそのものを動かせる。',
  html: `<main><h1>どこでも押してください</h1><p>押した点から配色が切り替わります。</p></main>`,
  css: `
    :root { --bg: #fbf6ea; --fg: #2b2118; }
    :root.dark { --bg: #121826; --fg: #e9f0ff; }
    main { height: 100%; display: grid; place-content: center; text-align: center; background: var(--bg); color: var(--fg); cursor: pointer; user-select: none; }
    h1 { font: 800 8vmin serif; margin: 0; }
    ::view-transition-old(root), ::view-transition-new(root) { animation: none; mix-blend-mode: normal; }`,
  js() {
    let running = null;
    const flip = (x, y) => {
      const toggle = () => document.documentElement.classList.toggle('dark');
      if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { toggle(); return; }
      if (running) running.skipTransition(); // 前の切り替えが残っていたら終わらせてから次へ
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const vt = (running = document.startViewTransition(toggle));
      vt.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 650, easing: 'cubic-bezier(.6, 0, .3, 1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(() => { /* 次の切り替えで中断されたときは何もしない */ });
      vt.finished.catch(() => {}).finally(() => { if (running === vt) running = null; });
    };
    addEventListener('click', (e) => flip(e.clientX, e.clientY));
    if (window.THUMB) setInterval(() => flip(Math.random() * innerWidth, Math.random() * innerHeight), 1400);
  },
}, {
  id: 'fx-fireflies', c: 'effect', lv: 1,
  t: '蛍の光', y: 'ほたるのひかり',
  tags: ['ランダム', 'CSS変数', '夜', 'ぼかし'],
  d: '小さな光の点を40個作り、それぞれにでたらめな位置・速さ・明滅の周期を CSS 変数で渡す。動きそのものは共通の @keyframes。',
  html: `<div class="night" id="n"><div class="grass"></div></div>`,
  css: `
    .night { position: fixed; inset: 0; overflow: hidden; background: radial-gradient(ellipse at 50% 120%, #10301c, #040b10 70%); }
    .grass { position: absolute; inset: 78% 0 0; background: repeating-linear-gradient(80deg, #04140b 0 .6vmin, transparent 0 1.4vmin), linear-gradient(transparent, #020805 40%); }
    .f { position: absolute; left: var(--x); top: var(--y); width: 1.2vmin; aspect-ratio: 1; border-radius: 50%; background: #e9ff8a; box-shadow: 0 0 1.5vmin .5vmin #c8ff4a, 0 0 4vmin #a4ff2a88;
      animation: drift var(--t) ease-in-out infinite alternate, glow var(--g) ease-in-out infinite; animation-delay: var(--dl); }
    @keyframes drift { to { translate: var(--dx) var(--dy); } }
    @keyframes glow { 0%, 100% { opacity: .1; } 50% { opacity: 1; } }`,
  js() {
    const n = document.getElementById('n');
    const r = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 40; i++) {
      const f = document.createElement('i');
      f.className = 'f';
      const s = f.style;
      s.setProperty('--x', r(0, 100) + '%'); s.setProperty('--y', r(20, 85) + '%');
      s.setProperty('--dx', r(-12, 12) + 'vmin'); s.setProperty('--dy', r(-10, 10) + 'vmin');
      s.setProperty('--t', r(4, 9) + 's'); s.setProperty('--g', r(2, 5) + 's'); s.setProperty('--dl', -r(0, 9) + 's');
      n.append(f);
    }
  },
}, {
  id: 'fx-lightbulb', c: 'effect', lv: 1,
  t: '電球のスイッチ', y: 'でんきゅうのすいっち',
  tags: [':has()', 'チェックボックス', 'JSなし', '光'],
  d: 'スイッチの実体はチェックボックス。body:has(:checked) と書けば、スイッチの状態で部屋全体の明かりを CSS だけで切り替えられる。',
  p: ':has() は「中にこういう要素を含む親」を選ぶ。子の状態で親を変えるのに JS がいらなくなった。',
  html: `
    <div class="bulb"><div class="glass"></div><div class="base"></div></div>
    <label class="sw"><input type="checkbox" id="on"><span>明かり</span></label>`,
  css: `
    body { display: grid; place-content: center; justify-items: center; gap: 6vmin; background: #15161c; color: #aaa; transition: background .5s; }
    body:has(#on:checked) { background: radial-gradient(circle at 50% 30%, #fff3c4, #f2d27a 30%, #8a6a2a 70%); color: #3a2a00; }
    .glass { width: 24vmin; aspect-ratio: 1; border-radius: 50% 50% 45% 45%; background: #3a3b44; transition: .4s; }
    body:has(#on:checked) .glass { background: radial-gradient(circle at 40% 35%, #fff, #ffe680 60%); box-shadow: 0 0 6vmin #fff2a8, 0 0 20vmin #ffd54a; }
    .base { width: 11vmin; height: 8vmin; margin: -1vmin auto 0; border-radius: 0 0 2vmin 2vmin; background: repeating-linear-gradient(#777 0 1.2vmin, #555 0 2.4vmin); }
    .sw { gap: 1em; font: 700 3.6vmin sans-serif; cursor: pointer; display: inline-flex; align-items: center; }
    .sw input { appearance: none; width: 12vmin; height: 6vmin; border-radius: 99px; background: #444; position: relative; cursor: pointer; transition: background .3s; margin: 0; }
    .sw input::after { content: ""; position: absolute; top: .6vmin; left: .6vmin; width: 4.8vmin; aspect-ratio: 1; border-radius: 50%; background: #fff; transition: translate .3s; }
    .sw input:checked { background: #e0a400; }
    .sw input:checked::after { translate: 6vmin 0; }
    .sw input:focus-visible { outline: 3px solid #e0532f; outline-offset: 3px; }`,
  js() {
    if (window.THUMB) { const c = document.getElementById('on'); setInterval(() => { c.checked = !c.checked; }, 1300); }
  },
}, {
  id: 'fx-scratch', c: 'effect', lv: 2,
  t: '削って当たりを見る', y: 'けずってあたりをみる',
  tags: ['canvas', 'destination-out', 'くじ', '消しゴム'],
  d: '銀色に塗ったキャンバスを、指でなぞったところだけ destination-out で消していく。半分以上削れたら残りを一気に消す。',
  p: 'globalCompositeOperation を destination-out にすると、描いた形が「消しゴム」になる。',
  html: `
    <div class="ticket"><div class="prize" id="prize"></div><canvas id="c"></canvas></div>
    <button id="again">もう1枚</button>`,
  css: `
    body { display: grid; place-content: center; justify-items: center; gap: 3vmin; background: #2c1f3a; touch-action: none; }
    .ticket { position: relative; width: 70vmin; height: 36vmin; border-radius: 2vmin; overflow: hidden; background: #fffaf0; box-shadow: 0 1.5vmin 4vmin #0007; }
    .prize { position: absolute; inset: 0; display: grid; place-items: center; font: 900 9vmin serif; color: #c23b22; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true });
    const prizes = ['大当たり！', '当たり', 'もう一回', '小吉', '特賞'];
    let down = false, last = null;
    function reset() {
      document.getElementById('prize').textContent = prizes[Math.floor(Math.random() * prizes.length)];
      const r = c.getBoundingClientRect();
      c.width = r.width; c.height = r.height;
      const g = x.createLinearGradient(0, 0, c.width, c.height);
      g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.5, '#e6e6e6'); g.addColorStop(1, '#8c8c8c');
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#666'; x.font = `700 ${c.height * 0.16}px sans-serif`; x.textAlign = 'center';
      x.fillText('ここを削ってね', c.width / 2, c.height / 2 + c.height * 0.05);
      c.style.transition = ''; c.style.opacity = 1;
    }
    function scratch(px, py) {
      x.globalCompositeOperation = 'destination-out';
      x.lineWidth = c.height * 0.16; x.lineCap = 'round';
      x.beginPath(); x.moveTo(last ? last[0] : px, last ? last[1] : py); x.lineTo(px, py); x.stroke();
      last = [px, py];
    }
    function cleared() {
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 64) if (d[i] === 0) n++;
      return n / (d.length / 64);
    }
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', (e) => { down = true; last = null; c.setPointerCapture(e.pointerId); scratch(...pos(e)); });
    c.addEventListener('pointermove', (e) => { if (down) scratch(...pos(e)); });
    c.addEventListener('pointerup', () => { down = false; if (cleared() > 0.5) { c.style.transition = 'opacity .6s'; c.style.opacity = 0; } });
    document.getElementById('again').onclick = reset;
    reset();
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.15; scratch(c.width * (0.5 + 0.4 * Math.sin(t * 1.3)), c.height * (0.5 + 0.35 * Math.sin(t * 2.1))); }, 30); }
  },
}, {
  id: 'fx-sparkle-text', c: 'effect', lv: 1,
  t: 'きらめく文字', y: 'きらめくもじ',
  tags: ['きらきら', 'animationend', 'ランダム', 'SVG'],
  d: '文字のまわりのでたらめな位置に小さな星を生み、回りながら現れて消える動きをさせる。終わった星は animationend で片付ける。',
  html: `<h1 class="sp" id="sp">特別な日</h1>`,
  css: `
    body { display: grid; place-items: center; background: #1b1035; }
    .sp { position: relative; margin: 0; font: 900 14vmin/1 serif; background: linear-gradient(90deg, #ffd76a, #ff9ad5, #9ad8ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .star { position: absolute; width: var(--s); aspect-ratio: 1; pointer-events: none; animation: tw .9s ease-in-out forwards; }
    .star svg { width: 100%; height: 100%; fill: #fff8c8; filter: drop-shadow(0 0 4px #fff); }
    @keyframes tw { 0% { scale: 0; rotate: 0deg; } 50% { scale: 1; } 100% { scale: 0; rotate: 180deg; } }`,
  js() {
    const sp = document.getElementById('sp');
    const svg = '<svg viewBox="0 0 24 24"><path d="M12 0C13 8 16 11 24 12 16 13 13 16 12 24 11 16 8 13 0 12 8 11 11 8 12 0z"/></svg>';
    setInterval(() => {
      const s = document.createElement('span');
      s.className = 'star';
      s.innerHTML = svg;
      s.style.left = Math.random() * 100 + '%';
      s.style.top = Math.random() * 100 + '%';
      s.style.setProperty('--s', 1.5 + Math.random() * 3 + 'vmin');
      sp.append(s);
      s.addEventListener('animationend', () => s.remove());
    }, 120);
  },
}, {
  id: 'fx-light-shadow', c: 'effect', lv: 2,
  t: '光源に合わせて伸びる影', y: 'こうげんにあわせてのびるかげ',
  tags: ['text-shadow', '影', 'マウス', '光源'],
  d: 'マウスを電球に見立て、文字の影を光と反対の方向へ何層も重ねて伸ばす。電球が近いほど影は短く、遠いほど長くなる。',
  html: `<h1 id="t">影</h1><div class="bulb" id="b"></div>`,
  css: `
    body { display: grid; place-items: center; background: #e9e2d0; overflow: hidden; cursor: none; }
    h1 { margin: 0; font: 900 30vmin/1 serif; color: #f6f1e4; }
    .bulb { position: fixed; left: 0; top: 0; width: 5vmin; aspect-ratio: 1; border-radius: 50%; background: #fff6c8; box-shadow: 0 0 4vmin 2vmin #ffe9a0; translate: -50% -50%; pointer-events: none; }`,
  js() {
    const t = document.getElementById('t'), b = document.getElementById('b');
    function light(mx, my) {
      b.style.left = mx + 'px'; b.style.top = my + 'px';
      const r = t.getBoundingClientRect();
      const dx = r.left + r.width / 2 - mx, dy = r.top + r.height / 2 - my;
      const len = Math.min(60, Math.hypot(dx, dy) / 8), a = Math.atan2(dy, dx);
      const layers = [];
      for (let i = 1; i <= len; i++) layers.push(`${(Math.cos(a) * i).toFixed(1)}px ${(Math.sin(a) * i).toFixed(1)}px 0 hsl(30 15% ${45 + i * 0.5}% / ${(1 - i / len) * 0.9})`);
      t.style.textShadow = layers.join(',');
    }
    let moved = false;
    addEventListener('pointermove', (e) => { moved = true; light(e.clientX, e.clientY); });
    (function auto(tm) { if (!moved) light(innerWidth / 2 + Math.cos(tm / 900) * innerWidth * 0.4, innerHeight * 0.2 + Math.sin(tm / 1400) * innerHeight * 0.15); requestAnimationFrame(auto); })(0);
  },
});
