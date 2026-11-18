// キーボードで運転する。
// 押しているキーを覚えておき、計算の 1 刻みごとに「アクセル・ブレーキ・ハンドル」の入力に直す。
// キーは「押す」「離す」しかないので、ハンドルは押した瞬間にいっぱいに切らず、少しずつ切る。

const DRIVE_KEYS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
};
const SCROLL_KEYS = new Set(Object.values(DRIVE_KEYS).flat()); // ページが動かないように、既定の動きを止めるキー
const STEER_IN_PER_SECOND = 3.5; // ハンドルを切る速さ（1 秒でいっぱいの何倍）
const STEER_OUT_PER_SECOND = 6; // キーを離したとき、まっすぐに戻る速さ

export function createKeyboard(target = window) {
  const held = new Set(); // 押しているキー
  const presses = []; // 1 回押されたキー（R や C のような、押した回数で働くキー）
  let steer = 0;

  function onKeyDown(event) {
    if (event.target instanceof Element && event.target.closest('dialog')) return; // 画面の上の窓（タイトルなど）の操作はじゃましない
    if (SCROLL_KEYS.has(event.code)) event.preventDefault();
    held.add(event.code);
    if (!event.repeat) presses.push(event.code);
  }
  const onKeyUp = (event) => held.delete(event.code);
  const onBlur = () => held.clear(); // 別の窓へ移ったら、押しっぱなしにしない

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  const isDown = (name) => DRIVE_KEYS[name].some((code) => held.has(code));

  return {
    // 計算の 1 刻みごとに呼ぶ。{ throttle, brake, steer, handbrake } を返す
    driveInput(dt) {
      const wanted = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
      const rate = wanted === 0 || Math.sign(wanted) !== Math.sign(steer) ? STEER_OUT_PER_SECOND : STEER_IN_PER_SECOND;
      const step = rate * dt;
      steer = steer < wanted ? Math.min(steer + step, wanted) : Math.max(steer - step, wanted);
      return { throttle: isDown('throttle') ? 1 : 0, brake: isDown('brake') ? 1 : 0, steer, handbrake: isDown('handbrake') };
    },
    // この前に呼んだときから押されたキーの一覧を返して、空にする
    takePresses() {
      return presses.splice(0);
    },
    clear() {
      held.clear();
      presses.length = 0;
      steer = 0;
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
