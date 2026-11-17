// コードの作業場: 仮想ドライブの /プロジェクト の中で、HTML・CSS・JavaScript を書いて、その場で動かす。
// 色分け（CSS の Custom Highlight API）、行番号、探す、プレビュー（保存したら動かす）、コンソール、ひな形、ZIP の書き出し。
// プレビューは allow-same-origin を付けない sandbox の iframe で動かし、OS とは MessageChannel の専用の口だけでやり取りする。
// 計算（字句、import の書き換え、プレビューの文書、ZIP、ひな形、橋渡し）は core/workshop.mjs。
import * as W from '../core/workshop.mjs';

const ROOT = '/プロジェクト', DATA = '/アプリデータ';
const TEXT_RE = /\.(html?|css|m?js|json|txt|md|svg|csv|xml)$/i;
const COLORED = ['keyword', 'string', 'comment', 'number', 'regexp', 'tag', 'attr', 'selector', 'property', 'atrule', 'doctype'];
const SOUNDS = new Set(['click', 'select', 'op', 'pin', 'notify', 'error', 'key', 'prism', 'crystal', 'solve', 'shutter', 'chime', 'equals', 'count']);
const PREVIEW_SANDBOX = 'allow-scripts allow-modals';

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  const one = wm.list().find((w) => w.app === 'workshop');
  if (one) { one.focus(); if (args.path) one.openProject?.(args.path); return one; }
  let project = null, files = [], cur = null, texts = {}, saved = {}, autoRun = true, port = null, sources = {}, entry = null, lastMsg = '', findHits = [], findAt = -1, escTab = false;
  const win = wm.open({
    app: 'workshop', icon: 'icons/workshop.svg', className: 'app-workshop', title: 'コードの作業場', w: 1180, h: 720, ...rect, args: {},
    render(w) {
      w.body.innerHTML = `<div class="ws-main">
        <div class="ws-bar" role="toolbar" aria-label="作業場の操作">
          <button type="button" class="flat ws-btn" data-a="newproj">新しいプロジェクト(<u>N</u>)...</button>
          <label for="wsProj-${w.id}">プロジェクト(<u>P</u>):</label><select id="wsProj-${w.id}" data-proj></select>
          <button type="button" class="flat ws-btn" data-a="save" disabled>保存(<u>S</u>)</button>
          <button type="button" class="flat ws-btn ws-run" data-a="run" disabled>動かす(<u>R</u>)</button>
          <label class="ws-check"><input type="checkbox" data-auto checked> 保存したら動かす(<u>U</u>)</label>
          <button type="button" class="flat ws-btn" data-a="stop" disabled>止める(<u>T</u>)</button>
          <button type="button" class="flat ws-btn" data-a="zip" disabled>ZIP で書き出す(<u>E</u>)</button>
        </div>
        <div class="ws-body">
          <nav class="ws-tree" aria-label="プロジェクトのファイル">
            <div class="ws-tree-bar"><button type="button" class="flat ws-mini" data-a="newfile" disabled>新しいファイル(<u>F</u>)...</button><button type="button" class="flat ws-mini" data-a="rename" disabled>名前を変える(<u>M</u>)...</button><button type="button" class="flat ws-mini" data-a="del" disabled>ゴミ箱へ(<u>D</u>)</button></div>
            <ul class="ws-files" role="listbox" aria-label="ファイル" data-files></ul>
          </nav>
          <section class="ws-edit" aria-label="エディタ">
            <div class="ws-filebar"><span data-curname>ファイルを選んでください</span></div>
            <div class="ws-findbar" data-find hidden><label for="wsFind-${w.id}">探す(<u>I</u>):</label><input id="wsFind-${w.id}" type="search" data-findq autocomplete="off"><span data-findn></span><button type="button" class="flat ws-mini" data-a="findnext">次へ</button><button type="button" class="flat ws-mini" data-a="findclose">閉じる</button></div>
            <div class="ws-editor" data-editor>
              <div class="ws-gutter" aria-hidden="true" data-gutter></div>
              <div class="ws-code"><pre class="ws-pre" aria-hidden="true"><code data-hl></code></pre><textarea class="ws-ta" data-ta spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="コード（Tab で字下げ。Esc のあとの Tab でエディタの外へ）" disabled></textarea></div>
            </div>
            <div class="ws-start" data-start></div>
          </section>
          <section class="ws-right" aria-label="プレビューとコンソール">
            <div class="ws-preview-head"><span>プレビュー</span><span class="ws-dim" data-ptitle></span></div>
            <div class="ws-preview"><iframe class="ws-frame" data-frame sandbox="${PREVIEW_SANDBOX}" title="プレビュー"></iframe></div>
            <div class="ws-console-head"><span>コンソール</span><button type="button" class="flat ws-mini" data-a="clear">消す(<u>L</u>)</button></div>
            <ol class="ws-console" data-console aria-live="polite"></ol>
          </section>
        </div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:120px" data-pos></div><div class="status-field" style="width:90px" data-lang></div><div class="size-grip"></div></div>`;
    },
    onClose: async () => {
      keep();
      if (!Object.keys(texts).some((p) => texts[p] !== saved[p])) return true;
      const a = await os.msgbox({ title: 'コードの作業場', text: '保存していない変更があります。\n\n保存してから閉じますか?', icon: 'warning', buttons: ['はい(&Y)', 'いいえ(&N)', 'キャンセル'] });
      if (a === 'キャンセル') return false;
      if (a === 'はい') await saveAll();
      return true;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const ta = q('[data-ta]'), hl = q('[data-hl]'), pre = q('.ws-pre'), gutter = q('[data-gutter]'), frameEl = () => q('[data-frame]');
  function say(t, kind = '') { let m = t; if (m === lastMsg) m += ' '; lastMsg = m; const f = q('.status-field[data-status]'); f.textContent = m; f.dataset.kind = kind; }
  const isText = (p) => TEXT_RE.test(p);
  const rel = (p) => p.slice(project.length + 1);

  /* ---------- プロジェクト ---------- */
  async function projects() { await fs.mkdir(ROOT).catch(() => {}); return (await fs.list(ROOT)).filter((e) => e.kind === 'dir').map((e) => e.path); }
  async function drawProjects() {
    const list = await projects();
    q('[data-proj]').innerHTML = `<option value="">（選んでください）</option>` + list.map((p) => `<option value="${esc(p)}"${p === project ? ' selected' : ''}>${esc(p.split('/').pop())}</option>`).join('');
  }
  async function walk(dir) { const out = []; for (const e of await fs.list(dir)) { if (e.kind === 'dir') out.push(...(await walk(e.path))); else out.push(e.path); } return out; }
  async function openProject(path) {
    keep();
    project = path; files = (await walk(path)).sort((a, b) => a.localeCompare(b, 'ja')); texts = {}; saved = {}; cur = null;
    win.setArgs({ path }); win.setTitle(`${path.split('/').pop()} - コードの作業場`);
    await drawProjects(); drawFiles();
    const first = files.find((p) => /\/index\.html$/.test(p)) || files.find(isText);
    if (first) await openFile(first); else showEditor(false);
    for (const b of ['save', 'run', 'stop', 'zip', 'newfile', 'rename', 'del']) q(`[data-a="${b}"]`).disabled = false;
    log('workshop.open', { project: path, files: files.length }, 'ok');
    say(`プロジェクト「${path.split('/').pop()}」を開きました。Ctrl+S で保存、Ctrl+Enter で動かします。`);
    run();
  }
  function drawFiles() {
    q('[data-files]').innerHTML = files.map((p) => {
      const depth = rel(p).split('/').length - 1, dirty = texts[p] !== undefined && texts[p] !== saved[p];
      return `<li role="option" class="ws-file${p === cur ? ' cur' : ''}" data-file="${esc(p)}" aria-selected="${p === cur}" tabindex="${p === cur ? 0 : -1}" style="padding-left:${8 + depth * 14}px">${esc(rel(p))}${dirty ? ' *' : ''}</li>`;
    }).join('');
  }
  async function readText(p) { if (texts[p] !== undefined) return texts[p]; const t = await fs.readText(p); saved[p] = t; return t; }

  /* ---------- エディタ ---------- */
  function showEditor(on) { q('[data-editor]').hidden = !on; q('[data-start]').hidden = on; ta.disabled = !on; }
  async function openFile(p) {
    keep();
    if (!isText(p)) { say(`「${rel(p)}」は文字のファイルではないので、エディタでは開けません。プレビューでは使えます。`); return; }
    const t = await readText(p);
    texts[p] = t; cur = p;
    showEditor(true);
    ta.value = t; ta.scrollTop = 0; ta.scrollLeft = 0;
    q('[data-curname]').textContent = rel(p);
    q('[data-lang]').textContent = { html: 'HTML', css: 'CSS', js: 'JavaScript', json: 'JSON', text: '文字' }[W.langOf(p)];
    paint(); drawFiles(); caret();
  }
  function keep() { if (cur && !ta.disabled) texts[cur] = ta.value; }
  // 色分けと行番号。pre の中は1つの文字のノードだけにし、字句の位置に Range を当てて CSS の Custom Highlight API で塗る
  let paintQueued = 0;
  function paint() {
    paintQueued = 0;
    const text = ta.value;
    hl.textContent = text + '\n';
    const lines = text.split('\n').length;
    gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n') + '\n';
    syncScroll();
    if (!('highlights' in CSS)) return; // 使えないブラウザでは、色の付かない文字のまま読める
    const node = hl.firstChild, groups = {};
    if (node && text.length < 400000) {
      for (const t of W.tokenize(text, W.langOf(cur || ''))) {
        if (!COLORED.includes(t.type) || t.end > text.length) continue;
        const r = new Range(); r.setStart(node, t.start); r.setEnd(node, t.end);
        (groups[t.type] ||= []).push(r);
      }
    }
    for (const type of COLORED) { const name = 'ws-' + type; if (groups[type]) CSS.highlights.set(name, new Highlight(...groups[type])); else CSS.highlights.delete(name); }
    paintFind();
  }
  const schedulePaint = () => { if (!paintQueued) paintQueued = requestAnimationFrame(paint); };
  function syncScroll() { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop; }
  function caret() {
    const before = ta.value.slice(0, ta.selectionStart).split('\n');
    q('[data-pos]').textContent = `${before.length} 行 ${before[before.length - 1].length + 1} 列`;
  }
  // 文字を入れる（execCommand なら「元に戻す」が効く。使えなければ setRangeText）
  function insert(text) { if (!document.execCommand?.('insertText', false, text)) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
  ta.addEventListener('input', () => { if (cur) { texts[cur] = ta.value; schedulePaint(); drawFilesDirty(); } });
  ta.addEventListener('scroll', syncScroll);
  ta.addEventListener('keyup', caret); ta.addEventListener('click', caret);
  ta.addEventListener('keydown', (e) => {
    // Esc: 探す欄が開いていれば閉じるだけ。開いていなければ、次の Tab でエディタの外へ移れるようにする
    if (e.key === 'Escape') { if (!q('[data-find]').hidden) closeFind(); else escTab = true; return; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      if (escTab) { escTab = false; return; } // Esc のあとの Tab は、エディタの外へ移る
      e.preventDefault();
      if (e.shiftKey) {
        const s = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
        if (ta.value.startsWith('  ', s)) { ta.setSelectionRange(s, s + 2); insert(''); }
      } else insert('  ');
      return;
    }
    escTab = false;
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      // 前の行と同じだけ字下げする
      const s = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1, indent = /^[ \t]*/.exec(ta.value.slice(s))[0];
      e.preventDefault(); insert('\n' + indent);
    }
  });
  let dirtyTimer = 0;
  function drawFilesDirty() { clearTimeout(dirtyTimer); dirtyTimer = setTimeout(() => { drawFiles(); const d = Object.keys(texts).some((p) => texts[p] !== saved[p]); win.setTitle(`${d ? '* ' : ''}${project.split('/').pop()} - コードの作業場`); }, 150); }

  /* ---------- 探す ---------- */
  function paintFind() {
    if (!('highlights' in CSS)) return;
    const node = hl.firstChild, term = q('[data-findq]').value;
    findHits = [];
    if (!q('[data-find]').hidden && term && node) {
      const low = ta.value.toLowerCase(), t = term.toLowerCase();
      for (let i = low.indexOf(t); i >= 0 && findHits.length < 5000; i = low.indexOf(t, i + t.length)) findHits.push(i);
    }
    const ranges = findHits.map((i) => { const r = new Range(); r.setStart(node, i); r.setEnd(node, i + term.length); return r; });
    if (ranges.length) { const h = new Highlight(...ranges); h.priority = 1; CSS.highlights.set('ws-find', h); } else CSS.highlights.delete('ws-find');
    q('[data-findn]').textContent = term ? `${findHits.length} 件` : '';
  }
  function findNext() {
    paintFind();
    if (!findHits.length) { say('見つかりませんでした。'); return; }
    findAt = findHits.findIndex((i) => i >= ta.selectionEnd); if (findAt < 0) findAt = 0;
    const i = findHits[findAt], n = q('[data-findq]').value.length;
    ta.focus(); ta.setSelectionRange(i, i + n);
    q('[data-findn]').textContent = `${findAt + 1} / ${findHits.length} 件`; caret();
  }
  q('[data-findq]').addEventListener('input', paintFind);
  q('[data-findq]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findNext(); } if (e.key === 'Escape') closeFind(); });
  function openFind() { q('[data-find]').hidden = false; const f = q('[data-findq]'); f.value = ta.value.slice(ta.selectionStart, ta.selectionEnd).split('\n')[0] || f.value; f.focus(); f.select(); paintFind(); }
  function closeFind() { q('[data-find]').hidden = true; CSS.highlights?.delete('ws-find'); ta.focus(); }

  /* ---------- 保存 ---------- */
  async function save(p) {
    if (texts[p] === undefined || texts[p] === saved[p]) return false;
    await fs.write(p, texts[p], W.mimeOf(p) + ';charset=utf-8');
    saved[p] = texts[p]; return true;
  }
  async function saveAll() {
    keep();
    let n = 0;
    try { for (const p of Object.keys(texts)) if (await save(p)) n++; }
    catch (e) { os.msgbox({ title: 'コードの作業場', text: e.message, icon: 'error' }); log('workshop.save', { project }, 'error: ' + e.message); return; }
    drawFiles(); win.setTitle(`${project.split('/').pop()} - コードの作業場`);
    say(n ? `${n} 個のファイルを保存しました。` : '変更はありません。'); if (n) sound.play('pin');
    log('workshop.save', { project, files: n }, 'ok');
    if (n && autoRun) run();
  }

  /* ---------- プレビュー ---------- */
  async function collect() {
    const out = {};
    for (const p of files) {
      if (isText(p)) out[p] = { text: texts[p] !== undefined ? texts[p] : await fs.readText(p) };
      else out[p] = { dataUrl: await new Promise((ok) => { fs.readBlob(p).then((b) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); }) };
    }
    return out;
  }
  async function manifest() { const m = files.find((p) => p === project + '/app.json'); if (!m) return {}; try { return JSON.parse(texts[m] ?? (await fs.readText(m))); } catch { return {}; } }
  async function run(target) {
    if (!project) return;
    keep();
    const man = await manifest();
    entry = target || (cur && /\.html?$/i.test(cur) ? cur : project + '/' + (man.entry || 'index.html'));
    if (!files.includes(entry)) { conLine('warn', `「${rel(entry)}」がないので動かせません。index.html を作ってください。`); return; }
    const built = W.buildPreview(await collect(), project, entry, { runtime: W.RUNTIME });
    sources = built.sources;
    clearConsole(); port = null;
    const old = frameEl(), f = document.createElement('iframe');
    f.className = 'ws-frame'; f.dataset.frame = ''; f.setAttribute('sandbox', PREVIEW_SANDBOX); f.title = 'プレビュー';
    f.srcdoc = built.html; old.replaceWith(f);
    for (const m of built.missing) conLine('warn', `見つかりません: ${rel(m)}`);
    q('[data-ptitle]').textContent = rel(entry);
    say(`「${rel(entry)}」を動かしています。`); sound.play('select');
    log('workshop.run', { project, entry: rel(entry), missing: built.missing.length }, 'ok');
  }
  function stop() { const f = frameEl(), b = document.createElement('iframe'); b.className = 'ws-frame'; b.dataset.frame = ''; b.setAttribute('sandbox', PREVIEW_SANDBOX); b.title = 'プレビュー'; f.replaceWith(b); port = null; say('プレビューを止めました。'); }
  // プレビューの橋渡しからの「口をください」に答える。送り主がプレビューの iframe かを source で確かめる
  function onMessage(e) {
    const f = frameEl();
    if (!f || e.source !== f.contentWindow || e.data?.type !== 'arcadia-hello' || port) return;
    const ch = new MessageChannel();
    port = ch.port1; port.onmessage = (m) => handle(m.data, ch.port1);
    f.contentWindow.postMessage({ type: 'arcadia-port' }, '*', [ch.port2]);
  }
  addEventListener('message', onMessage);
  const dataFile = () => `${DATA}/${project.split('/').pop().replace(/[\\/:*?"<>|]/g, '_')}/data.json`;
  async function handle(d, p) {
    if (!d || typeof d.op !== 'string' || p !== port) return;
    const reply = (result) => d.id && p.postMessage({ id: d.id, result });
    const fail = (error) => d.id && p.postMessage({ id: d.id, error });
    const a = d.args || {};
    try {
      switch (d.op) {
        case 'console': conLine(['log', 'info', 'warn', 'error', 'debug'].includes(a.level) ? a.level : 'log', String(a.text ?? '').slice(0, 4000), a.file, a.line); return;
        case 'read': {
          const path = W.resolveIn(project, entry, String(a.path || ''));
          if (!path || !files.includes(path)) return fail(`プロジェクトの中に「${a.path}」がありません`);
          if (isText(path)) return reply({ text: texts[path] !== undefined ? texts[path] : await fs.readText(path), type: W.mimeOf(path) });
          const buf = new Uint8Array(await (await fs.readBlob(path)).arrayBuffer());
          let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          return reply({ base64: btoa(s), type: W.mimeOf(path) });
        }
        case 'navigate': { const path = W.resolveIn(project, entry, String(a.href || '')); if (path && /\.html?$/i.test(path) && files.includes(path)) run(path); else conLine('warn', `プロジェクトの中のページではありません: ${a.href}`); return; }
        case 'link': if (/^https?:\/\//i.test(a.href || '')) { os.launch('browser', { url: a.href }); conLine('info', `OS のブラウザで開きました: ${a.href}`); } return;
        case 'setTitle': q('[data-ptitle]').textContent = String(a.text).slice(0, 80); return reply(true);
        case 'setStatus': say('プレビュー: ' + String(a.text).slice(0, 200)); return reply(true);
        case 'sound': if (SOUNDS.has(a.name)) sound.play(a.name); return reply(true);
        case 'notify': os.notify?.({ title: String(a.title).slice(0, 60) || project.split('/').pop(), text: String(a.text).slice(0, 200) }); return reply(true);
        case 'loadData': { let all = {}; try { all = await fs.readJSON(dataFile()); } catch { /* まだない */ } return reply(all[a.key] ?? null); }
        case 'saveData': {
          let all = {}; try { all = await fs.readJSON(dataFile()); } catch { /* まだない */ }
          all[a.key] = a.value; const json = JSON.stringify(all);
          if (json.length > 1e6) return fail('保存できるのは 1MB までです');
          await fs.write(dataFile(), json, 'application/json'); return reply(true);
        }
        default: return fail(`知らない操作です: ${d.op}`);
      }
    } catch (err) { fail(err.message); }
  }

  /* ---------- コンソール ---------- */
  const LEVEL = { log: '記録', info: '知らせ', warn: '注意', error: '誤り', debug: '細部' };
  function conLine(level, text, file, line) {
    const ol = q('[data-console]'), li = document.createElement('li');
    li.className = 'ws-con ' + level;
    const where = file && sources[file] ? rel(sources[file]) : file && file.startsWith('about:srcdoc') ? rel(entry) : '';
    li.innerHTML = `<span class="ws-lv">${LEVEL[level]}</span> <span class="ws-msg"></span>${where ? ` <button type="button" class="flat ws-at" data-goto="${esc(sources[file] || entry)}" data-line="${line | 0}">${esc(where)}:${line | 0}</button>` : ''}`;
    li.querySelector('.ws-msg').textContent = text;
    ol.append(li); ol.scrollTop = ol.scrollHeight;
    while (ol.children.length > 500) ol.firstChild.remove();
    if (level === 'error') say(`誤り: ${text.split('\n')[0].slice(0, 100)}`, 'error');
  }
  function clearConsole() { q('[data-console]').replaceChildren(); }
  async function gotoLine(path, line) {
    if (path !== cur) await openFile(path);
    const lines = ta.value.split('\n'); let i = 0;
    for (let k = 0; k < Math.max(0, line - 1) && k < lines.length; k++) i += lines[k].length + 1;
    ta.focus(); ta.setSelectionRange(i, i + (lines[line - 1] || '').length);
    ta.scrollTop = Math.max(0, (line - 5) * parseFloat(getComputedStyle(ta).lineHeight || '18'));
    caret();
  }

  /* ---------- 名前を聞く小さなダイアログ ---------- */
  function ask({ title, label, value = '', choices = null }) {
    return new Promise((done) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'window dialog ws-dlg';
      dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text"></div></div><div class="window-body">
        ${choices ? `<fieldset class="ws-choices"><legend>ひな形(<u>H</u>)</legend>${choices.map((c, i) => `<label class="ws-choice"><input type="radio" name="tpl" value="${esc(c.id)}"${i ? '' : ' checked'}> <b>${esc(c.name)}</b><span>${esc(c.desc)}</span></label>`).join('')}</fieldset>` : ''}
        <div class="ws-askrow"><label for="wsAsk">${esc(label)}(<u>A</u>):</label><input id="wsAsk" type="text" autocomplete="off"></div>
        <div class="button-row"><button type="button" class="default" data-ok>OK</button><button type="button" data-cancel>キャンセル</button></div></div>`;
      dlg.querySelector('.title-bar-text').textContent = title;
      const input = dlg.querySelector('#wsAsk'); input.value = value;
      const finish = (v) => { dlg.close(); dlg.remove(); done(v); };
      dlg.querySelector('[data-ok]').addEventListener('click', () => finish({ name: input.value.trim(), tpl: dlg.querySelector('input[name=tpl]:checked')?.value }));
      dlg.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dlg.querySelector('[data-ok]').click(); } });
      document.body.append(dlg); dlg.showModal(); input.focus(); input.select();
    });
  }
  const badName = (n) => !n || /[\\:*?"<>|]/.test(n) || n.startsWith('.') || n.includes('..');

  /* ---------- 操作 ---------- */
  async function newProject() {
    const r = await ask({ title: '新しいプロジェクト', label: 'プロジェクトの名前', value: '', choices: W.TEMPLATES });
    if (!r) return;
    const tpl = W.TEMPLATES.find((t) => t.id === r.tpl) || W.TEMPLATES[0];
    const name = r.name || tpl.name;
    if (badName(name) || name.includes('/')) { say('その名前は使えません。/ \\ : * ? " < > | を除いてください。', 'error'); return; }
    const dir = `${ROOT}/${await fs.freeName(ROOT, name)}`;
    for (const [f, t] of Object.entries(tpl.files)) await fs.write(`${dir}/${f}`, t, W.mimeOf(f) + ';charset=utf-8');
    log('workshop.new', { project: dir, template: tpl.id }, 'ok');
    sound.play('pin');
    await openProject(dir);
  }
  async function newFile() {
    const r = await ask({ title: '新しいファイル', label: 'ファイルの名前（例: js/game.mjs）', value: 'new.mjs' });
    if (!r || !r.name) return;
    const p = W.resolveIn(project, project + '/index.html', r.name);
    if (!p || badName(r.name)) { say('その名前は使えません。', 'error'); return; }
    if (files.includes(p)) { say('同じ名前のファイルがあります。', 'error'); return; }
    await fs.write(p, '', W.mimeOf(p) + ';charset=utf-8');
    files.push(p); files.sort((a, b) => a.localeCompare(b, 'ja'));
    drawFiles(); await openFile(p); ta.focus();
  }
  async function renameFile() {
    if (!cur) return;
    const r = await ask({ title: '名前を変える', label: '新しい名前', value: cur.split('/').pop() });
    if (!r || !r.name || r.name === cur.split('/').pop()) return;
    if (badName(r.name) || r.name.includes('/')) { say('その名前は使えません。', 'error'); return; }
    keep(); await save(cur);
    const np = await fs.rename(cur, r.name);
    texts[np] = texts[cur]; saved[np] = saved[cur]; delete texts[cur]; delete saved[cur];
    files = files.map((p) => (p === cur ? np : p)).sort((a, b) => a.localeCompare(b, 'ja')); cur = np;
    drawFiles(); q('[data-curname]').textContent = rel(np); say(`名前を「${r.name}」にしました。`);
  }
  async function deleteFile() {
    if (!cur) return;
    const a = await os.msgbox({ title: 'コードの作業場', text: `「${rel(cur)}」をゴミ箱へ移しますか?\n\nゴミ箱から元に戻せます。`, icon: 'question', buttons: ['はい(&Y)', 'いいえ(&N)'] });
    if (a !== 'はい') return;
    await fs.trash(cur);
    delete texts[cur]; delete saved[cur]; files = files.filter((p) => p !== cur); cur = null;
    drawFiles(); showEditor(false); drawStart(); sound.play('trash'); say('ゴミ箱へ移しました。');
  }
  async function exportZip() {
    keep();
    const entries = [];
    for (const p of files) {
      const data = isText(p) ? new TextEncoder().encode(texts[p] !== undefined ? texts[p] : await fs.readText(p)) : new Uint8Array(await (await fs.readBlob(p)).arrayBuffer());
      let deflated;
      if (typeof CompressionStream === 'function' && data.length > 64) {
        const c = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
        if (c.length < data.length) deflated = c;
      }
      entries.push({ name: rel(p), data, deflated });
    }
    const zip = W.zipStore(entries), name = project.split('/').pop() + '.zip';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(`「${name}」を書き出しました（${files.length} 個のファイル）。`); log('workshop.zip', { project, files: files.length, size: zip.length }, 'ok');
  }
  async function drawStart() {
    const list = await projects();
    q('[data-start]').innerHTML = `<div class="ws-startin"><h2>コードの作業場</h2><p>HTML・CSS・JavaScript で、ページも遊びも OS のアプリも作れます。作ったものは右のプレビューで、その場で動きます。</p>
      <p><button type="button" class="flat ws-btn ws-run" data-a="newproj">新しいプロジェクトを作る...</button></p>
      ${list.length ? `<h3>今あるプロジェクト</h3><ul>${list.map((p) => `<li><button type="button" class="flat ws-mini" data-openproj="${esc(p)}">${esc(p.split('/').pop())}</button></li>`).join('')}</ul>` : ''}</div>`;
  }
  const acts = { newproj: newProject, save: saveAll, run: () => run(), stop, zip: exportZip, newfile: newFile, rename: renameFile, del: deleteFile, findnext: findNext, findclose: closeFind, clear: clearConsole };
  win.body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'); if (a && !a.disabled) { acts[a.dataset.a](); return; }
    const f = e.target.closest('[data-file]'); if (f) { openFile(f.dataset.file); return; }
    const op = e.target.closest('[data-openproj]'); if (op) { openProject(op.dataset.openproj); return; }
    const g = e.target.closest('[data-goto]'); if (g) gotoLine(g.dataset.goto, +g.dataset.line);
  });
  q('[data-proj]').addEventListener('change', (e) => { if (e.target.value) openProject(e.target.value); });
  q('[data-auto]').addEventListener('change', (e) => { autoRun = e.target.checked; });
  q('[data-files]').addEventListener('keydown', (e) => {
    const li = e.target.closest('[data-file]'); if (!li) return;
    const i = files.indexOf(li.dataset.file), to = { ArrowDown: i + 1, ArrowUp: i - 1 }[e.key];
    if (to !== undefined && files[to]) { e.preventDefault(); openFile(files[to]).then(() => q(`[data-file="${CSS.escape(files[to])}"]`)?.focus()); }
    if (e.key === 'Enter') { e.preventDefault(); ta.focus(); }
  });
  // 作業場の中のキー: Ctrl+S 保存、Ctrl+Enter 動かす、Ctrl+F 探す
  win.body.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 's' && project) { e.preventDefault(); saveAll(); }
    else if (k === 'enter' && project) { e.preventDefault(); keep(); run(); }
    else if (k === 'f' && cur) { e.preventDefault(); openFind(); }
  });
  win.openProject = openProject;
  win.cleanup = () => { removeEventListener('message', onMessage); for (const t of [...COLORED, 'find']) CSS.highlights?.delete('ws-' + t); };

  showEditor(false); await drawStart(); await drawProjects();
  if (args.path) await openProject(args.path);
  else say('新しいプロジェクトを作るか、プロジェクトを選んでください。');
  log('workshop.launch', {}, 'ok');
  return win;
}
