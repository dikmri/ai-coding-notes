// リズムマシン（os/js/apps/drums.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// 見本で開く・Space で再生と停止・格子を押す／Shift と右クリックで強く・キーボードで動いて打つ・元に戻す・
// パターンの切り替えとコピーと貼り付け・曲の並びと曲の再生・消音と単独・つまみ・.rhy の保存と開き直し・壊れたファイル・
// WAV の書き出し（曲とパターン）・閉じたハイハットで開いたハイハットが止まること、を見る。
// 確かめ専用の Chrome のプロファイル（runtime/drums-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8792 を動かしてから、node tools/drums-check.mjs [番号=8792]
//   画面の写真は build/drums-check/、結果は logs/drums-check.json
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8792;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'drums-check');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const START = new Date().toISOString(); // この回の記録だけを見るための時刻
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'drums-profile') });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info ? ' ' + info : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
const waitSel = async (sel, ms = 15000) => { for (let t = 0; t < ms; t += 100) { if (await ev(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(100); } return false; };
const waitFor = async (js, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await ev(js)) return true; await sleep(100); } return false; };
// いちばん手前（最後に開いた）リズムマシンの窓の中を探す
const W = "const ws = [...document.querySelectorAll('.window.app-drums')]; const w = ws[ws.length - 1];";
const D = (js) => ev(`${W} return ${js}`);
async function center(sel) {
  const r = await ev(`${W} const el = w.querySelector(${JSON.stringify(sel)}) || document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2];`);
  if (!r) throw new Error('見つからない: ' + sel);
  return r;
}
async function click(sel, opt = {}, wait = 200) { const [x, y] = await center(sel); await page.click(x, y, opt); await sleep(wait); }
const step = (r, c) => `.dr-step[data-r="${r}"][data-c="${c}"]`;
const pressed = (r, c) => D(`w.querySelector('${step(r, c)}').getAttribute('aria-pressed') + (w.querySelector('${step(r, c)}').classList.contains('acc') ? '+acc' : '')`);
const status = () => D("w.querySelector('.status-field[data-status]').textContent");
const command = (c) => D(`(w.querySelector('.app-body').dispatchEvent(new CustomEvent('w95:command', { detail: { command: '${c}', checked: false }, bubbles: true })), true)`);
const answer = async (value) => { if (!(await waitSel(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 5000))) throw new Error('メッセージの箱が出ない: ' + value); await click(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, {}, 400); };
async function fileDialog(name) {
  if (!(await waitSel('dialog.file-dlg[open]', 5000))) throw new Error('ファイルの箱が出ない');
  await ev(`const d = document.querySelector('dialog.file-dlg[open]'); d.querySelector('#fdName').value = ${JSON.stringify(name)}; d.querySelector('[data-ok]').click(); return true;`);
  await sleep(500);
  if (await ev("return !!document.querySelector('dialog.msgbox[open] .button-row button[data-close=\"はい\"]')")) await answer('はい'); // 上書きの確かめ
}
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
// 画面から読み取った状態（開き直したときに比べる）。パターンは A〜H を順に表示して格子を読む
async function domState() {
  return D(`(async () => {
    const q = (s) => w.querySelector(s), out = {};
    out.bpm = q('[data-t="bpm"]').value; out.swing = q('[data-t="swing"]').value; out.volume = q('[data-t="volume"]').value;
    out.mode = q('[data-mode]:checked')?.value; out.song = q('[data-song]').value; out.current = q('.dr-pat[aria-pressed="true"]').dataset.pat;
    out.kit = [...w.querySelectorAll('.dr-mrow[data-row]')].map((row) => [...row.querySelectorAll('input[type=range]')].map((i) => i.value).join(',') + '|' + [...row.querySelectorAll('[aria-pressed]')].map((b) => b.getAttribute('aria-pressed')).join(','));
    out.patterns = {};
    for (const c of 'ABCDEFGH') {
      q('.dr-pat[data-pat="' + c + '"]').click();
      out.patterns[c] = [...w.querySelectorAll('.dr-step')].map((b) => (b.classList.contains('acc') ? 'X' : b.classList.contains('on') ? 'x' : '.')).join('');
    }
    q('.dr-pat[data-pat="' + out.current + '"]').click();
    return out;
  })()`);
}

