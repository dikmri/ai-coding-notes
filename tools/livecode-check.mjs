// 音の実験室（os/js/apps/livecode.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない: --mute-audio）。
// 音は聞かずに、アプリが予約した音の記録（win.lc.rec）と、書き出した WAV の中身で確かめる。
// 見本で開く・Ctrl+Enter で鳴らす・予約される音の列・鳴っている行の印・鳴らしたまま書き換える（次のくり返しの頭から切り替わる、
// 足した loop は次の小節から、消した loop は今のくり返しで止まる）・構文の誤り（行と列と説明、前の版が鳴り続ける）・実行の誤り・
// Esc で止める・見本 6 つ・エディタ（Tab・Shift+Tab・Enter の字下げ・} ・Ctrl+/・元に戻す・早見表）・保存して開き直す・
// 音色と打楽器を 1 つずつ描き出して無音でないこと・WAV の書き出し（ファイルの中身）・説明書・波形とスペクトル・Alt+R・新規、を見る。
// 確かめ専用の Chrome のプロファイル（runtime/livecode-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8802 を動かしてから、node tools/livecode-check.mjs [番号=8802]
//   画面の写真は build/livecode-check/、結果は logs/livecode-check.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';
import * as L from '../os/js/core/livecode.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8802;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'livecode-check');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'livecode-profile') });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info: typeof info === 'string' ? info : JSON.stringify(info) }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
const waitSel = async (sel, ms = 15000) => { for (let t = 0; t < ms; t += 100) { if (await ev(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(100); } return false; };
const waitFor = async (js, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await ev(js)) return true; await sleep(100); } return false; };
// いちばん新しく開いた音の実験室の窓（w は wm の窓、el はその DOM、lc は確かめ用の口）
const W = "const wm = await import('./js/wm.mjs'); const ws = wm.list().filter((x) => x.app === 'livecode'); const w = ws[ws.length - 1]; const el = w.el, lc = w.lc;";
const C = (js) => ev(`${W} return ${js}`);
async function center(sel) {
  const r = await ev(`${W} const e = el.querySelector(${JSON.stringify(sel)}) || document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2];`);
  if (!r) throw new Error('見つからない: ' + sel);
  return r;
}
async function click(sel, wait = 250) { const [x, y] = await center(sel); await page.click(x, y); await sleep(wait); }
const status = () => C("el.querySelector('.status-field[data-status]').textContent");
const command = (c) => C(`(w.body.dispatchEvent(new CustomEvent('w95:command', { detail: { command: '${c}' }, bubbles: true })), true)`);
const answer = async (value) => { if (!(await waitSel(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 5000))) throw new Error('メッセージの箱が出ない: ' + value); await click(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 400); };
async function fileDialog(name) {
  if (!(await waitSel('dialog.file-dlg[open]', 5000))) throw new Error('ファイルの箱が出ない');
  await ev(`const d = document.querySelector('dialog.file-dlg[open]'); d.querySelector('#fdName').value = ${JSON.stringify(name)}; d.querySelector('[data-ok]').click(); return true;`);
  await sleep(500);
  if (await ev("return !!document.querySelector('dialog.msgbox[open] .button-row button[data-close=\"はい\"]')")) await answer('はい'); // 上書きの確かめ
}
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
// エディタの文字を全部選んで、打ち込んだのと同じ形（insertText）で入れ替える
async function setText(code) { await C("(el.querySelector('[data-ta]').focus(), el.querySelector('[data-ta]').select(), true)"); await page.typeText(code); await sleep(150); }
const focusEditor = () => C("(el.querySelector('[data-ta]').focus(), true)");
async function runKey() { await focusEditor(); await page.key('Control+Enter'); await sleep(200); }
const now = () => C('lc.ctx().currentTime');
const rec = () => C('lc.rec.slice()');
const r3 = (x) => Math.round(x * 1000) / 1000;
// 記録の中の、loop ごとのくり返しと音
const iters = (r, loop) => r.filter((x) => x.kind === 'iter' && x.loop === loop);
const notesOf = (r, loop, iter) => r.filter((x) => x.kind === 'note' && x.loop === loop && x.iter === iter);
const V2 = 'tempo 100\n\nloop はじめ {\n  play D4 len 0.5\n  rest 1\n  play F4 len 0.5\n  rest 1\n  play A4 len 0.5\n  rest 1\n  play D5 len 1.5\n  rest 1\n}\n\nloop ドラム {\n  sample kick\n  rest 1\n  sample hat\n  rest 1\n}\n';

