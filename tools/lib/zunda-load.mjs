// 元の絵（JPEG）を RGBA の画素にする。Node だけでは JPEG を読めないので、画面なしの Chrome の canvas で開き、
// PNG にして返してもらう。結果は git の対象外のフォルダ（runtime/assets/zunko/work/）に PNG で残し、次からはそれを読む。
// 元の画像から作った画素のファイルは、リポジトリに入れない（権利の決まり）。
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { openBrowser } from './cdp.mjs';
import { decodePng } from './image.mjs';

export async function loadJpeg(file, { workDir, profile }) {
  mkdirSync(workDir, { recursive: true });
  const cache = join(workDir, basename(file).replace(/\.[^.]+$/, '') + '.rgba.png');
  if (existsSync(cache) && statSync(cache).mtimeMs >= statSync(file).mtimeMs) return decodePng(readFileSync(cache));
  const page = await openBrowser({ width: 400, height: 300, profile });
  try {
    const src = 'data:image/jpeg;base64,' + readFileSync(file).toString('base64');
    const b64 = await page.evaluate(`(async () => {
      const img = new Image(); img.src = ${JSON.stringify(src)}; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    })()`);
    const buf = Buffer.from(b64, 'base64');
    writeFileSync(cache, buf);
    return decodePng(buf);
  } finally { await page.close(); }
}
