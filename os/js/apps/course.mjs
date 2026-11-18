// 講座の窓「夕暮れ峠をもう一度」: 課の文を読み、右に並べたコードの作業場で書き、答え合わせをして次の課へ進む。
//   課のデータ: os/course/yugure/lessons/<課の id>/（lesson.json、lesson.md、start/、end/）と lessons/course.json
//   プロジェクト: 仮想ドライブの /プロジェクト/夕暮れ峠（作業場で開く）
//   答え合わせ: プロジェクトのファイルからプレビューの文書を作り、確かめのスクリプトを入れて、sandbox の iframe で動かす。
//              結果は postMessage で受け取る（相手はその iframe だけに限る）。iframe は縮めて窓の中に見せる
//              （画面の外や見えない iframe は、ブラウザが描画を止めて、動きの確かめが通らなくなるため）
//   進み具合: localStorage の fos-course-yugure
//   画面に関係しない計算（課の状態の組み立て、課の文の HTML、行の違い、確かめのスクリプト）は core/course.mjs
import * as W from '../core/workshop.mjs';
import { composeState, captureScript, checkerScript, renderMarkdown, lineDiff } from '../core/course.mjs';
import { walk as walkDir, isText, loadRegistry, saveRegistry } from '../userhost.mjs';

const DATA = new URL('../../course/yugure/lessons/', import.meta.url);
const STORE = 'fos-course-yugure';
const SANDBOX = 'allow-scripts allow-modals';
const STAGE_W = 1200, STAGE_H = 750; // 答え合わせの画面の大きさ（縮めて見せる）。自動の確かめの道具（tools/yugure-lessons-check.mjs）と同じ幅にする
const COLORED = ['keyword', 'string', 'comment', 'number', 'regexp', 'tag', 'attr', 'selector', 'property', 'atrule', 'doctype'];

