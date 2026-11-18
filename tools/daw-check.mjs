// 多重録音スタジオ（os/js/apps/daw.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// 見本の曲 → 再生 → 分ける・切り詰める・動かす・元に戻す・フェード・音量・コピーと貼り付け・消す → 保存 → 開き直して同じか →
// ミックスダウン（長さ、消音した段が入らないこと、単独の段と比べる、ループの範囲）→ 作り物のマイクで録音 → 見つからない音の印と差し替え → 目盛りと拡大。
// 確かめ専用の Chrome のプロファイル（runtime/daw-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8803 を動かしてから、node tools/daw-check.mjs [番号=8803]
//   画面の写真は build/daw-check/、結果は logs/daw-check.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8803;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'daw-check');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'daw-profile'), fakeMedia: true });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info: String(info) }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info !== '' ? ' ' + info : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
const waitSel = async (sel, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await ev(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(150); } return false; };
const waitFor = async (js, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await ev(js)) return true; await sleep(150); } return false; };
const center = async (sel) => JSON.parse(await ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'null'; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2])`));
async function click(sel, wait = 250, opt) {
  if (!(await waitSel(sel))) throw new Error('見つからない: ' + sel);
  const r = await center(sel);
  await page.click(r[0], r[1], opt);
  await sleep(wait);
}
const D = (expr) => ev(`const d = document.querySelector('.app-daw').dawDebug; return ${expr}`);
const proj = () => D('d.project()');
const clip = async (id) => (await proj()).clips.find((c) => c.id === id);
const box = (id) => D(`d.clipBox(${JSON.stringify(id)})`);
const status = () => ev("return document.querySelector('.app-daw .status-field[data-status]').textContent");
const cmd = (c) => ev(`document.querySelector('.app-daw .app-body').dispatchEvent(new CustomEvent('w95:command', { detail: { command: ${JSON.stringify(c)} }, bubbles: true })); return true;`);
const answer = (value) => click(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 400);
const focusLanes = () => ev("document.querySelector('.app-daw .daw-lanes').focus(); return true;");
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
async function rulerAt(t) {
  const x = await D(`d.timeX(${t})`), r = JSON.parse(await ev("return JSON.stringify(document.querySelector('.app-daw .daw-ruler').getBoundingClientRect())"));
  await page.click(x, r.top + 8); await sleep(200);
}
// 開く・保存の箱に名前を入れて決める
async function fileDialogName(name) {
  if (!(await waitSel('dialog.file-dlg[open] #fdName', 8000))) throw new Error('ファイルの箱が出ない');
  await click('dialog.file-dlg[open] #fdName', 100);
  await page.key('Control+a');
  await page.typeText(name);
  await click('dialog.file-dlg[open] [data-ok]', 500);
}
// 仮想ドライブの WAV を読む（16 ビット）。page の中で使う関数の文字
const WAV = `const fs = await import('./js/fs.mjs');
  const wav = async (p) => { const b = await (await fs.readBlob(p)).arrayBuffer(), dv = new DataView(b); const ch = dv.getUint16(22, true), rate = dv.getUint32(24, true), size = dv.getUint32(40, true); return { ch, rate, frames: size / (2 * ch), pcm: new Int16Array(b, 44, size / 2) }; };`;
async function mix(name, choice, viaMenu = false) {
  if (!viaMenu) await cmd('mixdown');
  if (choice) { if (!(await waitSel('dialog.msgbox[open]', 5000))) throw new Error('範囲を聞く箱が出ない'); await answer(choice); }
  await fileDialogName(name);
  const done = await waitFor(`const fs = await import('./js/fs.mjs'); return (await fs.exists('/音楽/${name}')) && document.querySelector('.app-daw [data-prog]').hidden`, 30000);
  // 書き出しの知らせ（右下のトースト）を閉じる（後の操作の邪魔にならないように）
  await sleep(300);
  await ev("document.querySelectorAll('.fos-toast [data-close]').forEach((b) => b.click()); return true;");
  return done;
}

try {
  await page.navigate(URL0 + '?shot');
  // 起動の途中で空にすると、起動の続きの見本の書き込みが残ることがある。デスクトップのアイコンが並ぶ（起動が終わる）のを待ってから空にする
  await waitSel('#desk:not([hidden]) .desk-icon', 20000);
  await sleep(500);
  await wipe();
  await page.navigate(URL0 + '?shot=daw');

  /* ---------- 1. 開いた直後 ---------- */
  ok('多重録音スタジオの窓が開く', await waitSel('.app-daw .daw-lanes', 20000));
  await sleep(800);
  ok('初めて開くと、はじめの案内が出る', await ev("return !document.querySelector('.app-daw [data-guide]').hidden"));
  ok('状態の帯に、何をすればよいかの案内がある', /見本の曲を作る/.test(await status()), await status());
  ok('段が 1 つ、クリップは無し', await D('d.project().tracks.length === 1 && d.project().clips.length === 0'));
  await shot('01-start');

  /* ---------- 2. 見本の曲 ---------- */
  await click('.app-daw [data-a="demo"]', 300);
  ok('見本の曲: 3 つの段に 6 つのクリップ', await waitFor("const d = document.querySelector('.app-daw').dawDebug; return d.project().clips.length === 6 && d.project().tracks.length === 3", 20000));
  ok('見本の 3 つの WAV が /音楽/多重録音 にできる', await ev("const fs = await import('./js/fs.mjs'); return (await fs.list('/音楽/多重録音')).filter((e) => e.name.startsWith('見本')).length === 3"));
  ok('案内は閉じる', await ev("return document.querySelector('.app-daw [data-guide]').hidden"));
  const p0 = await proj();
  ok('段の名前はドラム・ベース・和音', p0.tracks.map((t) => t.name).join(',') === 'ドラム,ベース,和音');
  await sleep(400);
  await shot('02-demo');

  /* ---------- 3. 再生と停止 ---------- */
  await focusLanes();
  await page.key(' ');
  await sleep(1500);
  ok('Space で再生が始まり、再生位置が進む', (await D('d.playing()')) && (await D('d.playhead()')) > 0.8, await D('d.playhead()'));
  const mw = await ev("return parseFloat(document.querySelector('.app-daw [data-ml]').style.width) || 0");
  ok('マスターの音の大きさの表示が動く', mw > 5, mw + '%');
  const tw = await ev("return parseFloat(document.querySelector('.app-daw .daw-head[data-track=\"t1\"] [data-meter]').style.width) || 0");
  ok('段ごとの音の大きさの表示が動く', tw > 5, tw + '%');
  await shot('03-playing');
  await page.key(' ');
  await sleep(300);
  ok('もう一度 Space で止まる', !(await D('d.playing()')));

  /* ---------- 4. 編集 ---------- */
  const beat = 60 / p0.bpm, onGrid = (t) => Math.abs(t / beat - Math.round(t / beat)) < 1e-6;
  // 分ける: c1 を選び、目盛りで再生位置を 2 秒あたりへ（拍にスナップ）、S
  let b = await box('c1');
  await page.click((b.left + b.right) / 2, b.top + (b.bottom - b.top) * 0.7); await sleep(200);
  await rulerAt(2.0);
  const cut = await D('d.playhead()');
  await page.key('s'); await sleep(300);
  let p = await proj();
  const c1 = p.clips.find((c) => c.id === 'c1'), right = p.clips.find((c) => c.track === 't1' && near(c.start, cut) && c.id !== 'c1');
  ok('S で再生位置で 2 つに分かれる', p.clips.length === 7 && near(c1.length, cut) && right && near(right.offset, cut), `cut=${cut.toFixed(3)} ${JSON.stringify(right)}`);
  ok('分けた位置は拍の目盛り（スナップ）', onGrid(cut), cut);
  // 切り詰め（右の端）: 分けた右のクリップの終わりを左へ
  b = await box(right.id);
  await page.drag(b.right - 3, b.top + (b.bottom - b.top) * 0.7, b.right - 63, b.top + (b.bottom - b.top) * 0.7); await sleep(300);
  let r2 = await clip(right.id);
  ok('右の端をつかんで、終わりを切り詰める', r2.length < right.length - 0.5 && near(r2.offset, right.offset) && onGrid(r2.start + r2.length), `${right.length.toFixed(3)} → ${r2.length.toFixed(3)}`);
  // 切り詰め（左の端）: ベースの 1 つ目の頭を右へ。音の中の位置も同じだけずれる
  b = await box('c3');
  await page.drag(b.left + 3, b.top + (b.bottom - b.top) * 0.7, b.left + 53, b.top + (b.bottom - b.top) * 0.7); await sleep(300);
  const c3 = await clip('c3');
  ok('左の端をつかんで、頭を切り詰める（音の位置も一緒にずれる）', c3.start > 0.5 && near(c3.offset, c3.start) && near(c3.start + c3.length, p0.clips[2].length) && onGrid(c3.start), JSON.stringify([c3.start, c3.offset, c3.length]));
  // 動かす: 和音の 1 つ目を右へ。上（並びの最後）になる
  b = await box('c5');
  await page.drag((b.left + b.right) / 2 - 100, b.top + (b.bottom - b.top) * 0.7, (b.left + b.right) / 2 - 30, b.top + (b.bottom - b.top) * 0.7); await sleep(300);
  p = await proj();
  const c5 = p.clips.find((c) => c.id === 'c5');
  ok('つかんで横に動かす（拍にスナップ、動かしたクリップが上になる）', c5.start > 0.5 && onGrid(c5.start) && c5.track === 't3' && p.clips[p.clips.length - 1].id === 'c5', c5.start);
  // 縦に動かす → 元に戻す → やり直し → 元に戻す
  b = await box('c6');
  const c6before = await clip('c6');
  await page.drag((b.left + b.right) / 2, b.top + (b.bottom - b.top) * 0.7, (b.left + b.right) / 2, b.top + (b.bottom - b.top) * 0.7 - 80); await sleep(300);
  ok('縦に動かすと段が変わる', (await clip('c6')).track === 't2', (await clip('c6')).track);
  await page.key('Control+z'); await sleep(300);
  const back = await clip('c6');
  ok('Ctrl+Z で元に戻す', back.track === 't3' && near(back.start, c6before.start));
  await page.key('Control+y'); await sleep(300);
  ok('Ctrl+Y でやり直す', (await clip('c6')).track === 't2');
  await page.key('Control+z'); await sleep(300);
  // フェード: ドラムの 2 つ目の左上の角を右へ
  b = await box('c2');
  await page.drag(b.left + 1, b.top + 8, b.left + 41, b.top + 8); await sleep(300);
  const c2 = await clip('c2');
  ok('左上の角をつかんで、フェードインを付ける', c2.fadeIn > 0.5 && near(c2.start, p0.clips[1].start), c2.fadeIn.toFixed(3));
  // クリップの音量とフェードの箱（ダブルクリック）
  b = await box('c4');
  await page.click((b.left + b.right) / 2, b.top + (b.bottom - b.top) * 0.7, { count: 2 }); await sleep(400);
  ok('ダブルクリックで、音量とフェードの箱が開く', await waitSel('dialog.daw-dlg[open] #dcG', 4000));
  await ev("document.querySelector('dialog.daw-dlg[open] #dcG').focus(); return true;");
  for (let i = 0; i < 12; i++) await page.key('ArrowLeft');
  await click('dialog.daw-dlg[open] #dcO', 100); await page.key('Control+a'); await page.typeText('1.5');
  await click('dialog.daw-dlg[open] button[data-close="ok"]', 400);
  const c4 = await clip('c4');
  ok('箱でクリップの音量を -6 dB、フェードアウトを 1.5 秒にする', c4.gain === -6 && near(c4.fadeOut, 1.5), JSON.stringify([c4.gain, c4.fadeOut]));
  // コピーと貼り付け
  b = await box('c3');
  await page.click((b.left + b.right) / 2, b.top + (b.bottom - b.top) * 0.7); await sleep(200);
  await page.key('Control+c'); await sleep(200);
  const tx = await D('d.timeX(18)'), ty = await D('d.rowY(0)');
  await page.click(tx, ty); await sleep(200);
  const at = await D('d.playhead()');
  await page.key('Control+v'); await sleep(300);
  p = await proj();
  const pasted = p.clips[p.clips.length - 1];
  ok('Ctrl+C と Ctrl+V で、選んだ段の再生位置に貼り付け', p.clips.length === 8 && pasted.track === 't1' && near(pasted.start, at) && pasted.src === c3.src && near(pasted.length, c3.length), JSON.stringify([pasted.track, pasted.start, at]));
  await page.key('Delete'); await sleep(300);
  ok('Delete で選んだクリップを消す', (await proj()).clips.length === 7);
  await page.key('Control+z'); await sleep(300);
  ok('消したクリップを Ctrl+Z で戻す', (await proj()).clips.length === 8);
  // 段の音量と左右（キーボードでつまみを動かす）
  await ev("document.querySelector('.app-daw .daw-head[data-track=\"t2\"] [data-h=\"vol\"]').focus(); return true;");
  for (let i = 0; i < 6; i++) await page.key('ArrowLeft');
  await ev("document.querySelector('.app-daw .daw-head[data-track=\"t3\"] [data-h=\"pan\"]').focus(); return true;");
  for (let i = 0; i < 6; i++) await page.key('ArrowRight');
  p = await proj();
  ok('段の音量（ベース -7 → -10 dB）と左右（和音 左 20 → 右 10）', p.tracks[1].vol === -10 && near(p.tracks[2].pan, 0.1), JSON.stringify([p.tracks[1].vol, p.tracks[2].pan]));
  // 消音
  await click('.app-daw .daw-head[data-track="t1"] [data-h="mute"]', 200);
  ok('ドラムの段を消音にする', (await proj()).tracks[0].mute === true && (await ev("return document.querySelector('.app-daw .daw-head[data-track=\"t1\"] [data-h=\"mute\"]').getAttribute('aria-pressed')")) === 'true');
  // 段の名前と色
  await click('.app-daw .daw-head[data-track="t3"] [data-h="name"]', 100);
  await page.key('Control+a'); await page.typeText('和音とパッド'); await page.key('Enter'); await sleep(200);
  await click('.app-daw .daw-head[data-track="t3"] [data-h="color"]', 300);
  await click('.daw-pop.open [data-command^="color:leaf:"]', 300);
  p = await proj();
  ok('段の名前と色を変える', p.tracks[2].name === '和音とパッド' && p.tracks[2].color === 'leaf', JSON.stringify([p.tracks[2].name, p.tracks[2].color]));
  await sleep(300);
  await shot('04-edited');

  /* ---------- 5. 保存と開き直し ---------- */
  await focusLanes();
  await page.key('Control+s');
  await fileDialogName('テスト曲');
  ok('Ctrl+S で名前を付けて保存（/音楽/テスト曲.fdaw）', await waitFor("const fs = await import('./js/fs.mjs'); return fs.exists('/音楽/テスト曲.fdaw')", 5000));
  ok('保存すると題の * が消える', await waitFor("return !document.querySelector('.app-daw .title-bar-text').textContent.startsWith('*') && document.querySelector('.app-daw .title-bar-text').textContent.startsWith('テスト曲.fdaw')", 3000), await ev("return document.querySelector('.app-daw .title-bar-text').textContent"));
  const saved = await proj();
  const file = await ev("const fs = await import('./js/fs.mjs'); return fs.readJSON('/音楽/テスト曲.fdaw')");
  ok('ファイルの中身は、画面の計画と同じ', JSON.stringify(file) === JSON.stringify(saved));
  await page.navigate(URL0 + '?shot=daw:' + encodeURIComponent('/音楽/テスト曲.fdaw'));
  ok('開き直す（?shot=daw:/音楽/テスト曲.fdaw）', await waitFor("const w = document.querySelector('.app-daw'); return !!(w && w.dawDebug && w.dawDebug.project().clips.length === 8 && w.dawDebug.loaded().length >= 3)", 20000));
  await sleep(600);
  const reopened = await proj();
  ok('開き直すと、段・クリップ・設定が全部同じ', JSON.stringify(reopened) === JSON.stringify(saved));
  ok('見つからない音は無い', (await D('d.missing().length')) === 0);
  await shot('05-reopened');

  /* ---------- 6. ミックスダウン ---------- */
  const end = Math.max(...reopened.clips.map((c) => c.start + c.length));
  // 1 回目はメニューを押して書き出す（ファイル → ミックスダウン）
  await click('.app-daw .menu-bar > .menu-title', 300);
  await click('.app-daw .menu-item[data-command="mixdown"]', 300);
  ok('ミックスダウン A（ドラムは消音。メニューから）', await mix('A.wav', null, true));
  const a = JSON.parse(await ev(`${WAV} const w = await wav('/音楽/A.wav'); return JSON.stringify({ ch: w.ch, rate: w.rate, frames: w.frames });`));
  ok('WAV の長さは、頭から最後のクリップの終わりまで（44100 Hz・2 チャンネル）', a.ch === 2 && a.rate === 44100 && a.frames === Math.round(end * 44100), `${a.frames} 標本 / 期待 ${Math.round(end * 44100)}`);
  await click('.app-daw .daw-head[data-track="t2"] [data-h="solo"]', 200);
  ok('ミックスダウン B（ベースだけ単独）', await mix('B.wav'));
  await click('.app-daw .daw-head[data-track="t2"] [data-h="solo"]', 200);
  await click('.app-daw .daw-head[data-track="t3"] [data-h="solo"]', 200);
  ok('ミックスダウン C（和音だけ単独）', await mix('C.wav'));
  await click('.app-daw .daw-head[data-track="t3"] [data-h="solo"]', 200);
  await click('.app-daw .daw-head[data-track="t1"] [data-h="mute"]', 200);
  ok('ミックスダウン D（全部の段）', await mix('D.wav'));
  await click('.app-daw .daw-head[data-track="t1"] [data-h="mute"]', 200);
  await click('.app-daw .daw-head[data-track="t1"] [data-h="solo"]', 200);
  ok('ミックスダウン E（消音のドラムを単独）', await mix('E.wav'));
  await click('.app-daw .daw-head[data-track="t1"] [data-h="solo"]', 200);
  const cmp = JSON.parse(await ev(`${WAV}
    const [A, B, C, Dw, E] = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((n) => wav('/音楽/' + n + '.wav')));
    let sum = 0, peakA = 0, diffD = 0, peakE = 0, peakB = 0;
    for (let i = 0; i < A.pcm.length; i++) {
      sum = Math.max(sum, Math.abs(A.pcm[i] - (B.pcm[i] + C.pcm[i])));
      peakA = Math.max(peakA, Math.abs(A.pcm[i])); peakB = Math.max(peakB, Math.abs(B.pcm[i]));
      diffD = Math.max(diffD, Math.abs(Dw.pcm[i] - A.pcm[i])); peakE = Math.max(peakE, Math.abs(E.pcm[i]));
    }
    return JSON.stringify({ sum, peakA, peakB, diffD, peakE, same: A.pcm.length === B.pcm.length && B.pcm.length === C.pcm.length });`));
  ok('消音の段は入らない: ドラムを消音した A ＝ ベースだけ（B）＋ 和音だけ（C）', cmp.same && cmp.peakA > 1000 && cmp.peakB > 1000 && cmp.sum <= 4, `差の最大 ${cmp.sum}（16 ビットの目盛りで）`);
  ok('消音を外すとドラムが入る（D は A と違う）', cmp.diffD > 1000, cmp.diffD);
  ok('消音は単独より強い（消音のドラムだけを単独にした E は無音）', cmp.peakE === 0, cmp.peakE);
  // ループの範囲を目盛りの下の帯で決めて、その範囲だけ書き出す
  const bar = (60 / reopened.bpm) * 4, rr = JSON.parse(await ev("return JSON.stringify(document.querySelector('.app-daw .daw-ruler').getBoundingClientRect())"));
  await page.drag(await D(`d.timeX(${bar})`), rr.top + 28, await D(`d.timeX(${bar * 3})`), rr.top + 28); await sleep(300);
  const loop = (await proj()).loop;
  ok('目盛りの下の帯をドラッグしてループの範囲を決める（2〜4 小節）', loop.on && near(loop.start, bar) && near(loop.end, bar * 3), JSON.stringify(loop));
  ok('ループの範囲だけを書き出す', await mix('L.wav', 'ループの範囲'));
  const lf = await ev(`${WAV} return (await wav('/音楽/L.wav')).frames;`);
  ok('ループの WAV の長さは範囲の長さ', lf === Math.round((loop.end - loop.start) * 44100), `${lf} / ${Math.round((loop.end - loop.start) * 44100)}`);
  await sleep(300);
  await shot('06-mixdown');
  await focusLanes(); await page.key('l'); await sleep(200);
  ok('L でループを切る', (await proj()).loop.on === false);

  /* ---------- 7. 録音（作り物のマイク） ---------- */
  await click('.app-daw [data-a="addtrack"]', 300);
  const t4 = (await proj()).tracks[3];
  ok('段を足す（段 4）', t4 && t4.name === '段 4', t4?.name);
  await click(`.app-daw .daw-head[data-track="${t4.id}"] [data-h="arm"]`, 200);
  ok('録音待機にする', (await D('d.armed()')) === t4.id);
  await cmd('recset');
  ok('録音の設定の箱が開く', await waitSel('dialog.daw-dlg[open] #drLat', 4000));
  await click('dialog.daw-dlg[open] #drLat', 100); await page.key('Control+a'); await page.typeText('20');
  await click('dialog.daw-dlg[open] button[data-close="ok"]', 300);
  ok('マイクの遅れの補正を 20 ms にする', (await proj()).latencyMs === 20);
  await rulerAt(1.0);
  const recFrom = await D('d.playhead()');
  await page.key('r');
  ok('R で録音が始まる（カウントの間はほかの段も鳴る）', await waitFor("return document.querySelector('.app-daw').dawDebug.recording()", 8000));
  await sleep(2400 + 2600);
  const lvl = await ev("return parseFloat(document.querySelector('.app-daw [data-ml]').style.width) || 0");
  ok('録る間もほかの段が鳴る（重ね録り）', (await D('d.playing()')) && lvl > 5, lvl + '%');
  await shot('07-recording');
  await page.key('r');
  ok('もう一度 R で止めると、クリップが段 4 に置かれる', await waitFor(`return document.querySelector('.app-daw').dawDebug.project().clips.some((c) => c.track === ${JSON.stringify(t4.id)})`, 8000));
  const take = (await proj()).clips.find((c) => c.track === t4.id);
  ok('録ったクリップは録り始めの位置から、カウントの後の長さ', near(take.start, recFrom) && take.length > 1.6 && take.length < 4, JSON.stringify([take.start, recFrom, take.length]));
  const tk = JSON.parse(await ev(`${WAV} const w = await wav(${JSON.stringify(take.src)}); let m = 0; for (const v of w.pcm) m = Math.max(m, Math.abs(v)); return JSON.stringify({ ch: w.ch, frames: w.frames, peak: m / 32768 });`));
  ok('録った音は /音楽/多重録音 の WAV（無音ではない）', take.src.startsWith('/音楽/多重録音/録音 ') && tk.ch === 1 && tk.peak > 0.01, `${take.src} peak=${tk.peak.toFixed(3)}`);
  await sleep(300);
  await shot('08-take');

  /* ---------- 8. 見つからない音 ---------- */
  await ev("const fs = await import('./js/fs.mjs'); await fs.remove('/音楽/多重録音/見本 和音.wav'); return true;");
  await page.navigate(URL0 + '?shot=daw:' + encodeURIComponent('/音楽/テスト曲.fdaw'));
  ok('見つからない音を知らせる箱が出る', await waitSel('dialog.msgbox[open]', 20000) && /見本 和音\.wav/.test(await ev("return document.querySelector('dialog.msgbox[open] .msgbox-text').textContent")));
  ok('見つからない音に印が付く', (await D('d.missing()')).includes('/音楽/多重録音/見本 和音.wav'));
  await sleep(300);
  await shot('09-missing');
  await answer('OK');
  b = await box('c6');
  await page.click((b.left + b.right) / 2, b.top + (b.bottom - b.top) * 0.7); await sleep(200);
  await cmd('relink');
  await fileDialogName('見本 ベース.wav');
  ok('「音を差し替える」で別の音を指定し直すと、印が消える', await waitFor("const d = document.querySelector('.app-daw').dawDebug; return d.missing().length === 0 && d.project().clips.filter((c) => c.track === 't3').every((c) => c.src.endsWith('見本 ベース.wav'))", 8000));

  /* ---------- 9. 音を読み込む・ドロップ・段を消す ---------- */
  await page.click(await D('d.timeX(18)'), await D('d.rowY(1)')); await sleep(200); // ベースの段の 18 秒あたり（空き）
  const at2 = await D('d.playhead()');
  await cmd('import');
  await fileDialogName('B.wav');
  let pi = await proj();
  let last = pi.clips[pi.clips.length - 1];
  ok('「音を読み込む」で、選んだ段の再生位置に置く', last.src === '/音楽/B.wav' && last.track === 't2' && near(last.start, at2) && last.length > 10, JSON.stringify([last.track, last.start, at2, last.length]));
  await ev("document.querySelector('.app-daw .app-body').dispatchEvent(new CustomEvent('fos:drop-file', { detail: { path: '/音楽/C.wav' }, bubbles: true })); return true;");
  ok('デスクトップのアイコンを窓へドロップすると置く', await waitFor("const d = document.querySelector('.app-daw').dawDebug; return d.project().clips.some((c) => c.src === '/音楽/C.wav')", 8000));
  const dropX = await D('d.timeX(4)'), dropY = await D('d.rowY(2)');
  await ev(`const { encodeWAV } = await import('./js/core/wav.mjs');
    const d = new Float32Array(22050); for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin(i / 8);
    const f = new File([encodeWAV([d], 44100)], 'ドロップの音.wav', { type: 'audio/wav' }), dt = new DataTransfer(); dt.items.add(f);
    const main = document.querySelector('.app-daw .daw-main');
    main.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: ${dropX}, clientY: ${dropY} }));
    main.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: ${dropX}, clientY: ${dropY} }));
    return true;`);
  ok('パソコンのファイルを落とすと、/音楽/多重録音 へ写して、落とした段と時刻に置く', await waitFor("const d = document.querySelector('.app-daw').dawDebug; return d.project().clips.some((c) => c.src === '/音楽/多重録音/ドロップの音.wav' && c.track === 't3' && Math.abs(c.start - 60 / d.project().bpm * Math.round(4 / (60 / d.project().bpm))) < 1e-3)", 8000));
  await click('.app-daw [data-a="addtrack"]', 300);
  const nt = (await proj()).tracks.length;
  await click('.app-daw .daw-head:last-child [data-h="del"]', 300);
  ok('空の段を × で消す', (await proj()).tracks.length === nt - 1);
  await sleep(300);
  await shot('10-dropped');

  /* ---------- 10. 目盛り・拡大・メトロノーム・テンポ ---------- */
  const z0 = (await proj()).zoom;
  await focusLanes(); await page.key('+'); await sleep(200);
  ok('+ で拡大する', (await proj()).zoom > z0, `${z0} → ${(await proj()).zoom}`);
  await page.key('m'); await sleep(200);
  ok('M でメトロノームを入れる', (await proj()).metronome === true);
  await cmd('ruler:time'); await sleep(300);
  ok('目盛りを秒にする', (await proj()).ruler === 'time' && /^\d+:\d\d\.\d{3}$/.test(await ev("return document.querySelector('.app-daw [data-pos]').textContent")));
  const starts = (await proj()).clips.map((c) => c.start).join(',');
  await click('.app-daw [data-bpm]', 100); await page.key('Control+a'); await page.typeText('120'); await page.key('Tab'); await sleep(300);
  ok('テンポを 120 にしても、クリップの時刻は変わらない', (await proj()).bpm === 120 && (await proj()).clips.map((c) => c.start).join(',') === starts);
  await focusLanes(); await page.key(' '); await sleep(1200);
  ok('メトロノームを入れたまま再生できる', await D('d.playing()'));
  await shot('11-time-ruler');
  await page.key(' '); await sleep(300);
  await cmd('help'); await sleep(300);
  ok('F1 の使い方が開く', await waitSel('dialog.msgbox[open]', 3000));
  await answer('OK');
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'daw-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
