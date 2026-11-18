// 写真の現像（os/js/apps/photo.mjs）を、OS の中で画面なしの Chrome で通しで確かめる（音は出さない）。
// 見本の写真を開き、露出・コントラスト・色温度・トーンカーブ・白黒を変えて書き出し、画素が期待どおりに変わるかを数で確かめる。
// 切り抜きと回転の大きさ、.fdev に保存して開き直すと同じ画像に戻ること、WebGL2 と 2D の代わりの処理が同じ画素になることも確かめる。
// 確かめ専用の Chrome のプロファイル（runtime/photo-profile）を使い、始めと終わりに仮想ドライブと localStorage を空にする。
//
// 使い方: 先に node tools/serve.mjs 8800 を動かしてから、node tools/photo-check.mjs [番号=8800]
//   画面の写真は build/photo-check/、結果は logs/photo-check.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser } from './lib/cdp.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = process.argv[2] || 8800;
const URL0 = `http://127.0.0.1:${PORT}/os/`;
const OUT = join(ROOT, 'build', 'photo-check');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await openBrowser({ width: 1366, height: 860, profile: join(ROOT, 'runtime', 'photo-profile') });
const ev = (js) => page.evaluate(`(async () => { ${js} })()`);
const report = [];
const ok = (name, cond, info = '') => { report.push({ name, ok: !!cond, info: typeof info === 'string' ? info : JSON.stringify(info) }); console.log(`${cond ? 'OK' : 'NG'} ${name}${info ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const shot = async (n) => writeFileSync(join(OUT, n + '.png'), Buffer.from(await page.screenshot(), 'base64'));
const center = async (sel) => JSON.parse(await ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'null'; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2, r.width, r.height, r.left, r.top])`));
const waitSel = async (sel, ms = 15000) => { for (let t = 0; t < ms; t += 150) { if (await ev(`return !!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(150); } return false; };
async function click(sel, wait = 300) {
  if (!(await waitSel(sel))) throw new Error('見つからない: ' + sel);
  const r = await center(sel);
  await page.click(r[0], r[1]);
  await sleep(wait);
}
const W = '.app-photo';
const P = (js) => ev(`const w = document.querySelector('${W}'); ${js}`);
const cmd = (command, extra = {}) => P(`w.querySelector('.app-body').dispatchEvent(new CustomEvent('w95:command', { detail: { command: ${JSON.stringify(command)}, ...${JSON.stringify(extra)} }, bubbles: true })); return true;`);
const val = (id) => P(`return +w.querySelector('[data-n="${id}"]').value`);
const status = () => P(`return w.querySelector('.status-field[data-status]').textContent`);
const dims = () => P(`return w.querySelector('[data-dim]').textContent`);
const title = () => P(`return w.querySelector('.title-bar-text').textContent`);
// 数の欄に打ち込んで Tab で決める（利用者と同じ道）
async function typeValue(id, v) {
  await click(`${W} [data-n="${id}"]`, 100);
  await page.key('Control+a'); await page.typeText(String(v)); await page.key('Tab');
  await sleep(250);
}
// つまみの値を変える（input と change を出す）
const setSlider = (id, v) => P(`const r = w.querySelector('[data-k="${id}"]'); r.value = ${v}; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
const wipe = () => ev("const fs = await import('./js/fs.mjs'); await fs.open(); await fs.wipe(); localStorage.clear(); return true;");
const answer = (value) => click(`dialog.msgbox[open] .button-row button[data-close="${value}"]`, 400);

// 書き出しの窓 → 形式 → 保存の箱で名前 → 仮想ドライブに書けるまで待つ
async function exportAs(name, fmt = 'png', { keep = false } = {}) {
  await click(`${W} [data-a="export"]`, 400);
  if (!(await waitSel('dialog.ph-export[open]'))) throw new Error('書き出しの窓が開かない');
  await click(`dialog.ph-export[open] input[value="${fmt}"]`, 150);
  await click('dialog.ph-export[open] button[data-close="drive"]', 400);
  if (!(await waitSel('dialog.file-dlg[open]'))) throw new Error('保存の箱が開かない');
  await ev(`const i = document.querySelector('dialog.file-dlg[open] #fdName'); i.value = ${JSON.stringify(name)}; return true;`);
  await click('dialog.file-dlg[open] [data-ok]', 300);
  if (await ev("return !!document.querySelector('dialog.msgbox[open]')")) await answer('はい');
  const path = '/画像/' + name;
  for (let t = 0; t < 30000; t += 200) { if (await ev(`const fs = await import('./js/fs.mjs'); return await fs.exists(${JSON.stringify(path)})`)) break; await sleep(200); }
  await sleep(300);
  toasts = await ev("return document.querySelectorAll('.fos-toast').length");
  // 知らせ（右下）を「閉じる」で閉じる。開いたままだと右の調整の欄に重なる
  if (!keep) while (await ev("return !!document.querySelector('.fos-toast [data-close]')")) await click('.fos-toast [data-close]', 200);
  return path;
}
// 仮想ドライブの画像の画素の統計（平均の明るさ・RGB、明るさのばらつき、R=G=B からの最大のずれ、指紋）
const STATS = `async (path) => {
  const fs = await import('./js/fs.mjs');
  const bmp = await createImageBitmap(await fs.readBlob(path)), c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height).data, n = d.length / 4;
  let r = 0, gg = 0, b = 0, l = 0, l2 = 0, gray = 0, h = 2166136261;
  for (let i = 0; i < d.length; i += 4) {
    const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    r += d[i]; gg += d[i + 1]; b += d[i + 2]; l += L; l2 += L * L;
    gray = Math.max(gray, Math.abs(d[i] - d[i + 1]), Math.abs(d[i + 1] - d[i + 2]));
    h = Math.imul(h ^ d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16), 16777619) >>> 0;
  }
  return { w: bmp.width, h: bmp.height, r: r / n, g: gg / n, b: b / n, l: l / n, sd: Math.sqrt(l2 / n - (l / n) ** 2), gray, hash: h };
}`;
const stats = async (path) => JSON.parse(await ev(`return JSON.stringify(await (${STATS})(${JSON.stringify(path)}))`));
// 2 つの画像の画素の差（最大と平均）
const diff = async (a, b) => JSON.parse(await ev(`
  const fs = await import('./js/fs.mjs');
  const get = async (p) => { const bmp = await createImageBitmap(await fs.readBlob(p)), c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, bmp.width, bmp.height); };
  const A = await get(${JSON.stringify(a)}), B = await get(${JSON.stringify(b)});
  if (A.width !== B.width || A.height !== B.height) return JSON.stringify({ size: false });
  let max = 0, sum = 0, over2 = 0;
  for (let i = 0; i < A.data.length; i++) { if ((i & 3) === 3) continue; const e = Math.abs(A.data[i] - B.data[i]); if (e > max) max = e; sum += e; if (e > 2) over2++; }
  return JSON.stringify({ size: true, max, mean: sum / (A.data.length * 0.75), over2: over2 / (A.data.length * 0.75) });`));
let toasts = 0; // 書き出したあとに出ている知らせの数（積み重ならないこと）
const f2 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(2) : v]));

try {
  await page.navigate(URL0 + '?shot');
  // 起動の途中で空にすると、起動の続きの書き込みが残ることがある。デスクトップのアイコンが並ぶのを待ってから空にする
  await waitSel('#desk:not([hidden]) .desk-icon', 20000);
  await sleep(500);
  await wipe();
  await page.navigate(URL0 + '?shot=photo');
  ok('写真の現像の窓が ?shot=photo で開く', await waitSel(`${W}[data-hist-total]`, 30000));
  const engine = await P('return w.dataset.engine');
  ok('処理のしかたが決まる（画面なしの Chrome で WebGL2 が使えるか）', engine === 'webgl2' || engine === 'cpu', engine);
  ok('初めて開くと、見本の写真（夕暮れの海）を作って開く', (await title()).startsWith('見本の夕暮れ.jpg') && (await ev("const fs = await import('./js/fs.mjs'); return await fs.exists('/画像/見本の夕暮れ.jpg')")), await title());
  ok('状態の帯に、最初にすることの案内が出る', /つまみを動かすと色が変わります/.test(await status()), await status());
  ok('ヒストグラムを描く（数えた画素がある）', +(await P('return w.dataset.histTotal')) > 1000, await P('return w.dataset.histTotal'));
  await sleep(500);
  await shot('01-start');

  // 何もしない書き出しは、元の画像と同じ画素（式の既定が何もしないこと）
  const base = await exportAs('確かめ-元.png', 'png', { keep: true });
  const sBase = await stats(base);
  ok('既定のまま書き出すと、元の大きさ 1280 × 853 の PNG になる', sBase.w === 1280 && sBase.h === 853, f2(sBase));
  const dSrc = await diff(base, '/画像/見本の夕暮れ.jpg');
  ok('既定のまま書き出した画素は、元の画像とほぼ同じ（最大の差 2 以下）', dSrc.size && dSrc.max <= 2, dSrc);
  ok('書き出しの知らせ（状態の帯）に名前と大きさが出る', /確かめ-元\.png/.test(await status()), await status());

  // 露出: 数の欄に打ち込む → 書き出すと平均の明るさが上がる
  await typeValue('exposure', 1);
  ok('露出の数の欄に 1 と打つと、つまみも 1 になる', (await P('return +w.querySelector(\'[data-k="exposure"]\').value')) === 1);
  ok('調整すると題名に * が付く（設定が保存されていない印）', (await title()).startsWith('*'), await title());
  const sExp = await stats(await exportAs('確かめ-露出.png', 'png', { keep: true }));
  ok('続けて書き出しても、書き出しの知らせは 1 つだけ（前の知らせを閉じてから出す）', toasts === 1, String(toasts));
  while (await ev("return !!document.querySelector('.fos-toast [data-close]')")) await click('.fos-toast [data-close]', 200);
  ok('露出 +1 で、書き出した画像の平均の明るさが上がる', sExp.l > sBase.l + 15, `元 ${sBase.l.toFixed(1)} → ${sExp.l.toFixed(1)}`);
  await shot('02-exposure');
  // 元に戻す・やり直し・ダブルクリックで 0
  await page.key('Control+z'); await sleep(300);
  ok('Ctrl+Z で露出が 0 に戻る', (await val('exposure')) === 0);
  await page.key('Control+y'); await sleep(300);
  ok('Ctrl+Y で露出が 1 に戻る（やり直し）', (await val('exposure')) === 1);
  const er = await center(`${W} [data-k="exposure"]`);
  await page.click(er[0], er[1], { count: 2 }); await sleep(300);
  ok('つまみをダブルクリックすると 0 に戻る', (await val('exposure')) === 0);

  // コントラスト: 明るさのばらつきが広がる
  await setSlider('contrast', 60); await sleep(200);
  const sCon = await stats(await exportAs('確かめ-コントラスト.png'));
  ok('コントラスト +60 で、明るさのばらつき（標準偏差）が広がる', sCon.sd > sBase.sd + 5, `元 ${sBase.sd.toFixed(1)} → ${sCon.sd.toFixed(1)}`);
  await setSlider('contrast', 0);

  // 色温度: 赤が強く、青が弱くなる
  await setSlider('temp', 60); await sleep(200);
  const sTmp = await stats(await exportAs('確かめ-色温度.png'));
  ok('色温度 +60 で、赤と青の差（R − B）が広がる（暖かくなる）', sTmp.r - sTmp.b > sBase.r - sBase.b + 10, `元 ${(sBase.r - sBase.b).toFixed(1)} → ${(sTmp.r - sTmp.b).toFixed(1)}`);
  await setSlider('temp', 0);

  // トーンカーブ: 真ん中を押して点を足し、上へ引く
  const cv = await center(`${W} [data-curve]`);
  const toPx = (x, y) => [cv[4] + ((8 + x * 216) / 232) * cv[2], cv[5] + ((8 + (1 - y) * 216) / 232) * cv[3]];
  const [ax, ay] = toPx(0.5, 0.5), [bx, by] = toPx(0.5, 0.72);
  await page.drag(ax, ay, bx, by); await sleep(400);
  const pts = JSON.parse(await P('return JSON.stringify([w.querySelector("[data-cx]").value, w.querySelector("[data-cy]").value])'));
  ok('トーンカーブを押して引くと点が足され、入力と出力の欄に出る', Math.abs(+pts[0] - 128) <= 3 && +pts[1] > 170, pts.join(' → '));
  await shot('03-curve');
  const sCur = await stats(await exportAs('確かめ-カーブ.png'));
  ok('真ん中を持ち上げたトーンカーブで、平均の明るさが上がる', sCur.l > sBase.l + 15, `元 ${sBase.l.toFixed(1)} → ${sCur.l.toFixed(1)}`);
  await click(`${W} [data-a="curvereset"]`, 300);
  ok('「直線に戻す」で曲線の点が 2 つに戻る', (await P('return w.querySelector("[data-cx]").disabled')) === true);

  // 白黒: すべての画素が R=G=B
  await click(`${W} [data-mono]`, 300);
  const sMono = await stats(await exportAs('確かめ-白黒.png'));
  ok('白黒にすると、書き出した画像のすべての画素が R=G=B', sMono.gray === 0, `最大のずれ ${sMono.gray}`);
  await shot('04-mono');
  await click(`${W} [data-mono]`, 300);

  // 比べる: 押している間だけ元の色、左右に分ける
  const cb = await center(`${W} [data-a="compare"]`);
  await page.move(cb[0], cb[1]); await page.down(cb[0], cb[1]); await sleep(400);
  ok('「押す間は元の色」を押している間は、元の色の札が出る', (await P('return !w.querySelector("[data-tag-l]").hidden')) === true);
  await page.up(cb[0], cb[1]); await sleep(300);
  ok('離すと元の色の札が消える', (await P('return w.querySelector("[data-tag-l]").hidden')) === true);
  await click(`[data-preset="b0"]`, 500);
  ok('見本「夕暮れ」を押すと、色温度が 35 になる', (await val('temp')) === 35, String(await val('temp')));
  await click(`${W} [data-a="split"]`, 500);
  ok('「左右で比べる」で境目と札が出る', (await P('return !w.querySelector("[data-split]").hidden && !w.querySelector("[data-tag-r]").hidden')) === true);
  await shot('05-split');
  await click(`${W} [data-a="split"]`, 300);

  // 切り抜きと回転
  await click(`${W} [data-a="cropmode"]`, 500);
  ok('「切り抜きと回転」で切り抜く範囲の枠が出る', (await P('return !w.querySelector("[data-cropbox]").hidden')) === true);
  await P('const s = w.querySelector("[data-aspect]"); s.value = "1:1"; s.dispatchEvent(new Event("change", { bubbles: true })); return true;');
  await sleep(400);
  ok('比率 1:1 を選ぶと、出力が 853 × 853 になる', (await dims()).startsWith('853 × 853'), await dims());
  const br = await center(`${W} .ph-hd[data-h="br"]`);
  await page.drag(br[0], br[1], br[0] - 80, br[1] - 40); await sleep(400);
  const dSq = await dims();
  const [sqw, sqh] = dSq.split(' × ').map((x) => parseInt(x, 10));
  ok('四隅のつまみを引くと、1:1 のまま小さくなる', sqw === sqh && sqw < 853, dSq);
  await shot('06-crop');
  await click(`${W} [data-a="cropdone"]`, 400);
  const sSq = await stats(await exportAs('確かめ-正方形.png'));
  ok('切り抜いて書き出すと、表示の大きさどおりの正方形になる', sSq.w === sqw && sSq.h === sqh, `${sSq.w} × ${sSq.h}`);
  await cmd('resetgeo'); await sleep(300);
  await P('const s = w.querySelector("[data-aspect]"); s.value = "16:9"; s.dispatchEvent(new Event("change", { bubbles: true })); return true;');
  await sleep(300);
  const d169 = await dims();
  await click(`${W} [data-a="rotr"]`, 400);
  const dRot = await dims();
  const wh = (t) => t.split(' × ').map((x) => parseInt(x, 10));
  ok('右へ 90° 回すと、16:9 の切り抜きが縦長（9:16）になる', wh(d169)[0] === wh(dRot)[1] && wh(d169)[1] === wh(dRot)[0] && (await P('return w.querySelector("[data-aspect]").value')) === '9:16', `${d169} → ${dRot}`);
  await click(`${W} [data-a="rotl"]`, 300);
  await cmd('resetgeo'); await sleep(300);
  await click(`${W} [data-a="cropmode"]`, 400);
  await typeValue('angle', 8);
  const dAng = await dims();
  const [aw, ah] = dAng.split(' × ').map((x) => parseInt(x, 10));
  ok('水平を 8° 直すと、四隅がはみ出さないように切り抜きが縮む（比率はそのまま）', aw < 1280 && ah < 853 && Math.abs(aw / ah - 1280 / 853) < 0.01, dAng);
  await shot('07-straighten');
  await page.key('Enter'); await sleep(300);
  ok('Enter で切り抜きを決めると、枠が消える', (await P('return w.querySelector("[data-cropbox]").hidden')) === true);
  const angPath = await exportAs('確かめ-水平.png');
  const sAng = await stats(angPath);
  ok('水平を直して書き出すと、表示の大きさどおりで、四隅に透明や黒の抜けが無い', sAng.w === aw && sAng.h === ah && (await ev(`const fs = await import('./js/fs.mjs'); const bmp = await createImageBitmap(await fs.readBlob('${angPath}')), c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0); return [[0, 0], [bmp.width - 1, 0], [0, bmp.height - 1], [bmp.width - 1, bmp.height - 1]].every(([x, y]) => g.getImageData(x, y, 1, 1).data[3] === 255)`)), `${sAng.w} × ${sAng.h}`);

  // .fdev に保存して、閉じて、開き直す
  await setSlider('exposure', 0.4); await setSlider('vignette', 40); await sleep(200);
  await click(`${W} [data-mono]`, 200); await click(`${W} [data-mono]`, 200); // 白黒を入れて戻す（記録が増えるだけ）
  const before = JSON.parse(await P(`return JSON.stringify(Object.fromEntries([...w.querySelectorAll('[data-n]')].map((n) => [n.dataset.n, +n.value])))`));
  await page.key('Control+s'); await sleep(500);
  const fdev = JSON.parse(await ev("const fs = await import('./js/fs.mjs'); return await fs.readText('/画像/見本の夕暮れ.jpg.fdev')"));
  ok('Ctrl+S で、画像の横に「見本の夕暮れ.jpg.fdev」を保存する（元の画像のパスと設定）', fdev.source === '/画像/見本の夕暮れ.jpg' && fdev.settings.exposure === 0.4 && fdev.settings.angle === 8 && fdev.settings.temp === 35, JSON.stringify(fdev.settings).slice(0, 120));
  ok('保存すると題名の * が消える', !(await title()).startsWith('*'), await title());
  const keep = await stats(await exportAs('確かめ-保存前.png'));
  await click(`${W} .title-bar-controls .close`, 600);
  ok('保存したあとは、閉じるときに確かめを聞かずに閉じる', !(await ev("return !!document.querySelector('.app-photo')")) && !(await ev("return !!document.querySelector('dialog.msgbox[open]')")));
  await ev("const shell = await import('./js/shell.mjs'); shell.openFile('/画像/見本の夕暮れ.jpg', 'photo'); return true;");
  ok('画像を開き直すと窓が開く', await waitSel(`${W}[data-hist-total]`, 20000));
  await sleep(600);
  ok('開き直すと、状態の帯に「前に保存した設定を読み込みました」と出る', /前に保存した設定/.test(await status()), await status());
  const after = JSON.parse(await P(`return JSON.stringify(Object.fromEntries([...w.querySelectorAll('[data-n]')].map((n) => [n.dataset.n, +n.value])))`));
  ok('開き直すと、つまみの値が全部同じに戻る', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
  ok('開き直した直後は、題名に * が付かない', !(await title()).startsWith('*'), await title());
  const again = await stats(await exportAs('確かめ-開き直し.png'));
  ok('開き直して書き出すと、保存前と同じ画素になる（指紋が同じ）', again.hash === keep.hash && again.w === keep.w, `${keep.hash} / ${again.hash}`);
  await shot('08-reopen');

  // WebGL2 と 2D の代わりの処理: 同じ設定で同じ画素になるか
  const glPath = '/画像/確かめ-開き直し.png';
  await cmd('engine', { checked: false }); await sleep(800);
  ok('メニューで WebGL2 を切ると、2D の代わりの処理になる', (await P('return w.dataset.engine')) === 'cpu' && /2D/.test(await P('return w.querySelector("[data-engine]").textContent')));
  ok('自分で切ったときは「GPU の描き先が失われた」と出ない', !/失われ/.test(await status()), await status());
  await shot('09-cpu');
  const cpuPath = await exportAs('確かめ-2D.png');
  const dEng = await diff(glPath, cpuPath);
  ok(engine === 'webgl2' ? 'WebGL2 と 2D の代わりの処理で、書き出した画素がほぼ同じ（最大の差 3 以下）' : '2D の代わりの処理で書き出せる', dEng.size && dEng.max <= 3, dEng);
  await setSlider('exposure', 1); await sleep(300);
  ok('2D の代わりの処理でも、つまみを動かすとヒストグラムを描き直す', +(await P('return w.dataset.histTotal')) > 1000);
  await setSlider('exposure', 0.4); await sleep(200);
  await cmd('engine', { checked: true }); await sleep(800);
  ok('メニューで WebGL2 を入れ直すと、WebGL2 に戻る（使えるとき）', (await P('return w.dataset.engine')) === engine, await P('return w.dataset.engine'));

  // 今の設定を見本にする
  await click(`${W} [data-a="savepreset"]`, 400);
  await ev("const i = document.querySelector('#phPresetName'); i.value = '確かめの見本'; return true;");
  await click('dialog[open] button[data-close="ok"]', 500);
  const up = await ev("const fs = await import('./js/fs.mjs'); return await fs.readText('/システム/現像の見本.json')");
  ok('「今の設定を見本にする」で、見本が /システム/現像の見本.json に残り、ボタンが増える', /確かめの見本/.test(up) && (await P('return w.querySelectorAll("[data-userpresets] .ph-preset").length')) === 1, up.slice(0, 80));

  // 窓へ落とした画像を開く（デスクトップのアイコンを落としたときと同じ知らせ）
  await P(`w.querySelector('.app-body').dispatchEvent(new CustomEvent('fos:drop-file', { detail: { path: '/画像/確かめ-元.png' }, bubbles: true })); return true;`);
  for (let t = 0; t < 10000 && !(await title()).includes('確かめ-元.png'); t += 200) await sleep(200);
  ok('窓へ落とした PNG を開く（保存済みなので確かめは出ない）', (await title()).includes('確かめ-元.png'), await title());
  ok('別の画像を開くと、調整は既定に戻る', (await val('temp')) === 0 && (await val('exposure')) === 0);

  // JPEG（品質）と WebP の書き出し、パソコンへ書き出す、「開く」の箱
  const typeOf = (path) => ev(`const fs = await import('./js/fs.mjs'); const b = await fs.readBlob(${JSON.stringify(path)}); return b.type + ' ' + b.size`);
  const jpg = await exportAs('確かめ.jpg', 'jpeg'), webp = await exportAs('確かめ.webp', 'webp');
  const [jt, js] = (await typeOf(jpg)).split(' '), [wt, ws] = (await typeOf(webp)).split(' '), pngSize = +(await typeOf('/画像/確かめ-元.png')).split(' ')[1];
  ok('JPEG と WebP で書き出せる（PNG より小さい）', jt === 'image/jpeg' && wt === 'image/webp' && +js < pngSize && +ws < pngSize, `jpeg ${js} / webp ${ws} / png ${pngSize}`);
  ok('JPEG で書き出した画像は、元の大きさで読める', (await stats(jpg)).w === 1280);
  await click(`${W} [data-a="export"]`, 400);
  await click('dialog.ph-export[open] input[value="png"]', 150);
  ok('PNG を選ぶと、品質のつまみは使えない', await ev("return document.querySelector('dialog.ph-export[open] input[type=range]').disabled"));
  await click('dialog.ph-export[open] button[data-close=""]', 300);
  await cmd('exportpc'); await waitSel('dialog.ph-export[open]');
  await click('dialog.ph-export[open] button[data-close="pc"]', 1200);
  ok('「パソコンへ書き出す」で、ダウンロードの名前を状態の帯に出す', /パソコンへ「確かめ-元-現像\.(jpg|png|webp)」を書き出しました/.test(await status()), await status());
  await click(`${W} [data-a="open"]`, 400);
  if (!(await waitSel('dialog.file-dlg[open]'))) throw new Error('開くの箱が開かない');
  await ev(`const i = document.querySelector('dialog.file-dlg[open] #fdName'); i.value = '確かめ-白黒.png'; return true;`);
  await click('dialog.file-dlg[open] [data-ok]', 300);
  for (let t = 0; t < 10000 && !(await title()).includes('確かめ-白黒.png'); t += 200) await sleep(200);
  ok('「開く」の箱で選んだ画像を開く', (await title()).includes('確かめ-白黒.png'), await title());

  // .fdev のファイルを開くと、元の画像をその設定で開く
  await ev("const shell = await import('./js/shell.mjs'); await shell.launch('photo', { path: '/画像/見本の夕暮れ.jpg.fdev' }); return true;");
  await sleep(1500);
  ok('.fdev のファイルを開くと、元の画像をその設定で開く', (await ev("return [...document.querySelectorAll('.app-photo')].some((w) => w.querySelector('.title-bar-text').textContent.startsWith('見本の夕暮れ.jpg') && +w.querySelector('[data-n=\"temp\"]').value === 35)")));
  await shot('10-fdev');
  ok('ページの console.error が出ていない', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  ok('途中で止まらない', false, e.message);
  await shot('99-error').catch(() => {});
} finally {
  await wipe().catch(() => {});
  await page.close();
}
mkdirSync(join(ROOT, 'logs'), { recursive: true });
writeFileSync(join(ROOT, 'logs', 'photo-check.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: report.length, failures: bad }));
process.exit(bad ? 1 : 0);
