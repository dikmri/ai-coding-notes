// ページの画面写真を撮る道具。Chrome（なければ Edge）を画面に出さずに動かし、build/shots/<名前>.png に保存する。
// 利用者の Chrome の設定には触れず、runtime/shot-profile に使い捨ての設定を作って使う。
//
// 使い方: node tools/shoot.mjs <URL> <名前> [--size 1280x800] [--dark] [--wait 2500]
//   例: node tools/shoot.mjs "http://localhost:8765/#e=shape-heart" detail-pc --size 1280x800
//       node tools/shoot.mjs http://localhost:8765/ top-phone --size 390x844
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
// 配色は必ず指定する（指定しないと Windows の暗い表示の設定を引き継ぐ）。Blink の preferredColorScheme は 0 が暗い、1 が明るい
const opt = { size: '1280x800', dark: false, wait: 2500 };
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--size') opt.size = rest[++i];
  else if (rest[i] === '--dark') opt.dark = true;
  else if (rest[i] === '--wait') opt.wait = +rest[++i];
}
const log = (result) => { mkdirSync(join(ROOT, 'logs'), { recursive: true }); appendFileSync(join(ROOT, 'logs/gemini.log'), `${new Date().toISOString()} shot.take args=${JSON.stringify({ url, name, ...opt })} result=${result}\n`); };
if (!url || !name || !/^[\w-]+$/.test(name)) { console.error('使い方: node tools/shoot.mjs <URL> <名前（英数字と - だけ）> [--size 1280x800] [--dark] [--wait 2500]'); process.exit(1); }
if (!browser) { log('error: Chrome も Edge も見つかりません'); console.error('Chrome も Edge も見つかりません。CHROME_PATH で場所を教えてください'); process.exit(1); }
const out = join(ROOT, 'build/shots', `${name}.png`);
mkdirSync(dirname(out), { recursive: true });
const [w, h] = opt.size.split('x').map(Number);
const args = [
  '--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  `--user-data-dir=${join(ROOT, 'runtime/shot-profile')}`, `--window-size=${w},${h}`, `--virtual-time-budget=${opt.wait}`,
  `--screenshot=${out}`, `--blink-settings=preferredColorScheme=${opt.dark ? 0 : 1}`, ...(opt.dark ? ['--force-dark-mode'] : []), url,
];
try {
  execFileSync(browser, args, { stdio: 'ignore', timeout: 60000 });
  if (!existsSync(out)) throw new Error('画像ができませんでした');
  log('ok');
  console.log('保存: ' + out.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', ''));
} catch (e) {
  log('error: ' + e.message);
  console.error('失敗: ' + e.message);
  process.exit(1);
}
