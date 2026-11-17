// 時計とタイマー: 時計（アナログとデジタル）、タイマー、ストップウォッチ。窓は1つだけ開く。
// 時間はいつも「始めた時刻」との差で数える（窓が裏にあって処理が間引かれても遅れない）。計算は core/clock.mjs。
// タイマーが 0 になると、窓が最小化されていても前に出し、チャイムを鳴らす（消音のときは画面だけで知らせる）。
import * as K from '../core/clock.mjs';

const PREF = 'fos-clock';
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const loadPref = () => { try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch { return {}; } };
const savePref = (p) => { try { localStorage.setItem(PREF, JSON.stringify({ ...loadPref(), ...p })); } catch { /* 保存できない */ } };

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  const open = wm.list().find((w) => w.app === 'clock');
  if (open) { if (open.min) open.restore(); open.focus(); if (typeof args.tab === 'number') open.selectTab?.(args.tab); return open; }
  const pref = loadPref();
  let tm = K.timer(pref.timerMs || 180_000), sw = K.stopwatch(), lastSec = null, raf = 0, iv = 0, lastLabel = '';
  const win = wm.open({
    app: 'clock', icon: 'icons/clock.svg', className: 'app-clock', title: '時計とタイマー', w: 400, h: 470, ...rect, args: {},
    render(w) {
      w.body.innerHTML = `<div class="clock-wrap"><div class="tabs">
        <div class="tab-list" role="tablist"><button type="button" class="tab" aria-selected="true">時計</button><button type="button" class="tab">タイマー</button><button type="button" class="tab">ストップウォッチ</button></div>
        <div class="tab-page clock-page">
          <canvas class="clock-face" width="220" height="220" role="img" aria-label="アナログ時計"></canvas>
          <div class="big-time" data-now></div>
          <div class="clock-date" data-date></div>
        </div>
        <div class="tab-page clock-page" hidden>
          <div class="big-time" role="timer" aria-label="タイマーの残り時間" data-left></div>
          <div class="meter" aria-hidden="true"><i data-meter></i></div>
          <div class="timer-set">
            <label for="tmMin">分(<u>M</u>):</label><input type="number" id="tmMin" min="0" max="99" inputmode="numeric">
            <label for="tmSec">秒(<u>S</u>):</label><input type="number" id="tmSec" min="0" max="59" inputmode="numeric">
          </div>
          <div class="preset-row" role="group" aria-label="すぐに決める長さ">${[1, 3, 5, 10].map((m) => `<button type="button" class="flat preset" data-preset="${m}">${m}分</button>`).join('')}</div>
          <div class="button-row"><button type="button" class="default" data-tm-go>開始(<u>T</u>)</button><button type="button" data-tm-reset>リセット(<u>R</u>)</button></div>
        </div>
        <div class="tab-page clock-page" hidden>
          <div class="big-time" role="timer" aria-label="ストップウォッチの経過時間" data-sw></div>
          <div class="button-row"><button type="button" class="default" data-sw-go>開始(<u>T</u>)</button><button type="button" data-sw-lap disabled>ラップ(<u>L</u>)</button><button type="button" data-sw-reset>リセット(<u>R</u>)</button></div>
          <div class="lap-head"><span>ラップ</span><button type="button" data-sw-save disabled>CSV で保存(<u>S</u>)...</button></div>
          <div class="lap-box"><table class="details laps"><thead><tr><th>番号</th><th>ラップ</th><th>経過</th></tr></thead><tbody data-laps></tbody></table></div>
        </div>
      </div></div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      if (!tm.running && !sw.running) return true;
      const what = tm.running && sw.running ? 'タイマーとストップウォッチ' : tm.running ? 'タイマー' : 'ストップウォッチ';
      const a = await os.msgbox({ title: '時計とタイマー', text: `${what}が動いています。\n\n閉じると止まります。閉じますか?`, icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      return a === 'はい';
    },
  });
  const q = (s) => win.body.querySelector(s);
  const tabs = [...win.body.querySelectorAll('.tab')];
  win.selectTab = (i) => { if (tabs[i]) w95.selectTab(tabs[i]); };
  const say = (t) => { q('[data-status]').textContent = t; };
  const face = q('.clock-face'), ctx = face.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- 時計 ---------- */
  function drawFace(d) {
    const css = 220, dpr = Math.min(3, devicePixelRatio || 1);
    if (face.width !== css * dpr) { face.width = face.height = css * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);
    const c = css / 2, R = 98, cs = getComputedStyle(win.el);
    const col = (v, f) => cs.getPropertyValue(v).trim() || f;
    const ink = col('--fos-ink', '#241734'), marble = col('--fos-marble', '#f4eef8'), paper = col('--fos-paper', '#fffdf9');
    // 縁（ミントからピンク）と文字盤
    const g = ctx.createLinearGradient(0, 0, css, css); g.addColorStop(0, col('--fos-aqua', '#6bf2e3')); g.addColorStop(1, col('--fos-sunset', '#ff8ec7'));
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, R - 10, 0, Math.PI * 2); ctx.fillStyle = paper; ctx.fill(); ctx.stroke();
    // 目盛り（時は太く、3・6・9・12 は菱形）
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2, sx = Math.sin(a), sy = -Math.cos(a);
      if (i % 15 === 0) {
        const x = c + sx * (R - 22), y = c + sy * (R - 22);
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 5, y); ctx.closePath();
        ctx.fillStyle = col('--fos-lavender', '#cfaeff'); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = ink; ctx.stroke();
      } else {
        const r0 = i % 5 === 0 ? R - 24 : R - 17;
        ctx.beginPath(); ctx.moveTo(c + sx * r0, c + sy * r0); ctx.lineTo(c + sx * (R - 13), c + sy * (R - 13));
        ctx.lineWidth = i % 5 === 0 ? 3 : 1; ctx.strokeStyle = ink; ctx.stroke();
      }
    }
    // 針（動きを減らす設定のときは、秒針を1秒ずつ進める）
    const h = K.hands(reduce.matches ? new Date(Math.floor(d.getTime() / 1000) * 1000) : d);
    const hand = (a, len, w, color, tail = 0) => { ctx.beginPath(); ctx.moveTo(c - Math.sin(a) * tail, c + Math.cos(a) * tail); ctx.lineTo(c + Math.sin(a) * len, c - Math.cos(a) * len); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.stroke(); };
    hand(h.h, R * 0.5, 7, ink); hand(h.m, R * 0.74, 4.5, ink);
    hand(h.s, R * 0.8, 2, col('--fos-rose', '#ff5c97'), 16);
    ctx.beginPath(); ctx.arc(c, c, 6, 0, Math.PI * 2); ctx.fillStyle = col('--fos-apricot', '#ffd37a'); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.stroke();
    ctx.fillStyle = marble;
  }
  function drawClock(now) {
    const d = new Date(now);
    drawFace(d);
    q('[data-now]').textContent = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    q('[data-date]').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`;
    const label = `アナログ時計 ${d.getHours()}時${d.getMinutes()}分`;
    if (label !== lastLabel) { face.setAttribute('aria-label', label); lastLabel = label; }
  }

  /* ---------- タイマー ---------- */
  const minIn = q('#tmMin'), secIn = q('#tmSec');
  const showInputs = () => { minIn.value = Math.floor(tm.dur / 60000); secIn.value = Math.floor((tm.dur % 60000) / 1000); };
  // keepInputs: 打っている途中は欄を書き換えない（75 秒を 1 分 15 秒に直すのは、欄を離れたとき）
  function setDuration(ms, keepInputs = false) {
    if (tm.running) return;
    tm = K.timer(ms); savePref({ timerMs: ms }); if (!keepInputs) showInputs(); drawTimer(Date.now());
  }
  function drawTimer(now) {
    const left = K.timerLeft(tm, now);
    q('[data-left]').textContent = K.fmtLeft(left);
    q('[data-meter]').style.width = (tm.dur ? (left / tm.dur) * 100 : 0) + '%';
    q('[data-tm-go]').innerHTML = tm.running ? '一時停止(<u>T</u>)' : left < tm.dur && left > 0 ? '再開(<u>T</u>)' : '開始(<u>T</u>)';
    minIn.disabled = secIn.disabled = tm.running;
    win.body.querySelectorAll('[data-preset]').forEach((b) => { b.disabled = tm.running; });
  }
  async function timerFinished() {
    tm = K.timerReset(tm);
    drawTimer(Date.now());
    sound.play('chime');
    log('clock.timer', { dur: tm.dur }, 'done');
    if (win.min) await win.restore();
    win.focus(); win.selectTab(1);
    say('タイマーが終わりました。');
    os.msgbox({ title: '時計とタイマー', icon: 'info', text: `${K.fmt(tm.dur)} のタイマーが終わりました。` });
  }
  q('[data-tm-go]').addEventListener('click', () => {
    const now = Date.now();
    if (tm.running) { tm = K.timerPause(tm, now); say('一時停止しました。'); log('clock.timer', { left: tm.left }, 'pause'); }
    else {
      if (tm.left === tm.dur) { const ms = K.duration(minIn.value, secIn.value); if (ms !== tm.dur) { tm = K.timer(ms); savePref({ timerMs: ms }); } }
      if (tm.left <= 0) { sound.play('error'); say('長さを 1 秒以上にしてください。'); return; }
      tm = K.timerStart(tm, now); lastSec = null; say(`${K.fmtLeft(tm.left)} のタイマーを始めました。`); log('clock.timer', { left: tm.left }, 'start');
    }
    drawTimer(now);
  });
  q('[data-tm-reset]').addEventListener('click', () => { tm = K.timerReset(tm); drawTimer(Date.now()); say('リセットしました。'); log('clock.timer', {}, 'reset'); });
  q('.preset-row').addEventListener('click', (e) => { const b = e.target.closest('[data-preset]'); if (b) { setDuration(+b.dataset.preset * 60000); sound.play('select'); } });
  for (const el of [minIn, secIn]) {
    // 欄に入ったら中の数字を全部選ぶ（打つと置き換わり、元の数字が残って「50」のようにならない）。Gemini の操作の確認で見つけた
    el.addEventListener('focus', () => requestAnimationFrame(() => el.select()));
    // 打つたびに上の大きな表示を合わせ、欄を離れたら分と秒を整える
    el.addEventListener('input', () => setDuration(K.duration(minIn.value, secIn.value), true));
    el.addEventListener('change', () => setDuration(K.duration(minIn.value, secIn.value)));
  }

  /* ---------- ストップウォッチ ---------- */
  function drawSw(now) {
    q('[data-sw]').textContent = K.fmt(K.swElapsed(sw, now), { cs: true });
    q('[data-sw-go]').innerHTML = sw.running ? '停止(<u>T</u>)' : sw.acc ? '再開(<u>T</u>)' : '開始(<u>T</u>)';
    q('[data-sw-lap]').disabled = !sw.running;
    q('[data-sw-save]').disabled = !sw.laps.length;
  }
  function drawLaps() {
    const best = sw.laps.length > 1 ? Math.min(...sw.laps.map((l) => l.lap)) : -1;
    q('[data-laps]').innerHTML = sw.laps.slice().reverse().map((l) => `<tr${l.lap === best ? ' class="best" title="いちばん速いラップ"' : ''}><td>${l.n}</td><td>${K.fmt(l.lap, { cs: true })}</td><td>${K.fmt(l.total, { cs: true })}</td></tr>`).join('');
  }
  q('[data-sw-go]').addEventListener('click', () => {
    const now = Date.now();
    sw = sw.running ? K.swStop(sw, now) : K.swStart(sw, now);
    log('clock.sw', { elapsed: K.swElapsed(sw, now) }, sw.running ? 'start' : 'stop');
    drawSw(now);
  });
  q('[data-sw-lap]').addEventListener('click', () => { const now = Date.now(); sw = K.swLap(sw, now); sound.play('count'); drawLaps(); drawSw(now); log('clock.sw', { lap: sw.laps.at(-1) }, 'lap'); });
  q('[data-sw-reset]').addEventListener('click', () => { sw = K.swReset(); drawLaps(); drawSw(Date.now()); log('clock.sw', {}, 'reset'); });
  q('[data-sw-save]').addEventListener('click', async () => {
    const stamp = new Date().toLocaleDateString('ja-JP').replace(/\//g, '-');
    const p = await os.fileDialog({ mode: 'save', dir: '/ドキュメント', name: `ラップ ${stamp}.csv`, exts: ['.csv'], typeLabel: 'CSV データ' });
    if (!p) return;
    try { await fs.write(p, K.lapsToCsv(sw.laps), 'text/csv;charset=utf-8'); os.addRecent(p); say(`「${p}」に保存しました。`); log('clock.sw.save', { path: p, laps: sw.laps.length }, 'ok'); }
    catch (e) { os.msgbox({ title: '時計とタイマー', text: e.message, icon: 'error' }); log('clock.sw.save', { path: p }, 'error: ' + e.message); }
  });

  /* ---------- 動かす ---------- */
  // 表示は描画のたびに更新する（最小化しているあいだは描かない）。終わりの判定は 250ms ごとの見回りで行い、裏のタブでも止まらない
  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (win.min || document.hidden) return;
    const now = Date.now();
    drawClock(now);
    if (tm.running) drawTimer(now);
    if (sw.running) q('[data-sw]').textContent = K.fmt(K.swElapsed(sw, now), { cs: true });
  };
  iv = setInterval(() => {
    if (!tm.running) return;
    const now = Date.now(), left = K.timerLeft(tm, now), sec = Math.ceil(left / 1000);
    if (K.timerDone(tm, now)) { timerFinished(); return; }
    if (sec !== lastSec && sec <= 10 && sec > 0) sound.play('count');
    lastSec = sec;
  }, 250);
  win.cleanup = () => { cancelAnimationFrame(raf); clearInterval(iv); };
  win.body.addEventListener('keydown', (e) => {
    if (e.target.matches('input') || e.ctrlKey || e.altKey || e.metaKey) return;
    const page = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); q(page === 2 ? '[data-sw-go]' : '[data-tm-go]').click(); }
    if ((e.key === 'l' || e.key === 'L') && page === 2 && sw.running) q('[data-sw-lap]').click();
  });
  showInputs(); drawTimer(Date.now()); drawSw(Date.now()); drawLaps(); drawClock(Date.now());
  frame();
  if (typeof args.tab === 'number') win.selectTab(args.tab);
  log('clock.open', { tab: args.tab ?? 0 }, 'ok');
  return win;
}
