// 各画面。パネル（ゲームを続けながら開く窓）と、モーダル（設定・倒れたとき）。題名の画面と止めた画面は ui/menus.mjs。
import { INV_W, INV_H, STASH_W, STASH_H, SLOTS, RARITIES, CLASS_CHANGE_LEVEL } from '../../shared/schema.mjs';
import { h, clear } from './dom.mjs';
import { itemIcon, skillIcon, rarityColor } from './icons.mjs';
import { formatMod, STAT_LABELS, DMG_TYPE_LABELS, invFits, hitChance, physTaken, resCapped } from '../core.mjs';

const SLOT_LABELS = { head: '頭', body: '胴', hands: '手', feet: '足', belt: '帯', neck: '首', ring1: '指（左）', ring2: '指（右）', weapon: '武器', offhand: '副手' };
const KIND_LABELS = { sword: '剣', greatsword: '大剣', dagger: '短剣', axe: '斧', staff: '杖', scepter: '錫杖', knuckle: '拳甲', shield: '盾', tome: '魔導書', helm: '頭の防具', armor: '胴の防具', gloves: '手袋', boots: '靴', belt: '帯', amulet: '首飾り', ring: '指輪', potion: '薬', scroll: '巻物', oblivion: '聖水' };
const TARGET_LABELS = { enemy: '敵 1 体', ground: '地面', self: '自分', ally: '仲間', dir: '向き' };
const NEED_LABELS = { kill: '倒す', collect: '集める', level: 'レベル', visit: '行く', talk: '話す' };

