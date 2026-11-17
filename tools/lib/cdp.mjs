// Chrome（なければ Edge）を画面に出さずに動かし、Chrome の開発用の通信（DevTools Protocol）で操作する部分。
// tools/shoot.mjs（画面写真）と tools/gemini-browse.mjs（Gemini が画面を操作する）が使う。ライブラリは使わない。
// 利用者の Chrome の設定には触れず、渡された使い捨ての設定のフォルダ（profile）を使う。
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
export const browserPath = () => CANDIDATES.find((p) => existsSync(p)) || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 計算だけの部分（tests/cdp-keys.test.mjs）----
const NAMED = {
  Enter: [13, '\r'], Escape: [27], Tab: [9], Backspace: [8], Delete: [46], Insert: [45], Home: [36], End: [35],
  PageUp: [33], PageDown: [34], ArrowUp: [38], ArrowDown: [40], ArrowLeft: [37], ArrowRight: [39],
  Control: [17], Shift: [16], Alt: [18], Meta: [91],
};
const ALIAS = {
  return: 'Enter', enter: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab', backspace: 'Backspace', del: 'Delete', delete: 'Delete',
  ins: 'Insert', insert: 'Insert', home: 'Home', end: 'End', pageup: 'PageUp', pgup: 'PageUp', pagedown: 'PageDown', pgdn: 'PageDown',
  up: 'ArrowUp', arrowup: 'ArrowUp', down: 'ArrowDown', arrowdown: 'ArrowDown', left: 'ArrowLeft', arrowleft: 'ArrowLeft', right: 'ArrowRight', arrowright: 'ArrowRight',
  ctrl: 'Control', control: 'Control', shift: 'Shift', alt: 'Alt', option: 'Alt', meta: 'Meta', cmd: 'Meta', command: 'Meta', win: 'Meta', super: 'Meta',
  space: ' ', spacebar: ' ',
};
const PUNCT = { '/': ['Slash', 191], '.': ['Period', 190], ',': ['Comma', 188], '-': ['Minus', 189], '=': ['Equal', 187], ';': ['Semicolon', 186], "'": ['Quote', 222], '[': ['BracketLeft', 219], ']': ['BracketRight', 221], '\\': ['Backslash', 220], '`': ['Backquote', 192] };
const MOD_BIT = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
const MOD_CODE = { Control: 'ControlLeft', Shift: 'ShiftLeft', Alt: 'AltLeft', Meta: 'MetaLeft' };

