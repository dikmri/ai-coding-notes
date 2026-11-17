// 画面キャプチャの計算: 切り抜く四角（向きをそろえる・画像の内に収める・プレビューの倍率を直す・四隅のつまみ）、保存の名前、画面共有の誤りの文。
// 画面には触らない純粋な関数だけを置く（テストは tests/os-capture.test.mjs）。四隅のつまみの名前は tl・tr・bl・br（窓のつまみ .rz の nw などと重ならないように）。

export const normRect = (x0, y0, x1, y1) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
export function clampRect(r, W, H) {
  const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
  const x1 = Math.min(W, Math.round(r.x + r.w)), y1 = Math.min(H, Math.round(r.y + r.h));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
// プレビューは画像を scale 倍で見せているので、プレビューの上の四角を画像の画素へ直す
export const toImageRect = (r, scale) => ({ x: r.x / scale, y: r.y / scale, w: r.w / scale, h: r.h / scale });
// 四隅のつまみ（tl 左上・tr 右上・bl 左下・br 右下）を (dx, dy) 動かしたときの四角。min より小さくしない
export function resizeRect(r, handle, dx, dy, min = 8) {
  let { x, y, w, h } = r;
  if (handle.includes('l')) { const nw = Math.max(min, w - dx); x += w - nw; w = nw; }
  if (handle.includes('r')) w = Math.max(min, w + dx);
  if (handle.includes('t')) { const nh = Math.max(min, h - dy); y += h - nh; h = nh; }
  if (handle.includes('b')) h = Math.max(min, h + dy);
  return { x, y, w, h };
}
const pad = (n) => String(n).padStart(2, '0');
export const defaultName = (d) => `画面 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.png`;
export function errorText(e) {
  switch (e?.name) {
    case 'NotAllowedError': case 'AbortError':
      return '画面共有が取り消されました。もう一度「撮る」を押して、撮りたい画面（このタブなど）を選んでください。';
    case 'NotSupportedError': case 'TypeError':
      return 'このブラウザでは、画面共有で撮れません。パソコンの画面写真の機能で撮ってから、ファイル マネージャへ落として取り込んでください。';
    default:
      return `画面を撮れませんでした（${e?.message || e?.name || '理由は分かりません'}）。もう一度「撮る」を押してください。`;
  }
}