try {
  await page.navigate(URL0 + '?shot');
  await wipe();
  await page.navigate(URL0 + '?shot=drums');
  ok('?shot=drums でリズムマシンの窓が開く', await waitSel('.window.app-drums .dr-grid', 20000));
  await sleep(600);
  ok('題名は「無題 - リズムマシン」', (await D("w.querySelector('.title-bar-text').textContent")) === '無題 - リズムマシン');
  ok('状態の帯に「Space で再生」の案内', /Space で再生/.test(await status()), await status());
  ok('格子は role="grid"、行の見出し 8 つ、升 128', await D("w.querySelector('[role=grid]') && w.querySelectorAll('[role=rowheader]').length === 8 && w.querySelectorAll('[role=gridcell] .dr-step').length === 128"));
  ok('格子の中で Tab で止まる升は 1 つだけ', (await D("w.querySelectorAll('.dr-step[tabindex=\"0\"]').length")) === 1);
  ok('見本: A・B・C に音が入り、ほかは空', (await D("[...w.querySelectorAll('.dr-pat.used')].map((b) => b.dataset.pat).join('')")) === 'ABC');
  ok('見本: 曲の並びが入っている', (await D("w.querySelector('[data-song]').value")) === 'A A A B C C C B');
  ok('つまみは音量・高さ・長さが 8 段ずつ、aria-valuetext つき', (await D("[...w.querySelectorAll('.dr-mrow input[type=range]')].filter((i) => i.getAttribute('aria-valuetext')).length")) === 24);
  await shot('01-open');
  // 起動のあとでスタートメニューなどから開いたときは、再生のボタンにフォーカスがある（?shot は起動の最後にデスクトップへフォーカスを移すので、ここで開き直して見る）
  await ev("const shell = await import('./js/shell.mjs'); await shell.launch('drums'); return true;");
  await sleep(300);
  ok('開いた直後は再生のボタンにフォーカス（Space ですぐ鳴らせる）', await D("document.activeElement === w.querySelector('.dr-play')"));
  await page.key('Space');
  ok('そのまま Space で再生が始まる', await waitFor(`${W} return w.querySelector('.dr-play').classList.contains('playing')`));
  await command('close');
  await sleep(400);
  ok('再生中に閉じても、窓は 1 つに戻る（変更なしなので確かめは出ない）', (await ev("return document.querySelectorAll('.window.app-drums').length")) === 1);

  // 再生と停止（窓の空いた所を押してから Space）
  await click('.dr-gridhint');
  ok('窓の空いた所を押すと、窓の中にフォーカスが残る', await D("w.contains(document.activeElement)"));
  await page.key('Space');
  ok('Space で再生が始まる（ボタンが「停止」になる）', await waitFor(`${W} return w.querySelector('.dr-play').classList.contains('playing')`));
  ok('再生中は今のステップの列が光る', await waitFor(`${W} return w.querySelectorAll('.dr-step.play').length === 8`, 3000));
  const col1 = await D("w.querySelector('.dr-colnum.play')?.dataset.col");
  await sleep(450);
  const col2 = await D("w.querySelector('.dr-colnum.play')?.dataset.col");
  ok('光る列が時間とともに進む', col1 != null && col2 != null && col1 !== col2, `${col1} → ${col2}`);
  ok('状態の帯に再生の位置', /^▶ パターン A ・ \d+$/.test(await D("w.querySelector('[data-s3]').textContent")), await D("w.querySelector('[data-s3]').textContent"));
  await shot('02-playing');
  await page.key('Space');
  await sleep(200);
  ok('もう一度 Space で止まり、光る列が消える', await D("!w.querySelector('.dr-play').classList.contains('playing') && !w.querySelector('.dr-step.play')"));
  await page.key('Alt+r');
  ok('Alt+R（再生のボタンの下線の文字）でも再生できる', await waitFor(`${W} return w.querySelector('.dr-play').classList.contains('playing')`, 3000));
  await page.key('F5');
  await sleep(150);
  ok('F5 で止まる（ページは読み込み直さない）', !(await D("w.querySelector('.dr-play').classList.contains('playing')")));

  // 格子を押す
  await click(step(0, 1));
  ok('升を押すとオンになる', (await pressed(0, 1)) === 'true');
  ok('題名に変更の印（*）', (await D("w.querySelector('.title-bar-text').textContent")).startsWith('*'));
  await click(step(0, 1), { modifiers: 8 });
  ok('Shift+クリックで強く打つ印', (await pressed(0, 1)) === 'true+acc' && (await D(`w.querySelector('${step(0, 1)}').textContent`)) === '◆');
  await click(step(2, 3), { button: 'right' });
  ok('右クリックで強く打つ印（右クリックのメニューは出ない）', (await pressed(2, 3)) === 'true+acc' && !(await ev("return !!document.querySelector('.menu.popup:not([hidden]), .context-menu')")));
  await click(step(0, 1));
  ok('もう一度押すと消える', (await pressed(0, 1)) === 'false');
  // なぞって続けて置く（マウスの左ボタンを押したまま横へ動かす）
  {
    const [x0, y0] = await center(step(6, 0)), [x1] = await center(step(6, 3));
    await page.drag(x0, y0, x1, y0);
    await sleep(200);
    ok('押したままなぞると、続けて置ける', (await D("[0, 1, 2, 3].map((c) => w.querySelector('.dr-step[data-r=\"6\"][data-c=\"' + c + '\"]').getAttribute('aria-pressed')).join()")) === 'true,true,true,true');
    await page.key('Control+z');
    await sleep(150);
    ok('なぞった分は 1 回の元に戻すで消える', (await D("[0, 1, 2, 3].map((c) => w.querySelector('.dr-step[data-r=\"6\"][data-c=\"' + c + '\"]').getAttribute('aria-pressed')).join()")) === 'false,false,false,false');
  }
  await shot('03-edit');

  // キーボード
  await click(step(1, 0)); await click(step(1, 0)); // オンにして消す（フォーカスをここへ）
  await page.key('ArrowRight'); await page.key('ArrowRight'); await page.key('ArrowDown');
  ok('矢印キーで升を動く（tabindex も移る）', (await D("document.activeElement.dataset.r + ',' + document.activeElement.dataset.c + ',' + document.activeElement.tabIndex")) === '2,2,0');
  await page.key('Enter');
  ok('Enter でオン', (await pressed(2, 2)) === 'true');
  await page.key('Space');
  await sleep(100);
  ok('Space でオフ（格子の中の Space は再生にしない）', (await pressed(2, 2)) === 'false' && !(await D("w.querySelector('.dr-play').classList.contains('playing')")));
  await page.key('Shift+Enter');
  ok('Shift+Enter で強く', (await pressed(2, 2)) === 'true+acc');
  await page.key('Shift+Space');
  await sleep(100);
  ok('Shift+Space で強く⇔ふつう（Space の click が重ならない）', (await pressed(2, 2)) === 'true');
  await page.key('Shift+Enter');
  await page.key('Delete');
  ok('Delete で消す', (await pressed(2, 2)) === 'false');
  await page.key('Control+z');
  ok('Ctrl+Z で元に戻す（強くに戻る）', (await pressed(2, 2)) === 'true+acc');
  await page.key('Control+y');
  ok('Ctrl+Y でやり直し', (await pressed(2, 2)) === 'false');
  await page.key('Home');
  ok('Home で段の頭へ', (await D('document.activeElement.dataset.c')) === '0');
  for (let i = 0; i < 3; i++) await page.key('ArrowUp');
  ok('格子の端では止まる', (await D('document.activeElement.dataset.r')) === '0');

  // パターン: 切り替え・コピー・貼り付け・空にする
  await click('.dr-pat[data-pat="D"]');
  ok('パターン D を選ぶと格子が空になる', (await D("w.querySelectorAll('.dr-step.on, .dr-step.acc').length")) === 0 && (await D("w.querySelector('.dr-pat[data-pat=\"D\"]').getAttribute('aria-pressed')")) === 'true');
  await click('.dr-pat[data-pat="B"]');
  const bOn = await D("[...w.querySelectorAll('.dr-step')].map((b) => b.className.includes('acc') ? 'X' : b.className.includes('on') ? 'x' : '.').join('')");
  await click('[data-act="copy"]');
  await click('.dr-pat[data-pat="D"]');
  await click('[data-act="paste"]');
  const dOn = await D("[...w.querySelectorAll('.dr-step')].map((b) => b.className.includes('acc') ? 'X' : b.className.includes('on') ? 'x' : '.').join('')");
  ok('コピーして貼り付けると、D が B と同じになる', dOn === bOn && /x/i.test(dOn));
  ok('音の入ったパターンの印が D にも付く', await D("w.querySelector('.dr-pat[data-pat=\"D\"]').classList.contains('used')"));
  await click('[data-act="clear"]');
  ok('空にするで D が空になる', (await D("w.querySelectorAll('.dr-step.on, .dr-step.acc').length")) === 0);
  await page.key('Control+z');
  await sleep(100);
  ok('元に戻すで D の音が戻る', (await D("w.querySelectorAll('.dr-step.on, .dr-step.acc').length")) > 0);
  await click('[data-act="clear"]');
  await click('.dr-pat[data-pat="A"]');

  // 曲の並び
  await ev(`${W} const i = w.querySelector('[data-song]'); i.focus(); i.value = 'a b z c'; return true;`);
  await page.key('Enter');
  await sleep(150);
  ok('曲の並び: A〜H だけを拾い、ほかの文字を知らせる', (await D("w.querySelector('[data-song]').value")) === 'A B C' && /z/.test(await status()), await status());
  ok('曲の並びの札が 3 つ', (await D("w.querySelectorAll('.dr-chip').length")) === 3);
  await click('[data-act="songadd"]');
  ok('「今のパターンを足す」で最後に A', (await D("w.querySelector('[data-song]').value")) === 'A B C A');
  // 曲を通す（テンポ 240 で 1 小節 1 秒）
  await ev(`${W} const n = w.querySelector('[data-bpmnum]'); n.value = '240'; n.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  ok('テンポの数を 240 にすると、つまみも 240', (await D("w.querySelector('[data-t=\"bpm\"]').value")) === '240');
  await ev(`${W} const n = w.querySelector('[data-bpmnum]'); n.value = '999'; n.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  ok('範囲の外のテンポは入らない', (await D("w.querySelector('[data-bpmnum]').value")) === '240' && /40〜240/.test(await status()));
  await click('[data-mode][value="song"]');
  ok('「曲を通す」を選ぶとメニューの印も移る', await D("w.querySelector('.menu-item[data-command=\"mode:song\"]').classList.contains('checked')"));
  await click('.dr-play');
  ok('曲の再生: 1 小節目は A', await waitFor(`${W} return w.querySelector('.dr-chip.now') === w.querySelectorAll('.dr-chip')[0]`, 3000));
  ok('曲の再生: 2 小節目に B へ進み、格子も B を表示する（再生位置を追う）', await waitFor(`${W} return w.querySelector('.dr-chip.now') === w.querySelectorAll('.dr-chip')[1] && w.querySelector('.dr-pat[aria-pressed="true"]').dataset.pat === 'B'`, 3000));
  ok('状態の帯に曲の位置（2/4・B）', /^▶ 曲 2\/4 ・ B/.test(await D("w.querySelector('[data-s3]').textContent")), await D("w.querySelector('[data-s3]').textContent"));
  await shot('04-song');
  await page.key('Escape');
  await sleep(200);
  ok('Esc で止まる', !(await D("w.querySelector('.dr-play').classList.contains('playing')")));
  await click('[data-mode][value="pattern"]');

  // 消音と単独、つまみ
  await click('[data-mute="0"]');
  ok('M でバスドラムを消音（段が薄くなる）', (await D("w.querySelector('[data-mute=\"0\"]').getAttribute('aria-pressed')")) === 'true' && (await D("w.querySelectorAll('.dr-row.silent').length")) === 1);
  await click('[data-solo="3"]');
  ok('S で閉じたハイハットを単独（ほかの 7 段が薄くなる）', (await D("w.querySelectorAll('.dr-row.silent').length")) === 7);
  await ev(`${W} const i = w.querySelector('[data-kk="tune"][data-row="3"]'); i.value = '5'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  ok('高さのつまみ: aria-valuetext と状態の帯', (await D("w.querySelector('[data-kk=\"tune\"][data-row=\"3\"]').getAttribute('aria-valuetext')")) === '+5 半音' && /閉じたハイハットの高さ: \+5 半音/.test(await status()));
  await ev(`${W} const i = w.querySelector('[data-kk="decay"][data-row="4"]'); i.value = '160'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  await ev(`${W} const i = w.querySelector('[data-t="swing"]'); i.value = '40'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  ok('スイングのつまみ: 表示が 40%', (await D("w.querySelector('[data-out=\"swing\"]').textContent")) === '40%');
  await ev(`${W} w.querySelector('.dr-play').focus(); return true;`);
  await page.key('Control+z');
  ok('つまみも元に戻すで戻る（スイング 0%）', (await D("w.querySelector('[data-out=\"swing\"]').textContent")) === '0%');
  await page.key('Control+y');
  await shot('05-mixer');
  await click(step(5, 6), { modifiers: 8 });
  await click(step(7, 15));

  // 保存して、閉じて、開き直す
  const before = await domState();
  await page.key('Control+s');
  await fileDialog('テスト.rhy');
  ok('Ctrl+S で /音楽/テスト.rhy に保存', await waitFor("const fs = await import('./js/fs.mjs'); return !!(await fs.stat('/音楽/テスト.rhy'))", 5000));
  const saved = await ev("const fs = await import('./js/fs.mjs'); return JSON.parse(await fs.readText('/音楽/テスト.rhy'))");
  ok('保存の形: format と、段が 16 文字', saved.format === 'fos-rhythm' && saved.version === 1 && saved.patterns.A.every((r) => /^[.xX]{16}$/.test(r)) && saved.bpm === 240 && saved.swing === 40);
  ok('保存すると題名の * が消え、ファイル名になる', (await D("w.querySelector('.title-bar-text').textContent")) === 'テスト.rhy - リズムマシン');
  await command('close');
  await sleep(500);
  ok('保存済みなので、確かめなしで閉じる', (await ev("return document.querySelectorAll('.window.app-drums').length")) === 0);
  await ev("const shell = await import('./js/shell.mjs'); await shell.openFile('/音楽/テスト.rhy'); return true;");
  ok('.rhy を開くとリズムマシンが開く', await waitSel('.window.app-drums .dr-grid', 8000));
  await sleep(400);
  const after = await domState();
  ok('開き直すと同じ状態に戻る（テンポ・スイング・音量・再生のしかた・曲の並び・つまみ・消音と単独・A〜H の格子）', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(before) === JSON.stringify(after) ? '' : JSON.stringify({ before, after }).slice(0, 600));
  await shot('06-reopened');

  // WAV の書き出し（曲全体とパターン）
  await command('unmute');
  await command('wav');
  await answer('song');
  await fileDialog('テスト.wav');
  ok('WAV（曲全体）を /音楽 に書き出す', await waitFor("const fs = await import('./js/fs.mjs'); return !!(await fs.stat('/音楽/テスト.wav'))", 15000));
  const wav = await ev(`const fs = await import('./js/fs.mjs'); const b = new Uint8Array(await (await fs.readBlob('/音楽/テスト.wav')).arrayBuffer()); const dv = new DataView(b.buffer);
    let peak = 0; for (let i = 44; i < b.length; i += 2) peak = Math.max(peak, Math.abs(dv.getInt16(i, true)));
    return { riff: String.fromCharCode(...b.slice(0, 4)), rate: dv.getUint32(24, true), ch: dv.getUint16(22, true), sec: (b.length - 44) / 2 / dv.getUint32(24, true), peak };`);
  // 曲 A B C A（4 小節）× 1 秒 + 余韻 1.5 秒
  ok('WAV の中身: RIFF・44100Hz・長さが曲の長さ＋余韻・無音でない', wav.riff === 'RIFF' && wav.rate === 44100 && Math.abs(wav.sec - 5.5) < 0.01 && wav.peak > 3000, JSON.stringify(wav));
  await command('wav');
  await answer('pattern');
  await fileDialog('テスト (A).wav');
  const pw = await waitFor("const fs = await import('./js/fs.mjs'); return !!(await fs.stat('/音楽/テスト (A).wav'))", 15000) && await ev("const fs = await import('./js/fs.mjs'); const s = await fs.stat('/音楽/テスト (A).wav'); return (s.size - 44) / 2 / 44100;");
  ok('WAV（パターン 1 つ）は 1 小節＋余韻の長さ', Math.abs(pw - 2.5) < 0.01, String(pw));
  ok('書き出したあと、状態の帯に場所と長さ', /書き出しました: \/音楽\/テスト \(A\)\.wav/.test(await status()), await status());

  // 閉じたハイハットで開いたハイハットが止まる（書き出しと同じ trigger を、OfflineAudioContext で比べる）
  const choke = await ev(`const V = await import('./js/apps/drums-voices.mjs'); const k = { vol: 100, tune: 0, decay: 100, mute: false, solo: false };
    async function render(withClosed) {
      const ctx = new OfflineAudioContext(1, 44100, 44100), o = V.createOutput(ctx, 100);
      V.trigger(ctx, o.input, 4, 0.05, 1, k); if (withClosed) V.trigger(ctx, o.input, 3, 0.25, 1, k);
      const d = (await ctx.startRendering()).getChannelData(0); let e = 0; for (let i = Math.round(0.4 * 44100); i < Math.round(0.6 * 44100); i++) e += d[i] * d[i]; return Math.sqrt(e);
    }
    const open = await render(false), choked = await render(true); return { open, choked, ratio: choked / open };`);
  ok('閉じたハイハットが鳴ると、開いたハイハットの余韻が止まる', choke.ratio < 0.1, JSON.stringify(choke));

  // 壊れたファイル
  await ev(`const fs = await import('./js/fs.mjs'); await fs.write('/音楽/こわれた.rhy', JSON.stringify({ bpm: 'はやい', swing: 900, song: 'Q A', patterns: { A: ['x?X', 5] }, kit: 'なし' })); await fs.write('/音楽/読めない.rhy', '{ これは JSON ではない'); return true;`);
  await ev("const shell = await import('./js/shell.mjs'); shell.openFile('/音楽/こわれた.rhy'); return true;");
  await waitFor("return [...document.querySelectorAll('.window.app-drums .title-bar-text')].some((t) => t.textContent.startsWith('こわれた.rhy'))", 8000);
  await sleep(300);
  ok('壊れた値のファイルは、既定値に直して開く（テンポ 120・スイング 75・曲 A）', (await D("[w.querySelector('[data-bpmnum]').value, w.querySelector('[data-out=\"swing\"]').textContent, w.querySelector('[data-song]').value, w.querySelectorAll('.dr-step.on, .dr-step.acc').length].join()")) === '120,75%,A,2');
  await ev("const shell = await import('./js/shell.mjs'); shell.openFile('/音楽/読めない.rhy'); return true;");
  ok('JSON でないファイルは、日本語で誤りを知らせて見本で開く', await waitSel('dialog.msgbox[open]', 8000) && /読めない\.rhy を読めませんでした。[\s\S]*JSON の形/.test(await ev("return document.querySelector('dialog.msgbox[open] .msgbox-text').textContent")));
  await sleep(700); // 窓と箱の開く動きが終わってから撮る
  await shot('07-broken');
  await answer('OK');
  await sleep(300);
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));
  await sleep(1500); // 記録は少しまとめてから送られる
  const appLog = readFileSync(join(ROOT, 'logs', 'app.log'), 'utf8').split('\n').filter((l) => l >= START);
  const kinds = ['drums.open', 'drums.play', 'drums.stop', 'drums.step', 'drums.save', 'drums.load', 'drums.wav', 'drums.knob'];
  const missing = kinds.filter((k) => !appLog.some((l) => l.includes(' ' + k + ' ')));
  ok('記録（logs/app.log）に、開く・再生・停止・打ち込み・保存・読み込み・書き出し・つまみが残る', !missing.length, missing.join(' '));
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'drums-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
