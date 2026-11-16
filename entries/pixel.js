/* 画像・ピクセル
 * どの項目も、見本の画像をその場で Canvas に描いて作る（外部の画像ファイルは使わない） */
dekiru.add({
  id: 'px-css-filters', c: 'pixel', lv: 1,
  t: 'CSSフィルター見本', y: 'しーえすえすふぃるたーみほん',
  tags: ['filter', '画像加工', 'スライダー', 'CSS'],
  d: 'ぼかし・明るさ・コントラスト・白黒・色相・彩度・セピア・反転を、スライダーで組み合わせて画像にかける。かけた結果の CSS もそのまま表示する。',
  p: 'filter は値を空白で並べると左から順にかかる。順番を変えると結果も変わる。',
  html: `
    <div class="wrap">
      <img id="img" alt="見本の風景">
      <div class="ctl" id="ctl"></div>
    </div>
    <code id="out"></code>`,
  css: `
    body { display: grid; place-content: center; gap: 12px; padding: 12px; background: #f2eee6; }
    .wrap { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: center; }
    img { width: min(420px, 60vw); border-radius: 10px; box-shadow: 0 4px 14px #0003; }
    .ctl { display: grid; grid-template-columns: auto 140px; gap: 4px 10px; font-size: 13px; }
    code { display: block; text-align: center; font-size: 12px; background: #fff; padding: 6px; border-radius: 6px; }`,
  js() {
    const c = document.createElement('canvas'); c.width = 480; c.height = 300;
    const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, 300); sky.addColorStop(0, '#3a6fd8'); sky.addColorStop(0.6, '#f7b38a'); sky.addColorStop(1, '#f3d27a');
    x.fillStyle = sky; x.fillRect(0, 0, 480, 300);
    x.fillStyle = '#fff3b0'; x.beginPath(); x.arc(330, 115, 42, 0, 7); x.fill();
    x.fillStyle = '#4a3f6b'; x.beginPath(); x.moveTo(0, 300); x.lineTo(0, 180); x.lineTo(120, 120); x.lineTo(220, 190); x.lineTo(320, 135); x.lineTo(480, 205); x.lineTo(480, 300); x.fill();
    x.fillStyle = '#2f855a'; x.fillRect(0, 250, 480, 50);
    x.fillStyle = '#fff'; x.font = '900 48px serif'; x.fillText('出来る', 26, 70);
    document.getElementById('img').src = c.toDataURL();
    const F = [['blur', 0, 10, 0, 'px'], ['brightness', 0, 200, 100, '%'], ['contrast', 0, 200, 100, '%'], ['grayscale', 0, 100, 0, '%'],
      ['hue-rotate', 0, 360, 0, 'deg'], ['saturate', 0, 300, 100, '%'], ['sepia', 0, 100, 0, '%'], ['invert', 0, 100, 0, '%']];
    const ctl = document.getElementById('ctl');
    for (const [name, min, max, val] of F) ctl.insertAdjacentHTML('beforeend', `<label for="f-${name}">${name}</label><input type="range" id="f-${name}" min="${min}" max="${max}" value="${val}">`);
    const apply = () => {
      const css = F.filter(([n, , , def]) => +document.getElementById('f-' + n).value !== def).map(([n, , , , u]) => `${n}(${document.getElementById('f-' + n).value}${u})`).join(' ') || 'none';
      document.getElementById('img').style.filter = css;
      document.getElementById('out').textContent = `filter: ${css};`;
    };
    ctl.addEventListener('input', apply);
    apply();
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.1; document.getElementById('f-hue-rotate').value = (t * 40) % 360; document.getElementById('f-saturate').value = 150 + Math.sin(t) * 100; apply(); }, 80); }
  },
}, {
  id: 'px-ascii-art', c: 'pixel', lv: 2,
  t: '画像を文字の絵に', y: 'がぞうをもじのえに',
  tags: ['アスキーアート', 'getImageData', '明るさ', '文字'],
  d: '画像を小さな升目に分け、升目の明るさに応じて「@%#*+=-:. 」の文字を置く。好きな画像を選ぶと、その画像が文字の絵になる。',
  html: `<label>画像を選ぶ <input type="file" id="f" accept="image/*"></label><pre id="o"></pre>`,
  css: `body { display: grid; justify-items: center; align-content: start; gap: 6px; padding: 8px; background: #fff; color: #111; } pre { margin: 0; font: 9px/9px ui-monospace, Consolas, monospace; letter-spacing: 1px; } label { font-size: 12px; }`,
  js() {
    const out = document.getElementById('o');
    const chars = '@%#*+=-:. ';
    function render(src) {
      const cols = Math.max(20, Math.floor(innerWidth / 6.6)), rows = Math.max(1, Math.floor(cols * (src.height / src.width) * 0.55));
      const c = document.createElement('canvas'); c.width = cols; c.height = rows;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(src, 0, 0, cols, rows);
      const d = x.getImageData(0, 0, cols, rows).data;
      let s = '';
      for (let y = 0; y < rows; y++) { for (let i = 0; i < cols; i++) { const k = (y * cols + i) * 4; s += chars[Math.floor(((d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114) / 256) * chars.length)]; } s += '\n'; }
      out.textContent = s;
    }
    const demo = document.createElement('canvas'); demo.width = 400; demo.height = 260;
    const x = demo.getContext('2d');
    const g = x.createRadialGradient(140, 110, 10, 200, 130, 220); g.addColorStop(0, '#fff'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.fillRect(0, 0, 400, 260);
    x.fillStyle = '#000'; x.font = '900 120px serif'; x.fillText('出来', 70, 190);
    render(demo);
    document.getElementById('f').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => render(img);
      img.src = URL.createObjectURL(file);
    });
  },
}, {
  id: 'px-edge-detect', c: 'pixel', lv: 2,
  t: '輪郭を取り出す', y: 'りんかくをとりだす',
  tags: ['ソーベル', 'たたみ込み', '輪郭', '画像処理'],
  d: '画素ごとに、右と左・上と下の明るさの差（ソーベルフィルター）を求める。差が大きい所が輪郭になる。元の画像と並べて見比べる。',
  html: `<div class="row"><canvas id="a"></canvas><canvas id="b"></canvas></div>`,
  css: `body { display: grid; place-items: center; background: #222; } .row { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; } canvas { width: min(46vw, 420px); border-radius: 8px; }`,
  js() {
    const W = 360, H = 240;
    const a = document.getElementById('a'), b = document.getElementById('b');
    a.width = b.width = W; a.height = b.height = H;
    const x = a.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#7fb8e6'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#f2c14e'; x.beginPath(); x.arc(270, 70, 35, 0, 7); x.fill();
    x.fillStyle = '#3d7d4a'; x.beginPath(); x.moveTo(0, H); x.lineTo(90, 110); x.lineTo(180, H); x.fill();
    x.fillStyle = '#c0502e'; x.fillRect(190, 130, 110, 90);
    x.fillStyle = '#7a2b1a'; x.beginPath(); x.moveTo(180, 135); x.lineTo(245, 85); x.lineTo(310, 135); x.fill();
    x.fillStyle = '#fff'; x.font = '900 36px serif'; x.fillText('輪郭', 30, 50);
    const src = x.getImageData(0, 0, W, H).data, out = b.getContext('2d').createImageData(W, H);
    const L = (i, j) => { const k = (Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))) * 4; return src[k] * 0.299 + src[k + 1] * 0.587 + src[k + 2] * 0.114; };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const gx = -L(i - 1, j - 1) - 2 * L(i - 1, j) - L(i - 1, j + 1) + L(i + 1, j - 1) + 2 * L(i + 1, j) + L(i + 1, j + 1);
      const gy = -L(i - 1, j - 1) - 2 * L(i, j - 1) - L(i + 1, j - 1) + L(i - 1, j + 1) + 2 * L(i, j + 1) + L(i + 1, j + 1);
      const m = Math.min(255, Math.hypot(gx, gy)), k = (j * W + i) * 4;
      out.data[k] = m * 0.4; out.data[k + 1] = m; out.data[k + 2] = m * 0.9; out.data[k + 3] = 255;
    }
    b.getContext('2d').putImageData(out, 0, 0);
  },
}, {
  id: 'px-dither', c: 'pixel', lv: 3,
  t: 'ディザリング三種', y: 'でぃざりんぐさんしゅ',
  tags: ['ディザリング', '誤差拡散', '組織的ディザ', '白黒'],
  d: '白と黒の2色だけで濃淡を表す方法を3つ並べる。しきい値で切るだけ、規則的な格子（ベイヤー行列）で切る、切り捨てた誤差を周りに配る（フロイド＝スタインバーグ）。',
  p: '誤差拡散は「この画素で丸めすぎた分を、まだ処理していない隣の画素に足しておく」方法。',
  html: `<div class="row"><figure><canvas></canvas><figcaption>しきい値</figcaption></figure><figure><canvas></canvas><figcaption>ベイヤー行列</figcaption></figure><figure><canvas></canvas><figcaption>誤差拡散</figcaption></figure></div>`,
  css: `body { display: grid; place-items: center; background: #e8e2d6; } .row { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; } figure { margin: 0; text-align: center; font-size: 13px; } canvas { width: min(30vw, 300px); image-rendering: pixelated; border-radius: 6px; }`,
  js() {
    const W = 200, H = 140;
    const src = document.createElement('canvas'); src.width = W; src.height = H;
    const sx = src.getContext('2d', { willReadFrequently: true });
    const g = sx.createRadialGradient(70, 60, 5, 100, 70, 130); g.addColorStop(0, '#fff'); g.addColorStop(1, '#000');
    sx.fillStyle = g; sx.fillRect(0, 0, W, H);
    sx.fillStyle = '#888'; sx.beginPath(); sx.arc(150, 90, 34, 0, 7); sx.fill();
    const lum = Array.from(sx.getImageData(0, 0, W, H).data.filter((_, i) => i % 4 === 0));
    const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const methods = [
      (v) => v.map((l) => (l < 128 ? 0 : 255)),
      (v) => v.map((l, i) => (l / 255 > (bayer[Math.floor(i / W) % 4][(i % W) % 4] + 0.5) / 16 ? 255 : 0)),
      (v) => { const e = Float32Array.from(v); for (let i = 0; i < e.length; i++) { const o = e[i], n = o < 128 ? 0 : 255, err = o - n; e[i] = n; const x = i % W; if (x + 1 < W) e[i + 1] += (err * 7) / 16; if (i + W < e.length) { if (x > 0) e[i + W - 1] += (err * 3) / 16; e[i + W] += (err * 5) / 16; if (x + 1 < W) e[i + W + 1] += err / 16; } } return Array.from(e); },
    ];
    document.querySelectorAll('canvas').forEach((c, k) => {
      c.width = W; c.height = H;
      const x = c.getContext('2d'), img = x.createImageData(W, H), r = methods[k](lum);
      r.forEach((v, i) => { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; });
      x.putImageData(img, 0, 0);
    });
  },
}, {
  id: 'px-pixel-sort', c: 'pixel', lv: 2,
  t: 'ピクセルソート', y: 'ぴくせるそーと',
  tags: ['グリッチアート', '並べ替え', '画素', '明るさ'],
  d: '各行で明るい画素が続く区間を見つけ、その中の画素を明るさ順に並べ替える。上の行から少しずつ並べ替えるので、画像が溶けて流れ落ちるように変わっていく。',
  html: `<canvas id="c"></canvas>`,
  css: `body { display: grid; place-items: center; background: #111; } canvas { width: min(94vw, 720px); border-radius: 8px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true });
    const W = 360, H = 240;
    c.width = W; c.height = H;
    function paint() {
      const g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#1d2671'); g.addColorStop(0.5, '#c33764'); g.addColorStop(1, '#f7b733');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 30; i++) { x.fillStyle = `hsl(${Math.random() * 360} 80% ${30 + Math.random() * 50}%)`; x.beginPath(); x.arc(Math.random() * W, Math.random() * H, 5 + Math.random() * 30, 0, 7); x.fill(); }
      x.fillStyle = '#fff'; x.font = '900 70px serif'; x.fillText('溶ける', 60, 150);
    }
    paint();
    let row = 0;
    const lum = (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    (function loop() {
      const img = x.getImageData(0, 0, W, H), d = img.data;
      for (let k = 0; k < 3 && row < H; k++, row++) {
        let i = 0;
        while (i < W) {
          while (i < W && lum(d, (row * W + i) * 4) < 90) i++;
          const s = i;
          while (i < W && lum(d, (row * W + i) * 4) >= 90) i++;
          const px = [];
          for (let j = s; j < i; j++) px.push(d.slice((row * W + j) * 4, (row * W + j) * 4 + 4));
          px.sort((a, b) => lum(a, 0) - lum(b, 0));
          px.forEach((p, j) => d.set(p, (row * W + s + j) * 4));
        }
      }
      x.putImageData(img, 0, 0);
      if (row >= H) { setTimeout(() => { paint(); row = 0; }, 1500); row = H + 1e9; }
      requestAnimationFrame(loop);
    })();
  },
}, {
  id: 'px-mosaic-brush', c: 'pixel', lv: 2,
  t: 'なぞってモザイク', y: 'なぞってもざいく',
  tags: ['モザイク', 'ぼかし', 'ドラッグ', '個人情報'],
  d: 'なぞった所だけを、升目ごとの平均色で塗りつぶしてモザイクにする。写真の見せたくない部分を隠す道具の仕組みと同じ。',
  html: `<canvas id="c"></canvas><p>画像をなぞるとモザイクがかかります <button id="r">元に戻す</button></p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #eae6de; touch-action: none; } canvas { width: min(92vw, 640px); border-radius: 8px; cursor: crosshair; } p { margin: 0; font-size: 13px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true });
    const W = 480, H = 300, S = 12;
    c.width = W; c.height = H;
    function draw() {
      x.fillStyle = '#fdf6e3'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#26407c'; x.font = '700 26px sans-serif'; x.fillText('名前: 山田 花子', 30, 60); x.fillText('電話: 090-1234-5678', 30, 110); x.fillText('住所: 〇〇県△△市', 30, 160);
      x.fillStyle = '#e0532f'; x.beginPath(); x.arc(380, 220, 50, 0, 7); x.fill();
    }
    draw();
    function blot(px, py) {
      const bx = Math.floor(px / S) * S, by = Math.floor(py / S) * S;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const cx = bx + ox * S, cy = by + oy * S;
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
        const d = x.getImageData(cx, cy, S, S).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        x.fillStyle = `rgb(${r / n},${g / n},${b / n})`; x.fillRect(cx, cy, S, S);
      }
    }
    let down = false;
    const at = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
    c.addEventListener('pointerdown', (e) => { down = true; c.setPointerCapture(e.pointerId); blot(...at(e)); });
    c.addEventListener('pointermove', (e) => down && blot(...at(e)));
    c.addEventListener('pointerup', () => { down = false; });
    document.getElementById('r').onclick = draw;
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.2; blot(40 + (t * 40) % 300, 100 + Math.sin(t) * 10); if (t > 8) { draw(); t = 0; } }, 60); }
  },
}, {
  id: 'px-palette-extract', c: 'pixel', lv: 3,
  t: '画像から主な色を抜き出す', y: 'がぞうからおもないろをぬきだす',
  tags: ['k平均法', '配色', '減色', 'クラスタリング'],
  d: '画像の色を k 平均法で6つのまとまりに分け、各まとまりの平均の色を抜き出す。その6色だけで画像を塗り直した結果も並べる。好きな画像も選べる。',
  p: '「一番近い代表色に振り分ける → 代表色を平均で更新する」を何度か繰り返すと、代表色が落ち着く。',
  html: `<label>画像を選ぶ <input type="file" id="f" accept="image/*"></label><div class="row"><canvas id="a"></canvas><canvas id="b"></canvas></div><div class="sw" id="sw"></div>`,
  css: `body { display: grid; justify-items: center; align-content: center; gap: 10px; background: #f4f1ea; font-size: 12px; } .row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; } canvas { width: min(44vw, 360px); border-radius: 8px; } .sw { display: flex; gap: 6px; } .sw div { width: 64px; height: 64px; border-radius: 10px; display: grid; place-items: end center; font: 10px ui-monospace, monospace; color: #fff; text-shadow: 0 1px 2px #000; padding-bottom: 4px; }`,
  js() {
    const a = document.getElementById('a'), b = document.getElementById('b');
    const W = 300, H = 200, K = 6;
    a.width = b.width = W; a.height = b.height = H;
    const ax = a.getContext('2d', { willReadFrequently: true });
    function demo() {
      const g = ax.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a5298'); g.addColorStop(1, '#f6a96b');
      ax.fillStyle = g; ax.fillRect(0, 0, W, H);
      ax.fillStyle = '#ffe08a'; ax.beginPath(); ax.arc(220, 70, 30, 0, 7); ax.fill();
      ax.fillStyle = '#2f6b46'; ax.fillRect(0, 150, W, 50);
      ax.fillStyle = '#c23b22'; ax.fillRect(40, 110, 60, 50);
    }
    function run() {
      const d = ax.getImageData(0, 0, W, H).data, pts = [];
      for (let i = 0; i < d.length; i += 16) pts.push([d[i], d[i + 1], d[i + 2]]);
      let cs = Array.from({ length: K }, (_, k) => pts[Math.floor((k + 0.5) * pts.length / K)].slice());
      const near = (p) => { let bi = 0, bd = Infinity; cs.forEach((cc, j) => { const dd = (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2 + (p[2] - cc[2]) ** 2; if (dd < bd) { bd = dd; bi = j; } }); return bi; };
      for (let it = 0; it < 12; it++) {
        const sum = cs.map(() => [0, 0, 0, 0]);
        for (const p of pts) { const j = near(p); sum[j][0] += p[0]; sum[j][1] += p[1]; sum[j][2] += p[2]; sum[j][3]++; }
        cs = cs.map((cc, j) => (sum[j][3] ? sum[j].slice(0, 3).map((v) => v / sum[j][3]) : cc));
      }
      const out = b.getContext('2d').createImageData(W, H);
      for (let i = 0; i < d.length; i += 4) { const cc = cs[near([d[i], d[i + 1], d[i + 2]])]; out.data[i] = cc[0]; out.data[i + 1] = cc[1]; out.data[i + 2] = cc[2]; out.data[i + 3] = 255; }
      b.getContext('2d').putImageData(out, 0, 0);
      const hex = (cc) => '#' + cc.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      document.getElementById('sw').innerHTML = cs.map((cc) => `<div style="background:${hex(cc)}">${hex(cc)}</div>`).join('');
    }
    demo(); run();
    document.getElementById('f').addEventListener('change', (e) => {
      const file = e.target.files[0]; if (!file) return;
      const img = new Image();
      img.onload = () => { ax.drawImage(img, 0, 0, W, H); run(); };
      img.src = URL.createObjectURL(file);
    });
  },
}, {
  id: 'px-drop-edit', c: 'pixel', lv: 2,
  t: '画像を落として加工・保存', y: 'がぞうをおとしてかこうほぞん',
  tags: ['ドラッグ&ドロップ', 'File API', '保存', 'toBlob'],
  d: '画像ファイルを枠に落とす（または選ぶ）と読み込み、白黒・セピア・反転・左右反転をかけて PNG で保存できる。画像はどこにも送信されず、ブラウザの中だけで処理される。',
  html: `
    <div class="drop" id="drop">ここに画像を落とす、または <label class="pick">選ぶ<input type="file" id="f" accept="image/*" hidden></label></div>
    <canvas id="c" hidden></canvas>
    <div class="bar"><button data-f="gray">白黒</button><button data-f="sepia">セピア</button><button data-f="invert">反転</button><button data-f="mirror">左右反転</button><button id="save">PNGで保存</button></div>`,
  css: `body { display: grid; justify-items: center; align-content: center; gap: 10px; padding: 10px; background: #f2f0ea; } .drop { width: min(90vw, 520px); padding: 30px; border: 3px dashed #aaa; border-radius: 14px; text-align: center; color: #666; } .drop.over { border-color: #e0532f; background: #fff3ee; } .pick { color: #26407c; text-decoration: underline; cursor: pointer; } canvas { max-width: 90vw; max-height: 55vh; border-radius: 8px; } .bar { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true }), drop = document.getElementById('drop');
    function load(file) {
      if (!file || !file.type.startsWith('image/')) return;
      const img = new Image();
      img.onload = () => { const k = Math.min(1, 1200 / img.width); c.width = img.width * k; c.height = img.height * k; x.drawImage(img, 0, 0, c.width, c.height); c.hidden = false; URL.revokeObjectURL(img.src); };
      img.src = URL.createObjectURL(file);
    }
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); load(e.dataTransfer.files[0]); });
    document.getElementById('f').addEventListener('change', (e) => load(e.target.files[0]));
    const ops = {
      gray: (r, g, b) => { const l = r * 0.299 + g * 0.587 + b * 0.114; return [l, l, l]; },
      sepia: (r, g, b) => [0.393 * r + 0.769 * g + 0.189 * b, 0.349 * r + 0.686 * g + 0.168 * b, 0.272 * r + 0.534 * g + 0.131 * b],
      invert: (r, g, b) => [255 - r, 255 - g, 255 - b],
    };
    document.querySelector('.bar').addEventListener('click', (e) => {
      const f = e.target.dataset.f;
      if (!f || c.hidden) return;
      if (f === 'mirror') { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0); x.save(); x.scale(-1, 1); x.drawImage(t, -c.width, 0); x.restore(); return; }
      const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const [r, g, b] = ops[f](d[i], d[i + 1], d[i + 2]); d[i] = r; d[i + 1] = g; d[i + 2] = b; }
      x.putImageData(img, 0, 0);
    });
    document.getElementById('save').onclick = () => { if (c.hidden) return; c.toBlob((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'edited.png'; a.click(); }); };
    // 見本の画像を最初に入れておく
    c.width = 400; c.height = 240; c.hidden = false;
    const g = x.createLinearGradient(0, 0, 400, 240); g.addColorStop(0, '#ff9a8b'); g.addColorStop(1, '#6a3093');
    x.fillStyle = g; x.fillRect(0, 0, 400, 240); x.fillStyle = '#fff'; x.font = '900 64px serif'; x.fillText('見本', 130, 140);
  },
}, {
  id: 'px-halftone', c: 'pixel', lv: 2,
  t: '網点（ハーフトーン）', y: 'あみてんはーふとーん',
  tags: ['網点', '印刷', '漫画', 'canvas'],
  d: '画像を升目に分け、暗い升目ほど大きな丸を描く。離れて見ると濃淡に見える、新聞や漫画のスクリーントーンの仕組み。升目の大きさを変えられる。',
  html: `<canvas id="c"></canvas><label>網点の間隔 <input type="range" id="s" min="4" max="20" value="8"></label>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #faf7f0; } canvas { width: min(92vw, 640px); } label { font-size: 13px; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const W = 480, H = 300;
    c.width = W; c.height = H;
    const src = document.createElement('canvas'); src.width = W; src.height = H;
    const sx = src.getContext('2d', { willReadFrequently: true });
    const g = sx.createRadialGradient(170, 130, 10, 240, 150, 300); g.addColorStop(0, '#fff'); g.addColorStop(1, '#000');
    sx.fillStyle = g; sx.fillRect(0, 0, W, H);
    sx.fillStyle = '#222'; sx.beginPath(); sx.arc(360, 170, 70, 0, 7); sx.fill();
    sx.fillStyle = '#fff'; sx.font = '900 90px serif'; sx.fillText('網', 330, 200);
    const d = sx.getImageData(0, 0, W, H).data;
    function draw() {
      const S = +document.getElementById('s').value;
      x.fillStyle = '#faf7f0'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#1b1a17';
      for (let y = 0; y < H; y += S) for (let xx = 0; xx < W; xx += S) {
        const k = ((y + (S >> 1)) * W + xx + (S >> 1)) * 4;
        const l = (d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114) / 255;
        const r = (1 - l) * S * 0.62;
        if (r > 0.2) { x.beginPath(); x.arc(xx + S / 2, y + S / 2, r, 0, 7); x.fill(); }
      }
    }
    document.getElementById('s').addEventListener('input', draw);
    draw();
  },
}, {
  id: 'px-histogram', c: 'pixel', lv: 2,
  t: '明るさのヒストグラム', y: 'あかるさのひすとぐらむ',
  tags: ['ヒストグラム', 'RGB', 'コントラスト', '分布'],
  d: '赤・緑・青のそれぞれで、明るさ 0〜255 の画素が何個あるかを数えて重ねて描く。コントラストを動かすと、山が左右に広がったり縮んだりする。',
  html: `<div class="row"><canvas id="img"></canvas><canvas id="h"></canvas></div><label>コントラスト <input type="range" id="k" min="0.3" max="2.5" step="0.05" value="1"></label>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #1b1d22; color: #ddd; } .row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; } canvas { width: min(44vw, 360px); border-radius: 6px; background: #000; } label { font-size: 13px; }`,
  js() {
    const ci = document.getElementById('img'), ch = document.getElementById('h');
    const W = 300, H = 200;
    ci.width = ch.width = W; ci.height = ch.height = H;
    const xi = ci.getContext('2d', { willReadFrequently: true }), xh = ch.getContext('2d');
    const base = document.createElement('canvas'); base.width = W; base.height = H;
    const bx = base.getContext('2d');
    const g = bx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#203a43'); g.addColorStop(0.5, '#e09f3e'); g.addColorStop(1, '#9e2a2b');
    bx.fillStyle = g; bx.fillRect(0, 0, W, H);
    for (let i = 0; i < 25; i++) { bx.fillStyle = `hsl(${i * 40} 70% ${30 + (i % 5) * 12}%)`; bx.fillRect((i % 5) * 60 + 5, Math.floor(i / 5) * 40 + 5, 30, 25); }
    function draw() {
      const k = +document.getElementById('k').value;
      xi.filter = `contrast(${k})`; xi.drawImage(base, 0, 0); xi.filter = 'none';
      const d = xi.getImageData(0, 0, W, H).data, hist = [new Array(256).fill(0), new Array(256).fill(0), new Array(256).fill(0)];
      for (let i = 0; i < d.length; i += 4) { hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; }
      const max = Math.max(...hist.flat());
      xh.fillStyle = '#000'; xh.fillRect(0, 0, W, H);
      xh.globalCompositeOperation = 'lighter';
      ['#f33', '#3f3', '#33f'].forEach((col, ch2) => {
        xh.fillStyle = col; xh.beginPath(); xh.moveTo(0, H);
        hist[ch2].forEach((v, i) => xh.lineTo((i / 255) * W, H - Math.sqrt(v / max) * H * 0.95));
        xh.lineTo(W, H); xh.fill();
      });
      xh.globalCompositeOperation = 'source-over';
    }
    document.getElementById('k').addEventListener('input', draw);
    draw();
  },
}, {
  id: 'px-before-after', c: 'pixel', lv: 1,
  t: '見比べスライダー', y: 'みくらべすらいだー',
  tags: ['比較', 'clip-path', 'input range', 'ビフォーアフター'],
  d: '加工前と加工後の画像をぴったり重ね、上の画像を clip-path で左右に切り抜く。切り抜く位置をスライダーで動かすと境目が動く。',
  p: 'スライダーは本物の input type="range" を透明にして重ねているので、キーボードでも動かせる。',
  html: `
    <div class="cmp" id="cmp">
      <img id="before" alt="加工前"><img id="after" alt="加工後">
      <div class="line"></div>
      <input type="range" id="r" min="0" max="100" value="50" aria-label="境目の位置">
    </div>`,
  css: `
    body { display: grid; place-items: center; background: #ece7dd; }
    .cmp { --p: 50%; position: relative; width: min(90vw, 600px); aspect-ratio: 8 / 5; border-radius: 10px; overflow: hidden; }
    .cmp img { position: absolute; inset: 0; width: 100%; height: 100%; }
    #after { clip-path: inset(0 0 0 var(--p)); }
    .line { position: absolute; top: 0; bottom: 0; left: var(--p); width: 3px; margin-left: -1.5px; background: #fff; box-shadow: 0 0 6px #0008; pointer-events: none; }
    .line::after { content: "⇔"; position: absolute; top: 50%; left: 50%; translate: -50% -50%; width: 36px; height: 36px; border-radius: 50%; background: #fff; display: grid; place-items: center; font-weight: 700; }
    input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: ew-resize; margin: 0; }`,
  js() {
    const c = document.createElement('canvas'); c.width = 480; c.height = 300;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, '#87b5e5'); g.addColorStop(1, '#f6d48a');
    x.fillStyle = g; x.fillRect(0, 0, 480, 300);
    x.fillStyle = '#3d7d4a'; x.beginPath(); x.ellipse(240, 330, 330, 120, 0, 0, 7); x.fill();
    x.fillStyle = '#e0532f'; x.beginPath(); x.arc(150, 120, 50, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.font = '900 52px serif'; x.fillText('比べる', 250, 140);
    document.getElementById('before').src = c.toDataURL();
    x.filter = 'grayscale(1) contrast(1.4)'; x.drawImage(c, 0, 0);
    document.getElementById('after').src = c.toDataURL();
    const cmp = document.getElementById('cmp'), r = document.getElementById('r');
    r.addEventListener('input', () => cmp.style.setProperty('--p', r.value + '%'));
    if (window.THUMB) { let t = 0; setInterval(() => { t += 0.05; r.value = 50 + Math.sin(t) * 40; cmp.style.setProperty('--p', r.value + '%'); }, 30); }
  },
}, {
  id: 'px-crop', c: 'pixel', lv: 2,
  t: '画像の切り抜き', y: 'がぞうのきりぬき',
  tags: ['トリミング', 'ドラッグ', 'drawImage', '範囲選択'],
  d: '画像の上をドラッグして範囲を選ぶと、その部分だけを drawImage で別のキャンバスに写す。選んだ範囲の外は暗くして見やすくする。',
  p: 'drawImage(元, sx, sy, sw, sh, dx, dy, dw, dh) の9引数版で、元画像の一部を切り出せる。',
  html: `<div class="row"><canvas id="a"></canvas><canvas id="b"></canvas></div><p>左の画像の上をドラッグして範囲を選びます</p>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 6px; background: #2a2d34; color: #ccc; touch-action: none; } .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: center; } #a { width: min(56vw, 480px); cursor: crosshair; } #b { width: min(32vw, 240px); background: #111; border-radius: 6px; } p { margin: 0; font-size: 12px; }`,
  js() {
    const a = document.getElementById('a'), b = document.getElementById('b');
    const W = 400, H = 260;
    a.width = W; a.height = H;
    const src = document.createElement('canvas'); src.width = W; src.height = H;
    const sx = src.getContext('2d');
    for (let i = 0; i < 40; i++) { sx.fillStyle = `hsl(${i * 9} 70% 55%)`; sx.fillRect((i % 8) * 50, Math.floor(i / 8) * 52, 50, 52); }
    sx.fillStyle = '#fff'; sx.font = '900 60px serif'; sx.fillText('切り抜き', 80, 150);
    const ax = a.getContext('2d'), bx = b.getContext('2d');
    let sel = { x: 120, y: 80, w: 160, h: 100 }, start = null;
    function draw() {
      ax.drawImage(src, 0, 0);
      ax.fillStyle = '#0009';
      ax.fillRect(0, 0, W, sel.y); ax.fillRect(0, sel.y + sel.h, W, H); ax.fillRect(0, sel.y, sel.x, sel.h); ax.fillRect(sel.x + sel.w, sel.y, W, sel.h);
      ax.strokeStyle = '#fff'; ax.setLineDash([6, 4]); ax.strokeRect(sel.x + 0.5, sel.y + 0.5, sel.w, sel.h); ax.setLineDash([]);
      if (sel.w > 2 && sel.h > 2) { b.width = sel.w; b.height = sel.h; bx.drawImage(src, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h); }
    }
    const at = (e) => { const r = a.getBoundingClientRect(); return [Math.max(0, Math.min(W, ((e.clientX - r.left) / r.width) * W)), Math.max(0, Math.min(H, ((e.clientY - r.top) / r.height) * H))]; };
    a.addEventListener('pointerdown', (e) => { a.setPointerCapture(e.pointerId); start = at(e); });
    a.addEventListener('pointermove', (e) => { if (!start) return; const p = at(e); sel = { x: Math.min(start[0], p[0]), y: Math.min(start[1], p[1]), w: Math.abs(p[0] - start[0]), h: Math.abs(p[1] - start[1]) }; draw(); });
    a.addEventListener('pointerup', () => { start = null; });
    draw();
  },
}, {
  id: 'px-loupe', c: 'pixel', lv: 2,
  t: 'ルーペとスポイト', y: 'るーぺとすぽいと',
  tags: ['スポイト', '拡大', '色の取得', 'getImageData'],
  d: 'マウスの下の画素を周りごと拡大して丸いルーペに映し、真ん中の画素の色を16進数で表示する。押すとその色を記録する。',
  html: `<canvas id="c"></canvas><canvas id="loupe" width="110" height="110"></canvas><div id="info"></div><div class="picked" id="picked"></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 8px; background: #f0ece4; } #c { width: min(92vw, 640px); cursor: none; } #loupe { position: fixed; pointer-events: none; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 4px 12px #0006; image-rendering: pixelated; display: none; } #info { font: 13px ui-monospace, monospace; } .picked { display: flex; gap: 4px; } .picked span { width: 26px; height: 26px; border-radius: 6px; box-shadow: inset 0 0 0 1px #0002; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true }), L = document.getElementById('loupe'), lx = L.getContext('2d');
    const W = 480, H = 300;
    c.width = W; c.height = H;
    for (let i = 0; i < W; i += 4) { x.fillStyle = `hsl(${(i / W) * 360} 85% 55%)`; x.fillRect(i, 0, 4, H); }
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#fff0'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    lx.imageSmoothingEnabled = false;
    let cur = '#000';
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect(), px = Math.floor(((e.clientX - r.left) / r.width) * W), py = Math.floor(((e.clientY - r.top) / r.height) * H);
      lx.clearRect(0, 0, 110, 110);
      lx.drawImage(c, px - 5, py - 5, 11, 11, 0, 0, 110, 110);
      lx.strokeStyle = '#fff'; lx.strokeRect(50, 50, 10, 10);
      const d = x.getImageData(px, py, 1, 1).data;
      cur = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      document.getElementById('info').textContent = `${cur}  rgb(${d[0]}, ${d[1]}, ${d[2]})`;
      Object.assign(L.style, { display: 'block', left: e.clientX + 16 + 'px', top: e.clientY + 16 + 'px' });
    });
    c.addEventListener('pointerleave', () => { L.style.display = 'none'; });
    c.addEventListener('click', () => { const s = document.createElement('span'); s.style.background = cur; s.title = cur; document.getElementById('picked').append(s); });
  },
}, {
  id: 'px-chroma-key', c: 'pixel', lv: 2,
  t: '緑色を抜いて合成する', y: 'みどりいろをぬいてごうせいする',
  tags: ['クロマキー', '合成', '透過', '画素'],
  d: '緑の背景の前にいる人物（の絵）から、緑に近い画素だけを透明にして、星空や夕焼けの上に重ねる。テレビの合成と同じ仕組み。',
  p: '「緑が赤と青より十分に強いか」で判定している。判定の強さを変えると抜け具合が変わる。',
  html: `<div class="row"><canvas id="a"></canvas><canvas id="b"></canvas></div><div class="bar"><button data-bg="star">星空</button><button data-bg="sun">夕焼け</button><button data-bg="sea">海</button></div>`,
  css: `body { display: grid; place-content: center; justify-items: center; gap: 10px; background: #222; } .row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; } canvas { width: min(44vw, 340px); border-radius: 8px; } .bar { display: flex; gap: 6px; }`,
  js() {
    const W = 320, H = 220;
    const a = document.getElementById('a'), b = document.getElementById('b');
    a.width = b.width = W; a.height = b.height = H;
    const ax = a.getContext('2d', { willReadFrequently: true }), bx = b.getContext('2d');
    ax.fillStyle = '#19c23a'; ax.fillRect(0, 0, W, H);
    ax.fillStyle = '#ffd8b0'; ax.beginPath(); ax.arc(160, 80, 38, 0, 7); ax.fill();
    ax.fillStyle = '#26407c'; ax.beginPath(); ax.ellipse(160, 200, 80, 70, 0, Math.PI, 0); ax.fill();
    ax.fillStyle = '#2b2118'; ax.beginPath(); ax.arc(160, 62, 40, Math.PI, 0); ax.fill();
    ax.fillStyle = '#222'; ax.beginPath(); ax.arc(146, 82, 4, 0, 7); ax.arc(174, 82, 4, 0, 7); ax.fill();
    const fg = ax.getImageData(0, 0, W, H);
    for (let i = 0; i < fg.data.length; i += 4) { const r = fg.data[i], g = fg.data[i + 1], bl = fg.data[i + 2]; if (g > 100 && g > r * 1.4 && g > bl * 1.4) fg.data[i + 3] = 0; }
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; tmp.getContext('2d').putImageData(fg, 0, 0);
    const BG = {
      star: () => { bx.fillStyle = '#0b1030'; bx.fillRect(0, 0, W, H); bx.fillStyle = '#fff'; for (let i = 0; i < 80; i++) bx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); },
      sun: () => { const g = bx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ff7e5f'); g.addColorStop(1, '#feb47b'); bx.fillStyle = g; bx.fillRect(0, 0, W, H); },
      sea: () => { bx.fillStyle = '#7fd0ff'; bx.fillRect(0, 0, W, H); bx.fillStyle = '#1f6fb2'; bx.fillRect(0, H * 0.6, W, H); },
    };
    const show = (k) => { BG[k](); bx.drawImage(tmp, 0, 0); };
    document.querySelector('.bar').addEventListener('click', (e) => e.target.dataset.bg && show(e.target.dataset.bg));
    show('star');
    if (window.THUMB) { const ks = Object.keys(BG); let i = 0; setInterval(() => show(ks[++i % 3]), 1200); }
  },
}, {
  id: 'px-pixel-art-zoom', c: 'pixel', lv: 1,
  t: 'ドット絵をくっきり拡大', y: 'どっとえをくっきりかくだい',
  tags: ['image-rendering', 'ドット絵', '拡大', 'pixelated'],
  d: '16×16 の小さな絵を大きく表示すると、普通はぼやける。image-rendering: pixelated を付けると、1画素がそのまま四角いマスとして拡大される。',
  html: `<div class="row"><figure><canvas id="a"></canvas><figcaption>なにもしない</figcaption></figure><figure><canvas id="b" class="px"></canvas><figcaption>pixelated</figcaption></figure></div>`,
  css: `body { display: grid; place-items: center; background: #dfe8e0; } .row { display: flex; gap: 6vmin; } figure { margin: 0; text-align: center; font: 13px ui-monospace, monospace; } canvas { width: 36vmin; aspect-ratio: 1; background: #fff; border-radius: 6px; } .px { image-rendering: pixelated; }`,
  js() {
    const art = [
      '................', '.....rrrrr......', '....rrrrrrrrr...', '....bbbsssks....', '...bsbsssssksss.', '...bsbbsssbssss.', '...bbsssskkkkk..', '.....ssssssss...',
      '....rrlrrr......', '...rrrlrrlrrr...', '..rrrrllllrrrr..', '..ssrlyllyrlss..', '..ssslllllllsss.', '..ssllllllllss..', '....lll..lll....', '...bbb....bbb...'];
    const col = { r: '#e0532f', b: '#6b3a1f', s: '#f6c28b', k: '#222', l: '#2b5fb3', y: '#ffd23f' };
    for (const id of ['a', 'b']) {
      const c = document.getElementById(id); c.width = c.height = 16;
      const x = c.getContext('2d');
      art.forEach((row, y) => [...row].forEach((ch, i) => { if (col[ch]) { x.fillStyle = col[ch]; x.fillRect(i, y, 1, 1); } }));
    }
  },
}, {
  id: 'px-blend-modes', c: 'pixel', lv: 2,
  t: '合成モード図鑑', y: 'ごうせいもーどずかん',
  tags: ['mix-blend-mode', '合成', '乗算', 'スクリーン'],
  d: '同じ2つの図形を、乗算・スクリーン・オーバーレイなど16通りの合成モードで重ねて並べる。重なった部分の色の変わり方を一覧で見比べられる。',
  html: `<div class="grid" id="g"></div>`,
  css: `
    body { background: #f4f1ea; padding: 10px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
    .cell { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: linear-gradient(135deg, #f2c14e, #3fb7e8); isolation: isolate; }
    .cell::before { content: ""; position: absolute; left: 15%; top: 15%; width: 55%; aspect-ratio: 1; border-radius: 50%; background: #e0532f; mix-blend-mode: var(--m); }
    .cell::after { content: ""; position: absolute; right: 12%; bottom: 12%; width: 50%; aspect-ratio: 1; background: #26407c; mix-blend-mode: var(--m); }
    .cell span { position: absolute; left: 4px; bottom: 3px; z-index: 1; font: 10px ui-monospace, monospace; background: #fffc; padding: 0 3px; border-radius: 3px; }`,
  js() {
    const modes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
    document.getElementById('g').innerHTML = modes.map((m) => `<div class="cell" style="--m:${m}"><span>${m}</span></div>`).join('');
  },
}, {
  id: 'px-convolution-lab', c: 'pixel', lv: 3,
  t: 'たたみ込みフィルター実験室', y: 'たたみこみふぃるたーじっけんしつ',
  tags: ['たたみ込み', 'カーネル', '画像処理', '行列'],
  d: '3×3 の数の表（カーネル）を自由に書き換えると、その場で画像にかかる。ぼかし・くっきり・輪郭・浮き彫りなどの典型も選べる。画像処理の多くはこの表の掛け算と足し算でできている。',
  p: '各画素の新しい色 = 周り9画素の色 × 表の数 の合計 ÷ 割る数。',
  html: `
    <div class="wrap">
      <canvas id="c"></canvas>
      <div class="side">
        <div class="k" id="k"></div>
        <label>割る数 <input id="div" type="number" value="1" step="1"></label>
        <select id="pre">
          <option value="0,0,0,0,1,0,0,0,0|1">そのまま</option><option value="1,1,1,1,1,1,1,1,1|9">ぼかし</option>
          <option value="0,-1,0,-1,5,-1,0,-1,0|1">くっきり</option><option value="-1,-1,-1,-1,8,-1,-1,-1,-1|1">輪郭</option>
          <option value="-2,-1,0,-1,1,1,0,1,2|1">浮き彫り</option><option value="1,2,1,2,4,2,1,2,1|16">ガウスぼかし</option>
        </select>
      </div>
    </div>`,
  css: `body { display: grid; place-items: center; background: #ece8df; } .wrap { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; align-items: center; } canvas { width: min(60vw, 420px); border-radius: 8px; } .side { display: grid; gap: 8px; font-size: 13px; } .k { display: grid; grid-template-columns: repeat(3, 52px); gap: 4px; } .k input, #div { width: 52px; text-align: center; }`,
  js() {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const W = 320, H = 220;
    c.width = W; c.height = H;
    const src = document.createElement('canvas'); src.width = W; src.height = H;
    const sx = src.getContext('2d', { willReadFrequently: true });
    const g = sx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#355c7d'); g.addColorStop(0.5, '#c06c84'); g.addColorStop(1, '#f8b195');
    sx.fillStyle = g; sx.fillRect(0, 0, W, H);
    sx.fillStyle = '#fff'; sx.font = '900 70px serif'; sx.fillText('畳込', 70, 140);
    for (let i = 0; i < 12; i++) { sx.strokeStyle = '#fff8'; sx.beginPath(); sx.arc(Math.random() * W, Math.random() * H, 8 + Math.random() * 20, 0, 7); sx.stroke(); }
    const sd = sx.getImageData(0, 0, W, H).data;
    const kEl = document.getElementById('k');
    for (let i = 0; i < 9; i++) kEl.insertAdjacentHTML('beforeend', `<input type="number" step="1" aria-label="カーネル ${Math.floor(i / 3) + 1}行${(i % 3) + 1}列">`);
    const ins = [...kEl.querySelectorAll('input')];
    function apply() {
      const k = ins.map((i) => +i.value || 0), dv = +document.getElementById('div').value || 1;
      const out = x.createImageData(W, H), d = out.data;
      for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
        let r = 0, gg = 0, b = 0, n = 0;
        for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) {
          const j = (Math.min(H - 1, Math.max(0, y + ky)) * W + Math.min(W - 1, Math.max(0, xx + kx))) * 4, kv = k[n++];
          r += sd[j] * kv; gg += sd[j + 1] * kv; b += sd[j + 2] * kv;
        }
        const i = (y * W + xx) * 4;
        d[i] = r / dv; d[i + 1] = gg / dv; d[i + 2] = b / dv; d[i + 3] = 255;
      }
      x.putImageData(out, 0, 0);
    }
    const pre = document.getElementById('pre');
    const load = () => { const [vals, dv] = pre.value.split('|'); vals.split(',').forEach((v, i) => { ins[i].value = v; }); document.getElementById('div').value = dv; apply(); };
    pre.addEventListener('change', load);
    kEl.addEventListener('input', apply);
    document.getElementById('div').addEventListener('input', apply);
    load();
    if (window.THUMB) { let i = 0; setInterval(() => { pre.selectedIndex = ++i % pre.options.length; load(); }, 1200); }
  },
});
