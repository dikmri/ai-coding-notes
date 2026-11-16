/* 図鑑の項目を登録する仕組み。
 * 各項目の JS は「本物の関数」として書き、Function.prototype.toString で本文を取り出す。
 * こうするとデモ用 JS の中でテンプレート文字列や ${} を自由に使える。 */
(function () {
  'use strict';

  const CATS = [
    // 毎日の定時の処理で、その日話題の道具や処理をブラウザだけで再現して足していく分類
    { id: 'trend', name: '今日の話題を再現', seal: '話題', hue: 340 },
    { id: 'shape', name: '図形・CSSアート', seal: '図形', hue: 20 },
    { id: 'anim', name: '動き・アニメーション', seal: '動き', hue: 200 },
    { id: 'effect', name: '光と演出', seal: '光', hue: 50 },
    { id: '3d', name: '立体・3D', seal: '立体', hue: 265 },
    { id: 'canvas', name: 'キャンバス描画', seal: '描画', hue: 330 },
    { id: 'particle', name: '粒子・物理', seal: '粒子', hue: 170 },
    { id: 'pixel', name: '画像・ピクセル', seal: '画素', hue: 110 },
    { id: 'text', name: '文字・組版', seal: '文字', hue: 5 },
    { id: 'svg', name: 'SVG', seal: 'SVG', hue: 285 },
    { id: 'ui', name: 'UI部品', seal: '部品', hue: 225 },
    { id: 'form', name: '入力・フォーム', seal: '入力', hue: 145 },
    { id: 'layout', name: 'レイアウト', seal: '配置', hue: 35 },
    { id: 'scroll', name: 'スクロール', seal: '巻物', hue: 190 },
    { id: 'sound', name: '音', seal: '音', hue: 305 },
    { id: 'media', name: 'カメラ・マイク・録画', seal: '映像', hue: 355 },
    { id: 'game', name: 'ゲーム', seal: '遊戯', hue: 70 },
    { id: 'math', name: '数理・可視化', seal: '数理', hue: 245 },
    { id: 'data', name: 'データ変換', seal: '変換', hue: 125 },
    { id: 'util', name: '便利道具', seal: '道具', hue: 85 },
    { id: 'api', name: 'ブラウザの機能', seal: '機能', hue: 210 },
    { id: 'combo', name: '合わせ技の小品', seal: '合技', hue: 160 },
    // 昔のデモシーンにならい、1ファイル全体を 256・1024・4096 バイト以内に収めた映像作品
    { id: 'demo', name: 'メガデモ（容量制限）', seal: 'デモ', hue: 290 },
    { id: 'app', name: 'そのまま使えるアプリ', seal: '実用', hue: 15 },
  ];

  // コードから「使っている技術」を自動で拾う。索引の「技術別」に使う
  const API_RULES = [
    [/getContext\(?\s*['"`]2d/, 'Canvas 2D'], [/getContext\(?\s*['"`]webgl/, 'WebGL'],
    [/AudioContext/, 'Web Audio'], [/requestAnimationFrame/, 'requestAnimationFrame'],
    [/IntersectionObserver/, 'IntersectionObserver'], [/ResizeObserver/, 'ResizeObserver'],
    [/MutationObserver/, 'MutationObserver'], [/\.animate\(/, 'Web Animations'],
    [/getUserMedia/, 'getUserMedia'], [/MediaRecorder/, 'MediaRecorder'],
    [/speechSynthesis/, '音声合成'], [/SpeechRecognition/, '音声認識'],
    [/localStorage/, 'localStorage'], [/indexedDB/, 'IndexedDB'],
    [/crypto\.subtle/, 'Web Crypto'], [/crypto\.(getRandomValues|randomUUID)/, '暗号論的乱数'],
    [/navigator\.clipboard/, 'Clipboard'], [/Intl\.Segmenter/, 'Intl.Segmenter'], [/Intl\.(DateTimeFormat|NumberFormat|RelativeTimeFormat|PluralRules|ListFormat|Collator|DisplayNames)/, 'Intl'],
    [/new Worker\(/, 'Web Worker'], [/BroadcastChannel/, 'BroadcastChannel'],
    [/customElements/, 'Custom Elements'], [/attachShadow/, 'Shadow DOM'],
    [/pointer(down|move|up)/, 'Pointer Events'], [/['"]key(down|up)['"]/, 'キーボード操作'],
    [/startViewTransition/, 'View Transitions'], [/showModal|<dialog/, 'dialog'], [/popover/, 'Popover'],
    [/Notification/, 'Notification'], [/navigator\.geolocation/, 'Geolocation'],
    [/requestFullscreen/, 'Fullscreen'], [/navigator\.vibrate/, 'Vibration'], [/navigator\.share/, 'Web Share'],
    [/FileReader|\.files\b|dataTransfer/, 'File API'], [/new Blob\(/, 'Blob'], [/CompressionStream/, 'Compression Streams'],
    [/WebAssembly/, 'WebAssembly'], [/getGamepads/, 'Gamepad'], [/wakeLock/, 'Screen Wake Lock'],
    [/deviceorientation/i, 'DeviceOrientation'], [/EyeDropper/, 'EyeDropper'], [/getDisplayMedia/, '画面キャプチャ'],
    [/captureStream/, 'captureStream'], [/structuredClone/, 'structuredClone'], [/TextEncoder|TextDecoder/, 'TextEncoder'],
    [/new URL\(|URLSearchParams/, 'URL'], [/createImageBitmap|ImageData|getImageData/, 'ピクセル操作'],
    [/Path2D/, 'Path2D'], [/OffscreenCanvas/, 'OffscreenCanvas'], [/requestIdleCallback/, 'requestIdleCallback'],
    [/@keyframes/, '@keyframes'], [/@property/, '@property'], [/clip-path/, 'clip-path'],
    [/backdrop-filter/, 'backdrop-filter'], [/mix-blend-mode/, 'mix-blend-mode'],
    [/conic-gradient/, 'conic-gradient'], [/radial-gradient/, 'radial-gradient'], [/linear-gradient/, 'linear-gradient'],
    [/display:\s*grid/, 'CSS Grid'], [/display:\s*(inline-)?flex/, 'Flexbox'], [/@container/, 'コンテナクエリ'],
    [/:has\(/, ':has()'], [/animation-timeline/, 'スクロール駆動アニメーション'], [/scroll-snap/, 'scroll-snap'],
    [/position:\s*sticky/, 'position: sticky'], [/perspective/, '3D変形'], [/writing-mode/, 'writing-mode'],
    [/mask(-image)?\s*:/, 'mask'], [/(?:^|[^-])filter\s*:/m, 'filter'], [/text-shadow/, 'text-shadow'], [/box-shadow/, 'box-shadow'],
    [/offset-path/, 'offset-path'], [/anchor-name|position-anchor/, 'アンカー配置'], [/@starting-style/, '@starting-style'],
    [/light-dark\(/, 'light-dark()'], [/color-mix\(/, 'color-mix()'], [/oklch\(/, 'oklch()'], [/<svg/, 'SVG'],
    [/<details/, 'details'], [/<canvas/, 'canvas'], [/contenteditable/, 'contenteditable'], [/<template/, 'template'],
    [/<input[^>]+type="range"/, 'input range'], [/<input[^>]+type="color"/, 'input color'], [/scroll-timeline|view-timeline/, 'スクロールタイムライン'],
    [/clamp\(/, 'clamp()'], [/aspect-ratio/, 'aspect-ratio'], [/subgrid/, 'subgrid'], [/text-wrap/, 'text-wrap'],
    [/feTurbulence|feDisplacementMap|feGaussianBlur/, 'SVGフィルター'], [/background-clip:\s*text/, 'background-clip: text'],
  ];

  function dedent(s) {
    s = String(s).replace(/^\s*\n/, '').replace(/\s+$/, '');
    const lines = s.split('\n');
    let min = Infinity;
    for (const l of lines) if (l.trim()) min = Math.min(min, l.match(/^[ \t]*/)[0].length);
    if (!isFinite(min) || min === 0) return s;
    return lines.map((l) => l.slice(min)).join('\n');
  }
  // "YYYY-MM-DD" 2つの間の日数（b − a）。時差の影響を受けない暦の日付として数える
  function daysBetween(a, b) {
    const T = globalThis.Temporal;
    if (T && T.PlainDate) return T.PlainDate.from(a).until(T.PlainDate.from(b), { largestUnit: 'day' }).days;
    const n = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
    return Math.round(n(b) - n(a));
  }
  // UTF-8 で書いたときのバイト数（TextEncoder の無い所でも使えるよう自分で数える）
  function utf8Bytes(s) {
    let n = 0;
    for (const ch of String(s)) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
    return n;
  }
  // メガデモの容量を数える「そのまま開ける1ファイル」: HTML、あれば <style>、あれば <script> の順
  function miniHtml(e) {
    const h = src(e.html), c = src(e.css), j = src(e.js);
    return h + (c ? `<style>${c}</style>` : '') + (j ? `<script>${j}</script>` : '');
  }
  function src(v) {
    if (!v) return '';
    if (typeof v === 'function') {
      const s = v.toString();
      return dedent(s.slice(s.indexOf('{') + 1, s.lastIndexOf('}')));
    }
    return dedent(v);
  }

  const D = (window.dekiru = {
    cats: CATS,
    catMap: new Map(CATS.map((c, i) => [c.id, { ...c, order: i }])),
    entries: [],
    byId: new Map(),
    problems: [],
    src, dedent, daysBetween, utf8Bytes, miniHtml,
    add(...list) {
      for (const e of list) {
        if (!e || !e.id) { D.problems.push({ e, msg: 'id がない' }); continue; }
        if (D.byId.has(e.id)) { D.problems.push({ e, msg: 'id が重複: ' + e.id }); continue; }
        if (!D.catMap.has(e.c)) D.problems.push({ e, msg: '分類が不明: ' + e.c });
        e.tags = e.tags || [];
        e.lv = e.lv || 1;
        e._i = D.entries.length;
        D.byId.set(e.id, e);
        D.entries.push(e);
      }
    },
    finalize() {
      const order = (e) => (D.catMap.get(e.c) || { order: 99 }).order;
      // 話題の項目は新しい日付ほど前。それ以外は登録した順
      const byDate = (a, b) => (a.c === 'trend' && b.c === 'trend' ? String(b.date || '').localeCompare(String(a.date || '')) : 0);
      D.entries.sort((a, b) => order(a) - order(b) || byDate(a, b) || a._i - b._i);
      D.entries.forEach((e, i) => {
        e.no = i + 1;
        // core は DOM を使わない純粋な関数だけを書く場所。テストから単独で呼べ、表示では JS の先頭に並ぶ
        e.src = { html: src(e.html), css: src(e.css), js: [src(e.core), src(e.js)].filter(Boolean).join('\n\n') };
        e.code = [e.src.html, e.src.css, e.src.js].join('\n');
        const apis = new Set();
        for (const [re, name] of API_RULES) if (re.test(e.code)) apis.add(name);
        e.apis = [...apis];
      });
      return D.entries;
    },
  });
})();
