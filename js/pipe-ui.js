/* パイプ工房の画面 */
(function () {
  'use strict';
  const Core = window.DekiruPipeCore;
  const P = window.DekiruPipeUnits;
  const U = P.units;
  const Search = window.DekiruSearch;
  const H = window.DekiruHighlight;
  const esc = H.escapeHtml;
  const escA = H.escapeAttr;
  const $ = (s) => document.querySelector(s);

  let api = { toast() {}, log() {} };
  const ctx = { t: 0, frame: 0, mouse: { x: 0.5, y: 0.5 }, state: new Map(), media: P.media };
  const T0 = performance.now();
  let gen = 0, raf = 0, busy = false, lastRun = '', visible = false, started = false;

  /* ---- 部品とレシピの検索（図鑑と同じ検索エンジンを使う） ---- */
  const unitEntries = Object.values(U).map((u) => ({ id: 'u:' + u.name, t: u.name, y: u.kana, tags: [P.groups[u.group], ...u.tags], d: u.desc, kind: 'unit', u }));
  const recipeEntries = P.recipes.map((r, i) => ({ id: 'r:' + i, t: r.title, y: r.kana, tags: ['レシピ'], d: r.pipe, kind: 'recipe', r }));
  const allIdx = Search.createIndex([...recipeEntries, ...unitEntries]);
  const unitIdx = Search.createIndex(unitEntries);
  function searchUnits(q) {
    return Search.search(allIdx, q).items.filter((x) => x.score > 0).slice(0, 12).map(({ entry: e }) =>
      e.kind === 'unit' ? { label: e.u.name, pipe: e.u.ex || e.u.name, desc: e.u.desc } : { label: e.r.title, pipe: e.r.pipe, desc: e.r.pipe });
  }

  const TYPE = { text: '文字', list: '並び', num: '数', image: '画像', html: '表示', json: 'JSON', none: '—' };

  /* ---- 表示 ---- */
  function drawImage(c, img) {
    if (c.width !== img.width || c.height !== img.height) { c.width = img.width; c.height = img.height; }
    c.getContext('2d').putImageData(img, 0, 0);
  }
  function setOnce(el, key, html) {
    if (el._key === key) return false;
    el._key = key;
    el.innerHTML = html;
    return true;
  }
  function renderOutput(res) {
    const out = $('#pipeOutput');
    const last = res[res.length - 1];
    if (!last) { setOnce(out, 'empty', '<p>パイプが空です。部品の名前を入れてください。</p>'); return; }
    if (last.error) { setOnce(out, 'err:' + last.error, `<p class="out-err">${res.length}段目で止まりました：${esc(last.error)}</p>`); return; }
    const v = last.value;
    switch (last.type) {
      case 'image': {
        setOnce(out, 'image', '<canvas class="main" aria-label="出力画像"></canvas>');
        const c = out.firstElementChild;
        drawImage(c, v);
        c.style.width = Math.min(960, v.width * (v.width <= 400 ? 2 : 1)) + 'px';
        break;
      }
      case 'html': setOnce(out, 'html:' + v.html, `<div class="out-html">${v.html}</div>`); break;
      case 'num': setOnce(out, 'num:' + v, `<div class="out-num">${esc(String(v))}</div>`); break;
      case 'list': setOnce(out, 'list:' + JSON.stringify(v).slice(0, 4000), `<div class="out-list">${v.slice(0, 400).map((x) => `<span>${esc(Array.isArray(x) ? x.join(' : ') : typeof x === 'object' ? JSON.stringify(x) : String(x))}</span>`).join('')}${v.length > 400 ? `<span>…ほか ${v.length - 400} 件</span>` : ''}</div>`); break;
      case 'json': setOnce(out, 'json:' + JSON.stringify(v), `<pre class="out-text">${esc(JSON.stringify(v, null, 2))}</pre>`); break;
      case 'none': setOnce(out, 'none', '<p>（値がありません）</p>'); break;
      default: setOnce(out, 'text:' + v, `<pre class="out-text">${esc(String(v))}</pre>`);
    }
  }
  function mini(el, r) {
    if (!r || r.error) { setOnce(el, 'x', ''); return; }
    const v = r.value;
    if (r.type === 'image') {
      setOnce(el, 'image', '<canvas></canvas>');
      drawImage(el.firstElementChild, v);
      return;
    }
    let s;
    if (r.type === 'list') s = `${v.length}件: ` + v.slice(0, 12).map((x) => (Array.isArray(x) ? x.join(':') : String(x))).join(', ');
    else if (r.type === 'html') s = 'グラフや表などの表示';
    else if (r.type === 'json') s = JSON.stringify(v);
    else s = String(v);
    setOnce(el, 't:' + s.slice(0, 120), esc(s.slice(0, 120)));
  }
  function renderStages(res, stages) {
    const ol = $('#pipeStages');
    if (ol._gen !== gen) {
      ol.innerHTML = stages.map((s, i) => `<li class="stage"><span class="idx">${i + 1}</span><div><div class="cmd">${esc(s.raw)}</div><div class="meta"></div></div><div class="mini"></div></li>`).join('');
      ol._gen = gen;
    }
    stages.forEach((s, i) => {
      const li = ol.children[i];
      const r = res[i];
      li.classList.toggle('err', !!(r && r.error));
      const meta = li.querySelector('.meta');
      const m = !r ? '（ここまで届きませんでした）' : r.error ? '止まりました' : `<span class="ty">${TYPE[r.type] || r.type}</span>${r.ms.toFixed(1)} ms`;
      if (meta.innerHTML !== m) meta.innerHTML = m;
      let em = li.querySelector('.emsg');
      if (r && r.error) {
        if (!em) { em = document.createElement('div'); em.className = 'emsg'; li.append(em); }
        em.textContent = r.error;
      } else if (em) em.remove();
      mini(li.querySelector('.mini'), r);
    });
  }

  /* ---- 実行 ---- */
  const isLive = (stages) => stages.some((s) => U[s.name] && U[s.name].live);
  async function run(src, { push = true, via = 'user' } = {}) {
    cancelAnimationFrame(raf);
    raf = 0;
    const myGen = ++gen;
    const stages = Core.parsePipe(src);
    lastRun = src;
    $('#pipeIn').value = src;
    if (push) { try { history.replaceState(null, '', '#v=pipe&p=' + encodeURIComponent(src)); } catch { /* 履歴を書き換えられない埋め込み先では URL を変えない */ } }
    const live = isLive(stages);
    if (!stages.some((s) => s.name === 'camera' || s.name === 'mic')) P.media.stop();
    ctx.state = new Map();
    ctx.frame = 0;
    ctx.t = (performance.now() - T0) / 1000;
    const t1 = performance.now();
    const res = await Core.execute(stages, U, ctx);
    if (myGen !== gen) return;
    renderStages(res, stages);
    renderOutput(res);
    const err = res.find((r) => r.error);
    api.log('pipe.run', { src, via, live, stages: stages.length }, err ? 'error: ' + err.error : `ok ${(performance.now() - t1).toFixed(1)}ms → ${res.length ? res[res.length - 1].type : 'none'}`);
    if (live && !err && visible) loop(stages, myGen);
  }
  function loop(stages, myGen) {
    let last = 0;
    const step = async (now) => {
      if (myGen !== gen || !visible) return;
      raf = requestAnimationFrame(step);
      if (busy || now - last < 33) return;
      busy = true;
      last = now;
      ctx.t = (now - T0) / 1000;
      ctx.frame++;
      try {
        const res = await Core.execute(stages, U, ctx);
        if (myGen !== gen) return;
        renderOutput(res);
        const err = res.find((r) => r.error);
        if (err || ctx.frame % 4 === 0) renderStages(res, stages);
        if (err) { cancelAnimationFrame(raf); raf = 0; api.log('pipe.live.error', { src: lastRun, frame: ctx.frame }, err.error); }
      } finally { busy = false; }
    };
    raf = requestAnimationFrame(step);
  }
  function stopAll(reason) {
    gen++;
    cancelAnimationFrame(raf);
    raf = 0;
    P.media.stop();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    api.log('pipe.stop', { reason }, 'ok');
  }

  /* ---- 部品辞典とレシピ ---- */
  function renderUnits(filter) {
    let list = Object.values(U);
    if (filter && filter.trim()) {
      const hit = new Set(Search.search(unitIdx, filter).items.filter((x) => x.score > 0).map((x) => x.entry.u.name));
      list = list.filter((u) => hit.has(u.name));
    }
    let html = '';
    for (const [g, label] of Object.entries(P.groups)) {
      const us = list.filter((u) => u.group === g);
      if (!us.length) continue;
      html += `<h3>${esc(label)}（${us.length}）</h3><ul>${us.map((u) => `<li><button type="button" data-unit="${escA(u.name)}" title="${escA(u.desc)}">${esc(u.name)}</button></li>`).join('')}</ul>`;
    }
    $('#unitList').innerHTML = html || '<p>見つかりません</p>';
  }
  function openUnit(name) {
    const u = U[name];
    if (!u) return;
    $('#unitTitle').textContent = u.name + (u.args ? ' ' + u.args : '');
    const io = `入力: ${u.in === 'none' ? 'なし（材料を出す）' : TYPE[u.in.replace('?', '')] || u.in} → 出力: ${TYPE[u.out] || u.out}`;
    $('#unitDesc').innerHTML = `${esc(u.desc)}<br><small>${esc(io)}${u.live ? ' ・ 動き続ける部品' : ''}</small>${u.ex ? `<br>例: <a href="#v=pipe&p=${encodeURIComponent(u.ex)}" data-close><code>${esc(u.ex)}</code></a>` : ''}`;
    $('#unitCode').innerHTML = H.highlight(u.fn.toString(), 'js');
    $('#unitAdd').dataset.unit = u.name;
    $('#unitDlg').showModal();
    api.log('pipe.unit.open', { name }, 'ok');
  }

  /* ---- 初期化 ---- */
  function init(a) {
    api = a;
    $('#recipes').innerHTML = P.recipes.map((r, i) => `<li><button type="button" data-recipe="${i}"><b>${esc(r.title)}</b><code>${esc(r.pipe)}</code></button></li>`).join('');
    renderUnits('');
    $('#pipeForm').addEventListener('submit', (ev) => { ev.preventDefault(); run($('#pipeIn').value, { via: 'enter' }); });
    $('#pipeStop').addEventListener('click', () => { stopAll('button'); api.toast('止めました'); });
    $('#pipeShare').addEventListener('click', async () => {
      const url = location.href.split('#')[0] + '#v=pipe&p=' + encodeURIComponent($('#pipeIn').value);
      try { await navigator.clipboard.writeText(url); api.toast('このパイプへのリンクをコピーしました'); api.log('pipe.share', { src: $('#pipeIn').value }, 'ok'); }
      catch (e) { api.toast('コピーできませんでした'); api.log('pipe.share', {}, 'error: ' + e.message); }
    });
    $('#recipes').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-recipe]');
      if (b) run(P.recipes[+b.dataset.recipe].pipe, { via: 'recipe' });
    });
    $('#unitList').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-unit]');
      if (b) openUnit(b.dataset.unit);
    });
    $('#unitFilter').addEventListener('input', (ev) => renderUnits(ev.target.value));
    $('#unitAdd').addEventListener('click', () => {
      const inp = $('#pipeIn');
      const name = $('#unitAdd').dataset.unit;
      inp.value = inp.value.trim() ? inp.value.trim() + ' | ' + name : name;
      $('#unitDlg').close();
      inp.focus();
      api.log('pipe.unit.add', { name }, 'ok');
    });
    $('#unitDlg').addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) $('#unitDlg').close(); });
    const out = $('#pipeOutput');
    out.addEventListener('pointermove', (e) => {
      const r = out.getBoundingClientRect();
      ctx.mouse.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      ctx.mouse.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    });
  }
  function show() {
    visible = true;
    const hp = new URLSearchParams(location.hash.slice(1)).get('p');
    if (hp) return; // load() が流す
    if (!started) { started = true; run($('#pipeIn').value, { via: 'open' }); }
    else if (lastRun) run(lastRun, { push: false, via: 'reopen' });
  }
  function hide() { visible = false; stopAll('leave'); }
  function load(src, fromHash) {
    started = true;
    if (src === lastRun && raf) return;
    run(src, { push: false, via: fromHash ? 'link' : 'load' });
  }

  window.DekiruPipeUI = { init, show, hide, load, run, searchUnits, unitCount: () => Object.keys(U).length };
})();
