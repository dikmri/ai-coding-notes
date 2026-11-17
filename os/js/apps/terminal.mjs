// 端末: 仮想ドライブをコマンドで操作する。コマンドの解釈と実行は core/terminal.mjs（テストは tests/os-terminal.test.mjs）。
// Tab で補完、↑↓ で履歴（次の起動まで残る）、Ctrl+L で画面を消す、Ctrl+C で入力を捨てる。
// ls・tree・find の結果のパスを押すと、フォルダならそこへ移り、ファイルなら合うアプリで開く。
import * as T from '../core/terminal.mjs';
import { evaluate, format } from '../core/calc.mjs';

const HIST = 'fos-terminal-history', MAX_HIST = 200;
const loadHist = () => { try { const h = JSON.parse(localStorage.getItem(HIST) || '[]'); return Array.isArray(h) ? h.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const saveHist = (h) => { try { localStorage.setItem(HIST, JSON.stringify(h.slice(-MAX_HIST))); } catch { /* 保存できない */ } };

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound } = os;
  let cwd = args.cwd && (await fs.stat(args.cwd))?.kind === 'dir' ? args.cwd : '/';
  let history = loadHist(), hpos = history.length, draft = '', busy = false;
  const win = wm.open({
    app: 'terminal', icon: 'icons/terminal.svg', className: 'app-terminal', title: '端末', w: 660, h: 430, ...rect, args: { cwd },
    render(w) {
      w.body.innerHTML = `<div class="term" data-term>
        <div class="term-out" role="log" aria-label="端末の出力" data-out></div>
        <div class="term-line"><label class="term-prompt" for="termIn-${w.id}" data-prompt></label><input type="text" id="termIn-${w.id}" class="term-in" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="コマンド"></div>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status></div><div class="status-field" style="width:130px">help で一覧</div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  // 入力の欄の id は窓ごとに変える（端末を2つ開いても、ラベルが別の窓の欄を指さないように）
  const out = q('[data-out]'), input = q('.term-in'), term = q('[data-term]');
  const fsEnv = { TRASH: fs.TRASH, stat: fs.stat, list: fs.list, walk: fs.walk, readText: fs.readText, write: fs.write, mkdir: fs.mkdir, trash: fs.trash, move: fs.move, copy: fs.copy };
  const apps = () => Object.fromEntries(Object.entries(os.APPS).map(([k, v]) => [k, v.name]));
  const prompt = () => `ARCADIA:${cwd}>`;
  function setCwd(p) { cwd = p; q('[data-prompt]').textContent = prompt(); q('.status-field[data-status]').textContent = '今のフォルダ: ' + cwd; win.setArgs({ cwd }); win.setTitle(`端末 - ${cwd}`); }
  // 1行を足す。切れ端は、ファイル名などが HTML として読まれないよう、すべて textContent で入れる
  function print(segs, cls) {
    const div = document.createElement('div');
    div.className = 'term-row' + (cls ? ' ' + cls : '');
    for (const s of segs) {
      if (s.path) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'flat term-path' + (s.dir ? ' dir' : '');
        b.textContent = s.t; b.dataset.path = s.path; b.dataset.dir = s.dir ? '1' : '';
        b.title = s.dir ? 'このフォルダへ移ります' : 'このファイルを開きます';
        div.append(b);
      } else {
        const span = document.createElement('span');
        if (s.err) span.className = 'term-err';
        span.textContent = s.t;
        div.append(span);
      }
    }
    out.append(div);
  }
  const scrollEnd = () => { term.scrollTop = term.scrollHeight; };
  async function exec(line) {
    print([{ t: prompt() + ' ' }, { t: line }], 'term-cmd');
    if (line.trim()) { if (history.at(-1) !== line) history.push(line); history = history.slice(-MAX_HIST); saveHist(history); }
    hpos = history.length; draft = '';
    busy = true;
    const r = await T.run(line, {
      cwd, fs: fsEnv, open: (p) => os.openFile(p), launch: (a) => os.launch(a), apps: apps(),
      evaluate: (s) => { const v = evaluate(s); return v.ok ? { ok: true, value: format(v.value) } : v; }, now: () => new Date(), history,
    });
    busy = false;
    if (r.clear) out.textContent = '';
    for (const l of r.lines) print(l);
    const failed = r.lines.some((l) => l[0]?.err);
    if (r.cwd !== cwd) setCwd(r.cwd);
    if (line.trim()) sound.play(failed ? 'error' : 'select');
    log('terminal.run', { line: line.slice(0, 80), cwd, lines: r.lines.length }, failed ? 'error: ' + (r.lines.find((l) => l[0]?.err)?.[0].t || '') : 'ok');
    scrollEnd();
  }
  async function complete() {
    const before = input.value.slice(0, input.selectionStart), after = input.value.slice(input.selectionStart);
    const w = T.wordAt(before);
    let cands, prefixDir = '', part = w.word.replace(/^["']/, '');
    if (w.isCommand) cands = Object.keys(T.COMMANDS);
    else {
      const slash = part.lastIndexOf('/');
      prefixDir = slash >= 0 ? part.slice(0, slash + 1) : '';
      part = part.slice(slash + 1);
      const dir = T.resolvePath(cwd, prefixDir || '.');
      const st = await fs.stat(dir);
      cands = st && st.kind === 'dir' ? (await fs.list(dir)).map((e) => e.name + (e.kind === 'dir' ? '/' : '')) : [];
    }
    const r = T.completeWord(part, cands);
    let word = prefixDir + r.text;
    if (/\s/.test(word)) word = '"' + word + (word.endsWith('/') ? '' : '"');
    if (!w.isCommand && !r.options.length && r.text !== part && !r.text.endsWith('/') && !word.endsWith('"')) word += ' ';
    if (w.isCommand && !r.options.length && cands.includes(r.text)) word += ' ';
    input.value = before.slice(0, w.start) + word + after;
    const pos = w.start + word.length; input.setSelectionRange(pos, pos);
    if (r.options.length) { print([{ t: r.options.join('    ') }], 'term-opts'); scrollEnd(); sound.play('menu'); }
    else if (r.text === part) sound.play('error');
  }
  input.addEventListener('keydown', async (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); if (busy) return; const v = input.value; input.value = ''; await exec(v); }
    else if (e.key === 'Tab') { e.preventDefault(); await complete(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hpos === history.length) draft = input.value; if (hpos > 0) { hpos--; input.value = history[hpos]; } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (hpos < history.length) { hpos++; input.value = hpos === history.length ? draft : history[hpos]; } }
    else if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); out.textContent = ''; sound.play('trash'); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'c' && input.selectionStart === input.selectionEnd) { e.preventDefault(); print([{ t: prompt() + ' ' + input.value + '^C' }], 'term-cmd'); input.value = ''; scrollEnd(); }
  });
  // パスを押すと、フォルダならそこへ移り、ファイルなら開く
  out.addEventListener('click', (e) => {
    const b = e.target.closest('.term-path'); if (!b) return;
    if (b.dataset.dir) exec('cd ' + (/\s/.test(b.dataset.path) ? `"${b.dataset.path}"` : b.dataset.path));
    else { os.openFile(b.dataset.path); log('terminal.click', { path: b.dataset.path }, 'ok'); }
    input.focus();
  });
  // 何もない所を押したら入力の欄へ（文字を選んでいるときは、コピーできるようにそのまま）
  term.addEventListener('pointerup', () => { if (!getSelection().toString()) input.focus({ preventScroll: true }); });
  win.body.addEventListener('fos:drop-file', (e) => { input.value += (input.value && !input.value.endsWith(' ') ? ' ' : '') + (/\s/.test(e.detail.path) ? `"${e.detail.path}"` : e.detail.path); input.focus(); });
  setCwd(cwd);
  print([{ t: 'FUTURE OS // ARCADIA-91  TERMINAL ROM 1991' }], 'term-banner');
  print([{ t: 'help でコマンドの一覧を出します。Tab で名前を補完、↑↓ で履歴、Ctrl+L で画面を消します。' }]);
  input.focus();
  log('terminal.open', { cwd }, 'ok');
  return win;
}
