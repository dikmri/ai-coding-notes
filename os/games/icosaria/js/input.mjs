// 入力（キーボードとゲームパッド）。押している間の「移動」と、押した瞬間の「行動」に分ける
const KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  attack: ['KeyJ', 'KeyZ', 'Space'], dash: ['ShiftLeft', 'ShiftRight', 'KeyI'], skill1: ['KeyK', 'KeyX'], skill2: ['KeyL', 'KeyC'], skill3: ['KeyU', 'KeyV'],
  potion: ['KeyQ', 'KeyH'], interact: ['KeyE', 'Enter'], menu: ['Tab', 'KeyM', 'Escape'],
};
const PAD = { attack: 0, dash: 1, skill1: 2, skill2: 3, skill3: 5, potion: 4, interact: 10, menu: 9, up: 12, down: 13, left: 14, right: 15 };

export function makeInput(target = window) {
  const down = new Set(), pressed = new Set();
  const codeTo = {};
  for (const [act, codes] of Object.entries(KEYS)) for (const c of codes) codeTo[c] = act;
  target.addEventListener('keydown', (e) => {
    const act = codeTo[e.code];
    if (!act) return;
    // メニューやダイアログが開いているときは、ゲームの操作として受け取らない（ダイアログの Esc などはブラウザに任せる）
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    if (!e.repeat) pressed.add(act);
    down.add(act);
  });
  target.addEventListener('keyup', (e) => { const act = codeTo[e.code]; if (act) down.delete(act); });
  target.addEventListener('blur', () => down.clear());
  let padPrev = {};
  return {
    // 毎コマの始めに呼ぶ。ゲームパッドの状態を読む
    poll() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const p = pads && [...pads].find((x) => x && x.connected);
      const now = {};
      if (p) {
        for (const [act, i] of Object.entries(PAD)) now[act] = !!(p.buttons[i] && p.buttons[i].pressed);
        const [ax, ay] = [p.axes[0] || 0, p.axes[1] || 0];
        if (ax < -0.4) now.left = true; if (ax > 0.4) now.right = true; if (ay < -0.4) now.up = true; if (ay > 0.4) now.down = true;
        for (const act of Object.keys(now)) if (now[act] && !padPrev[act]) pressed.add(act);
      }
      this.pad = now; padPrev = now;
    },
    pad: {},
    isDown(act) { return down.has(act) || !!this.pad[act]; },
    take(act) { const had = pressed.has(act); pressed.delete(act); return had; },
    clear() { pressed.clear(); },
    axis() {
      let x = 0, y = 0;
      if (this.isDown('left')) x -= 1; if (this.isDown('right')) x += 1; if (this.isDown('up')) y -= 1; if (this.isDown('down')) y += 1;
      if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return [x, y];
    },
  };
}
