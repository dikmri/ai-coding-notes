// 画面の上の表示（体力・煌気・スキル・会話・お知らせ）と、メニューと店（<dialog>）。
// 文字は拡大したあとの画面に、システムの書体で描く（320×180 のままでは日本語が読めないため）。
import { VIEW_W, VIEW_H } from './world.mjs';
import { xpToNext } from './core/stats.mjs';

const FONT = '"Hiragino Kaku Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif';
const now = () => performance.now();

export function makeUi({ gfx, audio, canvas }) {
  let world = null, dialog = null, after = null;
  const toasts = [];
  const say = document.getElementById('say');
  const menu = document.getElementById('menu'), shop = document.getElementById('shop');
  const api = {
    attach(w) { world = w; },
    blocking: () => !!dialog || menu.open || shop.open,
    announce(text) { say.textContent = text; },
    toast(text) { toasts.push({ text, t: now() }); if (toasts.length > 5) toasts.shift(); api.announce(text); },
    say(lines, then) { dialog = { lines, i: 0, t: now() }; after = then || null; api.announce(lines.map((l) => (l.speaker ? l.speaker + '「' + l.line + '」' : l.line)).join(' ')); },
    // 会話を進める（攻撃か調べるのキー）
    advance(input) {
      if (!dialog) return false;
      if (input.take('interact') || input.take('attack')) {
        const l = dialog.lines[dialog.i], shown = Math.floor((now() - dialog.t) / 35);
        if (shown < l.line.length) dialog.t = -1e9;
        else { dialog.i++; dialog.t = now(); audio.sfx('menu_move'); if (dialog.i >= dialog.lines.length) { dialog = null; input.clear(); if (after) { const f = after; after = null; f(); } } }
      }
      input.clear();
      return true;
    },
    openMenu() { buildMenu('gear'); audio.sfx('menu_ok'); menu.showModal(); },
    openShop() { buildShop(); audio.sfx('menu_ok'); shop.showModal(); },
    draw,
  };
  menu.addEventListener('close', () => { menu.returnValue = ''; world && world.store(); });
  shop.addEventListener('close', () => { shop.returnValue = ''; world && world.store(); });
  menu.querySelector('.menu-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { audio.sfx('menu_move'); buildMenu(b.dataset.tab); } });

  // ---- メニューの中身 ----
  const rar = (it) => world.rarity[it.rarity];
  function itemCanvas(it) {
    const id = { weapon: 'blade', armor: 'coat', talisman: 'charm', boots: 'boots' }[it.slot];
    const c = gfx.get('icons-items', id); const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; cv.getContext('2d').drawImage(c, 0, 0); cv.setAttribute('aria-hidden', 'true'); return cv;
  }
  function itemRow(it, actions, cmp) {
    const li = document.createElement('li'); li.className = 'item';
    const r = rar(it), name = `${world.itemName(it)}`;
    const diff = cmp ? statDiff(it, cmp) : '';
    li.append(itemCanvas(it));
    const mid = document.createElement('div');
    mid.innerHTML = `<div class="nm r-${it.rarity}">【${r.name}】${esc(name)}</div><div class="af">${it.affixes.length ? it.affixes.map((a) => esc(world.affixText(a))).join('<br>') : '屈折銘なし'}${it.unique ? '<br><b>固有の銘を持つ</b>' : ''}${diff}</div>`;
    li.append(mid);
    const act = document.createElement('div'); act.style.display = 'grid'; act.style.gap = '4px';
    for (const [label, fn, dis] of actions) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.disabled = !!dis; b.addEventListener('click', fn); act.append(b); }
    li.append(act);
    return li;
  }
  function statDiff(it, cur) {
    const sum = (x) => { const m = {}; for (const a of (x ? x.affixes : [])) m[a.stat] = (m[a.stat] || 0) + a.v; return m; };
    const a = sum(it), b = sum(cur), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const parts = keys.map((k) => { const d = (a[k] || 0) - (b[k] || 0); return d ? `<span class="${d > 0 ? 'diff-up' : 'diff-down'}">${statName(k)} ${d > 0 ? '+' : ''}${d}</span>` : ''; }).filter(Boolean);
    return parts.length ? '<br>装備中と比べて: ' + parts.join('、') : '';
  }
  const STAT = { atk: '斬撃力', atk_pct: '斬撃力%', resonance: '共鳴力', hp: '生命波', mp: '煌気', def: '装甲値', crit: '閃光率', move_spd_pct: '歩速%', cdr: '調律速度', tide_pct: '潮相%', thunder_pct: '白雷相%', mirage_pct: '陽炎相%', starfrost_pct: '星氷相%', proc_wave: '潮の飛沫', proc_chain: '白雷の連鎖', hp_on_kill: '撃破時の回復', proc_step_flare: 'ステップの陽炎' };
  const statName = (k) => STAT[k] || k;
  const SLOT = { weapon: '剣刃', armor: '装衣', talisman: '輝石飾り', boots: '具足' };
  function buildMenu(tab) {
    const s = world.save;
    menu.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    menu.querySelectorAll('[data-page]').forEach((p) => { p.hidden = p.dataset.page !== tab; });
    const page = menu.querySelector(`[data-page="${tab}"]`);
    page.textContent = '';
    if (tab === 'gear') {
      const cols = document.createElement('div'); cols.className = 'cols';
      const left = document.createElement('div'); left.className = 'box'; left.innerHTML = '<h3>装備中</h3>';
      const ul = document.createElement('ul'); ul.className = 'slots';
      for (const slot of Object.keys(SLOT)) {
        const it = s.items.find((i) => i.uid === s.equip[slot]);
        if (it) ul.append(itemRow(it, [['外す', () => { world.unequip(slot); buildMenu('gear'); }]]));
        else { const li = document.createElement('li'); li.className = 'item'; li.innerHTML = `<span></span><div class="af">${SLOT[slot]}: なし</div><span></span>`; ul.append(li); }
      }
      left.append(ul);
      const right = document.createElement('div'); right.className = 'box'; right.innerHTML = `<h3>持ち物（${s.items.length} / 24）</h3>`;
      const bag = document.createElement('ul'); bag.className = 'bag';
      const ord = { icosa: 0, sunset: 1, azure: 2, common: 3 };
      for (const it of [...s.items].sort((a, b) => ord[a.rarity] - ord[b.rarity])) {
        if (Object.values(s.equip).includes(it.uid)) continue;
        const cur = s.items.find((i) => i.uid === s.equip[it.slot]);
        bag.append(itemRow(it, [['装備', () => { world.equip(it.uid); buildMenu('gear'); }], ['捨てる', () => { world.discard(it.uid); buildMenu('gear'); }]], cur || { affixes: [] }));
      }
      if (!bag.children.length) bag.innerHTML = '<li class="hint">予備の武具はない。敵や宝箱から手に入る。</li>';
      right.append(bag);
      cols.append(left, right); page.append(cols);
    } else if (tab === 'skills') {
      const head = document.createElement('p'); head.innerHTML = `波長点: <b>${s.points}</b>　レベルが上がるたびに1つ増える。習った術は、K・L・U の枠に入れて使う。`;
      page.append(head);
      const cols = document.createElement('div'); cols.className = 'cols';
      const trees = {};
      for (const sk of Object.values(world.data.skills)) (trees[sk.treeName] = trees[sk.treeName] || []).push(sk);
      for (const [name, list] of Object.entries(trees)) {
        const box = document.createElement('div'); box.className = 'box'; box.innerHTML = `<h3>${esc(name)}</h3>`;
        const ul = document.createElement('div'); ul.className = 'tree';
        for (const sk of list) {
          const rank = s.skills[sk.id] || 0, row = document.createElement('div'); row.className = 'skill';
          const ic = document.createElement('canvas'); ic.width = 16; ic.height = 16; ic.setAttribute('aria-hidden', 'true');
          const icon = { sk_wave_slash: 'wave_slash', sk_gale_thrust: 'gale_thrust', sk_prism_bolt: 'prism_bolt', sk_frost_aegis: 'frost_aegis' }[sk.id];
          if (icon) ic.getContext('2d').drawImage(gfx.get('icons-skills', icon), 0, 0);
          const usable = world.data.sliceSkills.includes(sk.id) || sk.kind === 'passive';
          const mid = document.createElement('div');
          mid.innerHTML = `<b>${esc(sk.name)}</b>（${sk.kind === 'active' ? '術' : '常時'}・${esc(world.elementName(sk.element))}） 段階 ${rank} / ${sk.max_rank}${sk.req_level > s.level ? ` ・ Lv${sk.req_level} から` : ''}<div class="desc">${esc(sk.desc)}${sk.mp ? ` 煌気 ${sk.mp}・待ち ${(sk.cooldown_ms / 1000).toFixed(1)} 秒` : ''}${usable ? '' : '（この版では、まだ使えない）'}</div>`;
          const act = document.createElement('div'); act.style.display = 'grid'; act.style.gap = '4px';
          const b = document.createElement('button'); b.type = 'button'; b.textContent = rank ? '段階を上げる' : '習う';
          b.disabled = !usable || s.points <= 0 || rank >= sk.max_rank || s.level < sk.req_level;
          b.addEventListener('click', () => { world.learn(sk.id); buildMenu('skills'); });
          act.append(b);
          if (rank && sk.kind === 'active') for (const [i, key] of [[0, 'K'], [1, 'L'], [2, 'U']]) { const sb = document.createElement('button'); sb.type = 'button'; sb.textContent = `${key} に入れる`; sb.setAttribute('aria-pressed', String(s.slots[i] === sk.id)); sb.addEventListener('click', () => { world.setSlot(i, sk.id); buildMenu('skills'); }); act.append(sb); }
          row.append(ic, mid, act); ul.append(row);
        }
        box.append(ul); cols.append(box);
      }
      page.append(cols);
    } else {
      const st = world.stats;
      const rows = [['レベル', s.level], ['経験', `${s.xp} / ${xpToNext(s.level)}`], ['生命波', st.hp], ['煌気', st.mp], ['斬撃力', st.atk], ['共鳴力', st.resonance], ['装甲値', st.def], ['閃光率', st.crit + '%'], ['歩速', st.move_spd + ' タイル/秒'], ['調律速度', st.cdr + '%'],
        ['潮相 / 白雷相 / 陽炎相 / 星氷相', `${st.tide_pct}% / ${st.thunder_pct}% / ${st.mirage_pct}% / ${st.starfrost_pct}%`], ['プリズム片', s.prism], ['癒やしの潮雫', s.potions + ' / 3'], ['周回の面', `第${s.face}面`], ['倒した魔物', s.kills], ['遊んだ時間', Math.floor(s.playMs / 60000) + ' 分']];
      page.innerHTML = `<table class="stat-table"><caption class="sr">能力</caption>${rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('')}</table><p class="hint">操作: 移動 矢印/WASD ・ 攻撃 J/Z/Space（3段まで続く） ・ ステップ Shift/I ・ 煌刻術 K/L/U ・ 潮雫 Q ・ 調べる E/Enter ・ 調律盤 Tab/M</p>`;
    }
  }
  function buildShop() {
    const s = world.save, body = document.getElementById('shopBody');
    body.textContent = '';
    const top = document.createElement('div'); top.className = 'box';
    top.innerHTML = `<h3>未鑑定の結晶武具</h3><p>プリズム片 100 個で、蒼光以上の武具を1つ。何が出るかは開けてのお楽しみ。所持: <b>${s.prism}</b> 個</p>`;
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '買う（100）'; b.disabled = s.prism < 100;
    const res = document.createElement('p'); res.className = 'hint'; res.setAttribute('aria-live', 'polite');
    b.addEventListener('click', () => { const it = world.buyMystery(); if (it === 'full') res.textContent = '持ち物がいっぱいだ。'; else if (it) res.innerHTML = `出たのは <span class="r-${it.rarity}">【${world.rarity[it.rarity].name}】${esc(world.itemName(it))}</span>！`; buildShopKeep(res.innerHTML); });
    top.append(b, res);
    const sell = document.createElement('div'); sell.className = 'box'; sell.innerHTML = '<h3>武具を売る</h3>';
    const ul = document.createElement('ul'); ul.className = 'bag';
    for (const it of s.items) {
      if (Object.values(s.equip).includes(it.uid)) continue;
      ul.append(itemRow(it, [[`売る（${world.sellValue(it)}）`, () => { world.sell(it.uid); buildShop(); }]]));
    }
    if (!ul.children.length) ul.innerHTML = '<li class="hint">売れる武具はない（装備中の物は売れない）。</li>';
    sell.append(ul);
    const cols = document.createElement('div'); cols.className = 'cols'; cols.append(top, sell); body.append(cols);
  }
  function buildShopKeep(msg) { buildShop(); const p = document.querySelector('#shopBody .hint'); if (p) p.innerHTML = msg; }
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---- 拡大後の画面に描く ----
  function panel(g, x, y, w, h, s) {
    g.fillStyle = 'rgba(29,27,51,0.82)'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#dce0ed'; g.lineWidth = Math.max(1, s * 0.5); g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function bar(g, x, y, w, h, k, col, back = '#141322') { g.fillStyle = back; g.fillRect(x, y, w, h); g.fillStyle = col; g.fillRect(x, y, Math.max(0, Math.min(1, k)) * w, h); }
  function text(g, str, x, y, size, col = '#f7f9fc', align = 'left', bold = true) {
    g.font = `${bold ? 700 : 400} ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'top';
    g.lineWidth = Math.max(2, size / 5); g.strokeStyle = '#141322'; g.strokeText(str, x, y); g.fillStyle = col; g.fillText(str, x, y);
  }
  function draw(g, s, input) {
    const W = VIEW_W * s, H = VIEW_H * s, t = now();
    if (!world || !world.area) return;
    const p = world.player, st = world.stats, sv = world.save, u = s;
    // 左上: レベル、生命波、煌気、経験
    panel(g, 4 * u, 4 * u, 92 * u, 25 * u, u);
    text(g, `Lv ${sv.level}`, 7 * u, 5 * u, 6 * u, '#ffe478');
    bar(g, 26 * u, 6 * u, 66 * u, 5 * u, p.hp / st.hp, '#ff5277'); text(g, `${Math.ceil(p.hp)} / ${st.hp}`, 59 * u, 5.5 * u, 4.5 * u, '#fff', 'center');
    bar(g, 26 * u, 13 * u, 66 * u, 4 * u, p.mp / st.mp, '#63a4ff'); text(g, `${Math.floor(p.mp)} / ${st.mp}`, 59 * u, 12.4 * u, 4 * u, '#fff', 'center');
    bar(g, 7 * u, 20 * u, 85 * u, 1.5 * u, sv.xp / xpToNext(sv.level), '#ffe478');
    text(g, `第${sv.face}面`, 7 * u, 22.5 * u, 4 * u, '#b2f2e8', 'left', false);
    // 左下: 潮雫とプリズム片
    panel(g, 4 * u, (VIEW_H - 16) * u, 74 * u, 12 * u, u);
    g.imageSmoothingEnabled = false;
    g.drawImage(gfx.get('icons-items', 'potion'), 5 * u, (VIEW_H - 16) * u, 12 * u, 12 * u);
    text(g, `×${sv.potions} [Q]`, 18 * u, (VIEW_H - 14) * u, 5 * u);
    g.drawImage(gfx.get('icons-items', 'prism'), 40 * u, (VIEW_H - 16) * u, 12 * u, 12 * u);
    text(g, String(sv.prism), 53 * u, (VIEW_H - 14) * u, 5 * u, '#63a4ff');
    // 右下: 攻撃・ステップ・煌刻術の枠と待ち時間
    const slots = [['attack', 'J', null], ['dash', '⇧', null], ...sv.slots.map((id, i) => [id, 'KLU'[i], id])];
    const icon = { attack: 'attack', dash: 'dash', sk_wave_slash: 'wave_slash', sk_gale_thrust: 'gale_thrust', sk_prism_bolt: 'prism_bolt', sk_frost_aegis: 'frost_aegis' };
    slots.forEach(([id, key, sk], i) => {
      const x = (VIEW_W - 5 * 21 - 2 + i * 21) * u, y = (VIEW_H - 22) * u, sz = 18 * u;
      panel(g, x, y, sz, sz, u);
      if (id && icon[id]) g.drawImage(gfx.get('icons-skills', icon[id]), x + 1 * u, y + 1 * u, 16 * u, 16 * u);
      let left = 0, total = 1;
      if (sk) { left = (p.cds[sk] || 0) - t; total = world.data.skills[sk].cooldown_ms; }
      if (id === 'dash') { left = p.dashCd - t; total = 900; }
      if (left > 0) { g.fillStyle = 'rgba(20,19,34,0.7)'; g.beginPath(); g.moveTo(x + sz / 2, y + sz / 2); g.arc(x + sz / 2, y + sz / 2, sz * 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / total)); g.closePath(); g.save(); g.beginPath(); g.rect(x, y, sz, sz); g.clip(); g.fill(); g.restore(); text(g, (left / 1000).toFixed(1), x + sz / 2, y + 5 * u, 5 * u, '#fff', 'center'); }
      if (sk && world.data.skills[sk] && p.mp < world.data.skills[sk].mp) { g.fillStyle = 'rgba(99,164,255,0.35)'; g.fillRect(x, y, sz, sz); }
      text(g, key, x + 1 * u, y - 5 * u, 4.5 * u, '#ffe478');
    });
    // 上の中央: 場所の名前、またはボスの生命波
    const b = world.boss;
    if (b) {
      panel(g, 70 * u, 4 * u, 180 * u, 14 * u, u);
      text(g, b.d.name, 160 * u, 4.5 * u, 4.5 * u, '#ffc4b8', 'center');
      bar(g, 74 * u, 11 * u, 172 * u, 4 * u, b.hp / b.maxhp, b.phase === 2 ? '#a33b6c' : '#ff5277');
    } else if (world.banner && t < world.banner.until) {
      g.globalAlpha = Math.min(1, (world.banner.until - t) / 600);
      text(g, world.banner.text, W / 2, 10 * u, 8 * u, '#f7f9fc', 'center'); g.globalAlpha = 1;
    }
    // 数字（ダメージ、経験）
    const cam = world.cam;
    for (let i = world.nums.length - 1; i >= 0; i--) {
      const n = world.nums[i], k = (t - n.t) / 800;
      if (k >= 1) { world.nums.splice(i, 1); continue; }
      g.globalAlpha = 1 - k * k; text(g, n.text, (n.x - cam.x) * u, (n.y - cam.y - k * 14) * u, 5.5 * u, n.color, 'center'); g.globalAlpha = 1;
    }
    // 近くで調べられるもの
    const hint = world.hint && world.hint();
    if (hint && !dialog) text(g, hint, (p.x - cam.x) * u, (p.y - cam.y - 34) * u, 4.5 * u, '#ffe478', 'center');
    // お知らせ
    for (let i = toasts.length - 1; i >= 0; i--) if (t - toasts[i].t > 3600) toasts.splice(i, 1);
    toasts.forEach((m, i) => { g.globalAlpha = Math.min(1, (3600 - (t - m.t)) / 500); text(g, m.text, 6 * u, (33 + i * 8) * u, 4.5 * u, '#dce0ed', 'left', false); g.globalAlpha = 1; });
    // 会話の窓
    if (dialog) {
      const l = dialog.lines[dialog.i], shown = Math.max(0, Math.floor((t - dialog.t) / 35));
      panel(g, 20 * u, (VIEW_H - 50) * u, (VIEW_W - 40) * u, 44 * u, u);
      if (l.speaker) text(g, l.speaker, 26 * u, (VIEW_H - 48) * u, 5.5 * u, '#ffc4b8');
      text(g, l.line.slice(0, shown), 26 * u, (VIEW_H - 39) * u, 6.5 * u, '#f7f9fc', 'left', false);
      if (shown >= l.line.length && Math.floor(t / 400) % 2) text(g, '▼', (VIEW_W - 26) * u, (VIEW_H - 14) * u, 5 * u, '#ffe478', 'center');
    }
    // 気絶
    if (p.state === 'dead') { g.fillStyle = 'rgba(20,19,34,0.5)'; g.fillRect(0, 0, W, H); text(g, '気を失った……', W / 2, H / 2 - 6 * u, 9 * u, '#ffc4b8', 'center'); }
  }
  return api;
}
