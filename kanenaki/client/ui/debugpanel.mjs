// 確かめ用の窓（?debug=1 のときだけ。F2 か右上の「確かめ」で開く）。世界の計算の debug 命令を送る。
import { h, clear } from './dom.mjs';

export function createDebugPanel({ panels, game, data, link, log }) {
  const G = game.g;
  const dbg = (op, args = {}) => { log('ui.debug', { op, ...args }); return link.send({ t: 'debug', op, ...args }); };
  const sel = (id, opts) => h('select', { id }, opts.map(([v, t]) => h('option', { value: v }, t)));
  const btn = (label, fn) => { const b = h('button', { type: 'button' }, label); b.addEventListener('click', fn); return b; };
  const row = (label, ...kids) => h('div', { class: 'dbg-row' }, h('span', { class: 'dbg-label' }, label), ...kids);

  panels.define('debug', {
    title: '確かめ用', key: 'F2', place: 'right', width: '360px',
    build(body) {
      if (body.firstChild) return;
      const lv = h('input', { type: 'number', min: '1', max: '99', value: '10', id: 'dbg-lv', 'aria-label': 'レベル' });
      const items = sel('dbg-item', [
        ...data.bases.map((b) => [b.id, `${b.name}（Lv${b.level}）`]),
        ...data.consumables.map((c) => [c.id, c.name]),
        ...data.uniques.map((u) => [u.id, `固有: ${u.name}`]),
      ]);
      const rar = sel('dbg-rar', [['rare', '希少'], ['magic', '魔法'], ['normal', '普通']]);
      const maps = sel('dbg-map', Object.values(data.maps).map((m) => [m.id, m.name]));
      const cls = sel('dbg-cls', Object.entries(data.classes).map(([id, c]) => [id, c.name]));
      const quests = sel('dbg-quest', Object.values(data.quests).map((q) => [q.id, q.name]));
      const mons = sel('dbg-mon', Object.values(data.monsters).filter((m) => !m.minion).map((m) => [m.id, `${m.name}（Lv${m.level}）`]));
      clear(body).append(
        row('レベル', lv, btn('にする', () => dbg('level', { n: +lv.value })), btn('+1', () => dbg('level', { n: (G.me.level ?? 1) + 1 }))),
        row('品', items, rar, btn('出す', () => dbg('item', { id: items.value, rarity: rar.value, qty: 5 }))),
        row('場所', maps, btn('移る', () => dbg('warp', { map: maps.value }))),
        row('職', cls, btn('にする', () => dbg('cls', { cls: cls.value }))),
        row('依頼', quests, btn('報告できる', () => dbg('quest', { id: quests.value }))),
        row('魔物', mons, btn('3 体出す', () => dbg('spawn', { id: mons.value, n: 3 }))),
        row('時間', ...[1, 2, 4, 8].map((n) => btn(`×${n}`, () => dbg('speed', { n })))),
        row('そのほか', btn('お金 +1000', () => dbg('gold', { n: 1000 })), btn('点 +10', () => dbg('points', { skill: 10, passive: 10 })), btn('全回復', () => dbg('heal'))),
        row('', btn('倒れない', () => dbg('god', { on: true })), btn('倒れる', () => dbg('god', { on: false })), btn('近くの魔物を倒す', () => dbg('killAll', { r: 12 }))),
        h('p', { class: 'hint' }, '通し遊びの台本は window.__kanenaki.debug(op, args) で同じ命令を送る。'),
      );
    },
  });
  return { send: dbg };
}
