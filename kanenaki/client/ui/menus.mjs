// 題名の画面（3 つの枠から選ぶ・新しく始める・書き出す・読み込む・消す）と、止めた画面（Esc）。
// どちらも <dialog> の showModal。止めた画面は Esc（closedby="closerequest"）で閉じて続きへ戻る。
// 保存の読み書きそのものは main.mjs が行い、ここは画面と押したときの知らせだけを持つ。
import { h, clear } from './dom.mjs';
import { slotSummary } from '../save.mjs';
import { SAVE_SLOTS } from '../../shared/schema.mjs';

const LORE = '七つの鐘が同時に砕けた夜から、鐘楼の地下に魔物があふれ出した。最後に残った灰鐘の町から、鐘のかけらを探して地の底へ降りていく。';
const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function createMenus({ data, log, on }) {
  /* ================= 題名の画面 ================= */
  const titleId = 'title-heading';
  const titleBody = h('div', { class: 'modal-body' });
  const title = h('dialog', { id: 'title', class: 'modal modal-title', 'aria-labelledby': titleId, closedby: 'none' }, h('h2', { id: titleId }, '鐘なき王国'), titleBody);
  title.addEventListener('cancel', (e) => e.preventDefault());
  // closedby="none" と cancel の preventDefault が効かないブラウザで閉じられたときは、遊び始めるまで開き直す
  let started = false;
  title.addEventListener('close', () => { if (!started) queueMicrotask(() => { if (!title.open && !started) title.showModal(); }); });
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-hidden': 'true' });
  document.body.append(title, fileInput);
  let importSlot = null, busy = false, note = '';
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f || importSlot == null) return;
    log('ui.title.importFile', { slot: importSlot, name: f.name, size: f.size });
    const text = await f.text();
    on.importSlot(importSlot, text);
  });

  function renderSlots(save, message = '') {
    busy = false;
    note = message;
    const list = h('ol', { class: 'slots', 'aria-label': 'キャラの枠' });
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const sum = slotSummary(save.slots[i], data);
      const li = h('li', { class: `slot-card${sum ? '' : ' empty'}${save.last === i ? ' last' : ''}` });
      li.append(h('div', { class: 'slot-no', 'aria-hidden': 'true' }, String(i + 1)));
      if (sum) {
        const go = h('button', { type: 'button', class: 'primary', dataset: { act: 'continue', slot: i } }, '続きから');
        go.addEventListener('click', () => { if (busy) return; busy = true; go.disabled = true; go.textContent = '支度をしています…'; on.continueSlot(i); });
        const exp = h('button', { type: 'button', dataset: { act: 'export', slot: i } }, '書き出す');
        exp.addEventListener('click', () => on.exportSlot(i));
        const del = h('button', { type: 'button', class: 'danger', dataset: { act: 'delete', slot: i } }, '消す');
        let armed = false;
        del.addEventListener('click', () => {
          if (!armed) { armed = true; del.textContent = 'もう一度押すと消える'; del.classList.add('armed'); setTimeout(() => { armed = false; del.textContent = '消す'; del.classList.remove('armed'); }, 3000); return; }
          on.deleteSlot(i);
        });
        li.append(h('div', { class: 'slot-info' },
          h('div', { class: 'slot-name' }, sum.name),
          h('div', { class: 'slot-meta' }, `${sum.cls}　Lv ${sum.level}　${sum.place}`),
          h('div', { class: 'slot-time' }, sum.savedAt ? `保存 ${fmtTime(sum.savedAt)}` : '')),
        h('div', { class: 'slot-buttons' }, go, exp, del));
        if (save.last === i) queueMicrotask(() => go.focus());
      } else {
        const make = h('button', { type: 'button', class: 'primary', dataset: { act: 'new', slot: i } }, '新しく始める');
        make.addEventListener('click', () => { if (busy) return; busy = true; make.disabled = true; on.newSlot(i); });
        const imp = h('button', { type: 'button', dataset: { act: 'import', slot: i } }, '読み込む');
        imp.addEventListener('click', () => { importSlot = i; fileInput.click(); });
        li.append(h('div', { class: 'slot-info' }, h('div', { class: 'slot-name' }, 'あき'), h('div', { class: 'slot-meta' }, 'まだキャラがいない')), h('div', { class: 'slot-buttons' }, make, imp));
      }
      list.append(li);
    }
    clear(titleBody).append(...[
      h('p', { class: 'lore' }, LORE),
      list,
      note ? h('p', { class: 'title-note', role: 'status' }, note) : null,
      h('p', { class: 'hint' }, 'キャラはこのブラウザの中に保存します（30 秒ごと、場所を移ったとき、タブを隠したとき、閉じるとき）。別のブラウザへ移すときは「書き出す」でファイルにし、向こうで「読み込む」。'),
    ].filter(Boolean));
    if (!title.open) title.showModal();
  }
  let pickedName = null;
  function renderNames(list) {
    pickedName = list?.includes(pickedName) ? pickedName : list?.[0] ?? null;
    const fs = h('fieldset', { class: 'names' }, h('legend', {}, '名前を選ぶ'));
    (list || []).forEach((n, i) => {
      const r = h('input', { type: 'radio', name: 'cand', value: n, id: `cand-${i}`, checked: n === pickedName || null });
      r.addEventListener('change', () => { pickedName = n; });
      fs.append(h('label', { for: `cand-${i}`, class: 'name-opt' }, r, h('span', {}, n)));
    });
    const reroll = h('button', { type: 'button', dataset: { act: 'reroll' } }, 'ほかの候補');
    reroll.addEventListener('click', () => on.reroll());
    const start = h('button', { type: 'button', class: 'primary', dataset: { act: 'create' }, disabled: !list?.length || null }, 'この名前で始める');
    start.addEventListener('click', () => { if (!pickedName) return; start.disabled = true; start.textContent = '支度をしています…'; on.create(pickedName); });
    clear(titleBody).append(h('p', { class: 'lore' }, LORE), fs, h('p', { class: 'hint' }, '名前は候補から選ぶ。職業は冒険者から始まり、レベル 10 で転職の試験を受けられる。'), h('div', { class: 'row end' }, reroll, start));
    if (!title.open) title.showModal();
    titleBody.querySelector('input[type=radio]:checked')?.focus();
  }
  function renderMessage(text) {
    clear(titleBody).append(h('p', { class: 'lore' }, text));
    if (!title.open) title.showModal();
  }

  /* ================= 止めた画面 ================= */
  const pauseId = 'pause-heading';
  const pauseBody = h('div', { class: 'modal-body' });
  const pause = h('dialog', { id: 'pause', class: 'modal modal-pause', 'aria-labelledby': pauseId, closedby: 'closerequest' }, h('h2', { id: pauseId }, '止めています'), pauseBody);
  document.body.append(pause);
  pause.addEventListener('close', () => { log('ui.pause.close', {}); on.resume(); });
  function openPause() {
    const btn = (label, act, fn, cls = '') => { const b = h('button', { type: 'button', class: cls, dataset: { act }, autofocus: act === 'resume' || null }, label); b.addEventListener('click', fn); return b; };
    clear(pauseBody).append(
      h('p', {}, '世界の時間は止まっています。魔物も動きません。'),
      h('div', { class: 'pause-buttons' },
        btn('続ける', 'resume', () => pause.close(), 'primary'),
        btn('今すぐ保存する', 'save', () => on.saveNow()),
        btn('ファイルに書き出す', 'export', () => on.exportCurrent()),
        btn('設定', 'settings', () => on.settings()),
        btn('保存して題名へ戻る', 'quit', () => on.quit())),
      h('p', { class: 'hint' }, 'Esc でも続きへ戻ります。'));
    if (!pause.open) pause.showModal(); // 続けるボタンに autofocus
    log('ui.pause.open', {});
  }

  return {
    renderSlots, renderNames, renderMessage,
    closeTitle() { started = true; if (title.open) title.close(); },
    get titleOpen() { return title.open; },
    openPause, closePause() { if (pause.open) pause.close(); },
    get pauseOpen() { return pause.open; },
  };
}
