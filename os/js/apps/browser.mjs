// ウェブブラウザ: タブ、住所の欄、戻る・進む・更新・中止、ブックマークと履歴（仮想ドライブの /ネット）、スタートページ、
// 百科事典（Wikipedia の公開の API）の検索と読む表示、仮想ドライブの HTML。
// 外のページは、窓の中での表示を断らなければ iframe でそのまま開く。断るページは、手元で OS を動かすとき
// （node tools/serve.mjs）だけ、手元の中継で取って sandbox の iframe に出す。公開版では「外のタブで開く」で本物のブラウザへ渡す。
// 中継したページと仮想ドライブの HTML は allow-same-origin を付けない iframe に出し、OS の保存場所に触れさせない。
// 計算（住所の読み取り、見出しの判断、ページの書き換え）は core/browser.mjs。
import * as B from '../core/browser.mjs';

const RELAY = '/__arcadia/relay';
const DIR = '/ネット', BOOKMARKS = DIR + '/ブックマーク.json', HISTORY = DIR + '/履歴.json', PREFS = DIR + '/設定.json';
const DIRECT_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads';
const ISOLATED_SANDBOX = 'allow-scripts allow-forms';
// 読む表示で残す要素と属性（ほかは中身ごと除く。div・span などは中身だけ残す）
const READ_ELEMENTS = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code', 'em', 'strong', 'b', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark', 'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'section', 'article', 'abbr', 'cite', 'q', 'time', 'kbd', 'var', 'samp', 'del', 'ins'];
const READ_UNWRAP = ['div', 'span', 'main', 'header', 'footer', 'aside', 'nav', 'font', 'center', 'picture'];
const READ_ATTRS = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'lang', 'dir'];

