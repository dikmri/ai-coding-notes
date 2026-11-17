// AI アシスタントの道具を、OS の上で実際に動かす（イコちゃんが歩いて、指さして、押して見せる）。
// MCP の橋渡し・API キーの対話・ガイドの台本が、同じ call(道具の名前, 引数) を使う。
// 守ること:
//  - [data-ai-ignore] の部品（確かめのダイアログ、止めるボタン、吹き出しのボタン）は、窓の中を読む道具にも押す道具にも渡さない（AI が自分で許可できないように）
//  - 秘密の欄（type=password、[data-ai-secret]）の値は伏せる。API キーは仮想ドライブに置かないので、ファイルの道具からも届かない
//  - ファイルを消す・別の中身へ書き換える・外の住所を開く前は、画面で利用者に確かめる（core/agent.mjs の confirmNeeded）
//  - 動いている間は Esc か「止める」でいつでも止められる
import * as A from '../core/agent.mjs';
import * as G from '../core/guide.mjs';
import * as C from './character.mjs';
import { isText } from '../userhost.mjs';

let agent = null;
export function getAgent(os) { return (agent ??= createAgent(os)); }

function createAgent(os) {
  const { fs, wm, log, sound } = os;
  const refs = new Map(); // windowId → Map(ref → 部品)
  let ctrl = null, running = 0;
  const events = new EventTarget();
  const emit = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));
  const winById = (id) => wm.list().find((w) => w.id === id) || null;
  const appName = (id) => (os.APPS[id]?.name) || os.userApps?.().find((u) => 'user:' + u.id === id || u.id === id)?.name || id;
  const sleep = (ms) => new Promise((ok, ng) => { const t = setTimeout(ok, ms); ctrl?.signal.addEventListener('abort', () => { clearTimeout(t); ng(new DOMException('止めました', 'AbortError')); }, { once: true }); });

  /* ---------- 始まりと止める ---------- */
  async function ensure() { await C.init(); C.onStop(stop); }
  function begin() {
    if (!running++) {
      ctrl = new AbortController();
      addEventListener('keydown', onEsc, true);
      C.showStop(true);
      emit('state', { running: true });
    }
    return ctrl.signal;
  }
  function end() {
    if (--running <= 0) {
      running = 0;
      removeEventListener('keydown', onEsc, true);
      C.showStop(false); C.highlight(null);
      emit('state', { running: false });
    }
  }
  function onEsc(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(); } }
  function stop() {
    if (!ctrl) return;
    ctrl.abort();
    C.hideBubble(); C.highlight(null); C.setFrame('apologize_1');
    log('agent.stop', {}, 'ok');
    emit('stopped', {});
  }

  /* ---------- 窓の中を読む ---------- */
  const SEL = 'button, a[href], input, select, textarea, [role=button], [role=tab], [role=checkbox], [role=radio], [role=option], [role=menuitem], [role=gridcell], [role=slider], [role=link], [role=listbox], [contenteditable=""], [contenteditable="true"], h1, h2, h3, h4, iframe, canvas, .status-field[data-status]';
  const visibleEl = (el) => (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : !!el.getClientRects().length);
  function roleOf(el) {
    const r = el.getAttribute('role');
    if (r) return r;
    const t = el.localName;
    if (t === 'button') return 'button';
    if (t === 'a') return 'link';
    if (t === 'select') return 'combobox';
    if (t === 'textarea' || el.isContentEditable) return 'textbox';
    if (/^h[1-4]$/.test(t)) return 'heading';
    if (t === 'iframe') return 'region';
    if (t === 'canvas') return 'canvas';
    if (el.matches('.status-field')) return 'text';
    if (t === 'input') return { checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', button: 'button', submit: 'button' }[el.type] || 'textbox';
    return t;
  }
  function nameOf(el) {
    const by = el.getAttribute('aria-labelledby');
    const lab = el.getAttribute('aria-label') || (by && by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ')) || (el.labels?.[0]?.textContent) || '';
    if (lab.trim()) return lab.trim();
    if (el.localName === 'iframe') return '中は読めない枠';
    if (['input', 'textarea', 'select'].includes(el.localName)) return el.placeholder || el.title || el.name || '';
    return (el.textContent || el.title || el.getAttribute('alt') || '').trim();
  }
  function snapshot(win) {
    const items = [], map = new Map();
    let k = 0;
    for (const el of win.el.querySelectorAll(SEL)) {
      if (el.closest('[data-ai-ignore]') || !visibleEl(el) || el.matches('.rz')) continue;
      const role = roleOf(el), it = { ref: 'r' + ++k, role, name: nameOf(el) };
      if (el.matches('input[type=password]') || el.closest('[data-ai-secret]')) it.secret = true;
      else if (el.localName === 'select') it.value = el.selectedOptions[0]?.textContent?.trim() || '';
      else if (el.localName === 'textarea' || (el.localName === 'input' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type))) it.value = el.value;
      if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') it.disabled = true;
      if (el.type === 'checkbox' || el.type === 'radio') it.checked = el.checked;
      else if (el.getAttribute('aria-checked')) it.checked = el.getAttribute('aria-checked') === 'true';
      if (el.getAttribute('aria-selected') === 'true') it.selected = true;
      if (el.getAttribute('aria-expanded')) it.expanded = el.getAttribute('aria-expanded') === 'true';
      if (el.dataset.guide) it.name = it.name ? `${it.name}（案内名 ${el.dataset.guide}）` : `案内名 ${el.dataset.guide}`;
      items.push(it); map.set(it.ref, el);
      if (items.length >= 300) break;
    }
    refs.set(win.id, map);
    return items;
  }
  const refEl = (windowId, ref) => {
    const el = refs.get(windowId)?.get(ref);
    if (!el || !el.isConnected) throw new Error(`参照番号 ${ref} の部品が見つかりません。inspect_window で読み直してください`);
    if (el.closest('[data-ai-ignore]')) throw new Error('この部品は操作できません');
    return el;
  };
  const guideEl = (id, win) => (win?.el || document).querySelector(`[data-guide="${CSS.escape(id)}"]`) || document.querySelector(`[data-guide="${CSS.escape(id)}"]`);

  /* ---------- 見せる動き ---------- */
  async function approach(el, signal) {
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    if (C.isVisible()) {
      await C.moveTo(C.standBeside(r), signal);
      C.highlight(r);
      await C.pose(r.top + r.height / 2 < C.position().y ? 'point_up' : 'point_right', 220, signal);
    }
    return r;
  }
  function pressEl(el) {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerId: 1, isPrimary: true, buttons: 1, pointerType: 'mouse' }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...o, buttons: 1 }));
    el.focus?.({ preventScroll: true });
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  }
  async function press(el, signal, double = false) {
    await approach(el, signal);
    if (C.isVisible()) await C.pressAnim(signal);
    pressEl(el);
    if (double) { pressEl(el); el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window })); }
  }
  function setValue(el, v) {
    const proto = el.localName === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  }
  async function typeInto(el, value, mode, signal) {
    await approach(el, signal);
    el.focus?.({ preventScroll: true });
    if (el.localName === 'select') {
      const opt = [...el.options].find((o) => o.value === value || o.textContent.trim() === value);
      if (!opt) throw new Error(`選べる値ではありません: ${value}（選べる値: ${[...el.options].map((o) => o.textContent.trim()).join('、')}）`);
      el.value = opt.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (el.isContentEditable) { el.textContent = mode === 'append' ? el.textContent + value : value; el.dispatchEvent(new InputEvent('input', { bubbles: true })); return; }
    const base = mode === 'append' ? el.value : '';
    // 短い文は1文字ずつ打って見せる（長い文や「瞬間」の設定では一度に入れる）
    if (C.isVisible() && C.getSpeed() !== 'instant' && value.length <= 80) {
      for (let i = 1; i <= value.length; i += 2) { setValue(el, base + value.slice(0, i + 1)); await C.pose(i % 4 === 1 ? 'type_1' : 'type_2', C.getSpeed() === 'fast' ? 20 : 45, signal); }
    } else { if (C.isVisible()) await C.typeAnim(4, signal); setValue(el, base + value); }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function keyEvent(target, combo) {
    const parts = combo.split('+'), key = parts.pop();
    const m = new Set(parts.map((p) => p.toLowerCase()));
    const init = { key: key.length === 1 ? key : key, bubbles: true, cancelable: true, ctrlKey: m.has('control') || m.has('ctrl'), shiftKey: m.has('shift'), altKey: m.has('alt'), metaKey: m.has('meta') };
    target.dispatchEvent(new KeyboardEvent('keydown', init));
    target.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  /* ---------- 確かめのダイアログ（AI からは読めず押せない） ---------- */
  function confirmAsk(text) {
    return new Promise((done) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'window dialog ai-confirm'; dlg.dataset.aiIgnore = '';
      dlg.innerHTML = `<div class="title-bar"><div class="title-bar-text">イコちゃんからの確かめ</div></div><div class="window-body"><div class="ai-confirm-row"><canvas width="48" height="48" aria-hidden="true"></canvas><p></p></div><p class="ai-confirm-note">この操作は、AI からは押せません。あなたが選んでください。</p><div class="button-row"><button type="button" data-ok>許可する(<u>Y</u>)</button><button type="button" class="default" data-no>やめる(<u>N</u>)</button></div></div>`;
      dlg.querySelector('p').textContent = text;
      const f = C.frameCanvas('ask_confirm'); if (f) dlg.querySelector('canvas').getContext('2d').drawImage(f, 0, 0);
      const finish = (v) => { dlg.close(); dlg.remove(); done(v); };
      dlg.querySelector('[data-ok]').addEventListener('click', () => finish(true));
      dlg.querySelector('[data-no]').addEventListener('click', () => finish(false));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
      ctrl?.signal.addEventListener('abort', () => finish(false), { once: true });
      document.body.append(dlg); dlg.showModal(); dlg.querySelector('[data-no]').focus();
      C.setFrame('ask_confirm'); sound.play('notify');
    });
  }

  /* ---------- 道具 ---------- */
  async function waitWindow(before, appId, ms = 6000) {
    for (let t = 0; t < ms; t += 100) {
      const w = wm.list().find((x) => !before.has(x.id) && (x.app === appId || x.app === 'user:' + appId)) || (t > 1500 && wm.list().find((x) => x.app === appId && x === wm.getActive()));
      if (w) return w;
      await sleep(100);
    }
    return null;
  }
  const impl = {
    get_desktop_state: async () => ({
      windows: wm.list().map((w) => ({ windowId: w.id, app: w.app, title: w.title, active: w === wm.getActive(), minimized: !!w.min })),
      apps: [...Object.entries(os.APPS).map(([id, a]) => ({ appId: id, name: a.name })), ...(os.userApps?.() || []).map((u) => ({ appId: 'user:' + u.id, name: u.name + '（作ったアプリ）' }))],
    }),
    open_app: async ({ appId, path }, signal) => {
      const before = new Set(wm.list().map((w) => w.id)), name = appName(appId);
      if (!os.APPS[appId] && !appId.startsWith('user:') && !(os.userApps?.() || []).some((u) => u.id === appId)) throw new Error(`知らないアプリです: ${appId}`);
      let opened = false;
      if (!path && C.isVisible()) {
        // 画面の上の手順で開く: スタートボタン → プログラム → アプリの名前
        const sb = document.querySelector('#startBtn');
        if (sb && document.querySelector('#start')?.hidden) await press(sb, signal); else if (sb) await approach(sb, signal);
        await sleep(250);
        const prog = document.querySelector('#start [data-guide="start-programs"]');
        if (prog) {
          await approach(prog, signal);
          prog.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
          await sleep(300);
          const item = [...document.querySelectorAll('.start-sub .start-item')].find((i) => i.dataset.guide === 'start-app-' + appId || i.textContent.trim() === name || i.textContent.trim() === name + '（作ったアプリ）');
          if (item) { await press(item, signal); opened = true; }
        }
        if (!opened) document.querySelector('#start')?.hidden === false && document.querySelector('#startBtn')?.click();
      }
      if (!opened) {
        if (C.isVisible()) await C.pressAnim(signal);
        await os.launch(appId.startsWith('user:') ? appId : (os.APPS[appId] ? appId : 'user:' + appId), path ? { path } : {});
      }
      const w = await waitWindow(before, appId.replace(/^user:/, ''));
      if (!w) throw new Error(`「${name}」の窓が開きませんでした`);
      return { windowId: w.id, title: w.title };
    },
    manage_window: async ({ windowId, action, x, y, w, h }, signal) => {
      const win = winById(windowId);
      if (!win) throw new Error(`窓 ${windowId} がありません。get_desktop_state で確かめてください`);
      const ctl = (cls) => win.el.querySelector(`.title-bar-controls .${cls}`);
      if (action === 'close' && ctl('close')) await press(ctl('close'), signal);
      else if (action === 'minimize' && ctl('min')) await press(ctl('min'), signal);
      else if ((action === 'maximize' || action === 'restore') && (ctl('max') || ctl('restore'))) { if ((action === 'maximize') !== !!win.max) await press(ctl('max') || ctl('restore'), signal); else if (win.min) win.restore(); }
      else if (action === 'focus') { if (win.min) await win.restore(); await approach(win.el.querySelector('.title-bar'), signal); win.focus(); }
      else if (action === 'move' || action === 'resize') { await approach(win.el.querySelector('.title-bar'), signal); wm.setRect(win, action === 'move' ? { x, y } : { w, h }); }
      else throw new Error(`この窓では ${action} ができません`);
      return { ok: true };
    },
    inspect_window: async ({ windowId } = {}) => {
      const win = windowId ? winById(windowId) : wm.getActive();
      if (!win) throw new Error('窓がありません。get_desktop_state で確かめてください');
      const items = snapshot(win);
      return { windowId: win.id, app: win.app, title: win.title, elements: A.formatSnapshot(items) };
    },
    point_and_speak: async ({ text, windowId, ref, guideId }, signal) => {
      let el = null;
      if (ref && windowId) el = refEl(windowId, ref);
      else if (guideId) el = guideEl(guideId, windowId && winById(windowId));
      if (el) await approach(el, signal);
      if (C.isVisible()) await C.say(text, { signal, hold: 900 + text.length * 40, sound: () => sound.play('type') });
      C.highlight(null);
      return { ok: true };
    },
    click_element: async ({ windowId, ref, double }, signal) => { const el = refEl(windowId, ref); await press(el, signal, !!double); return { ok: true }; },
    input_text: async ({ windowId, ref, value, submit, mode }, signal) => {
      const el = refEl(windowId, ref);
      await typeInto(el, value, mode, signal);
      if (submit) keyEvent(el, 'Enter');
      return { ok: true };
    },
    press_keys: async ({ keys }, signal) => {
      const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : wm.getActive()?.body || document.body;
      for (const combo of String(keys).split(/\s+/).filter(Boolean)) { if (C.isVisible()) await C.typeAnim(2, signal); keyEvent(target, combo); await sleep(60); }
      return { ok: true };
    },
    list_files: async ({ path }) => {
      const st = await fs.stat(path);
      if (!st || st.kind !== 'dir') throw new Error(`「${path}」というフォルダはありません`);
      return { path, entries: (await fs.list(path)).slice(0, 300).map((e) => ({ name: e.name, kind: e.kind === 'dir' ? 'フォルダ' : 'ファイル', size: e.size })) };
    },
    read_file: async ({ path }) => {
      const st = await fs.stat(path);
      if (!st || st.kind !== 'file') throw new Error(`「${path}」というファイルはありません`);
      if (!isText(path)) return { path, type: st.type || '', size: st.size, note: '文字のファイルではないので、中身は読みません' };
      const text = await fs.readText(path);
      return { path, size: st.size, text: text.length > 100000 ? text.slice(0, 100000) + '\n…（ここで切りました）' : text };
    },
    write_file: async ({ path, content }) => { await fs.write(path, content, 'text/plain;charset=utf-8'); return { path, size: content.length }; },
    delete_file: async ({ path, permanent }) => {
      if (!(await fs.stat(path))) throw new Error(`「${path}」はありません`);
      if (permanent) await fs.remove(path); else await fs.trash(path);
      return { path, permanent: !!permanent };
    },
    open_file: async ({ path, appId }) => { const w = await os.openFile(path, appId); return { windowId: w?.id ?? null, title: w?.title ?? '' }; },
    open_url: async ({ url }) => { const w = await os.launch('browser', { url }); return { windowId: w?.id ?? null }; },
  };

  // 道具を1つ動かす。source: 'mcp' / 'api' / 'guide'。戻り値は { ok, result } か { ok: false, error }
  async function call(name, args = {}, { source = 'api' } = {}) {
    await ensure();
    const v = A.validateArgs(name, args);
    if (!v.ok) return { ok: false, error: v.error };
    const signal = begin();
    try {
      // 確かめが要る操作は、画面で利用者に聞く（AI からは押せないダイアログ）
      const exists = name === 'write_file' ? !!(await fs.stat(args.path)) && (await fs.readText(args.path).catch(() => null)) !== args.content : false;
      const need = A.confirmNeeded(name, args, { exists });
      if (need && !(await confirmAsk(need.text))) {
        log('agent.call', { tool: name, source }, 'denied');
        return { ok: false, error: '利用者が「やめる」を選びました。この操作はしていません' };
      }
      if (C.isVisible() && source !== 'guide' && name !== 'point_and_speak' && name !== 'get_desktop_state' && name !== 'inspect_window') {
        await C.say(A.describeCall(name, args, { appName: appName(args.appId) }), { signal, hold: 350 });
      }
      const result = await impl[name](args, signal);
      if (C.isVisible()) C.hideBubble();
      C.highlight(null);
      log('agent.call', { tool: name, source }, 'ok');
      emit('call', { name, args, ok: true });
      return { ok: true, result };
    } catch (e) {
      const stopped = e.name === 'AbortError';
      log('agent.call', { tool: name, source }, 'error: ' + A.maskSecrets(e.message));
      emit('call', { name, args, ok: false });
      if (!stopped && C.isVisible()) C.setFrame('apologize_1');
      return { ok: false, error: stopped ? '利用者が止めました' : A.maskSecrets(e.message) };
    } finally { end(); }
  }

  /* ---------- ガイドの台本 ---------- */
  function resolveTarget(t) {
    if (!t) return null;
    if (t.guideId) return guideEl(t.guideId);
    if (t.selector) return document.querySelector(t.selector);
    if (t.app) return wm.list().find((w) => w.app === t.app)?.el || null;
    return null;
  }
  async function runGuide(script) {
    await ensure();
    const errs = G.validateScript(script);
    if (errs.length) throw new Error('台本の形が正しくありません: ' + errs.join(' / '));
    const shown = C.isVisible(); C.show();
    const signal = begin();
    log('agent.guide', { id: script.id }, 'start');
    let r = G.start();
    try {
      while (!r.done) {
        const st = G.current(script, r);
        if (st.emotion) C.setFrame(st.emotion);
        let el = null;
        // 台本の中の「押す」「打つ」は、参照番号ではなく target の部品に対して行う
        if (st.action && ['click_element', 'input_text'].includes(st.action.tool) && st.target) {
          el = resolveTarget(st.target);
          if (!el) throw new Error('台本の目当ての部品が見つかりません');
          if (st.action.tool === 'click_element') await press(el, signal);
          else await typeInto(el, String(st.action.args?.value ?? ''), st.action.args?.mode, signal);
        } else if (st.action) {
          const res = await call(st.action.tool, st.action.args || {}, { source: 'guide' });
          if (!res.ok) throw new Error(res.error);
        }
        el ||= resolveTarget(st.target);
        if (el) await approach(el, signal); else C.highlight(null);
        const buttons = [{ label: G.progress(script, r) === `${script.steps.length} / ${script.steps.length}` ? '終わる' : '次へ(Enter)', value: 'next' }];
        if (r.i > 0) buttons.push({ label: '戻る', value: 'back' });
        if (st.waitFor === 'target' && el) buttons.splice(1, 0, { label: '代わりにやって', value: 'do' });
        let choice;
        if (st.waitFor === 'target' && el) {
          // 利用者がその部品を押すのを待つ（「代わりにやって」でイコちゃんが押す）
          const clicked = new Promise((ok) => el.addEventListener('click', () => ok('next'), { once: true, capture: true }));
          choice = await Promise.race([C.say(st.say || '', { signal, buttons }), clicked]);
          if (choice === 'do') { await press(el, signal); choice = 'next'; }
        } else if (typeof st.waitFor === 'number') { await C.say(st.say || '', { signal, hold: st.waitFor }); choice = 'next'; }
        else choice = await C.say(st.say || '', { signal, buttons });
        C.highlight(null);
        r = choice === 'back' ? G.back(script, r) : G.next(script, r);
      }
      C.hideBubble(); C.setFrame('happy_1'); await sleep(500);
      log('agent.guide', { id: script.id }, 'ok');
      return true;
    } catch (e) {
      C.hideBubble();
      log('agent.guide', { id: script.id }, e.name === 'AbortError' ? 'stopped' : 'error: ' + e.message);
      if (e.name !== 'AbortError') throw e;
      return false;
    } finally {
      end(); C.highlight(null);
      if (!shown) C.hide(); else { await C.moveTo({ ...homePos() }, null).catch(() => {}); C.setFrame('idle_1'); }
    }
  }
  const homePos = () => ({ x: innerWidth - 96 - 24, y: innerHeight - 96 - 28 });

  return {
    call, runGuide, stop, events, tools: A.TOOLS,
    get running() { return running > 0; },
    async show() { await ensure(); C.show(); }, hide: () => C.hide(), isVisible: () => C.isVisible(),
    setSpeed: (s) => C.setSpeed(s), getSpeed: () => C.getSpeed(), frameCanvas: (n) => C.frameCanvas(n),
    async goHome() { await ensure(); await C.moveTo(homePos(), null); },
  };
}
