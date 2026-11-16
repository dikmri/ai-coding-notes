// ページの画面写真を撮る道具。Chrome（なければ Edge）を画面に出さずに動かし、build/shots/<名前>.png に保存する。
// 利用者の Chrome の設定には触れず、runtime/shot-profile に使い捨ての設定を作って使う。
// Chrome の開発用の通信（DevTools Protocol）で動かし、実際の時間で待つ。IndexedDB などの読み込みを待ってから撮れる。
//
// 使い方: node tools/shoot.mjs <URL> <名前> [--size 1280x800] [--dark] [--wait 1500] [--until "CSSセレクタ"]
//   --wait  読み込みが終わってから撮るまでに待つ時間（ミリ秒）
//   --until この要素が出るまで待つ（最大 30 秒）。例: "#desk:not([hidden])"
//   例: node tools/shoot.mjs "http://localhost:8765/#e=shape-heart" detail-pc --size 1280x800
//       node tools/shoot.mjs "http://localhost:8767/os/?shot=synth" os-synth --until "#desk:not([hidden])" --wait 2000
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIN } from './lib/gemini-client.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const browser = CANDIDATES.find((p) => existsSync(p));
const [url, name, ...rest] = process.argv.slice(2);
// 配色は必ず指定する（指定しないと Windows の暗い表示の設定を引き継ぐ）
const opt = { size: '1280x800', dark: false, wait: 1500, until: null };
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--size') opt.size = rest[++i];
  else if (rest[i] === '--dark') opt.dark = true;
  else if (rest[i] === '--wait') opt.wait = +rest[++i];
  else if (rest[i] === '--until') opt.until = rest[++i];
}
// ログは、作業用の別のチェックアウトから撮っても元のチェックアウトの logs/gemini.log に集める
const log = (result) => { mkdirSync(join(MAIN, 'logs'), { recursive: true }); appendFileSync(join(MAIN, 'logs/gemini.log'), `${new Date().toISOString()} shot.take args=${JSON.stringify({ url, name, ...opt })} result=${result}\n`); };
if (!url || !name || !/^[\w-]+$/.test(name)) { console.error('使い方: node tools/shoot.mjs <URL> <名前（英数字と - だけ）> [--size 1280x800] [--dark] [--wait 1500] [--until "セレクタ"]'); process.exit(1); }
if (!browser) { log('error: Chrome も Edge も見つかりません'); console.error('Chrome も Edge も見つかりません。CHROME_PATH で場所を教えてください'); process.exit(1); }
const out = join(ROOT, 'build/shots', `${name}.png`);
mkdirSync(dirname(out), { recursive: true });
const [w, h] = opt.size.split('x').map(Number);
const profile = join(ROOT, 'runtime/shot-profile');
const portFile = join(profile, 'DevToolsActivePort');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot() {
  mkdirSync(profile, { recursive: true });
  rmSync(portFile, { force: true });
  const proc = spawn(browser, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--autoplay-policy=no-user-gesture-required',
    `--blink-settings=preferredColorScheme=${opt.dark ? 0 : 1}`, ...(opt.dark ? ['--force-dark-mode'] : []), 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  try {
    let lines = null;
    for (let i = 0; i < 150 && !lines; i++) { await sleep(100); if (existsSync(portFile)) { const t = readFileSync(portFile, 'utf8').trim().split('\n'); if (t.length >= 2) lines = t; } }
    if (!lines) throw new Error('Chrome の開発用の通信につながりませんでした');
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
    await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: opt.dark ? 'dark' : 'light' }] });
    await s('Page.enable');
    const loaded = new Promise((res) => { listeners.push((m) => { if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) res(); }); setTimeout(res, 30000); });
    await s('Page.navigate', { url });
    await loaded;
    if (opt.until) {
      let ok = false;
      for (let i = 0; i < 300 && !ok; i++) {
        const r = await s('Runtime.evaluate', { expression: `!!document.querySelector(${JSON.stringify(opt.until)})`, returnByValue: true });
        ok = r.result.value === true;
        if (!ok) await sleep(100);
      }
      if (!ok) throw new Error(`30 秒待っても「${opt.until}」が出ませんでした`);
    }
    await sleep(opt.wait);
    const { data } = await s('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out, Buffer.from(data, 'base64'));
    await send('Browser.close').catch(() => {});
    ws.close();
  } finally {
    await sleep(300);
    if (proc.exitCode === null) proc.kill();
  }
}

try {
  await shoot();
  log('ok');
  console.log('保存: ' + out.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', ''));
} catch (e) {
  log('error: ' + e.message);
  console.error('失敗: ' + e.message);
  process.exit(1);
}
