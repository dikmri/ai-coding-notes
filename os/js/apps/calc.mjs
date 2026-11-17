// 電卓: 四則演算・括弧・パーセント・符号。キーボードで全部操作できる。
// 計算テープ（履歴）は次の起動まで残り、行を押すと答えを式へ戻せる。テープは .txt で保存できる。
// 計算は core/calc.mjs（テストは tests/os-calc.test.mjs）。数字ごとに音の高さが変わり、答えは 7th の和音で返す。
import * as C from '../core/calc.mjs';

const TAPE_KEY = 'fos-calc-tape', TAPE_MAX = 200;
const MENU = `
<div class="menu-bar" role="menubar">
  <div class="menu-title">ファイル(<u>F</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="save" data-status="計算テープを文書として保存します。"><span class="label">計算テープを保存(<u>S</u>)...</span><span class="shortcut">Ctrl+S</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="close"><span class="label">閉じる(<u>X</u>)</span></div>
  </div></div>
  <div class="menu-title">編集(<u>E</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="copy"><span class="label">答えをコピー(<u>C</u>)</span><span class="shortcut">Ctrl+C</span></div>
    <div class="menu-item" data-command="paste"><span class="label">数を貼り付け(<u>P</u>)</span><span class="shortcut">Ctrl+V</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-command="cleartape"><span class="label">計算テープを消す(<u>L</u>)</span></div>
  </div></div>
  <div class="menu-title">表示(<u>V</u>)<div class="menu" role="menu">
    <div class="menu-item checked" data-toggle="check" data-command="tape"><span class="label">計算テープ(<u>T</u>)</span></div>
    <div class="menu-item checked" data-toggle="check" data-command="group"><span class="label">3けたごとの区切り(<u>G</u>)</span></div>
  </div></div>
  <div class="menu-title">ヘルプ(<u>H</u>)<div class="menu" role="menu">
    <div class="menu-item" data-command="keys"><span class="label">キーの使い方(<u>K</u>)</span></div>
    <div class="menu-item" data-command="about"><span class="label">電卓について(<u>A</u>)</span></div>
  </div></div>
</div>`;
// [表示, 押したときのキー, 種類, 読み上げの名前]
const KEYS = [
  ['C', 'Escape', 'fn', '全部消す'], ['(', '(', 'fn'], [')', ')', 'fn'], ['⌫', 'Backspace', 'fn', '1文字消す'],
  ['7', '7', 'num'], ['8', '8', 'num'], ['9', '9', 'num'], ['÷', '/', 'op', '割る'],
  ['4', '4', 'num'], ['5', '5', 'num'], ['6', '6', 'num'], ['×', '*', 'op', '掛ける'],
  ['1', '1', 'num'], ['2', '2', 'num'], ['3', '3', 'num'], ['−', '-', 'op', '引く'],
  ['±', 'neg', 'fn', '符号を変える'], ['0', '0', 'num'], ['.', '.', 'num', '小数点'], ['＋', '+', 'op', '足す'],
  ['%', '%', 'fn', 'パーセント'], ['=', '=', 'eq', '答え'],
];

function loadTape() { try { const t = JSON.parse(localStorage.getItem(TAPE_KEY) || '[]'); return Array.isArray(t) ? t.filter((r) => r && typeof r.expr === 'string' && Number.isFinite(r.value)) : []; } catch { return []; } }
function saveTape(t) { try { localStorage.setItem(TAPE_KEY, JSON.stringify(t.slice(-TAPE_MAX))); } catch { /* 保存できない */ } }

