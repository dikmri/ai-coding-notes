// AI アシスタント「イコちゃん」の見た目と動き: ドット絵（sprites.json）、歩く・飛ぶ、指さす・押す・打つ・話す、吹き出し、強調の枠。
// 画面の一番上の層（.ai-layer）に置き、マウスの操作は通す（pointer-events: none）。止めるボタンと吹き出しの中のボタンだけは押せる。
// 動きを減らす設定（prefers-reduced-motion）の人には、移動の動きを省く。歩く時間の計算は core/agent.mjs の walkMs。
import { walkMs, standSpot, bubbleSpot } from '../core/agent.mjs';

const SIZE = 48, SCALE = 2, PX = SIZE * SCALE;
let layer = null, char = null, cv = null, bubble = null, bubbleText = null, bubbleBtns = null, hl = null, stopBtn = null;
const frames = new Map();
let pos = { x: 0, y: 0 }, facing = 1, speed = 'normal', busy = 0, idleTimer = 0, visible = false, anim = null;
// 吹き出しで隠したくない四角（いま指している部品）。イコちゃんが歩き出すと消す
let avoidRect = null;
const view = () => ({ w: innerWidth, h: innerHeight });
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const getSpeed = () => (reduced() ? 'instant' : speed);
export function setSpeed(s) { speed = ['normal', 'fast', 'instant'].includes(s) ? s : 'normal'; }
export const isVisible = () => visible;
export const position = () => ({ ...pos });
const sleep = (ms, signal) => new Promise((ok, ng) => {
  if (signal?.aborted) return ng(new DOMException('止めました', 'AbortError'));
  const t = setTimeout(ok, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); ng(new DOMException('止めました', 'AbortError')); }, { once: true });
});

// ドット絵を一度だけ描いておく
async function loadSprites() {
  const data = await (await fetch(new URL('./sprites.json', import.meta.url))).json();
  for (const sp of Object.values(data.sprites || {})) {
    const pal = Object.fromEntries((sp.palette || []).map((p) => [p.key, p.color]));
    for (const [name, rows] of Object.entries(sp.frames || {})) {
      const c = document.createElement('canvas'); c.width = sp.w; c.height = sp.h;
      const g = c.getContext('2d');
      rows.forEach((row, y) => [...row].forEach((k, x) => { if (pal[k]) { g.fillStyle = pal[k]; g.fillRect(x, y, 1, 1); } }));
      frames.set(name, c);
    }
  }
}
export function frameNames() { return [...frames.keys()]; }
// 窓の中などに小さな絵として描くため、コマの canvas を渡す
export function frameCanvas(name) { return frames.get(name) || frames.get('idle_1') || null; }

export async function init() {
  if (layer) return;
  await loadSprites();
  layer = document.createElement('div');
  layer.className = 'ai-layer'; layer.dataset.aiIgnore = '';
  layer.innerHTML = `<div class="ai-hl" hidden></div>
    <div class="ai-char" hidden><canvas width="${SIZE}" height="${SIZE}" aria-hidden="true"></canvas></div>
    <div class="ai-bubble" hidden><p class="ai-say" role="status" aria-live="polite"></p><div class="ai-bubble-btns"></div></div>
    <button type="button" class="flat ai-stop" hidden>止める(Esc)</button>`;
  document.body.append(layer);
  char = layer.querySelector('.ai-char'); cv = char.querySelector('canvas');
  bubble = layer.querySelector('.ai-bubble'); bubbleText = bubble.querySelector('.ai-say'); bubbleBtns = bubble.querySelector('.ai-bubble-btns');
  hl = layer.querySelector('.ai-hl'); stopBtn = layer.querySelector('.ai-stop');
  home();
  setFrame('idle_1');
  idle();
}
export function onStop(fn) { stopBtn.onclick = fn; }
export function showStop(on) { stopBtn.hidden = !on; place(); }

export function setFrame(name) {
  const f = frames.get(name) || frames.get('idle_1');
  if (!f || !cv) return;
  const g = cv.getContext('2d'); g.clearRect(0, 0, SIZE, SIZE); g.drawImage(f, 0, 0);
}
function place() {
  char.style.translate = `${pos.x}px ${pos.y}px`;
  cv.style.scale = `${facing} 1`;
  // 止めるボタンはイコちゃんの足元。画面の外に出ないように寄せる
  stopBtn.style.left = Math.max(4, Math.min(innerWidth - 110, pos.x + PX / 2 - 50)) + 'px';
  stopBtn.style.top = Math.min(innerHeight - 34, pos.y + PX + 2) + 'px';
}
// 待っている場所: デスクトップの右下
export function home() {
  pos = { x: innerWidth - PX - 24, y: innerHeight - PX - 28 };
  if (char) place();
}
export function show() { if (!char) return; visible = true; char.hidden = false; place(); }
export function hide() { if (!char) return; visible = false; char.hidden = true; bubble.hidden = true; hl.hidden = true; }

// 待っている間は、呼吸とまばたき
function idle() {
  clearInterval(idleTimer);
  let t = 0;
  idleTimer = setInterval(() => {
    if (busy || !visible) return;
    t++;
    setFrame(t % 17 === 0 && !reduced() ? 'blink' : t % 2 ? 'idle_2' : 'idle_1');
  }, 600);
}

