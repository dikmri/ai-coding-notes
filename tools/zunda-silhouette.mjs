// 図鑑の項目「コードで描いたずんだもんを立体的に動かす」を、正面（0 度）・横（90 度）・後ろ（180 度）から、元の絵と同じ縮尺と位置で描き、
// 写した 3 方向の絵（data/zunda-*.js）と外形の重なり（IoU）を比べる道具。設計書の段階 2 の目安は、正解のある角度で IoU 0.85 以上。
// 使い方: node tools/zunda-silhouette.mjs
// 出力: logs/zunda-silhouette.json、build/zunda/silhouette-<向き>.png（左: 項目、真ん中: 写した絵、右: 重ね。赤は項目だけ、青は写した絵だけ）
// 項目の髪の束・枝豆の飾り・腕と脚は、3 方向の絵をそのまま描くのではなく、骨格や揺れもので描くので、完全には重ならない。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { openBrowser } from './lib/cdp.mjs';
import { decodePng, encodePng } from './lib/image.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (v) => { const w = {}; new Function('window', readFileSync(join(ROOT, `data/zunda-${v}.js`), 'utf8'))(w); return w.DEKIRU_DATA[`zunda-${v}`]; };
// 向きごとの、見る向き（cam）と、絵の切り出しに合わせる位置。x は中心の線（正面 923.5、横 235、後ろ 1566.5）から切り出しの左を引いた値
const VIEWS = [['front', 0, 923.5], ['side', -Math.PI / 2, 235], ['back', Math.PI, 1566.5]];
const result = { date: new Date().toISOString(), views: {} };
mkdirSync(join(ROOT, 'build/zunda'), { recursive: true });
// 撮る道具（tools/zunda-shots.mjs）と同じ設定のフォルダを同時に使うと Chrome が起動できないので、別のフォルダを使う
const page = await openBrowser({ width: 800, height: 600, profile: join(ROOT, 'runtime/zunda-profile-sil') });
try {
  for (const [v, cam, axis] of VIEWS) {
    const D = load(v), [W, H] = [D.w, D.h], ox = axis - D.origin[0], oy = -D.origin[1];
    // 項目を撮る（ボタンと説明を隠し、止めて、まばたきなし）
    const set = JSON.stringify([{ cam, frame: [1, ox, oy], paused: true, blink: 0, clip: null }]);
    execFileSync(process.execPath, [join(ROOT, 'tools/zunda-shots.mjs'), `sil-${v}`, '--size', `${W}x${H}`, '--wait', '1500', '--set', set, '--probe', "document.body.classList.add('thumb') || 'ok'"], { cwd: ROOT, stdio: 'ignore' });
    const shot = decodePng(readFileSync(join(ROOT, `build/zunda/shots/sil-${v}-00.png`)));
    // 写した絵の外形（塗りを不透明で描く）
    const b64 = await page.evaluate(`(() => {
      const D = ${JSON.stringify(D)}, c = document.createElement('canvas'); c.width = D.w; c.height = D.h;
      const g = c.getContext('2d'); g.fillStyle = '#000';
      for (const s of D.shapes) if (s.kind === 'fill') g.fill(new Path2D(s.d));
      return c.toDataURL('image/png').split(',')[1];
    })()`);
    const ref = decodePng(Buffer.from(b64, 'base64'));
    const N = W * H, mA = new Uint8Array(N), mB = new Uint8Array(N), BG = [0xf4, 0xf1, 0xea];
    for (let i = 0; i < N; i++) {
      const k = i * 4, d = Math.abs(shot.data[k] - BG[0]) + Math.abs(shot.data[k + 1] - BG[1]) + Math.abs(shot.data[k + 2] - BG[2]);
      mA[i] = d > 24 ? 1 : 0; mB[i] = ref.data[k + 3] > 127 ? 1 : 0;
    }
    let inter = 0, uni = 0; for (let i = 0; i < N; i++) { if (mA[i] && mB[i]) inter++; if (mA[i] || mB[i]) uni++; }
    // 頭だけ（首の付け根より上、y < 340）も数える
    const yCut = 340 - D.origin[1]; let hi = 0, hu = 0;
    for (let y = 0; y < Math.min(H, yCut); y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (mA[i] && mB[i]) hi++; if (mA[i] || mB[i]) hu++; }
    result.views[v] = { cam: +cam.toFixed(4), iou: +(inter / uni).toFixed(4), headIou: +(hi / hu).toFixed(4), model: mA.reduce((a, b) => a + b, 0), traced: mB.reduce((a, b) => a + b, 0), pass: inter / uni >= 0.85 };
    const G = 8, CW = W * 3 + G * 2, out = new Uint8Array(CW * H * 4).fill(255);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, k = i * 4, put = (p, c) => out.set(c, (y * CW + p * (W + G) + x) * 4);
      put(0, [shot.data[k], shot.data[k + 1], shot.data[k + 2], 255]);
      put(1, mB[i] ? [60, 60, 60, 255] : [255, 255, 255, 255]);
      put(2, mA[i] && mB[i] ? [90, 90, 90, 255] : mA[i] ? [230, 40, 40, 255] : mB[i] ? [40, 90, 230, 255] : [255, 255, 255, 255]);
    }
    writeFileSync(join(ROOT, `build/zunda/silhouette-${v}.png`), encodePng({ width: CW, height: H, data: out }));
    console.log(`${v}: IoU ${result.views[v].iou}（頭 ${result.views[v].headIou}）${result.views[v].pass ? ' 合格' : ' 不合格'}`);
  }
} finally { await page.close(); }
writeFileSync(join(ROOT, 'logs/zunda-silhouette.json'), JSON.stringify(result, null, 2));