export function createScreens({ game, data, link, panels, ctxMenu, tooltip, settings, actions, log, calc }) {
  const G = game.g;
  const send = (m) => link.send(m);
  const cls = () => G.me.cls || 'adventurer';
  const slotOf = (it) => it.slot || data.baseById[it.base]?.slot || null;
  // 使える消耗品か（データの use か key がある）
  const useOf = (it) => { const b = data.baseById[it.base]; return !!(b && (b.key || (Array.isArray(b.use) ? b.use.length : b.use))); };
  // 文言はデータの係の formatMod・statNames を優先する（サーバーの知らせと言い方をそろえる）
  const fmt = (m) => { try { return typeof data.formatMod === 'function' ? data.formatMod(m) : formatMod(m); } catch { return formatMod(m); } };
  const statLabel = (k) => data.statNames?.[k] || STAT_LABELS[k] || k;
  const ruleText = (r) => (r == null ? '' : typeof r === 'string' ? r : r.desc || r.text || '');

  /* ================= 説明の吹き出しの中身 ================= */
  function itemTip(it, { price, where } = {}) {
    const base = data.baseById[it.base] || {};
    const lines = [];
    const add = (cls, text) => lines.push(h('div', { class: cls }, text));
    const box = h('div', { class: `tip-item r-${it.rarity || 'normal'}` });
    box.append(h('div', { class: 'tip-name', style: { color: rarityColor(it.rarity) } }, it.name || base.name || it.base));
    box.append(h('div', { class: 'tip-sub' }, `${RARITIES[it.rarity]?.name || '普通'}の${KIND_LABELS[it.kind || base.kind] || 'もの'}${slotOf(it) ? `（${SLOT_LABELS[slotOf(it)] || SLOT_LABELS[slotOf(it) + '1'] || slotOf(it)}）` : ''}`));
    const dmg = it.dmg || base.dmg;
    if (dmg) add('tip-stat', `ダメージ ${dmg[0]}〜${dmg[1]}`);
    if (it.speed || base.speed) add('tip-stat', `攻撃の速さ 1 秒に ${it.speed || base.speed} 回`);
    if (it.armor || base.armor) add('tip-stat', `防御 ${it.armor || base.armor}`);
    if (it.qty != null) add('tip-stat', `数 ${it.qty}`);
    const lvl = it.level ?? base.level;
    if (lvl) add((G.me.level ?? 1) < lvl ? 'tip-req bad' : 'tip-req', `必要なレベル ${lvl}`);
    const mods = it.mods || [];
    const impl = base.implicit || [];
    if (mods.length || impl.length) lines.push(h('hr'));
    for (const m of mods) add('tip-mod', fmt(m));
    if (!mods.length) for (const m of impl) add('tip-mod', fmt(m));
    if (it.rule) add('tip-rule', ruleText(it.rule));
    if (it.flavor) add('tip-flavor', it.flavor);
    if (base.desc && !base.slot) add('tip-mod', base.desc);
    if (base.key) add('tip-note', `${base.key} のキーで使う`);
    if (price != null) add('tip-price', `値段 ${price}`);
    const slot = slotOf(it);
    if (slot && where !== 'equip') {
      const cur = slot === 'ring' ? G.inv.equip.ring1 : G.inv.equip[slot];
      if (cur) add('tip-compare', `いま付けている物: ${cur.name}`);
    }
    box.append(...lines);
    if (where && where !== 'shop') box.append(h('div', { class: 'tip-hint' }, where === 'ground' ? '押すと拾う' : '押すと操作の一覧。右クリックで装備・使う'));
    return box;
  }
  function findItem(where, uid) {
    if (where === 'inv') return G.inv.items.find((i) => String(i.uid ?? i.id) === uid);
    if (where === 'stash') return (G.inv.stash || []).find((i) => String(i.uid ?? i.id) === uid);
    if (where === 'equip') return G.inv.equip[uid];
    if (where === 'shop') { const e = shopState?.items?.find((i) => String(i.id) === uid); return e ? { ...e.item, price: e.price } : null; }
    return null;
  }
  const STAT_HELP = {
    str: '力。近接の攻撃が強くなり、最大体力も少し増える。',
    dex: '器用。命中と回避が上がり、攻撃が速くなる。',
    int: '知恵。呪文が強くなり、最大魔力が増える。',
    vit: '体力。最大体力が増える。',
    life: '最大体力。0 になると倒れる。',
    mana: '最大魔力。スキルを使うと減る。',
    armor: '防御。物理のダメージを減らす。大きな一撃ほど減らしにくい。',
    evasion: '回避。敵の攻撃を外させる。呪文は避けられない。',
    accuracy: '命中。自分の攻撃が当たる確率に効く。',
    critChance: '会心の確率。会心になると、ダメージに会心の倍率がかかる。基本は 5%。',
    critMulti: '会心の倍率。基本は 150%。',
    blockChance: '防ぐ確率。盾で攻撃を止める。',
    attackSpeed: '攻撃の速さ。',
    castSpeed: '詠唱の速さ。',
    moveSpeed: '歩く速さ。',
    itemFind: '宝の見つけやすさ。珍しい品が出やすくなる。',
    goldFind: 'お金の見つけやすさ。',
    lightRadius: '明かりの広さ。暗い所で遠くまで見える。',
  };
  function statTip(key) {
    const s = G.me.stats || {};
    const box = h('div', { class: 'tip-stat-box' });
    if (key === 'xp') {
      const v = game.vitals();
      box.append(h('div', { class: 'tip-name' }, '経験値'), h('div', {}, `いま ${Math.floor(v.xp)} / ${v.xpNext}`), h('div', { class: 'tip-note' }, '次のレベルまでの経験値は、レベル L のとき round(100 × L^1.8)。倒れると、いまのレベルの経験値の 5% を失う（レベルは下がらない）。'));
      return box;
    }
    const label = statLabel(key);
    box.append(h('div', { class: 'tip-name' }, label));
    const help = key.startsWith('res') ? `${DMG_TYPE_LABELS[key.slice(3).toLowerCase()] || ''}のダメージを減らす割合。上限は 75%。` : STAT_HELP[key];
    if (help) box.append(h('div', {}, help));
    const v = s[key];
    if (key === 'armor' && v != null) box.append(h('div', { class: 'tip-note' }, `受ける物理ダメージ = ダメージ × (1 − 防御 / (防御 + 5 × ダメージ))。いまの防御 ${v} だと、50 のダメージは ${Math.round(physTaken(50, v))}、200 のダメージは ${Math.round(physTaken(200, v))} になる。`));
    if (key === 'evasion' && v != null) box.append(h('div', { class: 'tip-note' }, `当たる確率 = 命中 / (命中 + 回避 × 0.5)（5%〜95%）。命中 100 の敵の攻撃は ${Math.round(hitChance(100, v) * 100)}% 当たる。`));
    if (key === 'accuracy' && v != null) box.append(h('div', { class: 'tip-note' }, `回避 100 の敵に ${Math.round(hitChance(v, 100) * 100)}% 当たる。`));
    if (key.startsWith('res') && v != null) box.append(h('div', { class: 'tip-note' }, `いまの値 ${v}%（効くのは ${resCapped(v)}% まで）`));
    if (typeof calc?.describeStat === 'function') { try { const t = calc.describeStat(key, G.me); if (t) box.append(h('div', { class: 'tip-note' }, t)); } catch { /* 計算の係の関数が無い・違う形 */ } }
    return box;
  }
  function skillTip(id) {
    const sk = data.skills[id];
    if (!sk) return null;
    const rank = G.skills.ranks?.[id] || 0;
    const box = h('div', { class: 'tip-skill' });
    box.append(h('div', { class: 'tip-name' }, sk.name), h('div', { class: 'tip-sub' }, `ランク ${rank} / ${sk.maxRank || 20}　${data.classes[sk.cls]?.name || ''}のスキル`));
    box.append(h('div', {}, sk.desc || ''));
    const cost = sk.cost?.mana != null ? `魔力 ${sk.cost.mana + (sk.cost.perRank || 0) * Math.max(0, rank - 1)}` : '';
    const meta = [cost, sk.cd ? `待ち ${sk.cd} 秒` : '', sk.range ? `届く距離 ${sk.range} マス` : '', TARGET_LABELS[sk.target] ? `相手: ${TARGET_LABELS[sk.target]}` : ''].filter(Boolean).join('　');
    if (meta) box.append(h('div', { class: 'tip-note' }, meta));
    if (sk.unlock > (G.me.level ?? 1)) box.append(h('div', { class: 'tip-req bad' }, `レベル ${sk.unlock} から覚えられる`));
    return box;
  }
  function slotTip(slot) {
    const it = G.inv.equip[slot];
    if (it) return itemTip(it, { where: 'equip' });
    return h('div', {}, h('div', { class: 'tip-name' }, SLOT_LABELS[slot]), h('div', {}, '何も付けていない。持ち物からここへ引きずると付けられる。'));
  }
  const providers = {
    item(spec) { const [where, ...rest] = spec.split(':'); const it = findItem(where, rest.join(':')); return it ? itemTip(it, { where, price: where === 'shop' ? it.price : null }) : null; },
    ground(id) { const e = G.ents.get(isNaN(+id) ? id : +id); return e ? itemTip(e.raw?.item || { name: e.name, rarity: e.rarity, base: e.art }, { where: 'ground' }) : null; },
    stat: statTip, skill: skillTip, slot: slotTip,
    text(t) { return h('div', {}, t); },
  };

  /* ================= 持ち物の升目と引きずり ================= */
  let drag = null;
  let shopState = null;
  const ghost = h('div', { class: 'drag-ghost', 'aria-hidden': 'true' });
  ghost.setAttribute('popover', 'manual');
  document.body.append(ghost);

  function gridView(where, W, H, items) {
    const grid = h('div', { class: 'grid', dataset: { where }, style: { '--gw': W, '--gh': H }, role: 'group', 'aria-label': where === 'inv' ? '持ち物の升目' : '倉庫の升目' });
    const hl = h('div', { class: 'grid-hl', hidden: true, 'aria-hidden': 'true' });
    grid.append(hl);
    for (const it of items) {
      const uid = String(it.uid ?? it.id);
      const b = h('button', { type: 'button', class: `item r-${it.rarity || 'normal'}`, style: { '--x': it.x, '--y': it.y, '--iw': it.w || 1, '--ih': it.h || 1 }, dataset: { uid, tip: `item:${where}:${uid}` }, 'aria-label': `${it.name}${it.qty > 1 ? ` ${it.qty} 個` : ''}` });
      const ic = itemIcon(it, data);
      const cv = h('canvas', { width: ic.width, height: ic.height, 'aria-hidden': 'true' });
      cv.getContext('2d').drawImage(ic, 0, 0);
      b.append(cv);
      if (it.qty > 1) b.append(h('span', { class: 'qty', 'aria-hidden': 'true' }, String(it.qty)));
      wireItem(b, it, { where, uid });
      grid.append(b);
    }
    return grid;
  }
  // 引きずりは document で受ける（吹き出しや窓の出し直しで pointer capture が外れることがあるため。ガイド drag の考え方）
  function wireItem(b, it, from) {
    let sx = 0, sy = 0, dragged = false;
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = b.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; dragged = false;
      drag = { it, from, b, ox: e.clientX - r.left, oy: e.clientY - r.top, started: false, pid: e.pointerId };
      const move = (ev) => {
        if (!drag || ev.pointerId !== drag.pid) return;
        if (!drag.started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) startDrag(ev);
        if (drag.started) { ev.preventDefault(); moveDrag(ev); }
      };
      const done = (ev) => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', done);
        document.removeEventListener('pointercancel', done);
        if (!drag || ev.pointerId !== drag.pid) return;
        if (drag.started && ev.type === 'pointerup') { dragged = true; endDrag(ev); }
        else if (drag.started) cancelDrag();
        else drag = null;
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', done);
      document.addEventListener('pointercancel', done);
    });
    b.addEventListener('click', (e) => {
      if (dragged) { dragged = false; return; }
      const r = b.getBoundingClientRect();
      itemMenu(it, from, e.detail === 0 ? { x: r.right, y: r.top } : { x: e.clientX, y: e.clientY });
    });
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); quickAction(it, from); });
  }
  function startDrag() {
    drag.started = true;
    tooltip.hide();
    const ic = itemIcon(drag.it, data);
    const cell = cellSize();
    clear(ghost);
    const cv = h('canvas', { width: ic.width, height: ic.height });
    cv.getContext('2d').drawImage(ic, 0, 0);
    ghost.style.width = `${(drag.it.w || 1) * cell}px`; ghost.style.height = `${(drag.it.h || 1) * cell}px`;
    ghost.append(cv);
    ghost.showPopover();
    drag.b.classList.add('lifted');
    log('ui.inv.drag', { uid: drag.from.uid, from: drag.from.where });
  }
  const cellSize = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 30;
  function dropTarget(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return null;
    const grid = el.closest('.grid');
    if (grid) {
      const where = grid.dataset.where;
      const W = where === 'inv' ? INV_W : STASH_W, H = where === 'inv' ? INV_H : STASH_H;
      const r = grid.getBoundingClientRect(), cell = r.width / W;
      const x = Math.round((e.clientX - drag.ox - r.left) / cell), y = Math.round((e.clientY - drag.oy - r.top) / cell);
      const items = where === 'inv' ? G.inv.items : G.inv.stash || [];
      const same = drag.from.where === where ? drag.from.uid : null;
      const ok = invFits(items.map((i) => ({ ...i, uid: String(i.uid ?? i.id) })), W, H, x, y, drag.it.w || 1, drag.it.h || 1, same);
      return { kind: 'grid', grid, where, x, y, ok, cell };
    }
    const slot = el.closest('.equip-slot');
    if (slot) { const s = slot.dataset.slot; const it = slotOf(drag.it); return { kind: 'slot', slot: s, el: slot, ok: !!it && (it === s || (it === 'ring' && s.startsWith('ring'))) }; }
    if (el.closest('.panel-shop')) return { kind: 'shop', ok: drag.from.where === 'inv' };
    if (el.closest('#view, #over, #stage')) return { kind: 'ground', ok: drag.from.where === 'inv' };
    return null;
  }
  function moveDrag(e) {
    ghost.style.left = `${e.clientX - drag.ox}px`; ghost.style.top = `${e.clientY - drag.oy}px`;
    for (const x of document.querySelectorAll('.grid-hl')) x.hidden = true;
    for (const x of document.querySelectorAll('.equip-slot.drop-ok, .equip-slot.drop-bad')) x.classList.remove('drop-ok', 'drop-bad');
    const t = dropTarget(e);
    if (t?.kind === 'grid') {
      const hl = t.grid.querySelector('.grid-hl');
      hl.hidden = false;
      hl.style.setProperty('--x', t.x); hl.style.setProperty('--y', t.y); hl.style.setProperty('--iw', drag.it.w || 1); hl.style.setProperty('--ih', drag.it.h || 1);
      hl.classList.toggle('bad', !t.ok);
    } else if (t?.kind === 'slot') t.el.classList.add(t.ok ? 'drop-ok' : 'drop-bad');
    ghost.classList.toggle('bad', !!t && !t.ok);
  }
  function endDrag(e) {
    const t = dropTarget(e);
    const { it, from } = drag;
    cancelDrag();
    if (!t || !t.ok) { if (t) actions.toast('そこには置けない'); return; }
    // 世界の計算の形: move { item, to:{x,y,stash?} } / unequip { from:枠, to?:{x,y} } / equip { item, to:枠 } / sell { item, npc } / drop { item } か { from:枠 }
    const uid = it.uid ?? it.id;
    if (t.kind === 'grid') send(from.where === 'equip' ? { t: 'inv', op: 'unequip', from: from.uid, to: t.where === 'inv' ? { x: t.x, y: t.y } : undefined } : { t: 'inv', op: 'move', item: uid, to: { x: t.x, y: t.y, stash: t.where === 'stash' } });
    else if (t.kind === 'slot') send({ t: 'inv', op: 'equip', item: uid, to: t.slot });
    else if (t.kind === 'shop') send({ t: 'inv', op: 'sell', item: uid, npc: shopState?.npc });
    else if (t.kind === 'ground') send(from.where === 'equip' ? { t: 'inv', op: 'drop', from: from.uid } : { t: 'inv', op: 'drop', item: uid });
  }
  function cancelDrag() {
    if (ghost.matches(':popover-open')) ghost.hidePopover();
    drag?.b?.classList.remove('lifted');
    for (const x of document.querySelectorAll('.grid-hl')) x.hidden = true;
    for (const x of document.querySelectorAll('.equip-slot.drop-ok, .equip-slot.drop-bad')) x.classList.remove('drop-ok', 'drop-bad');
    drag = null;
  }
  function quickAction(it, from) {
    const uid = it.uid ?? it.id;
    if (from.where === 'equip') return send({ t: 'inv', op: 'unequip', from: from.uid });
    if (from.where === 'stash') return send({ t: 'inv', op: 'stash', item: uid });
    if (panels.isOpen('shop')) return send({ t: 'inv', op: 'sell', item: uid, npc: shopState?.npc });
    if (panels.isOpen('stash')) return send({ t: 'inv', op: 'stash', item: uid });
    if (useOf(it)) return send({ t: 'inv', op: 'use', item: uid });
    if (slotOf(it)) return send({ t: 'inv', op: 'equip', item: uid });
  }
  function itemMenu(it, from, at) {
    const uid = it.uid ?? it.id;
    const acts = [];
    if (from.where === 'equip') acts.push({ label: '外す', run: () => send({ t: 'inv', op: 'unequip', from: from.uid }) });
    else if (from.where === 'stash') acts.push({ label: '持ち物へ移す', run: () => send({ t: 'inv', op: 'stash', item: uid }) });
    else {
      if (slotOf(it)) acts.push({ label: '装備する', run: () => send({ t: 'inv', op: 'equip', item: uid }) });
      if (useOf(it)) acts.push({ label: '使う', run: () => send({ t: 'inv', op: 'use', item: uid }) });
      if (panels.isOpen('shop')) acts.push({ label: '売る', run: () => send({ t: 'inv', op: 'sell', item: uid, npc: shopState?.npc }) });
      if (panels.isOpen('stash')) acts.push({ label: '倉庫へ入れる', run: () => send({ t: 'inv', op: 'stash', item: uid }) });
      acts.push({ label: '地面に置く', run: () => send({ t: 'inv', op: 'drop', item: uid }) });
    }
    acts.push({ label: 'やめる', run: () => {} });
    ctxMenu.open(at, it.name, acts);
  }

  /* ================= パネル ================= */
  panels.define('char', {
    title: '能力値', key: 'C', place: 'left', width: '300px',
    build(body) {
      const s = G.me.stats || {};
      const v = game.vitals();
      const num = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);
      const row = (key, val, extra = '') => h('div', { class: 'stat-row', tabindex: '0', dataset: { tip: `stat:${key}` } }, h('span', {}, statLabel(key)), h('span', { class: 'stat-val' }, val == null ? '—' : `${num(val)}${extra}`));
      clear(body).append(
        h('div', { class: 'char-head' }, h('div', { class: 'char-name' }, G.me.name || '—'), h('div', { class: 'char-cls' }, `${data.classes[cls()]?.name || cls()}　Lv ${v.level}`)),
        h('div', { class: 'stat-row', tabindex: '0', dataset: { tip: 'stat:xp' } }, h('span', {}, '経験値'), h('span', { class: 'stat-val' }, `${Math.floor(v.xp)} / ${v.xpNext}`)),
        h('div', { class: 'stat-row' }, h('span', {}, 'お金'), h('span', { class: 'stat-val gold' }, String(G.inv.gold ?? G.me.gold ?? 0))),
        h('h3', {}, '主な能力値'),
        h('div', { class: 'stat-grid' }, ['str', 'dex', 'int', 'vit'].map((k) => row(k, s[k]))),
        h('h3', {}, '守り'),
        row('life', `${Math.round(v.life)} / ${Math.round(v.lifeMax)}`), row('mana', `${Math.round(v.mana)} / ${Math.round(v.manaMax)}`),
        row('armor', s.armor), row('evasion', s.evasion), row('blockChance', s.blockChance, '%'),
        h('div', { class: 'res-grid' }, ['resFire', 'resCold', 'resLightning', 'resPoison', 'resHoly', 'resShadow'].map((k) => row(k, s[k], '%'))),
        h('h3', {}, '攻め'),
        h('div', { class: 'stat-row' }, h('span', {}, '武器のダメージ'), h('span', { class: 'stat-val' }, s.dmgMin != null ? `${s.dmgMin}〜${s.dmgMax}` : '—')),
        row('accuracy', s.accuracy), row('critChance', s.critChance, '%'), row('critMulti', s.critMulti, '%'), row('attackSpeed', s.attackSpeed, '%'), row('castSpeed', s.castSpeed, '%'),
        h('h3', {}, 'そのほか'),
        row('moveSpeed', s.moveSpeed, ' マス/秒'), row('itemFind', s.itemFind, '%'), row('goldFind', s.goldFind, '%'), row('lightRadius', s.lightRadius, ' マス'),
      );
    },
  });

  panels.define('inv', {
    title: '持ち物と装備', key: 'I', place: 'right',
    build(body) {
      const eq = h('div', { class: 'equip', role: 'group', 'aria-label': '装備' });
      for (const s of SLOTS) {
        const it = G.inv.equip[s];
        const b = h('button', { type: 'button', class: `equip-slot slot-${s}${it ? ` has r-${it.rarity || 'normal'}` : ''}`, dataset: { slot: s, tip: `slot:${s}` }, 'aria-label': `${SLOT_LABELS[s]}: ${it ? it.name : 'なし'}` });
        if (it) {
          const ic = itemIcon(it, data);
          const cv = h('canvas', { width: ic.width, height: ic.height, 'aria-hidden': 'true' });
          cv.getContext('2d').drawImage(ic, 0, 0);
          b.append(cv);
          wireItem(b, it, { where: 'equip', uid: s });
        } else b.append(h('span', { class: 'slot-label', 'aria-hidden': 'true' }, s.startsWith('ring') ? '指' : SLOT_LABELS[s]));
        eq.append(b);
      }
      const gold = h('div', { class: 'gold-line' }, h('span', {}, 'お金'), h('span', { class: 'gold' }, String(G.inv.gold ?? 0)));
      clear(body).append(eq, gridView('inv', INV_W, INV_H, G.inv.items), gold, h('p', { class: 'hint' }, '品物は引きずって動かす。押すと操作の一覧、右クリックで装備・使う。地面へ引きずると置く。'));
    },
  });

  panels.define('stash', {
    title: '倉庫', place: 'left',
    build(body) { clear(body).append(gridView('stash', STASH_W, STASH_H, G.inv.stash || []), h('p', { class: 'hint' }, '持ち物との間で引きずって出し入れする。')); },
    onOpen() { if (!panels.isOpen('inv')) panels.show('inv'); },
  });

  panels.define('shop', {
    title: '店', place: 'left', width: '340px',
    build(body) {
      const st = shopState;
      clear(body);
      if (!st) { body.append(h('p', {}, '品物がない')); return; }
      body.append(h('div', { class: 'shop-head' }, st.name || G.ents.get(st.npc)?.name || '店'), h('div', { class: 'gold-line' }, h('span', {}, '持っているお金'), h('span', { class: 'gold' }, String(G.inv.gold ?? 0))));
      const list = h('ul', { class: 'shop-list' });
      // 店の品: { id, name, price, w, h, item }（item は売り物の見本）
      for (const e of st.items || []) {
        const it = e.item || e;
        const key = String(e.id);
        const ic = itemIcon(it, data);
        const cv = h('canvas', { width: ic.width, height: ic.height, 'aria-hidden': 'true', style: { width: `${Math.min(ic.width, 32) * 1.5}px` } });
        cv.getContext('2d').drawImage(ic, 0, 0);
        const price = e.price ?? 0;
        const gold = G.inv.gold ?? 0;
        const buy = h('button', { type: 'button', class: 'buy', disabled: gold < price || null, 'aria-label': `${e.name}を買う` }, '買う');
        buy.addEventListener('click', () => send({ t: 'inv', op: 'buy', npc: st.npc, item: e.id }));
        const five = it.consumable ? h('button', { type: 'button', class: 'buy', disabled: gold < price * 5 || null, 'aria-label': `${e.name}を 5 個買う` }, '5 個') : null;
        five?.addEventListener('click', () => send({ t: 'inv', op: 'buy', npc: st.npc, item: e.id, qty: 5 }));
        const lvl = it.level && it.level > (G.me.level ?? 1) ? h('span', { class: 'shop-lv' }, `Lv${it.level}`) : null;
        list.append(h('li', { tabindex: '0', dataset: { tip: `item:shop:${key}` } }, cv, h('span', { class: 'shop-name', style: { color: rarityColor(it.rarity) } }, e.name, lvl), h('span', { class: 'price' }, `${price} G`), h('span', { class: 'shop-buttons' }, buy, five)));
      }
      body.append(list, h('p', { class: 'hint' }, '売るときは、持ち物からこの窓へ引きずる。品物を押して「売る」でもよい。'));
    },
    onOpen() { if (!panels.isOpen('inv')) panels.show('inv'); },
  });

  panels.define('skills', {
    title: 'スキル', key: 'S', place: 'left', width: '420px',
    build(body) {
      const lv = G.me.level ?? 1;
      const pts = G.skills.points || 0;
      const avail = G.skills.avail ? new Set(G.skills.avail) : null;
      const mine = Object.values(data.skills).filter((s) => (avail ? avail.has(s.id) : s.cls === 'adventurer' || s.cls === cls()));
      mine.sort((a, b) => (a.cls === 'adventurer') - (b.cls === 'adventurer') || (a.unlock || 1) - (b.unlock || 1));
      const list = h('ul', { class: 'skill-list' });
      for (const sk of mine) {
        const rank = G.skills.ranks?.[sk.id] || 0;
        const locked = (sk.unlock || 1) > lv;
        const up = h('button', { type: 'button', class: 'up', 'aria-label': `${sk.name}のランクを上げる`, disabled: (!pts || locked || rank >= (sk.maxRank || 20)) || null }, '＋');
        up.addEventListener('click', () => send({ t: 'skillUp', s: sk.id }));
        const binds = h('div', { class: 'binds', role: 'group', 'aria-label': `${sk.name}の割り当て` });
        for (const slot of ['r', '1', '2', '3', '4', '5', '6']) {
          const on = G.skills.binds?.[slot] === sk.id;
          const b = h('button', { type: 'button', 'aria-pressed': String(on), disabled: (!rank) || null, title: slot === 'r' ? '右クリック' : `${slot} のキー` }, slot === 'r' ? '右' : slot);
          b.addEventListener('click', () => send({ t: 'bind', slot, s: on ? null : sk.id }));
          binds.append(b);
        }
        const ic = skillIcon(sk);
        const cv = h('canvas', { width: 24, height: 24, class: 'sk-icon', 'aria-hidden': 'true' });
        cv.getContext('2d').drawImage(ic, 0, 0);
        list.append(h('li', { class: `skill-row${locked ? ' locked' : ''}${rank ? '' : ' unlearned'}` },
          h('div', { class: 'sk-left', tabindex: '0', dataset: { tip: `skill:${sk.id}` } }, cv, h('div', {}, h('div', { class: 'sk-name' }, sk.name), h('div', { class: 'sk-meta' }, locked ? `レベル ${sk.unlock} から` : `ランク ${rank} / ${sk.maxRank || 20}`))),
          h('div', { class: 'sk-right' }, up, binds),
          h('p', { class: 'sk-desc' }, sk.desc || '')));
      }
      clear(body).append(h('div', { class: 'points-line' }, `スキルの点 ${pts}`), list);
    },
  });

  panels.define('quests', {
    title: '依頼', key: 'J', place: 'left', width: '340px',
    build(body) {
      clear(body);
      const list = G.quests.filter((q) => q.state !== 'done');
      const done = G.quests.filter((q) => q.state === 'done');
      if (!list.length) body.append(h('p', {}, '受けている依頼はない。町の人に話しかけてみよう。'));
      const STATE = { available: '受けられる', active: '受けている', ready: '報告できる' };
      const ul = h('ul', { class: 'quest-list' });
      for (const q of list) {
        const d = data.quests[q.id] || {};
        const giver = data.npcs[Array.isArray(q.giver) ? q.giver[0] : q.giver]?.name;
        const prog = (q.progress || []).map((n) => {
          const what = n.kind === 'kill' ? data.monsters[n.id]?.name : n.kind === 'collect' ? data.baseById[n.id]?.name : n.kind === 'visit' ? data.maps[n.id]?.name : n.id;
          return h('div', { class: `q-need${n.have >= n.need ? ' ok' : ''}` }, `${what ?? ''}を${NEED_LABELS[n.kind] ?? ''} ${n.have} / ${n.need}`);
        });
        ul.append(h('li', { class: `q-${q.state}` }, h('div', { class: 'q-name' }, q.name || d.name || q.id, h('span', { class: 'q-state' }, STATE[q.state] ?? '')), h('p', {}, q.desc || d.desc || ''), ...prog, giver ? h('div', { class: 'q-giver' }, `依頼主: ${giver}${q.state === 'ready' ? '（話しかけて報告する）' : ''}`) : null));
      }
      body.append(ul);
      if (done.length) body.append(h('p', { class: 'hint' }, `終えた依頼: ${done.map((q) => q.name).join('、')}`));
    },
  });

  panels.define('map', {
    title: '地図', key: 'M', place: 'center',
    build(body) {
      const img = actions.miniImage();
      const m = G.map;
      clear(body);
      if (!img || !m) { body.append(h('p', {}, '地図がない')); return; }
      const S = Math.min(480, innerWidth - 80, innerHeight - 200);
      const cv = h('canvas', { class: 'bigmap', width: S, height: S, role: 'img', 'aria-label': `${G.mapDef?.name || ''}の地図` });
      const c = cv.getContext('2d');
      const k = S / Math.max(m.w, m.h);
      c.imageSmoothingEnabled = false;
      c.fillStyle = '#0a0810'; c.fillRect(0, 0, S, S);
      c.drawImage(img, 0, 0, m.w * k, m.h * k);
      const dot = (x, y, col, r) => { c.fillStyle = col; c.fillRect(x * k - r / 2, y * k - r / 2, r, r); };
      for (const p of G.portals || []) dot(p.x, p.y, '#7fe0ff', 7);
      for (const e of G.ents.values()) if (e.kind === 'npc') dot(e.x, e.y, '#ffd870', 5);
      dot(G.pred.x, G.pred.y, '#fff', 7);
      c.font = '12px system-ui, sans-serif'; c.fillStyle = '#e8dfcc'; c.textAlign = 'center';
      for (const p of G.portals || []) { const to = data.maps[p.to]; if (to) c.fillText(`${to.name}へ`, p.x * k, p.y * k - 8); }
      body.append(h('div', { class: 'map-title' }, G.mapDef?.name || ''), cv, h('p', { class: 'hint' }, '白: 自分　黄: 町の人　水色: 出口・ワープ'));
    },
  });

  // 会話（NPC）。世界の計算の形: { npc, npcId, name, text, options:[{ label, send, desc? }] }
  let dialogState = null;
  panels.define('talk', {
    title: '会話', place: 'bottom', width: 'min(520px, 92vw)',
    build(body) {
      const d = dialogState;
      clear(body);
      if (!d) return;
      const name = d.name || G.ents.get(d.npc)?.name || '';
      body.append(h('div', { class: 'talk-name' }, name), h('p', { class: 'talk-text' }, d.text || ''));
      const ul = h('div', { class: 'talk-options' });
      (d.options || []).forEach((o, i) => {
        const b = h('button', { type: 'button', title: o.desc || null }, o.label ?? o.text ?? '…');
        b.addEventListener('click', () => chooseOption(d, o, i));
        ul.append(b);
      });
      const bye = h('button', { type: 'button', class: 'talk-bye' }, '話を終える');
      bye.addEventListener('click', () => panels.hide('talk'));
      ul.append(bye);
      body.append(ul);
      ul.querySelector('button')?.focus({ preventScroll: true });
    },
  });
  function chooseOption(d, o, i) {
    log('ui.talk.choose', { npc: d.npcId ?? d.npc, i, label: o.label ?? '' });
    // 転職は取り消せないので、職の説明を並べた窓でもう一度確かめてから送る
    if (o.send?.t === 'classChange') { panels.hide('talk'); panels.show('classChange', o.send.cls); return; }
    if (o.send?.t) send(o.send);
    if (o.send?.t === 'quest' || o.send?.opt === 'rest' || String(o.send?.opt ?? '').startsWith('warp:') || o.send?.opt === 'return') panels.hide('talk');
  }

  panels.define('classChange', {
    title: '転職', place: 'center', width: 'min(760px, 94vw)',
    build(body, pick) {
      const lv = G.me.level ?? 1;
      const can = lv >= CLASS_CHANGE_LEVEL && cls() === 'adventurer';
      clear(body).append(h('p', { class: 'cc-lead' }, can ? '冒険者からなる職を 1 つ選ぶ。選ぶと、その職の地域の門のマスを 1 つもらえる。決めた職は変えられない。転職の試験を終えてから、その職の師範の近くで選ぶ。' : cls() !== 'adventurer' ? `いまの職は${data.classes[cls()]?.name}。転職はもう済んでいる。` : `転職はレベル ${CLASS_CHANGE_LEVEL} から。いまはレベル ${lv}。`));
      const grid = h('div', { class: 'cc-grid' });
      for (const [id, c] of Object.entries(data.classes)) {
        if (id === 'adventurer') continue;
        if (pick && pick !== id) continue;
        const first = (c.skills || []).slice(0, 3).map((s) => data.skills[s]?.name).filter(Boolean).join('、');
        const btn = h('button', { type: 'button', class: 'primary', disabled: !can || null }, `${c.name}になる`);
        let armed = false;
        btn.addEventListener('click', () => {
          if (!armed) { armed = true; btn.textContent = 'もう一度押すと決まる'; btn.classList.add('armed'); setTimeout(() => { armed = false; btn.textContent = `${c.name}になる`; btn.classList.remove('armed'); }, 3000); return; }
          send({ t: 'classChange', cls: id });
          panels.hide('classChange');
        });
        grid.append(h('article', { class: `cc-card${pick === id ? ' picked' : ''}` }, h('h3', {}, c.name), h('p', {}, c.desc || ''), h('div', { class: 'cc-stats' }, `力 ${c.base?.str ?? '?'}　器用 ${c.base?.dex ?? '?'}　知恵 ${c.base?.int ?? '?'}　体力 ${c.base?.vit ?? '?'}`), first ? h('div', { class: 'cc-skills' }, `覚えるスキル: ${first} など`) : null, btn));
      }
      body.append(grid);
    },
  });

  /* ================= モーダル ================= */
  function modal(id, { title, closedby = 'closerequest' }) {
    const titleId = `${id}-title`;
    const body = h('div', { class: 'modal-body' });
    const d = h('dialog', { id, class: `modal modal-${id}`, 'aria-labelledby': titleId, closedby }, h('h2', { id: titleId }, title), body);
    document.body.append(d);
    return { d, body };
  }
  const settingsDlg = modal('settings', { title: '設定' });
  settingsDlg.d.addEventListener('close', () => { log('ui.settings.close', {}); actions.afterSettings(); });
  function openSettings() {
    const b = settingsDlg.body;
    const scale = h('select', { id: 'set-scale' }, [['auto', '自動'], ['2', '2 倍'], ['3', '3 倍'], ['4', '4 倍'], ['5', '5 倍'], ['6', '6 倍']].map(([v, t]) => h('option', { value: v, selected: settings.get('scale') === v || null }, t)));
    scale.addEventListener('change', () => { settings.set('scale', scale.value); actions.resize(); });
    const keys = [['左クリック', '歩く・攻撃・拾う・話す・出入口に入る（押したままで歩き続ける）'], ['Shift＋左クリック', 'その場で攻撃'], ['右クリック・1〜6', 'スキル（カーソルの位置へ）'], ['Z・X', '回復薬・魔力の薬'], ['T', '帰還の巻物で町へ帰る'], ['Q・E', '視点を回す'], ['C・I・S・P・M・J', '能力値・持ち物・スキル・ツリー・地図・依頼'], ['Esc', '窓を閉じる・世界を止める']];
    const close = h('button', { type: 'button', class: 'primary', autofocus: true }, '閉じる');
    close.addEventListener('click', () => settingsDlg.d.close());
    clear(b).append(
      h('div', { class: 'field' }, h('label', { for: 'set-scale' }, '絵の大きさ'), scale),
      h('h3', {}, 'キー操作'),
      h('dl', { class: 'keys' }, keys.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('p', { class: 'hint' }, 'キャラはこのブラウザの中（localStorage）に保存します。別のブラウザへ移すときは、止めた画面の「書き出す」でファイルにします。'),
      h('div', { class: 'row end' }, close));
    settingsDlg.d.showModal();
    log('ui.settings.open', {});
  }

  const deathDlg = modal('death', { title: '倒れた', closedby: 'none' });
  deathDlg.d.addEventListener('cancel', (e) => e.preventDefault());
  function openDeath(text) {
    const btn = h('button', { type: 'button', class: 'primary', autofocus: true }, '町の宿で目を覚ます');
    btn.addEventListener('click', () => { send({ t: 'respawn' }); deathDlg.d.close(); });
    clear(deathDlg.body).append(h('p', {}, text || '体力が尽きた。'), h('p', { class: 'hint' }, '倒れると、いまのレベルの経験値の 5% を失う。レベルは下がらない。'), h('div', { class: 'row end' }, btn));
    if (!deathDlg.d.open) deathDlg.d.showModal();
  }
  const closeDeath = () => { if (deathDlg.d.open) deathDlg.d.close(); };

  return {
    providers,
    setDialog(m) { dialogState = m; panels.show('talk'); },
    setShop(m) { shopState = m; panels.hide('talk'); panels.show('shop'); },
    refreshShop() { panels.refresh('shop'); },
    openSettings, openDeath, closeDeath,
    get settingsOpen() { return settingsDlg.d.open; },
    get modalOpen() { return settingsDlg.d.open || deathDlg.d.open; },
    closeTalk() { panels.hide('talk'); },
    get dragging() { return !!drag?.started; },
  };
}
