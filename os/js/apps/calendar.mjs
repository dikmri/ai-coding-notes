// カレンダー: 月の表（日曜はじまり）、日本の祝日（1991〜2099年）、予定の追加・変更・削除。
// 予定は仮想ドライブの /ドキュメント/予定.json に保存し、時刻の知らせはシェルが見張る（窓を閉じていても鳴る）。
// 日付は「YYYY-MM-DD」、時刻は「HH:MM」の文字で持つ。計算は core/calendar.mjs（テストは tests/os-calendar.test.mjs）。
import * as C from '../core/calendar.mjs';
import { spatialKeys, rove } from '../spatial.mjs';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  const open = wm.list().find((w) => w.app === 'calendar');
  if (open) { if (open.min) open.restore(); open.focus(); if (args.date) open.goto?.(args.date, args.id); return open; }
  const today = () => C.localNow(new Date()).date;
  let sel = C.parseYmd(args.date) ? args.date : today(), view = C.parseYmd(sel), events = [], editId = args.id || null, lastMsg = '';
  const win = wm.open({
    app: 'calendar', icon: 'icons/calendar.svg', className: 'app-calendar', title: 'カレンダー', w: 760, h: 520, ...rect, args: {},
    render(w) {
      w.body.innerHTML = `<div class="cal-main">
        <section class="cal-left" aria-label="月の表">
          <div class="cal-head"><button type="button" data-nav="-1" aria-label="前の月">◀ 前の月</button><h2 class="cal-title" data-title aria-live="polite"></h2><button type="button" data-nav="1" aria-label="次の月">次の月 ▶</button><button type="button" data-today>今日(<u>T</u>)</button></div>
          <div class="cal-dows" aria-hidden="true">${WEEK.map((d, i) => `<span class="cal-dow dow${i}">${d}</span>`).join('')}</div>
          <div class="cal-grid" role="grid" aria-label="日付" data-grid></div>
        </section>
        <section class="cal-right" aria-label="選んだ日の予定">
          <h3 class="cal-day-title" data-daytitle></h3>
          <ul class="list cal-events" data-events aria-label="この日の予定"></ul>
          <fieldset class="cal-form"><legend data-legend>新しい予定</legend>
            <div class="cal-row"><label for="calTime">時刻(<u>J</u>):</label><input type="time" id="calTime"><span class="cal-hint">空なら終日</span></div>
            <div class="cal-row"><label for="calTitle">題名(<u>I</u>):</label><input type="text" id="calTitle" maxlength="200" autocomplete="off"></div>
            <div class="cal-row"><label for="calMemo">メモ(<u>M</u>):</label><textarea id="calMemo" rows="3"></textarea></div>
            <label class="cal-check"><input type="checkbox" id="calNotify"> 時刻に知らせる(<u>K</u>)</label>
            <div class="button-row"><button type="button" class="default" data-save>保存(<u>S</u>)</button><button type="button" data-new>新しい予定(<u>N</u>)</button><button type="button" data-del>削除(<u>D</u>)</button></div>
          </fieldset>
        </section>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:170px">予定は /ドキュメント/予定.json</div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const grid = q('[data-grid]');
  function say(t) { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; q('.status-field[data-status]').textContent = m; }

  async function load() {
    try { events = (await fs.exists(C.FILE)) ? C.normalizeEvents(await fs.readJSON(C.FILE)) : []; }
    catch (e) { events = []; say('予定.json を読めませんでした。新しく保存すると作り直します。'); log('calendar.load', {}, 'error: ' + e.message); }
  }
  async function save() {
    await fs.write(C.FILE, JSON.stringify({ version: 1, events }, null, 1), 'application/json');
    os.events.dispatchEvent(new CustomEvent('calendar')); // シェルの見張りに、すぐ読み直してもらう
  }

  /* ---------- 月の表 ---------- */
  function renderGrid() {
    const { y, m } = view, t = today();
    q('[data-title]').textContent = `${y}年${m}月`;
    grid.innerHTML = C.monthGrid(y, m).map((row) => `<div class="cal-week" role="row">${row.map((c) => {
      const hol = C.holidayName(c.date), list = C.eventsOn(events, c.date), p = C.parseYmd(c.date);
      const cls = ['flat', 'cal-day', 'dow' + c.dow, c.inMonth ? '' : 'out', hol ? 'hol' : '', c.date === t ? 'today' : '', c.date === sel ? 'sel' : ''].filter(Boolean).join(' ');
      const label = `${p.m}月${p.d}日（${WEEK[c.dow]}）${hol ? ' ' + hol : ''}${list.length ? ` 予定 ${list.length} 件` : ''}`;
      return `<button type="button" role="gridcell" class="${cls}" data-date="${c.date}" aria-selected="${c.date === sel}" aria-label="${esc(label)}" tabindex="-1"><span class="cal-num">${p.d}</span>${hol ? `<span class="cal-hol">${esc(hol)}</span>` : ''}${list.slice(0, 2).map((e) => `<span class="cal-ev">${esc((e.time ? e.time + ' ' : '') + (e.title || '（題名なし）'))}</span>`).join('')}${list.length > 2 ? `<span class="cal-more">ほか ${list.length - 2} 件</span>` : ''}</button>`;
    }).join('')}</div>`).join('');
    const cur = grid.querySelector(`[data-date="${sel}"]`) || grid.querySelector('.cal-day:not(.out)');
    if (cur) rove(grid, '.cal-day', cur);
  }
  function renderDay() {
    const p = C.parseYmd(sel), hol = C.holidayName(sel), list = C.eventsOn(events, sel);
    q('[data-daytitle]').textContent = `${p.y}年${p.m}月${p.d}日（${WEEK[C.weekday(p.y, p.m, p.d)]}）${hol ? '　' + hol : ''}`;
    q('[data-events]').innerHTML = list.map((e) => `<li><button type="button" class="flat cal-evbtn${e.id === editId ? ' cur' : ''}" data-id="${e.id}"><span class="cal-evtime">${e.time || '終日'}</span><span class="cal-evtitle">${esc(e.title || '（題名なし）')}</span>${e.notify && e.time ? '<span class="cal-bell" title="時刻に知らせます">◆</span>' : ''}</button></li>`).join('') || '<li class="cal-empty">この日の予定はありません。</li>';
    fillForm(list.find((e) => e.id === editId) || null);
  }
  function fillForm(e) {
    editId = e ? e.id : null;
    q('[data-legend]').textContent = e ? '予定を直す' : '新しい予定';
    q('#calTime').value = e?.time || ''; q('#calTitle').value = e?.title || ''; q('#calMemo').value = e?.memo || ''; q('#calNotify').checked = !!e?.notify;
    q('[data-del]').disabled = !e;
  }
  function select(date, { focus = false, sound: snd = true } = {}) {
    sel = date; const p = C.parseYmd(date);
    if (p.y !== view.y || p.m !== view.m) view = { y: p.y, m: p.m, d: 1 };
    editId = null; renderGrid(); renderDay();
    if (focus) grid.querySelector(`[data-date="${sel}"]`)?.focus();
    if (snd) sound.play('key', p.d % 10);
  }
  win.goto = (date, id) => { if (!C.parseYmd(date)) return; select(date, { sound: false }); if (id) { editId = id; renderDay(); } };
  grid.addEventListener('click', (e) => { const b = e.target.closest('.cal-day'); if (b) select(b.dataset.date, { focus: true }); });
  grid.addEventListener('dblclick', (e) => { if (e.target.closest('.cal-day')) q('#calTitle').focus(); });
  spatialKeys(grid, '.cal-day', (b) => select(b.dataset.date, { focus: true }));
  grid.addEventListener('keydown', (e) => {
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); const [y, m] = C.addMonths(view.y, view.m, e.key === 'PageUp' ? -1 : 1); const d = Math.min(C.parseYmd(sel).d, C.daysInMonth(y, m)); select(C.ymd(y, m, d), { focus: true }); }
    if (e.key === 'Enter' && e.target.closest('.cal-day')) { e.preventDefault(); q('#calTitle').focus(); }
  });
  win.body.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => { const [y, m] = C.addMonths(view.y, view.m, +b.dataset.nav); select(C.ymd(y, m, 1)); }));
  q('[data-today]').addEventListener('click', () => select(today(), { focus: true }));

  /* ---------- 予定 ---------- */
  q('[data-events]').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (!b) return; editId = b.dataset.id; renderDay(); sound.play('select'); q('#calTitle').focus(); });
  q('[data-new]').addEventListener('click', () => { fillForm(null); renderDay(); q('#calTime').focus(); });
  q('[data-save]').addEventListener('click', async () => {
    const title = q('#calTitle').value.trim(), time = q('#calTime').value, memo = q('#calMemo').value, notify = q('#calNotify').checked;
    if (!title) { sound.play('error'); say('題名を書いてください。'); q('#calTitle').focus(); return; }
    if (notify && !time) { sound.play('error'); say('知らせるには、時刻を決めてください。'); q('#calTime').focus(); return; }
    const old = events.find((e) => e.id === editId);
    if (old) Object.assign(old, { time, title, memo, notify });
    else { const e = { id: C.newId(), date: sel, time, title, memo, notify }; events.push(e); editId = e.id; }
    try { await save(); } catch (err) { os.msgbox({ title: 'カレンダー', text: err.message, icon: 'error' }); log('calendar.save', {}, 'error: ' + err.message); return; }
    renderGrid(); renderDay(); sound.play('pin');
    say(`${old ? '予定を直しました' : '予定を足しました'}: ${time || '終日'} ${title}${notify ? '（時刻に知らせます）' : ''}`);
    log('calendar.save', { date: sel, time, notify, edit: !!old }, 'ok');
  });
  q('[data-del]').addEventListener('click', async () => {
    const e = events.find((x) => x.id === editId); if (!e) return;
    const a = await os.msgbox({ title: 'カレンダー', text: `「${e.title || '（題名なし）'}」を削除しますか?\n\n削除した予定は元に戻せません。`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
    if (a !== 'はい') return;
    events = events.filter((x) => x.id !== e.id); editId = null;
    await save(); renderGrid(); renderDay(); sound.play('trash'); say('予定を削除しました。');
    log('calendar.delete', { id: e.id }, 'ok');
  });
  // ほかの所（端末など）で予定.json が書き換わったら読み直す
  const onFs = async (e) => { if ((e.detail.dirs || []).includes('/ドキュメント')) { await load(); renderGrid(); renderDay(); } };
  fs.fs.addEventListener('change', onFs);
  win.cleanup = () => fs.fs.removeEventListener('change', onFs);
  await load();
  renderGrid(); renderDay();
  grid.querySelector(`[data-date="${sel}"]`)?.focus({ preventScroll: true });
  say(`予定 ${events.length} 件。矢印キーで日を動き、PageUp・PageDown で月を変えます。`);
  log('calendar.open', { events: events.length, date: sel }, 'ok');
  return win;
}