export function keyInfo(name) {
  let k = String(name);
  if (k.length > 1) k = ALIAS[k.toLowerCase()] ?? k;
  if (k === ' ') return { key: ' ', code: 'Space', keyCode: 32, text: ' ' };
  const f = /^f([1-9]|1[0-2])$/i.exec(k);
  if (f) return { key: 'F' + f[1], code: 'F' + f[1], keyCode: 111 + +f[1] };
  if (NAMED[k]) {
    const [keyCode, text] = NAMED[k];
    return text ? { key: k, code: MOD_CODE[k] || k, keyCode, text } : { key: k, code: MOD_CODE[k] || k, keyCode };
  }
  if (/^[a-z]$/i.test(k)) { const c = k.toLowerCase(); return { key: c, code: 'Key' + c.toUpperCase(), keyCode: c.toUpperCase().charCodeAt(0), text: c }; }
  if (/^[0-9]$/.test(k)) return { key: k, code: 'Digit' + k, keyCode: 48 + +k, text: k };
  if (PUNCT[k]) return { key: k, code: PUNCT[k][0], keyCode: PUNCT[k][1], text: k };
  return { key: k, code: '', keyCode: 0, text: k.length === 1 ? k : undefined };
}
// 'Control+A' や ['ctrl','shift','s'] を、修飾キー（印の合計）と本体のキーに分ける
export function parseCombo(keys) {
  // 文字列は + で区切る。ただし「+」そのものと、末尾の「++」（Shift++ など）は + のキーとして読む
  const str = String(keys);
  const parts = (Array.isArray(keys) ? keys : str === '+' ? ['+'] : str.endsWith('++') ? [...str.slice(0, -2).split('+'), '+'] : str.split('+')).map((s) => String(s).trim()).filter(Boolean);
  const mods = [], rest = [];
  for (const p of parts) {
    const a = p.length > 1 ? ALIAS[p.toLowerCase()] ?? p : p;
    if (MOD_BIT[a]) mods.push(a); else rest.push(p);
  }
  const main = rest.length ? (rest[rest.length - 1].length === 1 ? rest[rest.length - 1].toLowerCase() : rest[rest.length - 1]) : null;
  return { modifiers: mods.reduce((s, m) => s | MOD_BIT[m], 0), mods, main };
}
// Gemini の press_key は、修飾キーを別の欄（modifiers: ['Control']）で送ってくる。parseCombo に渡せる並びにする
export function withModifiers(key, modifiers = []) {
  const mods = (Array.isArray(modifiers) ? modifiers : [modifiers]).filter(Boolean);
  if (!mods.length) return key; // 「Control+z」のような文字列は、そのまま parseCombo に区切らせる
  const k = String(key);
  return [...mods, ...(k.length > 1 && k.includes('+') ? k.split('+') : [k])];
}
// キーを押したときに打たれる文字。Shift 以外の修飾キーが付けば打たない。Shift と英字は大文字にする
export function typedText(main, mods = []) {
  if (mods.some((m) => m !== 'Shift')) return null;
  const t = keyInfo(main).text;
  if (!t || t === '\r') return t ?? null;
  return mods.includes('Shift') && /^[a-z]$/.test(t) ? t.toUpperCase() : t;
}
// Gemini の座標（0〜999）を画素にする
export const toPixel = (v, size) => Math.min(size - 1, Math.max(0, Math.round((Number(v) / 1000) * size)));
// Gemini はドラッグの出発点と行き先を、いろいろな名前で送ってくる（2026-11-17 に記録で確かめた）。[sx, sy, ex, ey] にそろえる
export function dragArgs(a) {
  const pick = (...keys) => { for (const k of keys) if (a[k] != null && Number.isFinite(+a[k])) return +a[k]; return null; };
  const r = [pick('start_x', 'from_x', 'x', 'source_x'), pick('start_y', 'from_y', 'y', 'source_y'),
    pick('end_x', 'destination_x', 'target_x', 'drop_x', 'to_x'), pick('end_y', 'destination_y', 'target_y', 'drop_y', 'to_y')];
  return r.includes(null) ? null : r;
}
export function sameOrigin(base, url) {
  try { return new URL(url).origin === new URL(base).origin; } catch { return false; }
}

