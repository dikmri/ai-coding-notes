// ビューアの動画の再生と字幕、「写真の現像で開く」、新しい関連付け（動画・.epub・.fdaw）、ファイルの箱の場所を、
// OS の中で画面なしの Chrome で確かめる（音は出さない）。
// 使い方: 先に node tools/serve.mjs 8808 を動かしてから、node tools/viewer-check.mjs [番号=8808]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8808;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'viewer-check');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1280, height: 800, profile: join(ROOT, 'runtime', 'viewer-check-profile') });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info ? ' ' + info : ''}`); };
const wait = async (js, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (await ev(js)) return true; await sleep(200); } return false; };
const shell = "const s = await import('./js/shell.mjs');";
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");

try {
  await page.navigate(URL0 + '?shot');
  await wait("return !!document.querySelector('#desk:not([hidden]) .desk-icon')", 20000);
  await sleep(500);
  await wipe();
  await page.navigate(URL0 + '?shot');
  await wait("return !!document.querySelector('#desk:not([hidden]) .desk-icon')", 20000);
  await sleep(800);
  ok('最初に /ビデオ と /本 のフォルダができる', await ev("const fs = await import('./js/fs.mjs'); return (await fs.exists('/ビデオ')) && (await fs.exists('/本'));"));
  ok('はじめに.txt に新しいアプリが載る', await ev("const fs = await import('./js/fs.mjs'); const t = await fs.readText('/ドキュメント/はじめに.txt'); return ['講座「夕暮れ峠をもう一度」', '文書', '表計算', 'ドット絵エディタ', '図形エディタ', '写真の現像', '動画の編集', 'リズムマシン', '音の実験室', '多重録音スタジオ', '音声エディタ', '本棚'].every((n) => t.includes('・' + n));"));

  // 短い動画を作って /ビデオ に置き、同じ名前の字幕も置く
  const made = await ev(`const fs = await import('./js/fs.mjs');
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' }); const parts = []; rec.ondataavailable = (e) => parts.push(e.data);
    let f = 0; const timer = setInterval(() => { g.fillStyle = 'hsl(' + (f++ * 12) + ' 70% 50%)'; g.fillRect(0, 0, 320, 180); }, 33);
    rec.start(); await new Promise((r) => setTimeout(r, 1200)); rec.stop(); await new Promise((r) => (rec.onstop = r)); clearInterval(timer);
    await fs.write('/ビデオ/試し.webm', new Blob(parts, { type: 'video/webm' }), 'video/webm');
    await fs.write('/ビデオ/試し.vtt', 'WEBVTT\\n\\n00:00.000 --> 00:01.000\\n夕暮れの試し\\n', 'text/vtt');
    return (await fs.stat('/ビデオ/試し.webm')).size;`);
  ok('試しの動画を作れる', made > 1000, `${made} バイト`);
  await ev(`${shell} await s.openFile('/ビデオ/試し.webm'); return true;`);
  ok('.webm を開くとビューアで開く', await wait("return !!document.querySelector('.app-viewer video')", 10000));
  await wait("return /320 × 180/.test(document.querySelector('.app-viewer [data-info]')?.textContent || '')", 8000);
  const info = await ev("return document.querySelector('.app-viewer [data-info]')?.textContent || ''");
  ok('動画の大きさと字幕ありが出る', /320 × 180/.test(info) && /字幕あり/.test(info), info);
  ok('字幕の track が付く', await ev("const t = document.querySelector('.app-viewer video track'); return !!t && t.kind === 'captions' && t.srclang === 'ja';"));
  writeFileSync(join(OUT, '01-video.png'), Buffer.from(await page.screenshot(), 'base64'));
  ok('動画では お絵かき・拡大 のメニューが使えない', await ev("return document.querySelector('.app-viewer [data-command=paint]').getAttribute('aria-disabled') === 'true' && document.querySelector('.app-viewer [data-command=in]').getAttribute('aria-disabled') === 'true';"));

  // 画像: 写真の現像で開く
  await ev(`const fs = await import('./js/fs.mjs'); const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#e07a3c'; g.fillRect(0, 0, 64, 48);
    await fs.write('/画像/試し.png', await new Promise((r) => c.toBlob(r, 'image/png')), 'image/png'); ${shell} await s.openFile('/画像/試し.png'); return true;`);
  ok('PNG はビューアで開く', await wait("return !!document.querySelector('.app-viewer img')", 10000));
  ok('画像では「写真の現像で開く」が使える', await ev("return !document.querySelector('.app-viewer:has(.view-area img) [data-command=develop]').hasAttribute('aria-disabled');"));
  await ev("document.querySelector('.app-viewer:has(.view-area img) .app-body').dispatchEvent(new CustomEvent('w95:command', { detail: { command: 'develop' }, bubbles: true })); return true;");
  ok('「写真の現像で開く」で写真の現像がその画像で開く', await wait("return /試し\\.png - 写真の現像/.test(document.querySelector('.app-photo .title-bar-text')?.textContent || '')", 15000));

  // 関連付け: .epub は本棚、.fdaw は多重録音スタジオ
  const assoc = await ev("const a = await import('./js/core/assoc.mjs'); return JSON.stringify(['x.epub', 'x.fdaw', 'x.mp4', 'x.ogv', 'x.weba'].map((n) => a.appFor(n)));");
  ok('関連付け: .epub→本棚、.fdaw→多重録音、.mp4・.ogv→ビューア、.weba は音楽プレーヤーのまま', assoc === JSON.stringify(['books', 'daw', 'viewer', 'viewer', 'player']), assoc);
  ok('アイコン: .epub は本棚、.fdaw は多重録音スタジオのアイコン', await ev(`${shell} return s.iconFor({ kind: 'file', name: 'a.epub' }) === 'icons/books.svg' && s.iconFor({ kind: 'file', name: 'a.fdaw' }) === 'icons/daw.svg';`));

  // ファイルの箱の場所の候補
  await ev(`${shell} s.fileDialog({ mode: 'open', dir: '/ドキュメント' }); return true;`);
  await sleep(800);
  const places = await ev("const d = [...document.querySelectorAll('dialog[open]')].pop(); return d ? d.textContent : '';");
  ok('ファイルの箱の場所に ビデオ と 本 が出る', places.includes('ビデオ') && places.includes('本'));
  writeFileSync(join(OUT, '02-dialog.png'), Buffer.from(await page.screenshot(), 'base64'));
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 2).join(' | '));
} catch (e) {
  ok('途中で止まらない', false, e.message);
} finally {
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'viewer-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
