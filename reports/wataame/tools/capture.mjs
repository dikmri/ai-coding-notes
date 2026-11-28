// わたあめサテライトの画面を、画面なしの Chrome（音なし）で 1 コマずつ撮り、ffmpeg で音と合わせて mp4 にする。
// 動画はサイトに載せない（34 MB になるため。ページの中のプレーヤーが同じ絵をその場で描く）。作った mp4 は build/wataame/ に置く。
//
//   node reports/wataame/tools/capture.mjs --port 8798 --shots 0,30,40.5     その時刻の静止画を build/wataame/shots/ に PNG で保存
//   node reports/wataame/tools/capture.mjs --port 8798 --video               全部のコマを撮って build/wataame/wataame.mp4 を作る
//   node reports/wataame/tools/capture.mjs --port 8798 --video --from 24 --to 34   一部だけ（試し用）
//   node reports/wataame/tools/capture.mjs --port 8798 --webp img/foo.webp --at 40.5   レポート用の写真（reports/wataame/ からの場所）
//   node reports/wataame/tools/capture.mjs --port 8798 --stills hero@40.6,verse@14     何枚も（reports/wataame/img/名前.webp）
//
// 先に tools/serve.mjs をその番号で動かしておく。記録は logs/wataame-capture.log。
import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from '../../../tools/lib/cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'build', 'wataame');
const LOG = join(ROOT, 'logs', 'wataame-capture.log');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i < 0 ? def : args[i + 1]; };
const has = (name) => args.includes(`--${name}`);
const port = Number(opt('port', 8798));
const base = opt('base', `http://localhost:${port}/reports/wataame/player/`);
const fps = Number(opt('fps', 60));

mkdirSync(join(ROOT, 'logs'), { recursive: true });
const log = (event, a = {}, result = 'ok') => {
  const line = `${new Date().toISOString()} capture.${event} args=${JSON.stringify(a)} result=${result}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
};

const page = await openBrowser({ width: 1920, height: 1080, profile: join(OUT, `chrome-profile-${process.pid}`) });
try {
  await page.navigate(`${base}?capture=1`);
  const info = await page.evaluate('window.__wataame.ready');
  if (!info) throw new Error('撮影モードの準備ができませんでした');
  log('ready', { base, ...info });
  const frameAt = async (t, type = 'jpeg', q = 0.93) => {
    const url = await page.evaluate(`(window.__wataame.renderAt(${t}), document.getElementById('stage').toDataURL('image/${type}', ${q}))`);
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  };

  if (opt('shots')) {
    const dir = join(OUT, 'shots');
    mkdirSync(dir, { recursive: true });
    for (const s of opt('shots').split(',')) {
      const t = Number(s);
      const file = join(dir, `t${t.toFixed(2).replace('.', '_')}.png`);
      writeFileSync(file, await frameAt(t, 'png', 1));
      log('shot', { t, file });
    }
  }
  if (opt('stills')) {
    // 名前@時刻,名前@時刻 … → reports/wataame/img/名前.webp
    for (const item of opt('stills').split(',')) {
      const [name, at] = item.split('@');
      const file = join(ROOT, 'reports', 'wataame', 'img', `${name}.webp`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, await frameAt(Number(at), 'webp', Number(opt('q', 0.86))));
      log('still', { name, t: Number(at), bytes: statSync(file).size });
    }
  }
  if (opt('webp')) {
    const t = Number(opt('at', 0));
    const file = join(ROOT, 'reports', 'wataame', opt('webp'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, await frameAt(t, 'webp', Number(opt('q', 0.86))));
    log('webp', { t, file, bytes: statSync(file).size });
  }
  if (has('video')) {
    const from = Number(opt('from', 0));
    const to = Number(opt('to', info.duration));
    const n = Math.round((to - from) * fps);
    const part = has('from') || has('to');
    const out = join(OUT, part ? `wataame-${from}-${to}.mp4` : 'wataame.mp4');
    const wav = join(OUT, 'wataame.wav');
    if (!existsSync(wav)) throw new Error(`${wav} がありません。先に render.py を動かしてください`);
    const ff = spawn('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-ss', String(from), '-t', String(to - from), '-i', wav,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(opt('crf', 20)), '-tune', 'animation', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out,
    ], { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
    const done = new Promise((res, rej) => { ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg が ${c} で終わりました`)))); });
    const t0 = Date.now();
    log('video.start', { from, to, frames: n, fps, out });
    for (let i = 0; i < n; i++) {
      const buf = await frameAt(from + i / fps);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 600 === 0) log('video.progress', { frame: i, of: n, sec: +((Date.now() - t0) / 1000).toFixed(1) });
    }
    ff.stdin.end();
    await done;
    log('video.done', { out, frames: n, bytes: statSync(out).size, sec: +((Date.now() - t0) / 1000).toFixed(1) });
  }
  if (page.consoleErrors.length) log('console', { errors: page.consoleErrors.slice(0, 5) }, 'error');
} catch (err) {
  log('error', { msg: String(err) }, `error ${err.message}`);
  process.exitCode = 1;
} finally {
  await page.close?.();
}