// 目当ての部品の横の立つ場所（計算は core/agent.mjs の standSpot）
export function standBeside(rect) { return standSpot(rect, view(), PX); }
export async function moveTo(to, signal) {
  busy++;
  avoidRect = null;
  try {
    const ms = walkMs(pos, to, getSpeed());
    const face = to.face ?? (to.x >= pos.x ? 1 : -1);
    facing = face;
    if (!ms) { pos = { x: to.x, y: to.y }; place(); return; }
    const from = { ...pos }, fast = getSpeed() === 'fast';
    let k = 0;
    const tick = setInterval(() => setFrame(fast ? 'fly_1' : ['walk_1', 'walk_2', 'walk_3', 'walk_2'][k++ % 4]), 110);
    setFrame(fast ? 'fly_1' : 'walk_1');
    cv.style.scale = `${facing} 1`;
    anim = char.animate([{ translate: `${from.x}px ${from.y}px` }, { translate: `${to.x}px ${to.y}px` }], { duration: ms, easing: 'ease-in-out' });
    const stop = () => anim?.cancel();
    signal?.addEventListener('abort', stop, { once: true });
    try { await anim.finished; } catch { /* 止められた */ }
    clearInterval(tick);
    signal?.removeEventListener('abort', stop);
    pos = { x: to.x, y: to.y };
    if (signal?.aborted) { pos = from; }
    place(); setFrame('idle_1');
    if (signal?.aborted) throw new DOMException('止めました', 'AbortError');
  } finally { busy--; }
}
export async function pose(name, ms, signal) { busy++; try { setFrame(name); await sleep(getSpeed() === 'instant' ? Math.min(ms, 60) : ms, signal); } finally { busy--; } }
export async function pressAnim(signal) { await pose('press_1', 140, signal); await pose('press_2', 160, signal); }
export async function typeAnim(times, signal) { for (let i = 0; i < times; i++) await pose(i % 2 ? 'type_2' : 'type_1', 90, signal); }

// 強調の枠（指さした部品の周り）。rect が null なら消す
export function highlight(rect) {
  if (!hl) return;
  if (!rect) { hl.hidden = true; return; }
  avoidRect = { left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16 };
  Object.assign(hl.style, { left: rect.left - 4 + 'px', top: rect.top - 4 + 'px', width: rect.width + 8 + 'px', height: rect.height + 8 + 'px' });
  hl.hidden = false;
}

// 話す: 吹き出しに1文字ずつ出し、口パク。buttons: [{ label, value }] を渡すと、押されたボタンの value で戻る
export async function say(text, { signal, buttons = [], hold = 0, sound } = {}) {
  busy++;
  try {
    bubbleBtns.innerHTML = buttons.map((b, i) => `<button type="button" class="flat ai-bbtn${i ? '' : ' default'}" data-v="${i}">${b.label}</button>`).join('');
    // 全文を入れた大きさを先に測って置き場所を決める（1文字ずつ出す間に、吹き出しが跳ねないように）
    bubble.style.width = ''; bubble.style.minHeight = '';
    bubbleText.textContent = text;
    bubble.hidden = false;
    const cs = getComputedStyle(bubble);
    bubble.style.width = cs.width; bubble.style.minHeight = cs.height;
    placeBubble();
    const step = getSpeed() === 'instant' ? text.length : 2;
    for (let i = 0; i < text.length; i += step) {
      bubbleText.textContent = text.slice(0, i + step);
      setFrame((i / step) % 2 ? 'talk_2' : 'talk_1');
      if (i % 6 === 0) sound?.();
      if (step < text.length) await sleep(getSpeed() === 'fast' ? 12 : 28, signal);
    }
    bubbleText.textContent = text; setFrame('talk_2');
    if (buttons.length) {
      const v = await new Promise((ok, ng) => {
        // 押したら吹き出しをすぐ消す（次の部品へ歩く間に、前のボタンが残らないように）
        bubbleBtns.onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; bubbleBtns.onclick = null; hideBubble(); ok(buttons[+b.dataset.v].value); };
        signal?.addEventListener('abort', () => ng(new DOMException('止めました', 'AbortError')), { once: true });
        bubbleBtns.querySelector('button')?.focus({ preventScroll: true });
      });
      return v;
    }
    if (hold) await sleep(getSpeed() === 'instant' ? Math.min(hold, 300) : hold, signal);
    return null;
  } finally { busy--; setFrame('idle_1'); }
}
export function hideBubble() { if (bubble) { bubble.hidden = true; bubbleBtns.innerHTML = ''; bubble.style.width = ''; bubble.style.minHeight = ''; } }
// 吹き出しは、イコちゃん・足元の止めるボタン・指している部品に重ならない場所へ（計算は core/agent.mjs の bubbleSpot）
function placeBubble() {
  let bottom = pos.y + PX;
  if (!stopBtn.hidden) bottom = Math.max(bottom, stopBtn.offsetTop + stopBtn.offsetHeight);
  const char = { left: Math.min(pos.x, stopBtn.hidden ? pos.x : stopBtn.offsetLeft), top: pos.y, width: PX, height: bottom - pos.y };
  if (!stopBtn.hidden) char.width = Math.max(pos.x + PX, stopBtn.offsetLeft + stopBtn.offsetWidth) - char.left;
  const s = bubbleSpot({ char, size: { w: bubble.offsetWidth, h: bubble.offsetHeight }, avoid: avoidRect ? [avoidRect] : [], view: view() });
  bubble.style.left = s.x + 'px'; bubble.style.top = s.y + 'px';
}
