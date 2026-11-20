/* パイプ工房の部品集。1つの部品は「入力を受け取って出力を返す関数」1つだけ。
 * in: 受け取る型（none=材料を出す側, text, list, num, image, json, any。末尾 ? は省略可）
 * live: true の部品（カメラ・マイク・時計など）があると、パイプ全体を毎フレーム流し直す */
(function () {
  'use strict';
  const U = {};
  const GROUPS = { source: '材料を出す', text: '文字を変える', list: '並びを扱う', image: '画像を変える', view: '見せる' };
  function def(group, name, spec) { U[name] = { group, name, kana: '', tags: [], ...spec }; }

  /* ---------- 共通の道具 ---------- */
  const IW = 320, IH = 240;
  const clamp = (x) => (x < 0 ? 0 : x > 255 ? 255 : x);
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });
  const toCanvas = (img) => { const c = canvas(img.width, img.height); ctx2d(c).putImageData(img, 0, 0); return c; };
  const grab = (c) => ctx2d(c).getImageData(0, 0, c.width, c.height);
  const blank = (w, h) => new ImageData(w, h);
  const segG = () => new Intl.Segmenter('ja', { granularity: 'grapheme' });
  const graphemes = (s) => [...segG().segment(s)].map((x) => x.segment);
  // 画素ごとの変換。f(r,g,b,o,x,y) が o[0..2] に結果を書く
  function mapPx(img, f) {
    const out = blank(img.width, img.height), s = img.data, d = out.data, o = [0, 0, 0], w = img.width;
    for (let i = 0, p = 0; i < s.length; i += 4, p++) {
      f(s[i], s[i + 1], s[i + 2], o, p % w, (p / w) | 0);
      d[i] = clamp(o[0]); d[i + 1] = clamp(o[1]); d[i + 2] = clamp(o[2]); d[i + 3] = s[i + 3];
    }
    return out;
  }
  // 座標の写像（出力の各点が入力のどこから色を取るか）
  function warp(img, f) {
    const { width: w, height: h } = img, out = blank(w, h), s = img.data, d = out.data, pt = [0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      f(x, y, pt);
      const sx = Math.min(w - 1, Math.max(0, pt[0] | 0)), sy = Math.min(h - 1, Math.max(0, pt[1] | 0));
      const i = (y * w + x) * 4, j = (sy * w + sx) * 4;
      d[i] = s[j]; d[i + 1] = s[j + 1]; d[i + 2] = s[j + 2]; d[i + 3] = s[j + 3];
    }
    return out;
  }
  function convolve(img, k, bias = 0) {
    const { width: w, height: h } = img, s = img.data, out = blank(w, h), d = out.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) {
        const xx = Math.min(w - 1, Math.max(0, x + kx)), yy = Math.min(h - 1, Math.max(0, y + ky));
        const j = (yy * w + xx) * 4, kv = k[n++];
        r += s[j] * kv; g += s[j + 1] * kv; b += s[j + 2] * kv;
      }
      const i = (y * w + x) * 4;
      d[i] = clamp(r + bias); d[i + 1] = clamp(g + bias); d[i + 2] = clamp(b + bias); d[i + 3] = 255;
    }
    return out;
  }
  function sobel(img) {
    const { width: w, height: h } = img, s = img.data, g = new Float32Array(w * h), out = blank(w, h), d = out.data;
    for (let i = 0, p = 0; i < s.length; i += 4, p++) g[p] = lum(s[i], s[i + 1], s[i + 2]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const at = (xx, yy) => g[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
      const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const m = clamp(Math.hypot(gx, gy));
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = m; d[i + 3] = 255;
    }
    return out;
  }
  function boxBlur(img, r) {
    r = Math.max(1, Math.min(12, r | 0));
    const pass = (src, horiz) => {
      const { width: w, height: h } = src, s = src.data, out = blank(w, h), d = out.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let R = 0, G = 0, B = 0, n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = horiz ? Math.min(w - 1, Math.max(0, x + k)) : x, yy = horiz ? y : Math.min(h - 1, Math.max(0, y + k));
          const j = (yy * w + xx) * 4; R += s[j]; G += s[j + 1]; B += s[j + 2]; n++;
        }
        const i = (y * w + x) * 4; d[i] = R / n; d[i + 1] = G / n; d[i + 2] = B / n; d[i + 3] = 255;
      }
      return out;
    };
    return pass(pass(img, true), false);
  }
  const PALETTES = {
    retro: [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]],
    fire: [[0, 0, 0], [120, 10, 0], [230, 60, 0], [255, 170, 0], [255, 255, 200]],
    ice: [[0, 10, 30], [0, 70, 140], [80, 170, 230], [220, 245, 255]],
    heat: [[0, 0, 0], [30, 0, 120], [150, 0, 160], [240, 40, 40], [255, 200, 0], [255, 255, 255]],
    sepia: [[30, 18, 8], [120, 80, 40], [210, 170, 120], [250, 235, 210]],
    neon: [[10, 0, 30], [120, 0, 200], [0, 220, 255], [255, 255, 255]],
    sakura: [[60, 20, 40], [200, 80, 120], [255, 170, 200], [255, 240, 245]],
    mono: [[0, 0, 0], [255, 255, 255]],
  };
  function paletteMap(img, name, steps) {
    const pal = PALETTES[name];
    if (!pal) throw new Error(`パレット「${name}」はありません（${Object.keys(PALETTES).join(', ')}）`);
    return mapPx(img, (r, g, b, o) => {
      let t = lum(r, g, b) / 255;
      if (steps) { const k = Math.min(pal.length - 1, Math.round(t * (pal.length - 1))); o[0] = pal[k][0]; o[1] = pal[k][1]; o[2] = pal[k][2]; return; }
      const f = t * (pal.length - 1), k = Math.min(pal.length - 2, Math.floor(f)), u = f - k;
      for (let c = 0; c < 3; c++) o[c] = pal[k][c] + (pal[k + 1][c] - pal[k][c]) * u;
    });
  }
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  /* ---------- 見本の文章 ---------- */
  const SAMPLES = {
    iroha: 'いろはにほへと ちりぬるを\nわかよたれそ つねならむ\nうゐのおくやま けふこえて\nあさきゆめみし ゑひもせす',
    poem: 'ブラウザを開けば、道具はもう揃っている。文字を書き、色を塗り、音を鳴らし、絵を動かす。小さな部品をつなげば、大きな仕事も出来る。部品は小さく、つなぎ目は単純に。それがパイプの考え方だ。',
    jugemu: 'じゅげむ じゅげむ ごこうのすりきれ かいじゃりすいぎょの すいぎょうまつ うんらいまつ ふうらいまつ くうねるところに すむところ やぶらこうじの ぶらこうじ ぱいぽ ぱいぽ ぱいぽの しゅーりんがん しゅーりんがんの ぐーりんだい ぐーりんだいの ぽんぽこぴーの ぽんぽこなーの ちょうきゅうめいの ちょうすけ',
    csv: '月,売上,来客\n1月,120,340\n2月,98,300\n3月,143,410\n4月,160,452\n5月,171,480\n6月,150,431',
    json: '{"name":"出来る","tools":["HTML","CSS","JavaScript"],"libraries":0,"pipes":true}',
    md: '# 見出し\n\n**太字**と*斜体*と`コード`。\n\n- 箇条書きの1つめ\n- [MDN へのリンク](https://developer.mozilla.org/ja/)\n\n> 引用もこのとおり\n\n```\nconst ok = true;\n```',
    en: 'The quick brown fox jumps over the lazy dog. Small tools, joined well, do big work.',
    nums: '3 1 4 1 5 9 2 6 5 3 5 8 9 7 9 3 2 3 8 4 6 2 6 4 3 3 8 3 2 7 9 5',
  };

  /* ---------- カメラ・マイク ---------- */
  const media = {
    video: null, stream: null, ac: null, analyser: null, micStream: null, camC: null,
    async camera() {
      if (this.video && this.video.readyState >= 2) return this.video;
      if (!this._cam) {
        this._cam = (async () => {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
          const v = document.createElement('video');
          v.muted = true; v.playsInline = true; v.srcObject = stream;
          await v.play();
          this.video = v; this.stream = stream;
          return v;
        })().catch((e) => { this._cam = null; throw new Error('カメラを使えませんでした: ' + e.message); });
      }
      return this._cam;
    },
    async mic() {
      if (this.analyser) return this.analyser;
      if (!this._mic) {
        this._mic = (async () => {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const ac = new AudioContext();
          const an = ac.createAnalyser();
          an.fftSize = 256; an.smoothingTimeConstant = 0.75;
          ac.createMediaStreamSource(stream).connect(an);
          this.ac = ac; this.analyser = an; this.micStream = stream;
          return an;
        })().catch((e) => { this._mic = null; throw new Error('マイクを使えませんでした: ' + e.message); });
      }
      return this._mic;
    },
    stop() {
      for (const s of [this.stream, this.micStream]) if (s) s.getTracks().forEach((t) => t.stop());
      if (this.ac) this.ac.close();
      Object.assign(this, { video: null, stream: null, ac: null, analyser: null, micStream: null, _cam: null, _mic: null });
    },
  };

  /* ================= 材料を出す ================= */
  def('source', 'text', { in: 'text?', out: 'text', args: '[文字…]', kana: 'てきすと もじ', desc: '文字を出す。引数がなければ前の段の文字を通す', ex: 'text 出来る！ | big',
    fn: (v, a) => (a.length ? a.join(' ') : v ?? 'AI コーディングノート') });
  def('source', 'sample', { in: 'none', out: 'text', args: '[iroha|poem|jugemu|csv|json|md|en|nums]', kana: 'みほん さんぷる れいぶん', desc: '見本の文章を出す', ex: 'sample jugemu | chars | freq | head 10 | bar',
    fn: (v, [k = 'iroha']) => { if (!(k in SAMPLES)) throw new Error(`見本「${k}」はありません（${Object.keys(SAMPLES).join(', ')}）`); return SAMPLES[k]; } });
  def('source', 'seq', { in: 'none', out: 'list', args: '開始 [終了] [刻み]', kana: 'すうれつ れんばん', desc: '数を並べる。seq 10 なら 1〜10', ex: 'seq 1 30 | fizzbuzz | join " "',
    fn: (v, [a = 10, b, st = 1]) => { if (b === undefined) { b = a; a = 1; } const out = []; st = Math.abs(st) || 1; if (a <= b) for (let x = a; x <= b && out.length < 100000; x += st) out.push(+x.toFixed(10)); else for (let x = a; x >= b && out.length < 100000; x -= st) out.push(+x.toFixed(10)); return out; } });
  def('source', 'random', { in: 'none', out: 'list', args: '[個数=20] [最大=100]', kana: 'らんだむ らんすう でたらめ さいころ', desc: '1〜最大のでたらめな整数を並べる', ex: 'random 600 6 | freq | sort | bar',
    fn: (v, [n = 20, max = 100]) => Array.from({ length: Math.min(n, 1e6) }, () => 1 + Math.floor(Math.random() * max)) });
  def('source', 'gauss', { in: 'none', out: 'list', args: '[個数=1000] [平均=50] [ばらつき=15]', kana: 'せいきぶんぷ がうす', desc: '正規分布に従う数を並べる（ボックス＝ミュラー法）', ex: 'gauss 2000 | hist 20 | bar',
    fn: (v, [n = 1000, m = 50, sd = 15]) => Array.from({ length: Math.min(n, 1e6) }, () => +(m + sd * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())).toFixed(2)) });
  def('source', 'now', { in: 'none', out: 'text', kana: 'いま にちじ われき ひづけ', desc: '今の日時を和暦つきで出す（Intl.DateTimeFormat）', ex: 'now | big',
    fn: () => { const d = new Date(); return new Intl.DateTimeFormat('ja-JP-u-ca-japanese', { era: 'long', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(d) + ' ' + d.toLocaleTimeString('ja-JP'); } });
  def('source', 'clock', { in: 'none', out: 'text', live: true, kana: 'とけい じこく', desc: '時:分:秒 を出し続ける', ex: 'clock | big',
    fn: () => new Date().toLocaleTimeString('ja-JP', { hour12: false }) });
  def('source', 'mouse', { in: 'none', out: 'json', live: true, kana: 'まうす ざひょう', desc: '出力欄の上のマウス位置（0〜100）を出し続ける', ex: 'mouse | stringify',
    fn: (v, a, ctx) => ({ x: Math.round(ctx.mouse.x * 100), y: Math.round(ctx.mouse.y * 100) }) });
  def('source', 'gradient', { in: 'none', out: 'image', args: '[幅] [高さ]', kana: 'ぐらでーしょん いろ', desc: '色相が流れるグラデーション画像を作る', ex: 'gradient | posterize 5',
    fn: (v, [w = IW, h = IH]) => { const c = canvas(w, h), x = ctx2d(c); for (let i = 0; i < w; i++) { x.fillStyle = `hsl(${(i / w) * 360} 90% 55%)`; x.fillRect(i, 0, 1, h); } const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fff0'); g.addColorStop(1, '#000c'); x.fillStyle = g; x.fillRect(0, 0, w, h); return grab(c); } });
  def('source', 'noise', { in: 'none', out: 'image', args: '[細かさ=0.02]', kana: 'のいず ちけい くも', desc: '雲や地形のようななめらかなノイズ画像（バリューノイズを重ねる）', ex: 'noise | heat',
    fn: (v, [sc = 0.02]) => {
      const seed = Math.random() * 1000, hsh = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453; return s - Math.floor(s); };
      const sm = (t) => t * t * (3 - 2 * t);
      const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
      return mapPx(blank(IW, IH), (r, g, b, o, x, y) => { let n = 0, amp = 0.5, f = sc; for (let k = 0; k < 5; k++) { n += vn(x * f, y * f) * amp; amp /= 2; f *= 2; } o[0] = o[1] = o[2] = n * 255; });
    } });
  def('source', 'plasma', { in: 'none', out: 'image', live: true, kana: 'ぷらずま', desc: '三角関数を重ねてうねる色の模様（動き続ける）', ex: 'plasma | kaleido 8',
    fn: (v, a, ctx) => { const t = ctx.t; const img = blank(IW / 2, IH / 2); return mapPx(img, (r, g, b, o, x, y) => { const k = Math.sin(x / 9 + t) + Math.sin(y / 7 - t * 1.3) + Math.sin((x + y) / 11 + t * 0.7) + Math.sin(Math.hypot(x - 80, y - 60) / 6 - t * 2); o[0] = 128 + 127 * Math.sin(k * Math.PI); o[1] = 128 + 127 * Math.sin(k * Math.PI + 2.1); o[2] = 128 + 127 * Math.sin(k * Math.PI + 4.2); }); } });
  def('source', 'checker', { in: 'none', out: 'image', args: '[升の大きさ=20]', kana: 'いちまつ ちぇっかー', desc: '市松模様の画像', ex: 'checker | swirl 4',
    fn: (v, [s = 20]) => mapPx(blank(IW, IH), (r, g, b, o, x, y) => { const k = ((x / s) | 0) + ((y / s) | 0); o[0] = o[1] = o[2] = k % 2 ? 235 : 30; }) });
  def('source', 'shapes', { in: 'none', out: 'image', args: '[個数=40]', kana: 'ずけい まる しかく', desc: 'でたらめな色の丸と四角を散らした画像', ex: 'shapes | colors 6 | swatch',
    fn: (v, [n = 40]) => { const c = canvas(IW, IH), x = ctx2d(c); x.fillStyle = '#f4efe4'; x.fillRect(0, 0, IW, IH); const base = Math.random() * 360; for (let i = 0; i < n; i++) { x.fillStyle = `hsl(${base + Math.random() * 120} 75% ${35 + Math.random() * 35}%)`; const s = 10 + Math.random() * 60; if (Math.random() < 0.5) { x.beginPath(); x.arc(Math.random() * IW, Math.random() * IH, s / 2, 0, 7); x.fill(); } else x.fillRect(Math.random() * IW, Math.random() * IH, s, s); } return grab(c); } });
  def('source', 'textimg', { in: 'text?', out: 'image', args: '[文字] [大きさ=96]', kana: 'もじがぞう', desc: '文字を画像にする。前の段の文字も受け取れる', ex: 'textimg 出来る！ | wave 10 | rgbshift 6',
    fn: (v, [t, size = 96]) => { t = String(t ?? v ?? '出来る！'); const m = ctx2d(canvas(1, 1)); m.font = `800 ${size}px serif`; const w = Math.min(1600, Math.ceil(m.measureText(t).width + size * 0.6)), h = Math.ceil(size * 1.5); const c = canvas(w, h), x = ctx2d(c); x.fillStyle = '#111'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = `800 ${size}px "Hiragino Mincho ProN","Yu Mincho",serif`; x.textBaseline = 'middle'; x.fillText(t, size * 0.3, h / 2); return grab(c); } });
  def('source', 'camera', { in: 'none', out: 'image', live: true, kana: 'かめら うぇぶかめら', desc: 'カメラの映像（鏡像）を出し続ける。初回は許可を求める', ex: 'camera | gray | edge',
    fn: async (v, a, ctx) => { const vid = await media.camera(); if (!media.camC) media.camC = canvas(IW, IH); const x = ctx2d(media.camC); x.save(); x.scale(-1, 1); x.drawImage(vid, -IW, 0, IW, IH); x.restore(); return x.getImageData(0, 0, IW, IH); } });
  def('source', 'mic', { in: 'none', out: 'list', live: true, kana: 'まいく おと しゅうはすう', desc: 'マイクの音を周波数ごとの強さ（0〜255）の並びで出し続ける', ex: 'mic | bar',
    fn: async () => { const an = await media.mic(); const arr = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(arr); return Array.from(arr.slice(0, 48)); } });
  def('source', 'pi', { in: 'none', out: 'text', args: '[桁数=100]', kana: 'えんしゅうりつ ぱい', desc: 'BigInt とマチンの公式で円周率を計算する', ex: 'pi 300 | wrap 30',
    fn: (v, [n = 100]) => { n = Math.max(1, Math.min(5000, n | 0)); const sc = 10n ** BigInt(n + 10); const at = (x) => { let sum = 0n, term = sc / x, k = 1n, sg = 1n; const x2 = x * x; while (term !== 0n) { sum += (sg * term) / k; term /= x2; k += 2n; sg = -sg; } return sum; }; const s = ((16n * at(5n) - 4n * at(239n)) / 10n ** 10n).toString(); return s[0] + '.' + s.slice(1, n + 1); } });
  def('source', 'fib', { in: 'none', out: 'list', args: '[個数=30]', kana: 'ふぃぼなっち', desc: 'フィボナッチ数を BigInt で並べる', ex: 'fib 80 | tail 3',
    fn: (v, [n = 30]) => { const out = []; let a = 0n, b = 1n; for (let i = 0; i < Math.min(n, 2000); i++) { out.push(a.toString()); [a, b] = [b, a + b]; } return out; } });
  def('source', 'primes', { in: 'none', out: 'list', args: '[上限=100]', kana: 'そすう', desc: 'エラトステネスのふるいで素数を並べる', ex: 'primes 1000 | count',
    fn: (v, [n = 100]) => { n = Math.min(n | 0, 2e6); const sv = new Uint8Array(n + 1), out = []; for (let i = 2; i <= n; i++) { if (sv[i]) continue; out.push(i); for (let j = i * i; j <= n; j += i) sv[j] = 1; } return out; } });

  /* ================= 文字を変える ================= */
  def('text', 'upper', { in: 'text', out: 'text', kana: 'おおもじ', desc: '英字を大文字に', fn: (v) => v.toUpperCase() });
  def('text', 'lower', { in: 'text', out: 'text', kana: 'こもじ', desc: '英字を小文字に', fn: (v) => v.toLowerCase() });
  def('text', 'trim', { in: 'text', out: 'text', kana: 'くうはくじょきょ', desc: '前後の空白を取る', fn: (v) => v.trim() });
  def('text', 'reverse', { in: 'any', out: 'any', kana: 'さかさま ぎゃくじゅん', desc: '文字なら1文字ずつ逆に、並びなら順番を逆に', ex: 'text たけやぶやけた | reverse',
    fn: (v) => (Array.isArray(v) ? v.slice().reverse() : graphemes(String(v)).reverse().join('')) });
  def('text', 'repeat', { in: 'text', out: 'text', args: '[回数=3] [区切り]', kana: 'くりかえし', desc: '文字を繰り返す', fn: (v, [n = 3, sep = '']) => Array(Math.min(n, 5000)).fill(v).join(sep) });
  def('text', 'replace', { in: 'text', out: 'text', args: '探す文字 置き換える文字', kana: 'ちかん おきかえ', desc: '文字を置き換える（すべて）', ex: 'sample poem | replace 。 ！',
    fn: (v, [a = '', b = '']) => (a === '' ? v : v.split(String(a)).join(String(b))) });
  def('text', 'split', { in: 'text', out: 'list', args: '[区切り]', kana: 'ぶんかつ わける', desc: '区切り文字で分けて並びにする。省略すると空白で分ける', ex: 'text "a,b,c" | split ,',
    fn: (v, [sep]) => (sep === undefined ? v.split(/\s+/).filter(Boolean) : v.split(String(sep))) });
  def('text', 'chars', { in: 'text', out: 'list', kana: 'もじ いちもじずつ', desc: '1文字ずつに分ける（絵文字や濁点の結合文字も1文字として数える）', ex: 'sample jugemu | chars | freq | head 10 | bar',
    fn: (v) => graphemes(v).filter((s) => s.trim()) });
  def('text', 'words', { in: 'text', out: 'list', kana: 'たんご わかちがき', desc: 'Intl.Segmenter で日本語も単語に分ける', ex: 'sample poem | words | freq | cloud',
    fn: (v) => [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(v)].filter((s) => s.isWordLike).map((s) => s.segment) });
  def('text', 'lines', { in: 'text', out: 'list', kana: 'ぎょう', desc: '行ごとに分ける', fn: (v) => v.split(/\r?\n/) });
  def('text', 'kana', { in: 'text', out: 'text', kana: 'ひらがな', desc: 'カタカナをひらがなに', fn: (v) => v.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)) });
  def('text', 'kata', { in: 'text', out: 'text', kana: 'かたかな', desc: 'ひらがなをカタカナに', ex: 'sample iroha | kata', fn: (v) => v.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)) });
  def('text', 'zen', { in: 'text', out: 'text', kana: 'ぜんかく', desc: '半角英数を全角に', fn: (v) => v.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/ /g, '　') });
  def('text', 'han', { in: 'text', out: 'text', kana: 'はんかく せいき', desc: '全角英数・半角カナなどをそろえる（NFKC）', fn: (v) => v.normalize('NFKC') });
  def('text', 'count', { in: 'any', out: 'num', kana: 'かぞえる もじすう けんすう', desc: '文字なら文字数、並びなら件数', ex: 'sample jugemu | count',
    fn: (v) => (Array.isArray(v) ? v.length : graphemes(String(v)).length) });
  def('text', 'wc', { in: 'text', out: 'json', kana: 'もじすう ぎょうすう たんごすう', desc: '文字数・行数・単語数・原稿用紙の枚数を数える', ex: 'sample poem | wc',
    fn: (v) => { const ch = graphemes(v).filter((s) => s !== '\n').length; return { 文字数: ch, 行数: v.split('\n').length, 単語数: [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(v)].filter((s) => s.isWordLike).length, 原稿用紙: +(ch / 400).toFixed(2) + '枚' }; } });
  def('text', 'base64', { in: 'text', out: 'text', kana: 'べーすろくじゅうよん えんこーど', desc: 'UTF-8 として Base64 にする', ex: 'text 出来る | base64 | unbase64',
    fn: (v) => { let b = ''; for (const x of new TextEncoder().encode(v)) b += String.fromCharCode(x); return btoa(b); } });
  def('text', 'unbase64', { in: 'text', out: 'text', kana: 'でこーど', desc: 'Base64 を元の文字に戻す', fn: (v) => new TextDecoder().decode(Uint8Array.from(atob(v.trim()), (c) => c.charCodeAt(0))) });
  def('text', 'url', { in: 'text', out: 'text', kana: 'ゆーあーるえる えんこーど', desc: 'URL 用にエスケープする', fn: (v) => encodeURIComponent(v) });
  def('text', 'unurl', { in: 'text', out: 'text', kana: 'でこーど', desc: 'URL エスケープを戻す', fn: (v) => decodeURIComponent(v) });
  def('text', 'sha256', { in: 'text', out: 'text', kana: 'はっしゅ', desc: 'Web Crypto で SHA-256 のハッシュ値を求める', ex: 'text password | sha256',
    fn: async (v) => { if (!crypto.subtle) throw new Error('この環境では crypto.subtle が使えません（http://localhost か https で開いてください）'); const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); } });
  def('text', 'md', { in: 'text', out: 'html', kana: 'まーくだうん', desc: 'Markdown を HTML にする（小さな自作パーサー）', ex: 'sample md | md',
    fn: (v) => {
      const inline = (s) => escH(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      let out = '', list = false, code = null, para = [];
      const flush = () => { if (para.length) { out += `<p>${inline(para.join(' '))}</p>`; para = []; } if (list) { out += '</ul>'; list = false; } };
      for (const line of v.replace(/\r/g, '').split('\n')) {
        if (code !== null) { if (/^```/.test(line)) { out += `<pre><code>${escH(code)}</code></pre>`; code = null; } else code += (code ? '\n' : '') + line; continue; }
        let m;
        if (/^```/.test(line)) { flush(); code = ''; }
        else if ((m = /^(#{1,6})\s+(.*)/.exec(line))) { flush(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
        else if ((m = /^[-*]\s+(.*)/.exec(line))) { if (para.length) flush(); if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(m[1])}</li>`; }
        else if ((m = /^>\s?(.*)/.exec(line))) { flush(); out += `<blockquote>${inline(m[1])}</blockquote>`; }
        else if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flush(); out += '<hr>'; }
        else if (!line.trim()) flush();
        else { if (list) flush(); para.push(line); }
      }
      flush();
      return { html: `<div class="pv-md">${out}</div>` };
    } });
  def('text', 'json', { in: 'text', out: 'json', kana: 'じぇいそん ぱーす', desc: 'JSON の文字を読み込む', ex: 'sample json | json | stringify', fn: (v) => JSON.parse(v) });
  def('text', 'stringify', { in: 'any', out: 'text', kana: 'じぇいそん せいけい', desc: '何でも整形した JSON の文字にする', fn: (v) => JSON.stringify(v, null, 2) });
  def('text', 'csv', { in: 'text', out: 'list', kana: 'しーえすぶい ひょう', desc: 'CSV を行と列の並びにする（引用符にも対応）', ex: 'sample csv | csv | table',
    fn: (s) => { const rows = []; let row = [], cell = '', q = false; for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; } if (cell !== '' || row.length) { row.push(cell); rows.push(row); } return rows.filter((r) => r.some((x) => x !== '')); } });
  def('text', 'escape', { in: 'text', out: 'text', kana: 'えすけーぷ', desc: 'HTML の特別な文字を実体参照にする', fn: (v) => escH(v) });
  def('text', 'rot13', { in: 'text', out: 'text', kana: 'あんごう', desc: '英字を13文字ずらす', fn: (v) => v.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b); }) });
  def('text', 'caesar', { in: 'text', out: 'text', args: '[ずらす数=3]', kana: 'しーざーあんごう', desc: '英字とひらがなをずらす暗号', ex: 'text こんにちは | caesar 1',
    fn: (v, [n = 3]) => v.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((((c.charCodeAt(0) - b + n) % 26) + 26) % 26 + b); }).replace(/[ぁ-ん]/g, (c) => String.fromCharCode(0x3041 + ((((c.charCodeAt(0) - 0x3041 + n) % 83) + 83) % 83))) });
  const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
  def('text', 'morse', { in: 'text', out: 'text', kana: 'もーるすしんごう', desc: '英数字をモールス信号にする', ex: 'text "SOS HELP" | morse | big',
    fn: (v) => v.toLowerCase().split(/\s+/).map((w) => [...w].map((c) => MORSE[c] || '?').join(' ')).join(' / ') });
  def('text', 'binary', { in: 'text', out: 'text', kana: 'にしんすう びっと', desc: 'UTF-8 のバイト列を0と1で表す', ex: 'text 出来る | binary', fn: (v) => [...new TextEncoder().encode(v)].map((b) => b.toString(2).padStart(8, '0')).join(' ') });
  def('text', 'hex', { in: 'text', out: 'text', kana: 'じゅうろくしんすう', desc: 'UTF-8 のバイト列を16進数で表す', fn: (v) => [...new TextEncoder().encode(v)].map((b) => b.toString(16).padStart(2, '0')).join(' ') });
  def('text', 'slug', { in: 'text', out: 'text', kana: 'すらっぐ', desc: 'URL 向けの短い英字に', fn: (v) => v.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') });
  def('text', 'template', { in: 'any', out: 'any', args: '"…{}…"', kana: 'ひながた', desc: '{} に値を差し込む。並びなら1つずつ', ex: 'seq 1 5 | template "{}番目" | join " "',
    fn: (v, [t = '{}']) => (Array.isArray(v) ? v.map((x) => String(t).split('{}').join(String(x))) : String(t).split('{}').join(String(v))) });
  def('text', 'wrap', { in: 'text', out: 'text', args: '[文字数=20]', kana: 'おりかえし', desc: '決まった文字数で折り返す', fn: (v, [n = 20]) => { const g = graphemes(v.replace(/\n/g, '')); const out = []; for (let i = 0; i < g.length; i += n) out.push(g.slice(i, i + n).join('')); return out.join('\n'); } });
  def('text', 'kansuji', { in: 'num', out: 'text', kana: 'かんすうじ', desc: '数を漢数字にする', ex: 'text 2026 | kansuji | big',
    fn: (n) => { n = Math.floor(Math.abs(n)); if (!n) return '零'; const d = '〇一二三四五六七八九', sm = ['', '十', '百', '千'], lg = ['', '万', '億', '兆', '京']; let out = '', k = 0; while (n > 0 && k < lg.length) { const part = n % 10000; if (part) { let s = ''; for (let i = 3; i >= 0; i--) { const x = Math.floor(part / 10 ** i) % 10; if (x) s += (x === 1 && i > 0 ? '' : d[x]) + sm[i]; } out = s + lg[k] + out; } n = Math.floor(n / 10000); k++; } return out; } });
  def('text', 'comma', { in: 'num', out: 'text', kana: 'かんま けたくぎり えん', desc: '3桁ごとに区切る（Intl.NumberFormat）', fn: (n) => new Intl.NumberFormat('ja-JP').format(n) });
  def('text', 'speak', { in: 'text', out: 'text', args: '[速さ=1]', kana: 'よみあげ しゃべる おんせいごうせい', desc: '日本語で読み上げて、文字はそのまま通す', ex: 'text こんにちは、出来る図鑑です | speak',
    fn: (v, [rate = 1], ctx, i) => { const st = ctx.state.get('speak' + i); if (st !== v && 'speechSynthesis' in window) { ctx.state.set('speak' + i, v); speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(v.slice(0, 500)); u.lang = 'ja-JP'; u.rate = rate; speechSynthesis.speak(u); } return v; } });
  def('text', 'copy', { in: 'any', out: 'any', kana: 'こぴー くりっぷぼーど', desc: 'クリップボードにコピーして、値はそのまま通す',
    fn: async (v, a, ctx, i) => { const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2); if (ctx.state.get('copy' + i) !== s) { ctx.state.set('copy' + i, s); await navigator.clipboard.writeText(s); } return v; } });
  def('text', 'grep', { in: 'list', out: 'list', args: 'パターン', kana: 'けんさく ぐれっぷ ちゅうしゅつ', desc: 'パターン（正規表現）に合う行だけ残す', ex: 'sample iroha | lines | grep の',
    fn: (v, [p = '']) => { const re = new RegExp(String(p), 'i'); return v.filter((x) => re.test(String(x))); } });

  /* ================= 並びを扱う ================= */
  const nums = (v) => v.map(Number).filter(Number.isFinite);
  const keyOf = (x) => (typeof x === 'object' ? JSON.stringify(x) : String(x));
  def('list', 'sort', { in: 'list', out: 'list', args: '[desc|len|count]', kana: 'ならべかえ そーと', desc: '数なら小さい順、文字なら五十音順。desc で逆、len で長さ順、count で [名前, 数] を数の多い順', ex: 'random 10 | sort desc',
    fn: (v, [m]) => {
      const a = v.slice();
      const allNum = a.every((x) => !Array.isArray(x) && x !== '' && Number.isFinite(Number(x)));
      const cmp = (x, y) => String(x).localeCompare(String(y), 'ja', { numeric: true });
      if (m === 'len') a.sort((x, y) => String(x).length - String(y).length);
      else if (a.length && Array.isArray(a[0])) a.sort(m === 'count' ? (x, y) => Number(y[1]) - Number(x[1]) : (x, y) => cmp(x[0], y[0]));
      else if (allNum) a.sort((x, y) => x - y);
      else a.sort(cmp);
      return m === 'desc' ? a.reverse() : a;
    } });
  def('list', 'uniq', { in: 'list', out: 'list', kana: 'じゅうふくじょきょ ゆにーく', desc: '重なりを取り除く', ex: 'sample iroha | chars | uniq | count', fn: (v) => { const s = new Set(); return v.filter((x) => { const k = keyOf(x); if (s.has(k)) return false; s.add(k); return true; }); } });
  def('list', 'shuffle', { in: 'list', out: 'list', kana: 'しゃっふる まぜる', desc: 'フィッシャー＝イェーツ法で混ぜる', ex: 'seq 1 10 | shuffle', fn: (v) => { const a = v.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; } });
  def('list', 'head', { in: 'list', out: 'list', args: '[個数=10]', kana: 'せんとう', desc: '先頭から取り出す', fn: (v, [n = 10]) => v.slice(0, n) });
  def('list', 'tail', { in: 'list', out: 'list', args: '[個数=10]', kana: 'まつび さいご', desc: '末尾から取り出す', fn: (v, [n = 10]) => v.slice(-n) });
  def('list', 'filter', { in: 'list', out: 'list', args: '式（x と i が使える）', kana: 'しぼりこみ', desc: '式が真になるものだけ残す', ex: 'seq 1 50 | filter x%7==0',
    fn: (v, a) => { const f = new Function('x', 'i', 'return (' + a.join(' ') + ')'); return v.filter((x, i) => f(x, i)); } });
  def('list', 'map', { in: 'list', out: 'list', args: '式（x と i が使える）', kana: 'へんかん いっせい', desc: '1つずつ式で変える', ex: 'seq 1 10 | map x*x | bar',
    fn: (v, a) => { const f = new Function('x', 'i', 'return (' + a.join(' ') + ')'); return v.map((x, i) => f(x, i)); } });
  def('list', 'sum', { in: 'list', out: 'num', kana: 'ごうけい', desc: '合計', ex: 'seq 1 100 | sum', fn: (v) => nums(v).reduce((a, b) => a + b, 0) });
  def('list', 'avg', { in: 'list', out: 'num', kana: 'へいきん', desc: '平均', fn: (v) => { const n = nums(v); return n.length ? +(n.reduce((a, b) => a + b, 0) / n.length).toFixed(4) : 0; } });
  def('list', 'max', { in: 'list', out: 'num', kana: 'さいだい', desc: '最大', fn: (v) => Math.max(...nums(v)) });
  def('list', 'min', { in: 'list', out: 'num', kana: 'さいしょう', desc: '最小', fn: (v) => Math.min(...nums(v)) });
  def('list', 'stats', { in: 'list', out: 'json', kana: 'とうけい へいきん ぶんさん', desc: '件数・合計・平均・中央値・標準偏差をまとめて出す', ex: 'gauss 1000 | stats',
    fn: (v) => { const n = nums(v).sort((a, b) => a - b); if (!n.length) return {}; const s = n.reduce((a, b) => a + b, 0), m = s / n.length; const sd = Math.sqrt(n.reduce((a, b) => a + (b - m) ** 2, 0) / n.length); const md = n.length % 2 ? n[n.length >> 1] : (n[n.length / 2 - 1] + n[n.length / 2]) / 2; return { 件数: n.length, 合計: +s.toFixed(4), 平均: +m.toFixed(4), 中央値: md, 最小: n[0], 最大: n[n.length - 1], 標準偏差: +sd.toFixed(4) }; } });
  def('list', 'freq', { in: 'list', out: 'list', kana: 'ひんど しゅうけい かぞえる', desc: '同じものを数えて、多い順に [もの, 回数] を並べる', ex: 'sample jugemu | chars | freq | head 12 | bar',
    fn: (v) => { const m = new Map(); for (const x of v) m.set(keyOf(x), (m.get(keyOf(x)) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); } });
  def('list', 'hist', { in: 'list', out: 'list', args: '[区間の数=10]', kana: 'ひすとぐらむ どすうぶんぷ', desc: '数を区間に分けて数える', ex: 'gauss 3000 | hist 24 | bar',
    fn: (v, [bins = 10]) => { const n = nums(v); if (!n.length) return []; const lo = Math.min(...n), hi = Math.max(...n), w = (hi - lo) / bins || 1, c = new Array(bins).fill(0); for (const x of n) c[Math.min(bins - 1, Math.floor((x - lo) / w))]++; return c.map((k, i) => [+(lo + i * w).toFixed(1), k]); } });
  def('list', 'col', { in: 'list', out: 'list', args: '[列番号=1]', kana: 'れつ', desc: '表（行の並び）から [1列目, 指定列] の組を取り出す。見出し行は飛ばす', ex: 'sample csv | csv | col 2 | bar',
    fn: (v, [n = 1]) => { const rows = v.filter(Array.isArray); const body = rows.length && !Number.isFinite(Number(rows[0][n])) ? rows.slice(1) : rows; return body.map((r) => [r[0], Number(r[n])]); } });
  def('list', 'nums', { in: 'text', out: 'list', kana: 'すうじ ちゅうしゅつ', desc: '文字の中から数を拾い出す', ex: 'sample nums | nums | bar', fn: (v) => (v.match(/-?\d+(\.\d+)?/g) || []).map(Number) });
  def('list', 'join', { in: 'list', out: 'text', args: '[区切り]', kana: 'つなげる けつごう', desc: '並びを1つの文字につなぐ', fn: (v, [sep = '']) => v.map((x) => (Array.isArray(x) ? x.join(':') : String(x))).join(String(sep)) });
  def('list', 'nl', { in: 'list', out: 'list', kana: 'ぎょうばんごう', desc: '行番号を付ける', fn: (v) => v.map((x, i) => `${String(i + 1).padStart(3)}  ${Array.isArray(x) ? x.join(': ') : x}`) });
  def('list', 'fizzbuzz', { in: 'list', out: 'list', kana: 'ふぃずばず', desc: '3の倍数は Fizz、5の倍数は Buzz に', fn: (v) => v.map((x) => (x % 15 === 0 ? 'FizzBuzz' : x % 3 === 0 ? 'Fizz' : x % 5 === 0 ? 'Buzz' : x)) });
  def('list', 'isprime', { in: 'list', out: 'list', kana: 'そすう はんてい', desc: '素数だけ残す', ex: 'seq 1 100 | isprime', fn: (v) => nums(v).filter((n) => { if (n < 2 || n % 1) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }) });
  def('list', 'pick', { in: 'list', out: 'any', args: '[個数=1]', kana: 'ちゅうせん えらぶ おみくじ', desc: 'でたらめに選ぶ。1個なら値そのもの', ex: 'text "大吉 中吉 小吉 吉 末吉 凶" | split | pick | big',
    fn: (v, [n = 1]) => { const a = v.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return n === 1 ? a[0] : a.slice(0, n); } });
  def('list', 'chunk', { in: 'list', out: 'list', args: '[大きさ=3]', kana: 'わける くぎる', desc: '決まった数ずつまとめる', fn: (v, [n = 3]) => { const out = []; for (let i = 0; i < v.length; i += n) out.push(v.slice(i, i + n)); return out; } });

  /* ================= 画像を変える ================= */
  const I = (name, spec) => def('image', name, { in: 'image', out: 'image', ex: `camera | ${name}`, ...spec });
  I('gray', { kana: 'しろくろ はいいろ ぐれー', desc: '明るさだけの白黒にする', fn: (v) => mapPx(v, (r, g, b, o) => { o[0] = o[1] = o[2] = lum(r, g, b); }) });
  I('invert', { kana: 'はんてん ねが', desc: '色を反転する', fn: (v) => mapPx(v, (r, g, b, o) => { o[0] = 255 - r; o[1] = 255 - g; o[2] = 255 - b; }) });
  I('sepia', { kana: 'せぴあ ふるいしゃしん', desc: '古い写真のような茶色に', fn: (v) => mapPx(v, (r, g, b, o) => { o[0] = 0.393 * r + 0.769 * g + 0.189 * b; o[1] = 0.349 * r + 0.686 * g + 0.168 * b; o[2] = 0.272 * r + 0.534 * g + 0.131 * b; }) });
  I('threshold', { args: '[しきい値=128]', kana: 'にちか しきいち', desc: '白と黒の2色にする', fn: (v, [t = 128]) => mapPx(v, (r, g, b, o) => { o[0] = o[1] = o[2] = lum(r, g, b) > t ? 255 : 0; }) });
  I('posterize', { args: '[段階=4]', kana: 'ぽすたりぜーしょん げんしょく', desc: '色の段階を減らしてポスター風に', fn: (v, [n = 4]) => { const s = 255 / Math.max(1, n - 1); return mapPx(v, (r, g, b, o) => { o[0] = Math.round(r / s) * s; o[1] = Math.round(g / s) * s; o[2] = Math.round(b / s) * s; }); } });
  I('pixelate', { args: '[升の大きさ=8]', kana: 'もざいく どっと', desc: 'モザイク（ドット絵風）にする', fn: (v, [n = 8]) => { n = Math.max(1, n | 0); return warp(v, (x, y, p) => { p[0] = ((x / n) | 0) * n + (n >> 1); p[1] = ((y / n) | 0) * n + (n >> 1); }); } });
  I('blur', { args: '[半径=2]', kana: 'ぼかし ぶらー', desc: '箱型の平均でぼかす', fn: (v, [r = 2]) => boxBlur(v, r) });
  I('edge', { kana: 'りんかく せんが そーべる', desc: 'ソーベル法で輪郭を取り出す', ex: 'camera | edge | invert', fn: (v) => sobel(v) });
  I('outline', { kana: 'せんが えんぴつ', desc: '白地に黒い線の線画にする', ex: 'camera | outline', fn: (v) => mapPx(sobel(v), (r, g, b, o) => { o[0] = o[1] = o[2] = 255 - r * 1.6; }) });
  I('emboss', { kana: 'えんぼす うきぼり', desc: '浮き彫りのように', fn: (v) => mapPx(convolve(v, [-2, -1, 0, -1, 1, 1, 0, 1, 2], 0), (r, g, b, o) => { o[0] = o[1] = o[2] = lum(r, g, b) * 0.6 + 70; }) });
  I('sharpen', { kana: 'しゃーぷ くっきり', desc: '輪郭をくっきりさせる', fn: (v) => convolve(v, [0, -1, 0, -1, 5, -1, 0, -1, 0]) });
  I('dither', { kana: 'でぃざりんぐ', desc: 'フロイド＝スタインバーグ法で白黒の点に散らす', ex: 'plasma | dither',
    fn: (v) => { const { width: w, height: h } = v, g = new Float32Array(w * h); for (let i = 0, p = 0; p < g.length; i += 4, p++) g[p] = lum(v.data[i], v.data[i + 1], v.data[i + 2]); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = y * w + x, old = g[p], nw = old < 128 ? 0 : 255, e = old - nw; g[p] = nw; if (x + 1 < w) g[p + 1] += (e * 7) / 16; if (y + 1 < h) { if (x > 0) g[p + w - 1] += (e * 3) / 16; g[p + w] += (e * 5) / 16; if (x + 1 < w) g[p + w + 1] += e / 16; } } return mapPx(v, (r, gg, b, o, x, y) => { o[0] = o[1] = o[2] = g[y * w + x]; }); } });
  I('halftone', { args: '[網点の間隔=6]', kana: 'はーふとーん あみてん', desc: '新聞の写真のような網点にする',
    fn: (v, [s = 6]) => { s = Math.max(3, s | 0); const c = canvas(v.width, v.height), x = ctx2d(c); x.fillStyle = '#f7f2e6'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#1b1a17'; for (let y = 0; y < v.height; y += s) for (let xx = 0; xx < v.width; xx += s) { const i = ((y + (s >> 1)) * v.width + xx + (s >> 1)) * 4; if (i >= v.data.length) continue; const r = (1 - lum(v.data[i], v.data[i + 1], v.data[i + 2]) / 255) * s * 0.62; if (r > 0.3) { x.beginPath(); x.arc(xx + s / 2, y + s / 2, r, 0, 7); x.fill(); } } return grab(c); } });
  I('hue', { args: '[角度=90]', kana: 'しきそう いろかえ', desc: '色相を回す（YIQ 色空間で回転）',
    fn: (v, [deg = 90]) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return mapPx(v, (r, g, b, o) => { const Y = 0.299 * r + 0.587 * g + 0.114 * b, i0 = 0.596 * r - 0.274 * g - 0.322 * b, q0 = 0.211 * r - 0.523 * g + 0.312 * b, i1 = i0 * c - q0 * s, q1 = i0 * s + q0 * c; o[0] = Y + 0.956 * i1 + 0.621 * q1; o[1] = Y - 0.272 * i1 - 0.647 * q1; o[2] = Y - 1.106 * i1 + 1.703 * q1; }); } });
  I('bright', { args: '[倍率=1.3]', kana: 'あかるさ', desc: '明るさを変える', fn: (v, [k = 1.3]) => mapPx(v, (r, g, b, o) => { o[0] = r * k; o[1] = g * k; o[2] = b * k; }) });
  I('contrast', { args: '[倍率=1.5]', kana: 'こんとらすと', desc: '明暗の差を強める', fn: (v, [k = 1.5]) => mapPx(v, (r, g, b, o) => { o[0] = (r - 128) * k + 128; o[1] = (g - 128) * k + 128; o[2] = (b - 128) * k + 128; }) });
  I('glitch', { args: '[強さ=20]', kana: 'ぐりっち こわれ', desc: '行をずらし色をずらして、壊れた映像のように', ex: 'textimg 出来る！ | glitch 30',
    fn: (v, [amt = 20]) => { const { width: w, height: h } = v, out = new ImageData(new Uint8ClampedArray(v.data), w, h), d = out.data, s = v.data; let y = 0; while (y < h) { const bh = 2 + Math.floor(Math.random() * 18), dx = Math.random() < 0.35 ? Math.floor((Math.random() - 0.5) * amt * 2) : 0; for (let yy = y; yy < Math.min(h, y + bh); yy++) for (let x = 0; x < w; x++) { const sx = Math.min(w - 1, Math.max(0, x - dx)), i = (yy * w + x) * 4, j = (yy * w + sx) * 4, jr = (yy * w + Math.min(w - 1, sx + (amt >> 2))) * 4; d[i] = s[jr]; d[i + 1] = s[j + 1]; d[i + 2] = s[j + 2]; } y += bh; } return out; } });
  I('mirror', { kana: 'さゆうはんてん かがみ', desc: '左右を反転する', fn: (v) => warp(v, (x, y, p) => { p[0] = v.width - 1 - x; p[1] = y; }) });
  I('sym', { kana: 'さゆうたいしょう', desc: '左半分を右に写して左右対称にする', fn: (v) => warp(v, (x, y, p) => { p[0] = x < v.width / 2 ? x : v.width - 1 - x; p[1] = y; }) });
  I('flip', { kana: 'じょうげはんてん', desc: '上下を反転する', fn: (v) => warp(v, (x, y, p) => { p[0] = x; p[1] = v.height - 1 - y; }) });
  I('kaleido', { args: '[分割数=6]', kana: 'まんげきょう', desc: '万華鏡のように折り返す', ex: 'camera | kaleido 8',
    fn: (v, [n = 6], ctx) => { const cx = v.width / 2, cy = v.height / 2, seg = (Math.PI * 2) / Math.max(2, n), rot = ctx.t * 0.25; return warp(v, (x, y, p) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy); let a = Math.atan2(dy, dx) + rot; a = ((a % seg) + seg) % seg; a = Math.abs(a - seg / 2); p[0] = cx + r * Math.cos(a); p[1] = cy + r * Math.sin(a); }); } });
  I('swirl', { args: '[強さ=3]', kana: 'うずまき', desc: '中心のまわりを渦のようにねじる', fn: (v, [k = 3]) => { const cx = v.width / 2, cy = v.height / 2, R = Math.min(cx, cy); return warp(v, (x, y, p) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy); if (r >= R) { p[0] = x; p[1] = y; return; } const a = Math.atan2(dy, dx) + k * (1 - r / R) ** 2; p[0] = cx + r * Math.cos(a); p[1] = cy + r * Math.sin(a); }); } });
  I('wave', { args: '[振れ幅=8]', kana: 'なみ ゆらぎ', desc: '横に波打たせる', fn: (v, [amp = 8], ctx) => warp(v, (x, y, p) => { p[0] = x + amp * Math.sin(y / 11 + ctx.t * 3); p[1] = y + (amp / 3) * Math.sin(x / 17 + ctx.t * 2); }) });
  I('vignette', { kana: 'びねっと しゅうへんげんこう', desc: '周りを暗くする', fn: (v) => { const cx = v.width / 2, cy = v.height / 2, m = Math.hypot(cx, cy); return mapPx(v, (r, g, b, o, x, y) => { const k = 1 - (Math.hypot(x - cx, y - cy) / m) ** 2 * 0.85; o[0] = r * k; o[1] = g * k; o[2] = b * k; }); } });
  I('rgbshift', { args: '[ずらす量=6]', kana: 'いろずれ', desc: '赤と青を左右にずらす', fn: (v, [k = 6]) => { const { width: w } = v, s = v.data; return mapPx(v, (r, g, b, o, x, y) => { const L = (y * w + Math.max(0, x - k)) * 4, R = (y * w + Math.min(w - 1, x + k)) * 4; o[0] = s[L]; o[1] = g; o[2] = s[R + 2]; }); } });
  I('scan', { kana: 'ぶらうんかん そうさせん', desc: 'ブラウン管の走査線を入れる', fn: (v, a, ctx) => mapPx(v, (r, g, b, o, x, y) => { const k = y % 3 === 0 ? 0.55 : 1.05, f = 0.96 + 0.04 * Math.sin(ctx.t * 20); o[0] = r * k * f; o[1] = g * k * f * 1.05; o[2] = b * k * f; }) });
  I('heat', { kana: 'さーもぐらふぃ ねつ', desc: '明るさを熱の色（黒→青→赤→黄→白）に置き換える', ex: 'camera | gray | blur 2 | heat', fn: (v) => paletteMap(v, 'heat') });
  I('palette', { args: '[retro|fire|ice|heat|sepia|neon|sakura|mono]', kana: 'ぱれっと いろわり', desc: '明るさを決まった色の並びに置き換える', ex: 'camera | pixelate 4 | palette retro',
    fn: (v, [name = 'retro']) => paletteMap(v, name, name === 'retro' || name === 'mono') });
  I('tile', { args: '[枚数=2]', kana: 'たいる ならべる', desc: '縮小して敷き詰める', fn: (v, [n = 2]) => { n = Math.max(1, Math.min(8, n | 0)); return warp(v, (x, y, p) => { p[0] = (x * n) % v.width; p[1] = (y * n) % v.height; }); } });
  I('scale', { args: '[倍率=0.5]', kana: 'しゅくしょう かくだい', desc: '大きさを変える', fn: (v, [k = 0.5]) => { const w = Math.max(1, Math.round(v.width * k)), h = Math.max(1, Math.round(v.height * k)); const c = canvas(w, h), x = ctx2d(c); x.imageSmoothingEnabled = k < 1; x.drawImage(toCanvas(v), 0, 0, w, h); return grab(c); } });
  I('diff', { kana: 'さぶん うごき けんしゅつ', desc: '前のフレームとの差（動いたところ）だけを光らせる', ex: 'camera | diff | heat',
    fn: (v, a, ctx, i) => { const prev = ctx.state.get('diff' + i); ctx.state.set('diff' + i, v); if (!prev || prev.data.length !== v.data.length) return mapPx(v, (r, g, b, o) => { o[0] = o[1] = o[2] = 0; }); const p = prev.data; return mapPx(v, (r, g, b, o, x, y) => { const j = (y * v.width + x) * 4; o[0] = o[1] = o[2] = Math.abs(lum(r, g, b) - lum(p[j], p[j + 1], p[j + 2])) * 4; }); } });
  I('trail', { args: '[残り具合=0.85]', kana: 'ざんぞう', desc: '前のフレームを薄く残して残像を作る', fn: (v, [k = 0.85], ctx, i) => { const prev = ctx.state.get('trail' + i); let out = v; if (prev && prev.data.length === v.data.length) { const p = prev.data; out = mapPx(v, (r, g, b, o, x, y) => { const j = (y * v.width + x) * 4; o[0] = Math.max(r, p[j] * k); o[1] = Math.max(g, p[j + 1] * k); o[2] = Math.max(b, p[j + 2] * k); }); } ctx.state.set('trail' + i, out); return out; } });
  I('cartoon', { kana: 'まんが あにめ とぅーん', desc: '色を減らして黒い輪郭を描き足し、漫画のように', ex: 'camera | cartoon',
    fn: (v) => { const base = boxBlur(v, 1), e = sobel(base).data, s = 255 / 4; return mapPx(base, (r, g, b, o, x, y) => { const j = (y * v.width + x) * 4; if (e[j] > 70) { o[0] = o[1] = o[2] = 20; return; } o[0] = Math.round(r / s) * s; o[1] = Math.round(g / s) * s; o[2] = Math.round(b / s) * s; }); } });
  I('pixelsort', { args: '[しきい値=100]', kana: 'ぴくせるそーと', desc: '明るい部分の画素を行ごとに明るさ順に並べ替える', ex: 'gradient | pixelsort 60',
    fn: (v, [t = 100]) => { const { width: w, height: h } = v, out = new ImageData(new Uint8ClampedArray(v.data), w, h), d = out.data; for (let y = 0; y < h; y++) { let x = 0; while (x < w) { while (x < w && lum(d[(y * w + x) * 4], d[(y * w + x) * 4 + 1], d[(y * w + x) * 4 + 2]) < t) x++; const s0 = x; while (x < w && lum(d[(y * w + x) * 4], d[(y * w + x) * 4 + 1], d[(y * w + x) * 4 + 2]) >= t) x++; if (x - s0 > 1) { const px = []; for (let k = s0; k < x; k++) { const i = (y * w + k) * 4; px.push([d[i], d[i + 1], d[i + 2]]); } px.sort((a, b) => lum(...a) - lum(...b)); px.forEach((c, k) => { const i = (y * w + s0 + k) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; }); } } } return out; } });
  def('image', 'ascii', { in: 'image', out: 'text', args: '[横の文字数=80]', kana: 'あすきーあーと もじえ', desc: '明るさを文字の濃さに置き換えて文字の絵にする', ex: 'camera | ascii 100',
    fn: (v, [cols = 80]) => { const chars = '@%#*+=-:. ', cw = v.width / cols, chh = cw * 2, rows = Math.floor(v.height / chh); let out = ''; for (let r = 0; r < rows; r++) { for (let c = 0; c < cols; c++) { const i = (((r * chh + chh / 2) | 0) * v.width + ((c * cw + cw / 2) | 0)) * 4; out += chars[Math.min(chars.length - 1, Math.floor((lum(v.data[i], v.data[i + 1], v.data[i + 2]) / 256) * chars.length))]; } out += '\n'; } return out; } });
  def('image', 'colors', { in: 'image', out: 'list', args: '[色の数=6]', kana: 'しゅようしょく はいしょく ちゅうしゅつ', desc: 'k 平均法で画像の主な色を抜き出す', ex: 'shapes | colors 6 | swatch',
    fn: (v, [k = 6]) => { const s = v.data, pts = []; const step = Math.max(1, Math.floor(s.length / 4 / 3000)); for (let i = 0; i < s.length; i += 4 * step) pts.push([s[i], s[i + 1], s[i + 2]]); let cs = Array.from({ length: k }, () => pts[Math.floor(Math.random() * pts.length)].slice()); let cnt = []; for (let it = 0; it < 10; it++) { const sum = cs.map(() => [0, 0, 0]); cnt = cs.map(() => 0); for (const p of pts) { let bi = 0, bd = Infinity; cs.forEach((c, j) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; bi = j; } }); sum[bi][0] += p[0]; sum[bi][1] += p[1]; sum[bi][2] += p[2]; cnt[bi]++; } cs = cs.map((c, j) => (cnt[j] ? sum[j].map((x) => x / cnt[j]) : c)); } return cs.map((c, j) => [hex(...c), cnt[j]]).sort((a, b) => b[1] - a[1]).map((x) => x[0]); } });
  def('image', 'histogram', { in: 'image', out: 'list', kana: 'ひすとぐらむ あかるさ', desc: '明るさの分布を16区間で数える', ex: 'camera | histogram | bar', fn: (v) => { const c = new Array(16).fill(0); for (let i = 0; i < v.data.length; i += 4) c[Math.min(15, (lum(v.data[i], v.data[i + 1], v.data[i + 2]) / 16) | 0)]++; return c.map((n, i) => [i * 16, n]); } });
  def('image', 'avgcolor', { in: 'image', out: 'text', kana: 'へいきんしょく', desc: '画像全体の平均の色', ex: 'camera | avgcolor | swatch', fn: (v) => { let r = 0, g = 0, b = 0; const n = v.data.length / 4; for (let i = 0; i < v.data.length; i += 4) { r += v.data[i]; g += v.data[i + 1]; b += v.data[i + 2]; } return hex(r / n, g / n, b / n); } });
  def('image', 'size', { in: 'image', out: 'text', kana: 'おおきさ さいず', desc: '画像の幅と高さ', fn: (v) => `${v.width} × ${v.height}` });

  /* ================= 見せる ================= */
  function chartData(v) {
    let items = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.entries(v) : [v];
    items = items.map((x, i) => (Array.isArray(x) ? [String(x[0]), Number(x[1])] : [String(i + 1), Number(x)])).filter(([, n]) => Number.isFinite(n));
    if (!items.length) throw new Error('グラフにできる数がありません');
    return items.slice(0, 400);
  }
  const svgWrap = (w, h, body) => ({ html: `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;font:12px system-ui,sans-serif;fill:currentColor" role="img">${body}</svg>` });
  def('view', 'bar', { in: 'any', out: 'html', kana: 'ぼうぐらふ ぐらふ ちゃーと', desc: '数の並び、または [名前, 数] の並びを棒グラフにする', ex: 'random 12 | bar',
    fn: (v) => { const d = chartData(v), W = 680, Hc = 320, L = 40, B = 46, T = 20, max = Math.max(...d.map((x) => x[1]), 0), min = Math.min(0, ...d.map((x) => x[1])), span = max - min || 1, bw = (W - L - 10) / d.length, y0 = T + ((max - 0) / span) * (Hc - T - B); let s = `<line x1="${L}" x2="${W - 6}" y1="${y0}" y2="${y0}" stroke="currentColor" stroke-opacity=".4"/>`; d.forEach(([lab, n], i) => { const h = (Math.abs(n) / span) * (Hc - T - B), x = L + i * bw + bw * 0.12, y = n >= 0 ? y0 - h : y0; s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" rx="2" fill="var(--shu, #c23b22)" fill-opacity="${(0.45 + 0.55 * Math.abs(n) / (Math.max(Math.abs(max), Math.abs(min)) || 1)).toFixed(2)}"><title>${escH(lab)}: ${n}</title></rect>`; if (d.length <= 24) s += `<text x="${(x + bw * 0.38).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="11">${n}</text>`; if (d.length <= 40) s += `<text x="${(x + bw * 0.38).toFixed(1)}" y="${Hc - B + 16}" text-anchor="${d.length > 14 ? 'end' : 'middle'}" font-size="11" ${d.length > 14 ? `transform="rotate(-45 ${(x + bw * 0.38).toFixed(1)} ${Hc - B + 16})"` : ''}>${escH(lab.slice(0, 10))}</text>`; }); s += `<text x="4" y="${T + 4}" font-size="11" fill-opacity=".6">${max}</text>`; return svgWrap(W, Hc, s); } });
  def('view', 'line', { in: 'any', out: 'html', kana: 'おれせんぐらふ すいい', desc: '折れ線グラフにする', ex: 'random 30 | line',
    fn: (v) => { const d = chartData(v), W = 680, Hc = 300, L = 40, T = 20, B = 30, vals = d.map((x) => x[1]), max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1; const pts = d.map(([, n], i) => [L + (i / Math.max(1, d.length - 1)) * (W - L - 12), T + (1 - (n - min) / span) * (Hc - T - B)]); const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '); let s = `<path d="${path} L${pts[pts.length - 1][0].toFixed(1)} ${Hc - B} L${L} ${Hc - B}Z" fill="var(--shu,#c23b22)" fill-opacity=".12"/><path d="${path}" fill="none" stroke="var(--shu,#c23b22)" stroke-width="2.5" stroke-linejoin="round"/>`; if (d.length <= 60) pts.forEach((p, i) => { s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="var(--shu,#c23b22)"><title>${escH(d[i][0])}: ${d[i][1]}</title></circle>`; }); s += `<text x="4" y="${T + 4}" font-size="11" fill-opacity=".6">${max}</text><text x="4" y="${Hc - B}" font-size="11" fill-opacity=".6">${min}</text>`; return svgWrap(W, Hc, s); } });
  def('view', 'pie', { in: 'any', out: 'html', kana: 'えんぐらふ どーなつ わりあい', desc: 'ドーナツ型の円グラフにする', ex: 'sample csv | csv | col 1 | pie',
    fn: (v) => { const d = chartData(v).filter((x) => x[1] > 0).slice(0, 24), tot = d.reduce((a, b) => a + b[1], 0) || 1, R = 120, cx = 150, cy = 150; let a0 = -Math.PI / 2, s = ''; d.forEach(([lab, n], i) => { const a1 = a0 + (n / tot) * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0, col = `hsl(${(i * 360) / d.length + 10} 65% 52%)`; const p = (a, r) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`; s += d.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${col}"/>` : `<path d="M${p(a0, R)} A${R} ${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, R * 0.55)} A${R * 0.55} ${R * 0.55} 0 ${large} 0 ${p(a0, R * 0.55)}Z" fill="${col}"><title>${escH(lab)}: ${n}</title></path>`; s += `<rect x="300" y="${20 + i * 20}" width="12" height="12" rx="2" fill="${col}"/><text x="318" y="${30 + i * 20}">${escH(lab.slice(0, 14))}（${((n / tot) * 100).toFixed(1)}%）</text>`; a0 = a1; }); return svgWrap(520, Math.max(300, 40 + d.length * 20), s); } });
  def('view', 'table', { in: 'any', out: 'html', kana: 'ひょう てーぶる', desc: '表にする（1行目が見出し）', ex: 'sample csv | csv | table',
    fn: (v) => { let rows = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.entries(v) : [[v]]; rows = rows.slice(0, 500).map((r) => (Array.isArray(r) ? r : r && typeof r === 'object' ? Object.values(r) : [r])); const head = rows.length > 1 && rows[0].every((x) => !Number.isFinite(Number(x))) ? rows.shift() : null; return { html: `<table class="pv-table">${head ? `<thead><tr>${head.map((x) => `<th>${escH(x)}</th>`).join('')}</tr></thead>` : ''}<tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${escH(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>` }; } });
  def('view', 'cloud', { in: 'list', out: 'html', kana: 'わーどくらうど ことばのくも', desc: '[言葉, 回数] の並び（または言葉の並び）を大きさで見せる', ex: 'sample poem | words | freq | cloud',
    fn: (v) => { let d = v.length && Array.isArray(v[0]) ? v : U.freq.fn(v); d = d.slice(0, 80); const max = Math.max(...d.map((x) => x[1])); const cols = ['var(--ink,#222)', 'var(--shu,#c23b22)', 'var(--ai,#26407c)']; const arr = d.map(([w, n], i) => `<span style="font-size:${(14 + Math.sqrt(n / max) * 50).toFixed(0)}px;color:${cols[i % 3]};font-weight:${n === max ? 800 : 600}" title="${n}回">${escH(w)}</span>`); for (let i = arr.length - 1; i > 0; i--) { const j = (i * 7) % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return { html: `<div class="pv-cloud">${arr.join('')}</div>` }; } });
  def('view', 'swatch', { in: 'any', out: 'html', kana: 'いろみほん すうぉっち', desc: '色の並びを色見本にする', ex: 'text "#c23b22 #26407c #f4efe4" | split | swatch',
    fn: (v) => { const list = (Array.isArray(v) ? v : String(v).split(/\s+/)).map(String).filter((c) => CSS.supports('color', c)); if (!list.length) throw new Error('色として読める値がありません'); return { html: `<div class="pv-swatch">${list.map((c) => `<div style="background:${escH(c)}">${escH(c)}</div>`).join('')}</div>` }; } });
  def('view', 'spark', { in: 'list', out: 'text', kana: 'すぱーくらいん', desc: '▁▂▃▄▅▆▇█ の文字で小さなグラフにする', ex: 'random 40 | spark', fn: (v) => { const n = nums(v.map((x) => (Array.isArray(x) ? x[1] : x))), lo = Math.min(...n), hi = Math.max(...n); return n.map((x) => '▁▂▃▄▅▆▇█'[Math.round(((x - lo) / (hi - lo || 1)) * 7)]).join(''); } });
  def('view', 'big', { in: 'any', out: 'html', kana: 'おおきく みだし', desc: '大きな文字で見せる', ex: 'clock | big', fn: (v) => { const s = typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v); const n = [...s].length; return { html: `<div class="pv-big" style="font-size:${n > 40 ? 28 : n > 16 ? 48 : n > 8 ? 80 : 120}px">${escH(s).replace(/\n/g, '<br>')}</div>` }; } });
  def('view', 'tategaki', { in: 'text', out: 'html', kana: 'たてがき げんこうようし', desc: '縦書きで見せる（writing-mode）', ex: 'sample iroha | tategaki', fn: (v) => ({ html: `<div class="pv-tate">${escH(v).replace(/\n/g, '<br>')}</div>` }) });
  def('view', 'meter', { in: 'num', out: 'html', args: '[最大=100]', kana: 'めーたー げーじ', desc: '数を半円のメーターで見せる', ex: 'mic | avg | meter 120',
    fn: (n, [max = 100]) => { const k = Math.max(0, Math.min(1, n / max)), a = Math.PI * (1 - k), x = 150 + 110 * Math.cos(a), y = 150 - 110 * Math.sin(a); return svgWrap(300, 180, `<path d="M40 150 A110 110 0 0 1 260 150" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="22"/><path d="M40 150 A110 110 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="var(--shu,#c23b22)" stroke-width="22"/><text x="150" y="140" text-anchor="middle" font-size="40" font-weight="800">${+n.toFixed(1)}</text>`); } });
  def('view', 'show', { in: 'any', out: 'any', kana: 'ひょうじ みせる', desc: '何もせずそのまま見せる（パイプの終わりの目印）', fn: (v) => v });

  /* ================= レシピ ================= */
  const RECIPES = [
    ['寿限無の文字を数えてグラフに', 'sample jugemu | chars | freq | head 12 | bar', 'じゅげむ もじ かぞえる'],
    ['いろは歌の字は全部ちがう？', 'sample iroha | chars | freq | sort count | head 5 | table', 'いろはうた もじ かぞえる'],
    ['文章を単語に分けて雲にする', 'sample poem | words | freq | cloud', 'たんご くも わーどくらうど'],
    ['カメラを線画に', 'camera | outline', 'かめら せんが'],
    ['カメラを漫画風に', 'camera | cartoon', 'かめら まんが'],
    ['カメラを文字の絵に', 'camera | ascii 96', 'かめら あすきーあーと'],
    ['カメラを昔のゲーム画面に', 'camera | pixelate 4 | palette retro', 'かめら どっとえ れとろ'],
    ['サーモグラフィー風', 'camera | gray | blur 2 | heat', 'さーもぐらふぃー'],
    ['動いたところだけ光る', 'camera | diff | blur 1 | heat', 'うごき けんしゅつ'],
    ['カメラで万華鏡', 'camera | kaleido 8', 'まんげきょう'],
    ['マイクの音を棒グラフに', 'mic | bar', 'まいく おと ぐらふ'],
    ['寿限無で一番多い文字', 'sample jugemu | chars | freq | head 8 | pie', 'じゅげむ'],
    ['写真のような図形から主な色を抜く', 'shapes 60 | colors 6 | swatch', 'はいしょく いろ'],
    ['FizzBuzz', 'seq 1 30 | fizzbuzz | join " "', 'ふぃずばず'],
    ['1000までの素数はいくつ？', 'primes 1000 | count', 'そすう'],
    ['円周率 300 桁', 'pi 300 | wrap 30', 'えんしゅうりつ'],
    ['文字を SHA-256 に', 'text 出来る！ | sha256', 'はっしゅ'],
    ['Markdown を表示', 'sample md | md', 'まーくだうん'],
    ['CSV を表に', 'sample csv | csv | table', 'ひょう'],
    ['CSV の売上をグラフに', 'sample csv | csv | col 1 | line', 'うりあげ ぐらふ'],
    ['プラズマを白黒の点に', 'plasma | dither', 'ぷらずま でぃざ'],
    ['文字を溶かす', 'textimg 出来る！ | wave 10 | rgbshift 6 | glitch 24', 'ぐりっち'],
    ['プラズマの万華鏡', 'plasma | kaleido 8', 'まんげきょう'],
    ['さいころを600回', 'random 600 6 | freq | sort | bar', 'さいころ かくりつ'],
    ['正規分布の山', 'gauss 4000 | hist 30 | bar', 'せいきぶんぷ'],
    ['おみくじ', 'text "大吉 中吉 小吉 吉 末吉 凶" | split | pick | big', 'おみくじ'],
    ['いろは歌を縦書きで', 'sample iroha | tategaki', 'たてがき'],
    ['回文を確かめる', 'text たけやぶやけた | reverse | big', 'かいぶん'],
    ['大きな時計', 'clock | big', 'とけい'],
    ['数の要約統計', 'gauss 1000 | stats | table', 'とうけい'],
    ['雲の地形をサーモ色に', 'noise 0.015 | heat', 'ちけい のいず'],
    ['今年を漢数字で', 'text 2026 | kansuji | big', 'かんすうじ'],
    ['文章の文字数と原稿用紙', 'sample poem | wc | table', 'もじすう'],
  ].map(([title, pipe, kana]) => ({ title, pipe, kana }));

  window.DekiruPipeUnits = { units: U, groups: GROUPS, recipes: RECIPES, media, samples: SAMPLES };
})();
