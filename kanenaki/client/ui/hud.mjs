// HUD: 体力と魔力のゲージ（このゲームの鐘の形）、スキルの枠、経験値の帯、薬の帯、小さな地図、狙いの帯、知らせの欄、保存の印。
import { h, clear, announce } from './dom.mjs';
import { skillIcon, itemIcon } from './icons.mjs';
import { cdFraction, worldToScreen } from '../core.mjs';
import { DEBUG } from '../config.mjs';

const BELL_PATH = 'M32 3c-4 0-5.5 3-5.5 6-8 2.5-12.5 10-12.5 20l-1 17c-.4 6-5 9.5-9 13h56c-4-3.5-8.6-7-9-13l-1-17c0-10-4.5-17.5-12.5-20 0-3-1.5-6-5.5-6z';
function bellSvg(id, cls) {
  // 鐘の形の器に、液が満ちる。中身の高さで残りを見せる
  return `<svg viewBox="0 0 64 72" class="bell-svg" aria-hidden="true">
    <defs><clipPath id="${id}-clip"><path d="${BELL_PATH}"/></clipPath>
    <linearGradient id="${id}-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="${cls}-hi"/><stop offset="1" class="${cls}-lo"/></linearGradient></defs>
    <path d="${BELL_PATH}" class="bell-back"/>
    <g clip-path="url(#${id}-clip)"><rect class="bell-fill" x="0" y="3" width="64" height="56" fill="url(#${id}-g)"/><rect class="bell-shine" x="20" y="10" width="4" height="40"/></g>
    <path d="${BELL_PATH}" class="bell-rim"/><path d="M14 52h36" class="bell-band"/><circle cx="32" cy="65" r="5" class="bell-clapper"/></svg>`;
}