export async function launch(os, args = {}, rect = {}) {
  const { fs, wm, log, sound, esc } = os;
  let st = C.initial(), tape = loadTape(), useGroup = true, lastDone = null, lastMsg = '', msgTimer = 0;
  const win = wm.open({
    app: 'calc', icon: 'icons/calc.svg', className: 'app-calc', title: '電卓', w: 470, h: 440, ...rect, args: {},
    render(w) {
      w.body.innerHTML = MENU + `<div class="calc-main" tabindex="-1">
        <div class="calc-left">
          <div class="calc-display" aria-label="式と答え"><div class="calc-sub" data-sub></div><div class="calc-expr" data-expr></div></div>
          <div class="calc-keys" role="group" aria-label="電卓のボタン">${KEYS.map(([t, k, kind, name]) => `<button type="button" class="flat key ${kind}" data-key="${esc(k)}" data-own-sound${name ? ` aria-label="${name}"` : ''}>${t}</button>`).join('')}</div>
        </div>
        <section class="calc-tape-wrap" aria-label="計算テープ"><div class="calc-tape-head">計算テープ</div><ol class="calc-tape" data-tape></ol></section>
      </div>
      <div class="status-bar"><div class="status-field" role="status" data-status>キーボードの数字と + − * / で計算できます。</div><div class="status-field" style="width:96px" data-count></div><div class="size-grip"></div></div>`;
    },
  });
  const q = (s) => win.body.querySelector(s);
  const exprEl = q('[data-expr]'), subEl = q('[data-sub]'), tapeEl = q('[data-tape]'), main = q('.calc-main');
  const num = (v) => (useGroup ? C.group(C.format(v)) : C.format(v));

  // 知らせ（状態の帯は role="status" なので読み上げにも届く）。同じ文が続くときは見えない空白を足して、読み上げが飛ばさないようにする
  function say(text, keep = false) {
    clearTimeout(msgTimer);
    let m = text;
    if (m === lastMsg) m += ' ';
    lastMsg = m;
    q('.status-field[data-status]').textContent = m;
    if (!keep) msgTimer = setTimeout(() => { q('.status-field[data-status]').textContent = ''; lastMsg = ''; }, 4000);
  }
  function preview() {
    if (!st.expr) return null;
    const r = C.evaluate(st.expr + ')'.repeat(Math.max(0, [...st.expr].reduce((n, c) => n + (c === '(' ? 1 : c === ')' ? -1 : 0), 0))));
    return r.ok ? r.value : null;
  }
  function render() {
    if (st.error) { exprEl.textContent = C.pretty(st.expr) || '0'; subEl.textContent = C.ERRORS[st.error]; win.el.classList.add('calc-error'); }
    else if (st.fresh) { exprEl.textContent = num(st.last); subEl.textContent = lastDone ? C.pretty(lastDone.expr) + ' =' : ''; win.el.classList.remove('calc-error'); }
    else {
      win.el.classList.remove('calc-error');
      exprEl.textContent = C.pretty(st.expr) || '0';
      const p = preview();
      subEl.textContent = p !== null && /[+\-*/%(]/.test(st.expr.replace(/^\(?-/, '')) ? '= ' + num(p) : '';
    }
    exprEl.scrollLeft = exprEl.scrollWidth;
    q('[data-count]').textContent = `テープ ${tape.length} 行`;
  }
  function renderTape() {
    tapeEl.innerHTML = tape.map((r, i) => `<li><button type="button" class="flat tape-row" data-i="${i}" title="押すと答えを式へ入れます"><span class="t-expr">${esc(C.pretty(r.expr))} =</span><span class="t-val">${esc(num(r.value))}</span></button></li>`).join('') || '<li class="tape-empty">まだ計算していません。</li>';
    tapeEl.scrollTop = tapeEl.scrollHeight;
    render();
  }
  function press(key) {
    const r = C.press(st, key);
    st = r.state;
    if (r.event === 'digit') sound.play('key', /\d/.test(key) ? +key : 5);
    else if (r.event === 'op' || r.event === 'edit') sound.play('op');
    else if (r.event === 'clear') sound.play('toggleOff');
    else if (r.event === 'error') { sound.play('error'); say(C.ERRORS[st.error]); log('calc.eval', { expr: st.expr }, 'error: ' + st.error); }
    else if (r.event === 'eval') {
      lastDone = r.done;
      tape.push(r.done); if (tape.length > TAPE_MAX) tape = tape.slice(-TAPE_MAX); saveTape(tape);
      sound.play('equals', C.format(r.done.value).replace(/\D/g, '').length);
      say(`答えは ${num(r.done.value)} です。`);
      log('calc.eval', { expr: r.done.expr, value: r.done.value }, 'ok');
      renderTape();
      return;
    }
    render();
  }
  // 画面のボタン
  q('.calc-keys').addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) press(b.dataset.key); });
  // 計算テープの行: 答えを式へ戻す
  tapeEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const r = tape[+b.dataset.i]; if (!r) return;
    st = C.insertValue(st, r.value); sound.play('select'); render();
    log('calc.recall', { value: r.value }, 'ok');
  });
  // キーボード（ボタンの上の Enter と Space は、そのボタンを押す動きに任せる）
  const KEYMAP = { x: '*', X: '*', '×': '*', '÷': '/', ',': '.', Delete: 'Escape', F9: 'neg' };
  win.body.addEventListener('keydown', (e) => {
    if (e.target.closest('.menu-bar, .menu')) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'c' && !getSelection().toString()) { e.preventDefault(); cmds.copy(); return; }
    if (e.ctrlKey && k === 'v') { e.preventDefault(); cmds.paste(); return; }
    if (e.ctrlKey && k === 's') { e.preventDefault(); cmds.save(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('button')) return;
    const key = KEYMAP[e.key] || e.key;
    if (/^[\d.+\-*/()%=]$/.test(key) || ['Enter', 'Backspace', 'Escape', 'neg'].includes(key)) {
      e.preventDefault();
      press(key);
      const b = win.body.querySelector(`.calc-keys [data-key="${CSS.escape(key === 'Enter' ? '=' : key)}"]`);
      if (b) { b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 110); }
    }
  });
  const cmds = {
    async save() {
      if (!tape.length) { sound.play('error'); say('計算テープは空です。'); return; }
      const p = await os.fileDialog({ mode: 'save', dir: '/ドキュメント', name: '計算テープ.txt', exts: ['.txt'], typeLabel: 'テキスト文書' });
      if (!p) return;
      try {
        await fs.write(p, C.tapeToText(tape, new Date().toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })));
        os.addRecent(p); say(`「${p}」に保存しました。`); log('calc.save', { path: p, rows: tape.length }, 'ok');
      } catch (err) { os.msgbox({ title: '電卓', text: err.message, icon: 'error' }); log('calc.save', { path: p }, 'error: ' + err.message); }
    },
    close: () => win.close(),
    async copy() {
      const v = st.fresh ? st.last : preview();
      if (v === null || v === undefined) { sound.play('error'); say('コピーする答えがありません。'); return; }
      try { await navigator.clipboard.writeText(C.format(v)); say(`${C.format(v)} をコピーしました。`); log('calc.copy', { value: v }, 'ok'); }
      catch (err) { say('コピーできませんでした。'); log('clipboard.write', {}, 'error: ' + err.message); }
    },
    async paste() {
      let text = '';
      try { text = await navigator.clipboard.readText(); } catch (err) { say('クリップボードを読めませんでした。'); log('clipboard.read', {}, 'error: ' + err.message); return; }
      const n = Number(text.trim().replace(/[,，\s]/g, '').replace(/[−ー]/g, '-').replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
      if (!text.trim() || !Number.isFinite(n)) { sound.play('error'); say('貼り付けた文字を、数として読めませんでした。'); return; }
      st = C.insertValue(st, n); sound.play('select'); render(); log('calc.paste', { value: n }, 'ok');
    },
    cleartape() { tape = []; saveTape(tape); sound.play('trash'); renderTape(); say('計算テープを消しました。'); },
    tape: (d) => { main.classList.toggle('no-tape', !d.checked); },
    group: (d) => { useGroup = d.checked; renderTape(); },
    keys: () => os.msgbox({ title: '電卓のキー', icon: 'info', text: '数字と . : 数を入れる\n+ - * / : 足す・引く・掛ける・割る（x でも掛け算）\n( ) : 括弧　% : パーセント\nEnter か = : 答え\nBackspace : 1文字消す　Esc か Delete : 全部消す\nF9 : 符号を変える\nCtrl+C : 答えをコピー　Ctrl+V : 数を貼り付け' }),
    about: () => os.msgbox({ title: '電卓について', icon: 'info', text: 'Future OS 電卓 1.0\n\n0.1 + 0.2 は 0.3 と表示します（12 けたで丸めます）。\n200 + 10% は 220、200 × 10% は 20 になります。\n計算テープは次の起動まで残ります。' }),
  };
  win.body.addEventListener('w95:command', (e) => cmds[e.detail.command]?.(e.detail));
  // 窓が手前に来たとき（ドックのボタン）と、窓のどこかを押したとき（タイトルバーも）は、キーボードの入力をこの電卓で受ける。
  // すでに手前にある窓を押しても窓の仕組みは知らせを出さないので、押したことも自分で見る
  const grab = () => setTimeout(() => { if (wm.getActive() === win && !win.el.contains(document.activeElement)) main.focus({ preventScroll: true }); }, 0);
  const onFocus = (e) => { if (e.detail === win) grab(); };
  wm.events.addEventListener('focus', onFocus);
  win.el.addEventListener('pointerdown', grab);
  win.cleanup = () => wm.events.removeEventListener('focus', onFocus);
  renderTape();
  q('.calc-keys [data-key="="]').focus({ preventScroll: true });
  log('calc.open', { tape: tape.length }, 'ok');
  return win;
}
