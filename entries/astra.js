{
  // 登録時に共通の外枠を展開し、書き出した作品も単独で開けるようにする。
  const sheet = (title, art, controls) => `<main>
<header><h1>${title}</h1><span id="reading"></span></header>
<section class="stage" aria-label="作品">${art}</section>
<footer>${controls}</footer></main>`;
  const drawing = (label, box = '0 0 520 290') =>
    `<svg id="art" viewBox="${box}" role="img" aria-label="${label}"></svg>`;
  const slider = (label, id, min, max, value) =>
    `<label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="1" value="${value}">`;
  const button = (id, title) => `<button type="button" id="${id}">${title}</button>`;
  const style = (paper, ink, extra = '', scheme = 'light') => `
:root { color-scheme: ${scheme}; }
* { box-sizing: border-box; }
body { margin: 0; background: ${paper}; color: ${ink}; font: 15px/1.45 system-ui, sans-serif; }
main { min-height: 100%; height: 100dvh; display: grid; grid-template-rows: auto minmax(100px, 1fr) auto; }
header, footer { padding: 8px clamp(10px, 3vw, 28px); display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }
header { justify-content: space-between; border-bottom: 1px solid currentColor; }
h1 { margin: 0; font: 700 clamp(16px, 3vw, 26px)/1.35 Georgia, "Yu Mincho", serif; }
#reading { font-size: 12px; font-variant-numeric: tabular-nums; }
.stage { min-height: 0; min-width: 0; display: grid; place-items: center; position: relative; }
#art { display: block; width: 100%; height: 100%; min-height: 0; }
footer { border-top: 1px solid currentColor; font-size: 13px; }
button { padding: 4px 12px; font: inherit; color: inherit; border: 1px solid currentColor; border-radius: 4px; background: transparent; min-height: 32px; cursor: pointer; }
button:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
button:disabled { opacity: .55; cursor: default; }
input[type=range] { width: clamp(72px, 20vw, 180px); min-height: 30px; margin: 0; }
:where(button,input):focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
@media (max-height: 280px) { header, footer { padding-block: 3px; } }
${extra}`;

  dekiru.add({
    id: 'astra-fold-map',
    c: '3d',
    lv: 3,
    t: '一枚でたためる山折り地図',
    y: 'いちまいでたためるやまおりちず',
    tags: ['Astra', 'ミウラ折り', '平行四辺形', '平行投影'],
    d: '川が横切る一枚の地図を、山折りと谷折りでたたんでみよう。折る角度を深くすると、地図の横幅と奥行きが一緒に縮む。見る向きを変えると、川筋が紙の折り目を越えて続く様子を追える。',
    p: '横の辺を起こした分だけ、縦の辺が横へずれるように頂点を置く。辺の長さと二辺の内積が一定なので、どの面も元の平行四辺形の形を保つ。',
    html: sheet(
      '一枚でたためる山折り地図',
      '<canvas id="art" role="img" aria-label="山と川を刷った地図が、交互の折り目で蛇腹状に立ち上がる"></canvas>',
      slider('折る角度', 'fold', 0, 63, 42) + button('turn', '反対から見る')
    ),
    css: style(
      '#f4ebd6',
      '#263d37',
      '.stage { background: radial-gradient(ellipse at 50% 65%, #d7c7a6, #f4ebd6 68%); }'
    ),
    core() {
      function crease(i, j, angle) {
        const theta = (angle * Math.PI) / 180;
        const shift = 0.42 / Math.cos(theta);
        return [i * Math.cos(theta) + (j % 2) * shift, j * Math.sqrt(1 - shift * shift), (i % 2) * Math.sin(theta)];
      }
      function viewPoint([x, y, z], reverse) {
        const sign = reverse ? -1 : 1;
        return [260 + sign * (x * 37 - y * 24), 150 + sign * (x * 10 + y * 20) - z * 42];
      }
    },
    js() {
      const art = document.querySelector('#art'),
        fold = document.querySelector('#fold');
      let reverse = false;
      const g = art.getContext('2d');
      const tile = 96,
        paper = document.createElement('canvas');
      paper.width = 10 * tile;
      paper.height = 6 * tile;
      const ink = paper.getContext('2d');
      ink.scale(tile, tile);
      ink.fillStyle = '#ead8ae';
      ink.fillRect(0, 0, 10, 6);
      // 原図を一度だけ刷り、操作中は各面の矩形を切り出して写す。
      const colors = ['#92ad7e', '#9eb577', '#c4b074', '#d0a36b'];
      const hills = [
        [1.1, 1.4],
        [3.6, 4.5],
        [7.3, 0.7],
        [8.6, 4.6],
        [4.5, 0],
        [0.2, 5.5],
      ];
      hills.forEach(([cx, cy], hill) => {
        for (let ring = 10; ring > 0; ring--) {
          ink.beginPath();
          for (let k = 0; k < 72; k++) {
            const a = (k * Math.PI) / 36,
              r = ring * (0.14 + 0.024 * Math.sin(3 * a + hill) + 0.012 * Math.sin(5 * a));
            const x = cx + Math.cos(a) * r * 1.45,
              y = cy + Math.sin(a) * r;
            if (k === 0) ink.moveTo(x, y);
            else ink.lineTo(x, y);
          }
          ink.closePath();
          ink.fillStyle = colors[Math.floor((10 - ring) / 3)];
          ink.fill();
          ink.strokeStyle = '#6d835f';
          ink.lineWidth = 0.018;
          ink.stroke();
        }
      });
      const river = new Path2D('M-1 4 C1 4 1.6 2 3 2.6 S4.4 3.9 5.5 2.7 S7.6 3.3 10 .9');
      ink.strokeStyle = '#fff0ce';
      ink.lineWidth = 0.31;
      ink.stroke(river);
      ink.strokeStyle = '#398e96';
      ink.lineWidth = 0.21;
      ink.stroke(river);
      ink.strokeStyle = '#a95b43';
      ink.lineWidth = 0.05;
      ink.setLineDash([0.15, 0.06]);
      ink.stroke(new Path2D('M0 .4 Q3 1.2 4.8 3.5 T10 4.8'));
      ink.setLineDash([]);
      for (const [cx, cy] of [
        [2.2, 2.1],
        [5.3, 3.2],
        [8, 2.7],
      ]) {
        for (let k = 0; k < 8; k++) {
          ink.fillStyle = k % 3 ? '#ac6244' : '#766c53';
          ink.fillRect(cx + (k % 4) * 0.14, cy + Math.floor(k / 4) * 0.17 + Math.sin(k) * 0.04, 0.09, 0.1);
        }
      }
      function render() {
        const angle = Number(fold.value),
          far = crease(10, 6, angle),
          corner = crease(0, 1, angle);
        const centerX = (far[0] + corner[0]) / 2,
          centerY = far[1] / 2;
        const projected = (i, j) => {
          const [x, y, z] = crease(i, j, angle);
          return viewPoint([x - centerX, y - centerY, z - Math.sin((angle * Math.PI) / 180) / 2], reverse);
        };
        const dpr = Math.min(2, devicePixelRatio || 1),
          w = Math.max(1, Math.round(art.clientWidth * dpr)),
          h = Math.max(1, Math.round(art.clientHeight * dpr));
        if (art.width !== w) art.width = w;
        if (art.height !== h) art.height = h;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, w, h);
        const scale = Math.min(w / 530, h / 270);
        g.setTransform(scale, 0, 0, scale, w / 2 - 260 * scale, h / 2 - 145 * scale);
        for (let n = 0; n < 60; n++) {
          const cell = reverse ? 59 - n : n,
            i = cell % 10,
            j = Math.floor(cell / 10);
          const a = projected(i, j),
            b = projected(i + 1, j),
            d = projected(i, j + 1);
          g.save();
          g.transform(b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1], ...a);
          g.drawImage(paper, i * tile, j * tile, tile, tile, 0, 0, 1, 1);
          if (i % 2 === 0) {
            g.fillStyle = `rgba(38,62,58,${angle / 240})`;
            g.fillRect(0, 0, 1, 1);
          }
          g.strokeStyle = 'rgba(82,72,54,.52)';
          g.lineWidth = 0.012;
          g.strokeRect(0, 0, 1, 1);
          g.restore();
        }
        const value = `${angle}°`;
        fold.setAttribute('aria-valuetext', value);
        document.querySelector('#reading').textContent = value;
      }
      new ResizeObserver(render).observe(art);
      document.querySelector('#turn').onclick = () => {
        reverse = !reverse;
        render();
      };
      fold.oninput = render;
      render();
    },
  });

  dekiru.add({
    id: 'astra-striped-fox',
    c: 'pixel',
    lv: 2,
    t: '縞の向こうを走るキツネ',
    y: 'しまのむこうをはしるきつね',
    tags: ['Astra', 'スリットアニメーション', '空間分割', '印刷'],
    d: '六つの姿勢を細い縦縞に分け、一枚の版に交互に刷った。縞板を一目盛りずつ送ると、キツネが脚を伸ばしたり畳んだりする。板を外すと、一枚の紙に六コマすべてが残っている様子が分かる。',
    p: '縦一列ごとに六で割った余りを求めて、そこに刷るコマを選ぶ。縞板のすき間を一列ずらすたびに、次のコマに光が通る。',
    html: sheet(
      '縞の向こうを走るキツネ',
      drawing('六コマを刷り重ねたキツネと、脚の動きを分解した連続図'),
      button('advance', '縞板を一目盛り送る') + button('grille', '板を外す') + button('compare', '原画を隠す')
    ),
    css: style('#182933', '#ffe8bc', '.stage { background: #10222b; }', 'dark'),
    core() {
      const frameAt = (column) => ((column % 6) + 6) % 6;
      function stride(frame) {
        const t = (frameAt(frame) * Math.PI) / 3;
        return { front: Math.cos(t), back: Math.cos(t + 0.75), lift: Math.sin(2 * t) * 4, tail: Math.sin(t) * 9 };
      }
    },
    js() {
      const art = document.querySelector('#art');
      const fox = (k) => {
        const { front, back, lift, tail } = stride(k);
        const leg = (x, swing, color) =>
          `<path d="M${x} 0 q${swing * 18} 13 ${swing * 29} 21 l${swing * 17} ${13 - 8 * Math.abs(swing)} l-8 1" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
        return `<g transform="translate(0 ${lift})">
          ${leg(-18, -back, '#863e31')}${leg(22, -front, '#863e31')}
          <g transform="rotate(${tail} -31 -4)"><path d="M-21 0 Q-54 8 -81 -17 Q-96 -32 -111 -30 Q-90 -48 -61 -30 L-23 -17Z" fill="#ef7747"/><path d="M-79 -18 Q-96 -32 -111 -30 Q-96 -43 -80 -38 L-85 -32 L-73 -30Z" fill="#ffdf9b"/></g>
          ${leg(-20, back, '#dc6035')}${leg(22, front, '#dc6035')}
          <path d="M-38 -2 Q-33 -27 6 -21 L30 -24 L44 -45 L46 -30 L55 -40 L55 -25 L76 -14 L55 -8 L39 1 L22 6 Q0 -3 -19 9Z" fill="#ff9854"/>
          <path d="M31 -12 L47 -15 L58 -11 L74 -14 L55 -8 L39 1 L23 6Z" fill="#fff0c9"/><path d="M70 -16 L77 -14 L72 -11Z" fill="#352c30"/><circle cx="54" cy="-21" r="1.8" fill="#251f27"/></g>`;
      };
      let phase = 1,
        masked = true,
        compare = true;
      function render() {
        let defs = '',
          layers = '',
          strip = '';
        for (let k = 0; k < 6; k++) {
          const shift = frameAt(k) * 1.5;
          defs += `<g id="run${k}">${fox(k)}</g><pattern id="slit${k}" width="9" height="1" patternUnits="userSpaceOnUse"><rect x="${shift}" width="1.5" height="1" fill="white"/></pattern><mask id="slot${k}" maskUnits="userSpaceOnUse" x="0" y="0" width="520" height="207"><rect width="520" height="207" fill="url(#slit${k})"/></mask>`;
          layers += `<g mask="url(#slot${k})"><use href="#run${k}" transform="translate(288 122) scale(2.25)"/></g>`;
          strip += `<g transform="translate(${48 + k * 85} 247) scale(.40)"><use href="#run${k}"/></g><path d="M${9 + k * 85} 277h75" stroke="${k === phase ? '#ffb565' : '#52666a'}" stroke-width="${k === phase ? 4 : 1}"/>`;
        }
        // 暗い縞をかぶせ、開口部にあるコマだけを残す。
        defs += `<pattern id="screen" width="9" height="1" x="${phase * 1.5}" patternUnits="userSpaceOnUse"><rect x="1.5" width="7.5" height="1" fill="#10222b"/></pattern>`;
        const landscape = `<rect y="7" width="520" height="199" rx="6" fill="#587b7a"/>
          <circle cx="401" cy="79" r="62" fill="#e9bf80"/>
          <path d="M0 163L89 120l71 28 83-52 83 46 104-31 90 20v75H0Z" fill="#496668"/>
          <path d="M0 179l102-32 92 17 72-22 97 23 86-32 71 14v59H0Z" fill="#354e50"/>`;
        const comparison = `<g clip-path="url(#clear)"><use href="#land"/><use href="#run${phase}" transform="translate(288 122) scale(2.25)"/></g>
          <path d="M205 7v200" stroke="#f0d3a0" stroke-dasharray="3 3"/>
          <text x="12" y="25">縞板</text><text x="215" y="25">同じコマの原画</text>`;
        art.innerHTML = `<defs>${defs}<g id="land">${landscape}</g><clipPath id="clear"><rect x="205" y="7" width="315" height="200"/></clipPath></defs>
          <use href="#land"/>${layers}<g font-size="12" fill="#fff5dd">${masked ? `<rect y="7" width="520" height="200" fill="url(#screen)"/>${compare ? comparison : ''}` : '<text x="12" y="25">六コマの原版</text>'}</g>${strip}`;
        document.querySelector('#reading').textContent = `${phase + 1} / 6 コマ${masked ? '' : '　原版'}`;
        document.querySelector('#grille').textContent = masked ? '板を外す' : '板を重ねる';
        document.querySelector('#compare').disabled = !masked;
        document.querySelector('#compare').textContent = compare ? '原画を隠す' : '原画も見る';
      }
      document.querySelector('#advance').onclick = () => {
        phase = frameAt(phase + 1);
        masked = true;
        render();
      };
      document.querySelector('#grille').onclick = () => {
        masked = !masked;
        render();
      };
      document.querySelector('#compare').onclick = () => {
        compare = !compare;
        render();
      };
      render();
    },
  });

  dekiru.add({
    id: 'astra-parity-ticket',
    c: 'data',
    lv: 2,
    t: '一穴の誤りを探す検札機',
    y: 'ひとあなのあやまりをさがすけんさつき',
    tags: ['Astra', '二次元パリティ', '誤り訂正', 'パンチカード'],
    d: '紙の切符に並ぶ丸を押すと、選んだ一か所だけ穴の有無が反転する。右端と下端の検査欄で、穴の数が奇数になった行と列を探そう。二つが交わる穴を元に戻すと、すべての検査に通る。',
    p: '各行と各列の穴が偶数個になるように、あらかじめ検査用の穴を足す。一か所だけ変わった場合は、偶奇の崩れた行と列から位置が決まる。',
    html: sheet(
      '一穴の誤りを探す検札機',
      `<div class="ticket"><div class="stub"><b>検札</b><span>普通乗車券</span></div><div id="holes" aria-label="四行四列の穴と検査欄"></div></div>`,
      button('fix', '交点を直す') + '<span>丸を押して一か所変える</span>'
    ),
    css: style(
      '#e9dfcb',
      '#2b483e',
      `
.stage { background: repeating-linear-gradient(135deg, #e9dfcb 0 6px, #e4dac6 6px 7px); padding: 8px; }
.ticket { display: flex; width: min(87%, 540px, 88vh); height: 92%; max-height: 340px; background: #fff1cd; border-radius: 12px; border: 2px solid #386650; box-shadow: 4px 5px 0 #927c5a; padding: 8px; }
.stub { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: .4em; width: 26%; border-right: 2px dashed #947e56; color: #914530; }
.stub b { writing-mode: vertical-rl; font: 800 clamp(21px, 7vh, 46px) serif; letter-spacing: .18em; }
.stub span { writing-mode: vertical-rl; font: 12px serif; letter-spacing: .25em; }
#holes { flex: 1; margin-inline: 5%; display: grid; grid-template: repeat(5,1fr) / repeat(5,1fr); align-items: center; justify-items: center; }
.hole, .check { display: grid; place-items: center; width: min(90%,5.7vh); aspect-ratio: 1; padding: 0; min-height: 0; border-radius: 50%; font: bold clamp(10px,3.5vh,18px)/1 monospace; }
.hole { color: #34483d; border: 1px solid #7c846c; background: #f5e3bb; }
.hole[data-open=true] { background: #394d41; box-shadow: inset 1px 2px 0 #203327; }
.check { border-radius: 3px; color: #31573f; }
.bad { background: #9c3d26; color: white; }
.cross { outline: 2px dashed #a14028; outline-offset: 1px; }`
    ),
    core() {
      const parity = (row) => row.reduce((a, b) => a ^ b, 0);
      const columns = (grid) => grid[0].map((_, col) => grid.map((row) => row[col]));
      function encodeTicket(data) {
        const rows = data.map((row) => [...row, parity(row)]);
        return [...rows, columns(rows).map(parity)];
      }
      function inspectTicket(grid) {
        return [grid.findIndex((row) => parity(row)), columns(grid).findIndex((row) => parity(row))];
      }
    },
    js() {
      const ticket = encodeTicket([
        [1, 0, 1, 1],
        [0, 1, 1, 0],
        [1, 1, 0, 0],
        [1, 0, 0, 1],
      ]);
      ticket[1][2] ^= 1;
      function correct() {
        const [r, c] = inspectTicket(ticket);
        if (r >= 0 && c >= 0) ticket[r][c] ^= 1;
        return [r, c];
      }
      const box = document.querySelector('#holes');
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 5; c++) {
          const editable = r < 4 && c < 4;
          const el = document.createElement(editable ? 'button' : 'span');
          el.className = editable ? 'hole' : 'check';
          if (editable) {
            el.type = 'button';
            el.onclick = () => {
              const [oldRow, oldCol] = correct();
              if (oldRow !== r || oldCol !== c) ticket[r][c] ^= 1;
              render();
            };
          }
          box.append(el);
        }
      function render() {
        const [row, col] = inspectTicket(ticket);
        Array.from(box.children).forEach((el, i) => {
          const r = Math.floor(i / 5),
            c = i % 5;
          if (r < 4 && c < 4) {
            el.dataset.open = Boolean(ticket[r][c]);
            el.setAttribute('aria-label', `${r + 1}行${c + 1}列、${ticket[r][c] ? '穴あり' : '穴なし'}`);
            el.classList.toggle('cross', row === r && col === c);
          } else {
            const bad = r === row || c === col;
            el.classList.toggle('bad', bad);
            el.textContent = r === 4 && c === 4 ? '＋' : bad ? '×' : '✓';
            el.title =
              r === 4 && c === 4
                ? '検査欄'
                : `${r === 4 ? `${c + 1}列` : `${r + 1}行`}の穴は${bad ? '奇数' : '偶数'}個`;
          }
        });
        document.querySelector('#reading').textContent = row < 0 ? '検査合格' : `不一致　${row + 1}行 × ${col + 1}列`;
        document.querySelector('#fix').disabled = row < 0;
      }
      document.querySelector('#reading').setAttribute('role', 'status');
      document.querySelector('#fix').onclick = () => {
        const [row, col] = correct();
        render();
        box.children[row * 5 + col].focus();
      };
      render();
    },
  });

  dekiru.add({
    id: 'astra-shadow-scan',
    c: 'math',
    lv: 3,
    t: '影を集めて断面を撮る',
    y: 'かげをあつめてだんめんをとる',
    tags: ['Astra', '断層撮影', 'ラドン変換', '逆投影'],
    d: '円盤に閉じ込めた輪と粒を、何方向から透かして撮るか選べる。左の帯には、各方向で測った影の濃さが一段ずつ並ぶ。右の断面はその測定値から復元した像で、少ない方向では粒のまわりに筋が残る。',
    p: '光線が円を横切る長さを足して、角度別の測定値を作る。各列の差を強調するランプフィルターを通し、測定方向に沿って断面に足し戻す。',
    html: sheet(
      '影を集めて断面を撮る',
      `<div class="scanner"><figure><canvas width="81" height="48" id="film" role="img" aria-label="横に検出位置、縦に測定角度をとった透過量の帯"></canvas><figcaption>測定した影　0° → 180°未満</figcaption></figure><figure><canvas width="81" height="81" id="slice" role="img" aria-label="輪と、その中央や周囲に散らばる円粒の再構成像"></canvas><figcaption>復元した断面</figcaption></figure></div>`,
      slider('撮影方向の数', 'angles', 0, 4, 3)
    ),
    css: style(
      '#12242b',
      '#d4ede2',
      `
.scanner { width: min(92%, 840px, 153vh); display: grid; grid-template-columns: .85fr 1fr; align-items: center; gap: 6%; }
figure { margin: 0; text-align: center; min-width: 0; }
figure canvas { width: 100%; max-height: 56vh; object-fit: contain; }
#film { aspect-ratio: 1.14; object-fit: fill; border-block: 3px solid #c17a48; }
#slice { border-radius: 50%; width: min(100%, 54vh); height: auto; margin: auto; }
figcaption { margin-top: 5px; font: 12px system-ui; color: #ccdfd3; }
.stage { background: radial-gradient(ellipse at 65% 50%, #203d42, #0b1c21); }`,
      'dark'
    ),
    core() {
      function raySum(discs, angle, offset) {
        const cx = Math.cos(angle),
          sy = Math.sin(angle);
        let sum = 0;
        for (const [x, y, radius, density] of discs) {
          const d = offset - (x * cx + y * sy);
          if (Math.abs(d) < radius) sum += density * 2 * Math.sqrt(radius * radius - d * d);
        }
        return sum;
      }
      function rampFilter(samples, spacing) {
        return samples.map((v, i) => {
          let sum = v / 4;
          for (let j = 1; j < samples.length; j += 2) {
            sum -= ((samples[i - j] || 0) + (samples[i + j] || 0)) / (Math.PI * j) ** 2;
          }
          return sum / spacing;
        });
      }
      function reconstruct(discs, count, size) {
        const mid = (size - 1) / 2,
          values = new Float32Array(size * size),
          views = [];
        for (let k = 0; k < count; k++) {
          const angle = (k * Math.PI) / count,
            dx = Math.cos(angle),
            dy = Math.sin(angle);
          const samples = Array.from({ length: size }, (_, i) => raySum(discs, angle, i / mid - 1));
          const filtered = rampFilter(samples, 1 / mid);
          views.push(samples);
          for (let y = 0; y < size; y++) {
            let u = mid + (y - mid) * dy - mid * dx;
            for (let x = 0; x < size; x++, u += dx) {
              if (u < 0 || u >= size - 1) continue;
              const i = Math.floor(u);
              values[y * size + x] += ((filtered[i] + (u - i) * (filtered[i + 1] - filtered[i])) * Math.PI) / count;
            }
          }
        }
        return { views, values };
      }
    },
    js() {
      const discs = [
        [0, 0, 0.75, 0.22],
        [-0.16, -0.06, 0.43, 0.82],
        [-0.16, -0.06, 0.29, -0.82],
        [-0.15, -0.06, 0.11, 0.88],
        [0.37, 0.28, 0.17, 0.87],
        [0.4, -0.28, 0.095, 0.79],
        [0.12, -0.49, 0.055, 0.92],
        [-0.35, 0.45, 0.09, 0.6],
      ];
      const counts = [3, 6, 12, 24, 48],
        control = document.querySelector('#angles');
      function raster(el, width, height, value) {
        el.width = width;
        el.height = height;
        const g = el.getContext('2d'),
          img = g.createImageData(width, height);
        for (let i = 0; i < width * height; i++) {
          const t = Math.max(0, Math.min(1, value(i)));
          img.data[i * 4] = 12 + 239 * t;
          img.data[i * 4 + 1] = 28 + 202 * t ** 1.5;
          img.data[i * 4 + 2] = 34 + 127 * t ** 2.4;
          img.data[i * 4 + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      }
      function render() {
        const count = counts[control.value],
          n = 81;
        const { views, values } = reconstruct(discs, count, n);
        raster(document.querySelector('#film'), n, count, (i) => views[Math.floor(i / n)][i % n] / 1.24);
        raster(document.querySelector('#slice'), n, n, (i) => values[i]);
        const value = `${count} 方向`;
        control.setAttribute('aria-valuetext', value);
        document.querySelector('#reading').textContent = value;
      }
      control.oninput = render;
      render();
    },
  });

  dekiru.add({
    id: 'astra-knot-print',
    c: 'svg',
    lv: 3,
    t: '結び目の二色刷り',
    y: 'むすびめのにしょくずり',
    tags: ['Astra', 'トーラス結び目', '交差判定', '重ね刷り'],
    d: '二色の糸をより合わせた一本の紐が、輪の中を何度もくぐる。版を傾けると、投影した紐の交点が移っても手前の糸が上に見える。巻き数を切り替えると、三つ葉形と五つ葉形を見比べられる。',
    p: '隣り合わない線分どうしの交点を求め、交点での奥行きを補間する。手前を通る短い区間だけを輪郭ごと刷り重ねる。',
    html: sheet(
      '結び目の二色刷り',
      drawing('生成りの紙に刷った藍と朱の太い紐が、上下に交差して閉じた結び目を作る'),
      slider('版の傾き', 'tilt', -28, 28, 9) + button('winding', '五つ葉に替える')
    ),
    css: style(
      '#f8eaca',
      '#3d413b',
      '.stage { background: repeating-linear-gradient(2deg,#f6e7c6 0 3px,#f5e5c3 3px 4px); }'
    ),
    core() {
      function knot(t, wraps, tilt) {
        const r = 81 + 32 * Math.cos(wraps * t),
          x = r * Math.cos(2 * t),
          y = r * Math.sin(2 * t),
          z = 31 * Math.sin(wraps * t);
        const a = (tilt * Math.PI) / 180;
        return [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
      }
      function crossing(a, b, c, d) {
        const ux = b[0] - a[0],
          uy = b[1] - a[1],
          vx = d[0] - c[0],
          vy = d[1] - c[1];
        const det = ux * vy - uy * vx;
        if (Math.abs(det) < 1e-8) return null;
        const x = c[0] - a[0],
          y = c[1] - a[1],
          s = (x * vy - y * vx) / det,
          t = (x * uy - y * ux) / det;
        if (s < 0 || s >= 1 || t < 0 || t >= 1) return null;
        return { s, t, firstAbove: a[2] + s * (b[2] - a[2]) > c[2] + t * (d[2] - c[2]) };
      }
      function overpasses(points) {
        const n = points.length,
          passes = [];
        for (let i = 0; i < n; i++)
          for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            const hit = crossing(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n]);
            if (hit) passes.push(hit.firstAbove ? i + hit.s : j + hit.t);
          }
        return passes;
      }
    },
    js() {
      const art = document.querySelector('#art'),
        tilt = document.querySelector('#tilt');
      let wraps = 3;
      function render() {
        const steps = 180,
          at = (u) => knot(((u + 0.173) * 2 * Math.PI) / steps, wraps, +tilt.value);
        const points = Array.from({ length: steps }, (_, i) => at(i));
        const path = (pts) => 'M' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L');
        const layers = (d, offset = 0) =>
          `<path d="${d}" stroke="#382f2e" stroke-width="17"/><path d="${d}" stroke="#26595b" stroke-width="13.5"/><path d="${d}" stroke="#e69365" stroke-width="11" stroke-dasharray="2 4" stroke-dashoffset="${offset.toFixed(2)}"/><path d="${d}" stroke="#fff1c6" stroke-width="2" opacity=".7"/>`;
        const all = path([...points, points[0]]) + 'Z';
        const cumulative = [0];
        for (let i = 0; i < steps; i++) {
          const a = points[i],
            b = points[(i + 1) % steps];
          cumulative.push(cumulative[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
        }
        let print = layers(all);
        for (const u of overpasses(points)) {
          const i = Math.floor(u),
            pivot = at(u);
          // 交差の前後を紐の幅より長く取り、短い端が輪郭に出ないようにする。
          let lo = i,
            hi = i + 1;
          const dist = (v) => {
            const p = at(v);
            return Math.hypot(p[0] - pivot[0], p[1] - pivot[1]);
          };
          while (dist(lo) < 19) lo--;
          while (dist(hi) < 19) hi++;
          const part = Array.from({ length: hi - lo + 1 }, (_, k) => at(lo + k));
          print += layers(path(part), cumulative[((lo % steps) + steps) % steps]);
        }
        art.innerHTML = `<g transform="translate(260 145) scale(1.13)" fill="none" stroke-linejoin="round">${print}</g>`;
        const value = `${tilt.value}°`;
        tilt.setAttribute('aria-valuetext', value);
        document.querySelector('#reading').textContent = `${wraps === 3 ? '三' : '五'}つ葉　${value}`;
      }
      document.querySelector('#winding').onclick = (e) => {
        wraps = wraps === 3 ? 5 : 3;
        e.currentTarget.textContent = wraps === 3 ? '五つ葉に替える' : '三つ葉に替える';
        render();
      };
      tilt.oninput = render;
      render();
    },
  });

  dekiru.add({
    id: 'astra-chain-arch',
    c: 'particle',
    lv: 3,
    t: '鎖を返して架ける石橋',
    y: 'くさりをかえしてかけるいしばし',
    tags: ['Astra', '懸垂線', '弧長', '石橋'],
    d: '両岸に渡した鎖の上に、その形を上下に返した石橋を並べた。両端の距離を保って鎖を長くすると、鎖は深く垂れ、橋は高くなる。中央の要石と鎖の底は、水平の基準線から同じだけ離れている。',
    p: '両端の距離と鎖の長さから、懸垂線の係数を二分法で求める。同じ弧長ごとに点を取り、曲線に垂直な方向に幅を足して石の継ぎ目を作る。',
    html: sheet(
      '鎖を返して架ける石橋',
      drawing('両岸の橋台を結ぶ石のアーチと、その下に同じ形で垂れる鎖'),
      slider('鎖の長さ', 'chain', 104, 136, 124)
    ),
    css: style('#e4e1d1', '#344840', '.stage { background: linear-gradient(#eee8d6 0 50%, #dce6dd 50%, #bcd2cc); }'),
    core() {
      function chainScale(span, total) {
        let low = 0.01,
          high = 20;
        for (let n = 0; n < 44; n++) {
          const u = (low + high) / 2;
          if (Math.sinh(u) / u > total / span) high = u;
          else low = u;
        }
        return span / (low + high);
      }
      function linkPoint(span, total, fraction) {
        const a = chainScale(span, total),
          s = (fraction - 0.5) * total,
          x = a * Math.asinh(s / a);
        const sag = Math.hypot(a, total / 2) - Math.hypot(a, s);
        const slope = s / a,
          norm = Math.hypot(1, slope);
        return { x, sag, nx: slope / norm, ny: -1 / norm };
      }
    },
    js() {
      const art = document.querySelector('#art'),
        chain = document.querySelector('#chain');
      function render() {
        const span = 324,
          total = (span * Number(chain.value)) / 100,
          baseline = 143;
        const point = (t) => linkPoint(span, total, t);
        // 石の中心線と鎖を、橋台を結ぶ水平線の上下に対応させる。
        const edge = (p, w) => [260 + p.x + p.nx * w, baseline - p.sag + p.ny * w];
        let stone = '',
          links = '';
        const colors = ['#afa993', '#c9b99c', '#d9c9a4', '#c1ad8e'];
        for (let k = 0; k < 19; k++) {
          const a = point(k / 19),
            b = point((k + 1) / 19),
            thick = k === 9 ? 17 : 12;
          const corners = [edge(a, -10), edge(b, -10), edge(b, thick), edge(a, thick)];
          stone += `<polygon points="${corners.join(' ')}" fill="${k === 9 ? '#bf6648' : colors[k % 4]}" stroke="#53574b" stroke-width="1.1"/>`;
          const a1 = edge(a, thick - 3),
            b1 = edge(b, thick - 3);
          stone += `<path d="M${a1}L${b1}" stroke="#f2e6c8" stroke-width="1.8"/>`;
        }
        for (let k = 0; k < 37; k++) {
          const a = point(k / 37),
            b = point((k + 1) / 37);
          const dx = b.x - a.x,
            dy = b.sag - a.sag;
          links += `<ellipse transform="translate(${260 + (a.x + b.x) / 2} ${baseline + (a.sag + b.sag) / 2}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI})" rx="${Math.hypot(dx, dy) * 0.61}" ry="${k % 2 ? 1.5 : 3.1}" fill="none" stroke="#435855" stroke-width="2"/>`;
        }
        const sag = point(0.5).sag;
        const piers = [65, 422]
          .map(
            (x) =>
              `<g transform="translate(${x} 0)" fill="#b0ac95" stroke="#656d5e"><path d="M-5 130h43v12H-5zM0 142h30v113H0zM-6 255h42v8H-6z"/><path d="M0 162h30m-30 20h30m-30 20h30m-30 20h30m-30 20h30M15 142v20m0 20v20m0 20v20" fill="none"/></g>`
          )
          .join('');
        art.innerHTML = `${piers}<path d="M50 ${baseline}h420 M260 ${baseline - sag}v${2 * sag}" stroke="#738a79" stroke-dasharray="4 5" fill="none"/>${stone}${links}<circle cx="260" cy="${baseline + sag}" r="3" fill="#ac583d"/>`;
        const value = `支間の ${chain.value}%`;
        chain.setAttribute('aria-valuetext', value);
        document.querySelector('#reading').textContent = value;
      }
      chain.oninput = render;
      render();
    },
  });

  dekiru.add({
    id: 'astra-pearl-balance',
    c: 'game',
    lv: 2,
    t: '二度の計量と九粒の真珠',
    y: 'にどのけいりょうときゅうつぶのしんじゅ',
    tags: ['Astra', '天秤', '論理パズル', '三分探索'],
    d: '九粒のうち、一粒だけ軽い真珠を二度までの計量で当てよう。番号を押すたびに、真珠は卓上、左皿、右皿の順で移動する。左右に同じ数を載せて量ると、軽い皿が上がり、結果が記録に残る。',
    p: '同じ数を載せた天秤の結果は、左が軽い、右が軽い、つり合うの三通り。九粒を三粒ずつに分けてから候補二粒を一対一で比べると、必ず一粒に絞れる。',
    html: sheet(
      '二度の計量と九粒の真珠',
      `<div class="assay">${drawing('左右の皿に選んだ真珠が載り、計量すると軽い皿が上がる', '0 0 340 220')}<div><div id="pearls" aria-label="真珠の番号"></div><div id="history" aria-label="計量記録"></div></div></div>`,
      button('weigh', '量る') + button('guess', '答えを選ぶ') + button('restart', '新しい九粒')
    ),
    css: style(
      '#173a38',
      '#f3e6c4',
      `
.assay { width: min(95%, 860px); height: 100%; display: grid; grid-template-columns: 1.5fr 1fr; align-items: center; gap: 3%; }
#pearls { display: grid; grid-template-columns: repeat(3,1fr); gap: clamp(2px,1vh,6px); }
#pearls button { font: 600 clamp(12px,3.5vh,18px)/1.1 Georgia,serif; border-radius: 50%; background: radial-gradient(ellipse at 35% 20%, #fffcdf, #ebd1b7 45%, #94b1a7 75%, #657b77); color:#273f3c; border: 1px solid #bba574; min-height: 26px; padding: 3px; }
#pearls small { display:block; font: 10px system-ui; }
#history { margin-block-start: 6px; font-size: 11px; min-height: 2.8em; }
.stage { background: radial-gradient(ellipse at 45% 40%, #2c5249, #143330); }
@media (max-width: 370px) { .assay { grid-template-columns: 1.1fr 1fr; } }`,
      'dark'
    ),
    core() {
      function weighPearls(places, light) {
        const weight = [0, 0, 0],
          counts = [0, 0, 0];
        places.forEach((place, i) => {
          weight[place] += i === light ? 1 : 2;
          counts[place]++;
        });
        if (!counts[1] || counts[1] !== counts[2]) return null;
        return Math.sign(weight[1] - weight[2]);
      }
      const movePearl = (place) => (place + 1) % 3;
    },
    js() {
      const art = document.querySelector('#art'),
        pearls = document.querySelector('#pearls');
      const weigh = document.querySelector('#weigh'),
        guess = document.querySelector('#guess'),
        info = document.querySelector('#reading');
      const labels = ['卓上', '左皿', '右皿'];
      let light, places, records, state, tilt, message;
      function begin() {
        light = Math.floor(Math.random() * 9);
        places = [1, 1, 1, 2, 2, 2, 0, 0, 0];
        records = [];
        state = 'weigh';
        tilt = 0;
        message = '番号で置き場所を変更';
        render();
      }
      function render() {
        const heights = [0, 124 + tilt * 13, 124 - tilt * 13];
        const pans = [1, 2]
          .map((side) => {
            const x = side === 1 ? 73 : 267,
              y = heights[side];
            const contents = places.flatMap((s, i) => (s === side ? [i + 1] : []));
            const onPan = contents
              .map((n, i) => {
                const cx = x + ((i % 5) - (Math.min(contents.length, 5) - 1) / 2) * 15,
                  cy = y + 25 - Math.floor(i / 5) * 14;
                return `<circle cx="${cx}" cy="${cy}" r="8" fill="url(#pearl)"/><text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="9" fill="#243d36">${n}</text>`;
              })
              .join('');
            return `<path d="M${x - 47} ${y + 35}L${x} ${y - 56}l47 91" fill="none" stroke="#b79f70" stroke-width="1.6"/>${onPan}<path d="M${x - 48} ${y + 33}q48 41 96 0Z" fill="#c4a26c" stroke="#ecce92"/>`;
          })
          .join('');
        art.innerHTML = `<defs><radialGradient id="pearl" cx=".32" cy=".3"><stop stop-color="#fffde6"/><stop offset=".65" stop-color="#e2d3b9"/><stop offset="1" stop-color="#8f9e8f"/></radialGradient></defs><path d="M138 194h64l8 9h-80zM164 192l6-140 6 140Z" fill="#bd9a60" stroke="#ebcb8d"/><path d="M73 ${heights[1] - 56}L170 62l97 ${heights[2] - 118}" stroke="#e2bd7b" stroke-width="6" fill="none"/>${pans}<circle cx="170" cy="62" r="7" fill="#ddbc81" stroke="#604c35"/>`;
        Array.from(pearls.children).forEach((b, i) => {
          b.disabled = state === 'done';
          b.innerHTML = `${i + 1}<small>${labels[places[i]]}</small>`;
          b.setAttribute('aria-label', state === 'guess' ? `${i + 1}番と答える` : `${i + 1}番、${labels[places[i]]}`);
        });
        weigh.disabled = state !== 'weigh' || weighPearls(places, light) === null;
        guess.disabled = state === 'done' || (state === 'guess' && records.length === 2);
        guess.textContent = state === 'guess' ? '計量に戻る' : '答えを選ぶ';
        info.textContent = message;
        document
          .querySelector('#history')
          .replaceChildren(
            ...records.map((text) => Object.assign(document.createElement('div'), { textContent: text }))
          );
      }
      for (let i = 0; i < 9; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.onclick = () => {
          if (state === 'guess') {
            message = i === light ? `正解　${i + 1}番が軽い真珠` : `軽い真珠は ${light + 1}番`;
            state = 'done';
          } else {
            places[i] = movePearl(places[i]);
            tilt = 0;
            message = weighPearls(places, light) === null ? '左右に同じ数を載せる' : '計量できます';
          }
          render();
        };
        pearls.append(b);
      }
      weigh.onclick = () => {
        tilt = weighPearls(places, light);
        const ids = (side) => places.flatMap((s, i) => (s === side ? [i + 1] : [])).join('·');
        records.push(`${ids(1)} 対 ${ids(2)}　${tilt < 0 ? '左が軽い' : tilt > 0 ? '右が軽い' : 'つり合い'}`);
        message = records.length === 2 ? '軽い真珠の番号を選ぶ' : '残り一回';
        if (records.length === 2) state = 'guess';
        render();
      };
      guess.onclick = () => {
        state = state === 'weigh' ? 'guess' : 'weigh';
        message = state === 'guess' ? '軽い真珠の番号を選ぶ' : '番号で置き場所を変更';
        render();
      };
      document.querySelector('#restart').onclick = begin;
      info.setAttribute('role', 'status');
      begin();
    },
  });

  dekiru.add({
    id: 'astra-type-folio',
    c: 'text',
    lv: 2,
    t: '折る前の小さな活版帖',
    y: 'おるまえのちいさなかっぱんちょう',
    tags: ['Astra', '面付け', '中綴じ', '活字見本'],
    d: '季節の一字を刷った活版見本を、中綴じの小冊子に仕立てる。外側の紙から一枚ずつ選び、表裏に組んだページ番号を比べよう。最初と最後のページが同じ紙に並び、中心の紙では連続したページが向かい合う。',
    p: '左綴じの冊子では、同じ面に並ぶ左右の番号の和が総ページ数より一つ多い。外から一枚進むたび、前半の番号を二つ進め、後半の番号を二つ戻す。',
    html: sheet(
      '折る前の小さな活版帖',
      `<div id="stock"><div id="spread"></div></div>`,
      slider('外から何枚目', 'leaf', 1, 4, 1) + button('side', '裏を見る') + button('volume', '24ページにする')
    ),
    css: style(
      '#e1cdb5',
      '#3f3932',
      `
.stage { background: repeating-linear-gradient(0deg,#c4ab8e 0 1px,#cbb396 1px 5px); }
#stock { width: min(82%, 660px, 115vh); aspect-ratio: 1.7; padding: 5px; background: #ead5b0; box-shadow: 2px 3px #9c896f, 4px 6px #dfccaa, 5px 8px 10px #695744; transform: rotate(-1.5deg); }
#spread { display:grid; grid-template-columns: 1fr 1fr; height:100%; background: #fbefcf; }
.page { position: relative; padding: 7% 10%; display:grid; grid-template-rows: auto 1fr auto; color: var(--ink); min-width:0; }
.page:first-child { border-right: 1px dashed #ab9475; background: linear-gradient(90deg,transparent 91%,#d8c8a6); }
.page:last-child { background: linear-gradient(90deg,#e9dbba,transparent 7%); }
.page b { font: 700 clamp(42px,min(14vw,27vh),132px)/1 "Yu Mincho","MS PMincho",serif; text-align:center; align-self:center; }
.page em { font: normal 600 clamp(11px,1.7vw,17px)/1.4 "Yu Mincho",serif; border-block-end: 2px solid; }
.page div { display:flex; align-items:center; justify-content:space-between; border-block-start:1px solid; padding-top:3px; font: 12px Georgia,serif; }
.page i { display:inline-block; width:1em; height:1em; border:3px double currentColor; transform:rotate(45deg); }`
    ),
    core() {
      function impose(pages, sheetNo, back) {
        const offset = 2 * (sheetNo - 1);
        return back ? [2 + offset, pages - 1 - offset] : [pages - offset, 1 + offset];
      }
    },
    js() {
      const letters = Array.from('芽霞蕾燕藤露葵雨虹潮蛍蓮星稲萩霧菊穂栗霜雪柊氷暁');
      const inks = ['#364f5c', '#ac4935', '#537152', '#87505e'];
      const seasons = ['春', '夏', '秋', '冬'];
      const leaf = document.querySelector('#leaf'),
        side = document.querySelector('#side'),
        volume = document.querySelector('#volume');
      let pages = 16,
        back = false;
      function render() {
        const which = Number(leaf.value),
          pair = impose(pages, which, back);
        document.querySelector('#spread').innerHTML = pair
          .map((n) => {
            const index = Math.round(((n - 1) * 23) / (pages - 1)),
              season = Math.floor(index / 6);
            return `<article class="page" style="--ink:${inks[season]}"><em>${seasons[season]}の活字見本</em><b>${letters[index]}</b><div><i aria-hidden="true"></i><span>${n} 頁</span></div></article>`;
          })
          .join('');
        side.textContent = back ? '表を見る' : '裏を見る';
        volume.textContent = pages === 16 ? '24ページにする' : '16ページにする';
        leaf.setAttribute('aria-valuetext', `外から${which}枚目`);
        document.querySelector('#reading').textContent =
          `${which} / ${pages / 4} 枚　${back ? '裏面' : '表面'}　左綴じ`;
      }
      volume.onclick = () => {
        pages = pages === 16 ? 24 : 16;
        leaf.max = pages / 4;
        leaf.value = Math.min(Number(leaf.value), pages / 4);
        render();
      };
      side.onclick = () => {
        back = !back;
        render();
      };
      leaf.oninput = render;
      render();
    },
  });

  dekiru.add({
    id: 'astra-tidal-pass',
    c: 'canvas',
    lv: 3,
    t: '潮が越える砂の峠',
    y: 'しおがこえるすなのとうげ',
    tags: ['Astra', '浸水域', '幅優先探索', '等高線'],
    d: '砂丘に囲まれたくぼみと外海を、真上から見た標高図にした。潮位を上げると海に通じる場所から水が入り、低い砂の峠を越えたときに内側も青くなる。峠の前後を切り替えると、水が届く範囲の違いを見比べられる。',
    p: '海に接する左端から探索を始め、水面以下で上下左右につながる区画だけを塗る。くぼみの底が水面より低くても、その間に高い砂丘があれば水は届かない。',
    html: sheet(
      '潮が越える砂の峠',
      `<canvas id="art" width="156" height="92" role="img" aria-label="西側の海と東側のくぼみを結ぶ砂の峠を描いた標高図"></canvas><div class="key"><i></i>海から届いた水　<b></b>乾いた砂</div>`,
      slider('潮位', 'tide', 4, 78, 42) + button('pass', '峠を越える')
    ),
    css: style(
      '#e4ddc4',
      '#203f42',
      `
.stage { background:#d5d2b6; }
#art { image-rendering: pixelated; object-fit: contain; }
.key { position:absolute; bottom:4px; right:5px; background:#fff5d9ef; font: 11px system-ui; padding: 3px 6px; }
.key i,.key b { display:inline-block; width:1em; height:.7em; background:#337d83; }
.key b { background:#c99960; }`
    ),
    core() {
      function terrain(w, h) {
        const land = new Float32Array(w * h);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const u = x / (w - 1),
              v = y / (h - 1);
            const dx = (u - 0.62) / 0.25,
              dy = (v - 0.49) / 0.31;
            const radius = Math.hypot(dx, dy);
            const rough = 0.025 * Math.sin(27 * u + 6 * v) * Math.cos(23 * v) + 0.018 * Math.sin(36 * u - 19 * v);
            const coast = 0.04 + 0.63 * u + 0.33 * Math.abs(v - 0.5) + 0.09 * Math.sin(10 * v);
            const ridge = 0.18 + 0.6 * Math.exp(-((radius - 1) ** 2) / 0.12);
            const pass = 0.48 + 1.2 * Math.abs(v - 0.5) + Math.max(0, u - 0.61) * 2;
            const level = radius < 1.4 ? Math.min(ridge, pass) : coast;
            const edge = Math.max(0, Math.min(1, (radius - 1.18) / 0.22));
            land[y * w + x] = level * (1 - edge) + coast * edge + rough;
          }
        return land;
      }
      function inundate(land, w, h, level) {
        const wet = new Uint8Array(w * h),
          queue = new Int32Array(w * h);
        let head = 0,
          tail = 0;
        function admit(i) {
          if (!wet[i] && land[i] <= level) {
            wet[i] = 1;
            queue[tail++] = i;
          }
        }
        for (let y = 0; y < h; y++) admit(y * w);
        while (head < tail) {
          const i = queue[head++],
            x = i % w;
          if (x > 0) admit(i - 1);
          if (x < w - 1) admit(i + 1);
          if (i >= w) admit(i - w);
          if (i + w < w * h) admit(i + w);
        }
        return wet;
      }
      function opening(land, w, h, basin) {
        let low = 0,
          high = 100;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (inundate(land, w, h, mid / 100)[basin]) high = mid;
          else low = mid + 1;
        }
        return low;
      }
    },
    js() {
      const art = document.querySelector('#art'),
        g = art.getContext('2d'),
        tide = document.querySelector('#tide');
      const w = art.width,
        h = art.height,
        land = terrain(w, h);
      const basin = Math.floor(0.49 * h) * w + Math.floor(0.62 * w),
        sill = opening(land, w, h, basin);
      const dry = ['#eadbb0', '#e2cd9b', '#d7bb88', '#c6ac77', '#b6ab76', '#a1a174', '#908d64', '#8b7a59', '#796751'];
      const sea = ['#a0c9b8', '#7fb5a8', '#64a79e', '#46958f', '#39868a', '#337783', '#2e6976', '#2b5d6e'];
      function render() {
        const cm = Number(tide.value),
          level = cm / 100,
          wet = inundate(land, w, h, level);
        const bands = Array.from({ length: dry.length + sea.length }, () => new Path2D());
        for (let y = 0; y < h; y++) {
          let start = 0,
            prev = -1;
          for (let x = 0; x <= w; x++) {
            const i = y * w + x;
            let band = -1;
            if (x < w)
              band = wet[i]
                ? dry.length + Math.min(sea.length - 1, Math.floor((level - land[i]) * 17))
                : Math.max(0, Math.min(dry.length - 1, Math.floor(land[i] * 11)));
            if (prev !== band) {
              if (prev >= 0) bands[prev].rect(start, y, x - start, 1);
              start = x;
              prev = band;
            }
          }
        }
        [...dry, ...sea].forEach((ink, k) => {
          g.fillStyle = ink;
          g.fill(bands[k]);
        });
        // 五センチごとの主曲線と砂浜の細かな起伏を残す。
        g.fillStyle = 'rgba(93,81,51,.32)';
        for (let y = 1; y < h; y++)
          for (let x = 1; x < w; x++) {
            const i = y * w + x;
            if (wet[i]) continue;
            const band = Math.floor(land[i] * 20);
            if (band !== Math.floor(land[i - 1] * 20) || band !== Math.floor(land[i - w] * 20))
              g.fillRect(x, y, 1, 0.52);
          }
        g.fillStyle = 'rgba(222,240,215,.30)';
        for (let y = 4; y < h - 2; y += 5)
          for (let x = 3 + ((y * 7) % 11); x < w - 4; x += 13) {
            const i = y * w + x;
            if (wet[i] && wet[i + 3] && level - land[i] > 0.12) g.fillRect(x, y, 2 + (x % 3), 0.55);
          }
        g.fillStyle = '#f5eed1';
        for (let i = 1; i < w * h; i++)
          if (wet[i] && i % w && !wet[i - 1]) g.fillRect(i % w, Math.floor(i / w), 1, 1);
        const bx = basin % w,
          by = Math.floor(basin / w);
        g.beginPath();
        g.arc(bx, by, 2.3, 0, 2 * Math.PI);
        g.strokeStyle = '#273f3a';
        g.lineWidth = 1;
        g.stroke();
        const value = `${cm} cm`;
        tide.setAttribute('aria-valuetext', value);
        document.querySelector('#reading').textContent =
          `潮位 ${value}　くぼみは${wet[basin] ? '水の中' : '乾いたまま'}`;
        document.querySelector('#pass').textContent = wet[basin] ? '峠の手前に戻す' : '峠を越える';
      }
      document.querySelector('#pass').onclick = () => {
        tide.value = Number(tide.value) >= sill ? sill - 1 : sill;
        render();
      };
      tide.oninput = render;
      render();
    },
  });

  dekiru.add({
    id: 'astra-polar-section',
    c: 'effect',
    lv: 3,
    t: '偏光板の下の鉱物薄片',
    y: 'へんこうばんのしたのこうぶつはくへん',
    tags: ['Astra', '直交偏光', '干渉色', '複屈折'],
    d: '二枚の偏光板を直交させ、その間に結晶の薄片を置いた。標本台を回すと、結晶の向きによって一部の粒だけが暗くなる。厚さを変えると、同じ粒を通った光も別の色に見える。',
    p: '結晶軸と偏光板がなす角度から明るさを求める。さらに赤・緑・青の三波長で位相差を計算し、顕微鏡の視野に見える干渉色を近似する。',
    html: sheet(
      '偏光板の下の鉱物薄片',
      drawing('丸い顕微鏡の視野に、異なる干渉色と細い縞を示す結晶が隣り合う', '0 0 440 280'),
      slider('標本台', 'rotate', 0, 180, 21) + slider('厚さ', 'depth', 12, 58, 32)
    ),
    css: style('#162725', '#e2e5cc', '.stage { background: radial-gradient(ellipse,#223431,#101b1d 76%); }', 'dark'),
    core() {
      function transmission(axis, stage, retardation, wavelength) {
        const a = ((axis + stage) * Math.PI) / 180;
        return (Math.sin(2 * a) * Math.sin((Math.PI * retardation) / wavelength)) ** 2;
      }
      function crystalColor(axis, stage, thickness, birefringence) {
        const delay = 1000 * thickness * birefringence;
        const powers = [650, 535, 455].map((wave) => transmission(axis, stage, delay, wave));
        const mean = (powers[0] + powers[1] + powers[2]) / 3;
        return powers.map((power) => Math.round(12 + 233 * (0.83 * power + 0.17 * mean) ** 0.48));
      }
      function grainNoise(i, j) {
        const n = Math.sin(i * 74.1 + j * 113.7 + 0.73) * 43758.5453;
        return n - Math.floor(n);
      }
    },
    js() {
      const art = document.querySelector('#art'),
        rotation = document.querySelector('#rotate'),
        depth = document.querySelector('#depth');
      const grains = [],
        outlines = [];
      function vertex(i, j) {
        return [
          (i - 5) * 38 + 13 * Math.sin(j * 1.4) + 20 * (grainNoise(i, j) - 0.5),
          (j - 6) * 27 + 14 * (grainNoise(j + 2, i + 19) - 0.5),
        ];
      }
      // 辺の中点を両側から同じ位置にずらし、粒界を少し屈曲させる。
      function boundary(corners) {
        return corners
          .flatMap((a, k) => {
            const b = corners[(k + 1) % corners.length],
              x = (a[0] + b[0]) / 2,
              y = (a[1] + b[1]) / 2;
            return [a, [x + 4.5 * (grainNoise(x, y) - 0.5), y + 5.5 * (grainNoise(y, x) - 0.5)]];
          })
          .join(' ');
      }
      for (let j = 0; j < 12; j++)
        for (let i = 0; i < 10; i++) {
          const a = vertex(i, j),
            b = vertex(i + 1, j),
            c = vertex(i + 1, j + 1),
            d = vertex(i, j + 1);
          const faces =
            grainNoise(i + 7, j) > 0.47
              ? [
                  [a, b, c],
                  [a, c, d],
                ]
              : [[a, b, c, d]];
          faces.forEach((corners, k) => {
            const id = grains.length,
              n = grainNoise(i + 6, j + 17 + k * 8);
            const points = boundary(corners);
            outlines.push(`<clipPath id="grain${id}"><polygon points="${points}"/></clipPath>`);
            grains.push({
              points,
              axis: n * 170,
              biref: 0.008 + 0.044 * grainNoise(j + 9, i + k * 7),
              striped: n > 0.56,
              cx: a[0],
              cy: a[1],
            });
          });
        }
      art.innerHTML = `<defs><clipPath id="lens"><circle r="125"/></clipPath>${outlines.join('')}</defs><g transform="translate(220 140)"><circle r="135" fill="#273b37" stroke="#ab9768"/><g clip-path="url(#lens)"><g id="slide"></g></g><circle r="125.5" fill="none" stroke="#071918" stroke-width="2"/><path d="M-133 0h16m-8-6v12m250-6h10M0 -134v13M0 121v13" stroke="#e6d8ac"/></g>`;
      const slide = art.querySelector('#slide');
      slide.innerHTML = grains
        .map((g, i) => {
          let stripes = '';
          if (g.striped) for (let x = -100; x <= 100; x += 5) stripes += `M${x} -100l1 89 -1.5 48 1 63`;
          const detail = `<g clip-path="url(#grain${i})" fill="none" stroke="#171b1c" opacity=".32"><path d="M${g.cx - 9} ${g.cy + 7}l19 4 5 -2 3 3 12 2 9 6" stroke-width=".7"/><ellipse cx="${g.cx + 10}" cy="${g.cy + 9}" rx="1.2" ry=".7"/></g>`;
          return `<g><polygon points="${g.points}" stroke="#29312a" stroke-width=".6"/>${detail}${g.striped ? `<g clip-path="url(#grain${i})"><path d="${stripes}" fill="none" stroke-width="1.8" transform="translate(${g.cx} ${g.cy}) rotate(${g.axis})"/></g>` : ''}</g>`;
        })
        .join('');
      function render() {
        const angle = Number(rotation.value),
          thick = Number(depth.value);
        slide.setAttribute('transform', `rotate(${angle})`);
        Array.from(slide.children).forEach((el, i) => {
          const g = grains[i];
          el.firstElementChild.setAttribute('fill', `rgb(${crystalColor(g.axis, angle, thick, g.biref)})`);
          if (g.striped)
            el.lastElementChild.firstElementChild.setAttribute(
              'stroke',
              `rgb(${crystalColor(g.axis + 19, angle, thick, g.biref * 0.91)})`
            );
        });
        rotation.setAttribute('aria-valuetext', `${angle}°`);
        depth.setAttribute('aria-valuetext', `${thick} µm`);
        document.querySelector('#reading').textContent = `直交偏光　${angle}°　${thick} µm`;
      }
      rotation.oninput = depth.oninput = render;
      render();
    },
  });
}