export function createHud({ root, game, data, settings, actions, log }) {
  const G = game.g;
  const lifeEl = h('div', { class: 'bell bell-life', role: 'meter', 'aria-label': '体力', 'aria-valuemin': '0' });
  lifeEl.innerHTML = bellSvg('lifebell', 'life');
  const lifeText = h('div', { class: 'bell-text' });
  lifeEl.append(lifeText);
  const manaEl = h('div', { class: 'bell bell-mana', role: 'meter', 'aria-label': '魔力', 'aria-valuemin': '0' });
  manaEl.innerHTML = bellSvg('manabell', 'mana');
  const manaText = h('div', { class: 'bell-text' });
  manaEl.append(manaText);

  const xpFill = h('div', { class: 'xp-fill' });
  const xpText = h('div', { class: 'xp-text' });
  const xpBar = h('div', { class: 'xp', role: 'meter', 'aria-label': '経験値', 'aria-valuemin': '0', 'data-tip': 'stat:xp' }, xpFill, h('div', { class: 'xp-notches', 'aria-hidden': 'true' }), xpText);

  // 薬の帯
  // 消耗品のデータの key（Z・X・T）で帯に並べる
  const beltDefs = [['Z', '回復薬'], ['X', '魔力の薬'], ['T', '帰還の巻物']];
  const belt = h('div', { class: 'belt', role: 'group', 'aria-label': '薬の帯' });
  const beltSlots = beltDefs.map(([key, label]) => {
    const count = h('span', { class: 'count' }, '0');
    const icon = h('span', { class: 'icon' });
    const b = h('button', { type: 'button', class: `belt-slot belt-${key}`, 'aria-label': `${label}（${key}）`, title: `${label}（${key}）` }, icon, h('kbd', {}, key), count);
    b.addEventListener('click', () => actions.useBelt(key));
    belt.append(b);
    return { key, b, count, icon, label };
  });

  // スキルの枠
  const SLOTS = ['r', '1', '2', '3', '4', '5', '6'];
  const bar = h('div', { class: 'skillbar', role: 'group', 'aria-label': 'スキルの枠' });
  const slotEls = {};
  for (const s of SLOTS) {
    const icon = h('span', { class: 'icon' });
    const cd = h('span', { class: 'cd', 'aria-hidden': 'true' });
    const b = h('button', { type: 'button', class: 'slot', dataset: { slot: s } }, icon, cd, h('kbd', {}, s === 'r' ? '右' : s));
    b.addEventListener('click', () => actions.castSlot(s, null));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); actions.openPanel('skills'); });
    bar.append(b);
    slotEls[s] = { b, icon, cd, skill: undefined };
  }

  // 下の帯
  const bottom = h('div', { class: 'hud-bottom' }, lifeEl, h('div', { class: 'hud-center' }, xpBar, h('div', { class: 'hud-row' }, belt, bar)), manaEl);

  // 右上: 小さな地図とメニュー
  const mini = h('canvas', { class: 'minimap', width: 150, height: 150, 'aria-label': '小さな地図', role: 'img' });
  const zoneName = h('div', { class: 'zone-name' });
  const menuDefs = [['char', '能力値', 'C'], ['inv', '持ち物', 'I'], ['skills', 'スキル', 'S'], ['tree', 'ツリー', 'P'], ['map', '地図', 'M'], ['quests', '依頼', 'J'], ['pause', '止める', 'Esc'], ...(DEBUG ? [['debug', '確かめ', 'F2']] : [])];
  const menu = h('nav', { class: 'menu', 'aria-label': '画面の切り替え' }, menuDefs.map(([id, label, key]) => {
    const b = h('button', { type: 'button', class: 'menu-btn', dataset: { panel: id }, title: `${label}（${key}）` }, label, h('kbd', { 'aria-hidden': 'true' }, key));
    b.addEventListener('click', () => (id === 'pause' ? actions.openPause() : actions.togglePanel(id)));
    return b;
  }));
  const pointsBadge = h('div', { class: 'points-badge', hidden: true });
  const saveNote = h('div', { class: 'save-note', role: 'status' });
  const topRight = h('div', { class: 'hud-top-right' }, zoneName, mini, pointsBadge, saveNote, menu);

  // 狙っている敵
  const tName = h('div', { class: 'target-name' }), tFill = h('div', { class: 'target-fill' }), tCc = h('div', { class: 'target-cc' });
  const target = h('div', { class: 'target', hidden: true, 'aria-live': 'off' }, tName, h('div', { class: 'target-bar' }, tFill), tCc);

  // 知らせの欄（role=log で読み上げ）
  const logEl = h('div', { class: 'log', role: 'log', 'aria-live': 'polite', 'aria-label': '知らせ' });
  const logBox = h('div', { class: 'hud-log' }, logEl);

  // 確かめ用の表示
  const dbg = h('pre', { class: 'debug', hidden: !DEBUG, 'aria-hidden': 'true' });

  // 指で遊ぶとき（画面のボタン）
  const touch = h('div', { class: 'touch-pad', 'aria-hidden': 'true' });

  clear(root).append(bottom, topRight, target, logBox, dbg, touch);

  /* ---------------- 更新 ---------------- */
  let last = {};
  const setIf = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };

  function addLog(text, cls = 'sys') {
    const line = h('div', { class: `log-line log-${cls}` }, text);
    logEl.append(line);
    while (logEl.childElementCount > 40) logEl.firstElementChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
    setTimeout(() => line.classList.add('old'), 9000);
  }

  function refreshSkills() {
    for (const s of SLOTS) {
      const id = G.skills.binds?.[s] ?? null;
      const el = slotEls[s];
      if (el.skill === id) continue;
      el.skill = id;
      clear(el.icon);
      const sk = id ? data.skills[id] : null;
      if (sk) {
        // 絵は覚えておいた 1 枚を使い回すので、枠ごとに写しを作る（同じ要素を 2 か所に入れると前の枠から消える）
        const ic = skillIcon(sk);
        const cv = h('canvas', { width: ic.width, height: ic.height });
        cv.getContext('2d').drawImage(ic, 0, 0);
        el.icon.append(cv);
        el.b.dataset.tip = `skill:${id}`;
        el.b.setAttribute('aria-label', `${s === 'r' ? '右クリック' : s}のスキル: ${sk.name}`);
      } else {
        delete el.b.dataset.tip;
        el.b.setAttribute('aria-label', `${s === 'r' ? '右クリック' : s}のスキル: なし（スキルの画面で割り当てる）`);
      }
    }
  }
  function refreshBelt() {
    for (const s of beltSlots) {
      const items = G.inv.items.filter((it) => data.baseById[it.base]?.key === s.key);
      const n = items.reduce((a, it) => a + (it.qty || 1), 0);
      s.count.textContent = String(n);
      s.b.classList.toggle('empty', n === 0);
      if (!s.icon.firstChild && items[0]) {
        const ic = itemIcon(items[0], data);
        const cv = h('canvas', { width: ic.width, height: ic.height });
        cv.getContext('2d').drawImage(ic, 0, 0);
        s.icon.append(cv);
      }
    }
  }

  function update(now, renderer) {
    const v = game.vitals();
    const lp = Math.max(0, Math.min(1, v.life / (v.lifeMax || 1))), mp = Math.max(0, Math.min(1, v.mana / (v.manaMax || 1)));
    setIf('life', `${Math.round(v.life)}/${Math.round(v.lifeMax)}`, (t) => { lifeText.textContent = t; lifeEl.setAttribute('aria-valuenow', Math.round(v.life)); lifeEl.setAttribute('aria-valuemax', Math.round(v.lifeMax)); });
    setIf('lp', Math.round(lp * 200), () => { lifeEl.style.setProperty('--fill', lp); lifeEl.classList.toggle('low', lp < 0.3); });
    setIf('mana', `${Math.round(v.mana)}/${Math.round(v.manaMax)}`, (t) => { manaText.textContent = t; manaEl.setAttribute('aria-valuenow', Math.round(v.mana)); manaEl.setAttribute('aria-valuemax', Math.round(v.manaMax)); });
    setIf('mp', Math.round(mp * 200), () => manaEl.style.setProperty('--fill', mp));
    const xp = Math.max(0, Math.min(1, v.xp / (v.xpNext || 1)));
    setIf('xp', `${v.level}|${Math.round(xp * 1000)}`, () => { xpFill.style.width = `${xp * 100}%`; xpText.textContent = `Lv ${v.level}　${Math.floor(xp * 1000) / 10}%`; xpBar.setAttribute('aria-valuenow', Math.round(xp * 100)); xpBar.setAttribute('aria-valuemax', '100'); });
    const tp = G.tree.points || 0, sp = G.skills.points || 0;
    setIf('pts', `${tp}|${sp}`, () => { pointsBadge.hidden = !tp && !sp; pointsBadge.textContent = [tp ? `ツリーの点 ${tp}` : '', sp ? `スキルの点 ${sp}` : ''].filter(Boolean).join('　'); });
    // 待ち時間と魔力
    for (const s of SLOTS) {
      const el = slotEls[s];
      if (!el.skill) { el.cd.style.setProperty('--cd', 0); continue; }
      const f = cdFraction(G.skills.cds[el.skill], now);
      el.cd.style.setProperty('--cd', f.toFixed(3));
      const cost = data.skills[el.skill]?.cost?.mana || 0;
      el.b.classList.toggle('nomana', cost > v.mana);
    }
    // 狙い
    const tid = G.hover ?? G.selected;
    const te = tid != null ? G.ents.get(tid) : null;
    if (te && te.anim !== 5 && (te.kind === 'monster' || te.kind === 'player' && te.id !== G.meId)) {
      target.hidden = false;
      setIf('tname', `${te.name}|${te.level}|${te.rarity}`, () => { tName.textContent = `${te.name}${te.level != null ? `　Lv ${te.level}` : ''}${te.rarity === 'elite' ? '　精鋭' : ''}${te.raw?.boss ? '　ボス' : ''}`; target.classList.toggle('elite', te.rarity === 'elite'); });
      tFill.style.width = `${Math.max(0, te.hp)}%`;
      setIf('tcc', Object.keys(te.cc).join(','), (k) => { tCc.textContent = k ? k.split(',').map((x) => ({ stun: '気絶', root: '足止め', slow: '鈍足', silence: '沈黙', fear: '恐怖', sleep: '眠り' })[x] || x).join('・') : ''; });
    } else target.hidden = true;
    drawMini(renderer);
  }

  function drawMini(renderer) {
    const img = renderer.mini;
    if (!img || !G.pred.has) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const S = Math.round(150 * dpr);
    if (mini.width !== S) { mini.width = S; mini.height = S; }
    const c = mini.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0a0810'; c.fillRect(0, 0, S, S);
    const k = 3 * dpr;
    c.imageSmoothingEnabled = false;
    c.translate(S / 2, S / 2); c.scale(1, 0.75); c.rotate(renderer.theta); c.scale(k, k); c.translate(-G.pred.x, -G.pred.y);
    c.drawImage(img, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const dot = (x, y, col, r = 2) => {
      const p = worldToScreen(x, y, G.pred, renderer.theta);
      const sx = S / 2 + (p.x / 16) * k, sy = S / 2 + (p.y / 16) * k;
      if (sx < 0 || sy < 0 || sx > S || sy > S) return;
      c.fillStyle = col; c.fillRect(Math.round(sx - r * dpr / 2), Math.round(sy - r * dpr / 2), Math.ceil(r * dpr), Math.ceil(r * dpr));
    };
    for (const p of G.map?.portals || []) dot(p.x + 0.5, p.y + 0.5, '#7fe0ff', 4);
    for (const e of G.ents.values()) {
      if (e.id === G.meId) continue;
      if (e.kind === 'monster' && e.anim !== 5) dot(e.x, e.y, e.raw?.boss ? '#ff8040' : '#e8483e', 2.5);
      else if (e.kind === 'npc') dot(e.x, e.y, '#ffd870', 3);
      else if (e.kind === 'player') dot(e.x, e.y, '#7cf08c', 3);
      else if (e.kind === 'object') dot(e.x, e.y, '#7fe0ff', 3);
    }
    dot(G.pred.x, G.pred.y, '#ffffff', 4);
  }


  function debug(text) { if (DEBUG) dbg.textContent = text; }
  function setSaved(when) { const d = new Date(when); saveNote.textContent = `保存 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`; }
  function setZone(name) { zoneName.textContent = name || ''; announce(`${name || ''}に入った`); }
  function setMenuState(isOpen) { for (const b of menu.querySelectorAll('[data-panel]')) b.setAttribute('aria-pressed', String(isOpen(b.dataset.panel))); }

  return { update, refreshSkills, refreshBelt, addLog, debug, setSaved, setZone, setMenuState, touch, el: root };
}