const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">講座(<u>C</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="toc" data-status="部と課の一覧を見せます。"><span class="label">目次(<u>L</u>)</span></div>
    <div class="menu-item" data-command="arrange" data-status="講座の窓を左に、コードの作業場を右に並べます。"><span class="label">作業場を並べて開く(<u>W</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="check" data-status="作業場のファイルを保存して、この課の確かめを動かします。"><span class="label">答え合わせ(<u>K</u>)</span></div>
    <div class="menu-item" data-command="reset" data-status="プロジェクトのファイルを、この課の始めの状態にします。"><span class="label">この課の始めに戻す(<u>R</u>)...</span></div>
    <div class="menu-item" data-command="diff" data-status="今のファイルと、この課の終わりの手本との違いを見せます。"><span class="label">手本との違い(<u>D</u>)...</span></div>
    <div class="menu-item" data-command="solve" data-status="プロジェクトのファイルを、この課の終わりの手本にします。"><span class="label">代わりにやって(<u>A</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="prev"><span class="label">前の課へ(<u>B</u>)</span></div>
    <div class="menu-item" data-command="next"><span class="label">次の課へ(<u>N</u>)</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="accent" data-status="第 2 部で看板の色にした OS の差し色を、元の色に戻します。"><span class="label">OS の色を元に戻す(<u>O</u>)</span></div>
    <div class="menu-item" data-command="forget" data-status="済みの印を全部消します。プロジェクトのファイルはそのまま残ります。"><span class="label">進み具合を消す(<u>P</u>)...</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>X</u>)</span></div>
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="bigger"><span class="label">文字を大きく(<u>L</u>)</span></div>
    <div class="menu-item" data-command="smaller"><span class="label">文字を小さく(<u>S</u>)</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="howto"><span class="label">講座の使い方(<u>U</u>)</span></div>
    <div class="menu-item" data-command="about"><span class="label">講座について(<u>A</u>)</span></div>
  </div></div>
</div>`;

const HOWTO = `講座の使い方

1. 左の講座の窓で、課の文を読みます。
2. 右のコードの作業場で、手順のとおりにコードを書きます。Ctrl+S で保存、Ctrl+Enter で動かします。
3. 「答え合わせ」を押すと、保存してから確かめを動かします。全部に ○ が付けば、その課は済みです。
4. 通らないときは「手本との違い」で、手本と違う行を見られます。どうしても進めないときは「代わりにやって」で手本のファイルにできます。
5. 「この課の始めに戻す」で、課の始めの状態からやり直せます。

上書きする前のファイルは、ゴミ箱に入れてから書き換えます。ゴミ箱から元に戻せます。`;

const loadProgress = () => { try { const p = JSON.parse(localStorage.getItem(STORE) || '{}'); return { done: p.done || {}, current: p.current || '', fontPx: p.fontPx || 14 }; } catch { return { done: {}, current: '', fontPx: 14 }; } };

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  const one = wm.list().find((w) => w.app === 'course');
  if (one) { one.focus(); if (args.lesson) one.goLesson?.(args.lesson); return one; }

  const course = await (await fetch(new URL('course.json', DATA))).json();
  const PROJECT = course.project;
  const order = course.parts.flatMap((p) => p.lessons.map((l) => ({ ...l, part: p })));
  const progress = loadProgress();
  const saveProgress = () => { try { localStorage.setItem(STORE, JSON.stringify(progress)); } catch { /* 保存できない */ } };
  const cache = new Map();
  let index = Math.max(0, order.findIndex((l) => l.id === (args.lesson || progress.current))), view = 'lesson', checking = false, lastMsg = '';

  const win = wm.open({
    app: 'course', icon: 'icons/course.svg', className: 'app-course', title: '講座 夕暮れ峠をもう一度', w: 480, h: 640, x: 4, y: 4, ...rect, args: {},
    render(w) {
      w.body.innerHTML = MENU + `<div class="cr-main">
        <div class="cr-bar" role="toolbar" aria-label="講座の操作">
          <button type="button" class="flat cr-btn" data-a="toc">目次(<u>L</u>)</button>
          <button type="button" class="flat cr-btn cr-go" data-a="check">答え合わせ(<u>K</u>)</button>
          <button type="button" class="flat cr-btn" data-a="reset">始めに戻す(<u>R</u>)...</button>
          <button type="button" class="flat cr-btn" data-a="diff">手本との違い(<u>D</u>)...</button>
          <button type="button" class="flat cr-btn" data-a="solve">代わりにやって(<u>A</u>)...</button>
          <button type="button" class="flat cr-btn" data-a="next">次の課へ(<u>N</u>)</button>
        </div>
        <div class="cr-head" data-head></div>
        <article class="cr-text" data-text tabindex="0" aria-live="off"></article>
        <section class="cr-result" data-result hidden aria-labelledby="crResult-${w.id}">
          <div class="cr-result-head"><h2 id="crResult-${w.id}">答え合わせ</h2><span class="cr-verdict" data-verdict role="status"></span><button type="button" class="flat cr-mini" data-a="hideresult">閉じる</button></div>
          <ul class="cr-checks" data-checks></ul>
          <p class="cr-hint" data-hint></p>
          <div class="cr-stage" data-stage aria-label="確かめている画面"></div>
        </section>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:150px" data-count></div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  function say(t, kind = '') { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; const f = q('[data-status]'); f.textContent = m; f.dataset.kind = kind; }
  const lessonOf = (i = index) => order[i];
  const doneCount = () => order.filter((l) => progress.done[l.id]).length;
  function drawCount() { q('[data-count]').textContent = `済み ${doneCount()} / ${order.length} 課`; }
  function applyFont() { win.body.style.setProperty('--cr-font', progress.fontPx + 'px'); }

  /* ---------- 課のデータ ---------- */
  async function getText(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}`); return r.text(); }
  async function loadLesson(i) {
    const id = order[i].id;
    if (cache.has(id)) return cache.get(id);
    const base = new URL(id + '/', DATA);
    const meta = JSON.parse(await getText(new URL('lesson.json', base)));
    const read = async (phase) => Object.fromEntries(await Promise.all((meta.files?.[phase] || []).map(async (p) => [p, await getText(new URL(`${phase}/${p}`, base))])));
    const lesson = { id, meta, start: await read('start'), end: await read('end'), text: await getText(new URL('lesson.md', base)).catch(() => '') };
    cache.set(id, lesson);
    return lesson;
  }
  async function lessonsUpTo(i) { const out = []; for (let k = 0; k <= i; k++) out.push(await loadLesson(k)); return out; }
  async function stateOf(i, phase) { return composeState(await lessonsUpTo(i), i, phase); }

  /* ---------- 作業場 ---------- */
  const workshop = () => wm.list().find((w) => w.app === 'workshop');
  async function arrange() {
    const desk = document.querySelector('#desk');
    const dw = desk?.clientWidth || innerWidth, dh = desk?.clientHeight || innerHeight;
    const cw = Math.round(Math.min(560, Math.max(400, dw * 0.36)));
    wm.setRect(win, { x: 4, y: 4, w: cw, h: dh - 8 });
    const r = { x: cw + 8, y: 4, w: Math.max(480, dw - cw - 12), h: dh - 8 };
    const ws = workshop();
    if (ws) {
      wm.setRect(ws, r);
      if (ws.project?.() !== PROJECT) await ws.openProject(PROJECT);
    } else await os.launch('workshop', { path: PROJECT }, r);
    log('course.arrange', { course: cw, workshop: r.w }, 'ok');
  }
  // 講座がファイルを書き換える前に、作業場の編集を保存する。書き換えたあとは、作業場に読み直させる
  async function saveWorkshop() { const ws = workshop(); if (ws && ws.project?.() === PROJECT) await ws.saveAll?.(); }
  async function reloadWorkshop() { const ws = workshop(); if (ws) { ws.setEntry?.(pageOf()); await ws.openProject(PROJECT); shownPage = pageOf(); } else await arrange(); }
  // この課で動かすページ（lesson.json の page）。作業場は、HTML でないファイル（JS や CSS）を開いているときも、このページを動かす
  let shownPage = null;
  const pageOf = () => { const l = cache.get(lessonOf().id); return l ? `${PROJECT}/${l.meta.page}` : null; };
  async function showPage() {
    const ws = workshop(), page = pageOf();
    if (!ws || !page) return;
    ws.setEntry?.(page);
    if (page !== shownPage) { await ws.openPage?.(page); shownPage = page; log('course.page', { page }, 'ok'); }
  }

  // files を書く。中身が違うファイルは、先にゴミ箱へ入れる（ゴミ箱から元に戻せる）
  async function writeFiles(files, { overwrite = true } = {}) {
    let wrote = 0, trashed = 0;
    for (const [rel, text] of Object.entries(files)) {
      const path = `${PROJECT}/${rel}`;
      const st = await fs.stat(path);
      if (st) {
        if (!overwrite) continue;
        if (st.kind === 'file' && isText(path) && (await fs.readText(path)) === text) continue;
        await fs.trash(path); trashed++;
      }
      await fs.write(path, text, W.mimeOf(path) + ';charset=utf-8');
      wrote++;
    }
    return { wrote, trashed };
  }
  // 課へ入るときの用意: プロジェクトが無ければ課の始めの状態を作る。あれば、この課で新しく渡すファイルだけを足す
  async function prepare(i) {
    const lesson = await loadLesson(i);
    if (!(await fs.stat(PROJECT))) {
      const r = await writeFiles(await stateOf(i, 'start'));
      log('course.prepare', { lesson: lesson.id, made: r.wrote }, 'ok');
      return r.wrote;
    }
    const r = await writeFiles(lesson.start, { overwrite: false });
    if (r.wrote) log('course.prepare', { lesson: lesson.id, added: r.wrote }, 'ok');
    return r.wrote;
  }

  /* ---------- 画面 ---------- */
  async function showLesson(i, { align = false } = {}) {
    index = Math.max(0, Math.min(order.length - 1, i));
    view = 'lesson';
    const l = lessonOf();
    progress.current = l.id; saveProgress();
    win.setArgs({ lesson: l.id });
    win.setTitle(`${l.id} ${l.title} - 講座 夕暮れ峠をもう一度`);
    q('[data-head]').innerHTML = `<span class="cr-part">第 ${esc(l.part.id)} 部 ${esc(l.part.title)}</span><span class="cr-id">${esc(l.id)}</span>${progress.done[l.id] ? `<span class="cr-done">${progress.done[l.id] === 'helped' ? '手本で済み' : '済み'}</span>` : ''}`;
    q('[data-text]').innerHTML = '<p class="cr-dim">読み込んでいます…</p>';
    hideResult();
    let lesson;
    try { lesson = await loadLesson(index); }
    catch (e) { q('[data-text]').innerHTML = `<p>課のデータを読めませんでした（${esc(e.message)}）。</p>`; log('course.lesson', { lesson: l.id }, 'error: ' + e.message); return; }
    drawText(lesson);
    drawButtons();
    if (align) await alignTo(index);
    else if (await prepare(index)) await reloadWorkshop();
    await showPage();
    q('[data-text]').scrollTop = 0;
    say(`${l.id}「${l.title}」。手順のとおりに作業場で書いたら、「答え合わせ」を押してください。`);
    log('course.lesson', { lesson: l.id }, 'ok');
  }
  function drawText(lesson) {
    const art = q('[data-text]');
    const md = lesson.text || `# ${lesson.id} ${lesson.meta.title}\n\nこの課の文は準備中です。\n\n## 答え合わせ\n\n${lesson.meta.checks.map((c) => '- ' + c.label).join('\n')}`;
    art.innerHTML = renderMarkdown(md);
    // コードの塊に「写す」ボタンを付ける（写す相手は commandfor で指す）
    art.querySelectorAll('pre.code').forEach((pre, k) => {
      const code = pre.querySelector('code');
      code.id = `cr-${win.id}-code-${k}`;
      const lang = { html: 'HTML', css: 'CSS', js: 'JavaScript' }[pre.dataset.lang] || 'コード';
      const box = document.createElement('div');
      box.className = 'cr-copy';
      box.innerHTML = `<button type="button" class="flat cr-mini" command="--copy" commandfor="${code.id}" aria-label="${lang}のコードを写す">写す</button><span class="cr-tip" role="status"></span>`;
      pre.before(box);
    });
    paintCode();
  }
  // コードの塊の色分け（CSS の Custom Highlight API。使えないブラウザでは色のない文字のまま読める）
  function paintCode() {
    if (!('highlights' in CSS)) return;
    const groups = {};
    q('[data-text]').querySelectorAll('pre.code[data-lang] code').forEach((code) => {
      const lang = { html: 'html', css: 'css', js: 'js', javascript: 'js' }[code.parentElement.dataset.lang];
      const node = code.firstChild;
      if (!lang || !node) return;
      const text = node.textContent;
      for (const t of W.tokenize(text, lang)) {
        if (!COLORED.includes(t.type) || t.end > text.length) continue;
        const r = new Range(); r.setStart(node, t.start); r.setEnd(node, t.end);
        (groups[t.type] ||= []).push(r);
      }
    });
    for (const type of COLORED) { const name = 'cr-' + type; if (groups[type]) CSS.highlights.set(name, new Highlight(...groups[type])); else CSS.highlights.delete(name); }
  }
  function drawButtons() {
    const isToc = view === 'toc';
    for (const a of ['check', 'reset', 'diff', 'solve']) q(`.cr-bar [data-a="${a}"]`).disabled = isToc || checking;
    const nb = q('.cr-bar [data-a="next"]');
    nb.disabled = isToc || index >= order.length - 1;
    nb.classList.toggle('cr-go', !isToc && !!progress.done[lessonOf().id]);
    q('.cr-bar [data-a="check"]').classList.toggle('cr-go', !isToc && !progress.done[lessonOf().id]);
    q('.cr-bar [data-a="toc"]').innerHTML = isToc ? '課に戻る(<u>L</u>)' : '目次(<u>L</u>)';
    drawCount();
  }
  function showToc() {
    view = 'toc';
    hideResult();
    win.setTitle('目次 - 講座 夕暮れ峠をもう一度');
    q('[data-head]').innerHTML = '<span class="cr-part">目次</span>';
    const parts = course.parts.map((p) => {
      const n = p.lessons.filter((l) => progress.done[l.id]).length, all = n === p.lessons.length;
      return `<section class="cr-tpart"><h3>第 ${esc(p.id)} 部 ${esc(p.title)} <span class="cr-dim">${n} / ${p.lessons.length} 課</span>${all ? ' <span class="cr-crystal" title="この部を全部終えた印">◆ 済み</span>' : ''}</h3>
        <ol class="cr-list">${p.lessons.map((l) => `<li><button type="button" class="flat cr-lesson${l.id === lessonOf().id ? ' cur' : ''}" data-go="${esc(l.id)}"><span class="cr-lid">${esc(l.id)}</span> ${esc(l.title)}</button>${progress.done[l.id] ? `<span class="cr-mark">${progress.done[l.id] === 'helped' ? '手本で済み' : '済み'}</span>` : ''}</li>`).join('')}</ol></section>`;
    }).join('');
    q('[data-text]').innerHTML = `<h1>${esc(course.title)}</h1><p>${esc(course.subtitle)}</p><p class="cr-dim">プロジェクトの場所: ${esc(PROJECT)}。課を選ぶと、その課の文を開きます。</p>${parts}`;
    q('[data-text]').scrollTop = 0;
    drawButtons();
    say('課を選んでください。前の課を飛ばして選んだときは、ファイルをその課の始めにそろえるかを聞きます。');
  }
  async function goLesson(id) {
    const i = order.findIndex((l) => l.id === id);
    if (i < 0) return;
    // 今の課の次より先へ飛ぶときは、ファイルをその課の始めにそろえるかを聞く
    let align = false;
    const furthest = order.reduce((m, l, k) => (progress.done[l.id] ? k : m), -1);
    if (i > Math.max(index, furthest) + 1 || i < index) {
      const a = await os.msgbox({ title: '講座 夕暮れ峠をもう一度', text: `${order[i].id}「${order[i].title}」へ移ります。\n\nプロジェクトのファイルを、この課の始めの状態にそろえますか?\n（そろえるときは、違うファイルをゴミ箱へ入れてから書き換えます）`, icon: 'question', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return;
      align = a === 'はい';
    }
    await showLesson(i, { align });
  }
  async function alignTo(i) {
    await saveWorkshop();
    const r = await writeFiles(await stateOf(i, 'start'));
    await reloadWorkshop();
    log('course.align', { lesson: order[i].id, wrote: r.wrote, trashed: r.trashed }, 'ok');
    return r;
  }

  /* ---------- 答え合わせ ---------- */
  function hideResult() { const r = q('[data-result]'); r.hidden = true; q('[data-stage]').replaceChildren(); }
  const dataUrlOf = (blob) => new Promise((ok, ng) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ng(fr.error); fr.readAsDataURL(blob); });
  let stageObserver = null;
  function makeStage() {
    const stage = q('[data-stage]');
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', SANDBOX);
    frame.setAttribute('aria-label', '答え合わせで動かしている画面');
    frame.tabIndex = -1;
    frame.style.width = STAGE_W + 'px'; frame.style.height = STAGE_H + 'px';
    stage.replaceChildren(frame);
    stageObserver?.disconnect();
    stageObserver = new ResizeObserver(() => { const s = stage.clientWidth / STAGE_W; stage.style.setProperty('--cr-scale', String(s)); stage.style.height = Math.round(STAGE_H * s) + 'px'; });
    stageObserver.observe(stage);
    return frame;
  }
  async function check({ helped = false } = {}) {
    if (checking || view !== 'lesson') return;
    checking = true; drawButtons();
    const l = lessonOf();
    const result = q('[data-result]'), list = q('[data-checks]');
    result.hidden = false;
    q('[data-verdict]').textContent = '確かめています…'; q('[data-verdict]').dataset.kind = '';
    q('[data-hint]').textContent = '';
    try {
      const lesson = await loadLesson(index);
      list.innerHTML = lesson.meta.checks.map((c) => `<li class="cr-check wait"><span class="cr-ox" aria-hidden="true">…</span><span>${esc(c.label)}</span></li>`).join('');
      await saveWorkshop();
      const paths = await walkDir(fs, PROJECT).catch(() => []);
      const entry = `${PROJECT}/${lesson.meta.page}`;
      if (!paths.includes(entry)) throw new Error(`プロジェクトに ${lesson.meta.page} がありません。「この課の始めに戻す」で作り直せます。`);
      const map = {}, sources = {};
      for (const p of paths) {
        if (isText(p)) { const t = await fs.readText(p); map[p] = { text: t }; sources[p.slice(PROJECT.length + 1)] = t; }
        else map[p] = { dataUrl: await dataUrlOf(await fs.readBlob(p)) };
      }
      const built = W.buildPreview(map, PROJECT, entry, { runtime: captureScript() + W.RUNTIME });
      const checker = checkerScript(lesson.meta.checks, PROJECT, sources);
      // 置き換えは関数で渡す（文字で渡すと、確かめのスクリプトの中の $$ や $' が特別な意味になって壊れる）
      const html = /<\/body>/i.test(built.html) ? built.html.replace(/<\/body>/i, () => `${checker}</body>`) : built.html + checker;
      const frame = makeStage();
      const limit = 10000 + lesson.meta.checks.length * 8000;
      const results = await new Promise((ok) => {
        const timer = setTimeout(() => finish(null), limit);
        // 受け取るのは、この iframe からの答え合わせの結果だけ（sandbox の iframe は origin が "null" なので、送り元の窓で見分ける）
        function onMsg(e) { if (e.source === frame.contentWindow && e.data?.type === 'yugure-check' && Array.isArray(e.data.results)) finish(e.data.results); }
        function finish(r) { clearTimeout(timer); removeEventListener('message', onMsg); ok(r); }
        addEventListener('message', onMsg);
        frame.srcdoc = html;
      });
      if (!results) throw new Error(`${Math.round(limit / 1000)} 秒たっても確かめが終わりませんでした。ページが止まっていないか、作業場のコンソールを見てください。`);
      list.innerHTML = results.map((r) => `<li class="cr-check ${r.ok ? 'ok' : 'ng'}"><span class="cr-ox" aria-hidden="true">${r.ok ? '○' : '×'}</span><span>${esc(r.label)}${r.ok ? '' : '<span class="cr-sr">（まだ）</span>'}${r.error ? `<span class="cr-err">${esc(r.error)}</span>` : ''}</span></li>`).join('');
      const pass = results.every((r) => r.ok);
      log('course.check', { lesson: l.id, pass, ok: results.filter((r) => r.ok).length, all: results.length, missing: built.missing.length }, pass ? 'ok' : 'fail');
      if (pass) await passed(lesson, helped);
      else {
        q('[data-verdict]').textContent = `${results.filter((r) => r.ok).length} / ${results.length} 個が通りました`;
        q('[data-verdict]').dataset.kind = 'ng';
        q('[data-hint]').textContent = (built.missing.length ? `見つからないファイルがあります（${built.missing.map((m) => m.slice(PROJECT.length + 1)).join('、')}）。` : '') + '× の付いた所を、手順と見比べてください。「手本との違い」で、手本と違う行を見られます。';
        sound.play('error');
        say('まだ通らない確かめがあります。', 'error');
      }
    } catch (e) {
      q('[data-verdict]').textContent = '確かめられませんでした'; q('[data-verdict]').dataset.kind = 'ng';
      q('[data-hint]').textContent = e.message;
      log('course.check', { lesson: l.id }, 'error: ' + e.message);
      sound.play('error');
    } finally {
      checking = false; drawButtons();
    }
  }
  async function passed(lesson, helped) {
    const id = lesson.id, before = progress.done[id];
    progress.done[id] = before === 'self' || !helped ? 'self' : 'helped';
    saveProgress();
    q('[data-verdict]').textContent = '合格です'; q('[data-verdict]').dataset.kind = 'ok';
    const msgs = [];
    if (lesson.meta.complete) msgs.push(...(await complete(lesson.meta.complete)));
    const part = lessonOf().part, partDone = part.lessons.every((x) => progress.done[x.id]);
    const isLast = index >= order.length - 1;
    q('[data-hint]').textContent = [...msgs, isLast ? 'おつかれさまでした。続きの第 5 部（立体の峠）は準備中です。' : '「次の課へ」で進みます。'].join(' ');
    q('[data-head] .cr-done')?.remove();
    q('[data-head]').insertAdjacentHTML('beforeend', `<span class="cr-done">${progress.done[id] === 'helped' ? '手本で済み' : '済み'}</span>`);
    if (partDone && !before) { sound.play('crystal', Math.min(4, +part.id || 0)); setTimeout(() => sound.play('solve'), 300); } else sound.play('solve');
    say(partDone && !before ? `第 ${part.id} 部「${part.title}」を全部終えました。` : `${id} は合格です。`);
    if (msgs.length) os.msgbox({ title: '講座 夕暮れ峠をもう一度', text: msgs.join('\n\n'), icon: 'info' });
    drawButtons();
  }
  // 課を終えたときの動き: 作ったものを OS のアプリにする、OS の差し色を看板の色にする
  async function complete(c) {
    const out = [];
    try {
      if (c.registerApp) {
        const a = c.registerApp, list = (await loadRegistry(fs)).filter((r) => r.id !== a.id);
        list.push({ id: a.id, name: a.name, root: PROJECT, entry: a.entry || 'index.html', w: a.w || 800, h: a.h || 600 });
        await saveRegistry(fs, list);
        os.events.dispatchEvent(new CustomEvent('userapps'));
        log('course.registerApp', { id: a.id, name: a.name }, 'ok');
      }
      if (c.accentFrom) {
        const css = await fs.readText(`${PROJECT}/${c.accentFrom}`).catch(() => '');
        const m = /--color-accent\s*:\s*([^;}]+)/.exec(css);
        const hex = m && toHex(m[1].trim());
        if (hex) { os.saveSettings({ courseAccent: hex }); log('course.accent', { color: hex }, 'ok'); }
        else { log('course.accent', {}, 'skip: no color'); return out; }
      }
      if (c.message) out.push(c.message + '。');
    } catch (e) { log('course.complete', {}, 'error: ' + e.message); }
    return out;
  }
  // CSS の色の書き方（#rgb、色の名前、rgb() など）を #rrggbb にする。読めなければ null
  function toHex(v) {
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v.toLowerCase();
    const probe = document.createElement('i'); probe.style.color = ''; probe.style.color = v;
    if (!probe.style.color) return null;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color; probe.remove();
    const n = rgb.match(/\d+(\.\d+)?/g);
    return n && n.length >= 3 ? '#' + n.slice(0, 3).map((x) => Math.round(+x).toString(16).padStart(2, '0')).join('') : null;
  }

  /* ---------- 戻す・違い・代わりにやる ---------- */
  async function reset() {
    const l = lessonOf();
    const a = await os.msgbox({ title: '講座 夕暮れ峠をもう一度', text: `プロジェクトのファイルを、${l.id}「${l.title}」の始めの状態にします。\n\n今のファイルで中身が違うものは、ゴミ箱へ入れてから書き換えます。よろしいですか?`, icon: 'question', buttons: ['はい(&Y)', 'いいえ(&N)'] });
    if (a !== 'はい') return;
    const r = await alignTo(index);
    hideResult();
    sound.play('op');
    say(r.wrote ? `${r.wrote} 個のファイルを課の始めの状態にしました（${r.trashed} 個をゴミ箱へ入れました）。` : 'もう課の始めの状態です。');
  }
  async function solve() {
    const l = lessonOf();
    const a = await os.msgbox({ title: '講座 夕暮れ峠をもう一度', text: `プロジェクトのファイルを、${l.id}「${l.title}」の終わりの手本にします。\n\n今のファイルで中身が違うものは、ゴミ箱へ入れてから書き換えます。手本にしたあと、答え合わせを動かします。よろしいですか?`, icon: 'question', buttons: ['はい(&Y)', 'いいえ(&N)'] });
    if (a !== 'はい') return;
    await saveWorkshop();
    const r = await writeFiles(await stateOf(index, 'end'));
    await reloadWorkshop();
    log('course.solve', { lesson: l.id, wrote: r.wrote, trashed: r.trashed }, 'ok');
    say(`手本にしました（${r.wrote} 個のファイルを書き換え、${r.trashed} 個をゴミ箱へ入れました）。`);
    await check({ helped: true });
  }
  async function diff() {
    const l = lessonOf();
    await saveWorkshop();
    const end = await stateOf(index, 'end');
    const lesson = await loadLesson(index);
    // 見せるのは、この課で変わるファイルだけ（前の課で学ぶ人が変えた所まで並べると、違いが多すぎて読めない）
    const names = Object.keys(lesson.end).filter(isText);
    const norm = (t) => t.replace(/\r\n/g, '\n').split('\n').map((x) => x.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
    const blocks = [];
    for (const rel of names) {
      const path = `${PROJECT}/${rel}`;
      const mine = (await fs.stat(path)) ? await fs.readText(path) : null;
      if (mine !== null && norm(mine) === norm(end[rel])) continue;
      if (mine === null) { blocks.push(`<h3>${esc(rel)}</h3><p class="cr-dim">このファイルはまだありません。作業場の「新しいファイル」で作ってください。</p>`); continue; }
      const d = lineDiff(norm(mine), norm(end[rel]));
      // 変わった行の前後 2 行だけを見せ、あいだは「…」にする
      const show = d.map((x, k) => x.type !== 'same' || d.slice(Math.max(0, k - 2), k + 3).some((y) => y.type !== 'same'));
      let html = '', skipped = false;
      d.forEach((x, k) => {
        if (!show[k]) { if (!skipped) html += '<li class="cr-skip">…</li>'; skipped = true; return; }
        skipped = false;
        const mark = x.type === 'add' ? '+' : x.type === 'remove' ? '-' : ' ';
        html += `<li class="cr-d ${x.type}"><span class="cr-dm" aria-label="${x.type === 'add' ? '手本にある行' : x.type === 'remove' ? '今のファイルにある行' : '同じ行'}">${mark}</span><code>${esc(x.text) || ' '}</code></li>`;
      });
      blocks.push(`<h3>${esc(rel)}</h3><ol class="cr-diff">${html}</ol>`);
    }
    log('course.diff', { lesson: l.id, files: blocks.length }, 'ok');
    const dlg = document.createElement('dialog');
    dlg.className = 'window dialog cr-dlg';
    dlg.setAttribute('aria-labelledby', `crDiff-${win.id}`);
    dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text" id="crDiff-${win.id}">手本との違い - ${esc(l.id)} ${esc(l.title)}</div></div>
      <div class="window-body"><p class="cr-dim">「-」の行は今のファイルにあって手本にない行、「+」の行は手本にあって今のファイルにない行です。行の終わりの空白は比べません。</p>
      <div class="cr-diffs">${!names.length ? '<p>この課で変わるファイルはありません。</p>' : blocks.length ? blocks.join('') : '<p>手本と同じです。違う所はありません。</p>'}</div>
      <form method="dialog" class="button-row"><button type="submit" class="default" autofocus>閉じる</button></form></div>`;
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  /* ---------- 写すボタン ---------- */
  const tipTimers = new WeakMap();
  async function copy(button, target) {
    const text = target.innerText.replace(/\n$/, '');
    let ok = true;
    try { await navigator.clipboard.writeText(text); } catch { ok = false; }
    const tip = button.nextElementSibling;
    clearTimeout(tipTimers.get(button));
    tip.textContent = '';
    requestAnimationFrame(() => { tip.textContent = ok ? '写しました' : '写せませんでした。選んで Ctrl+C で写してください'; });
    tipTimers.set(button, setTimeout(() => { tip.textContent = ''; }, 2000));
    log('course.copy', { chars: text.length }, ok ? 'ok' : 'fail');
  }
  // command 属性のボタン（Invoker Commands）。使えないブラウザでは、クリックで同じことをする
  if ('CommandEvent' in window) win.body.addEventListener('command', (e) => { if (e.command === '--copy') copy(e.source, e.target); }, true);
  else win.body.addEventListener('click', (e) => { const b = e.target.closest('button[command="--copy"]'); const t = b && document.getElementById(b.getAttribute('commandfor')); if (t) copy(b, t); });

  /* ---------- 操作 ---------- */
  async function next() {
    if (index >= order.length - 1) return;
    if (!progress.done[lessonOf().id]) {
      const a = await os.msgbox({ title: '講座 夕暮れ峠をもう一度', text: 'この課の答え合わせが、まだ通っていません。\n\n次の課へ進みますか?', icon: 'question', buttons: ['はい(&Y)', 'いいえ(&N)'] });
      if (a !== 'はい') return;
    }
    sound.play('select');
    await showLesson(index + 1);
  }
  async function forget() {
    const a = await os.msgbox({ title: '講座 夕暮れ峠をもう一度', text: '済みの印を全部消します。プロジェクトのファイルと、OS に登録したアプリはそのまま残ります。\n\nよろしいですか?', icon: 'question', buttons: ['はい(&Y)', 'いいえ(&N)'] });
    if (a !== 'はい') return;
    progress.done = {}; saveProgress(); log('course.forget', {}, 'ok');
    if (view === 'toc') showToc(); else showLesson(index);
  }
  const acts = {
    toc: () => (view === 'toc' ? showLesson(index) : showToc()),
    arrange, check: () => check(), reset, diff, solve, next,
    prev: () => (index > 0 ? showLesson(index - 1) : null),
    hideresult: hideResult,
    accent: () => { os.saveSettings({ courseAccent: '' }); say('OS の差し色を元に戻しました。'); log('course.accent', { color: '' }, 'ok'); },
    forget,
    close: () => win.close(),
    bigger: () => { progress.fontPx = Math.min(22, progress.fontPx + 1); saveProgress(); applyFont(); },
    smaller: () => { progress.fontPx = Math.max(11, progress.fontPx - 1); saveProgress(); applyFont(); },
    howto: () => os.msgbox({ title: '講座の使い方', text: HOWTO, icon: 'info' }),
    about: () => os.msgbox({ title: '講座について', text: `${course.title}\n${course.subtitle}\n\n課の数: ${order.length}\nプロジェクトの場所: ${PROJECT}`, icon: 'info' }),
  };
  win.body.addEventListener('w95:command', (e) => acts[e.detail.command]?.());
  win.body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'); if (a && !a.disabled) { acts[a.dataset.a]?.(); return; }
    const g = e.target.closest('[data-go]'); if (g) goLesson(g.dataset.go);
  });
  win.goLesson = goLesson;
  win.cleanup = () => { stageObserver?.disconnect(); for (const t of COLORED) CSS.highlights?.delete('cr-' + t); };

  applyFont();
  await prepare(index); // 作業場が開く前に、プロジェクトのフォルダを用意する
  await arrange();
  await showLesson(index);
  win.focus();
  log('course.launch', { lesson: lessonOf().id, done: doneCount() }, 'ok');
  return win;
}
