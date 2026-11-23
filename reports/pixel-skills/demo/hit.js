// レポートの見本: 押すと「当たりの光」が出る。pixelfx（MIT）の collect-burst を連チャンの色に塗り替え、後ろに金粉（gold-dust）を流す。
// ゲーム（dedama/）と同じファイルを読む。pixelfx は依存なしの ES モジュールなので、写して import するだけで使える。
import { createFrame, clearFrame, createFx, composite } from '../../../dedama/vendor/pixelfx/src/core/index.js';
import * as burst from '../../../dedama/vendor/pixelfx/src/fx/pickups/collect-burst.js';
import * as goldDust from '../../../dedama/vendor/pixelfx/src/fx/ui/gold-dust.js';
import { chainColor } from '../../../dedama/js/logic.mjs';
import { rampFrom } from '../../../dedama/js/fx.mjs';

const W = 224, H = 136, BG = 0x120a0b; // 背景 #0b0a12（composite は 0xBBGGRR の数で受け取る）
const canvas = document.getElementById('fx-demo'), ctx = canvas.getContext('2d');
const label = document.getElementById('fx-chain'), pause = document.getElementById('fx-pause');
const frame = createFrame(W, H), img = ctx.createImageData(W, H);
const list = [createFx(goldDust, { x: W / 2, y: 132, count: 40 })];
let chain = 0, last = 0, running = !matchMedia('(prefers-reduced-motion: reduce)').matches;

canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
  chain++;
  const color = chainColor(chain, chain / 7); // 1 白 → 3 黄 → 5 赤 → 10 紫 → 15 金 → 20 から虹
  list.push(createFx(burst, { x, y: y + 30, palette: rampFrom(color), seed: chain }));
  label.textContent = `${chain} 連`;
  label.style.color = color;
  if (!running) toggle();
});
function toggle() { running = !running; pause.textContent = running ? '一時停止' : '再生'; if (running) requestAnimationFrame(tick); }
pause.addEventListener('click', toggle);
pause.textContent = running ? '一時停止' : '再生';

function tick(t) {
  const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
  last = t;
  clearFrame(frame);
  for (const f of list) { f.update(dt); f.draw(frame); }
  for (let i = list.length - 1; i > 0; i--) if (list[i].done()) list.splice(i, 1);
  composite(frame, img.data, BG); // 色の層の上に光の層を足す
  ctx.putImageData(img, 0, 0);
  if (running) requestAnimationFrame(tick); else last = 0;
}
requestAnimationFrame(tick);
