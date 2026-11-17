// システム モニタ: 窓（開いている窓の一覧と、前に出す・最小化・閉じる）、ドライブ（フォルダごとの使用量と大きいファイル。押すとファイル マネージャで開く）、
// 性能（1秒あたりの描き直しの回数の折れ線、JavaScript のメモリ）。窓は1つだけ開き、閉じると測るのを止める。計算は core/monitor.mjs。
import * as M from '../core/monitor.mjs';
import { dirname, basename } from '../core/path.mjs';

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  const open = wm.list().find((w) => w.app === 'monitor');
  if (open) { if (open.min) open.restore(); open.focus(); return open; }
  let raf = 0, iv = 0, samples = [], selId = null, beep = false, fpsNow = 0;
  const counter = M.fpsCounter();
  const win = wm.open({
    app: 'monitor', icon: 'icons/monitor.svg', className: 'app-monitor', title: 'システム モニタ', w: 600, h: 540, ...rect, args: {},
    render(w) {
      w.body.innerHTML = `<div class="mon-wrap"><div class="tabs">
        <div class="tab-list" role="tablist"><button type="button" class="tab" aria-selected="true">窓</button><button type="button" class="tab">ドライブ</button><button type="button" class="tab">性能</button></div>
        <div class="tab-page mon-page">
          <div class="mon-tablebox"><table class="details mon-wins"><thead><tr><th>アプリ</th><th>題名</th><th>状態</th></tr></thead><tbody data-wins></tbody></table></div>
          <div class="button-row mon-actions"><button type="button" data-w="focus">前に出す(<u>F</u>)</button><button type="button" data-w="min">最小化(<u>N</u>)</button><button type="button" data-w="close">閉じる(<u>C</u>)</button></div>
        </div>
        <div class="tab-page mon-page" hidden>
          <div class="mon-usage" data-usage>計算しています...</div>
          <div class="mon-bars" data-bars></div>
          <div class="mon-sub">大きいファイル（押すと、ファイル マネージャでその場所を開きます）</div>
          <ol class="list mon-big" data-big></ol>
          <div class="button-row" style="justify-content:flex-start"><button type="button" data-refresh>最新の情報に更新(<u>R</u>)</button></div>
        </div>
        <div class="tab-page mon-page" hidden>
          <canvas class="mon-chart" width="520" height="150" role="img" aria-label="1秒あたりの描き直しの回数の折れ線" data-chart></canvas>
          <dl class="mon-stats"><dt>描き直し</dt><dd data-fps>－</dd><dt>JavaScript のメモリ</dt><dd data-mem>－</dd><dt>開いている窓</dt><dd data-nwin>－</dd><dt>仮想ドライブのファイル</dt><dd data-nfile>－</dd></dl>
          <label class="mon-beep"><input type="checkbox" data-beep> 描き直しの回数を音の高さで聞く(<u>B</u>)</label>
        </div>
      </div></div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const tabs = [...win.body.querySelectorAll('.tab')];
  const page = () => tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
  const say = (t) => { q('.status-field[data-status]').textContent = t; };

  /* ---------- 窓 ---------- */
  function renderWins() {
    const list = wm.list(), act = wm.getActive(), body = q('[data-wins]');
    if (!list.find((w) => w.id === selId)) selId = null;
    body.innerHTML = list.map((w) => `<tr data-id="${w.id}" class="${w.id === selId ? 'selected' : ''}" aria-selected="${w.id === selId}" tabindex="-1"><td><img src="${w.icon || 'icons/app.svg'}" alt="" width="16" height="16"> ${esc(os.APPS[w.app]?.name || w.app)}</td><td>${esc(w.title || '')}</td><td>${M.winState(w, w === act)}</td></tr>`).join('');
    win.body.querySelectorAll('[data-w]').forEach((b) => { b.disabled = !selId; });
  }
  q('[data-wins]').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; selId = tr.dataset.id; renderWins(); sound.play('select'); });
  q('[data-wins]').addEventListener('dblclick', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) { selId = tr.dataset.id; act('focus'); } });
  function act(kind) {
    const w = wm.list().find((x) => x.id === selId); if (!w) return;
    if (kind === 'focus') { if (w.min) w.restore(); w.focus(); say(`「${w.title}」を前に出しました。`); }
    if (kind === 'min') { w.minimize(); say(`「${w.title}」を最小化しました。`); }
    if (kind === 'close') { w.close(); say(`「${w.title}」を閉じます。`); }
    log('monitor.window', { kind, app: w.app, title: w.title }, 'ok');
    setTimeout(renderWins, 300);
  }
  win.body.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => act(b.dataset.w)));
  const onFocus = () => renderWins();
  wm.events.addEventListener('focus', onFocus);

  /* ---------- ドライブ ---------- */
  async function renderDrive() {
    const paths = await fs.walk('/'), entries = [];
    for (const p of paths) { const s = await fs.stat(p); if (s && !p.startsWith(fs.TRASH + '/') && p !== fs.TRASH) entries.push(s); }
    const total = entries.reduce((n, e) => n + (e.kind === 'file' ? e.size : 0), 0), rows = M.folderUsage(entries), u = await fs.usage();
    q('[data-usage]').textContent = `ファイル ${entries.filter((e) => e.kind === 'file').length} 個、合計 ${fs.human(total)}（ゴミ箱を除く）。ブラウザの保存の場所: 使用 ${fs.human(u.usage)}${u.quota ? '・空き ' + fs.human(u.quota - u.usage) : ''}`;
    q('[data-bars]').innerHTML = rows.map((r, i) => `<button type="button" class="flat mon-bar" data-open="${esc(r.path)}" style="--w:${M.barWidth(r.bytes, total)}%;--c:var(--mon-c${i % 6})" title="${esc(r.path)} をファイル マネージャで開きます"><span class="mon-bar-name">${esc(r.name)}</span><span class="mon-bar-fill" aria-hidden="true"></span><span class="mon-bar-val">${fs.human(r.bytes)}（${M.percent(r.bytes, total)}%・${r.files} 個）</span></button>`).join('');
    q('[data-big]').innerHTML = M.largest(entries, 10).map((e) => `<li><button type="button" class="flat mon-file" data-open="${esc(dirname(e.path))}" data-sel="${esc(e.path)}"><span>${esc(basename(e.path))}</span><span class="mon-file-dir">${esc(dirname(e.path))}</span><span class="mon-file-size">${fs.human(e.size)}</span></button></li>`).join('') || '<li class="mon-empty">ファイルがありません。</li>';
    q('[data-nfile]').textContent = `${entries.filter((e) => e.kind === 'file').length} 個`;
    log('monitor.drive', { files: entries.length, total }, 'ok');
  }
  win.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]'); if (!b) return;
    os.launch('filer', { path: b.dataset.open }); sound.play('select');
    log('monitor.openFolder', { path: b.dataset.open }, 'ok');
  });
  q('[data-refresh]').addEventListener('click', () => { q('[data-usage]').textContent = '計算しています...'; renderDrive(); });

  /* ---------- 性能 ---------- */
  const chart = q('[data-chart]'), cx = chart.getContext('2d');
  function drawChart() {
    // 上の端は、いちばん大きい値に合わせる（画面の更新が 120 回や 144 回の画面でも、線が端に張り付かないように）
    const top = Math.max(60, Math.ceil(Math.max(0, ...samples) / 30) * 30), max = top * 1.12;
    const W = chart.width, H = chart.height, cs = getComputedStyle(win.el);
    const ink = cs.getPropertyValue('--fos-ink').trim() || '#241734';
    cx.fillStyle = cs.getPropertyValue('--fos-paper').trim() || '#fffdf9'; cx.fillRect(0, 0, W, H);
    cx.strokeStyle = '#e6def0'; cx.lineWidth = 1; cx.fillStyle = '#8e7fa3'; cx.font = '11px sans-serif';
    for (const v of [0, top / 2, top]) { const y = H - 6 - (v / max) * (H - 12); cx.beginPath(); cx.moveTo(28, y); cx.lineTo(W, y); cx.stroke(); cx.fillText(String(v), 4, y + 4); }
    if (samples.length > 1) {
      const step = (W - 30) / 59;
      cx.strokeStyle = ink; cx.lineWidth = 2; cx.beginPath();
      samples.forEach((v, i) => { const x = 30 + (60 - samples.length + i) * step, y = H - 6 - (Math.min(max, v) / max) * (H - 12); if (i) cx.lineTo(x, y); else cx.moveTo(x, y); });
      cx.stroke();
      const g = cx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, cs.getPropertyValue('--fos-aqua').trim() || '#6bf2e3'); g.addColorStop(1, cs.getPropertyValue('--fos-sunset').trim() || '#ff8ec7');
      cx.lineTo(30 + 59 * step, H - 6); cx.lineTo(30 + (60 - samples.length) * step, H - 6); cx.closePath(); cx.globalAlpha = 0.35; cx.fillStyle = g; cx.fill(); cx.globalAlpha = 1;
    }
  }
  function second() {
    fpsNow = counter.fps(performance.now());
    samples = M.pushSample(samples, fpsNow, 60);
    q('[data-fps]').textContent = `${fpsNow} 回/秒`;
    const mem = performance.memory;
    q('[data-mem]').textContent = mem ? `${fs.human(mem.usedJSHeapSize)}（上限 ${fs.human(mem.jsHeapSizeLimit)}）` : 'このブラウザでは出せません';
    q('[data-nwin]').textContent = `${wm.list().length} 個`;
    say(`窓 ${wm.list().length} 個 ・ 描き直し ${fpsNow} 回/秒`);
    if (page() === 2) drawChart();
    if (page() === 0) renderWins();
    if (beep) sound.play('tick', Math.min(1, fpsNow / 60));
  }
  // 描き直しを数える（最小化しているときと、ページが裏にあるときは数えない）
  const frame = (t) => { raf = requestAnimationFrame(frame); if (!win.min && !document.hidden) counter.tick(t); };
  q('[data-beep]').addEventListener('change', (e) => { beep = e.target.checked; log('monitor.beep', { on: beep }, 'ok'); });
  tabs.forEach((t, i) => t.addEventListener('click', () => { if (i === 1) renderDrive(); if (i === 2) drawChart(); if (i === 0) renderWins(); }));
  win.cleanup = () => { cancelAnimationFrame(raf); clearInterval(iv); wm.events.removeEventListener('focus', onFocus); };
  renderWins(); drawChart(); renderDrive();
  raf = requestAnimationFrame(frame); iv = setInterval(second, 1000);
  log('monitor.open', {}, 'ok');
  return win;
}