try {
  await page.navigate(URL0 + '?shot');
  // 起動の途中で空にすると、起動の続きの見本の書き込みが残ることがある。デスクトップのアイコンが並ぶのを待ってから空にする
  await waitSel('#desk:not([hidden]) .desk-icon', 20000);
  await sleep(500);
  await wipe();
  await page.navigate(URL0 + '?shot=livecode');

  /* ---------- 開いたとき ---------- */
  ok('?shot=livecode で音の実験室の窓が開く', await waitSel('.window.app-livecode [data-ta]', 20000));
  await sleep(700);
  ok('題名は「最初の一音（見本） - 音の実験室」', (await C("el.querySelector('.title-bar-text').textContent")) === '最初の一音（見本） - 音の実験室');
  ok('最初の見本が入っている', (await C('lc.text()')) === L.EXAMPLES[0].code);
  ok('状態の帯に「Ctrl+Enter で鳴らします」の案内', /Ctrl\+Enter で鳴らします/.test(await status()), await status());
  ok('色分けが登録される（命令・音の名前・数・コメント・音色などの名前）', await ev("return ['lc-kw', 'lc-note', 'lc-num', 'lc-comment', 'lc-opt'].every((n) => CSS.highlights.has(n))"));
  ok('行番号が行の数だけ並ぶ', (await C("el.querySelectorAll('[data-gutter] > div').length - 3")) === L.EXAMPLES[0].code.split('\n').length);
  ok('APPS に「音の実験室」、.oto は音の実験室で開く', await ev("const s = await import('./js/shell.mjs'); const a = await import('./js/core/assoc.mjs'); return s.APPS.livecode.name === '音の実験室' && a.appFor('x.oto') === 'livecode' && a.typeName('x.oto') === '音のことば' && s.iconFor({ name: 'x.oto' }) === 'icons/livecode.svg'"));
  ok('止める のボタンは、止まっている間は押せない', await C("el.querySelector('[data-a=\"stop\"]').disabled"));
  ok('鳴らす前から、速さの表示は書いてある tempo（♩ = 100）', (await C("el.querySelector('[data-tempo]').textContent")) === '♩ = 100');
  await shot('01-open');

  /* ---------- 鳴らす ---------- */
  await runKey();
  await sleep(2900);
  ok('Ctrl+Enter で鳴り始める（AudioContext が動く）', await C("lc.engine.playing && lc.ctx().state === 'running' && lc.runs[0].ok"));
  let r = await rec();
  const it0 = iters(r, 'はじめ');
  const n0 = notesOf(r, 'はじめ', 0);
  ok('予約された音: ド・ミ・ソ・ド（60 64 67 72）', JSON.stringify(n0.map((x) => x.midi)) === '[60,64,67,72]', n0.map((x) => x.midi));
  ok('音の間は 0.6 秒（tempo 100 の 1 拍）', n0.slice(1).every((x, i) => Math.abs(x.time - n0[i].time - 0.6) < 1e-6), n0.map((x) => r3(x.time)));
  ok('次のくり返しは 4 拍（2.4 秒）あと', it0.length >= 2 && Math.abs(it0[1].time - it0[0].time - 2.4) < 1e-6, it0.map((x) => r3(x.time)));
  ok('音の長さは len の拍（0.5 拍 = 0.3 秒）', Math.abs(n0[0].dur - 0.3) < 1e-6);
  ok('鳴っている行が光る（帯と行番号）', await C("lc.nowLines().length > 0 && lc.nowLines().every((l) => l >= 9 && l <= 16) && !!el.querySelector('.lc-bar-now') && !!el.querySelector('[data-gutter] .now')"), await C('lc.nowLines()'));
  ok('loop の一覧に「はじめ」と回数', /はじめ/.test(await C("el.querySelector('[data-loops]').textContent")) && /回目/.test(await C("el.querySelector('[data-loops]').textContent")));
  ok('音の形の画面に波形が描かれる（水色の画素がある）', await C("(() => { const c = el.querySelector('[data-scope]'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 180 && d[i + 2] > 180 && d[i] < 160) n++; return n > 50; })()"));
  ok('止める のボタンが押せるようになり、状態の帯の右に「鳴っています」', await C("!el.querySelector('[data-a=\"stop\"]').disabled && /鳴っています/.test(el.querySelector('[data-play]').textContent)"));
  await shot('02-playing');

  /* ---------- 鳴らしたまま書き換える ---------- */
  await setText(V2);
  const at = await now();
  await runKey();
  ok('状態の帯「書き換えました」', /書き換えました/.test(await status()), await status());
  await sleep(6200);
  r = await rec();
  const its = iters(r, 'はじめ');
  const firstNew = its.find((x) => x.ver === 2), lastOld = [...its].reverse().find((x) => x.ver === 1);
  ok('書き換えても止まらない（くり返しの間が空かない）', its.slice(1).every((x, i) => Math.abs(x.time - its[i].time - 2.4) < 1e-6), its.map((x) => `${r3(x.time)}v${x.ver}`));
  ok('新しい中身は、次のくり返しの頭から（古い版は書き換える前に始まったくり返しまで）', !!firstNew && !!lastOld && its.indexOf(firstNew) === its.indexOf(lastOld) + 1 && firstNew.time >= at && lastOld.time < at + 0.31 && firstNew.time - at <= 2.4 + 0.31, { at: r3(at), lastOld: lastOld && r3(lastOld.time), firstNew: firstNew && r3(firstNew.time) });
  ok('書き換える前に始まったくり返しは、古い音（ド・ミ・ソ・ド）のまま鳴り終える', JSON.stringify(notesOf(r, 'はじめ', lastOld.iter).map((x) => x.midi)) === '[60,64,67,72]');
  ok('新しいくり返しは新しい音（レ・ファ・ラ・レ = 62 65 69 74）', JSON.stringify(notesOf(r, 'はじめ', firstNew.iter).map((x) => x.midi)) === '[62,65,69,74]');
  ok('くり返しの回数は続きから数える', firstNew.iter === lastOld.iter + 1);
  const dr = iters(r, 'ドラム');
  const t0 = its[0].time, bar = 4 * 0.6;
  ok('足した loop「ドラム」は、次の小節（4 拍）の頭から始まる', dr.length > 0 && dr[0].time >= at && Math.abs((dr[0].time - t0) / bar - Math.round((dr[0].time - t0) / bar)) < 1e-6, dr.length ? r3(dr[0].time - t0) : 'なし');
  ok('ドラムの音: バスドラムとハイハットが 1 拍おき', (() => { const s = r.filter((x) => x.kind === 'sample' && x.loop === 'ドラム' && x.iter === 0); return s.map((x) => x.name).join() === 'kick,hat' && Math.abs(s[1].time - s[0].time - 0.6) < 1e-6; })());
  await shot('03-rewrite');

  /* ---------- 構文の誤り ---------- */
  const verBefore = await C('lc.engine.ver');
  await setText(V2.replace('  play D4 len 0.5', '  plya D4 len 0.5'));
  const atErr = await now();
  await runKey();
  ok('誤りの行と列と日本語の説明が出る', await C("!el.querySelector('[data-err]').hidden && /^4 行 3 列: 「plya」という命令はありません。もしかして play ですか/.test(el.querySelector('[data-errtext]').textContent)"), await C("el.querySelector('[data-errtext]').textContent"));
  ok('誤りの行に印（行番号と帯）', await C("el.querySelectorAll('[data-gutter] > div')[3].classList.contains('err') && !!el.querySelector('.lc-bar-err')"));
  ok('誤りの字句に波線の印（Custom Highlight の lc-err）', await ev("return CSS.highlights.has('lc-err')"));
  ok('状態の帯「前の版を鳴らし続けています」', /前の版を鳴らし続けています/.test(await status()), await status());
  await sleep(3000);
  r = await rec();
  const afterErr = iters(r, 'はじめ').filter((x) => x.time > atErr + 0.31);
  ok('誤りがあっても止まらず、前の版（レ・ファ・ラ・レ）を鳴らし続ける', (await C('lc.engine.playing')) && (await C('lc.engine.ver')) === verBefore && afterErr.length > 0 && afterErr.every((x) => x.ver === verBefore && notesOf(r, 'はじめ', x.iter)[0].midi === 62), afterErr.map((x) => x.ver));
  await shot('04-error');
  await click('.app-livecode [data-a="goerr"]');
  ok('「その行へ」で誤りの字句が選ばれる', await C("(() => { const t = el.querySelector('[data-ta]'); return t.value.slice(t.selectionStart, t.selectionEnd) === 'plya'; })()"));

  /* ---------- 直して、loop を消す ---------- */
  await setText(V2.replace(/\nloop ドラム \{[\s\S]*$/, '\n'));
  const atDel = await now();
  await runKey();
  ok('直して動かすと誤りの印が消える', await C("el.querySelector('[data-err]').hidden && !el.querySelector('.lc-bar-err') && !el.querySelector('[data-gutter] .err')"));
  await sleep(3200);
  r = await rec();
  const drAfter = iters(r, 'ドラム').filter((x) => x.time > atDel + 0.31);
  ok('消した loop「ドラム」は、今のくり返しのあとで止まる', drAfter.length === 0 && !(await C("lc.engine.status().some((s) => s.name === 'ドラム')")), drAfter.map((x) => r3(x.time)));
  ok('残した loop「はじめ」は鳴り続ける', iters(r, 'はじめ').some((x) => x.time > atDel + 0.31));

  /* ---------- 止める ---------- */
  await focusEditor();
  await page.key('Escape');
  await sleep(300);
  const nStop = (await rec()).length;
  ok('Esc で止まる（止める のボタンも押せなくなる）', !(await C('lc.engine.playing')) && (await C("el.querySelector('[data-a=\"stop\"]').disabled")) && /止めました/.test(await status()), await status());
  await sleep(1000);
  ok('止めたあとは新しい音を予約しない', (await rec()).length === nStop);
  ok('止めると鳴っている行の印が消える', (await C('lc.nowLines().length')) === 0);

  /* ---------- 実行の誤り（3 回目のくり返しで 0 で割る） ---------- */
  await setText('tempo 300\nloop a {\n  play C4 + 12 / (2 - count)\n  rest 1\n}\n');
  await runKey();
  ok('実行の誤り: その loop を止めて、行と列を出す', await waitFor(`${W} return /loop「a」を止めました。3 行 16 列: 0 で割ることはできません/.test(el.querySelector('[data-errtext]').textContent)`, 4000), await C("el.querySelector('[data-errtext]').textContent"));
  ok('実行の誤りで loop が無くなったら、止まった状態に戻る', await waitFor(`${W} return !lc.engine.playing`, 4000));

  /* ---------- 見本 ---------- */
  const loadEx = async (id) => { await command('ex:' + id); await sleep(300); if (await ev("return !!document.querySelector('dialog.msgbox[open]')")) await answer('はい'); await sleep(200); };
  const playFor = async (ms) => { await runKey(); await sleep(ms); const rr = await rec(); await focusEditor(); await page.key('Escape'); await sleep(200); return rr; };
  for (const ex of L.EXAMPLES) {
    await loadEx(ex.id);
    ok(`見本「${ex.name}」: メニューから入る（題名にも出る）`, (await C('lc.text()')) === ex.code && (await C("el.querySelector('.title-bar-text').textContent")) === `${ex.name}（見本） - 音の実験室`);
  }
  // ドラムの 8 ビート
  await loadEx('beat8');
  r = await playFor(2600);
  {
    const spb = 60 / 112, s = r.filter((x) => x.kind === 'sample' && x.loop === 'ドラム' && x.iter === 0), t0b = iters(r, 'ドラム')[0].time;
    const at8 = (n) => s.filter((x) => x.name === n && x.time - t0b < 4 * spb - 1e-6).map((x) => r3((x.time - t0b) / spb));
    ok('8 ビート: 1 小節にハイハット 8 つ', JSON.stringify(at8('hat')) === '[0,0.5,1,1.5,2,2.5,3,3.5]', at8('hat'));
    ok('8 ビート: バスドラムは 1 拍目と 3 拍目、スネアは 2 拍目と 4 拍目', JSON.stringify(at8('kick')) === '[0,2]' && JSON.stringify(at8('snare')) === '[1,3]', [at8('kick'), at8('snare')]);
  }
  await loadEx('beat8'); await runKey(); await sleep(900); await shot('05-beat8'); await focusEditor(); await page.key('Escape'); await sleep(200);
  // 和音とベース
  await loadEx('chords');
  r = await playFor(1500);
  {
    // 1 回のくり返し（16 拍）をまとめて予約するので、最初の時刻の音だけを見る
    const ch0 = notesOf(r, '和音', 0), ch = ch0.filter((x) => x.time === ch0[0].time), bs = notesOf(r, 'ベース', 0), bit = iters(r, 'ベース')[0];
    ok('和音とベース: 最初の和音は C4 major（60 64 67）を pad で', JSON.stringify(ch.map((x) => x.midi)) === '[60,64,67]' && ch.every((x) => x.synth === 'pad'));
    ok('和音とベース: ベースは C2 と 1 オクターブ上を saw で、lowpass を通す', JSON.stringify(bs.slice(0, 2).map((x) => x.midi)) === '[36,48]' && bs.every((x) => x.synth === 'saw') && bit.fx.some((f) => f.type === 'lowpass' && f.value === 700));
  }
  // ランダムな旋律: 同じ種なら、計算の部品（core）で作った並びと同じ
  await loadEx('random');
  r = await playFor(2200);
  {
    const mel = r.filter((x) => x.kind === 'note' && x.loop === '旋律').map((x) => x.midi);
    const e = new L.Engine(); e.run(L.compile(L.EXAMPLES.find((x) => x.id === 'random').code).program, 0, { lead: 0 });
    const want = e.advance(10).filter((x) => x.loop === '旋律').flatMap((x) => x.events).filter((x) => x.kind === 'note').map((x) => x.midi).slice(0, mel.length);
    ok('ランダムな旋律: 音は音階（C4 penta）の中から', mel.length >= 8 && mel.every((m) => [60, 62, 64, 67, 69, 72].includes(m)), mel.length);
    ok('ランダムな旋律: 種が同じなので、計算の部品で作った並びと同じ', JSON.stringify(mel) === JSON.stringify(want), mel.slice(0, 10));
    ok('ランダムな旋律: 3 つ以上の高さに散らばる', new Set(mel).size >= 3);
  }
  // エコー
  await loadEx('echo');
  r = await playFor(1600);
  {
    const bell = iters(r, 'ベル')[0], back = iters(r, '背景')[0];
    ok('エコー: ベルの loop に echo、背景の loop に reverb が掛かる', bell.fx.some((f) => f.type === 'echo' && f.value === 0.75) && back.fx.some((f) => f.type === 'reverb'));
    ok('エコー: ベルの最初の音は E5（76）を bell で', notesOf(r, 'ベル', 0)[0].midi === 76 && notesOf(r, 'ベル', 0)[0].synth === 'bell');
  }
  // 数えて変える
  await loadEx('count');
  r = await playFor(2300);
  {
    const lp = iters(r, 'うねり').map((x) => x.fx.find((f) => f.type === 'lowpass').value);
    ok('数えて変える: くり返すたびに lowpass の数が 300 → 700 → 1100', JSON.stringify(lp.slice(0, 3)) === '[300,700,1100]', lp);
  }

  /* ---------- エディタ ---------- */
  await setText('loop a {\nplay C4\n  rest 1\n}');
  const sel = (s, e = s) => C(`(el.querySelector('[data-ta]').setSelectionRange(${s}, ${e}), true)`);
  const val = () => C('lc.text()');
  await sel(9); await page.key('Tab'); await sleep(100);
  ok('Tab で 2 文字の字下げ', (await val()) === 'loop a {\n  play C4\n  rest 1\n}');
  await page.key('Shift+Tab'); await sleep(100);
  ok('Shift+Tab で字下げを戻す', (await val()) === 'loop a {\nplay C4\n  rest 1\n}');
  await sel(9, 24); await page.key('Tab'); await sleep(100);
  ok('いくつかの行を選んで Tab で、まとめて字下げ', (await val()) === 'loop a {\n  play C4\n    rest 1\n}');
  await page.key('Shift+Tab'); await sleep(100);
  await sel(8); await page.key('Enter'); await sleep(100);
  ok('{ のあとで Enter を押すと、次の行は 2 文字下げて始まる', (await val()).startsWith('loop a {\n  \n'), JSON.stringify((await val()).slice(0, 14)));
  await page.key('}'); await sleep(100);
  ok('空白だけの行で } を打つと、1 段戻して入る', (await val()).startsWith('loop a {\n}\n'), JSON.stringify((await val()).slice(0, 14)));
  await setText('loop a {\n  play C4\n  rest 1\n}');
  await sel(12); await page.key('Control+/'); await sleep(100);
  ok('Ctrl+/ で行をコメントにする', (await val()) === 'loop a {\n  # play C4\n  rest 1\n}');
  await page.key('Control+z'); await sleep(100);
  ok('元に戻す（Ctrl+Z）でコメントを外した文字に戻る', (await val()) === 'loop a {\n  play C4\n  rest 1\n}');
  await sel(27); await page.key('Enter'); await sleep(80); // 「  rest 1」の行の終わりで Enter
  await click('.app-livecode [data-insert="2"]');
  ok('早見表を押すと、カーソルの所に入る', (await val()).includes('  rest 1\n  sample kick\n}'), JSON.stringify(await val()));
  ok('早見表で入れたものも色分けされる（打楽器の名前）', await ev("return CSS.highlights.has('lc-builtin')"));

  /* ---------- 保存して開き直す ---------- */
  const SONG = L.EXAMPLES.find((x) => x.id === 'chords').code.replace('tempo 92', 'tempo 96');
  await setText(SONG);
  ok('書き換えると題名に * が付く', (await C("el.querySelector('.title-bar-text').textContent")).startsWith('*'));
  await command('saveas');
  await fileDialog('わたしの曲.oto');
  ok('名前を付けて保存: /音楽/わたしの曲.oto に同じ文字が入る', await ev(`const fs = await import('./js/fs.mjs'); return (await fs.readText('/音楽/わたしの曲.oto')) === ${JSON.stringify(SONG)}`));
  ok('保存すると題名の * が消え、ファイルの名前になる', (await C("el.querySelector('.title-bar-text').textContent")) === 'わたしの曲.oto - 音の実験室');
  await C('(w.close(), true)'); await sleep(500);
  ok('窓を閉じる', !(await ev("return !!document.querySelector('.window.app-livecode')")));
  await ev("const s = await import('./js/shell.mjs'); await s.openFile('/音楽/わたしの曲.oto'); return true;");
  ok('ファイルを開くと、音の実験室の窓が開く', await waitSel('.window.app-livecode [data-ta]', 8000));
  await sleep(400);
  ok('開き直すと同じ文字に戻る', (await C('lc.text()')) === SONG);
  ok('開き直した題名は「わたしの曲.oto - 音の実験室」（* なし）', (await C("el.querySelector('.title-bar-text').textContent")) === 'わたしの曲.oto - 音の実験室');
  await runKey(); await sleep(1300);
  r = await rec();
  ok('開き直したものも同じように鳴る（tempo 96 の和音）', JSON.stringify(notesOf(r, '和音', 0).slice(0, 3).map((x) => x.midi)) === '[60,64,67]' && Math.abs(iters(r, 'ベース')[0].beats * 60 / 96 - 2.5) < 1e-6);
  await shot('06-reopen');
  await focusEditor(); await page.key('Escape'); await sleep(200);
  await setText(SONG + '\n# メモ\n');
  await C('(w.close(), true)'); await sleep(300);
  ok('変更があるときに閉じると、保存するかを聞く', await waitSel('dialog.msgbox[open]', 3000));
  await answer('いいえ');
  ok('「いいえ」で保存せずに閉じる（ファイルは前のまま）', !(await ev("return !!document.querySelector('.window.app-livecode')")) && (await ev(`const fs = await import('./js/fs.mjs'); return (await fs.readText('/音楽/わたしの曲.oto')) === ${JSON.stringify(SONG)}`)));

  /* ---------- 音色と打楽器を 1 つずつ描き出す（OfflineAudioContext、書き出しと同じ道） ---------- */
  await ev("const s = await import('./js/shell.mjs'); await s.launch('livecode'); return true;");
  await waitSel('.window.app-livecode [data-ta]', 8000);
  await sleep(300);
  const voices = [...Object.keys(L.SYNTHS).map((s) => `play C4 synth ${s} len 0.5`), ...Object.keys(L.SAMPLES).map((s) => `sample ${s}`)];
  const loud = {};
  for (const v of voices) loud[v] = await C(`lc.render(${JSON.stringify(`tempo 120\nloop a {\n  ${v}\n  rest 4\n}\n`)}, 1).then((x) => Math.round(x.peak * 1000) / 1000)`);
  ok('音色 7 つと打楽器 7 つが、どれも無音でない（1 つずつ描き出した最大の振れ幅 > 0.05）', Object.values(loud).every((p) => p > 0.05), loud);
  const fxLoud = {};
  for (const fx of ['fx echo 0.5\n  fx lowpass 2000\n  fx reverb 0.5\n  fx distort 0.4', 'fx highpass 100']) fxLoud[fx.replace(/\n {2}/g, ' / ')] = await C(`lc.render(${JSON.stringify(`tempo 120\nloop a {\n  ${fx}\n  play C4 synth saw\n  rest 4\n}\n`)}, 1).then((x) => Math.round(x.peak * 1000) / 1000)`);
  ok('fx を掛けても音が出る（echo・lowpass・reverb・distort を重ねる、highpass）', Object.values(fxLoud).every((p) => p > 0.05 && p < 1), fxLoud);
  const echoTail = await C(`lc.render(${JSON.stringify('tempo 120\nloop a {\n  fx echo 1\n  play C5 synth pluck len 0.2\n  rest 4\n}\n')}, 1).then((x) => x.tail)`);
  ok('echo は、音が止んだあとにも遅れた音が残る（0.5 秒あとの振れ幅）', echoTail > 0.01, echoTail);

  /* ---------- WAV の書き出し（メニューから。2 小節） ---------- */
  await loadEx('beat8');
  await command('wav');
  ok('WAV の書き出し: 小節の数を聞く箱が出る', await waitSel('dialog.lc-dlg[open] #lcBars', 4000));
  await ev("const i = document.querySelector('dialog.lc-dlg[open] #lcBars'); i.value = '2'; i.dispatchEvent(new Event('input')); return true;");
  ok('箱に秒の長さが出る（2 小節 = 4.3 秒、tempo 112）', /4\.3 秒/.test(await ev("return document.querySelector('dialog.lc-dlg[open] [data-sec]').textContent")));
  await ev("document.querySelector('dialog.lc-dlg[open] [data-ok]').click(); return true;");
  await fileDialog('8ビート.wav');
  ok('書き出しが終わる', await waitFor(`${W} return !!lc.lastWav()`, 20000));
  const wav = await ev(`const fs = await import('./js/fs.mjs'); const b = new Uint8Array(await (await fs.readBlob('/音楽/8ビート.wav')).arrayBuffer());
    const dv = new DataView(b.buffer), tag = (o) => String.fromCharCode(...b.slice(o, o + 4)); let peak = 0, nz = 0;
    for (let o = 44; o < b.length; o += 2) { const v = Math.abs(dv.getInt16(o, true)); if (v > peak) peak = v; if (v > 30) nz++; }
    const ac = new OfflineAudioContext(1, 1, 44100), dec = await ac.decodeAudioData(b.buffer.slice(0));
    return { riff: tag(0), wave: tag(8), ch: dv.getUint16(22, true), rate: dv.getUint32(24, true), bytes: b.length, peak: peak / 32768, nz, dur: dec.duration };`);
  ok('WAV のファイル: RIFF/WAVE・2 チャンネル・44100Hz', wav.riff === 'RIFF' && wav.wave === 'WAVE' && wav.ch === 2 && wav.rate === 44100, wav);
  ok('WAV は無音でない（最大の振れ幅 > 0.1、音のある標本が多い）', wav.peak > 0.1 && wav.nz > 20000, { peak: wav.peak, nz: wav.nz });
  ok('WAV の長さは 2 小節 + 余韻（約 6.8 秒）で、ブラウザで読める', Math.abs(wav.dur - (L.barsToSeconds(2, 112) + 0.02 + 2.5)) < 0.05, wav.dur);
  ok('状態の帯に「書き出しました」', /書き出しました: \/音楽\/8ビート\.wav/.test(await status()), await status());

  /* ---------- 説明書・音の形・Alt・新規 ---------- */
  await focusEditor(); await page.key('F1');
  ok('F1 で説明書が開く（命令の一覧の行が説明書の数だけ）', await waitSel('dialog.lc-help[open]', 3000) && (await ev("return document.querySelectorAll('dialog.lc-help[open] .lc-ref tbody tr').length")) === L.REFERENCE.length);
  await sleep(300);
  await shot('07-help');
  await page.key('Escape'); await sleep(300);
  ok('Esc で説明書を閉じる', !(await ev("return !!document.querySelector('dialog.lc-help')")));
  await click('.app-livecode [data-a="scope"]');
  ok('音の形をスペクトルに切り替える', await C("el.querySelector('[data-a=\"scope\"]').getAttribute('aria-pressed') === 'true' && /スペクトル/.test(el.querySelector('[data-a=\"scope\"]').textContent)"));
  await focusEditor(); await page.key('Alt+r'); await sleep(1500);
  ok('Alt+R（動かす のボタン）でも鳴る', await C('lc.engine.playing'));
  await shot('08-spectrum');
  await page.key('Alt+t'); await sleep(300);
  ok('Alt+T（止める のボタン）で止まる', !(await C('lc.engine.playing')));
  await command('new'); await sleep(600);
  ok('新規で、新しい窓が「無題」で開く', (await C("el.querySelector('.title-bar-text').textContent")) === '無題 - 音の実験室' && /loop a \{/.test(await C('lc.text()')));
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'livecode-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((x) => !x.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
