/* 出来る！HTML/CSS/JavaScript ― 画面の本体 */
(function () {
  'use strict';
  const D = window.dekiru;
  const Search = window.DekiruSearch;
  const H = window.DekiruHighlight;
  const log = window.dlog || (() => {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = H.escapeHtml;
  const escA = H.escapeAttr;
  const pad = (n) => String(n).padStart(3, '0');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const TOKEN = Math.random().toString(36).slice(2);
  // 共有ページ（claude.ai の Artifact）として公開した版では true になる。tools/build-artifact.mjs が埋め込む
  const SHARED = !!window.DEKIRU_SHARED;
  // 埋め込み先によっては履歴の書き換えが禁止されているので、失敗しても画面が止まらないようにする
  function setUrl(method, st, url) {
    try { history[method](st, '', url); } catch (err) { log('history.' + method, { url }, 'error: ' + err.message); }
  }

  const store = {
    get(k, d) { try { const v = localStorage.getItem('dekiru:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('dekiru:' + k, JSON.stringify(v)); } catch { /* 保存できない環境では覚えないだけ */ } },
  };

  /* ================= 項目の準備 ================= */
  const entries = D.finalize();
  if (D.problems.length) log('registry.problems', D.problems.map((p) => p.msg), 'warn');
  const catOf = (id) => D.catMap.get(id);
  const index = Search.createIndex(entries, { catLabel: (c) => (catOf(c) ? catOf(c).name + ' ' + catOf(c).seal : '') });

  /* ================= 今日の話題 ================= */
  // 今日の日付（この端末の暦で "YYYY-MM-DD"）と、そこからの「今日・昨日・N日前」
  const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'auto' });
  const relDay = (iso) => rtf.format(-D.daysBetween(iso, todayIso), 'day');
  {
    const latest = entries.find((e) => e.c === 'trend' && e.date);
    const note = $('#trendNote');
    if (latest && note) {
      note.innerHTML = `<b>今日の話題</b><a href="#e=${encodeURIComponent(latest.id)}"></a>（${esc(latest.date)} ・ ${esc(relDay(latest.date))}）`;
      $('a', note).textContent = latest.t;
      note.hidden = false;
    }
  }

  const state = {
    q: '', cat: '', lv: '', sort: 'auto',
    live: store.get('live', !reduceMotion.matches),
    favs: new Set(store.get('favs', [])),
    seen: new Set(store.get('seen', [])),
    list: entries.slice(),
    terms: [],
    current: null,
    tab: 'html',
    edits: new Map(),
    randomRank: new Map(),
    skipBack: false,
    view: 'book',
  };

  /* ================= デモ用の文書を組み立てる ================= */
  const BASE_CSS = `*, *::before, *::after { box-sizing: border-box; }
:root { color-scheme: light dark; accent-color: #e0532f; }
html, body { height: 100%; margin: 0; }
body {
  font: 15px/1.6 system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif;
  color: light-dark(#1f1d1a, #ece7dc);
  background: light-dark(#faf8f3, #17150f);
}
button, input, select, textarea { font: inherit; color: inherit; }
button {
  cursor: pointer; padding: .4em .9em; border-radius: 8px;
  border: 1px solid light-dark(#c9c1b0, #4a443a);
  background: light-dark(#fff, #26231d);
}
button:hover { border-color: light-dark(#8a8172, #8a8170); }
input:not([type=range], [type=checkbox], [type=radio], [type=color]), select, textarea {
  padding: .35em .6em; border-radius: 8px;
  border: 1px solid light-dark(#c9c1b0, #4a443a);
  background: light-dark(#fff, #1f1c17);
}
canvas, img, video { display: block; max-width: 100%; }
.center { min-height: 100%; display: grid; place-items: center; }`;

  function prelude(mode) {
    return `(()=>{const T=${JSON.stringify(TOKEN)};const send=(type,data)=>{try{parent.postMessage({__dk:T,type,data},'*')}catch(_){}};` +
      `const fmt=v=>{try{if(v instanceof Error)return v.name+': '+v.message;if(v&&typeof v==='object')return JSON.stringify(v).slice(0,400);return String(v)}catch(_){return String(v)}};` +
      `addEventListener('error',e=>send('error',{msg:e.message,line:e.lineno,col:e.colno}));` +
      `addEventListener('unhandledrejection',e=>send('error',{msg:'Promise: '+fmt(e.reason)}));` +
      `for(const k of['log','info','warn','error']){const o=console[k];console[k]=(...a)=>{send('console',{level:k,text:a.map(fmt).join(' ')});o.apply(console,a)}}` +
      // 小さな絵: 読み込んで 2 フレーム描いたら知らせる。親はそれまで静止画を見せておく（描く前の白い面を見せない）
      (mode === 'thumb' ? `addEventListener('load',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>send('ready',0))));` : '') +
      `window.THUMB=${mode === 'thumb'};})();`;
  }
  // 項目の data に書いた大きなデータ（3D モデルなど）。iframe では住所で読み、HTML 1枚に書き出すときは中身を埋め込む
  const dataCache = new Map();
  async function loadData(e) {
    const out = {};
    for (const p of e.data || []) {
      if (!dataCache.has(p)) dataCache.set(p, fetch(p).then((r) => { if (!r.ok) throw new Error(`${p} を読めません（${r.status}）`); return r.text(); }));
      out[p] = await dataCache.get(p);
    }
    return out;
  }
  const dataTags = (e, inline) => (e.data || []).map((p) => (inline && inline[p] != null
    ? `<script>\n${inline[p].replace(/<\/script/gi, '<\\/script')}\n<\/script>\n`
    : `<script src="${esc(new URL(p, location.href).href)}"><\/script>\n`)).join('');
  function buildDoc(e, { mode = 'detail', html, css, js, inline } = {}) {
    html = html ?? e.src.html;
    css = css ?? e.src.css;
    js = js ?? e.src.js;
    const top = mode === 'export' ? `<!-- 出来る！HTML/CSS/JavaScript No.${pad(e.no)} ${e.t} -->\n` : '';
    const bridge = mode === 'export' ? '' : `<link rel="icon" href="data:,">\n<script>${prelude(mode)}<\/script>\n`;
    const head = `<!doctype html>\n${top}<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(e.t)}</title>\n${bridge}<style>\n${BASE_CSS}\n</style>\n<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>\n${dataTags(e, inline)}</head>\n<body>\n${html}\n<script>\n`;
    const doc = head + js.replace(/<\/script/gi, '<\\/script') + '\n<\/script>\n</body>\n</html>\n';
    return { doc, jsLine: (head.match(/\n/g) || []).length };
  }
  const sandboxFor = (e) => 'allow-scripts allow-modals allow-forms allow-popups allow-downloads allow-pointer-lock' + (e.so ? ' allow-same-origin' : '');
  const ALLOW = 'camera; microphone; fullscreen; clipboard-read; clipboard-write; autoplay; geolocation; display-capture; screen-wake-lock; web-share; gamepad; accelerometer; gyroscope; magnetometer';

  // iframe からの報告（エラー・console）。送り主の window で照合する
  const frames = new Map();
  const thumbErrors = new Set();
  addEventListener('message', (ev) => {
    const info = frames.get(ev.source);
    const d = ev.data;
    if (!info || !d || d.__dk !== TOKEN) return;
    const e = info.entry;
    if (d.type === 'ready') {
      if (info.mode === 'thumb' && info.frame) { info.frame.classList.add('on'); log('preview.ready', { id: e.id, ms: Math.round(performance.now() - info.t0) }, 'ok'); }
    } else if (d.type === 'error') {
      const line = d.data.line ? d.data.line - info.jsLine : 0;
      const where = line > 0 ? `JS ${line}行目: ` : '';
      if (info.mode === 'detail') consoleLine('error', where + d.data.msg);
      if (info.mode === 'test') testRecord(e, where + d.data.msg);
      if (info.mode !== 'thumb' || !thumbErrors.has(e.id)) {
        if (info.mode === 'thumb') thumbErrors.add(e.id);
        log('demo.error', { id: e.id, mode: info.mode, msg: d.data.msg, line }, 'exception');
      }
    } else if (d.type === 'console') {
      if (info.mode === 'detail') consoleLine(d.data.level, d.data.text);
      if (info.mode === 'test' && d.data.level === 'error') testRecord(e, 'console.error: ' + d.data.text);
    }
  });

  /* ================= 小物 ================= */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    try { if (t.matches(':popover-open')) t.hidePopover(); t.showPopover(); } catch { /* popover 非対応 */ }
    clearTimeout(t._h);
    t._h = setTimeout(() => { try { t.hidePopover(); } catch { /* 閉じ済み */ } }, 2200);
  }
  function markText(text, needles) {
    if (!needles.length) return esc(text);
    const ranges = Search.findRanges(text, needles);
    let out = '', at = 0;
    for (const [a, b] of ranges) { out += esc(text.slice(at, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; at = b; }
    return out + esc(text.slice(at));
  }
  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(label + 'をコピーしました');
      log('clipboard.write', { label, length: text.length }, 'ok');
    } catch (err) {
      toast('コピーできませんでした');
      log('clipboard.write', { label }, 'error: ' + err.message);
    }
  }
  function download(name, text, type = 'text/html') {
    const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  // closedby="any" が無いブラウザでも、背景を押したら閉じる
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e, d) => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
    for (const d of $$('dialog[closedby="any"]')) {
      let down = false;
      d.addEventListener('pointerdown', (e) => { down = outside(e, d); });
      d.addEventListener('pointerup', (e) => { if (down && outside(e, d)) d.close(); });
    }
  }

  /* ================= 分類チップ ================= */
  const chipsEl = $('#catChips');
  const catHas = new Set(entries.map((e) => e.c));
  function renderChips(counts) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const btn = (id, label, n, hue) =>
      `<button type="button" data-cat="${escA(id)}" aria-pressed="${state.cat === id}"${hue != null ? ` style="--h:${hue}"` : ''}>` +
      `${hue != null ? '<span class="dot"></span>' : ''}${esc(label)}<span class="n">${n}</span></button>`;
    let html = btn('', 'すべて', total, null);
    // 項目が1つもない分類（最初の話題が届く前の「今日の話題」など）は札を出さない
    for (const c of D.cats) if (catHas.has(c.id)) html += btn(c.id, c.name, counts.get(c.id) || 0, c.hue);
    html += btn('★', '★ お気に入り', state.favs.size, null);
    chipsEl.innerHTML = html;
  }
  chipsEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-cat]');
    if (!b) return;
    state.cat = state.cat === b.dataset.cat ? '' : b.dataset.cat;
    log('filter.cat', { cat: state.cat }, 'ok');
    applyFilters();
    syncHash();
  });

  /* ================= カード ================= */
  // 一覧の絵は、あらかじめ撮った静止画（node tools/thumbs.mjs が作る thumbs/ のシートと、目録 js/thumbs.js）。
  // 8 枚を 1 枚の画像に並べてあるので、カードの枠より大きな img をずらして 1 枚ぶんだけ見せる。暗い配色では暗い配色で撮った絵にする
  // 目録に無い項目（撮る前の新しい項目や、許可の要る項目）は、見出しの頭の 1 文字のまま
  const TH = window.DEKIRU_THUMBS && window.DEKIRU_THUMBS.v === 1 ? window.DEKIRU_THUMBS : null;
  function shotHtml(e) {
    const t = TH && TH.at[e.id];
    if (!t) return '';
    const [s, slot] = t;
    const file = 'thumbs/s' + String(s).padStart(2, '0'), v = TH.sheets[s] ? '?v=' + TH.sheets[s] : '';
    // 最初のシート（番号順で先頭の項目）は最初の画面に入るので、遅らせずに読む。ほかは画面に近づいてから読む
    const lazy = s === 0 ? '' : ' loading="lazy"';
    return `<picture class="shot"><source media="(prefers-color-scheme: dark)" srcset="${file}-d.webp${v}">` +
      `<img src="${file}-l.webp${v}" alt=""${lazy} decoding="async" style="--x:${slot % TH.cols};--y:${Math.floor(slot / TH.cols)}"></picture>`;
  }
  const grid = $('#grid');
  if (TH) { grid.style.setProperty('--tc', TH.cols); grid.style.setProperty('--tr', TH.rows); }
  const cards = new Map();
  const byPrev = new Map();
  const byLi = new Map();
  for (const e of entries) {
    const c = catOf(e.c);
    const li = document.createElement('li');
    li.className = 'card';
    li.style.setProperty('--h', c.hue);
    li.innerHTML =
      `<a href="#e=${encodeURIComponent(e.id)}" data-open="${escA(e.id)}">` +
      `<div class="prev"><span class="ph" aria-hidden="true">${esc([...e.t][0])}</span>${shotHtml(e)}${e.nt ? '<small class="nt-note" aria-hidden="true">開くと起動します</small>' : ''}</div>` +
      `<div class="body"><span class="no">No.${pad(e.no)}</span>${e.date ? `<span class="date">${esc(e.date)}</span>` : ''}${e.size ? `<span class="size">${e.size.toLocaleString('ja-JP')}バイト</span>` : ''}<h3 class="hw"></h3><span class="yomi">${esc(e.y)}</span><p class="desc"></p>` +
      `<span class="seal${/^[A-Za-z]/.test(c.seal) ? ' latin' : ''}" title="${escA(c.name)}">${esc(c.seal)}</span></div></a>` +
      `<button type="button" class="fav" aria-pressed="${state.favs.has(e.id)}" aria-label="${escA(e.t)}をお気に入りにする" data-fav="${escA(e.id)}">★</button>` +
      // タッチの画面には「乗せる」が無いので、絵の上の ▶ で動かす（CSS で、マウスの無い画面にだけ出す）
      (e.nt ? '' : `<button type="button" class="play" aria-pressed="false" aria-label="${escA(e.t)}の見本をここで動かす" data-play="${escA(e.id)}">▶</button>`);
    const card = { e, li, prev: $('.prev', li), hw: $('.hw', li), desc: $('.desc', li), favBtn: $('.fav', li), playBtn: $('.play', li), frame: null };
    cards.set(e.id, card);
    byPrev.set(card.prev, card);
    byLi.set(li, card);
  }
  // 静止画が読めたら印を付ける（測定の道具 tools/perf.mjs が数える）。load は泡立たないので捕まえる側で受ける
  grid.addEventListener('load', (ev) => { if (ev.target.tagName === 'IMG') ev.target.closest('.prev')?.classList.add('img-on'); }, true);
  grid.addEventListener('error', (ev) => { if (ev.target.tagName === 'IMG') log('thumb.error', { src: ev.target.currentSrc || ev.target.src }, 'error'); }, true);
  grid.addEventListener('click', (ev) => {
    const f = ev.target.closest('[data-fav]');
    if (f) { toggleFav(f.dataset.fav); return; }
    const p = ev.target.closest('[data-play]');
    if (p) { const c = cards.get(p.dataset.play); if (liveCard === c) stop(c); else play(c, 'touch'); }
  });

  function toggleFav(id) {
    if (state.favs.has(id)) state.favs.delete(id); else state.favs.add(id);
    store.set('favs', [...state.favs]);
    const on = state.favs.has(id);
    const c = cards.get(id);
    if (c) c.favBtn.setAttribute('aria-pressed', on);
    if (state.current && state.current.id === id) $('#dFav').setAttribute('aria-pressed', on);
    log('fav.toggle', { id }, on ? 'on' : 'off');
    toast(on ? 'お気に入りに入れました' : 'お気に入りから外しました');
    if (state.cat === '★') applyFilters();
    else renderChipsFromLast();
  }

  /* ---- 動くプレビュー（乗せたカードの 1 枚だけ iframe を載せる） ----
     前は見えているカードの全部（14 枚まで）で見本を動かしていた。重いシェーダーの見本が重なると、
     GPU の処理が詰まってスクロールが止まり、メモリも 400MB ほど増えていた（tools/perf.mjs で測った）ので、乗せた 1 枚だけにした */
  let liveCard = null, liveVia = '', hoverT = 0;
  const overlayOpen = () => $('#detail').open || $('#flip').open;
  const cardOf = (el) => (el && el.closest ? byLi.get(el.closest('.card')) : null) || null;
  function play(c, via) {
    if (!c || !state.live || c.e.nt || c.li.hidden || overlayOpen() || state.view !== 'book') return;
    if (liveCard && liveCard !== c) stop(liveCard);
    liveCard = c; liveVia = via;
    if (!c.frame) mount(c);
    if (c.playBtn) { c.playBtn.setAttribute('aria-pressed', 'true'); c.playBtn.textContent = '■'; }
    log('preview.play', { id: c.e.id, via }, 'ok');
  }
  function stop(c) {
    if (liveCard === c) liveCard = null;
    if (c.playBtn) { c.playBtn.setAttribute('aria-pressed', 'false'); c.playBtn.textContent = '▶'; }
    unmount(c);
  }
  // マウス: カードに入って少し留まったら動かし、出たら止める（横切っただけのカードは動かさない）
  grid.addEventListener('pointerover', (ev) => {
    if (ev.pointerType === 'touch') return;
    const c = cardOf(ev.target);
    if (!c || cardOf(ev.relatedTarget) === c) return;
    clearTimeout(hoverT);
    hoverT = setTimeout(() => play(c, 'hover'), 160);
  });
  grid.addEventListener('pointerout', (ev) => {
    if (ev.pointerType === 'touch') return;
    const c = cardOf(ev.target);
    if (!c || cardOf(ev.relatedTarget) === c) return;
    clearTimeout(hoverT);
    if (liveCard === c && liveVia === 'hover') stop(c);
  });
  // キーボード: Tab で選んだカードを動かし、離れたら止める
  grid.addEventListener('focusin', (ev) => { if (ev.target.matches('a:focus-visible')) play(cardOf(ev.target), 'focus'); });
  grid.addEventListener('focusout', (ev) => { const c = cardOf(ev.target); if (c && liveCard === c && liveVia === 'focus' && cardOf(ev.relatedTarget) !== c) stop(c); });
  // 動かしているカードが画面の外へ出たら止める（タッチで動かしたまま流したときなど）
  const io = new IntersectionObserver((list) => {
    for (const it of list) { const c = byPrev.get(it.target); if (c && !it.isIntersecting && liveCard === c) stop(c); }
  });
  function mount(c) {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', sandboxFor(c.e));
    f.setAttribute('tabindex', '-1');
    f.setAttribute('aria-hidden', 'true');
    f.title = c.e.t + '（プレビュー）';
    const { doc, jsLine } = buildDoc(c.e, { mode: 'thumb' });
    f.srcdoc = doc;
    // 見本が 2 フレーム描いたという知らせ（ready）で見せる。それまでは静止画のまま。知らせが来ないときも、読み込んで 1.5 秒で見せる
    f.addEventListener('load', () => { c.onT = setTimeout(() => f.classList.add('on'), 1500); }, { once: true });
    c.prev.append(f);
    frames.set(f.contentWindow, { entry: c.e, mode: 'thumb', jsLine, frame: f, t0: performance.now() });
    c.frame = f;
    io.observe(c.prev);
  }
  function unmount(c) {
    if (!c.frame) return;
    io.unobserve(c.prev);
    clearTimeout(c.onT);
    frames.delete(c.frame.contentWindow);
    c.frame.remove();
    c.frame = null;
  }
  const unmountAll = () => { clearTimeout(hoverT); if (liveCard) stop(liveCard); };

  const liveChk = $('#liveChk');
  liveChk.checked = state.live;
  // マウスの無い画面では「乗せる」ができないので、言い方を変える
  if (!matchMedia('(hover: hover)').matches) $('#liveLabel').textContent = '▶で動かす';
  const syncLive = () => grid.classList.toggle('live', state.live);
  syncLive();
  liveChk.addEventListener('change', () => {
    state.live = liveChk.checked;
    store.set('live', state.live);
    syncLive();
    log('preview.live', { on: state.live }, 'ok');
    if (!state.live) unmountAll();
  });

  /* ---- 一覧へ入れる順番 ----
     470 枚ほどのカードを一度に入れると、配置の計算で読み込みの途中に 0.4 秒ほど画面が止まり、しかもそれが 2 回起きていた（tools/perf.mjs）。
     最初の画面に入る FIRST 枚だけを先に入れ、残りは最初に描いたあとで CHUNK 枚ずつ、描く合間に末尾へ足す。
     （content-visibility: auto も試したが、この Chrome では読み込みの 1 秒ほどあとに全部を配置し直すので使わない） */
  // 少しずつ入れるのは起動の最初の 1 回だけ（booting の間）。そのあとの絞り込みや並べ替えでは、残りを先に全部入れてから並べ直す
  // （起動の途中で絞り込むと、入れ残したカードが絞り込みを外したときにまとめて入り、並びも一時的に乱れるため。Gemini のレビュー）
  const FIRST = 24, CHUNK = 32;
  let later = null, booting = true;
  function drainLater() {
    if (!later) return;
    const chunk = later.splice(0, CHUNK);
    grid.append(...chunk);
    if (later.length) setTimeout(() => requestAnimationFrame(drainLater), 0);
    else { later = null; log('grid.ready', { cards: grid.childElementCount }, 'ok'); }
  }
  // 残りを今すぐ全部入れる（五十音の爪で、まだ入れていないカードへ飛ぶときなど）
  const flushLater = () => { if (later) { grid.append(...later); later = null; } };

  /* ================= 絞り込みと並べ替え ================= */
  const isFn = (name, e) =>
    (name === 'fav' && state.favs.has(e.id)) || (name === 'seen' && state.seen.has(e.id)) || (name === 'new' && !state.seen.has(e.id));
  let lastCounts = new Map();
  const renderChipsFromLast = () => renderChips(lastCounts);

  function applyFilters() {
    const r = Search.search(index, state.q, { is: isFn });
    state.terms = r.terms;
    let items = r.items.map((x) => x.entry);
    if (state.lv) items = items.filter((e) => String(e.lv) === state.lv);
    lastCounts = new Map();
    for (const e of items) lastCounts.set(e.c, (lastCounts.get(e.c) || 0) + 1);
    if (state.cat === '★') items = items.filter((e) => state.favs.has(e.id));
    else if (state.cat) items = items.filter((e) => e.c === state.cat);

    const sort = state.sort === 'auto' ? (state.q.trim() ? 'rel' : 'no') : state.sort;
    if (sort === 'no') items.sort((a, b) => a.no - b.no);
    else if (sort === 'kana') items.sort((a, b) => a.y.localeCompare(b.y, 'ja') || a.no - b.no);
    else if (sort === 'random') {
      for (const e of items) if (!state.randomRank.has(e.id)) state.randomRank.set(e.id, Math.random());
      items.sort((a, b) => state.randomRank.get(a.id) - state.randomRank.get(b.id));
    }
    state.list = items;

    // DOM を並べ直す（moveBefore があれば iframe を読み直さずに動かせる）
    const needles = Search.needlesOf(r.terms);
    const want = new Set();
    for (const e of items) {
      const c = cards.get(e.id);
      want.add(c.li);
      c.hw.innerHTML = markText(e.t, needles);
      c.desc.innerHTML = markText(e.d, needles);
    }
    for (const c of cards.values()) {
      const hide = !want.has(c.li);
      if (c.li.hidden !== hide) { c.li.hidden = hide; if (hide && liveCard === c) stop(c); }
    }
    // 起動の最初は、最初の FIRST 枚だけを入れ、残りは描いたあとで少しずつ末尾へ足す（drainLater）
    if (booting) later = []; else flushLater();
    let ref = grid.firstChild, n = 0;
    for (const e of items) {
      const li = cards.get(e.id).li;
      if (later && n++ >= FIRST) { later.push(li); continue; }
      if (li === ref) { ref = ref.nextSibling; continue; }
      try { if (grid.moveBefore) grid.moveBefore(li, ref); else grid.insertBefore(li, ref); }
      catch { grid.insertBefore(li, ref); }
    }

    renderChips(lastCounts);
    $('#countOut').textContent = `${items.length} / ${entries.length} 項目`;
    $('#emptyMsg').hidden = items.length > 0;
    const note = $('#searchNote');
    let msg = '';
    if (state.q.trim()) msg = `「${esc(state.q.trim())}」で ${items.length} 件見つかりました。`;
    if (r.rewritten) msg += ` 文章を単語に分けて <code>${esc(r.rewritten)}</code> で探しました。`;
    if (r.suggest) msg += ` もしかして <button type="button" class="linkish" data-suggest="${escA(r.suggest)}">${esc(r.suggest)}</button>？`;
    note.innerHTML = msg;
    note.hidden = !msg;
    renderPipeHits();
    renderThumbIndex();
    return items.length;
  }
  $('#searchNote').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-suggest]');
    if (b) setQuery(b.dataset.suggest, 'suggest');
  });
  $('#clearSearch').addEventListener('click', () => { state.cat = ''; state.lv = ''; $('#lvSel').value = ''; setQuery('', 'clear'); });

  function renderPipeHits() {
    const box = $('#pipeHits');
    const P = window.DekiruPipeUI;
    if (!P || !state.q.trim()) { box.hidden = true; return; }
    const hits = P.searchUnits(state.q).slice(0, 10);
    if (!hits.length) { box.hidden = true; return; }
    box.innerHTML = '<span>パイプ工房にも：</span>' + hits.map((h) =>
      `<a href="#v=pipe&p=${encodeURIComponent(h.pipe)}" title="${escA(h.desc)}">${esc(h.label)}</a>`).join('');
    box.hidden = false;
  }

  /* ---- 検索欄 ---- */
  const qEl = $('#q');
  let qTimer = 0, qLogTimer = 0, scrolledForQuery = false;
  function setQuery(q, via) {
    qEl.value = q;
    onQuery(via);
  }
  function onQuery(via = 'typing') {
    state.q = qEl.value;
    if (state.view !== 'book') showView('book');
    const n = applyFilters();
    syncHash();
    clearTimeout(qLogTimer);
    qLogTimer = setTimeout(() => log('search', { q: state.q, via }, `${n}件`), via === 'typing' ? 700 : 0);
    if (state.q.trim() && !scrolledForQuery) {
      const heroBottom = $('.hero').getBoundingClientRect().bottom;
      if (heroBottom > 120) scrollTo({ top: scrollY + heroBottom - 70, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      scrolledForQuery = true;
    }
    if (!state.q.trim()) scrolledForQuery = false;
  }
  qEl.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => onQuery('typing'), 110); });
  $('#searchForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    clearTimeout(qTimer);
    onQuery('enter');
    const first = grid.querySelector('li:not([hidden]) a');
    if (first) first.focus({ preventScroll: false });
  });
  $('#sortSel').addEventListener('change', (ev) => { state.sort = ev.target.value; state.randomRank.clear(); log('sort', { sort: state.sort }, 'ok'); applyFilters(); syncHash(); });
  $('#lvSel').addEventListener('change', (ev) => { state.lv = ev.target.value; log('filter.lv', { lv: state.lv }, 'ok'); applyFilters(); syncHash(); });

  /* ---- 声で検索 ---- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    const vb = $('#voiceBtn');
    vb.hidden = false;
    let rec = null;
    vb.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      try {
        rec = new SR();
        rec.lang = 'ja-JP';
        rec.interimResults = true;
        rec.onresult = (ev) => { setQuery([...ev.results].map((r) => r[0].transcript).join(''), 'voice'); };
        rec.onerror = (ev) => { log('voice.error', { error: ev.error }, 'error'); toast('音声認識が使えませんでした（' + ev.error + '）'); };
        rec.onend = () => { vb.classList.remove('listening'); vb.setAttribute('aria-label', '声で検索'); rec = null; log('voice.end', {}, 'ok'); };
        rec.start();
        vb.classList.add('listening');
        vb.setAttribute('aria-label', '聞き取りを止める');
        log('voice.start', {}, 'ok');
      } catch (err) { rec = null; log('voice.start', {}, 'error: ' + err.message); }
    });
  }

  /* ---- 五十音の爪 ---- */
  const ROWS = [['あ', 'あいうえおぁぃぅぇぉゔ'], ['か', 'かきくけこがぎぐげご'], ['さ', 'さしすせそざじずぜぞ'], ['た', 'たちつてとだぢづでどっ'],
    ['な', 'なにぬねの'], ['は', 'はひふへほばびぶべぼぱぴぷぺぽ'], ['ま', 'まみむめも'], ['や', 'やゆよゃゅょ'], ['ら', 'らりるれろ'], ['わ', 'わをんゎ']];
  const rowOf = (y) => { const ch = Search.normalize(y)[0] || ''; const r = ROWS.find(([, s]) => s.includes(ch)); return r ? r[0] : '他'; };
  const thumbEl = $('#thumbIndex');
  thumbEl.innerHTML = [...ROWS.map((r) => r[0]), '他'].map((k, i) =>
    `<button type="button" data-row="${k}" style="--k:${i}" aria-label="${k === '他' ? 'その他' : k + '行'}へ">${k}</button>`).join('');
  function renderThumbIndex() {
    const has = new Set(state.list.map((e) => rowOf(e.y)));
    for (const b of $$('button', thumbEl)) b.disabled = !has.has(b.dataset.row);
  }
  thumbEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-row]');
    if (!b) return;
    flushLater();
    if (state.sort !== 'kana') { state.sort = 'kana'; $('#sortSel').value = 'kana'; applyFilters(); syncHash(); }
    const e = state.list.find((x) => rowOf(x.y) === b.dataset.row);
    log('thumbindex', { row: b.dataset.row }, e ? e.id : 'none');
    if (!e) return;
    const a = $('a', cards.get(e.id).li);
    a.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    a.focus({ preventScroll: true });
  });

  /* ================= 詳細ダイアログ ================= */
  const dlg = $('#detail');
  let dFrame = $('#dFrame');
  const ed = $('#dEd');
  const hlEl = $('#dHl');
  const consoleEl = $('#dConsole');
  dFrame.setAttribute('allow', ALLOW);
  dFrame.setAttribute('allowfullscreen', '');
  // 同じ iframe の srcdoc を書き換えると、そのたびにブラウザの履歴が1件増える。すると × で閉じたときの
  // history.back() が自分の積んだ #e= ではなく iframe の中を1つ戻すだけになり、前の項目の履歴が残ってしまう。
  // 作ったばかりの iframe の最初の読み込みは履歴に残らないので、見本を出すたびに iframe ごと差し替える
  function freshFrame(doc, sandbox) {
    const f = dFrame.cloneNode(false);
    f.removeAttribute('srcdoc');
    if (sandbox) f.setAttribute('sandbox', sandbox); else f.removeAttribute('sandbox');
    if (doc != null) f.srcdoc = doc;
    dFrame.replaceWith(f);
    dFrame = f;
    return f;
  }

  function consoleLine(level, text) {
    const div = document.createElement('div');
    div.className = 'l-' + level;
    div.textContent = (level === 'error' ? '✖ ' : level === 'warn' ? '⚠ ' : '› ') + text;
    consoleEl.append(div);
    while (consoleEl.childElementCount > 200) consoleEl.firstChild.remove();
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
  const getCode = () => state.edits.get(state.current.id) || state.current.src;

  function openEntry(id, { push = true } = {}) {
    const e = D.byId.get(id);
    if (!e) return;
    const wasOpen = dlg.open;
    state.current = e;
    const c = catOf(e.c);
    dlg.style.setProperty('--h', c.hue);
    $('#dNo').textContent = 'No.' + pad(e.no);
    $('#dTitle').textContent = e.t;
    $('#dYomi').textContent = e.y;
    const seal = $('#dSeal');
    seal.textContent = c.seal;
    seal.title = c.name;
    seal.classList.toggle('latin', /^[A-Za-z]/.test(c.seal));
    $('#dLv').textContent = '難しさ ' + '●'.repeat(e.lv) + '○'.repeat(3 - e.lv);
    $('#dDesc').textContent = e.d;
    $('#dFav').setAttribute('aria-pressed', state.favs.has(e.id));
    $('#dPoint').textContent = e.p || '';
    $('#dPipe').innerHTML = e.pipe ? `パイプ工房で試す： <a href="#v=pipe&p=${encodeURIComponent(e.pipe)}"><code>${esc(e.pipe)}</code></a>` : '';
    // 話題の項目: 再現した日と、元になった記事・投稿へのリンク
    const srcs = Array.isArray(e.refs) ? e.refs.filter((s) => s && /^https?:\/\//.test(s.url)) : [];
    $('#dSrcBox').hidden = !e.date && !srcs.length;
    $('#dDate').textContent = e.date ? `${e.date}（${relDay(e.date)}）に再現` : '';
    $('#dSrc').innerHTML = srcs.map((s) => `<li><a href="${escA(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a></li>`).join('');
    // メガデモ: 1ファイル全体のバイト数と上限
    $('#dSizeBox').hidden = !e.size;
    showSize();
    $('#dPointBox').hidden = !e.p && !e.pipe && $('#dSrcBox').hidden && $('#dSizeBox').hidden;
    $('#dApis').innerHTML = e.apis.map((a) => `<li><a href="#q=${encodeURIComponent('api:"' + a + '"')}">${esc(a)}</a></li>`).join('') || '<li>（なし）</li>';
    $('#dTags').innerHTML = e.tags.map((t) => `<li><a href="#q=${encodeURIComponent('tag:' + t)}">${esc(t)}</a></li>`).join('');
    renderRelated(e);
    showTab(state.tab === 'base' ? 'html' : pickTab(e));
    if (!dlg.open) { unmountAll(); dlg.showModal(); }
    $('#dTitle').focus();
    $('.d-wrap', dlg).scrollTop = 0;
    run();
    state.seen.add(e.id);
    store.set('seen', [...state.seen]);
    if (push) {
      const p = hashParams();
      p.set('e', e.id);
      // 履歴を積むのは「一覧から開いたとき」だけ。開いたまま別の項目へ移るときは置き換えるので、
      // × を1回押せば必ず一覧へ戻れる。共有ページ（claude.ai の枠の中）では枠の外の履歴を動かさないよう積まない
      const stack = !wasOpen && !SHARED;
      setUrl(stack ? 'pushState' : 'replaceState', stack ? { dk: 'entry' } : history.state, '#' + p.toString());
      if (stack) pushedEntry = true;
    }
    log('entry.open', { id: e.id, no: e.no, push }, 'ok');
  }
  // JS が主役の項目は JS タブ、CSS だけの項目は CSS タブから見せる
  function pickTab(e) {
    if (e.src.js.length > 40) return 'js';
    if (e.src.css.length > 40) return 'css';
    return 'html';
  }
  let heroWake = () => {}; // 表紙の粒の動きを続ける（hero() が差し替える）。詳細やパラパラめくりを閉じたときに呼ぶ
  let closedAt = null; // × で閉じて history.back() した時刻（閉じていなければ null）。戻った先で別の項目を開き直さないために使う
  // このページの読み込みの中で、詳しい画面を開くときに履歴を積んだか。再読み込みのあとは history.state が残っていても積んでいないので、
  // 閉じるときは戻らずに #e= を消すだけにする（戻ると、前の一覧のページを読み込み直してしまう）
  let pushedEntry = false;
  // メガデモの大きさ。書き換えたあとは、書き換えたコードで数え直す
  function showSize() {
    const e = state.current;
    if (!e || !e.size) return;
    const c = state.edits.get(e.id), n = D.utf8Bytes(D.miniHtml(c ? { html: c.html, css: c.css, js: c.js } : e));
    $('#dSize').textContent = `${n.toLocaleString('ja-JP')} / ${e.size.toLocaleString('ja-JP')} バイト（html・css・js をつないだ1ファイル全体）` + (c ? (n > e.size ? ' ・ 書き換えたので上限を超えています' : ' ・ 書き換えたあとの大きさ') : '');
  }
  function closeDetail() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', () => {
    log('entry.close', { id: state.current && state.current.id }, 'ok');
    frames.delete(dFrame.contentWindow);
    freshFrame(null);
    const p = hashParams();
    if (state.skipBack) state.skipBack = false;
    else if (p.has('e')) {
      if (pushedEntry && history.state && history.state.dk === 'entry') { pushedEntry = false; closedAt = performance.now(); history.back(); }
      else { p.delete('e'); setUrl('replaceState', null, p.toString() ? '#' + p.toString() : location.pathname + location.search); }
    }
    heroWake();
  });
  $('#dClose').addEventListener('click', closeDetail);
  $('#dFav').addEventListener('click', () => toggleFav(state.current.id));

  function step(dir) {
    const list = state.list.length ? state.list : entries;
    let i = list.indexOf(state.current);
    if (i < 0) i = 0; else i = (i + dir + list.length) % list.length;
    const e = list[i];
    log('entry.step', { from: state.current.id, to: e.id, dir }, 'ok');
    openEntry(e.id, { push: false });
    const p = hashParams();
    p.set('e', e.id);
    setUrl('replaceState', history.state, '#' + p.toString());
  }
  $('#dPrev').addEventListener('click', () => step(-1));
  $('#dNext').addEventListener('click', () => step(1));

  function run() {
    const e = state.current;
    const c = getCode();
    const { doc, jsLine } = buildDoc(e, { mode: 'detail', html: c.html, css: c.css, js: c.js });
    consoleEl.replaceChildren();
    frames.delete(dFrame.contentWindow);
    const f = freshFrame(doc, sandboxFor(e));
    frames.set(f.contentWindow, { entry: e, mode: 'detail', jsLine });
    log('demo.run', { id: e.id, edited: state.edits.has(e.id) }, 'ok');
  }
  $('#dRun').addEventListener('click', run);
  $('#dRerun').addEventListener('click', run);

  // 編集欄
  function showTab(tab) {
    state.tab = tab;
    for (const b of $$('#dTabs [role=tab]')) b.setAttribute('aria-selected', b.dataset.tab === tab);
    const c = getCode();
    ed.value = tab === 'base' ? BASE_CSS : c[tab];
    ed.readOnly = tab === 'base';
    ed.placeholder = tab === 'base' ? '' : '（この項目では使っていません。書き足すこともできます）';
    ed.scrollTop = 0; ed.scrollLeft = 0;
    paintCode();
    paintDirty();
  }
  function paintCode() {
    hlEl.innerHTML = H.highlight(ed.value, state.tab === 'base' ? 'css' : state.tab) + '\n';
    const pre = hlEl.parentElement;
    pre.scrollTop = ed.scrollTop;
    pre.scrollLeft = ed.scrollLeft;
  }
  function paintDirty() {
    const c = state.edits.get(state.current.id);
    for (const b of $$('#dTabs [role=tab]')) {
      const t = b.dataset.tab;
      const dirty = c && t !== 'base' && c[t] !== state.current.src[t];
      const dot = $('.dot', b);
      if (dirty && !dot) b.insertAdjacentHTML('beforeend', '<span class="dot" aria-label="（変更あり）"></span>');
      if (!dirty && dot) dot.remove();
    }
  }
  $('#dTabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('[role=tab]');
    if (b) { showTab(b.dataset.tab); log('code.tab', { id: state.current.id, tab: b.dataset.tab }, 'ok'); }
  });
  let runTimer = 0;
  ed.addEventListener('input', () => {
    if (state.tab === 'base') return;
    const e = state.current;
    const c = { ...(state.edits.get(e.id) || e.src) };
    c[state.tab] = ed.value;
    state.edits.set(e.id, c);
    paintCode();
    paintDirty();
    showSize();
    if ($('#dAuto').checked) { clearTimeout(runTimer); runTimer = setTimeout(run, 650); }
  });
  ed.addEventListener('scroll', () => { const pre = hlEl.parentElement; pre.scrollTop = ed.scrollTop; pre.scrollLeft = ed.scrollLeft; });
  ed.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); clearTimeout(runTimer); run(); }
  });
  $('#dReset').addEventListener('click', () => {
    state.edits.delete(state.current.id);
    showTab(state.tab);
    showSize();
    run();
    log('code.reset', { id: state.current.id }, 'ok');
    toast('元のコードに戻しました');
  });
  // メガデモの「そのまま開ける1ファイル」（数えたバイトそのもの）をコピーする
  $('#dSizeCopy').addEventListener('click', () => {
    const e = state.current;
    if (!e || !e.size) return;
    const c = state.edits.get(e.id);
    copyText(D.miniHtml(c ? { html: c.html, css: c.css, js: c.js } : e), c ? '書き換えたあとの1ファイル' : `${e.size.toLocaleString('ja-JP')}バイト以内の1ファイル`);
    log('demo.copymini', { id: e.id, edited: !!c }, 'ok');
  });
  $('#dCopy').addEventListener('click', () => {
    const c = getCode();
    copyText(state.tab === 'base' ? BASE_CSS : c[state.tab], { html: 'HTML', css: 'CSS', js: 'JavaScript', base: '下地CSS' }[state.tab]);
  });
  $('#dSave').addEventListener('click', async () => {
    const e = state.current, c = getCode();
    const doc = buildDoc(e, { mode: 'export', ...c, inline: await loadData(e) }).doc;   // データも中に入れて、1枚で動くように
    // 共有ページではダウンロードが止められるので、HTML 1枚ぶんをクリップボードへ写す
    if (SHARED) { copyText(doc, 'HTML 1枚ぶん'); return; }
    download(`${pad(e.no)}-${e.id}.html`, doc);
    log('code.save', { id: e.id }, 'ok');
    toast('HTML ファイル1枚にして保存しました');
  });
  if (SHARED) {
    $('#dSave').textContent = 'HTMLをコピー';
    for (const id of ['#dPop', '#dLink', '#pipeShare']) $(id).hidden = true;
    $('#sharedNote').hidden = false;
  }
  $('#dPop').addEventListener('click', async () => {
    const e = state.current, c = getCode();
    const url = URL.createObjectURL(new Blob([buildDoc(e, { mode: 'export', ...c, inline: await loadData(e) }).doc], { type: 'text/html;charset=utf-8' }));
    const w = window.open(url, '_blank');
    log('demo.popout', { id: e.id }, w ? 'ok' : 'blocked');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  $('#dLink').addEventListener('click', () => {
    const url = location.href.split('#')[0] + '#e=' + encodeURIComponent(state.current.id);
    copyText(url, 'この項目へのリンク');
  });
  for (const b of $$('.d-stage .seg button')) {
    b.addEventListener('click', () => {
      for (const x of $$('.d-stage .seg button')) x.setAttribute('aria-pressed', x === b);
      dFrame.style.width = b.dataset.w;
      log('stage.width', { w: b.dataset.w }, 'ok');
    });
  }

  function renderRelated(e) {
    const tags = new Set(e.tags.map(Search.normalize));
    const apis = new Set(e.apis);
    const scored = [];
    for (const o of entries) {
      if (o === e) continue;
      let s = o.c === e.c ? 1.5 : 0;
      for (const t of o.tags) if (tags.has(Search.normalize(t))) s += 2;
      for (const a of o.apis) if (apis.has(a)) s += 0.4;
      if (s > 0) scored.push([s + Math.random() * 0.3, o]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    $('#dRelated').innerHTML = scored.slice(0, 10).map(([, o]) =>
      `<li><a href="#e=${encodeURIComponent(o.id)}" style="--h:${catOf(o.c).hue}"><span class="sw"></span>${esc(o.t)}</a></li>`).join('');
  }

  /* ================= パラパラめくり ================= */
  const flip = $('#flip');
  const book = $('#flipBook');
  let flipList = [], flipIdx = 0, flipTimer = 0, flipPlaying = true;
  function startFlip() {
    flipList = state.list.length ? state.list.slice() : entries.slice();
    if (!flipList.length) return;
    flipIdx = Math.floor(Math.random() * flipList.length);
    flipPlaying = true;
    $('#flipPlay').textContent = '一時停止';
    unmountAll();
    flip.showModal();
    showPage(flipIdx, 0);
    log('flip.start', { count: flipList.length }, 'ok');
  }
  function makePage(e) {
    const page = document.createElement('div');
    page.className = 'page';
    if (e.nt) {
      page.innerHTML = `<div class="center" style="height:100%;display:grid;place-items:center;text-align:center;color:#333;font:700 28px/1.5 var(--serif);background:oklch(0.95 0.04 ${catOf(e.c).hue})">${esc(e.t)}<br><small style="font:14px var(--sans)">カメラやマイクなどを使う項目です。「このページを開く」で試せます。</small></div>`;
    } else {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', sandboxFor(e));
      f.title = e.t;
      const { doc, jsLine } = buildDoc(e, { mode: 'flip' });
      f.srcdoc = doc;
      page.append(f);
      page._frameInfo = { f, info: { entry: e, mode: 'flip', jsLine } };
    }
    page.insertAdjacentHTML('beforeend', `<span class="page-num">No.${pad(e.no)}</span>`);
    return page;
  }
  function showPage(i, dir) {
    i = (i + flipList.length) % flipList.length;
    const e = flipList[i];
    const old = book.querySelector('.page:not(.turning)');
    const page = makePage(e);
    if (old) book.insertBefore(page, old); else book.append(page);
    if (page._frameInfo) frames.set(page._frameInfo.f.contentWindow, page._frameInfo.info);
    if (old) {
      const drop = () => { const fi = old._frameInfo; if (fi) frames.delete(fi.f.contentWindow); old.remove(); };
      old.classList.add('turning');
      if (dir < 0) old.classList.add('back');
      old.addEventListener('animationend', drop, { once: true });
      setTimeout(drop, 1300);
    }
    flipIdx = i;
    $('#flipNo').textContent = 'No.' + pad(e.no);
    $('#flipTitle').textContent = e.t;
    $('#flipYomi').textContent = e.y;
    scheduleFlip();
  }
  function scheduleFlip() {
    clearTimeout(flipTimer);
    if (flipPlaying && flip.open) flipTimer = setTimeout(() => showPage(flipIdx + 1, 1), +$('#flipSpeed').value);
  }
  $('#flipNext').addEventListener('click', () => { showPage(flipIdx + 1, 1); log('flip.next', { i: flipIdx }, 'ok'); });
  $('#flipPrev').addEventListener('click', () => { showPage(flipIdx - 1, -1); log('flip.prev', { i: flipIdx }, 'ok'); });
  $('#flipPlay').addEventListener('click', () => {
    flipPlaying = !flipPlaying;
    $('#flipPlay').textContent = flipPlaying ? '一時停止' : '再生';
    log('flip.play', { playing: flipPlaying }, 'ok');
    scheduleFlip();
  });
  $('#flipSpeed').addEventListener('change', scheduleFlip);
  $('#flipClose').addEventListener('click', () => flip.close());
  $('#flipOpen').addEventListener('click', () => { const e = flipList[flipIdx]; flip.close(); openEntry(e.id); });
  flip.addEventListener('close', () => {
    clearTimeout(flipTimer);
    for (const p of $$('.page', book)) { if (p._frameInfo) frames.delete(p._frameInfo.f.contentWindow); p.remove(); }
    log('flip.stop', {}, 'ok');
    heroWake();
  });
  flip.addEventListener('keydown', (ev) => {
    if (/SELECT|INPUT/.test(ev.target.tagName)) return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); showPage(flipIdx + 1, 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); showPage(flipIdx - 1, -1); }
  });
  $('#flipBtn').addEventListener('click', startFlip);

  /* ================= でたらめに開く ================= */
  function openRandom() {
    const list = state.list.length ? state.list : entries;
    const e = list[Math.floor(Math.random() * list.length)];
    log('random', { id: e.id }, 'ok');
    openEntry(e.id);
  }
  $('#randomBtn').addEventListener('click', openRandom);

  /* ================= 索引 ================= */
  let indexDone = false;
  function renderIndex() {
    if (indexDone) return;
    indexDone = true;
    const link = (e) => `<li><a href="#e=${encodeURIComponent(e.id)}">${esc(e.t)}<span class="n">${pad(e.no)}</span></a></li>`;
    let html = '<section class="ix-sec" id="ix-kana"><h2>五十音</h2>';
    const byKana = new Map();
    for (const e of [...entries].sort((a, b) => a.y.localeCompare(b.y, 'ja'))) {
      const k = Search.normalize(e.y)[0] || '他';
      if (!byKana.has(k)) byKana.set(k, []);
      byKana.get(k).push(e);
    }
    for (const [k, list] of byKana) html += `<div class="ix-group"><h3>${esc(k)}<small>${list.length}項目</small></h3><ul class="ix-items">${list.map(link).join('')}</ul></div>`;
    html += '</section><section class="ix-sec" id="ix-cat"><h2>分類</h2>';
    for (const c of D.cats) {
      const list = entries.filter((e) => e.c === c.id);
      if (list.length) html += `<div class="ix-group"><h3 style="font-size:17px">${esc(c.name)}<small>${list.length}項目</small></h3><ul class="ix-items">${list.map(link).join('')}</ul></div>`;
    }
    html += '</section><section class="ix-sec" id="ix-api"><h2>使っている技術</h2>';
    const byApi = new Map();
    for (const e of entries) for (const a of e.apis) { if (!byApi.has(a)) byApi.set(a, []); byApi.get(a).push(e); }
    for (const [a, list] of [...byApi].sort((x, y) => y[1].length - x[1].length)) {
      html += `<div class="ix-group"><h3 style="font:700 14px/1.3 var(--mono);color:var(--ai)">${esc(a)}<small>${list.length}項目</small></h3><ul class="ix-items">${list.map(link).join('')}</ul></div>`;
    }
    html += '</section><section class="ix-sec" id="ix-tag"><h2>タグ</h2><div class="cloud">';
    const byTag = new Map();
    for (const e of entries) for (const t of e.tags) byTag.set(t, (byTag.get(t) || 0) + 1);
    const max = Math.max(1, ...byTag.values());
    for (const [t, n] of [...byTag].sort((a, b) => a[0].localeCompare(b[0], 'ja'))) {
      const size = 13 + Math.round(Math.sqrt(n / max) * 22);
      html += `<a href="#q=${encodeURIComponent('tag:' + t)}" style="font-size:${size}px">${esc(t)}</a>`;
    }
    html += '</div></section>';
    $('#indexBody').innerHTML = html;
    log('index.render', { entries: entries.length, apis: byApi.size, tags: byTag.size }, 'ok');
  }

  /* ================= 自己診断 ================= */
  const testResults = new Map();
  function testRecord(e, msg) { if (testResults.has(e.id)) testResults.get(e.id).push(msg); }
  // only に id の並びを渡すと、その項目だけを確かめる（#v=test&only=a,b で自動で始まる）
  async function runSelfTest(only) {
    const btn = $('#testStart');
    btn.disabled = true;
    const pick = Array.isArray(only) && only.length ? new Set(only) : null;
    const list = entries.filter((e) => !e.perm && (!pick || pick.has(e.id)));
    const stage = $('#testStage');
    const out = $('#testList');
    out.replaceChildren();
    testResults.clear();
    log('selftest.start', { total: list.length, skipped: entries.length - list.length }, 'ok');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let ng = 0;
    for (let i = 0; i < list.length; i += 6) {
      const batch = list.slice(i, i + 6);
      const fs = batch.map((e) => {
        testResults.set(e.id, []);
        const f = document.createElement('iframe');
        f.setAttribute('sandbox', sandboxFor(e));
        f.title = e.t;
        const { doc, jsLine } = buildDoc(e, { mode: 'test' });
        f.srcdoc = doc;
        stage.append(f);
        frames.set(f.contentWindow, { entry: e, mode: 'test', jsLine });
        return f;
      });
      await sleep(1800);
      for (const f of fs) { frames.delete(f.contentWindow); f.remove(); }
      for (const e of batch) {
        const errs = testResults.get(e.id);
        if (errs.length) ng++;
        const li = document.createElement('li');
        li.innerHTML = `${pad(e.no)} ${esc(e.id)} ${esc(e.t)} … ${errs.length ? `<span class="ng">NG: ${esc(errs.join(' / '))}</span>` : 'OK'}`;
        out.append(li);
        log('selftest.result', { id: e.id, no: e.no }, errs.length ? 'error: ' + errs.join(' / ') : 'ok');
      }
      $('#testSummary').textContent = `${Math.min(i + 6, list.length)} / ${list.length} 項目を確認、エラー ${ng} 件`;
    }
    log('selftest.done', { total: list.length, ng }, ng ? 'error' : 'ok');
    btn.disabled = false;
  }
  $('#testStart').addEventListener('click', () => runSelfTest());

  /* ================= 画面の切り替えと URL ================= */
  function hashParams() { return new URLSearchParams(location.hash.slice(1)); }
  function bookParams() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat) p.set('cat', state.cat);
    if (state.lv) p.set('lv', state.lv);
    if (state.sort !== 'auto') p.set('sort', state.sort);
    return p;
  }
  function syncHash() {
    if (state.view !== 'book') return;
    const p = bookParams();
    const cur = hashParams();
    if (cur.has('e')) p.set('e', cur.get('e'));
    const s = p.toString();
    setUrl('replaceState', history.state, s ? '#' + s : location.pathname + location.search);
  }
  function showView(v) {
    if (!['book', 'pipe', 'index', 'test'].includes(v)) v = 'book';
    if (state.view === v && !$('#view-' + v).hidden) return;
    const prev = state.view;
    state.view = v;
    for (const s of $$('main > .view')) s.hidden = s.id !== 'view-' + v;
    for (const a of $$('.mainnav a')) {
      if (a.dataset.nav === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    if (v !== 'book') unmountAll();
    if (v === 'index') renderIndex();
    if (window.DekiruPipeUI) { if (v === 'pipe') window.DekiruPipeUI.show(); else if (prev === 'pipe') window.DekiruPipeUI.hide(); }
    if (prev !== v) { scrollTo(0, 0); log('view', { from: prev, to: v }, 'ok'); }
  }
  function route() {
    const p = hashParams();
    const v = p.get('v') || 'book';
    if (v === 'book') {
      const q = p.get('q') || '', cat = p.get('cat') || '', lv = p.get('lv') || '', sort = p.get('sort') || 'auto';
      const changed = q !== state.q || cat !== state.cat || lv !== state.lv || sort !== state.sort;
      state.q = q; state.cat = cat; state.lv = lv; state.sort = sort;
      qEl.value = q; $('#lvSel').value = lv; $('#sortSel').value = sort;
      showView('book');
      if (changed) applyFilters();
    } else {
      showView(v);
      if (v === 'pipe' && window.DekiruPipeUI && p.get('p')) window.DekiruPipeUI.load(p.get('p'), true);
      if (v === 'test' && p.get('only') && !$('#testStart').disabled) runSelfTest(p.get('only').split(',').map((s) => s.trim()).filter(Boolean));
    }
    const id = p.get('e');
    const justClosed = closedAt !== null && performance.now() - closedAt < 1000;
    closedAt = null; // 「閉じた直後」の扱いは、閉じて1つ戻った最初の1回だけ
    if (id && D.byId.has(id) && !dlg.open && justClosed) {
      // × で閉じて1つ戻った先が、前に積まれた別の項目だった（直す前の版で積まれた履歴など）。開き直さずに印だけ消す
      p.delete('e');
      setUrl('replaceState', null, p.toString() ? '#' + p.toString() : location.pathname + location.search);
      log('entry.stale', { id }, 'skipped');
    } else if (id && D.byId.has(id)) {
      if (!dlg.open || !state.current || state.current.id !== id) openEntry(id, { push: false });
    } else if (dlg.open) {
      // ブラウザの「戻る」で閉じた。積んだ履歴はもう使われたので、印を下ろす
      state.skipBack = true;
      pushedEntry = false;
      dlg.close();
    }
  }
  addEventListener('popstate', route);
  addEventListener('hashchange', route);

  // ページ内リンクの横取り: #e= は履歴付きで開き、#q= は詳細を閉じて検索する
  document.addEventListener('click', (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target.closest('a[href^="#"]');
    if (!a) return;
    const p = new URLSearchParams(a.getAttribute('href').slice(1));
    if (p.has('e') && !p.has('v')) {
      ev.preventDefault();
      if (state.view !== 'book' && state.view !== 'index') showView('book');
      openEntry(p.get('e'));
    } else if (p.has('q')) {
      ev.preventDefault();
      if (dlg.open) { state.skipBack = true; dlg.close(); }
      state.cat = ''; state.lv = '';
      $('#lvSel').value = '';
      setUrl('pushState', null, '#q=' + encodeURIComponent(p.get('q')));
      setQuery(p.get('q'), 'link');
    } else if (p.get('v') === 'pipe' && dlg.open) {
      state.skipBack = true;
      dlg.close();
    }
  });

  /* ================= キー操作 ================= */
  function focusSearch() {
    if (state.view !== 'book') { setUrl('pushState', null, '#'); showView('book'); }
    qEl.focus();
    qEl.select();
  }
  addEventListener('keydown', (ev) => {
    const t = ev.target;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); if (dlg.open) dlg.close(); focusSearch(); return; }
    if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (dlg.open) {
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); step(-1); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); step(1); }
      return;
    }
    if (flip.open || $('#unitDlg').open) return;
    if (ev.key === '/') { ev.preventDefault(); focusSearch(); }
    else if (ev.key === 'r' || ev.key === 'R') openRandom();
    else if (ev.key === 'p' || ev.key === 'P') startFlip();
    else if (ev.key === '?') { try { $('#searchHelp').togglePopover(); } catch { /* 非対応 */ } }
  });

  /* ================= 表紙の粒子文字 ================= */
  // 重さを測ったら、何もしていないトップでも 5 秒で CPU を 3 秒ほど使っていた（tools/perf.mjs）。
  // 1700 個の点を 1 つずつ塗っていたのを色ごとに 1 回の塗りにまとめ、粒が止まったら描くのをやめ、
  // 詳細やパラパラめくりを開いている間（表紙が見えない間）も止める
  function hero() {
    const cv = $('#heroCanvas');
    const ctx = cv.getContext('2d');
    const WORDS = ['出来る！', '描ける', '鳴らせる', '動かせる', '遊べる', '計算できる', '出来る！'];
    const N = 1700;
    let W = 0, Hh = 0, dpr = 1, parts = [], wi = 0, raf = 0, onScreen = true, timer = 0;
    let running = !reduceMotion.matches;
    const mouse = { x: -1e4, y: -1e4 };
    let ink = '#222', shu = '#c23b22';
    const readColors = () => { const cs = getComputedStyle(document.body); ink = cs.color; shu = cs.getPropertyValue('--shu').trim() || shu; };
    // 文字の形（点の並び）は、言葉と大きさごとに 1 回だけ数える（毎回 getImageData で読むと重い）
    const shapeCache = new Map();
    const STILL = 0.3; // 画素。どの粒の速さと的までの距離もこれより小さければ、止まったとみなす

    function targets(word) {
      const key = word + '|' + W + 'x' + Hh;
      if (shapeCache.has(key)) return shapeCache.get(key);
      if (shapeCache.size > 20) shapeCache.clear();
      const pts = readShape(word);
      shapeCache.set(key, pts);
      return pts;
    }
    function readShape(word) {
      const off = document.createElement('canvas');
      off.width = W; off.height = Hh;
      const o = off.getContext('2d', { willReadFrequently: true });
      const size = Math.min(Hh * 0.6, (W * 0.96) / [...word].length);
      o.font = `800 ${size}px "Hiragino Mincho ProN","Yu Mincho",YuMincho,serif`;
      o.textAlign = 'center';
      o.textBaseline = 'middle';
      o.fillText(word, W / 2, Hh / 2);
      const data = o.getImageData(0, 0, W, Hh).data;
      const pts = [];
      const st = Math.max(2, Math.round(Math.sqrt((W * Hh) / 16000)));
      for (let y = 0; y < Hh; y += st) for (let x = 0; x < W; x += st) if (data[(y * W + x) * 4 + 3] > 140) pts.push(x, y);
      return pts;
    }
    function assign(word) {
      if (!parts.length) return; // まだ大きさが決まっていない（ResizeObserver の最初の知らせの前）
      const pts = targets(word);
      const m = pts.length / 2;
      if (!m) return;
      for (let i = 0; i < parts.length; i++) {
        const k = ((i * 7919) % m) * 2;
        parts[i].tx = pts[k] + (Math.random() - 0.5) * 1.5;
        parts[i].ty = pts[k + 1] + (Math.random() - 0.5) * 1.5;
      }
    }
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width * dpr));
      Hh = Math.max(1, Math.round(r.height * dpr));
      cv.width = W; cv.height = Hh;
      if (!parts.length) {
        for (let i = 0; i < N; i++) parts.push({ x: Math.random() * W, y: Math.random() * Hh, vx: 0, vy: 0, tx: 0, ty: 0, red: Math.random() < 0.14 });
      }
      assign(WORDS[wi]);
      if (!running) { for (const p of parts) { p.x = p.tx; p.y = p.ty; } draw(); }
    }
    function draw() {
      ctx.clearRect(0, 0, W, Hh);
      const s = 1.6 * dpr;
      // 点を 1 つずつ塗らず、四角を道筋に足して色ごとに 1 回だけ塗る
      for (const red of [false, true]) {
        ctx.beginPath();
        for (const p of parts) if (p.red === red) ctx.rect(p.x, p.y, s, s);
        ctx.fillStyle = red ? shu : ink;
        ctx.fill();
      }
    }
    function tick() {
      raf = 0;
      if (overlayOpen()) return; // 詳細などで覆われている。閉じたら heroWake() で続ける
      const R = 90 * dpr;
      let moving = 0;
      for (const p of parts) {
        let ax = (p.tx - p.x) * 0.018, ay = (p.ty - p.y) * 0.018;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < R * R) { const d = Math.sqrt(d2) || 1, f = (1 - d / R) * 3.2; ax += (dx / d) * f; ay += (dy / d) * f; }
        p.vx = (p.vx + ax) * 0.86; p.vy = (p.vy + ay) * 0.86;
        p.x += p.vx; p.y += p.vy;
        if (moving < STILL) moving = Math.max(moving, Math.abs(p.vx) + Math.abs(p.vy), Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y));
      }
      draw();
      // どの粒もほぼ止まったら描くのをやめる。次の言葉へ移るときと、マウスが動いたときに start() でまた始める
      if (moving < STILL) return;
      if (running && onScreen) raf = requestAnimationFrame(tick);
    }
    function cycle() {
      clearTimeout(timer);
      if (!running) return;
      timer = setTimeout(() => { wi = (wi + 1) % WORDS.length; assign(WORDS[wi]); start(); cycle(); }, wi === 0 ? 4200 : 2300);
    }
    function start() { if (!raf && running && onScreen && !overlayOpen()) raf = requestAnimationFrame(tick); }
    heroWake = start;
    cv.parentElement.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); mouse.x = (e.clientX - r.left) * dpr; mouse.y = (e.clientY - r.top) * dpr; start(); });
    cv.parentElement.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; start(); });
    new IntersectionObserver(([it]) => { onScreen = it.isIntersecting; start(); }).observe(cv);
    // 大きさが決まったら（最初の 1 回もここで）点を並べる。読み込みの途中で大きさを読んで、ページ全体の配置の計算を急がせないため
    new ResizeObserver(() => { resize(); start(); }).observe(cv);
    // 粒が止まっていると次の言葉まで描き直さないので、配色が変わったらその場で描き直す
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
    const btn = $('#heroPause');
    const setBtn = () => { btn.textContent = running ? '動きを止める' : '動かす'; };
    btn.addEventListener('click', () => {
      running = !running;
      setBtn();
      log('hero.toggle', { running }, 'ok');
      if (running) { cycle(); start(); }
      else { cancelAnimationFrame(raf); raf = 0; clearTimeout(timer); wi = 0; assign(WORDS[0]); for (const p of parts) { p.x = p.tx; p.y = p.ty; } draw(); }
    });
    setBtn();
    readColors();
    cycle();
  }

  function countUp(el, to) {
    if (reduceMotion.matches) { el.textContent = to; return; }
    const t0 = performance.now();
    const f = (t) => { const k = Math.min(1, Math.max(0, (t - t0) / 900)); // 描く時刻 t は呼んだ時刻より前のことがある。負の数を出さない
      el.textContent = Math.round(to * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }

  /* ================= 起動 ================= */
  window.DekiruApp = { entries, buildDoc, sandboxFor, frames, toast, log, openEntry, store };
  if (window.DekiruPipeUI) window.DekiruPipeUI.init({ toast, log, store, frames });
  countUp($('#statEntries'), entries.length);
  countUp($('#statUnits'), window.DekiruPipeUI ? window.DekiruPipeUI.unitCount() : 0);
  const p0 = hashParams();
  state.q = p0.get('q') || ''; state.cat = p0.get('cat') || ''; state.lv = p0.get('lv') || ''; state.sort = p0.get('sort') || 'auto';
  qEl.value = state.q; $('#lvSel').value = state.lv; $('#sortSel').value = state.sort;
  applyFilters();
  route();
  booting = false;
  // 最初の画面を描いたあとで、残りのカードを少しずつ入れる
  requestAnimationFrame(() => setTimeout(drainLater, 0));
  try { hero(); } catch (err) { log('hero.error', { msg: err.message }, 'exception'); }
  log('app.ready', { entries: entries.length, cats: D.cats.length }, 'ok');
})();
