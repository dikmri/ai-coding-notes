// 街あかり（ARCADIA-91 付属の街づくりゲーム）を窓の中で遊ぶ。
// ゲームは games/machiakari/ の独立したページで、iframe に入れて開く（ゲームのキー操作が OS の操作とぶつからないように）
export async function launch(os, args = {}, rect = {}) {
  const { wm } = os;
  const win = wm.open({
    app: 'machiakari', icon: os.APPS.machiakari.icon, className: 'app-machiakari', title: '街あかり', w: 1120, h: 700, ...rect, args: {},
    render(w) {
      w.body.innerHTML = '<iframe class="game-frame" src="games/machiakari/index.html" aria-label="街あかり" allow="autoplay"></iframe>';
    },
  });
  const frame = win.body.querySelector('iframe');
  // 窓を押したら、ゲームにキーボードを渡す
  win.el.addEventListener('pointerdown', () => setTimeout(() => frame.focus(), 0));
  frame.addEventListener('load', () => frame.focus());
  os.log('machiakari.open', {}, 'ok');
  return win;
}
