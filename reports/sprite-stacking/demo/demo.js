// レポートの「その場で回す見本」。描画は stack.js の 2 つの関数だけを使う。
import { drawStack, withOutline } from './stack.js';

const NAMES = {
  adventurer: '冒険者', necromancer: 'ネクロマンサー', bone_soldier: '骨の兵', bell_warden: '鐘守りの亡者（ボス）',
  belltower_ruin: '崩れた鐘楼', house_a: '家', tree_oak: '樫の木', brazier: '火鉢',
};
const POSES = { idle: '待機', walk1: '歩き 1', walk2: '歩き 2', attack: '攻撃', cast: '呪文' };

const root = document.getElementById('spin');
const view = root.querySelector('canvas');
const pick = root.querySelector('#spin-art');
const poseSel = root.querySelector('#spin-pose');
const autoBox = root.querySelector('#spin-auto');
const walkBox = root.querySelector('#spin-walk');
const live = root.querySelector('#spin-live');
const vctx = view.getContext('2d');

const man = await (await fetch('demo/manifest.json')).json();
const strips = new Map();
const load = (file) => strips.get(file) ?? strips.set(file, new Promise((ok, ng) => {
  const img = new Image(); img.onload = () => ok(img); img.onerror = ng; img.src = file;
})).get(file);

let art = 'adventurer', pose = 'idle', turn = Math.PI / 4, last = performance.now(), walkT = 0;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
autoBox.checked = !reduce;

for (const [id, name] of Object.entries(NAMES)) pick.add(new Option(name, id));
function fillPoses() {
  poseSel.replaceChildren(...Object.keys(man.art[art].poses).map((p) => new Option(POSES[p] ?? p, p)));
  pose = poseSel.value;
  poseSel.disabled = poseSel.options.length < 2;
  walkBox.disabled = !man.art[art].poses.walk1;
  if (walkBox.disabled) walkBox.checked = false;
}
fillPoses();

const deg = () => Math.round(((turn * 180 / Math.PI) % 360 + 360) % 360);
const label = () => `${NAMES[art]}（${POSES[currentPose()] ?? ''}）を ${deg()} 度回した絵`;
function currentPose() {
  if (walkBox.checked && man.art[art].poses.walk1) return Math.floor(walkT * 4) % 2 ? 'walk2' : 'walk1';
  return pose;
}

async function render() {
  const p = man.art[art].poses[currentPose()];
  const strip = await load(p.file);
  // 回してもはみ出さない大きさの作業用の canvas（絵の解像度）を用意する
  const diag = Math.ceil(Math.hypot(p.w, p.h));
  const bw = diag + 6, bh = Math.ceil(diag * 0.75) + p.count + 6;
  const work = new OffscreenCanvas(bw, bh);
  const w = work.getContext('2d');
  const [rx, ry] = man.art[art].shadow ?? [p.w / 3, p.h / 4];
  const footX = Math.floor(bw / 2), footY = bh - Math.ceil(diag * 0.75 / 2) - 3;
  w.fillStyle = 'rgba(20, 16, 28, 0.28)'; // 地面の影
  w.beginPath(); w.ellipse(footX, footY, rx, ry * 0.75, 0, 0, Math.PI * 2); w.fill();
  drawStack(w, strip, p, footX, footY, turn);
  const done = withOutline(work);
  // 表示の canvas へ整数倍で拡大して描く
  const scale = Math.max(1, Math.floor(Math.min(view.width / bw, view.height / bh)));
  vctx.imageSmoothingEnabled = false;
  vctx.clearRect(0, 0, view.width, view.height);
  vctx.drawImage(done, Math.floor((view.width - bw * scale) / 2), Math.floor((view.height - bh * scale) / 2), bw * scale, bh * scale);
  view.setAttribute('aria-label', label());
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (autoBox.checked && !dragging) turn += dt * 0.9;
  if (walkBox.checked) walkT += dt;
  render();
  requestAnimationFrame(frame);
}

// 引きずって回す（指でも）。canvas を離れても回し続けられるように、ポインタを捕まえる
let dragging = false, lastX = 0;
view.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; view.setPointerCapture(e.pointerId); });
view.addEventListener('pointermove', (e) => { if (!dragging) return; turn += (e.clientX - lastX) * 0.012; lastX = e.clientX; });
view.addEventListener('lostpointercapture', () => { dragging = false; });
// キーボードでも回せる（左右の矢印で 22.5 度ずつ）
view.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  autoBox.checked = false;
  turn += (e.key === 'ArrowRight' ? 1 : -1) * Math.PI / 8;
  live.textContent = `${deg()} 度`;
});
pick.addEventListener('change', () => { art = pick.value; fillPoses(); });
poseSel.addEventListener('change', () => { pose = poseSel.value; walkBox.checked = false; });

// コードの節に stack.js の中身をそのまま出す（動いているコードと同じ物）
const src = document.getElementById('stack-src');
if (src) src.textContent = await (await fetch('demo/stack.js')).text();

requestAnimationFrame(frame);
