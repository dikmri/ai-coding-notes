// ページの画面写真を撮る道具。Chrome（なければ Edge）を画面に出さずに動かし、build/shots/<名前>.png に保存する。
// 利用者の Chrome の設定には触れず、runtime/shot-profile に使い捨ての設定を作って使う。
// Chrome の開発用の通信（DevTools Protocol、tools/lib/cdp.mjs）で動かし、実際の時間で待つ。IndexedDB などの読み込みを待ってから撮れる。
//
// 使い方: node tools/shoot.mjs <URL> <名前> [--size 1280x800] [--dark] [--wait 1500] [--until "CSSセレクタ"]
//   --wait  読み込みが終わってから撮るまでに待つ時間（ミリ秒）
//   --until この要素が出るまで待つ（最大 30 秒）。例: "#desk:not([hidden])"
//   例: node tools/shoot.mjs "http://localhost:8765/#e=shape-heart" detail-pc --size 1280x800
//       node tools/shoot.mjs "http://localhost:8767/os/?shot=synth" os-synth --until "#desk:not([hidden])" --wait 2000
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIN } from './lib/gemini-client.mjs';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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
const out = join(ROOT, 'build/shots', `${name}.png`);
mkdirSync(dirname(out), { recursive: true });
const [w, h] = opt.size.split('x').map(Number);

try {
  const page = await openBrowser({ width: w, height: h, dark: opt.dark, profile: join(ROOT, 'runtime/shot-profile') });
  try {
    await page.navigate(url);
    if (opt.until && !(await page.waitFor(opt.until))) throw new Error(`30 秒待っても「${opt.until}」が出ませんでした`);
    await new Promise((r) => setTimeout(r, opt.wait));
    writeFileSync(out, Buffer.from(await page.screenshot(), 'base64'));
  } finally { await page.close(); }
  log('ok');
  console.log('保存: ' + out.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', ''));
} catch (e) {
  log('error: ' + e.message);
  console.error('失敗: ' + e.message);
  process.exit(1);
}