let relayCheck = null; // 手元の中継があるか（OS 全体で1回だけ調べる）
const relayAvailable = () => (relayCheck ??= fetch(RELAY + '?mode=ping', { headers: { 'x-arcadia-relay': '1' }, cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : null)).then((j) => !!j?.ok).catch(() => false));
async function relayCall(mode, url, signal) {
  const r = await fetch(`${RELAY}?mode=${mode}&url=${encodeURIComponent(url)}`, { headers: { 'x-arcadia-relay': '1' }, cache: 'no-store', signal });
  const j = await r.json().catch(() => ({ ok: false, error: `中継が ${r.status} を返しました` }));
  if (!j.ok) throw new Error(j.error || '中継に失敗しました');
  return j;
}

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  const target = args.path || args.url;
  const one = wm.list().find((w) => w.app === 'browser');
  if (one && target) { one.focus(); one.openInTab?.(target); return one; }
  let tabs = [], cur = null, seq = 0, lastMsg = '', marks = [], history = [], prefs = { external: [], wikiLang: 'ja' };
  const win = wm.open({
    app: 'browser', icon: 'icons/browser.svg', className: 'app-browser', title: 'ウェブブラウザ', w: 980, h: 680, ...rect, args: {},
    render(w) {
      w.body.innerHTML = `<div class="bw-main">
        <div class="bw-tabrow"><div class="bw-tabs" role="tablist" aria-label="開いているページ" data-tabs></div><button type="button" class="flat bw-newtab" data-a="newtab" aria-label="新しいタブ" title="新しいタブ">＋</button></div>
        <div class="bw-bar" role="toolbar" aria-label="ページの移動">
          <button type="button" class="flat bw-btn" data-a="back" disabled>戻る(<u>B</u>)</button>
          <button type="button" class="flat bw-btn" data-a="forward" disabled>進む(<u>N</u>)</button>
          <button type="button" class="flat bw-btn" data-a="reload">更新(<u>R</u>)</button>
          <button type="button" class="flat bw-btn" data-a="stop" hidden>中止(<u>S</u>)</button>
          <label class="bw-addr-label" for="bwAddr-${w.id}">住所(<u>L</u>):</label>
          <input id="bwAddr-${w.id}" class="bw-addr" type="text" inputmode="url" enterkeyhint="go" spellcheck="false" autocomplete="off" data-addr>
          <button type="button" class="flat bw-btn" data-a="go">移動(<u>G</u>)</button>
          <button type="button" class="flat bw-btn" data-a="mark" aria-pressed="false">印を付ける(<u>K</u>)</button>
          <button type="button" class="flat bw-btn" data-a="reader">読む表示(<u>Y</u>)</button>
          <button type="button" class="flat bw-btn" data-a="external">外のタブで開く(<u>T</u>)</button>
        </div>
        <div class="bw-progress" data-progress hidden></div>
        <div class="bw-pages" data-pages></div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:170px" data-mode></div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const addr = q('[data-addr]'), pages = q('[data-pages]'), tabsEl = q('[data-tabs]');
  // 状態の文はタブごとに持ち、選んでいるタブの文だけを出す
  function say(text, t = cur) {
    if (t) t.status = text;
    if (t && t !== cur) return;
    let m = text; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m;
  }
  const modeText = { start: 'スタートページ', search: '百科事典の検索', wiki: '読む表示（百科事典）', read: '読む表示', direct: 'そのまま表示', relay: '手元の中継で表示', vfs: '仮想ドライブ', blocked: '外のタブで開く', error: '開けませんでした' };

  /* ---------- 保存（仮想ドライブの /ネット） ---------- */
  const readJSON = async (p, d) => { try { return await fs.readJSON(p); } catch { return d; } };
  const saveJSON = (p, v) => fs.write(p, JSON.stringify(v, null, 1), 'application/json').catch((e) => log('browser.save', { path: p }, 'error: ' + e.message));
  async function loadData() {
    [marks, history, prefs] = await Promise.all([readJSON(BOOKMARKS, []), readJSON(HISTORY, []), readJSON(PREFS, prefs)]);
    if (!Array.isArray(marks)) marks = []; if (!Array.isArray(history)) history = [];
    prefs = { external: [], wikiLang: 'ja', ...prefs };
  }

  /* ---------- タブ ---------- */
  function newTab(input = 'arcadia://start', { select = true } = {}) {
    const panel = document.createElement('div');
    panel.className = 'bw-page'; panel.setAttribute('role', 'tabpanel'); panel.hidden = true;
    const t = { id: ++seq, entries: [], index: -1, title: '新しいタブ', panel, frame: null, ctrl: null, cache: null };
    panel.id = `bwPage-${win.id}-${t.id}`;
    pages.append(panel); tabs.push(t);
    if (select) selectTab(t);
    navigate(t, input);
    drawTabs();
    return t;
  }
  function selectTab(t) {
    cur = t;
    for (const x of tabs) x.panel.hidden = x !== t;
    drawTabs(); syncBar();
    win.setTitle(`${t.title} - ウェブブラウザ`);
    say(t.status || '', t);
  }
  function closeTab(t) {
    if (tabs.length === 1) { navigate(t, 'arcadia://start'); return; }
    const i = tabs.indexOf(t);
    t.ctrl?.abort(); t.panel.remove(); tabs.splice(i, 1);
    if (cur === t) selectTab(tabs[Math.min(i, tabs.length - 1)]); else drawTabs();
    sound.play('close');
  }
  function drawTabs() {
    tabsEl.innerHTML = tabs.map((t) => `<button type="button" role="tab" class="flat bw-tab" id="bwTab-${win.id}-${t.id}" data-tab="${t.id}" aria-selected="${t === cur}" tabindex="${t === cur ? 0 : -1}" title="${esc(t.title)}"><span class="bw-tab-label">${esc(t.title)}</span><span class="bw-x" data-close="${t.id}" aria-hidden="true">×</span></button>`).join('');
    for (const t of tabs) t.panel.setAttribute('aria-labelledby', `bwTab-${win.id}-${t.id}`);
    tabsEl.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const tabById = (id) => tabs.find((t) => t.id === +id);

  /* ---------- 移動 ---------- */
  // input: 住所の欄の文字。push=false は戻る・進む・更新（履歴に足さない）
  async function navigate(t, input, { push = true } = {}) {
    const p = typeof input === 'string' ? B.parseInput(input) : input;
    if (!p) return;
    const address = B.toAddress(p);
    t.ctrl?.abort();
    const ctrl = (t.ctrl = new AbortController());
    if (push) { t.entries.splice(t.index + 1); t.entries.push({ address, title: address }); t.index = t.entries.length - 1; }
    loading(t, true);
    if (t === cur) { addr.value = address; syncBar(); }
    let mode = p.kind, title = address;
    try {
      switch (p.kind) {
        case 'start': title = 'スタートページ'; renderStart(t); break;
        case 'search': title = `「${p.q}」の検索`; await renderSearch(t, p.q, ctrl.signal); break;
        case 'wiki': title = p.title; await renderWiki(t, p.lang, p.title, ctrl.signal); break;
        case 'read': ({ title } = await renderRead(t, p.url, ctrl.signal)); break;
        case 'vfs': title = p.path.split('/').pop(); await renderVfs(t, p.path); break;
        default: ({ mode, title } = await renderWeb(t, p.url, ctrl.signal));
      }
      if (ctrl.signal.aborted) return;
      setTitle(t, title, mode);
      if (p.kind !== 'start') { history = B.addHistory(history, { url: address, title }, 200); saveJSON(HISTORY, history); }
      log('browser.nav', { kind: p.kind, mode, host: p.url ? B.hostOf(p.url) : '' }, 'ok');
      if (mode !== 'direct' && mode !== 'relay') loading(t, false);
    } catch (e) {
      if (ctrl.signal.aborted || e.name === 'AbortError') { loading(t, false); return; }
      loading(t, false);
      renderError(t, p, e.message);
      setTitle(t, '開けませんでした', 'error');
      log('browser.nav', { kind: p.kind, host: p.url ? B.hostOf(p.url) : '' }, 'error: ' + e.message);
    }
  }
  function setTitle(t, title, mode) {
    t.title = title || '無題';
    const e = t.entries[t.index]; if (e) { e.title = t.title; e.mode = mode; }
    t.mode = mode;
    drawTabs();
    if (t === cur) { syncBar(); win.setTitle(`${t.title} - ウェブブラウザ`); win.setArgs({ url: t.entries[t.index]?.address }); }
  }
  function loading(t, on) {
    t.loading = on;
    if (t === cur) { q('[data-progress]').hidden = !on; q('[data-a="stop"]').hidden = !on; q('[data-a="reload"]').hidden = on; }
    if (!on && t === cur && (t.mode === 'direct' || t.mode === 'relay')) sound.play('select'); // 外のページを読み終えたときだけ鳴らす
  }
  function syncBar() {
    const t = cur; if (!t) return;
    const e = t.entries[t.index];
    if (document.activeElement !== addr) addr.value = e?.address || '';
    q('[data-a="back"]').disabled = t.index <= 0 && !t.innerNav;
    q('[data-a="forward"]').disabled = t.index >= t.entries.length - 1;
    const marked = !!e && marks.some((m) => m.url === e.address);
    const mk = q('[data-a="mark"]'); mk.setAttribute('aria-pressed', String(marked)); mk.innerHTML = marked ? '印を外す(<u>K</u>)' : '印を付ける(<u>K</u>)';
    mk.disabled = !e || e.address === 'arcadia://start';
    const p = e && B.parseInput(e.address);
    q('[data-a="external"]').disabled = !(p && (p.kind === 'web' || p.kind === 'read' || p.kind === 'wiki'));
    q('[data-a="reader"]').disabled = !(p && (p.kind === 'web' || p.kind === 'wiki'));
    q('[data-a="stop"]').hidden = !t.loading; q('[data-a="reload"]').hidden = !!t.loading; q('[data-progress]').hidden = !t.loading;
    q('[data-mode]').textContent = (modeText[t.mode] || '') + (t.innerNav ? '（中で移動）' : '');
  }

  /* ---------- 外のページ ---------- */
  function frame(t, sandbox) {
    const f = document.createElement('iframe');
    f.className = 'bw-frame'; f.setAttribute('sandbox', sandbox); f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.title = 'ページの中身';
    // 2回目からの読み込みは、ページの中での移動（相手のサイトの中の住所は、ブラウザの決まりで OS から見えない）
    let loads = 0;
    f.addEventListener('load', () => {
      if (t.frame !== f) return;
      if (++loads === 1) { loading(t, false); return; }
      t.innerNav = loads - 1;
      say('ページの中で移動しました。移動した先の住所は、ブラウザの決まりで OS からは見えません。「戻る」で最初に開いたページに戻ります。', t);
      if (t === cur) syncBar();
    });
    t.panel.replaceChildren(f); t.frame = f; t.innerNav = 0;
    return f;
  }
  async function renderWeb(t, url, signal) {
    const host = B.hostOf(url);
    if (prefs.external.includes(host)) { renderExternalNotice(t, url, true); return { mode: 'blocked', title: host }; }
    if (await relayAvailable()) {
      const info = await relayCall('probe', url, signal);
      if (!info.blocked) { frame(t, DIRECT_SANDBOX).src = info.url; say(`${host} をそのまま表示しています。ページの中で移動した先は、住所の欄に出ないことがあります。`, t); return { mode: 'direct', title: host }; }
      const page = await relayCall('page', info.url, signal);
      if (page.html == null) { renderExternalNotice(t, info.url, false, 'このページは HTML ではないため、中継で表示できません。'); return { mode: 'blocked', title: host }; }
      t.cache = { url: page.url, html: page.html };
      frame(t, ISOLATED_SANDBOX).srcdoc = B.relayDocument(page.html, page.url);
      say(`${host} は窓の中での表示を断るため、手元の中継で表示しています。送信（POST）とログインはできません。`, t);
      return { mode: 'relay', title: host };
    }
    frame(t, DIRECT_SANDBOX).src = url;
    say('表示されないときは、このサイトが窓の中での表示を断っています。「外のタブで開く」を押してください。ページの中で移動した先は、住所の欄に出ないことがあります。', t);
    return { mode: 'direct', title: host };
  }
  // 中継したページからの知らせ（リンクの押下、題名、送れないフォーム）。どのタブの iframe からかを source で確かめる
  function onMessage(e) {
    const t = tabs.find((x) => x.frame && x.frame.contentWindow === e.source && x.mode === 'relay');
    if (!t || typeof e.data !== 'object' || !e.data) return;
    const d = e.data;
    if (d.type === 'arcadia-nav' && typeof d.href === 'string' && B.safeHref(d.href)) {
      if (d.newTab) newTab(d.href); else navigate(t, d.href);
    } else if (d.type === 'arcadia-title' && typeof d.title === 'string' && d.title.trim()) {
      setTitle(t, d.title.trim().slice(0, 120), 'relay');
    } else if (d.type === 'arcadia-post' && t === cur) {
      say('このフォームは送信（POST）なので、中継では送れません。「外のタブで開く」を押してください。'); sound.play('error');
    }
  }
  addEventListener('message', onMessage);
  function openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    say(`本物のブラウザの新しいタブで開きました: ${B.hostOf(url)}`); log('browser.external', { host: B.hostOf(url) }, 'ok');
  }

  /* ---------- 内部のページ ---------- */
  function doc(t, html) { const d = document.createElement('div'); d.className = 'bw-doc'; d.innerHTML = html; t.panel.replaceChildren(d); t.frame = null; t.innerNav = 0; return d; }
  function renderStart(t) {
    relayAvailable().then((relay) => {
      if (t.entries[t.index]?.address !== 'arcadia://start') return;
      const recent = history.slice(0, 12);
      const d = doc(t, `<div class="bw-start">
        <h2 class="bw-h">ARCADIA ネット</h2>
        <form class="bw-search" data-search><label for="bwQ-${win.id}-${t.id}">百科事典とウェブを探す(<u>Q</u>):</label><input id="bwQ-${win.id}-${t.id}" type="search" name="q" enterkeyhint="search" autocomplete="off"><button type="submit" class="flat bw-btn">探す</button></form>
        <section class="bw-sec"><h3 class="bw-h3">印を付けたページ</h3>${marks.length ? `<ul class="bw-list">${marks.map((m, i) => `<li><a class="bw-link" href="#" data-go="${esc(m.url)}">${esc(m.title || m.url)}</a> <span class="bw-dim">${esc(m.url)}</span> <button type="button" class="flat bw-mini" data-unmark="${i}">外す</button></li>`).join('')}</ul>` : '<p class="bw-dim">まだありません。ページを開いて「印を付ける(K)」を押すと、ここに並びます。</p>'}</section>
        <section class="bw-sec"><h3 class="bw-h3">最近見たページ</h3>${recent.length ? `<ul class="bw-list">${recent.map((h) => `<li><a class="bw-link" href="#" data-go="${esc(h.url)}">${esc(h.title || h.url)}</a> <span class="bw-dim">${esc(h.url)}</span></li>`).join('')}</ul><button type="button" class="flat bw-mini" data-clear-history>履歴を消す</button>` : '<p class="bw-dim">まだありません。</p>'}</section>
        ${prefs.external.length ? `<section class="bw-sec"><h3 class="bw-h3">外のタブで開くサイト</h3><ul class="bw-list">${prefs.external.map((h, i) => `<li>${esc(h)} <button type="button" class="flat bw-mini" data-unext="${i}">窓の中で試す</button></li>`).join('')}</ul></section>` : ''}
        <section class="bw-sec"><h3 class="bw-h3">このブラウザのつなぎ方</h3><p>${relay ? '手元のサーバーの中継が使えます。窓の中での表示を断るサイトも、中継して窓の中に出します。' : '公開版のため、手元の中継はありません。窓の中での表示を断るサイトは、「外のタブで開く(T)」で本物のブラウザに渡してください。'}百科事典（Wikipedia）は、どちらでも窓の中で読めます。</p></section>
      </div>`);
      d.querySelector('input[type=search]')?.focus();
      say('スタートページです。言葉を入れて探すか、住所の欄に住所を入れてください。', t);
    });
  }
  async function renderSearch(t, qtext, signal) {
    const lang = prefs.wikiLang || 'ja';
    const d = doc(t, `<div class="bw-start"><h2 class="bw-h">「${esc(qtext)}」の検索</h2><p class="bw-dim">百科事典（${esc(lang)}.wikipedia.org）を探しています…</p></div>`);
    const r = await fetch(B.wikiSearchUrl(lang, qtext), { signal });
    if (!r.ok) throw new Error(`百科事典の検索が ${r.status} を返しました`);
    const items = (await r.json())?.query?.search || [];
    say(`「${qtext}」の検索結果です（百科事典 ${items.length} 件）。`, t);
    const web = `https://duckduckgo.com/html/?q=${encodeURIComponent(qtext)}`;
    d.innerHTML = `<div class="bw-start"><h2 class="bw-h">「${esc(qtext)}」の検索</h2>
      <p><button type="button" class="flat bw-btn" data-web="${esc(web)}">ウェブ全体で探す（DuckDuckGo）</button></p>
      <section class="bw-sec"><h3 class="bw-h3">百科事典（${esc(lang)}.wikipedia.org）: ${items.length} 件</h3>
      ${items.length ? `<ul class="bw-results">${items.map((it) => `<li><a class="bw-link" href="#" data-go="arcadia://wiki/${esc(lang)}/${esc(it.title)}">${esc(it.title)}</a><p>${esc(B.stripTags(it.snippet))}…</p></li>`).join('')}</ul>` : '<p class="bw-dim">見つかりませんでした。言葉を変えるか、「ウェブ全体で探す」を押してください。</p>'}</section></div>`;
  }
  async function renderWiki(t, lang, title, signal) {
    doc(t, `<div class="bw-read"><p class="bw-dim">百科事典から「${esc(title)}」を読んでいます…</p></div>`);
    const r = await fetch(B.wikiHtmlUrl(lang, title), { signal });
    if (r.status === 404) throw new Error(`百科事典に「${title}」という記事はありません`);
    if (!r.ok) throw new Error(`百科事典が ${r.status} を返しました`);
    const html = await r.text();
    const d = doc(t, `<article class="bw-read"><h1 class="bw-rtitle">${esc(title)}</h1><p class="bw-dim">出典: <a class="bw-link" href="#" data-go="${esc(B.wikiPageUrl(lang, title))}">${esc(lang)}.wikipedia.org</a>（CC BY-SA）</p><div data-body></div></article>`);
    sanitizeInto(d.querySelector('[data-body]'), html, B.wikiPageUrl(lang, title), (href) => B.wikiLink(href, lang));
    say(`百科事典の「${title}」を読む表示で出しています。`, t);
  }
  async function renderRead(t, url, signal) {
    if (!(await relayAvailable())) throw new Error('この読む表示には手元の中継が要ります（公開版では使えません）');
    const page = t.cache?.url === url ? t.cache : await relayCall('page', url, signal);
    if (page.html == null) throw new Error('このページは HTML ではありません');
    const parsed = new DOMParser().parseFromString(page.html, 'text/html');
    const main = parsed.querySelector('article, main, [role=main]') || parsed.body;
    const title = (parsed.title || B.hostOf(url)).trim();
    const d = doc(t, `<article class="bw-read"><h1 class="bw-rtitle">${esc(title)}</h1><p class="bw-dim">元のページ: <a class="bw-link" href="#" data-go="${esc(page.url)}">${esc(page.url)}</a></p><div data-body></div></article>`);
    sanitizeInto(d.querySelector('[data-body]'), main.innerHTML, page.url, () => null);
    say('本文だけを読む表示で出しています。', t);
    return { title };
  }
  async function renderVfs(t, path) {
    const st = await fs.stat(path);
    if (!st || st.kind !== 'file') throw new Error(`「${path}」が仮想ドライブにありません`);
    frame(t, ISOLATED_SANDBOX).srcdoc = await fs.readText(path);
    say(`仮想ドライブの「${path}」を開いています（OS の保存場所には触れない、隔てた表示です）。`, t);
  }
  function renderError(t, p, message) {
    const url = p.url;
    doc(t, `<div class="bw-start"><h2 class="bw-h">ページを開けませんでした</h2><p>${esc(message)}。</p>
      ${url ? `<p>住所: ${esc(url)}</p><p><button type="button" class="flat bw-btn" data-ext="${esc(url)}">外のタブで開く</button> <button type="button" class="flat bw-btn" data-a="reload">もう一度試す</button></p>` : '<p><button type="button" class="flat bw-btn" data-a="reload">もう一度試す</button></p>'}</div>`);
    say(`開けませんでした: ${message}`, t); sound.play('error');
  }
  function renderExternalNotice(t, url, remembered, why = '') {
    const host = B.hostOf(url);
    doc(t, `<div class="bw-start"><h2 class="bw-h">${esc(host)} は外のタブで開きます</h2>
      <p>${esc(why || (remembered ? 'このサイトは「外のタブで開く」に登録されています。' : ''))}</p>
      <p><button type="button" class="flat bw-btn" data-ext="${esc(url)}">外のタブで開く</button>${remembered ? ` <button type="button" class="flat bw-btn" data-unext-host="${esc(host)}">窓の中で試す</button>` : ''}</p></div>`);
    t.frame = null;
  }

  /* ---------- 読む表示: 外から受け取った HTML を、許した要素と属性だけにして入れる ---------- */
  function sanitizeInto(box, html, baseUrl, mapLink) {
    let body = null;
    if (typeof Document.parseHTML === 'function') {
      // Sanitizer API（Chrome 146・Firefox 148 から）。危ない要素と属性は、どの設定でも除かれる
      try { body = Document.parseHTML(html, { sanitizer: { elements: READ_ELEMENTS, attributes: READ_ATTRS, replaceWithChildrenElements: READ_UNWRAP } }).body; } catch (e) { log('browser.sanitize', {}, 'error: ' + e.message); }
    }
    if (!body) {
      // 使えないブラウザ: 読み込みも実行もしない文書（DOMParser）で、許したものだけを残す
      body = new DOMParser().parseFromString(html, 'text/html').body;
      const walk = (el) => {
        for (const c of [...el.children]) {
          const name = c.localName;
          if (READ_UNWRAP.includes(name)) { walk(c); c.replaceWith(...c.childNodes); continue; }
          if (!READ_ELEMENTS.includes(name)) { c.remove(); continue; }
          for (const a of [...c.attributes]) if (!READ_ATTRS.includes(a.name)) c.removeAttribute(a.name);
          walk(c);
        }
      };
      walk(body);
    }
    // リンクと画像の住所を確かめる（http と https だけ）。リンクは OS のブラウザの中で開く
    // ページの中への移動（#注 など）はリンクにしない（移動先の id を、OS の文書の中に残さないため）
    const here = cur?.entries[cur.index]?.address;
    for (const a of body.querySelectorAll('a')) {
      const raw = a.getAttribute('href') || '';
      const inner = mapLink(raw);
      const href = inner || B.safeHref(raw, baseUrl);
      a.removeAttribute('href');
      const inPage = raw.startsWith('#') || (raw.includes('#') && (inner === here || (href || '').split('#')[0] === baseUrl.split('#')[0]));
      if (href && !inPage) { a.setAttribute('href', '#'); a.dataset.go = href; a.className = 'bw-link'; }
    }
    for (const img of body.querySelectorAll('img')) {
      const src = B.safeHref(img.getAttribute('src') || '', baseUrl);
      if (!src) { img.remove(); continue; }
      img.setAttribute('src', src); img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
    }
    box.replaceChildren(...body.childNodes);
  }

  /* ---------- ブックマーク ---------- */
  function toggleMark() {
    const e = cur?.entries[cur.index]; if (!e) return;
    const i = marks.findIndex((m) => m.url === e.address);
    if (i >= 0) { marks.splice(i, 1); say('印を外しました。'); } else { marks.unshift({ url: e.address, title: e.title, added: Date.now() }); say('印を付けました。スタートページに並びます。'); sound.play('pin'); }
    saveJSON(BOOKMARKS, marks); syncBar();
    log('browser.mark', { on: i < 0 }, 'ok');
  }

  /* ---------- 操作 ---------- */
  const go = () => { const v = addr.value; if (v.trim()) navigate(cur, v); };
  const acts = {
    newtab: () => { newTab(); addr.focus(); },
    back: () => {
      if (cur.innerNav) { navigate(cur, cur.entries[cur.index].address, { push: false }); return; } // ページの中で移動していたら、最初に開いたページへ
      if (cur.index > 0) { cur.index--; navigate(cur, cur.entries[cur.index].address, { push: false }); }
    },
    forward: () => { if (cur.index < cur.entries.length - 1) { cur.index++; navigate(cur, cur.entries[cur.index].address, { push: false }); } },
    reload: () => { const e = cur.entries[cur.index]; if (e) { cur.cache = null; navigate(cur, e.address, { push: false }); } },
    stop: () => { cur.ctrl?.abort(); if (cur.frame && cur.loading) cur.frame.src = 'about:blank'; loading(cur, false); say('読み込みを止めました。'); },
    go,
    mark: toggleMark,
    reader: () => {
      const p = B.parseInput(cur.entries[cur.index]?.address || '');
      if (!p) return;
      const wiki = p.kind === 'web' && B.wikiFromUrl(p.url);
      if (wiki) navigate(cur, `arcadia://wiki/${wiki.lang}/${wiki.title}`);
      else if (p.kind === 'web') navigate(cur, `arcadia://read?url=${p.url}`);
      else if (p.kind === 'wiki') navigate(cur, B.wikiPageUrl(p.lang, p.title));
    },
    external: () => {
      const p = B.parseInput(cur.entries[cur.index]?.address || '');
      const url = p?.kind === 'web' || p?.kind === 'read' ? p.url : p?.kind === 'wiki' ? B.wikiPageUrl(p.lang, p.title) : null;
      if (url) openExternal(url);
    },
  };
  win.body.addEventListener('click', async (e) => {
    const el = e.target;
    const x = el.closest('[data-close]'); if (x) { e.stopPropagation(); closeTab(tabById(x.dataset.close)); return; }
    const tb = el.closest('[data-tab]'); if (tb) { selectTab(tabById(tb.dataset.tab)); return; }
    const a = el.closest('[data-a]'); if (a && !a.disabled) { acts[a.dataset.a](); return; }
    const link = el.closest('[data-go]');
    if (link) { e.preventDefault(); if (e.ctrlKey || e.metaKey || e.shiftKey) newTab(link.dataset.go); else navigate(cur, link.dataset.go); return; }
    const ext = el.closest('[data-ext]'); if (ext) { openExternal(ext.dataset.ext); return; }
    const web = el.closest('[data-web]');
    if (web) { if (await relayAvailable()) navigate(cur, web.dataset.web); else openExternal(web.dataset.web); return; }
    const um = el.closest('[data-unmark]'); if (um) { marks.splice(+um.dataset.unmark, 1); saveJSON(BOOKMARKS, marks); renderStart(cur); syncBar(); return; }
    const ux = el.closest('[data-unext]'); if (ux) { prefs.external.splice(+ux.dataset.unext, 1); saveJSON(PREFS, prefs); renderStart(cur); return; }
    const uh = el.closest('[data-unext-host]'); if (uh) { prefs.external = prefs.external.filter((h) => h !== uh.dataset.unextHost); saveJSON(PREFS, prefs); acts.reload(); return; }
    if (el.closest('[data-clear-history]')) { history = []; saveJSON(HISTORY, history); renderStart(cur); say('履歴を消しました。'); }
  });
  // 中クリックでタブを閉じる・リンクを新しいタブで開く
  win.body.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const tb = e.target.closest('[data-tab]'); if (tb) { e.preventDefault(); closeTab(tabById(tb.dataset.tab)); return; }
    const link = e.target.closest('[data-go]'); if (link) { e.preventDefault(); newTab(link.dataset.go, { select: false }); say('新しいタブで開きました。'); }
  });
  win.body.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-search]'); if (!f) return;
    e.preventDefault(); const v = new FormData(f).get('q')?.toString().trim(); if (v) navigate(cur, `arcadia://search?q=${v}`);
  });
  addr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); go(); }
    else if (e.key === 'Escape') { addr.value = cur.entries[cur.index]?.address || ''; addr.select(); }
  });
  addr.addEventListener('focus', () => addr.select());
  // タブの並び: 矢印・Home・End で選び（選ぶとすぐ切り替わる）、Delete で閉じる
  tabsEl.addEventListener('keydown', (e) => {
    const tb = e.target.closest('[data-tab]'); if (!tb || e.altKey || e.ctrlKey || e.metaKey) return;
    const i = tabs.indexOf(tabById(tb.dataset.tab));
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to !== undefined) {
      if (to < 0 || to >= tabs.length) return;
      e.preventDefault(); selectTab(tabs[to]); tabsEl.querySelector(`[data-tab="${tabs[to].id}"]`)?.focus();
    } else if (e.key === 'Delete') { e.preventDefault(); closeTab(tabs[i]); tabsEl.querySelector('[aria-selected="true"]')?.focus(); }
  });
  win.openInTab = (target) => newTab(target);
  win.cleanup = () => { removeEventListener('message', onMessage); for (const t of tabs) t.ctrl?.abort(); };

  await loadData();
  newTab(target || 'arcadia://start');
  log('browser.open', { relay: await relayAvailable() }, 'ok');
  return win;
}