// ---- Chrome を動かす部分 ----
// 戻り値: 1つのページを操作する関数の集まり。最後に close() を呼ぶ
export async function openBrowser({ width = 1280, height = 800, dark = false, profile }) {
  const exe = browserPath();
  if (!exe) throw new Error('Chrome も Edge も見つかりません。CHROME_PATH で場所を教えてください');
  mkdirSync(profile, { recursive: true });
  const portFile = join(profile, 'DevToolsActivePort');
  // 前の Chrome が終わりきる前は、ファイルが使用中のことがある。少し待って消し直す
  for (let i = 0; i < 50; i++) { try { rmSync(portFile, { force: true }); break; } catch { await sleep(200); } }
  const proc = spawn(exe, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--autoplay-policy=no-user-gesture-required',
    `--blink-settings=preferredColorScheme=${dark ? 0 : 1}`, ...(dark ? ['--force-dark-mode'] : []), 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  // 終わるまで最大 3 秒待ち、残っていれば子プロセスごと止める（Chrome は複数のプロセスで動くため）
  const kill = async () => {
    for (let i = 0; i < 30 && proc.exitCode === null; i++) await sleep(100);
    if (proc.exitCode === null) { try { execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { proc.kill(); } }
  };
  let lines = null;
  for (let i = 0; i < 150 && !lines; i++) {
    await sleep(100);
    if (existsSync(portFile)) { try { const t = readFileSync(portFile, 'utf8').trim().split('\n'); if (t.length >= 2) lines = t; } catch { /* 書き込み中 */ } }
  }
  if (!lines) { await kill(); throw new Error('Chrome の開発用の通信につながりませんでした'); }
  const ws = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('Chrome へつなげませんでした')); });
  let id = 0;
  const waiting = new Map(), listeners = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) listeners.forEach((f) => f(m));
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const n = ++id; waiting.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  await s('Page.enable');
  await s('Runtime.enable');
  const consoleErrors = [];
  listeners.push((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '例外');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  });
  const evaluate = async (expression) => (await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  let buttons = 0;
  const mouse = (type, x, y, o = {}) => s('Input.dispatchMouseEvent', { type, x, y, button: o.button || 'none', buttons: o.buttons ?? buttons, clickCount: o.clickCount || 0, modifiers: o.modifiers || 0, deltaX: o.deltaX || 0, deltaY: o.deltaY || 0 });
  const BTN = { left: 1, right: 2, middle: 4 };
  const page = {
    width, height, consoleErrors,
    async navigate(url) {
      const loaded = new Promise((res) => { const f = (m) => { if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) res(); }; listeners.push(f); setTimeout(res, 30000); });
      await s('Page.navigate', { url });
      await loaded;
    },
    async waitFor(selector, ms = 30000) {
      for (let t = 0; t < ms; t += 100) { if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return true; await sleep(100); }
      return false;
    },
    async screenshot() { return (await s('Page.captureScreenshot', { format: 'png' })).data; },
    evaluate,
    url: () => evaluate('location.href'),
    move: (x, y) => mouse('mouseMoved', x, y),
    async down(x, y, button = 'left') { buttons |= BTN[button]; await mouse('mousePressed', x, y, { button, clickCount: 1 }); },
    async up(x, y, button = 'left') { buttons &= ~BTN[button]; await mouse('mouseReleased', x, y, { button, clickCount: 1 }); },
    async click(x, y, { button = 'left', count = 1, modifiers = 0 } = {}) {
      await mouse('mouseMoved', x, y);
      for (let c = 1; c <= count; c++) {
        await mouse('mousePressed', x, y, { button, clickCount: c, buttons: BTN[button], modifiers });
        await mouse('mouseReleased', x, y, { button, clickCount: c, buttons: 0, modifiers });
      }
    },
    async drag(sx, sy, ex, ey) {
      await mouse('mouseMoved', sx, sy);
      await mouse('mousePressed', sx, sy, { button: 'left', clickCount: 1, buttons: 1 });
      for (let i = 1; i <= 10; i++) { await mouse('mouseMoved', sx + ((ex - sx) * i) / 10, sy + ((ey - sy) * i) / 10, { buttons: 1 }); await sleep(16); }
      await mouse('mouseReleased', ex, ey, { button: 'left', clickCount: 1, buttons: 0 });
    },
    wheel: (x, y, dx, dy) => mouse('mouseWheel', x, y, { deltaX: dx, deltaY: dy }),
    async key(combo, type = 'press') {
      const { modifiers, mods, main } = parseCombo(combo);
      const keyEvent = (t, info, mod) => s('Input.dispatchKeyEvent', { type: t, modifiers: mod, key: info.key, code: info.code, windowsVirtualKeyCode: info.keyCode, nativeVirtualKeyCode: info.keyCode, ...(t === 'keyDown' && info.text ? { text: info.text, unmodifiedText: info.text } : {}) });
      const text = main ? typedText(main, mods) : null;
      if (type !== 'up') { let m = 0; for (const md of mods) { m |= MOD_BIT[md]; await keyEvent('rawKeyDown', keyInfo(md), m); } }
      if (main) {
        const info = keyInfo(main);
        if (text && text !== info.text) { info.text = text; info.key = text; }
        if (type !== 'up') await keyEvent(text ? 'keyDown' : 'rawKeyDown', info, modifiers);
        if (type !== 'down') await keyEvent('keyUp', info, modifiers);
      }
      if (type !== 'down') { let m = modifiers; for (const md of [...mods].reverse()) { m &= ~MOD_BIT[md]; await keyEvent('keyUp', keyInfo(md), m); } }
    },
    typeText: (text) => s('Input.insertText', { text }),
    async close() { await send('Browser.close').catch(() => {}); try { ws.close(); } catch { /* 閉じ済み */ } await kill(); },
  };
  return page;
}
