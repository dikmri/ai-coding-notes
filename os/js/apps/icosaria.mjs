// 蒼海と白柱のイコサリア（ARCADIA-91 付属のアクション RPG）を窓の中で遊ぶ。
// ゲームは games/icosaria/ の独立したページで、iframe に入れて開く（ゲームのキー操作が OS の操作とぶつからないように）
export async function launch(os, args = {}, rect = {}) {
  const { wm } = os;
  const win = wm.open({
    app: 'icosaria', icon: os.APPS.icosaria.icon, className: 'app-icosaria', title: '蒼海と白柱のイコサリア', w: 1000, h: 640, ...rect, args: {},
    render(w) {
      w.body.innerHTML = '<iframe class="game-frame" src="games/icosaria/index.html" aria-label="蒼海と白柱のイコサリア" allow="gamepad; autoplay"></iframe>';
    },
  });
  const frame = win.body.querySelector('iframe');
  // 窓を押したら、ゲームにキーボードを渡す
  win.el.addEventListener('pointerdown', () => setTimeout(() => frame.focus(), 0));
  frame.addEventListener('load', () => frame.focus());
  os.log('icosaria.open', {}, 'ok');
  return win;
}
