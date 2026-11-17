// 画面の部品: 上の帯の数字、道具箱、色分け、知らせ、調べる窓、予算・政策・グラフ・目標・保存・設定・遊び方のダイアログ
import { TOOL_GROUPS, ROADS, ZONES, SVC, SVC_BY_ID, POLICIES, BUDGETS, DISTRICT_COLORS, toolKey, toolName, MONEY, CLASS_OF } from './core/defs.mjs';
import { MILESTONES, GOALS, isUnlocked, unlockStage } from './core/milestones.mjs';
import { taxIncome, expenses, LOANS, takeLoan, repayLoan, remaining } from './core/budget.mjs';
import { BLD } from './core/city.mjs';
import { PROB } from './core/sim.mjs';
import { OVERLAYS, drawMinimap, lighting } from './render.mjs';
import { svcTiles } from './core/edit.mjs';

const $ = (s) => document.querySelector(s);
const log = (...a) => (window.dlog || (() => {}))(...a);
const yen = (v) => `${Math.round(v).toLocaleString('ja-JP')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 道具箱の絵（自作の簡単な形。色は文字の色に合わせる）
const ICONS = {
  road: '<path d="M8 2 4 22M16 2l4 20" stroke="currentColor" stroke-width="2.4" fill="none"/><path d="M12 3v3m0 4v3m0 4v3" stroke="currentColor" stroke-width="2" fill="none"/>',
  res: '<path d="M3 12 12 4l9 8" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="M6 11v10h12V11" fill="currentColor"/><rect x="10" y="15" width="4" height="6" fill="#1d2040"/>',
  com: '<rect x="4" y="9" width="16" height="12" fill="currentColor"/><path d="M3 5h18l-1 5H4z" fill="currentColor" opacity=".6"/><rect x="7" y="13" width="4" height="4" fill="#1d2040"/><rect x="13" y="13" width="4" height="8" fill="#1d2040"/>',
  ind: '<path d="M3 21V11l5 3v-3l5 3v-3l5 3V4h3v17z" fill="currentColor"/>',
  power: '<path d="M13 2 5 13h6l-2 9 9-12h-6z" fill="currentColor"/>',
  water: '<path d="M12 3c4 5 7 8.5 7 12a7 7 0 0 1-14 0c0-3.5 3-7 7-12z" fill="currentColor"/>',
  safety: '<path d="M12 2 4 5v7c0 5 3.5 8 8 10 4.5-2 8-5 8-10V5z" fill="currentColor"/><path d="M10.5 8h3v3h3v3h-3v3h-3v-3h-3v-3h3z" fill="#1d2040"/>',
  edu: '<path d="M2 9 12 4l10 5-10 5z" fill="currentColor"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5l-6 3z" fill="currentColor" opacity=".7"/>',
  park: '<circle cx="12" cy="9" r="6.5" fill="currentColor"/><rect x="11" y="14" width="2.4" height="8" fill="currentColor"/>',
  district: '<path d="M5 22V3" stroke="currentColor" stroke-width="2.2"/><path d="M6 4h12l-3 4 3 4H6z" fill="currentColor"/>',
  dezone: '<path d="M3 3h18v18H3z" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="3 2"/><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2.4"/>',
  bulldoze: '<path d="M2 18V9h3l2 3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 7h7l3 5v4H8z" fill="currentColor"/><rect x="7" y="16" width="14" height="5" rx="2.5" fill="currentColor" opacity=".7"/>',
  inspect: '<circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="2.4" fill="none"/><path d="m15 15 6 6" stroke="currentColor" stroke-width="3"/>',
};
const GROUP_KEYS = { road: '1', res: '2', com: '3', ind: '4', power: '5', water: '6', safety: '7', edu: '8', park: '9', district: '0', dezone: 'Z', bulldoze: 'X', inspect: 'Q' };

export function makeUi(G) {
  const ui = G.ui;
  ui.groupPick = Object.fromEntries(TOOL_GROUPS.map((g) => [g.key, 0]));
  ui.group = 'road';
  ui.tool = TOOL_GROUPS[0].items[0];
  ui.districtColor = (d) => (G.sim.s.districts[d - 1] ? G.sim.s.districts[d - 1].color : '#fff');

  /* ---- 道具箱 ---- */
  const box = $('#toolbox'), sub = $('#subtools');
  box.innerHTML = TOOL_GROUPS.map((g) => `<button type="button" data-group="${g.key}" aria-pressed="false" aria-label="${g.name}（${GROUP_KEYS[g.key]}）" title="${g.name}（${GROUP_KEYS[g.key]}）"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[g.key]}</svg><span class="key" aria-hidden="true">${GROUP_KEYS[g.key]}</span></button>`).join('');
  rovingFallback(box, true);
  box.addEventListener('click', (e) => { const b = e.target.closest('button[data-group]'); if (b) selectGroup(b.dataset.group, true); });
  sub.addEventListener('click', (e) => { const b = e.target.closest('button[data-item]'); if (b) pickItem(+b.dataset.item); });

  function itemCost(t) { return t.kind === 'road' ? ROADS[t.road].cost : t.kind === 'svc' ? SVC[t.key].cost : t.kind === 'power' ? 2 : null; }
  function renderSub() {
    const g = TOOL_GROUPS.find((x) => x.key === ui.group), s = G.sim.s;
    sub.innerHTML = `<span class="st-name">${g.name}</span>` + g.items.map((t, n) => {
      const ok = isUnlocked(s, toolKey(t)), c = itemCost(t), sel = n === ui.groupPick[g.key];
      const m = MILESTONES[unlockStage(toolKey(t))];
      const sw = t.kind === 'zone' ? `<span class="swatch" style="background:${ZONES[t.zone].color}"></span>` : '';
      const desc = t.kind === 'svc' ? SVC[t.key].desc : '';
      return `<button type="button" data-item="${n}" aria-pressed="${sel}" ${ok ? '' : 'aria-disabled="true"'} title="${esc(toolName(t) + (desc ? '：' + desc : '') + (ok ? '' : `（人口 ${m.pop.toLocaleString('ja-JP')} 人で解放）`))}">${sw}${esc(toolName(t))}${c !== null ? `<span class="cost">${yen(c)}</span>` : ''}${ok ? '' : '<span class="lock">🔒</span>'}</button>`;
    }).join('');
    rovingFallback(sub, false);
  }
  function selectGroup(key, fromClick) {
    const g = TOOL_GROUPS.find((x) => x.key === key);
    if (!g) return;
    if (ui.group === key && !fromClick && g.items.length > 1) {
      // 同じキーをもう一度押したら、次の種類へ（使えないものは飛ばす）
      for (let n = 1; n <= g.items.length; n++) { const x = (ui.groupPick[key] + n) % g.items.length; if (isUnlocked(G.sim.s, toolKey(g.items[x]))) { ui.groupPick[key] = x; break; } }
    }
    ui.group = key;
    for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.group === key));
    renderSub();
    setTool(g.items[ui.groupPick[key]]);
  }
  function pickItem(n) {
    const g = TOOL_GROUPS.find((x) => x.key === ui.group), t = g.items[n];
    if (!isUnlocked(G.sim.s, toolKey(t))) { G.audio.sfx('error'); announce(`${toolName(t)}は人口 ${MILESTONES[unlockStage(toolKey(t))].pop.toLocaleString('ja-JP')} 人で使えるようになります`); return; }
    ui.groupPick[g.key] = n;
    renderSub();
    setTool(t);
  }
  function setTool(t) {
    if (!isUnlocked(G.sim.s, toolKey(t))) { const g = TOOL_GROUPS.find((x) => x.key === ui.group); t = g.items.find((x) => isUnlocked(G.sim.s, toolKey(x))) || TOOL_GROUPS.at(-1).items[0]; }
    if (t.kind === 'district') t = { kind: 'district', d: ui.paintDistrict || 0 };
    ui.tool = t; ui.dragStart = null; ui.preview = null;
    $('#toolName').textContent = toolName(t) + (t.kind === 'district' ? `（${ui.paintDistrict ? G.sim.s.districts[ui.paintDistrict - 1].name : '地区を消す'}）` : '');
    if (t.kind === 'district' && !ui.overlay) { ui.overlay = 'district'; ui.autoOverlay = true; renderViews(); }
    else if (t.kind !== 'district' && ui.autoOverlay) { ui.overlay = null; ui.autoOverlay = false; renderViews(); }
    G.audio.sfx('click');
    announce(`道具: ${toolName(t)}`);
    log('ui.tool', { tool: toolKey(t) }, 'ok');
  }

  /* ---- 色分け ---- */
  const views = $('#views');
  function renderViews() {
    views.innerHTML = Object.entries(OVERLAYS).map(([k, o]) => `<button type="button" data-ov="${k}" aria-pressed="${ui.overlay === k}">${o.name}</button>`).join('');
    rovingFallback(views, false);
  }
  views.addEventListener('click', (e) => { const b = e.target.closest('button[data-ov]'); if (b) setOverlay(ui.overlay === b.dataset.ov ? null : b.dataset.ov); });
  function setOverlay(k) { ui.overlay = k; ui.autoOverlay = false; renderViews(); G.audio.sfx('click'); announce(k ? `色分け: ${OVERLAYS[k].name}` : '色分けを消しました'); log('ui.overlay', { k }, 'ok'); }
  function cycleOverlay(back) {
    const keys = [null, ...Object.keys(OVERLAYS)], i = keys.indexOf(ui.overlay);
    setOverlay(keys[(i + (back ? keys.length - 1 : 1)) % keys.length]);
  }

  /* ---- 上の帯と横の数字 ---- */
  let lastFunds = null;
  function refresh() {
    const sim = G.sim, s = sim.s, st = sim.stats;
    $('#cityName').textContent = s.name;
    $('#cityStage').textContent = MILESTONES[s.milestone].title;
    $('#date').textContent = `${s.time.year}年${s.time.month}月`;
    const m = Math.floor(s.time.tod);
    $('#clock').textContent = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const f = $('#funds');
    f.textContent = `${yen(s.funds)} ${MONEY}`;
    f.classList.toggle('minus', s.funds < 0);
    const lb = sim.lastBudget, dEl = $('#fundsDelta');
    if (lb) { dEl.textContent = `${lb.net >= 0 ? '+' : ''}${yen(lb.net)}/月`; dEl.className = 'tb-delta ' + (lb.net >= 0 ? 'plus' : 'minus'); }
    $('#pop').textContent = `${yen(st.residents)} 人`;
    for (const el of document.querySelectorAll('.dm')) {
      const v = Math.max(-100, Math.min(100, sim.demand[el.dataset.k])), i = el.querySelector('i');
      if (v >= 0) { i.style.bottom = '50%'; i.style.top = ''; i.style.height = `${(v / 100) * 50}%`; }
      else { i.style.top = '50%'; i.style.bottom = ''; i.style.height = `${(-v / 100) * 50}%`; }
    }
    $('#demandBox').setAttribute('aria-label', `需要: 住宅 ${Math.round(sim.demand.R)}、商業 ${Math.round(sim.demand.C)}、工業 ${Math.round(sim.demand.I)}、オフィス ${Math.round(sim.demand.O)}`);
    const pw = st.power, wa = st.water, sw = st.sewer;
    const cls = (u, c) => (u > c + 0.5 ? 'bad' : u > c * 0.85 ? 'warn' : '');
    const L = lighting(s.time.tod);
    $('#sideStats').innerHTML = [
      ['電気', `${Math.round(pw.demand)} / ${Math.round(pw.supply)}`, cls(pw.demand, pw.supply)],
      ['水道', `${Math.round(wa.demand)} / ${Math.round(wa.supply)}`, cls(wa.demand, wa.supply)],
      ['下水', `${Math.round(sw.demand)} / ${Math.round(sw.supply)}`, cls(sw.demand, sw.supply)],
      ['働き口', `${yen(st.jobs.C + st.jobs.I + st.jobs.O)}`, ''],
      ['仕事のない人', `${yen(st.unemployed)}`, st.unemployed > st.workforce * 0.1 ? 'warn' : ''],
      ['満足', `${Math.round(st.happiness)}`, st.happiness < 40 ? 'bad' : st.happiness < 55 ? 'warn' : ''],
      ['交通の流れ', `${Math.round(sim.tr.flow * 100)}%`, sim.tr.flow < 0.5 ? 'bad' : sim.tr.flow < 0.7 ? 'warn' : ''],
      ['走る車', `${sim.tr.vehicles.length} 台（1台≈${sim.model ? sim.model.k : 1}人）`, ''],
      ['歩く人', `${G.crowd.peds.length} 人`, ''],
      ['空', L.night > 0.6 ? '夜' : L.dusk > 0.4 ? (L.h < 12 ? '朝焼け' : '夕焼け') : '昼', ''],
    ].map(([a, b, c]) => `<div class="r ${c}"><span>${a}</span><span>${b}</span></div>`).join('');
    if (lastFunds !== null && s.funds !== lastFunds && Math.abs(s.funds - lastFunds) > 0) { /* お金の変化は音で知らせない（うるさいため） */ }
    lastFunds = s.funds;
    for (const b of document.querySelectorAll('[data-speed]')) b.setAttribute('aria-pressed', String(+b.dataset.speed === ui.speedIdx));
  }
  let mm = null;
  function refreshMinimap() { mm = drawMinimap($('#minimap'), G.sim, G.R, ui); }
  $('#minimap').addEventListener('pointerdown', (e) => {
    if (!mm) return;
    const c = e.currentTarget, r = c.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * c.width, y = ((e.clientY - r.top) / r.height) * c.height;
    const a = (x - mm.ox) / mm.cell, b = ((y - mm.oy) / mm.cell) * 2; // a = i − j、b = i + j
    G.R.centerOn((a + b) / 2, (b - a) / 2); G.R.clampCam(G.sim.s.N);
    log('ui.minimap', { i: Math.round((a + b) / 2), j: Math.round((b - a) / 2) }, 'ok');
  });

  /* ---- 知らせ ---- */
  const news = $('#newsText');
  function onMessage(m) {
    news.innerHTML = `<span class="when">${esc(m.when)}</span>${esc(m.text)}`;
    news.className = 'news-text k-' + m.kind;
    if (m.kind === 'bad') G.audio.sfx('alert'); else if (m.kind === 'good') G.audio.sfx('good'); else G.audio.sfx('notice');
    log('sim.message', { kind: m.kind, text: m.text }, 'ok');
  }
  $('#newsBtn').addEventListener('click', () => openDialog('news'));

  /* ---- 調べる ---- */
  const insp = $('#inspect');
  $('#inspectClose').addEventListener('click', () => { insp.close(); log('ui.inspect.close', {}, 'ok'); });
  function inspect(i, j) {
    const sim = G.sim, s = sim.s, N = s.N;
    if (i < 0 || j < 0 || i >= N || j >= N) return;
    const k = j * N + i, d = sim.d;
    const rows = [];
    let title = '草地';
    const yes = (v, a = 'あり', b = 'なし') => (v ? `<span class="ok">${a}</span>` : `<span class="bad">${b}</span>`);
    if (s.terrain[k] === 1 && !s.road[k]) title = '水';
    if (s.road[k]) { title = (s.terrain[k] === 1 ? '橋（' : '') + ROADS[s.road[k]].name + (s.terrain[k] === 1 ? '）' : ''); rows.push(['混み具合', `${Math.round(sim.tr.density[k] * 100)}%`], ['今いる車', `${sim.tr.occ[k]} 台`]); if (sim.tr.signal[k]) rows.push(['信号', 'あり']); }
    if (s.svc[k]) {
      const def = SVC_BY_ID[s.svc[k]];
      title = def.name;
      rows.push(['維持費', `${yen(def.upkeep * (s.budgets[def.budget] ?? 100) / 100)} ${MONEY}/月`]);
      if (def.power) rows.push(['発電量', `${def.power}${def.key === 'wind' ? '（風しだい）' : def.key === 'solar' ? '（夜は3割）' : ''}`]);
      if (def.water) rows.push(['送れる水', def.water]);
      if (def.sewer) rows.push(['処理できる下水', def.sewer]);
      if (def.radius) rows.push(['届く範囲', `道のりで ${def.radius} マス`]);
      rows.push(['電気', yes(svcTiles(s, k).some((t) => d.power.on[t]) || def.power)]);
      rows.push(['道', yes(svcTiles(s, k).some((t) => d.access[t] >= 0))]);
      rows.push(['説明', def.desc]);
    } else if (s.zone[k]) {
      const Z = ZONES[s.zone[k]], b = s.bld[k];
      title = Z.name + (b === BLD.BUILT ? `・水準 ${s.lvl[k]}` : b === BLD.BUILDING ? '・建設中' : b === BLD.ABANDONED ? '・空き家' : b === BLD.RUBBLE ? '・焼け跡' : '・空き地');
      if (b === BLD.BUILT) rows.push([Z.cls === 'R' ? '住む人' : '働き口', `${s.occ[k]} / ${ZONES[s.zone[k]].cap[(s.lvl[k] || 1) - 1]}`]);
      if (Z.cls === 'R' && b === BLD.BUILT) rows.push(['満足', Math.round(sim.happy[k])]);
      rows.push(['道に面している', yes(d.access[k] >= 0)], ['電気', yes(d.power.on[k])], ['水道', yes(d.water.on[k])], ['下水', yes(d.sewer.on[k])]);
      if (sim.unreach[k]) rows.push(['行き来', '<span class="bad">たどり着けない人がいる</span>']);
      rows.push(['需要', Math.round(sim.demand[Z.cls])]);
    }
    if (!s.road[k] && s.terrain[k] !== 1) {
      rows.push(['地価', Math.round(d.lv[k])], ['公害', Math.round(d.pol[k])], ['騒音', Math.round(d.noise[k])], ['犯罪', Math.round(d.crime[k])]);
      rows.push(['消防・警察・医療・教育', [d.cov.fire[k], d.cov.police[k], d.cov.health[k], d.cov.edu[k]].map((v) => (v > 0 ? Math.round(Math.min(1, v) * 100) : '—')).join(' ・ ')]);
      if (d.cov.transit[k] > 0) rows.push(['地下鉄', '駅が近い']);
    }
    if (s.dist[k] && s.districts[s.dist[k] - 1]) rows.push(['地区', esc(s.districts[s.dist[k] - 1].name)]);
    if (sim.prob[k]) rows.push(['困りごと', probText(sim.prob[k])]);
    $('#inspectTitle').textContent = `${title}（${i}, ${j}）`;
    $('#inspectBody').innerHTML = `<dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;
    if (!insp.open) insp.show();
    log('ui.inspect', { i, j, title }, 'ok');
  }
  function probText(p) {
    const t = [];
    if (p & PROB.FIRE) t.push('火事'); if (p & PROB.POWER) t.push('電気が来ない'); if (p & PROB.WATER) t.push('水が来ない'); if (p & PROB.SEWER) t.push('下水が流れない');
    if (p & PROB.ROAD) t.push('道がない'); if (p & PROB.REACH) t.push('行き来できない'); if (p & PROB.POLLUTION) t.push('空気が汚い'); if (p & PROB.CRIME) t.push('犯罪が多い');
    return `<span class="bad">${t.join('、')}</span>`;
  }

  /* ---- 道具の説明（地図の上の吹き出し） ---- */
  const tip = $('#tip');
  function showTip(x, y, html) { if (!html) { tip.hidden = true; return; } tip.innerHTML = html; tip.hidden = false; const st = $('#stage').getBoundingClientRect(); tip.style.left = `${Math.min(st.width - 220, x + 16)}px`; tip.style.top = `${Math.min(st.height - 60, y + 18)}px`; }
  function tipFor(i, j) {
    const p = ui.preview, s = G.sim.s, N = s.N;
    if (i < 0 || j < 0 || i >= N || j >= N) return '';
    if (p && ui.tool.kind !== 'inspect') {
      if (!p.ok) return `<span class="bad">${esc(p.reason || '使えません')}</span>`;
      return `${esc(toolName(ui.tool))}：${p.tiles.length} マス${p.cost ? `　<span class="cost">${yen(p.cost)} ${MONEY}</span>` : ''}`;
    }
    const k = j * N + i;
    if (s.svc[k]) return esc(SVC_BY_ID[s.svc[k]].name);
    if (s.zone[k]) return esc(ZONES[s.zone[k]].name) + (s.bld[k] === BLD.BUILT ? `　${CLASS_OF(s.zone[k]) === 'R' ? '住む人' : '働き口'} ${s.occ[k]}` : '');
    if (s.road[k]) return esc(ROADS[s.road[k]].name);
    return '';
  }

  /* ---- ダイアログ ---- */
  const dialogs = { budget: '#dlgBudget', policy: '#dlgPolicy', graph: '#dlgGraph', goals: '#dlgGoals', save: '#dlgSave', settings: '#dlgSettings', help: '#dlgHelp', news: '#dlgNews', new: '#dlgNew' };
  for (const [k, sel] of Object.entries(dialogs)) {
    const dlg = $(sel);
    dlg.addEventListener('close', () => { log('ui.dialog.close', { k, value: dlg.returnValue }, 'ok'); if (k !== 'new') { dlg.returnValue = ''; } G.onDialogClose && G.onDialogClose(k); });
  }
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDialog(b.dataset.open)));
  function openDialog(k) {
    const dlg = $(dialogs[k]);
    if (!dlg || dlg.open) return;
    ({ budget: fillBudget, policy: fillPolicy, graph: fillGraph, goals: fillGoals, save: fillSave, settings: fillSettings, help: fillHelp, news: fillNews, new: () => {} })[k]();
    G.audio.sfx('open');
    dlg.showModal();
    log('ui.dialog.open', { k }, 'ok');
  }
  const anyOpen = () => Object.values(dialogs).some((s) => $(s).open);

  // 予算
  function fillBudget() {
    const s = G.sim.s;
    const taxRow = (c, name) => `<div class="slider-row"><label for="tax${c}">${name}</label><input type="range" id="tax${c}" min="0" max="20" step="1" value="${s.taxes[c]}" data-tax="${c}"><output for="tax${c}">${s.taxes[c]}%</output><span class="sub" data-taxinc="${c}"></span></div>`;
    $('#taxRows').innerHTML = taxRow('R', '住宅') + taxRow('C', '商業') + taxRow('I', '工業') + taxRow('O', 'オフィス');
    const ex = expenses(s, G.sim.stats.residents);
    $('#svcRows').innerHTML = Object.entries(BUDGETS).map(([k, name]) => `<div class="slider-row"><label for="bud${k}">${name}</label><input type="range" id="bud${k}" min="50" max="150" step="10" value="${s.budgets[k]}" data-bud="${k}"><output for="bud${k}">${s.budgets[k]}%</output><span class="sub" data-budv="${k}">${k === 'road' ? yen(ex.roads) : yen(ex.byBudget[k] || 0)}</span></div>`).join('');
    updateBudgetNumbers();
    const lb = G.sim.lastBudget;
    if (lb) {
      const r = (a, b, cls = '') => `<tr class="${cls}"><td>${a}</td><td>${b}</td></tr>`;
      $('#lastMonth').innerHTML = `<table class="ledger"><tbody>${r('税（住宅）', yen(lb.income.R))}${r('税（商業）', yen(lb.income.C))}${r('税（工業）', yen(lb.income.I))}${r('税（オフィス）', yen(lb.income.O))}${r('収入の合計', yen(lb.income.total), 'total')}${r('道路と電線', '−' + yen(lb.exp.roads))}${r('施設', '−' + yen(lb.exp.services))}${r('政策', '−' + yen(lb.exp.policies))}${r('融資の返済', '−' + yen(lb.exp.loans))}${r('差し引き', (lb.net >= 0 ? '+' : '') + yen(lb.net) + ' ' + MONEY, 'total')}</tbody></table>`;
    } else $('#lastMonth').innerHTML = '<p class="note">月末に、ここへ先月の収支が出ます。</p>';
    fillLoans();
  }
  function updateBudgetNumbers() {
    const s = G.sim.s, inc = taxIncome(s), fill = G.sim.stats.fill ?? 1;
    for (const c of ['R', 'C', 'I', 'O']) { const el = document.querySelector(`[data-taxinc="${c}"]`); if (el) el.textContent = `+${yen(inc[c] * (c === 'R' ? 1 : fill))}`; }
    const ex = expenses(s, G.sim.stats.residents);
    $('#taxEstimate').textContent = `今の税率の見込み: 収入 月 ${yen(inc.R + (inc.C + inc.I + inc.O) * fill)} ${MONEY}、支出 月 ${yen(ex.total)} ${MONEY}。税を 9% より上げると、その種類の需要が下がります。`;
    for (const k of Object.keys(BUDGETS)) { const el = document.querySelector(`[data-budv="${k}"]`); if (el) el.textContent = k === 'road' ? yen(ex.roads) : yen(ex.byBudget[k] || 0); }
  }
  $('#dlgBudget').addEventListener('input', (e) => {
    const t = e.target, s = G.sim.s;
    if (t.dataset.tax) { s.taxes[t.dataset.tax] = +t.value; t.nextElementSibling.textContent = `${t.value}%`; log('budget.tax', { cls: t.dataset.tax, v: +t.value }, 'ok'); }
    if (t.dataset.bud) { s.budgets[t.dataset.bud] = +t.value; t.nextElementSibling.textContent = `${t.value}%`; log('budget.service', { k: t.dataset.bud, v: +t.value }, 'ok'); }
    updateBudgetNumbers();
  });
  function fillLoans() {
    const s = G.sim.s;
    $('#loanRows').innerHTML = LOANS.map((L) => {
      const have = s.loans.find((l) => l.key === L.key), ok = isUnlocked(s, L.key);
      const label = `${yen(L.amount)} ${MONEY}・年 ${(L.rate * 100).toFixed(1)}%・${L.months / 12} 年`;
      if (have) return `<div class="loan"><span>${label}<br><small>残り ${have.left} か月・毎月 ${yen(have.pay)}・一括で ${yen(remaining(have))}</small></span><button type="button" data-repay="${L.key}">一括で返す</button></div>`;
      return `<div class="loan"><span>${label}<br><small>毎月の返済 ${yen(L.amount * (L.rate / 12) / (1 - Math.pow(1 + L.rate / 12, -L.months)))}</small></span><button type="button" data-loan="${L.key}" ${ok ? '' : 'aria-disabled="true"'}>${ok ? '借りる' : '🔒'}</button></div>`;
    }).join('');
  }
  $('#loanRows').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    const s = G.sim.s;
    if (b.dataset.loan) { const ok = takeLoan(s, b.dataset.loan); log('budget.loan', { key: b.dataset.loan }, ok ? 'ok' : 'refused'); G.audio.sfx(ok ? 'coin' : 'error'); }
    if (b.dataset.repay) { const ok = repayLoan(s, b.dataset.repay); log('budget.repay', { key: b.dataset.repay }, ok ? 'ok' : 'not enough'); G.audio.sfx(ok ? 'coin' : 'error'); if (!ok) announce('一括で返すお金が足りません'); }
    fillLoans(); refresh();
  });

  // 地区と政策
  function fillPolicy() {
    const s = G.sim.s, sel = $('#policyScope');
    if (!isUnlocked(s, 'policies')) { $('#policyNote').textContent = `政策と地区は、人口 ${MILESTONES[unlockStage('policies')].pop.toLocaleString('ja-JP')} 人（${MILESTONES[unlockStage('policies')].title}）で使えるようになります。`; $('#policyList').innerHTML = ''; sel.innerHTML = '<option value="0">市全体</option>'; return; }
    const cur = ui.policyScope ?? 0;
    sel.innerHTML = `<option value="0">市全体</option>` + s.districts.map((d, n) => `<option value="${n + 1}">${esc(d.name)}</option>`).join('');
    sel.value = String(cur);
    const list = s.policies[cur] || [];
    $('#policyNote').textContent = cur ? `「${s.districts[cur - 1].name}」の中だけに効きます。市全体の政策も重なって効きます。` : '市全体に効きます。地区を作ると、地区ごとに決められます。';
    $('#policyList').innerHTML = POLICIES.map((p) => `<li><label><input type="checkbox" data-pol="${p.key}" ${list.includes(p.key) ? 'checked' : ''}> ${p.name}</label><p>${p.desc}</p></li>`).join('');
    $('#distRename').disabled = !cur; $('#distPaint').disabled = false;
    $('#distPaint').textContent = cur ? 'この地区を塗る' : '地区を消す道具';
  }
  $('#policyScope').addEventListener('change', (e) => { ui.policyScope = +e.target.value; fillPolicy(); });
  $('#policyList').addEventListener('change', (e) => {
    const t = e.target, s = G.sim.s, d = ui.policyScope ?? 0;
    if (!t.dataset.pol) return;
    const list = new Set(s.policies[d] || []);
    if (t.checked) list.add(t.dataset.pol); else list.delete(t.dataset.pol);
    s.policies[d] = [...list];
    G.audio.sfx('click');
    log('policy.set', { d, key: t.dataset.pol, on: t.checked }, 'ok');
  });
  $('#distNew').addEventListener('click', () => {
    const s = G.sim.s;
    if (!isUnlocked(s, 'district')) return;
    if (s.districts.length >= 8) { announce('地区は8つまでです'); return; }
    const n = s.districts.length + 1, names = ['一', '二', '三', '四', '五', '六', '七', '八'];
    s.districts.push({ name: `第${names[n - 1]}地区`, color: DISTRICT_COLORS[n - 1] });
    s.policies[n] = [];
    ui.policyScope = n;
    log('district.new', { n }, 'ok');
    fillPolicy();
  });
  $('#distRename').addEventListener('click', () => {
    const s = G.sim.s, d = ui.policyScope ?? 0;
    if (!d) return;
    const name = prompt('地区の名前', s.districts[d - 1].name);
    if (name && name.trim()) { s.districts[d - 1].name = name.trim().slice(0, 12); log('district.rename', { d, name }, 'ok'); fillPolicy(); }
  });
  $('#distPaint').addEventListener('click', () => {
    ui.paintDistrict = ui.policyScope ?? 0;
    $('#dlgPolicy').close();
    selectGroup('district', true);
    setTool({ kind: 'district' });
    announce(ui.paintDistrict ? '地区を塗ります。地図の上を四角く引いてください' : '地区を消します。地図の上を四角く引いてください');
  });

  // グラフ（1本のときは凡例なし、2本以上は凡例と線の端の名前）
  const GRAPHS = [
    { key: 'pop', name: '人口', series: [{ k: 'pop', name: '人口', c: '#4a86d0' }], unit: '人' },
    { key: 'funds', name: 'お金', series: [{ k: 'funds', name: 'お金', c: '#4a86d0' }], unit: MONEY },
    { key: 'cash', name: '収入と支出', series: [{ k: 'income', name: '収入', c: '#2aa894' }, { k: 'expense', name: '支出', c: '#e0584a' }], unit: MONEY + '/月' },
    { key: 'demand', name: '需要', series: [{ k: 'R', name: '住宅', c: '#3e9c4c' }, { k: 'C', name: '商業', c: '#4a86d0' }, { k: 'I', name: '工業', c: '#b8891c' }], unit: '', zero: true },
    { key: 'flow', name: '交通の流れ', series: [{ k: 'flow', name: '交通の流れ', c: '#4a86d0' }], unit: '%' },
    { key: 'happy', name: '満足', series: [{ k: 'happy', name: '満足', c: '#4a86d0' }], unit: '' },
  ];
  ui.graph = 'pop';
  function fillGraph() {
    $('#graphTabs').innerHTML = GRAPHS.map((g) => `<button type="button" role="tab" data-graph="${g.key}" aria-selected="${ui.graph === g.key}">${g.name}</button>`).join('');
    drawGraph();
  }
  $('#graphTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-graph]'); if (b) { ui.graph = b.dataset.graph; fillGraph(); log('ui.graph', { k: ui.graph }, 'ok'); } });
  const gc = $('#graphCanvas');
  let graphGeom = null;
  function drawGraph(hoverX = null) {
    const g = gc.getContext('2d'), W = gc.width, H = gc.height, hist = G.sim.s.history, def = GRAPHS.find((x) => x.key === ui.graph);
    g.clearRect(0, 0, W, H);
    const pad = { l: 64, r: 70, t: 14, b: 26 };
    if (hist.length < 2) { g.fillStyle = '#b9b6d0'; g.font = '14px sans-serif'; g.fillText('1か月たつと、ここに移り変わりが出ます。', pad.l, H / 2); $('#graphNote').textContent = ''; graphGeom = null; return; }
    let lo = Infinity, hi = -Infinity;
    for (const h of hist) for (const sr of def.series) { lo = Math.min(lo, h[sr.k]); hi = Math.max(hi, h[sr.k]); }
    if (def.zero || lo > 0) lo = Math.min(lo, 0);
    if (hi === lo) hi = lo + 1;
    const X = (n) => pad.l + (n / (hist.length - 1)) * (W - pad.l - pad.r), Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    // 目盛り（控えめ）
    g.strokeStyle = 'rgba(185,182,208,0.18)'; g.lineWidth = 1; g.fillStyle = '#b9b6d0'; g.font = '11px sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let q = 0; q <= 4; q++) { const v = lo + ((hi - lo) * q) / 4, y = Y(v); g.beginPath(); g.moveTo(pad.l, y); g.lineTo(W - pad.r, y); g.stroke(); g.fillText(yen(v), pad.l - 6, y); }
    if (lo < 0 && hi > 0) { g.strokeStyle = 'rgba(244,239,226,0.5)'; g.beginPath(); g.moveTo(pad.l, Y(0)); g.lineTo(W - pad.r, Y(0)); g.stroke(); }
    g.textAlign = 'center'; g.textBaseline = 'top';
    const step = Math.max(1, Math.ceil(hist.length / 6));
    for (let n = 0; n < hist.length; n += step) g.fillText(`${hist[n].y}/${hist[n].m}`, X(n), H - pad.b + 6);
    for (const sr of def.series) {
      g.strokeStyle = sr.c; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
      hist.forEach((h, n) => (n ? g.lineTo(X(n), Y(h[sr.k])) : g.moveTo(X(n), Y(h[sr.k])))); g.stroke();
      if (def.series.length > 1) { g.fillStyle = '#f4efe2'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(sr.name, W - pad.r + 6, Y(hist.at(-1)[sr.k])); }
    }
    graphGeom = { X, n: hist.length, pad, W };
    if (hoverX !== null) {
      const n = Math.max(0, Math.min(hist.length - 1, Math.round(((hoverX - pad.l) / (W - pad.l - pad.r)) * (hist.length - 1))));
      g.strokeStyle = 'rgba(244,239,226,0.5)'; g.beginPath(); g.moveTo(X(n), pad.t); g.lineTo(X(n), H - pad.b); g.stroke();
      for (const sr of def.series) { g.fillStyle = sr.c; g.strokeStyle = '#0b0c1a'; g.lineWidth = 2; g.beginPath(); g.arc(X(n), Y(hist[n][sr.k]), 4.5, 0, 7); g.fill(); g.stroke(); }
      $('#graphNote').textContent = `${hist[n].y}年${hist[n].m}月: ` + def.series.map((sr) => `${sr.name} ${yen(hist[n][sr.k])}${def.unit}`).join('、');
    } else $('#graphNote').textContent = (def.series.length > 1 ? '線の色: ' + def.series.map((sr) => `${sr.name}`).join('・') + '。' : '') + 'グラフの上に指を置くと、その月の値が出ます。';
  }
  gc.addEventListener('pointermove', (e) => { const r = gc.getBoundingClientRect(); drawGraph(((e.clientX - r.left) / r.width) * gc.width); });
  gc.addEventListener('pointerleave', () => drawGraph());

  // 目標
  function fillGoals() {
    const s = G.sim.s, pop = G.sim.stats.residents;
    $('#msList').innerHTML = MILESTONES.map((m, n) => {
      const done = n <= s.milestone, next = n === s.milestone + 1;
      const unl = m.unlock.map((k) => k.startsWith('road:') ? ROADS[k.slice(5)].name : k.startsWith('zone:') ? ZONES[k.slice(5)].name : k.startsWith('svc:') ? SVC[k.slice(4)].name : k.startsWith('loan:') ? '融資' : { power: '送電線', district: '地区', policies: '政策', bulldoze: '', dezone: '', inspect: '' }[k] ?? k).filter(Boolean);
      const prog = next ? `<span class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${m.pop}" aria-valuenow="${pop}" aria-label="${m.title}まで"><i style="width:${Math.min(100, (pop / m.pop) * 100)}%"></i></span>` : '';
      return `<li class="${done ? 'done' : next ? 'next' : ''}">${done ? '✓ ' : ''}${m.title}（人口 ${m.pop.toLocaleString('ja-JP')} 人）${m.reward ? `・お祝い ${yen(m.reward)} ${MONEY}` : ''}<span class="unl">${unl.length ? '使えるもの: ' + unl.join('、') : ''}</span>${prog}</li>`;
    }).join('');
    $('#goalList').innerHTML = GOALS.map((g) => `<li class="${s.goals[g.key] ? 'done' : ''}">${s.goals[g.key] ? '✓ ' : ''}${g.name}${g.reward ? `（${yen(g.reward)} ${MONEY}）` : ''}<span class="desc">${g.desc}${s.goals[g.key] ? `・${s.goals[g.key]}に達成` : ''}</span></li>`).join('');
  }

  // 保存と読み込み
  function fillSave() {
    const slots = G.storage.list();
    $('#slotList').innerHTML = slots.map((sl) => `<li><div class="slot-info"><b>${sl.label}</b><br>${sl.meta ? `${esc(sl.meta.name)}・人口 ${yen(sl.meta.pop)}・${sl.meta.when}<br><small>${new Date(sl.meta.saved).toLocaleString('ja-JP')}</small>` : '空き'}</div><div class="slot-buttons">${sl.key !== 'auto' && G.playing ? `<button type="button" data-save="${sl.key}">保存</button>` : ''}${sl.meta ? `<button type="button" data-load="${sl.key}">読み込む</button>` : ''}${sl.meta && sl.key !== 'auto' ? `<button type="button" data-del="${sl.key}" aria-label="${sl.label}を消す">消す</button>` : ''}</div></li>`).join('');
    $('#exportBtn').hidden = !G.playing;
    $('#saveNote').textContent = '保存はこのブラウザの中にだけ残ります。ほかの端末へ持っていくときは、ファイルに書き出してください。';
  }
  $('#slotList').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.save) { const ok = G.saveTo(b.dataset.save); $('#saveNote').textContent = ok ? '保存しました。' : '保存できませんでした（ブラウザの保存の場所がいっぱいかもしれません）。'; fillSave(); }
    if (b.dataset.load) { if (G.loadFrom(b.dataset.load)) $('#dlgSave').close(); else $('#saveNote').textContent = '読み込めませんでした。'; }
    if (b.dataset.del) { if (confirm(`${b.closest('li').querySelector('b').textContent} の街を消します。元に戻せません。よろしいですか?`)) { G.storage.remove(b.dataset.del); log('save.delete', { slot: b.dataset.del }, 'ok'); fillSave(); } }
  });
  $('#exportBtn').addEventListener('click', () => G.exportFile());
  $('#importFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; const ok = await G.importFile(f); e.target.value = ''; if (ok) $('#dlgSave').close(); else $('#saveNote').textContent = 'このファイルは読み込めませんでした。'; });

  // 設定
  function fillSettings() {
    const st = G.settings;
    $('#setSfx').checked = st.sfx; $('#setMusic').checked = st.music; $('#setVol').value = Math.round(st.volume * 100);
    for (const r of document.querySelectorAll('[name="traffic"]')) r.checked = +r.value === st.maxVehicles;
    $('#setFire').checked = G.sim ? G.sim.s.flags.disasters !== false : true; $('#setIcons').checked = st.icons; $('#setAuto').checked = st.autosave;
    $('#toTitle').hidden = !G.playing;
  }
  $('#dlgSettings').addEventListener('change', (e) => {
    const st = G.settings, t = e.target;
    if (t.id === 'setSfx') st.sfx = t.checked;
    if (t.id === 'setMusic') st.music = t.checked;
    if (t.id === 'setVol') st.volume = +t.value / 100;
    if (t.name === 'traffic') { st.maxVehicles = +t.value; if (G.sim) G.sim.opts.maxVehicles = st.maxVehicles; }
    if (t.id === 'setFire' && G.sim) G.sim.s.flags.disasters = t.checked;
    if (t.id === 'setIcons') { st.icons = t.checked; ui.icons = t.checked; }
    if (t.id === 'setAuto') st.autosave = t.checked;
    G.saveSettings();
    log('settings.change', { id: t.id || t.name, v: t.type === 'checkbox' ? t.checked : t.value }, 'ok');
  });
  $('#setVol').addEventListener('input', (e) => { G.settings.volume = +e.target.value / 100; G.audio.configure(G.settings); });
  $('#toTitle').addEventListener('click', () => { $('#dlgSettings').close(); G.toTitle(); });

  // 遊び方
  function fillHelp() {
    $('#helpBody').innerHTML = `
      <section><h3>はじめの一歩</h3><ol>
        <li>西の端から伸びる<b>大通り</b>につなげて、<b>道路</b>（<kbd>1</kbd>）を引きます。</li>
        <li>道の両側に<b>住宅</b>（<kbd>2</kbd>）・<b>商業</b>（<kbd>3</kbd>）・<b>工業</b>（<kbd>4</kbd>）の区画を塗ります。道から3マスまでが道に面した土地です。</li>
        <li><b>石炭火力発電所</b>（<kbd>5</kbd>）を区画のそばに置きます。電気は建物と区画を伝わり、離れた所へは送電線で送ります。</li>
        <li><b>給水塔</b>と<b>下水処理場</b>（<kbd>6</kbd>）を道に面して置きます。水と下水は道の下を通ります。</li>
        <li>上の帯の<b>需要</b>（住・商・工・事）の棒が伸びている区画を増やしましょう。</li>
      </ol></section>
      <section><h3>街を育てる</h3><ul>
        <li>人口が増えると段階が上がり、新しい道具が使えます（<b>目標</b>）。</li>
        <li>消防・警察・医療・教育・公園は、道の道のりで届く範囲が決まります。<b>色分け</b>で確かめましょう。</li>
        <li>地価が上がり、水道と下水と教育がそろうと、建物の水準が上がって大きくなります。</li>
        <li>工場や発電所の煙は住宅地の地価と満足を下げます。森や公園で和らげます。</li>
        <li>車は家から職場や店へ、経路を探して走ります。混んだ道は避けますが、道が足りないと渋滞します。大通り・別の道・地下鉄で流れを分けましょう。</li>
        <li>赤字が続くときは<b>予算</b>で税と施設の予算を見直し、必要なら融資を受けます。</li>
        <li><b>地区</b>を塗ると、地区ごとに<b>政策</b>を決められます。</li>
      </ul></section>
      <section><h3>マウス</h3><ul>
        <li>左のボタン: 道具を使う（道と送電線は引く、区画は四角く塗る）</li>
        <li>右か真ん中のボタンで引く: 見る場所を動かす</li>
        <li>ホイール: 拡大と縮小</li>
        <li>小さな地図を押す: その場所へ移る</li>
      </ul></section>
      <section><h3>キーボード</h3><ul>
        <li><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> カーソル（<kbd>Shift</kbd> で4マスずつ）</li>
        <li><kbd>Space</kbd> か <kbd>Enter</kbd>: 使う。引く道具は、1回目で始め、2回目で決める。<kbd>Esc</kbd> でやめる</li>
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 見る場所を動かす、<kbd>+</kbd><kbd>-</kbd> 拡大と縮小</li>
        <li><kbd>1</kbd>〜<kbd>0</kbd> 道具（同じキーをもう一度で種類を変える）、<kbd>X</kbd> ブルドーザー、<kbd>Z</kbd> 区画を消す、<kbd>Q</kbd> 調べる</li>
        <li><kbd>P</kbd> 止める、<kbd>,</kbd> <kbd>.</kbd> 遅く・速く、<kbd>V</kbd> 色分け</li>
        <li><kbd>B</kbd> 予算、<kbd>L</kbd> 政策、<kbd>G</kbd> グラフ、<kbd>M</kbd> 目標、<kbd>H</kbd> 遊び方、<kbd>Ctrl</kbd>+<kbd>S</kbd> 保存</li>
      </ul></section>`;
  }

  // 知らせの一覧
  function fillNews() {
    const msgs = G.sim ? G.sim.msgs.slice().reverse() : [];
    $('#newsList').innerHTML = msgs.length ? msgs.map((m, n) => `<li class="k-${m.kind}"><span class="when">${esc(m.when)}</span> ${esc(m.text)}${m.at >= 0 ? `<button type="button" data-goto="${n}">見に行く</button>` : ''}</li>`).join('') : '<li>まだ知らせはありません。</li>';
    $('#newsList').onclick = (e) => { const b = e.target.closest('[data-goto]'); if (!b) return; const m = msgs[+b.dataset.goto], N = G.sim.s.N; G.R.centerOn((m.at % N) + 0.5, Math.floor(m.at / N) + 0.5); ui.cursor = [m.at % N, Math.floor(m.at / N)]; $('#dlgNews').close(); };
  }

  /* ---- 速さ ---- */
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => G.setSpeed(+b.dataset.speed)));
  rovingFallback(document.querySelector('.tb-speed'), false);
  rovingFallback(document.querySelector('.tb-menu'), false);

  /* ---- 読み上げ ---- */
  const ann = $('#announce');
  function announce(t) { ann.textContent = t; }

  return { refresh, refreshMinimap, renderSub, renderViews, selectGroup, setTool, setOverlay, cycleOverlay, inspect, showTip, tipFor, openDialog, anyOpen, onMessage, announce, updateBudgetNumbers };
}

// focusgroup が使えないブラウザでは、矢印キーで道具を移る仕組みを自分で入れる
function rovingFallback(bar, vertical) {
  if ('focusGroup' in HTMLElement.prototype || !bar) return;
  const items = [...bar.querySelectorAll('button')];
  if (!items.length) return;
  const cur = items.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
  items.forEach((b, i) => (b.tabIndex = i === Math.max(0, cur) ? 0 : -1));
  if (bar.dataset.roving) return;
  bar.dataset.roving = '1';
  bar.addEventListener('focusin', ({ target }) => { const it = [...bar.querySelectorAll('button')]; if (it.includes(target)) it.forEach((b) => (b.tabIndex = b === target ? 0 : -1)); });
  bar.addEventListener('keydown', (e) => {
    const it = [...bar.querySelectorAll('button')], i = it.indexOf(document.activeElement);
    if (i < 0) return;
    const steps = vertical ? { ArrowDown: 1, ArrowUp: -1 } : { ArrowRight: 1, ArrowLeft: -1 };
    let n = null;
    if (e.key in steps) n = (i + steps[e.key] + it.length) % it.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = it.length - 1;
    if (n === null) return;
    e.preventDefault(); e.stopPropagation();
    it[n].focus();
  });
}
