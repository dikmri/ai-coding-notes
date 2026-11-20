// スライスの帯を重ねて、回せるドット絵として描く（sprite stacking）。ライブラリなし。
// 数字はスキル sprite-stacking の「3. Render」に合わせている。

// strip: スライスを横に並べた画像（左端が地面の 1 枚目）。w, h: 1 枚の大きさ。count: 枚数。
// x, y: 足元の中心（整数に丸める）。turn: 回す角度（ラジアン）。
// squash: 縦の縮み（1 で真上、0.75 で斜め上から）。spacing: 1 枚ごとに持ち上げるドット数。
export function drawStack(ctx, strip, { w, h, count }, x, y, turn, { squash = 0.75, spacing = 1 } = {}) {
  ctx.imageSmoothingEnabled = false; // 最近傍で描く（にじませない）
  for (let z = 0; z < count; z++) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y - z * spacing)); // 1 枚ごとに上へ
    ctx.scale(1, squash);                                       // 斜め上から見た縮み
    ctx.rotate(turn);                                           // 全部の板を同じ角度で回す
    ctx.drawImage(strip, z * w, 0, w, h, -Math.floor(w / 2), -Math.floor(h / 2), w, h);
    ctx.restore();
  }
}

// 重ねたあとに 1 回だけ、1 ドットの輪郭を付ける（板ごとに付けると、継ぎ目が線になって見える）。
// work: 絵の解像度で描いた canvas。返り値: 輪郭を付けた新しい canvas。
export function withOutline(work, color = '#15121c') {
  const { width, height } = work;
  const shape = new OffscreenCanvas(width, height);
  const s = shape.getContext('2d');
  s.drawImage(work, 0, 0);
  s.globalCompositeOperation = 'source-in'; // 形だけを残して一色で塗る
  s.fillStyle = color;
  s.fillRect(0, 0, width, height);
  const out = new OffscreenCanvas(width, height);
  const o = out.getContext('2d');
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) o.drawImage(shape, dx, dy);
  o.drawImage(work, 0, 0);
  return out;
}
